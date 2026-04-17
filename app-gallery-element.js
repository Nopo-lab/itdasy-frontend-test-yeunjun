// Itdasy Studio - 요소창고 (app-gallery.js에서 분리)

// ═══════════════════════════════════════════════════════
// 요소창고 (로고, 브랜드 이미지)
// ═══════════════════════════════════════════════════════
let _userElements = [];
let _elementEditState = null; // { photoId, elementId, x, y, scale, opacity, imgData }

// 기본 텍스트 요소 생성
function _createDefaultTextElement(text, color = '#f18091') {
  const canvas = document.createElement('canvas');
  canvas.width = 300; canvas.height = 100;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 48px sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 150, 50);
  return canvas.toDataURL('image/png');
}

function _loadUserElements() {
  try { return JSON.parse(localStorage.getItem('itdasy_user_elements') || '[]'); } catch(_) { return []; }
}
function _saveUserElements(arr) {
  localStorage.setItem('itdasy_user_elements', JSON.stringify(arr));
}

function openElementPanel() {
  document.getElementById('elementPanel').style.display = 'block';
  _renderElementPanel();
}
function closeElementPanel() {
  document.getElementById('elementPanel').style.display = 'none';
}

function _renderElementPanel() {
  const body = document.getElementById('elementPanelBody');
  if (!body) return;

  _userElements = _loadUserElements();

  const slot = _slots.find(s => s.id === _popupSlotId);
  const selectedPhotos = slot ? slot.photos.filter(p => _popupSelIds.has(p.id) && !p.hidden) : [];

  // 기본 "잇데이" 텍스트 요소 이미지
  const itdasyImg = _createDefaultTextElement('잇데이', '#f18091');

  body.innerHTML = `
    <!-- 기본 텍스트 요소 -->
    <div style="margin-bottom:16px;">
      <div style="font-size:12px;font-weight:700;color:var(--text3);margin-bottom:10px;">✨ 기본 텍스트</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
        <div style="cursor:pointer;" onclick="selectDefaultElement('itdasy')">
          <div style="aspect-ratio:1/1;border-radius:12px;overflow:hidden;border:1.5px solid var(--accent);background:#fff5f7;display:flex;align-items:center;justify-content:center;">
            <img src="${itdasyImg}" style="width:90%;height:auto;object-fit:contain;">
          </div>
          <div style="font-size:9px;color:var(--accent);text-align:center;margin-top:4px;font-weight:700;">잇데이</div>
        </div>
      </div>
    </div>
    <!-- 내 요소 -->
    <div style="margin-bottom:16px;">
      <div style="font-size:12px;font-weight:700;color:var(--text3);margin-bottom:10px;">📦 내 요소 (로고, 브랜드 이미지)</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
        ${_userElements.map(el => `
          <div style="position:relative;cursor:pointer;" onclick="selectElement('${el.id}')">
            <div style="aspect-ratio:1/1;border-radius:12px;overflow:hidden;border:1.5px solid var(--border);background:#f5f5f5;">
              <img src="${el.imageData}" style="width:100%;height:100%;object-fit:contain;">
            </div>
            <div style="font-size:9px;color:var(--text2);text-align:center;margin-top:4px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${el.name}</div>
            <button onclick="deleteElement('${el.id}',event)" style="position:absolute;top:2px;right:2px;width:20px;height:20px;border-radius:50%;border:none;background:rgba(220,53,69,0.9);color:#fff;font-size:12px;cursor:pointer;">×</button>
          </div>
        `).join('')}
        <!-- 추가 버튼 -->
        <div onclick="addUserElement()" style="cursor:pointer;">
          <div style="aspect-ratio:1/1;border-radius:12px;border:1.5px dashed var(--border);display:flex;align-items:center;justify-content:center;font-size:24px;color:var(--text3);">+</div>
          <div style="font-size:9px;color:var(--text3);text-align:center;margin-top:4px;">추가</div>
        </div>
      </div>
    </div>
    <input type="file" id="elementUploadInput" accept="image/*" style="display:none;" onchange="handleElementUpload(this)">
    ${selectedPhotos.length === 0 ? `
      <div style="padding:16px;background:var(--bg2);border-radius:12px;text-align:center;color:var(--text3);font-size:12px;">
        사진을 먼저 선택한 후 요소를 탭하세요
      </div>
    ` : `
      <div style="padding:12px;background:rgba(241,128,145,0.08);border-radius:12px;text-align:center;color:var(--accent2);font-size:12px;font-weight:600;">
        ${selectedPhotos.length}장 선택됨 — 요소를 탭하면 편집 화면으로 이동해요
      </div>
    `}
  `;
}

function addUserElement() {
  document.getElementById('elementUploadInput').click();
}

function handleElementUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const name = prompt('요소 이름 (예: 로고, 워터마크):', file.name.replace(/\.[^.]+$/, ''));
    if (!name) return;
    const elements = _loadUserElements();
    elements.push({
      id: 'el_' + Date.now(),
      name: name.slice(0, 12),
      imageData: e.target.result,
    });
    _saveUserElements(elements);
    _renderElementPanel();
    showToast('요소가 추가됐어요!');
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function deleteElement(id, e) {
  e.stopPropagation();
  if (!confirm('이 요소를 삭제할까요?')) return;
  const elements = _loadUserElements();
  _saveUserElements(elements.filter(el => el.id !== id));
  _renderElementPanel();
}

function selectElement(elementId) {
  const slot = _slots.find(s => s.id === _popupSlotId);
  if (!slot) return;

  const selectedPhotos = slot.photos.filter(p => _popupSelIds.has(p.id) && !p.hidden);
  if (!selectedPhotos.length) {
    showToast('먼저 사진을 선택해주세요');
    return;
  }

  const element = _loadUserElements().find(el => el.id === elementId);
  if (!element) return;

  // 첫 번째 선택 사진으로 편집기 열기
  const photo = selectedPhotos[0];
  _elementEditState = {
    photoId: photo.id,
    allPhotoIds: selectedPhotos.map(p => p.id),
    elementId,
    elementImg: element.imageData,
    x: 50, y: 50, // % 기준 중앙
    scale: 30, // % 기준
    opacity: 100,
  };

  closeElementPanel();
  _openElementEditor(photo);
}

function selectDefaultElement(type) {
  const slot = _slots.find(s => s.id === _popupSlotId);
  if (!slot) return;

  const selectedPhotos = slot.photos.filter(p => _popupSelIds.has(p.id) && !p.hidden);
  if (!selectedPhotos.length) {
    showToast('먼저 사진을 선택해주세요');
    return;
  }

  // 기본 텍스트 요소 생성
  let elementImg;
  if (type === 'itdasy') {
    elementImg = _createDefaultTextElement('잇데이', '#f18091');
  } else {
    return;
  }

  const photo = selectedPhotos[0];
  _elementEditState = {
    photoId: photo.id,
    allPhotoIds: selectedPhotos.map(p => p.id),
    elementId: '_default_' + type,
    elementImg,
    x: 50, y: 85, // 하단 중앙
    scale: 25,
    opacity: 100,
  };

  closeElementPanel();
  _openElementEditor(photo);
}

function _openElementEditor(photo) {
  const editor = document.getElementById('elementEditor');
  const canvas = document.getElementById('elementEditorCanvas');
  editor.style.display = 'block';

  const photoSrc = photo.editedDataUrl || photo.dataUrl;
  canvas.innerHTML = `
    <div id="elemEditWrap" style="position:relative;width:90%;max-width:400px;aspect-ratio:1/1;">
      <img src="${photoSrc}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">
      <img id="elemOverlay" src="${_elementEditState.elementImg}" style="position:absolute;left:${_elementEditState.x}%;top:${_elementEditState.y}%;transform:translate(-50%,-50%);width:${_elementEditState.scale}%;opacity:${_elementEditState.opacity/100};pointer-events:none;">
    </div>
  `;

  document.getElementById('elementOpacity').value = _elementEditState.opacity;
  document.getElementById('elementOpacityVal').textContent = _elementEditState.opacity + '%';

  // 터치/마우스 드래그 설정
  _setupElementDrag();
}

function _setupElementDrag() {
  const wrap = document.getElementById('elemEditWrap');
  const overlay = document.getElementById('elemOverlay');
  if (!wrap || !overlay) return;

  let dragging = false, startX, startY, startElemX, startElemY;
  let pinching = false, startDist, startScale;

  const getPos = (clientX, clientY) => {
    const rect = wrap.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  };

  const updateOverlay = () => {
    overlay.style.left = _elementEditState.x + '%';
    overlay.style.top = _elementEditState.y + '%';
    overlay.style.width = _elementEditState.scale + '%';
    overlay.style.opacity = _elementEditState.opacity / 100;
  };

  // 터치
  wrap.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      pinching = true;
      startDist = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
      startScale = _elementEditState.scale;
    } else if (e.touches.length === 1) {
      dragging = true;
      const pos = getPos(e.touches[0].clientX, e.touches[0].clientY);
      startX = pos.x; startY = pos.y;
      startElemX = _elementEditState.x; startElemY = _elementEditState.y;
    }
  }, { passive: true });

  wrap.addEventListener('touchmove', e => {
    if (pinching && e.touches.length === 2) {
      const dist = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
      _elementEditState.scale = Math.max(10, Math.min(80, startScale * (dist / startDist)));
      updateOverlay();
      e.preventDefault();
    } else if (dragging && e.touches.length === 1) {
      const pos = getPos(e.touches[0].clientX, e.touches[0].clientY);
      _elementEditState.x = Math.max(5, Math.min(95, startElemX + (pos.x - startX)));
      _elementEditState.y = Math.max(5, Math.min(95, startElemY + (pos.y - startY)));
      updateOverlay();
    }
  }, { passive: false });

  wrap.addEventListener('touchend', () => { dragging = false; pinching = false; });

  // 마우스
  wrap.addEventListener('mousedown', e => {
    dragging = true;
    const pos = getPos(e.clientX, e.clientY);
    startX = pos.x; startY = pos.y;
    startElemX = _elementEditState.x; startElemY = _elementEditState.y;
    e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const rect = wrap.getBoundingClientRect();
    const pos = { x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 };
    _elementEditState.x = Math.max(5, Math.min(95, startElemX + (pos.x - startX)));
    _elementEditState.y = Math.max(5, Math.min(95, startElemY + (pos.y - startY)));
    updateOverlay();
  });
  window.addEventListener('mouseup', () => { dragging = false; });

  // 마우스 휠 크기 조절
  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    _elementEditState.scale = Math.max(10, Math.min(80, _elementEditState.scale - e.deltaY * 0.05));
    updateOverlay();
  }, { passive: false });
}

function updateElementOpacity(val) {
  _elementEditState.opacity = parseInt(val);
  document.getElementById('elementOpacityVal').textContent = val + '%';
  const overlay = document.getElementById('elemOverlay');
  if (overlay) overlay.style.opacity = val / 100;
}

function cancelElementEdit() {
  document.getElementById('elementEditor').style.display = 'none';
  _elementEditState = null;
}

async function saveElementEdit() {
  if (!_elementEditState) return;

  const slot = _slots.find(s => s.id === _popupSlotId);
  if (!slot) return;

  const progress = document.getElementById('popupProgress');
  document.getElementById('elementEditor').style.display = 'none';

  const photoIds = _elementEditState.allPhotoIds;
  if (progress) { progress.style.display = 'block'; progress.textContent = `요소 적용 중... 0/${photoIds.length}`; }

  for (let i = 0; i < photoIds.length; i++) {
    const photo = slot.photos.find(p => p.id === photoIds[i]);
    if (!photo) continue;
    if (progress) progress.textContent = `요소 적용 중... ${i + 1}/${photoIds.length}`;
    await _applyElementToPhoto(photo, slot);
  }

  if (progress) progress.style.display = 'none';
  _popupSelIds.clear();
  _elementEditState = null;
  _renderPopupPhotoGrid(slot);
  showToast(`${photoIds.length}장에 요소 적용 완료!`);
}

async function _applyElementToPhoto(photo, slot) {
  const state = _elementEditState;
  const canvas = document.createElement('canvas');
  canvas.width = 1080; canvas.height = 1080;
  const ctx = canvas.getContext('2d');

  // 베이스 이미지
  const baseImg = await _loadImageSrc(photo.editedDataUrl || photo.dataUrl);
  _drawCoverCtx(ctx, baseImg, 0, 0, 1080, 1080);

  // 요소 이미지
  const elemImg = await _loadImageSrc(state.elementImg);
  const elemW = 1080 * (state.scale / 100);
  const elemH = elemW * (elemImg.height / elemImg.width);
  const elemX = 1080 * (state.x / 100) - elemW / 2;
  const elemY = 1080 * (state.y / 100) - elemH / 2;

  ctx.globalAlpha = state.opacity / 100;
  ctx.drawImage(elemImg, elemX, elemY, elemW, elemH);
  ctx.globalAlpha = 1;

  photo.editedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
  photo.mode = 'element';
  await saveSlotToDB(slot);
}

