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
    _purposeCat = WSU._purposeCat, _containBlit = WSU._containBlit, clone = WSU.clone,   // [2026-07-26 원영] _parseHashes 사용처 소멸(해시태그=칩 UI) — import 제거
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
  var _genPending = 0; // [카오스 P2] in-flight 캡션 생성 개수 — stale 응답이 아직 대기 중인 fresh 스피너를 조기 해제하지 않게(내 응답이거나 대기 0일 때만 capLoading 해제)
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
      // [버그수정] 캡션 화면 이탈 시에도 재생성 응답 무효화
      // [출시 QA 2026-08-07] `d.capLoading` 도 같이 끈다. 예전엔 토큰만 올려서, 생성 중에
      //   뒤로 가면 **캡션 스텝(비활성 슬라이드)의 로딩 오버레이가 화면에 그대로 남았다.**
      //   실측: '사진 확인' 화면인데 "잇비가 우리샵 말투로 쓰는 중…" 이 좌표 (652,405) 에
      //   `onScreen:true · visibility:visible · opacity:1` 로 보였고, 그 요소는 활성 화면 밖이었다
      //   (`active.contains(el) === false`). 2분 넘게 사라지지 않았다 — 워치독은 **마지막 토큰**
      //   에만 걸려서, 토큰이 올라간 옛 요청의 로딩은 아무도 안 치운다.
      if (cur === 'caption') { flushCaptionInputs(); _genToken++; if (d) d.capLoading = false; }
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
    // [카오스 P2] 전환 중 재진입 차단 — 연타 시 bakeEdit 가 겹쳐 돌면서 .then 이 이미 리셋된
    //   d.adjust(=0)를 photo.adjustments 로 clone, 조정값 메타가 오염되던 문제. 한 번에 하나만 전환.
    if (d._switching) return;
    d._switching = true;
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
    }).finally(function () { d._switching = false; });   // [카오스 P2] 전환 완료 → 재진입 락 해제
  }
  function photoUrl(p) { return p ? (p.editedDataUrl || p.dataUrl) : ''; }
  // [P0-1] 표시용 URL 문자열 → blob URL (innerHTML 재파싱·재디코드 제거). 비-dataURL 은 그대로 통과.
  //   ⚠️ dispUrl(p)(아래, photo→dataURL 접근자)과 다른 것 — 이건 URL 문자열 변환기(표시 전용).
  function _blobDisp(u) { return (window.WSBlobUrl && window.WSBlobUrl.disp) ? window.WSBlobUrl.disp(u) : u; }
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
  function _shopInfoSaved() {
    // [출시 QA 2026-08-06] 가격·인스타도 저장 대상에 포함 — 예전엔 예약·전화만 봐서,
    //   가격만 적어둔 원장님에겐 토글 자체가 안 보였다(켤 대상이 없다고 판단).
    try {
      return ['itdasy:shop_book', 'itdasy:shop_phone', 'itdasy:shop_price', 'itdasy:shop_handle']
        .some(function (k) { return String(localStorage.getItem(k) || '').trim(); });
    } catch (_e) { return false; }
  }
  // [#18] 게시 크기(피드 규격) 선택 — 4:5(세로로 크게, 기본) / 1:1(정사각). 마지막 선택 기억.
  //   선택값이 편집기 캔버스→템플릿 출력→콜라주→IG 미리보기까지 관통. 스토리/릴스 9:16은 템플릿이 별도 처리.
  function _wsFormat() { try { return localStorage.getItem('itdasy:ws_format') === '11' ? '11' : '45'; } catch (_e) { return '45'; } }
  function _wsRatio() { return _wsFormat() === '11' ? '1:1' : '4:5'; }
  function _setWsFormat(v) { try { localStorage.setItem('itdasy:ws_format', v === '11' ? '11' : '45'); } catch (_e) { void _e; } }
  // [#18] 업로드 화면 하단 규격 세그먼트 — 사진 1장 이상 선택 시에만 노출.
  function _formatSegHtml(n) {
    if (!n) return '';
    var f = _wsFormat();
    return '<div class="up-fmt"><span class="up-fmt__label">게시 크기</span>' +
      '<button type="button" class="up-fmt__b' + (f === '45' ? ' on' : '') + '" data-fl-format="45">세로로 크게 <small>4:5</small></button>' +
      '<button type="button" class="up-fmt__b' + (f === '11' ? ' on' : '') + '" data-fl-format="11">정사각 <small>1:1</small></button>' +
    '</div>';
  }
  // [#18] 크롭·배경 비율 — 피드형(전후/피드/리뷰/이벤트)은 사용자 선택, 스토리(9:16)/가격표(free)는 그대로.
  function _cropRatio(fb) {
    var r = CROP_RATIO[d.tplPurpose];
    if (r === '9:16' || r === 'free') return r;
    if (!r) return fb || _wsRatio();
    return _wsRatio();
  }
  // [#19] 캡션 입력 화면의 '샵정보 반영' 토글 — 설정에 예약/전화가 저장돼 있을 때만 노출(없으면 켤 대상이 없음).
  function _shopInfoToggleHtml() {
    if (!_shopInfoSaved()) return '';
    var on = _shopInfoOn();
    return '<div class="cap-hash-row cap-shopinfo-row"><span class="cap-field-label" style="margin:0">샵정보 반영 <em style="font-weight:400;color:#9aa3ad;font-style:normal">· 매장 정보를 글 끝에</em></span>' +
      '<button type="button" class="cap-switch' + (on ? ' on' : '') + '" data-fl-cshopinfo role="switch" aria-checked="' + on + '"><span class="cap-switch__dot"></span></button></div>';
  }
  function _shopCTA() {
    if (!_shopInfoOn()) return '';   // 반영 OFF → 아무것도 안 붙임
    /* [출시 QA 2026-08-06] **가격 안내·인스타 아이디가 어디에도 안 쓰이고 있었다.**
       작업실 설정 > 매장 정보에 입력칸 3개(예약 링크·가격 안내·인스타 아이디)가 있고
       저장도 정상인데, 소비하는 코드는 여기뿐이었고 여기는 book·phone 만 읽었다.
       나머지 소비처로 보이던 편집기 '기능 스티커'(SHOP_INFO_KEY/addFeatureLayer)는
       `_recoChips()` 가 빈 문자열을 돌려주면서 **버튼을 아예 안 그린다** → 도달 불가.
       즉 원장님이 가격을 적어도 아무 일도 안 일어났다. 입력칸이 있으면 쓰여야 한다.
       순서는 행동 유도가 강한 것부터: 예약 → 전화 → 가격 → 계정. */
    try {
      var g = function (k) { return String(localStorage.getItem(k) || '').trim(); };
      var book = g('itdasy:shop_book'), phone = g('itdasy:shop_phone');
      var price = g('itdasy:shop_price'), handle = g('itdasy:shop_handle');
      var lines = [];
      if (book) lines.push('📅 예약 → ' + book);
      if (phone) lines.push('☎ ' + (book ? '' : '예약·문의 ') + phone);
      if (price) lines.push('💰 ' + price);
      if (handle) lines.push(window.igHandle(handle));
      return lines.length ? '\n\n' + lines.join('\n') : '';
    } catch (_e) { void _e; }
    return '';
  }
  // [v587] 깨끗한 합성 기준 사진 — 편집기·자동합성 모두 '텍스트가 안 박힌 원본' 위에 올린다(이중 합성 방지).
  function _cleanBase(p) { return p ? (p.baseUrl || p.dataUrl) : ''; }
  // [v591·#6] 사진에서 대표 색 추출 — 클라이언트 canvas(서버/AI 비용 0). 28px 다운샘플 후
  //   근사 흰/검 제외하고 5비트 버킷 빈도순 상위색 반환. 폰트/로고 자동추출은 부정확해 미지원(수동).
  // [v587·C] 우리샵 스타일 레이어 빌더 — 편집기 진입과 헤드리스 자동합성이 공유.
  function _buildShopStyleLayers() {
    var ss = (window.ShopStyle && window.ShopStyle.getActive) ? window.ShopStyle.getActive() : null;
    var roleText = _splitServiceForLayers(d.service);   // [v583·A] 시술명/시술내용 분리
    var layers = [];
    var autoArranged = false;
    // [5차 opt-in] 원장이 스타일을 명시적으로 확정하기 전엔 자동 텍스트 오버레이(시술명·부제·본문·해시태그)를
    //   박지 않는다. 로고·워터마크·라인·rect·고정 badge·작업기억(_orch)·사용자가 직접 넣는 텍스트는 영향 없음.
    var _confirmed = !!(ss && window.ShopStyle && window.ShopStyle.isConfirmed && window.ShopStyle.isConfirmed(ss));
    if (ss) {
      // [v587·B-3] 해시태그도 오버레이 레이어로 — 생성된 해시태그 상위 4개만(사진 위 과밀 방지).
      /* [2026-07-23 보스] 시술명이 없으면 해시태그도 안 올린다.
         원장 신고: "사진 편집 들어가도 해시태그만 있어." 시술 칩을 재탭하면 선택이 **해제**되는데
         (_pickServiceTag 토글), 해시태그는 캡션 생성 응답으로 이미 채워져 있어 그 조합이 되면
         사진에 해시태그만 덩그러니 박혔다. 시술명 없는 해시태그 오버레이는 게시물로 쓸 데가 없다.
         → 둘 다 없거나 둘 다 있게. 원장이 해시태그만 원하면 편집기에서 직접 올리면 된다. */
      var hs = (d.selectedHashes && d.selectedHashes.length ? d.selectedHashes : (d.hashtags || []));
      var _svcOk = !!String(roleText.title || '').trim();
      var hashText = _svcOk ? hs.slice(0, 4).join(' ') : '';
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
        if (!_confirmed) return;   // [5차] 스타일 미확정 → 시술명/부제/본문/해시태그 자동배치 스킵(로고·데코는 위/아래에서 통과)
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
    // [#5 / v779 보스] 시술명(title)이 있는데 사진에 안 올라갔으면 기본 레이어로 반드시 올린다.
    //   예전엔 `!layers.length` 일 때만 폴백이라, ShopStyle 이 해시태그·로고 레이어만 있고 title 레이어가
    //   없으면 '해시태그만 뜨고 시술명은 빠지는' 문제가 있었다(원장 지적). title 이 이미 배치됐으면 중복 안 올림.
    //   (업로드 직후엔 시술이 없어 title 빈값 → 폴백 안 함 = 깨끗한 사진으로 시작.)
    var _titleText = String(roleText.title || '').trim();
    var _titlePlaced = layers.some(function (L) { return L.text && L.text === roleText.title; });
    if (_confirmed && _titleText && !_titlePlaced) {   // [5차] 미확정이면 title 폴백도 안 박음(같은 opt-in 게이트)
      layers.push({ text: roleText.title, role: 'title', x: 0.5, y: 0.44, w: 0.8, size: 0.08, align: 'center' });
      if (roleText.sub && !layers.some(function (L) { return L.text && L.text === roleText.sub; })) {
        layers.push({ text: roleText.sub, role: 'sub', x: 0.5, y: 0.56, w: 0.8, size: 0.05, align: 'center' });
      }
      autoArranged = true;   // [#5] 미리보기(_autoComposeTemplate)도 이 텍스트를 합성하도록
    }
    // [#18] 비율은 사용자 '게시 크기' 선택이 최우선 — ShopStyle frame.ratio(4:5 고정)보다 앞선다.
    return { ss: ss, layers: layers, ratio: _wsRatio(), autoArranged: autoArranged };
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
  /* [cleanup 2026-07-12] 편집기가 유일한 결과 소스 → no-op 이었음(별도 자동합성이 다른 크롭/위치로 미리보기가 어긋나서).
     [부활 2026-07-17] 그 결과 "사진편집을 눌러야 텍스트가 보인다"가 됐다 — 시술명/해시태그/로고는
       _buildShopStyleLayers() 가 만들지만 그 레이어는 편집기 안에서만 살아서, 캡션·결과 화면 상단 합성본과
       실제 발행 이미지엔 꾸밈이 하나도 없었다(:314 주석도 여기서 합성될 걸 전제하고 있었음).
     예전 자동합성이 어긋난 원인은 '다른 경로로 그렸기 때문' → 이번엔 편집기와 **같은 렌더러**(ItdEditor.compose)에
       같은 레이어·같은 비율로 굽는다 = 편집기를 열었을 때의 첫 그림과 일치.
     겹쳐 굽기(텍스트 두 번) 방어 3중:
       ① 원장이 직접 꾸민 카드(storyEdited)는 건드리지 않는다 — 편집기 결과가 늘 우선.
       ② 같은 재료(autoSig)로 이미 구웠으면 skip → setScreen 재렌더로 무한루프도 안 됨.
       ③ 재오픈해서 구운 것만 있고 원판(_autoBase)이 없으면 다시 굽지 않는다(그 위에 또 얹게 되므로).
     _autoBase(텍스트 없는 원판)는 메모리에만 둔다 — buildSlot 이 떼어낸다(dataURL 2벌 = 저장 폭탄·sync 100KB 컷). */
  function _cardWasEdited(o) {
    var ids = (o && o.photoIds) || [];
    if (!ids.length) return false;
    return (d.photos || []).some(function (p) { return p && p.storyEdited && ids.indexOf(p.id) >= 0; });
  }
  /* [T4 2026-08-17] 자동 적용 배너 — "평소처럼 만들었어요 · N장" + 되돌리기.
     설정처럼 보이지 않게(합의 UX): 인라인 카드(wm-cap 재사용), 팝업 아님, 5초 뒤 스스로 사라짐.
     되돌리기 = ItdEditor.undoWmApply(token) — **그 적용의 레이어만** 외과적으로 제거, 사용자 작업 보존.
     5초는 실제 노출 시점 기준(Date.now 가드) — 백그라운드 탭에서 hide 타이머가 밀려 배너가 남아도
     늦은 클릭은 무시한다. 놓친 뒤의 회수 경로는 편집기 ↩(wmApply 가 op 1개로 스택에 있음). */
  function _showWmBanner(photoN) {
    try {
      var ap = window.WorkMemoryEngine && window.WorkMemoryEngine._lastApply;
      if (!ap || !ap.token) return;
      _hideWmBanner();
      var elB = document.createElement('div');
      elB.id = 'wmApplyBanner'; elB.className = 'wm-cap wm-cap--editor';
      elB.innerHTML =
        '<div class="wm-cap__c"><div class="wm-cap__k"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="#ic-layers"/></svg>평소처럼 만들었어요' + (photoN > 1 ? ' · ' + photoN + '장' : '') + '</div>' +
        '<div class="wm-cap__m">마음에 안 들면 바로 빼드려요</div></div>' +
        '<button type="button" class="wm-cap__undo" data-haptic="light">되돌리기</button>';
      var shownAt = Date.now(), tok = ap.token;
      elB.querySelector('.wm-cap__undo').addEventListener('click', function (e) {
        e.stopPropagation();
        if (Date.now() - shownAt > 5000) { _hideWmBanner(); return; }   // 노출 5초 경과 → 무시(편집기 ↩ 로만)
        var n = (window.ItdEditor && window.ItdEditor.undoWmApply) ? window.ItdEditor.undoWmApply(tok) : 0;
        if (n) { try { ap.undone = true; } catch (_ue) { void _ue; } }   // [T5] 통째 빼기 표식 — dismissed(문구별 veto) 오판 방지
        _hideWmBanner();
        if (n) toast('빼뒀어요 — 되돌리려면 위 ↩');
      });
      document.body.appendChild(elB);
      void elB.offsetWidth; elB.classList.add('is-on');
      d._wmBannerT = setTimeout(_hideWmBanner, 5000);
    } catch (_e) { void _e; }
  }
  function _hideWmBanner() {
    try {
      if (d && d._wmBannerT) { clearTimeout(d._wmBannerT); d._wmBannerT = null; }
      var o = document.getElementById('wmApplyBanner');
      if (o) { o.classList.remove('is-on'); setTimeout(function () { if (o.parentNode) o.parentNode.removeChild(o); }, 260); }
    } catch (_e) { void _e; }
  }
  /* [T3 2026-08-17] 기억 선택 ctx — 사진 수·시술명·전/후 역할 여부. 전후는 사진 수(2장)만으론
     못 가려서 role 지정을 본다. 선택 규칙 본체는 work-memory-engine.js select() — flow 는 ctx 만 만든다. */
  function _wmSelectCtx() {
    var eps = editablePhotos() || [];
    var hasB = false, hasA = false;
    eps.forEach(function (p) { if (p && p.role === 'before') hasB = true; else if (p && p.role === 'after') hasA = true; });
    return { photoCount: eps.length, service: (d && d.service) || '', hasBeforeAfter: hasB && hasA };
  }
  function _autoComposeTemplate() {
    if (!(window.ItdEditor && window.ItdEditor.compose)) return;
    var outs = (d && d.templateOutputs) || [];
    if (!outs.length) return;
    var built = _buildShopStyleLayers();
    var layers = (built && built.layers) || [];
    // [v779 보스] '이 스타일로 또'로 지정한 작업 기억(선·도형·스티커·글씨 등)도 결과 사진에 자동으로 굽는다.
    //   예전엔 사진편집을 열어야만 보였다. 편집기와 같은 병합 규칙 — role 겹치는 텍스트만 제외(이번 글 문구 보호),
    //   role 없는 꾸밈(선/스티커)은 얹는다. 편집기는 굽기 전 원판(_autoBase)을 열어 이중으로 안 구워진다.
    // [T1 엔진 2026-08-17] role 중복 제거를 자체 재구현하던 것 → 편집기와 같은 병합 규칙(work-memory-engine)으로.
    try {
      layers = (window.WorkMemoryEngine && window.WorkMemoryEngine.decorateLayers)
        ? window.WorkMemoryEngine.decorateLayers(layers, _wmSelectCtx()) : layers;
    } catch (_wmE) { void _wmE; }
    if (!layers.length) return;
    // 텍스트·자리·크기만으로 지문 — 로고 dataUrl 은 넣지 않는다(길이만 커지고 판별력은 role/좌표로 충분).
    var sig = layers.map(function (L) {
      return (L.role || L.type || '') + ':' + (L.text || '') + ':' + (L.x || 0) + ',' + (L.y || 0) + ':' + (L.size || 0);
    }).join('|') + '#' + built.ratio;
    var myD = d;
    // [2026-07-24 보스] 기본 시술내용 텍스트(시술명·부제·해시태그)는 **첫 장에만** 굽는다.
    //   원장 요청: 여러 장 게시할 때 모든 사진에 시술내용이 박히지 않게 — 첫 장만 자동 텍스트,
    //   나머지 장은 원장이 직접(위치/크기는 편집기서). 로고·워터마크·라인·스티커·작업기억 꾸밈은
    //   역할이 시술내용이 아니므로 전 장 그대로 유지된다.
    // [T1 엔진 2026-08-17] 규칙 본체는 work-memory-engine.js — 편집기 경로(_openStoryEditor)와 한 몸.
    function _stripServiceText(ls) {
      return (window.WorkMemoryEngine && window.WorkMemoryEngine.stripServiceText) ? window.WorkMemoryEngine.stripServiceText(ls) : ls;
    }
    var jobs = outs.map(function (o, idx) {
      var _layersForO = (idx === 0) ? layers : _stripServiceText(layers);
      // 첫 장 외에는 시술 텍스트가 빠져 지문이 달라진다 → 출력별 지문에 idx 반영(재굽기 판정 정확).
      var _sigO = sig + '#i' + idx + (idx === 0 ? '' : '-nosvc');
      if (!o || !o.outputUrl || o.autoSig === _sigO || _cardWasEdited(o)) return null;
      if (o.autoSig && !o._autoBase) return null;   // ③ 원판 없음 → 겹쳐 굽지 않는다
      if (!_layersForO.length) return null;          // 뺐더니 얹을 게 없으면(나머지 장, 로고 등도 없음) 원본 그대로 둔다
      var base = o._autoBase || o.outputUrl;
      // [2026-07-24] 이 출력이 구워진 실제 비율로 얹는다 — 콜라주(3장→1장)는 '1:1'로 구워졌는데
      //   built.ratio(샵 프레임 4:5)로 다시 구우면 콜라주가 contain 레터박스돼 작업기억 꾸밈이
      //   콜라주 실제 크기에 안 맞고 더 작은/어긋난 영역에 얹혔다(원장 지적). o.ratio 없으면(사진별 flat) 프레임 비율.
      var _oRatio = o.ratio || built.ratio;
      return window.ItdEditor.compose({ photoUrl: base, ratio: _oRatio, layers: _layersForO })
        .then(function (url) {
          if (!url || myD !== d || d._dead) return false;
          o._autoBase = base; o.outputUrl = url; o.autoSig = _sigO;
          return true;
        })
        .catch(function () { return false; });
    }).filter(Boolean);
    if (!jobs.length) return;
    Promise.all(jobs).then(function (res) {
      if (myD !== d || d._dead || !res.some(Boolean)) return;
      d.templateOutput = outs[0].outputUrl;   // 첫 카드 미러 유지(기존 소비처 계약)
      d.previewUrl = null;
      if (cur === 'caption') setScreen('caption', { push: false });   // 한 번만 다시 그림(sig 가 같아져 재진입 안 함)
    });
  }
  /* [버그수정 2026-07-17] 편집기 결과를 templateOutputs(결과물 배열)에도 돌려준다.
     예전엔 onDone 이 d.templateOutput(첫 카드 미러)만 갱신하고 배열은 편집 전 합성본 그대로 뒀다. 그래서
       · 상단 렌더가 다중 카드일 때 '텍스트 없는 옛 합성본'을 보여주고
       · 발행(publish 의 _outs)이 그 옛 합성본을 그대로 인스타에 올렸다(꾸밈이 조용히 사라짐).
     레이아웃 카드(isWs)는 보고 있던 카드에, 레이아웃 없는 카드는 그 사진을 담은 카드에 반영한다. */
  function _syncOutputForEdit(p, dataUrl, isWs) {
    var outs = (d && d.templateOutputs) || [];
    if (!outs.length || !dataUrl) return;
    var tgt = null;
    if (isWs) tgt = (d.activeDisplayId && outs.filter(function (o) { return o && o.pairId === d.activeDisplayId; })[0]) || outs[0];
    else if (p) tgt = outs.filter(function (o) { return o && !o.templateId && (o.photoIds || []).indexOf(p.id) >= 0; })[0];
    if (tgt) {
      tgt.outputUrl = dataUrl;
      // [v779] 스칼라 미러 동기화 — outputUrl()·_displayItems 가 스칼라를 먼저 읽어, 안 맞추면
      //   편집분이 배열엔 반영돼도 발행/미리보기는 옛 원본을 내보내던 버그(단일사진 편집 특히).
      if (tgt === outs[0]) { d.templateOutput = dataUrl; d.previewUrl = null; }
    }
  }
  // [#5] 텍스트/편집을 '지금 캐러셀에서 보고 있는 장'에 적용 — 보던 사진을 편집·저장(다중 사진서 장 선택).
  function _activeEditPhoto() {
    if (d && d.activeDisplayId) {
      var ph = (d.photos || []).filter(function (p) { return p.id === d.activeDisplayId; })[0];
      if (ph) return ph;
    }
    return curPhoto();
  }
  /* [2026-07-17] 레이아웃(콜라주) editState + ★기본 작업 기억의 꾸밈 합치기.
     [T1 엔진 2026-08-17] 규칙 본체는 work-memory-engine.js 로 이관 — 이 이름은
       배선 테스트(work-memory-layout.test.js)가 잠근 호출부 계약이라 위임으로 유지. */
  function _mergeWmLayers(base, wm) {
    return (window.WorkMemoryEngine && window.WorkMemoryEngine.mergeEditState)
      ? window.WorkMemoryEngine.mergeEditState(base, wm) : (base || wm || null);
  }
  function _openStoryEditor(o) {
    o = o || {};
    // [slot-sync Phase B] 다른 기기 slot(https 이미지) → 편집기 캔버스 오염 방지 위해 먼저 수화. 1회만 시도(실패해도 진행).
    // [보안감사 M-12 2026-07-26] 예전엔 hydrate 실패 시에도 _openStoryEditor(o) 를 곧바로 재귀 호출해서,
    //   _needsHydrate() 가 계속 true 면 무한 재시도 루프('사진 불러오는 중' 반복, 편집기 진입 불가)였다.
    //   또 _hydrateD() 가 reject 하면 _hydrateTried=true 로 남아 영영 안 열리는 다른 고착도 있었다.
    //   → 성공 시에만 재오픈, 실패/reject 시엔 멈추고 안내(재시도는 사용자 재요청으로).
    if (_needsHydrate() && !d._hydrateTried) {
      d._hydrateTried = true; toast('사진 불러오는 중…');
      _hydrateD().then(function (ok) {
        if (ok) { _openStoryEditor(o); return; }
        d._hydrateTried = false;
        toast('사진을 불러오지 못했어요 — 잠시 후 다시 시도해 주세요');
      }).catch(function () {
        d._hydrateTried = false;
        toast('사진을 불러오지 못했어요 — 잠시 후 다시 시도해 주세요');
      });
      return;
    }
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
    // [v779 재오픈] d.wsLayout 은 레이아웃 화면을 방문해야만 채워지는 세션 별칭 → 재오픈 초안엔 없다.
    //   합성본(templateOutput/배열)이 있으면 게이트를 열어 composite 편집이 되게 한다(원본 열림·편집 미반영 방지).
    var _wsEd = ((d.wsLayout || d.templateOutput || (d.templateOutputs && d.templateOutputs.length)) && !_hasBg) ? _wsLayoutEditState() : null;
    var photo = (_wsEd && _wsEd.mode === 'composite') ? _wsEd.photoUrl
      : (_wsEd && _wsEd.mode === 'collage') ? (_wsEd.photos[0] || _cleanBase(p0) || outputUrl())
      : (_restore ? (_cleanBase(p0) || outputUrl())
        : ((o.fresh && p0 && p0.editedDataUrl) ? p0.editedDataUrl : (_cleanBase(p0) || outputUrl())));
    var built = _buildShopStyleLayers();
    var layers = built.layers, autoArranged = built.autoArranged;
    // [2026-07-24 보스] 기본 시술내용 텍스트(시술명·부제·해시태그)는 **첫 장에만**. 둘째 장부터 편집기를 열면
    //   시술텍스트를 얹지 않는다(발행 미리보기 bake 와 동일 규칙 — _autoComposeTemplate 참고). 나머지 장은
    //   원장이 직접 텍스트를 넣게. 로고·워터마크·스티커·라인·작업기억 꾸밈(시술내용 역할 아님)은 그대로 둔다.
    try {
      var _eps0 = editablePhotos() || [];
      var _actP = _activeEditPhoto();
      var _pIdx = _actP ? _eps0.map(function (p) { return p && p.id; }).indexOf(_actP.id) : 0;
      if (_pIdx > 0) {
        // [T1 엔진 2026-08-17] 발행 미리보기 bake(_autoComposeTemplate)와 같은 규칙을 엔진에서 — 한쪽만 고쳐 어긋나던 구조 제거.
        layers = (window.WorkMemoryEngine && window.WorkMemoryEngine.stripServiceText) ? window.WorkMemoryEngine.stripServiceText(layers) : layers;
      }
    } catch (_svcE) { void _svcE; }
    // [2026-07-22 오케스트레이션] 잇비 브리핑(파싱)에서 온 텍스트·스티커 레이어. layers(신규편집) + editState.layers(콜라주 복원) 양쪽에 얹어야 함.
    var _orchLayers = [];
    if (d._orch && window.ItdasyPhotoBrief && window.ItdasyPhotoBrief.buildLayers) {
      try { _orchLayers = window.ItdasyPhotoBrief.buildLayers(d._orch) || []; } catch (_oe) { _orchLayers = []; }
      // orch 가 시술내용 텍스트를 주면, 우리샵 기본 플레이스홀더 텍스트(커스텀메모)는 뺀다(중복 방지).
      if (_orchLayers.length && d._orch.wantsText) layers = layers.filter(function (l) { return l.text !== '커스텀메모'; });
      if (_orchLayers.length) { layers = layers.concat(_orchLayers); autoArranged = false; }
    }
    /* [T-115 P2] ★기본 작업 기억을 편집기에 올린다. 플래그 OFF면 null(=기존 동작 그대로).
       [버그수정 2026-07-17] 예전 조건은 `!_restore && !_wsEd` 였다 — _wsEd 는 작업실 레이아웃이 켜지면
         늘 채워지는데, 작업실 기본 흐름이 업로드→레이아웃→캡션이라 사실상 **항상** 꺼져 있었다.
         원장이 스티커·글씨·도형을 ★기본으로 지정해도 새 글에서 아무것도 안 올라오던 원인.
       이제 레이아웃이 있어도 기억을 계산하되 layersOnly=true 로 '꾸밈만' 가져온다
         (칸 배치는 방금 고른 레이아웃이 소유 — 안 그러면 레이아웃이 기억에 덮여 사라진다). */
    // [T1 엔진 2026-08-17] ★기본/잇비 지정 기억 계산은 work-memory-engine 으로 이관(경로 3곳 중복 제거).
    //   restore(재편집 이어가기)면 안 얹고, 잇비 "평소 하던 대로"의 플래그 우회 규칙까지 엔진 소유.
    // [T3] once('이 스타일로 또') > auto(상황 스코어) > ★(auto OFF) — ctx 는 _wmSelectCtx 가 만든다.
    var _wmEd = (window.WorkMemoryEngine && window.WorkMemoryEngine.forEditor)
      ? window.WorkMemoryEngine.forEditor(Object.assign({ restore: !!_restore, orch: d._orch, incoming: layers, layersOnly: !!_wsEd }, _wmSelectCtx()))
      : null;
    // [v590] 진입 시 올린 텍스트 역할 기록 — 저장 시 빠진 역할(사용자가 지움)을 스타일에서 비활성화하는 비교 기준.
    // [audit#3] 텍스트 역할 레이어는 type 필드가 없다(roleText 배치) — 'text'로만 필터하면 항상 빈 배열이라 '지운 레이어 기억' 기능이 죽어 있었음.
    d._editorOpenRoles = layers.filter(function (l) { return l.role && (l.type === 'text' || l.type == null); }).map(function (l) { return l.role; });
    // 최종 editState 계산 후, 오케스트레이션 레이어를 editState.layers 에도 병합(콜라주는 editState.layers 를 쓰고 layers 파라미터를 무시하므로).
    var _finalEs = (_wsEd && _wsEd.mode === 'collage') ? _mergeWmLayers(_wsEd.editState, _wmEd)
      : (_restore || (o.fresh ? _wmEd : ((p0 && p0.editState) || _wmEd)));
    if (_orchLayers.length && _finalEs) {
      try {
        var _esL = _finalEs.layers || [];
        if (d._orch && d._orch.wantsText) _esL = _esL.filter(function (l) { return l.text !== '커스텀메모'; });
        _finalEs.layers = _esL.concat(_orchLayers);
      } catch (_me) { void _me; }
    }
    Editor.open({
      photoUrl: photo,
      photos: (_wsEd && _wsEd.mode === 'collage') ? _wsEd.photos : (editablePhotos() || []).map(function (p) { return p.editedDataUrl || _cleanBase(p) || photoUrl(p); }),   // [itd][#5] 콜라주 셀은 편집본 우선 · [ws-hyper] 레이아웃 매칭 시 슬롯 순서대로
      ratio: built.ratio,
      shopName: (built.ss && (built.ss.name || built.ss.shopName)) || (window.WorkspaceAdapter && window.WorkspaceAdapter.shopName && window.WorkspaceAdapter.shopName()) || '',
      layers: layers,
      autoArranged: autoArranged,
      // [#17] 이어서 편집 · [ws-hyper] 레이아웃 매칭 시 콜라주 상태 주입(슬롯 재조정) · [T-115 P2] 없으면 ★기본 작업 기억
      // [2026-07-17] 콜라주(레이아웃)엔 기억의 '꾸밈'만 합쳐 얹는다 — 칸 배치는 레이아웃 것 그대로.
      editState: _finalEs,
      onDone: function (dataUrl, meta) {
        _hideWmBanner();   // [T4] 편집기가 닫히면 배너·타이머 정리(다음 세션에 낡은 배너 금지)
        /* [T5] dismissed veto 기록 — 원장이 '기억에서 온 role 없는 문구'를 지운 채 **저장 완료**했으면
           그 문구를 다시는 자동으로 안 얹는다(3회 조건을 재충족해도). 취소로 닫힌 세션은 판정 안 함.
           통째 빼기 판정은 meta.wmKept(남은 wm 레이어 수, 스티커·선 포함) —
           0 = 자동화 거부(배너 되돌리기/↩)라 문구 판단 아님 / 1+ = 자동화는 수용, 그 문구만 싫다.
           (텍스트 개수 비교로 하면 wm 문구가 1개뿐일 때 지워도 '전부 사라짐'이 되어 veto 가 영영 안 걸린다 —
            브라우저 실측으로 잡은 결함.) */
        try {
          var ap = window.WorkMemoryEngine && window.WorkMemoryEngine._lastApply;
          if (ap && ap.texts && ap.texts.length && !ap.undone && meta && meta.editState && window.WorkMemory && window.WorkMemory.dismissText) {
            var _fin = {};
            (meta.editState.layers || []).forEach(function (l) {
              if (l && !l.role && (l.type === 'text' || l.type === 'badge') && l.text) _fin[window.WorkMemoryEngine.normalizeText(l.text)] = 1;
            });
            var gone = ap.texts.filter(function (t) { return !_fin[t]; });
            if (gone.length && meta.wmKept > 0) gone.forEach(function (t) { window.WorkMemory.dismissText(t); });
          }
        } catch (_tde) { void _tde; }
        var p = p0 || _activeEditPhoto();   // [#5] 열 때 잡은 '보던 장'에 저장(편집 중 바뀌지 않게 고정)
        if (p) { p.editedDataUrl = dataUrl; p.storyEdited = true; if (meta && meta.editState) p.editState = meta.editState; }   // [#11] 편집 상태 보존 → 재편집 이어가기
        if (_wsEd) { d.templateOutput = dataUrl; d.previewUrl = null; }   // [ws-hyper] 편집한 레이아웃 합성본을 대표 이미지로 → 미리보기/발행/저장에 반영
        _syncOutputForEdit(p, dataUrl, !!_wsEd);   // [버그수정 2026-07-17] 결과물 배열에도 반영(안 하면 발행이 편집 전 합성본을 올림)
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
            var _eph = editablePhotos(), _rt = (meta.editState && meta.editState.ratio) || _wsRatio();
            _pp.forEach(function (e) {
              var tp = _eph[e.idx]; if (!tp || tp === p) return;   // 보던 장은 위에서 dataUrl 로 이미 저장
              var _cb = _cleanBase(tp) || photoUrl(tp);
              window.ItdEditor.compose({ photoUrl: _cb, ratio: _rt, layers: e.layers }).then(function (u) {
                if (!u) return;
                tp.editedDataUrl = u; tp.storyEdited = true;
                _syncOutputForEdit(tp, u, false);   // [버그수정 2026-07-17] 사진별 레이어 합성도 결과물 배열에 반영
                tp.editState = { v: 1, layoutIdx: 0, layoutOrder: [], cellCrop: [], fitMode: 'contain', ratio: _rt, adj: [], photoDraw: {}, photoBg: {}, photos: [_cb], layers: e.layers };
                d.previewUrl = null;   // [#3] 편집 중간에는 내 콘텐츠 저장 안 함 — 최종(발행/연결/저장)에서만. 데이터는 메모리 유지.
              });
            });
          }
        } catch (_ppe) { void _ppe; }
        d.previewUrl = null;
        _learnShopStyle(meta && meta.layers);   // [v587·C] 편집 결과를 우리샵 스타일로 학습 · [T-115 P3] 기억 ON이면 '지운 역할'만
        // [#3] 편집 완료 시점엔 내 콘텐츠에 저장하지 않음(중간본 쌓임 방지). 편집 결과는 d.photos 메모리에 유지되어
        //   미리보기·발행에 그대로 쓰이고, 실제 저장은 워크플로 최종(발행/고객연결/저장)에서만.
        // [워크플로 재정렬] 편집기 완료 후 다음 목적지(예: 캡션→편집기→미리보기). 없으면 캡션 유지.
        if (d._editorNext) { var _nx = d._editorNext; d._editorNext = null; setScreen(_nx); }
        else if (cur === 'caption') setScreen('caption');
        // [2026-07-22 오케스트레이션] 편집 반영 후 시술내용으로 캡션 자동생성(1회). 그 뒤 브리핑 소진.
        if (d._orch) {
          var _svc = d._orch.service; d._orch = null; d._orchApplied = false;
          if (_svc) { d.service = _svc; try { doGenerate({}, null); } catch (_ge) { void _ge; } }
        }
        toast('사진을 꾸몄어요');
      },
      onCancel: function () { _hideWmBanner(); d._editorNext = null; }   // 편집기 취소 시 배너+라우팅 플래그 정리
    });
    // [T4] 자동 적용 배너 — 이번 오픈에 wm 레이어가 실제로 실렸을 때만(사진 editState 가 이긴 경우 제외).
    try {
      if (window.WorkMemoryEngine && window.WorkMemoryEngine._lastApply &&
          _finalEs && _finalEs.layers && _finalEs.layers.some(function (l) { return l && l._src === 'wm'; })) {
        _showWmBanner((editablePhotos() || []).length);
      }
    } catch (_be) { void _be; }
  }
  // [통합 편집기] 업로드 직후도 '옛 crop 화면'이 아니라 같은 ItdEditor 를 연다 → 완료하면 캡션 화면으로.
  //   새 업로드 사진은 editState=null 이라 자동으로 깨끗하게 열림(옛 편집 안 꺼냄).
  function _openEditFirst() {
    if (!(window.ItdEditor && window.ItdEditor.open)) { setScreen('caption'); return; }
    d._editorNext = 'caption';
    _openStoryEditor();
  }
  // [v587·C] ShopStyle 학습 피드백 루프 — 편집기 결과를 활성 스타일에 되저장.
  // [T-115 P3] '배치 학습'과 '지운 역할 기억' 두 가지를 하는데, 소유자가 갈렸다.
  //   ① 배치(위치·크기·폰트·외곽선) → 작업 기억(WorkMemory)이 소유. 기억이 켜져 있으면 여기선 안 배운다.
  //      둘 다 배우면 같은 걸 두 곳에 저장해 '왜 내 스타일이 저절로 바뀌지?' 가 된다(예측 불가).
  //      기억이 꺼져 있으면(기본값) 예전 그대로 배운다 — 안 그러면 대체재 없이 기능만 잃는다.
  //   ② 지운 역할(enabled:false) → 여기가 계속 소유. 기억엔 대응물이 없고, 이게 없으면
  //      _buildShopStyleLayers 가 지운 레이어를 다시 올리고 편집기 _renderMissingIncoming 도
  //      '빠진 역할' 로 보고 되살린다. 기억을 켜도 필요하다.
  function _learnShopStyle(layers) {
    try {
      if (!Array.isArray(layers)) return;
      var SS = window.ShopStyle; if (!(SS && SS.getActive && SS.save)) return;
      var ss = SS.getActive(); if (!ss || !Array.isArray(ss.layers)) return;
      var learnGeom = !(window.WorkMemory && window.WorkMemory.flagOn());   // [T-115 P3] 배치는 기억이 켜지면 기억 소유
      var byRole = {};
      layers.forEach(function (l) { if (l && l.type === 'text' && l.role && !byRole[l.role]) byRole[l.role] = l; });
      var TEXT_ROLES = { title: 1, sub: 1, body: 1, hashtag: 1 };
      var openedRoles = d._editorOpenRoles || [];   // 이번 편집에 '올라갔던' 역할들(빠지면 사용자가 지운 것)
      var changed = false;
      var newLayers = ss.layers.map(function (L) {
        if (!TEXT_ROLES[L.role]) return L;
        var e = byRole[L.role];
        if (e) {
          // 존재 → 다시 활성화(사용자가 도로 올림). 배치 학습은 기억이 꺼져 있을 때만.
          if (!learnGeom) {
            if (L.enabled === false) { changed = true; return Object.assign({}, L, { enabled: true }); }
            return L;
          }
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
        //   [T-115 P3] 기억을 켜도 이건 계속 살아있어야 한다(위 ② 참고).
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
      '</div>' +
      // [2026-07-28 원영 2번·A안] 사진 없이 글만 쓰기 — 업로드 0장일 때만 드롭존 아래 노출.
      //   글만 쓰기는 업로드의 하위 옵션이 아니라 별도 시작점이라 드롭존 밖에 대등하게 둔다.
      (n ? '' :
        '<div class="up-or" aria-hidden="true"><span>또는</span></div>' +
        '<button type="button" class="up-textonly" data-fl="textonly"><i class="ph-bold ph-pencil-simple"></i>사진 없이 글만 쓰기</button>') +
      guide +
      '<div class="up-section">업로드한 사진 <b>' + n + '</b> / 10' +
        (n ? ' <span class="up-rolehint">· 탭해 <b>선택/해제</b>' + (multi ? ' · 전후는 사진마다 <b>전·후</b> 지정' : '') + '</span>' : '') + '</div>' +
      '<div class="upload-grid">' + tiles +
        '<div class="grid-add" data-fl-pick><i class="ph-bold ph-plus"></i><span>추가</span></div>' +
      '</div>' +
      '<div class="up-foot" data-up-foot>' + _formatSegHtml(selCount) + _upSummaryHtml(selCount, multi, cnt) + _pairPreviewHtml(cnt) + '</div>';
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
      foot.innerHTML = _formatSegHtml(selOrdered.length) + _upSummaryHtml(selOrdered.length, multi, cnt) + _pairPreviewHtml(cnt);
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
      return '<div class="ed-roles__row"><span class="ed-roles__thumb" style="background-image:url(' + esc(_blobDisp(photoUrl(p))) + ')"></span>' + _roleSegInline(role, idx) + '</div>';
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
    var img = '<div class="tplres__img" data-fl-tplresult style="background-image:url(' + esc(_blobDisp(active.outputUrl)) + ')"></div>';
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

  // [캡션재설계 v2 2026-07-15] 3질문을 스텝 없이 한 화면 세로 배치(목업 33_작업실_개편 ②).
  //   답은 기존 생성 배관(d.captionAxes → photo_context) 그대로. '직접' = 점선 칩, 누르면 그 자리 입력창 토글.
  //   (구 capWizStep 스텝 넘김·점 인디케이터·done 화면·뒤로/다시 버튼은 전부 삭제·병합)
  var _WIZ_STEPS = [
    { key: 'situation', q: '무슨 게시물인가요?', l: '무슨 게시물', opts: ['시술 완성', '후기·감사', '이벤트·공지'] },
    { key: 'customer',  q: '손님은 어떤 분이에요?', l: '손님', opts: ['처음 온 손님', '단골 손님'] },
    { key: 'photo',     q: '사진은 어떤 사진이에요?', l: '사진', opts: ['완성샷', '전·후 비교'] }
  ];
  // [아코디언 2026-07-15] 답한 질문은 한 줄로 접히고 다음 질문이 저절로 열린다(목업 34).
  function _wizAnswered(key) { var v = (d.captionAxes || {})[key]; return !!(v && String(v).trim()); }
  function _wizUnanswered() { return _WIZ_STEPS.filter(function (s) { return !_wizAnswered(s.key); }).length; }
  // 지금 펼칠 질문: '바꾸기'로 강제로 연 것 > 첫 미답변. 전부 답했으면 없음('').
  function _wizOpenKey() {
    if (d._wizOpen && _wizStep(d._wizOpen)) return d._wizOpen;
    for (var i = 0; i < _WIZ_STEPS.length; i++) { if (!_wizAnswered(_WIZ_STEPS[i].key)) return _WIZ_STEPS[i].key; }
    return '';
  }
  function _wizStep(key) { for (var i = 0; i < _WIZ_STEPS.length; i++) { if (_WIZ_STEPS[i].key === key) return _WIZ_STEPS[i]; } return null; }
  // 이 축의 저장값이 선택지 밖(=직접 입력값)인지
  function _wizIsCustom(key) {
    var v = (d.captionAxes || {})[key]; if (!v) return false;
    var st = _wizStep(key);
    return !!st && st.opts.indexOf(v) < 0;
  }
  function _capWizHtml() {
    var ax = d.captionAxes || {};
    var openKey = _wizOpenKey();
    var just = d._wizJust; d._wizJust = null;   // 방금 답한 질문 — 이번 렌더에서만 접힘·체크 팝 애니메이션
    return _WIZ_STEPS.map(function (s, i) {
      var val = ax[s.key] || '';
      var answered = _wizAnswered(s.key);
      // ① 접힌 줄 — 답 완료: 체크 + 한 줄 요약, 탭하면 다시 펼침
      if (answered && s.key !== openKey) {
        var lbl = val.length > 16 ? val.slice(0, 16) + '…' : val;
        return '<button type="button" class="capwiz__row' + (just === s.key ? ' capwiz__row--pop' : '') + '" data-fl-wizreopen="' + esc(s.key) + '">' +
          '<em><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></em>' +
          '<span class="capwiz__rowl">' + esc(s.l) + '</span><b>' + esc(lbl) + '</b>' +
          '<span class="capwiz__chg">바꾸기</span></button>';
      }
      // ② 잠긴 줄 — 아직 차례 아님
      if (s.key !== openKey) {
        return '<div class="capwiz__row capwiz__row--lock"><em>' + (i + 1) + '</em><span class="capwiz__rowq">' + esc(s.q) + '</span></div>';
      }
      // ③ 펼친 카드 — 지금 답할 질문
      var isCustom = _wizIsCustom(s.key);
      var open = d._wizCustom === s.key;
      var chips = s.opts.map(function (o) {
        return '<button type="button" class="capwiz__opt' + (val === o ? ' on' : '') + '" data-fl-wizpick="' + s.key + '::' + esc(o) + '">' + esc(o) + '</button>';
      }).join('');
      // '직접' 점선 칩 — 저장된 직접 값이 있으면 칩에 값 미리보기, 누르면 입력창 토글(재탭=값 해제).
      var etcLbl = (isCustom && !open) ? ('직접 · ' + esc(val.length > 10 ? val.slice(0, 10) + '…' : val)) : '직접';
      chips += '<button type="button" class="capwiz__opt capwiz__opt--etc' + ((isCustom || open) ? ' on' : '') + '" data-fl-wizcustom="' + esc(s.key) + '">' + etcLbl + '</button>';
      var custin = open
        ? '<div class="capwiz__custom">' +
            '<input type="text" class="capwiz__custin" data-fl-wizcustin maxlength="40" placeholder="직접 적어주세요" value="' + esc(isCustom ? val : '') + '">' +
            '<button type="button" class="capwiz__custok" data-fl-wizcustok>확인</button>' +
          '</div>'
        : '';
      return '<div class="capwiz__card' + (just ? ' capwiz__card--in' : '') + '"><label class="capwiz__q"><em>' + (i + 1) + '</em>' + esc(s.q) + '</label>' +
        '<div class="capwiz__opts">' + chips + '</div>' + custin + '</div>';
    }).join('');
  }
  // [아코디언] CTA 차오름 — 질문에 먼저 답해주세요 → 질문 N개 남았어요 → 게시글 만들기(로즈).
  //   시술·특이사항까지 채우면 버튼 위에 정확도 힌트 한 줄. 잠긴 버튼 탭 = 첫 미답변 질문 펼침(핸들러).
  function _capWizCtaHtml() {
    var left = _wizUnanswered();
    if (left > 0) {
      var txt = left >= _WIZ_STEPS.length ? '질문에 먼저 답해주세요' : (left === 1 ? '질문 하나 남았어요' : '질문 ' + left + '개 남았어요');
      return '<button type="button" class="capwiz__cta capwiz__cta--dis" data-fl-cgenlock>' + txt + '</button>';
    }
    var hint = (String(d.service || '').trim() || String(d.specialNote || '').trim())
      ? '<p class="capwiz__ready">우리샵 말투로 더 정확하게 써드려요</p>' : '';
    return hint + '<button type="button" class="capwiz__cta" data-fl-cgen>게시글 만들기</button>';
  }
  // [캡션재설계 v2] 3축 → photo_context 문자열. '직접' 입력값도 caption-text 드롭 규칙(_publicServiceKeywords)으로
  //   정제 후 포함 — 사담·욕설·지시어가 생성 컨텍스트에 원문으로 흘러가지 않게.
  function _wizAxisContext() {
    var ax = d.captionAxes || {}, parts = [];
    _WIZ_STEPS.forEach(function (s) {
      var v = String(ax[s.key] || '').trim(); if (!v) return;
      if (s.opts.indexOf(v) < 0) { var cl = ''; try { cl = _publicServiceKeywords(v) || ''; } catch (_e) { void _e; } v = String(cl || v).slice(0, 40); }
      parts.push(v);
    });
    return parts.join(' / ');
  }
  // 자주 쓰는 시술 태그(업종별 기본 + 커스텀) — 탭하면 시술 입력칸에 추가. getShopKeywords()는 caption-keyword-tags.js.
  // [요청3 2026-07-13] 재선택 목록을 시술 사전(service-vocab) 전 업종으로 확장 — 반영구/메이크업/태닝/두피/에스테틱
  //   샵으로 가입한 원장님도 자기 업종이 목록에 뜨고 라벨이 '업종 고르기'로 안 떨어지게. (네일아트는 '네일'로 통합)
  var _SVC_TYPES = ['미용실', '헤어', '네일', '붙임머리', '속눈썹', '왁싱', '피부', '반영구', '메이크업', '태닝', '두피', '에스테틱'];
  // [2026-07-26 원영] 특이사항 업종별 예시(_NOTE_EG·_noteEg) 삭제 — placeholder 자체를 없애기로(입력칸은 라벨만으로 충분).
  function _svcTagsHtml() {
    var kws = [];
    try { if (typeof getShopKeywords === 'function') kws = getShopKeywords() || []; } catch (_e) { void _e; }
    kws = _applySvcOrder(kws);   // [관리모드] 저장된 순서 적용
    var stype = ''; try { stype = localStorage.getItem('shop_type') || ''; } catch (_e2) { void _e2; }
    // [#2] 업종이 키워드로 해석되면(가입값 hair/헤어샵/네일 등 정규화 성공) 태그 노출. 'beauty'·general 처럼 안 풀리면 업종 고르게.
    var _norm = ''; try { if (window.itdasyNormalizeShopType) _norm = window.itdasyNormalizeShopType(stype).label || ''; } catch (_en) { void _en; }
    var valid = kws.length > 0 || _SVC_TYPES.indexOf(stype) >= 0;
    var _typeLabel = (_SVC_TYPES.indexOf(stype) >= 0) ? stype : (valid ? (_norm || stype) : '업종 고르기');   // 고른 업종칩은 그대로 표시(정규화 '기타'로 안 바뀌게)
    // [#5 2026-07-17] 중복선택 — 고른 칩 전부 검정 채움, 재탭 = 해제.
    // [시술칩 관리모드 2026-07-20] 평소엔 순수 선택칩(× 없음) — '관리' 켤 때만 × 삭제 + 드래그 정렬 + 추가.
    //   기존: 모든 칩에 × 상시 노출 → 이미 선택된 태그처럼 오해돼 "탭해서 고르기"가 안 읽힘(실사용 QA 2026-07-20).
    var manage = !!d.svcManageOpen;
    var _selArr = _svcList(), _base = kws.slice(0, 8);
    function _svcChip(k, selected, truncate) {
      var lbl = truncate && k.length > 20 ? k.slice(0, 20) + '…' : k;
      return '<button type="button" class="cap-svctag' + (selected ? ' on' : '') + (manage ? ' cap-svctag--manage' : '') +
        '" data-fl-svctag="' + esc(k) + '"' + (manage ? ' data-fl-svcsort' : '') + ' title="' + esc(k) + '">' + esc(lbl) +
        (manage ? '<span class="cap-svctag__x" data-fl-svcdel="' + esc(k) + '" aria-label="삭제">×</span>' : '') + '</button>';
    }
    var chips = valid ? _base.map(function (k) { return _svcChip(k, _selArr.indexOf(k) >= 0, false); }).join('') : '';
    // 선택값이 목록 밖(직접 추가·최근 시술·이어서 복원)이어도 선택 상태가 보이게 맨 앞에 활성 칩으로.
    if (valid) {
      var outside = _selArr.filter(function (s) { return _base.indexOf(s) < 0; });
      chips = outside.map(function (s) { return _svcChip(s, true, true); }).join('') + chips;
    }
    // [업종정리 2026-07-15] 인식 실패해도 업종 12칩을 자동으로 쫙 펼치지 않는다 — 버튼 탭했을 때만.
    //   (가입 업종은 앱 로드 때마다 /me 로 동기화됨(app-core) — 값이 없거나 못 알아듣는 값일 때만 이 버튼을 쓴다.)
    var typeOpen = !!d.svcTypeOpen;
    var typeChips = typeOpen ? ('<div class="cap-svctype">' + _SVC_TYPES.map(function (tp) {
      return '<button type="button" class="cap-svctype__c' + (tp === stype ? ' on' : '') + '" data-fl-svctype="' + esc(tp) + '">' + esc(tp) + '</button>';
    }).join('') + '</div>') : '';
    var manageBtn = valid ? ('<button type="button" class="cap-svcmanage' + (manage ? ' on' : '') + '" data-fl-svcmanage>' +
      (manage ? '<i class="ph-bold ph-check"></i> 완료' : '<i class="ph-bold ph-pencil-simple"></i> 관리') + '</button>') : '';
    return '<div class="cap-svctags__hint">우리샵 · ' +
        '<button type="button" class="cap-svctype__btn" data-fl-svctypetoggle>' + esc(_typeLabel) + ' <i class="ph-bold ph-caret-down"></i></button>' +
        (manage ? '<span class="cap-svctags__chg">탭·×로 삭제 · 드래그로 순서</span>'
                : (!typeOpen ? '<span class="cap-svctags__chg">' + (valid ? '탭해서 골라요' : '업종을 고르면 시술이 나와요') + '</span>' : '')) +
        manageBtn + '</div>' +
      typeChips +
      (valid ? ('<div class="cap-svctags' + (manage ? ' is-manage' : '') + '">' + chips +
        (manage ? (d.svcAddOpen
          ? '<input type="text" class="cap-svctag cap-svctag--addin" data-fl-svcaddin maxlength="40" placeholder="시술명 입력 후 Enter" aria-label="시술명 입력">'
          : '<button type="button" class="cap-svctag cap-svctag--add" data-fl-svctagadd><i class="ph-bold ph-plus"></i> 추가</button>') : '')
        + '</div>') : '');
  }
  /* [#5 2026-07-17] 시술 칩 **중복선택** — 원장 요청("시술명 선택하는데 중복선택 가능하게").
     d.service 는 계속 '쉼표로 이어붙인 문자열'로 둔다. 이 값을 읽는 곳이 20군데 넘고(캡션 payload·
     발행 메타·slot.service·work-memory 이름짓기·잇비 명령…) 대부분 이미 쉼표를 다룰 줄 안다
     (_svcTitle 은 쉼표로 쪼개 '첫시술 외 N개', _makeName 은 첫 조각). 배열로 바꾸면 그 20곳을 전부
     고쳐야 하고 저장된 옛 slot(문자열)과도 어긋난다 → 표현은 그대로, 편집만 다중으로. */
  var SVC_MAX = 3;   // [원영 요청] 시술 칩 최대 3개 — 20인치+26인치, 옴브레+팁붙임처럼 2~3개 믹스가 실제 흔한 상한
  function _svcList() {
    return String(d.service || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function _svcSet(arr) {
    var seen = {}, out = [];
    (arr || []).forEach(function (s) { s = String(s).trim(); if (s && !seen[s]) { seen[s] = 1; out.push(s); } });
    d.service = out.join(', ');
  }
  /* [시술칩 관리모드 2026-07-20] 시술 칩 순서 영구저장 — 관리 모드 드래그로 바꾼 순서를 기억(한 번 세팅하면 계속).
     저장은 키워드 배열. 렌더 시 이 순서 먼저(그대로) + 순서에 없는 신규는 원래 순서로 뒤에. */
  function _loadSvcOrder() { try { var a = JSON.parse(localStorage.getItem('itdasy_svc_order') || '[]'); return Array.isArray(a) ? a : []; } catch (_e) { return []; } }
  function _saveSvcOrder(arr) { try { localStorage.setItem('itdasy_svc_order', JSON.stringify((arr || []).slice(0, 40))); } catch (_e) { void _e; } }
  function _applySvcOrder(list) {
    var ord = _loadSvcOrder(); if (!ord.length) return list;
    var pos = {}; ord.forEach(function (k, i) { pos[k] = i; });
    var known = [], unknown = [];
    (list || []).forEach(function (k) { if (pos[k] != null) known.push(k); else unknown.push(k); });
    known.sort(function (a, b) { return pos[a] - pos[b]; });
    return known.concat(unknown);
  }
  function _pickServiceTag(kw) {
    syncServiceFromDom();
    kw = String(kw).trim();
    var cur = _svcList();
    if (cur.indexOf(kw) >= 0) _svcSet(cur.filter(function (s) { return s !== kw; }));   // 재탭 = 해제
    else if (cur.length >= SVC_MAX) { toast('시술은 ' + SVC_MAX + '개까지 고를 수 있어요'); return; }
    else _svcSet(cur.concat([kw]));
    setScreen('caption');
  }
  // [v778 보스] 시술 추가 = 팝업(window.prompt) 금지 → '추가' 칩 자리에 인라인 입력칸이 열리고
  //   거기 바로 타자 치면 채워진다. Enter/blur 로 확정.
  function _addSvcKeyword() {
    d.svcAddOpen = true;
    setScreen('caption', { push: false });   // 재렌더 → _mountCaption 이 입력칸에 포커스
  }
  function _commitSvcKeyword(kw) {
    if (!d.svcAddOpen) return;                // Enter+blur 중복 방지(재탭=해제 토글로 새지 않게)
    d.svcAddOpen = false;
    kw = String(kw || '').trim();
    if (!kw) { setScreen('caption', { push: false }); return; }   // 빈값 = 그냥 닫기
    try { var arr = JSON.parse(localStorage.getItem('itdasy_custom_keywords') || '[]'); if (arr.indexOf(kw) < 0) { arr.push(kw); localStorage.setItem('itdasy_custom_keywords', JSON.stringify(arr)); } } catch (_e) { void _e; }
    _pickServiceTag(kw);   // 칩 추가 + setScreen('caption') 재렌더(입력칸은 닫힘)
  }
  // [P4 2026-07-10] 최근 시술 자동완성 — 생성한 시술 문구를 기억했다가 탭 한 번으로 다시 채운다(매번 재입력 제거).
  function _recentServices() { try { var a = JSON.parse(localStorage.getItem('itdasy:recent_services') || '[]'); return Array.isArray(a) ? a : []; } catch (_e) { return []; } }
  /* [최근시술 소스 확장 2026-07-20] '최근 시술' = 캡션에 쓴 것(위) + 실제 예약에서 쓴 시술. 관리 모드에서
     어느 소스를 반영할지 토글(itdasy_recent_src, 기본 둘 다 ON). × 삭제는 itdasy_recent_hidden 으로
     양쪽 소스에서 함께 숨긴다(예약 소스는 지워도 다시 오므로). 예약 시술은 window.Booking._items(메모리 캐시). */
  function _recentBookingServices() {
    try {
      var items = (window.Booking && window.Booking._items) || [];
      if (!Array.isArray(items)) return [];
      return items.slice().sort(function (a, b) { return new Date(b && b.starts_at || 0) - new Date(a && a.starts_at || 0); })
        .map(function (b) { return String(b && b.service_name || '').replace(/\s+/g, ' ').trim(); }).filter(Boolean);
    } catch (_e) { return []; }
  }
  function _recentSrcPref() {
    try { var p = JSON.parse(localStorage.getItem('itdasy_recent_src') || 'null'); if (p && typeof p === 'object') return { caption: p.caption !== false, booking: p.booking !== false }; } catch (_e) { void _e; }
    return { caption: true, booking: true };   // 기본 둘 다 ON
  }
  function _saveRecentSrcPref(p) { try { localStorage.setItem('itdasy_recent_src', JSON.stringify(p)); } catch (_e) { void _e; } }
  function _recentHidden() { try { var a = JSON.parse(localStorage.getItem('itdasy_recent_hidden') || '[]'); return Array.isArray(a) ? a : []; } catch (_e) { return []; } }
  function _recentHide(name) { try { var a = _recentHidden(); if (a.indexOf(name) < 0) { a.push(name); localStorage.setItem('itdasy_recent_hidden', JSON.stringify(a.slice(0, 60))); } } catch (_e) { void _e; } }
  /* [#5 2026-07-17] 중복선택이 되면서 svc 가 "속눈썹, 네일" 같은 조인 문자열로 들어온다.
     통째로 저장하면 '속눈썹, 네일' 이라는 없는 시술이 칩으로 박제되고(그 조합을 또 쓸 일도 없다)
     40자 한도에도 금방 걸린다 → **쉼표로 쪼개 하나씩** 저장한다. 상한 6 → 5(원장 요청). */
  function _saveRecentService(svc) {
    String(svc || '').split(',').forEach(_saveRecentServiceOne);
  }
  function _saveRecentServiceOne(svc) {
    svc = String(svc || '').replace(/\s+/g, ' ').trim(); if (svc.length < 2) return;
    // [칩삭제 2026-07-15] 저장 시점부터 정제 — 욕설·하소연 문장이 칩으로 박제되던 문제("엄뒤새끼 22인치…").
    //   드롭 규칙 통과 못 하거나 시술명치곤 너무 길면(40자+) 아예 안 남긴다.
    var n = ''; try { n = _publicServiceKeywords(svc) || ''; } catch (_e0) { void _e0; }
    svc = String(n || '').replace(/\s+/g, ' ').trim();
    if (svc.length < 2 || svc.length > 40) return;
    try {
      var a = _recentServices().filter(function (x) { return x !== svc; });
      a.unshift(svc); a = a.slice(0, 5);
      localStorage.setItem('itdasy:recent_services', JSON.stringify(a));
    } catch (_e) { void _e; }
  }
  // [칩삭제] 최근 시술 칩 × — 렌더는 정제된 이름으로 나가므로, 원문이 그 이름으로 정제되는 항목까지 같이 지운다.
  function _deleteRecentService(name) {
    name = String(name || '').trim(); if (!name) return;
    try {
      var a = _recentServices().filter(function (s) {
        var n = ''; try { n = _publicServiceKeywords(s) || ''; } catch (_e) { void _e; }
        n = String(n || s).replace(/\s+/g, ' ').trim();
        return n !== name && s !== name;
      });
      localStorage.setItem('itdasy:recent_services', JSON.stringify(a));
    } catch (_e2) { void _e2; }
    _recentHide(name);   // [소스확장] 예약 소스는 지워도 다시 오므로 숨김 목록에도 넣어 함께 제외
    // [#5] 다중선택 — 지운 칩만 선택에서 뺀다(예전엔 '통째로 같으면 전체 해제'라 다중에선 안 먹었다)
    _svcSet(_svcList().filter(function (s) { return s !== name; }));
    setScreen('caption');
  }
  function _recentSvcHtml() {
    var manage = !!d.svcManageOpen;
    var pref = _recentSrcPref();
    // [소스확장] 캡션 입력 + 예약 시술을 토글대로 병합. 관리 모드에선 토글칩을 항상 보여준다(비어도).
    var raw = [];
    if (pref.caption) raw = raw.concat(_recentServices());
    if (pref.booking) raw = raw.concat(_recentBookingServices());
    var hidden = _recentHidden();
    // [캡션재설계 v2] 시술명만 — 문장 통째 값은 드롭 규칙으로 정제, 40자+ 제외. 탭 = 시술 칩과 같은 단일선택.
    var _selArr = _svcList(), names = [], seen = {};
    raw.forEach(function (s) {
      var n = ''; try { n = _publicServiceKeywords(s) || ''; } catch (_e) { void _e; }
      n = String(n || s).replace(/\s+/g, ' ').trim();
      if (!n || n.length > 40 || seen[n] || hidden.indexOf(n) >= 0) return;
      seen[n] = 1; names.push(n);
    });
    names = names.slice(0, 8);   // 소스 둘이라 상한을 5→8 로(정제·중복·숨김 후 실제 보이는 수)
    if (!names.length && !manage) return '';   // 관리 모드면 토글 보이게 빈 상태도 렌더
    var toggleRow = manage ? ('<div class="cap-recentsrc">' +
        '<span class="cap-recentsrc__lbl">최근 시술 채우기</span>' +
        '<button type="button" class="cap-recentsrc__t' + (pref.caption ? ' on' : '') + '" data-fl-recentsrc="caption">캡션에 쓴 시술</button>' +
        '<button type="button" class="cap-recentsrc__t' + (pref.booking ? ' on' : '') + '" data-fl-recentsrc="booking">예약 시술</button>' +
      '</div>') : '';
    var hintTxt = manage ? '탭해서 선택 · ×로 삭제' : '최근 시술 · 탭해서 선택(여러 개 가능)';
    return toggleRow + '<div class="cap-svctags" style="margin-bottom:8px">' +
      '<span class="cap-svctags__hint" style="width:100%;margin:0 0 4px">' + hintTxt + '</span>' +
      names.map(function (n) { var lbl = n.length > 20 ? (n.slice(0, 20) + '…') : n;
        return '<button type="button" class="cap-svctag' + (_selArr.indexOf(n) >= 0 ? ' on' : '') + (manage ? ' cap-svctag--manage' : '') + '" data-fl-svctag="' + esc(n) + '" title="' + esc(n) + '">' + esc(lbl) +
          (manage ? '<span class="cap-svctag__x" data-fl-recentdel="' + esc(n) + '" aria-label="삭제">×</span>' : '') + '</button>'; }).join('') + '</div>';
  }

  // d.capTone(친근/전문/감성/이벤트/후기) → 백엔드 안전 매핑. mood(친근/전문/감성)는 검증된 tone_override 값 그대로, 이벤트/후기는
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
  // [2026-07-26 원영] 캡션 생성 로딩 v3 — 강아지·페르소나 칩(자연스러운/보통/✨) 폐지 → 잇비(#ic-bot)가
  //   초록 진행바를 걸어가는 로딩. 칩 3개는 미연동 기본값이 그대로 박혀 '셔플이 고장난 것'처럼 보였다.
  //   대신 단계 멘트 3개가 로테이션(사진→말투→문장)하며 '지금 뭘 하는지'를 말해준다. 화면 세로 중앙 정렬.
  //   자체 완결형 유지 — 외부 CSS(.cl-*)에 안 기댄다. CSS 캐시가 옛것이어도 keyframes 인라인이라 안 깨진다.
  function _capLoadingHtml() {
    var on = _personaOn();
    return '<style>' +
        // [2026-07-26 원영] 게이지는 1회만 — 2.6s infinite 루프가 "두 번 차오르는" 것으로 보였다.
        //   4.8s(최소 로딩시간과 동일) 동안 97%까지 차고 forwards 로 멈춰 대기. 100%는 완료 시 화면 전환이 대신한다.
        '@keyframes wclFill{0%{width:8%}100%{width:97%}}' +
        '@keyframes wclRun{0%{left:0%}100%{left:calc(100% - 40px)}}' +
        '@keyframes wclBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}' +
        '@keyframes wclMsg{0%,4%{opacity:0;transform:translateY(6px)}9%,28%{opacity:1;transform:translateY(0)}33%,100%{opacity:0;transform:translateY(-6px)}}' +
        // [2026-07-22 보스] !important 필수 — style-fun.css / style-polish.css 의 전역
        //   `@media (prefers-reduced-motion: reduce){ *{animation-duration:.01ms!important;
        //   animation-iteration-count:1!important} }` 가 로딩을 출발선에 얼려버린다.
        //   아이폰 '동작 줄이기'를 켠 원장님 화면에선 진행바·멘트가 전부 정지했다.
        //   로딩 표시는 장식이 아니라 '지금 일하는 중'이라는 피드백이라, 멈추면 앱이 죽은 걸로 보인다.
        '.wcl-run{animation:wclRun 4.8s cubic-bezier(.45,.05,.55,.95) 1 forwards!important}' +
        '.wcl-bob{animation:wclBob .5s ease-in-out infinite!important}' +
        '.wcl-fill{animation:wclFill 4.8s cubic-bezier(.45,.05,.55,.95) 1 forwards!important}' +
        '.wcl-msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0;animation:wclMsg 7.2s ease-in-out infinite!important}' +
        '.wcl-msg:nth-child(2){animation-delay:2.4s!important}' +
        '.wcl-msg:nth-child(3){animation-delay:4.8s!important}' +
      '</style>' +
      // min-height 62vh — 아래 공백 없이 화면 세로 중앙에 오도록(원영: "너무 밑에 공백많지않아? 좀 가운대로").
      '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px;min-height:62vh;text-align:center">' +
        '<div style="font-size:16px;font-weight:800;letter-spacing:-.02em;color:#2c2528">잇비가 ' + (on ? '우리샵 말투로 ' : '') + '쓰는 중…</div>' +
        '<div style="position:relative;width:100%;max-width:290px;height:48px">' +
          '<div class="wcl-run" style="position:absolute;bottom:16px;left:0">' +
            '<div class="wcl-bob" style="color:#d58a95"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#ic-bot"/></svg></div></div>' +
          '<div style="position:absolute;left:0;bottom:0;width:100%;height:11px;border-radius:6px;background:rgba(22,181,94,.13);overflow:hidden">' +
            '<div class="wcl-fill" style="height:100%;border-radius:6px;background:linear-gradient(90deg,#16B55E,#4ad683)"></div></div>' +
        '</div>' +
        '<div style="position:relative;width:100%;max-width:290px;height:20px;font-size:12.5px;font-weight:700;color:#a89aa0;letter-spacing:-.01em">' +
          '<span class="wcl-msg">사진을 살펴보는 중이에요</span>' +
          '<span class="wcl-msg">' + (on ? '원장님 말투를 맞추는 중이에요' : '어울리는 말투를 고르는 중이에요') + '</span>' +
          '<span class="wcl-msg">문장을 다듬는 중이에요</span>' +
        '</div>' +
      '</div>';
  }
  function renderCaption() {
    var url = outputUrl();
    if (d.capLoading) { return _capLoadingHtml(); }
	    if (!d.caption) {
	      // [v558] 캡션 UX 리뉴얼 — 시나리오 버튼 제거. 사진 → 시술 문구 입력 → 말투 6칩 → 길이 → 해시태그 토글 → 단일 생성 버튼.
	      // [ws-hyper] 레이아웃 합성본은 폭 꽉 차는 img로(레터박스 빈 여백 제거).
	      var photoThumb = d.templateOutput   /* [버그수정 2026-07-06] 재오픈 초안도 합성본 썸네일 */
	        ? '<div class="wsl-cap-preview"><img src="' + esc(_blobDisp(d.templateOutput)) + '" alt="미리보기"></div>'
	        : (_capCarouselHtml() || ((!d.textOnly && url) ?
	        '<div class="cap-photo cap-photo--sm" style="background-image:url(' + esc(_blobDisp(url)) + ')"></div>' : ''));
	      // [캡션재설계 v2 2026-07-15] 자유 서술 텍스트영역(500자) 제거 — 질문 3카드 + 시술 칩(단일선택) + 특이사항 한 줄.
      //   자유 텍스트가 시술명으로 못박혀 욕설·사담이 캡션에 그대로 실리던 verbatim 버그의 입구를 막는다.
	      if (SIMPLE_FLOW) {
        // 우리샵 스타일 시드만 보장 — 스타일 카드·레이아웃 미리보기·디자인 패널은 편집기로 이동.
        if (window.ShopStyle && window.ShopStyle.ensureSeed) { try { window.ShopStyle.ensureSeed(); } catch (_e0) { void _e0; } }
        var _note = String(d.specialNote || '');
	        return photoThumb +
	          '<div class="cap-wizscreen">' +
          '<div class="screen-head"><h2>게시글 만들기</h2><p class="screen-head__sub">질문에 답하고 시술만 고르면 우리샵 말투로 알아서 써드려요.</p></div>' +
          _capWizHtml() +
          '<label class="cap-field-label capwiz__seclbl">시술</label>' +
          _svcTagsHtml() +
          _recentSvcHtml() +
          '<label class="cap-field-label capwiz__seclbl">특이사항 <span>선택 · 그대로 안 실려요, 뜻만 반영돼요</span></label>' +
          '<div class="capwiz__noterow">' +
            '<input type="text" class="capwiz__notein" data-fl-specialnote maxlength="120" value="' + esc(_note) + '">' +   // [2026-07-26 원영] placeholder 예시 제거
            '<span class="capwiz__notecnt" data-fl-notecount>' + (120 - _note.length) + '</span>' +
          '</div>' +
          '<p class="capwiz__guard">직접·특이사항에 적은 글은 재료로만 써요. 욕설·감정 표현은 빼고, 시술 얘기만 골라 원장님 말투로 새로 씁니다.</p>' +
          // [보스 2026-07-12] 말투·성격 칩 제거 — 화면 간소화(생성은 기본 톤 d.capTone='friendly', _resolveTone 이 매핑).
          _shopInfoToggleHtml() +   // [#19] 저장된 예약/전화 반영 여부(기본 OFF)
          _capWizCtaHtml() +
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
	      '<label class="cap-field-label">게시글 <span>미리보기에서 바로 고쳐 쓸 수 있어요</span></label>' +
	      _igPreviewCard(url, true) +   // [v584] 카드 안 캡션 직접 편집(별도 편집칸 제거)
      _capActionRow() +             // [2026-07-26 원영] 복사·문장만 다시·저장 — 카드 밖 필 버튼
      // [2026-07-26 원영] 해시태그 = 칩 UI(개별 ×삭제 + 추가) — 카드 안 contenteditable 직접편집은
      //   지우기/고치기 방법을 아무도 못 찾던 문제라 폐지. 칩이 진실원(d.hashtags/selectedHashes 동시 갱신).
      _hashChipsHtml() +
      // [v589] 꼬리말 블록 폐지 → 설정폼으로 이동. 복사/다시생성/저장은 카드 액션줄로 이동.
      // [2026-07-26 원영] '이렇게 올라가요' 라벨 + 피드 그리드(_feedPreview) 제거 — 위 미리보기 카드로 이미 충분("피드 보여줬으면 됐지").
      // [2026-07-26 원영] 마무리 재구성 — '사진 편집'은 _finishActions 반반 줄로 이동(.cap-edit-btn 폐지),
      //   '재료부터 다시 고르기'(.cap-restart) 삭제. 상단 뒤로가기(←)가 그 역할.
      custLine +
      _publishBlock() +
      _finishActions(url);
	  }

  /* [시술칩 관리모드 2026-07-20] 관리 모드에서 시술 칩 드래그로 순서 바꾸기 — 포인터 이벤트(모바일 터치 대응,
     HTML5 DnD 는 폰에서 미동작). 6px 넘게 움직이면 드래그로 판정, 드롭 시 화면 순서를 itdasy_svc_order 에 저장.
     × 삭제(data-fl-svcdel)·탭 선택(data-fl-svctag)은 기존 위임이 처리 — 드래그 직후 click 만 억제. */
  function _bindSvcSort() {
    if (!el) return;
    var cont = el.querySelector('.cap-svctags.is-manage');
    if (!cont || cont._svcSortBound) return;
    cont._svcSortBound = true;
    var dragging = null, moved = false, sx = 0, sy = 0;
    cont.addEventListener('pointerdown', function (e) {
      if (e.target.closest('[data-fl-svcdel]')) return;                 // × 는 삭제가 처리
      var chip = e.target.closest('[data-fl-svcsort]');
      if (!chip || chip.parentNode !== cont) return;
      dragging = chip; moved = false; sx = e.clientX; sy = e.clientY;
      try { chip.setPointerCapture(e.pointerId); } catch (_e) { void _e; }
    });
    cont.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      if (!moved && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) < 6) return;
      moved = true; dragging.classList.add('is-dragging');
      var over = document.elementFromPoint(e.clientX, e.clientY);
      over = over && over.closest('[data-fl-svcsort]');
      if (over && over !== dragging && over.parentNode === cont) {
        var arr = Array.prototype.slice.call(cont.querySelectorAll('[data-fl-svcsort]'));
        if (arr.indexOf(dragging) < arr.indexOf(over)) cont.insertBefore(dragging, over.nextSibling);
        else cont.insertBefore(dragging, over);
      }
    });
    function _end(e) {
      if (!dragging) return;
      var wasMoved = moved; dragging.classList.remove('is-dragging');
      try { dragging.releasePointerCapture(e.pointerId); } catch (_e) { void _e; }
      dragging = null;
      if (wasMoved) {
        var order = Array.prototype.slice.call(cont.querySelectorAll('[data-fl-svcsort]')).map(function (c) { return c.getAttribute('data-fl-svctag'); });
        _saveSvcOrder(order);
        cont._suppressClick = true; setTimeout(function () { cont._suppressClick = false; }, 80);
      }
    }
    cont.addEventListener('pointerup', _end);
    cont.addEventListener('pointercancel', _end);
    cont.addEventListener('click', function (e) { if (cont._suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);
  }
  function _mountCaption() {
    _mountCarousel();   // [v531] 결과 캐러셀 스와이프 바인딩(결과 화면엔 scenario 없어 아래 early-return 전에 먼저)
    if (d.svcManageOpen) _bindSvcSort();   // [관리모드] 시술 칩 드래그 정렬 바인딩
    // [캡션재설계 v2] 시술 자유서술 textarea 제거 — Enter 생성/글자수(500) 바인딩도 함께 삭제. 생성은 '캡션 만들기' 버튼만.
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
    // [v778 보스] 시술 추가 인라인 입력 — Enter=확정, Esc=취소, 다른 곳 탭(blur)=값 있으면 확정. 팝업 없이 바로 타이핑.
    var svin = el.querySelector('[data-fl-svcaddin]');
    if (svin && !svin._wsBound) {
      svin._wsBound = true;
      svin.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); _commitSvcKeyword(''); return; }
        if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
        e.preventDefault(); _commitSvcKeyword(svin.value);
      });
      svin.addEventListener('blur', function () { _commitSvcKeyword(svin.value); });
      try { svin.focus(); } catch (_es) { void _es; }
    }
    // [2026-07-26 원영] 해시태그 추가 인라인 입력 — svcaddin 과 같은 관용구(Enter=확정/Esc=취소/blur=확정).
    var hin = el.querySelector('[data-fl-hashaddin]');
    if (hin && !hin._wsBound) {
      hin._wsBound = true;
      hin.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); _commitHashAdd(''); return; }
        if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
        e.preventDefault(); _commitHashAdd(hin.value);
      });
      hin.addEventListener('blur', function () { _commitHashAdd(hin.value); });
      try { hin.focus(); } catch (_eh) { void _eh; }
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
    // [2026-07-26 원영] 카드 안 해시태그 contenteditable 동기화 삭제 — 편집은 아래 해시태그 칩 UI 로 일원화.
    // [v589·#3] 결과 화면이면 각 사진에 우리샵 스타일 적용 미리보기 합성(원본은 보존, 결과 표시 전용).
    if (String(d.caption || '').trim()) _autoComposeTemplate();
  }
  // [v532] 캡션 생성 단일 진입점 — Enter/상황버튼 어느 경로든 동일하게:
  //   ① DOM 에서 키워드 최신값 동기화 ② 상황축 반영(없으면 기본 '시술 완성') ③ doGenerate.
  //   두 경로가 같은 함수를 타도록 통합해 입력 반영 차이를 제거한다.
  function _triggerCaptionGenerate(axes) {
    syncServiceFromDom();
    if (axes) d.captionAxes = axes;
    if (!String(d.service || '').trim()) { toast('시술 칩을 하나 골라주세요 — 없으면 + 추가로 만들 수 있어요'); return; }
    // [위저드 선택형] 위에서 아무것도 안 골랐으면 강제 기본값 안 넣고 '고른 시술 그대로만' 생성.
    if (!d.captionAxes) d.captionAxes = {};
    doGenerate({}, null);
  }
  // [직접 입력] 인라인 확인 — 값을 그 축에 저장하고 입력창 닫기(칩 active 유지). 빈값이면 유지.
  function _wizCustomConfirm() {
    var key = d._wizCustom; if (!key) return;
    var inp = el.querySelector('[data-fl-wizcustin]');
    var val = inp ? String(inp.value || '').trim() : '';
    if (!val) { toast('직접 적을 내용을 입력해 주세요'); if (inp) try { inp.focus(); } catch (_e) { void _e; } return; }
    syncServiceFromDom();
    d.captionAxes = d.captionAxes || {}; d.captionAxes[key] = val;
    d._wizCustom = null;
    d._wizJust = key; d._wizOpen = null;   // [아코디언] 직접 입력 확정도 접힘 + 다음 질문 열림
    setScreen('caption');
  }

	  // [v564·필수6] 인스타 미리보기 사진 carousel — 게시글/캡션 화면과 동일한 _displayItems 사용.
	  //   템플릿 적용 pair = 결과 1장, 미적용 = 원본 개별. 좌우 스와이프 + index 도트.
	  function _igCarouselHtml(fallbackUrl) {
	    var items = _displayItems();
	    if (items.length <= 1) {
	      var u = items.length ? items[0].url : fallbackUrl;
	      return '<div class="ig-photo' + (_wsFormat() === '11' ? ' ig-photo--sq' : '') + '" style="background-image:url(' + esc(_blobDisp(u)) + ')"></div>';
	    }
	    var active = (d.activeDisplayId && items.some(function (it) { return it.id === d.activeDisplayId; })) ? d.activeDisplayId : items[0].id;
	    var slides = items.map(function (it) {
	      var toggleAttr = it.kind === 'output' && it.expandable ? ' data-fl-tplexpand="' + esc(it.id) + '"'
	        : (it.ofPair ? ' data-fl-tplcollapse="' + esc(it.ofPair) + '"' : '');
	      return '<div class="ig-car__slide" data-fl-carslide="' + esc(it.id) + '"' + toggleAttr + '>' +
	        '<div class="ig-car__img" style="background-image:url(' + esc(_blobDisp(it.url)) + ')"></div></div>';
	    }).join('');
	    var dots = items.map(function (it) { return '<button type="button" class="ig-car__dot' + (it.id === active ? ' on' : '') + '" data-fl-cardot="' + esc(it.id) + '" aria-label="이 사진 보기"></button>'; }).join('');
	    return '<div class="ig-car cap-car' + (_wsFormat() === '11' ? ' ig-car--sq' : '') + '" data-fl-carousel>' +
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
	        // [2026-07-26 원영] v589 '카드 액션줄 기능화' 철회 — 목업 안 기능버튼 혼입이 어색("너무 별로").
	        //   카드는 순수 인스타 미리보기(정적 아이콘)로 복원, 기능 버튼은 카드 아래 _capActionRow 로 분리.
	        '<div class="ig-act"><div class="ig-ic"><i class="ph-duotone ph-heart"></i><i class="ph-duotone ph-chat-circle"></i><i class="ph-duotone ph-paper-plane-tilt"></i></div>' +
	        '<div class="ig-save"><i class="ph-duotone ph-bookmark-simple"></i></div></div>' +
	        /* [2026-07-26 원영] 닉네임 옆이 아니라 아랫줄부터 캡션 시작(미관) — <br> 삽입 */
        '<div class="ig-copy2"><b>' + esc(handle) + '</b><br><span data-fl-igcap' + (editable ? ' class="ig-cap-edit" contenteditable="true" role="textbox" aria-label="게시글 편집" spellcheck="false"' : '') + '>' + esc(d.caption || '') + '</span><br><span class="ig-hash" data-fl-ighash>' + esc((d.selectedHashes && d.selectedHashes.length ? d.selectedHashes : d.hashtags).join(' ')) + '</span><div class="ig-ago">' + (editable ? '게시글을 눌러 바로 고쳐 쓰기' : '미리보기') + '</div></div>' +
	      '</div>';
	  }
	  // [2026-07-26 원영] 복사·문장만 다시·저장 — 인스타 목업 카드 밖, 카드 바로 아래 텍스트 필 버튼 한 줄.
  //   data-fl / data-fl-var 속성은 기존 위임 핸들러 그대로 사용(핸들러 수정 없음). 아이콘 없음(텍스트 전용).
  function _capActionRow() {
    return '<div class="cap-actrow">' +
      '<button type="button" class="cap-actbtn" data-fl="copycap">복사</button>' +
      '<button type="button" class="cap-actbtn" data-fl-var="regen">문장만 다시</button>' +
      '<button type="button" class="cap-actbtn" data-fl="saveimg">저장</button>' +
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
	  // [2026-07-26 원영] 피드 미리보기(_feedPreview) 통째 삭제 — "피드 보여줬으면 됐지" 지시. 위 인스타 카드로 충분.
	  //   wsfeed CSS 도 함께 정리(css/workspace-v2-flow.css).
	  /* [2026-07-26 원영] 해시태그 칩 편집 — 예전엔 카드 안 텍스트 직접편집(contenteditable)뿐이라
	     지우는 방법이 안 보였다("해시태그 어디서 지울수있는거야?"). 카드 밑에 칩 목록: ×로 개별 삭제, 추가는 인라인 입력.
	     d.hashtags/selectedHashes 는 항상 같이 갱신(발행 payload 는 selectedHashes 우선이라 어긋나면 사고). */
	  function _hashList() {
	    return ((d.selectedHashes && d.selectedHashes.length) ? d.selectedHashes : (d.hashtags || [])).slice();
	  }
	  function _hashSet(arr) {
	    var prev = _hashList();
	    var seen = {}, out = [];
	    (arr || []).forEach(function (h) {
	      h = String(h || '').trim().replace(/\s+/g, '');
	      if (!h || h === '#') return;
	      if (h[0] !== '#') h = '#' + h;
	      if (!seen[h]) { seen[h] = 1; out.push(h); }
	    });
	    // [2026-07-26 원영] 원장님 손편집 기억 — ×로 지운 태그는 재생성돼도 부활 금지(_hashRemoved),
	    //   직접 다시 추가하면 해제. _hashEdited 면 재생성이 태그 목록을 통째로 덮어쓰지 않는다.
	    d._hashRemoved = d._hashRemoved || [];
	    prev.forEach(function (h) { if (out.indexOf(h) < 0 && d._hashRemoved.indexOf(h) < 0) d._hashRemoved.push(h); });
	    out.forEach(function (h) { var ri = d._hashRemoved.indexOf(h); if (ri >= 0) d._hashRemoved.splice(ri, 1); });
	    d._hashEdited = true;
	    d.hashtags = out; d.selectedHashes = out.slice();
	  }
	  function _hashChipsHtml() {
	    var hs = _hashList();
	    var chips = hs.map(function (h) {
	      return '<span class="cap-hashchip">' + esc(h) + '<button type="button" class="cap-hashchip__x" data-fl-hashdel="' + esc(h) + '" aria-label="이 해시태그 삭제">×</button></span>';
	    }).join('');
	    var add = d._hashAddOpen
	      ? '<input type="text" class="cap-hashchip cap-hashchip--addin" data-fl-hashaddin maxlength="30" placeholder="#태그 입력 후 Enter" aria-label="해시태그 입력">'
	      : '<button type="button" class="cap-hashchip cap-hashchip--add" data-fl="hashaddopen"><i class="ph-bold ph-plus"></i> 추가</button>';
	    return '<label class="cap-field-label cap-hashlbl">해시태그 <span>×로 지우고, 필요하면 추가해요</span></label>' +
	      '<div class="cap-hashchips">' + chips + add + '</div>';
	  }
	  function _commitHashAdd(v) {
	    if (!d._hashAddOpen) return;   // Enter+blur 중복 방지(시술 추가와 같은 관용구)
	    d._hashAddOpen = false;
	    v = String(v || '').trim();
	    if (v) _hashSet(_hashList().concat([v]));
	    setScreen('caption', { push: false });
	  }
	  function renderPreview() {
	    var url = outputUrl();
	    var custLine = d.customerName ?
	      '<div class="confirmline">연결 손님: <b>' + esc(d.customerName) + '</b>' + (d.customerVc ? ' · ' + d.customerVc + '회 방문' : ' · 첫 방문') + '</div>' : '';
	    // [v592] 인스타 미리보기 단계 = 최종 카드 + 게시.
	    return '' + custLine + _igPreviewCard(url, true) + _capActionRow() + _publishBlock() + _finishActions(url);
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
    // [T-116] 결과물이 2장 이상이면(카드 여러 개) 캐러셀 — 레이아웃을 썼다고 무조건 단일 피드가 아니다.
    var nOut = (d.templateOutputs || []).length;
    if (nOut >= 2) return 'carousel';
    /* [버그수정 2026-07-17] 합성본 1장 = 단일 피드. 예전 기준은 `d.wsLayout && d.templateOutput` 이었는데
       d.wsLayout 은 레이아웃 화면이 세션 중에만 채우는 별칭이고 open() 이 복원하지 않는다(d 리터럴에 키 없음).
       → 초안을 닫았다 다시 열어 발행하면 hasComposite=false 로 떨어져 '원본 사진 전부'가 캐러셀로 나갔다:
         레이아웃이 조용히 사라지고, 서버가 child 마다 2초씩 순차 폴링해 발행이 30초+ 로 늘어짐.
       판단 근거를 세션 상태가 아니라 저장되는 결과물(templateOutputs/templateOutput)로 바꾼다. */
    if (nOut === 1 || d.templateOutput) return 'feed';
    return ((editablePhotos() || []).length >= 2) ? 'carousel' : 'feed';
  }
  function _publishBlock() {
	    var _ig = window.WorkspaceAdapter ? window.WorkspaceAdapter.instagram() : {};
	    var connected = !!_ig.connected;
	    // [출시감사 2026-07-31] 자동 발행 권한(content_publish)이 Meta 심사 중이면 발행 버튼을 안 띄운다.
	    //   연동은 돼 있어서 예전엔 버튼이 보였고, 누르면 그냥 실패했다. 대신 캡션 복사를 안내한다 —
	    //   원장님 입장에선 "인스타 앱에서 직접 올리면 되는" 일이라 막다른 길이 아니다.
	    //   심사 통과하면 백엔드 capabilities.publish 가 true 로 바뀌며 자동으로 버튼이 돌아온다.
	    if (connected && _ig.canPublish === false) {
	      return '<div class="cap-pubnote" style="margin-top:10px;padding:12px;border-radius:12px;background:#fff7ed;color:#9a3412;font-size:12px;line-height:1.6;">' +
	        '자동 발행은 <b>인스타그램 심사 중</b>이에요. 승인되면 여기 버튼이 자동으로 생겨요.<br>' +
	        '지금은 아래 <b>복사</b>를 눌러 캡션을 가져간 뒤, 인스타 앱에서 사진과 함께 올려주세요 🙏' +
	        '</div>';
	    }
	    // [cleanup] 스토리 발행 픽커 제거(2026-07-12) — 진입 버튼(publishstory)이 재설계로 사라져 도달 불가였음. 발행은 피드/여러 장만.
	    if (connected) {
	      // [스토리/캐러셀] 피드 + 스토리, 사진 2장 이상이면 캐러셀(여러 장) 버튼도.
	      // [버그수정 2026-07-10] ws-hyper 레이아웃은 여러 장을 '1장 합성본'(d.templateOutput)으로 합침 →
	      //   캐러셀(여러 장 슬라이드)은 부적절하고 원본 여러 장을 보내 실패했음. 레이아웃이면 단일 피드로만.
	      var _n = (editablePhotos() || []).length;
	      var _multi = _publishKind() === 'carousel';
	      // [2026-07-26 원영] 마무리 재구성 — 발행 블록은 '주 행동 1개'(인스타에 올리기)만.
	      //   계정태그·예약·사진편집은 _finishActions()/_tagsBlockHtml() 로 이동(버튼 5개 위계 없이 쌓이던 것).
	      return '<div class="cap-pubrow" style="margin-top:10px">' +
	        '<button type="button" class="cap-preview cap-preview--send" style="width:100%" data-fl="publish"' + (d._publishing ? ' disabled' : '') + '>' + (d._publishing ? '<i class="ph-duotone ph-spinner"></i>올리는 중…' : '<i class="ph-duotone ph-paper-plane-tilt"></i>인스타에 올리기' + (_n > 1 ? ' (' + _n + '장)' : '')) + '</button>' +
	      '</div>' +
	      // [통합 2026-07-14] '여러 장으로 올리기' 별도 버튼 제거 — 위 버튼 하나가 _publishKind() 로 알아서 캐러셀 발행.
      (_multi ? '<div class="cap-pubnote">선택한 ' + _n + '장이 여러 장 게시물로 올라가요</div>' : '');
	    }
    // [2026-07-26 원영] 복사·저장 버튼 제거 — 카드 아래 _capActionRow 가 항상 제공(중복 금지). 연결 버튼만.
    return '<div class="wsflow-prep">' +
      '<div class="wsflow-prep__note">인스타 계정이 연결되지 않아 바로 업로드할 수 없어요. 준비만 해둘게요.</div>' +
      '<div class="wsflow-prep__row">' +
        '<button type="button" class="pink" data-fl="igconnect">인스타 연결</button>' +
      '</div></div>';
  }
  // [2026-07-26 원영] 계정 태그 블록 — _publishBlock 에서 분리(위계 정리). markup 은 v776/닫기 추가분 그대로.
  function _tagsBlockHtml() {
    var _multi = _publishKind() === 'carousel';
    var _tagVal = (d.igUserTags || []).map(function (u) { return '@' + u; }).join(', ');
    return (d._tagsOpen || _tagVal)
      ? '<div class="cap-usertags"><div style="display:flex;align-items:center;gap:8px">' +
          '<input type="text" data-fl-usertags placeholder="@아이디 (쉼표로 여러 명)" value="' + esc(_tagVal) + '" style="flex:1;min-width:0">' +
          '<button type="button" data-fl="tagsclose" aria-label="계정 태그 접기" style="flex:none;background:none;border:none;padding:4px;font-size:12px;font-weight:700;color:#a89aa0;cursor:pointer">안 달래요 <i class="ph-bold ph-x" style="vertical-align:-2px"></i></button>' +
        '</div>' +
        (_multi ? '<div class="cap-tagnote">여러 장은 첫 번째 사진(커버)에만 태그가 붙어요</div>' : '') + '</div>'
      : '<button type="button" class="cap-tagtoggle" data-fl="tagsopen">사진에 다른 계정 태그 달기 (선택)</button>';
  }
  // [2026-07-26 원영] 마무리 보조 액션 스택 — 주 버튼 아래 반반 [사진 편집][예약해서 올리기](간격 통일),
  //   그 아래 계정 태그(작은 텍스트). '재료부터 다시 고르기'는 삭제 — 상단 뒤로가기(←)가 그 역할.
  function _finishActions(url) {
    var connected = window.WorkspaceAdapter ? window.WorkspaceAdapter.instagram().connected : false;
    var eBtn = (!d.textOnly && url) ? '<button type="button" class="cap-halfbtn" data-fl="storyedit"><i class="ph-duotone ph-magic-wand"></i> 사진 편집</button>' : '';
    var sBtn = connected ? '<button type="button" class="cap-halfbtn" data-fl="' + (d._schedOpen ? 'schedclose' : 'schedopen') + '"><i class="ph-duotone ph-clock"></i> 예약해서 올리기</button>' : '';
    return ((eBtn || sBtn) ? '<div class="cap-halfrow">' + eBtn + sBtn + '</div>' : '') +
      (connected && d._schedOpen ? _schedHtml() : '') +
      (connected ? _tagsBlockHtml() : '');
  }

  // [v779] 예약 발행 — 기본 접힘, '예약하기' 누르면 datetime 입력. 스타일 inline(CSS 캐시 안전).
  //   백엔드 /scheduled-posts 가 예약시각에 content_publish 로 발행(새 Meta 권한 불필요).
  function _schedDefault() {
    try {
      var t = new Date(Date.now() + 2 * 3600 * 1000); t.setMinutes(0, 0, 0);
      var p = function (n) { return String(n).length < 2 ? '0' + n : '' + n; };
      return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate()) + 'T' + p(t.getHours()) + ':' + p(t.getMinutes());
    } catch (_e) { return ''; }
  }
  function _schedHtml() {
    // [2026-07-26 원영] 접힘 상태 버튼은 _finishActions 의 반반 줄로 이동 — 여기선 열린 패널만 렌더.
    if (!d._schedOpen) return '';
    // [2026-07-22 보스] 여러 장이면 몇 장이 예약되는지 미리 말한다 — 예약은 나중에 올라가서
    //   잘못 나가도 그 자리에서 못 알아챈다. 장수는 발행과 같은 규칙(_scheduleImages)으로 센다.
    var _sn = _scheduleImages().length;
    var _snNote = _sn >= 2
      ? '<div style="font-size:11.5px;font-weight:600;color:#a89aa0;margin:-4px 0 8px">사진 ' + _sn + '장이 여러 장 게시물로 올라가요</div>'
      : '';
    // [2026-07-26 원영] 닫기 추가 — 예전엔 펼치기만 있고 되돌리기가 없어 예약 안 할 건데도 패널을 못 닫았다.
    return '<div style="margin-top:8px;padding:12px;border:1px solid rgba(213,138,149,.28);border-radius:14px;background:rgba(213,138,149,.05)">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
          '<div style="font-size:12.5px;font-weight:700;color:#8a7a80">언제 올릴까요?</div>' +
          '<button type="button" data-fl="schedclose" aria-label="예약 접기" style="background:none;border:none;padding:2px 4px;font-size:12px;font-weight:700;color:#a89aa0;cursor:pointer">그냥 바로 올릴래요 <i class="ph-bold ph-x" style="vertical-align:-2px"></i></button>' +
        '</div>' +
        _snNote +
        '<input type="datetime-local" data-fl-schedat value="' + esc(d._schedVal || _schedDefault()) + '" style="width:100%;height:42px;border:1px solid #E9EBEE;border-radius:10px;padding:0 10px;font-size:14px;box-sizing:border-box;margin-bottom:8px">' +
        '<button type="button" data-fl="schedule"' + (d._scheduling ? ' disabled' : '') + ' style="width:100%;height:46px;border:none;border-radius:12px;background:#d58a95;color:#fff;font-size:14.5px;font-weight:800;cursor:pointer">' + (d._scheduling ? '예약 중…' : '이 시간에 예약') + '</button>' +
      '</div>';
  }
  function _fmtSchedTime(dt) {
    try { var p = function (n) { return String(n).length < 2 ? '0' + n : '' + n; }; return (dt.getMonth() + 1) + '월 ' + dt.getDate() + '일 ' + p(dt.getHours()) + ':' + p(dt.getMinutes()); } catch (_e) { return '예약 시간'; }
  }
  /* [2026-07-22 보스] 예약에 실을 사진 목록 — '지금 올리기'(publish 의 _imgs)와 똑같은 규칙.
     ① 레이아웃 합성본이 2장 이상이면 그 합성본들(원본이 아니라!)
     ② 합성본이 딱 1장이면 그 1장(여러 장을 한 장으로 합친 콜라주 — 더 쪼개면 안 된다)
     ③ 합성본이 없으면 편집 반영된 사진들
     규칙이 어긋나면 "화면엔 콜라주인데 예약은 원본 5장" 같은 조용한 사고가 난다. */
  function _scheduleImages() {
    var outs = (d.templateOutputs || []).map(function (o) { return o && o.outputUrl; }).filter(Boolean);
    if (outs.length >= 2) return outs;
    if (d.templateOutput || outs.length === 1) return [d.templateOutput || outs[0]].filter(Boolean);
    return (editablePhotos() || []).map(function (p) { return dispUrl(p); }).filter(Boolean);
  }
  function _doSchedule() {
    if (d._scheduling) return;
    var inp = el && el.querySelector('[data-fl-schedat]');
    var val = inp && inp.value; if (val) d._schedVal = val;
    if (!val) { toast('올릴 날짜·시간을 골라 주세요'); return; }
    var when = new Date(val);
    if (isNaN(when.getTime()) || when.getTime() < Date.now() + 60000) { toast('지금보다 나중 시간으로 골라 주세요'); return; }
    if (!(editablePhotos() || []).length && !d.templateOutput && !(d.templateOutputs || []).length) { toast('사진을 먼저 추가해 주세요'); return; }
    flushCaptionInputs();
    if (!String(d.caption || '').trim()) { toast('게시글을 먼저 만들어 주세요'); return; }
    // [2026-07-22 보스] 여러 장 예약 허용. 예전엔 백엔드가 이미지 1장만 받아서 여기서 통째로 막았는데
    //   (`여러 장 게시물은 예약이 아직 안 돼요`), 이제 scheduled_posts.image_urls + 캐러셀 발행 워커가 생겼다.
    //   보내는 사진 목록은 '지금 올리기'(publish carousel)와 같은 규칙 — 합성본 2장 이상이면 합성본,
    //   아니면 편집 반영된 사진들. 그래야 눈에 보이는 것과 예약된 것이 어긋나지 않는다.
    var _schedImgs = _scheduleImages();
    if (!_schedImgs.length) { toast('사진을 먼저 추가해 주세요'); return; }
    if (_schedImgs.length > 10) { toast('사진은 10장까지 예약할 수 있어요'); return; }
    if (!(window.WorkspaceAdapter && window.WorkspaceAdapter.scheduleInstagramV2)) { toast('예약 기능을 불러오지 못했어요'); return; }
    d._scheduling = true; setScreen('caption', { push: false });
    var myD = d;
    window.WorkspaceAdapter.scheduleInstagramV2({ imageUrls: _schedImgs, caption: d.caption, hashtags: (d.hashtags || []).slice(0, 30), scheduledAt: when.toISOString() })
      .then(function (r) {
        if (myD !== d || myD._dead) return;   // 세션 교체/닫힘 — 새 글 안 건드림
        d._scheduling = false;
        if (r && r.ok) {
          d.publish = d.publish || {}; d.publish.status = 'scheduled'; d.publish.scheduledAt = when.getTime();
          try { if (window.WorkspaceAdapter.saveItem) window.WorkspaceAdapter.saveItem(buildSlot()); } catch (_e) { void _e; }
          toast(_fmtSchedTime(when) + '에 ' + ((r.count || 1) >= 2 ? '사진 ' + r.count + '장이 ' : '') + '올라가도록 예약했어요');
          if (window.WorkspaceV2 && window.WorkspaceV2.refresh) window.WorkspaceV2.refresh();
          close();
        } else { toast((r && r.toast) || '예약에 실패했어요'); setScreen('caption', { push: false }); }
      }).catch(function () { if (myD === d) { d._scheduling = false; toast('예약에 실패했어요 — 잠시 후 다시'); setScreen('caption', { push: false }); } });
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
    // [T-116] 카드가 여러 장이면 후기 카드만 있는 게 아니라도 전부 다시 굽는다 — 결과물 배열 전체가 진실.
    if (_WSL.hasReviewCard && _WSL.hasReviewCard() && window.WorkspaceLayout) return _WSL.composeCards();
  }
  // 편집 전환 전: 현재 보정을 굽고(bake) 다음 단계.
  function _exitEdit() { return bakeEdit(); }
  // [ws-hyper] 레이아웃 전환 전: 조정된 focal/zoom 으로 최종 이미지 합성 후 다음 단계.
  // [T-116] 카드(=올라갈 사진)마다 한 번씩 구워 templateOutputs 배열로. 레이아웃 없는 카드는 사진 그대로.
  function _exitLayout() {
    if (window.WorkspaceLayout && _WSL.composeCards) return _WSL.composeCards();
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

	  // 생성/재렌더 직전 입력창의 최신 값을 직접 읽음 — input 이벤트 누락/IME 미확정으로 글자가 빠지는 것 방지.
	  // [캡션재설계 v2] 시술은 칩 단일선택(d.service 직저장)이라 DOM 동기화 대상은 특이사항 입력칸뿐.
	  function syncServiceFromDom() {
	    if (!el) return;
	    var n = el.querySelector('[data-fl-specialnote]');
	    if (n && typeof n.value === 'string') d.specialNote = n.value;
	  }
	  // [캡션재설계 v2 2026-07-15] extra_notes 빌더 — verbatim 버그 수정의 핵심.
	  //   기존: '이 게시글의 시술은 오직 "<자유서술 원문>"' 으로 원문 전체를 시술명으로 못박음 → 욕설·불만 문장이
	  //   캡션에 그대로 실렸다. 이제 시술명 = 시술 칩 선택값(_publicServiceKeywords 정제)만 넣고,
	  //   특이사항 메모는 '재료' 규칙(그대로 복사 금지·시술 사실만 발췌·욕설/감정/환불 금지)으로 분리 지시.
	  //   regenSeq 가 있으면 '앞 글과 다른 구성으로' 변형 지시 추가('다시 쓰기' 가 동일 캡션 반복하던 회귀 해소).
	  function _buildExtraNotes(svc, regenSeq, hasNote) {
	    var s = String(svc || '').trim().slice(0, 40);
	    var note = (hasNote
	        ? '특이사항 메모는 재료일 뿐 — 문장 그대로 복사 금지. 시술 사실(길이·색·기법·방문 차수)과 고객 방문 사연(멀리·해외에서 와주신 것 등 긍정 맥락)은 빠짐없이 자연스럽게 반영하고, 욕설·비속어·감정 표현·환불/불만 얘기는 캡션에 절대 넣지 말 것. ' : '') +
	      '이 게시글의 시술명은 "' + s + '" 하나뿐. 과거 글·예시는 말투와 문장 길이만 참고하고, 입력에 없는 다른 시술/상품명은 사진·예시에 보여도 절대 언급하지 말 것. ' +
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
	  // 입력에서 샵/고객/시술을 분리 — 샵 파싱이 자동(#1)이라 확인칩(P1-1)은 제거됨.
	  function _capParseService() {
	    var raw = String(d.service || '');
	    var c = _cleanService(raw);
	    var shop = c.shop || _shopName() || '';   // [#1] 사용자가 친 인라인 샵 우선(stale 등록값 'Dd' 가 덮어쓰는 것 방지)
	    var customer = c.customer || (d.customerId ? d.customerName : '') || '';   // [#1] 연결된 고객(customerId)만 재사용, stale 이름('방') 방지
	    return { shop: shop, customer: customer, service: c.service || raw };
	  }
	  function doGenerate(extra, label) {
	    if (d.capLoading) return;   // [audit] 생성 중 재탭 무시 — 연타 시 API 이중 호출(비용) 방지
	    syncServiceFromDom();
	    var svc = String(d.service || '').trim();
	    if (!svc) { toast('시술 칩을 먼저 골라주세요'); return; }
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
	    _genPending++;   // [카오스 P2] in-flight 생성 카운트 — 응답(.then/.catch)에서 감소
	    d.capLoading = true; setScreen('caption');
	    // [v779] 생성 타임아웃 — 약전파/프록시 stall 로 응답이 매달리면(끊김 아님) 프로미스가 영영 settle 안 돼
	    //   스피너가 무한 고착 + 이후 생성이 `if(d.capLoading)return` 으로 영구 차단되던 것. 자가 복구.
	    // [2026-07-22 보스] 45초 → 130초. 캡션 생성은 15~60초가 정상인데 45초 워치독이 먼저 터져서
	    //   아직 오고 있는 응답을 두고 "오래 걸려요"를 띄웠다. app-core 의 LLM 타임아웃(120초) 바로 뒤로 둔다.
	    (function (tok) {
	      setTimeout(function () {
	        if (tok === _genToken && d && d.capLoading) {
	          d.capLoading = false;
	          try { toast('생성이 오래 걸려요 — 잠시 뒤 다시 시도해 주세요'); } catch (_te) { void _te; }
	          if (cur === 'caption') setScreen('caption', { push: false });
	        }
	      }, 130000);
	    })(_myToken);
	    // [캡션재설계 v2] 3축 전부(직접 입력 텍스트 포함, 드롭 규칙 정제 후) → photo_context.
	    var photoCtx = _wizAxisContext() || _roleSummary();
	    var opts = Object.assign({ slotId: d.slot && d.slot.id, service: _pubSvc, photo_context: photoCtx, mode: d.captionMode || 'normal' }, extra || {});
    delete opts._regen;   // [v532] 내부 재생성 플래그 — 페이로드로 내보내지 않음
    // [v532] 사용자 입력을 캡션 최우선 context 로. '입력 키워드만 시술명으로, 과거 글은 말투만 참고'를 명시 —
    //   백엔드 fewshot(샵 과거글)이 엉뚱한 시술명(붙임머리·단발 등)으로 새는 것을 프론트에서 차단.
    if (svc) {
      // [#5 2026-07-17] 시술 다중선택 → '유일한 시술'은 이제 거짓. 고른 게 여러 개면 그렇게 말한다.
      //   (문구가 사실과 어긋나면 LLM 이 나머지를 버리거나 하나로 뭉갠다.) 여러 개일 때도
      //   '이 목록 밖은 만들지 마라'는 제약은 그대로 — fewshot 이 엉뚱한 시술명을 흘리는 걸 막는 핵심.
      var _svcN = _svcList().length;
      opts.photo_context = (_svcN > 1
        ? '시술/키워드(이 게시글의 시술 ' + _svcN + '가지 — 전부 반영): ' + _pubSvc
        : '시술/키워드(이 게시글의 유일한 시술): ' + _pubSvc) +
        '. 이 키워드만 시술명으로 쓰고, 입력에 없는 다른 시술/상품명은 절대 만들지 마세요. 과거 글은 말투만 참고' +
        (opts.photo_context ? ' · ' + opts.photo_context : '');
    }
    // [캡션재설계 v2] 특이사항 = 참고 맥락(재료) 블록 — 원문 복사 금지·verbatim 방지.
    // [버그3 2026-07-25] '시술 사실만' 화이트리스트가 너무 좁아 "일본에서 온 손님" 같은 방문 사연이
    //   통째로 걸러졌음(백엔드 프롬프트는 반영을 의도). 고객 방문 사연(긍정 맥락)을 반영 대상에 명시.
    var _spNote = String(d.specialNote || '').replace(/\s+/g, ' ').trim();
    if (_spNote) {
      opts.photo_context += ' · 특이사항 메모(참고 재료, 문장 그대로 복사 금지): "' + _spNote.slice(0, 120) +
        '" — 이 메모의 시술 사실(길이·색·기법·방문 차수)과 고객 방문 사연(멀리·해외에서 와주신 것 등 긍정 맥락)을 빠짐없이 자연스럽게 반영. 욕설·비속어·감정 표현·환불/불만 얘기는 캡션에 절대 넣지 말 것';
    }
    opts.customer_name = _cust.customer || (d.customerId ? d.customerName : '') || '';   // [#1] 이번 입력 고객 or 연결된 고객만(stale 이름 '방' 방지)
    if (opts.customer_name) opts.photo_context += ' · 고객명: ' + opts.customer_name + '(시술받는 고객 이름. 시술명·스타일명·브랜드명이 아님. 게시글엔 고객님으로 자연스럽게만 언급)';
    // [다중pair] 결과물 여러 장이면 '캐러셀 게시글' 기준 — 중립적 전후 변화로(특정 시술명 가정 금지).
    var _outs = d.templateOutputs || [];
    if (_outs.length >= 2) opts.photo_context += ' · 전후 결과물 ' + _outs.length + '장(인스타 캐러셀 한 편). 각 장은 같은 고객의 시술 전/후 변화 컷.';
    else if (_outs.length === 1 && d.tplPurpose === 'before_after') opts.photo_context += ' · 시술 전후 변화 1장.';
    // [v532] photo_context 백엔드 상한 500자 — 다중 pair 노트까지 붙은 뒤 초과 시 422(생성 실패) 방지로 클램프.
    if (opts.photo_context && opts.photo_context.length > 480) opts.photo_context = opts.photo_context.slice(0, 480);
    // [캡션재설계 v2] extra_notes — 시술명 = 정제된 칩 값(_pubSvc)만 + 특이사항 재료 규칙 + 재생성 변형 지시. 300자 내 보장.
    opts.extra_notes = _buildExtraNotes(_pubSvc, d.regenSeq, !!_spNote);
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
      var _apply = function () {
      _genPending = Math.max(0, _genPending - 1);
      // [카오스 P2] 내 응답이거나 더 대기 중인 생성이 없을 때만 스피너 해제 — stale 응답이 아직
      //   진행 중인 fresh 생성(45초 자가복구 후 재생성 등)의 스피너를 조기 해제하던 깜빡임 방지.
      //   (대기 중 fresh 가 있으면 그게 도착할 때 해제하므로 스투키 스피너 회귀도 없음.)
      if (_myToken === _genToken || _genPending === 0) d.capLoading = false;
      // [버그수정] 그 사이 뒤로가기/재생성이 있었던 낡은 응답이면 d.caption/오버레이는 안 건드리지만,
      //   화면 갱신(setScreen)은 그대로 해서 로딩 스피너가 안 풀리고 멈춰버리는 회귀를 방지한다.
      // [v779] 단, 이미 캡션 화면을 떠났으면 캡션으로 낚아채지 않는다.
      if (_myToken !== _genToken) { if (cur === 'caption') setScreen('caption'); return; }
      if (r.ok) {
        var fresh = (r.hashtags || []).map(function (h) { return _fixTypos(h); })   // [v570·3] 태그 오타 백스톱
          .filter(function (h) { return !/(만원|천원|원짜리|짜리|가격|얼마|남친|여친|남자친구|여자친구)/.test(String(h)); });   // [#2] 가격·사담 파생 가비지 해시태그(#만원짜리 등) 제거
        // [#7] 시술 내용에 지역(OO동/OO구/OO역)이 있으면 지역 해시태그를 앞에 보강(백엔드 누락 백스톱).
        _locationTags(_pubSvc).forEach(function (t) { if (fresh.indexOf(t) < 0) fresh.unshift(t); });
        // [2026-07-26 원영] 원장님이 ×로 지운 태그는 새 생성분에서도 제외 — 지워도 자꾸 살아나던 것.
        var _rm = d._hashRemoved || [];
        if (_rm.length) fresh = fresh.filter(function (h) { return _rm.indexOf(h) < 0; });
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
          // [2026-07-26 원영] 재생성(문장만 다시 등)은 원장님이 손본 태그 목록을 덮어쓰지 않는다 — "지우거나 수정하면 그걸로".
          if (d._hashEdited && opts.caption_intent !== 'generate') { /* 태그 유지, 캡션만 갱신 */ }
          else { d.hashtags = fresh; d.selectedHashes = fresh.slice(); }   // [v566·scope7] 렌더 직전 상투/마크다운 제거
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
      };
      // [2026-07-26 원영] 기다리지 않는다("응답 빨리 오면 빨리 오는 대로 끝내야지") — 응답 도착 시
      //   게이지를 0.35초 만에 100%로 마저 채우고 바로 결과. 인위적 대기(4.8s) 없음.
      var _fin = 0;
      try {
        var _fEl = document.querySelector('.wcl-fill'), _rEl = document.querySelector('.wcl-run');
        if (_fEl) {
          _fEl.style.width = getComputedStyle(_fEl).width;   // 현재 진행폭 고정
          _fEl.style.setProperty('animation', 'none', 'important');   // keyframes(!important) 해제
          void _fEl.offsetWidth;
          _fEl.style.transition = 'width .35s ease'; _fEl.style.width = '100%';
          if (_rEl) {
            _rEl.style.left = getComputedStyle(_rEl).left;
            _rEl.style.setProperty('animation', 'none', 'important');
            void _rEl.offsetWidth;
            _rEl.style.transition = 'left .35s ease'; _rEl.style.left = 'calc(100% - 34px)';
          }
          _fin = 400;
        }
      } catch (_fe) { void _fe; }
      setTimeout(_apply, _fin);
    }).catch(function (e) {
      // [audit] 생성 실패(네트워크/예외) 시 로딩에 갇히지 않게 복구 — 예전엔 catch 없어 capLoading 이 true 로 남아 이후 생성이 영구 차단됐음.
      _genPending = Math.max(0, _genPending - 1);
      if (_myToken === _genToken || _genPending === 0) d.capLoading = false;   // [카오스 P2] .then 과 동일 게이트
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
      // [v778 복구] 캡션 결과의 '사진 편집' 버튼 핸들러 되살림 — 입력 반영 후 스토리 편집기 진입.
      if (a === 'storyedit') { flushCaptionInputs(); return _openStoryEditor(); }
      // [2026-07-28 원영 2번·A안] 업로드 화면에서 '사진 없이 글만 쓰기' — textOnly 모드로 캡션 직행.
      //   기존 textOnly 진입(open({textOnly:true}))과 같은 상태, 단 navStack push 로 back=업로드 복귀.
      if (a === 'textonly') { d.textOnly = true; return setScreen('caption'); }
      if (a === 'tagsopen') { d._tagsOpen = true; return setScreen(cur, { push: false }); }   // [v776] 계정 태그 펼치기
      // [2026-07-26 원영] 계정 태그 접기 — 값이 있으면 자동 펼침 조건(_tagVal) 때문에 값도 같이 비워야 닫힌다.
      if (a === 'tagsclose') { d._tagsOpen = false; d.igUserTags = []; return setScreen(cur, { push: false }); }
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
      // [v779] 예약 발행 — '지금 말고 예약'을 펼치고, 시간 골라 예약.
      if (a === 'schedopen') { d._schedOpen = true; return setScreen('caption', { push: false }); }
      // [2026-07-26 원영] 예약 패널 닫기 — 열기만 있고 닫기가 없어 되돌릴 수 없었다.
      if (a === 'schedclose') { d._schedOpen = false; return setScreen('caption', { push: false }); }
      if (a === 'schedule') { return _doSchedule(); }
      // [cleanup] publishstory/storypick/storypickcancel 제거 — 진입 버튼 없어 도달 불가였던 스토리 발행 세트. 발행은 피드/여러 장(carousel)만.
      if (a === 'publishcarousel') { return publish('carousel'); }
      if (a === 'copycap') { flushCaptionInputs(); window.WorkspaceAdapter && window.WorkspaceAdapter.copyText((d.caption || '') + (d.hashtags.length ? '\n\n' + d.hashtags.join(' ') : '')); _markPrepared(); return; }   // [#6] copyText 가 이미 토스트 → 중복 토스트 제거(두 개 쌓여 ~5초 떠있던 문제)
      // [v547] 저장 후 게시 확인 sheet
      // [출시감사 2026-08-01 P0] 예전엔 saveImage 결과를 **안 기다리고** 곧바로
      //   _markPrepared()+_askPublishedSheet() 를 불렀다. 저장이 실패해도(네이티브에서
      //   `<a download>` 는 data URL 을 저장 못 한다) "게시했나요?" 가 떠서 원장님은
      //   저장된 줄 알고 넘어갔고, 준비완료 통계까지 오염됐다.
      //   이제 성공했을 때만 다음 단계로 넘긴다. 사용자가 공유 시트를 닫은 경우(aborted)도
      //   실패로 보고 그냥 머문다 — 다시 누르면 된다.
      if (a === 'saveimg') {
        if (!window.WorkspaceAdapter) return;
        Promise.resolve(window.WorkspaceAdapter.saveImage(outputUrl(), d.service || 'itdasy'))
          .then(function (r) {
            if (r && r.ok) { _markPrepared(); _askPublishedSheet(); }
          })
          .catch(function () { /* saveImage 가 토스트로 이미 알린다 */ });
        return;
      }
      if (a === 'pubnot') { return _closePublishSheet(); }
      if (a === 'pubdone') { return _markPublishedNow(); }
      if (a === 'igconnect') { window.WorkspaceAdapter && window.WorkspaceAdapter.connectInstagram(); return; }

      if (t.closest('[data-fl-pick]')) { el.querySelector('[data-fl-file]').click(); return; }
      var del = t.closest('[data-fl-del]'); if (del) { e.stopPropagation(); d.photos.splice(+del.getAttribute('data-fl-del'), 1); reassignRoles(); setScreen('upload'); return; }
      var roleBtn = t.closest('[data-fl-setrole]'); if (roleBtn) { e.stopPropagation(); var _pr = roleBtn.getAttribute('data-fl-setrole').split(':'); _setRole(+_pr[0], _pr[1]); if (cur === 'template') _rerenderTemplate(); else if (d.rolesOpen) _setEditSection('[data-ed-adv]', _advFoldHtml()); return; }
      // [#18] 게시 크기 세그먼트 — 저장 후 세그 on 상태만 토글(전체 재렌더 없이).
      var fmtBtn = t.closest('[data-fl-format]'); if (fmtBtn) {
        e.stopPropagation();
        _setWsFormat(fmtBtn.getAttribute('data-fl-format'));
        d.previewUrl = null;   // 규격 변경 → 캐시된 합성 미리보기 무효화(다음 단계에서 새 비율로 재합성)
        var _fseg = fmtBtn.parentNode.querySelectorAll('[data-fl-format]');
        for (var _fi = 0; _fi < _fseg.length; _fi++) { _fseg[_fi].classList.toggle('on', _fseg[_fi] === fmtBtn); }
        return;
      }
      // [#2] 타일 탭 = 선택/해제 토글. 역할/삭제 버튼은 위에서 이미 처리됨.
      var upTile = t.closest('[data-fl-tile]'); if (upTile && cur === 'upload') { e.stopPropagation(); _toggleSelect(+upTile.getAttribute('data-fl-tile')); return; }
      if (t.closest('[data-fl-edphoto]')) { return; }
      // [perf] 버튼 탭은 해당 섹션만 갱신 — 전체 편집화면(템플릿 6칸 대용량 dataURL) 재생성 안 함.
      // [v554] 'adv'(정밀 조정) 토글 분기 제거 — 항상 펼침이라 접기 동작 없음. bg/tpl 토글은 유지.
      var fold = t.closest('[data-fl-fold]'); if (fold) { var fk = fold.getAttribute('data-fl-fold'); if (fk === 'bg') { d.bgOpen = !d.bgOpen; _setEditSection('[data-ed-basic]', _mainAdjustHtml()); } else if (fk === 'tpl') { d.tplOpen = !d.tplOpen; _renderTplSection(); } return; }
      var edsel = t.closest('[data-fl-editsel]'); if (edsel) { return switchEditPhoto(+edsel.getAttribute('data-fl-editsel')); }
      var edswipe = t.closest('[data-fl-edswipe]'); if (edswipe) { return _stepEditPhoto(edswipe.getAttribute('data-fl-edswipe') === 'next' ? 1 : -1); }   // [v550] PC 화살표
	      var basictool = t.closest('[data-fl-basictool]'); if (basictool) { d.basicTool = basictool.getAttribute('data-fl-basictool'); _setEditSection('[data-ed-basic]', _mainAdjustHtml()); return; }
	      var edtab = t.closest('[data-fl-edtab]'); if (edtab) { d.editTab = edtab.getAttribute('data-fl-edtab'); _setEditSection('[data-ed-adv]', _advFoldHtml()); _renderVpTools(); if (d.maskView || d.maskPaint) _renderMaskOverlay(); return; }
	      var beautytool = t.closest('[data-fl-beautytool]'); if (beautytool) { d.precTool = beautytool.getAttribute('data-fl-beautytool'); _setEditSection('[data-ed-adv]', _advFoldHtml()); return; }
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
      var csi = t.closest('[data-fl-cshopinfo]'); if (csi) { try { localStorage.setItem('itdasy:caption_shopinfo', _shopInfoOn() ? '0' : '1'); } catch (_e) { void _e; } toast(_shopInfoOn() ? '샵정보를 글 끝에 넣을게요' : '샵정보 반영을 껐어요'); setScreen('caption'); return; }   // [#19] 샵정보 opt-in 토글
      // [캡션재설계 v2] 3질문 한 화면 — 칩 탭 = 그 축 저장/재탭 해제(스텝 넘김 없음). 특이사항 입력은 유지(syncServiceFromDom).
      var wp = t.closest('[data-fl-wizpick]'); if (wp) {
        syncServiceFromDom();
        var _pv = wp.getAttribute('data-fl-wizpick').split('::'); var _wk = _pv[0], _wv = _pv[1];
        d.captionAxes = d.captionAxes || {};
        // [아코디언] 답 고르면 접힘 + 다음 질문 자동 열림(_wizJust = 접힘·체크 팝 1회 애니메이션 트리거)
        if (d.captionAxes[_wk] === _wv) { delete d.captionAxes[_wk]; }
        else { d.captionAxes[_wk] = _wv; d._wizJust = _wk; }
        d._wizOpen = null;
        if (d._wizCustom === _wk) d._wizCustom = null;   // 직접 입력창 열려 있었으면 닫기
        setScreen('caption');
        return;
      }
      // [아코디언] 접힌 질문 줄 탭 = 그 질문 다시 펼치기
      var wro = t.closest('[data-fl-wizreopen]'); if (wro) { syncServiceFromDom(); d._wizOpen = wro.getAttribute('data-fl-wizreopen'); setScreen('caption'); return; }
      // [직접] 점선 칩 토글 — 닫혀 있으면 그 자리 입력창, 열려 있거나 직접 값이 있으면 닫기+값 해제.
      var wcu = t.closest('[data-fl-wizcustom]'); if (wcu) {
        syncServiceFromDom();
        var _ck = wcu.getAttribute('data-fl-wizcustom');
        if (d._wizCustom === _ck || _wizIsCustom(_ck)) {
          if (d.captionAxes && _wizIsCustom(_ck)) delete d.captionAxes[_ck];
          d._wizCustom = null;
        } else {
          d._wizCustom = _ck;
        }
        setScreen('caption');
        return;
      }
      // [직접 입력] 인라인 확인 → 값 저장 + 입력창 닫기. 빈값이면 무시.
      var wco = t.closest('[data-fl-wizcustok]'); if (wco) { _wizCustomConfirm(); return; }
      var svtt = t.closest('[data-fl-svctypetoggle]'); if (svtt) { syncServiceFromDom(); d.svcTypeOpen = !d.svcTypeOpen; setScreen('caption'); return; }
      var svty = t.closest('[data-fl-svctype]'); if (svty) { syncServiceFromDom(); try { localStorage.setItem('shop_type', svty.getAttribute('data-fl-svctype')); } catch (_es) { void _es; } d.svcTypeOpen = false; setScreen('caption'); return; }
      // [시술칩 관리모드] '관리'/'완료' 토글 — × 삭제·드래그 정렬·추가 노출 전환(선택 로직·d.service 는 불변).
      var smng = t.closest('[data-fl-svcmanage]'); if (smng) { syncServiceFromDom(); d.svcManageOpen = !d.svcManageOpen; d.svcAddOpen = false; setScreen('caption', { push: false }); return; }
      // [칩삭제] × 가 칩(button) 안에 있어서 svctag 보다 먼저 잡아야 한다.
      var sdel = t.closest('[data-fl-svcdel]'); if (sdel) {
        syncServiceFromDom(); var _dk = sdel.getAttribute('data-fl-svcdel');
        try { if (typeof deleteCaptionKeyword === 'function') deleteCaptionKeyword(_dk, e); } catch (_ed) { void _ed; }
        _svcSet(_svcList().filter(function (s) { return s !== _dk; }));   // [#5] 다중선택 — 지운 칩만 해제
        setScreen('caption'); return;
      }
      var rdel = t.closest('[data-fl-recentdel]'); if (rdel) { syncServiceFromDom(); _deleteRecentService(rdel.getAttribute('data-fl-recentdel')); return; }
      // [소스확장] 최근 시술 소스 토글(캡션/예약) — 관리 모드에서 어느 소스를 반영할지.
      var rsrc = t.closest('[data-fl-recentsrc]'); if (rsrc) { syncServiceFromDom(); var _k = rsrc.getAttribute('data-fl-recentsrc'); var _p = _recentSrcPref(); _p[_k] = !_p[_k]; _saveRecentSrcPref(_p); setScreen('caption', { push: false }); return; }
      // [캡션재설계 v2] 시술 칩·최근 시술 = 같은 단일선택 토글(data-fl-svctag 하나로 통합).
      var svtag = t.closest('[data-fl-svctag]'); if (svtag) {
        var _stag = svtag.getAttribute('data-fl-svctag');
        // [2026-07-24] 관리 모드 + 우리샵 시술칩(data-fl-svcsort)은 칩 몸통 탭 = 삭제.
        //   예전엔 이때도 _pickServiceTag(캡션 선택)로 빠져서, 작은 × 를 못 누르면 삭제도 안 되고
        //   엉뚱하게 '캡션에 쓸 칩'으로 선택됐다(원장 지적). 관리모드 이 칩의 힌트는 '×로 삭제'라
        //   탭 선택 의도가 없다. 드래그 정렬은 _bindSvcSort 가 6px↑ 이동일 때 click 을 억제하므로
        //   진짜 탭만 삭제된다. 최근시술 칩(data-fl-recentdel, '탭해서 선택' 의도)은 그대로 선택.
        if (d.svcManageOpen && svtag.hasAttribute('data-fl-svcsort')) {
          syncServiceFromDom();
          try { if (typeof deleteCaptionKeyword === 'function') deleteCaptionKeyword(_stag, e); } catch (_ed2) { void _ed2; }
          _svcSet(_svcList().filter(function (s) { return s !== _stag; }));   // 지운 칩만 선택 해제
          setScreen('caption'); return;
        }
        _pickServiceTag(_stag); return;
      }
      var svtadd = t.closest('[data-fl-svctagadd]'); if (svtadd) { _addSvcKeyword(); return; }
      // [2026-07-26 원영] 해시태그 칩 — × 개별 삭제 / '+ 추가' = 인라인 입력 열기(확정은 _commitHashAdd).
      var hdel = t.closest('[data-fl-hashdel]'); if (hdel) {
        var _hk = hdel.getAttribute('data-fl-hashdel');
        _hashSet(_hashList().filter(function (h) { return h !== _hk; }));
        setScreen('caption', { push: false }); return;
      }
      if (a === 'hashaddopen') { d._hashAddOpen = true; return setScreen('caption', { push: false }); }
      var cg = t.closest('[data-fl-cgen]'); if (cg) { return _triggerCaptionGenerate(null); }
      // [아코디언] 잠긴 생성 버튼 탭 = 안내 + 첫 미답변 질문 펼치기
      var cgl = t.closest('[data-fl-cgenlock]'); if (cgl) { syncServiceFromDom(); d._wizOpen = null; toast('질문에 먼저 답해주세요'); setScreen('caption'); return; }
      // [C4] 재생성 버튼: data-fl-var="regen|short|long"
      var vv = t.closest('[data-fl-var]'); if (vv) {
        var vk = vv.getAttribute('data-fl-var');
	        if (vk === 'short') { return doGenerate({ length_tier: 'short', caption_intent: 'rewrite', _regen: true }, '짧게 다시 생성했어요'); }
	        if (vk === 'long')  { var _nl = (d.capLen === 'long' || d.capLen === 'max') ? 'max' : 'long'; return doGenerate({ length_tier: _nl, caption_intent: 'longer', _regen: true }, _nl === 'max' ? '아주 길게 다시 생성했어요' : '길게 다시 생성했어요'); }
	        /* [2026-07-26 원영] 'reset'(재료부터 다시 고르기) 제거 — 버튼 삭제(뒤로가기가 대체). 잇비 명령 쪽 reset(cmd.variant)은 별도 유지. */
	        /* [v532] 'hashtags'(더 가져오기) 케이스 제거 — 추천 칩/더가져오기 UI 삭제로 더 이상 트리거 없음. */
	        // [v532] '인스타 톤' = 백엔드 tone_override enum 의 'ornate'(풍부·SNS 감성)로 매핑. 기존 'instagram' 은 enum(plain/normal/ornate)에 없어 422 → '캡션 생성 실패' 의 직접 원인.
		        if (vk === 'insta') { return doGenerate({ tone_override: 'ornate', caption_intent: 'instagram', _regen: true }, '인스타 톤으로 다시 생성했어요'); }
	        return doGenerate({ caption_intent: 'rewrite', _regen: true }, '문장만 새로 썼어요');
	      }
    });
    el.querySelector('[data-fl-file]').addEventListener('change', function (e) {
      var files = Array.from(e.target.files || []); e.target.value = '';
      if (!files.length) return;
	      addFiles(files, true);
	    });
    el.querySelector('[data-fl-bgfile]').addEventListener('change', function (e) {
      var f = (e.target.files || [])[0]; e.target.value = '';
      if (!f) return;
      // [보안감사 M-10 2026-07-26] 본문 사진과 동일하게 HEIC 변환 + 리사이즈 경유.
      //   예전엔 원본 File 을 그대로 readAsDataURL 해서 아이폰 HEIC 배경이 깨지고, 초대형 원본이
      //   수 MB dataURL 로 상태·슬롯에 저장됐다.
      var _rs = (typeof window._resizeIfNeeded === 'function') ? window._resizeIfNeeded(f, 1920) : Promise.resolve(f);
      Promise.resolve(_rs).catch(function () { return f; }).then(function (small) {
        if (!small) { toast('배경 이미지를 불러오지 못했어요'); return; }
        var r = new FileReader();
        r.onload = function () { d.customBg = r.result; d.customBgName = f.name || '내 배경'; applyBg('image'); };
        r.onerror = function () { toast('배경 이미지를 불러오지 못했어요'); };
        r.readAsDataURL(small);
      });
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
      if (e.target.matches('[data-fl-specialnote]')) {   // [캡션재설계 v2] 특이사항 — 값 + 남은 글자수(120) 라이브 갱신
        d.specialNote = e.target.value;
        var _nc = el.querySelector('[data-fl-notecount]'); if (_nc) _nc.textContent = String(Math.max(0, 120 - e.target.value.length));
      }
      if (e.target.matches('[data-fl-custsearch]')) { d.custQuery = e.target.value; }
    });
    el.addEventListener('focusin', function (e) {
      // 보정·정밀 슬라이더 모두 한 스냅샷(adjust+beauty)으로 묶어 되돌리기/다시실행 일원화.
      if (e.target.matches('[data-fl-range],[data-fl-beautyrange]')) { if (!d._editPrev) d._editPrev = _snapEdit(); }
	    });
    el.addEventListener('change', function (e) {
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
    return '<div class="tpl-preview__card" style="background-image:url(' + esc(_blobDisp(_tplThumb(tpl))) + ')"></div>';
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
    _bindWheelHScroll();
  }
  // [v748] PC 마우스 휠 — 가로 스크롤 영역(레이아웃 미리보기·사진 캐러셀·칩 줄)이 옆으로 안 넘어가던 문제.
  //   스크롤바를 숨겨놔서(height:0) 마우스로는 넘길 방법이 없었음 → 세로 휠을 가로 스크롤로 변환.
  function _bindWheelHScroll() {
    if (!el || el._hsBound) return; el._hsBound = true;
    el.addEventListener('wheel', function (e) {
      if (cur === 'edit') return;   // 편집 화면 휠 = 확대/축소(_bindEditPC 담당)
      var sc = e.target && e.target.closest && e.target.closest('.wsc-frames, .wsc-strip, .ig-car__track, .tpl-results, .tpl-chips, .cap-storypick__row');
      if (!sc || sc.scrollWidth <= sc.clientWidth + 1) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;   // 트랙패드 가로 제스처는 브라우저 기본 동작 유지
      sc.scrollLeft += e.deltaY;
      e.preventDefault();
    }, { passive: false });
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
    window.WorkspaceAdapter.applyWorkspaceBgAction({ src: composeSrc, action: action, color: d.bgColor, bgImage: d.customBg, ratio: _cropRatio('original') })
      .then(function (r) {
        d.bgBusy = false;
        // [보안감사 M-11 2026-07-26] 누끼 처리 중 사용자가 레이아웃/캡션으로 이동했으면 화면을 뺏지 않는다.
        //   결과(editedDataUrl/fgCutout)는 그대로 보존하되 setScreen('edit') 강제복귀만 막는다.
        var _onEdit = (cur === 'edit');
        if (r && r.ok && r.dataUrl) {
          if (!photo.preBgUrl) photo.preBgUrl = composeSrc;   // 최초 1회 원본 보관(되돌리기용)
          photo.editedDataUrl = r.dataUrl;
          photo.fgCutout = r.removedBg || null;   // 투명 인물 — 이후 보정은 여기에만
          // [v539] ratio 저장 — 직후 슬라이더 재합성(_compositeBg)이 적용 때와 '동일 비율/배치'로 출력해야
          //   크기 점프가 안 생긴다. (editedDataUrl 은 ratioToSize(ratio) 크기, fgCutout 은 원본 크기라 불일치했음)
          photo.bgSpec = photo.fgCutout ? { action: action, color: d.bgColor, bgImage: d.customBg, origUrl: photo.preBgUrl, ratio: _cropRatio('original') } : null;
          d.previewUrl = null; d.bgFail = false; if (_onEdit) { toast('배경 적용 완료'); setScreen('edit'); _refreshPreview(); }
        }
        else { d.bgAction = prev; d.bgFail = true; d.bgFailMsg = (r && r.toast) || '배경 처리에 실패했어요'; if (_onEdit) { toast(d.bgFailMsg); setScreen('edit'); } }
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
	      return '<button type="button" class="tpls-slide' + (rl ? ' is-' + role : '') + '" data-fl-tplpick="' + esc(p.id) + '" style="background-image:url(' + esc(_blobDisp(photoUrl(p))) + ')" aria-label="' + esc(_editPhotoLabel(p, i)) + ' — 탭하면 전/후 지정">' +
	        (rl ? '<span class="tpls-slide__role">' + rl + (seqNo ? '<em>' + seqNo + '</em>' : '') + '</span>'
	            : '<span class="tpls-slide__tag">탭 → 전/후</span>') +
	      '</button>';
	    }).join('');
	    var chips = ['전체', '전후', '붙이기', '시술 자랑', '고객 후기', '이벤트', '공지', '정보', '스토리'];
	    var shown = WORKSPACE_TEMPLATES.filter(function (tpl) { return !d.tplCat || d.tplCat === '전체' || tpl.chip === d.tplCat; });
	    var grid = shown.map(function (tpl) {
	      var on = d.templateId === tpl.id;
	      return '<div class="tpl-itemwrap"><button type="button" class="tpl-item' + (on ? ' on' : '') + '" data-fl-tpl="' + esc(tpl.key) + '" aria-label="' + esc(tpl.label) + ' 템플릿' + (on ? ' (적용됨)' : '') + '" style="background-image:url(' + esc(_blobDisp(_tplThumb(tpl))) + ')"><i class="tpl-badge">' + esc(tpl.chip) + '</i>' + (on ? '<i class="tpl-onpill">적용됨</i>' : '') + '</button></div>';
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
	        var W = 1080, H = (_wsFormat() === '11' ? 1080 : 1350), gap = 4;   // [#18] 게시 크기 선택 반영(4:5/1:1) + 가는 흰 거터
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
	    // [버그수정 2026-07-06] 재오픈 초안(wsLayout 미복원)도 합성본 표시 — 합성본이 진실.
	    // [버그수정 2026-07-17] 단, 결과물이 2장 이상이면 여기서 끊지 않는다. composeCards 는 templateOutput 에
	    //   '첫 카드'를 늘 미러하므로(flow/layout.js:133) 이 줄이 T-116 다중 카드를 통째로 가렸다 →
	    //   캡션·결과 화면이 항상 1장만 보여줌(아래 캐러셀은 items.length<2 로 막혀 도달 불가였음).
	    if (d.templateOutput && (d.templateOutputs || []).length < 2) return [{ kind: 'output', id: 'wslayout', url: d.templateOutput, label: '', expandable: false }];

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
	        '<div class="cap-car__img" style="background-image:url(' + esc(_blobDisp(it.url)) + ')"></div></div>';
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
	    var _all = Array.from(files || []);
	    files = _all.slice(0, 10);
	    // [보안감사 M-16] 10장 초과분을 조용히 버리고 "N장 추가됨"만 뜨던 것 → 명시적으로 안내.
	    if (_all.length > 10) { try { toast('사진은 한 번에 10장까지만 추가돼요'); } catch (_e) { void _e; } }
	    if (!files.length) return Promise.resolve([]);
	    // [#6] 업로드 픽커가 느린 원인 = 폰 사진(3~8MB) 원본을 그대로 base64 로 읽어 담던 것.
	    //   2MB 초과분은 먼저 1920px JPEG 로 축소(_resizeIfNeeded) 후 읽어 import·썸네일·편집기 로딩을 크게 단축.
	    var _resize = (typeof window._resizeIfNeeded === 'function') ? window._resizeIfNeeded : function (f) { return Promise.resolve(f); };
	    return Promise.all(files.map(function (f) { return Promise.resolve(_resize(f, 1920)).catch(function () { return f; }).then(fileToDataUrl); })).then(function (rawUrls) {
	      // [보안감사 H-3] 읽기 실패(null)한 파일은 걸러낸다. 예전엔 한 장 실패가 Promise.all 전체를 reject 시켜
	      //   같이 고른 정상 사진까지 조용히 버려지고 무피드백이었다. 이제 성공분만 넣고 실패 건수만 안내.
	      var urls = rawUrls.filter(function (u) { return !!u; });
	      var _failed = rawUrls.length - urls.length;
	      if (_failed > 0) { try { toast(_failed + '장은 열 수 없어 건너뛰었어요'); } catch (_e) { void _e; } }
	      if (!urls.length) { setScreen('upload'); return urls; }
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
      // [2026-07-28 원영 2번] 글만 쓰기로 갔다가 back 으로 돌아와 사진을 올리면 textOnly 해제 — 사진 플로우 복귀.
      //   업로드 화면에서 추가한 경우만(cur 체크). 홈 textOnly 직행 플로우(캡션 화면)는 건드리지 않는다.
      if (cur === 'upload') d.textOnly = false;
      if (!d.textOnly && editablePhotos().length) {
        setScreen('layout', { push: false });   // 사진 로드 후 '레이아웃 고르기'로
        /* [2026-07-22 보스] 잇비 채팅에서 이미 레이아웃을 골라 왔으면 그 구성을 적용하고
           **레이아웃 화면을 그냥 지나쳐** 게시글(캡션)로 간다 — 채팅에서 딸깍 = 바로 다음 단계.
           setScreen('caption') 로 건너뛰지 않고 onCta() 를 쓰는 이유: layout 의 onExit(_exitLayout)이
           합성본을 굽는다. 그걸 건너뛰면 콜라주를 골랐는데 원본이 그대로 올라가는 조용한 사고가 난다. */
        if (d._pickComp && _WSL && _WSL.applyComp) {
          var _pc = d._pickComp; d._pickComp = null;
          if (_WSL.applyComp(_pc)) { setScreen('layout', { push: false }); onCta(); }
        }
      }
      else if (toEdit && editablePhotos().length) { d.editIdx = 0; setScreen('edit', { push: false }); }  // [v588·#1] 업로드 직후 바로 캡션
	      else { setScreen('upload'); }
	      if (showToast) toast(urls.length + '장 추가됨');
	      return urls;
	    });
	  }
	  function syncCaptionFromDom() {
	    // [v584] 캡션은 카드 안 contenteditable(igcap)이 원본.
	    var ig = el.querySelector('[data-fl-igcap]');
	    if (ig && ig.isContentEditable) { d.caption = (ig.textContent || '').trim(); return; }
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
    // [2026-07-26 원영] 해시태그는 칩 UI(_hashSet)가 진실원 — 카드 안 contenteditable 파싱 삭제.
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
    if (d._ctaBusy) return;   // [v779 카오스QA] 비동기 전환(bake/compose) 중 연타 재진입 차단 — 이중 compose·레이아웃 경합·이중 저장 방지
    var fx = STEP_FX[cur];
    if (fx && fx.onExit) {
      var r = fx.onExit(c.to);
      if (r === false) return;                                       // 검증 실패/캡션 생성 등 — 전환 취소
      if (r && typeof r.then === 'function') {                       // bake/compose 등 비동기 — 완료 후 전환(성공·실패 모두 진행)
        d._ctaBusy = true;
        return r.then(function () { d._ctaBusy = false; _ctaGo(c.to); }).catch(function () { d._ctaBusy = false; _ctaGo(c.to); });
      }
    }
    _ctaGo(c.to);
  }
  // 실제 전환 — 특수 대상(__save=저장 완료, __edit=통합 편집기) 처리 후 setScreen.
  function _ctaGo(to) {
    if (to === '__save') return save();
    if (to === '__edit') return _openEditFirst();   // [통합 편집기] 업로드 다음 = ItdEditor
    // [2026-07-22 오케스트레이션] 레이아웃 다음(→캡션) 직전에 잇비 브리핑 편집기(텍스트·스티커 주입)를 먼저 연다.
    //   onDone 에서 d._editorNext='caption' 으로 캡션 진입 + 시술내용 자동생성.
    if (to === 'caption' && d._orch && !d._orchApplied) {
      d._orchApplied = true; d._editorNext = 'caption';
      _openStoryEditor();
      return;
    }
    setScreen(to);
  }

  function openCropFlow() {
    if (!(window.WorkspaceAdapter && window.WorkspaceAdapter.openCrop)) { toast('크롭 모듈을 불러오지 못했어요'); return; }
    var idx = d.photos.indexOf(curEditPhoto()); if (idx < 0) idx = 0;
    window.WorkspaceAdapter.openCrop({
      photos: d.photos, index: idx, ratio: _cropRatio(),
      onApply: function (photoId, dataUrl, meta) {
        var p = d.photos.filter(function (x) { return x.id === photoId; })[0];
        if (p) { p.editedDataUrl = dataUrl; p.cropMeta = meta; }
        d.previewUrl = null;
        if (cur === 'edit') { setScreen('edit'); _refreshPreview(); }
      },
    });
  }

  // [T-104 P4] pickCustomer → flow/connect.js

  // [키메라 수정 2026-07-15] 이어서 카드 제목 — 쉼표 없는 문장이 통째로 제목이 되던 것 차단.
  //   시술 여러 개면 '첫시술 외 N개', 하나면 그대로, 40자 초과 시 말줄임.
  function _svcTitle(svc) {
    var parts = String(svc || '').split(/[,·]+/).map(function (x) { return x.trim(); }).filter(Boolean);   // 쉼표·가운뎃점만 — 공백 분리하면 '속눈썹 연장'이 '속눈썹 외 1개'가 됨
    if (!parts.length) return '';
    // [원영 요청] 여러 시술은 'A + B'로 합쳐 보여준다(저장 d.service 는 연준 엔진 그대로 쉼표 조인 — 표시만 변환).
    var joined = parts.join(' + ');
    if (joined.length <= 40) return joined;
    var t = parts[0] + (parts.length > 1 ? ' 외 ' + (parts.length - 1) + '개' : '');   // 너무 길면 축약 폴백
    return t.length > 40 ? (t.slice(0, 39) + '…') : t;
  }
  function buildSlot() {
    var slot = d.slot || { id: uid(), order: 0, createdAt: Date.now() };
    var now = Date.now();
	    slot.label = d.customerName || slot.label || _svcTitle(d.service) || '새 콘텐츠';
	    // [#11] editState=재편집 이어가기 보존 · [2026-07-17] storyEdited=원장이 직접 꾸민 사진 표시.
	    //   storyEdited 가 메모리에만 있어서 초안을 다시 열면 '자동합성 금지' 표시가 사라졌다 → 직접 꾸민 사진 위에
	    //   시술명이 한 번 더 구워질 수 있었다(글씨 두 겹). 저장·복원 양쪽에 실어 세션 밖에서도 유지한다.
	    slot.photos = d.photos.map(function (p) { return { id: p.id, dataUrl: p.dataUrl, editedDataUrl: p.editedDataUrl || null, role: p.role, cropMeta: p.cropMeta || null, templateId: p.templateId || null, editState: p.editState || null, baseUrl: p.baseUrl || null, storyEdited: !!p.storyEdited, updatedAt: now }; });
	    // [이슈2] 전후 템플릿 합성 결과물은 사진 배열과 분리된 전용 필드로 저장(원본 슬롯 비오염).
	    // [다중pair] 페어별 결과물 배열 저장 + 단일 templateOutput 미러(구 코드/홈 썸네일 하위호환).
	    // [2026-07-17] _autoBase(자동합성 전 원판 dataURL)는 메모리 전용 — 저장하면 같은 이미지가 2벌이 되고
	    //   workspace-sync 의 100KB 컷에 걸려 templateOutputs 자체가 통째로 버려진다(sync 주석 213-215 참고).
	    slot.templateOutputs = (d.templateOutputs && d.templateOutputs.length)
	      ? d.templateOutputs.map(function (o) { var c = Object.assign({}, o); delete c._autoBase; return c; })
	      : [];
	    slot.templateOutput = d.templateOutput || (slot.templateOutputs[0] && slot.templateOutputs[0].outputUrl) || null;
	    slot.service = d.service || '';
	    slot.specialNote = d.specialNote || '';   // [캡션재설계 v2] 특이사항 — 이어서 복원용
	    slot.caption = d.caption || '';
    slot.hashtags = (d.selectedHashes && d.selectedHashes.length ? d.selectedHashes : d.hashtags).join(' ');
    slot.customer_id = d.customerId || null;
    slot.customer_name = d.customerName || '';
    slot.status = 'done';
    slot.workspaceContext = Object.assign({}, slot.workspaceContext, {
      type: TYPE_MAP[d.tplPurpose] || 'promo',
      expectedPhotos: d.tplPurpose === 'before_after' ? 2 : 1,
      defaultRatio: _cropRatio(),
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
    // [보관함 중복 2026-07-20] 작업실 v2 는 dedupeKey 가 없어 saveToGallery 가 매번 _uid() 로 새 gallery row 를
    //   만들었다. 발행 1회에 saveItem 이 2번(발행 직전+발행 후), 초안 저장까지 더하면 같은 콘텐츠가 3~4벌씩 쌓여
    //   고객 타임라인·보관함에 같은 사진이 여러 장 뜨고, base64 가 IndexedDB 에 중복 적재됐다.
    //   slot.id(=재편집·발행에 걸쳐 고정, 3807) 기반 안정 키를 주면 saveToGallery(T-107)·_dedupePhotoItems 가
    //   put-in-place 로 같은 row 를 갱신한다. 네임스페이스 'ws2:' 라 treatment-link/asst_tpl 키와 안 겹친다.
    slot.dedupeKey = slot.dedupeKey || ('ws2:' + slot.id);
    slot.source = slot.source || 'workspace_v2';
    d.slot = slot;   // [#13] 만든 슬롯을 고정 — 이후 저장(에디터 완료·발행 등)이 같은 id 를 갱신하게. 예전엔 매번 새 id 라 콘텐츠가 중복 저장됐음.
    return slot;
  }

  function save() {
    if (d._saving) return;   // [v779 카오스QA] 저장 연타 → 이중 저장·이중 close·이중 토스트 방지
    d._saving = true;
    var slot = buildSlot();
    var done = function () {
      toast(d.customerName ? (d.customerName + ' 고객 기록에 저장했어요.') : '작업실에 저장했어요.');
      try { if (window.WorkMemory) window.WorkMemory.captureAndNotify(slot, d); } catch (_wm) { void _wm; }   // [T-115] 원장 작업 기억
      close();
      if (window.WorkspaceV2 && window.WorkspaceV2.refresh) window.WorkspaceV2.refresh();
    };
    if (window.WorkspaceAdapter && window.WorkspaceAdapter.saveItem) {
      window.WorkspaceAdapter.saveItem(slot).then(function (r) { if (r.ok) done(); else { d._saving = false; toast('저장에 실패했어요'); } });
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
    // [P0-3] buildSlot 은 한 번만 — 예전엔 saveItem·captureAndNotify 가 각자 buildSlot() 해 큰 슬롯 객체를 두 번 재구성했다.
    var _pubSlot = buildSlot();
    if (window.WorkspaceAdapter && window.WorkspaceAdapter.saveItem) { try { window.WorkspaceAdapter.saveItem(_pubSlot); } catch (_e) { void _e; } }
    try { if (window.WorkMemory) window.WorkMemory.captureAndNotify(_pubSlot, d); } catch (_wm) { void _wm; }   // [T-115] 원장 작업 기억
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
	    // [v779 카오스QA] 사진 0장 발행 방지 — 예전엔 outputUrl() 이 빈 문자열을 올려 서버가 원인불명 거부했다.
	    if (!(editablePhotos() || []).length && !(d.templateOutputs || []).length && !d.templateOutput) {
	      toast('사진을 먼저 추가해 주세요'); return;
	    }
	    // [버그수정 2026-07-10] 레이아웃 합성본(여러 장→1장)이 있으면 캐러셀 요청도 단일 피드로 — 원본 여러 장 전송/실패 방지.
	    // [T-116] 단, 결과물이 2장 이상이면 그 합성본들을 캐러셀로 올리는 게 맞다 — 이때만 예외.
	    // [버그수정 2026-07-17] 가드 기준도 세션 별칭(d.wsLayout) → 저장되는 합성본으로. 재오픈 초안에서 이 가드가
	    //   통째로 안 걸려 원본 여러 장이 나가던 게 '발행 30초'의 정체였다(_publishKind 주석 참고).
	    if (kind === 'carousel' && (d.templateOutputs || []).length < 2 && d.templateOutput) kind = 'feed';
	    if (!window.WorkspaceAdapter) return;
	    var _igp = window.WorkspaceAdapter.instagram();
	    if (!_igp.connected) { toast('인스타 연결 후 올릴 수 있어요'); return; }
	    // [버그수정] connected=true 여도 토큰이 죽어있으면(만료·계정 비활성화 등) 그대로 진행 시 "올리는 중…"
	    //   애니메이션만 보여주고 조용히 실패하던 문제 — 시작 전에 명확한 안내로 막는다.
	    if (!_igp.tokenValid) { toast('인스타 연동이 끊겼어요 — 설정에서 다시 연결해 주세요'); return; }
	    // [slot-sync Phase B] 캐러셀은 각 장을 캔버스로 JPEG 인코딩 → 다른 기기(https) 이미지는 taint 로 막힘. 먼저 수화.
	    //   (피드/스토리 단일 발행은 fetch→blob 경로라 CORS(*)로 그냥 됨 — 게이트 불필요.)
	    if (kind === 'carousel' && _needsHydrate() && !d._hydrateTried) {
	      d._hydrateTried = true; d._preflight = true; toast('사진 불러오는 중…');
	      _hydrateD().then(function (ok) {
	        d._preflight = false;   // [카오스 P2] 사전단계 종료 — 재진입 락 해제
	        // [P2 무한루프 수정 2026-07-16] 예전엔 실패해도 publish 를 다시 불러서 → 재진입 → 영원히
	        //   "사진 불러오는 중…" 반복(네트워크 안 좋은 다기기 케이스). 실패 시엔 멈추고 안내만 —
	        //   재시도는 원장이 다시 누르면 된다(_hydrateTried=false 로 열어둠).
	        if (!ok) { d._hydrateTried = false; toast('사진을 불러오지 못했어요 — 잠시 뒤 다시 눌러 주세요'); return; }
	        publish(kind);
	      });
	      return;
	    }
	    if (d._publishing || d._preflight) return;   // [카오스 P2] 사전단계(hydrate/compose) 창 재탭 차단
	    /* [출시 QA 2026-08-07] **이미 올린 글은 다시 올리지 않는다.**
	       실측: 발행 성공 후 뒤로 가서 '인스타에 올리기' 를 다시 누르면 "인스타그램에 올렸어요" 가
	       또 뜨고 **인스타에 같은 사진·캡션이 2개** 올라갔다. 게다가 슬롯의 igMediaId 는 마지막
	       것으로 덮여서, 먼저 올라간 게시물은 앱이 추적조차 못 하는 고아가 된다
	       (published 18→19 인데 인스타엔 2개). 원장님 피드에 중복이 남고 앱은 모른다.
	       재발행이 필요한 경우(올렸는데 인스타에서 지웠다 등)가 있으므로 막지 말고 **확인을 받는다.** */
	    /* 이미 올린 글인지 판정 — **세 곳을 본다.**
	         ① d._publishedAt        이 세션에서 방금 올림
	         ② d.slot.publish        슬롯 객체에 실려 있으면
	         ③ 로컬 슬롯 저장소       새로고침·다른 탭·다른 브라우저에서도 남는 유일한 근거
	       ③ 이 핵심이다. ①만 봤을 땐 새로고침 한 번이면 확인창이 사라져 또 중복 게시된다.
	       로컬 슬롯의 publish 는 workspace-sync 의 pull 이 서버 값을 그대로 넣어준다
	       (workspace-sync.js:241 `publish: rs.publish || null`) — 즉 서버가 진실의 원천이고
	       다른 기기/브라우저에서도 같은 값이 내려온다. */
	    /* ⚠️ 재진입 표식(`_pubGuardDone`)이 **반드시** 있어야 한다.
	       앞 버전은 검사 후 `publish()` 를 다시 불렀는데, 재진입하면 이 조건이 또 참이라
	       **무한 재귀**가 됐다 — 발행이 통째로 죽어서 "인스타 올리기 버튼이 안 먹는다" 가 됐다.
	       (미발행 슬롯도 예외 없이 걸려서 정상 발행까지 막혔다.) */
	    if (!d._pubGuardDone) {
	      var _slotId = (d.slot && d.slot.id) || null;
	      var _local = Promise.resolve(null);
	      if (!d._publishedAt && _slotId && typeof window.loadSlotsFromDB === 'function') {
	        /* [T7 실측 2026-08-17] IDB 가 잠겨 있으면(다른 탭이 계정 전환 purge 를 걸어 delete 가
	           blocked 되는 멀티탭 케이스 — 실발행 E2E 에서 실제로 발생) 이 조회가 영원히 안 끝나
	           발행 버튼이 '올리는 중…' 채로 영구 먹통이 됐다. 3초 안에 못 읽으면 로컬 근거 없이 진행 —
	           ①세션(_publishedAt) ②슬롯(d.slot.publish) 근거는 그대로 살아 있고 서버 idempotency 가 최후 방어선. */
	        _local = Promise.race([
	          Promise.resolve(window.loadSlotsFromDB()).then(function (all) {
	            var hit = (all || []).filter(function (x) { return x && String(x.id) === String(_slotId); })[0];
	            return hit && hit.publish ? hit.publish : null;
	          }),
	          new Promise(function (res) { setTimeout(function () { res(null); }, 3000); })
	        ]).catch(function () { return null; });
	      }
	      var _kind = kind;
	      _local.then(function (_remote) {
	        var _st = (d.slot && d.slot.publish) || _remote || {};
	        var _whenMs = d._publishedAt || _st.publishedAt;
	        var _already = _st.status === 'published' || !!d._publishedAt;
	        d._pubGuardDone = true;              // 이 시도에 대한 검사 끝 — 재진입은 곧장 통과
	        if (!_already) { publish(_kind); return; }
	        var _when = _whenMs ? new Date(_whenMs) : null;
	        var _label = _when ? (_when.getMonth() + 1) + '월 ' + _when.getDate() + '일 ' +
	          String(_when.getHours()).padStart(2, '0') + ':' + String(_when.getMinutes()).padStart(2, '0') : '이미';
	        var _ask = window.nativeConfirm
	          ? window.nativeConfirm('이미 올린 글이에요',
	              _label + '에 인스타에 올라간 글이에요.\n다시 올리면 같은 글이 하나 더 올라가요.\n그래도 올릴까요?', '다시 올리기', '취소')
	          : Promise.resolve(window.confirm(_label + '에 이미 올린 글이에요. 다시 올리면 하나 더 올라가요. 계속할까요?'));
	        Promise.resolve(_ask).then(function (yes) {
	          if (!yes) { d._pubGuardDone = false; toast('이미 올린 글이라 그대로 뒀어요'); return; }
	          publish(_kind);
	        });
	      });
	      return;
	    }
	    d._pubGuardDone = false;   // 실제 발행으로 넘어간다 — 다음 시도에선 다시 검사
	    // [v779 보스] 콜라주(한장으로 합치기)를 골랐는데 합성본이 없으면 outputUrl() 이 '첫 원본 사진'으로
	    //   조용히 폴백해, 3장 합쳐 올렸는데 첫 장만 올라갔다(편집 미리보기는 CSS라 콜라주로 보여 눈치 못 챔).
	    //   발행 전에 다시 굽고, 그래도 없으면 발행을 멈추고 레이아웃으로 돌려보낸다(잘못된 사진 발행 방지).
	    if (d.wsComp && d.wsComp !== 'flat' && (editablePhotos() || []).length >= 2 &&
	        !(d.templateOutput || (d.templateOutputs && d.templateOutputs[0] && d.templateOutputs[0].outputUrl))) {
	      if (_WSL && _WSL.composeCards) {
	        d._preflight = true;   // [카오스 P2] compose 중 재탭 차단
	        Promise.resolve(_WSL.composeCards()).catch(function () { return null; }).then(function () {
	          if (d) d._preflight = false;
	          if (!d || d._dead) return;
	          if (d.templateOutput || (d.templateOutputs && d.templateOutputs[0] && d.templateOutputs[0].outputUrl)) publish(kind);
	          else { toast('레이아웃을 못 만들었어요 — 레이아웃을 다시 골라 주세요'); setScreen('layout'); }
	        });
	        return;
	      }
	      toast('레이아웃을 못 만들었어요 — 레이아웃을 다시 골라 주세요'); return;
	    }
	    syncCaptionFromDom();
	    d._publishing = kind || 'feed'; setScreen('caption');
    var slot = buildSlot();
    /* [P1#1 세션 가드 2026-07-16] 이 발행이 '어느 세션 것인지' 붙잡아 둔다.
       d(플로우 상태)는 모듈 전역이고 open() 이 통째로 재할당한다. 그래서 발행이 도는 동안
       원장이 닫고 다른 글을 열면, 옛 발행의 콜백이 resolve 시점의 d(=새 글)에 써버렸다:
         · 새 글이 published 로 저장되고(saveItem) · 새 글에 igMediaId 가 박히고 · 화면이 강제로 넘어감.
       실측 재현: A 발행 중 close→B open → "SLOT-B:published" 로 저장됨(A 는 draft 그대로).
       카운터 대신 객체 아이덴티티로 본다 — 세션이 바뀌면 d !== myD, 닫히기만 했으면 _dead. */
    var myD = d;
    function _stale() { return !myD || myD._dead || myD !== d; }
    /* [P2-H1 2026-07-17] 발행 idempotency 키 — '누를 때' 한 번 만들고 재시도해도 같은 키를 보낸다.
       타임아웃(120s)으로 끊겼는데 서버는 이미 올린 상태에서 원장이 다시 누르면 공개 게시물이 2개
       생기던 걸 막는다. 성공 시에만 폐기 → 나중에 같은 사진을 진짜로 또 올리면 새 키라 안 막힌다.
       실패(진짜 에러)면 서버가 마커를 즉시 만료시키므로 같은 키로 재시도해도 정상 진행된다. */
    if (!d._idemKey) {
      d._idemKey = 'p_' + (slot.id || 's') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    }
    var myIdem = d._idemKey;
    _pubShow();
    Promise.resolve(window.WorkspaceAdapter.saveItem ? window.WorkspaceAdapter.saveItem(slot) : { ok: true }).then(function (sr) {
	      if (_stale()) return;   // 세션이 바뀜/닫힘 — 새 세션 건드리지 않는다(UI 정리는 close 가 함)
	      if (!sr || !sr.ok) { d._publishing = false; _pubHide(); toast('저장에 실패해 게시를 중단했어요'); setScreen('caption'); return; }
      d.slot = slot;
      if (!window.WorkspaceAdapter.publishInstagramV2) {
	        d._publishing = false; _pubHide(); _markPrepared(); setScreen('caption'); toast('게시 준비 완료 — 업로드 기능을 불러오지 못했어요'); return;
      }
      // [v779 카오스QA] 인스타 해시태그 상한 30개 — 초과하면 서버가 캡션을 거부/절단한다. 앞 30개만.
      var _hs = (d.hashtags || []).slice(0, 30);
      var cap = (d.caption || '') + (_hs.length ? '\n\n' + _hs.join(' ') : '');
      // [캐러셀] 여러 장이면 각 사진의 표시 이미지(편집 반영본)를 모아 보냄.
      // [T-116] 카드로 만든 결과물이 2장 이상이면 '원본 사진'이 아니라 '합성본'을 보내야 한다.
      //   (안 그러면 레이아웃을 다 만들어 놓고 원본 5장이 조용히 올라간다)
      var _outs = (d.templateOutputs || []).map(function (o) { return o && o.outputUrl; }).filter(Boolean);
      var _imgs = (kind === 'carousel')
        ? (_outs.length >= 2 ? _outs : (editablePhotos() || []).map(function (p) { return dispUrl(p); }).filter(Boolean))
        : null;
      // [audit#6] 발행 직전 태그칸 flush — input 이벤트 못 받은 값(IME/붙여넣기 직후 즉시 발행)도 반영.
      try { var _utEl = el && el.querySelector('[data-fl-usertags]'); if (_utEl) d.igUserTags = String(_utEl.value || '').split(/[,\s]+/).map(function (s) { return s.replace(/^@/, '').trim(); }).filter(Boolean).slice(0, 20); } catch (_ue) { void _ue; }
      // [계정 태그] 피드에서만 — 입력한 @아이디를 자동 위치(세로로 분산)로 태그.
      var _tagArr = d.igUserTags || [];
      // [계정 태그 2026-07-14] 캐러셀(여러 장)도 태그 전송 — 기존 조건이 kind==='feed' 라 5장 발행 시
      //   태그가 '실패'가 아니라 '처음부터 안 나감'이었다(에러도 안 뜸). 백엔드가 커버(첫 장) child 에 적용.
      var _utags = _tagArr.length ? _tagArr.map(function (u, i) { return { username: u, x: 0.5, y: Math.min(0.85, 0.32 + i * (0.46 / Math.max(1, _tagArr.length))) }; }) : null;
      var _pubImg = outputUrl();   // 대표 이미지(레이아웃 합성본 또는 대표 사진)
      window.WorkspaceAdapter.publishInstagramV2({ slotId: slot.id, imageUrl: _pubImg, imageUrls: _imgs, caption: cap, userTags: _utags, kind: kind || 'feed', idempotencyKey: myIdem }).then(function (r) {
        r = r || {};
        // [P1#1] 인스타 응답이 늦게 와도 그 사이 바뀐 세션엔 절대 쓰지 않는다.
        //   여기가 실제 피해 지점이었다 — 엉뚱한 글이 published 로 저장되고 igMediaId 까지 박혔다.
        /* [버그수정 2026-07-17] 세션이 바뀌었어도 '발행됐다'는 사실은 원래 슬롯에 남긴다.
           P1#1 가드가 새 세션 오염을 막으려고 콜백을 통째로 버렸는데, 그 바람에 업로드 중(수 초) 원장이
           닫기/뒤로가기만 눌러도 인스타엔 실제로 올라간 글이 로컬에선 영원히 draft 로 남았다
           ("발행했는데 발행됨으로 안 바뀜"). 화면(setScreen/toast)과 전역 d 는 그대로 안 건드리고,
           이 발행이 시작될 때 붙잡아 둔 myD/slot 에만 써서 저장한다 → 새 세션은 오염되지 않는다. */
        if (_stale()) {
          console.warn('[wsv2flow] publish resolved for a closed/replaced session — 화면은 두고 원래 슬롯에만 기록');
          if (r.ok) {
            try {
              myD._idemKey = null;
              myD.publish = myD.publish || {};
              myD.publish.status = 'published'; myD.publish.publishedAt = Date.now();
              var _sid = (r.data && (r.data.media_id || r.data.id)) || null;
              var _slk = (r.data && r.data.permalink) || null;
              if (_sid) myD.publish.igMediaId = String(_sid);
              if (_slk) myD.publish.igPermalink = String(_slk);
              // slot 은 이 발행을 누른 시점의 buildSlot() 결과 — 전역 d 를 다시 읽지 않는다.
              slot.publish = Object.assign({}, slot.publish, myD.publish);
              slot.status = 'published'; slot.instagramPublished = true;   // 홈 _isPub 이 보는 3필드를 함께(workspace-v2-home.js:562)
              if (window.WorkspaceAdapter.saveItem) window.WorkspaceAdapter.saveItem(slot);
              if (window.WorkspaceV2 && window.WorkspaceV2.refresh) window.WorkspaceV2.refresh();
            } catch (_se) { void _se; }
          }
          return;
        }
        if (r.ok) {
          d._idemKey = null;   // [P2-H1] 이 발행은 끝 — 다음 발행은 새 키(같은 사진 재발행도 정상 허용)
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
          // [P0-3] buildSlot 은 한 번만 — saveItem·captureAndNotify 가 같은 슬롯을 공유(큰 객체 재구성 1회로).
          // [출시 QA 2026-08-07] **이 세션에서 올렸다는 표식.** 재발행 확인창의 판정 근거다.
          //   `d.slot.publish` 를 보려 했더니 클라이언트 `d.slot` 엔 publish 가 실려 있지 않아
          //   (getActiveSlot 은 open/screen/cat/service/photoCount/coverUrl/hasCaption 요약만 준다)
          //   조건이 절대 참이 되지 않았고, 그래서 3번째 발행까지 그대로 나갔다(실측).
          d._publishedAt = Date.now();
          var _pubSlot = buildSlot();
          if (window.WorkspaceAdapter.saveItem) { try { window.WorkspaceAdapter.saveItem(_pubSlot); } catch (_e) { void _e; } }
          try { if (window.WorkMemory) window.WorkMemory.captureAndNotify(_pubSlot, d); } catch (_wm) { void _wm; }   // [T-115] 원장 작업 기억
          _pubFinish(function () {
            // [P1#1] 완료 애니메이션(~1.5s) 도중에도 세션이 바뀔 수 있다 — 그때 setScreen 하면
            //   원장이 보고 있던 새 글 화면을 강제로 낚아챈다.
            if (_stale()) return;
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
	          // [출시 QA 2026-08-07] 어댑터가 원인별 안내(재연결·권한·한도)를 만들었으면 **그 문장만** 띄운다.
	          //   앞에 "서버가 업로드를 거부했어요 —" 를 붙이면 정작 해야 할 일이 뒤로 밀린다.
	          toast(r.userFacing ? r.detail : (r.detail ? (m + ' — ' + r.detail) : m));
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
    // [카오스 2026-07-21] close 와 대칭 — open 도 진행 중 캡션 생성 토큰을 무효화한다.
    //   캡션 경로만 d 아이덴티티가 아닌 전역 _genToken 으로 stale 판별하는데, close 는 토큰을
    //   올려도 open 은 안 올려서, close 없이 다른 세션을 open/command 로 열면 옛 캡션 응답이
    //   _myToken===_genToken 을 통과해 새 세션 d.caption 에 누출됐다(다른 사진에 엉뚱한 글).
    _genToken++;
    try { if (d) d._dead = true; } catch (_od) { void _od; }
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
      photos: slot && slot.photos ? slot.photos.map(function (p, i) { return { id: p.id || uid(), dataUrl: p.dataUrl, editedDataUrl: p.editedDataUrl, role: p.role || 'hero', cropMeta: p.cropMeta || null, editState: p.editState || null, baseUrl: p.baseUrl || null, storyEdited: !!p.storyEdited, selected: true, selSeq: i + 1 }; }) : [],   // [#11] editState 복원 · [2026-07-17] storyEdited 복원(자동합성이 직접 꾸민 사진을 덮지 않게)
      _selSeq: (slot && slot.photos ? slot.photos.length : 0),
      baMode: purpose === 'before_after',
	      template: (wc && wc.templateLabel) || null, templateId: (wc && wc.templateId) || null,
	      templateOutput: (slot && slot.templateOutput) || null, templateOutputId: (wc && wc.templateId) || null,
	      templateOutputs: _hydrateOutputs(slot, wc), activeDisplayId: null,
	      tplCat: ctx.tplLabel || (wc && wc.type === 'before_after' ? '전후' : null),
	      tplPurpose: purpose, captionMode: capMode, defaultRole: ctx.role || 'hero',
      textOnly: !!(opts.textOnly),
      service: slot && slot.service ? slot.service : '', specialNote: (slot && slot.specialNote) || '', caption: slot ? (slot.caption || '') : '', hashtags: slot && slot.hashtags ? String(slot.hashtags).split(/\s+/).filter(Boolean) : [], selectedHashes: [],
      customerId: slot ? (slot.customer_id || null) : null, customerName: slot ? (slot.customer_name || '') : '', customerVc: 0, custQuery: '',
      capLen: cm.length_tier || 'medium', capTone: cm.tone_override || 'normal', logId: cm.log_id || null,
      capUsePersona: (cm.use_persona !== false),   // [P2 2026-07-10] 원장님 말투 반영 기본 ON(전송 시 IG연동 게이트 유지) — 저장본이 명시적 false면 존중

      publish: (slot && slot.publish) ? Object.assign({}, slot.publish) : { status: 'draft', instagramPreparedAt: null, publishedAt: null },
      recent: [], recentLoaded: false, capLoading: false,
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
    // [등록시술 연결 2026-07-20] 우리샵 등록 시술(가격표/설정) 캐시 워밍 — 캡션 칩이 이 목록을 기본으로 쓴다(getShopKeywords).
    //   localStorage 캐시가 있으면 즉시 뜨고, 새로 도착하면 캡션 화면일 때 재렌더해 칩을 갱신.
    try {
      if (window.loadServiceTemplates) {
        Promise.resolve(window.loadServiceTemplates()).then(function (list) {
          if (list && list.length && cur === 'caption' && !_isEditingCaptionCard()) setScreen('caption', { push: false });
        }).catch(function () { /* ignore */ });
      }
    } catch (_st) { void _st; }
    // [최근시술 소스확장] 최근 예약 시술을 '최근 시술' 칩에 쓰려고 예약 캐시 워밍(최근 90일~+14일). 도착 시 캡션이면 재렌더.
    try {
      if (window.Booking && window.Booking.list && _recentSrcPref().booking) {
        var _bn = new Date();
        var _bfrom = new Date(_bn.getTime() - 90 * 86400000).toISOString();
        var _bto = new Date(_bn.getTime() + 14 * 86400000).toISOString();
        Promise.resolve(window.Booking.list(_bfrom, _bto)).then(function (its) {
          if (its && its.length && cur === 'caption' && !_isEditingCaptionCard()) setScreen('caption', { push: false });
        }).catch(function () { /* ignore */ });
      }
    } catch (_bk) { void _bk; }
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
	    // [2026-07-22 오케스트레이션] 잇비 사진 브리핑(파싱 결과) — 레이아웃 다음에 편집기(레이어 주입)+캡션 자동.
	    d._orch = opts._orch || null; d._orchApplied = false;
	    d._pickComp = opts._pickComp || null;   // [2026-07-22] 잇비 채팅에서 미리 고른 레이아웃 구성 키
	    d._focusIntent = (startScreen === 'edit' && opts.focus) ? opts.focus : null;
	    if (d._focusIntent === 'background') { d.bgOpen = true; d.basicTool = 'background'; }
	    else if (d._focusIntent === 'crop') { d.editTab = 'tools'; d.advOpen = true; }
	    else if (d._focusIntent === 'template') { d.tplOpen = true; }
	    // [v564·필수1] 홈에서 파일과 함께 edit 로 바로 진입 시, 사진 로드 전 '빈 편집화면'이 깜빡이지
	    //   않도록 setScreen 을 addFiles 완료까지 미룬다(업로드 화면을 거치지 않음).
	    // [v590·#1] 사진이 아직 없는데 edit/caption 으로 바로 그리면 빈 화면이 깜빡 → 사진 들어온 뒤(addFiles) 그린다.
	    // [v778·#3 보스] 'upload' 로 파일과 함께 진입하는 경로도 포함 — 사진 디코딩(폰 원본 3~8MB) 동안
	    //   업로드 화면(전/후 역할 UI)이 잠깐 떴다가 레이아웃으로 점프하던 깜빡임 제거. 파일 있으면 addFiles 가 알아서 넘긴다.
	    var _deferInit = ((startScreen === 'edit' || startScreen === 'caption' || startScreen === 'upload') && incomingFiles.length && !d.photos.length);
	    if (!_deferInit) { setScreen(startScreen, { push: false }); _seedNavStack(startScreen); }   // [버그11] 직행 진입도 뒤로가기로 이전 단계 복귀
	    if (d._focusIntent) { var _rafF = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); }; _rafF(function () { _applyFocusScroll(); }); }
	    // 디코딩 실패 시엔 빈 화면에 갇히지 않도록 업로드 화면으로 복귀.
	    if (incomingFiles.length) addFiles(incomingFiles, true, startScreen === 'edit').catch(function () { if (_deferInit) { setScreen('upload', { push: false }); _seedNavStack('upload'); } });
	    // [구조 통합] 잇비 채팅 사진(dataURL)을 작업실로 바로 투입 — File 변환 없이 직접.
	    if (opts.photoUrls && opts.photoUrls.length) addPhotoUrls(opts.photoUrls, true);
	    // [2026-07-22] '사진 편집' = 인스타식 편집기(ItdEditor). 슬라이더 'edit' 화면(A)이 아니라 B를 연다.
	    //   사진 디코딩(File/dataURL)까지 몇 프레임 걸릴 수 있어 사진이 준비될 때까지 폴링 후 _openStoryEditor.
	    if (opts._openStory) {
	      var _rs = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
	      var _tryStory = function (tries) {
	        if (editablePhotos().length) { _openStoryEditor(); return; }
	        if (tries > 0) _rs(function () { _tryStory(tries - 1); });
	      };
	      _rs(function () { _tryStory(30); });
	    }
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
      if (!d.textOnly && editablePhotos().length) {
        setScreen('layout', { push: false });
        // [2026-07-22 보스] 잇비 채팅에서 이미 레이아웃을 골라 왔으면 레이아웃 화면을 지나쳐 게시글로.
        //   ⚠️ 파일 업로드 경로(addPhotoFiles)와 채팅/딥링크 경로(여기)가 **따로**다 —
        //      한쪽만 고치면 채팅에서 고른 게 안 먹는다(실제로 처음에 그 실수를 했다).
        //   setScreen('caption') 대신 onCta(): layout 의 onExit 이 합성본을 굽는다. 건너뛰면
        //   콜라주를 골랐는데 원본이 그대로 올라가는 조용한 사고가 난다.
        if (d._pickComp && _WSL && _WSL.applyComp) {
          var _pc = d._pickComp; d._pickComp = null;
          if (_WSL.applyComp(_pc)) { setScreen('layout', { push: false }); onCta(); }
        }
      } else setScreen('upload', { push: false });
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
    // [v779] 전체화면 편집 상태 정리 — ESC/토글 아닌 경로(하단 CTA·시스템 back·닫기)로 나가면
    //   body.itd-edit-fs 와 d.edFull 이 잔존해 재진입/CSS 변경 시 검은 오버레이 고착 소지가 있었다.
    try { document.body.classList.remove('itd-edit-fs'); } catch (_ef) { void _ef; }
    try { if (d) d.edFull = false; } catch (_ef2) { void _ef2; }
    // [P1 캡션 누출 수정 2026-07-16] 진행 중인 캡션 재생성 응답을 무효화한다. 예전엔 close 가
    //   _genToken 을 안 올려서, 닫고 다른 슬롯을 연 뒤 옛 응답이 도착하면 _myToken===_genToken 이
    //   통과해 새 슬롯의 캡션을 덮어썼다(다른 사진에 엉뚱한 캡션). 닫을 때 토큰을 올려 차단.
    _genToken++;
    // [P1#1 세션 가드] 이 세션은 죽었다고 표시 — 진행 중인 발행 콜백이 돌아와도 아무것도 안 쓴다.
    //   d 를 null 로 만들지 않는 이유: d 를 읽는 코드가 파일 곳곳에 있어 즉시 크래시가 난다.
    //   대신 죽음 표식만 남기고, 진행 중이던 발행 진행바는 여기서 정리한다(콜백은 UI 안 건드림).
    try { if (d) { var _wasPublishing = d._publishing; d._dead = true; if (_wasPublishing) _pubHide(); } } catch (_de) { void _de; }
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
      case 'storyedit':   // [2026-07-22] 인스타식 편집기(ItdEditor) 열기 — '사진 편집'·꾸미기·누끼 목적지.
        if (_flowReady() && editablePhotos().length) { _openStoryEditor(); return { ok: true }; }   // 이미 열림 → 현재 사진으로
        open({ cat: cmd.cat || null, startScreen: 'layout', files: cmd.files || null, photoUrls: cmd.photoUrls || null, _openStory: true });
        return { ok: true };
      case 'orchestrate':   // [2026-07-22] 잇비 사진+브리핑 → 레이아웃 고르기 → (편집기 레이어 자동)+캡션 자동.
        //   startScreen 미지정(=upload) → addPhotoUrls 가 사진 투입 후 레이아웃으로 넘김(빈 레이아웃 방지).
        open({ cat: cmd.cat || null, files: cmd.files || null, photoUrls: cmd.photoUrls || null,
               _orch: cmd.brief || null, _pickComp: cmd.comp || null });
        return { ok: true };
      // [2026-07-22] 잇비 채팅이 "사진 n장이면 어떤 구성이 있나"를 물어보는 창구.
      //   플로우가 안 열려 있어도 답할 수 있어야 한다(채팅에서 먼저 고르고 그다음 열리므로).
      case 'layoutopts':
        return { ok: true, options: (_WSL && _WSL.compOptions) ? _WSL.compOptions(+cmd.n || 0) : [] };
      case 'goto':
        if (!_flowReady() || SCREENS.indexOf(cmd.screen) < 0) return { ok: false, reason: 'not_open' };
        setScreen(cmd.screen); return { ok: true };
      case 'adjust':
        return _applyAdjustPatch(cmd);
      case 'edit':   // 되돌리기/다시실행/초기화 — [2026-07-22] 옛 슬라이더 화면(A) 안 띄우고 headless 로 상태만.
        if (!_flowReady()) return { ok: false, reason: 'not_open' };
        _editBottom(cmd.action); return { ok: true };   // _setEditSection 은 A DOM 없으면 no-op, _refreshPreview 로 결과만 갱신
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
