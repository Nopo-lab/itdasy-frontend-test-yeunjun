/* Workspace V2 플로우 — 프로토타입 2~6 화면(업로드→편집→게시글→고객연결→미리보기→게시).
   [C4] 캡션→게시글 네이밍, 가짜 HASHES 제거, [다시]/[더 짧게]/[더 길게] 버튼.
   [C5] 고객연결 — 그라데이션 아바타 제거, _barClass(vc) 컬러바+N회 배지.
   [C6] 단계 순서: upload→edit→caption(게시글)→connect→preview→게시. 발행=uploadProgressPopup.
   진입: WorkspaceFlow.open({ slot?, startScreen?, cat?, files?, textOnly? }). */
(function () {
  'use strict';

  // [C6] 단계 순서 변경: connect가 preview 앞으로
  var SCREENS = ['upload', 'edit', 'caption', 'connect', 'preview'];
  var TITLE = { upload:'사진 업로드', edit:'편집 및 템플릿', caption:'게시글 만들기', connect:'고객 연결', preview:'인스타 미리보기' };
  var CTA = {
    upload: { l:'다음', to:'edit' },
    edit:   { l:'저장하고 게시글 쓰기', to:'caption' },
    caption:{ l:'고객 연결로', to:'connect' },
    connect:{ l:'미리보기', to:'preview' },
  };
  // preview: CTA 없음(미리보기 화면에 게시 버튼 직접 존재)
  var CAT_CTX = {
    ba:     { purpose: 'before_after', captionMode: 'normal', role: 'auto', tplLabel: '전후' },
    flex:   { purpose: 'feed',         captionMode: 'normal', role: 'hero', tplLabel: '시술 자랑' },
    review: { purpose: 'review',       captionMode: 'review', role: 'hero', tplLabel: '고객 후기' },
    event:  { purpose: 'event',        captionMode: 'normal', role: 'hero', tplLabel: '이벤트' }
  };
  var CROP_RATIO = { before_after: '4:5', feed: '4:5', review: '4:5', event: '1:1', price: 'free' };
  var TYPE_MAP = { before_after: 'before_after', feed: 'promo', review: 'review', event: 'event', price: 'price' };
  // 단순화 도구 행 (FC3): 자동보정/밝기/피부/누끼/배경/템플릿
  var SIMPLE_TOOLS = [
    { k: 'auto',      l: '자동보정', path: 'M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z' },
    { k: 'brightness',l: '밝기',   path: 'M12 3v1m0 16v1M4.22 4.22l.71.71m12.73 12.73.71.71M1 12h2m18 0h2M4.22 19.78l.71-.71M18.36 5.64l.71-.71M12 7a5 5 0 1 0 0 10A5 5 0 0 0 12 7z' },
    { k: 'skin',      l: '피부',   path: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
    { k: 'removebg',  l: '누끼',   path: 'M3 3l18 18M10.5 10.68A3 3 0 0 0 15 6h-4M6.11 6.11A5 5 0 0 0 12 17h5m4-4a9 9 0 0 1-9 9' },
    { k: 'bg',        l: '배경',   path: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
    { k: 'template',  l: '템플릿', path: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z' },
  ];
  var TOOL_SLIDER = { brightness: { k: 'brightness', l: '밝기' }, skin: { k: 'brightness', l: '화사' } };
  function newAdjust() { return { brightness:0, contrast:0, saturation:0, sharpness:0, color:0 }; }
  var d = null;
  var el = null;
  var cur = 'upload';

  function uid() { return (typeof window._uid === 'function') ? window._uid() : 'wf_' + Math.random().toString(36).slice(2); }
  function toast(m) { if (window.showToast) window.showToast(m); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
  function fileToDataUrl(f) {
    if (typeof window._fileToDataUrl === 'function') return window._fileToDataUrl(f);
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsDataURL(f); });
  }
  function editablePhotos() { return d.photos.filter(function (x) { return x.role !== 'exclude'; }); }
  // 대표 사진 — 캡션/미리보기/저장 썸네일/게시 이미지(전후면 '후' 우선). 기존 동작 유지.
  function curPhoto() { var p = editablePhotos(); return (p[1] || p[0] || d.photos[0]); }
  // 편집 대상 사진 — 편집 화면에서 전/후 전환(editIdx)으로 선택. 전후는 '전(before)' 기본, 일반은 첫 사진.
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
    bakeEdit().then(function () {
      d.editIdx = idx;
      d.adjust = newAdjust(); d.undo = []; d.redo = []; d.previewUrl = null;
      d.originalPreview = false; d.simpleTool = null;
      d.bgAction = null; d.bgColor = null; d.bgFail = false; d.bgBusy = false;
      setScreen('edit');
    });
  }
  function photoUrl(p) { return p ? (p.editedDataUrl || p.dataUrl) : ''; }
  // [C5] _barClass: vc(방문횟수) → b1/b2/b3 클래스
  function barClass(vc) {
    if (vc >= 10) return 'b3';
    if (vc >= 3)  return 'b2';
    return 'b1';
  }

  /* ── 화면 마크업 ── */
  function shell() {
    return '' +
      '<div class="wsv2flow__bar">' +
        '<button type="button" class="wsv2flow__back" data-fl="back" aria-label="뒤로"><i class="ph-duotone ph-caret-left"></i></button>' +
        '<div class="wsv2flow__title" data-fl-title>사진 업로드</div>' +
        '<span class="wsv2flow__step" data-fl-step></span>' +
      '</div>' +
      '<div class="wsv2flow__progress">' + '<i class="pg-seg"></i><i class="pg-seg"></i><i class="pg-seg"></i><i class="pg-seg"></i><i class="pg-seg"></i>' + '</div>' +
      '<div class="wsv2flow__screens">' +
        '<section class="wsv2flow__s" data-fs="upload"></section>' +
        '<section class="wsv2flow__s" data-fs="edit"></section>' +
        '<section class="wsv2flow__s" data-fs="caption"></section>' +
        '<section class="wsv2flow__s" data-fs="connect"></section>' +
        '<section class="wsv2flow__s" data-fs="preview"></section>' +
      '</div>' +
      '<footer class="wsv2flow__actionbar"><button class="wsv2flow__cta" data-fl="cta">다음</button></footer>' +
      '<input type="file" accept="image/*" multiple data-fl-file hidden>';
  }

  function renderUpload() {
    var tiles = d.photos.map(function (p, i) {
      var tag = '홍보컷', cls = '';
      if (d.baMode && p.role === 'before') { tag = '전 Before'; cls = 'before'; }
      else if (d.baMode && p.role === 'after') { tag = '후 After'; cls = 'after'; }
      return '<div class="photo-tile selected" style="background-image:url(' + esc(p.dataUrl) + ')" data-fl-tile="' + i + '">' +
        '<button class="thumb-x" data-fl-del="' + i + '" aria-label="삭제"><i class="ph-bold ph-x"></i></button>' +
        '<span class="thumb-tag ' + cls + '">' + tag + '</span></div>';
    }).join('');
    return '' +
      '<div class="up-drop" data-fl-pick>' +
        '<span class="up-cloud"><i class="ph-duotone ph-cloud-arrow-up"></i></span>' +
        '<b>사진을 드래그하거나 여기를 눌러 업로드</b><span class="up-note">JPG · PNG 최대 20MB · 여러 장 선택 가능</span>' +
      '</div>' +
      '<div class="up-toggle-row">' +
        '<div class="up-toggle-copy"><b>전/후 사진으로 만들기</b><span>사진 순서대로 전·후를 자동으로 표시해요.</span></div>' +
        '<button class="ui-toggle' + (d.baMode ? ' on' : '') + '" data-fl="batoggle" role="switch" aria-checked="' + d.baMode + '"></button>' +
      '</div>' +
      '<div class="up-section">선택한 사진 <b>' + d.photos.length + '</b> / 10</div>' +
      '<div class="upload-grid">' + tiles +
        '<div class="grid-add" data-fl-pick><i class="ph-bold ph-plus"></i><span>추가</span></div>' +
      '</div>';
  }

  function renderEdit() {
    var base = photoUrl(curEditPhoto());
    var url = d.originalPreview ? base : (d.previewUrl || base);
    var tool = d.simpleTool || null;
    // 전/후(또는 다중) 사진 편집 전환 — 2장 이상일 때만. 각 사진을 각각 보정 가능.
    var eps = editablePhotos();
    var switcher = '';
    if (eps.length >= 2) {
      var curIdx = (d.editIdx == null) ? 0 : d.editIdx;
      switcher = '<div class="ed-baswitch" role="tablist">' + eps.map(function (p, i) {
        var lbl = p.role === 'before' ? '전 사진' : (p.role === 'after' ? '후 사진' : ('사진 ' + (i + 1)));
        return '<button type="button" class="ed-baswitch__btn' + (i === curIdx ? ' on' : '') + '" data-fl-editsel="' + i + '" role="tab" aria-selected="' + (i === curIdx) + '" style="background-image:url(' + esc(photoUrl(p)) + ')"><span>' + esc(lbl) + '</span></button>';
      }).join('') + '</div>';
    }
    var toolsHtml = '<div class="ed-tools-row">' + SIMPLE_TOOLS.map(function (t) {
      return '<button type="button" class="ed-tool-cir' + (tool === t.k ? ' on' : '') + '" data-fl-simpletool="' + t.k + '">' +
        '<span class="ed-cir"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' + t.path + '"/></svg></span>' +
        t.l + '</button>';
    }).join('') + '</div>';
    var sliderHtml = '';
    if (TOOL_SLIDER[tool]) {
      var sk = TOOL_SLIDER[tool].k, sv = (d.adjust && d.adjust[sk]) || 0;
      sliderHtml = '<div class="ed-slider"><span>' + TOOL_SLIDER[tool].l + '</span>' +
        '<input type="range" min="-100" max="100" value="' + sv + '" data-fl-range="' + sk + '">' +
        '<span class="ed-val" data-fl-rangeval>' + (sv > 0 ? '+' : '') + sv + '</span></div>';
    }
    var bgHtml = '';
    if (tool === 'bg') {
      var bgColors = ['#ffffff', '#f7f3ee', '#fbeaef', '#fce8d8', '#fdf6c9', '#eaf3fc', '#e7f4ec', '#efe9f7', '#3a322c', '#1f1b18'];
      bgHtml = '<div class="ed-bg">' +
        '<button type="button" class="ed-bg__btn' + (d.bgAction === 'blur' ? ' on' : '') + '" data-fl-bg="blur"><i class="ph-duotone ph-drop-half"></i>배경 흐림</button>' +
        '<div class="ed-note"><i class="ph-duotone ph-info"></i>배경 색은 먼저 누끼 도구로 인물을 분리한 뒤 적용돼요.</div>' +
        '<div class="ed-bg__colors">' + bgColors.map(function (c) {
          return '<button type="button" class="ed-bg__color' + (d.bgColor === c ? ' on' : '') + '" data-fl-bgcolor="' + c + '" style="background:' + c + '" aria-label="배경색"></button>';
        }).join('') + '</div>' +
        '<div class="ed-bg__status' + (d.bgFail ? ' is-fail' : '') + '" data-fl-bgstatus>' +
          (d.bgBusy ? '배경 처리 중…' : (d.bgFail ? esc(d.bgFailMsg || '실패') : (d.bgAction ? '적용됨' : '색을 선택하세요'))) +
        '</div></div>';
    }
    var tplHtml = '';
    if (tool === 'template') {
      var chips = ['전체', '전후', '시술 자랑', '고객 후기', '이벤트'];
      var tpls = ['Clean Beige', 'Lash Anew', 'Glow White', 'Event Soft', 'Salon Warm', 'Before After'];
      tplHtml = '<div class="ed-tpl-strip">' +
        '<div class="tpl-chips">' + chips.map(function (c, i) {
          return '<span class="tpl-chip' + ((d.tplCat ? d.tplCat === c : i === 0) ? ' on' : '') + '" data-fl-tplchip>' + esc(c) + '</span>';
        }).join('') + '</div>' +
        '<div class="tpl-strip">' + tpls.map(function (n, i) {
          return '<div class="tpl-strip-item' + (d.template === n ? ' on' : (d.template == null && i === 0 ? ' on' : '')) + '" data-fl-tpl="' + esc(n) + '"' + (url ? ' style="background-image:url(' + esc(url) + ')"' : '') + '><span>' + esc(n) + '</span></div>';
        }).join('') + '</div>' +
        (d.template ? '<div class="tpl-picked">선택: ' + esc(d.template) + '</div>' : '') +
      '</div>';
    }
    return '' +
      switcher +
      '<div class="ed-photo" data-fl-edphoto style="background-image:url(' + esc(url) + ');filter:' + ((d.originalPreview || d.previewUrl) ? 'none' : filterCss(d.adjust)) + '"></div>' +
      toolsHtml + sliderHtml + bgHtml + tplHtml +
      '<div class="ed-linkrow"><button type="button" class="ed-link-btn" data-fl="openeditor">정밀 편집기 열기</button></div>';
  }

  function _roleSummary() {
    var r = {};
    (d.photos || []).forEach(function (p) { r[p.role || 'hero'] = (r[p.role || 'hero'] || 0) + 1; });
    return Object.keys(r).map(function (k) { return ({ before: '전', after: '후', hero: '홍보컷', exclude: '제외' }[k] || k) + ' ' + r[k]; }).join(' · ') || '없음';
  }

  // [FC4] 게시글 화면 — 3x3 시나리오칩(scenario-selector 재사용) + 고정멘트 꼬리
  function renderCaption() {
    var url = photoUrl(curPhoto());
    if (d.capLoading) {
      return '<div class="cap-loading"><div class="cap-loading-spin"></div><p>AI가 게시글을 쓰는 중…</p></div>';
    }
    if (!d.caption) {
      var photoThumb = (!d.textOnly && url) ?
        '<div class="cap-photo cap-photo--sm" style="background-image:url(' + esc(url) + ')"></div>' : '';
      return photoThumb +
        '<div class="screen-head"><h2>어떤 게시글을<br>써드릴까요?</h2></div>' +
        '<div data-fl-scenario></div>';
    }
    // 결과 화면
    var hashHtml = d.hashtags.map(function (h) {
      return '<button class="hash-chip' + (d.selectedHashes && d.selectedHashes.indexOf(h) >= 0 ? ' on' : '') + '" data-fl-hash="' + esc(h) + '">' + esc(h) + '</button>';
    }).join('');
    var photoHtml = (!d.textOnly && url) ?
      '<div class="cap-photo" style="background-image:url(' + esc(url) + ')"><span class="cap-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:13px;height:13px;stroke:var(--brand-strong)"><use href="#ic-tag"/></svg><span data-fl-capsvc>' + esc((d.service || '시술').split(',')[0]) + '</span></span></div>' : '';
    return '' +
      '<div class="cap-byline">원장님 인스타 글 학습 완료</div>' +
      '<div class="cap-card">' +
        photoHtml +
        '<div class="cap-text">' +
          '<p data-fl-capbody>' + esc(d.caption) + '</p>' +
          '<div class="cap-hash" data-fl-caphash>' + esc((d.selectedHashes && d.selectedHashes.length ? d.selectedHashes : d.hashtags).join(' ')) + '</div>' +
          '<span class="cap-count"><span data-fl-capcount>' + (d.caption || '').length + '</span>/200</span>' +
        '</div>' +
      '</div>' +
      '<div class="captail"><div class="captail__label">고정 꼬리말 자동 추가</div>' +
        '<div class="captail__body">' + (d.captionTemplate ? esc(d.captionTemplate) : '매장 고정 문구(예약 DM·영업시간)가 자동으로 붙어요') + '</div>' +
      '</div>' +
      (hashHtml ? '<div class="cust-row"><b>해시태그</b><a data-fl="morehash">새로고침 ›</a></div><div class="hash-chips">' + hashHtml + '</div>' : '') +
      '<div class="cap-regen-row">' +
        '<button class="cap-regen-btn" data-fl-var="regen">다시</button>' +
        '<button class="cap-regen-btn" data-fl-var="short">더 짧게</button>' +
        '<button class="cap-regen-btn" data-fl-var="long">더 길게</button>' +
      '</div>';
  }

  function _mountCaption() {
    var container = el.querySelector('[data-fl-scenario]');
    if (!container) return;
    if (typeof renderScenarioSelector !== 'function') { toast('시나리오 선택기를 불러오지 못했어요'); return; }
    renderScenarioSelector(container, function (result) {
      d.captionAxes = result.axes;
      d.service = result.special_context || [result.axes.situation, result.axes.customer, (d.textOnly ? null : result.axes.photo)].filter(Boolean).join('/');
      doGenerate({ photo_context: result.axes, special_context: result.special_context || '' }, null);
    });
  }

  function renderPreview() {
    var url = photoUrl(curPhoto());
    var custLine = d.customerName ?
      '<div class="confirmline">연결 손님: <b>' + esc(d.customerName) + '</b>' + (d.customerVc ? ' · ' + d.customerVc + '회 방문' : ' · 첫 방문') + '</div>' : '';
    return '' +
      custLine +
      '<div class="ig-card2">' +
        '<div class="ig-head2"><span class="ig-logo">Salon<br>Dearly</span><span class="ig-name2">Salon Dearly</span><span class="ig-loc">청담점</span><span class="ig-dots2">···</span></div>' +
        '<div class="ig-photo" style="background-image:url(' + esc(url) + ')"></div>' +
        '<div class="ig-act"><div class="ig-ic"><i class="ph-duotone ph-heart"></i><i class="ph-duotone ph-chat-circle"></i><i class="ph-duotone ph-paper-plane-tilt"></i></div>' +
          '<div class="ig-save"><i class="ph-duotone ph-bookmark-simple"></i></div></div>' +
        '<div class="ig-copy2"><b>salondearly_official</b> <span data-fl-igcap>' + esc(d.caption || '') + '</span><br><span class="ig-hash">' + esc(d.hashtags.join(' ')) + '</span><div class="ig-ago">1분 전</div></div>' +
      '</div>' +
      _publishBlock();
  }

  function _publishBlock() {
    var connected = window.WorkspaceAdapter ? window.WorkspaceAdapter.instagram().connected : false;
    if (connected) {
      return '<button type="button" class="cap-preview" style="width:100%;margin-top:10px" data-fl="publish">인스타그램에 올리기</button>';
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
  function renderConnect() {
    var recent = d.recent || [];
    var listHtml;
    if (recent.length) {
      listHtml = recent.map(function (c) {
        var sel = String(d.customerId) === String(c.id);
        var bc = barClass(c.vc || 0);
        var vcLabel = c.vc ? c.vc + '회' : '첫 방문';
        return '<div class="cust-card' + (sel ? ' selected' : '') + '" data-fl-cust="' + esc(c.n) + '" data-fl-custid="' + esc(c.id) + '">' +
          '<span class="cust-bar ' + bc + '"></span>' +
          '<div class="cust-info"><h3>' + esc(c.n) + '<span class="cust-badge ' + bc + '">' + esc(vcLabel) + '</span></h3>' + (c.p ? '<p>' + esc(c.p) + '</p>' : '') + '</div>' +
          '<span class="cust-pick"><i class="ph-bold ' + (sel ? 'ph-check' : 'ph-plus') + '"></i></span></div>';
      }).join('');
    } else {
      listHtml = '<div class="cust-empty">' + (d.recentLoaded ? '최근 연결한 고객이 아직 없어요.<br>아래에서 고객을 선택/등록해 주세요.' : '불러오는 중…') + '</div>';
    }
    var linkedName = d.customerName || '';
    var linkedVc = d.customerVc || 0;
    var linkedBc = barClass(linkedVc);
    return '' +
      '<div class="screen-head"><h2>고객을 선택하거나<br>새로 연결해 주세요</h2><p>연결하면 작업실에 자동 저장되고, 시술 기록이 함께 남아요.</p></div>' +
      '<div class="cust-search"><i class="ph-duotone ph-magnifying-glass"></i><input data-fl-custsearch placeholder="이름, 전화번호 검색"></div>' +
      '<div class="cust-row"><b>최근 고객</b><a data-fl="pickcust">더보기 ›</a></div>' +
      '<div data-fl-custlist>' + listHtml + '</div>' +
      '<div class="linked-card"><div class="linked-title"><i class="ph-duotone ph-heart"></i> 연결된 고객</div>' +
        '<div class="linked-main">' +
          '<span class="cust-bar ' + (linkedName ? linkedBc : 'b1') + '"></span>' +
          '<div><b>' + esc(linkedName || '고객 미선택') + '</b>' + (linkedName ? '<span class="cust-badge ' + linkedBc + '">' + (linkedVc ? linkedVc + '회' : '첫 방문') + '</span>' : '') + '<span>오늘 촬영한 사진과 게시글을 이 고객 기록에 저장해요.</span></div>' +
        '</div>' +
        '<div class="linked-actions"><button class="lk-btn pink" data-fl="pickcust">+ 새 고객 등록</button><button class="lk-btn" data-fl="skipcust">연결 없이 진행</button></div></div>';
  }

  var RENDER = { upload:renderUpload, edit:renderEdit, caption:renderCaption, connect:renderConnect, preview:renderPreview };

  function filterCss(a) {
    a = a || {};
    var bright = Math.max(0, 1 + (a.brightness || 0) * 0.6 / 100);
    var contr = Math.max(0, 1 + (a.contrast || 0) / 100);
    var sat = Math.max(0, 1 + (a.saturation || 0) * 0.8 / 100);
    var hue = (a.color || 0) * 0.4;
    var contrSharp = a.sharpness > 0 ? (contr + a.sharpness * 0.2 / 100) : contr;
    return 'brightness(' + bright.toFixed(3) + ') contrast(' + contrSharp.toFixed(3) + ') saturate(' + sat.toFixed(3) + ') hue-rotate(' + hue.toFixed(1) + 'deg)';
  }

  /* ── 라우팅 ── */
  function setScreen(name) {
    cur = name;
    var to = SCREENS.indexOf(name);
    el.querySelectorAll('.wsv2flow__s').forEach(function (s) {
      var i = SCREENS.indexOf(s.dataset.fs);
      var on = s.dataset.fs === name;
      if (on) s.innerHTML = RENDER[name]();
      s.classList.toggle('active', on);
      s.classList.toggle('prev', !on && i < to);
    });
    el.querySelector('[data-fl-title]').textContent = TITLE[name];
    el.querySelector('[data-fl-step]').textContent = (to + 1) + ' / ' + SCREENS.length;
    el.querySelectorAll('.wsv2flow__progress .pg-seg').forEach(function (sg, i) { sg.classList.toggle('done', i <= to); });
    var bar = el.querySelector('.wsv2flow__actionbar'), cta = el.querySelector('[data-fl="cta"]');
    if (CTA[name]) { bar.classList.remove('hidden'); cta.textContent = CTA[name].l; } else bar.classList.add('hidden');
    var act = el.querySelector('.wsv2flow__s.active'); if (act) act.scrollTop = 0;
    if (name === 'caption') _mountCaption();
    if (name === 'connect') loadRecent();
    if (name === 'preview' && d.publish && (d.publish.status === 'draft' || !d.publish.status)) d.publish.status = 'preview_ready';
  }

  function loadRecent() {
    if (d.recentLoaded || d._recentLoading) return;
    if (!(window.WorkspaceAdapter && window.WorkspaceAdapter.recentCustomers)) { d.recentLoaded = true; return; }
    d._recentLoading = true;
    window.WorkspaceAdapter.recentCustomers(5).then(function (list) {
      d.recent = list || []; d.recentLoaded = true; d._recentLoading = false;
      if (cur === 'connect') setScreen('connect');
    });
  }

  function doGenerate(extra, label) {
    var svc = String(d.service || '').trim();
    if (!svc) { toast('시술 내역을 먼저 입력해 주세요'); return; }
    if (!(window.WorkspaceAdapter && window.WorkspaceAdapter.generateCaption)) { toast('게시글 생성 모듈을 불러오지 못했어요'); return; }
    d.capLoading = true; setScreen('caption');
    var opts = Object.assign({ slotId: d.slot && d.slot.id, service: svc, mode: d.captionMode || 'normal' }, extra || {});
    d.capLen = opts.length_tier || d.capLen || 'medium';
    d.capTone = opts.tone_override || d.capTone || 'normal';
    window.WorkspaceAdapter.generateCaption(opts).then(function (r) {
      d.capLoading = false;
      if (r.ok) {
        d.caption = r.caption; d.hashtags = (r.hashtags || []).slice(); d.selectedHashes = d.hashtags.slice();
        d.captionTemplate = r.caption_template || '';
        d.logId = r.log_id || null; if (label) toast(label);
      } else { toast(r.toast || '게시글 생성에 실패했어요'); }
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
      if (a === 'batoggle') { d.baMode = !d.baMode; reassignRoles(); setScreen('upload'); return; }
      if (a === 'gen') { return doGenerate({}, null); }
      if (a === 'regen') { return doGenerate({}, '게시글을 다시 생성했어요'); }
      if (a === 'morehash') { return doGenerate({}, '해시태그를 새로 가져왔어요'); }
      if (a === 'toconnect') { syncCaptionFromDom(); setScreen('connect'); return; }
      if (a === 'topreview') { syncCaptionFromDom(); setScreen('preview'); return; }
      if (a === 'pickcust') { return pickCustomer(); }
      if (a === 'skipcust') { d.customerId = null; d.customerName = ''; d.customerVc = 0; setScreen('preview'); return; }
      if (a === 'sharepreview') { toast('피드·스토리 비율과 게시글 줄바꿈을 확인했어요. (실제 업로드 아님)'); return; }
      if (a === 'crop') { return openCropFlow(); }
      if (a === 'roles') { toast('역할 — ' + _roleSummary()); return; }
      if (a === 'publish') { return publish(); }
      if (a === 'openeditor') {
        var ph = curEditPhoto();
        if (window.PhotoEditor && typeof window.PhotoEditor.open === 'function') window.PhotoEditor.open(ph);
        else toast('편집기를 불러오지 못했어요');
        return;
      }
      var edsel = t.closest('[data-fl-editsel]'); if (edsel) { return switchEditPhoto(+edsel.getAttribute('data-fl-editsel')); }
      var simpletool = t.closest('[data-fl-simpletool]');
      if (simpletool) {
        var tk = simpletool.getAttribute('data-fl-simpletool');
        if (tk === 'removebg') { d.simpleTool = 'removebg'; applyBg('removeBg'); return; }
        if (tk === 'auto') {
          d.simpleTool = 'auto'; d.adjust.brightness = 15; d.adjust.contrast = 10; d.adjust.saturation = 5;
          setScreen('edit'); _refreshPreview(); return;
        }
        d.simpleTool = tk; setScreen('edit'); return;
      }
      if (a === 'copycap') { window.WorkspaceAdapter && window.WorkspaceAdapter.copyText((d.caption || '') + (d.hashtags.length ? '\n\n' + d.hashtags.join(' ') : '')); _markPrepared(); return; }
      if (a === 'saveimg') { window.WorkspaceAdapter && window.WorkspaceAdapter.saveImage(photoUrl(curPhoto()), d.service || 'itdasy'); _markPrepared(); return; }
      if (a === 'igconnect') { window.WorkspaceAdapter && window.WorkspaceAdapter.connectInstagram(); return; }

      if (t.closest('[data-fl-pick]')) { el.querySelector('[data-fl-file]').click(); return; }
      var del = t.closest('[data-fl-del]'); if (del) { e.stopPropagation(); d.photos.splice(+del.getAttribute('data-fl-del'), 1); reassignRoles(); setScreen('upload'); return; }
      if (t.closest('[data-fl-edphoto]')) { return; }
      var edtab = t.closest('[data-fl-edtab]'); if (edtab) { d.editTab = edtab.getAttribute('data-fl-edtab'); d.control = null; setScreen('edit'); return; }
      var edtool = t.closest('[data-fl-edtool]'); if (edtool) { d.control = edtool.getAttribute('data-fl-edtool'); setScreen('edit'); return; }
      var bgb = t.closest('[data-fl-bg]'); if (bgb) { return applyBg(bgb.getAttribute('data-fl-bg')); }
      var bgc = t.closest('[data-fl-bgcolor]'); if (bgc) { d.bgColor = bgc.getAttribute('data-fl-bgcolor'); return applyBg('color'); }
      var eb = t.closest('[data-fl-eb]'); if (eb) { return _editBottom(eb.getAttribute('data-fl-eb')); }
      var cust = t.closest('[data-fl-cust]'); if (cust) {
        d.customerId = cust.getAttribute('data-fl-custid'); d.customerName = cust.getAttribute('data-fl-cust');
        // vc 찾기 — recent 캐시에서
        var found = (d.recent || []).filter(function (c) { return String(c.id) === String(d.customerId); })[0];
        d.customerVc = found ? (found.vc || 0) : 0;
        setScreen('connect'); return;
      }
      var tplchip = t.closest('[data-fl-tplchip]'); if (tplchip) { el.querySelectorAll('[data-fl-tplchip]').forEach(function (x) { x.classList.remove('on'); }); tplchip.classList.add('on'); d.tplCat = tplchip.textContent.trim(); return; }
      var tpl = t.closest('[data-fl-tpl]'); if (tpl) { d.template = tpl.getAttribute('data-fl-tpl'); el.querySelectorAll('[data-fl-tpl]').forEach(function (x) { x.classList.remove('on'); }); tpl.classList.add('on'); toast("'" + d.template + "' 템플릿 선택"); setScreen('edit'); return; }
      // [C4] 해시태그 선택 → selectedHashes 토글
      var hash = t.closest('[data-fl-hash]'); if (hash) {
        var h = hash.getAttribute('data-fl-hash');
        d.selectedHashes = d.selectedHashes || [];
        var k = d.selectedHashes.indexOf(h); if (k >= 0) d.selectedHashes.splice(k, 1); else d.selectedHashes.push(h);
        hash.classList.toggle('on'); var ch = el.querySelector('[data-fl-caphash]'); if (ch) ch.textContent = d.selectedHashes.join(' '); return;
      }
      // [C4] 재생성 버튼: data-fl-var="regen|short|long"
      var vv = t.closest('[data-fl-var]'); if (vv) {
        var vk = vv.getAttribute('data-fl-var');
        if (vk === 'short') { return doGenerate({ length_tier: 'short' }, '짧게 다시 생성했어요'); }
        if (vk === 'long')  { return doGenerate({ length_tier: 'long' }, '길게 다시 생성했어요'); }
        return doGenerate({}, '게시글을 다시 생성했어요');
      }
      var seg = t.closest('[data-fl-seg]'); if (seg) { d.capSeg = seg.getAttribute('data-fl-seg'); setScreen('caption'); if (d.capSeg === 'write') { var bd = el.querySelector('[data-fl-capbody]'); if (bd) bd.focus(); } return; }
    });
    el.querySelector('[data-fl-file]').addEventListener('change', function (e) {
      var files = Array.from(e.target.files || []); e.target.value = '';
      if (!files.length) return;
      Promise.all(files.slice(0, 10).map(fileToDataUrl)).then(function (urls) {
        urls.forEach(function (u) { d.photos.push({ id: uid(), dataUrl: u, role: 'hero' }); });
        reassignRoles(); setScreen('upload'); toast(urls.length + '장 추가됨');
      });
    });
    el.addEventListener('input', function (e) {
      if (e.target.matches('[data-fl-range]')) {
        var k = e.target.getAttribute('data-fl-range'); d.adjust[k] = +e.target.value;
        var p = el.querySelector('[data-fl-edphoto]');
        if (p && !d.originalPreview) { d.previewUrl = null; p.style.backgroundImage = 'url(' + esc(photoUrl(curEditPhoto())) + ')'; p.style.filter = filterCss(d.adjust); }
        var v = el.querySelector('[data-fl-rangeval]'); if (v) v.textContent = (d.adjust[k] > 0 ? '+' : '') + d.adjust[k];
      }
      if (e.target.matches('[data-fl-capbody]')) { d.caption = e.target.textContent; var cc = el.querySelector('[data-fl-capcount]'); if (cc) cc.textContent = (d.caption || '').length; }
      if (e.target.matches('[data-fl-service]')) { d.service = e.target.value; }
      if (e.target.matches('[data-fl-custsearch]')) { d.custQuery = e.target.value; }
    });
    el.addEventListener('focusin', function (e) {
      if (e.target.matches('[data-fl-range]')) d._adjPrev = clone(d.adjust);
      if (e.target.matches('[data-fl-capbody]') && e.target.getAttribute('data-empty') === '1') { e.target.textContent = ''; e.target.removeAttribute('data-empty'); e.target.style.color = ''; }
    });
    el.addEventListener('change', function (e) {
      if (e.target.matches('[data-fl-range]')) {
        if (d._adjPrev) { d.undo = d.undo || []; d.undo.push(d._adjPrev); if (d.undo.length > 30) d.undo.shift(); d.redo = []; d._adjPrev = null; }
        _refreshPreview();
      }
    });
  }

  function _refreshPreview() {
    var photo = curEditPhoto(); if (!photo) return;
    var base = photo.editedDataUrl || photo.dataUrl;
    var p = el.querySelector('[data-fl-edphoto]');
    var nonzero = d.adjust && Object.keys(d.adjust).some(function (k) { return d.adjust[k]; });
    if (!nonzero) { d.previewUrl = null; if (p && !d.originalPreview) { p.style.backgroundImage = 'url(' + esc(base) + ')'; p.style.filter = 'none'; } return; }
    if (!(window.WorkspaceAdapter && window.WorkspaceAdapter.applyPixelAdjust)) { if (p && !d.originalPreview) p.style.filter = filterCss(d.adjust); return; }
    var token = (d._pvTok = (d._pvTok || 0) + 1);
    window.WorkspaceAdapter.applyPixelAdjust({ src: base, adjust: d.adjust }).then(function (r) {
      if (token !== d._pvTok) return;
      if (r && r.ok && r.dataUrl) {
        d.previewUrl = r.dataUrl;
        var p2 = el.querySelector('[data-fl-edphoto]');
        if (p2 && !d.originalPreview) { p2.style.backgroundImage = 'url(' + r.dataUrl + ')'; p2.style.filter = 'none'; }
      }
    });
  }

  function clone(o) { return JSON.parse(JSON.stringify(o || {})); }

  function _editBottom(label) {
    if (label === '비교' || label === '원본보기') { d.originalPreview = !d.originalPreview; setScreen('edit'); if (!d.originalPreview) _refreshPreview(); return; }
    if (label === '되돌리기') { if (d.undo && d.undo.length) { d.redo = d.redo || []; d.redo.push(clone(d.adjust)); d.adjust = d.undo.pop(); d.previewUrl = null; setScreen('edit'); _refreshPreview(); } return; }
    if (label === '다시실행') { if (d.redo && d.redo.length) { d.undo = d.undo || []; d.undo.push(clone(d.adjust)); d.adjust = d.redo.pop(); d.previewUrl = null; setScreen('edit'); _refreshPreview(); } return; }
    if (label === '초기화') { if (typeof window.confirm === 'function' && !window.confirm('현재 보정을 초기화할까요?')) return; d.undo = d.undo || []; d.undo.push(clone(d.adjust)); d.adjust = newAdjust(); d.redo = []; d.previewUrl = null; setScreen('edit'); return; }
  }

  function applyBg(action) {
    var photo = curEditPhoto();
    if (!photo) { toast('사진이 없어요'); return; }
    if (!(window.WorkspaceAdapter && window.WorkspaceAdapter.applyWorkspaceBgAction)) { toast('배경 모듈을 불러오지 못했어요'); return; }
    var prev = d.bgAction;
    d.bgAction = action; d.bgBusy = true; d.bgFail = false; setScreen('edit');
    window.WorkspaceAdapter.applyWorkspaceBgAction({ src: photo.editedDataUrl || photo.dataUrl, action: action, color: d.bgColor, ratio: CROP_RATIO[d.tplPurpose] || 'original' })
      .then(function (r) {
        d.bgBusy = false;
        if (r && r.ok && r.dataUrl) { photo.editedDataUrl = r.dataUrl; d.previewUrl = null; d.bgFail = false; toast('배경 적용 완료'); setScreen('edit'); _refreshPreview(); }
        else { d.bgAction = prev; d.bgFail = true; d.bgFailMsg = (r && r.toast) || '배경 처리에 실패했어요'; toast(d.bgFailMsg); setScreen('edit'); }
      });
  }

  function bakeEdit() {
    var photo = curEditPhoto();
    var nonzero = photo && d.adjust && Object.keys(d.adjust).some(function (k) { return d.adjust[k]; });
    if (!photo || !nonzero) return Promise.resolve();
    var src = photo.editedDataUrl || photo.dataUrl;
    if (window.WorkspaceAdapter && window.WorkspaceAdapter.applyPixelAdjust) {
      return window.WorkspaceAdapter.applyPixelAdjust({ src: src, adjust: d.adjust }).then(function (r) {
        if (r && r.ok && r.dataUrl) { photo.editedDataUrl = r.dataUrl; photo.adjustments = clone(d.adjust); d.adjust = newAdjust(); d.previewUrl = null; }
        else { return _bakeCss(photo, src); }
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

  function reassignRoles() {
    d.photos.forEach(function (p, i) {
      if (d.baMode && i === 0) p.role = 'before';
      else if (d.baMode && i === 1) p.role = 'after';
      else p.role = 'hero';
    });
  }
  function syncCaptionFromDom() {
    var b = el.querySelector('[data-fl-capbody]'); if (b && b.getAttribute('data-empty') !== '1') d.caption = b.textContent.trim();
    var ig = el.querySelector('[data-fl-igcap]'); if (ig) ig.textContent = d.caption;
  }

  function back() {
    var i = SCREENS.indexOf(cur);
    if (i > 0) setScreen(SCREENS[i - 1]); else close();
  }
  function onCta() {
    var c = CTA[cur]; if (!c) return;
    if (cur === 'upload' && !d.photos.length && !d.textOnly) { toast('사진을 먼저 추가해 주세요.'); return; }
    if (c.to === '__save') return save();
    if (cur === 'caption') syncCaptionFromDom();
    if (cur === 'edit') { return bakeEdit().then(function () { setScreen(c.to); }); }
    setScreen(c.to);
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

  function pickCustomer() {
    if (!window.WorkspaceAdapter) { toast('고객 모듈을 불러오지 못했어요'); return; }
    window.WorkspaceAdapter.pickCustomer(d.customerId).then(function (r) {
      if (r.ok) {
        d.customerId = r.id; d.customerName = r.name; d.customerVc = r.vc || 0;
        setScreen('connect'); toast(r.name + ' 고객과 연결했어요.');
      } else if (r.toast) toast(r.toast);
    });
  }

  function buildSlot() {
    var slot = d.slot || { id: uid(), order: 0, createdAt: Date.now() };
    var now = Date.now();
    slot.label = d.customerName || slot.label || (d.service ? d.service.split(',')[0].trim() : '새 콘텐츠');
    slot.photos = d.photos.map(function (p) { return { id: p.id, dataUrl: p.dataUrl, editedDataUrl: p.editedDataUrl || null, role: p.role, cropMeta: p.cropMeta || null, updatedAt: now }; });
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
      captionMode: d.captionMode || 'normal',
      createdFrom: 'workspace_v2',
    });
    slot.captionMeta = {
      mode: d.captionMode || 'normal', length_tier: d.capLen || 'medium', tone_override: d.capTone || 'normal',
      generatedAt: d.caption ? ((slot.captionMeta && slot.captionMeta.generatedAt) || now) : null, log_id: d.logId || null,
    };
    slot.publish = Object.assign({ status: 'draft', instagramPreparedAt: null, publishedAt: null }, slot.publish, d.publish || {});
    return slot;
  }

  function save() {
    var slot = buildSlot();
    var done = function () {
      toast(d.customerName ? (d.customerName + ' 고객 기록에 저장했어요.') : '작업실에 저장했어요.');
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

  // [C6] 게시 — uploadProgressPopup 모달 사용, confirm() 제거
  function _showProgress(pct, msg) {
    var pop = document.getElementById('uploadProgressPopup'); if (!pop) return;
    pop.style.display = 'flex';
    if (typeof setUploadProgress === 'function') setUploadProgress(pct, msg);
  }
  function _hideProgress() {
    var pop = document.getElementById('uploadProgressPopup'); if (pop) pop.style.display = 'none';
  }
  function _showDone() {
    var pop = document.getElementById('uploadDonePopup'); if (!pop) return;
    pop.style.display = 'flex';
  }

  function publish() {
    if (!window.WorkspaceAdapter) return;
    if (!window.WorkspaceAdapter.instagram().connected) { toast('인스타 연결 후 올릴 수 있어요'); return; }
    if (d._publishing) return;
    syncCaptionFromDom();
    d._publishing = true;
    var slot = buildSlot();
    _showProgress(10, '저장 중…');
    Promise.resolve(window.WorkspaceAdapter.saveItem ? window.WorkspaceAdapter.saveItem(slot) : { ok: true }).then(function (sr) {
      if (!sr || !sr.ok) { d._publishing = false; _hideProgress(); toast('저장에 실패해 게시를 중단했어요'); return; }
      d.slot = slot;
      if (!window.WorkspaceAdapter.publishInstagramV2) {
        d._publishing = false; _hideProgress(); _markPrepared(); setScreen('preview'); toast('게시 준비 완료 — 업로드 기능을 불러오지 못했어요'); return;
      }
      _showProgress(40, '인스타에 업로드 중…');
      var cap = (d.caption || '') + (d.hashtags.length ? '\n\n' + d.hashtags.join(' ') : '');
      window.WorkspaceAdapter.publishInstagramV2({ slotId: slot.id, imageUrl: photoUrl(curPhoto()), caption: cap }).then(function (r) {
        d._publishing = false; r = r || {};
        _hideProgress();
        if (r.ok) {
          d.publish = d.publish || {}; d.publish.status = 'published'; d.publish.publishedAt = Date.now();
          _showDone(); toast('인스타그램에 올렸어요');
          if (window.WorkspaceV2 && window.WorkspaceV2.refresh) window.WorkspaceV2.refresh();
        } else if (r.reason === 'ambiguous') { _markPrepared(); toast('게시 준비 완료 — 업로드 결과 확인이 필요해요'); }
        else {
          var m = { not_connected: '인스타 연결이 필요해요', blob: '이미지 생성에 실패했어요', api: '업로드 API 호출에 실패했어요', server: '서버가 업로드를 거부했어요' }[r.reason] || '업로드에 실패했어요';
          toast(m);
        }
        setScreen('preview');
      });
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
  }

  function open(opts) {
    opts = opts || {};
    ensureEl();
    var slot = opts.slot || null;
    var wc = (slot && slot.workspaceContext) || null;
    var ctx = CAT_CTX[opts.cat] || {};
    var purpose = (wc && wc.templatePurpose) || ctx.purpose || 'feed';
    var capMode = (wc && wc.captionMode) || ctx.captionMode || 'normal';
    var cm = (slot && slot.captionMeta) || {};
    var hadRoles = !!(slot && slot.photos && slot.photos.some(function (p) { return p && p.role; }));
    d = {
      slot: slot,
      photos: slot && slot.photos ? slot.photos.map(function (p) { return { id: p.id || uid(), dataUrl: p.dataUrl, editedDataUrl: p.editedDataUrl, role: p.role || 'hero', cropMeta: p.cropMeta || null }; }) : [],
      baMode: purpose === 'before_after',
      template: null, tplCat: ctx.tplLabel || (wc && wc.type === 'before_after' ? '전후' : null),
      tplPurpose: purpose, captionMode: capMode, defaultRole: ctx.role || 'hero',
      textOnly: !!(opts.textOnly),
      service: slot && slot.service ? slot.service : '', caption: slot ? (slot.caption || '') : '', hashtags: slot && slot.hashtags ? String(slot.hashtags).split(/\s+/).filter(Boolean) : [], selectedHashes: [],
      customerId: slot ? (slot.customer_id || null) : null, customerName: slot ? (slot.customer_name || '') : '', customerVc: 0, custQuery: '',
      capLen: cm.length_tier || 'medium', capTone: cm.tone_override || 'normal', logId: cm.log_id || null,
      publish: (slot && slot.publish) ? Object.assign({}, slot.publish) : { status: 'draft', instagramPreparedAt: null, publishedAt: null },
      recent: [], recentLoaded: false, capLoading: false, capSeg: 'rec',
      simpleTool: null, editTab: 'basic', control: null, editIdx: null, adjust: newAdjust(), undo: [], redo: [], originalPreview: false, previewUrl: null, bgAction: null, bgColor: null, bgBusy: false, bgFail: false,
      captionAxes: null, captionTemplate: '',
    };
    if (d.photos.length && !hadRoles) reassignRoles();
    el.classList.add('is-open');
    // textOnly → 바로 게시글 화면으로
    var startScreen = opts.startScreen && SCREENS.indexOf(opts.startScreen) >= 0 ? opts.startScreen : 'upload';
    if (d.textOnly && startScreen === 'upload') startScreen = 'caption';
    setScreen(startScreen);
  }
  function close() { if (el) el.classList.remove('is-open'); }

  window.WorkspaceFlow = { open: open, close: close };
})();
