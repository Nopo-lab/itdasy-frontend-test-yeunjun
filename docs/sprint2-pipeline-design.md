# Sprint 2 — WebGL2 보정 파이프라인 선행 설계

> 작성: 2026-05-19 · plan: `glistening-gathering-flamingo.md` v3
> 코드 진입 전 흐름 정리. **beauty.js 회귀 방지 + readPixels 병목 제거 + mask 공통 진입점** 3가지가 핵심.

---

## 1. 현재 _redraw() 파이프라인 (v225)

`app-photo-editor.js:_redraw()` 순서:

```
1. peCanvas clear
2. ctx.filter = brightness/saturate/contrast/sepia(temperature)  ← CPU CSS filter (브라우저)
3. ctx.drawImage(originalImg, sx,sy,sw,sh, 0,0,dw,dh)
4. unsharpMask (a.sharpness > 10 시)                                ← CPU 픽셀 walk
5. _drawHooks.beauty(ctx, dw, dh, _state.beauty, _helpers)         ← CPU 픽셀 walk (22 슬라이더)
6. layers.forEach → drawText                                       ← Canvas 2D
7. drawWatermark
8. _drawHooks.tplV2_overlay (Templates v2 합성)
```

병목 (4032×3024 입력, iPhone SE 2 기준):
- ctx.filter: 30~60ms (브라우저 GPU 가속이지만 큰 이미지에서 느림)
- unsharpMask CPU: 80~150ms
- beauty 픽셀 walk: 150~400ms (슬라이더 다 켜면)

= 슬라이더 드래그 한 번에 **300~600ms 합산**. 32ms 쓰로틀로 폭주는 막지만 본질적으로 느림.

---

## 2. v226 (Sprint 2) 후 파이프라인

**핵심**: 전역 톤 + 블러를 GL 로 옮긴다. 영역 마스킹 픽셀 walk 는 그대로 유지 (회귀 안전).

```
1. peCanvas clear
2. ctx.drawImage(originalImg, sx,sy,sw,sh, 0,0,dw,dh)  ← 필터 없이 원본만
3. [신규] _drawHooks.gl_tone(canvas, _state.adjust, _helpers)  ← GL pass 1
   - 입력: peCanvas 텍스처
   - 셰이더: brightness/contrast/saturate/temperature/hue/vibrance (한 셰이더에 합침)
   - 출력: 다시 peCanvas 에 readPixels 없이 drawImage(GLcanvas)
4. [신규] _drawHooks.gl_blur(canvas, _state.adjust.sharpness, _helpers)  ← GL pass 2
   - 가우시안 블러 2-pass (횡/종 FBO) + unsharpMask diff
   - sharpness > 10 시만 동작
5. _drawHooks.beauty(ctx, dw, dh, _state.beauty, _helpers)  ← 기존 CPU 픽셀 walk (영역 마스킹 유지)
6. layers.forEach → drawText
7. drawWatermark
8. _drawHooks.tplV2_overlay
```

이득:
- ctx.filter 30~60ms → GL pass 5~10ms (10배↑)
- unsharpMask CPU 80~150ms → GL 2-pass 8~15ms (10배↑)
- 슬라이더 드래그 합산 300~600ms → **80~150ms** (4배↑)

회귀 안전:
- beauty 픽셀 walk 22 슬라이더 — 코드 변경 0 줄
- text/watermark/tplV2 — 코드 변경 0 줄

---

## 3. WebGL2 미지원 / 폴백 분기

```
gl-ctx.js init():
  - getContext('webgl2') 시도
  - 실패: window.PhotoEditorGLCtx.supported = false
  - 성공: webglcontextlost 핸들러 등록
gl_tone hook 등록 시:
  - GL 지원: GL 셰이더 실행
  - 미지원: ctx.filter = 'brightness(...) saturate(...) ...' 로 폴백 (v225 동작)
```

웹glcontextlost 발생 시:
- 자동으로 supported = false 토글
- 다음 _redraw() 부터 폴백 CSS filter 모드

---

## 4. readPixels 최소화 (병목 제거)

**원칙**: GL pass 결과는 GL canvas 에 남기고, peCanvas 합성에는 `drawImage(GLcanvas)` 만 사용. readPixels (GPU→CPU) 호출 0회.

```
gl-pipeline render(input, ops, output):
  - input: HTMLCanvasElement (texture 변환)
  - ops: [{ shader, uniforms }, ...]
  - output: HTMLCanvasElement (GL canvas, ping-pong FBO 마지막 결과 표시)
  - 호출자가 drawImage(output, 0, 0) 으로 peCanvas 에 합성
```

readPixels 가 필요한 경우 (export 등) — 별도 함수 `pipeline.readToImageData()` 로 명시적 호출.

---

## 5. MediaPipe ↔ GL 순서

현재 beauty.js 는 MediaPipe **사용 안 함** (RGB-HSV 조건 분기로 픽셀 분류). PE-1 AI 원터치 v2 (`app-photo-editor-ai-touch-v2.js`) 에서만 MediaPipe 호출 — 그것도 비동기 1회 (적용 버튼 클릭 시).

따라서 Sprint 2 에선 GL ↔ MediaPipe 순서 충돌 없음:
- 슬라이더 드래그: GL pass 만 (MediaPipe 호출 0)
- AI 원터치 v2 클릭: 별도 흐름 (MediaPipe → 결과 이미지 → originalImg 교체 → 일반 _redraw)

Sprint 3 (Selective) 부터 mask 텍스처 필요해짐 → 미리 공통 진입점 `u_mask` 보장.

---

## 6. u_mask 공통 진입점 (Sprint 3·5 준비)

`gl-pipeline.js` 의 모든 셰이더 program 은 다음 uniform 을 공통으로 받음:

```glsl
uniform sampler2D u_mask;        // 0~1 마스크. 1 = 효과 100%, 0 = 무효
uniform bool u_maskEnabled;      // false 면 전체 영역
```

각 셰이더 마지막에:
```glsl
vec4 result = applyEffect(originalColor);
if (u_maskEnabled) {
  float m = texture(u_mask, v_uv).r;
  result = mix(originalColor, result, m);
}
gl_FragColor = result;
```

Sprint 3 Selective: radial mask canvas → texture 로 업로드 → `u_mask` 지정 → `u_maskEnabled = true`.
Sprint 5 Healing/Film: 동일 진입점 재사용.

---

## 7. ping-pong FBO 패턴 (gl-pipeline)

```
fbo_A ← input texture
for each op:
  bind fbo_B, set uniforms, draw quad → fbo_B
  swap A ↔ B
final: blit fbo_A → GL canvas (drawArrays 마지막 단계)
```

FBO 2개만 사용. 4032×3024 RGBA × 2 = 96MB GPU 메모리 — iPhone SE 2 한계 (~250MB) 내.

---

## 8. 슬라이더 드래그 vs finalize

**드래그 중** (touchmove 폭주):
- GL pass 매번 호출 — 빠르므로 가능 (5~15ms)
- 단 sharpness 같이 무거운 unsharpMask 는 finalize 시점만

**finalize** (touchend):
- 전체 _redraw 호출 (GL pass + beauty 픽셀 walk + text + ...)
- 32ms throttle 그대로 유지

---

## 9. 신규 hook 등록 위치 (app-photo-editor.js 최소 수정)

`_redraw()` 내 line 681~683:

```javascript
// 기존
if (a.sharpness > 10) _unsharpMask(ctx, dw, dh, a.sharpness / 100);
if (typeof _drawHooks.beauty === 'function') {
  try { _drawHooks.beauty(ctx, dw, dh, _state.beauty, _helpers); } catch (_e) { void _e; }
}

// v226 (drawImage 후, beauty 픽셀 walk 전에 GL pass 2개 추가)
if (typeof _drawHooks.gl_tone === 'function') {
  try { _drawHooks.gl_tone(cv, _state.adjust, _helpers); } catch (_e) { void _e; }
}
if (a.sharpness > 10) {
  if (typeof _drawHooks.gl_blur === 'function') {
    try { _drawHooks.gl_blur(cv, a.sharpness, _helpers); } catch (_e) { _unsharpMask(ctx, dw, dh, a.sharpness / 100); }
  } else {
    _unsharpMask(ctx, dw, dh, a.sharpness / 100);
  }
}
if (typeof _drawHooks.beauty === 'function') { ... }  // 동일
```

또한 ctx.filter brightness/saturate/contrast/sepia 4종 제거 → 단순 `ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh)` 만. 폴백 시 GL 미사용 경로에서 ctx.filter 재적용.

수정 총량: **+10~15줄, -4줄** (메인 1017 → 1023~1028, 1050 한도 내).

---

## 10. 검증 체크리스트

- [ ] WebGL2 미지원 단말 → CPU 폴백 자동 (ctx.filter 재적용)
- [ ] iOS Safari `webglcontextlost` DevTools 강제 발생 → 자동 폴백
- [ ] Galaxy A14 (저가형) — 슬라이더 드래그 FPS 30+
- [ ] beauty 22 슬라이더 회귀 — 모두 정상
- [ ] 템플릿 30+ / 다중 텍스트 / MediaPipe AI 원터치 v2 회귀
- [ ] 4032×3024 입력에서 GL FBO 메모리 정리 (dispose) 확인
