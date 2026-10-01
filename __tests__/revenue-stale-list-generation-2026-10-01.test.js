/**
 * @jest-environment jsdom
 *
 * flow-revenue-stats-ui-02 (P1) — 저장 직전에 떠 있던 GET /revenue 목록 응답이 저장 **뒤**에 도착하면
 * 방금 저장한 매출이 목록·달력에서 60초(SWR TTL)간 사라진다. 히어로 합계는 새 값이라 한 화면 안에서 숫자가 어긋난다.
 *
 * 실측(2026-10-01, evidence/flow-revenue-stats-ui/race_list.log):
 *   54ms GET list sent / 56ms POST sent / 139ms list computed(count=7) / 141ms POST 201 / 1643ms list delivered
 *   → hero '227,000원·8건' 인데 상세·달력엔 27,000 행 없음. 닫았다 열어도(캐시 age 8s) 그대로.
 *
 * 원인: 변경 **전에 시작한 읽기**를 구분하는 세대(generation)가 없었다. _periodInflight 가 커밋 전 응답을
 *   그대로 돌려주고, 그 응답이 새 타임스탬프로 캐시됐다. app-core 의 같은 URL GET 코얼레싱도 같은 효과를 낸다.
 * 고침: 변경 세대 _mutGen — 쓰기 성공/캐시 무효화마다 ++ 하고 in-flight 를 버린다. 세대가 바뀐 뒤 도착한 응답은
 *   캐시·_items 에 쓰지 않고 다시 받는다. 변경 뒤의 읽기는 URL 에 세대를 실어 코얼레서가 옛 요청과 합치지 못하게 한다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const REV = fs.readFileSync(path.join(ROOT, 'app-revenue.js'), 'utf8');
const MONTH = fs.readFileSync(path.join(ROOT, 'app-revenue-month.js'), 'utf8');

const flush = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)); };
const OLD = [1, 2, 3, 4, 5, 6, 7].map(i => ({ id: i, amount: 10000 * i, method: 'card', recorded_at: '2026-10-01T03:00:00Z' }));

/** app-core 의 _inflightGET 과 같은 규칙(같은 URL 의 GET 이 진행 중이면 그 약속을 공유) + 서버는 요청 시점 장부로 계산. */
function boot(opts) {
  document.body.innerHTML = '';
  sessionStorage.clear(); localStorage.clear();
  window.API = 'http://127.0.0.1:8000';
  window.authHeader = () => ({ Authorization: 'Bearer t' });
  window._esc = (s) => String(s == null ? '' : s);
  window.showToast = jest.fn();
  if (!window.crypto || typeof window.crypto.randomUUID !== 'function') {
    let n = 0;
    Object.defineProperty(window, 'crypto', { value: { randomUUID: () => 'uuid-' + (++n) }, configurable: true });
  }
  let server = OLD.slice();
  const inflight = new Map();
  const pending = [];
  const getUrls = [];
  window.apiFetch = jest.fn((p, o) => {
    const m = ((o && o.method) || 'GET').toUpperCase();
    if (m === 'POST') {
      const body = JSON.parse(o.body);
      const created = { id: 999, ...body };
      server = [created, ...server];
      return Promise.resolve({ ok: true, status: 201, json: async () => created });
    }
    if (inflight.has(p)) return inflight.get(p);
    getUrls.push(p);
    const snapshot = server.slice();   // 커밋 전 장부로 계산된 응답
    let resolve;
    const pr = new Promise(r => { resolve = r; });
    pending.push(() => resolve({
      ok: true, status: 200,
      json: async () => (p.indexOf('/revenue/summary') === 0
        ? { total: snapshot.reduce((s, r) => s + r.amount, 0), count: snapshot.length }
        : { items: snapshot, count: snapshot.length }),
    }));
    pr.finally(() => inflight.delete(p));
    inflight.set(p, pr);
    return pr;
  });
  // eslint-disable-next-line no-eval
  window.eval(REV);
  if (opts && opts.month) {
    window.apiUrl = (p) => window.API + p;
    // eslint-disable-next-line no-eval
    window.eval(MONTH);
  }
  const deliverAll = async () => { for (let i = 0; i < 20 && pending.length; i++) { pending.shift()(); await flush(); } };
  return { R: window.Revenue, M: window.RevenueMonth, deliverAll, getUrls, pending };
}
const monthKey = () => Object.keys(sessionStorage).find(k => k.indexOf('pv_cache::revenue::month::') === 0);

test('🔴 저장 전에 시작한 목록 응답이 저장 뒤 도착해도 방금 저장한 매출이 목록·캐시에 남는다', async () => {
  const { R, deliverAll } = boot();
  const listP = R.list('month');           // GET A — 커밋 전
  await flush();
  await R.create({ amount: 27000, method: 'card' });   // POST 201
  await deliverAll();                      // A 가 커밋 전 장부로 도착
  const items = await listP;
  expect(items.some(i => i.amount === 27000)).toBe(true);
  expect(R._items.some(i => i.amount === 27000)).toBe(true);
  const cached = JSON.parse(sessionStorage.getItem(monthKey())).d;
  expect(cached.some(i => i.amount === 27000)).toBe(true);
});

test('🔴 변경 뒤의 읽기는 변경 전 in-flight 를 재사용하지 않는다 (app-core 코얼레서 기준으로도 다른 요청)', async () => {
  const { R, deliverAll, getUrls } = boot();
  const listA = R.list('month');
  await flush();
  await R.create({ amount: 27000, method: 'card' });
  const listB = R.list('month');           // 변경 뒤 읽기
  await flush();
  expect(getUrls.length).toBe(2);
  expect(getUrls[1]).not.toBe(getUrls[0]);
  await deliverAll();
  expect((await listB).some(i => i.amount === 27000)).toBe(true);
  expect((await listA).some(i => i.amount === 27000)).toBe(true);
  expect(R._items.filter(i => i.amount === 27000)).toHaveLength(1);   // 낙관적 항목이 중복으로 남지 않는다
});

test('변경이 없으면 같은 URL · in-flight 공유 그대로 (세대 0 에서는 요청 1건)', async () => {
  const { R, deliverAll, getUrls } = boot();
  const a = R.list('month'); const b = R.list('month');
  await flush();
  expect(getUrls.length).toBe(1);
  expect(getUrls[0]).toMatch(/^\/revenue\?period=custom&from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/);
  await deliverAll();
  expect((await a).length).toBe(7);
  expect((await b).length).toBe(7);
});

test('🔴 월 요약도 같은 규칙 — 커밋 전 요약이 저장 뒤 도착하면 캐시에 쓰지 않고 다시 받는다', async () => {
  const { R, M, deliverAll } = boot({ month: true });
  const sumP = M.fetchSummary();           // GET summary — 커밋 전
  await flush();
  await R.create({ amount: 27000, method: 'card' });
  await deliverAll();
  const s = await sumP;
  const expectTotal = OLD.reduce((x, r) => x + r.amount, 0) + 27000;
  expect(s.total).toBe(expectTotal);
  const key = Object.keys(sessionStorage).find(k => k.indexOf('pv_cache::revenue::summary::') === 0);
  expect(key).toBeTruthy();
  expect(JSON.parse(sessionStorage.getItem(key)).d.total).toBe(expectTotal);
});

test('소스 가드: 세대 카운터가 캐시 무효화와 함께 움직인다', () => {
  expect(REV).toMatch(/_mutGen/);
  expect(REV).toMatch(/_readGen/);
  expect(MONTH).toMatch(/_readGen/);
});
