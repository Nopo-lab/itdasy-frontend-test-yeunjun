/**
 * [2026-09-09] 고객 삭제 계약 통일 가드
 *
 * 삭제 경로가 3개인데 계약이 서로 달랐다:
 *   1) _confirmDelete (목록 스와이프)            문구 ❌ · 잔액가드 ❌ · 409안내 ❌('삭제 실패')
 *   2) window._customerDelete (편집시트)          문구 ✅ · 잔액가드 ✅
 *   3) app-customer-dashboard.js '삭제' 버튼      문구 ❌ · 잔액가드 ❌ · 409안내 ❌('다시 시도해주세요')
 *
 * 사실관계:
 *   · 서버는 지난 예약·매출을 **일부러 남긴다**(customers.py delete: "장부는 손님을 지워도 남아야 한다").
 *     그런데 1·3 의 문구는 "시술 기록도 함께 삭제돼요" 로 **반대**였다.
 *     2026-08-05 P1-7 이 2)번 한 곳만 고쳐서 나머지 둘이 옛 문구로 남았다.
 *   · 서버는 잔액이 남으면 409 `membership_balance_remains` 와 사람이 읽을 message 를 준다.
 *     `_friendlyError` 는 그 코드를 처리하도록 이미 만들어져 있었는데(case 409) 삭제 경로에
 *     붙어 있지 않아, 원장은 이유를 모른 채 계속 다시 눌렀다(무한 재시도 유도).
 */
const fs = require('fs');
const path = require('path');
const R = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const CUST = R('app-customer.js');
const DASH = R('app-customer-dashboard.js');

describe('삭제 계약이 세 경로에서 같다', () => {
  // 주석에는 남아 있어도 된다(왜 바꿨는지가 기록이다). 사용자에게 **보이는 문자열**만 본다.
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  test('사실과 반대인 옛 문구가 사용자에게 보이지 않는다', () => {
    expect(stripComments(CUST)).not.toMatch(/시술 기록도 함께 삭제돼요/);
    expect(stripComments(DASH)).not.toMatch(/시술 기록도 함께 삭제돼요/);
  });

  test('문구·잔액가드는 한 곳(_deleteConfirmMsg/_deleteBlockedByBalance)에서 나온다', () => {
    expect(CUST).toMatch(/function _deleteConfirmMsg\(/);
    expect(CUST).toMatch(/function _deleteBlockedByBalance\(/);
    // 스와이프 경로
    const i = CUST.indexOf('function _confirmDelete(');
    const body = CUST.slice(i, i + 1200);
    expect(body).toMatch(/_deleteBlockedByBalance\(c\)/);
    expect(body).toMatch(/_deleteConfirmMsg\(\)/);
    // 편집시트 경로
    const j = CUST.indexOf('window._customerDelete = function');
    const body2 = CUST.slice(j, j + 1400);
    expect(body2).toMatch(/_deleteBlockedByBalance\(c\)/);
    expect(body2).toMatch(/_deleteConfirmMsg\(\)/);
  });

  test('대시보드도 같은 계약을 쓴다', () => {
    expect(CUST).toMatch(/window\.CustomerDeleteContract\s*=/);
    expect(DASH).toMatch(/CustomerDeleteContract/);
    expect(DASH).toMatch(/blockedByBalance\(c\)/);
  });

  test('삭제 실패 안내가 서버 이유를 버리지 않는다', () => {
    // 스와이프
    const i = CUST.indexOf('function _confirmDelete(');
    expect(CUST.slice(i, i + 1200)).toMatch(/_friendlyError\(err, '삭제'\)/);
    // 대시보드
    expect(DASH).toMatch(/window\.CustomerErrorText\(err, '삭제'\)/);
    expect(DASH).not.toMatch(/showToast\('삭제 실패 — 다시 시도해주세요'\)/);
  });

  test('_friendlyError 가 회원권 잔액 409 를 사람 말로 바꾼다', () => {
    const i = CUST.indexOf('function _friendlyError(');
    const body = CUST.slice(i, i + 900);
    expect(body).toMatch(/membership_balance_remains/);
    expect(body).toMatch(/serverMessage/);
  });
});
