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

describe('갤러리 DB v4 — 소스 계약(실 업그레이드는 브라우저 실측)', () => {
  const dbSrc = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'app-gallery-db.js'), 'utf8');
  test('버전 4 + assets store 신설 + 기존 store(slots·gallery) 로직 보존', () => {
    expect(dbSrc).toMatch(/indexedDB\.open\(_GDB_NAME, 4\)/);
    expect(dbSrc).toMatch(/_ASSET_STORE/);
    expect(dbSrc).toMatch(/createObjectStore\(_ASSET_STORE/);
    expect(dbSrc).toMatch(/contains\(_GDB_STORE\)/);           // v3 마이그레이션 로직 그대로
    expect(dbSrc).toMatch(/customer_id/);
    expect(dbSrc).toMatch(/window\.saveAssetToDB/);
    expect(dbSrc).toMatch(/window\.loadAssetsFromDB/);
  });
});
