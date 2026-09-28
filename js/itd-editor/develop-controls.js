/* T-915: dedicated photographic workspace. Draft edits commit once; cancel is lossless. */
(function () {
  'use strict';
  var session = null, clipboard = null;
  var GROUPS = {
    light: [['exposure', '노출'], ['b', '밝기', 60, 140, 100], ['c', '대비', 60, 140, 100], ['highlights', '밝은 영역'], ['shadows', '어두운 영역'], ['whites', '흰색'], ['blacks', '검정']],
    color: [['temperature', '색온도'], ['s', '채도', 0, 200, 100], ['tint', '색조'], ['vibrance', '생동감']],
    curve: [['curve1', '어두운 톤'], ['curve2', '중간 어두운 톤'], ['curve3', '중간 밝은 톤'], ['curve4', '밝은 톤']],
    detail: [['detail', '윤곽 선명도', 0], ['clarity', '명료도'], ['denoise', '노이즈 감소', 0], ['vignette', '주변부 어둡게']]
  };
  function range(k, label, min, max, v) {
    return '<label><span>' + label + '</span><input type="range" data-develop="' + k + '" aria-label="' + label + '" min="' + min + '" max="' + max + '" value="' + v + '"><button data-zero="' + k + '" aria-label="' + label + ' 초기화">' + v + '</button></label>';
  }
  function tools() {
    return Object.keys(GROUPS).map(function (g) {
      var html = '<section data-develop-group="' + g + '"' + (g === 'light' ? '' : ' hidden') + '>';
      if (g === 'curve') html += '<svg class="itdevelop-curve" viewBox="0 0 240 140" aria-label="밝기 곡선: 아래 조절 막대로 점을 조절하세요"><path class="grid" d="M0 28H240M0 56H240M0 84H240M0 112H240M48 0V140M96 0V140M144 0V140M192 0V140"/><path class="reference" d="M0 140L240 0"/><path data-curve-line/>' + [1, 2, 3, 4].map(function (n) { return '<circle data-curve-point="' + n + '" r="7"/>'; }).join('') + '</svg><p>점을 위로 올리면 밝아져요. 좌우는 어두운 톤부터 밝은 톤 순서예요.</p>';
      if (g === 'color') html += '<button data-develop-action="picker" aria-pressed="false">흰색 기준 찍기</button><p>사진 속 흰색·회색 물체를 찍어 조명의 색을 맞추세요.</p>';
      html += GROUPS[g].map(function (c) { return range(c[0], c[1], c[2] == null ? -100 : c[2], c[3] == null ? 100 : c[3], c[4] || 0); }).join('');
      if (g === 'detail') html += '<p>명료도는 결의 대비, 노이즈 감소는 자잘한 입자를 조절해요. 주변부는 원본 사진의 가장자리를 기준으로 해요.</p>';
      return html + '</section>';
    }).join('');
  }
  function markup() {
    return '<header><div><b>곡선 · 색상 분석</b><small>곡선과 흰색 기준으로 세밀하게</small></div><button data-develop-action="cancel">취소</button><button data-develop-action="apply" disabled>적용</button></header>' +
      '<div class="itdevelop-work"><div class="itdevelop-main"><div class="itdevelop-viewport"><div class="itdevelop-image"><canvas data-develop-photo></canvas><canvas data-develop-original></canvas><canvas data-develop-clipping hidden></canvas></div></div>' +
      '<div class="itdevelop-view"><label>확대 <input type="range" data-view="zoom" aria-label="작업실 화면 확대" min="100" max="400" value="100"><output>100%</output></label><button data-develop-action="compare" aria-pressed="false">분할 비교</button><label data-wipe-control hidden>원본 <input type="range" data-view="wipe" aria-label="전후 비교 경계" min="0" max="100" value="50">편집</label></div></div>' +
      '<aside><div class="itdevelop-meter"><canvas width="256" height="55" data-histogram aria-label="밝기 분포"></canvas><div><span data-meter-text></span><button data-develop-action="clipping" aria-pressed="false">손실 표시</button></div></div>' +
      '<nav aria-label="작업실 보정 종류">' + [['light', '빛'], ['color', '색감'], ['mixer', '색상별'], ['curve', '곡선'], ['detail', '디테일']].map(function (c) { return '<button data-develop-tab="' + c[0] + '" aria-pressed="' + (c[0] === 'light') + '">' + c[1] + '</button>'; }).join('') + '</nav>' + tools() +
      '<section data-develop-group="mixer" hidden><div class="itdevelop-swatches">' + window.ItdDevelopEngine.colors.map(function (c) { return '<button data-channel="' + c[0] + '" aria-label="' + c[1] + ' 계열" aria-pressed="' + (c[0] === 'red') + '" style="--swatch:hsl(' + c[2] + ' 65% 55%)"></button>'; }).join('') +
      '</div><h3 data-channel-name>빨강 계열</h3>' + ['H', 'S', 'L'].map(function (k, i) { return range('red' + k, ['색상 이동', '색의 진하기', '색의 밝기'][i], -100, 100, 0); }).join('') + '<p>선택한 색 계열 전체에 적용돼요. 피부·머리카락 자동 선택은 아니에요.</p></section>' +
      '<div class="itdevelop-history"><button data-develop-action="undo">되돌리기</button><button data-develop-action="redo">다시 실행</button><button data-develop-action="reset">이 탭 초기화</button></div>' +
      '<div class="itdevelop-copy"><button data-develop-action="copy">보정값 복사</button><button data-develop-action="paste">붙여넣기</button></div><p data-develop-status role="status">사진을 불러오는 중…</p></aside></div>';
  }
  function close() { var s = session; if (!s) return; session = null; clearTimeout(s.timer); s.node.remove(); if (s.opener && s.opener.isConnected) s.opener.focus(); }
  function message(s, text) { s.node.querySelector('[data-develop-status]').textContent = text; }
  function remember(s) { s.past.push(Object.assign({}, s.draft)); if (s.past.length > 30) s.past.shift(); s.future = []; }
  function history(s, redo) {
    var from = redo ? s.future : s.past, to = redo ? s.past : s.future; if (!from.length) return;
    to.push(Object.assign({}, s.draft)); s.draft = from.pop(); s.gesture = false; sync(s); schedule(s);
  }
  function sync(s) {
    s.node.querySelectorAll('[data-develop]').forEach(function (input) { var k = input.dataset.develop, v = ['b', 'c', 's'].indexOf(k) >= 0 ? s.draft[k] : window.ItdPhotoLab.value(s.draft, k); input.value = v; input.nextElementSibling.textContent = v; });
    s.node.querySelector('[data-develop-action="undo"]').disabled = !s.past.length;
    s.node.querySelector('[data-develop-action="redo"]').disabled = !s.future.length;
    s.node.querySelector('[data-develop-action="paste"]').disabled = !clipboard;
    var points = window.ItdDevelopEngine.curve(s.draft);
    s.node.querySelector('[data-curve-line]').setAttribute('d', points.map(function (v, i) { return (i ? 'L' : 'M') + i * 48 + ' ' + (1 - v) * 140; }).join(' '));
    s.node.querySelectorAll('[data-curve-point]').forEach(function (c) { var i = +c.dataset.curvePoint; c.setAttribute('cx', i * 48); c.setAttribute('cy', (1 - points[i]) * 140); });
  }
  function schedule(s) { clearTimeout(s.timer); s.timer = setTimeout(function () { render(s); }, 70); }
  function baked(s) {
    var cv = window.ItdPhotoLab.render(s.img, s.draft, 1200), c = cv.getContext('2d'), data = c.getImageData(0, 0, cv.width, cv.height);
    s.api.legacyPixels(data.data, s.draft); c.putImageData(data, 0, 0);
    if (!s.fg) return cv;
    var mask = window.ItdRetouchEngine.render(s.fg, s.draft.retouch, 1200, true);
    c.globalCompositeOperation = 'destination-in'; c.drawImage(mask, 0, 0, cv.width, cv.height); c.globalCompositeOperation = 'source-over';
    var base = window.ItdPhotoLab.render(s.img, { regions: s.draft.regions, retouch: s.draft.retouch }, 1200); base.getContext('2d').drawImage(cv, 0, 0); return base;
  }
  function meter(s) {
    var data = s.photo.getContext('2d').getImageData(0, 0, s.photo.width, s.photo.height), stats = window.ItdDevelopEngine.histogram(data.data);
    var cv = s.node.querySelector('[data-histogram]'), c = cv.getContext('2d'), peak = Math.max.apply(null, stats.bins) || 1;
    c.clearRect(0, 0, cv.width, cv.height); c.fillStyle = '#718064';
    stats.bins.forEach(function (n, i) { var h = Math.log(1 + n) / Math.log(1 + peak) * 52; c.fillRect(i * 4, 55 - h, 3, h); });
    s.node.querySelector('[data-meter-text]').textContent = '검정 손실 ' + (stats.dark * 100).toFixed(1) + '% · 흰색 손실 ' + (stats.light * 100).toFixed(1) + '%';
    var clip = s.node.querySelector('[data-develop-clipping]'); clip.width = s.photo.width; clip.height = s.photo.height;
    for (var i = 0; i < data.data.length; i += 4) {
      var white = Math.max(data.data[i], data.data[i + 1], data.data[i + 2]) >= 253;
      var black = Math.min(data.data[i], data.data[i + 1], data.data[i + 2]) <= 2;
      var alpha = data.data[i + 3]; data.data.set([white ? 255 : 30, 35, white ? 35 : 255, alpha && (white || black) ? 180 : 0], i);
    }
    clip.getContext('2d').putImageData(data, 0, 0);
  }
  function render(s) {
    if (session !== s || !s.img) return;
    try {
      var cv = baked(s); s.photo.width = cv.width; s.photo.height = cv.height; s.photo.getContext('2d').drawImage(cv, 0, 0);
      meter(s); sync(s); message(s, s.picker ? '사진 속 흰색·회색 부분을 찍어 주세요. 너무 밝거나 어두운 곳은 피하세요.' : '원본은 보관돼요. 적용을 누르면 현재 사진에 반영돼요.');
    } catch (e) { console.warn('[PhotoStudio] develop preview failed', e); message(s, '보정을 표시하지 못했어요. 취소 후 다시 열어 주세요.'); }
  }
  function resize(s) {
    if (!s.img) return;
    var b = s.viewport.getBoundingClientRect(), scale = Math.min((b.width - 24) / s.img.width, (b.height - 24) / s.img.height);
    s.surface.style.width = Math.max(40, s.img.width * scale) * s.zoom + 'px'; s.surface.style.height = Math.max(40, s.img.height * scale) * s.zoom + 'px';
  }
  function compare(s) {
    s.node.querySelector('[data-develop-original]').hidden = !s.compare;
    s.node.querySelector('[data-develop-original]').style.clipPath = 'inset(0 ' + (100 - s.wipe) + '% 0 0)';
    s.node.querySelector('[data-wipe-control]').hidden = !s.compare;
    s.node.querySelector('[data-develop-action="compare"]').setAttribute('aria-pressed', String(s.compare));
    s.node.querySelector('[data-develop-clipping]').hidden = !s.clipping || s.compare;
  }
  function apply(s) {
    if (!s.img || s.state !== s.api.state() || s.state._cancelled || s.state._saving) return;
    s.state.adj[s.idx] = Object.assign({}, s.draft); delete s.state.presetByPhoto[String(s.idx)];
    s.api.commit(s.idx, s.before); s.api.refresh(); close();
  }
  function copyTone(s) {
    var keys = ['b', 'c', 's', 'w', 'sh'].concat(window.ItdPhotoLab.keys);
    clipboard = {}; keys.forEach(function (k) { clipboard[k] = Number(s.draft[k]) || 0; });
    sync(s); message(s, '보정값을 복사했어요. 다른 사진에 붙여넣어도 브러시·성형·구도는 유지돼요.');
  }
  function chooseTab(s, tab) {
    s.tab = tab; s.picker = false; s.surface.classList.remove('is-picking'); s.node.querySelector('[data-develop-action="picker"]').setAttribute('aria-pressed', 'false');
    s.node.querySelectorAll('[data-develop-tab]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.developTab === tab)); });
    s.node.querySelectorAll('[data-develop-group]').forEach(function (el) { el.hidden = el.dataset.developGroup !== tab; });
  }
  function chooseColor(s, channel) {
    s.channel = channel;
    s.node.querySelectorAll('[data-channel]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.channel === channel)); });
    s.node.querySelector('[data-channel-name]').textContent = window.ItdDevelopEngine.colors.find(function (c) { return c[0] === channel; })[1] + ' 계열';
    s.node.querySelectorAll('[data-develop-group="mixer"] input').forEach(function (input, i) { var k = channel + ['H', 'S', 'L'][i]; input.dataset.develop = k; input.nextElementSibling.dataset.zero = k; }); sync(s);
  }
  function resetTab(s) {
    remember(s);
    var keys = s.tab === 'mixer' ? ['H', 'S', 'L'].map(function (k) { return s.channel + k; }) : GROUPS[s.tab].map(function (c) { return c[0]; });
    keys.forEach(function (k) { s.draft[k] = ['b', 'c', 's'].indexOf(k) >= 0 ? 100 : 0; }); delete s.draft.labLook; sync(s); schedule(s);
  }
  function action(s, e) {
    var b = e.target.closest('button'); if (!b) return; var act = b.dataset.developAction;
    if (b.dataset.developTab) chooseTab(s, b.dataset.developTab);
    if (b.dataset.channel) chooseColor(s, b.dataset.channel);
    if (b.dataset.zero) { remember(s); s.draft[b.dataset.zero] = ['b', 'c', 's'].indexOf(b.dataset.zero) >= 0 ? 100 : 0; delete s.draft.labLook; sync(s); schedule(s); }
    if (act === 'cancel') close();
    if (act === 'apply') apply(s);
    if (act === 'undo' || act === 'redo') history(s, act === 'redo');
    if (act === 'reset') resetTab(s);
    if (act === 'copy') copyTone(s);
    if (act === 'paste' && clipboard) { remember(s); Object.assign(s.draft, clipboard); delete s.draft.labLook; sync(s); schedule(s); }
    if (act === 'compare') { s.compare = !s.compare; compare(s); resize(s); }
    if (act === 'clipping') { s.clipping = !s.clipping; b.setAttribute('aria-pressed', String(s.clipping)); compare(s); }
    if (act === 'picker') { s.picker = !s.picker; s.compare = false; compare(s); b.setAttribute('aria-pressed', String(s.picker)); s.surface.classList.toggle('is-picking', s.picker); message(s, '사진 속 흰색·회색 부분을 찍어 주세요.'); }
  }
  function input(s, e) {
    var k = e.target.dataset.develop, view = e.target.dataset.view;
    if (view === 'zoom') { s.zoom = Number(e.target.value) / 100; e.target.nextElementSibling.textContent = e.target.value + '%'; resize(s); }
    if (view === 'wipe') { s.wipe = Number(e.target.value); compare(s); }
    if (!k) return;
    if (!s.gesture) { remember(s); s.gesture = true; }
    s.draft[k] = Number(e.target.value); delete s.draft.labLook; sync(s); schedule(s);
  }
  function pick(s, e) {
    var b = s.surface.getBoundingClientRect(), x = Math.round((e.clientX - b.left) / b.width * (s.sample.width - 1)), y = Math.round((e.clientY - b.top) / b.height * (s.sample.height - 1));
    var c = s.sample.getContext('2d'), data = c.getImageData(Math.max(0, x - 2), Math.max(0, y - 2), Math.min(5, s.sample.width - Math.max(0, x - 2)), Math.min(5, s.sample.height - Math.max(0, y - 2))).data;
    var rgb = [0, 0, 0], count = 0;
    for (var i = 0; i < data.length; i += 4) { if (data[i + 3] < 200) continue; count++; for (var k = 0; k < 3; k++) rgb[k] += data[i + k]; }
    var sample = new Uint8ClampedArray([count ? rgb[0] / count : 0, count ? rgb[1] / count : 0, count ? rgb[2] / count : 0, 255]);
    window.ItdPhotoLab.tone(sample, Object.assign({}, s.draft, { temperature: 0, tint: 0, vibrance: 0 }));
    var values = count ? window.ItdDevelopEngine.balance(Array.from(sample.slice(0, 3))) : null;
    if (!values) { message(s, '너무 밝거나 어두워요. 색이 보이는 회색·흰색 부분을 골라 주세요.'); return; }
    remember(s); Object.assign(s.draft, values, { w: 0 }); delete s.draft.labLook; s.picker = false; s.surface.classList.remove('is-picking');
    s.node.querySelector('[data-develop-action="picker"]').setAttribute('aria-pressed', 'false'); sync(s); render(s);
  }
  function pointer(s, e) {
    if (!s.img || e.button !== 0) return;
    if (s.picker) { pick(s, e); return; }
    s.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: s.viewport.scrollLeft, top: s.viewport.scrollTop }; s.surface.setPointerCapture(e.pointerId);
  }
  function curvePointer(s, e) {
    var dot = e.target.closest('[data-curve-point]'); if (!dot) return;
    e.preventDefault(); remember(s); s.curveDrag = +dot.dataset.curvePoint; dot.setPointerCapture(e.pointerId);
  }
  function curveMove(s, e) {
    if (!s.curveDrag) return;
    var b = s.node.querySelector('.itdevelop-curve').getBoundingClientRect(), n = s.curveDrag;
    s.draft['curve' + n] = Math.round(Math.max(-100, Math.min(100, ((1 - (e.clientY - b.top) / b.height) - n / 5) / .0018)));
    delete s.draft.labLook; sync(s); schedule(s);
  }
  function keys(s, e) {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); history(s, e.shiftKey); }
    if (e.key !== 'Tab') return;
    var all = Array.from(s.node.querySelectorAll('button:not(:disabled),input')).filter(function (el) { return el.getClientRects().length; });
    if (e.shiftKey && e.target === all[0]) { e.preventDefault(); all[all.length - 1].focus(); }
    else if (!e.shiftKey && e.target === all[all.length - 1]) { e.preventDefault(); all[0].focus(); }
  }
  function bind(s) {
    s.node.addEventListener('click', function (e) { action(s, e); }); s.node.addEventListener('input', function (e) { input(s, e); });
    s.node.addEventListener('change', function () { s.gesture = false; }); s.node.addEventListener('keydown', function (e) { keys(s, e); }, true);
    s.surface.addEventListener('pointerdown', function (e) { pointer(s, e); });
    s.surface.addEventListener('pointermove', function (e) { if (s.drag && s.drag.id === e.pointerId) { s.viewport.scrollLeft = s.drag.left - e.clientX + s.drag.x; s.viewport.scrollTop = s.drag.top - e.clientY + s.drag.y; } });
    var graph = s.node.querySelector('.itdevelop-curve'); graph.addEventListener('pointerdown', function (e) { curvePointer(s, e); }); graph.addEventListener('pointermove', function (e) { curveMove(s, e); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (event) { s.node.addEventListener(event, function () { s.drag = null; s.curveDrag = null; }); });
  }
  function ready(s, images) {
    if (session !== s) return;
    s.img = images[0]; s.fg = images[1]; if (!s.img || (s.maskUrl && !s.fg)) throw new Error('Photo or mask unavailable');
    s.sample = window.ItdRetouchEngine.render(s.img, s.draft.retouch, 1200);
    var original = s.node.querySelector('[data-develop-original]'); original.width = s.sample.width; original.height = s.sample.height;
    original.getContext('2d').drawImage(s.img, 0, 0, original.width, original.height);
    resize(s); render(s); compare(s); s.node.querySelector('[data-develop-action="apply"]').disabled = false;
  }
  function open(root, api) {
    close(); var state = api.state(); if (!state || state._saving) return;
    var idx = state.adjSel, before = Object.assign({}, api.defaults(), state.adj[idx]);
    var node = document.createElement('section'); node.className = 'itdevelop'; node.setAttribute('role', 'dialog'); node.setAttribute('aria-modal', 'true'); node.setAttribute('aria-label', '곡선과 색상 분석'); node.innerHTML = markup();
    var s = { node: node, api: api, state: state, idx: idx, before: before, draft: Object.assign({}, before), past: [], future: [], zoom: 1, wipe: 50, tab: 'light', channel: 'red', opener: document.activeElement };
    session = s; root.appendChild(node); s.surface = node.querySelector('.itdevelop-image'); s.viewport = node.querySelector('.itdevelop-viewport'); s.photo = node.querySelector('[data-develop-photo]');
    bind(s); sync(s); node.querySelector('button').focus(); s.maskUrl = state.fgMask && state.fgMask[idx];
    Promise.all([api.load(state.photos[idx]), s.maskUrl ? api.load(s.maskUrl) : Promise.resolve(null)]).then(function (images) { ready(s, images); }).catch(function (e) { console.warn('[PhotoStudio] develop photo unavailable', e); if (session === s) message(s, '사진을 불러오지 못했어요. 취소 후 다시 시도해 주세요.'); });
  }
  window.addEventListener('resize', function () { if (session) resize(session); });
  window.ItdDevelopControls = { open: open, close: close };
})();
