/**
 * [2026-09-09] 전체화면 오버레이 뒤로가기 등록 가드
 *
 * 전수 조사: `position:fixed; inset:0` 오버레이를 쓰는 파일 50개 중 **32개가 미등록**이었다.
 * 미등록이면 원장이 뒤로가기를 눌렀을 때 그 오버레이는 남고 **뒤 화면이 대신 닫힌다**.
 * 실측(실 Chrome, 배포본): 예약 폼 → 고객 선택창 → back
 *   → hash #cvBookingForm → #booking (예약 폼이 닫힘) · 선택창은 그대로.
 * 안드로이드 하드웨어 백은 같은 경로 — 스택이 비면 앱이 꺼진다.
 *
 * 하나씩 손으로 고치기 어려운 이유: 파일마다 닫기 지점이 4~7곳(remove · display:none ·
 * 배경탭 · × · ESC · 성공 후 자동닫기)이라 하나만 빠져도 유령 hash 가 남는다
 * (그게 "뒤로가기 한 번 먹통" 의 원인 — app-core.js _markSheetClosed 주석 참고).
 * → 여는 곳 한 줄(`_bindSheetBack`)만 부르고 닫힘은 DOM 에서 관찰한다.
 */
const fs = require('fs');
const path = require('path');
const R = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const CORE = R('app-core.js');

describe('_bindSheetBack 헬퍼', () => {
  test('app-core 에 정의돼 있고 레지스트리 규약을 지킨다', () => {
    expect(CORE).toMatch(/window\._bindSheetBack\s*=\s*function/);
    const i = CORE.indexOf('window._bindSheetBack = function');
    const body = CORE.slice(i, i + 3200);
    expect(body).toMatch(/window\._registerSheet\(name, closeFn\)/);
    expect(body).toMatch(/window\._markSheetOpen\(name\)/);
    expect(body).toMatch(/window\._markSheetClosed\(name\)/);
  });

  test('닫힘을 DOM 에서 관찰한다(닫기 지점을 손으로 안 붙여도 되게)', () => {
    const i = CORE.indexOf('window._bindSheetBack = function');
    const body = CORE.slice(i, i + 3200);
    expect(body).toMatch(/MutationObserver/);
    expect(body).toMatch(/isConnected/);
    expect(body).toMatch(/display !== 'none'/);   // 가시성 판정 (BUG-D 로 방향이 뒤집힘)
    expect(body).toMatch(/childList: true/);
  });

  test('같은 창을 다시 열어도 중복 등록하지 않는다(스택 어긋남 방지)', () => {
    const i = CORE.indexOf('window._bindSheetBack = function');
    const body = CORE.slice(i, i + 3200);
    expect(body).toMatch(/sheetBound === name/);
  });

  /* [2026-09-11 BUG-D 계약 재정의] 예전엔 `done` 래치로 "닫힘은 한 번만" 을 보장했다.
     그 래치가 곧 결함이었다 — 한 번 닫히면 observer 를 끊어서, 유지형 시트가
     **두 번째 오픈부터 미등록**으로 열렸다(back 이 뒤 화면을 닫는다).
     지켜야 할 것은 그대로다: 같은 상태가 반복돼도 중복 통지하지 않는다.
     수단만 래치 → **가시성 전이 가드**로 바꾼다. */
  test('같은 상태가 반복돼도 중복 통지하지 않는다 (전이에서만 움직인다)', () => {
    const i = CORE.indexOf('window._bindSheetBack = function');
    const body = CORE.slice(i, i + 3200);
    expect(body).toMatch(/if \(v !== open\)/);
    expect(body).toMatch(/open = v;/);
  });
});

describe('작업 중 데이터가 있는 오버레이가 등록돼 있다', () => {
  const cases = [
    ['app-membership.js', 'membershipSheet', '회원권 충전(돈)'],
    ['app-customer-memo.js', 'cmMemoSearch', '고객 메모 검색'],
    ['app-caption.js', 'captionScenario', '캡션 시나리오 선택'],
    ['app-caption.js', 'captionPublishPreview', '캡션 발행 미리보기'],
    ['app-gallery-write.js', 'writePublishPreview', '글쓰기 발행 미리보기'],
    ['app-customer.js', 'customerPick', '고객 선택창'],
  ];
  test.each(cases)('%s — %s (%s)', (file, id) => {
    const src = R(file);
    if (id === 'customerPick') {
      // pick() 은 _registerSheet 를 직접 쓴다(닫기 계약이 하나뿐이라 헬퍼 불필요)
      expect(src).toMatch(/_registerSheet\(SHEET_ID/);
      expect(src).toMatch(/SHEET_ID = 'customerPick'/);
      return;
    }
    expect(src).toMatch(new RegExp("_bindSheetBack\\('" + id + "'"));
  });
});
