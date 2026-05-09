/* ─────────────────────────────────────────────────────────────
   파워뷰 — 자동 합계행 (Phase 2 · 2026-05-09)

   매출/재고 탭 하단에 sticky 합계 chip 노출:
   · 매출: 합계 ₩1,240,000 · 평균 ₩45,000 · 카드 18 / 현금 6 / 회원권 2 · 평균 객단가
   · 재고: 항목 35 · 부족 3 · 사용 가능 32

   현재 list (필터·검색 후) 기준. _PVRender.renderTab 직후 DOM 에 inject.

   ── 가드레일 ──
   1. 백엔드 신규 0
   2. 모듈 미로드 시 빈 문자열 fall-through
   3. 파일 ≤200줄
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window._PVTotals) return;

  function _krw(n) {
    try { return '₩' + (Number(n) || 0).toLocaleString('ko-KR'); }
    catch (_e) { return '₩0'; }
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function _statRevenue(list) {
    const total = list.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const count = list.length;
    const net = list.reduce((s, r) => s + (Number(r.net_amount) || 0), 0);
    const avg = count > 0 ? Math.round(total / count) : 0;
    const methods = list.reduce((acc, r) => {
      const m = r.method || '기타';
      acc[m] = (acc[m] || 0) + 1;
      return acc;
    }, {});
    const methodChips = Object.entries(methods).map(([k, v]) => {
      const label = ({ card: '카드', cash: '현금', membership: '회원권', transfer: '이체' }[k] || k);
      return `<span class="pv-totals__chip">${_esc(label)} ${v}</span>`;
    }).join('');
    return `
      <div class="pv-totals__main">
        <span class="pv-totals__label">합계</span>
        <strong class="pv-totals__value pv-totals__value--brand">${_krw(total)}</strong>
        <span class="pv-totals__sep">·</span>
        <span class="pv-totals__label">실수령</span>
        <strong class="pv-totals__value">${_krw(net)}</strong>
        <span class="pv-totals__sep">·</span>
        <span class="pv-totals__label">평균</span>
        <strong class="pv-totals__value">${_krw(avg)}</strong>
      </div>
      <div class="pv-totals__sub">${methodChips}</div>
    `;
  }

  function _statInventory(list) {
    const total = list.length;
    const low = list.filter((r) => Number(r.quantity || 0) <= Number(r.threshold || 0)).length;
    const out = list.filter((r) => Number(r.quantity || 0) <= 0).length;
    return `
      <div class="pv-totals__main">
        <span class="pv-totals__label">항목</span>
        <strong class="pv-totals__value">${total}개</strong>
        <span class="pv-totals__sep">·</span>
        <span class="pv-totals__label">부족</span>
        <strong class="pv-totals__value pv-totals__value--warn">${low}개</strong>
        ${out > 0 ? `<span class="pv-totals__sep">·</span><span class="pv-totals__label">품절</span><strong class="pv-totals__value pv-totals__value--danger">${out}개</strong>` : ''}
      </div>
    `;
  }

  function _statBooking(list) {
    const total = list.length;
    const today = list.filter((r) => {
      const ymd = (r.starts_at || '').slice(0, 10);
      const t = new Date();
      const td = t.getFullYear() + '-' + String(t.getMonth()+1).padStart(2,'0') + '-' + String(t.getDate()).padStart(2,'0');
      return ymd === td;
    }).length;
    const noshow = list.filter((r) => r.status === 'no_show' || r.no_show_flagged).length;
    return `
      <div class="pv-totals__main">
        <span class="pv-totals__label">예약</span>
        <strong class="pv-totals__value">${total}건</strong>
        <span class="pv-totals__sep">·</span>
        <span class="pv-totals__label">오늘</span>
        <strong class="pv-totals__value pv-totals__value--brand">${today}건</strong>
        ${noshow > 0 ? `<span class="pv-totals__sep">·</span><span class="pv-totals__label">노쇼</span><strong class="pv-totals__value pv-totals__value--danger">${noshow}건</strong>` : ''}
      </div>
    `;
  }

  function _statCustomer(list) {
    const total = list.length;
    const regular = list.filter((r) => !!r.is_regular).length;
    const member = list.filter((r) => !!r.membership_active).length;
    return `
      <div class="pv-totals__main">
        <span class="pv-totals__label">손님</span>
        <strong class="pv-totals__value">${total}명</strong>
        <span class="pv-totals__sep">·</span>
        <span class="pv-totals__label">단골</span>
        <strong class="pv-totals__value pv-totals__value--brand">${regular}명</strong>
        ${member > 0 ? `<span class="pv-totals__sep">·</span><span class="pv-totals__label">회원권</span><strong class="pv-totals__value">${member}명</strong>` : ''}
      </div>
    `;
  }

  function render(tab, list) {
    try {
      if (!Array.isArray(list)) return '';
      const fn = ({
        revenue:   _statRevenue,
        inventory: _statInventory,
        booking:   _statBooking,
        customer:  _statCustomer,
      })[tab];
      if (!fn) return '';
      return `<div class="pv-totals" data-pv-totals>${fn(list)}</div>`;
    } catch (e) {
      console.warn('[PVTotals]', e);
      return '';
    }
  }

  window._PVTotals = { render };
})();
