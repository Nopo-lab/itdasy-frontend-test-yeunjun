/**
 * @jest-environment jsdom
 *
 * flow-home-daily-retention-01 (P1) — KST 00:00~08:59 예약이 홈 '오늘의 예약' 카드와 건수에서 사라진다.
 *
 * 실측(2026-10-01, evidence/flow-home-daily-retention/swr-boundary.png):
 *   /assistant/brief today_bookings 5건(새벽손님0830@2026-09-30T23:30:00+00:00 포함)
 *   홈 DOM '오늘의 예약 4건' — 08:30 건 누락. 같은 화면 '미완료 예약 찾았어요' 엔 그 예약이 나와 숫자가 모순.
 *
 * 원인: js/home/v41-renderers.js todayBookings() 가 로컬 날짜 문자열(2026-10-01)과 starts_at ISO 문자열
 *   (UTC, '2026-09-30T23:30:00+00:00')을 startsWith 로 비교. 운영 Postgres 도 +00:00 으로 직렬화한다.
 * 고침: 날짜 비교를 **KST 달력일**(백엔드 business_day 와 같은 기준)로 — 문자열 접두가 아니라 시각을 해석한다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/home/v41-renderers.js'), 'utf8');

function load() {
  window.HomeV41Config = { BOOKING_EMPTY_DISPLAY: 'show' };
  // eslint-disable-next-line no-eval
  window.eval(SRC);
  return window.HomeV41Render;
}
afterEach(() => { jest.useRealTimers(); });

test('🔴 KST 08:30 예약(UTC 전날 23:30)이 오늘의 예약에 포함된다 — +00:00 · Z · +09:00 표기 모두', () => {
  jest.useFakeTimers({ now: new Date('2026-10-01T11:00:00Z') });   // 10/1 20:00 KST
  const R = load();
  const out = R.todayBookings({ today_bookings: [
    { id: 1, starts_at: '2026-09-30T23:30:00+00:00', status: 'confirmed', customer_name: '새벽손님0830' },
    { id: 2, starts_at: '2026-10-01T01:00:00+00:00', status: 'confirmed', customer_name: '오늘손님1' },
    { id: 3, starts_at: '2026-09-30T23:30:00Z', status: 'confirmed' },
    { id: 4, starts_at: '2026-10-01T08:30:00+09:00', status: 'confirmed' },
    { id: 5, starts_at: '2026-10-01T15:30:00+00:00', status: 'confirmed', customer_name: '내일0030손님' },   // 10/2 00:30 KST
    { id: 6, starts_at: '2026-10-01T01:00:00+00:00', status: 'cancelled' },
  ] });
  expect(out.map(b => b.id)).toEqual([1, 3, 4, 2]);
});

test('🔴 KST 자정 직후(10/2 01:00 KST): 10/2 00:30 KST 는 오늘, 10/1 21:00 KST 는 어제 (UTC 날짜는 둘 다 10/1)', () => {
  jest.useFakeTimers({ now: new Date('2026-10-01T16:00:00Z') });   // 10/2 01:00 KST
  const R = load();
  const out = R.todayBookings({ today_bookings: [
    { id: 1, starts_at: '2026-10-01T15:30:00+00:00', status: 'confirmed' },   // 10/2 00:30 KST
    { id: 2, starts_at: '2026-10-01T12:00:00+00:00', status: 'confirmed' },   // 10/1 21:00 KST
  ] });
  expect(out.map(b => b.id)).toEqual([1]);
});

test('🔴 오늘의 예약 카드 렌더에도 새벽 예약이 그려지고 건수에 센다', () => {
  jest.useFakeTimers({ now: new Date('2026-10-01T11:00:00Z') });
  const R = load();
  const html = R.compose({ today_bookings: [
    { id: 1, starts_at: '2026-09-30T23:30:00+00:00', status: 'confirmed', customer_name: '새벽손님0830', service_name: '젤네일' },
    { id: 2, starts_at: '2026-10-01T01:00:00+00:00', status: 'confirmed', customer_name: '오늘손님1', service_name: '젤네일' },
  ] }, 0);
  expect(html).toMatch(/새벽손님0830/);
  expect(html).toMatch(/오늘의 예약 2건/);
});

test('소스 가드: 날짜를 문자열 접두(startsWith(ymd)) · toISOString().slice(0, 10) 으로 비교하지 않는다', () => {
  expect(SRC).not.toMatch(/startsWith\(ymd\)/);
  expect(SRC).not.toMatch(/toISOString\(\)\.slice\(0,\s*10\)/);
  expect(SRC).not.toMatch(/\.slice\(0,\s*10\)\s*===\s*ymd/);
});
