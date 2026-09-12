/* exported togglePhotoSelect */
// Itdasy Studio — 작업실 탭 핵심 (상태·업로드·슬롯카드)
// 의존: app-gallery-utils.js, app-gallery-db.js (먼저 로드)
// slot-editor / assign 이 읽는 setter 함수도 여기에 정의.

// ── 공유 상태 ──────────────────────────────────────────────────
let _photos         = [];
let _slots          = [];
let _selectedIds    = new Set();
let _popupSelIds    = new Set();
let _wsInited       = false;
let _popupSlotId    = null;
let _popupUsage     = null;
let _captionSlotId  = null;
let _previewPhotoIdx = 0;
let _baMode         = false;

function _wsEsc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[ch]);
}

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
      <button class="sec-more" data-ws-show-finish data-haptic="light" style="font-size:12px;color:var(--brand);">
        전체<svg width="12" height="12" aria-hidden="true"><use href="#ic-chevron-right"/></svg>
      </button>
    </div>
    <div class="list-menu">
      ${active.slice(0, 3).map(slot => {
        const thumb = slot.photos && slot.photos[0];
        const imgSrc = thumb ? (thumb.editedDataUrl || thumb.dataUrl || '') : '';
        const badgeText = slot.caption ? '글 완성' : (slot.photos && slot.photos.length ? '사진 ' + slot.photos.length + '장' : '작성중');
        return `
        <div class="list-menu__item" data-resume-slot="${_wsEsc(slot.id)}" style="cursor:pointer;">
          <div class="list-menu__icon-box" style="${imgSrc ? 'padding:0;overflow:hidden;' : ''}">
            ${imgSrc
              ? `<img src="${_wsEsc(imgSrc)}" alt="" style="width:36px;height:36px;object-fit:cover;display:block;" loading="lazy">`
              : `<i class="ph-duotone ph-image" aria-hidden="true"></i>`}
          </div>
          <div class="list-menu__body">
            <div class="list-menu__title">${_wsEsc(slot.label || '제목 없음')}</div>
            <div class="list-menu__sub">${_wsEsc(badgeText)}</div>
          </div>
          <div class="list-menu__right">
            <svg width="14" height="14" aria-hidden="true"><use href="#ic-chevron-right"/></svg>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  section.querySelector('[data-ws-show-finish]')?.addEventListener('click', () => {
    showTab('finish', document.querySelector('.tab-bar__btn[data-tab="finish"]'));
  });
  section.querySelectorAll('[data-resume-slot]').forEach(item => {
    item.addEventListener('click', () => {
      if (typeof openSlotEditor === 'function') openSlotEditor(item.dataset.resumeSlot);
    });
  });
}

window.renderHomeResume = renderHomeResume;

// ── 작업실 탭 초기화 ───────────────────────────────────────────
//   [2026-07-14] Workspace V2 가 작업실의 유일한 셸이다. 기존 셸로 되돌아가는 폴백 + ITDASY_WORKSPACE_V2
//   플래그 제거 — 플래그는 true 하드코딩이라 분기가 죽어 있었고, 폴백은 V2 렌더가 throw 할 때만 도달하는데
//   console.warn 뿐이라 발화해도 아무도 몰랐다. 게다가 그 안에서 이미 죽은 드래그 초기화를 부르고 있었다
//   = 테스트되지 않아 썩은 안전망. 실패는 조용히 감추는 대신 소리나게 알린다.
//   (아래 레거시 셸 함수들은 이제 호출자가 없다 — highlightWorkshopSlot 의 .ws-slot-card 셀렉터를
//    V2 타일로 고치는 작업과 함께 별도 정리 예정.)
async function initWorkshopTab() {
  const root = document.getElementById('workshopRoot');
  if (!root) return;

  let slots;
  /* [2026-09-12 BUG-W1] 실패를 **빈 배열로 바꾸지 않는다.**
     예전엔 catch 에서 `slots = []` 로 두고 그대로 렌더해서, DB 가 잠겨 못 읽었을 때도
     "위 새 게시물을 눌러 첫 글을 만들어보세요" 가 떴다. 토스트는 몇 초 뒤 사라지고
     화면엔 **손님이 글을 하나도 안 쓴 것처럼** 남는다 — 서버엔 멀쩡히 있는데도.
     같은 파일의 refresh() 는 이미 "가진 걸 없애면 더 나쁘다" 며 화면을 지키는데
     첫 진입만 안 지키고 있었다. 실패 사실을 렌더까지 들고 간다. */
  let loadFailed = false;
  try { slots = await loadSlotsFromDB(); }
  catch (e) {
    // [2026-06-10] 침묵 실패 픽스 — 슬롯이 있는데 빈 화면으로 보이던 문제
    console.warn('[workshop] 슬롯 불러오기 실패', e);
    slots = [];
    loadFailed = true;
    if (window.showToast) window.showToast('작업 내역을 불러오지 못했어요 — 새로고침해 주세요');
  }
  _slots = slots || [];

  if (!(window.WorkspaceV2 && typeof window.WorkspaceV2.render === 'function')) {
    console.error('[workshop] WorkspaceV2 미로드');
    if (window.showToast) window.showToast('작업실을 불러오지 못했어요 — 새로고침해 주세요');
    return;
  }
  try {
    window.WorkspaceV2.render(root, { slots: _slots, loadFailed: loadFailed });
  } catch (e) {
    console.error('[workshop] V2 렌더 실패', e);
    if (window.showToast) window.showToast('작업실을 여는 중 문제가 생겼어요 — 새로고침해 주세요');
  }
}

function _buildWorkshopHTML() {
  return `
  <section class="greet">
    <p class="status-line">사진을 올리면 글까지 자동으로.</p>
    <h1>오늘 작업</h1>
  </section>

  <!-- [2026-05-05 19차-A] 빈 상태 — 풀스크린 .ws-empty 패턴 -->
  <div id="wsDropZone" class="ws-empty" data-ws-drop-zone>
    <input type="file" id="galleryFileInput" data-ws-upload-input accept="image/*" multiple style="display:none;">
    <div class="ws-empty__icon" aria-hidden="true">
      <i class="ph-duotone ph-camera" style="font-size:32px" aria-hidden="true"></i>
    </div>
    <h2 class="ws-empty__title">사진 올려서 시작</h2>
    <p class="ws-empty__sub">최대 20장 · AI가 손님별 자동 정리</p>
    <div class="ws-empty__bottom">
      <button type="button" class="ws-empty__cta" data-ws-upload-cta>사진 선택</button>
    </div>
  </div>

  <div class="ws-top-row">
    <button id="wsResetBtn" data-ws-reset class="ws-reset-btn" style="display:none;">처음부터</button>
    <div id="wsCompletionBadge" class="ws-badge"></div>
  </div>

  <div id="slotCardHeader" style="display:none;margin-bottom:12px;">
    <div class="ws-slot-head">
      <span class="ws-slot-label">손님별 사진</span>
      <div style="display:flex;align-items:center;gap:8px;">
        <span id="wsCompletionCount" class="ws-completion-count"></span>
        <button data-ws-assign class="ws-assign-btn">사진 나누기</button>
      </div>
    </div>
    <p class="ws-slot-hint">탭해서 편집해요</p>
  </div>
  <div id="slotCardList" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;padding:4px 0 12px;"></div>
  <div id="wsBanner" style="display:none;margin-bottom:8px;"></div>
  `;
}

function _bindWorkshopShell(root) {
  if (!root || root.dataset.wsShellBound === '1') return;
  root.dataset.wsShellBound = '1';
  root.addEventListener('click', e => {
    const t = e.target.closest('[data-ws-drop-zone],[data-ws-upload-cta],[data-ws-reset],[data-ws-assign]');
    if (!t || !root.contains(t)) return;
    if (t.matches('[data-ws-upload-cta]')) e.stopPropagation();
    if (t.matches('[data-ws-drop-zone],[data-ws-upload-cta]')) {
      document.getElementById('galleryFileInput')?.click();
    } else if (t.matches('[data-ws-reset]')) {
      resetWorkshop();
    } else if (t.matches('[data-ws-assign]')) {
      openAssignPopup();
    }
  });
  root.addEventListener('change', e => {
    if (e.target && e.target.matches('[data-ws-upload-input]')) handleGalleryUpload(e.target);
  });
  root.addEventListener('dragover', e => {
    const zone = e.target.closest('[data-ws-drop-zone]');
    if (!zone) return;
    e.preventDefault();
    zone.classList.add('is-drag');
  });
  root.addEventListener('dragleave', e => {
    const zone = e.target.closest('[data-ws-drop-zone]');
    if (zone) zone.classList.remove('is-drag');
  });
  root.addEventListener('drop', e => {
    const zone = e.target.closest('[data-ws-drop-zone]');
    if (!zone) return;
    zone.classList.remove('is-drag');
    _handleDropZoneDrop(e);
  });
  root.addEventListener('contextmenu', e => {
    if (e.target.closest('[data-ws-drop-zone]')) e.preventDefault();
  });
}

// ── 사진 업로드 ────────────────────────────────────────────────
async function handleGalleryUpload(input) {
  let files = Array.isArray(input) ? input : Array.from(input.files || []);
  // [2026-06-10] 아이폰 HEIC → JPG 자동 변환 (js/heic-convert.js, 실패 파일은 토스트 후 제외)
  if (window.HeicConvert && files.some(window.HeicConvert.isHeic)) {
    files = await window.HeicConvert.normalizeAll(files);
  }
  const remaining = 20 - _photos.length;
  const toAdd     = files.slice(0, remaining);
  if (files.length > remaining) showToast(`최대 20장까지 가능해요 (${remaining}장 추가됨)`);
  if (!Array.isArray(input)) input.value = '';
  const zone = document.getElementById('wsDropZone');
  if (zone) { zone.style.borderColor = ''; zone.style.background = ''; }

  // dataUrl 변환 후 newPhotos 로 따로 수집
  const newPhotos = [];
  for (let file of toAdd) {
    // [A9] 2MB 초과 이미지 리사이징
    if (typeof _resizeIfNeeded === 'function') file = await _resizeIfNeeded(file);
    const photo = { id: _uid(), file, dataUrl: await _fileToDataUrl(file) };
    newPhotos.push(photo);
    _photos.push(photo);
  }

  // 자동 그룹: file.lastModified 시간순 정렬 → 30분 간격 기준 슬롯 자동 분류
  let autoGroups = [];
  if (newPhotos.length > 0) {
    const GAP_MS = 30 * 60 * 1000;
    const sorted = [...newPhotos].sort((a, b) => (a.file?.lastModified || 0) - (b.file?.lastModified || 0));

    let currentGroup = [];
    let prevTime = null;
    sorted.forEach(photo => {
      const t = photo.file?.lastModified || Date.now();
      if (prevTime !== null && t - prevTime > GAP_MS) {
        if (currentGroup.length > 0) autoGroups.push(currentGroup);
        currentGroup = [];
      }
      currentGroup.push(photo);
      prevTime = t;
    });
    if (currentGroup.length > 0) autoGroups.push(currentGroup);

    const startNum = _slots.length + 1;
    for (let i = 0; i < autoGroups.length; i++) {
      const slot = {
        id: _uid(),
        label: `손님 ${startNum + i}`,
        order: _slots.length,
        photos: autoGroups[i],
        caption: '',
        hashtags: '',
        status: 'open',
        instagramPublished: false,
        deferredAt: null,
        createdAt: Date.now(),
      };
      _slots.push(slot);
      try { await saveSlotToDB(slot); } catch (_e) { /* ignore */ }
    }

    // 슬롯에 배정된 사진은 미배정 풀(_photos)에서 제거
    const assignedIds = new Set(newPhotos.map(p => p.id));
    _photos = _photos.filter(p => !assignedIds.has(p.id));
  }

  _scheduleBatchRender({ photoGrid: true, slotCards: true });

  if (autoGroups.length > 0) {
    showToast(`${autoGroups.length}명 손님으로 자동 분류했어요 ✓`);
    _showAutoGroupBanner(autoGroups.length);
  }
}

async function _handleDropZoneDrop(e) {
  e.preventDefault();
  // [2026-06-10] HEIC 는 type 이 비어 오는 브라우저가 있어 확장자 판별 추가 (변환은 handleGalleryUpload 에서)
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || (window.HeicConvert && window.HeicConvert.isHeic(f)));
  if (!files.length) { showToast('이미지 파일만 올릴 수 있어요'); return; }
  await handleGalleryUpload(files);
}

async function resetWorkshop() {
  // [2026-06-10] _confirm2 deprecated 스텁(항상 false) → 초기화 버튼 무반응이던 버그 픽스
  const _msg = '전체 초기화할까요?\n모든 사진과 슬롯이 삭제됩니다.';
  if (window._inlineConfirm) { window._inlineConfirm(_msg, () => _doResetWorkshop()); return; }
  if (!confirm(_msg)) return;
  return _doResetWorkshop();
}

async function _doResetWorkshop() {
  for (const slot of _slots) {
    try { await deleteSlotFromDB(slot.id); } catch (_e) { /* ignore */ }
  }
  _photos = []; _slots = [];
  _selectedIds.clear(); _popupSelIds.clear();
  _wsInited = false;
  const root = document.getElementById('workshopRoot');
  if (root) { root.innerHTML = _buildWorkshopHTML(); _bindWorkshopShell(root); }
  showToast('초기화 완료 ✅');
}

// [PERF P3-1] 배치 렌더 — 여러 렌더 함수를 requestAnimationFrame 1회로 묶음
let _batchRenderScheduled = false;
let _batchRenderFlags = { photoGrid: false, slotCards: false, banner: false };

function _scheduleBatchRender(flags) {
  Object.assign(_batchRenderFlags, flags);
  if (_batchRenderScheduled) return;
  _batchRenderScheduled = true;
  requestAnimationFrame(() => {
    _batchRenderScheduled = false;
    const f = _batchRenderFlags;
    _batchRenderFlags = { photoGrid: false, slotCards: false, banner: false };
    if (f.photoGrid) _renderPhotoGrid();
    if (f.slotCards) _renderSlotCards();
    if (f.banner) _renderCompletionBanner();
  });
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

// ── 슬롯 카드 즉시 고객 매핑 ──────────────────────────────────
async function _pickCustomerForWorkshopSlot(slotId) {
  const slot = _slots.find(s => s.id === slotId);
  if (!slot) return;
  if (!window.Customer || !window.Customer.pick) {
    showToast('고객 관리 모듈이 아직 로드되지 않았어요');
    return;
  }
  const picked = await window.Customer.pick({ selectedId: slot.customer_id });
  if (picked === null) return;
  slot.customer_id = picked.id;
  slot.customer_name = picked.name;
  if (/^손님\s?\d+$/.test(slot.label)) slot.label = picked.name;
  try { await saveSlotToDB(slot); } catch (_e) { /* ignore */ }
  _renderSlotCards();
}
window._pickCustomerForWorkshopSlot = _pickCustomerForWorkshopSlot;

// ── 슬롯 카드 (가로 스크롤) ────────────────────────────────────
function _renderSlotCards() {
  const list   = document.getElementById('slotCardList');
  const header = document.getElementById('slotCardHeader');
  const completionEl = document.getElementById('wsCompletionCount');
  if (!list) return;

  const dropZone = document.getElementById('wsDropZone');
  if (dropZone) dropZone.style.display = _slots.length === 0 ? 'block' : 'none';

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
    card.className = 'ws-slot-card' + (done ? ' ws-slot-card--done' : '');
    card.dataset.slotId = slot.id;
    card.setAttribute('oncontextmenu', 'return false');

    const thumbSrc = thumb ? (thumb.editedDataUrl || thumb.dataUrl || '') : '';
    const thumbHtml = thumb
      ? `<div class="ws-slot-card__thumb"><img src="${_wsEsc(thumbSrc)}" alt="">${photoCount > 1 ? `<div class="ws-slot-card__thumb-count">+${photoCount}</div>` : ''}</div>`
      : `<div class="ws-slot-card__empty" data-ws-assign-empty><i class="ph-duotone ph-plus" aria-hidden="true"></i></div>`;

    card.innerHTML = `
      <button data-ws-delete-slot class="ws-slot-card__del" aria-label="삭제">
        <svg width="10" height="10" aria-hidden="true"><use href="#ic-x"/></svg>
      </button>
      <button data-ws-edit-slot style="position:absolute;top:30px;right:6px;width:26px;height:26px;border-radius:999px;background:rgba(15,20,25,0.78);border:none;color:#fff;cursor:pointer;display:grid;place-items:center;z-index:2;" aria-label="사진 편집">
        <i class="ph-duotone ph-pencil-simple" style="font-size:13px" aria-hidden="true"></i>
      </button>
      ${thumbHtml}
      <div class="ws-slot-card__meta">
        <div class="ws-slot-card__name">${_wsEsc(slot.label)}${done ? `<i class="ph-duotone ph-check-circle" aria-hidden="true"></i>` : ''}</div>
        <div class="ws-slot-card__count">${photoCount}장</div>
        ${slot.customer_name
          ? `<div style="display:inline-flex;align-items:center;gap:3px;font-size:11px;color:var(--accent,var(--brand));font-weight:700;margin-top:2px;"><i class="ph-duotone ph-user" style="font-size:11px" aria-hidden="true"></i>${_wsEsc(slot.customer_name)}</div>`
          : `<button data-ws-pick-customer style="background:none;border:none;color:var(--accent,var(--brand));font-size:11px;font-weight:700;cursor:pointer;padding:2px 0;display:inline-flex;align-items:center;gap:3px;margin-top:2px;"><i class="ph-duotone ph-user" style="font-size:11px" aria-hidden="true"></i>고객 지정하기 →</button>`
        }
      </div>`;
    card.querySelector('[data-ws-delete-slot]')?.addEventListener('click', event => {
      event.stopPropagation();
      deleteSlot(slot.id, event);
    });
    card.querySelector('[data-ws-edit-slot]')?.addEventListener('click', event => {
      event.stopPropagation();
      openSlotPopup(slot.id);
    });
    card.querySelector('[data-ws-pick-customer]')?.addEventListener('click', event => {
      event.stopPropagation();
      _pickCustomerForWorkshopSlot(slot.id);
    });
    card.querySelector('[data-ws-assign-empty]')?.addEventListener('click', event => {
      event.stopPropagation();
      openAssignPopup();
    });

    // 카드 자체 클릭 → 글쓰기 직행 (사진 있는 슬롯만)
    if (thumb) {
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => {
        _enterCaptionFromWorkshop();   // [핫픽스F #2] 복귀 경로(작업실) 보존 — 먼저 무장 후 탭 전환
        showTab('caption', document.querySelector('.tab-bar__fab[data-tab="caption"]'));
        if (typeof loadSlotForCaption === 'function') loadSlotForCaption(slot.id);
        if (typeof initCaptionSlotPicker === 'function') initCaptionSlotPicker();
      });
    }
    list.appendChild(card);
  });

  // 2열 그리드 마지막 칸 +추가 카드 — column-span 동적 (짝수→풀폭, 홀수→옆 칸)
  const N = _slots.length;
  const span = N % 2 === 0 ? 2 : 1;

  const addCard = document.createElement('div');
  addCard.className = 'ws-slot-card-add';
  addCard.style.cssText = `grid-column:span ${span};aspect-ratio:${span}/1;border-radius:16px;background:var(--bg2,#f8f8f9);border:1.5px dashed var(--border,rgba(15,20,25,0.10));display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;cursor:pointer;user-select:none;transition:border-color 0.15s;`;
  addCard.innerHTML = `
    <div style="width:36px;height:36px;border-radius:50%;background:#fff;display:grid;place-items:center;color:var(--accent,var(--brand));">
      <i class="ph-duotone ph-plus" style="font-size:18px" aria-hidden="true"></i>
    </div>
    <div style="font-size:12px;font-weight:700;color:var(--text2,#5A6573);">사진 추가</div>
  `;
  addCard.addEventListener('mouseenter', () => { addCard.style.borderColor = 'var(--accent,var(--brand))'; });
  addCard.addEventListener('mouseleave', () => { addCard.style.borderColor = 'var(--border,rgba(15,20,25,0.10))'; });
  addCard.addEventListener('click', () => {
    const input = document.getElementById('galleryFileInput');
    if (input) input.click();
  });
  list.appendChild(addCard);

  const resetBtn = document.getElementById('wsResetBtn');
  if (resetBtn) resetBtn.style.display = _slots.length > 0 ? 'block' : 'none';
}

// [핫픽스F #2] 작업실/사진슬롯 → 캡션 진입 시 복귀 경로(작업실) 보존.
//   캡션 탭엔 back 버튼이 없어 시스템 back 이 홈/사진모드로 튀던 문제 → "‹ 작업실로" 버튼 + 시트백 등록으로 작업실 복귀.
function _backToWorkshopFromCaption() {
  try { window._captionReturnTab = null; } catch (_e) { void _e; }
  try { if (typeof window._markSheetClosed === 'function') window._markSheetClosed('captionWork'); } catch (_e) { void _e; }
  const wsBtn = document.querySelector('.tab-bar__fab[data-tab="workshop"]')
    || document.querySelector('.tab-bar__btn[data-tab="workshop"]')
    || document.querySelector('[data-tab="workshop"]');
  showTab('workshop', wsBtn);
  if (typeof initWorkshopTab === 'function') { try { initWorkshopTab(); } catch (_e) { void _e; } }
}

function _ensureCaptionBackBtn() {
  const tab = document.getElementById('tab-caption');
  if (!tab) return;
  let btn = document.getElementById('captionBackToWork');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'captionBackToWork';
    btn.type = 'button';
    btn.setAttribute('data-haptic', 'light');
    btn.textContent = '‹ 작업실로';
    btn.style.cssText = 'align-items:center;gap:4px;margin:0 0 10px;padding:8px 14px;border:1px solid var(--border,#E5E8EB);border-radius:999px;background:#fff;color:var(--text,#191F28);font-size:13px;font-weight:700;cursor:pointer;';
    btn.addEventListener('click', _backToWorkshopFromCaption);
    const inner = tab.querySelector('div');
    if (inner) inner.insertBefore(btn, inner.firstChild); else tab.insertBefore(btn, tab.firstChild);
  }
  btn.style.display = 'inline-flex';
}

function _enterCaptionFromWorkshop() {
  try { window._captionReturnTab = 'workshop'; } catch (_e) { void _e; }
  // 시스템(안드로이드/브라우저) back → 작업실 복귀(홈/사진모드로 안 튀게). 시트백 레지스트리 재사용.
  try {
    if (typeof window._registerSheet === 'function') window._registerSheet('captionWork', _backToWorkshopFromCaption);
    if (typeof window._markSheetOpen === 'function') window._markSheetOpen('captionWork');
  } catch (_e) { void _e; }
  _ensureCaptionBackBtn();
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
  _scheduleBatchRender({ photoGrid: true, slotCards: true, banner: true });
}

// ── 완료 현황 배너 ─────────────────────────────────────────────
function _showAutoGroupBanner(count) {
  const banner = document.getElementById('wsBanner');
  if (!banner) return;
  banner.style.display = 'block';
  banner.dataset.autoGroupCount = String(count);
  banner.innerHTML = `
    <div style="background:var(--brand-bg,#FCEEF1);border:1px solid var(--accent,var(--brand));border-radius:14px;padding:13px 14px;margin-bottom:14px;display:flex;align-items:center;gap:11px;">
      <div style="width:32px;height:32px;border-radius:50%;background:#fff;display:grid;place-items:center;color:var(--accent,var(--brand));flex-shrink:0;">
        <i class="ph-duotone ph-check" style="font-size:16px" aria-hidden="true"></i>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:800;color:var(--accent,var(--brand));letter-spacing:-0.2px;">${count}명 손님으로 자동 분류했어요</div>
        <div style="font-size:11px;color:var(--text2,#5A6573);margin-top:2px;">촬영 시각 30분 기준 · 다르면 수정/합치기</div>
      </div>
      <button data-ws-auto-edit style="padding:6px 12px;background:#fff;border:1px solid var(--border,rgba(15,20,25,0.08));border-radius:999px;font-size:11px;font-weight:700;color:var(--text,#0F1419);cursor:pointer;flex-shrink:0;">수정</button>
      <button data-ws-auto-merge data-count="${count}" style="padding:6px 12px;background:#fff;border:1px solid var(--border,rgba(15,20,25,0.08));border-radius:999px;font-size:11px;font-weight:700;color:var(--text,#0F1419);cursor:pointer;flex-shrink:0;">합치기</button>
      <button data-ws-banner-close style="width:24px;height:24px;background:transparent;border:none;color:var(--text3,#98A1AC);cursor:pointer;display:grid;place-items:center;flex-shrink:0;" aria-label="닫기">
        <svg width="14" height="14" aria-hidden="true"><use href="#ic-x"/></svg>
      </button>
    </div>
  `;
  _bindWsBanner(banner);
}

function _bindWsBanner(banner) {
  if (!banner || banner.dataset.wsBannerBound === '1') return;
  banner.dataset.wsBannerBound = '1';
  banner.addEventListener('click', e => {
    const t = e.target.closest('[data-ws-auto-edit],[data-ws-auto-merge],[data-ws-banner-close],[data-ws-caption],[data-ws-next-slot]');
    if (!t || !banner.contains(t)) return;
    if (t.matches('[data-ws-auto-edit]')) return openAssignPopup();
    if (t.matches('[data-ws-auto-merge]')) return _mergeAutoGroups(Number(t.dataset.count || 0));
    if (t.matches('[data-ws-banner-close]')) { banner.style.display = 'none'; return; }
    if (t.matches('[data-ws-next-slot]')) return openSlotPopup(t.dataset.slotId);
    if (t.matches('[data-ws-caption]')) {
      _enterCaptionFromWorkshop();   // [핫픽스F #2] 복귀 경로(작업실) 보존
      showTab('caption', document.querySelector('.tab-bar__fab[data-tab="caption"]'));
      initCaptionSlotPicker();
      if (typeof renderCaptionKeywordTags === 'function') renderCaptionKeywordTags();
    }
  });
}

// [2026-05-05 18차-B] 자동 분류된 슬롯 합치기 — 마지막 N 슬롯의 photos 를
// 첫 슬롯에 모으고 나머지 N-1개 슬롯을 _slots + DB 에서 제거. 재렌더 + 토스트.
async function _mergeAutoGroups(count) {
  if (!count || count < 2) {
    if (typeof showToast === 'function') showToast('합칠 슬롯이 부족해요');
    return;
  }
  if (!Array.isArray(_slots) || _slots.length < count) return;
  // [2026-06-10] _confirm2 deprecated 스텁(항상 false) → 합치기 무반응이던 버그 픽스
  const _msg = `최근 ${count}개 슬롯을 1개로 합칠까요?`;
  if (window._inlineConfirm) { window._inlineConfirm(_msg, () => _doMergeAutoGroups(count)); return; }
  if (!confirm(_msg)) return;
  return _doMergeAutoGroups(count);
}

async function _doMergeAutoGroups(count) {
  const targets = _slots.slice(-count);
  const keep = targets[0];
  const drop = targets.slice(1);

  // 1) 모든 photos 를 keep 에 합침 (순서 유지)
  keep.photos = drop.reduce((acc, s) => acc.concat(s.photos || []), keep.photos || []);

  // 2) DB 에서 drop 슬롯 제거 (병렬, 실패 무시 — UI 일관성 우선)
  await Promise.all(drop.map(s =>
    (typeof deleteSlotFromDB === 'function' ? deleteSlotFromDB(s.id).catch(() => {}) : Promise.resolve())
  ));

  // 3) _slots 에서 drop id 제거
  const dropIds = new Set(drop.map(s => s.id));
  _slots = _slots.filter(s => !dropIds.has(s.id));

  // 4) keep 갱신 저장
  try { if (typeof saveSlotToDB === 'function') await saveSlotToDB(keep); } catch (_e) { /* ignore */ }

  // 5) 배너 닫고 재렌더 + 토스트
  const banner = document.getElementById('wsBanner');
  if (banner) banner.style.display = 'none';
  if (typeof _renderSlotCards === 'function') _renderSlotCards();
  if (typeof showToast === 'function') showToast('1개 슬롯으로 합쳤어요');
}
window._mergeAutoGroups = _mergeAutoGroups;

// [2026-06-11 B8] 잇비 "저장한 카드 보여줘" — 작업실 리스트 갱신 후 해당 슬롯 스크롤+하이라이트
window.highlightWorkshopSlot = async function (slotId) {
  try { await initWorkshopTab(); } catch (_e) { void _e; }
  // [activeCard P0] 작업실에서 띄운 슬롯을 '활성 카드'로 기억 — 이후 "그거 수정/저장"이 이 슬롯을 가리킨다.
  try {
    const _s = (_slots || []).find(s => s && s.id === slotId);
    if (_s && window.ItbiActiveCard) {
      window.ItbiActiveCard.set({ purpose: (_s.templateMeta && _s.templateMeta.purpose) || 'generic', label: _s.label || '카드', templateId: (_s.templateMeta && _s.templateMeta.templateId) || null, slotId: _s.id, available: true, origin: 'workshop' });
    }
  } catch (_e) { void _e; }
  // [2026-07-14] 작업실 타일은 V2(`[data-wsv2-slot]`)가 그린다. 예전엔 레거시 셸이 그리던
  //   `.ws-slot-card[data-slot-id]` 를 찾고 있어서 V2 전환 이후 늘 못 찾고 false 만 반환했다
  //   (= 잇비 "그거 보여줘" 가 조용히 아무 일도 안 함). 셀렉터만 V2 타일로 교체.
  //   위 initWorkshopTab 이 렌더까지 await 했고 V2.render 는 동기라 여기서 바로 조회된다.
  const sel = '[data-wsv2-slot="' + (window.CSS && CSS.escape ? CSS.escape(String(slotId)) : String(slotId).replace(/"/g, '')) + '"]';
  const card = document.querySelector(sel);
  if (!card) return false;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.style.transition = 'box-shadow 0.3s';
  card.style.boxShadow = '0 0 0 3px var(--accent, #D58A95)';
  setTimeout(() => { card.style.boxShadow = ''; }, 2200);
  return true;
};

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
      banner.innerHTML = `<div style="background:rgba(76,175,80,0.1);border:1.5px solid rgba(76,175,80,0.3);border-radius:16px;padding:14px 16px;"><div style="font-size:13px;font-weight:700;color:#388e3c;margin-bottom:10px;">모든 작업 완료!</div><button data-ws-caption style="width:100%;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:13px;font-weight:800;cursor:pointer;">지금 글쓰기로 →</button></div>`;
    } else {
      const nextLabel = nextSlot ? nextSlot.label : '다음 손님';
      banner.innerHTML = `<div style="background:rgba(213,138,149,0.07);border:1.5px solid rgba(213,138,149,0.2);border-radius:16px;padding:14px 16px;"><div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:10px;">${_wsEsc(nextLabel)} 작업할까요? <span style="color:var(--text3);font-weight:400;">(완료 ${done}/${total})</span></div><div style="display:flex;gap:8px;">${nextSlot ? `<button data-ws-next-slot data-slot-id="${_wsEsc(nextSlot.id)}" style="flex:1;padding:10px 14px;border-radius:10px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:12px;font-weight:700;cursor:pointer;">${_wsEsc(nextLabel)} →</button>` : ''}<button data-ws-caption style="flex:1;padding:10px 14px;border-radius:10px;border:1.5px solid var(--accent);background:transparent;color:var(--accent);font-size:12px;font-weight:700;cursor:pointer;">지금 글쓰기로 →</button></div></div>`;
    }
    _bindWsBanner(banner);
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

window.togglePhotoSelect = togglePhotoSelect;
