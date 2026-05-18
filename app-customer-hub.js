/* ─────────────────────────────────────────────────────────────
   고객 허브 — v212 (목업 mockup-customer-v4 기반)
   진입: window.openCustomerHub()
   v209 부터 app-customer.js 의 openCustomers (v4 디자인) 로 위임.
   v212 — 엑셀 임포트 버튼 제거 (사용자 요청).
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function openCustomerHub() {
    if (typeof window.openCustomers === 'function') window.openCustomers();
  }
  function closeCustomerHub() {
    if (typeof window.closeCustomers === 'function') window.closeCustomers();
  }

  window.openCustomerHub  = openCustomerHub;
  window.closeCustomerHub = closeCustomerHub;
  window.CustomerHub = {
    refresh: async () => {
      try { window.CustomerCache?.clear?.(); } catch (_) { void 0; }
      sessionStorage.removeItem('ch_cache');
      const sheet = document.getElementById('customerSheet');
      if (sheet && sheet.classList.contains('dt-shown') && typeof window.openCustomers === 'function') {
        window.openCustomers();
      }
    },
    focusSearch: () => document.querySelector('#customerSheet #customerSearch')?.focus(),
  };
})();
