/**
 * @jest-environment jsdom
 *
 * BUG-A 회귀 — 매출 삭제 확인창이 **금전 효과를 말해야 한다.**
 *
 * 서버의 DELETE /revenue/{id} 는 한 번에 두 가지를 더 한다:
 *   ① membership_delta 만큼 손님 회원권 잔액을 되돌린다 (차감행 삭제 → 잔액 증가)
 *   ② 그 매출에 붙은 환불 기록도 같이 지운다
 * 둘 다 손님 돈인데 확인창은 "이 매출을 삭제할까요?" 만 물었다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REV = fs.readFileSync(path.join(ROOT, 'app-revenue.js'), 'utf8');
const EDIT = fs.readFileSync(path.join(ROOT, 'js/revenue-edit.js'), 'utf8');

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
  const body = extractFn(REV, 'function _deleteConfirmMsg(item, info) {');
  expect(body).not.toBe('');
  // eslint-disable-next-line no-new-func
  return new Function(body + '\n; return _deleteConfirmMsg;')();
}

describe('BUG-A · 삭제 확인창은 무엇이 움직이는지 먼저 말한다', () => {
  test('회원권 차감행 — 잔액이 되돌아간다고 금액까지 말한다', () => {
    const msg = load()({ id: 1, amount: 0, membership_delta: -30000 });
    expect(msg).toContain('30,000원');
    expect(msg).toMatch(/되돌아가/);
  });

  test('회원권 충전행 — 잔액에서 빠진다고 말한다 (방향이 반대다)', () => {
    const msg = load()({ id: 1, amount: 50000, membership_delta: 50000 });
    expect(msg).toContain('50,000원');
    expect(msg).toMatch(/빠져/);
    expect(msg).not.toMatch(/되돌아가/);
  });

  test('🔴 일반 매출에는 회원권 이야기를 하지 않는다 (모르면 말하지 않는다)', () => {
    const msg = load()({ id: 1, amount: 45000, method: 'card' });
    expect(msg).not.toMatch(/회원권|잔액/);
  });

  test('membership_delta 가 0 이면 금액 문구를 붙이지 않는다', () => {
    const msg = load()({ id: 1, amount: 45000, membership_delta: 0 });
    expect(msg).not.toMatch(/회원권|잔액/);
  });

  test('붙은 환불 기록이 있으면 같이 지워진다고 말한다', () => {
    const msg = load()({ id: 1, amount: 100000 }, { refunded_total: 30000 });
    expect(msg).toContain('30,000원');
    expect(msg).toMatch(/환불/);
  });

  test('환불 정보를 못 받아왔으면(null) 환불 이야기를 지어내지 않는다', () => {
    const msg = load()({ id: 1, amount: 100000 }, null);
    expect(msg).not.toMatch(/환불/);
  });

  test('회원권 + 환불이 겹치면 둘 다 말한다', () => {
    const msg = load()({ id: 1, amount: 0, membership_delta: -30000 }, { refunded_total: 10000 });
    expect(msg).toMatch(/되돌아가/);
    expect(msg).toMatch(/환불/);
    expect(msg).toContain('10,000원');
  });

  test('되돌릴 수 없다는 사실은 항상 말한다', () => {
    expect(load()({ id: 1, amount: 1000 })).toMatch(/되돌릴 수 없/);
  });

  test('문구는 여러 줄이고 확인창이 줄바꿈을 살린다 (pre-line)', () => {
    expect(load()({ id: 1, amount: 0, membership_delta: -30000 })).toContain('\n');
    const core = fs.readFileSync(path.join(ROOT, 'app-core.js'), 'utf8');
    const fn = extractFn(core, 'function _inlineConfirm(msg, onYes, onNo, opts) {');
    expect(fn).toMatch(/white-space:pre-line/);
  });
});

describe('두 삭제 지점이 같은 문구를 쓴다 (한쪽만 고쳐지는 일 방지)', () => {
  test('목록 행 시트가 하드코딩 문구를 쓰지 않는다', () => {
    expect(REV).not.toMatch(/_inlineConfirm\('이 매출을 삭제할까요\?'/);
    expect(REV).toMatch(/_inlineConfirm\(_deleteConfirmMsg\(item\)/);
  });

  test('인라인 편집 패널도 공용 문구를 쓴다', () => {
    expect(EDIT).toMatch(/window\._revenueDeleteMsg\(item, refundInfo\)/);
  });

  test('편집 패널은 받아온 환불 정보를 확인창까지 전달한다', () => {
    expect(EDIT).toMatch(/refundInfo = d;/);
  });
});
