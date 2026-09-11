/* 🔴 [2026-09-11 · ZERO-HELP 게이트 실측] 원장의 작업을 통째로 날리던 두 경로.
 *
 * ① 강제 로그아웃 — 라이브(user 4)에서 캡션 생성 중 발생.
 *    401 → `_tryRefresh()` **성공**(새 토큰 발급) → 그 토큰으로 재시도 →
 *    재시도가 타임아웃 → 같은 try 의 catch 가 `_handle401()` 을 불러
 *    "⚠️ 로그인 세션이 만료되었습니다" + 강제 로그아웃 + 작성 중이던 글 전부 소실.
 *    실측: 그 순간 localStorage 의 토큰은 /auth/me 에 **200 (id=4)** 였다.
 *    불씨는 재시도 타임아웃을 12초로 **고정**한 것 — 원 호출이 LLM(120초)·업로드(90초)면
 *    12초 안에 끝날 수가 없어 **항상** 이 경로로 떨어진다.
 *
 * ② 작업실 0개 — ①의 뒤끝. 로컬 슬롯 저장소가 비워졌는데 `lastPulledAt` 커서는 남아
 *    pull 이 `?since=` 델타만 받아 서버의 기존 4건을 **영영** 다시 안 가져왔다.
 *    (서버 4건 deleted:false, 하드 새로고침으로도 복구 안 됨 → 원장 눈엔 작업물 증발.)
 *    슬롯은 `itdasy-gallery`, 커서는 `itdasy-sync` 로 **DB 가 달라서** 한쪽만 비워진다.
 */
const fs = require('fs');
const path = require('path');

const CORE = fs.readFileSync(path.join(__dirname, '../app-core.js'), 'utf8');
const SYNC = fs.readFileSync(path.join(__dirname, '../js/workspace/workspace-sync.js'), 'utf8');

/** 주석을 지운다 — 주석 문구만 보고 초록이 뜨는 가짜 통과 방지. */
function strip(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** app-core 의 401 처리 구간만 잘라낸다. */
function refreshBlock() {
  const src = strip(CORE);
  const i = src.indexOf('await _tryRefresh()');
  expect(i).toBeGreaterThan(0);
  const start = src.lastIndexOf('if (!getToken())', i);
  const end = src.indexOf('Retry-After', i);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const block = src.slice(start, end);
  // 구간이 엉뚱하게 벌어지면(앵커 오작동) 다른 코드를 삼켜 가드가 무력해진다.
  expect(block.length).toBeLessThan(1600);
  return block;
}

describe('① 갱신 성공 뒤 재시도 실패 = 강제 로그아웃 금지', () => {
  test('_tryRefresh 는 자기 try 안에 있고, 그 catch 만 _handle401 을 부른다', () => {
    const b = refreshBlock();
    // `try { newTok = await _tryRefresh(); } catch { _handle401(); return res; }` 모양
    const m = b.match(/try\s*\{\s*newTok\s*=\s*await\s+_tryRefresh\(\);\s*\}\s*catch\s*\([^)]*\)\s*\{\s*_handle401\(\);\s*return\s+res;\s*\}/);
    expect(m).not.toBeNull();
  });

  test('재시도 fetch 는 _handle401 을 부르는 catch **밖**에 있다', () => {
    const b = refreshBlock();
    const catchEnd = b.search(/catch\s*\([^)]*\)\s*\{\s*_handle401\(\);\s*return\s+res;\s*\}/);
    const retryAt = b.indexOf('_fetchWithTimeout(input, newInit');
    expect(catchEnd).toBeGreaterThan(0);
    expect(retryAt).toBeGreaterThan(catchEnd);   // 재시도가 catch 뒤 = 감싸이지 않음
  });

  test('재시도는 원 호출과 같은 타임아웃(_tmo) 을 쓴다 — 12초 고정 금지', () => {
    const b = refreshBlock();
    expect(b).toMatch(/_fetchWithTimeout\(input,\s*newInit,\s*_tmo\)/);
    expect(b).not.toMatch(/_fetchWithTimeout\(input,\s*newInit,\s*FETCH_TIMEOUT_RETRY_MS\)/);
  });

  test('LLM·업로드 타임아웃이 재시도 타임아웃보다 크다는 전제 자체를 고정한다', () => {
    const src = strip(CORE);
    const n = (re) => Number((src.match(re) || [])[1]);
    const retry = n(/FETCH_TIMEOUT_RETRY_MS\s*=\s*(\d+)/);
    const llm = n(/LLM_TIMEOUT_MS\s*=\s*(\d+)/);
    const upFirst = n(/UPLOAD_TIMEOUT_FIRST_MS\s*=\s*(\d+)/);
    expect(retry).toBeGreaterThan(0);
    expect(llm).toBeGreaterThan(retry);      // 12s 로 LLM 을 재시도하면 반드시 실패한다
    expect(upFirst).toBeGreaterThan(retry);
  });
});

describe('② 로컬이 비면 커서를 버리고 전량 pull', () => {
  /** pull() 의 커서 결정 규칙만 꺼내 **실제로 돌린다**. */
  function cursorRule() {
    const src = strip(SYNC);
    const i = src.indexOf('function pull()');
    expect(i).toBeGreaterThan(0);
    const seg = src.slice(i, i + 900);
    const line = (seg.match(/if\s*\(since\s*&&[^\n]*\)\s*\{[^\n]*since\s*=\s*null;[^\n]*\}/) || [])[0];
    expect(line).toBeTruthy();
    // log() 를 무해하게 만들고 규칙만 평가한다
    // eslint-disable-next-line no-new-func
    return new Function('since', '_cur', 'log', line + '; return since;');
  }

  const rule = cursorRule();
  const noop = () => {};

  test('로컬 0건 + 커서 있음 → 커서를 버린다(전량 pull)', () => {
    expect(rule('2026-09-11T00:00:00Z', ['2026-09-11T00:00:00Z', []], noop)).toBeNull();
  });

  test('로컬 0건 + 로컬 배열이 undefined 여도 커서를 버린다', () => {
    expect(rule('2026-09-11T00:00:00Z', ['2026-09-11T00:00:00Z', undefined], noop)).toBeNull();
  });

  test('로컬에 슬롯이 있으면 커서를 유지한다(불필요한 전량 pull 금지)', () => {
    const since = '2026-09-11T00:00:00Z';
    expect(rule(since, [since, [{ id: 'a' }]], noop)).toBe(since);
  });

  test('커서가 없으면 원래대로 전량 pull', () => {
    expect(rule(null, [null, [{ id: 'a' }]], noop)).toBeNull();
  });

  test('pull 은 커서와 로컬 목록을 **함께** 읽는다(둘 중 하나만 보면 규칙이 못 돈다)', () => {
    const src = strip(SYNC);
    const i = src.indexOf('function pull()');
    const seg = src.slice(i, i + 500);
    expect(seg).toMatch(/Promise\.all\(\[[^\]]*getMeta\('lastPulledAt'\)[^\]]*,\s*loadAllLocal\(\)\s*\]\)/);
  });

  test('지운 글이 되살아나지 않도록 tombstone 가드는 그대로 있다', () => {
    const src = strip(SYNC);
    expect(src).toMatch(/if\s*\(tombs\[String\(rs\.slot_id\)\]\)/);
  });
});

describe('③ 잠긴 sync DB 에서도 pull 은 끝난다', () => {
  test('커서 읽기와 tombstone 읽기가 둘 다 타임아웃 방어(_readOr)를 거친다', () => {
    const src = strip(SYNC);
    const i = src.indexOf('function pull()');
    const seg = src.slice(i, i + 1800);
    expect(seg).toMatch(/_readOr\(\s*getMeta\('lastPulledAt'\)\s*,\s*null\s*\)/);
    // tombstone 읽기는 allTombstones() 로 옮겼다 — 계약(타임아웃 방어)은 그대로 그 안에 있어야 한다.
    expect(seg).toMatch(/allTombstones\(\)/);
    const at = src.indexOf('function allTombstones()');
    expect(at).toBeGreaterThan(0);
    expect(src.slice(at, at + 500)).toMatch(/_readOr\(\s*listTombstones\(\)\s*,\s*\[\]\s*\)/);
  });

  test('_readOr 는 응답이 영영 안 와도 fallback 으로 **끝난다**', async () => {
    const src = strip(SYNC);
    const i = src.indexOf('function _readOr(');
    expect(i).toBeGreaterThan(0);
    const body = src.slice(i, src.indexOf('\n  function getMeta', i));
    // 테스트에서 기다리지 않도록 타임아웃만 짧게 바꿔 실행한다(규칙은 그대로).
    // eslint-disable-next-line no-new-func
    const make = new Function('SYNC_READ_TIMEOUT_MS', 'log', body + '; return _readOr;');
    const readOr = make(30, () => {});
    const never = new Promise(() => {});                 // 잠긴 IDB = 아무 이벤트도 안 옴
    await expect(readOr(never, null)).resolves.toBeNull();
    await expect(readOr(never, [])).resolves.toEqual([]);
  });

  test('_readOr 는 정상 응답이면 그 값을 그대로 돌려준다', async () => {
    const src = strip(SYNC);
    const i = src.indexOf('function _readOr(');
    const body = src.slice(i, src.indexOf('\n  function getMeta', i));
    // eslint-disable-next-line no-new-func
    const readOr = new Function('SYNC_READ_TIMEOUT_MS', 'log', body + '; return _readOr;')(1000, () => {});
    await expect(readOr(Promise.resolve('2026-09-11T00:00:00Z'), null)).resolves.toBe('2026-09-11T00:00:00Z');
    await expect(readOr(Promise.reject(new Error('x')), [])).resolves.toEqual([]);   // 거절도 fallback
  });
});

describe('④ 잠긴 sync DB 가 sync() 체인을 통째로 멈추면 안 된다', () => {
  test('openSyncDB 에 여는 상한이 있고 timeout·blocked 둘 다 거절로 끝난다', () => {
    const src = strip(SYNC);
    const i = src.indexOf('function openSyncDB()');
    expect(i).toBeGreaterThan(0);
    const seg = src.slice(i, i + 1400);
    expect(seg).toMatch(/setTimeout\(/);
    expect(seg).toMatch(/SYNC_OPEN_TIMEOUT_MS/);
    expect(seg).toMatch(/req\.onblocked\s*=/);
    // 상한이 무한대면 의미가 없다
    const ms = Number((src.match(/SYNC_OPEN_TIMEOUT_MS\s*=\s*(\d+)/) || [])[1]);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(10000);
  });

  test('openSyncDB 는 이벤트가 하나도 안 와도 **끝난다**', async () => {
    const src = strip(SYNC);
    const i = src.indexOf('var SYNC_OPEN_TIMEOUT_MS');
    const j = src.indexOf('function _tx(', i);
    const body = src.slice(i, j);
    // 아무 이벤트도 안 내는 IndexedDB (2026-09-03 실측과 같은 상태)
    const deadIDB = { open() { return { onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null, error: null }; } };
    // eslint-disable-next-line no-new-func
    const make = new Function('indexedDB', 'log', '_sdb', body.replace(/var SYNC_OPEN_TIMEOUT_MS\s*=\s*\d+;/, 'var SYNC_OPEN_TIMEOUT_MS = 30;') + '; return openSyncDB;');
    const open = make(deadIDB, () => {}, null);
    await expect(open()).rejects.toThrow(/timeout/);
  });

  test('sync() 는 앞 단계가 엎어져도 pull 까지 간다', () => {
    const src = strip(SYNC);
    const i = src.indexOf('function sync()');
    const seg = src.slice(i, i + 900);
    expect(seg).toMatch(/migrateIfNeeded\(\)\.catch\(/);          // 마이그레이션 실패해도 계속
    expect(seg).toMatch(/pushAll\(\)\.catch\(/);                  // 업로드 실패해도 계속
    expect(seg).toMatch(/\.then\(pull\)/);                        // 그리고 pull 로 간다
    // pull 앞에 catch 가 없으면(=체인이 통째로 빠지면) 의미가 없다
    const pullAt = seg.indexOf('.then(pull)');
    const migAt = seg.indexOf('migrateIfNeeded().catch(');
    expect(migAt).toBeGreaterThan(-1);
    expect(pullAt).toBeGreaterThan(migAt);
  });
});
