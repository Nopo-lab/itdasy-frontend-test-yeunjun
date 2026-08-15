/* ─────────────────────────────────────────────────────────────
   고객 관리 (Phase 2 P0-1) — 경량 CRM

   엔드포인트 (shared/schemas.json 참조):
   - GET    /customers                 목록
   - POST   /customers                 생성
   - GET    /customers/{id}            상세
   - PATCH  /customers/{id}            수정
   - DELETE /customers/{id}            소프트 삭제

   특징:
   - 백엔드 미배포 시 localStorage 오프라인 폴백
   - 원영 T-200 하단 네비와 독립 — 오버레이 시트로 동작
   - openCustomers() 로 외부 진입
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const OFFLINE_KEY = 'itdasy_customers_offline_v1';
  let _cache = null;
  let _isOffline = false;
  // [출시감사 2026-08-05 P0-1] 서버 기준 전체 고객 수 / 더 있는지 / 서버 검색 결과
  let _total = 0;
  let _hasMore = false;
  let _serverHits = null;   // {q, items} — 서버 검색 중일 때만 채워진다
  let _searchTimer = null;

  function _now() { return new Date().toISOString(); }

  function _uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }

  // ── 오프라인 스토어 (백엔드 미배포 시) ──────────────────────
  function _loadOffline() {
    try {
      const raw = localStorage.getItem(OFFLINE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  }
  function _saveOffline(list) {
    try { localStorage.setItem(OFFLINE_KEY, JSON.stringify(list)); } catch (_) { /* storage full — ignore */ }
  }

  // ── 네트워크 호출 공통 ────────────────────────────────────
  // [출시감사 2026-08-05 P1-5] 서버가 준 실패 이유를 **버리지 않는다.**
  //   예전엔 `throw new Error('HTTP ' + res.status)` 라 응답 본문을 통째로 버렸다.
  //   그 결과 409(중복)·402(한도)·401(만료)이 전부 "다시 시도해주세요" 하나로 뭉개졌고,
  //   409 는 재시도해도 영원히 실패하는데 재시도하라고 안내했다(실측).
  //   백엔드가 공들여 쓴 한국어 메시지가 사용자에게 도달하지 못하던 지점.
  function _apiError(status, payload) {
    const d = payload && payload.detail;
    const e = new Error('HTTP ' + status);
    e.status = status;
    e.detail = d;
    // detail 이 객체면 서버가 정한 code(duplicate_customer 등)를 그대로 들고 간다
    e.code = (d && typeof d === 'object') ? d.code : null;
    e.serverMessage = (d && typeof d === 'object') ? d.message : (typeof d === 'string' ? d : null);
    return e;
  }

  async function _api(method, path, body) {
    if (!window.API || !window.authHeader) throw new Error('no-auth');
    const auth = window.authHeader();
    if (!auth?.Authorization) throw new Error('no-token');
    const opts = {
      method,
      headers: { ...auth, 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    let res;
    try {
      res = await apiFetch(path, opts);
    } catch (netErr) {
      // [출시감사 2026-08-05 P1-4] 진짜 네트워크 끊김. 예전엔 이 에러가 그대로 위로 튀어
      //   `_isOffline` 이 영원히 false 였고, 그래서 오프라인 저장 경로가 **한 번도 안 돌았다**
      //   (실측: 네트워크 끊고 고객 추가 → localStorage 0건 → 입력 소실).
      const e = new Error('network-down');
      e.status = 0;
      e.cause = netErr;
      throw e;
    }
    if (res.status === 404 || res.status === 501) throw new Error('endpoint-missing');
    if (!res.ok) {
      let payload = null;
      try { payload = await res.json(); } catch (_e) { void _e; }
      throw _apiError(res.status, payload);
    }
    return res.status === 204 ? null : await res.json();
  }

  // 상태코드 → 원장님이 읽고 **무엇을 해야 할지 아는** 문구.
  //   "다시 시도해주세요" 는 재시도로 풀리는 경우(5xx·네트워크)에만 쓴다.
  function _friendlyError(e, verb) {
    verb = verb || '저장';
    if (!e) return `${verb} 실패 — 다시 시도해주세요`;
    if (e.message === 'network-down') return '인터넷 연결이 끊겼어요. 연결되면 다시 시도해 주세요';
    switch (e.status) {
      case 409:
        if (e.code === 'duplicate_customer') {
          return `이미 등록된 손님이에요${e.detail?.existing_name ? ` (${e.detail.existing_name})` : ''}`;
        }
        if (e.code === 'membership_balance_remains') {
          return e.serverMessage || '회원권 잔액이 남아 있어요';
        }
        return e.serverMessage || '이미 있는 정보예요';
      case 401: return '로그인이 만료됐어요. 다시 로그인해 주세요';
      case 402: return e.serverMessage || '무료 한도에 도달했어요. 멤버십에서 계속 이용할 수 있어요';
      case 403: return '권한이 없어요';
      case 422: return e.serverMessage || '입력값을 확인해 주세요';
      case 429: return '요청이 많아요. 잠시 후 다시 시도해 주세요';
      default:
        return `${verb} 실패 — 다시 시도해주세요`;
    }
  }
  window.CustomerErrorText = _friendlyError;  // 편집 모달(app-customer-dashboard.js)이 함께 쓴다

  // ── Stale-while-revalidate 캐시 — localStorage persistent (앱 재시작 후에도 즉시 렌더)
  const _SWR_KEY = 'pv_cache::customers';
  const _SWR_TTL = 120 * 1000;  // 2분 내 캐시는 신선
  function _readSWR() {
    if (window.CustomerCache?.read) return window.CustomerCache.read();
    try {
      const raw = localStorage.getItem(_SWR_KEY) || sessionStorage.getItem(_SWR_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      return { items: obj.d, total: Number.isFinite(obj.n) ? obj.n : (obj.d || []).length,
               age: Date.now() - obj.t, fresh: Date.now() - obj.t < _SWR_TTL };
    } catch (_e) { return null; }
  }
  function _writeSWR(items) {
    if (window.CustomerCache?.set) return window.CustomerCache.set(items, _total || (items || []).length);
    const payload = JSON.stringify({ t: Date.now(), d: items, n: _total || (items || []).length });
    try { localStorage.setItem(_SWR_KEY, payload); } catch (_e) {
      try { sessionStorage.setItem(_SWR_KEY, payload); } catch (_e2) { void _e2; }
    }
  }
  function _clearSWR() {
    if (window.CustomerCache?.clear) return window.CustomerCache.clear();
    try { localStorage.removeItem(_SWR_KEY); } catch (_e) { void _e; }
    try { sessionStorage.removeItem(_SWR_KEY); } catch (_e) { void _e; }
  }

  // ── [출시감사 2026-08-05 P1-4] 오프라인에 쌓인 고객을 온라인 복귀 시 서버로 올린다 ──
  //   예전엔 이런 큐가 **아예 없었다.** 오프라인 저장소에 쓰기만 하고 서버로 보내는 코드가
  //   어디에도 없어서, 담긴 손님은 그 기기 localStorage 안에서 영원히 나오지 못했다.
  let _flushing = false;
  async function flushPending() {
    if (_flushing) return { sent: 0, left: 0 };
    const list = _loadOffline();
    const pending = list.filter(c => c && c._pendingSync);
    if (!pending.length) return { sent: 0, left: 0 };
    _flushing = true;
    let sent = 0;
    try {
      for (const rec of pending) {
        try {
          // force=true — 오프라인 중에 다른 기기에서 같은 손님을 등록했을 수 있다.
          // 여기서 409 로 막히면 원장님이 적은 내용이 또 사라진다. 중복은 나중에 병합이 낫다.
          await _api('POST', '/customers?force=true', {
            name: rec.name, phone: rec.phone || null, memo: rec.memo || null,
            tags: rec.tags || [], birthday: rec.birthday || null,
          });
          sent += 1;
          const cur = _loadOffline().filter(c => c.id !== rec.id);
          _saveOffline(cur);
        } catch (e) {
          if (e && (e.message === 'network-down' || e.status === 0)) break;  // 아직 오프라인 — 다음 기회에
          // 서버가 거절(422 등) → 무한 재시도 방지로 큐에서 빼고 알린다
          const cur = _loadOffline().filter(c => c.id !== rec.id);
          _saveOffline(cur);
          if (window.showToast) window.showToast(`'${rec.name}' 저장 실패 — ${_friendlyError(e, '저장')}`);
        }
      }
    } finally {
      _flushing = false;
    }
    if (sent) {
      _isOffline = false;
      _clearSWR();
      try { await _fetchFresh(); } catch (_e) { void _e; }
      if (window.showToast) window.showToast(`오프라인에 저장했던 손님 ${sent}명을 올렸어요`);
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'create_customer', optimistic: false } })); } catch (_e) { void _e; }
    }
    return { sent, left: _loadOffline().filter(c => c._pendingSync).length };
  }

  if (typeof window !== 'undefined' && !window._customerSyncListenerInit) {
    window._customerSyncListenerInit = true;
    window.addEventListener('online', () => { flushPending().catch(() => {}); });

    // ── [출시감사 2026-08-05 P2-1] 탭 간 동기화 ──
    //   매출(app-revenue.js)엔 이미 storage 리스너가 있는데(커밋 c7cf3fd "창 두 개면 숫자가
    //   갈렸다") 고객엔 없었다. 실측: 탭 A 에서 손님을 지워도 탭 B 는 계속 보여주고,
    //   그 유령 행을 누르면 "불러오기 실패" 가 났다.
    window.addEventListener('storage', (e) => {
      if (e.key !== _SWR_KEY) return;   // 다른 탭이 고객 캐시를 갱신했다
      try {
        const swr = _readSWR();
        if (!swr) return;
        _cache = swr.items;
        const sheet = document.getElementById('customerSheet');
        if (sheet && sheet.style.display === 'flex') _rerender && _rerender();
      } catch (_err) { void _err; }
    });
  }

  // 챗봇·다른 소스 데이터 변경 감지 → 오픈된 시트 즉시 새로고침
  if (typeof window !== 'undefined' && !window._customerDataListenerInit) {
    window._customerDataListenerInit = true;
    window.addEventListener('itdasy:data-changed', async (e) => {
      const k = e.detail && e.detail.kind;
      // [v212] delete_customer 추가 — 디테일에서 삭제 시 목록 즉시 갱신
      if (k === 'create_customer' || k === 'update_customer' || k === 'delete_customer' ||
          k === 'create_revenue' || k === 'create_booking') {
        _clearSWR();
        const sheet = document.getElementById('customerSheet');
        if (sheet && sheet.style.display === 'flex') {
          try { await _fetchFresh(); _rerender && _rerender(); } catch (_e) { void _e; }
          // PC 면 우측 디테일이 삭제된 고객을 보여주고 있을 수 있음 → 빈 상태로 복귀
          if (k === 'delete_customer') {
            const mount = sheet.querySelector('#cdDetailMount');
            if (mount) mount.innerHTML = '<div class="pc-r-empty">왼쪽에서 손님을 선택하세요</div>';
          }
        }
      }
    });
  }

  // [보안감사 M-7 2026-07-26] POST 진행 중인 옵티미스틱 추가분이 백그라운드 재검증에 덮여
  //   순간 사라지고(사용자가 중복 재등록 유발) 하던 것 방지 — 서버 응답에 아직 없는 옵티미스틱만 보존.
  function _mergeOptimistic(items) {
    const pending = Array.isArray(_cache)
      ? _cache.filter(c => c && (c._optimistic || (typeof c.id === 'string' && c.id.indexOf('__opt_') === 0)))
      : [];
    if (!pending.length || !Array.isArray(items)) return items;
    const haveId = new Set(items.map(c => String(c.id)));
    const haveName = new Set(items.map(c => String(c.name || '').trim()));
    const keep = pending.filter(c => !haveId.has(String(c.id)) && !haveName.has(String(c.name || '').trim()));
    return keep.length ? keep.concat(items) : items;
  }

  async function _fetchFresh() {
    if (window.CustomerCache?.fetchFresh) {
      const items = _mergeOptimistic(await window.CustomerCache.fetchFresh());
      _isOffline = false;
      _cache = items;
      // [출시감사 2026-08-05 P0-1] 이 분기가 우선순위라, 여기서 total 을 안 받으면
      //   아래 직접 fetch 경로에서 아무리 채워도 실제로는 늘 0 이다.
      const t = window.CustomerCache._lastTotal;
      _total = Number.isFinite(t) ? t : items.length;
      _hasMore = !!window.CustomerCache._lastHasMore;
      return _cache;
    }
    const d = await _api('GET', '/customers');
    _isOffline = false;
    _cache = _mergeOptimistic(d.items || []);
    // [출시감사 2026-08-05 P0-1] 서버가 알려주는 **진짜 전체 수**를 들고 있는다.
    //   예전엔 응답 total 이 잘린 개수(=200)와 같아서 화면이 "전체 200명" 이라고 우겼다.
    //   DB 에 10만 명이 있어도 그렇게 보였다. 이제 total > 캐시길이면 서버 검색으로 넘어간다.
    _total = Number.isFinite(d.total) ? d.total : _cache.length;
    _hasMore = !!d.has_more;
    _writeSWR(_cache);
    return _cache;
  }

  // [출시감사 2026-08-05 P0-1] 캐시 밖 손님을 찾기 위한 서버 검색.
  //   프론트 search() 는 캐시(최대 200건)를 filter 할 뿐이라, 201번째부터의 손님은
  //   이름으로도 전화로도 절대 못 찾았다. CRM 에서 이건 기능 부재다.
  async function searchServer(q) {
    const d = await _api('GET', '/customers?limit=200&q=' + encodeURIComponent(q));
    return { items: d.items || [], total: Number(d.total) || 0, hasMore: !!d.has_more };
  }

  // [출시 종결 2026-08-12] 201번째 손님부터 **목록에서** 볼 방법이 없었다.
  //   서버는 예전부터 offset 페이지네이션과 has_more 를 준다. 그런데 `_hasMore` 는
  //   대입만 하고 **읽는 곳이 한 군데도 없었다**(24·253·263행). "+N명 더 보기" 버튼은
  //   이미 받아둔 캐시(최대 200건) 안에서 보이는 창만 넓힐 뿐이라, 손님이 300명이면
  //   100명은 이름을 정확히 쳐서 서버 검색으로만 만날 수 있었다. CRM 에서 그건 기능 부재다.
  //   여기서 다음 페이지를 이어 받는다. 서버 수정은 필요 없다 — 프론트 배선만 빠져 있었다.
  let _loadingMore = false;
  // 서버에 아직 안 받아온 손님이 남았나.
  //   `_hasMore` 하나만 보면 안 된다 — SWR 캐시로 들어오는 경로(list() 의 첫 분기)는
  //   `_total` 만 복원하고 `_hasMore` 는 false 인 채로 남는다. 실제로 그 경로 때문에
  //   버튼이 200명에서 사라졌다(로컬 브라우저 실측: 클릭 3번 → 200행에서 멈춤).
  //   `_total` 은 서버가 센 진짜 전체 수라 이쪽이 더 믿을 만하다.
  function _serverHasMore() {
    return _hasMore || (Number(_total) || 0) > (_cache ? _cache.length : 0);
  }
  async function loadMore() {
    if (_loadingMore || !_serverHasMore()) return false;
    _loadingMore = true;
    try {
      const off = _cache ? _cache.length : 0;
      const d = await _api('GET', `/customers?limit=200&offset=${off}`);
      const got = d.items || [];
      if (got.length) {
        // id 중복 방지 — 사이에 새 손님이 생기면 offset 이 한 칸 밀려 겹칠 수 있다.
        const have = new Set((_cache || []).map(c => String(c.id)));
        _cache = (_cache || []).concat(got.filter(c => !have.has(String(c.id))));
        _writeSWR(_cache);
      }
      if (Number.isFinite(d.total)) _total = d.total;
      // 서버가 has_more 를 안 주더라도 total 로 다시 판정한다.
      _hasMore = (!!d.has_more || (Number(_total) || 0) > _cache.length) && got.length > 0;
      return got.length > 0;
    } catch (e) {
      void e;
      return false;
    } finally {
      _loadingMore = false;
    }
  }

  // ── CRUD ────────────────────────────────────────────────
  async function list() {
    // 1. 캐시 있으면 즉시 반환 (UI 바로 렌더)
    const swr = _readSWR();
    if (swr) {
      _cache = swr.items;
      // [출시감사 2026-08-05 P0-1] 캐시에 적힌 전체 수를 회수한다. 이게 없으면
      //   캐시가 warm 한 평소 경로에서 _total 이 0 으로 남아 서버 검색이 안 켜진다.
      if (Number.isFinite(swr.total)) _total = swr.total;
      // 신선 캐시면 끝. 오래됐으면 백그라운드로 갱신.
      if (!swr.fresh) {
        _fetchFresh().then(fresh => {
          // [BUG-R3-1] JSON.stringify 전체 비교 제거 — 건수/첫ID 간이 비교로 전환
          if (fresh.length !== _cache.length || (fresh[0] && _cache[0] && fresh[0].id !== _cache[0].id)) {
            _cache = fresh;
            _rerender && _rerender();  // UI 자동 갱신
          }
        }).catch(() => {});
      }
      return _cache;
    }
    // 2. 첫 진입 — 네트워크 대기 (한 번뿐)
    try {
      return await _fetchFresh();
    } catch (e) {
      // [출시감사 2026-08-05 P1-4] `network-down` 추가.
      //   예전엔 endpoint-missing / no-token 만 오프라인으로 봤다. 진짜 네트워크 끊김은
      //   `TypeError: Failed to fetch` 라 어디에도 안 걸렸고, 그래서 오프라인 폴백 전체가
      //   **도달 불가능한 죽은 코드**였다(파일 헤더엔 "localStorage 오프라인 폴백" 이라 적혀 있는데도).
      if (e.message === 'endpoint-missing' || e.message === 'no-token' || e.message === 'network-down') {
        _isOffline = true;
        _cache = _loadOffline();
        return _cache;
      }
      throw e;
    }
  }

  const FREE_CUSTOMER_LIMIT = 50;

  function _overLimit() {
    const paid = typeof window.isPaidPlan === 'function' && window.isPaidPlan();
    if (paid) return false;
    const count = (_cache || _loadOffline()).length;
    return count >= FREE_CUSTOMER_LIMIT;
  }

  async function create(payload) {
    if (!payload || !payload.name) throw new Error('name-required');
    if (_overLimit()) {
      const msg = '체험 상태에서는 고객 ' + FREE_CUSTOMER_LIMIT + '명까지 등록할 수 있어요. 잇데이 멤버십에서 더 등록할 수 있어요.';
      if (window.showToast) window.showToast(msg);
      if (typeof window.openPlanPopup === 'function') {
        setTimeout(() => window.openPlanPopup(), 500);
      }
      throw new Error('free-limit-reached');
    }
    const data = {
      name: String(payload.name).trim().slice(0, 50),
      phone: payload.phone ? String(payload.phone).trim().slice(0, 20) : null,
      memo: payload.memo ? String(payload.memo).slice(0, 500) : null,
      tags: Array.isArray(payload.tags) ? payload.tags.slice(0, 10) : [],
      birthday: payload.birthday || null,
    };
    if (_isOffline) {
      const record = {
        id: _uuid(),
        shop_id: localStorage.getItem('shop_id') || 'offline',
        ...data,
        last_visit_at: null,
        visit_count: 0,
        created_at: _now(),
        deleted_at: null,
      };
      const list = _loadOffline();
      list.unshift(record);
      _saveOffline(list);
      _cache = list;
      // [2026-04-26 A9] 오프라인도 동일하게 알리기
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'create_customer', optimistic: false } })); } catch (_e) { void _e; }
      return record;
    }
    // [2026-04-26 A9 픽스] 옵티미스틱 UI — POST 직전 로컬 캐시·대시보드 즉시 반영
    const optimisticRecord = {
      id: '__opt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      shop_id: localStorage.getItem('shop_id') || '',
      ...data,
      last_visit_at: null,
      visit_count: 0,
      created_at: _now(),
      deleted_at: null,
      _optimistic: true,
    };
    if (_cache) _cache.unshift(optimisticRecord);
    try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'create_customer', optimistic: true } })); } catch (_e) { void _e; }
    try {
      const created = await _api('POST', '/customers', data);
      // 옵티미스틱 항목을 실제 데이터로 교체
      if (_cache) {
        const idx = _cache.findIndex(c => c.id === optimisticRecord.id);
        if (idx >= 0) _cache[idx] = created;
        else _cache.unshift(created);
      }
      _writeSWR(_cache);  // SWR 캐시 동기
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'create_customer', optimistic: false } })); } catch (_e) { void _e; }
      return created;
    } catch (err) {
      // 실패 — 옵티미스틱 항목 제거
      if (_cache) _cache = _cache.filter(c => c.id !== optimisticRecord.id);
      _writeSWR(_cache);
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'create_customer', optimistic: false, rollback: true } })); } catch (_e) { void _e; }
      // [출시감사 2026-08-05 P1-4] 네트워크가 끊긴 거면 입력을 버리지 말고 오프라인에 담아둔다.
      //   예전엔 그냥 토스트 띄우고 throw → 원장님이 적은 손님 정보가 그대로 사라졌다.
      if (err && err.message === 'network-down') {
        _isOffline = true;
        const record = {
          id: _uuid(), shop_id: localStorage.getItem('shop_id') || 'offline', ...data,
          last_visit_at: null, visit_count: 0, created_at: _now(), deleted_at: null, _pendingSync: true,
        };
        const list = _loadOffline();
        list.unshift(record);
        _saveOffline(list);
        if (_cache) _cache.unshift(record);
        _writeSWR(_cache);
        if (window.showToast) window.showToast('오프라인이라 이 기기에 저장해뒀어요. 연결되면 알려드릴게요');
        return record;
      }
      // [출시감사 2026-08-05 P1-5] 토스트는 **호출부 한 곳에서만** 띄운다.
      //   예전엔 여기와 _saveCustomerEdit 양쪽이 띄워서 실패 1회에 토스트가 4~6개 겹쳤다
      //   (네트워크 요청은 1건인데 — 실측).
      throw err;
    }
  }

  async function update(id, patch) {
    if (_isOffline) {
      const list = _loadOffline();
      const i = list.findIndex(c => c.id === id);
      if (i < 0) throw new Error('not-found');
      list[i] = { ...list[i], ...patch };
      _saveOffline(list);
      _cache = list;
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'update_customer', optimistic: false } })); } catch (_e) { void _e; }
      return list[i];
    }
    const updated = await _api('PATCH', '/customers/' + id, patch);
    if (_cache) {
      const i = _cache.findIndex(c => c.id === id);
      if (i >= 0) _cache[i] = updated;
    }
    _writeSWR(_cache);  // SWR 캐시 동기
    // [2026-04-26 A9] mutation 이벤트 누락 보충 (대시보드·시트 자동 새로고침)
    try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'update_customer', optimistic: false } })); } catch (_e) { void _e; }
    return updated;
  }

  async function remove(id) {
    if (_isOffline) {
      const list = _loadOffline().filter(c => c.id !== id);
      _saveOffline(list);
      _cache = list;
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'delete_customer', customer_id: id, optimistic: false } })); } catch (_e) { void _e; }
      return { ok: true };
    }
    await _api('DELETE', '/customers/' + id);
    if (_cache) _cache = _cache.filter(c => c.id !== id);
    _writeSWR(_cache);  // SWR 캐시 동기
    // [2026-04-26 A9] mutation 이벤트 누락 보충
    try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'delete_customer', optimistic: false } })); } catch (_e) { void _e; }
    return { ok: true };
  }

  // ── [B38] 한글 초성 검색 ────────────────────────────────
  const _CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  function _chosungMatch(query, name) {
    if (!query || !name) return false;
    const isAllChosung = [...query].every(c => _CHO.includes(c));
    if (!isAllChosung) return false;
    const nameChosung = [...name].map(c => {
      const code = c.charCodeAt(0) - 0xAC00;
      if (code < 0 || code > 11171) return c;
      return _CHO[Math.floor(code / 588)];
    }).join('');
    return nameChosung.startsWith(query);
  }

  // ── 검색 ────────────────────────────────────────────────
  function search(query) {
    if (!_cache) return [];
    const q = String(query || '').trim().toLowerCase();
    if (!q) return _cache;
    // [출시감사 2026-08-05 P0-1] 서버 검색 결과가 도착해 있으면 그걸 쓴다.
    //   캐시(200건) 안에서만 찾던 게 P0 의 정체였다.
    if (_serverHits && _serverHits.q === q) return _serverHits.items;
    // [2026-08-05] 공백 무시 — **서버와 같은 규칙**이어야 한다.
    //   백엔드에만 넣었더니 손님 200명 이하인 샵(=대다수)은 서버 검색을 아예 안 타서
    //   `"테 스트손님1"` 이 라이브에서 0건이었다(실측). 규칙이 갈리면 화면마다 결과가 달라진다.
    const qs = q.replace(/\s+/g, '');
    const sq = s => String(s || '').toLowerCase().replace(/\s+/g, '');
    // 전화는 하이픈·공백을 뺀 숫자로도 맞춰본다 (010-1234-5678 ↔ 01012345678)
    const qd = q.replace(/\D/g, '');
    return _cache.filter(c =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.name && qs && sq(c.name).includes(qs)) ||
      // 전화는 **숫자 3자리 이상**일 때만 부분일치 — 서버와 같은 규칙이다.
      //   예전엔 `c.phone.includes(q)` 라 `"0"` 한 글자에 전 고객이 걸렸다.
      (c.phone && qd.length >= 3 && c.phone.replace(/\D/g, '').includes(qd)) ||
      (c.memo && c.memo.toLowerCase().includes(q)) ||
      (c.tags || []).some(t => t.toLowerCase().includes(q)) ||
      (c.name && _chosungMatch(q, c.name))
    );
  }

  // [v212] PC 한 화면 분할 판정 — 사이드바(232px) + 좌목록(380px) + 디테일(통계 3카드) 까지 모두 표시되려면
  // 전체 viewport 가 충분히 넓어야 함. 부족하면 모바일 풀화면 시트로 폴백.
  // 1280 = 232(sidebar) + 380(pc-l) + 64(padding) + 600(min detail) 근사.
  const _PC_BREAKPOINT = 1280;
  function _isPC() { return window.innerWidth >= _PC_BREAKPOINT; }

  // ── UI: 오버레이 시트 (v4 — 목업 mockup-customer-v4.html) ───────
  function _ensureSheet() {
    let sheet = document.getElementById('customerSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'customerSheet';
    sheet.classList.add('dt-overlay');
    // [출시감사 2026-08-05 접근성] 풀스크린 오버레이인데 대화상자로 선언돼 있지 않았다.
    //   role/aria-modal 이 없으면 스크린리더가 뒤 화면까지 같이 읽어서 어디에 있는지 알 수 없다.
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', '고객관리');
    const isPC = _isPC();
    // [v211] position:fixed 는 유지 (책임 분리). PC 에서는 style-responsive.css 의 공통 오버레이 규칙이
    // inset 을 (header-h, 0, 0, 232px) 로 덮어쓰고 z-index 를 950 으로 낮춤. 모바일은 inline 그대로.
    sheet.style.cssText = isPC
      ? 'position:fixed;inset:0;z-index:9998;display:none;background:var(--surface,#fff);'
      : 'position:fixed;inset:0;z-index:9998;display:none;flex-direction:column;background:var(--surface,#fff);';
    if (isPC) sheet.classList.add('cv4-pc');

    // [2026-07-08 A안] 요약 스트립 — 전체 / 이번 달 새 손님 / 4회+ (탭=필터)
    const statsHTML = `
      <div id="customerStats" class="cv4-stats">
        <button type="button" class="cv4-stat s-all is-on" data-seg="all"><b id="cvStatAll">0</b><span>전체</span></button>
        <button type="button" class="cv4-stat s-new" data-seg="newmonth"><b id="cvStatNew">0</b><span>이번 달 새 손님</span></button>
        <button type="button" class="cv4-stat s-vip" data-seg="v4p"><b id="cvStatVip">0</b><span>4회+ 손님</span></button>
      </div>`;

    const chipsHTML = `
      <div id="customerSegments" class="cv4-chips">
        <button data-seg="all"          class="cv4-chip is-on">전체</button>
        <button data-seg="v1"           class="cv4-chip off">1회</button>
        <button data-seg="v23"          class="cv4-chip green">2~3회</button>
        <button data-seg="v4p"          class="cv4-chip brand">4회+</button>
        <button data-seg="atrisk"       class="cv4-chip off">오래된 방문</button>
        <button data-seg="member"       class="cv4-chip off">회원권</button>
      </div>`;

    const searchInputStyle = "width:100%;height:40px;padding:0 14px 0 38px;border-radius:12px;border:none;background-color:var(--surface-2,#F7F8FA);background-image:url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='%23BBB' viewBox='0 0 24 24'%3E%3Ccircle cx='11' cy='11' r='7' stroke='%23BBB' stroke-width='2' fill='none'/%3E%3Cline x1='16.5' y1='16.5' x2='21' y2='21' stroke='%23BBB' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E&quot;);background-repeat:no-repeat;background-position:12px center;font-size:14px;color:var(--text);outline:none;font-family:inherit;";

    if (isPC) {
      sheet.innerHTML = `
        <div class="pc-l">
          <div class="pc-l-head">
            <div class="cv4-hd">
              <h1>고객관리</h1>
              <button class="cv4-hd-add" id="customerAddBtn" aria-label="고객 추가">+</button>
            </div>
            ${statsHTML}
            <input id="customerSearch" type="search" aria-label="고객 이름 또는 전화번호로 검색" placeholder="이름 · 전화번호 검색" style="${searchInputStyle}margin-bottom:10px;" />
            ${chipsHTML}
          </div>
          <div id="customerList" class="pc-items"></div>
          <div style="padding:10px 24px 12px;display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--text-subtle);border-top:1px solid var(--border);">
            <span id="customerCount"></span>
            <span id="customerOfflineBadge" class="dt-offline-badge" style="display:none;color:var(--danger);">오프라인</span>
          </div>
        </div>
        <div class="pc-r">
          <div id="cdDetailMount" class="cv4-detail" style="min-height:100%;">
            <div class="pc-r-empty">왼쪽에서 손님을 선택하세요</div>
          </div>
        </div>
      `;
    } else {
      sheet.innerHTML = `
        <div class="dt-body" style="padding:56px 16px 80px;position:relative;">
          <button class="dt-back cv4-mobile-back" data-customer-close aria-label="뒤로"
                  style="position:absolute;top:14px;left:10px;background:var(--surface-2,#F7F8FA);border:none;width:36px;height:36px;border-radius:12px;color:var(--text);font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;font-weight:600;z-index:2;">‹</button>
          <div class="cv4-hd">
            <h1 style="font-size:22px;font-weight:700;color:var(--text);letter-spacing:-0.5px;margin:0;">고객관리</h1>
            <button class="cv4-hd-add" id="customerAddBtn" aria-label="고객 추가">+</button>
          </div>
          ${statsHTML}
          <input id="customerSearch" type="search" aria-label="고객 이름 또는 전화번호로 검색" placeholder="이름 · 전화번호 검색" style="${searchInputStyle}margin-bottom:10px;" />
          ${chipsHTML}
          <div id="customerList"></div>
          <div id="customerIdxBar" class="idx-bar"></div>
          <div style="padding-top:12px;display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--text-subtle);">
            <span id="customerCount"></span>
            <span id="customerOfflineBadge" class="dt-offline-badge" style="display:none;color:var(--danger);">오프라인</span>
          </div>
        </div>
      `;
    }
    document.body.appendChild(sheet);
    sheet.querySelector('#customerAddBtn').addEventListener('click', _openAddForm);
    sheet.querySelector('[data-customer-close]')?.addEventListener('click', () => window.closeCustomers());
    // chip + 요약 스트립 클릭 (둘 다 data-seg 필터, is-on 동기화)
    let _activeSeg = 'all';
    sheet.querySelectorAll('.cv4-chip, .cv4-stat').forEach(btn => {
      btn.addEventListener('click', () => {
        _activeSeg = btn.dataset.seg;
        window._customerSeg = _activeSeg;
        sheet.querySelectorAll('.cv4-chip, .cv4-stat').forEach(b => b.classList.toggle('is-on', b.dataset.seg === _activeSeg));
        _windowSize = 50;
        _rerender();
      });
    });
    // [버그7] 검색어 입력 시작 시 활성 필터칩 자동 해제 — 검색과 칩이 AND로 걸려 "4회+ 켠 채 이름 검색 → 0명" 나오던 문제
    sheet.querySelector('#customerSearch').addEventListener('input', (e) => {
      if (String(e.target.value || '').trim() && (window._customerSeg || 'all') !== 'all') {
        _activeSeg = 'all';
        window._customerSeg = 'all';
        sheet.querySelectorAll('.cv4-chip, .cv4-stat').forEach(b => b.classList.toggle('is-on', b.dataset.seg === 'all'));
      }
      const raw = String(e.target.value || '').trim();
      const q = raw.toLowerCase();
      if (_serverHits && _serverHits.q !== q) _serverHits = null;
      _rerender();   // 로컬 캐시로 먼저 즉시 그린다 (대부분의 샵은 이걸로 끝)

      // [출시감사 2026-08-05 P0-1] 캐시 밖에 손님이 더 있으면 서버로 찾으러 간다.
      //   `_total <= _cache.length` 인 샵(대다수)은 네트워크를 아예 안 탄다.
      clearTimeout(_searchTimer);
      //  _total 이 0 = "아직 모름" → 안전하게 서버에 물어본다. 모른다고 안 물어보면
      //  캐시 밖 손님이 다시 안 보이게 되고, 그게 원래 P0 였다.
      const known = _total > 0;
      if (!q || _isOffline || (known && _total <= (_cache ? _cache.length : 0))) return;
      _searchTimer = setTimeout(async () => {
        try {
          const r = await searchServer(raw);
          if (sheet.querySelector('#customerSearch').value.trim().toLowerCase() !== q) return;  // 그새 바뀜
          _serverHits = { q, items: r.items, total: r.total, hasMore: r.hasMore };
          _windowSize = 50;
          _rerender();
        } catch (_err) { void _err; }   // 실패해도 로컬 결과는 이미 떠 있다
      }, 300);
    });
    return sheet;
  }

  // ── [2026-08-05] 중복 손님 정리(병합) ────────────────────────────
  //  `POST /customers/merge` 는 예전부터 있었는데 **프론트 호출처가 0건**이었다 —
  //  즉 중복이 생겨도 원장님이 합칠 방법이 없었다. 목록에 배너를 띄우고, 여기서 끝낸다.
  //  중복 탐색은 서버가 한다(`GET /customers/duplicates`) — 캐시 200건만 훑으면
  //  201번째부터의 중복은 영영 못 찾고, 중복은 오래된 손님 쪽에 더 쌓인다.
  let _dupGroups = null;      // null=아직 안 봄 · []=없음
  let _dupChecked = false;

  let _dupTotal = 0;
  async function fetchDuplicates() {
    const d = await _api('GET', '/customers/duplicates?limit=50');
    _dupGroups = d.groups || [];
    // 서버가 센 **전체** 묶음 수. 화면에 보이는 건 최대 50묶음이라 배너 숫자와 갈릴 수 있다.
    _dupTotal = Number.isFinite(d.total_groups) ? d.total_groups : _dupGroups.length;
    _dupChecked = true;
    return _dupGroups;
  }

  async function mergeCustomers(sourceId, targetId) {
    return _api('POST', `/customers/merge?source_id=${encodeURIComponent(sourceId)}&target_id=${encodeURIComponent(targetId)}`);
  }

  function _dupBannerHTML() {
    if (!_dupGroups || !_dupGroups.length) return '';
    const n = _dupTotal || _dupGroups.length;
    return `
      <button type="button" id="cvDupBanner" data-haptic
        style="width:100%;min-height:44px;display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:10px 14px;border:1px solid var(--border,#E5E7EB);border-radius:14px;background:var(--surface-2,#F7F8FA);cursor:pointer;font-family:inherit;text-align:left;">
        <svg width="16" height="16" aria-hidden="true" style="flex:none;"><use href="#ic-users"/></svg>
        <span style="flex:1;font-size:13px;color:var(--text);">같은 손님으로 보이는 기록 <b>${n}묶음</b>이 있어요</span>
        <span style="font-size:12px;color:var(--brand,#D58A95);font-weight:700;">정리하기</span>
      </button>`;
  }

  function _bindDupBanner(box) {
    const b = box.querySelector('#cvDupBanner');
    if (b) b.addEventListener('click', _openMergeScreen, { once: true });
  }

  function _openMergeScreen() {
    const box = document.getElementById('customerList');
    if (!box) return;
    _isDetailOpen = true;                       // 목록 재렌더가 이 화면을 덮지 않게
    history.pushState({ customerMerge: true }, '');
    const groups = _dupGroups || [];
    box.innerHTML = `
      <div id="cvMergeScreen">
        <button type="button" data-merge-back class="dt-back" aria-label="뒤로"
          style="min-width:44px;min-height:44px;margin-bottom:12px;"><svg width="20" height="20" aria-hidden="true"><use href="#ic-chevron-left"/></svg></button>
        <h2 style="font-size:17px;font-weight:800;margin:0 0 4px;color:var(--text);">중복 손님 정리</h2>
        <p style="font-size:12px;color:var(--text2,#5A6573);margin:0 0 16px;line-height:1.5;">
          남길 손님을 고르면 나머지 기록(예약·매출·회원권·메모)이 그쪽으로 옮겨가요.<br>기록은 사라지지 않아요.
        </p>
        ${_dupTotal > groups.length ? `<p style="font-size:12px;color:var(--text2,#5A6573);margin:-8px 0 14px;">먼저 ${groups.length}묶음만 보여드려요. 정리하면 다음 묶음이 이어서 나와요.</p>` : ''}
        ${groups.length ? groups.map((g, gi) => `
          <div class="cv-dup-group" data-gi="${gi}" style="border:1px solid var(--border,#E5E7EB);border-radius:14px;padding:14px;margin-bottom:12px;">
            <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:2px;">${_esc(g.display_name || '')}</div>
            <div style="font-size:12px;color:var(--text2,#5A6573);margin-bottom:10px;">${_esc(g.phone || '연락처 없음')} · ${g.count}건</div>
            <div role="radiogroup" aria-label="${_esc(g.display_name || '')} 남길 손님 선택">
            ${g.members.map(m => `
              <label style="display:flex;align-items:center;gap:10px;min-height:44px;padding:6px 4px;cursor:pointer;">
                <input type="radio" name="dup${gi}" value="${m.id}" ${m.id === g.suggested_target_id ? 'checked' : ''}
                  style="width:20px;height:20px;flex:none;accent-color:var(--brand,#D58A95);">
                <span style="flex:1;font-size:13px;color:var(--text);">
                  방문 ${m.visit_count}회${m.membership_balance ? ` · 회원권 ${Number(m.membership_balance).toLocaleString()}원` : ''}
                  ${m.memo ? `<br><span style="font-size:11px;color:var(--text2,#5A6573);">${_esc(m.memo)}</span>` : ''}
                </span>
              </label>`).join('')}
            </div>
            <button type="button" data-merge-run="${gi}" data-haptic
              style="width:100%;min-height:44px;margin-top:8px;border:none;border-radius:12px;background:var(--brand,#D58A95);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">
              이 묶음 합치기
            </button>
          </div>`).join('') : '<div class="dt-empty">정리할 중복이 없어요.</div>'}
      </div>`;
    box.querySelector('[data-merge-back]').addEventListener('click', () => {
      _isDetailOpen = false;
      history.back();
    });
    box.querySelectorAll('[data-merge-run]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (btn.dataset.busy === '1') return;
        const gi = +btn.dataset.mergeRun;
        const g = (_dupGroups || [])[gi];
        if (!g) return;
        const picked = box.querySelector(`input[name="dup${gi}"]:checked`);
        if (!picked) return;
        const targetId = +picked.value;
        const sources = g.members.map(m => m.id).filter(id => id !== targetId);
        btn.dataset.busy = '1'; btn.disabled = true; btn.textContent = '합치는 중…';
        let done = 0;
        try {
          // 순차 실행 — 같은 target 에 동시에 밀어넣으면 방문수 누적이 겹칠 수 있다
          for (const sid of sources) {
            await mergeCustomers(sid, targetId);
            done += 1;
          }
          if (window.hapticLight) window.hapticLight();
          if (window.showToast) window.showToast(`${done + 1}건을 하나로 합쳤어요`);
          _clearSWR();
          await _fetchFresh();
          await fetchDuplicates();
          if ((_dupGroups || []).length) _openMergeScreen();
          else { _isDetailOpen = false; history.back(); }
        } catch (e) {
          console.warn('[customer merge]', e);
          if (window.showToast) window.showToast(_friendlyError(e, '합치기'));
          btn.dataset.busy = '0'; btn.disabled = false; btn.textContent = '이 묶음 합치기';
        }
      });
    });
  }
  window._openCustomerMergeScreen = _openMergeScreen;

  // [v208] 한글 초성 추출 — 가나다 그룹핑
  function _firstChosung(name) {
    const ch = String(name || '').charAt(0);
    if (!ch) return '#';
    const code = ch.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const CHOSUNG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
      const idx = Math.floor((code - 0xAC00) / 588);
      const merge = { 'ㄲ':'ㄱ','ㄸ':'ㄷ','ㅃ':'ㅂ','ㅆ':'ㅅ','ㅉ':'ㅈ' };
      const c = CHOSUNG[idx];
      return merge[c] || c;
    }
    return '#';
  }
  const _CHOSUNG_ORDER = ['ㄱ','ㄴ','ㄷ','ㄹ','ㅁ','ㅂ','ㅅ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ','#'];

  // [v208] 방문횟수 → 컬러바 클래스
  function _barClass(vc) {
    // [2026-07-08] 칩 계급제(1회/2~3회/4회+)와 색 기준 통일
    if (vc >= 4) return 'b3';
    if (vc >= 2) return 'b2';
    return 'b1';
  }

  // [2026-07-08] 마지막 방문 서브라인 — "3주 전" 등. 기록 없으면 빈 문자열.
  function _lastVisitLabel(iso) {
    if (!iso) return '';
    const t = Date.parse(iso);
    if (!isFinite(t)) return '';
    const days = Math.floor((Date.now() - t) / 86400000);
    if (days <= 0)   return '오늘 방문';
    if (days === 1)  return '어제 방문';
    if (days < 14)   return `${days}일 전 방문`;
    if (days < 60)   return `${Math.round(days / 7)}주 전 방문`;
    if (days < 365)  return `${Math.round(days / 30)}달 전 방문`;
    return `${Math.floor(days / 365)}년 전 방문`;
  }

  // [2026-07-08 A안] 이번 달 등록 여부 — 요약 스트립 "새 손님" + NEW 배지 공용
  function _isThisMonth(iso) {
    if (!iso) return false;
    const t = new Date(iso);
    if (isNaN(t)) return false;
    const n = new Date();
    return t.getFullYear() === n.getFullYear() && t.getMonth() === n.getMonth();
  }
  // [v214] 디테일 표시 — _isPC() 가 아닌 시트 실제 상태(cv4-pc 클래스) 로 판단
  function _selectCustomer(id, rowEl) {
    const sheet = document.getElementById('customerSheet');
    const mount = sheet ? sheet.querySelector('#cdDetailMount') : null;
    // 시트가 PC 분할 마크업이면 우측 mount, 아니면 풀화면 시트
    if (sheet && sheet.classList.contains('cv4-pc') && mount) {
      mount.classList.add('cv4-detail');
      sheet.querySelectorAll('.pi.on').forEach(el => el.classList.remove('on'));
      if (rowEl) rowEl.classList.add('on');
      if (typeof window._renderCustomerDetail === 'function') {
        window._renderCustomerDetail(mount, id);
      } else {
        mount.innerHTML = '<div class="pc-r-empty">디테일 모듈 미준비</div>';
      }
    } else {
      if (typeof window.openCustomerDashboard === 'function') {
        window.openCustomerDashboard(id);
      }
    }
  }

  // [렉 박멸 2026-04-26] windowing — 고객 1000명 한 번에 렌더 → 첫 50명 + "더 보기".
  // _windowSize 초기값 50, "더 보기" 클릭마다 +50.
  let _windowSize = 50;
  const WINDOW_STEP = 50;

  // [버그3] 내부 태그(snake_case) 표시용 매핑 — BE가 DB에 저장한 내부 태그(dm_auto_registered 등)가
  // 목록 서브라인에 raw로 노출되던 문제. 기존 고객 데이터라 FE 매핑 필수(BE만 고치면 기존 고객 깨짐).
  const _TAG_LABELS = { dm_auto_registered: 'DM 자동 등록' };
  window.itdDisplayTag = function (t) {
    const raw = String(t || '').trim();
    if (_TAG_LABELS[raw]) return _TAG_LABELS[raw];
    // 매핑 없는 미지의 snake_case 내부태그(영문 소문자/숫자 + 언더스코어)는 숨김
    if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(raw)) return null;
    return raw;
  };

  function _rerender() {
    const sheet = document.getElementById('customerSheet');
    if (!sheet) return;
    const q = sheet.querySelector('#customerSearch').value;
    let items = search(q);
    // [2026-04-29 E2] 세그먼트 필터
    const seg = window._customerSeg || 'all';
    if (seg !== 'all' && items.length) {
      const now = Date.now();
      const ATRISK_DAYS = 60;
      items = items.filter(c => {
        const vc = c.visit_count || 0;
        // [2026-07-08] 방문 횟수 계급제 — 1회 / 2~3회 / 4회+ (기준 명확화, is_regular 는 칩에서 제외)
        if (seg === 'v1')            return vc === 1;
        if (seg === 'v23')           return vc === 2 || vc === 3;
        if (seg === 'v4p')           return vc >= 4;
        if (seg === 'newmonth')      return _isThisMonth(c.created_at);
        // legacy 호환 — 옛 칩 저장값이 들어와도 안 깨지게 새 기준으로 매핑
        if (seg === 'first_visit')   return vc === 1;
        if (seg === 'revisit')       return vc === 2 || vc === 3;
        if (seg === 'regular')       return vc >= 4;
        if (seg === 'member')        return !!c.membership_active || (Number(c.membership_balance) > 0);
        // legacy 호환 — 옛 칩/저장값(localStorage)이 들어와도 안 깨지게 새 정의에 매핑
        if (seg === 'visits12')      return vc >= 1 && vc <= 2;
        if (seg === 'visits3plus')   return vc >= 3 || !!c.is_regular;
        if (seg === 'visits10plus')  return vc >= 10;
        if (seg === 'new')           return vc === 1;
        if (seg === 'visits1')       return vc === 1;
        if (seg === 'visits23')      return vc === 2;
        if (seg === 'visits4plus')   return vc >= 3;
        if (seg === 'atrisk') {
          if (!c.last_visit_at) return false;
          const t = Date.parse(c.last_visit_at);
          if (!isFinite(t)) return false;
          const days = (now - t) / 86400000;
          // 평균 재방문 주기(주) * 7 + 7일 grace. 없으면 60일 폴백.
          const cycle = c.avg_cycle_weeks ? (+c.avg_cycle_weeks * 7 + 7) : ATRISK_DAYS;
          return days >= cycle;
        }
        return true;
      });
    }
    const box = sheet.querySelector('#customerList');
    const count = sheet.querySelector('#customerCount');
    const offBadge = sheet.querySelector('#customerOfflineBadge');
    // [출시감사 2026-08-05 P0-1] 전체 수는 **서버가 센 값**(_total). 캐시 길이가 아니다.
    const shopTotal = Math.max(_total || 0, _cache ? _cache.length : 0);
    count.textContent = shopTotal + '명' + (seg !== 'all' ? ` · ${items.length}명 표시` : '');
    offBadge.style.display = _isOffline ? 'inline-block' : 'none';

    // [2026-07-08 A안] 요약 스트립 숫자 갱신 (필터와 무관하게 전체 기준)
    const elAll = sheet.querySelector('#cvStatAll');
    if (elAll) {
      const all = _cache || [];
      elAll.textContent = shopTotal;
      // 손님이 캐시(200명)보다 많으면 아래 두 숫자는 **최근 200명 기준**이라 전체가 아니다.
      //   틀린 수를 전체인 척 보여주느니 무엇의 숫자인지 밝힌다.
      const partial = shopTotal > all.length;
      sheet.querySelector('#cvStatNew').textContent = all.filter(c => _isThisMonth(c.created_at)).length;
      sheet.querySelector('#cvStatVip').textContent = all.filter(c => (c.visit_count || 0) >= 4).length;
      const newLbl = sheet.querySelector('#cvStatNew')?.nextElementSibling;
      const vipLbl = sheet.querySelector('#cvStatVip')?.nextElementSibling;
      if (newLbl) newLbl.textContent = partial ? '새 손님 (최근 200명 중)' : '이번 달 새 손님';
      if (vipLbl) vipLbl.textContent = partial ? '4회+ (최근 200명 중)' : '4회+ 손님';
    }

    if (!items.length) {
      box.innerHTML = _dupBannerHTML()
        + `<div class="dt-empty">${_cache && _cache.length ? (seg !== 'all' ? '이 세그먼트에 해당하는 고객이 없어요.' : '검색 결과 없음') : '+ 버튼을 눌러 첫 고객을 등록해보세요'}</div>`;
      _bindDupBanner(box);
      return;
    }
    // 검색 키워드 바뀌면 window 리셋
    const lastQ = box.dataset.lastQ || '';
    if (lastQ !== q) { _windowSize = 50; box.dataset.lastQ = q; }
    const totalLen = items.length;
    // [출시 종결 2026-08-12] 서버에 아직 안 받아온 손님이 남았는지.
    //   검색·세그먼트 필터가 걸린 상태에서는 서버 페이지네이션을 이어붙이면 안 된다
    //   (필터는 캐시 위에서 도는 계산이라 페이지가 섞인다). 전체 목록일 때만 켠다.
    const serverMore = _serverHasMore() && !q && seg === 'all';
    const visible = items.slice(0, _windowSize);
    const hasMore = totalLen > _windowSize || serverMore;

    // [v208] 가나다 그룹 + v4 row 마크업
    const isPC = _isPC();
    const rowCls = isPC ? 'pi customer-row' : 'c-row customer-row';
    const itemsByChosung = {};
    visible.forEach(c => {
      const key = _firstChosung(c.name);
      (itemsByChosung[key] = itemsByChosung[key] || []).push(c);
    });
    const groupsHtml = _CHOSUNG_ORDER
      .filter(k => itemsByChosung[k] && itemsByChosung[k].length)
      .map(k => {
        const rows = itemsByChosung[k].map(c => {
          const vc = c.visit_count || 0;
          const barCls = _barClass(vc);
          const badgeCls = barCls;
          // [2026-07-08 A안] 서브라인=태그(없으면 숨김), 우측=마지막 방문, NEW=이번 달 등록. 꺾쇠 삭제.
          const tags = Array.isArray(c.tags) ? c.tags.map(window.itdDisplayTag).filter(Boolean).slice(0, 3).map(_esc).join(' · ') : '';
          const lastV = _lastVisitLabel(c.last_visit_at);
          const newBadge = _isThisMonth(c.created_at) ? '<span class="c-badge nw">NEW</span>' : '';
          return `<div class="${rowCls}" data-id="${c.id}" data-chosung="${k}" role="button" tabindex="0">
            <div class="c-bar ${barCls}"></div>
            <div class="c-info">
              <div class="c-name"><span class="c-name-txt">${_esc(c.name)}</span><span class="c-badge ${badgeCls}">${vc}회</span>${newBadge}</div>
              ${tags ? `<div class="c-sub">${tags}</div>` : ''}
            </div>
            ${lastV ? `<div class="c-last">${lastV.replace(' 방문', '')}<span>방문</span></div>` : ''}
          </div>`;
        }).join('');
        const secCls = isPC ? 'pi-sec' : 'sec-hd';
        return `<div class="${secCls}" id="cv4-sec-${encodeURIComponent(k)}">${k}</div>${rows}`;
      }).join('');

    box.innerHTML = _dupBannerHTML()
      + groupsHtml
      + (hasMore
          ? `<button id="customerLoadMore" type="button" style="width:calc(100% - 20px);min-height:44px;margin:12px 10px;padding:11px;border:1px dashed hsl(220,15%,80%);border-radius:12px;background:var(--surface-2);color:var(--text);font-size:13px;font-weight:600;cursor:pointer;">+ ${Math.max(1, (serverMore ? Math.max(shopTotal, totalLen) : totalLen) - _windowSize)}명 더 보기</button>`
          : '');

    // 우측 인덱스바 (모바일만)
    const idxBar = sheet.querySelector('#customerIdxBar');
    if (idxBar) {
      const presentChosung = _CHOSUNG_ORDER.filter(k => itemsByChosung[k] && itemsByChosung[k].length);
      idxBar.innerHTML = presentChosung.map(k => `<span data-jump="${k}">${k}</span>`).join('');
      idxBar.querySelectorAll('span[data-jump]').forEach(sp => {
        sp.addEventListener('click', () => {
          const target = box.querySelector(`#cv4-sec-${encodeURIComponent(sp.dataset.jump)}`);
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }

    const more = box.querySelector('#customerLoadMore');
    if (more) {
      more.addEventListener('click', async () => {
        _windowSize += WINDOW_STEP;
        // [출시 종결 2026-08-12] 캐시 끝에 닿았는데 서버에 더 있으면 다음 페이지를 받아온다.
        //   예전엔 이 분기가 없어서 창만 넓히다가 200번째에서 멈췄다.
        if (serverMore && _windowSize > (_cache ? _cache.length : 0)) {
          more.disabled = true;
          more.textContent = '불러오는 중…';
          await loadMore();
        }
        _rerender();
      }, { once: true });
    }
    _bindDupBanner(box);
    _setupCustomerDelegation(box);
  }

  // ─── 고객 행 이벤트 위임 ──────────────────────────────────
  // _rerender() 가 innerHTML 을 갈아끼워도 컨테이너 자체는 유지되므로 1회 등록으로 충분.
  // [v214] 단, 시트 자체가 PC↔모바일 모드 변경으로 재생성되면 listEl 도 새 DOM 이 됨 →
  // boolean 대신 "어떤 element 에 등록했는지" 를 추적해서 새 element 면 재등록.
  let _delegatedListEl = null;
  const _swipeState = { row: null, sx: 0, sy: 0, swiped: false, down: false };
  function _resetSwipeRow() {
    const r = _swipeState.row;
    if (r) { r.style.transform = ''; r.style.transition = 'transform 180ms ease'; }
  }
  function _setupCustomerDelegation(listEl) {
    if (!listEl || _delegatedListEl === listEl) return;
    _delegatedListEl = listEl;
    const SWIPE_THRESHOLD = 60;

    listEl.addEventListener('pointerdown', (e) => {
      const row = e.target.closest('.customer-row');
      if (!row) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      _swipeState.row = row;
      _swipeState.down = true;
      _swipeState.swiped = false;
      _swipeState.sx = e.clientX;
      _swipeState.sy = e.clientY;
    }, { passive: true });

    listEl.addEventListener('pointermove', (e) => {
      if (!_swipeState.down || !_swipeState.row) return;
      const dx = e.clientX - _swipeState.sx;
      const dy = e.clientY - _swipeState.sy;
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        _swipeState.swiped = true;
        _swipeState.row.style.transform = `translateX(${Math.max(-120, Math.min(120, dx))}px)`;
        _swipeState.row.style.transition = 'none';
      }
    }, { passive: true });

    listEl.addEventListener('pointerup', (e) => {
      if (!_swipeState.down || !_swipeState.row) return;
      _swipeState.down = false;
      const row = _swipeState.row;
      const dx = e.clientX - _swipeState.sx;
      if (_swipeState.swiped && Math.abs(dx) >= SWIPE_THRESHOLD) {
        _resetSwipeRow();
        if (dx < 0) _confirmDelete(row.dataset.id);
        else _openSwipeActions(row.dataset.id);
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      _resetSwipeRow();
    });

    listEl.addEventListener('pointercancel', () => {
      _swipeState.down = false;
      _resetSwipeRow();
      _swipeState.row = null;
    });

    listEl.addEventListener('click', (e) => {
      const row = e.target.closest('.customer-row');
      if (!row) return;
      if (_swipeState.swiped) {
        e.preventDefault();
        e.stopPropagation();
        _swipeState.swiped = false;
        return;
      }
      // [v208] PC 면 우측 디테일 갱신, 모바일이면 풀화면 시트
      _selectCustomer(row.dataset.id, row);
    });
  }

  // [2026-04-29 E1] 스와이프 액션 메뉴
  function _openSwipeActions(customerId) {
    const c = (_cache || []).find(x => x.id === customerId);
    if (!c) return;
    const old = document.getElementById('custSwipeActions');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'custSwipeActions';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,0.4);display:flex;align-items:flex-end;justify-content:center;';
    wrap.innerHTML = `
      <div style="width:100%;max-width:420px;background:#fff;border-radius:18px 18px 0 0;padding:14px 14px max(14px,var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));box-shadow:0 -4px 24px rgba(0,0,0,0.12);">
        <div style="text-align:center;margin-bottom:10px;">
          <div style="width:36px;height:4px;background:#e0e0e0;border-radius:2px;margin:0 auto 10px;"></div>
          <strong style="font-size:15px;">${_esc(c.name)}</strong>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
          <button data-act="revenue" style="padding:14px 6px;border:none;border-radius:12px;background:linear-gradient(135deg,#FFE0E6,#FFD0DA);color:#C5304D;font-size:13px;font-weight:700;cursor:pointer;">💰<br>매출 입력</button>
          <button data-act="booking" style="padding:14px 6px;border:none;border-radius:12px;background:linear-gradient(135deg,#E0EAFF,#D0E0FF);color:#2548A0;font-size:13px;font-weight:700;cursor:pointer;">📅<br>예약 잡기</button>
          <button data-act="membership" style="padding:14px 6px;border:none;border-radius:12px;background:linear-gradient(135deg,#F0E0FF,#E0D0FF);color:#5A30A0;font-size:13px;font-weight:700;cursor:pointer;">💳<br>회원권</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    wrap.querySelectorAll('[data-act]').forEach(b => {
      b.addEventListener('click', () => {
        const act = b.dataset.act;
        close();
        if (act === 'revenue' && typeof window.openRevenue === 'function') {
          window.openRevenue();
          if (typeof window._openRevenueAddFor === 'function') window._openRevenueAddFor(c.id, c.name);
        } else if (act === 'booking') {
          window._pendingBookingCustomer = { id: c.id, name: c.name };
          if (typeof window.openCalendar === 'function') window.openCalendar();
        } else if (act === 'membership' && typeof window.openMembershipCharge === 'function') {
          window.openMembershipCharge(c.id, c.name, c.membership_balance || 0);
        }
      });
    });
  }

  function _confirmDelete(customerId) {
    const c = (_cache || []).find(x => x.id === customerId);
    if (!c) return;
    // [A7] 삭제 확인 메시지 통일
    window._inlineConfirm('이 고객을 삭제하면 시술 기록도 함께 삭제돼요. 계속할까요?', () => {
      remove(customerId).then(() => {
        if (window.showToast) window.showToast('삭제됨');
        _rerender();
      }).catch(() => {
        if (window.showToast) window.showToast('삭제 실패');
      });
    });
    return;
  }

  function _esc(s) { return window._esc(s); } /* [2026-06-11] 중복 제거 — app-core 정본 위임 */

  function _openAddForm() {
    // [v220] 디테일에서 쓰는 _openCustomerEditSheet 을 그대로 재사용 (id 없이 호출 → 신규 추가 모달).
    // 기존 _openDetail 의 인라인 폼은 본 시트의 리스트 영역을 통째로 덮어쓰는 UX 라
    // 사용자 불만 → 모달로 통일.
    if (typeof window._openCustomerEditSheet === 'function') {
      window._openCustomerEditSheet(null);
    } else {
      _openDetail(null);  // 폴백
    }
  }

  let _isDetailOpen = false;
  function _closeDetail() {
    _isDetailOpen = false;
    _rerender();
  }

  function _openDetail(id) {
    const existing = id && _cache ? _cache.find(c => c.id === id) : null;
    const box = document.getElementById('customerList');
    if (!box) return;
    // [A4] 뒤로가기로 디테일 닫기 — pushState
    _isDetailOpen = true;
    history.pushState({ customerDetail: true }, '');
    const c = existing || { name: '', phone: '', memo: '', tags: [], birthday: '' };
    const _formId = id ? `customer-edit::${id}` : 'customer-add';
    box.innerHTML = `
      <div data-form-id="${_esc(_formId)}">
      <button data-customer-back class="dt-back" style="margin-bottom:12px;" aria-label="뒤로"><svg width="20" height="20" aria-hidden="true"><use href="#ic-chevron-left"/></svg></button>
      <div class="dt-field-row"><label class="dt-field-lbl">이름 *</label><input id="cfName" name="cfName" class="dt-field" value="${_esc(c.name)}" maxlength="50" /></div>
      <div class="dt-field-row"><label class="dt-field-lbl">연락처</label><input id="cfPhone" name="cfPhone" class="dt-field" value="${_esc(c.phone||'')}" inputmode="tel" maxlength="20" /></div>
      <div class="dt-field-row"><label class="dt-field-lbl">생일 (MM-DD)</label><input id="cfBirthday" name="cfBirthday" class="dt-field" value="${_esc(c.birthday||'')}" placeholder="03-14" maxlength="5" /></div>
      <div class="dt-field-row"><label class="dt-field-lbl">태그 (쉼표로 구분)</label><input id="cfTags" name="cfTags" class="dt-field" value="${_esc((c.tags||[]).join(', '))}" placeholder="VIP, 속눈썹" /></div>
      <div class="dt-field-row"><label class="dt-field-lbl">메모</label><textarea id="cfMemo" name="cfMemo" class="dt-field" rows="3" maxlength="500">${_esc(c.memo||'')}</textarea></div>
      <div style="display:flex;gap:8px;margin-top:8px;">
        <button data-customer-save data-customer-id="${_esc(id || '')}" class="btn-primary" data-mutation style="flex:1;">${existing ? '수정' : '추가'}</button>
        ${existing ? `<button data-customer-delete data-customer-id="${_esc(id)}" class="btn-secondary" data-mutation style="color:var(--danger);">삭제</button>` : ''}
      </div>
      </div>
    `;
    _bindCustomerDetailForm(box);
    document.getElementById('cfName')?.focus();
  }

  function _bindCustomerDetailForm(box) {
    if (!box || box.dataset.customerFormBound === '1') return;
    box.dataset.customerFormBound = '1';
    box.addEventListener('click', e => {
      const t = e.target.closest('[data-customer-back],[data-customer-save],[data-customer-delete]');
      if (!t || !box.contains(t)) return;
      if (t.matches('[data-customer-back]')) return window._customerBack();
      if (t.matches('[data-customer-save]')) return window._customerSave(t.dataset.customerId || '');
      if (t.matches('[data-customer-delete]')) return window._customerDelete(t.dataset.customerId);
    });
  }

  window._customerBack = _closeDetail;

  // [A4] popstate 리스너 — 뒤로가기 시 디테일/병합 화면 닫기
  //   병합 화면(_openMergeScreen)도 같은 플래그를 쓰므로 여기서 함께 처리된다.
  window.addEventListener('popstate', () => {
    if (_isDetailOpen) {
      _closeDetail();
    }
  });

  let _customerSaveInFlight = false;
  window._customerSave = async function (id) {
    if (_customerSaveInFlight) return;  // [보안감사 M-6 2026-07-26] 연타 이중 저장 방지
    const payload = {
      name: document.getElementById('cfName').value.trim(),
      phone: document.getElementById('cfPhone').value.trim() || null,
      birthday: document.getElementById('cfBirthday').value.trim() || null,
      tags: document.getElementById('cfTags').value.split(',').map(t => t.trim()).filter(Boolean).slice(0, 10),
      memo: document.getElementById('cfMemo').value.trim() || null,
    };
    if (!payload.name) {
      if (window.showToast) window.showToast('이름을 입력해 주세요');
      return;
    }
    _customerSaveInFlight = true;
    try {
      if (id) await update(id, payload);
      else await create(payload);
      if (window.hapticLight) window.hapticLight();
      if (window.showToast) window.showToast(id ? '수정 완료' : '추가 완료');
      if (typeof window._formRecoveryClear === 'function') {
        window._formRecoveryClear(id ? `customer-edit::${id}` : 'customer-add');
      }
      _rerender();
    } catch (e) {
      console.warn('[customer] save 실패:', e);
      if (window.showToast) window.showToast('저장 실패 — 잠시 후 다시 시도해 주세요');
    } finally {
      _customerSaveInFlight = false;
    }
  };

  window._customerDelete = function (id) {
    // [출시감사 2026-08-05 P1-7] 문구가 **사실과 반대**였다.
    //   예전 문구: "이 고객을 삭제하면 시술 기록도 함께 삭제돼요."
    //   실제로는 매출·시술 기록이 하나도 안 지워진다(실측: 삭제 전후 이번달 매출 927,000원 동일,
    //   매출 목록엔 그 손님 이름이 그대로 남음). 지워진다고 겁주는 건 안 지워지고,
    //   정작 되돌릴 수 없는 것(회원권 잔액)은 말하지 않았다.
    const c = (_cache || []).find(x => x.id === id);
    const bal = Number(c && c.membership_balance) || 0;
    const msg = bal > 0
      ? `${c.name}님은 회원권 잔액이 ${bal.toLocaleString()}원 남아 있어요.\n먼저 환불·정산한 뒤에 삭제할 수 있어요.`
      : '고객 목록에서만 사라져요. 지난 매출·시술 기록은 그대로 남아요.\n삭제할까요?';
    if (bal > 0) {
      if (window.showToast) window.showToast(msg.replace(/\n/g, ' '));
      return;
    }
    window._inlineConfirm(msg, async () => {
      try {
        await remove(id);
        if (window.hapticLight) window.hapticLight();
        if (window.showToast) window.showToast('삭제 완료');
        _rerender();
      } catch (e) {
        console.warn('[customer] delete 실패:', e);
        if (window.showToast) window.showToast(_friendlyError(e, '삭제'));
      }
    });
  };

  // [v212] viewport 폭이 바뀌어 PC/모바일 모드 미스매치면 시트 재생성
  function _resetSheetIfModeMismatched() {
    const sheet = document.getElementById('customerSheet');
    if (!sheet) return;
    const wasPC = sheet.classList.contains('cv4-pc');
    if (wasPC === _isPC()) return;
    sheet.remove();
  }


  // ── [2026-08-05 접근성] 포커스 트랩 · ESC 닫기 ─────────────────────
  //  role="dialog"/aria-modal 만 붙여두면 스크린리더는 스코프되지만 **키보드는 안 갇힌다** —
  //  실측: 시트가 열려 있어도 Tab 으로 뒤 사이드바 요소 25개가 그대로 잡혔다.
  //  키보드만 쓰는 원장님은 시트를 열어둔 채 뒤 화면을 조작하게 된다.
  let _trapPrevFocus = null;

  function _focusablesIn(root) {
    return [...root.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
      'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter(el => el.offsetParent !== null || el === document.activeElement);
  }

  function _onSheetKeydown(e) {
    const sheet = document.getElementById('customerSheet');
    if (!sheet || sheet.style.display !== 'flex') return;
    if (e.key === 'Escape') {
      e.preventDefault();
      // 안쪽 화면(상세/병합)이 열려 있으면 그것부터 닫는다 — 한 번에 다 닫지 않는다
      if (_isDetailOpen) { history.back(); return; }
      window.closeCustomers();
      return;
    }
    if (e.key !== 'Tab') return;
    const f = _focusablesIn(sheet);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !sheet.contains(document.activeElement))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  function _trapOn(sheet) {
    _trapPrevFocus = document.activeElement;
    document.addEventListener('keydown', _onSheetKeydown, true);
    // 배경을 보조기술·탭 순서에서 제외 (aria-modal 을 실제로 뒷받침한다)
    [...document.body.children].forEach(el => {
      if (el === sheet) return;
      if (el.getAttribute('aria-hidden') === 'true') return;
      el.dataset.custInert = '1';
      el.setAttribute('aria-hidden', 'true');
    });
    setTimeout(() => { (sheet.querySelector('#customerSearch') || sheet).focus?.(); }, 60);
  }

  function _trapOff() {
    document.removeEventListener('keydown', _onSheetKeydown, true);
    document.querySelectorAll('[data-cust-inert="1"]').forEach(el => {
      el.removeAttribute('aria-hidden');
      delete el.dataset.custInert;
    });
    if (_trapPrevFocus && document.contains(_trapPrevFocus)) {
      try { _trapPrevFocus.focus(); } catch (_e) { void _e; }
    }
    _trapPrevFocus = null;
  }

  window.openCustomers = async function () {
    _resetSheetIfModeMismatched();
    const sheet = _ensureSheet();
    sheet.style.display = 'flex';
    sheet.classList.add('dt-shown');
    document.body.style.overflow = 'hidden';
    // [출시감사 2026-08-02] 안드로이드 뒤로가기 등록. 갤럭시 에뮬레이터 실측 —
    //   고객관리를 열고 뒤로가기를 누르면 **아무 반응이 없었다**(시트가 그대로).
    //   계속 누르면 결국 앱 종료 확인이 뜬다. aiHub·연동·설정과 같은 원인.
    if (typeof window._registerSheet === 'function') window._registerSheet('customers', window.closeCustomers);
    if (typeof window._markSheetOpen === 'function') window._markSheetOpen('customers');
    _trapOn(sheet);
    // 중복 손님 스캔 — 배경에서 한 번만. 실패해도 목록은 정상 동작한다.
    if (!_dupChecked) {
      fetchDuplicates().then(gs => { if (gs.length) _rerender(); }).catch(() => { _dupChecked = true; });
    }
    // SWR 캐시 있으면 즉시 렌더, 없으면 first-load 만 placeholder
    const box = sheet.querySelector('#customerList');
    const swr = _readSWR();
    if (swr) {
      _cache = swr.items;
      _rerender();  // 즉시 표시
      // 오래된 캐시면 백그라운드 갱신 (list() 내부에서 자동 처리)
      list().then(() => _rerender()).catch(() => {});
    } else {
      box.innerHTML = (typeof window._renderSkeleton === 'function')
        ? window._renderSkeleton(6)
        : '<div class="dt-loading">불러오는 중…</div>';
      try {
        await list();
        _rerender();
      } catch (e) {
        console.warn('[customer] list 실패:', e);
        box.innerHTML = '<div class="dt-error">불러오기 실패</div>';
      }
    }
  };

  window.closeCustomers = function () {
    const sheet = document.getElementById('customerSheet');
    _trapOff();
    if (sheet) { sheet.style.display = 'none'; sheet.classList.remove('dt-shown'); }
    document.body.style.overflow = '';
    // [출시감사 2026-08-02] 열 때 쌓은 history 엔트리 되돌리기.
    if (typeof window._markSheetClosed === 'function') window._markSheetClosed('customers');
  };

  // [v212] 창 리사이즈로 PC↔모바일 모드 변경되면 자동 재생성
  if (!window._customerResizeListenerInit) {
    window._customerResizeListenerInit = true;
    let _rzTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(_rzTimer);
      _rzTimer = setTimeout(() => {
        const sheet = document.getElementById('customerSheet');
        if (!sheet || sheet.style.display === 'none') return;
        const wasPC = sheet.classList.contains('cv4-pc');
        if (wasPC !== _isPC()) {
          if (typeof window.openCustomers === 'function') window.openCustomers();
        }
      }, 200);
    });
  }

  // ── 픽커 (외부 컴포넌트 재사용) ──────────────────────────
  //   await Customer.pick({ selectedId })  →  {id, name} | null (취소)
  //   캘린더·매출 등에서 호출 — 항상 최신 전체 목록 보장 (페이징 누락 방지)
    async function pick(opts) {
      opts = opts || {};
      // 2026-05-04 ── 고객 누락 보고 대응: 캐시가 너무 작거나 stale하면 강제 재조회
      try {
        const swr = _readSWR();
        const minItems = 5; // 최소 5명은 있어야 캐시로 인정 (신규 가입자 제외)
        if (!_cache || _cache.length < minItems || !swr || !swr.fresh) {
          try { await _fetchFresh(); } catch (_e) { await list().catch(() => {}); }
        }
      } catch (_) { /* ignore */ }
    return new Promise((resolve) => {
      const pop = document.createElement('div');
      pop.style.cssText = 'position:fixed;inset:0;z-index:10800;background:rgba(0,0,0,0.5);display:flex;align-items:flex-end;' /* [2026-06-11] 잇비(10500) 위로 — 픽커 가림 픽스 */;
      pop.innerHTML = `
        <div style="width:100%;background:var(--bg,#fff);border-radius:20px 20px 0 0;max-height:75vh;display:flex;flex-direction:column;padding:16px;padding-bottom:max(16px,var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
            <strong style="font-size:16px;">고객 선택</strong>
            <button data-pick-cancel style="margin-left:auto;background:none;border:none;font-size:20px;cursor:pointer;">✕</button>
          </div>
          <input data-pick-search placeholder="이름·연락처 검색 또는 새 고객 이름" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:14px;margin-bottom:10px;" />
          <div data-pick-list style="flex:1;overflow-y:auto;min-height:140px;"></div>
          <div data-pick-create-row style="display:none;margin-top:8px;padding:10px;border:1px dashed var(--brand,var(--brand));border-radius:14px;background:rgba(213,138,149,0.04);">
            <div style="font-size:11px;color:var(--text-subtle,#888);margin-bottom:6px;">신규 고객으로 추가</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <input data-pick-new-name placeholder="이름" style="flex:1 1 90px;min-width:90px;padding:9px 10px;border:1px solid #ddd;border-radius:14px;font-size:13px;" />
              <input data-pick-new-phone placeholder="연락처 (선택)" inputmode="tel" style="flex:1 1 110px;min-width:110px;padding:9px 10px;border:1px solid #ddd;border-radius:14px;font-size:13px;" />
              <button data-pick-create style="flex:0 0 auto;padding:9px 14px;background:linear-gradient(135deg,var(--brand),#E96A7E);color:#fff;border:none;border-radius:14px;font-weight:700;font-size:13px;cursor:pointer;">+ 추가하고 선택</button>
            </div>
          </div>
          <button data-pick-clear style="margin-top:8px;padding:10px;border:1px solid #eee;border-radius:14px;background:#fafafa;color:var(--danger);cursor:pointer;font-size:12px;">지정 해제 (고객 없음)</button>
        </div>
      `;
      document.body.appendChild(pop);
      const searchEl = pop.querySelector('[data-pick-search]');
      const listEl = pop.querySelector('[data-pick-list]');
      const createRow = pop.querySelector('[data-pick-create-row]');
      const newNameEl = pop.querySelector('[data-pick-new-name]');
      const newPhoneEl = pop.querySelector('[data-pick-new-phone]');
      const createBtn = pop.querySelector('[data-pick-create]');
      const close = (val) => { pop.remove(); resolve(val); };

      const render = () => {
        const q = searchEl.value;
        const trimmed = q.trim();
        const hits = search(q);
        if (!hits.length) {
          if (trimmed) {
            // 검색어 있는데 결과 0건 → 즉석 신규 추가 UI 노출 + 1탭 버튼
            listEl.innerHTML = `
              <div style="padding:18px 12px 12px;text-align:center;color:#888;font-size:13px;">'${_esc(trimmed)}' 고객을 찾을 수 없어요</div>
              <button data-pick-quick-add style="display:block;width:100%;padding:14px;margin:0 0 10px;border:none;border-radius:14px;background:linear-gradient(135deg,var(--brand),#E96A7E);color:#fff;font-weight:700;font-size:14px;cursor:pointer;">+ 새 고객으로 '${_esc(trimmed)}' 추가</button>
            `;
            createRow.style.display = 'block';
            newNameEl.value = trimmed;
            const quickBtn = listEl.querySelector('[data-pick-quick-add]');
            if (quickBtn) quickBtn.addEventListener('click', () => onCreate());
          } else {
            listEl.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-subtle);font-size:13px;">' +
              '등록된 고객이 없어요. 아래에서 바로 추가할 수 있어요.' +
              '</div>';
            createRow.style.display = 'block';
            if (!newNameEl.value) newNameEl.value = '';
          }
          return;
        }
        // 검색어 없을 때도 전체 목록 바로 표시 (최대 100명 — 누락 오해 방지)
        const displayHits = trimmed ? hits : hits.slice(0, 100);
        createRow.style.display = 'none';
        const moreCount = hits.length - displayHits.length;
        listEl.innerHTML = displayHits.map(c => `
          <div data-pick-id="${_esc(c.id)}" style="padding:12px 8px;border-bottom:1px solid #eee;cursor:pointer;border-radius:14px;${c.id === opts.selectedId ? 'background:rgba(213,138,149,0.08);' : ''}">
            <strong style="font-size:14px;">${_esc(c.name)}</strong>
            ${c.phone ? `<span style="font-size:12px;color:#888;margin-left:6px;">${_esc(c.phone)}</span>` : ''}
            ${c.visit_count ? `<span style="font-size:11px;color:var(--accent,var(--brand));margin-left:6px;">방문 ${c.visit_count}</span>` : ''}
          </div>
        `).join('') + (moreCount > 0 ? `<div style="padding:12px;text-align:center;font-size:12px;color:#888;">검색어 입력 시 ${moreCount}명 더 볼 수 있어요</div>` : '');
        listEl.querySelectorAll('[data-pick-id]').forEach(row => {
          row.addEventListener('click', () => {
            const pickedId = row.dataset.pickId;
            const items2 = _cache || [];
            const c = items2.find(x => String(x.id) === String(pickedId));
            close(c || null);
          });
        });
      };

      // [QA-r10b 2026-05-15] 같은 사람 2번 등록 보고 (게시물 업로드 워크플로 고객 추가):
      // 사용자가 빠른 더블클릭 또는 Enter+버튼 클릭 → onCreate 가 병렬 실행 →
      // create() POST /customers 2회 → DB 에 같은 이름 2건 INSERT.
      // [F-A] re-entry 가드: 첫 호출만 진행, 진행 중엔 무시.
      // [F-B] 이름·전화 기반 dedupe: 캐시에 일치 고객이 이미 있으면 POST 안 보내고 그것 선택.
      let _creatingInFlight = false;
      const _normName = (s) => String(s || '').trim().toLowerCase();
      const _normPhone = (s) => String(s || '').replace(/[^0-9]/g, '');
      const onCreate = async () => {
        if (_creatingInFlight) return;  // [F-A] 재진입 차단
        const name = (newNameEl.value || '').trim();
        const phone = (newPhoneEl.value || '').trim();
        if (!name) {
          if (window.showToast) window.showToast('이름을 입력해 주세요');
          newNameEl.focus();
          return;
        }
        _creatingInFlight = true;
        createBtn.disabled = true;
        createBtn.textContent = '추가 중…';
        // 진행 중 quickBtn 도 비활성 (검색 결과 0건일 때 노출되는 큰 버튼)
        try { listEl.querySelectorAll('[data-pick-quick-add]').forEach(b => { b.disabled = true; b.style.opacity = '0.6'; }); } catch (_e) { void _e; }
        try {
          // [F-B] 캐시에 이미 같은 이름·전화 고객이 있으면 신규 POST 없이 그것 사용.
          //   - 전화번호 있으면 (이름 일치 + 전화 일치) 우선
          //   - 전화번호 없으면 (이름 정확히 일치, 전화 비어있는 첫 매치)
          const _nName = _normName(name);
          const _nPhone = _normPhone(phone);
          const existing = (_cache || []).find(c => {
            if (!c || c._optimistic) return false;
            if (_normName(c.name) !== _nName) return false;
            if (_nPhone) return _normPhone(c.phone) === _nPhone;
            return !c.phone || _normPhone(c.phone) === '';
          });
          if (existing) {
            if (window.hapticLight) window.hapticLight();
            if (window.showToast) window.showToast(`${existing.name} 기존 고객으로 연결했어요`);
            close({ id: existing.id, name: existing.name });
            return;
          }
          const created = await create({ name, phone: phone || null });
          if (window.hapticLight) window.hapticLight();
          if (window.showToast) window.showToast(`${created.name} 새 고객으로 추가됐어요`);
          try {
            window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'create_customer' } }));
          } catch (_e) { /* ignore */ }
          close({ id: created.id, name: created.name });
        } catch (err) {
          _creatingInFlight = false;
          createBtn.disabled = false;
          createBtn.textContent = '+ 추가하고 선택';
          try { listEl.querySelectorAll('[data-pick-quick-add]').forEach(b => { b.disabled = false; b.style.opacity = ''; }); } catch (_e) { void _e; }
          if (err && err.message === 'free-limit-reached') return;  // create() 내부에서 토스트 처리됨
          console.warn('[customer.pick] 신규 추가 실패:', err);
          if (window.showToast) window.showToast('고객 추가 실패');
        }
      };

      render();
      searchEl.addEventListener('input', render);
      newNameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onCreate(); } });
      newPhoneEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onCreate(); } });
      createBtn.addEventListener('click', onCreate);
      pop.querySelector('[data-pick-cancel]').addEventListener('click', () => close(null));
      pop.querySelector('[data-pick-clear]').addEventListener('click', () => close({ id: null, name: null }));
      pop.addEventListener('click', (e) => { if (e.target === pop) close(null); });
    });
  }

  // 외부에서 편집 폼 직접 열기 (대시보드의 '정보 편집' 버튼용)
  window.editCustomer = async function (id) {
    try { if (!_cache) await list(); } catch (_) { /* ignore */ }
    const sheet = _ensureSheet();
    sheet.style.display = 'flex';  // [A5] block → flex
    document.body.style.overflow = 'hidden';
    _openDetail(id);
  };

  // 외부 노출 (디버그·테스트·타 컴포넌트용)
  window.Customer = {
    list, create, update, remove, search, pick,
    get _cache() { return _cache; },
    get isOffline() { return _isOffline; },
  };
})();
