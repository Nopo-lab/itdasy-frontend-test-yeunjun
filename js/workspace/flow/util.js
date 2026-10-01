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
  window.WSFlowUtil = {
    uid: uid, toast: toast, esc: esc, fileToDataUrl: fileToDataUrl,
    _isRealShopName: _isRealShopName, _thEsc: _thEsc, barClass: barClass, _caret: _caret,
    _purposeCat: _purposeCat, _containBlit: _containBlit, clone: clone, _parseHashes: _parseHashes,
    filterCss: filterCss, _extractPalette: _extractPalette, refreshCarouselImage: refreshCarouselImage
  };
})();
