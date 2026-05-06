/* Phase 9 P2 — shared DM settings cache */
(function () {
  'use strict';

  const TTL = 60 * 1000;
  let _data = null;
  let _ts = 0;
  let _inflight = null;

  function _headers(json) {
    const h = window.authHeader ? window.authHeader() : {};
    return json ? { ...h, 'Content-Type': 'application/json' } : h;
  }

  async function _request(method, body) {
    if (!window.API) throw new Error('no-api');
    const res = await fetch(window.API + '/instagram/dm-reply/settings', {
      method,
      headers: _headers(Boolean(body)),
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || ('HTTP ' + res.status));
    return data && Object.keys(data).length ? data : body;
  }

  async function get(force) {
    if (!force && _data && Date.now() - _ts < TTL) return _data;
    if (_inflight) return _inflight;
    _inflight = _request('GET')
      .then(data => { _data = data || {}; _ts = Date.now(); return _data; })
      .finally(() => { _inflight = null; });
    return _inflight;
  }

  async function save(settings) {
    const data = await _request('POST', settings || {});
    _data = data || settings || {};
    _ts = Date.now();
    return _data;
  }

  async function patch(partial) {
    const base = _data || await get().catch(() => ({}));
    return save({ ...base, ...(partial || {}) });
  }

  function clear() {
    _data = null;
    _ts = 0;
    _inflight = null;
  }

  window.DmSettingsCache = { get, save, patch, clear };
})();
