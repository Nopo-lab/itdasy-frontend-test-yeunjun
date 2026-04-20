// Itdasy Studio - 작업실 & 마무리 (갤러리, 슬롯, IndexedDB)
// 캔버스 합성은 app-portfolio.js의 공유 유틸 사용:
//   compositePersonOnCanvas(), renderBASplit(), _loadImageSrc(), _drawCoverCtx(), getCloudBg()

// ═══════════════════════════════════════════════════════
// IndexedDB
// ═══════════════════════════════════════════════════════
const _GDB_NAME = 'itdasy-gallery';
const _GDB_STORE = 'slots';
let _gdb = null;

const _GALLERY_STORE = 'gallery';

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
    req.onerror  = () => reject(req.error);
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
    tx.onerror = () => reject(tx.error);
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
    tx.onerror = () => reject(tx.error);
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

// ═══════════════════════════════════════════════════════
// 유틸
// ═══════════════════════════════════════════════════════
function _uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function _fileToDataUrl(file) {
  return new Promise(resolve => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.readAsDataURL(file);
  });
}
function _dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const mime  = parts[0].match(/:(.*?);/)[1];
  const bin   = atob(parts[1]);
  const arr   = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// ═══════════════════════════════════════════════════════
// 상태
// ═══════════════════════════════════════════════════════
let _photos         = [];        // [{ id, file, dataUrl }] — 미배정 사진 풀
let _slots          = [];        // IndexedDB에서 로드
let _selectedIds    = new Set(); // 그리드 탭-체크 선택 (사진 배정용)
let _popupSelIds    = new Set(); // 팝업 내 사진 선택 (일괄 편집용)
let _wsInited       = false;
let _dragPhotoId    = null;
let _dragSrcEl      = null;
let _popupSlotId    = null;
let _popupUsage     = null;
let _captionSlotId  = null;      // 글쓰기탭에 연결된 슬롯 ID
let _previewPhotoIdx = 0;        // 미리보기 팝업 현재 사진 인덱스
let _baMode         = false;     // 비포/애프터 모드 활성화 여부

// ═══════════════════════════════════════════════════════
// 홈 탭 퀵액션
// ═══════════════════════════════════════════════════════
function goWorkshopUpload() {
  showTab('workshop', document.querySelectorAll('.nav-btn')[1]);
  initWorkshopTab();
  setTimeout(() => {
    const zone = document.getElementById('wsDropZone');
    if (zone) {
      zone.scrollIntoView({ behavior: 'smooth', block: 'center' });
      zone.style.borderColor = 'var(--accent)';
      zone.style.background = 'rgba(241,128,145,0.06)';
      setTimeout(() => { zone.style.borderColor = ''; zone.style.background = ''; }, 1500);
    }
  }, 300);
}

// ═══════════════════════════════════════════════════════
// 작업실 탭 초기화
// ═══════════════════════════════════════════════════════
async function initWorkshopTab() {
  const root = document.getElementById('workshopRoot');
  if (!root) return;

  if (!_wsInited) {
    _wsInited = true;
    root.innerHTML = _buildWorkshopHTML();
    _initDragEvents();
  }

  try { _slots = await loadSlotsFromDB(); } catch(_e) { _slots = []; }
  _renderPhotoGrid();
  _renderSlotCards();
  _renderCompletionBanner();
}

function _buildWorkshopHTML() {
  return `
  <section class="greet">
    <p class="status-line">사진을 올리면 글까지 자동으로.</p>
    <h1>오늘 작업</h1>
  </section>

  <div id="wsDropZone" class="ws-dropzone"
    onclick="document.getElementById('galleryFileInput').click()"
    ondragover="event.preventDefault();this.style.borderColor='var(--brand)';this.style.background='var(--brand-bg)';"
    ondragleave="this.style.borderColor='';this.style.background='';"
    ondrop="_handleDropZoneDrop(event)"
    oncontextmenu="return false">
    <input type="file" id="galleryFileInput" accept="image/*" multiple style="display:none;" onchange="handleGalleryUpload(this)">
    <div class="ws-drop-icon">
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
    </div>
    <p class="ws-drop-title">사진 올려서 시작해요</p>
    <p class="ws-drop-sub">탭해서 사진 선택 · 최대 20장</p>
  </div>

  <div class="ws-top-row">
    <button id="wsResetBtn" onclick="resetWorkshop()" class="ws-reset-btn" style="display:none;">처음부터</button>
    <div id="wsCompletionBadge" class="ws-badge"></div>
  </div>

  <div id="slotCardHeader" style="display:none;margin-bottom:12px;">
    <div class="ws-slot-head">
      <span class="ws-slot-label">손님별 사진</span>
      <div style="display:flex;align-items:center;gap:8px;">
        <span id="wsCompletionCount" class="ws-completion-count"></span>
        <button onclick="openAssignPopup()" class="ws-assign-btn">사진 나누기</button>
      </div>
    </div>
    <p class="ws-slot-hint">탭해서 편집해요</p>
  </div>
  <div id="slotCardList" style="display:flex;gap:12px;overflow-x:auto;padding:4px 0 12px;-webkit-overflow-scrolling:touch;"></div>
  <div id="wsBanner" style="display:none;margin-bottom:8px;"></div>
  `;
}
// ═══════════════════════════════════════════════════════
// 사진 업로드
// ═══════════════════════════════════════════════════════
async function handleGalleryUpload(input) {
  const files     = Array.isArray(input) ? input : Array.from(input.files || []);
  const remaining = 20 - _photos.length;
  const toAdd     = files.slice(0, remaining);
  for (const file of toAdd) {
    _photos.push({ id: _uid(), file, dataUrl: await _fileToDataUrl(file) });
  }
  if (files.length > remaining) showToast(`최대 20장까지 가능해요 (${remaining}장 추가됨)`);
  if (!Array.isArray(input)) input.value = '';
  const zone = document.getElementById('wsDropZone');
  if (zone) { zone.style.borderColor = ''; zone.style.background = ''; }

  // 슬롯 없으면 자동 생성 (손님 1)
  if (_slots.length === 0 && toAdd.length > 0) {
    const slot = { id: _uid(), label: '손님 1', order: 0, photos: [], caption: '', hashtags: '', status: 'open', instagramPublished: false, deferredAt: null, createdAt: Date.now() };
    _slots.push(slot);
    try { await saveSlotToDB(slot); } catch(_e) {}
  }

  _renderPhotoGrid();
  _renderSlotCards();

  // 사진 추가했으면 배정 팝업 바로 열기
  if (toAdd.length > 0) {
    setTimeout(() => openAssignPopup(), 100);
  }
}

async function _handleDropZoneDrop(e) {
  e.preventDefault();
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  if (!files.length) { showToast('이미지 파일만 올릴 수 있어요'); return; }
  await handleGalleryUpload(files);
}

async function resetWorkshop() {
  if (!confirm('전체 초기화할까요?\n모든 사진과 슬롯이 삭제됩니다.')) return;
  for (const slot of _slots) {
    try { await deleteSlotFromDB(slot.id); } catch(_e) {}
  }
  _photos = []; _slots = [];
  _selectedIds.clear(); _popupSelIds.clear();
  _wsInited = false;
  const root = document.getElementById('workshopRoot');
  if (root) { root.innerHTML = _buildWorkshopHTML(); _initDragEvents(); }
  showToast('초기화 완료 ✅');
}

// ═══════════════════════════════════════════════════════
// UI 상태 업데이트
// ═══════════════════════════════════════════════════════
function _renderPhotoGrid() {
  // 재시작 버튼: 사진이나 슬롯이 있으면 표시
  const resetBtn = document.getElementById('wsResetBtn');
  if (resetBtn) resetBtn.style.display = (_photos.length > 0 || _slots.length > 0) ? 'block' : 'none';

  // 배정 팝업이 열려있으면 갱신
  const pop = document.getElementById('_assignPopup');
  if (pop && pop.style.display === 'flex') {
    _renderAssignPopup();
  }
}

function _isAssigned(id) {
  return _slots.some(s => s.photos?.some(p => p.id === id));
}

function togglePhotoSelect(id) {
  _selectedIds.has(id) ? _selectedIds.delete(id) : _selectedIds.add(id);
  _updateAssignBottomSheet();
}

// ═══════════════════════════════════════════════════════
// 통합 배정 팝업 (사진 + 슬롯 한 화면에서)
// ═══════════════════════════════════════════════════════
function openAssignPopup() {
  _selectedIds.clear();
  let pop = document.getElementById('_assignPopup');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = '_assignPopup';
    pop.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,0.6);display:flex;align-items:flex-end;justify-content:center;';
    pop.onclick = e => { if (e.target === pop) closeAssignPopup(); };
    document.body.appendChild(pop);
  }
  _renderAssignPopup();
  pop.style.display = 'flex';
}

function closeAssignPopup() {
  const pop = document.getElementById('_assignPopup');
  if (pop) {
    // 피드백 #10: display:none으로는 일부 기기에서 회색 오버레이가 남음. 완전 제거로 변경.
    pop.style.display = 'none';
    pop.remove();
  }
  _selectedIds.clear();
  _renderSlotCards();
  _renderPhotoGrid();
}

function _renderAssignPopup() {
  const pop = document.getElementById('_assignPopup');
  if (!pop) return;

  const unassigned = _photos.filter(p => !_isAssigned(p.id));

  // 미배정 사진 없고 모든 슬롯에 사진 있으면 완료
  if (unassigned.length === 0 && _slots.length > 0 && _slots.every(s => s.photos.length > 0)) {
    closeAssignPopup();
    showToast('배정 완료! 슬롯 카드를 탭해서 편집하세요 ✨');
    return;
  }

  // 슬롯별 썸네일 (가로 스크롤로 보여주기)
  const slotsHtml = _slots.map(slot => {
    const photos = (slot.photos || []).filter(p => !p.hidden);
    // 슬롯 내 사진들을 가로로 나열
    const photosPreview = photos.length > 0
      ? photos.slice(0, 4).map(p => `<img src="${p.editedDataUrl || p.dataUrl}" style="width:32px;height:32px;object-fit:cover;border-radius:6px;flex-shrink:0;">`).join('') + (photos.length > 4 ? `<div style="width:32px;height:32px;border-radius:6px;background:rgba(0,0,0,0.5);color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">+${photos.length-4}</div>` : '')
      : '<div style="font-size:11px;color:var(--text3);">비어있음</div>';

    return `<div data-slot-drop="${slot.id}" onclick="${_selectedIds.size > 0 ? `_assignToSlotFromPopup('${slot.id}')` : ''}" style="flex-shrink:0;width:140px;background:#fff;border:2px solid ${_selectedIds.size > 0 ? 'var(--accent)' : 'var(--border)'};border-radius:14px;padding:10px;position:relative;${_selectedIds.size > 0 ? 'cursor:pointer;' : ''}">
      <button onclick="_deleteSlotInPopup('${slot.id}');event.stopPropagation();" style="position:absolute;top:4px;right:4px;width:18px;height:18px;border-radius:50%;background:rgba(0,0,0,0.08);border:none;color:#999;font-size:10px;cursor:pointer;z-index:2;">✕</button>
      <div style="font-size:12px;font-weight:800;color:var(--text);margin-bottom:6px;">${slot.label}</div>
      <div style="display:flex;gap:4px;overflow-x:auto;min-height:32px;align-items:center;">${photosPreview}</div>
      ${_selectedIds.size > 0 ? `<div style="margin-top:8px;padding:6px;border-radius:8px;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:11px;font-weight:700;text-align:center;">여기에 넣기</div>` : ''}
    </div>`;
  }).join('');

  pop.innerHTML = `
    <div style="width:100%;max-width:480px;background:#fff;border-radius:24px 24px 0 0;max-height:85vh;overflow:hidden;display:flex;flex-direction:column;" oncontextmenu="return false">
      <!-- 헤더 -->
      <div style="display:flex;justify-content:center;padding:10px 0 4px;">
        <div style="width:40px;height:4px;border-radius:2px;background:rgba(0,0,0,0.12);"></div>
      </div>
      <div style="padding:8px 16px 12px;border-bottom:1px solid var(--border);">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:16px;font-weight:800;color:var(--text);">📷 사진 → 손님 배정</div>
          <button onclick="closeAssignPopup()" style="background:transparent;border:none;font-size:24px;color:#aaa;cursor:pointer;padding:0 4px;">×</button>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px;">사진 선택 후 아래 손님 카드를 탭하세요</div>
      </div>

      <!-- 미배정 사진 (가로 스와이프) -->
      <div style="padding:12px 16px;border-bottom:1px solid var(--border);background:#fafafa;">
        <div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:8px;">📸 미배정 ${unassigned.length}장</div>
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
          <div style="display:flex;gap:8px;min-width:max-content;padding:2px;">
            ${unassigned.length ? unassigned.map(photo => {
              const sel = _selectedIds.has(photo.id);
              // 피드백 #4: 체크 아이콘 크고 뚜렷하게 (24px + 딥 shadow + selected tint)
              return `<div onclick="togglePhotoSelect('${photo.id}');_renderAssignPopup();" style="flex-shrink:0;width:72px;cursor:pointer;">
                <div style="position:relative;width:72px;height:72px;border-radius:12px;overflow:hidden;border:3px solid ${sel ? 'var(--accent)' : 'transparent'};box-shadow:${sel ? '0 4px 12px rgba(241,128,145,0.55)' : '0 1px 3px rgba(0,0,0,0.08)'};">
                  <img src="${photo.dataUrl}" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;${sel ? 'filter:brightness(0.85);' : ''}">
                  <div style="position:absolute;top:4px;right:4px;width:26px;height:26px;border-radius:50%;border:2px solid #fff;background:${sel ? 'var(--accent)' : 'rgba(0,0,0,0.35)'};display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:900;color:#fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${sel ? '✓' : ''}</div>
                </div>
              </div>`;
            }).join('') : '<div style="padding:16px;text-align:center;color:var(--accent2);font-size:12px;font-weight:600;">모든 사진 배정 완료 ✅</div>'}
          </div>
        </div>
      </div>

      <!-- 손님 슬롯 (가로 스와이프) -->
      <div style="flex:1;padding:12px 16px;overflow:hidden;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="font-size:11px;font-weight:700;color:var(--text3);">👤 손님 슬롯 ${_slots.length}개</div>
          <button onclick="_addSlotInPopup()" style="padding:5px 10px;border-radius:6px;border:1.5px solid var(--accent);background:transparent;color:var(--accent);font-size:10px;font-weight:700;cursor:pointer;">+ 추가</button>
        </div>
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:8px;">
          <div style="display:flex;gap:10px;min-width:max-content;">
            ${slotsHtml || '<div style="padding:20px;color:var(--text3);font-size:12px;">슬롯이 없어요. + 추가를 눌러주세요</div>'}
          </div>
        </div>
      </div>

      <!-- 하단: 선택 삭제 -->
      ${_selectedIds.size > 0 ? `
        <div style="padding:10px 16px;border-top:1px solid var(--border);background:#fff;display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:12px;font-weight:700;color:var(--accent);">${_selectedIds.size}장 선택됨</div>
          <button onclick="_deleteSelectedInPopup()" style="padding:8px 14px;border-radius:8px;border:1px solid rgba(220,53,69,0.4);background:transparent;color:#dc3545;font-size:11px;font-weight:600;cursor:pointer;">삭제</button>
        </div>
      ` : ''}
    </div>
  `;
}

async function _addSlotInPopup() {
  // 번호 재정렬 후 다음 번호 사용
  await _renumberSlots();
  const num = _slots.length + 1;
  const slot = { id: _uid(), label: `손님 ${num}`, order: num - 1, photos: [], caption: '', hashtags: '', status: 'open', instagramPublished: false, deferredAt: null, createdAt: Date.now() };
  _slots.push(slot);
  try { await saveSlotToDB(slot); } catch(_e) {}
  _renderAssignPopup();
}

async function _deleteSlotInPopup(slotId) {
  const slot = _slots.find(s => s.id === slotId);
  // 배정된 사진들을 미배정 풀로 복귀
  if (slot) {
    slot.photos.forEach(sp => {
      if (!_photos.find(p => p.id === sp.id)) {
        _photos.push({ id: sp.id, file: null, dataUrl: sp.dataUrl });
      }
    });
  }
  _slots = _slots.filter(s => s.id !== slotId);
  try { await deleteSlotFromDB(slotId); } catch(_e) {}
  // 슬롯 번호 재정렬
  _renumberSlots();
  _renderAssignPopup();
}

function _assignToSlotFromPopup(slotId) {
  if (!_selectedIds.size) return;
  [..._selectedIds].forEach(id => _assignToSlot(id, slotId));
  _selectedIds.clear();
  showToast('배정 완료 ✅');
  _renderAssignPopup();
}

function _deleteSelectedInPopup() {
  if (!_selectedIds.size) return;
  _photos = _photos.filter(p => !_selectedIds.has(p.id));
  _selectedIds.clear();
  showToast('삭제됨');
  _renderAssignPopup();
}

// 슬롯 번호 재정렬 (삭제 후)
async function _renumberSlots() {
  _slots.forEach((slot, i) => {
    slot.label = `손님 ${i + 1}`;
    slot.order = i;
  });
  for (const slot of _slots) {
    try { await saveSlotToDB(slot); } catch(_e) {}
  }
}

// 기존 함수들 호환용
function _updateAssignBottomSheet() { _renderAssignPopup(); }

// ═══════════════════════════════════════════════════════
// 슬롯 카드 (가로 스크롤)
// ═══════════════════════════════════════════════════════
function _renderSlotCards() {
  const list   = document.getElementById('slotCardList');
  const header = document.getElementById('slotCardHeader');
  const completionEl = document.getElementById('wsCompletionCount');
  if (!list) return;

  if (!_slots.length) {
    list.innerHTML = '';
    if (header) header.style.display = 'none';
    return;
  }

  if (header) header.style.display = 'block';
  const doneCount = _slots.filter(s => s.status === 'done').length;
  if (completionEl) completionEl.textContent = doneCount > 0 ? `${doneCount}/${_slots.length} 완료` : '';

  list.innerHTML = '';
  _slots.forEach(slot => {
    const done = slot.status === 'done';
    const visiblePhotos = (slot.photos || []).filter(p => !p.hidden);
    const thumb = visiblePhotos[0];
    const photoCount = visiblePhotos.length;

    const card = document.createElement('div');
    card.style.cssText = `flex-shrink:0;width:140px;background:#fff;border:2px solid ${done ? 'rgba(76,175,80,0.5)' : 'var(--border)'};border-radius:14px;padding:10px;user-select:none;-webkit-user-select:none;position:relative;`;
    card.dataset.slotId = slot.id;
    card.setAttribute('oncontextmenu', 'return false');

    const thumbHtml = thumb
      ? `<div onclick="openSlotPopup('${slot.id}')" style="position:relative;width:100%;aspect-ratio:1/1;border-radius:10px;overflow:hidden;cursor:pointer;">
          <img src="${thumb.editedDataUrl || thumb.dataUrl}" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;">
          ${photoCount > 1 ? `<div style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,0.6);border-radius:6px;padding:2px 6px;font-size:9px;color:#fff;font-weight:700;">+${photoCount}</div>` : ''}
        </div>`
      : `<div onclick="openAssignPopup()" style="width:100%;aspect-ratio:1/1;border-radius:10px;border:2px dashed rgba(241,128,145,0.35);display:flex;align-items:center;justify-content:center;cursor:pointer;background:rgba(241,128,145,0.03);font-size:20px;color:var(--text3);">+</div>`;

    card.innerHTML = `
      <button onclick="deleteSlot('${slot.id}',event)" style="position:absolute;top:6px;right:6px;z-index:2;background:rgba(255,255,255,0.9);border:none;font-size:12px;color:var(--text3);cursor:pointer;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;">✕</button>
      ${thumbHtml}
      <div style="margin-top:6px;text-align:center;">
        <div style="font-size:11px;font-weight:800;color:var(--text);">${slot.label}${done ? ' ✅' : ''}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;">${photoCount}장</div>
      </div>
    `;
    list.appendChild(card);
  });

  // 재시작 버튼
  const resetBtn = document.getElementById('wsResetBtn');
  if (resetBtn) resetBtn.style.display = _slots.length > 0 ? 'block' : 'none';
}

async function deleteSlot(slotId, e) {
  e?.stopPropagation();
  const slot = _slots.find(s => s.id === slotId);
  // 배정된 사진들을 미배정 풀로 복귀
  if (slot) {
    slot.photos.forEach(sp => {
      if (!_photos.find(p => p.id === sp.id)) {
        _photos.push({ id: sp.id, file: null, dataUrl: sp.dataUrl });
      }
    });
  }
  _slots = _slots.filter(s => s.id !== slotId);
  try { await deleteSlotFromDB(slotId); } catch(_e) {}
  // 슬롯 번호 재정렬
  await _renumberSlots();
  _renderSlotCards();
  _renderPhotoGrid();
  _renderCompletionBanner();
}

// ═══════════════════════════════════════════════════════
// 완료 현황 배너 + 다음 손님 유도
// ═══════════════════════════════════════════════════════
function _renderCompletionBanner() {
  const badge  = document.getElementById('wsCompletionBadge');
  const banner = document.getElementById('wsBanner');
  if (!_slots.length) {
    if (badge)  badge.textContent  = '';
    if (banner) banner.style.display = 'none';
    return;
  }
  const done  = _slots.filter(s => s.status === 'done').length;
  const total = _slots.length;
  if (badge) badge.textContent = `${done}/${total} 완료`;

  if (banner) {
    if (done > 0) {
      banner.style.display = 'block';
      const allDone = done === total;
      // 다음 미완료 슬롯 찾기 (사진이 있는 것 우선)
      const nextSlot = _slots.find(s => s.status !== 'done' && s.photos.length > 0)
                    || _slots.find(s => s.status !== 'done');

      if (allDone) {
        // 모든 작업 완료
        banner.innerHTML = `
          <div style="background:rgba(76,175,80,0.1);border:1.5px solid rgba(76,175,80,0.3);border-radius:16px;padding:14px 16px;">
            <div style="font-size:13px;font-weight:700;color:#388e3c;margin-bottom:10px;">🎉 모든 작업 완료!</div>
            <button onclick="showTab('caption',document.querySelectorAll('.nav-btn')[2]); initCaptionSlotPicker(); if(typeof renderCaptionKeywordTags==='function')renderCaptionKeywordTags();" style="width:100%;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:13px;font-weight:800;cursor:pointer;">지금 글쓰기로 →</button>
          </div>
        `;
      } else {
        // 일부 완료 + 다음 손님 유도
        const nextLabel = nextSlot ? nextSlot.label : '다음 손님';
        banner.innerHTML = `
          <div style="background:rgba(241,128,145,0.07);border:1.5px solid rgba(241,128,145,0.2);border-radius:16px;padding:14px 16px;">
            <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:10px;">${nextLabel} 작업할까요? <span style="color:var(--text3);font-weight:400;">(완료 ${done}/${total})</span></div>
            <div style="display:flex;gap:8px;">
              ${nextSlot ? `<button onclick="openSlotPopup('${nextSlot.id}')" style="flex:1;padding:10px 14px;border-radius:10px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:12px;font-weight:700;cursor:pointer;">${nextLabel} →</button>` : ''}
              <button onclick="showTab('caption',document.querySelectorAll('.nav-btn')[2]); initCaptionSlotPicker(); if(typeof renderCaptionKeywordTags==='function')renderCaptionKeywordTags();" style="flex:1;padding:10px 14px;border-radius:10px;border:1.5px solid var(--accent);background:transparent;color:var(--accent);font-size:12px;font-weight:700;cursor:pointer;">지금 글쓰기로 →</button>
            </div>
          </div>
        `;
      }
    } else {
      banner.style.display = 'none';
    }
  }
}

// ═══════════════════════════════════════════════════════
// 사진 배정
// ═══════════════════════════════════════════════════════

function _assignToSlot(photoId, slotId) {
  const photo = _photos.find(p => p.id === photoId);
  const slot  = _slots.find(s => s.id === slotId);
  if (!photo || !slot || slot.photos.find(p => p.id === photoId)) return;
  slot.photos.push({ id: photo.id, dataUrl: photo.dataUrl, mode: 'original', editedDataUrl: null });
  saveSlotToDB(slot).catch(() => {});
}

// ═══════════════════════════════════════════════════════
// 드래그 (Touch + Mouse)
// ═══════════════════════════════════════════════════════
function _initDragEvents() {
  document.addEventListener('touchmove',  _moveDragInd, { passive: true });
  document.addEventListener('mousemove',  _moveDragIndMouse);
  document.addEventListener('touchend',   _onDragEnd, { passive: false });
  document.addEventListener('mouseup',    _onDragEnd);
}

function _showDragIndicator(dataUrl) {
  let ind = document.getElementById('_gDragInd');
  if (!ind) {
    ind = document.createElement('div');
    ind.id = '_gDragInd';
    ind.style.cssText = 'position:fixed;width:60px;height:60px;border-radius:10px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.25);pointer-events:none;z-index:9999;opacity:0.85;display:none;transition:none;';
    ind.innerHTML = '<img style="width:100%;height:100%;object-fit:cover;">';
    document.body.appendChild(ind);
  }
  ind.querySelector('img').src = dataUrl;
  ind.style.display = 'block';
}

function _moveDragInd(e) {
  if (!_dragPhotoId) return;
  const ind = document.getElementById('_gDragInd');
  if (!ind) return;
  const t = e.touches[0];
  ind.style.left = (t.clientX - 30) + 'px';
  ind.style.top  = (t.clientY - 30) + 'px';
}

function _moveDragIndMouse(e) {
  if (!_dragPhotoId) return;
  const ind = document.getElementById('_gDragInd');
  if (!ind) return;
  ind.style.left = (e.clientX - 30) + 'px';
  ind.style.top  = (e.clientY - 30) + 'px';
}

function _hideDragIndicator() {
  const ind = document.getElementById('_gDragInd');
  if (ind) ind.style.display = 'none';
}

function _onDragEnd() {
  if (_dragPhotoId) { _hideDragIndicator(); _dragPhotoId = null; _dragSrcEl = null; }
}

// ═══════════════════════════════════════════════════════
// 슬롯 팝업 (풀스크린)
// ═══════════════════════════════════════════════════════
async function openSlotPopup(slotId) {
  const slot = _slots.find(s => s.id === slotId);
  if (!slot) return;
  _popupSlotId = slotId;
  _popupSelIds.clear();

  document.getElementById('slotPopupLabel').textContent = slot.label + (slot.status === 'done' ? ' ✅' : '');
  document.getElementById('slotPopup').style.display = 'flex';

  try {
    const res = await fetch(API + '/image/usage', { headers: authHeader() });
    if (res.ok) _popupUsage = await res.json();
  } catch(_e) { _popupUsage = null; }

  _renderPopupBody(slot);
}

function closeSlotPopup() {
  document.getElementById('slotPopup').style.display = 'none';
  _popupSlotId = null;
  _popupSelIds.clear();
  _renderSlotCards();
  _renderPhotoGrid();
}

async function saveAndCloseSlotPopup() {
  const slot = _slots.find(s => s.id === _popupSlotId);
  if (slot) {
    slot.status = 'done';
    try { await saveSlotToDB(slot); } catch(_e) {}
  }
  closeSlotPopup();
  _renderCompletionBanner();

  // 완료 후 다음 손님 유도 토스트
  const done = _slots.filter(s => s.status === 'done').length;
  const total = _slots.length;
  const nextSlot = _slots.find(s => s.status !== 'done' && s.photos.length > 0);

  if (nextSlot) {
    _showNextSlotGuide(nextSlot, done, total);
  } else if (done === total) {
    showToast('🎉 모든 작업 완료! 글쓰기로 이동하세요');
  }
}

// 다음 손님 유도 바텀시트
function _showNextSlotGuide(nextSlot, doneCount, totalCount) {
  let pop = document.getElementById('_nextSlotGuide');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = '_nextSlotGuide';
    pop.style.cssText = 'position:fixed;inset:0;z-index:9400;background:rgba(0,0,0,0.4);display:flex;align-items:flex-end;justify-content:center;';
    pop.onclick = e => { if (e.target === pop) pop.style.display = 'none'; };
    document.body.appendChild(pop);
  }
  pop.innerHTML = `
    <div style="width:100%;max-width:480px;background:#fff;border-radius:20px 20px 0 0;padding:20px 16px 28px;">
      <div style="display:flex;justify-content:center;padding:0 0 12px;">
        <div style="width:36px;height:4px;border-radius:2px;background:rgba(0,0,0,0.12);"></div>
      </div>
      <div style="text-align:center;margin-bottom:16px;">
        <div style="font-size:32px;margin-bottom:8px;">✅</div>
        <div style="font-size:15px;font-weight:800;color:var(--text);">${nextSlot.label.replace('손님','손님 ')}도 작업할까요?</div>
        <div style="font-size:12px;color:var(--text3);margin-top:4px;">완료 ${doneCount}/${totalCount}</div>
      </div>
      <div style="display:flex;gap:10px;">
        <button onclick="document.getElementById('_nextSlotGuide').style.display='none';openSlotPopup('${nextSlot.id}')" style="flex:1;padding:14px;border-radius:14px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:14px;font-weight:800;cursor:pointer;">${nextSlot.label} →</button>
        <button onclick="document.getElementById('_nextSlotGuide').style.display='none';showTab('caption',document.querySelectorAll('.nav-btn')[2]);initCaptionSlotPicker();if(typeof renderCaptionKeywordTags==='function')renderCaptionKeywordTags();" style="flex:1;padding:14px;border-radius:14px;border:1.5px solid var(--accent);background:transparent;color:var(--accent);font-size:14px;font-weight:700;cursor:pointer;">지금 글쓰기로 →</button>
      </div>
    </div>
  `;
  pop.style.display = 'flex';
}

function _renderPopupBody(slot) {
  const body = document.getElementById('slotPopupBody');
  if (!body) return;

  const usageHtml = _popupUsage
    ? `<div style="font-size:11px;color:var(--text3);margin-bottom:12px;">AI 누끼따기 남은 횟수: <b style="color:var(--accent);">${_popupUsage.limit - _popupUsage.used}/${_popupUsage.limit}회</b></div>`
    : '';

  body.innerHTML = `
    ${usageHtml}
    <!-- 사진 추가 -->
    <div style="margin-bottom:12px;">
      <input type="file" id="popupPhotoInput" accept="image/*" multiple style="display:none;" onchange="addPhotosToPopup(this)">
      <button onclick="document.getElementById('popupPhotoInput').click()" style="width:100%;padding:11px;border-radius:12px;border:1.5px dashed rgba(241,128,145,0.4);background:transparent;color:var(--accent2);font-size:12px;font-weight:700;cursor:pointer;">+ 사진 추가</button>
    </div>
    <!-- 사진 그리드 -->
    <div id="popupPhotoGrid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px;"></div>
    <!-- 선택 삭제 (선택 시 노출) -->
    <div id="popupBulkBar" style="display:none;background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:12px;margin-bottom:12px;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="font-size:12px;font-weight:700;color:var(--text);"><span id="popupSelCount">0</span>장 선택됨</div>
        <button onclick="_bulkDeletePopup()" style="padding:8px 14px;border-radius:8px;border:1px solid rgba(220,53,69,0.4);background:transparent;color:#dc3545;font-size:11px;font-weight:700;cursor:pointer;">선택 삭제</button>
      </div>
    </div>
    <div id="popupProgress" style="display:none;text-align:center;padding:16px;font-size:13px;color:var(--text3);">처리 중... ⏳</div>
    <!-- 안내 문구 -->
    <div style="text-align:center;padding:8px;font-size:11px;color:var(--text3);background:rgba(241,128,145,0.06);border-radius:10px;">
      💡 배경 편집은 하단 <b>배경</b> 탭에서 할 수 있어요
    </div>
  `;
  _renderPopupPhotoGrid(slot);
}

function _renderPopupPhotoGrid(slot) {
  const grid = document.getElementById('popupPhotoGrid');
  const bulkBar = document.getElementById('popupBulkBar');
  const selCount = document.getElementById('popupSelCount');
  if (!grid) return;

  const visiblePhotos = (slot.photos || []).filter(p => !p.hidden);

  if (!visiblePhotos.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;font-size:13px;color:var(--text3);">사진을 추가해주세요</div>';
    if (bulkBar) bulkBar.style.display = 'none';
    return;
  }

  if (selCount) selCount.textContent = _popupSelIds.size;
  if (bulkBar)  bulkBar.style.display = _popupSelIds.size > 0 ? 'block' : 'none';

  // 선택 순서에 따른 BEFORE/AFTER 라벨 (비포/애프터 모드일 때만)
  const selArr = [..._popupSelIds];
  const baLabelMap = {};
  if (_baMode) {
    if (selArr[0]) baLabelMap[selArr[0]] = 'BEFORE';
    if (selArr[1]) baLabelMap[selArr[1]] = 'AFTER';
  }

  const modeColor = { original: 'var(--text3)', ai_bg: 'var(--accent)', ba: '#8fa4ff' };
  const modeLabel = { original: '원본', ai_bg: 'AI합성', ba: '비포/애프터' };

  grid.innerHTML = '';
  visiblePhotos.forEach(photo => {
    const sel   = _popupSelIds.has(photo.id);
    const baLbl = baLabelMap[photo.id];

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:3px;user-select:none;-webkit-user-select:none;';
    wrap.setAttribute('oncontextmenu', 'return false');

    const imgBox = document.createElement('div');
    imgBox.style.cssText = `position:relative;aspect-ratio:1/1;border-radius:10px;overflow:hidden;border:2.5px solid ${sel ? 'var(--accent)' : 'transparent'};cursor:pointer;user-select:none;-webkit-user-select:none;`;
    imgBox.innerHTML = `
      <img src="${photo.editedDataUrl || photo.dataUrl}" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;user-select:none;-webkit-user-select:none;-webkit-user-drag:none;">
      <div style="position:absolute;top:3px;right:3px;width:18px;height:18px;border-radius:50%;border:2px solid #fff;background:${sel ? 'var(--accent)' : 'rgba(0,0,0,0.3)'};display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;">${sel ? '✓' : ''}</div>
      <div style="position:absolute;bottom:0;left:0;right:0;padding:3px 5px;background:rgba(0,0,0,0.55);font-size:9px;color:${modeColor[photo.mode]};font-weight:700;">${modeLabel[photo.mode] || '원본'}</div>
      ${baLbl ? `<div style="position:absolute;top:3px;left:3px;background:${baLbl==='BEFORE'?'rgba(100,149,237,0.92)':'rgba(241,128,145,0.92)'};border-radius:4px;padding:2px 6px;font-size:9px;color:#fff;font-weight:800;">${baLbl}</div>` : ''}
      <button onclick="unassignPopupPhoto('${photo.id}',event)" style="position:absolute;top:${baLbl?'22':'3'}px;left:3px;width:18px;height:18px;border-radius:50%;background:rgba(0,0,0,0.5);border:none;color:#fff;font-size:9px;cursor:pointer;z-index:2;line-height:1;">↩</button>
    `;
    imgBox.addEventListener('click', e => { e.stopPropagation(); togglePopupPhotoSel(photo.id); });
    // 텍스트 선택 방지 — CSS user-select:none 로 충분. touchstart preventDefault 는 click 을 막아서 제거.
    imgBox.style.webkitTapHighlightColor = 'transparent';
    wrap.appendChild(imgBox);

    if (photo.mode === 'ba') {
      const restoreBtn = document.createElement('button');
      restoreBtn.textContent = '↩ 되돌리기';
      restoreBtn.style.cssText = 'width:100%;padding:3px;border-radius:6px;border:1px solid rgba(143,164,255,0.5);background:transparent;font-size:10px;color:#8fa4ff;cursor:pointer;font-weight:700;';
      restoreBtn.onclick = () => restoreBAPhoto(photo.id);
      wrap.appendChild(restoreBtn);
    }

    const previewBtn = document.createElement('button');
    previewBtn.textContent = '미리보기';
    previewBtn.style.cssText = 'width:100%;padding:3px;border-radius:6px;border:1px solid var(--border);background:transparent;font-size:10px;color:var(--text3);cursor:pointer;';
    previewBtn.onclick = () => showPhotoInstaPreview(photo.editedDataUrl || photo.dataUrl);
    wrap.appendChild(previewBtn);

    grid.appendChild(wrap);
  });
}

function togglePopupPhotoSel(id) {
  const wasSelected = _popupSelIds.has(id);
  wasSelected ? _popupSelIds.delete(id) : _popupSelIds.add(id);
  const slot = _slots.find(s => s.id === _popupSlotId);
  if (slot) _renderPopupPhotoGrid(slot);

  // Haptic: 선택/해제 구분
  if (window.hapticLight) window.hapticLight();

  // 비포/애프터 모드에서 2장 선택시 자동 적용
  if (_baMode && _popupSelIds.size >= 2) {
    setTimeout(() => _checkAndApplyBA(), 100);
    return;
  }

  // 🆕 첫 선택 시 사용자에게 다음 단계 안내 (UX 개선)
  // 선택 상태에서 하단 액션 바가 안 보이는 경우 대비
  if (!wasSelected && _popupSelIds.size === 1) {
    if (typeof showToast === 'function') {
      showToast('1장 선택됨 — 아래에서 편집 방식을 골라주세요');
    }
    // 팝업 하단 액션 영역으로 자동 스크롤 (버튼 잘 보이도록)
    setTimeout(() => {
      const actionBar = document.getElementById('popupActionBar') || document.getElementById('slotPopupActions');
      if (actionBar && typeof actionBar.scrollIntoView === 'function') {
        actionBar.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }, 150);
  }
}

// 팝업에서 사진 배정 취소 (미배정 풀로 복귀)
async function unassignPopupPhoto(photoId, e) {
  e?.stopPropagation();
  const slot = _slots.find(s => s.id === _popupSlotId);
  if (!slot) return;
  const sp = slot.photos.find(p => p.id === photoId);
  if (sp && !_photos.find(p => p.id === photoId)) {
    _photos.push({ id: sp.id, file: null, dataUrl: sp.dataUrl });
  }
  slot.photos = slot.photos.filter(p => p.id !== photoId);
  _popupSelIds.delete(photoId);
  try { await saveSlotToDB(slot); } catch(_e) {}
  _renderPopupPhotoGrid(slot);
  showToast('배정 취소됨 — 미배정 사진으로 돌아갔어요');
}

async function addPhotosToPopup(input) {
  const slot = _slots.find(s => s.id === _popupSlotId);
  if (!slot) return;
  for (const file of Array.from(input.files)) {
    const dataUrl = await _fileToDataUrl(file);
    const id = _uid();
    slot.photos.push({ id, dataUrl, mode: 'original', editedDataUrl: null });
    _photos.push({ id, file, dataUrl });
  }
  input.value = '';
  try { await saveSlotToDB(slot); } catch(_e) {}
  _renderPopupPhotoGrid(slot);
}

// 비포/애프터 모드 토글
function toggleBAMode() {
  _baMode = !_baMode;
  const btn = document.getElementById('baBtnToolbar');
  if (btn) {
    btn.style.background = _baMode ? 'linear-gradient(135deg,#8fa4ff,#a3b4ff)' : '#fff';
    btn.style.color = _baMode ? '#fff' : 'var(--text)';
    btn.style.borderColor = _baMode ? '#8fa4ff' : 'var(--border)';
  }
  if (_baMode) {
    _popupSelIds.clear();
    showToast('비포/애프터 모드 ON\n사진 2장을 순서대로 선택하세요');
  } else {
    showToast('비포/애프터 모드 OFF');
  }
  const slot = _slots.find(s => s.id === _popupSlotId);
  if (slot) _renderPopupPhotoGrid(slot);
}

// 비포/애프터 모드에서 2장 선택 완료시 자동 적용
async function _checkAndApplyBA() {
  if (!_baMode || _popupSelIds.size < 2) return;
  await _bulkApplyBA();
  _baMode = false;
  const btn = document.getElementById('baBtnToolbar');
  if (btn) {
    btn.style.background = '#fff';
    btn.style.color = 'var(--text)';
    btn.style.borderColor = 'var(--border)';
  }
}

async function _bulkApplyBA() {
  if (_popupSelIds.size < 2) {
    showToast('사진 2장 선택해주세요');
    return;
  }
  const slot = _slots.find(s => s.id === _popupSlotId);
  if (!slot) return;
  const selArr   = [..._popupSelIds];
  const beforeId = selArr[0];
  const afterId  = selArr[1];
  const before   = slot.photos.find(p => p.id === beforeId);
  const after    = slot.photos.find(p => p.id === afterId);
  if (!before || !after) return;
  const progress = document.getElementById('popupProgress');
  if (progress) progress.style.display = 'block';
  await _applyBABetween(before, after, slot);
  // AFTER 사진 숨김 처리 + 연결 ID 저장 (되돌리기용)
  before.baAfterRefId = afterId;
  after.hidden = true;
  try { await saveSlotToDB(slot); } catch(_e) {}
  if (progress) progress.style.display = 'none';
  _popupSelIds.clear();
  _renderPopupPhotoGrid(slot);
  showToast('비포/애프터 완료! [되돌리기]로 원본 복원 가능해요 ✅');
}

async function restoreBAPhoto(baPhotoId) {
  const slot = _slots.find(s => s.id === _popupSlotId);
  if (!slot) return;
  const baPhoto = slot.photos.find(p => p.id === baPhotoId);
  if (!baPhoto) return;
  if (baPhoto.baAfterRefId) {
    const afterPhoto = slot.photos.find(p => p.id === baPhoto.baAfterRefId);
    if (afterPhoto) afterPhoto.hidden = false;
  }
  baPhoto.mode = 'original';
  baPhoto.editedDataUrl = null;
  baPhoto.baAfterRefId = null;
  try { await saveSlotToDB(slot); } catch(_e) {}
  _renderPopupPhotoGrid(slot);
  showToast('원본 2장으로 복원됐어요');
}

function showPhotoInstaPreview(dataUrl) {
  let pop = document.getElementById('_wsInstaPreviewPop');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = '_wsInstaPreviewPop';
    pop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:10000;display:flex;align-items:center;justify-content:center;flex-direction:column;padding:20px;box-sizing:border-box;';
    pop.innerHTML = `
      <div style="width:100%;max-width:380px;">
        <div style="background:#fff;border-radius:14px;overflow:hidden;">
          <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #f0f0f0;">
            <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:800;">잇</div>
            <div style="font-size:13px;font-weight:700;">@itdasy</div>
          </div>
          <img id="_wsPreviewImg" style="width:100%;aspect-ratio:1/1;object-fit:cover;display:block;">
          <div style="padding:8px 12px;font-size:11px;color:#888;">인스타 피드 1:1 비율 미리보기</div>
        </div>
      </div>
      <button onclick="document.getElementById('_wsInstaPreviewPop').style.display='none'" style="margin-top:16px;color:#fff;background:transparent;border:1px solid rgba(255,255,255,0.3);border-radius:20px;padding:8px 20px;font-size:13px;cursor:pointer;">닫기</button>
    `;
    document.body.appendChild(pop);
  }
  document.getElementById('_wsPreviewImg').src = dataUrl;
  pop.style.display = 'flex';
}

async function _bulkDeletePopup() {
  const slot = _slots.find(s => s.id === _popupSlotId);
  if (!slot || !_popupSelIds.size) return;
  if (!confirm(`선택한 ${_popupSelIds.size}장을 삭제할까요?`)) return;
  slot.photos = slot.photos.filter(p => !_popupSelIds.has(p.id));
  try { await saveSlotToDB(slot); } catch(_e) {}
  _popupSelIds.clear();
  _renderPopupPhotoGrid(slot);
  _renderSlotCards();
  showToast('삭제됨');
}

// ═══════════════════════════════════════════════════════
// 비포/애프터 합성 (app-portfolio.js 공유 유틸 사용)
// ═══════════════════════════════════════════════════════
async function _applyBABetween(before, after, slot) {
  try {
    const beforeImg = await _loadImageSrc(before.editedDataUrl || before.dataUrl);
    const afterImg  = await _loadImageSrc(after.editedDataUrl || after.dataUrl);
    const canvas    = document.createElement('canvas');
    renderBASplit(canvas, beforeImg, afterImg, 1080, 1080);
    before.editedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
    before.mode = 'ba';
    await saveSlotToDB(slot);
  } catch(e) { showToast('오류: ' + e.message); }
}

