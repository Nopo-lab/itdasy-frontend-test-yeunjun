/* One transactional canvas: AI selection, independent regions, shape and healing. */
(function () {
  'use strict';
  var session = null, nextId = 0;
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function normalized(a) {
    a = clone(a); a.regions = window.ItdRegionEngine.clean(a.regions); a.retouch = window.ItdRetouchEngine.clean(a.retouch); return a;
  }
  function remember(s) {
    s.past.push(JSON.stringify({ edits: s.edits, protections: s.protections, regionId: s.regionId })); s.future = [];
    while (s.past.length > 20 || s.past.length > 1 && s.past.reduce(function (n, v) { return n + v.length; }, 0) > 8000000) s.past.shift();
  }
  function history(s, redo) {
    if (s.busy || s.pointer) return;
    var from = redo ? s.future : s.past, to = redo ? s.past : s.future; if (!from.length) return;
    to.push(JSON.stringify({ edits: s.edits, protections: s.protections, regionId: s.regionId })); var snap = JSON.parse(from.pop());
    s.edits = snap.edits; s.regionId = snap.regionId; s.protections = snap.protections; s.protection = s.protections[s.idx] || (s.protections[s.idx] = { strokes: [] }); s.draft = s.edits[s.idx] || (s.edits[s.idx] = normalized(Object.assign(s.api.defaults(), s.state.adj[s.idx])));
    s.gesture = false; s.panel(); render(s);
  }
  function region(s) {
    var selected = s.draft.regions.find(function (r) { return r.id === s.regionId && r.kind === s.tab; });
    if (!selected) selected = s.draft.regions.find(function (r) { return r.kind === s.tab; });
    s.regionId = selected && selected.id; return selected;
  }
  function createRegion(s, kind, mask) {
    if (s.draft.regions.length >= 12) throw new Error('영역은 사진마다 12개까지 가능해요. 불필요한 영역을 삭제해 주세요.');
    var name = { skin: '피부', hair: '헤어', background: '배경', brush: '부분' }[kind];
    var r = window.ItdRegionEngine.clean([{ id: 'region-' + Date.now() + '-' + (++nextId), name: name + ' ' + (s.draft.regions.length + 1), kind: kind, mask: mask, strokes: [] }])[0];
    s.draft.regions.push(r); s.regionId = r.id; s.mode = 'brush'; return r;
  }
  function tab(s, name) {
    if (s.busy || s.pointer) return;
    s.tab = name; s.gesture = false; s.source = null; s.node.querySelector('.itbeauty-source').hidden = true;
    s.mode = name === 'shape' ? 'push' : name === 'heal' ? 'heal' : name === 'light' ? 'pan' : 'brush';
    s.radius = name === 'heal' ? .02 : name === 'shape' ? .09 : .05; s.strength = name === 'shape' ? .5 : 1;
    var r = s.draft.regions.find(function (item) { return item.kind === name; }); s.regionId = r && r.id;
    s.showMask = name === 'brush'; s.panel(); overlay(s);
    s.message(name === 'shape' ? '사진 위에서 윤곽을 밀어 보세요.' : name === 'heal' ? '잡티 위를 칠하면 주변 질감으로 메워요.' : name === 'brush' ? '사진 위를 칠하고 아래에서 보정하세요.' : '슬라이더를 움직여 보정하세요.');
    var key = s.idx + ':' + name;
    if (s.img && !r && ['skin', 'hair', 'background'].indexOf(name) >= 0 && !s.attempted[key]) { s.attempted[key] = true; automatic(s, true); }
  }
  function overlay(s) {
    if (!s.img || !s.photo.width) return;
    var r = s.tab === 'shape' ? s.protection : region(s), w = s.photo.width, h = s.photo.height;
    s.mask.width = w; s.mask.height = h;
    if (!r || s.comparing || !s.showMask || s.tab === 'light' || s.tab === 'heal') return;
    var cv = window.ItdRegionEngine.mask(w, h, r, s.tab === 'shape' ? null : s.draft.retouch);
    var c = cv.getContext('2d'); c.globalCompositeOperation = 'source-in'; c.fillStyle = s.tab === 'shape' ? 'rgba(73,133,228,.48)' : 'rgba(203,107,68,.35)'; c.fillRect(0, 0, w, h);
    s.mask.getContext('2d').drawImage(cv, 0, 0, w, h);
  }
  function render(s, live) {
    if (session !== s || !s.img) return; clearTimeout(s.timer); s.timer = 0;
    try {
      var a = s.comparing ? {} : s.draft, edge = live ? 640 : 1200, cv = window.ItdPhotoLab.render(s.img, a, edge), c = cv.getContext('2d');
      if (!s.comparing) { var data = c.getImageData(0, 0, cv.width, cv.height); s.api.legacyPixels(data.data, a); c.putImageData(data, 0, 0); }
      if (s.fg && !s.comparing) {
        var mask = window.ItdRetouchEngine.render(s.fg, a.retouch, edge, true), base = window.ItdPhotoLab.render(s.img, { regions: a.regions, retouch: a.retouch }, edge);
        c.globalCompositeOperation = 'destination-in'; c.drawImage(mask, 0, 0); base.getContext('2d').drawImage(cv, 0, 0); cv = base;
      }
      s.photo.width = cv.width; s.photo.height = cv.height; s.photo.getContext('2d').drawImage(cv, 0, 0);
      overlay(s); s.sync();
    } catch (e) { console.warn('[PhotoStudio] beauty render failed', e); s.message('보정을 표시하지 못했어요. 되돌리거나 취소 후 다시 시도해 주세요.'); }
  }
  function close() {
    var s = session; if (!s) return; session = null; s.ticket++; clearTimeout(s.timer); s.observer.disconnect(); s.node.parentElement.removeEventListener('keydown', s.onKey, true); s.node.parentElement.querySelectorAll('[data-studio-workspace]').forEach(function (b) { b.disabled = false; }); s.node.remove();
    if (s.opener && s.opener.isConnected) s.opener.focus();
  }
  async function photo(s, idx) {
    var ticket = ++s.ticket; s.busy = true; s.busyKind = 'photo'; s.idx = idx; s.img = null; s.sync(); s.message('사진을 불러오는 중…');
    try {
      var images = await Promise.all([s.api.load(s.state.photos[idx]), s.state.fgMask && s.state.fgMask[idx] ? s.api.load(s.state.fgMask[idx]) : Promise.resolve(null)]);
      if (session !== s || ticket !== s.ticket) return;
      if (!images[0]) throw new Error('사진을 불러오지 못했어요.');
      s.img = images[0]; s.fg = images[1]; s.draft = s.edits[idx] || (s.edits[idx] = normalized(Object.assign(s.api.defaults(), s.state.adj[idx])));
      s.protection = s.protections[idx] || (s.protections[idx] = { strokes: [] }); s.zoom = 1; s.busy = false; tab(s, s.tab); window.ItdBeautyGestures.resize(s); render(s);
    } catch (e) { console.warn('[PhotoStudio] photo failed', e); if (session === s) { s.busy = false; s.sync(); s.message(e.message); } }
  }
  async function automatic(s, quiet) {
    if (s.tab === 'brush') { remember(s); createRegion(s, 'brush'); s.panel(); return; }
    var ticket = ++s.ticket, kind = s.tab; s.busy = true; s.busyKind = 'selection'; s.sync(); s.message('기기에서 ' + { skin: '피부', hair: '헤어', background: '배경' }[kind] + '를 찾고 있어요…');
    try {
      if (!region(s) && s.draft.regions.length >= 12) throw new Error('영역은 사진마다 12개까지 가능해요. 기존 영역을 삭제해 주세요.');
      var result = await window.ItdAutoSelection.select(s.img); if (session !== s || ticket !== s.ticket) return;
      var coverage = result[kind].reduce(function (sum, n) { return sum + n; }, 0) / (255 * result.w * result.h);
      if (coverage < .002) throw new Error('이 사진에서는 해당 부위를 찾지 못했어요. 브러시로 선택해 주세요.');
      remember(s); var r = region(s);
      if (r) { r.mask = window.ItdAutoSelection.mask(result, kind); r.strokes = []; }
      else createRegion(s, kind, window.ItdAutoSelection.mask(result, kind));
      s.showMask = !quiet; s.message('자동 선택 완료 · 슬라이더로 바로 보정하세요.');
    } catch (e) { console.warn('[PhotoStudio] selection failed', e); if (session === s && ticket === s.ticket) s.message(e.message + ' 브러시 선택은 계속 사용할 수 있어요.'); }
    finally { if (session === s && ticket === s.ticket) { s.busy = false; s.panel(); render(s); } }
  }
  async function recipe(s, batch) {
    var ticket = ++s.ticket; s.busy = true; s.busyKind = 'recipe'; s.sync();
    try {
      var preset = batch ? window.ItdBeautyRecipes.capture(s.draft, s.img) : window.ItdBeautyRecipes.read(), edits = Object.assign({}, s.edits);
      var indices = batch ? s.state.photos.map(function (_v, i) { return i; }) : [s.idx];
      for (var i = 0; i < indices.length; i++) {
        var idx = indices[i]; if (batch && idx === s.idx) continue; s.message('보정 적용 중 ' + (i + 1) + ' / ' + indices.length);
        var img = idx === s.idx ? s.img : await s.api.load(s.state.photos[idx]);
        if (session !== s || ticket !== s.ticket) return;
        if (!img) throw new Error('사진을 불러오지 못했어요.');
        edits[idx] = await window.ItdBeautyRecipes.apply(normalized(edits[idx] || Object.assign(s.api.defaults(), s.state.adj[idx])), img, preset, { matchLighting: !!s.matchLighting });
        if (session !== s || ticket !== s.ticket) return;
      }
      remember(s); s.edits = edits; s.draft = edits[s.idx]; s.message(batch ? '모든 사진에 적용했어요. 사진을 넘겨 결과를 확인하세요.' : '저장한 보정을 적용했어요.');
    } catch (e) { console.warn('[PhotoStudio] recipe failed', e); if (session === s) s.message(e.message + ' 기존 편집은 유지돼요.'); }
    finally { if (session === s && ticket === s.ticket) { s.busy = false; s.panel(); render(s); } }
  }
  function apply(s) {
    if (s.busy || s.pointer || !s.img || s.state !== s.api.state() || s.state._cancelled) return;
    if (s.state.adjSel !== s.idx && s.api.selectPhoto) s.api.selectPhoto(s.idx);
    Object.keys(s.edits).forEach(function (idx) {
      var before = s.state.adj[idx] || s.api.defaults(), after = normalized(s.edits[idx]);
      if (!after.regions.length) delete after.regions; if (!after.retouch.ops.length) delete after.retouch;
      if (JSON.stringify(before) !== JSON.stringify(after)) { s.state.adj[idx] = after; delete s.state.presetByPhoto[String(idx)]; s.api.commit(Number(idx), before); }
    }); s.api.refresh(); close(); return true;
  }
  function action(s, e) {
    var b = e.target.closest('button'); if (!b) return;
    var a = b.dataset.beautyAction;
    if (a === 'cancel') { close(); return; }
    if (b.dataset.beautyTab && s.busyKind === 'selection' && s.busy) { delete s.attempted[s.idx + ':' + s.tab]; s.ticket++; s.busy = false; }
    if (s.busy || s.pointer) return;
    if (b.dataset.beautyTab) { tab(s, b.dataset.beautyTab); return; }
    if (b.dataset.beautyMode) { s.mode = b.dataset.beautyMode; if (['brush', 'erase', 'protect', 'unprotect'].indexOf(s.mode) >= 0) s.showMask = true; s.sync(); overlay(s); return; }
    if (b.dataset.beautyRegion) { s.regionId = b.dataset.beautyRegion; s.panel(); overlay(s); return; }
    if (a === 'analysis') { var parent = s.node.parentElement, api = s.api; if (apply(s)) window.ItdDevelopControls.open(parent, api); }
    else if (a === 'apply') apply(s);
    else if (a === 'auto') automatic(s);
    else if (a === 'next' || a === 'previous') photo(s, s.idx + (a === 'next' ? 1 : -1));
    else if (a === 'undo' || a === 'redo') history(s, a === 'redo');
    else if (a === 'compare') { s.comparing = !s.comparing; b.setAttribute('aria-pressed', String(s.comparing)); render(s); }
    else if (a === 'zoom-fit') window.ItdBeautyGestures.zoom(s, 1);
    else if (a === 'zoom-in' || a === 'zoom-out') window.ItdBeautyGestures.zoom(s, s.zoom + (a === 'zoom-in' ? .5 : -.5));
    else if (a === 'pan') { s.mode = s.mode === 'pan' ? (s.tab === 'shape' ? 'push' : s.tab === 'heal' ? 'heal' : 'brush') : 'pan'; b.setAttribute('aria-pressed', String(s.mode === 'pan')); s.sync(); }
    else if (a === 'load-recipe' || a === 'batch') recipe(s, a === 'batch');
    else editAction(s, a);
  }
  function editAction(s, a) {
    try {
      if (a === 'save-recipe') { window.ItdBeautyRecipes.save(s.draft, s.img); s.message('색감·곡선·자동 부위 보정을 저장했어요. 수동 붓질·성형·잡티 위치는 제외돼요.'); return; }
      if (a === 'overlay') { s.showMask = !s.showMask; overlay(s); s.sync(); return; }
      if (a === 'new' && s.draft.regions.length >= 12) throw new Error('영역은 사진마다 12개까지 가능해요. 기존 영역을 삭제해 주세요.');
      remember(s); var r = region(s);
      if (a === 'new') { createRegion(s, s.tab); s.showMask = true; }
      if (a === 'toggle' && r) r.enabled = !r.enabled;
      if (a === 'remove' && r) { s.draft.regions = s.draft.regions.filter(function (item) { return item !== r; }); s.regionId = null; }
      if (a === 'protect-clear') s.protection = s.protections[s.idx] = { strokes: [] };
      s.panel(); render(s);
    } catch (e) { console.warn('[PhotoStudio] edit failed', e); s.message(e.message); }
  }
  function ensureRegion(s) {
    if (region(s)) return region(s);
    if (s.draft.regions.length >= 12) { s.message('영역은 사진마다 12개까지 가능해요. 기존 영역을 선택하거나 삭제해 주세요.'); return null; }
    s.panelDirty = true; return createRegion(s, s.tab);
  }
  function input(s, e) {
    if (s.busy) return; var el = e.target;
    if (el.hasAttribute('data-beauty-match-lighting')) { s.matchLighting = el.checked; return; }
    var k = el.dataset.beautyValue, setting = el.dataset.beautySetting, v = Number(el.value);
    if (setting) { if (setting === 'radius') s.radius = v / 200; else s.strength = v / 100; el.nextElementSibling.textContent = v; return; }
    if (!k) return;
    if (s.tab !== 'light' && !region(s) && s.draft.regions.length >= 12) { ensureRegion(s); s.sync(); return; }
    if (!s.gesture) { remember(s); s.gesture = true; }
    var target = s.tab === 'light' ? s.draft : ensureRegion(s); if (!target) { s.sync(); return; } target[k] = v; delete s.draft.labLook;
    s.comparing = false; s.showMask = false; el.nextElementSibling.textContent = v; s.sync(); s.schedule();
  }
  function changed(s, e) {
    s.gesture = false; if (!s.panelDirty) return; s.panelDirty = false;
    var key = e.target.dataset.beautyValue; s.panel();
    if (key) { var control = s.controls.querySelector('[data-beauty-value="' + key + '"]'); if (control) control.focus({ preventScroll: true }); }
  }
  function keys(s, e) {
    e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); close(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); history(s, e.shiftKey); }
    if (e.key !== 'Tab') return;
    var all = Array.from(s.node.querySelectorAll('button:not(:disabled), input:not(:disabled), summary')).concat(Array.from(s.node.parentElement.querySelectorAll('[data-studio-workspace]:not(:disabled)'))).filter(function (el) { return el.getClientRects().length; });
    if (!all.length) return; e.preventDefault();
    var index = all.indexOf(e.target), step = e.shiftKey ? -1 : 1; all[(index + step + all.length) % all.length].focus();
  }
  function open(root, api, initialTab) {
    close(); var state = api.state(); if (!state || state._saving) return;
    var node = document.createElement('section'); node.className = 'itbeauty'; node.setAttribute('role', 'dialog'); node.setAttribute('aria-modal', 'false'); node.setAttribute('aria-label', '사진 편집'); node.innerHTML = window.ItdBeautyControls.markup();
    var s = { node: node, api: api, state: state, idx: state.adjSel, edits: {}, tab: initialTab || 'skin', past: [], future: [], attempted: {}, ticket: 0, zoom: 1, radius: .05, strength: .5, showMask: true, protection: { strokes: [] }, protections: {}, opener: document.activeElement };
    s.draft = normalized(Object.assign(api.defaults(), state.adj[s.idx])); s.edits[s.idx] = s.draft; session = s; root.appendChild(node);
    s.viewport = node.querySelector('.itbeauty-viewport'); s.surface = node.querySelector('.itbeauty-image'); s.controls = node.querySelector('.itbeauty-controls'); s.photo = node.querySelector('[data-beauty-photo]'); s.mask = node.querySelector('[data-beauty-mask]');
    s.message = function (text) { if (session === s) node.querySelector('[data-beauty-status]').textContent = text; };
    s.region = function () { return region(s); }; s.ensureRegion = function () { return ensureRegion(s); }; s.remember = function () { remember(s); }; s.history = function (redo) { history(s, redo); };
    s.panel = function () { window.ItdBeautyControls.panel(s); }; s.sync = function () { window.ItdBeautyControls.sync(s); };
    s.render = function (live) { render(s, live); }; s.overlay = function () { overlay(s); }; s.schedule = function (live) { if (live && s.timer) return; clearTimeout(s.timer); s.timer = setTimeout(function () { s.timer = 0; render(s, live); }, live ? 35 : 75); };
    node.addEventListener('click', function (e) { action(s, e); }); node.addEventListener('input', function (e) { input(s, e); }); node.addEventListener('change', function (e) { changed(s, e); }); s.onKey = function (e) { keys(s, e); }; root.addEventListener('keydown', s.onKey, true);
    window.ItdBeautyGestures.bind(s); s.observer = new ResizeObserver(function () { window.ItdBeautyGestures.resize(s); }); s.observer.observe(s.viewport);
    s.panel(); photo(s, s.idx); node.querySelector('button').focus();
  }
  function leave() {
    var s = session; if (!s) return true;
    if (s.busy && s.busyKind === 'selection') { s.ticket++; s.busy = false; }
    return !!apply(s);
  }
  window.ItdBeautyEditor = { open: open, close: close, leave: leave };
})();
