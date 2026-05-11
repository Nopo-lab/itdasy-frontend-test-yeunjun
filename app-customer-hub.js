/* ─────────────────────────────────────────────────────────────
   고객 허브 — 풀스크린 독립 허브 (T-410)
   진입: window.openCustomerHub()
   의존: app-autocomplete.js, app-import-wizard.js (옵션)
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const OID       = 'customer-hub-overlay';
  const CACHE_KEY = 'ch_cache';
  const CACHE_TTL = 90000;
  const API       = () => window.API  || '';
  const AUTH      = () => window.authHeader ? window.authHeader() : {};

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function _tail(phone) {
    if (!phone) return '';
    const d = phone.replace(/\D/g, '');
    return d.length >= 4 ? '…' + d.slice(-4) : phone;
  }
  function _dateFmt(s) {
    if (!s) return '';
    return s.slice(0, 10).replace(/-/g, '/');
  }

  const _MOCK = [
    { id: 'mk1', name: '김소연', phone: '010-1234-5678', memo: '예민한 두피, 아미노산 선호', visit_count: 8,  total_spent: 320000, last_visit_at: '2026-04-18' },
    { id: 'mk2', name: '이민지', phone: '010-9876-5432', memo: '펌 알러지 이력 있음',        visit_count: 5,  total_spent: 185000, last_visit_at: '2026-04-20' },
    { id: 'mk3', name: '박지현', phone: '010-5555-1234', memo: '',                           visit_count: 12, total_spent: 540000, last_visit_at: '2026-04-22' },
    { id: 'mk4', name: '최수빈', phone: '010-7777-8888', memo: '단골, 매달 1회',             visit_count: 23, total_spent: 890000, last_visit_at: '2026-04-10' },
    { id: 'mk5', name: '정하늘', phone: '010-3333-7777', memo: '탈색 3회 이력',              visit_count: 3,  total_spent:  95000, last_visit_at: '2026-03-28' },
    { id: 'mk6', name: '한다은', phone: '010-2222-9999', memo: '두피 스케일링 선호',         visit_count: 6,  total_spent: 248000, last_visit_at: '2026-04-15' },
  ];

  // _state.filter ∈ 'all' | 'member' | 'new' | 'regular' | 'risk'
  const _state = { rows: [], enriched: [], searchKW: '', addPanelOpen: false, filter: 'all', selectedId: null };
  const _classifyMemo = new Map();

  /* ── 분류 helper: 신규(첫방문 30일내) / 단골(방문≥5회) / 이탈(60일+ 미방문) / 생일(오늘) / 회원권 보유 ── */
  function _daysBetween(iso, ref) {
    if (!iso) return null;
    const a = new Date(iso).getTime();
    if (isNaN(a)) return null;
    const b = (ref || new Date()).getTime();
    return Math.floor((b - a) / 86400000);
  }
  function _classify(c) {
    const key = [
      c.id, c.visit_count, c.last_visit_at, c.first_visit_at,
      c.created_at, c.membership_balance, c.birthday,
    ].join('|');
    if (_classifyMemo.has(key)) return _classifyMemo.get(key);
    const visits = +c.visit_count || 0;
    const lastDays = _daysBetween(c.last_visit_at);
    const firstDays = _daysBetween(c.first_visit_at || c.created_at);
    const isNew     = visits <= 1 || (firstDays !== null && firstDays <= 30 && visits < 3);
    const isRegular = visits >= 5;
    const isRisk    = lastDays !== null && lastDays >= 60;
    const hasMember = +c.membership_balance > 0;
    const isBirthday = (() => {
      if (!c.birthday) return false;
      const raw = String(c.birthday).trim();
      const m = raw.match(/^(\d{1,2})[-/](\d{1,2})$/) || raw.match(/^\d{4}-(\d{1,2})-(\d{1,2})/);
      if (!m) return false;
      const today = new Date();
      const mo = +m[1], dy = +m[2];
      return mo === today.getMonth() + 1 && dy === today.getDate();
    })();
    const result = { isNew, isRegular, isRisk, hasMember, isBirthday, visits, lastDays };
    if (_classifyMemo.size > 1000) _classifyMemo.clear();
    _classifyMemo.set(key, result);
    return result;
  }

  function _stats(enriched) {
    const total = enriched.length;
    let newThisMonth = 0, risk = 0, member = 0;
    const now = new Date(), curM = now.getMonth(), curY = now.getFullYear();
    enriched.forEach(c => {
      const cls = _classify(c);
      if (cls.isRisk) risk++;
      if (cls.hasMember) member++;
      const fv = c.first_visit_at || c.created_at;
      if (fv) {
        const d = new Date(fv);
        if (!isNaN(d) && d.getMonth() === curM && d.getFullYear() === curY) newThisMonth++;
      }
    });
    return { total, newThisMonth, risk, member };
  }

  /* ── 캐시 ──────────────────────────────────────────────────── */
  function _readCache() {
    const shared = window.CustomerCache?.read && window.CustomerCache.read({ minItems: 1 });
    if (shared) return shared.items;
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const { t, d } = JSON.parse(raw);
      if (Date.now() - t >= CACHE_TTL) return null;
      return (Array.isArray(d) && d.length) ? d : null;
    } catch (_) { return null; }
  }
  function _writeCache(d) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d })); } catch (_) { void 0; }
    try { window.CustomerCache?.set && window.CustomerCache.set(d); } catch (_) { void 0; }
  }

  function _refreshCustomersInBackground(prev) {
    if (!window.CustomerCache?.fetchFresh) return;
    window.CustomerCache.fetchFresh().then(fresh => {
      if (!Array.isArray(fresh) || JSON.stringify(fresh) === JSON.stringify(prev)) return;
      _state.rows = fresh;
      _state.enriched = _enrich(fresh, []);
      _writeCache(fresh);
      if (document.getElementById(OID)) _render();
      _fetchRevenues().then(revenues => {
        _state.enriched = _enrich(fresh, revenues);
        if (document.getElementById(OID)) _render();
      }).catch(() => {});
    }).catch(() => {});
  }

  /* ── fetch + enrich ────────────────────────────────────────── */
  async function _fetchCustomers() {
    const cached = _readCache();
    if (cached) {
      _refreshCustomersInBackground(cached);
      return cached;
    }
    try {
      const list = window.CustomerCache?.fetchFresh
        ? await window.CustomerCache.fetchFresh()
        : await fetch(`${API()}/customers`, { headers: AUTH() })
          .then(async res => {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            return Array.isArray(data) ? data : (data.items || []);
          });
      const result = list.length ? list : _MOCK;
      _writeCache(result);
      return result;
    } catch (_) { return _MOCK; }
  }

  async function _fetchRevenues() {
    try {
      const res = await fetch(`${API()}/revenue?period=month`, { headers: AUTH() });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.items || []);
    } catch (_) { return []; }
  }

  function _enrich(customers, revenues) {
    const byName = {};
    revenues.forEach(r => {
      const k = r.customer_name;
      if (!k) return;
      if (!byName[k]) byName[k] = { total: 0, lastAt: null };
      byName[k].total += (r.amount || 0);
      const at = r.created_at || r.date;
      if (at && (!byName[k].lastAt || at > byName[k].lastAt)) byName[k].lastAt = at;
    });
    return customers.map(c => ({
      ...c,
      total_spent:   byName[c.name]?.total   || c.total_spent   || 0,
      last_visit_at: byName[c.name]?.lastAt  || c.last_visit_at || null,
    }));
  }

  async function _load() {
    // [2026-05-04] customers 먼저 표시 → revenues 백그라운드 enrich.
    // 이전: Promise.all 로 두 fetch 다 기다려서 revenue 가 느리면 hub 전체 멈춤.
    const customers = await _fetchCustomers();
    _state.rows    = customers;
    _state.enriched = _enrich(customers, []);
    if (window.AppAutocomplete) window.AppAutocomplete.rebuild({ customers });
    // 백그라운드: revenues 도착하면 enrich 다시 + 재렌더
    _fetchRevenues().then(revenues => {
      _state.enriched = _enrich(customers, revenues);
      try { _render(); } catch (_e) { void _e; }
    }).catch(() => {});
  }

  /* ── 렌더 ──────────────────────────────────────────────────── */
  function _render() {
    const overlay = document.getElementById(OID);
    if (!overlay) return;
    const ac = window.AppAutocomplete ? window.AppAutocomplete.renderDatalist() : '';
    const isDesktop = window.matchMedia && window.matchMedia('(min-width: 900px)').matches;
    overlay.classList.toggle('hub-overlay--prototype', !!isDesktop);
    overlay.classList.toggle('hub-overlay--customer', !!isDesktop);
    if (isDesktop && window.HubPrototypeRender?.customer) {
      overlay.innerHTML = ac + window.HubPrototypeRender.customer({
        state: _state,
        classify: _classify,
        stats: _stats,
      });
      _bindEvents();
      return;
    }
    overlay.innerHTML = ac + _renderHeader() + _renderSearch() +
      (_state.addPanelOpen ? _renderAddPanel() : '') +
      _renderStats() + _renderFilterChips() + _renderList() +
      '<button class="hub-fab-add" data-act="toggle-add" aria-label="고객 추가">+</button>';
    _bindEvents();
  }

  function _renderStats() {
    const s = _stats(_state.enriched);
    return `<div class="hub-stats-row">
      <div class="hub-stat-mini"><div class="lbl">전체 고객</div><div class="val">${s.total}명</div></div>
      <div class="hub-stat-mini"><div class="lbl">이번달 신규</div><div class="val">${s.newThisMonth}명</div></div>
      <div class="hub-stat-mini"><div class="lbl">이탈 위험</div><div class="val${s.risk ? ' danger' : ''}">${s.risk}명</div></div>
    </div>`;
  }

  function _renderFilterChips() {
    const s = _stats(_state.enriched);
    const f = _state.filter;
    const counts = { all: s.total, member: s.member, new: 0, regular: 0, risk: s.risk };
    counts.new = _state.enriched.filter(c => _classify(c).isNew).length;
    counts.regular = _state.enriched.filter(c => _classify(c).isRegular).length;
    return `<div class="hub-filter-chips">
      <button class="hub-fc-chip${f==='all'?' on':''}"     data-act="filter" data-filter="all">전체 ${counts.all}</button>
      <button class="hub-fc-chip${f==='member'?' on':''}"  data-act="filter" data-filter="member">멤버 ${counts.member}</button>
      <button class="hub-fc-chip${f==='new'?' on':''}"     data-act="filter" data-filter="new">신규 ${counts.new}</button>
      <button class="hub-fc-chip${f==='regular'?' on':''}" data-act="filter" data-filter="regular">단골 ${counts.regular}</button>
      <button class="hub-fc-chip danger${f==='risk'?' on':''}" data-act="filter" data-filter="risk">이탈 위험 ${counts.risk}</button>
    </div>`;
  }

  function _renderHeader() {
    return `<div class="hub-header">
      <button class="hub-back" data-act="close" aria-label="뒤로가기">
        <i class="ph-duotone ph-caret-left" aria-hidden="true"></i>
      </button>
      <span class="hub-title">고객관리</span>
      <button class="ch-excel-btn" data-act="excel">
        <i class="ph-duotone ph-download-simple" aria-hidden="true"></i>
        엑셀 불러오기
      </button>
      <button class="ch-add-toggle${_state.addPanelOpen ? ' active' : ''}" data-act="toggle-add" aria-label="수동 추가">+</button>
    </div>`;
  }

  function _renderSearch() {
    return `<div class="ch-search-wrap">
      <div class="ch-search-inner">
        <i class="ph-duotone ph-magnifying-glass" aria-hidden="true"></i>
        <input class="ch-search" id="ch-search" placeholder="이름·연락처·태그 검색" value="${_esc(_state.searchKW)}" />
      </div>
    </div>`;
  }

  function _renderAddPanel() {
    return `<div class="ch-add-panel">
      <input class="hub-input" data-field="name"  placeholder="이름" list="ac-customer_name" style="flex:1;"/>
      <input class="hub-input" data-field="phone" placeholder="전화 010-..." style="flex:1;"/>
      <input class="hub-input" data-field="memo"  placeholder="메모 (선택)" style="flex:1.5;"/>
      <button class="hub-btn-add" data-act="add-customer">추가</button>
    </div>`;
  }

  function _renderList() {
    const kw = _state.searchKW.toLowerCase();
    const f  = _state.filter;
    let list = kw
      ? _state.enriched.filter(c =>
          ((c.name||'') + ' ' + (c.phone||'') + ' ' + (c.memo||'') + ' ' + (Array.isArray(c.tags) ? c.tags.join(' ') : '')).toLowerCase().includes(kw))
      : _state.enriched.slice();

    if (f !== 'all') {
      list = list.filter(c => {
        const cl = _classify(c);
        return (f === 'member'  && cl.hasMember) ||
               (f === 'new'     && cl.isNew) ||
               (f === 'regular' && cl.isRegular) ||
               (f === 'risk'    && cl.isRisk);
      });
    }
    // 최근 방문 순 정렬
    list.sort((a, b) => (b.last_visit_at || '').localeCompare(a.last_visit_at || ''));

    if (!list.length && !kw && f === 'all') {
      return `<div class="hub-empty">
        <div class="hub-empty-icon"><i class="ph-duotone ph-users" aria-hidden="true"></i></div>
        <div class="hub-empty-title">아직 고객이 없어요</div>
        <div class="hub-empty-desc">예약 잡으면 자동 등록돼요</div>
      </div>`;
    }
    if (!list.length) {
      return `<div class="hub-empty">
        <div class="hub-empty-icon"><i class="ph-duotone ph-magnifying-glass" aria-hidden="true"></i></div>
        <div class="hub-empty-title">해당 고객이 없어요</div>
        <div class="hub-empty-desc">필터를 바꾸거나 + 버튼으로 추가하세요</div>
      </div>`;
    }
    return `<div class="hub-sec-hd">
        <span>고객 목록</span><span class="hub-sec-count">${list.length}명 · 최근 방문순</span>
      </div>
      ${list.map(c => _renderRow(c)).join('')}`;
  }

  function _renderRow(c) {
    const cl = _classify(c);
    const initial = _esc((c.name || '·').slice(0, 1));
    const avatarCls = cl.isRegular || cl.hasMember ? '' : ' gray';

    const badges = [];
    if (cl.isRegular)  badges.push(`<span class="badge badge-regular">단골</span>`);
    if (cl.hasMember)  badges.push(`<span class="badge badge-member">회원권 ${(+c.membership_balance/10000).toFixed(1)}만</span>`);
    if (cl.isNew && !cl.isRegular) badges.push(`<span class="badge badge-new">신규</span>`);
    if (cl.isRisk)     badges.push(`<span class="badge badge-risk">${cl.lastDays}일+ 미방문</span>`);
    if (cl.isBirthday) badges.push(`<span class="badge badge-birthday">오늘 생일</span>`);

    const phoneTail = c.phone ? _esc(_tail(c.phone)) : '';
    const cycle = c.avg_cycle_weeks ? `${c.avg_cycle_weeks}주 주기` : null;
    const recentTxt = c.last_visit_at ? `최근 ${_dateFmt(c.last_visit_at)}` : null;
    const subParts = [phoneTail, cycle, recentTxt].filter(Boolean);

    return `<div class="cust-row" data-act="open-customer" data-id="${c.id}">
      <div class="cust-avatar${avatarCls}">${initial}</div>
      <div class="cust-info">
        <div class="cust-name-row">
          <span class="cust-name">${_esc(c.name)}</span>
          ${cl.visits > 0 ? `<span class="cust-visits">방문 ${cl.visits}회</span>` : ''}
        </div>
        <div class="cust-meta">
          ${badges.join('')}
          ${subParts.length ? `<span>${subParts.join(' · ')}</span>` : ''}
        </div>
      </div>
      <span class="cust-chev">
        <i class="ph-duotone ph-caret-right" aria-hidden="true"></i>
      </span>
    </div>`;
  }

  /* ── 이벤트 ────────────────────────────────────────────────── */
  function _bindEvents() {
    const overlay = document.getElementById(OID);
    if (!overlay) return;
    overlay.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if      (act === 'close')          closeCustomerHub();
      else if (act === 'toggle-add')     { _state.addPanelOpen = !_state.addPanelOpen; _render(); setTimeout(() => overlay.querySelector('[data-field="name"]')?.focus(), 50); }
      else if (act === 'add-customer')   await _addCustomer();
      else if (act === 'excel')          _openExcelImport();
      else if (act === 'filter')         { _state.filter = btn.dataset.filter || 'all'; _render(); }
      else if (act === 'select-customer') { _state.selectedId = btn.dataset.id; _render(); }
      else if (act === 'desktop-revenue') _openCustomerRevenue(btn.dataset.id);
      else if (act === 'desktop-booking') _openCustomerBooking(btn.dataset.id);
      else if (act === 'desktop-membership') _openCustomerMembership(btn.dataset.id);
      else if (act === 'open-customer') {
        const id = btn.dataset.id;
        if (typeof window.openCustomerDashboard === 'function') window.openCustomerDashboard(id);
      }
    });
    const searchEl = overlay.querySelector('#ch-search');
    if (searchEl) {
      let timer;
      searchEl.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => { _state.searchKW = searchEl.value; _render(); }, 180);
      });
    }
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeCustomerHub();
    });
  }

  /* ── 수동 추가 ─────────────────────────────────────────────── */
  async function _addCustomer() {
    const overlay = document.getElementById(OID); if (!overlay) return;
    const v = {};
    overlay.querySelectorAll('.ch-add-panel [data-field]').forEach(i => { v[i.dataset.field] = i.value.trim(); });
    if (!v.name) { if (window.showToast) window.showToast('이름 필수'); return; }
    try {
      const res = await fetch(`${API()}/customers?force=true`, {
        method: 'POST', headers: { ...AUTH(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: v.name, phone: v.phone || null, memo: v.memo || '', tags: [] }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const created = await res.json();
      _state.rows.push(created);
      _state.enriched.push(created);
      _state.selectedId = created.id;
      _writeCache(_state.rows);
      try { window.CustomerCache?.set && window.CustomerCache.set(_state.rows); } catch (_e) { void _e; }
      _state.addPanelOpen = false;
      _render();
      if (window.hapticLight) window.hapticLight();
      if (window.showToast) window.showToast(`${v.name} 추가 완료`);
    } catch (e) { if (window.showToast) window.showToast('저장 실패: ' + e.message); }
  }

  function _findCustomer(id) {
    return (_state.enriched || []).find(c => String(c.id) === String(id));
  }

  function _openCustomerRevenue(id) {
    const c = _findCustomer(id);
    if (!c) return;
    closeCustomerHub();
    if (typeof window.openRevenue === 'function') {
      window.openRevenue();
      if (typeof window._openRevenueAddFor === 'function') window._openRevenueAddFor(c.id, c.name);
    } else if (typeof window.openRevenueHub === 'function') window.openRevenueHub();
  }

  function _openCustomerBooking(id) {
    const c = _findCustomer(id);
    if (!c) return;
    window._pendingBookingCustomer = { id: c.id, name: c.name };
    closeCustomerHub();
    if (typeof window.openCalendarView === 'function') window.openCalendarView();
    else if (typeof window.openBooking === 'function') window.openBooking();
  }

  function _openCustomerMembership(id) {
    const c = _findCustomer(id);
    if (!c) return;
    closeCustomerHub();
    if (window.MembershipUI?.openTopupSheet) window.MembershipUI.openTopupSheet(c.id, c.name || '');
  }

  /* ── 엑셀 임포트 ───────────────────────────────────────────── */
  function _openExcelImport() {
    const fi = document.createElement('input');
    fi.type = 'file'; fi.accept = '.csv,.xlsx,.xls'; fi.style.display = 'none';
    fi.addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (window.ImportWizard?.open) {
        window.ImportWizard.open({
          file: f, kind: 'customer',
          onDone: async () => { sessionStorage.removeItem(CACHE_KEY); window.CustomerCache?.clear?.(); await _load(); _render(); },
        });
      }
    });
    document.body.appendChild(fi); fi.click(); fi.remove();
  }

  /* ── open / close ──────────────────────────────────────────── */
  function openCustomerHub() {
    if (document.getElementById(OID)) return;
    const bd = document.createElement('div');
    bd.id = OID + '-bd'; bd.className = 'hub-backdrop';
    bd.addEventListener('click', closeCustomerHub);
    document.body.appendChild(bd);
    const overlay = document.createElement('div');
    overlay.id = OID; overlay.className = 'hub-overlay';
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    _state.rows = []; _state.enriched = []; _state.searchKW = ''; _state.addPanelOpen = false; _state.selectedId = null;
    _render();
    _load().then(() => _render()).catch(() => {});
    // [2026-04-26 A5] popstate 등록
    try {
      if (typeof window._registerSheet === 'function') window._registerSheet('customers', closeCustomerHub);
      if (typeof window._markSheetOpen === 'function') window._markSheetOpen('customers');
    } catch (_e) { void _e; }
  }

  function closeCustomerHub() {
    document.getElementById(OID + '-bd')?.remove();
    const o = document.getElementById(OID);
    if (!o) return;
    o.remove(); document.body.style.overflow = '';
    try { if (typeof window._markSheetClosed === 'function') window._markSheetClosed('customers'); } catch (_e) { void _e; }
  }

  window.openCustomerHub  = openCustomerHub;
  window.closeCustomerHub = closeCustomerHub;
  window.CustomerHub = {
    refresh: async () => { sessionStorage.removeItem(CACHE_KEY); window.CustomerCache?.clear?.(); await _load(); _render(); },
    focusSearch: () => document.querySelector(`#${OID} #ch-search`)?.focus(),
  };
})();
