/* T-915: local, non-destructive tone processing shared by preview and export. */
(function (scope) {
  'use strict';
  var KEYS = ['exposure', 'highlights', 'shadows', 'temperature', 'tint', 'vibrance', 'detail'].concat(scope.ItdDevelopEngine ? scope.ItdDevelopEngine.keys : []);
  function value(a, k) { var n = Number(a && a[k]); return Number.isFinite(n) ? Math.max(-100, Math.min(100, n)) : 0; }
  function active(a) { return !!(scope.ItdRegionEngine && scope.ItdRegionEngine.active(a && a.regions)) || KEYS.some(function (k) { return value(a, k) !== 0; }) || !!(scope.ItdRetouchEngine && scope.ItdRetouchEngine.active(a && a.retouch)) || !!(scope.ItdLocalAdjustments && scope.ItdLocalAdjustments.active(a && a.local)); }
  function clamp(n) { return Math.max(0, Math.min(1, n)); }
  function tone(d, a) {
    var exp = Math.pow(2, value(a, 'exposure') / 50);
    var hi = value(a, 'highlights') / 100, lo = value(a, 'shadows') / 100;
    var warm = value(a, 'temperature') / 100, tint = value(a, 'tint') / 100;
    var vib = value(a, 'vibrance') / 100;
    for (var i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      var r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      var l = r * .2126 + g * .7152 + b * .0722;
      // Smooth luminance masks preserve midtones and avoid hard tonal boundaries.
      var shift = lo * .28 * Math.pow(1 - l, 3) + hi * .28 * Math.pow(l, 3);
      r = clamp(r * exp + shift); g = clamp(g * exp + shift); b = clamp(b * exp + shift);
      r = clamp(r + warm * .12 + tint * .045);
      g = clamp(g - tint * .07); b = clamp(b - warm * .12 + tint * .045);
      var lum = r * .2126 + g * .7152 + b * .0722;
      var sat = Math.max(r, g, b) - Math.min(r, g, b);
      var gain = 1 + vib * (1 - sat) * .75;
      d[i] = Math.round(clamp(lum + (r - lum) * gain) * 255);
      d[i + 1] = Math.round(clamp(lum + (g - lum) * gain) * 255);
      d[i + 2] = Math.round(clamp(lum + (b - lum) * gain) * 255);
    }
    return d;
  }
  function sharpen(d, w, h, amount) {
    if (amount <= 0 || w < 3 || h < 3) return d;
    var src = new Uint8ClampedArray(d), gain = amount / 100 * .85;
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var p = (y * w + x) * 4;
        if (src[p + 3] < 255) continue;
        for (var k = 0; k < 3; k++) {
          var blur = (src[p + k] * 4 + src[p - 4 + k] + src[p + 4 + k] + src[p - w * 4 + k] + src[p + w * 4 + k]) / 8;
          var diff = src[p + k] - blur;
          // Ignore low-contrast noise; cap overshoot to prevent strong halos.
          if (Math.abs(diff) > 2) d[p + k] = src[p + k] + Math.max(-24, Math.min(24, diff * gain));
        }
      }
    }
    return d;
  }
  function pixels(d, w, h, a) { tone(d, a); if (scope.ItdDevelopEngine) scope.ItdDevelopEngine.pixels(d, w, h, a); return sharpen(d, w, h, value(a, 'detail')); }
  function render(img, a, maxEdge) {
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    var scale = Math.min(1, (maxEdge || 2560) / Math.max(iw, ih));
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(iw * scale)); cv.height = Math.max(1, Math.round(ih * scale));
    var c = cv.getContext('2d', { willReadFrequently: true });
    c.drawImage(img, 0, 0, cv.width, cv.height);
    var data = c.getImageData(0, 0, cv.width, cv.height);
    if (scope.ItdRetouchEngine) scope.ItdRetouchEngine.pixels(data.data, cv.width, cv.height, a && a.retouch);
    if (scope.ItdRegionEngine) scope.ItdRegionEngine.apply(data.data, cv.width, cv.height, a && a.regions, a && a.retouch);
    pixels(data.data, cv.width, cv.height, a);
    if (scope.ItdLocalAdjustments) scope.ItdLocalAdjustments.apply(data.data, cv.width, cv.height, a && a.local);
    c.putImageData(data, 0, 0);
    return cv;
  }
  var api = { keys: KEYS, value: value, active: active, pixels: pixels, tone: tone, render: render };
  scope.ItdPhotoLab = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
