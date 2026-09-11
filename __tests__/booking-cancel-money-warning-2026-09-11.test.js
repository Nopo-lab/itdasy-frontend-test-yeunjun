/**
 * @jest-environment jsdom
 *
 * BUG-A2 회귀 — 예약 취소 확인창이 **돈이 움직인다는 걸 말해야 한다.**
 *
 * 라이브 실측(2026-09-11): 예약을 '시술 완료' 하면 매출이 자동 기록되고(385,000 → 395,000),
 * 그 예약을 취소하면 서버가 환불행으로 상계해 합계가 되돌아간다(395,000 → 385,000).
 * 그런데 확인창은 "이 예약을 취소할까요?" 한 줄이었다.
 * 매출 삭제 확인창(BUG-A)과 같은 결함이 취소 경로에도 있었다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CORE = fs.readFileSync(path.join(ROOT, 'app-core.js'), 'utf8');
const CAL = fs.readFileSync(path.join(ROOT, 'app-calendar-view.js'), 'utf8');
const CF = fs.readFileSync(path.join(ROOT, 'app-complete-flow.js'), 'utf8');

function extractAssign(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return '';
  let d = 0, started = false;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(i, k + 1) + ';'; }
  }
  return '';
}
function load() {
  const body = extractAssign(CORE, 'window._bookingCancelMsg = function (booking) {');
  expect(body).not.toBe('');
  const w = {};
  // eslint-disable-next-line no-new-func
  new Function('window', body)(w);
  return w._bookingCancelMsg;
}

describe('BUG-A2 · 완료된 예약을 취소하면 매출이 상계된다고 말한다', () => {
  test('완료 + 금액 → 금액까지 말한다', () => {
    const m = load()({ status: 'completed', amount: 10000 });
    expect(m).toContain('10,000원');
    expect(m).toMatch(/상계|빠져/);
  });

  test('🔴 확정(미완료) 예약에는 돈 이야기를 하지 않는다', () => {
    expect(load()({ status: 'confirmed', amount: 10000 })).not.toMatch(/매출|상계/);
  });

  test('대기 예약도 마찬가지', () => {
    expect(load()({ status: 'pending' })).not.toMatch(/매출|상계/);
  });

  test('완료인데 금액을 모르면 숫자 없이 사실만 말한다 (지어내지 않는다)', () => {
    const m = load()({ status: 'completed' });
    expect(m).toMatch(/매출/);
    expect(m).not.toMatch(/[0-9]+원/);
  });

  test('booking 이 없어도 터지지 않고 기본 문구를 준다', () => {
    expect(load()(null)).toBe('이 예약을 취소할까요?');
  });

  test('여러 줄이다 (확인창이 pre-line 으로 살린다)', () => {
    expect(load()({ status: 'completed', amount: 5000 })).toContain('\n');
  });
});

describe('취소 경로 3곳이 같은 문구를 쓴다', () => {
  test('예약 상세의 취소', () => {
    expect(CAL).toMatch(/_inlineConfirm\(_cancelMsg\(raw\)/);
  });
  test('상태 변경(→취소)', () => {
    expect(CAL).toMatch(/_inlineConfirm\(_cancelMsg\(existing\)/);
  });
  test('완료 시트의 예약 취소', () => {
    expect(CF).toMatch(/window\._bookingCancelMsg\(\{ status: _ctx\.status, amount: _ctx\.amount \}\)/);
  });
  test('하드코딩 문구가 남아 있지 않다', () => {
    expect(CAL).not.toMatch(/_inlineConfirm\('이 예약을 취소할까요\?'/);
    expect(CF).not.toMatch(/_inlineConfirm\('이 예약을 취소할까요\?'/);
  });
  test('🔴 status 를 _ctx 에 실어야 조건이 살아 있다 (조용한 무효화 방지)', () => {
    const sfb = CF.slice(CF.indexOf('startFromBooking(booking) {'), CF.indexOf('show(opts) {'));
    expect(sfb).toMatch(/status: booking\.status/);
  });
});
