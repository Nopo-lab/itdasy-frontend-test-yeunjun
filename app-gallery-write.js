// Itdasy Studio - 글쓰기 탭 (app-gallery.js에서 분리)

// ═══════════════════════════════════════════════════════
// 피크 캐러셀 (글쓰기 슬롯 사진 / 미리보기 공용)
// ═══════════════════════════════════════════════════════
function _buildPeekCarousel(photos, id) {
  if (!photos.length) return '<div style="color:var(--text3);text-align:center;padding:16px;font-size:12px;">사진 없음</div>';
  const total = photos.length;
  if (total === 1) {
    return `<div style="width:70%;margin:0 auto;aspect-ratio:1/1;border-radius:14px;overflow:hidden;">
      <img src="${photos[0].editedDataUrl || photos[0].dataUrl}" style="width:100%;height:100%;object-fit:cover;">
    </div>`;
  }
  return `
    <div id="${id}" style="overflow:hidden;position:relative;user-select:none;touch-action:pan-y;">
      <div id="${id}_t" style="display:flex;transform:translateX(15%);transition:transform .35s cubic-bezier(.25,.46,.45,.94);">
        ${photos.map((p, i) => `
          <div style="flex-shrink:0;width:70%;padding:0 2%;box-sizing:border-box;">
            <div class="${id}_s" style="aspect-ratio:1/1;border-radius:14px;overflow:hidden;transition:transform .35s,filter .35s;transform:scale(${i===0?1:.85});filter:${i===0?'none':'brightness(.6)'};">
              <img src="${p.editedDataUrl || p.dataUrl}" style="width:100%;height:100%;object-fit:cover;display:block;">
            </div>
          </div>`).join('')}
      </div>
      <div style="display:flex;justify-content:center;gap:5px;padding:8px 0 0;" id="${id}_dots">
        ${photos.map((_,i) => `<div id="${id}_d${i}" style="height:6px;border-radius:3px;background:${i?'rgba(0,0,0,0.15)':'var(--accent)'};width:${i?'6':'18'}px;transition:all .3s;"></div>`).join('')}
      </div>
    </div>
  `;
}

function _initPeekCarousel(id, total) {
  const track = document.getElementById(id + '_t');
  if (!track || total < 2) return;
  let cur = 0;
  let offsetPx = 0; // 실시간 드래그 오프셋
  const container = document.getElementById(id);
  const containerW = container?.offsetWidth || 300;
  const slideW = containerW * 0.7; // 70%

  function go(n, animate = true) {
    cur = Math.max(0, Math.min(total - 1, n));
    offsetPx = -cur * slideW;
    track.style.transition = animate ? 'transform .35s cubic-bezier(.25,.46,.45,.94)' : 'none';
    track.style.transform = `translateX(calc(15% + ${offsetPx}px))`;
    track.querySelectorAll('.' + id + '_s').forEach((el, i) => {
      el.style.transform = i === cur ? 'scale(1)' : 'scale(.85)';
      el.style.filter = i === cur ? 'none' : 'brightness(.6)';
    });
    for (let i = 0; i < total; i++) {
      const d = document.getElementById(id + '_d' + i);
      if (d) { d.style.width = i === cur ? '18px' : '6px'; d.style.background = i === cur ? 'var(--accent)' : 'rgba(0,0,0,0.15)'; }
    }
  }

  // 모멘텀 계산용 변수
  let sx = 0, st = 0, dragging = false, lastX = 0, velocity = 0, lastTime = 0;

  track.addEventListener('touchstart', e => {
    sx = e.touches[0].clientX;
    lastX = sx;
    st = Date.now();
    lastTime = st;
    velocity = 0;
    dragging = true;
    track.style.transition = 'none';
  }, { passive: true });

  track.addEventListener('touchmove', e => {
    if (!dragging) return;
    const x = e.touches[0].clientX;
    const dx = x - sx;
    const now = Date.now();
    const dt = now - lastTime;
    if (dt > 0) velocity = (x - lastX) / dt; // px/ms
    lastX = x;
    lastTime = now;
    // 실시간 드래그 반영
    track.style.transform = `translateX(calc(15% + ${offsetPx + dx}px))`;
    if (Math.abs(dx) > 10) e.preventDefault();
  }, { passive: false });

  track.addEventListener('touchend', e => {
    if (!dragging) return;
    dragging = false;
    const dx = e.changedTouches[0].clientX - sx;
    // 모멘텀: 속도 기반으로 몇 슬라이드 이동할지 결정
    const momentum = velocity * 150; // 150ms 관성
    const totalMove = dx + momentum;
    const slidesToMove = Math.round(-totalMove / slideW);
    go(cur + slidesToMove);
  }, { passive: true });

  // 마우스 드래그
  let msx = 0, mst = 0, md = false, mLastX = 0, mVelocity = 0, mLastTime = 0;
  track.addEventListener('mousedown', e => {
    msx = e.clientX;
    mLastX = msx;
    mst = Date.now();
    mLastTime = mst;
    mVelocity = 0;
    md = true;
    track.style.transition = 'none';
    e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!md) return;
    const x = e.clientX;
    const dx = x - msx;
    const now = Date.now();
    const dt = now - mLastTime;
    if (dt > 0) mVelocity = (x - mLastX) / dt;
    mLastX = x;
    mLastTime = now;
    track.style.transform = `translateX(calc(15% + ${offsetPx + dx}px))`;
  });
  window.addEventListener('mouseup', e => {
    if (!md) return;
    md = false;
    const dx = e.clientX - msx;
    const momentum = mVelocity * 150;
    const totalMove = dx + momentum;
    const slidesToMove = Math.round(-totalMove / slideW);
    go(cur + slidesToMove);
  });
}

// ═══════════════════════════════════════════════════════
// 글쓰기 탭 — 슬롯 픽커
// ═══════════════════════════════════════════════════════
function initCaptionSlotPicker() {
  // 사진이 있는 슬롯 모두 노출 (상태 무관). 글쓰기 진입은 사진만 있어도 가능해야 함.
  const usableSlots = _slots.filter(s => (s.photos || []).filter(p => !p.hidden).length > 0);
  const container = document.getElementById('captionSlotPicker');
  if (!container) return;

  // 키워드 태그 렌더링
  if (typeof renderCaptionKeywordTags === 'function') renderCaptionKeywordTags();

  if (!usableSlots.length) { container.style.display = 'none'; return; }
  container.style.display = 'block';
  container.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:12px 14px;">
      <div style="font-size:12px;font-weight:800;color:var(--text);margin-bottom:10px;">작업실 슬롯 <span style="font-size:10px;color:var(--text3);font-weight:400;">— 탭하면 사진이 연결돼요</span></div>
      <div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;" id="captionSlotCards">
        ${usableSlots.map(slot => {
          const thumb = (slot.photos || []).filter(p => !p.hidden)[0];
          if (!thumb) return '';
          const hasCaption = !!(slot.caption && slot.caption.trim());
          const isDone = slot.status === 'done' || hasCaption;
          const badge = isDone ? '✓' : '';
          return `
            <div id="csPick_${slot.id}" onclick="loadSlotForCaption('${slot.id}')" style="flex-shrink:0;width:64px;cursor:pointer;text-align:center;">
              <div style="position:relative;">
                <img src="${thumb.editedDataUrl || thumb.dataUrl}" style="width:64px;height:64px;object-fit:cover;border-radius:10px;border:2px solid transparent;transition:border-color 0.2s;" id="csThumb_${slot.id}">
                ${badge ? `<div style="position:absolute;top:-4px;right:-4px;background:#4caf50;color:#fff;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;border:2px solid #fff;">${badge}</div>` : ''}
              </div>
              <div style="font-size:9px;color:var(--text2);margin-top:3px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${slot.label}</div>
            </div>
          `;
        }).join('')}
      </div>
      <div id="captionSlotPhotoStrip" style="display:none;margin-top:10px;"></div>
    </div>
  `;
}

async function loadSlotForCaption(slotId) {
  const slot = _slots.find(s => s.id === slotId);
  if (!slot) return;
  _captionSlotId = slotId;

  // 슬롯 카드 선택 표시
  document.querySelectorAll('[id^="csThumb_"]').forEach(el => {
    el.style.borderColor = 'transparent';
  });
  const pickedThumb = document.getElementById(`csThumb_${slotId}`);
  if (pickedThumb) pickedThumb.style.borderColor = 'var(--accent)';

  // 보이는 사진만 (hidden 제외)
  const visPhotos = (slot.photos || []).filter(p => !p.hidden);

  // 사진 피크 캐러셀 표시
  const strip = document.getElementById('captionSlotPhotoStrip');
  if (strip && visPhotos.length > 0) {
    strip.style.display = 'block';
    strip.innerHTML = _buildPeekCarousel(visPhotos, 'cs_carousel');
    setTimeout(() => {
      _initPeekCarousel('cs_carousel', visPhotos.length);
      // 2026-04-24 — 손님 탭 누르면 사진 피크 영역으로 자동 스크롤 (사용자가 안 보일 수 있어서)
      try { strip.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_e) { /* iOS<14 */ }
    }, 50);
  } else if (strip) {
    strip.style.display = 'none';
  }

  // 슬롯에 이미 저장된 캡션이 있으면 텍스트영역에 채워서 이어쓰기 가능하게
  const ta = document.getElementById('captionText');
  const haTa = document.getElementById('captionHash');
  if (ta && slot.caption) {
    ta.value = slot.caption;
    if (typeof _capAutoGrow === 'function') _capAutoGrow(ta);
  } else if (ta) {
    // 다른 슬롯으로 전환 시 이전 캡션이 남지 않도록 비움
    ta.value = '';
    if (typeof _capAutoGrow === 'function') _capAutoGrow(ta);
  }
  if (haTa) haTa.value = slot.hashtags || '';

  showToast(`${slot.label} 연결됐어요 ✅`);

  // 단일 작업 카드의 사진 영역 갱신 (app-caption.js)
  if (typeof _captionPhotosReordered !== 'undefined') _captionPhotosReordered = null;
  if (typeof _renderCaptionPhotoRow === 'function') _renderCaptionPhotoRow();
}

// ═══════════════════════════════════════════════════════
// 글쓰기 탭 — 바로 올리기 (인스타 피드 미리보기 팝업)
// ═══════════════════════════════════════════════════════
function publishFromCaption() {
  const caption = (document.getElementById('captionText')?.value || '').trim();
  const hash    = (document.getElementById('captionHash')?.value  || '').trim();
  const full    = caption + (hash ? '\n\n' + hash : '');

  const slot   = _captionSlotId ? _slots.find(s => s.id === _captionSlotId) : null;
  const photos = slot ? slot.photos.filter(p => !p.hidden) : [];

  _showCaptionPublishPreview(photos, full);
}

function _showCaptionPublishPreview(photos, caption) {
  _previewPhotoIdx = 0;
  let pop = document.getElementById('_captionPubPreviewPop');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = '_captionPubPreviewPop';
    pop.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,0.6);display:flex;align-items:flex-end;justify-content:center;';
    pop.onclick = e => { if (e.target === pop) pop.style.display = 'none'; };
    document.body.appendChild(pop);
  }

  const shopName   = localStorage.getItem('shop_name') || '잇데이 스튜디오';
  const shopHandle = (localStorage.getItem('shop_name') || 'itdasy').toLowerCase().replace(/\s/g, '');
  const total      = photos.length;
  const avatarLetter = (shopName[0] || '잇');

  // Instagram-style 1:1 사진 영역 (피크 캐러셀)
  const photoHtml = total
    ? `<div style="position:relative;width:100%;aspect-ratio:1/1;background:#000;overflow:hidden;" id="_pubCarouselWrap">
        <div id="_pub_t" style="display:flex;${total>1?'transform:translateX(15%);':''}transition:transform .35s cubic-bezier(.25,.46,.45,.94);">
          ${photos.map((p, i) => `
            <div style="flex-shrink:0;width:${total>1?70:100}%;${total>1?'padding:0 2%;box-sizing:border-box;':''}">
              <div class="_pub_s" style="aspect-ratio:1/1;overflow:hidden;${total>1?'border-radius:10px;':''};transition:transform .35s,filter .35s;transform:scale(${i===0?1:.85});filter:${i===0?'none':'brightness(.6)'};">
                <img src="${p.editedDataUrl || p.dataUrl}" style="width:100%;height:100%;object-fit:cover;display:block;">
              </div>
            </div>`).join('')}
        </div>
        ${total > 1 ? `<div style="display:flex;justify-content:center;gap:5px;padding:8px 0 4px;background:#fff;" id="_pub_dots">
          ${photos.map((_,i) => `<div id="_pub_d${i}" style="height:6px;border-radius:3px;background:${i?'rgba(0,0,0,0.15)':'#3897f0'};width:${i?'6':'18'}px;transition:all .3s;"></div>`).join('')}
        </div>` : ''}
      </div>`
    : `<div style="width:100%;aspect-ratio:1/1;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:50px;">📷</div>`;

  const escapedCaption = caption.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

  pop.innerHTML = `
    <div style="width:100%;max-width:480px;background:#fff;border-radius:20px 20px 0 0;max-height:92vh;overflow-y:auto;">
      <!-- 드래그 핸들 -->
      <div style="display:flex;justify-content:center;padding:10px 0 0;">
        <div style="width:36px;height:4px;border-radius:2px;background:rgba(0,0,0,0.12);"></div>
      </div>
      <!-- 인스타 피드 헤더 -->
      <div style="display:flex;align-items:center;padding:10px 12px 10px;">
        <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888);padding:2px;margin-right:10px;">
          <div style="width:100%;height:100%;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:800;">${avatarLetter}</div>
        </div>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:700;line-height:1.2;">${shopName}</div>
          <div style="font-size:10px;color:#999;">sponsored</div>
        </div>
        <button style="padding:4px 12px;border-radius:6px;border:1.5px solid #dbdbdb;background:transparent;font-size:12px;font-weight:600;color:#262626;cursor:pointer;">팔로우</button>
        <button style="background:transparent;border:none;font-size:18px;color:#999;cursor:pointer;margin-left:8px;" onclick="document.getElementById('_captionPubPreviewPop').style.display='none'">×</button>
      </div>
      <!-- 사진 캐러셀 -->
      ${photoHtml}
      <!-- 액션 아이콘 -->
      <div style="display:flex;align-items:center;padding:10px 12px 4px;">
        <svg style="width:24px;height:24px;margin-right:14px;" viewBox="0 0 24 24" fill="none" stroke="#262626" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        <svg style="width:24px;height:24px;margin-right:14px;" viewBox="0 0 24 24" fill="none" stroke="#262626" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <svg style="width:24px;height:24px;" viewBox="0 0 24 24" fill="none" stroke="#262626" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        <svg style="width:24px;height:24px;margin-left:auto;" viewBox="0 0 24 24" fill="none" stroke="#262626" stroke-width="2"><polygon points="19 21 12 16 5 21 5 3 19 3 19 21"/></svg>
      </div>
      <!-- 캡션 -->
      <div style="padding:2px 12px 14px;">
        <div style="font-size:13px;color:#262626;line-height:1.6;"><span style="font-weight:700;">${shopHandle} </span>${escapedCaption || '(캡션 없음)'}</div>
      </div>
      <!-- 발행 버튼 -->
      <div style="padding:0 12px 28px;">
        <button onclick="doPublishFromCaption()" style="width:100%;height:48px;border-radius:14px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:14px;font-weight:800;cursor:pointer;">인스타에 올리기 🚀</button>
      </div>
    </div>
  `;
  pop.style.display = 'flex';
  window._pubPhotos     = photos;
  window._pubPhotoTotal = total;

  // 캐러셀 초기화
  if (total > 1) {
    setTimeout(() => {
      const track = document.getElementById('_pub_t');
      if (!track) return;
      let cur = 0;
      function pubGo(n) {
        cur = Math.max(0, Math.min(total - 1, n));
        _previewPhotoIdx = cur;
        track.style.transform = `translateX(${15 - cur * 70}%)`;
        track.querySelectorAll('._pub_s').forEach((el, i) => {
          el.style.transform = i === cur ? 'scale(1)' : 'scale(.85)';
          el.style.filter = i === cur ? 'none' : 'brightness(.6)';
        });
        for (let i = 0; i < total; i++) {
          const d = document.getElementById('_pub_d' + i);
          if (d) { d.style.width = i === cur ? '18px' : '6px'; d.style.background = i === cur ? '#3897f0' : 'rgba(0,0,0,0.15)'; }
        }
      }
      let sx = 0, st = 0, dr = false;
      track.addEventListener('touchstart', e => { sx = e.touches[0].clientX; st = Date.now(); dr = true; }, { passive: true });
      track.addEventListener('touchend', e => {
        if (!dr) return; dr = false;
        const dx = e.changedTouches[0].clientX - sx;
        const fast = Math.abs(dx) / (Date.now() - st) > 0.4;
        if (dx < -30 || (fast && dx < 0)) pubGo(cur + 1);
        else if (dx > 30 || (fast && dx > 0)) pubGo(cur - 1);
      }, { passive: true });
      let msx = 0, mst = 0, mdr = false;
      track.addEventListener('mousedown', e => { msx = e.clientX; mst = Date.now(); mdr = true; e.preventDefault(); });
      window.addEventListener('mouseup', e => {
        if (!mdr) return; mdr = false;
        const dx = e.clientX - msx;
        const fast = Math.abs(dx) / (Date.now() - mst) > 0.4;
        if (dx < -30 || (fast && dx < 0)) pubGo(cur + 1);
        else if (dx > 30 || (fast && dx > 0)) pubGo(cur - 1);
      });
    }, 80);
  }
}

// _pubSwipe integrated into _showCaptionPublishPreview carousel

async function doPublishFromCaption() {
  const caption = (document.getElementById('captionText')?.value || '').trim();
  const hash    = (document.getElementById('captionHash')?.value  || '').trim();
  const full    = caption + (hash ? '\n\n' + hash : '');
  const photos  = window._pubPhotos || [];

  if (!photos.length) { showToast('연결된 사진이 없어요. 작업실 슬롯을 먼저 선택해주세요.'); return; }

  // [2026-04-26 / Meta 심사 대응] 인스타 발행 전 명시적 사용자 확인.
  const _confirmMsg = '정말 인스타 피드에 올릴까요?\n발행 후엔 바로 공개돼요.';
  let _confirmed = false;
  try {
    if (typeof nativeConfirm === 'function') {
      _confirmed = await nativeConfirm('인스타 발행', _confirmMsg);
    } else {
      _confirmed = window.confirm(_confirmMsg);
    }
  } catch (_) { _confirmed = window.confirm(_confirmMsg); }
  if (!_confirmed) return;


  const pop = document.getElementById('_captionPubPreviewPop');
  if (pop) pop.style.display = 'none';

  const photo = photos[_previewPhotoIdx] || photos[0];
  const upPopup = document.getElementById('uploadProgressPopup');
  if (upPopup) upPopup.style.display = 'flex';
  if (typeof setUploadProgress === 'function') setUploadProgress(10, '이미지 준비 중...');

  try {
    const blob = _dataUrlToBlob(photo.editedDataUrl || photo.dataUrl);
    const fd   = new FormData();
    fd.append('image', blob, 'photo.jpg');
    fd.append('caption', full);
    if (typeof setUploadProgress === 'function') setUploadProgress(30, '서버 전송 중...');

    const res  = await fetch(API + '/instagram/publish', {
      method: 'POST',
      headers: { ...authHeader(), 'ngrok-skip-browser-warning': 'true' },
      body: fd,
    });
    if (typeof setUploadProgress === 'function') setUploadProgress(80, '발행 중...');
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || '업로드 실패');

    if (typeof setUploadProgress === 'function') setUploadProgress(100, '완료! 🎉');
    setTimeout(() => {
      if (upPopup) upPopup.style.display = 'none';
      const donePopup = document.getElementById('uploadDonePopup');
      if (donePopup) donePopup.style.display = 'flex';
      const doneMsg = document.getElementById('uploadDoneMsg');
      if (doneMsg) doneMsg.textContent = '인스타 피드에 올라갔어요 ✨';
      if (typeof createConfetti === 'function') for (let i = 0; i < 20; i++) setTimeout(createConfetti, i * 100);
    }, 1200);
  } catch(e) {
    if (upPopup) upPopup.style.display = 'none';
    showToast('오류: ' + (window._humanError ? window._humanError(e) : e.message));
  }
}

