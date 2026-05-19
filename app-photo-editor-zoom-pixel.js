/* 사진 편집기 — 픽셀 줌 (8x~32x) 재렌더 모듈 (v225 2026-05-19, Sprint 1)
   zoom.js 에서 scale ≥ 8.0 진입 시 호출됨 (PhotoEditorZoomPixel.enter).

   동작:
     1) enter(wrap, state, z):
        - peCanvas 현재 내용을 offscreen 스냅샷 canvas 로 복사 (한 번만)
        - pePixelCanvas overlay 생성 (peCanvas 위 absolute)
        - peCanvas 숨김 (스냅샷이 대신 표시)
        - z.tx = z.ty = 0 으로 reset (중심 가시), update() 호출
     2) update(z):
        - 현재 z.scale, z.tx, z.ty 기반 가시영역 계산
        - drawImage(snapshot, sx, sy, sw, sh, 0, 0, dw, dh) with imageSmoothingEnabled=false
        - grid/minimap 갱신 trigger
     3) exit():
        - overlay 제거, peCanvas 노출, 스냅샷 ImageData null (메모리 해제)

   메모리 (4032×3024 입력 기준):
     - 스냅샷 offscreen canvas 1벌 = 약 48MB (RGBA)
     - drawImage 는 GPU 가속, putImageData 보다 빠름
     - exit 시 즉시 null 처리 + canvas width=0 으로 GC 유도

   API (window.PhotoEditorZoomPixel):
     - enter(wrap, state, z)
     - update(z)
     - exit()
     - isActive() → boolean
     - getSnapshot() → canvas | null  (grid/minimap 에서 원본 픽셀 폭/높이 참조)
     - getOverlay() → canvas | null
*/
(function () {
  'use strict';
  if (window.PhotoEditorZoomPixel) return;

  let _wrap = null;
  let _state = null;
  let _peCanvas = null;
  let _snapshot = null;       // offscreen canvas (원본 사이즈)
  let _overlay = null;        // 표시용 canvas (display 사이즈)
  let _peCanvasDisplayOld = ''; // 복원용

  function _enter(wrap, state /*, z */) {
    _wrap = wrap;
    _state = state;
    _peCanvas = wrap.querySelector('#peCanvas') || document.getElementById('peCanvas');
    if (!_peCanvas) return;

    // 1) 스냅샷 (원본 픽셀 그대로 복사)
    _snapshot = document.createElement('canvas');
    _snapshot.width = _peCanvas.width;
    _snapshot.height = _peCanvas.height;
    _snapshot.getContext('2d').drawImage(_peCanvas, 0, 0);

    // 2) overlay 생성 (display 사이즈 = peCanvas 의 CSS 크기)
    const rect = _peCanvas.getBoundingClientRect();
    _overlay = document.createElement('canvas');
    _overlay.id = 'pePixelOverlay';
    _overlay.width = Math.round(rect.width * (window.devicePixelRatio || 1));
    _overlay.height = Math.round(rect.height * (window.devicePixelRatio || 1));
    _overlay.style.cssText = `position:absolute;left:${_peCanvas.offsetLeft}px;top:${_peCanvas.offsetTop}px;width:${rect.width}px;height:${rect.height}px;pointer-events:none;z-index:5;`;
    _peCanvas.parentNode.appendChild(_overlay);

    // 3) peCanvas 숨김
    _peCanvasDisplayOld = _peCanvas.style.display || '';
    _peCanvas.style.visibility = 'hidden';

    // 4) z.tx/ty reset (중심 가시) + 첫 렌더
    if (state && state.zoom) { state.zoom.tx = 0; state.zoom.ty = 0; }
    _update(state && state.zoom);

    // 5) grid/minimap 활성화 trigger
    _notifyOverlays();
  }

  function _update(z) {
    if (!_overlay || !_snapshot || !z) return;
    const ctx = _overlay.getContext('2d');
    const dw = _overlay.width;   // device pixel
    const dh = _overlay.height;
    const sw = _snapshot.width;
    const sh = _snapshot.height;
    ctx.clearRect(0, 0, dw, dh);
    ctx.imageSmoothingEnabled = false;  // nearest-neighbor

    // 가시 영역 계산 (snapshot 좌표계)
    // z.scale = 8~32. z.tx/ty 는 display CSS 픽셀 단위 (overlay CSS 크기 기준).
    // overlay CSS width = rect.width = dw / dpr 라고 가정.
    const dpr = window.devicePixelRatio || 1;
    const cssW = dw / dpr;
    const cssH = dh / dpr;

    // 표시될 snapshot 영역의 크기 (snapshot 좌표) — scale 이 클수록 작은 영역만 보임
    // snapshot 의 1 픽셀 = display 의 (z.scale * snapshot/displayRatio) 픽셀.
    // 가정: snapshot 의 한 변 = peCanvas 의 디스플레이 크기와 같다 (peCanvas 는 보통 1080 픽셀, display 도 비슷).
    // 즉 snapshot 1px ≈ display 1px (scale=1). scale=8 이면 snapshot 1px = display 8px.
    // 따라서 가시 snapshot 영역 = cssW / z.scale × cssH / z.scale
    const visW = cssW / z.scale;
    const visH = cssH / z.scale;

    // 중심: cssW/2, cssH/2 의 디스플레이 픽셀이 snapshot 의 어디?
    // z.tx, z.ty 는 디스플레이 중심에서 이동량. 음수 tx = 오른쪽으로 본다.
    const centerSx = sw / 2 - (z.tx / z.scale);
    const centerSy = sh / 2 - (z.ty / z.scale);
    const sx = centerSx - visW / 2;
    const sy = centerSy - visH / 2;

    // 클램프 (스냅샷 밖으로 못 나가게)
    const sxC = Math.max(0, Math.min(sw - visW, sx));
    const syC = Math.max(0, Math.min(sh - visH, sy));
    // 클램프되면 z.tx/ty 보정 (사용자 피드백 — 못 더 멀리 안 감)
    if (sxC !== sx) z.tx = (sw / 2 - (sxC + visW / 2)) * z.scale;
    if (syC !== sy) z.ty = (sh / 2 - (syC + visH / 2)) * z.scale;

    ctx.drawImage(_snapshot, sxC, syC, visW, visH, 0, 0, dw, dh);

    _notifyOverlays();
  }

  function _exit() {
    if (_overlay && _overlay.parentNode) {
      _overlay.width = 0; _overlay.height = 0; // GC 유도
      _overlay.parentNode.removeChild(_overlay);
    }
    if (_snapshot) {
      _snapshot.width = 0; _snapshot.height = 0;
    }
    if (_peCanvas) {
      _peCanvas.style.visibility = '';
      _peCanvas.style.display = _peCanvasDisplayOld;
    }
    _overlay = null; _snapshot = null; _peCanvas = null;
    _wrap = null; _state = null;
    _notifyOverlays();
  }

  function _isActive() { return !!_overlay; }

  function _getSnapshot() { return _snapshot; }
  function _getOverlay()  { return _overlay; }

  // grid / minimap 모듈이 이 이벤트로 갱신
  function _notifyOverlays() {
    try { window.dispatchEvent(new CustomEvent('pePixelZoomChange', { detail: {
      active: _isActive(),
      scale: _state && _state.zoom ? _state.zoom.scale : 1,
      tx: _state && _state.zoom ? _state.zoom.tx : 0,
      ty: _state && _state.zoom ? _state.zoom.ty : 0,
      snapshot: _snapshot,
      overlay: _overlay,
    } })); } catch (_e) { /* ignore */ }
  }

  window.PhotoEditorZoomPixel = {
    enter: _enter,
    update: _update,
    exit: _exit,
    isActive: _isActive,
    getSnapshot: _getSnapshot,
    getOverlay: _getOverlay,
  };
})();
