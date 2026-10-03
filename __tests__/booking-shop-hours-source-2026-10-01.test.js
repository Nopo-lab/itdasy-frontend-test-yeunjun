/**
 * @jest-environment jsdom
 *
 * flow-customers-bookings-04 (P2, 프런트) — 샵 설정의 영업시간·휴무(business_hours_json)가 예약 캘린더·예약 폼에
 *   전혀 반영되지 않던 것. Booking.shopHours() 가 'itdasy_shop_hours_v1' 을 읽었는데 그 키를 쓰는 코드가 레포에 없어
 *   항상 09~24 였다(실측 2026-10-01, evidence/flow-customers-bookings/fix_before_hours.json: 금요일 휴무·10~18 저장 후
 *   shopHours(금) = {9,24}, 휴무일 폼 기본 시작 20:30, 안내 없음, 저장 201).
 *
 * 여기서 잠그는 것:
 *   ① Booking.shopHours(date) 가 설정(business_hours_json)을 정본으로 요일별 start/end/off 를 낸다 · 인자 없으면 영업일 전체 범위
 *   ② 저장 키 통일 — 'itdasy_shop_hours_v1' 은 더 이상 없고 설정 화면과 같은 'itdasy_business_hours_json' 을 읽는다
 *   ③ ensureShopHours 가 GET /shop/settings 로 미러를 채운다 (이 기기에서 설정 화면을 연 적이 없어도)
 *   ④ hoursIssue 가 휴무일 / 영업시간 밖을 가려낸다 (설정 없으면 null)
 *   ⑤ 예약 폼: 휴무일이면 #bfHoursNotice 안내 + 날짜 메타 '휴무일', 저장은 확인 단계를 거친다(막지 않는다)
 *   ⑥ 설정 저장(app-shop-settings) 이 Booking.setShopHours 로 즉시 알린다
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const API_SRC = fs.readFileSync(path.join(ROOT, 'app-booking-api.js'), 'utf8');
const CAL_SRC = fs.readFileSync(path.join(ROOT, 'app-calendar-view.js'), 'utf8');
const SET_SRC = fs.readFileSync(path.join(ROOT, 'app-shop-settings.js'), 'utf8');

const BH = { mon: { open: '10:00', close: '18:00', off: false }, tue: { open: '10:00', close: '18:00', off: false }, wed: { open: '10:00', close: '18:00', off: false },
  thu: { open: '10:00', close: '18:00', off: false }, fri: { open: '10:00', close: '18:00', off: true }, sat: { open: '11:00', close: '20:30', off: false }, sun: { open: '10:00', close: '18:00', off: false } };
// 2026-10-02 = 금요일(휴무) · 2026-10-03 = 토요일 · 2026-10-05 = 월요일
const tick = () => new Promise(r => setTimeout(r, 0));
const flush = async (n) => { for (let i = 0; i < (n || 6); i++) await tick(); };

function bootApi(opts) {
  document.body.innerHTML = '';
  try { localStorage.clear(); sessionStorage.clear(); } catch (_e) { void _e; }
  window.API = 'http://127.0.0.1:8000';
  window.authHeader = () => ({ Authorization: 'Bearer t' });
  if (!window.crypto || typeof window.crypto.randomUUID !== 'function') {
    Object.defineProperty(window, 'crypto', { value: { randomUUID: () => 'u-' + Math.random() }, configurable: true });
  }
  window.apiFetch = jest.fn(async (p) => {
    if (/\/shop\/settings/.test(p)) return { ok: true, status: 200, json: async () => ({ shop_name: 'x', business_hours_json: opts && opts.serverBH !== undefined ? opts.serverBH : JSON.stringify(BH) }) };
    return { ok: true, status: 200, json: async () => ({ items: [] }) };
  });
  if (opts && opts.localBH) localStorage.setItem('itdasy_business_hours_json', JSON.stringify(opts.localBH));
  // eslint-disable-next-line no-eval
  window.eval(API_SRC);
  return window.Booking;
}

describe('① Booking.shopHours — 설정이 정본', () => {
  test('🔴 금요일 휴무 · 평일 10~18 설정이면 그 요일 값을 낸다 (이번 버그: 항상 9~24)', () => {
    const B = bootApi({ localBH: BH });
    const fri = B.shopHours('2026-10-02');
    expect(fri.off).toBe(true);
    expect(fri.hasSettings).toBe(true);
    const mon = B.shopHours('2026-10-05');
    expect(mon).toMatchObject({ start: 10, end: 18, off: false, open: '10:00', close: '18:00', openMin: 600, closeMin: 1080 });
    const sat = B.shopHours(new Date('2026-10-03T00:00:00'));
    expect(sat).toMatchObject({ start: 11, end: 21, off: false });   // 20:30 마감 → 축은 21시까지
  });
  test('인자 없이 부르면 영업일 전체를 덮는 범위 (주간 시간축 등 기존 호출부 호환)', () => {
    const B = bootApi({ localBH: BH });
    expect(B.shopHours()).toMatchObject({ start: 10, end: 21, slotMin: 30, off: false });
  });
  test('설정이 없으면 예전 기본값 9~24 · hasSettings=false', () => {
    const B = bootApi({});
    expect(B.shopHours('2026-10-02')).toMatchObject({ start: 9, end: 24, slotMin: 30, off: false, hasSettings: false });
  });
});

test('② 저장 키 통일 — 죽은 키 itdasy_shop_hours_v1 제거, 설정 화면과 같은 키를 읽는다', () => {
  expect(API_SRC).not.toMatch(/const SHOP_HOURS_KEY|getItem\('itdasy_shop_hours_v1'\)/);
  expect(API_SRC).toMatch(/BH_KEY\s*=\s*'itdasy_business_hours_json'/);
  expect(SET_SRC).toMatch(/localStorage\.setItem\('itdasy_business_hours_json'/);
});

test('③ ensureShopHours — 서버 GET /shop/settings 로 미러를 채운다 (설정 화면을 연 적 없는 기기)', async () => {
  const B = bootApi({});
  expect(B.shopHours('2026-10-02').hasSettings).toBe(false);
  await B.ensureShopHours();
  expect(window.apiFetch.mock.calls.some(c => /\/shop\/settings/.test(c[0]))).toBe(true);
  expect(B.shopHours('2026-10-02').off).toBe(true);
  expect(JSON.parse(localStorage.getItem('itdasy_business_hours_json')).fri.off).toBe(true);
  // 서버가 미설정('{}')이면 로컬 미러를 지우지 않는다 (설정 화면 _hydrate 와 같은 규칙)
  const B2 = bootApi({ localBH: BH, serverBH: '{}' });
  await B2.ensureShopHours({ force: true });
  expect(B2.shopHours('2026-10-05')).toMatchObject({ start: 10, end: 18 });
});

test('④ hoursIssue — 휴무일 / 영업시간 밖 / 정상 / 설정 없음', () => {
  const B = bootApi({ localBH: BH });
  expect(B.hoursIssue('2026-10-02', '11:00', '12:00')).toMatchObject({ kind: 'off' });
  expect(B.hoursIssue('2026-10-02', '11:00', '12:00').msg).toMatch(/10월 2일\(금\).*휴무일/);
  expect(B.hoursIssue('2026-10-05', '20:00', '21:00')).toMatchObject({ kind: 'outside', open: '10:00', close: '18:00' });
  expect(B.hoursIssue('2026-10-05', '09:30', '10:30')).toMatchObject({ kind: 'outside' });   // 시작이 영업 전
  expect(B.hoursIssue('2026-10-05', '17:30', '18:30')).toMatchObject({ kind: 'outside' });   // 끝이 영업 후
  expect(B.hoursIssue('2026-10-05', '10:00', '11:00')).toBeNull();
  expect(B.hoursIssue('2026-10-05', '17:00', '18:00')).toBeNull();
  const B0 = bootApi({});
  expect(B0.hoursIssue('2026-10-02', '03:00', '04:00')).toBeNull();
});

describe('⑤ 예약 폼 — 휴무일 안내 + 저장 전 확인 (막지 않는다)', () => {
  // [2026-10-03 시계 고정] 이 묶음은 고정 날짜(2026-10-02 금·휴무, 2026-10-05 월)로 '저장' 을 누른다.
  //   그런데 저장 핸들러는 휴무 확인보다 **먼저** '과거 날짜 예약 방지'([A3], d < 오늘) 를 본다 — 제품 동작으로 맞다.
  //   그래서 실제 시계로 돌리면 10-03 부터 휴무일 저장 테스트가, 10-06 부터 영업일 저장 테스트가
  //   '과거 날짜에는 예약을 추가할 수 없어요' 토스트로 빠져 CI 가 영구히 빨갛게 된다(실측 2026-10-03: _inlineConfirm 0회).
  //   작성 당일(2026-10-01, KST 12:00 = UTC 03:00 — UTC·KST 어느 TZ 로 돌려도 로컬 날짜가 10-01)로 Date 만 고정한다.
  //   flush() 가 진짜 setTimeout 을 쓰므로 타이머·rAF 는 가짜로 바꾸지 않는다.
  const PINNED_NOW = new Date('2026-10-01T03:00:00Z');
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate',
      'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'hrtime', 'performance'] });
    jest.setSystemTime(PINNED_NOW);
  });
  afterEach(() => { jest.useRealTimers(); });

  function bootCal() {
    const B = bootApi({ localBH: BH });
    window.innerWidth = 390; window.innerHeight = 844;
    window._esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    window.showToast = jest.fn();
    window._inlineConfirm = jest.fn();
    B.list = jest.fn(async () => []);
    B.create = jest.fn(async (p) => ({ id: 1, ...p }));
    try { sessionStorage.setItem('itdasy_overdue_sheet_shown', '1'); } catch (_e) { void _e; }
    // eslint-disable-next-line no-eval
    window.eval(CAL_SRC);
    return B;
  }
  const setDate = (d) => { const el = document.getElementById('bfDate'); el.value = d; el.dispatchEvent(new Event('change', { bubbles: true })); };
  const setWheel = (ap, h12, m10) => {
    const set = (id, v) => document.querySelectorAll('#' + id + ' .bf-tp-row').forEach(r => r.classList.toggle('current', r.dataset.val === String(v)));
    set('bfWheelAP', ap); set('bfWheelH12', h12); set('bfWheelM10', m10);
  };

  test('🔴 휴무일(금) 폼: #bfHoursNotice 안내 + 메타 "휴무일" · 기본 시작시각은 영업 시작(10:00)', async () => {
    bootCal();
    await window.openCalendarView(); await flush();
    document.getElementById('bk-fab').click();
    expect(document.getElementById('bfSave')).not.toBeNull();
    setDate('2026-10-02');
    const notice = document.getElementById('bfHoursNotice');
    expect(notice).not.toBeNull();
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toMatch(/휴무일/);
    expect(notice.textContent).toMatch(/그래도 예약할 수 있어요/);
    expect(document.getElementById('bfDateMeta').textContent).toMatch(/휴무일/);
    // 영업일로 바꾸면 안내가 사라진다 (월요일 10:00~ 시작이면 정상)
    setWheel(0, 10, 0);
    setDate('2026-10-05');
    expect(document.getElementById('bfHoursNotice').hidden).toBe(true);
    expect(document.getElementById('bfDateMeta').textContent).not.toMatch(/휴무일/);
    // 영업시간 밖(20:00)으로 돌리면 다시 안내
    setWheel(1, 8, 0);
    setDate('2026-10-05');
    expect(document.getElementById('bfHoursNotice').hidden).toBe(false);
    expect(document.getElementById('bfHoursNotice').textContent).toMatch(/영업시간\(10:00~18:00\) 밖/);
  });

  test('🔴 휴무일 저장: 바로 저장하지 않고 확인을 띄운다 → "그래도 저장" 이면 저장된다 (수기 예약 허용)', async () => {
    const B = bootCal();
    await window.openCalendarView(); await flush();
    document.getElementById('bk-fab').click();
    setDate('2026-10-02');
    document.getElementById('bfCustName').value = '휴무일손님';
    document.getElementById('bfSave').click();
    await flush();
    expect(B.create).not.toHaveBeenCalled();
    expect(window._inlineConfirm).toHaveBeenCalledTimes(1);
    const [msg, onYes, , opts] = window._inlineConfirm.mock.calls[0];
    expect(msg).toMatch(/휴무일/);
    expect(opts && opts.okText).toMatch(/저장/);
    // 저장 버튼 잠금이 풀려 있어야 '그래도 저장' 뒤 다시 저장할 수 있다
    expect(document.getElementById('bfSave').disabled).toBe(false);
    onYes();
    await flush(10);
    expect(B.create).toHaveBeenCalledTimes(1);
    expect(window._inlineConfirm).toHaveBeenCalledTimes(1);   // 같은 날짜·시간은 다시 묻지 않는다
  });

  test('영업시간 안 저장은 확인 없이 바로 저장', async () => {
    const B = bootCal();
    await window.openCalendarView(); await flush();
    document.getElementById('bk-fab').click();
    setWheel(0, 11, 0);
    setDate('2026-10-05');
    document.getElementById('bfCustName').value = '정상손님';
    document.getElementById('bfSave').click();
    await flush(10);
    expect(window._inlineConfirm).not.toHaveBeenCalled();
    expect(B.create).toHaveBeenCalledTimes(1);
  });
});

test('⑥ 설정 저장이 Booking.setShopHours 로 즉시 알린다 · 서버 hydrate 도 미러에 반영', () => {
  expect(SET_SRC).toMatch(/window\.Booking\.setShopHours\(payload\.business_hours_json\)/);
  expect(SET_SRC).toMatch(/window\.Booking\.setShopHours\(bh\)/);
  expect(CAL_SRC).toMatch(/window\.Booking\.ensureShopHours\(\)/);
  expect(CAL_SRC).toMatch(/window\.Booking\.shopHours\(_ds\(defDate\)\)/);
});
