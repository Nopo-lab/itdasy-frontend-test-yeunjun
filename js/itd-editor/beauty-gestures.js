/* Pointer drawing, pan/zoom, and image-relative brush coordinates. */
(function () {
  'use strict';
  function point(s, e) {
    var b = s.surface.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)), Math.max(0, Math.min(1, (e.clientY - b.top) / b.height))];
  }
  function cursor(s, e) {
    var b = s.surface.getBoundingClientRect(), ring = s.node.querySelector('.itbeauty-cursor');
    ring.hidden = s.mode === 'pan' || s.tab === 'light';
    var diameter = s.radius * Math.min(b.width, b.height) * 2;
    ring.style.cssText = 'width:' + diameter + 'px;height:' + diameter + 'px;left:' + (e.clientX - b.left) + 'px;top:' + (e.clientY - b.top) + 'px';
  }
  function selection(s, p) {
    var protecting = s.mode === 'protect' || s.mode === 'unprotect', region = protecting ? s.protection : s.region();
    if (!region && s.draft.regions.length >= 12) { s.ensureRegion(); return; }
    if (region && region.strokes.length >= 150) { s.message('이 영역은 150획까지 가능해요. 새 영역을 만들어 주세요.'); return; }
    s.remember(); region = region || s.ensureRegion(); if (!region) return; s.showMask = true; var stroke = { radius: s.radius, softness: .6, erase: s.mode === 'erase' || s.mode === 'unprotect', at: s.draft.retouch.ops.length, opacity: protecting ? 1 : s.strength, points: [p] };
    region.strokes.push(stroke); s.pointer.stroke = stroke; s.pointer.protecting = protecting; s.overlay();
  }
  function retouch(s, p) {
    if (s.mode === 'source') {
      s.source = p; s.mode = 'clone'; var marker = s.node.querySelector('.itbeauty-source'); marker.hidden = false; marker.style.left = p[0] * 100 + '%'; marker.style.top = p[1] * 100 + '%'; s.sync(); return;
    }
    if (s.draft.retouch.ops.length >= 100) { s.message('성형·지우기는 100획까지 가능해요. 되돌린 뒤 이어 주세요.'); return; }
    var source = s.source;
    if (s.mode === 'heal') {
      var cv = window.ItdRetouchEngine.render(s.img, s.draft.retouch, 800), data = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      source = window.ItdHealEngine.source(data, cv.width, cv.height, p, s.radius);
    }
    if (['heal', 'clone'].indexOf(s.mode) >= 0 && !source) { s.message('깨끗한 부분을 복제 원본으로 먼저 찍어 주세요.'); return; }
    s.remember(); var op = { type: s.mode, radius: s.radius, strength: s.strength, points: [p], source: source && source.slice(), protect: JSON.parse(JSON.stringify(s.protection)) };
    s.draft.retouch.ops.push(op); s.pointer.op = op; s.schedule(true);
  }
  function down(s, e) {
    if (!s.img || s.busy || e.button !== 0) return;
    s.touches = s.touches || new Map(); s.touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (s.touches.size === 2) { beginPinch(s, e); return; }
    if (s.pointer || s.pinch) return;
    s.comparing = false; s.node.querySelector('[data-beauty-action="compare"]').setAttribute('aria-pressed', 'false');
    e.preventDefault(); s.mask.setPointerCapture(e.pointerId);
    s.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, left: s.viewport.scrollLeft, top: s.viewport.scrollTop, past: s.past.slice(), future: s.future.slice() };
    if (s.mode === 'pan' || s.tab === 'light') return;
    if (['brush', 'erase', 'protect', 'unprotect'].indexOf(s.mode) >= 0) selection(s, point(s, e));
    else retouch(s, point(s, e));
  }
  function rollback(s, pending) {
    if (!pending || !(pending.stroke || pending.op)) return;
    s.history(false); s.past = pending.past; s.future = pending.future; s.sync();
  }
  function beginPinch(s, e) {
    var pending = s.pointer; s.pointer = null;
    rollback(s, pending);
    var pts = Array.from(s.touches.values());
    s.pinch = { zoom: s.zoom, distance: Math.max(1, Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1])) };
    s.mask.setPointerCapture(e.pointerId); e.preventDefault();
  }
  function move(s, e) {
    if (s.touches && s.touches.has(e.pointerId)) s.touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (s.pinch && s.touches.size >= 2) { var pts = Array.from(s.touches.values()); zoom(s, s.pinch.zoom * Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]) / s.pinch.distance); return; }
    cursor(s, e); var p = s.pointer; if (!p || p.id !== e.pointerId) return;
    if (!p.stroke && !p.op) { s.viewport.scrollLeft = p.left - e.clientX + p.x; s.viewport.scrollTop = p.top - e.clientY + p.y; return; }
    var next = point(s, e), stroke = p.stroke || p.op;
    var last = stroke.points[stroke.points.length - 1];
    if (Math.hypot(next[0] - last[0], next[1] - last[1]) < .002) return;
    if (stroke.points.length >= (p.stroke ? 2000 : 512)) return;
    stroke.points.push(next); if (p.stroke) s.overlay(); else s.schedule(true);
  }
  function end(s, e) {
    if (s.touches) s.touches.delete(e.pointerId);
    if (s.pinch) { if (!s.touches.size) s.pinch = null; return; }
    if (!s.pointer || s.pointer.id !== e.pointerId) return;
    var pending = s.pointer, changed = pending.stroke || pending.op; s.pointer = null;
    if (e.type === 'pointercancel' && changed) rollback(s, pending);
    if (changed) { s.panelDirty = false; s.panel(); } s.render();
  }
  function resize(s) {
    if (!s.img) return;
    var box = s.viewport.getBoundingClientRect(), scale = Math.min((box.width - 24) / s.img.width, (box.height - 24) / s.img.height);
    s.surface.style.width = Math.max(32, s.img.width * scale * s.zoom) + 'px'; s.surface.style.height = Math.max(32, s.img.height * scale * s.zoom) + 'px';
    s.node.querySelector('[data-beauty-zoom]').textContent = Math.round(s.zoom * 100) + '%';
    s.node.querySelector('[data-beauty-action="zoom-out"]').disabled = s.zoom <= 1;
    s.node.querySelector('[data-beauty-action="zoom-in"]').disabled = s.zoom >= 6;
  }
  function zoom(s, value) {
    var old = s.zoom, x = (s.viewport.scrollLeft + s.viewport.clientWidth / 2) / old, y = (s.viewport.scrollTop + s.viewport.clientHeight / 2) / old;
    s.zoom = Math.max(1, Math.min(6, value)); resize(s); s.viewport.scrollLeft = x * s.zoom - s.viewport.clientWidth / 2; s.viewport.scrollTop = y * s.zoom - s.viewport.clientHeight / 2;
  }
  function bind(s) {
    s.mask.addEventListener('pointerdown', function (e) { down(s, e); }); s.mask.addEventListener('pointermove', function (e) { move(s, e); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (event) { s.mask.addEventListener(event, function (e) { end(s, e); }); });
    s.mask.addEventListener('pointerleave', function () { s.node.querySelector('.itbeauty-cursor').hidden = true; });
    s.viewport.addEventListener('wheel', function (e) { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoom(s, s.zoom * (e.deltaY > 0 ? .9 : 1.1)); } }, { passive: false });
  }
  window.ItdBeautyGestures = { bind: bind, resize: resize, zoom: zoom };
})();
