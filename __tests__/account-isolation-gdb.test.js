'use strict';

/* [2026-09-03 P0 계정 격리] 갤러리 IDB(초안 슬롯 = 고객명·시술·사진) 교차 노출 회귀.
 *
 * 실측으로 확인한 사고 체인(브라우저, applyNewSession 실호출):
 *   ① _purgeUserScopedStorage 의 idle 콜백이 applyNewSession 이 방금 쓴 last_user_id 를
 *      늦게 지웠다('USER_B' → 2.5초 뒤 null).
 *   ② 다음 로그인에서 prevUserId=null → 전환 조건 거짓 → purge 미실행.
 *   ③ 결과: USER_C 화면에 USER_B 의 초안(고객명 '박서연'·사진)이 그대로 떴다.
 *   ④ 별개로 deleteDatabase 는 다른 탭이 잡고 있으면 이벤트 없이 pending — 3초 타임아웃이
 *      실패를 삼키면 이전 계정 DB 가 통째로 남는다.
 *
 * 수정 2겹:
 *   - last_user_id 를 purge 목록에서 제외(전환 감지 기준 + T8 tenant 경계 — 남는 게 의도).
 *   - openGalleryDB 읽기 관문에서 소유자 도장(itdasy_gdb_owner) 검증 —
 *     삭제 실패 시 재시도, 그래도 실패면 **열지 않는다**(기능 정지 > 정보 유출).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const coreSrc = fs.readFileSync(path.join(ROOT, 'app-core.js'), 'utf8');
const gdbSrc = fs.readFileSync(path.join(ROOT, 'app-gallery-db.js'), 'utf8');

describe('① last_user_id 는 purge 가 지우면 안 된다', () => {
  test('_USER_KEY_EXACT 에 last_user_id 가 없다', () => {
    const m = coreSrc.match(/const _USER_KEY_EXACT = \[[^\]]*\]/);
    expect(m).toBeTruthy();
    expect(m[0]).not.toContain("'last_user_id'");
  });
  test('applyNewSession 은 여전히 last_user_id 로 전환을 감지한다', () => {
    expect(coreSrc).toContain("localStorage.getItem('last_user_id')");
    expect(coreSrc).toContain("localStorage.setItem('last_user_id', newUserId)");
  });
});

describe('② 소유자 도장은 purge 를 살아남고, 삭제 성공만이 도장을 지운다', () => {
  test('itdasy_gdb_owner 가 KEEP 목록에 있다 (itdasy_ 접두어라 안 올리면 지워진다)', () => {
    const keep = coreSrc.slice(coreSrc.indexOf('const _USER_KEY_KEEP'), coreSrc.indexOf(']);', coreSrc.indexOf('const _USER_KEY_KEEP')));
    expect(keep).toContain("'itdasy_gdb_owner'");
  });
  test('clearGalleryDB 성공 콜백에서만 도장을 비운다', () => {
    const clear = gdbSrc.slice(gdbSrc.indexOf('async function clearGalleryDB'));
    expect(clear).toMatch(/onsuccess = \(\) => \{[^}]*_gdbSetOwner\(null\)/);
    // 실패·타임아웃 경로는 도장을 건드리지 않는다 — 남은 DB 의 소유자를 잊으면 관문이 못 막는다
    expect(clear.slice(0, clear.indexOf('window.clearGalleryDB'))).not.toMatch(/onerror[^\n]*_gdbSetOwner/);
  });
});

describe('③ openGalleryDB 읽기 관문 — 실행 검증', () => {
  /** app-gallery-db.js 의 격리 부분만 떼어 mock IDB 위에서 실행한다. */
  function loadGdb(opts) {
    opts = opts || {};
    const store = Object.assign({}, opts.store);
    const localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    };
    const dbHandle = { name: 'mock', close() {}, objectStoreNames: { contains: () => true }, transaction() { throw new Error('not needed'); } };
    let deleteBehavior = opts.deleteBehavior || 'success';
    const openBehavior = opts.openBehavior || 'success';
    const indexedDB = {
      open() {
        const req = {};
        if (openBehavior === 'success') setTimeout(() => { if (req.onsuccess) req.onsuccess({ target: { result: dbHandle } }); }, 0);
        else if (openBehavior === 'blocked') setTimeout(() => { if (req.onblocked) req.onblocked(); }, 0);
        else if (openBehavior === 'pending') { /* 아무 이벤트도 안 낸다 — Android 실측 재현 */ }
        return req;
      },
      deleteDatabase() {
        const req = {};
        if (deleteBehavior === 'success') setTimeout(() => { if (req.onsuccess) req.onsuccess(); }, 0);
        else if (deleteBehavior === 'pending') { /* 이벤트 없음 — 실측 재현 */ }
        return req;
      },
      _setDelete(b) { deleteBehavior = b; },
    };
    const window = { showToast: opts.showToast || (() => {}) };
    const sandbox = { localStorage, indexedDB, window, setTimeout, clearTimeout, console };
    // 필요한 조각만 추출: 상수/도장 헬퍼 + openGalleryDB + clearGalleryDB (+ CLEAR timeout 축소)
    let src = gdbSrc.slice(0, gdbSrc.indexOf('// ── [T8-B]'));
    src = src.replace(/const CLEAR_GDB_TIMEOUT_MS = \d+/, 'const CLEAR_GDB_TIMEOUT_MS = 50');   // 선언까지 치환하면 `const 50` 이 된다
    src = src.replace(/const OPEN_GDB_TIMEOUT_MS = \d+/, 'const OPEN_GDB_TIMEOUT_MS = 60');
    // eslint-disable-next-line no-new-func
    const fn = new Function('localStorage', 'indexedDB', 'window', 'setTimeout', 'clearTimeout', 'console',
      src + '; return { openGalleryDB, clearGalleryDB, _gdbOwner, _gdbSetOwner };');
    return { api: fn(localStorage, indexedDB, window, setTimeout, clearTimeout, console), store, indexedDB };
  }

  test('도장 없음(첫 사용) → 현재 사용자로 찍고 연다 (하위호환)', async () => {
    const { api, store } = loadGdb({ store: { last_user_id: 'U1' } });
    await api.openGalleryDB();
    expect(store.itdasy_gdb_owner).toBe('U1');
  });

  test('소유자 일치 → 그대로 연다', async () => {
    const { api, store } = loadGdb({ store: { last_user_id: 'U1', itdasy_gdb_owner: 'U1' } });
    await expect(api.openGalleryDB()).resolves.toBeTruthy();
    expect(store.itdasy_gdb_owner).toBe('U1');
  });

  test('소유자 불일치 + 삭제 성공 → 지우고 새 소유자로 연다', async () => {
    const { api, store } = loadGdb({ store: { last_user_id: 'U2', itdasy_gdb_owner: 'U1' } });
    await expect(api.openGalleryDB()).resolves.toBeTruthy();
    expect(store.itdasy_gdb_owner).toBe('U2');
  });

  test('🔴 소유자 불일치 + 삭제 실패(pending) → 열지 않는다 (유출 차단)', async () => {
    const toasts = [];
    const { api, store } = loadGdb({ store: { last_user_id: 'U2', itdasy_gdb_owner: 'U1' },
      deleteBehavior: 'pending', showToast: (m) => toasts.push(m) });
    await expect(api.openGalleryDB()).rejects.toThrow('gdb_owner_mismatch');
    expect(store.itdasy_gdb_owner).toBe('U1');          // 도장 유지 — 다음 시도도 다시 막는다
    expect(toasts.join(' ')).toContain('다른 탭');       // 사용자에게 복구 방법 안내
  });

  test('차단 후 삭제가 가능해지면 스스로 복구된다', async () => {
    const { api, indexedDB } = loadGdb({ store: { last_user_id: 'U2', itdasy_gdb_owner: 'U1' }, deleteBehavior: 'pending' });
    await expect(api.openGalleryDB()).rejects.toThrow('gdb_owner_mismatch');
    indexedDB._setDelete('success');
    await expect(api.openGalleryDB()).resolves.toBeTruthy();
  });

  test('로그인 안 된 상태(last_user_id 없음)는 기존 동작 그대로 (게이트 미개입)', async () => {
    const { api, store } = loadGdb({ store: { itdasy_gdb_owner: 'U1' } });
    await expect(api.openGalleryDB()).resolves.toBeTruthy();
    expect(store.itdasy_gdb_owner).toBe('U1');
  });
});

describe('④ open 이 응답 없이 pending 이면 무한 대기하지 않는다 (P1 · Android 실측)', () => {
  /* 실측(Android Chrome, 탭 2개): `indexedDB.open('itdasy-gallery', 7)` 이 5초 동안
     success·error·blocked 를 **하나도** 안 냈다. openGalleryDB 의 Promise 가 영영 pending 이라
     이를 await 하던 작업실이 **로딩 표시도 없이 빈 화면**으로 굳었다(initWorkshopTab 의 catch 도 안 탐).
     같은 파일의 clearGalleryDB 는 이미 이 함정 때문에 타임아웃이 있었는데 open 만 무방비였다. */
  function load(opts) {
    const store = Object.assign({}, opts.store);
    const localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    };
    const dbHandle = { close() {}, objectStoreNames: { contains: () => true } };
    const openBehavior = opts.openBehavior;
    const indexedDB = {
      open() {
        const req = {};
        if (openBehavior === 'success') setTimeout(() => { if (req.onsuccess) req.onsuccess({ target: { result: dbHandle } }); }, 0);
        else if (openBehavior === 'blocked') setTimeout(() => { if (req.onblocked) req.onblocked(); }, 0);
        return req;   // 'pending' 이면 아무것도 안 한다
      },
      deleteDatabase() { const r = {}; setTimeout(() => { if (r.onsuccess) r.onsuccess(); }, 0); return r; },
    };
    let src = gdbSrc.slice(0, gdbSrc.indexOf('// ── [T8-B]'));
    src = src.replace(/const CLEAR_GDB_TIMEOUT_MS = \d+/, 'const CLEAR_GDB_TIMEOUT_MS = 50');
    src = src.replace(/const OPEN_GDB_TIMEOUT_MS = \d+/, 'const OPEN_GDB_TIMEOUT_MS = 60');
    // eslint-disable-next-line no-new-func
    const fn = new Function('localStorage', 'indexedDB', 'window', 'setTimeout', 'clearTimeout', 'console',
      src + '; return { openGalleryDB };');
    return fn(localStorage, indexedDB, { showToast() {} }, setTimeout, clearTimeout, console);
  }

  test('이벤트가 하나도 안 오면 타임아웃으로 **실패**한다 (영원히 매달리지 않는다)', async () => {
    const api = load({ store: { last_user_id: 'U1', itdasy_gdb_owner: 'U1' }, openBehavior: 'pending' });
    await expect(api.openGalleryDB()).rejects.toThrow('gdb_open_timeout');
  });

  test('blocked(다른 탭이 잡고 있음)도 즉시 실패로 끝난다', async () => {
    const api = load({ store: { last_user_id: 'U1', itdasy_gdb_owner: 'U1' }, openBehavior: 'blocked' });
    await expect(api.openGalleryDB()).rejects.toThrow('gdb_open_blocked');
  });

  test('정상 경로는 그대로 열린다 (타임아웃이 정상 동작을 방해하지 않는다)', async () => {
    const api = load({ store: { last_user_id: 'U1', itdasy_gdb_owner: 'U1' }, openBehavior: 'success' });
    await expect(api.openGalleryDB()).resolves.toBeTruthy();
  });

  test('호출자(작업실)는 이 실패를 빈 목록 + 안내로 바꾼다 — 빈 화면으로 두지 않는다', () => {
    const ws = fs.readFileSync(path.join(ROOT, 'app-gallery-workshop.js'), 'utf8');
    const init = ws.slice(ws.indexOf('async function initWorkshopTab'));
    expect(init).toContain('slots = [];');
    expect(init).toContain('불러오지 못했어요');
    // 갱신 경로도 침묵하지 않는다
    const home = fs.readFileSync(path.join(ROOT, 'js/workspace/workspace-v2-home.js'), 'utf8');
    expect(home).not.toContain('.catch(function () {});\n\t  }\n\n\t  function _pickHeroFiles');
    expect(home).toContain('새로 불러오지 못했어요');
  });
});
