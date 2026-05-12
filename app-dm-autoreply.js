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

  const LS_OUTSIDE_HOURS = 'itdasy:dm:outside_hours';
  let _overlay = null;          // 시트 overlay
  let _sheet = null;            // 카드 노드
  let _settings = null;         // settings 캐시
  let _saveTimer = null;        // 디바운스 타이머
  const _draftMap = new Map();  // logId -> contenteditable 텍스트 (폴링 시 내용 보존용)

  /* ── 유틸 ─────────────────────────────────────────── */
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

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

  // 키워드 → 카테고리 추론 (백엔드 미존재) — TODO[v1.5]: 서버 분류
  function _categoryOf(text) {
    const s = String(text || '');
    if (/예약|시간|날짜|언제|when/i.test(s)) return '예약 문의';
    if (/얼마|가격|비용|얼마예요|price|cost/i.test(s)) return '가격 문의';
    if (/어디|위치|location|address|장소/i.test(s)) return '위치 문의';
    if (/영업|운영|문여|닫|hours/i.test(s)) return '시간 문의';
    return '기타 문의';
  }

  /* ── 백엔드 fetch ────────────────────────────────── */
  // 2026-05-01 ── _origFetch: 글로벌 fetch wrap (자동 재시도 + 서버 불안정 토스트) 우회.
  // DM 패널은 옵셔널 데이터라 토스트 spam 안 띄우고 조용히 빈 상태로 폴백.
  // 데이터 조회: 15s (Railway cold start 대응), 저장(POST): 25s.
  function _rawFetch(url, opts = {}, timeoutMs = 15000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    return (window._origFetch || window.fetch)(url, { ...opts, signal: ctrl.signal })
      .finally(() => clearTimeout(timer));
  }

  async function _fetchAll() {
    const headers = window.authHeader();
    const settingsPromise = window.DmSettingsCache?.get
      ? window.DmSettingsCache.get().catch(() => null)
      : _rawFetch(window.API + '/instagram/dm-reply/settings', { headers })
        .then(r => (r && r.ok) ? r.json().catch(() => null) : null)
        .catch(() => null);
    const endpoints = [
      _rawFetch(window.API + '/instagram/dm-reply/status', { headers }).catch(() => null),
      settingsPromise,
      _rawFetch(window.API + '/instagram/dm-reply/recent-conversations?limit=10', { headers }).catch(() => null),
    ];
    const [sR, stR, cR] = await Promise.all(endpoints);
    const status = (sR && sR.ok) ? await sR.json().catch(() => ({})) : {};
    const settings = stR || null;
    const recent = (cR && cR.ok) ? await cR.json().catch(() => ({})) : {};
    return { status, settings, conversations: recent.conversations || [] };
  }

  // 2026-05-01 ── 백엔드 Pydantic 검증 통과 보장: invalid 값 sanitize.
  // autonomy_mode 패턴 검증 + tone enum 검증 + bool 강제.
  function _sanitizeForSave(s) {
    const out = Object.assign({}, s || {});
    const TONES = ['friendly', 'professional', 'cute'];
    const MODES = ['draft', 'confirm_high', 'auto'];
    if (!TONES.includes(out.tone)) out.tone = 'friendly';
    if (!MODES.includes(out.autonomy_mode)) out.autonomy_mode = 'confirm_high';
    out.enabled = Boolean(out.enabled);
    out.prefer_template_first = Boolean(out.prefer_template_first);
    if (!Array.isArray(out.blocked_keywords)) out.blocked_keywords = [];
    if (!Array.isArray(out.sample_replies)) out.sample_replies = [];
    return out;
  }

  // 디바운스 저장 (POST /settings)
  function _saveSettings(partial) {
    if (!_settings) return;
    Object.assign(_settings, partial);
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(async () => {
      try {
        const safe = _sanitizeForSave(_settings);
        if (window.DmSettingsCache?.save) await window.DmSettingsCache.save(safe);
        else {
          await _rawFetch(window.API + '/instagram/dm-reply/settings', {
            method: 'POST',
            headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify(safe),
          }, 25000);
        }
      } catch (_) { /* 조용히 실패 — 다음 저장 때 재시도 */ }
    }, 400);
  }

  /* ── 마크업 빌더 ──────────────────────────────────── */
  function _renderHeader() {
    return `
      <div class="dm-header">
        <button type="button" class="dm-header__back" data-act="close" aria-label="닫기">
          <i class="ph-duotone ph-caret-left" style="font-size:14px" aria-hidden="true"></i>
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
    const on = status.global_enabled !== false && _settings?.enabled !== false;
    const dotCls = on ? 'dm-activate__dot' : 'dm-activate__dot dm-activate__dot--off';
    const txt = on ? '자동응답 켜짐' : '자동응답 꺼짐';
    return `
      <div class="dm-activate" data-dm-activate>
        <div class="dm-activate__status">
          <div class="${dotCls}"></div>
          <div class="dm-activate__status-text">${txt}</div>
          <button type="button" class="dm-toggle ${on ? 'is-on' : ''}" data-act="enable-toggle"
                  aria-pressed="${on}" aria-label="DM 자동응답 켜기/끄기" style="margin-left:auto;">
            <span class="dm-toggle__track"></span><span class="dm-toggle__knob"></span>
          </button>
        </div>
        ${_renderStats(conversations)}
      </div>`;
  }

  // TODO[v1.5]: /persona/training-progress 엔드포인트로 교체
  function _renderPersona() {
    const pct = 92;
    return `
      <div class="dm-persona">
        <div class="dm-persona__icon">
          <i class="ph-duotone ph-user-circle" style="font-size:20px" aria-hidden="true"></i>
        </div>
        <div class="dm-persona__info">
          <div class="dm-persona__title"><b>원장님 말투</b>로 학습된 AI</div>
          <div class="dm-persona__meta">DM·캡션 패턴으로 학습 중</div>
          <div class="dm-persona__progress"><div class="dm-persona__bar" style="width:${pct}%"></div></div>
        </div>
        <div class="dm-persona__pct">${pct}%</div>
      </div>`;
  }

  function _renderTone(settings) {
    const tone = settings.tone || 'friendly';
    const cards = [
      { id: 'friendly',     name: '친근',   sample: '"네! 예약 가능해요~"' },
      { id: 'professional', name: '정중',   sample: '"안녕하세요. 가능합니다."' },
      { id: 'cute',         name: '귀여움', sample: '"네네 가능해요!"' },
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
              <div class="dm-tone__sample">${c.sample}</div>
            </button>
          `).join('')}
        </div>
      </div>`;
  }

  function _renderHours(settings) {
    const start = _esc(settings.auto_reply_start || '09:00');
    const end = _esc(settings.auto_reply_end || '22:00');
    const tz = _esc(settings.timezone_name || 'Asia/Seoul');
    // TODO[v1.5]: settings에 auto_reply_outside_hours 추가될 때까지 localStorage 폴백
    const outsideOn = (localStorage.getItem(LS_OUTSIDE_HOURS) ?? '1') === '1';
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

  // [2026-05-01] 고급설정 — 토큰 절약 모드 토글
  function _renderAdvanced(settings) {
    const tplFirst = !!settings.prefer_template_first;
    return `
      <div class="dm-section">
        <div class="dm-section__title">고급설정 <span class="dm-section__help">스마트 응대 매뉴얼</span></div>
        <div class="dm-rows">
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
            <button type="button" data-act="open-manual-replies" style="background:#FAF5FF;border:1px solid #DDD6FE;color:#5B21B6;padding:7px 12px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">멘트 관리 →</button>
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
  function _renderThread(conv, tail, logId) {
    const recv = _esc(conv.received_text || '');
    // 1순위: 방금 수정/생성한 로컬 메모리(_draftMap), 2순위: 서버의 답장(text), 3순위: 서버의 초안(ai_draft_text)
    const draft = _esc(_draftMap.get(logId) || conv.reply?.text || conv.ai_draft_text || '');
    const recvTime = conv.ts ? new Date(conv.ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';
    return `
      <div class="dm-thread">
        <div class="dm-thread__row dm-thread__row--received">
          <div class="dm-thread__avatar">고</div>
          <div class="dm-bubble dm-bubble--received">${recv}</div>
        </div>
        <div class="dm-thread__time-row dm-thread__time-row--received">
          <span class="dm-thread__time">${_esc(recvTime)}</span>
        </div>
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
      ? '<span style="font-size:10px;background:#10B981;color:#fff;padding:2px 8px;border-radius:99px;font-weight:700;margin-left:4px;">단골</span>'
      : (ctx.visit_count === 1
        ? '<span style="font-size:10px;background:#3B82F6;color:#fff;padding:2px 8px;border-radius:99px;font-weight:700;margin-left:4px;">신규</span>'
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

  function _renderCard(conv, activeTone) {
    const tail = (conv.sender_tail || '????').slice(-4);
    // [2026-05-02] sender_username (자동 수집된 @아이디) 우선 → 없으면 "손님 …{tail}"
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
    const showAltBtn = isBookingAction && calChecked;

    // [Phase 1.2++] booking_action 메타 한 줄 요약 (사장 카드 라벨)
    const actInfo = isBookingAction ? `
      <div style="display:flex;flex-direction:column;gap:4px;padding:8px 10px;background:#FFF7E6;border:1px solid #FBBF24;border-radius:8px;margin:8px 0;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span style="font-size:11px;font-weight:800;color:#92400E;">예약 승인 대기</span>
          ${calChecked ? '<span style="font-size:10px;background:#10B981;color:#fff;padding:1px 7px;border-radius:99px;font-weight:700;">캘린더 확인됨</span>' : ''}
        </div>
        ${actMeta.owner_label ? `<div style="font-size:11.5px;color:#92400E;font-weight:700;line-height:1.4;">${_esc(actMeta.owner_label)}</div>` : `
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11px;color:#92400E;">
            ${actMeta.time_kst ? `<span style="font-weight:700;">${_esc(actMeta.time_kst)}</span>` : (actMeta.requested_time ? `<span>${_esc(actMeta.requested_time)}</span>` : '')}
            ${actMeta.service_name ? `<span>· ${_esc(actMeta.service_name)}</span>` : ''}
          </div>
        `}
      </div>` : '';

    // 액션 버튼 라벨 — booking_action 이면 "예약 승인 + 캘린더 추가", 아니면 단순 발송
    const sendLabel = isBookingAction
      ? '✓ 예약 승인 (캘린더 추가 + 확정 DM 발송)'
      : '✓ 답장 발송';

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
        ${_renderThread(conv, tail, logId)}
        ${actInfo}
        ${_renderMiniTone(activeTone)}
        <div class="dm-actions" style="display:flex;flex-direction:column;gap:6px;">
          <button type="button" class="dm-action is-send" data-act="send" style="width:100%;justify-content:center;">
            <i class="ph-duotone ph-paper-plane-tilt" style="font-size:12px" aria-hidden="true"></i>
            ${sendLabel}
          </button>
          ${showAltBtn ? `<button type="button" class="dm-action" data-act="alt" style="width:100%;justify-content:center;background:#FFFBEB;color:#92400E;border:1px solid #F59E0B;">⏰ 불가 및 대안 시간 제안</button>` : ''}
          <button type="button" class="dm-action is-reject" data-act="reject" style="width:100%;justify-content:center;">직접 거절 / 수정</button>
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
        : `<span style="font-size:10px;color:rgba(255,255,255,0.4);white-space:nowrap;">인스타 미연결</span>`;
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
              background:#6366F1;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">
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
            대기 중인 DM 이 없어요 ✨
          </div>
        </div>`;
    }
    return `
      <div class="dm-section">
        <div class="dm-section__title">DM 검토 대기 <span class="dm-section__help">예약 승인 · 대안 시간 · 거절</span></div>
        <div class="dm-inbox">
          ${conversations.map(c => _renderCard(c, activeTone)).join('')}
        </div>
      </div>`;
  }

  /* ── 카드 액션 핸들러 ───────────────────────────── */
  async function _sendFeedback(tail, kind) {
    try {
      await fetch(window.API + '/instagram/dm-reply/feedback', {
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
        const res = await fetch(window.API + url, {
          method: 'POST',
          headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
          body,
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.detail || ('HTTP ' + res.status));
        _toast(d.message || '처리 완료');
        _sendFeedback(tail, 'good');
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

  async function _handleReject(card) {
    const tail = card.dataset.tail;
    const logId = card.dataset.logId;
    _haptic();
    _sendFeedback(tail, 'bad');
    // 좌측 슬라이드 — 인라인 transform 으로 .is-sending 의 120% 덮어씀
    card.style.transform = 'translateX(-120%)';
    card.classList.add('is-sending');
    setTimeout(() => card.remove(), 460);
    // 2026-05-01 ── 실제 백엔드 discard. 결과 확인해서 실패면 사용자에게 알림.
    if (logId) {
      try {
        const res = await fetch(window.API + `/dm-confirm-queue/${encodeURIComponent(logId)}/discard`, {
          method: 'POST', headers: window.authHeader(),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          _toast('거절 실패: ' + (d.detail || res.status));
        }
      } catch (e) { _toast('거절 실패: ' + (e.message || 'fetch')); }
    }
    _notifyDMChanged();  // 내샵관리 DM 카운트 즉시 갱신
  }

  function _handleMiniTone(card, tone) {
    card.querySelectorAll('.dm-mini-tone__chip').forEach(ch => {
      ch.classList.toggle('is-on', ch.dataset.tone === tone);
    });
    // TODO[v1.5]: 톤 변경 시 즉시 새 초안 생성 — 지금은 UI만 토글
  }

  const _regenInFlight = new Set();  // logId별 중복 호출 방지
  async function _handleRegen(card) {
    // [2026-05-02 Phase 1.2++] 진짜 백엔드 호출 — fake hardcoded 제거.
    // POST /dm-confirm-queue/{log_id}/regenerate { tone } → 시간 컨텍스트 가드레일 보존.
    const logId = card.dataset.logId;
    const regenKey = String(logId || '');
    if (regenKey && _regenInFlight.has(regenKey)) return;  // 이미 생성 중이면 중복 호출 방지
    if (!logId) {
      _toast('재생성하려면 먼저 메시지가 큐에 등록되어야 해요');
      return;
    }
    const toneBtn = card.querySelector('.dm-mini-tone__chip.is-on');
    const tone = toneBtn ? toneBtn.dataset.tone : 'friendly';
    const draftEl = card.querySelector('.dm-bubble--sent.is-draft');
    if (!draftEl) return;

    const orig = draftEl.textContent;
    if (orig === '생성 중...' || orig === '생성 중…') return; 

    const statusLabel = '생성 중…';
    draftEl.textContent = statusLabel;
    draftEl.style.color = '#aaa';
    _draftMap.set(regenKey, statusLabel); // 폴링 시에도 '생성 중' 표시 유지
    
    _regenInFlight.add(regenKey);
    const regenBtn = card.querySelector('[data-act="regen"]');
    if (regenBtn) {
      regenBtn.disabled = true;
      regenBtn.textContent = '생성 중…';
    }
    _haptic();
    try {
      const res = await _rawFetch(window.API + `/dm-confirm-queue/${encodeURIComponent(logId)}/regenerate`, {
        method: 'POST',
        headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ tone }),
      }, 45000);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.detail || ('HTTP ' + res.status));
      
      // 서버 응답에서 새 텍스트 추출 (다양한 필드명 대응)
      const newText = d.ai_draft_text || d.text || d.reply_text || d.draft || d.generated_text || '';
      
      // 폴링이 카드를 재렌더했을 수 있으므로 logId 로 최신 DOM 다시 조회
      const liveCard = document.querySelector(`.dm-card[data-log-id="${CSS.escape(logId)}"]`);
      const liveEl = liveCard ? liveCard.querySelector('.dm-bubble--sent.is-draft') : draftEl;
      
      if (newText) {
        _draftMap.set(regenKey, newText);
        if (liveEl) {
          liveEl.textContent = newText;
          liveEl.style.color = '';
        }
        _toast('✓ 새 답장 생성됨');
      } else {
        _draftMap.delete(regenKey); // 실패 시 맵에서 제거하여 원본(ai_draft_text) 노출 유도
        if (liveEl) {
          liveEl.textContent = orig;
          liveEl.style.color = '';
        }
        _toast('새 답장이 비어 있어요. 다시 눌러주세요.');
      }
      if (d.guarded) _toast('✓ 시간 정보 유지하며 톤만 변경됨');
    } catch (e) {
      _draftMap.delete(regenKey);
      const liveCard2 = document.querySelector(`.dm-card[data-log-id="${CSS.escape(logId)}"]`);
      const liveEl2 = liveCard2 ? liveCard2.querySelector('.dm-bubble--sent.is-draft') : draftEl;
      if (liveEl2) { 
        liveEl2.textContent = orig; 
        liveEl2.style.color = ''; 
      }
      const msg = e?.name === 'AbortError'
        ? '답장 만들기가 너무 오래 걸려 멈췄어요. 다시 눌러주세요.'
        : (e.message || '');
      _toast('재생성 실패: ' + msg);
    } finally {
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
  async function _handleAlt(card) {
    const logId = card.dataset.logId;
    if (!logId) return;
    if (!confirm('이 시간 거절하고 대안 시간을 손님에게 안내할까요?')) return;
    _haptic();
    try {
      const res = await fetch(window.API + `/dm-confirm-queue/${encodeURIComponent(logId)}/decline-with-alternatives`, {
        method: 'POST', headers: window.authHeader(),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.detail || ('HTTP ' + res.status));
      _toast(d.message || `대안 시간 안내 발송 (${d.alternatives_sent || 0}개)`);
      card.classList.add('is-sending');
      setTimeout(() => { card.remove(); _notifyDMChanged(); }, 460);
    } catch (e) {
      _toast('실패: ' + (e.message || ''));
    }
  }

  function _bindCard(card) {
    // [2026-05-12 QA #6] inbox 폴링 시 동일 card element 재바인딩 방어 — 한 번만 바인딩.
    if (card.dataset.bound === '1') return;
    card.dataset.bound = '1';
    card.querySelector('[data-act="send"]')?.addEventListener('click', () => _handleSend(card));
    card.querySelector('[data-act="reject"]')?.addEventListener('click', () => _handleReject(card));
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
    sheet.querySelector('[data-act="outside-toggle"]')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const next = !btn.classList.contains('is-on');
      btn.classList.toggle('is-on', next);
      btn.setAttribute('aria-pressed', String(next));
      // TODO[v1.5]: settings.auto_reply_outside_hours 저장
      localStorage.setItem(LS_OUTSIDE_HOURS, next ? '1' : '0');
      _haptic();
    });
  }

  // [2026-05-01] 고급설정 토글 + 멘트 관리 진입 핸들러
  // [Feature 5] 가격 문의 즉답 토글 초기화 + 저장
  function _bindAdvanced(sheet) {
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
      _rawFetch(window.API + '/shop/settings', { headers: window.authHeader() }).then(async (r) => {
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
          await _rawFetch(window.API + '/shop/settings', {
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
        return _rawFetch(window.API + '/instagram/dm-reply/settings', {
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
      const next = !btn.classList.contains('is-on');
      btn.classList.toggle('is-on', next);
      btn.setAttribute('aria-pressed', String(next));
      const card = sheet.querySelector('[data-dm-activate]');
      if (card) {
        const dot = card.querySelector('.dm-activate__dot');
        const text = card.querySelector('.dm-activate__status-text');
        if (dot) dot.className = next ? 'dm-activate__dot' : 'dm-activate__dot dm-activate__dot--off';
        if (text) text.textContent = next ? '자동응답 켜짐' : '자동응답 꺼짐';
      }
      _saveSettings({ enabled: next });
      _toast(next ? '자동응답 켜짐' : '자동응답 꺼짐');
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
        const res = await _rawFetch(window.API + '/retouch/retention-bulk?days=45',
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
          const res = await _rawFetch(window.API + `/retouch/${encodeURIComponent(custId)}/draft-dm`,
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
      bulkBtn.addEventListener('click', async () => {
        const count = parseInt(bulkBtn.dataset.count || '0', 10);
        if (!count) return;
        if (!confirm(`${count}명에게 리터치 안내 DM 발송할까요?`)) return;
        _haptic();
        bulkBtn.disabled = true; bulkBtn.style.opacity = '0.6';
        const sendable = customers.filter(c => c.can_send_dm);
        let ok = 0;
        for (const c of sendable) {
          try {
            const res = await _rawFetch(window.API + `/retouch/${encodeURIComponent(c.customer_id)}/draft-dm`,
              { method: 'POST', headers: window.authHeader() });
            if (res && res.ok) ok++;
          } catch (_) { /* 개별 실패 무시 */ }
        }
        _toast(`${ok}명에게 DM 큐 등록됨`);
        bulkBtn.disabled = false; bulkBtn.style.opacity = '1';
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
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,0.45);display:flex;align-items:flex-end;justify-content:center;';

    const sheet = document.createElement('div');
    sheet.className = 'dm-sheet';
    sheet.style.cssText = 'width:100%;max-width:640px;background:var(--surface);border-radius:24px 24px 0 0;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;';

    const tone = _settings.tone || 'friendly';
    sheet.innerHTML = `
      ${_renderHeader()}
      <div class="dm-body">
        ${_renderActivate(status, conversations)}
        ${_renderPersona()}
        <div class="dm-pc-grid">
          <div>
            ${_renderTone(_settings)}
            ${_renderHours(_settings)}
            ${_renderBan(_settings)}
            ${_renderAdvanced(_settings)}
          </div>
          <div id="dmInboxMount">
            ${_renderRetention()}
            ${_renderInbox(conversations, tone)}
          </div>
        </div>
      </div>`;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    _overlay = overlay;
    _sheet = sheet;

    _bindEvents(sheet);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDMAutoreplySettings(); });

    if (window.SheetAnim?.open) window.SheetAnim.open(overlay, sheet);
    // [2026-05-02 Phase 1.2] inbox 자동 갱신 — 8초마다 신규 DM 따라잡음
    _startInboxPoll();
  }

  // ── [2026-05-02] DM 자동응답 sheet 의 최근 DM (recent-conversations) 폴링 ──
  const INBOX_POLL_MS = 8000;
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
      const r = await _rawFetch(window.API + '/instagram/dm-reply/recent-conversations?limit=10', { headers });
      if (!r || !r.ok) return;
      const data = await r.json().catch(() => ({}));
      const conversations = data.conversations || [];
      const tone = (_settings && _settings.tone) || 'friendly';
      mount.innerHTML = _renderInbox(conversations, tone);
      // 새로 그려진 inbox 안의 버튼들만 재바인딩 — header/tone/save 는 skip (리스너 누적 방지)
      if (_sheet) _bindEvents(_sheet, { inboxOnly: true });
    } catch (_e) { /* 조용히 실패 — 다음 틱에 재시도 */ }
  }

  window.openDMAutoreplySettings = openDMAutoreplySettings;
  window.closeDMAutoreplySettings = closeDMAutoreplySettings;
})();
