/* 예약 저장 연타 — 가드는 **진입 즉시** 잠가야 한다.
 *
 * 실측 (2026-09-02, 배포본 cf12c38 · 실계정 · PC):
 *   저장 3연타 → POST 1회 + unhandled rejection 2건
 *   수정 2연타 → PATCH 1회 + unhandled rejection 1건
 *   스택: app-calendar-view.js `const d = body.querySelector('#bfDate').value`
 *         → TypeError: Cannot read properties of null (reading 'value')
 *
 * 원인: `_saving = true` 가 **첫 await 뒤**에 있었다.
 *   2·3번째 클릭이 `if (_saving) return` 을 그냥 통과 → 이미 사라진 폼을 읽고 터졌다.
 *   중복 예약이 안 생긴 건 가드가 막아서가 아니라 **크래시가 막은 것**이다.
 *   폼이 아직 살아 있는 타이밍이면 진짜 이중 예약이 만들어진다. (Sentry 에도 계속 쌓였다)
 *
 * 여기서 잠그는 것:
 *   ① `_saving = true` 가 핸들러의 **첫 await 보다 앞**에 있다
 *   ② 조기 종료 경로가 전부 잠금을 되돌린다(_bail) — 안 그러면 한 번 실패 후 영영 저장 불가
 *   ③ 폼이 사라진 경우를 null 로 방어한다
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app-calendar-view.js'), 'utf8');

/** #bfSave click 핸들러 본문만 잘라낸다 */
function saveHandler() {
  const start = SRC.indexOf("body.querySelector('#bfSave').addEventListener('click'");
  expect(start).toBeGreaterThan(-1);
  // 다음 함수 정의 전까지
  const end = SRC.indexOf('function _bindFormActions', start);
  expect(end).toBeGreaterThan(start);
  return SRC.slice(start, end);
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('연타 가드 위치', () => {
  const body = stripComments(saveHandler());

  test('_saving = true 가 첫 await 보다 앞에 있다', () => {
    const lock = body.indexOf('_saving = true');
    const firstAwait = body.indexOf('await ');
    expect(lock).toBeGreaterThan(-1);
    expect(firstAwait).toBeGreaterThan(-1);
    // 이게 뒤집히면 연타가 가드를 통과한다 — 이번 버그 그 자체
    expect(lock).toBeLessThan(firstAwait);
  });

  test('가드 확인(if (_saving) return) 직후에 잠근다', () => {
    const guard = body.indexOf('if (_saving) return');
    const lock = body.indexOf('_saving = true');
    expect(guard).toBeGreaterThan(-1);
    expect(lock).toBeGreaterThan(guard);
    // 사이에 await 이 끼면 안 된다
    expect(body.slice(guard, lock)).not.toMatch(/await\s/);
  });

  test('폼이 사라진 경우를 null 로 방어한다 (#bfDate)', () => {
    // 예전: body.querySelector('#bfDate').value  ← 바로 .value
    expect(body).not.toMatch(/querySelector\('#bfDate'\)\.value/);
    expect(body).toMatch(/_dateEl/);
  });
});

describe('await 이후에도 폼 생존을 다시 본다', () => {
  const body = stripComments(saveHandler());

  test('충돌검사 await 뒤에 폼 생존 게이트가 있다', () => {
    const firstAwait = body.indexOf('await ');
    const gate = body.indexOf('body.isConnected');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(firstAwait);
  });

  test('생존 게이트가 payload 를 만들기 전에 온다', () => {
    // 게이트가 payload 뒤로 밀리면 null.value 로 터지는 원래 버그가 되살아난다
    const gate = body.indexOf('body.isConnected');
    const payload = body.indexOf('customer_name:');
    expect(payload).toBeGreaterThan(gate);
  });

  test('게이트 이후의 DOM 읽기는 옵셔널 체이닝이거나 게이트가 보장하는 것만', () => {
    const gate = body.indexOf('body.isConnected');
    const after = body.slice(gate);
    // `querySelector('#x').value` 형태(무가드)로 남은 것은 게이트가 존재를 보장한 #bfCustName 뿐
    const unguarded = [...after.matchAll(/querySelector\('(#[\w-]+)'\)\.value/g)].map(m => m[1]);
    expect(unguarded.every(sel => sel === '#bfCustName')).toBe(true);
  });
});

describe('조기 종료가 잠금을 되돌린다', () => {
  const body = stripComments(saveHandler());

  test('_bail 헬퍼가 _saving 과 버튼을 모두 되돌린다', () => {
    const m = body.match(/const _bail = \(\) => \{([^}]*)\}/);
    expect(m).toBeTruthy();
    expect(m[1]).toMatch(/_saving = false/);
    expect(m[1]).toMatch(/disabled = false/);
  });

  test('잠근 뒤의 모든 early return 이 _bail 을 거친다', () => {
    const lock = body.indexOf('_saving = true');
    const tryIdx = body.indexOf('try {', lock);
    expect(tryIdx).toBeGreaterThan(lock);
    // 잠금 ~ try 사이 = 검증 구간. 여기의 return 은 전부 _bail 뒤여야 한다.
    const section = body.slice(lock, tryIdx);
    const returns = [...section.matchAll(/return;/g)];
    expect(returns.length).toBeGreaterThan(3);   // 날짜·시간·과거·충돌·고객 등
    for (const r of returns) {
      const before = section.slice(Math.max(0, r.index - 90), r.index);
      expect(`${before}return;`).toMatch(/_bail\(\);\s*return;/);
    }
  });
});
