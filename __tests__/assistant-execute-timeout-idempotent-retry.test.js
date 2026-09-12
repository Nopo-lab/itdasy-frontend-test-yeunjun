/* [P0 2026-09-09] 응답이 유실되면 화면이 "저장 중…" 에서 영원히 멈추고,
 * 원장이 다시 요청하면 **돈이 두 번 들어간다.**
 *
 * 실측(실 Chrome · 운영 DB · 서빙 d1f2884 · FE cb74b6f):
 *   잔액 0
 *   → "E2E_A_박지우님 회원권 30000원 충전해줘" → 카드 → 추가하기 → 확인
 *   → 서버 커밋됨(잔액 30,000) · 응답만 유실
 *   → 화면은 계속 "저장 중…" (60초 넘게 그대로, 재시도 버튼 없음)
 *   → 원장이 결과를 모르니 같은 요청 반복 → 확인
 *   → **잔액 60,000**  ← 이중 청구
 *
 * 원인 두 겹:
 *   ① `/assistant/execute` 에 타임아웃이 없다. `apiFetch` 는 비-GET 이면 그냥 `fetch()` 라
 *      AbortController 도 없다. `/assistant/ask` 는 AbortController 를 쓰는데 execute 만 빠졌다.
 *   ② 그래서 클라이언트가 **같은 멱등키로 재시도할 방법이 없다.** 새 카드 = 새 `_txn_id`.
 *
 * 서버 멱등 자체는 멀쩡하다 — 같은 `client_txn_id` 로 재전송하면 잔액이 안 움직이고
 * 같은 응답을 돌려준다(실측: 65,000 → 65,000). 그래서 고치는 자리는 클라이언트다.
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app-assistant.js'), 'utf8');

/** `_executeAction` 안의 POST 구간만 잘라내 독립 실행 가능한 함수로 만든다. */
function buildPoster({ fail, failTwice, slowMs }) {
  const calls = [];
  let n = 0;
  const apiFetch = (url, opts) => {
    n += 1;
    calls.push({ n, url, body: JSON.parse(opts.body), aborted: false, signal: opts.signal });
    if (fail && (n === 1 || (failTwice && n === 2))) {
      return new Promise((_res, rej) => {
        if (opts.signal) opts.signal.addEventListener('abort', () => {
          calls[n - 1].aborted = true;
          rej(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({ kind: 'charge_membership', balance_after: 30000 }) });
  };
  // 실제 소스에서 타임아웃·재시도 블록을 그대로 가져온다
  const start = SRC.indexOf('    const EXEC_TIMEOUT_MS =');
  const end = SRC.indexOf('    if (!res.ok) {', start);
  if (start < 0 || end < 0) throw new Error('타임아웃/재시도 블록을 못 찾음 — 제거됐거나 이름이 바뀜');
  const block = SRC.slice(start, end);
  const src = block.replace('const EXEC_TIMEOUT_MS = 25000;', `const EXEC_TIMEOUT_MS = ${slowMs || 40};`);
  // eslint-disable-next-line no-new-func
  const run = new Function('apiFetch', 'window', 'body', 'AbortController', 'setTimeout', 'clearTimeout',
    '"use strict"; return (async () => {' + src + ' return res; })();');
  return { run, calls, apiFetch };
}

const WIN = { authHeader: () => ({ Authorization: 'Bearer x' }) };
const BODY = { kind: 'charge_membership', payload: { amount: 30000, client_txn_id: 'TXN-FIXED-1' } };

describe('execute 는 무한 대기하지 않는다', () => {
  test('응답이 안 오면 중단하고 같은 멱등키로 한 번 재시도한다', async () => {
    const { run, calls, apiFetch } = buildPoster({ fail: true });
    const res = await run(apiFetch, WIN, BODY, AbortController, setTimeout, clearTimeout);
    expect(res.ok).toBe(true);
    expect(calls.length).toBe(2);
    expect(calls[0].aborted).toBe(true);                 // 첫 요청은 실제로 끊겼다
    expect(calls[1].body.payload.client_txn_id)
      .toBe(calls[0].body.payload.client_txn_id);        // 🔑 같은 키 — 서버가 중복을 막는다
    expect(calls[1].body.payload.client_txn_id).toBe('TXN-FIXED-1');
  });

  test('재시도도 끊기면 "실패" 가 아니라 "모른다" 로 알린다', async () => {
    const { run, calls, apiFetch } = buildPoster({ fail: true, failTwice: true });
    await expect(run(apiFetch, WIN, BODY, AbortController, setTimeout, clearTimeout))
      .rejects.toMatchObject({ unknownOutcome: true });
    expect(calls.length).toBe(2);
  });

  test('타임아웃 메시지는 처리됐는지 확인하라고 안내한다(실패로 단정하지 않는다)', async () => {
    const { run, apiFetch } = buildPoster({ fail: true, failTwice: true });
    let msg = '';
    try { await run(apiFetch, WIN, BODY, AbortController, setTimeout, clearTimeout); }
    catch (e) { msg = e.message; }
    expect(msg).toMatch(/확인하지 못했어요/);
    expect(msg).toMatch(/확인한 뒤 다시 시도/);
    expect(msg).not.toMatch(/^실패/);
  });

  test('정상이면 재시도하지 않는다 (요청 1회)', async () => {
    const { run, calls, apiFetch } = buildPoster({ fail: false });
    const res = await run(apiFetch, WIN, BODY, AbortController, setTimeout, clearTimeout);
    expect(res.ok).toBe(true);
    expect(calls.length).toBe(1);
  });

  test('abort signal 이 실제로 전달된다', async () => {
    const { run, calls, apiFetch } = buildPoster({ fail: false });
    await run(apiFetch, WIN, BODY, AbortController, setTimeout, clearTimeout);
    expect(calls[0].signal).toBeTruthy();
    expect(typeof calls[0].signal.aborted).toBe('boolean');
  });
});

describe('멱등키 계약 (회귀)', () => {
  test('_executeAction 이 액션 객체에 키를 붙여 재시도해도 같은 값이 가게 한다', () => {
    expect(SRC).toMatch(/if \(!action\._txn_id\)/);
    expect(SRC).toMatch(/client_txn_id: action\._txn_id/);
  });
});

/* ── 2차: 카드가 새로 만들어져도 같은 내용이면 같은 멱등키 ────────────────
 *
 * 1차 수정(타임아웃 + 같은 키 재시도)은 **한 번의 실행 안**에서만 보호한다.
 * 실측 사고의 나머지 절반은 그 밖에서 일어났다:
 *   응답 유실로 화면이 멈춤 → 원장이 같은 요청을 **다시 입력** → 새 카드 → 새 키
 *   → 서버가 중복인 줄 모르고 또 충전(30,000 → 60,000).
 *
 * 형제 경로인 회원권 시트(app-membership.js `_txnFor`)는 이미 **내용 서명**으로 키를 잡고
 * 성공했을 때만 버린다. 잇비만 그 계약이 빠져 있었다 — 정렬한다.
 */
describe('같은 내용의 재요청은 같은 멱등키를 쓴다 (회원권 시트와 같은 계약)', () => {
  function loadSigLogic() {
    const start = SRC.indexOf('    const _txnSig = (() => {');
    const end = SRC.indexOf('    body.payload = { ...body.payload, client_txn_id: action._txn_id };');
    if (start < 0 || end < 0) throw new Error('멱등키 서명 블록을 못 찾음 — 제거됐거나 이름이 바뀜');
    const block = SRC.slice(start, end);
    // eslint-disable-next-line no-new-func
    return new Function('action', '_pendingTxn', 'window',
      '"use strict";' + block + 'return { key: action._txn_id, sig: _txnSig };');
  }
  const run = loadSigLogic();
  const WIN2 = { crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) } };

  test('내용이 같으면 새 액션 객체라도 키가 같다', () => {
    const map = new Map();
    const a1 = { kind: 'charge_membership', payload: { customer_name: '박지우', amount: 30000 } };
    const a2 = { kind: 'charge_membership', payload: { amount: 30000, customer_name: '박지우' } };  // 키 순서만 다름
    const r1 = run(a1, map, WIN2);
    const r2 = run(a2, map, WIN2);
    expect(r2.key).toBe(r1.key);
  });

  test('금액이 다르면 다른 키다', () => {
    const map = new Map();
    const k1 = run({ kind: 'charge_membership', payload: { customer_name: '박지우', amount: 30000 } }, map, WIN2).key;
    const k2 = run({ kind: 'charge_membership', payload: { customer_name: '박지우', amount: 50000 } }, map, WIN2).key;
    expect(k2).not.toBe(k1);
  });

  test('고객이 다르면 다른 키다 (다른 손님 충전이 막히면 안 된다)', () => {
    const map = new Map();
    const k1 = run({ kind: 'charge_membership', payload: { customer_name: '박지우', amount: 30000 } }, map, WIN2).key;
    const k2 = run({ kind: 'charge_membership', payload: { customer_name: '김호영', amount: 30000 } }, map, WIN2).key;
    expect(k2).not.toBe(k1);
  });

  test('성공해서 키를 버리면 다음 같은 요청은 새 키다 (일부러 두 번 충전 가능)', () => {
    const map = new Map();
    const a = { kind: 'charge_membership', payload: { customer_name: '박지우', amount: 30000 } };
    const r1 = run(a, map, WIN2);
    map.delete(r1.sig);                       // 성공 처리 = _pendingTxn.delete(_txnSig)
    const k2 = run({ kind: 'charge_membership', payload: { customer_name: '박지우', amount: 30000 } }, map, WIN2).key;
    expect(k2).not.toBe(r1.key);
  });

  test('성공 시 키를 버리는 코드가 실제로 있다', () => {
    expect(SRC).toMatch(/_pendingTxn\.delete\(_txnSig\)/);
  });
});
