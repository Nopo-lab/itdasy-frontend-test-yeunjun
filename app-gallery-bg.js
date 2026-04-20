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
  document.getElementById('bgPanel').style.display = 'block';
  _renderBgPanel();
}
function closeBgPanel() {
  document.getElementById('bgPanel').style.display = 'none';
}

function _renderBgPanel() {
  const body = document.getElementById('bgPanelBody');
  if (!body) return;

  const userBgs = _loadUserBgs();
  const favIds = _loadFavBgs();
  const allBgs = [...DEFAULT_BACKGROUNDS, ...userBgs];

  // 즐겨찾기 상단, 나머지 아래
  const favBgs = allBgs.filter(b => favIds.includes(b.id));
  const otherBgs = allBgs.filter(b => !favIds.includes(b.id));

  const renderCard = (bg, isFav) => {
    const isSelected = _selectedBgId === bg.id;
    const isUser = bg.type === 'user';
    const preview = bg.imageData
      ? `<img src="${bg.imageData}" style="width:100%;height:100%;object-fit:cover;">`
      : `<div style="width:100%;height:100%;background:${bg.gradient || bg.color};"></div>`;

    return `
      <div onclick="selectBg('${bg.id}')" style="position:relative;cursor:pointer;">
        <div style="aspect-ratio:1/1;border-radius:12px;overflow:hidden;border:${isSelected ? '3px solid var(--accent)' : '1.5px solid var(--border)'};">
          ${preview}
        </div>
        <div style="font-size:10px;color:var(--text2);text-align:center;margin-top:4px;font-weight:600;">${bg.name}</div>
        <!-- 즐겨찾기 토글 -->
        <button onclick="toggleFavBg('${bg.id}',event)" style="position:absolute;top:4px;left:4px;width:24px;height:24px;border-radius:50%;border:none;background:rgba(255,255,255,0.9);font-size:12px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.15);">${isFav ? '⭐' : '☆'}</button>
        ${isUser ? `<button onclick="deleteUserBg('${bg.id}',event)" style="position:absolute;top:4px;right:4px;width:24px;height:24px;border-radius:50%;border:none;background:rgba(255,255,255,0.9);color:#dc3545;font-size:14px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.15);">×</button>` : ''}
      </div>
    `;
  };

  body.innerHTML = `
    ${favBgs.length ? `
      <div style="margin-bottom:16px;">
        <div style="font-size:12px;font-weight:700;color:var(--text3);margin-bottom:10px;">⭐ 즐겨찾기</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
          ${favBgs.map(bg => renderCard(bg, true)).join('')}
        </div>
      </div>
    ` : ''}
    <div style="margin-bottom:16px;">
      <div style="font-size:12px;font-weight:700;color:var(--text3);margin-bottom:10px;">🎨 배경 선택</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
        ${otherBgs.map(bg => renderCard(bg, false)).join('')}
        <!-- 추가 버튼 -->
        <div onclick="addUserBg()" style="cursor:pointer;">
          <div style="aspect-ratio:1/1;border-radius:12px;border:1.5px dashed var(--border);display:flex;align-items:center;justify-content:center;font-size:24px;color:var(--text3);">+</div>
          <div style="font-size:10px;color:var(--text3);text-align:center;margin-top:4px;">추가</div>
        </div>
      </div>
    </div>
    <input type="file" id="bgUploadInput" accept="image/*" style="display:none;" onchange="handleBgUpload(this)">
    <button onclick="applySelectedBg()" style="width:100%;padding:14px;border-radius:14px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:14px;font-weight:800;cursor:pointer;">선택한 배경 적용하기</button>
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

async function _applyBgToPhoto(photo, bg, slot) {
  // 누끼 이미지가 있으면 사용, 없으면 API 호출
  let personImg;
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
      removedBlob = await res.blob();
    } catch(serverErr) {
      console.warn('서버 누끼 실패, 클라이언트 폴백:', serverErr);
      // 2순위: 클라이언트 누끼 (폴백)
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

  // 인물 중앙 배치 (비율 유지)
  const scale = Math.min(1080 / personImg.width, 1080 / personImg.height) * 0.9;
  const pw = personImg.width * scale;
  const ph = personImg.height * scale;
  fCtx.drawImage(personImg, (1080 - pw) / 2, (1080 - ph) / 2, pw, ph);

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
  document.getElementById('templatePanel').style.display = 'block';
  _renderTemplatePanel();
}
function closeTemplatePanel() {
  document.getElementById('templatePanel').style.display = 'none';
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
      ? `<img src="${bg.imageData}" style="width:100%;height:100%;object-fit:cover;">`
      : `<div style="width:100%;height:100%;background:${bg.gradient || bg.color};"></div>`;
    return `
      <div style="position:relative;cursor:pointer;" onclick="applyTemplate('${tpl.id}')">
        <div style="aspect-ratio:1/1;border-radius:12px;overflow:hidden;border:1.5px solid var(--border);">${preview}</div>
        <div style="font-size:10px;color:var(--text2);text-align:center;margin-top:4px;font-weight:600;">${tpl.name}</div>
        ${isUser ? `<button onclick="deleteTemplate('${tpl.id}',event)" style="position:absolute;top:2px;right:2px;width:20px;height:20px;border-radius:50%;border:none;background:rgba(220,53,69,0.9);color:#fff;font-size:12px;cursor:pointer;">×</button>` : ''}
      </div>
    `;
  };

  body.innerHTML = `
    ${userTemplates.length ? `<div style="margin-bottom:16px;"><div style="font-size:12px;font-weight:700;color:var(--text3);margin-bottom:10px;">💾 내 템플릿</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">${userTemplates.map(t => renderCard(t, true)).join('')}</div></div>` : ''}
    <div style="margin-bottom:16px;">
      <div style="font-size:12px;font-weight:700;color:var(--text3);margin-bottom:10px;">📐 기본 템플릿 (${shopType})</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">${defaultForShop.map(t => renderCard(t, false)).join('')}</div>
    </div>
    <div style="border-top:1px solid var(--border);padding-top:16px;">
      <div style="font-size:12px;font-weight:700;color:var(--text3);margin-bottom:10px;">현재 설정을 템플릿으로 저장</div>
      <div style="display:flex;gap:8px;">
        <input type="text" id="newTemplateName" placeholder="템플릿 이름" style="flex:1;padding:10px 12px;border-radius:10px;border:1px solid var(--border);font-size:13px;">
        <button onclick="saveCurrentAsTemplate()" style="padding:10px 16px;border-radius:10px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:12px;font-weight:700;cursor:pointer;">저장</button>
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
    if (bg) try { await _applyBgToPhoto(photo, bg, slot); } catch(_e) {}
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

