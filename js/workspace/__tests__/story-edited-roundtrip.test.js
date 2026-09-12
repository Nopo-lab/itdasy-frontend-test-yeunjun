'use strict';
/* [BUG-2] `storyEdited` 가 서버를 한 번 왕복하면 사라지던 것.
 *
 * 실측(라이브 c3bf4ca → 9122e30): 편집 [완료] 직후 IDB 는 true 인데,
 *   A 새로고침 후            → false
 *   B 화면만 옮겼다 돌아와도 → false   ← 새로고침조차 필요 없다
 * 레이어·스타일·위치는 전부 살아남고 **이 표식만** 사라졌다.
 *
 * 원인은 체인 5곳이 전부 비어 있던 것:
 *   buildPayload(FE) → PhotoIn(BE) → 모델 컬럼 → _photo_out(BE) → remoteToLocal(FE)
 *
 * 여기서는 FE 양끝(보내는 쪽·받는 쪽)을 레포 하네스(`WorkspaceSync._debug`)로 **실제 실행**한다.
 * 백엔드 3곳은 backend/tests 의 왕복 테스트가 잠근다.
 */
const fs = require('fs');
const path = require('path');

function loadSync() {
  global.window = { ITDASY_SLOT_SYNC: true, addEventListener() {} };
  global.document = { addEventListener() {}, hidden: false };
  global.indexedDB = { open() { return {}; } };
  const realTimeout = global.setTimeout;
  global.setTimeout = () => 0;
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(__dirname, '..', 'workspace-sync.js'), 'utf8'));
  global.setTimeout = realTimeout;
  return global.window.WorkspaceSync && global.window.WorkspaceSync._debug;
}
const D = loadSync();

describe('보내는 쪽 — buildPayload 가 story_edited 를 싣는다', () => {
  const slotWith = (edited) => ({
    id: 's1', label: '작업', caption: '', hashtags: '', order: 0,
    photos: [{ id: 'p1', role: 'hero', editState: { v: 1, layers: [] },
               editedDataUrl: 'https://cdn.example/a.jpg', baseUrl: 'https://cdn.example/b.jpg',
               storyEdited: edited }],
  });

  test('🔴 원장이 직접 꾸민 사진이면 true 로 나간다', async () => {
    const out = await D.buildPayload(slotWith(true));
    expect(out.payload.photos).toHaveLength(1);
    expect(out.payload.photos[0].story_edited).toBe(true);
  });

  test('안 꾸민 사진이면 false 로 나간다 (필드 자체는 항상 실린다)', async () => {
    const out = await D.buildPayload(slotWith(false));
    expect(out.payload.photos[0]).toHaveProperty('story_edited');
    expect(out.payload.photos[0].story_edited).toBe(false);
  });

  test('편집상태·역할 등 기존 필드는 그대로다 (기존 계약 유지)', async () => {
    const out = await D.buildPayload(slotWith(true));
    const p = out.payload.photos[0];
    expect(p.photo_id).toBe('p1');
    expect(p.role).toBe('hero');
    expect(p.edit_state).toEqual({ v: 1, layers: [] });
  });
});

describe('받는 쪽 — remoteToLocal 이 storyEdited 를 복원한다', () => {
  const remote = (edited) => ({
    slot_id: 's1', label: '작업', caption: '', hashtags: '', sort_order: 0, meta: {},
    photos: [{ photo_id: 'p1', role: 'hero', image_url: 'https://cdn.example/a.jpg',
               base_url: 'https://cdn.example/b.jpg', edit_state: { v: 1, layers: [] },
               story_edited: edited }],
  });

  test('🔴 서버가 true 를 주면 살아남는다', () => {
    const local = D.remoteToLocal(remote(true));
    expect(local.photos[0].storyEdited).toBe(true);
  });

  test('서버가 false 를 주면 false', () => {
    expect(D.remoteToLocal(remote(false)).photos[0].storyEdited).toBe(false);
  });

  test('옛 서버(필드 없음)면 false — 터지지 않는다', () => {
    const r = remote(true);
    delete r.photos[0].story_edited;
    expect(D.remoteToLocal(r).photos[0].storyEdited).toBe(false);
  });
});

describe('왕복 — 보낸 값이 되돌아온다', () => {
  test('🔴 true 로 보내고 서버가 그대로 돌려주면 true 로 복원된다', async () => {
    const sent = await D.buildPayload({
      id: 's1', label: '작업', caption: '', hashtags: '', order: 0,
      photos: [{ id: 'p1', role: 'hero', editState: { v: 1, layers: [{ text: 'A' }] },
                 editedDataUrl: 'https://cdn.example/a.jpg', storyEdited: true }],
    });
    // 서버가 받은 그대로 돌려준다고 가정(백엔드 왕복은 backend/tests 가 잠근다)
    const echoed = {
      slot_id: 's1', label: '작업', caption: '', hashtags: '', sort_order: 0, meta: {},
      photos: sent.payload.photos.map(p => ({
        photo_id: p.photo_id, role: p.role, image_url: p.image_url,
        base_url: p.base_url, edit_state: p.edit_state, story_edited: p.story_edited,
      })),
    };
    const back = D.remoteToLocal(echoed);
    expect(back.photos[0].storyEdited).toBe(true);
    expect(back.photos[0].editState.layers).toHaveLength(1);   // 레이어도 같이 살아남는다
  });
});
