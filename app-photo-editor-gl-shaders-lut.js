/* 사진 편집기 — GL LUT 셰이더 (v226 2026-05-19, Sprint 2)
   1D LUT (Sprint 4 Tone Curve) + 3D LUT (Sprint 5 Film 프리셋) sampler.

   1D LUT: 256 RGBA → Uint8Array(1024), 텍스처 256×1
   3D LUT: 32³ RGBA → 32×1024 2D 펼침 (WebGL2 texture3D 직접 사용 가능하나 호환성 위해 2D 사용)
   - trilinear interpolation 직접 구현

   PhotoEditorGLShadersLUT.build1D(lutArray) → { program, uniforms }
   PhotoEditorGLShadersLUT.build3D(lutCanvas, size) → { program, uniforms }
   PhotoEditorGLShadersLUT.upload1D(array, name) → WebGLTexture (재사용 가능)
   PhotoEditorGLShadersLUT.upload3D(canvas, size) → WebGLTexture
*/
(function () {
  'use strict';
  if (window.PhotoEditorGLShadersLUT) return;

  // 1D LUT: 입력 RGB 각 채널에 대해 LUT lookup (256 px 텍스처)
  const FS_LUT1D = `
uniform sampler2D u_lut;   // 256×1 RGBA

void main() {
  vec4 original = texture(u_image, v_uv);
  vec4 effect;
  effect.r = texture(u_lut, vec2(original.r, 0.5)).r;
  effect.g = texture(u_lut, vec2(original.g, 0.5)).g;
  effect.b = texture(u_lut, vec2(original.b, 0.5)).b;
  effect.a = original.a;
  outColor = applyMask(original, effect);
}`;

  // 3D LUT: 32×32×32 → 2D 펼침 (32 slices, 각 32×32 tile)
  // 텍스처 크기: 1024×32 (32 slices × 32 px × 32 rows)
  // 또는 32×1024 (가로 32, 세로 32×32=1024)
  // trilinear interpolation: B 채널을 32 단계로 양자화 → 두 slice 사이 보간
  const FS_LUT3D = `
uniform sampler2D u_lut;
uniform float u_lutSize;   // 32

vec3 lookup3D(vec3 c) {
  float size = u_lutSize;
  float slicePixSize = 1.0 / size;
  float sliceSize = 1.0 / size;
  float zSlice0 = floor(c.b * (size - 1.0));
  float zSlice1 = min(zSlice0 + 1.0, size - 1.0);
  float zFrac = c.b * (size - 1.0) - zSlice0;
  vec2 uv0 = vec2(
    (zSlice0 + c.r) / size,
    c.g
  );
  vec2 uv1 = vec2(
    (zSlice1 + c.r) / size,
    c.g
  );
  vec3 col0 = texture(u_lut, uv0).rgb;
  vec3 col1 = texture(u_lut, uv1).rgb;
  return mix(col0, col1, zFrac);
}

void main() {
  vec4 original = texture(u_image, v_uv);
  vec3 lutCol = lookup3D(clamp(original.rgb, 0.0, 1.0));
  vec4 effect = vec4(lutCol, original.a);
  outColor = applyMask(original, effect);
}`;

  let _prog1D = null;
  let _prog3D = null;
  let _lut1DTex = null;
  let _lut3DTex = null;

  function _ensure() {
    const Pipe = window.PhotoEditorGLPipeline;
    const Ctx  = window.PhotoEditorGLCtx;
    if (!Pipe || !Ctx || !Ctx.init() || !Ctx.supported) return false;
    if (!_prog1D) _prog1D = Ctx.compileProgram(Pipe.VS_COMMON, Pipe.FS_HEADER + FS_LUT1D);
    if (!_prog3D) _prog3D = Ctx.compileProgram(Pipe.VS_COMMON, Pipe.FS_HEADER + FS_LUT3D);
    return !!(_prog1D && _prog3D);
  }

  // 1D LUT 업로드 — array = Uint8Array(1024) (256 px × RGBA)
  function _upload1D(array) {
    if (!_ensure()) return null;
    const gl = window.PhotoEditorGLCtx.gl;
    if (_lut1DTex) gl.deleteTexture(_lut1DTex);
    _lut1DTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, _lut1DTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, array);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return _lut1DTex;
  }

  // 3D LUT 업로드 — canvas = (size×size) × size = 1024×32 등
  function _upload3D(canvas /*, size */) {
    if (!_ensure()) return null;
    const gl = window.PhotoEditorGLCtx.gl;
    if (_lut3DTex) gl.deleteTexture(_lut3DTex);
    _lut3DTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, _lut3DTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return _lut3DTex;
  }

  function _build1D(lutArray) {
    if (!_ensure()) return null;
    const tex = _upload1D(lutArray);
    if (!tex) return null;
    return { program: _prog1D, uniforms: {} };
    // u_lut binding 은 pipeline.run 직전에 caller 가 직접 처리 (sampler 위치 텍스처 1번)
    // 또는 pipeline 에 ops 항목별 texture 슬롯 추가 — Sprint 4 진입 시 보강
  }

  function _build3D(lutCanvas, size) {
    if (!_ensure()) return null;
    const tex = _upload3D(lutCanvas, size);
    if (!tex) return null;
    return { program: _prog3D, uniforms: { u_lutSize: size || 32 } };
  }

  // 단위 (identity) 1D LUT — 테스트/폴백 용
  function _identityLUT1D() {
    const arr = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
      arr[i*4]   = i;
      arr[i*4+1] = i;
      arr[i*4+2] = i;
      arr[i*4+3] = 255;
    }
    return arr;
  }

  window.PhotoEditorGLShadersLUT = {
    build1D: _build1D,
    build3D: _build3D,
    upload1D: _upload1D,
    upload3D: _upload3D,
    identityLUT1D: _identityLUT1D,
    FS_LUT1D, FS_LUT3D,
  };
})();
