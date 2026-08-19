'use strict';

/* T6 골든 — 8KB 초과 이미지(내 스티커)의 IDB 자산 참조화 (2026-08-17). 구현보다 먼저 작성.

   고치는 버그(G2): 8KB 초과 dataURL 이미지 레이어를 캡처가 **조용히 버려서**(return null)
   원장은 스티커가 기억된 줄 아는데 다음 글엔 없었다.
   설계: 기억엔 assetRef('img:<콘텐츠해시>')만 담고, 실제 바이트는 IDB(itdasy-gallery v4 'assets')
   한 벌 + 메모리 캐시. 같은 스티커 = 같은 해시 = 자산 1벌(기억 10개가 공유).
   toEditState(동기)는 캐시에서 꺼낸다 — 캐시 미적재/유실이면 그 레이어만 뺀다(깨진 이미지 방지).
   ⚠️ node jest 엔 IndexedDB 가 없다 → IDB CRUD 는 가짜(window.saveAssetToDB 등)로 계약을 잠그고,
   실제 v3→v4 업그레이드(기존 slots/gallery 보존)는 브라우저 실측으로 검증한다. */

const fs = require('fs');
const path = require('path');

function loadAll(withStore) {
  global.window = {};
  global.window.ITDASY_WORK_MEMORY = true;
  global.location = { search: '' };
  global.localStorage = {
    _m: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._m, k) ? this._m[k] : null; },
    setItem(k, v) { this._m[k] = String(v); },
    removeItem(k) { delete this._m[k]; },
  };
  const store = new Map();
  if (withStore !== false) {
    global.window.saveAssetToDB = async (a) => { store.set(a.id, a); return a.id; };
    global.window.getAssetFromDB = async (id) => store.get(id) || null;
    global.window.loadAssetsFromDB = async () => [...store.values()];
  }
  for (const f of ['work-memory.js', 'work-memory-engine.js']) {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
  }
  return { WM: global.window.WorkMemory, E: global.window.WorkMemoryEngine, store };
}
const tick = () => new Promise((r) => setTimeout(r, 0));   // fire-and-forget IDB 쓰기 플러시
function bigSrc(n, seed) { return 'data:image/png;base64,' + (seed || 'A').repeat(n - 22); }   // 총 길이 n
function slotWith(layers) {
  return { id: 's' + Math.random(), service: '젤',
    photos: [{ editState: { v: 1, layoutIdx: 0, ratio: '4:5', layoutOrder: [], cellCrop: [], adj: [], photoDraw: {}, photoBg: {}, photos: ['x'], layers } }] };
}
const img = (src, x) => ({ type: 'image', src, x: x || 0.5, y: 0.5, w: 0.2 });

describe('[경계] 8KB — INLINE_MAX 전후', () => {
  test('정확히 8192자는 인라인 유지, 8193자는 assetRef 로', async () => {
    const { WM, store } = loadAll();
    const small = bigSrc(8192), big = bigSrc(8193);
    const rec = WM.captureFromSlot(slotWith([img(small, 0.2), img(big, 0.8)]), {});
    await tick();
    const inline = rec.layers.find((l) => l.src === small);
    const reffed = rec.layers.find((l) => l.assetRef);
    expect(inline).toBeTruthy();                              // 8KB 이하 = 그대로(자산 저장 안 함)
    expect(inline.assetRef).toBeUndefined();
    expect(reffed).toBeTruthy();                              // 초과 = 참조 + 바이트 제거
    expect(reffed.src).toBeUndefined();
    expect(store.size).toBe(1);
    expect([...store.values()][0].dataUrl).toBe(big);
  });
});

describe('[G2] 캡처 → 적용 왕복 — 더는 조용히 사라지지 않는다', () => {
  test('>8KB 스티커가 기억되고 다음 적용에서 src 로 복원된다', async () => {
    const { WM, E } = loadAll();
    const big = bigSrc(20000);
    const rec = WM.captureFromSlot(slotWith([img(big), { type: 'sticker', emoji: '✨', x: 0.2, y: 0.2, size: 0.1 }]), {});
    await tick();
    expect(rec.layers.some((l) => l.assetRef)).toBe(true);
    const st = E.forEditor({ restore: false, incoming: [], photoCount: 1, layersOnly: true });
    const imgL = st.layers.find((l) => l.type === 'image');
    expect(imgL).toBeTruthy();
    expect(imgL.src).toBe(big);                               // 캐시에서 복원
    expect(imgL.assetRef).toBeUndefined();                    // 편집기엔 실 src 로
  });
  test('같은 이미지 재캡처 = 같은 자산 id(콘텐츠 해시) — 한 벌만 저장', async () => {
    const { WM, store } = loadAll();
    const big = bigSrc(9000);
    const r1 = WM.captureFromSlot(slotWith([img(big, 0.2)]), {});
    const r2 = WM.captureFromSlot(slotWith([img(big, 0.8)]), {});   // 다른 배치 = 다른 기억
    await tick();
    expect(r1.id).not.toBe(r2.id);
    expect(r1.layers.find((l) => l.assetRef).assetRef).toBe(r2.layers.find((l) => l.assetRef).assetRef);
    expect(store.size).toBe(1);
  });
  test('내용이 다르면 다른 자산 id', async () => {
    const { WM, store } = loadAll();
    WM.captureFromSlot(slotWith([img(bigSrc(9000, 'A'))]), {});
    WM.captureFromSlot(slotWith([img(bigSrc(9000, 'B'), 0.8)]), {});
    await tick();
    expect(store.size).toBe(2);
  });
});

describe('[안전] 자산 유실·스토어 부재', () => {
  test('자산이 캐시·DB 에 없으면 그 레이어만 빠지고 나머지는 산다', () => {
    const { WM, E } = loadAll();
    const NOW = Date.now();
    global.localStorage._m['itdasy:work_memory:list'] = JSON.stringify([{
      id: 'm1', schema: 2, sig: 'x', name: 'x', createdAt: NOW, thumb: null,
      ratio: '4:5', layoutIdx: 0, photoCount: 1, layoutOrder: [], collageBg: null, collageGap: null, fitMode: null,
      layers: [{ type: 'image', assetRef: 'img:ghost', x: 0.5, y: 0.5, w: 0.2 }, { type: 'sticker', emoji: '✨', x: 0.2, y: 0.2, size: 0.1 }],
      shopStyleId: null, kind: 'unknown', applyCount: 0, lastAppliedAt: 0, publishCount: 1, lastPublishedAt: NOW,
    }]);
    global.localStorage._m['itdasy:work_memory:default'] = JSON.stringify('m1');
    const st = E.forEditor({ restore: false, incoming: [], photoCount: 1, layersOnly: true });
    expect(st).toBeTruthy();
    expect(st.layers.some((l) => l.assetRef || l.type === 'image')).toBe(false);   // 유령 참조 제외
    expect(st.layers.some((l) => l.emoji === '✨')).toBe(true);
    void WM;
  });
  test('IDB API 자체가 없어도(옛 gallery-db 캐시) 캡처가 안 죽는다 — 세션 캐시로 동작', async () => {
    const { WM, E } = loadAll(false);                          // saveAssetToDB 등 미정의
    const big = bigSrc(9000);
    const rec = WM.captureFromSlot(slotWith([img(big)]), {});
    expect(rec).toBeTruthy();
    expect(rec.layers.some((l) => l.assetRef)).toBe(true);
    const st = E.forEditor({ restore: false, incoming: [], photoCount: 1, layersOnly: true });
    expect(st.layers.find((l) => l.type === 'image').src).toBe(big);   // 같은 세션 = 메모리 캐시로 복원
  });
});

describe('[T7 preflight] 발행물 굽기 — 자산 미해소면 통째 보류(조용히 일부 빠진 발행 금지)', () => {
  function seedGhost() {
    const NOW = Date.now();
    global.localStorage._m['itdasy:work_memory:list'] = JSON.stringify([{
      id: 'm1', schema: 2, sig: 'x', name: 'x', createdAt: NOW, thumb: null,
      ratio: '4:5', layoutIdx: 0, photoCount: 1, layoutOrder: [], collageBg: null, collageGap: null, fitMode: null,
      layers: [{ type: 'image', assetRef: 'img:ghost', x: 0.5, y: 0.5, w: 0.2 }, { type: 'sticker', emoji: '✨', x: 0.2, y: 0.2, size: 0.1 }],
      shopStyleId: null, kind: 'unknown', applyCount: 0, lastAppliedAt: 0, publishCount: 1, lastPublishedAt: NOW,
    }]);
    global.localStorage._m['itdasy:work_memory:default'] = JSON.stringify('m1');
  }
  test('헤드리스(decorateLayers)는 미해소 시 base 그대로 — 스티커만 얹고 굽는 부분 발행이 없다', () => {
    const { E } = loadAll();
    seedGhost();
    const base = [{ role: 'title', text: '이번 글', type: 'text' }];
    const out = E.decorateLayers(base, { photoCount: 1 });
    expect(out).toBe(base);                                    // 보류 = 아무것도 안 얹음(부분 굽기 금지)
  });
  test('자산이 해소되면(웜업 완료 상당) 같은 호출이 정상 반영된다 — 보류는 일시적', async () => {
    const { WM, E, store } = loadAll();
    seedGhost();
    await window.saveAssetToDB({ id: 'img:ghost', dataUrl: bigSrc(9000), createdAt: Date.now() });
    // 웜업 재시도 경로: 미적재 상태에서 한 번 실패 → warm → 다음 호출은 캐시 적중
    E.decorateLayers([], { photoCount: 1 });
    await tick(); await tick();
    const out = E.decorateLayers([], { photoCount: 1 });
    expect(out.some((l) => l.type === 'image' && l.src)).toBe(true);
    expect(out.some((l) => l.emoji === '✨')).toBe(true);
    void WM; void store;
  });
  test('편집기(forEditor)는 기존 fallback 유지 — 원장이 보는 단계라 그 레이어만 제외(합의 경계)', () => {
    const { E } = loadAll();
    seedGhost();
    const st = E.forEditor({ restore: false, incoming: [], photoCount: 1, layersOnly: true });
    expect(st).toBeTruthy();
    expect(st.layers.some((l) => l.emoji === '✨')).toBe(true);
    expect(st.layers.some((l) => l.type === 'image')).toBe(false);
  });
});

describe('[T7] 발행 이벤트 경계 — 중복·실패 계약', () => {
  test('같은 슬롯으로 captureAndNotify 상당(captureFromSlot) 2연발 → 레코드 중복 생성 없음(sig dedup)', () => {
    const { WM } = loadAll();
    const s = slotWith([img(bigSrc(9000)), { type: 'sticker', emoji: '✨', x: 0.2, y: 0.2, size: 0.1 }]);
    const r1 = WM.captureFromSlot(s, {});
    const r2 = WM.captureFromSlot(s, {});   // 중복 콜백 상당
    expect(r2.id).toBe(r1.id);
    expect(WM.list()).toHaveLength(1);
  });
  test('flow 소스 계약 — captureAndNotify 는 저장/발행 성공 경로에만 있고 실패 분기엔 없다', () => {
    const flowSrc = fs.readFileSync(path.join(__dirname, '..', 'workspace-v2-flow.js'), 'utf8');
    // 호출 3곳(save 성공 done·수동 발행 표시·실발행 완료)이 전부 — 그 외 추가 호출이 생기면 이 수가 어긋난다.
    expect(flowSrc.match(/WorkMemory\.captureAndNotify\(/g)).toHaveLength(3);
    // 발행 실패 토스트/에러 분기에서 capture 를 부르지 않는다(실패를 '발행 완료'로 기억하는 사고 방지).
    expect(flowSrc).not.toMatch(/저장에 실패했어요[\s\S]{0,200}captureAndNotify/);
  });
});

describe('갤러리 DB v4 — 소스 계약(실 업그레이드는 브라우저 실측)', () => {
  const dbSrc = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'app-gallery-db.js'), 'utf8');
  test('[T7 실측] 멀티탭 데드락 방지 — 연결이 versionchange 에 양보한다', () => {
    // 다른 탭의 계정 전환 purge(deleteDatabase)가 이 연결에 blocked 되면 발행·저장·갤러리가
    // 통째로 영구 hang(실발행 E2E 에서 실제 발생). 연결은 versionchange 시 즉시 닫혀야 한다.
    expect(dbSrc).toMatch(/_gdb\.onversionchange/);
    expect(dbSrc).toMatch(/onversionchange[\s\S]{0,80}_gdb\.close\(\)/);
  });
  test('[T7 실측] 발행 가드의 로컬 슬롯 조회는 3초 타임아웃 — IDB 가 잠겨도 발행이 영구 hang 안 됨', () => {
    const flowSrc = fs.readFileSync(path.join(__dirname, '..', 'workspace-v2-flow.js'), 'utf8');
    expect(flowSrc).toMatch(/_local = Promise\.race\(\[/);
    expect(flowSrc).toMatch(/setTimeout\(function \(\) \{ res\(null\); \}, 3000\)/);
  });
  test('버전 4 + assets store 신설 + 기존 store(slots·gallery) 로직 보존', () => {
    /* [migration note 2026-08-19 · T8-B] 버전 리터럴 4 → **>=4** 로 완화.
       T8-B 가 학습 store 3종을 위해 v5 로 올렸다. T6 계약의 본질은 "assets store 가 있고
       v3 마이그레이션이 보존된다"이지 "버전이 영원히 4"가 아니다 — 아래 보존 검증은 그대로 둔다. */
    expect(dbSrc).toMatch(/indexedDB\.open\(_GDB_NAME, ([4-9]|\d{2,})\)/);
    expect(dbSrc).toMatch(/_ASSET_STORE/);
    expect(dbSrc).toMatch(/createObjectStore\(_ASSET_STORE/);
    expect(dbSrc).toMatch(/contains\(_GDB_STORE\)/);           // v3 마이그레이션 로직 그대로
    expect(dbSrc).toMatch(/customer_id/);
    expect(dbSrc).toMatch(/window\.saveAssetToDB/);
    expect(dbSrc).toMatch(/window\.loadAssetsFromDB/);
  });
});
