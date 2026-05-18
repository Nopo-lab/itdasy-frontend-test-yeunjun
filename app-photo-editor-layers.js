/* 사진 편집기 — 텍스트 레이어 관리 모듈 (2026-05-19 v206.6 분할)
   책임:
     • 옛 단일 텍스트 상태를 여러 레이어 상태로 바꾸기
     • 텍스트 레이어 추가/삭제/선택/순서 변경
*/
(function () {
  'use strict';

  function _ensure(state) {
    if (!state) return;
    if (!Array.isArray(state.layers)) state.layers = [];
    if (state.layers.length === 0) _createInitialLayer(state);
    if (!state.activeLayerId || !state.layers.find(l => l.id === state.activeLayerId)) {
      state.activeLayerId = state.layers[0].id;
    }
    const active = state.layers.find(l => l.id === state.activeLayerId);
    if (active) state.text = active;
  }

  function _syncText(state) {
    if (!state || !Array.isArray(state.layers) || !state.activeLayerId) return;
    const idx = state.layers.findIndex(l => l.id === state.activeLayerId);
    if (idx >= 0) {
      state.layers[idx] = Object.assign({}, state.layers[idx], state.text, {
        id: state.activeLayerId,
        type: 'text',
      });
    }
  }

  function _add(state, helpers) {
    _ensure(state);
    const id = 'lyr-' + Date.now();
    state.layers.push({
      id, type: 'text',
      value: '', x: 0.5, y: 0.5 + (state.layers.length * 0.08), color: '#ffffff',
      font: 'sans', size: 6, bg: false, stroke: false, rot: 0,
    });
    state.activeLayerId = id;
    state.text = state.layers[state.layers.length - 1];
    _commit(helpers);
    _toast(helpers, '새 텍스트 레이어 추가 (총 ' + state.layers.length + '개)');
  }

  function _remove(state, helpers) {
    if (!state || !state.layers || state.layers.length <= 1) return _toast(helpers, '최소 1개는 남겨야 해요');
    const idx = state.layers.findIndex(l => l.id === state.activeLayerId);
    if (idx < 0) return;
    state.layers.splice(idx, 1);
    state.activeLayerId = state.layers[Math.min(idx, state.layers.length - 1)].id;
    _ensure(state);
    _commit(helpers);
    _toast(helpers, '레이어 삭제 (남은 ' + state.layers.length + '개)');
  }

  function _select(state, helpers, id) {
    if (!state) return;
    state.activeLayerId = id;
    _ensure(state);
    if (helpers && helpers.renderPanel) helpers.renderPanel();
    if (helpers && helpers.redraw) helpers.redraw();
  }

  function _moveUp(state, helpers) {
    if (!state || !state.layers || state.layers.length <= 1) return;
    const idx = state.layers.findIndex(l => l.id === state.activeLayerId);
    if (idx <= 0) return _toast(helpers, '이미 맨 위');
    [state.layers[idx - 1], state.layers[idx]] = [state.layers[idx], state.layers[idx - 1]];
    _commit(helpers);
  }

  function _createInitialLayer(state) {
    const id = 'lyr-' + Date.now();
    state.layers.push(Object.assign({ id, type: 'text' }, state.text || {}));
    state.activeLayerId = id;
  }

  function _commit(helpers) {
    if (helpers && helpers.renderPanel) helpers.renderPanel();
    if (helpers && helpers.redraw) helpers.redraw();
    if (helpers && helpers.pushHistory) helpers.pushHistory();
  }

  function _toast(helpers, message) {
    if (helpers && typeof helpers.toast === 'function') helpers.toast(message);
  }

  window.PhotoEditorLayers = {
    ensure: _ensure,
    syncText: _syncText,
    add: _add,
    remove: _remove,
    select: _select,
    moveUp: _moveUp,
  };
})();
