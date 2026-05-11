// Itdasy Studio - 배경창고 + 템플릿 (app-gallery.js에서 분리)

// ═══════════════════════════════════════════════════════
// 배경창고 (슬롯 편집 도구)
// ═══════════════════════════════════════════════════════
const DEFAULT_BACKGROUNDS = [
  { id: 'cloud_bw', name: '구름(흑백)', type: 'preset', color: '#f5f5f5', gradient: 'linear-gradient(180deg,#e8e8e8 0%,#f8f8f8 50%,#e0e0e0 100%)' },
  { id: 'cloud_color', name: '구름(컬러)', type: 'preset', color: '#e8f4fc', gradient: 'linear-gradient(180deg,#d4e8f7 0%,#f0f7fc 50%,#c5dff0 100%)' },
  { id: 'pink', name: '핑크', type: 'preset', color: '#fff0f3', gradient: 'linear-gradient(180deg,#ffe4ec 0%,#fff5f7 50%,#ffd6e0 100%)' },
  { id: 'white', name: '화이트', type: 'preset', color: '#ffffff', gradient: 'linear-gradient(180deg,#f8f8f8 0%,#ffffff 50%,#f5f5f5 100%)' },
];

let _selectedBgId = 'cloud_bw';
const _mkIc = (p) => `<svg class="ic ic--xs" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const _IC_PALETTE = _mkIc('<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10a2.5 2.5 0 0 0 2.5-2.5c0-.63-.24-1.2-.64-1.67-.15-.17-.25-.38-.25-.62 0-.56.45-1.01 1-1.01H16c3.31 0 6-2.69 6-6C22 6.5 17.52 2 12 2z"/><circle cx="6.5" cy="11.5" r="1.5"/><circle cx="9.5" cy="7.5" r="1.5"/><circle cx="14.5" cy="7.5" r="1.5"/><circle cx="17.5" cy="11.5" r="1.5"/>');
const _IC_SAVE    = _mkIc('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>');
const _IC_GRID    = _mkIc('<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>');
const _IC_STAR    = '<i class="ph-duotone ph-star" aria-hidden="true"></i>';

function _loadUserBgs() {
  try { return JSON.parse(localStorage.getItem('itdasy_user_bgs') || '[]'); } catch(_) { return []; }
}
function _saveUserBgs(arr) {
  localStorage.setItem('itdasy_user_bgs', JSON.stringify(arr));
}
function _loadFavBgs() {
  try { return JSON.parse(localStorage.getItem('itdasy_fav_bgs') || '[]'); } catch(_) { return []; }
}
function _saveFavBgs(arr) {
  localStorage.setItem('itdasy_fav_bgs', JSON.stringify(arr));
}

function openBgPanel() {
  document.getElementById('bgPanel').classList.add('ws-panel--open');
  _renderBgPanel();
}
function closeBgPanel() {
  document.getElementById('bgPanel').classList.remove('ws-panel--open');
}

function _renderBgPanel() {
  const body = document.getElementById('bgPanelBody');
  if (!body) return;

  const userBgs = _loadUserBgs();
  const favIds = _loadFavBgs();
  const allBgs = [...DEFAULT_BACKGROUNDS, ...userBgs];

  const favBgs = allBgs.filter(b => favIds.includes(b.id));
  const otherBgs = allBgs.filter(b => !favIds.includes(b.id));

  const renderCard = (bg, isFav) => {
    const isSelected = _selectedBgId === bg.id;
    const isUser = bg.type === 'user';
    const preview = bg.imageData
      ? `<img src="${bg.imageData}" alt="${bg.name}">`
      : `<div style="width:100%;height:100%;background:${bg.gradient || bg.color};"></div>`;
    const _bid = (bg.id || '').replace(/['"<>&]/g, '');
    const _bnm = String(bg.name || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    return `
      <div class="gp-card" data-bgid="${_bid}" onclick="selectBg(this.dataset.bgid)">
        <div class="gp-card__thumb${isSelected ? ' gp-card__thumb--sel' : ''}">${preview}</div>
        <div class="gp-card__name">${_bnm}</div>
        <button class="gp-fav-btn" data-bgid="${_bid}" onclick="toggleFavBg(this.dataset.bgid,event)" aria-label="${isFav ? '즐겨찾기 해제' : '즐겨찾기 추가'}">${isFav ? '⭐' : '☆'}</button>
        ${isUser ? `<button class="gp-del-btn" data-bgid="${_bid}" onclick="deleteUserBg(this.dataset.bgid,event)" aria-label="삭제">×</button>` : ''}
      </div>`;
  };

  body.innerHTML = `
    ${favBgs.length ? `
      <div class="gp-section">
        <p class="gp-section-lbl">${_IC_STAR} 즐겨찾기</p>
        <div class="gp-grid gp-grid--4">${favBgs.map(bg => renderCard(bg, true)).join('')}</div>
      </div>` : ''}
    <div class="gp-section">
      <p class="gp-section-lbl">${_IC_PALETTE} 배경 선택</p>
      <div class="gp-grid gp-grid--4">
        ${otherBgs.map(bg => renderCard(bg, false)).join('')}
        <div class="gp-add-card" onclick="addUserBg()">
          <div class="gp-add-card__thumb">+</div>
          <div class="gp-card__name">추가</div>
        </div>
      </div>
    </div>
    <input type="file" id="bgUploadInput" accept="image/*" style="display:none;" onchange="handleBgUpload(this)">
    <button onclick="applySelectedBg()" class="btn-primary">선택한 배경 적용하기</button>
  `;
}

function selectBg(id) {
  _selectedBgId = id;
  _renderBgPanel();
}

function toggleFavBg(id, e) {
  e.stopPropagation();
  const favs = _loadFavBgs();
  if (favs.includes(id)) {
    _saveFavBgs(favs.filter(f => f !== id));
  } else {
    _saveFavBgs([...favs, id]);
  }
  _renderBgPanel();
}

function addUserBg() {
  document.getElementById('bgUploadInput').click();
}

function handleBgUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const name = prompt('배경 이름을 입력하세요:', file.name.replace(/\.[^.]+$/, ''));
    if (!name) return;
    const userBgs = _loadUserBgs();
    userBgs.push({
      id: 'user_' + Date.now(),
      name: name.slice(0, 10),
      type: 'user',
      imageData: e.target.result,
    });
    _saveUserBgs(userBgs);
    _renderBgPanel();
    showToast('배경이 추가됐어요!');
  };
  reader.readAsDataURL(file);
  input.value = '';
}

async function deleteUserBg(id, e) {
  e.stopPropagation();
  if (!(await nativeConfirm('배경 삭제', '이 배경을 삭제할까요?', '삭제'))) return;
  const userBgs = _loadUserBgs();
  _saveUserBgs(userBgs.filter(b => b.id !== id));
  const favs = _loadFavBgs();
  _saveFavBgs(favs.filter(f => f !== id));
  if (_selectedBgId === id) _selectedBgId = 'cloud_bw';
  _renderBgPanel();
  showToast('삭제됐어요');
}

async function applySelectedBg() {
  const slot = _slots.find(s => s.id === _popupSlotId);
  if (!slot) return;

  const selectedPhotos = slot.photos.filter(p => _popupSelIds.has(p.id) && !p.hidden);
  if (!selectedPhotos.length) {
    showToast('먼저 사진을 선택해주세요');
    return;
  }

  const allBgs = [...DEFAULT_BACKGROUNDS, ..._loadUserBgs()];
  const bg = allBgs.find(b => b.id === _selectedBgId);
  if (!bg) return;

  closeBgPanel();
  const progress = document.getElementById('popupProgress');
  if (progress) { progress.style.display = 'block'; progress.textContent = `배경 합성 중... 0/${selectedPhotos.length}`; }

  let failCount = 0;
  for (let i = 0; i < selectedPhotos.length; i++) {
    const photo = selectedPhotos[i];
    if (progress) progress.textContent = `배경 합성 중... ${i + 1}/${selectedPhotos.length}`;
    try {
      await _applyBgToPhoto(photo, bg, slot);
    } catch(e) {
      console.warn('배경 합성 실패:', e);
      failCount++;
    }
  }

  if (progress) progress.style.display = 'none';
  _popupSelIds.clear();
  _renderPopupPhotoGrid(slot);
  if (failCount === selectedPhotos.length) {
    showToast('배경 적용에 실패했어요. 다시 시도해주세요');
  } else if (failCount > 0) {
    showToast(`${failCount}장 실패 — ${selectedPhotos.length - failCount}장만 적용됐어요`);
  } else {
    showToast(`${selectedPhotos.length}장에 배경 적용 완료!`);
  }
}

// [2026-04-26] 누끼 합성 시 인물 축소 버그 픽스 헬퍼
// 누끼 PNG 의 알파(투명도) 데이터를 스캔해서 실제 인물(불투명) 영역의 사각 bbox 를 구한다.
// rembg 가 원본 사이즈를 유지하더라도 인물 외 영역은 다 투명이라, 이걸 잘라내지 않으면
// drawImage 시 "빈 투명 영역까지 포함된 큰 박스"를 캔버스에 맞춰 줄여서 인물이 작아 보임.
function _alphaBBox(srcImg) {
  try {
    const w = srcImg.naturalWidth || srcImg.width;
    const h = srcImg.naturalHeight || srcImg.height;
    if (!w || !h) return null;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const cx = cv.getContext('2d');
    cx.drawImage(srcImg, 0, 0);
    const data = cx.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = data[(y * w + x) * 4 + 3];
        if (a > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0 || maxY < 0) return null; // 모두 투명 = 실패
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  } catch (_e) {
    // CORS taint 등으로 getImageData 실패 시 null
    return null;
  }
}

async function _applyBgToPhoto(photo, bg, slot) {
  // 누끼 이미지가 있으면 사용, 없으면 API 호출
  let personImg;
  let serverOrigW = 0, serverOrigH = 0; // [2026-04-26] 백엔드가 알려주는 원본 사이즈
  if (photo.removedBgUrl) {
    personImg = await _loadImageSrc(photo.removedBgUrl);
  } else {
    // 1순위: 서버 API (빠름)
    let removedBlob;
    try {
      const fd = new FormData();
      fd.append('file', _dataUrlToBlob(photo.dataUrl), 'photo.jpg');
      const res = await fetch(API + '/image/remove-bg', { method: 'POST', headers: authHeader(), body: fd });
      if (res.status === 429) throw new Error('오늘 누끼따기 한도를 다 썼어요');
      if (!res.ok) throw new Error('서버 누끼 실패');
      // [2026-04-26] 응답 헤더에서 원본 사이즈 회수 (CORS Expose-Headers 로 노출)
      serverOrigW = parseInt(res.headers.get('X-Original-Width') || '0', 10) || 0;
      serverOrigH = parseInt(res.headers.get('X-Original-Height') || '0', 10) || 0;
      removedBlob = await res.blob();
    } catch(serverErr) {
      console.warn('서버 누끼 실패, 클라이언트 폴백:', serverErr);
      // 2순위: 클라이언트 누끼 (폴백) — imgly UMD lazy 로드
      if (typeof imglyRemoveBackground === 'undefined' && typeof window._lazyImgly === 'function') {
        try { await window._lazyImgly(); } catch (e) { throw new Error('누끼 라이브러리 로드 실패'); }
      }
      const srcBlob = _dataUrlToBlob(photo.dataUrl);
      removedBlob = await imglyRemoveBackground(srcBlob, {
        publicPath: 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/dist/',
        progress: (key, current, total) => {
          if (key === 'compute:inference') {
            const prog = document.getElementById('popupProgress');
            if (prog) prog.textContent = `누끼 처리 중... ${Math.round((current/total)*100)}%`;
          }
        }
      });
    }
    const tmpUrl = URL.createObjectURL(removedBlob);
    personImg = await _loadImageSrc(tmpUrl);
    URL.revokeObjectURL(tmpUrl);
    const cc = document.createElement('canvas');
    cc.width = personImg.width; cc.height = personImg.height;
    cc.getContext('2d').drawImage(personImg, 0, 0);
    photo.removedBgUrl = cc.toDataURL('image/png');
  }

  // 배경 이미지 로드 또는 그라데이션 캔버스 생성
  let bgCanvas;
  if (bg.imageData) {
    const bgImg = await _loadImageSrc(bg.imageData);
    bgCanvas = document.createElement('canvas');
    bgCanvas.width = 1080; bgCanvas.height = 1080;
    const ctx = bgCanvas.getContext('2d');
    _drawCoverCtx(ctx, bgImg, 0, 0, 1080, 1080);
  } else {
    bgCanvas = document.createElement('canvas');
    bgCanvas.width = 1080; bgCanvas.height = 1080;
    const ctx = bgCanvas.getContext('2d');
    if (bg.gradient) {
      const grad = ctx.createLinearGradient(0, 0, 0, 1080);
      // 파싱 간소화: 단색 폴백
      ctx.fillStyle = bg.color || '#fff';
      ctx.fillRect(0, 0, 1080, 1080);
      // 그라데이션 효과 추가
      const grad2 = ctx.createLinearGradient(0, 0, 0, 1080);
      grad2.addColorStop(0, 'rgba(0,0,0,0.03)');
      grad2.addColorStop(0.5, 'rgba(255,255,255,0.05)');
      grad2.addColorStop(1, 'rgba(0,0,0,0.05)');
      ctx.fillStyle = grad2;
      ctx.fillRect(0, 0, 1080, 1080);
    } else {
      ctx.fillStyle = bg.color || '#fff';
      ctx.fillRect(0, 0, 1080, 1080);
    }
  }

  // 합성
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = 1080; finalCanvas.height = 1080;
  const fCtx = finalCanvas.getContext('2d');
  fCtx.drawImage(bgCanvas, 0, 0);

  // [2026-04-26] 인물 축소 버그 픽스
  // (1) 알파 bbox 계산 — 인물 실제 영역만 잘라서 캔버스에 그림
  // (2) 캔버스의 85% 차지하도록 스케일 — 기존 0.9 보다 살짝 작지만 실 인물 비율 기준이라 더 큼
  // (3) bbox 실패 시 (CORS 등) 기존 방식 폴백
  const personW = personImg.naturalWidth || personImg.width;
  const personH = personImg.naturalHeight || personImg.height;
  const bbox = _alphaBBox(personImg);
  if (bbox && bbox.w > 0 && bbox.h > 0) {
    const TARGET = 0.85;
    const scale = Math.min((1080 * TARGET) / bbox.w, (1080 * TARGET) / bbox.h);
    const pw = bbox.w * scale;
    const ph = bbox.h * scale;
    // drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh) — bbox 만 잘라서 그림
    fCtx.drawImage(personImg, bbox.x, bbox.y, bbox.w, bbox.h,
                   (1080 - pw) / 2, (1080 - ph) / 2, pw, ph);
  } else {
    // 폴백: 기존 로직 + 서버가 알려준 원본 사이즈가 있으면 그걸 기준으로 스케일
    const refW = serverOrigW || personW;
    const refH = serverOrigH || personH;
    const scale = Math.min(1080 / refW, 1080 / refH) * 0.9;
    const pw = personW * scale;
    const ph = personH * scale;
    fCtx.drawImage(personImg, (1080 - pw) / 2, (1080 - ph) / 2, pw, ph);
  }

  photo.editedDataUrl = finalCanvas.toDataURL('image/jpeg', 0.9);
  photo.mode = 'bg_' + bg.id;
  await saveSlotToDB(slot);
}

// ═══════════════════════════════════════════════════════
// 템플릿 (배경 + 요소 조합)
// ═══════════════════════════════════════════════════════
const DEFAULT_TEMPLATES = [
  { id: 'tpl_hair1', name: '붙임머리 기본', shopType: '붙임머리', bgId: 'pink', elements: [] },
  { id: 'tpl_hair2', name: '붙임머리 심플', shopType: '붙임머리', bgId: 'white', elements: [] },
  { id: 'tpl_nail1', name: '네일 핑크', shopType: '네일', bgId: 'pink', elements: [] },
  { id: 'tpl_nail2', name: '네일 클라우드', shopType: '네일', bgId: 'cloud_color', elements: [] },
];

function _loadUserTemplates() {
  try { return JSON.parse(localStorage.getItem('itdasy_user_templates') || '[]'); } catch(_) { return []; }
}
function _saveUserTemplates(arr) {
  localStorage.setItem('itdasy_user_templates', JSON.stringify(arr));
}

function openTemplatePanel() {
  document.getElementById('templatePanel').classList.add('ws-panel--open');
  _renderTemplatePanel();
}
function closeTemplatePanel() {
  document.getElementById('templatePanel').classList.remove('ws-panel--open');
}

function _renderTemplatePanel() {
  const body = document.getElementById('templatePanelBody');
  if (!body) return;

  const shopType = localStorage.getItem('shop_type') || '붙임머리';
  const userTemplates = _loadUserTemplates();
  const defaultForShop = DEFAULT_TEMPLATES.filter(t => t.shopType === shopType || t.shopType === '공통');
  const allBgs = [...DEFAULT_BACKGROUNDS, ..._loadUserBgs()];

  const renderCard = (tpl, isUser) => {
    const bg = allBgs.find(b => b.id === tpl.bgId) || allBgs[0];
    const preview = bg.imageData
      ? `<img src="${bg.imageData}" alt="${tpl.name}">`
      : `<div style="width:100%;height:100%;background:${bg.gradient || bg.color};"></div>`;
    return `
      <div class="gp-card" onclick="applyTemplate('${tpl.id}')">
        <div class="gp-card__thumb">${preview}</div>
        <div class="gp-card__name">${tpl.name}</div>
        ${isUser ? `<button class="gp-del-btn" onclick="deleteTemplate('${tpl.id}',event)" aria-label="삭제">×</button>` : ''}
      </div>`;
  };

  body.innerHTML = `
    ${userTemplates.length ? `
      <div class="gp-section">
        <p class="gp-section-lbl">${_IC_SAVE} 내 템플릿</p>
        <div class="gp-grid gp-grid--3">${userTemplates.map(t => renderCard(t, true)).join('')}</div>
      </div>` : ''}
    <div class="gp-section">
      <p class="gp-section-lbl">${_IC_GRID} 기본 템플릿 (${shopType})</p>
      <div class="gp-grid gp-grid--3">${defaultForShop.map(t => renderCard(t, false)).join('')}</div>
    </div>
    <div class="gp-save-section">
      <p class="gp-section-lbl">현재 설정을 템플릿으로 저장</p>
      <div class="gp-save-row">
        <input type="text" id="newTemplateName" placeholder="템플릿 이름" class="gp-field">
        <button onclick="saveCurrentAsTemplate()" class="btn-primary">저장</button>
      </div>
    </div>
  `;
}

async function applyTemplate(tplId) {
  const slot = _slots.find(s => s.id === _popupSlotId);
  if (!slot) return;
  const selectedPhotos = slot.photos.filter(p => _popupSelIds.has(p.id) && !p.hidden);
  if (!selectedPhotos.length) { showToast('먼저 사진을 선택해주세요'); return; }
  const allTemplates = [...DEFAULT_TEMPLATES, ..._loadUserTemplates()];
  const tpl = allTemplates.find(t => t.id === tplId);
  if (!tpl) return;
  closeTemplatePanel();
  const progress = document.getElementById('popupProgress');
  if (progress) { progress.style.display = 'block'; progress.textContent = `템플릿 적용 중...`; }
  const allBgs = [...DEFAULT_BACKGROUNDS, ..._loadUserBgs()];
  const bg = allBgs.find(b => b.id === tpl.bgId);
  for (const photo of selectedPhotos) {
    if (bg) try { await _applyBgToPhoto(photo, bg, slot); } catch (_e) { /* ignore */ }
  }
  if (progress) progress.style.display = 'none';
  _popupSelIds.clear();
  _renderPopupPhotoGrid(slot);
  showToast(`${selectedPhotos.length}장에 템플릿 적용 완료!`);
}

function saveCurrentAsTemplate() {
  const name = document.getElementById('newTemplateName')?.value?.trim();
  if (!name) { showToast('템플릿 이름을 입력해주세요'); return; }
  const templates = _loadUserTemplates();
  templates.push({ id: 'tpl_user_' + Date.now(), name: name.slice(0, 12), shopType: localStorage.getItem('shop_type') || '붙임머리', bgId: _selectedBgId || 'white', elements: [] });
  _saveUserTemplates(templates);
  _renderTemplatePanel();
  showToast('템플릿 저장됨!');
}

async function deleteTemplate(id, e) {
  e.stopPropagation();
  if (!(await nativeConfirm('템플릿 삭제', '이 템플릿을 삭제할까요?', '삭제'))) return;
  _saveUserTemplates(_loadUserTemplates().filter(t => t.id !== id));
  _renderTemplatePanel();
}

