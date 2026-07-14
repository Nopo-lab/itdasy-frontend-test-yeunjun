/* Workspace V2 — 작업실 첫 화면 렌더러 (C3: 홈 상단 히어로/퀵/카테고리/라이브러리 재구성)
   의존: WorkspaceState (workspace-state.js), 기존 전역: loadSlotsFromDB / initWorkshopTab / showToast. */
(function () {
  'use strict';

  var ST = function () { return window.WorkspaceState; };
  var _filter = 'all';   // [conceptC] all | progress | done
  var _lastRoot = null;
  var _slotsCache = [];
  var _selectMode = false;          // [v547] 내 콘텐츠 일괄 작업 선택 모드
  var _selected = {};               // id → true
  var _enteredCardId = null;        // [v547] 카드→편집 진입 시 저장 → 복귀 후 그 카드로 스크롤 복원
  var _drawerSlotId = null;
  var DRAWER_HINT = '추천 작업부터 이어서 진행해요';
  // [요청1 2026-07-13] '인스타 미리보기'는 요청6에서 캡션 화면에 흡수됨 → preview 대신 caption 으로 딥링크.
  //   (안 그러면 캡션 완성 슬롯 '이어서 편집' 시 폐지된 단독 preview 화면으로 새어 '예전 화면' 처럼 보였음)
  var ACT2SCREEN = { '사진 편집':'edit', '누끼/배경':'edit', '비율 자르기':'edit', '템플릿':'edit', '게시글 생성':'caption', '인스타 미리보기':'caption', '고객 연결':'connect' };
  // [요청1 2026-07-13] 상태머신 preview/done 도 caption 으로(통합 화면 = 결과+발행+피드). 캡션 있는 슬롯은 open() 이 d.caption 복원 → 결과 화면 표시.
  var KEY2SCREEN = { upload:'upload', edit:'edit', caption:'caption', customer:'connect', preview:'caption', done:'caption' };

  // 카테고리 — 스펙에 맞춘 레이블 + 가격표는 준비중
  // TODO: assets/workshop-cats/cat-1.jpg ~ cat-5.jpg 파일을 원영님이 직접 넣어주세요 (1:1 매핑)
  var CATS = [
    { key: 'ba',     label: '전후 비교',      disabled: false, split: true },          // cat-1(전)+cat-2(후)
    { key: 'flex',   label: '시술 완료 사진', disabled: false, img: 'cat-3' },
    { key: 'review', label: '고객 후기 사진', disabled: false, img: 'cat-4' },
    { key: 'event',  label: '이벤트 홍보',   disabled: false, img: 'cat-5' },
    { key: 'price',  label: '가격표',         disabled: true  },
  ];

  function _esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (ch) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch];
    });
  }
  function _toast(msg) { if (window.showToast) window.showToast(msg); }

  function _thumb(slot) {
    // [이슈2] 전후 템플릿 적용본이 있으면 저장카드도 그 합성 결과를 보여준다.
    //   (원본 사진은 더 이상 합성본으로 덮어쓰지 않으므로 여기서 명시적으로 우선 참조)
    // [다중pair] 페어별 결과물 배열(templateOutputs)이 있으면 첫 결과물, 없으면 단일 templateOutput 폴백.
    if (slot.templateOutputs && slot.templateOutputs.length && slot.templateOutputs[0].outputUrl) return slot.templateOutputs[0].outputUrl;
    if (slot.templateOutput) return slot.templateOutput;
    var p = (slot.photos || [])[0];
    return p ? (p.editedDataUrl || p.dataUrl || '') : '';
  }
  function _roleHint(slot) {
    var n = (slot.photos || []).length;
    return n >= 2 ? '전후' : (n === 1 ? '홍보컷' : '사진 없음');
  }
  function _relTime(slot) {
    var t = slot.createdAt || slot.completedAt || 0;
    if (!t) return '';
    var d = Date.now() - t;
    if (d < 60000) return '방금 전';
    if (d < 3600000) return Math.floor(d / 60000) + '분 전';
    if (d < 86400000) return Math.floor(d / 3600000) + '시간 전';
    return Math.floor(d / 86400000) + '일 전';
  }

  /* ── 컴포넌트 ── */

  // [v531] 유형별 실제 템플릿 + 기본 템플릿 저장(localStorage). flow.js 와 공유(window).
  var CAT_TEMPLATES = {
    ba:     { ratio: '4:5', tpls: [{ id: 'wm-ba-feed', label: '전후 비교' }, { id: 'bp-ba-premium-infographic', label: '프리미엄 전후' }, { id: 'bp-ba-luxury-review', label: '럭셔리 후기 전후' }, { id: 'bp-ba-story-signature', label: '스토리 전후' }, { id: 'bp-ba-classic-poster', label: '클래식 포스터 전후' }, { id: 'bp-ba-care-guide', label: '케어 가이드 전후' }] },
    flex:   { ratio: '4:5', tpls: [{ id: 'wm-show-feed', label: '시술 자랑' }, { id: 'wm-promo-feed', label: '인스타 피드' }] },
    review: { ratio: '4:5', tpls: [{ id: 'wm-review-feed', label: '고객 후기' }] },
    event:  { ratio: '1:1', tpls: [{ id: 'wm-event-feed', label: '이벤트 안내' }] },
    price:  { ratio: '4:5', tpls: [] },
  };
  if (!window.WorkspaceDefaultTpl) {
    window.WorkspaceDefaultTpl = {
      cats: CAT_TEMPLATES,
      _k: function (cat) { return 'itdasy:wsv2_default_tpl_' + cat; },
      get: function (cat) { try { return localStorage.getItem(this._k(cat)) || ''; } catch (_e) { return ''; } },
      set: function (cat, id) { try { localStorage.setItem(this._k(cat), id); return true; } catch (_e) { return false; } },
    };
  }
  function _catThumb(c) {
    var info = CAT_TEMPLATES[c.key];
    if (!info || !info.tpls.length) return '<div class="wsv2-cat__thumb wsv2-cat__thumb--empty" aria-hidden="true"></div>';
    var def = window.WorkspaceDefaultTpl.get(c.key);
    var tpl = info.tpls.filter(function (t) { return t.id === def; })[0] || info.tpls[0];
    var url = '';
    try {
      if (window.PhotoEditorTemplateThumb && window.PhotoEditorTemplateThumb.make) {
        var shop = ''; try { shop = localStorage.getItem('shop_name') || ''; } catch (_e) { shop = ''; }
        url = window.PhotoEditorTemplateThumb.make({ id: tpl.id, label: tpl.label }, { ratio: info.ratio, shopName: shop }) || '';
      }
    } catch (_e2) { url = ''; }
    if (!url) return '<div class="wsv2-cat__thumb wsv2-cat__thumb--empty" aria-hidden="true"></div>';
    var isDef = !!def && def === tpl.id;
    return '<div class="wsv2-cat__thumb" aria-hidden="true" style="background-image:url(' + _esc(url) + ')">' +
      (isDef ? '<span class="wsv2-cat__defbadge">기본</span>' : '') + '</div>';
  }

  /* ── [conceptC] 작업실 홈 디자인 — 벤토 타일 + 입력바 + 콘텐츠 그리드 ── */
  var _CGO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
  // 슬롯 상태 → 그리드 점/태그(대기·편집·준비·완료)
  function _cStatus(slot) {
    var s = ST().deriveStatus(slot);
    if (s === 'published') return { k: 'done', tag: '완료' };
    if (s === 'ready') return { k: 'ready', tag: '업로드 준비' };
    if (s === 'upload_pending') return { k: 'wait', tag: '사진 대기' };
    return { k: 'edit', tag: '편집 중' };
  }
  function _sameMonth(slot) {
    var t = (slot.publish && slot.publish.publishedAt) || slot.completedAt || slot.createdAt || 0;
    if (!t) return false; var d = new Date(t), n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
  }
  function _shopInitial() {
    try { var s = localStorage.getItem('shop_name'); if (s && s.trim()) return _esc(s.trim().charAt(0).toUpperCase()); } catch (_e) { /* noop */ }
    return 'N';
  }

  // 콘텐츠 셀(그리드) — 썸네일 + 상태점 + 태그 + 상대시간. 탭 = 상세 드로어(기존).
  function _cardHTML(slot) {
    var st = _cStatus(slot);
    var img = _thumb(slot);
    var t = _relTime(slot);
    var sel = !!_selected[slot.id];
    var go = (st.k === 'done' || _selectMode) ? '' : '<span class="gGo">' + _CGO + '</span>';
    return '<button type="button" class="gCell' + (_selectMode ? ' gCell--select' : '') + (sel ? ' is-sel' : '') + '" data-wsv2-slot="' + _esc(slot.id) + '" data-haptic="light"' +
      (img ? ' style="background-image:url(' + _esc(img) + ')"' : '') + '>' +
      (_selectMode ? '<span class="gCheck" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>' : '') +
      '<span class="gDot gDot--' + st.k + '"></span>' + go +
      '<span class="gTag">' + _esc(st.tag) + '</span>' +
      (t ? '<span class="gTime">' + _esc(t) + '</span>' : '') +
      (img ? '' : '<span class="gCell__ph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></span>') +
      '</button>';
  }

  // 벤토 타일 — 이어서 하기(최근 진행중) + 이번 달 발행 + 글만 쓰기

  // 필터 — 전체 / 진행 중 / 완료


  // [인스타 피드 홈] 좌상단 + = 바로 업로드, 나머지 칸 = 우리가 만든 콘텐츠(정사각 타일).
  var _PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>';
  var _PHIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
  function _feedTile(slot) {
    var st = _cStatus(slot), img = _thumb(slot), sel = !!_selected[slot.id];
    // [manage 2026-07-14] 칩 = 상태 서술('편집 중')이 아니라 '다음 할 일'('캡션 생성'). 훑는 피드 → 처리하는 목록.
    //   WorkspaceState.nextAction 재사용(드로어·이어서와 같은 정본) — 새 매핑 만들지 않음.
    var na = (st.k === 'done') ? null : ST().nextAction(slot);
    return '<button type="button" class="wf-tile' + (_selectMode ? ' wf-tile--sel' : '') + (sel ? ' is-sel' : '') +
      '" data-wsv2-slot="' + _esc(slot.id) + '" data-haptic="light"' + (img ? ' style="background-image:url(' + _esc(img) + ')"' : '') + '>' +
      (_selectMode ? '<span class="wf-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>' : '') +
      (na ? '<span class="wf-chip wf-chip--' + st.k + '"><span class="wf-chip__dot"></span>' + _esc(na.label) + '</span>' : '') +
      (img ? '' : '<span class="wf-ph" aria-hidden="true">' + _PHIC + '</span>') +
      '</button>';
  }
  function _segsHTML(slots) {
    var done = slots.filter(function (s) { return _cStatus(s).k === 'done'; }).length;
    var F = [['all', '전체', slots.length], ['done', '발행됨', done], ['progress', '진행중', slots.length - done]];
    // [요청7 2026-07-13] 피드 정렬 진입 — 콘텐츠 2개 이상일 때. 저장된 내 콘텐츠 전체를 인스타 3열 그리드에 올려 순서 정렬·저장.
    var feedSort = (slots.length >= 2 && window.FeedPlanner)
      // [manage 2026-07-14] 아이콘 전용 — 세그 카운트가 붙어 행이 좁아짐(라벨 유지 시 375px 에서 2줄로 깨졌음). 성과 버튼과 동일 규격.
      ? '<button type="button" class="wf-feedsort" data-wsv2-feedsort data-haptic="light" aria-label="피드 정렬" title="피드 정렬"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></button>'
      : '';
    // [manage 2026-07-14] 성과 진입 — 볼 사람만. 전면에 지표를 깔지 않고 버튼 하나로.
    var perf = (typeof window.openInsights === 'function')
      ? '<button type="button" class="wf-perf" data-wsv2-insights data-haptic="light" aria-label="성과"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 5-6"/></svg></button>'
      : '';
    // [manage 2026-07-14] 세그에 카운트 — 업무량이 한눈에(카운트는 F 에 이미 계산돼 있었음).
    return '<div class="wf-segs">' + F.map(function (f) {
      return '<button type="button" class="wf-seg' + (_filter === f[0] ? ' on' : '') + '" data-wsv2-filter="' + f[0] + '">' +
        f[1] + '<span class="wf-seg__n">' + f[2] + '</span></button>';
    }).join('') + perf + feedSort + '</div>';
  }
  // [plum 2026-07-14] 이어서 작업 카드 — 진행 중 슬롯의 사진·편집·캡션·발행 4단계 파이프라인(홈 시그니처).
  function _pipe(slot) {
    var photos = (slot.photos || []);
    var steps = [
      photos.length > 0,
      photos.some(function (p) { return p && (p.editedDataUrl || p.storyEdited || p.cropMeta); }),
      !!(slot.caption && String(slot.caption).trim()),
      _isPub(slot)
    ];
    var labels = ['사진 올리는 중', '편집하는 중', '캡션 쓰는 중', '발행 대기'];
    var cur = steps.indexOf(false); if (cur < 0) cur = 3;
    return { steps: steps, cur: cur, label: labels[cur] };
  }
  function _resumeCardHTML(slots) {
    var cand = slots.filter(function (s) { return !_isPub(s) && (s.photos || []).length; });
    if (!cand.length) return '';
    cand.sort(function (a, b) { return (b.createdAt || b.completedAt || 0) - (a.createdAt || a.completedAt || 0); });
    var slot = cand[0], pipe = _pipe(slot), img = _thumb(slot);
    var bar = pipe.steps.map(function (done, i) {
      return '<span class="wf-resume__seg' + (done ? ' is-done' : (i === pipe.cur ? ' is-cur' : '')) + '"></span>';
    }).join('');
    return '<button type="button" class="wf-resume" data-wsv2-resume="' + _esc(slot.id) + '" data-haptic="light">' +
      '<span class="wf-resume__thumb"' + (img ? ' style="background-image:url(' + _esc(img) + ')"' : '') + '></span>' +
      '<span class="wf-resume__body">' +
        '<span class="wf-resume__eyebrow">이어서 작업</span>' +
        '<span class="wf-resume__title">' + _esc(slot.label || '제목 없음') + '</span>' +
        '<span class="wf-resume__bar">' + bar + '<span class="wf-resume__step">' + _esc(pipe.label) + '</span></span>' +
      '</span>' +
      '<span class="wf-resume__go">이어서</span>' +
    '</button>';
  }
  function _shellHTML(slots) {
    var visible = _filter === 'all' ? slots : slots.filter(function (s) {
      var d = _cStatus(s).k === 'done'; return _filter === 'done' ? d : !d;
    });
    // [버그9 2026-07-14] 인스타 피드처럼 최신이 위로 — 기존엔 slots 순서를 그대로 써서 '+ 새 게시물' 옆에 가장 오래된 게 붙었음.
    //   (이어서카드는 이미 최신순 정렬하는데 그리드만 안 해서 순서가 반대로 보였다.) 원본 배열 오염 방지로 slice() 후 정렬.
    visible = visible.slice().sort(function (a, b) {
      return (b.createdAt || b.completedAt || 0) - (a.createdAt || a.completedAt || 0);
    });
    var doneN = slots.filter(function (s) { return _cStatus(s).k === 'done'; }).length;
    var monthN = slots.filter(function (s) { return _cStatus(s).k === 'done' && _sameMonth(s); }).length;
    // [manage 2026-07-14] 할 일 = 아직 발행 안 된 콘텐츠 수. 열자마자 "뭘 해야 하는지"가 숫자로 보이게.
    var todoN = slots.length - doneN;
    var addCell = '<button type="button" class="wf-add" data-wsv2-upload data-haptic="medium" aria-label="새 게시물 업로드">' +
      '<span class="wf-add__ic">' + _PLUS + '</span><span class="wf-add__t">새 게시물</span></button>';
    var feed = '<div class="wf-feed">' + addCell + visible.map(_feedTile).join('') + '</div>';
    return '' +
      '<section class="wsv2 wshc wshc--feed" data-wsv2-root>' +
        '<div class="wshc-phead">' +
          '<div class="wshc-ava wshc-ava--lg">' + _shopInitial() + '</div>' +
          '<div class="wshc-pinfo"><div class="wshc-phandle">내 작업실</div><div class="wshc-pstat">' +
            (todoN ? '<b class="wshc-todo">할 일 ' + todoN + '</b> · ' : '') + '이번 달 발행 ' + monthN + '</div></div>' +
          '<button type="button" class="wshc-gear" data-wsv2-settings data-haptic="light" aria-label="작업실 설정"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>' +
          (slots.length ? '<button type="button" class="wshc-seltoggle' + (_selectMode ? ' on' : '') + '" data-wsv2-selecttoggle>' + (_selectMode ? '취소' : '선택') + '</button>' : '') +
        '</div>' +
        _resumeCardHTML(slots) +
        _segsHTML(slots) +
        '<input type="file" accept="image/*" multiple data-wsv2-file hidden>' +
        feed +
        (_selectMode ? _bulkBarHTML() : '') +
      '</section>';
  }
  // [v547] 일괄 작업 하단 sticky action bar — 선택된 카드에만 적용.
  function _bulkBarHTML() {
    var n = Object.keys(_selected).length;
    return '<div class="wsv2-bulkbar' + (n ? ' on' : '') + '">' +
      '<span class="wsv2-bulkbar__n">' + n + '개 선택</span>' +
      '<div class="wsv2-bulkbar__acts">' +
        '<button type="button" data-wsv2-bulk="publish"' + (n ? '' : ' disabled') + '>게시 완료</button>' +
        '<button type="button" data-wsv2-bulk="unpublish"' + (n ? '' : ' disabled') + '>해제</button>' +
        '<button type="button" class="wsv2-bulkbar__del" data-wsv2-bulk="delete"' + (n ? '' : ' disabled') + '>삭제</button>' +
      '</div>' +
    '</div>';
  }

  /* ── [버그2] 홈 스크롤 위치 보존 — render()가 innerHTML 통째 교체로 맨 위로 튕기던 문제 ── */
  var _homeScrollY = 0;
  var _scrollHostEl = null;
  function _findScrollHost(root) {
    var node = root;
    while (node && node !== document.body && node !== document.documentElement) {
      var oy = '';
      try { oy = getComputedStyle(node).overflowY; } catch (_e) { /* noop */ }
      if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && (node.scrollHeight - node.clientHeight) > 4) return node;
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }
  function _isDocHost(h) { return h === document.documentElement || h === document.scrollingElement || h === document.body; }
  function _hostTop(h) { return _isDocHost(h) ? (window.scrollY || (document.scrollingElement || document.documentElement).scrollTop || 0) : (h.scrollTop || 0); }
  function _bindHomeScroll(root) {
    var host = _findScrollHost(root);
    if (!host || _scrollHostEl === host) { _scrollHostEl = host; return; }
    _scrollHostEl = host;
    var tgt = _isDocHost(host) ? window : host;
    tgt.addEventListener('scroll', function () { _homeScrollY = _hostTop(host); }, { passive: true });
  }
  // [v547] 카드→편집 진입 후 복귀 시 그 카드로 정밀 스크롤(삭제됐으면 _homeScrollY 근처 복원으로 폴백).
  function _scrollToEnteredCard() {
    var id = _enteredCardId; if (!id || !_lastRoot) return;
    _enteredCardId = null;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        var sel = '[data-wsv2-slot="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]';
        var card = _lastRoot.querySelector(sel);
        if (card && card.scrollIntoView) { try { card.scrollIntoView({ block: 'center', behavior: 'auto' }); } catch (_e) { try { card.scrollIntoView(); } catch (_e2) { /* ignore */ } } }
      });
    });
  }
  function _restoreHomeScroll() {
    var host = _scrollHostEl; if (!host || !_homeScrollY) return;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        var max = Math.max(0, host.scrollHeight - host.clientHeight);
        var y = Math.min(_homeScrollY, max);
        if (_isDocHost(host)) window.scrollTo(0, y); else host.scrollTop = y;
      });
    });
  }

  /* ── 렌더 ── */
  function render(root, opts) {
    if (!root) return;
    _lastRoot = root;
	    _slotsCache = (opts && opts.slots) || [];
	    root.innerHTML = _shellHTML(_slotsCache);
	    _bind(root);
	    _bindHeroFile(root);
	    _bindHomeScroll(root);   // [버그2] 스크롤 호스트에 1회 캡처 리스너
	    _restoreHomeScroll();    // [버그2] 재렌더 후 이전 스크롤 위치 복원
	    _scrollToEnteredCard();  // [v547] 카드에서 진입했었다면 복귀 후 그 카드로 정밀 복원
	  }

	  function refresh() {
	    if (typeof initWorkshopTab === 'function') { Promise.resolve(initWorkshopTab()).catch(function () {}); return; }
	    if (!_lastRoot || typeof loadSlotsFromDB !== 'function') return;
	    Promise.resolve(loadSlotsFromDB()).then(function (s) { render(_lastRoot, { slots: s || [] }); }).catch(function () {});
	  }

	  function _pickHeroFiles(root) {
	    var input = root && root.querySelector('[data-wsv2-file]');
	    if (!input) { _launchFlow(null, 'upload', null); return; }
	    input.click();
	  }

	  function _bindHeroFile(root) {
	    var input = root && root.querySelector('[data-wsv2-file]');
	    if (!input || input._wsv2Bound) return;
	    input._wsv2Bound = true;
	    input.addEventListener('change', function (e) {
	      var files = Array.from(e.target.files || []);
	      e.target.value = '';
	      if (!files.length) return;
	      // [v564·필수1] 시작하기→파일선택 후 중간 업로드 화면 없이 바로 편집 창으로.
	      // [cleanup] 심플 플로우 상시 — 시작하기→파일선택 후 바로 캡션 생성으로.
      _launchFlow(null, 'caption', null, { files: files });
	    });
	  }

	  function _bind(root) {
    root.onclick = function (e) {
      // [작업실 설정] 톱니 → 설정 화면
      if (e.target.closest('[data-wsv2-settings]')) {
        if (window.WorkspaceSettings && window.WorkspaceSettings.open) window.WorkspaceSettings.open();
        else _toast('설정을 불러오지 못했어요');
        return;
      }
      // [요청7] 피드 정렬 — 저장된 내 콘텐츠 전체를 3열 그리드에 올려 정렬·저장.
      if (e.target.closest('[data-wsv2-feedsort]')) { _openFeedPlanner(); return; }
      // [v547] 일괄 작업 — 선택 모드 토글 / 일괄 액션 / 선택 모드 카드 탭 = 선택
      if (e.target.closest('[data-wsv2-selecttoggle]')) {
        _selectMode = !_selectMode; if (!_selectMode) _selected = {};
        render(_lastRoot, { slots: _slotsCache }); return;
      }
      var bulk = e.target.closest('[data-wsv2-bulk]');
      if (bulk) { _onBulk(bulk.getAttribute('data-wsv2-bulk')); return; }
      if (_selectMode) {
        var selCard = e.target.closest('[data-wsv2-slot]');
        if (selCard) { var sid0 = selCard.getAttribute('data-wsv2-slot'); if (_selected[sid0]) delete _selected[sid0]; else _selected[sid0] = true; render(_lastRoot, { slots: _slotsCache }); return; }
      }
      // 카테고리 클릭 — 타입 프리셋으로 플로우 진입
      var catBtn = e.target.closest('[data-wsv2-cat]');
      if (catBtn) {
        var ck = catBtn.getAttribute('data-wsv2-cat');
        if (ck === 'price') { if (window.WorkspaceAdapter) window.WorkspaceAdapter.openPriceList(); else _toast('가격표 기능을 불러오지 못했어요'); return; }
        _launchFlow(null, 'upload', ck); return;
      }
      // 히어로 업로드 CTA
	      if (e.target.closest('[data-wsv2-upload]')) { _pickHeroFiles(root); return; }
      // [성과 2026-07-14] 게시물별 성과 화면(workspace-perf.js). 예전엔 openInsights(고객·매출 인사이트)로
      //   바로 갔는데, 원장님이 성과에서 보고 싶은 건 '내가 올린 글이 예약으로 이어졌나'였다.
      //   기존 AI 인사이트는 그 화면 맨 아래 '고객·매출 인사이트 보기' 로 살려둠(진입 소실 방지).
      if (e.target.closest('[data-wsv2-insights]')) {
        try {
          if (window.WorkspacePerf && window.WorkspacePerf.open) window.WorkspacePerf.open();
          else if (typeof window.openInsights === 'function') window.openInsights();
        } catch (_e) { void _e; }
        return;
      }
      // 퀵 버튼
      var quick = e.target.closest('[data-wsv2-quick]');
      if (quick) {
        var qk = quick.getAttribute('data-wsv2-quick');
        if (qk === 'itbi') {
          // 잇비 챗봇으로 위임
          if (window.openAssistant) window.openAssistant();
          else if (typeof openItbiTab === 'function') openItbiTab();
          else _toast('잇비를 불러오지 못했어요');
          return;
	        }
        if (qk === 'textonly') {
          // 사진 없이 게시글만 — 플로우 진입 시 사진종류 축 없이
          _launchFlow(null, 'caption', null, { textOnly: true }); return;
        }
        return;
      }
      // 필터 탭
      var tab = e.target.closest('[data-wsv2-filter]');
      if (tab) { _filter = tab.getAttribute('data-wsv2-filter'); render(_lastRoot, { slots: _slotsCache }); return; }
      // "이어서" 버튼 — 직접 해당 단계 진입
      var resume = e.target.closest('[data-wsv2-resume]');
      if (resume) { e.stopPropagation(); var sid = resume.getAttribute('data-wsv2-resume'); _resumeSlot(sid); return; }
      // 카드 탭 — Lightbox(풀스크린 보기) 오픈. 오류/이미지 없으면 드로어로 폴백.
      var card = e.target.closest('[data-wsv2-slot]');
      if (card) { _openLightbox(card.getAttribute('data-wsv2-slot')); return; }
    };
  }

  // [Lightbox] 콘텐츠 타일 탭 → 풀스크린 보기(사진 스와이프) + '이어서 편집'. 화면 잘림 방지로 사이드바 위(z 10005).
  var _lbEl = null;
  function _slotImages(slot) {
    var out = [];
    if (slot.templateOutputs && slot.templateOutputs.length) slot.templateOutputs.forEach(function (o) { if (o.outputUrl) out.push(o.outputUrl); });
    else if (slot.templateOutput) out.push(slot.templateOutput);
    (slot.photos || []).forEach(function (p) { var u = p && (p.editedDataUrl || p.dataUrl); if (u && out.indexOf(u) < 0) out.push(u); });
    return out;
  }
  function _closeLightbox() { if (_lbEl && _lbEl.parentNode) _lbEl.parentNode.removeChild(_lbEl); _lbEl = null; try { if (window._markSheetClosed) window._markSheetClosed('wshcLightbox'); } catch (_e) { void _e; } }
  function _openLightbox(slotId) {
    try {
      var slot = _slotsCache.filter(function (s) { return s.id === slotId; })[0]; if (!slot) return;
      var imgs = _slotImages(slot); if (!imgs.length) { _openDrawer(slotId); return; }
      _closeLightbox();
      var idx = 0;
      var ov = document.createElement('div'); ov.className = 'wshc-lb';
      ov.innerHTML = '<button type="button" class="wshc-lb__x" data-lb-close aria-label="닫기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>' +
        '<div class="wshc-lb__stage">' + imgs.map(function (u, i) { return '<div class="wshc-lb__slide' + (i === 0 ? ' on' : '') + '" style="background-image:url(' + _esc(u) + ')"></div>'; }).join('') + '</div>' +
        (imgs.length > 1 ? '<div class="wshc-lb__dots">' + imgs.map(function (u, i) { return '<span' + (i === 0 ? ' class="on"' : '') + '></span>'; }).join('') + '</div>' : '') +
        '<div class="wshc-lb__bar"><button type="button" class="wshc-lb__edit" data-lb-edit>이어서 편집 →</button></div>';
      document.body.appendChild(ov); _lbEl = ov;
      // [#1] 시스템/하드웨어 back 으로 라이트박스가 먼저 닫히게 등록 → 뒤로가기 시 작업실 홈으로.
      try { if (window._registerSheet) window._registerSheet('wshcLightbox', _closeLightbox); if (window._markSheetOpen) window._markSheetOpen('wshcLightbox'); } catch (_e) { void _e; }
      (window.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(function () { ov.classList.add('is-open'); });
      var go = function (n) { idx = Math.max(0, Math.min(imgs.length - 1, n)); ov.querySelectorAll('.wshc-lb__slide').forEach(function (s, i) { s.classList.toggle('on', i === idx); }); ov.querySelectorAll('.wshc-lb__dots span').forEach(function (dd, i) { dd.classList.toggle('on', i === idx); }); };
      ov.addEventListener('click', function (e) {
        if (e.target.closest('[data-lb-edit]')) { _closeLightbox(); _openDrawer(slotId); return; }
        if (e.target.closest('[data-lb-close]') || e.target === ov) { _closeLightbox(); return; }
      });
      var sx = 0; var stage = ov.querySelector('.wshc-lb__stage');
      stage.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
      stage.addEventListener('touchend', function (e) { var dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 40) go(idx + (dx < 0 ? 1 : -1)); }, { passive: true });
    } catch (_e) { _openDrawer(slotId); }
  }

  function _launchFlow(slotId, screen, cat, extra) {
    if (slotId) _enteredCardId = slotId;   // [v547] 복귀 시 이 카드로 스크롤 복원
    var slot = slotId ? _slotsCache.filter(function (s) { return s.id === slotId; })[0] : null;
    if (window.WorkspaceFlow && typeof window.WorkspaceFlow.open === 'function') {
      _closeDrawer();
      window.WorkspaceFlow.open(Object.assign({ slot: slot, startScreen: screen || 'upload', cat: cat || null }, extra || {}));
    } else { _toast('작업실 플로우를 불러오지 못했어요'); }
  }

  // 상태머신 기반 이어서 진입
  function _resumeSlot(slotId) {
    var slot = _slotsCache.filter(function (s) { return s.id === slotId; })[0];
    if (!slot) return;
    var st = ST();
    var next = st.nextAction(slot);
    var screen = KEY2SCREEN[next.key] || 'edit';
    _launchFlow(slotId, screen, null);
  }

  // [요청7 2026-07-13] 피드 정렬 — 저장된 내 콘텐츠 전체를 인스타 3열 그리드에 올려 드래그로 순서 정렬·저장(홈 진입).
  //   기존엔 '현재 작업 사진'만 정렬하고 저장도 안 됐음 → 저장된 슬롯 커버 전체 + 순서 영구저장(itdasy:feed_order).
  function _feedOrderIds() { try { var a = JSON.parse(localStorage.getItem('itdasy:feed_order') || '[]'); return Array.isArray(a) ? a : []; } catch (_e) { return []; } }
  function _orderedSlotsForFeed() {
    var slots = (_slotsCache || []).slice();
    var order = _feedOrderIds(); if (!order.length) return slots;
    var byId = {}; slots.forEach(function (s) { byId[s.id] = s; });
    var out = [];
    order.forEach(function (id) { if (byId[id]) { out.push(byId[id]); delete byId[id]; } });   // 저장된 순서 먼저
    slots.forEach(function (s) { if (byId[s.id]) out.push(s); });                               // 이후 생긴 콘텐츠는 뒤에
    return out;
  }
  function _openFeedPlanner() {
    if (!window.FeedPlanner || typeof window.FeedPlanner.open !== 'function') { _toast('피드 플래너를 불러오지 못했어요'); return; }
    var ordered = _orderedSlotsForFeed();
    var covers = [], urlToId = {};
    ordered.forEach(function (s) { var t = _thumb(s); if (t && !urlToId[t]) { covers.push(t); urlToId[t] = s.id; } });   // 커버 중복 슬롯은 첫 것만(URL 역매핑 유일성)
    if (covers.length < 2) { _toast('정렬하려면 콘텐츠가 2개 이상 필요해요'); return; }
    window.FeedPlanner.open({
      photos: covers, newCount: 0, handle: '내 작업물',
      onSave: function (order) {
        var ids = (order || []).map(function (u) { return urlToId[u]; }).filter(Boolean);
        try { localStorage.setItem('itdasy:feed_order', JSON.stringify(ids)); } catch (_e) { void _e; }
        _toast('피드 순서를 저장했어요');
      }
    });
  }

  function _onDrawerAct(actKey) {
    // [v542] 콘텐츠 관리 액션 — 게시 완료 토글 / 삭제(확인).
    if (actKey === '게시 완료' || actKey === '게시 완료 해제') { _togglePublished(_drawerSlotId, actKey === '게시 완료'); return; }
    if (actKey === '삭제') { _confirmDelete(_drawerSlotId); return; }
    var screen;
    if (actKey === 'next') {
      var slot = _slotsCache.filter(function (s) { return s.id === _drawerSlotId; })[0];
      var k = slot ? ST().nextAction(slot).key : 'edit';
      screen = KEY2SCREEN[k] || 'edit';
    } else { screen = ACT2SCREEN[actKey] || 'edit'; }
    // [v540] 편집 버튼 의도별 딥링크 — 사진편집/누끼·배경/비율자르기/템플릿이 각자 위치로 진입(기존 콘텐츠 유지).
    var FOCUS = { '사진 편집': 'photo-edit', '누끼/배경': 'background', '비율 자르기': 'crop', '템플릿': 'template' };
    var extra = FOCUS[actKey] ? { focus: FOCUS[actKey] } : null;
    _launchFlow(_drawerSlotId, screen, null, extra);
  }

  // [v542] 게시 완료 토글 — slot.publish 상태를 IndexedDB(saveSlotToDB)에 영구 저장 → 카드 green badge 유지.
  function _togglePublished(slotId, on) {
    var slot = _slotsCache.filter(function (s) { return s.id === slotId; })[0];
    if (!slot) return;
    if (on) { slot.publish = slot.publish || {}; slot.publish.status = 'published'; slot.publish.publishedAt = Date.now(); slot.status = 'published'; slot.instagramPublished = true; }
    else { if (slot.publish) slot.publish.status = 'draft'; if (slot.status === 'published') slot.status = null; slot.instagramPublished = false; }
    if (typeof window.saveSlotToDB === 'function') { Promise.resolve(window.saveSlotToDB(slot)).catch(function () {}); }
    _closeDrawer();
    if (_lastRoot) render(_lastRoot, { slots: _slotsCache });
    _toast(on ? '게시 완료로 표시했어요' : '게시 완료를 해제했어요');
  }
  // [v542] 삭제 — 확인 시트 후 IndexedDB(deleteSlotFromDB)에서 영구 제거(새로고침 후에도 유지).
  function _confirmDelete(slotId) {
    var slot = _slotsCache.filter(function (s) { return s.id === slotId; })[0];
    if (!slot) return;
    var ov = document.createElement('div');
    ov.className = 'wsv2-confirm'; ov.setAttribute('data-wsv2-confirm', '');
    ov.innerHTML =
      '<div class="wsv2-confirm__backdrop" data-wsv2-confirm-cancel></div>' +
      '<div class="wsv2-confirm__sheet" role="dialog" aria-label="콘텐츠 삭제 확인">' +
        '<div class="wsv2-confirm__title">이 콘텐츠를 삭제할까요?</div>' +
        '<div class="wsv2-confirm__desc">삭제하면 작업실에서 다시 볼 수 없어요.</div>' +
        '<div class="wsv2-confirm__btns">' +
          '<button type="button" class="wsv2-confirm__cancel" data-wsv2-confirm-cancel>취소</button>' +
          '<button type="button" class="wsv2-confirm__ok" data-wsv2-confirm-ok="' + _esc(slotId) + '">삭제</button>' +
        '</div></div>';
    document.body.appendChild(ov);
    requestAnimationFrame(function () { ov.classList.add('open'); });
    ov.addEventListener('click', function (e) {
      if (e.target.closest('[data-wsv2-confirm-cancel]')) { _closeConfirm(); return; }
      var ok = e.target.closest('[data-wsv2-confirm-ok]');
      if (ok) { _doDelete(ok.getAttribute('data-wsv2-confirm-ok')); _closeConfirm(); }
    });
  }
  function _closeConfirm() { var c = document.querySelector('[data-wsv2-confirm]'); if (c && c.parentNode) c.parentNode.removeChild(c); }
  function _doDelete(slotId) {
    _slotsCache = _slotsCache.filter(function (s) { return s.id !== slotId; });   // 낙관적 즉시 제거
    if (typeof window.deleteSlotFromDB === 'function') { Promise.resolve(window.deleteSlotFromDB(slotId)).catch(function () {}); }
    _closeDrawer();
    if (_lastRoot) render(_lastRoot, { slots: _slotsCache });
    _toast('콘텐츠를 삭제했어요');
  }
  // [v547] 게시 상태만 변경/저장(렌더 없음) — 단일/일괄 공용.
  function _setPublished(slot, on) {
    if (!slot) return;
    if (on) { slot.publish = slot.publish || {}; slot.publish.status = 'published'; slot.publish.publishedAt = Date.now(); slot.status = 'published'; slot.instagramPublished = true; }
    else { if (slot.publish) slot.publish.status = 'draft'; if (slot.status === 'published') slot.status = null; slot.instagramPublished = false; }
    if (typeof window.saveSlotToDB === 'function') { Promise.resolve(window.saveSlotToDB(slot)).catch(function () {}); }
  }
  // [v547] 일괄 작업 — 선택된 카드에만 게시완료/해제/삭제 적용(IndexedDB 영속).
  function _onBulk(action) {
    var ids = Object.keys(_selected); if (!ids.length) return;
    if (action === 'delete') { _confirmBulk(ids); return; }
    var on = action === 'publish';
    ids.forEach(function (id) { _setPublished(_slotsCache.filter(function (s) { return s.id === id; })[0], on); });
    _selectMode = false; _selected = {};
    if (_lastRoot) render(_lastRoot, { slots: _slotsCache });
    _toast(on ? ids.length + '개를 게시 완료로 표시했어요' : ids.length + '개의 게시 완료를 해제했어요');
  }
  function _confirmBulk(ids) {
    _showConfirm(ids.length + '개 콘텐츠를 삭제할까요?', '삭제하면 작업실에서 다시 볼 수 없어요.', function () {
      _slotsCache = _slotsCache.filter(function (s) { return ids.indexOf(s.id) < 0; });
      if (typeof window.deleteSlotFromDB === 'function') { ids.forEach(function (id) { Promise.resolve(window.deleteSlotFromDB(id)).catch(function () {}); }); }
      _selectMode = false; _selected = {};
      if (_lastRoot) render(_lastRoot, { slots: _slotsCache });
      _toast(ids.length + '개를 삭제했어요');
    });
  }
  // [v547] 범용 확인 시트(단일 삭제·일괄 삭제 공용).
  function _showConfirm(title, desc, onOk) {
    _closeConfirm();
    var ov = document.createElement('div');
    ov.className = 'wsv2-confirm'; ov.setAttribute('data-wsv2-confirm', '');
    ov.innerHTML =
      '<div class="wsv2-confirm__backdrop" data-wsv2-confirm-cancel></div>' +
      '<div class="wsv2-confirm__sheet" role="dialog" aria-label="확인">' +
        '<div class="wsv2-confirm__title">' + _esc(title) + '</div>' +
        '<div class="wsv2-confirm__desc">' + _esc(desc) + '</div>' +
        '<div class="wsv2-confirm__btns">' +
          '<button type="button" class="wsv2-confirm__cancel" data-wsv2-confirm-cancel>취소</button>' +
          '<button type="button" class="wsv2-confirm__ok" data-wsv2-confirm-go>삭제</button>' +
        '</div></div>';
    document.body.appendChild(ov);
    requestAnimationFrame(function () { ov.classList.add('open'); });
    ov.addEventListener('click', function (e) {
      if (e.target.closest('[data-wsv2-confirm-cancel]')) { _closeConfirm(); return; }
      if (e.target.closest('[data-wsv2-confirm-go]')) { _closeConfirm(); onOk(); }
    });
  }

  /* ── V2 카드 상세 drawer ── */
  function _drawerEl() {
    var el = document.getElementById('wsv2Drawer');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'wsv2Drawer';
    el.className = 'wsv2 wsv2-drawer';
    el.innerHTML = '<div class="wsv2-drawer__bd" data-wsv2-drawer-close></div>' +
      '<div class="wsv2-drawer__card" id="wsv2DrawerCard"></div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-wsv2-drawer-close]')) { _closeDrawer(); return; }
      var act = e.target.closest('[data-wsv2-act]');
      if (act) { _onDrawerAct(act.getAttribute('data-wsv2-act')); return; }
    });
    return el;
  }

  function _openDrawer(slotId) {
    var slot = _slotsCache.filter(function (s) { return s.id === slotId; })[0];
    if (!slot) return;
    _drawerSlotId = slotId;
    var st = ST();
    var meta = st.statusMeta(st.deriveStatus(slot));
    var next = st.nextAction(slot);
    var img = _thumb(slot);
    var pub = _isPub(slot);
    // [#6] 실제 작업 흐름 4단계 — 편집도구(누끼/비율/템플릿)는 편집기 안에 있으니 '사진 편집' 하나로 통합.
    var editDone = (slot.photos || []).some(function (p) { return p && (p.editedDataUrl || p.storyEdited || p.cropMeta); });
    var capDone = !!(slot.caption && String(slot.caption).trim());
    var STEPS = [
      { act: '사진 편집', label: '사진 편집', done: editDone, hint: '다시 편집' },
      { act: '게시글 생성', label: '게시글 생성', done: capDone, hint: '수정' },
      { act: '인스타 미리보기', label: '미리보기·게시', done: pub, hint: '보기' },
      { act: '고객 연결', label: '고객 연결', done: !!slot.customer_id, hint: '연결' }
    ];
    var curIdx = -1; for (var _i = 0; _i < STEPS.length; _i++) { if (!STEPS[_i].done) { curIdx = _i; break; } }
    var CHK = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
    var CHV = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
    var steps = STEPS.map(function (s, i) {
      var badge = s.done
        ? '<span style="width:26px;height:26px;border-radius:50%;background:#F0FBF4;color:#0F6E56;display:grid;place-items:center;flex:none">' + CHK + '</span>'
        : '<span style="width:26px;height:26px;border-radius:50%;flex:none;display:grid;place-items:center;font-size:12px;font-weight:700;' + (i === curIdx ? 'background:var(--brand-bg,#F7EFF0);color:var(--brand-strong,#BC6675);border:1.5px solid var(--brand-strong,#BC6675)' : 'background:var(--surface-2,#F4F5F7);color:var(--text-subtle,#8A939F)') + '">' + (i + 1) + '</span>';
      var right = s.done ? '<span style="font-size:12px;color:var(--text3,#8A939F)">' + _esc(s.hint) + '</span>'
        : '<span style="color:var(--text3,#98A1AC);display:flex">' + CHV + '</span>';
      return '<button type="button" data-wsv2-act="' + _esc(s.act) + '" style="display:flex;align-items:center;gap:11px;padding:10px 2px;background:none;border:0;' + (i ? 'border-top:0.5px solid var(--border,rgba(0,0,0,.06));' : '') + 'width:100%;text-align:left;cursor:pointer">' +
        badge +
        '<span style="flex:1;font-size:14px;font-weight:' + (i === curIdx ? '700' : '500') + ';color:var(--text,#191F28)">' + _esc(s.label) + (i === curIdx ? ' <span style="font-size:11px;font-weight:700;color:var(--accent-strong,#BC6675)">· 남은 단계</span>' : '') + '</span>' +
        right + '</button>';
    }).join('');
    var html = '' +
      '<div class="wsv2-drawer__grip"></div>' +
      '<div class="wsv2-drawer__hero"' + (img ? ' style="background-image:url(' + _esc(img) + ')"' : '') + '>' +
        (img ? '' : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>') + '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin:2px 0 3px">' +
        '<span style="font-size:16px;font-weight:800;color:var(--text,#191F28)">' + _esc(slot.label || '제목 없음') + '</span>' +
        '<span class="wsv2-badge wsv2-badge--' + meta.tone + '">' + _esc(meta.label) + '</span></div>' +
      '<div class="wsv2-drawer__status" style="margin-bottom:14px">' + (slot.photos || []).length + '장 · ' + _esc(_roleHint(slot)) +
        (_relTime(slot) ? ' · 수정 ' + _esc(_relTime(slot)) : '') + '</div>' +
      '<div style="font-size:11px;font-weight:700;color:var(--text3,#8A939F);margin-bottom:4px">작업 흐름</div>' +
      '<div style="margin-bottom:14px">' + steps + '</div>' +
      // [#6] 남은 단계가 있으면 그 단계로, 전부 끝났으면 '완료'. (published 여도 고객연결 남으면 그리로)
      '<button type="button" class="wsv2-drawer__primary" data-wsv2-act="' + (curIdx >= 0 ? _esc(STEPS[curIdx].act) : 'next') + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>' +
        (curIdx >= 0 ? _esc(STEPS[curIdx].label) + ' 하기' : _esc(next.label)) + '</button>' +
      // [v542] 콘텐츠 관리 — 게시 완료 토글 + 삭제(위험, 확인 후).
      '<div class="wsv2-drawer__manage">' +
        (pub
          ? '<button type="button" class="wsv2-drawer__mng" data-wsv2-act="게시 완료 해제"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.4 2.6L3 8"/><path d="M3 3v5h5"/></svg>게시 완료 해제</button>'
          : '<button type="button" class="wsv2-drawer__mng wsv2-drawer__mng--ok" data-wsv2-act="게시 완료"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>게시 완료</button>') +
        '<button type="button" class="wsv2-drawer__mng wsv2-drawer__mng--danger" data-wsv2-act="삭제"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>삭제</button>' +
      '</div>';
    var el = _drawerEl();
    document.getElementById('wsv2DrawerCard').innerHTML = html;
    // [#1] 드로어도 back 시스템에 등록 → 뒤로가기 시 드로어 닫고 작업실 홈.
    try { if (window._registerSheet) window._registerSheet('wsv2Drawer', _closeDrawer); if (window._markSheetOpen) window._markSheetOpen('wsv2Drawer'); } catch (_e) { void _e; }
    requestAnimationFrame(function () { el.classList.add('is-open'); });
  }
  function _isPub(slot) { return !!(slot && (slot.status === 'published' || slot.instagramPublished || (slot.publish && slot.publish.status === 'published'))); }

  function _closeDrawer() {
    var el = document.getElementById('wsv2Drawer');
    if (el) el.classList.remove('is-open');
    try { if (window._markSheetClosed) window._markSheetClosed('wsv2Drawer'); } catch (_e) { void _e; }
  }

  window.WorkspaceV2 = { render: render, refresh: refresh, _closeDrawer: _closeDrawer };
})();
