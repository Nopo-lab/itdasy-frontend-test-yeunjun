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
// [T8-B 2026-08-19] v5 — 개인화 학습 저장소. 기존 3 store 는 손대지 않는다(T1~T7 무변경).
//   격리는 DB 삭제(_purgeUserScopedDB)에만 의존하지 않고 레코드마다 tenantId + read/write 검증
//   (work-memory-store.js). 여기선 순수 CRUD 만 제공한다.
const _LEARN_STORES = ['preferences', 'learning_signals', 'preference_versions'];
// [Phase 1 2026-08-21] v6 — 사진 문맥 캐시(js/photo/photo-context.js). 같은 사진을 편집기 재진입·
//   undo·발행 재시도마다 다시 분석하지 않으려는 것이 전부다. 레코드는 **숫자·라벨만**
//   (원본 바이트·EXIF·임베딩 없음). tenantId 인덱스를 안 만드는 이유: photoHash 는 픽셀 파생이라
//   계정 식별성이 없고, 계정 전환 시 DB 통째 purge 경로가 이미 있다.
const _PCTX_STORE = 'photo_contexts';
/* [2026-09-03 IDB-1] v7 — 인스타 텍스트 스타일 분석 캐시.
   **이 store 가 없는 채로 쓰는 코드가 이미 배포돼 있었다.** 실측(배포본 daef812, 실브라우저):

       NotFoundError: Failed to execute 'transaction' on 'IDBDatabase':
                      One of the specified object stores was not found.
         @ app-gallery-db.js:232 (wmLearnPut)   — 한 화면에서 10회+ 반복, uncaught rejection

   `js/photo/instagram-text-style.js:34` 이 `IDB_STORE = 'ig_text_analysis'` 로 읽고 쓰는데
   업그레이드 경로에 그 store 가 없었다. 그래서 **인스타 텍스트 스타일은 한 번도 저장된 적이 없다** —
   T8 학습이 v4 라서 0 이던 것과 똑같은 실패다(그때 이 가드를 만든 이유이기도 하다).
   조용한 실패가 아니라 콘솔로 터져 나왔는데도 안 잡힌 건, 가드가 '선언한 store 가 생성되나' 만
   보고 '쓰는 store 가 선언됐나' 는 안 봤기 때문이다 → 가드도 같이 고쳤다. */
const _IGTEXT_STORE = 'ig_text_analysis';
let _gdb = null;
/* open 이 pending 으로 남을 때 포기하는 시각. 너무 짧으면 느린 기기에서 헛되이 실패하고,
   너무 길면 사용자가 빈 화면을 그만큼 오래 본다. 에뮬레이터 실측(정상 open 은 수십 ms)과
   저사양 실기기 여유를 함께 보고 6초. */
const OPEN_GDB_TIMEOUT_MS = 6000;

/* ── [2026-09-03 P0 계정 격리] 이 DB 가 **누구 것인지** 도장 ──────────────────
   왜 필요한가 — 실측으로 확인한 교차 노출 경로:
     ① 로그아웃(또는 계정 전환)이 `clearGalleryDB()` 를 부르지만, 다른 탭이 연결을 붙잡고 있으면
        `deleteDatabase` 는 success·error·blocked 를 **하나도 안 내고** pending 으로 남는다
        (이 파일 236행 주석의 실측). 호출부는 3초 타임아웃으로 넘어가고 **실패를 삼킨다.**
     ② `_purgeUserScopedStorage()` 가 `last_user_id`(계정 전환 감지 기준)를 **지운다.**
        그 삭제가 requestIdleCallback 이라 `applyNewSession` 이 방금 쓴 값보다 늦게 도착하면 null 이 된다
        (실측: 전환 직후 'USER_B' → 2.5초 뒤 null).
     ③ 그러면 다음 로그인에서 `prevUserId === null` → 전환 조건이 거짓 → **purge 를 아예 안 한다.**
   실측 결과: USER_C 로 로그인했는데 USER_B 의 초안(고객명 '박서연'·시술·사진)이 그대로 보였다.
   고객 개인정보 교차 노출이라 '삭제가 best-effort' 로 끝낼 수 없다.

   그래서 삭제 성공에만 의존하지 않고 **읽기 관문에서 소유자를 확인**한다.
   이미 T8 학습 store 는 레코드마다 tenantId 를 검증한다(파일 상단 주석) — 정작 사진·고객명이 들어있는
   slots/gallery 만 DB 삭제 하나에 기대고 있었다. 그 불일치를 없앤다.
   도장은 purge 대상 밖(itdasy_ 접두어 아님·KEEP 등록)이라 스토리지 청소에 안 지워진다. */
const _GDB_OWNER_KEY = 'itdasy_gdb_owner';
function _gdbCurrentUser() {
  try { const v = localStorage.getItem('last_user_id'); return v ? String(v) : null; } catch (_) { return null; }
}
function _gdbOwner() {
  try { const v = localStorage.getItem(_GDB_OWNER_KEY); return v ? String(v) : null; } catch (_) { return null; }
}
function _gdbSetOwner(uid) {
  try { if (uid) localStorage.setItem(_GDB_OWNER_KEY, String(uid)); else localStorage.removeItem(_GDB_OWNER_KEY); } catch (_) { void 0; }
}
window._gdbOwner = _gdbOwner;
window._gdbSetOwner = _gdbSetOwner;
window._GDB_OWNER_KEY = _GDB_OWNER_KEY;

function openGalleryDB() {
  return new Promise((resolve, reject) => {
    if (_gdb) return resolve(_gdb);
    /* 소유자 확인 — 도장이 없으면(첫 사용·기존 설치) 현재 사용자로 찍고 통과(하위호환).
       도장이 있고 다르면 앞선 purge 가 실패한 것이다 → 한 번 더 지워보고, 그래도 안 되면 **열지 않는다.**
       여기서 통과시키면 남의 고객 정보를 화면에 그린다. 기능 정지가 정보 유출보다 낫다. */
    const _cur = _gdbCurrentUser(), _own = _gdbOwner();
    if (_cur && _own && _own !== _cur) {
      clearGalleryDB().then((ok) => {
        if (!ok) {
          try { if (window.showToast) window.showToast('이전 계정 데이터를 정리하지 못했어요 — 다른 탭을 모두 닫고 새로고침해 주세요'); } catch (_) { void 0; }
          reject(new Error('gdb_owner_mismatch'));
          return;
        }
        _gdbSetOwner(_cur);
        openGalleryDB().then(resolve, reject);
      }, () => reject(new Error('gdb_owner_mismatch')));
      return;
    }
    if (_cur && !_own) _gdbSetOwner(_cur);
    // [T-002 2026-05-29] v3 — gallery 항목에 customer_id 연결 (사진↔고객 이력).
    // [T6 2026-08-17] v4 — assets store 추가. 기존 v3 마이그레이션 로직은 그대로 보존
    //   (onupgradeneeded 는 구버전→4 직행도 처리해야 하므로 아래 분기 전부 유지).
    const req = indexedDB.open(_GDB_NAME, 7);
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
      // v4→v5 [T8-B]: 학습 store 3종 신설. 기존 store 는 그대로 — 마이그레이션 실패해도 v4 데이터 손실 0.
      _LEARN_STORES.forEach((name) => {
        if (!db.objectStoreNames.contains(name)) {
          const st = db.createObjectStore(name, { keyPath: 'id' });
          st.createIndex('tenantId', 'tenantId', { unique: false });
        }
      });
      // v5→v6 [Phase 1]: 사진 문맥 캐시. 기존 store 무변경 — 실패해도 v5 데이터 손실 0.
      if (!db.objectStoreNames.contains(_PCTX_STORE)) {
        db.createObjectStore(_PCTX_STORE, { keyPath: 'id' });
      }
      // v6→v7 [IDB-1]: 인스타 텍스트 스타일 캐시. 기존 store 무변경 — 실패해도 v6 데이터 손실 0.
      //   tenantId 인덱스를 붙인다: 레코드 키가 샵별 분석 결과라 계정 전환 시 걸러낼 수 있어야 한다
      //   (app-instagram.js 가 계정 교체 때 wmLearnAll/wmLearnDel 로 이 store 를 청소한다).
      if (!db.objectStoreNames.contains(_IGTEXT_STORE)) {
        const its = db.createObjectStore(_IGTEXT_STORE, { keyPath: 'id' });
        its.createIndex('tenantId', 'tenantId', { unique: false });
      }
    };
    /* [2026-09-04 P1 · Android 에뮬레이터 실측] open 자체가 **아무 이벤트도 안 내고 pending** 으로
       남는 경우가 있다. 탭 2개를 띄운 Android Chrome 에서 `indexedDB.open('itdasy-gallery', 7)` 이
       5초 동안 success·error·blocked 를 **하나도** 안 냈고(탭 1개로 줄이자 즉시 OK v7),
       그 사이 작업실은 **로딩 표시도 없이 빈 화면**으로 굳었다 — 이 Promise 를 기다리는 호출자가
       전부 멈추기 때문이다. 같은 파일의 clearGalleryDB 는 이미 이 함정 때문에 타임아웃이 있는데
       (236행 주석) 정작 open 은 무방비였다.
       → 늦으면 **실패로 끝낸다.** 호출자가 catch 로 빈 상태를 그릴 수 있어야 dead state 가 안 된다.
       ⚠️ 성공 이벤트가 늦게 와도 _gdb 는 채워두고 즉시 닫지 않는다 — 다음 호출이 재사용한다. */
    let _settled = false;
    const _finish = (fn, v) => { if (_settled) return; _settled = true; clearTimeout(_openTimer); fn(v); };
    const _openTimer = setTimeout(() => {
      _finish(reject, new Error('gdb_open_timeout'));
    }, OPEN_GDB_TIMEOUT_MS);
    req.onsuccess = e => {
      _gdb = e.target.result;
      // [T7 실측 2026-08-17] 멀티탭 데드락 방지 — 다른 탭이 계정 전환 purge(deleteDatabase)나
      //   버전 업그레이드를 걸면, 이 연결이 안 닫히는 한 그 요청이 영구 blocked 되고 그 뒤에
      //   줄선 모든 open(발행 가드·자산 웜업·갤러리)이 같이 얼어붙는다(실측: 발행 버튼 영구 '올리는 중…').
      //   versionchange 를 받으면 즉시 양보하고, 다음 사용 때 openGalleryDB 가 재연결한다.
      _gdb.onversionchange = () => { try { _gdb.close(); } catch (_) { void 0; } _gdb = null; };
      _finish(resolve, _gdb);
    };
    req.onerror   = () => _finish(reject, req.error);
    // blocked = 다른 탭이 잡고 있다. 사람이 할 수 있는 일이 있으니 그대로 알려준다.
    req.onblocked = () => _finish(reject, new Error('gdb_open_blocked'));
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
const CLEAR_GDB_TIMEOUT_MS = 2000;
async function clearGalleryDB() {
  try {
    if (_gdb) { try { _gdb.close(); } catch (_) { void 0; } _gdb = null; }
    /* [2026-09-03 최종 스윕] workspace-sync.clearLocal 과 **같은 뿌리**다.
       deleteDatabase 는 다른 연결이 붙잡고 있으면 success·error·blocked 를
       **하나도 안 내고** pending 으로 남는다(2026-09-03 실측: 4초 관찰 이벤트 0건).
       onblocked 를 달아둔 것으로는 못 막는다 — 그 이벤트조차 안 온다.
       이 함수도 _purgeUserScopedDB → 로그인 경로에서 await 되므로
       안 끝나면 **로그인이 멈춘다**. 정리는 best-effort 로 강등한다. */
    return await new Promise((resolve) => {
      let settled = false;
      const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
      const timer = setTimeout(() => finish(false), CLEAR_GDB_TIMEOUT_MS);
      try {
        const req = indexedDB.deleteDatabase(_GDB_NAME);
        // 지워졌으면 소유자 도장도 비운다 — 다음 open 이 현재 사용자로 새로 찍는다.
        req.onsuccess = () => { clearTimeout(timer); try { _gdbSetOwner(null); } catch (_) { void 0; } finish(true); };
        req.onerror   = () => { clearTimeout(timer); finish(false); };
        req.onblocked = () => { clearTimeout(timer); finish(false); };
      } catch (_) { clearTimeout(timer); finish(false); }
    });
  } catch (_) { return false; }
}
window.clearGalleryDB = clearGalleryDB;
// ── [T8-B] 학습 store 범용 CRUD — 격리/검증은 work-memory-store.js 가 한다 ──
async function wmLearnPut(store, rec) {
  const db = await openGalleryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(rec);
    tx.oncomplete = () => resolve(rec.id);
    tx.onerror    = () => reject(tx.error);
  });
}
async function wmLearnGet(store, id) {
  const db = await openGalleryDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror   = () => reject(req.error);
  });
}
async function wmLearnAll(store) {
  const db = await openGalleryDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}
async function wmLearnDel(store, id) {
  const db = await openGalleryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror    = () => reject(tx.error);
  });
}
window.wmLearnPut = wmLearnPut;
window.wmLearnGet = wmLearnGet;
window.wmLearnAll = wmLearnAll;
window.wmLearnDel = wmLearnDel;
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
