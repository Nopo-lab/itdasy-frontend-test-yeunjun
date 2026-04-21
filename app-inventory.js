/* ─────────────────────────────────────────────────────────────
   소모품 재고 (Phase 3 P3.5) — 네일팁·젤·접착제 등

   엔드포인트 (shared/schemas.json 참조):
   - GET    /inventory                      소모품 목록
   - POST   /inventory                      신규 소모품 등록
   - PATCH  /inventory/{id}                 수량·임계치 수정
   - DELETE /inventory/{id}                 삭제
   - POST   /inventory/{id}/adjust          입고/출고 (delta ±)

   특징:
   - 임계치 하한 도달 시 🔴 배지 + 상단 알림
   - 백엔드 미배포 시 localStorage 오프라인 폴백
   - openInventory() 로 외부 진입
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const OFFLINE_KEY = 'itdasy_inventory_offline_v1';
  let _items = [];
  let _isOffline = false;

  function _uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'i_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }
  function _loadOffline() {
    try { return JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]'); }
    catch (_) { return []; }
  }
  function _saveOffline(list) {
    try { localStorage.setItem(OFFLINE_KEY, JSON.stringify(list)); } catch (_) { /* storage full — ignore */ }
  }

  async function _api(method, path, body) {
    if (!window.API || !window.authHeader) throw new Error('no-auth');
    const auth = window.authHeader();
    if (!auth?.Authorization) throw new Error('no-token');
    const opts = { method, headers: { ...auth, 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(window.API + path, opts);
    if (res.status === 404 || res.status === 501) throw new Error('endpoint-missing');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.status === 204 ? null : await res.json();
  }

  async function list() {
    try {
      const d = await _api('GET', '/inventory');
      _isOffline = false;
      _items = d.items || [];
      return _items;
    } catch (e) {
      if (e.message === 'endpoint-missing' || e.message === 'no-token') {
        _isOffline = true;
        _items = _loadOffline();
        return _items;
      }
      throw e;
    }
  }

  async function create(payload) {
    if (!payload || !payload.name) throw new Error('name-required');
    const data = {
      name: String(payload.name).trim().slice(0, 50),
      unit: payload.unit ? String(payload.unit).slice(0, 10) : '개',
      quantity: Math.max(0, parseInt(payload.quantity, 10) || 0),
      threshold: Math.max(0, parseInt(payload.threshold, 10) || 5),
      category: payload.category || 'etc',
    };
    if (_isOffline) {
      const record = {
        id: _uuid(),
        shop_id: localStorage.getItem('shop_id') || 'offline',
        ...data,
        created_at: new Date().toISOString(),
      };
      const all = _loadOffline();
      all.unshift(record);
      _saveOffline(all);
      _items.unshift(record);
      return record;
    }
    const created = await _api('POST', '/inventory', data);
    _items.unshift(created);
    return created;
  }

  async function adjust(id, delta) {
    const n = parseInt(delta, 10);
    if (!Number.isFinite(n) || n === 0) return null;
    if (_isOffline) {
      const all = _loadOffline();
      const i = all.findIndex(x => x.id === id);
      if (i < 0) throw new Error('not-found');
      all[i].quantity = Math.max(0, (all[i].quantity || 0) + n);
      _saveOffline(all);
      const j = _items.findIndex(x => x.id === id);
      if (j >= 0) _items[j] = all[i];
      return all[i];
    }
    const updated = await _api('POST', '/inventory/' + id + '/adjust', { delta: n });
    const j = _items.findIndex(x => x.id === id);
    if (j >= 0) _items[j] = updated;
    return updated;
  }

  async function remove(id) {
    if (_isOffline) {
      const all = _loadOffline().filter(x => x.id !== id);
      _saveOffline(all);
      _items = _items.filter(x => x.id !== id);
      return { ok: true };
    }
    await _api('DELETE', '/inventory/' + id);
    _items = _items.filter(x => x.id !== id);
    return { ok: true };
  }

  function _lowStockCount() {
    return _items.filter(x => (x.quantity || 0) <= (x.threshold || 0)).length;
  }

  // ── UI ──────────────────────────────────────────────────
  function _ensureSheet() {
    let sheet = document.getElementById('inventorySheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'inventorySheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9998;display:none;flex-direction:column;';
    sheet.classList.add('dt-overlay');
    sheet.innerHTML = `
      <header class="dt-hdr">
        <button class="dt-back" onclick="closeInventory()" aria-label="뒤로"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>
        <h1 class="dt-title">재고</h1>
        <span id="invLowBadge" class="dt-offline-badge" style="background:var(--danger);"></span>
        <span id="invOfflineBadge" class="dt-offline-badge">오프라인</span>
      </header>
      <div class="dt-body">
        <div id="inventoryList"></div>
      </div>
      <footer class="dt-footer">
        <button id="inventoryAddBtn" class="btn-primary" style="flex:1;">+ 소모품 추가</button>
      </footer>
    `;
    document.body.appendChild(sheet);
    sheet.querySelector('#inventoryAddBtn').addEventListener('click', () => _openAddForm());
    return sheet;
  }

  function _rerender() {
    const sheet = document.getElementById('inventorySheet');
    if (!sheet) return;
    const low = _lowStockCount();
    const lowBadge = sheet.querySelector('#invLowBadge');
    if (low > 0) {
      lowBadge.style.display = 'inline-block';
      lowBadge.textContent = '⚠ 부족 ' + low;
    } else {
      lowBadge.style.display = 'none';
    }
    sheet.querySelector('#invOfflineBadge').style.display = _isOffline ? 'inline-block' : 'none';

    const listEl = sheet.querySelector('#inventoryList');
    if (!_items.length) {
      listEl.innerHTML = '<div class="dt-empty">아직 소모품이 없어요. 아래 버튼으로 추가해 주세요.</div>';
      return;
    }
    // 부족한 것 위로 정렬
    const sorted = [..._items].sort((a, b) => {
      const aLow = (a.quantity || 0) <= (a.threshold || 0);
      const bLow = (b.quantity || 0) <= (b.threshold || 0);
      if (aLow !== bLow) return aLow ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    });
    listEl.innerHTML = '<div class="dt-list">' + sorted.map(x => {
      const isLow = (x.quantity || 0) <= (x.threshold || 0);
      return `
        <div class="dt-list-it" data-inv-id="${x.id}" style="${isLow ? 'background:rgba(220,53,69,0.04);' : ''}cursor:default;">
          <div class="dt-list-it__main">
            <p class="dt-list-it__title">${_esc(x.name)}${isLow ? ' <span style="font-size:9px;padding:1px 5px;background:var(--danger);color:#fff;border-radius:3px;font-weight:700;">부족</span>' : ''}</p>
            <p class="dt-list-it__sub">임계 ${x.threshold}${_esc(x.unit||'개')}</p>
          </div>
          <div class="dt-stepper">
            <button class="dt-stepper__btn" data-inv-delta="-1" data-inv-target="${x.id}" type="button">−</button>
            <span class="dt-stepper__val${isLow ? ' dt-stepper__val--low' : ''}">${x.quantity || 0}<span style="font-size:12px;font-weight:400;color:var(--text-subtle);margin-left:4px;">${_esc(x.unit||'개')}</span></span>
            <button class="dt-stepper__btn" data-inv-delta="1" data-inv-target="${x.id}" type="button">+</button>
            <button data-inv-edit="${x.id}" class="btn-secondary" style="padding:8px 10px;" type="button">⚙</button>
          </div>
        </div>
      `;
    }).join('') + '</div>';
    listEl.querySelectorAll('[data-inv-delta]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const d = parseInt(btn.dataset.invDelta, 10);
        try {
          await adjust(btn.dataset.invTarget, d);
          if (window.hapticLight) window.hapticLight();
          _rerender();
        } catch (e) {
          if (window.showToast) window.showToast('조정 실패');
        }
      });
    });
    listEl.querySelectorAll('[data-inv-edit]').forEach(btn => {
      btn.addEventListener('click', () => _openAddForm(btn.dataset.invEdit));
    });
  }

  function _openAddForm(id) {
    const existing = id ? _items.find(x => x.id === id) : null;
    const sheet = document.getElementById('inventorySheet');
    if (!sheet) return;
    const listEl = sheet.querySelector('#inventoryList');
    listEl.innerHTML = `
      <button onclick="window._inventoryBack()" class="dt-back" style="margin-bottom:12px;" aria-label="뒤로"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>
      <div class="dt-field-row"><label class="dt-field-lbl">이름 *</label><input id="ifName" class="dt-field" value="${_esc(existing?.name||'')}" placeholder="네일팁 / 젤 / 접착제" maxlength="50" /></div>
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <div style="flex:1;"><label class="dt-field-lbl">현재 수량</label><input id="ifQty" type="number" inputmode="numeric" class="dt-field" value="${existing?.quantity ?? 0}" /></div>
        <div style="width:80px;"><label class="dt-field-lbl">단위</label><input id="ifUnit" class="dt-field" value="${_esc(existing?.unit||'개')}" maxlength="10" /></div>
      </div>
      <div class="dt-field-row"><label class="dt-field-lbl">부족 알림 임계치</label><input id="ifThreshold" type="number" inputmode="numeric" class="dt-field" value="${existing?.threshold ?? 5}" /></div>
      <div style="display:flex;gap:8px;margin-top:8px;">
        <button type="button" id="ifSave" class="btn-primary" style="flex:1;">${existing ? '수정' : '추가'}</button>
        ${existing ? '<button type="button" id="ifDelete" class="btn-secondary" style="color:var(--danger);">삭제</button>' : ''}
      </div>
    `;
    listEl.querySelector('#ifSave').addEventListener('click', async () => {
      const payload = {
        name: document.getElementById('ifName').value.trim(),
        quantity: parseInt(document.getElementById('ifQty').value, 10) || 0,
        unit: document.getElementById('ifUnit').value.trim() || '개',
        threshold: parseInt(document.getElementById('ifThreshold').value, 10) || 5,
      };
      if (!payload.name) { if (window.showToast) window.showToast('이름을 입력해 주세요'); return; }
      try {
        if (existing) {
          // PATCH 구현 간소화 — 삭제+재생성 대신 adjust로 수량 맞춤 후 threshold만 교체 (offline 한정)
          if (_isOffline) {
            const all = _loadOffline();
            const idx = all.findIndex(x => x.id === existing.id);
            if (idx >= 0) {
              all[idx] = { ...all[idx], name: payload.name, unit: payload.unit, quantity: payload.quantity, threshold: payload.threshold };
              _saveOffline(all);
              _items = all;
            }
          } else {
            await _api('PATCH', '/inventory/' + existing.id, payload);
            await list();
          }
        } else {
          await create(payload);
        }
        if (window.hapticLight) window.hapticLight();
        if (window.showToast) window.showToast(existing ? '수정 완료' : '추가 완료');
        _rerender();
      } catch (e) {
        console.warn('[inventory] save 실패:', e);
        if (window.showToast) window.showToast('저장 실패');
      }
    });
    if (existing) {
      listEl.querySelector('#ifDelete').addEventListener('click', async () => {
        if (!confirm('이 소모품을 삭제할까요?')) return;
        try {
          await remove(existing.id);
          if (window.hapticLight) window.hapticLight();
          _rerender();
        } catch (e) {
          if (window.showToast) window.showToast('삭제 실패');
        }
      });
    }
  }

  window._inventoryBack = _rerender;

  window.openInventory = async function () {
    const sheet = _ensureSheet();
    sheet.style.display = 'flex';
    sheet.classList.add('dt-shown');
    document.body.style.overflow = 'hidden';
    const listEl = sheet.querySelector('#inventoryList');
    listEl.innerHTML = '<div class="dt-loading">불러오는 중…</div>';
    try {
      await list();
      _rerender();
    } catch (e) {
      listEl.innerHTML = '<div class="dt-error">불러오기 실패</div>';
    }
  };

  window.closeInventory = function () {
    const sheet = document.getElementById('inventorySheet');
    if (sheet) { sheet.style.display = 'none'; sheet.classList.remove('dt-shown'); }
    document.body.style.overflow = '';
  };

  window.Inventory = {
    list, create, adjust, remove,
    get _items() { return _items; },
    get isOffline() { return _isOffline; },
    get lowStockCount() { return _lowStockCount(); },
  };
})();
