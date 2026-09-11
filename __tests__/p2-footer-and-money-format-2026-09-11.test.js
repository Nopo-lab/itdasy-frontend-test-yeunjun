/**
 * @jest-environment jsdom
 */
/* [BUG-N2] 검색 중 footer 가 전체 수만 보여주던 것.
 * [BUG-4]  매출로 안 잡히는 행이 "0" 으로 찍히던 것.
 *
 * 둘 다 실제 구현을 파일에서 꺼내 **실행**한다. 문자열 존재 검사가 아니다.
 */
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/* ── BUG-N2 ────────────────────────────────────────────────
   footer 문구를 만드는 식을 소스에서 꺼내 값을 넣어 돌린다. */
function footerText(shopTotal, shown) {
  const src = read('app-customer.js');
  const at = src.indexOf("count.textContent = shopTotal + '명'");
  expect(at).toBeGreaterThan(-1);
  const expr = src.slice(src.indexOf('=', at) + 1, src.indexOf(';', at)).trim();
  // 식이 참조하는 이름만 주입 — seg 는 옛 구현 호환용(지금 식은 안 쓸 수도 있다)
  return new Function('shopTotal', 'items', 'seg', '_shown', 'return ' + expr)(
    shopTotal, { length: shown }, 'all', shown);
}

describe('고객 footer — 검색과 필터가 같은 규칙을 쓴다', () => {
  test('🔴 검색으로 1명만 남으면 표시 수를 밝힌다', () => {
    expect(footerText(15, 1)).toBe('15명 · 1명 표시');
  });

  test('🔴 검색 결과 0건이면 "0명 표시" 라고 말한다 (전체 수만 보여주면 오해한다)', () => {
    expect(footerText(15, 0)).toBe('15명 · 0명 표시');
  });

  test('필터로 3명이면 그대로 (기존 동작 유지)', () => {
    expect(footerText(15, 3)).toBe('15명 · 3명 표시');
  });

  test('아무것도 안 거르면 군더더기를 안 붙인다', () => {
    expect(footerText(15, 15)).toBe('15명');
  });
});

/* ── BUG-4 ────────────────────────────────────────────────
   _amText 를 소스에서 꺼내 실행한다. */
function amText(row) {
  const src = read('app-revenue-calendar.js');
  const at = src.indexOf('function _amText(');
  expect(at).toBeGreaterThan(-1);
  let depth = 0, i = src.indexOf('{', at), end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) { end = i; break; }
  }
  const _money = (n) => (+n || 0).toLocaleString('ko-KR');
  return new Function('_money', src.slice(at, end + 1) + '; return _amText;')(_money)(row);
}

describe('매출 행 금액 — 틀린 숫자를 보여주지 않는다', () => {
  test('보통 매출은 그대로 숫자', () => {
    expect(amText({ amount: 50000, memo: '' })).toBe('50,000');
  });

  test('환불(음수)도 그대로', () => {
    expect(amText({ amount: -18000, memo: '' })).toBe('-18,000');
  });

  test('🔴 매출 미집계 행을 "0" 으로 찍지 않는다', () => {
    const out = amText({ amount: 0, memo: '회원권 충전 +30,000원 — 잔액 60,000원 (매출 미집계)' });
    expect(out).not.toBe('0');
    expect(out).toContain('미집계');
  });

  test('🔴 memo 에 실제 금액이 있으면 그 값을 보여준다', () => {
    const out = amText({ amount: 0, memo: '회원권 사용 -10,000원 — 잔액 50,000원' });
    expect(out).toContain('10,000');
  });

  test('memo 를 못 읽으면 숫자를 지어내지 않는다', () => {
    const out = amText({ amount: 0, memo: '' });
    expect(out).toContain('미집계');
    expect(out).not.toMatch(/[1-9]/);
  });

  test('금액처럼 안 읽히게 별도 스타일을 쓴다', () => {
    expect(amText({ amount: 0, memo: '' })).toContain('am-off');
    expect(read('app-revenue-calendar.js')).toMatch(/\.rvcal-li \.am-off\{/);
  });
});
