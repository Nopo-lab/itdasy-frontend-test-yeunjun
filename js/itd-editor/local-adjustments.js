/* T-915: image-relative feathered brush masks, shared by preview and export. */
(function () {
  'use strict';
  function bounded(n, lo, hi, fallback) { n = Number(n); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback; }
  function clean(local) {
    local = local || {};
    return { exposure: bounded(local.exposure, -100, 100, 25), shadows: bounded(local.shadows, -100, 100, 0),
      temperature: bounded(local.temperature, -100, 100, 0), detail: bounded(local.detail, 0, 100, 0),
      smooth: bounded(local.smooth, 0, 100, 0),
      strokes: (Array.isArray(local.strokes) ? local.strokes : []).slice(0, 150).map(function (s) {
        return { radius: bounded(s.radius, .003, .3, .05), softness: bounded(s.softness, 0, 1, .7), erase: !!s.erase,
          points: (Array.isArray(s.points) ? s.points : []).slice(0, 2000).filter(function (p) {
            return Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
          }).map(function (p) { return [bounded(p[0], 0, 1, 0), bounded(p[1], 0, 1, 0)]; }) };
      }) };
  }
  function dab(c, x, y, radius, soft) {
    if (soft <= 0) { c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2); c.fill(); return; }
    var g = c.createRadialGradient(x, y, Math.max(.01, radius * (1 - soft)), x, y, radius);
    g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2); c.fill();
  }
  function stroke(c, s, w, h) {
    var radius = s.radius * Math.min(w, h), last = null;
    c.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
    s.points.forEach(function (p) {
      var x = p[0] * w, y = p[1] * h;
      var n = last ? Math.max(1, Math.ceil(Math.hypot(x - last[0], y - last[1]) / Math.max(1, radius * .2))) : 1;
      for (var i = 1; i <= n; i++) dab(c, last ? last[0] + (x - last[0]) * i / n : x, last ? last[1] + (y - last[1]) * i / n : y, radius, s.softness);
      last = [x, y];
    });
  }
  function mask(w, h, local) {
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    var c = cv.getContext('2d', { willReadFrequently: true });
    clean(local).strokes.forEach(function (s) { stroke(c, s, w, h); });
    return cv;
  }
  function active(local) { return !!(local && Array.isArray(local.strokes) && local.strokes.some(function (s) { return s.points && s.points.length; })); }
  function soften(data, w, h, amount, maskData) {
    if (!amount) return;
    var src = new Uint8ClampedArray(data), radius = Math.max(1, Math.min(6, Math.round(Math.min(w, h) * .003)));
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var p = (y * w + x) * 4; if (!maskData[p + 3] || !src[p + 3]) continue;
      var sum = [0, 0, 0], total = 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var xx = Math.max(0, Math.min(w - 1, x + dx * radius)), yy = Math.max(0, Math.min(h - 1, y + dy * radius)), q = (yy * w + xx) * 4;
        var diff = Math.abs(src[p] - src[q]) + Math.abs(src[p + 1] - src[q + 1]) + Math.abs(src[p + 2] - src[q + 2]);
        var weight = Math.exp(-diff * diff / 1800) * (dx ? 1 : 2) * (dy ? 1 : 2) * src[q + 3] / 255;
        total += weight; for (var k = 0; k < 3; k++) sum[k] += src[q + k] * weight;
      }
      for (var channel = 0; channel < 3; channel++) data[p + channel] += (sum[channel] / total - data[p + channel]) * amount / 100 * .85;
    }
  }
  function apply(data, w, h, local) {
    if (!active(local)) return data;
    var settings = clean(local), m = mask(w, h, settings).getContext('2d').getImageData(0, 0, w, h).data;
    var adjusted = new Uint8ClampedArray(data); window.ItdPhotoLab.pixels(adjusted, w, h, settings);
    soften(adjusted, w, h, settings.smooth, m);
    for (var i = 0; i < data.length; i += 4) {
      var alpha = m[i + 3] / 255;
      for (var k = 0; k < 3; k++) data[i + k] += (adjusted[i + k] - data[i + k]) * alpha;
    }
    return data;
  }
  window.ItdLocalAdjustments = { clean: clean, active: active, mask: mask, stroke: stroke, apply: apply };
})();
