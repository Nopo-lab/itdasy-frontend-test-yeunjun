/* ─────────────────────────────────────────────────────────────
   매출 상세 리포트 — 일/주/월 토글 풀스크린 (T-383b)
   진입: window.openRevenueReport(period?)
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const OID  = 'revenue-report-overlay';
  const API  = () => window.API  || '';
  const AUTH = () => window.authHeader ? window.authHeader() : {};

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  let _curPeriod = 'month';

  /* ── fetch ─────────────────────────────────────────────────── */
  async function _fetch(period) {
    const res = await fetch(`${API()}/reports/monthly?period=${period}`, { headers: AUTH() });
    if (!res.ok) throw new Error('리포트 불러오기 실패 (HTTP ' + res.status + ')');
    const data = await res.json();
    return {
      total:     data.revenue?.total     ?? data.total     ?? 0,
      count:     data.revenue?.count     ?? data.count     ?? 0,
      delta_pct: data.revenue?.mom_pct   ?? data.mom_pct   ?? null,
      top:       data.top_services       ?? data.topServices ?? [],
    };
  }

  /* ── 렌더 ──────────────────────────────────────────────────── */
  function _renderHeader() {
    return `<div class="hub-header">
      <button class="hub-back" data-act="close" aria-label="뒤로가기">
        <i class="ph-duotone ph-caret-left" aria-hidden="true"></i>
      </button>
      <span class="hub-title">매출 상세 리포트</span>
    </div>`;
  }

  function _renderSegment(current) {
    const labels = { day: '일', week: '주', month: '월' };
    return `<div class="rr-seg-wrap">
      <div class="rr-segment" role="tablist">
        ${['day', 'week', 'month'].map(p => `
          <button class="rr-seg-btn ${p === current ? 'rr-seg-btn--active' : ''}"
                  data-period="${p}" role="tab" aria-selected="${p === current}">
            ${labels[p]}
          </button>`).join('')}
      </div>
    </div>`;
  }

  function _renderHero(data) {
    const total = data.total || 0;
    const count = data.count || 0;
    const avg   = count > 0 ? Math.round(total / count) : 0;
    const delta = data.delta_pct;
    return `<div class="rr-hero">
      <div class="rr-lbl">총매출</div>
      <div class="rr-total">${total.toLocaleString('ko-KR')}원</div>
      <div class="rr-sub">건수 ${count}건 · 평균티켓 ${avg.toLocaleString('ko-KR')}원</div>
      ${delta != null ? `<span class="rr-delta ${delta >= 0 ? 'pos' : 'neg'}">${delta >= 0 ? '↑ +' : '↓ '}${Math.abs(delta)}% (전월 대비)</span>` : ''}
    </div>`;
  }

  function _renderTop(top) {
    if (!top.length) return '<div style="padding:16px 20px;color:var(--text-subtle);font-size:13px;">시술 데이터가 없어요</div>';
    const max = Math.max(...top.map(x => x.amount || 0), 1);
    return `<div class="rr-top">
      <h2 class="rr-sec-title">인기 시술 TOP ${Math.min(top.length, 5)}</h2>
      ${top.slice(0, 5).map((s, i) => `
        <div class="rr-top-row">
          <span class="rr-rank">${i + 1}</span>
          <span class="rr-name">${_esc(s.name || s.service_name || '—')}</span>
          <span class="rr-rev">${(s.amount || 0).toLocaleString('ko-KR')}원</span>
          <div class="rr-bar" style="--pct:${Math.round((s.amount || 0) / max * 100)}%;"></div>
        </div>`).join('')}
    </div>`;
  }

  function _skeletonHtml() {
    return Array.from({ length: 6 }).map((_, i) =>
      `<div class="rr-sk" style="width:${[70,50,85,40,65,55][i]}%;"></div>`
    ).join('');
  }

  /* ── 로드 ──────────────────────────────────────────────────── */
  async function _load(period) {
    const body = document.getElementById('rr-body');
    if (!body) return;
    body.innerHTML = _renderSegment(period) + _skeletonHtml();
    try {
      const data = await _fetch(period);
      body.innerHTML = _renderSegment(period) + _renderHero(data) + _renderTop(data.top);
      _bindSegment();
    } catch (e) {
      body.innerHTML = _renderSegment(period) +
        `<div class="rr-error">
          <div style="font-size:28px;">😕</div>
          <div style="font-size:14px;font-weight:700;color:#555;">리포트를 불러오지 못했어요</div>
          <button class="rr-retry" data-retry="${period}">다시 시도</button>
        </div>`;
      _bindSegment();
      document.querySelector(`[data-retry]`)?.addEventListener('click', (ev) => {
        _load(ev.target.dataset.retry);
      });
    }
  }

  function _bindSegment() {
    document.querySelectorAll(`#${OID} [data-period]`).forEach(btn => {
      btn.addEventListener('click', () => {
        const p = btn.dataset.period;
        if (p === _curPeriod) return;
        _curPeriod = p;
        if (window.hapticLight) window.hapticLight();
        _load(p);
      });
    });
  }

  /* ── open / close ──────────────────────────────────────────── */
  function openRevenueReport(period) {
    _curPeriod = period || 'month';
    if (document.getElementById(OID)) {
      _load(_curPeriod); return;
    }
    const bd = document.createElement('div');
    bd.id = OID + '-bd'; bd.className = 'hub-backdrop';
    bd.style.zIndex = '909';
    bd.addEventListener('click', closeRevenueReport);
    document.body.appendChild(bd);
    const overlay = document.createElement('div');
    overlay.id = OID; overlay.className = 'rr-overlay';
    overlay.innerHTML = `<div class="hub-header">
      <button class="hub-back" data-act="close" aria-label="뒤로가기">
        <i class="ph-duotone ph-caret-left" aria-hidden="true"></i>
      </button>
      <span class="hub-title">매출 상세 리포트</span>
    </div>
    <div id="rr-body"></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-act="close"]').addEventListener('click', closeRevenueReport);
    _load(_curPeriod);
  }

  function closeRevenueReport() {
    document.getElementById(OID + '-bd')?.remove();
    const o = document.getElementById(OID);
    if (!o) return;
    o.remove();
  }

  window.openRevenueReport  = openRevenueReport;
  window.closeRevenueReport = closeRevenueReport;
  window.openReport = function () { openRevenueReport('month'); };
})();
