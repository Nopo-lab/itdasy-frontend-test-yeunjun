/**
 * @jest-environment jsdom
 */
/* 세션 만료 뒤에도 폴러가 영원히 도는 것 — SESS-1 (2026-09-01)
 *
 * ## 실측 (Cloud Logging, staging 7일)
 *
 *   401 GET /dm-confirm-queue   2,989건
 *   아이폰 1대(iOS 18.7) · IP 1개 · **간격 median 4.00초** · 26분 연속
 *
 * 화면에는 아무것도 안 떴다. `_refresh().catch(() => {})` 가 통째로 삼킨다.
 *
 * ## 근본원인 두 겹
 *
 *   ① app-core.js  `if (res.status === 401 && getToken() && ...)`
 *      `_handle401()` 이 `setToken(null)` 을 하므로, **두 번째 401부터는 getToken() 이
 *      falsy 라 이 분기 자체를 못 탄다.** 잠금화면을 다시 세우지도 못한다.
 *   ② 잠금화면(`_setAuthGateLocked`)은 body 클래스와 aria-hidden 만 바꾼다 —
 *      열려 있던 시트를 닫지도, 그 시트의 4초 타이머를 멈추지도 않는다.
 *
 * 여기서 잠그는 것:
 *   A. 세션이 죽으면 인증 요청은 **네트워크를 안 탄다** (합성 401)
 *   B. 로그인·헬스체크는 막히지 않는다 (막으면 재로그인 자체가 불가능)
 *   C. 재로그인하면 즉시 풀린다 (로그인은 됐는데 앱이 빈 화면 방지)
 *   D. 실패를 성공으로 위장하지 않는다 — 401 그대로 돌려준다
 *   E. 폴러가 `itdasy:auth-expired` 에 실제로 멈춘다
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* 이 jsdom 버전엔 전역 Response 가 없다(브라우저·Capacitor WebView 에는 있다).
   앱 코드가 쓰는 부분(status·ok·json)만 최소로 흉내낸다. */
if (typeof global.Response === 'undefined') {
  global.Response = class {
    constructor(body, init) {
      this._body = body;
      this.status = (init && init.status) || 200;
      this.ok = this.status >= 200 && this.status < 300;
      this.headers = new Map(Object.entries((init && init.headers) || {}));
    }
    async json() { return JSON.parse(this._body); }
    async text() { return String(this._body); }
  };
}

/* app-core.js 를 통째로 로드하면 DOM·SW·네트워크가 딸려온다.
   그래서 이 결함의 **실제 코드**만 떼어 같은 모양으로 평가한다.
   (떼어낸 조각이 원본과 어긋나지 않도록 아래 drift 테스트가 지킨다) */
function buildCore() {
  const src = read('app-core.js');
  const pick = (re, what) => {
    const m = src.match(re);
    if (!m) throw new Error(`app-core.js 에서 ${what} 를 못 찾았다 — 이름이 바뀌었나?`);
    return m[0];
  };
  const authFree = pick(/const _AUTH_FREE_RE = [\s\S]*?\n  \}\n/, '_AUTH_FREE_RE/_isAuthFreePath');
  const blocked = pick(/function _blockedByDeadSession\(input\) \{[\s\S]*?\n  \}/, '_blockedByDeadSession');

  const api = 'https://api.test';
  let token = 'tok-1';
  const netCalls = [];
  window.API = api;

  function getToken() { return token; }
  function setToken(t) {
    if (t) { window.__itdasyAuthDead = false; }
    token = t;
  }
  function _isApiOrigin(input) {
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (!window.API) return false;
      return new URL(url, location.href).origin === new URL(window.API, location.href).origin;
    } catch (_e) { return false; }
  }
  function _handle401() {
    setToken(null);
    window.__itdasyAuthDead = true;
    document.dispatchEvent(new CustomEvent('itdasy:auth-expired'));
  }

  // eslint-disable-next-line no-eval
  const scope = eval(`(function(){
    ${authFree}
    ${blocked}
    return { _isAuthFreePath: _isAuthFreePath, _blockedByDeadSession: _blockedByDeadSession };
  })`)();

  // 실제 래퍼와 같은 순서: 죽은세션 차단 → 네트워크
  async function fetchLike(input, status) {
    if (scope._blockedByDeadSession(input)) {
      return new Response(JSON.stringify({ detail: '세션이 만료됐어요. 다시 로그인해 주세요.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    netCalls.push(input);
    return new Response('{}', { status: status || 200 });
  }

  return { fetchLike, netCalls, _handle401, setToken, getToken, api, scope };
}

beforeEach(() => {
  document.body.innerHTML = '';
  window.__itdasyAuthDead = false;
  jest.useRealTimers();
});

// ── A · 세션이 죽으면 네트워크를 안 탄다 ─────────────────────────
test('세션 만료 후 인증 요청은 네트워크를 타지 않는다', async () => {
  const c = buildCore();

  await c.fetchLike(c.api + '/dm-confirm-queue');
  expect(c.netCalls).toHaveLength(1);          // 살아있을 땐 정상 통과

  c._handle401();

  for (let i = 0; i < 400; i++) await c.fetchLike(c.api + '/dm-confirm-queue');
  expect(c.netCalls).toHaveLength(1);          // 400번 폴링해도 추가 요청 0
});

test('실측과 같은 수(2,989회)를 때려도 서버로 나가지 않는다', async () => {
  const c = buildCore();
  c._handle401();
  for (let i = 0; i < 2989; i++) await c.fetchLike(c.api + '/dm-confirm-queue');
  expect(c.netCalls).toHaveLength(0);
});

// ── B · 막으면 안 되는 것 ────────────────────────────────────────
test.each([
  ['/auth/login'],
  ['/auth/refresh'],
  ['/auth/register'],
  ['/auth/send-verification'],
  ['/health'],
  ['/version'],
])('세션이 죽어도 %s 는 막지 않는다 (막으면 재로그인 불가)', async (p) => {
  const c = buildCore();
  c._handle401();
  await c.fetchLike(c.api + p);
  expect(c.netCalls).toEqual([c.api + p]);
});

test('남의 오리진은 이 로직이 건드리지 않는다', async () => {
  const c = buildCore();
  c._handle401();
  await c.fetchLike('https://cdn.example.com/x.png');
  expect(c.netCalls).toEqual(['https://cdn.example.com/x.png']);
});

// ── C · 재로그인하면 즉시 풀린다 ─────────────────────────────────
test('재로그인하면 차단이 풀린다 — 로그인했는데 빈 화면 방지', async () => {
  const c = buildCore();
  c._handle401();
  await c.fetchLike(c.api + '/customers');
  expect(c.netCalls).toHaveLength(0);

  c.setToken('tok-2');                     // 재로그인
  await c.fetchLike(c.api + '/customers');
  expect(c.netCalls).toEqual([c.api + '/customers']);
});

// ── D · 실패를 성공으로 위장하지 않는다 ──────────────────────────
test('차단은 401 로 돌려준다 — 빈 200 으로 속이지 않는다', async () => {
  const c = buildCore();
  c._handle401();
  const res = await c.fetchLike(c.api + '/dm-confirm-queue');
  expect(res.ok).toBe(false);
  expect(res.status).toBe(401);
  const body = await res.json();
  expect(body.detail).toMatch(/다시 로그인/);
});

// ── E · 폴러가 실제로 멈춘다 ─────────────────────────────────────
test('app-dm-confirm-queue 4초 폴러가 auth-expired 에 멈춘다', () => {
  const src = read('app-dm-confirm-queue.js');
  expect(src).toMatch(/const QUEUE_POLL_MS = 4000/);
  expect(src).toMatch(/addEventListener\('itdasy:auth-expired',\s*_stopQueuePoll\)/);
});

test.each([
  ['app-comment-reply-queue.js'],
  ['app-notifications.js'],
  ['app-dm-conversations.js'],
])('%s 도 auth-expired 에 폴링을 멈춘다', (f) => {
  expect(read(f)).toMatch(/itdasy:auth-expired/);
});

// ── drift · 원본이 바뀌면 여기서 걸린다 ─────────────────────────
test('app-core 가 죽은세션 차단을 실제 fetch 래퍼에서 부른다', () => {
  const src = read('app-core.js');
  // 래퍼 진입 직후에 있어야 한다 — 뒤로 밀리면 네트워크가 먼저 나간다
  const wrapper = src.match(/window\.fetch = async function\(input, init\) \{[\s\S]{0,600}/)[0];
  expect(wrapper).toMatch(/if \(_blockedByDeadSession\(input\)\)/);
});

test('401 분기 조건에서 getToken() 가드가 빠졌다', () => {
  const src = read('app-core.js');
  expect(src).not.toMatch(/res\.status === 401 && getToken\(\) && _isApiOrigin/);
  expect(src).toMatch(/res\.status === 401 && _isApiOrigin\(input\)/);
});

test('_handle401 이 세션 사망을 알린다', () => {
  const src = read('app-core.js');
  const fn = src.match(/function _handle401\(\) \{[\s\S]*?\n  \}/)[0];
  expect(fn).toMatch(/__itdasyAuthDead = true/);
  expect(fn).toMatch(/itdasy:auth-expired/);
});

test('setToken 이 새 토큰에서 사망 표시를 푼다', () => {
  const src = read('app-core.js');
  const fn = src.match(/function setToken\(t\) \{[\s\S]{0,900}/)[0];
  expect(fn).toMatch(/__itdasyAuthDead = false/);
});
