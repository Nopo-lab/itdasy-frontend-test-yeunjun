/**
 * @jest-environment jsdom
 *
 * [기존 결함 · BE-G2-B 재수정 2026-10-02] 매출 화면 월 달력 칩·일 상세가 2,000행에서 잘려 히어로 합계와 어긋났다.
 *
 * 실측(검증자, 합성매장 tenant-b-beg2b · 이번 달 2,450건 + 환불 3건):
 *   히어로 '이번달 매출 2,585,000원 2450건' 은 맞는데(서버 /revenue/summary)
 *   달력 칩은 '3일 198만' 하나뿐 · 10/1 칩 없음(실제 300,000원) · '10월 3일' 상세 1,982,000원 1997팀
 *   (API 오늘 합계 2,285,000원 2300건). 잘렸다는 표시도 없었다.
 *   API: /revenue?period=custom&from=2026-10-01&to=2026-10-31 → {total:2585000, count:2450, items:2000, has_more:true}
 *
 * 원인: GET /revenue 목록은 기본 2,000행에서 자르고 has_more 로 알린다(2026-08-04 계약 — 합계는 전체 기준).
 *   매출 화면은 그 목록을 **달력·일 상세의 원본**으로 쓰면서 has_more 를 읽지 않았다(app-revenue.js _fetchPeriodData,
 *   지난달은 app-revenue-month.js _doFetchSummary). 기본 limit 은 옛 앱 호환을 위해 그대로 둔다(리드 결정 1·2).
 * 고침: 월 목록은 has_more 가 false 가 될 때까지 offset 으로 **이어 받는다**(첫 페이지 URL 은 그대로 — 부팅
 *   프리페치·코얼레싱·SW 폴백과 같은 키). offset 을 모르는 옛 서버(같은 페이지를 또 줌)에서는 멈추고,
 *   상한(페이지 10장)에 걸리면 '일부만 표시' 를 사실대로 알린다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const REV = fs.readFileSync(path.join(ROOT, 'app-revenue.js'), 'utf8');
const MONTH = fs.readFileSync(path.join(ROOT, 'app-revenue-month.js'), 'utf8');


/** 서버 목록: 최신순, 기본 limit 2000, offset 지원(supportsOffset=false 면 옛 서버처럼 무시). */
function makeRows(n) {
  const base = Date.UTC(2026, 8, 30, 15, 0, 0);   // 10/1 00:00 KST
  const rows = [];
  for (let i = 0; i < n; i++) rows.push({ id: i + 1, amount: 1000, method: 'card', recorded_at: new Date(base + i * 60000).toISOString() });
  return rows.sort((a, b) => b.id - a.id);
}

function boot({ rows, supportsOffset = true, month = false } = {}) {
  document.body.innerHTML = '';
  sessionStorage.clear(); localStorage.clear();
  window.API = 'http://127.0.0.1:8000';
  window.apiUrl = (p) => window.API + p;
  window.authHeader = () => ({ Authorization: 'Bearer t' });
  window._esc = (s) => String(s == null ? '' : s);
  window.showToast = jest.fn();
  const urls = [];
  const respond = (p) => {
    urls.push(p);
    const u = new URL('http://x' + p);
    if (u.pathname === '/revenue/summary') {
      return { total: rows.reduce((s, r) => s + r.amount, 0), count: rows.length, daily: [] };
    }
    const limit = Number(u.searchParams.get('limit') || 2000);
    const offset = supportsOffset ? Number(u.searchParams.get('offset') || 0) : 0;
    const page = rows.slice(offset, offset + limit);
    return {
      items: page, total: rows.reduce((s, r) => s + r.amount, 0), count: rows.length,
      has_more: offset + page.length < rows.length, returned: page.length,
    };
  };
  window.apiFetch = jest.fn(async (p) => ({ ok: true, status: 200, json: async () => respond(p) }));
  global.fetch = window.fetch = jest.fn(async (u) => ({ ok: true, status: 200, json: async () => respond(String(u).replace(window.API, '')) }));
  // eslint-disable-next-line no-eval
  window.eval(REV);
  if (month) {
    // eslint-disable-next-line no-eval
    window.eval(MONTH);
  }
  return { R: window.Revenue, M: window.RevenueMonth, urls };
}

afterEach(() => { jest.useRealTimers(); });

test('🔴 이번 달 2,450행 — 목록(달력·일 상세의 원본)이 2,000에서 잘리지 않는다', async () => {
  const rows = makeRows(2450);
  const { R, urls } = boot({ rows });
  const items = await R.list('month');
  expect(items).toHaveLength(2450);
  expect(new Set(items.map(r => r.id)).size).toBe(2450);
  // 첫 페이지 URL 은 예전 그대로(부팅 프리페치·코얼레싱·SW 폴백 키) — 이어받기만 offset 을 붙인다
  const listUrls = urls.filter(u => u.indexOf('/revenue?') === 0);
  expect(listUrls[0]).toMatch(/^\/revenue\?period=custom&from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/);
  expect(listUrls[1]).toBe(listUrls[0] + '&offset=2000');
  expect(listUrls).toHaveLength(2);
  // 날짜별 합계 = 서버 합계 (칩을 눈으로 더하면 히어로와 같아야 한다)
  expect(items.reduce((s, r) => s + r.amount, 0)).toBe(2450 * 1000);
  expect(window.showToast).not.toHaveBeenCalled();
});

test('2,000행 이하(보통 매장) — 요청은 예전처럼 한 번', async () => {
  const { R, urls } = boot({ rows: makeRows(180) });
  const items = await R.list('month');
  expect(items).toHaveLength(180);
  expect(urls.filter(u => u.indexOf('/revenue?') === 0)).toHaveLength(1);
});

test('🔴 지난달(월 이동) 목록도 끝까지 받는다', async () => {
  jest.useFakeTimers({ doNotFake: ['setTimeout', 'setImmediate', 'nextTick', 'queueMicrotask', 'setInterval'] });
  jest.setSystemTime(new Date('2026-10-15T03:00:00Z'));
  const rows = makeRows(2450);
  const { M, urls } = boot({ rows, month: true });   // 화면 상태 = 2026-10
  jest.setSystemTime(new Date('2026-11-15T03:00:00Z')); // 이제 10월은 '지난달'
  expect(M.getView().isCurrent).toBe(false);
  await M.fetchSummary();
  const viewItems = M.getViewItems();
  expect(Array.isArray(viewItems)).toBe(true);
  expect(viewItems).toHaveLength(2450);
  const listUrls = urls.filter(u => u.indexOf('/revenue?') === 0);
  expect(listUrls[0]).toBe('/revenue?period=month&year=2026&month=10');
  expect(listUrls[1]).toBe('/revenue?period=month&year=2026&month=10&offset=2000');
});

test('offset 을 모르는 옛 서버 — 같은 페이지가 또 와도 무한히 돌지 않고, 일부만이라고 알린다', async () => {
  const { R, urls } = boot({ rows: makeRows(2450), supportsOffset: false });
  const items = await R.list('month');
  expect(items).toHaveLength(2000);                         // 중복 없이 받은 만큼
  expect(urls.filter(u => u.indexOf('/revenue?') === 0)).toHaveLength(2);
  expect(window.showToast).toHaveBeenCalled();
  expect(String(window.showToast.mock.calls[0][0])).toMatch(/일부/);
});

test('소스 가드: 월 목록 로드가 has_more 를 읽는다', () => {
  expect(REV).toMatch(/_fetchAllRevenuePages/);
  expect(MONTH).toMatch(/_fetchAllRevenuePages/);
});
