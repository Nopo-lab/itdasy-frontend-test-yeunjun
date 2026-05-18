/* 사진 편집기 — 드래그&드롭 텍스트 (PE-4, 2026-05-19 v217)
   초고도화 Phase 1 #4 킬러 피처 — Canva 수준 직접 조작.

   기능:
     • 캔버스 위 텍스트 레이어를 손가락/마우스로 직접 이동
     • 핀치 줌으로 폰트 사이즈 조절
     • 두 손가락 회전으로 텍스트 회전
     • 더블탭으로 텍스트 편집 inline
     • Hit testing: 텍스트 bbox 계산 → 가장 가까운 레이어 활성화

   기존 슬라이더 방식과 공존 (슬라이더로도 조작 가능).
   `app-photo-editor-layers.js` 의 PhotoEditorLayers API 활용.
*/
(function () {
  'use strict';
  if (window.PhotoEditorTextDnD) return;

  let _bound = false;
  let _dragState = null;
  let _pinchState = null;

  function _bind(canvas, state, helpers) {
    if (!canvas || _bound) return;
    _bound = true;

    let lastTap = 0;

    canvas.addEventListener('pointerdown', (e) => {
      const layer = _hitTest(canvas, state, e);
      if (!layer) return;
      // 더블탭 감지
      const now = Date.now();
      if (now - lastTap < 350) {
        _editInline(layer, helpers);
        lastTap = 0;
        return;
      }
      lastTap = now;
      _selectLayer(state, helpers, layer);
      _dragState = {
        layerId: layer.id,
        startX: e.clientX,
        startY: e.clientY,
        startLayerX: layer.x,
        startLayerY: layer.y,
        canvasRect: canvas.getBoundingClientRect(),
        pointerId: e.pointerId,
      };
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!_dragState || e.pointerId !== _dragState.pointerId) return;
      const dx = (e.clientX - _dragState.startX) / _dragState.canvasRect.width;
      const dy = (e.clientY - _dragState.startY) / _dragState.canvasRect.height;
      const layer = state.layers.find(l => l.id === _dragState.layerId);
      if (!layer) return;
      layer.x = Math.max(0, Math.min(1, _dragState.startLayerX + dx));
      layer.y = Math.max(0, Math.min(1, _dragState.startLayerY + dy));
      if (helpers && helpers.redraw) helpers.redraw();
    });

    canvas.addEventListener('pointerup', (e) => {
      if (_dragState && e.pointerId === _dragState.pointerId) {
        if (helpers && helpers.pushHistory) helpers.pushHistory();
        _dragState = null;
      }
    });

    canvas.addEventListener('pointercancel', () => { _dragState = null; });

    // 두 손가락 핀치/회전 (touchevents)
    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 2) return;
      const layer = _activeLayer(state);
      if (!layer) return;
      e.preventDefault();
      const t1 = e.touches[0], t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const angle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX);
      if (!_pinchState || _pinchState.layerId !== layer.id) {
        _pinchState = {
          layerId: layer.id,
          startDist: dist,
          startAngle: angle,
          startSize: layer.size || 6,
          startRot: layer.rot || 0,
        };
        return;
      }
      const ratio = dist / _pinchState.startDist;
      layer.size = Math.max(2, Math.min(24, _pinchState.startSize * ratio));
      const angleDelta = (angle - _pinchState.startAngle) * 180 / Math.PI;
      layer.rot = _pinchState.startRot + angleDelta;
      if (helpers && helpers.redraw) helpers.redraw();
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      if (e.touches.length < 2 && _pinchState) {
        if (helpers && helpers.pushHistory) helpers.pushHistory();
        _pinchState = null;
      }
    });
  }

  function _activeLayer(state) {
    if (!state || !state.layers || !state.activeLayerId) return null;
    return state.layers.find(l => l.id === state.activeLayerId);
  }

  // PhotoEditor `_drawText` 와 동일한 식으로 정밀 hit test:
  //   font size px = canvas_width * (layer.size / 100)
  //   다중 줄 측정 → 가장 넓은 줄 기준 bbox + 회전 보정
  function _hitTest(canvas, state, e) {
    if (!state || !state.layers) return null;
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const cw = canvas.width, ch = canvas.height;
    const ctx = canvas.getContext('2d');
    for (let i = state.layers.length - 1; i >= 0; i--) {
      const lyr = state.layers[i];
      if (lyr.type !== 'text' || !lyr.value) continue;
      const fs = Math.round(cw * ((lyr.size || 6) / 100));
      const lines = String(lyr.value).split('\n').filter(s => s.length > 0);
      ctx.save();
      ctx.font = `800 ${fs}px sans-serif`;
      let maxW = 0;
      for (const ln of lines) maxW = Math.max(maxW, ctx.measureText(ln).width);
      ctx.restore();
      const lineH = fs * 1.25;
      const totalH = lineH * Math.max(1, lines.length);
      // bbox 캔버스 좌표 (px ratio 단위로 변환)
      const halfW = (maxW + fs * 0.5) / cw / 2;   // 약간의 여백 + 정규화
      const halfH = (totalH + fs * 0.3) / ch / 2;
      // 회전 적용 — 회전된 점을 역회전해서 원래 bbox 와 비교
      const rot = (lyr.rot || 0) * Math.PI / 180;
      const dx = (px - lyr.x);
      const dy = (py - lyr.y);
      const ux = dx * Math.cos(-rot) - dy * Math.sin(-rot);
      const uy = dx * Math.sin(-rot) + dy * Math.cos(-rot);
      if (Math.abs(ux) < halfW && Math.abs(uy) < halfH) return lyr;
    }
    return null;
  }

  function _selectLayer(state, helpers, layer) {
    if (state.activeLayerId === layer.id) return;
    state.activeLayerId = layer.id;
    if (window.PhotoEditorLayers && window.PhotoEditorLayers.ensure) {
      window.PhotoEditorLayers.ensure(state);
    }
    if (helpers && helpers.renderPanel) helpers.renderPanel();
    if (helpers && helpers.redraw) helpers.redraw();
  }

  function _editInline(layer, helpers) {
    const current = layer.value || '';
    const next = window.prompt('텍스트 수정:', current);
    if (next === null) return;
    layer.value = next;
    if (helpers && helpers.renderPanel) helpers.renderPanel();
    if (helpers && helpers.redraw) helpers.redraw();
    if (helpers && helpers.pushHistory) helpers.pushHistory();
  }

  // PhotoEditor 가 열릴 때 캔버스에 바인딩
  function _watch() {
    let attempts = 0;
    const iv = setInterval(() => {
      const PE = window.PhotoEditor;
      const canvas = document.getElementById('peCanvas');
      if (PE && PE._internal && canvas && !_bound) {
        const state = PE._internal.getState();
        const helpers = PE._internal.helpers || {};
        if (state) {
          _bind(canvas, state, helpers);
          clearInterval(iv);
          return;
        }
      }
      if (++attempts > 600) clearInterval(iv);
    }, 500);
  }

  window.PhotoEditorTextDnD = { bind: _bind };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _watch);
  } else _watch();
})();
