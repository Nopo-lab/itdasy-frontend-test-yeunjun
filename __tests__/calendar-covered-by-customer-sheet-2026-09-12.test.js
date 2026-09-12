/**
 * @jest-environment jsdom
 *
 * BUG-R1 회귀 — 고객 화면에서 '예약 잡기' 를 누르면 **예약 폼이 고객 시트 뒤에 깔리던 것**.
 *
 * 라이브 실측(2026-09-12, 고객 상세 → 예약 잡기):
 *   주소는 #cvBookingForm 으로 바뀌고 #cal-overlay 는 display:flex(z=9988),
 *   #bk-body 안에 예약 폼이 멀쩡히 렌더돼 있었다. 그런데 화면엔 고객 목록이 보였다.
 *   elementsFromPoint 최상단 = #customerSheet.dt-overlay [z=9998 fixed]  ← 이게 덮고 있었다.
 *   원장 눈엔 "눌렀는데 아무 일도 안 일어난다" 이고, 뒤로가기 스택엔 유령 한 칸이 쌓인다.
 *
 * 같은 사고를 2026-08-15(#40)에 app-customer.js 액션시트 경로에서 이미 고쳤는데,
 * 그 뒤에 생긴 고객 상세 v4 의 '예약 잡기' 는 고객 **상세만** 닫고 목록은 안 닫았다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CAL = fs.readFileSync(path.join(ROOT, 'app-calendar-view.js'), 'utf8');
const CUST = fs.readFileSync(path.join(ROOT, 'app-customer.js'), 'utf8');

function extractFn(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return '';
  let d = 0, started = false;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(i, k + 1); }
  }
  return '';
}

function load() {
  const body = extractFn(CAL, 'function _closeCoveringCustomerSheets() {');
  expect(body).not.toBe('');
  const calls = [];
  const w = {
    closeCustomers: () => calls.push('list'),
    closeCustomerDashboard: () => calls.push('detail'),
    getComputedStyle: (el) => window.getComputedStyle(el),
  };
  // eslint-disable-next-line no-new-func
  const fn = new Function('window', 'document', 'getComputedStyle',
    body + '\n; return _closeCoveringCustomerSheets;')(w, document, window.getComputedStyle.bind(window));
  return { fn, calls };
}

function put(id, display) {
  const el = document.createElement('div');
  el.id = id;
  el.style.display = display;
  document.body.appendChild(el);
  return el;
}

describe('BUG-R1 · 캘린더를 덮는 고객 시트를 먼저 닫는다', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  test('🔴 고객 목록이 떠 있으면 닫는다 (이번 버그 — 9998 이 9988 을 덮는다)', () => {
    put('customerSheet', 'flex');
    const { fn, calls } = load();
    fn();
    expect(calls).toContain('list');
  });

  test('고객 상세가 떠 있으면 그것도 닫는다', () => {
    put('customerDashSheet', 'flex');
    const { fn, calls } = load();
    fn();
    expect(calls).toContain('detail');
  });

  test('둘 다 떠 있으면 둘 다 닫는다', () => {
    put('customerDashSheet', 'flex');
    put('customerSheet', 'flex');
    const { fn, calls } = load();
    fn();
    expect(calls.sort()).toEqual(['detail', 'list']);
  });

  test('🔴 안 보이는 시트는 건드리지 않는다 (라우터 스택 오염 방지)', () => {
    put('customerSheet', 'none');
    put('customerDashSheet', 'none');
    const { fn, calls } = load();
    fn();
    expect(calls).toEqual([]);
  });

  test('시트가 아예 없어도 터지지 않는다', () => {
    const { fn, calls } = load();
    expect(() => fn()).not.toThrow();
    expect(calls).toEqual([]);
  });
});

describe('BUG-R1 · 진입점마다가 아니라 캘린더 한 곳에서 닫는다', () => {
  test('openCalendarView 가 그 정리를 부른다', () => {
    const i = CAL.indexOf('window.openCalendarView = async function () {');
    expect(i).toBeGreaterThan(-1);
    expect(CAL.slice(i, i + 300)).toMatch(/_closeCoveringCustomerSheets\(\)/);
  });

  test('2026-08-15 에 고친 옛 경로의 가드는 그대로 남아 있다 (회귀 방지)', () => {
    expect(CUST).toMatch(/closeCustomers\(\)/);
  });
});
