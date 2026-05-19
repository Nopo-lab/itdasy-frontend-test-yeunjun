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

  // 3D LUT: 32×32×32 → 1024×32 펼침 (32 slices × 32 r-pixels 가로, 32 g 세로)
  // [v233 fix] 텍스처 NEAREST + 셰이더에서 r/g/b 8-corner trilinear interpolation 직접 계산.
  // 이전: GL LINEAR 필터가 슬라이스 경계 (b 변경 시 r 축 인접 픽셀) 평균 → 격자형 윤곽선/색반전 artifact.
  // 이후: 8 모서리 NEAREST 샘플 + 코드로 직접 trilinear → 슬라이스 경계 아티팩트 0.
  const FS_LUT3D = `
uniform sampler2D u_lut;
uniform float u_lutSize;   // 32

// 정확한 픽셀 중심에서 NEAREST 샘플링 — (b * size + r + 0.5) / (size*size), (g + 0.5) / size
vec3 sampleLUT(float ri, float gi, float bi) {
  float size = u_lutSize;
  float texW = size * size;  // 1024
  float u = (bi * size + ri + 0.5) / texW;
  float v = (gi + 0.5) / size;
  return texture(u_lut, vec2(u, v)).rgb;
}

vec3 lookup3D(vec3 c) {
  float size = u_lutSize;
  float maxIdx = size - 1.0;
  vec3 idx = clamp(c, 0.0, 1.0) * maxIdx;
  vec3 i0 = floor(idx);
  vec3 i1 = min(i0 + 1.0, maxIdx);
  vec3 f = idx - i0;
  // 8 모서리 샘플 (NEAREST)
  vec3 c000 = sampleLUT(i0.r, i0.g, i0.b);
  vec3 c100 = sampleLUT(i1.r, i0.g, i0.b);
  vec3 c010 = sampleLUT(i0.r, i1.g, i0.b);
  vec3 c110 = sampleLUT(i1.r, i1.g, i0.b);
  vec3 c001 = sampleLUT(i0.r, i0.g, i1.b);
  vec3 c101 = sampleLUT(i1.r, i0.g, i1.b);
  vec3 c011 = sampleLUT(i0.r, i1.g, i1.b);
  vec3 c111 = sampleLUT(i1.r, i1.g, i1.b);
  // trilinear blend
  vec3 c00 = mix(c000, c100, f.r);
  vec3 c01 = mix(c001, c101, f.r);
  vec3 c10 = mix(c010, c110, f.r);
  vec3 c11 = mix(c011, c111, f.r);
  vec3 c0 = mix(c00, c10, f.g);
  vec3 c1 = mix(c01, c11, f.g);
  return mix(c0, c1, f.b);
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
  // [v233 fix] NEAREST 필터로 변경 — 슬라이스 경계 LINEAR 보간 artifact 제거.
  // 셰이더에서 직접 8-corner trilinear interpolation 수행.
  function _upload3D(canvas /*, size */) {
    if (!_ensure()) return null;
    const gl = window.PhotoEditorGLCtx.gl;
    if (_lut3DTex) gl.deleteTexture(_lut3DTex);
    _lut3DTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, _lut3DTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return _lut3DTex;
  }

  function _build1D(lutArray) {
    if (!_ensure()) return null;
    const op = { program: _prog1D, uniforms: {} };
    if (lutArray) {
      const tex = _upload1D(lutArray);
      if (!tex) return null;
      op.textures = { u_lut: tex };
    }
    return op;
  }

  function _build3D(lutCanvas, size) {
    if (!_ensure()) return null;
    const tex = _upload3D(lutCanvas, size);
    if (!tex) return null;
    return { program: _prog3D, uniforms: { u_lutSize: size || 32 }, textures: { u_lut: tex } };
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
