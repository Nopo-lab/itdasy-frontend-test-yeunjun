/* T-915: complete per-photo edits for carousel export; separate from reusable style memory. */
(function () {
  'use strict';
  function entry(map, index) { var out = {}; if (map && map[index] != null) out[0] = map[index]; return out; }
  function collect(state, stageSize) {
    return (state.photos || []).map(function (url, i) {
      var a = state.adj[i] || {}, layers = state.layersByPhoto[i] || [];
      var touched = Object.prototype.hasOwnProperty.call(state.layersByPhoto, i) ||
        window.ItdPhotoLab.active(a) || ['b', 'c', 's'].some(function (k) { return a[k] != null && a[k] !== 100; }) || a.w || a.sh || a.rot ||
        (state.photoDraw && state.photoDraw[i]) || (state.fgMask && state.fgMask[i]) || state.collageBgImg;
      if (!touched) return null;
      var edit = { v: 1, photoIdx: 0, layoutIdx: 0, layoutOrder: [], cellCrop: [], ratio: state.ratio,
        stageSize: stageSize, fitMode: state.fitMode, collageBg: state.collageBg, collageBgImg: state.collageBgImg || null, photos: [url], layers: layers,
        adj: [Object.assign({}, a)], presetByPhoto: entry(state.presetByPhoto, i),
        photoDraw: entry(state.photoDraw, i), photoBg: entry(state.photoBg, i), fgMask: entry(state.fgMask, i),
        origPhotos: state.origPhotos && state.origPhotos[i] ? [state.origPhotos[i]] : [], pz: Object.assign({}, state.pz) };
      return { idx: i, photoUrl: url, layers: layers, editState: edit };
    }).filter(Boolean);
  }
  function drawing(canvas, state, load, current) {
    var src = state.photoDraw && state.photoDraw[state.adjSel || 0];
    if (!src) return Promise.resolve();
    return load(src).then(function (img) {
      if (current && !current()) return;
      if (!img) throw new Error('그리기 내용을 불러오지 못했어요');
      var c = canvas.getContext('2d'); c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, canvas.width, canvas.height); c.drawImage(img, 0, 0, canvas.width, canvas.height); c.restore();
    });
  }
  function background(ctx, img, width, height) {
    var scale = Math.max(width / img.width, height / img.height);
    var w = img.width * scale, h = img.height * scale;
    ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
  }
  window.ItdPhotoRecipes = { collect: collect, drawing: drawing, background: background };
})();
