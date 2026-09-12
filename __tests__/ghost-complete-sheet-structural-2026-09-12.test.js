/**
 * @jest-environment jsdom
 *
 * BUG-D 구조적 보강 — 예약관리 진입은 **어떤 경로로 남았든** 유령 완료 시트를 안 본다.
 *
 * 라이브 실측 당시: 예약관리로 들어가니 완료 시트가 떠 있는데 `startFromBooking` 호출은 0회였다.
 * = 새로 연 게 아니라 **안 닫힌 것**. 2026-09-11 에 뒤로가기 등록(`_bindSheetBack`)을 고쳤지만
 * 그건 back 경로 하나뿐이다. 달력을 여는 곳에서 치우면 남은 경로 전부가 닫힌다.
 *
 * 40회 라이브 스윕은 이번 세션에서 브라우저 제약으로 못 돌렸다(보고서 BLOCKED).
 * 그래서 **구조로** 보장되는지를 여기서 본다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CAL = fs.readFileSync(path.join(ROOT, 'app-calendar-view.js'), 'utf8');
const CF = fs.readFileSync(path.join(ROOT, 'app-complete-flow.js'), 'utf8');

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
    CompleteFlow: { close: () => calls.push('complete') },
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
}

describe('BUG-D 구조 · 달력을 열면 남은 완료 시트를 치운다', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  test('🔴 완료 시트가 떠 있으면 닫는다 (유령 시트의 구조적 차단)', () => {
    put('completeFlowSheet', 'flex');
    const { fn, calls } = load();
    fn();
    expect(calls).toContain('complete');
  });

  test('안 떠 있으면 건드리지 않는다 (라우터 스택 오염 방지)', () => {
    put('completeFlowSheet', 'none');
    const { fn, calls } = load();
    fn();
    expect(calls).toEqual([]);
  });

  test('고객 시트와 완료 시트가 같이 떠 있으면 둘 다 치운다', () => {
    put('customerSheet', 'flex');
    put('completeFlowSheet', 'flex');
    const { fn, calls } = load();
    fn();
    expect(calls.sort()).toEqual(['complete', 'list']);
  });

  test('CompleteFlow 가 아직 안 로드돼도 터지지 않는다', () => {
    put('completeFlowSheet', 'flex');
    const body = extractFn(CAL, 'function _closeCoveringCustomerSheets() {');
    const w = { getComputedStyle: (el) => window.getComputedStyle(el) };   // CompleteFlow 없음
    // eslint-disable-next-line no-new-func
    const fn = new Function('window', 'document', 'getComputedStyle',
      body + '\n; return _closeCoveringCustomerSheets;')(w, document, window.getComputedStyle.bind(window));
    expect(() => fn()).not.toThrow();
  });

  test('openCalendarView 가 이 정리를 부른다', () => {
    const i = CAL.indexOf('window.openCalendarView = async function () {');
    expect(CAL.slice(i, i + 300)).toMatch(/_closeCoveringCustomerSheets\(\)/);
  });
});

describe('BUG-D 구조 · 닫는 수단이 공개 API 로 나와 있다', () => {
  test('CompleteFlow.close 가 존재한다 — 없으면 밖에서 정리할 방법이 없다', () => {
    expect(CF).toMatch(/close\(\)\s*\{\s*_close\(\);\s*\}/);
  });

  test('CompleteFlow.isOpen 으로 상태를 물어볼 수 있다', () => {
    expect(CF).toMatch(/isOpen\(\)\s*\{/);
  });

  test('다른 모듈이 DOM 을 직접 만지지 않는다 (관찰자가 닫힘을 놓치지 않게)', () => {
    // 캘린더는 CompleteFlow.close() 만 쓰고 completeFlowSheet 의 style 을 직접 건드리지 않는다
    expect(CAL).not.toMatch(/completeFlowSheet[\s\S]{0,80}style\.display\s*=/);
  });
});
