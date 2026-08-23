/* [STAGE C] 통합 EditPlan — 계약을 잠근다.
 *
 * 여기서 지키려는 건 "잘 동작하나" 보다 **"원장 것을 안 덮나"** 다.
 * 자동 초안이 원장이 고른 값을 한 번이라도 덮으면, 그 뒤로는 켜놔도 아무도 안 쓴다.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const planSrc = fs.readFileSync(path.join(ROOT, 'js/photo/edit-plan.js'), 'utf8');
const edSrc = fs.readFileSync(path.join(ROOT, 'js/itd-editor/itd-editor.js'), 'utf8');
const flowSrc = fs.readFileSync(path.join(ROOT, 'js/workspace/workspace-v2-flow.js'), 'utf8');

function loadPlan() {
  const win = {};
  new Function('window', planSrc)(win);
  return win.EditPlan;
}

describe('통합 출력 형태', () => {
  const EP = loadPlan();

  test('지시된 축이 전부 형태로 존재한다 (근거 없으면 null)', () => {
    // 축이 아예 없으면 상위가 "지원 안 함"과 "근거 없음"을 구분 못 한다.
    ['crop', 'imageAdjustments', 'typography', 'textAnchor', 'stickers',
      'confidence', 'source'].forEach((k) => {
      expect(planSrc).toMatch(new RegExp('\\b' + k + ':'));
    });
  });

  test('타이포는 6축 전부 있다', () => {
    const m = /typography: \{ font: null, color: null, align: null, size: null, stroke: null, shadow: null \}/;
    expect(planSrc).toMatch(m);
  });

  test('확신도는 평균이지 최댓값이 아니다', () => {
    // 최댓값을 쓰면 센 축 하나 때문에 약한 축까지 믿게 된다.
    expect(planSrc).toMatch(/filled\.reduce/);
    expect(planSrc).not.toMatch(/Math\.max\.apply\(null, filled/);
  });

  test('되돌리기 어려운 축은 기본 OFF', () => {
    expect(EP.SCOPE.crop).toBe(false);
    expect(EP.SCOPE.adjust).toBe(false);
  });

  /* 🔴 [STAGE G] 실사고. `SCOPE.size` 가 **선언만 되고 검사되지 않아** 끄는 스위치가
     안 끄는 상태였다. 더 나쁜 건 `plan.typography.size`·`plan.textAnchor` 를 **읽는 코드는
     다 있는데 값을 넣는 코드가 없어서**, 27샵으로 교정한 sizeRatio 와 전후비교 배치 힌트가
     한 번도 안 쓰이고 있었다는 것이다. 문법도 맞고 테스트도 통과했다 — 그냥 null 이었다. */
  test('선언된 SCOPE 키는 전부 실제로 검사된다 (끄는 스위치가 꺼야 한다)', () => {
    // 소비처가 두 곳이다 — readability 는 편집기가 본다. 한쪽만 보면 오탐이 난다.
    const both = planSrc + '\n' + edSrc;
    Object.keys(EP.SCOPE).forEach((k) => {
      expect(both).toMatch(new RegExp('SCOPE\\.' + k + '\\b'));
    });
  });

  test('읽기만 하고 안 채우는 축이 없다', () => {
    ['plan.typography.size', 'plan.textAnchor'].forEach((f) => {
      const assign = new RegExp(f.replace(/\./g, '\\.') + ' = _axis\\(');
      expect(planSrc).toMatch(assign);
    });
  });

  test('자동 초안 스위치는 EditPlan 자체와 **따로** 있다', () => {
    // 계산은 켜고 적용은 끈 상태로 먼저 보고 싶다.
    expect(typeof EP.autoDraftOn).toBe('function');
    expect(EP.autoDraftOn()).toBe(false);      // 기본 OFF
  });
});

describe('🔑 기본값을 취향으로 오인하지 않는다', () => {
  test('원장이 고른 축은 고르는 순간 도장을 찍는다', () => {
    // 값으로 추측하면 틀린다 — 새 텍스트는 흰색·가운데정렬로 미리 채워져 나온다.
    expect(edSrc).toMatch(/function _own\(L, k\)/);
    ['applyFont', 'applyColor', 'applyAlign'].forEach((fn) => {
      const line = edSrc.split('\n').find((l) => l.includes('function ' + fn + '('));
      expect(line).toMatch(/_own\(L, '/);
    });
  });

  test('타이포 적용은 값이 아니라 _own 을 본다', () => {
    expect(edSrc).toMatch(/var own = L\._own \|\| \{\};/);
    expect(edSrc).toMatch(/!own\.font/);
    expect(edSrc).toMatch(/!own\.color/);
    expect(edSrc).toMatch(/!own\.align/);
    expect(edSrc).toMatch(/!own\.size/);
  });

  test('복원된 레이어는 전부 원장 소유로 본다 — 이어서 편집을 안 덮는다', () => {
    expect(edSrc).toMatch(/L2\._own = \{ font: 1, color: 1, align: 1, size: 1 \}/);
  });

  test('작업기억(wm)·역할 레이어는 계속 제외', () => {
    expect(edSrc).toMatch(/if \(L\.role\) return;/);
    expect(edSrc).toMatch(/if \(L\._src === 'wm'\) return;/);
  });
});

describe('순서 — 타이포 → 렌더 → 측정 → Safety → 가독성', () => {
  test('가독성은 Safety **다음**이다 (옮기면 배경이 바뀐다)', () => {
    const i = edSrc.indexOf('_planSafetyPass(geoms, url, alive)');
    const j = edSrc.indexOf('_planReadabilityPass(url, alive)', i);
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
  });

  /* 🔴 브라우저 실측으로 잡은 경합. 닫고 **바로** 다시 열면 이전 세션의 비동기 체인이
     아직 살아 있고, 그게 모듈 전역 `S` 를 보기 때문에 **새 세션 레이어를 건드렸다.**
     증상이 고약했다 — 외곽선이 붙었다가 사라진다(t=200 에 1px, t=900 에 0px). */
  test('이전 세션의 비동기 결과가 새 세션에 새지 않는다', () => {
    expect(edSrc).toMatch(/var mySession = S;/);
    expect(edSrc).toMatch(/S === mySession && \(S\.adjSel \|\| 0\) === _psIdx && !_ps\(_psIdx\)\.moved/);
    // 체인의 각 단계가 자기 세대인지 확인한다
    ['_planSafetyPass', '_planReadabilityPass'].forEach((fn) => {
      expect(edSrc).toMatch(new RegExp(fn + '\\(url, alive\\)|' + fn + '\\(geoms, url, alive\\)'));
    });
    expect(edSrc).toMatch(/if \(!plan \|\| !alive\(\)\) return;/);
  });

  test('geometry 는 타이포 적용 뒤에 잰다', () => {
    const i = edSrc.indexOf('var typoN = _applyPlanTypography(plan);');
    const j = edSrc.indexOf('var geoms = metaGeometry();', i);
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);          // 타이포가 먼저
  });

  test('가독성은 실제 DOM rect 로 배경을 읽는다 — 추정 box 금지', () => {
    expect(edSrc).toMatch(/_planReadabilityPass[\s\S]{0,2000}getBoundingClientRect\(\)/);
    expect(edSrc).toMatch(/window\.PhotoContext\.regionLum\(pctx, pRect\)/);
    /* 🔴 스테이지 좌표를 사진 좌표로 옮기지 않으면 엉뚱한 자리 밝기를 읽는다.
       브라우저 실측: 같은 밝은 사진이 4:5 에선 외곽선이 붙고 1:1 에선 안 붙었다.
       유닛테스트로는 못 잡았다 — 비율이 같은 합성 데이터만 넣고 있었다. */
    expect(edSrc).toMatch(/mapStageRect\(pctx, rect, R\.width \/ R\.height, S\.fitMode\)/);
  });
});

describe('최소 변경', () => {
  test('크기가 이미 비슷하면 안 건드린다', () => {
    // 매번 몇 px 씩 흔들리면 원장 눈엔 그냥 버그다.
    expect(edSrc).toMatch(/Math\.abs\(want - cur\) \/ cur > 0\.15/);
  });

  test('가독성은 고칠 게 없으면 null 을 받고 아무것도 안 한다', () => {
    expect(edSrc).toMatch(/if \(!fix\) return;/);
  });
});

describe('학습 신호 보호', () => {
  test('시스템이 얹은 값은 _src=plan 으로 표시한다', () => {
    const hits = edSrc.match(/L\._src = L\._src \|\| 'plan'/g) || [];
    expect(hits.length).toBeGreaterThanOrEqual(3);   // 타이포·Safety·가독성
  });

  test('WMSignals 를 쏘는 applyFont/Color/Align 을 자동 초안이 쓰지 않는다', () => {
    const i = edSrc.indexOf('function _applyPlanTypography');
    const j = edSrc.indexOf('function _planReadabilityPass');
    const body = edSrc.slice(i, j);
    expect(body).not.toMatch(/\bapplyFont\(|\bapplyColor\(|\bapplyAlign\(/);
  });
});

describe('ContentIntent 연결 — 후기 캡처엔 글자를 더 안 얹는다', () => {
  test('레이어를 만들기 전에 동기로 물어본다', () => {
    expect(flowSrc).toMatch(/window\.ContentIntent\.peek\(photo\)/);
    expect(flowSrc).toMatch(/canAddText === false/);
  });

  test('판정이 안 데워졌으면 기다리지 않는다 — 기존 동작으로', () => {
    // 편집기 여는 걸 늦추느니 기존 동작이 낫다.
    expect(flowSrc).not.toMatch(/ContentIntent\.warm\(photo\)\.then\(function[\s\S]{0,120}Editor\.open/);
  });

  test('이어서 편집(_restore)일 땐 텍스트를 빼지 않는다', () => {
    expect(flowSrc).toMatch(/autoDraftOn\(\) &&\s*\n?\s*window\.ContentIntent && !_restore/);
  });

  test('자동 초안이 꺼져 있으면 레이어를 안 건드린다', () => {
    const i = flowSrc.indexOf('window.EditPlan.autoDraftOn()');
    const seg = flowSrc.slice(i, i + 900);
    expect(seg).toMatch(/\} else if \(window\.ContentIntent && window\.ContentIntent\.warm\)/);
  });
});
