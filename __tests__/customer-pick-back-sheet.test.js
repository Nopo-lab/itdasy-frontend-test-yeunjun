/**
 * [P1 2026-09-09] 고객 선택창(Customer.pick) 뒤로가기 등록 가드 — 작업 유실 방지
 *
 * 실측(실 Chrome, 배포본 d4f2530):
 *   예약 폼(#cvBookingForm) → 고객 선택창 열기 → 브라우저 뒤로가기 1회
 *     → hash: #cvBookingForm → #booking  (작성 중이던 예약 폼이 닫힘)
 *     → pickStillOpen: 1                  (정작 위에 떠 있던 선택창은 안 닫힘)
 *   원장이 날짜·시간·시술까지 골라 둔 예약이 통째로 날아간다.
 *   안드로이드 하드웨어 백은 같은 경로 — 시트 스택이 비면 앱이 꺼진다.
 *
 * 앱 규약: _registerSheet(id, closeFn) → _markSheetOpen(id) → 닫을 때 _markSheetClosed(id).
 * (app-core.js changePw · app-calendar-view.js cvBookingForm/cvBookingDetail/booking 전부 이 규약)
 */
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'app-customer.js'), 'utf8');

function pickBody() {
  const i = SRC.indexOf('async function pick(opts)');
  expect(i).toBeGreaterThan(-1);
  const j = SRC.indexOf('window.editCustomer', i);
  return SRC.slice(i, j > i ? j : i + 9000);
}

describe('고객 선택창이 뒤로가기로 닫힌다', () => {
  const body = pickBody();

  test('전체화면 오버레이라는 전제가 유지된다(이게 깨지면 이 가드의 이유가 바뀐다)', () => {
    expect(body).toMatch(/position:fixed;inset:0;z-index:10800/);
  });

  test('_registerSheet 로 닫는 방법을 알려준다', () => {
    expect(body).toMatch(/_registerSheet\(\s*SHEET_ID\s*,/);
  });

  test('_markSheetOpen 으로 열림을 표시한다', () => {
    expect(body).toMatch(/_markSheetOpen\(\s*SHEET_ID\s*\)/);
  });

  test('close 에서 _markSheetClosed 를 부른다', () => {
    expect(body).toMatch(/_markSheetClosed\(\s*SHEET_ID\s*\)/);
    // 등록 해제가 pop.remove() 보다 먼저여야 한다(레지스트리에 죽은 노드가 남지 않게)
    const ci = body.indexOf('_markSheetClosed');
    const ri = body.indexOf('pop.remove()');
    expect(ci).toBeGreaterThan(-1);
    expect(ri).toBeGreaterThan(-1);
    expect(ci).toBeLessThan(ri);
  });

  test('close 가 두 번 불려도 한 번만 동작한다(백 + 클릭 동시)', () => {
    expect(body).toMatch(/if \(_closed\) return;/);
  });

  test('세 닫기 경로(취소·지정해제·배경)가 모두 같은 close 를 쓴다', () => {
    expect(body).toMatch(/data-pick-cancel[\s\S]{0,80}close\(null\)/);
    expect(body).toMatch(/data-pick-clear[\s\S]{0,90}close\(/);
    expect(body).toMatch(/e\.target === pop[\s\S]{0,20}close\(null\)/);
  });
});
