/* 뷰티 템플릿 팩 — id별 드로 함수 (BP-6 렌더러 분리, 2026-06-10)

   역할: core(template-renderer-beauty-pack.js) 의 공용 프리미티브를 받아 템플릿 id별 캔버스를 그린다.
   - core 가 먼저 로드되어 window.PhotoEditorBeautyPack._kit / ._register 를 제공한다.
   - 각 _sk* 본문은 분할 전과 100% 동일(좌표·장식 무변경). 등록만 _register 로 한다.
   - 신규 BP 템플릿(예: event-spring-mixed)은 여기에 _sk* 추가 + _register 한 줄로 붙인다.
*/
(function () {
  'use strict';
  var BP = window.PhotoEditorBeautyPack;
  if (!BP || !BP._kit || !BP._register) { return; }
  var K = BP._kit;
  var _rr = K._rr, _pal = K._pal, _coverDraw = K._coverDraw, _slotImg = K._slotImg;
  var _text = K._text, _photoZone = K._photoZone, _zone = K._zone, _watermark = K._watermark;
  var _resolveAfter = K._resolveAfter, _resolveMain = K._resolveMain, _sparkle = K._sparkle, _fitLine = K._fitLine;
  var _strike = K._strike, _photoArch = K._photoArch, _goldEmblem = K._goldEmblem, _ribbon = K._ribbon;
  var _goldPill = K._goldPill, _kakaoChip = K._kakaoChip, _heartPath = K._heartPath, _heart = K._heart;
  var _gemHeart = K._gemHeart, _outlinePill = K._outlinePill, _brushUnderline = K._brushUnderline, _brushHighlight = K._brushHighlight;
  var _paperclip = K._paperclip, _washiTape = K._washiTape, _tornPaper = K._tornPaper, _chipPill = K._chipPill;
  var _pinkPill = K._pinkPill, _polaroid = K._polaroid, _speechNote = K._speechNote, _blob = K._blob;
  var _flower = K._flower, _softCard = K._softCard, _star = K._star, _stars = K._stars;
  var _lineIcon = K._lineIcon, _labelPill = K._labelPill, _photoLabeled = K._photoLabeled;

  // ── 1 · 블랙골드 프리미엄 가격표 (ref ⑲) ─────────────
  function _skBlackGold(ctx, dw, dh, state, tpl, data, c) {
    var sv = (tpl && tpl.slotValues) || {};
    // 배경: 다크 라디얼 + 상단 골드 광선
    var g = ctx.createRadialGradient(dw * 0.5, dh * 0.30, dw * 0.08, dw * 0.5, dh * 0.5, dw * 0.85);
    g.addColorStop(0, '#1C1712'); g.addColorStop(1, '#0C0A07');
    ctx.fillStyle = g; ctx.fillRect(0, 0, dw, dh);
    var lg = ctx.createLinearGradient(0, 0, dw * 0.7, dh * 0.2);
    lg.addColorStop(0, 'rgba(201,162,75,0.16)'); lg.addColorStop(1, 'rgba(201,162,75,0)');
    ctx.fillStyle = lg; ctx.fillRect(0, 0, dw, dh * 0.24);
    // 인셋 프레임(이중 골드)
    ctx.save(); ctx.strokeStyle = '#3A3024'; ctx.lineWidth = 1.5; _rr(ctx, dw * 0.022, dh * 0.018, dw * 0.956, dh * 0.964, 14); ctx.stroke();
    ctx.strokeStyle = 'rgba(201,162,75,0.4)'; ctx.lineWidth = 1; _rr(ctx, dw * 0.03, dh * 0.026, dw * 0.94, dh * 0.948, 12); ctx.stroke(); ctx.restore();
    // 우측 인물 사진(먼저 → 가격 숫자가 위로 겹침)
    _photoArch(ctx, _resolveMain(tpl), dw * 0.55, dh * 0.072, dw * 0.45, dh * 0.52, c, dw * 0.05);
    // 좌측 가독성 스크림
    var sc = ctx.createLinearGradient(dw * 0.45, 0, dw * 0.72, 0);
    sc.addColorStop(0, 'rgba(12,10,7,0.92)'); sc.addColorStop(1, 'rgba(12,10,7,0)');
    ctx.fillStyle = sc; ctx.fillRect(dw * 0.45, dh * 0.30, dw * 0.30, dh * 0.52);
    // 브랜드(좌중앙 상단)
    var bx = dw * 0.40;
    _goldEmblem(ctx, bx, dh * 0.072, dw * 0.085, (data.shop || 'S').slice(0, 1), c);
    _text(ctx, data.shop || '샵명', bx, dh * 0.128, '700 28px "Noto Serif KR", serif', c.accent, 'center');
    if (sv.shop_name_en) _text(ctx, sv.shop_name_en, bx, dh * 0.153, '700 14px "Playfair Display", serif', c.sub, 'center');
    _fitLine(ctx, data.head || '프리미엄 케어 프로그램', bx, dh * 0.213, dw * 0.62, 50, '"Noto Serif KR", serif', c.ink);
    _text(ctx, data.sub || '고객 맞춤 집중 관리', bx, dh * 0.255, '400 22px "Noto Serif KR", serif', c.sub, 'center');
    // 컬럼 헤더
    _text(ctx, '정상가', dw * 0.70, dh * 0.315, '500 17px "Noto Sans KR", sans-serif', c.sub, 'right');
    _text(ctx, '이벤트가', dw * 0.925, dh * 0.315, '700 17px "Noto Sans KR", sans-serif', c.accent, 'right');
    // 가격 행
    var svc = (data.services && data.services.length) ? data.services : [{}, {}, {}, {}];
    var n = Math.max(1, Math.min(svc.length, 6)), top = dh * 0.345, rowH = (dh * 0.80 - top) / n;
    for (var i = 0; i < n; i++) {
      var s = svc[i] || {}, ry = top + i * rowH, mid = ry + rowH * 0.5;
      ctx.save(); ctx.strokeStyle = 'rgba(201,162,75,0.5)'; ctx.lineWidth = 1.2; _rr(ctx, dw * 0.05, mid - dh * 0.026, dw * 0.06, dh * 0.052, 6); ctx.stroke(); ctx.restore();
      _text(ctx, '0' + (i + 1), dw * 0.08, mid + 10, 'italic 700 28px "Playfair Display", serif', c.accent, 'center');
      if (s.badge) _ribbon(ctx, dw * 0.135, ry + rowH * 0.13, s.badge, c);
      _text(ctx, s.name || ('시술 ' + (i + 1)), dw * 0.135, mid - (s.desc ? 4 : -8), '700 27px "Noto Serif KR", serif', c.ink, 'left');
      if (s.desc) _text(ctx, s.desc, dw * 0.135, mid + 22, '400 16px "Noto Sans KR", sans-serif', c.sub, 'left');
      var orig = s.origPrice || s.price || '', struck = !!(s.origPrice && s.origPrice !== s.price);
      if (orig) { _text(ctx, orig, dw * 0.70, mid + 8, '400 21px "Noto Sans KR", sans-serif', c.sub, 'right'); if (struck) _strike(ctx, orig, dw * 0.70, mid + 8, '400 21px "Noto Sans KR", sans-serif', c.sub); }
      _text(ctx, s.price || '', dw * 0.925, mid + 10, '700 30px "Noto Sans KR", sans-serif', c.accent, 'right');
      ctx.save(); ctx.strokeStyle = 'rgba(201,162,75,0.22)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(dw * 0.05, ry + rowH); ctx.lineTo(dw * 0.925, ry + rowH); ctx.stroke(); ctx.restore();
    }
    // CTA + 전화
    _goldPill(ctx, dw * 0.16, dh * 0.85, dw * 0.68, dh * 0.062, c);
    _kakaoChip(ctx, dw * 0.27, dh * 0.881, c);
    _text(ctx, data.cta || '카카오 예약', dw * 0.55, dh * 0.888, '700 28px "Noto Sans KR", sans-serif', '#1B140A', 'center');
    _text(ctx, sv.phone || data.phone || '', dw * 0.5, dh * 0.95, '500 22px "Noto Sans KR", sans-serif', c.accent, 'center');
  }

  // ── 2 · 네일 SNS 전후 폴라로이드 (ref ㉒) · 최난이도 ──
  function _skNailPolaroid(ctx, dw, dh, state, tpl, data, c) {
    var sv = (tpl && tpl.slotValues) || {};
    var g = ctx.createLinearGradient(0, 0, 0, dh); g.addColorStop(0, '#FFF1F6'); g.addColorStop(1, '#FCDDE9');
    ctx.fillStyle = g; ctx.fillRect(0, 0, dw, dh);
    _blob(ctx, dw * 0.17, dh * 0.22, dw * 0.26, '#FFFFFF', 0.5); _blob(ctx, dw * 0.82, dh * 0.4, dw * 0.3, '#FFFFFF', 0.45); _blob(ctx, dw * 0.3, dh * 0.78, dw * 0.28, '#FFE3EE', 0.5);
    _gemHeart(ctx, dw * 0.085, dh * 0.11, 36, '#F48FB1'); _gemHeart(ctx, dw * 0.93, dh * 0.88, 40, '#F48FB1');
    var spk = [[0.14, 0.09], [0.40, 0.11], [0.9, 0.32], [0.11, 0.42], [0.92, 0.57], [0.53, 0.19], [0.88, 0.73]];
    spk.forEach(function (s, i) { _sparkle(ctx, dw * s[0], dh * s[1], 10 + (i % 3) * 6, i % 2 ? '#F2789F' : '#FFFFFF'); });
    _heart(ctx, dw * 0.24, dh * 0.085, 11, null, '#F2789F'); _heart(ctx, dw * 0.84, dh * 0.23, 13, '#F8B5CC', null); _heart(ctx, dw * 0.14, dh * 0.74, 12, null, '#F2789F');
    // 로고
    _outlinePill(ctx, dw / 2, dh * 0.072, dw * 0.30, dh * 0.05, '#F2789F');
    _text(ctx, data.shop || '루미네일', dw / 2, dh * 0.073, '700 28px "Gaegu", sans-serif', '#F2789F', 'center');
    if (sv.shop_name_en) _text(ctx, sv.shop_name_en, dw / 2, dh * 0.095, '700 12px "Playfair Display", serif', '#C97E96', 'center');
    // 헤드라인(강조어 + 본문) + 브러시 밑줄
    ctx.font = '400 86px "Black Han Sans", sans-serif';
    var acc = sv.headline_accent || '네일', head = data.head || '전후 변화';
    var wAcc = ctx.measureText(acc).width, wHead = ctx.measureText(head).width, gapW = 22, totW = wAcc + gapW + wHead, sx = dw / 2 - totW / 2;
    _text(ctx, acc, sx, dh * 0.165, '400 86px "Black Han Sans", sans-serif', '#F2789F', 'left');
    _text(ctx, head, sx + wAcc + gapW, dh * 0.165, '400 86px "Black Han Sans", sans-serif', c.ink, 'left');
    _brushUnderline(ctx, sx + wAcc + gapW, sx + totW, dh * 0.185, '#F2789F');
    _sparkle(ctx, sx + totW + 24, dh * 0.10, 16, '#F2789F');
    // 서브(브러시 하이라이트)
    _brushHighlight(ctx, dw * 0.24, dh * 0.205, dw * 0.52, dh * 0.04, '#F8B5CC');
    _text(ctx, data.sub || '손끝 분위기가 달라지는 순간 ♡', dw / 2, dh * 0.232, '400 30px "Gowun Dodum", sans-serif', c.ink, 'center');
    // 찢긴 메모(좌)
    var memo = (sv.before_caption || data.beforeCap || '밋밋한 손끝,\n생기 없는 컬러 :(').split('\n');
    _tornPaper(ctx, dw * 0.03, dh * 0.41, dw * 0.21, dh * 0.10, '#FBF3EE', '#5A4248', memo);
    // BEFORE 폴라로이드 −5°
    var before = state && state.secondImg ? state.secondImg : null;
    if (before && tpl.imageSlots && tpl.imageSlots.before_photo) { before._focal = tpl.imageSlots.before_photo.focal; before._zoom = tpl.imageSlots.before_photo.zoom; }
    _polaroid(ctx, dw * 0.30, dh * 0.46, dw * 0.40, dh * 0.345, -0.087, before, 'BEFORE', 36, '#5A4248', c, { clip: true });
    // AFTER 폴라로이드 +5° (위에 겹침)
    _polaroid(ctx, dw * 0.71, dh * 0.605, dw * 0.42, dh * 0.365, 0.087, _resolveAfter(state, tpl), 'AFTER', 56, '#EC4E86', c, { tape: true, tapeLabel: '♥ ' + (sv.shop_name_en || 'LUMI NAIL') });
    // 불릿 칩 3
    var tags = (sv.tags && sv.tags.length) ? sv.tags : ['컬러 정리', '광택 포인트', '손끝 무드 업 ↗'];
    for (var i = 0; i < Math.min(tags.length, 3); i++) _chipPill(ctx, dw * 0.05, dh * (0.665 + i * 0.052), dw * 0.27, dh * 0.042, tags[i], c);
    // CTA + 코너 손글씨
    _pinkPill(ctx, dw * 0.33, dh * 0.85, dw * 0.34, dh * 0.062, c);
    _text(ctx, data.cta || 'DM / 예약문의 ♡', dw / 2, dh * 0.888, '700 28px "Gowun Dodum", sans-serif', '#FFFFFF', 'center');
    if (sv.footer_left) { ctx.save(); ctx.translate(dw * 0.13, dh * 0.945); ctx.rotate(-0.06); _text(ctx, sv.footer_left, 0, 0, '400 20px "Nanum Pen Script", cursive', '#E07FA0', 'center'); ctx.restore(); }
    if (sv.footer_right) { ctx.save(); ctx.translate(dw * 0.87, dh * 0.95); ctx.rotate(0.06); _text(ctx, sv.footer_right, 0, 0, '400 20px "Nanum Pen Script", cursive', '#E07FA0', 'center'); ctx.restore(); }
  }

  // ── 2b · 네일 핑크 수채화 전후 폴라로이드 (ref: 루미네일) ──
  //   기존 _skNailPolaroid 의 검증된 좌표/프리미티브를 재사용하되, 핑크 수채화 톤 + 말풍선/하단 찢긴 메모로 차별화.
  //   기존 bp-ba-nail-polaroid 는 그대로 두고 신규 id 로만 동작(대체 X).
  function _skNailPinkPolaroid(ctx, dw, dh, state, tpl, data, c) {
    var sv = (tpl && tpl.slotValues) || {};
    // 배경: 핑크 수채화(3-stop + 블롭 다수)
    var g = ctx.createLinearGradient(0, 0, 0, dh); g.addColorStop(0, '#FFF3F7'); g.addColorStop(0.55, '#FCE3EC'); g.addColorStop(1, '#F9D3E1');
    ctx.fillStyle = g; ctx.fillRect(0, 0, dw, dh);
    _blob(ctx, dw * 0.16, dh * 0.20, dw * 0.30, '#FFFFFF', 0.55); _blob(ctx, dw * 0.84, dh * 0.30, dw * 0.34, '#FFE6F0', 0.5);
    _blob(ctx, dw * 0.50, dh * 0.50, dw * 0.40, '#FFFFFF', 0.32); _blob(ctx, dw * 0.22, dh * 0.80, dw * 0.30, '#FFDCEA', 0.5);
    // 반짝이 + 하트 보석/장식
    _gemHeart(ctx, dw * 0.075, dh * 0.10, 34, '#F06EA0'); _gemHeart(ctx, dw * 0.92, dh * 0.41, 30, '#F48FB1'); _gemHeart(ctx, dw * 0.90, dh * 0.67, 26, '#F06EA0');
    var spk = [[0.12, 0.085], [0.42, 0.10], [0.90, 0.30], [0.10, 0.40], [0.93, 0.55], [0.55, 0.18], [0.86, 0.72], [0.30, 0.06]];
    spk.forEach(function (s, i) { _sparkle(ctx, dw * s[0], dh * s[1], 9 + (i % 3) * 6, i % 2 ? '#F2789F' : '#FFFFFF'); });
    _heart(ctx, dw * 0.25, dh * 0.085, 12, null, '#F2789F'); _heart(ctx, dw * 0.83, dh * 0.22, 13, '#F8B5CC', null); _heart(ctx, dw * 0.14, dh * 0.72, 11, null, '#F2789F');
    // 상단 로고(타원 라인 + 하트)
    _outlinePill(ctx, dw / 2, dh * 0.072, dw * 0.30, dh * 0.05, '#F2789F');
    _heart(ctx, dw / 2 + dw * 0.135, dh * 0.072, 7, '#F2789F', null);
    _text(ctx, data.shop || '루미네일', dw / 2, dh * 0.073, '700 28px "Gaegu", sans-serif', '#F2789F', 'center');
    _text(ctx, sv.shop_name_en || 'LUMI NAIL', dw / 2, dh * 0.097, '700 12px "Playfair Display", serif', '#C97E96', 'center');
    // 헤드라인: 강조어(핑크 브러시) + 본문(블랙 손글씨) + 밑줄/하트
    var acc = sv.headline_accent || '네일', head = data.head || '전후 변화';
    ctx.font = '400 86px "Black Han Sans", sans-serif';
    var wAcc = ctx.measureText(acc).width, wHead = ctx.measureText(head).width, gapW = 24, totW = wAcc + gapW + wHead, sx = dw / 2 - totW / 2;
    _text(ctx, acc, sx, dh * 0.165, '400 86px "Black Han Sans", sans-serif', '#F2789F', 'left');
    _text(ctx, head, sx + wAcc + gapW, dh * 0.165, '400 86px "Black Han Sans", sans-serif', c.ink, 'left');
    _brushUnderline(ctx, sx + wAcc + gapW, sx + totW, dh * 0.186, '#F2789F');
    _heart(ctx, sx - 18, dh * 0.137, 12, '#F8B5CC', '#F2789F');
    // 서브: 핑크 브러시 배너 위 텍스트
    _brushHighlight(ctx, dw * 0.22, dh * 0.205, dw * 0.56, dh * 0.042, '#F8B5CC');
    _text(ctx, data.sub || '손끝 분위기가 달라지는 순간 ♡', dw / 2, dh * 0.233, '400 30px "Gowun Dodum", sans-serif', c.ink, 'center');
    // 좌측 찢긴 메모(before_caption)
    var memo = (sv.before_caption || '밋밋한 손끝,\n생기 없는 컬러 :(').split('\n');
    _tornPaper(ctx, dw * 0.03, dh * 0.40, dw * 0.21, dh * 0.10, '#FBF1F4', '#7A5560', memo);
    // BEFORE 폴라로이드(좌, 작게, −5°, 클립)
    var before = state && state.secondImg ? state.secondImg : null;
    if (before && tpl.imageSlots && tpl.imageSlots.before_photo) { before._focal = tpl.imageSlots.before_photo.focal; before._zoom = tpl.imageSlots.before_photo.zoom; }
    _polaroid(ctx, dw * 0.30, dh * 0.46, dw * 0.40, dh * 0.345, -0.087, before, 'BEFORE', 36, '#5A4248', c, { clip: true });
    // AFTER 폴라로이드(우, 크게, +5°, 핑크 테이프, 위 겹침)
    _polaroid(ctx, dw * 0.71, dh * 0.605, dw * 0.42, dh * 0.365, 0.087, _resolveAfter(state, tpl), 'AFTER', 56, '#EC4E86', c, { tape: true, tapeLabel: '♥ ' + (sv.shop_name_en || 'LUMI NAIL') });
    // 특징 칩 3
    var tags = (sv.tags && sv.tags.length) ? sv.tags : ['컬러 정리', '광택 포인트', '손끝 무드 업 ↗'];
    for (var i = 0; i < Math.min(tags.length, 3); i++) _chipPill(ctx, dw * 0.05, dh * (0.665 + i * 0.052), dw * 0.27, dh * 0.042, tags[i], c);
    // CTA(핑크 rounded pill + 하트)
    _pinkPill(ctx, dw * 0.33, dh * 0.85, dw * 0.34, dh * 0.062, c);
    _text(ctx, data.cta || 'DM / 예약문의', dw * 0.485, dh * 0.881, '700 26px "Gowun Dodum", sans-serif', '#FFFFFF', 'center');
    _heart(ctx, dw * 0.605, dh * 0.879, 9, '#FFFFFF', null);
    // 하단 찢긴 메모(footer_left) + 우하단 말풍선(footer_right)
    if (sv.footer_left) _tornPaper(ctx, dw * 0.02, dh * 0.90, dw * 0.22, dh * 0.075, '#FBF1F4', '#7A5560', [sv.footer_left]);
    if (sv.footer_right) _speechNote(ctx, dw * 0.78, dh * 0.93, dw * 0.30, dh * 0.06, sv.footer_right, c);
  }

  // ── 3 · 속눈썹 후기 블루 카드 (ref ⑱) ────────────────
  function _skLashReview(ctx, dw, dh, state, tpl, data, c) {
    var sv = (tpl && tpl.slotValues) || {};
    var g = ctx.createLinearGradient(0, 0, 0, dh); g.addColorStop(0, '#FBFCFE'); g.addColorStop(1, '#EAF1F8');
    ctx.fillStyle = g; ctx.fillRect(0, 0, dw, dh);
    _blob(ctx, dw * 0.1, dh * 0.88, dw * 0.34, '#C9D9EA', 0.7); _blob(ctx, dw * 0.92, dh * 0.9, dw * 0.3, '#C9D9EA', 0.6); _blob(ctx, dw * 0.95, dh * 0.12, dw * 0.18, '#D7E4F0', 0.5);
    _flower(ctx, dw * 0.14, dh * 0.85, dw * 0.07, '#AFC6DE'); _flower(ctx, dw * 0.22, dh * 0.92, dw * 0.05, '#C9D9EA'); _flower(ctx, dw * 0.9, dh * 0.56, dw * 0.06, '#AFC6DE');
    // 로고
    _text(ctx, data.shop || '모어래쉬', dw / 2, dh * 0.085, '700 28px "Noto Serif KR", serif', c.accent, 'center');
    if (sv.shop_name_en) _text(ctx, sv.shop_name_en, dw / 2, dh * 0.108, '700 13px "Playfair Display", serif', c.sub, 'center');
    // 헤드라인 + Review 스크립트 + 스파클
    _text(ctx, data.head || '속눈썹 후기', dw / 2, dh * 0.185, '700 66px "Noto Serif KR", serif', c.ink, 'center');
    _text(ctx, 'Review', dw * 0.70, dh * 0.155, '400 38px "Nanum Pen Script", cursive', c.accent, 'left');
    _sparkle(ctx, dw * 0.75, dh * 0.135, 16, c.accent);
    // 서브 + 라인 디바이더
    _text(ctx, data.sub || '또렷하고 자연스러운 눈매 변화', dw / 2, dh * 0.235, '400 23px "Noto Sans KR", sans-serif', c.sub, 'center');
    ctx.save(); ctx.strokeStyle = c.line; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(dw * 0.2, dh * 0.231); ctx.lineTo(dw * 0.27, dh * 0.231); ctx.moveTo(dw * 0.73, dh * 0.231); ctx.lineTo(dw * 0.8, dh * 0.231); ctx.stroke(); ctx.restore();
    // 카드
    _softCard(ctx, dw * 0.065, dh * 0.285, dw * 0.87, dh * 0.49, 30);
    // 서클 포토
    var main = _resolveMain(tpl), ccx = dw * 0.285, ccy = dh * 0.46, r = dw * 0.155;
    ctx.save(); ctx.beginPath(); ctx.arc(ccx, ccy, r, 0, Math.PI * 2); ctx.clip();
    if (!(main && _coverDraw(ctx, main, ccx - r, ccy - r, r * 2, r * 2, main._focal, main._zoom))) { ctx.fillStyle = c.line; ctx.fillRect(ccx - r, ccy - r, r * 2, r * 2); }
    ctx.restore();
    ctx.save(); ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(ccx, ccy, r, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = c.line; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ccx, ccy, r + 4, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    if (!main) _text(ctx, '사진', ccx, ccy, '600 24px "Noto Sans KR", sans-serif', c.sub, 'center');
    // 인용문 + 후기
    _text(ctx, '“', dw * 0.50, dh * 0.375, '700 80px "Noto Serif KR", serif', c.accent, 'left');
    var rt = data.review || sv.review_text || '원하던 느낌을 정확히 잡아주셔서 너무 만족했어요.';
    if (window.PhotoEditorTemplateFitText && window.PhotoEditorTemplateFitText.drawFitText) {
      window.PhotoEditorTemplateFitText.drawFitText(ctx, rt, { x: dw * 0.50, y: dh * 0.40, w: dw * 0.40, h: dh * 0.16 }, { maxFontSize: 30, minFontSize: 20, maxLines: 4, lineHeight: 1.55, color: c.ink, align: 'left', valign: 'top', weight: '400', fontFamily: '"Noto Sans KR", sans-serif' });
    } else { _text(ctx, rt.slice(0, 30), dw * 0.50, dh * 0.45, '400 26px "Noto Sans KR", sans-serif', c.ink, 'left'); }
    _text(ctx, '”', dw * 0.88, dh * 0.565, '700 80px "Noto Serif KR", serif', c.accent, 'right');
    // 3컬럼(아이콘 + 값 + 라벨 + 세로 구분선)
    var cols = [['person', data.customer || '고객님', '고객님'], ['lash', data.serviceName || '시술 항목', '시술 항목'], ['calendar', data.reviewDate || '날짜', '시술 날짜']];
    var cyTop = dh * 0.635;
    for (var i = 0; i < 3; i++) {
      var colx = dw * (0.275 + i * 0.225);
      _lineIcon(ctx, cols[i][0], colx, cyTop, 26, c.accent);
      _text(ctx, cols[i][1], colx, cyTop + 44, '700 23px "Noto Sans KR", sans-serif', c.ink, 'center');
      _text(ctx, cols[i][2], colx, cyTop + 70, '400 15px "Noto Sans KR", sans-serif', c.sub, 'center');
      if (i < 2) { ctx.save(); ctx.strokeStyle = c.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(dw * (0.275 + i * 0.225) + dw * 0.1125, cyTop - 20); ctx.lineTo(dw * (0.275 + i * 0.225) + dw * 0.1125, cyTop + 75); ctx.stroke(); ctx.restore(); }
    }
    // 별점 + 감사 + CTA
    var rating = (sv.rating != null) ? Math.max(0, Math.min(5, sv.rating | 0)) : 5;
    _stars(ctx, dw / 2, dh * 0.825, rating, 18, 44, c.accent);
    _text(ctx, sv.thanks || '소중한 후기 감사합니다. ♡', dw / 2, dh * 0.865, '400 28px "Nanum Pen Script", cursive', c.accent, 'center');
    var g2 = ctx.createLinearGradient(dw * 0.33, 0, dw * 0.67, 0); g2.addColorStop(0, '#6E93B4'); g2.addColorStop(1, '#587E9F');
    ctx.save(); ctx.shadowColor = 'rgba(80,110,140,0.3)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4; ctx.fillStyle = g2; _rr(ctx, dw * 0.33, dh * 0.895, dw * 0.34, dh * 0.062, 45); ctx.fill(); ctx.restore();
    _lineIcon(ctx, 'chat', dw * 0.42, dh * 0.926, 22, '#fff');
    _text(ctx, data.cta || '상담 / 예약', dw * 0.535, dh * 0.934, '700 28px "Gowun Dodum", sans-serif', '#fff', 'center');
  }

  // ── 4 · 여드름 케어 전후 (핑크 집중관리, ref-8) ───────
  function _skSkinAcnePink(ctx, dw, dh, state, tpl, data, c) {
    var sv = (tpl && tpl.slotValues) || {};
    var g = ctx.createLinearGradient(0, 0, 0, dh); g.addColorStop(0, '#FFF4F7'); g.addColorStop(0.5, '#FCE9EF'); g.addColorStop(1, '#FBE0EA');
    ctx.fillStyle = g; ctx.fillRect(0, 0, dw, dh);
    _blob(ctx, dw * 0.14, dh * 0.10, dw * 0.30, '#FFFFFF', 0.5); _blob(ctx, dw * 0.90, dh * 0.16, dw * 0.26, '#FFE2EC', 0.5);
    _blob(ctx, dw * 0.88, dh * 0.80, dw * 0.30, '#FFD9E6', 0.45); _blob(ctx, dw * 0.12, dh * 0.60, dw * 0.24, '#FFFFFF', 0.4);
    _gemHeart(ctx, dw * 0.07, dh * 0.205, 24, '#F48FB1'); _heart(ctx, dw * 0.93, dh * 0.10, 12, '#F8B5CC', null);
    [[0.90, 0.30], [0.10, 0.42], [0.94, 0.55]].forEach(function (s, i) { _sparkle(ctx, dw * s[0], dh * s[1], 9 + (i % 2) * 5, '#F2789F'); });
    // 상단 서브 + 좌상단 손글씨 스티커
    _text(ctx, data.sub || '깨끗한 피부, 자신감 UP!', dw / 2, dh * 0.05, '700 22px "Gowun Dodum", sans-serif', c.sub, 'center');
    if (sv.top_sticker) { ctx.save(); ctx.translate(dw * 0.20, dh * 0.088); ctx.rotate(-0.1); _heart(ctx, -dw * 0.085, -dh * 0.011, 8, '#F8B5CC', null); _text(ctx, sv.top_sticker, 0, 0, '400 20px "Nanum Pen Script", cursive', '#E06B98', 'center'); ctx.restore(); }
    // 헤드라인: 본문(ink) + 강조어(핑크, 하이라이트)
    var head = data.head || '여드름 케어', acc = sv.headline_accent || '전후';
    ctx.font = '400 70px "Black Han Sans", sans-serif';
    var wHead = ctx.measureText(head).width, wAcc = ctx.measureText(acc).width, gapW = 22, totW = wHead + gapW + wAcc, sx = dw / 2 - totW / 2;
    _brushHighlight(ctx, sx + wHead + gapW - 8, dh * 0.123, wAcc + 16, dh * 0.05, '#F8B5CC');
    _text(ctx, head, sx, dh * 0.155, '400 70px "Black Han Sans", sans-serif', c.ink, 'left');
    _text(ctx, acc, sx + wHead + gapW, dh * 0.155, '400 70px "Black Han Sans", sans-serif', c.accent, 'left');
    // 핑크 배지 pill + 스파클
    var badge = sv.badge || '2주 집중 관리 결과';
    ctx.font = '700 22px "Gowun Dodum", sans-serif'; var bw = ctx.measureText(badge).width + 80;
    _pinkPill(ctx, dw / 2 - bw / 2, dh * 0.185, bw, dh * 0.042, c);
    _sparkle(ctx, dw / 2 - bw / 2 + 26, dh * 0.206, 9, '#FFFFFF'); _sparkle(ctx, dw / 2 + bw / 2 - 26, dh * 0.206, 9, '#FFFFFF');
    _text(ctx, badge, dw / 2, dh * 0.214, '700 22px "Gowun Dodum", sans-serif', '#FFFFFF', 'center');
    // 해시태그 한 줄
    var tags = (sv.hashtags && sv.hashtags.length) ? sv.hashtags : ['#여드름진정', '#피부결개선', '#민감성피부OK', '#자신감회복'];
    _text(ctx, tags.join('   '), dw / 2, dh * 0.262, '700 18px "Noto Sans KR", sans-serif', '#C77E97', 'center');
    // 전후 사진 2분할(둥근 매거진 카드) + 중앙 화살표
    var pad = dw * 0.045, gap = dw * 0.03, cardW = (dw - pad * 2 - gap) / 2, cardY = dh * 0.29, cardH = dh * 0.295;
    var before = state && state.secondImg ? state.secondImg : null;
    if (before && tpl.imageSlots && tpl.imageSlots.before_photo) { before._focal = tpl.imageSlots.before_photo.focal; before._zoom = tpl.imageSlots.before_photo.zoom; }
    _photoLabeled(ctx, before, pad, cardY, cardW, cardH, 18, data.beforeLabel || 'BEFORE', '#5A4248', 'left', c);
    _photoLabeled(ctx, _resolveAfter(state, tpl), pad + cardW + gap, cardY, cardW, cardH, 18, data.afterLabel || 'AFTER', c.accent, 'right', c);
    var acx = pad + cardW + gap / 2, acy = cardY + cardH / 2;
    ctx.save(); ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(acx, acy, dw * 0.032, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#FFF'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(acx - 5, acy - 8); ctx.lineTo(acx + 6, acy); ctx.lineTo(acx - 5, acy + 8); ctx.stroke(); ctx.restore();
    // 사진 아래 손글씨 캡션
    _text(ctx, data.beforeCap || '붉은 트러블·울퉁불퉁한 결', pad + cardW / 2, cardY + cardH + 30, '400 19px "Nanum Pen Script", cursive', c.sub, 'center');
    _text(ctx, data.afterCap || '피부 진정·매끈해진 결', pad + cardW + gap + cardW / 2, cardY + cardH + 30, '400 19px "Nanum Pen Script", cursive', '#E06B98', 'center');
    // 후기 박스(흰 카드 + 원형 고객사진 + 인용)
    var rbY = dh * 0.655, rbX = dw * 0.06, rbW = dw * 0.88, rbH = dh * 0.205;
    _softCard(ctx, rbX, rbY, rbW, rbH, 24);
    var rcx = rbX + rbH * 0.6, rcy = rbY + rbH / 2, rr = rbH * 0.34;
    ctx.save(); ctx.beginPath(); ctx.arc(rcx, rcy, rr, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = '#F3DCE4'; ctx.fillRect(rcx - rr, rcy - rr, rr * 2, rr * 2); ctx.restore();
    ctx.save(); ctx.strokeStyle = '#FFF'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(rcx, rcy, rr, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    _text(ctx, '＋', rcx, rcy + 8, '600 24px "Noto Sans KR", sans-serif', '#C99', 'center');
    var qx = rcx + rr + dw * 0.045;
    _text(ctx, '“', qx - 4, rbY + dh * 0.052, '700 54px "Noto Serif KR", serif', c.accent, 'left');
    _text(ctx, sv.review_quote || '화장 밀림이 줄었어요!', qx + 30, rbY + dh * 0.045, '700 24px "Gowun Dodum", sans-serif', c.accent, 'left');
    var rb = sv.review_body || '평소 트러블 때문에 화장도 잘 안 먹고 스트레스였는데, 2주 만에 피부가 진정되고 결이 매끈해졌어요!';
    if (window.PhotoEditorTemplateFitText && window.PhotoEditorTemplateFitText.drawFitText) {
      window.PhotoEditorTemplateFitText.drawFitText(ctx, rb, { x: qx, y: rbY + dh * 0.065, w: rbW - (qx - rbX) - dw * 0.05, h: rbH - dh * 0.085 }, { maxFontSize: 18, minFontSize: 14, maxLines: 4, lineHeight: 1.5, color: '#6A565C', align: 'left', valign: 'top', weight: '400', fontFamily: '"Noto Sans KR", sans-serif' });
    } else { _text(ctx, rb.slice(0, 28), qx, rbY + dh * 0.095, '400 16px "Noto Sans KR", sans-serif', '#6A565C', 'left'); }
    // 우상단 회전 CTA 배지 + 하단 @handle
    if (data.cta) { ctx.save(); ctx.translate(dw * 0.85, dh * 0.62); ctx.rotate(0.13); _outlinePill(ctx, 0, 0, dw * 0.26, dh * 0.036, c.accent); _text(ctx, data.cta, 0, dh * 0.009, '700 15px "Gowun Dodum", sans-serif', c.accent, 'center'); ctx.restore(); }
    _text(ctx, sv.profile_handle || '@softglow_skin', dw / 2, dh * 0.95, '700 22px "Noto Sans KR", sans-serif', c.accent, 'center');
  }

  // ── 5 · 붙임머리 전후 (라벤더 폴라로이드, ref-9) ──────
  function _skHairExtPolaroid(ctx, dw, dh, state, tpl, data, c) {
    var sv = (tpl && tpl.slotValues) || {};
    var g = ctx.createLinearGradient(0, 0, dw, dh); g.addColorStop(0, '#EFE6F6'); g.addColorStop(0.5, '#F6E6F0'); g.addColorStop(1, '#FBE3EC');
    ctx.fillStyle = g; ctx.fillRect(0, 0, dw, dh);
    _blob(ctx, dw * 0.16, dh * 0.14, dw * 0.30, '#FFFFFF', 0.5); _blob(ctx, dw * 0.86, dh * 0.20, dw * 0.28, '#EAD9F2', 0.5);
    _blob(ctx, dw * 0.50, dh * 0.55, dw * 0.40, '#FFFFFF', 0.3); _blob(ctx, dw * 0.20, dh * 0.84, dw * 0.28, '#F6D7E6', 0.45);
    [[0.12, 0.10], [0.42, 0.07], [0.92, 0.34], [0.08, 0.46], [0.90, 0.60]].forEach(function (s, i) { _sparkle(ctx, dw * s[0], dh * s[1], 9 + (i % 3) * 5, i % 2 ? '#C9A6E0' : '#F2789F'); });
    _heart(ctx, dw * 0.60, dh * 0.10, 13, '#F8B5CC', null);
    // 좌상단 라벨 + 상단 손글씨
    _text(ctx, sv.shop_label || '#HAIR EXTENSION', dw * 0.06, dh * 0.045, '700 16px "Noto Sans KR", sans-serif', c.sub, 'left');
    _text(ctx, data.sub || '자연스럽게 길어지고, 예뻐지는 마법', dw * 0.50, dh * 0.06, '400 24px "Nanum Pen Script", cursive', '#9B6FB0', 'center');
    // BEST 배지(우상단 보라 원형)
    var bbx = dw * 0.86, bby = dh * 0.10;
    ctx.save(); var bg2 = ctx.createLinearGradient(bbx - 50, bby - 30, bbx + 50, bby + 30); bg2.addColorStop(0, '#C9A6E0'); bg2.addColorStop(1, '#A678C8');
    ctx.shadowColor = 'rgba(166,120,200,0.4)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4; ctx.fillStyle = bg2;
    ctx.beginPath(); ctx.arc(bbx, bby, dw * 0.08, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    _text(ctx, sv.best_badge || 'BEST', bbx, bby + 8, '800 26px "Montserrat", sans-serif', '#FFFFFF', 'center');
    // 헤드라인: 본문(ink) + 강조어(핑크, 하이라이트)
    var head = data.head || '붙임머리', acc = sv.headline_accent || '전후';
    ctx.font = '400 76px "Black Han Sans", sans-serif';
    var wHead = ctx.measureText(head).width, wAcc = ctx.measureText(acc).width, gapW = 22, totW = wHead + gapW + wAcc, sx = dw / 2 - totW / 2;
    _text(ctx, head, sx, dh * 0.175, '400 76px "Black Han Sans", sans-serif', c.ink, 'left');
    _brushHighlight(ctx, sx + wHead + gapW - 6, dh * 0.135, wAcc + 14, dh * 0.052, '#F8B5CC');
    _text(ctx, acc, sx + wHead + gapW, dh * 0.175, '400 76px "Black Han Sans", sans-serif', c.accent, 'left');
    // 검정 리본 배너
    var rib = sv.ribbon || '볼륨감이 달라지는 순간';
    ctx.font = '700 24px "Gowun Dodum", sans-serif'; var rw = ctx.measureText(rib).width + 96, rx = dw / 2 - rw / 2, ry = dh * 0.205;
    ctx.save(); ctx.fillStyle = '#2A2230'; _rr(ctx, rx, ry, rw, dh * 0.046, 6); ctx.fill(); ctx.restore();
    _sparkle(ctx, rx + 30, ry + dh * 0.023, 9, '#F2C9DC'); _sparkle(ctx, rx + rw - 30, ry + dh * 0.023, 9, '#F2C9DC');
    _text(ctx, rib, dw / 2, ry + dh * 0.032, '700 24px "Gowun Dodum", sans-serif', '#FFFFFF', 'center');
    // 폴라로이드 2장(캡션=before/after 설명)
    var before = state && state.secondImg ? state.secondImg : null;
    if (before && tpl.imageSlots && tpl.imageSlots.before_photo) { before._focal = tpl.imageSlots.before_photo.focal; before._zoom = tpl.imageSlots.before_photo.zoom; }
    _polaroid(ctx, dw * 0.29, dh * 0.45, dw * 0.40, dh * 0.34, -0.05, before, data.beforeCap || '밋밋하고 힘없는 모발', 23, '#6A5566', c, {});
    _polaroid(ctx, dw * 0.71, dh * 0.47, dw * 0.42, dh * 0.355, 0.05, _resolveAfter(state, tpl), data.afterCap || '풍성하고 자연스러운 볼륨', 23, '#E06B98', c, {});
    // BEFORE/AFTER 코너 라벨
    _labelPill(ctx, dw * 0.11, dh * 0.335, dw * 0.18, dh * 0.04, data.beforeLabel || 'BEFORE', '#2A2230', '#FFFFFF');
    _labelPill(ctx, dw * 0.71, dh * 0.345, dw * 0.18, dh * 0.04, data.afterLabel || 'AFTER', c.accent, '#FFFFFF');
    // 중앙 곡선 화살표
    ctx.save(); ctx.strokeStyle = '#3A2F40'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(dw * 0.45, dh * 0.50); ctx.quadraticCurveTo(dw * 0.50, dh * 0.46, dw * 0.55, dh * 0.50); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(dw * 0.55, dh * 0.50); ctx.lineTo(dw * 0.527, dh * 0.487); ctx.moveTo(dw * 0.55, dh * 0.50); ctx.lineTo(dw * 0.534, dh * 0.515); ctx.stroke(); ctx.restore();
    // 포인트 칩 3(좌하단)
    var tags = (sv.tags && sv.tags.length) ? sv.tags : ['자연스러운 연결', '풍성한 볼륨감', '긴머리 변신 완성'];
    for (var i = 0; i < Math.min(tags.length, 3); i++) _chipPill(ctx, dw * 0.05, dh * (0.70 + i * 0.058), dw * 0.40, dh * 0.046, tags[i], c);
    // 하단 중앙 손글씨
    if (sv.bottom_memo) { ctx.save(); ctx.translate(dw * 0.68, dh * 0.79); ctx.rotate(-0.04); _text(ctx, sv.bottom_memo, 0, 0, '400 21px "Nanum Pen Script", cursive', '#8A6FA0', 'center'); ctx.restore(); }
    // 우하단 CTA pill(채팅 아이콘 + 텍스트 + 화살표)
    _pinkPill(ctx, dw * 0.55, dh * 0.86, dw * 0.40, dh * 0.06, c);
    _lineIcon(ctx, 'chat', dw * 0.615, dh * 0.888, 20, '#FFFFFF');
    _text(ctx, data.cta || '상담 가능', dw * 0.74, dh * 0.898, '700 24px "Gowun Dodum", sans-serif', '#FFFFFF', 'center');
    ctx.save(); ctx.strokeStyle = '#FFF'; ctx.lineWidth = 3; ctx.lineCap = 'round'; var ax = dw * 0.885, ay = dh * 0.89; ctx.beginPath(); ctx.moveTo(ax - 5, ay - 7); ctx.lineTo(ax + 5, ay); ctx.lineTo(ax - 5, ay + 7); ctx.stroke(); ctx.restore();
    // 푸터
    _text(ctx, sv.footer || 'YOUR BEAUTY, OUR PASSION', dw / 2, dh * 0.965, '700 16px "Noto Sans KR", sans-serif', c.sub, 'center');
  }

  // ── BP-6 봄 이벤트 전용 로컬 헬퍼(_es*) — core 무변경, 이 파일 안에서만 사용 ──
  function _esNewsScrap(ctx, x, y, w, h, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.shadowColor = 'rgba(0,0,0,0.08)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#F3EEE5'; ctx.fillRect(0, 0, w, h); ctx.shadowColor = 'transparent';
    ctx.fillStyle = 'rgba(150,140,128,0.32)';
    for (var i = 0; i < Math.floor(h / 16); i++) ctx.fillRect(9, 12 + i * 16, w - 18 - (i % 3) * 14, 2.5);
    ctx.restore();
  }
  function _esIcon(ctx, type, cx, cy, s, color) {
    ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (type === 'dye') {
      ctx.beginPath(); ctx.arc(cx, cy + s * 0.08, s * 0.44, 0.12 * Math.PI, 0.88 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + s * 0.04, cy - s * 0.5); ctx.lineTo(cx + s * 0.04, cy + s * 0.12); ctx.stroke();
    } else if (type === 'clinic') {
      _rr(ctx, cx - s * 0.22, cy - s * 0.18, s * 0.44, s * 0.6, s * 0.1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - s * 0.1, cy - s * 0.18); ctx.lineTo(cx - s * 0.1, cy - s * 0.42); ctx.lineTo(cx + s * 0.1, cy - s * 0.42); ctx.lineTo(cx + s * 0.1, cy - s * 0.18); ctx.stroke();
    } else if (type === 'cut') {
      ctx.beginPath(); ctx.arc(cx - s * 0.22, cy + s * 0.3, s * 0.14, 0, 2 * Math.PI); ctx.arc(cx + s * 0.22, cy + s * 0.3, s * 0.14, 0, 2 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - s * 0.12, cy + s * 0.2); ctx.lineTo(cx + s * 0.32, cy - s * 0.42); ctx.moveTo(cx + s * 0.12, cy + s * 0.2); ctx.lineTo(cx - s * 0.32, cy - s * 0.42); ctx.stroke();
    } else if (type === 'hair') {
      for (var k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(cx + k * s * 0.24, cy - s * 0.44); ctx.quadraticCurveTo(cx + k * s * 0.24 + s * 0.2, cy, cx + k * s * 0.24, cy + s * 0.44); ctx.stroke(); }
    }
    ctx.restore();
  }
  function _esTulip(ctx, cx, cy, s, petal, stem) {
    ctx.save();
    ctx.strokeStyle = stem; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + s * 1.7); ctx.stroke();
    ctx.strokeStyle = '#9BBE7E'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.8); ctx.quadraticCurveTo(cx - s * 0.7, cy + s * 0.5, cx - s * 0.8, cy + s * 1.0); ctx.stroke();
    ctx.fillStyle = petal;
    ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.55);
    ctx.bezierCurveTo(cx - s * 0.72, cy - s * 0.2, cx - s * 0.5, cy + s * 0.5, cx, cy + s * 0.45);
    ctx.bezierCurveTo(cx + s * 0.5, cy + s * 0.5, cx + s * 0.72, cy - s * 0.2, cx, cy - s * 0.55); ctx.fill();
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.4); ctx.lineTo(cx, cy + s * 0.4); ctx.stroke();
    ctx.restore();
  }
  function _esCheck(ctx, cx, cy, s, color) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(cx - s * 0.5, cy); ctx.lineTo(cx - s * 0.08, cy + s * 0.42); ctx.lineTo(cx + s * 0.55, cy - s * 0.5); ctx.stroke(); ctx.restore();
  }

  // ── 6 · 봄 시즌 이벤트 (핑크 스크랩북, ref-3 mixed: 가격표+이벤트+모델 사진) ──
  //   kind=price 재사용(services + main_photo). 장식문구는 sv.xxx || 한글 기본값 폴백(기존 6종과 동일 패턴).
  //   신규 시각요소(아이콘박스·튤립·콜라주·체크)는 위 _es* 로컬 헬퍼로만 — core/기존 6종 무변경.
  function _skEventSpringMixed(ctx, dw, dh, state, tpl, data, c) {
    var sv = (tpl && tpl.slotValues) || {};
    var INK = '#2A2230', PINK = '#EC4E86', PINK2 = '#F2789F', SUB = '#8A7580';
    var KRAFT = '#E3D2B4', KRAFTNOTE = '#EFE3CD';
    // 배경(소프트 핑크) + 신문 콜라주 스크랩(좌상·좌하)
    var bg = ctx.createLinearGradient(0, 0, 0, dh); bg.addColorStop(0, '#FCEAF1'); bg.addColorStop(1, '#F8DCE6');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, dw, dh);
    _esNewsScrap(ctx, -dw * 0.04, -dh * 0.01, dw * 0.16, dh * 0.18, -0.08);
    _esNewsScrap(ctx, -dw * 0.03, dh * 0.82, dw * 0.17, dh * 0.16, 0.06);
    _blob(ctx, dw * 0.5, dh * 0.5, dw * 0.42, '#FFFFFF', 0.18);
    // 해시태그 + 별 두들
    _text(ctx, sv.hashtag || '#봄맞이 변신은 지금이 기회!', dw * 0.07, dh * 0.062, '400 30px "Nanum Pen Script", cursive', INK, 'left');
    _star(ctx, dw * 0.45, dh * 0.05, 13, PINK2);
    // 헤드라인 2줄(헤비) + 핑크 브러시 밑줄 + 하트
    _text(ctx, sv.headline_top || '봄 시즌', dw * 0.055, dh * 0.155, '400 96px "Black Han Sans", sans-serif', INK, 'left');
    _brushUnderline(ctx, dw * 0.06, dw * 0.45, dh * 0.175, PINK2);
    _text(ctx, sv.headline_bottom || '이벤트', dw * 0.055, dh * 0.245, '400 96px "Black Han Sans", sans-serif', INK, 'left');
    _heart(ctx, dw * 0.52, dh * 0.135, 17, null, PINK);
    // 서브 배너(핑크 브러시 하이라이트) + 꽃
    _brushHighlight(ctx, dw * 0.055, dh * 0.285, dw * 0.40, dh * 0.05, '#F6A8C4');
    _text(ctx, sv.sub_banner || '설레는 봄, 예뻐질 시간', dw * 0.075, dh * 0.318, '700 30px "Gowun Dodum", sans-serif', '#FFFFFF', 'left');
    _flower(ctx, dw * 0.43, dh * 0.305, 16, '#F6A8C4');
    // 서브 문구 2줄
    _text(ctx, sv.sub1 || '다가오는 봄, 스타일로 꽃 피워보세요.', dw * 0.06, dh * 0.365, '400 23px "Noto Sans KR", sans-serif', SUB, 'left');
    _text(ctx, sv.sub2 || '지금이 가장 예뻐질 타이밍!', dw * 0.06, dh * 0.39, '400 23px "Noto Sans KR", sans-serif', SUB, 'left');
    // 우측 모델 사진(폴라로이드 + 마스킹테이프), 뒤 콜라주
    _esNewsScrap(ctx, dw * 0.49, dh * 0.06, dw * 0.16, dh * 0.20, 0.05);
    _polaroid(ctx, dw * 0.71, dh * 0.30, dw * 0.50, dh * 0.46, 0.028, _resolveMain(tpl), '', 20, INK, c, { tape: true, tapeLabel: '' });
    // 우상단 크라프트 탭(샵명)
    ctx.save(); ctx.translate(dw * 0.78, dh * 0.045); ctx.rotate(0.02);
    ctx.fillStyle = KRAFT; ctx.shadowColor = 'rgba(0,0,0,0.1)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
    ctx.fillRect(-dw * 0.16, -dh * 0.018, dw * 0.32, dh * 0.058); ctx.shadowColor = 'transparent'; ctx.restore();
    _text(ctx, sv.shop_label || data.shop || 'BEAUTY ROOM', dw * 0.78, dh * 0.045, '700 24px "Playfair Display", serif', '#5A4632', 'center');
    _text(ctx, sv.shop_sub || 'HAIR SALON', dw * 0.78, dh * 0.072, '400 13px "Noto Sans KR", sans-serif', '#8A7355', 'center');
    // Spring EVENT 원형 배지(사진 위)
    var bx = dw * 0.86, by = dh * 0.215, br = dw * 0.082;
    ctx.save(); var bgr = ctx.createLinearGradient(bx - br, by - br, bx + br, by + br); bgr.addColorStop(0, '#F2789F'); bgr.addColorStop(1, '#EC4E86');
    ctx.shadowColor = 'rgba(236,78,134,0.4)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 4; ctx.fillStyle = bgr;
    ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    _text(ctx, 'Spring', bx, by - 4, '400 30px "Nanum Pen Script", cursive', '#FFFFFF', 'center');
    _text(ctx, 'EVENT', bx, by + 22, '800 20px "Montserrat", sans-serif', '#FFFFFF', 'center');
    // 가격 4행 카드(아이콘 박스 + 시술명 + 가격 + 설명)
    var svc = (data.services && data.services.length) ? data.services : [
      { name: '염색', price: '120,000~', desc: '디자인 염색 / 탈색 별도' },
      { name: '클리닉', price: '90,000', desc: '모발케어 맞춤 클리닉' },
      { name: '커트', price: '30,000', desc: '디자인 커트' },
      { name: '붙임머리', price: '상담 문의', desc: '자연스러운 변신, 맞춤 상담' },
    ];
    var icons = ['dye', 'clinic', 'cut', 'hair'];
    var rx = dw * 0.045, rw = dw * 0.47, rH = dh * 0.066, rGap = dh * 0.012, rY0 = dh * 0.41;
    for (var i = 0; i < Math.min(svc.length, 4); i++) {
      var s = svc[i] || {}, ry = rY0 + i * (rH + rGap);
      ctx.save(); ctx.fillStyle = '#FFFFFF'; ctx.shadowColor = 'rgba(180,130,150,0.18)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4;
      _rr(ctx, rx, ry, rw, rH, 12); ctx.fill(); ctx.restore();
      if (i % 2 === 1) _paperclip(ctx, rx + 6, ry + rH * 0.5, '#C2A9BC');
      var bs = rH * 0.72, bX = rx + rH * 0.22;
      ctx.save(); var ig = ctx.createLinearGradient(bX, ry, bX, ry + bs); ig.addColorStop(0, '#F2789F'); ig.addColorStop(1, '#EC4E86');
      ctx.fillStyle = ig; _rr(ctx, bX, ry + (rH - bs) / 2, bs, bs, 9); ctx.fill(); ctx.restore();
      _esIcon(ctx, icons[i % 4], bX + bs / 2, ry + rH / 2, bs * 0.5, '#FFFFFF');
      var tx = bX + bs + dw * 0.025;
      _text(ctx, s.name || ('시술 ' + (i + 1)), tx, ry + rH * 0.46, '700 30px "Noto Sans KR", sans-serif', INK, 'left');
      _text(ctx, s.desc || '', tx, ry + rH * 0.78, '400 16px "Noto Sans KR", sans-serif', SUB, 'left');
      _text(ctx, s.price || '', rx + rw - dw * 0.025, ry + rH * 0.5, '700 26px "Noto Sans KR", sans-serif', PINK, 'right');
    }
    // 검정 리본 CTA + 하트
    var ctaY = dh * 0.69;
    ctx.save(); ctx.fillStyle = INK; ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
    _rr(ctx, rx, ctaY, rw, dh * 0.05, 8); ctx.fill(); ctx.restore();
    _text(ctx, sv.cta || data.cta || '예약은 프로필 링크 / DM', rx + rw / 2, ctaY + dh * 0.032, '700 25px "Gowun Dodum", sans-serif', '#FFFFFF', 'center');
    _heart(ctx, rx + rw + dw * 0.02, ctaY + dh * 0.025, 14, PINK, null);
    // EVENT 혜택 크라프트 노트(우하단) + 마스킹테이프 + 체크 3
    var nX = dw * 0.55, nY = dh * 0.73, nW = dw * 0.40, nH = dh * 0.205;
    ctx.save(); ctx.fillStyle = KRAFTNOTE; ctx.shadowColor = 'rgba(120,100,70,0.22)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
    _rr(ctx, nX, nY, nW, nH, 6); ctx.fill(); ctx.restore();
    _washiTape(ctx, nX + nW * 0.5, nY - 4, nW * 0.42, 40, -0.04, 'rgba(242,140,170,0.7)', '');
    _text(ctx, sv.benefit_title || 'EVENT 혜택', nX + nW * 0.5, nY + dh * 0.04, '700 30px "Nanum Pen Script", cursive', PINK, 'center');
    var benefits = (sv.benefits && sv.benefits.length) ? sv.benefits : ['시술 시 홈케어 샘플 증정', '리뷰 작성 시 10% 할인', '신규 고객 10% 할인'];
    for (var b = 0; b < Math.min(benefits.length, 3); b++) {
      var byy = nY + dh * 0.075 + b * dh * 0.038;
      _esCheck(ctx, nX + dw * 0.045, byy, 12, PINK);
      _text(ctx, benefits[b], nX + dw * 0.075, byy + 7, '400 19px "Noto Sans KR", sans-serif', '#6A5A45', 'left');
    }
    // 튤립(노트 좌측) + 스마일
    _esTulip(ctx, dw * 0.515, dh * 0.70, 20, '#F49CC0', '#7FA05C');
    _esTulip(ctx, dw * 0.55, dh * 0.71, 17, '#F6B6D0', '#7FA05C');
    ctx.save(); ctx.strokeStyle = PINK2; ctx.fillStyle = PINK2; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    var smx = dw * 0.93, smy = dh * 0.95;
    ctx.beginPath(); ctx.arc(smx, smy, dw * 0.03, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(smx - dw * 0.011, smy - dw * 0.006, 2.4, 0, Math.PI * 2); ctx.arc(smx + dw * 0.011, smy - dw * 0.006, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(smx, smy + dw * 0.004, dw * 0.015, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); ctx.restore();
  }

  // ── 등록(6종 + BP-6 봄 이벤트 = 7종, 모두 좌표 완료 → done=true) ──
  BP._register('bp-price-blackgold', _skBlackGold, true);
  BP._register('bp-ba-nail-polaroid', _skNailPolaroid, true);
  BP._register('bp-ba-nail-pink-polaroid', _skNailPinkPolaroid, true);
  BP._register('bp-ba-skin-acne-pink', _skSkinAcnePink, true);
  BP._register('bp-ba-hair-extension-polaroid', _skHairExtPolaroid, true);
  BP._register('bp-review-lash-blue', _skLashReview, true);
  BP._register('bp-event-spring-mixed', _skEventSpringMixed, true);
})();
