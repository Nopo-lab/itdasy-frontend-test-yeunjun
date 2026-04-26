// Itdasy Studio - 마무리 탭 (app-gallery.js에서 분리)

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
      <div class="sec-title" style="margin-bottom:4px;">마무리 🎀</div>
      <div style="text-align:center;padding:60px 20px;">
        <div style="font-size:40px;margin-bottom:12px;">📭</div>
        <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:6px;">작업실에서 슬롯을 먼저 만들어보세요</div>
        <button onclick="showTab('workshop',document.querySelector('.tab-bar__btn[data-tab=&quot;workshop&quot;]')); initWorkshopTab();" style="margin-top:16px;padding:10px 20px;border-radius:12px;border:1.5px solid var(--accent2);background:transparent;color:var(--accent2);font-weight:700;cursor:pointer;font-size:12px;">작업실로 이동 →</button>
      </div>
    `;
    return;
  }

  const incompleteHtml = incompleteN > 0
    ? `<div style="font-size:11px;color:var(--text3);margin-bottom:14px;">미완료 ${incompleteN}개 있어요 · <button onclick="showTab('dashboard',document.querySelector('.tab-bar__btn[data-tab=&quot;dashboard&quot;]')); initDashboardTab();" style="background:transparent;border:none;color:var(--accent2);font-size:11px;font-weight:700;cursor:pointer;padding:0;">AI추천에서 확인 →</button></div>`
    : '';

  if (!doneSlots.length) {
    root.innerHTML = `
      <div class="sec-title" style="margin-bottom:4px;">마무리 🎀</div>
      ${incompleteHtml}
      <div style="text-align:center;padding:40px 20px;">
        <div style="font-size:32px;margin-bottom:10px;">⏳</div>
        <div style="font-size:13px;font-weight:700;color:var(--text);">완료된 슬롯이 없어요</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px;">작업실에서 슬롯을 완료(✅)하면 여기 표시돼요</div>
      </div>
    `;
    return;
  }

  const slotsHtml = doneSlots.map(slot => {
    const visPhotos = slot.photos.filter(p => !p.hidden);
    const thumbs = (visPhotos.length ? visPhotos : slot.photos).slice(0, 2).map(p =>
      `<img src="${p.editedDataUrl || p.dataUrl}" style="width:56px;height:56px;object-fit:cover;border-radius:8px;">`
    ).join('');
    const cap = slot.caption
      ? `<div style="font-size:11px;color:var(--text3);margin-top:4px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${slot.caption.slice(0, 60)}${slot.caption.length > 60 ? '…' : ''}</div>`
      : '';
    const isDeferred = !!slot.deferredAt;
    return `
      <div data-finish-slot="${slot.id}" style="background:#fff;border:1.5px solid ${isDeferred ? 'rgba(255,193,7,0.4)' : 'rgba(76,175,80,0.3)'};border-radius:16px;padding:14px;margin-bottom:10px;">
        <!-- 슬롯 정보 -->
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;">
          <div style="display:flex;gap:4px;">${thumbs}</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <div style="font-size:13px;font-weight:800;color:var(--text);">${slot.label} ✅</div>
              ${slot.caption ? '<span style="font-size:9px;background:rgba(76,175,80,0.15);color:#388e3c;border-radius:4px;padding:1px 5px;font-weight:700;">캡션✓</span>' : ''}
              ${isDeferred ? '<span style="font-size:9px;background:rgba(255,193,7,0.15);color:#f57c00;border-radius:4px;padding:1px 5px;font-weight:700;">나중에</span>' : ''}
              ${slot.customer_name ? `<span style="font-size:9px;background:rgba(241,128,145,0.15);color:var(--accent,#F18091);border-radius:4px;padding:1px 5px;font-weight:700;">👤 ${slot.customer_name.slice(0,6)}</span>` : ''}
            </div>
            <div style="font-size:11px;color:var(--text3);">${visPhotos.length}장</div>
            ${cap}
          </div>
          <button data-action="edit" style="flex-shrink:0;padding:6px 12px;border-radius:10px;border:1px solid var(--border);background:transparent;font-size:11px;color:var(--text2);cursor:pointer;font-weight:600;">편집</button>
        </div>
        <!-- 마무리 액션 -->
        <div style="display:flex;flex-direction:column;gap:6px;">
          <button data-action="publish" style="width:100%;min-height:48px;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:13px;font-weight:800;cursor:pointer;">🚀 인스타 바로 올리기</button>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
            <button data-action="gallery" style="min-height:40px;padding:10px;border-radius:10px;border:1.5px solid rgba(241,128,145,0.3);background:transparent;color:var(--accent);font-size:11px;font-weight:700;cursor:pointer;">📁 갤러리 보관</button>
            <button data-action="download" style="min-height:40px;padding:10px;border-radius:10px;border:1.5px solid var(--border);background:transparent;color:var(--text2);font-size:11px;font-weight:700;cursor:pointer;">📥 폰에 저장</button>
          </div>
          <div style="display:flex;gap:6px;">
            <button data-action="pickCustomer" style="flex:1;min-height:40px;padding:8px;border-radius:10px;border:1.5px solid rgba(241,128,145,0.3);background:transparent;color:var(--accent,#F18091);font-size:11px;font-weight:700;cursor:pointer;">👤 ${slot.customer_name ? slot.customer_name.slice(0,8) : '고객 지정'}</button>
            <button data-action="defer" style="flex:1;min-height:40px;padding:8px;border-radius:10px;border:1.5px solid rgba(255,193,7,0.5);background:transparent;color:#f57c00;font-size:11px;font-weight:700;cursor:pointer;">🕐 나중에 (AI추천으로)</button>
            <button data-action="delete" style="min-height:40px;padding:8px 14px;border-radius:10px;border:1.5px solid rgba(220,53,69,0.3);background:transparent;color:#dc3545;font-size:11px;cursor:pointer;font-weight:600;">삭제</button>
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
        <div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:8px;">${date}</div>
        <div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch;">
          ${items.map(item => {
            const thumb = item.photos?.[0];
            return thumb ? `
              <div style="flex-shrink:0;width:80px;cursor:pointer;" data-gallery-item="${escapeHtml(item.id)}">
                <div style="position:relative;width:80px;height:80px;border-radius:10px;overflow:hidden;">
                  <img src="${thumb.dataUrl}" style="width:100%;height:100%;object-fit:cover;">
                  ${item.photos.length > 1 ? `<div style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.55);border-radius:4px;padding:1px 4px;font-size:9px;color:#fff;">+${item.photos.length}</div>` : ''}
                </div>
                <div style="font-size:9px;color:var(--text2);margin-top:3px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.label}</div>
              </div>
            ` : '';
          }).join('')}
        </div>
      </div>
    `).join('');
    return `
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border);">
        <div style="font-size:13px;font-weight:800;color:var(--text);margin-bottom:12px;">갤러리 📁 <span style="font-size:11px;color:var(--text3);font-weight:400;">${galleryItems.length}개</span></div>
        ${dateHtml}
      </div>`;
  })() : '';

  root.innerHTML = `
    <div class="sec-title" style="margin-bottom:4px;">마무리 🎀</div>
    ${incompleteHtml}
    <div class="sec-sub" style="margin-bottom:16px;">완료 ${doneSlots.length}개 · 원하는 방법으로 마무리하세요</div>
    ${slotsHtml}
    ${galleryHtml}
  `;
  doneSlots.forEach(slot => {
    const card = root.querySelector(`[data-finish-slot="${slot.id}"]`);
    if (!card) return;
    card.querySelector('[data-action="edit"]').addEventListener('click', () => openSlotPopup(slot.id));
    card.querySelector('[data-action="publish"]').addEventListener('click', () => publishSlotToInstagram(slot.id));
    card.querySelector('[data-action="gallery"]').addEventListener('click', () => _saveSlotToGallery(slot.id));
    card.querySelector('[data-action="download"]').addEventListener('click', () => downloadSlotPhotos(slot.id));
    card.querySelector('[data-action="pickCustomer"]').addEventListener('click', () => _pickCustomerForSlot(slot.id));
    card.querySelector('[data-action="defer"]').addEventListener('click', () => _deferSlot(slot.id));
    card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteSlotFinish(slot.id));
  });
  root.querySelectorAll('[data-gallery-item]').forEach(el => {
    el.addEventListener('click', () => _galleryItemDetail(el.dataset.galleryItem));
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
          <button onclick="document.getElementById('_galleryDetailPop').style.display='none'" style="background:transparent;border:none;font-size:20px;color:#aaa;cursor:pointer;">×</button>
        </div>
        ${_buildPeekCarousel(photos, 'gd_carousel')}
        ${escapedCaption ? `<div style="margin-top:12px;font-size:13px;color:#333;white-space:pre-wrap;line-height:1.6;">${escapedCaption}</div>` : ''}
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px;">
          <button id="_gd_republish" style="width:100%;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:13px;font-weight:800;cursor:pointer;">📸 다시 올리기</button>
          <div style="display:flex;gap:8px;">
            <button id="_gd_download" style="flex:1;padding:10px;border-radius:12px;border:1.5px solid var(--border);background:transparent;font-size:12px;color:var(--text2);cursor:pointer;font-weight:600;">📥 저장</button>
            <button id="_gd_delete" style="flex:1;padding:10px;border-radius:12px;border:1.5px solid rgba(220,53,69,0.3);background:transparent;font-size:12px;color:#dc3545;cursor:pointer;">삭제</button>
          </div>
        </div>
      </div>
    `;
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
    const upRes = await fetch(API + '/portfolio', { method: 'POST', headers: authHeader(), body: fd });
    if (!upRes.ok) { showToast('업로드 실패'); return; }
    const upData = await upRes.json();
    const imgUrl = upData.image_url?.startsWith('http') ? upData.image_url : API + (upData.image_url || '');
    if (typeof doInstagramPublish === 'function') {
      const success = await doInstagramPublish(imgUrl, fullCaption);
      if (success) showToast('다시 업로드 완료! ✨');
    }
  } catch(e) { showToast('오류: ' + (window._humanError ? window._humanError(e) : e.message)); }
}

async function downloadGalleryItem(galleryId) {
  const items = await loadGalleryItems();
  const item = items.find(i => i.id === galleryId);
  if (!item?.photos?.length) { showToast('사진이 없어요'); return; }
  item.photos.forEach((p, i) => {
    const a = document.createElement('a');
    a.download = `itdasy_${item.label || 'gallery'}_${i + 1}_${Date.now()}.jpg`;
    a.href = p.editedDataUrl || p.dataUrl;
    a.click();
  });
  showToast('사진 저장 중... 📥');
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
  if (!slot) return;
  await _maybeAutoMatchCustomer(slot);
  try {
    await saveToGallery(slot);
    showToast('갤러리에 보관됐어요 📁');
    initFinishTab();
    // AI 추천 탭이 열려있으면 갱신
    const aiTab = document.getElementById('tab-ai-suggest');
    if (aiTab && aiTab.classList.contains('active') && typeof initAiRecommendTab === 'function') {
      initAiRecommendTab();
    }
  } catch(e) { showToast('저장 실패: ' + (window._humanError ? window._humanError(e) : e.message)); }
}

async function publishSlotToInstagram(slotId) {
  const slot = _slots.find(s => s.id === slotId);
  if (!slot?.photos.length) { showToast('사진이 없어요'); return; }
  await _maybeAutoMatchCustomer(slot);
  const visPhotos = slot.photos.filter(p => !p.hidden);
  const photo = visPhotos[0] || slot.photos[0];
  const fullCaption = (slot.caption || '') + (slot.hashtags ? '\n\n' + slot.hashtags : '');
  try {
    const blob = _dataUrlToBlob(photo.editedDataUrl || photo.dataUrl);
    const fd   = new FormData();
    fd.append('image', blob, 'slot_photo.jpg');
    fd.append('photo_type', 'after');
    fd.append('main_tag', slot.label);
    fd.append('tags', '');
    if (slot.customer_id) fd.append('customer_id', slot.customer_id);
    const upRes  = await fetch(API + '/portfolio', { method: 'POST', headers: authHeader(), body: fd });
    if (!upRes.ok) { showToast('업로드 실패'); return; }
    const upData = await upRes.json();
    const imgUrl = upData.image_url?.startsWith('http') ? upData.image_url : API + (upData.image_url || '');
    if (typeof doInstagramPublish === 'function') {
      const success = await doInstagramPublish(imgUrl, fullCaption);
      if (success) {
        slot.instagramPublished = true;
        slot.deferredAt = null;
        await saveSlotToDB(slot);
        // 갤러리 자동 저장
        try { await saveToGallery(slot); } catch (_e) { /* ignore */ }
        initFinishTab();
      }
    }
  } catch(e) { showToast('오류: ' + (window._humanError ? window._humanError(e) : e.message)); }
}

async function _deferSlot(slotId) {
  const slot = _slots.find(s => s.id === slotId);
  if (!slot) return;
  slot.deferredAt = Date.now();
  try { await saveSlotToDB(slot); } catch (_e) { /* ignore */ }
  showToast('AI 추천 탭에서 다시 볼 수 있어요 🕐');
  initFinishTab();
}

function downloadSlotPhotos(slotId) {
  const slot = _slots.find(s => s.id === slotId);
  if (!slot?.photos.length) { showToast('사진이 없어요'); return; }
  slot.photos.forEach((p, i) => {
    const a   = document.createElement('a');
    a.download = `itdasy_${slot.label}_${i + 1}_${Date.now()}.jpg`;
    a.href    = p.editedDataUrl || p.dataUrl;
    a.click();
  });
}

async function deleteSlotFinish(slotId) {
  if (!confirm('슬롯을 삭제할까요?')) return;
  _slots = _slots.filter(s => s.id !== slotId);
  try { await deleteSlotFromDB(slotId); } catch (_e) { /* ignore */ }
  await _renumberSlots();
  initFinishTab();
}
