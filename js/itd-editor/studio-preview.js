/* T-915: preview processing, session-safe async updates and original comparison. */
(function () {
  'use strict';
  var generation = 0, timer = 0, cache = new Map();
  function key(url, a) { return url + '|' + window.ItdPhotoLab.keys.map(function (k) { return window.ItdPhotoLab.value(a, k); }).join(',') + '|' + JSON.stringify([a && a.local || null, a && a.retouch || null, a && a.regions || null]); }
  function processed(url, a, load, maskUrl) {
    if (!window.ItdPhotoLab.active(a)) return Promise.resolve({ url: url, base: url, mask: maskUrl });
    var id = key(url, a) + '|' + (maskUrl || '');
    if (cache.has(id)) return Promise.resolve(cache.get(id));
    var warped = window.ItdRetouchEngine && window.ItdRetouchEngine.active(a.retouch);
    return Promise.all([load(url), warped && maskUrl ? load(maskUrl) : Promise.resolve(null)]).then(function (images) {
      var img = images[0]; if (!img || (warped && maskUrl && !images[1])) throw new Error('사진을 불러올 수 없어요');
      var out = { url: window.ItdPhotoLab.render(img, a, 1200).toDataURL('image/png'), base: url, mask: maskUrl };
      if (maskUrl && (warped || a.regions)) {
        out.base = window.ItdPhotoLab.render(img, { regions: a.regions, retouch: a.retouch }, 1200).toDataURL();
        if (images[1]) out.mask = window.ItdRetouchEngine.render(images[1], a.retouch, 1200, true).toDataURL();
      }
      if (cache.size >= 4) cache.delete(cache.keys().next().value);
      cache.set(id, out); return out;
    });
  }
  function place(root, state, i, out) {
    var css = 'url("' + out.url + '")';
    if (state.layout.kind === 'single') {
      if (i !== state.adjSel) return;
      var fx = root.querySelector('[data-r="photofx"]'), base = root.querySelector('[data-r="photo"]');
      var target = fx && !fx.hidden ? fx : base;
      target.style.backgroundImage = css;
      if (target === fx) { base.style.backgroundImage = 'url("' + out.base + '")'; fx.style.maskImage = 'url("' + out.mask + '")'; fx.style.webkitMaskImage = fx.style.maskImage; }
    } else {
      root.querySelectorAll('[data-ci="' + i + '"]').forEach(function (cell) {
        var fx = cell.querySelector('.itcellfx'), img = cell.querySelector('.itcellimg');
        if (fx) { fx.style.backgroundImage = css; fx.style.maskImage = 'url("' + out.mask + '")'; fx.style.webkitMaskImage = fx.style.maskImage; if (img) img.src = out.base; }
        else if (img) img.src = out.url;
      });
    }
  }
  function update(root, state, load, notify) {
    var ticket = ++generation; clearTimeout(timer);
    if (!state || !root.classList.contains('is-open')) return;
    var indices = state.layout.kind === 'single' ? [state.adjSel] : state.layoutOrder.slice();
    timer = setTimeout(function () {
      indices.forEach(function (i) {
        if (i == null || !state.photos[i]) return;
        processed(state.photos[i], Object.assign({}, state.adj[i]), load, state.fgMask && state.fgMask[i]).then(function (url) {
          if (ticket !== generation || state._cancelled || !root.classList.contains('is-open')) return;
          place(root, state, i, url);
        }).catch(function (e) {
          if (ticket !== generation) return;
          console.warn('[PhotoStudio] preview failed', e); notify('보정 미리보기를 불러오지 못했어요. 다시 시도해 주세요.');
        });
      });
    }, 45);
  }
  function compare(root, state, on) {
    var old = root.querySelector('.itstudio-original'); if (old) old.remove();
    root.classList.toggle('is-comparing', on);
    if (!on) return;
    var clone = root.querySelector('[data-r="photowrap"]').cloneNode(true);
    clone.classList.add('itstudio-original'); clone.setAttribute('aria-hidden', 'true');
    clone.querySelectorAll('[data-r], [data-ci], [data-cell]').forEach(function (e) {
      var i = e.hasAttribute('data-ci') ? +e.getAttribute('data-ci') : state.adjSel;
      var src = state.origPhotos && state.origPhotos[i] || state.photos[i];
      if (e.matches('.itded__photo')) e.style.backgroundImage = 'url("' + src + '")';
      var img = e.querySelector('.itcellimg'); if (img) img.src = src;
      e.style.filter = 'none'; e.removeAttribute('data-r'); e.removeAttribute('data-ci'); e.removeAttribute('data-cell');
    });
    clone.removeAttribute('data-r');
    clone.querySelectorAll('.itded__photofx, .itcellfx').forEach(function (e) { e.remove(); });
    root.querySelector('[data-r="stage"]').appendChild(clone);
  }
  function reset(root) { if (window.ItdBeautyEditor) window.ItdBeautyEditor.close(); if (window.ItdDevelopControls) window.ItdDevelopControls.close(); if (window.ItdPrecisionEditor) window.ItdPrecisionEditor.close(); generation++; clearTimeout(timer); cache.clear(); if (root) compare(root, {}, false); }
  window.ItdStudioPreview = { update: update, compare: compare, reset: reset };
})();
