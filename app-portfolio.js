// Itdasy Studio - 포트폴리오 (사진관리, 카드덱, 배경, 블러, 자동편집)


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


async function deleteBgAsset(id, el) {
  try {
    const res = await fetch(API + '/background/' + id, { method: 'DELETE', headers: authHeader() });
    if (res.ok) { el.remove(); _bgAssets = _bgAssets.filter(a => a.id !== id); showToast('삭제됐어요'); }
  } catch(e) {}
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
