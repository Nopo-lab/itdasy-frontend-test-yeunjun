// Itdasy Studio - AI 추천 탭 (갤러리/미발행 슬롯 연동)

// =====================================================================
// ===== AI 추천 탭 — 미발행 슬롯 카드 =====
// =====================================================================
let _aiRecommendChecked = new Set();

async function initAiRecommendTab() {
  const root = document.getElementById('tab-ai-suggest');
  if (!root) return;

  let slots = [];
  try { slots = await loadSlotsFromDB(); } catch(_e) {}

  // 미발행 슬롯: instagramPublished !== true (완료/미완료 모두 포함)
  const unpublished = slots.filter(s => !s.instagramPublished);

  // 정렬: ① 완성(사진+캡션+done) 우선 → ② deferred → ③ 오래된 순
  unpublished.sort((a, b) => {
    // 완성도 체크
    const aComplete = a.status === 'done' && a.photos.length > 0 && !!a.caption;
    const bComplete = b.status === 'done' && b.photos.length > 0 && !!b.caption;
    if (aComplete !== bComplete) return aComplete ? -1 : 1;

    // deferred 우선
    const aDeferred = !!a.deferredAt;
    const bDeferred = !!b.deferredAt;
    if (aDeferred !== bDeferred) return aDeferred ? -1 : 1;
    if (aDeferred && bDeferred) return (a.deferredAt || 0) - (b.deferredAt || 0);

    // 오래된 순
    return (a.createdAt || a.order || 0) - (b.createdAt || b.order || 0);
  });

  _aiRecommendChecked.clear();
  _renderAiRecommendTab(root, unpublished);
}

function _renderAiRecommendTab(root, slots) {
  if (!slots.length) {
    root.innerHTML = `
      <div class="sec-title" style="margin-bottom:4px;">AI 추천 ✨</div>
      <div style="text-align:center;padding:60px 20px;">
        <div style="font-size:40px;margin-bottom:12px;">🌸</div>
        <div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:6px;">올릴 게 없어요!</div>
        <div style="font-size:13px;color:var(--text3);margin-bottom:20px;">오늘 작업하러 가볼까요?</div>
        <button onclick="showTab('workshop',document.querySelectorAll('.nav-btn')[1]); initWorkshopTab();" style="padding:12px 24px;border-radius:14px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:13px;font-weight:800;cursor:pointer;">작업실로 →</button>
      </div>`;
    return;
  }

  // 완성/미완성 카운트
  const completeN = slots.filter(s => s.status === 'done' && s.photos.length > 0 && !!s.caption).length;
  const incompleteN = slots.length - completeN;

  const cardsHtml = slots.map(slot => {
    const visPhotos = slot.photos.filter(p => !p.hidden);
    const thumb = visPhotos[0] || slot.photos[0];
    const thumbSrc = thumb ? (thumb.editedDataUrl || thumb.dataUrl) : '';
    const dateStr = slot.createdAt
      ? new Date(slot.createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
      : (slot.deferredAt ? new Date(slot.deferredAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) : '');
    const isChecked = _aiRecommendChecked.has(slot.id);
    const isDeferred = !!slot.deferredAt;

    // 상태 분석
    const isWorkshopDone = slot.status === 'done';
    const hasPhotos = slot.photos.length > 0;
    const hasCaption = !!slot.caption;
    const isComplete = isWorkshopDone && hasPhotos && hasCaption;

    // 뱃지
    let badges = '';
    if (!isWorkshopDone) badges += '<div style="font-size:9px;background:rgba(255,152,0,0.15);color:#e65100;border-radius:4px;padding:1px 5px;font-weight:700;">작업실 미완료</div>';
    if (!hasCaption) badges += '<div style="font-size:9px;background:rgba(156,39,176,0.12);color:#7b1fa2;border-radius:4px;padding:1px 5px;font-weight:700;">캡션 없음</div>';
    if (hasCaption) badges += '<div style="font-size:9px;background:rgba(76,175,80,0.15);color:#388e3c;border-radius:4px;padding:1px 5px;font-weight:700;">캡션✓</div>';
    if (isDeferred) badges += '<div style="font-size:9px;background:rgba(255,193,7,0.2);color:#f57c00;border-radius:4px;padding:1px 5px;font-weight:700;">나중에</div>';

    // 캡션 미리보기
    const capPreview = slot.caption
      ? slot.caption.slice(0, 50) + (slot.caption.length > 50 ? '…' : '')
      : '(캡션을 작성해주세요)';

    // 테두리 색상: 완성=초록, 미완성=주황, deferred=노랑, 체크=핑크
    const borderColor = isChecked ? 'var(--accent)' : isComplete ? 'rgba(76,175,80,0.35)' : isDeferred ? 'rgba(255,193,7,0.4)' : 'rgba(255,152,0,0.35)';

    // 완성된 슬롯은 "인스타 즉시 올리기" 버튼 카드에 직접 노출
    const actionBtns = isComplete ? `
      <div style="margin-top:10px;">
        <button onclick="_quickPublishFromAi('${slot.id}',event)" style="width:100%;min-height:44px;padding:10px;border-radius:10px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:12px;font-weight:800;cursor:pointer;">🚀 인스타 바로 올리기</button>
      </div>
    ` : (hasPhotos && !hasCaption) ? `
      <div style="margin-top:10px;">
        <button onclick="_goToSlotStep('${slot.id}')" style="width:100%;min-height:44px;padding:10px;border-radius:10px;border:1.5px solid var(--accent2);background:#fff5f7;color:var(--accent);font-size:12px;font-weight:800;cursor:pointer;">✍️ 글쓰기 → 캡션 만들기</button>
      </div>
    ` : '';

    return `
      <div data-ai-card="${slot.id}" style="background:#fff;border:1.5px solid ${borderColor};border-radius:16px;padding:12px;margin-bottom:10px;position:relative;">
        <!-- 체크박스 -->
        <div onclick="_toggleAiCheck('${slot.id}',event)" style="position:absolute;top:12px;left:12px;z-index:2;width:20px;height:20px;border-radius:5px;border:2px solid ${isChecked ? 'var(--accent)' : 'rgba(0,0,0,0.2)'};background:${isChecked ? 'var(--accent)' : 'rgba(255,255,255,0.9)'};display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;cursor:pointer;">${isChecked ? '✓' : ''}</div>
        <!-- 삭제 버튼 -->
        <button onclick="_deleteAiSlot('${slot.id}',event)" style="position:absolute;top:10px;right:10px;background:transparent;border:none;font-size:16px;color:var(--text3);cursor:pointer;line-height:1;padding:2px 6px;">✕</button>
        <!-- 카드 본문: 상태에 따라 다른 탭으로 -->
        <div onclick="_goToSlotStep('${slot.id}')" style="display:flex;gap:12px;align-items:center;cursor:pointer;padding:0 24px 0 28px;">
          ${thumbSrc
            ? `<img src="${thumbSrc}" style="width:72px;height:72px;object-fit:cover;border-radius:10px;flex-shrink:0;">`
            : `<div style="width:72px;height:72px;border-radius:10px;background:var(--bg2);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:24px;">📷</div>`}
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap;">
              <div style="font-size:13px;font-weight:800;color:var(--text);">${slot.label}</div>
              ${badges}
            </div>
            <div style="font-size:11px;color:var(--text3);margin-bottom:4px;">${visPhotos.length || slot.photos.length}장 · ${dateStr}</div>
            <div style="font-size:11px;color:var(--text2);line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${capPreview}</div>
          </div>
        </div>
        ${actionBtns}
      </div>`;
  }).join('');

  const subText = incompleteN > 0
    ? `미발행 ${slots.length}개 (준비완료 ${completeN}개, 미완료 ${incompleteN}개)`
    : `미발행 ${slots.length}개 · 탭하면 마무리로 이동해요`;

  root.innerHTML = `
    <div class="sec-title" style="margin-bottom:4px;">AI 추천 ✨</div>
    <div class="sec-sub" style="margin-bottom:16px;">${subText}</div>
    ${cardsHtml}
    <div id="aiRecommendBatchBar" style="display:none;position:fixed;bottom:65px;left:0;right:0;z-index:200;padding:10px 16px;background:rgba(255,255,255,0.97);backdrop-filter:blur(8px);border-top:1px solid var(--border);box-shadow:0 -2px 16px rgba(0,0,0,0.1);">
      <button onclick="_batchDeleteAiSlots()" style="width:100%;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,#dc3545,#c82333);color:#fff;font-size:13px;font-weight:800;cursor:pointer;">선택한 작업 삭제</button>
    </div>`;
}

function _toggleAiCheck(id, e) {
  e?.stopPropagation();
  _aiRecommendChecked.has(id) ? _aiRecommendChecked.delete(id) : _aiRecommendChecked.add(id);
  const bar = document.getElementById('aiRecommendBatchBar');
  if (bar) bar.style.display = _aiRecommendChecked.size > 0 ? 'block' : 'none';
  // 카드 border 색상만 업데이트
  document.querySelectorAll('[data-ai-card]').forEach(card => {
    const cardId = card.dataset.aiCard;
    const checked = _aiRecommendChecked.has(cardId);
    const slot = (typeof _slots !== 'undefined' ? _slots : []).find(s => s.id === cardId);
    const isDeferred = slot?.deferredAt;
    card.style.borderColor = checked ? 'var(--accent)' : isDeferred ? 'rgba(255,193,7,0.4)' : 'rgba(241,128,145,0.2)';
    const cb = card.querySelector('[onclick^="_toggleAiCheck"]');
    if (cb) {
      cb.style.borderColor = checked ? 'var(--accent)' : 'rgba(0,0,0,0.2)';
      cb.style.background = checked ? 'var(--accent)' : 'rgba(255,255,255,0.9)';
      cb.textContent = checked ? '✓' : '';
    }
  });
}

async function _deleteAiSlot(id, e) {
  e?.stopPropagation();
  if (!confirm('이 작업을 삭제할까요?')) return;
  try {
    await deleteSlotFromDB(id);
    if (typeof _slots !== 'undefined') _slots = _slots.filter(s => s.id !== id);
  } catch(_e) {}
  _aiRecommendChecked.delete(id);
  initAiRecommendTab();
}

async function _batchDeleteAiSlots() {
  if (!_aiRecommendChecked.size) return;
  if (!confirm(`선택한 ${_aiRecommendChecked.size}개를 삭제할까요?`)) return;
  for (const id of [..._aiRecommendChecked]) {
    try { await deleteSlotFromDB(id); } catch(_e) {}
    if (typeof _slots !== 'undefined') _slots = _slots.filter(s => s.id !== id);
  }
  _aiRecommendChecked.clear();
  initAiRecommendTab();
}

function _goToFinishSlot(slotId) {
  showTab('finish', document.querySelectorAll('.nav-btn')[4]);
  initFinishTab().catch ? initFinishTab().catch(() => {}) : setTimeout(initFinishTab, 0);
  setTimeout(() => {
    const el = document.querySelector(`[data-finish-slot="${slotId}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 350);
}

// 슬롯 상태에 따라 해당 단계로 이동
async function _goToSlotStep(slotId) {
  let slots = [];
  try { slots = await loadSlotsFromDB(); } catch(_e) {}
  const slot = slots.find(s => s.id === slotId);
  if (!slot) return;

  const isWorkshopDone = slot.status === 'done';
  const hasCaption = !!slot.caption;

  if (!isWorkshopDone || slot.photos.length === 0) {
    // 작업실 미완료 → 작업실로
    showTab('workshop', document.querySelectorAll('.nav-btn')[1]);
    initWorkshopTab();
    setTimeout(() => {
      const el = document.querySelector(`[data-slot-id="${slotId}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  } else if (!hasCaption) {
    // 캡션 없음 → 글쓰기 탭으로 (해당 슬롯 선택)
    window._selectedSlotForCaption = slot;
    showTab('caption', document.querySelectorAll('.nav-btn')[2]);
    if (typeof initCaptionTab === 'function') initCaptionTab();
  } else {
    // 완성 → 마무리 탭으로
    _goToFinishSlot(slotId);
  }
}

// =====================================================================
// ===== AI 추천 카드 퀵 액션 (즉시 인스타 / 예약) =====
// =====================================================================
async function _quickPublishFromAi(slotId, e) {
  e?.stopPropagation();
  // app-gallery-finish.js에 이미 있는 publishSlotToInstagram 재사용
  if (typeof publishSlotToInstagram === 'function') {
    if (typeof _slots === 'undefined' || !_slots || _slots.length === 0) {
      try { _slots = await loadSlotsFromDB(); } catch(_e) { _slots = []; }
    }
    return publishSlotToInstagram(slotId);
  }
  showToast('잠시 후 다시 시도해주세요');
}

// =====================================================================
// ===== 인스타그램 발행 공용 헬퍼 (app-gallery.js 등에서 호출) =====
// =====================================================================
async function doInstagramPublish(imageUrl, captionText) {
  const upPopup = document.getElementById('uploadProgressPopup');
  try {
    upPopup.style.display = 'flex';
    setUploadProgress(10, '인스타 연결 중...');
    const res = await fetch(API + '/instagram/publish', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body: JSON.stringify({ image_url: imageUrl, caption: captionText }),
    });
    setUploadProgress(90, '업로드 완료 처리 중...');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      upPopup.style.display = 'none';
      showToast('업로드 실패: ' + (err.detail || '인스타 연결을 확인해주세요'));
      return false;
    }
    upPopup.style.display = 'none';
    const donePopup = document.getElementById('uploadDonePopup');
    const doneMsg = document.getElementById('uploadDoneMsg');
    if (doneMsg) doneMsg.textContent = '인스타 피드에 올라갔어요 ✨';
    if (donePopup) donePopup.style.display = 'flex';
    return true;
  } catch(e) {
    upPopup.style.display = 'none';
    showToast('업로드 오류: ' + e.message);
    return false;
  }
}

