// Itdasy Studio — 작업실 탭 핵심 (상태·업로드·슬롯카드·드래그)
// 의존: app-gallery-utils.js, app-gallery-db.js (먼저 로드)
// slot-editor / assign 이 읽는 setter 함수도 여기에 정의.

// ── 공유 상태 ──────────────────────────────────────────────────
let _photos         = [];
let _slots          = [];
let _selectedIds    = new Set();
let _popupSelIds    = new Set();
let _wsInited       = false;
let _dragPhotoId    = null;
let _dragSrcEl      = null;
let _popupSlotId    = null;
let _popupUsage     = null;
let _captionSlotId  = null;
let _previewPhotoIdx = 0;
let _baMode         = false;

// ── State setters (slot-editor / assign 전용 쓰기 인터페이스) ──
function _setPopupSlotId(id)           { _popupSlotId = id; }
function _clearPopupSelIds()           { _popupSelIds.clear(); }
function _togglePopupSelId(id)         { _popupSelIds.has(id) ? _popupSelIds.delete(id) : _popupSelIds.add(id); }
function _removePopupSelId(id)         { _popupSelIds.delete(id); }
function _setBAMode(val)               { _baMode = Boolean(val); }
function _setPopupUsage(val)           { _popupUsage = val; }
function _pushToPhotos(photo)          { _photos.push(photo); }
function _getSlot(id)                  { return _slots.find(s => s.id === id); }
function _filterSlotPhotos(slotId, fn) {
  const s = _slots.find(x => x.id === slotId);
  if (s) s.photos = s.photos.filter(fn);
}
function _setSlotStatus(slotId, status) {
  const s = _slots.find(x => x.id === slotId);
  if (s) s.status = status;
}

// ── 홈 탭 — 이어하기 섹션 ──────────────────────────────────────
async function renderHomeResume() {
  const section = document.getElementById('resume-section');
  if (!section) return;

  let slots = _slots;
  if (!slots || !slots.length) {
    try { slots = await loadSlotsFromDB(); } catch (_e) { slots = []; }
  }

  const active = slots.filter(s => s.status !== 'published' && (s.photos || []).length > 0);
  if (!active.length) { section.style.display = 'none'; return; }

  section.style.display = '';
  section.innerHTML = `
    <div class="sec-head" style="padding:0 2px;margin-bottom:10px;">
      <h2 class="home-sec-title">이어하기<span style="font-weight:500;font-size:12px;color:var(--text-subtle);margin-left:6px;">${active.length}개</span></h2>
      <button class="sec-more" onclick="showTab('finish', document.querySelectorAll('.nav-btn')[4])" data-haptic="light" style="font-size:12px;color:var(--brand);">
        전체<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
    <div class="list-menu">
      ${active.slice(0, 3).map(slot => {
        const thumb = slot.photos && slot.photos[0];
        const imgSrc = thumb ? (thumb.editedDataUrl || thumb.dataUrl || '') : '';
        const badgeText = slot.caption ? '글 완성' : (slot.photos && slot.photos.length ? '사진 ' + slot.photos.length + '장' : '작성중');
        return `
        <div class="list-menu__item" onclick="if(typeof openSlotEditor==='function')openSlotEditor('${slot.id}')" style="cursor:pointer;">
          <div class="list-menu__icon-box" style="${imgSrc ? 'padding:0;overflow:hidden;' : ''}">
            ${imgSrc
              ? `<img src="${imgSrc}" alt="" style="width:36px;height:36px;object-fit:cover;display:block;" loading="lazy">`
              : `<svg class="ic" aria-hidden="true"><use href="#ic-image"/></svg>`}
          </div>
          <div class="list-menu__body">
            <div class="list-menu__title">${slot.label || '제목 없음'}</div>
            <div class="list-menu__sub">${badgeText}</div>
          </div>
          <div class="list-menu__right">
            <svg class="ic ic--xs" aria-hidden="true"><use href="#ic-chevron-right"/></svg>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

window.renderHomeResume = renderHomeResume;

// ── 홈 탭 퀵액션 ───────────────────────────────────────────────
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

// ── 작업실 탭 초기화 ───────────────────────────────────────────
async function initWorkshopTab() {
  const root = document.getElementById('workshopRoot');
  if (!root) return;

  if (!_wsInited) {
    _wsInited = true;
    root.innerHTML = _buildWorkshopHTML();
    _initDragEvents();
  }

  try { _slots = await loadSlotsFromDB(); } catch (_e) { _slots = []; }
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

// ── 사진 업로드 ────────────────────────────────────────────────
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

  if (_slots.length === 0 && toAdd.length > 0) {
    const slot = { id: _uid(), label: '손님 1', order: 0, photos: [], caption: '', hashtags: '', status: 'open', instagramPublished: false, deferredAt: null, createdAt: Date.now() };
    _slots.push(slot);
    try { await saveSlotToDB(slot); } catch (_e) { /* ignore */ }
  }

  _renderPhotoGrid();
  _renderSlotCards();

  if (toAdd.length > 0) setTimeout(() => openAssignPopup(), 100);
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
    try { await deleteSlotFromDB(slot.id); } catch (_e) { /* ignore */ }
  }
  _photos = []; _slots = [];
  _selectedIds.clear(); _popupSelIds.clear();
  _wsInited = false;
  const root = document.getElementById('workshopRoot');
  if (root) { root.innerHTML = _buildWorkshopHTML(); _initDragEvents(); }
  showToast('초기화 완료 ✅');
}

// ── UI 상태 업데이트 ───────────────────────────────────────────
function _renderPhotoGrid() {
  const resetBtn = document.getElementById('wsResetBtn');
  if (resetBtn) resetBtn.style.display = (_photos.length > 0 || _slots.length > 0) ? 'block' : 'none';

  const pop = document.getElementById('_assignPopup');
  if (pop && pop.style.display === 'flex') _renderAssignPopup();
}

function _isAssigned(id) {
  return _slots.some(s => s.photos?.some(p => p.id === id));
}

function togglePhotoSelect(id) {
  _selectedIds.has(id) ? _selectedIds.delete(id) : _selectedIds.add(id);
  _updateAssignBottomSheet();
}

function _updateAssignBottomSheet() { _renderAssignPopup(); }

// ── 슬롯 카드 (가로 스크롤) ────────────────────────────────────
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
      ? `<div onclick="openSlotPopup('${slot.id}')" style="position:relative;width:100%;aspect-ratio:1/1;border-radius:10px;overflow:hidden;cursor:pointer;"><img src="${thumb.editedDataUrl || thumb.dataUrl}" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;">${photoCount > 1 ? `<div style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,0.6);border-radius:6px;padding:2px 6px;font-size:9px;color:#fff;font-weight:700;">+${photoCount}</div>` : ''}</div>`
      : `<div onclick="openAssignPopup()" style="width:100%;aspect-ratio:1/1;border-radius:10px;border:2px dashed rgba(241,128,145,0.35);display:flex;align-items:center;justify-content:center;cursor:pointer;background:rgba(241,128,145,0.03);font-size:20px;color:var(--text3);">+</div>`;

    card.innerHTML = `
      <button onclick="deleteSlot('${slot.id}',event)" style="position:absolute;top:6px;right:6px;z-index:2;background:rgba(255,255,255,0.9);border:none;font-size:12px;color:var(--text3);cursor:pointer;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;">✕</button>
      ${thumbHtml}
      <div style="margin-top:6px;text-align:center;">
        <div style="font-size:11px;font-weight:800;color:var(--text);">${slot.label}${done ? ' ✅' : ''}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;">${photoCount}장</div>
      </div>`;
    list.appendChild(card);
  });

  const resetBtn = document.getElementById('wsResetBtn');
  if (resetBtn) resetBtn.style.display = _slots.length > 0 ? 'block' : 'none';
}

async function deleteSlot(slotId, e) {
  e?.stopPropagation();
  const slot = _slots.find(s => s.id === slotId);
  if (slot) {
    slot.photos.forEach(sp => {
      if (!_photos.find(p => p.id === sp.id)) {
        _photos.push({ id: sp.id, file: null, dataUrl: sp.dataUrl });
      }
    });
  }
  _slots = _slots.filter(s => s.id !== slotId);
  try { await deleteSlotFromDB(slotId); } catch (_e) { /* ignore */ }
  await _renumberSlots();
  _renderSlotCards();
  _renderPhotoGrid();
  _renderCompletionBanner();
}

// ── 완료 현황 배너 ─────────────────────────────────────────────
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
  if (!banner) return;

  if (done > 0) {
    banner.style.display = 'block';
    const allDone  = done === total;
    const nextSlot = _slots.find(s => s.status !== 'done' && s.photos.length > 0)
                  || _slots.find(s => s.status !== 'done');
    if (allDone) {
      banner.innerHTML = `<div style="background:rgba(76,175,80,0.1);border:1.5px solid rgba(76,175,80,0.3);border-radius:16px;padding:14px 16px;"><div style="font-size:13px;font-weight:700;color:#388e3c;margin-bottom:10px;">🎉 모든 작업 완료!</div><button onclick="showTab('caption',document.querySelectorAll('.nav-btn')[2]); initCaptionSlotPicker(); if(typeof renderCaptionKeywordTags==='function')renderCaptionKeywordTags();" style="width:100%;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:13px;font-weight:800;cursor:pointer;">지금 글쓰기로 →</button></div>`;
    } else {
      const nextLabel = nextSlot ? nextSlot.label : '다음 손님';
      banner.innerHTML = `<div style="background:rgba(241,128,145,0.07);border:1.5px solid rgba(241,128,145,0.2);border-radius:16px;padding:14px 16px;"><div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:10px;">${nextLabel} 작업할까요? <span style="color:var(--text3);font-weight:400;">(완료 ${done}/${total})</span></div><div style="display:flex;gap:8px;">${nextSlot ? `<button onclick="openSlotPopup('${nextSlot.id}')" style="flex:1;padding:10px 14px;border-radius:10px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:12px;font-weight:700;cursor:pointer;">${nextLabel} →</button>` : ''}<button onclick="showTab('caption',document.querySelectorAll('.nav-btn')[2]); initCaptionSlotPicker(); if(typeof renderCaptionKeywordTags==='function')renderCaptionKeywordTags();" style="flex:1;padding:10px 14px;border-radius:10px;border:1.5px solid var(--accent);background:transparent;color:var(--accent);font-size:12px;font-weight:700;cursor:pointer;">지금 글쓰기로 →</button></div></div>`;
    }
  } else {
    banner.style.display = 'none';
  }
}

// ── 사진 배정 ──────────────────────────────────────────────────
function _assignToSlot(photoId, slotId) {
  const photo = _photos.find(p => p.id === photoId);
  const slot  = _slots.find(s => s.id === slotId);
  if (!photo || !slot || slot.photos.find(p => p.id === photoId)) return;
  slot.photos.push({ id: photo.id, dataUrl: photo.dataUrl, mode: 'original', editedDataUrl: null });
  saveSlotToDB(slot).catch(() => { /* ignore */ });
}

// ── 드래그 (Touch + Mouse) ─────────────────────────────────────
function _initDragEvents() {
  document.addEventListener('touchmove',  _moveDragInd,       { passive: true });
  document.addEventListener('mousemove',  _moveDragIndMouse);
  document.addEventListener('touchend',   _onDragEnd,         { passive: false });
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
