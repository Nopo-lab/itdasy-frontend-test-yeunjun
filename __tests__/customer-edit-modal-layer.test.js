/**
 * @jest-environment jsdom
 */
/* 고객 추가/편집 모달(#custEditModal)은 **레이어로 등록돼 있어야 한다.**
 *
 * 실측 재현 (2026-09-02, 배포본 6227fbf · 실계정 · PC 1919×863):
 *   고객관리 → [+] → ESC
 *     기대: 맨 위 모달이 닫힌다
 *     실제: **아래 시트(customerSheet)가 닫히고 모달은 남았다**
 *   이어서 사이드바 → 매출관리
 *     기대: 매출 화면이 보인다
 *     실제: 매출 시트는 열렸지만 모달이 계속 덮었다 — z-index 10010 > 사이드바 10000 이라
 *           **앱 전체가 가려진다.** 탈출구는 모달의 [취소] 하나뿐.
 *
 * 원인은 하나다: 이 모달만 어느 레이어 스택에도 등록돼 있지 않았다.
 *   - `_registerSheet` / `_markSheetOpen` 없음 → 안드로이드 뒤로가기가 모름
 *   - `_onSheetKeydown` 의 ESC 분기가 `_isDetailOpen` 만 보고 모달은 안 봄
 *   - `_closeAllHubs` 목록에 없음 → 사이드바 이동이 안 치움
 *
 * 여기서 잠그는 것: 세 경로 전부.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const DASHBOARD = read('app-customer-dashboard.js');
const CUSTOMER = read('app-customer.js');
const UNIFIER = read('app-side-nav-unifier.js');

/** 주석을 지운다 — 설명문 한 줄이 가드를 통과시키면 안 된다 */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('모달이 레이어 스택에 등록된다', () => {
  test('여는 쪽이 _registerSheet + _markSheetOpen 을 부른다 (안드로이드 뒤로가기)', () => {
    const src = stripComments(DASHBOARD);
    const open = src.slice(src.indexOf('_openCustomerEditSheet'));
    expect(open).toMatch(/_registerSheet\?\.\(\s*'custEdit'/);
    expect(open).toMatch(/_markSheetOpen\?\.\(\s*'custEdit'/);
  });

  test('닫는 쪽이 _markSheetClosed 를 부른다 (먹통 뒤로가기 누적 방지)', () => {
    const src = stripComments(DASHBOARD);
    expect(src).toMatch(/wrap\.remove\(\)[\s\S]{0,120}_markSheetClosed\?\.\(\s*'custEdit'/);
  });

  test('ESC 는 맨 위 모달부터 닫는다 — 아래 시트를 먼저 닫으면 안 된다', () => {
    const src = stripComments(CUSTOMER);
    const esc = src.slice(src.indexOf("e.key === 'Escape'"), src.indexOf("e.key !== 'Tab'"));
    // custEditModal 검사가 closeCustomers() 보다 **앞**에 있어야 한다
    const idxModal = esc.indexOf('custEditModal');
    const idxClose = esc.indexOf('closeCustomers');
    expect(idxModal).toBeGreaterThan(-1);
    expect(idxClose).toBeGreaterThan(-1);
    expect(idxModal).toBeLessThan(idxClose);
  });

  test('사이드바 이동이 모달을 치운다', () => {
    const src = stripComments(UNIFIER);
    const body = src.slice(src.indexOf('function _closeAllHubs'), src.indexOf('window._closeAllHubs = _closeAllHubs'));
    expect(body).toMatch(/custEditModal/);
    expect(body).toMatch(/custEditModal'\)\?\.remove\(\)/);
  });
});

describe('실제 DOM 동작', () => {
  const mkModal = () => {
    const w = document.createElement('div');
    w.id = 'custEditModal';
    w.style.cssText = 'position:fixed;inset:0;z-index:10010;display:flex;';
    document.body.appendChild(w);
    return w;
  };

  beforeEach(() => {
    document.body.innerHTML = `
      <aside id="sideNav">
        <button class="ms-side__item" data-static-action="tab-home"><span class="ms-side__label">홈</span></button>
        <button class="ms-side__item" data-static-action="revenue"><span class="ms-side__label">매출관리</span></button>
      </aside>
      <div id="customerSheet" style="display:flex"></div>`;
    window._markSheetClosed = jest.fn();
    // eslint-disable-next-line no-new-func
    new Function(UNIFIER).call(window);
  });

  test('사이드바를 누르면 모달이 DOM 에서 사라진다 (숨김이 아니라 제거)', () => {
    mkModal();
    expect(document.getElementById('custEditModal')).not.toBeNull();

    document.querySelector('[data-static-action="revenue"]').click();

    // display:none 으로 숨기면 유령 노드가 남아 다음에 열 때 중복된다 → 반드시 제거
    expect(document.getElementById('custEditModal')).toBeNull();
  });

  test('모달이 없을 때도 안전하다 (optional chaining)', () => {
    expect(() => document.querySelector('[data-static-action="tab-home"]').click()).not.toThrow();
  });
});

describe('z-index 전제 — 이 모달은 사이드바보다 위다', () => {
  test('10010 > 10000 이라 사이드바로도 가릴 수 없다 (그래서 등록이 필수)', () => {
    const m = DASHBOARD.match(/custEditModal[\s\S]{0,300}?z-index:(\d+)/);
    expect(m).toBeTruthy();
    const modalZ = Number(m[1]);
    const css = read('style-components.css');
    const navM = css.match(/\.side-nav[^{]*\{[^}]*z-index:\s*(\d+)/);
    const navZ = navM ? Number(navM[1]) : 10000;
    expect(modalZ).toBeGreaterThan(navZ);
  });
});
