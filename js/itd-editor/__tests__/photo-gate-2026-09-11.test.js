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
/* 🔴 주석을 반드시 걷어낸다.
   이 파일의 설명 주석에 `_flushEditingText()` 같은 **함수 이름이 그대로 적혀 있어서**,
   주석만 보고 통과하는 가드가 됐다(실제로 호출을 지워도 14/14 초록이었다).
   테스트가 초록인데 아무것도 안 보는 상태가 제일 위험하다. */
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const fn = (name) => {
  const i = ed.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('함수를 못 찾았다: ' + name);
  const j = ed.indexOf('\n  function ', i + 10);
  return strip(ed.slice(i, j < 0 ? i + 4000 : j));
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

describe('🔴 삭제를 되돌리면 레이어가 원래 자리로 돌아온다', () => {
  /* 모델(S.layers)은 op.idx 로 제자리에 되돌리는데 DOM 은 항상 맨 뒤에 붙이고 있었다.
     굽기는 모델 순서로 그리므로 **화면에선 맨 위인데 발행본에선 원래 자리**로 나갔다.
     실측: 겹친 A·B·C 에서 B 삭제 → ↩ → 화면 맨 위 BBBB / 발행본 맨 위 CCCC. */
  test('DOM 을 appendChild 가 아니라 모델과 같은 자리에 끼워 넣는다', () => {
    const i = ed.indexOf("var add = (op.op === 'add') !== undo;");
    expect(i).toBeGreaterThan(0);
    const seg = ed.slice(i, i + 1400);
    expect(seg).toContain('insertBefore(op.L.el');
    expect(seg).toMatch(/var ref = S\.layers\[at \+ 1\]/);
  });
  test('모델 삽입 자리와 DOM 삽입 자리가 같은 at 을 쓴다', () => {
    const i = ed.indexOf("var add = (op.op === 'add') !== undo;");
    const seg = ed.slice(i, i + 1400);
    expect(seg).toMatch(/var at = \(op\.idx != null[\s\S]{0,120}S\.layers\.splice\(at, 0, op\.L\)/);
  });
  test('삭제가 위치(idx)를 기록한다 — 없으면 되돌릴 자리를 모른다', () => {
    expect(fn('removeLayer')).toMatch(/_pushOp\(\{ op: 'del', L: L, idx: i \}\)/);
  });
});

describe('🔴 치던 글자가 사진 전환·저장에서 사라지지 않는다', () => {
  /* `_serLayer` 는 모델(L.text)을 읽는데, contenteditable 로 입력 중인 내용은 blur 전까지
     모델에 안 들어간다. 원장이 사진1에 문구를 치다가 사진2를 눌러보고 돌아오면
     방금 친 글자가 통째로 없고 '내용을 입력하세요' 로 돌아와 있었다.
     실측: 'REALTYPED' 입력(편집 모드 유지) → 썸네일로 2번 → 1번 복귀 → 플레이스홀더.
     `_flushEditingText()` 는 이미 있었지만 **2초 초안 타이머만** 불렀다. */
  test.each(['_switchPhotoLayers', '_collectPerPhoto', '_exportState'])(
    '%s 가 직렬화 전에 _flushEditingText 를 부른다', (f) => {
      expect(fn(f)).toContain('_flushEditingText()');
    });
  test('flush 는 편집 중(contenteditable=true)인 레이어만 건드린다', () => {
    const b = fn('_flushEditingText');
    expect(b).toMatch(/getAttribute\('contenteditable'\) !== 'true'/);
    expect(b).toMatch(/L\.text = _t/);
  });
});
