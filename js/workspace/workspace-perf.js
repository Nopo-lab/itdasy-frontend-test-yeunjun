/* workspace-perf.js — 게시물별 성과 화면 (2026-07-14)
   작업실 홈 성과 버튼 → 여기. "좋아요가 실제 예약으로 이어졌나"를 게시물 단위로 본다.

   데이터 3갈래:
   ① GET /instagram/insights   → 게시물별 좋아요·댓글·저장·도달 + 썸네일 (posts = 최근 25건)
   ② loadSlotsFromDB()         → 그 게시물을 만들 때 쓴 말투(captionMeta.tone_override)·레이아웃
                                 (workspaceContext.templateLabel) — 발행 슬롯에 이미 저장돼 있음
   ③ GET /bookings             → 예약. created_at(예약을 '잡은' 시각)으로 귀속. starts_at 아님.

   ①↔② 연결 열쇠 = slot.publish.igMediaId (발행 시 저장 — workspace-v2-flow.js).
   옛 슬롯엔 없어서 캡션 앞글자 + 발행시각 근접으로 폴백.

   귀속 규칙(정직하게): 예약 created_at 직전 7일 안에 올라온 '가장 최근' 게시물 1건에만 준다(last-touch).
     → 한 예약이 여러 게시물에 중복으로 안 잡힌다. 인스타는 유입 경로를 안 알려주므로 어디까지나 추정.
     단, 발행 시 고객연결(slot.customer_id)한 예약은 추정이 아니라 '확정'으로 표시.

   DM·댓글 문의 분류는 잠금 — 아래 LOCK 주석 참고.
   .subscreen-overlay + ss-* 재사용 → PC 사이드바 자동 안전. window.WorkspacePerf.open(). */
(function () {
  'use strict';

  var ID = 'wsPerfOverlay';
  var WINDOW_DAYS = 7;              // 발행 후 며칠까지 그 게시물 덕으로 볼지
  var DAY = 86400000;

  // 말투 키 → 라벨. workspace-v2-flow.js _TONE_CHIPS 와 같은 집합.
  var TONE_LABEL = { friendly: '친근', professional: '전문', emotional: '감성', event: '이벤트', review: '후기', normal: '기본' };
  var PURPOSE_LABEL = { before_after: '전후', feed: '피드', review: '후기', event: '이벤트', story: '스토리', price: '가격표' };

  function esc(v) { return window._esc ? window._esc(v) : String(v == null ? '' : v); }
  function toast(m) { if (window.showToast) window.showToast(m); }

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

  // ── 연결(조인) ────────────────────────────────────────────
  function _norm(s) { return String(s == null ? '' : s).replace(/\s+/g, '').slice(0, 40); }

  function _publishedSlots(slots) {
    return (slots || []).filter(function (s) {
      return s && s.publish && (s.publish.status === 'published' || s.instagramPublished);
    });
  }

  /** 인스타 게시물 ↔ 우리 슬롯 매칭. id 우선, 없으면 캡션 앞글자, 그 다음 발행시각 근접(10분). */
  function _matchSlot(post, slots) {
    var byId = null, byCap = null, byTime = null;
    var pts = post.timestamp ? Date.parse(post.timestamp) : 0;
    var pcap = _norm(post.caption);
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i], pub = s.publish || {};
      if (pub.igMediaId && String(pub.igMediaId) === String(post.id)) { byId = s; break; }
      if (!byCap && pcap && _norm(s.caption) && _norm(s.caption) === pcap) byCap = s;
      if (!byTime && pts && pub.publishedAt && Math.abs(pub.publishedAt - pts) < 10 * 60000) byTime = s;
    }
    return byId || byCap || byTime || null;
  }

  function _toneOf(slot) {
    var t = slot && slot.captionMeta && slot.captionMeta.tone_override;
    return TONE_LABEL[t] ? t : (t ? t : 'normal');
  }
  function _layoutOf(slot) {
    if (!slot) return '';
    var wc = slot.workspaceContext || {};
    return wc.templateLabel || PURPOSE_LABEL[wc.templatePurpose] || PURPOSE_LABEL[wc.type] || '';
  }

  /**
   * 예약 → 게시물 귀속(last-touch). rows 는 발행시각 내림차순이어야 한다.
   * 각 예약은 딱 한 게시물에만 붙는다.
   */
  function _attribute(rows, bookings) {
    rows.forEach(function (r) { r.bookings = []; });
    (bookings || []).forEach(function (b) {
      if (!b || b.status === 'cancelled') return;
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
    var rows = posts.map(function (p) {
      var slot = _matchSlot(p, pub);
      var ts = p.timestamp ? Date.parse(p.timestamp) : 0;
      return {
        id: p.id, thumb: p.thumb_url || '', caption: p.caption || '', permalink: p.permalink || '',
        likes: p.like_count || 0, comments: p.comments_count || 0, saved: p.saved || 0, reach: p.reach || 0,
        publishedAt: ts || (slot && slot.publish && slot.publish.publishedAt) || 0,
        slot: slot, tone: slot ? _toneOf(slot) : null, layout: slot ? _layoutOf(slot) : '',
        title: (slot && (slot.service || slot.label)) || '', bookings: [], sureCount: 0
      };
    });
    rows.sort(function (a, b) { return b.publishedAt - a.publishedAt; });
    return rows;
  }

  /** 말투·레이아웃별 집계 — 게시물당 평균 예약. 도달(reach)은 비즈니스 계정 아니면 0이라 %는 안 쓴다. */
  function _agg(rows, keyFn) {
    var m = {};
    rows.forEach(function (r) {
      var k = keyFn(r);
      if (!k) return;
      if (!m[k]) m[k] = { key: k, posts: 0, bookings: 0, likes: 0 };
      m[k].posts++; m[k].bookings += r.bookings.length; m[k].likes += r.likes;
    });
    return Object.keys(m).map(function (k) {
      var o = m[k];
      o.perPost = o.posts ? o.bookings / o.posts : 0;
      o.likesPerPost = o.posts ? o.likes / o.posts : 0;
      return o;
    }).sort(function (a, b) { return b.perPost - a.perPost || b.likesPerPost - a.likesPerPost; });
  }

  // ── 그리기 ────────────────────────────────────────────────
  function _fmtDate(ms) {
    if (!ms) return '';
    var d = new Date(ms);
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
  }

  function _summaryHtml(rows) {
    var likes = 0, comments = 0, books = 0;
    rows.forEach(function (r) { likes += r.likes; comments += r.comments; books += r.bookings.length; });
    return '<div class="wsp-sum">' +
      '<div class="wsp-sum__tt">발행 ' + rows.length + '건이 이만큼 움직였어요</div>' +
      '<div class="wsp-sum__row">' +
        '<b>' + likes + '</b><span>좋아요</span>' +
        '<i class="ph-duotone ph-arrow-right"></i>' +
        '<b>' + comments + '</b><span>댓글</span>' +
        '<i class="ph-duotone ph-arrow-right"></i>' +
        '<b>' + books + '</b><span>예약</span>' +
      '</div></div>';
  }

  function _bestHtml(rows) {
    var scored = rows.filter(function (r) { return r.slot; });
    if (!scored.length) {
      return '<div class="wsp-empty">이 게시물들을 작업실에서 올린 기록이 없어서 말투·레이아웃은 아직 못 따져요. ' +
        '작업실에서 올린 글이 쌓이면 여기에 보여드릴게요.</div>';
    }
    var tones = _agg(scored, function (r) { return r.tone ? (TONE_LABEL[r.tone] || r.tone) : null; });
    var lays = _agg(scored, function (r) { return r.layout || null; });
    function card(label, top, icon) {
      if (!top) return '';
      return '<div class="wsp-best">' +
        '<div class="wsp-best__k">' + esc(label) + '</div>' +
        '<div class="wsp-best__v"><i class="ph-duotone ' + icon + '"></i>' + esc(top.key) + '</div>' +
        '<div class="wsp-best__m">게시물당 예약 <b>' + top.perPost.toFixed(1) + '건</b></div>' +
        '<div class="wsp-best__s">' + top.posts + '건 기준</div></div>';
    }
    var h = card('말투', tones[0], 'ph-chat-circle-text') + card('레이아웃', lays[0], 'ph-layout');
    if (!h) return '';
    return '<div class="wsp-bests">' + h + '</div>';
  }

  function _rowHtml(r) {
    var thumb = r.thumb
      ? '<img class="wsp-card__im" src="' + esc(r.thumb) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
      : '<div class="wsp-card__im wsp-card__im--none"><i class="ph-duotone ph-image"></i></div>';
    var chips = '';
    if (r.tone) chips += '<span class="wsp-chip">' + esc(TONE_LABEL[r.tone] || r.tone) + ' 말투</span>';
    if (r.layout) chips += '<span class="wsp-chip">' + esc(r.layout) + '</span>';
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

    return '<div class="wsp-card">' +
      '<div class="wsp-card__top">' + thumb +
        '<div class="wsp-card__meta">' +
          '<div class="wsp-card__tt">' + esc(r.title || (r.caption || '제목 없음').slice(0, 20)) + '</div>' +
          '<div class="wsp-chips">' + chips + '</div>' +
          '<div class="wsp-card__dt">' + _fmtDate(r.publishedAt) + ' 발행</div>' +
        '</div></div>' +
      '<div class="wsp-stats">' +
        '<span><i class="ph-duotone ph-heart"></i>' + r.likes + '</span>' +
        '<span><i class="ph-duotone ph-chat-circle"></i>' + r.comments + '</span>' +
        (r.saved ? '<span><i class="ph-duotone ph-bookmark-simple"></i>' + r.saved + '</span>' : '') +
        (r.reach ? '<span><i class="ph-duotone ph-eye"></i>' + r.reach + '</span>' : '') +
      '</div>' + conv + '</div>';
  }

  // [LOCK] DM·댓글 문의 분류 — 지금 켤 수 없는 이유를 원장님 말로 적어둔다.
  //   · 댓글 문의 분류: manage_comments 스코프 심사 대기(코드는 app-comment-reply-queue.js 에 이미 있음).
  //   · DM 유입: /dm/conversations 는 '마지막 대화 시각'만 줘서 '이 게시물 보고 처음 연락했는지'를 알 수 없다.
  //     게다가 DM 봇 자체가 Meta Advanced 심사 후 켜짐. 그래서 추정치도 안 만든다(가짜 숫자 금지).
  function _lockHtml() {
    return '<div class="wsp-lock">' +
      '<div class="wsp-lock__h"><i class="ph-duotone ph-lock-simple"></i>댓글·DM 문의 분류' +
        '<span class="wsp-lock__b">심사 대기</span></div>' +
      '<div class="wsp-lock__d">댓글 중에 가격·예약·위치를 묻는 문의만 골라내고, DM이 어느 게시물 보고 왔는지까지 ' +
        '이어주는 기능이에요. 인스타(Meta) 승인이 나면 자동으로 켜져요. 지금은 댓글 수만 보여요.</div></div>';
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

  // 기존 AI 인사이트(이탈 고객·매출 예측) 진입. 성과 버튼을 이 화면이 가져갔으므로 어느 상태에서든
  //   반드시 같이 그린다 — 게시물 0건일 때 이것마저 빠지면 AI 인사이트로 갈 길이 아예 없어진다.
  function _moreHtml() {
    return '<button type="button" class="wsp-more" data-wsp-ai>고객·매출 인사이트 보기 ›</button>';
  }

  function _render(el, insights, rows) {
    var body = el.querySelector('[data-wsp-body]');
    if (!body) return;
    if (!rows.length) { body.innerHTML = _emptyHtml(insights) + _lockHtml() + _moreHtml(); return; }
    body.innerHTML =
      _summaryHtml(rows) +
      _bestHtml(rows) +
      '<div class="wsp-sect">게시물별</div>' +
      rows.map(_rowHtml).join('') +
      _lockHtml() +
      _moreHtml();
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
        '<div class="ss-title">성과</div></header>' +
      '<div class="ss-body" data-wsp-body></div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-wsp-back]')) { close(); return; }
      // 기존 AI 인사이트(이탈 고객·매출 예측) 진입 — 성과 버튼을 이 화면이 가져가면서 갈 곳이 없어졌다.
      if (e.target.closest('[data-wsp-ai]')) {
        if (typeof window.openInsights === 'function') { close(); window.openInsights(); }
        else toast('인사이트를 불러오지 못했어요');
        return;
      }
    });
    el.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    return el;
  }

  function open() {
    var el = _ensureMounted();
    var body = el.querySelector('[data-wsp-body]');
    if (body) body.innerHTML = '<div class="wsp-empty">성과를 불러오는 중…</div>';
    el.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(function () { el.classList.add('is-open'); });

    Promise.all([_loadInsights(), _loadSlots(), _loadBookings()]).then(function (res) {
      var insights = res[0], slots = res[1], bookings = res[2];
      var rows = _buildRows(insights, slots);
      _attribute(rows, bookings);
      if (!document.getElementById(ID)) return;   // 로딩 중 닫힘
      _render(el, insights, rows);
    }).catch(function (err) {
      console.warn('[wsperf] load fail', err);
      var b = el.querySelector('[data-wsp-body]');
      if (b) b.innerHTML = '<div class="wsp-empty">성과를 불러오지 못했어요. 잠시 뒤 다시 열어봐 주세요.</div>';
    });
  }

  function close() {
    var el = document.getElementById(ID); if (!el) return;
    el.classList.remove('is-open'); el.setAttribute('aria-hidden', 'true');
  }

  window.WorkspacePerf = { open: open, close: close, _internals: { _attribute: _attribute, _buildRows: _buildRows, _matchSlot: _matchSlot, _agg: _agg } };
})();
