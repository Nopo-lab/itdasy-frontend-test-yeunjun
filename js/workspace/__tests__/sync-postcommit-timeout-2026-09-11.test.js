/* 🔴 [2026-09-11 · §8 실측] **서버는 저장에 성공했는데 응답이 유실된 뒤**
 * 원장이 "저장이 안 됐나" 하고 다시 저장하면 **작업 카드가 하나 더 생겼다.**
 * 라벨은 "(다른 기기 수정본)" 인데 쓴 사람은 원장 한 명뿐이다.
 *
 * 실측 (라이브 · 실계정 user 4 · upsert 응답만 삼킴):
 *   upsert 실제 발신 1회 · 서버 행 4 → 4 (중복 없음) · 서버 caption 은 첫 저장분으로 커밋됨
 *   그런데 네트워크 복구 후 로컬 5 / 서버 4
 *   남는 것: mtwg6wsr58r5c_conflict_1789101317843 (onServer:false, dirty)
 *
 * 원인: 응답을 못 받으면 로컬은 **옛 _base** 를 그대로 들고 dirty 로 남는다.
 *   다음 push 가 옛 rev 를 보내 409 → 3-way 병합이 base 기준으로
 *   "둘 다 바뀌었다" 로 읽어 진짜 충돌로 판정 → 분리 사본 생성.
 *
 * 수정: 보낸 내용의 지문을 `_pending` 으로 남기고, 서버본이 그 지문과 같으면
 *   '남의 변경' 이 아니라 '내 것이 늦게 도착한 것' 으로 보고 base 를 그 지문으로 바꾼다.
 *   → merge3 에서 remote===base 가 되어 내 새 편집만 남고 사본을 안 만든다.
 *   다른 기기가 **진짜로** 바꿨으면 지문이 달라 기존처럼 분리 보존된다.
 */
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../workspace-sync.js'), 'utf8');

/* 모듈 안의 순수 함수만 꺼내 **실제로 돌린다**(문자열 매칭이 아니라 동작으로 판정). */
function pure() {
  const pick = (name) => {
    const i = SRC.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('못 찾음: ' + name);
    const j = SRC.indexOf('\n  function ', i + 10);
    return SRC.slice(i, j < 0 ? i + 3000 : j);
  };
  const src = [
    "var MERGE_FIELDS = ['label','caption','hashtags','customer_id','order'];",
    'function photoSig(s){ return ((s&&s.photos)||[]).map(function(p){return (p&&p.id)+":"+((p&&p.editState&&p.editState.v)||"");}).join("|"); }',
    pick('sameVal'), pick('makeBase'), pick('sameBaseSig'), pick('merge3'),
    'return { makeBase: makeBase, sameBaseSig: sameBaseSig, merge3: merge3 };',
  ].join('\n');
  return new Function(src)();
}
const P = pure();

const slot = (o) => Object.assign({ label: '', caption: '', hashtags: '', customer_id: null, order: 0, photos: [] }, o);

describe('🔴 응답을 못 받은 내 push 가 늦게 도착해도 사본을 만들지 않는다', () => {
  test('서버본이 내가 보낸 그것이면 지문이 일치한다', () => {
    const pushed = slot({ caption: '첫저장' });
    const remote = slot({ caption: '첫저장' });          // 서버가 커밋한 내 것
    expect(P.sameBaseSig(P.makeBase(pushed), P.makeBase(remote))).toBe(true);
  });

  test('다른 기기가 진짜로 바꿨으면 지문이 다르다', () => {
    const pushed = slot({ caption: '첫저장' });
    const remote = slot({ caption: '남이 고친 것' });
    expect(P.sameBaseSig(P.makeBase(pushed), P.makeBase(remote))).toBe(false);
  });

  test('🔴 옛 base 로 병합하면 진짜 충돌이 나서 사본이 생긴다 (버그 재현)', () => {
    const oldBase = P.makeBase(slot({ caption: '' }));          // push 이전 상태
    const local = slot({ caption: '재시도분' });                 // 원장이 다시 저장
    const remote = slot({ caption: '첫저장' });                  // 서버엔 내 첫 저장이 커밋됨
    const res = P.merge3(oldBase, local, remote);
    expect(res.conflicts).toContain('caption');                  // → 분리 사본 경로
  });

  test('✅ _pending 지문을 base 로 쓰면 충돌 없이 내 편집만 남는다', () => {
    const pendingBase = P.makeBase(slot({ caption: '첫저장' })); // 내가 보낸 그 내용
    const local = slot({ caption: '재시도분' });
    const remote = slot({ caption: '첫저장' });
    const res = P.merge3(pendingBase, local, remote);
    expect(res.conflicts).toEqual([]);                           // 사본 안 만듦
    expect(res.slot.caption).toBe('재시도분');                    // 원장의 최신 편집이 남는다
  });

  test('✅ 사진까지 같이 봤을 때도 사본을 안 만든다', () => {
    const ph = [{ id: 'p1', editState: { v: 1 } }];
    const pendingBase = P.makeBase(slot({ caption: '첫저장', photos: ph }));
    const local = slot({ caption: '재시도분', photos: ph });
    const remote = slot({ caption: '첫저장', photos: ph });
    expect(P.merge3(pendingBase, local, remote).conflicts).toEqual([]);
  });

  test('✅ 진짜 다른 기기 충돌은 그대로 분리 보존된다 (안전망을 없애면 안 된다)', () => {
    const pendingBase = P.makeBase(slot({ caption: '첫저장' }));
    const local = slot({ caption: '내 수정' });
    const remote = slot({ caption: '남의 수정' });               // 지문 불일치 → base 승격 안 됨
    expect(P.sameBaseSig(pendingBase, P.makeBase(remote))).toBe(false);
    expect(P.merge3(pendingBase, local, remote).conflicts).toContain('caption');
  });
});

describe('배선 — 지문이 실제로 남고, 지워지고, 서버로 안 나간다', () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const S = strip(SRC);
  /* 🔴 [2026-09-11 2차] 처음엔 **실패 콜백에서만** 지문을 남겼는데,
     응답이 아예 안 오는(행) 경우엔 그 콜백이 안 돈다. 실측으로 잡았다:
     forever-pending 응답으로 재현하니 `_pending` 이 안 남아 수정이 무력화됐다.
     → 보내기 **전에** 남긴다. */
  test('보내기 전에 지문을 영속한다 (행 걸려도 남아야 한다)', () => {
    const i = S.indexOf('_pendingBase = makeBase(slot)');
    const j = S.indexOf("apiFetch('/workspace/slots/upsert'", i);
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    const between = S.slice(i, j);
    expect(between).toMatch(/slot\._pending = _pendingBase/);
    expect(between).toMatch(/_origSaveSlot\(slot\)/);
  });
  test('실패 콜백에도 남긴다 (이중 안전망)', () => {
    expect(S).toMatch(/catch\(function \(e\) \{[\s\S]{0,300}slot\._pending = _pendingBase;/);
  });
  test('push 성공하면 지문을 지운다', () => {
    expect(S).toMatch(/slot\._base = makeBase\(slot\);\s*delete slot\._pending;/);
  });
  test('충돌 해소가 지문을 base 로 승격한다', () => {
    expect(S).toMatch(/if \(local && local\._pending && sameBaseSig\(local\._pending, makeBase\(remote\)\)\)/);
  });
  test('지문은 서버로 올라가지 않는다 (서버 오염 금지)', () => {
    expect(S).toMatch(/META_SKIP = \{[^}]*_pending: 1/);
  });
  test('분리 사본에도 지문이 남지 않는다', () => {
    expect(S).toMatch(/delete mine\._pending;/);
  });
});
