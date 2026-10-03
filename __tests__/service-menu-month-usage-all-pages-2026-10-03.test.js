/**
 * @jest-environment jsdom
 *
 * BE-G3-Z #2 (2026-10-03 · 기존 결함) — 시술 메뉴(app-service-templates.js) 카드의 'N건 이번달'.
 *
 * 무엇이 문제였나
 *  ① 매출 엔진(app-revenue.js, 지연 그룹 revenue)이 아직 안 떠 있으면 GET /revenue?period=month **첫 페이지만**
 *     받아 셌다. 목록은 기본 2,000행에서 잘리고 has_more 로 알린다(2026-08-04 계약) → 한 달 2,000건 넘는 매장은
 *     사용량을 적게 셌고, 오래된 쪽(달 초) 시술은 0건으로 나왔다. 잘렸다는 표시도 없었다.
 *  (엔진이 이미 떠 있으면 Revenue.list('month') → _fetchPeriodData 가 직전 수정(BE-G2-B)으로 이미 끝까지 받았다 —
 *   숫자는 맞았다. 다만 list(period) 는 인자와 무관하게 **매출 화면 상태 범위**(_computeRange)를 따르고 매출 화면의
 *   _items 를 덮어쓴다. 지금은 그 범위를 바꾸는 UI 가 렌더되지 않아 늘 이번 달이므로 결함으로 세지 않는다 —
 *   대신 경로를 하나로 합쳐 '이번 달 URL' 을 명시한다(아래 설계 가드 테스트).)
 *  ② 실패하면 모든 카드가 '0건 이번달' — 모르는 걸 0 이라고 했다.
 *
 * 고친 것: 이번 달 URL(/revenue?period=month, 서버 KST 기준)을 직전 수정의 '끝까지 이어 받기' 헬퍼
 *   (app-revenue.js _fetchAllRevenuePages → 공용 이름 Revenue.fetchAllPages)로 받는다. 엔진이 없으면
 *   AppLoader.ensure('revenue') 로 띄운다. 그래도 끝까지 못 받으면 'N건 이상', 실패면 '사용량 못 불러옴'.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const REV = fs.readFileSync(path.join(ROOT, 'app-revenue.js'), 'utf8');
const SVC = fs.readFileSync(path.join(ROOT, 'app-service-templates.js'), 'utf8');

const API = 'http://127.0.0.1:8000';
const NOW = new Date('2026-10-15T03:00:00Z');   // KST 10/15 12:00

/* 이번 달(10월 KST) 2,470건: 최신 2,440건 '젤네일 기본' · 달 초 30건 '속눈썹펌'. 9월엔 '속눈썹펌' 5건(작은 달 대조용). */
function makeRows() {
  const rows = [];
  let id = 0;
  const oct1 = Date.UTC(2026, 8, 30, 15, 0, 0);   // 10/1 00:00 KST
  for (let i = 0; i < 30; i++) rows.push({ id: ++id, amount: 1000, service_name: '속눈썹펌', recorded_at: new Date(oct1 + i * 60000).toISOString() });
  for (let i = 0; i < 2440; i++) rows.push({ id: ++id, amount: 1000, service_name: '젤네일 기본', recorded_at: new Date(oct1 + 86400000 + i * 60000).toISOString() });
  const sep10 = Date.UTC(2026, 8, 10, 3, 0, 0);
  for (let i = 0; i < 5; i++) rows.push({ id: ++id, amount: 1000, service_name: '속눈썹펌', recorded_at: new Date(sep10 + i * 60000).toISOString() });
  return rows.sort((a, b) => b.id - a.id);   // 최신순(서버와 같음)
}
const kstDay = (iso) => new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);

function boot({ engineLoaded = false, failRevenue = false, supportsOffset = true } = {}) {
  document.body.innerHTML = '';
  sessionStorage.clear(); localStorage.clear();
  const rows = makeRows();
  const urls = [];
  const respond = (p) => {
    urls.push(p);
    const u = new URL('http://x' + p);
    if (u.pathname === '/services') {
      return { items: [{ id: 1, name: '젤네일 기본', default_price: 60000, default_duration_min: 90, category: 'nail' },
                       { id: 2, name: '속눈썹펌', default_price: 55000, default_duration_min: 60, category: 'eye' }] };
    }
    if (u.pathname === '/revenue') {
      const period = u.searchParams.get('period');
      let inRange;
      // period=month = 서버 '지금' 의 KST 달(테스트 시계 기준)
      if (period === 'month') { const ym = kstDay(new Date().toISOString()).slice(0, 7); inRange = rows.filter((r) => kstDay(r.recorded_at).startsWith(ym)); }
      else if (period === 'custom') {
        const f = u.searchParams.get('from'); const t = u.searchParams.get('to');
        inRange = rows.filter((r) => kstDay(r.recorded_at) >= f && kstDay(r.recorded_at) <= t);
      } else inRange = [];
      const limit = Number(u.searchParams.get('limit') || 2000);
      const offset = supportsOffset ? Number(u.searchParams.get('offset') || 0) : 0;
      const page = inRange.slice(offset, offset + limit);
      return { items: page, total: inRange.reduce((s, r) => s + r.amount, 0), count: inRange.length,
               has_more: offset + page.length < inRange.length, returned: page.length };
    }
    return {};
  };
  const reply = (p) => {
    if (failRevenue && p.startsWith('/revenue')) return { ok: false, status: 503, json: async () => ({}), text: async () => 'down' };
    return { ok: true, status: 200, json: async () => respond(p), text: async () => '' };
  };
  window.API = API;
  window.apiUrl = (p) => API + p;
  window.getToken = () => 't';
  window.authHeader = () => ({ Authorization: 'Bearer t' });
  window._esc = (s) => String(s == null ? '' : s);
  window.showToast = jest.fn();
  window.apiFetch = jest.fn(async (p) => reply(String(p)));
  global.fetch = window.fetch = jest.fn(async (u) => reply(String(u).replace(API, '')));
  window.openSheet = jest.fn(({ body }) => {
    let host = document.getElementById('sheetHost');
    if (!host) { host = document.createElement('div'); host.id = 'sheetHost'; document.body.appendChild(host); }
    host.innerHTML = body;
  });
  delete window.Revenue;
  const loadEngine = () => { window.eval(REV); };   // eslint-disable-line no-eval
  window.AppLoader = { ensure: jest.fn(async (g) => { if (g === 'revenue' && !window.Revenue) loadEngine(); return true; }) };
  if (engineLoaded) loadEngine();
  window.eval(SVC);   // eslint-disable-line no-eval
  return { urls };
}

function usageOf(name) {
  const card = Array.from(document.querySelectorAll('.svc-card'))
    .find((c) => c.textContent.includes(name));
  if (!card) return null;
  const span = Array.from(card.querySelectorAll('span')).find((s) => /이번달/.test(s.textContent));
  return span ? span.textContent.replace(/\s+/g, ' ').trim() : null;
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['setTimeout', 'setImmediate', 'nextTick', 'queueMicrotask', 'setInterval', 'clearTimeout', 'clearInterval'] });
  jest.setSystemTime(NOW);
});
afterEach(() => { jest.useRealTimers(); });

test('★ 매출 엔진이 아직 안 떠 있을 때(콜드) — 2,470건인 달도 끝까지 센다(2,000에서 안 잘림)', async () => {
  const { urls } = boot({ engineLoaded: false });
  await window.openServiceTemplates();
  expect(usageOf('젤네일 기본')).toBe('2440건 이번달');
  expect(usageOf('속눈썹펌')).toBe('30건 이번달');            // 달 초 30건 — 첫 페이지에는 아예 없다
  const rev = urls.filter((u) => u.startsWith('/revenue'));
  expect(rev).toEqual(['/revenue?period=month', '/revenue?period=month&offset=2000']);
  expect(window.AppLoader.ensure).toHaveBeenCalledWith('revenue');
});

test('설계 가드 — 엔진이 떠 있어도 같은 경로(이번 달 URL + 이어받기), 매출 화면 상태(Revenue.list/_items)는 안 건드림', async () => {
  // 수정 전에도 이 경우 숫자는 맞았다(Revenue.list → _fetchPeriodData 가 이미 이어 받음). 경로가 둘이면 한쪽만
  // 고쳐지는 일이 반복돼서(콜드 경로만 2,000에서 잘림) 한 경로로 합쳤다 — 그것을 잠근다.
  const { urls } = boot({ engineLoaded: true });
  const listSpy = jest.spyOn(window.Revenue, 'list');
  await window.openServiceTemplates();
  expect(usageOf('젤네일 기본')).toBe('2440건 이번달');
  expect(usageOf('속눈썹펌')).toBe('30건 이번달');
  expect(listSpy).not.toHaveBeenCalled();
  expect(urls.filter((u) => u.startsWith('/revenue'))).toEqual(['/revenue?period=month', '/revenue?period=month&offset=2000']);
  expect(window.AppLoader.ensure).not.toHaveBeenCalled();   // 이미 떠 있으면 다시 띄우지 않는다
});

test('끝까지 못 받으면(offset 을 모르는 옛 서버) 숫자를 "N건 이상" 으로 — 확정값처럼 보이지 않게', async () => {
  boot({ engineLoaded: true, supportsOffset: false });
  await window.openServiceTemplates();
  expect(usageOf('젤네일 기본')).toBe('2000건 이상 이번달');
  expect(usageOf('속눈썹펌')).toBe('0건 이상 이번달');
});

test('★ 매출을 못 받으면 "0건" 이 아니라 "사용량 못 불러옴"', async () => {
  boot({ engineLoaded: true, failRevenue: true });
  await window.openServiceTemplates();
  expect(usageOf('젤네일 기본')).toBe('이번달 사용량 못 불러옴');
  expect(usageOf('젤네일 기본')).not.toMatch(/0건/);
});

test('2,000건 이하(보통 매장) — 요청 한 번', async () => {
  const { urls } = boot({ engineLoaded: true });
  jest.setSystemTime(new Date('2026-09-20T03:00:00Z'));   // 9월 = 5건뿐인 달
  await window.openServiceTemplates();
  expect(urls.filter((u) => u.startsWith('/revenue'))).toEqual(['/revenue?period=month']);
  expect(usageOf('속눈썹펌')).toBe('5건 이번달');
});
