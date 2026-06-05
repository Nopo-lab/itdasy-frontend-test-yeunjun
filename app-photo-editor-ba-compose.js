/* 사진 편집기 — Canva식 Before/After 합성 */
(function () {
  'use strict';
  if (window.PhotoEditorBACompose) return;

  // [TPL-1 fix] rounded-rect path 헬퍼 — _roundedPhoto/_pill 등이 호출하나 정의 누락(Reference1Error)으로
  //   cream/polaroid 계열 BA 템플릿(_flowerShadow/_polaroid)이 적용·썸네일 모두 실패하던 기존 버그 복구.
  //   path 만 그림(clip/stroke 는 호출측). ctx.roundRect 있으면 사용, 없으면 arcTo 폴백.
  function _rr(ctx, x, y, w, h, r) {
    const rad = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') { ctx.roundRect(x, y, w, h, rad); return; }
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  // [UX-BA-2] 시술 전 사진(secondImg) 없으면 true → before 슬롯을 가짜 흑백 대신 placeholder 로.
  //   draw() 진입마다 갱신. 썸네일(null state)·미리보기·실제 적용 모두 동일 정책.
  let _hasBefore = false;

  const LABELS = {
    'ba-flower-shadow': ['Before', 'After'],
    'ba-polaroid': ['Before', 'After'],
    'ba-editorial': ['Before', 'After'],
    'ba-2split-h': ['BEFORE', 'AFTER'],
    'ba-2split-v': ['BEFORE', 'AFTER'],
    'ba-3process': ['BEFORE', 'PROCESS', 'AFTER'],
    'ba-4grid': ['DETAIL', 'STYLE', 'BEFORE', 'AFTER'],
    'ba-price': ['BEFORE', 'AFTER'],
    'ba-event': ['BEFORE', 'AFTER'],
    'ba-review': ['BEFORE', 'AFTER'],
  };

  function draw(ctx, w, h, state, tpl, data) {
    _hasBefore = !!(state && state.secondImg);   // [UX-BA-2] 시술 전 사진 유무
    const after = _copyCanvas(ctx.canvas);
    const before = _hasBefore ? state.secondImg : after;
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = _bg(tpl);
    ctx.fillRect(0, 0, w, h);
    _layout(ctx, w, h, before, after, tpl && tpl.id, data || {});
    ctx.restore();
  }

  function _copyCanvas(canvas) {
    const out = document.createElement('canvas');
    out.width = canvas.width; out.height = canvas.height;
    out.getContext('2d').drawImage(canvas, 0, 0);
    return out;
  }

  function _layout(ctx, w, h, before, after, id, data) {
    if (id === 'ba-flower-shadow') return _flowerShadow(ctx, w, h, before, after, data);
    if (id === 'ba-polaroid') return _polaroid(ctx, w, h, before, after, data);
    if (id === 'ba-editorial') return _editorial(ctx, w, h, before, after, data);
    if (id === 'ba-2split-v' || id === 'ba-event') return _vertical(ctx, w, h, before, after, id, data);
    if (id === 'ba-3process') return _process(ctx, w, h, before, after, data);
    if (id === 'ba-4grid') return _grid(ctx, w, h, before, after, data);
    // v326 BA 12종 시리즈 — 스타일 suffix 로 기존 함수 라우팅
    if (typeof id === 'string' && /^ba-(hair|nail|lash|skin)-/.test(id)) {
      if (/-cream$/.test(id))    return _flowerShadow(ctx, w, h, before, after, data);
      if (/-polaroid$/.test(id)) return _polaroid(ctx, w, h, before, after, data);
      // -dark 등 그 외는 기본 horizontal (다크 배경은 _bg() 에서 처리)
    }
    _horizontal(ctx, w, h, before, after, id, data);
  }

  function _horizontal(ctx, w, h, before, after, id, data) {
    const pad = w * 0.08, gap = w * 0.035, top = h * 0.16;
    const boxW = (w - pad * 2 - gap) / 2, boxH = h * 0.56;
    _title(ctx, w, h, data, id);
    _photo(ctx, before, pad, top, boxW, boxH, true);
    _photo(ctx, after, pad + boxW + gap, top, boxW, boxH, false);
    _labels(ctx, [[pad, top, boxW], [pad + boxW + gap, top, boxW]], h, LABELS[id] || LABELS['ba-2split-h']);
    if (id === 'ba-price') _priceRows(ctx, w, h, data);
    else if (id === 'ba-review') _review(ctx, w, h, data);
    else _footer(ctx, w, h, data);
  }

  function _flowerShadow(ctx, w, h, before, after, data) {
    _softBotanical(ctx, w, h);
    ctx.fillStyle = '#141414';
    ctx.textAlign = 'center';
    ctx.font = `400 ${Math.round(h * 0.052)}px Georgia, "Times New Roman", serif`;
    ctx.fillText(data.head || 'Before & After', w / 2, h * 0.1);
    ctx.font = `400 ${Math.round(h * 0.025)}px "Noto Serif KR", serif`;
    ctx.fillText(data.sub || '시술 전후 모습을 확인해 보세요!', w / 2, h * 0.145);
    ctx.strokeStyle = '#151515';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(w * 0.1, h * 0.21); ctx.lineTo(w * 0.9, h * 0.21); ctx.stroke();
    const pad = w * 0.1, gap = w * 0.045, top = h * 0.29;
    const boxW = (w - pad * 2 - gap) / 2, boxH = h * 0.44;
    _roundedPhoto(ctx, before, pad, top, boxW, boxH, 22, true, true);
    _roundedPhoto(ctx, after, pad + boxW + gap, top, boxW, boxH, 22, false, true);
    _scriptLabel(ctx, pad + boxW / 2, h * 0.79, 'Before', '전');
    _scriptLabel(ctx, pad + boxW + gap + boxW / 2, h * 0.79, 'After', '후');
    _smallBrand(ctx, w, h, data, '#171717');
  }

  function _polaroid(ctx, w, h, before, after, data) {
    ctx.fillStyle = '#eee9e2'; ctx.fillRect(0, 0, w, h);
    _softShadow(ctx, w * 0.52, h * 0.03, w * 0.42, h * 0.12);
    ctx.fillStyle = '#5f4a3e';
    ctx.textAlign = 'center';
    ctx.font = `400 ${Math.round(h * 0.072)}px Georgia, "Times New Roman", serif`;
    ctx.fillText(data.head || 'Before & After', w / 2, h * 0.19);
    const pad = w * 0.055, gap = w * 0.02, top = h * 0.29;
    const boxW = (w - pad * 2 - gap) / 2, boxH = h * 0.5;
    _polaroidPhoto(ctx, before, pad, top, boxW, boxH, 'Before', '시술전', true);
    _polaroidPhoto(ctx, after, pad + boxW + gap, top, boxW, boxH, 'After', '시술후', false);
    _searchPill(ctx, w, h, data.shop || '@itdasy');
  }

  function _editorial(ctx, w, h, before, after, data) {
    ctx.fillStyle = '#f6f1e9'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d9c8b3'; ctx.fillRect(0, h * 0.82, w, h * 0.18);
    ctx.fillStyle = '#3a2d27';
    ctx.textAlign = 'center';
    ctx.font = `700 ${Math.round(h * 0.018)}px "Noto Sans KR", sans-serif`;
    ctx.fillText('@' + String(data.shop || 'itdasy').replace(/^@/, ''), w / 2, h * 0.09);
    ctx.font = `400 ${Math.round(h * 0.065)}px Georgia, "Times New Roman", serif`;
    ctx.fillText(data.head || 'Before & After', w / 2, h * 0.19);
    const pad = w * 0.08, gap = w * 0.035, top = h * 0.29;
    const boxW = (w - pad * 2 - gap) / 2, boxH = h * 0.46;
    _framedPhoto(ctx, before, pad, top, boxW, boxH, true);
    _framedPhoto(ctx, after, pad + boxW + gap, top, boxW, boxH, false);
    _searchPill(ctx, w, h, '@' + String(data.shop || 'itdasy').replace(/^@/, '').toUpperCase());
    ctx.fillStyle = '#fff';
    ctx.font = `600 ${Math.round(h * 0.032)}px Georgia, "Times New Roman", serif`;
    ctx.fillText(data.shop || 'Itdasy beauty salon', w / 2, h * 0.9);
  }

  function _vertical(ctx, w, h, before, after, id, data) {
    const pad = w * 0.08, gap = h * 0.022, top = h * 0.12;
    const boxH = (h * 0.68 - gap) / 2;
    _title(ctx, w, h, data, id);
    _photo(ctx, before, pad, top, w - pad * 2, boxH, true);
    _photo(ctx, after, pad, top + boxH + gap, w - pad * 2, boxH, false);
    _labels(ctx, [[pad, top, w - pad * 2], [pad, top + boxH + gap, w - pad * 2]], h, LABELS[id]);
    if (id === 'ba-event') _eventBand(ctx, w, h, data);
    else _footer(ctx, w, h, data);
  }

  function _process(ctx, w, h, before, after, data) {
    const pad = w * 0.07, gap = w * 0.025, y = h * 0.22;
    const boxW = (w - pad * 2 - gap * 2) / 3, boxH = h * 0.46;
    _title(ctx, w, h, data, 'ba-3process');
    _photo(ctx, before, pad, y, boxW, boxH, true);
    _photo(ctx, after, pad + boxW + gap, y, boxW, boxH, false, 0.75);
    _photo(ctx, after, pad + (boxW + gap) * 2, y, boxW, boxH, false);
    _labels(ctx, [[pad, y, boxW], [pad + boxW + gap, y, boxW], [pad + (boxW + gap) * 2, y, boxW]], h, LABELS['ba-3process']);
    _footer(ctx, w, h, data);
  }

  function _grid(ctx, w, h, before, after, data) {
    const pad = w * 0.08, gap = w * 0.03, y = h * 0.16;
    const box = (w - pad * 2 - gap) / 2;
    _title(ctx, w, h, data, 'ba-4grid');
    [[after, 0, 0], [after, 1, 0], [before, 0, 1], [after, 1, 1]].forEach((item, idx) => {
      const x = pad + item[1] * (box + gap), yy = y + item[2] * (box + gap);
      _photo(ctx, item[0], x, yy, box, box, idx === 2);
    });
    _footer(ctx, w, h, data);
  }

  // [UX-BA-2] 시술 전 사진 없을 때 before 슬롯 placeholder (가짜 흑백 금지).
  //   점선 박스 + 카메라(+) + 안내문구. 썸네일처럼 작으면 텍스트 생략.
  function _beforePlaceholder(ctx, x, y, w, h, rounded) {
    ctx.save();
    if (rounded) _rr(ctx, x, y, w, h, Math.min(22, w * 0.08));
    else { ctx.beginPath(); ctx.rect(x, y, w, h); }
    ctx.fillStyle = 'rgba(0,0,0,0.045)';
    ctx.fill();
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = Math.max(2, w * 0.012);
    ctx.strokeStyle = 'rgba(90,78,64,0.55)';
    ctx.stroke();
    ctx.setLineDash([]);
    const cx = x + w / 2, cy = y + h * 0.42, r = Math.min(w, h) * 0.11;
    ctx.strokeStyle = 'rgba(90,78,64,0.62)';
    ctx.lineWidth = Math.max(2, w * 0.014);
    ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
    if (w >= 140) {                                   // 썸네일/소형은 텍스트 생략(가독 불가)
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(74,62,48,0.9)';
      ctx.font = `700 ${Math.round(Math.min(w, h) * 0.092)}px "Noto Sans KR", sans-serif`;
      ctx.fillText('시술 전 사진 추가', cx, cy + h * 0.2);
      ctx.fillStyle = 'rgba(120,108,92,0.85)';
      ctx.font = `400 ${Math.round(Math.min(w, h) * 0.062)}px "Noto Sans KR", sans-serif`;
      ctx.fillText('추가하면 전후 비교가', cx, cy + h * 0.31);
      ctx.fillText('완성돼요', cx, cy + h * 0.39);
    }
    ctx.restore();
  }

  function _photo(ctx, img, x, y, w, h, before, alpha) {
    if (before && !_hasBefore) { _beforePlaceholder(ctx, x, y, w, h, false); return; }   // [UX-BA-2]
    ctx.save();
    ctx.globalAlpha = alpha || 1;
    ctx.filter = before ? 'brightness(92%) grayscale(15%)' : 'saturate(108%) brightness(103%)';
    _cover(ctx, img, x, y, w, h);
    ctx.filter = 'none';
    ctx.strokeStyle = 'rgba(255,255,255,0.86)';
    ctx.lineWidth = Math.max(2, w * 0.012);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  function _roundedPhoto(ctx, img, x, y, w, h, r, before, dashed) {
    if (before && !_hasBefore) { _beforePlaceholder(ctx, x, y, w, h, true); return; }   // [UX-BA-2]
    ctx.save();
    _rr(ctx, x, y, w, h, r);
    ctx.clip();
    ctx.filter = before ? 'brightness(94%) saturate(90%)' : 'brightness(104%) saturate(108%) contrast(104%)';
    _cover(ctx, img, x, y, w, h);
    ctx.restore();
    ctx.save();
    _rr(ctx, x, y, w, h, r);
    ctx.strokeStyle = dashed ? 'rgba(20,20,20,0.8)' : 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(2, w * 0.008);
    if (dashed) ctx.setLineDash([10, 6]);
    ctx.stroke();
    ctx.restore();
  }

  function _polaroidPhoto(ctx, img, x, y, w, h, label, kor, before) {
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,0.12)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    _photo(ctx, img, x + w * 0.045, y + w * 0.045, w * 0.91, h * 0.76, before);
    ctx.fillStyle = '#5f4a3e';
    ctx.font = `400 ${Math.round(h * 0.052)}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = 'left';
    ctx.fillText(label, x + w * 0.09, y + h * 0.92);
    ctx.font = `500 ${Math.round(h * 0.038)}px "Noto Serif KR", serif`;
    ctx.textAlign = 'right';
    ctx.fillText(kor, x + w * 0.91, y + h * 0.92);
  }

  function _framedPhoto(ctx, img, x, y, w, h, before) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, w, h);
    if (before && !_hasBefore) _beforePlaceholder(ctx, x + w * 0.045, y + w * 0.045, w * 0.91, h * 0.78, false);   // [UX-BA-2]
    else _cover(ctx, img, x + w * 0.045, y + w * 0.045, w * 0.91, h * 0.78);
    ctx.fillStyle = '#5f4a3e';
    ctx.font = `400 ${Math.round(h * 0.05)}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = 'left';
    ctx.fillText(before ? 'Before' : 'After', x + w * 0.08, y + h * 0.92);
    ctx.font = `500 ${Math.round(h * 0.035)}px "Noto Serif KR", serif`;
    ctx.textAlign = 'right';
    ctx.fillText(before ? '시술전' : '시술후', x + w * 0.92, y + h * 0.92);
  }

  function _scriptLabel(ctx, x, y, en, ko) {
    ctx.fillStyle = '#202020';
    ctx.textAlign = 'center';
    ctx.font = `400 42px "Brush Script MT", "Segoe Script", cursive`;
    ctx.fillText(en, x, y);
    ctx.font = '400 28px "Noto Serif KR", serif';
    ctx.fillText(ko, x, y + 42);
  }

  function _smallBrand(ctx, w, h, data, color) {
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.font = `600 ${Math.round(h * 0.02)}px "Noto Sans KR", sans-serif`;
    ctx.fillText(String(data.shop || 'REALLYGREATSITE.COM').toUpperCase(), w / 2, h * 0.94);
  }

  function _softBotanical(ctx, w, h) {
    ctx.fillStyle = '#e7e5de';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#6e756c';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(w * (0.78 + i * 0.03), h * (0.3 + i * 0.09), w * 0.04, h * 0.16, -0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    _softShadow(ctx, w * 0.08, h * 0.76, w * 0.35, h * 0.1);
  }

  function _softShadow(ctx, x, y, w, h) {
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#151515';
    ctx.filter = 'blur(18px)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function _searchPill(ctx, w, h, label) {
    const x = w * 0.32, y = h * 0.8, pw = w * 0.36, ph = h * 0.052;
    ctx.save();
    ctx.fillStyle = '#fff';
    _rr(ctx, x, y, pw, ph, ph / 2);
    ctx.fill();
    ctx.fillStyle = '#6b5a50';
    ctx.font = `700 ${Math.round(ph * 0.34)}px "Noto Sans KR", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + pw / 2, y + ph / 2);
    ctx.restore();
  }

  function _cover(ctx, img, x, y, w, h) {
    const iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight;
    const ar = w / h, iar = iw / ih;
    const sw = iar > ar ? ih * ar : iw, sh = iar > ar ? ih : iw / ar;
    ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
  }

  function _title(ctx, w, h, data, id) {
    ctx.fillStyle = id === 'ba-event' ? '#fff' : '#17181d';
    ctx.textAlign = 'center';
    ctx.font = `800 ${Math.round(h * 0.042)}px "Noto Serif KR", serif`;
    ctx.fillText(data.head || 'Before & After', w / 2, h * 0.09);
  }

  function _labels(ctx, boxes, h, labels) {
    boxes.forEach((box, i) => {
      ctx.fillStyle = i === boxes.length - 1 ? '#D58A95' : '#111217';
      ctx.fillRect(box[0] + 10, box[1] + 10, Math.min(box[2] * 0.45, 126), h * 0.036);
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${Math.round(h * 0.017)}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(labels[i] || '', box[0] + 18, box[1] + h * 0.034);
    });
  }

  function _footer(ctx, w, h, data) {
    ctx.fillStyle = '#555';
    ctx.font = `600 ${Math.round(h * 0.018)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(data.shop || '잇데이 스튜디오', w / 2, h * 0.88);
  }

  function _priceRows(ctx, w, h, data) {
    ctx.fillStyle = 'rgba(17,18,23,0.08)';
    ctx.fillRect(w * 0.14, h * 0.78, w * 0.72, h * 0.08);
    ctx.fillStyle = '#111217';
    ctx.font = `800 ${Math.round(h * 0.024)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(data.price || '가격 문의', w / 2, h * 0.83);
  }

  function _review(ctx, w, h, data) {
    ctx.fillStyle = '#111217';
    ctx.font = `700 ${Math.round(h * 0.022)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(data.review || '실제로 달라진 결과를 확인해보세요', w / 2, h * 0.82);
  }

  function _eventBand(ctx, w, h, data) {
    ctx.fillStyle = '#D58A95';
    ctx.fillRect(w * 0.12, h * 0.84, w * 0.76, h * 0.06);
    ctx.fillStyle = '#fff';
    ctx.font = `900 ${Math.round(h * 0.025)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(data.sub || '이번 주 예약 가능', w / 2, h * 0.88);
  }

  function _bg(tpl) {
    if (tpl && tpl.id === 'ba-flower-shadow') return '#e7e5de';
    if (tpl && tpl.id === 'ba-polaroid') return '#eee9e2';
    if (tpl && tpl.id === 'ba-editorial') return '#f6f1e9';
    if (tpl && tpl.id === 'ba-dark') return '#24252B';
    if (tpl && tpl.id === 'ba-sage') return '#E5EADF';
    // v326 BA 12종 시리즈 배경 (스타일 suffix 별)
    if (tpl && tpl.id) {
      if (/-cream$/.test(tpl.id))    return '#e7e5de';
      if (/-polaroid$/.test(tpl.id)) return '#eee9e2';
      if (/-dark$/.test(tpl.id))     return '#24252B';
    }
    return '#FFFAF2';
  }

  window.PhotoEditorBACompose = { draw };
})();
