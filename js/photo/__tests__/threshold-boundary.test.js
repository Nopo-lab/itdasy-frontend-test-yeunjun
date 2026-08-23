/* [출시 전 동결] 임계값 **경계**를 정확히 못박는다.
 *
 * 20건·5건 같은 숫자는 지금까지 "대충 그 근처" 로만 확인했다.
 * 경계가 하나 어긋나면 실사용 데이터가 들어왔을 때 **19건에서 판정이 나오거나
 * 20건인데 안 나오는** 일이 생기고, 그건 데이터를 한참 본 뒤에야 눈치챈다.
 * 출시 전에 못박아 둔다 — 이 숫자들은 동결 대상이다.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const qSrc = fs.readFileSync(path.join(ROOT, 'js/photo/draft-quality.js'), 'utf8');
const pSrc = fs.readFileSync(path.join(ROOT, 'js/photo/draft-personalization.js'), 'utf8');

function loadQ() {
  const store = { last_user_id: 'boundary-tenant' };
  const win = {
    location: { search: '' },
    localStorage: { getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    EditPlan: { rolloutInfo: () => ({ on: true, pct: 10, bucket: 3 }) }
  };
  new Function('window', 'location', 'localStorage', qSrc)(win, win.location, win.localStorage);
  return win.DraftQuality;
}
// n번 개입, c번 되돌림
function run(n, c) {
  const Q = loadQ();
  for (let i = 0; i < n; i++) {
    Q.begin({}); Q.applied({ color: 1 });
    if (i < c) Q.corrected('color');
    Q.published({ published: true });
  }
  return Q.report();
}

describe('[경계] 품질 판정 — 20건이 정확히 20건이다', () => {
  test('0건 → NO_DATA', () => {
    const r = run(0, 0);
    expect(r.verdicts.color).toBe('NO_DATA');
    expect(r.axes.color.value).toBeNull();
    expect(r.needed.color).toBe(20);
  });

  test('1건 → INSUFFICIENT (19건 더)', () => {
    const r = run(1, 1);                       // 되돌림 100% 여도 판정하지 않는다
    expect(r.verdicts.color).toBe('INSUFFICIENT');
    expect(r.axes.color.value).toBeNull();
    expect(r.needed.color).toBe(19);
  });

  test('🔑 19건 → 아직 INSUFFICIENT (1건 더)', () => {
    const r = run(19, 0);
    expect(r.verdicts.color).toBe('INSUFFICIENT');
    expect(r.axes.color.value).toBeNull();     // 되돌림 0% 여도 "좋다"고 말하지 않는다
    expect(r.needed.color).toBe(1);
  });

  test('🔑 20건 → 판정 시작 (경계 포함)', () => {
    const r = run(20, 0);
    expect(r.verdicts.color).toBe('GOOD');
    expect(r.axes.color.value).toBe(0);
    expect(r.needed.color).toBe(0);
    expect(r.measurable).toContain('color');
  });

  test('21건 → 계속 판정', () => {
    expect(run(21, 0).verdicts.color).toBe('GOOD');
  });

  test('100건 → 큰 표본에서도 같은 규칙', () => {
    const r = run(100, 45);
    expect(r.axes.color.sampleCount).toBe(100);
    expect(r.axes.color.value).toBe(0.45);
    expect(r.verdicts.color).toBe('NEEDS_CORRECTION');
  });
});

describe('[경계] GOOD / NEEDS_CORRECTION 갈림선 = 30%', () => {
  test('29% → GOOD', () => {
    // 100건 중 29건 되돌림
    expect(run(100, 29).verdicts.color).toBe('GOOD');
  });
  test('🔑 30% → NEEDS_CORRECTION (경계 포함)', () => {
    expect(run(100, 30).verdicts.color).toBe('NEEDS_CORRECTION');
  });
  test('31% → NEEDS_CORRECTION', () => {
    expect(run(100, 31).verdicts.color).toBe('NEEDS_CORRECTION');
  });
});

describe('[경계] 개인화 표본 — 5 / 10', () => {
  function prof(n) {
    const win = {};
    new Function('window', pSrc)(win);
    return win.DraftPersonalization.profile({ font: { value: 'jua', sampleCount: n, confidence: 0.9 } });
  }

  test('4건 → 개인화 없음', () => {
    expect(prof(4).typography.font).toBeNull();
    expect(prof(4).evidence.axes.font).toMatch(/insufficient\(4\)/);
  });

  test('🔑 5건 → 약하게 적용 (경계 포함)', () => {
    const p = prof(5);
    expect(p.typography.font).not.toBeNull();
    expect(p.typography.font.confidence).toBeCloseTo(0.54, 2);   // 0.9 × 0.6
  });

  test('9건 → 여전히 약하게', () => {
    expect(prof(9).typography.font.confidence).toBeCloseTo(0.54, 2);
  });

  test('🔑 10건 → 정상 강도 (경계 포함)', () => {
    expect(prof(10).typography.font.confidence).toBeCloseTo(0.9, 2);
  });

  test('30건 → 정상 강도 유지 (표본이 커도 확신도가 폭주하지 않는다)', () => {
    expect(prof(30).typography.font.confidence).toBeCloseTo(0.9, 2);
  });

  test('0건 → DEFAULT', () => {
    const win = {};
    new Function('window', pSrc)(win);
    expect(win.DraftPersonalization.profile({}).source).toBe('default');
  });
});

describe('[동결] 이 숫자들은 출시 전 확정값이다', () => {
  test('임계값이 코드에 그대로 있다 — 바꾸면 이 테스트가 먼저 빨개진다', () => {
    expect(qSrc).toMatch(/var MIN_SAMPLE = 20;/);
    expect(qSrc).toMatch(/var BAD_RATE = 0\.30;/);
    expect(pSrc).toMatch(/var MIN_SAMPLES = 5;/);
    expect(pSrc).toMatch(/var STRONG_SAMPLES = 10;/);
  });
});
