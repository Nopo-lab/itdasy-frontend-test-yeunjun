/* [출고 감사] `textAnchor` 는 **힌트**지 무조건 이동 지시가 아니다 — 계약으로 고정.
 *
 * 실제 캡처 검증에서 "계산은 되는데 소비처가 없다" 로 잡힌 항목이다.
 * 그게 버그가 아니라 **의도**라면, 의도를 코드와 테스트에 남겨야 한다.
 * 안 그러면 다음 사람이 "안 쓰이네?" 하고 무조건 이동시키는 코드를 붙인다.
 *
 * 계약:
 *   textAnchor        = 어디가 좋은지에 대한 **선호**
 *   실제 위치 변경     = Safety 가 필요하다고 판정할 때만
 *   개인화가 만든 선호  = 가독성·중앙경계·텍스트과잉 규칙을 못 이긴다
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const planSrc = fs.readFileSync(path.join(ROOT, 'js/photo/edit-plan.js'), 'utf8');
const edSrc = fs.readFileSync(path.join(ROOT, 'js/itd-editor/itd-editor.js'), 'utf8');

function loadPlan() {
  const win = {};
  new Function('window', planSrc)(win);
  return win.EditPlan;
}

describe('[계약 A] textAnchor 는 계산돼도 그것만으로 글자를 옮기지 않는다', () => {
  test('편집기 어디에도 textAnchor 로 좌표를 바꾸는 코드가 없다', () => {
    // 있으면 "힌트" 계약이 깨진 것이다.
    expect(edSrc).not.toMatch(/textAnchor/);
  });

  test('위치를 바꾸는 곳은 Safety 패스뿐이다', () => {
    const moves = [...edSrc.matchAll(/L\.x \+=|L\.y \+=/g)];
    expect(moves.length).toBeGreaterThan(0);
    // 그 이동은 전부 Safety 패스 안에 있다
    const i = edSrc.indexOf('function _planSafetyPass');
    const j = edSrc.indexOf('\n  }', edSrc.indexOf('if (moved)', i));
    const seg = edSrc.slice(i, j);
    expect(seg).toMatch(/L\.x \+=/);
    expect(seg).toMatch(/L\.y \+=/);
  });

  test('SCOPE.anchor 는 켜져 있지만 "선호만 계산" 이라고 적혀 있다', () => {
    expect(loadPlan().SCOPE.anchor).toBe(true);
    expect(planSrc).toMatch(/배치 \*\*선호\*\*만 계산한다/);
  });
});

describe('[계약 B] Safety 가 필요하다고 하면 실제로 옮긴다', () => {
  test('Safety 는 의미 있게 나아질 때만 옮긴다 (improveDelta)', () => {
    expect(edSrc).toMatch(/window\.SafetyShadow\.TH\.improveDelta/);
  });

  test('저신뢰·회전 레이어는 안 옮긴다', () => {
    expect(edSrc).toMatch(/if \(!det\.verdictReliable\) return;/);
    expect(edSrc).toMatch(/if \(!info\.unsafe \|\| !info\.geometryReliable\) return;/);
  });

  test('원장이 이미 만졌으면 안 옮긴다 — **그 장에 한해서**', () => {
    /* [2026-08-23] 세션 전역 `S._userMoved` 에서 장별 `_ps(i).moved` 로 바뀌었다.
       전역이면 1번 장에서 손댄 순간 3·4번 장 자동화까지 같이 죽는다. */
    expect(edSrc).toMatch(/_ps\(\)\.moved = true;/);          // 드래그 시 이 장만 표시
    expect(edSrc).toMatch(/_ps\(_psIdx\)\.moved/);            // 비동기 결과도 그 장 기준으로 확인
  });
});

describe('[계약 C] 개인화가 안전 규칙을 못 이긴다', () => {
  test('전후 중앙경계 회피는 개인화와 무관하게 Safety 후보에서 걸러진다', () => {
    expect(planSrc).toMatch(/intent\.layout\.avoidCenterSeam/);
    const i = planSrc.indexOf('avoidCenterSeam');
    const seg = planSrc.slice(Math.max(0, i - 600), i + 600);
    expect(seg).not.toMatch(/person(alization)?\./);   // 개인화가 이 판단에 안 끼어든다
  });

  test('개인화 블록은 textAnchor 를 **지우기만** 한다 (새로 만들지 않는다)', () => {
    const i = planSrc.indexOf('── [STAGE E] 개인화');
    const seg = planSrc.slice(i, planSrc.indexOf('plan.hasAnything', i));
    expect(seg).toMatch(/plan\.textAnchor = null;/);
    expect(seg).not.toMatch(/plan\.textAnchor = _axis/);
  });

  test('가독성 축(색·외곽선·그림자)은 개인화 대상이 아니다', () => {
    const i = planSrc.indexOf('── [STAGE E] 개인화');
    const seg = planSrc.slice(i, planSrc.indexOf('plan.hasAnything', i));
    expect(seg).not.toMatch(/stroke|shadow/);
    expect(seg).not.toMatch(/plan\.typography\.color\s*=/);
  });

  test('텍스트 과잉 억제(canAddText)는 개인화보다 앞이다', () => {
    const flow = fs.readFileSync(path.join(ROOT, 'js/workspace/workspace-v2-flow.js'), 'utf8');
    expect(flow).toMatch(/canAddText === false/);
    // 그 판단은 EditPlan 계산 전에, 레이어를 만들기 전에 일어난다
    const i = flow.indexOf('canAddText === false');
    expect(flow.slice(Math.max(0, i - 900), i)).toMatch(/ContentIntent\.peek/);
  });
});
