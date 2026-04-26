/* ─────────────────────────────────────────────────────────────
   재고 허브 — 풀스크린 독립 허브 (T-400)
   진입: window.openInventoryHub()
   의존: app-autocomplete.js
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const OID       = 'inventory-hub-overlay';
  const CACHE_KEY = 'ih_cache';
  const CACHE_TTL = 90000;
  const API       = () => window.API  || '';
  const AUTH      = () => window.authHeader ? window.authHeader() : {};

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  const _state = { rows: [], pending: [], searchKW: '', editingId: null };

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

  /* ── fetch ─────────────────────────────────────────────────── */
  async function _fetch() {
    const cached = _readCache();
    if (cached) { _state.rows = cached; return; }
    const res = await fetch(`${API()}/inventory`, { headers: AUTH() });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    _state.rows = Array.isArray(data) ? data : (data.items || []);
    _writeCache(_state.rows);
    if (window.AppAutocomplete) window.AppAutocomplete.rebuild({ inventory: _state.rows });
  }

  /* ── 파티션 ────────────────────────────────────────────────── */
  function _partition(rows) {
    const q = _state.searchKW.toLowerCase();
    const list = q ? rows.filter(r => ((r.name || '') + ' ' + (r.category || '')).toLowerCase().includes(q)) : rows;
    return {
      low: list.filter(r => (r.quantity || 0) < (r.threshold || 0)),
      ok:  list.filter(r => (r.quantity || 0) >= (r.threshold || 0)),
    };
  }

  /* ── 렌더 ──────────────────────────────────────────────────── */
  function _render() {
    const overlay = document.getElementById(OID);
    if (!overlay) return;
    const ac = window.AppAutocomplete ? window.AppAutocomplete.renderDatalist() : '';
    const { low, ok } = _partition(_state.rows);
    overlay.innerHTML = ac + _renderHeader() +
      _renderInputBar() + _renderPendingBanner() +
      _renderLowBlock(low) + _renderOkBlock(ok);
    _bindEvents();
  }

  function _renderHeader() {
    return `<div class="hub-header">
      <button class="hub-back" data-act="close" aria-label="뒤로가기">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><use href="#ic-chevron-left"/></svg>
      </button>
      <span class="hub-title">재고</span>
      <div style="flex:1;position:relative;max-width:180px;">
        <svg style="position:absolute;left:8px;top:50%;transform:translateY(-50%);color:#999;pointer-events:none;" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><use href="#ic-search"/></svg>
        <input id="ih-search" placeholder="검색" value="${_esc(_state.searchKW)}"
          style="width:100%;height:32px;padding:0 8px 0 26px;border:1.5px solid #E5E5EA;border-radius:10px;font-size:12px;box-sizing:border-box;-webkit-appearance:none;"/>
      </div>
    </div>`;
  }

  function _renderInputBar() {
    return `<div class="hub-qadd">
      <input class="hub-input" data-field="name"      placeholder="품목 이름" list="ac-item_name" style="flex:1.5;"/>
      <input class="hub-input" data-field="quantity"  placeholder="수량" type="number" style="flex:0.6;min-width:60px;"/>
      <input class="hub-input" data-field="threshold" placeholder="임계" type="number" value="3" style="flex:0.6;min-width:60px;"/>
      <input class="hub-input" data-field="category"  placeholder="nail|hair|lash" list="ac-inv_category" style="flex:0.9;"/>
      <button class="hub-btn-stack" data-act="stack">⊕ 쌓기</button>
      <button class="hub-btn-add"  data-act="add">즉시 추가 ↵</button>
    </div>`;
  }

  function _renderPendingBanner() {
    const items = _state.pending;
    if (!items.length) return '';
    return `<div class="hub-pending">
      <div class="hub-pending-hd">
        <span class="hub-pending-lbl">⏳ 쌓아둔 ${items.length}건</span>
        <div class="hub-pending-btns">
          <button class="hub-btn-clear" data-act="clear-pending">비우기</button>
          <button class="hub-btn-flush" data-act="flush">⚡ ${items.length}개 한 번에 저장</button>
        </div>
      </div>
    </div>`;
  }

  function _renderLowBlock(low) {
    if (!low.length) return '';
    return `<div class="ih-low-hd">🔴 지금 부족해요 <span style="font-size:13px;font-weight:500;color:#666;">(${low.length})</span></div>
      ${low.map(r => _renderLowCard(r)).join('')}`;
  }

  function _renderLowCard(r) {
    if (_state.editingId === r.id) return _renderEditRow(r, true);
    return `<div class="ih-low-card" data-id="${r.id}">
      <div>
        <div class="ih-item-name">${_esc(r.name)}</div>
        <div class="ih-item-meta">임계 ${r.threshold || 0} · ${_esc(r.category || '—')}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <div class="ih-stepper">
          <button class="ih-step" data-act="step" data-id="${r.id}" data-delta="-1">−</button>
          <span class="ih-qty">${r.quantity}</span>
          <button class="ih-step" data-act="step" data-id="${r.id}" data-delta="1">+</button>
        </div>
        <button style="border:none;background:transparent;color:#bbb;cursor:pointer;font-size:13px;padding:4px;" data-act="edit" data-id="${r.id}">✎</button>
      </div>
    </div>`;
  }

  function _renderOkBlock(ok) {
    if (!ok.length && !_state.rows.length) {
      return `<div class="hub-empty">
        <div class="hub-empty-icon">📦</div>
        <div class="hub-empty-title">재고가 비어있어요</div>
        <div class="hub-empty-desc">품목 이름 적고 Enter 로 추가하세요</div>
      </div>`;
    }
    if (!ok.length) return '';
    return `<div class="hub-sec-hd">
        <span>🟢 정상</span><span class="hub-sec-count">${ok.length}</span>
      </div>
      ${ok.map(r => _renderOkRow(r)).join('')}`;
  }

  function _renderOkRow(r) {
    if (_state.editingId === r.id) return _renderEditRow(r, false);
    return `<div class="ih-ok-row" data-id="${r.id}">
      <div>
        <div class="ih-item-name">${_esc(r.name)}</div>
        <div class="ih-ok-meta">${r.quantity}${_esc(r.unit || '개')} · 임계 ${r.threshold || 0}</div>
      </div>
      <div class="ih-ok-stepper-wrap" style="display:flex;align-items:center;gap:6px;">
        <div class="ih-stepper">
          <button class="ih-step" data-act="step" data-id="${r.id}" data-delta="-1">−</button>
          <span class="ih-qty">${r.quantity}</span>
          <button class="ih-step" data-act="step" data-id="${r.id}" data-delta="1">+</button>
        </div>
        <button style="border:none;background:transparent;color:#bbb;cursor:pointer;font-size:13px;padding:4px;" data-act="edit" data-id="${r.id}">✎</button>
      </div>
    </div>`;
  }

  function _renderEditRow(r, isLow) {
    const wrap = isLow ? 'ih-low-card' : 'ih-ok-row';
    return `<div class="${wrap} editing" data-id="${r.id}" style="flex-direction:column;align-items:stretch;gap:6px;">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;">
        <input class="rh-edit-input" data-ef="name"      value="${_esc(r.name||'')}" placeholder="품목"/>
        <input class="rh-edit-input" data-ef="quantity"  value="${r.quantity||0}" type="number" placeholder="수량"/>
        <input class="rh-edit-input" data-ef="threshold" value="${r.threshold||0}" type="number" placeholder="임계"/>
        <input class="rh-edit-input" data-ef="category"  value="${_esc(r.category||'')}" placeholder="분류"/>
      </div>
      <div class="rh-edit-actions">
        <button class="rh-edit-cancel" data-act="edit-cancel">취소</button>
        <button class="rh-edit-save"   data-act="edit-save" data-id="${r.id}">저장</button>
      </div>
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
      if      (act === 'close')         closeInventoryHub();
      else if (act === 'add')           await _submitQuickAdd();
      else if (act === 'stack')         _stackRow();
      else if (act === 'flush')         await _flushBatch();
      else if (act === 'clear-pending') { _state.pending = []; _render(); }
      else if (act === 'step')          await _adjustQuantity(btn.dataset.id, +btn.dataset.delta);
      else if (act === 'edit')          { _state.editingId = btn.dataset.id; _render(); }
      else if (act === 'edit-cancel')   { _state.editingId = null; _render(); }
      else if (act === 'edit-save')     await _saveEdit(btn.dataset.id);
    });
    const searchEl = overlay.querySelector('#ih-search');
    if (searchEl) {
      let timer;
      searchEl.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => { _state.searchKW = searchEl.value; _render(); }, 180);
      });
    }
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeInventoryHub();
      const qadd = e.target.closest('.hub-qadd');
      if (!qadd) return;
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _submitQuickAdd(); }
      if (e.key === 'Enter' &&  e.shiftKey) { e.preventDefault(); _stackRow(); }
    });
  }

  /* ── CRUD ──────────────────────────────────────────────────── */
  function _collectInput() {
    const o = document.getElementById(OID);
    if (!o) return null;
    const v = {};
    o.querySelectorAll('.hub-qadd [data-field]').forEach(i => { v[i.dataset.field] = i.value.trim(); });
    return v;
  }
  function _resetInput() {
    const o = document.getElementById(OID);
    if (!o) return;
    o.querySelectorAll('.hub-qadd [data-field]').forEach(i => {
      i.value = i.dataset.field === 'threshold' ? '3' : '';
    });
    o.querySelector('.hub-qadd [data-field="name"]')?.focus();
  }
  function _buildBody(v) {
    if (!v.name) throw new Error('품목 이름 필수');
    return {
      name: v.name, unit: '개',
      quantity:  parseInt(v.quantity)  || 0,
      threshold: parseInt(v.threshold) || 3,
      category:  v.category || 'etc',
    };
  }

  async function _submitQuickAdd() {
    const v = _collectInput(); if (!v) return;
    let body;
    try { body = _buildBody(v); } catch (e) {
      if (window.showToast) window.showToast('⚠️ ' + e.message); return;
    }
    try {
      const res = await fetch(`${API()}/inventory`, {
        method: 'POST', headers: { ...AUTH(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const created = await res.json();
      _state.rows.push(created);
      sessionStorage.removeItem(CACHE_KEY); _writeCache(_state.rows);
      _resetInput(); _render();
      if (window.hapticLight) window.hapticLight();
      if (window.showToast) window.showToast('✅ 추가 완료');
    } catch (e) { if (window.showToast) window.showToast('저장 실패: ' + e.message); }
  }

  function _stackRow() {
    const v = _collectInput(); if (!v) return;
    let body;
    try { body = _buildBody(v); } catch (e) {
      if (window.showToast) window.showToast('⚠️ ' + e.message); return;
    }
    _state.pending.push(body);
    if (window.hapticLight) window.hapticLight();
    _resetInput(); _render();
  }

  async function _flushBatch() {
    const items = [..._state.pending]; if (!items.length) return;
    try {
      const results = await Promise.all(items.map(b =>
        fetch(`${API()}/inventory`, {
          method: 'POST', headers: { ...AUTH(), 'Content-Type': 'application/json' },
          body: JSON.stringify(b),
        }).then(r => r.json())
      ));
      _state.rows.push(...results);
      _state.pending = [];
      sessionStorage.removeItem(CACHE_KEY); _writeCache(_state.rows);
      _render();
      if (window.hapticLight) window.hapticLight();
      if (window.showToast) window.showToast(`✅ ${results.length}건 저장`);
    } catch (e) { if (window.showToast) window.showToast('저장 실패: ' + e.message); }
  }

  async function _adjustQuantity(rowId, delta) {
    const row = _state.rows.find(r => String(r.id) === String(rowId));
    if (!row) return;
    const next = Math.max(0, (row.quantity || 0) + delta);
    try {
      const res = await fetch(`${API()}/inventory/${rowId}`, {
        method: 'PATCH', headers: { ...AUTH(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: next }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      row.quantity = next;
      sessionStorage.removeItem(CACHE_KEY); _writeCache(_state.rows);
      _render();
      if (window.hapticLight) window.hapticLight();
    } catch (e) { if (window.showToast) window.showToast('실패: ' + e.message); }
  }

  async function _saveEdit(rowId) {
    const overlay = document.getElementById(OID); if (!overlay) return;
    const row = overlay.querySelector(`[data-id="${rowId}"].editing`); if (!row) return;
    const patch = {};
    row.querySelectorAll('[data-ef]').forEach(i => { patch[i.dataset.ef] = i.value.trim(); });
    if (patch.quantity)  patch.quantity  = parseInt(patch.quantity);
    if (patch.threshold) patch.threshold = parseInt(patch.threshold);
    try {
      const res = await fetch(`${API()}/inventory/${rowId}`, {
        method: 'PATCH', headers: { ...AUTH(), 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const updated = await res.json();
      const idx = _state.rows.findIndex(r => String(r.id) === String(rowId));
      if (idx >= 0) _state.rows[idx] = updated;
      sessionStorage.removeItem(CACHE_KEY); _writeCache(_state.rows);
      _state.editingId = null; _render();
      if (window.showToast) window.showToast('수정 완료');
    } catch (e) { if (window.showToast) window.showToast('수정 실패: ' + e.message); }
  }

  /* ── open / close ──────────────────────────────────────────── */
  function openInventoryHub() {
    if (document.getElementById(OID)) return;
    const bd = document.createElement('div');
    bd.id = OID + '-bd'; bd.className = 'hub-backdrop';
    bd.addEventListener('click', closeInventoryHub);
    document.body.appendChild(bd);
    const overlay = document.createElement('div');
    overlay.id = OID; overlay.className = 'hub-overlay';
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    _state.rows = []; _state.pending = []; _state.searchKW = ''; _state.editingId = null;
    _render();
    _fetch().then(() => _render()).catch(() => {});
  }

  function closeInventoryHub() {
    document.getElementById(OID + '-bd')?.remove();
    const o = document.getElementById(OID);
    if (!o) return;
    o.remove(); document.body.style.overflow = '';
  }

  window.openInventoryHub  = openInventoryHub;
  window.closeInventoryHub = closeInventoryHub;
  window.InventoryHub = {
    refresh: async () => { sessionStorage.removeItem(CACHE_KEY); await _fetch(); _render(); },
  };
})();
