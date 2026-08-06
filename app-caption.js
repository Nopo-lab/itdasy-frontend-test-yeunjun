// Itdasy Studio - 캡션 생성 (슬롯머신, 톤 컨트롤, 해시태그)

// [SEC-R2-1] HTML 이스케이프 유틸
function _capEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

// ═══════════════════════════════════════════════════════
// [출시 QA 2026-08-07] **타임아웃이 없었다.** 프록시·LB 가 응답을 매달아두면(끊김 아님)
//   이 fetch 는 영영 settle 되지 않고, 화면은 "잇비가 우리샵 말투로 쓰는 중…" 에 갇힌다.
//   flow 쪽 130초 워치독이 있긴 한데 그건 **마지막 토큰**에만 걸려서, 재생성으로 토큰이
//   올라가면 앞선 요청의 로딩은 아무도 치우지 않는다(실측: 2분 넘게 잔류).
//   요청 자체에 상한을 둬서 반드시 끝나게 한다. 120초는 app-core 의 LLM 경로 타임아웃과
//   같은 값 — 캡션 생성은 15~60초가 정상이라 정상 응답을 자르지 않는다.
const _PERSONA_TIMEOUT_MS = 120000;

async function _personaFetch(method, path, body) {
  const headers = window.authHeader ? window.authHeader() : {};
  if (body) headers['Content-Type'] = 'application/json';
  const url = (window.API || '') + path;
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), _PERSONA_TIMEOUT_MS) : null;
  let res;
  try {
    res = await fetch(url, {
      method, headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl ? ctl.signal : undefined,
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('시간이 너무 오래 걸려요 — 잠시 후 다시 시도해 주세요');
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (res.status === 401) throw new Error('401');
  // 비-JSON 응답(Cloud Run/LB 의 HTML 502·504)이면 data 가 {} 라 detail 이 없다 → 아래에서 'HTTP 502'.
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

// ===== 시술 키워드 태그(SHOP_KEYWORDS+localStorage+UI) → js/caption/caption-keyword-tags.js 로 분리(B-분할) =====

// ===== 해시태그 셔플 믹싱 =====
// 이전에 사용한 태그 순서 기록 → 매번 다른 조합·순서로 노출
function shuffleHashtags(tags) {
  if (!tags || tags.length === 0) return tags;

  // 이전 사용 기록 로드
  let history = [];
  try { history = JSON.parse(localStorage.getItem('itdasy_hash_history') || '[]'); } catch(_) { /* ignore */ }

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

// ===== 캡션 로딩 팝업(슬롯머신) → js/caption/caption-loader-ui.js 로 분리(B-분할) =====
// ===== 온보딩 캡션 테스트 팝업 → js/caption/caption-onboarding.js 로 분리(B-분할) =====

// ===== 캡션 탭 사진 영역(드래그 순서) → js/caption/caption-photo-row.js 로 분리(B-분할) =====

// ===== 편집 로그 PATCH (debounce 800ms) =====
let _lastLogId = null;     // 최근 생성된 generation_log.id
let _capAiDraft = '';      // AI 초안 원본 (edited_amount 계산용)
let _capPatchTimer = null;

function _capAutoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 400) + 'px';
}

function _capSchedulePatch(text) {
  // 백엔드 PATCH는 _lastLogId 있을 때만, 슬롯 로컬 동기화는 항상 시도
  clearTimeout(_capPatchTimer);
  _capPatchTimer = setTimeout(() => _capPatchLog(text), 800);
}

async function _capPatchLog(text) {
  const trimmed = (text || '').trim();

  // 1) 슬롯 로컬 동기화 — 사용자가 직접 글 쓰면 슬롯에 저장하고 마무리 탭에서 인식되게
  try {
    if (typeof _captionSlotId !== 'undefined' && _captionSlotId && typeof _slots !== 'undefined') {
      const slot = _slots.find(s => s.id === _captionSlotId);
      if (slot) {
        slot.caption = text || '';
        const haEl = document.getElementById('captionHash');
        if (haEl) slot.hashtags = haEl.value || '';
        if (trimmed) {
          slot.status = 'done';
          slot.completedAt = slot.completedAt || Date.now();
        }
        if (typeof saveSlotToDB === 'function') {
          try { await saveSlotToDB(slot); } catch (_e) { /* IndexedDB 일시 실패 무시 */ }
        }
      }
    }
  } catch (_e) { /* 슬롯 동기화 실패해도 PATCH는 시도 */ }

  // 2) 백엔드 generation_log PATCH — log_id 있을 때만
  if (!_lastLogId || !trimmed) return;
  // edited_amount: 글자 차이 % (간단 추정)
  const pct = _capAiDraft
    ? Math.round(Math.abs(text.length - _capAiDraft.length) / Math.max(_capAiDraft.length, 1) * 100)
    : 0;
  const pctEl = document.getElementById('captionEditPct');
  if (pctEl) pctEl.textContent = pct > 0 ? `${pct}% 수정됨` : '';

  try {
    await _personaFetch('PATCH', `/persona/generation_logs/${_lastLogId}`, { final_text: text });
  } catch(_e) { /* 조용히 실패 */ }
}

// ===== 캡션 키워드 태그 UI → js/caption/caption-keyword-tags.js 로 분리(B-분할) =====

// ===== 캡션 생성 — POST /persona/generate =====
// TD-020: POST /persona/generate 해시태그 반환 필드 추가 필요

// [v561] 업종 미매핑 시 'extension'(붙임머리)으로 폴백하던 버그 — 타업종(헤어/네일/속눈썹) 입력에도
//   붙임머리 few-shot/고정문구가 누출(백엔드는 category 로 과거글 버킷을 고름).
// [2026-07-23] 자체 키워드 표를 버리고 js/service-categories.js(백엔드 config/services.py 복제본)를
//   쓴다. 예전엔 분류가 앱 안에 5벌 따로 있어서 속눈썹·왁싱·반영구가 전부 'makeup' 한 통에 들어갔다.
//   그리고 폴백을 'hair' → null 로 바꿨다 — 시술어를 못 알아봤는데 헤어라고 우기면
//   네일샵 원장님이 헤어 few-shot 을 받는다. 미지정이면 백엔드가 전체 풀에서 뽑는다.
function _inferCaptionCategory(shopType, userText) {
  const SC = window.ServiceCategories;
  const text = String(userText || '') + ' ' + String(shopType || '');
  if (!SC) {
    // 로더 순서 사고 대비 — 사전이 없으면 억지 추론 대신 미지정(백엔드가 전체 풀 사용).
    console.warn('[caption] ServiceCategories 미로드 — 카테고리 미지정으로 진행');
    return null;
  }
  return SC.infer(text);
}

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
  title.id = 'capScenarioTitle';
  title.style.cssText = 'font-size:17px;font-weight:800;color:#1a1a1a;margin-bottom:6px;';
  title.textContent = '어떤 상황이에요?';
  sheet.appendChild(title);

  // [2026-04-26] 프로필·말투 학습 미완성이어도 캡션 생성은 진행됨. 부드러운 유도 한 줄.
  const hasIdentity = !!localStorage.getItem('shop_type');
  const hasInsta = !!(typeof window !== 'undefined' && window._instaHandle);
  if (!hasIdentity || !hasInsta) {
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:12px;color:#888;margin-bottom:14px;line-height:1.5;';
    hint.textContent = !hasIdentity
      ? '프로필을 완성하면 사장님 말투로 더 정교하게 만들어드려요.'
      : '인스타 연동 + 말투 학습이 끝나면 더 자연스러운 글이 나와요.';
    sheet.appendChild(hint);
  }

  const selectorWrap = document.createElement('div');
  sheet.appendChild(selectorWrap);

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) _closeCaptionScenarioPopup(overlay);
  });

  window.renderScenarioSelector(selectorWrap, async (result) => {
    selectorWrap.innerHTML = '<div style="text-align:center;padding:32px 0;color:var(--text-subtle);font-size:14px;">캡션 만드는 중...</div>';
    title.textContent = '잠깐만요!';
    // selectorWrap = 인라인 결과 host (글쓰기 화면이 닫혀 있을 때 시트 안에서 결과 노출용)
    await _doGenerateCaption(result, () => _closeCaptionScenarioPopup(overlay), selectorWrap);
  });
}

function _closeCaptionScenarioPopup(overlay) {
  overlay.style.opacity = '0';
  overlay.style.transition = 'opacity .15s';
  setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 160);
  const btn = document.getElementById('captionBtn');
  if (btn) { btn.innerHTML = '만들기'; btn.disabled = false; }
}

async function _doGenerateCaption(scenario, closePopup, inlineHost) {
  const btn = document.getElementById('captionBtn');
  if (btn) btn.disabled = true;

  showCaptionLoader();

  const shopType = localStorage.getItem('shop_type') || '붙임머리';
  // [2026-06-12] shop_type 이 SHOP_CONFIG 에 없으면(예: 'beauty') 붙임머리 cfg+defaultTag('24인치')
  //   강제 폴백 → "인치 선택: 24인치" 가 들어가 업종 무관 붙임머리 캡션이 나오던 버그.
  //   미매핑 업종은 중립 문구로, defaultTag·업종 라벨(인치 등) 주입 금지.
  const cfg = SHOP_CONFIG[shopType];
  const types = getSel('typeTags');
  // 매핑된 업종만 "업종 시술. 라벨: 태그." / 미매핑은 "뷰티 시술." + 사용자가 직접 고른 태그만.
  const baseContext = cfg
    ? `${shopType} 시술. ${cfg.tagLabel}: ${types.length > 0 ? types.join(', ') : cfg.defaultTag}.`
    : (types.length > 0 ? `뷰티 시술. 선택: ${types.join(', ')}.` : '뷰티 시술.');

  // 작업실 슬롯 연결 정보
  const slotNote = (typeof _captionSlotId !== 'undefined' && _captionSlotId && typeof _slots !== 'undefined')
    ? (() => { const s = _slots.find(sl => sl.id === _captionSlotId); return s ? `손님: ${s.label}. 사진 ${s.photos.filter(p=>!p.hidden).length}장. ` : ''; })()
    : '';

  const axes = (scenario && scenario.axes) ? scenario.axes : {};
  const axesText = axes.customer
    ? `${axes.customer} 손님. ${axes.situation}. ${axes.photo}.`
    : '';
  const specialText = (scenario && scenario.special_context) ? String(scenario.special_context).trim() : '';

  // [v557 근본수정] 사용자가 직접 입력한 시술 문구를 '현재 시술'의 유일 출처로 우선한다.
  //   (기존 버그) shop 보일러플레이트("<업종> 시술. 인치: 24인치")가 photo_context 앞에 붙고
  //   사용자 입력은 뒤에 special_context 로만 들어가, 업종 무관 캡션(예: '젤네일' 입력 → 붙임머리 캡션)이 나왔다.
  //   원인: ① 사용자 입력이 authoritative 한 treatment_keyword 로 안 감 ② defaultTag(24인치 등) 가 본문을 끌고감.
  //   수정: 사용자 입력(시술 문구 or 선택 태그) = treatment_keyword + photo_context 리드. 업종 defaultTag 미주입.
  const userTx = specialText || (types && types.length ? types.join(', ') : '');
  // [v561] 카테고리 = 시술 입력 텍스트 + 업종 추론 (붙임머리 자동 폴백 제거).
  const category = _inferCaptionCategory(shopType, userTx);
  let photo_context;
  if (userTx) {
    photo_context = `${userTx}. ${slotNote}${axesText}`.replace(/\s+/g, ' ').trim();
  } else {
    // 사용자 입력이 전혀 없을 때만 업종 기본 맥락(샵 정체성은 백엔드 identity 블록에도 있음).
    photo_context = `${baseContext} ${slotNote}${axesText}`.replace(/\s+/g, ' ').trim();
  }
  const length_tier   = 'medium';
  // [v555/v558] 말투 카드 선택값(없으면 추천 기본값 natural). regenerate 도 이 payload 를 상속.
  const tone_override = (window._selectedTone || 'natural');

  const payload = { category, photo_context, length_tier, tone_override };
  // [v557] 사용자 시술 문구를 authoritative 키워드로 전달 → 백엔드가 본문/해시태그에 우선 반영(보일러플레이트 무시).
  if (userTx) payload.treatment_keyword = userTx.slice(0, 80);
  _lastGeneratePayload = payload;  // 재생성 버튼용
  if (typeof window._assertSpec === 'function') window._assertSpec('POST /persona/generate', payload);

  try {
    // [2026-04-26 픽스] _personaFetch는 이미 파싱된 JSON을 반환한다.
    // 기존 코드는 res.json() 을 한 번 더 호출해서 TypeError 가 나면서 '잠시 후 다시 시도'
    // 폴백 토스트가 떴다. 본질적인 캡션 생성 실패 메시지를 사용자에게 정확히 노출하기 위해
    // 직접 data 로 받는다. (HTTP 에러는 _personaFetch 내부에서 throw → catch 블록에서 처리)
    const data = await _personaFetch('POST', '/persona/generate', payload);

    const finalCaption = data.caption || '';
    // 2026-05-01 ── 백엔드 GenerateResponse 에 hashtags 필드 추가 후 반영.
    // persona.hashtags (사용자 등록 top20) 또는 SHOP_DEFAULT_HASHTAGS 폴백.
    const hashtagsArr = shuffleHashtags(Array.isArray(data.hashtags) ? data.hashtags : []);
    // [버그수정 2026-07-06] core(앞3)+pool 합류 시 중복 태그가 '#네일 #네일' 로 두 번 렌더되던 것 — 정규화 dedup.
    const _seenHash = new Set();
    const hashes = hashtagsArr
      .map(t => String(t || '').trim().replace(/^#+/, ''))
      .filter(t => { if (!t) return false; const k = t.toLowerCase(); if (_seenHash.has(k)) return false; _seenHash.add(k); return true; })
      .map(t => '#' + t)
      .join(' ');

    // [2026-04-26] 백엔드가 200 OK + 빈 caption 응답 → 사용자에겐 빈 textarea 만 남음.
    // 명시적 에러로 던져 catch 블록에서 안내하도록.
    if (!finalCaption.trim()) {
      console.error('[caption.generate] 빈 캡션 응답 — payload:', payload, 'response:', data);
      throw new Error('AI 가 캡션을 만들지 못했어요. 다시 시도해주세요.');
    }

    // TD-022: 응답에 log_id 없음 — 백엔드 GenerateResponse에 log_id 필드 추가 필요
    if (data.log_id) {
      _lastLogId = data.log_id;
    } else {
      console.warn('[TD-022] log_id missing in POST /persona/generate response — PATCH 비활성');
      _lastLogId = null;
    }
    _capAiDraft = finalCaption;

    // WIRING 디버그 로그 제거 (프로덕션 환경 민감 정보 노출 방지)

    hideCaptionLoader(true, () => {
      // 피드백 #1 3단계: 첫 캡션 완성 플래그 (인디케이터 3단계 표시용)
      if (!localStorage.getItem('_first_caption_done')) {
        localStorage.setItem('_first_caption_done', new Date().toISOString());
      }
      // 글쓰기 화면 textarea 에 값 채움(숨겨져 있어도) — 복사/미리보기/더손보기 가 이 값을 재사용.
      const ta = document.getElementById('captionText');
      if (ta) { ta.value = finalCaption; _capAutoGrow(ta); }
      const hashEl = document.getElementById('captionHash');
      if (hashEl) hashEl.value = hashes;

      // 작업실 슬롯 연결 저장 (기존)
      if (typeof _captionSlotId !== 'undefined' && _captionSlotId && typeof _slots !== 'undefined') {
        const slot = _slots.find(s => s.id === _captionSlotId);
        if (slot) {
          slot.caption = finalCaption;
          slot.hashtags = hashes;
          // 캡션 생성되면 슬롯 자동으로 '완료' 상태로 — 마무리 탭에서 인식되도록
          if (finalCaption && finalCaption.trim()) {
            slot.status = 'done';
            slot.completedAt = slot.completedAt || Date.now();
          }
          if (typeof saveSlotToDB === 'function') saveSlotToDB(slot).catch(() => {});
        }
      }

      // [2026-06-12] 리포트→"내 말투로 글 써보기" 처럼 글쓰기 화면(tab-caption)이 닫혀 있으면
      //   #captionText 에 써도 화면에 안 보여 결과가 유실되던 버그. 글쓰기 화면이 비활성이면
      //   팝업을 닫지 말고 시트 안에서 결과를 바로 노출 (UX 원칙: 화면 이동 금지, 인라인 우선).
      const writingActive = !!(ta && ta.offsetParent !== null);
      if (!writingActive && inlineHost) {
        _renderInlineCaptionResult(inlineHost, finalCaption, hashes, closePopup);
        if (btn) { btn.innerHTML = '만들기'; btn.disabled = false; }
        return;
      }

      // ── 글쓰기 화면 활성 경로 (기존)
      closePopup();
      const micro = document.getElementById('captionEditMicro');
      if (micro) micro.style.display = _lastLogId ? 'flex' : 'none';
      _renderCaptionActionBar(finalCaption, hashes);
      if (btn) { btn.innerHTML = '만들기'; btn.disabled = false; }

      // [2026-05-05 19차-B] 인스타 시뮬 사진 미리보기 업데이트
      try { _updateCaptionPreviewImage(); } catch (_e) { void _e; }

      // [2026-04-24] 캡션 렌더 후 미리보기 프레임으로 스크롤 — 사용자 시선 유도
      const frame = document.getElementById('captionResult');
      if (frame && typeof frame.scrollIntoView === 'function') {
        setTimeout(() => frame.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
      }
    });
  } catch(e) {
    if (e && e.message === '401') return; // _personaFetch가 401 처리
    // [2026-04-24] 명확한 에러 진단 — '일시적 오류' 일괄 표시 제거
    // [2026-04-26] raw 메시지를 항상 console.error 로 남겨 개발자 디버깅 가능하게.
    console.error('[caption.generate] 실패 raw:', e);
    const raw = (e && (e.message || e.toString())) || '';

    // [2026-04-26] quota_exceeded:caption:<limit> 패턴 처리 — 한도 안내
    const quotaMatch = raw.match(/quota_exceeded:caption(?::(\d+))?/i);
    let userMsg;
    if (quotaMatch) {
      const limit = quotaMatch[1] || '3';
      userMsg = `오늘 캡션 한도(${limit}회) 다 쓰셨어요. 내일 다시 시도하거나 잇데이 멤버십을 확인해 주세요.`;
    } else if (/quota_exceeded/i.test(raw)) {
      userMsg = '오늘 사용 한도를 다 쓰셨어요. 내일 다시 시도해 주세요.';
    } else if (/^캡션 생성 실패/.test(raw)) {
      // 백엔드가 명시한 정확한 원인을 그대로 노출 (디버그 용이)
      userMsg = raw;
    } else if (/consent_missing/i.test(raw)) {
      // [2026-04-26] consent_missing 자동 복구 — 가입 시 자동 동의 백필 전(前) 가입자
      // 보호용. 사용자에게 한 번 컨펌 받고 /persona/consent bulk POST 후 재시도.
      window._inlineConfirm(
        'AI 캡션 만들기에는 개인정보 수집·AI 처리 동의가 필요합니다.\n가입 시 약관에 이미 동의하신 내용입니다. 지금 동의하시겠어요?',
        async () => {
          try {
            await _personaFetch('POST', '/persona/consent', {
              pipa_collect: true,
              ai_processing: true,
              versions: { pipa_collect: '1.0', ai_processing: '1.0' },
            });
            // 재시도 한 번
            hideCaptionLoader(false, () => {});
            showCaptionLoader();
            const retry = await _personaFetch('POST', '/persona/generate', payload);
            const finalCaption2 = retry.caption || '';
            if (retry.log_id) _lastLogId = retry.log_id;
            _capAiDraft = finalCaption2;
            hideCaptionLoader(true, () => {
              closePopup();
              const ta = document.getElementById('captionText');
              if (ta) { ta.value = finalCaption2; _capAutoGrow(ta); }
              const hashEl = document.getElementById('captionHash');
              if (hashEl) hashEl.value = '';
              _renderCaptionActionBar(finalCaption2, '');
              if (btn) { btn.innerHTML = '만들기'; btn.disabled = false; }
            });
          } catch (e2) {
            console.error('[caption.consent.retry] 실패:', e2);
            hideCaptionLoader(false, () => {
              if (window.showToast) window.showToast('동의 처리 후 재시도 실패. 잠시 후 다시 시도해주세요.');
              if (btn) { btn.innerHTML = '만들기'; btn.disabled = false; }
            });
          }
        }
      );
      // 로더 정리 후 리턴 — 동의 거부 시 콜백 미실행이므로 여기서 정리
      hideCaptionLoader(false, () => {});
      if (btn) { btn.innerHTML = '만들기'; btn.disabled = false; }
      return;
    } else if (/Failed to fetch|NetworkError/i.test(raw)) {
      userMsg = '네트워크 연결 확인 후 다시 시도해주세요.';
    } else if (/timeout/i.test(raw)) {
      userMsg = 'AI 응답이 지연되고 있어요. 잠시 후 다시 시도해주세요.';
    } else if (/identity_incomplete/i.test(raw)) {
      // [2026-04-26] 백엔드 신버전은 폴백 처리. 구버전 폴백 메시지는 부드럽게.
      userMsg = '프로필을 완성하면 더 정교한 말투로 만들 수 있어요.';
    } else if (/insufficient_posts|fingerprint_missing/i.test(raw)) {
      userMsg = '인스타 게시물이 더 모이면 사장님 말투에 맞춰 글이 나와요.';
    } else if (/HTTP 5\d\d/i.test(raw)) {
      userMsg = '서버가 잠깐 불안정해요. 1분 후 다시 시도해주세요.';
    } else {
      // 알 수 없는 에러 — 부드러운 폴백 (개발자는 위 console.error 로 확인)
      userMsg = '캡션 만들기 실패. 잠시 후 다시 시도해주세요.';
    }

    hideCaptionLoader(false, () => {
      closePopup();
      // 미리보기 textarea 비어있어도 placeholder 살아남도록 둠
      showToast(userMsg);
    });
  }
}

// [2026-06-12] 글쓰기 화면이 닫혀 있을 때(리포트→글써보기 등) 시나리오 시트 안에서 결과를 바로 노출.
//   캡션+해시태그 텍스트 + [복사] [인스타 미리보기] [글쓰기 화면에서 더 손보기]. 화면 이동 없음.
//   복사/미리보기는 이미 #captionText·#captionHash 에 채워둔 값을 쓰는 기존 함수를 재사용.
function _renderInlineCaptionResult(host, caption, hashes, closePopup) {
  if (!host) return;
  const full = hashes ? `${caption}\n\n${hashes}` : caption;
  const t = document.getElementById('capScenarioTitle');
  if (t) t.textContent = '완성됐어요 ✨';
  host.innerHTML = `
    <div style="white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.7;color:#222;background:#F7F8FA;border-radius:14px;padding:16px;max-height:42vh;overflow-y:auto;-webkit-overflow-scrolling:touch;">${_capEsc(caption)}${hashes ? `<div style="margin-top:12px;color:#1e7abf;">${_capEsc(hashes)}</div>` : ''}</div>
    <div style="display:flex;gap:8px;margin-top:16px;">
      <button data-cap-inline-copy style="flex:1;padding:13px;border-radius:13px;border:1.5px solid var(--border,#E5E7EB);background:#fff;color:#1a1a1a;font-size:13px;font-weight:700;cursor:pointer;">복사</button>
      <button data-cap-inline-preview style="flex:1;padding:13px;border-radius:13px;border:1.5px solid rgba(213,138,149,0.3);background:transparent;color:var(--accent,#BC6675);font-size:13px;font-weight:700;cursor:pointer;">인스타 미리보기</button>
    </div>
    <button data-cap-inline-edit style="width:100%;margin-top:8px;padding:13px;border-radius:13px;border:none;background:linear-gradient(135deg,var(--accent,#BC6675),var(--accent2,#D58A95));color:#fff;font-size:13px;font-weight:800;cursor:pointer;">글쓰기 화면에서 더 손보기</button>
  `;
  host.querySelector('[data-cap-inline-copy]')?.addEventListener('click', () => {
    try {
      navigator.clipboard.writeText(full).then(() => { if (window.showToast) showToast('글 복사 완료! 📋'); });
    } catch (_e) { if (window.showToast) showToast('복사가 안 돼요. 길게 눌러 복사해주세요'); }
  });
  host.querySelector('[data-cap-inline-preview]')?.addEventListener('click', () => {
    try { _previewCaptionOnInsta(); } catch (_e) { if (window.showToast) showToast('미리보기를 열 수 없어요'); }
  });
  host.querySelector('[data-cap-inline-edit]')?.addEventListener('click', () => {
    if (typeof closePopup === 'function') closePopup();
    try { showTab('caption', document.querySelector('.tab-bar__fab[data-tab="caption"]')); } catch (_e) { void _e; }
    // 글쓰기 화면 진입 후 값/액션바/미리보기 동기화
    setTimeout(() => {
      const ta2 = document.getElementById('captionText');
      if (ta2) { ta2.value = caption; _capAutoGrow(ta2); }
      const h2 = document.getElementById('captionHash');
      if (h2) h2.value = hashes || '';
      try { _renderCaptionActionBar(caption, hashes); } catch (_e) { void _e; }
      try { _updateCaptionPreviewImage(); } catch (_e) { void _e; }
      const frame = document.getElementById('captionResult');
      if (frame && typeof frame.scrollIntoView === 'function') {
        setTimeout(() => frame.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
      }
    }, 80);
  });
}


function closePublishPreview() {
  const pop = document.getElementById('publishPreviewPopup');
  pop.querySelector('.popup-content').style.transform = 'scale(0.9)';
  pop.querySelector('.popup-content').style.opacity = '0';
  setTimeout(() => pop.style.display = 'none', 300);
}

// ===== 인스타 발행/업로드팝업/복사/컨페티 → js/caption/caption-publish.js 로 분리(B-분할) =====
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
    return `<span style="color:#1e7abf;">${_capEsc(clean)}</span>`;
  }).join(' ') : '';
  pop.innerHTML = `
    <div style="width:100%;max-width:360px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,0.5);font-family:-apple-system,sans-serif;">
      <!-- 인스타 헤더 -->
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #dbdbdb;">
        <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045);padding:2px;"><div style="width:100%;height:100%;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;">🎀</div></div>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:700;">${_capEsc(handle)}</div>
          <div style="font-size:11px;color:#888;">Sponsored · 서울</div>
        </div>
        <div style="font-size:18px;color:#262626;">⋯</div>
      </div>
      <!-- 이미지 -->
      <div style="width:100%;aspect-ratio:1/1;background:#000;display:flex;align-items:center;justify-content:center;">
        ${previewImg
          ? `<img src="${_capEsc(previewImg)}" alt="" style="width:100%;height:100%;object-fit:cover;">`
          : `<div style="color:#888;font-size:12px;">작업실에서 사진을 먼저 선택해주세요</div>`}
      </div>
      <!-- 하단 아이콘 -->
      <div style="display:flex;gap:14px;padding:8px 12px;font-size:22px;">
        ❤️ 💬 ✈️ <span style="flex:1;"></span> 🔖
      </div>
      <!-- 캡션 -->
      <div style="padding:4px 12px 12px;font-size:12px;line-height:1.5;color:#262626;max-height:220px;overflow-y:auto;">
        <b>${_capEsc(handle)}</b> <span style="white-space:pre-wrap;">${_capEsc(caption || '(캡션 없음)')}</span>
        ${hashHtml ? '<div style="margin-top:6px;word-break:break-word;">' + hashHtml + '</div>' : ''}
      </div>
      <div style="padding:10px 12px;border-top:1px solid #efefef;display:flex;gap:8px;">
        <button data-cap-preview-close style="flex:1;min-height:40px;padding:10px;border-radius:10px;border:1px solid #dbdbdb;background:#fff;font-size:12px;font-weight:700;cursor:pointer;">닫기</button>
        <button data-cap-preview-publish style="flex:1;min-height:40px;padding:10px;border-radius:10px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:12px;font-weight:800;cursor:pointer;">이대로 올리기</button>
      </div>
    </div>
  `;
  pop.querySelector('[data-cap-preview-close]')?.addEventListener('click', () => { pop.style.display = 'none'; });
  pop.querySelector('[data-cap-preview-publish]')?.addEventListener('click', () => {
    publishFromCaption();
    pop.style.display = 'none';
  });
  pop.style.display = 'flex';
}

async function regenerateCaption(overrides = {}) {
  if (!_lastGeneratePayload) {
    showToast('먼저 캡션을 한 번 생성해주세요');
    return;
  }
  const payload = { ..._lastGeneratePayload, ...overrides };
  // [v555] 다시쓰기/더 길게/인스타스럽게에도 현재 선택한 말투 유지(명시 override 우선).
  if (!('tone_override' in overrides) && window._selectedTone) payload.tone_override = window._selectedTone;
  _lastGeneratePayload = payload;
  const ta = document.getElementById('captionText');
  if (ta) { ta.value = '새로 쓰는 중...'; _capAutoGrow(ta); }
  try {
    // [2026-04-26 픽스] _personaFetch 는 이미 파싱된 JSON 반환. res.json() 재호출 버그 제거.
    const data = await _personaFetch('POST', '/persona/generate', payload);
    _capAiDraft = data.caption || '';
    _lastLogId = data.log_id || null;
    if (ta) { ta.value = _capAiDraft; _capAutoGrow(ta); }
    // [버그수정 2026-07-06] 재생성 응답의 해시태그를 무시하고 ''로 덮던 것 — 생성 경로와 동일하게 반영(dedup).
    const _seenRH = new Set();
    const _reHashes = shuffleHashtags(Array.isArray(data.hashtags) ? data.hashtags : [])
      .map(t => String(t || '').trim().replace(/^#+/, ''))
      .filter(t => { if (!t) return false; const k = t.toLowerCase(); if (_seenRH.has(k)) return false; _seenRH.add(k); return true; })
      .map(t => '#' + t).join(' ');
    // 재생성 결과도 슬롯에 반영 + status 갱신
    if (typeof _captionSlotId !== 'undefined' && _captionSlotId && typeof _slots !== 'undefined') {
      const slot = _slots.find(s => s.id === _captionSlotId);
      if (slot) {
        slot.caption = _capAiDraft;
        if (_reHashes) slot.hashtags = _reHashes;
        if (_capAiDraft && _capAiDraft.trim()) {
          slot.status = 'done';
          slot.completedAt = slot.completedAt || Date.now();
        }
        if (typeof saveSlotToDB === 'function') saveSlotToDB(slot).catch(() => {});
      }
    }
    _renderCaptionActionBar(_capAiDraft, _reHashes);
  } catch (e) {
    // [2026-04-26] 재생성 에러도 정확한 원인 노출. raw 는 console 로 디버깅 보조.
    console.error('[caption.regenerate] 실패 raw:', e);
    const raw = (e && (e.message || e.toString())) || '';
    let userMsg;
    const quotaMatch = raw.match(/quota_exceeded:caption(?::(\d+))?/i);
    if (quotaMatch) {
      const limit = quotaMatch[1] || '3';
      userMsg = `오늘 캡션 한도(${limit}회) 다 쓰셨어요. 내일 다시 시도하거나 잇데이 멤버십을 확인해 주세요.`;
    } else if (/^캡션 생성 실패/.test(raw)) {
      userMsg = raw;
    } else if (/Failed to fetch|NetworkError/i.test(raw)) {
      userMsg = '네트워크 오류. 다시 시도해주세요.';
    } else {
      userMsg = '재생성 실패. 잠시 후 다시 시도해주세요.';
    }
    if (ta) ta.value = '';
    showToast(userMsg);
  }
}

function _renderCaptionActionBar(caption, _hashtags) {
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

  actionBar.style.display = 'block';
  actionBar.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--brand-bg);border-radius:10px;font-size:11.5px;color:var(--accent);font-weight:600;margin-bottom:10px;">
      <i class="ph-duotone ph-pencil-simple" style="font-size:14px" aria-hidden="true"></i>
      직접 고치면 AI가 다음에 더 잘 써요
    </div>
    <div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
      <button data-report-ai="caption" data-snippet="${_capEsc(caption || '')}" data-source="/caption/generate" title="AI 캡션 신고" aria-label="AI 캡션 신고"
        style="background:transparent;border:none;cursor:pointer;font-size:13px;color:var(--text-subtle);padding:4px 6px;">🚩 신고</button>
    </div>
    ${hasNextSlot ? `
    <div style="background:rgba(213,138,149,0.07);border:1.5px solid rgba(213,138,149,0.2);border-radius:14px;padding:14px;">
      <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:10px;">다음 손님 글 써볼까요? ${progressText}</div>
      <div style="display:flex;gap:8px;">
        <button data-caption-next-slot="${_capEsc(nextSlot.id)}" style="flex:1;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:13px;font-weight:700;cursor:pointer;">${_capEsc(nextSlot.label)} 글쓰기 →</button>
        <button data-caption-finish style="padding:12px 16px;border-radius:12px;border:1.5px solid var(--border);background:transparent;color:var(--text2);font-size:12px;font-weight:600;cursor:pointer;">마무리로 →</button>
      </div>
    </div>
    ` : `
    <div style="display:flex;gap:8px;">
      <button data-caption-publish-options style="flex:1;padding:12px;border-radius:14px;border:1.5px solid rgba(213,138,149,0.3);background:transparent;color:var(--accent);font-size:13px;font-weight:700;cursor:pointer;">발행 옵션 ▾</button>
      <button data-caption-preview style="flex:1;padding:12px;border-radius:14px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:13px;font-weight:800;cursor:pointer;">인스타에 올리기</button>
    </div>
    `}
  `;
  actionBar.querySelector('[data-caption-publish-options]')?.addEventListener('click', () => {
    if (typeof _captionSlotId !== 'undefined' && _captionSlotId && typeof _showPublishOptions === 'function') {
      _showPublishOptions(_captionSlotId);
    } else {
      showTab('finish', document.querySelector('.tab-bar__btn[data-tab="finish"]'));
      initFinishTab();
    }
  });
  actionBar.querySelector('[data-caption-preview]')?.addEventListener('click', _previewCaptionOnInsta);
  actionBar.querySelector('[data-caption-next-slot]')?.addEventListener('click', event => {
    goToNextSlotCaption(event.currentTarget.dataset.captionNextSlot);
  });
  actionBar.querySelector('[data-caption-finish]')?.addEventListener('click', () => {
    showTab('finish', document.querySelector('.tab-bar__btn[data-tab="finish"]'));
    initFinishTab();
  });
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
  _resetCaptionPhotoOrder();   // [B-분할] 사진순서 상태는 caption-photo-row.js 소유
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
    showToast('저장 실패: ' + (window._humanError ? window._humanError(e) : e.message));
  }
}

// [2026-05-05 19차-B] 인스타 시뮬 — 캡션 결과 위 사진 미리보기 업데이트
// 슬롯 연결돼 있고 사진 있으면 첫 사진 표시 + dots indicator(1/N), 없으면 hide.
function _updateCaptionPreviewImage() {
  const wrap = document.getElementById('captionPreviewImg');
  const imgEl = document.getElementById('captionPreviewImgEl');
  const dots = document.getElementById('captionPreviewDots');
  const icons = document.getElementById('captionPreviewIcons');
  if (!wrap || !imgEl) return;

  const slot = (typeof _captionSlotId !== 'undefined' && _captionSlotId && typeof _slots !== 'undefined')
    ? _slots.find(s => s.id === _captionSlotId) : null;
  const photos = (slot && Array.isArray(slot.photos)) ? slot.photos.filter(p => !p.hidden && (p.dataUrl || p.url)) : [];
  const first = photos[0];
  if (!first) {
    wrap.style.display = 'none';
    if (icons) icons.style.display = 'none';
    return;
  }
  imgEl.src = first.dataUrl || first.url || '';
  wrap.style.display = 'block';
  if (icons) icons.style.display = 'flex';
  if (dots) {
    if (photos.length > 1) {
      dots.textContent = '1/' + photos.length;
      dots.style.display = 'inline-flex';
    } else {
      dots.style.display = 'none';
    }
  }
}
Object.assign(window, {
  showOnboardingCaptionPopup,
  saveOnboardingCaption,
  _capSchedulePatch,
  generateCaption,
  openInstagramProfile,
  closeUploadDone,
  doActualPublish,
  copyCaption,
  copyAll,
  flashBtn,
  regenerateCaption,
  saveCaptionToGallery,
  _updateCaptionPreviewImage,
});

/* [v506 Phase2] CaptionEngine — DOM 비의존 순수 캡션 생성 (작업실 V2 drawer/flow 직접 렌더용).
   기존 _doGenerateCaption 의 payload 빌드(_CAP_CAT_MAP/SHOP_CONFIG/photo_context)·
   해시태그 정제(shuffleHashtags)·/persona/generate(_personaFetch)·log_id 흐름을 그대로 재사용.
   기존 캡션 탭 동작은 미변경(순수 additive, backward-compatible). caption payload 구조 변경 없음. */
// [#6] 캡션 후처리 — 같은 문단/연속 같은 줄 중복 제거. 백엔드가 intro/body/CTA 를 중복으로 합쳐 보내거나
//  같은 문단이 두 번 나오는 경우를 표시 직전에 한 번 더 걸러낸다(생성 후 post-process dedupe).
// [v534] 본문/해시태그 완전 분리 — 본문 안의 모든 #토큰을 제거하고 hashtags 로 모은다(순서보존·중복제거).
//   백엔드가 본문에 해시태그를 섞어 보내도 본문 textarea 엔 #이 0개가 되도록 프론트에서도 한 번 더 차단.
function _splitBodyHashtags(text) {
  text = String(text || '');
  var tags = [], seen = Object.create(null);
  (text.match(/#[^\s#]+/g) || []).forEach(function (m) {
    var k = m.toLowerCase();
    if (!seen[k]) { seen[k] = 1; tags.push(m); }
  });
  var body = text.replace(/#[^\s#]+/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .split('\n').map(function (ln) { return ln.replace(/\s+$/, ''); }).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
  return { body: body, tags: tags };
}

function _dedupeCaptionText(text) {
  text = String(text || '');
  if (!text.trim()) return text.trim();
  // [v531] placeholder 정제 — 실제 샵명이 있으면 치환, 없으면 자연스럽게 제거(빈 괄호/어색한 자리표시 방지).
  let _shop = '';
  try { _shop = localStorage.getItem('shop_name') || ''; } catch (_e) { _shop = ''; }
  text = text
    .replace(/\[\s*(샵\s*이름|샵\s*명|매장\s*이름|매장\s*명|shop\s*name|store\s*name)\s*\]/gi, _shop || '저희 샵')
    .replace(/\[\s*(원장님?|디자이너님?|선생님)\s*\]/g, _shop || '저희 샵')
    .replace(/\[[^\]\n]{1,24}\]/g, '')   // 남은 대괄호 placeholder 제거
    .replace(/[ \t]{2,}/g, ' ');
  // [#6 강화] 정규화 키 — 이모지/문장부호/공백 차이를 무시해 "근사 중복"(예: "완성했어요!" vs "완성했어요 😊")도 같게 본다.
  const norm = s => String(s || '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
  // 1) 문단(빈 줄 기준) 단위 — 근사 중복까지 제거. 기호/해시태그-only 문단(키 빈값)은 보존.
  const seenP = Object.create(null);
  const paras = text.split(/\n{2,}/).map(p => p.replace(/\s+$/, '')).filter(p => p.trim());
  const out = [];
  paras.forEach(p => { const k = norm(p); if (k && seenP[k]) return; if (k) seenP[k] = 1; out.push(p.trim()); });
  // 2) 줄 단위 — 백엔드가 문단을 \n 하나로만 구분해 \n{2,} 분리에 안 걸리는 중복도 정규화 비교로 제거.
  const seenL = Object.create(null);
  const lo = [];
  out.join('\n\n').split('\n').forEach(ln => { const k = norm(ln); if (k && seenL[k]) return; if (k) seenL[k] = 1; lo.push(ln); });
  // 3) 문장 단위 — 같은 문장 + [v531] 유사/부분 문장(한쪽이 다른쪽을 포함, 예: "저희 샵에서 …약속드려요" ⊃ "…약속드려요")까지 첫 문장만 유지.
  const seenArr = [];
  const _isDupSentence = k => {
    if (!k) return false;
    for (let i = 0; i < seenArr.length; i++) {
      const s = seenArr[i];
      if (s === k) return true;
      if (Math.min(s.length, k.length) >= 10 && (s.indexOf(k) >= 0 || k.indexOf(s) >= 0)) return true;
    }
    return false;
  };
  const lo2 = lo.map(ln => {
    if (!norm(ln)) return ln;
    const kept = ln.split(/(?<=[.!?。！？…])\s+/).filter(s => { const k = norm(s); if (!k) return true; if (_isDupSentence(k)) return false; seenArr.push(k); return true; });
    const joined = kept.join(' ').trim();
    return joined ? joined : null;
  }).filter(s => s !== null);
  return lo2.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// [v568·A-2] 자유텍스트에서 샵명/고객명 분리 — 백엔드가 정확한 값으로 작성/복구해 '잇데고객님의' 결합오류 방지.
//   보수적으로 명확한 패턴만 추출하고, 못 찾으면 빈 값(백엔드는 온보딩 샵명 사용).
//   한국어 copula(이야/야 등)는 받침 유무로 갈려서('잇데이+야' vs '뷰티핏+이야'), 받침 판정으로 정확히 분리.
function _cleanShopName(raw) {
  let s = String(raw || '').trim();
  const tail = s.match(/(이에요|이예요|이고요|이야|이고|입니다|예요|에요|야|고)$/);
  if (tail) {
    const suf = tail[1];
    const stem = s.slice(0, s.length - suf.length);
    if (stem.length >= 2) {
      const c = stem.charCodeAt(stem.length - 1);
      const hasBatchim = (c >= 0xAC00 && c <= 0xD7A3) && ((c - 0xAC00) % 28 !== 0);
      if (suf[0] === '이' && !hasBatchim) return stem + '이';   // '이'는 명사 일부(잇데이), 'X'만 copula
      return stem;
    }
  }
  return s;
}
// [#1] 캡션에 상호로 브랜딩할 '진짜 가게 이름'인지 — 'Dd'·'aa' 같은 짧은 라틴/계정 placeholder 제외.
function _isRealShop(n) {
  n = String(n || '').trim();
  if (n.length < 2) return false;
  if (/(뷰티샵|헤어샵|네일샵|왁싱샵|미용실|살롱|스튜디오|에스테틱|샵|점)$/.test(n)) return true;
  if (/[가-힣]{2,}/.test(n)) return true;
  return false;
}
function _parseShopCustomer(text) {
  const t = String(text || '');
  let shop = '', customer = '';
  const _CUST_BLOCK = /^(원장|선생|사장|대표|점장|실장|디자이너|고객|손님|남성|여성|남자|여자|남|여|단골|신규|기존|첫|재방문|소개|단체|커플|모녀|자매|학생|직장인|주부|신부|예민|민감|약해진)$/;
  const cm = t.match(/([가-힣]{2,4})\s*고객님?/);   // [v611] '고객'만 써도(님 생략) 인식 + 일반 수식어 차단
  if (cm && !_CUST_BLOCK.test(cm[1])) customer = cm[1];
  // '우리샵은 X' / '저희샵은 X' / '샵은 X' / '샵이름은 X' / '샵: X' — 명사+copula 를 greedy 로 잡고 copula 분리.
  const sm = t.match(/(?:우리\s*샵|저희\s*샵|샵\s*이름|샵)\s*(?:은|는|이름은|:)\s*([가-힣A-Za-z0-9]{1,14}(?:네일샵|헤어샵|뷰티샵|샵)?)/);
  if (sm && sm[1]) shop = _cleanShopName(sm[1]);
  if (!shop) {
    // [v611] 샵 접미사를 '캡처 그룹 안'에 포함 — "강연준네일샵"이 "강연준네일"로 잘리던 버그 수정.
    const sm2 = t.match(/(?:^|[\s,·、])([가-힣A-Za-z0-9]{2,14}(?:네일샵|헤어샵|뷰티샵|왁싱샵|미용실|살롱|스튜디오|에스테틱|샵))(?:이야|입니다|이에요|예요)?(?=[\s,.·、]|$)/);
    if (sm2 && sm2[1] && !/^(우리|저희)샵$/.test(sm2[1])) shop = sm2[1];
  }
  // cleaned: 고객/샵 구문 제거 → 순수 시술 키워드만 남김
  const cleaned = t
    .replace(/([가-힣]{2,4})\s*고객님?(이고|이라고|이며|이고요|입니다|예요|이에요|,)?/g, ' ')
    .replace(/(?:우리\s*샵|저희\s*샵|샵\s*이름|샵)\s*(?:은|는|이름은|:)\s*[가-힣A-Za-z0-9]{1,14}(?:네일샵|헤어샵|뷰티샵|샵)?(?:이야|이에요|예요|입니다|이고|야|고)?/g, ' ')
    .replace(/[가-힣A-Za-z0-9]{2,14}(?:네일샵|헤어샵|뷰티샵|왁싱샵|미용실|살롱|스튜디오|에스테틱|샵)(?:이야|입니다|이에요|예요)?/g, ' ')
    .replace(/\s{2,}/g, ' ').replace(/^[\s,.]+|[\s,.]+$/g, '').trim();
  return { shop, customer, cleaned };
}

window.CaptionEngine = {
  async generate(opts) {
    opts = opts || {};
    const shopType = localStorage.getItem('shop_type') || '붙임머리';
    // photo_context 는 호출부(flow.js)가 항상 채워서 넘긴다 — 유일 호출자이며 빈 시술명은 그쪽에서 막힌다.
    const photo_context = opts.photo_context;
    // [v561] 카테고리 = 시술 입력(service/treatment_keyword) + 업종 추론. 'extension' 자동 폴백 제거.
    const _catText = [opts.service, opts.treatment_keyword, opts.photo_context].filter(Boolean).join(' ');
    const payload = {
      category: _inferCaptionCategory(shopType, _catText),
      photo_context,
      length_tier: opts.length_tier || 'medium',
      tone_override: opts.tone_override || 'normal',
    };
    // [#5] 사용자 입력 시술명/키워드를 전용 필드로도 전달 — 백엔드가 키워드를 캡션에 명시 반영하도록.
    //  (photo_context 에도 이미 prepend 되지만, 백엔드가 photo_context 만 보고 service 를 흘리는 경로 대비)
    const _svc = String(opts.service || '').trim();
    if (_svc) payload.service = _svc;
    // [v611] 샵/고객은 flow(_cleanService, v610)가 이미 정확히 분리해 opts 로 넘긴다 → 그 값을 신뢰.
    //   opts 에 없을 때만 자체 _parseShopCustomer 폴백(레거시 직접 호출 대비). 샵 접미사('샵') 보존.
    const _sc = _parseShopCustomer([opts.service, opts.treatment_keyword].filter(Boolean).join(' '));
    let _shopFinal = (opts.shop_name && String(opts.shop_name).trim()) || _sc.shop;
    const _custFinal = (opts.customer_name && String(opts.customer_name).trim()) || _sc.customer;
    // [#1] 'Dd'·'aa' 같은 계정 placeholder 는 상호로 캡션에 안 씀 — 진짜 상호(한글 2자↑ or 상호접미사)만.
    if (_shopFinal && !_isRealShop(_shopFinal)) _shopFinal = '';
    if (_shopFinal) payload.shop_name = String(_shopFinal).slice(0, 40);
    if (_custFinal) payload.customer_name = String(_custFinal).slice(0, 20);
    // [v611] 샵 이름을 LLM 이 줄이지 않게 — 진짜 상호일 때만 '정확히 이 상호로 표기 + 억지 반복 금지'.
    if (_shopFinal) opts.extra_notes = ('샵 이름은 반드시 "' + _shopFinal + '" 전체로 정확히 표기(줄이거나 "샵" 빼지 말 것). 단 상호는 게시글에 많아야 한 번만 자연스럽게, 매 문장 반복 금지. ' + String(opts.extra_notes || '')).slice(0, 300);
    // [#1] 진짜 상호가 없으면 상호를 지어내거나 계정명(예: Dd)을 상호로 쓰지 말라고 명시.
    else opts.extra_notes = ('특정 상호(가게 이름)를 지어내거나 계정 이름을 상호처럼 쓰지 말고, 필요하면 "저희 샵"으로만 칭할 것. ' + String(opts.extra_notes || '')).slice(0, 300);
    // [다중pair·Step5] 사용자 강조 표현은 extra_notes 채널로 전달 — 백엔드 GenerateRequest.extra_notes 가
    //  '특이사항은 그대로 복붙하지 말고 문맥에 맞게 자연스럽게 녹여달라'로 처리 → 구어/감정 표현(예: '개오바 얼굴')
    //  박제 방지 + 의미 반영. 백엔드 제한(max 300자)에 맞춰 캡.
    const _extra = String(opts.extra_notes || '').trim();
    if (_extra) payload.extra_notes = _extra.slice(0, 300);
    // [v534] 백엔드 우선맥락/variation 필드 전달 — 백엔드가 service/treatment_keyword 를 prompt 에 직접
    //   주입하고 caption_intent 별 분기 + previous_caption 반복 방지 + variation_seed 로 동일 결과 차단.
    // [v568·A-2] 샵/고객을 파싱했으면 시술 키워드는 그 둘을 뺀 cleaned 사용(샵명/고객명이 시술명으로 새는 것 방지).
    if (_svc) {
      // [v611] flow 가 넘긴 treatment_keyword(샵·고객 제거된 cleaned)를 최우선 신뢰.
      const _tk = (opts.treatment_keyword && String(opts.treatment_keyword).trim())
        || ((_sc.shop || _sc.customer) ? (_sc.cleaned || _svc) : _svc);
      payload.treatment_keyword = String(_tk).slice(0, 80);
    }
    if (opts.content_type) payload.content_type = String(opts.content_type).slice(0, 32);
    payload.caption_intent = (['generate', 'rewrite', 'longer', 'instagram'].indexOf(opts.caption_intent) >= 0) ? opts.caption_intent : 'generate';
    if (opts.previous_caption) payload.previous_caption = String(opts.previous_caption).slice(0, 1500);
    if (opts.variation_seed) payload.variation_seed = String(opts.variation_seed).slice(0, 64);
    payload.strict_user_context = (opts.strict_user_context !== false);
    // [v567] 원장님 말투 반영 토글 — 명시 ON 일 때만 페르소나/인스타 말투분석 반영(기본 OFF).
    payload.use_persona = (opts.use_persona === true);
    const data = await _personaFetch('POST', '/persona/generate', payload);
    // [v568·A-5] data.caption 은 '저장 꼬리말 포함' 최종본 → 우선 표시(꼬리말이 안 붙던 버그 수정).
    //   data.body 는 꼬리말 미포함이라 caption 이 비었을 때만 fallback.
    const _rawBody = (typeof data.caption === 'string' && data.caption.trim()) ? data.caption : data.body;
    const _sep = _splitBodyHashtags(_rawBody);   // [v534] 본문/해시태그 완전 분리
    const caption = _dedupeCaptionText(_sep.body);   // [#6] 문단 단위 dedupe (해시태그 제거 후)
    if (!caption) throw new Error('AI 가 캡션을 만들지 못했어요. 다시 시도해주세요.');
    // 해시태그: 백엔드 hashtags 우선 + 본문에서 분리된 태그 보강(중복 제거).
    const _seenTag = Object.create(null);
    const _merged = (Array.isArray(data.hashtags) ? data.hashtags : []).concat(_sep.tags);
    const tags = shuffleHashtags(_merged)
      .map(t => String(t || '').trim().replace(/^#+/, '')).filter(Boolean)
      .filter(t => { const k = t.toLowerCase(); if (_seenTag[k]) return false; _seenTag[k] = 1; return true; })   // [#6] 해시태그 중복 제거
      .map(t => '#' + t);
    return { caption, hashtags: tags, hashtagsText: tags.join(' '), log_id: data.log_id || null };
  },
};

// [v555] 말투 카드 선택 — 위임 핸들러(정적 마크업이라 한 번만 바인딩). 선택값은 window._selectedTone.
//   선택하지 않으면 기본 추천값 natural(첫 카드 .on)로 동작.
window._selectedTone = window._selectedTone || 'natural';
document.addEventListener('click', function (e) {
  const card = e.target && e.target.closest ? e.target.closest('#toneCards .tone-card') : null;
  if (!card) return;
  const tone = card.getAttribute('data-tone');
  if (!tone) return;
  window._selectedTone = tone;
  document.querySelectorAll('#toneCards .tone-card').forEach(function (c) {
    const on = (c === card);
    c.classList.toggle('on', on);
    c.setAttribute('aria-checked', on ? 'true' : 'false');
  });
});
