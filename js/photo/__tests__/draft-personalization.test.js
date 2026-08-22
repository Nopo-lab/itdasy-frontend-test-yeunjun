/* [STAGE E] 개인화 — **덜 건드리게 만드는** 계층인지 잠근다.
 *
 * 이 프로젝트의 개인화는 "AI 가 더 많이 해준다" 가 아니다.
 * 원장이 매번 자기 폰트로 바꾼다면 폰트 제안은 도움이 아니라 방해다 — 그 축을 꺼야 한다.
 * 그래서 여기서 지키는 건 **개입이 늘지 않는다**와 **안전장치를 못 이긴다** 두 가지다.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const src = fs.readFileSync(path.join(ROOT, 'js/photo/draft-personalization.js'), 'utf8');
const planSrc = fs.readFileSync(path.join(ROOT, 'js/photo/edit-plan.js'), 'utf8');

function load() {
  const win = {};
  new Function('window', src)(win);
  return win.DraftPersonalization;
}
const DP = load();
const pref = (value, n, conf) => ({ value, sampleCount: n, confidence: conf });

describe('cold start — 데이터가 없으면 STAGE C 그대로', () => {
  test('0건이면 DEFAULT (개입 강도 1.0 = 손 안 댐)', () => {
    const p = DP.profile(null);
    expect(p.source).toBe('default');
    expect(p.intervention).toEqual({ typography: 1, placement: 1 });
    expect(p.typography).toEqual({ font: null, align: null, size: null });
  });

  test('빈 객체도 DEFAULT', () => {
    expect(DP.profile({}).source).toBe('default');
  });

  test('DEFAULT 는 STAGE C 결과와 의미적으로 같다 — 어떤 축도 제안하지 않는다', () => {
    const p = DP.profile({ font: null, align: null, size: null, position: null });
    const axes = [p.typography.font, p.typography.align, p.typography.size,
      p.placement.preferredZone];
    expect(axes.every((a) => a === null)).toBe(true);
  });
});

describe('표본이 모자라면 개인화하지 않는다', () => {
  test('4건은 부족 — 5건 미만은 적용 금지', () => {
    const p = DP.profile({ font: pref('jua', 4, 0.9) });
    expect(p.typography.font).toBeNull();
    expect(p.evidence.axes.font).toMatch(/insufficient\(4\)/);
  });

  test('1~2건 반복으로 강한 결정을 만들지 않는다', () => {
    const p = DP.profile({ font: pref('jua', 2, 1.0) });     // confidence 가 1.0 이어도
    expect(p.typography.font).toBeNull();
  });

  test('5~9건은 약하게 — 확신도를 깎는다', () => {
    const weak = DP.profile({ font: pref('jua', 6, 1.0) }).typography.font;
    const strong = DP.profile({ font: pref('jua', 12, 1.0) }).typography.font;
    expect(weak.confidence).toBeLessThan(strong.confidence);
    expect(strong.confidence).toBe(1);
  });

  test('확신도가 낮으면 표본이 충분해도 안 쓴다', () => {
    // MIN_CONF.discrete = 0.25 (WMPersonalize SSOT)
    const p = DP.profile({ font: pref('jua', 30, 0.1) });
    expect(p.typography.font).toBeNull();
    expect(p.evidence.axes.font).toMatch(/low-conf/);
  });
});

describe('🔑 상충 = "건드리지 마라" (모름이 아니다)', () => {
  test('취향이 갈린 축은 개입을 0 으로 내린다', () => {
    const p = DP.profile({ font: { conflict: true } });
    expect(p.intervention.typography).toBe(0);
    expect(p.evidence.axes.font).toBe('conflict');
    expect(p.source).toBe('wm_prefs');           // '아무 일 없음'이 아니다 — 판단한 것이다
  });

  test('상충 축의 값은 절대 제안하지 않는다', () => {
    const p = DP.profile({ align: { conflict: true, value: 'center' } });
    expect(p.typography.align).toBeNull();
  });

  test('배치가 갈리면 배치만 끈다 — 타이포는 그대로', () => {
    const p = DP.profile({ position: { conflict: true }, font: pref('jua', 12, 0.9) });
    expect(p.intervention.placement).toBe(0);
    expect(p.intervention.typography).toBe(1);
    expect(p.typography.font).not.toBeNull();
  });
});

describe('🔴 개인화가 개입을 늘리지 못한다', () => {
  test('개입 강도는 1.0 을 넘지 않는다 — 어떤 입력에도', () => {
    const cases = [
      { font: pref('jua', 999, 1) },
      { font: pref('jua', 50, 1), align: pref('left', 50, 1), size: pref(0.09, 50, 1) },
      { position: pref(0.8, 100, 1) }
    ];
    cases.forEach((c) => {
      const p = DP.profile(c);
      expect(p.intervention.typography).toBeLessThanOrEqual(1);
      expect(p.intervention.placement).toBeLessThanOrEqual(1);
    });
  });

  test('임계값을 새로 만들지 않고 기존 SSOT 를 쓴다', () => {
    expect(src).toMatch(/WMPersonalize && window\.WMPersonalize\.MIN_CONF/);
  });
});

describe('🔴 안전장치를 못 이긴다', () => {
  test('가독성(색·외곽선·그림자)은 개인화 대상이 아니다', () => {
    // 안 보이는 글자는 취향 문제가 아니다.
    const p = DP.profile({ font: pref('jua', 30, 1) });
    expect(p.typography.color).toBeUndefined();
    expect(p).not.toHaveProperty('readability');
    /* 주석에 'WCAG' 가 나오는 건 **개인화 대상이 아니라고 적어둔 것**이라 괜찮다.
       (첫 버전에서 단어만 보고 잡았다가 그 주석에 걸렸다 — 코드를 봐야 한다)
       실제로 그 축을 **계산하거나 내보내는지**를 본다. */
    const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(code).not.toMatch(/stroke|shadow|contrast/);
  });

  test('EditPlan 에서 개인화는 Safety·가독성 축 **뒤에** 붙는다', () => {
    /* ⚠️ `[STAGE E] 개인화` 로 찾으면 compute() 안의 다른 주석이 먼저 걸린다.
       적용 블록만 가리키는 마커(`── [STAGE E]`)로 찾는다 — 첫 버전에서 이걸로 오판했다. */
    const iSafety = planSrc.indexOf('SCOPE.safety && pctx && pctx.subjectRegion');
    const iPerson = planSrc.indexOf('── [STAGE E] 개인화');
    expect(iSafety).toBeGreaterThan(0);
    expect(iPerson).toBeGreaterThan(iSafety);
  });

  test('개인화는 색을 건드리지 않는다 (ShopStyle·BrandKit 소관)', () => {
    const i = planSrc.indexOf('── [STAGE E] 개인화');
    const seg = planSrc.slice(i, planSrc.indexOf('plan.hasAnything', i));
    expect(seg).not.toMatch(/plan\.typography\.color\s*=/);
  });
});

describe('중복 계산 금지', () => {
  test('ShopBaseline 이 이미 editor_observed 로 넣은 값을 덮지 않는다', () => {
    // 같은 증거를 두 번 세면 확신도가 부풀려진다.
    const i = planSrc.indexOf('── [STAGE E] 개인화');
    const seg = planSrc.slice(i, planSrc.indexOf('plan.hasAnything', i));
    expect(seg).toMatch(/source === 'category_prior'/);
  });
});

describe('🔴 원장 간 격리', () => {
  test('프로필을 캐시하지 않는다 — 계정이 바뀌면 즉시 다른 답', () => {
    /* 캐시를 두면 계정 전환 시 앞 원장 취향이 다음 원장에게 새어나간다.
       이 모듈은 저장을 안 하므로 격리는 WMStore(테넌트 스코프)에서 그대로 상속된다.
       그 상속을 깨는 유일한 방법이 **여기에 캐시를 두는 것**이라 그걸 막는다. */
    const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(code).not.toMatch(/_cache|cache\[|memo/);
  });

  test('A 의 취향을 계산해도 B 의 계산에 영향이 없다 (순수 함수)', () => {
    const a = DP.profile({ font: pref('jua', 30, 0.9) });
    const b = DP.profile({ font: null });
    expect(a.typography.font.value).toBe('jua');
    expect(b.typography.font).toBeNull();          // A 가 B 에 안 샌다
    expect(b.intervention.typography).toBe(1);
    // 한 번 더 — 호출 순서가 결과를 바꾸지 않는다
    expect(DP.profile({ font: null }).typography.font).toBeNull();
  });

  test('DEFAULT 를 반환해도 원본이 오염되지 않는다', () => {
    const p1 = DP.profile(null);
    p1.intervention.typography = 0;                // 호출자가 만져도
    const p2 = DP.profile(null);
    expect(p2.intervention.typography).toBe(1);    // 다음 호출은 깨끗하다
    expect(DP.DEFAULT.intervention.typography).toBe(1);
  });

  test('테넌트 키를 직접 읽지 않는다 — WMStore 의 스코프를 그대로 상속한다', () => {
    // 여기서 따로 읽으면 T8 과 스코프가 갈릴 수 있다(예전에 itdasy:tenant vs last_user_id 로 갈렸다).
    expect(src).not.toMatch(/last_user_id|itdasy:tenant/);
  });
});

describe('🔴 세션 경계 — 이전 세션의 개인화가 새 세션을 안 건드린다', () => {
  const edSrc = fs.readFileSync(path.join(ROOT, 'js/itd-editor/itd-editor.js'), 'utf8');

  test('개인화는 compute() 안에 있어 세션 토큰 가드를 그대로 받는다', () => {
    // compute() 결과를 받는 지점에서 alive() 를 확인하므로, 그 안의 개인화도 같이 막힌다.
    expect(planSrc).toMatch(/DraftPersonalization\.resolve/);
    expect(edSrc).toMatch(/window\.EditPlan\.compute\(planCtx\)\.then\(function \(plan\) \{\s*\n\s*if \(!plan \|\| !alive\(\)\) return;/);
  });

  test('개인화가 자기만의 비동기 진입점을 새로 만들지 않는다', () => {
    /* 편집기에서 직접 부르면 세션 가드 밖으로 나간다 — STAGE C 에서 이미 물린 함정이다. */
    expect(edSrc).not.toMatch(/DraftPersonalization\./);
  });
});

describe('저장소·비용', () => {
  test('새 저장소를 만들지 않는다', () => {
    expect(src).not.toMatch(/localStorage|indexedDB|wmLearnPut|WMStore/);
  });
  test('네트워크·AI 호출 0', () => {
    expect(src).not.toMatch(/fetch\(|apiFetch|XMLHttpRequest|generate/);
  });
  test('WMPrefs 를 읽기만 한다 — 학습시키지 않는다', () => {
    expect(src).toMatch(/P\.resolve/);
    expect(src).not.toMatch(/WMPrefs\.learn|\.learn\(/);
  });
});

describe('WMPrefs 없을 때 (로그아웃·모듈 미로드)', () => {
  test('DEFAULT 로 떨어진다 — 기능이 죽지 않는다', async () => {
    const win = {};
    new Function('window', src)(win);
    const p = await win.DraftPersonalization.resolve({});
    expect(p.source).toBe('default');
    expect(p.intervention.typography).toBe(1);
  });
});
