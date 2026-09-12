/* 잇비 "저장한 카드 보여줘" 인텐트 — 클라이언트 가로채기 (2026-06-12)

   문제(QA #6): "저장된 카드 보여줘" 가 백엔드로 가서 작업실만 열고,
     저장한 카드 목록/최근 저장 카드를 안 보여줌.
   해결: 채팅 전송 전에 가로채서
     1) 작업실 탭 진입(저장 카드 그리드 = 목록 노출)
     2) IndexedDB(loadSlotsFromDB)에서 저장 카드 조회 → 개수/최근 항목 채팅 안내
     3) 최근 저장 포인터(localStorage: itdasy_last_asst_save)도 함께 안내
   persistence 는 기존 IndexedDB(작업실 슬롯)·갤러리 그대로 → 새로고침 후에도 조회됨.

   외부: window.ItbiSavedCardsIntent = { classify, handle } */
(function () {
  'use strict';
  if (window.ItbiSavedCardsIntent) return;

  // "보여/불러/열/다시/목록/어디" 류 조회 동사·표현(원장님은 동사를 자주 생략·축약).
  var SHOW_RE = /(보여|보고\s*싶|볼래|불러|열어|열어줘|열어봐|다시\s*보|확인|꺼내|찾아|목록|어디\s*(갔|있|야|임)|어딨|뭐\s*있)/;
  // "저장/아까/방금/최근/어제/저번/지난번/마지막" 류 과거-산출물 단서.
  var SAVED_CUE = /(저장한|저장된|저장\s*한|저장했던|저장|아까|방금|어제|저번|지난번|지난|이전|예전|최근|마지막)/;
  // [병합QA 2026-06-12] 맨 "거"("아까 저장한 거 보여줘") 추가 — SAVED_CUE+SHOW_RE 게이트 안이라 오매칭 위험 낮음.
  var TARGET_RE = /(카드|템플릿|작업물|작업\s*물|가격표|만든\s*거|만든거|결과물|결과|디자인|이미지|사진\s*결과|거(?=\s|보|줘|를|$))/;
  // 구체적 '저장 카드' 명사(대명사/시간단서만으로 동사 없이 매칭할 때 오매칭 줄이는 게이트).
  var CARD_NOUN_RE = /(카드|가격표|템플릿|작업물|후기|전후|디자인)/;
  // [QA라운드 2026-06-12] "수정/편집/글자 바꿔" 류 = 저장 카드를 열어 고치겠다는 의도 → 작업실 로드.
  var EDIT_RE = /(수정|편집|고쳐|고치|바꿔|바꾸|글자\s*(바꾸|넣|고)|열어서\s*(수정|편집|고))/;
  // [QA라운드 2026-06-12] "작업실/편집화면 열기" = 단순 작업실 진입(1.A). 생성 가드보다 먼저 매칭.
  var WORKSHOP_RE = /(작업실|편집\s*화면|만드는\s*화면|꾸미는\s*화면|편집하러|수정하러|만들러|카드\s*만드는)/;
  var OPEN_VERB = /(열어|보여|가자|가줘|가서|가\b|가게|이동|들어가|들어갈|들어갈래|띄워|시작|ㄱㄱ|고고|로\s*가)/;
  // 순수 생성 동사(저장단서·다시·조회/편집 동사 없이 단독이면 '생성' 경로에 양보).
  var CREATE_RE = /(만들|생성|작성|새로\s*만|추가해|뽑아|디자인해)/;
  // 명시적으로 "저장한/저장된 + 카드/템플릿/작업물" = 100% 조회 의도.
  var EXPLICIT_RE = /(저장한\s*카드|저장된\s*카드|저장한\s*템플릿|저장된\s*템플릿|저장한\s*작업물|저장된\s*작업물|저장한\s*가격표|저장된\s*가격표|최근\s*작업물|만든\s*카드\s*(보여|수정|편집|열))/;
  // "고객 카드/예약 카드/매출 보여" 처럼 도메인어가 대상/동사에 '붙어' 있을 때만 타도메인으로 차단.
  //   ("고객한테 보낼 거 수정"의 고객은 수신자일 뿐 → 차단하면 안 됨.) 저장단서 있으면 차단 해제.
  var DOMAIN_BLOCK_RE = /(고객|손님|예약|매출|회원|명단|연락처|전화번호|통계|차트|일정)\s*(카드|보여|목록|정보|명단|리스트|알려|내역)/;
  // 대명사 참조("그거/이거/그 카드/방금 거") — 직전 산출물을 가리킴(2순위 문맥). 동사 없어도 조회로 본다.
  var PRONOUN_REF_RE = /(그거|이거|저거|그\s*거|이\s*거|그\s*(카드|가격표|템플릿|작업물|디자인)|방금\s*거|아까\s*거|최근\s*거|마지막\s*거|그\s*걸|그것|아까\s*그|방금\s*그)/;
  // 대명사가 사진/발송 액션을 가리키면("이거 인스타 올려/누끼/보정") 저장카드 조회 아님 → 그쪽 경로에 양보.
  var PHOTO_ACTION_RE = /(인스타|인스타그램|올려|업로드|게시|누끼|보정|캡션|전송|발송|문자|dm|디엠|공유|보내)/i;

  // 분류: { matched:true, mode:'open'|'query'|'edit' } 또는 null.
  //   생성("만들어줘")은 조회/편집/저장단서/다시 단서가 없으면 양보(null) → _send 앞단 생성경로가 잡음.
  function classify(q) {
    var t = String(q || '').trim();
    if (!t) return null;
    var hasShow = SHOW_RE.test(t), hasEdit = EDIT_RE.test(t);
    var again = /다시/.test(t);
    // 1) 작업실/편집화면 열기 — 생성 가드보다 먼저(예: "카드 만드는 화면 열어줘"는 '만들' 포함이지만 진입 의도).
    //    "작업실"이 들어가면 동사가 약하거나(로 가/ㄱㄱ) 없어도 진입 의도로 본다(단, 생성/조회 단서 없을 때).
    if (WORKSHOP_RE.test(t) && (OPEN_VERB.test(t) || /화면/.test(t))) return { matched: true, mode: 'open' };
    /* [잇비 전수QA 2026-09-11 · P2] '작업실' 이라는 단어만 있으면 무조건 작업실을 열었다.
       실측: "작업실에 작업 중인 거 있어?" → 잇비가 닫히고 작업실 탭으로 이동(답변 0).
       백엔드엔 `workspace_status` 즉답("🎨 작업실에 작업 중인 게 N건 있어요" + 작업실 열기 버튼)이
       이미 있다 — 답을 주고 버튼도 주는 쪽이 원장님한테 낫다. 상태를 묻는 말이면 양보한다. */
    var asksStatus = /(있어|있나|없어|몇\s*(개|건)|얼마나|현황|상태|어때|뭐\s*있|남았)/.test(t);
    if (/작업실/.test(t) && !CREATE_RE.test(t) && !hasEdit && !asksStatus) return { matched: true, mode: 'open' };
    // 2) 순수 생성 제외 — 저장단서/다시/조회·편집 동사·대명사참조가 하나도 없을 때만 양보.
    if (CREATE_RE.test(t) && !SAVED_CUE.test(t) && !again && !hasShow && !hasEdit && !PRONOUN_REF_RE.test(t)) return null;
    // [2026-06-14 QA] "응 그거 취소해" 처럼 예약/취소/매출 액션이 섞이면 저장카드 조회가 아님 →
    //   양보(예약 취소 확인 흐름·백엔드 문맥으로 넘김). 단 "저장한 카드" 명시는 예외.
    if (/(예약|취소|노쇼|예약금|매출|확정|완료해|완료\s*처리)/.test(t) && !EXPLICIT_RE.test(t)) return null;
    // [핫픽스D #2] 예약 시간 변경("그거 4시로 변경/바꿔/옮겨") = 예약 도메인 → 양보.
    //   "그거"(대명사)가 아래 pronoun 경로에 잡혀 작업실 빈-카드 안내로 새던 버그 차단.
    if (/(\d{1,2}\s*시|\d{1,2}:\d{2})/.test(t) && /(변경|바꿔|바꾸|옮겨|미뤄|당겨|로\s*해|로\s*잡|리스케)/.test(t)) return null;
    var blockedDomain = DOMAIN_BLOCK_RE.test(t) && !SAVED_CUE.test(t);
    // 3) 명시 저장카드 → 무조건 조회/편집.
    var explicit = EXPLICIT_RE.test(t);
    // 4) 매칭 경로(도메인어가 대상/동사에 붙고 저장단서 없으면 양보):
    //    a. 대상 + (조회|편집) 동사
    //    b. [동사생략] (저장단서|다시) + 대상  ("아까 그 가격표", "저장된 거 다시", "가격표 다시 좀")
    //    c. [대명사] 그거/방금 거/그 카드  → 직전 산출물 참조
    var bare = TARGET_RE.test(t) && (hasShow || hasEdit);
    var verbless = (SAVED_CUE.test(t) || again) && (TARGET_RE.test(t) || CARD_NOUN_RE.test(t)) && !CREATE_RE.test(t);
    var pronoun = PRONOUN_REF_RE.test(t) && !CREATE_RE.test(t) && !PHOTO_ACTION_RE.test(t);
    var matched = !blockedDomain && (explicit || bare || verbless || pronoun);
    if (!matched) return null;
    return { matched: true, mode: hasEdit ? 'edit' : 'query' };
  }

  // 작업실(app-gallery-*)은 'photo' 그룹 lazy-load. 채팅에서 바로 조회하면 미로드일 수 있어
  //   loadSlotsFromDB/initWorkshopTab 이 없을 때 "카드 없음"을 오답하지 않도록 먼저 그룹을 보장한다.
  async function _ensurePhoto() {
    try {
      if (window.AppLoader && !window.AppLoader.loaded('photo')) await window.AppLoader.ensure('photo');
    } catch (_e) { void _e; }
  }

  function _openWorkshop() {
    // 채팅 패널(z-index 위)이 작업실을 가리므로 닫아 실제 작업실이 보이게 한다(router show_last_saved 와 동일 패턴).
    try { if (typeof window.closeAssistant === 'function') window.closeAssistant(); } catch (_e0) { void _e0; }
    try {
      if (typeof window.showTab === 'function') {
        window.showTab('workshop', document.querySelector('.tab-bar__btn[data-tab="workshop"]'));
        try { if (typeof window.initWorkshopTab === 'function') window.initWorkshopTab(); } catch (_ei) { void _ei; }
        return true;
      }
    } catch (_e) { void _e; }
    try { if (typeof window.initWorkshopTab === 'function') { window.initWorkshopTab(); return true; } } catch (_e2) { void _e2; }
    return false;
  }

  async function _savedSlots() {
    try {
      await _ensurePhoto();
      if (typeof window.loadSlotsFromDB !== 'function') return [];
      var all = (await window.loadSlotsFromDB()) || [];
      return all;
    } catch (_e) { return []; }
  }

  // 가장 최근 저장 슬롯을 작업실에서 스크롤+하이라이트(있을 때만, 실패 무해).
  function _highlightRecent(slot) {
    try {
      if (slot && slot.id && typeof window.highlightWorkshopSlot === 'function') window.highlightWorkshopSlot(slot.id);
    } catch (_e) { void _e; }
  }

  function _lastSavePointer() {
    try {
      if (window._lastAssistantSave) return window._lastAssistantSave;
      var raw = localStorage.getItem('itdasy_last_asst_save');
      return raw ? JSON.parse(raw) : null;
    } catch (_e) { return null; }
  }

  // 반환: { reply, navigated } — app-assistant 가 채팅 말풍선으로 렌더 + 작업실 진입.
  async function handle(q) {
    var c = classify(q);
    if (!c) return null;
    var mode = c.mode || 'query';
    var slots = await _savedSlots();   // _ensurePhoto 후 조회(미로드 오답 방지)
    var nav = _openWorkshop();
    var last = _lastSavePointer();

    if (!slots.length) {
      // DB 비었지만 최근 저장 포인터가 있으면 안내(드문 경우 — 보통은 새로고침 권유).
      if (last && last.label) {
        return { reply: '작업실을 열었어요. 최근에 "' + last.label + '"를 저장했는데 목록에서 안 보이면 새로고침해 주세요.', navigated: nav };
      }
      if (mode === 'open') {
        return { reply: '작업실을 열었어요. 아직 저장한 카드는 없어요 — 가격표·후기·전후 카드를 만들면 여기에 모여요. 바로 만들어드릴까요?', navigated: nav };
      }
      return { reply: '아직 저장한 카드가 없어요. 가격표·후기·전후 카드를 만들고 "저장"하면 여기 작업실에 모여요. 지금 새로 만들어드릴까요?', navigated: nav };
    }

    var recent = slots[0];   // loadSlotsFromDB 는 최신순 정렬
    var recentLabel = (recent && recent.label) || (last && last.label) || '저장한 카드';
    var n = slots.length;
    _highlightRecent(recent);

    if (mode === 'edit') {
      if (n === 1) {
        return { reply: '저장한 "' + recentLabel + '" 카드를 작업실에 띄웠어요. 카드를 누르면 바로 문구를 고칠 수 있어요.', navigated: nav };
      }
      return { reply: '어떤 카드를 수정할까요? 저장한 카드 ' + n + '개를 작업실에 띄웠어요. 가장 최근 건 "' + recentLabel + '" 예요. 수정할 카드를 눌러주세요.', navigated: nav };
    }
    if (mode === 'open') {
      return { reply: '작업실을 열었어요. 저장한 카드 ' + n + '개가 있어요 — 가장 최근 건 "' + recentLabel + '" 예요. 카드를 누르면 편집할 수 있어요.', navigated: nav };
    }
    return { reply: '작업실에 저장한 카드 ' + n + '개를 띄웠어요. 가장 최근 건 "' + recentLabel + '" 예요. 카드를 누르면 다시 편집할 수 있어요.', navigated: nav };
  }

  window.ItbiSavedCardsIntent = { classify: classify, handle: handle };
})();
