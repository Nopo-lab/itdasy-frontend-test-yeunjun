/**
 * [P0 2026-09-09] 고객 행 id 타입 불일치 가드
 *
 * 실 Chrome(운영 스테이징) 실측으로 잡은 것:
 *   row.dataset.id === "682" (문자열)  ·  _cache[].id === 682 (서버 JSON 숫자)
 *   → `x.id === customerId` 가 항상 false → `if (!c) return` 으로 조용히 종료.
 *
 * 실제 피해 3가지:
 *   1) _openSwipeActions  : 스와이프 액션시트가 한 번도 안 열림
 *                           → 회원권 충전의 **유일한 진입점**이 죽어 앱에서 회원권 사용 불가
 *                              (매출 입력·예약 잡기 버튼도 같은 시트에 있어 함께 죽음)
 *   2) _confirmDelete     : 왼쪽 스와이프 삭제가 무반응
 *   3) window._customerDelete : 회원권 잔액 보호 가드가 늘 bal=0 으로 판정
 *                           → 잔액 50,000원 남은 손님도 경고 없이 삭제 확인창으로 직행 (돈)
 *
 * 이 저장소의 정착된 패턴은 String() 정규화다(app-calendar-view.js:1533,1554,1581 ·
 * app-dm-manual-replies.js:304). app-customer.js 만 빠져 있었다.
 */
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'app-customer.js'), 'utf8');

function bodyAfter(marker, len = 900) {
  const i = SRC.indexOf(marker);
  expect(i).toBeGreaterThan(-1);
  return SRC.slice(i, i + len);
}

describe('고객 id 비교는 String 정규화를 거친다', () => {
  test('_openSwipeActions — 회원권/매출/예약 시트 진입', () => {
    const b = bodyAfter('function _openSwipeActions(');
    expect(b).toMatch(/String\(x\.id\)\s*===\s*String\(customerId\)/);
    expect(b).not.toMatch(/x\.id\s*===\s*customerId/);
  });

  test('_confirmDelete — 스와이프 삭제', () => {
    const b = bodyAfter('function _confirmDelete(');
    expect(b).toMatch(/String\(x\.id\)\s*===\s*String\(customerId\)/);
    expect(b).not.toMatch(/x\.id\s*===\s*customerId/);
  });

  test('_customerDelete — 회원권 잔액 보호 가드(돈)', () => {
    const b = bodyAfter('window._customerDelete = function');
    expect(b).toMatch(/String\(x\.id\)\s*===\s*String\(id\)/);
    expect(b).not.toMatch(/find\(x => x\.id === id\)/);
  });

  test('파일 전체에 dataset 유래 id 를 === 로 비교하는 잔재가 없다', () => {
    const bad = SRC.match(/\.find\(\s*x\s*=>\s*x\.id\s*===\s*(customerId|id)\s*\)/g) || [];
    expect(bad).toEqual([]);
  });

  test('실제 동작 재현 — 숫자 id 목록에서 문자열 키로 찾기', () => {
    const cache = [{ id: 682, name: 'ZZ9감사_수렴테스트', membership_balance: 50000 }];
    const datasetId = '682';           // row.dataset.id 가 주는 값
    // 고친 방식이라야 찾는다
    const fixed = cache.find((x) => String(x.id) === String(datasetId));
    expect(fixed).toBeTruthy();
    expect(Number(fixed.membership_balance)).toBe(50000);
    // 예전 방식은 못 찾고 잔액 가드가 0 으로 무너진다
    const buggy = cache.find((x) => x.id === datasetId);
    expect(buggy).toBeUndefined();
    expect(Number(buggy && buggy.membership_balance) || 0).toBe(0);
  });
});
