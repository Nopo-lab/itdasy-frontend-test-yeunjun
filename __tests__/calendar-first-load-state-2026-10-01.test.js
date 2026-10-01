/**
 * @jest-environment jsdom
 *
 * mobile-ux-01 (P1) — 예약관리 첫 진입에서 예약 목록 로드가 실패하면 **빈 달력 + '오늘 0건 · 이번달 0건'**
 *   으로 그려지고(거짓 빈 상태) 오류 표시·재시도가 없던 것. 로드 중에도 같은 '0건' 화면.
 *   실측(2026-10-01, GET /bookings 500 고정, evidence/mobile-ux/fix_before_states.json calendar.500final):
 *     openErr "Error: injected 500" · body "일 월 화 … 31"(빈 달력) · stats "오늘 0건 이번달 0건" · retryOrErrorEl 0
 *
 * perf-frontend-06 (P2) — 월 뷰 열기 longtask 350~440ms(예약 200건·CPU 4x).
 *   프로파일(evidence/perf-frontend/fix_measure_before.json): _sizeMonthRows 307ms + _capMonthCells 135ms self —
 *   칸마다 쓰기→읽기를 반복하는 강제 레이아웃, 그리고 같은 프레임에 rAF 가 두 번 걸려 두 번 실행.
 *
 * 여기서 잠그는 것:
 *   ① 로드 중엔 로딩 표시 + 통계 '—' (숫자 '0건' 없음)
 *   ② 실패하면 .dt-error + '다시 시도' 버튼, 달력 그리드 없음, openCalendarView 는 reject 하지 않음
 *   ③ 다시 시도 → 성공하면 월 그리드 + 실제 숫자
 *   ④ 월 이동 실패도 본문 실패 + 토스트에 '다시 시도' 액션
 *   ⑤ _capMonthCellsSoon 은 같은 프레임의 중복 호출을 1회로 합친다
 *   ⑥ _capMonthCells 는 읽기(clientHeight/offsetHeight)를 쓰기(hidden) 사이에 끼워 넣지 않는다 (레이아웃 스래싱 금지)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'app-calendar-view.js'), 'utf8');

const tick = () => new Promise(r => setTimeout(r, 0));
const flush = async (n) => { for (let i = 0; i < (n || 4); i++) await tick(); };

function boot(listImpl) {
  document.body.innerHTML = '';
  window.innerWidth = 390; window.innerHeight = 844;
  window._esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  window.showToast = jest.fn();
  window.Booking = {
    list: jest.fn(listImpl),
    shopHours: () => ({ start: 9, end: 24, slotMin: 30 }),
    findConflict: () => null,
    _invalidateCache: () => {},
    get _items() { return []; },
    get isOffline() { return false; },
  };
  try { sessionStorage.setItem('itdasy_overdue_sheet_shown', '1'); } catch (_e) { void _e; }
  // eslint-disable-next-line no-eval
  window.eval(SRC);
}
const booking = (iso, name) => ({ id: Math.floor(Math.random() * 1e6), starts_at: iso, ends_at: iso.replace('T10', 'T11'), status: 'confirmed', customer_name: name || '손님' });
function thisMonthISO(day) {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T10:00:00+09:00`;
}
const body = () => document.querySelector('#cal-overlay #bk-body');
const stats = () => document.querySelector('#cal-overlay #bk-mobile-stats-mount');

describe('mobile-ux-01 · 첫 진입 로드 상태', () => {
  test('🔴 로드 실패: 빈 달력·0건 대신 실패 + 다시 시도 (이번 버그) · openCalendarView 는 reject 하지 않는다', async () => {
    const err = new Error('HTTP 500'); err.status = 500;
    boot(() => Promise.reject(err));
    await expect(window.openCalendarView()).resolves.toBeUndefined();
    await flush();
    expect(body().querySelector('[data-cal-error]')).not.toBeNull();
    expect(body().textContent).toMatch(/예약을 불러오지 못했어요/);
    expect(body().querySelector('[data-cal-retry]')).not.toBeNull();
    expect(body().querySelector('.bk-month-m__cells')).toBeNull();          // 빈 달력을 그리지 않는다
    expect(stats().textContent).not.toMatch(/0건/);                          // '0건' 은 틀린 정보
    expect(stats().textContent).toMatch(/—/);
    // 서버 실패 문구 — 네트워크 끊김 문구가 아니다
    expect(body().textContent).not.toMatch(/인터넷 연결이 없어서/);
  });

  test('로드 중: 로딩 표시 + 통계 —, 달력 없음 → 도착 후 그리드 + 실제 숫자', async () => {
    let resolve;
    boot(() => new Promise(r => { resolve = r; }));
    const p = window.openCalendarView();
    await flush();
    expect(body().querySelector('[data-cal-loading]')).not.toBeNull();
    expect(body().textContent).toMatch(/불러오는 중/);
    expect(body().querySelector('.bk-month-m__cells')).toBeNull();
    expect(stats().textContent).not.toMatch(/0건/);
    resolve([booking(thisMonthISO(15), '김하나'), booking(thisMonthISO(16), '이두리')]);
    await p; await flush();
    expect(body().querySelector('.bk-month-m__cells')).not.toBeNull();
    expect(body().querySelectorAll('.bk-month-m__evt').length).toBe(2);
    expect(stats().textContent).toMatch(/이번달 2건/);
  });

  test('실패 → 다시 시도 → 성공하면 월 그리드', async () => {
    let n = 0;
    boot(() => { n++; return n === 1 ? Promise.reject(new Error('HTTP 503')) : Promise.resolve([booking(thisMonthISO(20), '박셋')]); });
    await window.openCalendarView(); await flush();
    const btn = body().querySelector('[data-cal-retry]');
    expect(btn).not.toBeNull();
    btn.click();
    await flush(6);
    expect(window.Booking.list).toHaveBeenCalledTimes(2);
    expect(body().querySelector('[data-cal-error]')).toBeNull();
    expect(body().querySelectorAll('.bk-month-m__evt').length).toBe(1);
    expect(stats().textContent).toMatch(/이번달 1건/);
  });

  test('네트워크 끊김(AbortError/Failed to fetch)은 그 문구로 — 서버 실패와 가른다', async () => {
    const e = new TypeError('Failed to fetch');
    boot(() => Promise.reject(e));
    await window.openCalendarView(); await flush();
    expect(body().textContent).toMatch(/인터넷 연결이 없어서 예약을 불러오지 못했어요/);
    expect(body().querySelector('[data-cal-retry]')).not.toBeNull();
  });

  test('월 이동 실패: 본문 실패 + 토스트에 다시 시도 액션 (옛 달 그리드를 새 달 라벨 아래 두지 않는다)', async () => {
    let n = 0;
    boot(() => { n++; return n === 1 ? Promise.resolve([booking(thisMonthISO(3))]) : Promise.reject(new Error('HTTP 500')); });
    await window.openCalendarView(); await flush();
    expect(body().querySelectorAll('.bk-month-m__evt').length).toBe(1);
    await window._calNextMonth(); await flush();
    expect(body().querySelector('[data-cal-error]')).not.toBeNull();
    expect(body().querySelectorAll('.bk-month-m__evt').length).toBe(0);
    const toastCall = window.showToast.mock.calls.find(c => /불러오지 못했어요/.test(String(c[0])));
    expect(toastCall).toBeTruthy();
    expect(toastCall[1] && toastCall[1].action && typeof toastCall[1].action.onClick).toBe('function');
    expect(toastCall[1].action.label).toMatch(/다시 시도/);
  });
});

describe('perf-frontend-06 · 월 그리드 보정은 프레임당 1회 · 레이아웃 스래싱 금지', () => {
  test('⑤ _capMonthCellsSoon 중복 호출은 rAF 1건으로 합쳐진다', async () => {
    boot(() => Promise.resolve([booking(thisMonthISO(5)), booking(thisMonthISO(5), '둘')]));
    const rafSpy = jest.spyOn(window, 'requestAnimationFrame');
    await window.openCalendarView();
    // _renderViewBody → _capMonthCellsSoon 직접 1회 + _refreshMobileCards 안에서 또 1회 → 합쳐서 1건이어야 한다
    const calls = rafSpy.mock.calls.length;
    expect(calls).toBe(1);
    rafSpy.mockRestore();
  });

  test('⑥ _capMonthCells: 칩을 숨기기 시작한 뒤엔 레이아웃을 다시 읽지 않는다 (칸마다 쓰기→읽기 반복 금지)', async () => {
    // 넘치는 칸이 둘 — 예전 코드는 칸 A 를 숨긴 뒤 칸 B 를 다시 잰다(강제 레이아웃이 칸 수만큼).
    const six = (day) => Array.from({ length: 6 }, (_, i) => booking(thisMonthISO(day), '손' + i));
    boot(() => Promise.resolve(six(8).concat(six(9))));
    await window.openCalendarView(); await flush();
    const grid = body().querySelector('.bk-month-m__cells');
    expect(grid).not.toBeNull();
    // 레이아웃 읽기/쓰기 순서를 기록한다 — jsdom 은 레이아웃이 없으므로 getter 를 흉내 낸다.
    //   R = clientHeight/offsetHeight 읽기(레이아웃 강제), Wc:1 = 칩 숨기기, Wm = '+N' 요소 토글
    const log = [];
    const hiddenDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hidden');
    const spyHidden = (el, tag) => Object.defineProperty(el, 'hidden', { get() { return hiddenDesc.get.call(this); }, set(v) { log.push(tag + ':' + (v ? 1 : 0)); hiddenDesc.set.call(this, v); }, configurable: true });
    grid.querySelectorAll('.bk-month-m__events').forEach(box => Object.defineProperty(box, 'clientHeight', { get() { log.push('R'); return 40; }, configurable: true }));
    grid.querySelectorAll('.bk-month-m__evt').forEach(el => { Object.defineProperty(el, 'offsetHeight', { get() { log.push('R'); return 14; }, configurable: true }); spyHidden(el, 'Wc'); });
    grid.querySelectorAll('.bk-month-m__more').forEach(el => { Object.defineProperty(el, 'offsetHeight', { get() { log.push('R'); return 12; }, configurable: true }); spyHidden(el, 'Wm'); });
    // 보정이 다시 돌게 한다 (통계 토글 = _refreshMobileCards → _capMonthCellsSoon)
    document.querySelector('#bk-stat-toggle').click();
    await new Promise(r => requestAnimationFrame(() => r()));
    await flush();
    const firstHide = log.indexOf('Wc:1');
    expect(firstHide).toBeGreaterThan(-1);                       // 6건 → 40px 칸엔 안 들어가므로 반드시 숨긴다
    // 칩을 숨기기 시작한 뒤의 읽기 = 다음 칸을 다시 재는 것 = 칸마다 강제 레이아웃
    expect(log.slice(firstHide).filter(x => x === 'R')).toHaveLength(0);
    // 읽기 묶음은 많아야 3번(행 높이 실측 · 칸 실측 · '+N' 높이 1회) — 칸 수(2)에 비례하면 안 된다
    const readRuns = log.reduce((n, x, i) => n + (x === 'R' && log[i - 1] !== 'R' ? 1 : 0), 0);
    expect(readRuns).toBeLessThanOrEqual(3);
    // '+N' 이 두 칸 모두 붙었다 (결과는 예전과 같아야 한다)
    const mores = Array.from(grid.querySelectorAll('.bk-month-m__more:not([hidden])'));
    expect(mores).toHaveLength(2);
    mores.forEach(m => expect(m.textContent).toMatch(/^\+\d+$/));
  });
});
