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
  function _krw(n) { return (+n || 0).toLocaleString('ko-KR') + '원'; }
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

  const _state = { rows: [], enriched: [], searchKW: '', addPanelOpen: false };

  /* ── 캐시 ──────────────────────────────────────────────────── */
  function _readCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const { t, d } = JSON.parse(raw);
      return (Date.now() - t < CACHE_TTL) ? d : null;
    } catch (_) { return null; }
  }
  function _writeCache(d) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d })); } catch (_) {}
  }

  /* ── fetch + enrich ────────────────────────────────────────── */
  async function _fetchCustomers() {
    const cached = _readCache();
    if (cached) return cached;
    try {
      const res = await fetch(`${API()}/customers`, { headers: AUTH() });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.items || []);
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
    const [customers, revenues] = await Promise.all([_fetchCustomers(), _fetchRevenues()]);
    _state.rows    = customers;
    _state.enriched = _enrich(customers, revenues);
    if (window.AppAutocomplete) window.AppAutocomplete.rebuild({ customers });
  }

  /* ── 렌더 ──────────────────────────────────────────────────── */
  function _render() {
    const overlay = document.getElementById(OID);
    if (!overlay) return;
    const ac = window.AppAutocomplete ? window.AppAutocomplete.renderDatalist() : '';
    overlay.innerHTML = ac + _renderHeader() + _renderSearch() +
      (_state.addPanelOpen ? _renderAddPanel() : '') + _renderList();
    _bindEvents();
  }

  function _renderHeader() {
    return `<div class="hub-header">
      <button class="hub-back" data-act="close" aria-label="뒤로가기">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><use href="#ic-chevron-left"/></svg>
      </button>
      <span class="hub-title">고객</span>
      <button class="ch-excel-btn" data-act="excel">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="#ic-download"/></svg>
        엑셀 불러오기
      </button>
      <button class="ch-add-toggle${_state.addPanelOpen ? ' active' : ''}" data-act="toggle-add" aria-label="수동 추가">+</button>
    </div>`;
  }

  function _renderSearch() {
    return `<div class="ch-search-wrap">
      <div class="ch-search-inner">
        <svg class="ch-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><use href="#ic-search"/></svg>
        <input class="ch-search" id="ch-search" placeholder="이름·전화 검색" value="${_esc(_state.searchKW)}" />
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
    const list = kw
      ? _state.enriched.filter(c =>
          ((c.name||'') + ' ' + (c.phone||'') + ' ' + (c.memo||'')).toLowerCase().includes(kw))
      : _state.enriched;

    if (!list.length && !kw) {
      return `<div class="hub-empty">
        <div class="hub-empty-icon">👥</div>
        <div class="hub-empty-title">아직 고객이 없어요</div>
        <div class="hub-empty-desc">예약 잡으면 자동 등록돼요</div>
      </div>`;
    }
    if (!list.length && kw) {
      return `<div class="hub-empty">
        <div class="hub-empty-icon">🔍</div>
        <div class="hub-empty-title">해당 고객이 없어요</div>
        <div class="hub-empty-desc">직접 추가하려면 + 버튼을 누르세요</div>
      </div>`;
    }
    return `<div class="hub-sec-hd">
        <span>전체</span><span class="hub-sec-count">${list.length}명</span>
      </div>
      ${list.map(c => _renderRow(c)).join('')}`;
  }

  function _renderRow(c) {
    const sub = [
      c.last_visit_at ? `최근 ${_dateFmt(c.last_visit_at)}` : null,
      c.total_spent > 0 ? `누적 ${_krw(c.total_spent)}` : null,
      c.visit_count  > 0 ? `${c.visit_count}회` : null,
    ].filter(Boolean);
    return `<div class="ch-row" data-act="open-customer" data-id="${c.id}">
      <div class="ch-row-top">
        <span class="ch-name">${_esc(c.name)}</span>
        <span class="ch-phone-tail">${_esc(_tail(c.phone))}</span>
      </div>
      ${sub.length ? `<div class="ch-sub">${sub.map((s, i) => (i > 0 ? '<span class="ch-sub-dot">·</span>' : '') + _esc(s)).join('')}</div>` : ''}
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
    if (!v.name) { if (window.showToast) window.showToast('⚠️ 이름 필수'); return; }
    try {
      const res = await fetch(`${API()}/customers?force=true`, {
        method: 'POST', headers: { ...AUTH(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: v.name, phone: v.phone || null, memo: v.memo || '', tags: [] }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const created = await res.json();
      _state.rows.push(created);
      _state.enriched.push(created);
      _writeCache(_state.rows);
      _state.addPanelOpen = false;
      _render();
      if (window.hapticLight) window.hapticLight();
      if (window.showToast) window.showToast(`✅ ${v.name} 추가 완료`);
    } catch (e) { if (window.showToast) window.showToast('저장 실패: ' + e.message); }
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
          onDone: async () => { sessionStorage.removeItem(CACHE_KEY); await _load(); _render(); },
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
    _state.rows = []; _state.enriched = []; _state.searchKW = ''; _state.addPanelOpen = false;
    _render();
    _load().then(() => _render()).catch(() => {});
  }

  function closeCustomerHub() {
    document.getElementById(OID + '-bd')?.remove();
    const o = document.getElementById(OID);
    if (!o) return;
    o.remove(); document.body.style.overflow = '';
  }

  window.openCustomerHub  = openCustomerHub;
  window.closeCustomerHub = closeCustomerHub;
  window.CustomerHub = {
    refresh: async () => { sessionStorage.removeItem(CACHE_KEY); await _load(); _render(); },
    focusSearch: () => document.querySelector(`#${OID} #ch-search`)?.focus(),
  };
})();
