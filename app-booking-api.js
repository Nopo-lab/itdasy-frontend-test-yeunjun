/* ─────────────────────────────────────────────────────────────
   예약 CRUD + 오프라인 폴백 — window.Booking
   엔드포인트: GET/POST /bookings · PATCH/DELETE /bookings/{id}
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const OFFLINE_KEY    = 'itdasy_bookings_offline_v1';
  const SHOP_HOURS_KEY = 'itdasy_shop_hours_v1';
  // [§10] 기본 표시 09:00~24:00 — 야간 예약(23:40~익일) 가시성 확보. 자정 넘김은 _expandHoursForItems가 추가 확장.
  const DEFAULT_HOURS  = { start: 9, end: 24, slotMin: 30 };

  let _items    = [];
  let _isOffline = false;
  const _cache = {};
  // [P2] 60초 → 5분 (재진입 hit 율 ↑). stale-while-revalidate 패턴이라 fresh 데이터도 백그라운드로 도착.
  const CACHE_TTL = 5 * 60 * 1000;
  let _lastFetchId = 0;  // [BUG-1] SWR race condition 방지용 요청 ID

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
    // [BUG-3] 15초 타임아웃 — 서버 무응답 시 무한 대기 방지
    const _ac = new AbortController();
    const _to = setTimeout(() => _ac.abort(), 15000);
    const opts = { method, headers: { ...auth, 'Content-Type': 'application/json' }, signal: _ac.signal };
    if (body) opts.body = JSON.stringify(body);
    let res;
    try {
      res = await apiFetch(path, opts);
    } finally {
      clearTimeout(_to);
    }
    if (res.status === 404 || res.status === 501) throw new Error('endpoint-missing');
    if (!res.ok) {
      // [P0-2b] 서버 detail 을 그대로 토스트에 — 잔액 부족·만료 같은 400 사유가 사용자에게 보이게 (FE 표준 패턴)
      let _d = null;
      try { _d = await res.json(); } catch (_e) { void _e; }
      throw new Error((_d && _d.detail) || ('HTTP ' + res.status));
    }
    return res.status === 204 ? null : await res.json();
  }

  // [P2] 백그라운드 fresh fetch — stale-while-revalidate 의 fresh 단계
  // 절대 dispatch('itdasy:data-changed') 하지 말 것 — listener 가 cache invalidate + 재호출 → 무한 루프 (사용량 폭발).
  async function _fetchFreshBookings(fromISO, toISO, key, opts) {
    // [2026-07-25 예약QA #1] prefetch(이웃 달 미리불러오기)는 화면용 _items 소유권 경쟁에서 뺀다.
    //   예전엔 prefetch 도 _lastFetchId 를 올리고 마지막 완료가 _items 를 덮어써서, 앱 진입/월이동
    //   직후 _items = '다음 달' 예약이 됐다. findConflict 가 그 _items 를 봐서 표시월의 겹침을
    //   못 잡고 이중예약이 무경고로 생성됐다(충돌검사 상시 무력화). prefetch 는 캐시만 채운다.
    const prefetch = !!(opts && opts.prefetch);
    const fetchId = prefetch ? -1 : (++_lastFetchId);  // prefetch 는 _items 를 세팅하지 않음
    const qs = new URLSearchParams();
    if (fromISO) qs.set('from', fromISO);
    if (toISO)   qs.set('to',   toISO);
    try {
      const d = await _api('GET', '/bookings?' + qs);
      _isOffline = false;
      const items = d.items || [];
      _cache[key] = { t: Date.now(), items };
      // 실(prefetch 아님) fetch 중 더 새로운 요청이 없을 때만 _items 갱신(월 연타 이동 stale 방지).
      if (!prefetch && fetchId === _lastFetchId) {
        _items = items;
      }
      return items;
    } catch (e) {
      if (e.message !== 'endpoint-missing' && e.message !== 'no-token') throw e;
      _isOffline = true;
      const all = _loadOffline();
      const filtered = all.filter(b => {
        const t = new Date(b.starts_at).getTime();
        if (fromISO && t < new Date(fromISO).getTime()) return false;
        if (toISO   && t > new Date(toISO).getTime())   return false;
        return !b.deleted_at;
      });
      if (!prefetch && fetchId === _lastFetchId) {
        _items = filtered;
      }
      return filtered;
    }
  }

  async function list(fromISO, toISO, opts) {
    const prefetch = !!(opts && opts.prefetch);
    const key = (fromISO || '') + '|' + (toISO || '');
    const hit = _cache[key];
    // [P2 SWR] 캐시 있으면 즉시 반환 — TTL 만료면 백그라운드에서 fresh fetch
    if (hit) {
      if (!prefetch) _items = hit.items;   // [#1] prefetch 는 화면용 _items(충돌검사 대상)를 건드리지 않는다
      if (Date.now() - hit.t >= CACHE_TTL) {
        // stale — 백그라운드 갱신 (await X)
        _fetchFreshBookings(fromISO, toISO, key, opts).catch(() => {});
      }
      return prefetch ? hit.items : _items;
    }
    // 캐시 없으면 await
    return _fetchFreshBookings(fromISO, toISO, key, opts);
  }

  // [2026-06-14 QA] 충돌 예약 객체를 반환 → 안내문에 고객명 노출 가능. 없으면 null.
  //   취소·노쇼는 슬롯을 비우므로 충돌 대상에서 제외. ends_at 없으면 기본 60분으로 폴백.
  const _DEFAULT_DUR_MS = 60 * 60 * 1000;
  function findConflict(startsAt, endsAt, excludeId) {
    const sv = new Date(startsAt).getTime(), ev = new Date(endsAt).getTime();
    if (!Number.isFinite(sv) || !Number.isFinite(ev)) return null;
    return _items.find(b => {
      if (excludeId && b.id === excludeId) return false;
      if (b.status === 'cancelled' || b.status === 'no_show') return false;
      const bs = new Date(b.starts_at).getTime();
      if (!Number.isFinite(bs)) return false;
      let be = new Date(b.ends_at).getTime();
      if (!Number.isFinite(be)) be = bs + _DEFAULT_DUR_MS;
      return !(ev <= bs || sv >= be);
    }) || null;
  }
  function hasConflict(startsAt, endsAt, excludeId) {
    return findConflict(startsAt, endsAt, excludeId) != null;
  }

  // [보안감사 M-4 2026-07-26] findConflict 는 현재 로드된 달(_items)만 본다. 폼에서 '다른 달' 날짜를
  //   고르면 그 달의 겹침을 못 잡아 무경고 이중예약이 생긴다. 이 함수는 해당 '날짜'의 예약만
  //   prefetch(_items 는 안 건드림)해서 겹침을 확인한다. 실패/오류 시 null → 저장을 막지는 않는다.
  async function dayConflict(startsAt, endsAt, excludeId) {
    try {
      const sv = new Date(startsAt).getTime(), ev = new Date(endsAt).getTime();
      if (!Number.isFinite(sv) || !Number.isFinite(ev)) return null;
      const dayStart = new Date(startsAt); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(endsAt); dayEnd.setHours(23, 59, 59, 999);
      const items = await list(dayStart.toISOString(), dayEnd.toISOString(), { prefetch: true });
      if (!Array.isArray(items)) return null;
      return items.find(b => {
        if (excludeId && b.id === excludeId) return false;
        if (b.status === 'cancelled' || b.status === 'no_show') return false;
        const bs = new Date(b.starts_at).getTime();
        if (!Number.isFinite(bs)) return false;
        let be = new Date(b.ends_at).getTime();
        if (!Number.isFinite(be)) be = bs + _DEFAULT_DUR_MS;
        return !(ev <= bs || sv >= be);
      }) || null;
    } catch (_e) { return null; }
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
      // [v200] 예약 생성 시 예상 시술비. amount 가 있어야 홈 "오늘 예상매출" 합산에 활용됨.
      amount:        (payload.amount != null && +payload.amount > 0) ? +payload.amount : null,
      // [v206] 예약금 — 노쇼 시 BE 가 자동으로 매출 기록.
      deposit:       (payload.deposit != null && +payload.deposit > 0) ? +payload.deposit : null,
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
    // 2026-05-01 ── 캐시 무효화. 이전엔 _items 만 push 하고 _cache 안 비움 → list() 가
    // stale cache 반환 → 캘린더 재렌더 시 새 예약 안 보임 (사용자 보고 #2).
    _invalidateCache();
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
    _invalidateCache();
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
    _invalidateCache();
    return { ok: true };
  }

  // [보안감사 C-5 2026-07-26] 오프라인(endpoint-missing·no-token)에 만든 예약을 재접속 시 서버로 올린다.
  //   예전엔 OFFLINE_KEY 에 쓰고 성공만 반환할 뿐 flush 경로가 없어서, 온라인 복귀 후 캐시가
  //   서버값으로 덮이면 그 예약이 서버에도 화면에도 없이 영구 소실됐다(노쇼·매출 누락).
  //   생성분만 재전송한다(오프라인 수정/삭제 replay 는 위험해 범위 밖). 성공한 건만 로컬에서 제거.
  let _flushing = false;
  async function _flushOffline() {
    if (_flushing) return;
    if (!window.API || !window.authHeader) return;
    const auth = window.authHeader();
    if (!auth || !auth.Authorization) return; // 토큰 아직 없으면 다음 기회에
    const pending = _loadOffline().filter(b => b && !b.deleted_at);
    if (!pending.length) return;
    _flushing = true;
    let changed = false;
    try {
      for (const rec of pending) {
        const data = {
          starts_at: rec.starts_at, ends_at: rec.ends_at,
          customer_id: rec.customer_id || null, customer_name: rec.customer_name || null,
          service_name: rec.service_name || null, memo: rec.memo || null,
          status: rec.status || 'confirmed',
          amount: (rec.amount != null) ? rec.amount : null,
          deposit: (rec.deposit != null) ? rec.deposit : null,
        };
        try {
          await _api('POST', '/bookings', data);
        } catch (e) {
          // 엔드포인트 여전히 없거나 토큰 문제면 통째로 중단(다음 online 이벤트에 재시도).
          if (e.message === 'endpoint-missing' || e.message === 'no-token') break;
          continue; // 개별 실패(중복·검증 등)는 스킵해 나머지 진행
        }
        _saveOffline(_loadOffline().filter(b => b.id !== rec.id)); // 성공분 제거
        changed = true;
      }
    } finally {
      _flushing = false;
    }
    if (changed) {
      _isOffline = false;
      _invalidateCache();
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'booking' } })); } catch (_e) { void _e; }
    }
  }

  // [2026-04-26] 메모리 캐시 무효화 — 챗봇 등 외부 mutation 발생 시 호출
  function _invalidateCache() {
    for (const k in _cache) delete _cache[k];
    // [v200] 홈 brief / 대시보드 SWR 캐시도 함께 무효화 — 예약 추가/수정/삭제가
    // 홈의 오늘 예상매출 / 완료 카운트에 영향을 주므로 stale 방지.
    try { localStorage.removeItem('hv41_cache::brief');     } catch (_e) { void _e; }
    try { sessionStorage.removeItem('hv41_cache::brief');   } catch (_e) { void _e; }
    try { localStorage.removeItem('mv3_cache::brief');      } catch (_e) { void _e; }
    try { sessionStorage.removeItem('mv3_cache::brief');    } catch (_e) { void _e; }
    try { localStorage.removeItem('pv_cache::dashboard');   } catch (_e) { void _e; }
    try { sessionStorage.removeItem('pv_cache::dashboard'); } catch (_e) { void _e; }
    _removeRevenueCache();
  }

  function _removeRevenueCache() {
    const prefix = 'pv_cache::revenue::';
    try { _removeStoragePrefix(localStorage, prefix); } catch (_e) { void _e; }
    try { _removeStoragePrefix(sessionStorage, prefix); } catch (_e) { void _e; }
  }

  function _removeStoragePrefix(store, prefix) {
    for (let i = store.length - 1; i >= 0; i--) {
      const key = store.key(i);
      if (key && key.indexOf(prefix) === 0) store.removeItem(key);
    }
  }

  // [2026-05-29] 잇비 학습 — 고객별 시술명별 평균 시술비/예약금 (최근 5회, 취소 제외).
  // 1) 현재 로드된 _items (월 캐시) 에서 매칭 시도 → 충분하면 즉시 반환
  // 2) 부족하면 /customers/{id}/dashboard 의 recent_revenues + recent_bookings 으로 보강
  const _learnCache = {};
  async function getCustomerLearning(customerId, serviceName) {
    if (!customerId || !serviceName) return null;
    const key = customerId + '|' + serviceName;
    const hit = _learnCache[key];
    if (hit && Date.now() - hit.t < 5 * 60 * 1000) return hit.v;

    // 1) 메모리 캐시 (월 단위 _items)
    const local = _items.filter(b => String(b.customer_id) === String(customerId)
      && String(b.service_name || '').trim() === String(serviceName).trim()
      && b.status !== 'cancelled');
    const useLocal = local.slice(-5);
    let amts = useLocal.map(b => +b.amount || 0).filter(Boolean);
    let deps = useLocal.map(b => +b.deposit || 0).filter(Boolean);

    // 2) 부족하면 dashboard fetch
    if (amts.length < 1) {
      try {
        if (window.authHeader) {
          const r = await apiFetch('/customers/' + customerId + '/dashboard', { headers: window.authHeader() });
          if (r.ok) {
            const d = await r.json();
            const revs = (d.recent_revenues || [])
              .filter(x => String(x.service_name || '').trim() === String(serviceName).trim());
            amts = revs.map(x => +x.amount || 0).filter(Boolean).slice(0, 5);
          }
        }
      } catch (_) { /* 옵셔널 */ }
    }
    const avg = (arr) => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : null;
    const v = { avgAmount: avg(amts), avgDeposit: avg(deps), count: amts.length };
    _learnCache[key] = { t: Date.now(), v };
    return v;
  }

  window.Booking = {
    list, create, update, remove, hasConflict, findConflict, dayConflict,
    shopHours: _shopHours,
    getCustomerLearning,
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
      // [보안감사 C-5] 복귀/동기화 신호엔 오프라인 생성분부터 서버로 flush (덮이기 전에).
      if (kind && /(force_sync|focus_sync|online_restore)/.test(kind)) { _flushOffline(); }
      _invalidateCache();
    });
    // [보안감사 C-5] 네트워크 복귀 시 오프라인 예약 재전송.
    window.addEventListener('online', () => { _flushOffline(); });
  }
})();
