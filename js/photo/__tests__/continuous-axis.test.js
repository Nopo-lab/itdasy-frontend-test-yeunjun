/* 🔴 연속축(size·x·y) 자리표시자 누출 — 실제 UI 제스처로 학습시켜보고서야 드러났다.
 *
 * T8 은 연속축을 값이 아니라 **자리표시자 `'~'`** 로 저장하고 표본은 `samples` 에 쌓는다.
 * 대표값은 `WMPersonalize.robust()`(중앙값)로 뽑는다.
 * 그걸 안 하면 `'~'` 가 그대로 EditPlan 에 실리고 편집기에서
 *   Math.round('~' * H) → NaN → `NaN > 0.15` === false
 * 가 되어 **크기 개인화가 영영 안 걸린다.** 화면은 멀쩡해서 아무도 못 알아챈다.
 *
 * font/color/align 은 이 경로가 없어서 5축을 다 돌리기 전엔 안 보였다.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const src = fs.readFileSync(path.join(ROOT, 'js/photo/draft-personalization.js'), 'utf8');
const edSrc = fs.readFileSync(path.join(ROOT, 'js/itd-editor/itd-editor.js'), 'utf8');

function load(opts) {
  opts = opts || {};
  const win = {
    WMPrefs: { CONT_VALUE: '~' },
    WMPersonalize: opts.noRobust ? {} : {
      MIN_CONF: { discrete: 0.25, continuous: 0.45 },
      robust: (vals) => {
        const a = (vals || []).filter((v) => typeof v === 'number' && isFinite(v)).sort((x, y) => x - y);
        if (!a.length) return null;
        const m = a.length >> 1;
        return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
      }
    }
  };
  new Function('window', src)(win);
  return win.DraftPersonalization;
}
const cont = (samples, n, conf) => ({ value: '~', sampleCount: n, confidence: conf,
  pref: { samples, sampleCount: n } });

describe('[연속축] 자리표시자가 EditPlan 으로 새지 않는다', () => {
  test("🔑 size 값이 '~' 가 아니라 실제 숫자로 나온다", () => {
    const p = load().profile({ size: cont([0.10, 0.11, 0.12, 0.11, 0.10], 5, 0.9) });
    expect(p.typography.size).not.toBeNull();
    expect(p.typography.size.value).not.toBe('~');
    expect(typeof p.typography.size.value).toBe('number');
    expect(isFinite(p.typography.size.value)).toBe(true);
  });

  test('대표값은 중앙값 — 튀는 표본 하나에 안 휘둘린다', () => {
    // 0.11 을 반복하다 한 번 0.90 을 만들었다고 크기가 확 튀면 안 된다
    const p = load().profile({ size: cont([0.11, 0.11, 0.90, 0.11, 0.11], 5, 0.9) });
    expect(p.typography.size.value).toBeCloseTo(0.11, 3);
  });

  test('position(x/y)도 같은 처리', () => {
    const p = load().profile({ position: cont([0.2, 0.22, 0.21, 0.2, 0.22], 5, 0.9) });
    expect(typeof p.placement.preferredZone.value).toBe('number');
  });

  test('표본이 없으면 대표값을 못 뽑는다 → 개인화 안 함 (추측 금지)', () => {
    const p = load().profile({ size: { value: '~', sampleCount: 8, confidence: 0.9, pref: { samples: [] } } });
    expect(p.typography.size).toBeNull();
    expect(p.evidence.axes.size).toBe('no-representative');
  });

  test('숫자가 아닌 표본은 걸러진다', () => {
    const p = load().profile({ size: cont(['x', null, 0.12, 0.12, 0.12], 5, 0.9) });
    expect(p.typography.size.value).toBeCloseTo(0.12, 3);
  });

  test('WMPersonalize 가 없으면(모듈 미로드) 개인화 안 함 — 자체 계산 안 만든다', () => {
    const p = load({ noRobust: true }).profile({ size: cont([0.11, 0.11, 0.11], 5, 0.9) });
    expect(p.typography.size).toBeNull();
  });

  test('대표값 계산을 새로 만들지 않고 SSOT 를 재사용한다', () => {
    expect(src).toMatch(/window\.WMPersonalize && window\.WMPersonalize\.robust/);
    expect(src).not.toMatch(/function robust/);          // 자체 구현 금지
    expect(src).toMatch(/window\.WMPrefs && window\.WMPrefs\.CONT_VALUE/);
  });
});

describe('[편집기] 숫자가 아니면 조용히 넘어가지 않는다', () => {
  test('size 적용은 유한한 양수일 때만', () => {
    expect(edSrc).toMatch(/if \(t\.size && isFinite\(t\.size\.value\) && t\.size\.value > 0 && !own\.size && R\.height\)/);
  });

  test('옛 검사(truthy 만 보던 것)가 되살아나면 안 된다', () => {
    expect(edSrc).not.toMatch(/if \(t\.size && t\.size\.value && !own\.size/);
  });
});
