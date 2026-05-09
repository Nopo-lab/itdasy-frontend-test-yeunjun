/* ─────────────────────────────────────────────────────────────
   파워뷰 — Free/Pro 한도 표시 (2026-05-10)

   차단 X (사용자 가드레일: 코드 활성, UI 자문만 윤곽).
   탭별 행 수가 한도에 가까워지면 헤더 옆 chip 으로 알림.
   사용자 클릭 시 plan popup 호출.

   ── 가드레일 ──
   1. 백엔드 신규 0
   2. 차단 X — 정보 표시만
   3. Pro/Premium 사용자에겐 표시 안 함 (window.isPaidPlan)
   4. 파일 ≤200줄

   사용:
     window._PVQuota.chip(tab, list)
     window._PVQuota.bind()
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window._PVQuota) return;

  const FREE_LIMIT = 100; // 탭당 행 수 한도 (잠정)

  function _isPaid() {
    try { return typeof window.isPaidPlan === 'function' ? !!window.isPaidPlan() : false; }
    catch (_e) { return false; }
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function chip(_tab, list) {
    try {
      if (_isPaid()) return '';
      if (!Array.isArray(list)) return '';
      const n = list.length;
      if (n < FREE_LIMIT * 0.7) return ''; // 70% 미만이면 안내 X
      const ratio = Math.min(100, Math.round((n / FREE_LIMIT) * 100));
      const near = n >= FREE_LIMIT * 0.9;
      const cls = near ? 'pv-quota-chip is-warn' : 'pv-quota-chip';
      const label = near ? `Free ${n}/${FREE_LIMIT} — Pro 업그레이드 권유` : `Free ${n}/${FREE_LIMIT}`;
      return `<button type="button" class="${cls}" data-pv-quota-open title="Pro 무제한 + AI 비서 자동 분석">
        ${_esc(label)}
        <span class="pv-quota-chip__bar"><span class="pv-quota-chip__fill" style="width:${ratio}%;"></span></span>
      </button>`;
    } catch (_e) { return ''; }
  }

  function _open() {
    try {
      if (typeof window.openPlan === 'function') return window.openPlan();
      if (typeof window.openPlanPopup === 'function') return window.openPlanPopup();
      if (typeof window.showToast === 'function') window.showToast('Pro 플랜으로 무제한 + AI 자동 분석 가능');
    } catch (_e) { /* silent */ }
  }

  function bind() {
    try {
      document.querySelectorAll('[data-pv-quota-open]').forEach((el) => {
        el.addEventListener('click', _open);
      });
    } catch (e) {
      console.warn('[PVQuota] bind', e);
    }
  }

  window._PVQuota = { chip, bind };
})();
