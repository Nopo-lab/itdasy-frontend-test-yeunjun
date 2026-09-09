/**
 * [P1 2026-09-09] "고객 메모에 …추가해줘" 가 **고객 추가**로 분류되던 것
 *
 * 실측(실 Chrome, 배포본 28acf12):
 *   "박서준님 고객 메모에 파마약 알러지 있음 추가해줘"
 *     → "박서준님은 고객 명단에 이미 있어요. 이 고객님 맞나요?"
 *     → 선택지: [맞아요 … 기록 열기] [… 새 고객으로 추가] [아니에요]
 *   원장이 요청한 **메모 추가가 선택지에 없다** — 원하던 작업을 아예 못 한다.
 *   (특수한 테스트 이름 때문이 아니다. 평범한 한국 이름으로도 그대로 재현된다)
 *
 * 원인: `_looksAddCustomer` 의 제외 목록에 예약·매출·사진·기록·문자·캡션·홍보·가격표·템플릿은
 * 있는데 **메모만 빠져 있었다.** '고객' + '추가' 가 같이 있으면 전부 고객 추가로 봤다.
 *
 * 표현을 바꿔 "…님은 파마약 알러지 있어. 고객 메모에 남겨줘" 라고 하면 정상적으로
 * 메모 확인 카드가 뜬다 — 같은 의도인데 '추가' 라는 단어 하나로 갈렸다.
 */
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'assistant', 'core', 'customer-add-guard.js'), 'utf8');

function looksAddCustomer() {
  const m = SRC.match(/return !\/\(([^)]*)\)\/\.test\(t\);/);
  expect(m).toBeTruthy();
  const EX = new RegExp('(' + m[1] + ')');
  return (t) => {
    if (!/(고객|손님)/.test(t) || !/(추가|등록|만들|넣어)/.test(t)) return false;
    return !EX.test(t);
  };
}

describe('고객 추가 가드가 다른 도메인을 삼키지 않는다', () => {
  const looks = looksAddCustomer();

  test.each([
    ['박서준님 고객 메모에 파마약 알러지 있음 추가해줘'],
    ['김호영님 고객 메모 추가해줘'],
    ['이 고객 특이사항 추가해줘'],
    ['박서준님 회원권 충전 고객 추가'],
    ['박서준님 예약 추가해줘'],
    ['매출 기록 추가해줘'],
  ])('고객 추가가 아니다: %s', (q) => {
    expect(looks(q)).toBe(false);
  });

  test.each([
    ['박서준 고객 추가해줘'],
    ['새 손님 등록해줘'],
    ['박서준님 고객으로 만들어줘'],
    ['홍길동 손님 넣어줘'],
  ])('고객 추가가 맞다: %s', (q) => {
    expect(looks(q)).toBe(true);
  });

  test('제외 목록에 메모류가 들어 있다', () => {
    const m = SRC.match(/return !\/\(([^)]*)\)\/\.test\(t\);/);
    for (const w of ['메모', '알러지', '특이사항', '회원권']) {
      expect(m[1]).toContain(w);
    }
  });

  test('이름 추출이 도메인 단어를 이름으로 잡지 않는다', () => {
    const m = SRC.match(/const stops = new Set\(\[([^\]]*)\]\)/);
    expect(m).toBeTruthy();
    for (const w of ['메모', '회원권', '잔액']) {
      expect(m[1]).toContain(w);
    }
  });
});
