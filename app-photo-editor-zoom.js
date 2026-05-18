/* 사진 편집기 — 핀치 줌·패닝 모듈 (v203 2026-05-19)
   부분 보정 정밀 작업·세밀한 브러시 활용 위해 캔버스 줌·이동.

   동작:
     • 2 손가락 핀치 → wrap CSS transform scale (1.0 ~ 4.0)
     • 1 손가락 드래그 (scale > 1.05 + 브러시 탭 아닐 때) → pan
     • 더블 탭 → reset (scale 1, tx/ty 0)
     • scale < 1.05 로 줄이면 자동 reset

   설계 핵심:
     • wrap (.pe-canvas-wrap) 에 transform 적용 → 메인 canvas + brush mask
       + cursor ring 자식 모두 같이 변환
     • brush 좌표 변환 (clientPt → canvas pixel) 은 getBoundingClientRect()
       가 변환된 rect 반환하므로 자동 보정 — brush 모듈 변경 X
     • 픽셀 처리 (마스크 그리기·적용) 는 canvas pixel 좌표계 일관

   API:
     • window.PhotoEditor._zoomAttach(wrap, state) — 편집기 open 시 호출
     • window.PhotoEditor._zoomCleanup() — close 시 호출

   메인 (app-photo-editor.js) 의 _open / _close 에서 후크.
*/
(function () {
  'use strict';

  const MIN = 1.0, MAX = 4.0;

  function _ensureZoomState(state) {
    if (!state.zoom) state.zoom = { scale: 1, tx: 0, ty: 0 };
    return state.zoom;
  }

  function _apply(wrap, z) {
    wrap.style.transformOrigin = '50% 50%';
    wrap.style.transform = `translate(${z.tx}px, ${z.ty}px) scale(${z.scale})`;
  }
  function _reset(wrap, z) {
    z.scale = 1; z.tx = 0; z.ty = 0;
    _apply(wrap, z);
  }

  function _dist(t1, t2) { return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY); }
  function _mid(t1, t2)  { return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 }; }

  function _attach(wrap, state) {
    if (!wrap || wrap._zoomBound) return;
    wrap._zoomBound = true;
    const z = _ensureZoomState(state);
    _apply(wrap, z);

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
        // 1손가락 pan — 브러시 탭이 아닐 때만 (브러시 탭은 1손가락 drag 가 stroke 임)
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
        z.scale = Math.max(MIN, Math.min(MAX, startScale * ratio));
        if (startMid) {
          z.tx = startTx + (m.x - startMid.x);
          z.ty = startTy + (m.y - startMid.y);
        }
        _apply(wrap, z);
      } else if (e.touches.length === 1 && panStart) {
        e.preventDefault();
        z.tx = startTx + (e.touches[0].clientX - panStart.x);
        z.ty = startTy + (e.touches[0].clientY - panStart.y);
        _apply(wrap, z);
      }
    }
    function _onTouchEnd(e) {
      if (e.touches.length === 0) {
        panStart = null;
        // 줌 거의 1 이면 깔끔 reset
        if (z.scale < 1.05) _reset(wrap, z);
        // 더블 탭 reset (300ms 안에 2회)
        const now = Date.now();
        if (now - lastTap < 300 && z.scale > 1.05) {
          _reset(wrap, z);
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

    // [v203] 데스크톱 보조 — wheel + Ctrl 키 = 줌
    function _onWheel(e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      z.scale = Math.max(MIN, Math.min(MAX, z.scale + delta));
      if (z.scale < 1.05) _reset(wrap, z);
      else _apply(wrap, z);
    }
    wrap.addEventListener('wheel', _onWheel, { passive: false });

    // 메모리 누수 방지용 cleanup 핸들러 보관
    wrap._zoomCleanup = function () {
      wrap.removeEventListener('touchstart', _onTouchStart);
      wrap.removeEventListener('touchmove',  _onTouchMove);
      wrap.removeEventListener('touchend',   _onTouchEnd);
      wrap.removeEventListener('touchcancel', _onTouchEnd);
      wrap.removeEventListener('wheel', _onWheel);
      wrap._zoomBound = false;
      _reset(wrap, z);
      wrap.style.transform = '';
    };
  }

  function _cleanup() {
    const wrap = document.querySelector('.pe-canvas-wrap');
    if (wrap && typeof wrap._zoomCleanup === 'function') wrap._zoomCleanup();
  }

  // 외부 API — 메인 모듈 준비될 때까지 폴링 후 등록
  function _register() {
    if (!window.PhotoEditor) return false;
    window.PhotoEditor._zoomAttach  = _attach;
    window.PhotoEditor._zoomCleanup = _cleanup;
    return true;
  }
  if (!_register()) {
    let tries = 0;
    const iv = setInterval(() => { if (_register() || ++tries > 50) clearInterval(iv); }, 100);
  }
})();
