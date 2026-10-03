/**
 * @jest-environment jsdom
 *
 * [2026-10-03 날짜 시한폭탄] 전체 jest 1건 실패 — booking-shop-hours-source-2026-10-01 의 '휴무일 저장' 테스트.
 *
 * 실측(2026-10-03, 실제 시계): 'expect(window._inlineConfirm).toHaveBeenCalledTimes(1) · Received number of calls: 0'.
 *   테스트가 고정 날짜 2026-10-02(금·휴무)로 예약 폼 '저장' 을 누르는데, 저장 핸들러(app-calendar-view.js)는
 *   휴무 확인보다 먼저 [A3] '과거 날짜 예약 방지'(d < 오늘) 를 본다. 날짜가 지나가자 과거 날짜 토스트로 빠졌다.
 *   제품 동작은 맞다(과거 날짜 신규 예약은 막는다) — 틀린 건 테스트가 '오늘' 에 기대고 있던 것.
 *   같은 파일의 '영업시간 안 저장'(2026-10-05) 도 10-06 부터 같은 이유로 깨질 예정이었다(가짜 시계로 실측).
 *
 * 여기서 잠그는 것:
 *   ① (가드) 예약 폼을 실제로 띄워 고정 날짜로 '저장' 을 누르는 테스트는 jest.setSystemTime 으로 시계를 고정해야 하고,
 *      고정한 '오늘' 이 그 테스트가 저장하는 날짜들보다 늦으면 안 된다. — 수정 전 booking-shop-hours-source 가 걸린다.
 *   ② (원인 고정) 과거 날짜는 휴무 확인보다 먼저 막힌다 — 시계를 2026-10-03 으로 두면 2026-10-02 저장은
 *      확인 없이 '과거 날짜' 토스트로 끝난다. 이 순서가 바뀌면 ①의 전제도 다시 봐야 하므로 같이 잠근다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const TESTS_DIR = __dirname;
const SELF = path.basename(__filename);

const ISO_DAY = /\d{4}-\d{2}-\d{2}/;

function scanBookingFormSaveTests() {
  return fs.readdirSync(TESTS_DIR)
    .filter(f => /\.test\.js$/.test(f) && f !== SELF)
    .map(f => ({ f, src: fs.readFileSync(path.join(TESTS_DIR, f), 'utf8') }))
    .filter(({ src }) =>
      /readFileSync\([^)]*app-calendar-view\.js/.test(src) &&   // 예약 폼 소스를 실제로 읽어
      /\beval\(/.test(src) &&                                     // 실행하고
      /bfSave'\)\.click\(\)/.test(src) &&                         // 저장을 누르며
      /'\d{4}-\d{2}-\d{2}'/.test(src));                           // 고정 날짜 문자열을 쓰는 테스트
}

function savedDates(src) {
  const out = [];
  const res = [/setDate\('(\d{4}-\d{2}-\d{2})'\)/g, /bfDate'\)\.value\s*=\s*'(\d{4}-\d{2}-\d{2})'/g];
  for (const re of res) { let m; while ((m = re.exec(src))) out.push(m[1]); }
  return out;
}

describe('① 가드 — 고정 날짜로 예약 폼을 저장하는 테스트는 시계를 고정한다', () => {
  const files = scanBookingFormSaveTests();

  test('대상 테스트가 실제로 있다 (가드가 빈 집합으로 통과하지 않게)', () => {
    expect(files.map(x => x.f)).toContain('booking-shop-hours-source-2026-10-01.test.js');
  });

  test.each(files.map(x => [x.f, x.src]))('%s: jest.setSystemTime 으로 시계 고정 + 고정한 오늘 ≤ 저장 날짜', (_f, src) => {
    const pins = [...src.matchAll(/jest\.setSystemTime\(\s*(?:new Date\(\s*)?'([^']+)'/g)].map(m => m[1]);
    const pinConsts = [...src.matchAll(/const\s+(\w+)\s*=\s*new Date\(\s*'([^']+)'\s*\)/g)]
      .filter(m => new RegExp('jest\\.setSystemTime\\(\\s*' + m[1] + '\\s*\\)').test(src))
      .map(m => m[2]);
    const pinned = pins.concat(pinConsts).filter(s => ISO_DAY.test(s));
    expect(pinned.length).toBeGreaterThan(0);
    // 고정한 '오늘'(UTC·KST 둘 다의 날짜 중 늦은 쪽)이 저장하는 어떤 날짜보다도 늦지 않아야 과거 날짜 가드에 안 걸린다
    const latestToday = (iso) => {
      const t = new Date(iso).getTime();
      const utc = new Date(t).toISOString().slice(0, 10);
      const kst = new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
      return utc > kst ? utc : kst;
    };
    const dates = savedDates(src);
    expect(dates.length).toBeGreaterThan(0);
    const earliestSaved = dates.slice().sort()[0];
    for (const p of pinned) expect(latestToday(p) <= earliestSaved).toBe(true);
  });
});

describe('② 원인 고정 — 과거 날짜는 휴무 확인보다 먼저 막힌다', () => {
  const API_SRC = fs.readFileSync(path.join(ROOT, 'app-booking-api.js'), 'utf8');
  const CAL_SRC = fs.readFileSync(path.join(ROOT, 'app-calendar-view.js'), 'utf8');
  const BH = { mon: { open: '10:00', close: '18:00', off: false }, tue: { open: '10:00', close: '18:00', off: false }, wed: { open: '10:00', close: '18:00', off: false },
    thu: { open: '10:00', close: '18:00', off: false }, fri: { open: '10:00', close: '18:00', off: true }, sat: { open: '11:00', close: '20:30', off: false }, sun: { open: '10:00', close: '18:00', off: false } };
  const tick = () => new Promise(r => setTimeout(r, 0));
  const flush = async (n) => { for (let i = 0; i < (n || 6); i++) await tick(); };

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate',
      'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'hrtime', 'performance'] });
  });
  afterEach(() => { jest.useRealTimers(); });

  function bootCal() {
    document.body.innerHTML = '';
    try { localStorage.clear(); sessionStorage.clear(); } catch (_e) { void _e; }
    window.API = 'http://127.0.0.1:8000';
    window.authHeader = () => ({ Authorization: 'Bearer t' });
    if (!window.crypto || typeof window.crypto.randomUUID !== 'function') {
      Object.defineProperty(window, 'crypto', { value: { randomUUID: () => 'u-' + Math.random() }, configurable: true });
    }
    window.apiFetch = jest.fn(async (p) => {
      if (/\/shop\/settings/.test(p)) return { ok: true, status: 200, json: async () => ({ shop_name: 'x', business_hours_json: JSON.stringify(BH) }) };
      return { ok: true, status: 200, json: async () => ({ items: [] }) };
    });
    localStorage.setItem('itdasy_business_hours_json', JSON.stringify(BH));
    // eslint-disable-next-line no-eval
    window.eval(API_SRC);
    const B = window.Booking;
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
  async function saveOn(day) {
    const B = bootCal();
    await window.openCalendarView(); await flush();
    document.getElementById('bk-fab').click();
    const el = document.getElementById('bfDate');
    el.value = day; el.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('bfCustName').value = '시계손님';
    document.getElementById('bfSave').click();
    await flush(10);
    return B;
  }

  test('🔴 오늘=2026-10-03 이면 2026-10-02(금·휴무) 저장은 휴무 확인 없이 과거 날짜 토스트 (이번 실패의 실제 경로)', async () => {
    jest.setSystemTime(new Date('2026-10-03T03:00:00Z'));
    const B = await saveOn('2026-10-02');
    expect(window._inlineConfirm).not.toHaveBeenCalled();
    expect(B.create).not.toHaveBeenCalled();
    expect(window.showToast).toHaveBeenCalledWith('과거 날짜에는 예약을 추가할 수 없어요');
  });

  test('같은 날짜라도 오늘=2026-10-01 이면 과거가 아니라 휴무 확인으로 간다 (시계 고정이 옳은 고정점)', async () => {
    jest.setSystemTime(new Date('2026-10-01T03:00:00Z'));
    const B = await saveOn('2026-10-02');
    expect(window.showToast).not.toHaveBeenCalledWith('과거 날짜에는 예약을 추가할 수 없어요');
    expect(B.create).not.toHaveBeenCalled();
    expect(window._inlineConfirm).toHaveBeenCalledTimes(1);
    expect(window._inlineConfirm.mock.calls[0][0]).toMatch(/휴무일/);
  });
});
