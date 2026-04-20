// Itdasy Studio - 캡션 생성 (슬롯머신, 톤 컨트롤, 해시태그)

// ═══════════════════════════════════════════════════════
// 업종별 기본 키워드 config
// ═══════════════════════════════════════════════════════
const SHOP_KEYWORDS = {
  '붙임머리': ['14인치','18인치','22인치','24인치','26인치','28인치','30인치','특수인치','옴브레','재시술','볼륨업','자연스러운','롱헤어'],
  '네일아트': ['젤네일','아트','프렌치','이달의아트','글리터','원톤','그라데이션','스톤','매트','자개'],
  '네일': ['젤네일','아트','프렌치','이달의아트','글리터','원톤','그라데이션','스톤','매트','자개'],
  '헤어': ['단발','투블럭','남성','여성','펌','염색','탈색','클리닉','셋팅','레이어드','히피펌','S컬'],
  '속눈썹': ['볼륨','클래식','내추럴','C컬','D컬','J컬','CC컬','브라운','속눈썹펌','래쉬리프트','하속눈썹'],
};

// 사용자 커스텀 키워드 (localStorage)
function _loadCustomKeywords() {
  try { return JSON.parse(localStorage.getItem('itdasy_custom_keywords') || '[]'); } catch(_) { return []; }
}
function _saveCustomKeywords(arr) {
  localStorage.setItem('itdasy_custom_keywords', JSON.stringify(arr));
}

// 삭제된 기본 키워드 (localStorage)
function _loadDeletedKeywords() {
  try { return JSON.parse(localStorage.getItem('itdasy_deleted_keywords') || '[]'); } catch(_) { return []; }
}
function _saveDeletedKeywords(arr) {
  localStorage.setItem('itdasy_deleted_keywords', JSON.stringify(arr));
}

// 현재 업종에 맞는 키워드 목록 반환 (기본 - 삭제 + 커스텀)
function getShopKeywords() {
  const shopType = localStorage.getItem('shop_type') || '붙임머리';
  const base = SHOP_KEYWORDS[shopType] || SHOP_KEYWORDS['붙임머리'];
  const deleted = _loadDeletedKeywords();
  const custom = _loadCustomKeywords();
  const filtered = base.filter(k => !deleted.includes(k));
  return [...new Set([...filtered, ...custom])];
}

// ===== 해시태그 셔플 믹싱 =====
// 이전에 사용한 태그 순서 기록 → 매번 다른 조합·순서로 노출
function shuffleHashtags(tags) {
  if (!tags || tags.length === 0) return tags;

  // 이전 사용 기록 로드
  let history = [];
  try { history = JSON.parse(localStorage.getItem('itdasy_hash_history') || '[]'); } catch(_) {}

  // 핵심 태그(앞 3개)는 고정, 나머지를 셔플 대상으로 분리
  const core = tags.slice(0, 3);
  const pool = tags.slice(3);

  // 이전 마지막 조합과 겹치는 인덱스 파악
  const lastCombo = history[history.length - 1] || [];
  // 피셔-예이츠 셔플 후, 직전 순서와 최소 2개 이상 다르면 채택
  let shuffled;
  let attempts = 0;
  do {
    shuffled = [...pool].sort(() => Math.random() - 0.5);
    attempts++;
  } while (
    attempts < 8 &&
    pool.length >= 4 &&
    shuffled.slice(0, 4).every((t, i) => lastCombo[i] === t)
  );

  const result = [...core, ...shuffled];

  // 히스토리 최대 5개 유지
  history.push(result.map(h => h.replace(/^#/, '')));
  if (history.length > 5) history.shift();
  localStorage.setItem('itdasy_hash_history', JSON.stringify(history));

  return result;
}

// ===== 캡션 로딩 팝업 (슬롯머신) =====
const SLOT_KEYWORDS = [
  ['따뜻한','친근한','유머러스','전문적인','감성적인','활발한','차분한','트렌디한','포근한','자연스러운'],
  ['짧게','보통','길게','핵심만','상세하게','간결하게','풍부하게','딱맞게','깔끔하게','진심으로'],
  ['✨','🎀','💕','🌸','😊','💫','🔥','🌿','💗','🙏'],
];
let _slotTimers = [];
let _slotLocked = [false, false, false];
let _personaFinalWords = ['자연스러운', '보통', '✨'];

function _initSlotStrip(idx) {
  const strip = document.getElementById('slotStrip' + idx);
  if (!strip) return;
  strip.innerHTML = '';
  const words = [...SLOT_KEYWORDS[idx], ...SLOT_KEYWORDS[idx], ...SLOT_KEYWORDS[idx]];
  words.forEach(w => {
    const div = document.createElement('div');
    div.className = 'slot-item';
    div.textContent = w;
    strip.appendChild(div);
  });
  strip.style.transition = 'none';
  strip.style.transform = 'translateY(0px)';
}

function _spinReel(idx) {
  const strip = document.getElementById('slotStrip' + idx);
  if (!strip) return;
  let offset = 0;
  const itemH = 44;
  const total = SLOT_KEYWORDS[idx].length * 3;
  const speed = 100 + idx * 35;
  const timer = setInterval(() => {
    if (_slotLocked[idx]) { clearInterval(timer); return; }
    offset -= itemH;
    if (offset < -(total - SLOT_KEYWORDS[idx].length) * itemH) {
      offset = -Math.floor(Math.random() * SLOT_KEYWORDS[idx].length) * itemH;
      strip.style.transition = 'none';
      strip.style.transform = `translateY(${offset}px)`;
      return;
    }
    strip.style.transition = `transform ${speed * 0.9}ms linear`;
    strip.style.transform = `translateY(${offset}px)`;
  }, speed);
  _slotTimers.push(timer);
}

function _lockReel(idx, keyword) {
  _slotLocked[idx] = true;
  const lockEl = document.getElementById('slotLock' + idx);
  if (lockEl) {
    lockEl.textContent = keyword;
    lockEl.classList.add('active');
  }
  // 슬롯 윈도우 숨겨서 글자 겹침 방지
  const stripEl = document.getElementById('slotStrip' + idx);
  if (stripEl) {
    const winEl = stripEl.closest('.slot-window');
    if (winEl) winEl.style.visibility = 'hidden';
  }
}

function showCaptionLoader() {
  const popup = document.getElementById('captionLoadingPopup');
  popup.style.display = 'flex';
  _slotLocked = [false, false, false];
  _slotTimers.forEach(t => { clearInterval(t); clearTimeout(t); });
  _slotTimers = [];

  // 페르소나 데이터로 최종 잠금 키워드 설정
  const raw = JSON.parse(localStorage.getItem('itdasy_latest_analysis') || '{}');
  const avgLen = parseInt(raw.avg_caption_length) || 0;
  const lenWord = avgLen > 0 ? (avgLen < 50 ? '짧게' : avgLen > 120 ? '길게' : '보통') : '보통';
  const emojiMatch = (raw.emojis || '').match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u);
  const emojiWord = emojiMatch ? emojiMatch[0] : '✨';
  const toneWord = (raw.tone_summary || raw.tone || '').replace(/["']/g, '').trim().split(/[\s,·]+/)[0] || '자연스러운';
  _personaFinalWords = [toneWord, lenWord, emojiWord];

  [0,1,2].forEach(i => {
    const lock = document.getElementById('slotLock' + i);
    if (lock) lock.classList.remove('active');
    // 슬롯 윈도우 다시 표시
    const stripEl = document.getElementById('slotStrip' + i);
    if (stripEl) {
      const winEl = stripEl.closest('.slot-window');
      if (winEl) winEl.style.visibility = '';
    }
    _initSlotStrip(i);
    setTimeout(() => _spinReel(i), i * 120);
  });
  document.getElementById('clMsg').textContent = '원장님 말투로 조합 중...';
  document.getElementById('clHint').textContent = '키워드 조합 중이에요 ✨';

  // 메시지 순환
  const _clMsgs = ['원장님 말투 불러오는 중...', 'AI가 글 구상 중이에요...', '해시태그 고르는 중...', '거의 다 됐어요...'];
  let _clMsgIdx = 0;
  const _clMsgTimer = setInterval(() => {
    _clMsgIdx = Math.min(_clMsgIdx + 1, _clMsgs.length - 1);
    if (!_slotLocked[0]) document.getElementById('clMsg').textContent = _clMsgs[_clMsgIdx];
  }, 1600);
  _slotTimers.push(_clMsgTimer);

}

function hideCaptionLoader(success, onClose) {
  // 아직 안 잠긴 릴만 순차 잠금 (150ms 간격) — API 응답 완료 시점에 맞춰 빠르게 종료
  const finalWords = [
    _personaFinalWords[0] || SLOT_KEYWORDS[0][Math.floor(Math.random() * SLOT_KEYWORDS[0].length)],
    _personaFinalWords[1] || SLOT_KEYWORDS[1][Math.floor(Math.random() * SLOT_KEYWORDS[1].length)],
    _personaFinalWords[2] || SLOT_KEYWORDS[2][Math.floor(Math.random() * SLOT_KEYWORDS[2].length)],
  ];
  let lastLockDelay = 0;
  [0, 1, 2].forEach(i => {
    if (!_slotLocked[i]) {
      setTimeout(() => _lockReel(i, finalWords[i]), i * 150);
      lastLockDelay = i * 150;
    }
  });
  // 마지막 릴 잠금 후 350ms 뒤 닫기
  setTimeout(() => {
    _slotTimers.forEach(t => { clearInterval(t); clearTimeout(t); });
    _slotTimers = [];
    document.getElementById('captionLoadingPopup').style.display = 'none';
    _slotLocked = [false, false, false];
    if (onClose) setTimeout(onClose, 80);
  }, lastLockDelay + 350);
}

// ===== 온보딩 캡션 테스트 팝업 =====
async function showOnboardingCaptionPopup() {
  const popup = document.getElementById('onboardingCaptionPopup');
  const ta = document.getElementById('ocpTextarea');

  // 팝업을 먼저 열고, 생성 중 상태로 표시
  const loadingMsgs = ['AI가 말투를 분석하고 있어요...✨', '게시물 스타일 학습 중...🎀', '피드 글 초안 작성 중...📝', '거의 다 됐어요!💫'];
  let msgIdx = 0;
  ta.value = loadingMsgs[0];
  ta.readOnly = true;
  ta.style.opacity = '0.5';
  popup.style.display = 'flex';
  const loadingTimer = setInterval(() => { msgIdx = (msgIdx + 1) % loadingMsgs.length; ta.value = loadingMsgs[msgIdx]; }, 2000);

  // 저장 버튼도 비활성화
  const saveBtn = popup.querySelector('.ocp-save');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.style.opacity = '0.5'; }

  try {
    const shopType = localStorage.getItem('shop_type') || '붙임머리';
    const res = await fetch(API + '/caption/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ description: `${shopType} 시술. 오늘 새로운 손님. 결과 대만족.`, platform: 'instagram' }),
    });
    if (res.ok) {
      const d = await res.json();
      ta.value = d.caption.trim();
    } else {
      ta.value = '직접 평소 쓰시는 말투로 한 문단 입력해주시면 학습할게요!';
    }
  } catch(e) {
    ta.value = '직접 평소 쓰시는 말투로 한 문단 입력해주시면 학습할게요!';
  } finally {
    clearInterval(loadingTimer);
    ta.readOnly = false;
    ta.style.opacity = '1';
    if (saveBtn) { saveBtn.disabled = false; saveBtn.style.opacity = '1'; }
  }
}

function closeOnboardingCaptionPopup() {
  document.getElementById('onboardingCaptionPopup').style.display = 'none';
}

async function saveOnboardingCaption() {
  const ta = document.getElementById('ocpTextarea');
  const text = ta.value.trim();
  if (!text || text.length < 10) { showToast('글을 조금 더 입력해주세요!'); return; }

  try {
    const res = await fetch(API + '/shop/persona/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ corrected_caption: text }),
    });
    if (!res.ok) throw new Error();
    closeOnboardingCaptionPopup();
    showToast('학습 완료! 앞으로 모든 글에 반영됩니다! 🎉');
  } catch(e) {
    showToast('저장에 실패했어요. 다시 시도해주세요.');
  }
}

// ===== 캡션 탭 사진 영역 (드래그 순서 변경) =====
let _captionPhotosReordered = null; // 재정렬된 사진 배열 (null = 슬롯 기본 순서)

function _captionOpenSlotPicker() {
  const picker = document.getElementById('captionSlotPicker');
  if (picker) {
    picker.style.display = 'block';
    if (typeof initCaptionSlotPicker === 'function') initCaptionSlotPicker();
    picker.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function _renderCaptionPhotoRow() {
  const strip = document.getElementById('captionPhotoThumbRow');
  if (!strip) return;

  const slot = (typeof _captionSlotId !== 'undefined' && _captionSlotId && typeof _slots !== 'undefined')
    ? _slots.find(s => s.id === _captionSlotId) : null;

  if (!slot) {
    strip.innerHTML = `<div onclick="_captionOpenSlotPicker()" style="width:72px;height:72px;border-radius:10px;border:1.5px dashed var(--border);display:flex;align-items:center;justify-content:center;font-size:22px;color:var(--text3);cursor:pointer;flex-shrink:0;">📷</div>`;
    return;
  }

  const basePhotos = slot.photos.filter(p => !p.hidden);
  if (!_captionPhotosReordered || _captionPhotosReordered._slotId !== _captionSlotId) {
    _captionPhotosReordered = [...basePhotos];
    _captionPhotosReordered._slotId = _captionSlotId;
  }

  strip.innerHTML = '';
  _captionPhotosReordered.forEach((p, i) => {
    const src = p.editedDataUrl || p.dataUrl || '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;flex-shrink:0;user-select:none;';
    wrap.draggable = true;
    wrap.dataset.capPhotoIdx = i;

    wrap.innerHTML = `
      <img src="${src}" draggable="false" style="width:72px;height:72px;object-fit:cover;border-radius:10px;display:block;pointer-events:none;">
      <button onclick="_removeCapPhoto(${i},event)" style="position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;border:none;background:rgba(0,0,0,0.55);color:#fff;font-size:10px;line-height:1;cursor:pointer;">×</button>
      <div style="position:absolute;bottom:2px;left:50%;transform:translateX(-50%);font-size:8px;color:rgba(255,255,255,0.8);background:rgba(0,0,0,0.35);border-radius:3px;padding:0 3px;">${i+1}</div>
    `;

    // HTML5 drag (desktop + PWA)
    wrap.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', String(i)); wrap.style.opacity = '0.4'; });
    wrap.addEventListener('dragend', () => wrap.style.opacity = '1');
    wrap.addEventListener('dragover', e => { e.preventDefault(); wrap.style.outline = '2px solid var(--accent)'; });
    wrap.addEventListener('dragleave', () => wrap.style.outline = '');
    wrap.addEventListener('drop', e => {
      e.preventDefault(); wrap.style.outline = '';
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const toIdx = parseInt(wrap.dataset.capPhotoIdx, 10);
      if (isNaN(fromIdx) || fromIdx === toIdx) return;
      const arr = [..._captionPhotosReordered];
      const [removed] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, removed);
      _captionPhotosReordered = arr;
      _captionPhotosReordered._slotId = _captionSlotId;
      _renderCaptionPhotoRow();
    });

    // Long-press (300ms) → touch drag
    let _lpTimer = null, _lpActive = false;
    wrap.addEventListener('touchstart', () => {
      _lpTimer = setTimeout(() => {
        _lpActive = true;
        wrap.style.opacity = '0.5';
        if (navigator.vibrate) navigator.vibrate(20);
      }, 300);
    }, { passive: true });
    wrap.addEventListener('touchend', () => {
      clearTimeout(_lpTimer);
      if (_lpActive) { wrap.style.opacity = '1'; _lpActive = false; }
    });
    wrap.addEventListener('touchmove', e => {
      if (!_lpActive) { clearTimeout(_lpTimer); return; }
      e.preventDefault();
      const touch = e.touches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('[data-cap-photo-idx]');
      if (el && el !== wrap) {
        const fromIdx = parseInt(wrap.dataset.capPhotoIdx, 10);
        const toIdx   = parseInt(el.dataset.capPhotoIdx, 10);
        const arr = [..._captionPhotosReordered];
        const [removed] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, removed);
        _captionPhotosReordered = arr;
        _captionPhotosReordered._slotId = _captionSlotId;
        _renderCaptionPhotoRow();
      }
    }, { passive: false });

    strip.appendChild(wrap);
  });

  const addBtn = document.createElement('div');
  addBtn.style.cssText = 'width:72px;height:72px;border-radius:10px;border:1.5px dashed var(--border);display:flex;align-items:center;justify-content:center;font-size:22px;color:var(--text3);cursor:pointer;flex-shrink:0;';
  addBtn.textContent = '+';
  addBtn.onclick = _captionOpenSlotPicker;
  strip.appendChild(addBtn);
}

function _removeCapPhoto(idx, e) {
  e?.stopPropagation();
  if (!_captionPhotosReordered) return;
  const slotId = _captionPhotosReordered._slotId;
  _captionPhotosReordered = _captionPhotosReordered.filter((_, i) => i !== idx);
  _captionPhotosReordered._slotId = slotId;
  _renderCaptionPhotoRow();
}


// ===== 편집 로그 PATCH (debounce 800ms) =====
let _lastLogId = null;     // 최근 생성된 generation_log.id
let _capAiDraft = '';      // AI 초안 원본 (edited_amount 계산용)
let _capPatchTimer = null;

function _capAutoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 400) + 'px';
}

function _capSchedulePatch(text) {
  if (!_lastLogId) return;
  clearTimeout(_capPatchTimer);
  _capPatchTimer = setTimeout(() => _capPatchLog(text), 800);
}

async function _capPatchLog(text) {
  if (!_lastLogId || !text.trim()) return;
  // edited_amount: 글자 차이 % (간단 추정)
  const pct = _capAiDraft
    ? Math.round(Math.abs(text.length - _capAiDraft.length) / Math.max(_capAiDraft.length, 1) * 100)
    : 0;
  const micro = document.getElementById('captionEditMicro');
  const pctEl = document.getElementById('captionEditPct');
  if (pctEl) pctEl.textContent = pct > 0 ? `${pct}% 수정됨` : '';

  try {
    await _personaFetch('PATCH', `/persona/generation_logs/${_lastLogId}`, { final_text: text });
  } catch(_e) {} // 조용히 실패
}

// ═══════════════════════════════════════════════════════
// 캡션 입력 UI 렌더링 (동적 키워드 태그)
// ═══════════════════════════════════════════════════════
function renderCaptionKeywordTags() {
  const container = document.getElementById('typeTags');
  if (!container) return;

  const keywords = getShopKeywords();
  const deleted = _loadDeletedKeywords();

  container.innerHTML = keywords.map(k =>
    `<span class="tag" data-v="${k}" onclick="toggleCaptionTag(this)">${k}<button class="tag-delete" onclick="deleteCaptionKeyword('${k}',event)">×</button></span>`
  ).join('') + `<span class="tag tag-add" onclick="showAddKeywordInput()">+ 추가</span>`;
}


function toggleCaptionTag(el) {
  if (el.classList.contains('tag-add')) return;
  el.classList.toggle('on');
}

function deleteCaptionKeyword(keyword, e) {
  e.stopPropagation();
  const base = SHOP_KEYWORDS[localStorage.getItem('shop_type') || '붙임머리'] || [];
  if (base.includes(keyword)) {
    // 기본 키워드는 삭제 목록에 추가
    const deleted = _loadDeletedKeywords();
    if (!deleted.includes(keyword)) {
      deleted.push(keyword);
      _saveDeletedKeywords(deleted);
    }
  } else {
    // 커스텀 키워드는 직접 삭제
    const custom = _loadCustomKeywords();
    _saveCustomKeywords(custom.filter(k => k !== keyword));
  }
  renderCaptionKeywordTags();
}

function showAddKeywordInput() {
  const keyword = prompt('추가할 키워드를 입력하세요:');
  if (!keyword || !keyword.trim()) return;
  const trimmed = keyword.trim();
  const custom = _loadCustomKeywords();
  if (!custom.includes(trimmed)) {
    custom.push(trimmed);
    _saveCustomKeywords(custom);
  }
  // 삭제 목록에서도 제거 (복원)
  const deleted = _loadDeletedKeywords();
  _saveDeletedKeywords(deleted.filter(k => k !== trimmed));
  renderCaptionKeywordTags();
  // 새로 추가된 태그 자동 선택
  setTimeout(() => {
    const tag = document.querySelector(`#typeTags .tag[data-v="${trimmed}"]`);
    if (tag) tag.classList.add('on');
  }, 50);
}

// ===== 캡션 생성 — POST /persona/generate =====
// TD-020: POST /persona/generate 해시태그 반환 필드 추가 필요

// shopType → schemas.json category enum 매핑
const _CAP_CAT_MAP = {'붙임머리':'extension','네일아트':'nail','네일':'nail'};

// 400 에러 코드 → 사용자 안내 메시지
const _CAP_ERR_MSG = {
  'identity_incomplete': '페르소나 탭 필수 5필드부터 채워주세요',
  'consent_missing':     '페르소나 탭 하단 동의를 먼저 해주세요',
  'insufficient_posts':  '포스트가 5개 이상 필요합니다. 인스타 연동에서 포스트를 더 불러와주세요.',
  'fingerprint_missing': '포스트가 5개 이상 필요합니다. 인스타 연동에서 포스트를 더 불러와주세요.',
};

function generateCaption() {
  openCaptionScenarioPopup();
}

// 시나리오 선택 바텀시트 팝업
function openCaptionScenarioPopup() {
  if (typeof window.renderScenarioSelector !== 'function') {
    showToast('잠시 후 다시 시도해주세요.');
    return;
  }

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9000;display:flex;align-items:flex-end;justify-content:center;animation:pp-bg-in .2s ease;';

  const sheet = document.createElement('div');
  sheet.style.cssText = 'width:100%;max-width:480px;background:#fff;border-radius:24px 24px 0 0;padding:24px 20px 36px;box-sizing:border-box;max-height:88vh;overflow-y:auto;animation:pp-sheet-in .22s cubic-bezier(.32,1.1,.68,1);';

  const handle = document.createElement('div');
  handle.style.cssText = 'width:36px;height:4px;background:#e0e0e0;border-radius:2px;margin:0 auto 20px;';
  sheet.appendChild(handle);

  const title = document.createElement('div');
  title.style.cssText = 'font-size:17px;font-weight:800;color:#1a1a1a;margin-bottom:16px;';
  title.textContent = '어떤 상황이에요?';
  sheet.appendChild(title);

  const selectorWrap = document.createElement('div');
  sheet.appendChild(selectorWrap);

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) _closeCaptionScenarioPopup(overlay);
  });

  window.renderScenarioSelector(selectorWrap, async (result) => {
    selectorWrap.innerHTML = '<div style="text-align:center;padding:32px 0;color:#aaa;font-size:14px;">캡션 만드는 중 ✨</div>';
    title.textContent = '잠깐만요!';
    await _doGenerateCaption(result, () => _closeCaptionScenarioPopup(overlay));
  });
}

function _closeCaptionScenarioPopup(overlay) {
  overlay.style.opacity = '0';
  overlay.style.transition = 'opacity .15s';
  setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 160);
  const btn = document.getElementById('captionBtn');
  if (btn) { btn.innerHTML = '만들기 ✨'; btn.disabled = false; }
}

async function _doGenerateCaption(scenario, closePopup) {
  const btn = document.getElementById('captionBtn');
  if (btn) btn.disabled = true;

  showCaptionLoader();

  const shopType = localStorage.getItem('shop_type') || '붙임머리';
  const cfg = SHOP_CONFIG[shopType] || SHOP_CONFIG['붙임머리'];
  const types = getSel('typeTags');
  const typeStr = types.length > 0 ? types.join(', ') : cfg.defaultTag;

  // 작업실 슬롯 연결 정보
  const slotNote = (typeof _captionSlotId !== 'undefined' && _captionSlotId && typeof _slots !== 'undefined')
    ? (() => { const s = _slots.find(sl => sl.id === _captionSlotId); return s ? `손님: ${s.label}. 사진 ${s.photos.filter(p=>!p.hidden).length}장. ` : ''; })()
    : '';

  const axes = (scenario && scenario.axes) ? scenario.axes : {};
  const axesText = axes.customer
    ? `${axes.customer} 손님. ${axes.situation}. ${axes.photo}.`
    : '';
  const specialText = (scenario && scenario.special_context) ? scenario.special_context : '';

  const category      = _CAP_CAT_MAP[shopType] || 'extension';
  const photo_context = `${shopType} 시술. ${cfg.tagLabel}: ${typeStr}. ${slotNote}${axesText} ${specialText}`.trim();
  const length_tier   = 'medium';
  const tone_override = 'normal';

  const payload = { category, photo_context, length_tier, tone_override };
  _lastGeneratePayload = payload;  // 재생성 버튼용
  if (typeof window._assertSpec === 'function') window._assertSpec('POST /persona/generate', payload);

  try {
    const res = await _personaFetch('POST', '/persona/generate', payload);
    const data = await res.json();

    if (!res.ok) {
      const code = data.code || data.detail || '';
      const msg = _CAP_ERR_MSG[code] || '캡션 생성에 실패했습니다. 다시 시도해주세요.';
      hideCaptionLoader(false, () => {
        closePopup();
        // 피드백 #11/#5: identity_incomplete → 기존 페르소나 팝업 열기 (숨겨진 탭 말고)
        if (code.startsWith('identity_incomplete')) {
          showToast('사장님 프로필(업종·매장명 등)을 먼저 등록해주세요');
          if (typeof window.openPersonaPopup === 'function') {
            setTimeout(() => window.openPersonaPopup(), 300);
          }
          return;
        }
        if (code.startsWith('consent_missing')) {
          showToast('페르소나 탭 하단 "AI 처리 동의"를 먼저 체크해주세요');
          return;
        }
        if (code.startsWith('insufficient_posts') || code.startsWith('fingerprint_missing')) {
          showToast('인스타 게시물 5개 이상 필요. 홈에서 인스타 연동 → 말투 분석해주세요');
          return;
        }
        showToast(msg);
      });
      return;
    }

    const finalCaption = data.caption || '';
    const hashes = ''; // TD-020: 해시태그 미반환 — 추후 추가 예정

    // TD-022: 응답에 log_id 없음 — 백엔드 GenerateResponse에 log_id 필드 추가 필요
    if (data.log_id) {
      _lastLogId = data.log_id;
    } else {
      console.warn('[TD-022] log_id missing in POST /persona/generate response — PATCH 비활성');
      _lastLogId = null;
    }
    _capAiDraft = finalCaption;

    // [WIRING] 요청값 vs 서버 응답값 일치 확인
    const respLT = data.length_tier;
    const respTO = data.used_tone;
    // WIRING 디버그 로그 제거 (프로덕션 환경 민감 정보 노출 방지)

    hideCaptionLoader(true, () => {
      closePopup();
      // 피드백 #1 3단계: 첫 캡션 완성 플래그 (인디케이터 3단계 표시용)
      if (!localStorage.getItem('_first_caption_done')) {
        localStorage.setItem('_first_caption_done', new Date().toISOString());
      }
      const ta = document.getElementById('captionText');
      ta.value = finalCaption;
      _capAutoGrow(ta);
      document.getElementById('captionHash').value = hashes;

      const micro = document.getElementById('captionEditMicro');
      if (micro) micro.style.display = _lastLogId ? 'flex' : 'none';

      if (typeof _captionSlotId !== 'undefined' && _captionSlotId && typeof _slots !== 'undefined') {
        const slot = _slots.find(s => s.id === _captionSlotId);
        if (slot) {
          slot.caption = finalCaption;
          slot.hashtags = hashes;
          if (typeof saveSlotToDB === 'function') saveSlotToDB(slot).catch(() => {});
        }
      }

      _renderCaptionActionBar(finalCaption, hashes);
      if (btn) { btn.innerHTML = '만들기 ✨'; btn.disabled = false; }
    });
  } catch(e) {
    if (e.message === '401') return; // _personaFetch가 401 처리
    hideCaptionLoader(false, () => {
      closePopup();
      showToast('일시적 오류. 다시 시도해주세요.');
    });
  }
}

// ===== 마스터: 인스타 자동 발행 (1단계: 프리뷰 열기) =====
function publishToInstagram() {
  if (!getToken()) {
    showToast("홈 탭에서 인스타 연동을 먼저 진행해주세요");
    return;
  }

  const canvas = document.getElementById('baCanvas');
  // 편집 가능한 textarea 값 우선, 없으면 생성된 캡션 사용
  const editedCaption = document.getElementById('publishCaptionPreview').value.trim();
  const caption = document.getElementById('captionText').value;
  const hash = document.getElementById('captionHash').value;
  const hasCaption = caption && !caption.includes("생성된 글이 여기에 나타납니다");

  const finalText = editedCaption || (hasCaption ? caption + "\n\n" + hash : '(글 없이 사진만 올라갑니다)');

  // 팝업 채우기
  const shopName = localStorage.getItem('shop_name') || '사장님';
  document.getElementById('previewShopName').textContent = shopName;
  document.getElementById('previewFinalCaption').textContent = finalText;
  document.getElementById('previewFinalImg').src = canvas.toDataURL('image/png');
  document.getElementById('previewAvatar').innerHTML = document.getElementById('headerAvatar').innerHTML;

  // 팝업 열기
  const pop = document.getElementById('publishPreviewPopup');
  pop.style.display = 'flex';
  setTimeout(() => {
    pop.querySelector('.popup-content').style.transform = 'scale(1)';
    pop.querySelector('.popup-content').style.opacity = '1';
  }, 10);
}

function closePublishPreview() {
  const pop = document.getElementById('publishPreviewPopup');
  pop.querySelector('.popup-content').style.transform = 'scale(0.9)';
  pop.querySelector('.popup-content').style.opacity = '0';
  setTimeout(() => pop.style.display = 'none', 300);
}

// ===== 업로드 진행/완료 팝업 =====
function setUploadProgress(pct, msg) {
  document.getElementById('upPct').textContent = pct + '%';
  document.getElementById('upMsg').textContent = msg;
  document.getElementById('upFill').style.width = pct + '%';
}

function openInstagramProfile() {
  const handle = (_instaHandle || '').replace('@', '');
  window.location.href = handle ? `instagram://user?username=${handle}` : 'instagram://';
}

function closeUploadDone() {
  document.getElementById('uploadDonePopup').style.display = 'none';
}

// ===== 마스터: 인스타 자동 발행 (2단계: 실제 API 호출) =====
async function doActualPublish() {
  const btn = document.getElementById('doPublishBtn');
  const finalCaption = document.getElementById('previewFinalCaption').textContent;
  const withStory = document.getElementById('autoStoryToggle').checked;
  btn.disabled = true;

  const upPopup = document.getElementById('uploadProgressPopup');
  upPopup.style.display = 'flex';
  setUploadProgress(10, '이미지 준비 중...');

  try {
    const canvas = document.getElementById('baCanvas');
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const formData = new FormData();
    formData.append('image', blob, 'instagram_post.png');
    formData.append('caption', finalCaption);

    setUploadProgress(30, '서버에 전송 중...');

    const res = await fetch(API + '/instagram/publish', {
      method: 'POST',
      headers: { ...authHeader(), 'ngrok-skip-browser-warning': 'true' },
      body: formData
    });

    setUploadProgress(60, '인스타에 업로드 중...');

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || '업로드 실패');

    // 스토리 자동 발행
    if (withStory) {
      setUploadProgress(75, '스토리 이미지 만드는 중...');
      try {
        const storyBlob = await makeStoryCanvas(canvas);
        const storyForm = new FormData();
        storyForm.append('image', storyBlob, 'story.png');

        setUploadProgress(85, '스토리 업로드 중...');
        const sRes = await fetch(API + '/instagram/publish-story-file', {
          method: 'POST',
          headers: { ...authHeader(), 'ngrok-skip-browser-warning': 'true' },
          body: storyForm
        });
        if (!sRes.ok) {
          const sErr = await sRes.json().catch(() => ({}));
          console.warn('스토리 발행 실패 (피드는 성공):', sErr.detail || '');
          showToast('피드는 올라갔어요! 스토리는 실패: ' + (sErr.detail || ''));
        }
      } catch(sE) {
        console.warn('스토리 오류:', sE.message);
        showToast('피드는 성공! 스토리 실패: ' + sE.message);
      }
    }

    setUploadProgress(95, '마무리 중...');
    await new Promise(r => setTimeout(r, 400));
    setUploadProgress(100, withStory ? '피드+스토리 완료! 🎉' : '완료! 🎉');

    setTimeout(() => {
      upPopup.style.display = 'none';
      closePublishPreview();
      document.getElementById('uploadDonePopup').style.display = 'flex';
      document.getElementById('uploadDoneMsg').textContent =
        withStory ? '피드 + 스토리에 올라갔어요 ✨' : '인스타 피드에 올라갔어요 ✨';
      for(let i = 0; i < 20; i++) setTimeout(createConfetti, i * 100);
    }, 1200);

  } catch(e) {
    upPopup.style.display = 'none';
    showToast('오류: ' + e.message);
    btn.textContent = '다시 시도하기 🚀';
    btn.disabled = false;
  }
}

// 1:1 피드 캔버스 → 9:16 스토리 캔버스 변환
async function makeStoryCanvas(feedCanvas) {
  const SW = 1080, SH = 1920;
  const sc = document.createElement('canvas');
  sc.width = SW; sc.height = SH;
  const ctx = sc.getContext('2d');

  // 배경: 다크 그라데이션
  const grad = ctx.createLinearGradient(0, 0, 0, SH);
  grad.addColorStop(0, '#0f0608');
  grad.addColorStop(1, '#1a0810');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SW, SH);

  // 피드 이미지 중앙 배치 (1080x1080 → 세로 중앙)
  const imgSize = SW; // 1080
  const imgY = (SH - imgSize) / 2; // 420
  ctx.drawImage(feedCanvas, 0, imgY, imgSize, imgSize);

  // 상단 브랜딩 텍스트
  ctx.fillStyle = 'rgba(241,128,145,0.9)';
  ctx.font = 'bold 36px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('잇데이 STUDIO', SW / 2, imgY - 40);

  return new Promise(resolve => sc.toBlob(resolve, 'image/png'));
}

function copyCaption() {
  navigator.clipboard.writeText(document.getElementById('captionText').value)
    .then(() => showToast('글 복사 완료! 📋'));
}
function copyAll() {
  const c = document.getElementById('captionText').value;
  const h = document.getElementById('captionHash').value;
  navigator.clipboard.writeText(c + '\n\n' + h).then(() => showToast('전체 복사 완료! 📋'));
}
function flashBtn(btn, msg) {
  const orig = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => btn.textContent = orig, 1500);
}

// ===== Before/After =====
const imgs = { before: null, after: null };

function loadImage(input, side) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      imgs[side] = img;
      const preview = document.getElementById(side + 'Preview');
      const area = document.getElementById(side + 'Area');
      preview.src = e.target.result;
      preview.style.display = 'block';
      area.style.display = 'none';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function renderBA() {
  if (!imgs.before || !imgs.after) {
    showToast('Before, After 사진을 모두 선택해주세요');
    return;
  }
  const layout = document.querySelector('.style-opts .style-opt.on[data-v]') ?
    document.querySelectorAll('.style-opts .style-opt.on')[0].dataset.v : 'side';
  const wm = document.querySelectorAll('.style-opts .style-opt.on')[1]?.dataset.v || 'wm1';

  const canvas = document.getElementById('baCanvas');
  const ctx = canvas.getContext('2d');

  let W, H;
  if (layout === 'side' || layout === 'square') {
    W = 1080; H = 1080;
  } else {
    W = 1080; H = 1350;
  }
  canvas.width = W; canvas.height = H;
  canvas.style.display = 'block';

  ctx.fillStyle = '#0f0608';
  ctx.fillRect(0, 0, W, H);

  function drawCropped(img, x, y, w, h) {
    const scale = Math.max(w / img.width, h / img.height);
    const sw = w / scale, sh = h / scale;
    const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  const PAD = 6;
  if (layout === 'side' || layout === 'square') {
    const hw = (W - PAD * 3) / 2;
    const ih = H - PAD * 2 - 80;
    drawCropped(imgs.before, PAD, PAD, hw, ih);
    drawCropped(imgs.after, PAD * 2 + hw, PAD, hw, ih);
    // 라벨
    const ly = ih + PAD + 10;
    drawLabel(ctx, 'BEFORE', PAD + hw / 2, ly, W);
    drawLabel(ctx, 'AFTER ✨', PAD * 2 + hw + hw / 2, ly, W);
  } else {
    const hh = (H - PAD * 3 - 80) / 2;
    drawCropped(imgs.before, PAD, PAD, W - PAD * 2, hh);
    drawCropped(imgs.after, PAD, PAD * 2 + hh, W - PAD * 2, hh);
    drawLabel(ctx, 'BEFORE', W / 2, hh + PAD + 14, W);
    drawLabel(ctx, 'AFTER ✨', W / 2, hh * 2 + PAD * 2 + 14, W);
  }

  // 워터마크
  if (wm !== 'wm0') {
    const wmText = wm === 'wm1' ? '🎀 @itdasy' : '잇데이 붙임머리';
    ctx.fillStyle = 'rgba(232,160,176,0.9)';
    ctx.font = '500 28px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(wmText, W / 2, H - 22);
  }

  // 인스타 발행 미리보기 세팅 (캡션 + 해시태그 합체)
  const c = document.getElementById('captionText').value;
  const h = document.getElementById('captionHash').value;
  const previewArea = document.getElementById('publishConfirmArea');
  const previewInput = document.getElementById('publishCaptionPreview');

  if (c && !c.includes("생성된 글이 여기에 나타납니다")) {
      previewInput.value = c + "\n\n" + h;
      previewArea.style.display = 'block';
  } else {
      previewArea.style.display = 'block';
      previewInput.value = '⚠️ 아직 글을 만들지 않으셨어요.\n\n사진만 올라갑니다. 첫 번째 탭에서 글을 먼저 만드시는 걸 추천드려요!';
  }

  document.getElementById('publishArea').style.display = 'block';
}

function resetBA() {
  imgs.before = null; imgs.after = null;
  document.getElementById('beforePreview').style.display = 'none';
  document.getElementById('afterPreview').style.display = 'none';
  document.getElementById('beforeArea').style.display = 'block';
  document.getElementById('afterArea').style.display = 'block';
  document.getElementById('baCanvas').style.display = 'none';
  document.getElementById('saveBtn').style.display = 'none';
  document.getElementById('resetBaBtn').style.display = 'none';
  document.getElementById('publishConfirmArea').style.display = 'none';
  document.getElementById('publishArea').style.display = 'none';
  document.querySelectorAll('#tab-ba input[type=file]').forEach(i => i.value = '');
}

function drawLabel(ctx, text, x, y, W) {
  ctx.fillStyle = 'rgba(15,6,8,0.7)';
  ctx.roundRect(x - 70, y - 22, 140, 34, 17);
  ctx.fill();
  ctx.fillStyle = '#f0e8ea';
  ctx.font = '500 18px "Noto Sans KR", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
}

function saveCanvas() {
  const canvas = document.getElementById('baCanvas');
  const a = document.createElement('a');
  a.download = 'itdasy_ba_' + Date.now() + '.jpg';
  a.href = canvas.toDataURL('image/jpeg', 0.92);
  a.click();
}

function createConfetti() {
  const c = document.createElement('div');
  c.textContent = ['🎀','✨','💎','🩷'][Math.floor(Math.random()*4)];
  c.className = 'confetti';
  c.style.left = Math.random() * 100 + 'vw';
  c.style.animationDuration = Math.random() * 2 + 3 + 's';
  document.body.appendChild(c);
  setTimeout(() => c.remove(), 5000);
}

// ═══════════════════════════════════════════════════════
// 캡션 완료 후 액션바 (갤러리 저장 + 다음 손님 유도)
// ═══════════════════════════════════════════════════════
// 마지막 생성 payload 저장 (재생성용)
let _lastGeneratePayload = null;

// 피드백 #13: 캡션 생성 후 인스타 피드 미리보기 (스마트폰 프레임 시뮬)
function _previewCaptionOnInsta() {
  const caption = document.getElementById('captionText')?.value || '';
  const hash    = document.getElementById('captionHash')?.value || '';
  const handle  = (window._instaHandle || 'itdasy').replace('@', '');

  // 현재 선택된 슬롯의 첫 사진을 미리보기에 사용
  let previewImg = '';
  if (typeof _captionSlotId !== 'undefined' && _captionSlotId && typeof _slots !== 'undefined') {
    const slot = _slots.find(s => s.id === _captionSlotId);
    if (slot) {
      const p = (slot.photos || []).find(x => !x.hidden) || slot.photos?.[0];
      if (p) previewImg = p.editedDataUrl || p.dataUrl;
    }
  }

  let pop = document.getElementById('_capInstaPreview');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = '_capInstaPreview';
    pop.style.cssText = 'display:none;position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,0.82);align-items:center;justify-content:center;padding:14px;';
    pop.onclick = e => { if (e.target === pop) pop.style.display = 'none'; };
    document.body.appendChild(pop);
  }
  const hashHtml = hash ? hash.split(/\s+/).filter(Boolean).map(h => {
    const clean = h.startsWith('#') ? h : '#' + h;
    return `<span style="color:#1e7abf;">${clean}</span>`;
  }).join(' ') : '';
  pop.innerHTML = `
    <div style="width:100%;max-width:360px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,0.5);font-family:-apple-system,sans-serif;">
      <!-- 인스타 헤더 -->
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #dbdbdb;">
        <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045);padding:2px;"><div style="width:100%;height:100%;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;">🎀</div></div>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:700;">${handle}</div>
          <div style="font-size:10px;color:#888;">Sponsored · 서울</div>
        </div>
        <div style="font-size:18px;color:#262626;">⋯</div>
      </div>
      <!-- 이미지 -->
      <div style="width:100%;aspect-ratio:1/1;background:#000;display:flex;align-items:center;justify-content:center;">
        ${previewImg
          ? `<img src="${previewImg}" style="width:100%;height:100%;object-fit:cover;">`
          : `<div style="color:#888;font-size:12px;">작업실에서 사진을 먼저 선택해주세요</div>`}
      </div>
      <!-- 하단 아이콘 -->
      <div style="display:flex;gap:14px;padding:8px 12px;font-size:22px;">
        ❤️ 💬 ✈️ <span style="flex:1;"></span> 🔖
      </div>
      <!-- 캡션 -->
      <div style="padding:4px 12px 12px;font-size:12px;line-height:1.5;color:#262626;max-height:220px;overflow-y:auto;">
        <b>${handle}</b> <span style="white-space:pre-wrap;">${(caption || '(캡션 없음)').replace(/</g,'&lt;')}</span>
        ${hashHtml ? '<div style="margin-top:6px;word-break:break-word;">' + hashHtml + '</div>' : ''}
      </div>
      <div style="padding:10px 12px;border-top:1px solid #efefef;display:flex;gap:8px;">
        <button onclick="document.getElementById('_capInstaPreview').style.display='none'" style="flex:1;min-height:40px;padding:10px;border-radius:10px;border:1px solid #dbdbdb;background:#fff;font-size:12px;font-weight:700;cursor:pointer;">닫기</button>
        <button onclick="publishFromCaption();document.getElementById('_capInstaPreview').style.display='none'" style="flex:1;min-height:40px;padding:10px;border-radius:10px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:12px;font-weight:800;cursor:pointer;">이대로 올리기</button>
      </div>
    </div>
  `;
  pop.style.display = 'flex';
}

async function regenerateCaption(overrides = {}) {
  if (!_lastGeneratePayload) {
    showToast('먼저 캡션을 한 번 생성해주세요');
    return;
  }
  const payload = { ..._lastGeneratePayload, ...overrides };
  _lastGeneratePayload = payload;
  const ta = document.getElementById('captionText');
  if (ta) { ta.value = '✨ 새로 쓰는 중…'; _capAutoGrow(ta); }
  try {
    const res = await _personaFetch('POST', '/persona/generate', payload);
    const data = await res.json();
    if (!res.ok) {
      showToast(_CAP_ERR_MSG[data.code || data.detail] || '재생성 실패');
      if (ta) ta.value = '';
      return;
    }
    _capAiDraft = data.caption || '';
    _lastLogId = data.log_id || null;
    if (ta) { ta.value = _capAiDraft; _capAutoGrow(ta); }
    _renderCaptionActionBar(_capAiDraft, '');
  } catch (e) {
    showToast('네트워크 오류. 다시 시도해주세요');
  }
}

function _renderCaptionActionBar(caption, hashtags) {
  const actionBar = document.getElementById('captionActionBar');
  if (!actionBar) return;

  // 슬롯 진행 현황
  let doneCount = 0, totalCount = 0, nextSlot = null;
  if (typeof _slots !== 'undefined' && _slots.length > 0) {
    doneCount = _slots.filter(s => s.status === 'done').length;
    totalCount = _slots.length;
    nextSlot = _slots.find(s => s.status !== 'done' && s.photos.length > 0);
  }

  const hasNextSlot = !!nextSlot;
  const progressText = totalCount > 0 ? `(완료 ${doneCount}/${totalCount})` : '';
  const _btnBase = 'min-height:44px;padding:10px 12px;border-radius:10px;border:1.5px solid var(--border);background:#fff;color:var(--text);font-size:12px;font-weight:700;cursor:pointer;';

  actionBar.style.display = 'block';
  actionBar.innerHTML = `
    <!-- 재생성 옵션 4종 (Apple HIG 44pt 보장) + 첫 사용 툴팁 -->
    <div style="background:rgba(241,128,145,0.06);border:1.5px solid rgba(241,128,145,0.2);border-radius:14px;padding:12px;margin-bottom:10px;">
      <div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:8px;">마음에 안 드시면 다시 써드릴게요 <span style="color:var(--text3);font-weight:500;">· 각 버튼 누르면 조건만 바꿔 재생성</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
        <button onclick="regenerateCaption({})" title="같은 조건으로 한 번 더 생성" style="${_btnBase}">🔄 다시 생성</button>
        <button onclick="regenerateCaption({length_tier:'short'})" title="1~2문장으로 압축" style="${_btnBase}">📏 더 짧게</button>
        <button onclick="regenerateCaption({length_tier:'long'})" title="상세 설명·스토리 포함" style="${_btnBase}">📖 더 길게</button>
        <button onclick="regenerateCaption({tone_override:'ornate'})" title="이모지·감탄사 풍성하게" style="${_btnBase}">💕 더 친근하게</button>
      </div>
      ${localStorage.getItem('_regen_hint_shown') ? '' : `
      <div id="_regenFirstHint" style="margin-top:10px;padding:8px 10px;background:#fff5f7;border-radius:8px;font-size:11px;color:var(--accent);display:flex;align-items:center;gap:6px;">
        <span>💡 각 버튼 <b>꾹 누르면</b> 뭘 바꾸는지 설명 뜹니다</span>
      </div>
      `}
    </div>
    <script>if(!localStorage.getItem('_regen_hint_shown')){localStorage.setItem('_regen_hint_shown','1');setTimeout(()=>{const e=document.getElementById('_regenFirstHint');if(e)e.style.display='none';},8000);}</script>

    <div style="background:rgba(76,175,80,0.08);border:1.5px solid rgba(76,175,80,0.25);border-radius:14px;padding:14px;margin-bottom:10px;">
      <div style="font-size:12px;font-weight:700;color:#388e3c;margin-bottom:10px;">✅ 캡션 생성 완료!</div>
      <!-- 피드백 #13: 인스타 피드 미리보기 버튼 복원 -->
      <button onclick="_previewCaptionOnInsta()" style="width:100%;min-height:48px;padding:12px;border-radius:12px;border:1.5px solid #833ab4;background:#fff;color:#833ab4;font-size:13px;font-weight:800;cursor:pointer;margin-bottom:8px;">📱 인스타 피드 미리보기</button>
      <button onclick="saveCaptionToGallery()" style="width:100%;min-height:48px;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,#4caf50,#388e3c);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">📁 갤러리에 저장하기</button>
    </div>
    ${hasNextSlot ? `
    <div style="background:rgba(241,128,145,0.07);border:1.5px solid rgba(241,128,145,0.2);border-radius:14px;padding:14px;">
      <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:10px;">다음 손님 글 써볼까요? ${progressText}</div>
      <div style="display:flex;gap:8px;">
        <button onclick="goToNextSlotCaption('${nextSlot.id}')" style="flex:1;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:13px;font-weight:700;cursor:pointer;">${nextSlot.label} 글쓰기 →</button>
        <button onclick="showTab('finish',document.querySelectorAll('.nav-btn')[4]); initFinishTab();" style="padding:12px 16px;border-radius:12px;border:1.5px solid var(--border);background:transparent;color:var(--text2);font-size:12px;font-weight:600;cursor:pointer;">마무리로 →</button>
      </div>
    </div>
    ` : `
    <div style="display:flex;gap:8px;">
      <button onclick="showTab('finish',document.querySelectorAll('.nav-btn')[4]); initFinishTab();" style="flex:1;padding:12px;border-radius:14px;border:1.5px solid rgba(241,128,145,0.3);background:transparent;color:var(--accent);font-size:13px;font-weight:700;cursor:pointer;">마무리로 이동 →</button>
      <button onclick="publishFromCaption()" style="flex:1;padding:12px;border-radius:14px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:13px;font-weight:800;cursor:pointer;">지금 바로 올리기</button>
    </div>
    `}
  `;
}

// 다음 슬롯으로 이동해서 캡션 작성
function goToNextSlotCaption(slotId) {
  if (typeof loadSlotForCaption === 'function') {
    loadSlotForCaption(slotId);
  }
  const ta = document.getElementById('captionText');
  if (ta) { ta.value = ''; _capAutoGrow(ta); }
  document.getElementById('captionActionBar').style.display = 'none';
  const micro = document.getElementById('captionEditMicro');
  if (micro) micro.style.display = 'none';
  _lastLogId = null;
  _captionPhotosReordered = null;
  _renderCaptionPhotoRow();
  // 태그 선택 해제
  document.querySelectorAll('#typeTags .tag.on').forEach(t => t.classList.remove('on'));
  // 스크롤 맨 위로
  document.getElementById('tab-caption').scrollTo({ top: 0, behavior: 'smooth' });
}

// 갤러리에 캡션 저장
async function saveCaptionToGallery() {
  if (typeof _captionSlotId === 'undefined' || !_captionSlotId) {
    showToast('먼저 작업실 슬롯을 선택해주세요');
    return;
  }
  const slot = typeof _slots !== 'undefined' ? _slots.find(s => s.id === _captionSlotId) : null;
  if (!slot) {
    showToast('슬롯을 찾을 수 없어요');
    return;
  }

  // 선택된 키워드를 태그로 변환
  const selectedTags = getSel('typeTags');
  slot.tags = selectedTags;
  slot.caption = document.getElementById('captionText').value;
  slot.hashtags = document.getElementById('captionHash').value;

  try {
    if (typeof saveToGallery === 'function') {
      await saveToGallery(slot);
    }
    if (typeof saveSlotToDB === 'function') {
      await saveSlotToDB(slot);
    }
    showToast('갤러리에 저장됐어요 📁');

    // 저장 완료 후 다음 손님 유도 갱신
    _renderCaptionActionBar(slot.caption, slot.hashtags);
  } catch(e) {
    showToast('저장 실패: ' + e.message);
  }
}
