/* ─────────────────────────────────────────────────────────────
   AI가 추천하는 오늘 집중할 것 (Task 5 통합 카드 · 2026-04-24)

   기존 'TodayBrief' + 'AI 추천 · 오늘 할 일' 두 카드를 하나로 통합.
   - GET /today/brief         → 다음 예약 / 매출 / 미기록 / 이탈 / 생일
   - GET /assistant/suggestions → AI 추천 추가 액션 항목

   window.TodayBrief.render(containerId) → 비동기 렌더 (병합 데이터)
   window.AISuggestions.render(containerId) → no-op alias (호환용)
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  // Lucide SVG (이모지 금지 · CLAUDE.md UX 철학)
  function _ic(name) {
    const map = {
      clock:    '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
      dollar:   '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
      edit:     '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
      heart:    '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
      cake:     '<path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><path d="M2 21h20"/><path d="M7 8v3"/><path d="M12 8v3"/><path d="M17 8v3"/><path d="M7 4h.01"/><path d="M12 4h.01"/><path d="M17 4h.01"/>',
      sparkles: '<path d="M12 3l1.5 4.5H18l-3.75 2.7 1.5 4.5L12 12l-3.75 2.7 1.5-4.5L6 7.5h4.5L12 3z"/>',
      sun:      '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
      target:   '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
      arrow:    '<polyline points="9 18 15 12 9 6"/>',
    };
    return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${map[name] || ''}</svg>`;
  }

  async function _fetchBrief() {
    try {
      const res = await fetch(window.API + '/today/brief', { headers: window.authHeader() });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) { return null; }
  }

  async function _fetchAISuggest() {
    if (!window.API || !window.authHeader) return null;
    try {
      const res = await fetch(window.API + '/assistant/suggestions', { headers: window.authHeader() });
      if (!res.ok) return null;
      return await res.json();
    } catch (_e) { return null; }
  }

  function _greetByHour() {
    const h = new Date().getHours();
    if (h < 6) return '새벽까지 수고 많으세요';
    if (h < 12) return '좋은 아침이에요';
    if (h < 18) return '오후도 화이팅';
    return '오늘도 고생하셨어요';
  }

  // brief + ai 데이터를 하나의 items 배열로 병합
  function _buildItems(brief, ai) {
    const items = [];
    const d = brief || {};

    if (d.upcoming_count > 0 && d.next_booking) {
      const t = new Date(d.next_booking.starts_at);
      const hhmm = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
      items.push({ ic: 'clock', label: `다음 예약 ${hhmm}${d.next_booking.customer_name ? ' · ' + _esc(d.next_booking.customer_name) : ''}`, color: '#F18091' });
    }
    if (d.revenue_total > 0) {
      items.push({ ic: 'dollar', label: `오늘 매출 ${d.revenue_total.toLocaleString('ko-KR')}원 (${d.revenue_count}건)`, color: '#388e3c' });
    }
    if (d.unrecorded_count > 0) {
      items.push({ ic: 'edit', label: `매출 미기록 ${d.unrecorded_count}건 — 탭해서 한꺼번에 정리`, color: '#f57c00', action: 'unrecorded' });
    }
    if (d.at_risk_count > 0) {
      items.push({ ic: 'heart', label: `이탈 임박 ${d.at_risk_count}명 — 쿠폰 타이밍`, color: '#dc3545', action: 'insights' });
    }
    if (d.birthday_count > 0) {
      const names = (d.birthday_customers || []).slice(0, 2).map(c => c.name).join(', ');
      items.push({ ic: 'cake', label: `오늘 생일 ${names} — 축하 메시지 보내기`, color: '#8B5CF6', action: 'birthday' });
    }

    // AI 추천 항목 병합 (중복 라벨 제거 — 텍스트 일치 시 skip)
    if (ai && Array.isArray(ai.items)) {
      const seen = new Set(items.map(it => it.label));
      ai.items.forEach(s => {
        const title = s.title || '';
        if (!title || seen.has(title)) return;
        items.push({
          ic: 'sparkles',
          label: title + (s.reason ? ` — ${s.reason}` : ''),
          color: '#D95F70',
          action: s.action || 'chat',
        });
        seen.add(title);
      });
    }
    return items;
  }

  function _render(items, greet) {
    if (!items.length) {
      return `
        <div style="padding:16px 18px;border-radius:14px;background:linear-gradient(135deg,#0f0608 0%,#2a1518 100%);color:#fff;margin-bottom:14px;box-shadow:0 8px 24px rgba(15,6,8,0.2);">
          <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:6px;">
            <span style="display:inline-flex;color:rgba(255,255,255,0.85);">${_ic('sun')}</span>
            <span>${_esc(greet)}</span>
          </div>
          <div style="font-size:15px;font-weight:700;line-height:1.5;">오늘 일정이 비어있어요.<br><span style="font-size:12px;color:rgba(255,255,255,0.5);font-weight:400;">인스타 캡션 한 장 워밍업으로 어때요?</span></div>
        </div>
      `;
    }

    return `
      <div style="padding:18px;border-radius:14px;background:linear-gradient(135deg,#1a0c10 0%,#3a1a22 100%);color:#fff;margin-bottom:14px;box-shadow:0 8px 24px rgba(26,12,16,0.25);">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <span style="display:inline-flex;color:#F18091;">${_ic('target')}</span>
          <strong style="font-size:13px;letter-spacing:.2px;">AI가 추천하는 오늘 집중할 것</strong>
          <span style="font-size:11px;color:rgba(255,255,255,0.5);margin-left:auto;">${_esc(greet)}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:9px;">
          ${items.map(it => `
            <div ${it.action ? `data-brief-act="${_esc(it.action)}" style="cursor:pointer;"` : ''} style="display:flex;gap:10px;align-items:center;padding:10px 12px;background:rgba(255,255,255,0.06);border-radius:10px;border-left:3px solid ${it.color};${it.action ? 'cursor:pointer;' : ''}">
              <span style="display:inline-flex;color:${it.color};flex-shrink:0;">${_ic(it.ic)}</span>
              <span style="font-size:12px;line-height:1.4;flex:1;">${_esc(it.label)}</span>
              ${it.action ? `<span style="color:rgba(255,255,255,0.4);display:inline-flex;">${_ic('arrow')}</span>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function _bind(container) {
    container.querySelectorAll('[data-brief-act]').forEach(el => {
      el.addEventListener('click', () => {
        const act = el.dataset.briefAct;
        if (window.hapticLight) window.hapticLight();
        if (act === 'insights' && typeof window.openInsights === 'function') window.openInsights();
        else if (act === 'birthday' && typeof window.openBirthday === 'function') window.openBirthday();
        else if (act === 'unrecorded' && typeof window.openBooking === 'function') window.openBooking();
        else if (act === 'chat' && typeof window.openAssistant === 'function') window.openAssistant();
        else if (typeof window[act] === 'function') {
          try { window[act](); } catch (_e) { /* ignore */ }
        }
      });
    });
  }

  // 마지막으로 render 된 컨테이너 기억 (re-render 용)
  let _lastContainerId = null;

  async function _doRender(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    _lastContainerId = containerId;
    const [brief, ai] = await Promise.all([
      _fetchBrief().catch(() => null),
      _fetchAISuggest().catch(() => null),
    ]);
    if (!brief && !ai) return;
    const items = _buildItems(brief, ai);
    container.innerHTML = _render(items, _greetByHour());
    _bind(container);
  }

  window.TodayBrief = {
    async render(containerId) { return _doRender(containerId); },
  };

  // AISuggestions 호환 alias — 예전에 별도 컨테이너로 호출되던 코드를 위해 no-op.
  // (병합 카드 안에 AI 추천이 함께 그려지므로 별도 렌더 불필요)
  window.AISuggestions = window.AISuggestions || {
    async render(_containerId) { /* no-op (TodayBrief 가 일괄 렌더) */ },
  };

  // 챗봇·외부 데이터 변경 감지 → 홈 탭이 보이면 즉시 재렌더
  if (typeof window !== 'undefined' && !window._todayBriefDataListenerInit) {
    window._todayBriefDataListenerInit = true;
    window.addEventListener('itdasy:data-changed', async () => {
      if (!_lastContainerId) return;
      const homeTab = document.getElementById('tab-home');
      if (!homeTab || !homeTab.classList.contains('active')) return;
      try { await _doRender(_lastContainerId); } catch (_err) { void _err; }
    });
  }
})();
