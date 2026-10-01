/**
 * @jest-environment jsdom
 *
 * ai-quality-06 프런트 부분 (2026-10-01)
 *
 * 실측(pw-caption-retry.log): /persona/generate 가 502 {detail:'ai_empty_response…'} 또는
 * 504 {detail:'ai_timeout…'} 를 Retry-After 없이 돌려주면 프런트 fetch 래퍼가 **3회 자동 재시도**
 * (requests=4, 6초). 캡션 1회 = LLM 최대 2회라 한 탭에 최대 8회 Gemini 호출·한도 4회 예약.
 *
 * 래퍼의 가정 "502/503/504 = 게이트웨이·콜드스타트 = 과금 전" 이 2026-09-07 백엔드 변경
 * (핸들러 내부 실패를 502/504 로 승격) 과 어긋났다. 백엔드는 detail 을 `ai_<code> — 사람말` 로 준다:
 * 모델이 **이미 돈** 실패다. 재시도는 중복 과금 + 결과 유실(2번째 시도가 120초 상한에 걸림)이다.
 *
 * 프런트 방어: LLM 경로의 5xx 라도 detail 이 ai_* 코드면 재시도하지 않는다.
 * Retry-After 가 있으면 그것도(기존대로) 존중한다. 진짜 게이트웨이 5xx(detail 에 ai_ 없음)는 기존대로 재시도.
 *
 * app-core.js 의 fetch 인터셉터 IIFE 를 그대로 떼어 실행한다.
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app-core.js'), 'utf8');

function interceptorBody() {
  const start = SRC.indexOf('(function _installFetchInterceptor(){');
  expect(start).toBeGreaterThan(-1);
  const fetchDef = SRC.indexOf('window.fetch = async function', start);
  expect(fetchDef).toBeGreaterThan(start);
  const end = SRC.indexOf('\n})();', fetchDef);
  expect(end).toBeGreaterThan(fetchDef);
  return SRC.slice(start, end + '\n})();'.length);
}

/** jsdom 엔 Response 가 없다 — clone/json/text/headers 만 있는 최소 스텁 */
function mkRes(status, body, headers) {
  const h = headers || {};
  const make = () => ({
    ok: status < 300, status,
    headers: { get: (k) => { const key = Object.keys(h).find((x) => x.toLowerCase() === String(k).toLowerCase()); return key ? h[key] : null; } },
    clone: () => make(),
    json: async () => JSON.parse(body),
    text: async () => body,
  });
  return make();
}

function b64url(s) { return Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

function install(responder) {
  const calls = [];
  const win = {
    API: 'https://api.test',
    fetch: jest.fn(async (input, init) => { calls.push({ input, init }); return responder(calls.length, input, init); }),
    addEventListener: jest.fn(), dispatchEvent: jest.fn(),
    location: { href: 'https://app.test/index.html' },
  };
  const tok = 'h.' + b64url(JSON.stringify({ sub: 1, exp: Math.floor(Date.now() / 1000) + 86400 })) + '.s';
  const doc = { addEventListener: jest.fn(), getElementById: () => null, dispatchEvent: jest.fn() };
  // eslint-disable-next-line no-new-func
  const fn = new Function('window', 'document', 'navigator', 'getToken', 'setToken', '_setAuthGateLocked', 'showToast', 'apiUrl', 'console',
    'setTimeout', 'clearTimeout', 'setInterval', 'AbortController', 'DOMException', 'atob', 'URL', 'FormData', 'Blob', 'Date', interceptorBody());
  fn(win, doc, { onLine: true }, () => tok, jest.fn(), jest.fn(), jest.fn(), (p) => 'https://api.test' + p, { warn: jest.fn(), log: jest.fn(), error: jest.fn() },
    setTimeout, clearTimeout, setInterval, AbortController, DOMException, atob, URL, FormData, Blob, Date);
  return { win, calls, tok };
}

async function post(win, tok, pathname) {
  const p = win.fetch('https://api.test' + pathname, {
    method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ q: 1 }),
  });
  await jest.advanceTimersByTimeAsync(30000);   // 백오프 500+1500+4000ms 를 전부 지나보낸다
  return p;
}

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

describe('LLM 경로 — 모델이 이미 돈 실패(ai_*)는 자동 재시도하지 않는다', () => {
  test('★ 502 {detail:"ai_empty_response …"} · Retry-After 없음 → 요청 1회', async () => {
    const { win, calls, tok } = install(() => mkRes(502, JSON.stringify({ detail: 'ai_empty_response — AI가 이번엔 글을 만들지 못했어요. 다시 시도해 주세요.' })));
    const res = await post(win, tok, '/persona/generate');
    expect(res.status).toBe(502);
    expect(calls.length).toBe(1);
    // 호출부가 detail 을 읽을 수 있어야 한다(본문을 소진하지 않는다)
    await expect(res.json()).resolves.toMatchObject({ detail: expect.stringMatching(/^ai_empty_response/) });
  });

  test('★ 504 {detail:"ai_timeout …"} · Retry-After 없음 → 요청 1회', async () => {
    const { win, calls, tok } = install(() => mkRes(504, JSON.stringify({ detail: 'ai_timeout — AI 응답이 평소보다 오래 걸려요. 잠시 후 다시 시도해 주세요.' })));
    const res = await post(win, tok, '/caption/generate');
    expect(res.status).toBe(504);
    expect(calls.length).toBe(1);
  });

  test('detail 이 객체({code:"ai_failed"}) 여도 잡는다', async () => {
    const { win, calls, tok } = install(() => mkRes(502, JSON.stringify({ detail: { code: 'ai_failed', message: '…' } })));
    await post(win, tok, '/assistant/chat');
    expect(calls.length).toBe(1);
  });

  test('Retry-After 가 있으면 기존대로 재시도하지 않는다', async () => {
    const { win, calls, tok } = install(() => mkRes(502, JSON.stringify({ detail: 'AI 서버 연결이 잠깐 끊겼어요.' }), { 'Retry-After': '3' }));
    await post(win, tok, '/persona/generate');
    expect(calls.length).toBe(1);
  });

  test('진짜 게이트웨이 5xx(detail 에 ai_ 코드 없음)는 기존대로 재시도한다 (총 4회)', async () => {
    const { win, calls, tok } = install(() => mkRes(502, JSON.stringify({ detail: 'Bad Gateway' })));
    await post(win, tok, '/persona/generate');
    expect(calls.length).toBe(4);
  });

  test('본문이 JSON 이 아닌 502(콜드스타트 HTML 등)도 기존대로 재시도한다', async () => {
    const { win, calls, tok } = install(() => mkRes(502, '<html>502</html>'));
    await post(win, tok, '/persona/generate');
    expect(calls.length).toBe(4);
  });

  test('첫 시도 게이트웨이 502 → 재시도에서 200 이면 성공 응답을 돌려준다', async () => {
    const { win, calls, tok } = install((n) => (n === 1 ? mkRes(502, JSON.stringify({ detail: 'upstream' })) : mkRes(200, JSON.stringify({ caption: 'ok' }))));
    const res = await post(win, tok, '/persona/generate');
    expect(res.status).toBe(200);
    expect(calls.length).toBe(2);
  });
});
