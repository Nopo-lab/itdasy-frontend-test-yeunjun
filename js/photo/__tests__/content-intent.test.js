/* ContentIntent — **실제 원장 피드에서 잰 값**으로 검증한다.
 *
 * 합성 데이터로 테스트하면 내가 상상한 숫자를 내가 통과시키는 꼴이 된다.
 * 실제로 그 함정에 빠진 적이 있다 — 인스타 필드 이름을 `thumbnail_url` 로 가정하고
 * 그 이름으로 가짜 데이터를 만들어 테스트했더니, 진짜 필드가 `thumb` 인 걸 못 잡았다.
 *
 * 아래 픽스처는 2026-08-22 캡처 162셀에서 뽑은 **실측값**이고,
 * expect 는 내가 그 셀을 **눈으로 보고** 붙인 라벨이다.
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

/* 실측 — 전부 육안 대조를 마친 셀이다. 값은 소수점 3자리 그대로 옮겼다. */
const GOLDEN = [
  // 왁싱 피드의 전·후 비교. 넷 다 사진 안에 'Before | After' 라벨이 실제로 박혀 있었다.
  { expect: 'before_after', why: '팔 제모 전후 (라벨 확인)',
    pctx: { whiteRatio: 0.047, saturation: 0.267, skinFrac: 0.713, seamV: 7.444, seamH: 0.459 } },
  { expect: 'before_after', why: '눈썹 왁싱 전후 (라벨 확인)',
    pctx: { whiteRatio: 0.044, saturation: 0.252, skinFrac: 0.664, seamV: 3.742, seamH: 0.352 } },
  { expect: 'before_after', why: '팔 제모 전후',
    pctx: { whiteRatio: 0.048, saturation: 0.234, skinFrac: 0.555, seamV: 3.42, seamH: 0.94 } },
  { expect: 'before_after', why: '턱수염 전후',
    pctx: { whiteRatio: 0.069, saturation: 0.305, skinFrac: 0.783, seamV: 3.155, seamH: 0.655 } },
  // 흰 배경 + 글자. 후기 카드·Q&A·예약 캘린더 캡처였다.
  { expect: 'text_card', why: '속눈썹 Review 후기 카드',
    pctx: { whiteRatio: 0.895, saturation: 0.002, skinFrac: 0.006, seamV: 2.436, seamH: 3.176 } },
  { expect: 'text_card', why: '반영구 예약 캘린더 캡처',
    pctx: { whiteRatio: 0.679, saturation: 0.021, skinFrac: 0.012, seamV: 1.595, seamH: 3.452 } },
  { expect: 'text_card', why: '붙임머리 안내 카드',
    pctx: { whiteRatio: 0.738, saturation: 0.074, skinFrac: 0.024, seamV: 0.839, seamH: 0.001 } },
  { expect: 'text_card', why: '왁싱 후기 캡처',
    pctx: { whiteRatio: 0.626, saturation: 0.033, skinFrac: 0.03, seamV: 1.465, seamH: 0.528 } },
  // 평범한 시술·인물 사진
  { expect: 'person', why: '헤어 인물 정면',
    pctx: { whiteRatio: 0.022, saturation: 0.39, skinFrac: 0.74, seamV: 0.786, seamH: 1.086 } },
  { expect: 'person', why: '헤어 인물',
    pctx: { whiteRatio: 0.008, saturation: 0.325, skinFrac: 0.677, seamV: 0.943, seamH: 1.408 } },
  { expect: 'person', why: '네일 손 클로즈업',
    pctx: { whiteRatio: 0.014, saturation: 0.254, skinFrac: 0.73, seamV: 0.688, seamH: 0.701 } }
];

describe('[STAGE C] ContentIntent — 실측 골든', () => {
  test.each(GOLDEN)('$why → $expect', ({ expect: exp, pctx }) => {
    expect(load().classify(pctx).kind).toBe(exp);
  });

  test('골든 11건 전부 맞춘다 (실측 162셀 중 육안 대조분)', () => {
    const CI = load();
    const wrong = GOLDEN.filter((g) => CI.classify(g.pctx).kind !== g.expect);
    expect(wrong.map((w) => w.why)).toEqual([]);
  });
});

describe('ContentIntent — 모르면 모른다고 한다', () => {
  test('옛 스키마(seam 없음)면 추측하지 않고 unknown', () => {
    // PhotoContext v1 캐시에는 seamV 가 없다. 없는 값으로 판정하면 안 된다.
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
    const r = CI.classify(GOLDEN[4].pctx);
    expect(r.kind).toBe('text_card');
    expect(r.layout.canAddText).toBe(false);
  });

  test('🔑 전·후 비교는 중앙 경계를 피한다', () => {
    const r = CI.classify(GOLDEN[0].pctx);
    expect(r.layout.avoidCenterSeam).toBe(true);
    expect(r.layout.textZone).toEqual(['lower-center']);   // 실측: 라벨이 전부 하단
  });

  test('인물 사진은 기존 경로를 막지 않는다', () => {
    const r = CI.classify(GOLDEN[8].pctx);
    expect(r.layout.canAddText).toBe(true);
    expect(r.layout.avoidCenterSeam).toBe(false);
  });

  test('간신히 넘긴 판정은 확신도가 낮다', () => {
    const strong = CI.classify(GOLDEN[0].pctx);       // seamV 7.44
    const weak = CI.classify(GOLDEN[3].pctx);         // seamV 3.16 — 임계 2.5 바로 위
    expect(strong.confidence).toBeGreaterThan(weak.confidence);
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

  test('임계값이 실측에서 나왔다는 근거를 파일에 남긴다', () => {
    expect(src).toMatch(/162셀|실측/);
  });
});

describe('[회귀] 엣지 밀도로 글자를 찾으려 하지 않는다', () => {
  test('64px 에서 텍스트 엣지는 오히려 낮다 — 그 함정을 파일에 적어뒀다', () => {
    // 실측: 후기 카드 엣지 0.011~0.068 < 전체 중앙값 0.061.
    // 이 사실을 잃어버리면 다음 사람이 같은 규칙을 또 만든다.
    expect(src).toMatch(/거꾸로|뭉개져/);
  });
});
