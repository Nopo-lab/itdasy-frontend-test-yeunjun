/**
 * @jest-environment node
 */
'use strict';
/**
 * [perf-frontend-02 · 2026-10-01] 다른 경로(API·DM 자동등록·잇비·명함스캔)로 만든 손님이
 * 고객관리 **재진입** 목록에 안 보이던 것.
 *
 * 실측(Playwright): 고객관리를 한 번 열고 닫음 → POST /customers 201 → 다시 열기
 *   → 즉시/3초/10초 모두 미표시(전체 수 배지도 옛 값). 그 사이 허브가 보낸 GET /customers 응답엔 새 손님이 있다.
 *   닫았다 다시 열면 그제야 보인다.
 *
 * 원인: openCustomers 의 `_fetchFresh().then(fresh => { if (sig(fresh) !== sig(_cache)) … })` 인데
 *   _fetchFresh 가 `_cache = items` 로 **먼저 덮고 그 _cache 를 돌려줬다** → fresh === _cache 라
 *   서명이 항상 같고 _rerender() 가 절대 안 불렸다. 2026-09-09 의 "여는 순간 서버와 맞춘다" 가
 *   실제로는 한 번도 동작한 적이 없었다(네트워크만 1회 더 나감). list() 의 stale 분기도 같은 꼴.
 *
 * 여기서 잠그는 것 (실제 app-customer.js 를 새 JSDOM 창에 올려 동작으로 본다):
 *   - 캐시 7명 · 서버 8명 → openCustomers() 직후 8번째 이름이 목록에, 전체 수 배지 8
 *   - 캐시와 서버가 같으면 다시 그리지 않는다(스크롤·검색 상태 보존)
 *   - list() 의 오래된 캐시 경로도 서버가 다르면 다시 그린다
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'app-customer.js'), 'utf8');

const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(r => setImmediate(r)); };

function customer(id, name) {
  return { id, name, phone: null, memo: null, tags: [], birthday: null, last_visit_at: null,
           visit_count: 0, created_at: '2026-01-01T00:00:00Z', deleted_at: null };
}

/** @param {{cached: object[], server: object[], total?: number, cacheAgeMs?: number}} o */
async function boot({ cached, server, total, cacheAgeMs = 0 }) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>',
    { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
  const w = dom.window;
  await new Promise(r => { if (w.document.readyState === 'complete') r(); else w.addEventListener('load', r); });
  Object.defineProperty(w, 'innerWidth', { value: 390, configurable: true });
  Object.defineProperty(w, 'innerHeight', { value: 844, configurable: true });
  w.API = 'http://api.invalid';
  w.authHeader = () => ({ Authorization: 'Bearer t' });
  w._esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  w.showToast = jest.fn();
  const gets = [];
  w.apiFetch = jest.fn(async (p) => {
    if (/^\/customers\/duplicates/.test(p)) return { ok: true, status: 200, json: async () => ({ groups: [] }) };
    if (/^\/customers(\?|$)/.test(p)) {
      gets.push(p);
      return { ok: true, status: 200, json: async () => ({ items: server, total: Number.isFinite(total) ? total : server.length, has_more: false }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
  // SWR 캐시 (CustomerCache 가 없을 때의 app-customer 자체 포맷 {t, d, n})
  w.sessionStorage.setItem('pv_cache::customers', JSON.stringify({ t: Date.now() - cacheAgeMs, d: cached, n: cached.length }));
  w.eval(SRC);
  const list = () => w.document.querySelector('#customerSheet #customerList');
  return {
    w, gets, list,
    names: () => [...list().querySelectorAll('[data-id] .c-name-txt')].map(e => e.textContent),
    statAll: () => w.document.getElementById('cvStatAll').textContent,
    // 목록 안에 표식을 심어 둔다 — _rerender 가 innerHTML 을 갈아끼우면 사라진다
    mark: () => { const i = w.document.createElement('i'); i.id = 'rerenderMark'; list().appendChild(i); },
    marked: () => !!w.document.getElementById('rerenderMark'),
  };
}

describe('고객관리 진입 시 서버와 맞춘다 (openCustomers)', () => {
  const seven = [1, 2, 3, 4, 5, 6, 7].map(i => customer(i, '손님' + i));

  test('🔴 캐시 7명 · 서버 8명 → 여는 즉시 8번째 손님이 목록에 보이고 전체 수가 8', async () => {
    const h = await boot({ cached: seven, server: [customer(8, '목록검증새손님')].concat(seven) });
    await h.w.openCustomers();
    expect(h.names()).not.toContain('목록검증새손님');   // 캐시로 먼저 즉시 그린 상태
    await flush();
    expect(h.gets.length).toBeGreaterThanOrEqual(1);     // 서버에 물어봤고
    expect(h.names()).toContain('목록검증새손님');       // 응답으로 다시 그렸다
    expect(h.statAll()).toBe('8');
  });

  test('캐시와 서버가 같으면 다시 그리지 않는다 (스크롤·검색 상태 보존)', async () => {
    const h = await boot({ cached: seven, server: seven.slice() });
    await h.w.openCustomers();
    h.mark();
    await flush();
    expect(h.gets.length).toBeGreaterThanOrEqual(1);
    expect(h.marked()).toBe(true);
    expect(h.names().length).toBe(7);
  });

  test('🔴 서버가 센 전체 수가 캐시 길이와 다르면 배지를 고친다 (목록 id 가 같아도)', async () => {
    const h = await boot({ cached: seven, server: seven.slice(), total: 307 });
    await h.w.openCustomers();
    await flush();
    expect(h.statAll()).toBe('307');
  });
});

describe('list() 의 오래된 캐시 경로', () => {
  const seven = [1, 2, 3, 4, 5, 6, 7].map(i => customer(i, '손님' + i));

  test('🔴 캐시가 2분 넘었으면 백그라운드 재검증 결과로 다시 그린다', async () => {
    const h = await boot({ cached: seven, server: [customer(9, '늦게온손님')].concat(seven), cacheAgeMs: 10 * 60 * 1000 });
    // 시트를 먼저 열어 둔다(_rerender 대상) — 그 뒤 list() 가 stale 캐시를 보고 재검증한다
    await h.w.openCustomers();
    await flush();
    h.w.apiFetch.mockClear(); h.gets.length = 0;
    // 재검증 대상 상태를 다시 만든다: 캐시를 다시 오래된 것으로
    h.w.sessionStorage.setItem('pv_cache::customers', JSON.stringify({ t: Date.now() - 10 * 60 * 1000, d: seven, n: 7 }));
    h.list().innerHTML = '';
    const items = await h.w.Customer.list();
    expect(items.length).toBe(7);                 // 캐시 즉시 반환
    await flush();
    expect(h.gets.length).toBe(1);                // 백그라운드 1회
    expect(h.names()).toContain('늦게온손님');     // 응답이 다르면 다시 그린다
  });
});
