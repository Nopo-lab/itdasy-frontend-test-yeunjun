/* Workspace V2 플로우 — 프로토타입 2~6 화면(업로드→편집→게시글→고객연결→미리보기→게시).
   [C4] 캡션→게시글 네이밍, 가짜 HASHES 제거, [다시]/[더 짧게]/[더 길게] 버튼.
   [C5] 고객연결 — 그라데이션 아바타 제거, _barClass(vc) 컬러바+N회 배지.
   [C6] 단계 순서: upload→edit→caption(게시글)→connect→preview→게시. 발행=uploadProgressPopup.
   진입: WorkspaceFlow.open({ slot?, startScreen?, cat?, files?, textOnly? }). */
(function () {
  'use strict';

  // [T-104 P0 2026-07-10] 순수 헬퍼는 js/workspace/flow/util.js 로 분리 → 로컬 별칭으로 재수입(호출부 무변경).
  var WSU = window.WSFlowUtil || {};
  var uid = WSU.uid, toast = WSU.toast, esc = WSU.esc, fileToDataUrl = WSU.fileToDataUrl,
    _isRealShopName = WSU._isRealShopName, _thEsc = WSU._thEsc, barClass = WSU.barClass, _caret = WSU._caret,
    _purposeCat = WSU._purposeCat, _containBlit = WSU._containBlit, clone = WSU.clone, _parseHashes = WSU._parseHashes,
    filterCss = WSU.filterCss, _extractPalette = WSU._extractPalette;
  // [T-104 P1] 템플릿 썸네일 클러스터 → flow/thumbs.js
  var _tplThumb = (window.WSFlowThumbs || {})._tplThumb;

  // [v542] ?photoDebug=1 → 보정 디버그 전역 플래그 활성([photofx] 로그·마스크 오버레이·디버그 패널).
  try { if (/[?&]photoDebug=1/.test(location.search || '')) window.__ITDASY_PHOTO_DEBUG__ = true; } catch (_e) { void _e; }

  // [C6] 단계 순서 변경: connect가 preview 앞으로
  // [refactor S1] 스텝 정의(순서·제목·CTA)를 flow/steps.js 단일 레지스트리(WSFlowSteps)로 이관.
  //   아래 SCREENS/VISIBLE_SCREENS/TITLE/CTA 는 기존 인라인 로직과 100% 동일 산출 = 무동작변경. 변경은 이제 steps.js 한 곳에서.
  // [cleanup 2026-07-12] 롤백 플래그(HYPER·AUTO_EDITOR·SIMPLE_FLOW 의 window 스위치) 제거 — 라이브 값으로 고정. HYPER/AUTO_EDITOR 분기는 전부 인라인화·삭제됨.
  var SIMPLE_FLOW = true;   // 편집/템플릿 스텝 숨김(상시). 아래 캡션 입력의 if(SIMPLE_FLOW) 한 곳에서만 참조.
  var _wsSteps = window.WSFlowSteps.build();
  var SCREENS = _wsSteps.SCREENS;                 // 슬라이드 방향 인덱스용(connect 가 preview 앞 — 기존 보존)
  var VISIBLE_SCREENS = _wsSteps.VISIBLE_SCREENS; // 진행바/다음화면 UX 순서(preview 가 connect 앞)
  var TITLE = _wsSteps.TITLE;
  var CTA = _wsSteps.CTA;
  // [v592] preview: 화면 안에 '저장 및 게시' 버튼 + 하단 CTA '고객 연결로'(다음 단계). 게시는 선택, 연결로 진행.
  var CAT_CTX = {
    ba:     { purpose: 'before_after', captionMode: 'normal', role: 'auto', tplLabel: '전후' },
    flex:   { purpose: 'feed',         captionMode: 'normal', role: 'hero', tplLabel: '시술 자랑' },
    review: { purpose: 'review',       captionMode: 'review', role: 'hero', tplLabel: '고객 후기' },
    event:  { purpose: 'event',        captionMode: 'normal', role: 'hero', tplLabel: '이벤트' }
  };
	  var CROP_RATIO = { before_after: '4:5', feed: '4:5', review: '4:5', event: '1:1', story: '9:16', price: 'free' };
	  var TYPE_MAP = { before_after: 'before_after', feed: 'promo', review: 'review', event: 'event', story: 'story', price: 'price' };
	  // 슬라이더는 숫자/동적문구 없이 좌(lo)·우(hi) 고정 라벨만 노출 (뷰티앱 미니멀).
	  var MAIN_TOOLS = [
	    { k: 'brightness', l: '밝기', ic: 'ph-sun', lo: '어두움', hi: '밝음' },
	    { k: 'contrast', l: '대비', ic: 'ph-circle-half', lo: '은은함', hi: '뚜렷함' },
	    { k: 'saturation', l: '채도', ic: 'ph-sparkle', lo: '차분함', hi: '선명함' },
	    { k: 'sharpness', l: '선명도', ic: 'ph-lightning', lo: '부드러움', hi: '또렷함' },
	    { k: 'color', l: '색감', ic: 'ph-palette', lo: '쿨톤', hi: '웜톤' },
	    { k: 'background', l: '배경', ic: 'ph-image' },
	  ];
	  var PRECISION_TABS = [
	    { k: 'skin', label: '피부', ic: 'ph-user', controls: [
	      { k: 'skin', l: '피부톤', ic: 'ph-sun' },
	      { k: 'textureSmooth', l: '피부결', ic: 'ph-sparkle' },
	      { k: 'blemish', l: '잡티 정리', ic: 'ph-bandage' } ] },
	    { k: 'hair', label: '헤어', ic: 'ph-wind', controls: [
	      // [v560] 기능명 정직화 — 효과는 '보정/완화(enhancement)'이지 '생성'이 아니므로 '~감/완화'로 표기.
	      { k: 'hairDetail', l: '머릿결 선명도', ic: 'ph-wind' },
	      { k: 'hairVolume', l: '볼륨감 보정', ic: 'ph-waves' },
	      { k: 'hairShine', l: '윤기감 보정', ic: 'ph-sparkle' },
		      { k: 'hairEndsClean', l: '잔머리 완화', ic: 'ph-scissors' } ] },
	    { k: 'eyes', label: '눈썹·눈가', ic: 'ph-eye', controls: [
	      { k: 'browSharp', l: '눈썹 선명도', ic: 'ph-pencil-simple' },
	      { k: 'lashSharp', l: '눈가 선명도', ic: 'ph-eye' },
	      { k: 'eyeRedness', l: '눈 맑게', ic: 'ph-drop' },
	      { k: 'catchLight', l: '눈 밝게', ic: 'ph-sun' } ] },
	    { k: 'nail', label: '네일', ic: 'ph-hand-heart', controls: [
	      { k: 'nailGloss', l: '네일 광택', ic: 'ph-sparkle' },
	      { k: 'nailShape', l: '네일 경계', ic: 'ph-lightning' } ] },
	    { k: 'tools', label: '고급', ic: 'ph-faders', controls: [] },
	  ];
	  var WORKSPACE_TEMPLATES = [
	    { key: 'ba', label: '전후 비교', use: '전후 2장', chip: '전후', id: 'wm-ba-feed', purpose: 'before_after', captionMode: 'normal' },
    // [BA-PACK v533] 전후 에디토리얼 5종 — 작업실 갤러리 노출(레이아웃 명확히 구분).
    { key: 'ba-premium', label: '프리미엄 전후', use: '정보카드형', chip: '전후', id: 'bp-ba-premium-infographic', purpose: 'before_after', captionMode: 'normal' },
    { key: 'ba-luxury', label: '럭셔리 후기 전후', use: '대형 타이포·별점', chip: '전후', id: 'bp-ba-luxury-review', purpose: 'before_after', captionMode: 'normal' },
    { key: 'ba-story', label: '스토리 전후', use: '추천·정보·후기', chip: '전후', id: 'bp-ba-story-signature', purpose: 'before_after', captionMode: 'normal' },
    { key: 'ba-classic', label: '클래식 포스터 전후', use: '대각 리본', chip: '전후', id: 'bp-ba-classic-poster', purpose: 'before_after', captionMode: 'normal' },
    { key: 'ba-care', label: '케어 가이드 전후', use: '시술정보형', chip: '전후', id: 'bp-ba-care-guide', purpose: 'before_after', captionMode: 'normal' },
	    { key: 'showcase', label: '시술 자랑', use: '완성컷 강조', chip: '시술 자랑', id: 'wm-show-feed', purpose: 'feed', captionMode: 'normal' },
	    { key: 'review', label: '고객 후기', use: '후기 카드', chip: '고객 후기', id: 'wm-review-feed', purpose: 'review', captionMode: 'review' },
	    { key: 'event', label: '이벤트 안내', use: '혜택 안내', chip: '이벤트', id: 'wm-event-feed', purpose: 'event', captionMode: 'normal' },
	    { key: 'feed', label: '인스타 피드', use: '피드용 안내', chip: '시술 자랑', id: 'wm-promo-feed', purpose: 'feed', captionMode: 'normal' },
	    { key: 'story', label: '스토리 홍보', use: '세로 홍보', chip: '스토리', id: 'wm-promo-story', purpose: 'story', captionMode: 'normal' },
    // [다양성 팩 2026-07-12] 실용 공지·이벤트 템플릿 — 전후 편중(6/13) 완화. 렌더러 지원 id 재사용(실 렌더 검증됨).
    { key: 'booking-open', label: '예약 오픈', use: '예약 오픈 안내', chip: '이벤트', id: 'wm-event-story', purpose: 'event', captionMode: 'normal' },
    { key: 'last-call', label: '마감 임박', use: '마감 임박 강조', chip: '이벤트', id: 'wm-thumb-card', purpose: 'event', captionMode: 'normal' },
    { key: 'new-menu', label: '신메뉴 안내', use: '새 시술·메뉴', chip: '이벤트', id: 'wm-price-feed', purpose: 'feed', captionMode: 'normal' },
    { key: 'notice', label: '휴무 공지', use: '휴무·운영 안내', chip: '공지', id: 'wm-show-square', purpose: 'feed', captionMode: 'normal' },
    { key: 'homecare', label: '홈케어 팁', use: '홈케어·꿀팁', chip: '정보', id: 'wm-review-story', purpose: 'feed', captionMode: 'normal' },
	    // [v561·항목5] 단순 사진 붙이기 — 꾸밈 없이 2장을 50:50 으로. before_after 처럼 2장 필요.
	    { key: 'stitch-lr', label: '좌우 붙이기', use: '두 장 나란히', chip: '붙이기', id: 'wm-stitch-lr', purpose: 'collage', collage: 'lr', captionMode: 'normal' },
	    { key: 'stitch-tb', label: '상하 붙이기', use: '두 장 위아래', chip: '붙이기', id: 'wm-stitch-tb', purpose: 'collage', collage: 'tb', captionMode: 'normal' },
	  ];
	  function newAdjust() { return { brightness:0, contrast:0, saturation:0, sharpness:0, color:0 }; }
	  function newBeauty() { return { skin:0, textureSmooth:0, blemish:0, hairDetail:0, hairVolume:0, hairShine:0, hairFull:0, hairEndsClean:0, browSharp:0, lashSharp:0, eyeRedness:0, catchLight:0, nailGloss:0, nailShape:0, handSkin:0 }; }
  var d = null;
  var el = null;
  var cur = 'upload';
  // [nav] 방문 히스토리 스택 — 뒤로가기는 정적 SCREENS 인덱스가 아니라 '실제로 거쳐온 화면'으로 복귀.
  //  textOnly(게시물만 쓰기)로 caption에 바로 진입하면 스택이 비어 있어 뒤로가기가 작업실 홈으로 닫힌다.
  var navStack = [];
  // [#1] 안드로이드/PWA 시스템 back 안정화 — 단계마다 실제 history 엔트리를 쌓는다(navStack 과 1:1).
  //   기존엔 진입 시 1개만 push 하고 popstate 안에서 재push(재무장)했는데, 일부 안드로이드 WebView 가
  //   popstate 도중의 pushState 를 무시해 두 번째 back 에서 history 가 비어 앱이 종료됐다.
  //   이제 각 단계 진입에서 미리 엔트리를 쌓으므로 back 1회 = 한 화면 복귀, 재무장 불필요.
  var _histDepth = 0;      // 우리가 push 한 단계 엔트리 수
  var _popBound = false;   // popstate 리스너 1회 등록 가드
  var _closingHist = false; // 프로그램적 close(저장/게시) 시 history 되감기 중 popstate 무시
  // [버그수정] 캡션 재생성 중 뒤로가기 등으로 이탈 후 옛 응답이 도착하면 d.caption/오버레이가 새 상태와 뒤섞여 깨지던 문제.
  //   generateCaption() 호출마다 토큰을 발급하고, 응답 시 토큰이 최신이 아니면(그 사이 뒤로가기/재생성 발생) 결과를 버린다.
  var _genToken = 0;
  function _pushHist() {
    try { history.pushState({ wsv2: 'step' }, '', '#wsv2flow'); _histDepth++; } catch (_e) { void _e; }
  }
  function _bindPop() {
    if (_popBound) return; _popBound = true;
    // 단계가 남아있으면 한 화면 뒤로 — 시스템 back/브라우저 back/인앱 back 모두 동일 결과.
    //  베이스(#wsv2flow 마지막 엔트리)가 빠질 땐 전역 sheet 레지스트리(_systemBack)가 닫고 작업실 홈으로.
    window.addEventListener('popstate', function () {
      if (_closingHist) return;
      _navBack();
    });
  }
  // [버그11 2026-07-14] '이어서하기'로 중간 단계(캡션 등)에 직행하면 navStack 이 비어 있어
  //   뒤로가기 → _navBack() false → 전역 시트가 플로우를 닫아 곧장 작업실 홈으로 튀었다.
  //   절충: 진행바 단계(VISIBLE_SCREENS) 중 '앞 단계'만 시드한다.
  //   - edit/template 은 VISIBLE 이 아니라 indexOf=-1 → 시드 안 함 = v575('직행 진입은 편집이 베이스') 취지 유지.
  //   - 사진이 없으면(글만 쓰기) 되돌아갈 단계가 없으므로 시드 안 함.
  //   결과: 캡션 직행 → back → 레이아웃 → back → 업로드 → back → 홈.
  function _seedNavStack(startScreen) {
    var idx = VISIBLE_SCREENS.indexOf(startScreen);
    if (idx <= 0) return;
    if (!editablePhotos().length) return;
    var seeded = VISIBLE_SCREENS.slice(0, idx);
    navStack = seeded.slice();
    seeded.forEach(function () { _pushHist(); });
  }
  // [v531] 한 단계 뒤로 — 시스템/브라우저/인앱 back 공통. 캡션 결과 화면이면 먼저 캡션 입력으로(편집으로 안 튐).
  function _navBack() {
    if (!el || !el.classList.contains('is-open')) return false;
    // [v587·#5] 편집기(seOverlay)가 열렸거나 방금 popstate 로 닫힌 back 이면 flow 가 같은 back 을 중복 처리하지 않는다.
    //   (전역 시트 시스템이 편집기를 먼저 닫음 → 작업실 단계는 그대로 유지, 앱 종료 방지.)
    if (window.__seOpen || window.__seSwallowPop) return false;
    // [refactor S3] 스텝별 뒤로가기 특수처리(캡션 결과 되돌리기 등)는 STEP_FX[cur].onBack 에 위임 — 처리했으면 true.
    var fx = STEP_FX[cur];
    if (fx && fx.onBack && fx.onBack() === true) return true;
    if (navStack.length) {
      if (_histDepth > 0) _histDepth--;
      if (cur === 'caption') { flushCaptionInputs(); _genToken++; }   // [버그수정] 캡션 화면 이탈 시에도 재생성 응답 무효화
      setScreen(navStack.pop(), { push: false });
      return true;
    }
    return false;
  }

  // [T-104 P0] uid/toast/esc/fileToDataUrl → flow/util.js (상단 별칭)
  // [#2] 선택된 사진만(해제=selected:false 제외) · 선택순(selSeq)으로 정렬 → 순서배지/대표사진 일관.
  function editablePhotos() {
    return d.photos.filter(function (x) { return x.selected !== false && x.role !== 'exclude'; })
      .sort(function (a, b) { return (a.selSeq || 0) - (b.selSeq || 0); });
  }
  // 선택 사진을 선택순으로 — 순서배지 계산용(표시는 업로드 배열순 유지, 배지 숫자만 선택순 랭크).
  function _selectedOrdered() {
    return d.photos.filter(function (x) { return x.selected !== false; })
      .slice().sort(function (a, b) { return (a.selSeq || 0) - (b.selSeq || 0); });
  }
  // 대표 사진 — 캡션/미리보기/저장 썸네일/게시 이미지(전후면 '후' 우선). 기존 동작 유지.
  function curPhoto() { var p = editablePhotos(); return (p[0] || p[1] || d.photos[0]); }   // [#2] 대표=첫 장(커버). 예전 p[1] 우선이라 자동글·미리보기가 2번째 장에 뜨던 버그
  // [slot-sync Phase B] 다른 기기서 온 slot 은 이미지가 https URL — 편집기/캐러셀은 캔버스 export 라 taint 로 막힌다.
  //   픽셀 필요한 순간 직전에 http→dataURL 로 수화(hydration). 뷰·단일발행은 CORS(*)로 그냥 되므로 게이트 불필요.
  function _needsHydrate() {
    if (!(window.WorkspaceSync && window.WorkspaceSync.enabled && window.WorkspaceSync.hydratePhotos)) return false;
    return (d.photos || []).some(function (p) { return /^https?:\/\//.test(p && p.dataUrl || '') || /^https?:\/\//.test(p && p.editedDataUrl || '') || /^https?:\/\//.test(p && p.baseUrl || ''); });
  }
  function _hydrateD() {
    if (!(window.WorkspaceSync && window.WorkspaceSync.hydratePhotos)) return Promise.resolve(false);
    return Promise.resolve(window.WorkspaceSync.hydratePhotos(d.photos)).then(function (ch) {
      if (ch) { d.previewUrl = null; try { setScreen(cur, { push: false }); } catch (_e) { void _e; } }
      return ch;
    }).catch(function () { return false; });
  }
  // 편집 대상 사진 — 편집 화면에서 전/후 전환(editIdx)으로 선택. 전후면 '전(before)' 기본, 일반은 첫 사진.
  function curEditPhoto() {
    var p = editablePhotos();
    if (!p.length) return d.photos[0];
    if (d.editIdx == null) d.editIdx = 0;
    if (d.editIdx < 0 || d.editIdx >= p.length) d.editIdx = 0;
    return p[d.editIdx];
  }
  // 전/후(또는 다중) 편집 대상 전환 — 현재 보정을 먼저 굽고(다른 사진 오적용 방지) 편집 상태 초기화.
  function switchEditPhoto(idx) {
    var p = editablePhotos();
    if (idx < 0 || idx >= p.length || idx === (d.editIdx || 0)) return;
    // [이슈3] 즉시 시각 피드백 — 선택 테두리/aria 를 동기로 토글(무거운 bake/렌더를 기다리지 않음).
    if (el) {
      el.querySelectorAll('[data-fs="edit"] [data-fl-editsel]').forEach(function (b) {
        var on = +b.getAttribute('data-fl-editsel') === idx;
        b.classList.toggle('on', on); b.setAttribute('aria-selected', on);
      });
    }
    // 현재 보정은 백그라운드로 굽고(다른 사진 오적용 방지), 끝나면 편집 상태만 부분 갱신.
    bakeEdit().then(function () {
      d.editIdx = idx;
	      d.adjust = newAdjust(); d.beauty = newBeauty(); d.undo = []; d.redo = []; d.previewUrl = null;
      d.originalPreview = false; d.basicTool = null;
      d.bgAction = null; d.bgColor = null; d.bgFail = false; d.bgBusy = false;
      d.zoom = { s: 1, tx: 0, ty: 0 };
      // [이슈3] setScreen('edit') 전체 재렌더(템플릿 6칸 대용량 dataURL 재디코딩) 대신 필요한 섹션만 교체 → 즉각 전환.
      _paintEditPhoto();
      _setEditSection('[data-ed-switcher]', _editSwitcherHtml());
      _setEditSection('[data-ed-basic]', _mainAdjustHtml());
      _setEditSection('[data-ed-bottom]', _editBottomHtml());
      _setEditSection('[data-ed-adv]', _advFoldHtml());
      if (d.maskView) _renderMaskOverlay();   // [v539] 사진 전환 시 마스크 overlay 갱신
      if (d.maskPaint) { _ensurePaintDims(function () { _renderPaintOverlay(); }); }   // [v561] 칠하기 모드 유지 시 새 사진 기준 재렌더
      _warmEditMasks();
    });
  }
  function photoUrl(p) { return p ? (p.editedDataUrl || p.dataUrl) : ''; }
  // [이슈2/11] 게시 대표 이미지 — 전후 템플릿 "적용 결과물"(d.templateOutput)이 있으면 그것을, 없으면 대표 사진.
  //   합성 결과물은 별도 필드로만 관리한다. 편집화면 사진 스트립/썸네일은 절대 이 값을 쓰지 않으므로
  //   원본/후사진 슬롯이 합성본으로 오염되지 않는다(이슈2). 해제하면 d.templateOutput=null → 원본 복귀(이슈11).
  function outputUrl() {
    // [다중pair] 캐러셀에서 선택된 결과물/사진(activeDisplayId)이 있으면 그것을, 없으면 첫 결과물 → 대표 사진.
    if (d && d.activeDisplayId) {
      var outs = d.templateOutputs || [];
      for (var i = 0; i < outs.length; i++) { if (outs[i].pairId === d.activeDisplayId) return outs[i].outputUrl; }
      var ph = (d.photos || []).filter(function (p) { return p.id === d.activeDisplayId; })[0];
      if (ph) return photoUrl(ph);
    }
    return (d && d.templateOutput) || (d && d.templateOutputs && d.templateOutputs[0] && d.templateOutputs[0].outputUrl) || dispUrl(curPhoto());
  }

  // [Phase B-1] 스토리 편집기 진입 — 사진 + 우리샵 스타일 좌표로 텍스트 자동배치 → StoryEditor.
  //   시술 내용(여러 줄)을 제목/부제목/본문 레이어로 매핑. 저장 시 baked 결과를 대표 사진 editedDataUrl 로.
  // [v583] 시술내역을 시술명/시술내용으로 분리(편집기 레이어로 각각 뜨게). 말투 지시어는 본문 텍스트에서 제거.
  //   줄바꿈/콤마/가운뎃점으로 우선 분리, 한 줄 입력이면 첫 토큰=시술명·나머지=시술내용.
  // [v590·#A] 시술 입력에서 '고객명'을 분리 — AI가 고객을 시술/스타일로 오해(예: "김민지 스타일")하거나
  //   오버레이에 고객명이 박히는 것 방지. "김민지 고객/고객님" 또는 이름+님(원장님·실장님 등 호칭 제외)을 떼어낸다.
  // [B-분할] 시술 텍스트 파싱 → js/workspace/flow/caption-text.js (window.WSCaptionText). 호출부 유지용 alias.
  var _extractCustomer = window.WSCaptionText.extractCustomer, _shopName = window.WSCaptionText.shopName,
      _stripShopName = window.WSCaptionText.stripShopName, _detectShopName = window.WSCaptionText.detectShopName,
      _cleanService = window.WSCaptionText.cleanService, _splitServiceForLayers = window.WSCaptionText.splitServiceForLayers,
      _publicServiceKeywords = window.WSCaptionText.publicServiceKeywords;
  // [#1] 상호로 캡션에 브랜딩할 만한 '진짜 가게 이름'인지 — 'Dd','aa' 같은 짧은 라틴/계정 placeholder 는 제외.
  //   (등록만 되어 있고 실제 상호가 아니면 캡션에 억지로 안 박고 '저희 샵'으로만 칭하게 함)
  // [T-104 P0] _isRealShopName → flow/util.js
  // [기능 스티커] 편집기에서 저장한 예약 링크·전화를 캡션 끝에 실제 CTA 로 붙인다(피드 게시물에서 팔로워가 바로 사용).
  //   피드 이미지는 클릭이 안 되므로 링크는 '캡션 본문'으로 연결하는 게 표준. 저장값 없으면 아무것도 안 붙임.
  // [#19] 샵정보(예약링크·전화)를 캡션 끝에 자동으로 붙일지는 사용자 선택(기본 OFF).
  //   예전엔 저장값 있으면 무조건 붙였는데("계속 알아서 하단에 놓지 말고") → 설정 토글로 opt-in 전환.
  function _shopInfoOn() { try { return localStorage.getItem('itdasy:caption_shopinfo') === '1'; } catch (_e) { return false; } }
  function _shopInfoSaved() { try { return !!(String(localStorage.getItem('itdasy:shop_book') || '').trim() || String(localStorage.getItem('itdasy:shop_phone') || '').trim()); } catch (_e) { return false; } }
  // [#19] 캡션 입력 화면의 '샵정보 반영' 토글 — 설정에 예약/전화가 저장돼 있을 때만 노출(없으면 켤 대상이 없음).
  function _shopInfoToggleHtml() {
    if (!_shopInfoSaved()) return '';
    var on = _shopInfoOn();
    return '<div class="cap-hash-row cap-shopinfo-row"><span class="cap-field-label" style="margin:0">샵정보 반영 <em style="font-weight:400;color:#9aa3ad;font-style:normal">· 예약·전화를 글 끝에</em></span>' +
      '<button type="button" class="cap-switch' + (on ? ' on' : '') + '" data-fl-cshopinfo role="switch" aria-checked="' + on + '"><span class="cap-switch__dot"></span></button></div>';
  }
  function _shopCTA() {
    if (!_shopInfoOn()) return '';   // 반영 OFF → 아무것도 안 붙임
    try {
      var book = String(localStorage.getItem('itdasy:shop_book') || '').trim();
      var phone = String(localStorage.getItem('itdasy:shop_phone') || '').trim();
      if (book) return '\n\n📅 예약 → ' + book + (phone ? '\n☎ ' + phone : '');
      if (phone) return '\n\n☎ 예약·문의 ' + phone;
    } catch (_e) { void _e; }
    return '';
  }
  // [v587] 깨끗한 합성 기준 사진 — 편집기·자동합성 모두 '텍스트가 안 박힌 원본' 위에 올린다(이중 합성 방지).
  function _cleanBase(p) { return p ? (p.baseUrl || p.dataUrl) : ''; }
  // [v591·#6] 사진에서 대표 색 추출 — 클라이언트 canvas(서버/AI 비용 0). 28px 다운샘플 후
  //   근사 흰/검 제외하고 5비트 버킷 빈도순 상위색 반환. 폰트/로고 자동추출은 부정확해 미지원(수동).
  // [T-104 P1] _extractPalette → flow/util.js
  // [v591·#6] 추천 색 탭 → 활성 우리샵 스타일의 모든 텍스트 역할 글자색에 적용(저장 + 미리보기 재합성).
  // [T-104 P5] 우리샵 스타일(브랜드킷·프리셋 A~G) 클러스터 → flow/brand.js (context 주입)
  var _WSB = (window.WSFlowBrand && window.WSFlowBrand.create) ? window.WSFlowBrand.create({
    d: function () { return d; }, setScreen: setScreen, curPhoto: curPhoto, cleanBase: _cleanBase, dispUrl: dispUrl
  }) : {};
  var _applyBrandColor = _WSB._applyBrandColor, _applyBrandFont = _WSB._applyBrandFont, _applyHarmony = _WSB._applyHarmony,
    _autoPretty = _WSB._autoPretty, _setShopType = _WSB._setShopType, _setBrandLogo = _WSB._setBrandLogo,
    _clearBrandLogo = _WSB._clearBrandLogo, _brandLogoFromFile = _WSB._brandLogoFromFile,
    _renamePreset = _WSB._renamePreset, _applyPreset = _WSB._applyPreset, _copyPreset = _WSB._copyPreset;

  // [v587·C] 우리샵 스타일 레이어 빌더 — 편집기 진입과 헤드리스 자동합성이 공유.
  function _buildShopStyleLayers() {
    var ss = (window.ShopStyle && window.ShopStyle.getActive) ? window.ShopStyle.getActive() : null;
    var roleText = _splitServiceForLayers(d.service);   // [v583·A] 시술명/시술내용 분리
    var layers = [];
    var autoArranged = false;
    if (ss && d.useShopStyle !== false) {
      // [v587·B-3] 해시태그도 오버레이 레이어로 — 생성된 해시태그 상위 4개만(사진 위 과밀 방지).
      var hs = (d.selectedHashes && d.selectedHashes.length ? d.selectedHashes : (d.hashtags || []));
      var hashText = hs.slice(0, 4).join(' ');
      ss.layers.forEach(function (L) {
        // [v590] 사용자가 이전에 편집기에서 제거한 레이어(예: 해시태그)는 enabled:false → 다음부터 자동배치 제외.
        if (L.enabled === false) return;
        // [#14] 구분선 등 비-텍스트 데코는 텍스트 없이 그대로 통과(좌상단x→중앙x 변환, 클램프 없음).
        if (L.type === 'line') { layers.push(Object.assign({}, L, { x: (L.x != null ? L.x + (L.w != null ? L.w : 0.1) / 2 : 0.5) })); return; }
        if (L.type === 'rect') { layers.push(Object.assign({}, L, { x: (L.x != null ? L.x + (L.w != null ? L.w : 0.8) / 2 : 0.5) })); return; }   // [#1] 채움 면(패널/악센트)
        // 고정 텍스트 배지(예: '예약 DM') — 역할 텍스트가 아니라 자체 text 그대로.
        if (L.type === 'badge' && L.text) { layers.push(Object.assign({}, L, { x: (L.x != null ? L.x + (L.w != null ? L.w : 0.2) / 2 : 0.5) })); return; }
        var text = (L.role === 'hashtag') ? hashText : roleText[L.role];
        if (!text) return;
        // [v583·B] shop-style 좌표는 좌상단(좌측 끝) 기준 → story-editor 중앙 기준으로 변환(화면 밖 이탈 방지).
        var cx = (L.x != null ? L.x + (L.w != null ? L.w : 0.84) / 2 : 0.5);
        cx = Math.max(0.14, Math.min(0.86, cx));
        layers.push(Object.assign({}, L, { text: text, x: cx }));
      });
      // [C] 우리샵 브랜드 자산 완전 자동배치 — 로고(이미지)·워터마크(텍스트)도 함께 올림.
      var _cx = function (x, w) { return Math.max(0.1, Math.min(0.9, (x != null ? x + (w != null ? w : 0.2) / 2 : 0.82))); };
      if (ss.logo && ss.logo.dataUrl) {
        layers.push({ type: 'image', role: 'logo', src: ss.logo.dataUrl, x: _cx(ss.logo.x, ss.logo.w), y: (ss.logo.y != null ? ss.logo.y : 0.1), w: (ss.logo.w != null ? ss.logo.w : 0.24), opacity: (ss.logo.opacity != null ? ss.logo.opacity : 1) });
      }
      if (ss.watermark && (ss.watermark.text || '').trim()) {
        layers.push({ type: 'badge', role: 'watermark', text: ss.watermark.text.trim(), x: _cx(ss.watermark.x, 0.3), y: (ss.watermark.y != null ? ss.watermark.y : 0.93), size: 0.032, bg: 'rgba(0,0,0,.32)', color: (ss.watermark.color || '#ffffff'), opacity: (ss.watermark.opacity != null ? ss.watermark.opacity : 0.9) });
      }
      autoArranged = layers.length > 0;   // 우리샵 스타일로 자동배치됨 → AI 배치 배너+다시배치 노출
    }
    // [#5] ShopStyle 없거나 매핑 결과 없음 → 시술내용(제목+부제)을 기본 레이어로. 단, 실제 시술 텍스트가 있을 때만
    //   (업로드 직후 편집기는 시술이 아직 없음 → 빈 '텍스트' 폴백 안 올림. 깨끗한 사진으로 시작).
    if (!layers.length && String(roleText.title || '').trim()) {
      layers.push({ text: roleText.title, role: 'title', x: 0.5, y: 0.44, w: 0.8, size: 0.08, align: 'center' });
      if (roleText.sub) layers.push({ text: roleText.sub, role: 'sub', x: 0.5, y: 0.56, w: 0.8, size: 0.05, align: 'center' });
      autoArranged = true;   // [#5] 미리보기(_autoComposeTemplate)도 이 텍스트를 합성하도록
    }
    return { ss: ss, layers: layers, ratio: ss ? ss.frame.ratio : '4:5', autoArranged: autoArranged };
  }
  // [v589·#3] 표시용 URL — 입력 화면/뒤로가기는 '원본', 캡션 '결과' 화면에서만 템플릿 적용 미리보기를 보여준다.
  //   사진 자체(editedDataUrl)는 절대 건드리지 않으므로(수동 '사진 꾸미기' 저장 제외) 뒤로가기 시 원본 유지.
  //   tplPreviewUrl = 결과 전용 합성본(헤드리스). storyEdited(수동 편집)면 그 결과가 우선.
  function dispUrl(p) {
    if (!p) return '';
    // [cleanup] 편집기 결과(editedDataUrl)가 유일한 소스 — 별도 자동합성본(tplPreviewUrl) 안 씀(미리보기=편집기 일치).
    return p.editedDataUrl || p.dataUrl;
  }
  // [v589·#3] 캡션 결과 화면에서 우리샵 스타일을 각 사진에 헤드리스 합성 → tplPreviewUrl(결과 전용).
  //   [#2 단일화] 편집기와 동일 렌더러(ItdEditor.compose) 단독 사용 — 옛 StoryEditor 제거됨.
  // [cleanup 2026-07-12] 편집기가 유일한 결과 소스(구 AUTO_EDITOR 상시 ON) — 별도 자동합성(다른 크롭/위치로 미리보기 어긋남) 안 함. no-op 유지(호출부 무변경).
  function _autoComposeTemplate() { /* no-op */ }
  // [#5] 텍스트/편집을 '지금 캐러셀에서 보고 있는 장'에 적용 — 보던 사진을 편집·저장(다중 사진서 장 선택).
  function _activeEditPhoto() {
    if (d && d.activeDisplayId) {
      var ph = (d.photos || []).filter(function (p) { return p.id === d.activeDisplayId; })[0];
      if (ph) return ph;
    }
    return curPhoto();
  }
  function _openStoryEditor(o) {
    o = o || {};
    // [slot-sync Phase B] 다른 기기 slot(https 이미지) → 편집기 캔버스 오염 방지 위해 먼저 수화. 1회만 시도(실패해도 진행).
    if (_needsHydrate() && !d._hydrateTried) { d._hydrateTried = true; toast('사진 불러오는 중…'); _hydrateD().then(function (ok) { if (!ok) d._hydrateTried = false; /* [버그수정 2026-07-06] 실패 시 재시도 가능하게 */ _openStoryEditor(o); }); return; }
    // [#2 단일화] 편집기는 ItdEditor 단독(옛 StoryEditor 제거됨). 계약 open{photoUrl,onDone(dataUrl,meta)} 동일.
    // o.fresh=true → 이전 편집상태(editState) 복원 안 함(캡션 직후 자동 오픈: 옛날 콜라주·빈 텍스트가 되살아나던 문제).
    var Editor = window.ItdEditor;
    if (!(Editor && Editor.open)) { toast('편집 모듈을 불러오지 못했어요'); return; }
    var p0 = _activeEditPhoto(); if (p0 && !p0.baseUrl) p0.baseUrl = p0.dataUrl;   // [#5] 보고 있는 장
    // [#17] 캡션 직후 자동 오픈도 '이어서 편집' — 이전에 올린 텍스트/스티커를 '구워서 합치지' 않고 라이브 레이어로 복원한다.
    //   (예전 fresh: editedDataUrl(텍스트 구워진 사진)을 베이스로 써서 "합쳐진 느낌" + 실기기서 사진이 안 뜨던 문제.)
    //   누끼(배경제거) 적용본은 fgCutout/bgSpec 합성을 보존해야 하므로 기존 방식(구워진 editedDataUrl 베이스) 유지.
    var _hasBg = !!(p0 && p0.bgSpec && p0.fgCutout);
    var _restore = (!_hasBg && p0 && p0.editState) || null;
    // [ws-hyper] 레이아웃 활성 시: 프리셋 매칭되면 편집기 콜라주(슬롯 재조정 가능), 아니면 합성본 단일 이미지로 레이아웃 보존.
    //   (예전엔 항상 원본 단일 사진으로 열려 레이아웃이 통째 사라졌음 — 2026-07-10 버그수정)
    var _wsEd = (d.wsLayout && !_hasBg) ? _wsLayoutEditState() : null;
    var photo = (_wsEd && _wsEd.mode === 'composite') ? _wsEd.photoUrl
      : (_wsEd && _wsEd.mode === 'collage') ? (_wsEd.photos[0] || _cleanBase(p0) || outputUrl())
      : (_restore ? (_cleanBase(p0) || outputUrl())
        : ((o.fresh && p0 && p0.editedDataUrl) ? p0.editedDataUrl : (_cleanBase(p0) || outputUrl())));
    var built = _buildShopStyleLayers();
    var layers = built.layers, autoArranged = built.autoArranged;
    // [T-115 P2] 이어서편집·레이아웃이 아닌 '깨끗한 열기'일 때만 ★기본 작업 기억을 올린다. 플래그 OFF면 null(=기존 동작 그대로).
    var _wmEd = (!_restore && !_wsEd && window.WorkMemory) ? window.WorkMemory.defaultEditState({ incoming: layers, photoCount: (editablePhotos() || []).length }) : null;
    // [v590] 진입 시 올린 텍스트 역할 기록 — 저장 시 빠진 역할(사용자가 지움)을 스타일에서 비활성화하는 비교 기준.
    // [audit#3] 텍스트 역할 레이어는 type 필드가 없다(roleText 배치) — 'text'로만 필터하면 항상 빈 배열이라 '지운 레이어 기억' 기능이 죽어 있었음.
    d._editorOpenRoles = layers.filter(function (l) { return l.role && (l.type === 'text' || l.type == null); }).map(function (l) { return l.role; });
    Editor.open({
      photoUrl: photo,
      photos: (_wsEd && _wsEd.mode === 'collage') ? _wsEd.photos : (editablePhotos() || []).map(function (p) { return p.editedDataUrl || _cleanBase(p) || photoUrl(p); }),   // [itd][#5] 콜라주 셀은 편집본 우선 · [ws-hyper] 레이아웃 매칭 시 슬롯 순서대로
      ratio: built.ratio,
      shopName: (built.ss && (built.ss.name || built.ss.shopName)) || (window.WorkspaceAdapter && window.WorkspaceAdapter.shopName && window.WorkspaceAdapter.shopName()) || '',
      layers: layers,
      autoArranged: autoArranged,
      editState: (_wsEd && _wsEd.mode === 'collage') ? _wsEd.editState : (_restore || (o.fresh ? _wmEd : ((p0 && p0.editState) || _wmEd))),   // [#17] 이어서 편집 · [ws-hyper] 레이아웃 매칭 시 콜라주 상태 주입(슬롯 재조정) · [T-115 P2] 없으면 ★기본 작업 기억
      onDone: function (dataUrl, meta) {
        var p = p0 || _activeEditPhoto();   // [#5] 열 때 잡은 '보던 장'에 저장(편집 중 바뀌지 않게 고정)
        if (p) { p.editedDataUrl = dataUrl; p.storyEdited = true; if (meta && meta.editState) p.editState = meta.editState; }   // [#11] 편집 상태 보존 → 재편집 이어가기
        if (_wsEd) { d.templateOutput = dataUrl; d.previewUrl = null; }   // [ws-hyper] 편집한 레이아웃 합성본을 대표 이미지로 → 미리보기/발행/저장에 반영
        // [캐러셀] 편집기에서 (콜라주 아닌 단일 레이아웃으로) 새로 추가한 사진 → 플로우 사진목록에 별도 사진으로 반영.
        //   원장님 요청: "편집기 추가 사진도 캐러셀로". 이러면 여러 장 게시(캐러셀) 후보가 된다.
        try {
          var _np = (meta && meta.newPhotos) || [];
          _np.forEach(function (u) {
            if (!u) return;
            var dup = d.photos.some(function (q) { return q.dataUrl === u || q.editedDataUrl === u || q.baseUrl === u; });
            if (!dup) d.photos.push({ id: uid(), dataUrl: u, baseUrl: u, role: 'hero', selected: true, selSeq: ++d._selSeq });
          });
        } catch (_npe) { void _npe; }
        // [#5/#6] 사진별 레이어 — 각 장을 자기 텍스트/스티커로 합성해 캐러셀 장별로 다르게 게시되게(현재 보던 장 제외).
        try {
          var _pp = meta && meta.perPhoto;
          if (_pp && _pp.length && window.ItdEditor && window.ItdEditor.compose) {
            var _eph = editablePhotos(), _rt = (meta.editState && meta.editState.ratio) || '4:5';
            _pp.forEach(function (e) {
              var tp = _eph[e.idx]; if (!tp || tp === p) return;   // 보던 장은 위에서 dataUrl 로 이미 저장
              var _cb = _cleanBase(tp) || photoUrl(tp);
              window.ItdEditor.compose({ photoUrl: _cb, ratio: _rt, layers: e.layers }).then(function (u) {
                if (!u) return;
                tp.editedDataUrl = u; tp.storyEdited = true;
                tp.editState = { v: 1, layoutIdx: 0, layoutOrder: [], cellCrop: [], fitMode: 'contain', ratio: _rt, adj: [], photoDraw: {}, photoBg: {}, photos: [_cb], layers: e.layers };
                d.previewUrl = null;   // [#3] 편집 중간에는 내 콘텐츠 저장 안 함 — 최종(발행/연결/저장)에서만. 데이터는 메모리 유지.
              });
            });
          }
        } catch (_ppe) { void _ppe; }
        d.previewUrl = null;
        _learnShopStyle(meta && meta.layers);   // [v587·C] 편집 결과를 우리샵 스타일로 학습
        // [#3] 편집 완료 시점엔 내 콘텐츠에 저장하지 않음(중간본 쌓임 방지). 편집 결과는 d.photos 메모리에 유지되어
        //   미리보기·발행에 그대로 쓰이고, 실제 저장은 워크플로 최종(발행/고객연결/저장)에서만.
        // [워크플로 재정렬] 편집기 완료 후 다음 목적지(예: 캡션→편집기→미리보기). 없으면 캡션 유지.
        if (d._editorNext) { var _nx = d._editorNext; d._editorNext = null; setScreen(_nx); }
        else if (cur === 'caption') setScreen('caption');
        toast('사진을 꾸몄어요');
      },
      onCancel: function () { d._editorNext = null; }   // 편집기 취소 시 라우팅 플래그 정리(다음 편집이 엉뚱히 미리보기로 안 가게)
    });
  }
  // [통합 편집기] 업로드 직후도 '옛 crop 화면'이 아니라 같은 ItdEditor 를 연다 → 완료하면 캡션 화면으로.
  //   새 업로드 사진은 editState=null 이라 자동으로 깨끗하게 열림(옛 편집 안 꺼냄).
  function _openEditFirst() {
    if (!(window.ItdEditor && window.ItdEditor.open)) { setScreen('caption'); return; }
    d._editorNext = 'caption';
    _openStoryEditor();
  }
  // [v587·C] ShopStyle 학습 피드백 루프 — 편집기에서 바꾼 폰트/색/위치/외곽선을 활성 스타일에
  //   되저장해 다음 사진부터 같은 스타일로 자동배치한다. (중앙x → 좌상단x 역변환)
  function _learnShopStyle(layers) {
    try {
      if (!Array.isArray(layers)) return;
      if (d.useShopStyle === false) return;
      var SS = window.ShopStyle; if (!(SS && SS.getActive && SS.save)) return;
      var ss = SS.getActive(); if (!ss || !Array.isArray(ss.layers)) return;
      var byRole = {};
      layers.forEach(function (l) { if (l && l.type === 'text' && l.role && !byRole[l.role]) byRole[l.role] = l; });
      var TEXT_ROLES = { title: 1, sub: 1, body: 1, hashtag: 1 };
      var openedRoles = d._editorOpenRoles || [];   // 이번 편집에 '올라갔던' 역할들(빠지면 사용자가 지운 것)
      var changed = false;
      var newLayers = ss.layers.map(function (L) {
        if (!TEXT_ROLES[L.role]) return L;
        var e = byRole[L.role];
        if (e) {
          // 존재 → 폰트/색/위치/외곽선 학습 + 다시 활성화.
          changed = true;
          var w = (e.w != null ? e.w : (L.w != null ? L.w : 0.84));
          var leftX = Math.max(0, Math.min(1, (e.x != null ? e.x - w / 2 : L.x)));
          return Object.assign({}, L, {
            x: leftX, y: (e.y != null ? e.y : L.y), w: w,
            font: e.font || L.font, color: e.color || L.color,
            size: (e.size != null ? e.size : L.size), weight: (e.weight != null ? e.weight : L.weight),
            align: e.align || L.align,
            lineHeight: (e.lineHeight != null ? e.lineHeight : L.lineHeight),
            letterSpacing: (e.letterSpacing != null ? e.letterSpacing : L.letterSpacing),
            opacity: (e.opacity != null ? e.opacity : L.opacity),
            outline: Object.assign({}, L.outline || {}, { on: !!e.stroke }),
            shadow: Object.assign({}, L.shadow || {}, { on: !!e.shadow }),
            enabled: true
          });
        }
        // [v590] 올렸는데 저장 결과에 없음 = 사용자가 편집기에서 제거 → 비활성화(다음부터 이 스타일은 해당 레이어 안 올림).
        if (openedRoles.indexOf(L.role) >= 0 && L.enabled !== false) { changed = true; return Object.assign({}, L, { enabled: false }); }
        return L;
      });
      if (!changed) return;
      SS.save(ss.id, { layers: newLayers });
    } catch (_e) { void _e; }
  }
  // [C5] _barClass: vc(방문횟수) → b1/b2/b3 클래스
  // [T-104 P0] barClass → flow/util.js

  /* ── 화면 마크업 ── */
  function shell() {
    return '' +
      '<div class="wsv2flow__bar">' +
        '<button type="button" class="wsv2flow__back" data-fl="back" aria-label="뒤로"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#ic-chevron-left"/></svg></button>' +
        '<div class="wsv2flow__title" data-fl-title>사진 업로드</div>' +
        '<span class="wsv2flow__step" data-fl-step></span>' +
      '</div>' +
      '<div class="wsv2flow__progress">' + VISIBLE_SCREENS.map(function () { return '<i class="pg-seg"></i>'; }).join('') + '</div>' +
      '<div class="wsv2flow__screens">' +
        '<section class="wsv2flow__s" data-fs="upload"></section>' +
        '<section class="wsv2flow__s" data-fs="layout"></section>' +   // 레이아웃 고르기 컨테이너
        '<section class="wsv2flow__s" data-fs="edit"></section>' +
        '<section class="wsv2flow__s" data-fs="template"></section>' +
        '<section class="wsv2flow__s" data-fs="caption"></section>' +
        '<section class="wsv2flow__s" data-fs="connect"></section>' +
        '<section class="wsv2flow__s" data-fs="preview"></section>' +
      '</div>' +
      // [v560] 편집 화면은 CTA 2분할 — 좌:저장하고 게시글 쓰기 / 우:템플릿 선택하기(cta2). 그 외 화면은 단일.
      '<footer class="wsv2flow__actionbar"><button class="wsv2flow__cta wsv2flow__cta--alt hidden" data-fl="cta2"></button><button class="wsv2flow__cta" data-fl="cta">다음</button></footer>' +
      '<input type="file" accept="image/*" multiple data-fl-file hidden>' +
      '<input type="file" accept="image/*" data-fl-bgfile hidden>' +
      // 올리기 로딩 — 시안 B(잇비 봇 둥둥 + 점3개 + 단계 멘트/인디케이터)
      '<div class="wsv2pub" data-fl-pub hidden aria-live="polite">' +
        '<div class="wsv2pub__card">' +
          '<div class="wsv2pub__bot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#ic-bot"/></svg></div>' +
          '<div class="wsv2pub__dots"><span></span><span></span><span></span></div>' +
          '<div class="wsv2pub__t" data-fl-pub-t>올리는 중…</div>' +
          '<div class="wsv2pub__s" data-fl-pub-s>사진을 인스타로 보내고 있어요</div>' +
          '<div class="wsv2pub__steps" data-fl-pub-steps><i class="on"></i><i></i><i></i></div>' +
        '</div>' +
      '</div>';
  }

  // [업로드 우선] 사진은 업로드가 먼저 — 클릭순 순서배지 + 사진별 전/후/기본 역할.
  //  탭 = 맨 앞으로(순서 조정), 휴지통 = 삭제. 전후 묶기 확장 위해 role(before/after/hero) 구조 유지.
  var _ROLE_SEG = [['before', '전'], ['after', '후'], ['hero', '기본']];
  // [#2] 인스타식 다중선택 — 탭하면 선택/해제 토글. 선택된 사진만 순서배지(선택순 랭크)·역할 세그먼트 노출.
  //   해제하면 배지 사라지고 남은 선택 사진이 1부터 다시 매겨짐(건너뛴 번호 없음). 다시 누르면 맨 끝 순서로.
  // [v531 렉] 역할 세그 HTML — 부분 갱신(_repaintUpload)에서도 재사용.
  function _segHtml(role, i) {
    return '<div class="thumb-seg" role="group" aria-label="이 사진 역할 지정">' +
      _ROLE_SEG.map(function (rl) {
        return '<button type="button" class="thumb-seg-b' + (rl[0] === 'hero' ? ' basic' : '') + (role === rl[0] ? ' on' : '') + '" data-fl-setrole="' + i + ':' + rl[0] + '">' + rl[1] + '</button>';
      }).join('') +
    '</div>';
  }
  function _upTileHtml(p, i, multi, order) {
    var selected = p.selected !== false;
    var role = p.role || 'hero';
    var seg = (multi && selected) ? _segHtml(role, i) : '';
    return '<div class="photo-tile' + (selected ? ' selected' : '') + '" style="background-image:url(' + esc(p.dataUrl) + ')" data-fl-tile="' + i + '" aria-pressed="' + selected + '">' +
      (selected ? '<span class="thumb-order">' + order + '</span>' : '') +
      '<button class="thumb-del" data-fl-del="' + i + '" aria-label="이 사진 삭제"><i class="ph-bold ph-trash"></i></button>' +
      seg + '</div>';
  }
  function _upSummaryHtml(n, multi, cnt) {
    if (!n) return '';
    return '<div class="up-summary"><span class="up-chip">선택 <b>' + n + '</b></span>' +
      (multi
        ? '<span class="up-chip">전 <b>' + cnt.before + '</b></span>' +
          '<span class="up-chip">후 <b>' + cnt.after + '</b></span>' +
          '<span class="up-chip">기본 <b>' + cnt.hero + '</b></span>'   // [cleanup] '전후쌍' 칩은 심플 플로우에서 숨김(상시)
        : '') + '</div>';
  }
  function renderUpload() {
    var n = d.photos.length;
    // [#2] 선택순 랭크 맵 — 배지 숫자는 선택순(selSeq) 1..k. 표시 순서는 업로드 배열순 유지.
    var selOrdered = _selectedOrdered();
    var selCount = selOrdered.length, multi = selCount >= 2;
    var rank = {};
    selOrdered.forEach(function (p, idx) { rank[p.id] = idx + 1; });
    var cnt = { before: 0, after: 0, hero: 0 };
    selOrdered.forEach(function (p) { var r = p.role || 'hero'; if (cnt[r] != null) cnt[r]++; else cnt.hero++; });
    var tiles = d.photos.map(function (p, i) { return _upTileHtml(p, i, multi, rank[p.id]); }).join('');
    var guide = n
      ? '<div class="up-guide">' +
          '<div class="up-guide-c"><b>1</b><small>사진을 탭해<br>선택·해제</small></div>' +
          '<div class="up-guide-c"><b>2</b><small>전·후·기본<br>역할 선택</small></div>' +
          '<div class="up-guide-c"><b>3</b><small>사진<br>편집</small></div>' +
        '</div>'
      : '';
    return '' +
      '<div class="up-kicker"><span class="up-kicker-dot"></span>사진을 올리면 AI가 게시글을 만들어요</div>' +
      '<div class="up-drop" data-fl-pick>' +
        '<span class="up-cloud"><i class="ph-duotone ph-cloud-arrow-up"></i></span>' +
        '<b>사진을 드래그하거나 여기를 눌러 업로드</b>' +
        '<span class="up-note">여러 장 한 번에 · JPG · PNG 최대 20MB</span>' +
      '</div>' + guide +
      '<div class="up-section">업로드한 사진 <b>' + n + '</b> / 10' +
        (n ? ' <span class="up-rolehint">· 탭해 <b>선택/해제</b>' + (multi ? ' · 전후는 사진마다 <b>전·후</b> 지정' : '') + '</span>' : '') + '</div>' +
      '<div class="upload-grid">' + tiles +
        '<div class="grid-add" data-fl-pick><i class="ph-bold ph-plus"></i><span>추가</span></div>' +
      '</div>' +
      '<div class="up-foot" data-up-foot>' + _upSummaryHtml(selCount, multi, cnt) + _pairPreviewHtml(cnt) + '</div>';
  }
  // [v531 렉] 역할/선택 변경 시 전체 재렌더(이미지 6장 base64 재파싱) 대신 in-place 갱신.
  //   타일 이미지 DOM 은 유지하고 selected 클래스·순서배지·역할 세그 on 상태만 바꾼다.
  //   요약/페어 미리보기는 rAF 로 묶어 빠른 연타에도 1프레임 1회만 재계산.
  function _repaintUpload() {
    if (!el || cur !== 'upload') return;
    var root = el.querySelector('[data-fs="upload"]'); if (!root) return;
    var selOrdered = _selectedOrdered();
    var multi = selOrdered.length >= 2;
    var rank = {}; selOrdered.forEach(function (p, idx) { rank[p.id] = idx + 1; });
    d.photos.forEach(function (p, i) {
      var tile = root.querySelector('[data-fl-tile="' + i + '"]'); if (!tile) return;
      var selected = p.selected !== false;
      tile.classList.toggle('selected', selected);
      tile.setAttribute('aria-pressed', selected);
      var ord = tile.querySelector('.thumb-order');
      if (selected) {
        if (!ord) { ord = document.createElement('span'); ord.className = 'thumb-order'; tile.insertBefore(ord, tile.firstChild); }
        ord.textContent = rank[p.id];
      } else if (ord) { ord.parentNode.removeChild(ord); }
      var seg = tile.querySelector('.thumb-seg');
      var role = p.role || 'hero';
      if (multi && selected) {
        if (!seg) { tile.insertAdjacentHTML('beforeend', _segHtml(role, i)); }
        else {
          var btns = seg.querySelectorAll('.thumb-seg-b');
          for (var k = 0; k < btns.length; k++) {
            btns[k].classList.toggle('on', btns[k].getAttribute('data-fl-setrole') === (i + ':' + role));
          }
        }
      } else if (seg) { seg.parentNode.removeChild(seg); }
    });
    _schedulePairPreview();
  }
  var _ppRaf = 0;
  function _schedulePairPreview() {
    if (_ppRaf) return;
    var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
    _ppRaf = raf(function () {
      _ppRaf = 0;
      if (!el || cur !== 'upload') return;
      var root = el.querySelector('[data-fs="upload"]'); if (!root) return;
      var foot = root.querySelector('[data-up-foot]'); if (!foot) return;
      var selOrdered = _selectedOrdered();
      var multi = selOrdered.length >= 2;
      var cnt = { before: 0, after: 0, hero: 0 };
      selOrdered.forEach(function (p) { var r = p.role || 'hero'; if (cnt[r] != null) cnt[r]++; else cnt.hero++; });
      foot.innerHTML = _upSummaryHtml(selOrdered.length, multi, cnt) + _pairPreviewHtml(cnt);
    });
  }

	  function _toolByKey(list, key) {
	    return (list || []).filter(function (c) { return c.k === key; })[0] || (list || [])[0];
	  }
	  function _hasValues(obj) {
	    return !!(obj && Object.keys(obj).some(function (k) { return +obj[k] !== 0; }));
	  }
	  function _bgPanelHtml() {
    var bgcur = d.bgAction || '';
    var bgColors = ['#ffffff', '#f7f3ee', '#fbeaef', '#fce8d8', '#fdf6c9', '#eaf3fc', '#e7f4ec', '#efe9f7', '#3a322c', '#1f1b18'];
    // [배경 정리] 개발자식 '누끼/배경제거/배경흐림' → 배경색 아이콘처럼 직관적인 아이콘 칩 한 줄로 통일.
    //  칩을 누르면 바로 인물 분리 후 적용. 보정은 인물에만 적용(배경은 그대로). 첫 클릭 즉시 처리 상태 노출.
    var bgOpts = [
      { act: 'reset',    ic: 'ph-arrow-counter-clockwise', lbl: '원본' },
      { act: 'removeBg', ic: 'ph-scissors',                lbl: '인물만' },
      { act: 'blur',     ic: 'ph-drop-half',               lbl: '배경 흐림' },
      { act: 'image',    ic: 'ph-image-square',            lbl: '내 배경', pick: true }
    ];
    var optsHtml = bgOpts.map(function (o) {
      var on = (o.act === 'reset') ? !d.bgAction : (bgcur === o.act);
      var attr = o.pick ? 'data-fl-bgpick' : ('data-fl-bg="' + o.act + '"');
      return '<button type="button" class="ed-bg__opt' + (on ? ' on' : '') + '" ' + attr + (d.bgBusy ? ' disabled' : '') +
        ' aria-label="' + esc(o.lbl) + '"><span class="ed-bg__opticon"><i class="ph-duotone ' + o.ic + '"></i></span><em>' + esc(o.lbl) + '</em></button>';
    }).join('');
    return '<div class="ed-bg">' +
        '<div class="ed-bg__sublabel">배경 정리</div>' +
        '<div class="ed-bg__opts">' + optsHtml + '</div>' +
        (d.customBgName ? '<div class="ed-bg__status">올린 배경: ' + esc(d.customBgName) + '</div>' : '') +
        '<div class="ed-bg__sublabel">배경 색으로 채우기</div>' +
        '<div class="ed-bg__colors">' + bgColors.map(function (c) {
          return '<button type="button" class="ed-bg__color' + (d.bgColor === c ? ' on' : '') + '" data-fl-bgcolor="' + c + '" style="background:' + c + '" aria-label="배경색"' + (d.bgBusy ? ' disabled' : '') + '></button>';
        }).join('') + '</div>' +
        '<div class="ed-bg__status' + (d.bgFail ? ' is-fail' : (d.bgBusy ? ' is-busy' : '')) + '" data-fl-bgstatus>' + (d.bgBusy ? '<i class="ph-duotone ph-spinner-gap ed-bg__spin"></i>배경 정리 중… (몇 초 걸려요)' : (d.bgFail ? esc(d.bgFailMsg || '배경 처리에 실패했어요') : (d.bgAction ? '적용됨 — 밝기·보정은 인물에만 적용돼요(배경 그대로)' : '아이콘을 누르면 바로 인물을 분리해요'))) + '</div>' +
      '</div>';
	  }
	  function _toolButtons(ctrls, activeKey, attr) {
	    return '<div class="ed-tools">' + ctrls.map(function (c) {
	      return '<div class="ed-tool' + (c.k === activeKey ? ' on' : '') + '" ' + attr + '="' + c.k + '"><span class="ed-circle"><i class="ph-duotone ' + c.ic + '"></i></span>' + c.l + '</div>';
	    }).join('') + '</div>';
	  }
	  // 좌·우 고정 라벨만 있는 슬라이더 row (가운데 숫자/동적문구 없음).
	  function _labeledRange(lo, hi, min, max, val, attr, key, extraCls) {
	    return '<div class="ed-slider ed-slider--labeled' + (extraCls ? ' ' + extraCls : '') + '">' +
	      '<span class="ed-slabel ed-slabel--lo">' + esc(lo) + '</span>' +
	      '<input type="range" min="' + min + '" max="' + max + '" value="' + val + '" ' + attr + '="' + key + '">' +
	      '<span class="ed-slabel ed-slabel--hi">' + esc(hi) + '</span></div>';
	  }
	  function _mainAdjustHtml() {
	    var active = d.basicTool || 'brightness';
	    var buttons = _toolButtons(MAIN_TOOLS, active, 'data-fl-basictool');
	    if (active === 'background') return buttons + '<div class="ed-panel">' + _bgPanelHtml() + '</div>';
	    var actObj = _toolByKey(MAIN_TOOLS, active);
	    var val = (d.adjust && d.adjust[active]) || 0;
	    return buttons + _labeledRange(actObj.lo || '약하게', actObj.hi || '강하게', -100, 100, val, 'data-fl-range', active);
	  }
	  function _beautySlider(ctrls, activeKey) {
	    var active = activeKey && ctrls.some(function (c) { return c.k === activeKey; }) ? activeKey : ctrls[0].k;
	    var actObj = _toolByKey(ctrls, active);
	    var val = (d.beauty && d.beauty[active]) || 0;
	    return _toolButtons(ctrls, active, 'data-fl-beautytool') +
	      _labeledRange('자연', '강하게', 0, 100, val, 'data-fl-beautyrange', active, 'ed-slider--beauty');
	  }

  // ── 편집화면: 섹션별 빌더 (버튼 탭 시 해당 섹션만 갱신 → 전체 재렌더/대용량 dataURL 재디코딩 제거) ──
  function _editPhotoUrls() {
    var _ep = curEditPhoto();
    var base = photoUrl(_ep);                          // 현재 작업본(편집 반영)
    var orig = _ep ? (_ep.dataUrl || base) : base;     // 손대기 전 진짜 원본
    var url = d.originalPreview ? orig : (d.previewUrl || base);
    var preview = (d.originalPreview || d.previewUrl) ? 'none' : filterCss(d.adjust);
    return { url: url, preview: preview };
  }
  function _editPhotoLabel(p, i) {
    // [#1] 전/후 역할 라벨은 '전후 비교'일 때만 의미 있음 — 일반 게시물에선 그냥 '사진 N'(쓸데없는 전/후/기본 분류 제거).
    if (d.tplPurpose === 'before_after' && p) {
      if (p.role === 'before') return '전 사진';
      if (p.role === 'after') return '후 사진';
    }
    return '사진 ' + (i + 1);
  }
  // [v550] 큰 편집 사진을 좌우로 넘기는 carousel 네비 — 상단 큰 썸네일 rail 대신 컴팩트 dot+카운터+
  //   "이 사진 편집 중" pill + PC 화살표. 실제 전환은 큰 프리뷰 스와이프(_bindSwipe)/화살표/키보드.
  function _editSwitcherHtml() {
    var eps = editablePhotos();
    if (eps.length < 2) return '';
    var curIdx = (d.editIdx == null) ? 0 : d.editIdx;
    var dots = eps.map(function (p, i) {
      return '<button type="button" class="ed-carnav__dot' + (i === curIdx ? ' on' : '') + '" data-fl-editsel="' + i + '" role="tab" aria-selected="' + (i === curIdx) + '" aria-label="' + esc(_editPhotoLabel(p, i)) + '"></button>';
    }).join('');
    return '<div class="ed-carnav" role="tablist" aria-label="편집할 사진 전환">' +
      '<button type="button" class="ed-carnav__arw ed-carnav__arw--prev" data-fl-edswipe="prev" aria-label="이전 사진"' + (curIdx <= 0 ? ' disabled' : '') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>' +
      '<div class="ed-carnav__mid">' +
        '<span class="ed-carnav__pill">이 사진 편집 중 · <b>' + esc(_editPhotoLabel(eps[curIdx], curIdx)) + '</b></span>' +
        '<div class="ed-carnav__dots">' + dots + '</div>' +
        '<span class="ed-carnav__count">' + (curIdx + 1) + ' / ' + eps.length + '</span>' +
      '</div>' +
      '<button type="button" class="ed-carnav__arw ed-carnav__arw--next" data-fl-edswipe="next" aria-label="다음 사진"' + (curIdx >= eps.length - 1 ? ' disabled' : '') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>' +
    '</div>';
  }
  function _editBottomHtml() {
    return '<div class="ed-bottom">' +
      '<div class="eb' + (d.undo && d.undo.length ? '' : ' disabled') + '" data-fl-eb="되돌리기"><svg class="eb-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a4 4 0 0 1 0 8h-1"/></svg>되돌리기</div>' +
      '<div class="eb' + (d.redo && d.redo.length ? '' : ' disabled') + '" data-fl-eb="다시실행"><svg class="eb-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9H9a4 4 0 0 0 0 8h1"/></svg>다시실행</div>' +
      // [v560] '비교'·'원본보기' 중복 버튼 통합 — 단일 '원본보기'(비파괴 비교 토글, active 표시).
      '<div class="eb' + (d.originalPreview ? ' active' : '') + '" data-fl-eb="원본보기"><span class="activebox"><svg class="eb-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg></span>원본보기</div>' +
      '<div class="eb" data-fl-eb="초기화"><svg class="eb-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.4 2.6L3 8"/><path d="M3 3v5h5"/></svg>초기화</div>' +
      '</div>';
  }
  // [T-104 P0] _caret → flow/util.js
  // [v538] '전·후 사진 확인' 인라인 패널 — 토스트 대신, 선택 사진마다 전/후/기본을 바로 재지정.
  //   화면 이동 없이 고급 탭 안에서 완결(CLAUDE.md 인라인 편집 철학). 기존 _setRole/_ROLE_SEG 재사용.
  function _roleSegInline(role, i) {
    return '<div class="ed-roles__seg" role="group" aria-label="이 사진 역할 지정">' +
      _ROLE_SEG.map(function (rl) {
        return '<button type="button" class="ed-roles__b' + (rl[0] === 'before' ? ' before' : '') + (role === rl[0] ? ' on' : '') + '" data-fl-setrole="' + i + ':' + rl[0] + '">' + rl[1] + '</button>';
      }).join('') + '</div>';
  }
  function _rolesPanelHtml() {
    var eps = editablePhotos();
    if (!eps.length) return '<div class="ed-roles-empty">선택된 사진이 없어요. 먼저 사진을 골라 주세요.</div>';
    return '<div class="ed-roles">' + eps.map(function (p) {
      var idx = d.photos.indexOf(p);
      var role = p.role || 'hero';
      return '<div class="ed-roles__row"><span class="ed-roles__thumb" style="background-image:url(' + esc(photoUrl(p)) + ')"></span>' + _roleSegInline(role, idx) + '</div>';
    }).join('') + '<div class="ed-roles__hint">전후 비교 템플릿은 <b>전</b>·<b>후</b>를 각각 1장 이상 지정하세요.</div></div>';
  }
  function _advFoldHtml() {
    var prec = PRECISION_TABS;
    var ptab = d.editTab && prec.some(function (t) { return t.k === d.editTab; }) ? d.editTab : prec[0].k;
    var ptabObj = prec.filter(function (t) { return t.k === ptab; })[0];
    var precBody = '';
    // [v554] 정밀 조정 항상 펼침 — advOpen 게이트 제거(접기 토글이 없어 false 가 되면 영구 사라지는 함정 방지).
    {
      var inner;
      if (ptab === 'tools') {
        // [v560] '전·후 사진 확인'(roles)은 '템플릿 선택' 화면으로 이동 — 고급탭엔 자르기만.
        inner = '<div class="ed-adv">' +
          '<button type="button" class="ed-adv__btn" data-fl="crop"><i class="ph-duotone ph-crop"></i>자르기</button>' +
          '</div>';
      } else {
        inner = '<div class="ed-adv">' + _beautySlider(ptabObj.controls || [], d.precTool) + '</div>';
      }
      var precTabsHtml = '<div class="ed-tabs">' + prec.map(function (t) {
        return '<div class="ed-tab' + (t.k === ptab ? ' on' : '') + '" data-fl-edtab="' + t.k + '"><i class="ph-duotone ' + t.ic + '"></i>' + t.label + '</div>';
      }).join('') + '</div>';
      // [v540] 마스크 보기 — 정밀 조정 안으로 이동. 효과 부위 탭(피부/헤어/눈·눈썹/네일)에서만 노출(고급 제외).
      // [v561] '직접 칠하기'(수동 마스크) — 자동 인식이 틀리거나 못 잡을 때 원장님이 영역을 직접 칠해 교정.
      // [v566·scope4] 보정 슬라이더가 먼저, '영역 다듬기(마스크 도구)'는 그 아래 보조 영역으로.
      var maskPill = (ptab !== 'tools')
        ? '<div class="ed-masktools">' +
            '<div class="ed-mask-subhead"><i class="ph-duotone ph-selection-plus" aria-hidden="true"></i>' + esc(ptabObj.label) + ' 영역 다듬기 <span>자동 인식이 어긋날 때만 직접 칠해 교정</span><span class="ed-mask-stat" data-fl-maskbadge hidden></span></div>' +
            '<div class="ed-maskpill-row">' +
              '<button type="button" class="ed-maskpill' + (d.maskView && !d.maskPaint ? ' on' : '') + '" data-fl-eb="마스크" aria-pressed="' + (d.maskView && !d.maskPaint ? 'true' : 'false') + '"><i class="ph-duotone ph-stack"></i>마스크 보기</button>' +
              '<button type="button" class="ed-maskpill' + (d.maskPaint ? ' on' : '') + '" data-fl="maskpaint" aria-pressed="' + (d.maskPaint ? 'true' : 'false') + '"><i class="ph-duotone ph-pencil-simple"></i>직접 칠하기</button>' +
              (d.maskPaint ? _maskPaintControlsHtml() : '') +
              '<div class="ed-mask-helper" data-fl-maskhelper hidden></div>' +
            '</div>' +
          '</div>'
        : '';
      // [v566·scope4] 순서: 탭 → 보정 슬라이더(inner) → 마스크 도구(maskPill).
      precBody = '<div class="ed-panel">' + precTabsHtml + inner + maskPill + (ptab !== 'tools' ? _photoDebugPanelHtml() : '') + '</div>';
    }
    // [v554] 정밀 조정 항상 펼침 — 접기/펼치기 버튼·caret(chevron) 제거(기능 숨김 오해 방지). 정적 헤더만 노출.
    return '<div class="ed-prec-head"><i class="ph-duotone ph-faders" aria-hidden="true"></i><span>정밀 조정</span></div>' + precBody;
  }
  // [#3] 템플릿 카드 썸네일 = 고정 예시 뷰티 이미지(번들 자산). 업로드 사진은 절대 카드에 주입하지 않는다.
  //   사용자 사진은 applyTemplate(적용) 단계에서만 실제 캔버스에 렌더된다.
  // [T-104 P1] 템플릿 썸네일 클러스터(_TPL_EX·_tplExample·_collageThumb·_tplThumb·캐시) → flow/thumbs.js (상단 별칭)
  // [v531] purpose ↔ 콘텐츠 유형(cat) 매핑 + 유형별 기본 템플릿 조회(home.js 와 공유 저장소).
  // [T-104 P0] _purposeCat → flow/util.js
  function _getDefaultTpl(cat) { return (window.WorkspaceDefaultTpl && window.WorkspaceDefaultTpl.get(cat)) || ''; }
  // [v531] 템플릿 적용 상태 — 명확한 배너(결과물 N장) + 결과물 스트립(Pair N 결과) + 해제/바꾸기.
  // [v541] 적용 결과 — 작은 스트립 → 인스타식 큰 4:5 캐러셀(Pair 스와이프). 액션은 active Pair 기준.
  //   스크롤 동기 기계(_carSyncActive/_carItems)와 정합 위해 _displayItems() 동일 소스 사용.
  function _carItemLabel(it, i) {
    if (it.kind !== 'output') return it.label || '사진';
    var base = it.label || ('Pair ' + (i + 1)), tn = '';
    var o = (d.templateOutputs || []).filter(function (x) { return x.pairId === it.id; })[0];
    if (o && o.templateId) { var _t = WORKSPACE_TEMPLATES.filter(function (x) { return x.id === o.templateId; })[0]; tn = _t ? _t.label : ''; }
    return base + (tn ? ' · ' + tn : '');   // [v541] active 라벨에 현재 Pair 템플릿명 표시(짝별 개별 적용 확인)
  }
  // [v559] 템플릿 결과를 '큰 preview 와 한 흐름'으로 — 별도 fold 카루셀 대신, 적용 시 항상 보이는 인라인 결과.
  //   활성 pair 의 합성 결과(전+후 한 장)를 크게 + '적용됨' badge + (다중)pair chip + 바꾸기/해제.
  function _tplAppliedHtml() {
    if (!d.templateId) return '';
    var outs = d.templateOutputs || [];
    if (!outs.length) return '';
    var isBA = d.tplPurpose === 'before_after';
    var activeId = _activeOutputPair();
    var active = null; for (var i = 0; i < outs.length; i++) { if (outs[i].pairId === activeId) { active = outs[i]; break; } }
    if (!active) active = outs[0];
    var actIdx = 0; for (var k = 0; k < outs.length; k++) { if (outs[k].pairId === active.pairId) { actIdx = k; break; } }
    // [v561·항목4] 다중 결과물은 '1번 보기/2번 보기' 텍스트 버튼 대신 좌우 스와이프 + dot + n/N 카운터.
    var badge = '<div class="tplres__badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' +
        '<b>' + (isBA ? '전후 템플릿 적용됨' : '템플릿 적용됨') + '</b>' +
        (outs.length > 1 ? '<em>' + (actIdx + 1) + ' / ' + outs.length + '</em>' : '') + '</div>';
    var img = '<div class="tplres__img" data-fl-tplresult style="background-image:url(' + esc(active.outputUrl) + ')"></div>';
    var pairs = outs.length > 1 ? '<div class="tplres__nav" role="tablist" aria-label="결과물 전환 — 좌우로 넘기기">' +
        '<button type="button" class="tplres__arw" data-fl-pairstep="prev" aria-label="이전 결과물"' + (actIdx <= 0 ? ' disabled' : '') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>' +
        '<div class="tplres__dots">' + outs.map(function (o, i) {
          return '<button type="button" class="tplres__dot' + (o.pairId === active.pairId ? ' on' : '') + '" data-fl-pairsel="' + esc(o.pairId) + '" role="tab" aria-selected="' + (o.pairId === active.pairId) + '" aria-label="' + (i + 1) + '번째 결과물"></button>';
        }).join('') + '</div>' +
        '<button type="button" class="tplres__arw" data-fl-pairstep="next" aria-label="다음 결과물"' + (actIdx >= outs.length - 1 ? ' disabled' : '') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>' +
      '</div>' : '';
    var actions = '<div class="tplres__act">' +
        '<button type="button" class="tplres__change" data-fl="tplchange-active">템플릿 바꾸기</button>' +   // [v565·scope3] 현재 보고 있는 결과 1장만 교체(전역 일괄 금지)
        (!isBA ? '<button type="button" class="tplres__edit" data-fl="tpleditactive">문구 수정</button>' : '') +
        '<button type="button" class="tplres__release" data-fl="tplrelease">해제</button>' +
      '</div>';
    return '<div class="tplres">' + badge + img + pairs + actions + '</div>';
  }
  function _activeOutputPair() {
    var outs = d.templateOutputs || [];
    if (d.activeDisplayId && outs.some(function (o) { return o.pairId === d.activeDisplayId; })) return d.activeDisplayId;
    return outs[0] ? outs[0].pairId : null;
  }
  // [v561·항목4] 결과물 전환 후 현재 화면만 부분 재렌더(템플릿 화면이면 그쪽, 아니면 인라인 결과 섹션).
  function _rerenderTplResult() { if (cur === 'template') _rerenderTemplate(); else _renderTplSection(); }
  function _stepPair(dir) {
    var outs = d.templateOutputs || []; if (outs.length < 2) return;
    var cap = _activeOutputPair();
    var idx = 0; for (var i = 0; i < outs.length; i++) { if (outs[i].pairId === cap) { idx = i; break; } }
    var ni = Math.max(0, Math.min(outs.length - 1, idx + dir));
    if (ni === idx) return;
    d.activeDisplayId = outs[ni].pairId; _rerenderTplResult();
  }
  // [v541] 템플릿 섹션 재렌더 + 결과 캐러셀 스와이프 바인딩(전체 재렌더 없이).
  function _renderTplSection() {
    _setEditSection('[data-ed-tpl]', _tplFoldHtml());
    var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
    raf(function () { _mountCarousel(); });
  }
  // [v560] 'template' step 전용 재렌더 — 전/후 지정·카테고리 칩·템플릿 적용 결과를 그 화면에서 갱신.
  function _rerenderTemplate() {
    var sec = el && el.querySelector('.wsv2flow__s[data-fs="template"]');
    if (!sec) return;
    // [v566·scope5] 사진 스트립 가로 스크롤 위치 보존 — 재렌더로 '4번째 보던 사진'이 1번째로 튕기는 문제 차단.
    var prevStrip = sec.querySelector('[data-fl-tplstrip]');
    var prevLeft = prevStrip ? prevStrip.scrollLeft : 0;
    sec.innerHTML = renderTemplate();
    var nstrip = sec.querySelector('[data-fl-tplstrip]');
    if (nstrip && prevLeft) nstrip.scrollLeft = prevLeft;
    var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
    raf(function () { _mountCarousel(); });
  }
  function _tplById(id) { return WORKSPACE_TEMPLATES.filter(function (t) { return t.id === id; })[0] || null; }
  // [v559] 현재 편집 사진의 보정을 전후 템플릿 결과에 반영 — 그 사진이 속한 pair 를 라이브 미리보기(d.previewUrl,
  //   없으면 baked)로 비파괴 재합성(클라 캔버스). 원본 photo 객체는 안 건드리고 templateOutputs 만 갱신 → 결과 인라인 즉시 반영.
  function _recompositeActivePair() {
    if (d.tplPurpose !== 'before_after' || !d.templateId) return;
    if (!(window.WorkspaceAdapter && window.WorkspaceAdapter.applyWorkspaceTemplate)) return;
    var photo = curEditPhoto(); if (!photo) return;
    var outs = (d.templateOutputs || []).slice(); if (!outs.length) return;
    var pairs = _computePairs().pairs;
    var liveUrl = (!d.originalPreview && d.previewUrl) ? d.previewUrl : photoUrl(photo);
    var jobs = [];
    outs.forEach(function (o, idx) {
      if (o.beforePhotoId !== photo.id && o.afterPhotoId !== photo.id) return;
      var pr = null; for (var i = 0; i < pairs.length; i++) { if (pairs[i].before.id === o.beforePhotoId && pairs[i].after.id === o.afterPhotoId) { pr = pairs[i]; break; } }
      if (!pr) return;
      var tplObj = _tplById(o.templateId); if (!tplObj) return;
      var bef = pr.before.id === photo.id ? Object.assign({}, pr.before, { editedDataUrl: liveUrl }) : pr.before;
      var aft = pr.after.id === photo.id ? Object.assign({}, pr.after, { editedDataUrl: liveUrl }) : pr.after;
      jobs.push(window.WorkspaceAdapter.applyWorkspaceTemplate({ template: tplObj, photos: [bef, aft], service: d.service, customerName: d.customerName, caption: d.caption })
        .then(function (r) { if (r && r.ok && r.dataUrl) outs[idx] = Object.assign({}, o, { outputUrl: r.dataUrl }); }).catch(function () { }));
    });
    if (!jobs.length) return;
    var tok = (d._recTok = (d._recTok || 0) + 1);
    Promise.all(jobs).then(function () {
      if (tok !== d._recTok) return;
      d.templateOutputs = outs;
      d.templateOutput = (outs[0] && outs[0].outputUrl) || d.templateOutput;
      _renderTplSection();
    });
  }
  function _tplFoldHtml() {
    // [v561·항목1] 편집 화면의 '템플릿 꾸미기' 접이식 그리드 제거 — 템플릿 선택은 전용 '템플릿 선택하기'
    //   화면(하단 CTA)으로 일원화. 편집 화면엔 이미 적용된 결과 미리보기만 인라인으로 둔다(없으면 빈 출력).
    return _tplAppliedHtml();
  }
  // [v575·필수8/11] 사진 '아래' slim 도구바 — 사진 위 overlay 전면 제거(사진 안 가림).
  //   확대/축소·화면맞춤·전체화면만. 마스크 보기/직접 칠하기는 정밀 조정 메뉴(ed-maskpill) 1세트로 일원화(여기엔 없음).
  function _vpToolsHtml() {
    var z = d.zoom || { s: 1 };
    var pct = Math.round((z.s || 1) * 100);
    return '<div class="ed-vptools" data-ed-vptools>' +
      '<button type="button" class="ed-vpbtn ed-vpbtn--fs" data-fl="edfull" aria-label="' + (d.edFull ? '전체화면 닫기' : '크게 보기') + '"><i class="ph-duotone ph-' + (d.edFull ? 'arrows-in' : 'arrows-out') + '"></i><span>' + (d.edFull ? '닫기' : '크게') + '</span></button>' +
      '<div class="ed-vpzoom">' +
        '<button type="button" class="ed-vpbtn ed-vpbtn--ic" data-fl="edzoomout" aria-label="축소">−</button>' +
        '<button type="button" class="ed-vpbtn ed-vpbtn--pct" data-fl="edzoomfit" aria-label="화면맞춤"><span data-ed-zoompct>' + pct + '%</span></button>' +
        '<button type="button" class="ed-vpbtn ed-vpbtn--ic" data-fl="edzoomin" aria-label="확대">+</button>' +
      '</div>' +
    '</div>';
  }
  function _renderVpTools() {
    var c = el && el.querySelector('[data-fs="edit"] [data-ed-vptools]');
    if (c) { var tmp = document.createElement('div'); tmp.innerHTML = _vpToolsHtml(); c.replaceWith(tmp.firstChild); }
  }
  function _updateZoomPct() {
    var s = el && el.querySelector('[data-fs="edit"] [data-ed-zoompct]');
    if (s) s.textContent = Math.round((((d.zoom && d.zoom.s) || 1)) * 100) + '%';
  }
  function renderEdit() {
    d.zoom = { s: 1, tx: 0, ty: 0 };   // 편집화면 새로 그릴 때(진입/사진전환) 줌 초기화
    var pu = _editPhotoUrls();
    return '' +
      '<div class="ed-sec" data-ed-switcher>' + _editSwitcherHtml() + '</div>' +
      '<div class="ed-photo-vp" data-fl-edvp><div class="ed-photo" data-fl-edphoto style="background-image:url(' + esc(pu.url) + ');filter:' + pu.preview + '"></div><canvas class="ed-mask-ov" data-fl-maskov hidden></canvas></div>' + _vpToolsHtml() +
      '<div class="ed-sec" data-ed-basic>' + _mainAdjustHtml() + '</div>' +
      '<div class="ed-sec" data-ed-bottom>' + _editBottomHtml() + '</div>' +
      '<div class="ed-sec" data-ed-adv>' + _advFoldHtml() + '</div>' +
      '<div class="ed-sec" data-ed-tpl>' + _tplFoldHtml() + '</div>';
  }
  // 특정 섹션만 교체 (전체 재렌더 회피)
  function _setEditSection(sel, html) { if (!el) return; var c = el.querySelector('[data-fs="edit"] ' + sel); if (c) c.innerHTML = html; }
  function _paintEditPhoto() {
    var p = el && el.querySelector('[data-fs="edit"] [data-fl-edphoto]'); if (!p) return;
    var pu = _editPhotoUrls();
    p.style.backgroundImage = 'url(' + pu.url + ')'; p.style.filter = pu.preview;
    _applyZoomTransform();
  }
  function _applyZoomTransform() {
    var p = el && el.querySelector('[data-fs="edit"] [data-fl-edphoto]'); if (!p) return;
    var z = d.zoom || { s: 1, tx: 0, ty: 0 };
    var tf = 'translate(' + z.tx + 'px,' + z.ty + 'px) scale(' + z.s + ')';
    p.style.transform = tf;
    var ov = el.querySelector('[data-fs="edit"] [data-fl-maskov]');   // [v539] 마스크 overlay 도 동일 변환
    if (ov) ov.style.transform = tf;
    _updateZoomPct();   // [v568·B-1] floating 도구바의 배율 % 갱신
  }

  // ── [v542] 보정 디버그 패널 — 개발자모드(__ITDASY_PHOTO_DEBUG__ 또는 ?photoDebug=1)에서만 ──
  function _photoDebugOn() {
    try { if (window.__ITDASY_PHOTO_DEBUG__) return true; return /[?&]photoDebug=1/.test(location.search || ''); } catch (_e) { return false; }
  }
  var _FX_MASK = { skin: 'skinMask', redness: 'skinMask', blemish: 'skinMask(spot)', textureSmooth: 'skinMask', yellowness: 'skinMask', hairDetail: 'hairMask', hairVolume: 'hairMask+경계', hairShine: 'hairMask', hairFull: 'hairW 휴리스틱', hairEndsClean: 'hairMask 외곽띠', browSharp: 'browMask→eyeROI', lashSharp: 'lashMask→eyeROI', eyeRedness: 'scleraMask→eyeW', catchLight: 'eyeMask', irisClear: 'eyeMask', nailGloss: 'nailMask 필수', nailShape: 'nailMask 필수', handSkin: 'handSkinMask 필수' };
  var _FX_MULT = { textureSmooth: 0.72, blemish: 0.8, skin: 1, redness: 1, hairFull: 0.34, hairEndsClean: 0.42, hairDetail: '1/150~300', lashSharp: '1/65~120', browSharp: '1/90~400', nailShape: '1/55~200', catchLight: 0.38 };
  function _activePrecKey() {
    var tab = d.editTab || 'skin';
    var to = PRECISION_TABS.filter(function (t) { return t.k === tab; })[0];
    if (!to || !to.controls || !to.controls.length) return null;
    if (d.precTool && to.controls.some(function (c) { return c.k === d.precTool; })) return d.precTool;
    return to.controls[0].k;
  }
  function _activePrecLabel(key) {
    var tab = d.editTab || 'skin';
    var to = PRECISION_TABS.filter(function (t) { return t.k === tab; })[0];
    var c = to && to.controls ? to.controls.filter(function (x) { return x.k === key; })[0] : null;
    return c ? c.l : key;
  }
  function _photoDebugPanelHtml() {
    if (!_photoDebugOn()) return '';
    var key = _activePrecKey(); if (!key) return '';
    var val = (d.beauty && d.beauty[key]) || 0;
    var last = window.__photofxLast || {};
    var cov = (typeof d._maskCovPct === 'number' && d._maskCovKey === key) ? (d._maskCovPct + '%') : '— (마스크 보기 ON 시)';
    var rows = [
      ['기능', _activePrecLabel(key)],
      ['uiKey / engineKey', key],
      ['mask', _FX_MASK[key] || '—'],
      ['value / norm', val + ' / ' + (val / 100).toFixed(2)],
      ['mask coverage', cov],
      ['render', (last.time != null ? last.time + 'ms · ' + (last.path || '?') + ' · ' + last.w + 'x' + last.h + (last.cacheReuse ? ' · cache' : '') : '—')],
      ['tuningMultiplier', String(_FX_MULT[key] != null ? _FX_MULT[key] : '—')],
    ];
    var grid = rows.map(function (r) { return '<div class="ed-fxdebug__r"><span>' + esc(r[0]) + '</span><b>' + esc(String(r[1])) + '</b></div>'; }).join('');
    return '<div class="ed-fxdebug" data-fl-fxdebug>' +
        '<div class="ed-fxdebug__hd">보정 디버그 <em>개발자모드</em></div>' + grid +
        '<div class="ed-fxdebug__btns">' +
          '<button type="button" data-fl-fxv="0">0 보기</button>' +
          '<button type="button" data-fl-fxv="50">50 보기</button>' +
          '<button type="button" data-fl-fxv="100">100 보기</button>' +
          '<button type="button" data-fl="fxcopy" class="ed-fxdebug__copy">현재값 복사</button>' +
        '</div>' +
        '<div class="ed-fxdebug__note">마스크 잘 잡히는데 delta 낮으면 엔진/강도 문제 · coverage 0이면 fallback ROI</div>' +
      '</div>';
  }
  // 현재 효과를 다운스케일 샘플에 적용해 마스크 안/밖 delta 실측(현재값 복사용).
  // [v545] 효과별 coverage/delta 판정에 쓰는 '실제 사용 마스크' 키. native useMasks 또는 별도 게터(brow/lash 는 m.*).
  var _FX_MASKKEY = { skin: 'skinMask', redness: 'skinMask', blemish: 'skinMask', textureSmooth: 'skinMask', yellowness: 'skinMask', handSkin: 'handSkinMask', hairDetail: 'hairMask', hairVolume: 'hairMask', hairShine: 'hairMask', hairFull: 'hairMask', hairEndsClean: 'hairMask', browSharp: 'browMask', lashSharp: 'lashMask', eyeRedness: 'scleraMask', catchLight: 'eyeMask', irisClear: 'eyeMask', nailGloss: 'nailMask', nailShape: 'nailMask' };
  // 실제 apply 경로(어댑터 _beautyMasksAsync)와 동일하게 마스크 페치 — getMasksForBeauty + brow/sclera/nail/lash 게터.
  function _fxFetchMasks(img, beauty, done) {
    var MA = window.MaskApplication;
    if (!MA || typeof MA.getMasksForBeauty !== 'function') { done(null); return; }
    Promise.resolve(MA.getMasksForBeauty(img)).then(function (base) {
      var m = base ? { useMasks: Object.assign({}, base.useMasks), _scale: Object.assign({}, base._scale), maskW: base.maskW, maskH: base.maskH } : null;
      function ensure() { return m || (m = { useMasks: {}, _scale: {}, maskW: img.naturalWidth || img.width, maskH: img.naturalHeight || img.height }); }
      try {
        if ((beauty.lashSharp || 0) > 0 && MA.getLashMaskSync) { var l = MA.getLashMaskSync(img); if (l) { ensure().lashMask = l.mask; m.lashScale = l.scale; } }
        if ((beauty.eyeRedness || 0) > 0 && MA.getScleraMaskSync) { var sc = MA.getScleraMaskSync(img); if (sc) { ensure().useMasks.scleraMask = sc.mask; m._scale.scleraMask = sc.scale; } }
        if ((beauty.browSharp || 0) > 0 && MA.getBrowMaskSync) { var br = MA.getBrowMaskSync(img); if (br) { ensure().browMask = br.mask; m.browScale = br.scale; } }
        if (((beauty.nailGloss || 0) > 0 || (beauty.nailShape || 0) > 0) && MA.getNailMaskSync) { var nl = MA.getNailMaskSync(img); if (nl) { ensure().useMasks.nailMask = nl.mask; m._scale.nailMask = nl.scale; } }
        if ((beauty.handSkin || 0) > 0 && MA.getHandSkinMaskSync) { var hs = MA.getHandSkinMaskSync(img); if (hs) { ensure().useMasks.handSkinMask = hs.mask; m._scale.handSkinMask = hs.scale; } }
      } catch (_e) { void _e; }
      done(m);
    }).catch(function () { done(null); });
  }
  function _measureFx(key, value, cb) {
    var photo = curEditPhoto(); if (!photo) { cb(null); return; }
    var url = photo.editedDataUrl || photo.dataUrl;
    var img = new Image();
    img.onload = function () {
      var MX = 360, iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      var s = Math.min(1, MX / Math.max(iw, ih)), w = Math.max(1, Math.round(iw * s)), h = Math.max(1, Math.round(ih * s));
      var beauty = {}; beauty[key] = value;
      _fxFetchMasks(img, beauty, function (masks) {
        try {
          var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          var cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, w, h);
          var before = cx.getImageData(0, 0, w, h).data.slice();
          var t0 = performance.now();
          // value=0 은 엔진 no-op(coeffs=0) — 측정도 그대로 0 확인.
          if (window.PhotoEditorBeautyEngine && value !== 0) window.PhotoEditorBeautyEngine.apply(cx, w, h, beauty, false, masks);
          var ms = Math.round(performance.now() - t0);
          var after = cx.getImageData(0, 0, w, h).data;
          var mtype = _FX_MASKKEY[key];
          var mask = masks ? ((masks.useMasks && masks.useMasks[mtype]) || masks[mtype] || null) : null;   // useMasks 또는 m.browMask/lashMask
          var mw = masks ? masks.maskW : 0, mh = masks ? masks.maskH : 0;
          var inS = 0, inN = 0, outS = 0, outN = 0, cov = 0, tot = 0;
          for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
            var i = (y * w + x) * 4, dd = Math.abs(after[i] - before[i]) + Math.abs(after[i + 1] - before[i + 1]) + Math.abs(after[i + 2] - before[i + 2]);
            var inMask = 1;
            if (mask) { var mx2 = Math.min(mw - 1, (x * mw / w) | 0), my2 = Math.min(mh - 1, (y * mh / h) | 0); var mv = mask[my2 * mw + mx2] || 0; inMask = mv > 0.3 ? 1 : 0; if (mv > 0.3) cov++; tot++; }
            if (inMask) { inS += dd; inN += 3; } else { outS += dd; outN += 3; }
          }
          cb({ target: +(inS / Math.max(1, inN)).toFixed(2), outside: +(outS / Math.max(1, outN)).toFixed(2), coverage: tot ? +(cov / tot * 100).toFixed(1) : null, time: ms, hasMask: !!mask, fallbackUsed: !mask, noop: value === 0 });
        } catch (_e3) { cb(null); }
      });
    };
    img.onerror = function () { cb(null); };
    img.src = url;
  }
  // ── [v539] 마스크 보기 overlay — 현재 정밀 부위가 어디에 인식됐는지 반투명으로 표시 ──
  // [v548] 활성 기능별 마스크 + 스펙 색상(눈=파랑 / 눈썹=초록 / 손=주황 / 네일=핑크). QA 가 ROI 위치를 색으로 확인.
  function _maskInfoForTab() {
    var k = _activePrecKey() || '', tab = d.editTab || 'skin';
    if (k === 'browSharp') return { type: 'browMask', label: '눈썹', tint: [90, 200, 110] };       // 초록
    if (k === 'lashSharp' || k === 'eyeRedness' || k === 'catchLight' || k === 'irisClear')
      return { type: k === 'eyeRedness' ? 'scleraMask' : 'eyeMask', label: k === 'eyeRedness' ? '흰자' : '눈', tint: [70, 130, 240] };   // 파랑
    if (k === 'handSkin') return { type: 'handSkinMask', label: '손 피부', tint: [240, 160, 70] };   // 주황
    if (k === 'nailGloss' || k === 'nailShape') return { type: 'nailMask', label: '네일', tint: [240, 110, 175] };  // 핑크
    if (tab === 'hair') return { type: 'hairMask', label: '헤어', tint: [145, 90, 220] };  // 보라
    if (tab === 'eyes') return { type: 'eyeMask', label: '눈', tint: [70, 130, 240] };
    if (tab === 'nail') return { type: 'nailMask', label: '네일', tint: [240, 110, 175] };
    return { type: 'skinMask', label: '피부·얼굴', tint: [236, 120, 150] };   // skin/default
  }
  // [T-104 P0] _containBlit → flow/util.js
  function _paintMaskCanvas(vp, mask, mw, mh, info, badge) {
    var ov = vp.querySelector('[data-fl-maskov]');
    if (!ov) return;
    var helper = el && el.querySelector('[data-fs="edit"] [data-fl-maskhelper]');
    if (!mask || !mw || !mh) {
      // [v540] 못 찾음 경고를 사진 좌상단(가림)에서 → 정밀 조정 패널 inline helper(부드럽게)로 이동.
      ov.hidden = true;
      if (badge) badge.hidden = true;
      if (helper) { helper.hidden = false; helper.textContent = info.label + ' 영역을 인식하지 못했습니다'; }
      if (window.__ITDASY_PHOTO_DEBUG__) { try { console.log('[photofx] mask=' + info.type + ' detector-miss coverage=0%'); } catch (_e) { void _e; } }
      return;
    }
    if (helper) helper.hidden = true;
    // mask(0..1) → tinted ImageData(mw×mh)
    var tmp = document.createElement('canvas'); tmp.width = mw; tmp.height = mh;
    var tctx = tmp.getContext('2d'); var idata = tctx.createImageData(mw, mh); var dd = idata.data;
    var R = info.tint[0], G = info.tint[1], B = info.tint[2], hit = 0, tot = mw * mh;
    for (var i = 0; i < tot; i++) {
      var m = mask[i] || 0; if (m > 0.3) hit++;
      var a = m > 0.04 ? Math.min(0.55, m * 0.6) : 0;
      var j = i * 4; dd[j] = R; dd[j + 1] = G; dd[j + 2] = B; dd[j + 3] = (a * 255) | 0;
    }
    tctx.putImageData(idata, 0, 0);
    var vw = vp.clientWidth || 1, vh = vp.clientHeight || 1;
    ov.width = vw; ov.height = vh; ov.hidden = false;
    var octx = ov.getContext('2d'); octx.clearRect(0, 0, vw, vh);
    _containBlit(octx, tmp, vw, vh);
    var cov = Math.round(hit / tot * 1000) / 10;
    d._maskCovPct = cov; d._maskCovKey = _activePrecKey();   // [v542] 디버그 패널 coverage 표시용
    if (badge) { badge.hidden = false; badge.textContent = info.label + ' 인식됨 · ' + cov + '%'; }
    if (window.__ITDASY_PHOTO_DEBUG__) { try { console.log('[photofx] mask=' + info.type + ' coverage=' + cov + '% dims=' + mw + 'x' + mh); } catch (_e) { void _e; } }
  }
  function _renderMaskOverlay() {
    if (d.maskPaint) { _renderPaintOverlay(); return; }   // [v561] 칠하기 모드면 칠한 영역을 표시
    var vp = el && el.querySelector('[data-fs="edit"] [data-fl-edvp]'); if (!vp) return;
    var ov = vp.querySelector('[data-fl-maskov]'), badge = el.querySelector('[data-fs="edit"] [data-fl-maskbadge]');
    var helper0 = el.querySelector('[data-fs="edit"] [data-fl-maskhelper]');
    if (!d.maskView || d.originalPreview) { if (ov) ov.hidden = true; if (badge) badge.hidden = true; if (helper0) helper0.hidden = true; return; }
    var photo = curEditPhoto(); if (!photo) return;
    var MA = window.MaskApplication;
    var info = _maskInfoForTab();
    if (badge) { badge.hidden = false; badge.textContent = info.label + ' 인식 중…'; }
    if (!MA || typeof MA.getDetectorMask !== 'function') { if (badge) badge.textContent = '마스크 모듈을 불러오지 못했어요'; return; }
    var token = (d._maskTok = (d._maskTok || 0) + 1);
    var url = photo.editedDataUrl || photo.dataUrl;
    var img = new Image();
    img.onload = function () {
      if (token !== d._maskTok || !d.maskView) return;
      Promise.resolve(MA.getDetectorMask(img, info.type)).then(function (rr) {
        if (token !== d._maskTok || !d.maskView) return;
        var mask = null, mw = 0, mh = 0;
        if (rr && rr.mask) { mask = rr.mask; mw = img.naturalWidth || img.width; mh = img.naturalHeight || img.height; }
        _paintMaskCanvas(vp, mask, mw, mh, info, badge);
      }).catch(function () { _paintMaskCanvas(vp, null, 0, 0, info, badge); });
    };
    img.onerror = function () { if (badge) badge.textContent = '사진을 불러오지 못했어요'; };
    img.src = url;
  }

  // ── [v561] 직접 칠하기(수동 마스크) — 자동 검출이 틀리거나 못 잡을 때 원장님이 영역을 직접 칠해 교정 ──
  //   칠한 영역은 사진 해상도 캔버스(흰색=마스크값)로 누적 → applyWorkspaceCorrections 에 manualMasks 로 전달 →
  //   adapter 가 useMasks[type] 를 덮어써 그 부위에만 보정 적용. 검출 실패(네일 클로즈업 등)도 칠하면 먹힌다.
  function _maskPaintControlsHtml() {
    var info = _maskInfoForTab();
    var br = d.maskBrush || 26;
    return '<div class="ed-paintctl" data-fl-paintctl>' +
        '<div class="ed-paintctl__lbl"><b>' + esc(info.label) + '</b> 영역을 칠하면 그 부위에만 보정돼요</div>' +
        '<div class="ed-paintctl__row">' +
          '<button type="button" class="ed-paintb' + (!d.maskErase ? ' on' : '') + '" data-fl="paintdraw"><i class="ph-duotone ph-pen"></i>칠하기</button>' +
          '<button type="button" class="ed-paintb' + (d.maskErase ? ' on' : '') + '" data-fl="painterase"><i class="ph-duotone ph-eraser"></i>지우개</button>' +
          '<button type="button" class="ed-paintb" data-fl="paintclear"><i class="ph-duotone ph-trash"></i>비우기</button>' +
        '</div>' +
        '<label class="ed-paintbrush">붓 <input type="range" min="10" max="64" step="2" value="' + br + '" data-fl-brush aria-label="붓 크기"></label>' +
      '</div>';
  }
  function _maskTypeForPaint() { return _maskInfoForTab().type; }
  function _photoUid(p) { return p && (p._uid || (p._uid = 'm' + Math.random().toString(36).slice(2, 9))); }
  // 진입 시 현재 편집 사진의 자연 해상도 확보 — paint 캔버스 종횡비를 사진과 일치시켜 좌표 매핑 정합 유지.
  function _ensurePaintDims(cb) {
    var photo = curEditPhoto(); if (!photo) { if (cb) cb(); return; }
    if (photo._natW && photo._natH) { if (cb) cb(); return; }
    var im = new Image();
    im.onload = function () { photo._natW = im.naturalWidth || im.width || 1024; photo._natH = im.naturalHeight || im.height || 1024; if (cb) cb(); };
    im.onerror = function () { photo._natW = 1024; photo._natH = 1024; if (cb) cb(); };
    im.src = photo.dataUrl || photoUrl(photo);
  }
  function _getPaintCanvas(photo, type, create) {
    if (!photo || !type) return null;
    var uid = _photoUid(photo);
    if (!d._paintCv) d._paintCv = {};
    if (!d._paintCv[uid]) d._paintCv[uid] = {};
    var cv = d._paintCv[uid][type];
    if (!cv && create) {
      var iw = photo._natW || 1024, ih = photo._natH || 1024;
      cv = document.createElement('canvas'); cv.width = iw; cv.height = ih; cv._inked = false;
      d._paintCv[uid][type] = cv;
    }
    return cv || null;
  }
  // 현재 편집 사진에서 칠해진(잉크 있는) 모든 부위 캔버스를 { maskType: canvas } 로 반환 — 보정 적용 시 주입.
  function _manualMasksForCurrent() {
    var photo = curEditPhoto(); if (!photo || !photo._uid || !d._paintCv) return null;
    var store = d._paintCv[photo._uid]; if (!store) return null;
    var out = null;
    Object.keys(store).forEach(function (type) {
      var cv = store[type];
      if (cv && cv._inked) { out = out || {}; out[type] = cv; }
    });
    return out;
  }
  // paint 캔버스(흰 알파)를 탭 색으로 tint 해 overlay 에 contain-blit — 칠하는 동안 실시간 피드백.
  function _renderPaintOverlay() {
    var vp = el && el.querySelector('[data-fs="edit"] [data-fl-edvp]'); if (!vp) return;
    var ov = vp.querySelector('[data-fl-maskov]'), badge = el.querySelector('[data-fs="edit"] [data-fl-maskbadge]');
    var helper0 = el.querySelector('[data-fs="edit"] [data-fl-maskhelper]'); if (!ov) return;
    if (d.originalPreview) { ov.hidden = true; if (badge) badge.hidden = true; return; }
    var info = _maskInfoForTab(), photo = curEditPhoto();
    var cv = _getPaintCanvas(photo, info.type, false);
    var vw = vp.clientWidth || 1, vh = vp.clientHeight || 1;
    ov.width = vw; ov.height = vh; ov.hidden = false;
    var octx = ov.getContext('2d'); octx.clearRect(0, 0, vw, vh);
    if (cv && cv.width && cv.height) {
      var tmp = document.createElement('canvas'); tmp.width = cv.width; tmp.height = cv.height;
      var tctx = tmp.getContext('2d'); tctx.drawImage(cv, 0, 0);
      tctx.globalCompositeOperation = 'source-in';
      tctx.fillStyle = 'rgba(' + info.tint[0] + ',' + info.tint[1] + ',' + info.tint[2] + ',0.5)';
      tctx.fillRect(0, 0, cv.width, cv.height);
      _containBlit(octx, tmp, vw, vh);
    }
    if (helper0) helper0.hidden = true;
    if (badge) { badge.hidden = false; badge.textContent = info.label + ' 직접 칠하는 중'; }
  }
  // [v561·항목4] 다중 결과물 큰 이미지 좌우 스와이프 → pair 전환(48px 임계, 수평 우세 시).
  function _bindTplResultSwipe() {
    if (!el || el._tplSwBound) return; el._tplSwBound = true;
    var s = null;
    el.addEventListener('touchstart', function (e) {
      var img = e.target.closest && e.target.closest('[data-fl-tplresult]');
      if (!img || e.touches.length !== 1) { s = null; return; }
      s = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });
    el.addEventListener('touchend', function (e) {
      if (!s) return;
      var t = (e.changedTouches && e.changedTouches[0]) || null; if (!t) { s = null; return; }
      var dx = t.clientX - s.x, dy = t.clientY - s.y;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) _stepPair(dx < 0 ? 1 : -1);
      s = null;
    });
  }
  function _bindPaint() {
    if (!el || el._paintBound) return; el._paintBound = true;
    // [v565·scope2] 단일 포인터 그리기와 두 손가락 핀치/팬을 명확히 분리.
    //   pointers/pcount = 현재 화면에 닿은 포인터 수. gestureLock = 핀치가 시작된 후 그리기 봉인 플래그.
    var drawing = false, last = null, pointers = {}, pcount = 0, gestureLock = false, drawId = null, started = false;
    function vpEl() { return el.querySelector('[data-fs="edit"] [data-fl-edvp]'); }
    function geom(vp) {
      var cv = _getPaintCanvas(curEditPhoto(), _maskTypeForPaint(), true); if (!cv) return null;
      var iw = cv.width, ih = cv.height, vw = vp.clientWidth || 1, vh = vp.clientHeight || 1;
      var s = Math.min(vw / iw, vh / ih);
      return { cv: cv, s: s, dx: (vw - iw * s) / 2, dy: (vh - ih * s) / 2 };
    }
    // [v565] 확대(zoom transform) 상태에서도 정확히 칠하도록 — 화면좌표를 줌 역변환(translate+scale, origin=center) 후 캔버스로 매핑.
    function toImg(e, vp, gm) {
      var r = vp.getBoundingClientRect();
      var rx = e.clientX - r.left, ry = e.clientY - r.top;
      var z = d.zoom || { s: 1, tx: 0, ty: 0 };
      if (z.s && z.s !== 1) {
        var cx = (vp.clientWidth || r.width) / 2, cy = (vp.clientHeight || r.height) / 2;
        rx = (rx - cx - (z.tx || 0)) / z.s + cx;
        ry = (ry - cy - (z.ty || 0)) / z.s + cy;
      }
      return { x: (rx - gm.dx) / gm.s, y: (ry - gm.dy) / gm.s };
    }
    function stroke(gm, a, b) {
      var ctx = gm.cv.getContext('2d'), rad = Math.max(2, ((d.maskBrush || 26) / 2) / gm.s);
      ctx.globalCompositeOperation = d.maskErase ? 'destination-out' : 'source-over';
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = rad * 2;
      ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff';
      if (a) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(b.x, b.y, rad, 0, 6.2832); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      if (!d.maskErase) gm.cv._inked = true;
    }
    function stopDraw() { if (!drawing) return; drawing = false; last = null; drawId = null; started = false; if (_hasValues(d.beauty)) _refreshPreview(); }
    el.addEventListener('pointerdown', function (e) {
      if (cur !== 'edit' || !d.maskPaint) return;
      var vp = vpEl(); if (!vp || !vp.contains(e.target)) return;
      if (!pointers[e.pointerId]) { pointers[e.pointerId] = 1; pcount++; }
      // [v565] 두 번째 손가락 감지 → 진행 중 stroke 즉시 중단 + 핀치/줌/팬 모드로 잠금(그리기는 _bindZoom 이 아닌 paint 가 봉인).
      if (pcount >= 2) {
        if (drawing) stopDraw();   // 아직 첫 잉크 전(started=false)이면 잔점 없이 깨끗이 취소.
        gestureLock = true;
        try { if (vp.releasePointerCapture && drawId != null) vp.releasePointerCapture(drawId); } catch (_e0) { void _e0; }
        return;
      }
      if (gestureLock) return;   // [v565] gesture 가 끝나기(모든 손가락 떨어짐) 전엔 단일 포인터라도 그리기 금지.
      var gm = geom(vp); if (!gm) return;
      // [v565] 첫 잉크는 pointerdown 이 아니라 '첫 move(또는 단일 탭 시 pointerup)' 에서 — 핀치 시작 잔점 0.
      drawing = true; drawId = e.pointerId; started = false; last = toImg(e, vp, gm);
      try { if (vp.setPointerCapture) vp.setPointerCapture(e.pointerId); } catch (_e) { void _e; }
      e.preventDefault();
    });
    el.addEventListener('pointermove', function (e) {
      if (!drawing || !d.maskPaint || gestureLock || pcount >= 2 || e.pointerId !== drawId) return;
      var vp = vpEl(); if (!vp) return; var gm = geom(vp); if (!gm) return;
      var pt = toImg(e, vp, gm);
      if (!started) { stroke(gm, null, last); started = true; }   // 단일 포인터 확정 후 시작점부터 잉크.
      stroke(gm, last, pt); last = pt; _renderPaintOverlay(); e.preventDefault();
    });
    function up(e) {
      if (pointers[e.pointerId]) { delete pointers[e.pointerId]; pcount--; if (pcount < 0) pcount = 0; }
      if (e.pointerId === drawId) {
        // [v565] 움직임 없이 뗀 '단일 탭'(핀치 아님) 은 점 하나 — 핀치(gestureLock)면 잉크 0.
        if (drawing && !started && !gestureLock) {
          var vp = vpEl(), gm = vp && geom(vp);
          if (gm) { stroke(gm, null, last); _renderPaintOverlay(); }
        }
        stopDraw();
      }
      if (pcount === 0) gestureLock = false;   // [v565] 모든 손가락이 떨어지면 잠금 해제 → 다음 새 pointerdown 부터 다시 그림.
    }
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  // [v567·필수3] 뷰포트 크기 변경(브라우저 리사이즈/전체화면/방향전환) 시 마스크 overlay 재투영.
  //   마스크 stroke 는 사진 자연해상도(이미지좌표)로 저장되므로 데이터는 보존되지만, overlay 캔버스
  //   비트맵은 칠한 시점의 vp 크기로 고정돼 있어 리사이즈하면 CSS 가 늘여 위치가 틀어진다(절반→풀스크린 드리프트).
  //   여기서 새 vp 크기로 overlay 를 다시 그려(이미지좌표 → 현재 contain rect 재투영) 위치를 항상 정확히 유지.
  function _bindEditResize() {
    if (!el || el._edResizeBound) return; el._edResizeBound = true;
    var _rt = null;
    function reproject() {
      _rt = null;
      if (cur !== 'edit') return;
      if (d.maskPaint || d.maskView) _renderMaskOverlay();   // maskPaint 면 내부에서 _renderPaintOverlay 로 분기
    }
    function onResize() {
      if (cur !== 'edit') return;
      if (_rt) clearTimeout(_rt);
      _rt = setTimeout(reproject, 120);
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    if (window.visualViewport && window.visualViewport.addEventListener) {
      window.visualViewport.addEventListener('resize', onResize);
    }
    document.addEventListener('fullscreenchange', onResize);
  }

  function _roleSummary() {
    var r = {};
    (d.photos || []).forEach(function (p) { r[p.role || 'hero'] = (r[p.role || 'hero'] || 0) + 1; });
    return Object.keys(r).map(function (k) { return ({ before: '전', after: '후', hero: '홍보컷', exclude: '제외' }[k] || k) + ' ' + r[k]; }).join(' · ') || '없음';
  }

  // [캡션재설계] 옛 3축(scenario-selector) 느낌을 살린 위저드 — 위 버튼 누르면 다음 질문, 아래 시술입력은 고정.
  //   picks 는 기존 생성 배관(d.captionAxes → photo_context)에 그대로 흘러감(백엔드 변경 0).
  var _WIZ_STEPS = [
    { key: 'situation', q: '무슨 게시물인가요?', opts: [['시술 완성', 'ph-check-circle'], ['후기·감사', 'ph-heart'], ['직접', 'ph-pencil-simple']] },
    { key: 'customer',  q: '손님은 어떤 분이에요?', opts: [['신규', 'ph-user-plus'], ['단골', 'ph-user-circle'], ['직접', 'ph-pencil-simple']] },
    { key: 'photo',     q: '사진 종류는요?', opts: [['완성샷', 'ph-image'], ['전후 비교', 'ph-columns'], ['직접', 'ph-pencil-simple']] }
  ];
  function _capWizHtml() {
    var step = d.capWizStep || 0, ax = d.captionAxes || {};
    var s = _WIZ_STEPS[step];   // step>=3(완료)이면 undefined
    var dots = '';
    for (var i = 0; i < 3; i++) { dots += '<span class="capwiz__dot' + (ax[_WIZ_STEPS[i].key] ? ' done' : (i === step ? ' on' : '')) + '"></span>'; }
    // [#15] 질문을 헤더 줄에 인라인 배치 → 점 3개와 같은 수평선.
    var qInline = s ? '<span class="capwiz__q capwiz__q--inline">' + esc(s.q) + '</span>' : '';
    var head = '<div class="capwiz__head">' +
      (step > 0 ? '<button type="button" class="capwiz__back" data-fl-wizback aria-label="이전"><i class="ph-bold ph-caret-left"></i></button>' : '<span class="capwiz__backsp"></span>') +
      qInline +
      '<span class="capwiz__dots">' + dots + '</span></div>';
    var _dir = (d._wizDir === 'back' ? ' capwiz__body--back' : '');   // [애니메이션] 이전=왼쪽에서, 다음=오른쪽에서 슬라이드
    if (step >= 3) {
      var chips = _WIZ_STEPS.map(function (s) { return '<span class="capwiz__pick">' + esc(ax[s.key] || '-') + '</span>'; }).join('');
      return '<div class="capwiz capwiz--done">' + head +
        '<div class="capwiz__body' + _dir + '"><div class="capwiz__done"><i class="ph-fill ph-check-circle capwiz__donechk"></i><span class="capwiz__donet">다 골랐어요</span>' + chips +
        '<button type="button" class="capwiz__redo" data-fl-wizredo>다시</button></div></div></div>';
    }
    var bodyInner;
    if (d._wizCustom === s.key) {
      // [직접 입력] 팝업 대신 인라인 — '직접' 누르면 여기서 바로 타이핑(Enter/확인 → 다음). [#15] q는 헤더로 이동.
      bodyInner =
        '<div class="capwiz__custom">' +
          '<input type="text" class="capwiz__custin" data-fl-wizcustin maxlength="40" placeholder="직접 적어주세요" value="' + esc(ax[s.key] && s.opts.every(function (o) { return o[0] !== ax[s.key]; }) ? ax[s.key] : '') + '">' +
          '<button type="button" class="capwiz__custok" data-fl-wizcustok aria-label="확인"><i class="ph-bold ph-check"></i></button>' +
        '</div>' +
        '<button type="button" class="capwiz__custcancel" data-fl-wizcustcancel>← 버튼으로</button>';
    } else {
      var btns = s.opts.map(function (o) {
        var on = ax[s.key] === o[0];
        return '<button type="button" class="capwiz__opt' + (on ? ' on' : '') + '" data-fl-wizpick="' + s.key + '::' + esc(o[0]) + '">' +
          '<i class="ph-duotone ' + o[1] + '"></i><span>' + esc(o[0]) + '</span></button>';
      }).join('');
      bodyInner = '<div class="capwiz__opts">' + btns + '</div>';   // [#15] q는 헤더로 이동
    }
    return '<div class="capwiz">' + head + '<div class="capwiz__body' + _dir + '">' + bodyInner + '</div></div>';
  }
  // 자주 쓰는 시술 태그(업종별 기본 + 커스텀) — 탭하면 시술 입력칸에 추가. getShopKeywords()는 caption-keyword-tags.js.
  // [요청3 2026-07-13] 재선택 목록을 시술 사전(service-vocab) 전 업종으로 확장 — 반영구/메이크업/태닝/두피/에스테틱
  //   샵으로 가입한 원장님도 자기 업종이 목록에 뜨고 라벨이 '업종 고르기'로 안 떨어지게. (네일아트는 '네일'로 통합)
  var _SVC_TYPES = ['미용실', '헤어', '네일', '붙임머리', '속눈썹', '왁싱', '피부', '반영구', '메이크업', '태닝', '두피', '에스테틱'];
  function _svcTagsHtml() {
    var kws = [];
    try { if (typeof getShopKeywords === 'function') kws = getShopKeywords() || []; } catch (_e) { void _e; }
    var stype = ''; try { stype = localStorage.getItem('shop_type') || ''; } catch (_e2) { void _e2; }
    // [#2] 업종이 키워드로 해석되면(가입값 hair/헤어샵/네일 등 정규화 성공) 태그 노출. 'beauty'·general 처럼 안 풀리면 업종 고르게.
    var _norm = ''; try { if (window.itdasyNormalizeShopType) _norm = window.itdasyNormalizeShopType(stype).label || ''; } catch (_en) { void _en; }
    var valid = kws.length > 0 || _SVC_TYPES.indexOf(stype) >= 0;
    var _typeLabel = (_SVC_TYPES.indexOf(stype) >= 0) ? stype : (valid ? (_norm || stype) : '업종 고르기');   // 고른 업종칩은 그대로 표시(정규화 '기타'로 안 바뀌게)
    var chips = valid ? kws.slice(0, 8).map(function (k) { return '<button type="button" class="cap-svctag" data-fl-svctag="' + esc(k) + '">' + esc(k) + '</button>'; }).join('') : '';
    var typeOpen = !!d.svcTypeOpen || !valid;
    var typeChips = typeOpen ? ('<div class="cap-svctype">' + _SVC_TYPES.map(function (tp) {
      return '<button type="button" class="cap-svctype__c' + (tp === stype ? ' on' : '') + '" data-fl-svctype="' + esc(tp) + '">' + esc(tp) + '</button>';
    }).join('') + '</div>') : '';
    return '<div class="cap-svctags__hint">우리샵 · ' +
        '<button type="button" class="cap-svctype__btn" data-fl-svctypetoggle>' + esc(_typeLabel) + ' <i class="ph-bold ph-caret-down"></i></button>' +
        (valid && !typeOpen ? '<span class="cap-svctags__chg">탭해서 업종 바꾸기</span>' : '') + '</div>' +
      typeChips +
      (valid ? ('<div class="cap-svctags">' + chips +
        '<button type="button" class="cap-svctag cap-svctag--add" data-fl-svctagadd><i class="ph-bold ph-plus"></i> 추가</button></div>') : '');
  }
  function _appendServiceTag(kw) {
    syncServiceFromDom();
    var curTx = String(d.service || '').trim();
    if (curTx.split(/\s+/).indexOf(kw) >= 0) return;   // 중복 방지
    d.service = (curTx ? curTx + ' ' : '') + kw;
    // [fix] 칩 누를 때 setScreen 전체 재렌더는 화면을 맨 위로 튕김 → 입력창만 제자리 갱신(스크롤 유지).
    var inp = el.querySelector('[data-fl-service]');
    if (inp) { inp.value = d.service; try { inp.dispatchEvent(new Event('input', { bubbles: true })); } catch (_e) { void _e; } }
    else setScreen('caption');
  }
  function _addSvcKeyword() {
    var kw = window.prompt('자주 쓰는 시술 추가'); if (kw == null) return; kw = String(kw).trim(); if (!kw) return;
    try { var arr = JSON.parse(localStorage.getItem('itdasy_custom_keywords') || '[]'); if (arr.indexOf(kw) < 0) { arr.push(kw); localStorage.setItem('itdasy_custom_keywords', JSON.stringify(arr)); } } catch (_e) { void _e; }
    _appendServiceTag(kw);
  }
  // [P4 2026-07-10] 최근 시술 자동완성 — 생성한 시술 문구를 기억했다가 탭 한 번으로 다시 채운다(매번 재입력 제거).
  function _recentServices() { try { var a = JSON.parse(localStorage.getItem('itdasy:recent_services') || '[]'); return Array.isArray(a) ? a : []; } catch (_e) { return []; } }
  function _saveRecentService(svc) {
    svc = String(svc || '').replace(/\s+/g, ' ').trim(); if (svc.length < 2) return;
    try {
      var a = _recentServices().filter(function (x) { return x !== svc; });
      a.unshift(svc); a = a.slice(0, 6);
      localStorage.setItem('itdasy:recent_services', JSON.stringify(a));
    } catch (_e) { void _e; }
  }
  function _recentSvcHtml() {
    var a = _recentServices(); if (!a.length) return '';
    // 기존 cap-svctags/cap-svctag 스타일 재사용(새 CSS 불필요). 최근 시술 전체를 탭 한 번으로 다시 채움.
    return '<div class="cap-svctags" style="margin-bottom:8px">' +
      '<span class="cap-svctags__hint" style="width:100%;margin:0 0 4px">최근 시술 · 탭해서 불러오기</span>' +
      a.map(function (s) { var lbl = s.length > 20 ? (s.slice(0, 20) + '…') : s;
        return '<button type="button" class="cap-svctag" data-fl-svcrecent="' + esc(s) + '" title="' + esc(s) + '">' + esc(lbl) + '</button>'; }).join('') + '</div>';
  }

  // [다양성 팩 2026-07-12] 게시물별 '말투·성격' 칩 — 친근/전문/감성/이벤트/후기. 원장이 게시물마다 톤을 고른다
  //   (기존엔 SIMPLE_FLOW 에서 톤 선택이 사라져 페르소나 1개로 수렴). 클릭은 기존 data-fl-ctone 위임 핸들러가 d.capTone 세팅.
  var _TONE_CHIPS = [
    ['friendly', '친근', 'ph-hand-heart'],
    ['professional', '전문', 'ph-seal-check'],
    ['emotional', '감성', 'ph-sparkle'],
    ['event', '이벤트', 'ph-megaphone-simple'],
    ['review', '후기', 'ph-chat-circle-text']
  ];
  function _toneHint(t) {
    return { friendly: '단골에게 말하듯 다정하고 부담 없이.', professional: '시술 포인트를 또렷하게, 신뢰감 있게.',
      emotional: '분위기·무드를 살리는 잔잔한 감성 톤.', event: '혜택·예약을 강조하는 이벤트 홍보 톤.',
      review: '고객이 남긴 듯한 1인칭 만족 후기체.' }[t] || '';
  }
  function _toneChipsHtml() {
    var set = _TONE_CHIPS.map(function (o) { return o[0]; });
    var cur = set.indexOf(d.capTone) >= 0 ? d.capTone : 'friendly';
    return '<label class="cap-field-label" style="margin-top:14px">말투 · 게시물 성격</label>' +
      '<div class="cap-chips cap-tonechips">' + _TONE_CHIPS.map(function (o) {
        var on = cur === o[0];
        return '<button type="button" class="cap-chip cap-tonechip' + (on ? ' on' : '') + '" data-fl-ctone="' + o[0] + '" aria-pressed="' + on + '"><i class="ph-duotone ' + o[2] + '"></i>' + o[1] + '</button>';
      }).join('') + '</div>' +
      '<p class="cap-field-hint" data-fl-tonehint>' + _toneHint(cur) + '</p>';
  }
  // 말투 칩 → 백엔드 안전 매핑. mood(친근/전문/감성)는 검증된 tone_override 값 그대로, 이벤트/후기는
  //   안전 enum(ornate/plain) + extra_notes 로 성격 주입(caption_intent enum·tone_override enum 위반 0).
  function _resolveTone(t) {
    switch (t) {
      case 'professional': return { tone: 'professional' };
      case 'emotional': return { tone: 'emotional' };
      case 'premium': return { tone: 'premium' };
      case 'mz': return { tone: 'mz' };
      case 'natural': return { tone: 'natural' };
      case 'event': return { tone: 'ornate', note: '이벤트·프로모션 홍보 톤으로 작성하고, 마지막에 예약을 유도하는 활기찬 마무리 한 줄을 넣어주세요.' };
      case 'review': return { tone: 'plain', note: '고객이 직접 남긴 후기 말투로, 1인칭 고객 시점의 만족스러운 후기체로 작성해주세요.' };
      case 'friendly': default: return { tone: 'friendly' };
    }
  }
  // [FC4] 게시글 화면 — 3x3 시나리오칩(scenario-selector 재사용) + 고정멘트 꼬리
  // [통합 2026-07-13·요청6] 피드 미리보기 async 페치가 캡션 화면을 재렌더할 때, 카드 안 캡션/해시태그를
  //   편집 중이면 재렌더를 건너뛴다(커서·포커스 유실 방지). 편집 중 아니면 그리드만 갱신.
  function _isEditingCaptionCard() {
    try {
      var a = document.activeElement;
      return !!(a && a.isContentEditable && el && el.contains(a) && (a.hasAttribute('data-fl-igcap') || a.hasAttribute('data-fl-ighash')));
    } catch (_e) { return false; }
  }
  function renderCaption() {
    var url = outputUrl();
    if (d.capLoading) {
      // [Skeleton] 스피너 대신 캡션 카드 형태 스켈레톤 — 결과가 어떻게 올지 미리 보이게(Astryx 로딩 패턴).
      return '<div class="cap-skelwrap">' +
        '<div class="cap-skel-note"><span class="cap-skel-dot"></span>AI가 ' + (_personaOn() ? '우리샵 말투로 ' : '') + '쓰는 중…</div>' +
        '<div class="cap-skel-card">' +
          '<div class="cap-skel-line" style="width:92%"></div>' +
          '<div class="cap-skel-line" style="width:100%"></div>' +
          '<div class="cap-skel-line" style="width:78%"></div>' +
          '<div class="cap-skel-line cap-skel-line--gap" style="width:60%"></div>' +
          '<div class="cap-skel-tags"><span></span><span></span><span></span><span></span></div>' +
        '</div></div>';
    }
	    if (!d.caption) {
	      // [v558] 캡션 UX 리뉴얼 — 시나리오 버튼 제거. 사진 → 시술 문구 입력 → 말투 6칩 → 길이 → 해시태그 토글 → 단일 생성 버튼.
	      // [ws-hyper] 레이아웃 합성본은 폭 꽉 차는 img로(레터박스 빈 여백 제거).
	      var photoThumb = d.templateOutput   /* [버그수정 2026-07-06] 재오픈 초안도 합성본 썸네일 */
	        ? '<div class="wsl-cap-preview"><img src="' + esc(d.templateOutput) + '" alt="미리보기"></div>'
	        : (_capCarouselHtml() || ((!d.textOnly && url) ?
	        '<div class="cap-photo cap-photo--sm" style="background-image:url(' + esc(url) + ')"></div>' : ''));
	      // [Phase A-2] 심플 캡션 — 말투/길이/해시태그 칩 제거. 시술 내용 입력 + 우리샵 스타일 적용 + 캡션 생성.
	      //   레거시(말투 6카드·길이·페르소나·해시태그 토글)는 SIMPLE_FLOW=false 에서 그대로 복원.
	      if (SIMPLE_FLOW) {
	        var _svc = d.service || '';
        // 우리샵 스타일 시드만 보장 — 스타일 카드·레이아웃 미리보기·디자인 패널은 편집기로 이동.
        //   레거시 함수(_presetThumb/_applyPreset/_applyHarmony/_autoPretty/_setShopType 등)는 삭제 안 함(보존).
        if (window.ShopStyle && window.ShopStyle.ensureSeed) { try { window.ShopStyle.ensureSeed(); } catch (_e0) { void _e0; } }   // [v591·#6] 사진 추천색(async)
	        return photoThumb +
	          '<div class="cap-wizscreen">' +
          '<div class="screen-head"><h2>게시글 만들기</h2><p class="screen-head__sub">상황만 고르고 시술을 적으면 우리샵 말투로 알아서 써드려요.</p></div>' +
          _capWizHtml() +
          _svcTagsHtml() +   // [ws-hyper] 시술 선택 칩을 입력창 '위'로
          _recentSvcHtml() +   // [P4] 최근 시술 — 탭하면 그대로 다시 채움
          '<label class="cap-field-label">시술만 적으면 끝</label>' +
          '<div class="cap-composer">' +
            '<textarea class="service-input cap-svc-area" data-fl-service rows="3" maxlength="500" placeholder="예) 레이어드컷 손상모 일본인">' + esc(_svc) + '</textarea>' +
            '<div class="cap-composer__bar">' +
              '<span class="cap-composer__cnt"><span data-fl-svccount>' + _svc.length + '</span>/500</span>' +
              '<button type="button" class="cap-composer__send" data-fl-cgen aria-label="캡션 생성"><i class="ph-duotone ph-arrow-up"></i></button>' +
            '</div>' +
          '</div>' +
          // [보스 2026-07-12] 말투·성격 칩 제거 — 화면 간소화(생성은 기본 톤). _toneChipsHtml/_resolveTone 은 보존. (HYPER 상시 → 하단 svctags 분기 제거)
          _shopInfoToggleHtml() +   // [#19] 저장된 예약/전화 반영 여부(기본 OFF)
          _capConfirmHtml() +
          '</div>';
	      }

	    }
    // 결과 화면 — [v583·C] 인스타 미리보기 디자인 카드 + 아래 편집 + 인스타 업로드(별도 미리보기 단계 폐지).
    // [통합 2026-07-13·요청6] 캡션 결과 + 인스타 미리보기 = 한 화면. 아래로 스크롤하면 발행 버튼 + 피드 미리보기.
    var custLine = d.customerName ?
      '<div class="confirmline">연결 손님: <b>' + esc(d.customerName) + '</b>' + (d.customerVc ? ' · ' + d.customerVc + '회 방문' : ' · 첫 방문') + '</div>' : '';
    return '' +
	      // [버그5 2026-07-14] 미연동이면 '학습 완료'라고 거짓말하지 않고, 연동하면 된다고 안내.
	      (_personaOn() ? '<div class="cap-byline">원장님 인스타 글 학습 완료</div>'
	                    : '<div class="cap-byline">인스타를 연동하면 원장님 말투로 써드려요</div>') +
	      '<label class="cap-field-label">게시글 <span>미리보기에서 바로 고쳐 쓸 수 있어요 · 시술을 바꾸려면 아래 처음부터 다시 쓰기</span></label>' +
	      _igPreviewCard(url, true) +   // [v584] 카드 안 캡션 직접 편집(별도 편집칸 제거)
      // [v589] 꼬리말 블록 폐지 → 설정폼으로 이동. 복사/다시생성/저장은 카드 액션줄로 이동.
      // [v587] 별도 해시태그 편집칸 폐지 — 위 미리보기 카드의 해시태그(.ig-hash-edit)를 직접 편집.
      // [Phase B-1] 스토리 편집 진입 — 사진 위에 우리샵 스타일 텍스트를 올려 편집.
      ((!d.textOnly && url) ? '<button type="button" class="cap-edit-btn" data-fl="storyedit"><i class="ph-duotone ph-magic-wand"></i> 사진 편집</button>' : '') +
      // [통합 2026-07-13·요청6] 발행 + 피드 미리보기를 같은 화면 하단에 흡수(구 preview 스텝). 스크롤로 캡션↔게시 한 흐름.
      '<div class="cap-byline cap-byline--pub">이렇게 올라가요</div>' + custLine +
      _publishBlock() +
      _feedPreview(url) +
		      '<button type="button" class="cap-restart" data-fl-var="reset">처음부터 다시 쓰기</button>';
	  }

  function _mountCaption() {
    _mountCarousel();   // [v531] 결과 캐러셀 스와이프 바인딩(결과 화면엔 scenario 없어 아래 early-return 전에 먼저)
    // [v558] 시나리오 선택기 제거 — 입력화면은 시술 문구 입력 + 말투/길이/해시태그 칩 + 단일 생성 버튼.
    // [v531] 키워드 입력 후 Enter → 바로 생성(편의). 주 경로는 '게시글 만들기' 버튼(data-fl-cgen).
    var svcInput = el.querySelector('[data-fl-service]');
    if (svcInput && !svcInput._wsGenBound) {
      svcInput._wsGenBound = true;
      // [Phase A-2] 멀티라인 textarea(심플 캡션)에선 Enter=줄바꿈 → 생성은 '캡션 생성' 버튼으로만.
      //   기존 한 줄 input(레거시)에서만 Enter→즉시 생성 유지.
      if (svcInput.tagName === 'INPUT') {
        svcInput.addEventListener('keydown', function (e) {
          // [v532] 한글 IME 조합 중 Enter(조합 확정용)는 무시 — 이때 생성하면 마지막 음절이 빠진 채 들어가
          //   '엔터 경로만 키워드 반영이 덜 되는' 증상이 났음. 조합이 끝난 뒤 Enter 에서만 생성.
          if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
          e.preventDefault();
          _triggerCaptionGenerate(null);
        });
      }
      // [Phase A-2] textarea 글자수 카운터(0/500) 라이브 갱신.
      var _cnt = el.querySelector('[data-fl-svccount]');
      if (_cnt) svcInput.addEventListener('input', function () { _cnt.textContent = String(svcInput.value.length); });
    }
    // [직접 입력] 위저드 인라인 입력 — Enter=확인 + 자동 포커스(팝업 없이 바로 타이핑).
    var wcin = el.querySelector('[data-fl-wizcustin]');
    if (wcin && !wcin._wsBound) {
      wcin._wsBound = true;
      wcin.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
        e.preventDefault(); _wizCustomConfirm();
      });
      try { wcin.focus(); var _vl = wcin.value.length; wcin.setSelectionRange(_vl, _vl); } catch (_e) { void _e; }
    }
    // [#12] PC에서 게시글/해시태그를 클릭하면 곧바로 편집되도록 클릭→포커스 보장(상위 클릭 위임에 먹히던 회귀 방지).
    function _ensureEditFocus(node) {
      if (!node || node._wsClickFocus) return; node._wsClickFocus = true;
      node.addEventListener('pointerdown', function (e) { e.stopPropagation(); }, true);
      node.addEventListener('click', function (e) { e.stopPropagation(); if (document.activeElement !== node) { try { node.focus(); } catch (_) { void _; } } });
    }
    // [v584·C] 결과 화면 — 카드 안 캡션(contenteditable)을 고치면 d.caption 즉시 동기화(아래 별도 편집칸 폐지).
    var igCap = el.querySelector('[data-fl-igcap]');
    if (igCap && igCap.isContentEditable && !igCap._wsLiveBound) {
      igCap._wsLiveBound = true;
      igCap.addEventListener('input', function () { d.caption = igCap.textContent; });
      _ensureEditFocus(igCap);
    }
    // [v587] 카드 안 해시태그(contenteditable)를 고치면 d.hashtags/selectedHashes 즉시 동기화(별도 편집칸 폐지).
    var igHash = el.querySelector('[data-fl-ighash]');
    if (igHash && igHash.isContentEditable && !igHash._wsLiveBound) {
      igHash._wsLiveBound = true;
      igHash.addEventListener('input', function () {
        var hs = _parseHashes(igHash.textContent); d.hashtags = hs; d.selectedHashes = hs.slice();
      });
      _ensureEditFocus(igHash);
    }
    // [v589·#3] 결과 화면이면 각 사진에 우리샵 스타일 적용 미리보기 합성(원본은 보존, 결과 표시 전용).
    if (String(d.caption || '').trim()) _autoComposeTemplate();
    // [v591·#6] 입력 화면 + 스타일 ON + 사진 있으면 — 사진에서 추천 색 추출해 팔레트 채움(클라이언트, 무료).
    var pal = el.querySelector('[data-fl-palette]');
    if (pal && !String(d.caption || '').trim() && d.useShopStyle !== false && !d.textOnly) {
      // [#9] 사진에서 뽑은 색은 평균값이라 탁하게 나와 혼란 → 편집기(ItdEditor)와 '같은' 큐레이션 팔레트로 통일.
      var cols = ['#FFFFFF', '#15181D', '#BC6675', '#E08A6E', '#E6B45A', '#86B06E', '#6E9BC4', '#A98AC4'];
      pal.innerHTML = '<span class="cap-palette__label">글자색 · 탭하면 우리샵 글자색에 적용</span>' +
        '<div class="cap-palette__row">' + cols.map(function (h) { return '<button type="button" class="cap-pal" data-fl-brandcolor="' + esc(h) + '" style="background:' + esc(h) + '" aria-label="' + esc(h) + '"></button>'; }).join('') + '</div>';
      pal.hidden = false;
    }
  }
  // [v532] 캡션 생성 단일 진입점 — Enter/상황버튼 어느 경로든 동일하게:
  //   ① DOM 에서 키워드 최신값 동기화 ② 상황축 반영(없으면 기본 '시술 완성') ③ doGenerate.
  //   두 경로가 같은 함수를 타도록 통합해 입력 반영 차이를 제거한다.
  function _triggerCaptionGenerate(axes) {
    syncServiceFromDom();
    if (axes) d.captionAxes = axes;
    if (!String(d.service || '').trim()) { toast('시술내역/키워드를 입력하면 바로 만들어드려요'); return; }
    // [위저드 선택형] 위에서 아무것도 안 골랐으면 강제 기본값 안 넣고 '아래 시술 입력한 대로만' 생성.
    if (!d.captionAxes) d.captionAxes = {};
    doGenerate({}, null);
  }
  // [직접 입력] 인라인 입력 확정 — 값 반영 후 다음 단계. 빈값이면 유지.
  function _wizCustomConfirm() {
    var key = d._wizCustom; if (!key) return;
    var inp = el.querySelector('[data-fl-wizcustin]');
    var val = inp ? String(inp.value || '').trim() : '';
    if (!val) { toast('직접 적을 내용을 입력해 주세요'); if (inp) try { inp.focus(); } catch (_e) { void _e; } return; }
    d.captionAxes = d.captionAxes || {}; d.captionAxes[key] = val;
    d._wizCustom = null;
    d.capWizStep = Math.min(3, (d.capWizStep || 0) + 1);
    d._wizDir = 'fwd'; setScreen('caption');
  }

	  // [v564·필수6] 인스타 미리보기 사진 carousel — 게시글/캡션 화면과 동일한 _displayItems 사용.
	  //   템플릿 적용 pair = 결과 1장, 미적용 = 원본 개별. 좌우 스와이프 + index 도트.
	  function _igCarouselHtml(fallbackUrl) {
	    var items = _displayItems();
	    if (items.length <= 1) {
	      var u = items.length ? items[0].url : fallbackUrl;
	      return '<div class="ig-photo" style="background-image:url(' + esc(u) + ')"></div>';
	    }
	    var active = (d.activeDisplayId && items.some(function (it) { return it.id === d.activeDisplayId; })) ? d.activeDisplayId : items[0].id;
	    var slides = items.map(function (it) {
	      var toggleAttr = it.kind === 'output' && it.expandable ? ' data-fl-tplexpand="' + esc(it.id) + '"'
	        : (it.ofPair ? ' data-fl-tplcollapse="' + esc(it.ofPair) + '"' : '');
	      return '<div class="ig-car__slide" data-fl-carslide="' + esc(it.id) + '"' + toggleAttr + '>' +
	        '<div class="ig-car__img" style="background-image:url(' + esc(it.url) + ')"></div></div>';
	    }).join('');
	    var dots = items.map(function (it) { return '<button type="button" class="ig-car__dot' + (it.id === active ? ' on' : '') + '" data-fl-cardot="' + esc(it.id) + '" aria-label="이 사진 보기"></button>'; }).join('');
	    return '<div class="ig-car cap-car" data-fl-carousel>' +
	      '<div class="ig-car__track cap-car__track" data-fl-cartrack>' + slides + '</div>' +
	      '<div class="ig-car__dots">' + dots + '</div>' +
	    '</div>';
	  }
	  // [v583] 인스타 미리보기 카드(.ig-card2) — 캡션 결과 화면과 (구)preview 화면이 공유.
	  // [v584] editable=true 면 카드 안 캡션을 그 자리에서 직접 편집(아래 별도 편집칸 폐지).
	  function _igPreviewCard(url, editable) {
	    var ig = window.WorkspaceAdapter && window.WorkspaceAdapter.instagramProfile ? window.WorkspaceAdapter.instagramProfile() : { connected: false };
	    var handle = ig.connected && ig.handle ? ig.handle : '인스타 미연동';
	    var name = ig.connected ? (ig.displayName || handle) : '인스타 미연동';
	    var avatar = ig.connected && ig.profilePic
	      ? '<span class="ig-logo ig-logo--photo" style="background-image:url(' + esc(ig.profilePic) + ')"></span>'
	      : '<span class="ig-logo ig-logo--empty"><i class="ph-duotone ph-instagram-logo"></i></span>';
	    return '<div class="ig-card2">' +
	        '<div class="ig-head2">' + avatar + '<span class="ig-name2">' + esc(name) + '</span><span class="ig-loc">' + esc(ig.connected ? '샵 인스타' : '연결 필요') + '</span><span class="ig-dots2">···</span></div>' +
	        _igCarouselHtml(url) +
	        // [v589] 카드 액션줄 기능화 — 인스타 아이콘 자리에 복사·다시생성·저장(결과화면에서만)
	        (editable
	          ? '<div class="ig-act ig-act--fn">' +
	              '<button type="button" class="ig-actbtn" data-fl="copycap" aria-label="게시글 복사"><i class="ph-duotone ph-copy"></i><b>복사</b></button>' +
	              '<button type="button" class="ig-actbtn" data-fl-var="regen" aria-label="다시 생성"><i class="ph-duotone ph-arrows-clockwise"></i><b>다시 생성</b></button>' +
	              '<button type="button" class="ig-actbtn" data-fl="saveimg" aria-label="이미지 저장"><i class="ph-duotone ph-download-simple"></i><b>저장</b></button>' +
	            '</div>'
	          : '<div class="ig-act"><div class="ig-ic"><i class="ph-duotone ph-heart"></i><i class="ph-duotone ph-chat-circle"></i><i class="ph-duotone ph-paper-plane-tilt"></i></div>' +
	            '<div class="ig-save"><i class="ph-duotone ph-bookmark-simple"></i></div></div>') +
	        '<div class="ig-copy2"><b>' + esc(handle) + '</b> <span data-fl-igcap' + (editable ? ' class="ig-cap-edit" contenteditable="true" role="textbox" aria-label="게시글 편집" spellcheck="false"' : '') + '>' + esc(d.caption || '') + '</span><br><span class="ig-hash' + (editable ? ' ig-hash-edit" contenteditable="true" role="textbox" aria-label="해시태그 편집" spellcheck="false' : '') + '" data-fl-ighash>' + esc((d.selectedHashes && d.selectedHashes.length ? d.selectedHashes : d.hashtags).join(' ')) + '</span><div class="ig-ago">' + (editable ? '게시글·해시태그를 눌러 바로 고쳐 쓰기' : '미리보기') + '</div></div>' +
	      '</div>';
	  }
	  // [작업물 미리보기] 슬롯 대표 썸네일 — home _thumb 과 동일 우선순위(합성결과→단일합성→첫사진).
	  function _slotThumb(s) {
	    if (!s) return '';
	    if (s.templateOutputs && s.templateOutputs.length && s.templateOutputs[0].outputUrl) return s.templateOutputs[0].outputUrl;
	    if (s.templateOutput) return s.templateOutput;
	    var p = (s.photos || [])[0];
	    return (p && (p.editedDataUrl || p.dataUrl)) || '';
	  }
	  // [v589] 피드 미리보기 — 이 사진을 올리면 내 프로필 피드가 어떻게 보일지 그리드로.
	  function _feedPreview(url) {
	    if (!url) return '';
	    var ig = window.WorkspaceAdapter && window.WorkspaceAdapter.instagramProfile ? window.WorkspaceAdapter.instagramProfile() : { connected: false };
	    // [피드 미리보기] 기존 피드 썸네일 = 메모리/세션 캐시(저장소 X) → 켜자마자 즉시. new 사진은 로컬 합성본이라 항상 즉시.
	    var recent = (window.WorkspaceAdapter && window.WorkspaceAdapter.recentMediaCached) ? window.WorkspaceAdapter.recentMediaCached() : [];
	    // 캐시 비었고 인스타 연결됨 → 1회만 당겨와 채운다(미리보기면 완료 시 재렌더). 실패해도 자리표시 유지.
	    if (ig.connected && !recent.length && !d._igMediaFetched && window.WorkspaceAdapter.recentMedia) {
	      d._igMediaFetched = true;
	      try { window.WorkspaceAdapter.recentMedia().then(function (m) { if (m && m.length && (cur === 'caption' || cur === 'preview') && !_isEditingCaptionCard()) setScreen(cur, { push: false }); }); } catch (_e) { void _e; }
	    }
	    // [작업물 미리보기 2026-07-10] 채움 소스 분기 — 연동됨=실제 인스타 피드 / 미연동=내 작업물(로컬, 저장소 X).
	    //   원장님 요청: 연동한 사람은 실제 피드에 어떻게 얹히는지, 미연동은 내가 만든 작업물이 자리를 채우게.
	    var fill = ig.connected ? recent : (d._myWorkThumbs || []);
	    var TILES = 11;   // 3×4 그리드 = 새 게시물 1 + 기존 11
	    var cells = '<div class="wsfeed__cell wsfeed__cell--new" style="background-image:url(' + esc(url) + ')"><span class="wsfeed__new">NEW</span></div>';
	    for (var i = 0; i < TILES; i++) {
	      var _t = fill[i] && (fill[i].thumb || (typeof fill[i] === 'string' ? fill[i] : ''));   // 새형식(obj.thumb)·구형식(string) 호환
	      cells += _t
	        ? '<div class="wsfeed__cell" style="background-image:url(' + esc(_t) + ')"></div>'
	        : '<div class="wsfeed__cell wsfeed__cell--ph"></div>';
	    }
	    var stat = ig.connected
	      ? '<div class="wsfeed__prof"><span class="wsfeed__av"' + (ig.profilePic ? ' style="background-image:url(' + esc(ig.profilePic) + ')"' : '') + '></span><b>' + esc(ig.handle || '내 계정') + '</b></div>'
	      : '';
	    // 안내문구 — 연동: 실제 피드 / 미연동+작업물있음: 내 작업물 / 미연동+작업물없음: 연결 유도.
	    var capMsg = ig.connected ? '왼쪽 위가 이번에 올릴 사진이에요'
	      : (fill.length ? '왼쪽 위가 이번에 올릴 사진 · 나머지는 내 작업물이에요' : '왼쪽 위가 이번에 올릴 사진이에요 · 인스타 연결하면 실제 피드로 보여드려요');
	    return '<div class="wsfeed">' +
	      '<label class="cap-field-label wsfeed__lbl">피드 미리보기 <span>' + (ig.connected ? '올리면 내 피드가 이렇게 보여요' : '내 작업물과 함께 보기') + '</span></label>' +
	      '<div class="wsfeed__card">' + stat +
	        '<div class="wsfeed__grid">' + cells + '</div>' +
	        '<p class="wsfeed__cap">' + capMsg + '</p>' +
	        // [요청7 2026-07-13] '피드 정렬해보기' 제거 — 현재 작업 사진만 정렬·저장X 였음. 피드 정렬은 작업실 홈 '피드 정렬'(저장 콘텐츠 전체+순서저장)으로 이관.
	      '</div></div>';
	  }
	  function renderPreview() {
	    var url = outputUrl();
	    var custLine = d.customerName ?
	      '<div class="confirmline">연결 손님: <b>' + esc(d.customerName) + '</b>' + (d.customerVc ? ' · ' + d.customerVc + '회 방문' : ' · 첫 방문') + '</div>' : '';
	    // [v592] 인스타 미리보기 단계 = 최종 카드 + 게시 + 피드 미리보기.
	    return '' + '<div class="cap-byline">이렇게 올라가요</div>' + custLine + _igPreviewCard(url, true) + _publishBlock() + _feedPreview(url);
	  }

  // [통합 2026-07-14] 발행 종류 자동 판단 — 원장이 '1장/여러장'을 고르지 않게. 버튼은 하나.
  //   레이아웃 합성본이면 단일 피드, 선택된 사진 2장 이상이면 캐러셀. 선택/해제는 업로드 화면에서(editablePhotos).
  // [버그5 2026-07-14] '내 말투(페르소나)'가 실제로 적용되는 조건 = 인스타 연동 여부.
  //   payload 의 use_persona 와 동일 기준(doGenerate 의 _igConn). 미연동인데 화면만 '학습 완료'라고 말해
  //   원장이 "말투 반영되는 거 맞나?" 의심하게 만들던 거짓 표시를 차단한다.
  function _personaOn() {
    try { return !!(window.WorkspaceAdapter && window.WorkspaceAdapter.instagram && window.WorkspaceAdapter.instagram().connected); } catch (_e) { return false; }
  }
  function _publishKind() {
    var hasComposite = !!(d.wsLayout && d.templateOutput);
    return (!hasComposite && (editablePhotos() || []).length >= 2) ? 'carousel' : 'feed';
  }
  function _publishBlock() {
	    var connected = window.WorkspaceAdapter ? window.WorkspaceAdapter.instagram().connected : false;
	    // [cleanup] 스토리 발행 픽커 제거(2026-07-12) — 진입 버튼(publishstory)이 재설계로 사라져 도달 불가였음. 발행은 피드/여러 장만.
	    if (connected) {
	      // [스토리/캐러셀] 피드 + 스토리, 사진 2장 이상이면 캐러셀(여러 장) 버튼도.
	      // [버그수정 2026-07-10] ws-hyper 레이아웃은 여러 장을 '1장 합성본'(d.templateOutput)으로 합침 →
	      //   캐러셀(여러 장 슬라이드)은 부적절하고 원본 여러 장을 보내 실패했음. 레이아웃이면 단일 피드로만.
	      var _n = (editablePhotos() || []).length;
	      var _multi = _publishKind() === 'carousel';
	      // [계정 태그] 피드 사진에 계정 태그(선택) — @아이디 쉼표로.
	      var _tagVal = (d.igUserTags || []).map(function (u) { return '@' + u; }).join(', ');
	      return '<div class="cap-usertags" style="margin-top:10px"><input type="text" data-fl-usertags placeholder="사진에 계정 태그 — @아이디 (쉼표, 선택)" value="' + esc(_tagVal) + '" style="width:100%;height:42px;border:1px solid var(--border);border-radius:12px;padding:0 13px;font-size:13.5px;font-family:inherit;background:var(--surface);color:var(--text)">' +
        // [계정 태그 2026-07-14] 여러 장은 인스타 구조상 커버(첫 장)에만 태그가 붙는다 — 기대와 다르면 "안 됐다"로 읽히므로 명시.
        (_multi ? '<div style="font-size:11px;color:var(--text-subtle);margin-top:5px">여러 장은 첫 번째 사진(커버)에만 태그가 붙어요</div>' : '') +
        '</div>' +
	      '<div class="cap-pubrow" style="margin-top:10px">' +
	        '<button type="button" class="cap-preview cap-preview--send" style="width:100%" data-fl="publish"' + (d._publishing ? ' disabled' : '') + '>' + (d._publishing ? '<i class="ph-duotone ph-spinner"></i>올리는 중…' : '<i class="ph-duotone ph-paper-plane-tilt"></i>인스타에 올리기' + (_n > 1 ? ' (' + _n + '장)' : '')) + '</button>' +
	      '</div>' +
	      // [통합 2026-07-14] '여러 장으로 올리기' 별도 버튼 제거 — 위 버튼 하나가 _publishKind() 로 알아서 캐러셀 발행.
      (_multi ? '<div class="cap-pubnote" style="margin-top:7px;font-size:11.5px;color:var(--text-subtle);text-align:center">선택한 ' + _n + '장이 여러 장 게시물로 올라가요</div>' : '');
	    }
    return '<div class="wsflow-prep">' +
      '<div class="wsflow-prep__note">인스타 계정이 연결되지 않아 바로 업로드할 수 없어요. 준비만 해둘게요.</div>' +
      '<div class="wsflow-prep__row">' +
        '<button type="button" data-fl="copycap">게시글 복사</button>' +
        '<button type="button" data-fl="saveimg">이미지 저장</button>' +
        '<button type="button" class="pink" data-fl="igconnect">인스타 연결</button>' +
      '</div></div>';
  }

  // [C5] 고객 연결 — 컬러바+방문횟수 배지, 아바타 없음
  // [T-104 P4] renderConnect → flow/connect.js (상단 별칭)

  // ── [ws-hyper] 레이아웃 고르기 화면 ─────────────────────────
  // [T-104 P2] 레이아웃 화면 클러스터(renderLayout·_ws*·_fillLayoutText) → flow/layout.js (context 주입)
  var _WSL = (window.WSFlowLayout && window.WSFlowLayout.create) ? window.WSFlowLayout.create({
    d: function () { return d; }, cur: function () { return cur; }, el: function () { return el; },
    setScreen: setScreen, editablePhotos: editablePhotos, photoUrl: photoUrl, cleanBase: _cleanBase
  }) : {};
  // [S4] dellayout·layoutpick·trayph·savelayout·skiplayout 는 layout.handleClick 로 이관 → 여기선 render/mount/편집상태/텍스트주입만 별칭.
  var renderLayout = _WSL.renderLayout, _wsMountStage = _WSL._wsMountStage,
    _wsLayoutEditState = _WSL._wsLayoutEditState, _fillLayoutText = _WSL._fillLayoutText;

  // [T-104 P4] 고객 연결 화면 클러스터(renderConnect·loadRecent·pickCustomer·_connectByName) → flow/connect.js (context 주입)
  var _WSC = (window.WSFlowConnect && window.WSFlowConnect.create) ? window.WSFlowConnect.create({
    d: function () { return d; }, cur: function () { return cur; }, setScreen: setScreen,
    save: function () { return save(); }, buildSlot: function () { return buildSlot(); }   // [S4] 핸들러가 저장·슬롯빌드를 쓰므로 주입(함수 선언은 호이스팅되어 create 시점에 존재)
  }) : {};
  var renderConnect = _WSC.renderConnect, loadRecent = _WSC.loadRecent, _connectByName = _WSC._connectByName;   // [S4] pickcust 는 connect.handleClick 로 이관 → 여기서 pickCustomer 별칭 불필요

  // [refactor S2] 스텝별 동작(render + onEnter mount)을 한 맵에 co-locate — 기존 RENDER 맵 + setScreen 의 흩어진 if(name===) mount 사다리를 대체.
  //   스텝 추가/변경 시 여기 한 줄만 손보면 됨(흩어진 mount 분기 제거 = 고아코드 방지).
  // [refactor S3] onCta/_navBack 의 스텝별 전환·뒤로가기 로직도 여기 onExit/onBack 으로 co-locate.
  //   onExit(to): false=전환 취소 · Promise=완료 후 onCta 가 setScreen(to) · 그 외(undefined)=즉시 진행. **무동작변경** — 기존 인라인 사다리와 동일.
  //   onBack(): true=스텝이 자체 처리(setScreen 직접 호출) · 그 외=_navBack 기본 pop.
  var _rafFx = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
  // 업로드 전환 전: 사진 유무/선택 검증(실패=전환 취소). textOnly 는 사진 없이도 통과.
  function _exitUpload() {
    if (d.textOnly) return;
    if (!d.photos.length) { toast('사진을 먼저 추가해 주세요.'); return false; }
    if (!editablePhotos().length) { toast('사진을 1장 이상 선택해 주세요.'); return false; }
  }
  // 캡션 전환 전: 입력 확정 → 게시글 없으면 생성/안내 후 취소, 후기 레이아웃이면 캡션 반영해 재합성.
  function _exitCaption() {
    flushCaptionInputs();
    // [캡션 스킵 방지] 게시글 안 만든 채로 다음 단계로 못 넘어가게 — 시술명 있으면 생성, 없으면 안내(전환 취소).
    if (!String(d.caption || '').trim()) {
      if (String(d.service || '').trim()) { doGenerate({}, '게시글을 만들었어요'); }
      else { toast('시술 내역/키워드를 입력하면 게시글을 만들어 드려요'); }
      return false;
    }
    // [A1] 후기 레이아웃은 시술/캡션이 확정된 지금 재합성해 본문에 반영(레이아웃 단계엔 아직 캡션이 없었음).
    if (d.wsLayout && d.wsLayout.kind === 'review' && window.WorkspaceLayout) {
      return Promise.resolve(window.WorkspaceLayout.composeLayout(_fillLayoutText(d.wsLayout), editablePhotos(), d._wsAssign)).then(function (u) {
        if (u) { d.templateOutput = u; d.previewUrl = null; }
      });
    }
  }
  // 편집 전환 전: 현재 보정을 굽고(bake) 다음 단계.
  function _exitEdit() { return bakeEdit(); }
  // [ws-hyper] 레이아웃 전환 전: 조정된 focal/zoom 으로 최종 이미지 합성 후 다음 단계.
  function _exitLayout() {
    if (d.wsLayout && window.WorkspaceLayout) {
      return Promise.resolve(window.WorkspaceLayout.composeLayout(_fillLayoutText(d.wsLayout), editablePhotos(), d._wsAssign)).then(function (u) {   // [A1] 후기/가격 텍스트 주입
        if (u) { d.templateOutput = u; d.previewUrl = null; }
      });
    }
  }
  // [v531] 캡션 결과 화면에서 뒤로 = 결과만 비우고 캡션 입력으로(편집으로 안 튐). 결과 없으면 기본 pop.
  function _backCaption() {
    if (String(d.caption || '').trim() && navStack.length && navStack[navStack.length - 1] === 'caption') {
      if (_histDepth > 0) _histDepth--;
      navStack.pop();
      _genToken++;   // [버그수정] 진행 중인 재생성 응답 무효화 — 나중에 도착해도 무시
      d.caption = ''; d.hashtags = []; d.selectedHashes = []; d.logId = null;
      setScreen('caption', { push: false });
      return true;
    }
  }
  var STEP_FX = {
    upload:   { render: renderUpload,   onExit: _exitUpload },
    layout:   { render: renderLayout,   onEnter: function () { _wsMountStage(); }, onExit: _exitLayout, handle: _WSL.handleClick },
    edit:     { render: renderEdit,     onEnter: function () { _warmEditMasks(); _rafFx(function () { _mountCarousel(); }); }, onExit: _exitEdit },
    template: { render: renderTemplate, onEnter: function () { _rafFx(function () { _mountCarousel(); }); } },
    caption:  { render: renderCaption,  onEnter: function () { _mountCaption(); }, onExit: _exitCaption, onBack: _backCaption },
    connect:  { render: renderConnect,  onEnter: function () { loadRecent(); }, handle: _WSC.handleClick },
    preview:  { render: renderPreview,  onEnter: function () { _rafFx(function () { _mountCaption(); }); } },
  };

  // 드래그 중 라이브 미리보기(CSS). 손 떼면 applyWorkspaceCorrections(실픽셀)로 확정.
  //  - 밝기/대비/채도: 좌=낮음, 우=높음
  //  - 선명도: 우(+)=또렷(대비 미세 상승), 좌(-)=부드러움(블러)
  //  - 색감: 우(+)=웜(sepia), 좌(-)=쿨(hue를 파랑 쪽으로) — 확정 픽셀은 실제 색온도로 적용
  // [T-104 P1] filterCss → flow/util.js

  // [이슈9] 편집 진입 시 현재 편집 사진의 부위 마스크/모델을 미리 워밍업(사진별 1회).
  //   슬라이더를 만지기 전에 sclera/brow/eyelash 마스크가 캐시에 차도록 → 헤어볼륨/눈썹/눈가가 실제로 적용됨.
  function _warmEditMasks() {
    try {
      var p = curEditPhoto(); if (!p) return;
      var src = p.editedDataUrl || p.dataUrl; if (!src) return;
      d._warmed = d._warmed || {};
      if (d._warmed[p.id]) return; d._warmed[p.id] = true;
      if (window.WorkspaceAdapter && window.WorkspaceAdapter.warmMasks) window.WorkspaceAdapter.warmMasks(src);
    } catch (_e) { /* 워밍업 실패는 무해 — 휴리스틱 폴백 유지 */ }
  }

  /* ── 라우팅 ── */
  function setScreen(name, opts) {
    opts = opts || {};
    // [fix 2026-07-12] 같은 화면 재렌더(샵 선택·다시 생성 등)면 스크롤 위치 보존용 — 전환일 때만 맨 위로.
    var _prevCur = cur;
    var _prevActive = el && el.querySelector('.wsv2flow__s.active');
    var _prevScrollTop = _prevActive ? _prevActive.scrollTop : 0;
    // [v531] 캡션 화면을 떠날 땐 항상 입력(본문·해시태그·꼬리말) 확정 → 저장/미리보기/복사에 편집분 반영(어떤 경로든).
    if (cur === 'caption' && name !== 'caption' && el && el.classList.contains('is-open')) flushCaptionInputs();
    // 같은 화면 재렌더(doGenerate/loadRecent 등)는 push 안 함. 뒤로가기(fromBack)도 push 안 함.
    if (name !== cur && opts.push !== false && el && el.classList.contains('is-open')) { navStack.push(cur); _pushHist(); }
    cur = name;
    var to = SCREENS.indexOf(name);
    el.querySelectorAll('.wsv2flow__s').forEach(function (s) {
      var i = SCREENS.indexOf(s.dataset.fs);
      var on = s.dataset.fs === name;
      if (on) {
        // [v566·scope5] 템플릿 사진 스트립의 가로 스크롤 위치 보존(재렌더로 1번째로 튕김 방지).
        var _ps = s.querySelector('[data-fl-tplstrip]');
        var _pl = _ps ? _ps.scrollLeft : 0;
        s.innerHTML = STEP_FX[name].render();
        if (_pl) { var _ns = s.querySelector('[data-fl-tplstrip]'); if (_ns) _ns.scrollLeft = _pl; }
      }
      s.classList.toggle('active', on);
      s.classList.toggle('prev', !on && i < to);
    });
    el.querySelector('[data-fl-title]').textContent = TITLE[name];
    // [Phase A-1] 진행 표시는 '보이는 단계' 기준. 숨김 화면(edit/template)은 SCREENS 인덱스로 폴백(범위 보호).
    var vis = VISIBLE_SCREENS.indexOf(name);
    if (vis < 0) vis = Math.min(to, VISIBLE_SCREENS.length - 1);
    el.querySelector('[data-fl-step]').textContent = (vis + 1) + ' / ' + VISIBLE_SCREENS.length;
    el.querySelectorAll('.wsv2flow__progress .pg-seg').forEach(function (sg, i) { sg.classList.toggle('done', i <= vis); });
    var bar = el.querySelector('.wsv2flow__actionbar'), cta = el.querySelector('[data-fl="cta"]');
    if (CTA[name]) { bar.classList.remove('hidden'); cta.textContent = CTA[name].l; } else bar.classList.add('hidden');
    // [v560] 편집 화면에서만 CTA 2분할(좌:저장하고 게시글 쓰기 / 우:템플릿 선택하기). 그 외엔 단일.
    var cta2 = el.querySelector('[data-fl="cta2"]');
    if (cta2) {
      if (name === 'edit') { cta2.classList.remove('hidden'); cta2.textContent = '템플릿 선택하기'; cta.classList.add('wsv2flow__cta--half'); cta2.classList.add('wsv2flow__cta--half'); }
      else { cta2.classList.add('hidden'); cta.classList.remove('wsv2flow__cta--half'); }
    }
    // [캡션] 생성 트리거는 아래 '시나리오 칩(상황 선택)' 하나로 통일.
    //  생성 전(결과 없음)엔 하단 CTA 숨김 → 칩을 눌러 생성. 생성 후 '고객 연결로' 노출.
    if (name === 'caption' && !String(d.caption || '').trim()) bar.classList.add('hidden');
    // [fix 2026-07-12] 같은 화면 재렌더(샵 선택·다시 생성 등)면 스크롤 유지 — 화면 전환일 때만 맨 위로.
    var act = el.querySelector('.wsv2flow__s.active');
    if (act) act.scrollTop = ((name === _prevCur) || opts.keepScroll) ? _prevScrollTop : 0;
    var _fx = STEP_FX[name]; if (_fx && _fx.onEnter) _fx.onEnter();   // [refactor S2] 흩어진 mount 사다리 → 스텝 onEnter 일괄(순서·동작 동일)
    if (name === 'preview' && d.publish && (d.publish.status === 'draft' || !d.publish.status)) d.publish.status = 'preview_ready';
  }

  // [T-104 P4] loadRecent → flow/connect.js

	  // 생성 직전 입력창의 최신 값을 직접 읽음 — input 이벤트 누락/IME 미확정으로 키워드 빠지는 것 방지.
	  function syncServiceFromDom() {
	    if (!el) return;
	    var s = el.querySelector('[data-fl-service]');
	    if (s && typeof s.value === 'string') d.service = s.value;
	  }
	  // [v532] extra_notes 빌더 — 핵심: 백엔드 fewshot(샵 과거글)은 '말투'만 참고, '시술 내용'은 입력값만.
	  //   기존엔 category=extension fewshot 이 붙임머리/단발탈출/슬림땋기 등 엉뚱한 시술명을 캡션에 흘렸음.
	  //   → "과거 글은 말투·길이만, 시술명·인치·기법·재료는 입력값만" 으로 프론트에서 강제 차단.
	  //   regenSeq 가 있으면 '앞 글과 다른 구성으로' 변형 지시 추가('다시 쓰기' 가 동일 캡션 반복하던 회귀 해소).
	  function _buildExtraNotes(svc, regenSeq) {
	    var s = String(svc || '').trim().slice(0, 60);
	    var note = '이 게시글의 시술은 오직 "' + s + '". 과거 글·예시는 말투와 문장 길이만 참고하고, 시술명·인치·기법·재료는 입력값만 쓰세요. ' +
	      '입력에 없는 다른 시술/상품명(붙임머리·단발·땋기·매듭·펌 등)은 사진이나 예시에 보여도 절대 언급하지 마세요. ' +
	      '샵·디자이너 이름을 모르면 지어내지 말고 "저희 샵"으로. 구어/비속어는 그대로 쓰지 말고 의미만 뷰티 인스타 톤으로 정제.';
	    if (regenSeq && regenSeq > 0) note += ' (재생성 ' + regenSeq + '회차: 앞 글과 도입부·문장 구성·표현을 다르게, 같은 내용 다른 말로.)';
	    return note.slice(0, 300);
	  }
	  // [v566·scope7] 프론트 렌더 직전 최종 스크러버 — 백엔드 방어를 우회한(구버전 캐시/예외) 상투 누출
	  //   문단을 화면에 그리기 전에 문장째 제거 + 마크다운 원문 제거(이중 안전망).
	  var _CAP_FORBIDDEN = [
	    '시술 전후 차이가 보이시나요', '전후 차이가 보이시나요', '여신 머리', '여신머리',
	    '짧은 단발에서', '단발에서 여신', '변신하는 건 한순간', '변신하는건 한순간',
	    '한 끗', '한끗', '디테일은 한 끗', '묶었을 때 티', '티 나지 않는', '슬림한 매듭',
	    '두상 커', '내 머리 같은 가벼움', '드디어 정착', '정착할 곳', '긴 머리가 주는 무드',
	    '머리가 주는 무드',
	    // 주의: 시술명(붙임머리/매듭/네일 등)은 넣지 않음 — 정당한 시술 캡션 보존(타업종 혼입은 백엔드 도메인 스크럽이 처리).
	  ];
	  // [v570·필수3] 프론트 최소 방어 오타/중복 정리(백엔드가 1차 처리, 표시 직전 백스톱).
	  function _fixTypos(text) {
	    if (!text) return text;
	    return String(text)
	      .replace(/레이아드컷/g, '레이어드컷').replace(/레이아드/g, '레이어드')
	      .replace(/레이어드\s+컷/g, '레이어드컷')
	      .replace(/칼라/g, '컬러')   // [#2] '칼라'(collar 오타) → '컬러'(color)
	      .replace(/고객고객님/g, '고객님').replace(/고\s*고객님/g, '고객님')
	      .replace(/(고객님)(?:\s*고객님)+/g, '고객님');
	  }
	  // [#7] 시술 내용에서 지역명(OO동/구/읍/면/리/역) 추출 → 지역 해시태그(백엔드 누락 백스톱). 흔한 비지역어 제외.
	  function _locationTags(svc) {
	    var s = String(svc || ''), out = [], seen = {};
	    var BAD = { '활동': 1, '운동': 1, '행동': 1, '이동': 1, '자동': 1, '감동': 1, '작동': 1, '변동': 1, '진동': 1, '충동': 1, '노동': 1, '아동': 1, '공동': 1, '도구': 1, '친구': 1, '연구': 1, '가구': 1, '야구': 1, '요구': 1, '지구': 1, '입구': 1, '출구': 1, '인구': 1, '축구': 1, '농구': 1 };
	    var re = /([가-힣]{2,5}(?:동|읍|면|리|역|구))/g, m;
	    while ((m = re.exec(s))) { var w = m[1]; if (BAD[w] || seen[w]) continue; seen[w] = 1; out.push('#' + w); if (out.length >= 2) break; }
	    return out;
	  }
	  function _scrubCaption(text) {
	    if (!text) return text;
	    text = _fixTypos(text);
	    var nomd = String(text).replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1')
	      .replace(/(^|\n)\s{0,3}#{1,6}\s*/g, '$1').replace(/`/g, '');
	    var out = nomd.split('\n').map(function (line) {
	      var parts = line.split(/(?<=[.!?…])\s+/);
	      return parts.filter(function (s) { return !_CAP_FORBIDDEN.some(function (b) { return s.indexOf(b) >= 0; }); }).join(' ').trim();
	    }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
	    // [#11] 본문 끝에 해시태그가 붙어 오는 경우(예: "…주세요 💕#헤어 #헤어스타일") — 해시태그는 별도(d.hashtags)로
    //   관리하므로 본문 꼬리의 해시태그 블록을 떼어낸다(본문 마지막 글자에 딱 붙는 회귀 방지).
    var stripped = out.replace(/(\s*#[^\s#]+)+\s*$/u, '').trim();
    if (stripped) out = stripped;   // 본문이 전부 해시태그였던 극단 케이스는 원본 유지
    return out || nomd.trim();   // 전부 걸러지면(극단) 마크다운만 제거한 본문 유지
	  }
	  // [P1-1] 캡션 생성 전 '확인칩' — 입력에서 분리된 샵/고객/시술을 사용자가 보고 ✎로 직접 고친다.
	  //   오버라이드(d.capShopOverride/d.capCustOverride)는 doGenerate 가 파싱보다 우선 사용 → 오분리 즉시 교정.
	  function _capParseService() {
	    var raw = String(d.service || '');
	    var c = _cleanService(raw);
	    var shop = (d.capShopOverride != null) ? d.capShopOverride : (c.shop || _shopName() || '');   // [#1] 사용자가 친 인라인 샵 우선(stale 등록값 'Dd' 가 덮어쓰는 것 방지)
	    var customer = (d.capCustOverride != null) ? d.capCustOverride : (c.customer || (d.customerId ? d.customerName : '') || '');   // [#1] 연결된 고객(customerId)만 재사용, stale 이름('방') 방지
	    return { shop: shop, customer: customer, service: c.service || raw };
	  }
	  function _capConfirmHtml() {
	    return '';   // [#3] 캡션 생성 화면에서 '검증(확인칩)' 제거 — 샵 파싱이 자동(#1)이라 불필요. 오버라이드 로직은 doGenerate 에 유지.
	  }
	  function _refreshCapConfirm() {
	    var box = el && el.querySelector('[data-fl-confirm]');
	    if (!box) return;
	    var tmp = document.createElement('div'); tmp.innerHTML = _capConfirmHtml();
	    box.replaceWith(tmp.firstChild);
	  }
	  function _editCapOverride(kind) {
	    var p = _capParseService();
	    var cur = kind === 'shop' ? p.shop : p.customer;
	    var title = kind === 'shop' ? '우리샵 이름 (게시글에 이대로 표기)' : '고객 이름 (없으면 비워두세요)';
	    (window._inlinePrompt || window.prompt)(title, cur || '', function (v) {
	      var nv = (v == null ? '' : String(v)).trim();
	      if (kind === 'shop') d.capShopOverride = nv; else { d.capCustOverride = nv; d.customerName = nv; }
	      _refreshCapConfirm();
	    });
	  }
	  function doGenerate(extra, label) {
	    if (d.capLoading) return;   // [audit] 생성 중 재탭 무시 — 연타 시 API 이중 호출(비용) 방지
	    syncServiceFromDom();
	    var svc = String(d.service || '').trim();
	    if (!svc) { toast('시술 내역을 먼저 입력해 주세요'); return; }
    _saveRecentService(svc);   // [P4] 최근 시술 기억 — 다음엔 탭 한 번으로 다시 채움
	    var _p = _capParseService();   // [P1-1] 확인칩 오버라이드 우선 반영
	    var _cust = { service: _p.service, customer: _p.customer, shop: _p.shop }; var svcClean = _p.service || svc;
			// [#2] 사적 방문정황(남친이랑 옴)·가격(28만원짜리) 뺀 '공개 시술 키워드' — LLM 이 사담/가격을 캡션에 안 넣게.
		// [버그6 2026-07-14] 캡션 API 에는 '절단 없는' 공개 시술 키워드 전체를 보낸다.
		//   기존: _splitServiceForLayers(오버레이용 title+sub = 앞 4단어)를 재사용 → 시술명 5개 이상이면 뒤가 소실됐음.
		//   사담·가격·지시·이모지 제거는 그대로 유지(_publicServiceKeywords 가 같은 정제 파이프라인을 씀).
		var _pubSvc = _publicServiceKeywords(svc) || svcClean;
    if (_cust.customer) d.customerName = _cust.customer;   // [#2] 이번 입력의 고객을 우선(예전 stale 값이 안 남게)
	    if (!(window.WorkspaceAdapter && window.WorkspaceAdapter.generateCaption)) { toast('게시글 생성 모듈을 불러오지 못했어요'); return; }
	    var _wasEmpty = !String(d.caption || '').trim();   // [v531] 입력→결과 최초 전환이면 뒤로가기용 history 마커 push
    // [v532] 재생성('다시 쓰기/더 길게/인스타 톤/짧게')이면 회차 카운터 증가 → extra_notes 변형 지시에 사용(동일 캡션 반복 방지).
    if (extra && extra._regen) d.regenSeq = (d.regenSeq || 0) + 1;
	    var _myToken = ++_genToken;   // [버그수정] 이 호출만의 토큰 — 응답 도착 시 아직 최신인지 확인용
	    d.capLoading = true; setScreen('caption');
	    var photoCtx = d.captionAxes ? [d.captionAxes.situation, d.captionAxes.customer, d.captionAxes.photo].filter(Boolean).join(' / ') : _roleSummary();
	    var opts = Object.assign({ slotId: d.slot && d.slot.id, service: _pubSvc, photo_context: photoCtx, mode: d.captionMode || 'normal' }, extra || {});
    delete opts._regen;   // [v532] 내부 재생성 플래그 — 페이로드로 내보내지 않음
    // [v532] 사용자 입력을 캡션 최우선 context 로. '입력 키워드만 시술명으로, 과거 글은 말투만 참고'를 명시 —
    //   백엔드 fewshot(샵 과거글)이 엉뚱한 시술명(붙임머리·단발 등)으로 새는 것을 프론트에서 차단.
    if (svc) {
      opts.photo_context = '시술/키워드(이 게시글의 유일한 시술): ' + _pubSvc +
        '. 이 키워드만 시술명으로 쓰고, 입력에 없는 다른 시술/상품명은 절대 만들지 마세요. 과거 글은 말투만 참고' +
        (opts.photo_context ? ' · ' + opts.photo_context : '');
    }
    opts.customer_name = _cust.customer || (d.customerId ? d.customerName : '') || '';   // [#1] 이번 입력 고객 or 연결된 고객만(stale 이름 '방' 방지)
    if (opts.customer_name) opts.photo_context += ' · 고객명: ' + opts.customer_name + '(시술받는 고객 이름. 시술명·스타일명·브랜드명이 아님. 게시글엔 고객님으로 자연스럽게만 언급)';
    // [다중pair] 결과물 여러 장이면 '캐러셀 게시글' 기준 — 중립적 전후 변화로(특정 시술명 가정 금지).
    var _outs = d.templateOutputs || [];
    if (_outs.length >= 2) opts.photo_context += ' · 전후 결과물 ' + _outs.length + '장(인스타 캐러셀 한 편). 각 장은 같은 고객의 시술 전/후 변화 컷.';
    else if (_outs.length === 1 && d.tplPurpose === 'before_after') opts.photo_context += ' · 시술 전후 변화 1장.';
    // [v532] photo_context 백엔드 상한 500자 — 다중 pair 노트까지 붙은 뒤 초과 시 422(생성 실패) 방지로 클램프.
    if (opts.photo_context && opts.photo_context.length > 480) opts.photo_context = opts.photo_context.slice(0, 480);
    // [v532] extra_notes — 시술 내용은 입력값만(과거 글은 말투만) + 재생성 변형 지시. 백엔드 상한 300자 내 보장.
    opts.extra_notes = _buildExtraNotes(svcClean, d.regenSeq);
    // [#2] 고객의 사적 방문정황(남자친구·친구와 함께 왔다 등)과 금액/가격은 캡션 본문·해시태그에 절대 넣지 말 것.
    opts.extra_notes = ('고객의 사적인 방문 정황(남자친구·친구·지인과 함께 왔다 등)과 시술 금액/가격은 게시글 본문과 해시태그에 넣지 말 것. ' + opts.extra_notes).slice(0, 300);
    // [P1-2] 빈값 가드 — 고객/샵을 입력 안 했으면 AI가 지어내지 않게 명시(차용 방지).
    if (!_p.customer) opts.extra_notes = '고객 이름이 없으니 특정 고객명을 지어내지 말 것. ' + opts.extra_notes;
    if (!_p.shop && !_shopName()) opts.extra_notes = '상호(샵 이름)가 없으니 가짜 상호를 만들지 말고 "저희 샵"으로만 칭할 것. ' + opts.extra_notes;
    opts.extra_notes = opts.extra_notes.slice(0, 300);
    // [v534] 백엔드 우선맥락/variation 필드 — 백엔드가 service/treatment_keyword 를 prompt 에 직접 주입하고
    //   caption_intent 별 분기 + previous_caption 반복 방지 + variation_seed 로 동일 결과를 막는다.
    opts.treatment_keyword = _pubSvc;   // [#2] 공개 키워드(사담/가격 제외)
    var _sn = _cust.shop || _shopName();   // [P1-1] 확인칩 오버라이드(_cust.shop)가 등록 샵보다 우선
    // [#1] 'Dd' 같은 계정 placeholder 를 상호로 캡션에 도배하는 문제 차단 — 진짜 상호만 브랜딩, 아니면 '저희 샵'.
    if (_sn && _isRealShopName(_sn)) {
      opts.shop_name = _sn;   // 샵 이름(등록/인라인)은 시술 아님 — 별도 전달
      // 샵=가게이름(고객·시술명 아님) + 억지 반복 금지(많아야 한 번, 자연스럽게).
      opts.photo_context += ' · 상호(가게이름): ' + _sn + '(우리 가게 이름. 고객·시술명이 절대 아님. "' + _sn + ' 고객님"처럼 쓰지 말고, 게시글에 상호는 많아야 한 번만 자연스럽게, 매 문장 반복 금지)';
    } else {
      // 등록값이 placeholder(Dd 등)이거나 없음 → 상호 안 지어내고 '저희 샵'으로만.
      opts.extra_notes = '특정 가게 이름(상호)을 지어내거나 넣지 말고 필요하면 "저희 샵"으로만 칭할 것. ' + opts.extra_notes;
      opts.extra_notes = opts.extra_notes.slice(0, 300);
    }
    opts.content_type = d.tplPurpose || 'feed';
    opts.caption_intent = opts.caption_intent || 'generate';
    opts.strict_user_context = true;
    if (opts.caption_intent !== 'generate' && String(d.caption || '').trim()) {
      opts.previous_caption = String(d.caption).slice(0, 1200);   // 변형 시 직전 캡션 반복 방지
    }
    opts.variation_seed = opts.caption_intent + '-' + (d.regenSeq || 0) + '-' + Date.now();
    // [Step5] 다중 결과물/템플릿 요약(트레이스용 — 백엔드 스키마엔 photo_context/extra_notes 텍스트로만 반영).
    opts.selectedTemplateId = d.templateId || null;
    opts.templateOutputs = _outs.map(function (o) { return { pairId: o.pairId, templateId: o.templateId, beforePhotoId: o.beforePhotoId, afterPhotoId: o.afterPhotoId, pairLabel: o.pairLabel }; });
    opts.activeDisplayId = d.activeDisplayId || (_outs[0] && _outs[0].pairId) || null;
    // [v558/다양성 팩] 입력화면 말투 칩 → 생성 주입. 재생성 변형이 tone_override 를 명시하면 그 값 우선,
    //   아니면 d.capTone(친근/전문/감성/이벤트/후기)을 _resolveTone 로 안전 enum + extra_notes 로 변환.
    opts.length_tier = opts.length_tier || d.capLen || 'medium';
    d.capLen = opts.length_tier;
    if (!d.capTone) d.capTone = 'friendly';   // 칩 기본값(enum 으로 덮어쓰지 않고 칩 선택값 유지)
    if (!opts.tone_override) {
      var _tr = _resolveTone(d.capTone);
      opts.tone_override = _tr.tone;
      if (_tr.note) opts.extra_notes = (_tr.note + ' ' + String(opts.extra_notes || '')).slice(0, 300);
    }
    // [v567] 원장님 말투 반영 — 토글 ON + 인스타 연동(말투분석 소스 존재) 시에만 페르소나 반영.
    var _igConn = (window.WorkspaceAdapter && window.WorkspaceAdapter.instagram) ? window.WorkspaceAdapter.instagram().connected : false;
    opts.use_persona = (d.capUsePersona === true) && _igConn;
    window.WorkspaceAdapter.generateCaption(opts).then(function (r) {
      d.capLoading = false;
      // [버그수정] 그 사이 뒤로가기/재생성이 있었던 낡은 응답이면 d.caption/오버레이는 안 건드리지만,
      //   화면 갱신(setScreen)은 그대로 해서 로딩 스피너가 안 풀리고 멈춰버리는 회귀를 방지한다.
      if (_myToken !== _genToken) { setScreen('caption'); return; }
      if (r.ok) {
        var fresh = (r.hashtags || []).map(function (h) { return _fixTypos(h); })   // [v570·3] 태그 오타 백스톱
          .filter(function (h) { return !/(만원|천원|원짜리|짜리|가격|얼마|남친|여친|남자친구|여자친구)/.test(String(h)); });   // [#2] 가격·사담 파생 가비지 해시태그(#만원짜리 등) 제거
        // [#7] 시술 내용에 지역(OO동/OO구/OO역)이 있으면 지역 해시태그를 앞에 보강(백엔드 누락 백스톱).
        _locationTags(_pubSvc).forEach(function (t) { if (fresh.indexOf(t) < 0) fresh.unshift(t); });
        if (opts.hashtag_mode === 'more' && d.caption) {
          // [#3] '해시태그 더'/'더 가져오기' = 캡션 유지, 새 해시태그만 누적(중복 제거).
          var merged = (d.hashtags || []).slice();
          fresh.forEach(function (h) { if (merged.indexOf(h) < 0) merged.push(h); });
          var added = merged.length - (d.hashtags || []).length;
          d.hashtags = merged;
          d.selectedHashes = (d.selectedHashes && d.selectedHashes.length ? d.selectedHashes : []).slice();
          fresh.forEach(function (h) { if (d.selectedHashes.indexOf(h) < 0) d.selectedHashes.push(h); });
          if (label) toast(added > 0 ? label : '새 해시태그가 더 없어요');
        } else {
          // [v558] 해시태그 토글 OFF → 게시글에 해시태그 비표시(백엔드는 그대로 생성, 프론트에서만 숨김).
          if (d.capHashOn === false) fresh = [];
          d.caption = _scrubCaption(r.caption) + _shopCTA();   // [기능스티커] 저장된 예약링크·전화가 있으면 실제 CTA 로 캡션에 연결(피드 게시물에 그대로 노출)
          d.hashtags = fresh; d.selectedHashes = fresh.slice();   // [v566·scope7] 렌더 직전 상투/마크다운 제거
          // [v531] 캡션 입력→결과 최초 전환 시 history 마커 1개 push → 결과 화면에서 뒤로가기 = 캡션 입력 화면(편집 X).
          if (_wasEmpty) { navStack.push('caption'); _pushHist(); }
          // [#6] 꼬리말(captionTemplate)은 어댑터가 돌려주지 않으므로 여기서 덮어쓰지 않는다.
          //  (기존 'r.caption_template || ""' 는 재생성 때마다 사용자가 입력한 고정 꼬리말을 빈값으로 지우는 회귀였음)
          if (r.caption_template != null) d.captionTemplate = r.caption_template;
          if (label) toast(label);
        }
        d.logId = r.log_id || d.logId || null;
      } else { toast(r.toast || '게시글 생성에 실패했어요'); }
      // [보스요청 2026-07-12] 생성 후 인스타 미리보기 자동 점프 제거 — 캡션 결과 화면(사진 편집·캡션 직접 수정)에
      //   머물고, 원장이 하단 '인스타 미리보기로' CTA 를 눌러야 preview 로 이동.
      setScreen('caption');
    }).catch(function (e) {
      // [audit] 생성 실패(네트워크/예외) 시 로딩에 갇히지 않게 복구 — 예전엔 catch 없어 capLoading 이 true 로 남아 이후 생성이 영구 차단됐음.
      d.capLoading = false;
      console.warn('[wsv2flow] generateCaption failed', e);
      // [버그수정] 낡은 요청의 실패 토스트는 생략하되, 화면 갱신은 그대로(로딩 스피너 고착 방지).
      if (_myToken !== _genToken) { setScreen('caption'); return; }
      toast('게시글 생성에 실패했어요 — 네트워크를 확인하고 다시 시도해 주세요');
      setScreen('caption');
    });
  }

  /* ── 이벤트 ── */
  function bind() {
    el.addEventListener('click', function (e) {
      var t = e.target;
      var act = t.closest('[data-fl]'); var a = act && act.getAttribute('data-fl');
      if (a === 'back') { return back(); }
      if (a === 'cta') { return onCta(); }
      // [S4] 레이아웃 화면 전용(dellayout·layoutpick·trayph·savelayout·skiplayout)은 layout.handleClick 로 이관 — 아래 스텝 위임에서 처리됨.
      // [v560] 편집 화면 우측 CTA — 현재 보정 굽고 '템플릿 선택' 화면으로.
      if (a === 'cta2') { return bakeEdit().then(function () { setScreen('template'); }); }
      // [refactor S4] 스텝 전용 클릭 핸들러 위임 — 현재 스텝(STEP_FX[cur])이 처리하면 종료. 스텝 제거 시 핸들러도 함께 제거(고아 방지).
      //   버튼이 해당 스텝 화면(render)에서만 렌더되는 '스텝 전용'만 이관(공유 핸들러는 아래 인라인 유지).
      var _fx4 = STEP_FX[cur]; if (_fx4 && _fx4.handle && _fx4.handle(t, a, e) === true) return;
      // [refactor S5] 고아 핸들러 제거 — 렌더러(data-fl="…")가 없어 어떤 클릭으로도 도달 불가(전 코드베이스 기계 확인).
      //   batoggle·gen·regen(=cgen/data-fl-var 로 대체됨)·toconnect·topreview(오배선)·sharepreview·roles·applydefault·tplchange(=tplchange-active)·publishstory/storypick(스토리 발행 세트). HYPER 재설계로 버튼 소멸, 핸들러만 잔존했던 쓰레기코드.
      // [cleanup] footersave/footerclear·clen·chash·cpersona 핸들러 제거 — 레거시 캡션 UI(SIMPLE_FLOW=false) 삭제로 렌더러 사라져 도달 불가.
      if (a === 'storyedit') { flushCaptionInputs(); return _openStoryEditor(); }
      if (a === 'crop') { return openCropFlow(); }
      // [v568·B-1] 전체화면 편집 — body 클래스로 .ed-photo-vp 를 화면 가득. ESC/버튼으로 닫기. 토글 후 마스크 재투영.
      if (a === 'edfull') {
        d.edFull = !d.edFull;
        try { document.body.classList.toggle('itd-edit-fs', !!d.edFull); } catch (_ef) { void _ef; }
        _renderVpTools();
        setTimeout(function () { if (d.maskPaint || d.maskView) _renderMaskOverlay(); _applyZoomTransform(); }, 60);
        return;
      }
      if (a === 'edzoomfit') { d.zoom = { s: 1, tx: 0, ty: 0 }; _applyZoomTransform(); return; }
      if (a === 'edzoomin') { d.zoom = d.zoom || { s: 1, tx: 0, ty: 0 }; d.zoom.s = Math.min(4, (d.zoom.s || 1) + 0.5); _applyZoomTransform(); return; }
      if (a === 'edzoomout') { d.zoom = d.zoom || { s: 1, tx: 0, ty: 0 }; d.zoom.s = Math.max(1, (d.zoom.s || 1) - 0.5); if (d.zoom.s === 1) { d.zoom.tx = 0; d.zoom.ty = 0; } _applyZoomTransform(); return; }
      // [refactor S5] 'roles' 핸들러 제거 — data-fl="roles" 렌더러 없음(전·후 확인은 템플릿 화면으로 이동, data-fl-setrole 사용). 도달 불가.
      // [v561] 직접 칠하기(수동 마스크) — 자동 인식이 틀릴 때 원장님이 부위를 직접 칠해 교정.
      if (a === 'maskpaint') {
        d.maskPaint = !d.maskPaint;
        if (d.maskPaint) { d.maskView = false; d.maskErase = false; }
        _setEditSection('[data-ed-adv]', _advFoldHtml()); _renderVpTools();
        if (d.maskPaint) { _ensurePaintDims(function () { _renderPaintOverlay(); }); toast(_maskInfoForTab().label + ' 영역을 칠해 교정하세요'); }
        else { _renderMaskOverlay(); }
        return;
      }
      if (a === 'paintdraw') { d.maskErase = false; _setEditSection('[data-ed-adv]', _advFoldHtml()); _renderVpTools(); return; }
      if (a === 'painterase') { d.maskErase = true; _setEditSection('[data-ed-adv]', _advFoldHtml()); _renderVpTools(); return; }
      if (a === 'paintclear') {
        var _pc = _getPaintCanvas(curEditPhoto(), _maskTypeForPaint(), false);
        if (_pc) { _pc.getContext('2d').clearRect(0, 0, _pc.width, _pc.height); _pc._inked = false; }
        _renderPaintOverlay(); if (_hasValues(d.beauty)) _refreshPreview();
        toast('칠한 영역을 비웠어요'); return;
      }
      if (a === 'tplrelease') { return releaseTemplate(); }
      // [refactor S5] 'applydefault'('기본 템플릿 적용하기') 핸들러 제거 — data-fl="applydefault" 렌더러 없음. 도달 불가한 고아.
      var setdef = t.closest('[data-fl-setdefault]'); if (setdef) {
        // [v531] '기본으로 설정' — 이 템플릿을 해당 유형 기본으로 저장(localStorage, 홈 카드/적용에 반영).
        var _sk = setdef.getAttribute('data-fl-setdefault'); var _st = _tplByKey(_sk); if (!_st) return;
        var _ok = window.WorkspaceDefaultTpl && window.WorkspaceDefaultTpl.set(_purposeCat(_st.purpose), _st.id);
        toast(_ok ? (_st.label + '을(를) 기본 템플릿으로 설정했어요') : '기본 템플릿 저장에 실패했어요');
        _renderTplSection();
        return;
      }
      // [refactor S5] 'tplchange'('전체 바꾸기') 핸들러 제거 — data-fl="tplchange" 렌더러 없음(현행 UI는 data-fl="tplchange-active"). 도달 불가.
      // [v532] 짝별 '템플릿 바꾸기' — 이 짝만 타깃으로 잡고 갤러리 오픈. 다음 카드 선택은 이 짝만 교체.
      var tplpair = t.closest('[data-fl-tplpair]'); if (tplpair) {
        d.tplTargetPair = tplpair.getAttribute('data-fl-tplpair');
        var _outs0 = d.templateOutputs || [];
        var _idx0 = -1; for (var _pi = 0; _pi < _outs0.length; _pi++) { if (_outs0[_pi].pairId === d.tplTargetPair) { _idx0 = _pi; break; } }
        d.tplOpen = true; _renderTplSection();
        var grid2 = el.querySelector('[data-ed-tpl] .tpl-grid2'); if (grid2 && grid2.scrollIntoView) grid2.scrollIntoView({ block: 'center' });
        toast('이 디자인을 고르면 Pair ' + (_idx0 >= 0 ? _idx0 + 1 : '') + ' 결과만 바뀌어요 (다른 짝은 그대로)');
        return;
      }
      // [v534] 짝별 '템플릿 수정' — 텍스트 레이어 편집 시트 오픈(이 짝만 반영).
      var tpledit = t.closest('[data-fl-tpledit]'); if (tpledit) { return _openTplEdit(tpledit.getAttribute('data-fl-tpledit')); }
      if (a === 'tpleditactive') { return _openTplEdit(d.activeDisplayId || (d.templateOutputs && d.templateOutputs[0] && d.templateOutputs[0].pairId)); }
      // [v541] 결과 캐러셀 — 현재 보고 있는 Pair 기준 '템플릿 바꾸기'/'템플릿 수정'(기존 짝별 로직 재사용).
      if (a === 'tplchange-active') {
        var _apc = _activeOutputPair(); if (!_apc) { toast('바꿀 결과물을 찾지 못했어요'); return; }
        d.tplTargetPair = _apc;
        var _ocs = d.templateOutputs || []; var _ci = -1; for (var _cj = 0; _cj < _ocs.length; _cj++) { if (_ocs[_cj].pairId === _apc) { _ci = _cj; break; } }
        d.tplOpen = true; _renderTplSection();
        var _g = el.querySelector('[data-ed-tpl] .tpl-grid2'); if (_g && _g.scrollIntoView) _g.scrollIntoView({ block: 'center' });
        toast('이 디자인을 고르면 Pair ' + (_ci >= 0 ? _ci + 1 : '') + ' 결과만 바뀌어요 (다른 짝은 그대로)');
        return;
      }
      if (a === 'tpledit-active') { var _ape = _activeOutputPair(); if (!_ape) { toast('수정할 결과물을 찾지 못했어요'); return; } return _openTplEdit(_ape); }
      // [요청7 2026-07-13] feedplan 액션 제거 — 인플로우 '피드 정렬해보기'(현작업만) 폐지. 피드 정렬은 작업실 홈 진입으로 이관.
      // [통합 2026-07-14] 버튼 하나 → 장수에 따라 feed/carousel 자동. (publishcarousel 은 레거시 경로로 유지)
      if (a === 'publish') { return publish(_publishKind()); }
      // [cleanup] publishstory/storypick/storypickcancel 제거 — 진입 버튼 없어 도달 불가였던 스토리 발행 세트. 발행은 피드/여러 장(carousel)만.
      if (a === 'publishcarousel') { return publish('carousel'); }
      if (a === 'copycap') { flushCaptionInputs(); window.WorkspaceAdapter && window.WorkspaceAdapter.copyText((d.caption || '') + (d.hashtags.length ? '\n\n' + d.hashtags.join(' ') : '')); _markPrepared(); return; }   // [#6] copyText 가 이미 토스트 → 중복 토스트 제거(두 개 쌓여 ~5초 떠있던 문제)
      if (a === 'saveimg') { window.WorkspaceAdapter && window.WorkspaceAdapter.saveImage(outputUrl(), d.service || 'itdasy'); _markPrepared(); _askPublishedSheet(); return; }   // [v547] 저장 후 게시 확인 sheet
      if (a === 'pubnot') { return _closePublishSheet(); }
      if (a === 'pubdone') { return _markPublishedNow(); }
      if (a === 'igconnect') { window.WorkspaceAdapter && window.WorkspaceAdapter.connectInstagram(); return; }

      if (t.closest('[data-fl-pick]')) { el.querySelector('[data-fl-file]').click(); return; }
      var del = t.closest('[data-fl-del]'); if (del) { e.stopPropagation(); d.photos.splice(+del.getAttribute('data-fl-del'), 1); reassignRoles(); setScreen('upload'); return; }
      var roleBtn = t.closest('[data-fl-setrole]'); if (roleBtn) { e.stopPropagation(); var _pr = roleBtn.getAttribute('data-fl-setrole').split(':'); _setRole(+_pr[0], _pr[1]); if (cur === 'template') _rerenderTemplate(); else if (d.rolesOpen) _setEditSection('[data-ed-adv]', _advFoldHtml()); return; }
      // [#2] 타일 탭 = 선택/해제 토글. 역할/삭제 버튼은 위에서 이미 처리됨.
      var upTile = t.closest('[data-fl-tile]'); if (upTile && cur === 'upload') { e.stopPropagation(); _toggleSelect(+upTile.getAttribute('data-fl-tile')); return; }
      if (t.closest('[data-fl-edphoto]')) { return; }
      // [perf] 버튼 탭은 해당 섹션만 갱신 — 전체 편집화면(템플릿 6칸 대용량 dataURL) 재생성 안 함.
      // [v554] 'adv'(정밀 조정) 토글 분기 제거 — 항상 펼침이라 접기 동작 없음. bg/tpl 토글은 유지.
      var fold = t.closest('[data-fl-fold]'); if (fold) { var fk = fold.getAttribute('data-fl-fold'); if (fk === 'bg') { d.bgOpen = !d.bgOpen; _setEditSection('[data-ed-basic]', _mainAdjustHtml()); } else if (fk === 'tpl') { d.tplOpen = !d.tplOpen; _renderTplSection(); } return; }
      var edsel = t.closest('[data-fl-editsel]'); if (edsel) { return switchEditPhoto(+edsel.getAttribute('data-fl-editsel')); }
      var edswipe = t.closest('[data-fl-edswipe]'); if (edswipe) { return _stepEditPhoto(edswipe.getAttribute('data-fl-edswipe') === 'next' ? 1 : -1); }   // [v550] PC 화살표
	      var basictool = t.closest('[data-fl-basictool]'); if (basictool) { d.basicTool = basictool.getAttribute('data-fl-basictool'); _setEditSection('[data-ed-basic]', _mainAdjustHtml()); return; }
	      var edtab = t.closest('[data-fl-edtab]'); if (edtab) { d.editTab = edtab.getAttribute('data-fl-edtab'); d.control = null; _setEditSection('[data-ed-adv]', _advFoldHtml()); _renderVpTools(); if (d.maskView || d.maskPaint) _renderMaskOverlay(); return; }
	      var beautytool = t.closest('[data-fl-beautytool]'); if (beautytool) { d.precTool = beautytool.getAttribute('data-fl-beautytool'); _setEditSection('[data-ed-adv]', _advFoldHtml()); return; }
	      var edtool = t.closest('[data-fl-edtool]'); if (edtool) { d.control = edtool.getAttribute('data-fl-edtool'); _setEditSection('[data-ed-adv]', _advFoldHtml()); return; }
      if (t.closest('[data-fl-bgpick]')) { el.querySelector('[data-fl-bgfile]').click(); return; }
      var bgb = t.closest('[data-fl-bg]'); if (bgb) { return applyBg(bgb.getAttribute('data-fl-bg')); }
      var bgc = t.closest('[data-fl-bgcolor]'); if (bgc) { d.bgColor = bgc.getAttribute('data-fl-bgcolor'); return applyBg('color'); }
      var eb = t.closest('[data-fl-eb]'); if (eb) { return _editBottom(eb.getAttribute('data-fl-eb')); }
      // [refactor S4] 고객 선택(data-fl-cust) 핸들러는 connect.handleClick 로 이관 — 위 스텝 전용 위임에서 처리됨.
      // [v568·B-5] 사진 캐러셀 화살표 / 점 — 한 칸씩 또는 지정 사진으로 스크롤(스냅).
      var tplnav = t.closest('[data-fl-tplnav]'); if (tplnav) { _tplScrollBy(+tplnav.getAttribute('data-fl-tplnav')); return; }
      var tpldot = t.closest('[data-fl-tpldot]'); if (tpldot) { _tplScrollTo(+tpldot.getAttribute('data-fl-tpldot')); return; }
      var tplpick = t.closest('[data-fl-tplpick]'); if (tplpick) { _pickTplRole(tplpick.getAttribute('data-fl-tplpick')); return; }   // [v562·항목3] 클릭순 전/후
      var tplchip = t.closest('[data-fl-tplchip]'); if (tplchip) { d.tplCat = tplchip.textContent.trim(); if (cur === 'template') _rerenderTemplate(); else _renderTplSection(); return; }
	      // [v542] 보정 디버그 — 0/50/100 즉시 적용(실제 프리뷰) + 현재값 복사
	      var fxv = t.closest('[data-fl-fxv]'); if (fxv) {
	        var _fk = _activePrecKey(); if (!_fk) return;
	        var _fv = +fxv.getAttribute('data-fl-fxv'); d.beauty[_fk] = _fv;
	        var _inp = el.querySelector('[data-ed-adv] [data-fl-beautyrange="' + _fk + '"]'); if (_inp) _inp.value = _fv;
	        _setEditSection('[data-ed-adv]', _advFoldHtml()); _refreshPreview();
	        if (d.maskView) _renderMaskOverlay();
	        return;
	      }
	      if (a === 'fxcopy') {
	        var _ck = _activePrecKey(); if (!_ck) return;
	        var _cv = (d.beauty && d.beauty[_ck]) || 0;
	        // [v545] 실제 슬라이더 value 로 측정(0 포함) — 과거 _cv||50 버그로 0/50 동일 delta 찍히던 것 수정.
	        _measureFx(_ck, _cv, function (m) {
	          var log = 'effect=' + _ck + '\nuiKey=' + _ck + '\nengineKey=' + _ck + '\nmask=' + (_FX_MASK[_ck] || '-') +
	            '\nmaskType=' + (m ? (m.hasMask ? 'native' : 'fallback') : '-') + '\nfallbackUsed=' + (m ? m.fallbackUsed : '-') +
	            '\ncoverage=' + (m && m.coverage != null ? m.coverage : '-') +
	            '\nvalue=' + _cv + '\nnorm=' + (_cv / 100).toFixed(2) + '\nnoop=' + (m ? m.noop : (_cv === 0)) +
	            '\ntargetDelta=' + (m ? m.target : '-') + '\noutsideDelta=' + (m ? m.outside : '-') +
	            '\ntime=' + (m ? m.time : (window.__photofxLast || {}).time || '-') + 'ms' +
	            '\ntuningMultiplier=' + (_FX_MULT[_ck] != null ? _FX_MULT[_ck] : '-') +
	            '\nhasMask=' + (m ? m.hasMask : '-') + '\nbuild=' + (window.APP_BUILD || '-');
	          try { console.log('[photofx:copy]\n' + log); } catch (_e) { void _e; }
	          try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(log); } catch (_e2) { void _e2; }
	          toast('현재값을 복사했어요 (콘솔에도 출력)');
	        });
	        return;
	      }
	      // [v541] 확대 미리보기 시트 액션
	      if (t.closest('[data-fl-tppclose]')) { return _closeTplPreview(); }
	      var tppApply = t.closest('[data-fl-tppapply]'); if (tppApply) { _closeTplPreview(); return applyTemplate(tppApply.getAttribute('data-fl-tppapply')); }
	      var tppDef = t.closest('[data-fl-tppdef]'); if (tppDef) {
	        var _dk = tppDef.getAttribute('data-fl-tppdef'); var _dt = _tplByKey(_dk); if (!_dt) return;
	        var _dok = window.WorkspaceDefaultTpl && window.WorkspaceDefaultTpl.set(_purposeCat(_dt.purpose), _dt.id);
	        toast(_dok ? (_dt.label + '을(를) 기본 템플릿으로 설정했어요') : '기본 템플릿 저장에 실패했어요');
	        _renderTplSection(); _closeTplPreview(); return;
	      }
	      var tpl = t.closest('[data-fl-tpl]'); if (tpl) {
	        if (_lpAt && Date.now() - _lpAt < 700) return;
	        var _tk0 = tpl.getAttribute('data-fl-tpl');
	        // [v565·scope3] 이미 결과물이 있는 상태에서 카드 재선택 = '현재 active 결과 1장만' 교체.
	        //   타깃 미지정 + 전후 다중 결과면 active pair 로 한정(초기 적용은 결과물이 없어 전체에 적용됨).
	        var _tko = _tplByKey(_tk0);
	        if (!d.tplTargetPair && _tko && _tko.purpose === 'before_after'
	            && d.tplPurpose === 'before_after' && d.templateOutputs && d.templateOutputs.length) {
	          d.tplTargetPair = _activeOutputPair();
	        }
	        return applyTemplate(_tk0);
	      }
      // [다중pair] 캡션 결과물 캐러셀 — 좌우 화살표/dot 으로 active 결과물 전환(부분 갱신).
      // [v564·필수3] 템플릿 결과 카드 ↔ 원본 전/후 2장 토글
      var tplexp = t.closest('[data-fl-tplexpand]'); if (tplexp) { _togglePairExpand(tplexp.getAttribute('data-fl-tplexpand'), true); return; }
      var tplcol = t.closest('[data-fl-tplcollapse]'); if (tplcol) { _togglePairExpand(tplcol.getAttribute('data-fl-tplcollapse'), false); return; }
      var cardot = t.closest('[data-fl-cardot]'); if (cardot) { return _carSet(cardot.getAttribute('data-fl-cardot')); }
      // [v559] 인라인 결과 pair chip — 활성 pair 전환 후 결과 섹션만 갱신(별도 carousel 스크롤 없음).
      var psel = t.closest('[data-fl-pairsel]'); if (psel) { d.activeDisplayId = psel.getAttribute('data-fl-pairsel'); _rerenderTplResult(); return; }
      var pstep = t.closest('[data-fl-pairstep]'); if (pstep) { _stepPair(pstep.getAttribute('data-fl-pairstep') === 'next' ? 1 : -1); return; }
      // [v532] 추천 해시태그 칩 제거 — 해시태그 토글 핸들러도 함께 삭제(편집은 textarea 직접 입력으로 일원화).
      // [v558] 캡션 입력화면 칩/토글/생성 — 말투/길이/해시태그 선택 + 단일 생성 버튼.
      var ct = t.closest('[data-fl-ctone]'); if (ct) { d.capTone = ct.getAttribute('data-fl-ctone'); setScreen('caption'); return; }
      var csi = t.closest('[data-fl-cshopinfo]'); if (csi) { try { localStorage.setItem('itdasy:caption_shopinfo', _shopInfoOn() ? '0' : '1'); } catch (_e) { void _e; } toast(_shopInfoOn() ? '샵정보를 글 끝에 넣을게요' : '샵정보 반영을 껐어요'); setScreen('caption'); return; }   // [#19] 샵정보 opt-in 토글
      // [v567] 원장님 말투 반영 토글 — 인스타 미연동이면 안내 후 무시(데이터 없는 반영 금지).
      // [Phase A-2] 우리샵 스타일 적용 토글 — 생성 직전 syncServiceFromDom 으로 입력 보존 후 재렌더.
      var css = t.closest('[data-fl-cshopstyle]'); if (css) { syncServiceFromDom(); d.useShopStyle = !(d.useShopStyle !== false); setScreen('caption'); return; }
      var bc = t.closest('[data-fl-brandcolor]'); if (bc) { syncServiceFromDom(); _applyBrandColor(bc.getAttribute('data-fl-brandcolor')); return; }   // [v591·#6] 추천색 적용
      // [#6] 우리샵 스타일 전환/생성
      var sp = t.closest('[data-fl-stylepick]'); if (sp) { syncServiceFromDom(); try { window.ShopStyle.setActive(sp.getAttribute('data-fl-stylepick')); } catch (_sp) { void _sp; } (d.photos || []).forEach(function (p) { p._tplSig = null; }); toast('우리샵 스타일을 바꿨어요'); setScreen('caption'); return; }
      var sn = t.closest('[data-fl-stylenew]'); if (sn) { syncServiceFromDom(); try { var _ns = window.ShopStyle.list().length + 1; var _abc = '우리샵 스타일 ' + String.fromCharCode(64 + _ns); window.ShopStyle.create({ name: _abc }, true); } catch (_sn) { void _sn; } (d.photos || []).forEach(function (p) { p._tplSig = null; }); toast('새 스타일을 만들었어요'); setScreen('caption'); return; }
      var prn = t.closest('[data-fl-presetrename]'); if (prn) { _renamePreset(prn.getAttribute('data-fl-presetrename')); return; }   // [#7] 프리셋 이름 변경
      var pcp = t.closest('[data-fl-presetcopy]'); if (pcp) { _copyPreset(pcp.getAttribute('data-fl-presetcopy')); return; }   // [#7] 복사해서 수정
      var pa = t.closest('[data-fl-preset]'); if (pa) { _applyPreset(pa.getAttribute('data-fl-preset')); return; }   // [#14] 레이아웃 프리셋 A/B/C
      var bf = t.closest('[data-fl-brandfont]'); if (bf) { syncServiceFromDom(); _applyBrandFont(bf.getAttribute('data-fl-brandfont')); return; }   // [#6] 브랜드 폰트
      var hm = t.closest('[data-fl-harmony]'); if (hm) { syncServiceFromDom(); _applyHarmony(hm.getAttribute('data-fl-harmony')); return; }   // [P2-3] 색·폰트 어울림 조합
      var apb = t.closest('[data-fl-autopretty]'); if (apb) { syncServiceFromDom(); _autoPretty(); return; }   // [P3-1] 알아서 예쁘게
      var stb = t.closest('[data-fl-shoptype]'); if (stb) { _setShopType(stb.getAttribute('data-fl-shoptype')); return; }   // [P3-2] 업종
      var lc = t.closest('[data-fl-logoclear]'); if (lc) { _clearBrandLogo(); return; }   // [#6] 로고 빼기
      var cfm = t.closest('[data-cfm]'); if (cfm) { syncServiceFromDom(); _editCapOverride(cfm.getAttribute('data-cfm')); return; }   // [P1-1] 확인칩 ✎
      // [캡션재설계] 3축 위저드 — 버튼 누르면 그 축 저장 + 다음 질문. 시술 입력은 유지(syncServiceFromDom).
      var wp = t.closest('[data-fl-wizpick]'); if (wp) {
        syncServiceFromDom();
        var _pv = wp.getAttribute('data-fl-wizpick').split('::'); var _wk = _pv[0], _wv = _pv[1];
        // [직접] 인라인 입력창 대신 → 그냥 다음 단계로. 마지막 단계에서 '직접'이면 아래 시술 입력창으로 포커스(직접 작성).
        if (_wv === '직접') {
          d._wizCustom = null; d._wizDir = 'fwd';
          var _isLast = (d.capWizStep || 0) >= (_WIZ_STEPS.length - 1);
          if (d.captionAxes) delete d.captionAxes[_wk];   // 직접 작성할 축은 비워둠(자유 서술)
          d.capWizStep = Math.min(3, (d.capWizStep || 0) + 1);
          setScreen('caption');
          if (_isLast) { setTimeout(function () { var _svc = el && el.querySelector('[data-fl-service]'); if (_svc) { try { _svc.focus(); _svc.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_e) { void _e; } } }, 220); }
          return;
        }
        d.captionAxes = d.captionAxes || {}; d.captionAxes[_wk] = _wv;
        d._wizCustom = null;
        d.capWizStep = Math.min(3, (d.capWizStep || 0) + 1);
        d._wizDir = 'fwd';
        // [#3] 누른 버튼을 잠깐 '활성'으로 보여준 뒤 부드럽게 다음 단계로 슬라이드(즉시 넘어가 활성감 안 보이던 것).
        wp.classList.add('capwiz__opt--picked');
        setTimeout(function () { if (cur === 'caption') setScreen('caption'); }, 170);
        return;
      }
      // [직접 입력] 인라인 확인 → 값 반영 후 다음 단계. 빈값이면 무시.
      var wco = t.closest('[data-fl-wizcustok]'); if (wco) { _wizCustomConfirm(); return; }
      var wcc = t.closest('[data-fl-wizcustcancel]'); if (wcc) { d._wizCustom = null; d._wizDir = 'back'; setScreen('caption'); return; }
      var wbk = t.closest('[data-fl-wizback]'); if (wbk) { syncServiceFromDom(); d._wizCustom = null; d.capWizStep = Math.max(0, (d.capWizStep || 0) - 1); d._wizDir = 'back'; setScreen('caption'); return; }
      var wrd = t.closest('[data-fl-wizredo]'); if (wrd) { syncServiceFromDom(); d.capWizStep = 0; d.captionAxes = {}; d._wizCustom = null; d._wizDir = 'back'; setScreen('caption'); return; }
      var svtt = t.closest('[data-fl-svctypetoggle]'); if (svtt) { syncServiceFromDom(); d.svcTypeOpen = !d.svcTypeOpen; setScreen('caption'); return; }
      var svty = t.closest('[data-fl-svctype]'); if (svty) { syncServiceFromDom(); try { localStorage.setItem('shop_type', svty.getAttribute('data-fl-svctype')); } catch (_es) { void _es; } d.svcTypeOpen = false; setScreen('caption'); return; }
      var svrec = t.closest('[data-fl-svcrecent]'); if (svrec) { var _rv = svrec.getAttribute('data-fl-svcrecent'); var _si = el && el.querySelector('[data-fl-service]'); d.service = _rv; if (_si) { _si.value = _rv; try { _si.dispatchEvent(new Event('input', { bubbles: true })); } catch (_e) { void _e; } } return; }   // [P4·보스] 최근 시술 → 입력창만 제자리 채움(setScreen 재렌더 제거 → 스크롤 안 튐)
      var svtag = t.closest('[data-fl-svctag]'); if (svtag) { _appendServiceTag(svtag.getAttribute('data-fl-svctag')); return; }
      var svtadd = t.closest('[data-fl-svctagadd]'); if (svtadd) { _addSvcKeyword(); return; }
      var cg = t.closest('[data-fl-cgen]'); if (cg) { return _triggerCaptionGenerate(null); }
      // [C4] 재생성 버튼: data-fl-var="regen|short|long"
      var vv = t.closest('[data-fl-var]'); if (vv) {
        var vk = vv.getAttribute('data-fl-var');
	        if (vk === 'short') { return doGenerate({ length_tier: 'short', caption_intent: 'rewrite', _regen: true }, '짧게 다시 생성했어요'); }
	        if (vk === 'long')  { var _nl = (d.capLen === 'long' || d.capLen === 'max') ? 'max' : 'long'; return doGenerate({ length_tier: _nl, caption_intent: 'longer', _regen: true }, _nl === 'max' ? '아주 길게 다시 생성했어요' : '길게 다시 생성했어요'); }
	        if (vk === 'reset') { d.caption = ''; d.hashtags = []; d.selectedHashes = []; d.capLen = 'medium'; d.capTone = 'friendly'; d.regenSeq = 0; d.captionMode = (d.tplPurpose === 'review') ? 'review' : 'normal'; d.logId = null; setScreen('caption'); toast('게시글을 초기화했어요 (사진은 그대로예요)'); return; }
	        /* [v532] 'hashtags'(더 가져오기) 케이스 제거 — 추천 칩/더가져오기 UI 삭제로 더 이상 트리거 없음. */
	        // [v532] '인스타 톤' = 백엔드 tone_override enum 의 'ornate'(풍부·SNS 감성)로 매핑. 기존 'instagram' 은 enum(plain/normal/ornate)에 없어 422 → '캡션 생성 실패' 의 직접 원인.
		        if (vk === 'insta') { return doGenerate({ tone_override: 'ornate', caption_intent: 'instagram', _regen: true }, '인스타 톤으로 다시 생성했어요'); }
	        return doGenerate({ caption_intent: 'rewrite', _regen: true }, '게시글을 다시 생성했어요');
	      }
      var seg = t.closest('[data-fl-seg]'); if (seg) { d.capSeg = seg.getAttribute('data-fl-seg'); setScreen('caption'); if (d.capSeg === 'write') { var bd = el.querySelector('[data-fl-igcap],[data-fl-capbody]'); if (bd) bd.focus(); } return; }
    });
    el.querySelector('[data-fl-file]').addEventListener('change', function (e) {
      var files = Array.from(e.target.files || []); e.target.value = '';
      if (!files.length) return;
	      addFiles(files, true);
	    });
    el.querySelector('[data-fl-bgfile]').addEventListener('change', function (e) {
      var f = (e.target.files || [])[0]; e.target.value = '';
      if (!f) return;
      var r = new FileReader();
      r.onload = function () { d.customBg = r.result; d.customBgName = f.name || '내 배경'; applyBg('image'); };
      r.onerror = function () { toast('배경 이미지를 불러오지 못했어요'); };
      r.readAsDataURL(f);
    });
	    el.addEventListener('input', function (e) {
	      if (e.target.matches('[data-fl-usertags]')) {   // [계정 태그] @아이디 파싱 → d.igUserTags
	        d.igUserTags = String(e.target.value || '').split(/[,\s]+/).map(function (s) { return s.replace(/^@/, '').trim(); }).filter(Boolean).slice(0, 20);
	        return;
	      }
	      if (e.target.matches('[data-fl-range]')) {
        var k = e.target.getAttribute('data-fl-range'); d.adjust[k] = +e.target.value;
        var p = el.querySelector('[data-fl-edphoto]');
        var _cep = curEditPhoto();
        var _hasBg = !!(_cep && _cep.bgSpec && _cep.fgCutout);
        if (_hasBg) {
          // [v559] 누끼+배경: 드래그 중에도 인물(fgCutout)에만 보정 — throttle 재합성(배경 불변).
          //   cheap CSS 는 합성본 전체를 필터링해 배경까지 밝아지던 문제(손 떼면 _refreshPreview 가 교정하던 것을 드래그 중에도 일치시킴).
          _throttleRefreshPreview();
        } else if (p && !d.originalPreview) {
          // 누끼 없는 사진: 기존 cheap CSS 필터(부드러움) 유지.
          d.previewUrl = null; p.style.backgroundImage = 'url(' + esc(photoUrl(_cep)) + ')'; p.style.filter = filterCss(d.adjust);
        }
	      }
	      if (e.target.matches('[data-fl-beautyrange]')) {
	        // 정밀(부위) 보정: 무거운 픽셀 연산은 손 뗄 때(change)만 — 드래그 중 점멸/끊김 방지.
	        var bk = e.target.getAttribute('data-fl-beautyrange'); d.beauty[bk] = +e.target.value;
	      }
	      if (e.target.matches('[data-fl-brush]')) { d.maskBrush = +e.target.value; return; }   // [v561] 붓 크기
      if (e.target.matches('[data-fl-capbody]')) { d.caption = e.target.value; var cc = el.querySelector('[data-fl-capcount]'); if (cc) cc.textContent = (d.caption || '').length; }
      if (e.target.matches('[data-fl-footer]')) { d.captionTemplate = e.target.value; }
      if (e.target.matches('[data-fl-service]')) { d.service = e.target.value; d.capShopOverride = null; d.capCustOverride = null; _refreshCapConfirm(); }   // [P1-1] 입력 바뀌면 오버라이드 해제+확인칩 갱신
      if (e.target.matches('[data-fl-custsearch]')) { d.custQuery = e.target.value; }
    });
    el.addEventListener('focusin', function (e) {
      // 보정·정밀 슬라이더 모두 한 스냅샷(adjust+beauty)으로 묶어 되돌리기/다시실행 일원화.
      if (e.target.matches('[data-fl-range],[data-fl-beautyrange]')) { if (!d._editPrev) d._editPrev = _snapEdit(); }
	      if (e.target.matches('[data-fl-capbody]') && e.target.getAttribute('data-empty') === '1') { e.target.value = ''; e.target.removeAttribute('data-empty'); e.target.style.color = ''; }
	    });
    el.addEventListener('change', function (e) {
      // [#6 브랜드킷] 로고 파일 선택 → 활성 스타일에 등록
      var lg = e.target.closest && e.target.closest('[data-fl-logoadd]');
      if (lg && lg.files && lg.files[0]) { _brandLogoFromFile(lg.files[0], function (url) { _setBrandLogo(url); }); lg.value = ''; return; }
      if (e.target.matches('[data-fl-range],[data-fl-beautyrange]')) {
        if (d._editPrev) { d.undo = d.undo || []; d.undo.push(d._editPrev); if (d.undo.length > 30) d.undo.shift(); d.redo = []; d._editPrev = null; }
	        // 손 뗄 때 한 번만 실픽셀 확정 + 되돌리기/다시실행 버튼 상태 갱신(전체 재렌더 없이).
	        _refreshPreview();
	        _syncEbState();
	        // [v559] 전후 템플릿 적용 중이면 보정 결과를 합성 결과에도 반영(디바운스 — _refreshPreview 가 previewUrl 채운 뒤 재합성).
	        if (d.templateId && d.tplPurpose === 'before_after') { if (d._recDeb) clearTimeout(d._recDeb); d._recDeb = setTimeout(_recompositeActivePair, 450); }
	      }
	    });
    _bindZoom();
    _bindPaint();   // [v561] 직접 칠하기(수동 마스크) 포인터 바인딩
    _bindEditResize();   // [v567] 리사이즈/전체화면 시 마스크 overlay 재투영(이미지좌표 보존)
    _bindTplResultSwipe();   // [v561·항목4] 다중 결과물 좌우 스와이프
    _bindTplLongPress();   // [v541] 템플릿 썸네일 long press 확대 미리보기
    _bindTplCarousel();   // [v568·B-5] 사진 캐러셀 PC 드래그 + 점 활성 동기화
  }

  // [v568·B-5] 사진 캐러셀 — 한 칸(슬라이드 폭)씩 스크롤 / 지정 인덱스로 이동 / 점 활성 동기화.
  function _tplStripEl() { return el && el.querySelector('[data-fs="template"] [data-fl-tplstrip], [data-fs="edit"] [data-fl-tplstrip]'); }
  function _tplSlideStep(strip) { var sl = strip.querySelector('.tpls-slide'); return sl ? (sl.getBoundingClientRect().width + 10) : strip.clientWidth; }
  function _tplScrollBy(dir) { var s = _tplStripEl(); if (!s) return; var left = s.scrollLeft + dir * _tplSlideStep(s); if (s.scrollTo) s.scrollTo({ left: left, behavior: 'smooth' }); else s.scrollLeft = left; }
  function _tplScrollTo(i) { var s = _tplStripEl(); if (!s) return; var left = i * _tplSlideStep(s); if (s.scrollTo) s.scrollTo({ left: left, behavior: 'smooth' }); else s.scrollLeft = left; }
  function _tplSyncDots() {
    var s = _tplStripEl(); if (!s) return;
    var dots = el.querySelectorAll('[data-fl-tpldots] .tpls-dot'); if (!dots.length) return;
    var idx = Math.round(s.scrollLeft / Math.max(1, _tplSlideStep(s)));
    for (var i = 0; i < dots.length; i++) dots[i].classList.toggle('on', i === idx);
  }
  function _bindTplCarousel() {
    if (!el || el._tplCarBound) return; el._tplCarBound = true;
    var down = null;
    el.addEventListener('scroll', function (e) { if (e.target && e.target.closest && e.target.closest('[data-fl-tplstrip]')) _tplSyncDots(); }, true);
    // PC 마우스 드래그로 가로 스크롤(클릭과 구분: 5px 이상 움직였을 때만 드래그로 간주).
    el.addEventListener('mousedown', function (e) {
      var s = e.target.closest && e.target.closest('[data-fl-tplstrip]'); if (!s) return;
      down = { s: s, x: e.clientX, sl: s.scrollLeft, moved: false };
    });
    el.addEventListener('mousemove', function (e) {
      if (!down) return; var dx = e.clientX - down.x;
      if (Math.abs(dx) > 5) { down.moved = true; down.s.scrollLeft = down.sl - dx; e.preventDefault(); }
    });
    function _up() { if (down && down.moved) { var snap = down; setTimeout(function () { _tplSyncDots(); void snap; }, 30); } down = null; }
    el.addEventListener('mouseup', _up); el.addEventListener('mouseleave', _up);
    // 드래그 직후 click(전/후 지정) 억제 — 캡처 단계에서 가로채 우발적 역할지정 방지.
    el.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-fl-tplstrip]') && el._tplDragSuppress) { e.stopPropagation(); e.preventDefault(); el._tplDragSuppress = false; } }, true);
    el.addEventListener('mousemove', function () { if (down && down.moved) el._tplDragSuppress = true; });
  }

  // [v541] 템플릿 썸네일 long press(500ms) → 확대 미리보기. short tap → 기존 선택/적용(아래 click 가드).
  //   _lpAt = long press 발화 시각. 직후 click(적용)만 700ms 창으로 억제 → 자동 만료라 '다음 정상 탭'은 안 먹힘.
  var _lpAt = 0;
  function _bindTplLongPress() {
    if (!el || el._tplLpBound) return; el._tplLpBound = true;
    var timer = null, sx = 0, sy = 0, key = null;
    var clear = function () { if (timer) { clearTimeout(timer); timer = null; } key = null; };
    el.addEventListener('pointerdown', function (e) {
      var it = e.target.closest && e.target.closest('[data-fl-tpl]');
      if (!it || cur !== 'edit') return;
      key = it.getAttribute('data-fl-tpl'); sx = e.clientX; sy = e.clientY;
      timer = setTimeout(function () { timer = null; _lpAt = Date.now(); if (key) _openTplPreview(key); }, 500);
    });
    el.addEventListener('pointermove', function (e) {
      if (timer && (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10)) clear();   // 스크롤/드래그 → long press 취소
    });
    el.addEventListener('pointerup', clear);
    el.addEventListener('pointercancel', clear);
  }
  function _tplPreviewSampleCard(tpl) {
    // 업로드 사진이 아닌 '샘플' 템플릿 미리보기(_tplThumb = 사진 미주입 플레이스홀더 렌더).
    return '<div class="tpl-preview__card" style="background-image:url(' + esc(_tplThumb(tpl)) + ')"></div>';
  }
  function _openTplPreview(key) {
    var tpl = _tplByKey(key); if (!tpl) return;
    _closeTplPreview();
    var isDef = _getDefaultTpl(_purposeCat(tpl.purpose)) === tpl.id;
    var wrap = document.createElement('div');
    wrap.className = 'tpl-preview'; wrap.setAttribute('data-fl-tplpreview', '');
    wrap.innerHTML =
      '<div class="tpl-preview__backdrop" data-fl-tppclose></div>' +
      '<div class="tpl-preview__sheet" role="dialog" aria-label="' + esc(tpl.label) + ' 미리보기">' +
        '<div class="tpl-preview__grip"></div>' +
        _tplPreviewSampleCard(tpl) +
        '<div class="tpl-preview__name"><b>' + esc(tpl.label) + '</b><span>' + esc(tpl.use) + '</span></div>' +
        '<div class="tpl-preview__btns">' +
          '<button type="button" class="tpl-preview__apply" data-fl-tppapply="' + esc(key) + '">적용하기</button>' +
          '<button type="button" class="tpl-preview__def' + (isDef ? ' on' : '') + '" data-fl-tppdef="' + esc(key) + '">' + (isDef ? '기본 템플릿' : '기본으로 설정') + '</button>' +
          '<button type="button" class="tpl-preview__close" data-fl-tppclose>닫기</button>' +
        '</div>' +
      '</div>';
    (el || document.body).appendChild(wrap);
    var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
    raf(function () { wrap.classList.add('open'); });
  }
  function _closeTplPreview() {
    var w = el && el.querySelector('[data-fl-tplpreview]');
    if (w && w.parentNode) w.parentNode.removeChild(w);
  }
  // 편집 사진 핀치 줌(2손가락) + 1손가락 팬(확대 시) + 더블탭 확대/축소. 뷰포트(.ed-photo-vp) 내부 클립.
  // [v550] 편집 사진 좌우 전환 — 스와이프/화살표/키보드 공용. 굽기(bakeEdit) 포함된 switchEditPhoto 재사용.
  function _stepEditPhoto(dir) {
    var n = editablePhotos().length; if (n < 2) return;
    var cur0 = (d.editIdx == null) ? 0 : d.editIdx;
    var nx = cur0 + dir; if (nx < 0 || nx >= n) return;   // 끝에서는 더 안 넘김(루프 없음)
    switchEditPhoto(nx);
  }
  function _bindZoom() {
    if (!el || el._zoomBound) return; el._zoomBound = true;
    var g = null, lastTap = 0, sw = null;
    function inVp(t) { return t && t.closest && t.closest('[data-fl-edvp]'); }
    el.addEventListener('touchstart', function (e) {
      if (cur !== 'edit' || !inVp(e.target)) return;
      if (!d.zoom) d.zoom = { s: 1, tx: 0, ty: 0 };
      // [v565] 두 손가락 = 확대/이동(pinch+pan). 칠하기 모드에서도 허용 → 확대해서 작은 부위 정밀 마스크.
      if (e.touches.length >= 2) {
        var dx = e.touches[0].clientX - e.touches[1].clientX, dy = e.touches[0].clientY - e.touches[1].clientY;
        g = { mode: 'pinch', dist: Math.hypot(dx, dy) || 1, s0: d.zoom.s,
              mx: (e.touches[0].clientX + e.touches[1].clientX) / 2, my: (e.touches[0].clientY + e.touches[1].clientY) / 2,
              tx0: d.zoom.tx, ty0: d.zoom.ty }; sw = null; e.preventDefault();
        return;
      }
      // [v565] 칠하기 모드의 단일 포인터는 paint 핸들러가 담당 — 줌/스와이프/팬 금지(칠하기 우선).
      if (d.maskPaint) return;
      if (e.touches.length === 1 && d.zoom.s > 1) {
        g = { mode: 'pan', x: e.touches[0].clientX, y: e.touches[0].clientY, tx0: d.zoom.tx, ty0: d.zoom.ty }; sw = null; e.preventDefault();
      } else if (e.touches.length === 1 && d.zoom.s <= 1 && editablePhotos().length > 1) {
        sw = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };   // [v550] 줌 아닐 때만 좌우 스와이프 후보
      }
    }, { passive: false });
    el.addEventListener('touchmove', function (e) {
      // [v565·scope1] 스와이프는 sw 만 세팅(g 는 null) → '!g' 로 막지 않는다. 핀치는 칠하기 모드에서도 처리.
      if (cur !== 'edit' || !d.zoom) return;
      if (g && g.mode === 'pinch' && e.touches.length >= 2) {
        var dx = e.touches[0].clientX - e.touches[1].clientX, dy = e.touches[0].clientY - e.touches[1].clientY;
        var nmx = (e.touches[0].clientX + e.touches[1].clientX) / 2, nmy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        d.zoom.s = Math.max(1, Math.min(4, g.s0 * (Math.hypot(dx, dy) / g.dist)));
        if (d.zoom.s === 1) { d.zoom.tx = 0; d.zoom.ty = 0; }
        else { d.zoom.tx = g.tx0 + (nmx - g.mx); d.zoom.ty = g.ty0 + (nmy - g.my); }
        _applyZoomTransform(); e.preventDefault();
        return;
      }
      if (d.maskPaint) return;   // [v565] 칠하기 모드 단일 포인터는 무시(paint 담당)
      if (g && g.mode === 'pan' && e.touches.length === 1) {
        d.zoom.tx = g.tx0 + (e.touches[0].clientX - g.x); d.zoom.ty = g.ty0 + (e.touches[0].clientY - g.y);
        _applyZoomTransform(); e.preventDefault();
      } else if (sw && e.touches.length === 1) {
        // [v550] 좌우 스와이프 추적 — 수평이 우세할 때만 큰 프리뷰를 손가락 따라 살짝 끌어 피드백.
        var mx = e.touches[0].clientX - sw.x, my = e.touches[0].clientY - sw.y;
        if (!sw.lock) { if (Math.abs(mx) > 10 || Math.abs(my) > 10) sw.lock = Math.abs(mx) > Math.abs(my) ? 'h' : 'v'; }
        if (sw.lock === 'h') {
          var ph = el.querySelector('[data-fl-edphoto]'); if (ph) ph.style.transform = 'translate3d(' + (mx * 0.42) + 'px,0,0)';   // [v566] GPU 가속(translate3d) + 추종비 상향으로 끈적임 완화
          e.preventDefault();
        }
      }
    }, { passive: false });
    el.addEventListener('touchend', function () {
      if (g && d.zoom && d.zoom.s <= 1) { d.zoom.tx = 0; d.zoom.ty = 0; _applyZoomTransform(); }
      if (sw && sw.lock === 'h') {
        var ph = el.querySelector('[data-fl-edphoto]');
        var mx = sw.lastX != null ? sw.lastX - sw.x : 0;
        if (Math.abs(mx) > 48) { if (ph) ph.style.transform = ''; _stepEditPhoto(mx < 0 ? 1 : -1); }   // 확정: 전환(switchEditPhoto가 재페인트)
        else if (ph) { ph.classList.add('is-swipeback'); ph.style.transform = ''; setTimeout(function () { ph.classList.remove('is-swipeback'); }, 220); }   // 미확정: 부드럽게 원위치
      }
      g = null; sw = null;
    });
    el.addEventListener('touchmove', function (e) { if (sw && e.touches.length === 1) sw.lastX = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('click', function (e) {
      if (cur !== 'edit' || !inVp(e.target)) return;
      var now = Date.now();
      if (now - lastTap < 320) { d.zoom = (d.zoom && d.zoom.s > 1) ? { s: 1, tx: 0, ty: 0 } : { s: 2, tx: 0, ty: 0 }; _applyZoomTransform(); }
      lastTap = now;
    });
    // [v550] PC 키보드 좌우 화살표로 편집 사진 전환(입력란 포커스 중엔 무시). [v568] ESC = 전체화면 닫기.
    document.addEventListener('keydown', function (e) {
      if (cur !== 'edit' || !el || el.hidden) return;
      if (e.key === 'Escape' && d.edFull) { d.edFull = false; try { document.body.classList.remove('itd-edit-fs'); } catch (_x) { void _x; } _renderVpTools(); setTimeout(function () { if (d.maskPaint || d.maskView) _renderMaskOverlay(); _applyZoomTransform(); }, 60); return; }
      var ae = document.activeElement, tag = ae && ae.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (ae && ae.isContentEditable)) return;
      if (e.key === 'ArrowLeft') { _stepEditPhoto(-1); } else if (e.key === 'ArrowRight') { _stepEditPhoto(1); }
    });
    _bindEditPC();
  }
  // [v568·B-3] PC 마우스 — 휠 확대/축소, 드래그(줌>1 팬 / 줌=1 좌우 사진 넘김). 칠하기 모드 단일 포인터는 paint 가 담당.
  function _bindEditPC() {
    if (!el || el._edPcBound) return; el._edPcBound = true;
    var md = null;
    function inVp(t) { return t && t.closest && t.closest('[data-fl-edvp]'); }
    el.addEventListener('wheel', function (e) {
      if (cur !== 'edit' || !inVp(e.target)) return;
      if (!d.zoom) d.zoom = { s: 1, tx: 0, ty: 0 };
      var ns = Math.max(1, Math.min(4, (d.zoom.s || 1) + (e.deltaY < 0 ? 0.25 : -0.25)));
      d.zoom.s = ns; if (ns === 1) { d.zoom.tx = 0; d.zoom.ty = 0; }
      _applyZoomTransform(); e.preventDefault();
    }, { passive: false });
    el.addEventListener('mousedown', function (e) {
      if (cur !== 'edit' || !inVp(e.target) || d.maskPaint) return;
      if (!d.zoom) d.zoom = { s: 1, tx: 0, ty: 0 };
      md = { x: e.clientX, y: e.clientY, tx0: d.zoom.tx, ty0: d.zoom.ty, pan: d.zoom.s > 1, moved: 0 };
    });
    el.addEventListener('mousemove', function (e) {
      if (!md) return;
      md.moved = Math.max(md.moved, Math.abs(e.clientX - md.x));
      if (md.pan) { d.zoom.tx = md.tx0 + (e.clientX - md.x); d.zoom.ty = md.ty0 + (e.clientY - md.y); _applyZoomTransform(); e.preventDefault(); }
      else if (editablePhotos().length > 1) { var ph = el.querySelector('[data-fl-edphoto]'); if (ph) ph.style.transform = 'translate3d(' + ((e.clientX - md.x) * 0.42) + 'px,0,0)'; }
    });
    function _endDrag(e) {
      if (!md) return;
      if (!md.pan && editablePhotos().length > 1) {
        var ph = el.querySelector('[data-fl-edphoto]'); var mx = (e && e.clientX != null) ? e.clientX - md.x : 0;
        if (Math.abs(mx) > 60) { if (ph) ph.style.transform = ''; _stepEditPhoto(mx < 0 ? 1 : -1); }
        else if (ph) { ph.classList.add('is-swipeback'); ph.style.transform = ''; setTimeout(function () { ph.classList.remove('is-swipeback'); }, 220); }
      }
      md = null;
    }
    el.addEventListener('mouseup', _endDrag);
    el.addEventListener('mouseleave', _endDrag);
  }

  function _snapEdit() { return { adjust: clone(d.adjust), beauty: clone(d.beauty) }; }
  function _syncEbState() {
    if (!el) return;
    var u = el.querySelector('[data-fl-eb="되돌리기"]'); if (u) u.classList.toggle('disabled', !(d.undo && d.undo.length));
    var r = el.querySelector('[data-fl-eb="다시실행"]'); if (r) r.classList.toggle('disabled', !(d.redo && d.redo.length));
  }

	  function _refreshPreview() {
	    var photo = curEditPhoto(); if (!photo) return;
	    // [레이어 분리] 누끼+배경 적용본은 인물(fgCutout)/배경(bgSpec)을 분리 보관 →
	    //  밝기/대비 등 보정은 인물에만 적용하고 배경 위에 재합성한다(배경은 보정 영향 안 받음).
	    var hasBg = !!(photo.bgSpec && photo.fgCutout);
	    var base = hasBg ? photo.fgCutout : (photo.editedDataUrl || photo.dataUrl);
	    var p = el.querySelector('[data-fl-edphoto]');
	    var nonzero = _hasValues(d.adjust) || _hasValues(d.beauty);
	    if (!nonzero) {
	      var show = hasBg ? (photo.editedDataUrl || base) : base;
	      d.previewUrl = null; if (p && !d.originalPreview) { p.style.backgroundImage = 'url(' + esc(show) + ')'; p.style.filter = 'none'; } return;
	    }
	    if (!(window.WorkspaceAdapter && window.WorkspaceAdapter.applyWorkspaceCorrections)) { if (p && !d.originalPreview) p.style.filter = filterCss(d.adjust); return; }
	    var token = (d._pvTok = (d._pvTok || 0) + 1);
	    // 정밀(피부/헤어) 보정은 손 뗄 때 픽셀 연산(수백 ms) — 처리 중 표시로 "안 먹는 듯한" 체감 제거.
	    var vp = el.querySelector('[data-fl-edvp]'); if (vp && _hasValues(d.beauty)) vp.classList.add('is-processing');
	    var done = function () { var v = el.querySelector('[data-fl-edvp]'); if (v) v.classList.remove('is-processing'); };
	    // [v539] 화면 미리보기는 다운스케일(긴 변 1100px)로 처리 → release 체감 렉 대폭 완화.
	    //   실제 저장/템플릿 적용(applyEditToPhoto)은 previewMaxPx 없이 풀해상도로 재적용하므로 품질 손실 없음.
	    window.WorkspaceAdapter.applyWorkspaceCorrections({ src: base, adjust: d.adjust, beauty: d.beauty, previewMaxPx: 1100, manualMasks: _manualMasksForCurrent(), maskKey: (photo && (photo._uid || (photo._uid = 'm' + Math.random().toString(36).slice(2, 9)))) }).then(function (r) {
	      if (token !== d._pvTok) { done(); return; }
	      if (!(r && r.ok && r.dataUrl)) { done(); return; }
	      _handleRoiFailures(r.roiFailures || []);
	      var paint = function (url) {
	        done();
	        if (token !== d._pvTok) return;
	        d.previewUrl = url;
	        var p2 = el.querySelector('[data-fl-edphoto]');
	        if (p2 && !d.originalPreview) { p2.style.backgroundImage = 'url(' + url + ')'; p2.style.filter = 'none'; }
	      };
	      if (hasBg) { _compositeBg(photo.bgSpec, r.dataUrl).then(paint); }
	      else { paint(r.dataUrl); }
	    }, done);
	  }
	  // [v559] 누끼+배경 사진 드래그 중 '피사체만 보정' 라이브 미리보기 — _refreshPreview(인물 재합성)를
	  //   throttle(140ms, trailing 보장)로 호출. cheap CSS(합성본 전체 필터→배경까지 밝아짐) 대체.
	  function _throttleRefreshPreview() {
	    var WAIT = 140, now = Date.now();
	    if (!d._pvLast) d._pvLast = 0;
	    var since = now - d._pvLast;
	    if (since >= WAIT) { d._pvLast = now; _refreshPreview(); return; }
	    if (d._pvTrail) clearTimeout(d._pvTrail);
	    d._pvTrail = setTimeout(function () { d._pvTrail = null; d._pvLast = Date.now(); _refreshPreview(); }, WAIT - since);
	  }
	  function _handleRoiFailures(failures) {
	    if (!failures || !failures.length) return;
	    if (failures.indexOf('hand') >= 0) { d.beauty.handSkin = 0; var h = el.querySelector('[data-fl-beautyrange="handSkin"]'); if (h) h.value = 0; toast('손을 인식하지 못했습니다'); }
	    if (failures.indexOf('nail') >= 0) {
	      ['nailGloss', 'nailShape'].forEach(function (k) { d.beauty[k] = 0; var n = el.querySelector('[data-fl-beautyrange="' + k + '"]'); if (n) n.value = 0; });
	      toast('네일을 인식하지 못했습니다');
	    }
	  }
	  // 배경 spec + (보정된) 투명 인물 누끼 → 한 장으로 재합성. 배경은 보정값을 안 받는다.
	  function _coverDraw(c, img, w, h) {
	    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
	    var s = Math.max(w / iw, h / ih), dw = iw * s, dh = ih * s;
	    c.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
	  }
	  // [v539] 보정된 인물(fgUrl, 투명) + 배경 재합성. rect 점프 수정:
	  //   배경 '적용' 때와 동일한 PhotoEditorBgCompose.compose 경로를 재사용해 같은 ratio/배치/출력크기로 뽑는다.
	  //   (과거엔 fgCutout 원본 크기로 합성 → editedDataUrl(4:5 등)과 aspect 불일치 → cover 에서 크기/위치 점프)
	  //   compose 는 preRemovedBgUrl 로 매팅 스킵(빠름). srcUrl=원본(블러 배경 소스용).
	  function _compositeBg(bgSpec, fgUrl) {
	    var BC = window.PhotoEditorBgCompose;
	    if (BC && typeof BC.compose === 'function' && bgSpec) {
	      var bgd = bgSpec.action === 'image' ? { imageData: bgSpec.bgImage }
	        : bgSpec.action === 'color' ? { type: 'procedural', color: bgSpec.color || '#ffffff' }
	        : bgSpec.action === 'blur' ? { type: 'blur' } : { type: 'none' };
	      return Promise.resolve(BC.compose({ srcUrl: bgSpec.origUrl || fgUrl, preRemovedBgUrl: fgUrl, bg: bgd, targetRatio: bgSpec.ratio || 'original' }))
	        .then(function (r) { return (r && r.composedDataUrl) || fgUrl; })
	        .catch(function () { return fgUrl; });
	    }
	    return new Promise(function (resolve) {
	      var fg = new Image();
	      fg.onload = function () {
	        var w = fg.naturalWidth || fg.width, h = fg.naturalHeight || fg.height;
	        var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
	        var c = cv.getContext('2d');
	        var drawFg = function () { try { c.drawImage(fg, 0, 0, w, h); resolve(cv.toDataURL('image/png')); } catch (_e) { resolve(fgUrl); } };
	        var act = bgSpec && bgSpec.action;
	        if (act === 'color') { c.fillStyle = bgSpec.color || '#ffffff'; c.fillRect(0, 0, w, h); drawFg(); }
	        else if (act === 'image' && bgSpec.bgImage) { var bi = new Image(); bi.onload = function () { _coverDraw(c, bi, w, h); drawFg(); }; bi.onerror = drawFg; bi.src = bgSpec.bgImage; }
	        else if (act === 'blur' && bgSpec.origUrl) { var bo = new Image(); bo.onload = function () { c.save(); c.filter = 'blur(' + Math.max(6, Math.round(Math.min(w, h) * 0.03)) + 'px)'; _coverDraw(c, bo, w, h); c.filter = 'none'; c.restore(); drawFg(); }; bo.onerror = drawFg; bo.src = bgSpec.origUrl; }
	        else { drawFg(); }   // removeBg/none → 투명 배경
	      };
	      fg.onerror = function () { resolve(fgUrl); };
	      fg.src = fgUrl;
	    });
	  }

  // [T-104 P0] clone → flow/util.js

  // 보정 변경 후 화면 갱신 — 사진/슬라이더/정밀/하단버튼 섹션만 (전체 재렌더 회피)
  function _repaintEditAfterAdjust() {
    _paintEditPhoto();
    _setEditSection('[data-ed-basic]', _mainAdjustHtml());
    _setEditSection('[data-ed-adv]', _advFoldHtml());
    _setEditSection('[data-ed-bottom]', _editBottomHtml());
    _refreshPreview();
  }
  // [v540] 내 콘텐츠 편집 딥링크 — 진입 직후 해당 섹션으로 스크롤(+crop 은 비율 시트 바로 오픈).
  function _applyFocusScroll() {
    if (!d || !d._focusIntent || cur !== 'edit' || !el) return;
    var intent = d._focusIntent; d._focusIntent = null;
    if (window.__ITDASY_PHOTO_DEBUG__) { try { console.log('[workspace-route] intent=' + intent + ' editTab=' + d.editTab + ' bgOpen=' + d.bgOpen + ' tplOpen=' + d.tplOpen); } catch (_e) { void _e; } }
    var sel = intent === 'template' ? '[data-ed-tpl]' : intent === 'crop' ? '[data-ed-adv]' : '[data-ed-basic]';
    var node = el.querySelector('[data-fs="edit"] ' + sel);
    if (node && node.scrollIntoView) { try { node.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (_e2) { try { node.scrollIntoView(); } catch (_e3) { void _e3; } } }
    if (intent === 'crop' && typeof openCropFlow === 'function') { try { openCropFlow(); } catch (_e4) { void _e4; } }
  }
  function _editBottom(label) {
    if (label === '마스크') { d.maskView = !d.maskView; if (d.maskView) d.maskPaint = false; _setEditSection('[data-ed-adv]', _advFoldHtml()); _renderVpTools(); _renderMaskOverlay(); if (d.maskView) toast('현재 부위 마스크를 표시해요'); return; }
    if (label === '비교' || label === '원본보기') { d.originalPreview = !d.originalPreview; _paintEditPhoto(); _setEditSection('[data-ed-bottom]', _editBottomHtml()); if (!d.originalPreview) _refreshPreview(); _renderMaskOverlay(); return; }
    // [v560] 되돌리기/다시실행/초기화는 비교(원본보기) 모드를 자동 해제 — 안 그러면 복원 결과가
    //   원본 프리뷰에 가려 '작업이 날아간 것처럼' 보임(_refreshPreview 가 originalPreview 시 미페인트).
    if (label === '되돌리기') { if (d.undo && d.undo.length) { d.redo = d.redo || []; d.redo.push(_snapEdit()); var s = d.undo.pop(); d.adjust = s.adjust || newAdjust(); d.beauty = s.beauty || newBeauty(); d.previewUrl = null; d.originalPreview = false; _repaintEditAfterAdjust(); } return; }
    if (label === '다시실행') { if (d.redo && d.redo.length) { d.undo = d.undo || []; d.undo.push(_snapEdit()); var r = d.redo.pop(); d.adjust = r.adjust || newAdjust(); d.beauty = r.beauty || newBeauty(); d.previewUrl = null; d.originalPreview = false; _repaintEditAfterAdjust(); } return; }
	    if (label === '초기화') { d.undo = d.undo || []; d.undo.push(_snapEdit()); if (d.undo.length > 30) d.undo.shift(); d.redo = []; d.adjust = newAdjust(); d.beauty = newBeauty(); d.previewUrl = null; d.originalPreview = false; var _ip = curEditPhoto(); if (_ip && _ip._uid && d._paintCv) delete d._paintCv[_ip._uid]; if (d.maskPaint) _renderPaintOverlay(); _repaintEditAfterAdjust(); toast('보정을 초기화했어요'); return; }
  }

	  function applyBg(action) {
	    var photo = curEditPhoto();
    if (!photo) { toast('사진이 없어요'); return; }
    // 원본 되돌리기 — 배경 적용 전 사진(preBgUrl)으로 복귀, 레이어 상태 해제.
    if (action === 'reset' || action === 'original') {
      if (photo.preBgUrl) photo.editedDataUrl = photo.preBgUrl;
      photo.bgSpec = null; photo.fgCutout = null; d.bgAction = null; d.bgColor = null; d.previewUrl = null;
      setScreen('edit'); _refreshPreview(); toast('배경을 원래대로 되돌렸어요'); return;
    }
    if (!(window.WorkspaceAdapter && window.WorkspaceAdapter.applyWorkspaceBgAction)) { toast('배경 모듈을 불러오지 못했어요'); return; }
    var prev = d.bgAction;
    // 항상 '배경 적용 전 원본'에서 재합성 — 색→흐림 등 옵션 전환 시 합성본을 또 누끼하지 않도록.
    var composeSrc = photo.preBgUrl || photo.editedDataUrl || photo.dataUrl;
    d.bgAction = action; d.bgBusy = true; d.bgFail = false; setScreen('edit');
    window.WorkspaceAdapter.applyWorkspaceBgAction({ src: composeSrc, action: action, color: d.bgColor, bgImage: d.customBg, ratio: CROP_RATIO[d.tplPurpose] || 'original' })
      .then(function (r) {
        d.bgBusy = false;
        if (r && r.ok && r.dataUrl) {
          if (!photo.preBgUrl) photo.preBgUrl = composeSrc;   // 최초 1회 원본 보관(되돌리기용)
          photo.editedDataUrl = r.dataUrl;
          photo.fgCutout = r.removedBg || null;   // 투명 인물 — 이후 보정은 여기에만
          // [v539] ratio 저장 — 직후 슬라이더 재합성(_compositeBg)이 적용 때와 '동일 비율/배치'로 출력해야
          //   크기 점프가 안 생긴다. (editedDataUrl 은 ratioToSize(ratio) 크기, fgCutout 은 원본 크기라 불일치했음)
          photo.bgSpec = photo.fgCutout ? { action: action, color: d.bgColor, bgImage: d.customBg, origUrl: photo.preBgUrl, ratio: CROP_RATIO[d.tplPurpose] || 'original' } : null;
          d.previewUrl = null; d.bgFail = false; toast('배경 적용 완료'); setScreen('edit'); _refreshPreview();
        }
        else { d.bgAction = prev; d.bgFail = true; d.bgFailMsg = (r && r.toast) || '배경 처리에 실패했어요'; toast(d.bgFailMsg); setScreen('edit'); }
	      });
	  }

	  function _tplByKey(key) {
	    return WORKSPACE_TEMPLATES.filter(function (t) { return t.key === key; })[0] || null;
	  }
	  // [v560] 템플릿 적용 후 복귀 화면 — 'template' step 에서 적용하면 그 화면 유지(편집으로 안 튐), 그 외엔 편집.
	  function _tplReturnScreen() { return cur === 'template' ? 'template' : 'edit'; }
	  // [v560] '템플릿 선택' 전용 화면 — 상단 큰 사진(좌우 스와이프) + 전·후 클릭 지정 + 템플릿 목록.
	  //   기존 렌더(_rolesPanelHtml/_tplAppliedHtml/_tplThumb)와 핸들러(data-fl-setrole/tpl/tplchip) 재사용.
	  // [v562·항목3] 클릭순 전/후 — d.tplPickSeq(사진 id 클릭 순서) 기준으로 role 부여(짝수=전/홀수=후).
	  function _syncPickSeq() {
	    var eps = editablePhotos();
	    if (!d.tplPickSeq) d.tplPickSeq = [];
	    // 삭제된 사진 id 제거
	    d.tplPickSeq = d.tplPickSeq.filter(function (pid) { return eps.some(function (x) { return String(x.id) === String(pid); }); });
	    // 시퀀스가 비어 있으면 현재 역할(자동 배치 결과)에서 순서 복원 → 첫 탭부터 자연스럽게 토글.
	    if (!d.tplPickSeq.length) {
	      var bef = eps.filter(function (p) { return p.role === 'before'; });
	      var aft = eps.filter(function (p) { return p.role === 'after'; });
	      var seq = [];
	      for (var i = 0; i < Math.max(bef.length, aft.length); i++) { if (bef[i]) seq.push(String(bef[i].id)); if (aft[i]) seq.push(String(aft[i].id)); }
	      d.tplPickSeq = seq;
	    }
	    return d.tplPickSeq;
	  }
	  function _pickSeqNo(id) {
	    var seq = d.tplPickSeq || []; var k = seq.indexOf(String(id));
	    if (k < 0 || seq.length <= 2) return '';   // 2장(1짝)이면 번호 생략
	    return String(Math.floor(k / 2) + 1);      // 짝 번호(1,1,2,2,…)
	  }
	  function _applyPickRoles() {
	    var eps = editablePhotos(); var seq = d.tplPickSeq || [];
	    eps.forEach(function (p) {
	      var k = seq.indexOf(String(p.id));
	      if (k < 0) { p.role = 'hero'; p.roleManual = false; }
	      else { p.role = (k % 2 === 0) ? 'before' : 'after'; p.roleManual = true; }
	    });
	  }
	  function _pickTplRole(id) {
	    var eps = editablePhotos();
	    if (!eps.some(function (x) { return String(x.id) === String(id); })) return;
	    _syncPickSeq();
	    var sid = String(id), k = d.tplPickSeq.indexOf(sid);
	    if (k >= 0) d.tplPickSeq.splice(k, 1);   // 다시 탭 → 해제
	    else d.tplPickSeq.push(sid);             // 새 탭 → 다음 순서(전/후/전/후…)
	    _applyPickRoles();
	    d.templateId = null; d.templateOutputs = []; d.templateOutput = null;   // 역할 바뀌면 기존 결과 무효화
	    _rerenderTemplate();
	  }
	  function renderTemplate() {
	    _syncPickSeq();
	    var eps = editablePhotos();
	    // [v562·항목3] 상단 사진을 '순서대로 탭'하면 전/후 자동 지정(첫 탭=전, 둘째 탭=후, 다시 탭=해제).
	    //   다중(4장)이면 전·후·전·후 순으로 짝이 만들어진다. 좌우 스와이프(스크롤)는 그대로.
	    var strip = eps.map(function (p, i) {
	      var role = p.role || 'hero';
	      var rl = role === 'before' ? '전' : (role === 'after' ? '후' : '');
	      var seqNo = _pickSeqNo(p.id);   // 전/후 짝 번호(2짝 이상일 때만 표시)
	      return '<button type="button" class="tpls-slide' + (rl ? ' is-' + role : '') + '" data-fl-tplpick="' + esc(p.id) + '" style="background-image:url(' + esc(photoUrl(p)) + ')" aria-label="' + esc(_editPhotoLabel(p, i)) + ' — 탭하면 전/후 지정">' +
	        (rl ? '<span class="tpls-slide__role">' + rl + (seqNo ? '<em>' + seqNo + '</em>' : '') + '</span>'
	            : '<span class="tpls-slide__tag">탭 → 전/후</span>') +
	      '</button>';
	    }).join('');
	    var chips = ['전체', '전후', '붙이기', '시술 자랑', '고객 후기', '이벤트', '공지', '정보', '스토리'];
	    var shown = WORKSPACE_TEMPLATES.filter(function (tpl) { return !d.tplCat || d.tplCat === '전체' || tpl.chip === d.tplCat; });
	    var grid = shown.map(function (tpl) {
	      var on = d.templateId === tpl.id;
	      return '<div class="tpl-itemwrap"><button type="button" class="tpl-item' + (on ? ' on' : '') + '" data-fl-tpl="' + esc(tpl.key) + '" aria-label="' + esc(tpl.label) + ' 템플릿' + (on ? ' (적용됨)' : '') + '" style="background-image:url(' + esc(_tplThumb(tpl)) + ')"><i class="tpl-badge">' + esc(tpl.chip) + '</i>' + (on ? '<i class="tpl-onpill">적용됨</i>' : '') + '</button></div>';
	    }).join('');
	    return '<div class="tpls">' +
	      '<div class="tpls-carousel' + (eps.length > 1 ? ' is-multi' : '') + '" data-fl-tplcar>' + (eps.length > 1 ? '<button type="button" class="tpls-nav tpls-nav--prev" data-fl-tplnav="-1" aria-label="이전 사진"><i class="ph-bold ph-caret-left"></i></button>' : '') + '<div class="tpls-strip" data-fl-tplstrip aria-label="편집한 사진 — 좌우로 넘겨 확인">' + (strip || '<div class="tpls-empty">선택된 사진이 없어요. 먼저 사진을 골라 주세요.</div>') + '</div>' + (eps.length > 1 ? '<button type="button" class="tpls-nav tpls-nav--next" data-fl-tplnav="1" aria-label="다음 사진"><i class="ph-bold ph-caret-right"></i></button>' : '') + '</div>' + (eps.length > 1 ? '<div class="tpls-dots" data-fl-tpldots>' + eps.map(function (p, i) { return '<button type="button" class="tpls-dot' + (i === 0 ? ' on' : '') + '" data-fl-tpldot="' + i + '" aria-label="' + (i + 1) + '번째 사진으로"></button>'; }).join('') + '</div>' : '') +
	      _tplAppliedHtml() +
	      (eps.length >= 2 ? '<div class="tpls-sec"><div class="cap-field-label">전·후 지정 <span>위 사진을 순서대로 탭 — 첫 탭 <b>전</b>, 둘째 탭 <b>후</b> (다시 탭하면 해제)</span></div></div>' : '') +
	      '<div class="tpls-sec"><div class="cap-field-label">템플릿 고르기 <span>탭하면 바로 적용돼요</span></div>' +
	        '<div class="tpl-chips">' + chips.map(function (c, i) { return '<span class="tpl-chip' + ((d.tplCat ? d.tplCat === c : i === 0) ? ' on' : '') + '" data-fl-tplchip>' + esc(c) + '</span>'; }).join('') + '</div>' +
	        '<div class="tpl-grid2">' + grid + '</div>' +
	      '</div>' +
	    '</div>';
	  }
	  // [v561·항목5] 2장 50:50 합성(좌우/상하) — cover 크롭으로 비율 깨짐 최소화, 1px 흰 거터.
	  function _composeCollage(urlA, urlB, layout) {
	    return new Promise(function (resolve) {
	      var imgs = [], done = 0, fail = false;
	      [urlA, urlB].forEach(function (u, i) {
	        var im = new Image();
	        im.onload = function () { imgs[i] = im; if (++done === 2 && !fail) _draw(); };
	        im.onerror = function () { fail = true; resolve(null); };
	        im.src = u;
	      });
	      function _coverBlit(ctx, im, dx, dy, dw, dh) {
	        var iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
	        var s = Math.max(dw / iw, dh / ih), sw = dw / s, sh = dh / s;
	        var sx = (iw - sw) / 2, sy = (ih - sh) / 2;
	        ctx.drawImage(im, sx, sy, sw, sh, dx, dy, dw, dh);
	      }
	      function _draw() {
	        var W = 1080, H = 1080, gap = 4;   // 정사각 캔버스 + 가는 흰 거터
	        var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
	        var ctx = cv.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
	        if (layout === 'tb') {
	          var hh = (H - gap) / 2;
	          _coverBlit(ctx, imgs[0], 0, 0, W, hh);
	          _coverBlit(ctx, imgs[1], 0, hh + gap, W, hh);
	        } else {   // 'lr'
	          var hw = (W - gap) / 2;
	          _coverBlit(ctx, imgs[0], 0, 0, hw, H);
	          _coverBlit(ctx, imgs[1], hw + gap, 0, hw, H);
	        }
	        resolve(cv.toDataURL('image/jpeg', 0.92));
	      }
	    });
	  }
	  function _applyCollage(tpl) {
	    var eps = editablePhotos();
	    if (eps.length < 2) { toast('붙이기 템플릿은 사진 2장이 필요해요 · 사진을 더 추가해 주세요'); setScreen('upload'); return; }
	    // 전·후 역할이 지정돼 있으면 그 순서(전→후), 아니면 선택 순서 첫 2장.
	    var pairs = _computePairs().pairs;
	    var a, b;
	    if (pairs.length) { a = pairs[0].before; b = pairs[0].after; }
	    else { a = eps[0]; b = eps[1]; }
	    d.templateBusy = tpl.key; setScreen(_tplReturnScreen());
	    _composeCollage(photoUrl(a), photoUrl(b), tpl.collage || 'lr').then(function (url) {
	      d.templateBusy = null;
	      if (url) {
	        d.templateOutput = url; d.templateOutputId = tpl.id;
	        d.templateOutputs = [{ pairId: 'pair-0', templateId: tpl.id, beforePhotoId: a.id, afterPhotoId: b.id, outputUrl: url, pairLabel: '결과물' }];
	        d.activeDisplayId = null;
	        d.template = tpl.label; d.templateId = tpl.id;
	        d.tplPurpose = tpl.purpose; d.captionMode = tpl.captionMode || d.captionMode;
	        d.previewUrl = null; toast(tpl.label + ' 완료');
	      } else { toast('사진을 붙이지 못했어요 · 다시 시도해 주세요'); }
	      setScreen(_tplReturnScreen());
	    });
	  }
	  function applyTemplate(key) {
	    var tpl = _tplByKey(key);
	    if (!tpl) { toast('템플릿을 찾지 못했어요'); return; }
	    if (!(window.WorkspaceAdapter && window.WorkspaceAdapter.applyWorkspaceTemplate)) { toast('템플릿 적용 모듈을 불러오지 못했어요'); return; }
	    if (!d.photos.length) { toast('사진을 먼저 추가해 주세요'); return; }
	    // [v532] 짝별 타깃은 전후 템플릿에서만 의미 — 비전후 템플릿을 고르면 타깃을 비우고 일반(일괄) 전환으로.
	    if (tpl.purpose !== 'before_after') d.tplTargetPair = null;
	    // [v561·항목5] 단순 붙이기(collage) — 2장을 50:50 으로 캔버스 합성. 꾸밈/텍스트 없음.
	    if (tpl.purpose === 'collage') { _applyCollage(tpl); return; }
	    // [버그5] 전후 템플릿은 최소 2장 — 1장이면 자동완성/자동보정 금지, 업로드 화면으로 보내 사진 추가 유도(편집기 점프 금지).
	    // [#7] 전후 템플릿은 최소 2장 — 1장이면 자동완성/자동보정 금지. 안내 후 업로드 화면으로(편집기 점프 금지).
	    if (tpl.purpose === 'before_after' && editablePhotos().length < 2) {
	      toast('전후 템플릿은 최소 2장의 사진이 필요해요 · 전 사진과 후 사진을 추가해 주세요');
	      setScreen('upload'); return;
	    }
	    // [다중pair] 전후 템플릿: 완성 가능한 모든 페어에 같은 템플릿을 각각 적용 → 결과물 N개.
	    //   roles 가 이미 페어를 이루면(수동/복원) 보존하고, 못 이루면(2장 신규 드롭) 첫=전·둘째=후 자동.
	    if (tpl.purpose === 'before_after') {
	      d.baMode = true;
	      if (_computePairs().pairs.length === 0) reassignRoles();
	      var pairs = _computePairs().pairs;
	      // [v532] 짝별 개별 적용 — 타깃 짝이 지정되어 있으면 그 짝만 새 템플릿으로 재합성하고 나머지는 그대로 둔다.
	      if (d.tplTargetPair) {
	        var _tgtId = d.tplTargetPair;
	        var _outsP = (d.templateOutputs || []).slice();
	        var _oidx = -1; for (var _ok = 0; _ok < _outsP.length; _ok++) { if (_outsP[_ok].pairId === _tgtId) { _oidx = _ok; break; } }
	        if (_oidx < 0) { d.tplTargetPair = null; toast('바꿀 짝을 찾지 못했어요 — 전체 적용으로 진행해 주세요'); return; }
	        var _exist = _outsP[_oidx];
	        // 저장된 before/after 사진 id 로 현재 페어를 매칭(선택/역할 변동에도 정확히 그 짝을 재합성). 없으면 인덱스 폴백.
	        var _pr = null;
	        for (var _pj = 0; _pj < pairs.length; _pj++) { if (pairs[_pj].before.id === _exist.beforePhotoId && pairs[_pj].after.id === _exist.afterPhotoId) { _pr = pairs[_pj]; break; } }
	        if (!_pr) _pr = pairs[_oidx];
	        if (!_pr) { d.tplTargetPair = null; toast('이 짝의 사진을 찾지 못했어요'); return; }
	        d.templateBusy = tpl.key; setScreen(_tplReturnScreen());
	        window.WorkspaceAdapter.applyWorkspaceTemplate({
	          template: tpl, photos: [_pr.before, _pr.after], service: d.service,
	          customerName: d.customerName, caption: d.caption,
	        }).then(function (r) {
	          d.templateBusy = null; d.tplTargetPair = null;
	          if (r && r.ok && r.dataUrl) {
	            _outsP[_oidx] = { pairId: _tgtId, templateId: tpl.id, beforePhotoId: _pr.before.id, afterPhotoId: _pr.after.id, outputUrl: r.dataUrl, pairLabel: _exist.pairLabel || ('Pair ' + (_oidx + 1)) };
	            d.templateOutputs = _outsP;
	            d.templateOutput = _outsP[0] && _outsP[0].outputUrl;   // 대표 미리보기 = 첫 짝
	            d.templateId = d.templateId || tpl.id;                 // '적용됨' 마커 유지
	            d.tplPurpose = tpl.purpose; d.previewUrl = null;
	            toast('Pair ' + (_oidx + 1) + ' 결과를 ' + tpl.label + '(으)로 바꿨어요');
	          } else { toast((r && r.toast) || '이 짝은 아직 적용하지 못했어요'); }
	          setScreen(_tplReturnScreen());
	        }).catch(function () { d.templateBusy = null; d.tplTargetPair = null; toast('이 짝 적용 중 오류가 났어요'); setScreen(_tplReturnScreen()); });
	        return;
	      }
	      d.templateBusy = tpl.key; setScreen(_tplReturnScreen());
	      Promise.all(pairs.map(function (pr, i) {
	        // 페어 1개씩 어댑터에 2장만 넘김(어댑터는 before/after 1쌍을 합성). 실패 페어는 null → 격리.
	        return window.WorkspaceAdapter.applyWorkspaceTemplate({
	          template: tpl, photos: [pr.before, pr.after], service: d.service,
	          customerName: d.customerName, caption: d.caption,
	        }).then(function (r) {
	          return (r && r.ok && r.dataUrl)
	            ? { pairId: 'pair-' + i, templateId: tpl.id, beforePhotoId: pr.before.id, afterPhotoId: pr.after.id, outputUrl: r.dataUrl, pairLabel: 'Pair ' + (i + 1) }
	            : null;
	        }).catch(function () { return null; });
	      })).then(function (list) {
	        d.templateBusy = null;
	        var outs = list.filter(Boolean);
	        if (outs.length) {
	          // [이슈2] 합성 결과물은 전용 배열에만 보관 — 원본 photos(전/후/기본)는 비오염.
	          d.templateOutputs = outs;
	          d.templateOutput = outs[0].outputUrl; d.templateOutputId = tpl.id;
	          d.activeDisplayId = null;
	          d.template = tpl.label; d.templateId = tpl.id;
	          d.tplPurpose = tpl.purpose; d.captionMode = tpl.captionMode || d.captionMode;
	          d.previewUrl = null;
	          var failed = pairs.length - outs.length;
	          toast(failed > 0
	            ? (tpl.label + ' · ' + outs.length + '개 적용 (' + failed + '개는 원본 유지)')
	            : (tpl.label + ' 적용 완료 · 결과물 ' + outs.length + '개'));
	        } else { toast('이 템플릿은 아직 적용하지 못했어요'); }
	        setScreen(_tplReturnScreen());
	      });
	      return;
	    }
	    // 비전후(시술자랑/후기/이벤트/스토리 등) — 단일 결과물.
	    d.templateBusy = tpl.key; setScreen(_tplReturnScreen());
	    window.WorkspaceAdapter.applyWorkspaceTemplate({
	      template: tpl, photos: editablePhotos(), service: d.service,
	      customerName: d.customerName, caption: d.caption,
	    }).then(function (r) {
	      d.templateBusy = null;
	      if (r && r.ok && r.dataUrl) {
	        // [이슈2] 합성 결과물은 전용 필드에만 보관(원본 비오염).
	        d.templateOutput = r.dataUrl; d.templateOutputId = tpl.id;
	        d.templateOutputs = [{ pairId: 'pair-0', templateId: tpl.id, beforePhotoId: null, afterPhotoId: null, outputUrl: r.dataUrl, pairLabel: '결과물' }];
	        d.activeDisplayId = null;
	        d.template = tpl.label; d.templateId = tpl.id;
	        d.tplPurpose = tpl.purpose; d.captionMode = tpl.captionMode || d.captionMode;
	        d.previewUrl = null; toast(tpl.label + ' 템플릿 적용 완료');
	      } else { toast((r && r.toast) || '이 템플릿은 아직 적용하지 못했어요'); }
	      setScreen(_tplReturnScreen());
	    });
	  }
	  // [v534] 짝별 템플릿 텍스트 레이어 수정 — 편집 시트 오픈 → onApply 로 해당 Pair 결과/slotValues 만 갱신.
  function _openTplEdit(pairId) {
    if (!(window.WorkspaceTplEdit && window.WorkspaceTplEdit.open)) { toast('템플릿 수정 모듈을 불러오지 못했어요'); return; }
    var outs = d.templateOutputs || [];
    var idx = -1; for (var i = 0; i < outs.length; i++) { if (outs[i].pairId === pairId) { idx = i; break; } }
    if (idx < 0) { toast('수정할 결과물을 찾지 못했어요'); return; }
    var o = outs[idx];
    var _photoUrl = function (pid) { var p = (d.photos || []).filter(function (x) { return String(x.id) === String(pid); })[0]; return p ? (p.editedDataUrl || p.dataUrl) : null; };
    window.WorkspaceTplEdit.open({
      templateId: o.templateId,
      pairLabel: 'Pair ' + (idx + 1),
      slotValues: o.slotValues || null,
      beforeUrl: _photoUrl(o.beforePhotoId),
      afterUrl: _photoUrl(o.afterPhotoId),
      onApply: function (res) {
        outs[idx].slotValues = res.slotValues;          // [v534] Pair별 slotValues 저장(다른 짝 비영향)
        if (res.outputUrl) outs[idx].outputUrl = res.outputUrl;
        d.templateOutputs = outs;
        d.templateOutput = outs[0] && outs[0].outputUrl;
        d.previewUrl = null;
        _renderTplSection();
        toast('Pair ' + (idx + 1) + ' 템플릿을 수정했어요');
      },
    });
  }
  // [이슈11] 템플릿 해제 — 적용 결과물만 비우고 원본 사진 리스트는 그대로 복구.
	  //   원본(d.photos)은 애초에 손대지 않았으므로(이슈2) 결과물 필드만 비우면 원본 상태로 돌아간다.
	  function releaseTemplate() {
	    if (!d.templateId && !d.templateOutput) { toast('적용된 템플릿이 없어요'); return; }
	    d.templateOutput = null; d.templateOutputId = null;
	    d.templateOutputs = []; d.activeDisplayId = null;   // [다중pair] 결과물 배열도 비움 → 원본 복구
	    d.template = null; d.templateId = null;
	    d.tplTargetPair = null;   // [v532] 짝별 타깃도 초기화
	    d.previewUrl = null;
	    _renderTplSection();
	    toast('템플릿을 해제했어요 — 원본 사진으로 돌아갔어요');
	  }

	  function bakeEdit() {
	    var photo = curEditPhoto();
	    var nonzero = photo && (_hasValues(d.adjust) || _hasValues(d.beauty));
	    if (!photo || !nonzero) return Promise.resolve();
	    var hasBg = !!(photo.bgSpec && photo.fgCutout);
	    var src = hasBg ? photo.fgCutout : (photo.editedDataUrl || photo.dataUrl);   // bg면 인물 누끼에만 보정
	    if (window.WorkspaceAdapter && window.WorkspaceAdapter.applyWorkspaceCorrections) {
	      return window.WorkspaceAdapter.applyWorkspaceCorrections({ src: src, adjust: d.adjust, beauty: d.beauty, manualMasks: _manualMasksForCurrent(), maskKey: (photo && (photo._uid || (photo._uid = 'm' + Math.random().toString(36).slice(2, 9)))) }).then(function (r) {
	        if (!(r && r.ok && r.dataUrl)) return _bakeCss(photo, src);
	        photo.adjustments = clone(d.adjust); photo.beautyAdjustments = clone(d.beauty); d.adjust = newAdjust(); d.beauty = newBeauty(); d.previewUrl = null;
	        // [v561] 굽고 나면 수동 마스크 효과는 픽셀에 반영됨 — 중복 적용 방지 위해 해당 사진의 칠한 영역 비움.
	        if (photo._uid && d._paintCv) { delete d._paintCv[photo._uid]; } d.maskPaint = false;
	        if (hasBg) { photo.fgCutout = r.dataUrl; return _compositeBg(photo.bgSpec, r.dataUrl).then(function (comp) { photo.editedDataUrl = comp; }); }
	        photo.editedDataUrl = r.dataUrl;
	      }).catch(function (e) {
	        console.warn('[wsv2flow] bakeEdit correction failed → CSS fallback', e);
	        try { return _bakeCss(photo, src); } catch (_e2) { void _e2; return Promise.resolve(); }
	      });
    }
    return _bakeCss(photo, src);
  }
  function _bakeCss(photo, src) {
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () {
        try {
          var cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
          var c = cv.getContext('2d'); c.filter = filterCss(d.adjust); c.drawImage(im, 0, 0);
          var png = /^data:image\/png/i.test(src);
          photo.editedDataUrl = png ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.92);
          photo.adjustments = clone(d.adjust); d.adjust = newAdjust(); d.previewUrl = null;
        } catch (_e) { /* 실패 시 원본 유지 */ }
        res();
      };
      im.onerror = function () { res(); };
      im.src = src;
    });
  }

	  // [이슈1] 전후 페어링 산출 — 선택순(selSeq)으로 전(before)·후(after)를 1:1 zip.
	  //   전 N + 후 M → min(N,M)쌍. 남는 전 = "후 사진 부족", 남는 후 = "전 사진 부족".
	  //   어댑터 _pickPhoto(첫 전+첫 후) 와 동일 순서 → 화면에 보이는 짝과 실제 합성 짝이 일치.
	  function _computePairs() {
	    var sel = _selectedOrdered();
	    var befores = sel.filter(function (p) { return p.role === 'before'; });
	    var afters  = sel.filter(function (p) { return p.role === 'after'; });
	    var n = Math.min(befores.length, afters.length), pairs = [];
	    for (var i = 0; i < n; i++) pairs.push({ before: befores[i], after: afters[i] });
	    return { pairs: pairs, leftBefore: befores.slice(n), leftAfter: afters.slice(n) };
	  }

	  // [다중pair] slot → templateOutputs 배열 hydrate. 구 슬롯(단일 templateOutput) 호환:
	  //   templateOutputs 있으면 그대로(얕은 복제), 없고 templateOutput만 있으면 1개짜리로 변환.
	  function _hydrateOutputs(slot, wc) {
	    if (!slot) return [];
	    if (slot.templateOutputs && slot.templateOutputs.length) {
	      return slot.templateOutputs.map(function (o) { return Object.assign({}, o); });
	    }
	    if (slot.templateOutput) {
	      return [{ pairId: 'pair-0', templateId: (wc && wc.templateId) || null, beforePhotoId: null, afterPhotoId: null, outputUrl: slot.templateOutput, pairLabel: 'Pair 1' }];
	    }
	    return [];
	  }

	  // [다중pair] 캡션 상단 캐러셀 표시 아이템 — 템플릿 결과물(들) + (전후) 미적용 원본(남은 전/후·기본).
	  function _unpairedPhotos() {
	    var used = {};
	    (d.templateOutputs || []).forEach(function (o) { if (o.beforePhotoId) used[o.beforePhotoId] = 1; if (o.afterPhotoId) used[o.afterPhotoId] = 1; });
	    return _selectedOrdered().filter(function (p) { return !used[p.id]; });
	  }
	  function _photoById(id) { return (d.photos || []).filter(function (p) { return String(p.id) === String(id); })[0] || null; }
	  // [v564·공통 preview model] 모든 화면(편집 결과·게시글·미리보기·인스타)이 쓰는 단일 표시 목록.
	  //   · 템플릿 적용 결과 = 1장으로 collapse (전후 pair → 결과 1장)
	  //   · 펼침 토글(d.expandedOutputs)된 pair = 원본 전/후 2장으로 expand
	  //   · 템플릿 미적용 = 편집 사진 개별 표시 → 어느 화면이든 동일 순서로 스와이프
	  //   원본(d.photos)은 절대 변형하지 않고, 렌더용 리스트에서만 1장/2장 표현을 바꾼다.
	  function _displayItems() {
	    // [ws-hyper] 레이아웃 적용 시 — 합성본 1장만 표시(원본 개별 사진은 숨김). 미리보기/캡션/발행 공통 소스.
	    if (d.templateOutput) return [{ kind: 'output', id: 'wslayout', url: d.templateOutput, label: '', expandable: false }];   // [버그수정 2026-07-06] 재오픈 초안(wsLayout 미복원)도 합성본 표시 — 합성본이 진실

	    var outs = d.templateOutputs || [];
	    if (outs.length) {
	      var items = [];
	      outs.forEach(function (o) {
	        if (d.expandedOutputs && d.expandedOutputs[o.pairId]) {
	          // 펼침 — 원본 전/후 2장으로
	          var bp = _photoById(o.beforePhotoId), ap = _photoById(o.afterPhotoId);
	          if (bp) items.push({ kind: 'photo', id: 'exp:' + o.pairId + ':b', url: photoUrl(bp), label: '전', ofPair: o.pairId });
	          if (ap) items.push({ kind: 'photo', id: 'exp:' + o.pairId + ':a', url: photoUrl(ap), label: '후', ofPair: o.pairId });
	          if (!bp && !ap) items.push({ kind: 'output', id: o.pairId, url: o.outputUrl, label: o.pairLabel, expandable: false });
	        } else {
	          items.push({ kind: 'output', id: o.pairId, url: o.outputUrl, label: o.pairLabel, expandable: !!(o.beforePhotoId || o.afterPhotoId) });
	        }
	      });
	      if (d.tplPurpose === 'before_after') {
	        _unpairedPhotos().forEach(function (p) {
	          items.push({ kind: 'photo', id: p.id, url: photoUrl(p), label: p.role === 'before' ? '남은 전' : (p.role === 'after' ? '남은 후' : '기본 사진') });
	        });
	      }
	      return items;
	    }
	    // 템플릿 미적용 → 편집 사진 개별 표시(공통 carousel 소스)
	    return editablePhotos().map(function (p, i) {
	      return { kind: 'photo', id: p.id, url: dispUrl(p), label: _editPhotoLabel(p, i) };   // [v589] 결과=적용 미리보기
	    });
	  }
	  // [v564·필수3] 전후 pair 결과 ↔ 원본 전/후 2장 토글. 원본은 보존, 표시 리스트만 펼침/접힘.
	  function _togglePairExpand(pairId, expand) {
	    if (!d.expandedOutputs) d.expandedOutputs = {};
	    if (expand) d.expandedOutputs[pairId] = true; else delete d.expandedOutputs[pairId];
	    d.activeDisplayId = null;
	    if (cur === 'caption' && typeof syncCaptionFromDom === 'function') { try { syncCaptionFromDom(); } catch (_e) { void _e; } }
	    setScreen(cur, { push: false });
	  }
	  function _capCarouselHtml() {
	    var items = _displayItems();
	    if (items.length < 2) return '';   // 결과물/표시 아이템 1개 이하 → 캐러셀 없이 기존 단일 프리뷰
	    var active = d.activeDisplayId || items[0].id;
	    var n = items.length;
	    // [v531] scroll-snap 가로 캐러셀 — 손가락 스와이프로 넘김(슬라이드를 한 줄로 깔고 overflow 스크롤).
	    var slides = items.map(function (it, i) {
	      // [v564·필수3] 템플릿 결과 카드는 탭하면 원본 전/후 2장으로 펼침, 펼친 사진은 탭하면 결과로 접힘.
	      var toggleAttr = it.kind === 'output' && it.expandable ? ' data-fl-tplexpand="' + esc(it.id) + '"'
	        : (it.ofPair ? ' data-fl-tplcollapse="' + esc(it.ofPair) + '"' : '');
	      var toggleHint = it.kind === 'output' && it.expandable ? '<span class="cap-car__toggle">탭 → 전·후 펼치기</span>'
	        : (it.ofPair ? '<span class="cap-car__toggle">탭 → 결과로 접기</span>' : '');
	      return '<div class="cap-car__slide" data-fl-carslide="' + esc(it.id) + '"' + toggleAttr + '>' +
	        '<span class="cap-car__badge">' + (i + 1) + ' / ' + n + ' · ' + esc(it.label) + '</span>' + toggleHint +
	        '<div class="cap-car__img" style="background-image:url(' + esc(it.url) + ')"></div></div>';
	    }).join('');
	    var dots = items.map(function (it) { return '<button type="button" class="cap-car__dot' + (it.id === active ? ' on' : '') + '" data-fl-cardot="' + esc(it.id) + '" aria-label="이 결과물 보기"></button>'; }).join('');
	    var outN = (d.templateOutputs || []).length;
	    return '<div class="cap-car" data-fl-carousel>' +
	      '<div class="cap-car__track" data-fl-cartrack>' + slides + '</div>' +
	      '<div class="cap-car__dots">' + dots + '</div>' +
	      (outN >= 2 ? '<p class="cap-car__hint">' + outN + '장의 전후 결과물로 게시글을 만들어요</p>' : '') +
	    '</div>';
	  }
	  function _carItems() { return _displayItems(); }
	  function _carIndexOf(id) { var its = _carItems(); for (var i = 0; i < its.length; i++) { if (its[i].id === id) return i; } return 0; }
	  function _carPaintDots(id) {
	    var root = el && el.querySelector('[data-fl-carousel]'); if (!root) return;
	    root.querySelectorAll('[data-fl-cardot]').forEach(function (dt) { dt.classList.toggle('on', dt.getAttribute('data-fl-cardot') === id); });
	    // [v541] 결과 캐러셀 active Pair 라벨 동기화(스크롤/도트/필 전환 시). 전체 재렌더 없음.
	    var lbl = el.querySelector('[data-fl-tpl-activelabel]');
	    if (lbl) { var its = _carItems(); for (var i = 0; i < its.length; i++) { if (its[i].id === id) { lbl.textContent = _carItemLabel(its[i], i); break; } } }
	  }
	  // [v531] 스크롤 위치 → active 결과물/dot 동기화(passive 스크롤 + rAF 스로틀, 전체 재렌더 없음).
	  function _carSyncActive() {
	    var track = el && el.querySelector('[data-fl-cartrack]'); if (!track) return;
	    if (track.__prog && Date.now() < track.__prog) return;   // dot 클릭 등 프로그램적 스크롤 중엔 sync 억제(dot 깜빡임 방지)
	    var its = _carItems(); if (!its.length) return;
	    var idx = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
	    idx = Math.max(0, Math.min(its.length - 1, idx));
	    var id = its[idx].id;
	    if (id === d.activeDisplayId) return;
	    d.activeDisplayId = id; _carPaintDots(id);
	  }
	  // dot 클릭 → 해당 슬라이드로 부드럽게 스크롤(스크롤 이벤트가 active 동기화).
	  function _carSet(id) {
	    d.activeDisplayId = id;
	    var track = el && el.querySelector('[data-fl-cartrack]'); if (!track) { _carPaintDots(id); return; }
	    _carPaintDots(id);   // dot/라벨은 즉시 반영(응답성) — 실제 스크롤은 아래에서 디바운스
	    // [버그수정] dot 연타 시 매 클릭마다 새 smooth scroll 애니메이션이 서로를 끊어 화면이 잘린 채 잠깐 멈추던 문제.
	    //   짧은 시간(90ms) 안에 또 클릭되면 이전 스크롤 예약을 취소하고 '마지막으로 클릭한 곳'으로만 한 번 스크롤한다.
	    if (track.__setTimer) clearTimeout(track.__setTimer);
	    track.__setTimer = setTimeout(function () {
	      track.__setTimer = null;
	      track.__prog = Date.now() + 700;   // 스크롤 정착까지 scroll-sync 억제 → 선택한 dot 유지
	      var left = _carIndexOf(id) * track.clientWidth;
	      if (track.scrollTo) track.scrollTo({ left: left, behavior: 'smooth' }); else track.scrollLeft = left;
	    }, 90);
	  }
	  var _carRaf = 0;
	  function _mountCarousel() {
	    var track = el && el.querySelector('[data-fl-cartrack]'); if (!track || track._wsBound) return;
	    track._wsBound = true;
	    // 재렌더 시 현재 active 위치로 점프(스크롤 보존)
	    track.scrollLeft = _carIndexOf(d.activeDisplayId || (_carItems()[0] && _carItems()[0].id)) * track.clientWidth;
	    track.addEventListener('scroll', function () {
	      if (_carRaf) return;
	      var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 32); };
	      _carRaf = raf(function () { _carRaf = 0; _carSyncActive(); });
	    }, { passive: true });
	    // [#16] PC(마우스)에서도 사진을 좌우로 끌어 넘김 — 터치는 네이티브 스크롤 그대로.
	    var dn = false, sx = 0, sl = 0, mv = 0;
	    track.addEventListener('pointerdown', function (e) {
	      if (e.pointerType === 'touch') return;
	      dn = true; sx = e.clientX; sl = track.scrollLeft; mv = 0; track.style.scrollSnapType = 'none'; track.style.cursor = 'grabbing';
	    });
	    track.addEventListener('pointermove', function (e) {
	      if (!dn) return; var dx = e.clientX - sx; mv = Math.max(mv, Math.abs(dx)); track.scrollLeft = sl - dx;
	    });
	    var _end = function () {
	      if (!dn) return; dn = false; track.style.scrollSnapType = ''; track.style.cursor = '';
	      var its = _carItems(); if (its.length) { var idx = Math.max(0, Math.min(its.length - 1, Math.round(track.scrollLeft / Math.max(1, track.clientWidth)))); _carSet(its[idx].id); }
	    };
	    track.addEventListener('pointerup', _end); track.addEventListener('pointerleave', _end);
	    track.addEventListener('click', function (e) { if (mv > 6) { e.stopPropagation(); e.preventDefault(); mv = 0; } }, true);
	  }
	  function _pairThumb(p, tag) {
	    return '<span class="up-pair__thumb" style="background-image:url(' + esc(p.dataUrl) + ')"><em>' + tag + '</em></span>';
	  }
	  // [이슈1] 전후가 어떻게 묶이는지 사용자에게 명확히: Pair 1(전+후) · 남은 사진은 부족 안내.
	  function _pairPreviewHtml(cnt) {
	    // [Phase A-1] 'Pair N' 미리보기는 전후 템플릿 합성 단계 전용 → 심플 플로우에선 미노출(타일 역할칩으로 충분).
	    return '';
	    if (!cnt.before && !cnt.after) return '';
	    var pp = _computePairs();
	    var rows = pp.pairs.map(function (pr, i) {
	      return '<div class="up-pair"><span class="up-pair__n">Pair ' + (i + 1) + '</span>' +
	        _pairThumb(pr.before, '전') + '<i class="up-pair__plus">+</i>' + _pairThumb(pr.after, '후') + '</div>';
	    }).join('');
	    var leftover = '';
	    pp.leftBefore.forEach(function (p) { leftover += '<div class="up-pair up-pair--left">' + _pairThumb(p, '전') + '<span class="up-pair__need">후 사진 1장이 더 필요해요</span></div>'; });
	    pp.leftAfter.forEach(function (p) { leftover += '<div class="up-pair up-pair--left">' + _pairThumb(p, '후') + '<span class="up-pair__need">전 사진 1장이 더 필요해요</span></div>'; });
	    var head = pp.pairs.length ? ('전후 ' + pp.pairs.length + '쌍 만들 수 있어요') : '전·후를 한 장씩 지정하면 짝이 만들어져요';
	    return '<div class="up-pairs"><div class="up-pairs__head">' + esc(head) + '</div>' + rows + leftover + '</div>';
	  }
	  // [#2/#5] 선택된 사진(선택순)만 대상으로 첫=전/둘째=후 자동 배치. 수동지정(roleManual)은 보존.
	  function reassignRoles() {
	    var sel = _selectedOrdered();
	    sel.forEach(function (p, i) {
	      if (p.roleManual) return;   // 사용자가 직접 지정한 사진은 자동배치에서 보존
	      if (i === 0 && sel.length >= 2) p.role = 'before';   // 2장 이상이면 첫=전/둘째=후 자동(나머지는 중립)
	      else if (i === 1) p.role = 'after';
	      else p.role = 'hero';
	    });
	    // [다양성 팩 2026-07-12] 자동배치된 첫 2장(둘 다 non-manual)에 한해 EXIF 촬영시각/밝기로 전·후 순서 재추정.
	    if (sel.length >= 2 && window.WSBAAutoRole && !sel[0].roleManual && !sel[1].roleManual
	        && sel[0].role === 'before' && sel[1].role === 'after') {
	      try { if (window.WSBAAutoRole.decide(sel[0], sel[1]).swap) { sel[0].role = 'after'; sel[1].role = 'before'; } } catch (_e) { void _e; }
	    }
	  }
	  // 새 사진들의 EXIF 촬영시각 + 밝기를 비동기로 캐시한 뒤 전·후 순서를 한 번 더 재추정(+화면 갱신).
	  //   files[i] ↔ 방금 push 된 photo[i] (같은 순서). 실패해도 기존 순서배치 그대로(회귀 0).
	  function _precomputeBAHints(files, count) {
	    if (!window.WSBAAutoRole) return;
	    var news = (d.photos || []).slice(-count), jobs = [];
	    news.forEach(function (p, i) {
	      if (p._captureTime === undefined && files && files[i]) jobs.push(window.WSBAAutoRole.readExifTime(files[i]).then(function (t) { p._captureTime = t; }));
	      if (p._lum == null && (p.editedDataUrl || p.dataUrl)) jobs.push(window.WSBAAutoRole.imgLuma(p.editedDataUrl || p.dataUrl).then(function (l) { p._lum = l; }));
	    });
	    if (!jobs.length) return;
	    Promise.all(jobs).then(function () { reassignRoles(); if (cur === 'upload' || cur === 'template') _repaintUpload(); }).catch(function () { /* 실패해도 순서배치 그대로 */ });
	  }
	  // [#5] 사진별 전/후 직접 지정. 같은 값 다시 누르면 해제(자동 배치로 복귀).
	  function _setRole(i, role) {
	    var p = d.photos[i]; if (!p) return;
	    if (p.role === role && p.roleManual) { p.roleManual = false; reassignRoles(); }
	    else { p.role = role; p.roleManual = true; }
	    // [v531] 역할이 바뀌면 이미 적용된 전후 결과물은 무효 — 다시 적용해야 함(합성 재실행은 적용 버튼에서만).
	    if (d.templateOutputs && d.templateOutputs.length) {
	      d.templateOutputs = []; d.templateOutput = null; d.templateOutputId = null; d.templateId = null; d.template = null; d.activeDisplayId = null;
	      toast('역할이 바뀌어 템플릿을 다시 적용해야 해요');
	    }
	    _repaintUpload();   // [v531 렉] 전체 재렌더 금지 — in-place 갱신
	  }
	  // [#2] 타일 탭 → 선택/해제 토글. 선택 시 맨 끝 순서(selSeq)로, 해제 시 배지 제거·수동역할 해제.
	  //   남은 선택 사진은 reassignRoles+랭크 재계산으로 1부터 빈번호 없이 다시 매겨진다.
	  function _toggleSelect(i) {
	    var p = d.photos[i]; if (!p) return;
	    if (p.selected === false) { p.selected = true; p.selSeq = ++d._selSeq; }
	    else { p.selected = false; p.roleManual = false; }
	    reassignRoles(); _repaintUpload();   // [v531 렉] 선택 토글도 in-place 갱신
	  }
	  function addFiles(files, showToast, toEdit) {
	    files = Array.from(files || []).slice(0, 10);
	    if (!files.length) return Promise.resolve([]);
	    // [#6] 업로드 픽커가 느린 원인 = 폰 사진(3~8MB) 원본을 그대로 base64 로 읽어 담던 것.
	    //   2MB 초과분은 먼저 1920px JPEG 로 축소(_resizeIfNeeded) 후 읽어 import·썸네일·편집기 로딩을 크게 단축.
	    var _resize = (typeof window._resizeIfNeeded === 'function') ? window._resizeIfNeeded : function (f) { return Promise.resolve(f); };
	    return Promise.all(files.map(function (f) { return Promise.resolve(_resize(f, 1920)).catch(function () { return f; }).then(fileToDataUrl); })).then(function (urls) {
	      urls.forEach(function (u) { d.photos.push({ id: uid(), dataUrl: u, role: 'hero', selected: true, selSeq: ++d._selSeq }); });
	      // [QA hotfix] 다중 업로드 시 전후/홍보컷 자동 확정 금지 — 사용자가 '전/후 토글' 또는
	      //   카테고리/템플릿으로 직접 용도를 고르게 한다. (전/후 카테고리로 진입한 경우만 baMode 유지)
	      reassignRoles();
	      _precomputeBAHints(files, urls.length);   // [다양성 팩] EXIF/밝기로 전·후 순서 자동추정(비동기, 준비되면 재배치)
	      // [v564·필수1] 홈 '시작하기'→파일선택→바로 편집. 중간 업로드 화면을 건너뛴다.
	      // [v575·필수1] 직행 진입은 편집을 '베이스 화면'으로 — push:false 로 navStack 을 비워 둔다.
	      //   기존엔 기본 push 로 cur('upload')가 navStack 에 쌓여, 뒤로가기 시 안 거쳐온 '업로드 화면'이 떴다.
	      //   이제 navStack 이 비어 back → _systemBack → close → 작업실 홈으로 바로 복귀(중간 업로드 화면 X).
	      // [v590·#1] 심플 플로우면 업로드 진입경로(홈 시작하기 포함) 불문하고 '캡션 생성'으로 직행.
      //   기존엔 toEdit(홈→편집) 우선이라 사진편집으로 새던 회귀. SIMPLE_FLOW 최우선.
      if (!d.textOnly && editablePhotos().length) { setScreen('layout', { push: false }); }   // 사진 로드 후 '레이아웃 고르기'로
      else if (toEdit && editablePhotos().length) { d.editIdx = 0; setScreen('edit', { push: false }); }  // [v588·#1] 업로드 직후 바로 캡션
	      else { setScreen('upload'); }
	      if (showToast) toast(urls.length + '장 추가됨');
	      return urls;
	    });
	  }
	  function syncCaptionFromDom() {
	    // [v584] 캡션은 카드 안 contenteditable(igcap)이 원본. (레거시 capbody 도 호환)
	    var ig = el.querySelector('[data-fl-igcap]');
	    if (ig && ig.isContentEditable) { d.caption = (ig.textContent || '').trim(); return; }
	    var b = el.querySelector('[data-fl-capbody]'); if (b && b.getAttribute('data-empty') !== '1') d.caption = (b.value != null ? b.value : b.textContent).trim();
	    if (ig) ig.textContent = d.caption;
	  }

  // 캡션 화면을 떠나거나 다음 단계로 갈 때 — 입력창 3종(시술명/본문/꼬리말)의 최신값을 한 번에 state 로 확정.
  //  입력값을 버튼 클릭 시점에만 저장하던 회귀를 막아, 위쪽 '이대로 작성' 없이 하단 CTA 만으로도 반영되게 한다.
  // [v531] 해시태그 문자열 → #태그 배열(중복 제거). 본문과 분리된 해시태그 편집칸 파싱.
  // [T-104 P0] _parseHashes → flow/util.js
  function flushCaptionInputs() {
    syncServiceFromDom();
    if (!el) return;
    var ig = el.querySelector('[data-fl-igcap]');   // [v584] 카드 안 캡션 편집(원본)
    if (ig && ig.isContentEditable) { d.caption = (ig.textContent || '').trim(); }
    else { var b = el.querySelector('[data-fl-capbody]'); if (b && b.getAttribute('data-empty') !== '1') d.caption = (b.value != null ? b.value : b.textContent).trim(); }
    var f = el.querySelector('[data-fl-footer]'); if (f && typeof f.value === 'string') d.captionTemplate = f.value;
    // [v587] 해시태그 = 카드 안 contenteditable(.ig-hash-edit) → d.hashtags/selectedHashes(저장·미리보기·복사 반영).
    var h = el.querySelector('[data-fl-ighash]');
    if (h && h.isContentEditable) { var hs = _parseHashes(h.textContent); d.hashtags = hs; d.selectedHashes = hs.slice(); }
  }

  function back() {
    // [#1] 인앱 back = 시스템 back 과 100% 동일하게 history.back() 으로 통일.
    //  단계가 남았으면 popstate 리스너가 한 화면 복귀, 베이스면 _systemBack 이 닫는다.
    if (cur === 'caption') flushCaptionInputs();
    history.back();
  }
  // [refactor S3] 전환 전 스텝별 로직은 STEP_FX[cur].onExit 에 위임(무동작변경). 흩어진 if(cur===) 사다리 제거 → 스텝 변경 시 레지스트리 한 줄.
  function onCta() {
    var c = CTA[cur]; if (!c) return;
    var fx = STEP_FX[cur];
    if (fx && fx.onExit) {
      var r = fx.onExit(c.to);
      if (r === false) return;                                       // 검증 실패/캡션 생성 등 — 전환 취소
      if (r && typeof r.then === 'function') {                       // bake/compose 등 비동기 — 완료 후 전환(성공·실패 모두 진행)
        return r.then(function () { _ctaGo(c.to); }).catch(function () { _ctaGo(c.to); });
      }
    }
    _ctaGo(c.to);
  }
  // 실제 전환 — 특수 대상(__save=저장 완료, __edit=통합 편집기) 처리 후 setScreen.
  function _ctaGo(to) {
    if (to === '__save') return save();
    if (to === '__edit') return _openEditFirst();   // [통합 편집기] 업로드 다음 = ItdEditor
    setScreen(to);
  }

  function openCropFlow() {
    if (!(window.WorkspaceAdapter && window.WorkspaceAdapter.openCrop)) { toast('크롭 모듈을 불러오지 못했어요'); return; }
    var idx = d.photos.indexOf(curEditPhoto()); if (idx < 0) idx = 0;
    window.WorkspaceAdapter.openCrop({
      photos: d.photos, index: idx, ratio: CROP_RATIO[d.tplPurpose] || '4:5',
      onApply: function (photoId, dataUrl, meta) {
        var p = d.photos.filter(function (x) { return x.id === photoId; })[0];
        if (p) { p.editedDataUrl = dataUrl; p.cropMeta = meta; }
        d.previewUrl = null;
        if (cur === 'edit') { setScreen('edit'); _refreshPreview(); }
      },
    });
  }

  // [T-104 P4] pickCustomer → flow/connect.js

  function buildSlot() {
    var slot = d.slot || { id: uid(), order: 0, createdAt: Date.now() };
    var now = Date.now();
	    slot.label = d.customerName || slot.label || (d.service ? d.service.split(',')[0].trim() : '새 콘텐츠');
	    slot.photos = d.photos.map(function (p) { return { id: p.id, dataUrl: p.dataUrl, editedDataUrl: p.editedDataUrl || null, role: p.role, cropMeta: p.cropMeta || null, templateId: p.templateId || null, editState: p.editState || null, baseUrl: p.baseUrl || null, updatedAt: now }; });   // [#11] editState=재편집 이어가기 보존
	    // [이슈2] 전후 템플릿 합성 결과물은 사진 배열과 분리된 전용 필드로 저장(원본 슬롯 비오염).
	    // [다중pair] 페어별 결과물 배열 저장 + 단일 templateOutput 미러(구 코드/홈 썸네일 하위호환).
	    slot.templateOutputs = (d.templateOutputs && d.templateOutputs.length) ? d.templateOutputs.slice() : [];
	    slot.templateOutput = d.templateOutput || (slot.templateOutputs[0] && slot.templateOutputs[0].outputUrl) || null;
	    slot.service = d.service || '';
	    slot.caption = d.caption || '';
    slot.hashtags = (d.selectedHashes && d.selectedHashes.length ? d.selectedHashes : d.hashtags).join(' ');
    slot.customer_id = d.customerId || null;
    slot.customer_name = d.customerName || '';
    slot.status = 'done';
    slot.workspaceContext = Object.assign({}, slot.workspaceContext, {
      type: TYPE_MAP[d.tplPurpose] || 'promo',
      expectedPhotos: d.tplPurpose === 'before_after' ? 2 : 1,
      defaultRatio: CROP_RATIO[d.tplPurpose] || '4:5',
	      templatePurpose: d.tplPurpose || 'feed',
	      templateId: d.templateId || null,
	      templateLabel: d.template || '',
	      captionMode: d.captionMode || 'normal',
      createdFrom: 'workspace_v2',
    });
    slot.captionMeta = {
      mode: d.captionMode || 'normal', length_tier: d.capLen || 'medium', tone_override: d.capTone || 'normal',
      generatedAt: d.caption ? ((slot.captionMeta && slot.captionMeta.generatedAt) || now) : null, log_id: d.logId || null,
    };
    slot.publish = Object.assign({ status: 'draft', instagramPreparedAt: null, publishedAt: null }, slot.publish, d.publish || {});
    d.slot = slot;   // [#13] 만든 슬롯을 고정 — 이후 저장(에디터 완료·발행 등)이 같은 id 를 갱신하게. 예전엔 매번 새 id 라 콘텐츠가 중복 저장됐음.
    return slot;
  }

  function save() {
    var slot = buildSlot();
    var done = function () {
      toast(d.customerName ? (d.customerName + ' 고객 기록에 저장했어요.') : '작업실에 저장했어요.');
      try { if (window.WorkMemory) window.WorkMemory.captureAndNotify(slot, d); } catch (_wm) { void _wm; }   // [T-115] 원장 작업 기억
      close();
      if (window.WorkspaceV2 && window.WorkspaceV2.refresh) window.WorkspaceV2.refresh();
    };
    if (window.WorkspaceAdapter && window.WorkspaceAdapter.saveItem) {
      window.WorkspaceAdapter.saveItem(slot).then(function (r) { if (r.ok) done(); else toast('저장에 실패했어요'); });
    } else { done(); }
  }

  function _markPrepared() {
    if (!d.publish) d.publish = { status: 'draft', instagramPreparedAt: null, publishedAt: null };
    d.publish.status = 'upload_ready'; d.publish.instagramPreparedAt = Date.now();
  }
  // [v547] 게시 완료 자동화/복귀 — 실 IG 업로드(publishInstagramV2)는 성공 시 이미 자동 published(아래 publish()).
  //   하지만 '이미지 저장→수동 게시' 흐름은 콜백이 없어, 저장 직후 확인 sheet 로 게시 완료를 표시·영속.
  function _askPublishedSheet() {
    if (!el) return;
    _closePublishSheet();
    var wrap = document.createElement('div');
    wrap.className = 'pub-ask'; wrap.setAttribute('data-fl-pubask', '');
    wrap.innerHTML =
      '<div class="pub-ask__bd" data-fl="pubnot"></div>' +
      '<div class="pub-ask__sheet" role="dialog" aria-label="게시 확인">' +
        '<div class="pub-ask__grip"></div>' +
        '<div class="pub-ask__ic"><i class="ph-duotone ph-instagram-logo"></i></div>' +
        '<div class="pub-ask__t">인스타에 올리셨어요?</div>' +
        '<div class="pub-ask__d">이미지를 기기에 저장했어요.<br>인스타에 올렸다면 게시 완료로 표시해 둘게요.</div>' +
        '<div class="pub-ask__btns">' +
          '<button type="button" class="pub-ask__not" data-fl="pubnot">아직이에요</button>' +
          '<button type="button" class="pub-ask__done" data-fl="pubdone"><i class="ph-bold ph-check"></i>게시 완료</button>' +
        '</div></div>';
    el.appendChild(wrap);
    var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
    raf(function () { wrap.classList.add('open'); });
  }
  function _closePublishSheet() { var w = el && el.querySelector('[data-fl-pubask]'); if (w && w.parentNode) w.parentNode.removeChild(w); }
  function _markPublishedNow() {
    d.publish = d.publish || {}; d.publish.status = 'published'; d.publish.publishedAt = Date.now();
    if (window.WorkspaceAdapter && window.WorkspaceAdapter.saveItem) { try { window.WorkspaceAdapter.saveItem(buildSlot()); } catch (_e) { void _e; } }
    try { if (window.WorkMemory) window.WorkMemory.captureAndNotify(buildSlot(), d); } catch (_wm) { void _wm; }   // [T-115] 원장 작업 기억
    _closePublishSheet();
    toast('게시물이 저장되었습니다');
    // [v548] 게시 완료 시 작업이 끝났음을 명확히 — 플로우 닫고 작업실 홈으로(카드 게시완료 badge 갱신).
    if (window.WorkspaceV2 && window.WorkspaceV2.refresh) window.WorkspaceV2.refresh();
    close();
  }

  // [C6/#10] 게시 — 잇비 봇 로딩 모달(시안 B). 단계 멘트 + 최소 노출감
  // [T-104 P3] 발행 진행 오버레이(_pubQ·_pubStage·_pubShow·_pubHide·_pubFinish + PUB_MSG) → flow/publish-progress.js (ctx={el})
  var _WSPP = (window.WSFlowPubProgress && window.WSFlowPubProgress.create) ? window.WSFlowPubProgress.create({ el: function () { return el; } }) : {};
  var _pubShow = _WSPP._pubShow, _pubHide = _WSPP._pubHide, _pubFinish = _WSPP._pubFinish;

	  function publish(kind) {
	    // [버그수정 2026-07-10] 레이아웃 합성본(여러 장→1장)이 있으면 캐러셀 요청도 단일 피드로 — 원본 여러 장 전송/실패 방지.
	    if (kind === 'carousel' && d.wsLayout && d.templateOutput) kind = 'feed';
	    if (!window.WorkspaceAdapter) return;
	    var _igp = window.WorkspaceAdapter.instagram();
	    if (!_igp.connected) { toast('인스타 연결 후 올릴 수 있어요'); return; }
	    // [버그수정] connected=true 여도 토큰이 죽어있으면(만료·계정 비활성화 등) 그대로 진행 시 "올리는 중…"
	    //   애니메이션만 보여주고 조용히 실패하던 문제 — 시작 전에 명확한 안내로 막는다.
	    if (!_igp.tokenValid) { toast('인스타 연동이 끊겼어요 — 설정에서 다시 연결해 주세요'); return; }
	    // [slot-sync Phase B] 캐러셀은 각 장을 캔버스로 JPEG 인코딩 → 다른 기기(https) 이미지는 taint 로 막힘. 먼저 수화.
	    //   (피드/스토리 단일 발행은 fetch→blob 경로라 CORS(*)로 그냥 됨 — 게이트 불필요.)
	    if (kind === 'carousel' && _needsHydrate() && !d._hydrateTried) { d._hydrateTried = true; toast('사진 불러오는 중…'); _hydrateD().then(function (ok) { if (!ok) d._hydrateTried = false; /* [버그수정 2026-07-06] 실패 시 재시도 가능 */ publish(kind); }); return; }
	    if (d._publishing) return;
	    syncCaptionFromDom();
	    d._publishing = kind || 'feed'; setScreen('caption');
    var slot = buildSlot();
    _pubShow();
    Promise.resolve(window.WorkspaceAdapter.saveItem ? window.WorkspaceAdapter.saveItem(slot) : { ok: true }).then(function (sr) {
	      if (!sr || !sr.ok) { d._publishing = false; _pubHide(); toast('저장에 실패해 게시를 중단했어요'); setScreen('caption'); return; }
      d.slot = slot;
      if (!window.WorkspaceAdapter.publishInstagramV2) {
	        d._publishing = false; _pubHide(); _markPrepared(); setScreen('caption'); toast('게시 준비 완료 — 업로드 기능을 불러오지 못했어요'); return;
      }
      var cap = (d.caption || '') + (d.hashtags.length ? '\n\n' + d.hashtags.join(' ') : '');
      // [캐러셀] 여러 장이면 각 사진의 표시 이미지(편집 반영본)를 모아 보냄.
      var _imgs = (kind === 'carousel') ? (editablePhotos() || []).map(function (p) { return dispUrl(p); }).filter(Boolean) : null;
      // [audit#6] 발행 직전 태그칸 flush — input 이벤트 못 받은 값(IME/붙여넣기 직후 즉시 발행)도 반영.
      try { var _utEl = el && el.querySelector('[data-fl-usertags]'); if (_utEl) d.igUserTags = String(_utEl.value || '').split(/[,\s]+/).map(function (s) { return s.replace(/^@/, '').trim(); }).filter(Boolean).slice(0, 20); } catch (_ue) { void _ue; }
      // [계정 태그] 피드에서만 — 입력한 @아이디를 자동 위치(세로로 분산)로 태그.
      var _tagArr = d.igUserTags || [];
      // [계정 태그 2026-07-14] 캐러셀(여러 장)도 태그 전송 — 기존 조건이 kind==='feed' 라 5장 발행 시
      //   태그가 '실패'가 아니라 '처음부터 안 나감'이었다(에러도 안 뜸). 백엔드가 커버(첫 장) child 에 적용.
      var _utags = _tagArr.length ? _tagArr.map(function (u, i) { return { username: u, x: 0.5, y: Math.min(0.85, 0.32 + i * (0.46 / Math.max(1, _tagArr.length))) }; }) : null;
      var _pubImg = outputUrl();   // 대표 이미지(레이아웃 합성본 또는 대표 사진)
      window.WorkspaceAdapter.publishInstagramV2({ slotId: slot.id, imageUrl: _pubImg, imageUrls: _imgs, caption: cap, userTags: _utags, kind: kind || 'feed' }).then(function (r) {
        r = r || {};
        if (r.ok) {
          d.publish = d.publish || {}; d.publish.status = 'published'; d.publish.publishedAt = Date.now();
          // [성과 2026-07-14] 인스타 media id 를 슬롯에 남긴다 — 성과 화면이 '이 게시물'과 인스타 지표를
          //   이어붙이는 유일한 열쇠. 예전엔 학습 로그로만 흘려보내고 슬롯엔 안 남아서 캡션 앞글자 매칭에 의존했음.
          var _mid = (r.data && (r.data.media_id || r.data.id)) || null;
          var _plink = (r.data && r.data.permalink) || null;
          if (_mid) d.publish.igMediaId = String(_mid);
          if (_plink) d.publish.igPermalink = String(_plink);
          // [P1 학습 루프] 발행한 최종 캡션을 학습에 반영 — final_text→PastPost 역반입(백엔드). 발행 성공 시만.
          try {
            if (d.logId && window.WorkspaceAdapter.recordPublishedCaption) {
              window.WorkspaceAdapter.recordPublishedCaption(d.logId, cap, _mid || _plink);
            }
          } catch (_le) { void _le; }
          // [v542] 게시 완료 상태를 저장소에 반영(이전엔 게시 전 slot 만 저장 → 새로고침 시 badge 사라짐).
          if (window.WorkspaceAdapter.saveItem) { try { window.WorkspaceAdapter.saveItem(buildSlot()); } catch (_e) { void _e; } }
          try { if (window.WorkMemory) window.WorkMemory.captureAndNotify(buildSlot(), d); } catch (_wm) { void _wm; }   // [T-115] 원장 작업 기억
          _pubFinish(function () {
            d._publishing = false;
            toast(kind === 'carousel' ? '여러 장 게시물을 올렸어요' : '인스타그램에 올렸어요');
            if (window.WorkspaceV2 && window.WorkspaceV2.refresh) window.WorkspaceV2.refresh();
            setScreen('connect');   // [#12] 게시 완료 → 바로 고객 연결 화면(닫지 않음)
          });
          return;
        }
        d._publishing = false; _pubHide();
        if (r.reason === 'ambiguous') { _markPrepared(); toast('게시 준비 완료 — 업로드 결과 확인이 필요해요'); }
	        else {
	          var m = { not_connected: '인스타 연결이 필요해요', blob: '이미지 생성에 실패했어요', api: '업로드 API 호출에 실패했어요', server: '서버가 업로드를 거부했어요' }[r.reason] || '업로드에 실패했어요';
	          console.warn('[wsv2flow] instagram publish failed', r);
	          toast(r.detail ? (m + ' — ' + r.detail) : m);
	        }
        setScreen('caption');
      });
    }).catch(function (e) {
      // [audit] 발행 중 예외(저장 거부/콜백 오류) 시 갇히지 않게 복구 — _publishing 이 true 로 남으면 이후 발행이 영구 차단됨.
      d._publishing = false; _pubHide();
      console.warn('[wsv2flow] publish chain failed', e);
      toast('업로드 중 문제가 생겼어요 — 다시 시도해 주세요');
      setScreen('caption');
    });
  }

  /* ── open/close ── */
  function ensureEl() {
    el = document.getElementById('wsv2Flow');
    if (el) return;
    el = document.createElement('div');
    el.id = 'wsv2Flow'; el.className = 'wsv2flow';
    el.innerHTML = shell();
    document.body.appendChild(el);
    bind();
    _bindPop();
  }

  function open(opts) {
    opts = opts || {};
	    ensureEl();
	    var slot = opts.slot || null;
	    var incomingFiles = Array.from(opts.files || []);
	    var wc = (slot && slot.workspaceContext) || null;
	    var ctx = CAT_CTX[opts.cat] || {};
	    // [QA hotfix] 사진 2장+ 라고 전후로 자동 확정하지 않음. 전후는 '전후' 카테고리 선택 또는 토글로만.
	    var purpose = (wc && wc.templatePurpose) || ctx.purpose || 'feed';
    var capMode = (wc && wc.captionMode) || ctx.captionMode || 'normal';
    var cm = (slot && slot.captionMeta) || {};
    var hadRoles = !!(slot && slot.photos && slot.photos.some(function (p) { return p && p.role; }));
    d = {
      slot: slot,
      photos: slot && slot.photos ? slot.photos.map(function (p, i) { return { id: p.id || uid(), dataUrl: p.dataUrl, editedDataUrl: p.editedDataUrl, role: p.role || 'hero', cropMeta: p.cropMeta || null, editState: p.editState || null, baseUrl: p.baseUrl || null, selected: true, selSeq: i + 1 }; }) : [],   // [#11] editState 복원
      _selSeq: (slot && slot.photos ? slot.photos.length : 0),
      baMode: purpose === 'before_after',
	      template: (wc && wc.templateLabel) || null, templateId: (wc && wc.templateId) || null,
	      templateOutput: (slot && slot.templateOutput) || null, templateOutputId: (wc && wc.templateId) || null,
	      templateOutputs: _hydrateOutputs(slot, wc), activeDisplayId: null,
	      tplCat: ctx.tplLabel || (wc && wc.type === 'before_after' ? '전후' : null),
	      tplPurpose: purpose, captionMode: capMode, defaultRole: ctx.role || 'hero',
      textOnly: !!(opts.textOnly),
      service: slot && slot.service ? slot.service : '', caption: slot ? (slot.caption || '') : '', hashtags: slot && slot.hashtags ? String(slot.hashtags).split(/\s+/).filter(Boolean) : [], selectedHashes: [],
      customerId: slot ? (slot.customer_id || null) : null, customerName: slot ? (slot.customer_name || '') : '', customerVc: 0, custQuery: '',
      capLen: cm.length_tier || 'medium', capTone: cm.tone_override || 'normal', logId: cm.log_id || null,
      capUsePersona: (cm.use_persona !== false),   // [P2 2026-07-10] 원장님 말투 반영 기본 ON(전송 시 IG연동 게이트 유지) — 저장본이 명시적 false면 존중

      publish: (slot && slot.publish) ? Object.assign({}, slot.publish) : { status: 'draft', instagramPreparedAt: null, publishedAt: null },
      recent: [], recentLoaded: false, capLoading: false, capSeg: 'rec',
	      editTab: 'skin', control: null, basicTool: 'brightness', precTool: null, editIdx: null, bgOpen: false, advOpen: true, tplOpen: true, adjust: newAdjust(), beauty: newBeauty(), undo: [], redo: [], originalPreview: false, previewUrl: null, bgAction: null, bgColor: null, bgBusy: false, bgFail: false,
      maskPaint: false, maskBrush: 26, maskErase: false, _paintCv: {},   // [v561] 직접 칠하기(수동 마스크)
	      captionAxes: null, captionTemplate: '',
	    };
	    if (d.photos.length && !hadRoles) reassignRoles();
    el.classList.add('is-open');
    // [slot-sync coalesce] 편집 플로우 열림 — 정착(close/발행) 전까지 매 저장 업로드 억제.
    try { if (window.WorkspaceSync && window.WorkspaceSync.beginEdit) window.WorkspaceSync.beginEdit(); } catch (_be) { void _be; }
    // [피드 미리보기] 발행 미리보기 그리드용 기존 피드 썸네일을 미리 당겨 메모리 캐시(도달 시 0.1초). 저장 X.
    try { if (window.WorkspaceAdapter && window.WorkspaceAdapter.recentMedia) window.WorkspaceAdapter.recentMedia(); } catch (_rm) { void _rm; }
    // [작업물 미리보기 2026-07-10] 미연동 원장님용 — 내 작업물 썸네일을 미리 캐시(도달 시 즉시). 로컬 IndexedDB, 저장 X. 이번 슬롯은 제외(NEW 칸 중복 방지).
    d._myWorkThumbs = [];
    try {
      if (window.loadSlotsFromDB) {
        Promise.resolve(window.loadSlotsFromDB()).then(function (list) {
          var out = [];
          (list || []).forEach(function (s) {
            if (!s || (d.slot && s.id === d.slot.id)) return;
            var t = _slotThumb(s);
            if (t) out.push(t);
          });
          d._myWorkThumbs = out;
          var _conn = window.WorkspaceAdapter && window.WorkspaceAdapter.instagram ? window.WorkspaceAdapter.instagram().connected : false;
          if (out.length && !_conn && (cur === 'caption' || cur === 'preview') && !_isEditingCaptionCard()) setScreen(cur, { push: false });
        }).catch(function () {});
      }
    } catch (_mw) { void _mw; }
    navStack = []; _histDepth = 0;   // 새 세션 — 방문 히스토리 초기화
    // 시스템 back(안드로이드 하드웨어/스와이프, popstate)을 전역 sheet-back 레지스트리에 편입.
    //  미등록 시 안드로이드 back 이 오버레이를 안 닫고 홈 탭으로 점프해 오버레이가 떠버린 채 남는다.
    if (window._registerSheet) window._registerSheet('wsv2flow', _systemBack);
    if (window._markSheetOpen) window._markSheetOpen('wsv2flow');
    // textOnly → 바로 게시글 화면으로
    var startScreen = opts.startScreen && SCREENS.indexOf(opts.startScreen) >= 0 ? opts.startScreen : 'upload';
	    if (d.textOnly && startScreen === 'upload') startScreen = 'caption';
	    // [v540] 내 콘텐츠 편집 딥링크 — 버튼 의도(focus)에 맞춰 진입 탭/섹션 상태 미리 세팅(기존 콘텐츠 유지).
	    d._focusIntent = (startScreen === 'edit' && opts.focus) ? opts.focus : null;
	    if (d._focusIntent === 'background') { d.bgOpen = true; d.basicTool = 'background'; }
	    else if (d._focusIntent === 'crop') { d.editTab = 'tools'; d.advOpen = true; }
	    else if (d._focusIntent === 'template') { d.tplOpen = true; }
	    // [v564·필수1] 홈에서 파일과 함께 edit 로 바로 진입 시, 사진 로드 전 '빈 편집화면'이 깜빡이지
	    //   않도록 setScreen 을 addFiles 완료까지 미룬다(업로드 화면을 거치지 않음).
	    // [v590·#1] 사진이 아직 없는데 edit/caption 으로 바로 그리면 빈 화면이 깜빡 → 사진 들어온 뒤(addFiles) 그린다.
	    var _deferInit = ((startScreen === 'edit' || startScreen === 'caption') && incomingFiles.length && !d.photos.length);
	    if (!_deferInit) { setScreen(startScreen, { push: false }); _seedNavStack(startScreen); }   // [버그11] 직행 진입도 뒤로가기로 이전 단계 복귀
	    if (d._focusIntent) { var _rafF = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); }; _rafF(function () { _applyFocusScroll(); }); }
	    if (incomingFiles.length) addFiles(incomingFiles, true, startScreen === 'edit');
	    // [구조 통합] 잇비 채팅 사진(dataURL)을 작업실로 바로 투입 — File 변환 없이 직접.
	    if (opts.photoUrls && opts.photoUrls.length) addPhotoUrls(opts.photoUrls, true);
	  }
	  // dataURL 배열을 사진으로 추가(잇비 채팅 사진 핸드오프). addFiles 와 동일 규약, File 변환만 생략.
	  function addPhotoUrls(urls, showToast) {
	    urls = (urls || []).filter(function (u) { return typeof u === 'string' && u; }).slice(0, 10);
	    if (!urls.length || !d) return 0;
	    urls.forEach(function (u) { d.photos.push({ id: uid(), dataUrl: u, role: 'hero', selected: true, selSeq: ++d._selSeq }); });
	    reassignRoles();
    // [워크플로 재정렬] 사진 들어오면 업로드 화면 건너뛰고 바로 다음 단계.
    //   [ws-hyper 버그수정 2026-07-06] photoUrls(채팅/딥링크) 경로도 addFiles 와 동일하게 HYPER→레이아웃 분기.
    //   빠지면 HYPER인데 채팅으로 사진 던지면 옛 편집기가 열려 레이아웃 스텝을 건너뛴다.
    if (cur === 'upload') {
      if (!d.textOnly && editablePhotos().length) { setScreen('layout', { push: false }); }
      else setScreen('upload', { push: false });
    }
	    if (showToast) toast(urls.length + '장 추가됨');
	    return urls.length;
	  }
  // 전역 sheet 레지스트리 진입점 — 베이스(#wsv2flow) 가 history 에서 빠질 때 호출됨.
  //  단계 복귀는 _bindPop 의 popstate 리스너가 담당하므로, 여기선 단계 남으면 복귀/없으면 닫기만.
  function _systemBack() {
    if (!el || !el.classList.contains('is-open')) return;
    if (el.querySelector('[data-fl-tplpreview]')) { _closeTplPreview(); return; }   // [v541] 미리보기 시트 먼저 닫기
    if (el.querySelector('[data-fl-pubask]')) { _closePublishSheet(); return; }   // [v547] 게시 확인 sheet 먼저 닫기
    if (!_navBack()) close();   // [v531] navStack 비면 close → 작업실 홈
  }
  function close() {
    if (el) el.classList.remove('is-open');
    // [slot-sync coalesce] 편집 종료 → 정착: 최종본 1회 업로드+동기화.
    try { if (window.WorkspaceSync && window.WorkspaceSync.settleSlot) window.WorkspaceSync.settleSlot(); } catch (_se) { void _se; }
    var leftover = _histDepth;
    navStack = [];
    _histDepth = 0;
    // [#1] 저장/게시 등으로 흐름 도중 프로그램적으로 닫을 때 — 쌓아둔 단계 엔트리를 되감아 stale 방지.
    //  되감기 중 발생하는 popstate 는 _closingHist 로 무시. 이후 _markSheetClosed 가 #wsv2flow hash 제거.
    if (leftover > 0) {
      _closingHist = true;
      try { history.go(-leftover); } catch (_e) { void _e; }
      setTimeout(function () { _closingHist = false; if (window._markSheetClosed) window._markSheetClosed('wsv2flow'); }, 60);
      return;
    }
    if (window._markSheetClosed) window._markSheetClosed('wsv2flow');
  }

  // ── [구조 통합] 프로그램/자연어 명령 API — 잇비가 작업실 전 기능을 호출하는 단일 진입점 ──
  //   기존 내부 함수만 재사용(로직/저장 스키마 미변경). 화면 안 열렸을 때 'open' 외 명령은 무시.
  function _flowReady() { return !!(el && el.classList.contains('is-open') && d); }
  function _applyAdjustPatch(opts) {
    if (!_flowReady()) return { ok: false, reason: 'not_open' };
    d.undo = d.undo || []; d.undo.push(_snapEdit()); if (d.undo.length > 30) d.undo.shift(); d.redo = [];
    var set = opts.set || null, delta = opts.delta || null;
    if (set) Object.keys(set).forEach(function (k) { if (k in d.adjust) d.adjust[k] = Math.max(-100, Math.min(100, +set[k] || 0)); });
    if (delta) Object.keys(delta).forEach(function (k) { if (k in d.adjust) d.adjust[k] = Math.max(-100, Math.min(100, (+d.adjust[k] || 0) + (+delta[k] || 0))); });
    if (opts.beauty) Object.keys(opts.beauty).forEach(function (k) { if (k in d.beauty) d.beauty[k] = Math.max(0, Math.min(100, +opts.beauty[k] || 0)); });
    if (cur === 'edit') { _paintEditPhoto(); _setEditSection('[data-ed-basic]', _mainAdjustHtml()); _setEditSection('[data-ed-adv]', _advFoldHtml()); _setEditSection('[data-ed-bottom]', _editBottomHtml()); }
    _refreshPreview();
    return { ok: true };
  }
  // 이름으로 고객 연결 — 전역 Customer.search 우선, 없으면 최근 고객 매칭. 못 찾으면 connect 화면 안내.
  // [T-104 P4] _connectByName → flow/connect.js
  function command(cmd) {
    cmd = cmd || {};
    switch (cmd.type) {
      case 'open':
        open({ cat: cmd.cat || null, startScreen: cmd.screen || 'upload', textOnly: !!cmd.textOnly, files: cmd.files || null, photoUrls: cmd.photoUrls || null });
        return { ok: true };
      case 'goto':
        if (!_flowReady() || SCREENS.indexOf(cmd.screen) < 0) return { ok: false, reason: 'not_open' };
        setScreen(cmd.screen); return { ok: true };
      case 'adjust':
        return _applyAdjustPatch(cmd);
      case 'edit':   // 되돌리기/다시실행/비교/초기화
        if (!_flowReady()) return { ok: false, reason: 'not_open' };
        if (cur !== 'edit') setScreen('edit');
        _editBottom(cmd.action); return { ok: true };
      case 'bg':
        if (!_flowReady()) return { ok: false, reason: 'not_open' };
        if (cur !== 'edit') setScreen('edit');
        if (cmd.color) d.bgColor = cmd.color;
        applyBg(cmd.action || 'removeBg'); return { ok: true };
      case 'template':
        if (!_flowReady()) return { ok: false, reason: 'not_open' };
        if (cur !== 'edit') setScreen('edit');
        applyTemplate(cmd.key); return { ok: true };
      case 'caption':
        if (!_flowReady()) return { ok: false, reason: 'not_open' };
        if (cmd.service != null) d.service = String(cmd.service);
        if (cmd.axes) d.captionAxes = cmd.axes;   // [구조 통합] 상황(시술완성/신규 등)을 말로 받아 시나리오 칩 없이 생성
        // 항상 재렌더 → 입력창이 최신 service 를 반영(doGenerate 가 DOM 에서 다시 읽으므로 필수).
        setScreen('caption');
        doGenerate(cmd.extra || {}, cmd.label || null); return { ok: true };
      case 'customer':   // [구조 통합] "OOO 손님이랑 연결" 자연어로 고객 연결
        if (!_flowReady()) return { ok: false, reason: 'not_open' };
        if (cur !== 'connect') setScreen('connect');
        return _connectByName(cmd.name);
      case 'capvar':   // 다시/더길게/짧게/인스타 톤/초기화
        if (!_flowReady()) return { ok: false, reason: 'not_open' };
        // [버그수정 2026-07-09] 캡션화면 아닐 때 '게시글 다시 써줘'가 삼켜지던 것 → 캡션화면으로 이동 후 처리.
        if (cur !== 'caption') setScreen('caption', { push: false });
        if (cmd.variant === 'reset') { d.caption = ''; d.hashtags = []; d.selectedHashes = []; d.capLen = 'medium'; d.capTone = 'normal'; d.regenSeq = 0; d.logId = null; setScreen('caption'); return { ok: true }; }
        // [v532] insta → 백엔드 enum 'ornate'(기존 'instagram' 은 422 → 생성 실패). 모든 변형에 _regen 부여(동일 캡션 반복 방지).
        { var ex = { regen: { _regen: true }, long: { length_tier: 'long', _regen: true }, short: { length_tier: 'short', _regen: true }, insta: { tone_override: 'ornate', _regen: true } }[cmd.variant] || { _regen: true };
          doGenerate(ex, cmd.label || null); return { ok: true }; }
      case 'save':
        if (!_flowReady()) return { ok: false, reason: 'not_open' };
        save(); return { ok: true };
      case 'publish':
        if (!_flowReady()) return { ok: false, reason: 'not_open' };
        setScreen('caption'); publish(); return { ok: true };
      default:
        return { ok: false, reason: 'unknown' };
    }
  }
  function isOpen() { return _flowReady(); }

  // [잇비 연동] 채팅이 '현재 작업실'(진행 중 draft) 상태를 읽어 이어받기/제안에 쓸 수 있게 읽기전용 노출.
  function getActiveSlot() {
    if (!_flowReady()) return null;
    var p0 = curPhoto();
    return {
      open: true, screen: cur, cat: d.cat || null, service: d.service || '',
      photoCount: (d.photos || []).length,
      coverUrl: (p0 && (p0.editedDataUrl || p0.dataUrl)) || null,
      hasCaption: !!String(d.caption || '').trim()
    };
  }

  window.WorkspaceFlow = { open: open, close: close, command: command, isOpen: isOpen, getActiveSlot: getActiveSlot };
})();
