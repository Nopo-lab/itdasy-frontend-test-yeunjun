/* 사진 편집기 — GL 렌더 파이프라인 (v226 2026-05-19, Sprint 2)
   설계: docs/sprint2-pipeline-design.md §7

   책임:
     • 공통 vertex shader (full-screen quad)
     • ping-pong FBO 2개로 render pass 체인
     • uniform 바인딩 helper
     • **u_mask sampler 공통 진입점** (Sprint 3/5 재사용)
     • 텍스처 업로드 (HTMLCanvasElement → GL_TEXTURE_2D)
     • 결과를 GL canvas 에 합성 → caller 가 drawImage(GLcanvas) 로 peCanvas 합성

   API:
     PhotoEditorGLPipeline.run(input, ops, opts) → output HTMLCanvasElement
       input: HTMLCanvasElement (peCanvas)
       ops: [{ program, uniforms: { name: value }, mask?: HTMLCanvasElement }, ...]
       opts: { width, height }
     PhotoEditorGLPipeline.VS_COMMON  공용 vertex shader 소스 (셰이더 모듈이 사용)
     PhotoEditorGLPipeline.FS_HEADER  공용 fragment shader 헤더 (uniform 선언)
*/
(function () {
  'use strict';
  if (window.PhotoEditorGLPipeline) return;

  // ── 공통 vertex shader (full-screen quad) ──────────────
  const VS_COMMON = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

  // ── 공통 fragment shader 헤더 (uniform 선언 + helpers) ──
  // 모든 셰이더가 이 헤더를 prepend
  const FS_HEADER = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_image;
uniform sampler2D u_mask;
uniform bool u_maskEnabled;
out vec4 outColor;

// 효과를 마스크로 mix 하는 helper — 모든 셰이더 마지막에 호출
vec4 applyMask(vec4 original, vec4 effect) {
  if (u_maskEnabled) {
    float m = texture(u_mask, v_uv).r;
    return mix(original, effect, m);
  }
  return effect;
}
`;

  // ── 상태 ──
  let _vao = null;
  let _quadBuf = null;
  let _fbos = null;  // [{ fbo, tex, width, height }, ...] ping-pong
  let _maskTex = null;
  let _maskCanvas = null; // 현재 업로드된 mask canvas (변경 감지)

  function _ensureQuad(gl) {
    if (_vao) return;
    _vao = gl.createVertexArray();
    gl.bindVertexArray(_vao);
    _quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, _quadBuf);
    // full-screen quad: pos (xy) + uv (xy) interleaved
    const data = new Float32Array([
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
       1,  1, 1, 1,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);  // a_pos location 0
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);  // a_uv location 1
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);
  }

  function _ensureFBOs(gl, w, h) {
    if (_fbos && _fbos[0].width === w && _fbos[0].height === h) return;
    _disposeFBOs(gl);
    _fbos = [_createFBO(gl, w, h), _createFBO(gl, w, h)];
  }

  function _createFBO(gl, w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { fbo, tex, width: w, height: h };
  }

  function _disposeFBOs(gl) {
    if (!_fbos) return;
    _fbos.forEach(f => { gl.deleteTexture(f.tex); gl.deleteFramebuffer(f.fbo); });
    _fbos = null;
  }

  function _uploadImage(gl, source) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  function _uploadMask(gl, maskCanvas) {
    // [v228 fix] canvas 인스턴스 캐시 제거 — selective 가 같은 canvas 재사용하며
    // 내용만 갱신하므로 매번 재업로드 필요. 핀 3개 시 5~15ms 추가 — 허용 범위.
    if (_maskTex) gl.deleteTexture(_maskTex);
    _maskTex = _uploadImage(gl, maskCanvas);
    _maskCanvas = maskCanvas;
    return _maskTex;
  }

  function _bindUniforms(gl, program, uniforms) {
    if (!uniforms) return;
    Object.keys(uniforms).forEach(name => {
      const loc = gl.getUniformLocation(program, name);
      if (loc === null) return;
      const val = uniforms[name];
      if (typeof val === 'number') gl.uniform1f(loc, val);
      else if (typeof val === 'boolean') gl.uniform1i(loc, val ? 1 : 0);
      else if (Array.isArray(val)) {
        if (val.length === 2) gl.uniform2fv(loc, val);
        else if (val.length === 3) gl.uniform3fv(loc, val);
        else if (val.length === 4) gl.uniform4fv(loc, val);
      }
    });
  }

  function _run(input, ops, opts) {
    const Ctx = window.PhotoEditorGLCtx;
    if (!Ctx || !Ctx.init() || !Ctx.supported) return null;
    const gl = Ctx.gl;
    const w = (opts && opts.width) || input.width;
    const h = (opts && opts.height) || input.height;
    Ctx.resize(w, h);
    _ensureQuad(gl);
    _ensureFBOs(gl, w, h);

    // 입력 텍스처 업로드
    const inputTex = _uploadImage(gl, input);

    let srcTex = inputTex;
    let dstIdx = 0;

    gl.bindVertexArray(_vao);

    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      if (!op || !op.program) continue;
      const isLast = (i === ops.length - 1);
      const target = isLast ? null : _fbos[dstIdx];
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
      gl.viewport(0, 0, w, h);
      gl.useProgram(op.program);

      // u_image (이전 결과)
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
      const uImg = gl.getUniformLocation(op.program, 'u_image');
      if (uImg) gl.uniform1i(uImg, 0);

      // u_mask + u_maskEnabled
      const uMask = gl.getUniformLocation(op.program, 'u_mask');
      const uMaskEn = gl.getUniformLocation(op.program, 'u_maskEnabled');
      if (op.mask) {
        // [v233 fix] mask 업로드 전에 TEXTURE1 로 전환.
        // 이전에는 TEXTURE0 에 mask 를 업로드해 u_image 원본 자리가 mask 로 바뀌었다.
        gl.activeTexture(gl.TEXTURE1);
        const mTex = _uploadMask(gl, op.mask);
        gl.bindTexture(gl.TEXTURE_2D, mTex);
        if (uMask) gl.uniform1i(uMask, 1);
        if (uMaskEn) gl.uniform1i(uMaskEn, 1);
      } else {
        if (uMaskEn) gl.uniform1i(uMaskEn, 0);
      }

      // [v228 Sprint 4] 추가 sampler 텍스처 (u_lut 등) — slot 2 부터
      if (op.textures) {
        let slot = 2;
        Object.keys(op.textures).forEach(name => {
          const tex = op.textures[name];
          if (!tex) return;
          gl.activeTexture(gl.TEXTURE0 + slot);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          const loc = gl.getUniformLocation(op.program, name);
          if (loc !== null) gl.uniform1i(loc, slot);
          slot++;
        });
      }

      // 커스텀 uniforms
      _bindUniforms(gl, op.program, op.uniforms);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      if (!isLast) {
        srcTex = target.tex;
        dstIdx = 1 - dstIdx;
      }
    }

    gl.bindVertexArray(null);
    gl.deleteTexture(inputTex);

    return Ctx.canvas;
  }

  function _dispose() {
    const Ctx = window.PhotoEditorGLCtx;
    if (Ctx && Ctx.gl) {
      _disposeFBOs(Ctx.gl);
      if (_maskTex) Ctx.gl.deleteTexture(_maskTex);
      if (_vao) Ctx.gl.deleteVertexArray(_vao);
      if (_quadBuf) Ctx.gl.deleteBuffer(_quadBuf);
    }
    _vao = null; _quadBuf = null; _maskTex = null; _maskCanvas = null;
  }

  window.PhotoEditorGLPipeline = {
    run: _run,
    dispose: _dispose,
    VS_COMMON,
    FS_HEADER,
  };
})();
