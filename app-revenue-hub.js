/* ─────────────────────────────────────────────────────────────
   매출 허브 — 풀스크린 독립 허브 (T-383a)
   진입: window.openRevenueHub()
   의존: app-autocomplete.js, app-import-wizard.js (옵션)
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const OID       = 'revenue-hub-overlay';
  const CACHE_KEY = 'rh_cache';
  const CACHE_TTL = 90000;
  const API       = () => window.API  || '';
  const AUTH      = () => window.authHeader ? window.authHeader() : {};

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function _krw(n) { return (+n || 0).toLocaleString('ko-KR') + '원'; }

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
    const res = await fetch(`${API()}/revenue?period=month`, { headers: AUTH() });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    _state.rows = Array.isArray(data) ? data : (data.items || []);
    _writeCache(_state.rows);
    if (window.AppAutocomplete) window.AppAutocomplete.rebuild({ revenue: _state.rows });
  }

  /* ── 렌더 ──────────────────────────────────────────────────── */
  function _render() {
    const overlay = document.getElementById(OID);
    if (!overlay) return;
    const ac = window.AppAutocomplete ? window.AppAutocomplete.renderDatalist() : '';
    overlay.innerHTML = ac + _renderHeader() + '<div id="rh-scroll">' +
      _renderInputBar() + _renderPendingBanner() + _renderReportButton() +
      _renderList() + '</div>';
    _bindEvents();
  }

  function _renderHeader() {
    return `<div class="hub-header">
      <button class="hub-back" data-act="close" aria-label="뒤로가기">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><use href="#ic-chevron-left"/></svg>
      </button>
      <span class="hub-title">매출 기록</span>
      <button class="rh-excel-btn" data-act="excel">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="#ic-download"/></svg>
        엑셀 불러오기
      </button>
    </div>`;
  }

  function _renderInputBar() {
    const ac = `list="ac-customer_name"`;
    const as = `list="ac-service_name"`;
    return `<div class="hub-qadd">
      <input class="hub-input" data-field="customer_name" placeholder="고객" ${ac}/>
      <input class="hub-input" data-field="service_name"  placeholder="시술" ${as}/>
      <input class="hub-input" data-field="amount" placeholder="금액" type="number" style="flex:0.8;min-width:70px;"/>
      <input class="hub-input" data-field="method" placeholder="card" list="ac-method" style="flex:0.8;min-width:70px;" value="card"/>
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
      <div style="font-size:12px;color:#333;display:flex;flex-direction:column;gap:4px;">
        ${items.map((p, i) => `
          <div style="display:flex;gap:8px;padding:5px 8px;background:#fff;border:1px solid #FDE68A;border-radius:8px;align-items:center;">
            <span style="color:#B45309;font-weight:800;min-width:18px;">${i+1}.</span>
            <span style="flex:1;">${_esc(p.customer_name||'')} · ${_krw(p.amount)} · ${_esc(p.method||'')}</span>
            <button data-act="del-pending" data-idx="${i}" style="border:none;background:transparent;color:#C62828;cursor:pointer;font-size:13px;">✕</button>
          </div>`).join('')}
      </div>
    </div>`;
  }

  function _renderReportButton() {
    if (typeof window.openRevenueReport !== 'function') return '';
    return `<button class="rh-report-card" data-act="report">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#ic-bar-chart-3"/></svg>
      <span>상세 리포트</span>
      <svg class="rh-report-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#ic-chevron-right"/></svg>
    </button>`;
  }

  function _renderList() {
    const list = _state.searchKW
      ? _state.rows.filter(r => (r.customer_name + ' ' + r.service_name + ' ' + r.method).toLowerCase().includes(_state.searchKW.toLowerCase()))
      : _state.rows;
    if (!list.length && !_state.searchKW) {
      return `<div class="hub-empty">
        <div class="hub-empty-icon">💰</div>
        <div class="hub-empty-title">매출 기록이 없어요</div>
        <div class="hub-empty-desc">위 입력바로 Enter 하면 바로 추가돼요</div>
      </div>`;
    }
    return `<div class="hub-sec-hd">
        <span>최근 매출</span><span class="hub-sec-count">${list.length}건</span>
      </div>
      <div style="padding:8px 16px 6px;position:relative;">
        <svg style="position:absolute;left:26px;top:50%;transform:translateY(-50%);color:#999;pointer-events:none;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><use href="#ic-search"/></svg>
        <input class="hub-input" id="rh-search" placeholder="검색" value="${_esc(_state.searchKW)}" style="padding-left:30px;"/>
      </div>
      ${list.map(r => _renderRow(r)).join('')}`;
  }

  function _renderRow(r) {
    if (_state.editingId === r.id) return _renderEditRow(r);
    return `<div class="rh-row" data-id="${r.id}">
      <span style="font-size:13px;">${_esc(r.customer_name||'—')}</span>
      <span style="font-size:13px;color:#666;">${_esc(r.service_name||'—')}</span>
      <span class="rh-amount">${_krw(r.amount)}</span>
      <span class="rh-method">${_esc(r.method||'—')}</span>
      <button class="rh-edit-btn" data-act="edit" data-id="${r.id}">✎</button>
    </div>`;
  }

  function _renderEditRow(r) {
    return `<div class="rh-row editing" data-id="${r.id}" style="flex-direction:column;align-items:stretch;gap:6px;">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;">
        <input class="rh-edit-input" data-ef="customer_name" value="${_esc(r.customer_name||'')}" placeholder="고객"/>
        <input class="rh-edit-input" data-ef="service_name"  value="${_esc(r.service_name||'')}"  placeholder="시술"/>
        <input class="rh-edit-input" data-ef="amount" type="number" value="${r.amount||''}" placeholder="금액"/>
        <input class="rh-edit-input" data-ef="method" value="${_esc(r.method||'card')}" placeholder="card"/>
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
      if (act === 'close')          closeRevenueHub();
      else if (act === 'add')       await _submitQuickAdd();
      else if (act === 'stack')     _stackRow();
      else if (act === 'flush')     await _flushBatch();
      else if (act === 'clear-pending') { _state.pending = []; _render(); }
      else if (act === 'del-pending') {
        _state.pending.splice(+btn.dataset.idx, 1); _render();
      }
      else if (act === 'report')    window.openRevenueReport?.('month');
      else if (act === 'excel')     _openExcelImport();
      else if (act === 'edit')      { _state.editingId = btn.dataset.id; _render(); }
      else if (act === 'edit-cancel') { _state.editingId = null; _render(); }
      else if (act === 'edit-save') await _saveEdit(btn.dataset.id);
    });

    const searchEl = overlay.querySelector('#rh-search');
    if (searchEl) {
      let timer;
      searchEl.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => { _state.searchKW = searchEl.value; _render(); }, 180);
      });
    }

    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeRevenueHub();
      const qadd = e.target.closest('.hub-qadd');
      if (!qadd) return;
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _submitQuickAdd(); }
      if (e.key === 'Enter' &&  e.shiftKey) { e.preventDefault(); _stackRow(); }
    });
  }

  /* ── CRUD ──────────────────────────────────────────────────── */
  function _collectInput() {
    const overlay = document.getElementById(OID);
    if (!overlay) return null;
    const v = {};
    overlay.querySelectorAll('.hub-qadd [data-field]').forEach(i => { v[i.dataset.field] = i.value.trim(); });
    return v;
  }
  function _resetInput() {
    const overlay = document.getElementById(OID);
    if (!overlay) return;
    overlay.querySelectorAll('.hub-qadd [data-field]').forEach(i => {
      i.value = i.dataset.field === 'method' ? 'card' : '';
    });
    overlay.querySelector('.hub-qadd [data-field="customer_name"]')?.focus();
  }
  function _buildBody(v) {
    if (!v.amount || isNaN(+v.amount)) throw new Error('금액 필수');
    return {
      customer_name: v.customer_name || null,
      service_name:  v.service_name  || null,
      amount:        parseInt(v.amount),
      method:        v.method || 'card',
    };
  }

  async function _submitQuickAdd() {
    const v = _collectInput();
    if (!v) return;
    let body;
    try { body = _buildBody(v); } catch (e) {
      if (window.showToast) window.showToast('⚠️ ' + e.message); return;
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
      if (window.showToast) window.showToast('✅ 매출 추가 완료');
    } catch (e) {
      if (window.showToast) window.showToast('저장 실패: ' + e.message);
    }
  }

  function _stackRow() {
    const v = _collectInput();
    if (!v) return;
    let body;
    try { body = _buildBody(v); } catch (e) {
      if (window.showToast) window.showToast('⚠️ ' + e.message); return;
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
      if (window.showToast) window.showToast(`✅ ${results.length}건 저장 완료`);
    } catch (e) {
      if (window.showToast) window.showToast('저장 실패: ' + e.message);
    }
  }

  async function _saveEdit(rowId) {
    const overlay = document.getElementById(OID);
    if (!overlay) return;
    const row = overlay.querySelector(`.rh-row[data-id="${rowId}"]`);
    if (!row) return;
    const patch = {};
    row.querySelectorAll('[data-ef]').forEach(i => { patch[i.dataset.ef] = i.value.trim(); });
    if (patch.amount) patch.amount = parseInt(patch.amount);
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
    } catch (e) {
      if (window.showToast) window.showToast('수정 실패: ' + e.message);
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
    const bd = document.createElement('div');
    bd.id = OID + '-bd'; bd.className = 'hub-backdrop';
    bd.addEventListener('click', closeRevenueHub);
    document.body.appendChild(bd);
    const overlay = document.createElement('div');
    overlay.id = OID; overlay.className = 'hub-overlay';
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    _state.rows = []; _state.pending = []; _state.searchKW = ''; _state.editingId = null;
    _render();
    _fetch().then(() => _render()).catch(() => {});
  }

  function closeRevenueHub() {
    document.getElementById(OID + '-bd')?.remove();
    const o = document.getElementById(OID);
    if (!o) return;
    o.remove(); document.body.style.overflow = '';
  }

  window.openRevenueHub   = openRevenueHub;
  window.closeRevenueHub  = closeRevenueHub;
  window.openRevenueInput = openRevenueHub;
  window.RevenueHub = {
    refresh:     async () => { sessionStorage.removeItem(CACHE_KEY); await _fetch(); _render(); },
    focusInput:  () => document.querySelector(`#${OID} [data-field="customer_name"]`)?.focus(),
  };
})();
