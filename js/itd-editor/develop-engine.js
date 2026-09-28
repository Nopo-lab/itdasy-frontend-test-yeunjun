/* T-915: deterministic photographic adjustments. Values are reusable; photo coordinates are not. */
(function (scope) {
  'use strict';
  var COLORS = [['red', '빨강', 0], ['orange', '주황', 30], ['yellow', '노랑', 60], ['green', '초록', 120], ['aqua', '청록', 180], ['blue', '파랑', 240], ['purple', '보라', 270], ['magenta', '자홍', 300]];
  var KEYS = ['whites', 'blacks', 'clarity', 'denoise', 'vignette', 'curve1', 'curve2', 'curve3', 'curve4'];
  COLORS.forEach(function (c) { ['H', 'S', 'L'].forEach(function (k) { KEYS.push(c[0] + k); }); });
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function value(a, k) { var n = Number(a && a[k]); return Number.isFinite(n) ? clamp(n, k === 'denoise' ? 0 : -100, 100) : 0; }
  function active(a) { return KEYS.some(function (k) { return value(a, k) !== 0; }); }
  function curve(a) {
    var points = [0];
    for (var i = 1; i <= 4; i++) points.push(clamp(i / 5 + value(a, 'curve' + i) * .0018, points[i - 1], 1));
    points.push(1); return points;
  }
  function lut(a) {
    var p = curve(a), table = new Float32Array(256);
    for (var i = 0; i < 256; i++) { var x = i / 255 * 5, k = Math.min(4, Math.floor(x)); table[i] = p[k] + (p[k + 1] - p[k]) * (x - k); }
    return table;
  }
  function hsl(r, g, b) {
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2, h = 0;
    if (!d) return [0, 0, l];
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
    return [h, d / (1 - Math.abs(2 * l - 1)), l];
  }
  function hue(p, q, t) {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < .5) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  function mixer(rgb, bands) {
    var c = hsl(rgb[0], rgb[1], rgb[2]), dh = 0, ds = 0, dl = 0;
    bands.forEach(function (band) {
      var distance = Math.abs(c[0] - band[0]); distance = Math.min(distance, 360 - distance);
      var weight = Math.max(0, 1 - distance / 45); weight = weight * weight * (3 - 2 * weight);
      dh += band[1] * weight * .3; ds += band[2] * weight / 100; dl += band[3] * weight / 100;
    });
    var h = (c[0] + dh) / 360, s = clamp(c[1] * (1 + ds), 0, 1);
    // Neutral objects are not recolored by a hue-specific brightness slider.
    var l = clamp(c[2] + dl * .25 * Math.min(1, c[1] * 4), 0, 1);
    var q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)];
  }
  function color(d, w, h, a) {
    var table = lut(a), hasCurve = [1, 2, 3, 4].some(function (i) { return value(a, 'curve' + i); });
    var bands = COLORS.map(function (c) { return [c[2], value(a, c[0] + 'H'), value(a, c[0] + 'S'), value(a, c[0] + 'L')]; }).filter(function (c) { return c[1] || c[2] || c[3]; });
    var white = value(a, 'whites') / 100, black = value(a, 'blacks') / 100, vig = value(a, 'vignette') / 100;
    for (var i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      var rgb = [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255], l = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
      var shift = white * .24 * Math.pow(l, 5) + black * .24 * Math.pow(1 - l, 5);
      for (var k = 0; k < 3; k++) { var v = clamp(rgb[k] + shift, 0, 1); rgb[k] = hasCurve ? table[Math.round(v * 255)] : v; }
      if (bands.length) rgb = mixer(rgb, bands);
      var x = (i / 4 % w + .5) / w * 2 - 1, y = (Math.floor(i / 4 / w) + .5) / h * 2 - 1;
      var fall = clamp((x * x + y * y - .18) / 1.82, 0, 1) * vig * .7;
      for (var c = 0; c < 3; c++) d[i + c] = clamp(fall >= 0 ? rgb[c] * (1 - fall) : rgb[c] + (1 - rgb[c]) * -fall, 0, 1) * 255;
    }
    return d;
  }
  function horizontal(data, w, h, radius, channel, out) {
    for (var y = 0; y < h; y++) {
      var sum = 0;
      for (var n = -radius; n <= radius; n++) { var p = (y * w + clamp(n, 0, w - 1)) * 4; sum += channel === 3 ? data[p + 3] / 255 : data[p + channel] * data[p + 3] / 255; }
      for (var x = 0; x < w; x++) {
        out[y * w + x] = sum;
        var left = (y * w + clamp(x - radius, 0, w - 1)) * 4, right = (y * w + clamp(x + radius + 1, 0, w - 1)) * 4;
        sum += channel === 3 ? (data[right + 3] - data[left + 3]) / 255 : (data[right + channel] * data[right + 3] - data[left + channel] * data[left + 3]) / 255;
      }
    }
  }
  function vertical(data, w, h, radius, channel, plane, weights, amount, noise) {
    for (var x = 0; x < w; x++) {
      var sum = 0, weight = 0;
      for (var n = -radius; n <= radius; n++) { var idx = clamp(n, 0, h - 1) * w + x; sum += plane[idx]; weight += weights[idx]; }
      for (var y = 0; y < h; y++) {
        var p = (y * w + x) * 4;
        if (data[p + 3] === 255 && weight > 0) {
          var diff = data[p + channel] - sum / weight;
          data[p + channel] += noise ? -diff * amount * .9 * Math.exp(-diff * diff / 288) : clamp(diff * amount, -28, 28);
        }
        var left = clamp(y - radius, 0, h - 1) * w + x, right = clamp(y + radius + 1, 0, h - 1) * w + x;
        sum += plane[right] - plane[left]; weight += weights[right] - weights[left];
      }
    }
  }
  function texture(d, w, h, a) {
    var clarity = value(a, 'clarity') / 100, noise = value(a, 'denoise') / 100;
    if ((!clarity && !noise) || w < 3 || h < 3) return d;
    // Two single-channel planes are reused, never four full RGBA float images.
    // Finish each channel before touching another; alpha remains unchanged.
    var plane = new Float32Array(w * h), weights = new Float32Array(w * h);
    [[noise, .0015, true], [clarity, .008, false]].forEach(function (pass) {
      if (!pass[0]) return;
      var radius = Math.max(1, Math.round(Math.min(w, h) * pass[1]));
      horizontal(d, w, h, radius, 3, weights);
      for (var k = 0; k < 3; k++) { horizontal(d, w, h, radius, k, plane); vertical(d, w, h, radius, k, plane, weights, pass[0], pass[2]); }
    });
    return d;
  }
  function pixels(d, w, h, a) { if (!active(a)) return d; color(d, w, h, a); return texture(d, w, h, a); }
  function balance(rgb) {
    if (!rgb || rgb.length < 3 || Math.max.apply(null, rgb) > 247 || Math.min.apply(null, rgb) < 18) return null;
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    return { temperature: Math.round(clamp((b - r) / .24 * 100, -100, 100)), tint: Math.round(clamp((g - (r + b) / 2) / .115 * 100, -100, 100)) };
  }
  function histogram(d) {
    var bins = new Array(64).fill(0), dark = 0, light = 0, count = 0;
    for (var i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      var l = Math.round(d[i] * .2126 + d[i + 1] * .7152 + d[i + 2] * .0722);
      bins[Math.min(63, Math.floor(l / 4))]++; count++;
      if (Math.max(d[i], d[i + 1], d[i + 2]) >= 253) light++;
      if (Math.min(d[i], d[i + 1], d[i + 2]) <= 2) dark++;
    }
    return { bins: bins, dark: count ? dark / count : 0, light: count ? light / count : 0 };
  }
  var api = { keys: KEYS, colors: COLORS, value: value, active: active, curve: curve, pixels: pixels, balance: balance, histogram: histogram };
  scope.ItdDevelopEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
