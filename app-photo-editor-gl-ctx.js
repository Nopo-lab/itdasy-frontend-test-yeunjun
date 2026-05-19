/* 사진 편집기 — WebGL2 컨텍스트 생성 + 폴백 (v226 2026-05-19, Sprint 2)
   설계: docs/sprint2-pipeline-design.md §3

   책임:
     • offscreen GL canvas + WebGL2 컨텍스트 (싱글톤)
     • webglcontextlost 핸들러 → supported=false 토글
     • 미지원 단말 폴백 신호 (PhotoEditorGLCtx.supported)
     • 기본 셰이더 컴파일 헬퍼 (compileProgram)

   API:
     PhotoEditorGLCtx.init() → boolean (지원 여부)
     PhotoEditorGLCtx.gl → WebGL2RenderingContext | null
     PhotoEditorGLCtx.canvas → HTMLCanvasElement
     PhotoEditorGLCtx.supported → boolean
     PhotoEditorGLCtx.compileProgram(vsSource, fsSource) → WebGLProgram | null
     PhotoEditorGLCtx.dispose()
*/
(function () {
  'use strict';
  if (window.PhotoEditorGLCtx) return;

  let _canvas = null;
  let _gl = null;
  let _supported = false;
  let _initTried = false;

  function _init() {
    if (_initTried) return _supported;
    _initTried = true;
    try {
      _canvas = document.createElement('canvas');
      _canvas.width = 16; _canvas.height = 16; // 초기 작게, render 시 resize
      _gl = _canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true });
      if (!_gl) { _supported = false; return false; }
      _supported = true;
      _canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        _supported = false;
        console.warn('[GLCtx] context lost — 폴백 모드 전환');
      });
      _canvas.addEventListener('webglcontextrestored', () => {
        _supported = true;
        console.info('[GLCtx] context restored');
      });
      return true;
    } catch (_e) {
      _supported = false;
      return false;
    }
  }

  function _compileShader(type, source) {
    if (!_gl) return null;
    const sh = _gl.createShader(type);
    _gl.shaderSource(sh, source);
    _gl.compileShader(sh);
    if (!_gl.getShaderParameter(sh, _gl.COMPILE_STATUS)) {
      console.warn('[GLCtx] shader compile fail:', _gl.getShaderInfoLog(sh));
      _gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function _compileProgram(vsSource, fsSource) {
    if (!_init() || !_gl) return null;
    const vs = _compileShader(_gl.VERTEX_SHADER, vsSource);
    const fs = _compileShader(_gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return null;
    const prog = _gl.createProgram();
    _gl.attachShader(prog, vs);
    _gl.attachShader(prog, fs);
    _gl.linkProgram(prog);
    _gl.deleteShader(vs);
    _gl.deleteShader(fs);
    if (!_gl.getProgramParameter(prog, _gl.LINK_STATUS)) {
      console.warn('[GLCtx] program link fail:', _gl.getProgramInfoLog(prog));
      _gl.deleteProgram(prog);
      return null;
    }
    return prog;
  }

  function _resize(w, h) {
    if (!_canvas) return;
    if (_canvas.width !== w || _canvas.height !== h) {
      _canvas.width = w; _canvas.height = h;
    }
    if (_gl) _gl.viewport(0, 0, w, h);
  }

  function _dispose() {
    if (_canvas) {
      _canvas.width = 0; _canvas.height = 0;
    }
    _gl = null; _canvas = null;
    _supported = false; _initTried = false;
  }

  window.PhotoEditorGLCtx = {
    init: _init,
    get gl() { return _gl; },
    get canvas() { return _canvas; },
    get supported() { return _supported; },
    compileProgram: _compileProgram,
    resize: _resize,
    dispose: _dispose,
  };
})();
