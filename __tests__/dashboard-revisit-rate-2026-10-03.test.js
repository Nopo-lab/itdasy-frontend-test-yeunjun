/**
 * @jest-environment node
 *
 * BE-G3-Z #1 (2026-10-03) — 내샵관리 대시보드(app-dashboard.js)의 '재방문' 칸과 /retention/at-risk 호출.
 *
 * 무엇이 문제였나 (재현: 로컬 스택 Playwright, evidence/perf-backend/rerun5/BE-G3-Z-frontend-rest/before_dash_probe.json)
 *  - 칸은 GET /retention/at-risk 의 summary.retention_rate 를 읽었는데 **그 필드는 서버 응답에 없다**
 *    (routers/retention.py · services/retention_predictor.summary_stats = total/at_risk/lost 뿐) → 늘 '—'.
 *  - 그런데도 탭 진입·데이터 변경(itdasy:data-changed)마다 이탈 고객 목록 전체를 받았다
 *    (perf3 매장1 1,105명 · 261KB — 새 대시보드 세트에서 가장 느린 호출, 측정 보고 '개선 안 된 항목 1').
 *  - '위험 신호' 는 이미 /today/brief 의 at_risk_count 를 쓴다 → at-risk 응답에서 쓰이는 값은 0개.
 *
 * 고친 것
 *  ① /retention/at-risk 호출 제거(탭 진입·백그라운드·데이터 변경 재로드 전부).
 *  ② 재방문율을 **이미 받는 /customers** 로 정직하게 계산 — visit_count 는 매출 원장 진실원(고객관리와 같은 값).
 *       재방문율 = 2회 이상 방문 손님 ÷ 1회 이상 방문 손님
 *     목록이 매장 전체가 아닐 때(고객 > 첫 페이지 200명)는 % 를 지어내지 않고 '미집계' + 이유.
 *     방문 0명이면 '방문 기록 없음', 고객 목록을 못 받았으면 '불러오지 못함'(빈 목록으로 꾸미지 않는다).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DASH = fs.readFileSync(path.join(ROOT, 'app-dashboard.js'), 'utf8');

const storage = (m) => ({
  getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
  removeItem: (k) => m.delete(k), key: (i) => Array.from(m.keys())[i], get length() { return m.size; },
});
const flush = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
const okJson = (body) => ({ ok: true, status: 200, json: async () => body, headers: { get: () => null } });

function loadDashboard({ apiFetch, session = new Map(), local = new Map() }) {
  const body = { innerHTML: '' };
  const win = {
    authHeader: () => ({ Authorization: 'Bearer tok' }), API: 'http://api.test',
    addEventListener: jest.fn(), _esc: (s) => String(s),
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

/* 히어로의 '재방문' 칸 값(+근거 줄) — 수정 전/후 마크업 모두에서 같은 방식으로 읽는다. */
function revisitCell(html) {
  const i = html.indexOf('재방문</p>');
  if (i < 0) return null;
  const rest = html.slice(i);
  const val = (rest.match(/<p class="db-hero__mini-val">([\s\S]*?)<\/p>/) || [])[1];
  const end = rest.indexOf('</div>');
  return { val: val == null ? null : val.trim(), text: rest.slice(0, end).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() };
}

/* 데모 매장(review@itdasy.com) 실측과 같은 분포 — 9명, visit_count 0,0,1,1,2,2,1,2,3 → 방문 7명 중 2회+ 4명 = 57% */
const DEMO_VC = [0, 0, 1, 1, 2, 2, 1, 2, 3];
const customers = (vcs, extra = {}) => ({
  items: vcs.map((vc, i) => ({ id: i + 1, name: `손님${i + 1}`, visit_count: vc, created_at: '2026-01-01T00:00:00Z' })),
  total: vcs.length, returned: vcs.length, has_more: false, ...extra,
});

function fakeServer({ cust = customers(DEMO_VC), custFail = false } = {}) {
  const calls = [];
  const apiFetch = jest.fn(async (url) => {
    calls.push(url);
    if (url.startsWith('/revenue')) return okJson({ items: [], total: 0, count: 0 });
    if (url.startsWith('/customers')) {
      if (custFail) return { ok: false, status: 503, json: async () => ({}), headers: { get: () => null } };
      return okJson(cust);
    }
    if (url.startsWith('/today/brief')) return okJson({ upcoming_count: 2, at_risk_count: 5 });
    // 실제 서버와 같은 모양 — summary 에 retention_rate 는 없다
    if (url.startsWith('/retention/at-risk')) {
      return okJson({ items: Array.from({ length: 50 }, (_, i) => ({ customer_id: i })), summary: { total: 50, at_risk: 20, lost: 30 }, has_more: false, returned: 50 });
    }
    return okJson({});
  });
  return { apiFetch, calls };
}

describe('① 내샵관리 대시보드는 /retention/at-risk 를 부르지 않는다 (쓰는 값 0개)', () => {
  test('★ 탭 진입 + 데이터 변경 재로드 — at-risk 호출 0회, 위험 신호는 /today/brief 값 그대로', async () => {
    const { apiFetch, calls } = fakeServer();
    const { win, body } = loadDashboard({ apiFetch });
    await win.initDashboardTab();
    await flush();
    const onChange = win.addEventListener.mock.calls.find(([ev]) => ev === 'itdasy:data-changed');
    expect(onChange).toBeTruthy();
    await onChange[1]();
    await flush();
    expect(calls.filter((u) => u.split('?')[0] === '/retention/at-risk')).toEqual([]);
    expect(body.innerHTML).toContain('5명');   // 위험 신호 = brief.at_risk_count
    expect(body.innerHTML).toContain('2건');   // 오늘 예약 = brief.upcoming_count
  });
});

describe('② 재방문율 = 2회 이상 방문 ÷ 1회 이상 방문 (이미 받는 /customers 로)', () => {
  test('★ 데모 분포 9명 → 57% · 근거 "방문 손님 7명 중 4명"', async () => {
    const { apiFetch } = fakeServer();
    const { win, body } = loadDashboard({ apiFetch });
    await win.initDashboardTab();
    await flush();
    const cell = revisitCell(body.innerHTML);
    expect(cell.val).toBe('57%');
    expect(cell.text).toContain('방문 손님 7명 중 4명');
  });

  test('★ 고객이 첫 페이지보다 많으면(250명 중 200명만 받음) % 를 내지 않고 미집계 + 이유', async () => {
    // 최근 등록 200명은 신규 쪽으로 치우친 표본 — 여기서 낸 % 는 매장 재방문율이 아니다
    const vcs = Array.from({ length: 200 }, (_, i) => (i % 2 ? 2 : 1));
    const { apiFetch } = fakeServer({ cust: customers(vcs, { total: 250, has_more: true }) });
    const { win, body } = loadDashboard({ apiFetch });
    await win.initDashboardTab();
    await flush();
    const cell = revisitCell(body.innerHTML);
    expect(cell.val).toBe('미집계');
    expect(cell.val).not.toMatch(/%/);
    expect(cell.text).toContain('고객 250명 중 200명만 받아');
  });

  test('방문 기록이 하나도 없으면 "방문 기록 없음"(0% 로 꾸미지 않음)', async () => {
    const { apiFetch } = fakeServer({ cust: customers([0, 0, 0]) });
    const { win, body } = loadDashboard({ apiFetch });
    await win.initDashboardTab();
    await flush();
    expect(revisitCell(body.innerHTML).val).toBe('방문 기록 없음');
  });

  test('★ /customers 실패 — "불러오지 못함"(빈 목록으로 바꿔 "방문 기록 없음" 이라 하지 않음)', async () => {
    const { apiFetch } = fakeServer({ custFail: true });
    const { win, body } = loadDashboard({ apiFetch });
    await win.initDashboardTab();
    await flush();
    const cell = revisitCell(body.innerHTML);
    expect(cell.val).toBe('불러오지 못함');
    expect(cell.text).not.toContain('방문 기록 없음');
  });

  test('부팅 SWR(pv_cache::customers {d: items, n: total}) 로 그린 첫 화면도 같은 계산', async () => {
    const c = customers(DEMO_VC);
    const session = new Map([['pv_cache::customers', JSON.stringify({ t: Date.now(), d: c.items, n: c.total })]]);
    const never = () => new Promise(() => {});
    const { win, body } = loadDashboard({ apiFetch: jest.fn(never), session });
    win.initDashboardTab();
    await flush();
    expect(revisitCell(body.innerHTML).val).toBe('57%');
  });

  test('부팅 SWR 이 첫 페이지뿐(n=250 > d 200개)이면 첫 화면도 미집계', async () => {
    const c = customers(Array.from({ length: 200 }, () => 2), { total: 250 });
    const session = new Map([['pv_cache::customers', JSON.stringify({ t: Date.now(), d: c.items, n: 250 })]]);
    const never = () => new Promise(() => {});
    const { win, body } = loadDashboard({ apiFetch: jest.fn(never), session });
    win.initDashboardTab();
    await flush();
    expect(revisitCell(body.innerHTML).val).toBe('미집계');
  });
});
