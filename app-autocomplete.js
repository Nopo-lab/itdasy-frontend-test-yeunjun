/* ─────────────────────────────────────────────────────────────
   공용 자동완성 소스 관리 (T-383a~T-410 공통)
   app-revenue-hub / app-inventory-hub / app-customer-hub 에서 rebuild() 호출
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  const _seen = { customer_name: new Set(), service_name: new Set(), item_name: new Set() };

  function _push(key, val) {
    if (!val || !val.trim()) return;
    const v = val.trim();
    if (_seen[key] && _seen[key].has(v)) return;
    if (_seen[key]) _seen[key].add(v);
    if (window.AppAutocomplete.sources[key]) window.AppAutocomplete.sources[key].push(v);
  }

  window.AppAutocomplete = {
    sources: {
      customer_name: [],
      service_name:  [],
      method:        ['card', 'cash', 'transfer', 'etc'],
      item_name:     [],
      inv_category:  ['nail', 'hair', 'lash', 'skin', 'etc'],
    },

    rebuild(data) {
      Object.keys(_seen).forEach(k => _seen[k].clear());
      ['customer_name', 'service_name', 'item_name'].forEach(k => {
        window.AppAutocomplete.sources[k] = [];
      });
      (data.customers  || []).forEach(c => { _push('customer_name', c.name); });
      (data.revenue    || []).forEach(r => {
        _push('customer_name', r.customer_name);
        _push('service_name',  r.service_name);
      });
      (data.bookings   || []).forEach(b => {
        _push('customer_name', b.customer_name);
        _push('service_name',  b.service_name);
      });
      (data.services   || []).forEach(s => { _push('service_name', s.name); });
      (data.inventory  || []).forEach(i => { _push('item_name', i.name); });
      Object.keys(window.AppAutocomplete.sources).forEach(k => {
        const s = window.AppAutocomplete.sources[k];
        if (s.length > 100) window.AppAutocomplete.sources[k] = s.slice(0, 100);
      });
    },

    renderDatalist() {
      return Object.entries(window.AppAutocomplete.sources)
        .map(([k, items]) =>
          `<datalist id="ac-${k}">${items.map(v => `<option value="${_esc(v)}"></option>`).join('')}</datalist>`)
        .join('');
    },
  };
})();
