// Itdasy Studio - 리뷰 스티커 (app-gallery.js에서 분리)

// ═══════════════════════════════════════════════════════
// 리뷰 스티커 (Gemini Vision 텍스트 추출 + 감성 카드)
// ═══════════════════════════════════════════════════════
let _reviewEditState = null;
let _reviewStickerCache = [];

async function _smartCropScreenshot(dataUrl) {
  const img = await _loadImageSrc(dataUrl);
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const w = img.width, h = img.height;
  const data = ctx.getImageData(0, 0, w, h).data;

  function rowAvg(y) {
    let r = 0, g = 0, b = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      r += data[i]; g += data[i+1]; b += data[i+2];
    }
    return [r / w, g / w, b / w];
  }

  function rowDelta(y1, y2) {
    const a = rowAvg(y1), b = rowAvg(y2);
    return Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]) + Math.abs(a[2]-b[2]);
  }

  const DELTA = 30;
  const TOP_LIMIT = Math.min(Math.floor(h * 0.2), 250);
  const BOT_LIMIT = Math.max(Math.floor(h * 0.8), h - 250);

  let topCrop = 0;
  for (let y = 5; y < TOP_LIMIT; y++) {
    if (rowDelta(y - 1, y) > DELTA) { topCrop = y; break; }
  }
  let bottomCrop = h;
  for (let y = h - 5; y > BOT_LIMIT; y--) {
    if (rowDelta(y, y + 1) > DELTA) { bottomCrop = y; break; }
  }

  const cropH = bottomCrop - topCrop;
  if (cropH < h * 0.5) return dataUrl;

  const out = document.createElement('canvas');
  out.width = w; out.height = cropH;
  out.getContext('2d').drawImage(img, 0, topCrop, w, cropH, 0, 0, w, cropH);
  return out.toDataURL('image/png');
}

function openReviewPanel() {
  document.getElementById('reviewPanel').classList.add('ws-panel--open');
  _renderReviewPanel();
}
function closeReviewPanel() {
  document.getElementById('reviewPanel').classList.remove('ws-panel--open');
}

function _renderReviewPanel() {
  const body = document.getElementById('reviewPanelBody');
  if (!body) return;

  // 사진 선택 여부 — 미선택 시 가이드 노출 (사진 올려도 선택 안 됨 픽스 v2)
  const _slotForGuide = (typeof _slots !== 'undefined' && _slots.find) ? _slots.find(s => s.id === _popupSlotId) : null;
  const _selectedCount = (typeof _popupSelIds !== 'undefined' && _popupSelIds.size) ? _popupSelIds.size : 0;
  const _hasPhotos = !!(_slotForGuide && _slotForGuide.photos && _slotForGuide.photos.length);
  // 항상(스티커 업로드 후 사진 미선택 OR 슬롯에 사진 자체가 없음) 노란 가이드 배너 노출
  let guideHtml = '';
  if (_reviewStickerCache.length && _selectedCount === 0) {
    const msg = _hasPhotos
      ? '<strong>먼저 위쪽 사진을 1장 이상 선택해 주세요.</strong><br>그 다음 아래 리뷰 카드를 탭하면 사진에 붙여 드려요.'
      : '<strong>먼저 작업실에 사진을 추가하고 1장 이상 선택해 주세요.</strong><br>패널 닫고 사진 선택 후 다시 열면 카드가 활성화돼요.';
    guideHtml = `
    <div class="rv-guide" style="margin:8px 0 12px;padding:10px 12px;background:#FFF7E6;border:1px solid #FFD666;border-radius:10px;font-size:12px;color:#8a5d00;line-height:1.5;">${msg}</div>`;
  }

  const stickerHtml = _reviewStickerCache.length ? `
    <div class="rv-section">
      <div class="rv-section-label"><i class="ph-duotone ph-image" aria-hidden="true"></i> 업로드된 리뷰 (카드 탭 = 전체 사용)</div>
      ${guideHtml}
      <div class="rv-sticker-grid">
        ${_reviewStickerCache.map((s, i) => `
          <div class="rv-sticker-card" data-rv-card="${i}" role="button" tabindex="0"
               style="cursor:pointer;${_selectedCount === 0 ? 'opacity:0.55;' : ''}"
               onclick="selectReviewSticker(${i})"
               onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectReviewSticker(${i});}">
            <img src="${s}" class="rv-sticker-img">
            <div class="rv-card-meta">
              <div class="rv-stars">${'<i class="ph-duotone ph-star" aria-hidden="true"></i>'.repeat(5)}</div>
              <span class="rv-card-date">방금</span>
            </div>
            <div class="rv-sticker-actions" onclick="event.stopPropagation()">
              <button class="btn-secondary" onclick="event.stopPropagation();selectReviewSticker(${i})">전체 사용</button>
              <button class="btn-primary" onclick="event.stopPropagation();selectReviewTextOnly(${i})">텍스트만</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  body.innerHTML = `
    <div class="rv-section">
      <div class="rv-section-label"><i class="ph-duotone ph-image" aria-hidden="true"></i> 리뷰 스크린샷 업로드</div>
      <div class="rv-upload-zone" onclick="document.getElementById('reviewUploadInput').click()">
        <i class="ph-duotone ph-image" aria-hidden="true"></i>
        <div class="rv-upload-text">네이버/카톡 리뷰 캡처 올리기</div>
      </div>
      <input type="file" id="reviewUploadInput" accept="image/*" class="rv-file-input"
             onchange="handleReviewUpload(this)">
    </div>
    <div id="reviewExtractResult" class="rv-extract-result"></div>
    ${stickerHtml}
  `;
}

async function handleReviewUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const resultDiv = document.getElementById('reviewExtractResult');
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = `<div class="rv-loading">스크린샷 준비 중...</div>`;
  try {
    const rawUrl = await _fileToDataUrl(file);
    const dataUrl = await _smartCropScreenshot(rawUrl);
    _reviewStickerCache.unshift(dataUrl);
    if (_reviewStickerCache.length > 6) _reviewStickerCache.pop();
    resultDiv.innerHTML = `
      <div class="rv-screenshot-preview">
        <div class="rv-screenshot-label">업로드된 리뷰 스크린샷</div>
        <img src="${dataUrl}" class="rv-screenshot-img">
      </div>`;
    _renderReviewPanel();
    showToast('스크린샷이 추가됐어요! 아래에서 선택해 사진에 붙이세요!');
  } catch(e) {
    resultDiv.innerHTML = `<div class="rv-error">업로드 실패: ${e.message}</div>`;
  }
  input.value = '';
}

function selectReviewSticker(idx) {
  const slot = (typeof _slots !== 'undefined' && _slots.find) ? _slots.find(s => s.id === _popupSlotId) : null;
  if (!slot) {
    if (typeof showToast === 'function') showToast('작업실 슬롯에서 다시 시도해 주세요');
    return;
  }
  const selectedPhotos = slot.photos.filter(p => _popupSelIds.has(p.id) && !p.hidden);
  if (!selectedPhotos.length) {
    const hasAnyPhoto = !!(slot.photos && slot.photos.length);
    if (typeof showToast === 'function') {
      showToast(hasAnyPhoto ? '리뷰 패널을 닫고 사진을 1장 이상 선택해 주세요' : '먼저 작업실에 사진을 추가해 주세요');
    }
    return;
  }
  const stickerDataUrl = _reviewStickerCache[idx];
  if (!stickerDataUrl) {
    if (typeof showToast === 'function') showToast('리뷰 스크린샷을 다시 올려 주세요');
    return;
  }
  _reviewEditState = { photoId: selectedPhotos[0].id, allPhotoIds: selectedPhotos.map(p => p.id), stickerImg: stickerDataUrl, x: 50, y: 75, scale: 40, opacity: 100 };
  closeReviewPanel();
  _openReviewEditor(selectedPhotos[0]);
}
// 전역 등록 (onclick 인라인에서 호출되므로 명시적 보강)
try { if (typeof window !== 'undefined') { window.selectReviewSticker = selectReviewSticker; window.openReviewPanel = openReviewPanel; window.closeReviewPanel = closeReviewPanel; window.handleReviewUpload = handleReviewUpload; } } catch (_e) { void _e; }

function _openReviewEditor(photo) {
  const editor = document.getElementById('reviewEditor');
  const canvas = document.getElementById('reviewEditorCanvas');
  editor.classList.add('ws-editor--open');

  // 헤더: inline style → rv-editor-hdr 클래스
  const hdr = editor.children[0];
  if (hdr) {
    hdr.removeAttribute('style');
    hdr.className = 'rv-editor-hdr';
    const cancelBtn = hdr.children[0];
    const titleDiv  = hdr.children[1];
    const saveBtn   = hdr.children[2];
    if (cancelBtn) { cancelBtn.removeAttribute('style'); cancelBtn.className = 'rv-editor-cancel'; }
    if (titleDiv)  { titleDiv.removeAttribute('style');  titleDiv.className  = 'rv-editor-title'; }
    if (saveBtn)   { saveBtn.removeAttribute('style');   saveBtn.className   = 'rv-editor-save'; }
  }

  // 캔버스: inline style → CSS (#reviewEditorCanvas)
  canvas.removeAttribute('style');

  // 툴바: inline style → rv-toolbar 클래스
  const toolbar = editor.children[2];
  if (toolbar && !toolbar.classList.contains('rv-toolbar')) {
    toolbar.removeAttribute('style');
    toolbar.className = 'rv-toolbar';
    const scaleRow = toolbar.children[0];
    if (scaleRow) {
      scaleRow.removeAttribute('style');
      scaleRow.className = 'rv-scale-row';
      const label = scaleRow.children[0];
      const range = scaleRow.children[1];
      const val   = scaleRow.children[2];
      if (label) { label.removeAttribute('style'); label.className = 'rv-scale-label'; }
      if (range) { range.removeAttribute('style'); }
      if (val)   { val.removeAttribute('style');   val.className   = 'rv-scale-val'; }
    }
    const hint = toolbar.children[1];
    if (hint) { hint.removeAttribute('style'); hint.className = 'rv-hint'; }
  }

  canvas.innerHTML = `
    <div id="reviewEditWrap" class="rv-edit-wrap">
      <img src="${photo.editedDataUrl || photo.dataUrl}" class="rv-edit-base">
      <img id="reviewOverlay" src="${_reviewEditState.stickerImg}" class="rv-edit-overlay"
           style="left:${_reviewEditState.x}%;top:${_reviewEditState.y}%;width:${_reviewEditState.scale}%;opacity:${_reviewEditState.opacity/100};">
    </div>`;
  document.getElementById('reviewScale').value = _reviewEditState.scale;
  document.getElementById('reviewScaleVal').textContent = _reviewEditState.scale + '%';
  _setupReviewDrag();
}

function _setupReviewDrag() {
  const wrap = document.getElementById('reviewEditWrap');
  const overlay = document.getElementById('reviewOverlay');
  if (!wrap || !overlay) return;
  let dragging = false, startX, startY, startElemX, startElemY, pinching = false, startDist, startScale;
  const getPos = (x, y) => { const r = wrap.getBoundingClientRect(); return { x: ((x - r.left) / r.width) * 100, y: ((y - r.top) / r.height) * 100 }; };
  const update = () => { overlay.style.left = _reviewEditState.x + '%'; overlay.style.top = _reviewEditState.y + '%'; overlay.style.width = _reviewEditState.scale + '%'; overlay.style.opacity = _reviewEditState.opacity / 100; };
  wrap.addEventListener('touchstart', e => { e.preventDefault(); if (e.touches.length === 2) { pinching = true; startDist = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY); startScale = _reviewEditState.scale; } else { dragging = true; const p = getPos(e.touches[0].clientX, e.touches[0].clientY); startX = p.x; startY = p.y; startElemX = _reviewEditState.x; startElemY = _reviewEditState.y; } }, { passive: false });
  wrap.addEventListener('touchmove', e => { if (pinching && e.touches.length === 2) { const d = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY); _reviewEditState.scale = Math.max(15, Math.min(80, startScale * (d / startDist))); update(); e.preventDefault(); } else if (dragging) { const p = getPos(e.touches[0].clientX, e.touches[0].clientY); _reviewEditState.x = Math.max(10, Math.min(90, startElemX + (p.x - startX))); _reviewEditState.y = Math.max(10, Math.min(90, startElemY + (p.y - startY))); update(); } }, { passive: false });
  wrap.addEventListener('touchend', () => { dragging = false; pinching = false; });
  wrap.addEventListener('mousedown', e => { dragging = true; const p = getPos(e.clientX, e.clientY); startX = p.x; startY = p.y; startElemX = _reviewEditState.x; startElemY = _reviewEditState.y; e.preventDefault(); });
  // [PerfFix] AbortController로 window 리스너 누적 방지.
  if (window._dragAC_review) { try { window._dragAC_review.abort(); } catch (_e) { void _e; } }
  window._dragAC_review = new AbortController();
  const _dragSig = { signal: window._dragAC_review.signal };
  window.addEventListener('mousemove', e => { if (!dragging) return; const r = wrap.getBoundingClientRect(); const p = { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }; _reviewEditState.x = Math.max(10, Math.min(90, startElemX + (p.x - startX))); _reviewEditState.y = Math.max(10, Math.min(90, startElemY + (p.y - startY))); update(); }, _dragSig);
  window.addEventListener('mouseup', () => { dragging = false; }, _dragSig);
  wrap.addEventListener('wheel', e => { e.preventDefault(); _reviewEditState.scale = Math.max(15, Math.min(80, _reviewEditState.scale - e.deltaY * 0.05)); update(); }, { passive: false });
}

function updateReviewScale(val) {
  _reviewEditState.scale = parseInt(val);
  document.getElementById('reviewScaleVal').textContent = val + '%';
  const o = document.getElementById('reviewOverlay');
  if (o) o.style.width = val + '%';
}

function cancelReviewEdit() {
  document.getElementById('reviewEditor').classList.remove('ws-editor--open');
  _reviewEditState = null;
}

async function saveReviewEdit() {
  if (!_reviewEditState) return;
  const slot = _slots.find(s => s.id === _popupSlotId);
  if (!slot) return;
  const progress = document.getElementById('popupProgress');
  document.getElementById('reviewEditor').classList.remove('ws-editor--open');
  const photoIds = _reviewEditState.allPhotoIds;
  if (progress) { progress.style.display = 'block'; progress.textContent = `스티커 적용 중...`; }
  for (const pid of photoIds) {
    const photo = slot.photos.find(p => p.id === pid);
    if (!photo) continue;
    await _applyReviewToPhoto(photo, slot);
  }
  if (progress) progress.style.display = 'none';
  _popupSelIds.clear();
  _reviewEditState = null;
  _renderPopupPhotoGrid(slot);
  showToast(`${photoIds.length}장에 스티커 적용 완료!`);
}

async function _applyReviewToPhoto(photo, slot) {
  const state = _reviewEditState;
  const canvas = document.createElement('canvas');
  canvas.width = 1080; canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  const baseImg = await _loadImageSrc(photo.editedDataUrl || photo.dataUrl);
  _drawCoverCtx(ctx, baseImg, 0, 0, 1080, 1080);
  const stickerImg = await _loadImageSrc(state.stickerImg);
  const stickerW = 1080 * (state.scale / 100);
  const stickerH = stickerW * (stickerImg.height / stickerImg.width);
  ctx.globalAlpha = state.opacity / 100;
  ctx.drawImage(stickerImg, 1080 * (state.x / 100) - stickerW / 2, 1080 * (state.y / 100) - stickerH / 2, stickerW, stickerH);
  ctx.globalAlpha = 1;
  photo.editedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
  photo.mode = 'review_sticker';
  await saveSlotToDB(slot);
}


async function extractReviewTextRegion(dataUrl) {
  const blob = _dataUrlToBlob(dataUrl);
  const fd = new FormData();
  fd.append('file', blob, 'review.png');
  const res = await fetch(API + '/image/extract-review-region', {
    method: 'POST', headers: authHeader(), body: fd
  });
  if (res.status === 429) { showToast('오늘 텍스트 추출 한도를 다 썼어요'); throw new Error('한도초과'); }
  if (!res.ok) throw new Error('텍스트 영역 감지 실패');
  const region = await res.json();

  const img = await _loadImageSrc(dataUrl);
  const sx = Math.round(img.width * (region.left || 0));
  const sy = Math.round(img.height * (region.top || 0));
  const sw = Math.round(img.width * ((region.right || 1) - (region.left || 0)));
  const sh = Math.round(img.height * ((region.bottom || 1) - (region.top || 0)));
  if (sw < 10 || sh < 10) return dataUrl;

  const canvas = document.createElement('canvas');
  canvas.width = sw; canvas.height = sh;
  canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas.toDataURL('image/png');
}

async function selectReviewTextOnly(idx) {
  const slot = (typeof _slots !== 'undefined' && _slots.find) ? _slots.find(s => s.id === _popupSlotId) : null;
  if (!slot) { if (typeof showToast === 'function') showToast('작업실 슬롯에서 다시 시도해 주세요'); return; }
  const selectedPhotos = slot.photos.filter(p => _popupSelIds.has(p.id) && !p.hidden);
  if (!selectedPhotos.length) {
    const hasAnyPhoto = !!(slot.photos && slot.photos.length);
    if (typeof showToast === 'function') showToast(hasAnyPhoto ? '리뷰 패널을 닫고 사진을 1장 이상 선택해 주세요' : '먼저 작업실에 사진을 추가해 주세요');
    return;
  }
  showToast('텍스트 영역 찾는 중...');
  try {
    const textOnly = await extractReviewTextRegion(_reviewStickerCache[idx]);
    _reviewEditState = {
      photoId: selectedPhotos[0].id,
      allPhotoIds: selectedPhotos.map(p => p.id),
      stickerImg: textOnly,
      x: 50, y: 75, scale: 40, opacity: 100
    };
    closeReviewPanel();
    _openReviewEditor(selectedPhotos[0]);
  } catch(e) {
    showToast('텍스트 추출 실패. 전체 캡처로 붙일게요');
    selectReviewSticker(idx);
  }
}
try { if (typeof window !== 'undefined') { window.selectReviewTextOnly = selectReviewTextOnly; } } catch (_e) { void _e; }
