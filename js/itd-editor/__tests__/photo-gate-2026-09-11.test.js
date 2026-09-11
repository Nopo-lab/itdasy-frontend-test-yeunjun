/* [2026-09-11] PHOTO EDITOR FINAL GATE — 사진 보정(adjust) 회귀 가드.
 *
 * 🔴 잡은 결함: 재편집하면 **화면엔 보정이 안 걸리는데 발행본에는 걸려 나갔다.**
 *   `_restoreState` 가 S.adj(밝기·대비·채도·온도·선명도·수평)를 되살리는데,
 *   그걸 화면에 거는 applyAdjToDisplay/applyStraighten 을 아무도 안 불렀다.
 *   슬라이더는 보정 패널을 열 때 renderAdjust() 가 맞춰주니 "+30 이라고 적혀 있는데
 *   큰 사진은 그대로" 였고, 원장은 보정이 안 된 줄 알고 또 올리게 된다.
 *   실측(스테이지 533×666): 저장→재편집 시 stage photo filter=none, 회색패치 64(원본),
 *   발행본 74(보정). 필터가 걸린 요소는 보정 패널 썸네일 하나뿐이었다.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const ed = fs.readFileSync(path.join(ROOT, 'itd-editor/itd-editor.js'), 'utf8');
const fn = (name) => {
  const i = ed.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('함수를 못 찾았다: ' + name);
  const j = ed.indexOf('\n  function ', i + 10);
  return ed.slice(i, j < 0 ? i + 4000 : j);
};

describe('🔴 재편집 시 사진 보정이 화면에 반영된다', () => {
  test('복원 렌더가 applyAdjToDisplay 를 부른다', () => {
    expect(fn('_applyRestore')).toContain('applyAdjToDisplay()');
  });
  test('복원 렌더가 applyStraighten(수평)도 부른다', () => {
    expect(fn('_applyRestore')).toContain('applyStraighten()');
  });
  test('_restoreState 는 S.adj 를 되살린다 (값 자체는 살아 있어야 한다)', () => {
    expect(fn('_restoreState')).toMatch(/S\.adj = st\.adj\.map/);
  });
});

describe('보정 값이 화면·굽기 양쪽에서 같은 함수로 만들어진다', () => {
  /* 화면은 filterStr(...) 로 CSS filter 를 만들고, 굽기는 WorkspaceAdapter 가 같은 adjust 객체를 받는다.
     여기서 갈라지면 "화면은 밝은데 발행본은 어둡다" 가 된다. */
  test('화면 필터는 filterStr 하나로만 만든다', () => {
    expect(fn('_syncSingleFx')).toContain('filterStr(');
    expect(fn('applyAdjToDisplay')).toContain('filterStr(');
  });
  /* 굽기도 **같은 filterStr(adjOf(i))** 를 canvas filter 로 쓴다. 이게 SSOT 라서
     밝기·대비·채도·온도가 화면과 픽셀까지 일치했다(실측: 회색 64→89 = ×1.4 정확).
     한쪽에 숫자를 따로 적기 시작하면 그 순간 갈라진다. */
  test('굽기도 filterStr(adjOf(...)) 를 canvas filter 로 쓴다', () => {
    const i = ed.indexOf('function exportComposite');
    expect(i).toBeGreaterThan(0);
    const seg = ed.slice(i, i + 6000);
    expect(seg).toMatch(/filterStr\(adjOf\(/);
    expect(seg).toMatch(/\.filter = _sFlt|\.filter = flt/);
  });
});

describe('보정 되돌리기 (BUG-03 계약 유지)', () => {
  test('adj op 가 되돌릴 때 화면·슬라이더·썸네일을 모두 다시 그린다', () => {
    const i = ed.indexOf("if (op.op === 'adj')");
    expect(i).toBeGreaterThan(0);
    const seg = ed.slice(i, i + 400);
    expect(seg).toContain('syncAdjSliders()');
    expect(seg).toContain('applyAdjToDisplay()');
    expect(seg).toContain('applyStraighten()');
    expect(seg).toContain('renderAdjust()');
  });
});

describe('초기화', () => {
  test('보정 초기화가 되돌리기 스택에 쌓인다 (되돌릴 수 있어야 한다)', () => {
    const i = ed.indexOf('refs.adjReset.addEventListener');
    expect(i).toBeGreaterThan(0);
    expect(ed.slice(i, i + 400)).toMatch(/_pushAdj|_pushOp/);
  });
});
