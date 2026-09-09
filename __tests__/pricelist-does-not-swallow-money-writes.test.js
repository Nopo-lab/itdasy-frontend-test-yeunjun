/* [P0 2026-09-09] 돈을 **쓰는** 요청이 "가격표 초안"으로 통째로 새고 있었다.
 *
 * 실측(배포본 6be453c · 실 Chrome · 잇비 대화창):
 *   Q "오늘 매출 50000원 입력해줘"
 *   A "가격표 초안을 만들었어요.
 *      - 오늘 매출 50,000원
 *      - 원 입력해줘
 *      다음 단계에서 템플릿에 바로 적용할 수 있게 연결할게요."   [가격표 템플릿에 적용]
 *   → 매출 레코드 6건 그대로. 요청이 조용히 사라지고 엉뚱한 기능이 답했다.
 *
 *   Q "E2E_A_박지우님 회원권 30000원 충전해줘"  → 같은 가격표 초안 · 잔액 100,000원 그대로
 *
 * 원인: `parsePriceListRequest` 의 `rows.length >= 2`.
 *   "…50000원 입력해줘" 가 금액 토큰에서 잘려 "오늘 매출|50,000원" + "원 입력해줘" 두 줄이 되어
 *   가격표 두 줄로 보인다. 바로 그 위에 제외 가드가 이미 있었는데 **`예약` 하나만** 막고 있었다.
 *
 * 막는 기준은 명사가 아니라 **동작**이다 — 가격표에 "회원권 10만원" 을 적는 건 정상이므로
 * 명사만으로 막으면 진짜 가격표를 죽인다. 이 테스트가 양쪽을 같이 고정한다.
 */
const fs = require('fs');
const path = require('path');

function loadPriceList() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'assistant', 'core', 'action-hub.js'), 'utf8');
  const win = {};
  const doc = { createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }),
                querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', src)(win, doc);
  return win.ItdasyAssistantPriceList;
}

const P = loadPriceList();

describe('돈 쓰기 요청은 가격표로 가로채지 않는다', () => {
  test.each([
    ['회원권 충전', 'E2E_A_박지우님 회원권 30000원 충전해줘'],
    ['회원권 사용', 'E2E_A_박지우님 회원권에서 30000원 사용해줘'],
    ['매출 추가', 'E2E_A_박지우님에게 50000원 매출 추가해줘'],
    ['매출 입력', '오늘 매출 50000원 입력해줘'],
    ['환불', 'E2E_A_박지우님 30000원 환불해줘'],
    ['정산', '회원권 20000원 정산해줘'],
    ['잔액 차감', '잔액에서 15000원 차감해줘'],
    ['예약(기존 가드 회귀)', 'E2E_A_박지우님 내일 3시 예약 잡아줘 50000원'],
  ])('%s: %s', (_tag, q) => {
    expect(P.parseRequest(q).matched).toBe(false);
  });
});

describe('진짜 가격표는 그대로 만들어진다 (제외어를 늘리다 기능을 죽이지 않았는지)', () => {
  test.each([
    ['명시 의도', '컷 20000원 펌 80000원 가격표 만들어줘'],
    ['회원권이 들어간 가격표', '회원권 100000원 컷 20000원'],
    ['업종 추론', '네일 30000원 페디 40000원'],
    ['가격표 + 회원권 둘 다', '회원권 100000원 컷 20000원 가격표 만들어줘'],
  ])('%s: %s', (_tag, q) => {
    expect(P.parseRequest(q).matched).toBe(true);
  });
});

describe('제외 가드가 명사만 보지 않는다 (구조)', () => {
  /* "회원권" 이라는 낱말만으로 막으면 원장이 회원권을 넣은 가격표를 못 만든다.
     동작(충전·입력·환불…)이 함께 있을 때만 빠져야 한다. */
  test('돈 명사만 있고 쓰기 동작이 없으면 가격표로 본다', () => {
    expect(P.parseRequest('회원권 100000원').matched).toBe(true);
    expect(P.parseRequest('매출 관리 컷 20000원 펌 50000원').matched).toBe(true);
  });

  test('쓰기 동작만 있고 돈 명사가 없으면 가격표로 본다', () => {
    expect(P.parseRequest('컷 20000원 펌 50000원 등록해줘').matched).toBe(true);
  });
});
