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
  document.getElementById('reviewPanel').style.display = 'block';
  _renderReviewPanel();
}
function closeReviewPanel() {
  document.getElementById('reviewPanel').style.display = 'none';
}

function _renderReviewPanel() {
  const body = document.getElementById('reviewPanelBody');
  if (!body) return;
  body.innerHTML = `
    <div style="margin-bottom:16px;">
      <div style="font-size:12px;font-weight:700;color:var(--text3);margin-bottom:10px;">📸 리뷰 스크린샷 업로드</div>
      <div style="text-align:center;padding:20px;border:2px dashed var(--border);border-radius:14px;cursor:pointer;background:var(--bg2);" onclick="document.getElementById('reviewUploadInput').click()">
        <div style="font-size:32px;margin-bottom:8px;">📱</div>
        <div style="font-size:13px;color:var(--text2);font-weight:600;">네이버/카톡 리뷰 캡처 올리기</div>
      </div>
      <input type="file" id="reviewUploadInput" accept="image/*" style="display:none;" onchange="handleReviewUpload(this)">
    </div>
    <div id="reviewExtractResult" style="display:none;margin-bottom:16px;"></div>
    ${_reviewStickerCache.length ? `<div style="margin-bottom:16px;"><div style="font-size:12px;font-weight:700;color:var(--text3);margin-bottom:10px;">📸 업로드된 리뷰 (탭해서 선택)</div><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">${_reviewStickerCache.map((s,i) => `<div style="border-radius:12px;overflow:hidden;border:1.5px solid var(--border);"><img src="${s}" style="width:100%;display:block;"><div style="display:flex;gap:4px;padding:6px;"><button onclick="selectReviewSticker(${i})" style="flex:1;padding:6px;border:none;border-radius:8px;background:var(--bg3);font-size:11px;font-weight:700;cursor:pointer;">전체 사용</button><button onclick="selectReviewTextOnly(${i})" style="flex:1;padding:6px;border:none;border-radius:8px;background:var(--accent);color:#fff;font-size:11px;font-weight:700;cursor:pointer;">텍스트만</button></div></div>`).join('')}</div></div>` : ''}
  `;
}

async function handleReviewUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const resultDiv = document.getElementById('reviewExtractResult');
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text3);">스크린샷 준비 중... ✨</div>`;
  try {
    const rawUrl = await _fileToDataUrl(file);
    const dataUrl = await _smartCropScreenshot(rawUrl);
    _reviewStickerCache.unshift(dataUrl);
    if (_reviewStickerCache.length > 6) _reviewStickerCache.pop();
    resultDiv.innerHTML = `<div style="background:var(--bg2);border:1.5px solid var(--border);border-radius:14px;padding:14px;text-align:center;">
      <div style="font-size:12px;color:var(--text3);margin-bottom:8px;">업로드된 리뷰 스크린샷</div>
      <img src="${dataUrl}" style="max-width:100%;max-height:200px;border-radius:10px;object-fit:contain;">
    </div>`;
    _renderReviewPanel();
    showToast('스크린샷이 추가됐어요! 아래에서 선택해 사진에 붙이세요 ✨');
  } catch(e) { resultDiv.innerHTML = `<div style="color:#dc3545;">업로드 실패: ${e.message}</div>`; }
  input.value = '';
}

function selectReviewSticker(idx) {
  const slot = _slots.find(s => s.id === _popupSlotId);
  if (!slot) return;
  const selectedPhotos = slot.photos.filter(p => _popupSelIds.has(p.id) && !p.hidden);
  if (!selectedPhotos.length) { showToast('먼저 사진을 선택해주세요'); return; }
  const stickerDataUrl = _reviewStickerCache[idx];
  if (!stickerDataUrl) return;
  _reviewEditState = { photoId: selectedPhotos[0].id, allPhotoIds: selectedPhotos.map(p => p.id), stickerImg: stickerDataUrl, x: 50, y: 75, scale: 40, opacity: 100 };
  closeReviewPanel();
  _openReviewEditor(selectedPhotos[0]);
}

function _openReviewEditor(photo) {
  const editor = document.getElementById('reviewEditor');
  const canvas = document.getElementById('reviewEditorCanvas');
  editor.style.display = 'block';
  canvas.innerHTML = `<div id="reviewEditWrap" style="position:relative;width:90%;max-width:400px;aspect-ratio:1/1;"><img src="${photo.editedDataUrl || photo.dataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;"><img id="reviewOverlay" src="${_reviewEditState.stickerImg}" style="position:absolute;left:${_reviewEditState.x}%;top:${_reviewEditState.y}%;transform:translate(-50%,-50%);width:${_reviewEditState.scale}%;opacity:${_reviewEditState.opacity/100};pointer-events:none;"></div>`;
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
  window.addEventListener('mousemove', e => { if (!dragging) return; const r = wrap.getBoundingClientRect(); const p = { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }; _reviewEditState.x = Math.max(10, Math.min(90, startElemX + (p.x - startX))); _reviewEditState.y = Math.max(10, Math.min(90, startElemY + (p.y - startY))); update(); });
  window.addEventListener('mouseup', () => { dragging = false; });
  wrap.addEventListener('wheel', e => { e.preventDefault(); _reviewEditState.scale = Math.max(15, Math.min(80, _reviewEditState.scale - e.deltaY * 0.05)); update(); }, { passive: false });
}

function updateReviewScale(val) {
  _reviewEditState.scale = parseInt(val);
  document.getElementById('reviewScaleVal').textContent = val + '%';
  const o = document.getElementById('reviewOverlay');
  if (o) o.style.width = val + '%';
}

function cancelReviewEdit() {
  document.getElementById('reviewEditor').style.display = 'none';
  _reviewEditState = null;
}

async function saveReviewEdit() {
  if (!_reviewEditState) return;
  const slot = _slots.find(s => s.id === _popupSlotId);
  if (!slot) return;
  const progress = document.getElementById('popupProgress');
  document.getElementById('reviewEditor').style.display = 'none';
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
  const slot = _slots.find(s => s.id === _popupSlotId);
  if (!slot) return;
  const selectedPhotos = slot.photos.filter(p => _popupSelIds.has(p.id) && !p.hidden);
  if (!selectedPhotos.length) { showToast('먼저 사진을 선택해주세요'); return; }
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
