/* category-prior.js — [Phase 3] 업종별 기본 규칙. **학습 데이터가 아니라 제품 코드에 박은 seed 다.**
 *
 * 🔴 이건 다른 원장들의 데이터를 집계한 게 아니다. 그렇게 하면 테넌트 간 개인정보가 섞이고
 *    소규모 카테고리에서는 역추적 위험까지 생긴다(합의: 전역 학습 금지).
 *    여기 값은 **뷰티 시술 사진의 일반적 구도 상식**을 코드로 적은 것이고,
 *    그래서 `source: 'category_prior'` · `confidence` 상한이 낮다.
 *
 * [왜 필요한가 — Phase 2 에서 확인된 구조적 공백]
 *   인스타 콜드스타트는 **프로페셔널 계정만** 된다(개인 계정은 토큰 자체가 안 나온다).
 *   개인 계정 원장은 인스타 증거가 영원히 0 이다. 그 원장도 첫 사진에서 빈 화면을 보면 안 된다.
 *   → 개인 증거가 0 일 때 바닥을 받쳐주는 게 이 파일이다.
 *
 * [카테고리는 새로 만들지 않는다] `js/service-categories.js` 7종(백엔드 SSOT 복제본)을 그대로 쓴다.
 *
 * [2026-08-22 실측 교정] 실제 원장 인스타 피드 캡처 **27샵 × 6게시물 = 162건**을 분석해 고쳤다.
 *   (네일1·반영구5·붙임머리7·속눈썹4·왁싱4·헤어6 — 폴더=업종, 파일=한 샵)
 *   측정은 PhotoContext 와 **같은 공식**(밝기·채도·색온도·대비, YCbCr 피부 bbox)으로 했다.
 *
 *   🔑 **업종 prior 가 실제로 유의미하다**: 업종 간 밝기 폭 0.174(헤어 0.442 ~ 왁싱 0.616)인데
 *      같은 업종 안 샵별 편차는 σ 0.020~0.063 뿐이다. 업종이 샵 개인차보다 큰 신호다.
 *   🔑 **피사체는 거의 항상 center** (75~100%). 2·3순위 힌트는 실측 근거가 없어 정리했다.
 *   ⚠️ **텍스트 위치는 자동 추출이 불가능하다**(OCR/Vision 필요). 엣지 밀집도로 근사해봤지만
 *      무늬·경계도 같이 잡혀 신뢰할 수 없었다(붙임머리 추정 upper-center vs 육안 lower-left).
 *      → textZone 은 **육안 확인한 6샵**의 관찰만 반영하고, 나머지는 기존값을 유지했다.
 *
 * 공개: window.CategoryPrior.get(category) → prior|null
 */
(function () {
  'use strict';
  if (window.CategoryPrior) return;

  /* 각 축의 값은 **보수적**이다. prior 가 세면 개인 증거를 이기는 순간이 오는데,
     그건 이 설계가 가장 피하려는 것이다(개인화가 목적인 제품이다).
     confidence 는 축마다 0.35~0.5 로 묶어둔다 — editor_observed(최대 1.0)를 절대 못 이긴다. */
  var MAX_PRIOR_CONF = 0.5;

  /* textZone: 텍스트를 놓기 **좋은** 구역(피사체를 피하는 쪽).
     subjectZoneHint: 그 시술 사진에서 피사체가 대개 오는 곳 — 회피 계산의 재료.
     둘 다 '보통 이렇다'이지 '이 원장이 그렇다'가 아니다. */
  var PRIORS = {
    nail: {
      // 실측: 피사체 center 100%(6/6). '아래쪽에 온다'는 내 추측이었고 근거가 없었다.
      subjectZoneHint: ['center'],
      /* 육안: 6게시물 중 **텍스트가 2개뿐**이고 둘 다 하단 중앙이었다.
         네일은 원래 텍스트를 잘 안 넣는다 — 그래서 textDensity 를 낮게 둔다. */
      textZone: ['lower-center', 'upper-center'],
      typography: { sizeRatio: 0.055, align: 'center' },
      textDensity: 'low',
      visual: { brightness: 0.544, saturation: 0.248, warmth: 0.139, contrast: 0.367 },
      note: '네일: 손이 중앙. 텍스트는 드물고 하단. 따뜻한 톤(+0.14).',
      sample: { shops: 1, posts: 6, caution: '샵 1개 — 표본 부족' }
    },
    lash: {
      subjectZoneHint: ['center'],                                  // 실측 92%
      /* 🔴 육안 관찰이 내 추측을 뒤집었다. '눈 클로즈업 → 위아래 띠' 라고 뒀는데
         실제 피드는 **얼굴 전체**가 많고 텍스트는 **좌하단**이 지배적이었다(6/6 텍스트). */
      textZone: ['lower-left', 'lower-center'],
      typography: { sizeRatio: 0.055, align: 'left' },
      textDensity: 'high',
      visual: { brightness: 0.573, saturation: 0.234, warmth: 0.122, contrast: 0.408 },
      note: '속눈썹: 얼굴 중앙, 텍스트 좌하단. 따뜻한 톤(+0.12).',
      sample: { shops: 4, posts: 24 }
    },
    tattoo: {
      subjectZoneHint: ['center'],                                  // 실측 75%
      textZone: ['center', 'upper-center', 'lower-left'],
      // 육안: 큰 타이포가 많았다(홍보·세미나 포스터형). 0.05 는 너무 작았다.
      typography: { sizeRatio: 0.075, align: 'center' },
      textDensity: 'high',
      visual: { brightness: 0.576, saturation: 0.201, warmth: 0.001, contrast: 0.359 },
      note: '반영구: 눈썹 클로즈업+인물. 큰 타이포. 색온도 중립(0.00).',
      sample: { shops: 5, posts: 30 }
    },
    hair: {
      subjectZoneHint: ['center'],                                  // 실측 100% — upper-center 는 근거 없어 제거
      textZone: ['lower-left', 'lower-center'],                     // ✅ 육안 6/6 좌하단, seed 가 맞았다
      typography: { sizeRatio: 0.07, align: 'left' },               // ✅ 맞았다
      textDensity: 'high',
      // 🔑 6업종 중 **가장 어둡고(0.442) 채도가 높다(0.283)** — 스튜디오 조명 인물사진
      visual: { brightness: 0.442, saturation: 0.283, warmth: 0.088, contrast: 0.461 },
      note: '헤어: 인물 정면 중앙, 텍스트 좌하단 2~3줄. 어둡고 채도 높은 톤.',
      sample: { shops: 6, posts: 36 }
    },
    extension: {
      subjectZoneHint: ['center'],                                  // 실측 90%
      textZone: ['lower-left', 'lower-center'],                     // ✅ 육안 6/6 좌하단
      typography: { sizeRatio: 0.07, align: 'left' },
      textDensity: 'high',
      // 🔑 채도 최저(0.105)·대비 최고(0.561) — 어두운 배경에 밝은 머릿결 대비
      visual: { brightness: 0.548, saturation: 0.105, warmth: 0.019, contrast: 0.561 },
      note: '붙임머리: 인물 중앙, 좌하단 큰 텍스트. 저채도·고대비.',
      sample: { shops: 7, posts: 42 }
    },
    skin: {
      subjectZoneHint: ['center'],                                  // 얼굴 정면
      textZone: ['upper-left', 'lower-center'],
      typography: { sizeRatio: 0.06, align: 'left' },
      // ⚠️ 2026-08-22 캡처 데이터셋에 **피부 업종이 없었다.** 아래는 여전히 추측이다.
      visual: null,
      note: '피부: 얼굴 정중앙. ⚠️ 실측 데이터 없음 — 추측값.',
      sample: { shops: 0, posts: 0, caution: '실측 없음' }
    },
    waxing: {
      /* ⚠️ 왁싱은 신체 노출 사진이 많다. 구도를 추천하되 **피사체 회피를 더 세게** 잡는다 —
         잘못 놓인 텍스트가 부적절한 크롭처럼 보일 수 있다. */
      subjectZoneHint: ['center'],                                  // 실측 94%
      textZone: ['upper-center', 'lower-center'],                   // ✅ 육안: 상단 제목 + 하단 라벨
      typography: { sizeRatio: 0.055, align: 'center' },
      textDensity: 'mixed',
      /* 🔑 육안에서 **콘텐츠 유형별로 배치가 완전히 달랐다**: 후기 캡처(상단제목) /
         전·후 비교(중앙하단 Before·After 라벨) / 인물(상단중앙). ContentIntent 가 필요한 실증이다. */
      visual: { brightness: 0.616, saturation: 0.138, warmth: 0.071, contrast: 0.340 },
      note: '왁싱: 6업종 중 가장 밝고(0.62) 채도 낮다. 전·후 비교 레이아웃이 흔하다.',
      sample: { shops: 4, posts: 24 }
    }
  };

  // 카테고리를 못 알아내면 **추론하지 않는다**(T8 원칙과 동일). null 이면 상위가 기본 편집기로 간다.
  var GENERIC = {
    subjectZoneHint: ['center'],
    textZone: ['upper-center'],
    typography: { sizeRatio: 0.06, align: 'center' },
    note: '일반: 중앙 피사체 가정.'
  };

  function get(category) {
    if (!category) return null;
    var p = PRIORS[String(category)] || null;
    if (!p) return null;
    return {
      category: category,
      source: 'category_prior',
      evidenceStrength: 'seed',        // 학습이 아니다 — 코드에 박은 규칙
      confidence: MAX_PRIOR_CONF,
      subjectZoneHint: p.subjectZoneHint.slice(),
      textZone: p.textZone.slice(),
      typography: Object.assign({}, p.typography),
      textDensity: p.textDensity || null,
      visual: p.visual ? Object.assign({}, p.visual) : null,
      sample: p.sample ? Object.assign({}, p.sample) : null,
      note: p.note
    };
  }

  function generic() {
    return {
      category: null, source: 'category_prior', evidenceStrength: 'seed',
      confidence: 0.25,                // 카테고리조차 모를 때 — 더 낮게
      subjectZoneHint: GENERIC.subjectZoneHint.slice(),
      textZone: GENERIC.textZone.slice(),
      typography: Object.assign({}, GENERIC.typography),
      note: GENERIC.note
    };
  }

  window.CategoryPrior = {
    MAX_CONF: MAX_PRIOR_CONF,
    categories: Object.keys(PRIORS),
    get: get,
    generic: generic
  };
})();
