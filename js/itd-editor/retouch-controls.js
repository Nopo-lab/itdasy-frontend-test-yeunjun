/* T-915: precise shape/clone tool state and non-destructive in-session history. */
(function () {
  'use strict';
  function markup() {
    return '<nav class="itprecision-tabs" aria-label="정밀 편집 종류"><button data-retouch-tab="shape" aria-pressed="true">터치 성형</button><button data-retouch-tab="clone" aria-pressed="false">잡티 · 복제</button><button data-retouch-tab="local" aria-pressed="false">부분 색감</button></nav>' +
      '<div class="itprecision-shapes" data-retouch-group="shape">' + [['push', '밀기'], ['pinch', '줄이기'], ['bulge', '부풀리기'], ['restore', '원본 복원']].map(function (m) { return '<button data-precision-mode="' + m[0] + '" aria-pressed="false">' + m[1] + '</button>'; }).join('') + '</div>' +
      '<div data-retouch-group="clone" hidden><button data-precision-mode="source" aria-pressed="false">복제할 곳 선택</button><button data-precision-mode="clone" aria-pressed="false">복제 브러시</button><p>깨끗한 곳을 선택한 뒤, 덮고 싶은 곳을 칠해 주세요.</p></div>' +
      '<div class="itprecision-common"><button data-precision-mode="pan" aria-pressed="false">화면 이동</button><button data-retouch-compare aria-pressed="false">편집 전 비교</button></div>';
  }
  function snapshot(s) { return { local: Object.assign({}, s.draft, { strokes: s.draft.strokes.slice() }), retouch: { ops: s.retouch.ops.slice() } }; }
  function remember(s) { s.past.push(snapshot(s)); if (s.past.length > 30) s.past.shift(); s.future = []; }
  function restore(s, snap) { s.draft = Object.assign({}, snap.local, { strokes: snap.local.strokes.slice() }); s.retouch = { ops: snap.retouch.ops.slice() }; }
  function history(s, redo) {
    var from = redo ? s.future : s.past, to = redo ? s.past : s.future;
    if (from.length) { to.push(snapshot(s)); restore(s, from.pop()); }
    else if (!redo) {
      var items = s.scope === 'local' ? s.draft.strokes : s.retouch.ops;
      if (items.length) { s.future.push(snapshot(s)); items.pop(); }
    }
    sync(s); s.render();
  }
  function sync(s) {
    s.node.querySelector('[data-precision-action="undo"]').disabled = !s.past.length && !(s.scope === 'local' ? s.draft.strokes.length : s.retouch.ops.length);
    s.node.querySelector('[data-precision-action="redo"]').disabled = !s.future.length;
    s.node.querySelector('[data-precision-action="clear"]').disabled = !(s.scope === 'local' ? s.draft.strokes.length : s.retouch.ops.some(function (op) { return (['clone', 'heal'].indexOf(op.type) >= 0) === (s.scope === 'clone'); }));
    ['exposure', 'shadows', 'temperature', 'detail', 'smooth'].forEach(function (k) { var el = s.node.querySelector('[data-precision="' + k + '"]'); el.value = s.draft[k]; el.nextElementSibling.textContent = s.draft[k]; });
  }
  function select(s, scope) {
    s.scope = scope; s.mode = scope === 'shape' ? 'push' : scope === 'clone' ? (s.source ? 'clone' : 'source') : 'brush';
    s.node.querySelectorAll('[data-retouch-tab]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.retouchTab === scope)); });
    s.node.querySelectorAll('[data-retouch-group]').forEach(function (el) { el.hidden = el.dataset.retouchGroup !== scope; });
    s.node.querySelectorAll('[data-local-control]').forEach(function (el) { el.hidden = scope !== 'local'; });
    s.node.querySelector('[data-precision="softness"]').closest('label').hidden = scope !== 'local';
    s.node.querySelector('[data-precision="force"]').closest('label').hidden = scope === 'local';
    s.node.querySelector('[data-precision-action="mask"]').hidden = scope !== 'local';
    s.node.querySelector('[data-precision-action="clear"]').textContent = scope === 'local' ? '선택 초기화' : scope === 'shape' ? '형태 초기화' : '복제 초기화';
    mode(s, s.mode); sync(s); s.render();
  }
  function mode(s, name) {
    s.mode = name; s.mask.style.cursor = name === 'pan' ? 'grab' : 'crosshair';
    s.node.querySelectorAll('[data-precision-mode]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.precisionMode === name)); });
    var marker = s.surface.querySelector('.itprecision-source'); marker.hidden = !s.source || s.scope !== 'clone';
  }
  function start(s, p) {
    if (s.mode === 'source') {
      s.source = p; var marker = s.surface.querySelector('.itprecision-source'); marker.style.left = p[0] * 100 + '%'; marker.style.top = p[1] * 100 + '%';
      s.pointer = null; mode(s, 'clone'); s.message('이제 덮고 싶은 곳을 칠해 주세요.'); return true;
    }
    if (['push', 'pinch', 'bulge', 'restore', 'clone'].indexOf(s.mode) < 0) return false;
    if (s.retouch.ops.length >= 100) { s.pointer = null; s.message('정밀 편집은 100획까지 가능해요. 되돌린 뒤 이어 주세요.'); return true; }
    if (s.mode === 'clone' && !s.source) { s.pointer = null; mode(s, 'source'); s.message('먼저 깨끗한 부분을 선택해 주세요.'); return true; }
    remember(s); var op = { type: s.mode, radius: s.radius, strength: s.force, points: [p], source: s.source && s.source.slice() };
    s.retouch.ops.push(op); s.pointer.retouch = op; s.render(true); return true;
  }
  function move(s, p) {
    var op = s.pointer.retouch, prev = op.points[op.points.length - 1];
    if (Math.hypot(p[0] - prev[0], p[1] - prev[1]) > Math.max(.002, op.radius * .07)) { if (op.points.length >= 512) op.points = op.points.filter(function (_p, i) { return i % 2 === 0; }); op.points.push(p); }
    if (!s.framePending) { s.framePending = true; s.frame = requestAnimationFrame(function () { s.framePending = false; s.render(true); }); }
  }
  function action(s, b) {
    if (b.dataset.retouchTab) { select(s, b.dataset.retouchTab); return true; }
    if (b.hasAttribute('data-retouch-compare')) { s.comparing = !s.comparing; b.setAttribute('aria-pressed', String(s.comparing)); s.render(); return true; }
    var act = b.dataset.precisionAction;
    if (act === 'undo' || act === 'redo') { history(s, act === 'redo'); return true; }
    if (act === 'clear') {
      remember(s);
      if (s.scope === 'local') s.draft.strokes = [];
      else s.retouch.ops = s.retouch.ops.filter(function (op) { return (['clone', 'heal'].indexOf(op.type) >= 0) !== (s.scope === 'clone'); });
      sync(s); s.render(); return true;
    }
    return false;
  }
  function ready(s) {
    s.retouch = window.ItdRetouchEngine.clean(s.before.retouch); s.past = []; s.future = []; s.force = .35;
    var marker = document.createElement('span'); marker.className = 'itprecision-source'; marker.hidden = true; s.surface.appendChild(marker);
    select(s, 'shape');
  }
  function description(s) {
    if (s.comparing) return '편집 전 사진 · 비교를 끄면 계속 편집할 수 있어요';
    if (s.scope === 'clone') return s.source ? '깨끗한 부분을 복제해 덮어요 · 원본은 그대로 남아요' : '복제할 깨끗한 부분을 사진에서 먼저 눌러 주세요';
    if (s.mode === 'restore') return '성형·복제 전으로 복원해요 · 색감 보정은 유지돼요';
    if (s.scope === 'shape') return '원하는 방향으로 천천히 밀어 주세요 · 작게 여러 번 다듬으면 자연스러워요';
    return s.draft.strokes.length ? '선택 ' + s.draft.strokes.length + '획 · 적용을 누르면 사진에 반영돼요' : '사진 위를 칠하면 그 부분만 색감이 바뀌어요';
  }
  window.ItdRetouchControls = { markup: markup, ready: ready, remember: remember, sync: sync, mode: mode, start: start, move: move, action: action, history: history, description: description };
})();
