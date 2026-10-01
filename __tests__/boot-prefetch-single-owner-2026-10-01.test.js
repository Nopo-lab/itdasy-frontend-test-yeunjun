/**
 * @jest-environment node
 *
 * perf-frontend-03 (2026-10-01) — 부팅 API 폭주: 프리페치 계층 3개가 같은 데이터를 각자 불렀다.
 *
 * 실측(토큰 선주입 콜드 부팅): 한 문서 안에서 /bookings ±90일 범위가 ms 만 다른 URL 로 2회
 * (app-core _preloadTabs 는 ±3×30일·Date.now(), app-perf-recovery _criticalPathWarm 은 ±90일·Date.now()
 * → in-flight 코얼레싱의 '같은 URL' 조건을 비껴감), app-dashboard prefetch 가 rIC 시점에
 * /today/brief·/revenue?period=month·/customers 를 또 부름(perf-recovery 의 rAF 워밍과 시점이 어긋나 코얼레싱 안 됨).
 *
 * 수정: 프리페치 소유자를 app-perf-recovery 의 _prefetch(30초 dedupe + 60초 신선 SWR 스킵) 하나로.
 *  · window._perfPrefetchBoot() — 부팅 세트(critical 7 + 백그라운드 AI 2)를 한 번에, 재호출은 dedupe
 *  · window._perfBookingRange() — 오늘 00:00 기준 ±90일 **일 단위** 라 하루 종일 같은 문자열(URL 결정적)
 *  · app-core _preloadTabs / app-dashboard 부팅 prefetch 는 소유자에게 위임(직접 apiFetch 0회)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const PERF = read('app-perf-recovery.js');
const CORE = read('app-core.js');
const DASH = read('app-dashboard.js');

const storage = (m) => ({ getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => Array.from(m.keys())[i], get length() { return m.size; } });

let nowMs = Date.UTC(2026, 9, 1, 3, 15, 27, 123);   // 2026-10-01 03:15:27.123Z
class FakeDate extends Date {
  constructor(...a) { super(...(a.length ? a : [nowMs])); }
  static now() { return nowMs; }
}

function okJson(body) { return { ok: true, status: 200, json: async () => body, headers: { get: () => null } }; }

/** app-perf-recovery.js 전체를 가짜 window/document 로 실행 (DOMContentLoaded 는 쏘지 않는다) */
function loadPerf({ apiFetch }) {
  const session = new Map();
  const win = {
    authHeader: () => ({ Authorization: 'Bearer tok' }), API: 'https://api.test',
    addEventListener: jest.fn(), removeEventListener: jest.fn(), showToast: jest.fn(),
  };
  const doc = {
    addEventListener: jest.fn(), removeEventListener: jest.fn(), getElementById: () => null,
    querySelector: () => null, querySelectorAll: () => [], hidden: false, readyState: 'loading',
    createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, appendChild() {}, remove() {} }),
    head: { appendChild() {} }, body: { appendChild() {} },
  };
  const sandbox = {
    window: win, document: doc, navigator: { onLine: true },
    localStorage: storage(new Map()), sessionStorage: storage(session), apiFetch,
    console: { warn: jest.fn(), log: jest.fn(), error: jest.fn() }, Date: FakeDate,
    setTimeout, clearTimeout, setInterval: jest.fn(), clearInterval: jest.fn(),
    AbortController, requestAnimationFrame: (fn) => fn(), performance: { mark() {}, measure() {} },
    MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
  };
  vm.createContext(sandbox);
  vm.runInContext(PERF, sandbox);
  return { win, session, apiFetch };
}

describe('예약 범위 URL 은 하루 안에서 결정적이다', () => {
  test('★ window._perfBookingRange() — 같은 날 다른 시각에 불러도 같은 문자열', () => {
    const { win } = loadPerf({ apiFetch: jest.fn() });
    expect(typeof win._perfBookingRange).toBe('function');
    const a = win._perfBookingRange();
    nowMs += 5 * 3600 * 1000 + 12345;           // 5시간 12초 뒤
    const b = win._perfBookingRange();
    expect(a).toBe(b);
    expect(a).toMatch(/^\/bookings\?from=.+&to=.+$/);
    nowMs += 2 * 24 * 3600 * 1000;              // 이틀 뒤면 달라진다(범위가 날짜를 따라간다)
    expect(win._perfBookingRange()).not.toBe(a);
  });
});

describe('부팅 프리페치 소유자는 하나다', () => {
  test('★ window._perfPrefetchBoot() 두 번 → URL 마다 네트워크 1회', async () => {
    const calls = [];
    const apiFetch = jest.fn(async (url) => { calls.push(url); return okJson({ items: [], total: 0 }); });
    const { win } = loadPerf({ apiFetch });
    expect(typeof win._perfPrefetchBoot).toBe('function');
    await Promise.all([win._perfPrefetchBoot(), win._perfPrefetchBoot()]);
    await win._perfPrefetchBoot();
    const byUrl = {};
    calls.forEach((u) => { byUrl[u] = (byUrl[u] || 0) + 1; });
    Object.entries(byUrl).forEach(([u, n]) => expect({ u, n }).toEqual({ u, n: 1 }));
    const paths = calls.map((u) => u.split('?')[0]);
    ['/customers', '/services', '/revenue', '/bookings', '/today/brief', '/assistant/suggestions'].forEach((p) => expect(paths).toContain(p));
    expect(calls.filter((u) => u.startsWith('/revenue?period=')).sort()).toEqual(['/revenue?period=month', '/revenue?period=today', '/revenue?period=week']);
  });

  test('부팅 세트의 예약 범위 = _perfBookingRange() (키 pv_cache::bookings_all 과 1:1)', async () => {
    const calls = [];
    const apiFetch = jest.fn(async (url) => { calls.push(url); return okJson({ items: [{ id: 1 }], total: 1 }); });
    const { win, session } = loadPerf({ apiFetch });
    await win._perfPrefetchBoot();
    expect(calls).toContain(win._perfBookingRange());
    expect(JSON.parse(session.get('pv_cache::bookings_all')).n).toBe(1);
  });

  test('★ app-core _preloadTabs 는 소유자에게 위임한다 — 직접 apiFetch 0회', async () => {
    const start = CORE.indexOf('window._preloadTabs = async function');
    const end = CORE.indexOf('// [UX-LOAD] 자동 preload 제거');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = CORE.slice(start, end);
    const win = { authHeader: () => ({ Authorization: 'Bearer tok' }), _perfPrefetchBoot: jest.fn(() => Promise.resolve([])) };
    const apiFetch = jest.fn(async () => okJson({ items: [] }));
    // eslint-disable-next-line no-new-func
    new Function('window', 'apiFetch', 'authHeader', 'sessionStorage', 'console', body)(win, apiFetch, win.authHeader, storage(new Map()), console);
    await win._preloadTabs();
    expect(win._perfPrefetchBoot).toHaveBeenCalledTimes(1);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  test('app-core _preloadTabs — 소유자가 없으면(perf-recovery 미로드) 스스로 데운다(폴백 유지)', async () => {
    const start = CORE.indexOf('window._preloadTabs = async function');
    const end = CORE.indexOf('// [UX-LOAD] 자동 preload 제거');
    const body = CORE.slice(start, end);
    const win = { authHeader: () => ({ Authorization: 'Bearer tok' }) };
    const apiFetch = jest.fn(async () => okJson({ items: [] }));
    // eslint-disable-next-line no-new-func
    new Function('window', 'apiFetch', 'authHeader', 'sessionStorage', 'console', body)(win, apiFetch, win.authHeader, storage(new Map()), console);
    await win._preloadTabs();
    expect(apiFetch.mock.calls.length).toBeGreaterThanOrEqual(6);
  });

  test('★ app-dashboard 부팅 prefetch 는 소유자에게 위임한다 — 직접 apiFetch 0회', async () => {
    const apiFetch = jest.fn(async () => okJson({ items: [] }));
    const win = {
      authHeader: () => ({ Authorization: 'Bearer tok' }), API: 'https://api.test',
      _perfPrefetchBoot: jest.fn(() => Promise.resolve([])),
      addEventListener: jest.fn(), _esc: (s) => s,
    };
    const doc = { readyState: 'complete', addEventListener: jest.fn(), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
    const sandbox = {
      window: win, document: doc, apiFetch, localStorage: storage(new Map()), sessionStorage: storage(new Map()),
      requestIdleCallback: (fn) => fn(), requestAnimationFrame: (fn) => fn(), setTimeout, console, Date,
    };
    vm.createContext(sandbox);
    vm.runInContext(DASH, sandbox);
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
    expect(win._perfPrefetchBoot).toHaveBeenCalledTimes(1);
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
