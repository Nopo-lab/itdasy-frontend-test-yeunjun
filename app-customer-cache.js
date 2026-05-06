/* Phase 9 P2 — customers shared SWR cache */
(function () {
  'use strict';

  const KEY = 'pv_cache::customers';
  const TTL = 120 * 1000;
  let _inflight = null;

  function _payload(items) {
    return JSON.stringify({ t: Date.now(), d: Array.isArray(items) ? items : [] });
  }

  function _parse(raw) {
    if (!raw) return null;
    const obj = JSON.parse(raw);
    const items = Array.isArray(obj.d) ? obj.d : (Array.isArray(obj.items) ? obj.items : null);
    if (!items) return null;
    const t = Number(obj.t || obj.ts || 0);
    const age = Date.now() - t;
    return { items, age, fresh: t > 0 && age < TTL };
  }

  function read(opts) {
    opts = opts || {};
    try {
      const hit = _parse(localStorage.getItem(KEY)) || _parse(sessionStorage.getItem(KEY));
      if (!hit) return null;
      if (opts.minItems && hit.items.length < opts.minItems) return null;
      return hit;
    } catch (_e) { return null; }
  }

  function set(items) {
    const value = _payload(items);
    try { localStorage.setItem(KEY, value); }
    catch (_e) { try { sessionStorage.setItem(KEY, value); } catch (_e2) { void _e2; } }
    return Array.isArray(items) ? items : [];
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch (_e) { void _e; }
    try { sessionStorage.removeItem(KEY); } catch (_e) { void _e; }
  }

  async function fetchFresh() {
    if (_inflight) return _inflight;
    if (!window.API || !window.authHeader) throw new Error('no-auth');
    const auth = window.authHeader();
    if (!auth || !auth.Authorization) throw new Error('no-token');
    _inflight = fetch(window.API + '/customers', { headers: auth })
      .then(async (res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        return set(Array.isArray(data) ? data : (data.items || []));
      })
      .finally(() => { _inflight = null; });
    return _inflight;
  }

  async function swr(onStale, onFresh, opts) {
    const hit = read(opts);
    if (hit) {
      if (onStale) onStale(hit.items, hit);
      if (hit.fresh) return hit.items;
      fetchFresh().then(items => { if (onFresh) onFresh(items); }).catch(() => {});
      return hit.items;
    }
    const items = await fetchFresh();
    if (onFresh) onFresh(items);
    return items;
  }

  window.CustomerCache = { KEY, TTL, read, get: (opts) => (read(opts) || {}).items || null, set, clear, fetchFresh, swr };
})();
