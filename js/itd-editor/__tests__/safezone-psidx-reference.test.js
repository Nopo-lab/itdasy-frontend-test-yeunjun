/* [P1 2026-09-10] `_applySafeZone` 이 **한 번도 동작한 적이 없었다** — ReferenceError.
 *
 * 라이브 콘솔 실측 (build 20260909-2330-924b7e1, 편집기를 열 때마다):
 *   itd-editor.js:1307  ReferenceError: _psIdx is not defined
 *
 * `_psIdx` 는 **다른 함수**(`_applyPlanSafety`)의 지역변수인데
 * `_applySafeZone` 의 비동기 콜백에서 참조하고 있었다.
 * `.then` 안이라 앱은 안 죽고 **이 기능만 조용히 죽는다** —
 * 얼굴/피사체 위에 얹힌 자동배치 텍스트를 비켜놓는 동작이 한 번도 실행되지 않았다.
 * (테스트는 통과하는데 코드는 안 도는, 이 레포에서 반복된 패턴.)
 *
 * 고치면서 형제 함수의 계약을 그대로 가져왔다 — 비동기 결과는 **자기 세대**
 * (세션 토큰 + 장 번호)일 때만 쓴다. 안 그러면 1번 장 판단이 3번 장에 얹힌다.
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'itd-editor.js'), 'utf8');

function cut(name) {
  const i = SRC.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('함수를 못 찾음: ' + name);
  let d = 0;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (d === 0) return SRC.slice(i, k + 1); }
  }
  throw new Error('중괄호가 안 닫힘: ' + name);
}

/** `_applySafeZone` 을 실제로 실행해 본다(의존물은 전부 스텁). */
function runSafeZone({ box, adjSelAtResolve, swapSession }) {
  const calls = [];
  const mkSession = () => ({
    adjSel: 0, photoUrl: 'data:image/jpeg;base64,xxx',
    layout: { kind: 'single' },
    layers: [{ type: 'text', role: 'title', y: 0,
      // box(y 0.1~0.6 → 60~360px)와 **세로로 겹치게** 둔다 — 안 겹치면 비켜놓을 이유가 없다
      el: { getBoundingClientRect: () => ({ top: 100, bottom: 200 }) } }],
    _photoState: {},
  });
  const ctx = { setS: null };
  const first = mkSession();

  const stubWindow = { ItdSafeZone: { avoidBox: () => ({
    then(fn) {
      // 비동기 결과가 도착하는 순간의 상태를 흉내낸다
      if (adjSelAtResolve != null) first.adjSel = adjSelAtResolve;
      if (swapSession) ctx.setS(mkSession());
      try { fn(box); calls.push('callbackOk'); }
      catch (e) { calls.push('THREW ' + e.name + ': ' + e.message); }
      return { catch() {} };
    },
  }) } };

  // eslint-disable-next-line no-new-func
  const make = new Function('ctx', 'first', 'calls', 'stubWindow',
    '"use strict";' +
    'let S = first;' +
    'ctx.setS = function (v) { S = v; };' +
    'const window = stubWindow;' +
    'const refs = { stage: { getBoundingClientRect: () => ({ top: 0, height: 600 }) } };' +
    'function _ps(i) { const k = String(i == null ? (S.adjSel || 0) : i);' +
    '  if (!S._photoState[k]) S._photoState[k] = { planApplied: false, safeApplied: false, moved: false };' +
    '  return S._photoState[k]; }' +
    'function _deOverlapIncoming() { calls.push("deOverlap"); }' +
    'function applyXf() {}' +
    cut('_applySafeZone') +
    ' return _applySafeZone;');
  make(ctx, first, calls, stubWindow)();
  return calls;
}

describe('_applySafeZone — 조용히 죽지 않는다', () => {
  test('🔑 콜백이 ReferenceError 로 죽지 않는다 (실측 사고 재현 방지)', () => {
    const calls = runSafeZone({ box: { y: 0.1, h: 0.5 } });
    const threw = calls.find((c) => String(c).startsWith('THREW'));
    expect(threw).toBeUndefined();
    expect(calls).toContain('callbackOk');
  });

  test('box 가 없으면 아무것도 안 한다', () => {
    const calls = runSafeZone({ box: null });
    expect(calls).not.toContain('deOverlap');
    expect(calls.find((c) => String(c).startsWith('THREW'))).toBeUndefined();
  });

  test('소스에 `_psIdx` 를 정의 없이 쓰는 자리가 없다', () => {
    const body = cut('_applySafeZone');
    if (body.includes('_psIdx')) {
      expect(body).toMatch(/var\s+_psIdx\s*=/);   // 쓰려면 이 함수 안에서 정의돼 있어야 한다
    }
  });
});

describe('_applySafeZone — 비동기 결과는 자기 세대일 때만 쓴다 (형제 계약)', () => {
  test('계산 도중 다른 장으로 넘어가면 얹지 않는다', () => {
    const calls = runSafeZone({ box: { y: 0.1, h: 0.5 }, adjSelAtResolve: 2 });
    expect(calls).not.toContain('deOverlap');
  });

  test('계산 도중 세션이 바뀌면 얹지 않는다', () => {
    const calls = runSafeZone({ box: { y: 0.1, h: 0.5 }, swapSession: true });
    expect(calls).not.toContain('deOverlap');
  });

  test('같은 세대면 정상적으로 비켜놓는다', () => {
    const calls = runSafeZone({ box: { y: 0.1, h: 0.5 } });
    expect(calls).toContain('deOverlap');
  });
});
