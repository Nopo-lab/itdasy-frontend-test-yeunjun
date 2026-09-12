/**
 * @jest-environment jsdom
 *
 * §8 요청 폭풍 회귀 — `/services` 가 계속 실패해도 요청이 **유한**해야 한다.
 *
 * 과거 실사고: `loadServiceTemplates()` 는 실패해도 예외를 안 던지고 `[]` 를 돌려준다.
 * 그래서 429 로 실패해도 `.then()` 이 돌고, 캐시는 여전히 비어 있으니 같은 분기가 또 타서
 * **스스로를 무한히 다시 부른다**(실측 570 req / 10초 → 전부 429).
 * 모달을 닫아도 멈추지 않고 새로고침해야 멎었다. `.catch()` 는 애초에 불릴 일이 없었다.
 *
 * 이 테스트는 문자열을 보지 않는다 — **실제 재시도 분기를 떼어 반복 실행**하고
 * 호출 횟수를 센다.
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app-revenue.js'), 'utf8');

/** `_renderServiceChips` 안의 재시도 분기를 그대로 떼어낸다. */
function loadRetryBranch() {
  const start = SRC.indexOf('    if (!list.length && !modal._rfSvcRetried');
  expect(start).toBeGreaterThan(-1);
  let d = 0, started = false, end = -1;
  for (let k = start; k < SRC.length; k++) {
    const c = SRC[k];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) { end = k + 1; break; } }
  }
  const body = SRC.slice(start, end);
  // eslint-disable-next-line no-new-func
  return new Function('list', 'modal', 'ctx', 'hooks', 'window', '_renderServiceChips', body);
}

/** 실패가 계속되는 상황을 실제로 돌린다: 재렌더 → 재시도 분기 → 실패 → 재렌더 … */
function runStorm({ maxTicks = 200 } = {}) {
  const branch = loadRetryBranch();
  const modal = {};
  let calls = 0;
  let renders = 0;
  const pending = [];

  const win = {
    // 실패해도 예외를 던지지 않고 빈 배열을 돌려준다 — 사고 당시와 똑같은 계약
    loadServiceTemplates: () => {
      calls += 1;
      return { then: (fn) => { pending.push(fn); return { catch: () => {} }; } };
    },
  };
  const render = () => {
    renders += 1;
    if (renders > maxTicks) throw new Error('무한 루프');
    branch([], modal, null, null, win, render);
  };

  render();                       // 최초 렌더
  let guard = 0;
  while (pending.length && guard++ < maxTicks) pending.shift()();   // 실패 응답 도착
  return { calls, renders };
}

describe('§8 · /services 가 계속 실패해도 요청은 유한하다', () => {
  test('🔴 무한 재귀가 없다 (570 req/10s 사고 회귀)', () => {
    expect(() => runStorm()).not.toThrow();
  });

  test('재시도는 1회로 묶인다', () => {
    const { calls } = runStorm();
    expect(calls).toBe(1);
  });

  test('응답이 여러 번 늦게 도착해도 추가 요청이 안 생긴다', () => {
    const { calls, renders } = runStorm();
    expect(calls).toBeLessThanOrEqual(1);
    expect(renders).toBeLessThan(10);
  });

  test('가드는 모달 인스턴스에 붙는다 — 새 모달은 다시 한 번 시도할 수 있다', () => {
    const a = runStorm();
    const b = runStorm();
    expect(a.calls).toBe(1);
    expect(b.calls).toBe(1);
  });

  test('캐시가 차 있으면 아예 요청하지 않는다', () => {
    const branch = loadRetryBranch();
    let calls = 0;
    const win = { loadServiceTemplates: () => { calls += 1; return { then: () => ({ catch: () => {} }) }; } };
    branch([{ name: '컷' }], {}, null, null, win, () => {});
    expect(calls).toBe(0);
  });
});
