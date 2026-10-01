/**
 * @jest-environment jsdom
 *
 * flow-home-daily-retention-04 (P3) — 홈 부팅·탭 복귀마다 쓰이지 않는 요청이 반복된다.
 *   · index.html 의 #home-today-brief 는 display:none 인데 app-core 가 홈 탭마다 TodayBrief.render 를 불러
 *     /today/brief + /assistant/suggestions(LLM) 를 받는다 — 아무도 보지 않는 카드.
 *   · HomeV41 이 렌더마다 /dm-confirm-queue 를 받아 dmQueueCount 를 구하지만 alertItems() 가 쓰지 않는다
 *     (실측 82초 세션 /dm-confirm-queue 18건 — 고객 메시지 카드가 같은 엔드포인트를 따로 폴링).
 * flow-home-daily-retention-06 (P3) — brief.birthdays_this_week 를 계산·alert_count 에 더하는데 홈 어디에도 안 보인다.
 *   → 잇비 카드 표 줄 한 줄(생일 · act openCustomers)로 노출.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const TB = fs.readFileSync(path.join(ROOT, 'app-today-brief.js'), 'utf8');
const HV = fs.readFileSync(path.join(ROOT, 'app-home-v41.js'), 'utf8');
const RD = fs.readFileSync(path.join(ROOT, 'js/home/v41-renderers.js'), 'utf8');

const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(r => setTimeout(r, 0)); };

function base() {
  localStorage.clear(); sessionStorage.clear();
  window.API = 'http://127.0.0.1:8000';
  window.authHeader = () => ({ Authorization: 'Bearer t' });
  window._esc = (s) => String(s == null ? '' : s);
  window.showToast = jest.fn();
}
afterEach(() => { jest.useRealTimers(); });

describe('04 — 숨은 TodayBrief 컨테이너는 네트워크를 쓰지 않는다', () => {
  test('🔴 display:none 컨테이너로 render 하면 /today/brief · /assistant/suggestions 를 받지 않는다', async () => {
    base();
    document.body.innerHTML = '<div id="home-today-brief" style="display:none;" aria-hidden="true"></div>';
    const paths = [];
    window.apiFetch = jest.fn(async (p) => { paths.push(p); return { ok: true, json: async () => ({}) }; });
    // eslint-disable-next-line no-eval
    window.eval(TB);
    await window.TodayBrief.render('home-today-brief');
    await flush();
    expect(paths).toEqual([]);
  });
  test('보이는 컨테이너는 예전대로 받는다 (전역 no-op 이 아니다)', async () => {
    base();
    document.body.innerHTML = '<div id="visible-brief"></div>';
    const paths = [];
    window.apiFetch = jest.fn(async (p) => { paths.push(p); return { ok: true, json: async () => ({}) }; });
    // eslint-disable-next-line no-eval
    window.eval(TB);
    await window.TodayBrief.render('visible-brief');
    await flush();
    expect(paths).toContain('/today/brief');
  });
});

describe('04 — HomeV41 은 쓰지 않는 /dm-confirm-queue 를 받지 않는다', () => {
  test('🔴 홈 렌더 1회의 요청 집합에 /dm-confirm-queue 가 없다', async () => {
    base();
    document.body.innerHTML = '<div id="homeV41Root"></div><div id="headerAvatar"></div>';
    window.scrollTo = jest.fn();
    const paths = [];
    window.apiFetch = jest.fn(async (p) => { paths.push(p); return { ok: true, status: 200, json: async () => (p.indexOf('/assistant/brief') === 0 ? { today_bookings: [] } : []) }; });
    window.HomeV41Render = { compose: () => '<div class="hv5">home</div>', syncAvatar: jest.fn(), todayBookings: () => [], toggleBookings: jest.fn() };
    window.HomeV41Actions = { run: jest.fn() };
    // eslint-disable-next-line no-eval
    window.eval(HV);
    await window.HomeV41.render('homeV41Root');
    await flush();
    expect(paths).toContain('/assistant/brief');
    expect(paths).not.toContain('/dm-confirm-queue');
  });
  test('소스 가드: app-home-v41.js 에 /dm-confirm-queue 호출이 없다 (건수는 HomeCustomerMsgs 가 단일 소스)', () => {
    expect(HV).not.toMatch(/apiFetch\(\s*['"`]\/dm-confirm-queue/);
    expect(HV).not.toMatch(/function _fetchDMQueueCount/);
    expect(HV).toMatch(/setDmQueueCount/);
    const CM = fs.readFileSync(path.join(ROOT, 'app-home-customer-msgs.js'), 'utf8');
    expect(CM).toMatch(/setDmQueueCount\(_cache\.length\)/);
  });
});

describe('06 — 생일 고객 한 줄', () => {
  function R() {
    window.HomeV41Config = { BOOKING_EMPTY_DISPLAY: 'show' };
    // eslint-disable-next-line no-eval
    window.eval(RD);
    return window.HomeV41Render;
  }
  test('🔴 birthdays_this_week 1건(오늘) → 잇비 카드에 "생일" 줄 + 고객 보기', () => {
    jest.useFakeTimers({ now: new Date('2026-10-01T11:00:00Z') });   // 10/1 20:00 KST
    base();
    const html = R().compose({ today_bookings: [], birthdays_this_week: [{ name: '생일손님', date: '2026-10-01' }] }, 0);
    expect(html).toMatch(/생일/);
    expect(html).toMatch(/생일손님/);
    expect(html).toMatch(/hv5-itbi-mini" data-hv-act="openCustomers">\s*<span class="hv5-itbi-mini-label">생일<\/span>/);
    expect(html).toMatch(/오늘/);
  });
  test('여러 명이면 "N명" 으로, 날짜가 다른 날이면 날짜를 말한다', () => {
    jest.useFakeTimers({ now: new Date('2026-10-01T11:00:00Z') });
    base();
    const html = R().compose({ today_bookings: [], birthdays_this_week: [
      { name: '생일손님', date: '2026-10-03' }, { name: '둘째', date: '2026-10-04' },
    ] }, 0);
    expect(html).toMatch(/생일 손님 2명|생일 2명/);
    expect(html).toMatch(/10\/3/);
  });
  test('생일 손님이 없으면 생일 줄이 없다', () => {
    base();
    const html = R().compose({ today_bookings: [], birthdays_this_week: [] }, 0);
    expect(html).not.toMatch(/생일/);
  });
});
