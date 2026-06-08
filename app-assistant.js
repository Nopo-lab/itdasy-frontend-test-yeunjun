/* ─────────────────────────────────────────────────────────────
   AI 비서 챗봇 (2026-04-21)

   원장님 자연어 질문 → POST /assistant/ask → 답변.
   대화 UI + 추천 질문 3개.
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // 2026-04-24 — Lucide SVG 아이콘 헬퍼 (이모지 대체용)
  // 기존 index.html 의 <symbol id="ic-XXX"> 스프라이트 참조.
  function _svg(id, size = 14) {
    return `<svg width="${size}" height="${size}" style="vertical-align:-2px;" aria-hidden="true"><use href="#${id}"/></svg>`;
  }

  const _assistantCore = window.ItdasyAssistant || {};
  const _assistantPhotoActions = window.ItdasyAssistantPhotoActions || {};
  const _assistantSingleActions = window.ItdasyAssistantSingleActions || {};
  const _assistantGroupActions = window.ItdasyAssistantGroupActions || {};
  const _assistantSuggestionControls = window.ItdasyAssistantSuggestionControls || {};
  const _assistantCardRenderers = window.ItdasyAssistantCardRenderers || {};
  const SUGGESTIONS = _assistantCore.SUGGESTIONS || [
    '오늘 예약 알려줘',
    '사진 보정해줘',
    '캡션 만들어줘',
    '인스타에 올려줘',
    '단골 안부 메시지',
    '이번 달 매출',
  ];

  function _categoryOptionsHtml(selected) {
    if (typeof _assistantCore.categoryOptionsHtml === 'function') {
      return _assistantCore.categoryOptionsHtml(selected);
    }
    return '';
  }

  // [P0-4 2026-05-19] 위험 액션 — _executeAction 직전 nativeConfirm 강제.
  // BE의 confirmation_text 표시 + 카드 클릭 + 여기 native confirm = 3중 안전.
  // bulk 흐름(_runGroupAll 등)은 _executeAction(action, { skipConfirm: true }) 로 우회.
  // 롤백: localStorage.assistant_risky_confirm_disabled = '1' 설정 시 항상 skip.
  const RISKY_ACTION_KINDS = _assistantCore.RISKY_ACTION_KINDS || new Set();
  function _catMeta(kind) {
    return typeof _assistantCore.catMeta === 'function'
      ? _assistantCore.catMeta(kind)
      : { icon: 'ic-check', label: kind || '작업', color: '#666' };
  }

  // 외부 모듈(마케팅·콘텐츠 kind 등)이 CATEGORY 메타와 invalidate 매핑을 확장할 수 있는 포인트.
  // 새 kind를 app-assistant.js 본체에 박지 않고 분리해 관리하기 위함 (본체는 이미 거대).
  const _externalInvalidateKinds = _assistantCore.externalInvalidateKinds || {};
  // [v167 2026-05-17] 로컬 핸들러 — 백엔드 호출 없이 프론트에서 직접 처리하는 kind (예: open_photo_editor).
  // 핸들러는 async (action) => { message?, undo_log_id? } 형태. 등록 시 fetch /assistant/execute 우회.
  const _localKindHandlers = _assistantCore.localKindHandlers || {};
  // [QA-r10 2026-05-15] OCR fallback repair 중복 폭주 차단 (실기기 보고: 동일 14,500원 24회 복제).
  // 백엔드 prose-repair 가 같은 vendor·amount 로 N회 반복 append 한 경우를 프론트에서 방어.
  //   - kind 별 핵심 식별자 (vendor/amount/customer_name/service_name/starts_at/items[0]) 조합으로 키 생성
  //   - 첫 등장만 유지, 동일 키는 모두 drop (low-confidence "확인 필요" 도 포함)
  //   - kind 당 최대 8개 cap (영수증 1장 = 통상 5~8 품목)
  //   - 전체 최대 20개 cap (다수 영수증 동시 업로드 상한)
  //   - kind 없거나 payload 빈 fallback 액션은 drop
  // 반환: { actions, dropped, droppedKinds[] }
  function _dedupeAndCapActions(actions) {
    if (typeof _assistantCore.dedupeAndCapActions === 'function') {
      return _assistantCore.dedupeAndCapActions(actions);
    }
    return { actions: Array.isArray(actions) ? actions : [], dropped: 0, droppedKinds: [] };
  }

  // actions[] 을 kind 순서대로 그룹핑 (첫 등장 순서 유지)
  function _groupActions(actions) {
    if (typeof _assistantCore.groupActions === 'function') return _assistantCore.groupActions(actions);
    return [];
  }

  let _history = [];  // [{role, text}]
  // [2026-04-26 렉 박멸 픽스]
  // 1) UI 표시 메시지 100개 cap — 100개 넘으면 오래된 것부터 잘라냄.
  //    서버는 session_id 로 전체 보존 (다시 열면 _loadServerHistory 가 최근 50개 가져옴).
  // 2) RAF debounce — 동일 frame 안 _renderHistory() 다중 호출을 1회로 합침.
  // 3) sheet 닫혀있으면 즉시 return — 보이지 않는 DOM 갱신은 의미 없음.
  const HISTORY_RENDER_CAP = 100;
  function _capHistory() {
    try {
      if (_history.length > HISTORY_RENDER_CAP) {
        _history = _history.slice(-HISTORY_RENDER_CAP);
      }
    } catch (_e) { void _e; }
  }
  let _renderRafId = 0;
  let _lastRenderedSig = '';  // incremental 판단용 — _history.length + 마지막 메시지 fingerprint
  function _historySig() {
    try {
      const last = _history[_history.length - 1] || {};
      // fingerprint: 길이 + role + text 첫 80자 + action_status + edit_mode + action_groups 길이
      let sig = _history.length + '|' + last.role + '|' + String(last.text || '').slice(0, 80)
        + '|' + (last.action_status || '') + '|' + (last.edit_mode ? '1' : '0')
        + '|' + ((last.action_groups && last.action_groups.length) || 0)
        + '|u' + (last.unified_mode ? '1' : '0');
      // [2026-05-13 blocker] group.expanded / item.editing / item.status 도 sig 에 포함.
      // 이전엔 누락 → "수정하기" 토글 후 g.expanded 가 바뀌어도 sig 동일 → _renderHistory 가
      // 변경 없음으로 판단해 skip. sheet 닫았다 열어야(_lastRenderedSig='') 반영되는 버그.
      if (Array.isArray(last.action_groups)) {
        for (const g of last.action_groups) {
          sig += '|g' + (g && g.expanded ? '1' : '0');
          if (g && Array.isArray(g.items)) {
            for (const it of g.items) {
              sig += (it && it.editing ? 'e' : '') + (it && it.status ? it.status[0] : '');
            }
          }
        }
      }
      // [2026-05-26] 옛 코드: loading 중 sig 에 초 단위 시각 포함 → 매초 전체 재렌더 →
      // 메시지 영역 깜빡임·등장 애니메이션 재생·스크롤 튐. 경과시간은
      // _tickLoadingElapsed() 로 #asstLoadingElapsed 텍스트만 부분갱신.
      return sig;
    } catch (_e) { return String(_history.length); }
  }
  // v1.1 Multi-turn — localStorage 에 session_id 유지 (앱 재시작해도 대화 기억)
  let _sessionId = null;
  try { _sessionId = parseInt(localStorage.getItem('assistant_session_id') || '', 10) || null; }
  catch (_e) { _sessionId = null; }

  // [2026-04-26 백그라운드 픽스] in-flight 메시지 직렬화 / 미확인 답변 알림
  // 사진 업로드·답변 대기 중에 챗봇 닫고 딴 일 해도, 다시 열었을 때 보낸 내역과 답변이 보이도록.
  const PENDING_KEY = 'chat_pending';
  const PENDING_TIMEOUT_MS = 60 * 1000;  // 60초 후 자동 정리
  let _pendingTimer = null;
  let _inflightCtrl = null;     // 진행 중 fetch AbortController (페이지 언로드 시 abort)
  let _pendingTickTimer = null; // 진행 시간 표시용 1초 인터벌

  function _savePending(payload) {
    try {
      const data = Object.assign({ started_at: Date.now() }, payload || {});
      localStorage.setItem(PENDING_KEY, JSON.stringify(data));
    } catch (_e) { void _e; }
    // [2026-05-26] 1초마다 경과시간만 부분갱신 (전체 _renderHistory 호출 X — 깜빡임 차단)
    if (_pendingTickTimer) { clearInterval(_pendingTickTimer); _pendingTickTimer = null; }
    _pendingTickTimer = setInterval(() => {
      const sheet = document.getElementById('assistantSheet');
      if (sheet && sheet.style.display !== 'none') _tickLoadingElapsed();
    }, 1000);
    // 60초 timeout
    if (_pendingTimer) { clearTimeout(_pendingTimer); _pendingTimer = null; }
    _pendingTimer = setTimeout(() => {
      try {
        if (_inflightCtrl) { try { _inflightCtrl.abort(); } catch (_e) { void _e; } }
        _clearChatPending();
        _history = _history.filter(m => m.role !== 'loading');
        _history.push({ role: 'assistant', text: '응답이 너무 늦어요. 다시 시도해 주세요.' });
        _renderHistory();
        if (typeof window.toast === 'function') {
          window.toast('AI 잇비 응답이 너무 늦어요. 다시 시도해 주세요.');
        }
      } catch (_e) { void _e; }
    }, PENDING_TIMEOUT_MS);
  }
  function _clearChatPending() {
    try { localStorage.removeItem(PENDING_KEY); } catch (_e) { void _e; }
    if (_pendingTimer) { clearTimeout(_pendingTimer); _pendingTimer = null; }
    if (_pendingTickTimer) { clearInterval(_pendingTickTimer); _pendingTickTimer = null; }
  }
  function _readChatPending() {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_e) { return null; }
  }
  function _setUnreadAnswer(on) {
    try {
      const fab = document.getElementById('assistantFab');
      if (!fab) return;
      let dot = fab.querySelector('.asst-unread-dot');
      if (on) {
        if (!dot) {
          dot = document.createElement('span');
          dot.className = 'asst-unread-dot';
          dot.style.cssText = 'position:absolute;top:6px;right:6px;width:12px;height:12px;border-radius:50%;background:#FF3B30;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,0.1);pointer-events:none;';
          // FAB 자체가 position:fixed 라 자식 absolute 가 바로 잡힘
          fab.style.position = fab.style.position || 'fixed';
          fab.appendChild(dot);
        }
      } else if (dot) {
        dot.remove();
      }
    } catch (_e) { void _e; }
  }
  function _notifyAnswerArrived() {
    const sheet = document.getElementById('assistantSheet');
    const isOpen = !!(sheet && sheet.style.display !== 'none' && sheet.style.opacity !== '0');
    if (isOpen) return;  // 보고있으면 알림 불필요
    _setUnreadAnswer(true);
    try {
      if (typeof window.toast === 'function') {
        // 토스트 클릭 → 챗봇 열기. window.toast 가 클릭 콜백을 지원 안 하면 메시지만.
        try {
          window.toast('AI 잇비 답변 도착 — 탭해서 확인', { onClick: () => window.openAssistant && window.openAssistant() });
        } catch (_e) {
          window.toast('AI 잇비 답변 도착 — 버튼을 눌러주세요');
        }
      }
    } catch (_e) { void _e; }
  }

  // [2026-04-28] pagehide 자동 abort 제거 — iOS PWA 가 백그라운드 갈 때 발사돼서
  // 사용자가 챗봇 메시지 보낸 직후 화면 잠깐 옮기면 자동 abort → "네트워크 연결을 확인해주세요" 에러.
  // chat_pending 직렬화로 이미 답변 보존되니 abort 불필요.

  // Wave B5 — 고객 이름 캐시 (keystroke 마다 localStorage 접근 방지)
  let _customerCache = null;
  let _customerCacheAt = 0;
  const _CUSTOMER_CACHE_TTL = 60 * 1000;  // 60초
  function _getCustomers() {
    const now = Date.now();
    if (_customerCache && (now - _customerCacheAt) < _CUSTOMER_CACHE_TTL) return _customerCache;
    try {
      const raw = (window.safeStorage ? window.safeStorage.get('pv_cache::customers') : null)
        || (() => { try { return JSON.parse(localStorage.getItem('pv_cache::customers') || 'null'); } catch (_) { return null; } })();
      const items = raw && Array.isArray(raw.d) ? raw.d
                   : Array.isArray(raw) ? raw
                   : (raw && Array.isArray(raw.items) ? raw.items : []);
      _customerCache = items.filter(c => c && c.name).map(c => ({ id: c.id, name: String(c.name), phone: c.phone || '' }));
    } catch (_e) { _customerCache = []; }
    _customerCacheAt = now;
    return _customerCache;
  }

  // Wave B4 — 휴리스틱 추출 (한글 이름, 전화, 금액, 시간)
  function _heuristicExtract(q) {
    const out = { name: '', phone: '', amount: '', time: '', raw: q };
    try {
      const mName = q.match(/[가-힣]{2,4}/);
      if (mName) out.name = mName[0];
      const mPhone = q.match(/0\d{1,2}[-\.\s]?\d{3,4}[-\.\s]?\d{4}/);
      if (mPhone) out.phone = mPhone[0].replace(/[\.\s]/g, '-');
      const mAmount = q.match(/(\d{1,3}(?:,\d{3})+|\d{4,})\s*(?:원|만원|천원)?/);
      const mUnit = q.match(/(\d+)\s*(만원|천원)/);
      if (mUnit) {
        const n = parseInt(mUnit[1], 10);
        out.amount = String(mUnit[2] === '만원' ? n * 10000 : n * 1000);
      } else if (mAmount) {
        out.amount = mAmount[1].replace(/,/g, '');
      }
      const mTime = q.match(/오늘|내일|모레|\d+월\s*\d+일|\d+시/);
      if (mTime) out.time = mTime[0];
    } catch (_e) { void _e; }
    return out;
  }

  // Wave B4 — 시간 힌트를 ISO 로 변환 (예약용, best-effort)
  function _timeToISO(hint) {
    if (!hint) return null;
    try {
      const base = new Date();
      base.setSeconds(0, 0);
      let day = new Date(base);
      if (/내일/.test(hint)) day.setDate(day.getDate() + 1);
      else if (/모레/.test(hint)) day.setDate(day.getDate() + 2);
      const m = hint.match(/(\d+)월\s*(\d+)일/);
      if (m) { day.setMonth(parseInt(m[1], 10) - 1); day.setDate(parseInt(m[2], 10)); }
      const mH = hint.match(/(\d+)시/);
      if (mH) day.setHours(parseInt(mH[1], 10), 0, 0, 0);
      else day.setHours(10, 0, 0, 0);
      return day.toISOString();
    } catch (_e) { return null; }
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  // [EG-2] 채팅 버블은 white-space:pre-wrap 이라 메시지 끝 공백/과도한 개행이 그대로 보임.
  //   줄 끝 공백 제거 · 3줄 이상 개행을 2줄로 · 끝 공백 제거. (내부 의도된 줄바꿈은 보존)
  function _normMsg(t) {
    return String(t == null ? '' : t).replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
  }

  function _ensureSheet() {
    let sheet = document.getElementById('assistantSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'assistantSheet';
    // 2026-04-24 perf — opacity 트랜지션. [2026-04-26 A10] 0.10s → 0.05s 단축.
    sheet.style.cssText = 'position:fixed;inset:0;z-index:10500;display:none;background:rgba(0,0,0,0.7);opacity:0;pointer-events:none;transition:opacity 0.05s ease-out;';
    // [2026-04-26 A5] 시트 내부 패널: safe-area-inset-top 추가 (노치 회피)
    sheet.innerHTML = `
      <div id="assistantSheetPanel" style="position:absolute;inset:auto 0 0 0;background:#FFFFFF;border-radius:20px 20px 0 0;height:88vh;height:88dvh;display:flex;flex-direction:column;padding:max(8px,env(safe-area-inset-top)) 16px max(12px,env(safe-area-inset-bottom));">
        <div id="assistantSheetHeader" style="display:grid;grid-template-columns:32px 1fr 32px;align-items:center;gap:8px;margin-bottom:10px;height:44px;">
          <button data-assistant-close aria-label="닫기" title="닫기" style="background:transparent;border:none;width:32px;height:32px;border-radius:50%;color:#191F28;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;justify-self:start;">${_svg('ic-x', 18)}</button>
          <div style="display:inline-flex;align-items:center;justify-content:center;gap:6px;">
            <strong style="font-size:16px;color:#191F28;font-weight:700;letter-spacing:-0.2px;">AI 잇비</strong>
            <span style="font-size:10px;padding:2px 7px;border-radius:6px;background:#F2F4F6;color:#4E5968;font-weight:600;">베타</span>
          </div>
          <button data-assistant-menu aria-label="잇비 설정" title="잇비 설정" style="background:transparent;border:none;width:32px;height:32px;border-radius:50%;color:#191F28;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:20px;line-height:1;justify-self:end;">⋯</button>
        </div>
        <div id="asstBody" style="flex:1;overflow-y:auto;padding:4px 4px 14px;"></div>
        <div id="asstQuickLabel" style="font-size:11px;color:#8B95A1;padding:8px 4px 4px;font-weight:600;">이런 것도 돼요</div>
        <div id="asstSuggest" style="display:flex;gap:6px;overflow-x:auto;margin-top:0;padding:4px 0;"></div>
        <div id="asstTypeahead" style="display:none;gap:6px;overflow-x:auto;margin-top:6px;padding:2px 0;"></div>
        <!-- [v178 2026-05-18] 사진 펜딩 영역 — 갤러리/카메라 선택 후 여기 미리보기. 송신 전까지 보임 -->
        <div id="asstPending" style="display:none;flex-wrap:wrap;gap:6px;padding:6px 4px 0;"></div>
        <div id="asstFooter" style="display:flex;gap:8px;margin-top:8px;align-items:center;">
          <button id="asstPhoto" aria-label="사진 업로드" title="사진 업로드" style="flex-shrink:0;width:40px;height:40px;border:none;border-radius:50%;background:#F2F4F6;color:#4E5968;cursor:pointer;padding:0;display:inline-flex;align-items:center;justify-content:center;transition:background 0.15s;">${_svg('ic-camera', 18)}</button>
          <input id="asstInput" placeholder="샵 관련해서 물어보세요…" maxlength="300" data-no-voice style="flex:1;padding:11px 16px;border:none;border-radius:999px;font-size:14px;min-width:0;background:#F2F4F6;color:#191F28;outline:none;" />
          <button id="asstMicBtn" type="button" aria-label="음성 입력" title="음성 입력" style="flex-shrink:0;width:40px;height:40px;border:none;border-radius:50%;background:#F2F4F6;color:#4E5968;cursor:pointer;padding:0;display:inline-flex;align-items:center;justify-content:center;transition:background 0.15s, color 0.15s;">${_svg('ic-mic', 18)}</button>
          <button id="asstSend" aria-label="보내기" title="보내기" style="flex-shrink:0;width:40px;height:40px;padding:0;border:none;border-radius:50%;background:#191F28;color:#FFFFFF;cursor:pointer;font-weight:700;display:inline-flex;align-items:center;justify-content:center;">${_svg('ic-send', 16)}</button>
        </div>
        <input id="asstCamera" type="file" accept="image/*" capture="environment" multiple style="display:none;" />
        <input id="asstGallery" type="file" accept="image/*" multiple style="display:none;" />
      </div>
    `;
    document.body.appendChild(sheet);
    _installSheetTapStyle();
    _bindSheetControls(sheet);
    _renderSuggest();
    return sheet;
  }

  function _installSheetTapStyle() {
    // iOS 300ms 딜레이 제거 — asstBody 안 버튼은 즉시 반응
    if (!document.getElementById('asst-tap-style')) {
      const st = document.createElement('style');
      st.id = 'asst-tap-style';
      st.textContent = [
        '#assistantSheetPanel button { touch-action: manipulation; transition: background .12s ease, transform .08s ease; }',
        '#assistantSheetPanel button:active { transform: scale(.96); }',
        // [2026-05-26] 메시지·액션 카드 등장 — slide-up + fade
        '#asstBody .asst-msg, #asstBody .asst-card { animation: asstSlideUp .4s ease both; }',
        '@keyframes asstSlideUp { from { transform: translateY(6px); opacity: 0; } to { transform: none; opacity: 1; } }',
        // 완료 체크 아이콘 pop
        '.asst-card--done > span:first-child { animation: asstPop .35s cubic-bezier(.4,1.6,.6,1) both; }',
        '@keyframes asstPop { 0% { transform: scale(0); opacity: 0; } 60% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(1); } }',
        // [2026-05-28] 잇비 시트 열리면 PC 사이드바/헤더 가려서 풀모달처럼 보이게
        '@media (min-width: 768px) {',
        '  body.assistant-open .side-nav,',
        '  body.assistant-open .app-header { visibility: hidden; }',
        '  body.assistant-open { padding-left: 0 !important; padding-top: 0 !important; }',
        '}',
        // [2026-05-28] PC 모달 B안 — 가운데 큰 모달 (1080×900). 모바일은 풀스크린 그대로.
        '@media (min-width: 1024px) {',
        '  #assistantSheetPanel {',
        '    inset: auto !important;',
        '    position: fixed !important;',
        '    top: 50% !important;',
        '    left: 50% !important;',
        '    transform: translate(-50%, -50%) !important;',
        '    width: min(960px, 90vw) !important;',
        '    height: min(900px, 90vh) !important;',
        '    max-width: none !important;',
        '    border-radius: 20px !important;',
        '    overflow: hidden !important;',
        '    margin: 0 !important;',
        // [2026-06-05] 가운데 모달이라 사이드바 회피용 padding-left:232px(style-components.css) 취소 → 좌우 대칭
        '    padding-left: 16px !important;',
        '    padding-right: 16px !important;',
        '  }',
        // [2026-05-29] PC 메시지 영역 가운데 max-width 720px 컨테이너 (헤더·입력창은 풀폭 유지)
        '  #asstBody { padding: 16px 0 !important; display: flex; flex-direction: column; align-items: center; }',
        // [2026-06-05] 메시지 컬럼 가운데정렬(좌우 대칭). 버블 좌/우 정렬은 메시지 내부 flex 가 처리.
        '  #asstBody > * { width: 100%; max-width: 880px; margin-left: auto; margin-right: auto; padding-left: 20px; padding-right: 20px; box-sizing: border-box; }',
        '  #asstBody .asst-msg, #asstBody .asst-user-msg { max-width: 100% !important; }',
        '  #asstBody .asst-msg--ai > div:last-child, #asstBody .asst-msg--user > div { max-width: 88% !important; }',
        '  #assistantSheetHeader { padding-left: 20px; padding-right: 20px; }',
        '  #asstFooter { padding: 12px 20px; }',
        '}',
      ].join('\n');
      document.head.appendChild(st);
    }
  }

  function _bindSheetControls(sheet) {
    sheet.addEventListener('click', (e) => { if (e.target === sheet) closeAssistant(); });
    sheet.querySelector('[data-assistant-close]')?.addEventListener('click', () => closeAssistant());
    // [2026-05-25] 잇비 헤더 ⋯ 메뉴 — 메모/액션 되돌리기/카톡캡쳐/명함/가격표 OCR 통합 진입점.
    sheet.querySelector('[data-assistant-menu]')?.addEventListener('click', _openAssistantToolMenu);
    sheet.querySelector('#asstSend').addEventListener('click', _send);
    // 사진 업로드 버튼 → 하단 action sheet
    sheet.querySelector('#asstPhoto').addEventListener('click', _openPhotoSheet);
    _bindSheetPhotoInputs(sheet);
    _bindSheetTextInput(sheet);
    const micBtn = sheet.querySelector('#asstMicBtn');
    if (micBtn) micBtn.addEventListener('click', _startVoiceInput);
  }

  function _bindSheetPhotoInputs(sheet) {
    // [v178 2026-05-18] file input 선택 → 펜딩에 추가 (자동 전송 X). 사용자 ▷ 누르면 전송.
    sheet.querySelector('#asstCamera').addEventListener('change', (e) => {
      const fs = e.target.files ? Array.from(e.target.files) : [];
      e.target.value = '';  // 같은 파일 재선택 허용
      if (fs.length) _addPendingPhotos(fs);
    });
    sheet.querySelector('#asstGallery').addEventListener('change', (e) => {
      const fs = e.target.files ? Array.from(e.target.files) : [];
      e.target.value = '';
      if (fs.length) _addPendingPhotos(fs);
    });
  }

  function _bindSheetTextInput(sheet) {
    sheet.querySelector('#asstInput').addEventListener('keydown', (e) => {
      // 한글 IME 조합 중 Enter 무시 (마지막 글자 중복/누락 방지)
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _send(); }
    });
    // Wave B5 — 입력 디바운스 typeahead
    let _typeTimer = null;
    sheet.querySelector('#asstInput').addEventListener('input', (e) => {
      if (_typeTimer) clearTimeout(_typeTimer);
      const v = (e.target.value || '').trim();
      _typeTimer = setTimeout(() => _renderTypeahead(v), 200);
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 음성 입력 (2026-04-26)
  //   1인샵 사장님은 시술 중 손이 바쁨 → 마이크로 자연어 입력.
  //   결과는 입력창에 채우기만 하고 자동 전송 X (사용자 검토 후 직접 전송).
  //   iOS Safari / Android Chrome / 데스크톱 Chrome 지원. Capacitor WebView
  //   는 폴백 미지원 — 별도 PR 에서 SpeechRecognizer 플러그인 통합.
  // ─────────────────────────────────────────────────────────────
  let _voiceInput = null;
  function _startVoiceInput() {
    if (!_voiceInput && window.ItdasyAssistantVoiceInput) {
      _voiceInput = window.ItdasyAssistantVoiceInput.create();
    }
    if (_voiceInput && typeof _voiceInput.start === 'function') {
      _voiceInput.start();
    }
  }

  // Wave B5 — 의도 예측 chips 렌더
  function _renderTypeahead(text) {
    if (typeof _assistantSuggestionControls.renderTypeahead === 'function') {
      _assistantSuggestionControls.renderTypeahead(text, { getCustomers: _getCustomers });
    }
  }

  // 렉 박멸 — _renderHistory 호출 → 이번 frame 1회 실행 (RAF debounce)
  // sheet 닫혀있으면 skip. 50개 이상이면 자동 cap.
  function _renderHistory() {
    _capHistory();
    if (_renderRafId) return; // 이미 예약됨
    const sheet = document.getElementById('assistantSheet');
    // sheet 닫혀있으면 다음 open 때 _renderHistory() 호출되므로 지금은 skip (DOM 작업 절감 ~50ms/render)
    if (!sheet || sheet.style.display === 'none') return;
    const sig = _historySig();
    if (sig === _lastRenderedSig) return; // 변경 없음 — skip
    _renderRafId = (window.requestAnimationFrame || window.setTimeout).call(window, () => {
      _renderRafId = 0;
      _lastRenderedSig = _historySig();
      _renderHistoryImpl();
    }, 0);
  }
  // assistant 메시지 한 개 → HTML. 캐시 가능하도록 분리.
  function _renderAssistantMessage(m, idx) {
    const actionHtml = m.action ? _renderActionBubble(m.action, idx, m.action_status, m.edit_mode === true) : '';
    const groupsHtml = (m.action_groups && m.action_groups.length)
      ? (m.unified_mode
          ? _renderUnifiedCard(m, idx)
          : _renderActionGroups(m.action_groups, idx, m.duplicate_warnings))
      : '';
    const dupHtml = (m.action && m.duplicate_warnings && m.duplicate_warnings.length)
      ? _renderDuplicateWarnings(idx, m.duplicate_warnings, 0)
      : '';
    const fallbackHtml = m.fallback ? _renderFallbackCard(m.fallback, idx, m.fallback_status) : '';
    const relatedHtml = _renderRelatedChips(m);
    const intentChipsHtml = _renderIntentChips(m, idx);
    const promoResultHtml = _renderPromoResult(m, idx);
    const photoResultHtml = _renderPhotoResult(m, idx);
    const looseTextHtml = promoResultHtml ? '' : `<div style="padding:2px 2px 0;font-size:14px;line-height:1.55;color:#191F28;font-weight:500;white-space:pre-wrap;letter-spacing:-0.2px;">${_esc(_normMsg(m.text))}</div>`;
    const reportHtml = promoResultHtml ? '' : `<div style="margin-top:4px;padding-left:2px;">
          <button data-report-ai="chat_answer" data-snippet="${_esc(m.text).replace(/"/g,'&quot;')}" data-source="/assistant/chat" aria-label="AI 답변 신고"
            style="background:transparent;border:none;cursor:pointer;font-size:10px;color:#C5CBD2;padding:2px 4px;display:inline-flex;align-items:center;gap:3px;">${_svg('ic-flag', 11)} 신고</button>
        </div>`;
    return `<div class="asst-msg asst-msg--ai" style="display:flex;gap:10px;margin-bottom:14px;align-items:flex-start;">
      <div style="width:40px;height:40px;border-radius:50%;background:#F7EFF0;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;color:#BC6675;">${_svg('ic-bot', 22)}</div>
      <div style="max-width:85%;min-width:0;flex:1;">
        ${promoResultHtml}
        ${_renderItbiCardsPromo(m, idx)}
        ${photoResultHtml}
        ${looseTextHtml}
        ${reportHtml}
        ${dupHtml}
        ${actionHtml}
        ${groupsHtml}
        ${fallbackHtml}
        ${relatedHtml}
        ${intentChipsHtml}
        ${promoResultHtml ? '' : _renderTplRecos(m, idx)}
        ${_renderBriefingActions(m, idx)}
        ${promoResultHtml ? '' : _renderHubActions(m, idx)}
      </div>
    </div>`;
  }

  function _renderPromoResult(m, idx) {
    const R = window.ItdasyPromoResultCard;
    if (!m.promo_result || !R || typeof R.render !== 'function') return '';
    return R.render(m, idx, { esc: _esc });
  }

  // [PR1] promo 경로 전용 잇비 결과 카드 렌더. 비-promo 는 _renderPhotoResult 안에서 이미 렌더되므로
  //   promo_result 가 있을 때만 별도 렌더(중복 방지). 클릭은 기존 _handleItbiCardClick 재사용.
  function _renderItbiCardsPromo(m, idx) {
    if (!m.promo_result || !m.itbi_cards) return '';
    if (!(window.PhotoEditorItbiCards && typeof window.PhotoEditorItbiCards.renderHTML === 'function')) return '';
    return window.PhotoEditorItbiCards.renderHTML(m.itbi_cards, idx);
  }

  // [J-2] 일반 메시지의 Action Hub 버튼(hub_actions). photo_result 안에서 이미 렌더되는 경우는 제외(중복 방지).
  function _renderHubActions(m, idx) {
    if (m.promo_result) return '';
    if (m.photo_result) return '';
    if (!Array.isArray(m.hub_actions) || !m.hub_actions.length) return '';
    if (!(window.ItdasyActionHub && typeof window.ItdasyActionHub.renderActionHub === 'function')) return '';
    return window.ItdasyActionHub.renderActionHub(m.hub_actions, { idx, defaultRoute: 'hub' });
  }

  // [CF-2] 잇비 메시지에 추천 템플릿 3개 카드 직접 표시. templates-v2.recoCardHtml 재사용(썸네일·배지·태그·Pro가치).
  //   카드 클릭→큰 미리보기(bindRecoCards). 흰 채팅 배경이라 카드는 자체 스타일 포함.
  function _renderTplRecos(m, idx) {
    if (m.promo_result) return '';
    if (!Array.isArray(m.tpl_recos) || !m.tpl_recos.length) return '';
    const TV = window.PhotoEditorTemplatesV2;
    if (!TV || typeof TV.recoCardHtml !== 'function') return '';
    const cards = m.tpl_recos.map(id => TV.recoCardHtml(id)).filter(Boolean).join('');
    if (!cards) return '';
    return `<div class="asst-tpl-recos" data-asst-tpl-recos="${idx}" style="margin-top:10px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">${cards}</div>`;
  }

  // [T-115] Daily Briefing 추천 버튼 (안전 — 화면 이동/초안 경로만). intent-chip 패턴 미러링.
  function _renderBriefingActions(m, idx) {
    if (!Array.isArray(m.briefing_actions) || !m.briefing_actions.length) return '';
    // [J-1] Action Hub 규격으로 렌더(phase 라벨링). 클릭은 기존 data-asst-brief-act 경로(T-115 runAction) 유지.
    if (window.ItdasyActionHub && typeof window.ItdasyActionHub.renderActionHub === 'function') {
      return window.ItdasyActionHub.renderActionHub(m.briefing_actions, { idx, defaultRoute: 'brief' });
    }
    return `<div class="asst-chips asst-chips--brief" style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;">
      ${m.briefing_actions.map((a) => `<button data-asst-brief-act="${idx}:${_esc(a.id)}" style="padding:9px 16px;border:0.5px solid #E5E8EB;border-radius:999px;background:#FFFFFF;color:#4E5968;cursor:pointer;font-size:13px;font-weight:600;">${_esc(a.label)}</button>`).join('')}
    </div>`;
  }

  function _renderRelatedChips(m) {
    return (m.related && m.related.length) ? `
      <div class="asst-chips asst-chips--related" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">
        ${m.related.map(q => `<button data-suggest="${_esc(q)}" style="padding:7px 12px;border:0.5px solid #E5E8EB;border-radius:999px;background:#FFFFFF;cursor:pointer;font-size:12px;color:#4E5968;white-space:nowrap;font-weight:600;transition:all 0.12s;">${_esc(q)}</button>`).join('')}
      </div>` : '';
  }

  function _renderIntentChips(m, idx) {
    if (!Array.isArray(m.intent_chips) || !m.intent_chips.length) return '';
    return `<div class="asst-chips asst-chips--intent" style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;">
      ${m.intent_chips.map(c => {
        const style = c.primary
          ? 'padding:10px 18px;border:none;border-radius:999px;background:#191F28;color:#FFFFFF;cursor:pointer;font-size:13px;font-weight:700;letter-spacing:-0.2px;'
          : 'padding:9px 16px;border:0.5px solid #E5E8EB;border-radius:999px;background:#FFFFFF;color:#4E5968;cursor:pointer;font-size:13px;font-weight:600;';
        return `<button data-asst-intent-chip="${idx}:${_esc(c.id)}" style="${style}">${_esc(c.label)}</button>`;
      }).join('')}
    </div>`;
  }

  function _renderPhotoResult(m, idx) {
    if (m.promo_result) return '';
    if (!m.photo_result || !m.photo_result.dataUrl) return '';
    // [J-1] hub_actions 있으면 Action Hub 규격으로 렌더. 없으면(과거 메시지) 기존 photo_actions 폴백.
    let actsHtml;
    if (Array.isArray(m.hub_actions) && m.hub_actions.length && window.ItdasyActionHub) {
      actsHtml = window.ItdasyActionHub.renderActionHub(m.hub_actions, { idx, defaultRoute: 'photo' });
    } else {
      const acts = Array.isArray(m.photo_actions) ? m.photo_actions : [];
      actsHtml = `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">${acts.map(a => `<button data-asst-photo-act="${idx}:${_esc(a.id)}" style="padding:7px 12px;border:0.5px solid #E5E8EB;border-radius:999px;background:#FFFFFF;color:#4E5968;cursor:pointer;font-size:11px;font-weight:600;">${_esc(a.label)}</button>`).join('')}</div>`;
    }
    const capHtml = m.photo_caption ? `<div style="font-size:11px;color:#888;margin-top:4px;">${_esc(m.photo_caption)}</div>` : '';
    // [잇비 결과 카드 v0] 결과 카드 3개 — 적용 누르면 원본+initialState 로 편집기 오픈(핸드오프).
    const cardsHtml = (m.itbi_cards && window.PhotoEditorItbiCards && typeof window.PhotoEditorItbiCards.renderHTML === 'function')
      ? window.PhotoEditorItbiCards.renderHTML(m.itbi_cards, idx) : '';
    return `<div style="margin-bottom:8px;">
      <img src="${_esc(m.photo_result.dataUrl)}" alt="보정 결과" style="max-width:240px;max-height:300px;border-radius:14px;display:block;box-shadow:0 4px 14px rgba(0,0,0,0.08);cursor:zoom-in;" data-asst-photo-result="${idx}" />
      ${cardsHtml}
      ${actsHtml}
      ${capHtml}
    </div>`;
  }

  function _renderHistoryImpl() {
    const body = document.getElementById('asstBody');
    if (!body) return;
    if (!_history.length) {
      body.innerHTML = _renderEmptyHistory();
      return;
    }
    body.innerHTML = _history.map((m, idx) => _renderHistoryMessage(m, idx)).join('');
    body.scrollTop = body.scrollHeight;
    _bindActionButtons();
    _bindAssistantTemplateCards(body);
    // [CF-2] 추천 템플릿 카드 썸네일 주입 + 클릭→미리보기 바인딩.
    try {
      const TV = window.PhotoEditorTemplatesV2;
      if (TV && typeof TV.bindRecoCards === 'function') {
        body.querySelectorAll('[data-asst-tpl-recos]').forEach((el) => TV.bindRecoCards(el));
      }
    } catch (_e) { void 0; }
  }

  function _bindAssistantTemplateCards(body) {
    body.querySelectorAll('[data-asst-tpl-recos]').forEach((wrap) => {
      if (wrap.dataset.asstTplBound === '1') return;
      wrap.dataset.asstTplBound = '1';
      wrap.addEventListener('click', _onAssistantTemplateCardClick, true);
    });
  }

  function _onAssistantTemplateCardClick(e) {
    const btn = e.target && e.target.closest && e.target.closest('[data-tpv2-tpl]');
    if (!btn) return;
    const wrap = btn.closest('[data-asst-tpl-recos]');
    const msg = wrap ? _history[+wrap.dataset.asstTplRecos] : null;
    const src = _templateSourceUrl({ payload: {} }, msg);
    if (!src) return;
    e.preventDefault(); e.stopImmediatePropagation();
    _selectAssistantTemplate(src, btn.dataset.tpv2Tpl, {
      payload: { dataUrl: src, recommendedIds: _templateIdsForPicker({}, msg) },
    });
  }

  function _renderEmptyHistory() {
    return `<div style="padding:30px 20px;text-align:center;">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:50%;background:#F7EFF0;color:#BC6675;margin-bottom:12px;">${_svg('ic-bot', 36)}</div>
      <div style="font-size:15px;color:#191F28;line-height:1.6;font-weight:600;letter-spacing:-0.3px;">안녕하세요 원장님 👋<br>궁금한 건 물어보고, 할 일은 맡겨주세요.</div>
      <div style="margin-top:16px;text-align:left;display:inline-block;font-size:12px;color:#4E5968;line-height:1.7;background:#F7F8FA;padding:14px 16px;border-radius:14px;">
        <div style="font-weight:700;color:#191F28;margin-bottom:6px;">제가 도와드릴 수 있는 일</div>
        • 예약/매출/고객 추가·수정·취소<br>
        • 사진 보정 · 배경 교체 · 전후 카드<br>
        • SNS 캡션 작성 · 인스타 게시<br>
        • 단골 안부 · 메시지 초안 작성<br>
        • 사진만 올려도 OK — 카톡 캡처·명함·영수증 자동 인식<br>
        • 말투 분석 리포트<br>
        <span style="font-size:11px;color:#8B95A1;">예: "김서연 2시 예약 추가" · "사진 보정해줘" · 카톡 캡처/명함 사진 그냥 올리기</span>
      </div>
    </div>`;
  }

  function _renderHistoryMessage(m, idx) {
    if (m.role === 'user') return _renderUserMessage(m, idx);
    if (m.role === 'assistant') return _renderCachedAssistantMessage(m, idx);
    return _renderLoadingMessage();
  }

  function _renderUserMessage(m, idx) {
    if (m._cachedHtml && m._cachedIdx === idx) return m._cachedHtml;
    const photosHtml = _renderUserPhotos(m, idx);
    const html = `<div class="asst-msg asst-msg--user" style="display:flex;justify-content:flex-end;margin-bottom:14px;">
      <div style="max-width:85%;padding:11px 16px;background:#F2F4F6;color:#191F28;border-radius:18px 18px 4px 18px;font-size:14px;line-height:1.5;font-weight:500;letter-spacing:-0.2px;">${photosHtml}${_esc(m.text)}</div>
    </div>`;
    try { m._cachedHtml = html; m._cachedIdx = idx; } catch (_e) { void _e; }
    return html;
  }

  function _renderUserPhotos(m, idx) {
    const photoArr = (Array.isArray(m.photos) && m.photos.length) ? m.photos : (m.thumb ? [m.thumb] : []);
    if (photoArr.length === 1) {
      return `<img data-asst-photo="${idx}:0" src="${_esc(photoArr[0])}" alt="업로드 사진" style="max-width:180px;max-height:180px;border-radius:12px;margin-bottom:6px;display:block;object-fit:cover;cursor:zoom-in;" />`;
    }
    if (photoArr.length <= 1) return '';
    const cells = photoArr.map((u, i) => `
      <div style="position:relative;width:80px;height:80px;border-radius:10px;overflow:hidden;flex-shrink:0;cursor:zoom-in;background:rgba(255,255,255,0.1);" data-asst-photo="${idx}:${i}">
        <img src="${_esc(u)}" alt="업로드 사진 ${i + 1}" style="width:100%;height:100%;object-fit:cover;display:block;" />
      </div>`).join('');
    return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;max-width:280px;">${cells}</div>`;
  }

  function _renderCachedAssistantMessage(m, idx) {
    if (idx === _history.length - 1) return _renderAssistantMessage(m, idx);
    const dirtyKey = _assistantDirtyKey(m, idx);
    if (m._cachedHtml && m._cachedDirtyKey === dirtyKey) return m._cachedHtml;
    const html = _renderAssistantMessage(m, idx);
    try { m._cachedHtml = html; m._cachedDirtyKey = dirtyKey; } catch (_e) { void _e; }
    return html;
  }

  function _assistantDirtyKey(m, idx) {
    return (m.action_status || '_') + '|' + (m.edit_mode ? '1' : '0')
      + '|' + (m.fallback_status || '_')
      + '|' + ((m.action_groups || []).map(g => (g.expanded ? 'E' : 'C') + ':'
          + (g.items || []).map(it => (it.status || '_') + (it.editing ? 'e' : '') + (it.skipped ? 's' : '')).join(',')).join(';'))
      + '|' + (m.promo_result ? 'W' + ((m.promo_result.afterDataUrl || '').length) : '_')
      + '|' + (m.photo_result ? 'P' + (m.photo_result.dataUrl ? m.photo_result.dataUrl.length : 0) : '_')
      + '|' + (Array.isArray(m.intent_chips) ? 'C' + m.intent_chips.length : '_')
      + '|' + idx;
  }

  function _renderLoadingMessage() {
    const elapsedHtml = _renderLoadingElapsed();
    return `<div class="asst-msg asst-msg--ai" style="display:flex;gap:10px;margin-bottom:14px;align-items:flex-start;">
      <div style="width:40px;height:40px;border-radius:50%;background:#F7EFF0;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;color:#BC6675;">${_svg('ic-bot', 22)}</div>
      <div style="padding:2px 2px 0;display:flex;flex-direction:column;gap:4px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:14px;color:#4E5968;font-weight:500;letter-spacing:-0.2px;">잇비가 생각하고 있어요</span>
          <span style="display:inline-flex;gap:3px;">
            <span style="width:5px;height:5px;border-radius:50%;background:#8B95A1;animation:asstDot 1.2s infinite;animation-delay:0s;"></span>
            <span style="width:5px;height:5px;border-radius:50%;background:#8B95A1;animation:asstDot 1.2s infinite;animation-delay:.2s;"></span>
            <span style="width:5px;height:5px;border-radius:50%;background:#8B95A1;animation:asstDot 1.2s infinite;animation-delay:.4s;"></span>
          </span>
        </div>
        ${elapsedHtml}
      </div>
    </div>
    <style>@keyframes asstDot { 0%,80%,100% { transform:translateY(0);opacity:.4; } 40% { transform:translateY(-3px);opacity:1; } }</style>`;
  }

  function _renderLoadingElapsed() {
    try {
      const pending = _readChatPending();
      if (!pending || !pending.started_at) return '';
      const sec = Math.max(0, Math.floor((Date.now() - pending.started_at) / 1000));
      const label = pending.kind === 'images' ? '사진 분석 중' : '답변 생성 중';
      // [2026-05-26] 고정 id — _tickLoadingElapsed 가 텍스트만 부분갱신 (전체 재렌더 X)
      return `<div id="asstLoadingElapsed" style="font-size:11px;color:#888;margin-top:4px;">${label}… (${sec}초 경과)</div>`;
    } catch (_e) { return ''; }
  }

  // [2026-05-26] 답변 대기 중 1초마다 #asstLoadingElapsed 텍스트만 갱신.
  // 옛 동작은 _renderHistory() 전체 호출 → 깜빡임. 요소 없으면(loading 메시지 X) 노옵.
  function _tickLoadingElapsed() {
    const el = document.getElementById('asstLoadingElapsed');
    if (!el) return;
    try {
      const pending = _readChatPending();
      if (!pending || !pending.started_at) return;
      const sec = Math.max(0, Math.floor((Date.now() - pending.started_at) / 1000));
      const label = pending.kind === 'images' ? '사진 분석 중' : '답변 생성 중';
      el.textContent = `${label}… (${sec}초 경과)`;
    } catch (_e) { /* ignore */ }
  }

  // 재고·지출 품목 리스트 편집 UI
  // fieldAttr: 'single-field' (단일 액션) 또는 'row-field' (그룹 행)
  // itemAddAttr / itemDelAttr: 추가·삭제 버튼에 붙일 data- 속성명
  // keyPrefix: 단일 액션은 historyIdx 숫자, 그룹 행은 "hi:gi:ii" 문자열
  // compact: 그룹 행용 축소 버전
  function _renderItemsEditor(keyPrefix, items, opts) {
    const o = opts || {};
    const fieldAttr = o.fieldAttr || 'row-field';
    const addAttr = o.addAttr || 'row-item-add';
    const delAttr = o.delAttr || 'row-item-delete';
    const compact = o.compact === true;
    const color = o.color || '#2B8C7E';
    const list = Array.isArray(items) ? items : [];
    const sz = compact
      ? { fs: '10px', pad: '5px 7px', gap: '5px', btn: '28px' }
      : { fs: '11px', pad: '7px 9px', gap: '6px', btn: '32px' };
    const rows = list.map((it, i) => {
      const name = (it && it.name) || '';
      const qty = (it && (it.quantity ?? it.qty)) != null ? (it.quantity ?? it.qty) : 1;
      const unit = (it && (it.unit_price ?? it.unitPrice));
      const cat = (it && it.category) || '';
      return `
        <div style="display:grid;grid-template-columns:2fr 0.9fr 1.1fr 1fr ${sz.btn};gap:${sz.gap};align-items:center;">
          <input data-${fieldAttr}="${keyPrefix}:items:${i}:name" value="${_esc(name)}" placeholder="품목명"
            style="padding:${sz.pad};border:1px solid hsl(220,15%,85%);border-radius:8px;font-size:${sz.fs};background:#fff;min-width:0;" />
          <input data-${fieldAttr}="${keyPrefix}:items:${i}:quantity" type="number" inputmode="numeric" min="0" value="${_esc(qty)}" placeholder="수량"
            style="padding:${sz.pad};border:1px solid hsl(220,15%,85%);border-radius:8px;font-size:${sz.fs};background:#fff;min-width:0;" />
          <input data-${fieldAttr}="${keyPrefix}:items:${i}:unit_price" type="number" inputmode="numeric" min="0" value="${_esc(unit == null ? '' : unit)}" placeholder="단가"
            style="padding:${sz.pad};border:1px solid hsl(220,15%,85%);border-radius:8px;font-size:${sz.fs};background:#fff;min-width:0;" />
          <select data-${fieldAttr}="${keyPrefix}:items:${i}:category"
            style="padding:${sz.pad};border:1px solid hsl(220,15%,85%);border-radius:8px;font-size:${sz.fs};background:#fff;min-width:0;">
            <option value=""${cat ? '' : ' selected'}>분류</option>
            ${_categoryOptionsHtml(cat)}
          </select>
          <button data-${delAttr}="${keyPrefix}:${i}" aria-label="품목 삭제" title="품목 삭제"
            style="padding:0;border:1px solid hsl(0,60%,85%);border-radius:8px;background:hsl(0,70%,98%);color:hsl(0,60%,45%);cursor:pointer;font-size:${sz.fs};height:100%;display:inline-flex;align-items:center;justify-content:center;">${_svg('ic-trash-2', compact ? 12 : 13)}</button>
        </div>`;
    }).join('');
    const emptyHint = list.length ? '' : `<div style="font-size:11px;color:var(--text-subtle);padding:6px 2px;">품목이 없어요. 아래 버튼으로 추가하세요.</div>`;
    return `
      <div style="display:flex;flex-direction:column;gap:${sz.gap};">${rows}${emptyHint}</div>
      <button data-${addAttr}="${keyPrefix}"
        style="margin-top:6px;padding:7px 10px;border:1px dashed ${color};border-radius:8px;background:#fff;color:${color};font-size:${sz.fs};font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:5px;">${_svg('ic-plus', 12)} 품목 추가</button>`;
  }

  // [QA-r11 PR3 2026-05-16] 영수증 receipt-level expense — 할인·쿠폰·포인트·세금 편집기.
  // _renderItemsEditor 형태와 동일한 패턴. payload.adjustments[i] = {kind, amount}.
  function _renderAdjustmentsEditor(keyPrefix, adjustments, opts) {
    const o = opts || {};
    const fieldAttr = o.fieldAttr || 'row-field';
    const addAttr = o.addAttr || 'row-adjustment-add';
    const delAttr = o.delAttr || 'row-adjustment-delete';
    const compact = o.compact === true;
    const color = o.color || '#E07A5F';
    const list = Array.isArray(adjustments) ? adjustments : [];
    const sz = compact
      ? { fs: '10px', pad: '5px 7px', gap: '5px', btn: '28px' }
      : { fs: '11px', pad: '7px 9px', gap: '6px', btn: '32px' };
    const _kindOpts = (sel) => {
      const opts2 = [
        ['card_discount', '카드할인'],
        ['coupon', '쿠폰'],
        ['point', '포인트사용'],
        ['tax', '부가세'],
        ['service', '봉사료'],
        ['membership', '멤버십'],
      ];
      return opts2.map(([v, l]) => `<option value="${v}"${v === sel ? ' selected' : ''}>${l}</option>`).join('');
    };
    const rows = list.map((ad, i) => {
      const k = (ad && ad.kind) || '';
      const amt = (ad && ad.amount) != null ? ad.amount : '';
      return `
        <div style="display:grid;grid-template-columns:1.2fr 1fr ${sz.btn};gap:${sz.gap};align-items:center;">
          <select data-${fieldAttr}="${keyPrefix}:adjustments:${i}:kind"
            style="padding:${sz.pad};border:1px solid hsl(220,15%,85%);border-radius:8px;font-size:${sz.fs};background:#fff;min-width:0;">
            <option value=""${k ? '' : ' selected'}>종류</option>
            ${_kindOpts(k)}
          </select>
          <input data-${fieldAttr}="${keyPrefix}:adjustments:${i}:amount" type="number" inputmode="numeric" min="0" value="${_esc(amt === '' ? '' : amt)}" placeholder="차감액"
            style="padding:${sz.pad};border:1px solid hsl(220,15%,85%);border-radius:8px;font-size:${sz.fs};background:#fff;min-width:0;" />
          <button data-${delAttr}="${keyPrefix}:${i}" aria-label="할인 삭제" title="할인 삭제"
            style="padding:0;border:1px solid hsl(0,60%,85%);border-radius:8px;background:hsl(0,70%,98%);color:hsl(0,60%,45%);cursor:pointer;font-size:${sz.fs};height:100%;display:inline-flex;align-items:center;justify-content:center;">${_svg('ic-trash-2', compact ? 12 : 13)}</button>
        </div>`;
    }).join('');
    const emptyHint = list.length ? '' : `<div style="font-size:11px;color:var(--text-subtle);padding:6px 2px;">할인·쿠폰·포인트가 있으면 추가하세요.</div>`;
    return `
      <div style="display:flex;flex-direction:column;gap:${sz.gap};">${rows}${emptyHint}</div>
      <button data-${addAttr}="${keyPrefix}"
        style="margin-top:6px;padding:7px 10px;border:1px dashed ${color};border-radius:8px;background:#fff;color:${color};font-size:${sz.fs};font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:5px;">${_svg('ic-plus', 12)} 할인/쿠폰 추가</button>`;
  }

  // [QA-r11 PR3] 영수증 expense 편집 폼 하단의 합계 검증 라인.
  // 정가합 X - 할인 Y = 결제 Z. amount 와 다르면 ⚠ 차액 표시.
  function _renderExpenseSummary(p) {
    const items = Array.isArray(p && p.items) ? p.items : [];
    const adj = Array.isArray(p && p.adjustments) ? p.adjustments : [];
    const itemsTotal = items.reduce((s, it) => s + (Number(it && it.total) || 0), 0);
    const adjTotal = adj.reduce((s, a) => s + (Number(a && a.amount) || 0), 0);
    const expected = itemsTotal - adjTotal;
    const amount = Number((p && p.amount) || 0);
    const _f = (n) => Number(n || 0).toLocaleString() + '원';
    if (!itemsTotal && !adjTotal) return '';
    const diff = expected - amount;
    const warn = (itemsTotal > 0 && amount > 0 && Math.abs(diff) > 100);
    return `<div style="margin-top:10px;padding:10px 12px;background:#F7F8FA;border:none;border-radius:10px;font-size:11.5px;color:#4E5968;line-height:1.6;">
      정가합 <b style="color:#191F28;">${_f(itemsTotal)}</b> ${adjTotal > 0 ? `− 할인 <b style="color:#191F28;">${_f(adjTotal)}</b>` : ''} = 예상 <b style="color:#191F28;">${_f(expected)}</b>
      ${amount > 0 ? `<br/>결제금액 <b style="color:#191F28;">${_f(amount)}</b>${warn ? ` <span style="color:#C2410C;font-weight:700;">⚠ 차이 ${_f(Math.abs(diff))}</span>` : (itemsTotal ? ' <span style="color:#0F8746;font-weight:700;">✓</span>' : '')}` : ''}
    </div>`;
  }

  // ─── 중복 의심 경고 카드 (영수증·주문내역 여러 장 업로드 시) ───
  // warnings: [{action_index, reason, prev, confidence, dismissed}]
  // 특정 action_index 에 해당하는 경고만 필터해서 렌더. 없으면 빈 문자열.
  function _renderDuplicateWarnings(historyIdx, warnings, filterActionIdx) {
    if (!Array.isArray(warnings) || !warnings.length) return '';
    const rendered = warnings.map((w, wi) => {
      if (w.dismissed) return '';
      if (filterActionIdx != null && w.action_index !== filterActionIdx) return '';
      const reason = w.reason || '비슷한 내용을 최근에 기록했어요';
      return `
        <div style="margin:6px 0;padding:10px 12px;background:#FFF7ED;border:1px solid #FDBA74;border-radius:12px;">
          <div style="font-size:12px;font-weight:700;color:#C2410C;margin-bottom:6px;display:inline-flex;align-items:center;gap:4px;">${_svg('ic-alert-triangle', 12)} 중복 의심</div>
          <div style="font-size:12px;color:#7C2D12;line-height:1.5;">${_esc(reason)}</div>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <button data-dup-proceed="${historyIdx}:${wi}" style="flex:1;padding:7px;border:1px solid #C2410C;border-radius:8px;background:#fff;color:#C2410C;cursor:pointer;font-size:11px;">그래도 추가</button>
            <button data-dup-skip="${historyIdx}:${wi}" style="flex:1;padding:7px;border:none;border-radius:8px;background:#C2410C;color:#fff;cursor:pointer;font-size:11px;">건너뛰기</button>
          </div>
        </div>`;
    }).filter(Boolean).join('');
    return rendered;
  }

  function _renderActionBubble(action, historyIdx, status, editing) {
    if (!action || !action.kind) return '';
    const kindBadge = _actionKindBadge(action.kind);
    if (status === 'done') return _renderActionDoneBubble();
    if (status === 'failed') return _renderActionFailedBubble(historyIdx);
    if (status === 'running') return _renderActionRunningBubble(kindBadge);
    if (editing) return _renderActionEditBubble(action, historyIdx, kindBadge);
    return _renderActionPendingBubble(action, historyIdx, kindBadge);
  }

  function _actionKindBadge(kind) {
    // [2026-05-26] 종류색 12+종 → 무채색 통일. 카드는 흰 배경 + 0.5px 무채 테두리.
    const C = '#4E5968';
    return {
      create_booking:  { icon: 'ic-calendar',       label: '예약 추가',       color: C },
      create_revenue:  { icon: 'ic-wallet',         label: '매출 기록',       color: C },
      create_customer: { icon: 'ic-user',           label: '고객 등록',       color: C },
      create_nps:      { icon: 'ic-star',           label: '후기 기록',       color: C },
      update_booking:  { icon: 'ic-edit-3',         label: '예약 수정',       color: C },
      cancel_booking:  { icon: 'ic-trash-2',        label: '예약 취소',       color: C },
      reschedule_booking: { icon: 'ic-refresh-cw',  label: '예약 시간 변경',  color: C },
      update_customer: { icon: 'ic-edit-3',         label: '고객 정보 수정',  color: C },
      create_expense:  { icon: 'ic-credit-card',    label: '지출 기록',       color: C },
      upsert_inventory: { icon: 'ic-package',       label: '재고 추가',       color: C },
      generate_bulk_message: { icon: 'ic-message-square', label: '단체 메시지 초안', color: C },
      charge_membership:     { icon: 'ic-credit-card',  label: '회원권 충전',   color: C },
      use_membership:        { icon: 'ic-credit-card',  label: '회원권 사용',   color: C },
      mark_booking_no_show:  { icon: 'ic-x-octagon',    label: '노쇼 처리',     color: C },
      mark_booking_completed:{ icon: 'ic-check-circle', label: '시술 완료',     color: C },
      refund_revenue:        { icon: 'ic-corner-up-left', label: '환불 처리',   color: C },
      update_service_price:  { icon: 'ic-dollar-sign',  label: '가격 변경',     color: C },
    }[kind] || { icon: 'ic-check', label: kind, color: C };
  }

  function _renderActionDoneBubble() {
    return `<div class="asst-card asst-card--done" style="margin-top:8px;padding:12px 14px;background:#FFFFFF;color-scheme:light;border:0.5px solid #E5E8EB;border-radius:14px;display:flex;align-items:center;gap:8px;">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#E2F8EB;color:#0F8746;">${_svg('ic-check', 13)}</span>
      <span style="font-size:12px;font-weight:700;color:#0F8746;">완료</span>
    </div>`;
  }

  function _renderActionFailedBubble(historyIdx) {
    let errLine = '';
    try {
      const msg = Array.isArray(_history) ? _history[historyIdx] : null;
      if (msg && msg.action_error) {
        errLine = `<div style="font-size:11px;color:#B0353A;margin-top:4px;line-height:1.4;">사유: ${_esc(msg.action_error)}</div>`;
      }
    } catch (_e) { void _e; }
    return `<div class="asst-card asst-card--failed" style="margin-top:8px;padding:12px 14px;background:#FFFFFF;color-scheme:light;border:0.5px solid #E5E8EB;border-radius:14px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#FBE9EA;color:#E5484D;">${_svg('ic-x', 12)}</span>
        <span style="font-size:12px;font-weight:700;color:#E5484D;">실패 — 다시 말씀해 주세요</span>
      </div>
      ${errLine}
    </div>`;
  }

  function _renderActionRunningBubble(_kindBadge) {
    return `<div class="asst-card asst-card--running" style="margin-top:8px;padding:14px;background:#FFFFFF;color-scheme:light;border:0.5px solid #E5E8EB;border-radius:14px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="display:inline-block;width:14px;height:14px;border:2px solid #C5CBD2;border-top-color:#191F28;border-radius:50%;animation:asst-spin 0.8s linear infinite;"></span>
        <span style="font-size:13px;font-weight:600;color:#4E5968;">저장 중…</span>
      </div>
    </div>
    <style>@keyframes asst-spin { to { transform: rotate(360deg); } }</style>`;
  }

  function _renderActionEditBubble(action, historyIdx, kindBadge) {
    const p = action.payload || {};
    const editFields = [];
    const addField = (field, label, val, extra) => _pushSingleEditField(editFields, historyIdx, field, label, val, extra);
    const itemsHtml = _singleEditItemsHtml(action, historyIdx, p, kindBadge, addField);
    if (!itemsHtml) _pushSingleBaseFields(action, p, editFields, addField, historyIdx);
    return `<div class="asst-card asst-card--edit" style="margin-top:8px;padding:14px;background:#FFFFFF;color-scheme:light;border:0.5px solid #E5E8EB;border-radius:14px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <span style="display:inline-flex;align-items:center;color:${kindBadge.color};">${_svg(kindBadge.icon, 16)}</span>
        <span style="font-size:12px;font-weight:700;color:#191F28;letter-spacing:-0.2px;">${kindBadge.label} · 편집 모드</span>
      </div>
      ${editFields.length ? `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">${editFields.join('')}</div>` : ''}
      ${itemsHtml}
      <div style="display:flex;gap:6px;margin-top:12px;">
        <button data-action-save="${historyIdx}" style="flex:1;padding:11px;border:none;border-radius:10px;background:#191F28;color:#FFFFFF;font-weight:700;cursor:pointer;font-size:13px;display:inline-flex;align-items:center;justify-content:center;gap:5px;letter-spacing:-0.2px;">${_svg('ic-save', 14)} 저장</button>
        <button data-action-editcancel="${historyIdx}" style="flex:1;padding:11px;border:0.5px solid #E5E8EB;border-radius:10px;background:#FFFFFF;color:#4E5968;cursor:pointer;font-size:13px;font-weight:600;">취소</button>
      </div>
    </div>`;
  }

  function _pushSingleEditField(list, historyIdx, field, label, val, extra) {
    if (val === undefined) return;
    const ex = extra || {};
    if (ex.select) {
      list.push(`<div style="display:flex;align-items:center;gap:8px;">
        <span style="width:52px;font-size:11px;color:#8B95A1;font-weight:600;">${label}</span>
        <select data-single-field="${historyIdx}:${field}" style="flex:1;padding:9px 12px;border:none;border-radius:10px;font-size:13px;background:#F7F8FA;color:#191F28;color-scheme:light;outline:none;">
          <option value=""${val ? '' : ' selected'}>선택</option>${_categoryOptionsHtml(val)}
        </select>
      </div>`);
      return;
    }
    list.push(`<div style="display:flex;align-items:center;gap:8px;">
      <span style="width:52px;font-size:11px;color:#8B95A1;font-weight:600;">${label}</span>
      <input data-single-field="${historyIdx}:${field}" type="${ex.type || 'text'}" value="${_esc(val == null ? '' : val)}" style="flex:1;padding:9px 12px;border:none;border-radius:10px;font-size:13px;background:#F7F8FA;color:#191F28;color-scheme:light;outline:none;" />
    </div>`);
  }

  function _singleEditItemsHtml(action, historyIdx, p, kindBadge, addField) {
    if (action.kind === 'upsert_inventory') {
      if (!Array.isArray(p.items)) p.items = [];
      if ('memo' in p) addField('memo', '메모', p.memo);
      return `<div style="font-size:11px;font-weight:600;color:#8B95A1;margin-bottom:4px;">품목</div>
        ${_renderItemsEditor(String(historyIdx), p.items, {
          fieldAttr: 'single-field', addAttr: 'single-item-add', delAttr: 'single-item-delete', color: kindBadge.color,
        })}`;
    }
    if (action.kind !== 'create_expense') return '';
    addField('vendor', '가게', p.vendor == null ? '' : p.vendor);
    addField('amount', '결제', p.amount == null ? '' : p.amount, { type: 'number' });
    addField('category', '분류', p.category == null ? '' : p.category, { select: true });
    addField('memo', '메모', p.memo == null ? '' : p.memo);
    if (!Array.isArray(p.items)) p.items = [];
    if (!Array.isArray(p.adjustments)) p.adjustments = [];
    return _singleExpenseEditors(historyIdx, p, kindBadge);
  }

  function _singleExpenseEditors(historyIdx, p, kindBadge) {
    return `<div style="font-size:11px;font-weight:600;color:#8B95A1;margin:10px 0 4px;">품목 (정가 기준)</div>
      ${_renderItemsEditor(String(historyIdx), p.items, {
        fieldAttr: 'single-field', addAttr: 'single-item-add', delAttr: 'single-item-delete', color: kindBadge.color,
      })}
      <div style="font-size:11px;font-weight:600;color:#8B95A1;margin:10px 0 4px;">할인·쿠폰·포인트</div>
      ${_renderAdjustmentsEditor(String(historyIdx), p.adjustments, {
        fieldAttr: 'single-field', addAttr: 'single-adjustment-add', delAttr: 'single-adjustment-delete', color: kindBadge.color,
      })}
      ${_renderExpenseSummary(p)}`;
  }

  function _pushSingleBaseFields(action, p, editFields, addField, historyIdx) {
    if ('customer_name' in p || 'name' in p) addField('customer_name', '이름', p.customer_name ?? p.name);
    if ('customer_phone' in p || 'phone' in p) addField('customer_phone', '전화', p.customer_phone ?? p.phone);
    if ('service_name' in p) addField('service_name', '시술', p.service_name);
    if ('amount' in p) addField('amount', '금액', p.amount);
    if ('starts_at' in p) addField('starts_at', '시작', p.starts_at);
    if ('memo' in p) addField('memo', '메모', p.memo);
    if (editFields.length) return;
    editFields.push(`<div style="display:flex;align-items:center;gap:8px;">
      <span style="width:52px;font-size:11px;color:#8B95A1;font-weight:600;">내용</span>
      <input data-single-field="${historyIdx}:confirmation_text" value="${_esc(action.confirmation_text || '')}" style="flex:1;padding:9px 12px;border:none;border-radius:10px;font-size:13px;background:#F7F8FA;color:#191F28;color-scheme:light;outline:none;" />
    </div>`);
  }

  function _renderActionPendingBubble(action, historyIdx, kindBadge) {
    // [T-109] 마케팅/발송 액션은 실행 전 안전 라벨(실발송 가능/초안/게시준비) 표시.
    const _safety = (window.ItdasyMarketingSafety && typeof window.ItdasyMarketingSafety.renderSafetyHTML === 'function')
      ? window.ItdasyMarketingSafety.renderSafetyHTML(action, _esc) : '';
    return `<div class="asst-card asst-card--pending" style="margin-top:8px;padding:14px;background:#FFFFFF;color-scheme:light;border:0.5px solid #E5E8EB;border-radius:14px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <span style="display:inline-flex;align-items:center;color:${kindBadge.color};">${_svg(kindBadge.icon, 16)}</span>
        <span style="font-size:12px;font-weight:700;color:#191F28;letter-spacing:-0.2px;">${kindBadge.label}</span>
      </div>
      ${_safety}
      <div style="font-size:13.5px;color:#191F28;font-weight:500;margin-bottom:12px;line-height:1.5;padding:11px 12px;background:#F7F8FA;border-radius:10px;">${_esc(action.confirmation_text || '')}</div>
      <div style="display:flex;gap:6px;">
        <button data-action-edit="${historyIdx}" style="flex:1;padding:11px;border:0.5px solid #E5E8EB;border-radius:10px;background:#FFFFFF;color:#4E5968;font-weight:600;cursor:pointer;font-size:13px;display:inline-flex;align-items:center;justify-content:center;gap:5px;">${_svg('ic-edit-3', 14)} 수정</button>
        <button data-action-run="${historyIdx}" style="flex:2;padding:11px;border:none;border-radius:10px;background:#191F28;color:#FFFFFF;font-weight:700;cursor:pointer;font-size:13px;display:inline-flex;align-items:center;justify-content:center;gap:5px;letter-spacing:-0.2px;">추가하기 ${_svg('ic-check', 14)}</button>
        <button data-action-cancel="${historyIdx}" style="flex:1;padding:11px;border:0.5px solid #E5E8EB;border-radius:10px;background:#FFFFFF;color:#8B95A1;cursor:pointer;font-size:13px;font-weight:500;">취소</button>
      </div>
    </div>`;
  }

  // 액션 그룹 내 한 행을 사람이 읽을 수 있게 1줄로 요약
  // 2026-04-26 버그A·C 픽스 — kind 별 핵심 식별자 우선 노출
  //   create_expense   → vendor + memo + amount   (가게명 누락 방지)
  //   upsert_inventory → items[0].name + 수량      (항목명 누락 방지)
  //   create_revenue   → customer_name + service + amount
  //   create_customer  → name + phone
  //   create_booking   → customer_name + service + 시작 시각
  function _summarizeItem(action) {
    if (typeof _assistantCore.summarizeAction === 'function') {
      return _assistantCore.summarizeAction(action);
    }
    return (action && action.confirmation_text) || (action && action.kind) || '';
  }

  // 카테고리별로 묶인 액션 카드 렌더 (2건 이상일 때 사용)
  function _renderActionGroups(groups, historyIdx, duplicateWarnings) {
    if (!groups || !groups.length) return '';
    return groups.map((g, gIdx) => _renderActionGroup(g, historyIdx, gIdx, duplicateWarnings)).join('');
  }

  // 2026-04-24 — 통합 확인 카드 (unified preview)
  // 2~6건 · 서로 다른 kind 2종 이상 섞였을 때 노출.
  // 한 번의 [전체 추가] 로 순차 실행 (create_customer 먼저, 그 뒤 예약/매출).
  function _shouldUseUnifiedCard(groups) {
    if (!Array.isArray(groups) || groups.length < 2) return false;
    const total = groups.reduce((n, g) => n + (g.items ? g.items.length : 0), 0);
    if (total < 2 || total > 6) return false;
    const distinctKinds = new Set(groups.map(g => g.kind));
    return distinctKinds.size >= 2;
  }

  // create_customer 를 최상위로 정렬 — customer_id 참조 의존성 보호
  // (현재 백엔드 resolver 가 customer_name 으로 조회하지만, 방금 만든 고객은
  //  다음 액션 시점까지 DB 에 반영되어야 안전함)
  function _unifiedExecutionOrder(groups) {
    if (typeof _assistantCore.unifiedExecutionOrder === 'function') {
      return _assistantCore.unifiedExecutionOrder(groups);
    }
    return [];
  }

  function _cardRenderDeps() {
    return {
      esc: _esc,
      svg: _svg,
      catMeta: _catMeta,
      summarizeItem: _summarizeItem,
      unifiedExecutionOrder: _unifiedExecutionOrder,
      renderDuplicateWarnings: _renderDuplicateWarnings,
      renderItemsEditor: _renderItemsEditor,
      renderAdjustmentsEditor: _renderAdjustmentsEditor,
      renderExpenseSummary: _renderExpenseSummary,
      categoryOptionsHtml: _categoryOptionsHtml,
    };
  }

  function _renderUnifiedCard(msg, historyIdx) {
    if (typeof _assistantCardRenderers.renderUnifiedCard === 'function') {
      return _assistantCardRenderers.renderUnifiedCard(msg, historyIdx, _cardRenderDeps());
    }
    return '';
  }



  function _renderActionGroup(group, historyIdx, gIdx, duplicateWarnings) {
    if (typeof _assistantCardRenderers.renderActionGroup === 'function') {
      return _assistantCardRenderers.renderActionGroup(group, historyIdx, gIdx, duplicateWarnings, _cardRenderDeps());
    }
    return '';
  }

  // Wave B4 — 휴리스틱 프리뷰 카드 (answer/actions 둘 다 비었을 때)
  function _renderFallbackCard(extract, historyIdx, status) {
    if (!extract) return '';
    if (status === 'done') {
      return `<div class="asst-card asst-card--done" style="margin-top:8px;padding:12px 14px;background:#FFFFFF;color-scheme:light;border:0.5px solid #E5E8EB;border-radius:14px;display:flex;align-items:center;gap:8px;">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#E2F8EB;color:#0F8746;">${_svg('ic-check', 13)}</span>
        <span style="font-size:12px;font-weight:700;color:#0F8746;">저장했어요</span>
      </div>`;
    }
    if (status === 'failed') {
      return `<div class="asst-card asst-card--failed" style="margin-top:8px;padding:12px 14px;background:#FFFFFF;color-scheme:light;border:0.5px solid #E5E8EB;border-radius:14px;display:flex;align-items:center;gap:8px;">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#FBE9EA;color:#E5484D;">${_svg('ic-x', 12)}</span>
        <span style="font-size:12px;font-weight:700;color:#E5484D;">실패 — 다시 시도해 주세요</span>
      </div>`;
    }
    const row = (label, field, val, placeholder) => `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="width:52px;font-size:11px;color:#8B95A1;font-weight:600;">${label}</span>
        <input data-fallback-field="${field}" data-fallback-idx="${historyIdx}" value="${_esc(val || '')}" placeholder="${_esc(placeholder)}"
          style="flex:1;padding:9px 12px;border:none;border-radius:10px;font-size:13px;background:#F7F8FA;color:#191F28;color-scheme:light;outline:none;" />
      </div>`;
    return `<div class="asst-card asst-card--fallback" style="margin-top:8px;padding:14px;background:#FFFFFF;color-scheme:light;border:0.5px solid #E5E8EB;border-radius:14px;">
      <div style="font-size:12px;font-weight:700;color:#191F28;margin-bottom:10px;letter-spacing:-0.2px;">대충 이렇게 맞아요?</div>
      ${row('이름', 'name', extract.name, '김서연')}
      ${row('전화', 'phone', extract.phone, '010-0000-0000')}
      ${row('금액', 'amount', extract.amount, '50000')}
      ${row('시간', 'time', extract.time, '내일 2시')}
      <div style="display:flex;gap:6px;margin-top:12px;">
        <button data-fallback-intent="customer" data-fallback-idx="${historyIdx}" style="flex:1;padding:11px;border:0.5px solid #E5E8EB;border-radius:10px;background:#FFFFFF;color:#4E5968;font-weight:600;cursor:pointer;font-size:12px;display:inline-flex;align-items:center;justify-content:center;gap:4px;">${_svg('ic-user', 12)} 고객 추가</button>
        <button data-fallback-intent="revenue" data-fallback-idx="${historyIdx}" style="flex:1;padding:11px;border:0.5px solid #E5E8EB;border-radius:10px;background:#FFFFFF;color:#4E5968;font-weight:600;cursor:pointer;font-size:12px;display:inline-flex;align-items:center;justify-content:center;gap:4px;">${_svg('ic-dollar-sign', 12)} 매출 기록</button>
        <button data-fallback-intent="booking" data-fallback-idx="${historyIdx}" style="flex:1;padding:11px;border:none;border-radius:10px;background:#191F28;color:#FFFFFF;font-weight:700;cursor:pointer;font-size:12px;display:inline-flex;align-items:center;justify-content:center;gap:4px;letter-spacing:-0.2px;">${_svg('ic-calendar', 12)} 예약 추가</button>
      </div>
    </div>`;
  }

  // Wave B4 — 프리뷰 카드에서 골라 즉시 POST (현재 입력값 읽기)
  function _fallbackBody() {
    return document.getElementById('asstBody');
  }

  function _readFallbackData(idx, msg) {
    const body = _fallbackBody();
    const read = (field) => {
      const sel = `[data-fallback-field="${field}"][data-fallback-idx="${idx}"]`;
      const el = body ? body.querySelector(sel) : null;
      return el ? el.value.trim() : (msg.fallback[field] || '');
    };
    return { name: read('name'), phone: read('phone'), amount: read('amount'), time: read('time') };
  }

  function _customerFallbackRequest(data) {
    if (!data.name) throw new Error('이름이 필요해요');
    return {
      endpoint: '/customers',
      kindKey: 'create_customer',
      payload: { name: data.name, phone: data.phone || null, memo: null, tags: [], birthday: null },
    };
  }

  function _revenueFallbackRequest(data) {
    if (!data.amount || !(+data.amount > 0)) throw new Error('금액이 필요해요');
    return {
      endpoint: '/revenue',
      kindKey: 'create_revenue',
      payload: {
        amount: Math.round(+data.amount),
        method: 'card',
        service_name: null,
        customer_name: data.name || null,
        memo: null,
        recorded_at: new Date().toISOString(),
      },
    };
  }

  function _bookingFallbackRequest(data) {
    if (!data.time) throw new Error('시간이 필요해요');
    const startISO = _timeToISO(data.time);
    if (!startISO) throw new Error('시간을 못 읽었어요');
    return {
      endpoint: '/bookings',
      kindKey: 'create_booking',
      payload: {
        starts_at: startISO,
        ends_at: new Date(new Date(startISO).getTime() + 60 * 60 * 1000).toISOString(),
        customer_id: null,
        customer_name: data.name || null,
        service_name: null,
        memo: null,
        status: 'confirmed',
      },
    };
  }

  function _fallbackRequestForIntent(intent, data) {
    if (intent === 'customer') return _customerFallbackRequest(data);
    if (intent === 'revenue') return _revenueFallbackRequest(data);
    if (intent === 'booking') return _bookingFallbackRequest(data);
    throw new Error('알 수 없는 요청');
  }

  async function _postFallbackRequest(req) {
    const fetcher = window.safeFetch || fetch;
    const res = await fetcher(apiUrl(req.endpoint), {
      method: 'POST',
      headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(req.payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'HTTP ' + res.status);
    }
  }

  function _fallbackSuccess(msg, kindKey) {
    msg.fallback_status = 'done';
    _renderHistory();
    try { _invalidateCachesFor(kindKey); } catch (_e) { void _e; }
    _history.push({ role: 'assistant', text: '✓ 저장했어요' });
    _renderHistory();
    if (window.hapticSuccess) window.hapticSuccess();
    if (window.Dashboard?.refresh) window.Dashboard.refresh(true);
  }

  function _fallbackFailure(msg, e) {
    msg.fallback_status = 'failed';
    _renderHistory();
    const text = window._humanError ? window._humanError(e) : e.message;
    _history.push({ role: 'assistant', text: '실패: ' + text });
    _renderHistory();
  }

  async function _submitFallback(idx, intent) {
    const msg = _history[idx];
    if (!msg || !msg.fallback) return;
    const data = _readFallbackData(idx, msg);
    msg.fallback_status = 'running';
    _renderHistory();
    try {
      const req = _fallbackRequestForIntent(intent, data);
      await _postFallbackRequest(req);
      _fallbackSuccess(msg, req.kindKey);
    } catch (e) {
      _fallbackFailure(msg, e);
    }
  }

  // 숫자 필드 강제 변환
  const _NUM_FIELDS = new Set(['amount', 'unit_price', 'quantity', 'total']);
  function _coerceFieldValue(field, raw) {
    if (_NUM_FIELDS.has(field)) {
      if (raw === '' || raw == null) return null;
      const n = parseInt(String(raw).replace(/[^\d]/g, ''), 10);
      return isNaN(n) ? null : n;
    }
    return raw === '' ? null : raw;
  }
  // "foo" 또는 "items:i:bar" 형태의 field 를 payload 에 꽂기
  function _applyEditField(action, field, raw) {
    if (!action) return;
    if (field === 'confirmation_text') {
      action.confirmation_text = raw;
      return;
    }
    if (!action.payload) action.payload = {};
    if (field.indexOf('items:') === 0) {
      const [, idxStr, sub] = field.split(':');
      const i = parseInt(idxStr, 10);
      if (isNaN(i)) return;
      if (!Array.isArray(action.payload.items)) action.payload.items = [];
      if (!action.payload.items[i]) action.payload.items[i] = {};
      action.payload.items[i][sub] = _coerceFieldValue(sub, raw);
      return;
    }
    // [QA-r11 PR3] adjustments[i].{kind,amount} 필드 전파
    if (field.indexOf('adjustments:') === 0) {
      const [, idxStr, sub] = field.split(':');
      const i = parseInt(idxStr, 10);
      if (isNaN(i)) return;
      if (!Array.isArray(action.payload.adjustments)) action.payload.adjustments = [];
      if (!action.payload.adjustments[i]) action.payload.adjustments[i] = {};
      action.payload.adjustments[i][sub] = _coerceFieldValue(sub, raw);
      return;
    }
    action.payload[field] = _coerceFieldValue(field, raw);
  }
  // 이름 비어있는 items 제거 (저장 시)
  function _stripEmptyItems(payload) {
    if (!payload || !Array.isArray(payload.items)) return;
    payload.items = payload.items.filter(it => it && (String(it.name || '').trim() !== ''));
  }
  // [QA-r11 PR3] kind 비었거나 amount 0 이하인 adjustment 제거 (저장 시)
  function _stripEmptyAdjustments(payload) {
    if (!payload || !Array.isArray(payload.adjustments)) return;
    payload.adjustments = payload.adjustments.filter(a => a && String(a.kind || '').trim() !== '' && Number(a.amount) > 0);
  }
  // 품목 추가·삭제 전에 현재 입력값을 payload 로 먼저 회수 (재렌더 시 입력값 유실 방지)
  function _flushSingleInputs(idx) {
    const msg = _history[idx];
    if (!msg || !msg.action) return;
    const body = document.getElementById('asstBody');
    if (!body) return;
    if (!msg.action.payload) msg.action.payload = {};
    const inputs = body.querySelectorAll(`[data-single-field^="${idx}:"]`);
    inputs.forEach(inp => {
      const parts = inp.getAttribute('data-single-field').split(':');
      const field = parts.slice(1).join(':');
      _applyEditField(msg.action, field, inp.value);
    });
  }
  function _flushRowInputs(hi, gi, ii) {
    const it = _history[hi]?.action_groups?.[gi]?.items?.[ii];
    if (!it || !it.action) return;
    const body = document.getElementById('asstBody');
    if (!body) return;
    if (!it.action.payload) it.action.payload = {};
    const key = `${hi}:${gi}:${ii}`;
    const inputs = body.querySelectorAll(`[data-row-field^="${key}:"]`);
    inputs.forEach(inp => {
      const parts = inp.getAttribute('data-row-field').split(':');
      const field = parts.slice(3).join(':');
      _applyEditField(it.action, field, inp.value);
    });
  }

  // 단일 document-level 위임 (한 번만 등록)
  let _delegationBound = false;
  let _sendInFlight = false;
  // [v178 2026-05-18] 사진 펜딩 (드래프트 첨부) — 갤러리/카메라 선택 시 자동 전송 X.
  //   입력창 위 칩으로 펜딩 → 사용자 텍스트 입력 후 ▷ 누르면 사진+텍스트 함께 전송.
  let _photoPending = null;
  function _getPhotoPending() {
    if (!_photoPending && window.ItdasyAssistantPendingPhotos && typeof window.ItdasyAssistantPendingPhotos.create === 'function') {
      _photoPending = window.ItdasyAssistantPendingPhotos.create({ esc: _esc, send: () => _send() });
    }
    return _photoPending;
  }
  function _renderPending() {
    const pending = _getPhotoPending();
    if (pending) pending.render();
  }
  function _addPendingPhotos(files) {
    const pending = _getPhotoPending();
    if (pending) pending.add(files);
  }
  function _bindActionButtons() {
    if (_delegationBound) return;
    _delegationBound = true;
    // [2026-05-12 QA #4] 편집 모드 input 변경 즉시 action state 에 반영.
    // 이전엔 저장 버튼 누를 때만 반영 → 다른 액션으로 _renderHistory 가 호출되면 입력값 사라짐.
    // 이제 input/change 이벤트마다 즉시 _applyEditField 로 state 갱신 (re-render 안 함, 포커스 유지).
    document.addEventListener('input', e => _handleRowFieldInput(e));
    // select 변경도 동일 처리
    document.addEventListener('change', e => _handleRowFieldChange(e));
    document.addEventListener('click', e => _handleAssistantClick(e), false);
  }

  function _handleRowFieldInput(e) {
    const fld = _rowFieldFromEvent(e);
    if (fld) _applyRowFieldChange(fld);
  }

  function _handleRowFieldChange(e) {
    if (e.target.tagName !== 'SELECT') return;
    const fld = _rowFieldFromEvent(e);
    if (fld) _applyRowFieldChange(fld);
  }

  function _rowFieldFromEvent(e) {
    const fld = e.target.closest('[data-row-field]');
    return (fld && document.getElementById('asstBody')?.contains(fld)) ? fld : null;
  }

  function _applyRowFieldChange(fld) {
    const parts = fld.getAttribute('data-row-field').split(':');
    if (parts.length < 4) return;
    const [hi, gi, ii] = [parseInt(parts[0], 10), parseInt(parts[1], 10), parseInt(parts[2], 10)];
    const it = _history[hi]?.action_groups?.[gi]?.items?.[ii];
    const msg = _history[hi];
    const target = it ? it.action : (msg && msg.action ? msg.action : null);
    if (!target) return;
    if (!target.payload) target.payload = {};
    try { _applyEditField(target, parts.slice(3).join(':'), fld.value); } catch (_e) { void _e; }
  }

  function _handleAssistantClick(e) {
    if (_handleBriefingActionClick(e)) return;   // [T-115] 브리핑 추천 버튼
    if (_handleItbiCardClick(e)) return;         // [잇비 결과 카드 v0] 결과 카드 적용 → 편집기 핸드오프
    if (_handleActionHubClick(e)) return;        // [J-1] Action Hub 공통 버튼(data-asst-hub-act)
    if (_handlePhotoClick(e)) return;
    if (_handleSingleActionClick(e)) return;
    if (_handleGroupActionClick(e)) return;
    _handleSuggestionClick(e);
  }

  // [잇비 결과 카드 v0] 카드 [적용] 클릭 → 원본 src + initialState(params)로 편집기 오픈.
  //   적용 누르기 전엔 편집기 state 를 절대 안 건드림. 자동 저장/게시/발송 0.
  function _handleItbiCardClick(e) {
    const el = e.target && e.target.closest && e.target.closest('[data-asst-itbi-card]');
    if (!el) return false;
    const parts = (el.getAttribute('data-asst-itbi-card') || '').split(':');
    const idx = +parts[0], cardId = parts[1];
    const m = _history[idx];
    const cards = m && m.itbi_cards;
    if (!Array.isArray(cards)) return true;
    const card = cards.find((c) => c.id === cardId);
    const src = m.photo_result && m.photo_result.originalSrc;
    if (!card || !src || !window.PhotoEditor || typeof window.PhotoEditor.open !== 'function') return true;
    window.PhotoEditor.open({ src: src, initial_tab: card.initial_tab || 'beauty', initialState: card.state, itbiMeta: card.meta || null });
    return true;
  }

  // [J-1] Action Hub 버튼 클릭 → ItdasyActionHub.handleActionClick(안전: safe 연결 / confirm 안내 / danger 차단).
  //   자동 발송·게시·예약·고객추측 0. safe 만 즉시 연결, confirm/danger 는 안내·차단.
  function _handleActionHubClick(e) {
    const el = e.target.closest && e.target.closest('[data-asst-hub-act]');
    if (!el) return false;
    try {
      const [idxStr, actId] = String(el.dataset.asstHubAct).split(':');
      const msg = _history[+idxStr];
      const action = msg && Array.isArray(msg.hub_actions)
        ? msg.hub_actions.find((a) => a.id === actId) : null;
      if (!action || !window.ItdasyActionHub || typeof window.ItdasyActionHub.handleActionClick !== 'function') return true;
      if (action.kind === 'open_template_panel' && _openAssistantTemplatePicker(action, msg)) return true;
      if (action.kind === 'apply_price_template' && _applyPriceTemplateDraft(action, msg)) return true;
      const r = window.ItdasyActionHub.handleActionClick(action, { history: _history }) || {};
      if (r.chatInput) {
        const input = document.getElementById('asstInput');
        if (input) { input.value = r.chatInput; _send(); }
      } else if (r.message || (Array.isArray(r.hubActions) && r.hubActions.length)) {
        _history.push({ role: 'assistant', text: r.message || '', hub_actions: Array.isArray(r.hubActions) ? r.hubActions : [] });
        _renderHistory();
      }
    } catch (_e) { void 0; }
    return true;
  }

  function _openTemplatePickerFromPhoto(opts) {
    const recos = _recommendTemplateIds(opts.question || '시술 완료 사진 인스타 템플릿');
    const action = { payload: { dataUrl: opts.photoUrl, recommendedIds: recos } };
    _history.push({ role: 'user', text: opts.question || '템플릿 먼저 보기', thumb: opts.photoUrl, photos: opts.photos });
    _renderHistory();
    return _openAssistantTemplatePicker(action, { photo_result: { dataUrl: opts.photoUrl }, tpl_recos: recos });
  }

  function _openAssistantTemplatePicker(action, msg) {
    const src = _templateSourceUrl(action, msg);
    if (!src) { if (window.showToast) window.showToast('사진을 먼저 선택해 주세요'); return true; }
    const ids = _templateIdsForPicker(action, msg);
    const TV = window.PhotoEditorTemplatesV2;
    if (!TV || typeof TV.recoCardHtml !== 'function') return false;
    _mountAssistantTemplatePicker(src, ids, action);
    return true;
  }

  function _templateSourceUrl(action, msg) {
    const p = (action && action.payload) || {};
    return p.dataUrl || (msg && msg.photo_result && msg.photo_result.dataUrl)
      || (msg && msg.promo_result && (msg.promo_result.afterDataUrl || msg.promo_result.dataUrl)) || '';
  }

  function _priceTemplateSource(action, msg) {
    const p = (action && action.payload) || {};
    if (p.dataUrl) return p.dataUrl;
    if (msg && Array.isArray(msg.photos) && msg.photos[0]) return msg.photos[0];
    if (msg && msg.thumb) return msg.thumb;
    try {
      const src = window.ItdasySourceImage && window.ItdasySourceImage.resolve();
      return (src && src.dataUrl) ? src.dataUrl : '';
    } catch (_e) { return ''; }
  }

  function _priceTemplateDraft(action, msg) {
    const p = (action && action.payload) || {};
    return p.draft || (msg && msg.price_list_draft) || null;
  }

  function _priceIndustryKey(draft) {
    const key = draft && draft.industry && draft.industry.key;
    if (key === 'waxing') return 'wax';
    return key || 'common';
  }

  function _priceTemplateById(id) {
    const MD = window.PhotoEditorTemplateMarketData;
    const v3 = (MD && typeof MD.lookupById === 'function' && MD.lookupById(id))
      || (MD && typeof MD.visibleTemplates === 'function' && MD.visibleTemplates().find(t => t && t.id === id));
    if (v3) return v3;
    const list = window.PhotoEditorTemplatesV2 && window.PhotoEditorTemplatesV2.TEMPLATES;
    return Array.isArray(list) ? list.find(t => t && t.id === id) : null;
  }

  function _firstPriceTemplate() {
    const MD = window.PhotoEditorTemplateMarketData;
    const visible = MD && typeof MD.visibleTemplates === 'function' ? MD.visibleTemplates() : [];
    const fromVisible = Array.isArray(visible) ? visible.find(t => t && t.cat === 'price') : null;
    if (fromVisible) return fromVisible;
    const list = window.PhotoEditorTemplatesV2 && window.PhotoEditorTemplatesV2.TEMPLATES;
    return Array.isArray(list) ? list.find(t => t && t.cat === 'price') : null;
  }

  function _selectPriceTemplateId(draft, preferredId) {
    if (preferredId && _priceTemplateById(preferredId)) return preferredId;
    const map = { nail: 'price-nail', hair: 'price-hair', lash: 'price-lash', skin: 'price-makeup', makeup: 'price-makeup', common: 'price-makeup', wax: 'price-wax' };
    const key = _priceIndustryKey(draft);
    const first = map[key] || map.common;
    if (_priceTemplateById(first)) return first;
    if (key === 'wax' && _priceTemplateById('price-makeup')) return 'price-makeup';
    if (_priceTemplateById('price-hair')) return 'price-hair';
    const any = _firstPriceTemplate();
    return any ? any.id : '';
  }

  function _priceServices(draft) {
    return ((draft && draft.rows) || []).filter(Boolean).slice(0, 8).map(row => {
      const name = String(row.name || row.service_name || '').trim();
      const price = String(row.price || '').trim();
      return { name, service_name: name, desc: '', description: '', price, duration: '', badge: '' };
    }).filter(row => row.name || row.price);
  }

  function _priceSubtitle(draft) {
    const key = _priceIndustryKey(draft);
    const map = {
      nail: '손끝에서 완성되는 깔끔한 변화를 합리적인 가격으로 만나보세요.',
      hair: '나에게 어울리는 스타일 변화를 가격표로 한눈에 확인해보세요.',
      lash: '자연스럽고 또렷한 눈매를 위한 시술 가격을 확인해보세요.',
      skin: '피부 고민에 맞춘 관리 프로그램을 한눈에 정리했어요.',
      makeup: '아름다운 순간을 위한 메이크업 가격을 확인해보세요.',
      wax: '깔끔한 관리를 위한 시술 가격을 확인해보세요.',
    };
    return map[key] || '아름다움을 위한 특별한 관리, 합리적인 가격으로 만나보세요.';
  }

  function _injectPriceSlotValues(state, draft, services) {
    if (!state || !state.tplV2) return false;
    const next = Object.assign({}, state.tplV2.slotValues || {});
    next.services = services;
    next.headline = '시술 가격표';
    next.subtitle = _priceSubtitle(draft);
    next.cta = '예약 문의';
    state.tplV2.slotValues = next;
    return true;
  }

  function _openPriceEditSheet(state, tplId, tpl, helpers) {
    const ES = window.PhotoEditorTemplateEditSheet;
    if (!ES || typeof ES.open !== 'function') {
      if (window.showToast) window.showToast('가격표를 넣었어요. 문구 편집에서 확인해 주세요.');
      return;
    }
    ES.open({ templateId: tplId, templateData: tpl, state, helpers, onChange: () => {} });
  }

  function _priceTemplateLabel(tpl, tplId) {
    return String((tpl && (tpl.title || tpl.label || tpl.name)) || tplId || '가격표 템플릿');
  }

  function _priceResultPreviewRows(services) {
    return (services || []).slice(0, 3).map(row => ({
      name: String(row.service_name || row.name || '').trim(),
      price: String(row.price || '').trim(),
    }));
  }

  function _priceResultText(tpl, tplId, services) {
    const rows = _priceResultPreviewRows(services);
    const lines = rows.map(row => `- ${row.name}${row.price ? ' ' + row.price : ''}`);
    return [
      '가격표 템플릿에 넣었어요.',
      '',
      '문구를 확인한 뒤 저장하거나 인스타 미리보기로 이어갈 수 있어요.',
      '',
      `템플릿: ${_priceTemplateLabel(tpl, tplId)}`,
      `시술 ${services.length}개`,
      ...lines,
    ].join('\n');
  }

  function _priceResultPayload(tpl, tplId, services) {
    return {
      templateId: tplId,
      templateLabel: _priceTemplateLabel(tpl, tplId),
      servicesCount: services.length,
      previewRows: _priceResultPreviewRows(services),
    };
  }

  function _priceResultActions(payload) {
    return [
      { id: 'review_price_template_result', kind: 'review_price_template_result', label: '결과 확인', phase: 'safe', route: 'hub', payload },
      { id: 'export_price_template_result', kind: 'export_image', label: '저장/내보내기', phase: 'safe', route: 'hub', payload },
      { id: 'instagram_price_template_result', kind: 'open_instagram', label: '인스타 미리보기', phase: 'safe', route: 'hub', payload: Object.assign({ ratio: '4:5' }, payload) },
    ];
  }

  function _pushPriceTemplateResult(tpl, tplId, services) {
    const payload = _priceResultPayload(tpl, tplId, services);
    _history.push({
      role: 'assistant',
      text: _priceResultText(tpl, tplId, services),
      price_template_result: payload,
      hub_actions: _priceResultActions(payload),
    });
    _renderHistory();
  }

  // [I3a] 후기 카드 자동 적용 — 가격표 흐름 미러. 로직은 ItdasyTemplateAutoApply 모듈이 소유.
  function _reviewResultActions(payload) {
    return [
      { id: 'review_review_template_result', kind: 'review_price_template_result', label: '결과 확인', phase: 'safe', route: 'hub', payload: payload },
      { id: 'export_review_template_result', kind: 'export_image', label: '저장/내보내기', phase: 'safe', route: 'hub', payload: payload },
      { id: 'instagram_review_template_result', kind: 'open_instagram', label: '인스타 미리보기', phase: 'safe', route: 'hub', payload: Object.assign({ ratio: '4:5' }, payload) },
    ];
  }

  function _reviewResultText(result) {
    var lines = [
      '후기 카드에 넣었어요.',
      '',
      '문구를 확인한 뒤 저장하거나 인스타 미리보기로 이어갈 수 있어요.',
      '',
      '템플릿: ' + (result.templateLabel || '후기 인용 카드'),
      '고객: ' + (result.customerLabel || '고객님'),
    ];
    if (result.reviewExcerpt) lines.push('후기: ' + result.reviewExcerpt + '…');
    return lines.join('\n');
  }

  // 완료 카드 — dataURL 미포함(요약 payload + 버튼만). 저장/인스타는 클릭 시점 현재 캔버스 기준.
  //   [M2] _tryReviewCardShortcut 과 _tryTemplateSampleShortcut(review) 이 공유.
  function _pushReviewResultCard(result) {
    var payload = {
      templateId: result.templateId || 'v3-review-card',
      templateLabel: result.templateLabel || '후기 인용 카드',
      reviewExcerpt: result.reviewExcerpt || '',
      customerLabel: result.customerLabel || '고객님',
    };
    _history.push({
      role: 'assistant',
      text: _reviewResultText(result),
      review_template_result: payload,
      hub_actions: _reviewResultActions(payload),
    });
    _renderHistory();
    if (window.hapticLight) window.hapticLight();
    if (window.showToast) window.showToast('후기 카드를 넣었어요. 문구 편집에서 확인해 주세요.');
  }

  function _tryReviewCardShortcut(input, q) {
    try {
      var M = window.ItdasyTemplateAutoApply;
      if (!M || typeof M.detectReviewCard !== 'function' || !M.detectReviewCard(q)) return false;
      var ctx = (window.ItdasyAssistantContext && window.ItdasyAssistantContext.collect && window.ItdasyAssistantContext.collect()) || {};
      var result = M.handleReviewCard(q, ctx);
      _clearAssistantInput(input);
      _history.push({ role: 'user', text: q });
      if (!result) {
        _history.push({ role: 'assistant', text: '후기 카드를 넣지 못했어요. 사진을 먼저 선택하거나 다시 시도해 주세요.' });
        _renderHistory();
        return true;
      }
      _pushReviewResultCard(result);
      return true;
    } catch (e) {
      try { console.warn('[assistant-review-card] apply failed', e); } catch (_logErr) { void _logErr; }
      return false;
    }
  }

  // [I3b] 전후(BA) 카드 자동 적용 — 후기 흐름 미러. 로직은 ItdasyTemplateAutoApply 모듈이 소유.
  function _lastUserPhotos() {
    try {
      for (var i = _history.length - 1, n = 0; i >= 0 && n < 8; i--, n++) {
        var m = _history[i];
        if (m && m.role === 'user' && Array.isArray(m.photos) && m.photos.length) return m.photos.slice(0, 2);
      }
    } catch (_e) { void _e; }
    return [];
  }

  function _baResultActions(payload) {
    return [
      { id: 'review_ba_template_result', kind: 'review_price_template_result', label: '결과 확인', phase: 'safe', route: 'hub', payload: payload },
      { id: 'export_ba_template_result', kind: 'export_image', label: '저장/내보내기', phase: 'safe', route: 'hub', payload: payload },
      { id: 'instagram_ba_template_result', kind: 'open_instagram', label: '인스타 미리보기', phase: 'safe', route: 'hub', payload: Object.assign({ ratio: '4:5' }, payload) },
    ];
  }

  function _baResultText(result) {
    return [
      '전후 카드에 넣었어요.',
      '',
      '문구와 사진 위치를 확인한 뒤 저장하거나 인스타 미리보기로 이어갈 수 있어요.',
      '',
      '템플릿: ' + (result.templateLabel || '시술 전후 카드'),
      '전 사진: ' + (result.hasBefore ? '추가됨' : '아직 없음 (편집에서 추가)'),
      '후 사진: 적용됨',
    ].join('\n');
  }

  // [M2] _tryBeforeAfterCardShortcut 과 _tryTemplateSampleShortcut(before_after) 이 공유.
  function _pushBaResultCard(result) {
    var payload = {
      templateId: result.templateId || 'v3-ba-clean-rose',
      templateLabel: result.templateLabel || '시술 전후 카드',
      hasBefore: !!result.hasBefore,
      hasAfter: !!result.hasAfter,
    };
    _history.push({
      role: 'assistant',
      text: _baResultText(result),
      ba_template_result: payload,
      hub_actions: _baResultActions(payload),
    });
    _renderHistory();
    if (window.hapticLight) window.hapticLight();
    if (window.showToast) window.showToast('전후 카드를 넣었어요. 문구 편집에서 확인해 주세요.');
  }

  function _tryBeforeAfterCardShortcut(input, q) {
    try {
      var M = window.ItdasyTemplateAutoApply;
      if (!M || typeof M.detectBeforeAfterCard !== 'function' || !M.detectBeforeAfterCard(q)) return false;
      var ctx = (window.ItdasyAssistantContext && window.ItdasyAssistantContext.collect && window.ItdasyAssistantContext.collect()) || {};
      var result = M.handleBeforeAfterCard(q, ctx, { photos: _lastUserPhotos() });
      _clearAssistantInput(input);
      _history.push({ role: 'user', text: q });
      if (!result || result.needsPhoto) {
        _history.push({ role: 'assistant', text: '전후 카드를 만들려면 사진이 필요해요. 시술 후 사진을 먼저 올려 주세요.' });
        _renderHistory();
        return true;
      }
      _pushBaResultCard(result);
      return true;
    } catch (e) {
      try { console.warn('[assistant-ba-card] apply failed', e); } catch (_logErr) { void _logErr; }
      return false;
    }
  }

  function _applyPriceTemplateDraft(action, msg) {
    try {
      const PE = window.PhotoEditor, TV = window.PhotoEditorTemplatesV2;
      if (!PE || !PE.open || !PE._internal || !TV || !TV.apply) return false;
      const draft = _priceTemplateDraft(action, msg);
      const services = _priceServices(draft);
      if (!services.length) return _priceTemplateFailed();
      const p = (action && action.payload) || {};
      const tplId = _selectPriceTemplateId(draft, p.preferredTemplateId);
      const tpl = _priceTemplateById(tplId);
      if (!tplId || !tpl) return _priceTemplateFailed();
      PE.open({ src: _priceTemplateSource(action, msg), initial_tab: 'template' });
      TV.apply(tplId);
      const helpers = PE._internal.helpers || {};
      const state = PE._internal.getState && PE._internal.getState();
      if (!_injectPriceSlotValues(state, draft, services)) return _priceTemplateFailed();
      if (helpers.renderPanel) helpers.renderPanel();
      if (helpers.scheduleRedraw) helpers.scheduleRedraw();
      if (helpers.pushHistory) helpers.pushHistory();
      _openPriceEditSheet(state, tplId, tpl, helpers);
      if (window.showToast) window.showToast('가격표를 넣었어요. 문구 편집에서 확인해 주세요.');
      _pushPriceTemplateResult(tpl, tplId, services);
      return true;
    } catch (e) {
      try { console.warn('[assistant-price-list] apply failed', e); } catch (_logErr) { void _logErr; }
      return _priceTemplateFailed();
    }
  }

  function _priceTemplateFailed() {
    if (window.showToast) window.showToast('가격표를 넣지 못했어요. 다시 시도해 주세요.');
    return true;
  }

  // [M2] 매처 price 샘플 → v3 가격표 슬롯 주입. 빈 값(shop_name/phone='')은 템플릿 기본 유지.
  function _injectPriceSampleSlots(state, slotValues) {
    if (!state || !state.tplV2) return false;
    const sv = slotValues || {};
    const next = Object.assign({}, state.tplV2.slotValues || {});
    if (Array.isArray(sv.services) && sv.services.length) next.services = sv.services;
    if (sv.headline) next.headline = sv.headline;
    if (sv.subtitle) next.subtitle = sv.subtitle;
    if (sv.cta) next.cta = sv.cta;
    if (sv.phone) next.phone = sv.phone;
    if (sv.shop_name) next.shop_name = sv.shop_name;
    state.tplV2.slotValues = next;
    return true;
  }

  // [M2] price 샘플 적용 — _applyPriceTemplateDraft 메커닉/결과 UX 재사용(draft 대신 sample.slotValues).
  function _applyPriceSample(payload) {
    try {
      const PE = window.PhotoEditor, TV = window.PhotoEditorTemplatesV2;
      if (!PE || !PE.open || !PE._internal || !TV || !TV.apply) return _priceTemplateFailed();
      const slotValues = (payload && payload.slotValues) || {};
      const services = Array.isArray(slotValues.services) ? slotValues.services : [];
      if (!services.length) return _priceTemplateFailed();
      const tplId = payload.templateId;
      const tpl = _priceTemplateById(tplId);
      if (!tplId || !tpl) return _priceTemplateFailed();
      let source = '';
      try { const src = window.ItdasySourceImage && window.ItdasySourceImage.resolve(); source = (src && src.dataUrl) ? src.dataUrl : ''; } catch (_e) { source = ''; }
      PE.open({ src: source, initial_tab: 'template' });
      TV.apply(tplId);
      const helpers = PE._internal.helpers || {};
      const state = PE._internal.getState && PE._internal.getState();
      if (!_injectPriceSampleSlots(state, slotValues)) return _priceTemplateFailed();
      if (helpers.renderPanel) helpers.renderPanel();
      if (helpers.scheduleRedraw) helpers.scheduleRedraw();
      if (helpers.pushHistory) helpers.pushHistory();
      _openPriceEditSheet(state, tplId, tpl, helpers);
      if (window.showToast) window.showToast('가격표를 넣었어요. 문구 편집에서 확인해 주세요.');
      _pushPriceTemplateResult(tpl, tplId, services);
      return true;
    } catch (e) {
      try { console.warn('[assistant-price-sample] apply failed', e); } catch (_logErr) { void _logErr; }
      return _priceTemplateFailed();
    }
  }

  // [M2] 매처 샷컷 — 자연어 → 샘플 매칭 → 기존 I2/I3 자동 적용. 기존 price/review/ba 샷컷보다 앞.
  //   매칭 단계 실패/예외는 부수효과 0 으로 false → 기존 fallback(_tryPriceListDraft 등) 그대로.
  //   매칭 성공 후(=user 메시지 push 후) 예외는 true 로 흡수 → 이중 push 방지.
  function _tryTemplateSampleShortcut(input, q) {
    let payload = null, ctx = {}, photos = [];
    try {
      const MM = window.ItdasyTemplateSampleMatcher;
      if (!MM || typeof MM.matchTemplateSample !== 'function') return false;
      ctx = (window.ItdasyAssistantContext && window.ItdasyAssistantContext.collect && window.ItdasyAssistantContext.collect()) || {};
      photos = _lastUserPhotos();
      const sample = MM.matchTemplateSample(q, { photoCount: photos.length });
      if (!sample) return false;   // ← 매칭 실패(모호 입력 포함): 손대지 않고 기존 흐름으로
      payload = MM.toAutoApplyPayload(sample, q, ctx);
      if (!payload || !payload.purpose) return false;
    } catch (e) {
      try { console.warn('[assistant-template-sample] match failed', e); } catch (_logErr) { void _logErr; }
      return false;   // 매칭 단계 예외 → fallback 보존
    }
    // ── 매칭 성공: 여기부터 소비. 이후 오류는 true 로 흡수(이중 push 방지). ──
    try {
      _clearAssistantInput(input);
      _history.push({ role: 'user', text: q });
      if (payload.purpose === 'event' || !payload.autoApplyEligible) {
        _history.push({ role: 'assistant', text: '이벤트 템플릿은 준비 중이에요. 지금은 가격표·후기·전후 카드부터 만들 수 있어요.' });
        _renderHistory();
        return true;
      }
      if (payload.purpose === 'price') { _applyPriceSample(payload); return true; }
      const TA = window.ItdasyTemplateAutoApply;
      const result = (TA && typeof TA.applySample === 'function') ? TA.applySample(payload, ctx, { photos: photos }) : null;
      if (!result || result.needsPhoto) {
        _history.push({ role: 'assistant', text: (payload.purpose === 'before_after')
          ? '전후 카드를 만들려면 사진이 필요해요. 시술 후 사진을 먼저 올려 주세요.'
          : '카드를 넣지 못했어요. 사진을 먼저 선택하거나 다시 시도해 주세요.' });
        _renderHistory();
        return true;
      }
      if (payload.purpose === 'review') _pushReviewResultCard(result);
      else _pushBaResultCard(result);
      return true;
    } catch (e) {
      try { console.warn('[assistant-template-sample] apply failed', e); } catch (_logErr) { void _logErr; }
      try { _history.push({ role: 'assistant', text: '카드를 넣지 못했어요. 다시 시도해 주세요.' }); _renderHistory(); } catch (_e2) { void _e2; }
      return true;   // 이미 user push 됨 → fallback 재진입 금지
    }
  }

  function _templateIdsForPicker(action, msg) {
    const p = (action && action.payload) || {};
    const ids = p.recommendedIds || (msg && (msg.tpl_recos || (msg.promo_result && msg.promo_result.templateRecos))) || [];
    return (ids && ids.length ? ids : _recommendTemplateIds('시술 완료 사진 홍보 템플릿')).slice(0, 6);
  }

  function _recommendTemplateIds(text) {
    try {
      const MD = window.PhotoEditorTemplateMarketData;
      if (MD && typeof MD.recommendTemplates === 'function') {
        return MD.recommendTemplates(text || '', {}, 6).map(t => t.id).filter(Boolean);
      }
    } catch (_e) { void _e; }
    return [];
  }

  function _mountAssistantTemplatePicker(src, ids, action) {
    _removeAssistantTemplatePicker();
    const panel = document.getElementById('assistantSheetPanel');
    const sheet = document.getElementById('assistantSheet');
    const host = panel || sheet || document.body;
    const cards = _templatePickerCards(ids);
    const ov = document.createElement('div');
    ov.id = 'asstTemplatePicker';
    ov.style.cssText = 'position:absolute;inset:0;z-index:40;background:rgba(25,31,40,.38);display:flex;align-items:flex-end;justify-content:center;padding:16px;';
    ov.innerHTML = '<div style="width:100%;max-width:390px;max-height:72vh;overflow:auto;background:#fff;border-radius:22px 22px 18px 18px;padding:16px;box-shadow:0 -10px 34px rgba(25,31,40,.22);">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">' +
      '<div><strong style="font-size:16px;color:#191F28;">템플릿 선택</strong><div style="font-size:12px;color:#8B95A1;margin-top:3px;">고르면 채팅창에서 적용본을 바로 보여드려요.</div></div>' +
      '<button type="button" data-asst-tpl-close style="border:0;background:#F2F4F6;border-radius:999px;width:34px;height:34px;font-size:18px;cursor:pointer;">×</button></div>' +
      '<div data-asst-tpl-grid style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;">' + cards + '</div></div>';
    host.appendChild(ov);
    ov.querySelector('[data-asst-tpl-close]').addEventListener('click', _removeAssistantTemplatePicker);
    ov.addEventListener('click', e => { if (e.target === ov) _removeAssistantTemplatePicker(); });
    ov.querySelectorAll('[data-tpv2-tpl]').forEach(btn => {
      btn.addEventListener('click', () => _selectAssistantTemplate(src, btn.dataset.tpv2Tpl, action));
    });
  }

  function _templatePickerCards(ids) {
    const TV = window.PhotoEditorTemplatesV2;
    let list = ids && ids.length ? ids : _recommendTemplateIds('인스타 홍보 템플릿');
    if ((!list || !list.length) && Array.isArray(TV.TEMPLATES)) list = TV.TEMPLATES.slice(0, 6).map(t => t.id);
    const html = list.map(id => TV.recoCardHtml(id)).filter(Boolean).join('');
    return html || '<div style="grid-column:1/-1;padding:20px;text-align:center;color:#8B95A1;font-size:13px;">추천 템플릿을 불러오는 중이에요.</div>';
  }

  function _removeAssistantTemplatePicker() {
    const prev = document.getElementById('asstTemplatePicker');
    if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
  }

  async function _selectAssistantTemplate(src, tplId, action) {
    _removeAssistantTemplatePicker();
    const idx = _history.push({ role: 'assistant', text: '템플릿 적용본을 만드는 중이에요…', _processing: true }) - 1;
    _renderHistory();
    let preview = src;
    try { preview = await _composeTemplatePreview(src, tplId); } catch (_e) { preview = src; }
    const caption = await _captionForTemplate(tplId);
    _history[idx] = _templatePreviewMessage(preview || src, tplId, caption, action);
    _renderHistory();
  }

  async function _captionForTemplate(tplId) {
    const label = _templateLabel(tplId);
    let res = {};
    try {
      res = await _generateChatCaption({ question: label + ' 시술 완료 사진 인스타 캡션', customerCtx: null });
    } catch (_e) { res = {}; }
    const caption = res.caption || '시술 결과가 자연스럽게 보이는 사진이에요. 상담과 예약은 편하게 문의 주세요.';
    try { if (caption && window.CaptionPrefill && window.CaptionPrefill.set) window.CaptionPrefill.set(caption); } catch (_e) { void _e; }
    return caption;
  }

  function _templatePreviewMessage(dataUrl, tplId, caption, action) {
    const ids = _templateIdsForPicker(action, null);
    return {
      role: 'assistant',
      text: '템플릿 적용 미리보기예요. 캡션까지 준비했어요.',
      photo_result: { dataUrl, ratio: '4:5', preset_label: _templateLabel(tplId), originalSrc: dataUrl },
      photo_caption: caption,
      hub_actions: [
        { id: 'ig_preview', kind: 'open_instagram', label: '인스타 업로드 준비', phase: 'safe', route: 'hub', payload: { dataUrl, caption, ratio: '4:5' } },
        { id: 'export', kind: 'export_image', label: '내보내기', phase: 'safe', route: 'hub', payload: { dataUrl } },
        { id: 'tpl_again', kind: 'open_template_panel', label: '다른 템플릿', phase: 'safe', route: 'hub', payload: { dataUrl, recommendedIds: ids } },
      ],
    };
  }

  function _templateLabel(tplId) {
    try {
      const list = window.PhotoEditorTemplatesV2 && window.PhotoEditorTemplatesV2.TEMPLATES;
      const t = Array.isArray(list) ? list.find(x => x.id === tplId) : null;
      return (t && t.label) || '홍보 템플릿';
    } catch (_e) { return '홍보 템플릿'; }
  }

  async function _composeTemplatePreview(src, tplId) {
    const img = await _loadImage(src);
    if (!img) return src;
    const tpl = _templateInfo(tplId);
    const cv = document.createElement('canvas');
    cv.width = 1080; cv.height = 1350;
    const ctx = cv.getContext('2d');
    _drawTemplateBackground(ctx, cv, tpl);
    _drawTemplatePhoto(ctx, img, cv);
    _drawTemplateText(ctx, cv, tpl);
    try { return cv.toDataURL('image/jpeg', 0.9); } catch (_e) { return src; }
  }

  function _loadImage(src) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function _templateInfo(tplId) {
    try {
      const list = window.PhotoEditorTemplatesV2 && window.PhotoEditorTemplatesV2.TEMPLATES;
      const t = Array.isArray(list) ? list.find(x => x.id === tplId) : null;
      return t || { label: '오늘의 시술 사진', prefillText: 'BEAUTY RESULT', accent: 'soft' };
    } catch (_e) { return { label: '오늘의 시술 사진', prefillText: 'BEAUTY RESULT', accent: 'soft' }; }
  }

  function _drawTemplateBackground(ctx, cv, tpl) {
    const color = tpl.accent === 'gold' ? '#D8B56D' : (tpl.accent === 'primary' ? '#A78BFA' : '#F4ECE4');
    const g = ctx.createLinearGradient(0, 0, cv.width, cv.height);
    g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, color);
    ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.fillRect(58, 58, cv.width - 116, cv.height - 116);
  }

  function _drawTemplatePhoto(ctx, img, cv) {
    const box = { x: 108, y: 180, w: cv.width - 216, h: 850 };
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const scale = Math.max(box.w / iw, box.h / ih);
    const dw = iw * scale, dh = ih * scale;
    ctx.save();
    _roundedRectPath(ctx, box.x, box.y, box.w, box.h, 34); ctx.clip();
    ctx.drawImage(img, box.x + (box.w - dw) / 2, box.y + (box.h - dh) / 2, dw, dh);
    ctx.restore();
  }

  function _roundedRectPath(ctx, x, y, w, h, r) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  function _drawTemplateText(ctx, cv, tpl) {
    ctx.fillStyle = '#191F28';
    ctx.font = '700 54px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText((tpl.prefillText || tpl.label || 'BEAUTY RESULT').slice(0, 22), cv.width / 2, 1120);
    ctx.fillStyle = '#6B7684';
    ctx.font = '400 30px sans-serif';
    ctx.fillText('시술 결과가 자연스럽게 보이도록 정리했어요', cv.width / 2, 1172);
  }

  // [T-115] 브리핑 추천 버튼 클릭 → daily-briefing.runAction(안전: 화면이동/초안경로). 자동 발송/생성 0.
  function _handleBriefingActionClick(e) {
    const el = e.target.closest && e.target.closest('[data-asst-brief-act]');
    if (!el) return false;
    try {
      const [idxStr, actId] = String(el.dataset.asstBriefAct).split(':');
      const msg = _history[+idxStr];
      const action = msg && Array.isArray(msg.briefing_actions)
        ? msg.briefing_actions.find((a) => a.id === actId) : null;
      if (!action || !window.ItdasyDailyBriefing || typeof window.ItdasyDailyBriefing.runAction !== 'function') return true;
      const r = window.ItdasyDailyBriefing.runAction(action);
      if (r && r.chatInput) {
        // 초안 경로 — 잇비 입력으로 전송(T-110/T-113 draft 로 라우팅, 발송 아님).
        const input = document.getElementById('asstInput');
        if (input) { input.value = r.chatInput; _send(); }
      } else if (r && (r.message || (Array.isArray(r.hubActions) && r.hubActions.length))) {
        // [J-4] 추천 클릭 → 한 카드 + Action Hub 체인 버튼(safe/confirm). 자동 실행 없음.
        _history.push({ role: 'assistant', text: r.message || '', hub_actions: Array.isArray(r.hubActions) ? r.hubActions : [] });
        _renderHistory();
      }
    } catch (_e) { void 0; }
    return true;
  }

  function _handlePhotoClick(e) {
    return typeof _assistantPhotoActions.handleClick === 'function' && _assistantPhotoActions.handleClick(e, {
        history: _history,
        pendingFiles: (_getPhotoPending() && _getPhotoPending().files) || [],
        pendingThumbs: (_getPhotoPending() && _getPhotoPending().thumbs) || [],
        renderPending: _renderPending,
        renderHistory: _renderHistory,
        openLightbox: _openLightbox,
        runChatAutoEdit: _runChatAutoEdit,
        openTemplatePicker: _openTemplatePickerFromPhoto,
        isSendInFlight: () => _sendInFlight,
      });
  }

  function _handleSingleActionClick(e) {
    return typeof _assistantSingleActions.handleClick === 'function' && _assistantSingleActions.handleClick(e, {
        history: _history,
        renderHistory: _renderHistory,
        runAction: _runAction,
        flushSingleInputs: _flushSingleInputs,
        applyEditField: _applyEditField,
        stripEmptyItems: _stripEmptyItems,
        stripEmptyAdjustments: _stripEmptyAdjustments,
      });
  }

  function _handleGroupActionClick(e) {
    return typeof _assistantGroupActions.handleClick === 'function' && _assistantGroupActions.handleClick(e, {
        history: _history,
        renderHistory: _renderHistory,
        submitFallback: _submitFallback,
        runUnifiedAll: _runUnifiedAll,
        runGroupAll: _runGroupAll,
        runGroupRow: _runGroupRow,
        flushRowInputs: _flushRowInputs,
        applyEditField: _applyEditField,
        stripEmptyItems: _stripEmptyItems,
        stripEmptyAdjustments: _stripEmptyAdjustments,
      });
  }

  function _handleSuggestionClick(e) {
    return typeof _assistantSuggestionControls.handleClick === 'function' && _assistantSuggestionControls.handleClick(e, {
        isSending: () => _sendInFlight,
        send: _send,
      });
  }

  // 캐시 무효화 + data-changed 이벤트 (단일 액션 실행 후 공통 로직)
  function _invalidateCachesFor(kind) {
    if (window.ItdasyAssistantCacheInvalidation) {
      window.ItdasyAssistantCacheInvalidation.invalidate(kind, { externalInvalidateKinds: _externalInvalidateKinds });
    }
    try {
      // [2026-04-26 A8 픽스] 다른 모듈(대시보드·고객·재고·매출·예약 등)은 정상 새로고침,
      //   챗봇 자기 자신만은 server history reload 를 스킵 → 그룹 메모리 상태 보존
      _selfDispatchedDataChange = true;
      window.dispatchEvent(new CustomEvent('itdasy:data-changed', {
        detail: { kind, mutation_kind: kind },
      }));
    } catch (_e) { void _e; }
  }

  // 순수 실행기 — action 객체만 받아 POST, 결과 반환. UI 갱신은 호출자가.
  // [QA-NEXT #4] action._ai_original (AI 추출 시점 payload 스냅샷) 있으면 original_payload 동봉 →
  // 백엔드에서 final vs original diff 를 UserCorrection 으로 학습.
  async function _executeAction(action, opts) {
    opts = opts || {};
    // [P0-4 2026-05-19] 위험 액션은 실행 직전 nativeConfirm 한 번 더.
    // bulk 흐름은 opts.skipConfirm = true 로 우회 (그룹 카드 단위 사용자 결정).
    // 롤백: localStorage.assistant_risky_confirm_disabled = '1' 시 항상 skip.
    await _confirmRiskyActionIfNeeded(action, opts);
    // [v167 2026-05-17] 로컬 핸들러 우선 — open_photo_editor 같은 클라이언트 단독 액션은 백엔드 호출 우회.
    const localFn = _localKindHandlers[action.kind];
    if (typeof localFn === 'function') {
      const d = await localFn(action) || {};
      _invalidateCachesFor(action.kind);
      try { window.ItdasyAssistantContext && window.ItdasyAssistantContext.markRecentAction(action.kind); } catch (_e) { void 0; }
      return { kind: action.kind, message: d.message || '✓ 완료', ...d };
    }
    const body = { kind: action.kind, payload: action.payload || {} };
    if (action._ai_original && typeof action._ai_original === 'object') {
      body.original_payload = action._ai_original;
    }
    if (action._source_question) body.source_question = action._source_question;
    const res = await apiFetch('/assistant/execute', {
      method: 'POST',
      headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const e2 = new Error(_executeErrorMessage(err, res.status));
      if (err && typeof err.detail === 'object') e2.stages = err.detail.stages || null;
      throw e2;
    }
    const d = await res.json();
    _invalidateCachesFor(d.kind || action.kind);
    if (d.kind === 'generate_bulk_message' && d.message_draft) {
      try {
        if (navigator.clipboard) await navigator.clipboard.writeText(d.message_draft);
      } catch (_e) { void _e; }
    }
    try { window.ItdasyAssistantContext && window.ItdasyAssistantContext.markRecentAction(d.kind || action.kind); } catch (_e) { void 0; }
    return d;
  }

  async function _confirmRiskyActionIfNeeded(action, opts) {
    if (opts.skipConfirm || !action || !RISKY_ACTION_KINDS.has(action.kind) || action._confirmed) return;
    if (_isRiskyConfirmDisabled() || typeof window.nativeConfirm !== 'function') return;
    const meta = _catMeta(action.kind);
    const detail = action.confirmation_text || '';
    const msg = detail ? `${detail}\n\n진짜 진행할까요?` : `[${meta.label}] 정말 진행할까요?`;
    const ok = await window.nativeConfirm(meta.label, msg, '실행', '취소');
    if (!ok) {
      const err = new Error('사용자가 취소했어요');
      err.userCancelled = true;
      throw err;
    }
    action._confirmed = true;
  }

  function _isRiskyConfirmDisabled() {
    try { return localStorage.getItem('assistant_risky_confirm_disabled') === '1'; }
    catch (_e) { return false; }
  }

  function _executeErrorMessage(err, status) {
    if (err && typeof err.detail === 'object' && err.detail !== null) {
      return err.detail.message || JSON.stringify(err.detail);
    }
    return (err && err.detail) || ('HTTP ' + status);
  }

  // [2026-05-21] 일괄 예약 취소 — intent-router 가 "{이름} 예약 전부 취소" 매칭 시 생성.
  // RISKY confirm 한 번 통과 후 booking_id 하나씩 cancel_booking 순차 실행 (skipConfirm).
  _localKindHandlers['cancel_booking_bulk'] = async function (action) {
    const ids = (action.payload && action.payload.booking_ids) || [];
    const name = (action.payload && action.payload.customer_name) || '고객';
    if (!ids.length) return { kind: 'cancel_booking_bulk', message: '취소할 예약이 없어요' };
    let ok = 0; const failed = [];
    for (const id of ids) {
      try {
        await _executeAction({
          kind: 'cancel_booking',
          payload: { booking_id: id, customer_name: name },
          _confirmed: true,
        }, { skipConfirm: true });
        ok += 1;
      } catch (e) {
        failed.push({ id, msg: (e && e.message) || 'unknown' });
      }
    }
    const msg = failed.length
      ? `🗑 ${name}님 예약 ${ok}/${ids.length}건 취소 (실패 ${failed.length}건)`
      : `🗑 ${name}님 예약 ${ok}건 모두 취소했어요`;
    return { kind: 'cancel_booking_bulk', message: msg };
  };

  async function _runAction(idx) {
    const msg = _history[idx];
    if (!msg || !msg.action) return;
    // 중복 클릭 방지 — 이미 running/done 면 무시. failed 는 재시도 허용.
    if (msg.action_status === 'running' || msg.action_status === 'done') return;
    msg.action_status = 'running';
    _renderHistory();
    // [2026-04-26 A9 픽스] 옵티미스틱 이벤트 — POST 직전 대시보드 즉시 반영 알림
    // (실제 데이터 추가는 _executeAction 성공 후 _invalidateCachesFor 가 처리)
    try {
      _selfDispatchedDataChange = true;
      window.dispatchEvent(new CustomEvent('itdasy:data-changed', {
        detail: { kind: msg.action.kind, optimistic: true },
      }));
    } catch (_e) { void _e; }
    try {
      const d = await _executeAction(msg.action);
      msg.action_status = 'done';
      _renderHistory();
      // [2026-05-25] generate_bulk_message / draft_message — 백엔드가 빈 message_draft 반환 시
      //   "메세지 초안이 비어있어요" 처럼 보여 사용자 혼란. 응답에 따라 친절한 안내로 분기.
      const draftKinds = new Set(['generate_bulk_message', 'draft_message']);
      // [J-5] 백엔드 draft 본문도 공통 마케팅 정책으로 금지어/과장어 정리(발송 아님, 표시 전 정규화).
      const _mp = window.ItdasyMarketingDraftPolicy;
      const draftText = ((_mp && _mp.sanitize) ? _mp.sanitize(d.message_draft || d.draft || '') : (d.message_draft || d.draft || '')).trim();
      if (draftKinds.has(d.kind)) {
        if (draftText) {
          if (d.kind === 'generate_bulk_message') {
            // [T-111] 대량 메시지 = 초안만(safe). 실제 대량 발송은 절대 하지 않음.
            //   ⚠️ 향후 실발송 결선 시 danger 승격 필수(nativeConfirm + 영향 고객 수 + 최종 확인).
            const _n = Array.isArray(d.target_names) ? d.target_names.length : null;
            const _head = (_n != null)
              ? `총 ${_n}명 대상 메시지 초안을 만들었어요.`
              : '여러 고객 대상 메시지 초안을 만들었어요.';
            _history.push({ role: 'assistant',
              text: `${_head}\n실제 대량 발송은 하지 않았습니다. 내용을 확인한 뒤 필요한 채널에 복사해서 사용하세요.\n(대량 발송 기능은 안전 확인 후 별도로 제공될 예정이에요)\n\n---\n${draftText}\n---\n(클립보드에 복사됨)` });
          } else {
            // [J-5] 단건 초안 — 발송 안 함 안내 통일.
            const _note = (_mp && _mp.safetyNote) ? _mp.safetyNote('retouch_offer') : '초안만 만들었어요. 실제 발송은 하지 않았어요.';
            _history.push({ role: 'assistant', text: _note + ' 확인 후 카톡·문자에 붙여넣어 사용하세요.\n\n---\n' + draftText });
          }
        } else {
          // 백엔드가 응답은 했지만 본문이 비어있음 — 어떤 고객에게 어떤 톤으로 쓸지 추가 정보를 요구.
          _history.push({ role: 'assistant', text: '초안이 비어 있어요. 누구에게 보낼지(고객 이름)와 톤(친근하게/정중하게)을 알려주시면 다시 만들어드릴게요.' });
        }
      } else {
        _history.push({ role: 'assistant', text: d.message || '✓ 완료했어요' });
      }
      _renderHistory();
      if (window.hapticSuccess) window.hapticSuccess();
      if (window.Dashboard?.refresh) window.Dashboard.refresh(true);
      // [2026-04-30] 되돌리기 버튼 토스트 — undo_log_id 받았으면
      if (d.undo_log_id && window.showUndoToast) {
        try { window.showUndoToast(d.message || '✓ 완료', d.undo_log_id); } catch (_e) { void _e; }
      }
    } catch (e) {
      // [P0-4 2026-05-19] 위험 액션 confirm 취소 — 카드 status 그대로 pending 유지 (다시 클릭 가능)
      if (e && e.userCancelled) {
        msg.action_status = 'pending';
        _renderHistory();
        if (window.showToast) window.showToast('취소했어요');
        return;
      }
      msg.action_status = 'failed';
      // 2026-04-26 버그B 픽스 — 실패 사유 저장 (UI 카드에 표시)
      msg.action_error = window._humanError ? window._humanError(e) : (e && e.message) || '알 수 없는 오류';
      _renderHistory();
      _history.push({ role: 'assistant', text: '실패: ' + msg.action_error });
      _renderHistory();
    }
  }

  // [2026-04-26 A8 픽스] 그룹별 부분 re-render — 한 그룹만 다시 그리기
  // 다른 그룹의 expanded/bulkProgress/items 상태에 영향 X.
  // 풀 _renderHistory 가 안전하긴 하지만 (mutate-only 보장), 향후 최적화 여지로 분리.
  function _rerenderGroupRow(historyIdx, gIdx) {
    const msg = _history[historyIdx];
    const group = msg && msg.action_groups && msg.action_groups[gIdx];
    if (!group) { _renderHistory(); return; }
    // 현재 구조에서는 그룹 카드가 outerHTML 통째로 렌더되므로 안전하게 풀 렌더로 위임.
    // (action_groups 객체는 mutate 만 — 절대 새로 만들지 않음 → 다른 그룹 상태 보존됨)
    _renderHistory();
  }

  // 그룹 카드 — 단일 행 실행
  async function _runGroupRow(historyIdx, gIdx, iIdx) {
    const msg = _history[historyIdx];
    const group = msg && msg.action_groups && msg.action_groups[gIdx];
    const it = group && group.items && group.items[iIdx];
    if (!it || it.status === 'done' || it.status === 'running' || it.skipped) return;
    it.status = 'running';
    _rerenderGroupRow(historyIdx, gIdx);
    try {
      await _executeAction(it.action);
      it.status = 'done';
      _rerenderGroupRow(historyIdx, gIdx);
      if (window.hapticSuccess) window.hapticSuccess();
      if (window.Dashboard?.refresh) window.Dashboard.refresh(true);
    } catch (e) {
      // [P0-4 2026-05-19] 위험 액션 confirm 취소 — pending 유지, 다시 클릭 가능
      if (e && e.userCancelled) {
        it.status = 'pending';
        _rerenderGroupRow(historyIdx, gIdx);
        if (window.showToast) window.showToast('취소했어요');
        return;
      }
      it.status = 'failed';
      it.errorMsg = window._humanError ? window._humanError(e) : e.message;
      _rerenderGroupRow(historyIdx, gIdx);
    }
  }

  // 그룹 카드 — 전체(남은) 행 병렬 실행 (concurrency 5)
  // 순차 실행(이전): N건 × 2초 = 2N초 대기
  // 병렬 실행(현재): 5건 동시, N/5 × 2초 = 0.4N 초 — 약 5배 빠름
  async function _runGroupAll(historyIdx, gIdx) {
    const msg = _history[historyIdx];
    const group = msg && msg.action_groups && msg.action_groups[gIdx];
    if (!group || group.bulkProgress) return;
    const targets = group.items
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => !it.skipped && it.status !== 'done' && it.status !== 'running');
    if (!targets.length) return;
    // [2026-05-12 QA #3] confidence < 0.7 인 action 자동 [전체 추가] 차단.
    // 사용자가 개별 [추가] 누르거나 [편집] 후 통과해야 commit.
    const lowConf = targets.filter(({ it }) => {
      const c = it.action && it.action.confidence;
      return typeof c === 'number' && c < 0.7;
    });
    if (lowConf.length) {
      if (window.showToast) window.showToast(`${lowConf.length}건은 신뢰도 낮아 확인 필요 — 빨간 항목 먼저 편집해 주세요`);
      // 낮은 confidence 만 빼고 진행
      const safe = targets.filter(({ it }) => {
        const c = it.action && it.action.confidence;
        return !(typeof c === 'number' && c < 0.7);
      });
      if (!safe.length) return;
      targets.length = 0;
      targets.push(...safe);
    }
    group.bulkProgress = { current: 0, total: targets.length };
    // 모두 running 상태로 한번에 표시 → 사용자가 '동시 진행' 체감
    targets.forEach(({ it }) => { it.status = 'running'; });
    _rerenderGroupRow(historyIdx, gIdx);
    let okCount = 0;
    const CONCURRENCY = 5;  // Railway/DB 부담 방지 · 5건씩 묶어서
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      const batch = targets.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async ({ it }) => {
        try {
          // [P0-4 2026-05-19] bulk 흐름 — 그룹 카드 단위 사용자 결정이므로 개별 confirm skip
          await _executeAction(it.action, { skipConfirm: true });
          it.status = 'done';
          okCount++;
        } catch (e) {
          it.status = 'failed';
          it.errorMsg = window._humanError ? window._humanError(e) : e.message;
        }
        group.bulkProgress.current++;
        _rerenderGroupRow(historyIdx, gIdx);
      }));
    }
    group.bulkProgress = null;
    _rerenderGroupRow(historyIdx, gIdx);
    if (okCount > 0) {
      if (window.hapticSuccess) window.hapticSuccess();
      if (window.Dashboard?.refresh) window.Dashboard.refresh(true);
    }
  }

  // 2026-04-24 — 통합 확인 카드: 전체 추가 (순차 실행)
  // create_customer → booking/revenue 순서 보장 (customer_id resolver 의존성 안전)
  // Promise.allSettled 패턴: 하나 실패해도 나머지 계속 진행.
  async function _runUnifiedAll(historyIdx) {
    const msg = _history[historyIdx];
    if (!msg || !msg.action_groups || msg.unified_progress) return;
    const flat = _unifiedExecutionOrder(msg.action_groups);
    const targets = flat.filter(f => !f.it.skipped && f.it.status !== 'done' && f.it.status !== 'running');
    if (!targets.length) return;

    msg.unified_progress = { current: 0, total: targets.length, label: '저장 중' };
    // [2026-05-26] 진행 중 _renderHistory 호출 X — 깜빡임 차단. 부분 갱신만.
    _updateUnifiedProgress(historyIdx, 0, targets.length, '저장 중');

    let okCount = 0;
    let failCount = 0;
    for (let i = 0; i < targets.length; i++) {
      const f = targets[i];
      const meta = _catMeta(f.kind);
      f.it.status = 'running';
      msg.unified_progress.label = `${meta.label} 저장 중`;
      _updateUnifiedProgress(historyIdx, i, targets.length, `${meta.label} 저장 중`);
      try {
        // [P0-4 2026-05-19] 통합 진행 — 그룹 단위 사용자 결정이므로 개별 confirm skip
        await _executeAction(f.it.action, { skipConfirm: true });
        f.it.status = 'done';
        okCount++;
      } catch (e) {
        f.it.status = 'failed';
        f.it.errorMsg = window._humanError ? window._humanError(e) : e.message;
        failCount++;
      }
      msg.unified_progress.current = i + 1;
      _updateUnifiedProgress(historyIdx, i + 1, targets.length, '저장 중');
    }

    msg.unified_progress = null;

    // 컨트롤 영역만 부분 교체 — "✓ 전체 완료" 잠금
    _lockUnifiedControls(historyIdx);

    // summary 메시지 push + 마지막 1회 _renderHistory (옛 동작은 매 단계마다 호출 → 깜빡임)
    if (okCount > 0) {
      const summary = failCount
        ? `✓ ${okCount}건 저장 · ${failCount}건 실패`
        : `✓ ${okCount}건 모두 저장 완료`;
      _history.push({ role: 'assistant', text: summary });
      _renderHistory();
      if (window.hapticSuccess) window.hapticSuccess();
      if (window.Dashboard?.refresh) window.Dashboard.refresh(true);
    } else if (failCount > 0) {
      _history.push({ role: 'assistant', text: `실패 ${failCount}건 — '수정' 눌러서 다시 확인해 주세요` });
      _renderHistory();
    }

    // 스크롤 — 통째로 scrollTop = scrollHeight 대신 마지막 요소 부드럽게
    try {
      const body = document.getElementById('asstBody');
      if (body && body.lastElementChild) {
        body.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    } catch (_e) { /* ignore */ }
  }

  // [2026-05-26] 통합 카드 진행 텍스트·진행바 부분갱신 — _renderHistory 호출 회피
  function _updateUnifiedProgress(historyIdx, current, total, label) {
    const txt = document.getElementById('unifiedProgress-' + historyIdx);
    if (txt) {
      txt.textContent = (label || '진행 중') + ' · ' + current + '/' + total;
    }
    const bar = document.getElementById('unifiedProgressBar-' + historyIdx);
    if (bar && bar.firstElementChild) {
      const pct = total ? Math.round((current / total) * 100) : 0;
      bar.firstElementChild.style.width = pct + '%';
    }
  }

  function _lockUnifiedControls(historyIdx) {
    const c = document.getElementById('unifiedControls-' + historyIdx);
    if (!c) return;
    c.innerHTML = '<button disabled style="flex:1;padding:11px;border:none;border-radius:10px;background:var(--surface-2);color:var(--text-muted);font-weight:600;font-size:13px;cursor:not-allowed;display:inline-flex;align-items:center;justify-content:center;gap:6px;">✓ 전체 완료</button>';
  }

  function _renderSuggest() {
    if (typeof _assistantSuggestionControls.renderSuggest === 'function') {
      _assistantSuggestionControls.renderSuggest({ suggestions: SUGGESTIONS });
    }
  }

  // [2026-04-29 F1] 능동 제안 carousel — today/brief 의 proactive_suggestions 상단 노출
  async function _loadProactiveSuggestions() {
    if (typeof _assistantSuggestionControls.loadProactiveSuggestions === 'function') {
      await _assistantSuggestionControls.loadProactiveSuggestions();
    }
  }

  // [2026-05-25 v3] 잇비 헤더 ⋯ 메뉴 — 메모/액션 되돌리기 2종만.
  //   v2 는 document.body 에 z-index:10001 로 띄웠으나 잇비 시트가 opacity 로 stacking context
  //   를 만들어서 모바일 일부 환경에서 위 z-index 가 안 통함 → 잇비 시트 panel 내부에
  //   position:absolute 로 직접 append (같은 stacking context 안에서 항상 위).
  function _openAssistantToolMenu() {
    const existing = document.getElementById('asstToolMenu');
    if (existing) { existing.remove(); return; }
    const panel = document.getElementById('assistantSheetPanel');
    const box = document.createElement('div');
    box.id = 'asstToolMenu';
    // panel 안에서 position:absolute 로 가득 차게. panel 자체가 stacking context.
    box.style.cssText = 'position:absolute;inset:0;z-index:9999;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:16px;border-radius:20px 20px 0 0;';
    const _row = (k, t, sub) => `<button data-tool-act="${k}" style="text-align:left;padding:14px 16px;border:none;border-radius:14px;background:#F7F8FA;cursor:pointer;display:flex;flex-direction:column;gap:2px;"><div style="font-size:14px;font-weight:700;color:#191F28;">${t}</div><div style="font-size:11px;color:#6B7684;">${sub}</div></button>`;
    box.innerHTML = `
      <div style="width:100%;max-width:380px;background:#fff;border-radius:20px;padding:16px 14px;display:flex;flex-direction:column;gap:8px;box-shadow:0 12px 40px rgba(0,0,0,0.25);">
        <div style="font-size:12px;color:#8B95A1;font-weight:700;padding:4px 4px 6px;">잇비 도구</div>
        ${_row('memo', '잇비 메모', '영구 메모 · 자동 학습 패턴')}
        ${_row('undo', '액션 되돌리기', '잇비가 한 일 되돌리기')}
        <button data-tool-act="cancel" style="padding:12px;border:none;border-radius:14px;background:#f2f2f2;color:#6B7684;font-size:14px;font-weight:700;cursor:pointer;margin-top:4px;">닫기</button>
      </div>
    `;
    const close = () => { try { box.remove(); } catch (_e) { void _e; } };
    box.addEventListener('click', (e) => {
      if (e.target === box) { close(); return; }
      const btn = e.target.closest('[data-tool-act]');
      if (!btn) return;
      const act = btn.dataset.toolAct;
      close();
      try {
        if (act === 'memo' && typeof window.openAssistantFactsSheet === 'function') return window.openAssistantFactsSheet();
        if (act === 'undo' && typeof window.openUndoHistory === 'function') return window.openUndoHistory();
      } catch (_e) { /* ignore */ }
    });
    // panel 안에 append (잇비 시트의 stacking context 안에서 가장 위).
    //   panel 이 없으면 (예외적 케이스) body 폴백.
    if (panel) {
      // panel 은 기본 position:absolute 라 stacking context 형성됨. 그 안에서 z-index 9999 면 충분.
      panel.appendChild(box);
    } else {
      box.style.position = 'fixed';
      box.style.zIndex = '10500';
      document.body.appendChild(box);
    }
  }

  // ── 사진 업로드 (챗봇 입력바 좌측 버튼) ─────────────────
  function _openPhotoSheet() {
    // 이미 떠 있으면 닫고 끝
    const existing = document.getElementById('asstPhotoSheet');
    if (existing) { existing.remove(); return; }
    const box = document.createElement('div');
    box.id = 'asstPhotoSheet';
    box.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.45);display:flex;align-items:flex-end;justify-content:center;';
    box.innerHTML = `
      <div style="width:100%;max-width:460px;background:#fff;border-radius:20px 20px 0 0;padding:12px 12px max(12px,env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:8px;">
        <button data-photo-choice="camera" style="padding:16px;border:none;border-radius:14px;background:hsl(340,100%,98%);color:hsl(350,60%,40%);font-size:15px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;">${_svg('ic-camera', 18)} 사진 찍기</button>
        <button data-photo-choice="gallery" style="padding:16px;border:none;border-radius:14px;background:hsl(340,100%,98%);color:hsl(350,60%,40%);font-size:15px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;">${_svg('ic-image-plus', 18)} 갤러리에서</button>
        <button data-photo-choice="cancel" style="padding:14px;border:none;border-radius:14px;background:#f2f2f2;color:var(--text-muted);font-size:14px;font-weight:700;cursor:pointer;margin-top:4px;">취소</button>
      </div>
    `;
    const close = () => { try { box.remove(); } catch (_e) { void _e; } };
    box.addEventListener('click', (e) => {
      if (e.target === box) { close(); return; }
      const btn = e.target.closest('[data-photo-choice]');
      if (!btn) return;
      const c = btn.dataset.photoChoice;
      close();
      if (c === 'camera') document.getElementById('asstCamera')?.click();
      else if (c === 'gallery') document.getElementById('asstGallery')?.click();
    });
    document.body.appendChild(box);
  }

  // ─── 라이트박스 (업로드한 사진 클릭 시 큰 화면) ────────────
  // 2026-04-26 추가 — N장 사진을 좌우 화살표로 둘러보기.
  // 배경 어둡게 + ESC/배경 클릭 닫기 + 화살표 키 네비.
  function _openLightbox(photos, startIdx) {
    if (window.ItdasyAssistantLightbox && typeof window.ItdasyAssistantLightbox.open === 'function') {
      window.ItdasyAssistantLightbox.open(photos, startIdx, { esc: _esc, svg: _svg });
    }
  }

  // [v176 2026-05-18] 챗봇 사진+phrase → 채팅 안 자동 보정 결과 렌더.
  // 반환: true(처리됨, 백엔드 우회) / false(매칭 없음, OCR 폴백)
  // opts: { photoUrl, photos, question, customerCtx }
  function _photoEditIntent(question) {
    const ql = (question || '').toLowerCase();
    return {
      edit: /(편집|보정|예쁘게|꾸미)/.test(ql),
      instagram: /(인스타|올려|게시|업로드|포스트)/.test(ql),
      ba: /(전후|before|애프터|b&a|비포)/i.test(ql),
      bg: /(누끼|배경)/.test(ql),
      videoCard: /(릴스|reels|shorts|숏폼|cover|커버)/i.test(ql),
      explicit_editor: /(편집기|에디터|직접|손볼)/.test(ql),
    };
  }

  function _photoShopPreset(question) {
    const ql = (question || '').toLowerCase();
    if (/(헤어|볼륨|모발|hair)/.test(ql)) return 'hair';
    if (/(속눈썹|lash)/.test(ql)) return 'lash';
    if (/(네일|nail)/.test(ql)) return 'nail';
    if (/(왁싱|피부|반영구|skin|tattoo)/i.test(ql)) return 'wax';
    return 'shop';
  }

  function _openPhotoEditorForChat(opts, initialTab) {
    if (window.PhotoEditor && typeof window.PhotoEditor.open === 'function') {
      window.PhotoEditor.open({
        src: opts.photoUrl,
        initial_tab: initialTab,
        customer_id: opts.customerCtx ? opts.customerCtx.id : undefined,
      });
    }
  }

  function _pushPhotoShortcutMessage(opts, text) {
    _history.push({ role: 'user', text: opts.question, thumb: opts.photoUrl, photos: opts.photos });
    _history.push({ role: 'assistant', text });
    _renderHistory();
  }

  function _runPhotoEditorShortcut(opts, intent) {
    if (intent.explicit_editor) {
      _openPhotoEditorForChat(opts, 'tune');
      _pushPhotoShortcutMessage(opts, '편집기를 열었어요.');
      return true;
    }
    if (intent.bg && !intent.edit && !intent.instagram) {
      _openPhotoEditorForChat(opts, 'bg');
      _pushPhotoShortcutMessage(opts, '배경 화면을 열었어요.');
      return true;
    }
    if (intent.videoCard) {
      _openPhotoEditorForChat(opts, 'template');
      _pushPhotoShortcutMessage(opts, '사진 카드 화면을 열었어요. 스토리용 이미지나 전후 카드로 바로 만들 수 있어요.');
      return true;
    }
    if (intent.ba) {
      _openPhotoEditorForChat(opts, 'template');
      _pushPhotoShortcutMessage(opts, '전·후 카드 화면을 열었어요. 두 번째 사진을 골라주세요.');
      return true;
    }
    return false;
  }

  function _beginChatAutoEdit(opts) {
    _history.push({ role: 'user', text: opts.question, thumb: opts.photoUrl, photos: opts.photos });
    const placeholderIdx = _history.length;
    _history.push({ role: 'assistant', text: '보정 중이에요…', _processing: true });
    _renderHistory();
    return placeholderIdx;
  }

  function _setAutoEditFailure(placeholderIdx, text) {
    _history[placeholderIdx].text = text;
    _history[placeholderIdx]._processing = false;
    _renderHistory();
  }

  async function _processChatAutoEditPhoto(opts, intent, preset, placeholderIdx) {
    if (!window.ChatAutoEdit || typeof window.ChatAutoEdit.processPhoto !== 'function') {
      _setAutoEditFailure(placeholderIdx, '자동 보정 모듈 로드 중이에요. 잠시 후 다시 시도해주세요.');
      return null;
    }
    try {
      return await window.ChatAutoEdit.processPhoto({
        src: opts.photoUrl,
        preset,
        ratio: intent.instagram ? '4:5' : 'original',
        watermark: intent.instagram,
      });
    } catch (e) {
      _setAutoEditFailure(placeholderIdx, '보정 실패: ' + ((e && e.message) || '알 수 없음'));
      return null;
    }
  }

  function _applyChatAutoEditResult(result, intent, placeholderIdx, opts, preset) {
    if (!result || !result.dataUrl) {
      _setAutoEditFailure(placeholderIdx, '보정 결과를 받지 못했어요. 다시 시도해주세요.');
      return false;
    }
    const promo = intent.instagram && intent.ba && window.ItdasyPromoResultBuilder
      ? window.ItdasyPromoResultBuilder.fromAutoEdit({
          result, preset, question: opts.question, photoUrl: opts.photoUrl, customerCtx: opts.customerCtx,
        })
      : null;
    // [잇비 핸드오프] 적용 파라미터 + 원본 src 보존(채팅→편집기 유실 방지). 원본은 dataURL(readAsDataURL)이라 revoke 안 됨.
    const handoff = {
      originalSrc: opts.photoUrl,
      params: {
        beauty: result.beauty || null,
        adjust: result.adjust || null,
        ratio: result.ratio || 'original',
        autoIntensity: result.intensity || 'standard',
      },
    };
    // [잇비 결과 카드 v0/PR1] promo·비-promo 모두 카드 3개 구성(fromResult 재사용).
    const itbiCards = (window.PhotoEditorItbiCards && typeof window.PhotoEditorItbiCards.fromResult === 'function')
      ? window.PhotoEditorItbiCards.fromResult(result, opts) : null;
    _history[placeholderIdx] = {
      role: 'assistant',
      text: promo ? '' : (intent.instagram ? '보정 완료! 인스타 미리보기를 열게요.' : '보정 완료! 어떻게 만들까요?'),
      photo_result: { dataUrl: result.dataUrl, ratio: result.ratio, preset_label: result.preset_label, params: handoff.params, originalSrc: handoff.originalSrc },
      itbi_cards: itbiCards,
      promo_result: promo ? promo.promoResult : null,
      photo_actions: promo ? [] : _chatAutoEditActions(intent.instagram),
      // [PR1] promo hubActions 의 open_photo_editor 도 원본+initialState 를 싣게 post-process(photo-chain.js 미수정 — 코덱스 충돌 회피).
      hub_actions: promo ? _injectHandoffIntoHubActions(promo.hubActions, handoff) : _photoHubActions(intent.instagram, result.dataUrl, '업종: ' + (result.preset_label || '자동'), handoff),
      photo_caption: promo ? promo.promoResult.caption : '업종: ' + (result.preset_label || '자동'),
    };
    _renderHistory();
    return true;
  }

  function _chatAutoEditActions(isInstagram) {
    if (isInstagram) {
      return [{ id: 'instagram', label: '📷 미리보기' }, { id: 'editor', label: '더 손보기' }, { id: 'save', label: '저장' }];
    }
    return [
      { id: 'instagram', label: '📷 인스타 미리보기' },
      { id: 'editor', label: '더 손보기' },
      { id: 'save', label: '저장' },
      { id: 'retry', label: '다시' },
    ];
  }

  // [PR1] promo hubActions 의 open_photo_editor 액션에 원본 src + initialState(params) 주입.
  //   photo-chain.js 의 promo 액션 빌더는 payload:{} 라 핸드오프 유실 → 여기서 비파괴 복제 후 보강.
  //   기존 promo 흐름(인스타/템플릿/캡션/고객기록)은 그대로, editor 진입만 보정값 유지.
  function _injectHandoffIntoHubActions(actions, handoff) {
    if (!Array.isArray(actions) || !handoff || !handoff.originalSrc) return actions;
    return actions.map((a) => {
      if (a && a.kind === 'open_photo_editor') {
        return Object.assign({}, a, {
          payload: Object.assign({}, a.payload || {}, {
            photo_url: handoff.originalSrc, initial_tab: 'beauty', initialState: handoff.params,
          }),
        });
      }
      return a;
    });
  }

  // [J-1] 사진 결과 버튼을 Action Hub 규격으로. 기존 동작(instagram/editor/save/retry)은 route:'photo'(photo-actions.js)
  //   로 그대로 유지하고, 템플릿 보기(safe)·고객기록 저장(confirm)을 hub 경로로 덧붙임. 라벨 이모지 제거(CLAUDE 아이콘 규칙).
  function _photoHubActions(isInstagram, dataUrl, caption, handoff) {
    // [잇비 핸드오프] "더 손보기"는 구운 dataUrl 이 아니라 원본 src + initialState(params)로 편집기를 연다.
    //   payload 없으면(과거 메시지) 기존처럼 원본 없이 열림 — 회귀 아님.
    const editorPayload = (handoff && handoff.originalSrc)
      ? { photo_url: handoff.originalSrc, initial_tab: 'beauty', initialState: handoff.params }
      : {};
    const acts = [
      { id: 'instagram', kind: 'open_instagram', label: '인스타 미리보기', phase: 'safe', route: 'photo' },
      { id: 'editor', kind: 'open_photo_editor', label: '더 손보기', phase: 'safe', route: 'photo', payload: editorPayload },
      { id: 'save', kind: 'export_image', label: '내보내기', phase: 'safe', route: 'photo' },
    ];
    if (!isInstagram) acts.push({ id: 'retry', kind: 'retry_edit', label: '다시 보정', phase: 'safe', route: 'photo' });
    acts.push({ id: 'pe_template', kind: 'open_template_panel', label: '템플릿 보기', phase: 'safe', route: 'hub', payload: { dataUrl } });
    acts.push({ id: 'save_customer', kind: 'save_photo_to_customer', label: '고객기록에 저장', phase: 'confirm', route: 'hub', payload: { caption } });
    return acts;
  }

  function _openInstagramPreviewLater(result, fullCaption) {
    setTimeout(() => {
      if (typeof window.openInstagramPreview === 'function') {
        try {
          window.openInstagramPreview({ src: result.dataUrl, ratio: result.ratio, caption: fullCaption, enableUpload: true });
        } catch (_e2) { void _e2; }
      }
    }, 250);
  }

  async function _finishInstagramAutoEdit(opts, preset, result) {
    const capRes = await _generateChatCaption({ preset, question: opts.question, customerCtx: opts.customerCtx });
    const fullCaption = capRes.caption || '';
    if (capRes.error) {
      _history.push({ role: 'assistant', text: '⚠️ ' + capRes.error + '\n캡션 없이 미리보기만 띄울게요.' });
      _renderHistory();
    }
    try {
      if (fullCaption && window.CaptionPrefill && typeof window.CaptionPrefill.set === 'function') {
        window.CaptionPrefill.set(fullCaption);
      }
    } catch (_e) { void _e; }
    _openInstagramPreviewLater(result, fullCaption);
  }

  async function _runChatAutoEdit(opts) {
    const intent = _photoEditIntent(opts.question);
    if (_runPhotoEditorShortcut(opts, intent)) return true;
    if (!intent.edit && !intent.instagram) return false;
    const placeholderIdx = _beginChatAutoEdit(opts);
    const preset = _photoShopPreset(opts.question);
    const result = await _processChatAutoEditPhoto(opts, intent, preset, placeholderIdx);
    if (!_applyChatAutoEditResult(result, intent, placeholderIdx, opts, preset)) return true;
    if (intent.instagram) await _finishInstagramAutoEdit(opts, preset, result);
    return true;
  }

  // [v182 2026-05-18] 챗봇에서 백엔드 /persona/generate 호출 — app-caption.js
  //   _doGenerateCaption 와 동일 payload 구조로 동일 품질 캡션 보장.
  //   photo_context = `${shopType} 시술. ${cfg.tagLabel}: ${typeStr}. ${axesText}`
  //   category = _CAP_CAT_MAP[shopType] || 'extension' (백엔드는 ['extension','nail'] 만 받음)
  //   반환: { caption, error } — 실패 사유 호출자에 명시.
  async function _generateChatCaption(opts) {
    // app-core.js SHOP_CONFIG 와 동일 키 (window 노출됨, 없으면 폴백)
    const SC = window.SHOP_CONFIG || {
      '붙임머리': { tagLabel: '인치 선택', defaultTag: '24인치' },
      '네일아트': { tagLabel: '시술 종류', defaultTag: '젤네일' },
    };
    const CAT_MAP = { '붙임머리': 'extension', '네일아트': 'nail', '네일': 'nail' };

    let shopType = '';
    try { shopType = localStorage.getItem('shop_type') || '붙임머리'; } catch (_e) { shopType = '붙임머리'; }
    const cfg = SC[shopType] || SC['붙임머리'];
    const category = CAT_MAP[shopType] || 'extension';

    // typeStr — 챗봇 메시지에서 인치/스타일 추출, 없으면 cfg.defaultTag (UI 태그 selector 대체)
    const q = (opts.question || '').trim();
    let typeStr = cfg.defaultTag;
    const lenMatch = q.match(/(\d{1,3}\s*인치)/);
    if (lenMatch) typeStr = lenMatch[1].replace(/\s+/g, '');

    // axesText — 챗봇 메시지 + 고객. _doGenerateCaption 의 axes.customer/situation/photo 자리.
    let axesText = '';
    if (opts.customerCtx && opts.customerCtx.name) {
      axesText = opts.customerCtx.name + ' 손님. ' + (q || '오늘 시술 후 자연스럽게 마무리') + '.';
    } else if (q) {
      axesText = q + '.';
    } else {
      axesText = '오늘 시술 후 자연스럽게 마무리. 손님께서 좋아하셨음.';
    }

    const photo_context = (`${shopType} 시술. ${cfg.tagLabel}: ${typeStr}. ${axesText}`).trim().slice(0, 500);

    try {
      const headers = window.authHeader ? Object.assign({}, window.authHeader()) : {};
      headers['Content-Type'] = 'application/json';
      const apiBase = window.API || '';
      const res = await fetch(apiBase + '/persona/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          category,
          photo_context,
          length_tier: 'medium',
          tone_override: 'normal',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn('[chat-caption] /persona/generate 실패:', res.status, data);
        return { caption: '', error: _captionErrorMessage(res.status, data.detail) };
      }
      return { caption: _captionWithTags(data), error: null };
    } catch (e) {
      console.warn('[chat-caption] 네트워크 실패:', e);
      return { caption: '', error: '네트워크 오류 — 잠시 후 다시 시도해주세요' };
    }
  }

  function _captionErrorMessage(status, detailValue) {
    const detail = String(detailValue || '');
    if (status === 401) return '로그인이 만료됐어요. 다시 로그인해주세요';
    if (detail === 'consent_missing') return 'AI 사용 동의가 필요해요 (프로필 → AI 보정 동의)';
    if (/quota_exceeded:caption/.test(detail)) return '오늘 캡션 한도(3회)를 다 쓰셨어요. 내일 다시!';
    return detail ? detail.slice(0, 100) : '캡션 생성 실패';
  }

  function _captionWithTags(data) {
    const caption = (data.caption || '').trim();
    const tagsArr = Array.isArray(data.hashtags) ? data.hashtags : [];
    const tags = tagsArr
      .map(t => String(t || '').trim().replace(/^#+/, ''))
      .filter(Boolean)
      .map(t => '#' + t)
      .join(' ');
    return caption + (tags ? '\n\n' + tags : '');
  }

  function _normalizePhotoFiles(files) {
    if (!files) return [];
    const list = Array.isArray(files)
      ? files
      : ((files && typeof files.length === 'number') ? Array.from(files) : [files]);
    return list.filter(Boolean).slice(0, 10);
  }

  function _readUploadQuestion() {
    const input = document.getElementById('asstInput');
    const question = (input && input.value.trim()) || '';
    if (input) input.value = '';
    return question;
  }

  function _fileToDataUrl(file) {
    return new Promise((resolve) => {
      try {
        const r = new FileReader();
        r.onload = () => resolve(r.result || '');
        r.onerror = () => resolve('');
        r.readAsDataURL(file);
      } catch (_e) { resolve(''); }
    });
  }

  async function _previewUrlForFile(file) {
    try {
      if (typeof window.compressImageForUpload === 'function') {
        const small = await window.compressImageForUpload(file, 800, 0.75);
        return await _fileToDataUrl(small);
      }
    } catch (_e) { void _e; }
    return await _fileToDataUrl(file);
  }

  async function _makePhotoPreviewUrls(files) {
    try {
      const urls = await Promise.all(files.map(f => _previewUrlForFile(f)));
      return urls.filter(Boolean);
    } catch (_e) {
      return [];
    }
  }

  function _photoCustomerContext(question) {
    try {
      if (!window.CustomerCache || typeof window.CustomerCache.get !== 'function') return null;
      const list = window.CustomerCache.get() || [];
      const ql = question.toLowerCase();
      const hit = list.find(c => c && c.name && ql.includes(String(c.name).toLowerCase()));
      return hit ? { id: hit.id, name: hit.name } : null;
    } catch (_e) {
      return null;
    }
  }

  async function _tryPhotoShortcut(question, photoUrls) {
    const photoUrl = photoUrls[0] || '';
    if (!photoUrl || !question) return false;
    try {
      return await _runChatAutoEdit({
        photoUrl,
        photos: photoUrls,
        question,
        customerCtx: _photoCustomerContext(question),
      });
    } catch (_e) {
      return false;
    }
  }

  function _isOcrPhotoIntent(question) {
    return !!(question && /(영수증|매출|금액|결제|판매|메뉴|상품)/.test(question));
  }

  function _pushPhotoSuggestion(question, photoUrls) {
    _history.push({ role: 'user', text: question || '', thumb: photoUrls[0] || '', photos: photoUrls });
    _history.push({
      role: 'assistant',
      text: '사진 1장 확인했어요. 시술 완료 사진으로 자연스럽게 보정할까요?',
      intent_chips: [
        { id: 'edit_done', label: '보정하기', question: '시술 완료사진으로 자연스럽게 보정해줘', primary: true },
        { id: 'instagram', label: '보정하고 인스타 업로드까지', question: '시술 완료사진으로 자연스럽게 보정하고 인스타 업로드까지 준비해줘' },
        { id: 'template', label: '템플릿 먼저 보기', question: '이 사진 템플릿 골라줘' },
      ],
    });
    _renderHistory();
  }

  function _photoPlaceholderText(question, count) {
    const base = question || (count > 1 ? ('사진 ' + count + '장 업로드 중…') : '사진 업로드 중…');
    return (count > 1 && question) ? (question + ' (외 ' + (count - 1) + '장 함께)') : base;
  }

  function _pushPhotoUploadPlaceholder(question, count, photoUrls) {
    const placeholderText = _photoPlaceholderText(question, count);
    _history.push({ role: 'user', text: placeholderText, thumb: photoUrls[0] || '', photos: photoUrls });
    _history.push({ role: 'loading', text: '' });
    _renderHistory();
    _savePending({ kind: 'images', user_msg: placeholderText, photos_thumbs: photoUrls, question: question || '', n: count });
  }

  async function _compressAssistantImages(files) {
    return await Promise.all(files.map(async (file) => {
      try {
        if (typeof window.compressImageForUpload === 'function') {
          return await window.compressImageForUpload(file, 1024, 0.85);
        }
      } catch (_e) { void _e; }
      return file;
    }));
  }

  function _assistantImageName(blob, index) {
    const actualType = (blob && blob.type) || 'image/jpeg';
    const ext = actualType.includes('png') ? '.png'
      : actualType.includes('webp') ? '.webp'
      : actualType.includes('heic') ? '.heic'
      : '.jpg';
    if (blob.name && /.(jpg|jpeg|png|webp|heic|heif)$/i.test(blob.name)) return blob.name;
    return 'photo' + (index + 1) + ext;
  }

  function _buildImagesFormData(compressed, question) {
    const fd = new FormData();
    compressed.forEach((blob, index) => fd.append('images', blob, _assistantImageName(blob, index)));
    fd.append('question', question || '');
    if (_sessionId) fd.append('session_id', String(_sessionId));
    // [T-101] "이 사진" 맥락 — context_hint best-effort (백엔드가 안 읽어도 무해).
    try {
      const h = window.ItdasyAssistantContext && window.ItdasyAssistantContext.buildHint();
      if (h) fd.append('context_hint', h);
    } catch (_e) { void 0; }
    return fd;
  }

  async function _postAssistantImages(fd, count) {
    const auth = (window.authHeader && window.authHeader()) || {};
    const ctrl = new AbortController();
    _inflightCtrl = ctrl;
    const timeoutMs = Math.min(60000 + 30000 * Math.max(0, count - 1), 180000);
    const timeoutId = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await apiFetch('/assistant/ask/images', {
        method: 'POST',
        headers: auth.Authorization ? { Authorization: auth.Authorization } : {},
        body: fd,
        signal: ctrl.signal,
      });
      return res;
    } catch (fetchErr) {
      if (fetchErr.name === 'AbortError') throw new Error('분석이 너무 오래 걸려요. 사진 수를 줄이거나 더 작은 사진으로 시도해주세요');
      throw new Error('서버 연결 실패 — 인터넷 확인 후 다시 시도해주세요');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function _rememberAssistantSession(data) {
    if (!data.session_id) return;
    _sessionId = data.session_id;
    try { localStorage.setItem('assistant_session_id', String(_sessionId)); } catch (_e) { void _e; }
  }

  function _prepareAssistantActions(rawActions, sourceQuestion, logLabel) {
    const dedupeRes = _dedupeAndCapActions(rawActions);
    const actionsList = dedupeRes.actions;
    if (dedupeRes.dropped > 0) {
      try { console.warn(logLabel, { raw: rawActions.length, kept: actionsList.length, dropped: dedupeRes.dropped, kinds: dedupeRes.droppedKinds }); } catch (_e) { void _e; }
    }
    actionsList.forEach(a => {
      try {
        if (a && a.payload && !a._ai_original) a._ai_original = JSON.parse(JSON.stringify(a.payload));
        if (a && !a._source_question) a._source_question = sourceQuestion || '';
      } catch (_e) { void _e; }
    });
    return actionsList;
  }

  function _imageResponseMessage(data, actionsList, rawActionsList) {
    const msg = { role: 'assistant', text: data.answer || '사진을 확인했어요.' };
    if (Array.isArray(data.related_questions) && data.related_questions.length) msg.related = data.related_questions.slice(0, 3);
    if (Array.isArray(data.duplicate_warnings) && data.duplicate_warnings.length) {
      msg.duplicate_warnings = data.duplicate_warnings.map(w => ({ ...w, dismissed: false }));
    }
    _attachActionsToImageMessage(msg, actionsList);
    if (!actionsList.length) _guardEmptyImageActions(msg, data, rawActionsList);
    return msg;
  }

  function _attachActionsToImageMessage(msg, actionsList) {
    if (actionsList.length === 1) {
      msg.action = actionsList[0];
      msg.action_status = 'pending';
    } else if (actionsList.length > 1) {
      msg.action_groups = _groupActions(actionsList);
      if (_shouldUseUnifiedCard(msg.action_groups)) msg.unified_mode = true;
    }
  }

  function _guardEmptyImageActions(msg, data, rawActionsList) {
    const answer = (data.answer || '').trim();
    const hasPrice = /([0-9]{2,3},[0-9]{3}|[0-9]{4,})\s*원/.test(answer);
    if ((hasPrice && answer.length > 30) || rawActionsList.length > 0) {
      msg.text = '분석은 됐지만 자동 저장 가능한 형태로 정리가 안 됐어요.\n사진을 다시 찍거나 직접 추가해주세요.';
    }
  }

  async function _handleAssistantImageResponse(res) {
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || ('서버 오류 (HTTP ' + res.status + ')'));
    }
    const data = await res.json();
    _history = _history.filter(m => m.role !== 'loading');
    _rememberAssistantSession(data);
    const rawActions = (Array.isArray(data.actions) && data.actions.length)
      ? data.actions
      : (data.action && data.action.kind ? [data.action] : []);
    const actionsList = _prepareAssistantActions(rawActions, window._lastAssistantQuestion || '', '[assistant] OCR actions dedupe');
    _history.push(_imageResponseMessage(data, actionsList, rawActions));
    _renderHistory();
    if (window.hapticLight) window.hapticLight();
    _clearChatPending();
    _notifyAnswerArrived();
  }

  function _photoUploadErrorMessage(e) {
    const raw = (e && e.message) || '';
    const isInternal = /^(Can't find variable|undefined is not|null is not|ReferenceError|TypeError|SyntaxError)/i.test(raw);
    if (isInternal) return '사진 분석 중 오류가 발생했어요. 다시 시도해주세요.';
    const human = window._humanError ? window._humanError(e) : raw || '알 수 없는 오류';
    return '사진을 못 읽었어요: ' + human;
  }

  function _handlePhotoUploadError(e) {
    _history = _history.filter(m => m.role !== 'loading');
    try { console.error('[assistant/upload] error:', e); } catch (_logErr) { void _logErr; }
    _history.push({ role: 'assistant', text: _photoUploadErrorMessage(e) });
    _renderHistory();
    _clearChatPending();
  }

  async function _uploadPhotos(files) {
    if (_sendInFlight) return;
    const selectedFiles = _normalizePhotoFiles(files);
    if (!selectedFiles.length) return;
    _sendInFlight = true;
    const question = _readUploadQuestion();
    const photoUrls = await _makePhotoPreviewUrls(selectedFiles);
    // [P0a] 채팅 업로드 사진을 잇비 SourceImage store 에 기록 — 이후 텍스트/버튼이 이 사진을 대상으로.
    //   다중 업로드는 첫 장 기준(photoUrls[0]). 모든 업로드 경로(shortcut/suggestion/OCR) 공통 진입점.
    try { if (window.ItdasySourceImage && photoUrls[0]) window.ItdasySourceImage.noteChatPhoto({ dataUrl: photoUrls[0], messageId: 'chat-' + _history.length }); } catch (_e) { void _e; }
    try {
      if (question && _tryPriceListDraft(null, question, photoUrls)) return;
      if (await _tryPhotoShortcut(question, photoUrls)) return;
      if (photoUrls.length && !_isOcrPhotoIntent(question)) {
        _pushPhotoSuggestion(question, photoUrls);
        if (window.hapticLight) window.hapticLight();
        return;
      }
      _pushPhotoUploadPlaceholder(question, selectedFiles.length, photoUrls);
      const compressed = await _compressAssistantImages(selectedFiles);
      const fd = _buildImagesFormData(compressed, question);
      await _handleAssistantImageResponse(await _postAssistantImages(fd, selectedFiles.length));
    } catch (e) {
      _handlePhotoUploadError(e);
    } finally {
      _sendInFlight = false;
      _inflightCtrl = null;
    }
  }

  function _takePendingPhotoFiles() {
    const pending = _getPhotoPending();
    if (!pending || !pending.files.length) return null;
    return pending.snapshotAndClear();
  }

  function _clearAssistantInput(input) {
    if (input) input.value = '';
  }

  function _pushUserAssistantText(userText, assistantText) {
    _history.push({ role: 'user', text: userText });
    _history.push({ role: 'assistant', text: assistantText });
    _renderHistory();
  }

  function _tryObviousIntent(input, q) {
    try {
      const result = window.AssistantIntent && window.AssistantIntent.classifyObvious(q);
      if (!result || !result.matched) return false;
      _clearAssistantInput(input);
      _pushUserAssistantText(q, result.response);
      return true;
    } catch (_e) {
      return false;
    }
  }

  function _lastPendingSingleAction() {
    for (let i = _history.length - 1; i >= 0; i--) {
      const m = _history[i];
      if (m && m.role === 'assistant' && m.action && m.action.kind && m.action_status !== 'done') return m;
    }
    return null;
  }

  function _isAffirmReply(q) {
    return /^(응|그래|맞아|예|네|좋아|확인|진행|취소해|ok|좋|어어|ㅇㅇ|어)$/i.test(q.trim());
  }

  function _markActionFailed(message, err) {
    message.action_status = 'failed';
    message.action_error = window._humanError ? window._humanError(err) : ((err && err.message) || '알 수 없는 오류');
    _renderHistory();
    _history.push({ role: 'assistant', text: '실패: ' + message.action_error });
    _renderHistory();
  }

  async function _tryAffirmAction(input, q) {
    if (!_isAffirmReply(q)) return false;
    const message = _lastPendingSingleAction();
    if (!message) return false;
    _clearAssistantInput(input);
    _history.push({ role: 'user', text: q });
    _renderHistory();
    try {
      const data = await _executeAction(message.action);
      message.action_status = 'done';
      _renderHistory();
      _history.push({ role: 'assistant', text: data.message || '✓ 완료했어요' });
      _renderHistory();
      if (window.hapticSuccess) window.hapticSuccess();
      if (window.Dashboard?.refresh) window.Dashboard.refresh(true);
    } catch (err) {
      if (err && err.userCancelled) {
        if (window.showToast) window.showToast('취소했어요');
        return true;
      }
      _markActionFailed(message, err);
    }
    return true;
  }

  function _pushCancelBookingResult(input, q, result) {
    _clearAssistantInput(input);
    _history.push({ role: 'user', text: q });
    if (result.kind === 'card') {
      _history.push({
        role: 'assistant',
        text: result.action.confirmation_text || (result.customer.name + '님 예약 취소할까요?'),
        action: result.action,
        action_status: 'pending',
      });
    } else if (result.kind === 'message') {
      _history.push({ role: 'assistant', text: result.text });
    }
    _renderHistory();
  }

  async function _tryCancelBookingShortcut(input, q) {
    try {
      if (!window.AssistantIntent || typeof window.AssistantIntent.tryCancelBooking !== 'function') return false;
      const result = await window.AssistantIntent.tryCancelBooking(q);
      if (!result || !result.matched) return false;
      _pushCancelBookingResult(input, q, result);
      return true;
    } catch (_e) {
      return false;
    }
  }

  // [T-114] "오늘 브리핑/뭐 해야/샵 상태" → 오늘 운영 우선순위 요약(읽기 전용). 단순 조회는 미감지.
  async function _tryDailyBriefingShortcut(input, q) {
    try {
      if (!window.ItdasyDailyBriefing || !window.ItdasyDailyBriefing.detect(q)) return false;
      _clearAssistantInput(input);
      _history.push({ role: 'user', text: q });
      _history.push({ role: 'loading', text: '' });
      _renderHistory();
      let res;
      try { res = await window.ItdasyDailyBriefing.run(); }
      catch (_e) { res = null; }
      _history = _history.filter((m) => m.role !== 'loading');
      _history.push({
        role: 'assistant',
        text: (res && res.message) || '브리핑을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
        briefing_actions: (res && Array.isArray(res.actions)) ? res.actions : [],   // [T-115] 추천 버튼
      });
      _renderHistory();
      return true;
    } catch (_e) {
      return false;
    }
  }

  // [T-110] "{고객} 안부/리터치/재방문 문자 초안 써줘" → draft_message 즉시 실행(발송 아님) + 초안 + 복사.
  //   "보내줘" 가 와도 실제 발송 안 함 — 초안만 만들고 확인 안내. draft_message 는 mutation/undo 없음.
  async function _tryDraftMessageShortcut(input, q) {
    try {
      if (!window.AssistantIntent || typeof window.AssistantIntent.tryDraftMessage !== 'function') return false;
      const ctx = (window.ItdasyAssistantContext && window.ItdasyAssistantContext.collect()) || {};
      const result = await window.AssistantIntent.tryDraftMessage(q, ctx);
      if (!result) return false;
      _clearAssistantInput(input);
      _history.push({ role: 'user', text: q });
      if (result.kind === 'message') {
        _history.push({ role: 'assistant', text: result.text });
        _renderHistory();
        return true;
      }
      // kind === 'execute' — draft_message 는 safe(발송 없음) → 바로 실행하고 초안 표시.
      _history.push({ role: 'loading', text: '' });
      _renderHistory();
      try {
        const d = await _executeAction(result.action);
        _history = _history.filter((m) => m.role !== 'loading');
        const draft = (d && (d.message_draft || d.draft) || '').trim();
        const name = (result.customer && result.customer.name) || '고객';
        if (draft) {
          try { if (navigator.clipboard) await navigator.clipboard.writeText(draft); } catch (_e) { void 0; }
          const head = result.hadSendWord
            ? `${name}님께 보낼 문구 초안을 만들었어요. (실제 발송은 하지 않았어요 — 복사해서 확인 후 사용하세요)`
            : `${name}님께 보낼 초안을 만들었어요. 실제 발송은 하지 않았고, 복사해서 확인 후 사용하시면 돼요.`;
          // [T-113] 사용한 컨텍스트 요약 / 정보 부족 안내.
          const _ctxLine = result.contextSummary
            ? '\n📋 ' + result.contextSummary
            : (result.hasRecent === false ? '\n📋 최근 시술 정보가 부족해서 기본 안내 초안으로 만들었어요.' : '');
          _history.push({ role: 'assistant', text: head + _ctxLine + '\n\n---\n' + draft + '\n---\n(클립보드에 복사됨)' });
        } else {
          _history.push({ role: 'assistant', text: '초안이 비어 있어요. 톤(안부/리터치/감사)이나 고객을 더 구체적으로 알려주세요.' });
        }
        _renderHistory();
      } catch (e) {
        _history = _history.filter((m) => m.role !== 'loading');
        _history.push({ role: 'assistant', text: '초안 생성에 실패했어요. 잠시 후 다시 시도해 주세요.' });
        _renderHistory();
      }
      return true;
    } catch (_e) {
      return false;
    }
  }

  // [T-008/P0-C] "{이름} 예약 잡아줘" → 고객+시간 해석 → 확인 카드(create_booking) 또는 빈시간 추천.
  // [J-3] "민지님 뭐 챙겨야 돼? / 이 손님 리터치 해야 돼? / 오래 안 온 손님" → 고객 상태 카드 + Action Hub 버튼.
  //   조회 전용. 자동 발송/예약/저장/추측 0. 미매칭/모듈없음 시 false(기존 경로 유지).
  async function _tryCustomerStatusCard(input, q) {
    try {
      const C = window.ItdasyCustomerStatusCard;
      if (!C || !C.detectCustomerStatusIntent || !C.detectCustomerStatusIntent(q)) return false;
      const ctx = (window.ItdasyAssistantContext && window.ItdasyAssistantContext.collect()) || {};
      const res = await C.run(q, ctx);
      if (!res || !res.message) return false;
      _clearAssistantInput(input);
      _history.push({ role: 'user', text: q });
      _history.push({ role: 'assistant', text: res.message, hub_actions: Array.isArray(res.hubActions) ? res.hubActions : [] });
      _renderHistory();
      return true;
    } catch (_e) {
      return false;
    }
  }

  function _priceDraftPhotoUrls(photoUrls) {
    if (photoUrls && photoUrls.length) return photoUrls;
    try {
      const src = window.ItdasySourceImage && window.ItdasySourceImage.resolve();
      return (src && src.origin === 'chat' && src.dataUrl) ? [src.dataUrl] : [];
    } catch (_e) {
      return [];
    }
  }

  function _priceDraftActions(draft, photos) {
    return [{
      id: 'apply_price_template',
      kind: 'apply_price_template',
      label: '가격표 템플릿에 적용',
      phase: 'safe',
      route: 'hub',
      payload: { draft, preferredTemplateId: 'v3-price-clean-rose', dataUrl: (photos && photos[0]) || '' },
    }];
  }

  function _tryPriceListDraft(input, q, photoUrls) {
    try {
      const P = window.ItdasyAssistantPriceList;
      if (!P || typeof P.parseRequest !== 'function') return false;
      const result = P.parseRequest(q);
      if (!result || !result.matched || !result.rows || !result.rows.length) return false;
      const photos = _priceDraftPhotoUrls(photoUrls);
      _clearAssistantInput(input);
      _history.push({ role: 'user', text: q, thumb: photos[0] || '', photos: photos });
      _history.push({
        role: 'assistant',
        text: P.formatDraftMessage(result),
        price_list_draft: result,
        thumb: photos[0] || '',
        photos: photos,
        hub_actions: _priceDraftActions(result, photos),
      });
      _renderHistory();
      if (window.hapticLight) window.hapticLight();
      return true;
    } catch (e) {
      try { console.warn('[assistant-price-list] draft failed', e); } catch (_logErr) { void _logErr; }
      return false;
    }
  }

  async function _tryCreateBookingShortcut(input, q) {
    try {
      if (!window.AssistantIntent || typeof window.AssistantIntent.tryCreateBooking !== 'function') return false;
      const ctx = (window.ItdasyAssistantContext && window.ItdasyAssistantContext.collect()) || {};
      const result = await window.AssistantIntent.tryCreateBooking(q, ctx);
      if (!result || !result.matched) return false;
      _clearAssistantInput(input);
      _history.push({ role: 'user', text: q });
      if (result.kind === 'card' && result.action) {
        // [P0-C] 예약 확인 카드 — pending single-action 으로 푸시 → "응/예약해줘" 는 _tryAffirmAction 이 실행.
        _history.push({
          role: 'assistant',
          text: result.action.confirmation_text || (result.customer && result.customer.name + '님 예약 잡을까요?'),
          action: result.action,
          action_status: 'pending',
        });
      } else {
        _history.push({ role: 'assistant', text: result.text });
        if (result.kind === 'open_booking') {
          window._pendingBookingCustomer = (result.customer && result.customer.id != null)
            ? { id: result.customer.id, name: result.customer.name } : null;
          setTimeout(() => {
            if (typeof window.openCalendarView === 'function') window.openCalendarView();
            else if (typeof window.openBooking === 'function') window.openBooking();
          }, 80);
        }
      }
      _renderHistory();
      return true;
    } catch (_e) {
      return false;
    }
  }

  async function _tryAsyncIntentRule(input, q) {
    try {
      const rule = window.AssistantIntent?.findAsyncRule && window.AssistantIntent.findAsyncRule(q);
      if (!rule) return false;
      _clearAssistantInput(input);
      _history.push({ role: 'user', text: q });
      _history.push({ role: 'loading', text: '' });
      _renderHistory();
      await _runAsyncIntentRule(rule);
      return true;
    } catch (_e) {
      return false;
    }
  }

  async function _runAsyncIntentRule(rule) {
    try {
      const result = await window.AssistantIntent.execAsyncRule(rule);
      _history = _history.filter(m => m.role !== 'loading');
      _history.push({ role: 'assistant', text: result.response });
      _renderHistory();
    } catch (fetchErr) {
      _history = _history.filter(m => m.role !== 'loading');
      _history.push({ role: 'assistant', text: '⚠️ 일시적으로 조회가 안 됐어요. 잠시 후 다시 시도해 주세요.' });
      _renderHistory();
      try { console.warn('[assistant-intent] async fetch failed', fetchErr); } catch (_e) { void _e; }
    }
  }

  function _runSheetShortcut(input, fn) {
    _clearAssistantInput(input);
    try { fn(); } catch (_e) { void _e; }
  }

  function _tryKeywordShortcut(input, q) {
    if (_tryPromoPhotoChain(input, q)) return true;     // [J-2] 홍보 사진 체인(보정+캡션+템플릿+버튼) — photo-flow 보다 먼저
    if (_tryPhotoFlowShortcut(input, q)) return true;   // [T-104] 홍보 풀체인(폴백) — 단일 보정/편집기 오픈보다 먼저
    if (_tryPhotoEditorShortcut(input, q)) return true;
    if (_trySimpleOpenShortcut(input, q)) return true;
    if (_tryTabShortcut(input, q)) return true;
    return _tryUtilityShortcut(input, q);
  }

  // [T-104.5] photo-flow 가 "저장할까요?" 제안 후 사용자가 "응/저장해줘" → 실제 고객 기록 저장.
  //   pending 없거나 저장의도 아니면 false(기존 파이프라인 계속). 기존 confirm 카드는 _tryAffirmAction 이 먼저.
  async function _tryPhotoFlowSaveConfirm(input, q) {
    try {
      if (!window.ItdasyPhotoFlow || !window.ItdasyPhotoFlow.hasPendingSave || !window.ItdasyPhotoFlow.hasPendingSave()) return false;
      const ctx = (window.ItdasyAssistantContext && window.ItdasyAssistantContext.collect()) || {};
      const res = await window.ItdasyPhotoFlow.confirmSave(q, ctx);
      if (!res) return false;   // 저장 의도 아님 → pending 유지, 다른 핸들러로
      _clearAssistantInput(input);
      _history.push({ role: 'user', text: q });
      _history.push({ role: 'assistant', text: res.message });
      _renderHistory();
      return true;
    } catch (_e) {
      return false;
    }
  }

  // [J-2] "이 사진 홍보용으로 예쁘게" → 보정 + 캡션 초안 + 템플릿 추천 + Action Hub 버튼. 미매칭/모듈없음 시 false.
  function _tryPromoPhotoChain(input, q) {
    try {
      const C = window.ItdasyPromoPhotoChain;
      if (!C || !C.detectPromoPhotoChain || !C.detectPromoPhotoChain(q)) return false;
      const ctx = (window.ItdasyAssistantContext && window.ItdasyAssistantContext.collect()) || {};
      const res = C.runPromoPhotoChain(q, ctx);
      if (!res || !res.message) return false;
      _clearAssistantInput(input);
      _history.push({ role: 'user', text: q });
      // [CF-2] 추천 템플릿 3개를 메시지에 직접 카드로 표시(잇비 응답만 보고 고르게).
      _history.push({ role: 'assistant', text: res.message,
        hub_actions: Array.isArray(res.hubActions) ? res.hubActions : [],
        tpl_recos: Array.isArray(res.templateRecos) ? res.templateRecos : [],
        promo_result: res.promoResult || null,
        photo_result: res.promoResult && res.promoResult.afterDataUrl
          ? { dataUrl: res.promoResult.afterDataUrl, ratio: '4:5' } : null });
      _renderHistory();
      return true;
    } catch (_e) {
      return false;
    }
  }

  // [T-104] "이 사진 홍보용으로 예쁘게" → 업종 보정 적용 + 다음 단계 제안. 미매칭 시 false(기존 경로 유지).
  function _tryPhotoFlowShortcut(input, q) {
    try {
      if (!window.ItdasyPhotoFlow || !window.ItdasyPhotoFlow.detectPhotoFlowIntent(q)) return false;
      const ctx = (window.ItdasyAssistantContext && window.ItdasyAssistantContext.collect()) || {};
      const res = window.ItdasyPhotoFlow.runPromoFlow(q, ctx);
      if (!res || !res.message) return false;
      _clearAssistantInput(input);
      _history.push({ role: 'user', text: q });
      _history.push({ role: 'assistant', text: res.message });
      _renderHistory();
      return true;
    } catch (_e) {
      return false;
    }
  }

  function _tryPhotoEditorShortcut(input, q) {
    const editor = window.PhotoEditor && typeof window.PhotoEditor.open === 'function';
    if (!editor) return false;
    if (window.ItdasyAssistantPhotoCommands?.tryRun?.(input, q, { clearInput: _clearAssistantInput })) return true;
    if (/(사진|이미지|포토)\\s*(편집|보정|수정|꾸미|예쁘게|만들|업로드)/.test(q)
        || /(편집기|편집\\s*화면|보정\\s*화면|에디터)\\s*(열|보여|시작|이동|가)?/.test(q)
        || /^편집기?$/.test(q.trim())) {
      _runSheetShortcut(input, () => window.PhotoEditor.open({}));
      return true;
    }
    if (/(전후|before\\s*after|b&a|비포\\s*애프터|시술\\s*전후).*?(카드|만들|보여|업로드)/.test(q)) {
      _runSheetShortcut(input, () => window.PhotoEditor.open({ initial_tab: 'template' }));
      return true;
    }
    return false;
  }

  function _trySimpleOpenShortcut(input, q) {
    const pairs = [
      [/(브랜드\\s*키트|brand\\s*kit|샵\\s*브랜드|워터마크\\s*(설정|관리))/, () => window.BrandKit?.open?.()],
      [/회원권.*(만료|임박)|만료.*회원권/, () => window.MembershipUI?.openExpiringList?.(30)],
      [/(dm|디엠|자동\\s*응답|자동\\s*답장).*(설정|관리|편집|룰)|자동\\s*응답\\s*(켜|꺼|on|off)/, window.openDMAutoreplySettings],
      [/(통계|분석|인사이트|insight|매출\\s*(요약|리포트|추이|분석))/, window.openInsights],
      [/(백업|복구|backup|데이터.*(내보내|받|export))/, window.openBackupScreen],
      [/(리뷰|후기)\\s*(요청|보내|부탁|발송)/, window.openReviewRequests],
      [/(이탈|위험|복귀|재방문)\\s*(고객|손님|관리)?|retention/i, window.openRetentionAI],
    ];
    return _runFirstShortcutPair(input, q, pairs);
  }

  function _runFirstShortcutPair(input, q, pairs) {
    for (const pair of pairs) {
      if (pair[0].test(q) && typeof pair[1] === 'function') {
        _runSheetShortcut(input, pair[1]);
        return true;
      }
    }
    return false;
  }

  function _tryTabShortcut(input, q) {
    if (/(갤러리|포트폴리오|작품)\\s*(열|보여|이동|가)/.test(q) || /^(갤러리|포트폴리오)$/.test(q.trim())) {
      if (typeof window.showTab === 'function') {
        _runSheetShortcut(input, () => window.showTab('gallery', document.querySelector('.tab-bar__btn[data-tab="gallery"]')));
        return true;
      }
    }
    if (/(영업\\s*시간|매장\\s*정보|가게\\s*정보|샵\\s*정보|설정).*(변경|수정|확인|보기|열|관리)?/.test(q)) {
      return _trySettingsShortcut(input, q);
    }
    return false;
  }

  function _trySettingsShortcut(input, q) {
    if (!/^설정\\s*$|영업\\s*시간|매장\\s*정보|가게\\s*정보|샵\\s*정보/.test(q)) return false;
    if (typeof window.openSettingsHub !== 'function') return false;
    _runSheetShortcut(input, () => window.openSettingsHub());
    return true;
  }

  function _tryUtilityShortcut(input, q) {
    if (/(캡션|문구|글|insta.*글|인스타.*글).*(만들|생성|작성|뽑)|^(캡션|글)\\s*(생성|만들기)$/.test(q.trim())) {
      if (typeof window.openInstantCaption === 'function') { _runSheetShortcut(input, () => window.openInstantCaption()); return true; }
    }
    if (/(음성|녹음|받아쓰|마이크|보이스|voice).*(캡션|글|입력|문구)?/.test(q)) {
      if (typeof window.openVoiceCaption === 'function') { _runSheetShortcut(input, () => window.openVoiceCaption()); return true; }
    }
    if (/(결제|플랜|구독|업그레이드|pro|premium)\\s*(변경|선택|보|관리|업)?/.test(q)) return _tryPlanShortcut(input);
    return false;
  }

  function _tryPlanShortcut(input) {
    if (typeof window.openPlanPopup === 'function') { _runSheetShortcut(input, () => window.openPlanPopup()); return true; }
    if (typeof window.openPlan === 'function') { _runSheetShortcut(input, () => window.openPlan()); return true; }
    return false;
  }

  function _hideSendHelpers() {
    try {
      const tb = document.getElementById('asstTypeahead');
      if (tb) { tb.style.display = 'none'; tb.innerHTML = ''; }
    } catch (_e) { void _e; }
    try {
      const quickLabel = document.getElementById('asstQuickLabel');
      const suggest = document.getElementById('asstSuggest');
      if (quickLabel) quickLabel.style.display = 'none';
      if (suggest) suggest.style.display = 'none';
    } catch (_e) { void _e; }
  }

  function _beginTextAsk(input, q) {
    _sendInFlight = true;
    _clearAssistantInput(input);
    _hideSendHelpers();
    _history.push({ role: 'user', text: q });
    _history.push({ role: 'loading', text: '' });
    _renderHistory();
    _savePending({ kind: 'text', user_msg: q });
  }

  async function _postAssistantAsk(q) {
    const ctrl = new AbortController();
    _inflightCtrl = ctrl;
    // [T-101] 현재 상황(화면/고객/사진/업종/최근작업)을 context_hint 로 동봉 →
    //   백엔드가 LLM 프롬프트 [힌트] 블록에 주입(assistant.py:2956). 실패해도 ask 는 정상.
    let _hint;
    try { _hint = window.ItdasyAssistantContext && window.ItdasyAssistantContext.buildHint(); }
    catch (_e) { _hint = undefined; }
    const res = await apiFetch('/assistant/ask', {
      method: 'POST',
      headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, session_id: _sessionId || undefined, context_hint: _hint || undefined }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }

  function _rawActionsFromResponse(data) {
    return (Array.isArray(data.actions) && data.actions.length)
      ? data.actions
      : (data.action && data.action.kind ? [data.action] : []);
  }

  function _pushFallbackAsk(q) {
    _history.push({
      role: 'assistant',
      text: '정확히 못 알아들었어요. 아래처럼 정리해봤는데 맞나요?',
      fallback: _heuristicExtract(q),
    });
    _renderHistory();
    if (window.hapticLight) window.hapticLight();
    _clearChatPending();
    _notifyAnswerArrived();
  }

  function _textResponseMessage(data, actionsList) {
    const msg = { role: 'assistant', text: data.answer || '답을 만들지 못했어요.' };
    if (Array.isArray(data.related_questions) && data.related_questions.length) msg.related = data.related_questions.slice(0, 3);
    if (Array.isArray(data.duplicate_warnings) && data.duplicate_warnings.length) {
      msg.duplicate_warnings = data.duplicate_warnings.map(w => ({ ...w, dismissed: false }));
    }
    _attachActionsToImageMessage(msg, actionsList);
    return msg;
  }

  function _finishAskResponse(q, data) {
    _history = _history.filter(m => m.role !== 'loading');
    _rememberAssistantSession(data);
    const rawActions = _rawActionsFromResponse(data);
    const actionsList = _prepareAssistantActions(rawActions, q, '[assistant] /ask actions dedupe');
    if (!(data.answer || '').trim() && actionsList.length === 0) {
      _pushFallbackAsk(q);
      return;
    }
    _history.push(_textResponseMessage(data, actionsList));
    _renderHistory();
    if (window.hapticLight) window.hapticLight();
    _clearChatPending();
    _notifyAnswerArrived();
  }

  function _sendErrorText(e) {
    const msg = (e && e.message) || '';
    if (/409|conflict|중복|이미.*예약/.test(msg)) return '⚠️ ' + msg.replace(/^.*?(?:detail":\s*"|429:\s*|409:\s*)/, '').replace(/"\}.*$/, '');
    if (/timeout|deadline|timed out|너무 오래/i.test(msg)) return '⏱️ 응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.';
    if (/503|maintenance|점검/.test(msg)) return '🛠️ 서버 점검 중이에요. 5분 후 다시 시도해 주세요.';
    if (/quota|429|rate.?limit/i.test(msg)) return '⏰ 잠깐 요청이 몰려서 늦어져요. 1분 후 다시 보내주세요.';
    if (/403|permission|denied/i.test(msg)) return '🔒 권한 문제예요. 운영팀에 문의해 주세요.';
    if (/network|failed to fetch|네트워크/i.test(msg) || !navigator.onLine) return '📡 인터넷 연결을 확인해 주세요.';
    return '에러: ' + (window._humanError ? window._humanError(e) : msg);
  }

  function _handleSendError(e) {
    _history = _history.filter(m => m.role !== 'loading');
    if (e && e.name === 'AbortError') {
      _renderHistory();
      _clearChatPending();
      return;
    }
    _history.push({ role: 'assistant', text: _sendErrorText(e) });
    _renderHistory();
    _clearChatPending();
  }

  async function _trySendShortcuts(input, q) {
    if (_tryObviousIntent(input, q)) return true;
    if (await _tryAffirmAction(input, q)) return true;
    if (await _tryPhotoFlowSaveConfirm(input, q)) return true;   // [T-104.5] 기존 confirm 다음 — photo-flow 저장 확인
    if (await _tryCancelBookingShortcut(input, q)) return true;
    if (await _tryCreateBookingShortcut(input, q)) return true;
    if (await _tryDraftMessageShortcut(input, q)) return true;   // [T-110] 메시지 초안(발송 아님)
    if (await _tryDailyBriefingShortcut(input, q)) return true;  // [T-114] 오늘 운영 브리핑(읽기 전용)
    if (await _tryCustomerStatusCard(input, q)) return true;     // [J-3] 고객 상태 카드(읽기 전용 + 다음액션 버튼)
    if (await _tryAsyncIntentRule(input, q)) return true;
    return _tryKeywordShortcut(input, q);
  }

  // [P0a] 사진 직후 후속 텍스트가 "그 사진"에 대한 명령인지(누끼/배경/보정/템플릿/홍보/인스타/업로드/손님 등).
  function _looksPhotoFollowup(q) {
    return /(누끼|배경|보정|예쁘게|템플|홍보|인스타|업로드|올려|게시|전후|캡션|손님|그대로|원본|네일|붙임머리|속눈썹|피부)/.test(q || '');
  }

  async function _send() {
    if (_sendInFlight) return;
    const input = document.getElementById('asstInput');
    const pendingFiles = _takePendingPhotoFiles();
    if (pendingFiles) { _uploadPhotos(pendingFiles); return; }
    const q = input ? input.value.trim() : '';
    if (!q) return;
    // [P0a] pending 사진이 없어도, 직전에 채팅으로 올린 사진(≤5분)이 있고 텍스트가 사진 명령이면
    //   그 사진을 대상으로 기존 사진 shortcut 경로를 재사용("사진+네일 손님이야" 연결). 아니면 기존 흐름.
    if (_tryTemplateSampleShortcut(input, q)) return;   // [M2] 매처 샘플 → I2/I3 자동 적용 — null 이면 false 로 아래 fallback
    if (_tryPriceListDraft(input, q)) return;
    if (_tryReviewCardShortcut(input, q)) return;   // [I3a] 후기 카드 자동 적용 — promo chain/photo-followup 보다 먼저
    if (_tryBeforeAfterCardShortcut(input, q)) return;   // [I3b] 전후(BA) 카드 자동 적용 — promo chain/photo-followup 보다 먼저
    if (window.ItdasySourceImage && _looksPhotoFollowup(q)) {
      try {
        const src = window.ItdasySourceImage.resolve();
        if (src && src.origin === 'chat' && src.dataUrl) {
          _sendInFlight = true;   // _uploadPhotos 와 동일하게 이중 전송 가드
          try {
            if (await _tryPhotoShortcut(q, [src.dataUrl])) { if (input) input.value = ''; return; }
          } finally { _sendInFlight = false; }
        }
      } catch (_e) { void _e; }
    }
    if (await _trySendShortcuts(input, q)) return;
    _beginTextAsk(input, q);
    try {
      _finishAskResponse(q, await _postAssistantAsk(q));
    } catch (e) {
      _handleSendError(e);
    } finally {
      _sendInFlight = false;
      _inflightCtrl = null;
    }
  }

  // [2026-04-26] 멀티 디바이스 동기화 — 서버에서 최근 세션 messages 로드.
  // 폰·컴 다른 디바이스에서 같은 user 로 들어왔을 때도 같은 대화방.
  let _historyLoadedFromServer = false;
  // [2026-04-26 A8 픽스] 챗봇 자체가 발사한 data-changed 는 server reload 트리거 X
  // (_runAction/_runGroupRow/_runUnifiedAll → _invalidateCachesFor → dispatchEvent
  //  → 만약 여기서 server history 를 덮어쓰면 진행 중인 action_groups / bulkProgress /
  //  items[].status 등이 전부 날아가버려서 "고객명단 사라지는" 증상이 발생함)
  let _selfDispatchedDataChange = false;
  async function _loadServerHistory(force = false) {
    if (_historyLoadedFromServer && !force) return;
    try {
      const res = await apiFetch('/assistant/session/current', {
        headers: { ...authHeader() },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.session_id) {
        _sessionId = data.session_id;
        try { localStorage.setItem('assistant_session_id', String(_sessionId)); } catch (_) { void 0; }
      }
      // 서버 messages 가 비어있지 않으면 _history 덮어쓰기 (서버가 진실원천)
      // [2026-04-26 A8 픽스] 단, 로컬에 진행중 action_groups/action 가 있는 메시지는
      //   서버 텍스트와 매칭해서 그룹 상태(expanded, bulkProgress, items.status, errorMsg)를
      //   보존한다. 그래야 "추가하기 누르고 잠깐 뒤에 새로고침되어도 고객명단/그룹 카드 유지".
      if (Array.isArray(data?.messages) && data.messages.length) {
        _history = _mergeServerHistory(data.messages);
      }
      _historyLoadedFromServer = true;
      _lastRenderedSig = ''; // 통째 갱신 → 강제 풀 렌더
      _renderHistory();
    } catch (_e) { /* offline 등 — 기존 _history 유지 */ }
  }

  function _mergeServerHistory(messages) {
    const localByText = _localHistoryByText();
    const survivors = _pendingHistorySurvivors(messages);
    const merged = messages.map(m => _mergeServerMessage(m, localByText));
    return survivors.length ? merged.concat(survivors) : merged;
  }

  function _localHistoryByText() {
    const map = new Map();
    for (const m of _history) {
      if (!m || !m.text) continue;
      const key = (m.role || 'assistant') + '::' + m.text;
      if (!map.has(key)) map.set(key, m);
    }
    return map;
  }

  function _pendingHistorySurvivors(messages) {
    const serverTextSet = new Set(messages.map(m => ((m.role || 'assistant') + '::' + (m.text || ''))));
    return _history.filter(m => {
      if (!m) return false;
      if (m.role === 'loading') return true;
      const key = (m.role || 'assistant') + '::' + (m.text || '');
      return m.role === 'user' && !serverTextSet.has(key);
    });
  }

  function _mergeServerMessage(m, localByText) {
    const role = m.role || 'assistant';
    const text = m.text || '';
    const merged = { role, text };
    const local = localByText.get(role + '::' + text);
    if (local) _copyLocalMessageState(merged, local);
    return merged;
  }

  function _copyLocalMessageState(merged, local) {
    ['action_groups', 'unified_progress', 'action', 'action_status', 'action_error',
      'action_orig_payload', 'duplicate_warnings', 'fallback', 'fallback_status',
      'related', 'photos', 'thumb'].forEach(key => {
      if (local[key]) merged[key] = local[key];
    });
    if (local.unified_mode != null) merged.unified_mode = local.unified_mode;
    if (local.edit_mode != null) merged.edit_mode = local.edit_mode;
  }
  // "데이터 동기화" 버튼 / focus 복귀 시 강제 새로고침
  // [2026-04-26 A8 픽스] 자기 자신이 발사한 이벤트면 reload 안 함 (그룹 상태 보존)
  // [BUG-R2-3] 중복 등록 방어 — Capacitor 재초기화 시 리스너 쌓임 방지
  if (!window._assistantDataListenerInit) {
    window._assistantDataListenerInit = true;
    window.addEventListener('itdasy:data-changed', () => {
      if (_selfDispatchedDataChange) {
        _selfDispatchedDataChange = false;
        return;
      }
      _historyLoadedFromServer = false;
      _loadServerHistory(true);
    });
  }

  window.openAssistant = function () {
    _ensureSheet();
    const sheet = document.getElementById('assistantSheet');
    _showAssistantSheet(sheet);
    _restoreChatPendingOnOpen();
    _lastRenderedSig = ''; // sheet 새로 열렸으니 강제 1회 풀 렌더
    _renderHistory();
    // 챗봇 열었으니 unread 점 제거
    _setUnreadAnswer(false);
    // 첫 오픈 시 서버 history 동기화 (백그라운드, 즉시 렌더에 영향 X)
    _loadServerHistory();
    // [2026-04-29 F1] 능동 제안 carousel — chat 입력창 위
    _loadProactiveSuggestions();
    // [2026-05-16] 대화 없으면 퀵액션(이런 것도 돼요 + chips) 표시, 있으면 숨김.
    // 챗봇 닫았다 다시 열 때 _history 가 비어있을 수도/있을 수도 → 상태에 맞춰 갱신.
    _syncQuickSuggestVisibility();
    setTimeout(() => document.getElementById('asstInput')?.focus(), 60);
    // [2026-04-26 A5] popstate 등록 + 스와이프 다운 닫기
    _registerAssistantSheet();
  };

  // [P0b] 풀스크린 오버레이(인스타/템플릿 미리보기 등)를 올바른 stacking context에 마운트.
  //   잇비 시트가 열려 있으면 시트 panel 내부(같은 context)로 absolute 마운트 → 입력창/시트 뒤로 안 깔림.
  //   닫혀 있으면 기존대로 body 에 fixed. (잇비 도구메뉴와 동일한 검증된 패턴)
  window.ItdasyMountOverlay = function (el) {
    if (!el) return;
    try {
      const sh = document.getElementById('assistantSheet');
      const open = !!(sh && sh.style.display !== 'none' && sh.style.pointerEvents !== 'none');
      const panel = open ? document.getElementById('assistantSheetPanel') : null;
      if (panel) { el.style.position = 'absolute'; panel.appendChild(el); }
      else { el.style.position = 'fixed'; document.body.appendChild(el); }
    } catch (_e) { try { document.body.appendChild(el); } catch (_e2) { void _e2; } }
  };

  function _showAssistantSheet(sheet) {
    sheet.style.display = 'block';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      sheet.style.opacity = '1';
      sheet.style.pointerEvents = 'auto';
    }));
    document.body.style.overflow = 'hidden';
    document.body.classList.add('assistant-open');
  }

  function _restoreChatPendingOnOpen() {
    try {
      const pending = _readChatPending();
      if (!pending || !pending.user_msg || _sendInFlight) return;
      const ageMs = Date.now() - (pending.started_at || 0);
      if (ageMs >= PENDING_TIMEOUT_MS) { _clearChatPending(); return; }
      _pushPendingMessageIfNeeded(pending);
      _ensurePendingTick();
    } catch (_e) { void _e; }
  }

  function _pushPendingMessageIfNeeded(pending) {
    const dup = _history.some(m => m && m.role === 'user' && m.text === pending.user_msg);
    if (dup) return;
    const userMsg = { role: 'user', text: pending.user_msg };
    if (Array.isArray(pending.photos_thumbs) && pending.photos_thumbs.length) {
      userMsg.photos = pending.photos_thumbs;
      userMsg.thumb = pending.photos_thumbs[0] || '';
    }
    _history.push(userMsg);
    _history.push({ role: 'loading', text: '' });
  }

  function _ensurePendingTick() {
    if (_pendingTickTimer) return;
    _pendingTickTimer = setInterval(() => {
      const sh = document.getElementById('assistantSheet');
      if (sh && sh.style.display !== 'none') _tickLoadingElapsed();
    }, 1000);
  }

  function _syncQuickSuggestVisibility() {
    try {
      const ql = document.getElementById('asstQuickLabel');
      const qs = document.getElementById('asstSuggest');
      if (!ql || !qs) return;
      const show = !_history || _history.length === 0;
      ql.style.display = show ? '' : 'none';
      qs.style.display = show ? 'flex' : 'none';
    } catch (_e) { void _e; }
  }

  function _registerAssistantSheet() {
    try {
      if (typeof window._registerSheet === 'function') window._registerSheet('assistant', window.closeAssistant);
      if (typeof window._markSheetOpen === 'function') window._markSheetOpen('assistant');
      const panel = document.getElementById('assistantSheetPanel');
      if (panel && typeof window._attachSwipeDownClose === 'function') {
        window._attachSwipeDownClose(panel, window.closeAssistant);
      }
    } catch (_e) { void _e; }
  }
  window.closeAssistant = function () {
    const sheet = document.getElementById('assistantSheet');
    if (sheet) {
      sheet.style.opacity = '0';
      sheet.style.pointerEvents = 'none';
      // [2026-04-26 A10] 90ms → 50ms 단축
      setTimeout(() => { sheet.style.display = 'none'; }, 50);
    }
    document.body.style.overflow = '';
    document.body.classList.remove('assistant-open');
    // [2026-04-26 A5] hash 정리
    try { if (typeof window._markSheetClosed === 'function') window._markSheetClosed('assistant'); } catch (_e) { void _e; }
  };

  // [2026-05-28] 메인홈 잇비 카드 진입 — 옵션으로 사진/음성/즉시전송 지원
  window.AssistantSheet = {
    open: function (opts) {
      window.openAssistant();
      const o = opts || {};
      setTimeout(() => {
        try {
          if (o.attachPhoto instanceof File) _addPendingPhotos([o.attachPhoto]);
          if (typeof o.sendImmediate === 'string' && o.sendImmediate.trim()) {
            const input = document.getElementById('asstInput');
            if (input) input.value = o.sendImmediate.trim();
            _send();
          }
          if (o.startVoice) {
            document.getElementById('asstMicBtn')?.click();
          }
        } catch (_e) { /* ignore */ }
      }, 120);
    },
    close: function () { return window.closeAssistant && window.closeAssistant(); }
  };

  // 2026-04-24 perf — 앱 idle 시 시트 DOM 미리 생성. 첫 탭 latency 0.3s+ → ~0.05s
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => { try { _ensureSheet(); } catch (_e) { /* ignore */ } }, { timeout: 3000 });
  } else {
    setTimeout(() => { try { _ensureSheet(); } catch (_e) { /* ignore */ } }, 1500);
  }

  // [2026-04-26 백그라운드 픽스] 앱 시작 시 chat_pending 검사 → 미확인 답변 가능성 알림
  // 사용자가 앱 완전히 닫았다가 다시 켰는데 pending 이 남아있다면, 답변이 이미 도착했을 수도 있음.
  // FAB 에 빨간 점 띄워서 챗봇 한번 열어보라고 유도. (실제 답변은 _loadServerHistory 가 가져옴)
  setTimeout(() => {
    try {
      const pending = _readChatPending();
      if (!pending) return;
      const ageMs = Date.now() - (pending.started_at || 0);
      if (ageMs < PENDING_TIMEOUT_MS) {
        _setUnreadAnswer(true);
      } else {
        // stale → 정리
        _clearChatPending();
      }
    } catch (_e) { void _e; }
  }, 800);
})();
