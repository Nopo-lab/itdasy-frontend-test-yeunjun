/**
 * [2026-09-13 ZERO-HELP] 스티커·글자의 크기(⤡)·회전(↺)·핀치가 되돌리기에 안 남던 것.
 *
 * 실측(iPhone 시뮬레이터 · 네일 사진):
 *   스티커를 ≈12pt 로 줄임 → 가운데를 끌어 옮기려다 옆 ⤡ 핸들을 잡아 ≈190pt 로 커짐
 *   → ↩ 1회 → **스티커가 통째로 사라짐** (크기 변경이 기록에 없어 앞선 '추가'가 취소됨)
 *   → ↷ → 190pt 로만 돌아옴. 작은 스티커로 돌아갈 길이 없다.
 *
 * 기록되던 것: move · 도형 resize · wrap. 빠진 것: 비도형 ⤡ · ↺ · 핀치.
 */
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'itd-editor.js'), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
const C = strip(SRC);

function cleanupBody() {
  const i = C.indexOf('function cleanupLayerPointer(e)');
  expect(i).toBeGreaterThan(0);
  const j = C.indexOf('\n  function ', i + 40);
  return C.slice(i, j > 0 ? j : i + 6000);
}

describe('되돌리기 — 크기·회전 기록 (2026-09-13)', () => {
  test('xf 연산을 기록하는 헬퍼가 있고, 실제로 바뀌었을 때만 남긴다', () => {
    expect(C).toMatch(/function _pushXf\(L, s0, r0\)/);
    const i = C.indexOf('function _pushXf(L, s0, r0)');
    const body = C.slice(i, i + 500);
    // 탭만 하면 안 남긴다 — 변화 없으면 return
    expect(body).toMatch(/if \(s1 === \(s0 \|\| 1\) && r1 === \(r0 \|\| 0\)\) return;/);
    expect(body).toMatch(/_pushOp\(\{ op: 'xf', L: L, before: \{ scale: s0 \|\| 1, rot: r0 \|\| 0 \}, after: \{ scale: s1, rot: r1 \} \}\)/);
  });

  test('⤡ 크기 조절(도형 제외)이 끝날 때 기록한다', () => {
    expect(cleanupBody()).toMatch(/if \(rsd && !rsd\.shape\) _pushXf\(rsd\.L, rsd\.s0, rsd\.r0\);/);
    // 시작 시점 회전값을 잡아둬야 한다(안 잡으면 before.rot 이 0 으로 틀어진다)
    expect(C).toMatch(/rsd = \{[^}]*s0: \(L\.scale \|\| 1\), r0: \(L\.rot \|\| 0\),/);
  });

  test('↺ 회전이 끝날 때 기록한다', () => {
    expect(cleanupBody()).toMatch(/if \(rotd\) _pushXf\(rotd\.L, rotd\.s0, rotd\.start\);/);
    expect(C).toMatch(/rotd = \{[^}]*start: \(L\.rot \|\| 0\), s0: \(L\.scale \|\| 1\),/);
  });

  test('두 손가락 핀치가 끝날 때 기록한다(lpinch 를 비우기 **전에**)', () => {
    const body = cleanupBody();
    const push = body.indexOf('if (_pl) _pushXf(_pl, lpinch.s0, lpinch.r0);');
    const nul = body.indexOf('lpinch = null;');
    expect(push).toBeGreaterThan(0);
    expect(nul).toBeGreaterThan(push);
  });

  test('기록은 rsd/rotd 를 비우기 **전에** 한다', () => {
    const body = cleanupBody();
    const a = body.indexOf('_pushXf(rsd.L');
    const b = body.indexOf('_pushXf(rotd.L');
    const z = body.indexOf('rotd = null; rsd = null; wd = null;');
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    expect(z).toBeGreaterThan(a);
    expect(z).toBeGreaterThan(b);
  });

  test('되돌리기가 xf 를 적용한다 — scale·rot 복원 + 글자 크기 슬라이더 동기화', () => {
    const i = C.indexOf("if (op.op === 'xf')");
    expect(i).toBeGreaterThan(0);
    const body = C.slice(i, i + 400);
    expect(body).toMatch(/var xf = undo \? op\.before : op\.after;/);
    expect(body).toMatch(/op\.L\.scale = xf\.scale; op\.L\.rot = xf\.rot; applyXf\(op\.L\);/);
    expect(body).toMatch(/if \(op\.L\.type === 'text' && refs\.size\) refs\.size\.value = op\.L\.scale;/);
  });

  test('도형 늘리기(resize)는 기존 경로 그대로 — 이중 기록하지 않는다', () => {
    const body = cleanupBody();
    expect(body).toMatch(/if \(rsd && rsd\.shape && rsd\.before && \(rsd\.L\.w !== rsd\.before\.w \|\| rsd\.L\.h !== rsd\.before\.h\)\)/);
    expect(body).toMatch(/if \(rsd && !rsd\.shape\)/);
  });
});

describe('되돌리기 — 도형 색·채움·굵기 기록 (2026-09-13)', () => {
  // 실측: 분홍 화살표 → 검정 → ↩ 1회 → 화살표가 통째로 사라짐(색이 아니라).
  test('applyShapeStyle 이 바뀐 스타일을 기록한다', () => {
    const i = C.indexOf('function applyShapeStyle(defer)');
    expect(i).toBeGreaterThan(0);
    const body = C.slice(i, i + 600);
    expect(body).toMatch(/var _b = _shapeStyleOf\(L\);/);
    expect(body).toMatch(/_pushShapeStyle\(L, _b\);/);
    // 기록은 스타일을 **적용한 뒤** 비교해야 한다
    expect(body.indexOf('styleShape(L.tx, L);')).toBeLessThan(body.indexOf('_pushShapeStyle(L, _b);'));
  });

  test('변화가 없으면 쌓지 않는다(같은 색을 다시 눌러도 ↩ 가 헛돌지 않게)', () => {
    const i = C.indexOf('function _pushShapeStyle(L, before)');
    const body = C.slice(i, i + 400);
    expect(body).toMatch(/if \(after\.color === before\.color && after\.fill === before\.fill && after\.strokeW === before\.strokeW\) return;/);
  });

  test('굵기 슬라이더는 연속 input 을 쌓지 않고, 손을 뗄 때(change) 한 번만 남긴다', () => {
    expect(C).toMatch(/refs\.shapeThick\.addEventListener\('input', function \(\) \{ S\.shapeThick = \+refs\.shapeThick\.value; applyShapeStyle\(true\); \}\);/);
    expect(C).toMatch(/refs\.shapeThick\.addEventListener\('change', function \(\) \{ if \(_shapeSnap\) \{ _pushShapeStyle\(_shapeSnap\.L, _shapeSnap\.v\); _shapeSnap = null; \} \}\);/);
    const i = C.indexOf('function applyShapeStyle(defer)');
    expect(C.slice(i, i + 600)).toMatch(/if \(defer\) \{ if \(!_shapeSnap \|\| _shapeSnap\.L !== L\) _shapeSnap = \{ L: L, v: _b \}; return; \}/);
  });

  test('되돌리기가 도형 스타일을 다시 그린다', () => {
    const i = C.indexOf("if (op.op === 'shapestyle')");
    expect(i).toBeGreaterThan(0);
    const body = C.slice(i, i + 400);
    expect(body).toMatch(/var sv = undo \? op\.before : op\.after;/);
    expect(body).toMatch(/op\.L\.color = sv\.color; op\.L\.fill = sv\.fill; op\.L\.strokeW = sv\.strokeW; styleShape\(op\.L\.tx, op\.L\);/);
  });
});

describe('되돌리기 — 순서·사진 채우기·붓질 기록 (2026-09-13)', () => {
  // 실측(Chrome 402×684 실엔진): 세 조작 모두 ↩ 가 그 조작을 건너뛰고 **엉뚱한 글자를 지웠다.**
  //   순서 맨뒤로 → ↩ → 레이어 2→1 · 채우기 → ↩ → 1→0 · 붓질 → ↩ → 붓질 그대로 + 글자 삭제.
  test('레이어 순서 변경을 기록하고, 되돌리면 원래 자리로 옮긴다', () => {
    const i = C.indexOf('function reorderLayer(L, dir)');
    const body = C.slice(i, i + 700);
    expect(body).toMatch(/_placeLayerAt\(L, to\);\s*_pushOp\(\{ op: 'order', L: L, from: i, to: to \}\);/);
    const j = C.indexOf("if (op.op === 'order')");
    expect(j).toBeGreaterThan(0);
    expect(C.slice(j, j + 200)).toMatch(/_placeLayerAt\(op\.L, undo \? op\.from : op\.to\)/);
  });

  test('순서 변경은 배열과 DOM 을 함께 옮긴다(하나만 옮기면 화면≠발행본)', () => {
    const i = C.indexOf('function _placeLayerAt(L, to)');
    const body = C.slice(i, i + 500);
    expect(body).toMatch(/S\.layers\.splice\(i, 1\); S\.layers\.splice\(/);
    expect(body).toMatch(/refs\.layers\.appendChild\(x\.el\)/);
  });

  test('사진 채우기 토글을 기록한다(바뀌었을 때만)', () => {
    expect(C).toMatch(/var _fb = S\.fitMode; S\.fitMode = ft\.getAttribute\('data-fit'\);[\s\S]{0,260}applyFit\(\); if \(_fb !== S\.fitMode\) _pushOp\(\{ op: 'fit', before: _fb, after: S\.fitMode \}\);/);
    const j = C.indexOf("if (op.op === 'fit')");
    expect(C.slice(j, j + 220)).toMatch(/S\.fitMode = undo \? op\.before : op\.after;[\s\S]{0,80}_syncFitToggle\(\); applyFit\(\);/);
  });

  test('붓질은 획 시작 전 비트맵을 잡고, 획이 끝나면 한 번 남긴다', () => {
    const d = C.indexOf('function drawDown(e)');
    expect(C.slice(d, d + 200)).toMatch(/_drawBefore = _drawSnap\(\);/);
    const u = C.indexOf('function drawUp()');
    const ub = C.slice(u, u + 500);
    expect(ub).toMatch(/var wasStroke = !!dpos;/);
    expect(ub).toMatch(/if \(wasStroke && _drawBefore !== undefined\)/);
    expect(ub).toMatch(/_pushOp\(\{ op: 'draw', idx: \(S\.adjSel != null \? S\.adjSel : 0\), before: _drawBefore, after: _after \}\);/);
    expect(ub).toMatch(/_drawBefore = undefined;/);
  });

  test('전체 지우기도 되돌릴 수 있다', () => {
    expect(C).toMatch(/var _cb = _drawSnap\(\); refs\.ctx\.clearRect[\s\S]{0,240}if \(_cb\) _pushOp\(\{ op: 'draw', idx: \(S\.adjSel != null \? S\.adjSel : 0\), before: _cb, after: null \}\);/);
  });

  test('붓질 되돌리기는 그 장의 비트맵을 복원하고, 보고 있는 장일 때만 캔버스를 다시 칠한다', () => {
    const j = C.indexOf("if (op.op === 'draw')");
    const body = C.slice(j, j + 450);
    expect(body).toMatch(/var dv = undo \? op\.before : op\.after;/);
    expect(body).toMatch(/if \(dv\) S\.photoDraw\[op\.idx\] = dv; else delete S\.photoDraw\[op\.idx\];/);
    expect(body).toMatch(/if \(op\.idx === \(S\.adjSel != null \? S\.adjSel : 0\)\) \{ _paintDraw\(dv\); S\._drawInk = !!dv; \}/);
  });
});
