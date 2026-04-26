// ── 갤러리 IndexedDB 레이어 ────────────────────────────────────
// openGalleryDB / saveToGallery / loadGalleryItems / deleteGalleryItem
// saveSlotToDB / loadSlotsFromDB / deleteSlotFromDB
// _uid() 는 app-gallery-utils.js 에서 제공 (먼저 로드 필수)
// ─────────────────────────────────────────────────────────────

const _GDB_NAME    = 'itdasy-gallery';
const _GDB_STORE   = 'slots';
const _GALLERY_STORE = 'gallery';
let _gdb = null;

function openGalleryDB() {
  return new Promise((resolve, reject) => {
    if (_gdb) return resolve(_gdb);
    const req = indexedDB.open(_GDB_NAME, 2);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(_GDB_STORE)) {
        const store = db.createObjectStore(_GDB_STORE, { keyPath: 'id' });
        store.createIndex('order', 'order', { unique: false });
      }
      if (!db.objectStoreNames.contains(_GALLERY_STORE)) {
        const gs = db.createObjectStore(_GALLERY_STORE, { keyPath: 'id' });
        gs.createIndex('date', 'date', { unique: false });
      }
    };
    req.onsuccess = e => { _gdb = e.target.result; resolve(_gdb); };
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
    savedAt: Date.now(),
  };
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
    req.onsuccess = () => resolve((req.result || []).sort((a, b) => a.order - b.order));
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
    if (_gdb) { try { _gdb.close(); } catch (_) {} _gdb = null; }
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
