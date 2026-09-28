/* T-915: view-only zoom and non-destructive, per-photo local adjustments. */
(function () {
  'use strict';
  var session = null;
  function range(key, name, min, max, value) {
    return '<label><span>' + name + '</span><input type="range" data-precision="' + key + '" aria-label="' + name + '" min="' + min + '" max="' + max + '" value="' + value + '"><output>' + value + '</output></label>';
  }
  function markup() {
    return '<header><div><b>정밀 편집</b><small>터치 성형 · 잡티 복제 · 부분 색감</small></div><button data-precision-action="cancel">취소</button><button data-precision-action="apply" disabled>적용</button></header>' +
      '<div class="itprecision-work"><div class="itprecision-viewport"><div class="itprecision-image"><img data-precision-base alt=""><canvas data-precision-photo></canvas><canvas data-precision-mask></canvas><span class="itprecision-cursor" hidden></span></div></div>' +
      '<aside>' + window.ItdRetouchControls.markup() + '<div class="itprecision-modes" data-local-control><button data-precision-mode="brush" aria-pressed="true">브러시</button><button data-precision-mode="erase" aria-pressed="false">선택 지우기</button><button data-precision-mode="pan" aria-pressed="false">이동</button></div>' +
      range('force', '브러시 강도', 1, 100, 35) + range('zoom', '화면 확대', 100, 400, 100) + range('radius', '브러시 크기', 1, 30, 8) + range('softness', '경계 부드럽게', 0, 100, 70) +
      '<div class="itprecision-actions"><button data-precision-action="mask" aria-pressed="true">선택 영역 표시</button><button data-precision-action="undo">되돌리기</button><button data-precision-action="redo">다시 실행</button><button data-precision-action="clear">선택 초기화</button></div>' +
      '<div data-local-control><h3>선택한 곳 보정</h3>' + range('exposure', '부분 밝기', -100, 100, 25) + range('shadows', '부분 어두운 영역', -100, 100, 0) +
      range('temperature', '부분 색온도', -100, 100, 0) + range('detail', '부분 선명도', 0, 100, 0) + range('smooth', '질감 부드럽게', 0, 100, 0) +
      '</div><p data-precision-status role="status">사진을 불러오는 중…</p></aside></div>';
  }
  function close() {
    var s = session; if (!s) return;
    session = null; clearTimeout(s.timer); cancelAnimationFrame(s.frame);
    s.node.remove(); if (s.opener && s.opener.isConnected) s.opener.focus();
  }
  function message(s, text) { s.node.querySelector('[data-precision-status]').textContent = text; }
  function resized(s) {
    var box = s.viewport.getBoundingClientRect();
    var scale = Math.min((box.width - 24) / s.img.width, (box.height - 24) / s.img.height);
    s.baseWidth = Math.max(40, s.img.width * scale); s.baseHeight = Math.max(40, s.img.height * scale);
    zoom(s, s.zoom || 1);
  }
  function zoom(s, amount) {
    var old = s.zoom || 1, x = (s.viewport.scrollLeft + s.viewport.clientWidth / 2) / old;
    var y = (s.viewport.scrollTop + s.viewport.clientHeight / 2) / old;
    s.zoom = amount; s.surface.style.width = s.baseWidth * amount + 'px'; s.surface.style.height = s.baseHeight * amount + 'px';
    s.viewport.scrollLeft = x * amount - s.viewport.clientWidth / 2; s.viewport.scrollTop = y * amount - s.viewport.clientHeight / 2;
  }
  function paintMask(s) {
    if (!s.img || session !== s) return;
    var cv = window.ItdLocalAdjustments.mask(s.photo.width, s.photo.height, s.draft);
    var c = cv.getContext('2d'); c.globalCompositeOperation = 'source-in'; c.fillStyle = 'rgba(224,80,104,.45)'; c.fillRect(0, 0, cv.width, cv.height);
    s.mask.width = cv.width; s.mask.height = cv.height; s.mask.getContext('2d').drawImage(cv, 0, 0);
    s.mask.style.opacity = s.scope === 'local' && s.showMask && !s.comparing ? '1' : '0';
    window.ItdRetouchControls.sync(s);
  }
  function render(s, live) {
    if (session !== s || !s.img) return;
    try {
      var a = Object.assign({}, s.before, { local: s.draft, retouch: s.retouch });
      var edge = live ? 640 : 1200;
      var cv = window.ItdPhotoLab.render(s.img, s.comparing ? {} : a, edge);
      s.photo.width = cv.width; s.photo.height = cv.height; s.photo.getContext('2d').drawImage(cv, 0, 0);
      s.photo.style.filter = s.comparing ? 'none' : s.api.filter(a);
      updateBase(s, a, edge); paintMask(s);
      message(s, window.ItdRetouchControls.description(s));
    } catch (e) { console.warn('[PhotoStudio] local preview failed', e); message(s, '사진 보정을 표시하지 못했어요. 취소 후 다시 열어 주세요.'); }
  }
  function updateBase(s, a, edge) {
    var base = s.node.querySelector('[data-precision-base]');
    if (!s.fgImage || s.comparing) {
      base.src = s.img.src;
      [s.photo, s.mask].forEach(function (el) { el.style.maskImage = ''; el.style.webkitMaskImage = ''; }); return;
    }
    base.src = window.ItdPhotoLab.render(s.img, { regions: a.regions, retouch: a.retouch }, edge).toDataURL();
    var mask = window.ItdRetouchEngine.render(s.fgImage, a.retouch, edge, true).toDataURL();
    [s.photo, s.mask].forEach(function (el) { el.style.maskImage = 'url("' + mask + '")'; el.style.webkitMaskImage = el.style.maskImage; el.style.maskSize = '100% 100%'; el.style.webkitMaskSize = '100% 100%'; });
  }
  function point(s, e) {
    var r = s.surface.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))];
  }
  function cursor(s, e) {
    var ring = s.surface.querySelector('.itprecision-cursor'), r = s.surface.getBoundingClientRect();
    ring.hidden = s.mode === 'pan'; var diameter = s.radius * Math.min(r.width, r.height) * 2;
    ring.style.width = diameter + 'px'; ring.style.height = diameter + 'px';
    ring.style.left = e.clientX - r.left + 'px'; ring.style.top = e.clientY - r.top + 'px';
  }
  function down(s, e) {
    if (!s.img || s.pointer || e.button !== 0) return;
    if (s.comparing) { s.comparing = false; s.node.querySelector('[data-retouch-compare]').setAttribute('aria-pressed', 'false'); render(s); }
    e.preventDefault(); s.mask.setPointerCapture(e.pointerId);
    s.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, left: s.viewport.scrollLeft, top: s.viewport.scrollTop };
    if (s.mode === 'pan') return;
    if (window.ItdRetouchControls.start(s, point(s, e))) return;
    if (s.draft.strokes.length >= 150) { s.pointer = null; message(s, '선택은 최대 150획까지 가능해요. 불필요한 획을 되돌려 주세요.'); return; }
    window.ItdRetouchControls.remember(s);
    s.pointer.stroke = { radius: s.radius, softness: s.softness, erase: s.mode === 'erase', points: [point(s, e)] };
    s.draft.strokes.push(s.pointer.stroke); paintMask(s);
  }
  function move(s, e) {
    cursor(s, e);
    if (!s.pointer || s.pointer.id !== e.pointerId) return;
    e.preventDefault();
    if (s.pointer.retouch) { window.ItdRetouchControls.move(s, point(s, e)); return; }
    if (!s.pointer.stroke) {
      s.viewport.scrollLeft = s.pointer.left - e.clientX + s.pointer.x; s.viewport.scrollTop = s.pointer.top - e.clientY + s.pointer.y; return;
    }
    var pts = s.pointer.stroke.points, p = point(s, e), last = pts[pts.length - 1];
    if (pts.length < 2000 && Math.hypot(p[0] - last[0], p[1] - last[1]) > .001) pts.push(p);
    cancelAnimationFrame(s.frame); s.frame = requestAnimationFrame(function () { paintMask(s); });
  }
  function up(s, e) {
    if (!s.pointer || s.pointer.id !== e.pointerId) return;
    if (e.type === 'pointercancel' && (s.pointer.stroke || s.pointer.retouch)) { window.ItdRetouchControls.history(s, false); s.future = []; }
    s.pointer = null; cancelAnimationFrame(s.frame); s.framePending = false; render(s);
  }
  function apply(s) {
    if (s.pointer || !s.img || s.state !== s.api.state() || s.state._cancelled) return;
    var a = Object.assign({}, s.before);
    if (s.draft.strokes.length) a.local = window.ItdLocalAdjustments.clean(s.draft); else delete a.local;
    if (s.retouch.ops.length) a.retouch = window.ItdRetouchEngine.clean(s.retouch); else delete a.retouch;
    s.state.adj[s.idx] = a; s.api.commit(s.idx, s.before); s.api.refresh(); close();
  }
  function action(s, e) {
    var button = e.target.closest('button'); if (!button) return;
    if (window.ItdRetouchControls.action(s, button)) return;
    var mode = button.dataset.precisionMode, act = button.dataset.precisionAction;
    if (mode) {
      window.ItdRetouchControls.mode(s, mode); s.mode = mode; s.mask.style.cursor = mode === 'pan' ? 'grab' : 'crosshair';
      s.node.querySelectorAll('[data-precision-mode]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === button)); });
    }
    if (act === 'cancel') close();
    if (act === 'apply') apply(s);
    if (act === 'mask') { s.mask.hidden = false; s.showMask = !s.showMask; s.mask.style.opacity = s.showMask ? '1' : '0'; button.setAttribute('aria-pressed', String(s.showMask)); }
  }
  function input(s, e) {
    var k = e.target.dataset.precision; if (!k) return;
    var v = Number(e.target.value); e.target.nextElementSibling.textContent = v;
    if (k === 'force') { s.force = v / 100; return; }
    if (k === 'zoom') { zoom(s, v / 100); return; }
    if (k === 'radius') { s.radius = Math.max(s.scope === 'local' ? .003 : .008, v / 200); return; }
    if (k === 'softness') { s.softness = v / 100; return; }
    if (!s.sliderGesture) { window.ItdRetouchControls.remember(s); s.sliderGesture = true; }
    s.draft[k] = v; clearTimeout(s.timer); s.timer = setTimeout(function () { render(s); }, 65);
  }
  function keys(s, e) {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); window.ItdRetouchControls.history(s, e.shiftKey); }
    if (e.key !== 'Tab') return;
    var all = Array.from(s.node.querySelectorAll('button:not(:disabled), input')).filter(function (el) { return el.getClientRects().length; }), first = all[0], last = all[all.length - 1];
    if (e.shiftKey && e.target === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && e.target === last) { e.preventDefault(); first.focus(); }
  }
  function bind(s) {
    s.node.addEventListener('click', function (e) { action(s, e); });
    s.node.addEventListener('change', function () { s.sliderGesture = false; });
    s.node.addEventListener('input', function (e) { input(s, e); });
    s.node.addEventListener('keydown', function (e) { keys(s, e); }, true);
    s.mask.addEventListener('pointerdown', function (e) { down(s, e); });
    s.mask.addEventListener('pointerleave', function () { s.surface.querySelector('.itprecision-cursor').hidden = true; });
    s.mask.addEventListener('pointermove', function (e) { move(s, e); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (event) { s.mask.addEventListener(event, function (e) { up(s, e); }); });
  }
  function open(root, api) {
    close(); var state = api.state(); if (!state || state._saving) return;
    var idx = state.adjSel, before = Object.assign({}, state.adj[idx]);
    var node = document.createElement('section'); node.className = 'itprecision'; node.setAttribute('role', 'dialog'); node.setAttribute('aria-modal', 'true'); node.setAttribute('aria-label', '터치 성형 및 정밀 편집'); node.innerHTML = markup();
    var s = { node: node, api: api, state: state, idx: idx, before: before, draft: window.ItdLocalAdjustments.clean(before.local), mode: 'brush', radius: .04, softness: .7, showMask: true, opener: document.activeElement };
    session = s; root.appendChild(node);
    s.viewport = node.querySelector('.itprecision-viewport'); s.surface = node.querySelector('.itprecision-image'); s.photo = node.querySelector('[data-precision-photo]'); s.mask = node.querySelector('[data-precision-mask]');
    ['exposure', 'shadows', 'temperature', 'detail', 'smooth'].forEach(function (k) { var input = node.querySelector('[data-precision="' + k + '"]'); input.value = s.draft[k]; input.nextElementSibling.textContent = s.draft[k]; });
    s.render = function (live) { render(s, live); }; s.message = function (text) { message(s, text); };
    window.ItdRetouchControls.ready(s); bind(s); node.querySelector('button').focus();
    Promise.all([api.load(state.photos[idx]), state.fgMask && state.fgMask[idx] ? api.load(state.fgMask[idx]) : Promise.resolve(null)]).then(function (images) {
      var img = images[0]; s.fgImage = images[1];
      if (session !== s) return;
      if (!img) { message(s, '사진을 불러오지 못했어요. 취소 후 다시 열어 주세요.'); return; }
      s.img = img;
      node.querySelector('[data-precision-base]').src = img.src;
      resized(s); render(s); node.querySelector('[data-precision-action="apply"]').disabled = false;
    }).catch(function (e) { console.warn('[PhotoStudio] local photo unavailable', e); if (session === s) message(s, '사진을 불러오지 못했어요.'); });
  }
  window.addEventListener('resize', function () { if (session && session.img) resized(session); });
  window.ItdPrecisionEditor = { open: open, close: close };
})();
