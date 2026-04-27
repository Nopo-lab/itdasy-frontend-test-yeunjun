/* ─────────────────────────────────────────────────────────────
   예약 CRUD + 오프라인 폴백 — window.Booking
   엔드포인트: GET/POST /bookings · PATCH/DELETE /bookings/{id}
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const OFFLINE_KEY    = 'itdasy_bookings_offline_v1';
  const SHOP_HOURS_KEY = 'itdasy_shop_hours_v1';
  const DEFAULT_HOURS  = { start: 10, end: 22, slotMin: 30 };

  let _items    = [];
  let _isOffline = false;
  const _cache = {};
  const CACHE_TTL = 60000;

  function _uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'b_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }

  function _shopHours() {
    try {
      const raw = localStorage.getItem(SHOP_HOURS_KEY);
      if (raw) return { ...DEFAULT_HOURS, ...JSON.parse(raw) };
    } catch (_) { /* ignore */ }
    return { ...DEFAULT_HOURS };
  }

  function _loadOffline() {
    try { return JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]'); }
    catch (_) { return []; }
  }
  function _saveOffline(list) {
    try { localStorage.setItem(OFFLINE_KEY, JSON.stringify(list)); } catch (_) { /* ignore */ }
  }

  async function _api(method, path, body) {
    if (!window.API || !window.authHeader) throw new Error('no-auth');
    const auth = window.authHeader();
    if (!auth?.Authorization) throw new Error('no-token');
    const opts = { method, headers: { ...auth, 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(window.API + path, opts);
    if (res.status === 404 || res.status === 501) throw new Error('endpoint-missing');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.status === 204 ? null : await res.json();
  }

  async function list(fromISO, toISO) {
    const key = (fromISO || '') + '|' + (toISO || '');
    const hit = _cache[key];
    if (hit && Date.now() - hit.t < CACHE_TTL) {
      _items = hit.items; return _items;
    }
    const qs = new URLSearchParams();
    if (fromISO) qs.set('from', fromISO);
    if (toISO)   qs.set('to',   toISO);
    try {
      const d = await _api('GET', '/bookings?' + qs);
      _isOffline = false;
      _items = d.items || [];
      _cache[key] = { t: Date.now(), items: _items };
      return _items;
    } catch (e) {
      if (e.message !== 'endpoint-missing' && e.message !== 'no-token') throw e;
      _isOffline = true;
      const all = _loadOffline();
      _items = all.filter(b => {
        const t = new Date(b.starts_at).getTime();
        if (fromISO && t < new Date(fromISO).getTime()) return false;
        if (toISO   && t > new Date(toISO).getTime())   return false;
        return !b.deleted_at;
      });
      return _items;
    }
  }

  function hasConflict(startsAt, endsAt, excludeId) {
    const sv = new Date(startsAt).getTime(), ev = new Date(endsAt).getTime();
    return _items.some(b => {
      if (excludeId && b.id === excludeId) return false;
      const bs = new Date(b.starts_at).getTime(), be = new Date(b.ends_at).getTime();
      return !(ev <= bs || sv >= be);
    });
  }

  async function create(payload) {
    if (!payload?.starts_at || !payload?.ends_at) throw new Error('time-required');
    const data = {
      starts_at:     payload.starts_at,
      ends_at:       payload.ends_at,
      customer_id:   payload.customer_id   || null,
      customer_name: payload.customer_name || null,
      service_name:  payload.service_name  ? String(payload.service_name).slice(0, 50) : null,
      memo:          payload.memo          ? String(payload.memo).slice(0, 200) : null,
      status:        'confirmed',
    };
    if (_isOffline) {
      const rec = { id: _uuid(), shop_id: localStorage.getItem('shop_id') || 'offline',
        ...data, created_at: new Date().toISOString(), deleted_at: null };
      const all = _loadOffline();
      all.push(rec); _saveOffline(all); _items.push(rec);
      return rec;
    }
    const created = await _api('POST', '/bookings', data);
    _items.push(created);
    return created;
  }

  async function update(id, patch) {
    if (_isOffline) {
      const all = _loadOffline();
      const i = all.findIndex(b => b.id === id);
      if (i < 0) throw new Error('not-found');
      all[i] = { ...all[i], ...patch }; _saveOffline(all);
      const j = _items.findIndex(b => b.id === id);
      if (j >= 0) _items[j] = all[i];
      return all[i];
    }
    const updated = await _api('PATCH', '/bookings/' + id, patch);
    const j = _items.findIndex(b => b.id === id);
    if (j >= 0) _items[j] = updated;
    return updated;
  }

  async function remove(id) {
    if (_isOffline) {
      _saveOffline(_loadOffline().filter(b => b.id !== id));
      _items = _items.filter(b => b.id !== id);
      return { ok: true };
    }
    await _api('DELETE', '/bookings/' + id);
    _items = _items.filter(b => b.id !== id);
    return { ok: true };
  }

  // [2026-04-26] 메모리 캐시 무효화 — 챗봇 등 외부 mutation 발생 시 호출
  function _invalidateCache() {
    for (const k in _cache) delete _cache[k];
  }

  window.Booking = {
    list, create, update, remove, hasConflict,
    shopHours: _shopHours,
    _invalidateCache,
    get _items()    { return _items; },
    get isOffline() { return _isOffline; },
  };

  // 외부 mutation (챗봇·다른 디바이스) 시 메모리 캐시 즉시 무효화 → 다음 list() 가 fresh
  if (typeof window !== 'undefined' && !window._bookingApiDataListenerInit) {
    window._bookingApiDataListenerInit = true;
    window.addEventListener('itdasy:data-changed', (e) => {
      const kind = e && e.detail && e.detail.kind;
      if (kind && !/(booking|force_sync|focus_sync|online_restore)/.test(kind)) return;
      _invalidateCache();
    });
  }
})();
