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

/** clearLocal 만 떼어내 실제로 실행 가능한 형태로 만든다
 *
 *  [2026-09-11 BUG-F2 계약 재정의] 정리 수단이 `deleteDatabase` → **store clear** 로 바뀌었다.
 *  이 파일이 2026-09-03 에 고정한 계약("아무 이벤트도 안 와도 settle 된다")은 증상 대응이었고,
 *  원인은 **취소할 수 없는 delete 요청이 큐에 눌러앉는 것**이었다 — 호출부가 타임아웃으로 포기해도
 *  요청은 살아남아 그 DB 의 이후 모든 open 을 origin 전역으로 잠근다(2026-09-11 탭 2개 실측).
 *  지켜야 할 계약은 그대로다: **로그인은 어떤 경우에도 통과한다.** 수단만 바꾼다.
 */
function loadClearLocal({ tx = 'complete', open = 'ok' } = {}) {
  const body = stripComments(SRC);
  const start = body.indexOf('var CLEAR_LOCAL_TIMEOUT_MS');
  const endMark = body.indexOf('function clearLocal');
  expect(start).toBeGreaterThan(-1);
  expect(endMark).toBeGreaterThan(start);
  const fnStart = endMark;
  let depth = 0, i = body.indexOf('{', fnStart), end = -1;
  for (; i < body.length; i++) {
    if (body[i] === '{') depth++;
    else if (body[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  const src = body.slice(start, endMark) + body.slice(fnStart, end);

  const store = {};
  const cleared = [];
  const calls = { deleteDatabase: 0 };
  const db = {
    objectStoreNames: ['meta', 'tombstones'],
    close() {},
    transaction() {
      const t = {};
      setTimeout(() => {
        if (tx === 'complete') { if (t.oncomplete) t.oncomplete(); }
        else if (tx === 'error') { if (t.onerror) t.onerror(); }
        // 'pending' → 아무 이벤트도 안 낸다
      }, 10);
      t.objectStore = (n) => ({ clear: () => cleared.push(n) });
      return t;
    },
  };
  const openSyncDB = () => (open === 'ok'
    ? Promise.resolve(db)
    : Promise.reject(new Error('sync_db_open_timeout')));
  const sandbox = {
    _sdb: db,
    _uploadCache: { clear() {} },
    _hydrateCache: { clear() {} },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    // deleteDatabase 를 부르면 그 사실이 잡히도록 남겨 둔다 — 부르면 안 된다.
    indexedDB: { deleteDatabase() { calls.deleteDatabase++; return {}; } },
  };
  // eslint-disable-next-line no-new-func
  const factory = new Function('_sdb', '_uploadCache', '_hydrateCache', 'localStorage', 'indexedDB', 'openSyncDB',
    src + '\nreturn { clearLocal: clearLocal, PURGE_PENDING_KEY: PURGE_PENDING_KEY, TIMEOUT: CLEAR_LOCAL_TIMEOUT_MS };');
  return {
    ...factory(sandbox._sdb, sandbox._uploadCache, sandbox._hydrateCache, sandbox.localStorage, sandbox.indexedDB, openSyncDB),
    store, cleared, calls,
  };
}

/** openSyncDB().then 체인이 진행되도록 마이크로태스크를 흘린다 */
const flush = async () => { for (let k = 0; k < 5; k++) await Promise.resolve(); };

describe('clearLocal 은 로그인을 막지 않는다', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  test('★ 정리가 아무 이벤트도 안 내도 반드시 settle 된다 (로그인 정지 회귀)', async () => {
    const { clearLocal, TIMEOUT } = loadClearLocal({ tx: 'pending' });
    let settled = false;
    const p = clearLocal().then((v) => { settled = true; return v; });
    await flush();
    jest.advanceTimersByTime(TIMEOUT + 50);
    await expect(p).resolves.toBe(false);
    expect(settled).toBe(true);
  });

  test('정상적으로 비워지면 true + 모든 store 를 비운다', async () => {
    const { clearLocal, cleared } = loadClearLocal({ tx: 'complete' });
    const p = clearLocal();
    await flush();
    jest.advanceTimersByTime(50);
    await expect(p).resolves.toBe(true);
    expect(cleared.sort()).toEqual(['meta', 'tombstones']);
  });

  test('🔴 deleteDatabase 를 한 번도 부르지 않는다 (취소 불가 요청이 큐를 잠근다)', async () => {
    const { clearLocal, calls } = loadClearLocal({ tx: 'complete' });
    const p = clearLocal();
    await flush();
    jest.advanceTimersByTime(50);
    await p;
    expect(calls.deleteDatabase).toBe(0);
  });

  test('DB 를 못 열면 타임아웃까지 안 기다리고 false 로 끝낸다', async () => {
    const { clearLocal } = loadClearLocal({ open: 'fail' });
    const p = clearLocal();
    await flush();
    jest.advanceTimersByTime(10);
    await expect(p).resolves.toBe(false);
  });

  test('타임아웃은 유한하다 — 무한대나 미설정이면 안 된다', () => {
    const { TIMEOUT } = loadClearLocal({ tx: 'pending' });
    expect(typeof TIMEOUT).toBe('number');
    expect(TIMEOUT).toBeGreaterThan(0);
    expect(TIMEOUT).toBeLessThanOrEqual(5000);   // 로그인 체감을 해치지 않는 범위
  });
});

describe('못 지운 사실을 남겨 다음에 재시도한다', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  test('타임아웃이면 purge_pending 마커를 남긴다', async () => {
    const { clearLocal, PURGE_PENDING_KEY, store, TIMEOUT } = loadClearLocal({ tx: 'pending' });
    const p = clearLocal();
    await flush();
    jest.advanceTimersByTime(TIMEOUT + 50);
    await p;
    expect(store[PURGE_PENDING_KEY]).toBe('1');
  });

  /* 예전 코드는 onerror·onblocked 에도 finish(true) 였다 — **못 지웠는데 마커를 지웠다.**
     그러면 다음 부팅의 재시도까지 사라져서, 이전 계정 데이터가 영구히 남는다. */
  test('🔴 정리가 실패하면 false + 마커 유지 (실패를 성공으로 보고 금지)', async () => {
    const { clearLocal, PURGE_PENDING_KEY, store } = loadClearLocal({ tx: 'error' });
    const p = clearLocal();
    await flush();
    jest.advanceTimersByTime(50);
    await expect(p).resolves.toBe(false);
    expect(store[PURGE_PENDING_KEY]).toBe('1');
  });

  test('성공하면 마커를 지운다', async () => {
    const { clearLocal, PURGE_PENDING_KEY, store } = loadClearLocal({ tx: 'complete' });
    store[PURGE_PENDING_KEY] = '1';
    const p = clearLocal();
    await flush();
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
