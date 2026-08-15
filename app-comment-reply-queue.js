/* ───────────────────────────────────────────────────────────
   app-comment-reply-queue.js — 인스타 댓글 문의 응대 큐 (스캐폴딩)
   2026-07-10 신규 · 브랜치 feat/ig-comment-reply

   목적: "모든 댓글" 아니라 가격·예약·위치 문의 댓글만 골라 대댓글 + DM 퍼널.
   디자인: app-dm-confirm-queue.js 와 동일 언어(카드 r18·버블 #F2F4F6 꼬리·CTA #191F28·로즈 #BC6675).
   지금 단계: 백엔드 실연동은 Meta manage_comments 심사 전이라 SEED 데이터로 UI/동작만 검증.
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

  // ── 시드 데이터 (실연동 전 UI 검증용) — 백엔드 붙으면 GET /instagram/comment-queue 로 교체 ──
  var SEED = [
    { id: 'c1', name: '@minji_nail', av: '민', intent: 'price', media: '내 속눈썹 게시물에 달린 댓글', likes: 12, waiting: 0,
      text: '여기 속눈썹 얼마예요? 예약도 되나요?',
      publicDraft: '문의 감사해요! 자세한 내용 DM으로 보내드렸어요, 편하게 봐주세요',
      dmDraft: '속눈썹 벨벳 5만원이에요. 예약은 여기서 → naver.me/xxxx' },
    { id: 'c2', name: '@yuna_daily', av: '유', intent: 'booking', media: '내 젤네일 게시물에 달린 댓글', likes: 3, waiting: 8,
      text: '이거 예약 어디서 해요?? 이번주 토요일 가능한가요',
      publicDraft: '예약 도와드릴게요, DM 확인해 주세요',
      dmDraft: '토요일 오후 2시·4시 자리 있어요. 예약 링크 → naver.me/xxxx' },
    { id: 'c3', name: '@soo_beauty', av: '수', intent: 'location', media: '내 왁싱 게시물에 달린 댓글', likes: 1, waiting: 21,
      text: '위치가 어디예요? 주차 되나요?',
      publicDraft: '위치·오시는 길 DM으로 보냈어요',
      dmDraft: '서울 강남구 테헤란로 12길 34, 5층이에요. 건물 주차 2시간 무료!' }
  ];

  var ITEMS = SEED.slice();   // 렌더 대상 — 실연동 성공 시 실댓글로 교체

  // [무시 영속화] 무시한 댓글 id 를 localStorage 에 남긴다. 예전엔 _removeItem 이 ITEMS.splice 만 해서
  //   큐를 다시 열거나 자동갱신(_loadReal)하면 백엔드가 그 댓글을 다시 실어와 되살아났다(백엔드는
  //   '답장한 댓글'만 제외하지 '무시한 댓글' 개념이 없음). 이제 id 를 저장해 표시 단계에서 영구 제외.
  var _HIDDEN_KEY = 'itdasy:crq_hidden';
  var _hidden = (function () {
    try { var a = JSON.parse(localStorage.getItem(_HIDDEN_KEY) || '[]'); var m = {};
      if (Array.isArray(a)) a.forEach(function (id) { m[id] = 1; }); return m; }
    catch (_e) { return {}; }
  })();
  function _markHidden(id) {
    if (!id) return; _hidden[id] = 1;
    try { localStorage.setItem(_HIDDEN_KEY, JSON.stringify(Object.keys(_hidden))); } catch (_e) { void _e; }
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
    var def = { enabled: true,
      intents: { price: true, booking: true, location: true, hours: false, service: true, duration: true, event: true, membership: true },
      link: '', emoji: '😊',
      active_hours: { start: '09:00', end: '21:00' }, quiet_outside: true,
      exclude_words: '' };
    try {
      var s = JSON.parse(localStorage.getItem('itdasy:crq_settings') || 'null');
      if (!s) return def;
      var ah = (s.active_hours && typeof s.active_hours === 'object') ? s.active_hours : {};
      return { enabled: s.enabled !== false, link: s.link || '', emoji: (s.emoji != null ? s.emoji : '😊'),
        intents: Object.assign({}, def.intents, s.intents || {}),
        active_hours: { start: ah.start || '09:00', end: ah.end || '21:00' },
        quiet_outside: s.quiet_outside !== false,
        exclude_words: String(s.exclude_words || '') };
    } catch (_e) { return def; }
  }
  /* 제외 단어 — 쉼표/줄바꿈으로 나눈 목록. 빈 항목은 버린다(빈 문자열이 남으면 전부 매칭돼 큐가 통째로 빈다). */
  function _excludeList() {
    return String(_settings.exclude_words || '').split(/[,\n]/)
      .map(function (w) { return w.trim().toLowerCase(); }).filter(Boolean);
  }
  function _isExcluded(it) {
    var words = _excludeList();
    if (!words.length) return false;
    var hay = String((it && it.text) || '').toLowerCase();
    return words.some(function (w) { return hay.indexOf(w) >= 0; });
  }
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
  function _pushSettingsToServer() {
    if (!window.apiFetch || !window.authHeader || !window.apiUrl) return Promise.resolve(false);
    if (_srvSaving) return Promise.resolve(false);
    _srvSaving = true;
    var h = window.authHeader() || {};
    if (!h.Authorization) { _srvSaving = false; return Promise.resolve(false); }
    h['Content-Type'] = 'application/json';
    return window.apiFetch(window.apiUrl('/instagram/comment-reply-settings'), {
      method: 'PUT', headers: h, body: JSON.stringify({ settings: _settings }),
    }).then(function (r) { return !!(r && r.ok); })
      .catch(function () { return false; })
      .then(function (ok) { _srvSaving = false; return ok; });
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
    var lk = el.querySelector('.crq-link'); if (lk) _settings.link = (lk.value || '').trim();
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
  function _finalPublic(it) {
    var p = it.publicDraft || '';
    var e = _settings.emoji;
    if (e && p.indexOf(e) < 0) p = p.replace(/\s*$/, '') + ' ' + e;
    return p;
  }
  function _finalDm(it) {
    var d = it.dmDraft || '';
    // 댓글 설정 링크가 없으면 샵 설정에 이미 저장된 예약 링크(itdasy:shop_book) 자동 재사용
    //  → 원장이 댓글 설정 안 건드려도 DM에 실제 예약 링크가 박혀 바로 예약 가능(가만히 있어도 예약).
    var l = _settings.link || _shop('book', '');
    if (l && d.indexOf('http') < 0 && d.indexOf(l) < 0) d = d + '\n예약 → ' + l;
    return d;
  }

  // 샵 설정값(작업실 설정과 공유하는 itdasy:shop_* 키) — DM 상세에 사용
  function _shop(k, fb) { try { return localStorage.getItem('itdasy:shop_' + k) || fb || ''; } catch (_e) { return fb || ''; } }

  // 의도별 답장 초안 (공개 답글만, 샵설정 반영)
  // [2026-07-23] 공개 초안에서 DM 언급을 전부 뺐다. 이 화면은 DM 을 안 보내는데(발송 주체는
  //   DM 엔진 하나 — 2026-07-22 정책) 초안은 "DM으로 보내드렸어요" 라고 적혀 있었다. 그러면
  //   백엔드 nodm_public 방어가 발송 직전에 문구를 갈아끼워서, 원장이 화면에서 보고 승인한
  //   문장과 실제로 피드에 달리는 문장이 달랐다. 화면 = 실제여야 한다.
  //   dmDraft 는 발송에 안 쓰이지만(항상 dm_text:''), 서버 초안이 없을 때 카드 미리보기가
  //   참조하므로 남겨둔다.
  function _drafts(intent) {
    var book = _shop('book', ''), addr = _shop('addr', _shop('location', '')), hours = _shop('hours', ''), phone = _shop('phone', '');
    var link = book ? ('\n예약은 여기서 → ' + book) : (phone ? ('\n예약 문의 → ' + phone) : '');
    if (intent === 'price') return { publicDraft: '문의 감사해요! 원하시는 시술 알려주시면 가격 안내드릴게요', dmDraft: '가격 안내드릴게요' + link };
    if (intent === 'booking') return { publicDraft: '예약 문의 감사해요! 원하시는 날짜·시술 남겨주시면 확인하고 도와드릴게요', dmDraft: '예약 도와드릴게요!' + link };
    if (intent === 'location') return { publicDraft: '찾아와 주셔서 감사해요! 위치·오시는 길 안내드릴게요', dmDraft: (addr || '위치 안내드릴게요') + (book ? ('\n예약 → ' + book) : '') };
    if (intent === 'hours') return { publicDraft: '문의 감사해요! 영업시간 안내드릴게요', dmDraft: (hours ? ('영업시간: ' + hours) : '영업시간 안내드릴게요') + (book ? ('\n예약 → ' + book) : '') };
    // [2026-07-21] 신규 인텐트 폴백 초안 (서버 페르소나 초안 없을 때만)
    if (intent === 'duration') return { publicDraft: '문의 감사해요! 시술 소요시간·지속력 안내드릴게요', dmDraft: '시술 소요시간·지속력 안내드릴게요' + link };
    if (intent === 'event') return { publicDraft: '관심 감사해요! 진행 중인 이벤트 안내드릴게요', dmDraft: '진행 중인 이벤트 안내드릴게요' + link };
    if (intent === 'membership') return { publicDraft: '문의 감사해요! 회원권·정기권 안내드릴게요', dmDraft: '회원권·정기권 안내드릴게요' + link };
    // 건강여부(eligibility): 절대 '가능하다' 단정 금지 — 상태 확인 후 상담 유도 (사람이 검토·발송)
    if (intent === 'eligibility') return { publicDraft: '문의 감사해요! 상태에 따라 달라서 확인이 필요해요, 편하게 알려주시면 상담 도와드릴게요', dmDraft: '상태에 따라 시술 가능 여부가 달라서요, 편하게 자세히 알려주시면 상담 도와드릴게요' + (phone ? ('\n상담 문의 → ' + phone) : '') };
    return { publicDraft: '문의 감사해요! 어떤 점이 궁금하신지 알려주시면 안내드릴게요', dmDraft: '문의 주셔서 감사해요' + (book ? ('\n예약 → ' + book) : '') };
  }

  // 실 API 아이템 → 렌더 형식. 서버 페르소나 초안(public_draft/dm_draft) 우선, 없으면 템플릿 폴백.
  function _mapReal(it) {
    var d = _drafts(it.intent);
    return { id: it.comment_id, commentId: it.comment_id, mediaId: it.media_id || '', name: it.username ? ('@' + it.username) : '손님',
      av: (it.username || '?').slice(0, 1), pic: it.profile_pic || '', intent: it.intent,   // pic = BE 프사 매칭(대기)
      media: it.media_caption || '게시물',
      mediaFull: it.media_caption_full || it.media_caption || '',   // 팝업용 캡션 전문 (BE 필드 추가 대기 — 없으면 요약)
      mediaDate: it.media_timestamp || '',                          // 팝업용 발행일 (BE 필드 추가 대기)
      permalink: it.permalink || '', likes: it.like_count || 0, ts: it.timestamp || '',
      waiting: 0, thumb: it.media_thumb || '', text: it.text || '', manual: !!it.manual, returning: !!it.returning, confidence: it.confidence || '',
      publicDraft: it.public_draft || d.publicDraft, dmDraft: it.dm_draft || d.dmDraft, _real: true };
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
  function _displayDm(it) { return (it._override && it._override.dm != null) ? it._override.dm : _finalDm(it); }

  // [v787] 채널 라벨줄 공통 — 아이콘+라벨(13px) 좌, 토글 우측 끝(margin-left:auto → 세로선 정렬)
  function _chRow(icon, label, on, kind, id, badges) {
    return '<div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;">' +
      '<span style="font-size:13px;color:#8B95A1;font-weight:600;display:inline-flex;align-items:center;gap:4px;">' + icon + label + '</span>' +
      (badges || '') + _tgHtml(on, kind, id) + '</div>';
  }

  function _cardHtml(it) {
    var pubOn = it._sendPub !== false, dmOn = it._sendDm !== false;
    var dmText = _displayDm(it);
    // [v787] 게시물 인용 스트립 — 카드 안, 탭=미리보기 팝업 (기존 crq-chip 핸들러 재사용)
    var dstr = it.mediaDate ? _peekDate(it.mediaDate) : '';
    var strip = '<button class="crq-chip" data-id="' + _esc(it.id) + '" style="width:100%;display:flex;align-items:center;gap:10px;background:#F7F8FA;border:none;border-radius:13px;padding:8px;margin-bottom:11px;cursor:pointer;font-family:inherit;text-align:left;">' +
      (it.thumb
        ? '<span style="width:52px;height:52px;flex-shrink:0;border-radius:10px;background:#E5E8EB center/cover no-repeat;background-image:url(' + _esc(it.thumb) + ');"></span>'
        : '<span style="width:52px;height:52px;flex-shrink:0;border-radius:10px;background:#E5E8EB;display:inline-flex;align-items:center;justify-content:center;color:#B0B8C1;">' + IC.camera + '</span>') +
      '<span style="flex:1;min-width:0;font-size:13px;font-weight:600;color:#6B7684;">이 게시물에 달린 댓글' + (dstr ? '<span style="color:#B0B8C1;font-weight:500;"> · ' + dstr + '</span>' : '') + '</span>' +
      '<span style="color:#B0B8C1;font-size:13px;flex-shrink:0;">›</span></button>';
    // 공개 답글 — 라벨줄(토글 우측 끝) + 말풍선 or 꺼짐 안내
    var pubBadges = (it.manual ? '<span style="font-size:10px;font-weight:700;color:#0F766E;background:#E7F6EF;border-radius:7px;padding:1px 6px;">내 멘트</span>' : '') +
      (it._override ? '<span style="font-size:10px;font-weight:700;color:#BC6675;background:#F7EFF0;border-radius:7px;padding:1px 6px;">수정함</span>' : '');
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
            (it.returning ? '<span style="font-size:10px;font-weight:700;color:#0F766E;background:#E7F6EF;border-radius:8px;padding:2px 7px;">단골</span>' : '') + '</div>' +
          '<div style="font-size:13px;color:#8B95A1;margin-top:1px;">' + _ago(it) + '</div>' +
        '</div>' +
      '</div>' + strip +
      // 손님 댓글 원문
      '<div style="background:#fff;border:.5px solid #E5E8EB;color:#191F28;border-radius:13px;border-top-left-radius:4px;padding:11px 13px;font-size:15px;line-height:1.55;white-space:pre-wrap;word-break:break-word;margin-bottom:12px;">' + _esc(it.text) + '</div>' +
      // 잇비 추천 답장 — 편집 중이면 텍스트영역, 아니면 토글형 답글/DM
      (it._editing
        ? _editArea(IC.comment, '공개 답글', 'crq-edit-pub', it.id, _displayPublic(it)) + '<div style="height:9px;"></div>' + _editArea(IC.mail, '비공개 DM', 'crq-edit-dm', it.id, dmText)
        : pubHtml + dmHtml) +
      // 액션
      '<div style="display:flex;gap:8px;margin-top:13px;align-items:center;">' +
        '<button class="crq-send" data-id="' + _esc(it.id) + '"' + (sendOff ? ' disabled' : '') + ' style="flex:1;padding:12px;border:none;background:' + (sendOff ? '#E5E8EB' : '#191F28') + ';color:' + (sendOff ? '#8B95A1' : '#fff') + ';font-weight:700;font-size:15px;border-radius:13px;cursor:' + (sendOff ? 'default' : 'pointer') + ';display:flex;align-items:center;justify-content:center;gap:5px;">' + (sendOff ? '' : IC.send) + sendLabel + '</button>' +
        '<button class="crq-edit" data-id="' + _esc(it.id) + '" style="padding:12px 14px;border:1px solid ' + (it._editing ? '#BC6675' : '#E5E8EB') + ';background:#fff;color:' + (it._editing ? '#BC6675' : '#191F28') + ';font-weight:600;font-size:15px;border-radius:13px;cursor:pointer;">' + (it._editing ? '완료' : '수정') + '</button>' +
        '<button class="crq-discard" data-id="' + _esc(it.id) + '" style="padding:12px 6px;border:none;background:none;color:#8B95A1;font-weight:600;font-size:13px;cursor:pointer;">무시</button>' +
      '</div>' +
    '</div>';
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
  function _statRow(count) {
    return '<div style="display:flex;align-items:center;gap:7px;margin-bottom:13px;padding:2px 2px 0;">' +
      '<span style="width:6px;height:6px;border-radius:50%;flex-shrink:0;background:#16B55E;"></span>' +
      '<span style="font-size:15px;color:#191F28;"><b>대기 ' + count + '건</b>' +
        (_weekReplied > 0 ? '<span style="color:#8B95A1;font-weight:400;"> · 이번 주 ' + _weekReplied + '건 응대</span>' : '') + '</span>' +
      '<button class="crq-sort" style="margin-left:auto;flex-shrink:0;display:inline-flex;align-items:center;gap:4px;background:none;border:none;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;color:#6B7684;padding:4px 2px;">' +
        IC.sort + (_sort === 'old' ? '오래된순' : '최신순') + '</button></div>';
  }

  function _banner(bg, brd, fg, msg) {
    return '<div style="display:flex;align-items:flex-start;gap:8px;background:' + bg + ';border:.5px solid ' + brd + ';border-radius:12px;padding:10px 12px;margin-bottom:12px;">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + fg + '" stroke-width="2" stroke-linecap="round" style="flex-shrink:0;margin-top:1px;" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>' +
      '<span style="font-size:11.5px;color:' + fg + ';line-height:1.5;">' + msg + '</span></div>';
  }
  function _demoBanner() {
    if (_loading) return _banner('#F2F4F6', '#E5E8EB', '#4E5968', '실제 인스타 댓글을 불러오는 중…');
    return _banner('#FFF7ED', '#FED7AA', '#9A3412', '지금 보이는 댓글은 <b>예시</b>예요. 실제 댓글을 불러오려면 <b>인스타 연동 + 댓글 권한</b>이 필요해요. (연동돼도 문의 댓글이 없으면 예시가 보여요)');
  }
  // [v787] 정렬 기준 시각 — 실데이터 timestamp, 시드는 waiting(분) 역산
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
  function _queueBody() {
    if (_loading) {
      return _banner('#F2F4F6', '#E5E8EB', '#4E5968', '인스타에서 문의 댓글을 모으는 중이에요… (처음엔 10초쯤 걸려요)') +
        _skeletonHtml();
    }
    var items = ITEMS.filter(function (it) { return !_isHidden(it); })   // [무시 영속화] 무시한 댓글 영구 제외
      .filter(function (it) { return _settings.intents[it.intent] !== false; })   // 설정에서 끈 의도 제외
      .filter(function (it) { return !_isExcluded(it); })   // [2026-07-22] 제외 단어(협찬·광고 등) 걸러내기
      .slice().sort(function (a, b) {
        var ca = a.intent === 'complaint' ? 1 : 0, cb = b.intent === 'complaint' ? 1 : 0;
        if (ca !== cb) return cb - ca;                                    // 불만 항상 최상단
        return _sort === 'old' ? _ord(a) - _ord(b) : _ord(b) - _ord(a);   // 그 외 시간순
      });
    var cards = items.length ? items.map(_cardHtml).join('') :
      '<div style="text-align:center;color:#C9CDD4;font-size:13px;padding:40px 0;">응대할 문의 댓글이 없어요</div>';
    // [2026-07-21] 운영시간 밖 + 방해금지 → 조용히 모아뒀다는 안내 (발송은 언제든 가능)
    var quietBar = _isQuietNow()
      ? '<div style="display:flex;align-items:center;gap:7px;background:#F2F4F6;border-radius:12px;padding:10px 12px;margin-bottom:12px;font-size:13px;color:#6B7684;">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8B95A1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>' +
        '<span>지금은 응답 시간대 밖이에요 · 조용히 모아뒀어요<span style="color:#B0B8C1;"> (발송은 언제든 가능)</span></span></div>'
      : '';
    var top = _realMode ? (quietBar + _statRow(items.length)) : (_demoBanner() + quietBar + _statRow(items.length));
    return top + cards +
      '<div style="font-size:11px;color:#C9CDD4;text-align:center;margin-top:12px;">애매한 댓글은 큐에 안 올라와요 · 확실한 문의만</div>';
  }

  function _settingsBody() {
    // 단일 진실원 — 열 때 최신 enabled 반영(목록 ai-hub 와 같은 저장 키). [v789] 여기서도 끄고 켬.
    try { var _f = JSON.parse(localStorage.getItem('itdasy:crq_settings') || 'null'); if (_f) _settings.enabled = _f.enabled !== false; } catch (_e) { void _e; }
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
      // 예약 링크
      '<div style="' + CARD + '"><div style="' + TITLE + 'margin-bottom:4px;">예약 링크</div>' +
        '<div style="' + SUB + 'margin-bottom:12px;">DM 답장 끝에 자동으로 붙어요</div>' +
        '<input class="crq-link" type="text" value="' + _esc(S.link) + '" placeholder="예) naver.me/xxxx" ' +
          'style="width:100%;padding:13px 14px;border:none;border-radius:14px;font-size:15px;background:#F7F8FA;color:#191F28;box-sizing:border-box;font-family:inherit;" /></div>' +
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
        '<button type="button" class="ss-back" data-crq-back aria-label="뒤로"><svg width="14" height="14" aria-hidden="true"><use href="#ic-chevron-left"/></svg></button>' +
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
        if (sc.classList.contains('crq-master')) { _settings.enabled = !_settings.enabled; }
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
      if (t.classList.contains('crq-discard')) { _haptic(); _removeItem(id); _toast('이 댓글은 응대하지 않아요'); return; }
    });
    // [v789] 예약 링크 즉시 저장 — 입력 마치고 포커스 빠질 때(change 는 버블됨)
    el.addEventListener('change', function (e) {
      if (!e.target || !e.target.classList) return;
      if (e.target.classList.contains('crq-link')
          || e.target.classList.contains('crq-time')          // [2026-07-21] 응답 시간대
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
  function _removeItem(id) {
    _markHidden(id);   // [무시 영속화] 이 기기 즉시 반영 (오프라인·즉답)
    var i = ITEMS.findIndex(function (x) { return x.id === id; });
    var it = i >= 0 ? ITEMS[i] : null;
    if (it && it._real) _pushDismissToServer(it);   // [무시 영속화] 서버에도 → 배지·다른기기 동기화
    if (i >= 0) ITEMS.splice(i, 1);
    _render();
  }
  // 편집 중인 텍스트영역 값을 아이템 override로 캡처
  function _captureEdit(el, it) {
    var pta = el.querySelector('.crq-edit-pub[data-id="' + it.id + '"]');
    var dta = el.querySelector('.crq-edit-dm[data-id="' + it.id + '"]');
    if (pta || dta) it._override = { pub: pta ? pta.value : _displayPublic(it), dm: dta ? dta.value : _displayDm(it) };
  }
  function _sendReply(id) {
    var it = ITEMS.find(function (x) { return x.id === id; });
    if (!it) return;
    // [2026-07-22 보스] DM 발송 주체 단일화 — 댓글 응대에서는 DM 을 절대 보내지 않는다.
    //   send_dm:false 를 명시하면 백엔드가 공개답글 문구의 "DM 드렸어요" 약속도 nodm_public 로 갈아끼운다
    //   (거짓 약속 방지). 실제 DM 은 손님이 보내온 뒤 DM 자동응답 엔진이 처리한다.
    var sendPub = it._sendPub !== false, sendDm = false;
    if (!sendPub) return;   // 보낼 게 없음 → CTA 비활성 (안전망)
    var el = document.getElementById(ID);
    if (it._editing && el) { _captureEdit(el, it); it._editing = false; }   // 편집 중 발송 → 편집값 반영
    var pubText = sendPub ? _displayPublic(it) : '', dmText = '';
    var okMsg = '공개답글 달림';
    if (it._real && it.commentId && window.apiFetch) {
      // 실제 인스타: 켠 채널만 발송 (끈 채널은 텍스트 '' + 플래그 false)
      _removeItem(id);
      _toast('보내는 중…');
      var auth = window.authHeader ? window.authHeader() : {};
      window.apiFetch(window.apiUrl('/instagram/comment-reply'), {
        method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth),
        body: JSON.stringify({ comment_id: it.commentId, public_text: pubText, dm_text: dmText, send_public: sendPub, send_dm: sendDm, media_id: it.mediaId, intent: it.intent, edited: !!it._override, question: it.text })
      }).then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (j) { _toast(j && j.ok ? (okMsg + ' (' + it.name + ')') : ('일부 실패 — ' + JSON.stringify((j && (j.public || j.dm)) || j).slice(0, 80))); })
        .catch(function () { _toast('발송 실패 — 다시 시도해 주세요'); });
      return;
    }
    // 시드(예시): 목업 발송
    _removeItem(id);
    _toast(okMsg + ' (' + it.name + ') · 예시');
  }

  // 실제 인스타 댓글 로드 — 연동+권한 있으면 문의 댓글로 큐 교체, 아니면 시드 유지.
  function _loadReal(silent) {
    var ig = window.WorkspaceAdapter && window.WorkspaceAdapter.instagram ? window.WorkspaceAdapter.instagram() : null;
    var connected = ig ? ig.connected : false;
    if (!connected || !window.apiFetch) { _realMode = false; if (!silent) ITEMS = SEED.slice(); return; }
    if (_loading) return;                 // 이미 불러오는 중이면 폴링 중복 방지
    if (!silent) { _loading = true; _render(); }   // silent(자동갱신)면 스켈레톤 안 띄움
    var auth = window.authHeader ? window.authHeader() : {};
    window.apiFetch(window.apiUrl('/instagram/comment-queue'), { headers: auth })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (j) {
        _loading = false;
        _weekReplied = (j && j.week_replied) || 0;
        var arr = (j && j.items) || [];
        if (arr.length) {
          ITEMS = arr.map(_mapReal).filter(function (x) { return !_isHidden(x); });   // [무시 영속화]
          _realMode = true;
        } else if (silent) {
          if (_realMode) ITEMS = [];   // 실모드였는데 0건 = 다 처리됨 (자동갱신 중 데모로 깜빡이지 않게)
        } else {
          ITEMS = SEED.slice(); _realMode = false;   // 권한 없음/문의 댓글 0 → 시드 폴백
        }
      })
      .catch(function () { _loading = false; if (!silent) { ITEMS = SEED.slice(); _realMode = false; } })
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

  function openCommentReplyQueue() {
    if (window.ITDASY_IG_COMMENT_REPLY === false) { _toast('댓글 응대는 준비 중이에요'); return; }
    var el = _ensureMounted();
    _settings = _loadSettings();   // 열 때 최신 저장값 반영(방해금지 배너·필터가 stale 안 되게)
    _view = 'queue'; _sort = 'new';
    ITEMS = SEED.slice(); _realMode = false; _loading = false;
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
