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
