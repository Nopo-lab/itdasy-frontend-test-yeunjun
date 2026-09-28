/* Reusable settings contain no photo, coordinates, masks, or facial deformation. */
(function () {
  'use strict';
  var STORAGE_KEYS = { recipe: 'itdasy:photo-recipe:v1' };
  var KINDS = ['skin', 'hair', 'background'];
  function globals(source) {
    var out = {}, limits = { b: [100, 60, 140], c: [100, 60, 140], s: [100, 0, 200], w: [0, 0, 100], sh: [0, 0, 100] };
    window.ItdPhotoLab.keys.concat(Object.keys(limits)).forEach(function (k) {
      var spec = limits[k] || [0, ['detail', 'denoise'].indexOf(k) >= 0 ? 0 : -100, 100], n = source && source[k];
      out[k] = Number.isFinite(n) ? Math.max(spec[1], Math.min(spec[2], n)) : spec[0];
    }); return out;
  }
  function settings(regions) {
    return (Array.isArray(regions) ? regions : []).filter(function (r) { return r && KINDS.indexOf(r.kind) >= 0; }).slice(0, 12).map(function (r) {
      var item = { kind: r.kind };
      window.ItdRegionEngine.keys.forEach(function (k) {
        var n = r[k], lo = ['detail', 'smooth', 'redness', 'shine', 'blur'].indexOf(k) >= 0 ? 0 : -100;
        item[k] = Number.isFinite(n) ? Math.max(lo, Math.min(100, n)) : 0;
      }); return item;
    });
  }
  function reference(value) {
    if (!value || !Array.isArray(value.quantiles) || value.quantiles.length !== 3) return null;
    var q = value.quantiles;
    if (!q.every(function (n) { return Number.isFinite(n) && n > 0 && n < 255; }) || q[0] > q[1] || q[1] > q[2]) return null;
    return { quantiles: q.slice() };
  }
  function measure(img) {
    if (!img) return null;
    var width = img.naturalWidth || img.width, height = img.naturalHeight || img.height;
    if (!(width > 0 && height > 0)) return null;
    var c = document.createElement('canvas'), scale = Math.min(1, 96 / Math.max(width, height));
    c.width = Math.max(1, Math.round(width * scale)); c.height = Math.max(1, Math.round(height * scale));
    var ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, c.width, c.height);
    var data = ctx.getImageData(0, 0, c.width, c.height).data, values = [];
    for (var i = 0; i < data.length; i += 4) if (data[i + 3] >= 250) values.push(data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722);
    if (values.length < 16) return null;
    values.sort(function (a, b) { return a - b; });
    var q = [.25, .5, .75].map(function (p) { return Math.round(values[Math.floor((values.length - 1) * p)] * 100) / 100; });
    if (q[0] < 5 || q[2] > 245) return null;
    return reference({ quantiles: q });
  }
  function lighting(saved, current) {
    saved = reference(saved); current = reference(current);
    if (!saved || !current) throw new Error('밝기 기준을 읽을 수 없어요. 기준 사진에서 내 보정을 다시 저장하거나 밝기 맞춤을 꺼 주세요.');
    var shifts = saved.quantiles.map(function (v, i) { return 50 * Math.log2(v / current.quantiles[i]); });
    if (Math.max.apply(null, shifts) - Math.min.apply(null, shifts) > 18) throw new Error('사진의 밝기 분포가 많이 달라요. 밝기 맞춤을 끄고 직접 조절해 주세요.');
    return Math.round(Math.max(-35, Math.min(35, shifts[1])) * 100) / 100;
  }
  function capture(draft, img) {
    var regions = (draft.regions || []).filter(function (r) {
      return r.mask && r.enabled !== false && KINDS.indexOf(r.kind) >= 0 && window.ItdRegionEngine.keys.some(function (k) { return !!r[k]; });
    });
    return { v: 2, global: globals(draft), regions: settings(regions), reference: measure(img) };
  }
  function save(draft, img) {
    var data = capture(draft, img);
    try { localStorage.setItem(STORAGE_KEYS.recipe, JSON.stringify(data)); }
    catch (e) { console.warn('[Photo recipe] storage failed', e); throw new Error('기기에 보정을 저장하지 못했어요. 저장 공간과 브라우저 설정을 확인해 주세요.'); }
  }
  function read() {
    var raw;
    try { raw = localStorage.getItem(STORAGE_KEYS.recipe); }
    catch (e) { console.warn('[Photo recipe] storage unavailable', e); throw new Error('저장한 보정에 접근하지 못했어요. 브라우저의 저장 허용 설정을 확인해 주세요.'); }
    if (!raw) throw new Error('먼저 내 보정을 저장해 주세요.');
    var data;
    try { data = JSON.parse(raw); } catch (e) { console.warn('[Photo recipe] invalid storage', e); }
    if (!data || [1, 2].indexOf(data.v) < 0 || !data.global || typeof data.global !== 'object' || Array.isArray(data.global) || !Array.isArray(data.regions) || data.regions.length > 12) throw new Error('저장한 보정을 읽을 수 없어요. 다시 저장해 주세요.');
    return { v: data.v, global: globals(data.global), regions: settings(data.regions), reference: reference(data.reference) };
  }
  function freshMask(result, kind) {
    var mask = window.ItdAutoSelection.mask(result, kind), bytes = window.ItdRegionEngine.decode(mask);
    if (!bytes || bytes.reduce(function (sum, n) { return sum + n; }, 0) / (255 * bytes.length) < .002) throw new Error({ skin: '피부', hair: '헤어', background: '배경' }[kind] + ' 영역을 찾지 못했어요. 해당 사진은 직접 보정해 주세요.');
    return mask;
  }
  async function apply(draft, img, recipe, options) {
    var a = Object.assign({}, draft, globals(recipe.global)), items = settings(recipe.regions);
    delete a.labLook; delete a.labStrength;
    if (options && options.matchLighting) a.exposure = Math.max(-100, Math.min(100, a.exposure + lighting(recipe.reference, measure(img))));
    a.regions = window.ItdRegionEngine.clean(a.regions).filter(function (r) {
      return !r.mask || (recipe.v === 2 ? KINDS.indexOf(r.kind) < 0 : !items.some(function (p) { return p.kind === r.kind; }));
    });
    if (!items.length) return a;
    if (a.regions.length + items.length > 12) throw new Error('선택 영역이 부족해요. 영역을 삭제한 뒤 다시 적용해 주세요.');
    var result = await window.ItdAutoSelection.select(img), masks = {};
    items.forEach(function (r) { if (!masks[r.kind]) masks[r.kind] = freshMask(result, r.kind); });
    items.forEach(function (r, i) {
      a.regions.push(Object.assign({}, r, { id: 'recipe-' + r.kind + '-' + i, name: { skin: '피부', hair: '헤어', background: '배경' }[r.kind], enabled: true, strokes: [], mask: masks[r.kind] }));
    }); a.regions = window.ItdRegionEngine.clean(a.regions); return a;
  }
  window.ItdBeautyRecipes = { capture: capture, save: save, read: read, apply: apply, measure: measure, lighting: lighting };
})();
