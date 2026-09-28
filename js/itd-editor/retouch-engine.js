/* T-915: deterministic image-relative deformation and clone brushes. No network. */
(function (scope) {
  'use strict';
  var TYPES = ['push', 'pinch', 'bulge', 'restore', 'clone', 'heal'];
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function number(n, fallback, lo, hi) { return Number.isFinite(n) ? clamp(n, lo, hi) : fallback; }
  function point(p) { return Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) ? [clamp(p[0], 0, 1), clamp(p[1], 0, 1)] : null; }
  function clean(value) {
    return { ops: (value && Array.isArray(value.ops) ? value.ops : []).slice(0, 100).filter(function (op) {
      return op && TYPES.indexOf(op.type) >= 0 && Array.isArray(op.points);
    }).map(function (op) {
      return { type: op.type, radius: number(op.radius, .08, .005, .35), strength: number(op.strength, .35, .01, 1),
        points: op.points.slice(0, 512).map(point).filter(Boolean), source: point(op.source), protect: op.protect && scope.ItdRegionEngine ? scope.ItdRegionEngine.clean([op.protect])[0] : null };
    }).filter(function (op) { return op.points.length && (['clone', 'heal'].indexOf(op.type) < 0 || op.source); }) };
  }
  function active(value) { return !!(value && Array.isArray(value.ops) && value.ops.length); }
  function grid(w, h) {
    var step = Math.min(w, h) / 180, nx = Math.ceil(w / step) + 1, ny = Math.ceil(h / step) + 1;
    var g = { w: w, h: h, nx: nx, ny: ny, x: new Float32Array(nx * ny), y: new Float32Array(nx * ny) };
    for (var y = 0; y < ny; y++) for (var x = 0; x < nx; x++) { var p = y * nx + x; g.x[p] = x / (nx - 1); g.y[p] = y / (ny - 1); }
    return g;
  }
  function sample(data, nx, ny, x, y) {
    x = clamp(x, 0, 1) * (nx - 1); y = clamp(y, 0, 1) * (ny - 1);
    var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    var x1 = Math.min(nx - 1, ix + 1), y1 = Math.min(ny - 1, iy + 1);
    return data[iy * nx + ix] * (1 - fx) * (1 - fy) + data[iy * nx + x1] * fx * (1 - fy) + data[y1 * nx + ix] * (1 - fx) * fy + data[y1 * nx + x1] * fx * fy;
  }
  function bounds(w, h, cx, cy, r) {
    return [Math.max(0, Math.floor(cx - r)), Math.max(0, Math.floor(cy - r)), Math.min(w - 1, Math.ceil(cx + r)), Math.min(h - 1, Math.ceil(cy + r))];
  }
  function weight(distance) { var t = Math.max(0, 1 - distance); return t * t * (3 - 2 * t); }
  function dab(g, op, center, delta) {
    var r = op.radius * Math.min(g.w, g.h), cx = center[0] * g.w, cy = center[1] * g.h;
    var box = bounds(g.nx, g.ny, center[0] * (g.nx - 1), center[1] * (g.ny - 1), r / g.w * (g.nx - 1) + 1);
    var ox = g.x.slice(), oy = g.y.slice();
    for (var y = box[1]; y <= box[3]; y++) for (var x = box[0]; x <= box[2]; x++) {
      var u = x / (g.nx - 1), v = y / (g.ny - 1), dx = u * g.w - cx, dy = v * g.h - cy;
      var distance = Math.hypot(dx, dy) / r; if (distance >= 1) continue;
      var f = weight(distance) * op.strength, p = y * g.nx + x;
      if (op.guard) f *= 1 - op.guard[p * 4 + 3] / 255;
      if (op.type === 'restore') { g.x[p] += (u - g.x[p]) * f; g.y[p] += (v - g.y[p]) * f; continue; }
      var sx = u, sy = v;
      if (op.type === 'push') { sx -= delta[0] * f; sy -= delta[1] * f; }
      else { var k = (op.type === 'bulge' ? -.2 : .2) * f; sx += dx / g.w * k; sy += dy / g.h * k; }
      g.x[p] = sample(ox, g.nx, g.ny, sx, sy); g.y[p] = sample(oy, g.nx, g.ny, sx, sy);
    }
  }
  function walk(op, w, h, visitor) {
    var r = op.radius * Math.min(w, h), previous = op.points[0];
    if (op.type !== 'push') visitor(previous, [0, 0]);
    for (var p = 1; p < op.points.length; p++) {
      var next = op.points[p], dx = next[0] - previous[0], dy = next[1] - previous[1];
      var steps = Math.max(1, Math.ceil(Math.hypot(dx * w, dy * h) / Math.max(1, r * .2)));
      for (var i = 1; i <= steps; i++) visitor([previous[0] + dx * i / steps, previous[1] + dy * i / steps], [dx / steps, dy / steps]);
      previous = next;
    }
  }
  function mapping(w, h, value) {
    var g = grid(w, h);
    clean(value).ops.filter(function (op) { return ['clone', 'heal'].indexOf(op.type) < 0; }).forEach(function (op) {
      if (op.protect && scope.ItdRegionEngine) op.guard = scope.ItdRegionEngine.mask(g.nx, g.ny, op.protect).getContext('2d').getImageData(0, 0, g.nx, g.ny).data;
      walk(op, w, h, function (p, d) { dab(g, op, p, d); });
    });
    return g;
  }
  function rgba(src, w, h, u, v, out, offset, mix) {
    var x = clamp(u, 0, 1) * (w - 1), y = clamp(v, 0, 1) * (h - 1), ix = Math.floor(x), iy = Math.floor(y);
    var fx = x - ix, fy = y - iy, x1 = Math.min(ix + 1, w - 1), y1 = Math.min(iy + 1, h - 1);
    var ids = [(iy * w + ix) * 4, (iy * w + x1) * 4, (y1 * w + ix) * 4, (y1 * w + x1) * 4];
    var ws = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy], alpha = 0;
    for (var j = 0; j < 4; j++) alpha += src[ids[j] + 3] * ws[j];
    for (var k = 0; k < 3; k++) {
      var color = 0; for (var i = 0; i < 4; i++) color += src[ids[i] + k] * src[ids[i] + 3] * ws[i];
      out[offset + k] += ((alpha ? color / alpha : 0) - out[offset + k]) * mix;
    }
    out[offset + 3] += (alpha - out[offset + 3]) * mix;
  }
  function warp(data, w, h, g) {
    var src = new Uint8ClampedArray(data);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var u = x / Math.max(1, w - 1), v = y / Math.max(1, h - 1);
      var sx = sample(g.x, g.nx, g.ny, u, v), sy = sample(g.y, g.nx, g.ny, u, v);
      if (Math.abs(sx - u) + Math.abs(sy - v) < .0000001) continue;
      rgba(src, w, h, sx, sy, data, (y * w + x) * 4, 1);
    }
  }
  function cloneDab(data, src, w, h, op, p) {
    var r = op.radius * Math.min(w, h), cx = p[0] * (w - 1), cy = p[1] * (h - 1), box = bounds(w, h, cx, cy, r);
    var correction = op.type === 'heal' && scope.ItdHealEngine ? scope.ItdHealEngine.correction(src, w, h, op, p) : null;
    var du = op.source[0] - op.points[0][0], dv = op.source[1] - op.points[0][1];
    for (var y = box[1]; y <= box[3]; y++) for (var x = box[0]; x <= box[2]; x++) {
      var dist = Math.hypot(x - cx, y - cy) / r; if (dist >= 1) continue;
      var u = x / Math.max(1, w - 1) + du, v = y / Math.max(1, h - 1) + dv;
      if (u < 0 || v < 0 || u > 1 || v > 1) continue;
      rgba(src, w, h, u, v, data, (y * w + x) * 4, weight(dist) * op.strength);
      if (correction) for (var k = 0; k < 3; k++) data[(y * w + x) * 4 + k] += correction[k] * weight(dist) * op.strength;
    }
  }
  function pixels(data, w, h, value, maskOnly) {
    var ops = clean(value).ops; if (!ops.length) return data;
    var group = [], original = ops.some(function (op) { return op.type === 'restore'; }) ? new Uint8ClampedArray(data) : null;
    function flush() { if (group.length) { warp(data, w, h, mapping(w, h, { ops: group })); group = []; } }
    ops.forEach(function (op) {
      if (op.type !== 'clone' && op.type !== 'heal' && op.type !== 'restore') { group.push(op); return; }
      flush();
      if (op.type === 'restore') {
        var restoreOp = Object.assign({}, op, { source: op.points[0] });
        walk(restoreOp, w, h, function (p) { cloneDab(data, original, w, h, restoreOp, p); }); return;
      }
      if (!maskOnly) {
        var src = new Uint8ClampedArray(data); walk(op, w, h, function (p) { cloneDab(data, src, w, h, op, p); });
      }
    });
    flush(); return data;
  }
  function render(img, value, maxEdge, maskOnly) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, scale = Math.min(1, (maxEdge || 2560) / Math.max(w, h));
    var cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * scale)); cv.height = Math.max(1, Math.round(h * scale));
    var c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(img, 0, 0, cv.width, cv.height);
    if (active(value)) { var data = c.getImageData(0, 0, cv.width, cv.height); pixels(data.data, cv.width, cv.height, value, maskOnly); c.putImageData(data, 0, 0); }
    return cv;
  }
  var api = { clean: clean, active: active, pixels: pixels, render: render, mapping: mapping, mapPoint: function (g, p) { return [sample(g.x, g.nx, g.ny, p[0], p[1]), sample(g.y, g.nx, g.ny, p[0], p[1])]; } };
  scope.ItdRetouchEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
