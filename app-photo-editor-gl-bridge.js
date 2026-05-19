/* 사진 편집기 — GL hook 브리지 (v226 2026-05-19, Sprint 2)
   PhotoEditor._drawHooks 에 gl_tone / gl_blur 두 hook 등록.
   _redraw() 가 위 hook 발견 시 GL pass 실행, 결과를 peCanvas 에 drawImage 합성.

   설계: docs/sprint2-pipeline-design.md §9
*/
(function () {
  'use strict';
  if (window.PhotoEditorGLBridge) return;

  function _registerOnce() {
    const PE = window.PhotoEditor;
    if (!PE || !PE._internal || !PE._internal.registerDrawHook) return false;
    const Ctx  = window.PhotoEditorGLCtx;
    const Pipe = window.PhotoEditorGLPipeline;
    const Tone = window.PhotoEditorGLShadersTone;
    const Blur = window.PhotoEditorGLShadersBlur;
    if (!Ctx || !Pipe || !Tone || !Blur) return false;

    // gl_tone: brightness/saturate/contrast/temperature 등을 GL 한 셰이더에 합쳐 처리
    PE._internal.registerDrawHook('gl_tone', (peCanvas, adjust, _helpers) => {
      if (!Ctx.init() || !Ctx.supported) return;
      if (Tone.isIdentity(adjust)) return;  // 변화 없으면 GL pass 건너뛰기
      const op = Tone.build(adjust);
      if (!op) return;
      const out = Pipe.run(peCanvas, [op], { width: peCanvas.width, height: peCanvas.height });
      if (!out) return;
      // GL canvas 결과를 peCanvas 에 다시 그림 (readPixels 없음, GPU→GPU)
      const ctx = peCanvas.getContext('2d');
      ctx.save();
      ctx.filter = 'none';
      ctx.drawImage(out, 0, 0, peCanvas.width, peCanvas.height);
      ctx.restore();
    });

    // gl_blur: unsharp mask (가우시안 블러 2-pass + diff). sharpness 0~100.
    PE._internal.registerDrawHook('gl_blur', (peCanvas, sharpness, _helpers) => {
      if (!Ctx.init() || !Ctx.supported) return;
      const out = Blur.applyUnsharpMask(peCanvas, sharpness);
      if (!out) return;
      const ctx = peCanvas.getContext('2d');
      ctx.save();
      ctx.filter = 'none';
      ctx.drawImage(out, 0, 0, peCanvas.width, peCanvas.height);
      ctx.restore();
    });

    return true;
  }

  // PhotoEditor 본체와 셰이더 모듈이 모두 로드된 후 한 번만 등록
  function _tryRegister() {
    if (_registerOnce()) return;
    let tries = 0;
    const iv = setInterval(() => {
      if (_registerOnce() || ++tries > 60) clearInterval(iv);
    }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _tryRegister);
  } else _tryRegister();

  window.PhotoEditorGLBridge = { _register: _registerOnce };
})();
