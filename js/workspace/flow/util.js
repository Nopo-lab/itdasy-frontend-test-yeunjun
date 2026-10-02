/* workspace/flow/util.js — flow.js 순수 헬퍼 분리 (T-104 P0, 2026-07-10)
   상태(d/cur/el/navStack) 안 건드리는 무상태 함수만 모음. flow.js 는 window.WSFlowUtil 을
   로컬 별칭으로 재수입(var esc = WSU.esc …)해서 호출부는 한 글자도 안 바뀐다.
   ⚠️ 여기 함수는 flow.js 클로저 상태를 참조하면 안 됨(순수 유지). */
(function () {
  'use strict';
  function uid() { return (typeof window._uid === 'function') ? window._uid() : 'wf_' + Math.random().toString(36).slice(2); }
  function toast(m) { if (window.showToast) window.showToast(m); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fileToDataUrl(f) {
    if (typeof window._fileToDataUrl === 'function') return window._fileToDataUrl(f);
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsDataURL(f); });
  }
  function _isRealShopName(n) {
    n = String(n || '').trim();
    if (n.length < 2) return false;
    if (/(뷰티샵|헤어샵|네일샵|왁싱샵|미용실|살롱|스튜디오|에스테틱|샵|점)$/.test(n)) return true;   // 명확한 상호 접미사
    if (/[가-힣]{2,}/.test(n)) return true;   // 한글 2자 이상 = 상호로 간주
    return false;   // 'Dd'·'aa' 등 라틴 짧은 placeholder → 상호 아님
  }
  function _thEsc(s) { return String(s || '').replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function barClass(vc) {
    if (vc >= 10) return 'b3';
    if (vc >= 3) return 'b2';
    return 'b1';
  }
  function _caret(open) { return '<svg class="ed-fold__caret" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#ic-chevron-' + (open ? 'up' : 'down') + '"/></svg>'; }
  function _purposeCat(purpose) { return { before_after: 'ba', review: 'review', event: 'event', feed: 'flex', story: 'flex' }[purpose] || 'flex'; }
  function _containBlit(ctx, srcCanvas, dw, dh) {
    var iw = srcCanvas.width, ih = srcCanvas.height; if (!iw || !ih) return;
    var s = Math.min(dw / iw, dh / ih), rw = iw * s, rh = ih * s;
    var dx = (dw - rw) / 2, dy = (dh - rh) / 2;
    ctx.drawImage(srcCanvas, 0, 0, iw, ih, dx, dy, rw, rh);
  }
  function clone(o) { return JSON.parse(JSON.stringify(o || {})); }
  function _parseHashes(text) {
    var seen = Object.create(null), out = [];
    String(text || '').split(/[\s,]+/).forEach(function (t) {
      var tag = t.trim().replace(/^#+/, ''); if (!tag) return;
      var k = tag.toLowerCase(); if (seen[k]) return; seen[k] = 1; out.push('#' + tag);
    });
    return out;
  }
  // 보정 슬라이더값 → CSS filter 문자열(라이브 미리보기). 밝기/대비/채도/선명도/색감.
  function filterCss(a) {
    a = a || {};
    var bright = Math.max(0, 1 + (a.brightness || 0) * 0.6 / 100);
    var contr = Math.max(0, 1 + (a.contrast || 0) / 100);
    var sat = Math.max(0, 1 + (a.saturation || 0) * 0.8 / 100);
    var shp = a.sharpness || 0;
    var contrSharp = shp > 0 ? (contr + shp * 0.2 / 100) : contr;
    var soft = shp < 0 ? (Math.min(100, -shp) * 0.012) : 0;   // 0~1.2px
    var color = a.color || 0;
    var sepia = color > 0 ? Math.min(0.55, color * 0.5 / 100) : 0;   // 웜
    var coolHue = color < 0 ? color * 0.35 : 0;                       // 쿨(파랑 쪽)
    var f = 'brightness(' + bright.toFixed(3) + ') contrast(' + contrSharp.toFixed(3) + ') saturate(' + sat.toFixed(3) + ')';
    if (sepia > 0) f += ' sepia(' + sepia.toFixed(3) + ')';
    f += ' hue-rotate(' + coolHue.toFixed(1) + 'deg)';
    if (soft > 0) f += ' blur(' + soft.toFixed(2) + 'px)';
    return f;
  }
  // 이미지 URL → 대표색 팔레트(상위 6색, 흰/검 근사 제외). cb(hexArray).
  function _extractPalette(url, cb) {
    try {
      var img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          var n = 28, c = document.createElement('canvas'); c.width = n; c.height = n;
          var g = c.getContext('2d'); g.drawImage(img, 0, 0, n, n);
          var data = g.getImageData(0, 0, n, n).data, buckets = {};
          for (var i = 0; i < data.length; i += 4) {
            var r = data[i], gg = data[i + 1], b = data[i + 2], a = data[i + 3];
            if (a < 128) continue;
            var mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
            if (mx > 240 && mn > 228) continue;   // 근사 흰색 제외
            if (mx < 26) continue;                 // 근사 검정 제외
            var key = (r >> 5) + ',' + (gg >> 5) + ',' + (b >> 5);
            var k = buckets[key] || (buckets[key] = { n: 0, r: 0, g: 0, b: 0 });
            k.n++; k.r += r; k.g += gg; k.b += b;
          }
          var arr = Object.keys(buckets).map(function (key) { var k = buckets[key]; return { n: k.n, r: Math.round(k.r / k.n), g: Math.round(k.g / k.n), b: Math.round(k.b / k.n) }; });
          arr.sort(function (x, y) { return y.n - x.n; });
          cb(arr.slice(0, 6).map(function (k) { return '#' + [k.r, k.g, k.b].map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join(''); }));
        } catch (_e) { cb([]); }
      };
      img.onerror = function () { cb([]); };
      img.src = url;
    } catch (_e) { cb([]); }
  }
  // Update only the finished photo; preserve caption focus, selection and IME composition.
  function refreshCarouselImage(root, photoId, displayUrl) {
    if (!root || !root.classList.contains('is-open')) return;
    root.querySelectorAll('[data-fl-carslide]').forEach(function (slide) {
      if (slide.getAttribute('data-fl-carslide') !== String(photoId)) return;
      var image = slide.querySelector('.ig-car__img, .cap-car__img');
      if (image) image.style.backgroundImage = 'url("' + displayUrl + '")';
    });
  }
  /* [2026-10-01 flow-workspace-photo-07] 작업실 사진 투입용 축소 — createImageBitmap + close().
     왜: 공용 _resizeIfNeeded(app-gallery-utils.js)는 `new Image()` + objectURL 로 원본(4000×6000)을 디코드한다.
       브라우저는 <img> 로 디코드한 비트맵을 URL 을 revoke 해도 **이미지 캐시에 그대로 남긴다** — 메모리 압박 신호가 올 때까지.
       실측(exp-decode.log, 헤드리스 크로미움 renderer RSS): 큰 사진 5장 → +121MB, 10장 → +239MB (장당 ~24MB 영구 잔류).
       createImageBitmap 은 캐시를 거치지 않고, close() 로 디코드 메모리를 **그 자리에서** 돌려준다: 5장 +3MB, 10장 +3MB.
       작업실 "5장 투입 → 합성 → 닫기" 반복에서 라운드마다 ~100MB 가 남던 것(diag-5big)의 주원인.
     규칙은 _resizeIfNeeded 와 같다: HEIC 는 기존 경로(변환 라이브러리)로, 긴 변 ≤ maxDim 이고 2MB 미만이면 원본 그대로,
       아니면 maxDim 으로 축소한 JPEG(0.85). EXIF 회전은 imageOrientation:'from-image' (크로미움 실측: <img> 와 같은 2000×3000).
       [flow-workspace-photo-10] BMP·TIFF 등 서버가 받지 않는 포맷(BE: '지원하지 않는 포맷: BMP')은 크기와 무관하게 JPEG 로 다시 굽는다 —
       예전엔 1.4MB BMP 원본이 base64 그대로 IDB 에 저장되고 업로드에서 400 이 났다.
     createImageBitmap 이 없거나(구형 웹뷰) 실패하면(손상·초대형) 기존 _resizeIfNeeded 로 떨어진다 — 동작 회귀 0. */
  var _INTAKE_REENCODE = /^image\/(bmp|x-ms-bmp|x-bmp|tiff|x-icon|vnd\.microsoft\.icon)$/i;
  function resizeForIntake(file, maxDim) {
    maxDim = maxDim || 1920;
    function legacy() {
      try { return (typeof window._resizeIfNeeded === 'function') ? Promise.resolve(window._resizeIfNeeded(file, maxDim)) : Promise.resolve(file); }
      catch (_e) { return Promise.resolve(file); }
    }
    try {
      if (!file || typeof createImageBitmap !== 'function' || typeof file.size !== 'number') return legacy();
      if (window.HeicConvert && window.HeicConvert.isHeic && window.HeicConvert.isHeic(file)) return legacy();   // HEIC 변환은 기존 경로
    } catch (_e0) { return legacy(); }
    var reencode = _INTAKE_REENCODE.test(String(file.type || ''));
    var opened = null;
    return Promise.resolve()
      .then(function () { return createImageBitmap(file, { imageOrientation: 'from-image' }); })
      .catch(function () { return createImageBitmap(file); })   // 옵션을 모르는 구형 브라우저
      .then(function (bmp) {
        opened = bmp;
        var w = bmp.width, h = bmp.height, longSide = Math.max(w, h);
        if (!(w > 0 && h > 0)) throw new Error('empty bitmap');
        if (longSide <= maxDim && file.size < 2 * 1024 * 1024 && !reencode) { bmp.close(); opened = null; return file; }
        var sc = Math.min(1, maxDim / longSide);
        var cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(w * sc)); cv.height = Math.max(1, Math.round(h * sc));
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);   // JPEG 는 알파가 없다 — 투명을 검정이 아니라 흰색으로
        ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
        bmp.close(); opened = null;   // 디코드 메모리 즉시 반환 — 이 함수의 존재 이유
        return new Promise(function (res) {
          var done = false;
          function finish(blob) {
            if (done) return; done = true;
            try { cv.width = 1; cv.height = 1; } catch (_c) { void _c; }   // 캔버스 백킹도 바로 비운다
            res(blob ? new File([blob], file.name || 'photo.jpg', { type: 'image/jpeg' }) : file);
          }
          try { cv.toBlob(function (b) { finish(b); }, 'image/jpeg', 0.85); } catch (_e) { finish(null); }
          setTimeout(function () { finish(null); }, 15000);   // 최후 안전망(_resizeIfNeeded 와 같은 15초)
        });
      })
      .catch(function () { try { if (opened) opened.close(); } catch (_c2) { void _c2; } return legacy(); });
  }
  window.WSFlowUtil = {
    uid: uid, toast: toast, esc: esc, fileToDataUrl: fileToDataUrl, resizeForIntake: resizeForIntake,
    _isRealShopName: _isRealShopName, _thEsc: _thEsc, barClass: barClass, _caret: _caret,
    _purposeCat: _purposeCat, _containBlit: _containBlit, clone: clone, _parseHashes: _parseHashes,
    filterCss: filterCss, _extractPalette: _extractPalette, refreshCarouselImage: refreshCarouselImage
  };
})();
