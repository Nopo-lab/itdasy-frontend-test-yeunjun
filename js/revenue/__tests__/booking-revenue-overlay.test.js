'use strict';

const fs = require('fs');
const path = require('path');

function loadOverlay() {
  global.window = {};
  const file = path.join(__dirname, '..', 'booking-revenue-overlay.js');
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(file, 'utf8'));
  return global.window.BookingRevenueOverlay;
}

const bookings = [
  {
    starts_at: '2026-06-16T12:00:00+09:00',
    status: 'confirmed',
    amount: 100000,
    deposit: 20000,
  },
  {
    starts_at: '2026-06-17T12:00:00+09:00',
    status: 'completed',
    amount: 90000,
    deposit: 10000,
  },
  {
    starts_at: '2026-06-18T12:00:00+09:00',
    status: 'cancelled',
    amount: 70000,
    deposit: 20000,
  },
  {
    starts_at: '2026-07-01T12:00:00+09:00',
    status: 'confirmed',
    amount: 50000,
    deposit: 5000,
  },
];

describe('BookingRevenueOverlay', () => {
  const O = loadOverlay();

  test('confirmed current-month bookings add deposit and remaining expected revenue', () => {
    const agg = O.summarizeBookings(bookings, {
      year: 2026,
      month: 6,
      now: '2026-06-15T10:00:00+09:00',
    });
    expect(agg.confirmed_deposit_total).toBe(20000);
    expect(agg.pending_bookings_total).toBe(80000);
    expect(agg.pending_booking_amount_total).toBe(100000);
    expect(agg.booking_count).toBe(1);
  });

  test('revenue summary adds missing deposit once and fixes projection floor', () => {
    const agg = O.summarizeBookings(bookings, {
      year: 2026,
      month: 6,
      now: '2026-06-15T10:00:00+09:00',
    });
    const merged = O.mergeSummary({ total: 100000, count: 1, projected_total: 120000 }, agg);
    expect(merged.total).toBe(120000);
    expect(merged.confirmed_deposit_total).toBe(20000);
    expect(merged.pending_bookings_total).toBe(80000);
    expect(merged.projected_total).toBe(200000);
  });

  // [A2 2026-07-27] BE /revenue/summary 의 total 은 confirmed_deposit_total 을 포함하지 않는다(별개 필드).
  //   confirmed_deposit_total 필드가 응답에 있어도 total 에 든 게 아니므로 전액 더해야 캘린더 합계와 일치.
  test('summary adds confirmed deposit — backend total excludes it (separate field)', () => {
    const agg = O.summarizeBookings(bookings, {
      year: 2026,
      month: 6,
      now: '2026-06-15T10:00:00+09:00',
    });
    const merged = O.mergeSummary({
      total: 120000,
      count: 1,
      confirmed_deposit_total: 20000,
      projected_total: 200000,
    }, agg);
    expect(merged.total).toBe(140000);            // 120000(완료) + 20000(확정 예약금)
    expect(merged.confirmed_deposit_total).toBe(20000);
    expect(merged.projected_total).toBe(220000);  // 200000 + 20000
  });

  test('brief total and payment breakdown include missing booking deposit', () => {
    const agg = O.summarizeBookings(bookings, {
      year: 2026,
      month: 6,
      now: '2026-06-15T10:00:00+09:00',
    });
    const merged = O.mergeBrief({ this_month_total: 0, payment_breakdown: {} }, agg);
    expect(merged.this_month_total).toBe(20000);
    expect(merged.payment_breakdown.booking_deposit).toBe(20000);
    expect(merged.pending_bookings_total).toBe(80000);
    expect(merged.projected_total).toBe(100000);
  });
});

// [매출감사 2026-08-04] 예약금을 total 에 더했으면 그 total 로 계산되는 값도 같이 고쳐야 한다.
//   실측으로 잡은 버그: 홈 카드가 "5만원 · 전월대비 -100%" 를 띄웠다.
//   금액은 예약금 포함(51,000), 증감률은 예약금 미포함(1,000) 기준이라 한 줄 안에서 기준이 갈렸다.
describe('mergeBrief — mom_delta_pct 를 예약금 포함 기준으로 다시 계산', () => {
  const O = loadOverlay();
  const agg = { confirmed_deposit_total: 50000, booking_count: 1 };

  test('예약금이 더해지면 증감률도 그 기준으로 바뀐다', () => {
    const merged = O.mergeBrief(
      { this_month_total: 1000, prev_month_total: 500000, mom_delta_pct: -99.8, payment_breakdown: {} },
      agg
    );
    expect(merged.this_month_total).toBe(51000);
    // (51,000 - 500,000) / 500,000 = -89.8%
    expect(merged.mom_delta_pct).toBe(-89.8);
  });

  test('예약금이 0이면 백엔드 값을 그대로 둔다', () => {
    const merged = O.mergeBrief(
      { this_month_total: 1000, prev_month_total: 500000, mom_delta_pct: -99.8, payment_breakdown: {} },
      { confirmed_deposit_total: 0, booking_count: 0 }
    );
    expect(merged.mom_delta_pct).toBe(-99.8);
  });

  test('전월이 0원이면 나눌 수 없으므로 건드리지 않는다', () => {
    const merged = O.mergeBrief(
      { this_month_total: 1000, prev_month_total: 0, mom_delta_pct: null, payment_breakdown: {} },
      agg
    );
    expect(merged.this_month_total).toBe(51000);
    expect(merged.mom_delta_pct).toBeNull();
  });

  test('prev_month_total 자체가 없어도 터지지 않는다', () => {
    const merged = O.mergeBrief({ this_month_total: 1000, payment_breakdown: {} }, agg);
    expect(merged.this_month_total).toBe(51000);
    expect(merged.mom_delta_pct).toBeUndefined();
  });
});

// [매출감사 2026-08-04] 오버레이는 **멱등**해야 한다.
//   app-revenue-month.js 가 보정본을 SWR 캐시에 쓰고, 캐시 히트 때 또 보정을 걸고 있었다.
//   실측: 매출 51,000 + 예약금 50,000 = 101,000 이어야 하는데 화면에 151,000 이 떴다.
describe('mergeSummary / mergeBrief — 두 번 걸어도 예약금이 두 번 더해지지 않는다', () => {
  const O = loadOverlay();
  const agg = { confirmed_deposit_total: 50000, booking_count: 1 };

  test('mergeSummary 를 두 번 걸어도 total 이 같다', () => {
    const once = O.mergeSummary({ total: 51000, net_total: 51000 }, agg);
    const twice = O.mergeSummary(once, agg);
    expect(once.total).toBe(101000);
    expect(twice.total).toBe(101000);      // 151,000 이 되면 안 된다
    expect(twice.net_total).toBe(101000);
  });

  test('세 번, 네 번 걸어도 마찬가지', () => {
    let s = { total: 51000 };
    for (let i = 0; i < 4; i++) s = O.mergeSummary(s, agg);
    expect(s.total).toBe(101000);
  });

  test('mergeBrief 도 멱등', () => {
    const once = O.mergeBrief(
      { this_month_total: 51000, prev_month_total: 1350000, payment_breakdown: {} }, agg);
    const twice = O.mergeBrief(once, agg);
    expect(once.this_month_total).toBe(101000);
    expect(twice.this_month_total).toBe(101000);
    // payment_breakdown 도 두 배가 되면 안 된다
    expect(twice.payment_breakdown.booking_deposit).toBe(50000);
  });

  test('예약금이 그 사이 늘면 차액만 반영된다', () => {
    const once = O.mergeSummary({ total: 51000 }, agg);        // +50,000 → 101,000
    const grown = O.mergeSummary(once, { confirmed_deposit_total: 80000, booking_count: 2 });
    expect(grown.total).toBe(131000);                           // 101,000 + 30,000
    expect(grown.confirmed_deposit_total).toBe(80000);
  });
});
