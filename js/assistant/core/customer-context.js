/* 잇비 고객 문맥 기억
   - 고객 기록을 열었거나 예약 조회에서 특정 고객이 잡히면 "그 고객"으로 이어서 쓴다.
   - 새 고객 입력 폼을 연 뒤 전화번호만 말해도 같은 이름으로 채운다. */
(function () {
  'use strict';
  if (window.ItdasyCustomerContext) return;

  var LAST_TTL = 15 * 60 * 1000;
  var FORM_TTL = 10 * 60 * 1000;
  var last = null;       // { customer:{id,name,phone?}, source, ts }
  var pendingNew = null; // { name, phone, ts }

  function _trim(s) { return String(s == null ? '' : s).trim(); }
  function _fresh(x, ttl) { return !!(x && Date.now() - (x.ts || 0) < ttl); }
  function _clean(c) {
    if (!c) return null;
    var name = _trim(c.name || c.customer_name);
    var id = c.id != null ? c.id : (c.customer_id != null ? c.customer_id : null);
    if (id == null && !name) return null;
    return { id: id, name: name || '고객', phone: c.phone || '' };
  }

  function remember(customer, source) {
    var c = _clean(customer);
    if (!c) return null;
    last = { customer: c, source: source || '', ts: Date.now() };
    return c;
  }

  function lastCustomer() {
    return _fresh(last, LAST_TTL) ? last.customer : null;
  }

  function armNewCustomer(name, phone) {
    var nm = _trim(name);
    if (!nm) return null;
    pendingNew = { name: nm, phone: _trim(phone), ts: Date.now() };
    return pendingNew;
  }

  function pendingNewCustomer() {
    return _fresh(pendingNew, FORM_TTL) ? pendingNew : null;
  }

  function clearNewCustomer() {
    pendingNew = null;
  }

  function clear() {
    last = null;
    pendingNew = null;
  }

  window.ItdasyCustomerContext = {
    remember: remember,
    lastCustomer: lastCustomer,
    armNewCustomer: armNewCustomer,
    pendingNewCustomer: pendingNewCustomer,
    clearNewCustomer: clearNewCustomer,
    clear: clear,
  };
})();
