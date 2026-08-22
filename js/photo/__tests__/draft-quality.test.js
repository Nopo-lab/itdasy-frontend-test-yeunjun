/* [STAGE D] 자동 초안 품질 — **지표가 스스로를 속이지 않는지**를 잠근다.
 *
 * 이 프로젝트에서 지표는 두 번 거짓말했다:
 *   · 분모를 잘못 잡아 "가림률 3%" 가 GO 로 읽혔다(실제론 문제가 없어서 STOP 이었다)
 *   · 표본 부족을 FAIL 로 오판했다
 * 그래서 여기서는 **분모가 무엇인지**와 **표본이 모자랄 때 뭘 말하는지**를 테스트로 박는다.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const src = fs.readFileSync(path.join(ROOT, 'js/photo/draft-quality.js'), 'utf8');
const planSrc = fs.readFileSync(path.join(ROOT, 'js/photo/edit-plan.js'), 'utf8');
const edSrc = fs.readFileSync(path.join(ROOT, 'js/itd-editor/itd-editor.js'), 'utf8');

function load() {
  const win = {};
  new Function('window', src)(win);
  return win.DraftQuality;
}
function loadPlan(store) {
  const win = { localStorage: { getItem: (k) => (store || {})[k] || null } };
  new Function('window', 'location', 'localStorage',
    src.replace(/^/, '') + '\n' + planSrc)(win, { search: '' }, win.localStorage);
  return win.EditPlan;
}

describe('분모를 바르게 잡는다', () => {
  test('되돌림률의 분모는 **그 축을 우리가 건드린 횟수**다', () => {
    const Q = load();
    // 색을 3번 얹고 1번 되돌렸다 → 1/3. 세션 100개로 나누면 안 된다.
    for (let i = 0; i < 3; i++) {
      Q.begin({}); Q.applied({ color: 1 });
      if (i === 0) Q.corrected('color');
      Q.published({ published: true });
    }
    for (let i = 0; i < 40; i++) { Q.begin({}); Q.published({ published: true }); }  // 초안 없는 세션
    const r = Q.report();
    expect(r.axes.color.sampleCount).toBe(3);      // 43 이 아니다
    expect(r.sessions).toBe(43);
  });

  test('우리가 안 건드린 축을 원장이 바꾼 건 되돌림이 아니다', () => {
    const Q = load();
    Q.begin({}); Q.applied({ color: 1 });
    Q.corrected('font');                            // 우리가 폰트를 건드린 적 없다
    Q.published({ published: true });
    expect(Q.report().axes.font.sampleCount).toBe(0);
  });

  test('같은 축을 여러 번 바꿔도 한 번만 센다', () => {
    const Q = load();
    for (let i = 0; i < 25; i++) {
      Q.begin({}); Q.applied({ color: 1 });
      Q.corrected('color'); Q.corrected('color'); Q.corrected('color');
      Q.published({ published: true });
    }
    expect(Q.report().axes.color.value).toBe(1);    // 3 이 아니다
  });
});

describe('표본이 모자라면 값을 안 낸다', () => {
  test('20건 미만은 INSUFFICIENT — 비율을 말하지 않는다', () => {
    const Q = load();
    Q.begin({}); Q.applied({ color: 1 }); Q.corrected('color'); Q.published({ published: true });
    const r = Q.report();
    expect(r.axes.color.status).toBe('INSUFFICIENT');
    expect(r.axes.color.value).toBeNull();          // 100% 라고 말하면 안 된다
    expect(r.axes.color.sampleCount).toBe(1);
  });

  test('한 건도 없으면 0건 INSUFFICIENT (실패가 아니다)', () => {
    const r = load().report();
    expect(r.axes.position.status).toBe('INSUFFICIENT');
    expect(r.axes.position.value).toBeNull();
  });
});

describe('🔴 "안 만지고 발행" 을 수용으로 읽지 않는다', () => {
  test('약한 증거라고 라벨을 붙여 내보낸다', () => {
    const r = load().report();
    expect(r.keptEvidence).toBe('weak');
    expect(r.note).toMatch(/바빴을/);
  });

  test('취소·그냥 닫기도 센다 — 발행만 세면 분모가 쏠린다', () => {
    expect(edSrc).toMatch(/DraftQuality\.published\(\{ published: false/);
  });
});

describe('🔴 되돌릴 수 없는 축을 "수용됐다"로 읽지 않는다', () => {
  /* 편집기엔 외곽선·그림자를 끄는 버튼이 없다. 원장은 되돌릴 수가 없다.
     그런데 우리가 가장 많이 얹는 축이 바로 그 둘이다.
     "되돌림 0/50" 을 내면 읽는 사람이 "다 수용됐다"로 받아들이고 자동화를 더 세게 켠다. */
  test('stroke·shadow 는 비율 대신 NO_SIGNAL', () => {
    const Q = load();
    for (let i = 0; i < 30; i++) {
      Q.begin({}); Q.applied({ stroke: 1, shadow: 1 }); Q.published({ published: true });
    }
    const r = Q.report();
    expect(r.axes.stroke.status).toBe('NO_SIGNAL');
    expect(r.axes.stroke.value).toBeNull();          // 0 이라고 말하면 안 된다
    expect(r.axes.stroke.sampleCount).toBe(30);      // 몇 번 얹었는지는 그대로 보여준다
    expect(r.axes.stroke.reason).toMatch(/되돌릴 UI/);
    expect(r.noSignalAxes).toEqual(['stroke', 'shadow']);
  });

  test('전체 되돌림률도 되돌릴 수 있는 축만 모은다', () => {
    const Q = load();
    // stroke 만 30번 얹었다 → 되돌릴 수 있는 축이 하나도 없으므로 전체는 표본 0
    for (let i = 0; i < 30; i++) { Q.begin({}); Q.applied({ stroke: 1 }); Q.published({ published: true }); }
    const r = Q.report();
    expect(r.overall.sampleCount).toBe(0);
    expect(r.overall.value).toBeNull();              // 0% 라고 말하면 자동화를 더 켜게 된다
  });

  test('되돌릴 수 있는 축은 정상적으로 비율을 낸다', () => {
    const Q = load();
    for (let i = 0; i < 25; i++) {
      Q.begin({}); Q.applied({ color: 1 });
      if (i < 5) Q.corrected('color');
      Q.published({ published: true });
    }
    const r = Q.report();
    expect(r.axes.color.status).toBe('OK');
    expect(r.axes.color.value).toBe(0.2);
  });
});

describe('개인정보·비용', () => {
  test('네트워크 전송 0', () => {
    expect(src).not.toMatch(/fetch\(|apiFetch|XMLHttpRequest|sendBeacon/);
  });
  test('저장소를 새로 만들지 않는다 — 세션 메모리뿐', () => {
    expect(src).not.toMatch(/localStorage|indexedDB|wmLearnPut/);
  });
  test('글자 내용을 담지 않는다', () => {
    expect(src).not.toMatch(/\.text\b|textContent/);
  });
});

describe('[STAGE D] 단계적 노출 — 원장 단위로 고정', () => {
  test('기본은 0% — 아무에게도 안 켜진다', () => {
    expect(planSrc).toMatch(/var ROLLOUT_PCT = 0;/);
  });

  test('같은 원장은 늘 같은 결과 (세션마다 흔들리면 기능 없느니만 못하다)', () => {
    const EP = loadPlan({ last_user_id: 'u-12345' });
    global.window = undefined;
    const a = EP.rolloutInfo().bucket;
    const b = EP.rolloutInfo().bucket;
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(100);
  });

  test('로그인 전에는 켜지 않는다 — 로그인 시점에 결과가 바뀌면 고정이 깨진다', () => {
    const EP = loadPlan({});
    expect(EP.rolloutInfo().hasTenant).toBe(false);
    expect(EP.rolloutInfo().on).toBe(false);
  });

  test('버킷이 고르게 퍼진다 (한쪽으로 쏠리면 10% 가 10% 가 아니다)', () => {
    const buckets = [];
    for (let i = 0; i < 500; i++) {
      const EP = loadPlan({ last_user_id: 'user-' + i });
      buckets.push(EP.rolloutInfo().bucket);
    }
    const under10 = buckets.filter((b) => b < 10).length;
    // 500명 중 10% ≈ 50명. 25~80 이면 충분히 고르다(해시가 편향되지 않았다).
    expect(under10).toBeGreaterThan(25);
    expect(under10).toBeLessThan(80);
  });
});
