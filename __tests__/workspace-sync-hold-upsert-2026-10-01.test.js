/**
 * @jest-environment jsdom
 */
/* 🔴 [2026-10-01 flow-workspace-photo-04 FE] 사진 업로드가 실패(저장소 503/400)해도 upsert 가 사진 0장·결과물 null 로
 *   서버에 올라가, 로그아웃(로컬 삭제)·다른 기기에서는 사진 없는 글만 남았다 — 사진 영구 손실 경로.
 *
 * 실측(scn-f2-sync [F2a], 로컬 스택): image 400 ×3 → POST /workspace/slots/upsert 200 (photos:[], outputUrl:null)
 *   → 서버 photos 0 · 로컬 초기화 → pull 후 nPhotos 0, 홈 카드 "작성 중".
 *
 * 원인: buildPayload 는 실패 사진을 걸러내고 _complete=false 만 표시하는데 pushSlot 은 그와 무관하게 upsert 를 보냈다.
 * 수정: _complete 가 아니면 upsert 를 보내지 않고 dirty 로 남겨 다음 라운드에 재시도(이번 라운드는 실패로 센다).
 *       로그아웃 전 확인용 unsyncedCount()/guardLogout() 노출(app-core 한 줄은 리드가).
 *
 * workspace-sync.js 를 통째로 로드해 실제 pushSlot 을 돌린다(업로드/네트워크만 가짜).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.ITDASY_SRC_ROOT || path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/workspace/workspace-sync.js'), 'utf8');
const TOKEN = 'h.' + Buffer.from(JSON.stringify({ sub: '7' })).toString('base64') + '.s';

function boot(opts) {
  opts = opts || {};
  const calls = { upserts: [], images: 0, saved: [] };
  window.ITDASY_SLOT_SYNC = true;
  window.authHeader = () => ({ Authorization: 'Bearer ' + TOKEN });
  window.showToast = () => {};
  window.apiFetch = (url, o) => {
    if (/\/workspace\/slots\/image/.test(url)) {
      calls.images++;
      if (opts.imageFail) return Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ detail: 'bad' }) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ url: 'https://cdn.example/f' + calls.images + '.jpg' }) });
    }
    if (/\/workspace\/slots\/upsert/.test(url)) {
      calls.upserts.push(JSON.parse(o.body));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, slot: { server_updated_at: '2026-10-01T00:00:00Z' } }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ slots: [] }) });
  };
  let local = [];
  window.loadSlotsFromDB = () => Promise.resolve(local.slice());
  window.saveSlotToDB = (s) => { calls.saved.push(s.id); return Promise.resolve(); };
  window.deleteSlotFromDB = () => Promise.resolve();
  // 업로드용 이미지 디코드/캔버스 — jsdom 엔 없다
  global.Image = class { set src(_v) { const self = this; setTimeout(() => self.onload && self.onload(), 0); } get naturalWidth() { return 100; } get naturalHeight() { return 100; } };
  HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, drawImage() {} });
  HTMLCanvasElement.prototype.toBlob = function (cb, mime) { cb(new Blob(['x'], { type: mime || 'image/jpeg' })); };
  // 부팅 sync 의 pushAll 이 테스트의 pushSlot 호출과 겹치지 않게 — 편집 중(coalesce)으로 두고 정착(settleSlot)은 가드 테스트가 직접 부른다
  window.ITDASY_SLOT_SYNC_COALESCE = true;
  // eslint-disable-next-line no-eval
  eval(SRC);
  window.WorkspaceSync.beginEdit();
  return { WS: window.WorkspaceSync, calls, setLocal: (l) => { local = l; } };
}
const slot = (id) => ({ id, label: 'l', caption: '', hashtags: '', photos: [{ id: 'p1', role: 'hero', dataUrl: 'data:image/jpeg;base64,AAAA' }, { id: 'p2', role: 'hero', dataUrl: 'data:image/jpeg;base64,BBBB' }],
  templateOutputs: [{ pairId: 'wsc-1', templateId: 'wsl-ba-lr', outputUrl: 'data:image/jpeg;base64,CCCC', photoIds: ['p1', 'p2'] }], syncState: 'dirty', updatedAt: 1 });

test('🔴 업로드가 실패하면 upsert 를 보내지 않고 dirty 로 남긴다(서버본이 사진 0장이 되지 않는다)', async () => {
  const { WS, calls } = boot({ imageFail: true });
  const s = slot('held1');
  await WS._debug.pushSlot(s);
  expect(calls.images).toBeGreaterThan(0);
  expect(calls.upserts).toEqual([]);
  expect(s.syncState).toBe('dirty');
  expect(s._pending).toBeUndefined();     // 보낸 게 없으니 '미확인 전송' 흔적도 남기지 않는다
  expect(WS.heldCount()).toBe(1);
});

test('업로드가 되면 upsert 가 사진 URL 과 함께 나가고 synced 로 굳는다(기존 동작 그대로)', async () => {
  const { WS, calls, setLocal } = boot({});
  const s = slot('ok1'); setLocal([s]);
  await WS._debug.pushSlot(s);
  expect(calls.upserts.length).toBe(1);
  expect(calls.upserts[0].photos.map((p) => p.image_url)).toEqual(['https://cdn.example/f1.jpg', 'https://cdn.example/f2.jpg']);
  expect(calls.upserts[0].meta.templateOutputs[0].outputUrl).toBe('https://cdn.example/f3.jpg');
  expect(s.syncState).toBe('synced');
  expect(WS.heldCount()).toBe(0);
});

describe('로그아웃 가드 — 아직 못 올린 작업이 있으면 묻는다', () => {
  test('unsyncedCount 는 dirty 슬롯 수(다른 계정 도장은 제외)', async () => {
    const { WS, setLocal } = boot({ imageFail: true });
    setLocal([Object.assign(slot('a'), { syncState: 'dirty' }), Object.assign(slot('b'), { syncState: 'synced' }), Object.assign(slot('c'), { syncState: 'dirty', _owner: '99' })]);
    expect(await WS.unsyncedCount()).toBe(1);
  });
  test('guardLogout: 미전송 0건이면 묻지 않고 true', async () => {
    const { WS, setLocal } = boot({});
    setLocal([Object.assign(slot('b'), { syncState: 'synced' })]);
    const ask = jest.fn(() => false);
    expect(await WS.guardLogout({ confirm: ask, settleMs: 50 })).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });
  test('guardLogout: 정착을 시도해도 남으면(업로드 실패) N건을 말하고, 취소하면 false · 확인하면 true', async () => {
    const { WS, setLocal } = boot({ imageFail: true });
    setLocal([slot('x1')]);
    const no = jest.fn(() => false);
    expect(await WS.guardLogout({ confirm: no, settleMs: 200 })).toBe(false);
    expect(no).toHaveBeenCalledTimes(1);
    expect(no.mock.calls[0][0]).toMatch(/1건/);
    const yes = jest.fn(() => true);
    expect(await WS.guardLogout({ confirm: yes, settleMs: 200 })).toBe(true);
  });
  test('동기화 꺼진 빌드(enabled=false)에도 같은 이름이 있어 호출부가 분기하지 않아도 된다', () => {
    expect(SRC).toMatch(/enabled: false,[^\n]*unsyncedCount: function \(\) \{ return Promise\.resolve\(0\); \}, guardLogout: function \(\) \{ return Promise\.resolve\(true\); \}/);
  });
});
