/* 사진 편집기 — GL 블러 + Unsharp Mask 셰이더 (v226 2026-05-19, Sprint 2)
   가우시안 블러 2-pass (횡/종) + unsharpMask (원본 - 블러 = 디테일 → 가산).

   사용 패턴:
     ops = [
       { program: blurH, uniforms: { u_radius: 2 } },
       { program: blurV, uniforms: { u_radius: 2 } },
       { program: unsharp, uniforms: { u_strength: 0.5 } }, // u_image = blur 결과
     ]
   근데 unsharp 가 원본 + 블러 둘 다 필요 → 별도 처리 (pipeline.run 한 번에 안 됨).
   해결: blurH/V 는 fbo 내부, 마지막 unsharp 셰이더는 두 텍스처 (u_image=원본, u_blurred=블러)
   를 받음. pipeline.run 단순 체인으론 부족하므로, build() 가 직접 GL 호출하는 helper 제공.

   PhotoEditorGLShadersBlur.applyUnsharpMask(input, strength) → output canvas
*/
(function () {
  'use strict';
  if (window.PhotoEditorGLShadersBlur) return;

  // 가우시안 블러 1-pass (방향 지정)
  const FS_BLUR = `
uniform float u_radius;   // 1~10
uniform vec2 u_dir;       // (1,0) 가로 / (0,1) 세로
uniform vec2 u_texSize;   // 텍스처 픽셀 크기

void main() {
  vec2 px = u_dir / u_texSize;
  // 9-tap 가우시안 (radius 따라 stride 조절)
  float r = max(0.1, u_radius);
  vec4 sum = vec4(0.0);
  float weights[9] = float[9](0.05, 0.09, 0.12, 0.15, 0.18, 0.15, 0.12, 0.09, 0.05);
  for (int i = 0; i < 9; i++) {
    float offset = float(i - 4) * r;
    sum += texture(u_image, v_uv + px * offset) * weights[i];
  }
  vec4 effect = sum;
  vec4 original = texture(u_image, v_uv);
  outColor = applyMask(original, effect);
}`;

  // unsharp = original + strength * (original - blurred)
  const FS_UNSHARP = `
uniform sampler2D u_blurred;
uniform float u_strength;   // 0~1

void main() {
  vec4 original = texture(u_image, v_uv);
  vec4 blurred = texture(u_blurred, v_uv);
  vec3 detail = original.rgb - blurred.rgb;
  vec3 sharpened = original.rgb + detail * u_strength * 2.0;
  sharpened = clamp(sharpened, 0.0, 1.0);
  vec4 effect = vec4(sharpened, original.a);
  outColor = applyMask(original, effect);
}`;

  let _progBlur = null;
  let _progUnsharp = null;
  function _ensure() {
    const Pipe = window.PhotoEditorGLPipeline;
    const Ctx  = window.PhotoEditorGLCtx;
    if (!Pipe || !Ctx || !Ctx.init() || !Ctx.supported) return false;
    if (!_progBlur)    _progBlur    = Ctx.compileProgram(Pipe.VS_COMMON, Pipe.FS_HEADER + FS_BLUR);
    if (!_progUnsharp) _progUnsharp = Ctx.compileProgram(Pipe.VS_COMMON, Pipe.FS_HEADER + FS_UNSHARP);
    return !!(_progBlur && _progUnsharp);
  }

  // sharpness 0~100 입력, 결과 canvas 반환 (또는 null = 미지원)
  function _applyUnsharpMask(input, sharpness) {
    if (sharpness <= 0) return null;
    if (!_ensure()) return null;
    const Pipe = window.PhotoEditorGLPipeline;
    const radius = 1.5 + (sharpness / 100) * 1.5; // 1.5~3.0
    const strength = sharpness / 100;
    // 블러 2-pass: H → V (FBO 내부) → unsharp (원본 + 블러 → 결과)
    // pipeline.run 으로 H, V 2 pass 돌리면 마지막이 GL canvas 로 나옴
    const blurredCanvas = Pipe.run(input, [
      { program: _progBlur, uniforms: { u_radius: radius, u_dir: [1, 0], u_texSize: [input.width, input.height] } },
      { program: _progBlur, uniforms: { u_radius: radius, u_dir: [0, 1], u_texSize: [input.width, input.height] } },
    ], { width: input.width, height: input.height });
    if (!blurredCanvas) return null;
    // unsharp pass: input 원본 + blurredCanvas 를 u_blurred 로 전달.
    // [v233 fix] 직접 gl.drawArrays 경로는 VAO 바인딩이 빠지면 마지막 blur 결과만 남는다.
    // 공통 pipeline 으로 마지막 pass 까지 처리해 흐림 반환을 막는다.
    const Ctx = window.PhotoEditorGLCtx;
    const gl = Ctx.gl;
    const blurTex  = _uploadImage(gl, blurredCanvas);
    const out = Pipe.run(input, [{
      program: _progUnsharp,
      uniforms: { u_strength: strength },
      textures: { u_blurred: blurTex },
    }], { width: input.width, height: input.height });
    gl.deleteTexture(blurTex);
    return out;
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

  window.PhotoEditorGLShadersBlur = {
    applyUnsharpMask: _applyUnsharpMask,
    FS_BLUR, FS_UNSHARP,
  };
})();
