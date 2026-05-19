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
    return _cache.filter(c =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q)) ||
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
    const isPC = _isPC();
    // [v211] position:fixed 는 유지 (책임 분리). PC 에서는 style-responsive.css 의 공통 오버레이 규칙이
    // inset 을 (header-h, 0, 0, 232px) 로 덮어쓰고 z-index 를 950 으로 낮춤. 모바일은 inline 그대로.
    sheet.style.cssText = isPC
      ? 'position:fixed;inset:0;z-index:9998;display:none;background:var(--surface,#fff);'
      : 'position:fixed;inset:0;z-index:9998;display:none;flex-direction:column;background:var(--surface,#fff);';
    if (isPC) sheet.classList.add('cv4-pc');

    const chipsHTML = `
      <div id="customerSegments" class="cv4-chips">
        <button data-seg="all"          class="cv4-chip is-on">전체</button>
        <button data-seg="visits12"     class="cv4-chip off">1~2회</button>
        <button data-seg="visits3plus"  class="cv4-chip green">3회 이상</button>
        <button data-seg="visits10plus" class="cv4-chip brand">10회 이상</button>
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
            <input id="customerSearch" type="search" placeholder="이름 · 전화번호 검색" style="${searchInputStyle}margin-bottom:10px;" />
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
          <button class="dt-back cv4-mobile-back" onclick="closeCustomers()" aria-label="뒤로"
                  style="position:absolute;top:14px;left:10px;background:var(--surface-2,#F7F8FA);border:none;width:36px;height:36px;border-radius:12px;color:var(--text);font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;font-weight:600;z-index:2;">‹</button>
          <div class="cv4-hd">
            <h1 style="font-size:22px;font-weight:700;color:var(--text);letter-spacing:-0.5px;margin:0;">고객관리</h1>
            <button class="cv4-hd-add" id="customerAddBtn" aria-label="고객 추가">+</button>
          </div>
          <input id="customerSearch" type="search" placeholder="이름 · 전화번호 검색" style="${searchInputStyle}margin-bottom:10px;" />
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
    sheet.querySelector('#customerSearch').addEventListener('input', _rerender);
    sheet.querySelector('#customerAddBtn').addEventListener('click', _openAddForm);
    // chip 클릭
    let _activeSeg = 'all';
    sheet.querySelectorAll('.cv4-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        _activeSeg = btn.dataset.seg;
        window._customerSeg = _activeSeg;
        sheet.querySelectorAll('.cv4-chip').forEach(b => b.classList.toggle('is-on', b.dataset.seg === _activeSeg));
        _windowSize = 50;
        _rerender();
      });
    });
    return sheet;
  }

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
    if (vc >= 10) return 'b3';
    if (vc >= 3)  return 'b2';
    return 'b1';
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
        // [v208] 5칩 단순화 — visits12/visits3plus/visits10plus/member
        if (seg === 'visits12')      return vc >= 1 && vc <= 2;
        if (seg === 'visits3plus')   return vc >= 3 && vc < 10;
        if (seg === 'visits10plus')  return vc >= 10;
        if (seg === 'member')        return !!c.membership_active || (Number(c.membership_balance) > 0);
        // legacy 호환 (옛 칩 값이 localStorage 에 남아있는 경우)
        if (seg === 'regular')       return !!c.is_regular;
        if (seg === 'new')           return vc <= 1;
        if (seg === 'visits1')       return vc === 1;
        if (seg === 'visits23')      return vc >= 2 && vc <= 3;
        if (seg === 'visits4plus')   return vc >= 4;
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
    count.textContent = (_cache ? _cache.length : 0) + '명' + (seg !== 'all' ? ` · ${items.length}명 표시` : '');
    offBadge.style.display = _isOffline ? 'inline-block' : 'none';

    if (!items.length) {
      box.innerHTML = `<div class="dt-empty">${_cache && _cache.length ? (seg !== 'all' ? '이 세그먼트에 해당하는 고객이 없어요.' : '검색 결과 없음') : '+ 버튼을 눌러 첫 고객을 등록해보세요'}</div>`;
      return;
    }
    // 검색 키워드 바뀌면 window 리셋
    const lastQ = box.dataset.lastQ || '';
    if (lastQ !== q) { _windowSize = 50; box.dataset.lastQ = q; }
    const totalLen = items.length;
    const visible = items.slice(0, _windowSize);
    const hasMore = totalLen > _windowSize;

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
          return `<div class="${rowCls}" data-id="${c.id}" data-chosung="${k}" role="button" tabindex="0">
            <div class="c-bar ${barCls}"></div>
            <div class="c-info">
              <div class="c-name"><span class="c-name-txt">${_esc(c.name)}</span><span class="c-badge ${badgeCls}">${vc}회</span></div>
            </div>
            <div class="c-arr">›</div>
          </div>`;
        }).join('');
        const secCls = isPC ? 'pi-sec' : 'sec-hd';
        return `<div class="${secCls}" id="cv4-sec-${encodeURIComponent(k)}">${k}</div>${rows}`;
      }).join('');

    box.innerHTML = groupsHtml
      + (hasMore
          ? `<button id="customerLoadMore" type="button" style="width:calc(100% - 20px);margin:12px 10px;padding:11px;border:1px dashed hsl(220,15%,80%);border-radius:12px;background:var(--surface-2);color:var(--text);font-size:13px;font-weight:600;cursor:pointer;">+ ${totalLen - _windowSize}명 더 보기</button>`
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
      more.addEventListener('click', () => { _windowSize += WINDOW_STEP; _rerender(); }, { once: true });
    }
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

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

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

  window._customerBack = _closeDetail;

  // [A4] popstate 리스너 — 뒤로가기 시 디테일 닫기
  window.addEventListener('popstate', (e) => {
    if (_isDetailOpen) {
      _closeDetail();
    }
  });

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

  window._customerDelete = function (id) {
    // [A7] 삭제 확인 메시지 통일
    window._inlineConfirm('이 고객을 삭제하면 시술 기록도 함께 삭제돼요. 계속할까요?', async () => {
      try {
        await remove(id);
        if (window.hapticLight) window.hapticLight();
        if (window.showToast) window.showToast('삭제 완료');
        _rerender();
      } catch (e) {
        console.warn('[customer] delete 실패:', e);
        if (window.showToast) window.showToast('삭제 실패');
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

  window.openCustomers = async function () {
    _resetSheetIfModeMismatched();
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
