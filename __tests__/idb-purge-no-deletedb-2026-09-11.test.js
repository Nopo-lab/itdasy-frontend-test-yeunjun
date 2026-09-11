/**
 * @jest-environment jsdom
 *
 * BUG-F2 회귀 — 계정 격리 purge 가 `deleteDatabase` 를 쓰면 안 된다.
 *
 * 라이브 실측(2026-09-11, 탭 2개로 로그아웃→로그인):
 *   DELETE_REQ itdasy-gallery → del.BLOCKED(4ms) → 이후 open 20건 전부 pending(이벤트 0건).
 *   탭 B 를 닫아도 안 풀렸고, 로그아웃한 탭까지 리로드하자 그제서야 delete 가 실행되며 풀렸다.
 * deleteDatabase 는 **취소할 수 없어서** 한 번 blocked 되면 그 DB 의 이후 모든 open 을
 * origin 전역으로 잠근다 → gdb_open_timeout → 작업실 빈 화면.
 * 호출부의 타임아웃은 요청을 취소하지 못하므로 방어가 아니다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GDB_SRC = fs.readFileSync(path.join(ROOT, 'app-gallery-db.js'), 'utf8');
const SYNC_SRC = fs.readFileSync(path.join(ROOT, 'js/workspace/workspace-sync.js'), 'utf8');

function sliceBetween(src, startMark, endMark) {
  const i = src.indexOf(startMark);
  const j = src.indexOf(endMark, i + 1);
  if (i < 0 || j < 0) return '';
  return src.slice(i, j);
}
function extractFn(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return '';
  let d = 0, started = false;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(i, k + 1); }
  }
  return '';
}

// ── fake IndexedDB ────────────────────────────────────────────────────────
function makeFakeIDB(opts) {
  opts = opts || {};
  const calls = { deleteDatabase: 0, open: 0 };
  const cleared = [];
  const names = opts.names || ['slots', 'gallery', 'assets'];
  const db = {
    objectStoreNames: names,
    closed: false,
    close() { this.closed = true; },
    transaction() {
      const tx = {};
      setTimeout(() => {
        if (opts.txFails) { if (tx.onerror) tx.onerror(); }
        else if (tx.oncomplete) tx.oncomplete();
      }, 0);
      tx.objectStore = (n) => ({ clear: () => cleared.push(n) });
      return tx;
    },
  };
  const idb = {
    deleteDatabase() {
      calls.deleteDatabase++;
      const req = {};
      // 실측 그대로: 다른 탭이 붙잡고 있으면 blocked 가 오거나 아무 이벤트도 안 온다.
      if (opts.deleteBlocked) setTimeout(() => { if (req.onblocked) req.onblocked(); }, 0);
      return req;                       // 그 외에는 영영 pending
    },
    open() {
      calls.open++;
      const req = {};
      setTimeout(() => { if (req.onsuccess) req.onsuccess({ target: { result: db } }); }, 0);
      return req;
    },
  };
  return { idb, calls, cleared, db };
}

describe('BUG-F2 · 갤러리 purge 는 deleteDatabase 로 하지 않는다', () => {
  function loadClearGalleryDB(fake, gdb) {
    const body = sliceBetween(GDB_SRC, 'const CLEAR_GDB_TIMEOUT_MS', 'window.clearGalleryDB = clearGalleryDB;');
    expect(body).not.toBe('');
    const owners = [];
    // eslint-disable-next-line no-new-func
    const factory = new Function('indexedDB', '_gdb', '_GDB_NAME', '_gdbSetOwner',
      body + '\n; return clearGalleryDB;');
    const fn = factory(fake.idb, gdb, 'itdasy-gallery', (u) => owners.push(u));
    return { fn, owners };
  }

  test('clearGalleryDB 소스에 deleteDatabase 가 없다', () => {
    const body = sliceBetween(GDB_SRC, 'const CLEAR_GDB_TIMEOUT_MS', 'window.clearGalleryDB = clearGalleryDB;');
    expect(body).not.toBe('');
    expect(body).not.toMatch(/indexedDB\s*\.\s*deleteDatabase\s*\(/);
  });

  test('열린 연결이 있어도 성공하고, deleteDatabase 를 한 번도 부르지 않는다', async () => {
    const fake = makeFakeIDB({ deleteBlocked: true });
    const { fn, owners } = loadClearGalleryDB(fake, fake.db);
    await expect(fn()).resolves.toBe(true);
    expect(fake.calls.deleteDatabase).toBe(0);
  });

  test('모든 object store 를 비운다 (사용자 데이터 0)', async () => {
    const fake = makeFakeIDB({ deleteBlocked: true });
    const { fn } = loadClearGalleryDB(fake, fake.db);
    await fn();
    expect(fake.cleared.sort()).toEqual(['assets', 'gallery', 'slots']);
  });

  test('비운 뒤 소유자 도장을 지운다', async () => {
    const fake = makeFakeIDB({ deleteBlocked: true });
    const { fn, owners } = loadClearGalleryDB(fake, fake.db);
    await fn();
    expect(owners).toContain(null);
  });

  test('트랜잭션이 실패하면 false — 성공으로 위장하지 않는다', async () => {
    const fake = makeFakeIDB({ txFails: true });
    const { fn } = loadClearGalleryDB(fake, fake.db);
    await expect(fn()).resolves.toBe(false);
  });

  test('_gdb 가 없으면 스스로 연 연결을 반드시 닫는다 (다음 upgrade 를 막지 않게)', async () => {
    const fake = makeFakeIDB({});
    const { fn } = loadClearGalleryDB(fake, null);
    await expect(fn()).resolves.toBe(true);
    expect(fake.db.closed).toBe(true);
  });

  test('_gdb 를 빌려 쓴 경우에는 닫지 않는다 (다음 호출이 재사용)', async () => {
    const fake = makeFakeIDB({});
    const { fn } = loadClearGalleryDB(fake, fake.db);
    await fn();
    expect(fake.db.closed).toBe(false);
  });
});

describe('BUG-F2 · itdasy-sync clearLocal 도 같은 뿌리', () => {
  function loadClearLocal(fake, opts) {
    opts = opts || {};
    const body = extractFn(SYNC_SRC, 'function clearLocal()');
    expect(body).not.toBe('');
    const store = {};
    const ls = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    };
    const openSyncDB = opts.openFails
      ? () => Promise.reject(new Error('sync_db_open_timeout'))
      : () => Promise.resolve(fake.db);
    // eslint-disable-next-line no-new-func
    const factory = new Function(
      'indexedDB', 'localStorage', 'openSyncDB', '_sdb', '_uploadCache', '_hydrateCache',
      'CLEAR_LOCAL_TIMEOUT_MS', 'PURGE_PENDING_KEY',
      body + '\n; return clearLocal;');
    const fn = factory(fake.idb, ls, openSyncDB, fake.db,
      new Map(), new Map(), 2000, 'itdasy_sync_purge_pending');
    return { fn, store };
  }

  test('clearLocal 소스에 deleteDatabase 가 없다', () => {
    const body = extractFn(SYNC_SRC, 'function clearLocal()');
    expect(body).not.toBe('');
    expect(body).not.toMatch(/indexedDB\s*\.\s*deleteDatabase\s*\(/);
  });

  test('store 를 비워 성공하고 재시도 플래그를 내린다', async () => {
    const fake = makeFakeIDB({ names: ['meta', 'tombstones'], deleteBlocked: true });
    const { fn, store } = loadClearLocal(fake);
    store['itdasy_sync_purge_pending'] = '1';
    await expect(fn()).resolves.toBe(true);
    expect(fake.calls.deleteDatabase).toBe(0);
    expect(fake.cleared.sort()).toEqual(['meta', 'tombstones']);
    expect(store['itdasy_sync_purge_pending']).toBeUndefined();
  });

  test('못 지웠으면 false + 재시도 플래그를 남긴다 (실패를 성공으로 보고 금지)', async () => {
    const fake = makeFakeIDB({ names: ['meta', 'tombstones'], txFails: true });
    const { fn, store } = loadClearLocal(fake);
    await expect(fn()).resolves.toBe(false);
    expect(store['itdasy_sync_purge_pending']).toBe('1');
  });

  test('DB 를 아예 못 열면 false + 재시도 플래그', async () => {
    const fake = makeFakeIDB({ names: ['meta', 'tombstones'] });
    const { fn, store } = loadClearLocal(fake, { openFails: true });
    await expect(fn()).resolves.toBe(false);
    expect(store['itdasy_sync_purge_pending']).toBe('1');
  });
});
