/* content-intent.js — 이 사진이 **어떤 종류의 게시물인가**를 가른다. [STAGE C]
 *
 * [왜 필요한지 — 추측이 아니라 실측으로 나왔다]
 *   2026-08-22, 실제 원장 인스타 피드 27샵 × 6게시물을 뜯어봤더니
 *   **같은 업종 안에서 콘텐츠 종류별로 배치가 완전히 달랐다.** 왁싱이 특히 심했다:
 *     인물 58% · 후기 캡처 25% · 전·후 비교 17%
 *   후기 캡처엔 이미 글자가 꽉 차 있고, 전·후 비교엔 중앙에 경계선이 있다.
 *   업종(CategoryPrior) 하나로는 이걸 못 가른다 — 그래서 축을 하나 더 둔다.
 *
 * [무엇을 안 하나]
 *   · OCR·Vision·네트워크 호출 0. PhotoContext 가 이미 뜬 64px 통계만 쓴다(재디코딩 없음).
 *   · 글자를 읽지 않는다. "글자가 많아 보인다"까지만 안다.
 *
 * [임계값은 상상이 아니라 실측 162셀로 정했다]
 *   처음엔 "텍스트가 많으면 엣지가 촘촘하겠지" 라고 뒀는데 **정확히 거꾸로였다.**
 *   64px 로 줄이면 글자 획이 뭉개져서 텍스트 카드의 엣지 밀도가 오히려 낮게 나온다
 *   (후기 카드 0.011~0.068 vs 전체 중앙값 0.061). 엣지로 글자를 찾으려던 시도는 버렸다.
 *   대신 **흰 배경 비율**이 깨끗하게 갈랐다.
 *
 *   🔴 **임계값은 파이썬(PIL)이 아니라 브라우저(canvas) 실측으로 정했다.** 한 번 틀렸다:
 *      처음엔 PIL 값으로 정했는데, 같은 사진을 canvas 로 재면 seamV 가 7.444 → 5.249 로 나왔다.
 *      알고리즘은 같다(같은 휘도 배열이면 소수점까지 일치) — 다른 건 디코딩·리샘플링이다.
 *      JPEG 재압축과 canvas 보간이 경계선을 뭉갠다. 감쇠는 일정하지도 않다(0.53~1.64배).
 *      → 이 파일의 숫자를 손대려면 **브라우저에서 다시 재라.** PIL 로 재면 또 틀린다.
 *
 *   검증(브라우저 실측 25셀): 전·후 비교 **정밀도 2/2(100%) · 재현율 2/4(50%)**.
 *      텍스트 카드는 후기·Q&A·예약표 캡처가 전부 맞았다(흰 배경은 canvas 에서도 안정적).
 *
 * [알려진 한계 — 놓친 절반은 튜닝으로 못 고친다]
 *   밝기가 비슷한 두 사진을 붙이면 경계에 **휘도 차가 물리적으로 안 생긴다**(턱수염 전·후).
 *   해상도를 올려 다시 재봐도 분리가 안 됐다(전·후 4건이 1.5~29.9 로 흩어짐).
 *   미탐은 무해하다 — 기본 동작으로 돌아갈 뿐이다. **오탐 0 인 쪽**을 택했다.
 *   이걸 제대로 풀려면 Vision 이 필요하고, 그건 비용 축이 다르다.
 *
 * 공개: window.ContentIntent.of(photoUrl) → Promise<{kind, confidence, layout, why}>
 *       window.ContentIntent.classify(pctx) → 같은 형태 (동기, 이미 뜬 ctx 로)
 */
(function () {
  'use strict';
  if (window.ContentIntent) return;

  var SCHEMA = 'intent-v1';

  /* 실측 162셀에서 육안 대조로 정한 값. 바꾸려면 **다시 재고 눈으로 확인**해라.
     숫자를 감으로 흔들면 이 파일이 만들어진 이유가 없어진다. */
  var TH = {
    whiteCard: 0.30,      // 흰 배경이 이만큼이면 촬영본이 아니라 캡처·카드다
    cardSat: 0.12,        // 캡처는 채도가 거의 없다
    cardSkin: 0.12,       // 사람이 크게 나오면 카드가 아니다
    seamRatio: 2.5,       // 중앙 경계가 평균 인접차의 2.5배 이상이면 붙인 사진
    seamSkin: 0.15,       // 전·후 비교는 **시술 부위가 보인다** — 이게 없으면 그냥 분할 디자인
    personSkin: 0.03      // safe-zone.js 와 같은 하한
  };

  /* 종류별 배치 힌트. **관찰한 것만 적는다.**
     canAddText=false 가 이 파일이 주는 가장 실질적인 값이다 —
     이미 글자가 꽉 찬 후기 캡처에 글자를 더 얹는 건 도움이 아니라 훼손이다. */
  var LAYOUT = {
    person: {
      canAddText: true,
      avoidCenterSeam: false,
      note: '인물·시술 사진 — 업종 기본 배치를 따른다.'
    },
    before_after: {
      canAddText: true,
      avoidCenterSeam: true,          // 중앙 경계선을 글자로 덮으면 비교가 안 보인다
      textZone: ['lower-center'],     // 실측: 'Before/After' 라벨이 전부 하단에 있었다
      note: '전·후 비교 — 중앙 경계를 피하고 하단에 놓는다.'
    },
    text_card: {
      canAddText: false,              // 🔴 이미 글자가 꽉 차 있다
      avoidCenterSeam: false,
      note: '후기·안내 캡처 — 글자가 이미 있다. 더 얹지 않는다.'
    },
    unknown: {
      canAddText: true,
      avoidCenterSeam: false,
      note: '판정 불가 — 아무것도 가정하지 않는다.'
    }
  };

  /* pctx 는 PhotoContext v2 이상이어야 한다(seam·skinFrac 이 v2 에서 생겼다).
     옛 스키마면 **추측하지 않고 unknown** 을 낸다 — 없는 근거로 판정하는 게 제일 나쁘다. */
  function classify(pctx) {
    if (!pctx || typeof pctx.whiteRatio !== 'number' || typeof pctx.seamV !== 'number') {
      return _out('unknown', 0, { reason: 'stats_unavailable' });
    }
    var white = pctx.whiteRatio, sat = pctx.saturation, skin = pctx.skinFrac || 0;
    var sv = pctx.seamV || 0, sh = pctx.seamH || 0;

    // 1) 텍스트 카드 — 흰 배경 + 저채도 + 사람 거의 없음
    if (white >= TH.whiteCard && sat < TH.cardSat && skin < TH.cardSkin) {
      // 세 조건을 얼마나 여유 있게 넘겼는지로 확신도를 낸다(간신히 넘긴 건 약하게)
      var m = Math.min((white - TH.whiteCard) / 0.35, (TH.cardSat - sat) / TH.cardSat, 1);
      return _out('text_card', 0.5 + 0.4 * Math.max(0, m), { white: white, sat: sat, skin: skin });
    }
    // 2) 전·후 비교 — 좌우 이음매 + 시술 부위가 보임 + 세로 경계가 가로보다 뚜렷
    if (sv >= TH.seamRatio && skin >= TH.seamSkin && sv > sh) {
      var m2 = Math.min((sv - TH.seamRatio) / 3, 1);
      return _out('before_after', 0.55 + 0.35 * m2, { seamV: sv, seamH: sh, skin: skin });
    }
    // 3) 인물·시술
    if (skin >= TH.personSkin) {
      return _out('person', 0.6, { skin: skin });
    }
    return _out('unknown', 0, { white: white, sat: sat, skin: skin });
  }

  function _out(kind, conf, why) {
    return {
      schema: SCHEMA,
      kind: kind,
      confidence: Math.round(Math.min(1, conf) * 100) / 100,
      source: 'photo_observed',        // 사진 자체에서 나온 사실 — 원장 취향이 아니다
      layout: LAYOUT[kind],
      why: why
    };
  }

  function of(photoUrl) {
    var pc = window.PhotoContext;
    if (!pc || !photoUrl) return Promise.resolve(_out('unknown', 0, { reason: 'no_context' }));
    return pc.of(photoUrl).then(classify).catch(function () {
      return _out('unknown', 0, { reason: 'error' });
    });
  }

  window.ContentIntent = { SCHEMA: SCHEMA, TH: TH, LAYOUT: LAYOUT, of: of, classify: classify };
})();
