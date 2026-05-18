/* 잇데이 — 게시물 성과 대시보드 (SN-5) 2026-05-19 v207 */
(function () {
  'use strict';
  if (window.SNSAnalytics) return;
  let _sheetEl = null, _data = null;
  function _esc(s) { return String(s==null?'':s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function _toast(msg) { if (window.showToast) window.showToast(msg); }
  function _ensureSheet() {
    if (_sheetEl) return _sheetEl;
    _sheetEl = document.createElement('div');
    _sheetEl.id = 'snsAnalyticsSheet';
    _sheetEl.style.cssText = 'position:fixed;inset:0;z-index:9500;background:var(--surface,#fff);display:none;flex-direction:column;overflow-y:auto;';
    document.body.appendChild(_sheetEl);
    return _sheetEl;
  }
  async function _fetchInsights() {
    try {
      const API = window.API || '';
      const h = window.authHeader ? window.authHeader() : {};
      const res = await fetch(API + '/instagram/insights', { headers: h });
      if (res.ok) { _data = await res.json(); return; }
    } catch (_) { /* ignore */ }
    _data = _demoData();
  }
  function _demoData() {
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      days.push({ date: `${d.getMonth()+1}/${d.getDate()}`, likes: Math.round(20+Math.random()*80), comments: Math.round(2+Math.random()*15), reach: Math.round(100+Math.random()*500), saves: Math.round(1+Math.random()*20) });
    }
    return {
      daily: days,
      topPosts: [
        { rank:1, caption:'오늘의 시술 결과 ✨', likes:89, comments:12, reach:542 },
        { rank:2, caption:'비포&애프터 확인하세요!', likes:76, comments:8, reach:438 },
        { rank:3, caption:'이벤트 진행중 🎉', likes:65, comments:15, reach:521 },
        { rank:4, caption:'고객님 후기 감사합니다 💕', likes:58, comments:6, reach:312 },
        { rank:5, caption:'오늘의 네일 디자인', likes:52, comments:9, reach:289 },
      ],
      bestTimes: [
        { day:'화요일', time:'11:00', score:95 },
        { day:'목요일', time:'14:00', score:88 },
        { day:'토요일', time:'10:00', score:82 },
      ],
      summary: { totalLikes:1847, totalComments:234, avgReach:385, growthRate:12.5 },
    };
  }
  function _render() {
    const sheet = _ensureSheet();
    const d = _data; if (!d) return;
    const s = d.summary;
    sheet.innerHTML = `
      <header style="display:flex;align-items:center;padding:12px 16px;border-bottom:1px solid rgba(0,0,0,0.06);">
        <button onclick="window.SNSAnalytics.close()" style="background:none;border:none;font-size:18px;cursor:pointer;margin-right:12px;">‹</button>
        <div style="font-size:15px;font-weight:800;">📊 게시물 성과 대시보드</div>
      </header>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;padding:16px;">
        <div style="background:linear-gradient(135deg,#fff0f3,#ffe4ea);border-radius:14px;padding:16px;"><div style="font-size:10px;font-weight:700;color:var(--accent2);margin-bottom:4px;">총 좋아요</div><div style="font-size:24px;font-weight:900;">${(s.totalLikes||0).toLocaleString()}</div></div>
        <div style="background:linear-gradient(135deg,#f0f4ff,#e4edff);border-radius:14px;padding:16px;"><div style="font-size:10px;font-weight:700;color:#5b7dbd;margin-bottom:4px;">총 댓글</div><div style="font-size:24px;font-weight:900;">${(s.totalComments||0).toLocaleString()}</div></div>
        <div style="background:linear-gradient(135deg,#f0fff4,#e4ffe9);border-radius:14px;padding:16px;"><div style="font-size:10px;font-weight:700;color:#4aa865;margin-bottom:4px;">평균 도달</div><div style="font-size:24px;font-weight:900;">${(s.avgReach||0).toLocaleString()}</div></div>
        <div style="background:linear-gradient(135deg,#fffbf0,#fff5e4);border-radius:14px;padding:16px;"><div style="font-size:10px;font-weight:700;color:#c4882b;margin-bottom:4px;">성장률</div><div style="font-size:24px;font-weight:900;">${s.growthRate>0?'+':''}${s.growthRate||0}%</div></div>
      </div>
      <div style="padding:0 16px 16px;"><div style="font-size:14px;font-weight:800;margin-bottom:10px;">📈 30일 추이</div><canvas id="snsAnalyticsChart" width="800" height="300" style="width:100%;height:150px;border-radius:14px;background:#fafafa;"></canvas></div>
      <div style="padding:0 16px 16px;"><div style="font-size:14px;font-weight:800;margin-bottom:10px;">🏆 최고 성과 TOP 5</div>
        ${(d.topPosts||[]).map(p => `<div style="display:flex;align-items:center;gap:12px;padding:12px;background:#fafafa;border-radius:12px;margin-bottom:8px;"><div style="width:28px;height:28px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;">${p.rank}</div><div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(p.caption)}</div><div style="font-size:11px;color:#888;margin-top:2px;">❤️ ${p.likes} · 💬 ${p.comments} · 👁 ${p.reach}</div></div></div>`).join('')}
      </div>
      <div style="padding:0 16px 32px;"><div style="font-size:14px;font-weight:800;margin-bottom:10px;">⏰ AI 추천 발행 시간</div>
        <div style="background:linear-gradient(135deg,rgba(241,128,145,0.06),rgba(241,128,145,0.02));border:1px solid rgba(241,128,145,0.12);border-radius:14px;padding:16px;">
          ${(d.bestTimes||[]).map(t => `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;"><div style="font-size:13px;font-weight:700;">${t.day} ${t.time}</div><div style="display:flex;align-items:center;gap:6px;"><div style="width:60px;height:6px;border-radius:3px;background:#eee;overflow:hidden;"><div style="width:${t.score}%;height:100%;background:var(--accent);border-radius:3px;"></div></div><span style="font-size:11px;font-weight:700;color:var(--accent);">${t.score}점</span></div></div>`).join('')}
        </div>
      </div>`;
    sheet.style.display = 'flex';
    setTimeout(() => _drawChart(d.daily), 100);
  }
  function _drawChart(daily) {
    const cv = document.getElementById('snsAnalyticsChart');
    if (!cv || !daily || !daily.length) return;
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const maxL = Math.max(...daily.map(d => d.likes), 1);
    const pad = { t:20, b:30, l:10, r:10 }, cw = W-pad.l-pad.r, ch = H-pad.t-pad.b;
    ctx.beginPath(); ctx.strokeStyle = '#F18091'; ctx.lineWidth = 2.5;
    daily.forEach((d, i) => { const x = pad.l+(i/(daily.length-1))*cw, y = pad.t+ch-(d.likes/maxL)*ch; i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
    ctx.stroke();
    ctx.font = '600 20px sans-serif'; ctx.fillStyle = '#F18091'; ctx.fillText('● 좋아요', pad.l+10, H-6);
  }
  async function _open() {
    const sheet = _ensureSheet();
    sheet.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;">로딩 중…</div>';
    sheet.style.display = 'flex';
    await _fetchInsights(); _render();
  }
  function _close() { if (_sheetEl) _sheetEl.style.display = 'none'; }
  window.SNSAnalytics = { open: _open, close: _close, _refresh: async()=>{await _fetchInsights();_render();_toast('갱신 완료');} };
})();
