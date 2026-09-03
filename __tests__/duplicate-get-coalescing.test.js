/**
 * @jest-environment jsdom
 */
/* 같은 mutation 하나가 같은 GET 을 여러 번 쏘면 안 된다.
 *
 * 실측 (2026-09-02, 배포본 · 인증 세션):
 *   예약 생성 1회 → data-changed 1회 → **12요청 / 8엔드포인트**
 *     /dm-confirm-queue ×3   ← 예약과 아무 상관 없는 데이터
 *     /revenue          ×2   ← 같은 URL 을 두 소비자가 각자
 *     /assistant/brief  ×2   ← 같은 URL 을 두 소비자가 각자
 *
 * 원인 두 갈래:
 *   ① kind 필터 없음 — 모듈이 "내 데이터가 바뀌었나" 를 안 묻고 무조건 재조회
 *   ② in-flight 공유 없음 — 같은 GET 이 동시에 나가도 서로를 모름
 *
 * 둘 다 잠근다. debounce/setTimeout 으로 가리는 게 아니라 구조로 막는다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** app-core.js 에서 apiFetch + coalescing 만 떼어내 실제로 실행한다 */
function loadApiFetch(fetchImpl) {
  const src = read('app-core.js');
  const start = src.indexOf('const _inflightGET');
  const end = src.indexOf('/* 변경 종류(kind)');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const body = src.slice(start, end);
  // eslint-disable-next-line no-new-func
  return new Function('fetch', 'apiUrl', body + '\nreturn apiFetch;')(fetchImpl, (p) => 'https://api.test' + p);
}

/** kind→도메인 정책만 떼어내 실행 */
function loadAffects() {
  const src = read('app-core.js');
  const start = src.indexOf('const _CHANGE_DOMAINS');
  const end = src.indexOf('};', src.indexOf('window.itdChangeAffects')) + 2;
  const body = src.slice(start, end);
  const win = {};
  // eslint-disable-next-line no-new-func
  new Function('window', body).call(null, win);
  return win.itdChangeAffects;
}

/** jsdom 에는 Response 가 없다 — clone/json 만 있는 최소 스텁 */
function mkRes(body) {
  const make = () => ({
    _read: false,
    json() { if (this._read) throw new Error('body already read'); this._read = true; return Promise.resolve(JSON.parse(body)); },
    clone() { return make(); },
  });
  return make();
}

describe('동시 동일 GET 은 하나로 합쳐진다', () => {
  test('★ 같은 URL GET 3발 → 실제 네트워크 1회 (이번 버그)', async () => {
    let calls = 0;
    const apiFetch = loadApiFetch(() => { calls++; return Promise.resolve(mkRes('{"ok":1}')); });
    await Promise.all([apiFetch('/revenue'), apiFetch('/revenue'), apiFetch('/revenue')]);
    expect(calls).toBe(1);
  });

  test('소비자마다 본문을 각자 읽을 수 있다 (clone)', async () => {
    const apiFetch = loadApiFetch(() => Promise.resolve(mkRes('{"v":42}')));
    const [a, b] = await Promise.all([apiFetch('/revenue'), apiFetch('/revenue')]);
    await expect(a.json()).resolves.toEqual({ v: 42 });
    await expect(b.json()).resolves.toEqual({ v: 42 });   // 합쳤다고 본문이 소진되면 안 된다
  });

  test('캐시가 아니다 — 끝난 뒤 다시 부르면 새로 나간다', async () => {
    let calls = 0;
    const apiFetch = loadApiFetch(() => { calls++; return Promise.resolve(mkRes('{}')); });
    await apiFetch('/revenue');
    await apiFetch('/revenue');
    expect(calls).toBe(2);
  });

  test('다른 URL 은 안 합친다', async () => {
    let calls = 0;
    const apiFetch = loadApiFetch(() => { calls++; return Promise.resolve(mkRes('{}')); });
    await Promise.all([apiFetch('/revenue'), apiFetch('/bookings')]);
    expect(calls).toBe(2);
  });

  test('인증 헤더가 다르면 안 합친다 (계정 전환 중 섞임 방지)', async () => {
    let calls = 0;
    const apiFetch = loadApiFetch(() => { calls++; return Promise.resolve(mkRes('{}')); });
    await Promise.all([
      apiFetch('/customers', { headers: { Authorization: 'Bearer AAAAAAAAAAAAAAAAAAAAAAAA' } }),
      apiFetch('/customers', { headers: { Authorization: 'Bearer BBBBBBBBBBBBBBBBBBBBBBBB' } }),
    ]);
    expect(calls).toBe(2);
  });

  test('POST 는 절대 합치지 않는다 — 각각이 의미 있는 행위다', async () => {
    let calls = 0;
    const apiFetch = loadApiFetch(() => { calls++; return Promise.resolve(mkRes('{}')); });
    await Promise.all([
      apiFetch('/bookings', { method: 'POST', body: '{}' }),
      apiFetch('/bookings', { method: 'POST', body: '{}' }),
    ]);
    expect(calls).toBe(2);
  });

  test('실패해도 in-flight 를 놓아준다 (다음 호출이 막히면 안 된다)', async () => {
    let calls = 0;
    const apiFetch = loadApiFetch(() => { calls++; return Promise.reject(new Error('net')); });
    await expect(apiFetch('/revenue')).rejects.toThrow();
    await expect(apiFetch('/revenue')).rejects.toThrow();
    expect(calls).toBe(2);
  });
});

describe('변경 kind → 도메인 정책', () => {
  const affects = loadAffects();

  test('★ 예약 변경은 DM 을 건드리지 않는다 (이번 버그)', () => {
    expect(affects({ detail: { kind: 'create_booking' } }, 'dm')).toBe(false);
    expect(affects({ detail: { kind: 'update_booking' } }, 'dm')).toBe(false);
    expect(affects({ detail: { kind: 'delete_booking' } }, 'dm')).toBe(false);
  });

  test('예약 변경은 booking·home 에는 영향을 준다', () => {
    expect(affects({ detail: { kind: 'create_booking' } }, 'booking')).toBe(true);
    expect(affects({ detail: { kind: 'create_booking' } }, 'home')).toBe(true);
  });

  test('고객 삭제는 예약에도 영향을 준다', () => {
    expect(affects({ detail: { kind: 'delete_customer' } }, 'booking')).toBe(true);
  });

  test('모르는 kind·kind 없음은 통과 (놓치는 것보다 낫다)', () => {
    expect(affects({ detail: { kind: 'brand_new_kind' } }, 'dm')).toBe(true);
    expect(affects({ detail: {} }, 'dm')).toBe(true);
    expect(affects(null, 'dm')).toBe(true);
  });
});

describe('DM 리스너가 실제로 정책을 쓴다', () => {
  test('app-home-customer-msgs 가 itdChangeAffects 로 거른다', () => {
    const src = stripComments(read('app-home-customer-msgs.js'));
    const li = src.slice(src.indexOf("addEventListener('itdasy:data-changed'"));
    expect(li.slice(0, 300)).toMatch(/itdChangeAffects\([^)]*'dm'\)/);
    // 필터가 refresh() 보다 앞에 있어야 의미가 있다
    expect(li.indexOf('itdChangeAffects')).toBeLessThan(li.indexOf('refresh()'));
  });
});

describe('홈 배지 — 예약류 변경에 채널 재조회 안 함', () => {
  /* 실측(2026-09-03, 배포본): 예약 저장 1회에
       /dm-confirm-queue ×3 · /instagram/comment-queue ×2
     원인은 두 겹이었다.
       ① _doRender 가 brief·slots·DM배지·댓글배지 4개를 통째로 부른다
       ② brief 백엔드 지연 대응 재시도(1500·4000ms)가 그 4개를 **또** 부른다
     지연을 따라잡아야 하는 건 brief 뿐이다. DM·댓글 수는 예약과 무관하다. */
  const SRC = read('app-home-v41.js');
  const code = stripComments(SRC);

  test('_doRender 가 채널 스킵 옵션을 받는다', () => {
    expect(code).toMatch(/opts && opts\.channels === false/);
    expect(code).toMatch(/_skipChannels \? Promise\.resolve\(_lastDmCount\)/);
    expect(code).toMatch(/_skipChannels \? Promise\.resolve\(_lastCmtCount\)/);
  });

  test('예약류 변경이면 즉시 렌더에서 채널을 스킵한다', () => {
    expect(code).toMatch(/_doRender\(root, \{ channels: !isBookingish \}\)/);
  });

  test('★ brief 지연 재시도는 채널을 절대 다시 부르지 않는다', () => {
    // 이 재시도가 예전 중복의 절반을 만들었다
    const retry = code.slice(code.indexOf('_retryTimers.push'));
    expect(retry.slice(0, 400)).toMatch(/_doRender\(r, \{ channels: false \}\)/);
  });

  test('스킵해도 직전 값을 유지한다 (배지가 0으로 깜빡이면 안 된다)', () => {
    expect(code).toMatch(/_lastDmCount = dmQueueCount;\s*_lastCmtCount = commentQueueCount;/);
  });
});
