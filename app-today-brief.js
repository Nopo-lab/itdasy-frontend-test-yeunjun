/* ─────────────────────────────────────────────────────────────
   오늘의 브리핑 카드 (킬러 #1 · 2026-04-21)

   대시보드 최상단에 오늘 해야 할 일 한 줄 요약 카드.
   GET /today/brief → summary / upcoming / revenue / unrecorded / at_risk / birthday.

   window.TodayBrief.render(containerId) → 비동기 렌더
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  async function _fetchBrief() {
    try {
      const res = await fetch(window.API + '/today/brief', { headers: window.authHeader() });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) { return null; }
  }

  function _greetByHour() {
    const h = new Date().getHours();
    if (h < 6) return '새벽까지 수고 많으세요';
    if (h < 12) return '좋은 아침이에요';
    if (h < 18) return '오후도 화이팅';
    return '오늘도 고생하셨어요';
  }

  function _render(d) {
    const greet = _greetByHour();
    const items = [];
    if (d.upcoming_count > 0 && d.next_booking) {
      const t = new Date(d.next_booking.starts_at);
      const hhmm = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
      items.push({ icon: '⏰', label: `다음 예약 ${hhmm}${d.next_booking.customer_name ? ' · ' + _esc(d.next_booking.customer_name) : ''}`, color: '#F18091' });
    }
    if (d.revenue_total > 0) {
      items.push({ icon: '💰', label: `오늘 매출 ${d.revenue_total.toLocaleString('ko-KR')}원 (${d.revenue_count}건)`, color: '#388e3c' });
    }
    if (d.unrecorded_count > 0) {
      items.push({ icon: '📝', label: `매출 미기록 ${d.unrecorded_count}건 — 탭해서 한꺼번에 정리`, color: '#f57c00', action: 'unrecorded' });
    }
    if (d.at_risk_count > 0) {
      items.push({ icon: '💝', label: `이탈 임박 ${d.at_risk_count}명 — 쿠폰 타이밍`, color: '#dc3545', action: 'insights' });
    }
    if (d.birthday_count > 0) {
      const names = (d.birthday_customers || []).slice(0, 2).map(c => c.name).join(', ');
      items.push({ icon: '🎂', label: `오늘 생일 ${names} — 축하 메시지 보내기`, color: '#8B5CF6', action: 'birthday' });
    }

    if (!items.length) {
      return `
        <div style="padding:16px 18px;border-radius:18px;background:linear-gradient(135deg,#0f0608 0%,#2a1518 100%);color:#fff;margin-bottom:14px;box-shadow:0 8px 24px rgba(15,6,8,0.2);">
          <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:4px;">${_esc(greet)} 👋</div>
          <div style="font-size:15px;font-weight:700;line-height:1.5;">오늘 일정이 비어있어요.<br><span style="font-size:12px;color:rgba(255,255,255,0.5);font-weight:400;">인스타 캡션 한 장 워밍업으로 어때요?</span></div>
        </div>
      `;
    }

    return `
      <div style="padding:18px;border-radius:18px;background:linear-gradient(135deg,#1a0c10 0%,#3a1a22 100%);color:#fff;margin-bottom:14px;box-shadow:0 8px 24px rgba(26,12,16,0.25);">
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:12px;">
          <span style="font-size:18px;">☀️</span>
          <strong style="font-size:14px;">${_esc(greet)}</strong>
          <span style="font-size:11px;color:rgba(255,255,255,0.5);margin-left:auto;">오늘 브리핑</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:9px;">
          ${items.map(it => `
            <div ${it.action ? `data-brief-act="${it.action}" style="cursor:pointer;"` : ''} style="display:flex;gap:10px;align-items:center;padding:8px 10px;background:rgba(255,255,255,0.06);border-radius:10px;border-left:3px solid ${it.color};${it.action ? 'cursor:pointer;' : ''}">
              <span style="font-size:16px;">${it.icon}</span>
              <span style="font-size:12px;line-height:1.4;flex:1;">${_esc(it.label)}</span>
              ${it.action ? '<span style="color:rgba(255,255,255,0.4);font-size:14px;">›</span>' : ''}
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
      });
    });
  }

  // 마지막으로 render 된 컨테이너 기억 (re-render 용)
  let _lastContainerId = null;

  window.TodayBrief = {
    async render(containerId) {
      const container = document.getElementById(containerId);
      if (!container) return;
      _lastContainerId = containerId;
      const d = await _fetchBrief();
      if (!d) return;
      container.innerHTML = _render(d);
      _bind(container);
    },
  };

  // Wave D3 (2026-04-24) — 챗봇·외부 데이터 변경 감지 → 홈 탭이 보이면 즉시 재렌더
  // 모든 mutation kind 가 today_brief 데이터(매출/예약/재고/생일/이탈)에 영향을 줄 수 있으므로 광범위 매칭
  if (typeof window !== 'undefined' && !window._todayBriefDataListenerInit) {
    window._todayBriefDataListenerInit = true;
    window.addEventListener('itdasy:data-changed', async () => {
      if (!_lastContainerId) return;
      const container = document.getElementById(_lastContainerId);
      if (!container) return;
      // 홈 탭이 활성 상태인지 확인 (tab-home 에 .active 있으면 보이는 상태)
      const homeTab = document.getElementById('tab-home');
      if (!homeTab || !homeTab.classList.contains('active')) return;
      try {
        const d = await _fetchBrief();
        if (!d) return;
        container.innerHTML = _render(d);
        _bind(container);
      } catch (_err) { void _err; }
    });
  }
})();
