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
      subjectZoneHint: ['center', 'lower-right', 'lower-center'],   // 손이 아래쪽에 온다
      textZone: ['upper-left', 'upper-center'],
      typography: { sizeRatio: 0.055, align: 'left' },              // 디테일 사진 — 제목이 작다
      note: '네일: 손이 화면 아래·중앙. 텍스트는 위쪽 여백.'
    },
    lash: {
      subjectZoneHint: ['center'],                                  // 눈 클로즈업
      textZone: ['upper-center', 'lower-center'],
      typography: { sizeRatio: 0.05, align: 'center' },
      note: '속눈썹: 눈이 정중앙 클로즈업. 위아래 띠 공간.'
    },
    tattoo: {
      subjectZoneHint: ['center'],
      textZone: ['upper-center', 'lower-center'],
      typography: { sizeRatio: 0.05, align: 'center' },
      note: '반영구: 눈썹·입술 클로즈업. 속눈썹과 유사.'
    },
    hair: {
      subjectZoneHint: ['center', 'upper-center'],                  // 인물 상반신
      textZone: ['lower-left', 'lower-center'],
      typography: { sizeRatio: 0.07, align: 'left' },               // 인물 사진 — 제목이 크다
      note: '헤어: 인물이 화면을 채운다. 텍스트는 아래쪽.'
    },
    extension: {
      subjectZoneHint: ['center', 'upper-center'],
      textZone: ['lower-left', 'lower-center'],
      typography: { sizeRatio: 0.07, align: 'left' },
      note: '붙임머리: 헤어와 같은 구도.'
    },
    skin: {
      subjectZoneHint: ['center'],                                  // 얼굴 정면
      textZone: ['upper-left', 'lower-center'],
      typography: { sizeRatio: 0.06, align: 'left' },
      note: '피부: 얼굴 정중앙. 얼굴을 피해 모서리·아래.'
    },
    waxing: {
      /* ⚠️ 왁싱은 신체 노출 사진이 많다. 구도를 추천하되 **피사체 회피를 더 세게** 잡는다 —
         잘못 놓인 텍스트가 부적절한 크롭처럼 보일 수 있다. */
      subjectZoneHint: ['center'],
      textZone: ['upper-center', 'upper-left'],
      typography: { sizeRatio: 0.055, align: 'left' },
      note: '왁싱: 피사체 회피 우선. 상단 배치.'
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
