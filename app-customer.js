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
  async function _api(method, path, body) {
    if (!window.API || !window.authHeader) throw new Error('no-auth');
    const auth = window.authHeader();
    if (!auth?.Authorization) throw new Error('no-token');
    const opts = {
      method,
      headers: { ...auth, 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(window.API + path, opts);
    if (res.status === 404 || res.status === 501) throw new Error('endpoint-missing');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.status === 204 ? null : await res.json();
  }

  // ── Stale-while-revalidate 캐시 — localStorage persistent (앱 재시작 후에도 즉시 렌더)
  const _SWR_KEY = 'pv_cache::customers';
  const _SWR_TTL = 120 * 1000;  // 2분 내 캐시는 신선
  function _readSWR() {
    if (window.CustomerCache?.read) return window.CustomerCache.read();
    try {
      const raw = localStorage.getItem(_SWR_KEY) || sessionStorage.getItem(_SWR_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      return { items: obj.d, age: Date.now() - obj.t, fresh: Date.now() - obj.t < _SWR_TTL };
    } catch (_e) { return null; }
  }
  function _writeSWR(items) {
    if (window.CustomerCache?.set) return window.CustomerCache.set(items);
    const payload = JSON.stringify({ t: Date.now(), d: items });
    try { localStorage.setItem(_SWR_KEY, payload); } catch (_e) {
      try { sessionStorage.setItem(_SWR_KEY, payload); } catch (_e2) { void _e2; }
    }
  }
  function _clearSWR() {
    if (window.CustomerCache?.clear) return window.CustomerCache.clear();
    try { localStorage.removeItem(_SWR_KEY); } catch (_e) { void _e; }
    try { sessionStorage.removeItem(_SWR_KEY); } catch (_e) { void _e; }
  }

  // 챗봇·다른 소스 데이터 변경 감지 → 오픈된 시트 즉시 새로고침
  if (typeof window !== 'undefined' && !window._customerDataListenerInit) {
    window._customerDataListenerInit = true;
    window.addEventListener('itdasy:data-changed', async (e) => {
      const k = e.detail && e.detail.kind;
      if (k === 'create_customer' || k === 'update_customer' || k === 'create_revenue' || k === 'create_booking') {
        _clearSWR();
        const sheet = document.getElementById('customerSheet');
        if (sheet && sheet.style.display === 'flex') {
          try { await _fetchFresh(); _rerender && _rerender(); } catch (_e) { void _e; }
        }
      }
    });
  }

  async function _fetchFresh() {
    if (window.CustomerCache?.fetchFresh) {
      const items = await window.CustomerCache.fetchFresh();
      _isOffline = false;
      _cache = items;
      return _cache;
    }
    const d = await _api('GET', '/customers');
    _isOffline = false;
    _cache = d.items || [];
    _writeSWR(_cache);
    return _cache;
  }

  // ── CRUD ────────────────────────────────────────────────
  async function list() {
    // 1. 캐시 있으면 즉시 반환 (UI 바로 렌더)
    const swr = _readSWR();
    if (swr) {
      _cache = swr.items;
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
      if (e.message === 'endpoint-missing' || e.message === 'no-token') {
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
      const msg = 'Free 플랜은 고객 ' + FREE_CUSTOMER_LIMIT + '명까지 등록할 수 있어요. Pro 로 업그레이드해 주세요.';
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
      // 실패 — 옵티미스틱 항목 제거 + 빨간 토스트
      if (_cache) _cache = _cache.filter(c => c.id !== optimisticRecord.id);
      _writeSWR(_cache);
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'create_customer', optimistic: false, rollback: true } })); } catch (_e) { void _e; }
      if (window.showToast) window.showToast('고객 추가 실패 — 다시 시도해주세요');
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
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'delete_customer', optimistic: false } })); } catch (_e) { void _e; }
      return { ok: true };
    }
    await _api('DELETE', '/customers/' + id);
    if (_cache) _cache = _cache.filter(c => c.id !== id);
    _writeSWR(_cache);  // SWR 캐시 동기
    // [2026-04-26 A9] mutation 이벤트 누락 보충
    try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'delete_customer', optimistic: false } })); } catch (_e) { void _e; }
    return { ok: true };
  }

  // ── 검색 ────────────────────────────────────────────────
  function search(query) {
    if (!_cache) return [];
    const q = String(query || '').trim().toLowerCase();
    if (!q) return _cache;
    return _cache.filter(c =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q)) ||
      (c.memo && c.memo.toLowerCase().includes(q)) ||
      (c.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }

  // ── UI: 오버레이 시트 ────────────────────────────────────
  function _ensureSheet() {
    let sheet = document.getElementById('customerSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'customerSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9998;display:none;flex-direction:column;';
    sheet.classList.add('dt-overlay');
    sheet.innerHTML = `
      <header class="dt-hdr">
        <button class="dt-back" onclick="closeCustomers()" aria-label="뒤로"><i class="ph-duotone ph-caret-left" style="font-size:20px" aria-hidden="true"></i></button>
        <h1 class="dt-title">내 고객</h1>
        <span id="customerCount" style="font-size:12px;color:var(--text-subtle);"></span>
        <span id="customerOfflineBadge" class="dt-offline-badge">오프라인</span>
      </header>
      <div class="dt-body">
        <div class="dt-search-wrap">
          <input id="customerSearch" type="search" class="dt-field" placeholder="이름·연락처·태그 검색" />
        </div>
        <!-- [2026-04-29 E2] 자동 세그먼트 chip 4개 -->
        <div id="customerSegments" style="display:flex;gap:6px;padding:0 4px 10px;overflow-x:auto;-webkit-overflow-scrolling:touch;">
          <button data-seg="all" class="cust-seg-chip cust-seg-active" style="flex-shrink:0;padding:6px 14px;border:1px solid var(--brand);background:var(--brand);color:#fff;border-radius:999px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">전체</button>
          <button data-seg="regular" class="cust-seg-chip" style="flex-shrink:0;padding:6px 14px;border:1px solid #ddd;background:#fff;color:#555;border-radius:999px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">⭐ 단골</button>
          <button data-seg="member" class="cust-seg-chip" style="flex-shrink:0;padding:6px 14px;border:1px solid #ddd;background:#fff;color:#555;border-radius:999px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">💳 회원권</button>
          <button data-seg="new" class="cust-seg-chip" style="flex-shrink:0;padding:6px 14px;border:1px solid #ddd;background:#fff;color:#555;border-radius:999px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">🌱 신규</button>
          <button data-seg="atrisk" class="cust-seg-chip" style="flex-shrink:0;padding:6px 14px;border:1px solid #ddd;background:#fff;color:#555;border-radius:999px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">이탈 임박</button>
        </div>
        <div id="customerList"></div>
      </div>
      <footer class="dt-footer">
        <button id="customerAddBtn" class="btn-primary" style="flex:1;">+ 고객 추가</button>
      </footer>
    `;
    document.body.appendChild(sheet);
    sheet.querySelector('#customerSearch').addEventListener('input', _rerender);
    sheet.querySelector('#customerAddBtn').addEventListener('click', _openAddForm);
    // [2026-04-29 E2] 세그먼트 chip 클릭
    let _activeSeg = 'all';
    sheet.querySelectorAll('.cust-seg-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        _activeSeg = btn.dataset.seg;
        window._customerSeg = _activeSeg;
        sheet.querySelectorAll('.cust-seg-chip').forEach(b => {
          const on = b.dataset.seg === _activeSeg;
          b.classList.toggle('cust-seg-active', on);
          b.style.background = on ? 'var(--brand)' : '#fff';
          b.style.color = on ? '#fff' : '#555';
          b.style.borderColor = on ? 'var(--brand)' : '#ddd';
        });
        _windowSize = 50;
        _rerender();
      });
    });
    return sheet;
  }

  // [렉 박멸 2026-04-26] windowing — 고객 1000명 한 번에 렌더 → 첫 50명 + "더 보기".
  // _windowSize 초기값 50, "더 보기" 클릭마다 +50.
  let _windowSize = 50;
  const WINDOW_STEP = 50;

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
        if (seg === 'regular') return !!c.is_regular;
        if (seg === 'member')  return !!c.membership_active;
        if (seg === 'new')     return (c.visit_count || 0) <= 1;
        if (seg === 'atrisk') {
          if (!c.last_visit_at) return false;
          const t = Date.parse(c.last_visit_at);
          if (!isFinite(t)) return false;
          const days = (now - t) / 86400000;
          return days >= ATRISK_DAYS;
        }
        return true;
      });
    }
    const box = sheet.querySelector('#customerList');
    const count = sheet.querySelector('#customerCount');
    const offBadge = sheet.querySelector('#customerOfflineBadge');
    count.textContent = (_cache ? _cache.length : 0) + '명' + (seg !== 'all' ? ` · ${items.length}명 표시` : '');
    offBadge.style.display = _isOffline ? 'inline-block' : 'none';

    if (!items.length) {
      box.innerHTML = `<div class="dt-empty">${_cache && _cache.length ? (seg !== 'all' ? '이 세그먼트에 해당하는 고객이 없어요.' : '검색 결과 없음') : '아직 고객이 없어요. 아래 버튼으로 추가해 주세요.'}</div>`;
      return;
    }
    // 검색 키워드 바뀌면 window 리셋
    const lastQ = box.dataset.lastQ || '';
    if (lastQ !== q) { _windowSize = 50; box.dataset.lastQ = q; }
    const totalLen = items.length;
    const visible = items.slice(0, _windowSize);
    const hasMore = totalLen > _windowSize;
    box.innerHTML = '<div class="dt-list">' + visible.map(c => {
      const nsCount = c.no_show_count || 0;
      const nsBadge = nsCount >= 3
        ? `<span title="안 옴 ${nsCount}회 — 예약 전 주의" style="font-size:10px;font-weight:700;color:#fff;background:#dc3545;padding:2px 7px;border-radius:100px;margin-left:6px;">🚩 안 옴 ${nsCount}</span>`
        : (nsCount > 0 ? `<span title="안 옴 ${nsCount}회" style="font-size:10px;font-weight:600;color:#B45309;background:#FEF3C7;padding:2px 6px;border-radius:100px;margin-left:6px;">안 옴 ${nsCount}</span>` : '');
      const regularBadge = c.is_regular
        ? `<span title="단골" class="cm-badge cm-badge--regular" style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;color:#fff;background:var(--brand);padding:2px 8px;border-radius:999px;margin-left:6px;line-height:1.4;"><i class="ph-duotone ph-star" aria-hidden="true"></i>단골</span>`
        : '';
      const memberBadge = c.membership_active
        ? (() => {
            const bal = +c.membership_balance || 0;
            const low = bal > 0 && bal < 30000;
            const bg = low ? '#F97316' : '#A78BFA';
            const balText = bal >= 10000 ? `${Math.floor(bal/10000)}만원` : (bal > 0 ? `${bal.toLocaleString()}원` : '0원');
            return `<span title="멤버십 잔액 ${bal.toLocaleString()}원" class="cm-badge cm-badge--member" style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;color:#fff;background:${bg};padding:2px 8px;border-radius:999px;margin-left:6px;line-height:1.4;"><i class="ph-duotone ph-sparkle" aria-hidden="true"></i>${balText}</span>`;
          })()
        : '';
      return `
      <button class="dt-list-it customer-row" data-id="${c.id}" type="button">
        <div class="dt-list-it__main">
          <p class="dt-list-it__title">${_esc(c.name)}${c.visit_count ? ` <span style="font-size:11px;font-weight:400;color:var(--brand);">방문 ${c.visit_count}회</span>` : ''}${regularBadge}${memberBadge}${nsBadge}</p>
          <p class="dt-list-it__sub">${[c.phone ? _esc(c.phone) : '', c.memo ? _esc(c.memo).slice(0,40) : ''].filter(Boolean).join(' · ')}</p>
        </div>
        <i class="ph-duotone ph-caret-right" style="font-size:14px" aria-hidden="true"></i>
      </button>`;
    }).join('') + '</div>'
      + (hasMore
          ? `<button id="customerLoadMore" type="button" style="width:100%;margin-top:8px;padding:11px;border:1px dashed hsl(220,15%,80%);border-radius:12px;background:#fafafa;color:#555;font-size:13px;font-weight:600;cursor:pointer;">+ ${totalLen - _windowSize}명 더 보기</button>`
          : '');
    const more = box.querySelector('#customerLoadMore');
    if (more) {
      more.addEventListener('click', () => { _windowSize += WINDOW_STEP; _rerender(); }, { once: true });
    }
    // [PerfFix] 행 단위 리스너 5×N개 → 컨테이너 위임 1회. _rerender 시 누적 방지.
    _setupCustomerDelegation(box);
  }

  // ─── 고객 행 이벤트 위임 ──────────────────────────────────
  // _rerender() 가 innerHTML 을 갈아끼워도 컨테이너 자체는 유지되므로 1회 등록으로 충분.
  let _customerDelegated = false;
  const _swipeState = { row: null, sx: 0, sy: 0, swiped: false, down: false };
  function _resetSwipeRow() {
    const r = _swipeState.row;
    if (r) { r.style.transform = ''; r.style.transition = 'transform 180ms ease'; }
  }
  function _setupCustomerDelegation(listEl) {
    if (_customerDelegated || !listEl) return;
    _customerDelegated = true;
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
      if (typeof window.openCustomerDashboard === 'function') {
        window.openCustomerDashboard(row.dataset.id);
      } else {
        _openDetail(row.dataset.id);
      }
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
      <div style="width:100%;max-width:420px;background:#fff;border-radius:18px 18px 0 0;padding:14px 14px max(14px,env(safe-area-inset-bottom));box-shadow:0 -4px 24px rgba(0,0,0,0.12);">
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
    if (!confirm(`'${c.name}' 고객을 삭제할까요?\n방문 ${c.visit_count || 0}회 기록도 함께 사라집니다.`)) return;
    remove(customerId).then(() => {
      if (window.showToast) window.showToast('삭제됨');
      _rerender();
    }).catch(() => {
      if (window.showToast) window.showToast('삭제 실패');
    });
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  function _openAddForm() {
    _openDetail(null);
  }

  function _openDetail(id) {
    const existing = id && _cache ? _cache.find(c => c.id === id) : null;
    const box = document.getElementById('customerList');
    if (!box) return;
    const c = existing || { name: '', phone: '', memo: '', tags: [], birthday: '' };
    const _formId = id ? `customer-edit::${id}` : 'customer-add';
    box.innerHTML = `
      <div data-form-id="${_formId}">
      <button onclick="window._customerBack()" class="dt-back" style="margin-bottom:12px;" aria-label="뒤로"><i class="ph-duotone ph-caret-left" style="font-size:20px" aria-hidden="true"></i></button>
      <div class="dt-field-row"><label class="dt-field-lbl">이름 *</label><input id="cfName" name="cfName" class="dt-field" value="${_esc(c.name)}" maxlength="50" /></div>
      <div class="dt-field-row"><label class="dt-field-lbl">연락처</label><input id="cfPhone" name="cfPhone" class="dt-field" value="${_esc(c.phone||'')}" inputmode="tel" maxlength="20" /></div>
      <div class="dt-field-row"><label class="dt-field-lbl">생일 (MM-DD)</label><input id="cfBirthday" name="cfBirthday" class="dt-field" value="${_esc(c.birthday||'')}" placeholder="03-14" maxlength="5" /></div>
      <div class="dt-field-row"><label class="dt-field-lbl">태그 (쉼표로 구분)</label><input id="cfTags" name="cfTags" class="dt-field" value="${_esc((c.tags||[]).join(', '))}" placeholder="VIP, 속눈썹" /></div>
      <div class="dt-field-row"><label class="dt-field-lbl">메모</label><textarea id="cfMemo" name="cfMemo" class="dt-field" rows="3" maxlength="500">${_esc(c.memo||'')}</textarea></div>
      <div style="display:flex;gap:8px;margin-top:8px;">
        <button onclick="window._customerSave('${id||''}')" class="btn-primary" data-mutation style="flex:1;">${existing ? '수정' : '추가'}</button>
        ${existing ? `<button onclick="window._customerDelete('${id}')" class="btn-secondary" data-mutation style="color:var(--danger);">삭제</button>` : ''}
      </div>
      </div>
    `;
    document.getElementById('cfName')?.focus();
  }

  window._customerBack = _rerender;

  window._customerSave = async function (id) {
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
    }
  };

  window._customerDelete = async function (id) {
    { const _ok = window._confirm2 ? window._confirm2('이 고객을 삭제할까요?') : confirm('이 고객을 삭제할까요?'); if (!_ok) return; }
    try {
      await remove(id);
      if (window.hapticLight) window.hapticLight();
      if (window.showToast) window.showToast('삭제 완료');
      _rerender();
    } catch (e) {
      console.warn('[customer] delete 실패:', e);
      if (window.showToast) window.showToast('삭제 실패');
    }
  };

  window.openCustomers = async function () {
    const sheet = _ensureSheet();
    sheet.style.display = 'flex';
    sheet.classList.add('dt-shown');
    document.body.style.overflow = 'hidden';
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
    if (sheet) { sheet.style.display = 'none'; sheet.classList.remove('dt-shown'); }
    document.body.style.overflow = '';
  };

  // ── 픽커 (외부 컴포넌트 재사용) ──────────────────────────
  //   await Customer.pick({ selectedId })  →  {id, name} | null (취소)
  //   캘린더·매출·NPS 등에서 호출 — 항상 최신 전체 목록 보장 (페이징 누락 방지)
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
      pop.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,0.5);display:flex;align-items:flex-end;';
      pop.innerHTML = `
        <div style="width:100%;background:var(--bg,#fff);border-radius:20px 20px 0 0;max-height:75vh;display:flex;flex-direction:column;padding:16px;padding-bottom:max(16px,env(safe-area-inset-bottom));">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
            <strong style="font-size:16px;">고객 선택</strong>
            <button data-pick-cancel style="margin-left:auto;background:none;border:none;font-size:20px;cursor:pointer;">✕</button>
          </div>
          <input data-pick-search placeholder="이름·연락처 검색 또는 새 고객 이름" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:14px;margin-bottom:10px;" />
          <div data-pick-list style="flex:1;overflow-y:auto;min-height:140px;"></div>
          <div data-pick-create-row style="display:none;margin-top:8px;padding:10px;border:1px dashed var(--brand,var(--brand));border-radius:14px;background:rgba(241,128,145,0.04);">
            <div style="font-size:11px;color:var(--text-subtle,#888);margin-bottom:6px;">신규 고객으로 추가</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <input data-pick-new-name placeholder="이름" style="flex:1 1 90px;min-width:90px;padding:9px 10px;border:1px solid #ddd;border-radius:14px;font-size:13px;" />
              <input data-pick-new-phone placeholder="연락처 (선택)" inputmode="tel" style="flex:1 1 110px;min-width:110px;padding:9px 10px;border:1px solid #ddd;border-radius:14px;font-size:13px;" />
              <button data-pick-create style="flex:0 0 auto;padding:9px 14px;background:linear-gradient(135deg,var(--brand),#E96A7E);color:#fff;border:none;border-radius:14px;font-weight:700;font-size:13px;cursor:pointer;">+ 추가하고 선택</button>
            </div>
          </div>
          <button data-pick-clear style="margin-top:8px;padding:10px;border:1px solid #eee;border-radius:14px;background:#fafafa;color:#c00;cursor:pointer;font-size:12px;">지정 해제 (고객 없음)</button>
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
        const items = _cache || [];
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
          <div data-pick-id="${c.id}" style="padding:12px 8px;border-bottom:1px solid #eee;cursor:pointer;border-radius:14px;${c.id === opts.selectedId ? 'background:rgba(241,128,145,0.08);' : ''}">
            <strong style="font-size:14px;">${_esc(c.name)}</strong>
            ${c.phone ? `<span style="font-size:12px;color:#888;margin-left:6px;">${_esc(c.phone)}</span>` : ''}
            ${c.visit_count ? `<span style="font-size:10px;color:var(--accent,var(--brand));margin-left:6px;">방문 ${c.visit_count}</span>` : ''}
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

      // 즉석 신규 고객 생성 → 바로 선택
      const onCreate = async () => {
        const name = (newNameEl.value || '').trim();
        const phone = (newPhoneEl.value || '').trim();
        if (!name) {
          if (window.showToast) window.showToast('이름을 입력해 주세요');
          newNameEl.focus();
          return;
        }
        createBtn.disabled = true;
        createBtn.textContent = '추가 중…';
        try {
          const created = await create({ name, phone: phone || null });
          if (window.hapticLight) window.hapticLight();
          if (window.showToast) window.showToast(`${created.name} 새 고객으로 추가됐어요`);
          // 데이터 변경 이벤트 (대시보드·목록 자동 새로고침)
          try {
            window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'create_customer' } }));
          } catch (_e) { /* ignore */ }
          close({ id: created.id, name: created.name });
        } catch (err) {
          createBtn.disabled = false;
          createBtn.textContent = '+ 추가하고 선택';
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
    sheet.style.display = 'block';
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
