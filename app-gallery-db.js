/* exported saveToGallery, loadGalleryItems, loadGalleryItemsByCustomer, deleteGalleryItem, saveSlotToDB, loadSlotsFromDB, deleteSlotFromDB */
// ── 갤러리 IndexedDB 레이어 ────────────────────────────────────
// openGalleryDB / saveToGallery / loadGalleryItems / deleteGalleryItem
// saveSlotToDB / loadSlotsFromDB / deleteSlotFromDB
// _uid() 는 app-gallery-utils.js 에서 제공 (먼저 로드 필수)
// ─────────────────────────────────────────────────────────────

const _GDB_NAME    = 'itdasy-gallery';
const _GDB_STORE   = 'slots';
const _GALLERY_STORE = 'gallery';
// [T6 2026-08-17] v4 — assets: 작업기억 스티커/이미지 참조화. 8KB 초과 dataURL 을 기억이
//   조용히 버리던 버그(G2) 수정용 — 바이트는 여기 한 벌, 기억엔 assetRef 만.
const _ASSET_STORE = 'assets';
let _gdb = null;

function openGalleryDB() {
  return new Promise((resolve, reject) => {
    if (_gdb) return resolve(_gdb);
    // [T-002 2026-05-29] v3 — gallery 항목에 customer_id 연결 (사진↔고객 이력).
    // [T6 2026-08-17] v4 — assets store 추가. 기존 v3 마이그레이션 로직은 그대로 보존
    //   (onupgradeneeded 는 구버전→4 직행도 처리해야 하므로 아래 분기 전부 유지).
    const req = indexedDB.open(_GDB_NAME, 4);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      const tx = e.target.transaction;
      if (!db.objectStoreNames.contains(_GDB_STORE)) {
        const store = db.createObjectStore(_GDB_STORE, { keyPath: 'id' });
        store.createIndex('order', 'order', { unique: false });
      }
      let gs;
      if (!db.objectStoreNames.contains(_GALLERY_STORE)) {
        gs = db.createObjectStore(_GALLERY_STORE, { keyPath: 'id' });
        gs.createIndex('date', 'date', { unique: false });
      } else {
        gs = tx.objectStore(_GALLERY_STORE);
      }
      // v2→v3 마이그레이션: customer_id 인덱스 추가. 기존 항목은 키 없어 인덱스서 스킵(데이터 보존).
      if (!gs.indexNames.contains('customer_id')) {
        gs.createIndex('customer_id', 'customer_id', { unique: false });
      }
      // v3→v4: assets 신설 — 기존 store 는 건드리지 않는다(데이터 보존).
      if (!db.objectStoreNames.contains(_ASSET_STORE)) {
        db.createObjectStore(_ASSET_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = e => {
      _gdb = e.target.result;
      // [T7 실측 2026-08-17] 멀티탭 데드락 방지 — 다른 탭이 계정 전환 purge(deleteDatabase)나
      //   버전 업그레이드를 걸면, 이 연결이 안 닫히는 한 그 요청이 영구 blocked 되고 그 뒤에
      //   줄선 모든 open(발행 가드·자산 웜업·갤러리)이 같이 얼어붙는다(실측: 발행 버튼 영구 '올리는 중…').
      //   versionchange 를 받으면 즉시 양보하고, 다음 사용 때 openGalleryDB 가 재연결한다.
      _gdb.onversionchange = () => { try { _gdb.close(); } catch (_) { void 0; } _gdb = null; };
      resolve(_gdb);
    };
    req.onerror   = () => reject(req.error);
  });
}

// ── [T6] 자산 CRUD — { id: 'img:<hash>', dataUrl, createdAt } ──────────────
async function saveAssetToDB(asset) {
  const db = await openGalleryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(_ASSET_STORE, 'readwrite');
    tx.objectStore(_ASSET_STORE).put(asset);
    tx.oncomplete = () => resolve(asset.id);
    tx.onerror    = () => reject(tx.error);
  });
}
async function getAssetFromDB(id) {
  const db = await openGalleryDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(_ASSET_STORE, 'readonly').objectStore(_ASSET_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror   = () => reject(req.error);
  });
}
async function loadAssetsFromDB() {
  const db = await openGalleryDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(_ASSET_STORE, 'readonly').objectStore(_ASSET_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}

async function saveToGallery(slot) {
  const db = await openGalleryDB();
  const item = {
    id: _uid(),
    slotId: slot.id,
    date: new Date().toISOString().slice(0, 10),
    label: slot.label,
    photos: slot.photos.map(p => ({ id: p.id, dataUrl: p.editedDataUrl || p.dataUrl, mode: p.mode })),
    caption: slot.caption || '',
    hashtags: slot.hashtags || '',
    // [T-002 2026-05-29] 고객 연결 — 없으면 null (IndexedDB 인덱스서 스킵).
    customer_id: slot.customer_id != null ? slot.customer_id : null,
    customer_name: slot.customer_name || '',
    // [T-107 2026-05-30] 중복 첨부 방지 키 + 출처(assistant/photoeditor_attach/unknown).
    dedupeKey: slot.dedupeKey || null,
    source: slot.source || (slot.dedupeKey ? 'unknown' : undefined),
    savedAt: Date.now(),
    updatedAt: Date.now(),
  };
  // [T-107] dedupeKey 가 있고 같은 키 항목이 이미 있으면 새로 추가하지 않고 기존 항목 갱신
  //   → 고객 타임라인 중복 썸네일 방지. 조회 실패해도(아래 catch) 저장은 그대로 진행(사진 보존 우선).
  if (item.dedupeKey) {
    try {
      const existing = await _findGalleryByDedupeKey(item.dedupeKey);
      if (existing) {
        item.id = existing.id;                              // 같은 id → put 이 갱신
        item.savedAt = existing.savedAt || item.savedAt;    // 최초 생성시각 보존
        item.updatedAt = Date.now();
      }
    } catch (_e) { void 0; }
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(_GALLERY_STORE, 'readwrite');
    tx.objectStore(_GALLERY_STORE).put(item);
    tx.oncomplete = () => resolve(item);
    tx.onerror    = () => reject(tx.error);
  });
}

async function loadGalleryItems() {
  const db = await openGalleryDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(_GALLERY_STORE, 'readonly');
    const req = tx.objectStore(_GALLERY_STORE).getAll();
    req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.savedAt - a.savedAt));
    req.onerror   = () => reject(req.error);
  });
}

// [T-002/T-005 2026-05-29] 특정 고객에 연결된 갤러리 사진 (최신순). 대시보드 타임라인용.
//   number/string customer_id 혼용 방지 위해 전체 로드 후 느슨 매칭 (갤러리는 사용자당 소량).
async function loadGalleryItemsByCustomer(customerId) {
  if (customerId == null || customerId === '') return [];
  const all = await loadGalleryItems();
  const key = String(customerId);
  return all.filter(it => it && it.customer_id != null && String(it.customer_id) === key);
}

// [T-107 2026-05-30] dedupeKey 로 기존 갤러리 항목 찾기 (중복 첨부 방지). 없으면 null.
async function _findGalleryByDedupeKey(key) {
  if (!key) return null;
  const all = await loadGalleryItems();
  // 가장 최근(savedAt desc 정렬됨) 것 우선.
  return all.find(it => it && it.dedupeKey === key) || null;
}

async function deleteGalleryItem(id) {
  const db = await openGalleryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(_GALLERY_STORE, 'readwrite');
    tx.objectStore(_GALLERY_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

async function saveSlotToDB(slot) {
  const db = await openGalleryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(_GDB_STORE, 'readwrite');
    tx.objectStore(_GDB_STORE).put(slot);
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

async function loadSlotsFromDB() {
  const db = await openGalleryDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(_GDB_STORE, 'readonly');
    const req = tx.objectStore(_GDB_STORE).getAll();
    // [2026-06-11 B7] 오름차순(옛것 위) → 내림차순: 방금 저장한 카드가 작업실 맨 위에 보이게
    req.onsuccess = () => resolve((req.result || []).sort((a, b) => (b.order || 0) - (a.order || 0)));
    req.onerror   = () => reject(req.error);
  });
}

async function deleteSlotFromDB(id) {
  const db = await openGalleryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(_GDB_STORE, 'readwrite');
    tx.objectStore(_GDB_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

// [2026-04-26] 계정 격리 — 로그아웃·계정 전환 시 갤러리 IndexedDB 전체 폐기.
// 이전 사용자의 작업실 사진이 다음 사용자에게 노출되는 누수 방지 (메타 심사 대응).
async function clearGalleryDB() {
  try {
    if (_gdb) { try { _gdb.close(); } catch (_) { void 0; } _gdb = null; }
    return await new Promise((resolve) => {
      try {
        const req = indexedDB.deleteDatabase(_GDB_NAME);
        req.onsuccess = () => resolve(true);
        req.onerror   = () => resolve(false);
        req.onblocked = () => resolve(false);
      } catch (_) { resolve(false); }
    });
  } catch (_) { return false; }
}
window.clearGalleryDB = clearGalleryDB;
window.saveAssetToDB = saveAssetToDB;
window.getAssetFromDB = getAssetFromDB;
window.loadAssetsFromDB = loadAssetsFromDB;
window.saveToGallery = saveToGallery;
window.loadGalleryItems = loadGalleryItems;
window.loadGalleryItemsByCustomer = loadGalleryItemsByCustomer;
window.deleteGalleryItem = deleteGalleryItem;
window.saveSlotToDB = saveSlotToDB;
window.loadSlotsFromDB = loadSlotsFromDB;
window.deleteSlotFromDB = deleteSlotFromDB;
