/**
 * @jest-environment jsdom
 *
 * §4-4 / §4-5 회귀 — `pull()` 의 두 가드를 **실제로 실행**해서 고정한다.
 *
 * 두 규칙은 코드에 있었지만 실행 테스트가 없었다. 이 파일이 그 구멍을 메운다.
 *
 * ① 로컬이 통째로 비었는데 커서만 남으면 델타 pull 로는 **영영** 안 돌아온다.
 *    슬롯은 `itdasy-gallery`, 커서는 `itdasy-sync` 로 **DB 가 달라서** 한쪽만 비는 일이 실제로 난다
 *    (2026-09-11 라이브: 서버 4건 / 화면 0건, 하드 새로고침으로도 복구 안 됨).
 *    → 로컬 0건이면 커서를 버리고 전량 받는다.
 *
 * ② 그런데 "캐시가 없다" 와 "원장이 지웠다" 는 다르다.
 *    로컬에서 지운 글(tombstone)은 전량 pull 이 와도 **되살아나면 안 된다**.
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'workspace', 'workspace-sync.js'), 'utf8');

/** 실제 `pull()` 을 떼어내 주입 가능한 형태로 만든다. */
function loadPull(env) {
  const i = SRC.indexOf('  function pull() {');
  expect(i).toBeGreaterThan(-1);
  let d = 0, started = false, end = -1;
  for (let k = i; k < SRC.length; k++) {
    const c = SRC[k];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) { end = k + 1; break; } }
  }
  const body = SRC.slice(i, end);
  const names = ['ready', '_pulling', '_readOr', 'getMeta', 'loadAllLocal', 'log', 'window',
    'allTombstones', 'has', '_origDeleteSlot', 'tsMs', 'delTombstone', 'loadOneLocal',
    '_origSaveSlot', 'remoteToLocal', 'setMeta', 'refreshHome', 'authHeader'];
  // eslint-disable-next-line no-new-func
  const factory = new Function(...names, body + '\n; return pull;');
  return factory(...names.map((n) => env[n]));
}

function makeEnv({ localSlots, tombstones = [], serverSlots, cursor }) {
  const calls = { urls: [], saved: [], deleted: [], cursorSaved: [] };
  const env = {
    ready: () => true,
    _pulling: false,
    _readOr: (p) => Promise.resolve(p),
    getMeta: () => Promise.resolve(cursor),
    loadAllLocal: () => Promise.resolve(localSlots),
    log: () => {},
    allTombstones: () => Promise.resolve(tombstones),
    has: () => true,
    tsMs: (v) => (v ? Date.parse(v) || 0 : 0),
    delTombstone: () => Promise.resolve(true),
    loadOneLocal: (id) => Promise.resolve((localSlots || []).find((s) => String(s.id) === String(id)) || null),
    _origSaveSlot: (s) => { calls.saved.push(s.id); return Promise.resolve(); },
    _origDeleteSlot: (id) => { calls.deleted.push(id); return Promise.resolve(); },
    remoteToLocal: (rs) => ({ id: rs.slot_id }),
    setMeta: (k, v) => { calls.cursorSaved.push(v); return Promise.resolve(true); },
    refreshHome: () => {},
    authHeader: () => ({}),
    window: {
      apiFetch: (url) => {
        calls.urls.push(url);
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ slots: serverSlots, server_time: '2026-09-12T00:00:00Z' }) });
      },
    },
  };
  return { env, calls };
}

describe('§4-4 · 로컬이 비면 커서를 버리고 전량 받는다', () => {
  test('🔴 로컬 0건 + 커서 있음 → ?since= 없이 전량 요청 (서버 4 / 화면 0 사고)', async () => {
    const { env, calls } = makeEnv({
      localSlots: [], cursor: '2026-09-11T00:00:00Z',
      serverSlots: [{ slot_id: 'a' }, { slot_id: 'b' }],
    });
    await loadPull(env)();
    expect(calls.urls[0]).toBe('/workspace/slots');
    expect(calls.urls[0]).not.toMatch(/since=/);
  });

  test('전량 받은 슬롯이 실제로 로컬에 저장된다 (복구가 말뿐이 아니다)', async () => {
    const { env, calls } = makeEnv({
      localSlots: [], cursor: '2026-09-11T00:00:00Z',
      serverSlots: [{ slot_id: 'a' }, { slot_id: 'b' }],
    });
    await loadPull(env)();
    expect(calls.saved.sort()).toEqual(['a', 'b']);
  });

  test('로컬이 있으면 델타 pull 을 유지한다 (전량 요청 남발 방지)', async () => {
    const { env, calls } = makeEnv({
      localSlots: [{ id: 'a', syncState: 'synced' }], cursor: '2026-09-11T00:00:00Z',
      serverSlots: [],
    });
    await loadPull(env)();
    expect(calls.urls[0]).toMatch(/\?since=/);
  });

  test('커서가 애초에 없으면 그냥 전량 (기존 동작)', async () => {
    const { env, calls } = makeEnv({ localSlots: [], cursor: null, serverSlots: [] });
    await loadPull(env)();
    expect(calls.urls[0]).toBe('/workspace/slots');
  });
});

describe('§4-5 · 원장이 지운 글은 되살아나지 않는다', () => {
  test('🔴 tombstone 이 있으면 전량 pull 이 와도 저장하지 않는다', async () => {
    const { env, calls } = makeEnv({
      localSlots: [], cursor: '2026-09-11T00:00:00Z',
      tombstones: [{ slot_id: 'gone' }],
      serverSlots: [{ slot_id: 'gone' }, { slot_id: 'keep' }],
    });
    await loadPull(env)();
    expect(calls.saved).toEqual(['keep']);
    expect(calls.saved).not.toContain('gone');
  });

  test('"캐시 없음" 과 "지웠음" 이 갈린다 — 같은 전량 pull 에서 하나는 살고 하나는 안 산다', async () => {
    const { env, calls } = makeEnv({
      localSlots: [], cursor: 'c',
      tombstones: [{ slot_id: 'deleted-by-owner' }],
      serverSlots: [{ slot_id: 'deleted-by-owner' }, { slot_id: 'never-had-locally' }],
    });
    await loadPull(env)();
    expect(calls.saved).toEqual(['never-had-locally']);
  });

  test('서버가 삭제를 확인해 주면 로컬도 지운다', async () => {
    const { env, calls } = makeEnv({
      localSlots: [{ id: 'x', updatedAt: 1 }], cursor: 'c',
      serverSlots: [{ slot_id: 'x', deleted: true, deleted_at: '2026-09-12T00:00:00Z' }],
    });
    await loadPull(env)();
    expect(calls.deleted).toEqual(['x']);
  });

  test('로컬이 서버보다 최신이면 덮어쓰지 않는다 (편집 유실 방지)', async () => {
    const { env, calls } = makeEnv({
      localSlots: [{ id: 'x', syncState: 'dirty', updatedAt: Date.parse('2026-09-12T10:00:00Z') }],
      cursor: 'c',
      serverSlots: [{ slot_id: 'x', client_updated_at: '2026-09-12T09:00:00Z' }],
    });
    await loadPull(env)();
    expect(calls.saved).toEqual([]);
  });
});
