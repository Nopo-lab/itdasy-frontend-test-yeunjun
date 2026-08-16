/* workspace-perf.js — 게시물별 성과 화면 (2026-07-14, 2026-07-15 학습화면으로 개편)
   작업실 홈 성과 버튼 → 여기. "어떻게 만든 게시물이 반응 좋았나"를 원장님이 알 수 있게 한다.
   숫자 나열이 목적이 아니다 — 다음 게시물을 어떻게 만들지 정하는 게 목적이다.

   데이터 4갈래:
   ① GET /instagram/insights      → 게시물별 좋아요·댓글·저장·도달 + 썸네일 (posts = 최근 25건)
   ② loadSlotsFromDB()            → 그 게시물을 만들 때 쓴 레이아웃·말투·사진 장수 — 발행 슬롯에 이미 있음
   ③ GET /bookings                → 예약. created_at(예약을 '잡은' 시각)으로 귀속. starts_at 아님.
   ④ GET /instagram/comment-queue → 게시물별 '아직 답 안 한' 문의 댓글 (가격·예약·위치 등)

   ①↔② 연결 열쇠 = slot.publish.igMediaId (발행 시 저장 — workspace-v2-flow.js).
   옛 슬롯엔 없어서 캡션 앞글자 + 발행시각 근접으로 폴백.

   귀속 규칙(정직하게): 예약 created_at 직전 7일 안에 올라온 '가장 최근' 게시물 1건에만 준다(last-touch).
     → 한 예약이 여러 게시물에 중복으로 안 잡힌다. 인스타는 유입 경로를 안 알려주므로 어디까지나 추정.
     단, 발행 시 고객연결(slot.customer_id)한 예약은 추정이 아니라 '확정'으로 표시.

   [2026-07-15] 표본 가드(MIN_POSTS): 1~2건으로 "이 레이아웃이 최고" 라고 단언하면 원장님이 그걸 믿고
     작업 방식을 바꾼다. 근거 없는 확신이 없느니만 못하므로 3건 미만은 순위를 안 매기고 그대로 말한다.

   DM 유입 귀속은 여전히 잠금 — 아래 LOCK 주석 참고.
   .subscreen-overlay + ss-* 재사용 → PC 사이드바 자동 안전. window.WorkspacePerf.open(). */
(function () {
  'use strict';

  var ID = 'wsPerfOverlay';
  var WINDOW_DAYS = 7;              // 발행 후 며칠까지 그 게시물 덕으로 볼지
  var DAY = 86400000;
  var MIN_POSTS = 3;                // 이 건수 미만이면 "먹혔다"고 말하지 않는다
  var ANALYZE_DAYS = 14;            // "무엇이 먹혔나" 분석 창 — 반년 전 글과 섞으면 요즘 감이 안 나온다
  var _lastReco = '';              // 마지막 추천 요약 — 새 글 만들 때 토스트로 들고 간다
  var _curRows = [];               // [v779] 현재 렌더된 rows — '이 스타일로 또'에서 카드 slot 되찾기용
  var LURK_MIN = 3;                // 저장+공유 이만큼인데 연락 0이면 '조용한 관심'(C5) 으로 본다

  // 말투 키 → 라벨. workspace-v2-flow.js _TONE_CHIPS 와 같은 집합.
  var TONE_LABEL = { friendly: '친근', professional: '전문', emotional: '감성', event: '이벤트', review: '후기', normal: '기본' };
  var PURPOSE_LABEL = { before_after: '전후', feed: '피드', review: '후기', event: '이벤트', story: '스토리', price: '가격표' };
  // 문의 댓글 intent → 라벨. instagram.py _classify_comment 와 같은 집합.
  var INTENT_LABEL = { price: '가격', booking: '예약', location: '위치', hours: '영업시간', service: '시술', complaint: '불만' };

  /* [2026-07-16 신뢰성 M9] window._esc 가 아직 로드 안 됐어도 반드시 이스케이프한다.
     캡션·유저네임·커스텀 레이아웃명이 innerHTML 로 들어가므로 폴백이 raw 면 XSS. 속성값용 따옴표도 포함. */
  function esc(v) {
    if (window._esc) return window._esc(v);
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function toast(m) { if (window.showToast) window.showToast(m); }
  function _num(v) { var n = Number(v); return isFinite(n) && n > 0 ? n : 0; }   // 지표 안전 강제: 문자열·NaN·음수 방어

  /** 조사 '으로/로' — 축 이름이 '레이아웃'(받침 ㅅ)·'말투'(받침 없음)로 섞여 있어 하드코딩하면 반드시 틀린다.
      한글 음절 종성이 없거나 ㄹ이면 '로', 그 외엔 '으로'. 한글이 아니면 안전하게 '으로'. */
  function _ro(word) {
    var s = String(word == null ? '' : word);
    var c = s.charCodeAt(s.length - 1) - 0xAC00;
    if (isNaN(c) || c < 0 || c > 11171) return '으로';
    var jong = c % 28;
    return (jong === 0 || jong === 8) ? '로' : '으로';
  }

  function _authGet(path) {
    var headers = window.authHeader ? window.authHeader() : {};
    if (!headers || !headers.Authorization) return Promise.reject(new Error('no-token'));
    var f = window.apiFetch ? window.apiFetch(path, { headers: headers })
      : fetch(((window.API || '') + path), { headers: headers });
    return Promise.resolve(f).then(function (r) {
      if (!r || !r.ok) throw new Error('HTTP ' + (r && r.status));
      return r.json();
    });
  }

  // ── 데이터 ────────────────────────────────────────────────
  function _loadInsights() {
    return _authGet('/instagram/insights').catch(function () { return { status: 'error', posts: [] }; });
  }

  function _loadSlots() {
    if (!window.loadSlotsFromDB) return Promise.resolve([]);
    return Promise.resolve(window.loadSlotsFromDB()).then(function (l) { return l || []; }).catch(function () { return []; });
  }

  // 예약은 starts_at 으로 필터되므로(라우터), 귀속에 쓰는 created_at 기준으로는 범위를 넓게 잡고
  //   클라이언트에서 created_at 으로 다시 거른다. 과거 예약 + 앞으로 잡힌 예약 모두 필요.
  function _loadBookings() {
    var from = new Date(Date.now() - 180 * DAY).toISOString();
    var to = new Date(Date.now() + 180 * DAY).toISOString();
    return _authGet('/bookings?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to))
      .then(function (j) { return (j && j.items) || []; })
      .catch(function () { return []; });
  }

  /** 문의 댓글 — 게시물별로 '아직 답 안 한' 것만 온다(서버가 CommentReplyLog 로 응대분을 뺌).
      스테이징은 INSTAGRAM_FULL_SCOPE=1 이라 켜져 있지만, 스코프 없는 토큰이면 permission_error 로 돈다.
      그 경우 조용히 없는 셈 치고(화면엔 안내만) 나머지는 그대로 그린다 — 성과 화면 전체가 죽으면 안 된다. */
  function _loadCommentQueue() {
    // [2026-07-15] media_limit(개수) → since_days(날짜). 예전엔 '최근 12개 게시물' 이라
    //   오늘 달린 댓글이라도 13번째 글이면 안 보였다. 분석 창과 같은 14일로 맞춘다.
    return _authGet('/instagram/comment-queue?since_days=' + ANALYZE_DAYS)
      .catch(function () { return { items: [], _failed: true }; });
  }

  /** 게시물별 '댓글 단 사람 중 DM 도 보낸 수'. 댓글 from.id == DM sender.id 동일인 조인(백엔드). */
  function _loadDmLinks() {
    return _authGet('/instagram/comment-dm-links').catch(function () { return { by_media: {} }; });
  }

  // ── 연결(조인) ────────────────────────────────────────────
  function _norm(s) { return String(s == null ? '' : s).replace(/\s+/g, '').slice(0, 40); }

  function _publishedSlots(slots) {
    return (slots || []).filter(function (s) {
      return s && s.publish && (s.publish.status === 'published' || s.instagramPublished);
    });
  }

  /** 인스타 게시물 ↔ 우리 슬롯 매칭. id 우선, 없으면 캡션 앞글자, 그 다음 발행시각 근접(10분).
      [H2] used = 이미 다른 게시물이 차지한 슬롯 Set. 퍼지 매칭(캡션·시각)이 한 슬롯을 여러 글에
        재사용하면 레이아웃/말투 표본이 허구로 부풀어 추천이 오염된다 → 쓰인 슬롯은 건너뛴다.
        fuzzyOnly=true 면 id 매칭은 이미 1패스에서 끝났으므로 퍼지만 시도한다. */
  function _matchSlot(post, slots, used, fuzzyOnly) {
    used = used || null;
    var byCap = null, byTime = null;
    var pts = post.timestamp ? Date.parse(post.timestamp) : 0;
    var pcap = _norm(post.caption);
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i], pub = s.publish || {};
      if (used && used.has(s)) continue;
      if (!fuzzyOnly && pub.igMediaId && String(pub.igMediaId) === String(post.id)) return s;
      if (!byCap && pcap && _norm(s.caption) && _norm(s.caption) === pcap) byCap = s;
      if (!byTime && pts && pub.publishedAt && Math.abs(pub.publishedAt - pts) < 10 * 60000) byTime = s;
    }
    return byCap || byTime || null;
  }

  function _toneOf(slot) {
    var t = slot && slot.captionMeta && slot.captionMeta.tone_override;
    return TONE_LABEL[t] ? t : (t ? t : 'normal');
  }

  /** wsl-* 프리셋 id → 사람이 읽는 이름. 스타터에 없으면 '내 레이아웃'(ShopStyle 확장)도 뒤진다. */
  function _presetName(id) {
    var WL = window.WorkspaceLayout;
    if (!id || !WL) return '';
    try {
      var p = WL.getById ? WL.getById(id) : null;
      if (p && p.name) return p.name;
      var mine = WL.getMyLayouts ? (WL.getMyLayouts() || []) : [];
      for (var i = 0; i < mine.length; i++) if (mine[i] && mine[i].id === id) return mine[i].name || '내 레이아웃';
    } catch (_e) { void _e; }
    return '';
  }

  /**
   * 게시물을 만들 때 쓴 레이아웃.
   * [2026-07-15 수정] 예전엔 workspaceContext.templateLabel 만 봐서 '전후'·'피드' 같은 뭉뚱그린 분류로
   *   뭉갰다 — 그러면 '전후·좌우'와 '전후·상하'가 같은 걸로 집계돼서 원장님한테 알려줄 게 없어진다.
   *   실제 프리셋 id 는 slot.templateOutputs[].templateId 에 그대로 있으므로 그걸 먼저 본다.
   *   (레이아웃 없이 사진만 올린 슬롯은 templateId=null — flow/layout.js:108. 그때만 옛 폴백.)
   */
  function _layoutOf(slot) {
    if (!slot) return '';
    var outs = slot.templateOutputs || [];
    for (var i = 0; i < outs.length; i++) {
      var id = outs[i] && outs[i].templateId;
      if (!id) continue;
      var nm = _presetName(id);
      if (nm) return nm;
    }
    var wc = slot.workspaceContext || {};
    return wc.templateLabel || PURPOSE_LABEL[wc.templatePurpose] || PURPOSE_LABEL[wc.type] || '';
  }

  /**
   * 사진 장수 — "몇 장 올린 게 반응 좋나"는 원장님이 바로 따라할 수 있는 축.
   * [2026-07-15] 인스타 응답(children_count) 우선, 없으면 슬롯. 작업실 밖에서 올린 글이나
   *   templateOutputs 가 없는 옛 글도 장수는 IG 가 직접 알려주므로 표본이 훨씬 넓어진다.
   */
  function _photoCountOf(slot, post) {
    var n = (post && post.children_count) || 0;
    if (!n && post && post.media_type && post.media_type !== 'CAROUSEL_ALBUM') n = 1;
    if (!n) n = (slot && slot.photos && slot.photos.length) || 0;
    return n ? (n >= 4 ? '4장 이상' : n + '장') : '';
  }

  /** 캡션 길이 — 원장님이 바로 조절할 수 있는 축. 인스타 캡션 그대로에서 뽑는다. */
  function _capLenOf(post) {
    var t = (post && post.caption) || '';
    if (!t) return '캡션 없음';
    var n = t.replace(/#\S+/g, '').trim().length;   // 해시태그 뺀 본문 길이
    if (n < 60) return '짧게';
    if (n < 180) return '보통';
    return '길게';
  }

  /** 해시태그 개수 — 뷰티 계정에서 유입에 크게 작용하는 축. */
  function _tagCountOf(post) {
    var t = (post && post.caption) || '';
    // [M3] #네일#젤네일 처럼 공백 없이 붙여 쓰면 #\S+ 는 한 덩어리로 세서 undercount → # 도 경계로.
    var m = t.match(/#[^#\s]+/g);
    var n = m ? m.length : 0;
    if (!n) return '없음';
    if (n <= 5) return '1~5개';
    if (n <= 15) return '6~15개';
    return '16개 이상';
  }

  /**
   * 예약 → 게시물 귀속(last-touch). rows 는 발행시각 내림차순이어야 한다.
   * 각 예약은 딱 한 게시물에만 붙는다.
   */
  function _attribute(rows, bookings) {
    rows.forEach(function (r) { r.bookings = []; });
    (bookings || []).forEach(function (b) {
      // [M7] 취소를 'cancelled' 정확 일치로만 봐서 canceled/CANCELLED/no_show 는 예약으로 셌다 → 정규화.
      if (!b) return;
      var st = String(b.status || '').toLowerCase();
      if (st.indexOf('cancel') >= 0 || st.indexOf('no_show') >= 0 || st.indexOf('noshow') >= 0) return;
      var made = b.created_at ? Date.parse(b.created_at) : 0;
      if (!made) return;
      var hit = null;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (!r.publishedAt) continue;
        if (r.publishedAt > made) continue;                       // 예약보다 나중에 올린 글
        if (made - r.publishedAt > WINDOW_DAYS * DAY) break;       // 7일 넘음 — 더 옛날 글은 볼 필요 없음
        hit = r; break;                                            // 직전 게시물 1건
      }
      if (!hit) return;
      // 발행 때 고객연결한 슬롯 + 같은 고객 = 추정이 아니라 확정
      var sure = !!(hit.slot && hit.slot.customer_id && b.customer_id && String(hit.slot.customer_id) === String(b.customer_id));
      hit.bookings.push({ name: b.customer_name || '이름 없음', sure: sure });
    });
    rows.forEach(function (r) { r.sureCount = r.bookings.filter(function (b) { return b.sure; }).length; });
  }

  function _buildRows(insights, slots) {
    var pub = _publishedSlots(slots);
    var posts = (insights && (insights.posts && insights.posts.length ? insights.posts : insights.top_posts)) || [];
    // [H2] 2패스 매칭: 먼저 igMediaId 정확 매칭을 전부 확정하고 그 슬롯을 used 로 잠근다.
    //   그래야 앞 게시물의 퍼지 매칭이 뒤 게시물의 정확 매칭용 슬롯을 가로채지 않는다.
    var used = (typeof Set === 'function') ? new Set() : { has: function () { return false; }, add: function () {} };
    var matched = posts.map(function (p) {
      var s = _matchSlot(p, pub, used, false);
      if (s && s.publish && s.publish.igMediaId && String(s.publish.igMediaId) === String(p.id)) { used.add(s); return s; }
      return null;   // 정확 매칭 아니면 2패스로 미룬다
    });
    var rows = posts.map(function (p, idx) {
      var slot = matched[idx] || _matchSlot(p, pub, used, true);
      if (slot) used.add(slot);
      var ts = p.timestamp ? Date.parse(p.timestamp) : 0;
      return {
        id: p.id, thumb: p.thumb_url || '', caption: p.caption || '', permalink: p.permalink || '',
        // 지표는 _num 으로 강제 — API 가 문자열("123")·NaN·음수를 주면 점수 계산이 문자열 연결/NaN 로 깨진다(M4)
        // [댓글수 보정 2026-07-19] 원장 본인 답글 뺀 손님 댓글 수(백엔드 comments_count_ex_owner) 우선.
        //   구버전 백엔드(필드 없음)면 원값으로 폴백 — 이땐 예전처럼 원장 답글 포함.
        likes: _num(p.like_count),
        comments: _num(p.comments_count_ex_owner != null ? p.comments_count_ex_owner : p.comments_count),
        saved: _num(p.saved), reach: _num(p.reach),
        shares: _num(p.shares),
        publishedAt: ts || (slot && slot.publish && slot.publish.publishedAt) || 0,
        slot: slot, tone: slot ? _toneOf(slot) : null, layout: slot ? _layoutOf(slot) : '',
        // 아래 3축은 슬롯이 없어도 인스타 응답만으로 뽑힌다 → 작업실 밖에서 올린 글도 분석에 들어간다
        photoCount: _photoCountOf(slot, p),
        capLen: _capLenOf(p),
        tagCount: _tagCountOf(p),
        title: (slot && (slot.service || slot.label)) || '', bookings: [], sureCount: 0,
        inquiries: 0, intents: [], askers: [], dmFromCommenters: 0, commenters: 0
      };
    });
    rows.sort(function (a, b) { return b.publishedAt - a.publishedAt; });
    return rows;
  }

  /** 게시물별 DM 유입(댓글 단 사람 중 DM 도 보낸 수)을 행에 붙인다. */
  function _attachDmLinks(rows, dmLinks) {
    var bm = (dmLinks && dmLinks.by_media) || {};
    rows.forEach(function (r) {
      var v = bm[r.id];
      r.dmFromCommenters = (v && v.dm_from_commenters) || 0;
      r.commenters = (v && v.commenters) || 0;
    });
  }

  /**
   * 문의 댓글 큐를 media_id 로 묶어 게시물에 붙인다. 큐엔 '미응대'만 들어있다(서버가 응대분 제외).
   * [2026-07-15] 작성자(username)도 같이 묶는다. 인스타는 from{} 으로 작성자를 주는데
   *   우리가 username 필드만 요청해서 여태 빈 값이었다(백엔드 _commenter 로 수정).
   *   같은 사람이 여러 번 물었으면 그게 제일 뜨거운 리드다 — 흩어 놓으면 안 보인다.
   */
  function _attachInquiries(rows, cq) {
    var items = (cq && cq.items) || [];
    if (!items.length) return;
    var byMedia = {};
    items.forEach(function (it) {
      var mid = it && it.media_id; if (!mid) return;
      if (!byMedia[mid]) byMedia[mid] = [];
      byMedia[mid].push(it);
    });
    rows.forEach(function (r) {
      var list = byMedia[r.id]; if (!list) return;
      r.inquiries = list.length;
      var seenI = {}, seenU = {};
      r.intents = list.map(function (x) { return x.intent; })
        .filter(function (x) { if (!x || seenI[x]) return false; seenI[x] = 1; return true; });
      // 사람 단위로 접기 — "yeunjun_kang 외 1명" 이 "4건" 보다 원장님한테 쓸모 있다
      r.askers = list.map(function (x) { return (x.username || '').trim(); })
        .filter(function (u) { if (!u || seenU[u]) return false; seenU[u] = 1; return true; });
    });
  }

  /**
   * 반응 점수 — 가중치는 "원장님한테 얼마나 값진 행동인가" 순: 좋아요(1) < 저장(3) < 공유(4).
   *   저장·공유는 "나중에 여기 가야지"에 가까워서 좋아요보다 예약에 훨씬 가깝다.
   *
   * [2026-07-15 중요] 댓글은 점수에서 뺐다.
   *   인스타 comments_count 에는 **우리가 단 답글이 그대로 포함**된다. 자동응답이 답글을
   *   달수록 그 글 점수가 올라가는 순환 구조라, "답글 많이 단 글 = 반응 좋은 글" 이라는
   *   허구가 만들어진다. cbt4 실측에서 실제로 터졌다: 좋아요·저장·공유가 전부 0인데
   *   우리 답글 18개만으로 "사진 3장이 제일 반응 좋았어요" 라고 추천했다.
   *   comments_count 에서 우리 답글만 빼려면 게시물마다 댓글을 다 받아 작성자를 봐야 하는데
   *   (comment-queue 가 하는 일) 그건 최근 12건까지만 된다. 표본이 반토막 나느니
   *   손님만 남길 수 있는 지표(좋아요·저장·공유)로 판단한다. 댓글은 카드에 표시만 한다.
   *
   * 도달(reach)은 프로 계정 아니면 0이라 분모로 안 쓴다(%는 만들지 않는다).
   */
  function _score(r) {
    return (r.likes || 0) + (r.saved || 0) * 3 + (r.shares || 0) * 4;
  }

  /** 이 게시물에 손님 반응이라 할 만한 게 하나라도 있나 — 전부 0이면 추천의 근거가 될 수 없다. */
  function _hasSignal(r) { return _score(r) > 0; }

  /* [2026-07-22 보스] 글 하나하나에 "왜 이 글이 반응 좋았나"를 붙인다.
     "무엇이 먹혔나" 블록은 같은 방식 3건(MIN_POSTS) 이 모여야 말을 하는데, 원장님은
     **잘된 글 하나를 보고 바로 "아 이렇게 하면 되는구나"** 를 알고 싶어 한다.
     그래서 3건 규칙과 무관하게, 이 글이 내 평소 글보다 얼마나 잘됐는지 + 이 글이 어떻게 만들어졌는지를
     한 줄로 적는다.
     ⚠️ 인과("이래서 잘됐다")로 단정하지 않는다 — 표본 1건으로 원인을 못 짚는다. 사실만 나열하고
        "이렇게 만든 글이에요" 로 끝낸다. 지어낸 근거는 원장님 작업 방식을 잘못된 쪽으로 바꾼다. */
  function _whyGoodHtml(r, ctx) {
    var sc = _score(r);
    if (!sc) return '';   // 반응 0 → 할 말 없음. 0을 잘됐다고 하지 않는다.
    ctx = ctx || {};
    /* 두 가지 경우에만 말한다:
       ① 반응 있는 글이 아직 몇 개 없으면 → 그중 제일 반응 좋은 글 하나에만 "제일 반응 좋았던 글"
          (표본이 얇아도 '1위'는 사실 진술이라 거짓이 아니다. 원인은 여전히 안 단정한다.)
       ② 반응 있는 글이 넉넉하면 → 평소(중앙값)의 1.5배 넘는 글에만. 그래야 '평소보다'가 말이 된다. */
    var isTop = ctx.topId != null && String(ctx.topId) === String(r.id);
    var thin = (ctx.signalCount || 0) < 3;
    if (thin) { if (!isTop) return ''; }
    else if (!ctx.median || sc / ctx.median < 1.5) return '';
    var ratio = ctx.median ? sc / ctx.median : 0;
    // 이 글을 만든 방식 — 있는 것만(작업실 밖 글은 레이아웃·말투가 없다)
    var bits = [];
    if (r.layout) bits.push(r.layout + ' 레이아웃');
    if (r.photoCount) bits.push('사진 ' + r.photoCount);
    if (r.tone) bits.push((TONE_LABEL[r.tone] || r.tone) + ' 말투');
    if (r.capLen) bits.push('캡션 ' + r.capLen);
    if (r.tagCount) bits.push('해시태그 ' + r.tagCount);
    // 무엇이 특히 잘 나왔나 — 저장·공유는 좋아요보다 값진 신호라 따로 짚는다
    var strong = [];
    if ((r.saved || 0) > 0) strong.push('저장 ' + r.saved);
    if ((r.shares || 0) > 0) strong.push('공유 ' + r.shares);
    if (!strong.length && (r.likes || 0) > 0) strong.push('좋아요 ' + r.likes);
    var howMuch = thin ? '지금까지 올린 글 중 반응이 제일 좋았어요'
      : (ratio >= 3 ? '평소보다 훨씬 반응이 좋았어요' : '평소보다 반응이 좋았어요');
    return '<div class="wsp-why">' +
      '<i class="ph-duotone ph-lightbulb"></i>' +
      '<span><b>' + howMuch + '</b>' +
        (strong.length ? ' (' + esc(strong.join(' · ')) + ')' : '') +
        (bits.length ? '<em>이렇게 만든 글이에요 — ' + esc(bits.join(' · ')) + '</em>' : '') +
      '</span></div>';
  }

  /** '왜 좋았나' 판정에 필요한 전체 맥락 — 중앙값('평소'의 기준. 평균은 대박 글 하나에 끌려간다),
      반응 있는 글 수, 1위 글 id. rows 전체를 한 번만 훑어 카드마다 재계산하지 않는다. */
  function _whyCtx(rows) {
    var scored = (rows || []).map(function (r) { return { id: r.id, s: _score(r) }; })
      .filter(function (o) { return o.s > 0; }).sort(function (a, b) { return a.s - b.s; });
    if (!scored.length) return { median: 0, signalCount: 0, topId: null };
    var v = scored.map(function (o) { return o.s; });
    var m = Math.floor(v.length / 2);
    return {
      median: v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2,
      signalCount: v.length,
      topId: scored[scored.length - 1].id,
    };
  }

  function _agg(rows, keyFn) {
    var m = {};
    rows.forEach(function (r) {
      var k = keyFn(r);
      if (!k) return;
      if (!m[k]) m[k] = { key: k, posts: 0, bookings: 0, likes: 0, score: 0 };
      m[k].posts++; m[k].bookings += r.bookings.length; m[k].likes += r.likes; m[k].score += _score(r);
    });
    return Object.keys(m).map(function (k) {
      var o = m[k];
      o.perPost = o.posts ? o.bookings / o.posts : 0;
      o.likesPerPost = o.posts ? o.likes / o.posts : 0;
      o.scorePerPost = o.posts ? o.score / o.posts : 0;
      o.enough = o.posts >= MIN_POSTS;
      return o;
    }).sort(function (a, b) { return b.scorePerPost - a.scorePerPost || b.perPost - a.perPost; });
  }

  // ── 그리기 ────────────────────────────────────────────────
  function _fmtDate(ms) {
    if (!ms) return '';
    var d = new Date(ms);
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
  }

  /* 맨 위 합계 띠. 화살표로 좋아요→댓글→예약 깔때기를 보여주던 걸, 저장·공유까지 포함한
     전체 지표 합계로 바꿨다(2026-07-15). 깔때기 비유는 사실이 아니었다 — 좋아요 누른 사람이
     댓글을 달고 그게 예약이 되는 게 아니라 서로 다른 사람이다. 화살표가 인과를 암시해서 뺐다. */
  function _summaryHtml(rows) {
    var t = { likes: 0, comments: 0, saved: 0, shares: 0, books: 0 };
    rows.forEach(function (r) {
      t.likes += r.likes || 0; t.comments += r.comments || 0;
      t.saved += r.saved || 0; t.shares += r.shares || 0; t.books += r.bookings.length;
    });
    var cells = [
      { n: t.likes, l: '좋아요' }, { n: t.comments, l: '댓글' },
      { n: t.saved, l: '저장' }, { n: t.shares, l: '공유' }, { n: t.books, l: '예약' },
    ];
    return '<div class="wsp-sum">' +
      '<div class="wsp-sum__tt">발행 ' + rows.length + '건이 이만큼 움직였어요</div>' +
      '<div class="wsp-sum__row">' +
      cells.map(function (c) { return '<div class="wsp-sum__c"><b>' + c.n + '</b><span>' + c.l + '</span></div>'; }).join('') +
      '</div></div>';
  }

  /** 한 축(레이아웃/말투/사진장수)의 순위 막대. 표본 부족분은 순위를 안 매기고 그대로 말한다. */
  function _axisHtml(label, list, icon) {
    var enough = list.filter(function (o) { return o.enough; });
    var head = '<div class="wsp-axis__k"><i class="ph-duotone ' + icon + '"></i>' + esc(label) + '</div>';
    if (!enough.length) {
      return '<div class="wsp-axis">' + head +
        '<div class="wsp-axis__none">같은 ' + esc(label) + _ro(label) + ' ' + MIN_POSTS + '건은 올려야 비교해드릴 수 있어요. ' +
        '지금은 ' + list.length + '가지를 조금씩만 써보셨어요.</div></div>';
    }
    // 비교 대상이 하나뿐이면 1등을 강조하지 않는다 — 막대 100% + 굵은 글씨는 "이게 최고" 로 읽히는데,
    //   견줄 게 없으면 그건 그냥 유일한 값이지 최고가 아니다.
    var comparable = enough.length >= 2;
    var max = enough[0].scorePerPost || 1;
    var bars = enough.map(function (o, i) {
      var pct = Math.max(4, Math.round((o.scorePerPost / max) * 100));
      return '<div class="wsp-bar' + (comparable && i === 0 ? ' is-top' : '') + '">' +
        '<div class="wsp-bar__k">' + esc(o.key) + '</div>' +
        '<div class="wsp-bar__t"><span style="width:' + pct + '%"></span></div>' +
        '<div class="wsp-bar__v">' + Math.round(o.scorePerPost) + '</div>' +
        '<div class="wsp-bar__s">' + o.posts + '건' + (o.bookings ? ' · 예약 ' + o.bookings + '건' : '') + '</div>' +
        '</div>';
    }).join('');
    var thin = list.length - enough.length;
    var note = '';
    if (!comparable) {
      note = '<div class="wsp-axis__thin">견줄 게 아직 없어요 — 다른 ' + esc(label) + _ro(label) + '도 올려보시면 비교해드릴게요</div>';
    } else if (thin) {
      note = '<div class="wsp-axis__thin">' + thin + '가지는 아직 ' + MIN_POSTS + '건이 안 돼서 뺐어요</div>';
    }
    return '<div class="wsp-axis">' + head + bars + note + '</div>';
  }

  /**
   * "무엇이 먹혔나" — 이 화면의 본론.
   * 원장님이 다음 게시물을 만들 때 따라할 수 있는 축만 놓는다: 레이아웃·말투·사진 장수.
   */
  function _compareHtml(rows) {
    /* [2026-07-15] 분석 창 = 최근 2주. 반년 전 글이랑 섞으면 '요즘 뭐가 먹히나'를 못 본다
       (인스타 알고리즘·계절·시술 유행이 다 바뀐다). 게시물 목록은 그대로 다 보여준다. */
    var cut = Date.now() - ANALYZE_DAYS * DAY;
    var win = rows.filter(function (r) { return r.publishedAt && r.publishedAt >= cut; });

    var head = '<div class="wsp-sect">무엇이 먹혔나 <span class="wsp-sect__s">최근 ' + ANALYZE_DAYS + '일</span></div>';
    if (!win.length) {
      return head + '<div class="wsp-empty">최근 ' + ANALYZE_DAYS + '일 안에 올린 글이 없어요.</div>';
    }

    /* 반응이 하나도 없으면 순위를 만들지 않는다.
       [중요] 여기서 억지로 1등을 뽑으면 '0점 vs 0점' 중 아무거나 고르는 꼴이라
         원장님이 그걸 믿고 작업 방식을 바꾼다. 없는 근거를 지어내느니 없다고 말한다.
         (cbt4 실측: 2주 13건에 좋아요 0·저장 0·공유 0 — 이 분기가 실제로 필요하다) */
    var signal = win.filter(_hasSignal);
    if (!signal.length) {
      return head + '<div class="wsp-empty">최근 ' + ANALYZE_DAYS + '일 글 ' + win.length + '건에 ' +
        '아직 <b>좋아요·저장·공유</b>가 없어서 뭐가 먹히는지 못 따져요.<br>' +
        '반응이 쌓이면 여기서 알려드릴게요.<br>' +
        '<span class="wsp-empty__s">댓글은 우리가 단 답글이 섞여 있어서 판단 근거로 안 써요.</span></div>';
    }

    /* 축 정의. lead 는 축마다 따로 쓴다 — "2장 사진 장수으로" 같은 조사 깨짐을 막고,
       원장님이 그대로 따라할 수 있는 문장으로 만든다.
       사진장수·캡션길이·해시태그는 슬롯이 없어도 인스타 응답만으로 뽑히므로 표본이 넓다.
       레이아웃·말투는 작업실에서 올린 글에만 있다 → 없으면 그 축은 자동으로 빠진다. */
    var AXES = [
      { label: '레이아웃', icon: 'ph-layout', keyFn: function (r) { return r.layout || null; },
        lead: function (k) { return '<b>' + esc(k) + '</b> 레이아웃으로 올린 글'; } },
      { label: '사진 장수', icon: 'ph-images', keyFn: function (r) { return r.photoCount || null; },
        lead: function (k) { return '사진 <b>' + esc(k) + '</b> 올린 글'; } },
      { label: '캡션 길이', icon: 'ph-text-align-left', keyFn: function (r) { return r.capLen || null; },
        lead: function (k) { return '캡션을 <b>' + esc(k) + '</b> 쓴 글'; } },
      { label: '말투', icon: 'ph-chat-circle-text', keyFn: function (r) { return r.tone ? (TONE_LABEL[r.tone] || r.tone) : null; },
        lead: function (k) { return '<b>' + esc(k) + '</b> 말투로 쓴 글'; } },
      { label: '해시태그', icon: 'ph-hash', keyFn: function (r) { return r.tagCount || null; },
        lead: function (k) { return '해시태그를 <b>' + esc(k) + '</b> 단 글'; } },
    ];
    /* [2026-07-16 신뢰성 수정 H1] 집계는 반응 있는 글(signal)로만 한다 — win(전체)로 하면
       반응 0인 레이아웃도 posts>=MIN_POSTS 만 채우면 'enough' 가 돼서, 0점끼리 tie 로 1등이 뽑히고
       "제일 반응 좋았어요"·추천으로 나갔다(주석은 막는다는데 코드가 안 막던 실제 버그).
       signal 로 집계하면 반응 못 받은 축은 애초에 목록에 안 들어온다. */
    AXES.forEach(function (x) { x.list = _agg(signal, x.keyFn); });

    /* 맨 위 한 줄 결론.
       [주의] 축끼리 점수를 비교하면 안 된다 — 세 축은 같은 게시물을 다르게 자를 뿐이라, 대박 글 하나를
         우연히 잘 격리한 축이 늘 이긴다(의미 없는 1등). 대신 원장님이 따라하기 쉬운 순서로 고른다:
         레이아웃(다음 글에 그대로 적용 가능) > 말투 > 사진 장수. 표본 채운 첫 축을 쓴다.
       그리고 1등이라도 반응 점수가 0이면 크라운하지 않는다(0점을 '최고'라 부르지 않는다). */
    var top = null;
    for (var i = 0; i < AXES.length && !top; i++) {
      var enoughList = AXES[i].list.filter(function (o) { return o.enough; });
      var e = enoughList[0];
      if (e && enoughList.length >= 2 && e.scorePerPost > 0) top = { ax: AXES[i], o: e };
    }
    var lead = top
      ? '<div class="wsp-lead">최근 ' + ANALYZE_DAYS + '일은 ' + top.ax.lead(top.o.key) + '이 제일 반응 좋았어요 ' +
        '<span>(' + top.o.posts + '건 기준)</span></div>'
      : '<div class="wsp-lead wsp-lead--thin">아직 뭐가 먹히는지 말하기엔 일러요. ' +
        '같은 방식으로 ' + MIN_POSTS + '건쯤 올려서 서로 비교되면 여기서 알려드릴게요.</div>';

    // [힌트 슬라이스] 추천을 새 글 플로우로 들고 가서 토스트로 알려준다(레이아웃 컴포저는 안 건드림 —
    //   사진 수·구성에 얽힌 취약 파일이라 블라인드 자동선택은 위험. 원장이 뭘 고를지 기억만 돕는다).
    _lastReco = _recoPicks(AXES).map(function (p) { return p.label + ' ' + p.key; }).join(' · ');

    /* [2026-07-18] 표본 부족 축은 축마다 "3건 올려야" 박스를 그려 화면이 다닥다닥했다(축 5개면 최대 5줄).
       맨 위 lead 가 이미 "아직 일러요"를 말하므로 중복 → 데이터 있는 축만 막대로 보이고,
       부족한 축들은 이름만 모아 '한 줄'로 통합한다. */
    var ready = AXES.filter(function (x) { return x.list.filter(function (o) { return o.enough; }).length; });
    var pending = AXES.filter(function (x) { return !x.list.filter(function (o) { return o.enough; }).length && x.list.length; });
    var axisBody = ready.map(function (x) { return _axisHtml(x.label, x.list, x.icon); }).join('');
    if (pending.length) {
      var pnames = pending.map(function (x) { return x.label; });
      var lastCh = pnames[pnames.length - 1].slice(-1).charCodeAt(0);   // 받침 유무로 은/는
      var josa = (lastCh >= 0xAC00 && lastCh <= 0xD7A3 && (lastCh - 0xAC00) % 28 !== 0) ? '은' : '는';
      axisBody += '<div class="wsp-axis__thin wsp-axis__pending">' +
        esc(pnames.join(' · ')) + josa + ' 같은 방식 ' + MIN_POSTS + '건부터 비교해드려요</div>';
    }

    return head + lead + _recoHtml(AXES) + axisBody +
      '<div class="wsp-legend">반응 = 좋아요 + 저장×3 + 공유×4. ' +
      '저장·공유를 크게 보는 건 "나중에 여기 가야지"에 더 가까워서예요. ' +
      '댓글은 우리가 단 답글이 섞여 있어서 뺐어요.</div>';
  }

  /** 표본·비교군 채운 축의 1등만. _recoHtml 과 같은 규칙(중복 로직 한 곳으로). */
  function _recoPicks(axes) {
    return axes.map(function (x) {
      var e = x.list.filter(function (o) { return o.enough; });
      return (e.length >= 2 && e[0].scorePerPost > 0) ? { label: x.label, key: e[0].key, posts: e[0].posts } : null;
    }).filter(Boolean);
  }

  /**
   * 다음 글 추천 — 이 화면의 존재 이유. 분석만 보여주면 원장님이 뭘 해야 할지 모른다.
   * 표본(MIN_POSTS)과 비교군(2가지 이상)을 채운 축의 1등만 모아서 "이렇게 해보세요"로 낸다.
   *   → 근거 없는 축은 아예 문장에 안 넣는다. 채운 축이 하나도 없으면 카드 자체를 안 그린다.
   */
  function _recoHtml(axes) {
    var picks = _recoPicks(axes);
    if (!picks.length) return '';
    var items = picks.map(function (p) {
      return '<li><span class="wsp-reco__k">' + esc(p.label) + '</span>' +
        '<b>' + esc(p.key) + '</b><span class="wsp-reco__s">' + p.posts + '건 기준</span></li>';
    }).join('');
    return '<div class="wsp-reco">' +
      '<div class="wsp-reco__h"><i class="ph-duotone ph-lightbulb-filament"></i>다음 글은 이렇게 해보세요</div>' +
      '<ul class="wsp-reco__l">' + items + '</ul>' +
      '<div class="wsp-reco__d">최근 ' + ANALYZE_DAYS + '일 반응이 좋았던 방식이에요. ' +
      '똑같이 하라는 건 아니고, 애매할 때 참고하시라는 뜻이에요.</div>' +
      // [디자인 방향2] 분석을 읽고 끝이 아니라 바로 행동으로. 이 버튼이 작업실 새 글 플로우를 연다.
      '<button type="button" class="wsp-reco__cta" data-wsp-newpost>이 방식으로 새 글 만들기</button>' +
      '</div>';
  }

  /** "@a" · "@a 외 1명" — 핸들을 다 나열하면 카드가 터진다. 2명까지만 이름, 나머지는 숫자. */
  function _askerText(list) {
    if (!list.length) return '';
    if (list.length === 1) return '@' + list[0];
    if (list.length === 2) return '@' + list[0] + ' · @' + list[1];
    return '@' + list[0] + ' 외 ' + (list.length - 1) + '명';
  }

  /** 한눈 상태 배지 — 훑을 때 어떤 글을 지금 챙겨야 하는지 색으로 구분. 우선순위: 예약>문의>반응>조용. */
  function _statusOf(r) {
    if (r.bookings.length) return { t: '예약 나옴', c: 'ok' };
    if (r.inquiries) return { t: '문의 대기', c: 'wait' };
    if (_hasSignal(r)) return { t: '반응 좋음', c: 'good' };
    return { t: '조용', c: 'dim' };
  }

  function _rowHtml(r) {
    var st = _statusOf(r);
    var thumb = r.thumb
      ? '<img class="wsp-card__im" src="' + esc(r.thumb) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
      : '<div class="wsp-card__im wsp-card__im--none"><i class="ph-duotone ph-image"></i></div>';
    var chips = '';
    if (r.layout) chips += '<span class="wsp-chip">' + esc(r.layout) + '</span>';
    if (r.tone) chips += '<span class="wsp-chip">' + esc(TONE_LABEL[r.tone] || r.tone) + ' 말투</span>';
    if (r.photoCount) chips += '<span class="wsp-chip">' + esc(r.photoCount) + '</span>';
    if (!r.slot) chips += '<span class="wsp-chip wsp-chip--dim">작업실 밖에서 올린 글</span>';

    var n = r.bookings.length;
    var names = r.bookings.slice(0, 3).map(function (b) { return b.name; }).join(' · ');
    var conv;
    if (n) {
      conv = '<div class="wsp-conv is-hit">' +
        '<div class="wsp-conv__t"><i class="ph-duotone ph-calendar-check"></i>예약 <b>' + n + '건</b></div>' +
        '<div class="wsp-conv__s">' + esc(names) +
        (r.sureCount ? ' — ' + r.sureCount + '건은 고객연결로 확인' : '') +
        (r.sureCount < n ? ' — 올린 뒤 ' + WINDOW_DAYS + '일 안에 잡힌 예약으로 추정' : '') +
        '</div></div>';
    } else {
      conv = '<div class="wsp-conv">' +
        '<div class="wsp-conv__t"><i class="ph-duotone ph-calendar-blank"></i>예약 0건</div>' +
        (r.likes ? '<div class="wsp-conv__s">좋아요는 있는데 예약으로는 아직 안 이어졌어요</div>' : '') +
        '</div>';
    }

    // 답 안 한 문의 댓글 — 원장님이 지금 당장 할 일이라 예약 블록보다 위에 둔다.
    var inq = '';
    if (r.inquiries) {
      var kinds = r.intents.map(function (x) { return INTENT_LABEL[x] || x; }).join(' · ');
      inq = '<div class="wsp-inq" data-wsp-comments>' +
        '<i class="ph-duotone ph-chats-circle"></i>' +
        '<span>답 안 한 문의 <b>' + r.inquiries + '건</b>' + (kinds ? ' — ' + esc(kinds) : '') +
        (r.askers && r.askers.length ? '<em>' + esc(_askerText(r.askers)) + '</em>' : '') +
        '</span><i class="ph-duotone ph-caret-right"></i></div>';
    }

    // [디자인 방향3] 작업실에서 만든 글은 꾸밈(글씨·스티커·레이아웃)까지 그대로 재사용한다.
    // [2026-07-22 보스] 슬롯 없는 글(인스타 앱에서 직접 올린 글 등)에도 버튼을 띄운다.
    //   예전엔 통째로 숨겨서, 반응 좋은 글을 보고도 "또 만들기" 버튼이 없어 이어갈 방법이 없었다.
    //   재현할 꾸밈이 없다는 건 라벨로 정직하게 말한다 — 없는 걸 있는 척하지 않는다.
    var again = r.slot
      ? '<button type="button" class="wsp-again" data-wsp-newpost="' + esc(r.id) + '">' +
          '<i class="ph-duotone ph-copy"></i>이 스타일로 또 만들기</button>'
      : '<button type="button" class="wsp-again" data-wsp-newpost="' + esc(r.id) + '">' +
          '<i class="ph-duotone ph-plus-circle"></i>이런 글 또 만들기</button>';

    return '<div class="wsp-card wsp-card--' + st.c + '">' +
      '<div class="wsp-card__top">' + thumb +
        '<div class="wsp-card__meta">' +
          '<div class="wsp-card__hd">' +
            '<div class="wsp-card__tt">' + esc(r.title || (r.caption || '제목 없음').slice(0, 20)) + '</div>' +
            '<span class="wsp-badge wsp-badge--' + st.c + '">' + st.t + '</span>' +
          '</div>' +
          '<div class="wsp-chips">' + chips + '</div>' +
          '<div class="wsp-card__dt">' + _fmtDate(r.publishedAt) + ' 발행</div>' +
        '</div></div>' +
      _statsHtml(r) + _whyGoodHtml(r, _whyCtx(_curRows)) + inq + _dmLinkHtml(r) + conv + again + '</div>';
  }

  /** 이 게시물에 댓글 단 사람 중 DM 도 보낸 수 — '이 글 보고 연락 왔다'의 실제 신호(IGSID 동일인). */
  function _dmLinkHtml(r) {
    if (!r.dmFromCommenters) return '';
    // [2026-07-22 보스] 눌러서 DM 으로 간다. 예전엔 글자만 있어서 "DM 왔다는데 갈 방법이 없다" 였다.
    return '<div class="wsp-dmlink" data-wsp-dm role="button" tabindex="0" style="cursor:pointer">' +
      '<i class="ph-duotone ph-paper-plane-tilt"></i>' +
      '<span>이 글 보고 <b>' + r.dmFromCommenters + '명</b>이 DM까지 보냈어요</span>' +
      '<i class="ph-duotone ph-caret-right" style="margin-left:auto"></i></div>';
  }

  /**
   * 게시물별 성과 지표 — 좋아요·댓글·저장·공유·도달을 **항상 전부** 보여준다.
   * [2026-07-15] 예전엔 저장·도달을 0이면 숨기고 공유는 아예 없었다. 그러면 원장님이
   *   "저장이 0이다" 와 "저장을 못 읽었다" 를 구분할 방법이 없다 — 숨기는 게 더 나쁘다.
   *   0 이면 0 이라고 보여주고, 계정 문제로 아예 안 나오는 경우는 아래 _statsNoteHtml 로 따로 말한다.
   * 순서는 값진 순(공유 > 저장 > 댓글 > 좋아요)이 아니라 원장님이 익숙한 순(인스타 표시 순)으로 둔다.
   */
  function _statsHtml(r) {
    var cells = [
      { ic: 'ph-heart', n: r.likes || 0, l: '좋아요' },
      { ic: 'ph-chat-circle', n: r.comments || 0, l: '댓글' },
      { ic: 'ph-bookmark-simple', n: r.saved || 0, l: '저장' },
      { ic: 'ph-paper-plane-tilt', n: r.shares || 0, l: '공유' },
      { ic: 'ph-eye', n: r.reach || 0, l: '도달' },
    ];
    return '<div class="wsp-stats">' + cells.map(function (c) {
      return '<div class="wsp-stat' + (c.n ? ' is-on' : '') + '">' +
        '<i class="ph-duotone ' + c.ic + '"></i>' +
        '<b>' + c.n + '</b><span>' + c.l + '</span></div>';
    }).join('') + '</div>';
  }

  /**
   * 저장·공유·도달이 전 게시물에서 통째로 0이면 계정 종류 문제일 수 있다.
   * 인스타는 프로(비즈니스/크리에이터) 계정에만 이 지표를 준다 — 개인 계정이면 영영 0이다.
   * 그걸 모르면 원장님은 "우리 글이 저장이 하나도 안 됐네" 라고 잘못 배운다.
   */
  function _statsNoteHtml(rows) {
    if (!rows.length) return '';
    // [2026-07-22 보스] 원장님이 직접 댓글·저장·공유·DM 을 하나씩 해보고 "좋아요만 뜬다"고 하셨다.
    //   버그가 아니라 인스타가 주는 값이 원래 그렇다 — 모르면 "우리 앱이 고장났다"로 읽힌다. 먼저 말해준다.
    var selfNote = '<div class="wsp-legend">숫자가 바로 안 늘어도 정상이에요. ' +
      '<b>원장님 계정으로 직접 누른 좋아요·저장·공유는 인스타가 성과에 안 넣어요.</b> ' +
      '원장님이 직접 단 댓글도 <b>손님 댓글에서 빼고</b> 세요(자동응답 답글이 반응처럼 부풀지 않게). ' +
      '저장·공유·도달은 인스타가 몇 시간 뒤에 주기도 해요 — 위 <b>새로고침</b>으로 다시 받아볼 수 있어요.</div>';
    var anyInsight = rows.some(function (r) { return (r.saved || 0) + (r.shares || 0) + (r.reach || 0) > 0; });
    if (anyInsight) return selfNote;
    return selfNote +
      '<div class="wsp-legend">저장·공유·도달이 계속 0으로 나오면 인스타가 <b>프로 계정</b>(비즈니스·크리에이터)에만 ' +
      '주는 지표라서 그럴 수 있어요. 인스타 설정에서 프로 계정으로 바꾸면 보여요.</div>';
  }

  /* [2026-07-16] DM 유입 — 이제 실제로 잇는다.
     댓글 from.id == DM sender.id(동일 IGSID)로 '이 게시물에 댓글 단 사람이 DM 도 보냈다'를 잡는다.
     한계는 정직하게: 댓글 없이 그냥 DM만 보낸 오가닉 유입은 여전히 어느 글에서 왔는지 모른다
       (messaging_referral 은 주로 광고·링크에만 붙어서). 그래서 '전체 DM 중 %' 는 안 만들고,
       '댓글→DM 으로 이어진 사람 수' 만 확정값으로 보여준다(가짜 숫자 금지 원칙 유지). */
  function _dmSummaryHtml(dmLinks) {
    var n = (dmLinks && dmLinks.total_dm_from_commenters) || 0;
    if (!n) {
      return '<div class="wsp-lock">' +
        '<div class="wsp-lock__h"><i class="ph-duotone ph-paper-plane-tilt"></i>댓글 달고 DM까지 온 손님</div>' +
        '<div class="wsp-lock__d">아직 없어요. 댓글 단 사람이 DM도 보내면, 어느 글 보고 연락했는지 ' +
          '여기서 이어서 보여드릴게요.</div></div>';
    }
    return '<div class="wsp-lock wsp-lock--hit">' +
      '<div class="wsp-lock__h"><i class="ph-duotone ph-paper-plane-tilt"></i>댓글 달고 DM까지 온 손님' +
        '<span class="wsp-lock__b wsp-lock__b--on">' + n + '명</span></div>' +
      '<div class="wsp-lock__d">이 사람들은 게시물에 댓글을 남기고 DM까지 보냈어요 — 어느 글 보고 ' +
        '연락했는지 위 게시물 카드에 표시했어요. (댓글 없이 DM만 온 유입은 인스타가 출처를 안 줘서 못 이어요.)</div>' +
      // [2026-07-22 보스] 여기서 바로 DM 으로 넘어간다 — 성과가 '보고서'로 안 끝나게.
      '<button type="button" class="wsp-again" data-wsp-dm>' +
        '<i class="ph-duotone ph-paper-plane-tilt"></i>DM 보러 가기</button></div>';
  }

  /**
   * [C5 눈팅 손님 2026-07-16] 저장·공유는 눌렀는데 아무도 연락 안 한 글.
   *
   * 눈팅 손님은 최대 잠재풀인데 **인스타가 저장·좋아요한 사람이 누군지 안 준다** — 우리가 먼저
   * 연락할 방법이 구조적으로 없다(광고 리타게팅 말고는). 그래서 '그 사람들에게 DM 보내기' 같은
   * 기능은 만들 수 없고, 만들면 거짓말이다.
   *   대신 할 수 있는 건: 저장이 쌓였는데 연락이 0인 글을 원장님한테 알려주고,
   *   캡션에 '예약은 여기로' 안내를 넣게 하는 것. 저장한 사람은 이미 관심이 있으니 길만 열어주면 된다.
   */
  function _lurkerHtml(rows) {
    var cut = Date.now() - ANALYZE_DAYS * DAY;
    var quiet = rows.filter(function (r) {
      if (!r.publishedAt || r.publishedAt < cut) return false;
      var intent = (r.saved || 0) + (r.shares || 0);            // 저장·공유 = '나중에 가야지' 신호
      var contacted = r.bookings.length || r.inquiries || r.dmFromCommenters;
      return intent >= LURK_MIN && !contacted;
    });
    if (!quiet.length) return '';
    var people = quiet.reduce(function (a, r) { return a + (r.saved || 0) + (r.shares || 0); }, 0);
    return '<div class="wsp-lock wsp-lock--lurk">' +
      '<div class="wsp-lock__h"><i class="ph-duotone ph-bookmark-simple"></i>조용한 관심' +
        '<span class="wsp-lock__b wsp-lock__b--lurk">' + people + '명</span></div>' +
      '<div class="wsp-lock__d">최근 ' + ANALYZE_DAYS + '일 글 <b>' + quiet.length + '개</b>를 <b>' + people + '명</b>이 ' +
        '저장·공유했는데 아무도 연락은 안 했어요. 저장했다는 건 관심이 있다는 뜻이에요.<br>' +
        '인스타가 저장한 사람이 누군지 안 알려줘서 먼저 연락드릴 순 없어요. 대신 ' +
        '<b>캡션에 예약 방법</b>을 적어두면 이 분들이 스스로 움직여요.</div>' +
      '<button type="button" class="wsp-again" data-wsp-footer>' +
        '<i class="ph-duotone ph-note-pencil"></i>캡션 고정멘트 설정하기</button></div>';
  }

  /** 댓글 문의를 못 읽은 경우에만 뜬다 — 대개 인스타를 다시 연결하면 풀린다(스코프가 토큰에 박혀서). */
  function _cqNoticeHtml(cq) {
    if (!cq || !(cq.permission_error || cq._failed)) return '';
    if (cq.connected === false) return '';   // 인스타 미연결은 이미 다른 데서 안내함
    return '<div class="wsp-lock">' +
      '<div class="wsp-lock__h"><i class="ph-duotone ph-warning-circle"></i>문의 댓글을 못 읽었어요' +
        '<span class="wsp-lock__b">재연결 필요</span></div>' +
      '<div class="wsp-lock__d">인스타를 연결할 때 댓글 권한을 안 받아서예요. 설정에서 인스타를 ' +
        '다시 연결하면 게시물마다 답 안 한 문의를 모아서 보여드릴 수 있어요.</div></div>';
  }

  function _emptyHtml(insights) {
    var st = insights && insights.status;
    if (st === 'no_account') {
      return '<div class="wsp-empty"><b>인스타 연결이 필요해요</b><br>연결하면 올린 글의 좋아요·댓글이 여기 모여요.</div>';
    }
    if (st === 'error') {
      return '<div class="wsp-empty">인스타에서 성과를 못 받아왔어요. 잠시 뒤 다시 열어봐 주세요.</div>';
    }
    return '<div class="wsp-empty">아직 올린 게시물이 없어요. 작업실에서 첫 글을 올려보세요.</div>';
  }

  /* [#1 2026-07-17] '고객·매출 인사이트 보기' 버튼 삭제 — 원장 요청("작업실 성과에 매출 인사이트 없애").
     이 화면은 '무엇이 먹혔나'(다음 글을 어떻게 만들지)를 보는 곳이고, 이탈고객·매출예측(app-insights.js)은
     성격이 다른 화면이라 섞여 있었다.
     ⚠️ 지우기 전 확인함 — AI 인사이트는 고아가 안 된다. 진입점이 5곳 더 있다:
       app-dashboard.js:221(내샵관리 'AI 인사이트') · app-assistant.js:4147(잇비 자연어) ·
       app-today-brief.js:215(오늘 브리핑) · js/home/v41-actions.js:79(홈) ·
       workspace-v2-home.js(성과 버튼 폴백).
     (v748 이 성과 진입점을 지워 화면이 고아가 됐던 전례 때문에 매번 확인한다.) */
  function _render(el, insights, rows, cq, dmLinks) {
    _curRows = rows || [];   // [v779] '이 스타일로 또' 클릭 시 카드의 slot 을 되찾기 위해 보관
    var body = el.querySelector('[data-wsp-body]');
    if (!body) return;
    if (!rows.length) { body.innerHTML = _emptyHtml(insights) + _dmSummaryHtml(dmLinks); return; }
    body.innerHTML =
      _summaryHtml(rows) +
      _compareHtml(rows) +
      '<div class="wsp-sect">게시물별</div>' +
      rows.map(_rowHtml).join('') +
      _statsNoteHtml(rows) +
      _cqNoticeHtml(cq) +
      _lurkerHtml(rows) +
      _dmSummaryHtml(dmLinks);
  }

  /** 작업실 새 글 플로우 진입. 홈의 업로드 버튼(data-wsv2-upload)을 눌러 사진 선택을 띄운다.
      성과 오버레이가 홈 위에 떠 있었으므로 홈 DOM 은 뒤에 그대로 있다. 없으면 토스트로 안내. */
  function _startNewPost(slot) {
    // [v779 보스] '이 스타일로 또 만들기' — 그 게시물의 꾸밈(선·도형·스티커·텍스트·폰트·색·위치)을
    //   작업 기억으로 붙잡아 다음 글에 적용한다. 예전엔 슬롯을 안 넘겨 그 게시물 스타일이
    //   통째로 유실되고, 오직 전역 ★기본에만 의존했다(적용 안 되던 원인).
    // [T2 2026-08-17] setDefault → applyOnce: 예전엔 원장이 명시로 고른 ★기본을 조용히 덮어쳤다(소유권 위반).
    //   이제 ★는 원장 명시 조작 전용이고, 여긴 '다음 글 1회 적용'만. 발행이 아니므로 publish 카운트도 안 셈.
    try {
      if (slot && window.WorkMemory && window.WorkMemory.captureFromSlot) {
        var _rec = window.WorkMemory.captureFromSlot(slot, null, { publish: false });
        if (_rec && _rec.id && window.WorkMemory.applyOnce) window.WorkMemory.applyOnce(_rec.id);
        else if (_rec && _rec.id && window.WorkMemory.setDefault) window.WorkMemory.setDefault(_rec.id);   // 구 WM 캐시 폴백
        else if (!_rec) toast('이 글엔 재사용할 꾸밈(글씨·스티커 등)이 없어요');
      }
    } catch (_e) { void _e; }
    // 추천을 토스트로 들고 간다 — 레이아웃 단계에서 뭘 고를지 기억나게(컴포저 자동선택은 안 함).
    if (_lastReco) toast('반응 좋았던 방식: ' + _lastReco);
    var btn = document.querySelector('[data-wsv2-upload]');
    if (btn) { btn.click(); return; }
    var file = document.querySelector('[data-wsv2-file]');
    if (file) { file.click(); return; }
    if (!_lastReco) toast('작업실에서 새 글을 시작해 주세요');
  }

  // ── 화면 ──────────────────────────────────────────────────
  function _ensureMounted() {
    var el = document.getElementById(ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = ID; el.className = 'subscreen-overlay'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<header class="ss-topbar">' +
        '<button type="button" class="ss-back" data-wsp-back aria-label="뒤로">' +
          '<svg width="14" height="14" aria-hidden="true"><use href="#ic-chevron-left"/></svg></button>' +
        '<div class="ss-title">성과</div>' +
        // [2026-07-22 보스] 새로고침 — 예전엔 열 때 딱 1번만 불러오고 그 뒤엔 영영 그대로였다.
        //   좋아요·댓글이 방금 달렸는데 화면이 안 바뀌니 "성과가 실시간이 아니다"로 보였다.
        '<button type="button" class="ss-topbar__act" data-wsp-refresh aria-label="새로고침" ' +
          'style="margin-left:auto;background:none;border:none;padding:6px 8px;cursor:pointer;color:var(--text-subtle,#8B95A1)">' +
          '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
          'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg></button>' +
      '</header>' +
      '<div class="ss-body" data-wsp-body></div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-wsp-back]')) { close(); return; }
      if (e.target.closest('[data-wsp-refresh]')) { _reload(true); return; }
      // [2026-07-22] 'DM까지 보낸 손님' → 실제로 그 대화로 간다. 예전엔 글자만 있고 눌러도 아무 일이 없었다.
      if (e.target.closest('[data-wsp-dm]')) {
        if (typeof window.openDMConfirmQueue === 'function') { close(); window.openDMConfirmQueue(); }
        else if (typeof window.openDMConversations === 'function') { close(); window.openDMConversations(); }
        else toast('DM 화면을 불러오지 못했어요');
        return;
      }
      // 답 안 한 문의 → 댓글 응대 화면. 여기서 바로 답을 달게 해야 성과 화면이 '보고서'로 안 끝난다.
      if (e.target.closest('[data-wsp-comments]')) {
        if (typeof window.openCommentReplyQueue === 'function') { close(); window.openCommentReplyQueue(); }
        else toast('댓글 응대 화면을 불러오지 못했어요');
        return;
      }
      // [디자인 방향2/3] 성과를 닫고 작업실 새 글 플로우를 연다. 분석→행동이 한 번에 이어지게.
      var _npBtn = e.target.closest('[data-wsp-newpost]');
      if (_npBtn) {
        var _npId = _npBtn.getAttribute('data-wsp-newpost');
        var _npRow = _curRows.filter(function (x) { return String(x.id) === String(_npId); })[0];
        close(); _startNewPost(_npRow && _npRow.slot); return;
      }
      // [C5] 조용한 관심 → 캡션 고정멘트(예약 안내) 설정으로. 저장한 사람에게 길을 열어주는 유일한 수단.
      if (e.target.closest('[data-wsp-footer]')) {
        if (window.WorkspaceSettings && window.WorkspaceSettings.open) { close(); window.WorkspaceSettings.open(); }
        else toast('설정을 불러오지 못했어요');
        return;
      }
    });
    el.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    return el;
  }

  /* [2026-07-22 보스] 데이터 로드를 open() 에서 떼어냈다 — 새로고침 버튼·화면 복귀에서 같이 쓴다.
     manual=true 면 "불러오는 중" 스켈레톤 대신 기존 화면을 유지한 채 조용히 바꿔치기한다
     (스크롤 위치와 읽던 자리를 안 날리려고). */
  var _loading = false;
  var _lastLoadAt = 0;
  function _reload(manual) {
    var el = document.getElementById(ID);
    if (!el || _loading) return;
    _loading = true;
    var body = el.querySelector('[data-wsp-body]');
    if (body && !manual && !body.querySelector('.wsp-card')) body.innerHTML = '<div class="wsp-empty">성과를 불러오는 중…</div>';
    if (manual) toast('최신 성과를 가져오는 중…');
    Promise.all([_loadInsights(), _loadSlots(), _loadBookings(), _loadCommentQueue(), _loadDmLinks()]).then(function (res) {
      var insights = res[0], slots = res[1], bookings = res[2], cq = res[3], dmLinks = res[4];
      var rows = _buildRows(insights, slots);
      _attribute(rows, bookings);
      _attachInquiries(rows, cq);
      _attachDmLinks(rows, dmLinks);
      var cur = document.getElementById(ID);
      if (!cur) return;   // 로딩 중 닫힘
      _render(cur, insights, rows, cq, dmLinks);
      _lastLoadAt = Date.now();
    }).catch(function (err) {
      console.warn('[wsperf] load fail', err);
      var cur = document.getElementById(ID); if (!cur) return;
      var b = cur.querySelector('[data-wsp-body]');
      if (manual) toast('성과를 가져오지 못했어요 — 잠시 뒤 다시');
      else if (b) b.innerHTML = '<div class="wsp-empty">성과를 불러오지 못했어요. 잠시 뒤 다시 열어봐 주세요.</div>';
    }).then(function () { _loading = false; });
  }

  /* 앱으로 돌아왔을 때 자동 갱신. 인스타 지표는 자기 속도로 늦게 오므로 초 단위 폴링은 의미가 없고
     배터리·rate limit 만 먹는다 — '화면을 다시 볼 때 최신'이면 원장 체감으론 충분하다. 30초 쿨다운. */
  var _visBound = false;
  function _bindVisibility() {
    if (_visBound) return;
    _visBound = true;
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      var el = document.getElementById(ID);
      if (!el || !el.classList.contains('is-open')) return;
      if (Date.now() - _lastLoadAt < 30000) return;
      _reload(false);
    });
  }

  function open() {
    var el = _ensureMounted();
    var body = el.querySelector('[data-wsp-body]');
    if (body) body.innerHTML = '<div class="wsp-empty">성과를 불러오는 중…</div>';
    el.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(function () { el.classList.add('is-open'); });
    // 안드로이드 하드웨어 뒤로가기 등록 — 안 하면 back 시 앱이 그대로 종료된다(다른 오버레이와 동일 처리).
    if (typeof window._registerSheet === 'function') window._registerSheet('wsperf', close);
    if (typeof window._markSheetOpen === 'function') window._markSheetOpen('wsperf');
    _bindVisibility();
    _reload(false);
  }

  function close() {
    var el = document.getElementById(ID); if (!el) return;
    el.classList.remove('is-open'); el.setAttribute('aria-hidden', 'true');
    if (typeof window._markSheetClosed === 'function') window._markSheetClosed('wsperf');
  }

  window.WorkspacePerf = {
    open: open, close: close,
    _internals: {
      _attribute: _attribute, _buildRows: _buildRows, _matchSlot: _matchSlot, _agg: _agg,
      _layoutOf: _layoutOf, _photoCountOf: _photoCountOf, _attachInquiries: _attachInquiries, _score: _score,
      _capLenOf: _capLenOf, _tagCountOf: _tagCountOf, _hasSignal: _hasSignal,
      _attachDmLinks: _attachDmLinks, _compareHtml: _compareHtml, _axisHtml: _axisHtml,
      _ro: _ro, MIN_POSTS: MIN_POSTS, ANALYZE_DAYS: ANALYZE_DAYS,
    },
  };
})();
