/* ───────────────────────────────────────────────────────────
   app-comment-reply-queue.js — 인스타 댓글 문의 응대 큐 (스캐폴딩)
   2026-07-10 신규 · 브랜치 feat/ig-comment-reply

   목적: "모든 댓글" 아니라 가격·예약·위치 문의 댓글만 골라 대댓글 + DM 퍼널.
   디자인: app-dm-confirm-queue.js 와 동일 언어(카드 r18·버블 #F2F4F6 꼬리·CTA #191F28·로즈 #BC6675).
   [2026-09-01] 예시(SEED) 데이터 제거 — 실댓글 0건·권한없음·통신실패를 상태로 구분한다.
   진입: window.openCommentReplyQueue()  · 플래그 window.ITDASY_IG_COMMENT_REPLY

   [2026-07-20 v785] 카드 리디자인 — ① 게시물 행·IG배지 삭제 → 헤더 우측 "게시물 보기" 칩
   + 미리보기 팝업 ② 공개답글/DM 말풍선별 초록 토글(안 보낼 채널 끄기, CTA 라벨 가변)
   ③ DM 접기(첫 문장만, 탭하면 펼침) ④ 무시 = 회색 텍스트 강등 ⑤ 잇비 아바타 들여쓰기 제거.
   ⚠️ BE 요구 2건(선택적): POST /instagram/comment-reply 에 send_public/send_dm 플래그,
   GET /instagram/comment-queue 응답에 media_caption_full·media_timestamp (팝업 상세용).
   플래그 없이도 동작(텍스트 '' 로 보냄) — BE가 빈 텍스트 채널 스킵하면 완성.

   [2026-07-20 v787] 상단·카드 재정리 (원영 승인 목업 v5+정렬)
   ① 배너·통계박스·필터탭 삭제 → 한 줄 "● 대기 N건 · 이번 주 N건 응대" + 최신순/오래된순 토글
     (불만 댓글은 정렬 무관 항상 최상단)
   ② 닉네임 옆 문의/확실 배지 삭제(불만·단골만 유지), 메타는 시간만
   ③ 게시물 칩 → 카드 안 인용 스트립(썸네일 52px + 날짜만 — 캡션은 잘림 금지라 팝업 전문으로, v788)
   ④ DM 접기 폐지 — 전문 항상 펼침(말줄임 금지), 공개답글/DM 라벨줄 구조 통일 → 토글 세로선 정렬
   ⑤ 글자 3단계(15 본문 / 13 보조 / 배지 10)
   ⑥ 프사: BE profile_pic(댓글 닉네임↔DM 기록 매칭, BE 작업 대기) 있으면 사진, 없으면 이니셜

   [2026-07-21 v789] 설정 화면 개편 (원영 승인 목업 v2)
   ① 죽은 "검토 후 발송/바로 발송" 스위치 삭제 (저장만 되고 아무 데서도 안 읽던 값)
   ② 자동 응대 마스터 토글을 설정 안에도 배치 — 목록(ai-hub)과 같은 저장 키(단일 진실원)
      끄면: 홈 댓글 문의 줄 숨김(app-home-v41 연동) + 기능 전체 쉼
   ③ 저장 버튼 삭제 — 바꾸는 즉시 저장 (링크는 change 시)
   ④ 베이지 래퍼 → 큐와 같은 흰 카드 + .5px 보더, 글자 15/13, 쉬운 문구
   ─────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var ID = 'commentReplyQueueScreen';
  var _view = 'queue';           // 'queue' | 'settings'
  var _sort = 'new';             // 'new' 최신순 | 'old' 오래된순 (불만은 항상 최상단)

  function _esc(s) { return (window._esc ? window._esc(String(s == null ? '' : s)) : String(s == null ? '' : s)); }
  function _toast(m) { if (window.showToast) window.showToast(m); }
  function _haptic() { try { window.hapticLight && window.hapticLight(); } catch (_e) { void _e; } }

  /* [2026-09-01 CMT-P1-003] 예시(SEED) 댓글을 통째로 없앴다.
     예전엔 실댓글이 0건이거나 권한이 없으면 가짜 손님 3명(민지·유나·수)이 **진짜처럼** 떴다.
     그게 뜨는 조건이 하필 1인샵의 평상시였다 — 연동돼 있고, 기능도 켰고, 지난 14일 문의가 없을 때.
     원장님은 "내 계정엔 이런 댓글 없는데?" 하고 앱 전체 데이터를 못 믿게 된다.
     07-22·08-15 에 두 번 부분 수정했는데도 경로가 남아 있었다 → 데이터 자체를 지운다.

     빈 화면은 빈 화면대로, 오류는 오류대로 보여준다. 그게 정직하고, 다음 행동도 명확하다. */
  var ITEMS = [];

  /* 화면 상태 — '빈 목록' 과 '못 불러옴' 을 절대 섞지 않는다.
     예전엔 둘 다 items:[] 로 뭉뚱그려져서, 권한이 없어 못 읽은 건데도 화면은 예시를 보여줬다.
     LOADING       불러오는 중
     DATA          실댓글 있음
     EMPTY         연동·권한 정상인데 답할 문의가 없음
     DISABLED      원장이 기능을 꺼둠
     PERMISSION    인스타 댓글 권한 없음 → 재연결하면 풀린다
     NOT_CONNECTED 인스타 미연동
     NETWORK       통신 실패 → 다시 시도 */
  var _state = 'LOADING';

  // [무시 영속화] 무시한 댓글 id 를 localStorage 에 남긴다. 예전엔 _removeItem 이 ITEMS.splice 만 해서
  //   큐를 다시 열거나 자동갱신(_loadReal)하면 백엔드가 그 댓글을 다시 실어와 되살아났다(백엔드는
  //   '답장한 댓글'만 제외하지 '무시한 댓글' 개념이 없음). 이제 id 를 저장해 표시 단계에서 영구 제외.
  var _HIDDEN_KEY = 'itdasy:crq_hidden';
  var _HIDDEN_TTL = 30 * 24 * 60 * 60 * 1000;   // 30일

  /* 로컬 숨김은 **이 기기의 즉답용 보조**다. 정본은 서버 CommentReplyLog 다.
     [2026-09-01] 예전엔 id 배열에 계속 push 만 해서 무한히 커졌다(정리 로직 0).
     이제 {id: 숨긴시각} 으로 저장하고 30일 지난 건 읽을 때 버린다.
     30일이면 서버 큐(기본 14일)를 이미 지난 뒤라 되살아날 걱정이 없다.
     옛 형식(배열)도 그대로 읽어 준다 — 기존 사용자의 숨김이 갑자기 풀리면 안 된다. */
  var _hidden = (function () {
    var now = Date.now(), m = {};
    try {
      var raw = JSON.parse(localStorage.getItem(_HIDDEN_KEY) || '[]');
      if (Array.isArray(raw)) raw.forEach(function (id) { m[id] = now; });        // 옛 형식 이관
      else if (raw && typeof raw === 'object') {
        Object.keys(raw).forEach(function (id) {
          var t = +raw[id] || 0;
          if (now - t < _HIDDEN_TTL) m[id] = t;                                   // 오래된 건 버린다
        });
      }
    } catch (_e) { return {}; }
    return m;
  })();
  function _hiddenPayload() { return _hidden; }
  function _markHidden(id) {
    if (!id) return; _hidden[id] = Date.now();
    try { localStorage.setItem(_HIDDEN_KEY, JSON.stringify(_hidden)); } catch (_e) { void _e; }
  }
  function _isHidden(it) { return !!_hidden[(it && it.id)]; }

  // [자동갱신] 큐가 열려 있는 동안 주기적으로 실댓글을 다시 불러온다(폴링). 예전엔 열 때 1회뿐이라
  //   열어둔 채로는 새 댓글이 영영 안 떴다. 댓글은 DM 만큼 빠를 필요 없어 30초. (silent = 스켈레톤 안 띄움)
  var _pollTimer = null;
  var _realMode = false;      // true = 실제 인스타 댓글 로드됨
  var _loading = false;
  var _weekReplied = 0;       // 이번 주 응대 건수(영업왕 체감)

  // ── 자동응답 설정 (DM처럼 세팅) — localStorage 저장 ──
  var _EMOJI_OPTS = ['😊', '🤍', '✨', '💕', '🎀', '💝', ''];
  function _loadSettings() {
    // [v789] mode(검토/바로 발송) 제거 — 저장만 되고 아무 데서도 안 읽던 죽은 값
    // [2026-07-21] 신규 인텐트(시술종류·소요시간·이벤트·회원권) + 응답 시간대(active_hours·quiet_outside)
    // [2026-07-22 보스] DM 자동응답 설정창처럼 세부 설정 추가 — 단, 프론트가 진짜로 지키는 것만 넣는다.
    //   exclude_words: 이 말이 들어간 댓글은 큐에 안 올린다(협찬·광고 DM 유도 댓글 걸러내기)
    //   [2026-07-22] default_dm 제거 — 댓글 응대는 공개 답글 전용이 됐다(DM 은 DM 엔진 단일 담당).
    // [2026-08-26] 🔴 기본값 true → **false**. 서버도 같이 바꿨다
    //   (routers/instagram._crq_enabled → services/automation_gate).
    //   예전엔 저장한 적 없는 원장이 켜진 것으로 읽혔고, 신규 가입 직후에도 그랬다.
    var def = { enabled: false,
      intents: { price: true, booking: true, location: true, hours: false, service: true, duration: true, event: true, membership: true },
      link: '', emoji: '😊',
      active_hours: { start: '09:00', end: '21:00' }, quiet_outside: true,
      exclude_words: '' };
    try {
      var s = JSON.parse(localStorage.getItem('itdasy:crq_settings') || 'null');
      if (!s) return def;
      var ah = (s.active_hours && typeof s.active_hours === 'object') ? s.active_hours : {};
      return { enabled: s.enabled === true, link: s.link || '', emoji: (s.emoji != null ? s.emoji : '😊'),
        intents: Object.assign({}, def.intents, s.intents || {}),
        active_hours: { start: ah.start || '09:00', end: ah.end || '21:00' },
        quiet_outside: s.quiet_outside !== false,
        exclude_words: String(s.exclude_words || '') };
    } catch (_e) { return def; }
  }
  /* [2026-09-01 CMT-P2-008] 제외단어·인텐트 필터를 프론트에서 뺐다.
     판정이 두 벌이면(홈=인텐트만, 큐=인텐트+제외단어) 같은 사용자에게 다른 숫자를 보여준다.
     이제 서버 `_crq_item_eligible` 하나가 목록과 배지를 같이 판정한다. 설정 입력칸은 그대로다. */
  // [2026-07-21] 응답 시간대 판정 — 지금이 운영시간 밖인가(자정 넘김 지원). 방해금지 로직 공용.
  function _minutesOf(hhmm) { try { var p = String(hhmm).split(':'); return (+p[0]) * 60 + (+p[1]); } catch (_e) { return 0; } }
  function _withinActiveHours() {
    var a = _settings.active_hours || {};
    var now = new Date(), cur = now.getHours() * 60 + now.getMinutes();
    var s = _minutesOf(a.start || '09:00'), e = _minutesOf(a.end || '21:00');
    return s <= e ? (cur >= s && cur <= e) : (cur >= s || cur <= e);
  }
  // 방해금지 활성 + 지금 운영시간 밖 → true (홈 넛지 뮤트·큐 배너). 발송 자체는 언제든 가능.
  function _isQuietNow() { return !!(_settings.enabled && _settings.quiet_outside && !_withinActiveHours()); }
  function _saveSettings() { try { localStorage.setItem('itdasy:crq_settings', JSON.stringify(_settings)); } catch (_e) { void _e; } }

  /* [2026-07-22 보스] 설정을 서버에도 저장한다 — 예전엔 localStorage 뿐이라 폰을 바꾸거나
     캐시를 지우면 통째로 날아갔다(원장은 저장된 줄 알고 있었다).
     로컬 저장은 그대로 유지(즉시 반영·오프라인). 서버는 '기기 간 보관용 정본'.
     PUT /instagram/comment-reply-settings — 실패해도 로컬엔 남으므로 조용히 넘어간다. */
  var _srvSaving = false;
  var _srvPending = null;
  function _pushSettingsToServer() {
    if (!window.apiFetch || !window.authHeader || !window.apiUrl) return Promise.resolve(false);
    // [2026-08-26] 저장 중이면 **false 를 돌려주지 않는다.** 예전엔 그랬는데, 마스터 토글이
    //   그 false 를 '서버 저장 실패' 로 읽고 화면을 되돌리게 됐다(= 켰는데 도로 꺼짐).
    //   '바쁨' 과 '실패' 는 다르다 — 진행 중인 저장의 결과를 그대로 준다.
    if (_srvSaving && _srvPending) return _srvPending;
    _srvSaving = true;
    var h = window.authHeader() || {};
    if (!h.Authorization) { _srvSaving = false; return Promise.resolve(false); }
    h['Content-Type'] = 'application/json';
    _srvPending = window.apiFetch(window.apiUrl('/instagram/comment-reply-settings'), {
      method: 'PUT', headers: h, body: JSON.stringify({ settings: _settings }),
    }).then(function (r) { return !!(r && r.ok); })
      .catch(function () { return false; })
      .then(function (ok) { _srvSaving = false; _srvPending = null; return ok; });
    return _srvPending;
  }
  /* 서버에 저장된 설정을 가져와 로컬에 덮어쓴다. 새 기기·캐시 삭제 후 첫 진입용.
     서버가 빈 값({})이면 아무것도 안 한다 — 한 번도 저장 안 한 원장의 로컬 설정을 지우면 안 된다. */
  function _pullSettingsFromServer() {
    if (!window.apiFetch || !window.authHeader || !window.apiUrl) return Promise.resolve(false);
    var h = window.authHeader() || {};
    if (!h.Authorization) return Promise.resolve(false);
    return window.apiFetch(window.apiUrl('/instagram/comment-reply-settings'), { headers: h })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (j) {
        var s = j && j.settings;
        if (!s || typeof s !== 'object' || !Object.keys(s).length) return false;
        try { localStorage.setItem('itdasy:crq_settings', JSON.stringify(s)); } catch (_e) { void _e; }
        _settings = _loadSettings();
        return true;
      })
      .catch(function () { return false; });
  }
  /* [2026-07-22 보스] 재렌더/뒤로가기/저장 전에 '입력 중인 값'을 전부 _settings 로 걷어온다.
     예전엔 링크·시간을 각각 따로 챙기다가 새 입력(제외 단어)을 추가할 때마다 한 곳을 빠뜨려
     조용히 날아갔다. 걷어오는 지점을 하나로 모은다. */
  function _captureSettingInputs(el) {
    if (!el) return;
    var ex = el.querySelector('.crq-exclude'); if (ex) _settings.exclude_words = (ex.value || '').trim();
    _captureTimes(el);
  }
  // 재렌더/뒤로가기 전에 시간 입력값을 _settings 로 보존 (input 은 재렌더 시 날아감)
  function _captureTimes(el) {
    if (!el) return;
    var st = el.querySelector('.crq-time[data-field="start"]'), en = el.querySelector('.crq-time[data-field="end"]');
    _settings.active_hours = _settings.active_hours || {};
    if (st && st.value) _settings.active_hours.start = st.value;
    if (en && en.value) _settings.active_hours.end = en.value;
  }
  var _settings = _loadSettings();

  // 설정 반영된 최종 문구 — 공개답글에 이모지, DM에 예약 링크(없을 때만) 부착
  /* [2026-09-01] 불만·건강여부엔 설정 이모지를 붙이지 않는다.
     실기기 QA 에서 잡았다 — 기본 이모지가 😊 라서 공개 답글이
     "불편 드려 정말 죄송해요, 바로 확인해서 도와드릴게요 😊" 로 나갔다.
     사과에 웃는 얼굴을 붙이면 손님은 비꼰다고 읽는다. 그게 원장 계정으로 피드에 박힌다.
     건강여부도 같다 — 안전 문제에 붙이는 이모지는 가볍게 보인다.
     (초안 본문 자체에 이모지가 있으면 그건 LLM 이 맥락 보고 넣은 거라 건드리지 않는다.) */
  var _NO_EMOJI_INTENTS = { complaint: 1, eligibility: 1 };
  function _finalPublic(it) {
    var p = it.publicDraft || '';
    var e = _settings.emoji;
    if (_NO_EMOJI_INTENTS[it && it.intent]) return p;
    if (e && p.indexOf(e) < 0) p = p.replace(/\s*$/, '') + ' ' + e;
    return p;
  }

  // 샵 설정값(작업실 설정과 공유하는 itdasy:shop_* 키) — DM 상세에 사용
  function _shop(k, fb) { try { return localStorage.getItem('itdasy:shop_' + k) || fb || ''; } catch (_e) { return fb || ''; } }

  /* 의도별 기본 답장 문구 — 서버 AI 초안이 없을 때(상위 8건 밖·생성 실패) 쓰는 폴백.
     [2026-07-23] 공개 초안에서 DM 언급을 전부 뺐다. 이 화면은 DM 을 안 보내는데(발송 주체는
     DM 엔진 하나 — 2026-07-22 정책) 초안은 "DM으로 보내드렸어요" 라고 적혀 있었다. 그러면
     백엔드 nodm_public 방어가 발송 직전에 문구를 갈아끼워서, 원장이 화면에서 보고 승인한
     문장과 실제로 피드에 달리는 문장이 달랐다. 화면 = 실제여야 한다.
     [2026-09-01] dmDraft 반환을 없앴다 — 읽는 곳이 한 군데도 없는 죽은 값이었다. */
  function _drafts(intent) {
    if (intent === 'price') return '문의 감사해요! 원하시는 시술 알려주시면 가격 안내드릴게요';
    if (intent === 'booking') return '예약 문의 감사해요! 원하시는 날짜·시술 남겨주시면 확인하고 도와드릴게요';
    if (intent === 'location') return '찾아와 주셔서 감사해요! 위치·오시는 길 안내드릴게요';
    if (intent === 'hours') return '문의 감사해요! 영업시간 안내드릴게요';
    if (intent === 'duration') return '문의 감사해요! 시술 소요시간·지속력 안내드릴게요';
    if (intent === 'event') return '관심 감사해요! 진행 중인 이벤트 안내드릴게요';
    if (intent === 'membership') return '문의 감사해요! 회원권·정기권 안내드릴게요';
    if (intent === 'complaint') return '불편 드려 정말 죄송해요, 바로 확인해서 도와드릴게요';
    // 건강여부(eligibility): 절대 '가능하다' 단정 금지 — 상태 확인 후 상담 유도 (사람이 검토·발송)
    if (intent === 'eligibility') return '문의 감사해요! 상태에 따라 달라서 확인이 필요해요, 편하게 알려주시면 상담 도와드릴게요';
    return '문의 감사해요! 어떤 점이 궁금하신지 알려주시면 안내드릴게요';
  }

  // 실 API 아이템 → 렌더 형식. 서버 페르소나 초안(public_draft/dm_draft) 우선, 없으면 템플릿 폴백.
  function _mapReal(it) {
    return { id: it.comment_id, commentId: it.comment_id, mediaId: it.media_id || '', name: it.username ? ('@' + it.username) : '손님',
      av: (it.username || '?').slice(0, 1), pic: it.profile_pic || '', intent: it.intent,   // pic = BE 프사 매칭(대기)
      media: it.media_caption || '게시물',
      mediaFull: it.media_caption_full || it.media_caption || '',   // 팝업용 캡션 전문 (BE 필드 추가 대기 — 없으면 요약)
      mediaDate: it.media_timestamp || '',                          // 팝업용 발행일 (BE 필드 추가 대기)
      permalink: it.permalink || '', likes: it.like_count || 0, ts: it.timestamp || '',
      waiting: 0, thumb: it.media_thumb || '', text: it.text || '', manual: !!it.manual, returning: !!it.returning, confidence: it.confidence || '',
      /* [2026-09-02] 서버가 IGSID 로 매칭한 기존 고객. **없으면 없는 대로 둔다** —
         프론트에서 이름·username 으로 추측해 붙이지 않는다(오연결 > 미연결). */
      authorIgsid: it.author_igsid || '',
      customerId: it.customer_id || null, isCustomer: !!it.is_customer,
      visitCount: Number(it.visit_count || 0), isRegular: !!it.is_regular,
      publicDraft: it.public_draft || _drafts(it.intent),
      // 서버가 초안 출처를 알려준다(ai/template/none). 없으면 우리가 템플릿을 쓴 것.
      draftSource: (it.public_draft && it.draft_source) || 'none', _real: true };
  }

  // ── 인라인 아이콘 (스프라이트 밖은 svg, 봇은 #ic-bot) ──
  function _svg(inner, o) { o = o || {}; return '<svg width="' + (o.w || 14) + '" height="' + (o.h || o.w || 14) + '" viewBox="0 0 24 24" fill="' + (o.fill || 'none') + '" stroke="' + (o.stroke || 'currentColor') + '" stroke-width="' + (o.sw || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>'; }
  var IC = {
    gear: _svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>', { w: 19 }),
    ig: _svg('<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>', { w: 12 }),
    camera: _svg('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>', { w: 16 }),
    heart: _svg('<path d="M12 21s-7.5-4.6-10-9.3C.6 8.9 2 5.5 5.2 5.5c2 0 3.2 1.3 3.8 2.3.6-1 1.8-2.3 3.8-2.3 3.2 0 4.6 3.4 3.2 6.2C19.5 16.4 12 21 12 21z"/>', { w: 13, fill: 'currentColor', stroke: 'none' }),
    comment: _svg('<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4L3 21l1.1-4.1A8.4 8.4 0 1 1 21 11.5z"/>', { w: 12 }),
    mail: _svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>', { w: 12 }),
    send: _svg('<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>', { w: 15 }),
    sort: _svg('<path d="M11 5h10"/><path d="M11 9h7"/><path d="M11 13h4"/><path d="M3 17l3 3 3-3"/><path d="M6 18V4"/>', { w: 13 })
  };
  // [v787] 댓글 경과시간 — 실데이터는 timestamp, 시드는 waiting(분) 폴백
  function _ago(it) {
    var t = it.ts ? Date.parse(it.ts) : NaN;
    if (!isFinite(t)) { return it.waiting <= 0 ? '방금' : it.waiting + '분 전'; }
    var m = Math.floor((Date.now() - t) / 60000);
    if (m < 1) return '방금';
    if (m < 60) return m + '분 전';
    if (m < 1440) return Math.floor(m / 60) + '시간 전';
    return Math.floor(m / 1440) + '일 전';
  }
  // [v785] 채널별 발송 토글 — 앱 공통 규칙: 스위치 on=초록(#16B55E)
  function _tgHtml(on, kind, id) {
    return '<span class="crq-tg" data-kind="' + kind + '" data-id="' + _esc(id) + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" style="cursor:pointer;flex-shrink:0;margin-left:auto;display:inline-block;width:32px;height:19px;border-radius:10px;position:relative;transition:background .15s;background:' + (on ? '#16B55E' : '#D1D6DB') + ';">' +
      '<span style="position:absolute;top:2px;left:' + (on ? '15px' : '2px') + ';width:15px;height:15px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.15);transition:left .15s;"></span></span>';
  }
  // 말풍선 공통 스타일 (좌상단 꼬리) — [v787] 본문 15px 통일, DM은 배경만 다름
  var _BUBBLE = 'background:#F2F4F6;color:#191F28;border-radius:13px;border-top-left-radius:4px;padding:11px 13px;font-size:15px;line-height:1.55;white-space:pre-wrap;word-break:break-word;';
  var _DMBUBBLE = 'background:#F7F8FA;color:#191F28;border-radius:13px;border-top-left-radius:4px;padding:11px 13px;font-size:15px;line-height:1.55;white-space:pre-wrap;word-break:break-word;';
  function _editArea(icon, label, cls, id, val) {
    return '<div style="font-size:13px;color:#8B95A1;font-weight:600;margin-bottom:3px;display:flex;align-items:center;gap:4px;">' + icon + label + ' · 수정</div>' +
      '<textarea class="' + cls + '" data-id="' + _esc(id) + '" rows="3" style="width:100%;padding:9px 12px;border:1px solid #BC6675;border-radius:12px;font-size:15px;line-height:1.55;background:#fff;color:#191F28;box-sizing:border-box;font-family:inherit;resize:vertical;">' + _esc(val) + '</textarea>';
  }
  // 표시/발송용 최종 문구 — 편집(override)했으면 그 값, 아니면 설정 반영값
  function _displayPublic(it) { return (it._override && it._override.pub != null) ? it._override.pub : _finalPublic(it); }

  // [v787] 채널 라벨줄 공통 — 아이콘+라벨(13px) 좌, 토글 우측 끝(margin-left:auto → 세로선 정렬)
  function _chRow(icon, label, on, kind, id, badges) {
    return '<div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;">' +
      '<span style="font-size:13px;color:#8B95A1;font-weight:600;display:inline-flex;align-items:center;gap:4px;">' + icon + label + '</span>' +
      (badges || '') + _tgHtml(on, kind, id) + '</div>';
  }

  // [2026-08-15] inGroup=true 면 게시물 스트립을 안 그린다 —
  //   사진별로 묶은 뒤엔 섹션 헤더가 같은 정보를 이미 이고 있어서 카드마다 반복하면 중복이다.
  //   (묶음 밖에서 부를 땐 예전 그대로. ⚠️ items.map(_cardHtml) 로 부르면 index 가 2번째 인자로
  //    들어와 i>0 이 전부 inGroup 이 되니, 반드시 명시적으로 감싸서 호출할 것.)
  function _cardHtml(it, inGroup) {
    var pubOn = it._sendPub !== false;
    // [v787] 게시물 인용 스트립 — 카드 안, 탭=미리보기 팝업 (기존 crq-chip 핸들러 재사용)
    var dstr = it.mediaDate ? _peekDate(it.mediaDate) : '';
    var strip = inGroup ? '' : '<button class="crq-chip" data-id="' + _esc(it.id) + '" style="width:100%;display:flex;align-items:center;gap:10px;background:#F7F8FA;border:none;border-radius:13px;padding:8px;margin-bottom:11px;cursor:pointer;font-family:inherit;text-align:left;">' +
      (it.thumb
        ? '<span style="width:52px;height:52px;flex-shrink:0;border-radius:10px;background:#E5E8EB center/cover no-repeat;background-image:url(' + _esc(it.thumb) + ');"></span>'
        : '<span style="width:52px;height:52px;flex-shrink:0;border-radius:10px;background:#E5E8EB;display:inline-flex;align-items:center;justify-content:center;color:#B0B8C1;">' + IC.camera + '</span>') +
      '<span style="flex:1;min-width:0;font-size:13px;font-weight:600;color:#6B7684;">이 게시물에 달린 댓글' + (dstr ? '<span style="color:#B0B8C1;font-weight:500;"> · ' + dstr + '</span>' : '') + '</span>' +
      '<span style="color:#B0B8C1;font-size:13px;flex-shrink:0;">›</span></button>';
    // 공개 답글 — 라벨줄(토글 우측 끝) + 말풍선 or 꺼짐 안내
    /* [2026-09-01 CMT-P2-010] '잇비가 우리 샵을 보고 쓴 문장' 과 '아무한테나 나가는 기본 문구' 는
       다른 것이다. 예전엔 둘이 같은 자리에 같은 모양으로 나와서 구분할 방법이 없었다
       (초안은 상위 8건만 생성되고 나머지는 조용히 템플릿으로 폴백했다).
       AI 를 강조해 불안하게 만들 필요는 없으니, 기본 문구인 쪽에만 조용히 표시한다. */
    var isTemplate = it.draftSource !== 'ai' && !it._override && !it.manual;
    var pubBadges = (it.manual ? '<span style="font-size:10px;font-weight:700;color:#0F766E;background:#E7F6EF;border-radius:7px;padding:1px 6px;">내 멘트</span>' : '') +
      (it._override ? '<span style="font-size:10px;font-weight:700;color:#BC6675;background:#F7EFF0;border-radius:7px;padding:1px 6px;">수정함</span>' : '') +
      (isTemplate ? '<span style="font-size:10px;font-weight:700;color:#8B95A1;background:#F2F4F6;border-radius:7px;padding:1px 6px;">기본 문구</span>' : '');
    var pubHtml = '<div style="margin-bottom:10px;">' + _chRow(IC.comment, '공개 답글', pubOn, 'pub', it.id, pubBadges) +
      (pubOn ? '<div style="' + _BUBBLE + '">' + _esc(_displayPublic(it)) + '</div>'
             : '<div style="font-size:13px;color:#B0B8C1;padding:1px 2px 0;">공개 답글 안 달아요</div>') + '</div>';
    /* [2026-07-22 보스] 댓글 응대는 **공개 답글까지만** 담당한다. DM 은 DM 엔진(자동응답) 하나로 몬다.
       왜: DM 을 보내는 주체가 둘이면 24시간 메시징 윈도우·발송 한도·심사 스코프를 두 곳에서 따로
       관리해야 하고, 같은 손님이 댓글도 달고 DM 도 보내면 두 통이 나간다(중복 방어가 아예 없었다).
       DM 자동응답 쪽엔 이미 확인 큐·톤·금지어·운영시간·예약양식이 다 있는데 댓글 쪽은 반쪽이라
       같은 걸 두 번 만든 상태이기도 했다.
       → 공개 답글로 "DM 드릴게요" 같은 약속을 하지 않고(백엔드 nodm_public 이 문구를 갈아끼움),
         손님이 DM 을 보내오면 그때부터 DM 엔진이 이어받는다. 중복이 구조적으로 불가능해진다. */
    var dmHtml = '<div style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:#8B95A1;background:#F7F8FA;border-radius:11px;padding:9px 11px;">' +
      IC.mail + '<span>DM은 <b>DM 자동응답</b>이 맡아요 — 손님이 DM 보내면 거기서 이어져요</span></div>';
    // CTA — 공개 답글만 남으므로 라벨도 단순해진다(DM 토글 없음).
    var sendOff = !pubOn;
    var sendLabel = pubOn ? '공개 답글 보내기' : '보낼 내용을 켜주세요';
    // 아바타 — BE profile_pic(댓글↔DM 매칭) 있으면 사진, 없으면 이니셜
    var avatar = it.pic
      ? '<div style="width:38px;height:38px;border-radius:50%;flex-shrink:0;background:#F2F4F6 center/cover no-repeat;background-image:url(' + _esc(it.pic) + ');"></div>'
      : '<div style="width:38px;height:38px;border-radius:50%;background:#F2F4F6;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#8B95A1;font-size:14px;font-weight:700;">' + _esc(it.av) + '</div>';
    return '<div class="crq-item" data-id="' + _esc(it.id) + '" style="background:#fff;border:.5px solid #E5E8EB;border-radius:18px;padding:14px;margin-bottom:10px;">' +
      // 발신자
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:11px;">' + avatar +
        '<div style="flex:1;min-width:0;">' +
          '<div style="display:flex;align-items:center;gap:6px;"><span style="font-size:15px;font-weight:700;color:#191F28;white-space:nowrap;overflow:hidden;">' + _esc(it.name) + '</span>' +
            (it.intent === 'complaint' ? '<span style="font-size:10px;font-weight:700;color:#DC2626;background:#FEF2F2;border-radius:8px;padding:2px 7px;">불만</span>' : '') +
            /* [2026-09-02] '단골' 배지가 두 벌이던 것 — 브라우저 QA 에서 잡았다.
               하나는 댓글 문구 추정(_is_returning_comment "저번에 받은 거 또"),
               하나는 실제 고객 DB(방문 5회). 둘 다 그리면 "단골 단골 · 5회 방문" 이 된다.
               **실측 데이터가 있으면 그게 이긴다** — 추정 배지는 숨긴다. */
            (it.returning && !it.isCustomer ? '<span style="font-size:10px;font-weight:700;color:#0F766E;background:#E7F6EF;border-radius:8px;padding:2px 7px;">단골</span>' : '') +
            /* [2026-09-02] 기존 고객 표시. **DB 에 실제 값이 있을 때만** 그린다 — 방문 0회면 숫자를 만들지 않는다. */
            (it.isCustomer ? '<span style="font-size:10px;font-weight:700;color:#3B5BDB;background:#EDF2FF;border-radius:8px;padding:2px 7px;">' +
              (it.visitCount > 0 ? (it.isRegular ? '단골 · ' : '') + it.visitCount + '회 방문' : '기존 고객') + '</span>' : '') + '</div>' +
          '<div style="font-size:13px;color:#8B95A1;margin-top:1px;">' + _ago(it) + '</div>' +
        '</div>' +
      '</div>' + strip +
      // 손님 댓글 원문
      '<div style="background:#fff;border:.5px solid #E5E8EB;color:#191F28;border-radius:13px;border-top-left-radius:4px;padding:11px 13px;font-size:15px;line-height:1.55;white-space:pre-wrap;word-break:break-word;margin-bottom:12px;">' + _esc(it.text) + '</div>' +
      // 잇비 추천 답장 — 편집 중이면 텍스트영역, 아니면 토글형 답글/DM
      /* [2026-09-01 CMT-P2-009] '비공개 DM' 편집칸을 없앴다.
         이 화면은 DM 을 **절대 안 보낸다**(_postReply 가 dm_text:'' 를 하드코딩). 그런데
         [수정] 을 누르면 DM textarea 가 떴고, 원장이 거기 정성껏 쓴 내용은 조용히 버려졌다.
         원장은 보냈다고 믿고 손님은 못 받는다 — 입력받아 놓고 버리는 UX 는 남기면 안 된다. */
      (it._editing
        ? _editArea(IC.comment, '공개 답글', 'crq-edit-pub', it.id, _displayPublic(it))
        : pubHtml + dmHtml) +
      // 액션
      '<div style="display:flex;gap:8px;margin-top:13px;align-items:center;">' +
        '<button class="crq-send" data-id="' + _esc(it.id) + '"' + (sendOff ? ' disabled' : '') + ' style="flex:1;padding:12px;border:none;background:' + (sendOff ? '#E5E8EB' : '#191F28') + ';color:' + (sendOff ? '#8B95A1' : '#fff') + ';font-weight:700;font-size:15px;border-radius:13px;cursor:' + (sendOff ? 'default' : 'pointer') + ';display:flex;align-items:center;justify-content:center;gap:5px;">' + (sendOff ? '' : IC.send) + sendLabel + '</button>' +
        '<button class="crq-edit" data-id="' + _esc(it.id) + '" style="padding:12px 14px;border:1px solid ' + (it._editing ? '#BC6675' : '#E5E8EB') + ';background:#fff;color:' + (it._editing ? '#BC6675' : '#191F28') + ';font-weight:600;font-size:15px;border-radius:13px;cursor:pointer;">' + (it._editing ? '완료' : '수정') + '</button>' +
        '<button class="crq-discard" data-id="' + _esc(it.id) + '" style="padding:12px 6px;border:none;background:none;color:#8B95A1;font-weight:600;font-size:13px;cursor:pointer;">무시</button>' +
      '</div>' +
      /* [2026-09-02] 보조 행동 — **고객이 확실히 매칭됐을 때만** 뜬다.
         미매칭 카드에는 안 그린다: 누르면 엉뚱한 고객이 열리거나 아무 일도 안 나는 버튼이 되기 때문.
         주행동은 여전히 [공개 답글 보내기] 하나 — 이건 그 아래 옅은 링크로 둬서 흐름을 안 뺏는다.
         예약은 route 가 customer 를 안 받아서(openBooking(date)) 만들지 않았다. */
      _secondaryRow(it) +
    '</div>';
  }

  /* [2026-09-02] 보조 행동 줄 — 카드 하단, 구분선 아래 옅은 링크.
     주행동은 언제나 [공개 답글 보내기] 하나다. 여기는 그 흐름을 뺏지 않는 자리다.

       매칭된 고객   → [고객 보기] [DM 보기]
       미매칭        → [고객으로 등록]      ← 이게 그동안 없어서 댓글로만 온 손님이 CRM 밖에 있었다

     ⚠️ 등록은 **서버가 결정한다.** 프론트는 author_igsid 만 넘기고 이름·전화를 추측하지 않는다
        (username 으로 고객을 단정하면 동명이인이 합쳐진다 — 오연결 > 미연결). */
  var _LINK = 'background:none;border:none;padding:14px 8px;margin:-14px -8px;min-height:44px;'
    + 'font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;';
  var _ROW = 'display:flex;gap:30px;margin-top:11px;padding-top:11px;border-top:.5px solid #F2F4F6;align-items:center;';

  function _secondaryRow(it) {
    if (it.isCustomer && it.customerId) {
      return '<div style="' + _ROW + '">' +
        '<button class="crq-cust" data-id="' + _esc(it.id) + '" style="' + _LINK + 'color:#3B5BDB;">고객 보기</button>' +
        (it.authorIgsid ? '<button class="crq-dm" data-id="' + _esc(it.id) + '" style="' + _LINK + 'color:#3B5BDB;">DM 보기</button>' : '') +
        '</div>';
    }
    if (!it.authorIgsid) return '';          // 작성자 신원이 없으면 등록 자체가 불가
    if (it._regState === 'REGISTERING') {
      return '<div style="' + _ROW + '"><button class="crq-reg" data-id="' + _esc(it.id) + '" disabled ' +
        'style="' + _LINK + 'color:#B0B8C1;cursor:default;">등록 중…</button></div>';
    }
    var err = it._regState === 'ERROR'
      ? '<span style="font-size:12px;color:#DC2626;">고객으로 등록하지 못했어요</span>' : '';
    return '<div style="' + _ROW + '">' +
      '<button class="crq-reg" data-id="' + _esc(it.id) + '" style="' + _LINK + 'color:#3B5BDB;">' +
        (it._regState === 'ERROR' ? '다시 시도' : '고객으로 등록') + '</button>' + err +
      '</div>';
  }

  /* 승격 — 실제 백엔드 계약 그대로. 보내는 값은 author_igsid(필수) + media_id 뿐이다.
     응답 3종(created / linked_existing / already_linked) 모두 customer_id 를 준다 → 전부 성공 처리.
     already_linked 는 이미 이어져 있다는 뜻이지 실패가 아니다(중복 고객을 만들지 않는다). */
  function _registerCustomer(id) {
    var it = ITEMS.find(function (x) { return x.id === id; });
    if (!it || !it.authorIgsid) return;
    if (it._regState === 'REGISTERING') return;        // 연타 차단(최종 방어선은 서버 멱등)
    it._regState = 'REGISTERING';
    _render();
    var auth = window.authHeader ? window.authHeader() : {};
    window.apiFetch(window.apiUrl('/instagram/comment-author/promote'), {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, auth),
      body: JSON.stringify({ author_igsid: it.authorIgsid, media_id: it.mediaId || '' }),
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (j) {
        if (j && j.ok && j.customer_id) {
          // 서버가 준 id 만 쓴다. 방문 횟수는 실제 값이 올 때까지 표시하지 않는다(가짜 숫자 금지).
          it.customerId = j.customer_id;
          it.isCustomer = true;
          it._regState = 'SUCCESS';
          _toast('고객으로 등록했어요');
        } else {
          it._regState = 'ERROR';
          _toast('고객으로 등록하지 못했어요 — 잠시 후 다시 시도해 주세요');
        }
        _render();
      })
      .catch(function () {
        it._regState = 'ERROR';
        _toast('고객으로 등록하지 못했어요 — 잠시 후 다시 시도해 주세요');
        _render();
      });
  }

  // [v785] 게시물 미리보기 팝업 — 큐 흐름 안 끊고 어떤 글인지 확인 (탭하면 닫힘)
  function _peekDate(ts) {
    try { var d = new Date(ts); if (!isFinite(d.getTime())) return ''; return (d.getMonth() + 1) + '월 ' + d.getDate() + '일'; } catch (_e) { return ''; }
  }
  // [2026-07-23] 사진 확대는 자체 뒤로가기를 갖는다. 예전엔 미등록이라 뒤로가기를 누르면
  //   큐(crq)가 통째로 닫혔다 — 사진 하나 보고 나왔더니 목록까지 사라지는 셈.
  //   fromParent=true 면 history 는 건드리지 않는다 — 큐(부모)를 닫을 때 자식 엔트리까지
  //   _markSheetClosed('crq') 가 한 번에 뺀다. 여기서 먼저 빼면 back 이 비동기라 한 칸이 남는다.
  function _closePeek(fromParent) {
    var p = document.getElementById('crqPeek');
    if (!fromParent && window._markSheetClosed) window._markSheetClosed('crqPeek');
    if (p && p.parentNode) p.parentNode.removeChild(p);
  }
  function _openPeek(id) {
    var it = ITEMS.find(function (x) { return x.id === id; });
    if (!it) return;
    _closePeek();
    var dstr = it.mediaDate ? _peekDate(it.mediaDate) : '';
    var w = document.createElement('div');
    w.id = 'crqPeek';
    w.style.cssText = 'position:fixed;inset:0;z-index:10500;background:rgba(25,31,40,.45);display:flex;align-items:center;justify-content:center;padding:24px;';
    w.innerHTML = '<div class="crq-peek-card" style="width:100%;max-width:340px;background:#fff;border-radius:20px;padding:14px;box-shadow:0 10px 40px rgba(0,0,0,.2);">' +
      (it.thumb
        ? '<div style="aspect-ratio:1/1;border-radius:14px;background:#E5E8EB center/cover no-repeat;background-image:url(' + _esc(it.thumb) + ');margin-bottom:12px;"></div>'
        : '<div style="aspect-ratio:1/1;border-radius:14px;background:#F2F4F6;display:flex;align-items:center;justify-content:center;color:#C9CDD4;margin-bottom:12px;">' + _svg('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>', { w: 36 }) + '</div>') +
      '<div style="font-size:11px;color:#8B95A1;margin-bottom:6px;display:flex;align-items:center;gap:4px;">' + (dstr ? dstr + ' 발행 · ' : '') + IC.heart + ' 좋아요 ' + (it.likes || 0) + '</div>' +
      '<div style="font-size:13px;color:#191F28;line-height:1.55;white-space:pre-wrap;word-break:break-word;max-height:130px;overflow-y:auto;margin-bottom:14px;">' + _esc(it.mediaFull || it.media) + '</div>' +
      (it.permalink ? '<button class="crq-peek-open" style="width:100%;padding:12px;border:1px solid #E5E8EB;background:#fff;color:#191F28;font-weight:600;font-size:13px;border-radius:13px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;">' + IC.ig + '인스타에서 열기</button>' : '') +
      '<button class="crq-peek-close" style="width:100%;padding:11px;border:none;background:none;color:#8B95A1;font-size:13px;font-weight:600;cursor:pointer;margin-top:2px;">닫기</button></div>';
    w.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.crq-peek-open')) {
        try { if (window.openLink) window.openLink(it.permalink); else window.open(it.permalink, '_blank', 'noopener'); } catch (_o) { void _o; }
        return;
      }
      if ((e.target.closest && e.target.closest('.crq-peek-close')) || !(e.target.closest && e.target.closest('.crq-peek-card'))) _closePeek();
    });
    document.body.appendChild(w);
    // 큐(crq) 위에 쌓는다 — 뒤로가기 한 번은 사진만, 한 번 더 눌러야 큐가 닫힌다.
    if (window._registerSheet) window._registerSheet('crqPeek', _closePeek);
    if (window._markSheetOpen) window._markSheetOpen('crqPeek');
  }

  // [v787] 한 줄 상태 + 정렬 토글 — 배너·통계박스·필터탭 대체
  /* 원장이 3초 안에 알아야 하는 것: ① 몇 건인가 ② 급한 게 있나 ③ 내가 이번 주 얼마나 했나.
     [2026-09-01] 급한 건(불만·건강여부) 수를 앞에 세운다 — 예전엔 목록을 끝까지 훑어야 알 수 있었다. */
  function _statRow(items) {
    var count = items.length;
    var urgent = items.filter(function (it) {
      return it.intent === 'complaint' || it.intent === 'eligibility';
    }).length;
    return '<div style="display:flex;align-items:center;gap:7px;margin-bottom:13px;padding:2px 2px 0;">' +
      '<span style="width:6px;height:6px;border-radius:50%;flex-shrink:0;background:' + (urgent ? '#DC2626' : '#16B55E') + ';"></span>' +
      '<span style="font-size:15px;color:#191F28;"><b>대기 ' + count + '건</b>' +
        (urgent ? '<span style="color:#DC2626;font-weight:700;"> · 먼저 볼 것 ' + urgent + '건</span>' : '') +
        (_weekReplied > 0 ? '<span style="color:#8B95A1;font-weight:400;"> · 이번 주 ' + _weekReplied + '건 응대</span>' : '') + '</span>' +
      '<button class="crq-sort" style="margin-left:auto;flex-shrink:0;display:inline-flex;align-items:center;gap:4px;background:none;border:none;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;color:#6B7684;padding:4px 2px;">' +
        IC.sort + (_sort === 'old' ? '오래된순' : '최신순') + '</button></div>';
  }

  function _banner(bg, brd, fg, msg) {
    return '<div style="display:flex;align-items:flex-start;gap:8px;background:' + bg + ';border:.5px solid ' + brd + ';border-radius:12px;padding:10px 12px;margin-bottom:12px;">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + fg + '" stroke-width="2" stroke-linecap="round" style="flex-shrink:0;margin-top:1px;" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>' +
      '<span style="font-size:11.5px;color:' + fg + ';line-height:1.5;">' + msg + '</span></div>';
  }
  /* 상태별 빈 화면. **오류를 '문의 없음' 으로 위장하지 않는다.**
     원장이 알아야 하는 건 "지금 뭘 해야 하나" 하나다 — 그래서 고칠 수 있는 상태엔 버튼을 준다.
     문구는 작업실 성과 화면(_cqNoticeHtml)과 같은 표현을 쓴다 — 같은 상황에 두 화면이
     다른 말을 하면 원장은 둘 다 안 믿는다. */
  function _emptyStateHtml() {
    var WRAP = 'text-align:center;padding:44px 24px;';
    var TITLE = 'font-size:15px;font-weight:700;color:#191F28;margin-bottom:6px;';
    var DESC = 'font-size:13px;color:#8B95A1;line-height:1.7;';
    var BTN = 'margin-top:16px;padding:12px 20px;border:none;border-radius:13px;background:#191F28;color:#fff;font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;';
    function box(title, desc, btn) {
      return '<div style="' + WRAP + '"><div style="' + TITLE + '">' + title + '</div>' +
        '<div style="' + DESC + '">' + desc + '</div>' + (btn || '') + '</div>';
    }
    if (_state === 'DISABLED') {
      return box('댓글 문의 응대를 꺼두셨어요',
        '위 톱니(설정)에서 다시 켜면<br>문의 댓글을 모아드려요.');
    }
    if (_state === 'PERMISSION') {
      // 지금 Meta 심사 상태상 가장 흔한 실패다. 원인이 '권한' 이고 해법이 '재연결' 이라는 걸 말해준다.
      return box('문의 댓글을 못 읽었어요',
        '인스타를 연결할 때 <b>댓글 권한</b>을 안 받아서예요.<br>다시 연결하면 문의를 모아서 보여드릴 수 있어요.',
        '<button class="crq-reconnect" style="' + BTN + '">인스타 다시 연결</button>');
    }
    if (_state === 'NOT_CONNECTED') {
      return box('인스타가 연결되어 있지 않아요',
        '인스타를 연결하면 게시물에 달린<br>문의 댓글을 모아드려요.',
        '<button class="crq-reconnect" style="' + BTN + '">인스타 연결하기</button>');
    }
    if (_state === 'NETWORK') {
      return box('댓글을 불러오지 못했어요',
        '잠시 문제가 생겼어요.<br>다시 시도해 주세요.',
        '<button class="crq-retry" style="' + BTN + '">다시 시도</button>');
    }
    return box('답할 문의 댓글이 없어요',
      '지난 14일간 새로 온 문의가 없어요.<br>새 댓글이 오면 여기에 모아드려요.');
  }
  /* [2026-09-01] 응대 우선순위. 예전엔 **불만 → 좋아요 수 → 최신** 이었는데,
     좋아요 수는 "누구에게 먼저 답해야 하나" 와 아무 상관이 없다. 좋아요 3개 붙은
     사흘 전 댓글이 오늘 온 예약 문의보다 위에 오는 게 실제로 벌어졌다.

     새 기준은 **놓치면 손해가 큰 순서**다. 새 분류 체계를 만들지 않고 지금 있는 intent 만 쓴다:
       0  complaint    불만 — 늦으면 공개적으로 번진다
       1  eligibility  건강·시술 가능 여부 — 안전 문제, 반드시 사람이 답해야 한다
       2  booking/price/membership/event — 돈으로 이어지는 문의
       3  나머지 문의
     같은 등급 안에서는 **단골 먼저**, 그 다음 시간순(기본 최신, 토글로 오래된순). */
  var _PRIORITY = { complaint: 0, eligibility: 1, booking: 2, price: 2, membership: 2, event: 2 };
  function _prio(it) {
    var p = _PRIORITY[it && it.intent];
    return p === undefined ? 3 : p;
  }
  function _priorityCmp(a, b) {
    var pa = _prio(a), pb = _prio(b);
    if (pa !== pb) return pa - pb;                       // 급한 등급 먼저
    var ra = a.returning ? 0 : 1, rb = b.returning ? 0 : 1;
    if (ra !== rb) return ra - rb;                       // 같은 등급이면 단골 먼저
    return _sort === 'old' ? _ord(a) - _ord(b) : _ord(b) - _ord(a);
  }

  // [v787] 정렬 기준 시각 — 실데이터 timestamp (없으면 지금)
  function _ord(it) {
    var t = it.ts ? Date.parse(it.ts) : NaN;
    return isFinite(t) ? t : (Date.now() - (it.waiting || 0) * 60000);
  }
  /* [2026-07-22 보스] 불러오는 동안엔 '예시 댓글'을 보여주지 않는다.
     실측 콜드 스캔 9초 — 그 9초간 가짜 손님(민지·서연…) 카드가 진짜처럼 떠 있어서
     "이상한 게 뜨고 오래 걸린다"로 읽혔다. 뼈대만 보여주고 진짜가 오면 갈아끼운다. */
  function _skeletonHtml() {
    var one = '<div style="background:#fff;border:.5px solid #E5E8EB;border-radius:18px;padding:14px;margin-bottom:10px;">' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:11px;">' +
        '<div style="width:38px;height:38px;border-radius:50%;background:#F2F4F6;"></div>' +
        '<div style="flex:1;"><div style="width:38%;height:11px;border-radius:6px;background:#F2F4F6;margin-bottom:6px;"></div>' +
        '<div style="width:22%;height:9px;border-radius:5px;background:#F7F8FA;"></div></div></div>' +
      '<div style="height:52px;border-radius:13px;background:#F7F8FA;margin-bottom:11px;"></div>' +
      '<div style="height:44px;border-radius:13px;background:#F7F8FA;"></div></div>';
    return one + one;
  }
  /* [2026-08-15] 사진별 묶기 — 댓글의 맥락 단위는 '게시물'이다.
     예전엔 모든 게시물 댓글이 한 줄기로 섞여서, 같은 사진에 가격 질문 3개가 달려도
     서로 멀리 떨어져 보였고 원장님이 같은 답을 3번 따로 쳤다. 사진으로 묶으면 한눈에 보인다.
     디자인은 그대로 — 카드는 손대지 않고, 이미 있던 게시물 스트립(crq-chip)을 섹션 헤더로 올렸다.
     ⚠️ 불만이 오래된 사진에 달리면 묶은 뒤 아래로 묻힌다 → 불만 낀 묶음을 맨 위로 올린다. */
  // 묶음 답장 배너에 쓸 짧은 이름 (카드엔 원래 의도 라벨이 없어서 여기서만 쓴다)
  var _INTENT_KO = {
    price: '가격', booking: '예약', location: '위치', hours: '영업시간', service: '시술',
    duration: '소요시간', event: '이벤트', membership: '회원권', eligibility: '시술 가능 여부',
  };
  function _groupedHtml(items) {
    var order = [], byMedia = {};
    items.forEach(function (it) {
      var k = it.mediaId || ('__nomedia_' + it.id);
      if (!byMedia[k]) { byMedia[k] = []; order.push(k); }
      byMedia[k].push(it);
    });
    // 묶음 정렬 — ① 불만 낀 묶음 먼저 ② 그 안에서 대표 시각(정렬 토글 방향 그대로)
    order.sort(function (a, b) {
      var ga = byMedia[a], gb = byMedia[b];
      var ca = ga.some(function (x) { return x.intent === 'complaint'; }) ? 1 : 0;
      var cb = gb.some(function (x) { return x.intent === 'complaint'; }) ? 1 : 0;
      if (ca !== cb) return cb - ca;
      var pick = function (g) {
        return g.reduce(function (acc, x) {
          var t = _ord(x);
          return acc === null ? t : (_sort === 'old' ? Math.min(acc, t) : Math.max(acc, t));
        }, null);
      };
      var ta = pick(ga), tb = pick(gb);
      return _sort === 'old' ? ta - tb : tb - ta;
    });
    return order.map(function (k) {
      var g = byMedia[k];
      var head = g[0];
      var dstr = head.mediaDate ? _peekDate(head.mediaDate) : '';
      var title = (head.media || '게시물');
      // 헤더 = 기존 스트립과 같은 모양(배경·반경·썸네일 52px). 탭하면 원래처럼 게시물 미리보기.
      var header = '<button class="crq-chip" data-id="' + _esc(head.id) + '" style="width:100%;display:flex;align-items:center;gap:10px;background:#F7F8FA;border:none;border-radius:13px;padding:8px;margin-bottom:8px;cursor:pointer;font-family:inherit;text-align:left;">' +
        (head.thumb
          ? '<span style="width:52px;height:52px;flex-shrink:0;border-radius:10px;background:#E5E8EB center/cover no-repeat;background-image:url(' + _esc(head.thumb) + ');"></span>'
          : '<span style="width:52px;height:52px;flex-shrink:0;border-radius:10px;background:#E5E8EB;display:inline-flex;align-items:center;justify-content:center;color:#B0B8C1;">' + IC.camera + '</span>') +
        '<span style="flex:1;min-width:0;">' +
          '<span style="display:block;font-size:13px;font-weight:600;color:#191F28;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _esc(title) + '</span>' +
          '<span style="display:block;font-size:11.5px;color:#B0B8C1;margin-top:1px;">' + (dstr ? _esc(dstr) + ' · ' : '') + '문의 ' + g.length + '건</span>' +
        '</span>' +
        '<span style="color:#B0B8C1;font-size:13px;flex-shrink:0;">›</span></button>';
      // 같은 종류 문의가 2건 이상이면 한 번에 보낼 수 있게. 불만은 제외 — 사람마다 사정이 달라 개별 대응해야 한다.
      var byIntent = {};
      g.forEach(function (it) {
        if (it._sendPub === false || it.intent === 'complaint') return;
        (byIntent[it.intent] = byIntent[it.intent] || []).push(it);
      });
      var strips = Object.keys(byIntent).filter(function (k) { return byIntent[k].length >= 2; }).map(function (k) {
        var arr = byIntent[k];
        return '<button class="crq-batch" data-ids="' + _esc(arr.map(function (x) { return x.id; }).join(',')) + '" ' +
          'style="width:100%;display:flex;align-items:center;gap:9px;background:#F7EFF0;border:.5px solid #EBD9DD;border-radius:13px;padding:10px 12px;margin-bottom:8px;cursor:pointer;font-family:inherit;text-align:left;">' +
          '<span style="flex:1;min-width:0;font-size:12.5px;font-weight:600;color:#BC6675;line-height:1.45;">' +
            _esc(_INTENT_KO[k] || '같은') + ' 문의 ' + arr.length + '건 — 각자 초안으로 한 번에 보낼까요?</span>' +
          '<span style="flex-shrink:0;font-size:11.5px;font-weight:700;color:#fff;background:#BC6675;border-radius:99px;padding:6px 11px;">한 번에</span>' +
          '</button>';
      }).join('');
      var body = g.map(function (it) { return _cardHtml(it, true); }).join('');
      return '<div style="margin-bottom:18px;">' + header + strips + body + '</div>';
    }).join('');
  }

  function _queueBody() {
    if (_loading || _state === 'LOADING') {
      return _banner('#F2F4F6', '#E5E8EB', '#4E5968', '인스타에서 문의 댓글을 모으는 중이에요… (처음엔 10초쯤 걸려요)') +
        _skeletonHtml();
    }
    /* [2026-09-01 CMT-P2-008] 인텐트·제외단어 필터를 프론트에서 뺐다.
       예전엔 홈(인텐트만)과 큐(인텐트+숨김+제외단어)가 서로 다른 필터를 들고 있어서
       홈은 "문의 3건", 들어가면 1건이었다. 같은 사용자에게 보여주는 숫자가 다르면
       원장은 둘 다 안 믿는다. 이제 자격 판정은 서버(_crq_item_eligible) 한 곳이 한다.
       로컬 숨김(_isHidden)만 남긴다 — 서버 반영 전 이 기기의 즉답용이다. */
    var items = ITEMS.filter(function (it) { return !_isHidden(it); })
      .slice().sort(_priorityCmp);

    if (!items.length) return _emptyStateHtml();

    // [2026-07-21] 운영시간 밖 + 방해금지 → 조용히 모아뒀다는 안내 (발송은 언제든 가능)
    var quietBar = _isQuietNow()
      ? '<div style="display:flex;align-items:center;gap:7px;background:#F2F4F6;border-radius:12px;padding:10px 12px;margin-bottom:12px;font-size:13px;color:#6B7684;">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8B95A1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>' +
        '<span>지금은 응답 시간대 밖이에요 · 조용히 모아뒀어요<span style="color:#B0B8C1;"> (발송은 언제든 가능)</span></span></div>'
      : '';
    return quietBar + _statRow(items) + _groupedHtml(items) +
      '<div style="font-size:11px;color:#C9CDD4;text-align:center;margin-top:12px;">애매한 댓글은 큐에 안 올라와요 · 확실한 문의만</div>';
  }

  function _settingsBody() {
    // 단일 진실원 — 열 때 최신 enabled 반영(목록 ai-hub 와 같은 저장 키). [v789] 여기서도 끄고 켬.
    try { var _f = JSON.parse(localStorage.getItem('itdasy:crq_settings') || 'null'); if (_f) _settings.enabled = _f.enabled === true; } catch (_e) { void _e; }
    var S = _settings;
    var CARD = 'background:#fff;border:.5px solid #E5E8EB;border-radius:18px;padding:15px;margin-bottom:11px;';
    var TITLE = 'font-size:15px;font-weight:700;color:#191F28;';
    var SUB = 'font-size:13px;color:#8B95A1;';
    function _chip(key, label) {
      var on = S.intents[key] !== false;
      return '<span class="crq-intent" data-intent="' + key + '" style="cursor:pointer;font-size:15px;font-weight:' + (on ? 700 : 500) + ';padding:10px 18px;border-radius:14px;' +
        (on ? 'background:#F7EFF0;color:#BC6675;box-shadow:inset 0 0 0 1px rgba(188,102,117,.18);' : 'background:#F7F8FA;color:#B0B8C1;') + '">' + label + '</span>';
    }
    function _emojiOpt(e) {
      var on = S.emoji === e;
      return '<span class="crq-emoji" data-emoji="' + e + '" style="cursor:pointer;min-width:36px;text-align:center;font-size:' + (e ? '16px' : '15px') + ';padding:8px 10px;border-radius:12px;' +
        (on ? 'background:#191F28;color:#fff;' : 'background:#F7F8FA;color:#8B95A1;box-shadow:inset 0 0 0 1px #E5E8EB;') + '">' + (e || '없음') + '</span>';
    }
    // 마스터 토글 — 카드 토글(crq-tg)과 같은 생김새, 설정 전용 클래스(핸들러 분리)
    var mtg = '<span class="crq-master" role="switch" aria-checked="' + (S.enabled ? 'true' : 'false') + '" style="cursor:pointer;flex-shrink:0;display:inline-block;width:32px;height:19px;border-radius:10px;position:relative;transition:background .15s;background:' + (S.enabled ? '#16B55E' : '#D1D6DB') + ';">' +
      '<span style="position:absolute;top:2px;left:' + (S.enabled ? '15px' : '2px') + ';width:15px;height:15px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.15);transition:left .15s;"></span></span>';
    return '<div style="' + CARD + 'display:flex;align-items:center;gap:10px;">' +
        '<div style="flex:1;"><div style="' + TITLE + '">댓글 문의 응대</div>' +
        '<div style="' + SUB + 'margin-top:3px;">' + (S.enabled ? '문의 댓글을 모아드려요 · 답장은 확인 후 직접 보내요' : '꺼짐 · 홈에도 안 떠요') + '</div></div>' + mtg + '</div>' +
      // 문의 종류 — 끄면 대기 목록·홈 숫자에서 제외(숨김). [2026-07-21] 시술종류·소요시간·이벤트·회원권 추가
      '<div style="' + CARD + '"><div style="' + TITLE + 'margin-bottom:4px;">이런 댓글에 답해요</div>' +
        '<div style="' + SUB + 'margin-bottom:12px;">끈 문의는 여기에 안 보여요 · 불만·건강문의는 항상 챙겨요</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;">' + _chip('price', '가격') + _chip('booking', '예약') + _chip('location', '위치') + _chip('hours', '영업시간') + _chip('service', '시술종류') + _chip('duration', '소요시간') + _chip('event', '이벤트') + _chip('membership', '회원권') + '</div></div>' +
      // [2026-07-21] 응답 시간대 — 방해금지(운영시간 밖엔 홈 알림 안 뜸, 모아뒀다 알려줌)
      '<div style="' + CARD + '"><div style="display:flex;align-items:center;gap:10px;margin-bottom:' + (S.quiet_outside ? '13px' : '2px') + ';">' +
        '<div style="flex:1;"><div style="' + TITLE + '">응답 시간대</div>' +
        '<div style="' + SUB + 'margin-top:3px;">' + (S.quiet_outside ? '이 시간 밖엔 조용히 모아뒀다 알려드려요' : '언제든 바로 알려드려요') + '</div></div>' +
        '<span class="crq-quiet" role="switch" aria-checked="' + (S.quiet_outside ? 'true' : 'false') + '" style="cursor:pointer;flex-shrink:0;display:inline-block;width:32px;height:19px;border-radius:10px;position:relative;transition:background .15s;background:' + (S.quiet_outside ? '#16B55E' : '#D1D6DB') + ';">' +
          '<span style="position:absolute;top:2px;left:' + (S.quiet_outside ? '15px' : '2px') + ';width:15px;height:15px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.15);transition:left .15s;"></span></span></div>' +
        (S.quiet_outside ? '<div style="display:flex;align-items:center;gap:10px;">' +
          '<input class="crq-time" type="time" data-field="start" value="' + _esc(S.active_hours.start) + '" style="flex:1;padding:11px 12px;border:none;border-radius:12px;font-size:15px;background:#F7F8FA;color:#191F28;box-sizing:border-box;font-family:inherit;text-align:center;">' +
          '<span style="color:#8B95A1;font-size:15px;">~</span>' +
          '<input class="crq-time" type="time" data-field="end" value="' + _esc(S.active_hours.end) + '" style="flex:1;padding:11px 12px;border:none;border-radius:12px;font-size:15px;background:#F7F8FA;color:#191F28;box-sizing:border-box;font-family:inherit;text-align:center;"></div>' : '') +
        '</div>' +
      /* [2026-09-01] '예약 링크' 입력칸 제거. 설명은 "DM 답장 끝에 자동으로 붙어요" 였는데
         이 화면은 DM 을 안 보낸다 — 값은 저장됐지만 **아무 데서도 안 쓰였다**(_finalDm 뿐, 그것도 죽은 코드).
         원장이 채워 넣고 뭔가 된다고 믿게 만드는 칸은 없느니만 못하다. CMT-P2-009 와 같은 종류.
         저장돼 있던 값은 crq_settings_json 에 그대로 남는다(지우지 않음 — 되살릴 때 쓴다). */
      // 공개답글 끝 이모지 (AI 응답 텍스트용 — 이모지 허용 예외)
      '<div style="' + CARD + '"><div style="' + TITLE + 'margin-bottom:12px;">공개답글 끝 이모지</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:7px;">' + _EMOJI_OPTS.map(_emojiOpt).join('') + '</div></div>' +
      // [2026-07-22 보스] 제외 단어 — 협찬·광고성 댓글이 문의로 올라와 원장 시간을 뺏던 것 차단.
      '<div style="' + CARD + 'margin-bottom:0;"><div style="' + TITLE + 'margin-bottom:4px;">이런 댓글은 빼기</div>' +
        '<div style="' + SUB + 'margin-bottom:12px;">이 말이 들어간 댓글은 목록에 안 올라와요 · 쉼표로 여러 개</div>' +
        '<input class="crq-exclude" type="text" value="' + _esc(S.exclude_words) + '" placeholder="예) 협찬, 공구, 팔로우" ' +
          'style="width:100%;padding:13px 14px;border:none;border-radius:14px;font-size:15px;background:#F7F8FA;color:#191F28;box-sizing:border-box;font-family:inherit;" /></div>' +
      '<div style="font-size:12px;color:#C9CDD4;text-align:center;margin-top:14px;">바꾸면 바로 저장돼요 · <b>저장</b>을 누르면 다른 기기에서도 그대로예요</div>';
  }

  function _render() {
    var el = document.getElementById(ID);
    if (!el) return;
    var body = el.querySelector('.ss-body');
    var title = el.querySelector('.crq-title');
    if (title) title.textContent = _view === 'settings' ? '댓글 문의 응대 설정' : '댓글 문의 응대';
    var gear = el.querySelector('.crq-gear');
    if (gear) gear.style.display = _view === 'settings' ? 'none' : 'inline-flex';
    var saveBtn = el.querySelector('.crq-save');
    if (saveBtn) saveBtn.style.display = _view === 'settings' ? 'inline-block' : 'none';
    if (body) body.innerHTML = _view === 'settings' ? _settingsBody() : _queueBody();
  }

  function _ensureMounted() {
    var el = document.getElementById(ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = ID;
    el.className = 'subscreen-overlay';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<header class="ss-topbar">' +
        '<button type="button" class="ss-back" data-crq-back aria-label="뒤로"><svg class="ic" aria-hidden="true"><use href="#ic-chevron-left"/></svg></button>' +
        '<div class="ss-title crq-title">댓글 문의 응대</div>' +
        '<button type="button" class="crq-gear" aria-label="설정" style="margin-left:auto;background:none;border:none;cursor:pointer;color:#4E5968;display:inline-flex;align-items:center;padding:4px;">' + IC.gear + '</button>' +
        // [2026-07-22 보스] 저장 버튼 — DM 자동응답 설정창(dm-header__action)과 같은 자리·같은 역할.
        //   값은 바꾸는 즉시 로컬에 저장되지만, 원장님은 "저장을 눌러야 저장된 것"으로 느낀다.
        //   이 버튼이 서버 저장(기기 간 동기화)까지 확실히 마무리한다.
        '<button type="button" class="crq-save" style="margin-left:auto;display:none;background:none;border:none;cursor:pointer;color:#BC6675;font-size:15px;font-weight:700;font-family:inherit;padding:4px 6px;">저장</button>' +
      '</header>' +
      '<div class="ss-body" style="padding:14px;"></div>';
    document.body.appendChild(el);

    // 이벤트 위임
    el.addEventListener('click', function (e) {
      // [2026-08-15] 묶음 답장 — crq-chip(게시물 칩)보다 먼저 본다. 헤더 바로 밑에 있어 오탐 방지.
      var batchEl = e.target.closest ? e.target.closest('.crq-batch') : null;
      if (batchEl) {
        _haptic();
        var _bids = (batchEl.getAttribute('data-ids') || '').split(',').filter(Boolean);
        _sendBatch(_bids, batchEl);
        return;
      }
      // [v785] 게시물 칩 → 미리보기 팝업 (인스타 직행 X)
      var chipEl = e.target.closest ? e.target.closest('.crq-chip') : null;
      if (chipEl) { _haptic(); _openPeek(chipEl.getAttribute('data-id')); return; }
      // [v785] 채널 토글 (공개답글/DM) — DM줄 안에 있어서 dmline 보다 먼저 체크
      var tg = e.target.closest ? e.target.closest('.crq-tg') : null;
      if (tg) {
        _haptic();
        var ti = ITEMS.find(function (x) { return x.id === tg.getAttribute('data-id'); });
        if (ti) {
          if (tg.getAttribute('data-kind') === 'pub') ti._sendPub = (ti._sendPub === false);
          else ti._sendDm = (ti._sendDm === false);
          _render();
        }
        return;
      }
      // 설정 컨트롤(span — 버튼 아님) — [v789] 누르는 즉시 저장 (+ v790 저장 버튼으로 서버 동기화)
      var sc = e.target.closest ? e.target.closest('.crq-intent,.crq-master,.crq-emoji,.crq-quiet') : null;
      if (sc) {
        _haptic();
        _captureSettingInputs(el);   // 재렌더 전 입력값(링크·시간·제외단어) 보존
        if (sc.classList.contains('crq-master')) {
          // [2026-08-26] 켜는 건 안내 + 체크 + 서버 승인 기록을 거친다.
          //   끄는 건 안 묻는다 — 끄는 쪽은 언제나 안전하다.
          //   승인 없이 켜면 서버가 PUT 을 403 으로 막으므로, 화면만 켜 두면 거짓말이 된다.
          if (_settings.enabled) { _settings.enabled = false; _saveSettings(); _pushSettingsToServer(); _render(); return; }
          var _ac = window.AutomationConsent;
          if (!_ac || typeof _ac.ask !== 'function') { _toast('잠시 뒤 다시 눌러주세요'); return; }
          _ac.ask(_ac.COMMENT_AUTOREPLY).then(function (ok) {
            if (!ok) return;
            _settings.enabled = true;
            _saveSettings();
            _render();
            _pushSettingsToServer().then(function (saved) {
              if (saved) return;
              // 서버가 못 받았으면(403 포함) 화면도 되돌린다 —
              // 켜진 것처럼 보이는데 큐가 안 도는 게 최악이다.
              _settings.enabled = false;
              _saveSettings();
              _render();
              _toast('켜기에 실패했어요 — 다시 시도해 주세요');
            });
          });
          return;
        }
        else if (sc.classList.contains('crq-intent')) { var k = sc.getAttribute('data-intent'); _settings.intents[k] = (_settings.intents[k] === false); }
        else if (sc.classList.contains('crq-emoji')) { _settings.emoji = sc.getAttribute('data-emoji'); }
        else if (sc.classList.contains('crq-quiet')) { _settings.quiet_outside = !_settings.quiet_outside; }
        _saveSettings();
        _render();
        return;
      }
      var t = e.target.closest ? e.target.closest('button') : null;
      if (!t) return;
      // [2026-07-22 보스] 저장 — 화면의 입력값을 확정하고 서버까지 올린 뒤 목록으로 돌아간다.
      if (t.classList.contains('crq-save')) {
        _haptic();
        _captureSettingInputs(el);
        _saveSettings();
        _toast('저장 중…');
        _pushSettingsToServer().then(function (ok) {
          _toast(ok ? '저장했어요 · 다른 기기에서도 그대로예요' : '이 기기에 저장했어요 (서버 저장은 나중에 다시 시도돼요)');
        });
        _view = 'queue'; _render();
        return;
      }
      if (t.hasAttribute('data-crq-back')) {
        _haptic();
        if (_view === 'settings') {
          _captureSettingInputs(el);   // 입력 중 뒤로가기 안전망(링크·시간·제외단어)
          _saveSettings();
          _pushSettingsToServer();     // 저장 버튼 안 눌러도 서버엔 조용히 올려둔다
          _view = 'queue'; _render();
        } else { closeCommentReplyQueue(); }
        return;
      }
      if (t.classList.contains('crq-gear')) { _haptic(); _view = 'settings'; _render(); return; }
      if (t.classList.contains('crq-retry')) { _haptic(); _igWaitTries = 0; _loadReal(false); return; }
      if (t.classList.contains('crq-reconnect')) {
        /* 실제로 존재하는 경로로만 보낸다 — 없는 화면을 여는 가짜 버튼은 만들지 않는다.
           연동 허브(app-integrations-hub.js)가 인스타 연결/재연결의 정식 진입점이다. */
        _haptic();
        if (typeof window.openIntegrationsHub === 'function') { _goAfterClose(function () { window.openIntegrationsHub(); }); }
        else _toast('설정 > 연동에서 인스타를 다시 연결해 주세요');
        return;
      }
      // [v787] 정렬 토글 — 최신순 ↔ 오래된순 (불만은 항상 위)
      if (t.classList.contains('crq-sort')) { _haptic(); _sort = _sort === 'old' ? 'new' : 'old'; _render(); return; }
      var id = t.getAttribute('data-id');
      if (t.classList.contains('crq-send')) { _haptic(); _sendReply(id); return; }
      if (t.classList.contains('crq-edit')) {
        _haptic();
        var ei = ITEMS.find(function (x) { return x.id === id; });
        if (!ei) return;
        if (ei._editing) { _captureEdit(el, ei); ei._editing = false; }   // 완료 → 편집값 저장
        else { ei._editing = true; }
        _render();
        return;
      }
      if (t.classList.contains('crq-discard')) { _haptic(); _dismissItem(id); _toast('이 댓글은 응대하지 않아요'); return; }
      /* 실재하는 route 로만 보낸다. 없으면 버튼 자체를 안 그렸으므로 여기 오지 않지만,
         로더 지연 등으로 함수가 아직 없을 수 있어 방어한다(조용히 실패시키지 않고 알린다). */
      if (t.classList.contains('crq-reg')) { _haptic(); _registerCustomer(id); return; }
      if (t.classList.contains('crq-cust')) {
        _haptic();
        var ci = ITEMS.find(function (x) { return x.id === id; });
        if (ci && ci.customerId && typeof window.openCustomerDashboard === 'function') {
          _goAfterClose(function () { window.openCustomerDashboard(ci.customerId); });
        } else _toast('고객 화면을 불러오지 못했어요');
        return;
      }
      if (t.classList.contains('crq-dm')) {
        _haptic();
        var di = ITEMS.find(function (x) { return x.id === id; });
        if (di && di.authorIgsid && typeof window.openDMThread === 'function') {
          _goAfterClose(function () { window.openDMThread(di.authorIgsid); });
        } else _toast('DM 화면을 불러오지 못했어요');
        return;
      }
    });
    // [v789] 예약 링크 즉시 저장 — 입력 마치고 포커스 빠질 때(change 는 버블됨)
    el.addEventListener('change', function (e) {
      if (!e.target || !e.target.classList) return;
      if (e.target.classList.contains('crq-time')             // [2026-07-21] 응답 시간대
          || e.target.classList.contains('crq-exclude')) {    // [2026-07-22] 제외 단어
        _captureSettingInputs(el);
        _saveSettings();   // 목록 반영은 설정에서 나갈 때 _render() 가 한다(입력 중 재렌더 = 포커스 튐)
      }
    });
    return el;
  }

  // [무시 영속화] 서버에도 무시 기록 — 백엔드가 큐·배지 카운트에서 영구 제외(다른 기기·홈 배지 동기화).
  //   localStorage 는 이 기기 즉답용, 서버가 정본. 실패해도 localStorage 로 이 기기엔 남으므로 조용히 넘어감.
  function _pushDismissToServer(it) {
    if (!window.apiFetch || !window.authHeader || !window.apiUrl || !it) return;
    try {
      window.apiFetch(window.apiUrl('/instagram/comment-queue/dismiss'), {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, window.authHeader()),
        body: JSON.stringify({ comment_id: it.commentId || it.id, media_id: it.mediaId || '', intent: it.intent || '' }),
      }).catch(function () { void 0; });
    } catch (_e) { void _e; }
  }
  /* 목록에서 카드를 뺀다. **서버 dismiss 는 여기서 안 쏜다.**

     [2026-09-01 CMT-P1-001] 예전엔 이 함수가 항상 dismiss 를 서버로 보냈는데,
     [보내기] 경로도 이 함수를 먼저 불렀다. 그래서 답장을 보낼 때마다 서버엔
     `intent='_dismissed'` 행이 먼저 생기고, 뒤이어 온 답글 성공이 그 행을 갱신했다
     → 실제 응대가 '무시' 로 굳어 **"이번 주 N건 응대" 가 영원히 0** 이었다.
     운영 DB 에서 오염 3건을 실측했다(user 3, 07-29 ~ 08-04).

     이제 서버 dismiss 는 오직 [무시] 버튼만 보낸다(_dismissItem).
     silent=true 면 재렌더를 미룬다 — 묶음 발송에서 건마다 다시 그리면 목록이 흔들린다. */
  function _removeItem(id, silent) {
    _markHidden(id);   // 이 기기 즉시 반영 (오프라인·즉답). 서버 정본은 CommentReplyLog.
    var i = ITEMS.findIndex(function (x) { return x.id === id; });
    if (i >= 0) ITEMS.splice(i, 1);
    if (!silent) { _state = ITEMS.length ? 'DATA' : 'EMPTY'; _render(); }
  }

  /* [무시] 버튼 전용 — 화면에서 빼고 **서버에도** 무시로 기록한다.
     서버 기록이 있어야 다른 기기·홈 배지에서도 같이 빠진다. */
  function _dismissItem(id) {
    var it = ITEMS.find(function (x) { return x.id === id; });
    if (it && it._real) _pushDismissToServer(it);
    _removeItem(id);
  }
  // 편집 중인 텍스트영역 값을 아이템 override로 캡처
  function _captureEdit(el, it) {
    // 공개 답글만 편집한다 — DM 은 이 화면에서 안 나간다(CMT-P2-009).
    var pta = el.querySelector('.crq-edit-pub[data-id="' + it.id + '"]');
    if (pta) it._override = { pub: pta.value };
  }
  function _sendReply(id) {
    var it = ITEMS.find(function (x) { return x.id === id; });
    if (!it) return;
    // [2026-07-22 보스] DM 발송 주체 단일화 — 댓글 응대에서는 DM 을 절대 보내지 않는다.
    //   send_dm:false 를 명시하면 백엔드가 공개답글 문구의 "DM 드렸어요" 약속도 nodm_public 로 갈아끼운다
    //   (거짓 약속 방지). 실제 DM 은 손님이 보내온 뒤 DM 자동응답 엔진이 처리한다.
    if (it._sendPub === false) return;   // 보낼 게 없음 → CTA 비활성 (안전망). send_dm:false 는 _postReply 가 박는다.
    var el = document.getElementById(ID);
    if (it._editing && el) { _captureEdit(el, it); it._editing = false; }   // 편집 중 발송 → 편집값 반영
    if (!(it._real && it.commentId && window.apiFetch)) return;   // 예시 데이터는 이제 없다
    _removeItem(id);
    _toast('보내는 중…');
    _postReply(it)
      .then(function (j) {
        if (_delivered(j)) { _toast('답글 달았어요 (' + it.name + ')'); return; }
        if (_isInProgress(j)) {
          // 다른 기기·탭이 보내는 중. 성공으로 세면 안 된다 — 그쪽이 실패하면 아무도 답을 못 받는다.
          // 카드를 되살려 큐에 남긴다. 그쪽이 성공했으면 다음 갱신 때 서버 판정으로 알아서 사라진다.
          _toast('다른 기기에서 보내는 중이에요. 잠시 후 확인해 주세요');
          _restoreItem(it);
          return;
        }
        _toast(_errorMessage(j));
        _restoreItem(it);          // 실패했으면 되살린다 — 조용히 사라지면 원장이 놓친다
      })
      .catch(function () { _toast(_errorMessage(null)); _restoreItem(it); });
  }

  /* [2026-09-01] 발송 실패 문구. 예전엔 `'일부 실패 — ' + JSON.stringify(...)` 로
     **Graph 원본 JSON 을 원장 화면에 그대로** 던졌다. 원장은 개발자가 아니고,
     그 문자열로는 다음에 뭘 해야 할지 알 수 없다.
     서버가 error_code(permission/rate_limit/gone/temporary)를 준다 — 상세는 로그에만 남는다. */
  function _errorMessage(j) {
    var code = j && j.error_code;
    if (code === 'permission') return '인스타 연결을 확인해 주세요';
    if (code === 'rate_limit') return '인스타가 잠시 바빠요 — 조금 뒤에 다시 시도해 주세요';
    if (code === 'gone') return '이 댓글은 인스타에서 삭제됐어요';
    return '답변을 보내지 못했어요 — 잠시 후 다시 시도해 주세요';
  }

  /* 발송 실패분 되살리기. 낙관적으로 지웠는데 실패하면 원장 화면에서 그냥 사라진다 —
     "보낸 줄 알았는데 안 갔다" 가 제일 나쁘다. 로컬 숨김도 같이 푼다. */
  function _restoreItem(it) {
    if (!it) return;
    delete _hidden[it.id];
    try { localStorage.setItem(_HIDDEN_KEY, JSON.stringify(_hiddenPayload())); } catch (_e) { void _e; }
    if (!ITEMS.some(function (x) { return x.id === it.id; })) ITEMS.push(it);
    _state = ITEMS.length ? 'DATA' : 'EMPTY';
    _render();
  }

  /* [2026-08-15] 발송을 한 군데로 모은다 — 낱개 발송과 묶음 발송이 각자 fetch 를 들고 있으면
     한쪽만 고쳐서 어긋난다. 예전에 발송 API 가 전역 재시도에 걸려 **같은 답글이 4번 나간 적**이 있어
     (33cdd1f) 이 경로는 특히 하나로 유지해야 한다. */
  /* [2026-09-02 PHASE 9] "내 요청이 실제로 답글을 달았나" 판정.
     백엔드는 동시 요청을 UNIQUE 제약으로 하나만 통과시키고, 진 요청에는
     `{ok:true, in_progress:true, public:null}` 을 준다 — 뜻은 "**다른 요청이 지금 보내는 중**"이지
     "보냈다"가 아니다(routers/instagram.py 의 주석에도 '화면엔 보내는 중으로 보인다'고 적혀 있다).
     그런데 화면은 `j.ok` 하나만 보고 "답장 보냈어요" 로 세고 카드를 큐에서 지웠다.
     실측(2026-09-02, 동시 3발): ok=true(dup) / ok=true(dup) / ok=false(Graph 400)
       → **실제 발송 0회인데 2건이 성공으로 집계**. 이긴 요청이 실패하면 손님 문의가
         조용히 사라진다(카드는 이미 없어졌고 아무도 답을 못 받는다).
     duplicate 는 다르다 — public_reply_id 가 있다 = 진짜로 나갔다. 성공으로 친다. */
  function _delivered(j) { return !!(j && j.ok && !j.in_progress); }
  function _isInProgress(j) { return !!(j && j.in_progress); }

  function _postReply(it) {
    var sendPub = it._sendPub !== false;
    var auth = window.authHeader ? window.authHeader() : {};
    return window.apiFetch(window.apiUrl('/instagram/comment-reply'), {
      method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth),
      body: JSON.stringify({
        comment_id: it.commentId, public_text: sendPub ? _displayPublic(it) : '', dm_text: '',
        send_public: sendPub, send_dm: false, media_id: it.mediaId, intent: it.intent,
        edited: !!it._override, question: it.text,
      }),
    }).then(function (r) { return r.json().catch(function () { return {}; }); });
  }

  /* [2026-08-15] 묶음 답장 — 같은 사진에 같은 종류 문의가 여러 개면 한 번에 보낸다.
     각자 자기 초안을 보낸다(원장이 하나만 고쳤어도 그 수정본이 그대로 나감). 같은 문구를 복제하지 않는다.
     안전장치: ① _batchBusy 로 연타 차단 ② 버튼 즉시 비활성 ③ **순차 발송**(병렬로 쏘면 인스타 쪽에서
     레이트리밋·중복 위험) ④ 재시도 없음 ⑤ 낙관적 제거는 silent 로 모아서 마지막에 한 번만 렌더. */
  var _batchBusy = false;
  var _igWaitTries = 0;    // 인스타 상태 도착 대기 재시도 횟수(무한루프 방지)
  function _sendBatch(ids, btn) {
    if (_batchBusy) return;
    var list = ids.map(function (id) { return ITEMS.find(function (x) { return x.id === id; }); })
      .filter(function (it) { return it && it._sendPub !== false; });
    if (!list.length) return;
    _batchBusy = true;
    if (btn) { btn.disabled = true; btn.style.opacity = '.6'; btn.textContent = '보내는 중…'; }
    var el = document.getElementById(ID);
    list.forEach(function (it) { if (it._editing && el) { _captureEdit(el, it); it._editing = false; } });
    var real = list.filter(function (it) { return it._real && it.commentId && window.apiFetch; });
    list.forEach(function (it) { _removeItem(it.id, true); });   // 렌더는 끝나고 한 번만
    if (!real.length) { _batchBusy = false; _render(); return; }
    var ok = 0, fail = 0, pending = 0;
    real.reduce(function (chain, it) {
      return chain.then(function () {
        return _postReply(it)
          .then(function (j) {
            if (_delivered(j)) { ok += 1; return; }
            if (_isInProgress(j)) { pending += 1; _restoreItem(it); return; }
            fail += 1;
          })
          .catch(function () { fail += 1; });
      });
    }, Promise.resolve()).then(function () {
      _batchBusy = false;
      _render();
      var _msg = ok + '건 답장 보냈어요';
      if (fail) _msg = ok + '건 보냈고 ' + fail + '건은 실패했어요';
      if (pending) _msg += (fail ? ' · ' : ', ') + pending + '건은 다른 기기에서 보내는 중';
      _toast(_msg);
    });
  }

  // 실제 인스타 댓글 로드 — 연동+권한 있으면 문의 댓글로 큐 교체, 아니면 시드 유지.
  function _loadReal(silent) {
    var ig = window.WorkspaceAdapter && window.WorkspaceAdapter.instagram ? window.WorkspaceAdapter.instagram() : null;
    var connected = ig ? ig.connected : false;
    /* [2026-08-15 실계정 실측] 인스타 상태가 **아직 안 온** 상태에서 큐를 열면 여기서 시드로 떨어졌다.
       원장님 화면엔 진짜 댓글 대신 가짜 손님(민지·유나·수)이 진짜처럼 떠 있고, 30초 폴링이 돌아야
       바뀐다. 실제로 실계정에서 예시 3건이 떠 있는 걸 봤다 — 본인이 단 댓글은 안 보이는데
       모르는 사람 댓글이 3개 있는 셈이라 "이게 뭐야" 가 된다.
       상태를 아직 모를 때(ig 자체가 없음)와 진짜로 연동 안 된 때(ig.connected === false)는 다르다.
       모를 때는 시드로 단정하지 말고 로딩을 띄운 뒤 곧 다시 시도한다. */
    if (!ig && window.apiFetch) {
      // ⚠️ 재시도 전에 _loading 을 내려야 한다 — 아래 `if (_loading) return;` 가드에 막혀
      //    상태가 도착해도 영영 안 불러온다(실측: 10초 내내 로딩만 돌았다).
      if (!silent) {
        _loading = true; _render();
        if (_igWaitTries < 12) {          // 최대 ~15초. 그 뒤엔 아래 정상 분기(연동 안 됨)로 흘린다.
          _igWaitTries += 1;
          setTimeout(function () { _loading = false; _loadReal(false); }, 1200);
          return;
        }
        _loading = false;                 // 오래 기다려도 안 오면 '연동 안 됨' 으로 처리
      } else {
        return;
      }
    }
    if (!connected || !window.apiFetch) {
      _realMode = false;
      if (!silent) { ITEMS = []; _state = 'NOT_CONNECTED'; }
      return;
    }
    if (_loading) return;                 // 이미 불러오는 중이면 폴링 중복 방지
    if (!silent) { _loading = true; _state = 'LOADING'; _render(); }   // silent(자동갱신)면 스켈레톤 안 띄움
    var auth = window.authHeader ? window.authHeader() : {};
    window.apiFetch(window.apiUrl('/instagram/comment-queue'), { headers: auth })
      .then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json().catch(function () { return {}; });
      })
      .then(function (j) {
        _loading = false;
        _igWaitTries = 0;
        _weekReplied = (j && j.week_replied) || 0;
        _realMode = true;

        /* [2026-09-01 CMT-P1-003] 상태를 분리한다. 예전엔 여기서 items.length 만 보고
           0 건이면 예시로 떨어뜨렸다 — 권한이 없어 못 읽은 것도, 진짜로 문의가 없는 것도
           똑같이 가짜 손님 3명으로 보였다. */
        if (j && j.connected === false) { ITEMS = []; _state = 'NOT_CONNECTED'; return; }
        if (j && j.disabled) { ITEMS = []; _state = 'DISABLED'; return; }
        if (j && j.permission_error) { ITEMS = []; _state = 'PERMISSION'; return; }

        var arr = (j && j.items) || [];
        ITEMS = arr.map(_mapReal).filter(function (x) { return !_isHidden(x); });
        _state = ITEMS.length ? 'DATA' : 'EMPTY';
      })
      .catch(function () {
        _loading = false;
        /* 자동갱신(silent) 중 한 번 실패했다고 화면을 오류로 갈아엎지 않는다 —
           원장이 답장 쓰는 중에 목록이 사라지면 그게 더 나쁘다. 다음 폴링에서 다시 시도한다. */
        if (!silent) { ITEMS = []; _state = 'NETWORK'; }
      })
      .then(function () { if (_view === 'queue') _render(); });
  }

  // [자동갱신] 큐가 열려 있고 목록 화면일 때만 30초마다 조용히 새 댓글을 당겨온다.
  function _startPoll() {
    _stopPoll();
    _pollTimer = setInterval(function () {
      var el = document.getElementById(ID);
      if (!el || el.getAttribute('aria-hidden') === 'true') { _stopPoll(); return; }   // 닫혔으면 정지
      if (_view !== 'queue') return;                 // 설정 화면에선 재렌더 안 함(입력 포커스 보호)
      _loadReal(true);
    }, 30000);
  }
  function _stopPoll() { if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; } }
  // [2026-09-01 SESS-1] 세션 만료 → 폴링 정지 (잠금화면 아래에서 계속 도는 것 차단)
  document.addEventListener('itdasy:auth-expired', _stopPoll);

  function openCommentReplyQueue() {
    if (window.ITDASY_IG_COMMENT_REPLY === false) { _toast('댓글 응대는 준비 중이에요'); return; }
    var el = _ensureMounted();
    _settings = _loadSettings();   // 열 때 최신 저장값 반영(방해금지 배너·필터가 stale 안 되게)
    _view = 'queue'; _sort = 'new';
    ITEMS = []; _realMode = false; _loading = false; _state = 'LOADING';
    _render();
    // [2026-07-22 보스] 서버에 보관된 설정 내려받기 — 폰을 바꾸거나 캐시를 지운 뒤 첫 진입에서
    //   설정이 초기화된 것처럼 보이던 걸 막는다. 실패/빈 값이면 로컬 설정 그대로(덮어쓰지 않음).
    _pullSettingsFromServer().then(function (changed) { if (changed) _render(); });
    _loadReal();   // 연동됐으면 실댓글로 교체(비동기)
    _startPoll();  // [자동갱신] 열려 있는 동안 30초마다 새 댓글 반영
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    if (window._registerSheet) window._registerSheet('crq', closeCommentReplyQueue);
    if (window._markSheetOpen) window._markSheetOpen('crq');
  }
  function closeCommentReplyQueue() {
    _stopPoll();        // [자동갱신] 닫으면 폴링 정지
    _closePeek(true);   // history 는 아래 _markSheetClosed('crq') 가 자식 것까지 한 번에 정리
    var el = document.getElementById(ID);
    if (!el) return;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    if (window._markSheetClosed) window._markSheetClosed('crq');
  }

  /* [2026-09-03] 큐를 닫고 **다음 화면으로 넘어갈 때**는 history 가 착지할 때까지 기다린다.

     안 기다리면 뒤로가기가 죽는다. 실측(375px):
       [고객 보기] → 고객 화면은 열리는데 주소의 `#customers` 가 **사라지고**,
       그 뒤 뒤로가기가 아예 안 먹는다(스택엔 'customers' 가 남아 있는데 hash 는 비어 있어
       popstate 매칭이 실패한다).

     원인은 `closeCommentReplyQueue()` 안의 `history.back()` 이 **비동기**라는 것.
     닫자마자 다음 줄에서 화면을 열면, 그쪽이 `pushState('#customers')` 를 한 *뒤에*
     큐의 popstate 가 도착해서 그걸 되돌려 버린다.

     app-core 가 이미 같은 사고를 겪고 `__afterHistorySettles` 를 만들어 뒀다
     (잇비 → "고객 화면 열기" 건, 2026-08-18). 그걸 쓴다. */
  function _goAfterClose(open) {
    closeCommentReplyQueue();
    if (typeof window.__afterHistorySettles === 'function') window.__afterHistorySettles(open);
    else setTimeout(open, 0);   // 구버전 app-core 폴백 — 동기 호출보다는 낫다
  }

  window.openCommentReplyQueue = openCommentReplyQueue;
  window.closeCommentReplyQueue = closeCommentReplyQueue;
  // [2026-07-21] 홈 넛지 뮤트용 — 방해금지 켜짐 + 지금 운영시간 밖이면 true. (설정은 항상 최신 localStorage 반영)
  window.crqQuietNow = function () { try { _settings = _loadSettings(); return _isQuietNow(); } catch (_e) { return false; } };

  // [dev] ?crq=1 이면 우측하단 테스트 진입 버튼(로그인 후 탭). 실배포 진입점은 연동 허브에 별도 연결 예정.
  try {
    var _crqDev = false;
    try {
      if (/[?&]crq=1/.test(location.search)) { localStorage.setItem('itdasy_crq', '1'); _crqDev = true; }
      else { _crqDev = localStorage.getItem('itdasy_crq') === '1'; }
    } catch (_ls) { _crqDev = /[?&]crq=1/.test(location.search); }
    if (_crqDev) {
      var _mountBtn = function () {
        if (document.getElementById('crqDevBtn')) return;
        var b = document.createElement('button');
        b.id = 'crqDevBtn';
        b.type = 'button';
        b.textContent = '댓글 응대(테스트)';
        b.style.cssText = 'position:fixed;right:16px;bottom:calc(80px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));z-index:9000;background:#191F28;color:#fff;border:none;border-radius:22px;padding:12px 18px;font-size:13px;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.2);cursor:pointer;';
        b.addEventListener('click', openCommentReplyQueue);
        document.body.appendChild(b);
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _mountBtn);
      else _mountBtn();
    }
  } catch (_e) { void _e; }
})();
