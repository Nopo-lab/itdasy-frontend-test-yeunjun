/* 사진 편집기 — 픽셀 그리드 오버레이 (v225 2026-05-19, Sprint 1)
   pixel 모드 + scale ≥ 16 시 1px 경계 그리드 표시 (Photoshop 스타일).
   pePixelZoomChange 이벤트 구독하여 자동 갱신.

   API: 없음 (이벤트 기반 자동 동작)
*/
(function () {
  'use strict';
  if (window.PhotoEditorZoomGrid) return;

  const GRID_MIN_SCALE = 16;
  const GRID_COLOR = 'rgba(0,0,0,0.32)';
  let _gridCanvas = null;

  function _ensureCanvas(overlay) {
    if (!overlay || !overlay.parentNode) return null;
    if (_gridCanvas && _gridCanvas.parentNode === overlay.parentNode) return _gridCanvas;
    _gridCanvas = document.createElement('canvas');
    _gridCanvas.id = 'pePixelGrid';
    _gridCanvas.width = overlay.width;
    _gridCanvas.height = overlay.height;
    _gridCanvas.style.cssText = overlay.style.cssText.replace(/z-index:\s*\d+/, 'z-index:6');
    overlay.parentNode.appendChild(_gridCanvas);
    return _gridCanvas;
  }

  function _remove() {
    if (_gridCanvas && _gridCanvas.parentNode) {
      _gridCanvas.width = 0; _gridCanvas.height = 0;
      _gridCanvas.parentNode.removeChild(_gridCanvas);
    }
    _gridCanvas = null;
  }

  function _draw(detail) {
    const { active, scale, overlay } = detail;
    if (!active || scale < GRID_MIN_SCALE || !overlay) { _remove(); return; }
    const cv = _ensureCanvas(overlay);
    if (!cv) return;
    // overlay 크기 변경에 동기화
    if (cv.width !== overlay.width || cv.height !== overlay.height) {
      cv.width = overlay.width;
      cv.height = overlay.height;
      cv.style.width = overlay.style.width;
      cv.style.height = overlay.style.height;
      cv.style.left = overlay.style.left;
      cv.style.top = overlay.style.top;
    }
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    // 1 snapshot 픽셀 = scale × dpr 디바이스 픽셀
    const dpr = window.devicePixelRatio || 1;
    const stride = scale * dpr;
    // 너무 좁으면 그리지 않음 (성능)
    if (stride < 6) { _remove(); return; }
    ctx.beginPath();
    for (let x = 0.5; x < cv.width; x += stride) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, cv.height);
    }
    for (let y = 0.5; y < cv.height; y += stride) {
      ctx.moveTo(0, y);
      ctx.lineTo(cv.width, y);
    }
    ctx.stroke();
  }

  window.addEventListener('pePixelZoomChange', (e) => _draw(e.detail || {}));

  window.PhotoEditorZoomGrid = {
    redraw: () => {
      const Pixel = window.PhotoEditorZoomPixel;
      if (!Pixel || !Pixel.isActive()) { _remove(); return; }
      _draw({
        active: true,
        scale: (window.PhotoEditor && window.PhotoEditor._internal && window.PhotoEditor._internal.getState() || {}).zoom?.scale || 1,
        overlay: Pixel.getOverlay(),
      });
    },
  };
})();
