/**
 * @jest-environment node
 *
 * perf-backend-01 · perf-backend-04 (2026-10-02 BE-G2-B, 리드 결정 1~3) — 목록 API 계약에 맞춘 프런트.
 *
 * 계약: GET /revenue 기본 limit 2,000(옛 번들 그대로) · summary_only=1 / offset 은 새 프런트가 골라서(opt-in).
 *       GET /bookings 는 범위 없이 부르면 오늘 KST −30~+90일만 준다.
 *
 * 고친 것
 *  ① 내샵관리(app-dashboard) 의 기간 매출을 items 합산 → 응답 total 로.
 *     items 는 기본 2,000행에서 잘리므로 **한 달 매출이 2,000건을 넘는 매장은 브리핑 금액이 잘린 합**이었다
 *     (예: 2,500건 · 250만 원 → 200만 원으로 표시). 합계만 쓰니 summary_only=1 로 부른다.
 *  ② 부팅 SWR(pv_cache::revenue::*)의 total(n) 을 대시보드가 버렸다(_fromOwnerSWR 가 {items} 만 돌려줌)
 *     → 캐시로 그린 첫 화면이 0원/잘린 합. 이제 {items, total} 로 돌려준다.
 *  ③ 내샵관리의 범위 없는 GET /bookings 제거 — 쓰는 값(다가오는 예약 수)은 렌더되지 않았고, 화면의
 *     '오늘 예약' 은 이미 /today/brief 의 upcoming_count 를 쓴다(app-dashboard _heroSection).
 *  ④ 합계만 쓰는 호출처(부팅 프리페치 · 탭 hover 프리페치 · app-core 폴백 · 잇비 매출 즉답) 를 summary_only=1 로.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const DASH = read('app-dashboard.js');
const PERF = read('app-perf-recovery.js');
const CORE = read('app-core.js');
const ROUTER = read('assistant-intent-router.js');

const storage = (m) => ({
  getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
  removeItem: (k) => m.delete(k), key: (i) => Array.from(m.keys())[i], get length() { return m.size; },
});
const flush = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
function okJson(body) { return { ok: true, status: 200, json: async () => body, headers: { get: () => null } }; }

/* 로컬 백엔드 계약을 흉내 낸 가짜 서버 — 이번 달 매출 2,500건 × 1,000원. */
const MONTH_ROWS = 2500;
const DEFAULT_LIMIT = 2000;
function fakeRevenue(url) {
  const u = new URL(url, 'http://x');
  const period = u.searchParams.get('period');
  const n = period === 'today' ? 30 : MONTH_ROWS;          // 오늘 30건, 이번주·이번달 2,500건
  const all = Array.from({ length: n }, (_, i) => ({ id: n - i, amount: 1000 }));
  const total = n * 1000;
  if (u.searchParams.get('summary_only') === '1') {
    return { items: [], total, count: n, refund_count: 0, net_total: total, has_more: n > 0, returned: 0 };
  }
  const limit = Number(u.searchParams.get('limit') || DEFAULT_LIMIT);
  const offset = Number(u.searchParams.get('offset') || 0);
  const items = all.slice(offset, offset + limit);
  return { items, total, count: n, refund_count: 0, net_total: total, has_more: offset + items.length < n, returned: items.length };
}

function loadDashboard({ apiFetch, session = new Map(), local = new Map() }) {
  const body = { innerHTML: '' };
  const win = {
    authHeader: () => ({ Authorization: 'Bearer tok' }), API: 'http://api.test',
    addEventListener: jest.fn(), _esc: (s) => String(s),
    // 부팅 프리페치 소유자는 이 테스트에서 아무것도 안 한다(대시보드 자체 호출만 본다)
    _perfPrefetchBoot: jest.fn(() => Promise.resolve([])),
  };
  const doc = {
    readyState: 'complete', addEventListener: jest.fn(),
    getElementById: (id) => (id === 'dashboardMetrics' ? body : null),
    querySelector: () => null, querySelectorAll: () => [],
  };
  const sandbox = {
    window: win, document: doc, apiFetch, localStorage: storage(local), sessionStorage: storage(session),
    requestIdleCallback: (fn) => fn(), requestAnimationFrame: (fn) => fn(), setTimeout, console, Date, URL,
    formatMan: (v) => `₩${v}₩`,
  };
  vm.createContext(sandbox);
  vm.runInContext(DASH, sandbox);
  return { win, body };
}

describe('① 내샵관리 기간 매출은 응답 total 이다 (2,000건 넘는 달)', () => {
  test('★ 이번 달 2,500건 · 250만 원 — 브리핑 금액이 250만 원(잘린 200만 원이 아님)', async () => {
    const calls = [];
    const apiFetch = jest.fn(async (url) => {
      calls.push(url);
      if (url.startsWith('/revenue')) return okJson(fakeRevenue(url));
      if (url.startsWith('/customers')) return okJson({ items: [], total: 0 });
      if (url.startsWith('/today/brief')) return okJson({ upcoming_count: 3, at_risk_count: 1 });
      if (url.startsWith('/retention/at-risk')) return okJson({ summary: { total: 0, at_risk: 0, lost: 0 } });
      if (url.startsWith('/bookings')) return okJson({ items: [] });
      return okJson({});
    });
    const { win, body } = loadDashboard({ apiFetch });
    await win.initDashboardTab();
    await flush();
    expect(body.innerHTML).toContain(`₩${MONTH_ROWS * 1000}₩`);
    expect(body.innerHTML).not.toContain(`₩${DEFAULT_LIMIT * 1000}₩`);
    // 합계만 쓰므로 목록을 받지 않는다(summary_only=1 opt-in)
    const rev = calls.filter((u) => u.startsWith('/revenue'));
    expect(rev.length).toBeGreaterThan(0);
    rev.forEach((u) => expect(u).toMatch(/[?&]summary_only=1(&|$)/));
  });

  test.each([
    ['today', 30 * 1000],
    ['week', MONTH_ROWS * 1000],
  ])('기간 토글 %s — total 그대로', async (period, want) => {
    const apiFetch = jest.fn(async (url) => {
      if (url.startsWith('/revenue')) return okJson(fakeRevenue(url));
      if (url.startsWith('/customers')) return okJson({ items: [], total: 0 });
      return okJson({});
    });
    const { win, body } = loadDashboard({ apiFetch, local: new Map([['itdasy_dashboard_period_key', period]]) });
    await win.initDashboardTab();
    await flush();
    expect(body.innerHTML).toContain(`₩${want}₩`);
  });

  test('응답에 total 이 없을 때(옛 캐시 형태)만 items 합산으로 폴백', async () => {
    const apiFetch = jest.fn(async (url) => {
      if (url.startsWith('/revenue')) return okJson({ items: [{ amount: 1500 }, { amount: -500 }] });
      if (url.startsWith('/customers')) return okJson({ items: [], total: 0 });
      return okJson({});
    });
    const { win, body } = loadDashboard({ apiFetch });
    await win.initDashboardTab();
    await flush();
    expect(body.innerHTML).toContain('₩1000₩');
  });
});

describe('② 부팅 SWR(pv_cache::revenue::*) 로 그린 첫 화면도 total', () => {
  test('★ 네트워크 전, 프리페치 캐시 {d: [], n: 2500000} → 브리핑 250만 원', async () => {
    const session = new Map([
      ['pv_cache::revenue::month', JSON.stringify({ t: Date.now(), d: [], n: MONTH_ROWS * 1000 })],
      ['pv_cache::revenue::today', JSON.stringify({ t: Date.now(), d: [], n: 30000 })],
    ]);
    const never = () => new Promise(() => {});
    const { win, body } = loadDashboard({ apiFetch: jest.fn(never), session });
    win.initDashboardTab();
    await flush();
    expect(body.innerHTML).toContain(`₩${MONTH_ROWS * 1000}₩`);
  });
});

describe('③ 내샵관리는 범위 없는 GET /bookings 를 부르지 않는다', () => {
  test('★ 탭 진입 + 데이터 변경 이벤트 — /bookings 호출 0회', async () => {
    const calls = [];
    const apiFetch = jest.fn(async (url) => {
      calls.push(url);
      if (url.startsWith('/revenue')) return okJson(fakeRevenue(url));
      if (url.startsWith('/customers')) return okJson({ items: [], total: 0 });
      if (url.startsWith('/today/brief')) return okJson({ upcoming_count: 4, at_risk_count: 0 });
      return okJson({ items: [] });
    });
    const { win, body } = loadDashboard({ apiFetch });
    await win.initDashboardTab();
    await flush();
    const onChange = win.addEventListener.mock.calls.find(([ev]) => ev === 'itdasy:data-changed');
    expect(onChange).toBeTruthy();
    await onChange[1]();
    await flush();
    expect(calls.filter((u) => u.split('?')[0] === '/bookings')).toEqual([]);
    // '오늘 예약' 은 브리핑의 upcoming_count 그대로
    expect(body.innerHTML).toContain('4건');
  });
});

/* ── 부팅 프리페치(app-perf-recovery) ─────────────────────────── */
function loadPerf({ apiFetch }) {
  const session = new Map();
  const handlers = {};
  const win = {
    authHeader: () => ({ Authorization: 'Bearer tok' }), API: 'https://api.test',
    addEventListener: jest.fn(), removeEventListener: jest.fn(), showToast: jest.fn(),
  };
  const doc = {
    addEventListener: jest.fn((ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); }),
    removeEventListener: jest.fn(), getElementById: () => null,
    querySelector: () => null, querySelectorAll: () => [], hidden: false, readyState: 'loading',
    createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, appendChild() {}, remove() {} }),
    head: { appendChild() {} }, body: { appendChild() {} },
  };
  const sandbox = {
    window: win, document: doc, navigator: { onLine: true },
    localStorage: storage(new Map()), sessionStorage: storage(session), apiFetch,
    console: { warn: jest.fn(), log: jest.fn(), error: jest.fn() }, Date,
    setTimeout, clearTimeout, setInterval: jest.fn(), clearInterval: jest.fn(),
    AbortController, requestAnimationFrame: (fn) => fn(), performance: { mark() {}, measure() {} },
    MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
  };
  vm.createContext(sandbox);
  vm.runInContext(PERF, sandbox);
  return { win, session, handlers };
}

describe('④ 합계만 쓰는 프리페치는 summary_only=1', () => {
  test('★ 부팅 세트 — 매출 3종 모두 summary_only=1, SWR 에는 {d: [], n: total}', async () => {
    const calls = [];
    const apiFetch = jest.fn(async (url) => {
      calls.push(url);
      if (url.startsWith('/revenue')) return okJson(fakeRevenue(url));
      return okJson({ items: [], total: 0 });
    });
    const { win, session } = loadPerf({ apiFetch });
    await win._perfPrefetchBoot();
    const rev = calls.filter((u) => u.startsWith('/revenue')).sort();
    expect(rev).toEqual([
      '/revenue?period=month&summary_only=1',
      '/revenue?period=today&summary_only=1',
      '/revenue?period=week&summary_only=1',
    ]);
    const m = JSON.parse(session.get('pv_cache::revenue::month'));
    expect(m.d).toEqual([]);
    expect(m.n).toBe(MONTH_ROWS * 1000);
  });

  test('★ 같은 SWR 키에 쓰는 모든 곳이 같은 URL(같은 모양) — perf-recovery·app-core 폴백·대시보드 SWR 맵', () => {
    const urlsFor = (src, keyName) => {
      const re = new RegExp(`url:\\s*'(/revenue\\?[^']+)',\\s*${keyName}:\\s*'(pv_cache::revenue::(?:today|week|month))'`, 'g');
      const out = {};
      let m;
      while ((m = re.exec(src))) (out[m[2]] = out[m[2]] || new Set()).add(m[1]);
      return out;
    };
    const perf = urlsFor(PERF, 'key');
    const core = urlsFor(CORE, 'swrKey');
    expect(Object.keys(perf).sort()).toEqual(['pv_cache::revenue::month', 'pv_cache::revenue::today', 'pv_cache::revenue::week']);
    expect(Object.keys(core).sort()).toEqual(['pv_cache::revenue::month', 'pv_cache::revenue::today', 'pv_cache::revenue::week']);
    for (const k of Object.keys(perf)) {
      const all = new Set([...perf[k], ...core[k]]);
      expect({ k, urls: [...all] }).toEqual({ k, urls: [[...all][0]] });         // 키 하나에 URL 하나
      expect([...all][0]).toMatch(/&summary_only=1$/);
      // 대시보드 SWR 맵도 같은 URL 을 같은 키로 읽는다(in-flight 코얼레싱·캐시 공유 조건)
      const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(DASH).toMatch(new RegExp(`'${esc([...all][0])}':\\s*'${esc(k)}'`));
    }
  });

  test('app-core _preloadTabs 폴백(소유자 미로드) — 매출 3종 summary_only=1 · n=total', async () => {
    const start = CORE.indexOf('window._preloadTabs = async function');
    const end = CORE.indexOf('// [UX-LOAD] 자동 preload 제거');
    const body = CORE.slice(start, end);
    const win = { authHeader: () => ({ Authorization: 'Bearer tok' }) };
    const calls = [];
    const session = new Map();
    const apiFetch = jest.fn(async (url) => { calls.push(url); return okJson(url.startsWith('/revenue') ? fakeRevenue(url) : { items: [] }); });
    // eslint-disable-next-line no-new-func
    new Function('window', 'apiFetch', 'authHeader', 'sessionStorage', 'console', body)(win, apiFetch, win.authHeader, storage(session), console);
    await win._preloadTabs();
    await flush();
    expect(calls.filter((u) => u.startsWith('/revenue')).sort()).toEqual([
      '/revenue?period=month&summary_only=1',
      '/revenue?period=today&summary_only=1',
      '/revenue?period=week&summary_only=1',
    ]);
    expect(JSON.parse(session.get('pv_cache::revenue::week')).n).toBe(MONTH_ROWS * 1000);
  });
});

/* ── 잇비 매출 즉답(SQL-first) ─────────────────────────────────── */
function loadRouter(apiFetch) {
  const win = {};
  const sandbox = {
    window: win, localStorage: storage(new Map()), sessionStorage: storage(new Map()),
    apiFetch, console, Date, URL, setTimeout, clearTimeout,
  };
  win.authHeader = () => ({ Authorization: 'Bearer tok' });
  vm.createContext(sandbox);
  vm.runInContext(ROUTER, sandbox);
  return win.AssistantIntent;
}

describe('④ 잇비 매출 즉답은 total·count 만 쓴다 → summary_only=1', () => {
  test.each([
    ['오늘 매출 얼마야', 'today'],
    ['이번 주 매출 얼마야', 'week'],
    ['이번 달 매출 얼마야', 'month'],
    ['지난 달 매출 얼마야', 'last_month'],
  ])('★ "%s" → /revenue?period=%s&summary_only=1, 답은 total/count', async (q, period) => {
    const calls = [];
    const apiFetch = jest.fn(async (url) => { calls.push(url); return okJson(fakeRevenue(url.replace('last_month', 'month'))); });
    const AI = loadRouter(apiFetch);
    const rule = AI.findAsyncRule(q);
    expect(rule).toBeTruthy();
    const r = await AI.execAsyncRule(rule);
    expect(calls).toEqual([`/revenue?period=${period}&summary_only=1`]);
    const n = period === 'today' ? 30 : MONTH_ROWS;
    expect(r.response).toContain(`(${n}건)`);
  });
});
