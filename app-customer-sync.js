/* ─────────────────────────────────────────────────────────────
   예약 생성 → 고객 자동 등록 (T-410)
   캘린더가 booking:created 이벤트 디스패치하면 신규 이름 자동 POST
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const API  = () => window.API  || '';
  const AUTH = () => window.authHeader ? window.authHeader() : {};

  function _localCustomerByName(name) {
    try {
      const raw = sessionStorage.getItem('ch_cache');
      if (!raw) return null;
      const { d = [] } = JSON.parse(raw);
      return d.find(c => (c.name || '').trim() === name.trim()) || null;
    } catch (_) { return null; }
  }

  // [PERF P1-3] debounce — 대량 예약 입력 시 중복 API 호출 방지
  let _syncTimer = null;
  const _pendingNames = new Set();

  window.addEventListener('booking:created', (e) => {
    const { customer_name, customer_id } = e.detail || {};
    if (customer_id)                              return;
    if (!customer_name || !customer_name.trim())  return;
    if (_localCustomerByName(customer_name))      return;

    _pendingNames.add(customer_name.trim());
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(async () => {
      const names = [..._pendingNames];
      _pendingNames.clear();
      for (const name of names) {
        try {
          await fetch(`${API()}/customers?force=true`, {
            method: 'POST',
            headers: { ...AUTH(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, tags: [] }),
          });
        } catch (_e) {
          console.warn('[customer-sync] auto-create fail', _e);
        }
      }
      if (names.length > 0) {
        sessionStorage.removeItem('ch_cache');
        if (window.CustomerHub?.refresh) window.CustomerHub.refresh();
        if (window.showToast) window.showToast(`신규 고객 ${names.length}명 자동 등록됨`);
      }
    }, 500);
  });
})();
