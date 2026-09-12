/**
 * @jest-environment jsdom
 */
/* [BUG-N1] 단일 클라이언트인데 작업 카드가 `_conflict_` 사본으로 갈라지던 것.
 *
 * 실측(라이브 c3bf4ca, 실 Chrome, 탭 1개): 편집 → [완료] → 곧바로 다른 메뉴 → 작업실 복귀.
 *   mtwaanxzx4nb6                        QA0911_김테스트  레이어 9
 *   mtwaanxzx4nb6_conflict_1789107327563 QA0911_김테스트  레이어 10  ← 최신 편집이 여기
 * 1차 발생 때는 **양쪽 레이어가 9개 모두 글자 단위로 동일**했는데도 충돌로 판정됐다.
 *
 * 이 테스트는 문자열을 찾지 않는다. workspace-sync.js 의 **진짜 photoSig / merge3 를
 * 파일에서 꺼내 실행**한다.
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js/workspace/workspace-sync.js'), 'utf8');

/** IIFE 안의 내부 함수들을 그대로 꺼내 실행 가능한 모듈로 만든다. */
function loadInternals() {
  /* 없는 함수는 빈 문자열로 넘긴다 — 수정을 되돌린 baseline 에는 `_imgAgnostic`/`_hash` 가
     아예 없다. 여기서 throw 하면 **스위트가 통째로 에러**나서 "되돌리면 어느 테스트가
     깨지는가" 를 보여주지 못한다. 로더는 관대하게, 판정은 테스트가 한다. */
  const OPTIONAL = ['_imgAgnostic', '_hash'];
  const grab = (name) => {
    const at = SRC.indexOf('function ' + name + '(');
    if (at < 0) {
      if (OPTIONAL.indexOf(name) >= 0) return '';
      throw new Error(`${name} 을 못 찾음 — 구조가 바뀌었으면 이 테스트부터 고쳐라`);
    }
    let depth = 0, i = SRC.indexOf('{', at), end = -1;
    for (; i < SRC.length; i++) {
      if (SRC[i] === '{') depth++;
      else if (SRC[i] === '}' && --depth === 0) { end = i; break; }
    }
    return SRC.slice(at, end + 1);
  };
  const body = [
    "var MERGE_FIELDS = ['label','caption','hashtags','customer_id','order'];",
    grab('_imgAgnostic'), grab('_hash'), grab('photoSig'), grab('makeBase'),
    grab('sameVal'), grab('sameBaseSig'), grab('merge3'),
    'return { photoSig: photoSig, makeBase: makeBase, sameBaseSig: sameBaseSig, merge3: merge3 };',
  ].join('\n');
  return new Function(body)();
}
const S = loadInternals();

// 같은 꾸밈. 로컬은 dataURL 이 인라인, 서버본은 업로드된 https URL.
const LAYERS = [{ type: 'text', text: '붙임머리 24 Ext #1' }, { type: 'text', text: 'BEFORE' }];
const BIG_DATA_URL = 'data:image/jpeg;base64,' + 'A'.repeat(120000);
const HTTPS_URL = 'https://hsxxqomfbdernepykils.supabase.co/storage/v1/object/public/u/4/a.jpg';

const localSlot  = { id: 's1', label: '작업', photos: [{ id: 'p1', role: 'hero', editState: { v: 1, photos: [BIG_DATA_URL], layers: LAYERS } }] };
const remoteSlot = { id: 's1', label: '작업', photos: [{ id: 'p1', role: 'hero', editState: { v: 1, photos: [HTTPS_URL],   layers: LAYERS } }] };

describe('photoSig 는 저장 위치에 휘둘리지 않는다', () => {
  test('🔴 같은 꾸밈이면 dataURL 이든 https URL 이든 서명이 같다', () => {
    expect(S.photoSig(localSlot)).toBe(S.photoSig(remoteSlot));
  });

  test('레이어 내용이 실제로 다르면 서명도 다르다 (진짜 충돌은 계속 잡는다)', () => {
    const changed = JSON.parse(JSON.stringify(remoteSlot));
    changed.photos[0].editState.layers.push({ type: 'text', text: 'NEW' });
    expect(S.photoSig(localSlot)).not.toBe(S.photoSig(changed));
  });

  test('길이만으로 판정하지 않는다 — 길이가 같고 내용이 다르면 구분한다', () => {
    const a = { photos: [{ id: 'p', role: 'hero', editState: { t: 'AAAA' } }] };
    const b = { photos: [{ id: 'p', role: 'hero', editState: { t: 'BBBB' } }] };
    expect(S.photoSig(a)).not.toBe(S.photoSig(b));   // 예전 `.length` 방식이면 같았다
  });
});

describe('merge3 가 허위 충돌을 만들지 않는다', () => {
  test('🔴 내용이 같은데 저장 위치만 다르면 photos 충돌이 아니다', () => {
    const base = S.makeBase(localSlot);
    const res = S.merge3(base, localSlot, remoteSlot);
    expect(res.conflicts).not.toContain('photos');
    expect(res.conflicts).toHaveLength(0);
  });

  test('내가 새 레이어를 넣고 서버는 그대로면 → 내 것이 이긴다 (fork 없음)', () => {
    const base = S.makeBase(remoteSlot);                     // 합의 지점 = 서버본 내용
    const mine = JSON.parse(JSON.stringify(localSlot));
    mine.photos[0].editState.layers.push({ type: 'text', text: 'SE_ROUND_C' });
    const res = S.merge3(base, mine, remoteSlot);
    expect(res.conflicts).toHaveLength(0);                   // 상대가 안 건드림 → 내 것
    expect(res.slot.photos[0].editState.layers).toHaveLength(3);
  });

  test('양쪽이 서로 다르게 고쳤으면 여전히 충돌로 남긴다 (데이터 보존)', () => {
    const base = S.makeBase(remoteSlot);
    const mine = JSON.parse(JSON.stringify(localSlot));
    mine.photos[0].editState.layers.push({ type: 'text', text: 'MINE' });
    const theirs = JSON.parse(JSON.stringify(remoteSlot));
    theirs.photos[0].editState.layers.push({ type: 'text', text: 'THEIRS' });
    const res = S.merge3(base, mine, theirs);
    expect(res.conflicts).toContain('photos');               // 진짜 충돌은 그대로 잡는다
  });
});

describe("'내 push 가 늦게 도착' 가드가 실제로 발동한다", () => {
  test('🔴 _pending 지문이 서버본과 같다고 인식된다', () => {
    // 이 가드(3333652)는 _sig 가 저장 위치 때문에 영영 안 맞아 한 번도 발동하지 못했다.
    const pending = S.makeBase(localSlot);                    // 내가 보낸 것(로컬 flavor)
    const remoteBase = S.makeBase(remoteSlot);                // 서버가 돌려준 것(URL flavor)
    expect(S.sameBaseSig(pending, remoteBase)).toBe(true);
  });
});
