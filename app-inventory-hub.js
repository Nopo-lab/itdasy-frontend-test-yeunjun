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
  function _fmtQty(r) {
    const n = Number(r?.quantity || 0);
    const d = Math.max(0, Math.min(3, Number(r?.decimal_places ?? 1)));
    return n.toLocaleString('ko-KR', { maximumFractionDigits: d });
  }
  function _fmtNum(v, d) {
    const n = Number(v || 0);
    return n.toLocaleString('ko-KR', { maximumFractionDigits: d ?? 2 });
  }

  const _state = { rows: [], pending: [], searchKW: '', editingId: null };

  function _emitInventoryChanged(action, item) {
    try {
      window.dispatchEvent(new CustomEvent('itdasy:data-changed', {
        detail: { kind: 'upsert_inventory', action, inventory_id: item?.id || null, optimistic: false },
      }));
    } catch (e) {
      console.warn('[inventory-hub] 화면 갱신 알림 실패:', e);
    }
  }

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

  /* ── 일일 사용량 추정 → 소진 예상일 (forecast) ───────────────── */
  function _forecastDays(r) {
    const qty = +r.quantity || 0;
    if (qty <= 0) return 0;
    // r.daily_usage 있으면 사용, 없으면 단순 추정 (1일 평균 1개로 가정)
    const usage = (+r.daily_usage > 0) ? +r.daily_usage : 1;
    return Math.max(1, Math.floor(qty / usage));
  }

  /* ── 통계 ─────────────────────────────────────────────────── */
  function _stats() {
    const total = _state.rows.length;
    let low = 0, ok = 0;
    _state.rows.forEach(r => {
      ((+r.quantity || 0) < (+r.threshold || 0)) ? low++ : ok++;
    });
    return { total, low, ok };
  }

  /* ── 렌더 ──────────────────────────────────────────────────── */
  function _render() {
    const overlay = document.getElementById(OID);
    if (!overlay) return;
    const ac = window.AppAutocomplete ? window.AppAutocomplete.renderDatalist() : '';
    const isDesktop = window.matchMedia && window.matchMedia('(min-width: 900px)').matches;
    overlay.classList.toggle('hub-overlay--prototype', !!isDesktop);
    overlay.classList.toggle('hub-overlay--inventory', !!isDesktop);
    if (isDesktop && window.HubPrototypeRender?.inventory) {
      overlay.innerHTML = ac + window.HubPrototypeRender.inventory({
        state: _state,
        partition: _partition,
        stats: _stats,
        forecast: _forecastDays,
        fmtQty: _fmtQty,
        fmtNum: _fmtNum,
      });
      _bindEvents();
      return;
    }
    const { low, ok } = _partition(_state.rows);
    overlay.innerHTML = ac + _renderHeader() +
      _renderOcrCard() + _renderInputBar() + _renderPendingBanner() +
      _renderStats() +
      _renderLowBlock(low) + _renderOkBlock(ok);
    _bindEvents();
  }

  function _renderOcrCard() {
    return `<button class="ocr-card" data-act="ocr">
      <div class="ocr-icon">
        <i class="ph-duotone ph-camera" aria-hidden="true"></i>
      </div>
      <div class="ocr-text">
        <div class="ocr-title">가격표 사진 한 장으로 한 번에</div>
        <div class="ocr-sub">AI가 자동으로 재고 정리</div>
      </div>
      <span class="ocr-chev">
        <i class="ph-duotone ph-caret-right" aria-hidden="true"></i>
      </span>
    </button>`;
  }

  function _renderStats() {
    const s = _stats();
    return `<div class="hub-stats-row">
      <div class="hub-stat-mini"><div class="lbl">전체</div><div class="val">${s.total}개</div></div>
      <div class="hub-stat-mini"><div class="lbl">부족</div><div class="val${s.low ? ' danger' : ''}">${s.low}개</div></div>
      <div class="hub-stat-mini"><div class="lbl">정상</div><div class="val${s.ok ? ' green' : ''}">${s.ok}개</div></div>
    </div>`;
  }

  function _renderHeader() {
    return `<div class="hub-header">
      <button class="hub-back" data-act="close" aria-label="뒤로가기">
        <i class="ph-duotone ph-caret-left" aria-hidden="true"></i>
      </button>
      <span class="hub-title">재고관리</span>
      <div style="flex:1;position:relative;max-width:180px;">
        <i class="ph-duotone ph-magnifying-glass" aria-hidden="true"></i>
        <input id="ih-search" placeholder="재고 검색" value="${_esc(_state.searchKW)}"
          style="width:100%;height:32px;padding:0 8px 0 26px;border:1.5px solid #E5E5EA;border-radius:10px;font-size:12px;box-sizing:border-box;-webkit-appearance:none;"/>
      </div>
    </div>`;
  }

  function _renderInputBar() {
    // [2026-05-12 QA #14] step / decimal_places 품목별 입력 가능하도록 분리.
    //   step="any" → 0.01 (염색약·세럼) ~ 1 (피스 단위) 모두 허용.
    //   자리 수 (decimal_places) 는 표시 자릿수 결정 (0~3).
    return `<div class="hub-qadd">
      <input class="hub-input" data-field="name"      placeholder="품목 이름" list="ac-item_name" style="flex:1.5;"/>
      <input class="hub-input" data-field="quantity"  placeholder="수량" type="number" step="any" style="flex:0.6;min-width:60px;"/>
      <input class="hub-input" data-field="unit" placeholder="단위" value="개" style="flex:0.45;min-width:50px;"/>
      <input class="hub-input" data-field="threshold" placeholder="임계" type="number" step="any" value="3" style="flex:0.6;min-width:60px;"/>
      <input class="hub-input" data-field="decimal_places" placeholder="자리" type="number" min="0" max="3" value="1" title="소수 자릿수 (0~3)" style="flex:0.35;min-width:44px;"/>
      <input class="hub-input" data-field="category"  placeholder="네일|헤어|속눈썹|왁싱|피부|반영구" list="ac-inv_category" style="flex:0.9;"/>
      <button class="hub-btn-stack" data-act="stack">⊕ 쌓기</button>
      <button class="hub-btn-add"  data-act="add">즉시 추가 ↵</button>
    </div>`;
  }

  function _renderPendingBanner() {
    const items = _state.pending;
    if (!items.length) return '';
    return `<div class="hub-pending">
      <div class="hub-pending-hd">
        <span class="hub-pending-lbl">쌓아둔 ${items.length}건</span>
        <div class="hub-pending-btns">
          <button class="hub-btn-clear" data-act="clear-pending">비우기</button>
          <button class="hub-btn-flush" data-act="flush">⚡ ${items.length}개 한 번에 저장</button>
        </div>
      </div>
    </div>`;
  }

  function _renderLowBlock(low) {
    if (!low.length) return '';
    return `
      <div style="display:flex; justify-content:space-between; align-items:baseline; padding:6px 16px; margin-bottom:8px;">
        <span style="font-size:13px; color:var(--accent,var(--brand)); font-weight:700; letter-spacing:-0.2px;">지금 부족해요</span>
        <span style="font-size:12px; color:var(--accent,var(--brand)); font-weight:600; white-space:nowrap;">자동 주문 가능 · ${low.length}건</span>
      </div>
      <div class="inv-list danger">
        ${low.map(r => _renderLowCard(r)).join('')}
      </div>
    `;
  }

  function _renderLowCard(r) {
    if (_state.editingId === r.id) return _renderEditRow(r, true);
    const cat = ({nail:'네일',hair:'헤어',lash:'속눈썹',skin:'피부',hair_extension:'붙임머리',etc:'기타'}[r.category]) || r.category || '—';
    const forecast = _forecastDays(r);
    return `
      <div class="inv-item low" data-id="${r.id}">
        <div class="inv-info">
          <div class="inv-name-row">
            <div class="inv-name">${_esc(r.name)}</div>
            <div class="inv-low-badge">부족</div>
          </div>
          <div class="inv-meta">
            임계 ${_fmtNum(r.threshold, r.decimal_places)}${_esc(r.unit || '')} · ${_esc(cat)}
            ${forecast > 0 ? ` · <span class="inv-forecast">${forecast}일 후 소진 예상</span>` : ''}
          </div>
        </div>
        <div class="stepper">
          <button class="stepper-btn" data-act="step" data-id="${r.id}" data-delta="-1">−</button>
          <div class="stepper-val low">${_fmtQty(r)}${_esc(r.unit || '')}</div>
          <button class="stepper-btn" data-act="step" data-id="${r.id}" data-delta="1">+</button>
        </div>
        <button class="inv-edit" data-act="edit" data-id="${r.id}">
          <i class="ph-duotone ph-pencil-simple" aria-hidden="true"></i>
        </button>
      </div>
    `;
  }

  function _renderOkBlock(ok) {
    if (!ok.length && !_state.rows.length) {
      return `<div class="hub-empty">
        <div class="hub-empty-icon"><i class="ph-duotone ph-package" aria-hidden="true"></i></div>
        <div class="hub-empty-title">재고가 비어있어요</div>
        <div class="hub-empty-desc">품목 이름 적고 Enter 로 추가하세요</div>
      </div>`;
    }
    if (!ok.length) return '';
    return `
      <div style="display:flex; justify-content:space-between; align-items:baseline; padding:6px 16px; margin-bottom:8px;">
        <span style="font-size:13px; color:var(--text-2,#5A6573); font-weight:700; letter-spacing:-0.2px;">정상 재고</span>
        <span style="font-size:12px; color:var(--text-3,#98A1AC); font-weight:600; white-space:nowrap;">${ok.length}개</span>
      </div>
      <div class="inv-list">
        ${ok.map(r => _renderOkRow(r)).join('')}
      </div>
    `;
  }

  function _renderOkRow(r) {
    if (_state.editingId === r.id) return _renderEditRow(r, false);
    const lastIn = r.last_received_at || r.last_received_date;
    const lastTxt = lastIn ? `마지막 입고 ${String(lastIn).slice(5,10).replace('-', '/')}` : '';
    return `
      <div class="inv-item" data-id="${r.id}">
        <div class="inv-info">
          <div class="inv-name-row">
            <div class="inv-name">${_esc(r.name)}</div>
          </div>
          <div class="inv-meta">임계 ${_fmtNum(r.threshold, r.decimal_places)}${_esc(r.unit || '')}${lastTxt ? ` · ${_esc(lastTxt)}` : ''}</div>
        </div>
        <div class="stepper">
          <button class="stepper-btn" data-act="step" data-id="${r.id}" data-delta="-1">−</button>
          <div class="stepper-val">${_fmtQty(r)}${_esc(r.unit || '')}</div>
          <button class="stepper-btn" data-act="step" data-id="${r.id}" data-delta="1">+</button>
        </div>
        <button class="inv-edit" data-act="edit" data-id="${r.id}">
          <i class="ph-duotone ph-pencil-simple" aria-hidden="true"></i>
        </button>
      </div>
    `;
  }

  function _renderEditRow(r, isLow) {
    const cls = isLow ? 'inv-item low editing' : 'inv-item editing';
    return `<div class="${cls}" data-id="${r.id}" style="flex-direction:column;align-items:stretch;gap:8px;">
      <div style="display:grid;grid-template-columns:1fr .7fr .55fr .7fr .6fr 1fr;gap:6px;">
        <input class="rh-edit-input" data-ef="name"      value="${_esc(r.name||'')}" placeholder="품목"/>
        <input class="rh-edit-input" data-ef="quantity"  value="${r.quantity||0}" type="number" step="0.1" placeholder="수량"/>
        <input class="rh-edit-input" data-ef="unit"      value="${_esc(r.unit||'개')}" placeholder="단위"/>
        <input class="rh-edit-input" data-ef="threshold" value="${r.threshold||0}" type="number" step="0.1" placeholder="임계"/>
        <input class="rh-edit-input" data-ef="decimal_places" value="${r.decimal_places ?? 1}" type="number" min="0" max="3" placeholder="자리"/>
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
      else if (act === 'ocr')           _openOcrScan();
      else if (act === 'focus-add')     _focusAddRow();
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

  function _focusAddRow() {
    const input = document.getElementById(OID)?.querySelector('.hub-qadd [data-field="name"]');
    input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(() => input?.focus(), 120);
  }

  function _openOcrScan() {
    if (typeof window.openInventoryOrderScan === 'function') {
      window.openInventoryOrderScan();
    } else if (typeof window.openReceiptScan === 'function') {
      window.openReceiptScan('inventory_order');
    } else if (window.showToast) {
      window.showToast('영수증 스캔 모듈을 불러올 수 없어요');
    }
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
      const f = i.dataset.field;
      if (f === 'threshold') i.value = '3';
      else if (f === 'unit') i.value = '개';
      else if (f === 'decimal_places') i.value = '1';
      else i.value = '';
    });
    o.querySelector('.hub-qadd [data-field="name"]')?.focus();
  }
  function _buildBody(v) {
    if (!v.name) throw new Error('품목 이름부터 입력해주세요');
    // [2026-05-12 QA #14] decimal_places 사용자 직접 지정 (0~3).
    // 미지정 시 quantity 에 소수점 있으면 1, 없으면 0 으로 추정 (이전 동작 유지).
    let dp;
    if (v.decimal_places != null && v.decimal_places !== '') {
      const parsed = parseInt(v.decimal_places, 10);
      dp = (Number.isFinite(parsed) && parsed >= 0 && parsed <= 3) ? parsed : 1;
    } else {
      dp = String(v.quantity || '').includes('.') ? 1 : 0;
    }
    return {
      name: v.name, unit: v.unit || '개',
      quantity:  parseFloat(v.quantity)  || 0,
      threshold: parseFloat(v.threshold) || 3,
      decimal_places: dp,
      category:  v.category || 'etc',
    };
  }

  async function _submitQuickAdd() {
    const v = _collectInput(); if (!v) return;
    let body;
    try { body = _buildBody(v); } catch (e) {
      if (window.showToast) window.showToast('' + e.message);
      // [QA #14] 이름 누락 시 사용자 시각 피드백 — 첫 입력칸 포커스
      try {
        const nameEl = document.getElementById(OID)?.querySelector('.hub-qadd [data-field="name"]');
        if (nameEl) { nameEl.focus(); nameEl.style.borderColor = '#dc2626'; setTimeout(() => { nameEl.style.borderColor = ''; }, 1500); }
      } catch (_e) { void _e; }
      return;
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
      _emitInventoryChanged('create', created);
      if (window.hapticLight) window.hapticLight();
      if (window.showToast) window.showToast('추가 완료');
    } catch (e) { if (window.showToast) window.showToast('저장 실패: ' + e.message); }
  }

  function _stackRow() {
    const v = _collectInput(); if (!v) return;
    let body;
    try { body = _buildBody(v); } catch (e) {
      if (window.showToast) window.showToast('' + e.message); return;
    }
    _state.pending.push(body);
    if (window.hapticLight) window.hapticLight();
    _resetInput(); _render();
  }

  async function _flushBatch() {
    const items = [..._state.pending]; if (!items.length) return;
    // [QA-r5] res.ok 가드 — 4xx/5xx 응답 JSON 이 _state.rows 에 섞여 들어가 저장 토스트가
    // 떠도 실제로는 실패한 fake-success 를 차단.
    try {
      const results = await Promise.all(items.map(b =>
        fetch(`${API()}/inventory`, {
          method: 'POST', headers: { ...AUTH(), 'Content-Type': 'application/json' },
          body: JSON.stringify(b),
        }).then(r => {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
      ));
      _state.rows.push(...results);
      _state.pending = [];
      sessionStorage.removeItem(CACHE_KEY); _writeCache(_state.rows);
      _render();
      _emitInventoryChanged('batch_create', null);
      if (window.hapticLight) window.hapticLight();
      if (window.showToast) window.showToast(`${results.length}건 저장`);
    } catch (e) { if (window.showToast) window.showToast('저장 실패: ' + e.message); }
  }

  async function _adjustQuantity(rowId, delta) {
    const row = _state.rows.find(r => String(r.id) === String(rowId));
    if (!row) return;
    // [QA-r6] 같은 row PATCH in-flight 중 재호출 차단 — 연타 시 다중 API + 진동 폭주 방지.
    if (row._adjusting) return;
    row._adjusting = true;
    const step = row.decimal_places > 0 ? delta / 10 : delta;
    const next = Math.max(0, Number(row.quantity || 0) + step);
    try {
      const res = await fetch(`${API()}/inventory/${rowId}`, {
        method: 'PATCH', headers: { ...AUTH(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: next }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      row.quantity = next;
      sessionStorage.removeItem(CACHE_KEY); _writeCache(_state.rows);
      _render();
      _emitInventoryChanged('quantity', row);
      if (window.hapticLight) window.hapticLight();
    } catch (e) {
      if (window.showToast) window.showToast('실패: ' + e.message);
    } finally {
      row._adjusting = false;
    }
  }

  async function _saveEdit(rowId) {
    const overlay = document.getElementById(OID); if (!overlay) return;
    const row = overlay.querySelector(`[data-id="${rowId}"].editing`); if (!row) return;
    const patch = {};
    row.querySelectorAll('[data-ef]').forEach(i => { patch[i.dataset.ef] = i.value.trim(); });
    if (patch.quantity !== '') patch.quantity = parseFloat(patch.quantity);
    if (patch.threshold !== '') patch.threshold = parseFloat(patch.threshold);
    if (patch.decimal_places !== '') patch.decimal_places = parseInt(patch.decimal_places, 10);
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
      _emitInventoryChanged('update', updated);
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
    // [2026-04-26 A5] popstate 등록
    try {
      if (typeof window._registerSheet === 'function') window._registerSheet('inventory', closeInventoryHub);
      if (typeof window._markSheetOpen === 'function') window._markSheetOpen('inventory');
    } catch (_e) { void _e; }
  }

  function closeInventoryHub() {
    document.getElementById(OID + '-bd')?.remove();
    const o = document.getElementById(OID);
    if (!o) return;
    o.remove(); document.body.style.overflow = '';
    try { if (typeof window._markSheetClosed === 'function') window._markSheetClosed('inventory'); } catch (_e) { void _e; }
  }

  window.openInventoryHub  = openInventoryHub;
  window.closeInventoryHub = closeInventoryHub;
  window.InventoryHub = {
    refresh: async () => { sessionStorage.removeItem(CACHE_KEY); await _fetch(); _render(); },
  };
})();
