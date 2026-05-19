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

  // [v230 fix] mask 는 RGB grayscale 만 사용 (alpha 1 고정).
  // black 배경 (RGB 0 = 효과 없음) + 영역 white (RGB 255 = 효과 100%) + 그라데이션 = 부드러운 경계.
  // 이전: transparent 배경 + white alpha gradient — premultiplied alpha 로 WebGL 픽셀 가져갈 때
  // 외곽 RGB 계산이 흔들려 의도 외 영역까지 효과 적용되던 버그.

  function _drawRadialMask(canvas, pin) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    // 1) black 으로 전체 채우기 (mask r=0 = 효과 없음)
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const cx = pin.x * W;
    const cy = pin.y * H;
    const shorter = Math.min(W, H);
    const r = pin.radius * shorter;
    if (r <= 0) return;
    // 2) 중심 white → 외곽 black 그라데이션 (alpha 모두 1, RGB 만 변화)
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0,    'rgba(255,255,255,1)');
    grad.addColorStop(0.6,  'rgba(225,225,225,1)');
    grad.addColorStop(1,    'rgba(0,0,0,1)');
    ctx.fillStyle = grad;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillRect(0, 0, W, H);
  }

  function _drawPolygonMask(canvas, pin, source) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    // 1) black 전체 (외부 = 효과 없음)
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const srcW = (source && source.naturalWidth) || (source && source.width) || W;
    const srcH = (source && source.naturalHeight) || (source && source.height) || H;
    const scaleX = W / srcW;
    const scaleY = H / srcH;
    // 2) polygon white fill + canvas blur 로 경계 부드럽게
    ctx.save();
    ctx.filter = `blur(${Math.max(3, Math.min(W, H) * 0.012)}px)`;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    pin.polygon.forEach((p, i) => {
      const x = p.x * scaleX;
      const y = p.y * scaleY;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // 핀 슬라이더 값 → GL tone uniform
  // [v233 fix] 보수적 매핑 — 슬라이더 ±100 도 자연스러운 범위.
  // 이전: exposure ±100 → brightness ±50% (너무 극단, 얼굴 흰색 plateau).
  // 이후: exposure ±100 → brightness ±30%, saturation ±100 → saturate ±50%.
  function _pinToAdjust(pin) {
    return {
      brightness:  100 + (pin.exposure || 0) * 0.3,
      contrast:    100 + (pin.contrast || 0) * 0.3,
      saturate:    100 + (pin.saturation || 0) * 0.5,
      temperature: 0,
      hue:         0,
      vibrance:    Math.max(0, pin.structure || 0) * 0.5,
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
        ctx2d.globalAlpha = 1;
        ctx2d.globalCompositeOperation = 'source-over';
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
