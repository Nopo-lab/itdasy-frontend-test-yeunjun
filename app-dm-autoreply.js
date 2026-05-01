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
  const _draftMap = new Map();  // tail -> contenteditable 텍스트

  /* ── 유틸 ─────────────────────────────────────────── */
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function _toast(msg) {
    if (window.showToast) window.showToast(msg);
    else alert(msg);
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
  // 8s timeout 으로 Railway cold start hang 방지.
  function _rawFetch(url, opts = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    return (window._origFetch || window.fetch)(url, { ...opts, signal: ctrl.signal })
      .finally(() => clearTimeout(timer));
  }

  async function _fetchAll() {
    const headers = window.authHeader();
    const endpoints = [
      _rawFetch(window.API + '/instagram/dm-reply/status', { headers }).catch(() => null),
      _rawFetch(window.API + '/instagram/dm-reply/settings', { headers }).catch(() => null),
      _rawFetch(window.API + '/instagram/dm-reply/recent-conversations?limit=10', { headers }).catch(() => null),
    ];
    const [sR, stR, cR] = await Promise.all(endpoints);
    const status = (sR && sR.ok) ? await sR.json().catch(() => ({})) : {};
    const settings = (stR && stR.ok) ? await stR.json().catch(() => null) : null;
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
        await _rawFetch(window.API + '/instagram/dm-reply/settings', {
          method: 'POST',
          headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify(_sanitizeForSave(_settings)),
        });
      } catch (_) { /* 조용히 실패 — 다음 저장 때 재시도 */ }
    }, 400);
  }

  /* ── 마크업 빌더 ──────────────────────────────────── */
  function _renderHeader() {
    return `
      <div class="dm-header">
        <button type="button" class="dm-header__back" data-act="close" aria-label="닫기">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="15 18 9 12 15 6"/></svg>
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
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M12 14c-4 0-7 2-7 6h14c0-4-3-6-7-6z"/></svg>
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
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
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
        <div class="dm-section__title">고급설정 <span class="dm-section__help">Gemini 토큰 아끼기</span></div>
        <div class="dm-rows">
          <div class="dm-rows__item">
            <div style="flex:1;">
              <div class="dm-rows__label" style="font-weight:700;color:#222;">기본 멘트 우선 (토큰 절약)</div>
              <div style="font-size:11px;color:#888;margin-top:3px;line-height:1.45;">
                인사·가격·시간·위치·후기 같은 단순 문의는 저장된 멘트 그대로 발송.<br>
                AI 호출 안 하니 비용 0. 예약·위험 메시지는 여전히 AI 사용.
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
        </div>
      </div>`;
  }

  /* ── DM 카드 ───────────────────────────────────── */
  function _renderThread(conv, tail) {
    const recv = _esc(conv.received_text || '');
    const draft = _esc(conv.reply?.text || '');
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
          <div class="dm-bubble dm-bubble--sent is-draft" contenteditable="true" data-tail="${_esc(tail)}">${draft}</div>
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

  function _renderCard(conv, activeTone) {
    const tail = (conv.sender_tail || '????').slice(-4);
    const name = conv.sender_username || `고객 ${tail}`;
    const cat = _categoryOf(conv.received_text);
    const time = _humanTime(conv.ts);
    const logId = conv.id != null ? String(conv.id) : '';
    const status = conv.reply?.status || '';
    const pending = status === 'pending_confirm';
    return `
      <div class="dm-card is-pending" data-tail="${_esc(tail)}" data-log-id="${_esc(logId)}" data-status="${_esc(status)}">
        <div class="dm-card__top">
          <div class="dm-card__avatar">고</div>
          <div class="dm-card__name" style="cursor:pointer;" data-act="open-customer" data-cust-id="${conv.customer_id || ''}">${_esc(name)}</div>
          <div class="dm-card__time">${_esc(time)}</div>
          <div class="dm-card__pending-badge">${pending ? '확인 대기' : '학습 피드백'}</div>
        </div>
        <div><span class="dm-card__cat">${_esc(cat)}</span></div>
        ${_renderThread(conv, tail)}
        ${_renderMiniTone(activeTone)}
        <div class="dm-actions">
          <button type="button" class="dm-action is-reject" data-act="reject">거절</button>
          <button type="button" class="dm-action is-send" data-act="send">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            보내기
          </button>
        </div>
      </div>`;
  }

  function _renderInbox(conversations, activeTone) {
    if (!conversations.length) {
      return `
        <div class="dm-section">
          <div class="dm-section__title">최근 도착 DM</div>
          <div class="dm-rows" style="padding:24px 14px;text-align:center;color:var(--text-subtle);font-size:12px;">
            아직 도착한 DM이 없어요
          </div>
        </div>`;
    }
    return `
      <div class="dm-section">
        <div class="dm-section__title">최근 도착 DM <span class="dm-section__help">학습 피드백 · 보내기/거절</span></div>
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
    _haptic();

    // [2026-05-01] pending_confirm 큐에 있는 메시지면 실제 발송 호출.
    // 카드 안 textarea(.dm-bubble--sent.is-draft) 의 현재 텍스트 = 사장이 톤 조정/편집한 결과.
    if (status === 'pending_confirm' && logId) {
      const draftEl = card.querySelector('.dm-bubble--sent.is-draft');
      const editedText = (draftEl?.textContent || '').trim();
      if (!editedText) {
        _toast('답장 내용이 비어있어요');
        return;
      }
      const sendBtn = card.querySelector('[data-act="send"]');
      if (sendBtn) { sendBtn.disabled = true; sendBtn.style.opacity = '0.6'; }
      try {
        const res = await fetch(window.API + `/dm-confirm-queue/${encodeURIComponent(logId)}/send_edit`, {
          method: 'POST',
          headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ edited_reply: editedText }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.detail || ('HTTP ' + res.status));
        _toast(d.message || '✅ 발송 완료');
        _sendFeedback(tail, 'good');
        card.classList.add('is-sending');
        setTimeout(() => {
          card.remove();
          if (window.refreshDMQueueBadge) window.refreshDMQueueBadge();
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

  function _handleReject(card) {
    const tail = card.dataset.tail;
    _haptic();
    _sendFeedback(tail, 'bad');
    // 좌측 슬라이드 — 인라인 transform 으로 .is-sending 의 120% 덮어씀
    card.style.transform = 'translateX(-120%)';
    card.classList.add('is-sending');
    setTimeout(() => card.remove(), 460);
    // TODO[v1.5]: 실제 거절 큐
  }

  function _handleMiniTone(card, tone) {
    card.querySelectorAll('.dm-mini-tone__chip').forEach(ch => {
      ch.classList.toggle('is-on', ch.dataset.tone === tone);
    });
    // TODO[v1.5]: 톤 변경 시 즉시 새 초안 생성 — 지금은 UI만 토글
  }

  async function _handleRegen(card) {
    const toneBtn = card.querySelector('.dm-mini-tone__chip.is-on');
    const tone = toneBtn ? toneBtn.dataset.tone : 'friendly';
    const draftEl = card.querySelector('.dm-bubble--sent.is-draft');
    if (!draftEl) return;
    
    draftEl.textContent = '생성 중...';
    _haptic();
    try {
      await new Promise(r => setTimeout(r, 600));
      const fakeReplies = {
        friendly: '네! 예약 가능해요~ 편하신 시간 말씀해주세요! 😆',
        professional: '안녕하세요. 네, 예약 가능하십니다. 원하시는 시간대 알려주시면 안내 도와드리겠습니다.',
        cute: '네네 가능해요!! 언제루 잡아드릴까용?? 💖'
      };
      draftEl.textContent = fakeReplies[tone] || fakeReplies.friendly;
      _draftMap.set(draftEl.dataset.tail, draftEl.textContent);
    } catch (e) {
      draftEl.textContent = '다시 시도해주세요';
    }
  }

  function _bindCard(card) {
    card.querySelector('[data-act="send"]')?.addEventListener('click', () => _handleSend(card));
    card.querySelector('[data-act="reject"]')?.addEventListener('click', () => _handleReject(card));
    card.querySelector('[data-act="regen"]')?.addEventListener('click', () => _handleRegen(card));
    
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
        const tail = draftEl.dataset.tail;
        _draftMap.set(tail, draftEl.textContent || '');
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
  function _bindAdvanced(sheet) {
    sheet.querySelector('[data-act="tplfirst-toggle"]')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const next = !btn.classList.contains('is-on');
      btn.classList.toggle('is-on', next);
      btn.setAttribute('aria-pressed', String(next));
      _saveSettings({ prefer_template_first: next });
      _toast(next ? '토큰 절약 모드 ON — 단순 문의는 저장 멘트로 답장' : '토큰 절약 모드 OFF — 모든 답장 AI 사용');
      _haptic();
    });
    sheet.querySelector('[data-act="open-manual-replies"]')?.addEventListener('click', () => {
      if (window.openDMManualReplies) window.openDMManualReplies();
      else _toast('멘트 관리 화면을 찾을 수 없어요');
    });
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
      const _trySave = async () => _rawFetch(window.API + '/instagram/dm-reply/settings', {
        method: 'POST',
        headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(safeSettings),
      });
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

  function _bindEvents(sheet) {
    _bindHeader(sheet);
    _bindToneCards(sheet);
    _bindHours(sheet);
    _bindBan(sheet);
    _bindAdvanced(sheet);
    sheet.querySelectorAll('.dm-card').forEach(card => _bindCard(card));
  }

  /* ── 시트 열기/닫기 ────────────────────────────── */
  function closeDMAutoreplySettings() {
    if (!_overlay) return;
    const overlay = _overlay;
    const card = _sheet;
    _overlay = null;
    _sheet = null;
    if (window.SheetAnim?.close) {
      window.SheetAnim.close(overlay, card, () => overlay.remove());
    } else {
      overlay.remove();
    }
  }

  async function openDMAutoreplySettings() {
    if (_overlay) return;  // 이미 열림
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
          <div>
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
  }

  window.openDMAutoreplySettings = openDMAutoreplySettings;
  window.closeDMAutoreplySettings = closeDMAutoreplySettings;
})();
