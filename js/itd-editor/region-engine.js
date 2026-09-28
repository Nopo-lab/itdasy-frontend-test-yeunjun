/* Per-photo independent selections. Masks live in original image coordinates. */
(function (scope) {
  'use strict';
  var KEYS = ['exposure', 'temperature', 'vibrance', 'detail', 'smooth', 'redness', 'shine', 'hue', 'blur'];
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, Number(v) || 0)); }
  function encode(bytes) {
    var str = ''; for (var i = 0; i < bytes.length; i += 8192) str += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return btoa(str);
  }
  function decode(mask) {
    if (!mask || !Number.isInteger(mask.w) || !Number.isInteger(mask.h) || mask.w < 1 || mask.h < 1 || mask.w > 512 || mask.h > 512 || typeof mask.data !== 'string' || mask.data.length > 350000) return null;
    try { var s = atob(mask.data); if (s.length !== mask.w * mask.h) return null; return Uint8Array.from(s, function (c) { return c.charCodeAt(0); }); }
    catch (e) { console.warn('[Photo regions] invalid mask', e); return null; }
  }
  function clean(regions) {
    return (Array.isArray(regions) ? regions : []).slice(0, 12).filter(Boolean).map(function (r, i) {
      var out = { id: String(r.id || i).slice(0, 50), name: String(r.name || '부분 보정').slice(0, 32), kind: ['skin', 'hair', 'background', 'brush'].indexOf(r.kind) >= 0 ? r.kind : 'brush', enabled: r.enabled !== false };
      KEYS.forEach(function (k) { out[k] = clamp(r[k], ['detail', 'smooth', 'redness', 'shine', 'blur'].indexOf(k) >= 0 ? 0 : -100, 100); });
      out.strokes = scope.ItdLocalAdjustments.clean(r).strokes.map(function (stroke, n) { stroke.at = clamp(r.strokes[n].at, 0, 100); stroke.opacity = r.strokes[n].opacity == null ? 1 : clamp(r.strokes[n].opacity, 0, 1); return stroke; });
      if (decode(r.mask)) out.mask = { w: r.mask.w, h: r.mask.h, data: r.mask.data };
      return out;
    });
  }
  function canvas(w, h) { var cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; }
  function mask(w, h, r, retouch) {
    var cv = canvas(w, h), ctx = cv.getContext('2d'), bytes = decode(r.mask);
    if (bytes) {
      var small = canvas(r.mask.w, r.mask.h), c = small.getContext('2d'), id = c.createImageData(small.width, small.height);
      for (var i = 0; i < bytes.length; i++) { id.data[i * 4] = 255; id.data[i * 4 + 3] = bytes[i]; }
      c.putImageData(id, 0, 0); ctx.drawImage(small, 0, 0, w, h);
    }
    if (retouch && scope.ItdRetouchEngine.active(retouch)) { cv = scope.ItdRetouchEngine.render(cv, retouch, Math.max(w, h), true); ctx = cv.getContext('2d'); }
    (r.strokes || []).forEach(function (s) {
      var pending = retouch && retouch.ops.slice(s.at || 0).some(function (op) { return ['clone', 'heal'].indexOf(op.type) < 0; });
      ctx.globalAlpha = s.opacity == null ? 1 : s.opacity;
      if (!pending) { scope.ItdLocalAdjustments.stroke(ctx, s, w, h); ctx.globalAlpha = 1; return; }
      var stroke = canvas(w, h), sc = stroke.getContext('2d'); sc.globalAlpha = s.opacity == null ? 1 : s.opacity; scope.ItdLocalAdjustments.stroke(sc, Object.assign({}, s, { erase: false }), w, h);
      var later = retouch && { ops: retouch.ops.slice(s.at || 0) };
      if (later && later.ops.length) stroke = scope.ItdRetouchEngine.render(stroke, later, Math.max(w, h), true);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over'; ctx.drawImage(stroke, 0, 0, w, h); ctx.globalAlpha = 1;
    });
    return cv;
  }
  function active(regions) { return Array.isArray(regions) && regions.some(function (r) { return r && r.enabled !== false && KEYS.some(function (k) { return !!r[k]; }) && (r.mask || r.strokes && r.strokes.length); }); }
  function blur(src, w, h, radius) {
    radius = Math.max(1, Math.round(radius)); var temp = new Uint8ClampedArray(src.length), out = new Uint8ClampedArray(src.length);
    function pass(input, output, vertical) {
      var lines = vertical ? w : h, len = vertical ? h : w, step = vertical ? w * 4 : 4;
      for (var line = 0; line < lines; line++) {
        var start = vertical ? line * 4 : line * w * 4, sum = [0, 0, 0, 0];
        for (var j = -radius; j <= radius; j++) for (var k = 0; k < 4; k++) sum[k] += input[start + Math.max(0, Math.min(len - 1, j)) * step + k];
        for (var x = 0; x < len; x++) for (var c = 0; c < 4; c++) {
          output[start + x * step + c] = sum[c] / (radius * 2 + 1);
          sum[c] += input[start + Math.min(len - 1, x + radius + 1) * step + c] - input[start + Math.max(0, x - radius) * step + c];
        }
      }
    }
    pass(src, temp, false); pass(temp, out, true); return out;
  }
  function shiftHue(r, g, b, degrees) {
    var max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    if (!delta) return [r, g, b];
    var h = max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    h = ((h + degrees / 60) % 6 + 6) % 6;
    var x = delta * (1 - Math.abs(h % 2 - 1)), rgb = h < 1 ? [delta, x, 0] : h < 2 ? [x, delta, 0] : h < 3 ? [0, delta, x] : h < 4 ? [0, x, delta] : h < 5 ? [x, 0, delta] : [delta, 0, x];
    return rgb.map(function (v) { return v + min; });
  }
  function alphaBlur(data, w, h, radius) {
    var weighted = new Uint8ClampedArray(data.length);
    for (var i = 0; i < data.length; i += 4) {
      for (var k = 0; k < 3; k++) weighted[i + k] = data[i + k] * data[i + 3] / 255;
      weighted[i + 3] = data[i + 3];
    }
    var blurred = blur(weighted, w, h, radius);
    for (var p = 0; p < data.length; p += 4) if (blurred[p + 3]) for (var c = 0; c < 3; c++) blurred[p + c] = blurred[p + c] * 255 / blurred[p + 3];
    return blurred;
  }
  function beauty(data, original, w, h, r, m) {
    var soft = r.smooth ? alphaBlur(original, w, h, Math.max(1, Math.min(w, h) * .003)) : null;
    for (var i = 0; i < data.length; i += 4) {
      if (!m[i + 3] || !original[i + 3]) continue;
      var lum = original[i] * .2126 + original[i + 1] * .7152 + original[i + 2] * .0722;
      var red = Math.max(0, data[i] - (data[i + 1] + data[i + 2]) / 2 - 12) * r.redness / 100 * .6;
      data[i] -= red; data[i + 1] += red * .2;
      for (var k = 0; k < 3; k++) {
        data[i + k] -= Math.max(0, lum - 175) * r.shine / 100 * .5;
        if (soft) { var diff = soft[i + k] - original[i + k]; data[i + k] += diff * Math.exp(-diff * diff / 900) * r.smooth / 100 * .65; }
      }
      if (r.hue) data.set(shiftHue(data[i], data[i + 1], data[i + 2], r.hue * 1.8), i);
    }
  }
  function regionBlur(data, w, h, r, m) {
    // Blur only selected color, normalized by selection coverage to avoid subject halos.
    var weighted = new Uint8ClampedArray(data.length);
    for (var i = 0; i < data.length; i += 4) {
      var a = m[i + 3] / 255 * data[i + 3] / 255;
      for (var k = 0; k < 3; k++) weighted[i + k] = data[i + k] * a;
      weighted[i + 3] = a * 255;
    }
    var result = blur(weighted, w, h, Math.min(w, h) * .022 * r.blur / 100);
    for (var p = 0; p < data.length; p += 4) if (result[p + 3]) for (var c = 0; c < 3; c++) data[p + c] = result[p + c] * 255 / result[p + 3];
  }
  function apply(data, w, h, regions, retouch) {
    if (!active(regions)) return data;
    clean(regions).forEach(function (r) {
      if (!r.enabled || !KEYS.some(function (k) { return r[k]; })) return;
      var m = mask(w, h, r, retouch).getContext('2d').getImageData(0, 0, w, h).data, edited = new Uint8ClampedArray(data);
      scope.ItdPhotoLab.pixels(edited, w, h, r); beauty(edited, data, w, h, r, m);
      if (r.blur) regionBlur(edited, w, h, r, m);
      for (var i = 0; i < data.length; i += 4) for (var k = 0; k < 3; k++) data[i + k] += (edited[i + k] - data[i + k]) * m[i + 3] / 255;
    }); return data;
  }
  scope.ItdRegionEngine = { keys: KEYS, clean: clean, active: active, mask: mask, encode: encode, decode: decode, apply: apply };
})(typeof window !== 'undefined' ? window : globalThis);
