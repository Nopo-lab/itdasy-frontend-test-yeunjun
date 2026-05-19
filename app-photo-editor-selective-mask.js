/* 사진 편집기 — Selective Mask + GL Hook (Sprint 3 v227 2026-05-19)
   핀별 radial gradient mask canvas 생성 → Sprint 2 GL pipeline 의 u_mask 진입점으로 전달.
   _drawHooks.gl_selective 등록 — 핀 N개면 순차 GL pass.

   설계:
     - 단일 mask canvas 1개 재사용 (FBO 메모리 절약). 핀별 GL pass 마다 mask 갱신.
     - 슬라이더: exposure (-100~100) / contrast (-100~100) / saturation (-100~100) / structure (0~100)
       → tone 셰이더 의 brightness/contrast/saturate/vibrance uniform 으로 매핑
     - structure (선명도) 는 큰 비용 → MVP 에선 vibrance 로 대체 (sharpening 은 별도 sprint)
*/
(function () {
  'use strict';
  if (window.PhotoEditorSelectiveMask) return;

  let _maskCanvas = null;

  function _ensureMaskCanvas(w, h) {
    if (!_maskCanvas || _maskCanvas.width !== w || _maskCanvas.height !== h) {
      _maskCanvas = document.createElement('canvas');
      _maskCanvas.width = w;
      _maskCanvas.height = h;
    }
    return _maskCanvas;
  }

  // 핀 1개에 대한 mask 그리기 — type 분기 (radial / polygon)
  function _drawPinMask(canvas, pin, source) {
    if (pin.type === 'polygon' && Array.isArray(pin.polygon)) {
      _drawPolygonMask(canvas, pin, source);
    } else {
      _drawRadialMask(canvas, pin);
    }
  }

  // radial gradient mask (기존 핀 — type 없거나 'radial')
  function _drawRadialMask(canvas, pin) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const W = canvas.width, H = canvas.height;
    const cx = pin.x * W;
    const cy = pin.y * H;
    const shorter = Math.min(W, H);
    const r = pin.radius * shorter;
    if (r <= 0) return;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0,    'rgba(255,255,255,1)');
    grad.addColorStop(0.6,  'rgba(255,255,255,0.9)');
    grad.addColorStop(1,    'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // polygon mask (face-mask 모듈에서 추가한 AI 영역) — polygon 좌표는 원본 source 픽셀 기준
  function _drawPolygonMask(canvas, pin, source) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const W = canvas.width, H = canvas.height;
    const srcW = (source && source.naturalWidth) || (source && source.width) || W;
    const srcH = (source && source.naturalHeight) || (source && source.height) || H;
    const scaleX = W / srcW;
    const scaleY = H / srcH;
    // 부드러운 경계 위해 폴리곤 fill 후 가우시안 블러 (canvas filter)
    ctx.save();
    ctx.filter = `blur(${Math.max(2, Math.min(W, H) * 0.012)}px)`;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    pin.polygon.forEach((p, i) => {
      const x = p.x * scaleX;
      const y = p.y * scaleY;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    // 영역 확장 (feather) — 살짝 부풀려서 경계 자연스럽게
    ctx.fill();
    ctx.restore();
  }

  // 핀 슬라이더 값 → GL tone uniform
  // exposure -100~100 → brightness 0.5~1.5  (선형)
  // contrast -100~100 → contrast 0.5~1.5
  // saturation -100~100 → saturate 0~2
  // structure 0~100   → vibrance 0~1 (sharpness 대체)
  function _pinToAdjust(pin) {
    return {
      brightness:  100 + pin.exposure * 0.5,
      contrast:    100 + pin.contrast * 0.5,
      saturate:    100 + pin.saturation,
      temperature: 0,
      hue:         0,
      vibrance:    Math.max(0, pin.structure),
    };
  }

  function _hasEffect(pin) {
    return pin.exposure !== 0 || pin.contrast !== 0 || pin.saturation !== 0 || pin.structure !== 0;
  }

  function _registerHook() {
    const PE = window.PhotoEditor;
    if (!PE || !PE._internal || !PE._internal.registerDrawHook) return false;
    const Pipe = window.PhotoEditorGLPipeline;
    const Tone = window.PhotoEditorGLShadersTone;
    const Ctx  = window.PhotoEditorGLCtx;
    if (!Pipe || !Tone || !Ctx) return false;

    PE._internal.registerDrawHook('gl_selective', (peCanvas, state, _helpers) => {
      if (!Ctx.init() || !Ctx.supported) return;
      const sel = state && state.selective;
      if (!sel || !sel.pins || sel.pins.length === 0) return;
      const effectivePins = sel.pins.filter(_hasEffect);
      if (effectivePins.length === 0) return;

      const mask = _ensureMaskCanvas(peCanvas.width, peCanvas.height);
      // polygon 핀이 원본 좌표계 사용 — state.originalImg 참조
      const source = state && state.originalImg;
      for (const pin of effectivePins) {
        _drawPinMask(mask, pin, source);
        const op = Tone.build(_pinToAdjust(pin));
        if (!op) continue;
        op.mask = mask;
        const out = Pipe.run(peCanvas, [op], { width: peCanvas.width, height: peCanvas.height });
        if (!out) continue;
        const ctx2d = peCanvas.getContext('2d');
        ctx2d.save();
        ctx2d.filter = 'none';
        ctx2d.drawImage(out, 0, 0, peCanvas.width, peCanvas.height);
        ctx2d.restore();
      }
    });
    return true;
  }

  function _tryRegister() {
    if (_registerHook()) return;
    let tries = 0;
    const iv = setInterval(() => { if (_registerHook() || ++tries > 60) clearInterval(iv); }, 100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _tryRegister);
  else _tryRegister();

  window.PhotoEditorSelectiveMask = { _register: _registerHook, _pinToAdjust };
})();
