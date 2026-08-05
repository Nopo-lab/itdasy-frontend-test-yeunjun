/* Phase 9 P2 — customers shared SWR cache */
(function () {
  'use strict';

  const KEY = 'pv_cache::customers';
  const TTL = 120 * 1000;
  let _inflight = null;

  // [출시감사 2026-08-05 P0-1] 전체 고객 수(n)도 캐시에 함께 저장한다.
  //   items 만 담으면, 캐시가 warm 한 평소 경로에서 호출부가 total 을 **영영 알 수 없다**
  //   (실측: 다른 모듈이 목록을 프리페치해 캐시를 채워두면 _fetchFresh 가 아예 안 돌아
  //    화면이 계속 "전체 200명" 이었다). 캐시에 넣어야 SWR 경로에서도 진실이 산다.
  function _payload(items, total) {
    return JSON.stringify({
      t: Date.now(),
      d: Array.isArray(items) ? items : [],
      n: Number.isFinite(total) ? total : (Array.isArray(items) ? items.length : 0),
    });
  }

  function _parse(raw) {
    if (!raw) return null;
    const obj = JSON.parse(raw);
    const items = Array.isArray(obj.d) ? obj.d : (Array.isArray(obj.items) ? obj.items : null);
    if (!items) return null;
    const t = Number(obj.t || obj.ts || 0);
    const age = Date.now() - t;
    const total = Number.isFinite(obj.n) ? obj.n : items.length;
    return { items, age, total, fresh: t > 0 && age < TTL };
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

  function set(items, total) {
    const value = _payload(items, total);
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
    _inflight = apiFetch('/customers', { headers: auth })
      .then(async (res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        // [출시감사 2026-08-05 P0-1] 서버가 센 전체 수를 같이 들고 있는다.
        //   items 만 반환하면 호출부가 "캐시 길이 = 전체 고객 수" 로 착각한다 —
        //   그게 화면에 "전체 200명"(실제 10만) 이 뜨던 경로다.
        window.CustomerCache._lastTotal = Number.isFinite(data.total) ? data.total : null;
        window.CustomerCache._lastHasMore = !!data.has_more;
        const arr = Array.isArray(data) ? data : (data.items || []);
        return set(arr, Number.isFinite(data.total) ? data.total : arr.length);
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

  window.CustomerCache = { KEY, TTL, _lastTotal: null, _lastHasMore: false, read, get: (opts) => (read(opts) || {}).items || null, set, clear, fetchFresh, swr };
})();
