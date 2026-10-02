/**
 * @jest-environment jsdom
 */
/* 🔴 [2026-10-01 flow-workspace-photo-02] 서버(BE routers/workspace_sync.py)가 사진 있는 글에 photos:[] 가 오면
 *   409 {detail:{reason:'photos_would_be_cleared', slot:<서버본>}} 로 거절하고, 정말 전부 지우려면 clear_photos:true 를
 *   요구한다. FE 는 이 계약을 몰랐다 — 모든 409 를 '다른 기기 충돌' 로 읽어 3-way 병합(로컬 채택) → dirty 유지 →
 *   다음 라운드 또 409. 사진을 전부 뺀 글은 **영원히 dirty** 고 안내도 없었다(실측 sync-409-wt.json: reqs photos:0 ·
 *   clear_photos undefined · db sync:'dirty' · toasts [] · status.failed false).
 *
 * 수정(workspace-sync.js pushSlot/_sendUpsert):
 *   (a) 로컬이 의도적으로 사진 0장(slot.photos 비어 있음)이면 clear_photos:true 로 1회 재전송 → synced.
 *   (b) 로컬에 사진 항목은 있는데 실을 이미지가 없으면(비정상) 서버본 사진을 로컬로 되살리고 그걸로 다시 올린다 — clear 금지.
 *   (c) reason 'conflict'(또는 reason 없음 + slot) 는 기존 3-way 병합 그대로.
 *
 * workspace-sync.js 를 통째로 로드해 실제 pushSlot 을 돌린다(네트워크만 가짜).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.ITDASY_SRC_ROOT || path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/workspace/workspace-sync.js'), 'utf8');
const TOKEN = 'h.' + Buffer.from(JSON.stringify({ sub: '7' })).toString('base64') + '.s';

const SRV_PHOTO = { photo_id: 'p1', role: 'hero', image_url: 'https://x.supabase.co/storage/v1/object/public/b/1/workspace/a.jpg', base_url: null, edit_state: null, sort_order: 0 };
function srvSlot(extra) {
  return Object.assign({ slot_id: 'slot-A', label: 'A', caption: 'cap', hashtags: '', publish: null, customer_id: null, sort_order: 0, meta: {},
    client_updated_at: '2026-10-01T10:00:00.000Z', server_updated_at: '2026-10-01T10:00:01+00:00', photos: [SRV_PHOTO] }, extra || {});
}

function boot(opts) {
  opts = opts || {};
  const calls = { upserts: [], saved: [], toasts: [] };
  const db = {};
  window.ITDASY_SLOT_SYNC = true;
  window.ITDASY_SLOT_SYNC_COALESCE = true;   // 부팅 pushAll 이 테스트의 pushSlot 과 겹치지 않게
  window.authHeader = () => ({ Authorization: 'Bearer ' + TOKEN });
  window.showToast = (m) => { calls.toasts.push(String(m)); };
  window.apiFetch = (url, o) => {
    const J = (status, obj) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(obj), text: () => Promise.resolve(JSON.stringify(obj)) });
    if (/\/workspace\/slots\/image/.test(url)) return J(200, { url: 'https://cdn.example/up.jpg' });
    if (/\/workspace\/slots\/upsert/.test(url)) {
      const body = JSON.parse(o.body);
      calls.upserts.push(body);
      return opts.onUpsert(body, J);
    }
    return J(200, { slots: [] });
  };
  window.loadSlotsFromDB = () => Promise.resolve(Object.values(db).map((s) => JSON.parse(JSON.stringify(s))));
  window.saveSlotToDB = (s) => { calls.saved.push(s.id); db[s.id] = JSON.parse(JSON.stringify(s)); return Promise.resolve(); };
  window.deleteSlotFromDB = (id) => { delete db[id]; return Promise.resolve(); };
  // eslint-disable-next-line no-eval
  eval(SRC);
  window.WorkspaceSync.beginEdit();
  const WS = window.WorkspaceSync;
  // 동기화된(사진 1장) 슬롯에서 출발 — _rev/_base 가 있는 상태
  const synced = WS._debug.remoteToLocal(srvSlot());
  return { WS, calls, db, synced };
}
const CLEARED = (J) => J(409, { detail: { reason: 'photos_would_be_cleared', slot: srvSlot() } });

test('🔴 (a) 사진을 전부 뺀 글: 409 photos_would_be_cleared 를 받으면 clear_photos:true 로 1회만 다시 보내고 synced 가 된다', async () => {
  const { WS, calls, synced } = boot({ onUpsert: (body, J) => (!body.photos.length && !body.clear_photos) ? CLEARED(J) : J(200, { ok: true, slot: Object.assign(srvSlot(), { photos: [], server_updated_at: '2026-10-01T10:05:00+00:00' }) }) });
  synced.photos = []; synced.caption = 'cap edited'; synced.syncState = 'dirty';
  await window.saveSlotToDB(synced);
  await WS._debug.pushSlot(synced);
  expect(calls.upserts.length).toBe(2);
  expect(calls.upserts[0].clear_photos).toBeUndefined();   // 첫 전송은 평소대로(서버가 마지막 방어선)
  expect(calls.upserts[1].clear_photos).toBe(true);
  expect(calls.upserts[1].photos).toEqual([]);
  expect(calls.upserts[1].caption).toBe('cap edited');
  expect(synced.syncState).toBe('synced');
  expect(synced._rev).toBe('2026-10-01T10:05:00+00:00');
  // 충돌 사본을 만들지 않는다
  expect(calls.saved.filter((id) => /_conflict_/.test(id))).toEqual([]);
  expect(WS.heldCount()).toBe(0);
});

test('(a-2) clear_photos 재전송은 1회뿐 — 그래도 409 면 무한 반복하지 않고 라운드 실패로 센다', async () => {
  const { WS, calls, synced } = boot({ onUpsert: (body, J) => CLEARED(J) });
  synced.photos = []; synced.syncState = 'dirty';
  await window.saveSlotToDB(synced);
  await WS._debug.pushSlot(synced);
  expect(calls.upserts.length).toBe(2);
  expect(synced.syncState).toBe('dirty');
  expect(calls.saved.filter((id) => /_conflict_/.test(id))).toEqual([]);
});

test('🔴 (b) 로컬에 사진 항목은 있는데 실을 이미지가 없으면 clear 를 보내지 않고 서버본 사진으로 되살려 다시 올린다', async () => {
  const { WS, calls, synced } = boot({ onUpsert: (body, J) => (!body.photos.length && !body.clear_photos) ? CLEARED(J) : J(200, { ok: true, slot: Object.assign(srvSlot(), { server_updated_at: '2026-10-01T10:06:00+00:00' }) }) });
  // dataUrl 이 통째로 사라진 사진(IDB 손상·옛 버전 저장본) — payload 엔 사진이 하나도 안 실린다
  synced.photos = [{ id: 'p1', role: 'hero' }]; synced.syncState = 'dirty';
  await window.saveSlotToDB(synced);
  await WS._debug.pushSlot(synced);
  expect(calls.upserts.some((b) => b.clear_photos)).toBe(false);
  expect(calls.upserts.length).toBe(2);
  expect(calls.upserts[1].photos.map((p) => p.image_url)).toEqual([SRV_PHOTO.image_url]);
  expect(synced.photos.map((p) => p.editedDataUrl)).toEqual([SRV_PHOTO.image_url]);
  expect(synced.syncState).toBe('synced');
  expect(calls.saved.filter((id) => /_conflict_/.test(id))).toEqual([]);
  expect(calls.toasts.some((t) => /되살렸어요/.test(t))).toBe(true);
});

test('(c) reason "conflict" 는 기존 3-way 병합 그대로(병합본 dirty 저장, clear_photos 없음)', async () => {
  const remote = srvSlot({ caption: 'cap from other device', server_updated_at: '2026-10-01T10:07:00+00:00' });
  const { WS, calls, synced, db } = boot({ onUpsert: (body, J) => J(409, { detail: { reason: 'conflict', slot: remote } }) });
  synced.label = 'A renamed'; synced.syncState = 'dirty';   // 나는 라벨만, 상대는 캡션만 → 자동 병합
  await window.saveSlotToDB(synced);
  await WS._debug.pushSlot(synced);
  expect(calls.upserts.length).toBe(1);
  expect(calls.upserts.some((b) => b.clear_photos)).toBe(false);
  const merged = db['slot-A'];
  expect(merged.caption).toBe('cap from other device');
  expect(merged.label).toBe('A renamed');
  expect(merged.syncState).toBe('dirty');
  expect(merged._rev).toBe('2026-10-01T10:07:00+00:00');
});
