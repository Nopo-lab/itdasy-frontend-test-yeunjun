/**
 * @jest-environment jsdom
 */
/* [BUG-1] 회원권 충전 시트가 고객 화면 뒤에 깔려 보이지 않던 것.
 *
 * 실측(라이브 c3bf4ca, 실 Chrome): 고객 상세에서 [회원권] → hash 는 `#membershipSheet` 로 바뀌고
 * 시트도 만들어지고 `/memberships/711/history` 도 200 인데 **화면에는 아무것도 안 보였다.**
 * `elementFromPoint(시트 중앙)` 이 시트가 아니라 고객 상세의 `.cd-memory-head` 를 돌려줬다.
 *
 * 이 테스트는 문자열을 찾지 않는다. **각 오버레이의 실제 소스에서 z-index 를 파싱해
 * 숫자 관계(사다리)를 검증**한다. 그래서 누가 회원권을 다시 내리든, 고객 화면을
 * 회원권 위로 올리든 양쪽 다 잡힌다.
 */
const fs = require('fs');
const path = require('path');

/* z-index 를 **실제 코드에서만** 뽑는다.
 * 주석 제거(stripComments)는 이 파일에서 못 쓴다 — app-membership.js 앞쪽에 짝이 안 맞는
 * `/*` 가 있어 블록 제거가 진짜 코드까지 삼킨다(실측: `el.id = 'membershipSheet'` 가 사라졌다).
 * 대신 **구조로** 막는다: `style.cssText = '...'` 문자열 리터럴 안의 z-index 만 읽는다.
 * 설명 주석은 이 형태를 가질 수 없으므로 문서 한 줄이 가드를 통과시키지 못한다. */
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/** `anchor` 뒤에 처음 나오는 `style.cssText = '...z-index:N...'` 의 N. */
function zAfter(file, anchor) {
  const src = read(file);
  const at = anchor ? src.indexOf(anchor) : 0;
  if (at < 0) throw new Error(`${file}: anchor "${anchor}" 없음 — 구조가 바뀌었으면 이 테스트부터 고쳐라`);
  const m = src.slice(at).match(/style\.cssText\s*=\s*'[^']*z-index:\s*(\d+)/);
  if (!m) throw new Error(`${file}: "${anchor}" 뒤에서 cssText z-index 를 못 찾음`);
  return parseInt(m[1], 10);
}

// 실제 배포되는 값들 (전부 코드에서 파싱)
const Z = {
  customerList: zAfter('app-customer.js', "id = 'customerSheet'"),
  assistant:    zAfter('app-assistant.js', "id = 'assistantSheet'"),
  customerDash: zAfter('app-customer-dashboard.js', "id = 'customerDashSheet'"),
  membership:   zAfter('app-membership.js', "el.id = 'membershipSheet'"),
};

describe('오버레이 사다리 · 회원권 충전 시트', () => {
  test('🔴 회원권 시트가 고객 목록보다 위에 있다', () => {
    // 목록(9998)이 위면 스와이프 경로에서 시트가 안 보인다.
    expect(Z.membership).toBeGreaterThan(Z.customerList);
  });

  test('🔴 회원권 시트가 고객 상세보다 위에 있다', () => {
    // 상세(10600)가 위면 [회원권] 버튼이 죽은 버튼이 된다 — 이번에 실제로 그랬다.
    expect(Z.membership).toBeGreaterThan(Z.customerDash);
  });

  test('회원권 시트가 잇비보다 위에 있다', () => {
    // 잇비 단축키는 여는 쪽을 먼저 닫지만, 순서까지 맞아야 이중 방어가 된다.
    expect(Z.membership).toBeGreaterThan(Z.assistant);
  });

  test('기존 사다리 관계를 깨지 않았다 (잇비 < 고객상세)', () => {
    // 핫픽스D #3 이 만든 관계. 이게 뒤집히면 "채팅에서 고객 기록 열기"가 다시 뒤에 깔린다.
    expect(Z.customerDash).toBeGreaterThan(Z.assistant);
  });

  test('회원권 시트가 DM 미리보기(10700)보다는 아래다 — 필요 이상으로 올리지 않았다', () => {
    // 문제를 "제일 위로 올려서" 덮지 않았는지 본다. 최소 수정의 증거.
    expect(Z.membership).toBeLessThan(10700);
  });

  test('사다리 전체가 의도한 순서다', () => {
    const ladder = [Z.customerList, Z.assistant, Z.customerDash, Z.membership];
    const sorted = [...ladder].sort((a, b) => a - b);
    expect(ladder).toEqual(sorted);            // 고객목록 < 잇비 < 고객상세 < 회원권
    expect(new Set(ladder).size).toBe(4);      // 같은 값이 겹치면 순서가 DOM 순서에 좌우된다
  });
});

describe('실제 DOM 에서 회원권 시트가 위에 쌓이는가', () => {
  /* jsdom 은 페인팅을 안 하지만, 이 오버레이들은 전부 **body 직계 · position:fixed ·
     transform 없음** 이라 스택 순서가 z-index 숫자만으로 결정된다(실측으로 부모 체인이
     BODY 하나인 것을 확인했다). 그래서 실제 cssText 를 그대로 붙여 계산된 값을 비교한다. */
  test('실제 cssText 를 적용했을 때 계산된 z-index 가 고객 상세보다 크다', () => {
    const src = read('app-membership.js');
    const at = src.indexOf("el.id = 'membershipSheet'");
    const css = src.slice(at).match(/style\.cssText\s*=\s*'([^']*)'/)[1];

    const dash = document.createElement('div');
    dash.style.cssText = 'position:fixed;inset:0;z-index:10600;display:none;background:#fff;overflow-y:auto;';
    const ms = document.createElement('div');
    ms.style.cssText = css;
    document.body.appendChild(dash);
    document.body.appendChild(ms);

    const zDash = parseInt(getComputedStyle(dash).zIndex, 10);
    const zMs = parseInt(getComputedStyle(ms).zIndex, 10);
    expect(Number.isFinite(zMs)).toBe(true);
    expect(zMs).toBeGreaterThan(zDash);

    document.body.removeChild(dash);
    document.body.removeChild(ms);
  });
});
