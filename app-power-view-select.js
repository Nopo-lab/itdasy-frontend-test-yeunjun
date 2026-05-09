/* ─────────────────────────────────────────────────────────────
   파워뷰 — 다중 행 선택 + 일괄 액션 (Phase 1 Tier B · 2026-05-09)

   체크박스 + Shift 범위 + Cmd/Ctrl 누적. 하단 sticky 액션바에서
   일괄 단골토글/삭제/복사/메시지. Promise.allSettled 부분 실패 허용.

   ── 가드레일 ──
   1. 백엔드 신규 0
   2. 비편집 모드에서만 활성 (편집 모드 시 비활성)
   3. 모바일 길게-누름과 충돌하지 않도록 체크박스만 트리거
   4. 실패해도 기존 화면 안 죽게 try/catch
   5. 파일 ≤300줄

   전역:
     window._PVSelect.bindRowCheckboxes(rootEl)
     window._PVSelect.renderActionBar()
     window._PVSelect.clear()
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window._PVSelect) return;

  const BAR_ID = 'pv-select-bar';
  // _state.editMode 가 true 일 때는 비활성 (행별 저장 충돌 방지)
  const _selected = { tab: null, ids: new Set(), lastIdx: -1 };

  function _api() { return window.API || ''; }
  function _auth() { try { return window.authHeader ? window.authHeader() : {}; } catch (_e) { return {}; } }
  function _toast(msg) { try { if (typeof window.showToast === 'function') window.showToast(msg); } catch (_e) { /* silent */ } }
  function _haptic() { try { if (typeof window.hapticLight === 'function') window.hapticLight(); } catch (_e) { /* silent */ } }
  function _emit(kind, detail) {
    try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: Object.assign({ kind }, detail || {}) })); }
    catch (_e) { /* silent */ }
  }

  function _currentTab() { return window._PVState && window._PVState.currentTab || null; }
  function _isEditMode() { return !!(window._PVState && window._PVState.editMode); }

  function _resetIfTabChanged() {
    const tab = _currentTab();
    if (_selected.tab !== tab) {
      _selected.tab = tab;
      _selected.ids.clear();
      _selected.lastIdx = -1;
    }
  }

  function clear() {
    _selected.ids.clear();
    _selected.lastIdx = -1;
    _renderBar();
    _markRows();
  }

  function _markRows() {
    try {
      document.querySelectorAll('#pv-tbody tr[data-id]').forEach((tr) => {
        const id = tr.getAttribute('data-id');
        const on = _selected.ids.has(String(id));
        tr.classList.toggle('pv-row-selected', on);
        const cb = tr.querySelector('[data-pv-select]');
        if (cb) cb.checked = on;
      });
    } catch (_e) { /* silent */ }
  }

  function _renderBar() {
    try {
      const existing = document.getElementById(BAR_ID);
      const count = _selected.ids.size;
      if (count === 0) {
        if (existing) existing.remove();
        return;
      }
      const tab = _currentTab();
      const actions = _barActionsFor(tab);
      const html = `
        <div class="pv-select-bar__count">${count}개 선택</div>
        ${actions.map((a, i) => `
          <button type="button" class="pv-select-bar__btn" data-pv-bulk-idx="${i}" title="${a.title || a.label}">
            ${a.icon ? `<svg width="14" height="14" aria-hidden="true"><use href="#${a.icon}"/></svg>` : ''}
            <span>${a.label}</span>
          </button>
        `).join('')}
        <button type="button" class="pv-select-bar__close" data-pv-bulk-close title="해제">✕</button>
      `;
      if (existing) {
        existing.innerHTML = html;
      } else {
        const bar = document.createElement('div');
        bar.id = BAR_ID;
        bar.className = 'pv-select-bar';
        bar.innerHTML = html;
        document.body.appendChild(bar);
      }
      const bar = document.getElementById(BAR_ID);
      bar.querySelectorAll('[data-pv-bulk-idx]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const idx = Number(btn.getAttribute('data-pv-bulk-idx'));
          const a = actions[idx];
          if (a && typeof a.run === 'function') {
            try { _haptic(); await a.run(); }
            catch (e) { console.warn('[PVSelect] bulk action', e); _toast('일부 작업 실패'); }
          }
        });
      });
      bar.querySelector('[data-pv-bulk-close]').addEventListener('click', clear);
    } catch (e) {
      console.warn('[PVSelect] renderBar', e);
    }
  }

  function _selectedRows() {
    const tab = _currentTab();
    if (!tab) return [];
    const data = (window._PVState && window._PVState.data && window._PVState.data[tab]) || [];
    return data.filter((r) => _selected.ids.has(String(r.id)));
  }

  async function _bulkPatch(path, body) {
    const ids = Array.from(_selected.ids);
    const results = await Promise.allSettled(ids.map((id) =>
      fetch(_api() + path.replace('{id}', id), {
        method: 'PATCH',
        headers: { ..._auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r; })
    ));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const fail = results.length - ok;
    return { ok, fail };
  }

  async function _bulkDelete(path) {
    const ids = Array.from(_selected.ids);
    const results = await Promise.allSettled(ids.map((id) =>
      fetch(_api() + path.replace('{id}', id), {
        method: 'DELETE',
        headers: _auth(),
      }).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r; })
    ));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const fail = results.length - ok;
    return { ok, fail };
  }

  function _refreshAfterBulk() {
    try {
      const tab = _currentTab();
      if (!tab) return;
      try { sessionStorage.removeItem('pv_cache::' + tab); } catch (_e) { /* silent */ }
      if (window._PVInt && typeof window._PVInt.fetchTab === 'function') {
        window._PVInt.fetchTab(tab, false).then((items) => {
          if (window._PVState && window._PVState.data) window._PVState.data[tab] = items || [];
          if (window._PVRender && typeof window._PVRender.renderTab === 'function') window._PVRender.renderTab(true);
        }).catch(() => { /* silent */ });
      }
    } catch (_e) { /* silent */ }
  }

  function _barActionsFor(tab) {
    if (tab === 'customer') return [
      { label: '단골 토글', icon: 'ic-star', run: async () => {
        const rows = _selectedRows();
        const allRegular = rows.every((r) => !!r.is_regular);
        const next = !allRegular;
        const { ok, fail } = await _bulkPatch('/customers/{id}', { is_regular: next });
        _emit('update_customer');
        _toast(`${next ? '단골 등록' : '단골 해제'} ${ok}건${fail ? ` (${fail}건 실패)` : ''}`);
        clear(); _refreshAfterBulk();
      }},
      { label: '삭제', icon: 'ic-trash-2', run: async () => {
        if (!window.confirm(`${_selected.ids.size}명을 삭제할까요? 매출/예약 이력도 영향이 있어요.`)) return;
        const { ok, fail } = await _bulkDelete('/customers/{id}');
        _emit('delete_customer');
        _toast(`삭제 ${ok}건${fail ? ` (${fail}건 실패)` : ''}`);
        clear(); _refreshAfterBulk();
      }},
    ];
    if (tab === 'booking') return [
      { label: '✓ 정상참석', icon: 'ic-check-circle', run: async () => {
        const ids = Array.from(_selected.ids);
        const results = await Promise.allSettled(ids.map((id) =>
          (window.NoShow && typeof window.NoShow.markAttended === 'function')
            ? window.NoShow.markAttended(id)
            : Promise.reject(new Error('NoShow 미로드'))
        ));
        const ok = results.filter((r) => r.status === 'fulfilled').length;
        _emit('update_booking');
        _toast(`정상참석 ${ok}건${ids.length - ok ? ` (${ids.length - ok}건 실패)` : ''}`);
        clear(); _refreshAfterBulk();
      }},
      { label: '🚫 노쇼', icon: 'ic-alert-triangle', run: async () => {
        const ids = Array.from(_selected.ids);
        const results = await Promise.allSettled(ids.map((id) =>
          (window.NoShow && typeof window.NoShow.markNoShow === 'function')
            ? window.NoShow.markNoShow(id)
            : Promise.reject(new Error('NoShow 미로드'))
        ));
        const ok = results.filter((r) => r.status === 'fulfilled').length;
        _emit('update_booking');
        _toast(`노쇼 표시 ${ok}건${ids.length - ok ? ` (${ids.length - ok}건 실패)` : ''}`);
        clear(); _refreshAfterBulk();
      }},
    ];
    return [
      { label: '삭제', icon: 'ic-trash-2', run: async () => {
        if (!window.confirm(`${_selected.ids.size}건 삭제할까요?`)) return;
        const path = '/' + tab.replace(/y$/, 'ies').replace(/([^s])$/, '$1s') + '/{id}';
        // 안전한 매핑 (수동)
        const PATHS = { revenue: '/revenue/{id}', inventory: '/inventory/{id}', nps: '/nps/{id}', service: '/services/{id}' };
        const { ok, fail } = await _bulkDelete(PATHS[tab] || path);
        _emit('delete_' + tab);
        _toast(`삭제 ${ok}건${fail ? ` (${fail}건 실패)` : ''}`);
        clear(); _refreshAfterBulk();
      }},
    ];
  }

  function _toggleId(id, idx, evt) {
    const sId = String(id);
    if (evt && evt.shiftKey && _selected.lastIdx >= 0) {
      // 범위 선택
      try {
        const tab = _currentTab();
        const data = (window._PVState && window._PVState.data && window._PVState.data[tab]) || [];
        // 현재 화면 표시된 행 기준 (필터·정렬 후) — DOM 에서 가져옴
        const rows = Array.from(document.querySelectorAll('#pv-tbody tr[data-id]'));
        const start = Math.min(_selected.lastIdx, idx);
        const end = Math.max(_selected.lastIdx, idx);
        for (let i = start; i <= end; i++) {
          const tr = rows[i];
          if (tr) _selected.ids.add(String(tr.getAttribute('data-id')));
        }
      } catch (_e) { /* silent */ }
    } else {
      if (_selected.ids.has(sId)) _selected.ids.delete(sId);
      else _selected.ids.add(sId);
    }
    _selected.lastIdx = idx;
    _markRows();
    _renderBar();
  }

  function bindRowCheckboxes(root) {
    if (!root) return;
    if (_isEditMode()) return; // 편집 모드에서는 체크박스 비활성
    _resetIfTabChanged();
    try {
      const trs = Array.from(root.querySelectorAll('#pv-tbody tr[data-id]'));
      trs.forEach((tr, idx) => {
        const cb = tr.querySelector('[data-pv-select]');
        if (!cb) return;
        cb.addEventListener('click', (e) => e.stopPropagation());
        cb.addEventListener('change', (e) => {
          const id = tr.getAttribute('data-id');
          _toggleId(id, idx, e);
        });
        if (_selected.ids.has(String(tr.getAttribute('data-id')))) {
          cb.checked = true;
          tr.classList.add('pv-row-selected');
        }
      });
      // 헤더 전체 선택
      const headerCb = document.querySelector('[data-pv-select-all]');
      if (headerCb) {
        headerCb.checked = _selected.ids.size > 0 && _selected.ids.size === trs.length;
        headerCb.addEventListener('change', (e) => {
          if (e.target.checked) {
            trs.forEach((tr) => _selected.ids.add(String(tr.getAttribute('data-id'))));
          } else {
            _selected.ids.clear();
          }
          _markRows();
          _renderBar();
        });
      }
      _renderBar();
    } catch (e) {
      console.warn('[PVSelect] bindRowCheckboxes', e);
    }
  }

  // 닫기/탭 전환 시 선택 초기화
  window.addEventListener('itdasy:data-changed', () => {
    if (_currentTab() !== _selected.tab) clear();
  });

  window._PVSelect = { bindRowCheckboxes, renderActionBar: _renderBar, clear };
})();
