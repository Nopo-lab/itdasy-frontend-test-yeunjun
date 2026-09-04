/* exported saveAndCloseSlotPopup, toggleBAMode */
// Itdasy Studio — 슬롯 팝업 / BA 모드 / 미리보기
// 의존: app-gallery-utils.js, app-gallery-db.js, app-gallery-workshop.js
// 상태 쓰기는 app-gallery-workshop.js 의 setter 함수 경유 (직접 변이 금지)

function _slotEsc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

// [PR-1] 슬롯 팝업 멀티 사진 스테이지 — 활성(편집 대상) 사진 id.
//   현재(PR-1): 첫 장 자동 활성 + 탭 전환 + 시각 표시. 슬롯 데이터는 불변.
//   다음(PR-3): 이 active photo 가 하단 메뉴의 PhotoEditor.open({onSave}) "편집 대상" 기준이 됨.
//   기존 _popupSelIds(다중 선택: 일괄삭제/BA)는 그대로 유지 — _activePhotoId 는 그와 독립된 단일 편집 대상.
let _activePhotoId = null;

// [PR-E1] 전후 Before/After 선택 상태 — 기존 _popupSelIds(다중선택/삭제/구 BA 폴백)와 완전 분리.
//   _baBefore/_baAfter = 선택된 photo id, _baFocus = 스트립에서 탭한 사진(지정 대상).
let _baBefore = null, _baAfter = null, _baFocus = null;

// ── 슬롯 팝업 열기 / 닫기 ──────────────────────────────────────
async function openSlotPopup(slotId) {
  const slot = _slots.find(s => s.id === slotId);
  if (!slot) return;
  _setPopupSlotId(slotId);
  _clearPopupSelIds();
  _activePhotoId = null;   // [PR-1] 렌더에서 첫 사진 자동 활성

  document.getElementById('slotPopupLabel').textContent = slot.label + (slot.status === 'done' ? ' ✓' : '');
  const popup = document.getElementById('slotPopup');
  popup.style.display = 'flex';
  popup.classList.add('dt-shown');

  try {
    const res = await apiFetch('/image/usage', { headers: authHeader() });
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
  const nextLabel = nextSlot.label.replace('손님','손님 ');
  pop.innerHTML = `
    <div style="width:100%;max-width:480px;background:#fff;border-radius:20px 20px 0 0;padding:20px 16px 28px;">
      <div style="display:flex;justify-content:center;padding:0 0 12px;"><div style="width:36px;height:4px;border-radius:2px;background:rgba(0,0,0,0.12);"></div></div>
      <div style="text-align:center;margin-bottom:16px;">
        <div style="font-size:32px;margin-bottom:8px;">✅</div>
        <div style="font-size:15px;font-weight:800;color:var(--text);">${_slotEsc(nextLabel)}도 작업할까요?</div>
        <div style="font-size:12px;color:var(--text3);margin-top:4px;">완료 ${doneCount}/${totalCount}</div>
      </div>
      <div style="display:flex;gap:10px;">
        <button data-next-open data-slot-id="${_slotEsc(nextSlot.id)}" style="flex:1;padding:14px;border-radius:14px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:14px;font-weight:800;cursor:pointer;">${_slotEsc(nextSlot.label)} →</button>
        <button data-next-caption style="flex:1;padding:14px;border-radius:14px;border:1.5px solid var(--accent);background:transparent;color:var(--accent);font-size:14px;font-weight:700;cursor:pointer;">지금 글쓰기로 →</button>
      </div>
    </div>
  `;
  pop.querySelector('[data-next-open]')?.addEventListener('click', e => {
    pop.style.display = 'none';
    openSlotPopup(e.currentTarget.dataset.slotId);
  });
  pop.querySelector('[data-next-caption]')?.addEventListener('click', () => {
    pop.style.display = 'none';
    showTab('caption', document.querySelector('.tab-bar__fab[data-tab="caption"]'));
    initCaptionSlotPicker();
    if (typeof renderCaptionKeywordTags === 'function') renderCaptionKeywordTags();
  });
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
    <input type="file" id="popupPhotoInput" data-popup-upload accept="image/*" multiple style="display:none;">
    <!-- [PR-Design-2] 상단 작은 사진 스트립 + 중앙 큰 active 미리보기 (캐러셀 대체) -->
    <div id="popupPhotoStrip" class="ws-strip"></div>
    <div id="popupMainPreview" class="ws-main"></div>
    <div id="popupBulkBar" style="display:none;background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:12px;margin-bottom:12px;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="font-size:12px;font-weight:700;color:var(--text);"><span id="popupSelCount">0</span>장 선택됨</div>
        <button data-popup-bulk-delete style="padding:8px 14px;border-radius:8px;border:1px solid rgba(220,53,69,0.4);background:transparent;color:var(--danger);font-size:11px;font-weight:700;cursor:pointer;">선택 삭제</button>
      </div>
    </div>
    <div id="popupProgress" style="display:none;text-align:center;padding:16px;font-size:13px;color:var(--text3);">처리 중... ⏳</div>
  `;
  _bindSlotPopupBody(body);
  _renderPopupPhotoGrid(slot);
}

function _bindSlotPopupBody(body) {
  if (!body || body.dataset.slotBodyBound === '1') return;
  body.dataset.slotBodyBound = '1';
  body.addEventListener('click', e => {
    const t = e.target.closest('[data-popup-bulk-delete]');
    if (!t || !body.contains(t)) return;
    _bulkDeletePopup();
  });
  body.addEventListener('change', e => {
    if (e.target && e.target.matches('[data-popup-upload]')) addPhotosToPopup(e.target);
  });
}

// ── [PR-Design-2] 팝업 사진 렌더 — 상단 스트립 + 중앙 큰 active 미리보기 ──
//   (기존 큰 카드 캐러셀 대체. _activePhotoId/_popupSelIds/onSave/BA 폴백 경로 불변.)
function _renderPopupPhotoGrid(slot) {
  const strip = document.getElementById('popupPhotoStrip');
  const main  = document.getElementById('popupMainPreview');
  const bulkBar = document.getElementById('popupBulkBar');
  const selCount = document.getElementById('popupSelCount');
  if (!strip && !main) return;

  const visiblePhotos = (slot.photos || []).filter(p => !p.hidden);
  if (!_activePhotoId || !visiblePhotos.some(p => p.id === _activePhotoId)) {
    _activePhotoId = visiblePhotos[0] ? visiblePhotos[0].id : null;
  }
  _syncWorkshopSource();

  const aIdx = visiblePhotos.findIndex(p => p.id === _activePhotoId);
  const ctxEl = document.getElementById('slotActiveCtx');
  if (ctxEl) { ctxEl.textContent = ''; ctxEl.style.display = 'none'; }   // N/M 은 메인 pill 로 대체

  if (selCount) selCount.textContent = _popupSelIds.size;
  if (bulkBar)  bulkBar.style.display = _popupSelIds.size > 0 ? 'block' : 'none';

  const selArr = [..._popupSelIds];
  const baLabelMap = {};
  if (_baMode) { if (selArr[0]) baLabelMap[selArr[0]] = 'BEFORE'; if (selArr[1]) baLabelMap[selArr[1]] = 'AFTER'; }

  // ── 상단 스트립 ──
  if (strip) {
    strip.innerHTML = '';
    visiblePhotos.forEach((photo, i) => {
      const sel = _popupSelIds.has(photo.id);
      const active = photo.id === _activePhotoId;
      const baLbl = baLabelMap[photo.id];
      const thumb = document.createElement('button');
      thumb.type = 'button';
      thumb.className = 'ws-strip-thumb' + (active ? ' is-active' : '');
      thumb.dataset.photoId = photo.id;
      thumb.innerHTML =
        `<img src="${_slotEsc(photo.editedDataUrl || photo.dataUrl)}" alt="">`
        + `<span class="ws-strip-num">${i + 1}</span>`
        + `<span class="ws-strip-check${sel ? ' on' : ''}" data-strip-check="${photo.id}">${sel ? '✓' : ''}</span>`
        + (baLbl ? `<span class="ws-strip-ba ${baLbl === 'BEFORE' ? 'before' : 'after'}">${baLbl}</span>` : '');
      thumb.addEventListener('click', (e) => {
        if (e.target.closest('[data-strip-check]')) { e.stopPropagation(); togglePopupPhotoSel(photo.id); return; }  // 일괄 선택
        if (_activePhotoId === photo.id) return;
        _activePhotoId = photo.id;                                   // 편집 대상만 변경
        _renderPopupPhotoGrid(slot);
        if (window.hapticLight) window.hapticLight();
      });
      strip.appendChild(thumb);
    });
    const add = document.createElement('button');
    add.type = 'button'; add.className = 'ws-strip-add'; add.setAttribute('aria-label', '사진 추가');
    add.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
    add.addEventListener('click', () => { const inp = document.getElementById('popupPhotoInput'); if (inp) inp.click(); });
    strip.appendChild(add);
  }

  // ── 중앙 큰 active 미리보기 ──
  if (main) {
    const ap = visiblePhotos.find(p => p.id === _activePhotoId) || visiblePhotos[0];
    if (!ap) {
      main.innerHTML = '<div class="ws-main-empty">사진을 추가해 주세요</div>';
    } else {
      const canRestore = !!(ap.editedDataUrl || (ap.mode && ap.mode !== 'original'));
      main.innerHTML =
        `<img src="${_slotEsc(ap.editedDataUrl || ap.dataUrl)}" alt="" class="ws-main-img">`
        + (visiblePhotos.length >= 1 ? `<span class="ws-main-pill">${(aIdx >= 0 ? aIdx + 1 : 1)}/${visiblePhotos.length}</span>` : '')
        + (canRestore ? `<button type="button" class="ws-main-undo" data-main-undo aria-label="원본으로 복원" title="원본으로 복원"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg></button>` : '');
      main.querySelector('[data-main-undo]')?.addEventListener('click', () => restorePhotoOriginal(ap.id));
    }
  }
}

// [PR-Design-2] active photo 1장만 원본으로 얕은 복원(A안). BA 는 기존 경로 재사용. history 신설 없음.
async function restorePhotoOriginal(photoId) {
  const slot = _slots.find(s => s.id === _popupSlotId);
  if (!slot) return;
  const ph = slot.photos.find(p => p.id === photoId);
  if (!ph) return;
  if (ph.mode === 'ba') { return restoreBAPhoto(photoId); }   // BA 기존 복원 경로 무회귀
  if (!ph.editedDataUrl && (!ph.mode || ph.mode === 'original')) return;   // 이미 원본
  ph.editedDataUrl = null; ph.mode = 'original';               // 원본 dataUrl 은 보존
  try { await saveSlotToDB(slot); } catch (_e) { /* ignore */ }
  _renderPopupPhotoGrid(slot);
  if (typeof showToast === 'function') showToast('원본으로 되돌렸어요');
}

// [P0a] 현재 작업실 active photo 를 잇비 SourceImage store 에 기록 — 잇비가 "작업실 그 사진"을 알게.
//   작업실 onSave 경로는 건드리지 않음(읽기 전용 동기화만).
function _syncWorkshopSource() {
  try {
    if (!window.ItdasySourceImage) return;
    const slot = _slots.find(s => s.id === _popupSlotId);
    if (!slot) return;
    const photo = (slot.photos || []).find(p => p.id === _activePhotoId && !p.hidden);
    if (!photo) return;
    window.ItdasySourceImage.setWorkshop({
      slotId: slot.id,
      photoId: photo.id,
      dataUrl: photo.editedDataUrl || photo.dataUrl,
      originalUrl: photo.dataUrl,
      editedDataUrl: photo.editedDataUrl || null,
      customerId: slot.customer_id != null ? slot.customer_id : null,
    });
  } catch (_e) { void _e; }
}

// [P0a] 슬롯 팝업에서 잇비 열기 — active photo 컨텍스트를 store 에 실어 잇비를 연다.
//   (슬롯 팝업이 FAB 을 가려 in-popup 진입이 필요)
function openSlotItbiAsk() {
  _syncWorkshopSource();
  if (typeof window.openAssistant === 'function') window.openAssistant();
}
if (typeof window !== 'undefined') window.openSlotItbiAsk = openSlotItbiAsk;

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

async function addPhotosToPopup(input) {
  const slot = _slots.find(s => s.id === _popupSlotId);
  if (!slot) return;
  for (let file of Array.from(input.files)) {
    // [A9] 2MB 초과 이미지 리사이징
    if (typeof _resizeIfNeeded === 'function') file = await _resizeIfNeeded(file);
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
  // [PR-E1] 기본은 Before/After 선택 패널. window.PE_BA_SELECT=false 면 기존 즉시 BA 토글로 폴백.
  if (window.PE_BA_SELECT !== false) { openBASelect(); return; }
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

// ── [PR-E1] 전후 Before/After 선택 패널 ───────────────────────────
//   기존 toggleBAMode/_bulkApplyBA/renderBASplit 경로는 보존(폴백). 이 패널은 선택까지만.
//   템플릿 후보/BACompose 합성/새 photo 추가는 E2/E3.
function _baVisiblePhotos() {
  const slot = _slots.find(s => s.id === _popupSlotId);
  return slot ? (slot.photos || []).filter(p => !p.hidden) : [];
}
function openBASelect() {
  const visible = _baVisiblePhotos();
  if (visible.length < 2) { if (typeof showToast === 'function') showToast('전후는 사진을 2장 이상 올린 뒤 쓸 수 있어요'); return; }
  // active photo = After 기본값(없으면 첫 장). Before 는 사용자가 지정.
  _baAfter = (_activePhotoId && visible.some(p => p.id === _activePhotoId)) ? _activePhotoId : visible[0].id;
  _baBefore = null; _baFocus = null;
  _ensureBASelectPanel();
  const panel = document.getElementById('baSelectPanel');
  if (panel) { panel.hidden = false; panel.classList.add('on'); }
  _renderBASelect();
}
function closeBASelect() {
  const panel = document.getElementById('baSelectPanel');
  if (panel) { panel.classList.remove('on'); panel.hidden = true; }
  _baBefore = _baAfter = _baFocus = null;
}
function _ensureBASelectPanel() {
  if (document.getElementById('baSelectPanel')) return;
  const host = document.getElementById('slotPopup');
  if (!host) return;
  const el = document.createElement('div');
  el.id = 'baSelectPanel';
  el.className = 'ba-select-panel';
  el.hidden = true;
  el.innerHTML =
    '<div class="ba-select-sheet">'
    + '<div class="ba-select-hd"><div class="ba-select-ttl"><strong>전후 사진 선택</strong>'
    + '<span>Before와 After 사진을 골라주세요</span></div>'
    + '<button type="button" class="ba-select-x" data-ba-close aria-label="닫기">'
    + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>'
    + '<div class="ba-select-strip" id="baSelectStrip"></div>'
    + '<div class="ba-select-cta">'
    + '<button type="button" class="ba-cta" data-ba-assign="before">Before로 지정</button>'
    + '<button type="button" class="ba-cta" data-ba-assign="after">After로 지정</button>'
    + '<button type="button" class="ba-cta" data-ba-swap>서로 바꾸기</button>'
    + '<button type="button" class="ba-cta ba-cta--primary" data-ba-template disabled title="준비 중">전후 템플릿 (준비 중)</button>'
    + '</div></div>';
  host.appendChild(el);
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-ba-close],[data-ba-assign],[data-ba-swap],[data-ba-template],[data-ba-pick]');
    if (!t) { if (e.target === el) closeBASelect(); return; }   // 바깥(딤) 탭 → 닫기
    if (t.hasAttribute('data-ba-close')) return closeBASelect();
    if (t.hasAttribute('data-ba-pick')) { _baFocus = t.getAttribute('data-ba-pick'); return _renderBASelect(); }
    if (t.hasAttribute('data-ba-assign')) return _baAssign(t.getAttribute('data-ba-assign'));
    if (t.hasAttribute('data-ba-swap')) return _baSwap();
    if (t.hasAttribute('data-ba-template')) return _baPickTemplate();
  });
}
function _baAssign(role) {
  if (!_baFocus) { if (typeof showToast === 'function') showToast('먼저 사진을 한 장 탭해서 골라주세요'); return; }
  if (role === 'before') { if (_baFocus === _baAfter) _baAfter = _baBefore; _baBefore = _baFocus; }
  else { if (_baFocus === _baBefore) _baBefore = _baAfter; _baAfter = _baFocus; }
  if (window.hapticLight) window.hapticLight();
  _renderBASelect();
}
function _baSwap() {
  const t = _baBefore; _baBefore = _baAfter; _baAfter = t;
  if (window.hapticLight) window.hapticLight();
  _renderBASelect();
}
function _baReady() { return !!(_baBefore && _baAfter && _baBefore !== _baAfter); }
function _baPickTemplate() {
  // [E2 연결 지점] 여기서 BA 템플릿 후보(templates-v2 ba free)를 띄우게 확장.
  if (!_baReady()) { if (typeof showToast === 'function') showToast('Before와 After를 서로 다른 사진으로 골라주세요'); return; }
  if (typeof showToast === 'function') showToast('다음 단계에서 전후 템플릿을 고를 수 있어요 (준비 중)');
}
function _renderBASelect() {
  const strip = document.getElementById('baSelectStrip');
  if (!strip) return;
  const visible = _baVisiblePhotos();
  strip.innerHTML = visible.map(p => {
    const role = p.id === _baBefore ? 'before' : (p.id === _baAfter ? 'after' : '');
    const focus = p.id === _baFocus ? ' on' : '';
    const badge = role === 'before' ? '<span class="ba-badge ba-badge--before">Before</span>'
      : role === 'after' ? '<span class="ba-badge ba-badge--after">After</span>' : '';
    return '<button type="button" class="ba-card' + focus + '" data-ba-pick="' + p.id + '">'
      + '<img src="' + (p.editedDataUrl || p.dataUrl) + '" alt="">' + badge + '</button>';
  }).join('');
  // [죽은기능 정리 2026-07-27] '템플릿 고르기'는 _baPickTemplate 이 "(준비 중)" 토스트만 하는 스텁이라,
  //   활성화되면 동작하는 것처럼 보였다. 실제 전후 템플릿 스텝이 붙기 전엔 계속 비활성(준비 중) 유지.
  const tplBtn = document.querySelector('#baSelectPanel [data-ba-template]');
  if (tplBtn) tplBtn.disabled = true;
}
if (typeof window !== 'undefined') { window.openBASelect = openBASelect; window.closeBASelect = closeBASelect; }

// ── 인스타 미리보기 ────────────────────────────────────────────

// ── 선택 일괄 삭제 ─────────────────────────────────────────────
function _bulkDeletePopup() {
  const slot = _slots.find(s => s.id === _popupSlotId);
  if (!slot || !_popupSelIds.size) return;
  // [2026-06-10] confirm → _askConfirm (인라인 다이얼로그)
  window._askConfirm(`선택한 ${_popupSelIds.size}장을 삭제할까요?`, async () => {
    _filterSlotPhotos(_popupSlotId, p => !_popupSelIds.has(p.id));
    try { await saveSlotToDB(slot); } catch (_e) { /* ignore */ }
    _clearPopupSelIds();
    _renderPopupPhotoGrid(slot);
    _renderSlotCards();
    showToast('삭제됨');
  });
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

// 비상 fallback — PE_WORKSHOP_NEW_EDITOR_DISABLE='1' 이면 새 에디터 브릿지 끄고 기존 slot 패널로.
function _workshopNewEditorDisabled() {
  try { return !!(window.localStorage && localStorage.getItem('PE_WORKSHOP_NEW_EDITOR_DISABLE') === '1'); }
  catch (_e) { return false; }
}

// ── 손님 사진 1장 → 최신 PhotoEditor 로 편집 (저장 시 손님 사진에 반영) ──────
// 슬롯 하단 툴바(누끼/보정/로고/템플릿)가 옛 패널 대신 이 경로로 모던 에디터를 연다.
//   [PR-3] 편집 대상 = _activePhotoId(PR-1 활성, 기본 첫 장). 수동 선택 없이 active 사진을 연다.
//   저장(onSave)은 그 active 사진의 editedDataUrl/mode 만 갱신 — 다른 사진 오염 없음.
//   PE_WORKSHOP_NEW_EDITOR_DISABLE='1' → 기존 패널(openBgPanel/openEnhancePanel/...) 로 폴백.
function openSlotPhotoInEditor(tab) {
  if (_workshopNewEditorDisabled()) {
    const fb = { bg: 'openBgPanel', beauty: 'openEnhancePanel', text: 'openElementPanel', template: 'openTemplatePanel' }[tab];
    if (fb && typeof window[fb] === 'function') return window[fb]();
    return;
  }
  // [2026-07-22] 옛 PhotoEditor 진입 제거 → 현재 작업실(WorkspaceFlow)로.
  if (!window.WorkspaceFlow || typeof window.WorkspaceFlow.command !== 'function') {
    if (typeof showToast === 'function') showToast('작업실을 불러오는 중이에요. 잠시 후 다시 시도해주세요');
    return;
  }
  // [2026-09-05 원영 모바일 실사용] '이미 열려 있으면 조용히 return' 가드 삭제 — 하단 4버튼이
  //   작업실 열림 상태에서 아무 반응 없는 죽은 버튼이 됐다. command('storyedit') 자체가
  //   이미-열림 케이스를 처리한다(workspace-v2-flow.js: _flowReady() → 현재 사진으로
  //   _openStoryEditor, 새 화면을 겹쳐 열지 않음) — 중복 가드였고 해로웠다.
  const slot = _slots.find(s => s.id === _popupSlotId);
  if (!slot) return;
  const visible = (slot.photos || []).filter(p => !p.hidden);
  if (!visible.length) { if (typeof showToast === 'function') showToast('편집할 사진이 없어요'); return; }
  // [PR-3] 편집 대상 우선순위: 활성 사진(_activePhotoId) → 단일 선택 → 첫 장. active 기본값이 항상 있어 미선택 무동작 없음.
  let photo = (_activePhotoId && visible.find(p => p.id === _activePhotoId)) || null;
  if (!photo && _popupSelIds.size === 1) photo = visible.find(p => _popupSelIds.has(p.id));
  if (!photo) photo = visible[0];
  if (!photo) { if (typeof showToast === 'function') showToast('편집할 사진이 없어요'); return; }

  // [2026-07-22] 옛 PhotoEditor(photoSet/onSavePhoto/inline/templateMeta 복원) 경로 폐지.
  //   현재 작업실 편집기로 슬롯 사진 전체를 넘긴다 — 활성 사진이 맨 앞에 오게 정렬해
  //   '무엇을 편집하려 했는지'는 유지. 저장은 작업실 자체 저장(슬롯 동기화)이 담당.
  const ordered = [photo].concat(visible.filter(p => p.id !== photo.id));
  const urls = ordered.map(p => p.editedDataUrl || p.dataUrl).filter(Boolean).slice(0, 10);
  if (!urls.length) { if (typeof showToast === 'function') showToast('편집할 사진이 없어요'); return; }
  window.WorkspaceFlow.command({ type: 'storyedit', photoUrls: urls });
}

window.saveAndCloseSlotPopup = saveAndCloseSlotPopup;
window.toggleBAMode = toggleBAMode;
window.openSlotPhotoInEditor = openSlotPhotoInEditor;
