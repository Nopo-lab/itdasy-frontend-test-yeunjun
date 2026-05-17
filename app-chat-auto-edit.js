/* 챗봇 자동 보정 헬퍼 — 2026-05-18
   - PhotoEditor UI 를 거치지 않고 canvas headless 합성 → dataURL 반환.
   - 챗봇이 "사진 + 보정해줘" 입력 받았을 때 결과를 챗 안에 직접 표시하기 위함.
   - 외부 의존(있으면 활용, 없으면 폴백):
       window.PhotoEnhance.getShopPreset(shopType) → { label, adjust, beauty }
       window.BrandKit.get() → { shop_name, instagram_handle, ... }
   - HSV 마스킹 픽셀 walk 핵심 효과만 인라인 복제 (app-photo-editor-beauty.js 참고).
*/
(function () {
  'use strict';

  // ── 유틸 ──
  function _clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

  function _loadImage(src) {
    return new Promise(function (resolve, reject) {
      if (!src) { reject(new Error('이미지 로드 실패')); return; }
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('이미지 로드 실패')); };
      img.src = src;
    });
  }

  function _revoke(src) {
    if (typeof src === 'string' && src.indexOf('blob:') === 0) {
      try { URL.revokeObjectURL(src); } catch (_e) { void _e; }
    }
  }

  // ── crop (PhotoEditor _computeCrop 동일 로직) ──
  function _computeCrop(img, ratio) {
    var iw = img.naturalWidth || img.width;
    var ih = img.naturalHeight || img.height;
    if (!ratio || ratio === 'original') {
      var maxW = Math.min(1080, iw), k = maxW / iw;
      return { sx: 0, sy: 0, sw: iw, sh: ih, dw: Math.round(iw * k), dh: Math.round(ih * k) };
    }
    var parts = String(ratio).split(':').map(Number);
    var rw = parts[0], rh = parts[1];
    if (!rw || !rh) return _computeCrop(img, 'original');
    var targetAR = rw / rh, imgAR = iw / ih;
    var sw, sh, sx, sy;
    if (imgAR > targetAR) { sh = ih; sw = Math.round(ih * targetAR); sx = Math.round((iw - sw) / 2); sy = 0; }
    else                  { sw = iw; sh = Math.round(iw / targetAR); sx = 0; sy = Math.round((ih - sh) / 2); }
    var outW = Math.min(1080, sw), outH = Math.round(outW / targetAR);
    return { sx: sx, sy: sy, sw: sw, sh: sh, dw: outW, dh: outH };
  }

  // ── unsharp mask (선명도) ──
  function _boxBlur(img, w, h, r) {
    var out = new ImageData(w, h);
    var d = img.data, o = out.data;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var rSum = 0, gSum = 0, bSum = 0, n = 0;
        for (var kx = -r; kx <= r; kx++) {
          var xx = Math.min(w - 1, Math.max(0, x + kx));
          var p2 = (y * w + xx) * 4;
          rSum += d[p2]; gSum += d[p2 + 1]; bSum += d[p2 + 2]; n++;
        }
        var p = (y * w + x) * 4;
        o[p] = rSum / n; o[p + 1] = gSum / n; o[p + 2] = bSum / n; o[p + 3] = d[p + 3];
      }
    }
    return out;
  }
  function _unsharpMask(ctx, w, h, strength) {
    try {
      var src = ctx.getImageData(0, 0, w, h);
      var blur = _boxBlur(src, w, h, 1);
      var out = ctx.createImageData(w, h);
      var k = 1 + strength * 1.2;
      for (var i = 0; i < src.data.length; i += 4) {
        out.data[i]     = _clamp(src.data[i]     + (src.data[i]     - blur.data[i])     * (k - 1));
        out.data[i + 1] = _clamp(src.data[i + 1] + (src.data[i + 1] - blur.data[i + 1]) * (k - 1));
        out.data[i + 2] = _clamp(src.data[i + 2] + (src.data[i + 2] - blur.data[i + 2]) * (k - 1));
        out.data[i + 3] = src.data[i + 3];
      }
      ctx.putImageData(out, 0, 0);
    } catch (_e) { /* CORS·메모리 부족 시 skip */ }
  }

  // ── beauty 픽셀 walk (핵심 효과만: skin / redness / hairShine / nailGloss / handSkin) ──
  function _applyBeauty(ctx, w, h, b) {
    if (!b) return;
    var skinK   = (b.skin     || 0) / 100;
    var redK    = (b.redness  || 0) / 100;
    var hairK   = (b.hairShine|| 0) / 100;
    var nailK   = (b.nailGloss|| 0) / 100;
    var handK   = (b.handSkin || 0) / 100;
    if (!skinK && !redK && !hairK && !nailK && !handK) return;

    var data;
    try { data = ctx.getImageData(0, 0, w, h); }
    catch (_e) { return; /* CORS 시 graceful skip */ }
    var d = data.data;

    for (var i = 0; i < d.length; i += 4) {
      var r = d[i], g = d[i + 1], bl = d[i + 2];
      var isSkin    = r > 80 && r > g && g > bl && (r - bl) > 15 && (r - bl) < 110;
      var isReddish = r > 80 && r > g && (r - bl) > 10 && (r - bl) < 140;

      if (redK > 0 && isReddish) {
        d[i]     = _clamp(d[i]     - 18 * redK);
        d[i + 1] = _clamp(d[i + 1] +  2 * redK);
        d[i + 2] = _clamp(d[i + 2] +  3 * redK);
      }
      if (isSkin) {
        if (skinK > 0) {
          d[i]     = _clamp(d[i]     + 4 * skinK);
          d[i + 1] = _clamp(d[i + 1] + 2 * skinK);
          d[i + 2] = _clamp(d[i + 2] + 1 * skinK);
        }
        if (handK > 0) {
          d[i]     = _clamp(d[i]     + 3   * handK);
          d[i + 1] = _clamp(d[i + 1] + 1.5 * handK);
          d[i + 2] = _clamp(d[i + 2] - 1   * handK);
        }
      }
      if (hairK > 0) {
        var lumH = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
        if (lumH > 80 && lumH < 180 &&
            Math.abs(d[i] - d[i + 1]) < 40 && Math.abs(d[i + 1] - d[i + 2]) < 40) {
          d[i]     = _clamp(d[i]     + 6 * hairK);
          d[i + 1] = _clamp(d[i + 1] + 6 * hairK);
          d[i + 2] = _clamp(d[i + 2] + 4 * hairK);
        }
      }
      if (nailK > 0) {
        var lumN = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
        if (lumN > 180) {
          d[i]     = _clamp(d[i]     + 8 * nailK);
          d[i + 1] = _clamp(d[i + 1] + 8 * nailK);
          d[i + 2] = _clamp(d[i + 2] + 8 * nailK);
        }
      }
    }
    ctx.putImageData(data, 0, 0);
  }

  // ── preset 매핑 ──
  var AUTO_PRESET = {
    label: '자동',
    adjust: { brightness: 105, saturate: 110, sharpness: 30, temperature: 5 },
    beauty: {},
  };

  function _resolvePreset(preset, intensity) {
    if (preset === null) return null; // 보정 X
    var pe = window.PhotoEnhance;
    var inten = intensity || 'standard';  // [v183] 챗봇은 기본 standard
    if (preset === 'auto' || !preset) {
      return AUTO_PRESET;
    }
    if (preset === 'shop') {
      if (pe && typeof pe.getShopPreset === 'function') {
        try { return pe.getShopPreset(localStorage.getItem('shop_type') || '', inten); }
        catch (_e) { void _e; }
      }
      return AUTO_PRESET;
    }
    var FORCE = { hair: '헤어', lash: '속눈썹', nail: '네일', wax: '왁싱' };
    var key = FORCE[preset];
    if (key && pe && typeof pe.getShopPreset === 'function') {
      try { return pe.getShopPreset(key, inten); } catch (_e2) { void _e2; }
    }
    return AUTO_PRESET;
  }

  // ── 워터마크 ──
  var _WM_POS = {
    tl: ['left',  'top',    0, 0,  1,  1],
    tr: ['right', 'top',    1, 0, -1,  1],
    bl: ['left',  'bottom', 0, 1,  1, -1],
    br: ['right', 'bottom', 1, 1, -1, -1],
  };
  function _drawWatermark(ctx, w, h) {
    var bk = (window.BrandKit && typeof window.BrandKit.get === 'function') ? window.BrandKit.get() : null;
    if (!bk) return;
    var name = (bk.shop_name || '').trim();
    var ig = (bk.instagram_handle || '').trim().replace(/^@+/, '');
    var label = bk.watermark_text && bk.watermark_text.trim()
      ? bk.watermark_text.trim()
      : (name && ig ? name + ' · @' + ig : (name || (ig ? '@' + ig : '')));
    if (!label) return;
    ctx.save();
    var fs = Math.max(12, Math.round(w * 0.022));
    ctx.font = '600 ' + fs + 'px Pretendard, "Noto Sans KR", sans-serif';
    ctx.globalAlpha = (typeof bk.watermark_opacity === 'number') ? bk.watermark_opacity : 0.85;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 4;
    var pad = Math.round(w * 0.025);
    var c = _WM_POS[bk.watermark_position] || _WM_POS.br;
    ctx.textAlign = c[0];
    ctx.textBaseline = c[1];
    var x = w * c[2] + pad * c[4];
    var y = h * c[3] + pad * c[5];
    ctx.fillText(label, x, y, w * 0.9);
    ctx.restore();
  }

  // ── 메인 파이프라인 ──
  async function processPhoto(opts) {
    opts = opts || {};
    var src = opts.src;
    var preset = (opts.preset === undefined) ? 'shop' : opts.preset;
    var ratio = opts.ratio || '4:5';
    var watermark = !!opts.watermark;

    if (!src) throw new Error('이미지 로드 실패');

    var img = await _loadImage(src);

    // 1) crop
    var crop = _computeCrop(img, ratio);
    var canvas = document.createElement('canvas');
    canvas.width = crop.dw;
    canvas.height = crop.dh;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, crop.dw, crop.dh);

    var resolved = _resolvePreset(preset, opts.intensity);

    if (!resolved) {
      // preset=null → 원본 그대로 (crop+ratio 만 적용)
      ctx.filter = 'none';
      ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.dw, crop.dh);
    } else {
      // 2) CSS filter
      var a = resolved.adjust || AUTO_PRESET.adjust;
      var temp = a.temperature || 0;
      var sepia = Math.max(0, temp) / 100;
      var contrast = 100 + Math.max(0, -temp) * 0.3;
      ctx.filter = 'brightness(' + (a.brightness || 100) + '%) ' +
                   'saturate('  + (a.saturate   || 100) + '%) ' +
                   'contrast('  + contrast + '%) ' +
                   'sepia('     + sepia + ')';
      ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.dw, crop.dh);
      // 다음 ops 는 filter 영향 안 받게 reset
      ctx.filter = 'none';

      // 3) beauty 픽셀 walk (핵심만)
      _applyBeauty(ctx, crop.dw, crop.dh, resolved.beauty || {});

      // 4) unsharp mask
      if ((a.sharpness || 0) > 10) _unsharpMask(ctx, crop.dw, crop.dh, a.sharpness / 100);
    }

    // 5) 워터마크
    if (watermark) _drawWatermark(ctx, crop.dw, crop.dh);

    // 6) export
    var dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    // 입력이 blob: 이면 revoke
    _revoke(src);

    return {
      dataUrl: dataUrl,
      width: crop.dw,
      height: crop.dh,
      ratio: ratio,
      preset_label: resolved ? (resolved.label || '자동') : '원본',
    };
  }

  window.ChatAutoEdit = { processPhoto: processPhoto };
})();
