/** @jest-environment jsdom */
/* [2026-10-01 mobile-ux-05] 입력 포커스 시 저장 버튼이 iOS 키보드에 가린다
 *   (고객 추가 '추가' 713/844 · 매출 입력 '기록하기' 826/844 · 예약 폼 '예약 저장' 834/844 · 잇비 입력창).
 *  iOS(WKWebView) 는 키보드가 떠도 레이아웃 뷰포트가 안 줄어서 position:fixed/sticky 하단 요소가
 *  키보드 뒤에 남는다. 안드로이드는 innerHeight 가 같이 줄어 스크롤로 닿는다(kb2.json).
 *  app-core.js 의 visualViewport 보정이 탭바(--tab-bar-bottom)에만 걸려 있었다.
 *  수정: 그 핸들러를 공용 훅(window.ViewportKeyboard)으로 빼서
 *    - html.kb-open + --kb-inset(레이아웃 뷰포트 아래쪽이 키보드에 가린 px) 를 공급하고
 *    - 키보드가 뜨면 포커스된 입력칸을 scrollIntoView({block:'center'}) 한다.
 *  모달/폼은 --kb-inset 만큼 하단 여백·max-height 를 줄여 저장 버튼이 키보드 위로 올라오게 한다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CORE = read('app-core.js');

function extractHook() {
  const start = CORE.indexOf('(function _viewportKeyboardHook()');
  expect(start).toBeGreaterThan(-1);
  const end = CORE.indexOf('\n})();', start);
  return CORE.slice(start, end + '\n})();'.length);
}

function makeVV(h) {
  const listeners = {};
  return {
    height: h, offsetTop: 0,
    addEventListener: (t, fn) => { listeners[t] = fn; },
    fire: (t) => { if (listeners[t]) listeners[t](); jest.advanceTimersByTime(20); },  // rAF(16ms) 가짜 타이머로 흘려보낸다
  };
}

describe('공용 훅 window.ViewportKeyboard', () => {
  let vv;
  beforeEach(() => {
    document.documentElement.className = '';
    document.documentElement.removeAttribute('style');
    document.body.innerHTML = '<div id="custEditModal"><div style="overflow:auto"><input id="cedName"><button id="custEditSave">추가</button></div></div>';
    vv = makeVV(844);
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true, writable: true });
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true, writable: true });
    jest.useFakeTimers();                       // 먼저 — 뒤에 부르면 rAF 스텁까지 가짜 타이머로 덮는다
    window.requestAnimationFrame = (fn) => setTimeout(fn, 16);   // 실제 브라우저처럼 비동기
    Element.prototype.scrollIntoView = jest.fn();
    // eslint-disable-next-line no-new-func
    new Function(extractHook())();
  });
  afterEach(() => { jest.useRealTimers(); });

  test('훅이 전역에 노출된다 (inset / open)', () => {
    expect(typeof window.ViewportKeyboard).toBe('object');
    expect(window.ViewportKeyboard.open).toBe(false);
    expect(window.ViewportKeyboard.inset).toBe(0);
  });

  test('키보드(300px)가 뜨면 html.kb-open + --kb-inset:300px', () => {
    vv.height = 544; vv.fire('resize');
    expect(document.documentElement.classList.contains('kb-open')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--kb-inset')).toBe('300px');
    expect(window.ViewportKeyboard.inset).toBe(300);
    // 탭바 보정(--tab-bar-bottom)은 그대로 유지된다
    expect(document.documentElement.style.getPropertyValue('--tab-bar-bottom')).toMatch(/300px/);
  });

  test('iOS 가 페이지를 같이 스크롤해 offsetTop 이 키보드 높이를 상쇄하면 inset 은 0 이하로 내려가지 않는다', () => {
    vv.height = 377; vv.offsetTop = 337; window.innerHeight = 696;
    vv.fire('resize');
    expect(document.documentElement.classList.contains('kb-open')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--kb-inset')).toBe('0px');
  });

  test('키보드가 뜨면 포커스된 입력칸을 가운데로 scrollIntoView 한다', () => {
    const input = document.getElementById('cedName');
    input.focus();
    vv.height = 544; vv.fire('resize');
    jest.advanceTimersByTime(400);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    const args = Element.prototype.scrollIntoView.mock.calls[0][0];
    expect(args && args.block).toBe('center');
  });

  test('키보드가 내려가면 kb-open 해제 + --kb-inset 0px', () => {
    vv.height = 544; vv.fire('resize');
    vv.height = 844; vv.fire('resize');
    expect(document.documentElement.classList.contains('kb-open')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--kb-inset')).toBe('0px');
  });
});

describe('--kb-inset 을 쓰는 화면들', () => {
  test('고객 추가 모달 (app-customer-dashboard.js) — 오버레이 하단 여백 + 카드 max-height', () => {
    const js = read('app-customer-dashboard.js');
    expect(js).toMatch(/wrap\.id = 'custEditModal';[\s\S]{0,400}padding:20px 20px calc\(20px \+ var\(--kb-inset,\s*0px\)\)/);
    expect(js).toMatch(/max-height:min\(88vh,\s*calc\(100vh - 40px - var\(--kb-inset,\s*0px\)\)\)/);
  });
  test('매출 입력 바텀시트 (app-revenue.js)', () => {
    const js = read('app-revenue.js');
    expect(js).toMatch(/modal\.id = 'rvAddModal';[\s\S]{0,300}padding-bottom:var\(--kb-inset,\s*0px\)/);
    expect(js).toMatch(/max-height:calc\(92vh - var\(--kb-inset,\s*0px\)\)/);
  });
  test('예약관리 모바일 루트 (#cal-overlay) — 키보드만큼 하단 패딩 → sticky .bf-cta 가 키보드 위로', () => {
    const css = read('style-components.css');
    expect(css).toMatch(/html\.kb-open #cal-overlay\.bk-root--mobile\s*\{[^}]*padding-bottom:\s*var\(--kb-inset/);
  });
  test('잇비 시트 패널 (app-assistant.js) — bottom 과 max-height 에 --kb-inset', () => {
    const js = read('app-assistant.js');
    expect(js).toMatch(/id="assistantSheetPanel" style="[^"]*inset:auto 0 var\(--kb-inset,\s*0px\) 0/);
    expect(js).toMatch(/id="assistantSheetPanel" style="[^"]*max-height:calc\(100% - var\(--kb-inset,\s*0px\)\)/);
  });
});
