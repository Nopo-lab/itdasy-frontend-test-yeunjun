/* 사진 편집기 — GL 톤 셰이더 (v226 2026-05-19, Sprint 2)
   brightness / contrast / saturate / temperature / hue / vibrance 를 한 셰이더에 합쳐 1-pass.

   PhotoEditorGLShadersTone.program  — lazy 컴파일된 WebGLProgram
   PhotoEditorGLShadersTone.build(adjust) → { program, uniforms } (pipeline.run 인자)

   adjust = { brightness: 0~200, saturate: 0~200, contrast: 0~200, temperature: -100~+100, hue: -180~+180, vibrance: 0~100 }
   - brightness/saturate/contrast 는 백분율 (100 = 변화 없음)
   - temperature: +값 = 따뜻 (sepia 가산), -값 = 차가움 (contrast 가산)
   - vibrance: skin-aware saturation 보정 (이미 채도 높은 픽셀은 덜 올림)
*/
(function () {
  'use strict';
  if (window.PhotoEditorGLShadersTone) return;

  const FS = `
uniform float u_brightness;   // 0~2 (1 = 변화 없음)
uniform float u_saturate;     // 0~2
uniform float u_contrast;     // 0~2
uniform float u_temperature;  // -1~+1
uniform float u_hue;          // -1~+1 (degree/180)
uniform float u_vibrance;     // 0~1

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec4 original = texture(u_image, v_uv);
  vec3 c = original.rgb;

  // brightness
  c *= u_brightness;

  // contrast (피벗 0.5)
  c = (c - 0.5) * u_contrast + 0.5;

  // temperature — 따뜻하면 R↑·B↓, 차가우면 반대
  if (u_temperature != 0.0) {
    c.r += u_temperature * 0.08;
    c.b -= u_temperature * 0.08;
  }

  // HSV 변환 (saturate/hue/vibrance 적용)
  vec3 hsv = rgb2hsv(c);

  // hue 시프트
  hsv.x = fract(hsv.x + u_hue * 0.5);

  // saturate (전역)
  hsv.y *= u_saturate;

  // vibrance — skin-aware (이미 채도 높은 픽셀은 덜 올림)
  if (u_vibrance > 0.0) {
    float satLow = 1.0 - hsv.y;
    hsv.y += u_vibrance * satLow * 0.5;
  }

  hsv.y = clamp(hsv.y, 0.0, 1.0);
  c = hsv2rgb(hsv);

  c = clamp(c, 0.0, 1.0);
  vec4 effect = vec4(c, original.a);
  outColor = applyMask(original, effect);
}`;

  let _program = null;

  function _ensureProgram() {
    if (_program) return _program;
    const Pipe = window.PhotoEditorGLPipeline;
    const Ctx = window.PhotoEditorGLCtx;
    if (!Pipe || !Ctx) return null;
    _program = Ctx.compileProgram(Pipe.VS_COMMON, Pipe.FS_HEADER + FS);
    return _program;
  }

  function _build(adjust) {
    const program = _ensureProgram();
    if (!program) return null;
    const a = adjust || {};
    return {
      program,
      uniforms: {
        u_brightness: ((a.brightness != null ? a.brightness : 100) / 100),
        u_saturate:   ((a.saturate   != null ? a.saturate   : 100) / 100),
        u_contrast:   ((a.contrast   != null ? a.contrast   : 100) / 100),
        u_temperature: ((a.temperature != null ? a.temperature : 0) / 100),
        u_hue:        ((a.hue        != null ? a.hue        : 0) / 180),
        u_vibrance:   ((a.vibrance   != null ? a.vibrance   : 0) / 100),
      },
    };
  }

  // 변화 없는지 빠르게 검사 (전 픽셀 동일 결과면 GL pass 건너뛰기)
  function _isIdentity(adjust) {
    const a = adjust || {};
    return (a.brightness == null || a.brightness === 100) &&
           (a.saturate == null || a.saturate === 100) &&
           (a.contrast == null || a.contrast === 100) &&
           (!a.temperature) && (!a.hue) && (!a.vibrance);
  }

  window.PhotoEditorGLShadersTone = {
    build: _build,
    isIdentity: _isIdentity,
    FS,
  };
})();
