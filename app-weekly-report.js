// Itdasy Studio — E3: 주간 자동 보고서 (카톡 톤)
// 매주 일요일 자동 모달 또는 홈 카드 "이번 주 보고서" 버튼.
// GET /reports/weekly 호출해서 카톡 풍선 형태 UI 로 표시.
//
// 의존: window.API · window.authHeader · window.showToast (app-core.js)
//
// 외부 진입:
//   window.openWeeklyReport()      — 모달 띄우기
//   window.attachWeeklyReportButton('#hostSelector') — 홈 카드 등에 버튼 주입
//   window.checkAutoWeeklyReport()  — 일요일 자동 1회 표시 (localStorage 로 중복 방지)

(function weeklyReport() {
  'use strict';

  function _api() { return (window.API || ''); }
  function _toast(msg) { if (typeof window.showToast === 'function') window.showToast(msg); }

  async function _fetchReport() {
    const headers = window.authHeader ? window.authHeader() : {};
    const res = await fetch(_api() + '/reports/weekly', { method: 'GET', headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || ('HTTP ' + res.status));
    return data;
  }

  function _bubble(text, sub) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'background:#fef0c7; padding:12px 14px; border-radius:14px 14px 14px 4px; max-width:88%; align-self:flex-start; margin-bottom:10px; box-shadow:0 1px 2px rgba(0,0,0,0.05);';
    const p = document.createElement('div');
    p.style.cssText = 'font-size:14px; color:#1a1a1a; line-height:1.55; white-space:pre-wrap;';
    p.textContent = text;
    wrap.appendChild(p);
    if (sub) {
      const s = document.createElement('div');
      s.style.cssText = 'font-size:11px; color:#888; margin-top:4px;';
      s.textContent = sub;
      wrap.appendChild(s);
    }
    return wrap;
  }

  function _renderBubbles(report) {
    const frag = document.createDocumentFragment();
    const rev = report.revenue || {};
    const cust = report.customers || {};
    const dorm = report.dormant_regular || null;
    const top = report.top_service || null;
    const next = report.next_week || {};
    const greet = report.warm_message || '이번 주도 수고 많으셨어요 💕';

    // 인사
    frag.appendChild(_bubble(`이번 주 보고서 왔어요 📊\n${report.range_label || ''}`));

    // 매출
    const revPctText = (rev.delta_pct === null || rev.delta_pct === undefined)
      ? ''
      : (rev.delta_pct >= 0 ? `(이전 주 대비 +${rev.delta_pct}%) 📈` : `(이전 주 대비 ${rev.delta_pct}%) 📉`);
    frag.appendChild(_bubble(
      `이번 주는 매출 ${rev.count || 0}건 들어왔어요!\n총 ${(rev.total || 0).toLocaleString()}원 ${revPctText}`.trim()
    ));

    // 신규 고객
    if (cust.new_count != null) {
      frag.appendChild(_bubble(`신규 손님 ${cust.new_count}분이고요${cust.new_count >= 3 ? '' : ''}`));
    }

    // 단골 미방문
    if (dorm && dorm.name) {
      frag.appendChild(_bubble(`아 그리고… ${dorm.name}님 ${dorm.days}일째 안 오셨어요. 안부 한 번 어때요?`));
    }

    // 인기 시술
    if (top && top.name) {
      frag.appendChild(_bubble(`이번 주 인기 시술은 "${top.name}" — ${top.count}건 진행하셨네요`));
    }

    // 다음 주 예약
    if (next.count != null) {
      frag.appendChild(_bubble(`다음 주 예약은 ${next.count}건이에요. ${next.count >= 5 ? '바쁘시겠어요!' : '여유로운 한 주!'}`));
    }

    // 마무리 — warm_message
    frag.appendChild(_bubble(greet));

    return frag;
  }

  function _ensureModal() {
    let m = document.getElementById('_weeklyReportModal');
    if (m) return m;

    m = document.createElement('div');
    m.id = '_weeklyReportModal';
    m.style.cssText = 'display:none; position:fixed; inset:0; z-index:9500; background:rgba(0,0,0,0.55); align-items:flex-end; justify-content:center;';
    m.innerHTML = `
      <div style="width:100%; max-width:480px; background:#abc1d1; border-radius:24px 24px 0 0; padding:18px 16px calc(28px + env(safe-area-inset-bottom)); max-height:90vh; display:flex; flex-direction:column;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="font-size:15px; font-weight:800; color:#1a1a1a;">주간 보고서</div>
          <button id="_wrClose" style="background:none; border:none; font-size:22px; width:44px; height:44px; cursor:pointer; color:#1a1a1a;">✕</button>
        </div>
        <div id="_wrBody" style="flex:1; overflow-y:auto; display:flex; flex-direction:column; padding:6px 4px;">
          <div id="_wrLoading" style="text-align:center; padding:40px 0; color:#1a1a1a; font-size:13px;">불러오는 중…</div>
        </div>
      </div>
    `;
    document.body.appendChild(m);
    m.addEventListener('click', (e) => { if (e.target === m) m.style.display = 'none'; });
    m.querySelector('#_wrClose').addEventListener('click', () => m.style.display = 'none');
    return m;
  }

  async function openWeeklyReport() {
    const m = _ensureModal();
    m.style.display = 'flex';
    const body = m.querySelector('#_wrBody');
    body.innerHTML = '<div style="text-align:center; padding:40px 0; color:#1a1a1a; font-size:13px;">불러오는 중…</div>';

    try {
      const data = await _fetchReport();
      body.innerHTML = '';
      body.appendChild(_renderBubbles(data));
      // 자동 표시 마킹 (이번 주는 표시함)
      try { localStorage.setItem('itdasy_weekly_seen', _isoWeekKey()); } catch (_) { /* noop */ }
    } catch (e) {
      const msg = (e && e.message) ? String(e.message) : '오류';
      body.innerHTML = `<div style="text-align:center; padding:30px 16px; color:#1a1a1a; font-size:13px; line-height:1.6;">보고서를 불러오지 못했어요.<br><span style="font-size:11px; color:#555;">${msg.slice(0, 100)}</span></div>`;
      _toast('주간 보고서 실패 — ' + msg.slice(0, 60));
    }
  }

  function _isoWeekKey() {
    const d = new Date();
    const day = d.getDay(); // 0=Sun
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - day);
    return sunday.toISOString().slice(0, 10);
  }

  // 매주 일요일 21:00 KST 이후 첫 진입 시 자동 표시 (1회)
  function checkAutoWeeklyReport() {
    try {
      const now = new Date();
      const isSunday = now.getDay() === 0;
      const afterEvening = now.getHours() >= 21;
      if (!isSunday || !afterEvening) return false;
      const seen = localStorage.getItem('itdasy_weekly_seen');
      if (seen === _isoWeekKey()) return false;
      // 토큰 있을 때만 (로그인 상태)
      const hasToken = !!(typeof window !== 'undefined' && window.authHeader && window.authHeader().Authorization);
      if (!hasToken) return false;
      openWeeklyReport();
      return true;
    } catch (_) {
      return false;
    }
  }

  function attachWeeklyReportButton(targetSelector) {
    const target = document.querySelector(targetSelector);
    if (!target) return false;
    if (target.querySelector('#_wrQuickBtn')) return true;
    const btn = document.createElement('button');
    btn.id = '_wrQuickBtn';
    btn.type = 'button';
    btn.textContent = '이번 주 보고서';
    btn.style.cssText = 'padding:12px 16px; border:none; border-radius:14px; background:#fef0c7; color:#7a5b00; font-weight:800; font-size:14px; cursor:pointer; min-height:44px;';
    btn.addEventListener('click', openWeeklyReport);
    target.appendChild(btn);
    return true;
  }

  window.openWeeklyReport = openWeeklyReport;
  window.checkAutoWeeklyReport = checkAutoWeeklyReport;
  window.attachWeeklyReportButton = attachWeeklyReportButton;

  // 자동 1회 체크 (페이지 로드 후 약간의 지연)
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(checkAutoWeeklyReport, 1500));
    } else {
      setTimeout(checkAutoWeeklyReport, 1500);
    }
  }
})();
