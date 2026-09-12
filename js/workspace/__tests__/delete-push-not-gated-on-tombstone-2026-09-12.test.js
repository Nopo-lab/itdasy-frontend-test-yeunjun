/* 🔴 [2026-09-12 · ZERO-HELP 게이트 라이브 실측] **지운 게시물이 새로고침하면 되살아났다.**
 *
 * 실측(LIVE 20260911-1508-256cd7e, 실계정 user 4, `itdasy-sync` 를 못 여는 프로필):
 *   작업실 → 삭제 → 확인창 → "콘텐츠를 삭제했어요" 토스트 → 타일 4→3
 *   새로고침 → 타일 3→4, 로컬 키에 mtws7ssfjm7ac 복귀, 서버엔 deleted 표시 없음
 *
 * 원인: 서버 DELETE 가 **tombstone 저장에 매달려** 있었다.
 *   `addTombstone()` 이 거절하면 체인이 그대로 catch 로 빠져 `flushTombstones()` 가
 *   아예 안 불린다 → 서버는 삭제를 영영 모르고, 다음 pull 이 그 행을 되살린다.
 *   실패는 `.catch(function () {})` 가 통째로 삼켜 원장은 알 방법도 없다.
 *   (tombstone 은 "아직 못 보낸 삭제" 의 재시도 기록일 뿐, 삭제의 전제조건이 아니다.)
 *
 * 수정: ① 메모리 tombstone 을 같이 남겨 같은 세션의 pull 이 되살리지 못하게 하고
 *      ② 기록 성공 여부와 무관하게 flush(=서버 DELETE)를 태운다.
 */
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../workspace-sync.js'), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function delWrapper() {
  const src = strip(SRC);
  const i = src.indexOf('var wrappedDel = function (id)');
  expect(i).toBeGreaterThan(0);
  const j = src.indexOf('wrappedDel.__wsSyncWrapped', i);
  expect(j).toBeGreaterThan(i);
  const block = src.slice(i, j);
  expect(block.length).toBeLessThan(900);   // 앵커가 벌어지면 가드가 무력해진다
  return block;
}

test('서버 DELETE(flushTombstones)는 addTombstone 실패와 무관하게 불린다', () => {
  const b = delWrapper();
  // addTombstone 은 자기 catch 를 갖고, 그 뒤에 flush 가 온다
  expect(b).toMatch(/addTombstone\(sid\)\.catch\(/);
  const addAt = b.indexOf('addTombstone(sid).catch(');
  const flushAt = b.indexOf('flushTombstones()');
  expect(addAt).toBeGreaterThan(-1);
  expect(flushAt).toBeGreaterThan(addAt);
  // 옛 형태(기록 성공에 매달린 체인)가 남아 있으면 안 된다
  expect(b).not.toMatch(/\.then\(function \(\) \{ return addTombstone\(String\(id\)\); \}\)\s*\.then/);
});

test('삭제 즉시 메모리 tombstone 을 남긴다 — 같은 세션 pull 이 되살리지 못하게', () => {
  const b = delWrapper();
  expect(b).toMatch(/_memTombs\[sid\]\s*=/);
  const memAt = b.indexOf('_memTombs[sid]');
  const flushAt = b.indexOf('flushTombstones()');
  expect(memAt).toBeGreaterThan(-1);
  expect(memAt).toBeLessThan(flushAt);   // 보내기 **전에** 기록한다
});

test('실패를 조용히 삼키지 않는다 — 빈 catch 금지', () => {
  const b = delWrapper();
  expect(b).not.toMatch(/\.catch\(function \(\) \{\}\)/);
  expect(b).toMatch(/log\(/);
});

test('pull 의 부활 방지 가드와 flush 가 **둘 다** 메모리분을 포함한 목록을 쓴다', () => {
  const src = strip(SRC);
  const pi = src.indexOf('function pull()');
  expect(src.slice(pi, pi + 1400)).toMatch(/allTombstones\(\)/);
  const fi = src.indexOf('function flushTombstones()');
  expect(src.slice(fi, fi + 300)).toMatch(/allTombstones\(\)/);
});

test('allTombstones 는 IDB 분과 메모리분을 합치고 중복을 없앤다 — 실제로 돌려본다', async () => {
  const src = strip(SRC);
  const i = src.indexOf('function allTombstones()');
  const j = src.indexOf('\n  }', i) + 4;
  const body = src.slice(i, j);
  // eslint-disable-next-line no-new-func
  const make = new Function('_readOr', 'listTombstones', '_memTombs', body + '; return allTombstones;');
  const readOr = (p) => Promise.resolve(p);

  // ① IDB 가 죽어 빈 배열일 때 — 메모리분이 살아남는다
  let all = make(readOr, () => Promise.resolve([]), { s1: 111, s2: 222 });
  let r = await all();
  expect(r.map((t) => t.slot_id).sort()).toEqual(['s1', 's2']);

  // ② 둘 다 있을 때 — 중복은 한 번만
  all = make(readOr, () => Promise.resolve([{ slot_id: 's1', at: 9 }]), { s1: 111, s3: 333 });
  r = await all();
  expect(r.map((t) => t.slot_id).sort()).toEqual(['s1', 's3']);
  expect(r.filter((t) => t.slot_id === 's1').length).toBe(1);

  // ③ 메모리가 비었을 때 — 기존 동작 그대로
  all = make(readOr, () => Promise.resolve([{ slot_id: 's9', at: 1 }]), {});
  r = await all();
  expect(r.map((t) => t.slot_id)).toEqual(['s9']);
});

test('서버가 삭제를 확인하면 메모리분도 같이 지운다(영구 mute 방지)', () => {
  const src = strip(SRC);
  const i = src.indexOf('function delTombstone(');
  expect(src.slice(i, i + 200)).toMatch(/delete _memTombs\[String\(slotId\)\]/);
});
