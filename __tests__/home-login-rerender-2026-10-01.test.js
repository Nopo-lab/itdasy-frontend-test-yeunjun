/**
 * @jest-environment node
 */
'use strict';
/**
 * [perf-frontend-01 · 2026-10-01] 로그인 직후 홈이 영영 안 그려지던 것.
 *
 * 실측(Playwright, 390px): 토큰 없이 부팅 → DOMContentLoaded 1.5s/4.5s 뒤 로그인 → 30초를 기다려도
 *   #homeV41Root 엔 .hv5-skel 스켈레톤만 남고 .hv5 가 없다(/assistant/brief 200 인데도).
 *   작업실 탭 → 홈 탭 왕복해야 그제야 그려진다. DCL 9초 뒤 로그인하면 정상.
 *
 * 원인은 세 겹이었다:
 *   ① _autoMount 가 토큰 유무와 상관없이 네트워크 렌더를 시작 → _inFlight=true 로 ~5.8s(헤더 대기 3s + 백오프)
 *   ② 그 사이 로그인 → refreshAfterAuth → HomeV41.refresh() 가 `if (_inFlight) return;` 으로 **버려진다**
 *   ③ 초기 렌더는 끝날 때 `renderAuth !== 현재 토큰` 이라 조기 return → 스켈레톤이 영영 남는다
 *
 * 여기서 잠그는 것:
 *   - in-flight 중 들어온 refresh 는 버리지 않고 끝난 뒤 한 번 더 그린다(현재 토큰으로)
 *   - 로그인 전(웹·토큰 없음)엔 네트워크 렌더도 스켈레톤도 시작하지 않는다 — 로그인 훅이 그린다
 *   - 네이티브(보안저장 하이드레이션 중)는 예전처럼 헤더를 기다리며 그린다 — 회귀 방지
 *   - 로그인 훅(refresh + data-changed:auth)은 brief 를 한 번만 부른다
 *
 * 테스트마다 **새 JSDOM 창**에 실제 app-home-v41.js 를 통째로 올린다 — 같은 창에 두 번 올리면
 * 이전 테스트의 리스너 클로저가 살아남아 결과를 오염시킨다.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'app-home-v41.js'), 'utf8');

const flush = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r)); };
async function tick(ms) {
  for (let t = 0; t < ms; t += 50) { jest.advanceTimersByTime(50); await flush(); }
}

/**
 * @param {object} o
 * @param {string|null} o.token      부팅 시점 토큰
 * @param {boolean}     o.native     Capacitor 네이티브 흉내(보안저장 하이드레이션 비동기)
 * @param {number}      o.fetchDelay apiFetch 응답 지연(ms, 가짜 타이머)
 */
async function boot({ token = null, native = false, fetchDelay = 0 } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="homeV41Root"></div><div id="headerAvatar"></div></body></html>',
    { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
  const w = dom.window;
  await new Promise(r => { if (w.document.readyState === 'complete') r(); else w.addEventListener('load', r); });
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  // 파일은 bare setTimeout/Date/requestAnimationFrame 을 쓴다 — 이 창에 가짜 타이머를 꽂는다
  w.setTimeout = setTimeout; w.clearTimeout = clearTimeout; w.Date = Date;
  w.requestAnimationFrame = (cb) => setTimeout(cb, 16);
  w.scrollTo = jest.fn();

  const state = { token, ready: false };
  const calls = [];
  w.API = 'http://api.invalid';
  w.authHeader = () => (state.token ? { Authorization: 'Bearer ' + state.token } : {});
  w.apiFetch = jest.fn(async (p, opts) => {
    const auth = opts && opts.headers && opts.headers.Authorization;
    calls.push({ path: p, auth });
    if (fetchDelay) await new Promise(r => setTimeout(r, fetchDelay));
    return { ok: true, status: 200, json: async () => (p.indexOf('/assistant/brief') === 0 ? { today_bookings: [], _who: auth } : []) };
  });
  w.HomeV41Render = {
    compose: (brief) => `<div class="hv5" data-who="${(brief && brief._who) || ''}">home</div>`,
    syncAvatar: jest.fn(), todayBookings: () => [], toggleBookings: jest.fn(),
  };
  w.HomeV41Actions = { run: jest.fn() };
  if (native) {
    w.Capacitor = { isNativePlatform: () => true };
    w._tokenReadyCheck = () => state.ready;
  }
  w.eval(SRC);   // readyState 'complete' → _autoMount 즉시 실행
  return {
    w, state, calls,
    root: () => w.document.getElementById('homeV41Root'),
    briefs: () => calls.filter(c => c.path.indexOf('/assistant/brief') === 0),
    // app-core.refreshAfterAuth 가 하는 두 가지
    loginHook: () => {
      w.HomeV41.refresh();
      w.dispatchEvent(new w.CustomEvent('itdasy:data-changed', { detail: { kind: 'auth' } }));
    },
  };
}

afterEach(() => { jest.useRealTimers(); });

describe('로그인 직후 홈 렌더', () => {
  test('🔴 토큰 없이 부팅 → 1.5초 뒤 로그인 → 홈(.hv5)이 그려진다 (스켈레톤 고착 금지)', async () => {
    const h = await boot({ token: null });
    await tick(1500);
    h.state.token = 'T1';
    h.loginHook();
    await tick(10000);
    expect(h.root().querySelector('.hv5')).not.toBeNull();
    expect(h.root().querySelector('.hv5-skel')).toBeNull();
    const b = h.briefs();
    expect(b.length).toBeGreaterThanOrEqual(1);
    expect(b.every(c => c.auth === 'Bearer T1')).toBe(true);
    expect(b.length).toBeLessThanOrEqual(2);
  });

  test('🔴 in-flight 중 계정이 바뀌며 refresh() → 버리지 않고 새 토큰으로 다시 그린다', async () => {
    const h = await boot({ token: 'A', fetchDelay: 500 });
    await tick(200);                    // A 로 그리는 중
    h.state.token = 'B';
    h.loginHook();                      // 예전엔 _inFlight 가드가 그냥 버렸다
    await tick(5000);
    const hv5 = h.root().querySelector('.hv5');
    expect(hv5).not.toBeNull();
    expect(hv5.getAttribute('data-who')).toBe('Bearer B');   // A 데이터로 그리지 않는다
    const b = h.briefs();
    expect(b[b.length - 1].auth).toBe('Bearer B');
    expect(b.length).toBeLessThanOrEqual(2);
  });

  test('🔴 웹에서 토큰이 없으면 네트워크 렌더도 스켈레톤도 시작하지 않는다 — 로그인 훅이 그린다', async () => {
    const h = await boot({ token: null });
    await tick(6000);
    expect(h.calls.length).toBe(0);
    expect(h.root().querySelector('.hv5-skel')).toBeNull();
    expect(h.root().innerHTML).toBe('');
    h.state.token = 'T1';
    h.loginHook();
    await tick(3000);
    expect(h.root().querySelector('.hv5')).not.toBeNull();
    expect(h.briefs().length).toBe(1);   // refresh + data-changed:auth 가 두 번 부르지 않는다
  });

  test('네이티브(보안저장 하이드레이션 중)는 헤더를 기다렸다 그린다 — refresh 없이도 .hv5', async () => {
    const h = await boot({ token: null, native: true });
    await tick(300);
    expect(h.root().querySelector('.hv5-skel')).not.toBeNull();   // 기다리는 동안 스켈레톤
    h.state.token = 'N1'; h.state.ready = true;                    // Keychain 읽기 완료
    await tick(4000);
    expect(h.root().querySelector('.hv5')).not.toBeNull();
    expect(h.briefs().length).toBe(1);
    expect(h.briefs()[0].auth).toBe('Bearer N1');
  });

  test('토큰이 있는 평소 부팅은 그대로 한 번에 그린다 (회귀 방지)', async () => {
    const h = await boot({ token: 'T0' });
    await tick(2000);
    expect(h.root().querySelector('.hv5')).not.toBeNull();
    expect(h.briefs().length).toBe(1);
  });
});
