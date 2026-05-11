/* 매출 허브 v5 — 풀스크린 (모바일) / ms-side+rv-pc (PC)
   진입: window.openRevenueHub() · 의존: app-autocomplete.js, app-import-wizard.js
   styles: css/screens/revenue-v5.css (rv- prefix) */
(function () {
  'use strict';

  const OID       = 'revenue-hub-overlay';
  const CACHE_KEY = 'rh_cache';
  const CACHE_TTL = 90000;
  const PC_BREAKPOINT = 1100;
  const API       = () => window.API  || '';
  const AUTH      = () => window.authHeader ? window.authHeader() : {};

  const TAG_CLS = {
    card: 'rv-tag--card', cash: 'rv-tag--cash',
    transfer: 'rv-tag--transfer', bank_transfer: 'rv-tag--transfer',
    membership: 'rv-tag--membership',
  };
  const TAG_LABEL = {
    card: '카드', cash: '현금', transfer: '계좌',
    bank_transfer: '계좌', membership: '회원권', etc: '기타',
  };

  const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  const _formatMan = (n) => {
    const v = +n || 0;
    if (v >= 10000) return (v / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '만원';
    return v.toLocaleString('ko-KR') + '원';
  };
  const _isPC = () => window.innerWidth >= PC_BREAKPOINT;

  const _state = { rows: [], pending: [], searchKW: '', editingId: null, isPC: false };

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
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d })); } catch (_) { void 0; }
  }

  /* ── fetch ─────────────────────────────────────────────────── */
  async function _fetch() {
    const cached = _readCache();
    if (cached) { _state.rows = cached; return; }
    const res = await fetch(`${API()}/revenue?period=month`, { headers: AUTH() });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    _state.rows = Array.isArray(data) ? data : (data.items || []);
    _writeCache(_state.rows);
    if (window.AppAutocomplete) window.AppAutocomplete.rebuild({ revenue: _state.rows });
  }

  /* ── 사이드바 (PC) ─────────────────────────────────────────── */
  function _renderPCSidebar() {
    const item = (act, iconId, label, active) => `
      <button type="button" class="ms-side__item${active ? ' is-active' : ''}" data-rh-side="${act}"${active ? ' aria-current="page"' : ''}>
        <span class="ms-side__icon"><svg width="18" height="18" aria-hidden="true"><use href="#${iconId}"/></svg></span>
        <span class="ms-side__label">${_esc(label)}</span>
      </button>`;
    return `<aside class="ms-side" aria-label="매출 허브 사이드바">
      <div class="ms-side__logo">잇데이</div>
      ${item('goHome', 'ic-home', '홈', false)}
      ${item('goMyshop', 'ic-store', '내샵관리', false)}
      <div class="ms-side__section">운영</div>
      ${item('booking', 'ic-calendar', '예약관리', false)}
      ${item('customer', 'ic-users', '고객관리', false)}
      ${item('revenue', 'ic-dollar-sign', '매출관리', true)}
      ${item('inventory', 'ic-package', '재고관리', false)}
      <div class="ms-side__section">통합 허브</div>
      ${item('aiHub', 'ic-sparkles', 'AI · 자동화', false)}
      ${item('settings', 'ic-settings', '설정 · 연동', false)}
    </aside>`;
  }

  /* ── 렌더 ──────────────────────────────────────────────────── */
  function _render() {
    const overlay = document.getElementById(OID);
    if (!overlay) return;
    const ac = window.AppAutocomplete ? window.AppAutocomplete.renderDatalist() : '';
    if (_state.isPC) {
      overlay.innerHTML = ac + `<div class="ms-root" style="flex-direction:row;min-height:100vh;">
        ${_renderPCSidebar()}
        <div class="rv-pc" id="rh-pc-main" style="display:block;flex:1;">
          ${_renderPCHeader()}
          ${_renderInputBar()}
          ${_renderPendingBanner()}
          ${_renderReportButton()}
          ${_renderListBlock()}
        </div>
      </div>`;
    } else {
      overlay.innerHTML = ac + _renderMobileHeader() + '<div id="rh-scroll" class="rv-body" style="flex:1;overflow-y:auto;padding:0 16px 16px;">' +
        _renderInputBar() + _renderPendingBanner() + _renderReportButton() +
        _renderListBlock() + '</div>';
    }
    _bindEvents();
  }

  function _renderMobileHeader() {
    return `<div class="rv-header">
      <button type="button" class="rv-header__back" data-act="close" aria-label="뒤로가기">
        <i class="ph-duotone ph-caret-left" style="font-size:14px" aria-hidden="true"></i>
      </button>
      <div class="rv-header__title-wrap"><div class="rv-header__title">매출 기록</div></div>
      <button type="button" class="rv-header__action" data-act="excel">
        <i class="ph-duotone ph-download-simple" aria-hidden="true"></i>엑셀
      </button>
    </div>`;
  }

  function _renderPCHeader() {
    return `<div class="rv-pc__header">
      <button type="button" class="rv-header__back" data-act="close" aria-label="닫기" style="margin-right:8px;">
        <i class="ph-duotone ph-x" style="font-size:14px" aria-hidden="true"></i>
      </button>
      <div class="rv-pc__title">매출 기록</div>
      <div class="rv-pc__spacer"></div>
      <button type="button" class="rv-pc__add" data-act="excel" style="background:var(--surface);color:var(--text);border:0.5px solid var(--border);">
        <i class="ph-duotone ph-download-simple" aria-hidden="true"></i>엑셀 불러오기
      </button>
    </div>`;
  }

  function _renderInputBar() {
    if (_state.isPC) return _renderInputBarPC();
    return `<div class="rv-qa" data-rh-qa style="margin:10px 0;">
      <input class="rv-qa__input" data-field="customer_name" placeholder="고객" list="ac-customer_name" />
      <input class="rv-qa__input" data-field="service_name"  placeholder="시술" list="ac-service_name" />
      <input class="rv-qa__input" data-field="amount" placeholder="금액" type="number" inputmode="numeric" style="flex:0.7;min-width:70px;" />
      <select class="rv-qa__method" data-field="method">
        <option value="card">카드</option><option value="cash">현금</option>
        <option value="transfer">계좌</option><option value="membership">회원권</option>
      </select>
      <button type="button" class="rv-qa__add" data-act="stack" title="쌓기 (Shift+Enter)" style="width:auto;padding:0 10px;background:var(--surface);color:var(--text);border:0.5px solid var(--border);">⊕</button>
      <button type="button" class="rv-qa__add" data-act="add" title="즉시 추가 (Enter)">+</button>
    </div>`;
  }

  function _renderInputBarPC() {
    return `<div class="rv-pc-qa" data-rh-qa>
      <div class="rv-pc-qa__label">매출 기록</div>
      <input class="rv-pc-qa__input" data-field="customer_name" list="ac-customer_name" placeholder="고객" />
      <input class="rv-pc-qa__input" data-field="service_name" list="ac-service_name" placeholder="시술" />
      <input class="rv-pc-qa__input rv-pc-qa__input--amount" data-field="amount" type="number" inputmode="numeric" placeholder="금액" />
      <select class="rv-pc-qa__input" data-field="method" style="flex:0 0 100px;">
        <option value="card">카드</option><option value="cash">현금</option>
        <option value="transfer">계좌</option><option value="membership">회원권</option>
      </select>
      <button type="button" class="rv-pc-qa__add" data-act="stack" style="background:var(--surface);color:var(--text);border:0.5px solid var(--border);">⊕ 쌓기</button>
      <button type="button" class="rv-pc-qa__add" data-act="add">즉시 추가 ↵</button>
    </div>`;
  }

  function _renderPendingBanner() {
    const items = _state.pending;
    if (!items.length) return '';
    const itemsHTML = items.map((p, i) =>
      `<div style="display:flex;gap:8px;padding:5px 8px;background:var(--surface);border:0.5px solid var(--border-strong);border-radius:8px;align-items:center;">
        <span style="color:var(--brand-strong);font-weight:800;min-width:18px;">${i + 1}.</span>
        <span style="flex:1;color:var(--text);font-size:12px;">${_esc(p.customer_name || '')} · ${_formatMan(p.amount)} · ${_esc(TAG_LABEL[p.method] || p.method || '')}</span>
        <button type="button" data-act="del-pending" data-idx="${i}" style="border:none;background:transparent;color:var(--danger);cursor:pointer;font-size:13px;">✕</button>
      </div>`).join('');
    return `<div style="margin:12px 0;padding:12px;background:var(--brand-bg);border:0.5px solid var(--border-strong);border-radius:var(--r-md);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:13px;font-weight:700;color:var(--brand-strong);">쌓아둔 ${items.length}건</span>
        <div style="display:flex;gap:6px;">
          <button type="button" data-act="clear-pending" style="background:none;border:0.5px solid var(--border);border-radius:8px;padding:5px 10px;font-size:11px;color:var(--text-muted);cursor:pointer;">비우기</button>
          <button type="button" data-act="flush" style="background:var(--brand-strong);border:none;border-radius:8px;padding:5px 12px;font-size:11px;color:#fff;font-weight:700;cursor:pointer;">⚡ ${items.length}개 한 번에 저장</button>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;">${itemsHTML}</div>
    </div>`;
  }

  function _renderReportButton() {
    if (typeof window.openRevenueReport !== 'function') return '';
    return `<button type="button" data-act="report" style="display:flex;align-items:center;gap:10px;width:100%;padding:12px 14px;margin:12px 0;background:var(--surface);border:0.5px solid var(--border);border-radius:var(--r-md);font-size:13px;font-weight:600;color:var(--text);cursor:pointer;text-align:left;">
      <i class="ph-duotone ph-chart-bar" aria-hidden="true"></i>
      <span style="flex:1;">상세 리포트</span>
      <i class="ph-duotone ph-caret-right" aria-hidden="true"></i>
    </button>`;
  }

  function _renderListBlock() {
    const list = _state.searchKW
      ? _state.rows.filter(r => ((r.customer_name || '') + ' ' + (r.service_name || '') + ' ' + (r.method || '')).toLowerCase().includes(_state.searchKW.toLowerCase()))
      : _state.rows;
    if (!list.length && !_state.searchKW) {
      return `<div style="padding:48px 20px;text-align:center;">
        <div style="font-size:36px;margin-bottom:8px;">💰</div>
        <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:4px;">매출 기록이 없어요</div>
        <div style="font-size:12px;color:var(--text-subtle);">위 입력바로 Enter 하면 바로 추가돼요</div>
      </div>`;
    }
    return `<div class="rv-section-row" style="margin-top:8px;">
        <div class="rv-section__title">최근 매출</div>
        <div class="rv-section__meta">${list.length}건</div>
      </div>
      <div style="padding:0 0 8px;position:relative;">
        <input class="rv-qa__input" id="rh-search" placeholder="검색 (고객/시술/방식)" value="${_esc(_state.searchKW)}" style="width:100%;padding:9px 12px;background:var(--surface);border:0.5px solid var(--border);border-radius:var(--r-sm);" />
      </div>
      <div class="rv-list">${list.map(r => _renderRow(r)).join('')}</div>`;
  }

  function _renderRow(r) {
    if (_state.editingId === r.id) return _renderEditRow(r);
    const tag = `<span class="rv-tag ${TAG_CLS[r.method] || ''}">${TAG_LABEL[r.method] || _esc(r.method || '카드')}</span>`;
    return `<div class="rv-list__item" data-id="${_esc(r.id)}">
      <div class="rv-list__amount">${_formatMan(r.amount)}</div>
      <div class="rv-list__info">
        <div class="rv-list__service">${_esc(r.service_name || '—')}</div>
        <div class="rv-list__meta">${tag}${r.customer_name ? `<span class="rv-list__customer">${_esc(r.customer_name)}</span>` : ''}</div>
      </div>
      <button type="button" class="rv-list__delete" data-act="edit" data-id="${_esc(r.id)}" aria-label="수정" style="color:var(--text-muted);">
        <i class="ph-duotone ph-pencil-simple" aria-hidden="true"></i>
      </button>
      <button type="button" class="rv-list__delete" data-act="del-row" data-id="${_esc(r.id)}" aria-label="삭제">
        <i class="ph-duotone ph-trash" style="font-size:14px" aria-hidden="true"></i>
      </button>
    </div>`;
  }

  function _renderEditRow(r) {
    return `<div class="rv-list__item" data-id="${_esc(r.id)}" style="flex-direction:column;align-items:stretch;gap:6px;background:var(--surface-2);">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;">
        <input class="rv-qa__input" data-ef="customer_name" value="${_esc(r.customer_name || '')}" placeholder="고객" />
        <input class="rv-qa__input" data-ef="service_name"  value="${_esc(r.service_name || '')}"  placeholder="시술" />
        <input class="rv-qa__input" data-ef="amount" type="number" value="${r.amount || ''}" placeholder="금액" />
        <select class="rv-qa__input" data-ef="method">
          ${['card','cash','transfer','membership','etc'].map(m => `<option value="${m}"${r.method === m ? ' selected' : ''}>${TAG_LABEL[m]}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;gap:6px;justify-content:flex-end;">
        <button type="button" data-act="edit-cancel" style="padding:6px 12px;border:0.5px solid var(--border);border-radius:8px;background:var(--surface);font-size:12px;cursor:pointer;color:var(--text);">취소</button>
        <button type="button" data-act="edit-save" data-id="${_esc(r.id)}" style="padding:6px 14px;border:none;border-radius:8px;background:var(--brand-strong);color:#fff;font-weight:700;font-size:12px;cursor:pointer;">저장</button>
      </div>
    </div>`;
  }

  /* ── 이벤트 ────────────────────────────────────────────────── */
  function _bindEvents() {
    const overlay = document.getElementById(OID);
    if (!overlay) return;
    overlay.addEventListener('click', _onClick);
    overlay.addEventListener('keydown', _onKeydown);
    const searchEl = overlay.querySelector('#rh-search');
    if (searchEl) {
      let timer;
      searchEl.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => { _state.searchKW = searchEl.value; _render(); }, 180);
      });
    }
  }

  async function _onClick(e) {
    const btn = e.target.closest('[data-act], [data-rh-side]');
    if (!btn) return;
    if (btn.dataset.rhSide) return _onSideNav(btn.dataset.rhSide);
    const act = btn.dataset.act;
    if (act === 'close') return closeRevenueHub();
    if (act === 'add') return _submitQuickAdd();
    if (act === 'stack') return _stackRow();
    if (act === 'flush') return _flushBatch();
    if (act === 'clear-pending') { _state.pending = []; _render(); return; }
    if (act === 'del-pending') { _state.pending.splice(+btn.dataset.idx, 1); _render(); return; }
    if (act === 'report') return window.openRevenueReport?.('month');
    if (act === 'excel') return _openExcelImport();
    if (act === 'edit') { _state.editingId = btn.dataset.id; _render(); return; }
    if (act === 'edit-cancel') { _state.editingId = null; _render(); return; }
    if (act === 'edit-save') return _saveEdit(btn.dataset.id);
    if (act === 'del-row') return _deleteRow(btn.dataset.id);
  }

  function _onSideNav(target) {
    closeRevenueHub();
    try {
      if (target === 'goHome' && typeof window.goHome === 'function') window.goHome();
      else if (target === 'goMyshop' && typeof window.goMyshop === 'function') window.goMyshop();
      else if (target === 'booking' && typeof window.openCalendarView === 'function') window.openCalendarView();
      else if (target === 'customer' && typeof window.openCustomerHub === 'function') window.openCustomerHub();
      else if (target === 'inventory' && typeof window.openInventoryHub === 'function') window.openInventoryHub();
      else if (target === 'aiHub' && typeof window.openAIHub === 'function') window.openAIHub();
      else if (target === 'settings' && typeof window.openSettingsHub === 'function') window.openSettingsHub();
      else if (target === 'revenue' && typeof window.openRevenue === 'function') window.openRevenue();
    } catch (_e) { void _e; }
  }

  function _onKeydown(e) {
    if (e.key === 'Escape') closeRevenueHub();
    const qadd = e.target.closest('[data-rh-qa]');
    if (!qadd) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _submitQuickAdd(); }
    if (e.key === 'Enter' &&  e.shiftKey) { e.preventDefault(); _stackRow(); }
  }

  /* ── CRUD ──────────────────────────────────────────────────── */
  function _collectInput() {
    const overlay = document.getElementById(OID);
    if (!overlay) return null;
    const v = {};
    overlay.querySelectorAll('[data-rh-qa] [data-field]').forEach(i => { v[i.dataset.field] = (i.value || '').trim(); });
    return v;
  }
  function _resetInput() {
    const overlay = document.getElementById(OID);
    if (!overlay) return;
    overlay.querySelectorAll('[data-rh-qa] [data-field]').forEach(i => {
      i.value = i.dataset.field === 'method' ? 'card' : '';
    });
    overlay.querySelector('[data-rh-qa] [data-field="customer_name"]')?.focus();
  }
  function _buildBody(v) {
    if (!v.amount || isNaN(+v.amount)) throw new Error('금액 필수');
    return {
      customer_name: v.customer_name || null,
      service_name:  v.service_name  || null,
      amount:        parseInt(v.amount, 10),
      method:        v.method || 'card',
    };
  }

  async function _submitQuickAdd() {
    const v = _collectInput();
    if (!v) return;
    let body;
    try { body = _buildBody(v); } catch (e) {
      if (window.showToast) window.showToast('' + e.message); return;
    }
    try {
      const res = await fetch(`${API()}/revenue`, {
        method: 'POST', headers: { ...AUTH(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const created = await res.json();
      _state.rows.unshift(created);
      sessionStorage.removeItem(CACHE_KEY);
      _writeCache(_state.rows);
      _resetInput(); _render();
      if (window.hapticLight) window.hapticLight();
      if (window.showToast) window.showToast('매출 추가 완료');
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'create_revenue', optimistic: false } })); } catch (_e) { void _e; }
    } catch (e) {
      if (window.showToast) window.showToast('저장 실패: ' + e.message);
    }
  }

  function _stackRow() {
    const v = _collectInput();
    if (!v) return;
    let body;
    try { body = _buildBody(v); } catch (e) {
      if (window.showToast) window.showToast('' + e.message); return;
    }
    _state.pending.push(body);
    if (window.hapticLight) window.hapticLight();
    _resetInput(); _render();
  }

  async function _flushBatch() {
    const items = [..._state.pending];
    if (!items.length) return;
    try {
      const results = await Promise.all(items.map(b =>
        fetch(`${API()}/revenue`, {
          method: 'POST', headers: { ...AUTH(), 'Content-Type': 'application/json' },
          body: JSON.stringify(b),
        }).then(r => r.json())
      ));
      _state.rows.unshift(...results.reverse());
      _state.pending = [];
      sessionStorage.removeItem(CACHE_KEY);
      _writeCache(_state.rows);
      _render();
      if (window.hapticLight) window.hapticLight();
      if (window.showToast) window.showToast(`${results.length}건 저장 완료`);
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'create_revenue', optimistic: false } })); } catch (_e) { void _e; }
    } catch (e) {
      if (window.showToast) window.showToast('저장 실패: ' + e.message);
    }
  }

  async function _saveEdit(rowId) {
    const overlay = document.getElementById(OID);
    if (!overlay) return;
    const row = overlay.querySelector(`.rv-list__item[data-id="${rowId}"]`);
    if (!row) return;
    const patch = {};
    row.querySelectorAll('[data-ef]').forEach(i => { patch[i.dataset.ef] = (i.value || '').trim(); });
    if (patch.amount) patch.amount = parseInt(patch.amount, 10);
    try {
      const res = await fetch(`${API()}/revenue/${rowId}`, {
        method: 'PATCH', headers: { ...AUTH(), 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const updated = await res.json();
      const idx = _state.rows.findIndex(r => String(r.id) === String(rowId));
      if (idx >= 0) _state.rows[idx] = updated;
      sessionStorage.removeItem(CACHE_KEY);
      _writeCache(_state.rows);
      _state.editingId = null; _render();
      if (window.showToast) window.showToast('수정 완료');
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'update_revenue', optimistic: false } })); } catch (_e) { void _e; }
    } catch (e) {
      if (window.showToast) window.showToast('수정 실패: ' + e.message);
    }
  }

  async function _deleteRow(rowId) {
    const ok = window._confirm2 ? window._confirm2('이 매출 기록을 삭제할까요?') : confirm('이 매출 기록을 삭제할까요?');
    if (!ok) return;
    try {
      const res = await fetch(`${API()}/revenue/${rowId}`, { method: 'DELETE', headers: AUTH() });
      if (!res.ok && res.status !== 204) throw new Error('HTTP ' + res.status);
      _state.rows = _state.rows.filter(r => String(r.id) !== String(rowId));
      sessionStorage.removeItem(CACHE_KEY);
      _writeCache(_state.rows);
      _render();
      if (window.hapticLight) window.hapticLight();
      if (window.showToast) window.showToast('삭제 완료');
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'delete_revenue', optimistic: false } })); } catch (_e) { void _e; }
    } catch (e) {
      if (window.showToast) window.showToast('삭제 실패: ' + e.message);
    }
  }

  /* ── 엑셀 임포트 ───────────────────────────────────────────── */
  function _openExcelImport() {
    const fi = document.createElement('input');
    fi.type = 'file'; fi.accept = '.csv,.xlsx,.xls'; fi.style.display = 'none';
    fi.addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (window.ImportWizard?.open) {
        window.ImportWizard.open({
          file: f, kind: 'revenue',
          onDone: async () => { sessionStorage.removeItem(CACHE_KEY); await _fetch(); _render(); },
        });
      }
    });
    document.body.appendChild(fi); fi.click(); fi.remove();
  }

  /* ── open / close ──────────────────────────────────────────── */
  function openRevenueHub() {
    if (document.getElementById(OID)) return;
    _state.isPC = _isPC();
    if (!_state.isPC) {
      const bd = document.createElement('div');
      bd.id = OID + '-bd';
      bd.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:9000;';
      bd.addEventListener('click', closeRevenueHub);
      document.body.appendChild(bd);
    }
    const overlay = document.createElement('div');
    overlay.id = OID;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    if (_state.isPC) {
      overlay.style.cssText = 'position:fixed;inset:0;z-index:9001;background:var(--bg);display:flex;flex-direction:row;';
    } else {
      overlay.style.cssText = 'position:fixed;inset:0 0 0 0;top:auto;height:96vh;background:var(--bg);border-radius:20px 20px 0 0;z-index:9001;display:flex;flex-direction:column;overflow:hidden;';
    }
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    _state.rows = []; _state.pending = []; _state.searchKW = ''; _state.editingId = null;
    _render();
    _fetch().then(() => _render()).catch(() => {});
    try {
      if (typeof window._registerSheet === 'function') window._registerSheet('revenuehub', closeRevenueHub);
      if (typeof window._markSheetOpen === 'function') window._markSheetOpen('revenuehub');
    } catch (_e) { void _e; }
  }

  function closeRevenueHub() {
    document.getElementById(OID + '-bd')?.remove();
    const o = document.getElementById(OID);
    if (!o) return;
    o.remove(); document.body.style.overflow = '';
    try { if (typeof window._markSheetClosed === 'function') window._markSheetClosed('revenuehub'); } catch (_e) { void _e; }
  }

  /* ── resize ─────────────────────────────────────────────────── */
  let _resizeTimer = null;
  window.addEventListener('resize', () => {
    if (!document.getElementById(OID)) return;
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      const newIsPC = _isPC();
      if (newIsPC !== _state.isPC) {
        _state.isPC = newIsPC;
        const o = document.getElementById(OID);
        document.getElementById(OID + '-bd')?.remove();
        if (o) {
          if (newIsPC) {
            o.style.cssText = 'position:fixed;inset:0;z-index:9001;background:var(--bg);display:flex;flex-direction:row;';
          } else {
            o.style.cssText = 'position:fixed;inset:0 0 0 0;top:auto;height:96vh;background:var(--bg);border-radius:20px 20px 0 0;z-index:9001;display:flex;flex-direction:column;overflow:hidden;';
            const bd = document.createElement('div');
            bd.id = OID + '-bd';
            bd.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:9000;';
            bd.addEventListener('click', closeRevenueHub);
            document.body.appendChild(bd);
          }
        }
        _render();
      }
    }, 200);
  });

  window.openRevenueHub   = openRevenueHub;
  window.closeRevenueHub  = closeRevenueHub;
  window.openRevenueInput = openRevenueHub;
  window.RevenueHub = {
    refresh:    async () => { sessionStorage.removeItem(CACHE_KEY); await _fetch(); _render(); },
    focusInput: () => document.querySelector(`#${OID} [data-field="customer_name"]`)?.focus(),
  };

  /* ── 외부 mutation 이벤트 ──────────────────────────────────── */
  if (typeof window !== 'undefined' && !window._revenueHubDataListenerInit) {
    window._revenueHubDataListenerInit = true;
    window.addEventListener('itdasy:data-changed', async (e) => {
      try { sessionStorage.removeItem(CACHE_KEY); } catch (_e) { void _e; }
      const kind = e && e.detail && e.detail.kind;
      if (kind && !/(revenue|expense|customer|booking|force_sync|focus_sync|online_restore)/.test(kind)) return;
      if (!document.getElementById(OID)) return;
      try { await _fetch(); _render(); } catch (_e) { void _e; }
    });
  }
})();
