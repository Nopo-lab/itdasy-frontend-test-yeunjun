'use strict';

/* M3: 3-way 병합 (2026-07-17)
   폰은 캡션만, 태블릿은 사진만 고쳤는데도 늦게 올라간 쪽이 슬롯을 통째로 덮어써 상대 수정이
   사라지던 버그. base(양쪽이 마지막으로 합의한 버전)를 기준으로 필드별로 판정하면 둘 다 산다.
     local==base  → 내가 안 건드림 → remote
     remote==base → 상대가 안 건드림 → local
     셋 다 다름   → 진짜 충돌(자동으로 못 고름) */

const fs = require('fs');
const path = require('path');

function loadSync() {
  /* 순수 병합 로직만 본다. _debug 는 플래그 ON 일 때만 노출되므로 켜되,
     ready()(=authHeader/apiFetch 필요)가 false 라 실제 동기화·네트워크는 안 돈다.
     boot 재시도 타이머만 도는데 jest 종료를 막지 않게 setTimeout 을 무력화한다. */
  global.window = { ITDASY_SLOT_SYNC: true, addEventListener() {} };
  global.document = { addEventListener() {}, hidden: false };
  global.indexedDB = { open() { return {}; } };
  const realTimeout = global.setTimeout;
  global.setTimeout = () => 0;
  const file = path.join(__dirname, '..', 'workspace-sync.js');
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(file, 'utf8').replace('makeBase: makeBase,', 'makeBase: makeBase, sameBaseSig: sameBaseSig,'));
  global.setTimeout = realTimeout;
  return global.window.WorkspaceSync && global.window.WorkspaceSync._debug;
}

const D = loadSync();
const base0 = {
  label: '글', caption: '원본캡션', hashtags: '#a', customer_id: null, order: 0,
  photos: [{ id: 'p1', role: 'hero' }],
};

describe('merge3 — 서로 다른 필드는 둘 다 산다', () => {
  test('폰=캡션 / 태블릿=사진 → 자동 병합, 손실 0', () => {
    const base = D.makeBase(base0);
    const local = Object.assign({}, base0, { caption: '폰 캡션' });
    const remote = Object.assign({}, base0, { photos: [{ id: 'p1', role: 'hero' }, { id: 'p2', role: 'after' }] });
    const r = D.merge3(base, local, remote);
    expect(r.conflicts).toEqual([]);
    expect(r.slot.caption).toBe('폰 캡션');        // 내 수정 생존
    expect(r.slot.photos.length).toBe(2);          // 상대 수정 생존
  });

  test('내가 안 건드린 필드는 상대 것을 받는다', () => {
    const base = D.makeBase(base0);
    const local = Object.assign({}, base0);                       // 아무것도 안 고침
    const remote = Object.assign({}, base0, { caption: '상대 캡션' });
    const r = D.merge3(base, local, remote);
    expect(r.slot.caption).toBe('상대 캡션');
    expect(r.conflicts).toEqual([]);
  });

  test('상대가 안 건드린 필드는 내 것을 지킨다', () => {
    const base = D.makeBase(base0);
    const local = Object.assign({}, base0, { caption: '내 캡션' });
    const remote = Object.assign({}, base0);
    const r = D.merge3(base, local, remote);
    expect(r.slot.caption).toBe('내 캡션');
    expect(r.conflicts).toEqual([]);
  });

  test('결과가 같으면 충돌 아님(둘이 같은 값으로 고침)', () => {
    const base = D.makeBase(base0);
    const local = Object.assign({}, base0, { caption: '같은값' });
    const remote = Object.assign({}, base0, { caption: '같은값' });
    expect(D.merge3(base, local, remote).conflicts).toEqual([]);
  });
});

describe('merge3 — 진짜 충돌만 사람에게', () => {
  test('둘 다 같은 필드를 다르게 고치면 충돌로 표시', () => {
    const base = D.makeBase(base0);
    const local = Object.assign({}, base0, { caption: '폰' });
    const remote = Object.assign({}, base0, { caption: '태블릿' });
    const r = D.merge3(base, local, remote);
    expect(r.conflicts).toContain('caption');
  });

  test('둘 다 사진을 바꾸면 충돌 — 배열은 필드로 못 쪼갠다', () => {
    const base = D.makeBase(base0);
    const local = Object.assign({}, base0, { photos: [{ id: 'pX', role: 'hero' }] });
    const remote = Object.assign({}, base0, { photos: [{ id: 'pY', role: 'hero' }] });
    expect(D.merge3(base, local, remote).conflicts).toContain('photos');
  });
});

describe('photoSig — blob 없이 변경만 감지', () => {
  test('같은 사진 집합은 같은 서명', () => {
    expect(D.photoSig(base0)).toBe(D.photoSig(Object.assign({}, base0)));
  });
  test('사진이 추가되면 서명이 달라진다', () => {
    const more = Object.assign({}, base0, { photos: base0.photos.concat([{ id: 'p2', role: 'after' }]) });
    expect(D.photoSig(more)).not.toBe(D.photoSig(base0));
  });
  test('사진 없거나 깨져도 안 터진다', () => {
    expect(D.photoSig(null)).toBe('');
    expect(D.photoSig({})).toBe('');
  });
});

describe('makeBase — 서버로 새면 안 되는 순수 로컬 상태', () => {
  test('사진 blob 은 안 담고 서명만(용량 방어)', () => {
    const b = D.makeBase({ caption: 'c', photos: [{ id: 'p1', dataUrl: 'data:image/png;base64,AAAA' }] });
    expect(JSON.stringify(b)).not.toContain('data:image');
    expect(typeof b._sig).toBe('string');
  });
});

describe('JSON object order cannot turn the same photo edit into a conflict', () => {
  const local={photos:[{id:'qa',role:'hero',editState:{photos:['data:image/png;base64,synthetic'],photoBg:{0:{color:'#D58A95',img:null}},adj:[{b:100,c:100,s:100}],layers:[]}}]};
  const remote={photos:[{id:'qa',role:'hero',editState:{layers:[],adj:[{s:100,c:100,b:100}],photoBg:{0:{img:null,color:'#D58A95'}},photos:['https://test.invalid/storage/image.png']}}]};
  test('nested reordered keys and data/cloud image references have one signature',()=>{
    expect(D.photoSig(local)).toBe(D.photoSig(remote));
  });
  test('identical concurrent edits do not create a false photo conflict',()=>{
    const unchanged={photos:[{id:'qa',role:'hero'}]};
    expect(D.merge3(D.makeBase(unchanged),local,remote).conflicts).toEqual([]);
  });
  test('actual color change still requires conflict handling',()=>{
    const changed=JSON.parse(JSON.stringify(remote));changed.photos[0].editState.photoBg[0].color='#000000';
    expect(D.photoSig(local)).not.toBe(D.photoSig(changed));
  });
});

describe('existing v2 bases and pending pushes survive the v3 transition',()=>{
  // Measured with the actual pre-change origin/main implementation (8af0b30).
  const oldBase={_sig:'v2:qa:hero:113.15gcre'};
  const oldPhoto={photos:[{id:'qa',role:'hero',editState:{photos:['data:image/png;base64,synthetic'],photoBg:{0:{color:'#D58A95',img:null}},adj:[{b:100,c:100,s:100}],layers:[]}}]};
  function changed(color){const x=JSON.parse(JSON.stringify(oldPhoto));x.photos[0].editState.photoBg[0].color=color;return x;}
  test('remote-only photo edit against an old base does not become two-sided conflict',()=>{
    const newer=changed('#000000');const r=D.merge3(oldBase,oldPhoto,newer);expect(r.conflicts).toEqual([]);expect(r.slot.photos).toEqual(newer.photos);
  });
  test('local-only photo edit against an old base retains the local edit',()=>{
    const newer=changed('#FFFFFF');const r=D.merge3(oldBase,newer,oldPhoto);expect(r.conflicts).toEqual([]);expect(r.slot.photos).toEqual(newer.photos);
  });
  test('old pending push matches the unchanged newly received state',()=>{
    expect(D.sameBaseSig(oldBase,D.makeBase(oldPhoto))).toBe(true);expect(D.sameBaseSig(D.makeBase(oldPhoto),oldBase)).toBe(true);
  });
  test('actual competing edits and changed pending payload stay distinct',()=>{
    expect(D.merge3(oldBase,changed('#000000'),changed('#FFFFFF')).conflicts).toEqual(['photos']);
    expect(D.sameBaseSig(oldBase,D.makeBase(changed('#000000')))).toBe(false);
  });
});
