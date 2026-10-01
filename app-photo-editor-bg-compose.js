/* 사진편집/갤러리 공용 — 누끼 배경 합성 + 무료 자동 그림자 */
(function () {
  'use strict';
  if (window.PhotoEditorBgCompose) return;

  const SHADOWS = {
    none:     { label: '그림자 없음', blur: 0,  opacity: 0,    x: 0,  y: 0,  scaleY: 1 },
    soft:     { label: '부드럽게',     blur: 22, opacity: 0.22, x: 0,  y: 26, scaleY: 1 },
    hard:     { label: '또렷하게',     blur: 10, opacity: 0.28, x: 14, y: 18, scaleY: 1 },
    floating: { label: '떠 있는 느낌', blur: 18, opacity: 0.26, x: 0,  y: 44, scaleY: 0.26 },
  };

  function ratioToSize(ratio, srcImg) {
    if (ratio === '4:5') return { w: 1080, h: 1350 };
    if (ratio === '9:16') return { w: 1080, h: 1920 };
    if (ratio === '1:1') return { w: 1080, h: 1080 };
    // 'original'/미지정 — 원본 비율 유지(긴 변 1440 캡). 세로 사진을 정사각으로 욱여넣어 작아 보이던 문제 방지.
    const iw = (srcImg && (srcImg.naturalWidth || srcImg.width)) || 1080;
    const ih = (srcImg && (srcImg.naturalHeight || srcImg.height)) || 1080;
    const LONG = 1440;
    const s = Math.min(1, LONG / Math.max(iw, ih));
    return { w: Math.max(1, Math.round(iw * s)), h: Math.max(1, Math.round(ih * s)) };
  }

  function _blobFromDataUrl(dataUrl) {
    const parts = String(dataUrl).split(',');
    const mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
    const bin = atob(parts[1] || '');
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function _loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function _dataUrlFromAny(srcUrl) {
    if (!srcUrl) throw new Error('이미지 없음');
    if (String(srcUrl).startsWith('data:')) return srcUrl;
    const res = await fetch(srcUrl);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function _drawCover(ctx, img, x, y, w, h) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale, dh = ih * scale;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  function _drawProcedural(ctx, render, w, h) {
    const fill = (g, stops) => { stops.forEach(s => g.addColorStop(s[0], s[1])); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); };
    if (render === 'beige') return fill(ctx.createLinearGradient(0, 0, 0, h), [[0, '#f7eee1'], [1, '#ebdcc4']]);
    if (render === 'pink_radial') return fill(ctx.createRadialGradient(w * 0.5, h * 0.42, w * 0.04, w * 0.5, h * 0.42, Math.max(w, h) * 0.75), [[0, '#fde2e8'], [0.55, '#fbb8c6'], [1, '#D58A95']]);
    if (render === 'black_lux') return fill(ctx.createLinearGradient(0, 0, 0, h), [[0, '#22222a'], [0.6, '#1a1a1f'], [1, '#0f0f13']]);
    fill(ctx.createLinearGradient(0, 0, w, h), [[0, '#f8f6f3'], [0.5, '#ececea'], [1, '#f4f2ef']]);
    ctx.save(); ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      ctx.strokeStyle = `rgba(110,110,118,${0.05 + Math.random() * 0.12})`;
      ctx.lineWidth = (w / 540) * (0.8 + Math.random() * 1.4);
      ctx.beginPath();
      ctx.moveTo(Math.random() * w, Math.random() * h * 0.3);
      ctx.bezierCurveTo(Math.random() * w, h * (0.2 + Math.random() * 0.3), Math.random() * w, h * (0.5 + Math.random() * 0.3), Math.random() * w, h * (0.6 + Math.random() * 0.4));
      ctx.stroke();
    }
    ctx.restore();
  }

  async function _removeBg(srcDataUrl) {
    // [2026-09-30 원영 결정] 휴대폰 누끼 폴백(imgly) 삭제 — 서버 누끼만 쓴다.
    //   ① 두 겹으로 죽어 있었다: 불러오던 `index.umd.js` 가 1.7.0 에 없고, 모델 경로(jsDelivr npm)엔 모델이 없다.
    //   ② 살리면 첫 사용 때 폰이 약 100MB(모델 88MB + 실행엔진)를 받는다.
    //   ③ 늘 실패하면서 서버 오류 문구를 덮었다 — 한도 초과(429)인데 "누끼 모듈을 못 불러왔어요" 가 떴다.
    //   서버가 실패하면 그 문구를 그대로 올린다(작업실 어댑터가 사유별 안내로 바꾼다).
    const fd = new FormData();
    fd.append('file', _blobFromDataUrl(srcDataUrl), 'photo.jpg');
    const res = await apiFetch('/image/remove-bg', { method: 'POST', headers: authHeader(), body: fd });
    // [2026-06-10] 한도 문구에 리셋 시점 + 대안 안내 추가 (이탈 방지)
    if (res.status === 429) throw new Error('오늘 배경제거 한도를 다 썼어요 — 내일 0시에 다시 채워져요. 플랜·구독에서 한도를 늘릴 수도 있어요');
    if (!res.ok) throw new Error('서버 누끼 실패');
    return await res.blob();
  }

  /* [2026-07-26 원영] 인물 재배치(_alphaBBox+_personPlacement, 인물만 오려 97% 확대·중앙정렬) 폐기 —
     "누끼만 땄는데 확대되고 위치가 달라진다"의 원인. 누끼는 배경만 바뀌고 인물은 원본 구도
     그대로여야 한다. 누끼 PNG는 원본과 같은 크기라, 원본을 캔버스에 그리던 것과 같은
     cover 배치로 그리면 위치·크기가 화면에서 1px도 안 달라진다. */
  function _personPlacement(personImg, CW, CH) {
    const iw = personImg.naturalWidth || personImg.width;
    const ih = personImg.naturalHeight || personImg.height;
    const scale = Math.max(CW / iw, CH / ih);   // cover — targetRatio='original'이면 사실상 1:1(무변형)
    return { bbox: null, dx: (CW - iw * scale) / 2, dy: (CH - ih * scale) / 2, dw: iw * scale, dh: ih * scale };
  }

  function _silhouette(personImg, place) {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(place.dw));
    cv.height = Math.max(1, Math.round(place.dh));
    const ctx = cv.getContext('2d');
    ctx.drawImage(personImg, 0, 0, cv.width, cv.height);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cv.width, cv.height);
    return cv;
  }

  function _drawShadow(ctx, personImg, place, shadow) {
    const opt = SHADOWS[(shadow && shadow.mode) || shadow || 'none'] || SHADOWS.none;
    if (!opt.opacity || !opt.blur) return;
    const sil = _silhouette(personImg, place);
    ctx.save();
    ctx.globalAlpha = opt.opacity;
    ctx.filter = `blur(${opt.blur}px)`;
    ctx.translate(place.dx + opt.x, place.dy + opt.y + place.dh * (1 - opt.scaleY) / 2);
    ctx.scale(1, opt.scaleY);
    ctx.drawImage(sil, 0, 0, place.dw, place.dh);
    ctx.restore();
  }

  async function _backgroundCanvas(bg, w, h) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    if (bg.imageData) _drawCover(ctx, await _loadImage(bg.imageData), 0, 0, w, h);
    else if (bg.type === 'procedural' && bg.render) _drawProcedural(ctx, bg.render, w, h);
    else { ctx.fillStyle = bg.color || '#fff'; ctx.fillRect(0, 0, w, h); }
    return cv;
  }

  async function compose(opts) {
    const srcDataUrl = await _dataUrlFromAny(opts.srcUrl);
    let removedUrl = opts.preRemovedBgUrl || null;
    // [v537] 누끼 캐시 가시화 — 배경색/이미지 변경은 캐시된 matte 재사용(API 0회), 첫 1회만 request.
    try { console.log(removedUrl ? '[matting] reuse cached matte (배경만 재합성, API 호출 없음)' : '[matting] request matte (마스크 1회 생성)'); } catch (_e) { void _e; }
    if (!removedUrl) {
      const blob = await _removeBg(srcDataUrl);
      const tmpUrl = URL.createObjectURL(blob);
      const tmpImg = await _loadImage(tmpUrl);
      URL.revokeObjectURL(tmpUrl);
      const cache = document.createElement('canvas');
      cache.width = tmpImg.width; cache.height = tmpImg.height;
      cache.getContext('2d').drawImage(tmpImg, 0, 0);
      removedUrl = cache.toDataURL('image/png');
    }
    const personImg = await _loadImage(removedUrl);
    const size = ratioToSize(opts.targetRatio || '1:1', personImg);
    const bgCanvas = await _backgroundCanvas(opts.bg || {}, size.w, size.h);
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = size.w; finalCanvas.height = size.h;
    const ctx = finalCanvas.getContext('2d');
    ctx.drawImage(bgCanvas, 0, 0);
    const place = _personPlacement(personImg, size.w, size.h);   // [2026-07-26 원영] 원본 구도 그대로(cover) — 확대·재배치 없음
    _drawShadow(ctx, personImg, place, opts.shadow);
    ctx.drawImage(personImg, place.dx, place.dy, place.dw, place.dh);
    /* [#11 2026-07-17] 합성본과 '같은 좌표계'의 사람 마스크도 같이 낸다.
       removedBgDataUrl(누끼 PNG)은 personImg 자기 좌표계라 여기서 place.dx/dy/dw/dh 로 배치·크롭된
       합성본과 안 맞는다 → 그걸로 마스킹하면 엉뚱한 데가 오려진다. 그래서 배치를 똑같이 재현한
       마스크를 만들어 둔다. 편집기가 '배경엔 보정 안 걸기'에 쓴다(renderer._keepBgUnadjusted).
       그림자는 일부러 뺀다 — 그림자는 배경 쪽이라 보정에서 제외되는 게 맞다. */
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = size.w; maskCanvas.height = size.h;
    const mctx = maskCanvas.getContext('2d');
    mctx.drawImage(personImg, place.dx, place.dy, place.dw, place.dh);
    return {
      composedDataUrl: finalCanvas.toDataURL('image/jpeg', 0.9),
      removedBgDataUrl: removedUrl,
      personMaskDataUrl: maskCanvas.toDataURL('image/png'),   // 합성본 정렬 알파(사람=불투명)
    };
  }

  window.PhotoEditorBgCompose = { compose, ratioToSize, shadows: SHADOWS };
})();
