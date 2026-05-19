/* 사진 편집기 — 미니맵 (v225 2026-05-19, Sprint 1)
   pixel 모드 동안 우상단 120×120 박스에 원본 thumbnail + 빨간 viewport 박스.
   pePixelZoomChange 이벤트 구독.

   API: 없음 (이벤트 기반 자동)
*/
(function () {
  'use strict';
  if (window.PhotoEditorZoomMinimap) return;

  const SIZE = 120;
  const PADDING = 10;
  const VIEWPORT_COLOR = '#ff3b30';
  let _mapEl = null;
  let _mapCanvas = null;
  let _thumbCache = null;     // 원본 snapshot 의 thumbnail (한 번만 그림)
  let _thumbForCanvas = null; // 어느 snapshot 으로 만든 thumb 인지 (변경 감지)

  function _ensure(parent) {
    if (_mapEl && _mapEl.parentNode === parent) return _mapEl;
    if (_mapEl && _mapEl.parentNode) _mapEl.parentNode.removeChild(_mapEl);
    _mapEl = document.createElement('div');
    _mapEl.id = 'pePixelMinimap';
    _mapEl.style.cssText = `position:absolute;top:${PADDING}px;right:${PADDING}px;width:${SIZE}px;height:${SIZE}px;background:rgba(0,0,0,0.55);border-radius:8px;padding:4px;box-sizing:border-box;z-index:7;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,0.3);`;
    _mapCanvas = document.createElement('canvas');
    _mapCanvas.width = (SIZE - 8) * (window.devicePixelRatio || 1);
    _mapCanvas.height = (SIZE - 8) * (window.devicePixelRatio || 1);
    _mapCanvas.style.cssText = `width:${SIZE - 8}px;height:${SIZE - 8}px;display:block;`;
    _mapEl.appendChild(_mapCanvas);
    parent.appendChild(_mapEl);
    return _mapEl;
  }

  function _remove() {
    if (_mapEl && _mapEl.parentNode) _mapEl.parentNode.removeChild(_mapEl);
    _mapEl = null; _mapCanvas = null;
    _thumbCache = null; _thumbForCanvas = null;
  }

  function _drawThumbIfNeeded(snapshot) {
    if (_thumbForCanvas === snapshot && _thumbCache) return;
    // snapshot → mapCanvas 사이즈로 축소 (한 번)
    const ctx = _mapCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    const cw = _mapCanvas.width, ch = _mapCanvas.height;
    const sw = snapshot.width, sh = snapshot.height;
    // aspect-fit
    const k = Math.min(cw / sw, ch / sh);
    const dw = sw * k, dh = sh * k;
    const dx = (cw - dw) / 2, dy = (ch - dh) / 2;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(snapshot, 0, 0, sw, sh, dx, dy, dw, dh);
    _thumbCache = { dx, dy, dw, dh, sw, sh };
    _thumbForCanvas = snapshot;
  }

  function _drawViewport(detail) {
    if (!_thumbCache) return;
    const ctx = _mapCanvas.getContext('2d');
    // 매 viewport draw 마다 thumb 다시 그리지 않고, 이전 viewport 만 지움 → 단순화 위해 전체 다시
    _drawThumbIfNeeded(detail.snapshot);
    const { scale, tx, ty } = detail;
    const { dx, dy, dw, dh, sw, sh } = _thumbCache;
    // 가시 영역 = sw/scale × sh/scale (snapshot 픽셀 단위)
    // 중심: sw/2 - tx/scale, sh/2 - ty/scale
    const visSx = sw / 2 - tx / scale - sw / (2 * scale);
    const visSy = sh / 2 - ty / scale - sh / (2 * scale);
    const visSw = sw / scale;
    const visSh = sh / scale;
    // 미니맵 좌표로 변환
    const k = dw / sw;
    const rx = dx + visSx * k;
    const ry = dy + visSy * k;
    const rw = visSw * k;
    const rh = visSh * k;
    ctx.strokeStyle = VIEWPORT_COLOR;
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry, rw, rh);
    // 잔영 방지 위해 다음 frame 에 thumb 다시 그리기 강제 (단순)
    _thumbForCanvas = null;
  }

  function _handle(detail) {
    if (!detail.active || !detail.snapshot || !detail.overlay) { _remove(); return; }
    const parent = detail.overlay.parentNode;
    if (!parent) return;
    _ensure(parent);
    _drawThumbIfNeeded(detail.snapshot);
    _drawViewport(detail);
  }

  window.addEventListener('pePixelZoomChange', (e) => _handle(e.detail || {}));

  window.PhotoEditorZoomMinimap = { remove: _remove };
})();
