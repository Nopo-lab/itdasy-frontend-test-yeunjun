/* T-915: reusable global photo tone; never carries photo bytes, crop or local brush masks. */
(function () {
  'use strict';
  var SPEC = {
    b: [100, 60, 140], c: [100, 60, 140], s: [100, 0, 200], w: [0, 0, 100], sh: [0, 0, 100],
    exposure: [0, -100, 100], highlights: [0, -100, 100], shadows: [0, -100, 100],
    temperature: [0, -100, 100], tint: [0, -100, 100], vibrance: [0, -100, 100], detail: [0, 0, 100]
  };
  var EXTRA = ['whites', 'blacks', 'clarity', 'denoise', 'vignette', 'curve1', 'curve2', 'curve3', 'curve4'];
  ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'].forEach(function (c) { ['H', 'S', 'L'].forEach(function (k) { EXTRA.push(c + k); }); });
  EXTRA.forEach(function (k) { SPEC[k] = [0, k === 'denoise' ? 0 : -100, 100]; });
  var KEYS = Object.keys(SPEC), LOOKS = ['natural', 'clean', 'texture', 'warm', 'cool', 'mono'];
  function bounded(value, spec) {
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.max(spec[1], Math.min(spec[2], value)) : spec[0];
  }
  function fromAdjustment(source) {
    if (!source || typeof source !== 'object') return null;
    var adj = {}, changed = false;
    KEYS.forEach(function (k) {
      adj[k] = bounded(source[k], SPEC[k]);
      if (adj[k] !== SPEC[k][0]) changed = true;
    });
    if (!changed) return null;
    if (LOOKS.indexOf(source.labLook) >= 0) {
      adj.labLook = source.labLook;
      adj.labStrength = bounded(source.labStrength, [100, 0, 100]);
    }
    return { v: 1, adj: adj };
  }
  function normalize(tone) { return tone && tone.v === 1 ? fromAdjustment(tone.adj) : null; }
  function capture(st) {
    if (!st || !Array.isArray(st.adj)) return null;
    var index = Number.isInteger(st.photoIdx) ? st.photoIdx : 0;
    var selected = fromAdjustment(st.adj[index]); if (selected) return selected;
    for (var i = 0; i < st.adj.length; i++) {
      var tone = fromAdjustment(st.adj[i]); if (tone) return tone;
    }
    return null;
  }
  function toAdjustment(tone) { var safe = normalize(tone); return safe ? safe.adj : null; }
  function signature(tone) {
    var safe = normalize(tone); if (!safe) return '';
    EXTRA.forEach(function (k) { if (!safe.adj[k]) delete safe.adj[k]; });
    return JSON.stringify(safe);
  }
  window.WMPhotoTone = { capture: capture, normalize: normalize, toAdjustment: toAdjustment, signature: signature };
})();
