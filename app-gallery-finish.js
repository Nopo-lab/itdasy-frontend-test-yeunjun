// Itdasy Studio - 마무리 탭 (app-gallery.js에서 분리)

// [SEC-R3-2] HTML 이스케이프 유틸
function _finEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ═══════════════════════════════════════════════════════
// 마무리 탭
// ═══════════════════════════════════════════════════════
async function initFinishTab() {
  const root = document.getElementById('finishRoot');
  if (!root) return;
  try { _slots = await loadSlotsFromDB(); } catch(_e) { _slots = []; }
  let galleryItems = [];
  try { galleryItems = await loadGalleryItems(); } catch (_e) { /* ignore */ }
  _renderFinishTab(root, galleryItems);
}

function _renderFinishTab(root, galleryItems = []) {
  // '완료' 인정 기준: status === 'done' OR 캡션이 채워진 슬롯
  // 사용자가 캡션만 직접 써도 마무리 탭에 노출되도록 (status 미설정 레거시 슬롯 대응)
  const isComplete = s => (s.status === 'done' || !!(s.caption && String(s.caption).trim()));
  const doneSlots   = _slots.filter(s => isComplete(s) && s.photos.length > 0 && !s.instagramPublished);
  const incompleteN = _slots.filter(s => !s.instagramPublished && (!isComplete(s) || !s.photos.length)).length;

  if (!_slots.length) {
    root.innerHTML = `
      <div class="sec-title" style="margin-bottom:4px;">마무리</div>
      <div style="text-align:center;padding:60px 20px;">
        <div style="width:64px;height:64px;border-radius:999px;background:var(--brand-bg,#FCEEF1);display:grid;place-items:center;color:var(--accent,#D58A95);margin:0 auto 16px;">
          <i class="ph-duotone ph-tray" style="font-size:32px" aria-hidden="true"></i>
        </div>
        <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:6px;">작업실에서 슬롯을 먼저 만들어보세요</div>
        <button data-finish-workshop style="margin-top:16px;padding:10px 20px;border-radius:12px;border:1.5px solid var(--accent2);background:transparent;color:var(--accent2);font-weight:700;cursor:pointer;font-size:12px;">작업실로 이동 →</button>
      </div>
    `;
    _bindFinishQuickActions(root);
    return;
  }

  const incompleteHtml = incompleteN > 0
    ? `<div style="font-size:11px;color:var(--text3);margin-bottom:14px;">미완료 ${incompleteN}개 있어요 · <button data-finish-dashboard style="background:transparent;border:none;color:var(--accent2);font-size:11px;font-weight:700;cursor:pointer;padding:0;">AI추천에서 확인 →</button></div>`
    : '';

  if (!doneSlots.length) {
    root.innerHTML = `
      <div class="sec-title" style="margin-bottom:4px;">마무리</div>
      ${incompleteHtml}
      <div style="text-align:center;padding:40px 20px;">
        <div style="font-size:32px;margin-bottom:10px;">⏳</div>
        <div style="font-size:13px;font-weight:700;color:var(--text);">완료된 슬롯이 없어요</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px;">작업실에서 슬롯을 완료(✅)하면 여기 표시돼요</div>
      </div>
    `;
    _bindFinishQuickActions(root);
    return;
  }

  const slotsHtml = doneSlots.map(slot => {
    const visPhotos = slot.photos.filter(p => !p.hidden);
    const thumbs = (visPhotos.length ? visPhotos : slot.photos).slice(0, 2).map(p =>
      `<img src="${_finEsc(p.editedDataUrl || p.dataUrl)}" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:8px;">`
    ).join('');
    const cap = slot.caption
      ? `<div style="font-size:11px;color:var(--text3);margin-top:4px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${_finEsc(slot.caption.slice(0, 60))}${slot.caption.length > 60 ? '…' : ''}</div>`
      : '';
    const isDeferred = !!slot.deferredAt;
    return `
      <div data-finish-slot="${_finEsc(slot.id)}" style="background:#fff;border:1px solid var(--border, rgba(15,20,25,0.08));border-radius:16px;padding:14px;margin-bottom:10px;">
        <!-- 슬롯 정보 -->
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;">
          <div style="display:flex;gap:4px;">${thumbs}</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <div style="font-size:13px;font-weight:800;color:var(--text);">${_finEsc(slot.label)}</div>
              ${slot.caption ? '<span style="font-size:9px;background:var(--brand-bg,#FCEEF1);color:var(--accent,#D58A95);border-radius:4px;padding:1px 5px;font-weight:700;">캡션✓</span>' : ''}
              ${isDeferred ? '<span style="font-size:9px;background:var(--bg2,#f8f8f9);color:var(--text2,#5A6573);border-radius:4px;padding:1px 5px;font-weight:700;">나중에</span>' : ''}
              ${slot.customer_name ? `<span style="font-size:9px;background:rgba(213,138,149,0.15);color:var(--accent,#D58A95);border-radius:4px;padding:1px 5px;font-weight:700;">👤 ${_finEsc(slot.customer_name.slice(0,6))}</span>` : ''}
            </div>
            <div style="font-size:11px;color:var(--text3);">${visPhotos.length}장</div>
            ${cap}
          </div>
          <button data-action="edit" style="flex-shrink:0;padding:6px 12px;border-radius:10px;border:1px solid var(--border);background:transparent;font-size:11px;color:var(--text2);cursor:pointer;font-weight:600;">편집</button>
        </div>
        <!-- 마무리 액션 -->
        <div style="display:flex;flex-direction:column;gap:6px;">
          <button data-action="publish" style="width:100%;min-height:48px;padding:12px;border-radius:12px;border:none;background:var(--accent,#D58A95);color:#fff;font-size:13px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;letter-spacing:-0.2px;">
            <i class="ph-duotone ph-arrow-right" style="font-size:16px" aria-hidden="true"></i>
            발행하기
          </button>
          <div style="display:flex;justify-content:space-around;align-items:center;padding-top:12px;margin-top:6px;border-top:0.5px solid var(--border,rgba(15,20,25,0.06));gap:6px;">
            <button data-action="defer" style="flex:1;background:none;border:none;padding:8px 4px;font-size:11px;font-weight:600;color:var(--text2,#5A6573);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px;border-radius:6px;">
              <i class="ph-duotone ph-clock" style="font-size:13px" aria-hidden="true"></i>
              나중에
            </button>
            <button data-action="pickCustomer" style="flex:1;background:none;border:none;padding:8px 4px;font-size:11px;font-weight:${slot.customer_name ? '800' : '600'};color:${slot.customer_name ? 'var(--accent,#D58A95)' : 'var(--text2,#5A6573)'};cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px;border-radius:6px;">
              <i class="ph-duotone ph-user" style="font-size:13px" aria-hidden="true"></i>
              ${slot.customer_name ? _finEsc(slot.customer_name.slice(0,4)) : '고객'}
            </button>
            <button data-action="delete" style="flex:1;background:none;border:none;padding:8px 4px;font-size:11px;font-weight:600;color:var(--text3,#98A1AC);cursor:pointer;border-radius:6px;">
              삭제
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // 갤러리 섹션
  const galleryHtml = galleryItems.length ? (() => {
    // 날짜별 그룹
    const byDate = {};
    galleryItems.forEach(item => {
      const d = item.date || '날짜 없음';
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(item);
    });
    const dateHtml = Object.entries(byDate).map(([date, items]) => `
      <div style="margin-bottom:14px;">
        <div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:8px;">${escapeHtml(date)}</div>
        <div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;">
          ${items.map(item => {
            const thumb = item.photos?.[0];
            return thumb ? `
              <div style="flex-shrink:0;width:80px;cursor:pointer;" data-gallery-item="${escapeHtml(item.id)}">
                <div style="position:relative;width:80px;height:80px;border-radius:10px;overflow:hidden;">
                  <img src="${escapeHtml(thumb.dataUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;">
                  ${item.photos.length > 1 ? `<div style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.55);border-radius:4px;padding:1px 4px;font-size:9px;color:#fff;">+${item.photos.length}</div>` : ''}
                </div>
                <div style="font-size:9px;color:var(--text2);margin-top:3px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(item.label)}</div>
              </div>
            ` : '';
          }).join('')}
        </div>
      </div>
    `).join('');
    return `
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border);">
        <div style="font-size:13px;font-weight:800;color:var(--text);margin-bottom:12px;display:inline-flex;align-items:center;gap:6px;"><i class="ph-duotone ph-folder" style="font-size:14px" aria-hidden="true"></i>갤러리 <span style="font-size:11px;color:var(--text3);font-weight:400;margin-left:2px;">${galleryItems.length}개</span></div>
        ${dateHtml}
      </div>`;
  })() : '';

  root.innerHTML = `
    <div class="sec-title" style="margin-bottom:4px;">마무리</div>
    ${incompleteHtml}
    <div class="sec-sub" style="margin-bottom:16px;">완료 ${doneSlots.length}개 · 원하는 방법으로 마무리하세요</div>
    ${slotsHtml}
    ${galleryHtml}
  `;
  _bindFinishQuickActions(root);
  doneSlots.forEach(slot => {
    const safeSel = window.CSS && CSS.escape ? CSS.escape(String(slot.id)) : String(slot.id).replace(/"/g, '\\"');
    const card = root.querySelector(`[data-finish-slot="${safeSel}"]`);
    if (!card) return;
    card.querySelector('[data-action="edit"]')?.addEventListener('click', () => _editSlotInWorkspace(slot));
    card.querySelector('[data-action="publish"]')?.addEventListener('click', () => _showPublishOptions(slot.id));
    card.querySelector('[data-action="pickCustomer"]')?.addEventListener('click', () => _pickCustomerForSlot(slot.id));
    card.querySelector('[data-action="defer"]')?.addEventListener('click', () => _deferSlot(slot.id));
    card.querySelector('[data-action="delete"]')?.addEventListener('click', () => deleteSlotFinish(slot.id));
  });
  root.querySelectorAll('[data-gallery-item]').forEach(el => {
    el.addEventListener('click', () => _galleryItemDetail(el.dataset.galleryItem));
  });
}

// [2026-07-22] 발행 콘텐츠 '편집' → 레거시 슬롯 팝업(→ 옛 PhotoEditor) 대신 현재 작업실로.
//   슬롯의 사진(편집본 우선)을 그대로 넘겨 현재 편집기에서 이어서 작업.
function _editSlotInWorkspace(slot) {
  const urls = ((slot && slot.photos) || [])
    .filter(p => p && !p.hidden)
    .map(p => p.editedDataUrl || p.dataUrl)
    .filter(Boolean)
    .slice(0, 10);
  if (!(window.WorkspaceFlow && typeof window.WorkspaceFlow.command === 'function')) {
    if (typeof showToast === 'function') showToast('작업실을 여는 중이에요. 잠시 후 다시 눌러주세요');
    return;
  }
  if (!urls.length) {
    if (typeof showToast === 'function') showToast('편집할 사진이 없어요');
    return;
  }
  window.WorkspaceFlow.command({ type: 'storyedit', photoUrls: urls });
}

function _bindFinishQuickActions(root) {
  if (!root || root.dataset.finishQuickBound === '1') return;
  root.dataset.finishQuickBound = '1';
  root.addEventListener('click', e => {
    const t = e.target.closest('[data-finish-workshop],[data-finish-dashboard]');
    if (!t || !root.contains(t)) return;
    if (t.matches('[data-finish-workshop]')) {
      showTab('workshop', document.querySelector('.tab-bar__btn[data-tab="workshop"]'));
      initWorkshopTab();
    } else {
      showTab('dashboard', document.querySelector('.tab-bar__btn[data-tab="dashboard"]'));
      initDashboardTab();
    }
  });
}

function _galleryItemDetail(galleryId) {
  loadGalleryItems().then(items => {
    const item = items.find(i => i.id === galleryId);
    if (!item) return;
    const photos = item.photos || [];
    let pop = document.getElementById('_galleryDetailPop');
    if (!pop) {
      pop = document.createElement('div');
      pop.id = '_galleryDetailPop';
      pop.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,0.7);display:flex;align-items:flex-end;justify-content:center;';
      pop.onclick = e => { if (e.target === pop) pop.style.display = 'none'; };
      document.body.appendChild(pop);
    }
    const escapedCaption = escapeHtml(item.caption);
    pop.innerHTML = `
      <div style="width:100%;max-width:480px;background:#fff;border-radius:20px 20px 0 0;max-height:90vh;overflow-y:auto;padding:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div style="font-size:14px;font-weight:800;">${escapeHtml(item.label)} <span style="font-size:11px;color:var(--text3);font-weight:400;">${escapeHtml(item.date)}</span></div>
          <button class="ss-close" data-gallery-detail-close style="background:transparent;border:none;font-size:20px;color:var(--text-subtle);cursor:pointer;"><svg class="ic" width="18" height="18" aria-hidden="true"><use href="#ic-x"/></svg></button>
        </div>
        ${_buildPeekCarousel(photos, 'gd_carousel')}
        ${escapedCaption ? `<div style="margin-top:12px;font-size:13px;color:#333;white-space:pre-wrap;line-height:1.6;">${escapedCaption}</div>` : ''}
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px;">
          <button id="_gd_republish" style="width:100%;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:13px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;"><i class="ph-duotone ph-camera" style="font-size:15px" aria-hidden="true"></i>다시 올리기</button>
          <div style="display:flex;gap:8px;">
            <button id="_gd_download" style="flex:1;padding:10px;border-radius:12px;border:1.5px solid var(--border);background:transparent;font-size:12px;color:var(--text2);cursor:pointer;font-weight:600;display:inline-flex;align-items:center;justify-content:center;gap:5px;"><i class="ph-duotone ph-download-simple" style="font-size:13px" aria-hidden="true"></i>저장</button>
            <button id="_gd_delete" style="flex:1;padding:10px;border-radius:12px;border:1.5px solid rgba(220,53,69,0.3);background:transparent;font-size:12px;color:var(--danger);cursor:pointer;">삭제</button>
          </div>
        </div>
      </div>
    `;
    pop.querySelector('[data-gallery-detail-close]')?.addEventListener('click', () => { pop.style.display = 'none'; });
    pop.querySelector('#_gd_republish').addEventListener('click', () => _republishGalleryItem(item.id));
    pop.querySelector('#_gd_download').addEventListener('click', () => downloadGalleryItem(item.id));
    pop.querySelector('#_gd_delete').addEventListener('click', () => deleteGalleryItem(item.id).then(() => {
      document.getElementById('_galleryDetailPop').style.display = 'none';
      initFinishTab();
    }));
    pop.style.display = 'flex';
    setTimeout(() => _initPeekCarousel('gd_carousel', photos.length), 80);
  });
}

async function _republishGalleryItem(galleryId) {
  const items = await loadGalleryItems();
  const item = items.find(i => i.id === galleryId);
  if (!item?.photos?.length) { showToast('사진이 없어요'); return; }
  const photo = item.photos[0];
  const fullCaption = (item.caption || '') + (item.hashtags ? '\n\n' + item.hashtags : '');
  const pop = document.getElementById('_galleryDetailPop');
  if (pop) pop.style.display = 'none';
  try {
    const blob = _dataUrlToBlob(photo.editedDataUrl || photo.dataUrl);
    const fd = new FormData();
    fd.append('image', blob, 'gallery_photo.jpg');
    fd.append('photo_type', 'after');
    fd.append('main_tag', item.label || '');
    if (item.customer_id) fd.append('customer_id', item.customer_id);
    const upRes = await apiFetch('/portfolio', { method: 'POST', headers: authHeader(), body: fd });
    if (!upRes.ok) { showToast('업로드 실패'); return; }
    const upData = await upRes.json();
    if (upData.auto_tagged && upData.tags) showToast('포트폴리오 태그도 자동으로 붙였어요');
    const imgUrl = upData.image_url?.startsWith('http') ? upData.image_url : apiUrl(upData.image_url || '');
    if (typeof doInstagramPublish === 'function') {
      const success = await doInstagramPublish(imgUrl, fullCaption);
      if (success) showToast('다시 업로드 완료!');
    }
  } catch(e) { showToast('오류: ' + (window._humanError ? window._humanError(e) : e.message)); }
}

async function downloadGalleryItem(galleryId) {
  const items = await loadGalleryItems();
  const item = items.find(i => i.id === galleryId);
  if (!item?.photos?.length) { showToast('사진이 없어요'); return; }
  
  showToast('사진 준비 중... 📥');
  if (navigator.share && navigator.canShare) {
    try {
      const files = await Promise.all(item.photos.map(async (p, i) => {
        const res = await fetch(p.editedDataUrl || p.dataUrl);
        const blob = await res.blob();
        return new File([blob], `itdasy_${item.label || 'gallery'}_${i + 1}_${Date.now()}.jpg`, { type: 'image/jpeg' });
      }));
      if (navigator.canShare({ files })) {
        await navigator.share({ files, title: '사진 저장' });
        showToast('공유/저장 완료!');
        return;
      }
    } catch(e) {
      if (e.name !== 'AbortError') console.warn('Share API failed:', e);
    }
  }

  item.photos.forEach((p, i) => {
    const a = document.createElement('a');
    a.download = `itdasy_${item.label || 'gallery'}_${i + 1}_${Date.now()}.jpg`;
    a.href = p.editedDataUrl || p.dataUrl;
    a.click();
  });
  showToast('다운로드가 시작되었어요 📥');
}

async function _pickCustomerForSlot(slotId) {
  const slot = _slots.find(s => s.id === slotId);
  if (!slot) return;
  if (!window.Customer || !window.Customer.pick) {
    showToast('고객 관리 모듈이 아직 로드되지 않았어요');
    return;
  }
  const picked = await window.Customer.pick({ selectedId: slot.customer_id });
  if (picked === null) return; // 취소
  slot.customer_id = picked.id;
  slot.customer_name = picked.name;
  try { await saveSlotToDB(slot); } catch (_e) { /* ignore */ }
  initFinishTab();
}

async function _maybeAutoMatchCustomer(slot) {
  // 이미 고객 지정돼 있거나 모듈 미로드면 스킵
  if (!slot || slot.customer_id || !window.PhotoMatch) return;
  try {
    const firstPhoto = (slot.photos || []).find(p => p && (p.file || p.dataUrl || p.blob));
    if (!firstPhoto) return;
    const file = firstPhoto.file || null;
    if (!file) return;  // dataUrl 만 있으면 EXIF 파싱 건너뛰기 (간소)
    const takenAt = await window.PhotoMatch.readTakenAt(file);
    if (!takenAt) return;
    const picked = await window.PhotoMatch.suggestCustomer(takenAt, { selectedId: slot.customer_id });
    if (picked && picked.id) {
      slot.customer_id = picked.id;
      slot.customer_name = picked.name;
      try { await saveSlotToDB(slot); } catch (_) { /* ignore */ }
    }
  } catch (e) { console.warn('[photo-match] 실패:', e); }
}

async function _saveSlotToGallery(slotId) {
  const slot = _slots.find(s => s.id === slotId);
  if (!slot) { showToast('슬롯을 찾을 수 없어요'); return; }
  if (!slot.photos || !slot.photos.length) { showToast('저장할 사진이 없어요'); return; }
  // 사진 데이터 유효성 체크 — dataUrl 없는 사진 필터링
  const validPhotos = slot.photos.filter(p => p && (p.editedDataUrl || p.dataUrl));
  if (!validPhotos.length) { showToast('저장 가능한 사진 데이터가 없어요 — 다시 촬영해 주세요'); return; }
  await _maybeAutoMatchCustomer(slot);
  try {
    // [2026-05-25] '앨범에 보관' 옵션 = 로컬 갤러리 + 서버 포트폴리오 동시 저장.
    //   기존엔 saveToGallery (로컬) 만 호출되어 사용자가 포트폴리오에서 못 보던 버그.
    await saveToGallery(slot);
    const visPhotos = (slot.photos || []).filter(p => p && !p.hidden);
    const photosToUpload = visPhotos.length ? visPhotos : validPhotos;
    let uploadedAny = false;
    for (let i = 0; i < photosToUpload.length; i++) {
      const p = photosToUpload[i];
      try {
        const blob = _dataUrlToBlob(p.editedDataUrl || p.dataUrl);
        const fd = new FormData();
        fd.append('image', blob, `slot_photo_${i + 1}.jpg`);
        fd.append('photo_type', 'after');
        fd.append('main_tag', slot.label || '');
        fd.append('tags', '');
        if (slot.customer_id) fd.append('customer_id', slot.customer_id);
        const upRes = await apiFetch('/portfolio', { method: 'POST', headers: authHeader(), body: fd });
        if (upRes.ok) uploadedAny = true;
      } catch (_pe) { /* 일부 사진 실패 OK */ }
    }
    if (uploadedAny) {
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'portfolio_created' } })); } catch (_) { /* ignore */ }
    }
    // [2026-05-04] 갤러리 보관 완료 시 마무리 탭에서 제거되도록 마킹
    slot.instagramPublished = true;
    try { await saveSlotToDB(slot); } catch(_e) { /* ignore */ }

    if (window.showToast) window.showToast(uploadedAny ? '포트폴리오·앨범에 저장됐어요 📁' : '앨범에 저장됐어요 (포트폴리오 업로드 실패)');
    if (window.hapticLight) window.hapticLight();
    await initFinishTab();
    // AI 추천 탭이 열려있으면 갱신
    const aiTab = document.getElementById('tab-ai-suggest');
    if (aiTab && aiTab.classList.contains('active') && typeof initAiRecommendTab === 'function') {
      initAiRecommendTab();
    }
  } catch(e) {
    console.warn('[gallery] 저장 실패:', e);
    const msg = (e && e.name === 'QuotaExceededError')
      ? '저장 공간이 부족해요 — 갤러리에서 오래된 항목을 삭제해 주세요'
      : '저장 실패: ' + (window._humanError ? window._humanError(e) : (e.message || '알 수 없는 오류'));
    showToast(msg);
  }
}

function _showPublishOptions(slotId) {
  const slot = _slots.find(s => s.id === slotId);
  if (!slot) return;

  let pop = document.getElementById('_publishOptionsPop');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = '_publishOptionsPop';
    pop.style.cssText = 'display:none;position:fixed;inset:0;z-index:9500;background:rgba(15,20,25,0.5);align-items:flex-end;justify-content:center;';
    pop.onclick = e => { if (e.target === pop) pop.style.display = 'none'; };
    document.body.appendChild(pop);
  }

  pop.innerHTML = `
    <div style="width:100%;max-width:480px;background:var(--surface,#fff);border-radius:22px 22px 0 0;padding:8px 0 24px;">
      <div style="width:38px;height:4px;border-radius:2px;background:var(--border-strong,rgba(0,0,0,0.12));margin:6px auto 14px;"></div>
      <div style="padding:0 20px;display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div>
          <div style="font-size:17px;font-weight:800;color:var(--text);letter-spacing:-0.3px;">${_finEsc(slot.label)}</div>
          <div style="font-size:11.5px;color:var(--text3);margin-top:2px;">어디로 보낼까요?</div>
        </div>
        <button data-publish-close style="width:30px;height:30px;border-radius:999px;background:var(--bg2,#f8f8f9);border:none;color:var(--text2);cursor:pointer;display:grid;place-items:center;">
          <svg width="14" height="14" aria-hidden="true"><use href="#ic-x"/></svg>
        </button>
      </div>
      <div style="display:flex;flex-direction:column;">
        <button data-publish-action="preview" style="display:flex;align-items:center;gap:14px;padding:14px 20px;border:none;background:var(--brand-bg,#FCEEF1);width:100%;cursor:pointer;text-align:left;border-bottom:1px solid var(--border);">
          <div style="width:40px;height:40px;border-radius:12px;background:#fff;display:grid;place-items:center;color:var(--accent,#D58A95);">
            <i class="ph-duotone ph-instagram-logo" style="font-size:20px" aria-hidden="true"></i>
          </div>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:800;color:var(--text);letter-spacing:-0.2px;">인스타에 올리기</div>
            <div style="font-size:11.5px;color:var(--text3);margin-top:2px;">미리보기 후 바로 발행</div>
          </div>
          <svg width="16" height="16" aria-hidden="true"><use href="#ic-chevron-right"/></svg>
        </button>
        <button data-publish-action="save" style="display:flex;align-items:center;gap:14px;padding:14px 20px;border:none;background:transparent;width:100%;cursor:pointer;text-align:left;border-bottom:1px solid var(--border);">
          <div style="width:40px;height:40px;border-radius:12px;background:var(--bg2,#f8f8f9);display:grid;place-items:center;color:var(--text);">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:800;color:var(--text);letter-spacing:-0.2px;">포트폴리오에 저장</div>
            <div style="font-size:11.5px;color:var(--text3);margin-top:2px;">서버에 업로드 · 포트폴리오 탭에서 바로 확인</div>
          </div>
          <svg width="16" height="16" aria-hidden="true"><use href="#ic-chevron-right"/></svg>
        </button>
        <button data-publish-action="download" style="display:flex;align-items:center;gap:14px;padding:14px 20px;border:none;background:transparent;width:100%;cursor:pointer;text-align:left;">
          <div style="width:40px;height:40px;border-radius:12px;background:var(--bg2,#f8f8f9);display:grid;place-items:center;color:var(--text);">
            <i class="ph-duotone ph-download-simple" style="font-size:20px" aria-hidden="true"></i>
          </div>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:800;color:var(--text);letter-spacing:-0.2px;">내 폰에 저장</div>
            <div style="font-size:11.5px;color:var(--text3);margin-top:2px;">사진 + 캡션 폰 갤러리로</div>
          </div>
          <svg width="16" height="16" aria-hidden="true"><use href="#ic-chevron-right"/></svg>
        </button>
      </div>
    </div>
  `;
  const close = () => { pop.style.display = 'none'; };
  pop.querySelector('[data-publish-close]')?.addEventListener('click', close);
  pop.querySelector('[data-publish-action="preview"]')?.addEventListener('click', () => {
    close();
    _previewSlotOnInsta(slotId);
  });
  pop.querySelector('[data-publish-action="save"]')?.addEventListener('click', () => {
    close();
    _saveSlotToGallery(slotId);
  });
  pop.querySelector('[data-publish-action="download"]')?.addEventListener('click', () => {
    close();
    downloadSlotPhotos(slotId);
  });
  pop.style.display = 'flex';
}
window._showPublishOptions = _showPublishOptions;

function _previewSlotOnInsta(slotId) {
  const slot = _slots.find(s => s.id === slotId);
  if (!slot) return;

  const handle = (window._instaHandle || 'itdasy').replace('@', '');
  const caption = slot.caption || '';
  const hashtags = slot.hashtags || '';

  let previewImg = '';
  const visPhotos = (slot.photos || []).filter(p => !p.hidden);
  if (visPhotos.length > 0) {
    const p = visPhotos[0];
    previewImg = p.editedDataUrl || p.dataUrl;
  }

  let pop = document.getElementById('_finishInstaPreview');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = '_finishInstaPreview';
    pop.style.cssText = 'display:none;position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,0.82);align-items:center;justify-content:center;padding:14px;';
    pop.onclick = e => { if (e.target === pop) pop.style.display = 'none'; };
    document.body.appendChild(pop);
  }

  const hashHtml = hashtags ? hashtags.split(/\s+/).filter(Boolean).map(h => {
    const clean = h.startsWith('#') ? h : '#' + h;
    return `<span style="color:#1e7abf;">${escapeHtml(clean)}</span>`;
  }).join(' ') : '';

  pop.innerHTML = `
    <div style="width:100%;max-width:360px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,0.5);font-family:-apple-system,sans-serif;">
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #dbdbdb;">
        <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045);padding:2px;"><div style="width:100%;height:100%;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#262626;">잇</div></div>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:700;">${escapeHtml(handle)}</div>
          <div style="font-size:11px;color:#888;">서울</div>
        </div>
        <div style="font-size:18px;color:#262626;">⋯</div>
      </div>
      <div style="width:100%;aspect-ratio:1/1;background:#000;display:flex;align-items:center;justify-content:center;">
        ${previewImg
          ? `<img src="${escapeHtml(previewImg)}" alt="" style="width:100%;height:100%;object-fit:cover;">`
          : `<div style="color:#888;font-size:12px;">사진이 없어요</div>`}
      </div>
      <div style="display:flex;gap:14px;padding:10px 12px 6px;align-items:center;color:#262626;">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        <i class="ph-duotone ph-chat-circle" style="font-size:22px" aria-hidden="true"></i>
        <i class="ph-duotone ph-paper-plane-tilt" style="font-size:22px" aria-hidden="true"></i>
        <span style="flex:1;"></span>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
      </div>
      <div style="padding:4px 12px 12px;font-size:12px;line-height:1.5;color:#262626;max-height:220px;overflow-y:auto;">
        <b>${escapeHtml(handle)}</b> <span style="white-space:pre-wrap;">${escapeHtml(caption || '(캡션 없음)')}</span>
        ${hashHtml ? '<div style="margin-top:6px;word-break:break-word;">' + hashHtml + '</div>' : ''}
      </div>
      <div style="padding:10px 12px;border-top:1px solid #efefef;display:flex;gap:8px;">
        <button data-finish-preview-close style="flex:0.7;min-height:40px;padding:10px;border-radius:10px;border:1px solid #dbdbdb;background:#fff;font-size:12px;font-weight:700;cursor:pointer;">닫기</button>
        <button data-finish-preview-publish data-slot-id="${escapeHtml(slotId)}" style="flex:1;min-height:40px;padding:10px;border-radius:10px;border:none;background:var(--accent,#D58A95);color:#fff;font-size:12px;font-weight:800;cursor:pointer;">피드에 올리기</button>
        <button data-finish-preview-story data-slot-id="${escapeHtml(slotId)}" style="flex:1;min-height:40px;padding:10px;border-radius:10px;border:none;background:linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045);color:#fff;font-size:12px;font-weight:800;cursor:pointer;">스토리 올리기</button>
      </div>
    </div>
  `;
  pop.querySelector('[data-finish-preview-close]')?.addEventListener('click', () => { pop.style.display = 'none'; });
  pop.querySelector('[data-finish-preview-publish]')?.addEventListener('click', e => {
    publishSlotToInstagram(e.currentTarget.dataset.slotId);
    pop.style.display = 'none';
  });
  pop.querySelector('[data-finish-preview-story]')?.addEventListener('click', e => {
    publishSlotStory(e.currentTarget.dataset.slotId);
    pop.style.display = 'none';
  });
  pop.style.display = 'flex';
}

// 슬롯의 발행 대상 사진(숨김 제외, 없으면 첫 1장 폴백)
function _slotVisiblePhotos(slot) {
  const vis = (slot.photos || []).filter(p => !p.hidden);
  return vis.length ? vis : (slot.photos || []).slice(0, 1);
}

// 포트폴리오 기록(발행과 독립) — 실패해도 발행은 막지 않음. 첫 image_url 반환.
async function _uploadSlotToPortfolio(slot, photos) {
  let firstImgUrl = '';
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    const blob = _dataUrlToBlob(p.editedDataUrl || p.dataUrl);
    const fd = new FormData();
    fd.append('image', blob, `slot_photo_${i + 1}.jpg`);
    fd.append('photo_type', 'after');
    fd.append('main_tag', slot.label || '');
    fd.append('tags', '');
    if (slot.customer_id) fd.append('customer_id', slot.customer_id);
    try {
      const upRes = await apiFetch('/portfolio', { method: 'POST', headers: authHeader(), body: fd });
      if (!upRes.ok) continue;
      const upData = await upRes.json();
      if (i === 0) {
        if (upData.auto_tagged && upData.tags) showToast('포트폴리오 태그도 자동으로 붙였어요');
        firstImgUrl = upData.image_url?.startsWith('http') ? upData.image_url : apiUrl(upData.image_url || '');
      }
    } catch (_e) { /* 기록 실패는 발행을 막지 않음 */ }
  }
  try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'portfolio_created' } })); } catch (_) { /* ignore */ }
  return firstImgUrl;
}

// 공통 발행 전송 — 진행 팝업 + 에러 표면화. 성공 시 true.
async function _sendSlotPublish(path, formData, label) {
  const pop = document.getElementById('uploadProgressPopup');
  try {
    if (pop) pop.style.display = 'flex';
    if (window.setUploadProgress) window.setUploadProgress(20, label + ' 올리는 중…');
    const res = await apiFetch(path, { method: 'POST', headers: authHeader(), body: formData });
    if (window.setUploadProgress) window.setUploadProgress(90, '마무리 중…');
    const data = await res.json().catch(() => ({}));
    if (pop) pop.style.display = 'none';
    if (!res.ok) {
      showToast('발행 실패: ' + (data.detail || ('HTTP ' + res.status)));
      return false;
    }
    showToast(label + '에 올라갔어요 🎉');
    if (typeof window.createConfetti === 'function') { for (let i = 0; i < 16; i++) setTimeout(window.createConfetti, i * 90); }
    return true;
  } catch (e) {
    if (pop) pop.style.display = 'none';
    showToast('발행 오류: ' + (window._humanError ? window._humanError(e) : (e.message || '알 수 없음')));
    return false;
  }
}

// #11: 2장 이상은 캐러셀(바이트 직접), 1장은 피드 단일. URL fetch("not found") 경로 제거.
async function publishSlotToInstagram(slotId) {
  const slot = _slots.find(s => s.id === slotId);
  if (!slot?.photos.length) { showToast('사진이 없어요'); return; }
  await _maybeAutoMatchCustomer(slot);
  const photos = _slotVisiblePhotos(slot);
  const fullCaption = (slot.caption || '') + (slot.hashtags ? '\n\n' + slot.hashtags : '');
  try {
    await _uploadSlotToPortfolio(slot, photos);
    let ok = false;
    if (photos.length >= 2) {
      const fd = new FormData();
      photos.forEach((p, i) => fd.append('images', _dataUrlToBlob(p.editedDataUrl || p.dataUrl), `photo_${i + 1}.jpg`));
      fd.append('caption', fullCaption);
      ok = await _sendSlotPublish('/instagram/publish-carousel-file', fd, `${photos.length}장 캐러셀`);
    } else {
      const fd = new FormData();
      fd.append('image', _dataUrlToBlob(photos[0].editedDataUrl || photos[0].dataUrl), 'photo.jpg');
      fd.append('caption', fullCaption);
      ok = await _sendSlotPublish('/instagram/publish-file', fd, '피드');
    }
    if (ok) {
      slot.instagramPublished = true;
      slot.deferredAt = null;
      await saveSlotToDB(slot);
      try { await saveToGallery(slot); } catch (_e) { /* ignore */ }
      initFinishTab();
    }
  } catch(e) { showToast('오류: ' + (window._humanError ? window._humanError(e) : e.message)); }
}

// #1/#10: 스토리 발행 — 대표(첫 노출) 사진을 STORIES 로. 기존 백엔드 publish-story-file 사용.
async function publishSlotStory(slotId) {
  const slot = _slots.find(s => s.id === slotId);
  if (!slot?.photos.length) { showToast('사진이 없어요'); return; }
  await _maybeAutoMatchCustomer(slot);
  const photos = _slotVisiblePhotos(slot);
  const cover = photos[0];
  try {
    await _uploadSlotToPortfolio(slot, photos);
    const fd = new FormData();
    fd.append('image', _dataUrlToBlob(cover.editedDataUrl || cover.dataUrl), 'story.jpg');
    const ok = await _sendSlotPublish('/instagram/publish-story-file', fd, '스토리');
    if (ok) {
      slot.instagramPublished = true;
      slot.deferredAt = null;
      await saveSlotToDB(slot);
      try { await saveToGallery(slot); } catch (_e) { /* ignore */ }
      initFinishTab();
    }
  } catch(e) { showToast('오류: ' + (window._humanError ? window._humanError(e) : e.message)); }
}
window.publishSlotStory = publishSlotStory;

async function _deferSlot(slotId) {
  const slot = _slots.find(s => s.id === slotId);
  if (!slot) return;
  slot.deferredAt = Date.now();
  try { await saveSlotToDB(slot); } catch (_e) { /* ignore */ }
  showToast('AI 추천 탭에서 다시 볼 수 있어요 🕐');
  initFinishTab();
}

async function downloadSlotPhotos(slotId) {
  const slot = _slots.find(s => s.id === slotId);
  if (!slot?.photos.length) { showToast('사진이 없어요'); return; }
  
  showToast('사진 준비 중... 📥');
  if (navigator.share && navigator.canShare) {
    try {
      const files = await Promise.all(slot.photos.map(async (p, i) => {
        const res = await fetch(p.editedDataUrl || p.dataUrl);
        const blob = await res.blob();
        return new File([blob], `itdasy_${slot.label}_${i + 1}_${Date.now()}.jpg`, { type: 'image/jpeg' });
      }));
      if (navigator.canShare({ files })) {
        await navigator.share({ files, title: '사진 저장' });
        showToast('공유/저장 완료!');
        return;
      }
    } catch(e) {
      if (e.name !== 'AbortError') console.warn('Share API failed:', e);
    }
  }

  slot.photos.forEach((p, i) => {
    const a   = document.createElement('a');
    a.download = `itdasy_${slot.label}_${i + 1}_${Date.now()}.jpg`;
    a.href    = p.editedDataUrl || p.dataUrl;
    a.click();
  });
  showToast('다운로드가 시작되었어요 📥');
}

function deleteSlotFinish(slotId) {
  // [2026-06-10] confirm → _askConfirm (인라인 다이얼로그)
  window._askConfirm('슬롯을 삭제할까요?', async () => {
    _slots = _slots.filter(s => s.id !== slotId);
    try { await deleteSlotFromDB(slotId); } catch (_e) { /* ignore */ }
    await _renumberSlots();
    initFinishTab();
  });
}
