/**
 * @jest-environment jsdom
 */
/* 로그인이 IndexedDB 정리 때문에 멈추면 안 된다.
 *
 * 실측 (2026-09-03, 배포본 0f56fe9, 실제 390×844 인증 세션):
 *   로그인 버튼 → "로그인 중..." 에서 **영구 정지**. 잠금화면도 안 걷힘.
 *   그런데 /auth/me = 200, 토큰은 이미 저장돼 있었다 = **로그인 자체는 성공**.
 *   추적: _doLogin → applyNewSession(forcePurge) → _purgeUserScopedDB → WorkspaceSync.clearLocal
 *   측정: clearLocal() 이 3초 타임아웃에 걸림(clearGalleryDB 는 정상 resolve)
 *   원시 확인: indexedDB.deleteDatabase('itdasy-sync') 가 4초간
 *             success·error·blocked **아무 이벤트도 안 냄**, readyState=pending, DB 잔존.
 *
 * 즉 onblocked 핸들러를 달아둔 것만으로는 부족하다 — 그 이벤트조차 오지 않는다.
 * 정리는 best-effort 여야 하고, 로그인은 어떤 경우에도 통과해야 한다.
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'workspace', 'workspace-sync.js'), 'utf8');

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** clearLocal 만 떼어내 실제로 실행 가능한 형태로 만든다 */
function loadClearLocal({ fireEvent }) {
  const body = stripComments(SRC);
  const start = body.indexOf('var CLEAR_LOCAL_TIMEOUT_MS');
  const endMark = body.indexOf('function clearLocal');
  expect(start).toBeGreaterThan(-1);
  expect(endMark).toBeGreaterThan(start);
  // clearLocal 함수 끝(닫는 중괄호 + 개행) 까지
  const fnStart = endMark;
  let depth = 0, i = body.indexOf('{', fnStart), end = -1;
  for (; i < body.length; i++) {
    if (body[i] === '{') depth++;
    else if (body[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  const src = body.slice(start, endMark) + body.slice(fnStart, end);

  const store = {};
  const sandbox = {
    _sdb: null,
    _uploadCache: { clear() {} },
    _hydrateCache: { clear() {} },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    indexedDB: {
      deleteDatabase() {
        const req = {};
        if (fireEvent) setTimeout(() => { if (req[fireEvent]) req[fireEvent](); }, 10);
        return req;   // fireEvent 없으면 **영원히 아무 이벤트도 안 옴** = 실측한 그 상황
      },
    },
  };
  // eslint-disable-next-line no-new-func
  const factory = new Function('_sdb', '_uploadCache', '_hydrateCache', 'localStorage', 'indexedDB',
    src + '\nreturn { clearLocal: clearLocal, PURGE_PENDING_KEY: PURGE_PENDING_KEY, TIMEOUT: CLEAR_LOCAL_TIMEOUT_MS };');
  return {
    ...factory(sandbox._sdb, sandbox._uploadCache, sandbox._hydrateCache, sandbox.localStorage, sandbox.indexedDB),
    store,
  };
}

describe('clearLocal 은 로그인을 막지 않는다', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  test('★ deleteDatabase 가 아무 이벤트도 안 내도 반드시 settle 된다 (이번 버그)', async () => {
    const { clearLocal, TIMEOUT } = loadClearLocal({ fireEvent: null });
    let settled = false;
    const p = clearLocal().then((v) => { settled = true; return v; });
    jest.advanceTimersByTime(TIMEOUT + 50);
    await expect(p).resolves.toBe(false);
    expect(settled).toBe(true);
  });

  test('정상 삭제되면 true', async () => {
    const { clearLocal } = loadClearLocal({ fireEvent: 'onsuccess' });
    const p = clearLocal();
    jest.advanceTimersByTime(50);
    await expect(p).resolves.toBe(true);
  });

  test('blocked 이벤트가 오면 그때 끝낸다 (타임아웃까지 안 기다림)', async () => {
    const { clearLocal } = loadClearLocal({ fireEvent: 'onblocked' });
    const p = clearLocal();
    jest.advanceTimersByTime(50);
    await expect(p).resolves.toBe(true);
  });

  test('타임아웃은 유한하다 — 무한대나 미설정이면 안 된다', () => {
    const { TIMEOUT } = loadClearLocal({ fireEvent: null });
    expect(typeof TIMEOUT).toBe('number');
    expect(TIMEOUT).toBeGreaterThan(0);
    expect(TIMEOUT).toBeLessThanOrEqual(5000);   // 로그인 체감을 해치지 않는 범위
  });
});

describe('못 지운 사실을 남겨 다음에 재시도한다', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  test('타임아웃이면 purge_pending 마커를 남긴다', async () => {
    const { clearLocal, PURGE_PENDING_KEY, store, TIMEOUT } = loadClearLocal({ fireEvent: null });
    const p = clearLocal();
    jest.advanceTimersByTime(TIMEOUT + 50);
    await p;
    expect(store[PURGE_PENDING_KEY]).toBe('1');
  });

  test('성공하면 마커를 지운다', async () => {
    const { clearLocal, PURGE_PENDING_KEY, store } = loadClearLocal({ fireEvent: 'onsuccess' });
    store[PURGE_PENDING_KEY] = '1';
    const p = clearLocal();
    jest.advanceTimersByTime(50);
    await p;
    expect(store[PURGE_PENDING_KEY]).toBeUndefined();
  });

  test('init 이 미완료 마커를 보고 재시도한다', () => {
    const body = stripComments(SRC);
    const init = body.slice(body.indexOf('function init()'));
    expect(init).toMatch(/PURGE_PENDING_KEY/);
    expect(init).toMatch(/clearLocal\(\)/);
  });
});
