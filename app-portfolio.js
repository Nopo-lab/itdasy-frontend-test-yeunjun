// Itdasy Studio - 포트폴리오 (사진관리, 카드덱, 배경, 블러, 자동편집)

// ===== 잇데이 스타일 자동편집 =====
let editFile = null;
let editImg = null;

function loadEditImage(input) {
  const file = input.files[0];
  if (!file) return;
  editFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      editImg = img;
      const prev = document.getElementById('editPreview');
      prev.src = e.target.result;
      prev.style.display = 'block';
      document.getElementById('editArea').style.display = 'none';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// 구름 SVG를 이미지로 변환 및 이미지 로드
function getCloudBg(W, H, colorMode) {
  return new Promise(resolve => {
    if (colorMode.startsWith('cloud')) {
      const isBW = colorMode === 'cloud_bw';
      const img  = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(W / img.width, H / img.height);
        const sw = W / scale, sh = H / scale;
        const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
        if (isBW) {
          const imgData = ctx.getImageData(0, 0, W, H);
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 4) {
            const g = d[i]*0.299 + d[i+1]*0.587 + d[i+2]*0.114;
            d[i] = d[i+1] = d[i+2] = g;
          }
          ctx.putImageData(imgData, 0, 0);
        }
        const outImg = new Image();
        outImg.onload = () => resolve(outImg);
        outImg.src = canvas.toDataURL();
      };
      img.src = 'cloud.jpeg';
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    if (colorMode === 'pink') {
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#fce4ec');
      grad.addColorStop(1, '#f8bbd0');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = '#f8f6f4';
      ctx.fillRect(0, 0, W, H);
    }

    const imgOut = new Image();
    imgOut.onload = () => resolve(imgOut);
    imgOut.src = canvas.toDataURL();
  });
}

async function renderEdit() {
  if (!editFile) { showToast('사진을 먼저 올려주세요'); return; }

  const bgMode = document.querySelector('#bgOpts .style-opt.on')?.dataset.v || 'cloud_bw';
  const wm = document.querySelector('#editWmOpts .style-opt.on')?.dataset.v || 'wm1';

  document.getElementById('editBtn').style.display = 'none';
  document.getElementById('editProgress').style.display = 'block';
  document.getElementById('editCanvas').style.display = 'none';
  document.getElementById('editSaveBtn').style.display = 'none';
  document.getElementById('resetEditBtn').style.display = 'none';

  try {
    // 백엔드 누끼 API 호출
    const formData = new FormData();
    formData.append('file', editFile);

    const res = await fetch(API + '/image/remove-bg', {
      method: 'POST',
      headers: authHeader(),
      body: formData
    });

    if (res.status === 401) { setToken(null); document.getElementById('lockOverlay').classList.remove('hidden'); throw new Error('로그인이 필요합니다.'); }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'API 오류 (' + res.status + ')');
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const personImg = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });

    // 캔버스 합성
    const W = 1080, H = 1350;
    const canvas = document.getElementById('editCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = W; canvas.height = H;

    // 배경 그리기
    const customBgUrl = window._customBgUrl || null;
    if (customBgUrl) {
      const blobRes = await fetch(customBgUrl, { headers: authHeader() });
      if (!blobRes.ok) throw new Error('배경 이미지 로드 실패 (' + blobRes.status + ')');
      const blobData = await blobRes.blob();
      const blobObjUrl = URL.createObjectURL(blobData);
      const bgImg = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(blobObjUrl); resolve(img); };
        img.onerror = () => reject(new Error('배경 이미지 렌더 실패'));
        img.src = blobObjUrl;
      });
      const s = Math.max(W / bgImg.width, H / bgImg.height);
      const sw = W / s, sh = H / s;
      const sx = (bgImg.width - sw) / 2, sy = (bgImg.height - sh) / 2;
      ctx.drawImage(bgImg, sx, sy, sw, sh, 0, 0, W, H);
    } else if (bgMode === 'mosaic') {
      const s = Math.max(W / editImg.width, H / editImg.height);
      const sw = W / s, sh = H / s;
      const sx = (editImg.width - sw) / 2, sy = (editImg.height - sh) / 2;
      ctx.drawImage(editImg, sx, sy, sw, sh, 0, 0, W, H);

      const PIXEL = 28;
      const cols = Math.ceil(W / PIXEL), rows = Math.ceil(H / PIXEL);
      const tmp = document.createElement('canvas');
      tmp.width = cols; tmp.height = rows;
      const tCtx = tmp.getContext('2d');
      tCtx.drawImage(canvas, 0, 0, W, H, 0, 0, cols, rows);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, cols, rows, 0, 0, W, H);
      ctx.imageSmoothingEnabled = true;

      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 0, W, H);
    } else {
      const bgImg = await getCloudBg(W, H, bgMode);
      ctx.drawImage(bgImg, 0, 0, W, H);
    }

    // 인물 배치
    const scale = Math.min(W / personImg.width, H / personImg.height) * 0.92;
    const pw = personImg.width * scale;
    const ph = personImg.height * scale;
    const px = (W - pw) / 2;
    const py = H - ph - H * 0.02;
    ctx.drawImage(personImg, px, py, pw, ph);

    // 워터마크
    if (wm !== 'wm0') {
      const fs = 32;
      ctx.font = '500 ' + fs + 'px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center';
      const wmText = '🎀 @itdasy';
      const tw = ctx.measureText(wmText).width;
      ctx.fillStyle = 'rgba(15,6,8,0.5)';
      ctx.beginPath();
      ctx.roundRect(W/2 - tw/2 - 16, H - 56, tw + 32, 42, 21);
      ctx.fill();
      ctx.fillStyle = 'rgba(232,160,176,0.95)';
      ctx.fillText(wmText, W/2, H - 26);
    }

    canvas.style.display = 'block';
    const actionBtns = document.getElementById('editActionBtns');
    if (actionBtns) actionBtns.style.display = 'flex';
    document.getElementById('editSaveBtn').style.display = '';
    document.getElementById('resetEditBtn').style.display = '';
    document.getElementById('editProgress').style.display = 'none';
    URL.revokeObjectURL(url);

    canvas.toBlob(blob => { if (blob) detectFaceAfterEdit(blob); }, 'image/png');

  } catch(e) {
    showToast('편집 중 오류: ' + (e.message || '잠시 후 다시 시도해주세요'));
  }

  document.getElementById('editBtn').style.display = 'block';
  document.getElementById('editProgress').style.display = 'none';
}

function saveEdit() {
  const canvas = document.getElementById('editCanvas');
  const a = document.createElement('a');
  a.download = 'itdasy_' + Date.now() + '.jpg';
  a.href = canvas.toDataURL('image/jpeg', 0.93);
  a.click();
}

function resetEdit() {
  editFile = null; editImg = null;
  document.getElementById('editPreview').style.display = 'none';
  document.getElementById('editArea').style.display = 'block';
  document.getElementById('editCanvas').style.display = 'none';
  document.getElementById('editActionBtns').style.display = 'none';
  document.getElementById('editPortfolioSavePanel').style.display = 'none';
  document.getElementById('editBtn').style.display = 'block';
  document.getElementById('editProgress').style.display = 'none';
  const input = document.querySelector('#editArea input[type=file]');
  if(input) input.value = '';
}

let _editPortfolioType = 'after';

function toggleEditPortfolioSave() {
  const panel = document.getElementById('editPortfolioSavePanel');
  const btn = document.getElementById('editPortfolioToggleBtn');
  const open = panel.style.display === 'none' || !panel.style.display;
  panel.style.display = open ? 'block' : 'none';
  btn.style.background = open ? 'rgba(241,128,145,0.06)' : 'transparent';
}

function selectEditPortfolioType(btn, type) {
  _editPortfolioType = type;
  document.querySelectorAll('.ep-type-btn').forEach(b => {
    const t = b.dataset.t;
    if (t === 'after') { b.style.background = t === type ? 'rgba(241,128,145,0.1)' : 'transparent'; b.style.borderColor = t === type ? 'rgba(241,128,145,0.45)' : 'rgba(241,128,145,0.25)'; b.style.color = t === type ? 'var(--accent)' : 'var(--text3)'; }
    else if (t === 'before') { b.style.background = t === type ? 'rgba(100,149,237,0.1)' : 'transparent'; b.style.borderColor = t === type ? 'rgba(100,149,237,0.5)' : 'rgba(100,149,237,0.25)'; b.style.color = t === type ? '#6495ed' : 'var(--text3)'; }
    else { b.style.background = t === type ? 'rgba(0,0,0,0.06)' : 'transparent'; b.style.borderColor = t === type ? 'var(--border2)' : 'var(--border)'; b.style.color = t === type ? 'var(--text2)' : 'var(--text3)'; }
  });
}

async function saveEditToPortfolio() {
  const canvas = document.getElementById('editCanvas');
  if (!canvas || canvas.style.display === 'none') { showToast('먼저 사진을 합성해주세요'); return; }
  const mainTag = document.getElementById('editPortfolioMainTag').value.trim();
  const tags = document.getElementById('editPortfolioTags').value.trim();
  const btn = document.querySelector('#editPortfolioSavePanel button:last-child');
  btn.disabled = true; btn.textContent = '저장 중...';
  try {
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.93));
    const fd = new FormData();
    fd.append('image', blob, 'edit_' + Date.now() + '.jpg');
    fd.append('photo_type', _editPortfolioType);
    fd.append('main_tag', mainTag);
    fd.append('tags', tags);
    const res = await fetch(API + '/portfolio', {
      method: 'POST', headers: { ...authHeader(), 'ngrok-skip-browser-warning': 'true' }, body: fd
    });
    if (res.ok) { showToast('포트폴리오에 저장됐어요 📂'); document.getElementById('editPortfolioSavePanel').style.display = 'none'; document.getElementById('editPortfolioToggleBtn').style.background = 'transparent'; }
    else { showToast('저장 실패'); }
  } catch(e) { showToast('오류: ' + e.message); }
  btn.disabled = false; btn.textContent = '포트폴리오에 저장 📂';
}

// ===== 포트폴리오 =====
let _portfolioPendingFiles = []; // [{ file, type, group, objectUrl }]
let _pfGroups = [1];
let _pfNextGroup = 2;

const _PF_GROUP_COLORS = ['#f18091','#6495ed','#4caf50','#ff9800','#9c27b0'];
const _PF_TYPE_CYCLE = ['general', 'before', 'after'];
const _PF_TYPE_LABELS = { general: '일반', before: 'BEFORE', after: 'AFTER' };
const _PF_TYPE_COLORS = { general: 'rgba(0,0,0,0.45)', before: 'rgba(100,149,237,0.85)', after: 'rgba(241,128,145,0.85)' };
const _PF_TYPE_BORDERS = { general: 'var(--border)', before: '#6495ed', after: 'var(--accent)' };

function _renderPfGroupLabels() {
  const wrap = document.getElementById('pfGroupLabels');
  if (!wrap) return;
  wrap.innerHTML = _pfGroups.map((g, i) => {
    const c = _PF_GROUP_COLORS[i % _PF_GROUP_COLORS.length];
    return `<div style="padding:4px 12px; border-radius:8px; background:${c}22; border:1.5px solid ${c}66; font-size:10px; font-weight:800; color:${c};">작업 ${g}</div>`;
  }).join('');
}

function pfAddGroup() {
  if (_pfGroups.length >= 5) { showToast('최대 5개 묶음까지 가능합니다'); return; }
  _pfGroups.push(_pfNextGroup++);
  _renderPfGroupLabels();
  showToast('작업 묶음 ' + _pfGroups.length + ' 추가됨 ➕');
}

function handlePortfolioUpload(input) {
  const files = Array.from(input.files);
  if (!files.length) return;

  // 상태 초기화
  _pfGroups = [1]; _pfNextGroup = 2;
  _portfolioPendingFiles = files.map(f => ({ file: f, type: 'general', group: 1, objectUrl: null }));

  const wrap = document.getElementById('portfolioTagInputWrap');
  const previewList = document.getElementById('portfolioUploadPreviewList');
  const countEl = document.getElementById('portfolioUploadPreviewCount');
  wrap.style.display = 'block';
  previewList.innerHTML = '';
  if (countEl) countEl.textContent = files.length + '장 선택됨';

  _renderPfGroupLabels();

  const MAX = 12;
  const showFiles = _portfolioPendingFiles.slice(0, MAX);
  if (_portfolioPendingFiles.length > MAX) _portfolioPendingFiles = _portfolioPendingFiles.slice(0, MAX);

  showFiles.forEach((entry) => {
    const url = URL.createObjectURL(entry.file);
    entry.objectUrl = url;

    const wrap2 = document.createElement('div');
    wrap2.style.cssText = 'position:relative; width:76px; flex-shrink:0;';

    const img = document.createElement('img');
    img.src = url;
    img.style.cssText = `width:76px; height:76px; object-fit:cover; border-radius:10px; border:2px solid ${_PF_TYPE_BORDERS[entry.type]}; display:block;`;

    // 상단 배지: Type 토글 (Before / After / 일반)
    const typeBadge = document.createElement('div');
    typeBadge.style.cssText = `position:absolute; top:3px; left:2px; right:2px; text-align:center; border-radius:5px; font-size:8px; font-weight:900; padding:2px 0; background:${_PF_TYPE_COLORS[entry.type]}; color:#fff; cursor:pointer; letter-spacing:0.2px;`;
    typeBadge.textContent = _PF_TYPE_LABELS[entry.type];
    typeBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      const cur = _PF_TYPE_CYCLE.indexOf(entry.type);
      entry.type = _PF_TYPE_CYCLE[(cur + 1) % 3];
      typeBadge.textContent = _PF_TYPE_LABELS[entry.type];
      typeBadge.style.background = _PF_TYPE_COLORS[entry.type];
      img.style.borderColor = _PF_TYPE_BORDERS[entry.type];
    });

    // 하단 배지: Group 토글
    const gIdx = () => _pfGroups.indexOf(entry.group);
    const groupBadge = document.createElement('div');
    const initGColor = _PF_GROUP_COLORS[0];
    groupBadge.style.cssText = `position:absolute; bottom:3px; left:2px; right:2px; text-align:center; border-radius:5px; font-size:8px; font-weight:900; padding:2px 0; background:${initGColor}cc; color:#fff; cursor:pointer; border:1px solid ${initGColor};`;
    groupBadge.textContent = '작업 ' + entry.group;
    groupBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      const cur = _pfGroups.indexOf(entry.group);
      entry.group = _pfGroups[(cur + 1) % _pfGroups.length];
      const newGIdx = _pfGroups.indexOf(entry.group);
      const newColor = _PF_GROUP_COLORS[newGIdx % _PF_GROUP_COLORS.length];
      groupBadge.textContent = '작업 ' + entry.group;
      groupBadge.style.background = newColor + 'cc';
      groupBadge.style.borderColor = newColor;
    });

    wrap2.appendChild(img);
    wrap2.appendChild(typeBadge);
    wrap2.appendChild(groupBadge);
    previewList.appendChild(wrap2);
  });

  input.value = '';
  wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function confirmPortfolioUpload() {
  if (!_portfolioPendingFiles.length) return;
  const mainTag = document.getElementById('portfolioMainTagInput').value.trim();
  const tags = document.getElementById('portfolioTagInput').value.trim();
  const btn = document.getElementById('pfSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }

  let ok = 0, fail = 0;
  for (const entry of _portfolioPendingFiles) {
    try {
      const groupTag = `작업${entry.group}`;
      const allTags = [tags, groupTag].filter(Boolean).join(', ');
      const fd = new FormData();
      fd.append('image', entry.file, entry.file.name);
      fd.append('photo_type', entry.type || 'general');
      fd.append('main_tag', mainTag);
      fd.append('tags', allTags);
      const res = await fetch(API + '/portfolio', {
        method: 'POST',
        headers: { ...authHeader(), 'ngrok-skip-browser-warning': 'true' },
        body: fd
      });
      if (res.ok) ok++;
      else fail++;
    } catch { fail++; }
  }

  if (btn) { btn.disabled = false; btn.textContent = '포트폴리오에 저장 →'; }
  document.getElementById('portfolioTagInputWrap').style.display = 'none';
  document.getElementById('portfolioMainTagInput').value = '';
  document.getElementById('portfolioTagInput').value = '';
  _portfolioPendingFiles.forEach(e => { if (e.objectUrl) URL.revokeObjectURL(e.objectUrl); });
  _portfolioPendingFiles = [];
  _pfGroups = [1]; _pfNextGroup = 2;

  showToast(ok + '장 저장 완료' + (fail ? ` (${fail}장 실패)` : '') + ' 📂');
  loadPortfolio();
}

let _activePortfolioMainTag = '';
let _activePortfolioSubTag = '';
let _activePortfolioPhotoType = '';
let _portfolioSearchVal = '';
let _portfolioDragSrcId = null;
let _portfolioItems = [];
let _portfolioUploadPhotoType = 'general';

function selectPhotoType(btn, type) {
  _portfolioUploadPhotoType = type;
  document.querySelectorAll('.portfolio-type-btn').forEach(b => {
    const isSelected = b.dataset.type === type;
    if (b.dataset.type === 'before') {
      b.style.background = isSelected ? 'rgba(100,149,237,0.18)' : 'transparent';
      b.style.borderColor = isSelected ? 'rgba(100,149,237,0.6)' : 'rgba(100,149,237,0.3)';
      b.style.color = isSelected ? '#6495ed' : 'var(--text3)';
    } else if (b.dataset.type === 'after') {
      b.style.background = isSelected ? 'rgba(241,128,145,0.15)' : 'transparent';
      b.style.borderColor = isSelected ? 'rgba(241,128,145,0.55)' : 'rgba(241,128,145,0.3)';
      b.style.color = isSelected ? 'var(--accent)' : 'var(--text3)';
    } else {
      b.style.background = isSelected ? 'rgba(0,0,0,0.06)' : 'transparent';
      b.style.borderColor = isSelected ? 'var(--border2)' : 'var(--border)';
      b.style.color = isSelected ? 'var(--text2)' : 'var(--text3)';
    }
  });
}

function filterPhotoType(btn, type) {
  _activePortfolioPhotoType = type;
  document.querySelectorAll('.ptype-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadPortfolio();
}

let _portfolioSearchTimer = null;
function onPortfolioSearch(val) {
  _portfolioSearchVal = val;
  clearTimeout(_portfolioSearchTimer);
  _portfolioSearchTimer = setTimeout(() => loadPortfolio(), 350);
}

async function loadPortfolio() {
  if (!getToken()) return;
  try {
    let url = `${API}/portfolio`;
    const params = [];
    if (_activePortfolioPhotoType) params.push('photo_type=' + encodeURIComponent(_activePortfolioPhotoType));
    if (_activePortfolioMainTag) params.push('main_tag=' + encodeURIComponent(_activePortfolioMainTag));
    if (_activePortfolioSubTag) params.push('tag=' + encodeURIComponent(_activePortfolioSubTag));
    if (_portfolioSearchVal) params.push('search=' + encodeURIComponent(_portfolioSearchVal));
    if (params.length) url += '?' + params.join('&');

    const [itemsRes, tagsRes] = await Promise.all([
      fetch(url, { headers: { ...authHeader(), 'ngrok-skip-browser-warning': 'true' } }),
      fetch(API + '/portfolio/tags', { headers: { ...authHeader(), 'ngrok-skip-browser-warning': 'true' } }),
    ]);
    _portfolioItems = await itemsRes.json();
    const tagData = await tagsRes.json();

    // 대분류 필터 버튼
    const mainFilter = document.getElementById('portfolioMainFilters');
    mainFilter.innerHTML = `<button class="style-opt${!_activePortfolioMainTag ? ' on' : ''}" onclick="filterMainTag(this,'')">전체</button>`;
    (tagData.main_tags || []).forEach(mt => {
      const b = document.createElement('button');
      b.className = 'style-opt' + (_activePortfolioMainTag === mt ? ' on' : '');
      b.textContent = mt;
      b.onclick = () => filterMainTag(b, mt);
      mainFilter.appendChild(b);
    });

    // 소분류 필터 버튼
    const subWrap = document.getElementById('portfolioSubFilterWrap');
    const subFilter = document.getElementById('portfolioSubFilters');
    const key = _activePortfolioMainTag || '__none__';
    const subTags = (tagData.sub_map || {})[key] || [];
    if (_activePortfolioMainTag && subTags.length > 0) {
      subWrap.style.display = 'block';
      subFilter.innerHTML = `<button class="style-opt${!_activePortfolioSubTag ? ' on' : ''}" onclick="filterSubTag(this,'')">전체</button>`;
      subTags.forEach(st => {
        const b = document.createElement('button');
        b.className = 'style-opt' + (_activePortfolioSubTag === st ? ' on' : '');
        b.textContent = st;
        b.onclick = () => filterSubTag(b, st);
        subFilter.appendChild(b);
      });
    } else {
      subWrap.style.display = 'none';
    }

    // 전체 태그 칩 렌더링
    const allTagsWrap = document.getElementById('portfolioAllTagsWrap');
    if (allTagsWrap) {
      allTagsWrap.innerHTML = '';
      const allSubTags = new Set();
      Object.values(tagData.sub_map || {}).forEach(arr => arr.forEach(t => allSubTags.add(t)));
      allSubTags.forEach(t => {
        const chip = document.createElement('button');
        chip.style.cssText = 'padding:4px 10px; border-radius:20px; border:1px solid rgba(241,128,145,0.25); background:rgba(241,128,145,0.06); color:var(--accent2); font-size:10px; font-weight:600; cursor:pointer; transition:all 0.12s;';
        chip.textContent = t;
        chip.onclick = () => {
          _activePortfolioSubTag = _activePortfolioSubTag === t ? '' : t;
          loadPortfolio();
        };
        if (_activePortfolioSubTag === t) {
          chip.style.background = 'var(--accent)';
          chip.style.color = '#fff';
          chip.style.borderColor = 'var(--accent)';
        }
        allTagsWrap.appendChild(chip);
      });
    }

    const grid = document.getElementById('portfolioGrid');
    const empty = document.getElementById('portfolioEmpty');
    grid.innerHTML = '';

    if (!_portfolioItems.length) {
      empty.style.display = 'block'; return;
    }
    empty.style.display = 'none';

    const ptypeColor = { before: '#6495ed', after: 'var(--accent)', general: 'var(--text3)' };
    const ptypeLabel = { before: 'BEFORE', after: 'AFTER', general: '일반' };

    _portfolioItems.forEach(item => {
      const src = item.image_url.startsWith('http') ? item.image_url : API + item.image_url;
      const pt = item.photo_type || 'general';
      const cell = document.createElement('div');
      cell.dataset.id = item.id;
      cell.draggable = true;
      cell.style.cssText = 'position:relative; aspect-ratio:1/1; overflow:hidden; border-radius:12px; background:var(--bg2); cursor:grab; transition:opacity 0.2s;';
      cell.innerHTML = `
        <img src="${src}" style="width:100%; height:100%; object-fit:cover; pointer-events:none;">
        <div style="position:absolute; top:4px; right:4px; background:${ptypeColor[pt]}; border-radius:20px; padding:2px 6px; font-size:8px; color:#fff; font-weight:800; opacity:0.92;">${ptypeLabel[pt]}</div>
        ${item.main_tag ? `<div style="position:absolute; top:4px; left:4px; background:rgba(0,0,0,0.6); backdrop-filter:blur(4px); border-radius:20px; padding:2px 6px; font-size:8px; color:#fff; font-weight:700;">${item.main_tag}</div>` : ''}
        ${item.tags ? `<div style="position:absolute; bottom:0; left:0; right:0; padding:5px 6px; background:linear-gradient(0deg,rgba(0,0,0,0.7),transparent); font-size:9px; color:#fff; line-height:1.4; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">${item.tags}</div>` : ''}
        <div style="position:absolute; inset:0; background:transparent; cursor:pointer;" onclick="openPortfolioItem(${item.id},'${src}','${(item.main_tag||'').replace(/'/g,"\\'")}','${(item.tags||'').replace(/'/g,"\\'")}')"></div>
      `;
      // 드래그 이벤트
      cell.addEventListener('dragstart', e => {
        _portfolioDragSrcId = item.id;
        e.dataTransfer.effectAllowed = 'move';
        cell.style.opacity = '0.4';
      });
      cell.addEventListener('dragend', () => { cell.style.opacity = '1'; });
      cell.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
      cell.addEventListener('drop', e => {
        e.preventDefault();
        if (_portfolioDragSrcId === item.id) return;
        const srcCell = grid.querySelector(`[data-id="${_portfolioDragSrcId}"]`);
        if (!srcCell) return;
        const allCells = [...grid.querySelectorAll('[data-id]')];
        const srcIdx = allCells.indexOf(srcCell);
        const dstIdx = allCells.indexOf(cell);
        if (srcIdx < dstIdx) grid.insertBefore(srcCell, cell.nextSibling);
        else grid.insertBefore(srcCell, cell);
        savePortfolioOrder();
      });
      grid.appendChild(cell);
    });
  } catch(e) {
    console.error('포트폴리오 로드 오류:', e);
  }
}

function filterMainTag(btn, tag) {
  _activePortfolioMainTag = tag;
  _activePortfolioSubTag = '';
  document.querySelectorAll('#portfolioMainFilters .style-opt').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  loadPortfolio();
}

function filterSubTag(btn, tag) {
  _activePortfolioSubTag = tag;
  document.querySelectorAll('#portfolioSubFilters .style-opt').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  loadPortfolio();
}

// 하위 호환 유지
function filterPortfolio(btn, tag) { filterMainTag(btn, tag); }

async function savePortfolioOrder() {
  const grid = document.getElementById('portfolioGrid');
  const ids = [...grid.querySelectorAll('[data-id]')].map(c => parseInt(c.dataset.id));
  try {
    await fetch(API + '/portfolio/reorder', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
  } catch(e) { console.warn('순서 저장 실패:', e); }
}

function openPortfolioItem(id, src, mainTag, tags) {
  const label = [mainTag, tags].filter(Boolean).join(' · ') || '태그 없음';
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed; inset:0; z-index:9000; background:rgba(0,0,0,0.88); display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px;';
  overlay.innerHTML = `
    <img src="${src}" style="max-width:100%; max-height:62vh; border-radius:16px; object-fit:contain; margin-bottom:14px;">
    ${mainTag ? `<div style="background:var(--accent); border-radius:20px; padding:3px 12px; font-size:11px; color:#fff; font-weight:700; margin-bottom:6px;">${mainTag}</div>` : ''}
    <div style="color:rgba(255,255,255,0.7); font-size:12px; margin-bottom:18px;">${tags || ''}</div>
    <div style="display:flex; gap:10px;">
      <button onclick="deletePortfolioItem(${id}, this.closest('[style*=fixed]'))" style="padding:11px 18px; border-radius:12px; border:none; background:rgba(192,57,43,0.85); color:#fff; font-weight:700; cursor:pointer; font-size:12px;">삭제 🗑</button>
      <button onclick="this.closest('[style*=fixed]').remove()" style="padding:11px 18px; border-radius:12px; border:none; background:rgba(255,255,255,0.12); color:#fff; font-weight:700; cursor:pointer; font-size:12px;">닫기</button>
    </div>
  `;
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}

async function deletePortfolioItem(id, overlay) {
  if (!confirm('삭제할까요?')) return;
  const res = await fetch(API + '/portfolio/' + id, {
    method: 'DELETE',
    headers: { ...authHeader(), 'ngrok-skip-browser-warning': 'true' }
  });
  if (res.ok) {
    overlay.remove();
    loadPortfolio();
    showToast('삭제 완료 🗑');
  } else {
    showToast('삭제 실패');
  }
}

// =====================================================================
// ===== Long Press 업로드 + 햅틱 + 컨페티 (2-A) =====
// =====================================================================
function initLongPressUpload(areaId, inputSelector) {
  const area = document.getElementById(areaId);
  if (!area) return;

  // SVG 게이지 삽입
  const ring = document.createElement('div');
  ring.className = 'lp-ring';
  ring.innerHTML = `<svg class="lp-svg" viewBox="0 0 56 56"><circle class="lp-circle" cx="28" cy="28" r="25"/></svg>`;
  area.style.position = 'relative';
  area.appendChild(ring);
  const circle = ring.querySelector('.lp-circle');

  const HOLD_MS = 700;
  let timer = null, startPct = 0;

  function startHold(e) {
    if (e.target.tagName === 'INPUT') return;
    startPct = 0;
    const start = Date.now();
    const CIRC = 157;
    timer = setInterval(() => {
      const pct = Math.min((Date.now() - start) / HOLD_MS, 1);
      circle.style.strokeDashoffset = CIRC - pct * CIRC;
      if (pct >= 1) {
        clearInterval(timer); timer = null;
        circle.style.strokeDashoffset = 0;
        // 햅틱
        if (navigator.vibrate) navigator.vibrate([40, 20, 60]);
        // 컨페티
        for (let i = 0; i < 14; i++) setTimeout(createConfetti, i * 80);
        // 파일 입력 트리거
        const inp = area.querySelector(inputSelector || 'input[type=file]');
        if (inp) inp.click();
        setTimeout(() => { circle.style.strokeDashoffset = CIRC; }, 400);
      }
    }, 30);
  }

  function cancelHold() {
    if (timer) { clearInterval(timer); timer = null; }
    circle.style.transition = 'stroke-dashoffset 0.3s ease';
    circle.style.strokeDashoffset = 157;
    setTimeout(() => { circle.style.transition = ''; }, 300);
  }

  area.addEventListener('pointerdown', startHold);
  area.addEventListener('pointerup', cancelHold);
  area.addEventListener('pointerleave', cancelHold);
  area.addEventListener('pointercancel', cancelHold);

  // 일반 클릭 폴백 (짧게 누를 때)
  area.addEventListener('click', (e) => {
    if (e.target.tagName !== 'INPUT') {
      const inp = area.querySelector(inputSelector || 'input[type=file]');
      if (inp) inp.click();
    }
  });
}

// 업로드 영역 Long Press 초기화 (DOM 로드 후 실행)
document.addEventListener('DOMContentLoaded', () => {
  ['beforeArea', 'afterArea', 'editArea', 'portfolioUploadArea'].forEach(id => {
    initLongPressUpload(id, 'input[type=file]');
  });

  // PWA 설치 완료 시 설치 카드 숨기기
  const isPWA = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  if (isPWA) {
    const card = document.getElementById('pwaInstallCard');
    if (card) card.style.display = 'none';
  }
});

// =====================================================================
// ===== 카드덱 UI (2-B) =====
// =====================================================================
let _cardDeckPhotos = []; // {url, file}
let _cardDeckCurrent = 0;
let _cardDeckDragStart = null;

function initCardDeck(containerId) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  renderCardDeck(wrap);
}

function addToCardDeck(file, containerId) {
  if (_cardDeckPhotos.length >= 4) { showToast('최대 4장까지 선택 가능해요!'); return; }
  const url = URL.createObjectURL(file);
  _cardDeckPhotos.push({ url, file });
  const wrap = document.getElementById(containerId);
  if (wrap) renderCardDeck(wrap);
}

function renderCardDeck(wrap) {
  wrap.innerHTML = '';
  if (_cardDeckPhotos.length === 0) return;

  const deckEl = document.createElement('div');
  deckEl.className = 'card-deck-wrap';

  _cardDeckPhotos.forEach((photo, i) => {
    const card = document.createElement('div');
    card.className = 'card-deck-item';
    const offset = (i - _cardDeckCurrent);
    const rotate = offset * 4;
    const tx = offset * 18;
    const scale = 1 - Math.abs(offset) * 0.06;
    const zIndex = _cardDeckPhotos.length - Math.abs(offset);
    card.style.transform = `translateX(${tx}px) rotate(${rotate}deg) scale(${scale})`;
    card.style.zIndex = zIndex;
    card.style.opacity = Math.abs(offset) > 1 ? '0.5' : '1';

    const img = document.createElement('img');
    img.src = photo.url;
    const idx = document.createElement('div');
    idx.className = 'card-idx';
    idx.textContent = `${i + 1}/${_cardDeckPhotos.length}`;
    card.appendChild(img);
    card.appendChild(idx);
    deckEl.appendChild(card);
  });

  // 스와이프 이벤트
  let touchStartX = 0;
  deckEl.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  deckEl.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) {
      _cardDeckCurrent = Math.max(0, Math.min(_cardDeckPhotos.length - 1, _cardDeckCurrent + (dx < 0 ? 1 : -1)));
      renderCardDeck(wrap);
    }
  });

  // 도트 네비게이션
  const nav = document.createElement('div');
  nav.className = 'card-deck-nav';
  _cardDeckPhotos.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'card-deck-dot' + (i === _cardDeckCurrent ? ' active' : '');
    dot.onclick = () => { _cardDeckCurrent = i; renderCardDeck(wrap); };
    nav.appendChild(dot);
  });

  wrap.appendChild(deckEl);
  wrap.appendChild(nav);
}

// =====================================================================
// ===== 배경 창고 (2-C) =====
// =====================================================================
let _bgAssets = [];

async function loadBgAssets() {
  try {
    const res = await fetch(API + '/background', { headers: authHeader() });
    if (!res.ok) return;
    _bgAssets = await res.json();
    renderBgStoreGrid();
  } catch(e) {}
}

function renderBgStoreGrid() {
  const grid = document.getElementById('bgStoreGrid');
  if (!grid) return;
  grid.innerHTML = '';
  if (_bgAssets.length === 0) {
    grid.innerHTML = '<div style="font-size:11px; color:var(--text3); grid-column:span 3;">아직 저장된 배경이 없어요</div>';
    return;
  }
  _bgAssets.forEach(asset => {
    const cell = document.createElement('div');
    cell.style.cssText = 'position:relative; border-radius:10px; overflow:hidden; cursor:pointer; aspect-ratio:1; background:var(--bg2);';
    cell.innerHTML = `
      <img src="${API + asset.image_url}" style="width:100%; height:100%; object-fit:cover;" onclick="selectBgAsset('${API + asset.image_url}')">
      <button onclick="deleteBgAsset(${asset.id}, this.parentElement)" style="position:absolute; top:3px; right:3px; background:rgba(0,0,0,0.5); border:none; color:white; border-radius:50%; width:20px; height:20px; font-size:11px; cursor:pointer; display:flex; align-items:center; justify-content:center;">×</button>
      ${asset.label ? `<div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.4); color:white; font-size:9px; padding:2px 4px; text-align:center;">${asset.label}</div>` : ''}
    `;
    grid.appendChild(cell);
  });
}

function selectBgAsset(url) {
  // 배경 옵션 선택 해제 (창고 이미지가 우선)
  document.querySelectorAll('#bgOpts .style-opt').forEach(b => b.classList.remove('on'));
  // 전역 변수에 커스텀 배경 URL 저장
  window._customBgUrl = url;
  // 선택된 셀 강조
  document.querySelectorAll('#bgStoreGrid > div').forEach(cell => {
    cell.style.outline = '';
  });
  // 클릭된 이미지의 부모 셀 강조
  const allCells = document.querySelectorAll('#bgStoreGrid > div');
  allCells.forEach(cell => {
    if (cell.querySelector('img')?.src === url) {
      cell.style.outline = '2px solid var(--accent)';
    }
  });
  // 배경 창고 토글 버튼 텍스트로 선택 상태 표시
  const toggleBtn = document.getElementById('bgStoreToggle');
  if (toggleBtn) toggleBtn.textContent = '📦 배경 창고 (1개 선택됨)';
  showToast('배경 선택 완료! 합성 버튼을 눌러주세요 ✨');
  const panel = document.getElementById('bgStorePanel');
  if (panel) panel.style.display = 'none';
}

async function uploadBgAsset(input) {
  if (!input.files || !input.files[0]) return;
  const label = prompt('이 배경의 이름을 입력하세요 (예: 포토존, 흰벽)', '') || '';
  const fd = new FormData();
  fd.append('image', input.files[0]);
  fd.append('label', label);
  try {
    const res = await fetch(API + '/background', { method: 'POST', headers: authHeader(), body: fd });
    if (!res.ok) throw new Error();
    showToast('배경 창고에 저장됐어요! 📦');
    await loadBgAssets();
  } catch(e) {
    showToast('저장 실패');
  }
  input.value = '';
}

async function deleteBgAsset(id, el) {
  try {
    const res = await fetch(API + '/background/' + id, { method: 'DELETE', headers: authHeader() });
    if (res.ok) { el.remove(); _bgAssets = _bgAssets.filter(a => a.id !== id); showToast('삭제됐어요'); }
  } catch(e) {}
}

function toggleBgStore() {
  const panel = document.getElementById('bgStorePanel');
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  document.getElementById('bgStoreToggle').textContent = isOpen ? '📦 배경 창고 열기' : '📦 배경 창고 닫기';
  if (!isOpen) loadBgAssets();
}

// =====================================================================
// ===== 얼굴 자동 블러 (2-D) =====
// =====================================================================
let _detectedFaces = [];
let _editOriginalBlob = null; // 원본 이미지 보관 (블러 적용/해제용)

async function detectFaceAfterEdit(imageBlob) {
  _editOriginalBlob = imageBlob;
  _detectedFaces = [];
  document.getElementById('faceBlurWrap').style.display = 'none';
  document.getElementById('faceBlurCheck').checked = false;

  try {
    const fd = new FormData();
    fd.append('file', imageBlob, 'edit.png');
    const res = await fetch(API + '/image/detect-face', { method: 'POST', headers: authHeader(), body: fd });
    if (!res.ok) return;
    const data = await res.json();
    if (data.faces && data.faces.length > 0) {
      _detectedFaces = data.faces;
      document.getElementById('faceBlurWrap').style.display = 'block';
    }
  } catch(e) {}
}

async function applyFaceBlur(checked) {
  if (!_editOriginalBlob) return;
  const progress = document.getElementById('faceBlurProgress');
  progress.style.display = 'block';

  if (!checked) {
    // 원본으로 복원
    const canvas = document.getElementById('editCanvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => { ctx.drawImage(img, 0, 0); progress.style.display = 'none'; };
    img.src = URL.createObjectURL(_editOriginalBlob);
    return;
  }

  try {
    const fd = new FormData();
    fd.append('file', _editOriginalBlob, 'edit.png');
    fd.append('faces', JSON.stringify(_detectedFaces));
    const res = await fetch(API + '/image/blur-face', { method: 'POST', headers: authHeader(), body: fd });
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const canvas = document.getElementById('editCanvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      progress.style.display = 'none';
    };
    img.src = URL.createObjectURL(blob);
  } catch(e) {
    progress.style.display = 'none';
    showToast('블러 처리 실패 😢');
    document.getElementById('faceBlurCheck').checked = false;
  }
}

// ═══════════════════════════════════════════════════════
// 공유 캔버스 유틸 — app-gallery.js에서도 사용
// ═══════════════════════════════════════════════════════

/**
 * /image/remove-bg 결과 personImg를 배경 위에 합성해 canvas에 그린다.
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLImageElement}  personImg  — 배경 제거된 PNG img 엘리먼트
 * @param {number} W
 * @param {number} H
 * @param {string} bgMode  — cloud_bw | cloud_color | mosaic | pink | white | custom
 * @param {string|null} customBgUrl
 */
async function compositePersonOnCanvas(canvas, personImg, W, H, bgMode, customBgUrl) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  if (customBgUrl) {
    const blobRes = await fetch(customBgUrl, { headers: authHeader() });
    if (!blobRes.ok) throw new Error('배경 이미지 로드 실패');
    const blobData = await blobRes.blob();
    const blobObjUrl = URL.createObjectURL(blobData);
    const bgImg = await _loadImageSrc(blobObjUrl);
    URL.revokeObjectURL(blobObjUrl);
    _drawCoverCtx(ctx, bgImg, 0, 0, W, H);
  } else if (bgMode === 'mosaic') {
    _drawCoverCtx(ctx, personImg, 0, 0, W, H);
    const PIXEL = 28;
    const cols = Math.ceil(W / PIXEL), rows = Math.ceil(H / PIXEL);
    const tmp = document.createElement('canvas');
    tmp.width = cols; tmp.height = rows;
    tmp.getContext('2d').drawImage(canvas, 0, 0, W, H, 0, 0, cols, rows);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, cols, rows, 0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, W, H);
  } else {
    const bgImg = await getCloudBg(W, H, bgMode);
    ctx.drawImage(bgImg, 0, 0, W, H);
  }

  // 인물 배치
  const scale = Math.min(W / personImg.width, H / personImg.height) * 0.92;
  const pw = personImg.width * scale, ph = personImg.height * scale;
  ctx.drawImage(personImg, (W - pw) / 2, H - ph - H * 0.02, pw, ph);
}

/**
 * Before / After 좌우 분할 합성
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLImageElement} beforeImg
 * @param {HTMLImageElement} afterImg
 * @param {number} W
 * @param {number} H
 */
function renderBASplit(canvas, beforeImg, afterImg, W, H) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  _drawCoverCtx(ctx, beforeImg, 0, 0, W / 2, H);
  _drawCoverCtx(ctx, afterImg,  W / 2, 0, W / 2, H);
  ctx.fillStyle = '#fff';
  ctx.fillRect(W / 2 - 1, 0, 2, H);
  ctx.font = 'bold 32px "Noto Sans KR", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.textAlign = 'center';
  ctx.fillText('BEFORE', W / 4, H - 30);
  ctx.fillText('AFTER',  W * 3 / 4, H - 30);
}

/** cover-fit 드로우 헬퍼 */
function _drawCoverCtx(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale, sh = h / scale;
  const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/** src → HTMLImageElement */
function _loadImageSrc(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
