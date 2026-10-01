/**
 * @jest-environment jsdom
 *
 * money-integrity-01 (P1) — 매출 입력 재시도마다 새 client_txn_id 를 만들어
 * 타임아웃 후 재저장 시 매출이 2건(회원권이면 이중 차감) 되던 것.
 *
 * 실측(2026-10-01, 로컬 스택, evidence/money-integrity/fix_before_result.json):
 *   첫 POST /revenue 응답을 23초 지연(서버는 201 커밋) → apiFetch 20초 타임아웃(AbortError)
 *   → 모달 유지·저장 버튼 활성 → 재클릭 → POST #2 가 **다른** client_txn_id 로 나감
 *   → 서버 행 2건. 서버 멱등(uq_revenue_user_txn)은 정상 — 키가 바뀌는 게 원인.
 *
 * 규칙(app-membership.js _txnFor/_txnDone 과 동일): 키는 '요청' 단위가 아니라 '저장 의도' 단위.
 *   같은 서명(금액·수단·고객·시술·회원권·기록일)으로 아직 성공 못 한 시도는 키를 재사용하고,
 *   성공하면 즉시 버린다(다음 같은 금액 저장은 새 시도). 서명이 바뀌면 새 키.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'app-revenue.js'), 'utf8');

function boot(script) {
  document.body.innerHTML = '';
  window.API = 'http://127.0.0.1:8000';
  window.authHeader = () => ({ Authorization: 'Bearer t' });
  if (!window.crypto || typeof window.crypto.randomUUID !== 'function') {
    let n = 0;
    Object.defineProperty(window, 'crypto', { value: { randomUUID: () => 'uuid-' + (++n) }, configurable: true });
  }
  const posts = [];
  window.apiFetch = jest.fn(async (p, opts) => {
    const body = JSON.parse(opts.body);
    posts.push(body);
    return script(posts.length, body);
  });
  // eslint-disable-next-line no-eval
  window.eval(SRC);
  return { R: window.Revenue, posts };
}
const ok201 = (body) => ({ ok: true, status: 201, json: async () => ({ id: 100 + Math.floor(Math.random() * 1000), ...body }) });
const abortErr = () => { const e = new Error('네트워크가 느려서 20초 안에 끝나지 않았어요.'); e.name = 'AbortError'; return e; };

const PAYLOAD = { amount: 77419, method: 'card', service_name: null, customer_id: null, customer_name: null, memo: null };

test('🔴 타임아웃(AbortError) 뒤 같은 내용으로 다시 저장하면 client_txn_id 가 같다 (이번 버그)', async () => {
  const { R, posts } = boot((n, body) => { if (n === 1) throw abortErr(); return ok201(body); });
  await expect(R.create({ ...PAYLOAD })).rejects.toBeTruthy();
  await R.create({ ...PAYLOAD });
  expect(posts).toHaveLength(2);
  expect(posts[0].client_txn_id).toBeTruthy();
  expect(posts[1].client_txn_id).toBe(posts[0].client_txn_id);
});

test('성공한 뒤 같은 내용을 또 저장하면 새 키 (진짜 두 번째 결제는 막지 않는다)', async () => {
  const { R, posts } = boot((n, body) => ok201(body));
  await R.create({ ...PAYLOAD });
  await R.create({ ...PAYLOAD });
  expect(posts).toHaveLength(2);
  expect(posts[1].client_txn_id).not.toBe(posts[0].client_txn_id);
});

test('실패 뒤 금액을 바꾸면 새 키 (서명이 다르면 다른 의도)', async () => {
  const { R, posts } = boot((n, body) => { if (n === 1) throw abortErr(); return ok201(body); });
  await expect(R.create({ ...PAYLOAD })).rejects.toBeTruthy();
  await R.create({ ...PAYLOAD, amount: 80000 });
  expect(posts[1].client_txn_id).not.toBe(posts[0].client_txn_id);
});

test('5xx 로 실패해도(결과 모름) 재시도는 같은 키 · 회원권 차감(use_membership)도 같은 규칙', async () => {
  const { R, posts } = boot((n, body) => {
    if (n === 1) return { ok: false, status: 503, json: async () => ({ detail: 'down' }) };
    return ok201(body);
  });
  const mem = { ...PAYLOAD, method: 'membership', customer_id: 7, customer_name: '김회원', use_membership: true };
  await expect(R.create({ ...mem })).rejects.toBeTruthy();
  await R.create({ ...mem });
  expect(posts[0].use_membership).toBe(true);
  expect(posts[1].client_txn_id).toBe(posts[0].client_txn_id);
});

test('메모만 바뀐 재시도는 같은 키 (메모 한 글자 때문에 돈이 두 번 잡히면 안 된다)', async () => {
  const { R, posts } = boot((n, body) => { if (n === 1) throw abortErr(); return ok201(body); });
  await expect(R.create({ ...PAYLOAD, memo: '첫 메모' })).rejects.toBeTruthy();
  await R.create({ ...PAYLOAD, memo: '고친 메모' });
  expect(posts[1].client_txn_id).toBe(posts[0].client_txn_id);
});

test('호출부가 client_txn_id 를 직접 넘기면 그대로 쓴다', async () => {
  const { R, posts } = boot((n, body) => ok201(body));
  await R.create({ ...PAYLOAD, client_txn_id: 'caller-key-1' });
  expect(posts[0].client_txn_id).toBe('caller-key-1');
});

test('소스 가드: create() 안에서 호출마다 _uuid() 로 키를 만들지 않는다', () => {
  expect(SRC).not.toMatch(/client_txn_id:\s*payload\.client_txn_id\s*\|\|\s*_uuid\(\)/);
  expect(SRC).toMatch(/_txnFor\(/);
  expect(SRC).toMatch(/_txnDone\(_sig\)/);
});
