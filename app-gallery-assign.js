// Itdasy Studio — 배정 팝업 (사진 → 손님 슬롯)
// 의존: app-gallery-utils.js, app-gallery-db.js, app-gallery-workshop.js

// ── 팝업 열기 / 닫기 ───────────────────────────────────────────
function openAssignPopup() {
  _selectedIds.clear();
  let pop = document.getElementById('_assignPopup');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = '_assignPopup';
    pop.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,0.6);display:flex;align-items:flex-end;justify-content:center;';
    pop.onclick = e => { if (e.target === pop) closeAssignPopup(); };
    document.body.appendChild(pop);
  }
  _renderAssignPopup();
  pop.style.display = 'flex';
}

function closeAssignPopup() {
  const pop = document.getElementById('_assignPopup');
  if (pop) {
    // 피드백 #10: display:none 단독으로는 일부 기기에서 회색 오버레이가 남음 → 완전 제거
    pop.style.display = 'none';
    pop.remove();
  }
  _selectedIds.clear();
  _renderSlotCards();
  _renderPhotoGrid();

  // UX: 배정 팝업 닫은 뒤 마지막 슬롯 카드로 자동 스크롤
  requestAnimationFrame(() => {
    const cards = document.querySelectorAll('.ws-slot-card');
    const lastCard = cards[cards.length - 1];
    if (lastCard && typeof lastCard.scrollIntoView === 'function') {
      lastCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      lastCard.style.boxShadow = '0 0 0 3px var(--accent)';
      setTimeout(() => { lastCard.style.boxShadow = ''; }, 1500);
    }
  });
}

// ── 팝업 렌더링 ────────────────────────────────────────────────
function _renderAssignPopup() {
  const pop = document.getElementById('_assignPopup');
  if (!pop) return;

  const unassigned = _photos.filter(p => !_isAssigned(p.id));

  if (unassigned.length === 0 && _slots.length > 0 && _slots.every(s => s.photos.length > 0)) {
    closeAssignPopup();
    showToast('배정 완료! 슬롯 카드를 탭해서 편집하세요');
    return;
  }

  const slotsHtml = _slots.map(slot => {
    const photos = (slot.photos || []).filter(p => !p.hidden);
    const photosPreview = photos.length > 0
      ? photos.slice(0, 4).map(p => `<img src="${p.editedDataUrl || p.dataUrl}" style="width:32px;height:32px;object-fit:cover;border-radius:6px;flex-shrink:0;">`).join('') + (photos.length > 4 ? `<div style="width:32px;height:32px;border-radius:6px;background:rgba(0,0,0,0.5);color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">+${photos.length-4}</div>` : '')
      : '<div style="font-size:11px;color:var(--text3);">비어있음</div>';

    return `<div data-slot-drop="${slot.id}" onclick="${_selectedIds.size > 0 ? `_assignToSlotFromPopup('${slot.id}')` : ''}" style="flex-shrink:0;width:140px;background:#fff;border:2px solid ${_selectedIds.size > 0 ? 'var(--accent)' : 'var(--border)'};border-radius:14px;padding:10px;position:relative;${_selectedIds.size > 0 ? 'cursor:pointer;' : ''}">
      <button onclick="_deleteSlotInPopup('${slot.id}');event.stopPropagation();" style="position:absolute;top:4px;right:4px;width:18px;height:18px;border-radius:50%;background:rgba(0,0,0,0.08);border:none;color:var(--text-subtle);font-size:10px;cursor:pointer;z-index:2;">✕</button>
      <div style="font-size:12px;font-weight:800;color:var(--text);margin-bottom:6px;">${slot.label}</div>
      <div style="display:flex;gap:4px;overflow-x:auto;min-height:32px;align-items:center;">${photosPreview}</div>
      ${_selectedIds.size > 0 ? `<div style="margin-top:8px;padding:6px;border-radius:8px;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:11px;font-weight:700;text-align:center;">여기에 넣기</div>` : ''}
    </div>`;
  }).join('');

  pop.innerHTML = `
    <div style="width:100%;max-width:480px;background:#fff;border-radius:24px 24px 0 0;max-height:85vh;overflow:hidden;display:flex;flex-direction:column;" oncontextmenu="return false">
      <div style="display:flex;justify-content:center;padding:10px 0 4px;"><div style="width:40px;height:4px;border-radius:2px;background:rgba(0,0,0,0.12);"></div></div>
      <div style="padding:8px 16px 12px;border-bottom:1px solid var(--border);">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:16px;font-weight:800;color:var(--text);">사진 → 손님 배정</div>
          <button onclick="closeAssignPopup()" style="background:transparent;border:none;font-size:24px;color:var(--text-subtle);cursor:pointer;padding:0 4px;">×</button>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px;">사진 선택 후 아래 손님 카드를 탭하세요</div>
      </div>
      <div style="padding:12px 16px;border-bottom:1px solid var(--border);background:#fafafa;">
        <div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:8px;">미배정 ${unassigned.length}장</div>
        <div style="overflow-x:auto;">
          <div style="display:flex;gap:8px;min-width:max-content;padding:2px;">
            ${unassigned.length ? unassigned.map(photo => {
              const sel = _selectedIds.has(photo.id);
              return `<div onclick="togglePhotoSelect('${photo.id}');_renderAssignPopup();" style="flex-shrink:0;width:72px;cursor:pointer;"><div style="position:relative;width:72px;height:72px;border-radius:12px;overflow:hidden;border:3px solid ${sel ? 'var(--accent)' : 'transparent'};box-shadow:${sel ? '0 4px 12px rgba(241,128,145,0.55)' : '0 1px 3px rgba(0,0,0,0.08)'};">
                <img src="${photo.dataUrl}" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;${sel ? 'filter:brightness(0.85);' : ''}">
                <div style="position:absolute;top:4px;right:4px;width:26px;height:26px;border-radius:50%;border:2px solid #fff;background:${sel ? 'var(--accent)' : 'rgba(0,0,0,0.35)'};display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:900;color:#fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${sel ? '✓' : ''}</div>
              </div></div>`;
            }).join('') : '<div style="padding:16px;text-align:center;color:var(--accent2);font-size:12px;font-weight:600;">모든 사진 배정 완료 ✅</div>'}
          </div>
        </div>
      </div>
      <div style="flex:1;padding:12px 16px;overflow:hidden;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="font-size:11px;font-weight:700;color:var(--text3);">👤 손님 슬롯 ${_slots.length}개</div>
          <button onclick="_addSlotInPopup()" style="padding:5px 10px;border-radius:6px;border:1.5px solid var(--accent);background:transparent;color:var(--accent);font-size:10px;font-weight:700;cursor:pointer;">+ 추가</button>
        </div>
        <div style="overflow-x:auto;padding-bottom:8px;">
          <div style="display:flex;gap:10px;min-width:max-content;">
            ${slotsHtml || '<div style="padding:20px;color:var(--text3);font-size:12px;">슬롯이 없어요. + 추가를 눌러주세요</div>'}
          </div>
        </div>
      </div>
      ${_selectedIds.size > 0 ? `
        <div style="padding:10px 16px;border-top:1px solid var(--border);background:#fff;display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:12px;font-weight:700;color:var(--accent);">${_selectedIds.size}장 선택됨</div>
          <button onclick="_deleteSelectedInPopup()" style="padding:8px 14px;border-radius:8px;border:1px solid rgba(220,53,69,0.4);background:transparent;color:#dc3545;font-size:11px;font-weight:600;cursor:pointer;">삭제</button>
        </div>
      ` : ''}
    </div>
  `;
}

// ── 슬롯 CRUD (팝업 내) ────────────────────────────────────────
async function _addSlotInPopup() {
  await _renumberSlots();
  const num  = _slots.length + 1;
  const slot = { id: _uid(), label: `손님 ${num}`, order: num - 1, photos: [], caption: '', hashtags: '', status: 'open', instagramPublished: false, deferredAt: null, createdAt: Date.now() };
  _slots.push(slot);
  try { await saveSlotToDB(slot); } catch (_e) { /* ignore */ }
  _renderAssignPopup();
}

async function _deleteSlotInPopup(slotId) {
  const slot = _slots.find(s => s.id === slotId);
  if (slot) {
    slot.photos.forEach(sp => {
      if (!_photos.find(p => p.id === sp.id)) {
        _photos.push({ id: sp.id, file: null, dataUrl: sp.dataUrl });
      }
    });
  }
  _slots = _slots.filter(s => s.id !== slotId);
  try { await deleteSlotFromDB(slotId); } catch (_e) { /* ignore */ }
  _renumberSlots();
  _renderAssignPopup();
}

function _assignToSlotFromPopup(slotId) {
  if (!_selectedIds.size) return;
  [..._selectedIds].forEach(id => _assignToSlot(id, slotId));
  _selectedIds.clear();
  showToast('배정 완료 ✅');
  _renderAssignPopup();
}

function _deleteSelectedInPopup() {
  if (!_selectedIds.size) return;
  _photos = _photos.filter(p => !_selectedIds.has(p.id));
  _selectedIds.clear();
  showToast('삭제됨');
  _renderAssignPopup();
}

async function _renumberSlots() {
  _slots.forEach((slot, i) => {
    slot.label = `손님 ${i + 1}`;
    slot.order = i;
  });
  for (const slot of _slots) {
    try { await saveSlotToDB(slot); } catch (_e) { /* ignore */ }
  }
}
