/* 가독성 — 흰 글자가 밝은 사진에 묻히는 걸 막는다.
 *
 * 실측 근거: 원장 피드 27샵에서 왁싱이 6업종 중 가장 밝았다(밝기 0.616).
 * 편집기는 새 텍스트를 **흰색**으로 시작한다(`COLORS[0]`). 둘이 만나면 안 보인다.
 * 지금까지 아무도 이걸 안 막고 있었다.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const src = fs.readFileSync(path.join(ROOT, 'js/photo/text-readability.js'), 'utf8');

function load() {
  const win = {};
  new Function('window', src)(win);
  return win.TextReadability;
}
const TR = load();

describe('[STAGE C] WCAG 대비 — 표준대로 잰다', () => {
  test('흰색↔검정은 21:1 (WCAG 최대값)', () => {
    expect(TR.ratio(TR.relLum('#FFFFFF'), TR.relLum('#000000'))).toBeCloseTo(21, 1);
  });

  test('같은 색끼리는 1:1', () => {
    expect(TR.ratio(TR.relLum('#BC6675'), TR.relLum('#BC6675'))).toBeCloseTo(1, 2);
  });

  test('감마가 아니라 선형 휘도를 쓴다 — 중간회색은 0.5 가 아니다', () => {
    // sRGB #808080 의 상대휘도는 0.216 이다. 0.5 로 잡으면 중간톤 판정이 통째로 틀린다.
    expect(TR.relLum('#808080')).toBeCloseTo(0.2159, 3);
  });

  test('잘못된 색 문자열은 null — 추측하지 않는다', () => {
    expect(TR.relLum('rgb(1,2,3)')).toBeNull();
    expect(TR.relLum(null)).toBeNull();
  });
});

describe('가독성 판정 — 최악의 칸으로 본다', () => {
  test('평균은 괜찮은데 일부가 밝으면 실패로 본다', () => {
    // 평균 0.2 지만 최대 0.9 인 배경(창문·조명). 평균만 보면 통과시켜 버린다.
    const r = TR.check('#FFFFFF', { mean: 0.2, sd: 0.3, min: 0.05, max: 0.9 });
    expect(r.ok).toBe(false);
    expect(r.meanRatio).toBeGreaterThan(r.ratio);   // 평균으로 보면 더 좋아 보인다
  });

  test('고르게 어두운 배경 + 흰 글자는 통과', () => {
    const r = TR.check('#FFFFFF', { mean: 0.05, sd: 0.02, min: 0.03, max: 0.08 });
    expect(r.ok).toBe(true);
  });

  test('밝은 배경 + 흰 글자는 실패 (왁싱 피드에서 실제로 나오는 조합)', () => {
    const r = TR.check('#FFFFFF', { mean: 0.55, sd: 0.05, min: 0.48, max: 0.62 });
    expect(r.ok).toBe(false);
  });
});

describe('최소 수정 — 색 → 외곽선 → 그림자 순서', () => {
  test('이미 잘 보이면 아무것도 안 한다 (null)', () => {
    expect(TR.resolve({ color: '#FFFFFF', colorIsDefault: true,
      bg: { mean: 0.03, sd: 0.01, min: 0.02, max: 0.05 } })).toBeNull();
  });

  test('기본색이면 색부터 바꾼다 — 밝은 배경엔 어두운 글자', () => {
    const r = TR.resolve({ color: '#FFFFFF', colorIsDefault: true,
      bg: { mean: 0.6, sd: 0.03, min: 0.55, max: 0.65 } });
    expect(r.color).toBe('#15181D');
    expect(r.after).toBeGreaterThan(r.before);
  });

  test('🔑 원장이 고른 색이면 색을 안 바꾸고 외곽선으로 간다', () => {
    const r = TR.resolve({ color: '#FFFFFF', colorIsDefault: false,
      bg: { mean: 0.6, sd: 0.03, min: 0.55, max: 0.65 } });
    expect(r.color).toBeUndefined();
    expect(r.stroke).toBe(true);
  });

  test('배경이 얼룩덜룩하면 색으론 못 이긴다 — 외곽선으로 간다', () => {
    const r = TR.resolve({ color: '#FFFFFF', colorIsDefault: true,
      bg: { mean: 0.4, sd: 0.30, min: 0.02, max: 0.95 } });
    expect(r.color).toBeUndefined();
    expect(r.stroke).toBe(true);
    expect(r.shadow).toBe(true);     // 아주 얼룩덜룩하면 그림자까지
  });

  test('이미 외곽선·그림자가 다 있으면 더 안 한다 (null)', () => {
    expect(TR.resolve({ color: '#FFFFFF', colorIsDefault: false, hasStroke: true, hasShadow: true,
      bg: { mean: 0.6, sd: 0.03, min: 0.55, max: 0.65 } })).toBeNull();
  });

  test('배경 정보가 없으면 손대지 않는다', () => {
    expect(TR.resolve({ color: '#FFFFFF', colorIsDefault: true, bg: null })).toBeNull();
  });

  test('색을 못 읽으면 손대지 않는다 — 추측으로 덮어쓰지 않는다', () => {
    expect(TR.resolve({ color: 'var(--x)', colorIsDefault: true,
      bg: { mean: 0.6, sd: 0.03, min: 0.55, max: 0.65 } })).toBeNull();
  });
});

describe('비용·안전', () => {
  test('네트워크 호출 0', () => {
    expect(src).not.toMatch(/fetch\(|apiFetch|XMLHttpRequest/);
  });
  test('DOM 을 직접 만지지 않는다 — 판정만 한다', () => {
    expect(src).not.toMatch(/document\.|querySelector|\.style\./);
  });
});
