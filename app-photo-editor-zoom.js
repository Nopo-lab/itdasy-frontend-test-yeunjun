/* 사진 편집기 — 핀치 줌·패닝 디스패처 (v225 2026-05-19, Sprint 1)
   1.0 ~ 7.99x = CSS transform 모드 (기존 v203 동작 그대로)
   8.0 ~ 32.0x = pixel 모드 (app-photo-editor-zoom-pixel.js 위임, nearest 재렌더 + grid + minimap)

   진입/복귀 hysteresis:
     - 진입: 7.5 → 8.0 넘어가는 순간 transform 해제 + pixel.enter()
     - 복귀: 7.0 이하로 떨어지는 순간 pixel.exit() + transform 재개

   pixel 모드 진입 시 wrap.transform 은 scale 1.0 + tx/ty 0 으로 reset.
   pan/zoom 처리는 모두 PhotoEditorZoomPixel 이 책임.

   API (변경 없음):
     • window.PhotoEditor._zoomAttach(wrap, state)
     • window.PhotoEditor._zoomCleanup()
*/
(function () {
  'use strict';

  const MIN = 1.0, MAX = 32.0;               // v225: 4 → 32
  const PIXEL_ENTER = 8.0, PIXEL_EXIT = 7.0; // hysteresis

  function _ensureZoomState(state) {
    if (!state.zoom) state.zoom = { scale: 1, tx: 0, ty: 0, mode: 'transform' };
    if (!state.zoom.mode) state.zoom.mode = 'transform';
    return state.zoom;
  }

  function _applyTransform(wrap, z) {
    if (z.mode === 'pixel') return; // pixel 모드 중엔 transform 건드리지 않음
    wrap.style.transformOrigin = '50% 50%';
    wrap.style.transform = `translate(${z.tx}px, ${z.ty}px) scale(${z.scale})`;
  }

  function _resetTransform(wrap, z) {
    z.scale = 1; z.tx = 0; z.ty = 0;
    wrap.style.transform = 'translate(0px, 0px) scale(1)';
  }

  function _enterPixelMode(wrap, state, z) {
    if (z.mode === 'pixel') return;
    z.mode = 'pixel';
    // wrap transform 초기화 — pixel 모듈이 자체 캔버스에 렌더하므로 wrap 변형 불필요
    wrap.style.transform = 'translate(0px, 0px) scale(1)';
    const Pixel = window.PhotoEditorZoomPixel;
    if (Pixel && typeof Pixel.enter === 'function') {
      try { Pixel.enter(wrap, state, z); } catch (_e) { /* 폴백: 그냥 transform 으로 클램프 */ z.scale = PIXEL_EXIT; z.mode = 'transform'; _applyTransform(wrap, z); }
    } else {
      // pixel 모듈 로드 전이면 transform 모드로 클램프
      z.scale = PIXEL_EXIT; z.mode = 'transform';
      _applyTransform(wrap, z);
    }
  }

  function _exitPixelMode(wrap, state, z) {
    if (z.mode !== 'pixel') return;
    const Pixel = window.PhotoEditorZoomPixel;
    if (Pixel && typeof Pixel.exit === 'function') {
      try { Pixel.exit(); } catch (_e) { /* ignore */ }
    }
    z.mode = 'transform';
    _applyTransform(wrap, z);
  }

  function _applyScale(wrap, state, z, newScale) {
    const clamped = Math.max(MIN, Math.min(MAX, newScale));
    z.scale = clamped;
    // mode 전환 hysteresis
    if (z.mode === 'transform' && clamped >= PIXEL_ENTER) {
      _enterPixelMode(wrap, state, z);
    } else if (z.mode === 'pixel' && clamped <= PIXEL_EXIT) {
      _exitPixelMode(wrap, state, z);
    } else if (z.mode === 'pixel') {
      const Pixel = window.PhotoEditorZoomPixel;
      if (Pixel && typeof Pixel.update === 'function') Pixel.update(z);
    } else {
      _applyTransform(wrap, z);
    }
  }

  function _applyPan(wrap, state, z, newTx, newTy) {
    z.tx = newTx; z.ty = newTy;
    if (z.mode === 'pixel') {
      const Pixel = window.PhotoEditorZoomPixel;
      if (Pixel && typeof Pixel.update === 'function') Pixel.update(z);
    } else {
      _applyTransform(wrap, z);
    }
  }

  function _reset(wrap, state, z) {
    _exitPixelMode(wrap, state, z);
    _resetTransform(wrap, z);
  }

  function _dist(t1, t2) { return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY); }
  function _mid(t1, t2)  { return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 }; }

  function _attach(wrap, state) {
    if (!wrap || wrap._zoomBound) return;
    wrap._zoomBound = true;
    const z = _ensureZoomState(state);
    _applyTransform(wrap, z);

    let startDist = 0, startScale = 1, startMid = null;
    let startTx = 0, startTy = 0;
    let panStart = null;
    let lastTap = 0;

    function _onTouchStart(e) {
      if (e.touches.length === 2) {
        e.preventDefault();
        startDist = _dist(e.touches[0], e.touches[1]);
        startScale = z.scale;
        startMid = _mid(e.touches[0], e.touches[1]);
        startTx = z.tx; startTy = z.ty;
        panStart = null;
      } else if (e.touches.length === 1) {
        const isBrushTab = state && state.activeTab === 'brush';
        if (!isBrushTab && z.scale > 1.05) {
          panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          startTx = z.tx; startTy = z.ty;
        }
      }
    }
    function _onTouchMove(e) {
      if (e.touches.length === 2) {
        e.preventDefault();
        const d = _dist(e.touches[0], e.touches[1]);
        const m = _mid(e.touches[0], e.touches[1]);
        const ratio = d / Math.max(1, startDist);
        const nextScale = startScale * ratio;
        let nextTx = z.tx, nextTy = z.ty;
        if (startMid) {
          nextTx = startTx + (m.x - startMid.x);
          nextTy = startTy + (m.y - startMid.y);
        }
        z.tx = nextTx; z.ty = nextTy;
        _applyScale(wrap, state, z, nextScale);
      } else if (e.touches.length === 1 && panStart) {
        e.preventDefault();
        const nextTx = startTx + (e.touches[0].clientX - panStart.x);
        const nextTy = startTy + (e.touches[0].clientY - panStart.y);
        _applyPan(wrap, state, z, nextTx, nextTy);
      }
    }
    function _onTouchEnd(e) {
      if (e.touches.length === 0) {
        panStart = null;
        if (z.scale < 1.05) _reset(wrap, state, z);
        const now = Date.now();
        if (now - lastTap < 300 && z.scale > 1.05) {
          _reset(wrap, state, z);
          lastTap = 0;
        } else {
          lastTap = now;
        }
      }
    }

    wrap.addEventListener('touchstart', _onTouchStart, { passive: false });
    wrap.addEventListener('touchmove',  _onTouchMove,  { passive: false });
    wrap.addEventListener('touchend',   _onTouchEnd);
    wrap.addEventListener('touchcancel', _onTouchEnd);

    function _onWheel(e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      // 정밀: scale 에 비례한 스텝 (작은 줌에선 작게, 큰 줌에선 크게)
      const stepK = z.scale < 4 ? 0.1 : (z.scale < 12 ? 0.4 : 1.2);
      const delta = e.deltaY > 0 ? -stepK : stepK;
      const next = z.scale + delta;
      if (next < 1.05) _reset(wrap, state, z);
      else _applyScale(wrap, state, z, next);
    }
    wrap.addEventListener('wheel', _onWheel, { passive: false });

    wrap._zoomCleanup = function () {
      wrap.removeEventListener('touchstart', _onTouchStart);
      wrap.removeEventListener('touchmove',  _onTouchMove);
      wrap.removeEventListener('touchend',   _onTouchEnd);
      wrap.removeEventListener('touchcancel', _onTouchEnd);
      wrap.removeEventListener('wheel', _onWheel);
      wrap._zoomBound = false;
      _reset(wrap, state, z);
      wrap.style.transform = '';
    };
  }

  function _cleanup() {
    const wrap = document.querySelector('.pe-canvas-wrap');
    if (wrap && typeof wrap._zoomCleanup === 'function') wrap._zoomCleanup();
  }

  function _register() {
    if (!window.PhotoEditor) return false;
    window.PhotoEditor._zoomAttach  = _attach;
    window.PhotoEditor._zoomCleanup = _cleanup;
    // pixel 모듈에서 사용할 헬퍼 — 현재 모드 + 상수 노출
    window.PhotoEditor._zoomConstants = { MIN, MAX, PIXEL_ENTER, PIXEL_EXIT };
    return true;
  }
  if (!_register()) {
    let tries = 0;
    const iv = setInterval(() => { if (_register() || ++tries > 50) clearInterval(iv); }, 100);
  }
})();
