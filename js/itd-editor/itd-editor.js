/* itd-editor.js — 인스타 스토리식 사진 편집기 (Phase 2/3)
   window.ItdEditor.open({ photo, onDone(dataUrl), onCancel })
   도구: 텍스트 · 스티커 · 레이아웃(반달) · 그리기. 색은 --accent 토큰.
   설계: 레이어(텍스트/스티커)는 DOM, 그리기는 canvas. 완료 시 canvas 합성으로 dataURL. */
(function () {
  'use strict';
  if (window.ItdEditor) return;

  // 모두 OFL/오픈소스(Google Fonts) — 상업 사용 자유, 법적 문제 없음. index.html 의 fonts.googleapis 링크와 동기화.
  // family 는 작은따옴표 — HTML 속성(큰따옴표) 안 inline style 에 넣어도 안 깨지게(이전: 큰따옴표라 폰트 적용이 깨져 전부 같아 보였음).
  var FONTS = [
    { key: 'pretendard', label: '모던',  family: "Pretendard, sans-serif",      weight: 800 },
    { key: 'black',      label: '또렷',  family: "'Black Han Sans', sans-serif", weight: 400 },
    { key: 'jua',        label: '동글',  family: "'Jua', sans-serif",           weight: 400 },
    { key: 'dohyeon',    label: '진한',  family: "'Do Hyeon', sans-serif",      weight: 400 },
    { key: 'gothica1',   label: '깔끔',  family: "'Gothic A1', sans-serif",     weight: 800 },
    { key: 'serif',      label: '클래식', family: "'Noto Serif KR', serif",     weight: 700 },
    { key: 'songmyung',  label: '단정',  family: "'Song Myung', serif",         weight: 400 },
    { key: 'dodum',      label: '도톰',  family: "'Gowun Dodum', sans-serif",   weight: 400 },
    { key: 'gaegu',      label: '손글씨', family: "'Gaegu', cursive",           weight: 700 },
    { key: 'pen',        label: '감성',  family: "'Nanum Pen Script', cursive", weight: 400 },
    { key: 'gamja',      label: '귀염',  family: "'Gamja Flower', cursive",     weight: 400 },
    { key: 'himelody',   label: '하늘',  family: "'Hi Melody', cursive",        weight: 400 }
  ];
  var COLORS = ['#FFFFFF', '#15181D', '#BC6675', '#E08A6E', '#E6B45A', '#86B06E', '#6E9BC4', '#A98AC4'];
  // [#13] 무지개 스와치 — 탭하면 네이티브 색상 팔레트가 열려 원하는 색을 자유롭게 고른다(텍스트·도형·그리기·레이아웃 배경 공용).
  function _rbSw(target, cls) {
    return '<button type="button" class="' + (cls || 'itsw') + ' itsw--rb" data-colorpick="' + target + '" title="색 직접 고르기" aria-label="색 직접 고르기"></button>';
  }
  // [팔레트 통일 2026-07-27] 색 스와치 한 줄 렌더 — 텍스트/도형/그리기/배경 팔레트 공용(파일 내 중복 렌더 제거).
  function _swRow(colors, attr, cls, onIdx, extraCls) {
    return colors.map(function (c, i) {
      var x = extraCls ? (extraCls(c, i) || '') : '';
      return '<button type="button" class="' + cls + (i === onIdx ? ' on' : '') + (x ? ' ' + x : '') + '" ' + attr + '="' + c + '" style="background:' + c + '"></button>';
    }).join('');
  }
  // [스포이드] 파이펫 스와치 — 편집 중인 사진에서 색을 찍어 적용(EyeDropper API 미지원 모바일 대응, 자체 구현).
  function _pipSw(target, cls) {
    return '<button type="button" class="' + (cls || 'itsw') + ' itsw--pip" data-eyedrop="' + target + '" title="사진에서 색 추출" aria-label="사진에서 색 추출">' + IC.pipette + '</button>';
  }
  // [#13-v2] HSV 커스텀 색상 피커 — SV 사각형 + 색조 바(네이티브 대신 화면 안 팔레트).
  function _hsvToRgb(h, s, v) {
    var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }
  function _hsvToHex(h, s, v) { var a = _hsvToRgb(h, s, v); return '#' + a.map(function (n) { return ('0' + n.toString(16)).slice(-2); }).join('').toUpperCase(); }
  function _hexToHsv(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return { h: 0, s: 1, v: 1 };
    var n = parseInt(m[1], 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return { h: h, s: mx ? d / mx : 0, v: mx };
  }
  var _cpState = null;
  function _closeColorPicker() { if (_cpState && _cpState.el && _cpState.el.parentNode) _cpState.el.parentNode.removeChild(_cpState.el); _cpState = null; document.removeEventListener('pointerdown', _cpOutside, true); }
  function _cpOutside(e) { if (_cpState && _cpState.el && !_cpState.el.contains(e.target) && e.target !== _cpState.anchor) _closeColorPicker(); }
  function _openColorPicker(anchor, target) {
    _closeColorPicker();
    var cur = (target === 'text' ? (activeText() && activeText().color) : target === 'shape' ? S.shapeColor : target === 'draw' ? S.drawColor : target === 'cutbg' ? (S.photoBg && S.photoBg[S.adjSel] && S.photoBg[S.adjSel].color) : S.collageBg) || '#BC6675';
    var hsv = _hexToHsv(cur);
    var box = el('div', 'itcp');
    // [스크린샷 매칭] 사각형: X=색조(무지개) · Y=채도(위=진함, 아래=흰색). 오른쪽 세로바=밝기.
    box.innerHTML =
      '<div class="itcp__row">' +
        '<div class="itcp__sq" data-cp-sq><div class="itcp__dark" data-cp-dark></div><div class="itcp__sqt" data-cp-sqt></div></div>' +
        '<div class="itcp__val" data-cp-val><div class="itcp__valt" data-cp-valt></div></div>' +
      '</div>' +
      '<div class="itcp__foot"><span class="itcp__prev" data-cp-prev></span><span class="itcp__hex" data-cp-hex></span></div>';
    document.body.appendChild(box);   // body 고정 배치 — 패널/시트에 안 잘리게
    _cpState = { el: box, anchor: anchor, target: target, h: hsv.h, s: hsv.s, v: hsv.v };
    // 앵커 위(공간 없으면 아래)에 fixed 배치 — 화면 밖으로 안 나가게 클램프.
    var ar = anchor.getBoundingClientRect(), PW = 200, PH = 208;
    var left = Math.max(8, Math.min(ar.left + ar.width / 2 - PW / 2, window.innerWidth - PW - 8));
    var top = ar.top - PH - 8;
    if (top < 8) top = Math.min(ar.bottom + 8, window.innerHeight - PH - 8);
    box.style.left = left + 'px'; box.style.top = top + 'px';
    var sq = box.querySelector('[data-cp-sq]'), sqT = box.querySelector('[data-cp-sqt]'), dark = box.querySelector('[data-cp-dark]');
    var val = box.querySelector('[data-cp-val]'), valT = box.querySelector('[data-cp-valt]');
    var prev = box.querySelector('[data-cp-prev]'), hexEl = box.querySelector('[data-cp-hex]');
    sq.style.background = 'linear-gradient(to bottom,rgba(255,255,255,0),#fff),linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)';
    function paint() {
      dark.style.opacity = (1 - _cpState.v);   // 밝기 낮추면 사각형이 어두워짐
      sqT.style.left = (_cpState.h / 360 * 100) + '%'; sqT.style.top = ((1 - _cpState.s) * 100) + '%';
      val.style.background = 'linear-gradient(to bottom,' + _hsvToHex(_cpState.h, _cpState.s, 1) + ',#000)';
      valT.style.top = ((1 - _cpState.v) * 100) + '%';
      var hex = _hsvToHex(_cpState.h, _cpState.s, _cpState.v);
      sqT.style.background = hex; prev.style.background = hex; hexEl.textContent = hex;
      _colorPickApply(_cpState.target, hex);
    }
    function sqMove(e) { var r = sq.getBoundingClientRect(); _cpState.h = Math.max(0, Math.min(359.9, (e.clientX - r.left) / r.width * 360)); _cpState.s = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)); paint(); }
    function valMove(e) { var r = val.getBoundingClientRect(); _cpState.v = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)); paint(); }
    _cpDrag(sq, sqMove); _cpDrag(val, valMove);
    paint();
    setTimeout(function () { document.addEventListener('pointerdown', _cpOutside, true); }, 0);
  }
  function _cpDrag(elm, onMove) {
    elm.addEventListener('pointerdown', function (e) {
      e.preventDefault(); e.stopPropagation(); onMove(e);
      function mv(ev) { onMove(ev); }
      function up() { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); }
      document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
    });
  }
  function _colorPickApply(t, v) {
    if (t === 'text') { applyColor(v); if (root) root.querySelectorAll('[data-color]').forEach(function (x) { x.classList.remove('on'); }); }
    else if (t === 'shape') { S.shapeColor = v; if (refs.panels && refs.panels.shape) refs.panels.shape.querySelectorAll('[data-scolor]').forEach(function (x) { x.classList.remove('on'); }); applyShapeStyle(); }
    else if (t === 'draw') { S.drawColor = v; if (root) root.querySelectorAll('[data-dcolor]').forEach(function (x) { x.classList.remove('on'); }); }
    else if (t === 'layout') { S.collageBg = v; S.collageBgImg = null; saveBgPref(); if (refs.panels && refs.panels.layout) refs.panels.layout.querySelectorAll('[data-bg]').forEach(function (x) { x.classList.remove('on'); }); renderCollage(); applyFit(); recutWithBg(); }
    // [스포이드/무지개] 누끼 배경색 — 이미 누끼면 매트 캐시 0초 재합성만(recutWithBg). 아직 안 했으면 색만 기억(드래그 중 유료 누끼 API 연발 방지).
    else if (t === 'cutbg') { S.photoBg = S.photoBg || {}; S.photoBg[S.adjSel] = { color: v, img: null }; if (refs.adjCutBg) refs.adjCutBg.querySelectorAll('[data-cutbg],[data-cutbgimg]').forEach(function (x) { x.classList.remove('on'); }); applyFit(); recutWithBg(); }
  }
  /* ── [스포이드] 사진에서 색 추출 — 합성 스냅샷(exportComposite 재사용)의 픽셀을 getImageData 로 읽는다.
     전부 클라이언트 처리(서버 호출 0). 파이펫 탭 → 사진 터치/드래그로 미리보기 원 → 떼면 그 색 확정. ── */
  var _eyed = null;
  function _closeEyedrop() {
    if (!_eyed) return;
    if (_eyed.ov && _eyed.ov.parentNode) _eyed.ov.parentNode.removeChild(_eyed.ov);
    _eyed = null;
  }
  function _openEyedrop(target) {
    if (_eyed) { var same = _eyed.target === target; _closeEyedrop(); if (same) return; }   // 같은 파이펫 재탭 = 취소
    _closeColorPicker();
    exportComposite(function (url) {
      if (!url) { toastIt('사진 색을 읽지 못했어요'); return; }
      loadImg(url).then(function (im) {
        if (!im || !S || !root.classList.contains('is-open')) { if (!im) toastIt('사진 색을 읽지 못했어요'); return; }
        var cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
        var cx = cv.getContext('2d'); cx.drawImage(im, 0, 0);
        var ov = el('div', 'iteyed');
        ov.innerHTML = '<div class="iteyed__tip">사진을 눌렀다 떼면 그 색이 적용돼요</div><div class="iteyed__ring" data-eyering></div>';
        refs.stage.appendChild(ov);
        _eyed = { target: target, cv: cv, ctx: cx, ov: ov, ring: ov.querySelector('[data-eyering]'), hex: null, down: false };
        ov.addEventListener('pointerdown', _eyedMove);
        ov.addEventListener('pointermove', _eyedMove);
        ov.addEventListener('pointerup', _eyedPick);
        ov.addEventListener('pointercancel', _closeEyedrop);
      });
    });
  }
  function _eyedHexAt(e) {
    var r = refs.stage.getBoundingClientRect();
    var x = Math.max(0, Math.min(_eyed.cv.width - 1, Math.round((e.clientX - r.left) / (r.width || 1) * _eyed.cv.width)));
    var y = Math.max(0, Math.min(_eyed.cv.height - 1, Math.round((e.clientY - r.top) / (r.height || 1) * _eyed.cv.height)));
    var d = _eyed.ctx.getImageData(x, y, 1, 1).data;
    return '#' + [d[0], d[1], d[2]].map(function (n) { return ('0' + n.toString(16)).slice(-2); }).join('').toUpperCase();
  }
  function _eyedMove(e) {
    if (!_eyed) return;
    e.preventDefault(); e.stopPropagation();   // 스테이지 핀치·선택해제(selectLayer(null))로 안 새게
    if (e.type === 'pointerdown') { _eyed.down = true; try { _eyed.ov.setPointerCapture(e.pointerId); } catch (_) { void _; } }
    else if (!_eyed.down) return;   // 누른 채 이동만 추적(마우스 hover 제외)
    var r = refs.stage.getBoundingClientRect();
    _eyed.hex = _eyedHexAt(e);
    _eyed.ring.style.display = 'block';
    _eyed.ring.style.left = (e.clientX - r.left) + 'px';
    _eyed.ring.style.top = (e.clientY - r.top) + 'px';
    _eyed.ring.style.background = _eyed.hex;
  }
  function _eyedPick(e) {
    if (!_eyed || !_eyed.down) return;
    e.preventDefault(); e.stopPropagation();
    var hex = _eyed.hex || _eyedHexAt(e), t = _eyed.target;
    _closeEyedrop();
    _colorPickApply(t, hex);
  }
  var SHOP_STK = ['🌸', '✨', '💗', '🎀', '👑'];
  var EMOJI = ['💄', '💅', '🔥', '😍', '🥰', '💎', '🌟', '🫶', '💖', '🌿', '☁️', '🎉'];
  // [레이아웃 재설계] 셀 좌표 단일화(SSOT) — cells:[[x,y,w,h]…](0~1 비율).
  //   화면 렌더(renderCollage)와 내보내기(exportComposite)가 같은 좌표를 써 WYSIWYG 100% 보장.
  //   새 레이아웃은 cells 한 줄만 추가하면 됨. kind: single=단일 배경, grid=콜라주.
  var LAYOUTS = [
    { key: 'single', label: '1장',  kind: 'single', cells: [[0, 0, 1, 1]] },
    { key: 'v2',   label: '좌우',   kind: 'grid', cells: [[0, 0, .5, 1], [.5, 0, .5, 1]], pos: ['왼쪽', '오른쪽'] },
    { key: 'h2',   label: '상하',   kind: 'grid', cells: [[0, 0, 1, .5], [0, .5, 1, .5]], pos: ['위', '아래'] },
    { key: 'v3',   label: '세로 3', kind: 'grid', cells: [[0, 0, 1 / 3, 1], [1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 1 / 3, 1]], pos: ['왼쪽', '가운데', '오른쪽'] },
    { key: 'grid4', label: '4분할', kind: 'grid', cells: [[0, 0, .5, .5], [.5, 0, .5, .5], [0, .5, .5, .5], [.5, .5, .5, .5]], pos: ['좌상', '우상', '좌하', '우하'] },
    { key: 'l1r2', label: '1+2',   kind: 'grid', cells: [[0, 0, .5, 1], [.5, 0, .5, .5], [.5, .5, .5, .5]], pos: ['왼쪽 큰', '우상', '우하'] },
    { key: 't1b2', label: '2+1',   kind: 'grid', cells: [[0, 0, 1, .5], [0, .5, .5, .5], [.5, .5, .5, .5]], pos: ['위 큰', '좌하', '우하'] },
    { key: 'ba',   label: '전/후',  kind: 'grid', cells: [[0, 0, .5, 1], [.5, 0, .5, 1]], pos: ['BEFORE', 'AFTER'], ba: true }
  ];
  function isSingleL(L) { return !L || (L.kind || 'single') === 'single' || (L.cells && L.cells.length === 1); }
  function _layCells() { return (S.layout && S.layout.cells) || [[0, 0, 1, 1]]; }
  function _layN() { return _layCells().length; }
  function _layPosArr() { return (S.layout && S.layout.pos) || []; }
  // 레이아웃 타입 선택 칩용 미니 도형 썸네일(셀 좌표 그대로 그림)
  function _layThumbSvg(L) {
    var rects = (L.cells || [[0, 0, 1, 1]]).map(function (c) {
      return '<rect x="' + (c[0] * 22 + 1).toFixed(1) + '" y="' + (c[1] * 28 + 1).toFixed(1) + '" width="' + (c[2] * 22 - 2).toFixed(1) + '" height="' + (c[3] * 28 - 2).toFixed(1) + '" rx="1.4"/>';
    }).join('');
    return '<svg viewBox="0 0 24 30" width="24" height="30" aria-hidden="true">' + rects + '</svg>';
  }
  var BRUSHES = ['pen', 'marker', 'neon', 'eraser'];
  // [#8] 도형 — 편집 가능한 레이어로 삽입(드래그/회전/크기). 그리기와 달리 '한번 세팅하면 그대로 재사용'.
  var SHAPES = [
    { key: 'line', label: '선' }, { key: 'arrow', label: '화살표' },
    { key: 'rect', label: '사각형' },
    { key: 'round', label: '둥근사각' }, { key: 'circle', label: '원' }
  ];
  var STK_KEY = 'itdasy:itd_stickers';   // [#7] 내 스티커(업로드) 로컬 저장(무료, 클라이언트)

  function svg(path, sw) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 1.8) + '" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>'; }
  var IC = {
    x: svg('<path d="M18 6L6 18M6 6l12 12"/>'),
    // [2026-07-27] 텍스트 도구 — 'Aa' 라벨 → lucide type(T)을 둥근 네모로 감싼 아이콘
    text: svg('<rect x="3" y="3" width="18" height="18" rx="4.5"/><path d="M8 8.5h8M12 8.5V16"/>'),
    pipette: svg('<path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/>'),
    sticker: svg('<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4 4 0 0 0 7 0"/><circle cx="9" cy="10" r="1"/><circle cx="15" cy="10" r="1"/>'),
    layout: svg('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 9v12"/>'),
    draw: svg('<path d="M12 19l7-7-3-3-7 7-1 4 4-1z"/><path d="M16 8l3 3"/>'),
    alnL: svg('<path d="M4 6h16M4 12h10M4 18h13"/>'),
    alnC: svg('<path d="M4 6h16M7 12h10M6 18h12"/>'),
    alnR: svg('<path d="M4 6h16M10 12h10M7 18h13"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>'),
    loc: svg('<path d="M12 21s-7-5.2-7-10a7 7 0 0 1 14 0c0 4.8-7 10-7 10z"/><circle cx="12" cy="11" r="2.2"/>'),
    book: svg('<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/>'),
    price: svg('<path d="M20 12l-8 8-9-9V3h8l9 9z"/><circle cx="7.5" cy="7.5" r="1.3"/>'),
    time: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    phone: svg('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.1-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>'),
    pen: svg('<path d="M12 19l7-7-3-3-7 7-1 4 4-1z"/><path d="M16 8l3 3"/>'),
    marker: svg('<path d="M5 19h14"/><path d="M9 15l8-8 3 3-8 8H9v-3z"/>'),
    neon: svg('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>'),
    eraser: svg('<path d="M7 21h13"/><path d="M5 15l6-6 7 7-4 4H9l-4-4z"/>'),
    shape: svg('<rect x="3" y="3" width="11" height="11" rx="2"/><circle cx="16.5" cy="16.5" r="5"/>'),
    rs: svg('<path d="M21 15v6h-6M3 9V3h6M21 21l-7-7M3 3l7 7"/>', 2.2),
    upload: svg('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 20h16"/>'),
    adjust: svg('<path d="M4 7h11M19 7h1M4 12h3M11 12h9M4 17h7M15 17h5"/><circle cx="17" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="13" cy="17" r="2"/>'),
    addphoto: svg('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="9" cy="9" r="1.6"/>'),
    cut: svg('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.1 8.1 20 18M8.1 15.9 20 6"/>')
  };
  // [보정] 사진별 보정값 — CSS filter / canvas ctx.filter 동일 문법으로 라이브·내보내기 일치.
  function defAdj() { return { b: 100, c: 100, s: 100, w: 0, sh: 0, rot: 0 }; }
  function filterStr(a) {
    if (!a) return 'none';
    var con = (a.c + a.sh * 0.4) / 100;   // 선명도는 대비 가산 근사(canvas sharpen 미지원 대체)
    var f = 'brightness(' + (a.b / 100).toFixed(2) + ') contrast(' + con.toFixed(2) + ') saturate(' + (a.s / 100).toFixed(2) + ')';
    if (a.w > 0) f += ' sepia(' + (a.w / 100 * 0.45).toFixed(2) + ')';
    return f;
  }
  var ADJ_CTRLS = [
    { k: 'b', label: '밝기', min: 60, max: 140 }, { k: 'c', label: '대비', min: 60, max: 140 },
    { k: 's', label: '채도', min: 0, max: 200 }, { k: 'w', label: '온도', min: 0, max: 100 },
    { k: 'sh', label: '선명도', min: 0, max: 100 }
  ];

  // [#6] 오리지널 데코 스티커 — 직접 그린 SVG(저작권 안전). img(svg dataURL) 레이어로 올림.
  var DECO = (window.ItdDecos || []);   // [B-분할] 데코 스티커 데이터 → js/itd-editor/data/itd-decos.js

  var S = null;   // session state
  var root = null, refs = {};

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function build() {
    root = el('div', 'itded');
    root.innerHTML =
      '<div class="itded__stage" data-r="stage">' +
        '<div class="itded__photowrap" data-r="photowrap"><div class="itded__photo" data-r="photo"></div><div class="itded__photofx" data-r="photofx" hidden></div><div class="itded__collage" data-r="collage" hidden></div></div>' +
        '<div class="itded__scrim"></div>' +
        '<div class="itded__frame" data-r="frame"></div>' +
        '<canvas class="itded__draw" data-r="draw"></canvas>' +
        '<div class="itded__layers" data-r="layers"></div>' +
        '<div class="itded__grid" data-r="grid"></div>' +
      '</div>' +
      '<div class="itded__top">' +
        '<button class="itded__ic" data-r="cancel" aria-label="닫기">' + IC.x + '</button>' +
        '<div class="itded__hist">' +
          '<button class="itded__ic" data-r="undo" aria-label="되돌리기" disabled>' + svg('<path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 2.6-7.8L3 7"/>', 2.1) + '</button>' +
          '<button class="itded__ic" data-r="redo" aria-label="다시 실행" disabled>' + svg('<path d="M21 7v6h-6"/><path d="M21 13a9 9 0 1 1-2.6-7.8L21 7"/>', 2.1) + '</button>' +
          '<button class="itded__ic" data-r="peek" aria-label="사진 전체 보기">' + svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>', 2) + '</button>' +
        '</div>' +
        '<button class="itded__done" data-r="done">완료</button>' +
      '</div>' +
      '<div class="itded__rail" data-r="rail">' +
        '<button class="itrb" data-tool="text" aria-label="글자 추가">' + IC.text + '</button>' +
        '<button class="itrb" data-tool="adjust">' + IC.adjust + '</button>' +
        '<button class="itrb" data-tool="sticker">' + IC.sticker + '</button>' +
        // [요청4 2026-07-13] 레이아웃(상하좌우 등) 재선택 도구 제거 — 레이아웃은 업로드 직후 작업실 갤러리에서 이미 고름.
        //   브리지(_matchItdPreset)로 넘어온 콜라주는 renderCollage 가 그대로 그리므로 도구 버튼만 숨김(panel/selectLayout/renderCollage 로직은 보존).
        '<button class="itrb" data-tool="shape">' + IC.shape + '</button>' +
        '<button class="itrb" data-tool="draw">' + IC.draw + '</button>' +
      '</div>' +
      /* [2026-08-23] 레이어 순서 — 겹친 글자/도형을 앞뒤로 보낸다.
         레일에 끼우지 않고 **별도 줄**로 둔다: 레일은 '무엇을 추가할까'이고
         이건 '지금 고른 걸 어디로'라서 성격이 다르다. 선택이 없으면 버튼이 전부 꺼진다. */
      '<div class="itded__lyr" data-r="lyr">' +
        '<button class="itlyr" data-lyr="back" aria-label="맨 뒤로" title="맨 뒤로">' + svg('<path d="M4 8h10v10H4z"/><path d="M8 4h12v12"/>', 2) + '</button>' +
        '<button class="itlyr" data-lyr="down" aria-label="뒤로" title="뒤로">' + svg('<path d="M12 19V5"/><path d="M5 12l7 7 7-7"/>', 2.2) + '</button>' +
        '<button class="itlyr" data-lyr="up" aria-label="앞으로" title="앞으로">' + svg('<path d="M12 5v14"/><path d="M5 12l7-7 7 7"/>', 2.2) + '</button>' +
        '<button class="itlyr" data-lyr="front" aria-label="맨 앞으로" title="맨 앞으로">' + svg('<path d="M10 6h10v10H10z"/><path d="M4 16V4h12"/>', 2) + '</button>' +
      '</div>' +
      buildText() + buildAdjust() + buildSticker() + buildLayout() + buildShape() + buildDraw();
    document.body.appendChild(root);
    cacheRefs();
    wire();
    preloadFonts();   // [#6] 폰트칩이 각 폰트 디자인대로 보이도록 즉시 로드(지연/FOUT 방지)
  }
  // [#6] 칩에 쓰는 폰트를 강제 로드 — 안 그러면 첫 렌더 때 폴백되어 'Aa가'가 다 똑같아 보임.
  function preloadFonts() {
    if (!document.fonts || !document.fonts.load) return;
    FONTS.forEach(function (f) { try { document.fonts.load((f.weight || 700) + ' 16px ' + f.family); } catch (_) { void _; } });
  }

  function buildText() {
    var fonts = FONTS.map(function (f, i) {
      // [보스#4] '가나다'를 그 폰트 그대로 렌더(이름표 없음). family 는 작은따옴표라 큰따옴표 속성 안에서도 안 깨짐.
      var big = (f.key === 'pen' || f.key === 'gamja' || f.key === 'himelody' || f.key === 'gaegu') ? ';font-size:26px' : '';
      return '<button class="itfont' + (i === 0 ? ' on' : '') + '" data-font="' + f.key + '" aria-label="' + f.label + '" style="font-family:' + f.family + big + '">가나다</button>';
    }).join('');
    var colors = _swRow(COLORS, 'data-color', 'itsw', 0);
    // [2026-07-27] is-open 하드코딩 제거 — 폰트 패널은 기본 닫힘. Aa 탭/텍스트 레이어 선택 시에만 setTool 로 연다.
    return '<div class="itpanel ittext" data-panel="text">' +
        '<div class="itgrip itgrip--p" data-pgrip></div>' +
                '<div class="ittext__top">' +
          '<span class="italn" data-r="aln">' +
            '<button data-aln="left" class="on">' + IC.alnL + '</button>' +
            '<button data-aln="center">' + IC.alnC + '</button>' +
            '<button data-aln="right">' + IC.alnR + '</button>' +
          '</span>' +
          '<span class="itsize">크기<input type="range" min="0.5" max="8" step="0.02" value="1" data-r="size"></span>' +
        '</div>' +
        '<div class="itfonts" data-r="fonts">' + fonts + '</div>' +
        '<div class="itcolors" data-r="colors">' + colors + _rbSw('text', 'itsw') + _pipSw('text', 'itsw') + '</div>' +
      '</div>';
  }
  // [보정] 사진별 보정 패널 — 위 사진 스트립에서 사진 고르고 아래 슬라이더로 그 사진만 보정.
  function buildAdjust() {
    var sliders = ADJ_CTRLS.map(function (c) {
      return '<div class="itadj__row"><span>' + c.label + '</span>' +
        '<input type="range" min="' + c.min + '" max="' + c.max + '" step="1" data-adj="' + c.k + '">' +
        '<b data-adjout="' + c.k + '">0</b></div>';
    }).join('');
    return '<div class="itpanel itadj" data-panel="adjust">' +
        '<div class="itgrip itgrip--p" data-pgrip></div>' +
              '<div class="itadj__sub">보정할 사진을 고르세요</div>' +
      '<div class="itadj__strip" data-r="adjStrip"></div>' +
      '<div class="itadj__bgrow"><button class="itadj__bg" data-r="adjCut">' + IC.cut + ' 배경 지우기(누끼)</button>' +
        '<button class="itadj__bg itadj__bg--undo" data-r="adjUncut">원본</button></div>' +
      // [#4] 누끼 배경을 바로 옆에서 — 색 탭/사진 업로드. 한 번 누끼하면 색 변경은 0초(매트 캐시 재사용).
      // [2026-07-26 원영] 팔레트 A안 — 기본 한 줄(주요 6색+검정+업로드+최근)만, 나머지는 '+'(data-cutmore)로 펼치기.
      //   색이 두 줄로 줄바꿈되는 게 별로라는 피드백. 주요색 = BG_MAIN_IDX, 숨김색 = .itlaybg--x (open 시 표시).
      '<div class="itadj__cutbg" data-r="adjCutBg">' +
        _swRow(BG_COLORS, 'data-cutbg', 'itlaybg', 0, function (c, i) { return BG_MAIN_IDX.indexOf(i) < 0 ? 'itlaybg--x' : ''; }) +
        _rbSw('cutbg', 'itlaybg') + _pipSw('cutbg', 'itlaybg') +
        '<label class="itlaybg itlaybg--up" aria-label="배경 사진"><input type="file" accept="image/*" data-r="adjBgImg" hidden>' + IC.addphoto + '</label>' +
        // [#2] 최근 업로드 배경 재사용 스와치(있을 때만 보임)
        (function () { try { var rb = localStorage.getItem('itdasy:itd_bgimg'); return rb ? '<button class="itlaybg itlaybg--recent" data-cutbgimg="1" aria-label="최근 배경 재사용" style="background-image:url(\'' + rb + '\')"></button>' : ''; } catch (_e) { return ''; } })() +
        '<button class="itlaybg itlaybg--more" data-cutmore aria-label="색 더 보기">+</button>' +
      '</div>' +
      '<div class="itadj__row itadj__rotrow"><span>수평</span>' +
        '<input type="range" min="-15" max="15" step="0.5" value="0" data-r="adjRot"><b data-r="adjRotOut">0°</b></div>' +
      sliders +
      '<button class="itadj__reset" data-r="adjReset">이 사진 보정 초기화</button>' +
    '</div>';
  }
  // [#5] 스티커 시트 — 카테고리 탭 + 활성 탭 그리드 1개(탭 전환 = _renderStkTab).
  // [#10] '글자' 탭 제거 — 텍스트는 전용 Aa 도구로 넣음(스티커 글자와 중복). 배지는 '도형' 탭으로 이동.
  /* [2026-07-23 보스] 피그마 아이콘 플러그인으로 쓰던 공개 세트를 스티커 탭으로 편입.
     탭 목록은 itd-icon-stickers.js 가 정본 — 여기 하드코딩하지 않는다(세트가 늘면 그쪽만 고치면 됨).
     데이터가 아직 안 실렸으면(지연 로드) 기존 탭만 보인다 — 편집기는 그대로 동작한다. */
  var _ICS = window.ItdIconStickers || null;
  var STK_TABS = [['reco', '추천'], ['beauty', '뷰티'], ['cute', '귀여움'], ['mz', '트렌디']]
    .concat((_ICS && _ICS.tabs) ? _ICS.tabs : [])
    .concat([['deco', '도형'], ['my', '내 스티커']]);
  function buildSticker() {
    var tabs = STK_TABS.map(function (t, i) {
      return '<button type="button" class="itstk__tab' + (i === 0 ? ' on' : '') + '" data-sttab="' + t[0] + '">' + t[1] + '</button>';
    }).join('');
    return '<div class="itpanel" data-panel="sticker">' +
      '<div class="itstk" data-r="stkSheet">' +
        '<div class="itgrip itgrip--p" data-pgrip></div>' +   // [#3] 다른 패널과 동일한 큰 그립 → 아래로 긁으면 닫힘
        '<div class="itstk__tabs" data-r="stkTabs">' + tabs + '</div>' +
        '<div class="itstk__body" data-r="stkBody"></div>' +
      '</div></div>';
  }
  function _emGrid(arr) {
    return '<div class="itsgrid">' + (arr || []).map(function (s) { return '<button data-stk="' + s + '">' + s + '</button>'; }).join('') + '</div>';
  }
  function _svgGrid(cat, arr) {
    return '<div class="itsgrid">' + (arr || []).map(function (u, i) {
      return '<button class="itdeco" data-stkcat="' + cat + '" data-stkidx="' + i + '"><img src="' + u + '" alt="" draggable="false"></button>';
    }).join('') + '</div>';
  }
  function _recoChips() {
    // [2026-07-10] 기능 스티커(위치·예약·전화·가격·시간)는 '작업실 설정'으로 이관 — 편집기에서 완전 제거.
    //   입력은 작업실 홈 → 설정에서. 값은 캡션 `_shopCTA()` 가 글 끝에 붙인다.
    //   [출시 QA 2026-08-06] 도달 불가였던 addFeatureLayer/SHOP_INFO_KEY 도 함께 제거.
    return '';
  }
  // 활성 탭 그리드만 렌더 + 동적 refs 재캡처/바인딩(featLocTx·myStk·stkUpload).
  function _renderStkTab(key) {
    if (!refs.stkBody) return;
    var ST = window.ItdStickers || {};
    var html = '';
    if (key === 'reco') {
      var st = (localStorage.getItem('shop_type') || '').trim();
      var em = ST.shopEmojiByType && ST.shopEmojiByType[st];
      html = _recoChips() + _emGrid(em && em.length ? em.concat(ST.beautyEmoji || []) : (ST.beautyEmoji || EMOJI));
    } else if (key === 'beauty') {
      html = _emGrid(ST.beautyEmoji || EMOJI);
    } else if (key === 'cute') {
      html = _emGrid(ST.cuteEmoji || SHOP_STK);
    } else if (key === 'mz') {
      html = _emGrid(ST.mzEmoji || EMOJI);   // [#10] 깨진 moodSvg(폴라로이드·필름 등) 제거 — 에러박스/빈칸 원인
    } else if (_ICS && _ICS.tabSet && _ICS.tabSet[key]) {
      // 아이콘 세트 탭 — data URL SVG 그리드(도형 데코와 같은 렌더/삽입 경로 재사용)
      html = '<div class="itsgrid">' + (_ICS.sets[_ICS.tabSet[key]] || []).map(function (u, i) {
        return '<button class="itdeco" data-icstk="' + key + ':' + i + '"><img src="' + u + '" alt="" draggable="false"></button>';
      }).join('') + '</div>';
    } else if (key === 'deco') {
      // [#10] 도형 데코 + 배지(NEW/HOT/SALE 등, 옛 '글자' 탭에서 이동)
      html = '<div class="itsgrid">' + DECO.map(function (u, i) { return '<button class="itdeco" data-deco="' + i + '"><img src="' + u + '" alt="" draggable="false"></button>'; }).join('') + '</div>' +
        _svgGrid('badge', ST.badgeSvg);
    } else if (key === 'my') {
      html = '<div class="itssub itssub--row"><span>내 스티커</span>' +
        '<label class="itstk__up">' + IC.upload + '추가<input type="file" accept="image/*" data-r="stkUpload" hidden></label></div>' +
        '<div class="itsgrid itsgrid--my" data-r="myStk"></div>';
    }
    refs.stkBody.innerHTML = html;
    refs.stkBody.scrollTop = 0;
    refs.featLocTx = refs.stkBody.querySelector('[data-r="featLocTx"]');
    refs.myStk = refs.stkBody.querySelector('[data-r="myStk"]');
    refs.stkUpload = refs.stkBody.querySelector('[data-r="stkUpload"]');
    if (refs.featLocTx) refs.featLocTx.textContent = S.shopName || '우리샵';
    if (refs.stkUpload) refs.stkUpload.addEventListener('change', function () { var fl = refs.stkUpload.files && refs.stkUpload.files[0]; if (fl) addMyStickerFromFile(fl); refs.stkUpload.value = ''; });
    if (refs.myStk) renderMyStickers();
    enableDragScroll(refs.stkBody.querySelector('.itfstk'));
  }
  // 캘리 글자 스티커 → 손글씨 폰트 텍스트 레이어(SVG-img는 웹폰트 불가 → 텍스트로).
  function addTextSticker(text, fontKey) {
    var L = makeLayer('text');
    L.font = fontByKey(fontKey) || FONTS[0]; L.color = COLORS[0]; L.align = 'center'; L.fontSize = 40; L.text = text; L.shadow = true;
    var t = el('div', 'itl-text'); t.textContent = text;
    t.style.cssText = 'font-family:' + L.font.family + ';font-weight:' + L.font.weight + ';color:' + L.color + ';text-align:center;font-size:' + L.fontSize + 'px;white-space:pre;text-shadow:0 2px 8px rgba(0,0,0,.35)';
    L.el.appendChild(t); L.tx = t;
    placeCenter(L, 200, 60); selectLayer(L);
    _pushOp({ op: 'add', L: L });
    closeStickerSheet();
    return L;
  }
  // [#8] 도형 패널(하단바) — 선/사각형/둥근사각/원 + 채움 토글 + 굵기 + 색.
  function buildShape() {
    var chips = SHAPES.map(function (s) {
      return '<button class="itshp" data-shape="' + s.key + '" aria-label="' + s.label + '"><span class="itshp__ic itshp__ic--' + s.key + '"></span><em>' + s.label + '</em></button>';
    }).join('');
    var colors = _swRow(COLORS, 'data-scolor', 'itscw', 2);
    return '<div class="itpanel itshape" data-panel="shape">' +
        '<div class="itgrip itgrip--p" data-pgrip></div>' +
              '<div class="itshape__row">' + chips + '</div>' +
      '<div class="itshape__opts">' +
        '<span class="itshape__fill" data-r="shapeFill"><button data-shapefill="0" class="on">선만</button><button data-shapefill="1">채움</button></span>' +
        '<span class="itshape__thick">굵기<input type="range" min="2" max="26" step="1" value="6" data-r="shapeThick"></span>' +
      '</div>' +
      '<div class="itshape__colors">' + colors + _rbSw('shape', 'itscw') + '</div>' +
    '</div>';
  }
  // [레이아웃 재설계] 도형 미니썸네일 피커(LAYOUTS 그대로) + 렌더된 사진을 순서대로 탭해 자리에 채움.
  var BG_COLORS = ['#FFFFFF', '#FBF7F5', '#F4E9E4', '#E8D3C2', '#F2D7DE', '#E6C9D2', '#D9B8C4', '#BC6675', '#E08A6E', '#E6B45A', '#BFD0C4', '#A7C4B5', '#9DB7C9', '#C9C2E0', '#7A6E78', '#2C2226', '#15181D'];
  // [2026-07-26 원영] 팔레트 A안 — 기본 노출 주요색 인덱스(흰색·크림 2·로즈핑크 2·브랜드 로즈·검정). 나머지는 '+' 펼치기.
  var BG_MAIN_IDX = [0, 1, 2, 4, 5, 7, 16];
  function buildLayout() {
    var chips = LAYOUTS.map(function (L, idx) {
      return '<button class="itlaytype' + (idx === 0 ? ' on' : '') + '" data-lay="' + idx + '" aria-label="' + L.label + '">' +
        '<span class="itlaytype__d">' + _layThumbSvg(L) + '</span><em>' + L.label + '</em></button>';
    }).join('');
    var bg = _swRow(BG_COLORS, 'data-bg', 'itlaybg', 0);
    return '<div class="itpanel itlay2" data-panel="layout">' +
        '<div class="itgrip itgrip--p" data-pgrip></div>' +
      '<div class="itlay2__types">' + chips + '</div>' +
      '<div class="itlay2__hint" data-r="layHint"></div>' +
      '<div class="itlay2__strip" data-r="layStrip"></div>' +
      '<div class="itlay2__ctrls">' +
        '<span class="itlay2__fit" data-r="layFit"><button data-fit="cover">꽉 채움</button><button data-fit="contain" class="on">전체</button></span>' +
        '<span class="itlay2__gap">간격<input type="range" min="0" max="24" step="1" value="3" data-r="layGap"></span>' +
        '<span class="itlay2__bg">' + bg + _rbSw('layout', 'itlaybg') + '</span>' +
        '<label class="itlay2__add itlay2__bgimg">' + IC.addphoto + '배경<input type="file" accept="image/*" data-r="layBgImg" hidden></label>' +
        '<label class="itlay2__add">' + IC.addphoto + '사진<input type="file" accept="image/*" data-r="layAdd" hidden></label>' +
      '</div>' +
    '</div>';
  }
  var BRUSH_LABEL = { pen: '펜', marker: '형광펜', neon: '네온', eraser: '지우개' };
  // [#6] 그리기 패널 — 하단 시트로 명확화(세로 슬라이더/아이콘만 지우기 → 라벨 붙은 붓·굵기·색·전체지우기).
  function buildDraw() {
    var brushes = BRUSHES.map(function (b, i) {
      return '<button class="itbrush2' + (i === 0 ? ' on' : '') + '" data-brush="' + b + '" aria-label="' + (BRUSH_LABEL[b] || b) + '">' + IC[b] + '<em>' + (BRUSH_LABEL[b] || b) + '</em></button>';
    }).join('');
    var colors = _swRow(COLORS, 'data-dcolor', 'itdsw', 2);
    return '<div class="itpanel itdrawp" data-panel="draw">' +
      '<div class="itgrip itgrip--p" data-pgrip></div>' +
      '<div class="itdrawp__tools">' + brushes +
        '<button class="itdrawp__clear" data-r="drawClear">' + svg('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>', 2) + '전체 지우기</button></div>' +
      '<div class="itdrawp__size"><span class="itdrawp__lbl">굵기</span><input type="range" min="3" max="40" step="1" value="10" data-r="brushSize"></div>' +
      '<div class="itdrawp__colors">' + colors + _rbSw('draw', 'itdsw') + _pipSw('draw', 'itdsw') + '</div>' +
    '</div>';
  }

  function cacheRefs() {
    ['stage', 'photowrap', 'photo', 'photofx', 'collage', 'frame', 'draw', 'layers', 'rail', 'cancel', 'done', 'aln', 'size', 'fonts', 'colors', 'stkSheet', 'layHint', 'layStrip', 'layGap', 'layAdd', 'brushSize', 'featLocTx', 'myStk', 'stkUpload', 'stkTabs', 'stkBody', 'shapeThick', 'adjStrip', 'adjReset', 'adjRot', 'adjRotOut', 'grid', 'adjCut', 'adjUncut', 'adjCutBg', 'adjBgImg', 'layFit', 'layBgImg', 'undo', 'redo', 'peek', 'drawClear', 'addText'].forEach(function (k) {
      refs[k] = root.querySelector('[data-r="' + k + '"]');
    });
    refs.panels = {};
    root.querySelectorAll('[data-panel]').forEach(function (p) { refs.panels[p.getAttribute('data-panel')] = p; });
    refs.ctx = refs.draw.getContext('2d');
  }

  /* ── 도구 전환 ── */
  function setTool(tool, _noAuto) {
    _closeEyedrop();   // [스포이드] 도구 바꾸면 색 추출 모드 해제
    S.tool = tool;
    root.querySelectorAll('.itrb').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tool') === tool); });
    Object.keys(refs.panels).forEach(function (k) { refs.panels[k].classList.toggle('is-open', k === tool); });
    var drawing = tool === 'draw', inLayout = tool === 'layout';
    refs.draw.classList.toggle('is-armed', drawing);
    refs.draw.style.zIndex = drawing ? '5' : '3';
    // [셀 크롭] 레이아웃 도구에선 콜라주 칸이 포인터를 받게(레이어/캔버스 아래로) → 칸 드래그/핀치 재구도
    refs.draw.style.pointerEvents = inLayout ? 'none' : 'auto';
    // [#3] 레이아웃 중에도 텍스트/스티커는 이동·선택 가능해야(레이어는 콜라주 위). 칸 크롭은 레이어 없는 빈 곳에서.
    refs.layers.style.pointerEvents = drawing ? 'none' : '';
    refs.collage.classList.toggle('is-cropping', inLayout);
    // [#4] Aa 탭 — 텍스트가 '선택된' 상태면 새로 안 만들고 패널만. 아무것도 선택 안 됐을 때만 새 텍스트.
    if (tool === 'text' && !_noAuto && !(S.active && S.active.type === 'text')) addText();   // [#1] open 초기엔 _noAuto — '내용을 입력하세요' 자동생성 안 함(Aa 탭에서만 생성)
    if (tool === 'layout') { renderLayoutStrip(); renderLayoutHint(); }
    if (tool === 'sticker' && refs.stkBody && !refs.stkBody.innerHTML) _renderStkTab('reco');   // [#5] 첫 진입 시 추천 탭
    if (tool === 'adjust') renderAdjust();
    if (S && S._peek) { S._peek = false; if (refs.peek) refs.peek.classList.remove('on'); }   // [P2-2] 도구 바꾸면 전체보기 해제
    fitStageToRatio();   // [P2-2] 패널 열림/닫힘에 맞춰 스테이지 위로/가운데 재배치
  }
  // [P2-2] '사진 전체 보기' — 패널을 잠깐 내려 사진 전체 확인(편집 상태 유지).
  function togglePeek() {
    if (!S) return;
    S._peek = !S._peek;
    root.classList.toggle('itded--peek', S._peek);
    if (refs.peek) refs.peek.classList.toggle('on', S._peek);
    fitStageToRatio();
  }

  /* ── 레이어 공통(드래그) ── */
  function makeLayer(type) {
    var box = el('div', 'itl');
    box.innerHTML = '<button class="itl__del">' + svg('<path d="M18 6L6 18M6 6l12 12"/>', 2.4) + '</button>' +
      '<button class="itl__dup" aria-label="복제">' + svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>', 2.1) + '</button>' +
      '<button class="itl__rot">' + svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>', 2.2) + '</button>' +
      '<button class="itl__rs">' + IC.rs + '</button>';
    var L = { type: type, el: box, x: 0, y: 0, scale: 1, rot: 0 };
    box.addEventListener('pointerdown', function (e) { onLayerDown(e, L); });
    // [#8b] 삭제/복제 핸들은 몸통과 겹쳐 있어, 몸통을 탭하면 그 위의 ×가 눌려 레이어가 사라지곤 했다.
    //   → 핸들에 '직접 pointerdown' 한 경우에만 동작(arm). 몸통 pointerdown(onLayerDown)은 disarm.
    var _delB = box.querySelector('.itl__del');
    _delB.addEventListener('pointerdown', function (e) { e.stopPropagation(); L._delArmed = true; });
    _delB.addEventListener('click', function (e) { e.stopPropagation(); if (!L._delArmed) return; L._delArmed = false; removeLayer(L, true); });
    var _dupB = box.querySelector('.itl__dup');
    _dupB.addEventListener('pointerdown', function (e) { e.stopPropagation(); L._dupArmed = true; });
    _dupB.addEventListener('click', function (e) { e.stopPropagation(); if (!L._dupArmed) return; L._dupArmed = false; duplicateLayer(L); });
    var _rotB = box.querySelector('.itl__rot'); _rotB.addEventListener('pointerdown', function (e) { onRotDown(e, L); });
    var _rsB = box.querySelector('.itl__rs'); _rsB.addEventListener('pointerdown', function (e) { onRsDown(e, L); });
    // [#8] 핸들(× 복사 회전 크기)은 레이어가 커져도 아이콘 크기가 커지면 안 됨 → applyXf에서 역스케일.
    L._handles = [_delB, _dupB, _rotB, _rsB];
    // [2026-07-26 원영] 텍스트 전용 '가로 늘리기' 핸들(우측 중앙, ⟷) — 폭(L.wrapW)을 정하면
    //   white-space:pre-wrap 고정폭으로 전환돼 그 폭에서 자동 줄바꿈. 다른 핸들 위치는 그대로(모서리 고정).
    if (type === 'text') {
      var _wB = el('button', 'itl__w');
      _wB.innerHTML = svg('<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>', 2.2);
      _wB.setAttribute('aria-label', '가로 늘리기');
      _wB.addEventListener('pointerdown', function (e) { onWDown(e, L); });
      box.appendChild(_wB); L._handles.push(_wB);
    }
    refs.layers.appendChild(box);
    S.layers.push(L);
    return L;
  }
  function placeCenter(L, w, h) {
    var r = refs.stage.getBoundingClientRect();
    L.x = r.width / 2 - (w || L.el.offsetWidth) / 2;
    L.y = r.height / 2 - (h || L.el.offsetHeight) / 2;
    applyXf(L);
  }
  function applyXf(L) {
    // [#10 2026-07-18] 도형(선/사각/원)은 box 크기(w/h)를 직접 가져 '늘리기'(비균등)를 지원한다.
    //   텍스트·스티커·이미지는 예전대로 균등 scale. w/h 가 있는 도형은 box 를 그 크기로 고정하고
    //   scale 은 1 로 둔다(둘을 곱하면 이중 확대라 예측 불가).
    if (L.type === 'shape' && L.w != null && L.h != null) {
      L.el.style.width = L.w + 'px'; L.el.style.height = L.h + 'px';
    }
    L.el.style.transform = 'translate(' + L.x + 'px,' + L.y + 'px) rotate(' + (L.rot || 0) + 'deg) scale(' + L.scale + ')';
    // [#8] 레이어가 커져도 조작 버튼(× 복사 회전 크기)은 화면상 같은 크기 유지 → 역스케일.
    if (L._handles) {
      var inv = 1 / (L.scale || 1);
      for (var _i = 0; _i < L._handles.length; _i++) { L._handles[_i].style.transform = 'scale(' + inv + ')'; }
    }
  }
  // [#2] 직각 자석 — 0·90·180·270 근처(±7°)면 딱 맞춤(수직/수평 느낌으로 중력이 잡아주듯).
  function snapAngle(deg) {
    var n = Math.round(deg / 90) * 90;
    return Math.abs(deg - n) <= 7 ? n : deg;
  }
  var rotd = null;
  function onRotDown(e, L) {
    e.preventDefault(); e.stopPropagation(); selectLayer(L);
    var b = L.el.getBoundingClientRect();
    rotd = { L: L, cx: b.left + b.width / 2, cy: b.top + b.height / 2, start: (L.rot || 0), a0: Math.atan2(e.clientY - (b.top + b.height / 2), e.clientX - (b.left + b.width / 2)) };
    try { e.target.setPointerCapture(e.pointerId); } catch (_) { void _; }
  }
  // 크기조절 핸들 — 중심에서의 거리 비율로 scale 조정(모든 레이어 공통).
  var rsd = null;
  function onRsDown(e, L) {
    e.preventDefault(); e.stopPropagation(); selectLayer(L);
    var b = L.el.getBoundingClientRect(); var cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    // [#10] 도형은 '늘리기'(비균등 box 크기), 그 외는 예전대로 균등 scale.
    var isShape = L.type === 'shape' && L.w != null && L.h != null;
    rsd = { L: L, cx: cx, cy: cy, d0: Math.max(8, Math.hypot(e.clientX - cx, e.clientY - cy)), s0: (L.scale || 1),
      shape: isShape, sx: e.clientX, sy: e.clientY, w0: L.w, h0: L.h, x0: L.x, y0: L.y, before: isShape ? { w: L.w, h: L.h, x: L.x, y: L.y } : null };
    try { rsd._serSnap = _serLayer(L); } catch (_rs) { void _rs; rsd._serSnap = null; }   // [T8-H+ V2] 정규화 기준
    try { e.target.setPointerCapture(e.pointerId); } catch (_) { void _; }
  }
  // [2026-07-26 원영] 텍스트 가로 늘리기 — 폭을 정하면 pre-wrap 고정폭(그 폭에서 자동 줄바꿈),
  //   해제(wrapW=null)면 원래 pre(엔터만 줄바꿈)로 복귀. 복제·undo 도 이 함수 하나로 상태 적용.
  function _applyWrap(L) {
    if (!L || !L.tx) return;
    if (L.wrapW) {
      L.tx.style.whiteSpace = 'pre-wrap'; L.tx.style.wordBreak = 'keep-all';
      L.tx.style.overflowWrap = 'anywhere'; L.tx.style.width = L.wrapW + 'px';
    } else {
      L.tx.style.whiteSpace = 'pre'; L.tx.style.wordBreak = ''; L.tx.style.overflowWrap = ''; L.tx.style.width = '';
    }
  }
  var wd = null;
  function onWDown(e, L) {
    e.preventDefault(); e.stopPropagation(); selectLayer(L);
    wd = { L: L, sx: e.clientX, sy: e.clientY, w0: L.wrapW || (L.tx ? L.tx.offsetWidth : 100), before: { wrapW: L.wrapW || null } };
    try { wd._serSnap = _serLayer(L); } catch (_ws) { void _ws; wd._serSnap = null; }   // [T8-H+ V2] 정규화 기준
    try { e.target.setPointerCapture(e.pointerId); } catch (_) { void _; }
  }
  function selectLayer(L) {
    var wasActive = S.active === L;
    S.active = L;
    S.layers.forEach(function (x) { x.el.classList.toggle('is-active', x === L); });
    // [#8b] 새로 선택된 순간엔 삭제/복제 핸들 클릭을 잠깐 막는다 — 선택시키는 그 탭이 방금 나타난 ×를 눌러 사라지던 것 방지(타이밍 무관 방어).
    if (L && !wasActive && L.el) { L.el.classList.add('itl--guard'); clearTimeout(L._guardT); L._guardT = setTimeout(function () { try { L.el.classList.remove('itl--guard'); } catch (_e) { void _e; } }, 320); }
    // [2026-07-27] 폰트 패널 조건부 노출 — 텍스트 레이어 선택 시에만 열고, 선택 해제/다른 레이어면 닫는다(기존 setTool/_closeToolPanel 재사용).
    if (L && L.type === 'text') { syncTextControls(L); if (S.tool !== 'text') setTool('text', true); }
    else if (S.tool === 'text') _closeToolPanel();
    _syncLayerBtns();
  }
  /* [2026-08-23] 레이어 순서 — 앞/뒤로 보내기.
     🔑 `S.layers` 배열 순서와 DOM 순서를 **함께** 옮긴다. 하나만 바꾸면
        화면과 발행본이 어긋난다(굽기는 배열 순서로, 화면은 DOM 순서로 그린다).
     핸들을 더 늘리지 않고 기존 도구 패널에 둔다 — 좁은 화면에서 핸들이 서로 겹친다. */
  function reorderLayer(L, dir) {
    if (!L || !S) return false;
    var i = S.layers.indexOf(L);
    if (i < 0) return false;
    var to = dir === 'front' ? S.layers.length - 1
      : dir === 'back' ? 0
        : dir === 'up' ? Math.min(S.layers.length - 1, i + 1)
          : Math.max(0, i - 1);
    if (to === i) return false;
    S.layers.splice(i, 1); S.layers.splice(to, 0, L);
    // DOM 도 같은 순서로 다시 붙인다 — 배열이 진실이고 DOM 이 따라간다
    try { S.layers.forEach(function (x) { if (x.el) refs.layers.appendChild(x.el); }); }
    catch (_e) { void _e; }
    _syncLayerBtns();
    return true;
  }
  function _syncLayerBtns() {
    try {
      var L = S && S.active, i = L ? S.layers.indexOf(L) : -1, n = S ? S.layers.length : 0;
      ['up', 'front'].forEach(function (k) {
        var b = root.querySelector('[data-lyr="' + k + '"]');
        if (b) b.disabled = !(L && i >= 0 && i < n - 1);
      });
      ['down', 'back'].forEach(function (k) {
        var b = root.querySelector('[data-lyr="' + k + '"]');
        if (b) b.disabled = !(L && i > 0);
      });
    } catch (_e) { void _e; }
  }

  function removeLayer(L, track) {
    var i = S.layers.indexOf(L); if (i >= 0) S.layers.splice(i, 1);
    L.el.remove(); if (S.active === L) S.active = null;
    if (track) { _pushOp({ op: 'del', L: L, idx: i }); _showDeleteToast(); }   // [P1-3] 실수 삭제 되돌리기 + [5차] 안내 토스트
  }
  // [5차] 실수 삭제 구제 — × 오탭 즉시삭제가 아무 안내 없이 사라지던 것. 지운 직후 "지웠어요 · 되돌리기"(3초).
  //   되돌리기 = 기존 _undo()(del op 가 undo 스택에 이미 쌓임 — 새 복원 로직 안 만듦). 편집기 자체 구현(워크스페이스 토스트 의존 X).
  var _delToastT = null;
  function _showDeleteToast() {
    if (!root) return;
    var t = root.querySelector('.itl-deltoast');
    if (!t) {
      t = el('div', 'itl-deltoast');
      var lbl = el('span', 'itl-deltoast__t'); lbl.textContent = '지웠어요';
      var btn = el('button', 'itl-deltoast__u'); btn.type = 'button'; btn.textContent = '되돌리기';
      t.appendChild(lbl); t.appendChild(btn);
      root.appendChild(t);
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        clearTimeout(_delToastT);
        t.classList.remove('is-show');
        _undo();
      });
    }
    // 연속 삭제 시 최신 것 하나만 — 타이머 리셋
    clearTimeout(_delToastT);
    t.classList.add('is-show');
    _delToastT = setTimeout(function () { try { t.classList.remove('is-show'); } catch (_e) { void _e; } }, 3000);
  }
  // [P1-3] 구조적 undo/redo — 추가/삭제/복제만 추적(실제 DOM 노드 보존, 재생성 안 함 → 안전).
  //   이동·색변경 등 속성 변화는 드래그로 쉽게 재조정 가능하므로 제외. 가장 치명적인 '실수 삭제'를 확실히 커버.
  function _pushOp(op) { if (!S.undo) S.undo = []; S.undo.push(op); S.redo = []; if (S.undo.length > 40) S.undo.shift(); _syncHist(); }
  function _applyInverse(op, undo) {
    // [#9] 누끼/원본(사진 교체)도 되돌리기(↩)로 되돌린다 — 예전엔 undo 스택 밖이라 ↩가 무반응이었음.
    if (op.op === 'photo') {
      var st = undo ? op.before : op.after, pi = op.idx;
      S.photos[pi] = st.url; S.cutSet = S.cutSet || {}; S.cutSet[pi] = !!st.cut;
      if (isSingleL(S.layout) && pi === S.adjSel) { S.photoUrl = st.url; S.photoCss = 'url("' + st.url + '")'; if (refs.photo) refs.photo.style.backgroundImage = S.photoCss; }
      renderAdjust(); renderLayoutStrip(); renderCollage(); applyAdjToDisplay();
      return;
    }
    // [#9] 레이어 이동 되돌리기 — DOM 재생성 없이 x/y 만 원위치로(안전).
    if (op.op === 'move') {
      var mv = undo ? op.before : op.after;
      if (op.L) { op.L.x = mv.x; op.L.y = mv.y; applyXf(op.L); selectLayer(op.L); }
      return;
    }
    // [#10] 도형 늘리기 되돌리기 — w/h/x/y 복원.
    if (op.op === 'resize') {
      var rz = undo ? op.before : op.after;
      if (op.L) { op.L.w = rz.w; op.L.h = rz.h; if (rz.x != null) op.L.x = rz.x; if (rz.y != null) op.L.y = rz.y; applyXf(op.L); selectLayer(op.L); }
      return;
    }
    // [2026-07-26 원영] 텍스트 가로 늘리기(wrapW) 되돌리기.
    if (op.op === 'wrap') {
      var wz = undo ? op.before : op.after;
      if (op.L) { op.L.wrapW = wz.wrapW || null; _applyWrap(op.L); applyXf(op.L); selectLayer(op.L); }
      return;
    }
    // [#9] 셀 크롭(콜라주 칸 안 사진 위치) 되돌리기.
    if (op.op === 'cellcrop') {
      var cc = undo ? op.before : op.after;
      S.cellCrop = S.cellCrop || [];
      S.cellCrop[op.k] = { s: cc.s, tx: cc.tx, ty: cc.ty };
      applyCrop(op.k);
      return;
    }
    // [T4] 작업 기억 한 덩어리 — wmApply(자동 적용) / wmRemove('이번엔 빼기'). 여러 레이어를 op 1개로:
    //   undo 한 번이면 전부 원복돼야 하고, 레이어별로 undo 가 여러 번 생기면 안 된다(합의 조건 2).
    if (op.op === 'wmApply' || op.op === 'wmRemove') {
      var det = (op.op === 'wmApply') ? undo : !undo;   // det=true → 떼기, false → 붙이기
      (op.Ls || []).forEach(function (WL) {
        if (det) { var wi = S.layers.indexOf(WL); if (wi >= 0) S.layers.splice(wi, 1); if (WL.el) WL.el.remove(); if (S.active === WL) S.active = null; }
        else { if (refs.layers && WL.el) refs.layers.appendChild(WL.el); if (S.layers.indexOf(WL) < 0) S.layers.push(WL); }
      });
      return;
    }
    var add = (op.op === 'add') === undo;   // undo: add→제거, del→복원 / redo: 반대
    if (add) { if (refs.layers && op.L.el) refs.layers.appendChild(op.L.el); if (S.layers.indexOf(op.L) < 0) { var at = (op.idx != null && op.idx <= S.layers.length) ? op.idx : S.layers.length; S.layers.splice(at, 0, op.L); } selectLayer(op.L); }
    else { var i = S.layers.indexOf(op.L); if (i >= 0) S.layers.splice(i, 1); op.L.el.remove(); if (S.active === op.L) S.active = null; }
  }
  function _undo() { if (!S.undo || !S.undo.length) return; var op = S.undo.pop(); _applyInverse(op, true); S.redo = S.redo || []; S.redo.push(op); _syncHist(); }
  function _redo() { if (!S.redo || !S.redo.length) return; var op = S.redo.pop(); _applyInverse(op, false); S.undo = S.undo || []; S.undo.push(op); _syncHist(); }
  function _syncHist() {
    if (refs.undo) refs.undo.disabled = !(S.undo && S.undo.length);
    if (refs.redo) refs.redo.disabled = !(S.redo && S.redo.length);
  }
  // [P1-3] 선택 레이어 복제 — 내용 DOM 노드를 그대로 복제(스타일 보존) + 데이터 복사, 18px 오프셋.
  function duplicateLayer(L) {
    if (!L) L = S.active; if (!L) return;
    var c = makeLayer(L.type);
    // [#3] 도형 굵기(strokeW)는 예전에 빠져 있어(엉뚱한 'thick' 키만 복사) 복제본이 '얇게 하기 전' 굵기로 나왔다.
    ['font', 'color', 'align', 'fontSize', 'text', 'role', 'stroke', 'shadow', 'badge', 'emoji', 'src', 'shape', 'fill', 'strokeW', 'thick', 'fontSizePx', 'w', 'h', 'radius', 'wrapW'].forEach(function (k) { if (L[k] !== undefined) c[k] = L[k]; });
    if (L.tx) { var node = L.tx.cloneNode(true); node.removeAttribute('contenteditable'); c.el.appendChild(node); c.tx = node; }
    // [#3] 도형은 복제한 DOM을 현재 strokeW/색/채움으로 다시 칠해 원본과 100% 일치시킨다.
    if (c.type === 'shape' && c.tx) { try { styleShape(c.tx, c); } catch (_e) { void _e; } }
    c.x = (L.x || 0) + 18; c.y = (L.y || 0) + 18; c.scale = L.scale || 1; c.rot = L.rot || 0;
    applyXf(c); selectLayer(c);
    _pushOp({ op: 'add', L: c });
  }
  var drag = null, lpinch = null;
  function onLayerDown(e, L) {
    // [캐럿 버그 2026-07-27] 편집 중(contenteditable)엔 브라우저 기본 캐럿 배치/드래그 선택에 맡긴다.
    //   preventDefault·포인터캡처·드래그 시작이 클릭 캐럿 이동을 막고 커서를 grab 으로 고정하던 원인.
    //   blur(편집 종료)로 contenteditable 이 풀리면 자동으로 원래 드래그 동작 복귀.
    if (L.tx && L.tx.isContentEditable) return;
    // [#8b] 몸통 탭이면 삭제/복제 핸들 disarm — 몸통 위에 겹친 ×가 눌려 레이어가 사라지던 것 방지(핸들 직접 탭에서만 동작).
    L._delArmed = false; L._dupArmed = false;
    e.preventDefault(); selectLayer(L);
    L._pts = L._pts || {}; L._pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    try { L.el.setPointerCapture(e.pointerId); } catch (_) { void _; }
    var ids = Object.keys(L._pts);
    if (ids.length >= 2) {   // [#4] 두 손가락 → 핀치(크기+회전), 단일 드래그 중지
      drag = null;
      var q1 = L._pts[ids[0]], q2 = L._pts[ids[1]];
      lpinch = { L: L, ids: [ids[0], ids[1]], d0: Math.max(8, Math.hypot(q1.x - q2.x, q1.y - q2.y)), a0: Math.atan2(q2.y - q1.y, q2.x - q1.x), s0: L.scale || 1, r0: L.rot || 0 };
      try { lpinch._serSnap = _serLayer(L); } catch (_ps) { void _ps; lpinch._serSnap = null; }   // [T8-H+ V2] 정규화 기준 스냅샷
      return;
    }
    if (L.type === 'text' && L._tapEdit && Date.now() - L._tapEdit < 350) { editText(L); return; }
    L._tapEdit = Date.now();
    drag = { L: L, pid: e.pointerId, sx: e.clientX, sy: e.clientY, ox: L.x, oy: L.y, moved: false };   // [#9] ox/oy=이동 전 위치(되돌리기용)
    /* [T8-H+ V2] 관측용 스냅샷 — **_serLayer 와 같은 정규화 기준**으로 찍는다.
       런타임 L.x 는 스테이지 픽셀이고 저장 스키마의 x 는 0~1 이다. 픽셀을 그대로 학습하면
       personalize 가 "선호 x=137" 을 0~1 좌표에 적용해 화면 밖으로 날려버린다. */
    try { drag._serSnap = _serLayer(L); } catch (_ss) { void _ss; drag._serSnap = null; }
    L.el.style.cursor = 'grabbing';
  }
  document.addEventListener('pointermove', function (e) {
    if (lpinch) {
      var L = lpinch.L; if (L._pts[e.pointerId]) L._pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      var p1 = L._pts[lpinch.ids[0]], p2 = L._pts[lpinch.ids[1]]; if (!p1 || !p2) return;
      var dd = Math.hypot(p1.x - p2.x, p1.y - p2.y), aa = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      L.scale = Math.max(0.2, Math.min(8, lpinch.s0 * dd / lpinch.d0));
      L.rot = snapAngle(lpinch.r0 + (aa - lpinch.a0) * 180 / Math.PI); applyXf(L);
      if (L.type === 'text' && refs.size) refs.size.value = L.scale; return;
    }
    if (rsd) {
      if (rsd.shape) {
        // [#10] 늘리기 — 포인터 이동량을 도형의 '회전 안 된 축'으로 되돌려(dx=가로, dy=세로) box 크기에 반영.
        //   중심 고정(양쪽으로 늘어남) → x/y 도 절반만큼 보정. 선은 세로(두께)는 굵기슬라이더 담당이라 가로만.
        var mdx = e.clientX - rsd.sx, mdy = e.clientY - rsd.sy;
        var rad = -(rsd.L.rot || 0) * Math.PI / 180, cs = Math.cos(rad), sn = Math.sin(rad);
        var ldx = mdx * cs - mdy * sn, ldy = mdx * sn + mdy * cs;   // 로컬 축 이동량
        var nw = Math.max(12, rsd.w0 + ldx * 2);
        var nh = rsd.L.shape === 'line' ? rsd.h0 : Math.max(12, rsd.h0 + ldy * 2);   // 선만 세로 고정(화살표는 머리가 있어 세로도 쓴다)
        rsd.L.x = rsd.x0 - (nw - rsd.w0) / 2; rsd.L.y = rsd.y0 - (nh - rsd.h0) / 2;   // 중심 유지
        rsd.L.w = nw; rsd.L.h = nh; applyXf(rsd.L); return;
      }
      var d = Math.hypot(e.clientX - rsd.cx, e.clientY - rsd.cy);
      rsd.L.scale = Math.max(0.2, Math.min(6, rsd.s0 * d / rsd.d0)); applyXf(rsd.L);
      if (rsd.L.type === 'text' && refs.size) refs.size.value = rsd.L.scale; return;
    }
    if (wd) {
      // [2026-07-26 원영] 가로 늘리기 — 이동량을 레이어 로컬 가로축으로 환산(회전 고려), scale 나눠 실제 폭 px 로.
      var wdx = e.clientX - wd.sx, wdy = e.clientY - wd.sy;
      var wrad = -(wd.L.rot || 0) * Math.PI / 180;
      var wldx = (wdx * Math.cos(wrad) - wdy * Math.sin(wrad)) / (wd.L.scale || 1);
      wd.L.wrapW = Math.max(40, Math.round(wd.w0 + wldx));
      _applyWrap(wd.L); applyXf(wd.L); return;
    }
    if (rotd) {
      var a = Math.atan2(e.clientY - rotd.cy, e.clientX - rotd.cx);
      rotd.L.rot = snapAngle(rotd.start + (a - rotd.a0) * 180 / Math.PI); applyXf(rotd.L); return;
    }
    if (!drag) return;
    if (S) S._userMoved = true;   // [P2-1] 사용자가 직접 옮기면 자동 회피 우선권 해제
    drag.L.x = drag.ox + (e.clientX - drag.sx);
    drag.L.y = drag.oy + (e.clientY - drag.sy);
    drag.moved = true;   // [#9] 실제로 움직였을 때만 되돌리기 스택에 남긴다(탭만 하면 안 남김)
    applyXf(drag.L);
  });
  document.addEventListener('pointerup', cleanupLayerPointer);
  document.addEventListener('pointercancel', cleanupLayerPointer);
  function cleanupLayerPointer(e) {
    // [#1 드래그 회귀] 어느 경로로 끝나든 모든 레이어의 포인터 추적을 지운다(안 지우면 stale 포인터로 다음 드래그가 핀치로 오인됨).
    (S && S.layers || []).forEach(function (L) { if (L._pts) delete L._pts[e.pointerId]; });
    /* [T8-H+] 핀치 확대/축소가 **끝났을 때** 크기 취향 1건. lpinch 가 null 되기 전에 읽어야 한다.
       pointermove 마다 남기면 한 번 조작에 수백 건이 쌓여 IDB·배터리가 죽는다. */
    if (lpinch && (!lpinch.L._pts || Object.keys(lpinch.L._pts).length < 2)) {
      var _pl = lpinch.L;
      if (_pl && lpinch.s0 != null && _pl.scale !== lpinch.s0) {
        // scale(배율)이 아니라 정규화 size 로 — 저장 스키마와 같은 축이어야 적용이 맞는다.
        var _pa = null; try { _pa = _serLayer(_pl); } catch (_pe) { void _pe; }
        if (lpinch._serSnap && _pa && _pa.size != null) {
          _dqFix(_pl, 'size');
          _sig('size_changed', { layerKey: _pl.role || _pl.type,
            before: lpinch._serSnap.size, after: _pa.size });
        }
      }
      lpinch = null;
    }
    if (drag) {
      // [#9] 레이어를 실제로 옮겼으면 되돌리기(↩) 스택에 — 실수로 옮긴 글씨/스티커/도형을 원위치로.
      if (drag.moved && (drag.L.x !== drag.ox || drag.L.y !== drag.oy)) {
        _pushOp({ op: 'move', L: drag.L, before: { x: drag.ox, y: drag.oy }, after: { x: drag.L.x, y: drag.L.y } });
        // [T8-H+] 이동이 끝났을 때 위치 취향 1건. _pushOp 계약(op 종류)은 안 건드린다.
        var _sa = null; try { _sa = _serLayer(drag.L); } catch (_se) { void _se; }
        if (drag._serSnap && _sa) {
          _dqFix(drag.L, 'position');
          _sig('position_changed', { layerKey: drag.L.role || drag.L.type,
            before: { x: drag._serSnap.x, y: drag._serSnap.y }, after: { x: _sa.x, y: _sa.y } });
        }
      }
      drag.L.el.style.cursor = 'grab'; drag = null;
    }
    // [#10] 도형 늘리기(크기 변경)도 되돌리기(↩) 스택에.
    if (rsd && rsd.shape && rsd.before && (rsd.L.w !== rsd.before.w || rsd.L.h !== rsd.before.h)) {
      _pushOp({ op: 'resize', L: rsd.L, before: rsd.before, after: { w: rsd.L.w, h: rsd.L.h, x: rsd.L.x, y: rsd.L.y } });
      var _ra = null; try { _ra = _serLayer(rsd.L); } catch (_re2) { void _re2; }
      if (rsd._serSnap && _ra) {
        _sig('shape_geometry_changed', { layerKey: rsd.L.role || rsd.L.type,
          before: { w: rsd._serSnap.w, h: rsd._serSnap.h }, after: { w: _ra.w, h: _ra.h } });
      }
    }
    // [2026-07-26 원영] 텍스트 가로 늘리기도 되돌리기(↩) 스택에.
    if (wd && wd.L.wrapW !== wd.before.wrapW) {
      _pushOp({ op: 'wrap', L: wd.L, before: wd.before, after: { wrapW: wd.L.wrapW } });
      var _wa = null; try { _wa = _serLayer(wd.L); } catch (_we) { void _we; }
      if (wd._serSnap && _wa) {
        _sig('shape_geometry_changed', { layerKey: wd.L.role || wd.L.type,
          before: { w: wd._serSnap.w }, after: { w: _wa.w } });
      }
    }
    rotd = null; rsd = null; wd = null;
  }

  /* ── 사진 핀치 확대/이동 (두 손가락, 빈 배경에서) ── */
  var pinchPts = {}, pinch0 = null;
  function pdist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  // [#3] 사진 수평 맞추기 — 회전 시 빈 모서리 안 생기게 cover 스케일 보정.
  function coverScaleForRot(deg) {
    var r = Math.abs(deg) * Math.PI / 180; var st = refs.stage.getBoundingClientRect(); var W = st.width || 1, H = st.height || 1;
    return Math.max((W * Math.cos(r) + H * Math.sin(r)) / W, (W * Math.sin(r) + H * Math.cos(r)) / H, 1);
  }
  function applyPhotoTransform() {
    // [#2] 콜라주(레이아웃)에선 photowrap 을 회전하면 '전체'가 휘어버린다 → 단일 모드에서만 회전 적용.
    //   콜라주는 각 셀 이미지가 자기 사진의 수평보정을 개별로 반영(renderCollage).
    var deg = 0;
    if (isSingleL(S.layout)) {
      // [#7] 슬라이더는 adjOf(S.adjSel).rot 에 쓰므로 활성 사진(adjSel) 기준으로 읽는다(누끼 후 URL 매칭 실패 방지).
      try { var idx = (S.adjSel != null && S.photos[S.adjSel] != null) ? S.adjSel : S.photos.indexOf(S.photoUrl); deg = (adjOf(idx < 0 ? 0 : idx).rot) || 0; } catch (_) { void _; }
    }
    var cs = deg ? coverScaleForRot(deg) : 1;
    refs.photowrap.style.transform = 'translate(' + S.pz.tx + 'px,' + S.pz.ty + 'px) scale(' + ((S.pz.scale || 1) * cs) + ') rotate(' + deg + 'deg)';
  }
  function applyPz() { applyPhotoTransform(); }
  function applyStraighten() { applyPhotoTransform(); if (!isSingleL(S.layout)) renderCollage(); }   // [#2] 콜라주 모드에선 셀별 회전을 즉시 다시 그림(슬라이더 실시간 반영)
  function stageDown(e) {
    if (S.tool === 'draw' || (e.target.closest && (e.target.closest('.itl') || e.target.closest('.itrb') || e.target.closest('.itpanel')))) return;
    // [보스#9] 레이어(텍스트/스티커) 밖 빈 곳을 탭하면 선택 해제 → 핸들(×·회전·크기) 숨김.
    if (S.active) selectLayer(null);
    pinchPts[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pinchPts);
    if (ids.length === 2) { var a = pinchPts[ids[0]], b = pinchPts[ids[1]]; pinch0 = { d: pdist(a, b), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, s: S.pz.scale, tx: S.pz.tx, ty: S.pz.ty }; }
  }
  function stageMove(e) {
    if (!pinchPts[e.pointerId]) return;
    pinchPts[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pinchPts);
    if (ids.length === 2 && pinch0) {
      var a = pinchPts[ids[0]], b = pinchPts[ids[1]], d = pdist(a, b);
      S.pz.scale = Math.max(1, Math.min(4, pinch0.s * d / pinch0.d));
      S.pz.tx = pinch0.tx + ((a.x + b.x) / 2 - pinch0.mx);
      S.pz.ty = pinch0.ty + ((a.y + b.y) / 2 - pinch0.my);
      applyPz();
    }
  }
  function stageUp(e) { delete pinchPts[e.pointerId]; if (Object.keys(pinchPts).length < 2) pinch0 = null; }

  /* ── 텍스트 ── */
  function addText() {
    var L = makeLayer('text');
    L.font = FONTS[0]; L.color = COLORS[0]; L.align = 'center'; L.fontSize = 30; L.text = '내용을 입력하세요';
    // [2026-07-26 원영] white-space:pre — 편집 중 자동 줄바꿈 금지(엔터 친 곳만 줄바꿈).
    //   export 캔버스는 split('\n')으로 엔터만 줄바꿈이라, 편집 화면도 동일해야 WYSIWYG.
    var t = el('div', 'itl-text'); t.textContent = L.text; t.style.cssText = 'font-family:' + L.font.family + ';font-weight:' + L.font.weight + ';color:' + L.color + ';text-align:center;font-size:' + L.fontSize + 'px;white-space:pre';
    L.el.appendChild(t); L.tx = t;
    placeCenter(L, 180, 50); selectLayer(L);
    _pushOp({ op: 'add', L: L });   // [P1-3] 추가 되돌리기
    setTimeout(function () { editText(L); }, 30);
    return L;
  }
  function editText(L) {
    L.el.classList.add('is-editing');   // [캐럿 버그] .itl 의 grab 커서 대신 text 커서(css .itl.is-editing)
    L.tx.setAttribute('contenteditable', 'true'); L.tx.focus();
    document.execCommand && document.execCommand('selectAll', false, null);
    L.tx.addEventListener('blur', function () {
      L.el.classList.remove('is-editing');
      L.tx.removeAttribute('contenteditable');
      // [버그수정 2026-07-06] textContent 는 contenteditable 의 <br>/<div> 줄바꿈을 개행문자로 안 넣어
      //   두 줄 입력이 한 줄로 뭉쳤다(미리보기·export·재편집 3곳 불일치). innerText 는 개행을 \n 으로 보존.
      var _t = (L.tx.innerText != null ? L.tx.innerText : L.tx.textContent) || '';
      L.text = _t.replace(/ /g, ' ').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
    }, { once: true });
  }
  /* ── 우리샵 스타일 입력 레이어 렌더(학습 round-trip용) ── */
  function fontByKey(k) { for (var i = 0; i < FONTS.length; i++) { if (FONTS[i].key === k) return FONTS[i]; } return null; }
  function addShopLayer(spec, R) {
    if (spec.type === 'image') return addShopImage(spec, R);
    if (spec.type === 'line') return addShopLine(spec, R);
    if (spec.type === 'rect') return addShopRect(spec, R);
    if (spec.type === 'sticker' || spec.type === 'emoji') return addShopSticker(spec, R);   // [#5/#6] 이모지 스티커도 복원/합성(compose)에서 렌더
    return _addShopLayerText(spec, R);   // 기본: 텍스트/배지
  }
  // [#5/#6] 이모지 스티커 레이어 재생성 — 재편집 복원 + 헤드리스 compose 양쪽에서 사용.
  function addShopSticker(spec, R) {
    var L = makeLayer('sticker'); L.emoji = spec.emoji; L.fontSize = 64; L.rot = spec.rot || 0;
    L.scale = spec.size != null ? (spec.size * R.height) / 64 : (spec.scale || 1);
    var s = el('div', 'itl-sticker'); s.textContent = spec.emoji; L.el.appendChild(s); L.tx = s;
    L.x = (spec.x != null ? spec.x : 0.5) * R.width - 32;
    L.y = (spec.y != null ? spec.y : 0.5) * R.height - 32; applyXf(L);
    return L;
  }
  function _addShopLayerText(spec, R) {
    var isBadge = spec.type === 'badge';
    var L = makeLayer(isBadge ? 'badge' : 'text');
    L.role = spec.role || '';
    L.font = fontByKey(spec.font) || FONTS[0];
    L.color = spec.color || '#FFFFFF';
    L.align = spec.align || 'center';
    L.fontSize = Math.max(12, Math.round((spec.size != null ? spec.size : 0.06) * R.height));
    L.text = spec.text || '';
    L.stroke = !!(spec.outline && spec.outline.on) || !!spec.stroke;
    L.shadow = isBadge || !!(spec.shadow && spec.shadow.on) || !!spec.shadow;
    var t = el('div', 'itl-text'); t.textContent = L.text;
    /* [2026-07-23 보스] 한글 줄바꿈 — word-break:keep-all 로 **어절(띄어쓰기) 단위**로 끊는다.
       기본값(normal)은 한글을 글자 단위로 끊어서 '속눈썹 연/장', '뿌리염/색' 처럼 어색하게 잘렸다.
       overflow-wrap:anywhere 는 안전망 — 띄어쓰기 없이 아주 긴 한 덩어리(URL·영문)가 오면
       keep-all 만으론 박스를 뚫고 나가므로 그때만 강제로 끊는다. */
    var css = 'font-family:' + L.font.family + ';font-weight:' + (spec.weight || L.font.weight) + ';color:' + L.color + ';text-align:' + L.align + ';font-size:' + L.fontSize + 'px;white-space:pre-wrap;word-break:keep-all;overflow-wrap:anywhere';
    if (spec.w != null) css += ';max-width:' + Math.round(spec.w * R.width) + 'px';
    if (L.stroke) css += ';-webkit-text-stroke:1px rgba(0,0,0,.5)';
    if (L.shadow) css += ';text-shadow:0 2px 8px rgba(0,0,0,.35)';
    if (isBadge) css += ';background:' + (spec.bg || 'rgba(0,0,0,.32)') + ';padding:4px 10px;border-radius:8px';
    if (spec.opacity != null) css += ';opacity:' + spec.opacity;
    t.style.cssText = css; L.el.appendChild(t); L.tx = t;
    // [#2c] 긴 시술내용/두 줄 이상도 안 잘리게 — 텍스트 블록이 사진 높이의 ~1/3을 넘으면 폰트를 줄여 자동으로 맞춘다.
    if (spec.w != null && R.height) { var _maxH = R.height * 0.34, _g = 0; while (L.el.offsetHeight > _maxH && L.fontSize > 13 && _g++ < 16) { L.fontSize -= 2; t.style.fontSize = L.fontSize + 'px'; } }
    var bw = L.el.offsetWidth, bh = L.el.offsetHeight;
    L.x = (spec.x != null ? spec.x : 0.5) * R.width - bw / 2;
    L.y = (spec.y != null ? spec.y : 0.5) * R.height - bh / 2;
    applyXf(L);
    return L;
  }
  // [#14] 우리샵 스타일에서 들어온 구분선 → 편집 가능한 line 도형 레이어로.
  function addShopLine(spec, R) {
    var L = makeLayer('shape');
    // 화살표도 여기로 온다(구조가 선과 같다). spec.shape 를 존중하지 않으면 복원 때 민선이 된다.
    L.shape = (spec.shape === 'arrow') ? 'arrow' : 'line';
    L.color = spec.color || '#ffffff'; L.fill = true; L.rot = spec.rot || 0;
    // [버그수정 2026-07-17] role 을 spec 대로. 예전엔 무조건 'rule' 이라 원장이 직접 그린 선(role='')까지
    //   '우리샵 구분선'으로 취급돼 얼굴 회피·겹침 해소 로직이 제멋대로 옮겼다(기억한 자리가 안 지켜짐).
    L.role = (spec.role != null) ? spec.role : 'rule';
    L.strokeW = Math.max(2, Math.round((spec.size != null ? spec.size : 0.006) * R.height));
    // [#10] box 크기로 저장(늘리기 지원). 선 길이=w, 세로=두께 기준 hit 영역.
    L.w = Math.round((spec.w != null ? spec.w : 0.11) * R.width);
    L.h = (spec.h != null ? Math.round(spec.h * R.height) : Math.max(L.strokeW, 22));
    var d = el('div', 'itl-shape'); styleShape(d, L); L.el.appendChild(d); L.tx = d;
    L.x = (spec.x != null ? spec.x : 0.5) * R.width - L.w / 2;
    L.y = (spec.y != null ? spec.y : 0.88) * R.height - L.h / 2;
    applyXf(L);
    return L;
  }
  // [#1] 채움 '면'(반투명 패널/악센트 블록) — 텍스트 뒤 가독성·디자인용. 색은 rgba 권장(반투명).
  function addShopRect(spec, R) {
    var L = makeLayer('shape');
    /* [버그수정 2026-07-17] spec 의 모양·채움·굵기를 존중한다. 예전엔 circle 을 round 로 뭉개고
       fill 을 true 로 강제해, 원장이 만든 '테두리 원'이 복원 시 '채운 둥근 사각형'이 됐다.
       ⚠️ 우리샵 스타일 패널 spec 은 fill 을 안 실어 보낸다 → null 이면 기존대로 채움(하위호환). */
    L.shape = (spec.shape === 'rect' || spec.shape === 'circle') ? spec.shape : 'round';
    L.fill = (spec.fill != null) ? !!spec.fill : true;
    L.color = spec.color || 'rgba(20,16,18,.30)'; L.role = spec.role || 'panel'; L.rot = spec.rot || 0;
    L.strokeW = (spec.strokeW != null) ? Math.max(1, Math.round(spec.strokeW * R.height)) : 6;
    // [#10] box 크기로 저장(늘리기 지원). 안쪽 면/테두리는 box 를 100% 채운다(styleShape).
    L.w = Math.round((spec.w != null ? spec.w : 0.8) * R.width);
    L.h = Math.round((spec.h != null ? spec.h : 0.12) * R.height);
    L.radius = (spec.radius != null ? spec.radius : 16);
    var d = el('div', 'itl-shape'); styleShape(d, L); L.el.appendChild(d); L.tx = d;
    L.x = (spec.x != null ? spec.x : 0.5) * R.width - L.w / 2;
    L.y = (spec.y != null ? spec.y : 0.85) * R.height - L.h / 2;
    applyXf(L);
    return L;
  }
  function addShopImage(spec, R) {
    var L = makeLayer('image'); L.role = spec.role || 'logo'; L.src = spec.src;
    var im = document.createElement('img'); im.src = spec.src; im.alt = '';
    im.style.cssText = 'display:block;width:' + Math.round((spec.w != null ? spec.w : 0.24) * R.width) + 'px;height:auto;opacity:' + (spec.opacity != null ? spec.opacity : 1) + ';pointer-events:none';
    L.el.appendChild(im); L.tx = im;
    var place = function () {
      var bw = L.el.offsetWidth || ((spec.w || 0.24) * R.width), bh = L.el.offsetHeight || bw;
      L.x = (spec.x != null ? spec.x : 0.82) * R.width - bw / 2;
      L.y = (spec.y != null ? spec.y : 0.1) * R.height - bh / 2; applyXf(L);
    };
    if (im.complete && im.naturalWidth) place(); else im.onload = place;
    place();
    return L;
  }
  // [#2a] 복원(editState) 후에도 아직 없는 역할의 시술 텍스트는 추가로 올린다 — '이어서 편집'과 '시술내용 반영'을 양립.
  //   기존엔 복원 모드면 renderIncoming 을 통째 건너뛰어, 캡션에서 시술을 적어도 편집기에 안 뜨던 문제.
  function _renderMissingIncoming(list) {
    if (!Array.isArray(list) || !list.length) return;
    var have = {}; S.layers.forEach(function (L) { if (L.role) have[L.role] = 1; });
    var R = refs.stage.getBoundingClientRect();
    var added = false;
    list.forEach(function (spec) { if (spec.role && !have[spec.role]) { try { addShopLayer(spec, R); added = true; } catch (_e) { void _e; } } });
    if (added) { S.active = null; S.layers.forEach(function (x) { x.el.classList.remove('is-active'); }); }
  }
  function renderIncoming(layers) {
    if (!Array.isArray(layers) || !layers.length) return;
    var R = refs.stage.getBoundingClientRect();
    layers.forEach(function (spec) { try { addShopLayer(spec, R); } catch (_) { void _; } });
    _deOverlapIncoming();   // [#2] 텍스트 길이 무관 — 자동배치 글자/선이 서로 안 겹치게 세로로 벌림
    S.active = null; S.layers.forEach(function (x) { x.el.classList.remove('is-active'); });
    _applySafeZone();   // [P2-1] 얼굴/피사체 위 자동 텍스트 비켜놓기(비동기, 폴백 안전)
    _applyPlanSafety();   // [STAGE C] 원장이 직접 놓은 텍스트도 피사체를 피하게(기본 OFF)
  }
  // [P2-1] 자동배치 텍스트가 얼굴/피사체를 덮으면 비켜 배치. 비동기(마스크/휴리스틱) → 계산 후 한 번 이동.
  //   보수적: 세로로 겹치는 자동 역할 레이어만, 빈 쪽(아래/위)으로 밀고 스테이지 안으로 클램프. 실패/저신뢰=폴백.
  function _applySafeZone() {
    if (!S || S._safeApplied || S._userMoved) return;
    if (!(window.ItdSafeZone && window.ItdSafeZone.avoidBox)) return;
    var url = S.photoUrl; if (!url) return;
    S._safeApplied = true;   // 1회만
    window.ItdSafeZone.avoidBox(url).then(function (box) {
      if (!box || !S || S._userMoved || (S.layout && (S.layout.kind || 'single') !== 'single')) return;
      var R = refs.stage.getBoundingClientRect(); if (!R.height) return;
      var atop = box.y * R.height, abot = (box.y + box.h) * R.height;
      var faceUpper = (atop + (abot - atop) / 2) < R.height * 0.55;
      var auto = S.layers.filter(function (L) { return ((L.type === 'text' || L.type === 'badge') && L.role) || (L.type === 'shape' && L.role === 'rule'); });
      if (!auto.length) return;
      var moved = false, pad = R.height * 0.03;
      auto.forEach(function (L) {
        var b = L.el.getBoundingClientRect(); var top = b.top - R.top, bot = b.bottom - R.top;
        if (bot > atop && top < abot) {   // 얼굴과 세로로 겹침
          if (faceUpper) { var dn = (abot + pad) - top; if (dn > 0) { L.y += dn; moved = true; } }
          else { var up = bot - (atop - pad); if (up > 0) { L.y -= up; moved = true; } }
        }
      });
      if (!moved) return;
      _deOverlapIncoming();
      auto.forEach(function (L) {
        var b = L.el.getBoundingClientRect();
        if (b.top - R.top < 0) { L.y += (R.top - b.top) + 4; applyXf(L); }
        if (b.bottom - R.top > R.height) { L.y -= (b.bottom - R.top - R.height) + 4; applyXf(L); }
      });
    });
  }
  /* [STAGE C] 타이포 초안 — **비어 있는 축만** 채운다.
     원장이 고른 폰트·색을 덮으면 그 순간 신뢰를 잃는다. 그래서 값이 있으면 손대지 않는다.

     🔑 순서가 중요하다: 타이포를 바꾸면 **글자 박스 크기가 바뀐다.**
        그래서 반드시 (1) 타이포 적용 → (2) 렌더 → (3) 실제 rect 재측정 → (4) Safety 판정
        순서로 간다. 타이포 전에 잰 rect 로 Safety 를 결정하면 틀린 자리로 옮긴다.

     🔑 `applyFont/Color/Align` 을 쓰지 않는다 — 그것들은 **활성 레이어**에만 동작하고
        `WMSignals` 로 학습 신호까지 쏜다. 우리가 얹은 값이 "원장이 고른 값" 으로 학습되면
        자기강화가 된다. 여기서는 DOM 스타일만 직접 바꾸고 `_src:'plan'` 을 남긴다. */
  function _applyPlanTypography(plan) {
    if (!plan || !plan.typography || !S) return 0;
    var t = plan.typography, n = 0;
    var R = _stageWH();
    S.layers.forEach(function (L) {
      if (!L || !L.tx) return;
      if (L.type !== 'text' && L.type !== 'badge') return;
      if (L.role) return;                       // 역할 레이어는 템플릿 소유
      if (L._src === 'wm') return;              // 작업기억이 얹은 건 그쪽 소관
      var own = L._own || {};

      /* 🔑 "값이 비었나" 가 아니라 **"원장이 골랐나"** 로 판단한다.
         새 텍스트는 흰색·가운데정렬·40px 로 미리 채워져 나오는데 그건 편집기 기본값이다.
         값으로 판단하면 이 축들은 영영 안 채워진다 — 실제로 그 상태였다. */
      if (t.font && t.font.value && !own.font && !L._planFont) {
        var f = fontByKey(t.font.value);        // 지원 키만. 모르는 키면 기존 폰트 유지
        if (f) {
          L.font = f; L.tx.style.fontFamily = f.family; L.tx.style.fontWeight = f.weight;
          L._planFont = true; L._src = L._src || 'plan'; _planAxis(L, 'font'); n++;
        }
      }
      if (t.color && t.color.value && !own.color) {
        L.color = t.color.value; L.tx.style.color = t.color.value;
        L._src = L._src || 'plan'; _planAxis(L, 'color'); n++;
      }
      if (t.align && t.align.value && !own.align) {
        L.align = t.align.value; L.tx.style.textAlign = t.align.value;
        L._src = L._src || 'plan'; _planAxis(L, 'align'); n++;
      }
      /* 크기 — 업종 실측 비율(스테이지 높이 대비). **이미 비슷하면 안 건드린다**:
         자동 초안이 매번 몇 px 씩 흔들면 원장 눈엔 그냥 버그다. */
      /* 🔴 숫자가 아니면 **조용히 넘어가지 않는다.** 예전엔 `'~'` 같은 값이 오면
         want 가 NaN 이 되고 `NaN > 0.15` 가 false 라 아무 일도 안 일어났다 —
         화면은 멀쩡해서 아무도 못 알아챘다. 이제 명시적으로 거른다. */
      if (t.size && isFinite(t.size.value) && t.size.value > 0 && !own.size && R.height) {
        var want = Math.max(12, Math.round(t.size.value * R.height));
        var cur = L.fontSize || 0;
        if (cur && Math.abs(want - cur) / cur > 0.15) {
          L.fontSize = want; L.tx.style.fontSize = want + 'px';
          L._src = L._src || 'plan'; _planAxis(L, 'size'); n++;
        }
      }
    });
    return n;
  }

  /* [STAGE F] 초안이 얹은 값을 **관찰 기준선**에 등록한다.
     이게 없으면 학습이 한쪽으로만 쌓인다: 우리 값이 틀렸을 때는 원장이 바꾸면서
     `replaced`(negative 2) 가 남는데, 맞았을 때는 아무 기록도 안 남는다.
     그러면 우리 값이 90% 맞아도 negative 만 누적돼 결국 '싫어하는 값'이 된다.

     🔑 `_src:'plan'` 을 달아 보낸다 — T8 이 이걸 보고 `publishedKeptAuto`(1점, 약함)로 센다.
        빼먹으면 `publishedKept`(3점, 강함)가 되어 **우리 추측이 원장의 강한 취향으로 둔갑**한다.
        그게 이 프로젝트가 가장 피하려는 자기강화다.
     🔑 발행했을 때만 센다(T8 규칙). 열어보고 그냥 닫은 건 증거가 아니다. */
  function _planBaseline() {
    try {
      if (!S || !window.WMSignals || !window.WMSignals.baseline) return;
      var rows = [];
      (S.layers || []).forEach(function (L) {
        if (!L || !L._planAxes) return;
        if (L.type !== 'text' && L.type !== 'badge') return;
        var row = { type: 'text', _src: 'plan' };
        var any = false;
        // 되돌릴 수 있는 축만 — 외곽선·그림자는 끄는 UI 가 없어 유지가 동의를 뜻하지 않는다
        if (L._planAxes.font && L.font && L.font.key) { row.font = L.font.key; any = true; }
        if (L._planAxes.color && L.color) { row.color = L.color; any = true; }
        if (L._planAxes.align && L.align) { row.align = L.align; any = true; }
        if (any) rows.push(row);
      });
      if (rows.length) window.WMSignals.baseline(rows);
    } catch (_e) { void _e; }
  }

  /* 이번 세션에서 초안이 건드린 축을 모은다 — 레이어별이 아니라 **세션 단위**로 센다.
     같은 축을 레이어 5개에 적용했다고 5번 세면 지표가 레이어 수에 휘둘린다. */
  function _axesTouched() {
    var out = {};
    (S && S.layers || []).forEach(function (L) {
      if (L && L._planAxes) Object.keys(L._planAxes).forEach(function (k) { out[k] = 1; });
    });
    return out;
  }

  /* [STAGE C] 가독성 — **자리가 정해진 뒤에** 그 자리 배경으로 판정한다.
     Safety 가 글자를 옮기면 배경이 바뀐다. 옮기기 전에 재면 틀린 배경으로 판정한다.
     그래서 이 패스는 반드시 Safety **다음**이다.

     고치는 순서는 색 → 외곽선 → 그림자. 원장 디자인을 덜 건드리는 쪽부터다. */
  function _planReadabilityPass(url, alive) {
    if (!(window.TextReadability && window.PhotoContext)) return Promise.resolve(0);
    if (!window.EditPlan || !window.EditPlan.SCOPE.readability) return Promise.resolve(0);
    return window.PhotoContext.of(url).then(function (pctx) {
      if (!pctx || !pctx.lumGrid || (alive && !alive())) return 0;
      var R = refs.stage.getBoundingClientRect(); if (!R.width || !R.height) return 0;
      var fixed = 0;
      S.layers.forEach(function (L) {
        if (!L || !L.tx || (L.type !== 'text' && L.type !== 'badge')) return;
        if (L._src === 'wm') return;
        /* 🔑 역할(role) 레이어도 **여기서는** 본다. 타이포와 다른 점이다.
           브라우저에서 실제로 열어보고 알았다: 자동 초안이 올리는 시술 텍스트는 전부 role 이라
           role 을 건너뛰면 실사용 경로에서 이 기능이 **한 번도 안 돈다**.
           단, 색은 템플릿(ShopStyle)이 정한 원장의 선택이므로 **절대 안 바꾼다** —
           외곽선·그림자로만 띄운다. 안 보이는 문구를 그대로 두는 것보다 낫고,
           원장이 고른 색을 바꾸는 것보다 덜 침범한다. */
        var isRole = !!L.role;
        var own = L._own || {};
        var b = L.el.getBoundingClientRect();
        if (!b.width || !b.height) return;
        var rect = { x: (b.left - R.left) / R.width, y: (b.top - R.top) / R.height,
          w: b.width / R.width, h: b.height / R.height };
        /* 🔑 스테이지 좌표를 **사진 좌표로 옮긴다.** 게시물 비율이 사진 비율과 다르면
           cover 가 사진을 잘라서, 안 옮기면 엉뚱한 자리의 밝기를 읽는다.
           (실측: 같은 사진이 4:5 에선 외곽선이 붙고 1:1 에선 안 붙었다) */
        var pRect = window.PhotoContext.mapStageRect(pctx, rect, R.width / R.height, S.fitMode);
        if (!pRect) return;                     // contain 레터박스 위 — 사진이 아니라 판정 불가
        var bg = window.PhotoContext.regionLum(pctx, pRect);
        if (!bg) return;
        var fix = window.TextReadability.resolve({
          color: L.color, colorIsDefault: !isRole && !own.color, bg: bg,
          hasStroke: !!L.stroke, hasShadow: !!L.shadow
        });
        if (!fix) return;                       // 이미 잘 보인다 — 아무것도 안 한다
        if (fix.color && !isRole && !own.color) { L.color = fix.color; L.tx.style.color = fix.color; _planAxis(L, 'color'); }
        if (fix.stroke && !L.stroke) { L.stroke = true; L.tx.style.webkitTextStroke = '1px rgba(0,0,0,.5)'; _planAxis(L, 'stroke'); }
        if (fix.shadow && !L.shadow) { L.shadow = true; L.tx.style.textShadow = '0 2px 8px rgba(0,0,0,.35)'; _planAxis(L, 'shadow'); }
        L._src = L._src || 'plan';
        L._planRead = fix;                      // 왜 바꿨는지 남긴다(디버그·되돌리기)
        fixed++;
      });
      if (fixed) {
        try { S._planRead = fixed; } catch (_e) { void _e; }
        try { if (window.DraftQuality) window.DraftQuality.applied(_axesTouched()); } catch (_e2) { void _e2; }
      }
      return fixed;
    }).catch(function () { return 0; });
  }

  /* [STAGE C] 원장이 **직접 놓은 텍스트**가 피사체를 가리면 안전한 자리로 옮긴다.
     `_applySafeZone`(바로 위)은 **역할 레이어만** 지킨다 — 자유 텍스트는 지금 아무도 안 지킨다.
     그게 이 프로젝트에서 처음 발견한 실제 문제였고, 이게 그 첫 수정이다.

     보수적으로만 움직인다:
       · **기본 OFF**(`?editplan=1`). 켜져도 아래 조건을 전부 넘어야 움직인다.
       · 원장이 이미 손댔으면(`S._userMoved`) 아예 안 돈다
       · 지금 안전하면 개입 안 함 · 대안이 의미 있게 낫지 않으면 그대로
       · 피사체 신뢰도 낮으면 손대지 않음 · 회전 레이어 제외(AABB 를 못 믿는다)
     한 번만 돈다. 되돌리기는 원장이 그냥 다시 옮기면 된다(우리는 그걸 학습 신호로 받는다). */
  function _applyPlanSafety() {
    if (!S || S._planApplied || S._userMoved) return;
    /* 🔴 스위치가 둘이다. 여기서 하나만 보면 rollout 을 켜도 **아무 일도 안 일어난다**
       (실제로 그 상태였다 — 브라우저에서 10% 를 켜보고 sessions:0 으로 잡았다).
         flagOn()      QA 강제 스위치(`?editplan=1` · ITDASY_EDIT_PLAN)
         autoDraftOn() 실사용 게이트 — URL·전역·**rollout 버킷**
       둘 중 하나면 돈다: QA 는 버킷과 무관하게 보고, 실사용자는 버킷으로 갈린다. */
    if (!window.EditPlan) return;
    var _fOn = window.EditPlan.flagOn && window.EditPlan.flagOn();
    var _aOn = window.EditPlan.autoDraftOn && window.EditPlan.autoDraftOn();
    if (!_fOn && !_aOn) return;
    if (!window.PhotoContext || !window.SafetyShadow) return;
    var url = S.photoUrl; if (!url) return;
    if (S.layout && (S.layout.kind || 'single') !== 'single') return;   // 콜라주는 칸이 배치를 소유
    S._planApplied = true;

    /* 🔴 세션 토큰 — 편집기를 닫고 **바로 다시 열면** 이전 세션의 비동기 체인이
       아직 날아다닌다. 그 체인은 모듈 전역 `S` 를 보므로, 가드를 `!S` 로만 두면
       **새 세션 레이어를 이전 세션의 판단으로 건드린다.**
       브라우저 실측으로 잡았다: 닫고 바로 여니 외곽선이 붙었다가 사라졌다.
       (이 레포에서 이미 나온 패턴이다 — 비동기 결과는 자기 세대인지 확인하고 쓴다) */
    var mySession = S;
    var alive = function () { return S === mySession && !S._userMoved; };
    /* [STAGE D] 품질 관측 세션 시작 — 초안이 아무것도 안 해도 연다.
       분모(초안이 돈 세션 수)를 알아야 되돌림률이 의미를 갖는다. */
    try {
      if (window.DraftQuality) {
        var _ci = (window.ContentIntent && window.ContentIntent.peek) ? window.ContentIntent.peek(url) : null;
        window.DraftQuality.begin({ intent: _ci && _ci.kind });
      }
    } catch (_dq) { void _dq; }

    /* 🔑 순서: 타이포 먼저 → 렌더 → **그 다음에** geometry 측정 → Safety.
       타이포가 글자 박스 크기를 바꾸므로, 바꾸기 전 rect 로 Safety 를 정하면 틀린 자리로 옮긴다. */
    var _wc = (S && S.wmContext) || {};
    var planCtx = {
      photoUrl: url,
      category: (S.planCategory || null),
      photoCount: (S.photos || []).length,
      /* 학습(WMSignals.begin)에 쓴 것과 **같은** 값이어야 한다 — 여기서 손으로 다시 조립하면 또 어긋난다 */
      service: _wc.service || undefined,
      kind: _wc.kind || undefined,
      hasBeforeAfter: _wc.hasBeforeAfter,
      shopStyleId: _wc.shopStyleId
    };
    /* 🔴 이 체인을 **밖에서 기다릴 수 있게** S 에 걸어둔다.
       헤드리스 합성(compose)은 40ms 뒤에 구워버리는데 이 체인은 사진 디코딩·IDB 조회를
       거쳐서 그보다 오래 걸린다. 그래서 **편집기 화면엔 보정이 있는데 발행본엔 없었다.**
       실제 인스타 캡처로 구워보고 잡았다 — 플랜 ON/OFF 결과가 바이트까지 같았다. */
    S._planP = window.EditPlan.compute(planCtx).then(function (plan) {
      if (!plan || !alive()) return;
      var typoN = _applyPlanTypography(plan);
      if (typoN) { try { S._planTypo = typoN; } catch (_e) { void _e; } }
      // 타이포 반영 뒤의 **실제** rect 로 다시 잰다
      var geoms = metaGeometry();
      if (!geoms.length) return;
      // Safety 로 자리가 정해진 **다음에** 가독성을 본다 — 옮기면 배경이 바뀐다
      return _planSafetyPass(geoms, url, alive).then(function () {
        if (!alive()) return 0;
        return _planReadabilityPass(url, alive);
      }).then(function (n) {
        if (alive()) _planBaseline();   // 얹기가 다 끝난 뒤 한 번
        return n;
      });
    }).catch(function () { /* 초안 실패는 조용히 — 편집기는 정상 동작 */ });
  }

  /* Safety 패스 — 타이포 반영 **후의** geometry 로만 판정한다. */
  function _planSafetyPass(geoms, url, alive) {
    return window.PhotoContext.of(url).then(function (pctx) {
      if (!pctx || !pctx.subjectRegion || (alive && !alive())) return;
      var R = refs.stage.getBoundingClientRect(); if (!R.width || !R.height) return;
      var det = window.SafetyShadow.detect(geoms, pctx);
      if (!det.verdictReliable) return;
      var moved = 0;
      det.layers.forEach(function (info) {
        if (!info.unsafe || !info.geometryReliable) return;
        var g = geoms.filter(function (x) { return x.idx === info.idx; })[0];
        var L = S.layers[info.idx];
        if (!g || !L || !L.el) return;
        var cs = window.SafetyShadow.candidates(g, pctx).filter(function (c) { return c.valid; });
        if (!cs.length) return;
        var best = cs.sort(function (a, b) {
          var d = a.metrics.layerCoveredRatio - b.metrics.layerCoveredRatio;
          if (Math.abs(d) > 0.001) return d;
          return b.metrics.distance - a.metrics.distance;
        })[0];
        if (info.metrics.layerCoveredRatio - best.metrics.layerCoveredRatio < window.SafetyShadow.TH.improveDelta) return;
        /* 현재 rect 에서 목표 rect 까지의 **차이만큼만** 민다.
           절대좌표로 덮어쓰면 L.x/L.y 의 기준(translate 원점)과 어긋난다. */
        var b = L.el.getBoundingClientRect();
        L.x += (best.rect.x - (b.left - R.left) / R.width) * R.width;
        L.y += (best.rect.y - (b.top - R.top) / R.height) * R.height;
        applyXf(L);
        L._src = L._src || 'plan';   // 얹은 값 표시(자기강화 차단)
        _planAxis(L, 'position');
        moved++;
      });
      /* 우리가 옮긴 건 **원장의 선택이 아니다** — 학습이 이걸 취향으로 삼으면 자기강화가 된다.
         `_src:'plan'` 태깅으로 구분하고, T8 의 `publishedKeptAuto`(약한 증거) 규칙에 맡긴다. */
      if (moved) {
        try { S._planMoved = moved; } catch (_e) { void _e; }
        try { if (window.DraftQuality) window.DraftQuality.applied(_axesTouched()); } catch (_e2) { void _e2; }
      }
    }).catch(function () { /* 실패하면 그냥 안 움직인다 */ });
  }

  // [#2] 자동배치 역할 레이어(시술명/내용/선)가 겹치면 세로로 벌리고, 화면 밖이면 그룹을 위로 당겨 유지.
  function _deOverlapIncoming() {
    var R = refs.stage.getBoundingClientRect(); if (!R.height) return;
    var arr = S.layers.filter(function (L) { return ((L.type === 'text' || L.type === 'badge') && L.role) || (L.type === 'shape' && L.role === 'rule'); });
    if (arr.length < 2) return;
    arr.sort(function (a, b) { return a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top; });
    var GAP = R.height * 0.010, moved = false;
    for (var i = 1; i < arr.length; i++) {
      var pb = arr[i - 1].el.getBoundingClientRect(), cb = arr[i].el.getBoundingClientRect();
      if (cb.top < pb.bottom + GAP) { arr[i].y += (pb.bottom + GAP) - cb.top; applyXf(arr[i]); moved = true; }
    }
    if (moved) {
      var last = arr[arr.length - 1].el.getBoundingClientRect();
      var overflow = last.bottom - (R.bottom - R.height * 0.02);
      if (overflow > 0) arr.forEach(function (L) { L.y -= overflow; applyXf(L); });
    }
  }
  function syncTextControls(L) {
    root.querySelectorAll('[data-font]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-font') === L.font.key); });
    root.querySelectorAll('[data-color]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-color') === L.color); });
    refs.aln.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-aln') === L.align); });
    refs.size.value = L.scale;
  }
  /* [T8-A 2026-08-19] 원장 조작 관찰 — undo 스택(_pushOp)과 완전히 분리된 경로다.
     _pushOp 에 속성변경을 넣으면 ↩ 동작이 바뀌어 T4 계약이 깨지므로 여기서만 기록한다.
     system 스코프(자동적용·복원·undo) 안에서는 WMSignals 가 알아서 무시한다. */
  function _sig(ev, p) { try { if (window.WMSignals) window.WMSignals.note(ev, p); } catch (_e) { void _e; } }
  /* [STAGE C] `_own` = **원장이 직접 고른 축**. 자동 초안은 여기 표시된 축을 절대 안 덮는다.
     값으로 추측하면 틀린다 — 새 텍스트는 흰색·가운데정렬로 **미리 채워져** 나오는데
     그건 편집기 기본값이지 취향이 아니다. 그래서 고르는 순간에 도장을 찍는다. */
  function _own(L, k) {
    if (!L) return;
    (L._own || (L._own = {}))[k] = 1;
    _dqFix(L, k);
  }
  // 초안이 건드린 축 표시 — 되돌림 판정의 짝
  function _planAxis(L, k) { if (L) { (L._planAxes || (L._planAxes = {}))[k] = 1; } }
  /* [STAGE D] **우리가 건드린 축을** 원장이 다시 바꿨다 = 초안이 틀렸다는 신호.
     안 건드린 축을 바꾼 건 그냥 원장 작업이다 — 섞으면 지표가 무의미해진다.
     호출부를 짧게 유지하려고 헬퍼로 뺐다(신호 지점 코드가 길어지면 남의 테스트가 깨진다). */
  function _dqFix(L, k) {
    try { if (L && L._planAxes && L._planAxes[k] && window.DraftQuality) window.DraftQuality.corrected(k, L.role || L.type); }
    catch (_e) { void _e; }
  }
  function applyFont(key) { var L = activeText(); if (!L) return; var f = FONTS.filter(function (x) { return x.key === key; })[0]; _sig('font_changed', { layerKey: L.role || L.type, before: L.font && L.font.key, after: key }); L.font = f; L.tx.style.fontFamily = f.family; L.tx.style.fontWeight = f.weight; _own(L, 'font'); }
  function applyColor(c) { var L = activeText(); if (!L) return; _sig('color_changed', { layerKey: L.role || L.type, before: L.color, after: c }); L.color = c; L.tx.style.color = c; _own(L, 'color'); }
  function applyAlign(a) { var L = activeText(); if (!L) return; _sig('alignment_changed', { layerKey: L.role || L.type, before: L.align, after: a }); L.align = a; L.tx.style.textAlign = a; _own(L, 'align'); }
  function applyScale(v) { var L = S.active; if (!L) return; L.scale = parseFloat(v); applyXf(L); }
  function activeText() { return S.active && S.active.type === 'text' ? S.active : null; }

  /* ── 스티커 ── */
  function addSticker(emoji) {
    var L = makeLayer('sticker'); L.emoji = emoji; L.fontSize = 64;
    var s = el('div', 'itl-sticker'); s.textContent = emoji; L.el.appendChild(s); L.tx = s;
    placeCenter(L, 64, 64); selectLayer(L); _pushOp({ op: 'add', L: L });
    closeStickerSheet();   // [②] 스티커 하나 고르면 하단 시트 내려가고 사진 위에서 바로 배치
  }
  /* [출시 QA 2026-08-06] 기능 스티커(위치·예약·전화·가격·시간·계정) **삭제**.
     2026-07-10 에 '작업실 설정'으로 이관하면서 `_recoChips()` 가 빈 문자열을 돌려주게 됐고,
     그때부터 `[data-feat]` 버튼을 **그리는 코드가 레포 전체에 하나도 없다** → 도달 불가.
     "롤백용 보존" 이라고 남겨뒀지만 1개월 가까이 도달 불가였고, 남아 있는 동안
     `itdasy:shop_loc` / `itdasy:shop_hours` 두 키가 '읽기만 하고 쓰는 곳이 없는' 고아로
     보여 감사 때마다 헷갈리게 했다. 값 입력은 작업실 설정, 반영은 캡션 `_shopCTA()` 로
     일원화됐으므로 여기 남길 이유가 없다. (핸들러도 아래에서 같이 제거) */
  // [②] 스티커 시트 닫기 — 도구 비활성(사진 위에서 바로 만지도록). 닫아도 우측 레일은 그대로.
  function closeStickerSheet() {
    S.tool = null;
    root.querySelectorAll('.itrb').forEach(function (b) { b.classList.remove('on'); });
    if (refs.panels.sticker) refs.panels.sticker.classList.remove('is-open');
    refs.draw.classList.remove('is-armed'); refs.draw.style.zIndex = '3';
    refs.layers.style.pointerEvents = '';
  }
  // [#7] 하단 도구패널 전체 닫기 — 아무 도구도 선택 안 한 상태로(모든 패널 내림).
  function _closeToolPanel() {
    _closeEyedrop();
    S.tool = null;
    root.querySelectorAll('.itrb').forEach(function (b) { b.classList.remove('on'); });
    Object.keys(refs.panels).forEach(function (k) { refs.panels[k].classList.remove('is-open'); });
    refs.draw.classList.remove('is-armed'); refs.draw.style.zIndex = '3'; refs.draw.style.pointerEvents = 'auto';
    refs.layers.style.pointerEvents = '';
    if (refs.collage) refs.collage.classList.remove('is-cropping');
    fitStageToRatio();
  }
  // [#7] 패널 상단을 아래로 긁으면 닫히게 — grip 요소가 있는 모든 패널에 스와이프 부착.
  // [#3·#6] 그립 스와이프 — 시트(패널) 전체가 손가락 따라 내려가고, 놓으면 닫히거나(슬라이드-다운) 부드럽게 제자리로.
  function _attachSheetSwipe(gripEl) {
    if (!gripEl) return;
    var panel = (gripEl.closest && gripEl.closest('.itpanel')) || gripEl.parentElement;
    var gd = null;
    gripEl.addEventListener('pointerdown', function (e) { gd = { y: e.clientY }; if (panel) panel.style.transition = 'none'; try { gripEl.setPointerCapture(e.pointerId); } catch (_) { void _; } });
    gripEl.addEventListener('pointermove', function (e) { if (!gd || !panel) return; var dy = e.clientY - gd.y; if (dy > 0) panel.style.transform = 'translateY(' + dy + 'px)'; });
    gripEl.addEventListener('pointerup', function (e) { if (!gd) return; var dy = e.clientY - gd.y; gd = null; if (panel) { panel.style.transition = ''; panel.style.transform = ''; } if (dy > 60) _closeToolPanel(); });
    gripEl.addEventListener('pointercancel', function () { gd = null; if (panel) { panel.style.transition = ''; panel.style.transform = ''; } });
  }
  /* ── 이미지 스티커(데코·내 스티커) #6/#7 ── */
  function addImageSticker(src) {
    var L = makeLayer('image'); L.role = 'sticker'; L.src = src;
    var im = document.createElement('img'); im.src = src; im.alt = ''; im.setAttribute('draggable', 'false');
    im.style.cssText = 'display:block;width:120px;height:auto;pointer-events:none';
    L.el.appendChild(im); L.tx = im;
    var place = function () { placeCenter(L, L.el.offsetWidth || 120, L.el.offsetHeight || 120); };
    if (im.complete && im.naturalWidth) place(); else im.onload = place;
    place(); selectLayer(L); _pushOp({ op: 'add', L: L }); closeStickerSheet();
  }
  function loadMyStk() { try { return JSON.parse(localStorage.getItem(STK_KEY) || '[]'); } catch (_) { return []; } }
  function saveMyStk(arr) { try { localStorage.setItem(STK_KEY, JSON.stringify(arr.slice(-30))); } catch (_) { void _; } }
  function renderMyStickers() {
    if (!refs.myStk) return;
    var arr = loadMyStk();
    if (!arr.length) { refs.myStk.innerHTML = '<div class="itstk__empty">사진을 올리면 내 스티커로 저장돼 언제든 쓸 수 있어요</div>'; return; }
    refs.myStk.innerHTML = arr.map(function (u, i) {
      return '<button class="itdeco itmine" data-mine="' + i + '"><img src="' + u + '" alt="" draggable="false"><span class="itmine__x" data-minedel="' + i + '">×</span></button>';
    }).join('');
  }
  function addMyStickerFromFile(file) {
    if (!file || !/^image\//.test(file.type)) return;
    var rd = new FileReader();
    rd.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 256, sc = Math.min(1, max / Math.max(img.width, img.height));
        var w = Math.max(1, Math.round(img.width * sc)), h = Math.max(1, Math.round(img.height * sc));
        var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        var url; try { url = cv.toDataURL('image/png'); } catch (_) { url = rd.result; }
        var arr = loadMyStk(); arr.push(url); saveMyStk(arr); renderMyStickers();
      };
      img.onerror = function () { var arr = loadMyStk(); arr.push(rd.result); saveMyStk(arr); renderMyStickers(); };
      img.src = rd.result;
    };
    rd.readAsDataURL(file);
  }
  function delMyStk(i) { var arr = loadMyStk(); arr.splice(i, 1); saveMyStk(arr); renderMyStickers(); }

  /* ── 도형 #8 ── */
  function styleShape(d, L) {
    var c = L.color, sw = L.strokeW || 6;
    if (L.shape === 'line') {
      // [#10] 안쪽 막대는 box 를 꽉 채운다(width/height:100%) — box 를 늘리면 선 길이가 늘어난다.
      //   막대 두께는 굵기(sw)만큼 세로 가운데. 내보내기도 sw 두께로 그림.
      d.style.cssText = 'width:100%;height:100%;border-radius:' + (sw / 2) + 'px;background:linear-gradient(' + c + ',' + c + ') center/100% ' + sw + 'px no-repeat';
    } else if (L.shape === 'arrow') {
      /* [2026-08-23] 화살표 = 선 + 머리. **선 구조를 그대로 재사용**한다 —
         새 좌표축(시작점/끝점)을 만들면 늘리기·회전·내보내기를 전부 다시 짜야 하고
         기존 도형과 조작감도 달라진다. 방향은 기존 회전(rot)으로 잡는다. */
      var hd = Math.max(sw * 2.2, 10);            // 머리 크기는 굵기에 비례 — 얇은 선에 큰 머리는 어색하다
      d.style.cssText = 'position:relative;width:100%;height:100%;' +
        'background:linear-gradient(' + c + ',' + c + ') left center/calc(100% - ' + (hd * 0.7) + 'px) ' + sw + 'px no-repeat';
      var head = d.querySelector('.itl-arrowhead');
      if (!head) { head = document.createElement('i'); head.className = 'itl-arrowhead'; d.appendChild(head); }
      head.style.cssText = 'position:absolute;right:0;top:50%;transform:translateY(-50%);width:0;height:0;' +
        'border-top:' + hd + 'px solid transparent;border-bottom:' + hd + 'px solid transparent;' +
        'border-left:' + (hd * 1.4) + 'px solid ' + c;
    } else {
      // [#10] 사각/원도 box 를 꽉 채운다 → box 의 w/h 를 따로 늘리면 가로·세로 독립으로 늘어난다.
      var base = 'box-sizing:border-box;width:100%;height:100%;';
      base += L.fill ? ('background:' + c + ';border:0;') : ('background:transparent;border:' + sw + 'px solid ' + c + ';');
      base += L.shape === 'circle' ? 'border-radius:50%' : (L.shape === 'round' ? ('border-radius:' + (L.radius != null ? L.radius : 18) + 'px') : 'border-radius:0');
      d.style.cssText = base;
    }
  }
  function addShape(kind) {
    var L = makeLayer('shape');
    L.shape = kind; L.color = S.shapeColor; L.fill = !!S.shapeFill; L.strokeW = S.shapeThick;
    var d = el('div', 'itl-shape'); styleShape(d, L); L.el.appendChild(d); L.tx = d;
    // [#10] box 크기를 명시적으로 — 이후 크기 핸들이 이 w/h 를 늘린다(비균등).
    var _isLinear = (kind === 'line' || kind === 'arrow');
    L.w = _isLinear ? 180 : 120;
    L.h = _isLinear ? Math.max((L.strokeW || 6) * 3, 28) : 120;   // 화살표 머리가 들어갈 높이
    var r = refs.stage.getBoundingClientRect();
    L.x = r.width / 2 - L.w / 2; L.y = r.height / 2 - L.h / 2; applyXf(L); selectLayer(L);
    _pushOp({ op: 'add', L: L });   // [#10] 도형 추가도 되돌리기(↩) — 예전엔 addShape 만 _pushOp 가 빠져 있었음
  }
  // [#5] 활성 도형에 색/채움/굵기 즉시 반영(새로 만드는 것뿐 아니라 선택된 것에도).
  function applyShapeStyle() {
    var L = S.active; if (!L || L.type !== 'shape') return;
    L.color = S.shapeColor; L.fill = !!S.shapeFill; L.strokeW = S.shapeThick;
    // [#10] 안쪽 막대/면은 box 를 꽉 채우므로(styleShape width/height:100%) 크기는 box(w/h)가 소유 → 여기선 스타일만 다시.
    styleShape(L.tx, L);
  }
  // [①] PC/모바일 공통 — 가로 스크롤 줄(폰트/색/칩)을 드래그로 넘김(인스타식 스와이프).
  function enableDragScroll(elm) {
    if (!elm || elm._dragScroll) return; elm._dragScroll = true;
    var down = false, sx = 0, sl = 0, moved = 0;
    elm.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') return;   // 터치는 네이티브 관성 스크롤 그대로
      down = true; sx = e.clientX; sl = elm.scrollLeft; moved = 0; elm.classList.add('is-dragging');
    });
    elm.addEventListener('pointermove', function (e) {
      if (!down) return; var dx = e.clientX - sx; moved = Math.max(moved, Math.abs(dx)); elm.scrollLeft = sl - dx;
    });
    var up = function () { down = false; elm.classList.remove('is-dragging'); };
    elm.addEventListener('pointerup', up); elm.addEventListener('pointerleave', up);
    // 드래그였으면 버튼 클릭 무효화(드래그 끝의 의도치 않은 선택 방지)
    elm.addEventListener('click', function (e) { if (moved > 6) { e.stopPropagation(); e.preventDefault(); moved = 0; } }, true);
  }

  /* ── 레이아웃(타입 칩 + 사진 순서 선택) ── */
  function selectLayout(i) {
    S.layout = LAYOUTS[i];
    S.cellCrop = [];
    // [흰백지/복제 수정] 콜라주 고르면 '가진 사진'을 칸에 자동 배치(중복 없이). 사진이 칸보다 적으면 남는 칸은 빈 칸(사진 필요) 안내.
    //   예전엔 layoutOrder 가 비어 흰 백지가 뜨거나(사진 미선택), 한 장이 여러 칸에 복제돼 보였음.
    var _need = _layCells().length, _order = [];
    for (var _pi = 0; _pi < (S.photos || []).length && _order.length < _need; _pi++) { if (S.photos[_pi] != null) _order.push(_pi); }
    S.layoutOrder = isSingleL(S.layout) ? [] : _order;
    refs.frame.className = 'itded__frame';
    refs.frame.className = 'itded__frame';
    root.querySelectorAll('.itlaytype').forEach(function (b) { b.classList.toggle('on', +b.getAttribute('data-lay') === i); });
    // [#2] 콜라주는 칸에 '꽉 채움(cover)'이 기본 — 칸을 채우고, 잘리는 부분은 칸을 드래그해 보일 곳을 고른다(재구도).
    //   전체보기(contain)를 원하면 fit 토글. 단일은 전체.
    if (!S._fitManual) { S.fitMode = isSingleL(S.layout) ? 'contain' : 'cover'; _syncFitToggle(); }
    _syncBaLabels();   // [전/후] 전/후 레이아웃이면 BEFORE·AFTER 라벨 자동, 아니면 제거
    applyPhotoTransform();   // [#2] 단일↔콜라주 전환 시 photowrap 회전 리셋(콜라주 전체 휘어짐 방지)
    renderCollage(); renderLayoutStrip(); renderLayoutHint();
  }
  // [전/후 비교] BEFORE/AFTER 코너 라벨(배지) — 전/후 레이아웃 선택 시 자동 삽입, 해제 시 제거.
  function _syncBaLabels() {
    S.layers.slice().forEach(function (L) { if (L.role === 'balabel') removeLayer(L, false); });
    if (!(S.layout && S.layout.ba)) return;
    var R = refs.stage.getBoundingClientRect();
    [['BEFORE', 0.25], ['AFTER', 0.75]].forEach(function (p) {
      var L = addShopLayer({ type: 'badge', text: p[0], x: p[1], y: 0.09, size: 0.03, align: 'center', color: '#fff', bg: 'rgba(21,24,29,.55)', weight: 800, role: 'balabel' }, R);
      // [버그수정 2026-07-09] BEFORE/AFTER 라벨은 레이아웃에 자동 동기(제거도 track=false) — undo 스택에 안 넣음(비대칭 유령op 방지).
      L.role = 'balabel';
    });
  }
  function _syncFitToggle() {
    if (!refs.layFit) return;
    refs.layFit.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-fit') === (S.fitMode || 'cover')); });
  }
  // 사진 순서 탭 — grid면 자리(좌우/4분할)에 순서대로 배정, 1장이면 그 사진을 단일 배경으로.
  function onLayThumb(idx) {
    if (isSingleL(S.layout)) {
      if (idx !== S.adjSel) { _switchPhotoDraw(S.adjSel, idx); _switchPhotoLayers(S.adjSel, idx); S.adjSel = idx; }   // [#9] 그리기 + [#5/#6] 텍스트·스티커도 사진별로
      S.photoUrl = S.photos[idx]; S.photoCss = 'url("' + S.photos[idx] + '")';
      refs.photo.style.backgroundImage = S.photoCss;
      applyAdjToDisplay();   // [#11] 사진 바꾸면 배경-제외 오버레이(photofx)도 이 사진 기준으로 다시
      renderLayoutStrip(); renderLayoutHint(); return;
    }
    var at = S.layoutOrder.indexOf(idx);
    if (at >= 0) S.layoutOrder.splice(at, 1);              // 다시 누르면 해제(뒤 번호 당겨짐)
    else if (S.layoutOrder.length < _layN()) S.layoutOrder.push(idx);
    renderCollage(); renderLayoutStrip(); renderLayoutHint();
  }
  function renderLayoutStrip() {
    if (!refs.layStrip) return;
    var single = isSingleL(S.layout);
    refs.layStrip.innerHTML = (S.photos || []).map(function (u, i) {
      var ord = single ? (S.photoUrl === u ? 0 : -1) : S.layoutOrder.indexOf(i);
      var badge = (!single && ord >= 0) ? '<span class="itlaybadge">' + (ord + 1) + '</span>' : '';
      var sel = (single && S.photoUrl === u) ? ' on' : (ord >= 0 ? ' on' : '');
      return '<button class="itlaythumb' + sel + '" data-laythumb="' + i + '" style="background-image:url(\'' + u + '\')">' + badge + '</button>';
    }).join('');
  }
  function renderLayoutHint() {
    if (!refs.layHint) return;
    if (isSingleL(S.layout)) { refs.layHint.textContent = '넣을 사진 하나를 누르세요'; return; }
    var pos = _layPosArr(), need = _layN();
    var filled = S.layoutOrder.length, have = (S.photos || []).length;
    // [사진 부족 안내] 이 레이아웃이 요구하는 장수보다 사진이 적으면 복제 대신 '몇 장 더 필요' 안내(빈 칸 유지).
    if (have < need) {
      refs.layHint.innerHTML = '<b>' + S.layout.label + '</b> — 사진 <b class="itlay2__cnt">' + need + '장</b>이 필요해요 (지금 ' + have + '장) · 아래 <b>사진</b> 버튼으로 더 추가하세요';
      return;
    }
    refs.layHint.innerHTML = '<b>' + S.layout.label + '</b> 순서대로 탭 · ' +
      pos.map(function (p, i) { return (i + 1) + '=' + p; }).join(' ') + ' <b class="itlay2__cnt">' + filled + '/' + need + '</b>' +
      (filled ? '<span class="itlay2__tip">칸 끌어 위치 · 두 손가락 확대</span>' : '');
  }
  // 콜라주(좌우2장/4장) — 단일이면 collage 숨김. grid면 선택 순서(layoutOrder)대로 칸 채움(미선택=자리표시).
  function renderCollage() {
    var fit = S.fitMode || 'cover';
    if (isSingleL(S.layout)) { refs.collage.hidden = true; refs.collage.className = 'itded__collage'; refs.collage.innerHTML = ''; refs.photo.style.backgroundImage = S.photoCss; refs.photo.style.backgroundSize = fit; refs.photo.style.backgroundColor = (fit === 'contain' ? (S.collageBg || '#fff') : 'transparent'); return; }
    if (refs.photofx) { refs.photofx.hidden = true; }   // [#11] 콜라주 모드 — 단일용 오버레이는 끈다(셀별 fx 는 셀 안에서 처리)
    // [SSOT] 셀 좌표 그대로 절대배치 — 비대칭(1+2·2+1) 포함 모든 모양 지원, export와 동일 좌표.
    var cellsSpec = _layCells(), pos = _layPosArr(), gap = (S.collageGap != null ? S.collageGap : 3), cells = '';
    for (var k = 0; k < cellsSpec.length; k++) {
      var cc = cellsSpec[k];
      var st = 'left:calc(' + (cc[0] * 100) + '% + ' + (gap / 2) + 'px);top:calc(' + (cc[1] * 100) + '% + ' + (gap / 2) + 'px);' +
        'width:calc(' + (cc[2] * 100) + '% - ' + gap + 'px);height:calc(' + (cc[3] * 100) + '% - ' + gap + 'px)';
      var idx = S.layoutOrder[k];
      // [#2] 셀마다 그 사진의 수평보정(rot)을 개별 반영 — 콜라주 전체가 아니라 각 칸만 회전.
      var _rdeg = (idx != null ? (adjOf(idx).rot || 0) : 0);
      var _rot = _rdeg ? (' rotate(' + _rdeg + 'deg) scale(' + coverScaleForRot(_rdeg) + ')') : '';
      if (idx != null && S.photos[idx]) {
        var _flt = filterStr(adjOf(idx));
        var _imgSt = 'object-fit:' + fit + ';transform:' + cropXf(k) + _rot;
        // [#11 2026-07-18] 누끼 셀은 셀 전체에 보정하지 않는다 — 베이스 img(보정X) + fx 오버레이(보정+사람 마스크).
        //   배경(마스크 밖)은 fx 가 투명 → 아래 베이스가 보여 배경 원래색 유지. fgMask 없으면 예전대로 셀 필터.
        //   fx 는 <img> 가 아니라 background-image div — background-size 가 object-fit 과 같은 방식(cover/contain)으로
        //   잘려서 베이스 img 와 픽셀 정렬된다(img+mask 는 object-fit 크롭과 mask-size 가 어긋남). transform 은 동일 적용.
        if (_fgOn(idx)) {
          var _m = 'url(&quot;' + S.fgMask[idx] + '&quot;)';
          var _fxSt = 'position:absolute;inset:0;background-image:url(&quot;' + S.photos[idx] + '&quot;);background-size:' + fit +
            ';background-position:center;background-repeat:no-repeat;transform:' + cropXf(k) + _rot + ';filter:' + _flt +
            ';-webkit-mask-image:' + _m + ';mask-image:' + _m + ';-webkit-mask-size:' + fit + ';mask-size:' + fit +
            ';-webkit-mask-position:center;mask-position:center;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;pointer-events:none';
          cells += '<div class="itded__cell" data-ci="' + idx + '" data-cell="' + k + '" style="' + st + ';filter:none">' +
            '<img class="itcellimg" src="' + S.photos[idx] + '" draggable="false" style="' + _imgSt + '">' +
            '<div class="itcellfx" aria-hidden="true" style="' + _fxSt + '"></div>' +
            '</div>';
        } else {
          cells += '<div class="itded__cell" data-ci="' + idx + '" data-cell="' + k + '" style="' + st + ';filter:' + _flt + '"><img class="itcellimg" src="' + S.photos[idx] + '" draggable="false" style="' + _imgSt + '"></div>';
        }
      } else cells += '<div class="itded__cell itded__cell--empty" data-cell="' + k + '" style="' + st + '">' + (k + 1) + '번<br>' + (pos[k] || '') + '</div>';
    }
    refs.collage.className = 'itded__collage is-abs';
    refs.collage.style.gap = '';
    refs.collage.style.background = S.collageBgImg ? ('center/cover no-repeat url("' + S.collageBgImg + '")') : (S.collageBg || '#fff');
    refs.collage.innerHTML = cells; refs.collage.hidden = false;
  }
  // [#5] 꽉 채움(cover)/전체(contain) — 풀 사진이 잘리지 않게 '전체'면 여백에 배경색.
  function applyFit() {
    var fit = S.fitMode || 'cover';
    if ((S.layout.kind || 'single') === 'single') {
      refs.photo.style.backgroundSize = fit; refs.photo.style.backgroundColor = (fit === 'contain' ? (S.collageBg || '#fff') : 'transparent');
    } else { renderCollage(); }
  }
  // [#2 단일화·WYSIWYG] 스테이지를 게시물 비율(4:5 등) 박스로 고정 — 화면 전체로 늘어나지 않게.
  //   편집기(실기기)·헤드리스 compose(432px) 모두 같은 종횡비 → 줄바꿈/겹침방지/내보내기 100% 일치(#2).
  //   바깥 여백은 .itded 어두운 배경, 상단바·우측레일·하단패널은 absolute 오버레이라 겹쳐도 OK.
  function fitStageToRatio() {
    if (!root || !refs.stage) return;
    var rp = String(S && S.ratio || '4:5').split(':'); var rw = +rp[0] || 4, rh = +rp[1] || 5;
    var availW = root.clientWidth || 432, availH = root.clientHeight || 540;
    var w = availW, h = w * rh / rw;
    if (h > availH) { h = availH; w = h * rw / rh; }
    refs.stage.style.flex = '0 0 auto';
    refs.stage.style.width = Math.round(w) + 'px';
    refs.stage.style.height = Math.round(h) + 'px';
    refs.stage.style.margin = 'auto';   // 항상 가운데(자동 위로-이동은 하단 텍스트를 패널 밑으로 숨겨 제거 — #7). 사진 전체 확인은 peek 토글로.
  }
  /* ── 셀별 크롭(콜라주 칸마다 드래그/핀치 재구도) ── */
  function cropOf(k) { if (!S.cellCrop[k]) S.cellCrop[k] = { s: 1, tx: 0, ty: 0 }; return S.cellCrop[k]; }
  function cropXf(k) { var c = (S.cellCrop && S.cellCrop[k]) || { s: 1, tx: 0, ty: 0 }; return 'translate(' + c.tx + 'px,' + c.ty + 'px) scale(' + c.s + ')'; }
  function cellElByK(k) { return refs.collage.querySelector('[data-cell="' + k + '"]'); }
  function clampCrop(k) { var c = cropOf(k), el2 = cellElByK(k); if (!el2) return; var r = el2.getBoundingClientRect(); var mx = (c.s - 1) * r.width / 2, my = (c.s - 1) * r.height / 2; c.tx = Math.max(-mx, Math.min(mx, c.tx)); c.ty = Math.max(-my, Math.min(my, c.ty)); }
  function applyCrop(k) { clampCrop(k); var el2 = cellElByK(k); if (!el2) return; var xf = cropXf(k);
    var im = el2.querySelector('.itcellimg'); if (im) im.style.transform = xf;
    var fx = el2.querySelector('.itcellfx'); if (fx) fx.style.transform = xf;   // [#11] 누끼 셀 크롭 시 fx 오버레이도 같이 (안 그러면 마스크가 어긋남)
  }
  function selectCell(k) { S.cellSel = k; refs.collage.querySelectorAll('[data-cell]').forEach(function (c) { c.classList.toggle('is-cellsel', +c.getAttribute('data-cell') === k); }); }
  var cropDrag = null, cropPinch = null, cellPts = {}, _cellBefore = null;
  function onCellDown(e) {
    if (refs.collage.hidden) return;
    var cell = e.target.closest && e.target.closest('[data-cell]'); if (!cell) return;
    e.preventDefault();
    var k = +cell.getAttribute('data-cell'); selectCell(k);
    // [#9] 이 칸을 만지기 시작한 순간의 크롭(위치·확대) 스냅샷 — 손 떼면 바뀐 만큼 되돌리기 스택에.
    if (!_cellBefore || _cellBefore.k !== k) { var _c0 = cropOf(k); _cellBefore = { k: k, s: _c0.s, tx: _c0.tx, ty: _c0.ty }; }
    cellPts[k] = cellPts[k] || {}; cellPts[k][e.pointerId] = { x: e.clientX, y: e.clientY };
    try { refs.collage.setPointerCapture(e.pointerId); } catch (_) { void _; }
    var ids = Object.keys(cellPts[k]); var c = cropOf(k);
    if (ids.length >= 2) { cropDrag = null; var p1 = cellPts[k][ids[0]], p2 = cellPts[k][ids[1]]; cropPinch = { k: k, ids: [ids[0], ids[1]], d0: Math.max(8, Math.hypot(p1.x - p2.x, p1.y - p2.y)), s0: c.s }; return; }
    cropDrag = { k: k, sx: e.clientX, sy: e.clientY, tx0: c.tx, ty0: c.ty };
  }
  function onCellMove(e) {
    if (cropPinch) {
      var k = cropPinch.k; if (cellPts[k] && cellPts[k][e.pointerId]) cellPts[k][e.pointerId] = { x: e.clientX, y: e.clientY };
      var p1 = cellPts[k] && cellPts[k][cropPinch.ids[0]], p2 = cellPts[k] && cellPts[k][cropPinch.ids[1]]; if (!p1 || !p2) return;
      var c = cropOf(k); c.s = Math.max(1, Math.min(4, cropPinch.s0 * Math.hypot(p1.x - p2.x, p1.y - p2.y) / cropPinch.d0)); applyCrop(k); return;
    }
    if (cropDrag) { var c2 = cropOf(cropDrag.k); c2.tx = cropDrag.tx0 + (e.clientX - cropDrag.sx); c2.ty = cropDrag.ty0 + (e.clientY - cropDrag.sy); applyCrop(cropDrag.k); }
  }
  function onCellUp(e) {
    var kk; for (kk in cellPts) { if (cellPts[kk] && cellPts[kk][e.pointerId]) delete cellPts[kk][e.pointerId]; }
    if (cropPinch && (!cellPts[cropPinch.k] || Object.keys(cellPts[cropPinch.k]).length < 2)) cropPinch = null;
    cropDrag = null;
    // [#9] 이 칸에 남은 손가락이 없으면(제스처 종료) 바뀐 만큼 되돌리기 스택에 — 실수로 옮긴 칸 사진 원위치.
    if (_cellBefore) {
      var bk = _cellBefore.k, still = cellPts[bk] && Object.keys(cellPts[bk]).length;
      if (!still) {
        var now = cropOf(bk), b = _cellBefore;
        if (now.s !== b.s || now.tx !== b.tx || now.ty !== b.ty) {
          _pushOp({ op: 'cellcrop', k: bk, before: { s: b.s, tx: b.tx, ty: b.ty }, after: { s: now.s, tx: now.tx, ty: now.ty } });
        }
        _cellBefore = null;
      }
    }
  }

  /* ── 사진별 보정(밝기/대비/채도/온도/선명도) ── */
  function adjOf(i) { if (!S.adj[i]) S.adj[i] = defAdj(); return S.adj[i]; }
  function adjReadout(c, v) { return (c.k === 'w' || c.k === 'sh') ? ('' + v) : ((v - 100 >= 0 ? '+' : '') + (v - 100)); }
  var _adjRaf = 0;
  function applyAdjThrottled() { if (_adjRaf) return; var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); }; _adjRaf = raf(function () { _adjRaf = 0; applyAdjToDisplay(); }); }
  /* [#11 2026-07-18] 누끼(배경 교체)한 사진은 기본 보정을 '사람'에만 건다.
     배경은 원장이 고른 깨끗한 배경이라 밝기·대비·채도·온도·선명도가 먹으면 고른 색이 틀어진다.
     방식(미리보기): refs.photo 는 보정 없이(=배경 원래색) + 위에 photofx 오버레이에 같은 사진 + 보정 +
       사람 마스크(-webkit-mask). 마스크 밖(배경)은 오버레이가 투명 → 아래 원본이 그대로 보인다.
       photofx 는 photowrap 안이라 pz 변형을 자동 상속, 같은 background-size 로 base 와 픽셀 정렬.
     내보내기(exportComposite)는 canvas 에서 같은 마스크로 배경을 되돌린다(아래).
     fgMask 없으면(누끼 안 함·구 매트) 이 경로를 안 타고 예전 그대로. */
  // 보정 안 건 상태(항등) — filterStr 은 기본값도 'brightness(1.00)…' 라 'none' 이 아니다. 여기서 판정.
  function _adjIsId(a) { return !a || ((a.b || 100) === 100 && (a.c || 100) === 100 && (a.s || 100) === 100 && !(a.w > 0) && !(a.sh > 0)); }
  function _fgOn(i) { return !!(S.fgMask && S.fgMask[i]); }
  function _fgActive(i) { return _fgOn(i) && !_adjIsId(adjOf(i)); }   // 누끼 + 실제 보정 있을 때만 2겹
  function _syncSingleFx(idx) {
    var fx = refs.photofx; if (!fx) { refs.photo.style.filter = filterStr(adjOf(idx < 0 ? 0 : idx)); return; }
    var i = idx < 0 ? 0 : idx, flt = filterStr(adjOf(i)), fit = S.fitMode || 'cover';
    if (_fgActive(i)) {
      refs.photo.style.filter = 'none';                 // base = 보정 없음(배경 원래색)
      fx.hidden = false;
      fx.style.backgroundImage = S.photoCss;
      fx.style.backgroundSize = fit; fx.style.backgroundPosition = 'center'; fx.style.backgroundRepeat = 'no-repeat';
      fx.style.filter = flt;
      var m = 'url("' + S.fgMask[i] + '")';
      fx.style.webkitMaskImage = m; fx.style.maskImage = m;
      fx.style.webkitMaskSize = fit; fx.style.maskSize = fit;
      fx.style.webkitMaskPosition = 'center'; fx.style.maskPosition = 'center';
      fx.style.webkitMaskRepeat = 'no-repeat'; fx.style.maskRepeat = 'no-repeat';
    } else {
      refs.photo.style.filter = flt;                    // 기존 동작(전체 보정)
      fx.hidden = true; fx.style.webkitMaskImage = ''; fx.style.maskImage = '';
    }
  }
  function applyAdjToDisplay() {
    if ((S.layout.kind || 'single') === 'single') {
      _syncSingleFx(S.photos.indexOf(S.photoUrl));
    } else {
      // [#1 끊김] 셀 innerHTML 재생성(배경이미지 재디코딩) 대신 필터만 in-place 갱신.
      //   [#11] 누끼 셀(fgMask 있음)은 fx 오버레이 img 의 필터를, 아니면 셀 자체 필터를 갱신.
      refs.collage.querySelectorAll('.itded__cell[data-ci]').forEach(function (cell) {
        var ci = +cell.getAttribute('data-ci'), flt = filterStr(adjOf(ci)), fxi = cell.querySelector('.itcellfx');
        if (fxi) { cell.style.filter = 'none'; fxi.style.filter = _adjIsId(adjOf(ci)) ? 'none' : flt; }
        else cell.style.filter = flt;
      });
    }
  }
  function syncAdjSliders() {
    var a = adjOf(S.adjSel);
    ADJ_CTRLS.forEach(function (c) {
      var inp = root.querySelector('[data-adj="' + c.k + '"]'); if (inp) inp.value = a[c.k];
      var out = root.querySelector('[data-adjout="' + c.k + '"]'); if (out) out.textContent = adjReadout(c, a[c.k]);
    });
    if (refs.adjRot) refs.adjRot.value = a.rot || 0;
    if (refs.adjRotOut) refs.adjRotOut.textContent = (a.rot || 0) + '°';
  }
  function renderAdjust() {
    if (!refs.adjStrip) return;
    refs.adjStrip.innerHTML = (S.photos || []).map(function (u, i) {
      return '<button class="itadjthumb' + (i === S.adjSel ? ' on' : '') + '" data-adjthumb="' + i + '" style="background-image:url(\'' + u + '\');filter:' + filterStr(adjOf(i)) + '"></button>';
    }).join('');
    syncAdjSliders();
  }
  function onAdjThumb(i) {
    if (i === S.adjSel) return;
    _switchPhotoDraw(S.adjSel, i);   // [#9] 그리기는 사진별 — 전환 시 저장/복원(다른 사진에 안 넘어감)
    S.adjSel = i;
    if ((S.layout.kind || 'single') === 'single') { S.photoUrl = S.photos[i]; S.photoCss = 'url("' + S.photos[i] + '")'; refs.photo.style.backgroundImage = S.photoCss; }
    applyAdjToDisplay(); applyStraighten(); renderAdjust();
  }
  // [#9] 편집기 안에서 사진을 바꿀 때 그리기(캔버스)를 사진별로 보관·복원 — 한 사진에 그린 게 다른 사진에 안 뜨게.
  function _switchPhotoDraw(oldIdx, newIdx) {
    if (oldIdx === newIdx || !refs.ctx || !refs.draw) return;
    if (!S.photoDraw) S.photoDraw = {};
    var c = refs.ctx;
    try { S.photoDraw[oldIdx] = refs.draw.toDataURL(); } catch (_e) { void _e; }
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, refs.draw.width, refs.draw.height); c.restore();
    var saved = S.photoDraw[newIdx];
    if (saved) { var im = new Image(); im.onload = function () { try { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(im, 0, 0); c.restore(); } catch (_e2) { void _e2; } }; im.src = saved; }
  }
  // [#5/#6] 사진별 텍스트/스티커 분리 — 단일모드에서 장 전환 시 현재 레이어를 그 장에 보관하고, 넘어간 장의 레이어를 복원.
  //   좌우(사진 스트립)로 넘기며 각 사진에 다른 글/스티커/링크를 얹을 수 있다(인스타 캐러셀 장별 편집).
  function _switchPhotoLayers(oldIdx, newIdx) {
    if (oldIdx === newIdx) return;
    if (!S.layersByPhoto) S.layersByPhoto = {};
    S.layersByPhoto[oldIdx] = (S.layers || []).map(_serLayer).filter(Boolean);   // 현재 장 레이어 직렬화 보관
    S.layers.slice().forEach(function (L) { try { if (L.el && L.el.remove) L.el.remove(); } catch (_e) { void _e; } });
    S.layers = []; S.active = null; S.undo = []; S.redo = [];
    var saved = S.layersByPhoto[newIdx];
    if (saved && saved.length) _restoreLayers(saved);   // 넘어간 장 레이어 복원
  }
  // [#4] 배경 선호(색/이미지) 기억 — 다음에도 같은 배경.
  function loadBgPref() { try { return JSON.parse(localStorage.getItem('itdasy:itd_bg') || '{}'); } catch (_) { return {}; } }
  function saveBgPref() { try { localStorage.setItem('itdasy:itd_bg', JSON.stringify({ color: S.collageBg, img: S.collageBgImg || null })); } catch (_) { void _; } }
  // [누끼] 사진 배경 제거 → '고른 배경'(색/이미지)으로 합성. 매트(removedBg)를 캐시해 다음 배경 변경은 0초(API 0).
  function doCutout(idx, silent) {
    if (!(window.PhotoEditorBgCompose && window.PhotoEditorBgCompose.compose)) { if (!silent) toastIt('배경 제거 모듈을 불러오지 못했어요'); return; }
    var i = (idx != null ? idx : S.adjSel);
    if (!S.origPhotos) S.origPhotos = []; if (S.origPhotos[i] == null) S.origPhotos[i] = S.photos[i];   // 원본 1회 보관
    var src = S.origPhotos[i]; if (!src) return;
    var _preUrl = S.photos[i], _preCut = !!(S.cutSet && S.cutSet[i]);   // [#9] 되돌리기용 이전 상태 스냅샷
    S.matte = S.matte || {}; S.cutSet = S.cutSet || {};
    var cached = S.matte[i] || null;   // 매트 있으면 누끼 재요청 없이 배경만 다시 입힘(빠름)
    if (!silent && refs.adjCut) { refs.adjCut.disabled = true; refs.adjCut.classList.add('is-busy'); }
    if (!silent) toastIt(cached ? '배경 입히는 중…' : '배경 지우는 중…');
    // [#8] 누끼 배경은 사진별 — S.photoBg[i] 우선(없으면 흰색). 한 사진 배경 바꿔도 다른 사진 안 바뀜.
    S.photoBg = S.photoBg || {};
    var _pb = S.photoBg[i];
    var bg = _pb ? (_pb.img ? { imageData: _pb.img } : { color: _pb.color || '#FFFFFF' }) : { color: '#FFFFFF' };
    var _sess = S;   // [audit] 세션 스냅샷 — 누끼 대기 중 back으로 닫고 재진입하면 옛 결과가 새 세션 사진을 덮던 버그 방지.
    // [2026-07-26 원영] targetRatio '4:5' → 'original' — 누끼는 배경만 바꾸고 구도(위치·크기)는 원본 그대로.
    //   '4:5' 강제 크롭 + 인물 재배치가 "누끼 땄더니 확대·이동" 버그의 원인이었음.
    window.PhotoEditorBgCompose.compose({ srcUrl: src, bg: bg, targetRatio: 'original', preRemovedBgUrl: cached }).then(function (r) {
      if (S !== _sess || !root.classList.contains('is-open')) return;   // 편집기 닫혔거나 다른 세션 → 무시(유령 반영 방지)
      if (!silent && refs.adjCut) { refs.adjCut.disabled = false; refs.adjCut.classList.remove('is-busy'); }
      if (!r || !r.composedDataUrl) { if (!silent) toastIt('배경 제거에 실패했어요'); return; }
      if (r.removedBgDataUrl) S.matte[i] = r.removedBgDataUrl;   // 매트 캐시
      // [#11 2026-07-18] 합성본 정렬 사람 마스크 — 기본 보정(밝기·대비·채도·온도·선명도)을 사람에만 걸 때 쓴다.
      //   removedBgDataUrl(누끼 PNG)은 자기 좌표계라 place 로 배치·크롭된 합성본과 안 맞음 → compose 가 정렬해 준 것만 씀.
      if (r.personMaskDataUrl) S.fgMask[i] = r.personMaskDataUrl; else delete S.fgMask[i];
      S.cutSet[i] = true;
      S.photos[i] = r.composedDataUrl;
      // [#1] 누끼 대기 중 장을 바꿔도 어긋나지 않게 — 완료 시 '지금 보고 있는 장'을 항상 최신 S.photos 로 반영.
      //   (예전엔 누끼 시작 시점의 장이 그대로 표시 중일 때만 갱신해서, 대기 중 전환하면 사진이 안 바뀌어 보였음)
      if (isSingleL(S.layout)) {
        var _curU = S.photos[S.adjSel];
        if (_curU) { S.photoUrl = _curU; S.photoCss = 'url("' + _curU + '")'; refs.photo.style.backgroundImage = S.photoCss; }
      }
      renderAdjust(); renderLayoutStrip(); renderCollage(); applyAdjToDisplay(); applyPhotoTransform();   // [#7] 누끼 후에도 수평(회전) 유지·반영
      // [#9] 사용자가 직접 누른 누끼만 되돌리기 스택에 기록(배경변경 재합성=silent은 제외).
      if (!silent && _preUrl !== r.composedDataUrl) _pushOp({ op: 'photo', idx: i, before: { url: _preUrl, cut: _preCut }, after: { url: r.composedDataUrl, cut: true } });
      // [2026-07-26 원영] ③ 누끼 = 배경 고르려고 하는 것 — 완료 즉시 배경 고르기 줄로 시선 유도(하이라이트 + 안내).
      if (!silent) {
        toastIt('배경을 지웠어요 — 아래에서 배경 색이나 사진을 고르세요');
        if (refs.adjCutBg) {
          try { refs.adjCutBg.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (_e) { void _e; }
          refs.adjCutBg.classList.add('is-hint');
          setTimeout(function () { if (refs.adjCutBg) refs.adjCutBg.classList.remove('is-hint'); }, 2400);
        }
      }
    }).catch(function (e) {
      if (S !== _sess || !root.classList.contains('is-open')) return;   // 닫힌/다른 세션 → 무시
      if (!silent && refs.adjCut) { refs.adjCut.disabled = false; refs.adjCut.classList.remove('is-busy'); }
      // [#2] 실패 사유를 사람말로 — 한도(429)·로그인·네트워크 구분(무엇이 막혔는지 보이게).
      var msg = String((e && e.message) || e || '');
      var human = /한도|429/.test(msg) ? msg
        : /401|auth|로그인/.test(msg) ? '로그인이 필요해요(누끼는 서버 처리예요)'
        : '배경 제거에 실패했어요 — 네트워크/한도를 확인해 주세요';
      if (!silent) toastIt(human);
    });
  }
  // 배경(색/이미지) 바뀌면 이미 누끼한 사진들을 캐시 매트로 즉시 재합성(0초).
  // [#8] 배경 바꾸면 '현재 사진'만 재합성(0초, 매트캐시). 예전엔 누끼한 모든 사진을 다 바꿔 '전체 배경 변경'이었음.
  function recutWithBg() { if (S.cutSet && S.cutSet[S.adjSel]) doCutout(S.adjSel, true); }
  // [#2] 배경(색/사진) 바꾸면 적용 — 이미 누끼면 0초 교체, 아직 안 했으면 지금 누끼하며 배경 적용(눈에 보이게).
  function applyBgChange() {
    if (S.cutSet && S.cutSet[S.adjSel]) recutWithBg();
    else doCutout(S.adjSel);   // 처음 배경 고르면 자동 누끼로 반영(예전엔 아무 일도 안 나 '적용 안 됨')
  }
  function undoCutout() {
    var i = S.adjSel; if (!(S.origPhotos && S.origPhotos[i] != null)) { toastIt('되돌릴 원본이 없어요'); return; }
    var wasShown = (S.photoUrl === S.photos[i]); var orig = S.origPhotos[i];
    var _preUrl = S.photos[i], _preCut = !!(S.cutSet && S.cutSet[i]);   // [#9] 되돌리기용 스냅샷
    S.photos[i] = orig; if (S.cutSet) S.cutSet[i] = false;
    if (S.fgMask) delete S.fgMask[i];   // [#11] 원본 복원 = 배경 교체 해제 → 보정을 다시 사진 전체에
    if (wasShown) { S.photoUrl = orig; S.photoCss = 'url("' + orig + '")'; refs.photo.style.backgroundImage = S.photoCss; }
    renderAdjust(); renderLayoutStrip(); renderCollage(); applyAdjToDisplay();
    // [#9] '원본으로' 도 ↩ 되돌리기 스택에 — ↩ 누르면 다시 누끼 상태로.
    if (_preUrl !== orig) _pushOp({ op: 'photo', idx: i, before: { url: _preUrl, cut: _preCut }, after: { url: orig, cut: false } });
    toastIt('원본으로 되돌렸어요');
  }
  function toastIt(m) { try { (window.showToast || function () {})(m); } catch (_) { void _; } }
  function addPhotoFromFile(file) {
    if (!file || !/^image\//.test(file.type)) return;
    var rd = new FileReader();
    rd.onload = function () {
      S.photos.push(rd.result); S.adj.push(defAdj());
      // [#11] 콜라주면 새 사진을 즉시 빈 칸에 자동 배치하고 콜라주/힌트를 다시 그린다.
      //   예전엔 layoutOrder·renderCollage 갱신을 안 해, 추가해도 사진이 '사라진 것처럼' 보이고
      //   레이아웃을 바꿔야(=selectLayout 자동채움) 비로소 보였다.
      if (!isSingleL(S.layout)) {
        var newIdx = S.photos.length - 1;
        if (S.layoutOrder.indexOf(newIdx) < 0 && S.layoutOrder.length < _layN()) S.layoutOrder.push(newIdx);
        renderCollage(); renderLayoutHint();
      }
      renderLayoutStrip(); renderAdjust();
    };
    rd.readAsDataURL(file);
  }
  // [#4] 배경 사진 업로드 — 축소 저장 → 콜라주/누끼 배경으로 + 기억(persist).
  function addBgImageFromFile(file) {
    if (!file || !/^image\//.test(file.type)) return;
    var rd = new FileReader();
    rd.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 900, sc = Math.min(1, max / Math.max(img.width, img.height));
        var w = Math.max(1, Math.round(img.width * sc)), h = Math.max(1, Math.round(img.height * sc));
        var cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h);
        var _u; try { _u = cv.toDataURL('image/jpeg', 0.85); } catch (_) { _u = rd.result; }
        S.photoBg = S.photoBg || {}; S.photoBg[S.adjSel] = { img: _u };   // [#8] 현재 사진 배경만
        try { localStorage.setItem('itdasy:itd_bgimg', _u); } catch (_e3) { void _e3; }   // [#2] 다음에도 재사용
        if (refs.adjCutBg) { var rb = refs.adjCutBg.querySelector('[data-cutbgimg]'); if (rb) rb.style.backgroundImage = 'url(\'' + _u + '\')'; }
        renderCollage(); applyFit(); applyBgChange(); toastIt('배경 사진을 적용했어요');   // [#2] 처음이면 자동 누끼로 바로 반영
      };
      img.onerror = function () { S.collageBgImg = rd.result; saveBgPref(); renderCollage(); applyFit(); };
      img.src = rd.result;
    };
    rd.readAsDataURL(file);
  }

  /* ── 그리기 ── */
  function initCanvas() {
    var r = refs.stage.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    refs.draw.width = Math.round(r.width * dpr); refs.draw.height = Math.round(r.height * dpr);
    refs.draw.style.width = r.width + 'px'; refs.draw.style.height = r.height + 'px';
    refs.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); refs.ctx.lineCap = 'round'; refs.ctx.lineJoin = 'round';
  }
  function strokeStyle() {
    var c = refs.ctx; c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.shadowBlur = 0; c.shadowColor = 'transparent';
    c.lineWidth = S.brushSize; c.strokeStyle = S.drawColor;
    if (S.brush === 'marker') { c.globalAlpha = 0.4; c.lineWidth = S.brushSize * 1.8; }
    // [#5] 네온 — 진한 색 글로우(강한 shadowBlur)로 빛나는 느낌. 코어는 얇게 두고 글로우가 번지게.
    else if (S.brush === 'neon') { c.shadowBlur = Math.max(16, S.brushSize * 1.6); c.shadowColor = S.drawColor; c.lineWidth = Math.max(3, S.brushSize * 0.7); c.lineCap = 'round'; c.lineJoin = 'round'; }
    else if (S.brush === 'eraser') { c.globalCompositeOperation = 'destination-out'; c.lineWidth = S.brushSize * 1.6; }
  }
  var dpos = null, _drawRect = null;
  function drawDown(e) {
    if (S.tool !== 'draw') return;
    _drawRect = refs.stage.getBoundingClientRect();   // [⑤렉] 스트로크 시작 때 1회만 측정 → move 마다 reflow 제거
    dpos = { x: e.clientX - _drawRect.left, y: e.clientY - _drawRect.top };
    strokeStyle(); refs.ctx.beginPath(); refs.ctx.moveTo(dpos.x, dpos.y); refs.ctx.lineTo(dpos.x + 0.1, dpos.y + 0.1); refs.ctx.stroke();
    try { refs.draw.setPointerCapture(e.pointerId); } catch (_) { void _; }
  }
  function drawMove(e) {
    if (!dpos || S.tool !== 'draw') return;
    var r = _drawRect || refs.stage.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    refs.ctx.beginPath(); refs.ctx.moveTo(dpos.x, dpos.y); refs.ctx.lineTo(x, y); refs.ctx.stroke();
    dpos = { x: x, y: y };
  }
  function drawUp() { dpos = null; }

  /* ── 합성 내보내기 (사진 줌·콜라주·레이어 회전 반영) ── */
  /* [신뢰성 2026-08-21] 이미지가 load 도 error 도 안 주면 예전엔 **영영 pending** 이었다.
     그러면 exportComposite 콜백이 안 불리고 S._saving 이 true 로 굳어 완료 버튼이 영구 잠긴다
     — 원장이 편집물을 저장도 발행도 못 하고 앱을 껐다 켜야 했다(브라우저 실측으로 재현).
     느린 회선·CDN 지연·큰 스티커 자산(T6 assetRef)에서 충분히 발생한다.
     load / error / timeout 셋 중 하나로 **반드시** 정착하고, 늦게 온 이벤트는 무시한다. */
  /* 매직넘버를 함수 안에 박지 않는다 — 회선 상황에 따라 조정할 수 있어야 한다.
     너무 짧으면 멀쩡한 저장이 깨지고, 너무 길면 그동안 원장이 갇힌다. */
  var IMG_LOAD_TIMEOUT_MS = 8000;    // 이미지 1장이 응답을 안 줄 때 포기하는 시점
  var SAVE_WATCHDOG_MS = 20000;      // export 가 끝내 응답 없을 때 저장 상태를 강제로 푸는 최후 안전망

  function loadImg(url) {
    return new Promise(function (res) {
      var im = new Image(), done = false, tid = null;
      var settle = function (v) {
        if (done) return;                      // 이중 정착 금지 — 타임아웃 직후 온 load 가 결과를 못 뒤집는다
        done = true; if (tid) clearTimeout(tid); tid = null;
        res(v);
      };
      im.crossOrigin = 'anonymous';
      im.onload = function () { settle(im); };
      im.onerror = function () { settle(null); };
      tid = setTimeout(function () { settle(null); }, IMG_LOAD_TIMEOUT_MS);
      try { im.src = url; } catch (_e) { void _e; settle(null); }
    });
  }
  function coverRect(im, w, h) { var sc = Math.max(w / im.width, h / im.height); return { dw: im.width * sc, dh: im.height * sc }; }
  function containRect(im, w, h) { var sc = Math.min(w / im.width, h / im.height); return { dw: im.width * sc, dh: im.height * sc }; }
  function fitRect(im, w, h) { return (S.fitMode === 'contain') ? containRect(im, w, h) : coverRect(im, w, h); }
  function rrPath(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2)); c.beginPath();
    if (c.roundRect) { c.roundRect(x, y, w, h, r); return; }
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  // 도형 캔버스 합성 — 회전/스케일은 호출부에서 translate+rotate 후, 비회전 크기(ow/oh)로 그림.
  function drawShape(c, L, ow, oh) {
    var sw = (L.strokeW || 6) * (L.scale || 1);
    c.fillStyle = L.color; c.strokeStyle = L.color; c.lineWidth = sw; c.lineJoin = 'round';
    if (L.shape === 'line') { rrPath(c, -ow / 2, -sw / 2, ow, sw, sw / 2); c.fill(); return; }
    if (L.shape === 'arrow') {
      /* 🔑 화면(CSS)과 **같은 비율**로 그린다. 어제 외곽선이 화면엔 있고 발행본엔 없던 것과
         같은 실수를 안 만들려고, CSS 의 머리 크기 계산(`sw*2.2`, 폭 `1.4배`)을 그대로 옮긴다. */
      var hd = Math.max(sw * 2.2, 10 * (L.scale || 1));
      var headW = hd * 1.4;
      var bodyEnd = ow / 2 - headW;
      rrPath(c, -ow / 2, -sw / 2, Math.max(1, bodyEnd + ow / 2), sw, sw / 2); c.fill();
      c.beginPath();
      c.moveTo(bodyEnd, -hd); c.lineTo(ow / 2, 0); c.lineTo(bodyEnd, hd);
      c.closePath(); c.fill();
      return;
    }
    if (L.shape === 'circle') {
      var rx = Math.max(1, (ow - (L.fill ? 0 : sw)) / 2), ry = Math.max(1, (oh - (L.fill ? 0 : sw)) / 2);
      c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); if (L.fill) c.fill(); else c.stroke(); return;
    }
    var rad = (L.shape === 'round' ? 18 : 0) * (L.scale || 1);
    if (L.fill) { rrPath(c, -ow / 2, -oh / 2, ow, oh, rad); c.fill(); }
    else { rrPath(c, -ow / 2 + sw / 2, -oh / 2 + sw / 2, ow - sw, oh - sw, Math.max(0, rad - sw / 2)); c.stroke(); }
  }
  function exportComposite(cb) {
    // 콜백은 **정확히 한 번**. 성공·실패·예외 어느 경로로 와도 한 번만 부른다.
    var _cbDone = false;
    var _photoDrawn = 0;   // 실제로 그려진 사진 수 — 0 이면 저장 실패로 본다(아래 참조)
    var _fire = function (url) { if (_cbDone) return; _cbDone = true; try { cb(url); } catch (_e) { void _e; } };
    var r = refs.stage.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    var cv = document.createElement('canvas'); cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    var c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    var baseDone;
    if (isSingleL(S.layout)) {
      var sIdx = S.photos.indexOf(S.photoUrl);
      var sDeg = (adjOf(sIdx < 0 ? 0 : sIdx).rot) || 0, sCs = sDeg ? coverScaleForRot(sDeg) : 1;
      if (S.fitMode === 'contain') { c.fillStyle = S.collageBg || '#fff'; c.fillRect(0, 0, r.width, r.height); }   // [#5] 전체 모드 여백 배경
      var _sFlt = filterStr(adjOf(sIdx < 0 ? 0 : sIdx));
      var _sFg = _fgActive(sIdx) ? S.fgMask[sIdx] : null;
      var _xf = function (cx) { cx.translate(S.pz.tx, S.pz.ty); cx.translate(r.width / 2, r.height / 2);
        cx.scale(S.pz.scale * sCs, S.pz.scale * sCs); cx.rotate(sDeg * Math.PI / 180); cx.translate(-r.width / 2, -r.height / 2); };
      baseDone = Promise.all([loadImg(S.photoUrl), _sFg ? loadImg(_sFg) : Promise.resolve(null)]).then(function (res) {
        var img = res[0], mk = res[1]; if (!img) return; _photoDrawn++; var cr = fitRect(img, r.width, r.height);
        var dx = (r.width - cr.dw) / 2, dy = (r.height - cr.dh) / 2;
        if (mk) {
          /* [#11 2026-07-18] 누끼 사진 = 배경 원래색 유지. ① 오프스크린에 '보정한 사진'을 같은 변형으로 그리고
             사람 마스크로 destination-in(=보정된 사람만 남김) ② 본 캔버스엔 '보정 안 한 사진'(=배경 원래색)을
             깐 뒤 그 위에 보정된 사람을 얹는다. 마스크는 합성본 정렬이라 사진과 같은 drawImage 로 정확히 겹친다. */
          var fgc = document.createElement('canvas'); fgc.width = cv.width; fgc.height = cv.height;
          var fc = fgc.getContext('2d'); fc.setTransform(dpr, 0, 0, dpr, 0, 0);
          fc.save(); _xf(fc); fc.filter = _sFlt; fc.drawImage(img, dx, dy, cr.dw, cr.dh); fc.filter = 'none';
          fc.globalCompositeOperation = 'destination-in'; fc.drawImage(mk, dx, dy, cr.dw, cr.dh); fc.restore();
          c.save(); _xf(c); c.drawImage(img, dx, dy, cr.dw, cr.dh); c.restore();   // 배경 = 보정 전 원본
          c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(fgc, 0, 0); c.restore();   // 보정된 사람만 위에
        } else {
          c.save(); _xf(c); c.filter = _sFlt; c.drawImage(img, dx, dy, cr.dw, cr.dh); c.restore();
        }
      });
    } else {
      // [SSOT] 화면 renderCollage 와 동일한 셀 좌표로 내보내기 → WYSIWYG.
      var cellsSpec = _layCells(), gap = S.collageGap != null ? S.collageGap : 3;
      c.fillStyle = S.collageBg || '#fff'; c.fillRect(0, 0, r.width, r.height);   // 간격 사이 배경색
      // [버그수정 2026-07-09] 빈 셀을 photo0으로 강제채움하던 것 → null(빈칸 유지). 화면 renderCollage(빈 셀=플레이스홀더)와 일치, 사진 중복 방지.
      var idxs = []; for (var k = 0; k < cellsSpec.length; k++) { var oi = S.layoutOrder[k]; idxs.push((oi != null && S.photos[oi] != null) ? oi : null); }
      var urls = idxs.map(function (i) { return i != null ? S.photos[i] : null; });
      var mkUrls = idxs.map(function (i) { return (i != null && _fgActive(i)) ? S.fgMask[i] : null; });
      baseDone = Promise.all([
        Promise.all(urls.map(function (u) { return u ? loadImg(u) : Promise.resolve(null); })),
        Promise.all(mkUrls.map(function (u) { return u ? loadImg(u) : Promise.resolve(null); })),
      ]).then(function (both) {
        var imgs = both[0], mks = both[1];
        imgs.forEach(function (img, k) {
          if (!img) return;
          _photoDrawn++;
          var cc = cellsSpec[k];
          var x = cc[0] * r.width + gap / 2, y = cc[1] * r.height + gap / 2, w = cc[2] * r.width - gap, h = cc[3] * r.height - gap;
          var cr = fitRect(img, w, h);
          var flt = filterStr(adjOf(idxs[k]));
          var cp = (S.cellCrop && S.cellCrop[k]) || { s: 1, tx: 0, ty: 0 };   // [셀 크롭] 재구도 반영(중심 기준 scale+translate)
          var rdeg = (adjOf(idxs[k]).rot) || 0;
          var dx = x + (w - cr.dw) / 2, dy = y + (h - cr.dh) / 2;
          // 셀의 clip+크롭+회전 변형을 그대로 재현하는 함수(본 캔버스·오프스크린 공용)
          var setup = function (cx) {
            cx.beginPath(); cx.rect(x, y, w, h); cx.clip();
            if (cp.s !== 1 || cp.tx || cp.ty) { var ccx = x + w / 2, ccy = y + h / 2; cx.translate(ccx + cp.tx, ccy + cp.ty); cx.scale(cp.s, cp.s); cx.translate(-ccx, -ccy); }
            if (rdeg) { var rcx = x + w / 2, rcy = y + h / 2, rsc = coverScaleForRot(rdeg); cx.translate(rcx, rcy); cx.rotate(rdeg * Math.PI / 180); cx.scale(rsc, rsc); cx.translate(-rcx, -rcy); }
          };
          if (mks[k]) {
            // [#11] 누끼 셀 — 단일 사진과 같은 방식으로 배경만 원래색 유지(오프스크린에 보정된 사람만 남겨 위에 얹음).
            var fgc = document.createElement('canvas'); fgc.width = cv.width; fgc.height = cv.height;
            var fc = fgc.getContext('2d'); fc.setTransform(dpr, 0, 0, dpr, 0, 0);
            fc.save(); setup(fc); fc.filter = flt; fc.drawImage(img, dx, dy, cr.dw, cr.dh); fc.filter = 'none';
            fc.globalCompositeOperation = 'destination-in'; fc.drawImage(mks[k], dx, dy, cr.dw, cr.dh); fc.restore();
            c.save(); setup(c); c.drawImage(img, dx, dy, cr.dw, cr.dh); c.restore();   // 배경 = 보정 전
            c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(fgc, 0, 0); c.restore();   // 보정된 사람
          } else {
            c.save(); setup(c); c.filter = flt; c.drawImage(img, dx, dy, cr.dw, cr.dh); c.restore();
          }
        });
      });
    }
    // [2026-07-26 원영] WYSIWYG 줄 추출 — split('\n')은 엔터만 알아서, 가로 늘리기(pre-wrap 자동 줄바꿈)
  //   줄이 export 에 반영 안 된다. 편집 DOM 의 '실제 렌더된 줄'을 글자 단위 Range 로 읽어 그대로 쓴다.
  //   측정 중 transform 임시 해제(회전·확대 상태면 top 비교가 깨짐) 후 복원. 실패 시 split('\n') 폴백.
  function _textLines(L) {
    var fallback = (L.text || '').split('\n');
    try {
      if (!L.tx || !L.tx.isConnected) return fallback;
      var prevT = L.el.style.transform;
      L.el.style.transform = 'none';
      var lines = [], cur = '', lastTop = null;
      var walker = document.createTreeWalker(L.tx, NodeFilter.SHOW_TEXT, null);
      var rng = document.createRange(), tn;
      while ((tn = walker.nextNode())) {
        var s = tn.nodeValue || '';
        for (var i = 0; i < s.length; i++) {
          var ch = s.charAt(i);
          if (ch === '\n') { lines.push(cur); cur = ''; lastTop = null; continue; }
          rng.setStart(tn, i); rng.setEnd(tn, i + 1);
          var rr = rng.getClientRects()[0];
          if (rr && rr.height) {
            if (lastTop != null && rr.top - lastTop > rr.height * 0.5) { lines.push(cur.replace(/\s+$/, '')); cur = ''; }
            lastTop = rr.top;
          }
          cur += ch;
        }
        // contenteditable 이 <div>/<br> 로 줄을 나눈 경우도 top 비교가 잡는다(구조 줄바꿈 = top 점프).
      }
      if (cur !== '' || !lines.length) lines.push(cur.replace(/\s+$/, ''));
      L.el.style.transform = prevT; applyXf(L);
      return lines.length ? lines : fallback;
    } catch (_e) { void _e; try { applyXf(L); } catch (_e2) { void _e2; } return fallback; }
  }
  baseDone.then(function () {
      c.drawImage(refs.draw, 0, 0, r.width, r.height);   // 드로잉
      S.layers.forEach(function (L) {
        var b = L.el.getBoundingClientRect();
        var cx = b.left - r.left + b.width / 2, cy = b.top - r.top + b.height / 2;
        // 비회전 크기(레이아웃 기준 × scale) — 회전 레이어도 정확히 합성(AABB 왜곡 방지)
        var ow = (L.el.offsetWidth || b.width) * (L.scale || 1), oh = (L.el.offsetHeight || b.height) * (L.scale || 1);
        c.save(); c.translate(cx, cy); if (L.rot) c.rotate(L.rot * Math.PI / 180);
        if (L.type === 'shape') {
          drawShape(c, L, ow, oh);
        } else if (L.type === 'image') {
          try { c.drawImage(L.tx, -ow / 2, -oh / 2, ow, oh); } catch (_ei) { void _ei; }
        } else if (L.type === 'sticker') {
          c.font = (L.fontSize * L.scale) + 'px serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(L.emoji, 0, 0);
        } else {
          var lines = _textLines(L); var fs = L.fontSize * L.scale;   // [2026-07-26] DOM 실제 줄 = 화면과 동일
          c.font = L.font.weight + ' ' + fs + 'px ' + L.font.family; c.fillStyle = L.color;
          // [fix] 편집기 정렬(L.align)을 export에도 반영 — 왼/오 정렬 텍스트(가격표·시술명)가 결과물서 중앙으로 어긋나던 버그.
          var _al = L.align || 'center';
          var _padX = 10 * (L.scale || 1), _innerHalf = Math.max(0, ow / 2 - _padX);
          var _ax = _al === 'left' ? -_innerHalf : (_al === 'right' ? _innerHalf : 0);
          c.textAlign = _al; c.textBaseline = 'middle';
          var total = lines.length * fs * 1.16, sy = -total / 2 + fs * 0.58;
          /* 🔴 [2026-08-23] 외곽선을 **안 그리고 있었다.** 화면(DOM)은
             `-webkit-text-stroke:1px rgba(0,0,0,.5)` 로 그리는데 여기엔 strokeText 가 없어서
             **편집기엔 외곽선이 보이는데 발행본엔 없었다.** 가독성 보정의 주된 수단이
             발행에서 통째로 사라지던 것 — 실제 인스타 캡처를 구워보고 잡았다
             (플랜 ON/OFF 결과가 바이트까지 같았다).
             webkit 은 획 중앙 기준이라 lineWidth 를 2배로 잡고 **fill 전에** 그린다
             (안쪽 절반은 글자가 덮어서 화면과 비슷해진다). 그림자는 끄고 그린다 —
             외곽선에까지 그림자가 붙으면 화면보다 훨씬 두꺼워 보인다. */
          if (L.stroke) {
            c.save();
            c.shadowBlur = 0; c.shadowColor = 'transparent';
            c.lineWidth = Math.max(1, 2 * (L.scale || 1));
            c.strokeStyle = 'rgba(0,0,0,.5)';
            c.lineJoin = 'round'; c.miterLimit = 2;
            lines.forEach(function (ln, i) { c.strokeText(ln, _ax, sy + i * fs * 1.16); });
            c.restore();
            c.font = L.font.weight + ' ' + fs + 'px ' + L.font.family; c.fillStyle = L.color;
            c.textAlign = _al; c.textBaseline = 'middle';
          }
          c.shadowBlur = 8; c.shadowColor = 'rgba(0,0,0,.35)';
          lines.forEach(function (ln, i) { c.fillText(ln, _ax, sy + i * fs * 1.16); });
          c.shadowBlur = 0;
        }
        c.restore();
      });
      /* [신뢰성] 사진이 **하나도** 안 실렸으면 성공으로 치지 않는다.
         예전엔 이미지가 전부 타임아웃돼도 글씨만 있는 합성본을 만들어 저장했고,
         원장이 그걸 그대로 발행할 수 있었다(브라우저 실측). 일부만 실패한 콜라주는
         기존대로 나머지를 살린다 — 여기서 막는 건 '사진이 통째로 없는' 경우뿐이다. */
      if (!_photoDrawn) { _fire(null); return; }
      try { _fire(cv.toDataURL('image/jpeg', 0.92)); } catch (e) { void e; _fire(null); }
    }).catch(function (_e) {
      // 체인 어디서 터져도 콜백이 증발하면 안 된다 — 증발 = 저장 영구 잠김.
      void _e; _fire(null);
    });
  }

  /* ── 배선 ── */
  function wire() {
    refs.rail.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tool]'); if (!b) return;
      var tool = b.getAttribute('data-tool');
      // [보스#8] Aa 버튼은 항상 새 텍스트 생성(인스타식). 이미 텍스트가 선택돼 있어도 새로 추가.
      //   addText()가 새 텍스트를 active로 만들므로 뒤이은 setTool('text')의 자동생성(L362)은 건너뜀 → 정확히 1개.
      if (tool === 'text') addText();
      setTool(tool);
    });
    /* [2026-08-23] 레이어 순서. 되돌리기(↩) 대상으로 넣지 않는다 —
       순서 바꾸기는 눈으로 바로 보이고 반대 버튼이 바로 옆에 있어서, undo 스택을 채우면
       원장이 정작 되돌리고 싶은 편집이 밀려난다. */
    var _lyrBar = root.querySelector('[data-r="lyr"]');
    if (_lyrBar) {
      _lyrBar.addEventListener('click', function (e) {
        var b = e.target.closest('[data-lyr]'); if (!b || b.disabled) return;
        var L = S && S.active; if (!L) return;
        reorderLayer(L, b.getAttribute('data-lyr'));
      });
    }
    refs.stage.addEventListener('pointerdown', function (e) { if (e.target === refs.stage || e.target === refs.photo || e.target.classList.contains('itded__scrim')) selectLayer(null); });
    // 텍스트 컨트롤
    refs.fonts.addEventListener('click', function (e) { var b = e.target.closest('[data-font]'); if (!b) return; applyFont(b.getAttribute('data-font')); root.querySelectorAll('[data-font]').forEach(function (x) { x.classList.toggle('on', x === b); }); });
    refs.colors.addEventListener('click', function (e) { var b = e.target.closest('[data-color]'); if (!b) return; applyColor(b.getAttribute('data-color')); root.querySelectorAll('[data-color]').forEach(function (x) { x.classList.toggle('on', x === b); }); });
    refs.aln.addEventListener('click', function (e) { var b = e.target.closest('[data-aln]'); if (!b) return; applyAlign(b.getAttribute('data-aln')); refs.aln.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); });
    refs.size.addEventListener('input', function () { applyScale(refs.size.value); });
    // [#13-v2] 무지개 버튼 탭 → 화면 안 색상 팔레트(SV 사각형 + 색조 바) 열기.
    root.addEventListener('click', function (e) {
      var cp = e.target.closest ? e.target.closest('[data-colorpick]') : null; if (!cp) return;
      e.preventDefault(); e.stopPropagation();
      if (_cpState && _cpState.anchor === cp) { _closeColorPicker(); return; }
      _openColorPicker(cp, cp.getAttribute('data-colorpick'));
    });
    // [스포이드] 파이펫 탭 → 사진에서 색 추출 모드(재탭 = 취소)
    root.addEventListener('click', function (e) {
      var pp = e.target.closest ? e.target.closest('[data-eyedrop]') : null; if (!pp) return;
      e.preventDefault(); e.stopPropagation();
      _openEyedrop(pp.getAttribute('data-eyedrop'));
    });
    // [#5] 스티커 — 카테고리 탭 전환 + 이모지/글자스티커/SVG/우리샵칩/데코/내 스티커 → 레이어로 추가
    refs.stkSheet.addEventListener('click', function (e) {
      var tab = e.target.closest('[data-sttab]'); if (tab) { refs.stkTabs.querySelectorAll('[data-sttab]').forEach(function (x) { x.classList.toggle('on', x === tab); }); _renderStkTab(tab.getAttribute('data-sttab')); return; }
      var del = e.target.closest('[data-minedel]'); if (del) { e.stopPropagation(); delMyStk(+del.getAttribute('data-minedel')); return; }
      var mine = e.target.closest('[data-mine]'); if (mine) { var arr = loadMyStk(); var u = arr[+mine.getAttribute('data-mine')]; if (u) addImageSticker(u); return; }
      var sc = e.target.closest('[data-stkcat]'); if (sc) { var cat = sc.getAttribute('data-stkcat'); var list = (window.ItdStickers || {})[cat + 'Svg'] || []; var su = list[+sc.getAttribute('data-stkidx')]; if (su) addImageSticker(su); return; }
      var ic = e.target.closest('[data-icstk]');
      if (ic) {
        var pr = ic.getAttribute('data-icstk').split(':');
        var setKey = _ICS && _ICS.tabSet ? _ICS.tabSet[pr[0]] : null;
        var iu = setKey ? (_ICS.sets[setKey] || [])[+pr[1]] : null;
        if (iu) addImageSticker(iu);
        return;
      }
      var dc = e.target.closest('[data-deco]'); if (dc) { addImageSticker(DECO[+dc.getAttribute('data-deco')]); return; }
      var tx = e.target.closest('[data-txtstk]'); if (tx) { var o = ((window.ItdStickers || {}).textStk || [])[+tx.getAttribute('data-txtstk')]; if (o) addTextSticker(o.t, o.f); return; }
      var b = e.target.closest('[data-stk]'); if (b) addSticker(b.getAttribute('data-stk'));
    });
    enableDragScroll(refs.stkTabs);   // [#5] 탭 줄 가로 드래그
    // [#8] 도형 패널 — 도형 탭=삽입, 채움 토글, 굵기, 색
    refs.panels.shape.addEventListener('click', function (e) {
      var sh = e.target.closest('[data-shape]'); if (sh) { addShape(sh.getAttribute('data-shape')); return; }
      var fl = e.target.closest('[data-shapefill]'); if (fl) { S.shapeFill = fl.getAttribute('data-shapefill') === '1'; refs.panels.shape.querySelectorAll('[data-shapefill]').forEach(function (x) { x.classList.toggle('on', x === fl); }); applyShapeStyle(); return; }
      var sc = e.target.closest('[data-scolor]'); if (sc) { S.shapeColor = sc.getAttribute('data-scolor'); refs.panels.shape.querySelectorAll('[data-scolor]').forEach(function (x) { x.classList.toggle('on', x === sc); }); applyShapeStyle(); return; }
    });
    refs.shapeThick.addEventListener('input', function () { S.shapeThick = +refs.shapeThick.value; applyShapeStyle(); });
    // [#3] 스티커 시트 그립은 이제 data-pgrip → 아래 _attachSheetSwipe 가 일괄 처리(다른 패널과 동일하게 스와이프-닫기).
    // [#7] 각 도구패널 상단 grip 아래로 긁으면 닫기(스티커 포함)
    root.querySelectorAll('[data-pgrip]').forEach(function (g) { _attachSheetSwipe(g); });
    // [①] 가로 스크롤 줄 드래그 스와이프(폰트/색/칩)
    enableDragScroll(refs.fonts); enableDragScroll(refs.colors);
    enableDragScroll(refs.panels.shape.querySelector('.itshape__row'));
    enableDragScroll(refs.panels.shape.querySelector('.itshape__colors'));
    // 레이아웃 — 타입 칩 선택 + 렌더된 사진 순서 탭 + 배경색
    refs.panels.layout.addEventListener('click', function (e) {
      var t = e.target.closest('[data-lay]'); if (t) { selectLayout(+t.getAttribute('data-lay')); return; }
      var th = e.target.closest('[data-laythumb]'); if (th) { onLayThumb(+th.getAttribute('data-laythumb')); return; }
      var bg = e.target.closest('[data-bg]'); if (bg) { S.collageBg = bg.getAttribute('data-bg'); S.collageBgImg = null; saveBgPref(); refs.panels.layout.querySelectorAll('[data-bg]').forEach(function (x) { x.classList.toggle('on', x === bg); }); renderCollage(); applyFit(); recutWithBg(); return; }
      var ft = e.target.closest('[data-fit]'); if (ft) { S.fitMode = ft.getAttribute('data-fit'); S._fitManual = true; refs.layFit.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === ft); }); applyFit(); return; }
    });
    enableDragScroll(refs.layStrip); enableDragScroll(refs.panels.layout.querySelector('.itlay2__types'));
    refs.layGap.addEventListener('input', function () { S.collageGap = +refs.layGap.value; renderCollage(); });
    refs.layAdd.addEventListener('change', function () { var fl = refs.layAdd.files && refs.layAdd.files[0]; if (fl) addPhotoFromFile(fl); refs.layAdd.value = ''; });
    if (refs.layBgImg) refs.layBgImg.addEventListener('change', function () { var fl = refs.layBgImg.files && refs.layBgImg.files[0]; if (fl) addBgImageFromFile(fl); refs.layBgImg.value = ''; });
    // [셀 크롭] 콜라주 칸 드래그/핀치 재구도(레이아웃 도구에서만 포인터 활성)
    refs.collage.addEventListener('pointerdown', onCellDown);
    document.addEventListener('pointermove', onCellMove);
    document.addEventListener('pointerup', onCellUp);
    // 보정 — 사진 선택 + 슬라이더(선택 사진만) + 초기화
    refs.panels.adjust.addEventListener('click', function (e) { var t = e.target.closest('[data-adjthumb]'); if (t) onAdjThumb(+t.getAttribute('data-adjthumb')); });
    refs.panels.adjust.addEventListener('input', function (e) {
      var s = e.target.closest('[data-adj]'); if (!s) return; var k = s.getAttribute('data-adj'); adjOf(S.adjSel)[k] = +s.value;
      var c0 = ADJ_CTRLS.filter(function (x) { return x.k === k; })[0]; var out = root.querySelector('[data-adjout="' + k + '"]'); if (out) out.textContent = adjReadout(c0, +s.value);
      applyAdjThrottled(); var th = refs.adjStrip && refs.adjStrip.querySelector('[data-adjthumb="' + S.adjSel + '"]'); if (th) th.style.filter = filterStr(adjOf(S.adjSel));
    });
    // [#3] 수평 슬라이더 — 가이드 그리드 표시 + 사진 회전
    if (refs.adjRot) refs.adjRot.addEventListener('input', function () {
      var rv = +refs.adjRot.value; if (Math.abs(rv) < 1.5) { rv = 0; refs.adjRot.value = 0; }   // [#2] 0° 근처면 수평으로 잠금
      adjOf(S.adjSel).rot = rv; if (refs.adjRotOut) refs.adjRotOut.textContent = rv.toFixed(1).replace(/\.0$/, '') + '°';
      root.classList.add('is-leveling'); clearTimeout(S._lvlT); S._lvlT = setTimeout(function () { root.classList.remove('is-leveling'); }, 900);
      applyStraighten();
    });
    refs.adjReset.addEventListener('click', function () { S.adj[S.adjSel] = defAdj(); syncAdjSliders(); applyAdjToDisplay(); applyStraighten(); renderAdjust(); });
    if (refs.adjCut) refs.adjCut.addEventListener('click', function () { doCutout(); });
    if (refs.adjUncut) refs.adjUncut.addEventListener('click', undoCutout);
    // [#4] 누끼 배경 색 — 탭하면 즉시 재합성(매트 캐시 있으면 0초). 누끼 전이면 배경만 기억.
    if (refs.adjCutBg) refs.adjCutBg.addEventListener('click', function (e) {
      // [2026-07-26 원영] 팔레트 A안 — '+' 누르면 숨김색(.itlaybg--x) 펼침/접힘 토글
      var mbtn = e.target.closest('[data-cutmore]');
      if (mbtn) { var op = refs.adjCutBg.classList.toggle('open'); mbtn.textContent = op ? '−' : '+'; return; }
      var rbtn = e.target.closest('[data-cutbgimg]');   // [#2] 최근 배경 사진 재사용(원탭)
      if (rbtn) {
        var rb = ''; try { rb = localStorage.getItem('itdasy:itd_bgimg') || ''; } catch (_e) { rb = ''; }
        if (!rb) { toastIt('저장된 배경 사진이 없어요'); return; }
        S.photoBg = S.photoBg || {}; S.photoBg[S.adjSel] = { img: rb };
        refs.adjCutBg.querySelectorAll('[data-cutbg],[data-cutbgimg]').forEach(function (x) { x.classList.toggle('on', x === rbtn); });
        applyFit(); applyBgChange(); toastIt('저장한 배경을 적용했어요'); return;
      }
      var b = e.target.closest('[data-cutbg]'); if (!b) return;
      S.photoBg = S.photoBg || {}; S.photoBg[S.adjSel] = { color: b.getAttribute('data-cutbg'), img: null };   // [#8] 현재 사진 배경만
      refs.adjCutBg.querySelectorAll('[data-cutbg],[data-cutbgimg]').forEach(function (x) { x.classList.toggle('on', x === b); });
      applyFit(); applyBgChange();   // [#2] 처음이면 자동 누끼로 반영
    });
    if (refs.adjBgImg) refs.adjBgImg.addEventListener('change', function () { var fl = refs.adjBgImg.files && refs.adjBgImg.files[0]; if (fl) addBgImageFromFile(fl); refs.adjBgImg.value = ''; });
    enableDragScroll(refs.adjStrip);
    // 그리기
    root.querySelector('[data-panel="draw"] .itdrawp__tools').addEventListener('click', function (e) {
      if (e.target.closest('[data-r="drawClear"]')) { if (refs.ctx && refs.draw) { refs.ctx.clearRect(0, 0, refs.draw.width, refs.draw.height); toastIt('그림을 지웠어요'); } return; }   // [#6] 그리기 전체 지우기
      var b = e.target.closest('[data-brush]'); if (!b) return; S.brush = b.getAttribute('data-brush'); root.querySelectorAll('[data-brush]').forEach(function (x) { x.classList.toggle('on', x === b); });
    });
    refs.brushSize.addEventListener('input', function () { S.brushSize = +refs.brushSize.value; });
    root.querySelector('[data-panel="draw"] .itdrawp__colors').addEventListener('click', function (e) { var b = e.target.closest('[data-dcolor]'); if (!b) return; S.drawColor = b.getAttribute('data-dcolor'); root.querySelectorAll('[data-dcolor]').forEach(function (x) { x.classList.toggle('on', x === b); }); });
    refs.draw.addEventListener('pointerdown', drawDown);
    refs.draw.addEventListener('pointermove', drawMove);
    refs.draw.addEventListener('pointerup', drawUp);
    // 사진 핀치 확대/이동
    refs.stage.addEventListener('pointerdown', stageDown);
    refs.stage.addEventListener('pointermove', stageMove);
    refs.stage.addEventListener('pointerup', stageUp);
    refs.stage.addEventListener('pointercancel', stageUp);
    // 닫기/완료
    refs.cancel.addEventListener('click', function () { if (S) S._cancelled = true; close(); if (S && S.onCancel) S.onCancel(); });
    if (refs.undo) refs.undo.addEventListener('click', function () { _undo(); });   // [P1-3]
    if (refs.redo) refs.redo.addEventListener('click', function () { _redo(); });
    if (refs.peek) refs.peek.addEventListener('click', function () { togglePeek(); });   // [P2-2]
    if (refs.addText) refs.addText.addEventListener('click', function () { addText(); });   // [#4] 글자 추가(항상 새 텍스트)
    refs.done.addEventListener('click', function () {
      if (S._saving) return;   // [audit] 완료 더블탭 방지(저장 중 재클릭 무시)
      S._saving = true;
      var cb = S.onDone, _sess = S; refs.done.textContent = '저장 중…'; refs.done.disabled = true;
      /* [신뢰성 2026-08-21] 저장 실패는 **데드락이 아니어야 한다.**
         예전엔 export 콜백이 안 오면 _saving 이 true 로 굳어 재클릭이 전부 막혔다.
         이제 성공·실패·예외·타임아웃 어느 경로로 끝나도 여기서 상태를 되돌린다.
         워치독은 최후 안전망 — export 가 끝내 응답이 없어도 원장을 풀어준다. */
      var _restored = false;
      var _restoreSaveUi = function () {
        if (_restored) return; _restored = true;
        if (_wd) { clearTimeout(_wd); _wd = null; }
        _sess._saving = false;
        try { refs.done.textContent = '완료'; refs.done.disabled = false; } catch (_e) { void _e; }
      };
      var _wd = setTimeout(function () {
        _restoreSaveUi();                       // 편집기는 열어 둔 채 재시도 가능하게
        try { toastIt('저장이 오래 걸려요 — 다시 눌러 주세요'); } catch (_e) { void _e; }
      }, SAVE_WATCHDOG_MS);
      exportComposite(function (url) {
        if (S !== _sess || _sess._cancelled) { _restoreSaveUi(); return; }   // [audit] 저장 중 back/취소로 닫혔거나 재진입 → onDone 이중발화 안 함
        if (!url) {                             // 합성 실패 — 닫지 않는다. 작업물을 잃지 않게.
          _restoreSaveUi();
          try { toastIt('저장에 실패했어요 — 다시 눌러 주세요'); } catch (_e) { void _e; }
          return;
        }
        var meta = { layers: metaLayers(), editState: _exportState() };   // [학습] close() 전에 좌표 계산(닫으면 stage rect=0 → NaN). editState=재편집 이어가기(#4/#8/#11/#16)
        // [T5] 저장 시점에 남은 작업기억 레이어 수 — flow 의 dismissed(문구 veto) 판정 기준선.
        //   0 = 통째 빼기(자동화 거부, 문구 판단 아님) / 1+ = 자동화는 수용했는데 특정 문구만 지움.
        meta.wmKept = (S.layers || []).filter(function (L) { return L && L._src === 'wm'; }).length;
        meta.perPhoto = _collectPerPhoto();   // [#5/#6] 사진별 레이어(단일모드) — 플로우가 각 장을 자기 레이어로 합성
        // [캐러셀] 콜라주(다중 셀)가 아니면서 편집기에서 새로 추가한 사진 → 플로우가 여러 장 게시(캐러셀) 후보로 반영.
        //   콜라주면 이미 한 장으로 합성되므로 별도 추가 안 함.
        meta.newPhotos = (isSingleL(S.layout) && S.photos && S.photos.length > (S._initPhotoN || 0)) ? S.photos.slice(S._initPhotoN || 0) : [];
        // [Phase 5.1] Safety baseline 관측. metaGeometry() 는 close() 전에만 유효(닫히면 rect=0).
        //   재기만 하고 배치는 안 바꾼다. 무거운 계산은 observePublish 안에서 유휴로 미룬다.
        try { if (window.DraftQuality) window.DraftQuality.published({ published: true }); } catch (_dqe) { void _dqe; }
        try { if (window.WMMetrics) window.WMMetrics.observePublish(meta.layers, S.photoUrl, metaGeometry()); }
        catch (_mx) { void _mx; }
        _restoreSaveUi();
        close();
        if (cb) cb(url, meta);   // StoryEditor 계약 호환(meta.layers)
      });
    });
  }
  // 저장 시 레이어를 ShopStyle 학습 계약으로 — role·정규화 중심좌표(x/y)·폭·폰트·색·크기·외곽선/그림자.
  function metaLayers() {
    var R = refs.stage.getBoundingClientRect();
    return S.layers.map(function (L) {
      // 도형·장식용 이미지 스티커는 '우리샵 스타일' 학습 대상 아님(결과 이미지엔 이미 합성됨).
      if (L.type === 'shape') return null;
      if (L.type === 'image' && L.role === 'sticker') return null;
      var b = L.el.getBoundingClientRect();
      var cx = (b.left - R.left + b.width / 2) / R.width;
      var cy = (b.top - R.top + b.height / 2) / R.height;
      var w = b.width / R.width;
      if (L.type === 'image') return { type: 'image', role: L.role || 'logo', src: L.src, x: cx, y: cy, w: w };
      if (L.type === 'sticker') return { type: 'emoji', emoji: L.emoji, x: cx, y: cy };
      var fs = (L.fontSize || 30) * (L.scale || 1);
      return { type: 'text', role: L.role || '', text: L.text, x: cx, y: cy, w: w,
        font: L.font && L.font.key, color: L.color, align: L.align,
        size: fs / R.height, weight: L.font && L.font.weight,
        stroke: !!L.stroke, shadow: !!L.shadow };
    }).filter(Boolean);
  }

  /* [Phase 5 Safety] 겹침 판정용 **실제 렌더 geometry**. metaLayers 와 분리한 이유가 있다.
     metaLayers 는 학습(WorkMemory)으로 흘러가는 계약이라 필드를 늘리면 그쪽 레코드가 커지고
     의미도 섞인다. 여기는 **관측 전용**이고 아무 데도 저장되지 않는다.

     🔑 핵심은 `h` 다. metaLayers 는 폭(`w`)과 **폰트 크기**(`size`)만 준다 — 박스 높이가 없다.
        그래서 기존 겹침 계산이 `size × 1.6` 으로 추정할 수밖에 없었고, 그 근사값으로는
        자동 판단을 할 수 없다(과대·과소 어느 쪽으로 틀렸는지도 모른다).
        `getBoundingClientRect()` 는 지금 이 순간 화면에 그려진 **실제 박스**를 준다.

     🔑 회전(`rot`): 회전된 요소의 getBoundingClientRect 는 **회전 후 AABB** 다 —
        실제 글자 박스(OBB)보다 크다. 겹침 판정에서 이건 **과대검출**이므로 안전한 방향이다
        (놓칠 위험 < 과하게 잡을 위험). OBB 가 필요할 만큼 회전이 흔한지는 실데이터로 재야 한다.
        (같은 사실을 _serLayer 도 알고 있다 — 회전 도형은 AABB 가 틀려서 L.w/L.h 를 직접 쓴다) */
  function metaGeometry() {
    var R = refs.stage.getBoundingClientRect();
    if (!R.width || !R.height) return [];
    return S.layers.map(function (L, i) {
      if (!L || !L.el) return null;
      var b = L.el.getBoundingClientRect();
      if (!b.width || !b.height) return null;
      return {
        idx: i,
        type: L.type,
        role: L.role || null,
        origin: L._src === 'wm' ? 'system' : (L.role ? 'restored' : 'user'),
        // 좌상단 기준 정규화 — PhotoContext.subjectRegion 과 **같은 좌표계**
        x: (b.left - R.left) / R.width,
        y: (b.top - R.top) / R.height,
        w: b.width / R.width,
        h: b.height / R.height,          // ← 추정이 아니라 실제 렌더 높이
        rot: L.rot || 0
      };
    }).filter(Boolean);
  }

  // [#4/#8/#11/#16] 재편집 이어가기 — 편집기 '전체 상태'를 직렬화/복원.
  //   metaLayers 는 '우리샵 학습'용이라 도형·스티커를 버린다. 재편집은 전부 보존해야 하므로 별도 직렬화.
  function _serLayer(L) {
    var R = refs.stage.getBoundingClientRect(); if (!R.width) return null;
    var b = L.el.getBoundingClientRect();
    var base = { x: (b.left - R.left + b.width / 2) / R.width, y: (b.top - R.top + b.height / 2) / R.height,
      w: b.width / R.width, rot: L.rot || 0, scale: L.scale || 1, role: L.role || '' };
    if (L.type === 'sticker') { base.type = 'sticker'; base.emoji = L.emoji; base.size = ((L.fontSize || 64) * (L.scale || 1)) / R.height; return base; }
    if (L.type === 'image') { base.type = 'image'; base.src = L.src; return base; }
    if (L.type === 'shape') {
      base.color = L.color;
      /* [#10 2026-07-18] box 크기(w/h)를 상대값으로 저장 — 늘리기(비균등) 보존. 회전 도형은 bounding rect(AABB)가
         실제 box 보다 커서 틀리므로 L.w/L.h 를 직접 쓴다(예전엔 b.width/b.height 라 회전 시 어긋났음).
         [버그수정 2026-07-17] 채움·테두리 굵기도 함께 — 안 그러면 '테두리 원'이 '채운 사각형'으로 되살아남. */
      base.w = (L.w != null ? L.w : b.width) / R.width;
      base.h = (L.h != null ? L.h : b.height) / R.height;
      base.fill = !!L.fill;
      base.strokeW = (L.strokeW || 6) / R.height;
      if (L.radius != null) base.radius = L.radius;
      if (L.shape === 'line') { base.type = 'line'; base.size = (L.strokeW || 3) / R.height; }
      // 화살표도 도형으로 직렬화 — 빠뜨리면 사진 전환·재편집에서 조용히 사라진다
      /* 🔴 새 type 이름('shape')을 만들면 안 된다 — `addShopLayer` 라우팅이 모르는 이름이면
         **조용히 텍스트 레이어로 떨어진다.** 실제로 그래서 화살표가 발행본에서 사라졌다.
         화살표는 구조가 선과 같으니 **선 계열로 실어보내고** shape 로 구분한다. */
      else if (L.shape === 'arrow') { base.type = 'line'; base.shape = 'arrow'; base.size = (L.strokeW || 3) / R.height; }
      else { base.type = 'rect'; base.shape = L.shape; }
      return base;
    }
    var fs = ((L.fontSize || 30) * (L.scale || 1)) / R.height;
    base.type = (L.type === 'badge') ? 'badge' : 'text';
    base.text = L.text; base.font = L.font && L.font.key; base.color = L.color; base.align = L.align;
    base.size = fs; base.weight = L.font && L.font.weight; base.stroke = !!L.stroke; base.shadow = !!L.shadow;
    return base;
  }
  // [#5/#6] 사진별 레이어 수집 — 단일모드에서 각 장(현재 장 포함)이 가진 텍스트/스티커 레이어를 { idx, photoUrl, layers } 로.
  //   플로우가 이걸로 각 장을 자기 레이어와 합성해 캐러셀 장별로 다른 글/스티커가 실제 게시되게 한다.
  function _collectPerPhoto() {
    try {
      if (!isSingleL(S.layout)) return null;   // 콜라주는 한 장 합성(장별 아님)
      if (!S.layersByPhoto) S.layersByPhoto = {};
      S.layersByPhoto[S.adjSel] = (S.layers || []).map(_serLayer).filter(Boolean);   // 현재 장도 포함
      var out = [];
      (S.photos || []).forEach(function (u, i) {
        var ls = S.layersByPhoto[i];
        if (ls && ls.length) out.push({ idx: i, photoUrl: u, layers: ls });
      });
      return out.length ? out : null;
    } catch (_e) { return null; }
  }
  function _exportState() {
    try {
      return { v: 1, layoutIdx: LAYOUTS.indexOf(S.layout), layoutOrder: (S.layoutOrder || []).slice(),
        cellCrop: (S.cellCrop || []).slice(), collageBg: S.collageBg, collageBgImg: S.collageBgImg || null,
        collageGap: S.collageGap, fitMode: S.fitMode, ratio: S.ratio,
        adj: (S.adj || []).map(function (a) { return Object.assign({}, a); }),
        photoDraw: Object.assign({}, S.photoDraw), photoBg: Object.assign({}, S.photoBg),
        pz: Object.assign({ scale: 1, tx: 0, ty: 0 }, S.pz),   // [버그수정 2026-07-06] 사진 핀치줌/이동 구도 재편집 시 유실 방지
        photos: (S.photos || []).slice(), layers: (S.layers || []).map(_serLayer).filter(Boolean) };
    } catch (_e) { return null; }
  }
  // editState 를 S 에 반영(open 안에서 S 생성 직후 호출) + 레이어 복원.
  function _restoreState(st) {
    if (!st) return;
    if (st.layoutIdx != null && LAYOUTS[st.layoutIdx]) S.layout = LAYOUTS[st.layoutIdx];
    if (Array.isArray(st.layoutOrder)) S.layoutOrder = st.layoutOrder.slice();
    if (Array.isArray(st.cellCrop)) S.cellCrop = st.cellCrop.slice();
    if (st.collageBg) S.collageBg = st.collageBg;
    if (st.collageBgImg) S.collageBgImg = st.collageBgImg;
    if (st.collageGap != null) S.collageGap = st.collageGap;
    if (st.fitMode) S.fitMode = st.fitMode;
    if (Array.isArray(st.adj) && st.adj.length) S.adj = st.adj.map(function (a) { return Object.assign(defAdj(), a); });
    if (st.photoDraw) S.photoDraw = Object.assign({}, st.photoDraw);
    if (st.photoBg) S.photoBg = Object.assign({}, st.photoBg);
    if (st.pz) S.pz = Object.assign({ scale: 1, tx: 0, ty: 0 }, st.pz);   // [버그수정 2026-07-06] 재편집 시 사진 구도(핀치줌/이동) 복원
    if (Array.isArray(st.photos) && st.photos.length) { S.photos = st.photos.slice(); S.photoUrl = S.photos[0]; S.photoCss = 'url("' + S.photos[0] + '")'; }
  }
  // stage 크기 — 레이아웃 flush 전(rect=0)엔 fitStageToRatio 가 박아둔 explicit px 로 폴백.
  function _stageWH() {
    var r = refs.stage.getBoundingClientRect();
    var w = r.width || parseFloat(refs.stage.style.width) || refs.stage.offsetWidth || 0;
    var h = r.height || parseFloat(refs.stage.style.height) || refs.stage.offsetHeight || 0;
    return { width: w, height: h, left: r.left, top: r.top };
  }
  function _restoreLayers(specs) {
    // [T8-A] 시스템 복원 — 이 안의 변경은 원장 취향 signal 이 아니다(try/finally 로 반드시 해제).
    if (window.WMSignals && window.WMSignals.system) { return window.WMSignals.system(function () { return _restoreLayersInner(specs); }); }
    return _restoreLayersInner(specs);
  }
  function _restoreLayersInner(specs) {
    var R = _stageWH(); if (!R.width) return;
    (specs || []).forEach(function (spec) {
      try {
        var L2 = addShopLayer(spec, R); if (L2 && spec.rot) { L2.rot = spec.rot; applyXf(L2); }
        // [T4] 작업 기억 출처 태그 — '이번엔 빼기'(undoWmApply)가 이 레이어만 골라 지운다.
        //   _serLayer 화이트리스트엔 없어 저장/사진전환 직렬화엔 안 실린다(런타임 전용).
        if (L2 && spec._src === 'wm') { L2._src = 'wm'; L2._wmTok = spec._wmTok || null; }
        /* [STAGE C] 복원된 레이어는 **전부 원장 소유**로 본다.
           클릭 기록(`_own`)은 런타임 값이라 저장에 안 실린다. 그렇다고 "표시가 없으니
           기본값이겠지" 라고 보면, 이어서 편집하는 원장의 작업물을 자동 초안이 덮는다.
           되돌리기 어려운 쪽으로 틀리지 않게 **안 건드리는 쪽**을 택한다. */
        if (L2 && !L2._src) { L2._own = { font: 1, color: 1, align: 1, size: 1 }; L2._restored = true; }
      } catch (_e) { void _e; }
    });
    S.active = null; S.layers.forEach(function (x) { x.el.classList.remove('is-active'); });
  }

  function open(opts) {
    opts = opts || {};
    if (!root) build();
    var photo = opts.photo || opts.photoUrl || '';   // StoryEditor 계약(photoUrl) 호환
    var photos = (opts.photos && opts.photos.length) ? opts.photos.slice() : [photo];
    S = { layers: [], active: null, tool: 'text', layout: LAYOUTS[0], layoutOrder: [],
      brush: 'pen', brushSize: 10, drawColor: COLORS[2],
      shapeColor: COLORS[2], shapeFill: false, shapeThick: 6,
      adj: photos.map(function () { return defAdj(); }), adjSel: 0, collageGap: 3,
      collageBg: (loadBgPref().color || '#FFFFFF'), collageBgImg: null, cellCrop: [], cellSel: -1, fitMode: 'contain',   // [#5] 배경색만 기억, 배경'이미지'는 매번 초기화(예전 stale 배경이 누끼에 자동적용되던 문제)
      ratio: (opts.ratio || '4:5'), undo: [], redo: [], photoDraw: {}, photoBg: {}, layersByPhoto: {},   // [#5/#6] 사진별 레이어 보관
      matte: {}, fgMask: {},   // [#11 2026-07-18] matte=누끼 PNG(재합성 캐시) · fgMask[i]=합성본 정렬 사람 마스크(배경 보정 제외용). 매트처럼 세션 전용.
      photoUrl: photo, photoCss: 'url("' + photo + '")', photos: photos,
      shopName: (opts.shopName || '').trim(),
      pz: { scale: 1, tx: 0, ty: 0 }, incoming: (opts.layers || []),
      onDone: opts.onDone, onCancel: opts.onCancel,
      /* 🔴 [2026-08-23] EditPlan 이 쓰던 `S.planCategory` 는 **읽기만 하고 아무도 대입하지 않았다** —
         실사용 경로에서 category 가 늘 null 이라 업종 seed(CategoryPrior)가 한 번도 안 걸렸다.
         그리고 더 큰 문제: 학습은 canonicalContext(시술·종류·사진수·템플릿)로 하는데
         조회는 `{category, photoCount}` 로 해서 **contextKey 가 안 맞았다.**
         키가 다르면 `WMPrefs.resolve` 가 exact 를 못 찾고, global fallback 은 context 2개
         memory 2개를 요구하니 **원장이 아무리 편집해도 EditPlan 엔 안 보인다.**
         브라우저에서 실제로 확인했다: WMPrefs 엔 center/#111111 이 있는데 계획은 인스타 값 그대로였다.
         → 학습에 쓰는 그 context 를 그대로 들고 있다가 조회에도 쓴다. */
      planCategory: (opts.category || (opts.wmContext && opts.wmContext.service) || null),
      wmContext: opts.wmContext || null };
    var _ed = (opts.editState && opts.editState.v) ? opts.editState : null;   // [#4/#8/#11/#16] 재편집 이어가기
    if (_ed) { try { _restoreState(_ed); } catch (_re) { _ed = null; } }   // 복원 실패 시 일반 열기로 폴백(앱 안전)
    // [T8-A] 관찰 세션 시작 — 이 편집기 오픈 = 게시물 1개 작업 = observation 1개(batch).
    //   baseline 은 자동적용 직후 상태(diff 기준). 학습 계산은 여기서 안 한다(critical path 보호).
    try {
      if (window.WMSignals) {
        var _ap = window.WorkMemoryEngine && window.WorkMemoryEngine._lastApply;
        window.WMSignals.begin({ memoryId: _ap && _ap.memoryId, context: opts.wmContext || {}, baseline: (_ed && _ed.layers) || [] });
      }
    } catch (_t8) { void _t8; }
    /* [Phase 1 2026-08-21] 사진 문맥 **관측만**. 결과를 쓰는 코드는 아직 없다 — 일부러 없다.
       왜: 2026-08-21 Phase 0 실측에서 실사용 원장 edit_state 가 0건(테스트 계정 1개뿐)이라
       "무엇을 자동 배치할지" 를 정할 근거가 아직 없다. 지금 필요한 건 **원장이 실제로 어떻게
       편집하는지** 와 **이 계산이 실기기에서 몇 ms 인지**(목표 p90<400ms)뿐이다.
       critical path 를 막지 않게 다음 프레임으로 미루고, 실패는 통째로 무시한다. */
    try {
      if (window.PhotoContext && S.photoUrl) {
        var _pcUrl = S.photoUrl;
        (window.requestIdleCallback || window.setTimeout)(function () {
          try { window.PhotoContext.of(_pcUrl); } catch (_p1) { void _p1; }
        }, 1);
      }
    } catch (_pc) { void _pc; }
    S._initPhotoN = (S.photos || []).length;   // [캐러셀] 진입 시 사진 수 — 편집 중 추가된 사진만 플로우로 되돌리기 위한 기준
    if (refs.featLocTx) refs.featLocTx.textContent = S.shopName || '우리샵';   // [③] 위치 칩에 실제 샵 이름
    refs.layers.innerHTML = ''; refs.frame.className = 'itded__frame';
    refs.photo.style.backgroundImage = S.photoCss; refs.photo.style.filter = ''; refs.photo.style.backgroundSize = 'cover'; refs.photo.style.backgroundColor = 'transparent';
    if (refs.photofx) { refs.photofx.hidden = true; refs.photofx.style.webkitMaskImage = ''; refs.photofx.style.maskImage = ''; }   // [#11] 새 세션 — 오버레이 초기화
    refs.collage.hidden = true; refs.collage.innerHTML = '';
    refs.photowrap.style.transform = '';
    root.classList.add('is-open');
    // [#9] 시스템 back 으로 편집기가 '먼저' 닫히게 — history 엔트리 1개 push + flow 가 단계 pop 안 하도록 __seOpen 플래그.
    try {
      window.__seOpen = true;
      S._popHandler = function () {
        if (!root || !root.classList.contains('is-open')) return;
        S._histPushed = false; S._cancelled = true;   // [audit] 저장(export) 진행 중 back → onDone 이중발화 차단
        window.__seSwallowPop = true; setTimeout(function () { window.__seSwallowPop = false; }, 0);
        _teardownBack(true); root.classList.remove('is-open');
        if (S && S.onCancel) S.onCancel();   // 시스템 back = 취소로 닫기
      };
      window.addEventListener('popstate', S._popHandler);
      history.pushState({ itded: 1 }, ''); S._histPushed = true;
    } catch (_e) { void _e; }
    // 우리샵 자동배치 텍스트/로고/워터마크를 먼저 올린 뒤 도구 표시(기본 빈 텍스트 자동생성 방지).
    fitStageToRatio();   // [#2] 스테이지를 게시물 비율로 고정(미리보기=편집기 일치)
    refs.photo.style.backgroundSize = S.fitMode; refs.photo.style.backgroundColor = (S.fitMode === 'contain' ? (S.collageBg || '#fff') : 'transparent');
    // [#4/#8/#11/#16] 저장된 편집 이어가기 — 레이아웃/콜라주/레이어 즉시 복원(동기: fitStageToRatio 가 이미 stage 크기 확정).
    if (_ed) { try { _applyRestore(_ed); } catch (_re2) { void _re2; } }
    requestAnimationFrame(function () {
      initCanvas();
      if (!_ed) renderIncoming(S.incoming);   // 복원 모드가 아니면 우리샵 자동배치 레이어
      else { if (!isSingleL(S.layout)) renderCollage(); _renderMissingIncoming(S.incoming); }   // [#2a] 복원했어도 없는 역할의 시술 텍스트는 추가
      // [T4] 작업 기억이 얹혔으면 undo 스택에 '한 덩어리'로 — ↩ 한 번이면 wm 레이어 전체가 원복된다
      //   (배너를 놓쳐도 ↩ 가 회수 경로). 사진 전환으로 레이어가 직렬화 재생성되면 참조가 끊기지만
      //   op 의 indexOf 가드로 무해 — 기존 add/del op 와 같은 한계.
      var _wmLs = S.layers.filter(function (L) { return L._src === 'wm'; });
      if (_wmLs.length) _pushOp({ op: 'wmApply', Ls: _wmLs });
      // [#5] 시술내용 텍스트가 이미 올라왔으면 그걸 선택 → setTool('text')이 빈 '내용을 입력하세요'를 덧붙이지 않음.
      var firstText = S.layers.filter(function (L) { return L.type === 'text'; })[0];
      if (firstText) selectLayer(firstText);   // 텍스트 선택 → selectLayer 가 폰트 패널까지 연다(조건부 노출)
      else _closeToolPanel();   // [2026-07-27] 폰트 패널 기본 닫힘 — Aa 탭/텍스트 선택 전엔 아무 패널도 안 연다
    });
  }
  // [#4/#8/#11/#16] 복원 렌더 — 레이아웃 버튼/콜라주/레이어 반영(동기 호출 가능).
  function _applyRestore(st) {
    root.querySelectorAll('.itlaytype').forEach(function (b) { b.classList.toggle('on', +b.getAttribute('data-lay') === LAYOUTS.indexOf(S.layout)); });
    S._fitManual = true; _syncFitToggle();
    applyPhotoTransform(); if (!isSingleL(S.layout)) renderCollage();
    renderLayoutStrip(); renderLayoutHint();
    _restoreLayers(st.layers);
  }
  function _teardownBack(fromPop) {
    window.__seOpen = false;
    if (S && S._popHandler) { try { window.removeEventListener('popstate', S._popHandler); } catch (_e) { void _e; } S._popHandler = null; }
    if (!fromPop && S && S._histPushed) { S._histPushed = false; window.__seSwallowPop = true; setTimeout(function () { window.__seSwallowPop = false; }, 0); try { history.back(); } catch (_e2) { void _e2; } }
  }
  function close() {
    if (!root || !root.classList.contains('is-open')) return;
    /* [STAGE D] 품질 세션 종료. 발행 경로는 이미 published:true 로 닫았으므로
       여기서 또 닫아도 무해하다(`_cur` 이 null 이면 그냥 넘어간다).
       취소·그냥 닫기도 **세어야** 한다 — 발행만 세면 분모가 발행 성공 쪽으로 쏠린다. */
    try { if (window.DraftQuality) window.DraftQuality.published({ published: false, undone: !!(S && S._cancelled) }); }
    catch (_dqc) { void _dqc; }
    _closeEyedrop(); _teardownBack(false); root.classList.remove('is-open');
  }

  // [#2 단일화] 헤드리스 합성 — 캡션 미리보기를 '편집기와 동일한 렌더러'로 그린다(미리보기=편집기).
  //   화면 밖 고정크기로 렌더 → 폰트/줄바꿈/겹침방지까지 편집기와 100% 동일. 편집 중이면 스킵(상태 충돌 방지).
  // 공유 root/S 를 쓰므로 동시 호출(멀티포토)을 직렬화한다.
  var _composeQ = Promise.resolve();
  function compose(opts) { var run = function () { return _composeOne(opts); }; _composeQ = _composeQ.then(run, run); return _composeQ; }
  function _composeOne(opts) {
    opts = opts || {};
    if (!root) build();
    if (root.classList.contains('is-open')) return Promise.resolve(null);
    var photo = opts.photoUrl || opts.photo || '';
    var photos = (opts.photos && opts.photos.length) ? opts.photos.slice() : [photo];
    var rp = String(opts.ratio || '4:5').split(':'); var rw = +rp[0] || 4, rh = +rp[1] || 5;
    var Wpx = 432, Hpx = Math.round(Wpx * rh / rw);
    S = { layers: [], active: null, tool: null, layout: LAYOUTS[0], layoutOrder: [],
      brush: 'pen', brushSize: 10, drawColor: COLORS[2], shapeColor: COLORS[2], shapeFill: false, shapeThick: 6,
      adj: photos.map(function () { return defAdj(); }), adjSel: 0, collageGap: 3, collageBg: '#FFFFFF', collageBgImg: null, cellCrop: [], cellSel: -1, fitMode: 'contain',
      ratio: (opts.ratio || '4:5'),
      photoUrl: photo, photoCss: 'url("' + photo + '")', photos: photos, shopName: '', pz: { scale: 1, tx: 0, ty: 0 }, incoming: (opts.layers || []) };
    refs.layers.innerHTML = ''; refs.frame.className = 'itded__frame';
    refs.photo.style.backgroundImage = S.photoCss; refs.photo.style.filter = ''; refs.photo.style.backgroundSize = S.fitMode; refs.photo.style.backgroundColor = (S.fitMode === 'contain' ? (S.collageBg || '#fff') : 'transparent');
    refs.collage.hidden = true; refs.collage.innerHTML = ''; refs.photowrap.style.transform = '';
    // display:flex !important + right/bottom:auto — 베이스 .itded{display:none}·inset:0 와의 충돌 방지(off-screen 0크기 방지).
    root.style.cssText = 'display:flex !important;position:fixed;left:-99999px;top:0;right:auto;bottom:auto;width:' + Wpx + 'px;height:' + Hpx + 'px;opacity:0;pointer-events:none;z-index:-1';
    fitStageToRatio();   // [#2] off-screen 스테이지도 같은 비율 박스로(이전 open()이 남긴 inline px 리셋 포함)
    return new Promise(function (res) {
      var done = false;
      var fin = function (url) { if (done) return; done = true; root.style.cssText = ''; res(url); };
      // 폰트 로드를 기다리되 무한대기 방지(최대 500ms). off-screen rAF throttle 회피로 setTimeout 사용.
      var fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
      Promise.race([fontsReady, new Promise(function (r) { setTimeout(r, 500); })]).then(function () {
        setTimeout(function () {
          try { initCanvas(); renderIncoming(S.incoming); } catch (_e) { void _e; }
          /* 자동 초안이 끝난 **뒤에** 굽는다 — 안 그러면 발행본이 편집기와 달라진다.
             ⏱ 상한 1.2초. 플랜이 늦거나 실패해도 굽기는 반드시 진행한다
             (미리보기가 영영 안 나오는 것보다 보정 없는 미리보기가 낫다). */
          var _wait = (S && S._planP && S._planP.then)
            ? Promise.race([S._planP.catch(function () { return null; }),
              new Promise(function (rz) { setTimeout(rz, 1200); })])
            : Promise.resolve();
          _wait.then(function () {
            setTimeout(function () { try { exportComposite(fin); } catch (_e2) { fin(null); } }, 40);
          });
        }, 0);
      });
      setTimeout(function () { fin(null); }, 6000);   // 안전망 — 어떤 경우에도 행 방지
    });
  }

  /* [T4] '이번엔 빼기' — 작업 기억에서 얹힌 레이어만 외과적으로 제거. 사용자가 그 사이 만든 작업은 보존(합의 조건 4).
     token = 적용 identity(엔진 _lastApply.token) — 오래된 배너가 최신 적용을 못 되돌린다(조건 6).
     중복 클릭 = 남은 대상 0 → no-op, 0 반환(조건 5). 제거는 wmRemove op 1개로 쌓여 ↩ 로 복원 가능. */
  function undoWmApply(token) {
    if (!S || !root || !root.classList.contains('is-open')) return 0;
    var Ls = (S.layers || []).filter(function (L) { return L && L._src === 'wm' && (!token || L._wmTok === token); });
    if (!Ls.length) return 0;
    Ls.forEach(function (L) { var i = S.layers.indexOf(L); if (i >= 0) S.layers.splice(i, 1); if (L.el) L.el.remove(); if (S.active === L) S.active = null; });
    _pushOp({ op: 'wmRemove', Ls: Ls });
    return Ls.length;
  }
  window.ItdEditor = { open: open, close: close, compose: compose, undoWmApply: undoWmApply, isOpen: function () { return !!(root && root.classList.contains('is-open')); } };
})();
