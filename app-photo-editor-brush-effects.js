/* 사진 편집기 — 부분 보정 브러시 효과 계산 (2026-05-19 v206.7 분할) */
(function () {
  'use strict';

  const CLONE_TYPES = new Set(['clone', 'heal']);

  function _applyBrush(mainCv, maskCv, brush) {
    const ctx = mainCv.getContext('2d');
    const mctx = maskCv.getContext('2d');
    const w = mainCv.width, h = mainCv.height;
    let src, mdata;
    try {
      src = ctx.getImageData(0, 0, w, h);
      mdata = mctx.getImageData(0, 0, w, h);
    } catch (err) {
      console.warn('[brush-effects] 픽셀 읽기 실패:', err);
      return false;
    }

    const d = src.data, mask = mdata.data;
    const opts = _cloneOptions(brush, d);
    if (opts.invalid) return false;
    _walkPixels(d, mask, w, h, brush, opts);
    ctx.putImageData(src, 0, 0);
    return true;
  }

  function _cloneOptions(brush, pixels) {
    const type = brush.type;
    if (!CLONE_TYPES.has(type)) return { type };
    if (!brush.sourcePt || !brush.firstStrokePt) return { invalid: true };
    return {
      type,
      snapshot: new Uint8ClampedArray(pixels),
      offX: Math.round(brush.sourcePt.x - brush.firstStrokePt.x),
      offY: Math.round(brush.sourcePt.y - brush.firstStrokePt.y),
    };
  }

  function _walkPixels(d, mask, width, height, brush, opts) {
    const strength = (brush.strength || 50) / 100;
    for (let i = 0; i < d.length; i += 4) {
      const alpha = mask[i + 3] / 255;
      if (alpha < 0.05) continue;
      _applyPixel(d, i, alpha * strength, width, height, opts);
    }
  }

  function _applyPixel(d, i, weight, width, height, opts) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const lum = r * 0.299 + g * 0.587 + b * 0.114;
    if (opts.type === 'smooth') return _paintSmooth(d, i, r, g, b, weight);
    if (opts.type === 'shine') return _paintShine(d, i, r, g, b, weight);
    if (opts.type === 'redness') return _paintRedness(d, i, r, g, b, weight);
    if (opts.type === 'gloss') return _paintGloss(d, i, r, g, b, lum, weight);
    if (opts.type === 'blur') return _paintBlur(d, i, r, g, b, lum, weight);
    if (opts.type === 'clone' || opts.type === 'heal') {
      _paintCloneOrHeal(d, i, width, height, weight, opts);
    }
  }

  function _paintSmooth(d, i, r, g, b, weight) {
    d[i] = _clamp(r + 3 * weight);
    d[i + 1] = _clamp(g + 3 * weight);
    d[i + 2] = _clamp(b + 3 * weight);
  }

  function _paintShine(d, i, r, g, b, weight) {
    d[i] = _clamp(r + 15 * weight);
    d[i + 1] = _clamp(g + 15 * weight);
    d[i + 2] = _clamp(b + 10 * weight);
  }

  function _paintRedness(d, i, r, g, b, weight) {
    d[i] = _clamp(r - 30 * weight);
    d[i + 1] = _clamp(g + 4 * weight);
    d[i + 2] = _clamp(b + 5 * weight);
  }

  function _paintGloss(d, i, r, g, b, lum, weight) {
    if (lum <= 140) return;
    d[i] = _clamp(r + 20 * weight);
    d[i + 1] = _clamp(g + 20 * weight);
    d[i + 2] = _clamp(b + 20 * weight);
  }

  function _paintBlur(d, i, r, g, b, lum, weight) {
    const mix = weight * 0.5;
    d[i] = _clamp(r * (1 - mix) + lum * mix);
    d[i + 1] = _clamp(g * (1 - mix) + lum * mix);
    d[i + 2] = _clamp(b * (1 - mix) + lum * mix);
  }

  function _paintCloneOrHeal(d, i, width, height, weight, opts) {
    const pos = _sourceIndex(i, width, height, opts);
    if (!pos) return;
    const src = opts.snapshot;
    const sr = src[pos.source], sg = src[pos.source + 1], sb = src[pos.source + 2];
    if (opts.type === 'clone') {
      d[i] = _clamp(d[i] * (1 - weight) + sr * weight);
      d[i + 1] = _clamp(d[i + 1] * (1 - weight) + sg * weight);
      d[i + 2] = _clamp(d[i + 2] * (1 - weight) + sb * weight);
      return;
    }
    const avg = _neighborAverage(src, pos.x, pos.y, width, height);
    if (!avg) return;
    d[i] = _clamp(d[i] * (1 - weight) + (sr * 0.6 + avg.r * 0.4) * weight);
    d[i + 1] = _clamp(d[i + 1] * (1 - weight) + (sg * 0.6 + avg.g * 0.4) * weight);
    d[i + 2] = _clamp(d[i + 2] * (1 - weight) + (sb * 0.6 + avg.b * 0.4) * weight);
  }

  function _sourceIndex(i, width, height, opts) {
    const idx = i / 4;
    const y = Math.floor(idx / width), x = idx - y * width;
    const sx = x - opts.offX, sy = y - opts.offY;
    if (sx < 0 || sx >= width || sy < 0 || sy >= height) return null;
    return { x, y, source: (sy * width + sx) * 4 };
  }

  function _neighborAverage(src, x, y, width, height) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const j = (ny * width + nx) * 4;
      r += src[j]; g += src[j + 1]; b += src[j + 2]; n++;
    }
    return n ? { r: r / n, g: g / n, b: b / n } : null;
  }

  function _clamp(v) {
    return v < 0 ? 0 : v > 255 ? 255 : v;
  }

  window.PhotoEditorBrushEffects = { apply: _applyBrush };
})();
