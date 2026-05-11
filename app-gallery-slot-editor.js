// Itdasy Studio — 슬롯 팝업 / BA 모드 / 미리보기
// 의존: app-gallery-utils.js, app-gallery-db.js, app-gallery-workshop.js
// 상태 쓰기는 app-gallery-workshop.js 의 setter 함수 경유 (직접 변이 금지)

// ── 슬롯 팝업 열기 / 닫기 ──────────────────────────────────────
async function openSlotPopup(slotId) {
  const slot = _slots.find(s => s.id === slotId);
  if (!slot) return;
  _setPopupSlotId(slotId);
  _clearPopupSelIds();

  document.getElementById('slotPopupLabel').textContent = slot.label + (slot.status === 'done' ? ' ✓' : '');
  const popup = document.getElementById('slotPopup');
  popup.style.display = 'flex';
  popup.classList.add('dt-shown');

  try {
    const res = await fetch(API + '/image/usage', { headers: authHeader() });
    if (res.ok) _setPopupUsage(await res.json());
  } catch (_e) { _setPopupUsage(null); }

  _renderPopupBody(slot);

  // UX: 팝업 스크롤 위치를 상단으로 리셋 + 바디 요소를 뷰포트 내로 이동
  requestAnimationFrame(() => {
    const body = document.getElementById('slotPopupBody');
    if (body) body.scrollTop = 0;
    popup.scrollTop = 0;
  });
}

function closeSlotPopup() {
  const popup = document.getElementById('slotPopup');
  popup.style.display = 'none';
  popup.classList.remove('dt-shown');
  _setPopupSlotId(null);
  _clearPopupSelIds();
  _renderSlotCards();
  _renderPhotoGrid();
}

async function saveAndCloseSlotPopup() {
  _setSlotStatus(_popupSlotId, 'done');
  const slot = _getSlot(_popupSlotId);
  if (slot) {
    try { await saveSlotToDB(slot); } catch (_e) { /* ignore */ }
  }
  closeSlotPopup();
  _renderCompletionBanner();

  const done      = _slots.filter(s => s.status === 'done').length;
  const total     = _slots.length;
  const nextSlot  = _slots.find(s => s.status !== 'done' && s.photos.length > 0);

  if (nextSlot) {
    _showNextSlotGuide(nextSlot, done, total);
  } else if (done === total) {
    showToast('모든 작업 완료! 글쓰기로 이동하세요');
  }
}

// P3-A 공개 alias (renderHomeResume 의 onclick 에서 사용)
window.openSlotEditor = openSlotPopup;

// ── 다음 손님 유도 바텀시트 ────────────────────────────────────
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
      <div style="display:flex;justify-content:center;padding:0 0 12px;"><div style="width:36px;height:4px;border-radius:2px;background:rgba(0,0,0,0.12);"></div></div>
      <div style="text-align:center;margin-bottom:16px;">
        <div style="font-size:32px;margin-bottom:8px;">✅</div>
        <div style="font-size:15px;font-weight:800;color:var(--text);">${nextSlot.label.replace('손님','손님 ')}도 작업할까요?</div>
        <div style="font-size:12px;color:var(--text3);margin-top:4px;">완료 ${doneCount}/${totalCount}</div>
      </div>
      <div style="display:flex;gap:10px;">
        <button onclick="document.getElementById('_nextSlotGuide').style.display='none';openSlotPopup('${nextSlot.id}')" style="flex:1;padding:14px;border-radius:14px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:14px;font-weight:800;cursor:pointer;">${nextSlot.label} →</button>
        <button onclick="document.getElementById('_nextSlotGuide').style.display='none';showTab('caption',document.querySelector('.tab-bar__fab[data-tab=&quot;caption&quot;]'));initCaptionSlotPicker();if(typeof renderCaptionKeywordTags==='function')renderCaptionKeywordTags();" style="flex:1;padding:14px;border-radius:14px;border:1.5px solid var(--accent);background:transparent;color:var(--accent);font-size:14px;font-weight:700;cursor:pointer;">지금 글쓰기로 →</button>
      </div>
    </div>
  `;
  pop.style.display = 'flex';
}

// ── 팝업 바디 렌더링 ───────────────────────────────────────────
function _renderPopupBody(slot) {
  const body = document.getElementById('slotPopupBody');
  if (!body) return;

  const usageHtml = _popupUsage
    ? `<div style="font-size:11px;color:var(--text3);margin-bottom:12px;">AI 누끼따기 남은 횟수: <b style="color:var(--accent);">${_popupUsage.limit - _popupUsage.used}/${_popupUsage.limit}회</b></div>`
    : '';

  body.innerHTML = `
    ${usageHtml}
    <input type="file" id="popupPhotoInput" accept="image/*" multiple style="display:none;" onchange="addPhotosToPopup(this)">
    <div id="popupPhotoGrid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px;"></div>
    <div id="popupBulkBar" style="display:none;background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:12px;margin-bottom:12px;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="font-size:12px;font-weight:700;color:var(--text);"><span id="popupSelCount">0</span>장 선택됨</div>
        <button onclick="_bulkDeletePopup()" style="padding:8px 14px;border-radius:8px;border:1px solid rgba(220,53,69,0.4);background:transparent;color:#dc3545;font-size:11px;font-weight:700;cursor:pointer;">선택 삭제</button>
      </div>
    </div>
    <div id="popupProgress" style="display:none;text-align:center;padding:16px;font-size:13px;color:var(--text3);">처리 중... ⏳</div>
  `;
  _renderPopupPhotoGrid(slot);
}

// ── 팝업 사진 그리드 렌더링 ────────────────────────────────────
function _renderPopupPhotoGrid(slot) {
  const grid    = document.getElementById('popupPhotoGrid');
  const bulkBar = document.getElementById('popupBulkBar');
  const selCount = document.getElementById('popupSelCount');
  if (!grid) return;

  const visiblePhotos = (slot.photos || []).filter(p => !p.hidden);

  if (selCount) selCount.textContent = _popupSelIds.size;
  if (bulkBar)  bulkBar.style.display = _popupSelIds.size > 0 ? 'block' : 'none';

  const selArr    = [..._popupSelIds];
  const baLabelMap = {};
  if (_baMode) {
    if (selArr[0]) baLabelMap[selArr[0]] = 'BEFORE';
    if (selArr[1]) baLabelMap[selArr[1]] = 'AFTER';
  }

  const modeColor = { original: 'var(--text3)', ai_bg: 'var(--accent)', ba: '#8fa4ff', enhanced: '#10B981' };
  const modeLabel = { original: '원본', ai_bg: 'AI합성', ba: '비포/애프터', enhanced: '보정' };

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

  // 마지막 칸 +추가 카드 — 남은 열 수만큼 span 해서 빈공간 0
  const N = visiblePhotos.length;
  const cols = 3;
  const remainder = N % cols;
  const span = remainder === 0 ? cols : cols - remainder;

  const addCell = document.createElement('div');
  addCell.style.cssText = `grid-column:span ${span};aspect-ratio:${span}/1;border-radius:10px;background:var(--bg2,#f8f8f9);border:1.5px dashed var(--border,rgba(0,0,0,0.1));display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;cursor:pointer;user-select:none;`;
  addCell.innerHTML = `
    <div style="width:32px;height:32px;border-radius:50%;background:#fff;display:grid;place-items:center;color:var(--accent,var(--brand));">
      <i class="ph-duotone ph-plus" style="font-size:16px" aria-hidden="true"></i>
    </div>
    <div style="font-size:11px;font-weight:700;color:var(--text2,#5A6573);">사진 더 추가</div>
  `;
  addCell.addEventListener('click', () => document.getElementById('popupPhotoInput').click());
  grid.appendChild(addCell);
}

// ── 팝업 사진 선택 토글 ────────────────────────────────────────
function togglePopupPhotoSel(id) {
  const wasSelected = _popupSelIds.has(id);
  _togglePopupSelId(id);
  const slot = _slots.find(s => s.id === _popupSlotId);
  if (slot) _renderPopupPhotoGrid(slot);

  if (window.hapticLight) window.hapticLight();

  if (_baMode && _popupSelIds.size >= 2) {
    setTimeout(() => _checkAndApplyBA(), 100);
    return;
  }

  if (!wasSelected && _popupSelIds.size === 1) {
    if (typeof showToast === 'function') showToast('1장 선택됨 — 아래에서 편집 방식을 골라주세요');
    setTimeout(() => {
      const actionBar = document.getElementById('popupActionBar') || document.getElementById('slotPopupActions');
      if (actionBar && typeof actionBar.scrollIntoView === 'function') {
        actionBar.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }, 150);
  }
}

// ── 배정 취소 (미배정 풀로 복귀) ──────────────────────────────
async function unassignPopupPhoto(photoId, e) {
  e?.stopPropagation();
  const slot = _slots.find(s => s.id === _popupSlotId);
  if (!slot) return;
  const sp = slot.photos.find(p => p.id === photoId);
  if (sp && !_photos.find(p => p.id === photoId)) {
    _pushToPhotos({ id: sp.id, file: null, dataUrl: sp.dataUrl });
  }
  _filterSlotPhotos(_popupSlotId, p => p.id !== photoId);
  _removePopupSelId(photoId);
  try { await saveSlotToDB(slot); } catch (_e) { /* ignore */ }
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
    _pushToPhotos({ id, file, dataUrl });
  }
  input.value = '';
  try { await saveSlotToDB(slot); } catch (_e) { /* ignore */ }
  _renderPopupPhotoGrid(slot);
}

// ── 비포/애프터 모드 ───────────────────────────────────────────
function toggleBAMode() {
  _setBAMode(!_baMode);
  const btn = document.getElementById('baBtnToolbar');
  if (btn) {
    btn.style.background  = _baMode ? 'linear-gradient(135deg,#8fa4ff,#a3b4ff)' : '#fff';
    btn.style.color       = _baMode ? '#fff' : 'var(--text)';
    btn.style.borderColor = _baMode ? '#8fa4ff' : 'var(--border)';
  }
  if (_baMode) {
    _clearPopupSelIds();
    showToast('비포/애프터 모드 ON\n사진 2장을 순서대로 선택하세요');
  } else {
    showToast('비포/애프터 모드 OFF');
  }
  const slot = _slots.find(s => s.id === _popupSlotId);
  if (slot) _renderPopupPhotoGrid(slot);
}

async function _checkAndApplyBA() {
  if (!_baMode || _popupSelIds.size < 2) return;
  await _bulkApplyBA();
  _setBAMode(false);
  const btn = document.getElementById('baBtnToolbar');
  if (btn) { btn.style.background = '#fff'; btn.style.color = 'var(--text)'; btn.style.borderColor = 'var(--border)'; }
}

async function _bulkApplyBA() {
  if (_popupSelIds.size < 2) { showToast('사진 2장 선택해주세요'); return; }
  const slot = _slots.find(s => s.id === _popupSlotId);
  if (!slot) return;
  const selArr   = [..._popupSelIds];
  const before   = slot.photos.find(p => p.id === selArr[0]);
  const after    = slot.photos.find(p => p.id === selArr[1]);
  if (!before || !after) return;
  const progress = document.getElementById('popupProgress');
  if (progress) progress.style.display = 'block';
  await _applyBABetween(before, after, slot);
  before.baAfterRefId = selArr[1];
  after.hidden = true;
  try { await saveSlotToDB(slot); } catch (_e) { /* ignore */ }
  if (progress) progress.style.display = 'none';
  _clearPopupSelIds();
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
  try { await saveSlotToDB(slot); } catch (_e) { /* ignore */ }
  _renderPopupPhotoGrid(slot);
  showToast('원본 2장으로 복원됐어요');
}

// ── 인스타 미리보기 ────────────────────────────────────────────
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

// ── 선택 일괄 삭제 ─────────────────────────────────────────────
async function _bulkDeletePopup() {
  const slot = _slots.find(s => s.id === _popupSlotId);
  if (!slot || !_popupSelIds.size) return;
  if (!confirm(`선택한 ${_popupSelIds.size}장을 삭제할까요?`)) return;
  _filterSlotPhotos(_popupSlotId, p => !_popupSelIds.has(p.id));
  try { await saveSlotToDB(slot); } catch (_e) { /* ignore */ }
  _clearPopupSelIds();
  _renderPopupPhotoGrid(slot);
  _renderSlotCards();
  showToast('삭제됨');
}

// ── 비포/애프터 합성 (app-portfolio.js 공유 유틸 사용) ─────────
async function _applyBABetween(before, after, slot) {
  try {
    const beforeImg = await _loadImageSrc(before.editedDataUrl || before.dataUrl);
    const afterImg  = await _loadImageSrc(after.editedDataUrl || after.dataUrl);
    const canvas    = document.createElement('canvas');
    renderBASplit(canvas, beforeImg, afterImg, 1080, 1080);
    before.editedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
    before.mode = 'ba';
    await saveSlotToDB(slot);
  } catch (e) { showToast('오류: ' + (window._humanError ? window._humanError(e) : e.message)); }
}
