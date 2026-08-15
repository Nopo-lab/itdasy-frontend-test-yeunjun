/* ─────────────────────────────────────────────────────────────
   AI DM 자동응답 — v3 디자인 (2026-04-30)
   mockup: ../mockups/03a-dm-autoreply.html
   css   : css/screens/dm-autoreply-v3.css

   - 진입 함수 시그니처 보존: window.openDMAutoreplySettings()
   - SheetAnim 사용, 모바일 우선 + PC 2열 (.dm-pc-grid)
   - 백엔드 미구현 부분은 // TODO[v1.5]: 주석 + 폴백
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  let _overlay = null;          // 시트 overlay
  let _sheet = null;            // 카드 노드
  let _settings = null;         // settings 캐시
  let _saveTimer = null;        // 디바운스 타이머
  const _draftMap = new Map();  // logId -> contenteditable 텍스트 (폴링 시 내용 보존용)
  let _inboxCarouselIdx = 0;    // 가로 카드 현재 위치(8초 새로고침 시 위치 유지용)

  /* ── 유틸 ─────────────────────────────────────────── */
  function _esc(s) { return window._esc(s); } /* [2026-06-11] 중복 제거 — app-core 정본 위임 */

  function _toast(msg, type) {
    if (window.showToast) window.showToast(msg, type);
  }

  function _haptic() { window.hapticLight?.(); }

  // ts → "방금" / "N분 전" / "N시간 전" / "MM/DD"
  function _humanTime(ts) {
    if (!ts) return '';
    const t = new Date(ts).getTime();
    if (isNaN(t)) return '';
    const diff = Math.max(0, Date.now() - t);
    const min = Math.floor(diff / 60000);
    if (min < 1) return '방금';
    if (min < 60) return `${min}분 전`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}시간 전`;
    const d = new Date(t);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  // [2026-06-25] _parseKRW(예약금 금액 파싱)는 빠른 안내(app-dm-booking-form)로 이전됨.

  // 키워드 → 카테고리 추론 (백엔드 미존재) — TODO[v1.5]: 서버 분류
  function _categoryOf(text) {
    const s = String(text || '');
    if (/예약|시간|날짜|언제|when/i.test(s)) return '예약 문의';
    if (/얼마|가격|비용|얼마예요|price|cost/i.test(s)) return '가격 문의';
    if (/어디|위치|location|address|장소/i.test(s)) return '위치 문의';
    if (/영업|운영|문여|닫|hours/i.test(s)) return '시간 문의';
    return '기타 문의';
  }

  // [v167-INTENT-MATRIX] 설계 §15.2 — intent별 기본 autonomy 매트릭스. explicit 값은 보존.
  const INTENT_AUTONOMY_DEFAULTS = {
    '가격 문의': 'auto',          // 가격표 없으면 confirm_high 로 다운그레이드 (아래 분기)
    '위치 문의': 'auto',
    '시간 문의': 'confirm_high',
    '예약 문의': 'draft',         // booking_action 도 동일
    '기타 문의': 'draft',
  };
  function _hasPriceTable() {
    try {
      const live = Array.isArray(window._serviceTemplatesCache) ? window._serviceTemplatesCache : null;
      if (live && live.some(t => Number(t && t.default_price) > 0)) return true;
      const raw = localStorage.getItem('itdasy_service_templates_cache');
      if (!raw) return false;
      const arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.some(t => Number(t && t.default_price) > 0);
    } catch (_) { return false; }
  }
  function _applyIntentDefaults(item) {
    if (!item || item.autonomy_mode) return; // explicit (서버 or 사용자 지정) 보존
    const intent = item.intent || _categoryOf(item.received_text);
    let mode = INTENT_AUTONOMY_DEFAULTS[intent] || 'draft';
    if (intent === '가격 문의' && !_hasPriceTable()) mode = 'confirm_high';
    if (item.action_required === 'booking_action') mode = 'draft'; // 위험 액션은 항상 draft
    item.autonomy_mode = mode;
  }

  /* ── 백엔드 fetch ────────────────────────────────── */
  // 2026-05-01 ── _origFetch: 글로벌 fetch wrap (자동 재시도 + 서버 불안정 토스트) 우회.
  // DM 패널은 옵셔널 데이터라 토스트 spam 안 띄우고 조용히 빈 상태로 폴백.
  // 데이터 조회: 15s (Railway cold start 대응), 저장(POST): 25s.
  function _rawFetch(url, opts = {}, timeoutMs = 15000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    // [2026-05-25] 외부에서 전달한 signal 도 존중 — abort 시 내부 ctrl 도 abort.
    if (opts && opts.signal) {
      if (opts.signal.aborted) ctrl.abort();
      else opts.signal.addEventListener('abort', () => { try { ctrl.abort(); } catch (_e) { /* ignore */ } }, { once: true });
    }
    return (window._origFetch || window.fetch)(url, { ...opts, signal: ctrl.signal })
      .finally(() => clearTimeout(timer));
  }

  async function _fetchAll() {
    const headers = window.authHeader();
    const settingsPromise = window.DmSettingsCache?.get
      ? window.DmSettingsCache.get().catch(() => null)
      : _rawFetch(apiUrl('/instagram/dm-reply/settings'), { headers })
        .then(r => (r && r.ok) ? r.json().catch(() => null) : null)
        .catch(() => null);
    const endpoints = [
      _rawFetch(apiUrl('/instagram/dm-reply/status'), { headers }).catch(() => null),
      settingsPromise,
      _rawFetch(apiUrl('/instagram/dm-reply/recent-conversations?limit=10'), { headers }).catch(() => null),
    ];
    const [sR, stR, cR] = await Promise.all(endpoints);
    const status = (sR && sR.ok) ? await sR.json().catch(() => ({})) : {};
    const settings = stR || null;
    const recent = (cR && cR.ok) ? await cR.json().catch(() => ({})) : {};
    return { status, settings, conversations: recent.conversations || [] };
  }

  // 2026-05-01 ── 백엔드 Pydantic 검증 통과 보장: invalid 값 sanitize.
  // tone enum 검증 + bool 강제. [2026-06-25] 응답 자율성 UI 제거 → autonomy_mode 전송 중단.
  function _sanitizeForSave(s) {
    const out = Object.assign({}, s || {});
    const TONES = ['friendly', 'professional', 'cute'];
    if (!TONES.includes(out.tone)) out.tone = 'friendly';
    delete out.autonomy_mode;
    out.enabled = Boolean(out.enabled);
    out.prefer_template_first = Boolean(out.prefer_template_first);
    // [2026-08-15] 손님에게 바로 답장 — bool 강제. 값이 없으면 false(안전한 쪽)로.
    out.dm_autosend_enabled = Boolean(out.dm_autosend_enabled);
    if (!Array.isArray(out.blocked_keywords)) out.blocked_keywords = [];
    if (!Array.isArray(out.sample_replies)) out.sample_replies = [];
    // [2026-06-09] 예약 양식 + 예약금 타입 방어
    out.booking_form = typeof out.booking_form === 'string' ? out.booking_form : '';
    out.booking_form_greeting = typeof out.booking_form_greeting === 'string' ? out.booking_form_greeting : '';
    out.deposit_account = typeof out.deposit_account === 'string' ? out.deposit_account : '';
    if (out.deposit_amount != null) {
      const n = parseInt(out.deposit_amount, 10);
      out.deposit_amount = (Number.isFinite(n) && n > 0) ? n : null;
    }
    return out;
  }

  // 디바운스 저장 (POST /settings)
  // [카오스] onResult(ok) — 저장 성공/실패를 호출부에 알려 낙관적 UI 롤백에 사용(하위호환: 미전달 시 기존대로 조용히).
  function _saveSettings(partial, onResult) {
    if (!_settings) return;
    Object.assign(_settings, partial);
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(async () => {
      let ok = false;
      try {
        const safe = _sanitizeForSave(_settings);
        if (window.DmSettingsCache?.save) { await window.DmSettingsCache.save(safe); ok = true; }
        else {
          const r = await _rawFetch(apiUrl('/instagram/dm-reply/settings'), {
            method: 'POST',
            headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify(safe),
          }, 25000);
          ok = !!(r && r.ok); // _rawFetch 는 4xx/5xx 에 throw 안 함 — .ok 로 실제 성공 판정
        }
      } catch (_) { ok = false; /* 네트워크·타임아웃 */ }
      if (onResult) { try { onResult(ok); } catch (_e) { void _e; } }
    }, 400);
  }

  /* ── 마크업 빌더 ──────────────────────────────────── */
  function _renderHeader() {
    return `
      <div class="dm-header">
        <button type="button" class="dm-header__back" data-act="close" aria-label="닫기">
          <svg width="14" height="14" aria-hidden="true"><use href="#ic-chevron-left"/></svg>
        </button>
        <div class="dm-header__title">DM 자동응답</div>
        <button type="button" class="dm-header__action" data-act="save">저장</button>
      </div>`;
  }

  // 통계 3개 (recent-conversations 기반 추정) — TODO[v1.5]: /stats 엔드포인트
  function _renderStats(conversations) {
    const n = conversations.length;
    const okN = conversations.filter(c => c?.reply?.ok === true).length;
    const ratio = n > 0 ? Math.round((okN / n) * 100) : 0;
    return `
      <div class="dm-activate__stats">
        <div class="dm-activate__stat">
          <div class="dm-activate__stat-value">${n}</div>
          <div class="dm-activate__stat-label">최근 7일 응답</div>
        </div>
        <div class="dm-activate__stat">
          <div class="dm-activate__stat-value">${ratio}<span style="font-size:11px;">%</span></div>
          <div class="dm-activate__stat-label">자동 처리율</div>
        </div>
        <div class="dm-activate__stat">
          <div class="dm-activate__stat-value">—</div>
          <div class="dm-activate__stat-label">평균 응답</div>
        </div>
      </div>`;
  }

  function _renderActivate(status, conversations) {
    // [2026-05-29] global_enabled === false 면 인스타 OAuth 미연결 — 토글 disabled
    const igConnected = status.global_enabled !== false;
    const on = igConnected && _settings?.enabled !== false;
    const dotCls = on ? 'dm-activate__dot' : 'dm-activate__dot dm-activate__dot--off';
    const txt = igConnected
      ? (on ? 'DM 자동응답 켜짐' : 'DM 자동응답 꺼짐')
      : '인스타그램 연결 필요';
    // 설명: 자동응답 범위(톤·시간·금지어 기준 자동 답장, 예약·위험은 검토)
    // [보안감사 M-15 2026-07-26] 실제 메커니즘은 '초안 → 확인 큐 → 원장이 발송'이다(완전자동 아님).
    //   "자동으로 답장해요" 카피는 원장이 켜두면 알아서 나가는 줄 알게 해 응대 누락 인상을 준다 → 정정.
    const desc = igConnected
      ? (on
        ? '손님 DM에 AI가 답장 초안을 만들어 드려요. 확인 후 보내면 됩니다. 톤·응답 시간·금지어를 아래에서 조절하세요.'
        : '켜면 손님 DM 답장 초안을 AI가 만들어 드려요(확인 후 발송). 톤·시간·금지어를 설정할 수 있어요.')
      : '인스타 연동 후 사용할 수 있어요.';
    return `
      <div class="dm-activate" data-dm-activate>
        <div class="dm-activate__status">
          <div class="${dotCls}"></div>
          <div style="flex:1;">
            <div class="dm-activate__status-text">${txt}</div>
            <div style="font-size:11px;color:var(--text-subtle,#8B95A1);margin-top:2px;word-break:keep-all;">${desc}</div>
          </div>
          <button type="button" class="dm-toggle ${on ? 'is-on' : ''}${igConnected ? '' : ' is-disabled'}" data-act="enable-toggle"
                  aria-pressed="${on}" aria-disabled="${!igConnected}" aria-label="DM 자동응답 켜기/끄기" style="margin-left:8px;flex-shrink:0;">
            <span class="dm-toggle__track"></span><span class="dm-toggle__knob"></span>
          </button>
        </div>
        ${_renderStats(conversations)}
      </div>`;
  }

  // [2026-05-20] 톤별 미리보기 멘트 — 카드 클릭 시 펼쳐서 보여줌 (실제 DM 응답 분위기 체감용)
  // 4가지 일상 시나리오 (인사 / 예약 가능 / 가격 문의 / 영업 외)
  const _TONE_PREVIEW = {
    friendly: [
      { ctx: '인사',        msg: '안녕하세요! 문의 주셔서 감사해요 😊' },
      { ctx: '예약 가능',   msg: '네! 그 시간 가능해요~ 예약 도와드릴게요!' },
      { ctx: '가격 문의',   msg: '시술 종류마다 달라요! 어떤 거 생각하세요?' },
      { ctx: '영업 외',     msg: '지금은 영업 시간이 아니에요~ 내일 답장 드릴게요!' },
    ],
    professional: [
      { ctx: '인사',        msg: '안녕하세요. 문의 주셔서 감사합니다.' },
      { ctx: '예약 가능',   msg: '해당 시간 예약 가능합니다. 예약 도와드릴까요?' },
      { ctx: '가격 문의',   msg: '시술별 가격은 상이합니다. 원하시는 시술 알려주시면 안내해 드리겠습니다.' },
      { ctx: '영업 외',     msg: '현재 영업시간이 아닙니다. 영업 시작 시 답변 드리겠습니다.' },
    ],
    cute: [
      { ctx: '인사',        msg: '안녕하세요~! 문의 너무 감사해요 💕' },
      { ctx: '예약 가능',   msg: '네네 가능해요!! 예약 잡아드릴게요 ✨' },
      { ctx: '가격 문의',   msg: '시술마다 달라요~! 어떤 시술 받고싶으세요? 🤔' },
      { ctx: '영업 외',     msg: '지금은 영업 시간이 아니에요 ㅠㅠ 내일 꼭 답장 드릴게요!' },
    ],
  };

  function _renderTone(settings) {
    const tone = settings.tone || 'friendly';
    const cards = [
      { id: 'friendly',     name: '친근',   short: '"네! 예약 가능해요~"' },
      { id: 'professional', name: '정중',   short: '"안녕하세요. 가능합니다."' },
      { id: 'cute',         name: '귀여움', short: '"네네 가능해요!"' },
    ];
    return `
      <div class="dm-section">
        <div class="dm-section__title">톤 보정 <span class="dm-section__help">원장님 베이스 위 살짝 조정</span></div>
        <div class="dm-tone">
          ${cards.map(c => `
            <button type="button" class="dm-tone__card ${c.id === tone ? 'is-on' : ''}" data-tone="${c.id}">
              <div class="dm-tone__icon">
                <i class="ph-duotone ph-question" style="font-size:18px" aria-hidden="true"></i>
              </div>
              <div class="dm-tone__name">${c.name}</div>
              <div class="dm-tone__sample">${c.short}</div>
            </button>
          `).join('')}
        </div>
        <div class="dm-tone-preview" id="dmTonePreview" data-current-tone="${tone}">
          ${_renderTonePreview(tone)}
        </div>
      </div>`;
  }

  // [2026-05-20] 선택된 톤의 4가지 시나리오 멘트를 말풍선으로 렌더
  function _renderTonePreview(tone) {
    const items = _TONE_PREVIEW[tone] || _TONE_PREVIEW.friendly;
    return `
      <div style="margin-top:10px;padding:12px;background:var(--surface-2,#f5f6f8);border-radius:12px;">
        <div style="font-size:11px;color:var(--text-subtle);font-weight:600;margin-bottom:8px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-1px;margin-right:3px;"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>실제 DM 응답 미리보기
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${items.map(it => `
            <div style="display:flex;align-items:flex-start;gap:8px;">
              <div style="font-size:11px;color:var(--text-subtle);font-weight:600;min-width:54px;padding-top:4px;">
                ${_esc(it.ctx)}
              </div>
              <div style="flex:1;background:var(--surface,#fff);padding:8px 10px;border-radius:12px 12px 12px 4px;font-size:12px;line-height:1.5;color:var(--text);border:0.5px solid var(--border);">
                ${_esc(it.msg)}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /* [2026-08-15] '손님에게 바로 답장' 켜기 전 동의 — confirm() 금지 규칙이라 직접 만든다.
     자체완결형(외부 CSS 의존 없음) — 이 화면이 어디서 열리든 모양이 깨지면 안 되는 UI라서. */
  function _askAutosendConsent(onAccept) {
    const prev = document.getElementById('dmAutosendConsent');
    if (prev) prev.remove();
    const ov = document.createElement('div');
    ov.id = 'dmAutosendConsent';
    ov.style.cssText = 'position:fixed;inset:0;z-index:12000;display:flex;align-items:flex-end;justify-content:center;'
      + 'background:rgba(0,0,0,.45);opacity:0;transition:opacity .18s ease;';
    ov.innerHTML = `
      <div role="dialog" aria-modal="true" aria-label="손님에게 바로 답장 켜기"
           style="width:100%;max-width:460px;background:#fff;border-radius:20px 20px 0 0;padding:22px 20px max(20px,var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
                  transform:translateY(14px);transition:transform .22s cubic-bezier(.32,.72,0,1);">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:#FEF3C7;color:#B45309;flex-shrink:0;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
          </span>
          <strong style="font-size:17px;color:#191F28;letter-spacing:-.01em;">이제 제가 손님께 바로 답장해요</strong>
        </div>
        <p style="margin:0 0 14px;font-size:13.5px;color:#4E5968;line-height:1.6;">
          지금은 제가 초안만 써두고 <b>사장님이 확인해서</b> 보내고 있어요.
          켜시면 <b>사장님 확인 없이 손님께 바로 나갑니다.</b>
        </p>
        <div style="background:#F7F8FA;border-radius:14px;padding:12px 14px;margin-bottom:14px;">
          <div style="font-size:12px;font-weight:700;color:#6B7684;margin-bottom:7px;">이런 건 여전히 사장님께 물어봐요</div>
          <ul style="margin:0;padding-left:16px;font-size:12.5px;color:#4E5968;line-height:1.75;">
            <li>예약 확정 · 결제 · 취소</li>
            <li>불만이나 거친 말이 섞인 대화</li>
            <li>손님이 마지막 말을 한 지 24시간 지난 대화</li>
          </ul>
        </div>
        <p style="margin:0 0 16px;font-size:12.5px;color:#8B95A1;line-height:1.6;">
          손님이 여러 줄로 나눠 보내면 <b>말을 멈춘 뒤 한 번만</b> 답해요.
          언제든 다시 끌 수 있고, 꺼도 초안은 계속 만들어 드려요.
        </p>
        <div style="display:flex;gap:8px;">
          <button type="button" data-consent="no"
            style="flex:1;padding:13px;border:1px solid #E5E8EB;background:#fff;color:#4E5968;font-weight:600;font-size:14px;border-radius:14px;cursor:pointer;font-family:inherit;">그냥 둘게요</button>
          <button type="button" data-consent="yes"
            style="flex:1.4;padding:13px;border:none;background:#191F28;color:#fff;font-weight:700;font-size:14px;border-radius:14px;cursor:pointer;font-family:inherit;">네, 바로 답장할게요</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => {
      ov.style.opacity = '1';
      const card = ov.firstElementChild;
      if (card) card.style.transform = 'translateY(0)';
    });
    const close = () => {
      ov.style.opacity = '0';
      setTimeout(() => ov.remove(), 180);
      if (typeof window._markSheetClosed === 'function') window._markSheetClosed('dmAutosendConsent');
    };
    // 안드로이드 뒤로가기로도 닫히게 (등록 안 하면 뒤로가기가 앱을 종료시킨다)
    if (typeof window._registerSheet === 'function') window._registerSheet('dmAutosendConsent', close);
    if (typeof window._markSheetOpen === 'function') window._markSheetOpen('dmAutosendConsent');
    ov.addEventListener('click', (e) => {
      if (e.target === ov) { close(); return; }                 // 배경 탭 = 거절(안전한 쪽)
      const b = e.target.closest('[data-consent]');
      if (!b) return;
      const yes = b.getAttribute('data-consent') === 'yes';
      close();
      if (yes) onAccept();
    });
  }

  function _renderHours(settings) {
    const start = _esc(settings.auto_reply_start || '09:00');
    const end = _esc(settings.auto_reply_end || '22:00');
    const tz = _esc(settings.timezone_name || 'Asia/Seoul');
    // [죽은토글 실구현 2026-07-27] 백엔드 auto_reply_outside_hours 신설 → 서버값으로 hydrate.
    //   예전엔 localStorage 에만 저장돼 백엔드가 아무 것도 안 하던 죽은 토글이었다. 기본 OFF(안전).
    const outsideOn = !!settings.auto_reply_outside_hours;
    const autosendOn = !!settings.dm_autosend_enabled;
    return `
      <div class="dm-section">
        <div class="dm-section__title">자동 응답 시간</div>
        <div class="dm-rows">
          <div class="dm-rows__item">
            <div class="dm-rows__label">운영 시간</div>
            <div class="dm-time">
              <input type="time" class="dm-time__input" data-field="start" value="${start}">
              <span class="dm-time__sep">~</span>
              <input type="time" class="dm-time__input" data-field="end" value="${end}">
            </div>
          </div>
          <div class="dm-rows__item">
            <div class="dm-rows__label">시간대</div>
            <div class="dm-rows__value"><b>${tz}</b> · 자동</div>
          </div>
          <div class="dm-rows__item">
            <div class="dm-rows__label">운영시간 외 응답</div>
            <div class="dm-rows__value">자리비움 메시지</div>
            <button type="button" class="dm-toggle dm-toggle--small ${outsideOn ? 'is-on' : ''}" data-act="outside-toggle" aria-pressed="${outsideOn}">
              <span class="dm-toggle__track"></span><span class="dm-toggle__knob"></span>
            </button>
          </div>
          <!-- [2026-08-15] 손님에게 직접 나가는 기능이라 켤 때 경고+동의를 받는다(_askAutosendConsent). -->
          <div class="dm-rows__item">
            <div class="dm-rows__label">손님에게 바로 답장</div>
            <div class="dm-rows__value">${autosendOn ? '켜짐 — 확인 없이 나가요' : '꺼짐 — 내가 확인 후 발송'}</div>
            <button type="button" class="dm-toggle dm-toggle--small ${autosendOn ? 'is-on' : ''}" data-act="autosend-toggle" aria-pressed="${autosendOn}">
              <span class="dm-toggle__track"></span><span class="dm-toggle__knob"></span>
            </button>
          </div>
        </div>
      </div>`;
  }

  function _renderBan(settings) {
    const txt = _esc((settings.blocked_keywords || []).join(', '));
    return `
      <div class="dm-section">
        <div class="dm-section__title">금지어 <span class="dm-section__help">쉼표로 구분</span></div>
        <textarea class="dm-ban" data-field="ban" placeholder="이 단어가 들어오면 사람이 직접 답장해요">${txt}</textarea>
      </div>`;
  }

  // [2026-06-25] 고급설정 — 기본 접힘 아코디언(표준응대·멘트관리·가격즉답). '응답 자율성'은 제거됨.
  function _renderAdvanced(settings) {
    const tplFirst = !!settings.prefer_template_first;
    return `
      <div class="dm-section">
        <button type="button" class="dm-adv-head" data-act="adv-toggle" aria-expanded="false"
          style="width:100%;display:flex;align-items:center;gap:6px;background:none;border:none;padding:0 0 6px;cursor:pointer;font-family:inherit;text-align:left;">
          <span class="dm-section__title" style="margin:0;flex:1;">고급설정 <span class="dm-section__help">스마트 응대 매뉴얼</span></span>
          <svg class="dm-adv-caret" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C9CDD4" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="transition:transform .2s;"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <div class="dm-rows dm-adv-body" hidden>
          <div class="dm-rows__item">
            <div style="flex:1;">
              <div class="dm-rows__label" style="font-weight:700;color:#222;">표준 응대 우선</div>
              <div style="font-size:11px;color:#888;margin-top:3px;line-height:1.45;">
                자주 쓰는 답장은 미리 등록해두고, 헷갈릴 때만 AI 가 새로 작성해요.<br>
                인사·가격·시간·위치·후기 같은 단순 문의는 저장된 멘트로 즉시 답장. 예약·위험 메시지는 AI 가 처리.
              </div>
            </div>
            <button type="button" class="dm-toggle dm-toggle--small ${tplFirst ? 'is-on' : ''}" data-act="tplfirst-toggle" aria-pressed="${tplFirst}">
              <span class="dm-toggle__track"></span><span class="dm-toggle__knob"></span>
            </button>
          </div>
          <div class="dm-rows__item">
            <div style="flex:1;">
              <div class="dm-rows__label">상황별 멘트 관리</div>
              <div style="font-size:11px;color:#888;margin-top:3px;">사장 톤 분석 또는 정중 톤 기본값으로 6종 자동 채움</div>
            </div>
            <button type="button" data-act="open-manual-replies" style="background:#F7EFF0;border:1px solid #F0DADF;color:#BC6675;padding:7px 12px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">멘트 관리 →</button>
          </div>
          <div class="dm-rows__item">
            <div style="flex:1;">
              <div class="dm-rows__label" style="font-weight:700;color:#222;">가격 문의 즉답</div>
              <div style="font-size:11px;color:#888;margin-top:3px;line-height:1.45;">시술 가격표 등록 시 가격 문의에 자동 답장</div>
            </div>
            <button type="button" class="dm-toggle dm-toggle--small" id="dmPricingToggleBtn" data-act="pricing-toggle" aria-pressed="false">
              <span class="dm-toggle__track"></span><span class="dm-toggle__knob"></span>
            </button>
          </div>
        </div>
      </div>`;
  }

  /* ── DM 카드 ───────────────────────────────────── */
  // 말풍선 1개(읽기전용) — role: 'customer' | 'shop'
  function _bubbleRow(role, text, at) {
    const txt = _esc(text || '');
    const t = at ? new Date(at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';
    if (role === 'shop') {
      return `
        <div class="dm-thread__row dm-thread__row--sent">
          <div class="dm-bubble dm-bubble--sent">${txt}</div>
          <div class="dm-thread__avatar dm-thread__avatar--shop">원</div>
        </div>
        <div class="dm-thread__time-row dm-thread__time-row--sent">
          <span class="dm-thread__time">${_esc(t)}</span>
        </div>`;
    }
    return `
      <div class="dm-thread__row dm-thread__row--received">
        <div class="dm-thread__avatar">고</div>
        <div class="dm-bubble dm-bubble--received">${txt}</div>
      </div>
      <div class="dm-thread__time-row dm-thread__time-row--received">
        <span class="dm-thread__time">${_esc(t)}</span>
      </div>`;
  }

  function _renderThread(conv, tail, logId) {
    // 1순위: 방금 수정/생성한 로컬 메모리(_draftMap), 2순위: 서버의 답장(text), 3순위: 서버의 초안(ai_draft_text)
    const draft = _esc(_draftMap.get(logId) || conv.reply?.text || conv.ai_draft_text || '');
    const msgs = Array.isArray(conv.messages) ? conv.messages : [];

    // 진행 중 대화(최근 N턴) 읽기전용 말풍선. 없으면 기존 단일 손님 메시지로 폴백(하위호환).
    let history;
    if (msgs.length) {
      history = msgs.map(m => _bubbleRow(m.role, m.text, m.at)).join('');
    } else {
      history = _bubbleRow('customer', conv.received_text || '', conv.ts || '');
    }

    return `
      <div class="dm-thread">
        ${history}
        <div class="dm-thread__row dm-thread__row--sent">
          <div class="dm-bubble dm-bubble--sent is-draft" contenteditable="true" data-tail="${_esc(tail)}" data-placeholder="여기에 답장을 입력하세요">${draft}</div>
          <div class="dm-thread__avatar dm-thread__avatar--shop">원</div>
        </div>
        <div class="dm-thread__time-row dm-thread__time-row--sent">
          <span class="dm-thread__time is-draft">초안 · 보내기 대기</span>
        </div>
      </div>`;
  }

  function _renderMiniTone(activeTone) {
    const tones = [
      { id: 'friendly', name: '친근' },
      { id: 'professional', name: '정중' },
      { id: 'cute', name: '귀여움' },
    ];
    return `
      <div class="dm-mini-tone">
        <div class="dm-mini-tone__label">이 답장만</div>
        <div class="dm-mini-tone__chips">
          ${tones.map(t => `
            <button type="button" class="dm-mini-tone__chip ${t.id === activeTone ? 'is-on' : ''}" data-tone="${t.id}">${t.name}</button>
          `).join('')}
        </div>
        <button type="button" class="dm-mini-tone__regen" data-act="regen">↻ 다시</button>
      </div>`;
  }

  // [Feature 1] 손님 맥락 카드 렌더링 — conv.customer_context 있을 때만
  function _renderCustomerContext(ctx) {
    if (!ctx) return '';
    const name = _esc(ctx.name || '');
    const badgeHtml = ctx.is_regular
      ? '<span style="font-size:11px;background:#10B981;color:#fff;padding:2px 8px;border-radius:99px;font-weight:700;margin-left:4px;">단골</span>'
      : (ctx.visit_count === 1
        ? '<span style="font-size:11px;background:#3B82F6;color:#fff;padding:2px 8px;border-radius:99px;font-weight:700;margin-left:4px;">신규</span>'
        : '');
    const lastInfo = (ctx.days_since_last_visit != null && ctx.last_service)
      ? `<span style="font-size:11px;color:rgba(255,255,255,0.6);margin-right:8px;">${ctx.days_since_last_visit}일 전 ${_esc(ctx.last_service)}</span>`
      : '';
    const visitInfo = ctx.visit_count != null
      ? `<span style="font-size:11px;color:rgba(255,255,255,0.6);">${ctx.visit_count}회 방문</span>`
      : '';
    const memoHtml = ctx.memo_snippet
      ? `<div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px;">${_esc(ctx.memo_snippet)}</div>`
      : '';
    return `
      <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 10px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;">
          <span style="font-weight:700;color:#fff;font-size:13px;">${name}님</span>
          ${badgeHtml}
        </div>
        <div style="display:flex;flex-wrap:wrap;margin-top:4px;">${lastInfo}${visitInfo}</div>
        ${memoHtml}
      </div>`;
  }

  // [2026-06-10] 예약 단계 배지 + 칩(옵션) + 캘린더 확인 줄 + 칩 수정 인라인
  // [2026-06-25] 손님 인스타 1:1 스레드 점프 — ig.me/m/{username}, 없으면 인스타 inbox 폴백.
  //   외톨이 사진 카드·예약 카드(참고 사진) 공용 1곳. (사진 바이트 표시 X — 만료 URL, 링크만)
  // [2026-06-26] 공용 헬퍼(js/dm/ig-thread-link.js)에 위임 — 중복 제거. 미로드 시 inbox 폴백.
  function _igThreadLink(conv) {
    return window.itdasyIgThreadLink
      ? window.itdasyIgThreadLink(conv)
      : 'https://www.instagram.com/direct/inbox/';
  }
  function _photoNoticeHtml(conv) {
    return `
      <a href="${_igThreadLink(conv)}" target="_blank" rel="noopener"
        style="display:flex;align-items:center;gap:6px;padding:8px 10px;margin:6px 0 2px;background:#F2F4F6;border:1px solid #E5E8EB;border-radius:8px;color:#4E5968;text-decoration:none;font-size:11.5px;font-weight:600;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
        <span style="flex:1;">참고 사진 보냄 · 인스타에서 보기</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
      </a>`;
  }

  function _renderCard(conv, activeTone) {
    const tail = (conv.sender_tail || '????').slice(-4);
    const name = conv.sender_username || `손님 …${tail}`;
    const cat = _categoryOf(conv.received_text);
    const time = _humanTime(conv.ts);
    const logId = conv.id != null ? String(conv.id) : '';
    const status = conv.reply?.status || '';
    const pending = status === 'pending_confirm';
    const actReq = conv.action_required || '';
    const actMeta = conv.action_meta || {};
    const isBookingAction = actReq === 'booking_action';
    const calChecked = !!actMeta.calendar_checked;
    const isDepositPending = !!actMeta.awaiting_deposit && !actMeta.deposit_sent;
    const isDepositSent    = !!actMeta.deposit_sent;
    const showAltBtn = isBookingAction && calChecked && !actMeta.slot_available
      && !isDepositPending && !isDepositSent;

    // ── [2026-06-12] 예약 양식 미설정 유도 — booking 카드인데 booking_form 없으면 상단 인라인 안내.
    const _intentNow = conv.intent || _categoryOf(conv.received_text);
    const _isBookingCard = _intentNow === 'booking' || _intentNow === '예약 문의'
      || isBookingAction || isDepositPending || isDepositSent;
    const _noForm = !((_settings && (_settings.booking_form || '')).toString().trim());
    const formNotice = (_isBookingCard && _noForm) ? `
      <div style="display:flex;align-items:center;gap:8px;justify-content:space-between;padding:9px 11px;background:#FFF7ED;border:1px solid #FDBA74;border-radius:10px;margin:0 0 8px;">
        <span style="font-size:11.5px;color:#9A3412;font-weight:600;line-height:1.4;word-break:keep-all;">예약 양식을 만들어두면 잇비가 자동으로 보내드려요</span>
        <button type="button" data-act="goto-booking-form" style="flex-shrink:0;background:#EA580C;color:#fff;border:none;border-radius:8px;padding:6px 11px;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;">양식 만들기</button>
      </div>` : '';

    // ── [5] 캘린더 확인 줄 (booking 카드 전용)
    const calLine = (calChecked && actMeta.slot_available != null) ? `
      <div style="display:flex;align-items:center;gap:5px;font-size:11px;margin:4px 0 2px;${actMeta.slot_available ? 'color:#166534;' : 'color:#B91C1C;'}">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
        ${actMeta.slot_available
          ? `캘린더 확인 · ${_esc(actMeta.time_kst || actMeta.requested_time || '')} 비어있음`
          : `캘린더 확인 · ${_esc(actMeta.time_kst || actMeta.requested_time || '')} 이미 예약 있음`}
      </div>` : '';

    // ── [6] 옵션·메모 칩 (수정 가능)
    const chips = [];
    if (actMeta.name)    chips.push({ key: 'customer_name', label: actMeta.name, prefix: '성함' });
    if (actMeta.phone)   chips.push({ key: 'phone',         label: actMeta.phone, prefix: '연락처' });
    const rt = actMeta.time_kst || actMeta.requested_time || '';
    if (rt)              chips.push({ key: 'requested_time', label: rt, prefix: '시간' });
    if (actMeta.service_name) chips.push({ key: 'service_name', label: actMeta.service_name, prefix: '시술' });
    const opts = actMeta.service_options || {};
    if (opts.length)  chips.push({ key: 'length', label: opts.length, prefix: '인치', opts: true });
    if (opts.color)   chips.push({ key: 'color',  label: opts.color,  prefix: '색상', opts: true });
    if (opts.remove)  chips.push({ key: 'remove', label: opts.remove, prefix: '제거', opts: true });
    if (opts.design)  chips.push({ key: 'design', label: opts.design, prefix: '디자인', opts: true });
    if (actMeta.memo) chips.push({ key: 'memo', label: actMeta.memo, prefix: '요청', opts: false });
    // [2026-06-25 FE-1] 사진 받음 칩 — BE action_meta.photo_attached/photo_count 표시(편집 X, dm-chip 미사용).
    //   사진 캡션 텍스트는 안 섞음(사진은 사진칩으로만). lucide image 아이콘.
    const photoChip = actMeta.photo_attached ? `
      <span class="dm-chip-photo" style="display:inline-flex;align-items:center;gap:4px;background:#EEF2FF;color:#3730A3;padding:4px 9px;border-radius:999px;font-size:11.5px;font-weight:600;word-break:keep-all;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
        사진 ${Math.max(1, Number(actMeta.photo_count) || 1)}장 받음
      </span>` : '';
    const chipsHtml = (chips.length || photoChip) ? `
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin:6px 0 2px;">
        ${chips.map(c => `<span class="dm-chip" data-chip-key="${_esc(c.key)}" data-chip-opts="${!!c.opts}" title="탭하면 수정"
          style="display:inline-flex;align-items:center;gap:3px;background:#F2F4F6;color:#4E5968;padding:4px 9px;border-radius:999px;font-size:11.5px;font-weight:600;cursor:pointer;word-break:keep-all;">
          <span style="color:#8B95A1;font-size:10.5px;">${_esc(c.prefix)}</span> ${_esc(c.label)}
        </span>`).join('')}
        ${photoChip}
      </div>` : '';

    // ── 단계 배지
    let stageInfo = '';
    if (isBookingAction) {
      const timeStr = actMeta.time_kst || actMeta.requested_time || '';
      const svcStr  = actMeta.service_name || '';
      stageInfo = `
        <div style="display:flex;flex-direction:column;gap:4px;padding:8px 10px;background:#FFF3CD;border:1px solid #F59E0B;border-radius:8px;margin:8px 0;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#92400E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/></svg>
            <span style="font-size:11px;font-weight:800;color:#92400E;">예약 확정 대기</span>
          </div>
          ${timeStr ? `<div style="font-size:11.5px;color:#92400E;font-weight:700;">${_esc(timeStr)}${svcStr ? ' · ' + _esc(svcStr) : ''}</div>` : ''}
          ${calLine}
        </div>`;
    } else if (isDepositSent) {
      stageInfo = `
        <div style="display:flex;align-items:center;gap:6px;padding:8px 10px;background:#EFF6FF;border:1px solid #93C5FD;border-radius:8px;margin:8px 0;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20M7 15h.01M11 15h2"/></svg>
          <span style="font-size:11px;font-weight:700;color:#1D4ED8;">예약금 입금 대기 중</span>
        </div>`;
    } else if (isDepositPending) {
      stageInfo = `
        <div style="display:flex;align-items:center;gap:6px;padding:8px 10px;background:#F0FDF4;border:1px solid #86EFAC;border-radius:8px;margin:8px 0;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#166534" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
          <span style="font-size:11px;font-weight:700;color:#166534;">예약금 안내 전송 대기</span>
        </div>`;
    } else if (calChecked) {
      stageInfo = `<div style="margin:6px 0 2px;">${calLine}</div>`;
    }

    // ── 참고 사진 줄 — 예약 카드(photo_attached) 또는 외톨이(photo_only) 공통. 인스타 점프만.
    const photoLine = (actMeta.photo_attached || actMeta.photo_only) ? _photoNoticeHtml(conv) : '';

    // ── 버튼
    let sendLabel, sendStyle = '';
    if (isBookingAction)    { sendLabel = '예약 확정 (캘린더 등록 + 확정 DM 발송)'; sendStyle = 'background:#2B3A67;color:#fff;border-color:#2B3A67;'; }
    else if (isDepositSent) { sendLabel = '답장 발송'; }
    else if (isDepositPending) { sendLabel = '예약금 안내 전송'; sendStyle = 'background:#166534;color:#fff;border-color:#166534;'; }
    else                    { sendLabel = '답장 발송'; }

    return `
      <div class="dm-card is-pending" data-tail="${_esc(tail)}" data-log-id="${_esc(logId)}" data-status="${_esc(status)}" data-action="${_esc(actReq)}">
        ${_renderCustomerContext(conv.customer_context || null)}
        <div class="dm-card__top">
          <div class="dm-card__avatar">고</div>
          <div class="dm-card__name" style="cursor:pointer;" data-act="open-customer" data-cust-id="${conv.customer_id || ''}">${_esc(name)}</div>
          <div class="dm-card__time">${_esc(time)}</div>
          <div class="dm-card__pending-badge">${pending ? '검토 대기' : '학습 피드백'}</div>
        </div>
        <div><span class="dm-card__cat">${_esc(cat)}</span></div>
        ${formNotice}
        ${_renderThread(conv, tail, logId)}
        ${chipsHtml}
        ${stageInfo}
        ${photoLine}
        ${_renderMiniTone((logId && _userToneByLog.get(logId)) || activeTone)}
        <div class="dm-actions" style="display:flex;flex-direction:column;gap:6px;">
          <button type="button" class="dm-action is-send" data-act="send"
            style="width:100%;justify-content:center;${sendStyle}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;"><path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7Z"/></svg>
            ${sendLabel}
          </button>
          ${showAltBtn ? `<button type="button" class="dm-action" data-act="alt" style="width:100%;justify-content:center;background:#FFFBEB;color:#92400E;border:1px solid #F59E0B;">불가 및 대안 시간 제안</button>` : ''}
          <div style="display:flex;gap:6px;">
            <button type="button" class="dm-action is-reject" data-act="reject"
              style="flex:1;justify-content:center;" title="카드 닫기 (손님 정보 보존)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
              닫기
            </button>
            <button type="button" class="dm-action" data-act="reset-conversation"
              style="flex:1;justify-content:center;background:#FEF2F2;color:#DC2626;border:1px solid #FCA5A5;" title="대화 초기화 (성함·예약 정보 삭제)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
              대화 초기화
            </button>
          </div>
        </div>
      </div>`;
  }

  // [Feature 4] 리텐션 원클릭 DM — inbox 상단 섹션
  function _renderRetention() {
    return `
      <div class="dm-section" id="dmRetentionSection">
        <div class="dm-section__title">리텐션 DM</div>
        <button type="button" data-act="open-retention"
          style="width:100%;padding:11px;border-radius:12px;border:1px solid rgba(255,255,255,0.15);
            background:rgba(255,255,255,0.07);color:#fff;font-size:13px;font-weight:600;cursor:pointer;
            display:flex;align-items:center;justify-content:center;gap:6px;">
          <i class="ph-duotone ph-clock" style="font-size:15px" aria-hidden="true"></i>
          45일+ 안 오신 손님 보기
        </button>
        <div id="dmRetentionList" style="margin-top:8px;"></div>
      </div>`;
  }

  function _renderRetentionList(customers) {
    if (!customers || !customers.length) {
      return '<div style="font-size:12px;color:rgba(255,255,255,0.5);padding:8px 0;">해당하는 손님이 없어요.</div>';
    }
    const sendable = customers.filter(c => c.can_send_dm);
    const rows = customers.map(c => {
      const lastVisit = c.last_visit_at ? new Date(c.last_visit_at).toLocaleDateString('ko-KR') : '—';
      const dmPart = c.can_send_dm
        ? `<button type="button" data-act="retention-send" data-cust-id="${_esc(String(c.customer_id || ''))}"
              style="font-size:11px;background:#10B981;color:#fff;border:none;border-radius:8px;padding:4px 10px;cursor:pointer;font-weight:700;white-space:nowrap;">DM 발송</button>`
        : `<span style="font-size:11px;color:rgba(255,255,255,0.4);white-space:nowrap;">인스타 미연결</span>`;
      return `
        <div style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.07);">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:13px;color:#fff;">${_esc(c.name || '이름 없음')}</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:2px;">마지막 방문: ${lastVisit}</div>
            ${c.dm_preview ? `<div style="font-size:11px;color:rgba(255,255,255,0.6);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(c.dm_preview)}</div>` : ''}
          </div>
          ${dmPart}
        </div>`;
    }).join('');
    const bulkBtn = sendable.length > 0
      ? `<button type="button" data-act="retention-bulk-send" data-count="${sendable.length}"
            style="margin-top:10px;width:100%;padding:11px;border-radius:12px;border:none;
              background:#BC6675;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">
            전체 발송 (${sendable.length}명)
          </button>`
      : '';
    return rows + bulkBtn;
  }

  function _renderInbox(conversations, activeTone) {
    if (!conversations.length) {
      return `
        <div class="dm-section">
          <div class="dm-section__title">DM 검토 대기</div>
          <div class="dm-rows" style="padding:24px 14px;text-align:center;color:var(--text-subtle);font-size:12px;">
            대기 중인 DM이 없어요
          </div>
        </div>`;
    }
    // 카드 2개 이상 → 가로 넘김(캐러셀) + 닷. 1개면 기존 그대로.
    const multi = conversations.length > 1;
    const cards = conversations.map(c => _renderCard(c, activeTone)).join('');
    const dots = multi
      ? `<div class="dm-inbox__dots">${
          conversations.map((_, i) =>
            `<button type="button" class="dm-inbox__dot${i === 0 ? ' is-active' : ''}" data-idx="${i}" aria-label="${i + 1}번째 카드"></button>`
          ).join('')
        }</div>`
      : '';
    const countBadge = multi ? ` <span class="dm-inbox__count">${conversations.length}건</span>` : '';
    return `
      <div class="dm-section">
        <div class="dm-section__title">DM 검토 대기${countBadge} <span class="dm-section__help">예약 승인 · 대안 시간 · 거절</span></div>
        <div class="dm-inbox${multi ? ' dm-inbox--carousel' : ''}">
          ${cards}
        </div>
        ${dots}
      </div>`;
  }

  /* ── 카드 액션 핸들러 ───────────────────────────── */
  async function _sendFeedback(tail, kind) {
    try {
      await apiFetch('/instagram/dm-reply/feedback', {
        method: 'POST',
        headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ tail, [kind]: true }),
      });
    } catch (_) { /* 조용히 실패 */ }
  }

  async function _handleSend(card) {
    const tail = card.dataset.tail;
    const logId = card.dataset.logId;
    const status = card.dataset.status;
    const action = card.dataset.action || '';
    _haptic();

    // 2026-05-01 ── pending_confirm (AI 초안) 또는 received (broadcast/수동 답장 가능) 둘 다 발송 가능.
    const sendable = (status === 'pending_confirm' || status === 'received' || status === '') && logId;
    if (sendable) {
      const draftEl = card.querySelector('.dm-bubble--sent.is-draft');
      const editedText = (draftEl?.textContent || '').trim();
      const sendBtn = card.querySelector('[data-act="send"]');
      if (sendBtn) { sendBtn.disabled = true; sendBtn.style.opacity = '0.6'; }
      try {
        let url, body;
        // [2026-05-02 Phase 1.2++] action_required 카드는 /send 호출 → 자동 액션 실행
        // (Booking 생성 + 캘린더 등록 + 손님에게 확정 DM 자동 발송).
        // 일반 카드는 /send_edit 으로 수정한 텍스트만 발송.
        if (action) {
          url = `/dm-confirm-queue/${encodeURIComponent(logId)}/send`;
          body = JSON.stringify({ selected_index: 0 });
        } else {
          if (!editedText) {
            _toast('답장 내용을 먼저 입력해주세요');
            draftEl?.focus();
            if (sendBtn) { sendBtn.disabled = false; sendBtn.style.opacity = '1'; }
            return;
          }
          url = `/dm-confirm-queue/${encodeURIComponent(logId)}/send_edit`;
          body = JSON.stringify({ edited_reply: editedText });
        }
        const res = await apiFetch(url, {
          method: 'POST',
          headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
          body,
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.detail || ('HTTP ' + res.status));
        _toast(d.message || '처리 완료');
        _sendFeedback(tail, 'good');
        // [2026-06-08] 홈 '고객 메시지' 카드 자동 제거용 — 답장 전송 성공 알림(sender tail 전달).
        try { window.dispatchEvent(new CustomEvent('itdasy:dm-replied', { detail: { tail } })); } catch (_e) { void _e; }
        card.classList.add('is-sending');
        setTimeout(() => {
          card.remove();
          if (window.refreshDMQueueBadge) window.refreshDMQueueBadge();
          _notifyDMChanged();
        }, 460);
      } catch (e) {
        _toast('발송 실패: ' + (e.message || ''));
        if (sendBtn) { sendBtn.disabled = false; sendBtn.style.opacity = '1'; }
      }
      return;
    }

    // 이미 발송된 메시지 (status='sent') — 학습 피드백만
    _sendFeedback(tail, 'good');
    card.classList.add('is-sending');
    setTimeout(() => card.remove(), 460);
  }

  // X(닫기) — 카드만 목록에서 숨김. pending_slots·손님 정보 보존 → 다음 메시지 이어짐.
  async function _handleReject(card) {
    const tail = card.dataset.tail;
    const logId = card.dataset.logId;
    _haptic();
    _sendFeedback(tail, 'bad');
    card.style.transform = 'translateX(-120%)';
    card.classList.add('is-sending');
    setTimeout(() => card.remove(), 460);
    if (logId) {
      try {
        // reset 파라미터 없음 → 기본 false → 슬롯 보존
        const res = await apiFetch(`/dm-confirm-queue/${encodeURIComponent(logId)}/discard`, {
          method: 'POST', headers: window.authHeader(),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          _toast('닫기 실패: ' + (d.detail || res.status));
        }
      } catch (e) { _toast('닫기 실패: ' + (e.message || 'fetch')); }
    }
    _notifyDMChanged();
  }

  // "대화 초기화" — 확인 팝업 → [지우기] 확정 시에만 reset=true 로 슬롯 초기화
  async function _handleResetConversation(card) {
    const logId = card.dataset.logId;
    _haptic();
    const confirmed = await window.nativeConfirm(
      '대화 초기화',
      '이 손님의 대화를 초기화할까요?\n받아둔 성함·연락처·예약 정보가 모두 사라져요.'
    ).catch(() => false);
    if (!confirmed) return;
    // 카드 애니메이션
    card.style.transform = 'translateX(-120%)';
    card.classList.add('is-sending');
    setTimeout(() => card.remove(), 460);
    if (logId) {
      try {
        const res = await apiFetch(
          `/dm-confirm-queue/${encodeURIComponent(logId)}/discard?reset=true`,
          { method: 'POST', headers: window.authHeader() }
        );
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          _toast('초기화 실패: ' + (d.detail || res.status));
        } else {
          _toast('대화가 초기화됐어요');
        }
      } catch (e) { _toast('초기화 실패: ' + (e.message || 'fetch')); }
    }
    _notifyDMChanged();
  }

  // [2026-05-22] logId → 사장님이 카드별로 선택한 톤 보존. polling 재렌더 시에도 유지.
  const _userToneByLog = new Map();

  function _handleMiniTone(card, tone) {
    const logId = card.dataset.logId;
    if (logId) _userToneByLog.set(String(logId), tone);
    card.querySelectorAll('.dm-mini-tone__chip').forEach(ch => {
      ch.classList.toggle('is-on', ch.dataset.tone === tone);
    });
    // [2026-05-22] 사장 보고: 톤 누르면 그 톤 답장이 와야 함. UI 만 토글하던 옛 동작 변경.
    // _handleRegen 이 카드의 .is-on 칩 dataset.tone 으로 BE regenerate 호출.
    try { _handleRegen(card).catch(() => {}); } catch (_e) { void _e; }
  }

  const _regenInFlight = new Set();  // logId별 중복 호출 방지
  // [2026-05-25] 톤별 결과 캐시 — 같은 logId + tone 조합은 즉시 표시 (BE 호출 생략).
  //   key: `${logId}::${tone}` · value: 생성된 텍스트
  const _toneCache = new Map();
  // [2026-05-25] 진행 중 AbortController — 사용자가 빠르게 다른 톤 누르면 이전 호출 취소.
  const _regenAbort = new Map();
  // [2026-05-25] 진행 메시지 점진적 업데이트 (체감 속도 개선) — interval id 보관.
  const _regenTickers = new Map();

  async function _handleRegen(card) {
    // [2026-05-02 Phase 1.2++] 진짜 백엔드 호출 — fake hardcoded 제거.
    // POST /dm-confirm-queue/{log_id}/regenerate { tone } → 시간 컨텍스트 가드레일 보존.
    const logId = card.dataset.logId;
    const regenKey = String(logId || '');
    if (!logId) {
      _toast('재생성하려면 먼저 메시지가 큐에 등록되어야 해요');
      return;
    }
    const toneBtn = card.querySelector('.dm-mini-tone__chip.is-on');
    const tone = toneBtn ? toneBtn.dataset.tone : 'friendly';
    const draftEl = card.querySelector('.dm-bubble--sent.is-draft');
    if (!draftEl) return;
    const orig = draftEl.textContent;

    // [2026-05-25] 캐시 hit → 즉시 표시. BE 왕복 0초.
    const cacheKey = `${regenKey}::${tone}`;
    if (_toneCache.has(cacheKey)) {
      const cached = _toneCache.get(cacheKey);
      draftEl.textContent = cached;
      draftEl.style.color = '';
      _draftMap.set(regenKey, cached);
      _haptic();
      return;
    }

    // 이미 같은 톤 생성 중이면 무시, 다른 톤 생성 중이면 이전 호출 abort.
    if (regenKey && _regenInFlight.has(regenKey)) {
      const prevAbort = _regenAbort.get(regenKey);
      if (prevAbort) { try { prevAbort.abort(); } catch (_e) { /* ignore */ } }
    }

    if (orig === '생성 중...' || orig === '생성 중…') {
      // 메시지만 갈아끼우고 계속 진행
    }

    const tickerMessages = [
      '톤 바꿔서 다시 쓰는 중…',
      '말투 보정 중…',
      '곧 도착해요…',
    ];
    let tickIdx = 0;
    draftEl.textContent = tickerMessages[0];
    draftEl.style.color = '#aaa';
    _draftMap.set(regenKey, tickerMessages[0]);

    // 점진적 메시지 — 2초 간격으로 갱신해서 멈춰있다는 인상 없게.
    const tickId = setInterval(() => {
      tickIdx = Math.min(tickerMessages.length - 1, tickIdx + 1);
      const liveCard = document.querySelector(`.dm-card[data-log-id="${CSS.escape(logId)}"]`);
      const liveEl = liveCard ? liveCard.querySelector('.dm-bubble--sent.is-draft') : null;
      if (liveEl) liveEl.textContent = tickerMessages[tickIdx];
    }, 2000);
    _regenTickers.set(regenKey, tickId);

    _regenInFlight.add(regenKey);
    const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    if (ctrl) _regenAbort.set(regenKey, ctrl);
    const regenBtn = card.querySelector('[data-act="regen"]');
    if (regenBtn) {
      regenBtn.disabled = true;
      regenBtn.textContent = '생성 중…';
    }
    _haptic();
    try {
      const res = await _rawFetch(apiUrl(`/dm-confirm-queue/${encodeURIComponent(logId)}/regenerate`), {
        method: 'POST',
        headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ tone }),
        signal: ctrl ? ctrl.signal : undefined,
      }, 25000);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.detail || ('HTTP ' + res.status));

      // 서버 응답에서 새 텍스트 추출 (다양한 필드명 대응)
      const newText = d.ai_draft_text || d.text || d.reply_text || d.draft || d.generated_text || '';

      // 폴링이 카드를 재렌더했을 수 있으므로 logId 로 최신 DOM 다시 조회
      const liveCard = document.querySelector(`.dm-card[data-log-id="${CSS.escape(logId)}"]`);
      const liveEl = liveCard ? liveCard.querySelector('.dm-bubble--sent.is-draft') : draftEl;

      if (newText) {
        _toneCache.set(cacheKey, newText);   // 캐시 저장 → 다음 같은 톤은 즉시 표시
        _draftMap.set(regenKey, newText);
        if (liveEl) {
          liveEl.textContent = newText;
          liveEl.style.color = '';
        }
      } else {
        _draftMap.delete(regenKey);
        if (liveEl) {
          liveEl.textContent = orig;
          liveEl.style.color = '';
        }
        _toast('새 답장이 비어 있어요. 다시 눌러주세요.');
      }
      if (d.guarded) _toast('✓ 시간 정보 유지');
    } catch (e) {
      // AbortError = 사용자가 다른 톤으로 빠르게 전환한 경우. 토스트 생략.
      if (e && e.name === 'AbortError') {
        return;
      }
      _draftMap.delete(regenKey);
      const liveCard2 = document.querySelector(`.dm-card[data-log-id="${CSS.escape(logId)}"]`);
      const liveEl2 = liveCard2 ? liveCard2.querySelector('.dm-bubble--sent.is-draft') : draftEl;
      if (liveEl2) {
        liveEl2.textContent = orig;
        liveEl2.style.color = '';
      }
      _toast('재생성 실패: ' + (e.message || ''));
    } finally {
      const t = _regenTickers.get(regenKey);
      if (t) { clearInterval(t); _regenTickers.delete(regenKey); }
      _regenAbort.delete(regenKey);
      _regenInFlight.delete(regenKey);
      const liveCard3 = document.querySelector(`.dm-card[data-log-id="${CSS.escape(logId)}"]`);
      const liveBtn = liveCard3 ? liveCard3.querySelector('[data-act="regen"]') : regenBtn;
      if (liveBtn) {
        liveBtn.disabled = false;
        liveBtn.textContent = '↻ 다시';
      }
    }
  }

  // [2026-05-02 Phase 1.2++] 불가 및 대안 시간 제안 — booking_action+calendar_checked 카드만
  function _handleAlt(card) {
    const logId = card.dataset.logId;
    if (!logId) return;
    // [2026-06-10] confirm → _askConfirm (인라인 다이얼로그)
    window._askConfirm('이 시간 거절하고 대안 시간을 손님에게 안내할까요?', async () => {
      _haptic();
      try {
        const res = await apiFetch(`/dm-confirm-queue/${encodeURIComponent(logId)}/decline-with-alternatives`, {
          method: 'POST', headers: window.authHeader(),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.detail || ('HTTP ' + res.status));
        _toast(d.message || `대안 시간 안내 발송 (${d.alternatives_sent || 0}개)`);
        card.classList.add('is-sending');
        setTimeout(() => { card.remove(); _notifyDMChanged(); }, 460);
      } catch (e) {
        _toast('실패: ' + (window._humanError ? window._humanError(e) : (e.message || '')));
      }
    });
  }

  function _bindCard(card) {
    // [2026-05-12 QA #6] inbox 폴링 시 동일 card element 재바인딩 방어 — 한 번만 바인딩.
    if (card.dataset.bound === '1') return;
    card.dataset.bound = '1';
    card.querySelector('[data-act="send"]')?.addEventListener('click', () => _handleSend(card));
    // [2026-06-12] 예약 양식 미설정 안내 → 같은 시트의 양식 섹션으로 스크롤 + 포커스 (팝업 없이 인라인 이동).
    card.querySelector('[data-act="goto-booking-form"]')?.addEventListener('click', () => {
      // [2026-06-25] 예약 양식은 빠른 안내로 이전 → 빠른 안내 열고 '예약하기' 펼침
      _haptic();
      if (typeof window.openDMMenuSettings === 'function') {
        window.openDMMenuSettings('BOOK_FORM');
      } else {
        _toast('빠른 안내에서 예약 양식을 만들어주세요');
      }
    });
    card.querySelector('[data-act="reject"]')?.addEventListener('click', () => _handleReject(card));
    card.querySelector('[data-act="reset-conversation"]')?.addEventListener('click', () => _handleResetConversation(card));
    card.querySelector('[data-act="regen"]')?.addEventListener('click', () => _handleRegen(card));
    card.querySelector('[data-act="alt"]')?.addEventListener('click', () => _handleAlt(card));
    
    // 고객 상세 열기 연동
    card.querySelector('[data-act="open-customer"]')?.addEventListener('click', (e) => {
      const cid = e.currentTarget.dataset.custId;
      if (cid && window.openCustomerDashboard) {
        window.openCustomerDashboard(cid);
      } else {
        _toast('연동된 고객 정보가 없습니다.');
      }
    });

    // [2026-06-10 BUG-7] 칩 인라인 수정 — 탭 → input → blur/Enter 저장
    card.querySelectorAll('.dm-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        if (chip.querySelector('input')) return; // 이미 편집 중
        const key = chip.dataset.chipKey;
        const isOpts = chip.dataset.chipOpts === 'true';
        const oldVal = chip.textContent.trim().split(' ').slice(1).join(' '); // prefix 제거
        const input = document.createElement('input');
        input.value = oldVal;
        input.style.cssText = 'width:80px;border:none;outline:none;background:transparent;font-size:11.5px;font-weight:600;color:#191F28;';
        chip.innerHTML = '';
        chip.appendChild(input);
        input.focus(); input.select();
        const save = async () => {
          const val = input.value.trim();
          chip.textContent = chip.dataset.chipKey.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()); // fallback
          if (!val || val === oldVal || !logId) return;
          const body = isOpts ? { service_options: { [key]: val } } : { [key]: val };
          try {
            await apiFetch(`/dm-confirm-queue/${encodeURIComponent(logId)}/update-slots`, {
              method: 'POST', headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            _toast('수정됐어요');
          } catch (_e) { _toast('수정 실패'); }
        };
        input.addEventListener('blur', save);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
      });
    });

    card.querySelectorAll('.dm-mini-tone__chip').forEach(ch => {
      ch.addEventListener('click', () => {
        _handleMiniTone(card, ch.dataset.tone);
        _handleRegen(card); // 톤 변경 시 즉시 재생성
      });
    });
    // 초안 contenteditable 변경 추적 (보내기 시 사용)
    const draftEl = card.querySelector('.dm-bubble--sent.is-draft');
    if (draftEl) {
      draftEl.addEventListener('input', () => {
        const logId = card.dataset.logId;
        if (logId) _draftMap.set(String(logId), draftEl.textContent || '');
      });
    }
  }

  /* ── 시트 이벤트 바인딩 ─────────────────────────── */
  function _bindToneCards(sheet) {
    sheet.querySelectorAll('.dm-tone__card').forEach(card => {
      card.addEventListener('click', () => {
        const tone = card.dataset.tone;
        sheet.querySelectorAll('.dm-tone__card').forEach(c => c.classList.toggle('is-on', c === card));
        _saveSettings({ tone });
        // [2026-05-20] 톤 변경 시 미리보기 4종 멘트도 즉시 갱신
        try {
          const prev = sheet.querySelector('#dmTonePreview');
          if (prev && prev.dataset.currentTone !== tone) {
            prev.innerHTML = _renderTonePreview(tone);
            prev.dataset.currentTone = tone;
          }
        } catch (_e) { void _e; }
        _haptic();
      });
    });
  }

  function _bindHours(sheet) {
    sheet.querySelector('[data-field="start"]')?.addEventListener('change', (e) => {
      _saveSettings({ auto_reply_start: e.target.value || '09:00' });
    });
    sheet.querySelector('[data-field="end"]')?.addEventListener('change', (e) => {
      _saveSettings({ auto_reply_end: e.target.value || '22:00' });
    });
    /* [2026-08-15] 손님에게 바로 답장 — 켤 때만 경고+동의를 받는다.
       이 토글은 다른 설정과 성격이 다르다. 켜는 순간부터 **AI 가 손님에게 직접 말을 건다.**
       원장님이 뭘 켜는지 모른 채 켰다가 손님한테 이상한 답이 나가면 그건 되돌릴 수 없다.
       (끌 때는 안 묻는다 — 끄는 건 언제나 안전한 방향이다) */
    sheet.querySelector('[data-act="autosend-toggle"]')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const next = !btn.classList.contains('is-on');
      _haptic();
      const apply = (on) => {
        btn.classList.toggle('is-on', on);
        btn.setAttribute('aria-pressed', String(on));
        const val = btn.closest('.dm-rows__item')?.querySelector('.dm-rows__value');
        if (val) val.textContent = on ? '켜짐 — 확인 없이 나가요' : '꺼짐 — 내가 확인 후 발송';
        _saveSettings({ dm_autosend_enabled: on });
      };
      if (!next) { apply(false); return; }          // 끄기는 즉시
      _askAutosendConsent(() => apply(true));       // 켜기는 동의 후
    });
    sheet.querySelector('[data-act="outside-toggle"]')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const next = !btn.classList.contains('is-on');
      btn.classList.toggle('is-on', next);
      btn.setAttribute('aria-pressed', String(next));
      // [죽은토글 실구현 2026-07-27] 이제 백엔드에 저장 → 운영시간 밖 DM 에 자리비움 멘트 자동발송.
      _saveSettings({ auto_reply_outside_hours: next });
      _haptic();
    });
  }

  // [2026-05-01] 고급설정 토글 + 멘트 관리 진입 핸들러
  // [Feature 5] 가격 문의 즉답 토글 초기화 + 저장
  function _bindAdvanced(sheet) {
    // [2026-06-25] 고급설정 접이식 토글 (기본 접힘)
    sheet.querySelector('[data-act="adv-toggle"]')?.addEventListener('click', (e) => {
      const head = e.currentTarget;
      const body = head.parentElement?.querySelector('.dm-adv-body');
      const caret = head.querySelector('.dm-adv-caret');
      if (!body) return;
      const willOpen = body.hidden;
      body.hidden = !willOpen;
      head.setAttribute('aria-expanded', String(willOpen));
      if (caret) caret.style.transform = willOpen ? 'rotate(180deg)' : '';
      _haptic();
    });

    sheet.querySelector('[data-act="tplfirst-toggle"]')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const next = !btn.classList.contains('is-on');
      btn.classList.toggle('is-on', next);
      btn.setAttribute('aria-pressed', String(next));
      _saveSettings({ prefer_template_first: next });
      _toast(next ? '표준 응대 ON — 단순 문의는 저장 멘트로 답장' : '표준 응대 OFF — 모든 답장 AI 사용');
      _haptic();
    });
    sheet.querySelector('[data-act="open-manual-replies"]')?.addEventListener('click', () => {
      if (window.openDMManualReplies) window.openDMManualReplies();
      else _toast('멘트 관리 화면을 찾을 수 없어요');
    });

    // [Feature 5] 가격 문의 토글: /shop/settings 로드 후 초기화
    const pricingBtn = sheet.querySelector('[data-act="pricing-toggle"]');
    if (pricingBtn) {
      _rawFetch(apiUrl('/shop/settings'), { headers: window.authHeader() }).then(async (r) => {
        if (!r || !r.ok) return;
        const data = await r.json().catch(() => ({}));
        const on = !!data?.settings?.auto_answer_pricing;
        pricingBtn.classList.toggle('is-on', on);
        pricingBtn.setAttribute('aria-pressed', String(on));
      }).catch(() => {});

      pricingBtn.addEventListener('click', async () => {
        const next = !pricingBtn.classList.contains('is-on');
        pricingBtn.classList.toggle('is-on', next);
        pricingBtn.setAttribute('aria-pressed', String(next));
        _haptic();
        try {
          await _rawFetch(apiUrl('/shop/settings'), {
            method: 'PATCH',
            headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ auto_answer_pricing: next }),
          }, 10000);
          _toast(next ? '가격 문의 즉답 켜짐' : '가격 문의 즉답 꺼짐');
        } catch (_) {
          _toast('저장 실패 — 다시 시도해주세요');
          pricingBtn.classList.toggle('is-on', !next);
          pricingBtn.setAttribute('aria-pressed', String(!next));
        }
      });
    }
  }

  function _bindBan(sheet) {
    sheet.querySelector('[data-field="ban"]')?.addEventListener('blur', (e) => {
      const arr = String(e.target.value || '').split(',').map(s => s.trim()).filter(Boolean);
      _saveSettings({ blocked_keywords: arr });
    });
    // [2026-06-25] 예약 양식·예약금 핸들러는 빠른 안내(app-dm-booking-form)로 이전됨.
  }

  function _bindHeader(sheet) {
    sheet.querySelector('[data-act="close"]')?.addEventListener('click', closeDMAutoreplySettings);
    sheet.querySelector('[data-act="save"]')?.addEventListener('click', async () => {
      // 즉시 flush — 디바운스 타이머 우회
      clearTimeout(_saveTimer);
      _saveTimer = setTimeout(() => {}, 0);
      // 2026-05-01 ── 저장: invalid 값 sanitize + 1회 자동 재시도 + 실제 에러 표시
      const safeSettings = _sanitizeForSave(_settings);
      const _trySave = async () => {
        if (window.DmSettingsCache?.save) {
          await window.DmSettingsCache.save(safeSettings);
          return { ok: true, status: 200, json: async () => ({}) };
        }
        return _rawFetch(apiUrl('/instagram/dm-reply/settings'), {
          method: 'POST',
          headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify(safeSettings),
        }, 25000);
      };
      let r = null;
      try { r = await _trySave(); }
      catch (e1) {
        // 첫 시도 네트워크 오류 — 1초 후 1회 재시도 (cold start / 일시 connection drop)
        await new Promise(res => setTimeout(res, 1000));
        try { r = await _trySave(); }
        catch (e2) {
          _toast(`저장 실패 — 네트워크 오류 (${e2.name || 'fetch'}: ${(e2.message || '').slice(0, 60)})`);
          return;
        }
      }
      if (r.ok) { _toast('저장됐어요'); return; }
      let detail = '저장 실패';
      try {
        const body = await r.json();
        if (body?.detail) {
          detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail).slice(0, 120);
        }
      } catch (_e) { /* ignore */ }
      _toast(`저장 실패 (${r.status}): ${detail}`);
    });
    sheet.querySelector('[data-act="pause"]')?.addEventListener('click', () => {
      _saveSettings({ enabled: false });
      _toast('자동응답 잠시 꺼졌어요');
      closeDMAutoreplySettings();
    });

    // 2026-05-01 ── 활성화 카드 ON/OFF 토글 (시트 안 닫고 즉시 반영)
    sheet.querySelector('[data-act="enable-toggle"]')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      // [2026-05-29] 인스타 미연결 시 토글 차단
      if (btn.classList.contains('is-disabled')) {
        _toast('인스타그램 연결 먼저 해주세요');
        _haptic();
        return;
      }
      const next = !btn.classList.contains('is-on');
      btn.classList.toggle('is-on', next);
      btn.setAttribute('aria-pressed', String(next));
      const card = sheet.querySelector('[data-dm-activate]');
      const _paintCard = (isOn) => {
        if (!card) return;
        const dot = card.querySelector('.dm-activate__dot');
        const text = card.querySelector('.dm-activate__status-text');
        if (dot) dot.className = isOn ? 'dm-activate__dot' : 'dm-activate__dot dm-activate__dot--off';
        if (text) text.textContent = isOn ? '자동응답 켜짐' : '자동응답 꺼짐';
      };
      _paintCard(next);
      // [카오스] 저장 확인 후 토스트 · 실패 시 롤백 — 콜드스타트/네트워크 순단에서
      //   "토스트만 켜짐, 서버는 안 켜짐 → 손님 자동응답 실제 안 됨" 오인식 방지.
      _saveSettings({ enabled: next }, (ok) => {
        if (ok) { _toast(next ? '자동응답 켜짐' : '자동응답 꺼짐'); return; }
        // 실패 → UI/_settings 롤백
        if (_settings) _settings.enabled = !next;
        btn.classList.toggle('is-on', !next);
        btn.setAttribute('aria-pressed', String(!next));
        _paintCard(!next);
        _toast('저장 실패 — ' + (next ? '켜기' : '끄기') + ' 다시 시도해주세요');
      });
      _haptic();
    });
  }

  // [Feature 4] 리텐션 DM 이벤트 핸들러
  function _bindRetention(sheet) {
    sheet.querySelector('[data-act="open-retention"]')?.addEventListener('click', async () => {
      _haptic();
      const listEl = sheet.querySelector('#dmRetentionList');
      if (!listEl) return;
      listEl.innerHTML = '<div style="font-size:12px;color:rgba(255,255,255,0.5);padding:8px 0;">불러오는 중...</div>';
      try {
        const res = await _rawFetch(apiUrl('/retouch/retention-bulk?days=45'),
          { headers: window.authHeader() });
        const data = res && res.ok ? await res.json().catch(() => ({})) : {};
        const customers = data.customers || data.items || data || [];
        listEl.innerHTML = _renderRetentionList(Array.isArray(customers) ? customers : []);
        _bindRetentionList(sheet, listEl, Array.isArray(customers) ? customers : []);
      } catch (e) {
        listEl.innerHTML = `<div style="font-size:12px;color:rgba(255,200,200,0.7);padding:8px 0;">불러오기 실패: ${_esc(e.message || '')}</div>`;
      }
    });
  }

  function _bindRetentionList(sheet, listEl, customers) {
    listEl.querySelectorAll('[data-act="retention-send"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const custId = btn.dataset.custId;
        if (!custId) return;
        _haptic();
        btn.disabled = true; btn.style.opacity = '0.6';
        try {
          const res = await _rawFetch(apiUrl(`/retouch/${encodeURIComponent(custId)}/draft-dm`),
            { method: 'POST', headers: window.authHeader() });
          if (!res || !res.ok) throw new Error('HTTP ' + (res?.status || '?'));
          _toast('DM 큐에 등록됐어요');
          btn.textContent = '발송됨';
        } catch (e) {
          _toast('발송 실패: ' + (e.message || ''));
          btn.disabled = false; btn.style.opacity = '1';
        }
      });
    });
    const bulkBtn = listEl.querySelector('[data-act="retention-bulk-send"]');
    if (bulkBtn) {
      bulkBtn.addEventListener('click', () => {
        const count = parseInt(bulkBtn.dataset.count || '0', 10);
        if (!count) return;
        if (bulkBtn.disabled) return;
        // [2026-06-10] confirm → _askConfirm (인라인 다이얼로그)
        window._askConfirm(`${count}명에게 리터치 안내 DM 발송할까요?`, async () => {
        _haptic();
        bulkBtn.disabled = true; bulkBtn.style.opacity = '0.6';
        const sendable = customers.filter(c => c.can_send_dm);
        let ok = 0;
        for (const c of sendable) {
          try {
            const res = await _rawFetch(apiUrl(`/retouch/${encodeURIComponent(c.customer_id)}/draft-dm`),
              { method: 'POST', headers: window.authHeader() });
            if (res && res.ok) ok++;
          } catch (_) { /* 개별 실패 무시 */ }
        }
        _toast(`${ok}명에게 DM 큐 등록됨`);
        bulkBtn.disabled = false; bulkBtn.style.opacity = '1';
        });
      });
    }
  }

  function _bindEvents(sheet, opts) {
    // [2026-05-12 QA #6 CRITICAL] _refreshInbox() 가 8초마다 _bindEvents 재호출 → save 버튼에
    // 리스너 누적되면서 "저장됐어요" 토스트 N번 + POST N번 중복. 폴링 경로(inboxOnly)는
    // inbox 카드만 다시 바인딩하고 header/tone/hours/ban/advanced/retention 은 skip.
    const inboxOnly = !!(opts && opts.inboxOnly);
    if (!inboxOnly) {
      _bindHeader(sheet);
      _bindToneCards(sheet);
      _bindHours(sheet);
      _bindBan(sheet);
      _bindAdvanced(sheet);
      _bindRetention(sheet);
    }
    sheet.querySelectorAll('.dm-card').forEach(card => _bindCard(card));
    _bindInboxCarousel(sheet);
  }

  // 가로 캐러셀: 닷 동기화 + 8초 새로고침 시 보던 카드 위치 복원.
  function _bindInboxCarousel(scope) {
    const track = scope.querySelector('.dm-inbox--carousel');
    if (!track) return;
    const dots = Array.from(scope.querySelectorAll('.dm-inbox__dot'));
    const slides = Array.from(track.querySelectorAll('.dm-card'));
    if (!slides.length) return;

    const slideW = () => track.clientWidth || 1;
    const syncDots = (i) => dots.forEach((d, di) => d.classList.toggle('is-active', di === i));
    const goTo = (i, smooth) => {
      const idx = Math.max(0, Math.min(i, slides.length - 1));
      _inboxCarouselIdx = idx;
      track.scrollTo({ left: idx * slideW(), behavior: smooth ? 'smooth' : 'auto' });
      syncDots(idx);
    };

    // 새로고침 직후: 보던 위치 복원(부드럽지 않게 — 깜빡임 방지)
    goTo(Math.min(_inboxCarouselIdx, slides.length - 1), false);

    // 손가락 스크롤 → 활성 닷 갱신 + 위치 기억
    let raf = 0;
    track.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        // iOS 바운스로 scrollLeft 가 범위를 넘어도 닷이 꺼지지 않게 클램프
        const i = Math.max(0, Math.min(Math.round(track.scrollLeft / slideW()), slides.length - 1));
        if (i !== _inboxCarouselIdx) { _inboxCarouselIdx = i; syncDots(i); }
      });
    }, { passive: true });

    // 닷 클릭 → 해당 카드로 이동
    dots.forEach(d => d.addEventListener('click', () => goTo(parseInt(d.dataset.idx, 10) || 0, true)));
  }

  /* ── 시트 열기/닫기 ────────────────────────────── */
  // 2026-05-01 ── DM 액션 후 다른 화면 (내샵관리 등) 재렌더 트리거
  function _notifyDMChanged() {
    try {
      window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'dm_action' } }));
    } catch (_e) { /* ignore */ }
  }
  function closeDMAutoreplySettings() {
    // [2026-05-02 Phase 1.2] inbox 폴링 정지 (close 시 즉시)
    try { _stopInboxPoll(); } catch (_e) { void _e; }
    // 2026-05-01 ── 방어적 close. visibility 복귀 후 _overlay 가 null 이지만 DOM 에는
    // 살아있는 stuck 케이스 방어 — 항상 #dmAutoreplySheet DOM 정리.
    const overlay = _overlay || document.getElementById('dmAutoreplySheet');
    const card = _sheet || (overlay && overlay.querySelector('.dm-sheet'));
    _overlay = null;
    _sheet = null;
    _opening = false;
    // 스택 정리는 overlay 유무와 무관하게 — DOM 이 이미 사라진 stuck 케이스에서도
    // history 엔트리가 남으면 "눌러도 아무 일 없는 뒤로가기"가 쌓인다.
    if (typeof window._markSheetClosed === 'function') window._markSheetClosed('dmAutoreply');
    if (!overlay) return;
    let closed = false;
    const _hardRemove = () => {
      if (closed) return;
      closed = true;
      try { overlay.remove(); } catch (_e) { void _e; }
    };
    if (window.SheetAnim?.close) {
      try { window.SheetAnim.close(overlay, card, _hardRemove); }
      catch (_) { _hardRemove(); }
      // 0.6s 후 안 닫혔으면 강제 제거 (애니메이션 콜백 누락 방어)
      setTimeout(_hardRemove, 600);
    } else {
      _hardRemove();
    }
    // 닫힐 때 다른 화면 (내샵관리 DM 카운트 등) 재렌더 트리거
    _notifyDMChanged();
  }

  let _opening = false;
  async function openDMAutoreplySettings() {
    if (_overlay || _opening) return;  // 이미 열림 OR 여는 중 (async fetch 진행)
    _opening = true;
    try {
      // 사용자 피드백 — 살짝 로딩 토스트 (느린 네트워크 대비)
      _toast?.('DM 패널 여는 중…');
      const result = await _doOpenDMAutoreply();
      return result;
    } finally {
      _opening = false;
    }
  }
  async function _doOpenDMAutoreply() {
    const { status, settings, conversations } = await _fetchAll();
    if (Array.isArray(conversations)) conversations.forEach(_applyIntentDefaults); // [v167-INTENT-MATRIX]
    const browserTz = (Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul');
    _settings = settings || {
      enabled: true, tone: 'friendly',  // 2026-05-01 default ON
      blocked_keywords: [], auto_reply_start: '09:00', auto_reply_end: '22:00',
      timezone_name: browserTz, sample_replies: [],
    };
    _settings.timezone_name = _settings.timezone_name || browserTz;
    _draftMap.clear();

    const overlay = document.createElement('div');
    overlay.id = 'dmAutoreplySheet';
    // [2026-06-08] z-index 9996 — 실시간 DM 카드 시트(9988) 위로. (설정이 카드 뒤에 깔리던 버그)
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9996;background:rgba(0,0,0,0.45);display:flex;align-items:flex-end;justify-content:center;';

    const sheet = document.createElement('div');
    sheet.className = 'dm-sheet';
    sheet.style.cssText = 'width:100%;max-width:640px;background:var(--surface);border-radius:24px 24px 0 0;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;';

    const tone = _settings.tone || 'friendly';
    // [2026-06-08] 설정 전용 — 대화/검토대기(인박스)는 '실시간 DM' 카드 리스트로 이관됨.
    //   여기는 자동응답 ON/OFF·응대 모드·톤·시간·금지어·리텐션 설정만.
    sheet.innerHTML = `
      ${_renderHeader()}
      <div class="dm-body">
        ${_renderActivate(status, conversations)}
        ${_renderTone(_settings)}
        ${_renderHours(_settings)}
        ${_renderBan(_settings)}
        ${_renderAdvanced(_settings)}
        ${_renderRetention()}
      </div>`;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    _overlay = overlay;
    _sheet = sheet;

    _bindEvents(sheet);
    // [2026-07-23] 안드로이드 하드웨어 뒤로가기 등록 — 없으면 뒤로가기에 앱이 그냥 꺼진다.
    //   드로어·대화목록·검토큐 3곳에서 열리는 주요 화면인데 등록이 빠져 있었음.
    if (typeof window._registerSheet === 'function') window._registerSheet('dmAutoreply', closeDMAutoreplySettings);
    if (typeof window._markSheetOpen === 'function') window._markSheetOpen('dmAutoreply');
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDMAutoreplySettings(); });

    if (window.SheetAnim?.open) window.SheetAnim.open(overlay, sheet);
    // [2026-06-08] 인박스 이관 — 설정 시트에선 폴링 안 함 (실시간 DM 카드가 담당).
  }

  // ── [2026-05-02] DM 자동응답 sheet 의 최근 DM (recent-conversations) 폴링 ──
  // [2026-05-21] 사용자 보고: 실시간 안 뜸 → 8000 → 4000 단축. 부하 미미 (캐시 + 가벼운 SELECT).
  const INBOX_POLL_MS = 4000;
  let _inboxPollTimer = null;
  let _inboxVisHandlerBound = false;

  function _isInboxOpen() {
    if (!_overlay) return false;
    const ds = _overlay.style.display;
    return ds !== 'none' && (_overlay.isConnected !== false);
  }
  function _bindInboxVisHandler() {
    if (_inboxVisHandlerBound) return;
    _inboxVisHandlerBound = true;
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && _isInboxOpen()) _refreshInbox().catch(() => {});
    });
  }
  function _startInboxPoll() {
    _stopInboxPoll();
    _bindInboxVisHandler();
    _inboxPollTimer = setInterval(() => {
      if (document.hidden || !_isInboxOpen()) return;
      _refreshInbox().catch(() => {});
    }, INBOX_POLL_MS);
  }
  function _stopInboxPoll() {
    if (_inboxPollTimer) clearInterval(_inboxPollTimer);
    _inboxPollTimer = null;
  }
  async function _refreshInbox() {
    if (!_overlay) return;
    const mount = _overlay.querySelector('#dmInboxMount');
    if (!mount) return;
    try {
      const headers = window.authHeader();
      const r = await _rawFetch(apiUrl('/instagram/dm-reply/recent-conversations?limit=10'), { headers });
      if (!r || !r.ok) return;
      const data = await r.json().catch(() => ({}));
      const conversations = data.conversations || [];
      if (Array.isArray(conversations)) conversations.forEach(_applyIntentDefaults); // [v167-INTENT-MATRIX]
      const tone = (_settings && _settings.tone) || 'friendly';
      mount.innerHTML = _renderInbox(conversations, tone);
      // 새로 그려진 inbox 안의 버튼들만 재바인딩 — header/tone/save 는 skip (리스너 누적 방지)
      if (_sheet) _bindEvents(_sheet, { inboxOnly: true });
    } catch (_e) { /* 조용히 실패 — 다음 틱에 재시도 */ }
  }

  window.openDMAutoreplySettings = openDMAutoreplySettings;
  window.closeDMAutoreplySettings = closeDMAutoreplySettings;
})();
