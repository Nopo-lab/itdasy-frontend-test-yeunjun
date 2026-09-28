/* Small blemish patch: choose a nearby texture using boundary similarity, then match tone. */
(function (scope) {
  'use strict';
  function rgb(data, w, h, x, y) {
    x = Math.max(0, Math.min(w - 1, Math.round(x))); y = Math.max(0, Math.min(h - 1, Math.round(y)));
    var p = (y * w + x) * 4; return [data[p], data[p + 1], data[p + 2]];
  }
  function ring(data, w, h, center, radius) {
    var sum = [0, 0, 0];
    for (var n = 0; n < 24; n++) {
      var t = n * Math.PI / 12, pixel = rgb(data, w, h, center[0] * w + Math.cos(t) * radius, center[1] * h + Math.sin(t) * radius);
      for (var k = 0; k < 3; k++) sum[k] += pixel[k] / 24;
    } return sum;
  }
  function source(data, w, h, p, radius) {
    var r = radius * Math.min(w, h), best = null, score = Infinity;
    for (var n = 0; n < 24; n++) {
      var t = n * Math.PI / 12, distance = r * (n < 12 ? 2.8 : 4.2), q = [p[0] + Math.cos(t) * distance / w, p[1] + Math.sin(t) * distance / h];
      if (q[0] * w < r || q[0] * w > w - r || q[1] * h < r || q[1] * h > h - r) continue;
      var error = 0;
      for (var j = 0; j < 12; j++) {
        var a = j * Math.PI / 6, dx = Math.cos(a) * r, dy = Math.sin(a) * r;
        var target = rgb(data, w, h, p[0] * w + dx, p[1] * h + dy), candidate = rgb(data, w, h, q[0] * w + dx, q[1] * h + dy);
        for (var k = 0; k < 3; k++) error += Math.pow(target[k] - candidate[k], 2);
      }
      if (error < score) { score = error; best = q; }
    } return best;
  }
  function correction(data, w, h, op, p) {
    var radius = op.radius * Math.min(w, h), q = [p[0] + op.source[0] - op.points[0][0], p[1] + op.source[1] - op.points[0][1]];
    var target = ring(data, w, h, p, radius), patch = ring(data, w, h, q, radius);
    return target.map(function (v, i) { return Math.max(-50, Math.min(50, v - patch[i])); });
  }
  scope.ItdHealEngine = { source: source, correction: correction };
})(typeof window !== 'undefined' ? window : globalThis);
