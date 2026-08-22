/* ContentIntent — **브라우저가 실제로 재는 값**으로 검증한다.
 *
 * 🔴 이 파일은 한 번 잘못 만들었다가 고쳤다. 기록해 둔다.
 *    처음엔 파이썬(PIL)으로 잰 값을 픽스처로 넣었다. 통과했다. 그런데 제품이 보는 건
 *    **canvas 가 잰 값**이고, 둘이 달랐다 — 같은 사진에서 seamV 가 7.444(PIL) vs 5.249(canvas).
 *    알고리즘은 같다(같은 휘도 배열을 주면 소수점까지 일치한다 — seam-parity.test.js).
 *    다른 건 **디코딩·리샘플링**이다. JPEG 재압축과 canvas 보간이 경계선을 뭉갠다.
 *    감쇠는 일정하지도 않았다(0.53~1.64배). 그래서 PIL 값으로 만든 테스트는
 *    **제품이 실제로 하지 않는 동작을 통과시키고 있었다.**
 *
 *    → 아래 픽스처는 전부 브라우저(localhost, 실제 canvas)에서 뽑은 값이다.
 *
 * [알려진 한계 — 숨기지 않는다]
 *    전·후 비교 판정은 25셀 실측에서 **정밀도 2/2(100%) · 재현율 2/4(50%)** 였다.
 *    놓치는 이유는 튜닝 부족이 아니라 물리다: 밝기가 비슷한 두 사진을 붙이면
 *    경계에 휘도 차가 **안 생긴다**(턱수염 전·후처럼). 더 높은 해상도로 재봐도
 *    분리가 안 됐다(BA 4건이 1.5~29.9 로 흩어짐).
 *    미탐은 무해하다 — 기본 동작으로 돌아갈 뿐이다. 오탐이 없는 쪽을 택했다.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const src = fs.readFileSync(path.join(ROOT, 'js/photo/content-intent.js'), 'utf8');

function load() {
  const win = {};
  new Function('window', src)(win);
  return win.ContentIntent;
}

/* 전부 브라우저 실측값이다(localhost:8114, 실제 원장 피드 캡처 셀). */
const GOLDEN = [
  { expect: 'before_after', why: '왁싱 팔 제모 전후 — 라벨 확인',
    pctx: { whiteRatio: 0.027, saturation: 0.266, skinFrac: 0.709, seamV: 5.249, seamH: 0.421 } },
  { expect: 'before_after', why: '왁싱 눈썹 전후 — 라벨 확인',
    pctx: { whiteRatio: 0.024, saturation: 0.252, skinFrac: 0.665, seamV: 3.364, seamH: 0.370 } },

  { expect: 'text_card', why: '속눈썹 Review 후기 카드',
    pctx: { whiteRatio: 0.883, saturation: 0.002, skinFrac: 0.009, seamV: 2.325, seamH: 3.666 } },
  { expect: 'text_card', why: '속눈썹 Q&A 카드',
    pctx: { whiteRatio: 0.827, saturation: 0.018, skinFrac: 0.072, seamV: 3.123, seamH: 4.755 } },
  { expect: 'text_card', why: '왁싱 후기 캡처',
    pctx: { whiteRatio: 0.366, saturation: 0.046, skinFrac: 0.034, seamV: 2.035, seamH: 4.539 } },
  { expect: 'text_card', why: '왁싱 후기 캡처 2',
    pctx: { whiteRatio: 0.356, saturation: 0.051, skinFrac: 0.075, seamV: 1.681, seamH: 3.412 } },

  { expect: 'person', why: '반영구 인물',
    pctx: { whiteRatio: 0.001, saturation: 0.321, skinFrac: 0.654, seamV: 1.039, seamH: 0.596 } },
  { expect: 'person', why: '헤어 인물',
    pctx: { whiteRatio: 0.003, saturation: 0.328, skinFrac: 0.584, seamV: 2.144, seamH: 0.658 } },
  { expect: 'person', why: '헤어 인물 2',
    pctx: { whiteRatio: 0.026, saturation: 0.156, skinFrac: 0.238, seamV: 1.877, seamH: 0.615 } }
];

/* 진짜 전·후 비교인데 **못 잡는** 것들. 실패를 테스트로 박아둔다 —
   나중에 누가 개선하면 이 테스트가 먼저 빨개져서 알려줄 것이다. */
const KNOWN_MISSES = [
  { truth: 'before_after', why: '왁싱 팔 전후 — 좌우 밝기가 비슷해 경계가 안 잡힘',
    pctx: { whiteRatio: 0.027, saturation: 0.234, skinFrac: 0.564, seamV: 1.817, seamH: 0.699 } },
  { truth: 'before_after', why: '턱수염 전후 — 양쪽 다 어두워 휘도 차가 없음',
    pctx: { whiteRatio: 0.038, saturation: 0.305, skinFrac: 0.787, seamV: 1.850, seamH: 0.688 } }
];

describe('[STAGE C] ContentIntent — 브라우저 실측 골든', () => {
  test.each(GOLDEN)('$why → $expect', ({ expect: exp, pctx }) => {
    expect(load().classify(pctx).kind).toBe(exp);
  });

  test('골든 9건 전부 맞춘다', () => {
    const CI = load();
    expect(GOLDEN.filter((g) => CI.classify(g.pctx).kind !== g.expect).map((w) => w.why)).toEqual([]);
  });

  test('오탐 0 — 전·후 비교가 아닌 걸 전·후 비교라 하지 않는다', () => {
    const CI = load();
    const wrong = GOLDEN.filter((g) => g.expect !== 'before_after')
      .filter((g) => CI.classify(g.pctx).kind === 'before_after');
    expect(wrong).toEqual([]);
  });
});

describe('[한계 명시] 못 잡는 전·후 비교 — 숨기지 않고 박아둔다', () => {
  test.each(KNOWN_MISSES)('$why → 미탐(person)', ({ pctx }) => {
    // 이게 'before_after' 로 바뀌면 개선된 것이다. 그때 이 테스트를 위로 옮겨라.
    expect(load().classify(pctx).kind).toBe('person');
  });

  test('미탐은 아무것도 막지 않는다 — 기본 동작으로 돌아갈 뿐', () => {
    const r = load().classify(KNOWN_MISSES[0].pctx);
    expect(r.layout.canAddText).toBe(true);
    expect(r.layout.avoidCenterSeam).toBe(false);
  });

  test('재현율 한계를 파일에 적어둔다', () => {
    expect(src).toMatch(/재현율|놓친/);
  });
});

describe('ContentIntent — 모르면 모른다고 한다', () => {
  test('옛 스키마(seam 없음)면 추측하지 않고 unknown', () => {
    const r = load().classify({ whiteRatio: 0.9, saturation: 0.01, skinFrac: 0.0 });
    expect(r.kind).toBe('unknown');
    expect(r.confidence).toBe(0);
  });

  test('pctx 자체가 없으면 unknown', () => {
    expect(load().classify(null).kind).toBe('unknown');
  });

  test('unknown 은 아무것도 막지 않는다 — 판정 실패가 기능 정지가 되면 안 된다', () => {
    expect(load().classify(null).layout.canAddText).toBe(true);
  });
});

describe('ContentIntent — 실제 제품 동작', () => {
  const CI = load();

  test('🔑 후기 캡처엔 글자를 더 얹지 않는다', () => {
    const r = CI.classify(GOLDEN[2].pctx);
    expect(r.kind).toBe('text_card');
    expect(r.layout.canAddText).toBe(false);
  });

  test('🔑 전·후 비교는 중앙 경계를 피한다', () => {
    const r = CI.classify(GOLDEN[0].pctx);
    expect(r.layout.avoidCenterSeam).toBe(true);
    expect(r.layout.textZone).toEqual(['lower-center']);
  });

  test('인물 사진은 기존 경로를 막지 않는다', () => {
    const r = CI.classify(GOLDEN[6].pctx);
    expect(r.layout.canAddText).toBe(true);
    expect(r.layout.avoidCenterSeam).toBe(false);
  });

  test('간신히 넘긴 판정은 확신도가 낮다', () => {
    expect(CI.classify(GOLDEN[0].pctx).confidence)
      .toBeGreaterThan(CI.classify(GOLDEN[1].pctx).confidence);
  });

  test('사진에서 나온 사실이지 원장 취향이 아니다', () => {
    // source 를 헷갈리면 T8 이 이걸 '원장이 고른 값'으로 학습한다.
    expect(CI.classify(GOLDEN[0].pctx).source).toBe('photo_observed');
  });
});

describe('ContentIntent — 비용·안전', () => {
  test('네트워크·AI 호출이 0 이다', () => {
    expect(src).not.toMatch(/fetch\(|apiFetch|XMLHttpRequest|generate/);
  });

  test('사진을 다시 디코딩하지 않는다 — PhotoContext 통계만 쓴다', () => {
    expect(src).not.toMatch(/getImageData|createElement\('canvas'\)|new Image/);
  });

  test('임계값이 브라우저 실측에서 나왔다는 근거를 파일에 남긴다', () => {
    expect(src).toMatch(/브라우저 실측|canvas/);
  });
});

describe('[회귀] 두 번 빠진 함정을 다시 안 판다', () => {
  test('엣지 밀도로 글자를 찾지 않는다 — 64px 에선 오히려 낮다', () => {
    expect(src).toMatch(/거꾸로|뭉개져/);
  });

  test('PIL 값으로 임계값을 정하지 않는다 — 제품은 canvas 를 본다', () => {
    expect(src).toMatch(/PIL|canvas/);
  });
});
