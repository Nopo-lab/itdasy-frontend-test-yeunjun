/* ─────────────────────────────────────────────────────────────
   월말 자동 리포트 (2026-04-21)

   매출·고객·NPS·인기시술을 한 장으로 요약.
   월 선택 네비 + 공유(캡처) 버튼.
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  let _currentY = new Date().getFullYear();
  let _currentM = new Date().getMonth() + 1;

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }
  function _fmt(n) { return (+n || 0).toLocaleString('ko-KR') + '원'; }

  async function _fetch(year, month) {
    const res = await fetch(window.API + `/reports/monthly?year=${year}&month=${month}`, { headers: window.authHeader() });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }

  function _ensureSheet() {
    let sheet = document.getElementById('reportSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'reportSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9999;display:none;background:rgba(0,0,0,0.5);';
    sheet.innerHTML = `
      <div style="position:absolute;inset:auto 0 0 0;background:var(--bg,#fff);border-radius:20px 20px 0 0;max-height:94vh;display:flex;flex-direction:column;padding:16px;padding-bottom:max(16px,env(safe-area-inset-bottom));">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <span style="font-size:22px;">📊</span>
          <strong style="font-size:17px;">월간 리포트</strong>
          <button onclick="closeReport()" style="margin-left:auto;background:rgba(0,0,0,0.05);border:none;width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer;">✕</button>
        </div>
        <div id="reportNav" style="display:flex;align-items:center;gap:8px;margin-bottom:12px;"></div>
        <div id="reportBody" style="flex:1;overflow-y:auto;"></div>
      </div>
    `;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) closeReport(); });
    return sheet;
  }

  function _renderNav() {
    const nav = document.getElementById('reportNav');
    if (!nav) return;
    nav.innerHTML = `
      <button data-nav="prev" style="padding:8px 14px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;">◀</button>
      <div style="flex:1;text-align:center;font-size:15px;font-weight:800;">${_currentY}년 ${_currentM}월</div>
      <button data-nav="next" style="padding:8px 14px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;">▶</button>
    `;
    nav.querySelector('[data-nav="prev"]').addEventListener('click', () => _shift(-1));
    nav.querySelector('[data-nav="next"]').addEventListener('click', () => _shift(1));
  }

  function _shift(n) {
    _currentM += n;
    if (_currentM < 1) { _currentM = 12; _currentY--; }
    if (_currentM > 12) { _currentM = 1; _currentY++; }
    _load();
  }

  function _renderKPI(label, value, sub, grad) {
    return `
      <div style="padding:16px;background:#fff;border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,0.06);position:relative;overflow:hidden;">
        <div style="position:absolute;top:-12px;right:-12px;width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,${grad});opacity:0.2;"></div>
        <div style="font-size:10px;color:#888;font-weight:700;margin-bottom:6px;position:relative;">${_esc(label)}</div>
        <div style="font-size:22px;font-weight:900;color:#1a1a1a;line-height:1.1;letter-spacing:-0.3px;">${_esc(value)}</div>
        <div style="font-size:10px;color:var(--text-subtle);margin-top:4px;">${_esc(sub)}</div>
      </div>
    `;
  }

  function _renderBody(d) {
    const body = document.getElementById('reportBody');
    if (!body) return;
    const r = d.revenue, c = d.customers, n = d.nps, b = d.bookings;
    const empty = (r.total || 0) === 0 && (c.unique_visitors || 0) === 0;
    if (empty) {
      body.innerHTML = `
        <div style="padding:40px 20px;text-align:center;color:var(--text-subtle);">
          <div style="font-size:36px;margin-bottom:10px;">🌱</div>
          <div style="font-size:13px;line-height:1.5;">이 달은 아직 기록이 없어요.<br>매출·고객을 쌓으면 자동으로 리포트가 만들어져요.</div>
        </div>
      `;
      return;
    }

    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
        ${_renderKPI('총 매출', _fmt(r.total), `${r.count}건 · 평균 ${_fmt(r.avg_ticket)}`, 'var(--brand),var(--brand-strong)')}
        ${_renderKPI('방문 고객', `${c.unique_visitors}명`, `신규 ${c.new_registered} · 재방문 ${c.repeat_count}`, '#4ECDC4,#44A08D')}
        ${_renderKPI('리피트율', `${c.repeat_ratio_pct}%`, '2회 이상 방문한 비율', '#FFB347,#FF8A5C')}
        ${_renderKPI('후기 점수', n.score != null ? n.score : '—', n.total ? `${n.total}명 응답 · 평균 ${n.avg}` : '응답 없음', '#A78BFA,#8B5CF6')}
      </div>

      <!-- 인기 시술 -->
      ${d.top_services?.length ? `
        <div style="margin-bottom:14px;padding:14px;background:#fff;border-radius:14px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <div style="font-size:12px;font-weight:800;margin-bottom:10px;">🏆 인기 시술 TOP ${d.top_services.length}</div>
          ${d.top_services.map((s, i) => `
            <div style="display:flex;gap:10px;align-items:center;padding:6px 0;${i>0?'border-top:1px solid rgba(0,0,0,0.04);':''}">
              <div style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,var(--brand),var(--brand-strong));display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:800;flex-shrink:0;">${i+1}</div>
              <div style="flex:1;min-width:0;font-size:13px;font-weight:700;">${_esc(s.name)}</div>
              <div style="font-size:12px;color:var(--accent,var(--brand));font-weight:800;">${_fmt(s.amount)}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <!-- 예약 요약 -->
      <div style="margin-bottom:14px;padding:14px;background:#fff;border-radius:14px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size:12px;font-weight:800;margin-bottom:10px;">예약 현황</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;text-align:center;">
          <div style="padding:8px;background:rgba(0,0,0,0.03);border-radius:8px;">
            <div style="font-size:18px;font-weight:800;">${b.total}</div>
            <div style="font-size:10px;color:#888;">총 예약</div>
          </div>
          <div style="padding:8px;background:rgba(220,53,69,0.08);border-radius:8px;">
            <div style="font-size:18px;font-weight:800;color:#dc3545;">${b.cancelled}</div>
            <div style="font-size:10px;color:#888;">취소</div>
          </div>
        </div>
      </div>

      <div style="padding:12px;background:rgba(241,128,145,0.05);border-radius:10px;font-size:10px;color:#888;line-height:1.5;text-align:center;">
        🎀 잇데이가 매달 자동으로 집계해요. 월 마지막 날 알림으로도 보내드릴게요.
      </div>
    `;
  }

  async function _load() {
    _renderNav();
    const body = document.getElementById('reportBody');
    body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-subtle);">불러오는 중…</div>';
    try {
      const d = await _fetch(_currentY, _currentM);
      _renderBody(d);
    } catch (e) {
      body.innerHTML = '<div style="padding:40px;text-align:center;color:#c00;">불러오기 실패: ' + (window._humanError ? window._humanError(e) : e.message) + '</div>';
    }
  }

  window.openReport = function () {
    _ensureSheet();
    document.getElementById('reportSheet').style.display = 'block';
    document.body.style.overflow = 'hidden';
    _currentY = new Date().getFullYear();
    _currentM = new Date().getMonth() + 1;
    _load();
  };
  window.closeReport = function () {
    const sheet = document.getElementById('reportSheet');
    if (sheet) sheet.style.display = 'none';
    document.body.style.overflow = '';
  };
})();
