/* T-915: photo-first editing workspace. No server or generated-image calls. */
(function () {
  'use strict';
  var root, bridge, panel, gesture = null, comparing = false, fullTicket = 0;
  var controls = [
    ['exposure', '노출', 'light', -100, 100], ['highlights', '밝은 영역', 'light', -100, 100],
    ['shadows', '어두운 영역', 'light', -100, 100], ['temperature', '색온도', 'color', -100, 100],
    ['tint', '색조', 'color', -100, 100], ['vibrance', '생동감', 'color', -100, 100],
    ['detail', '윤곽 선명도', 'detail', 0, 100]
  ];
  var looks = [
    { id: 'natural', name: '내추럴', desc: '부드러운 빛', color: '#ceb4a4', adj: { shadows: 18, highlights: -12, vibrance: 8 } },
    { id: 'clean', name: '클린', desc: '맑고 깨끗하게', color: '#b8c4c6', adj: { exposure: 6, highlights: -18, shadows: 12, temperature: -5 } },
    { id: 'texture', name: '디테일', desc: '결과 윤곽을 또렷이', color: '#756258', adj: { detail: 38, shadows: 12, highlights: -10 } },
    { id: 'warm', name: '웜 필름', desc: '따뜻한 분위기', color: '#c79b76', adj: { temperature: 22, highlights: -15, shadows: 10, s: 94 } },
    { id: 'cool', name: '쿨 무드', desc: '차분한 분위기', color: '#8a9da9', adj: { temperature: -18, tint: 5, shadows: 8, s: 92 } },
    { id: 'mono', name: '모노', desc: '빛과 질감만', color: '#626262', adj: { s: 0, c: 108, shadows: 10, detail: 15 } }
  ];
  function html(tag, cls, content) { var e = document.createElement(tag); e.className = cls; if (content) e.innerHTML = content; return e; }
  function signed(n) { return (n > 0 ? '+' : '') + n; }
  function row(c) {
    return '<label class="itstudio-row" data-group="' + c[2] + '"><span>' + c[1] + '</span>' +
      '<input type="range" data-lab="' + c[0] + '" min="' + c[3] + '" max="' + c[4] + '" value="0" aria-label="' + c[1] + '">' +
      '<button type="button" data-lab-reset="' + c[0] + '" aria-label="' + c[1] + ' 초기화">0</button></label>';
  }
  function tabs() {
    return '<div class="itstudio-tabs" aria-label="보정 종류">' +
      [['looks', '추천 톤'], ['geometry', '수평·구도']].map(function (t) {
        return '<button type="button" data-studio-tab="' + t[0] + '" aria-pressed="false">' + t[1] + '</button>';
      }).join('') + '</div>';
  }
  function lookMarkup() {
    return '<div class="itstudio-looks" data-group="looks">' + looks.map(function (l) {
      return '<button type="button" data-look="' + l.id + '" aria-pressed="false" title="' + l.desc + '">' +
        '<span class="itstudio-look-photo" style="--look-color:' + l.color + '"></span><span>' + l.name + '</span></button>';
    }).join('') + '</div><label class="itstudio-row itstudio-strength" data-group="looks"><span>적용 강도</span>' +
      '<input type="range" data-look-strength min="0" max="100" value="100" aria-label="톤 적용 강도" disabled>' +
      '<output data-strength-out>100</output></label>';
  }
  function moveLegacy(container) {
    [['b', 'light'], ['c', 'light'], ['s', 'color']].forEach(function (v) {
      var rowEl = panel.querySelector('[data-adj="' + v[0] + '"]').parentElement;
      rowEl.dataset.group = v[1]; rowEl.classList.add('itstudio-row'); container.appendChild(rowEl);
    });
    var rot = panel.querySelector('.itadj__rotrow'); rot.dataset.group = 'geometry'; container.appendChild(rot);
    container.appendChild(html('div', 'itstudio-grid-tools', '<button type="button" data-studio-grid aria-pressed="false">수평 격자 보기</button><p>사진을 드래그해 위치를 맞추고 두 손가락으로 크기를 조절하세요.</p>')).dataset.group = 'geometry';
    var legacy = html('details', 'itstudio-legacy', '<summary>이전 버전 보정값</summary>');
    ['w', 'sh'].forEach(function (k) { legacy.appendChild(panel.querySelector('[data-adj="' + k + '"]').parentElement); });
    legacy.dataset.group = 'detail'; container.appendChild(legacy);
  }
  function setupPanel() {
    var body = html('div', 'itstudio-body', lookMarkup() + controls.map(row).join(''));
    moveLegacy(body);
    var bg = html('details', 'itstudio-background', '<summary>배경 지우기 · 누끼</summary><p>배경을 지운 뒤 색이나 사진으로 바꿔요. 기존 누끼는 온라인 처리 기능입니다.</p>');
    ['.itadj__bgrow', '.itadj__cutbg'].forEach(function (s) { bg.appendChild(panel.querySelector(s)); });
    bg.dataset.group = 'cutout'; bg.open = true; body.appendChild(bg);
    panel.querySelector('.itadj__sub').textContent = 'PHOTO STUDIO';
    panel.querySelector('.itadj__presets').hidden = true;
    var heading = html('div', 'itstudio-heading', '<div><strong>사진 톤 · 구도</strong><span>샵 분위기에 맞는 톤을 고르세요.</span></div><button type="button" data-studio-compare aria-pressed="false">원본 비교</button>');
    panel.insertBefore(heading, panel.querySelector('.itadj__strip'));
    panel.appendChild(html('div', 'itstudio-tabwrap', tabs())); panel.appendChild(body);
    var foot = html('div', 'itstudio-foot', '<span data-studio-status>원본은 그대로 보관돼요</span>');
    foot.appendChild(panel.querySelector('[data-r="adjReset"]')); panel.appendChild(foot);
    foot.insertBefore(html('button', 'itstudio-precision', '이전에 칠한 부분 수정'), foot.firstChild);
    foot.insertBefore(html('button', 'itstudio-develop', '곡선 · 색상 분석'), foot.firstChild);
    setupBeautyEntry(heading);
    selectTab('looks');
  }
  function setupBeautyEntry(heading) {
    // Keep one correction workspace; existing drawing/text handlers remain the source of truth.
    var entry = html('div', 'itstudio-entry', '<button data-beauty-open="skin">피부 · 헤어 보정 열기</button>');
    entry.hidden = true; heading.after(entry);
    var classic = html('div', 'itstudio-classic');
    ['.itstudio-tabwrap', '.itstudio-body', '.itstudio-foot'].forEach(function (selector) { classic.appendChild(panel.querySelector(selector)); });
    panel.appendChild(classic); setupNavigation();
  }
  function setupNavigation() {
    var rail = root.querySelector('.itded__rail');
    var tools = [['adjust', '보정', 'light'], ['text', '글자', 'text'], ['cutout', '누끼', 'cutout'], ['sticker', '스티커', 'sticker'], ['shape', '도형', 'shapes'], ['draw', '그리기', 'brush'], ['layout', '전후', 'layout'], ['tone', '톤·구도', 'tone']];
    tools.forEach(function (t) {
      var b = rail.querySelector('[data-tool="' + t[0] + '"]') || html('button', 'itrb');
      b.type = 'button'; b.dataset.studioWorkspace = t[0]; b.setAttribute('aria-label', t[1]);
      b.innerHTML = window.ItdBeautyControls.icon(t[2]) + '<span class="itstudio-tool-label">' + t[1] + '</span>'; rail.appendChild(b);
    });
    var textActions = html('div', 'itstudio-text-actions', '<button type="button" data-studio-text="new">＋ 새 글자</button><button type="button" data-studio-text="edit">선택한 글자 수정</button>');
    root.querySelector('[data-panel="text"]').prepend(textActions);
    textActions.addEventListener('click', function (e) { var b = e.target.closest('[data-studio-text]'); if (b) bridge.text(b.dataset.studioText === 'new'); });
    rail.addEventListener('click', function (e) {
      var b = e.target.closest('[data-studio-workspace]'); if (!b) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (!window.ItdBeautyEditor.leave()) return;
      navigate(b.dataset.studioWorkspace);
    }, true);
  }
  function toolChanged(tool) {
    if (!root) return;
    var selected = root.querySelector('[data-studio-workspace][aria-pressed="true"]');
    if (tool === 'adjust') tool = selected && ['adjust', 'tone', 'cutout'].indexOf(selected.dataset.studioWorkspace) >= 0 ? selected.dataset.studioWorkspace : 'tone';
    root.querySelectorAll('[data-studio-workspace]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.studioWorkspace === tool)); });
  }
  function navigate(tool) {
    finish(); if (comparing) setCompare(false);
    root.querySelectorAll('[data-studio-workspace]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.studioWorkspace === tool)); });
    if (tool === 'adjust') { bridge.tool('adjust', true); window.ItdBeautyEditor.open(root, bridge, 'skin'); return; }
    if (tool === 'tone' || tool === 'cutout') {
      bridge.tool('adjust', true); selectTab(tool === 'cutout' ? 'cutout' : 'looks');
      panel.querySelector('.itstudio-heading strong').textContent = tool === 'cutout' ? '누끼 · 배경 교체' : '사진 톤 · 구도';
      panel.querySelector('.itstudio-heading span').textContent = tool === 'cutout' ? '인물은 남기고 배경을 정리하세요.' : '샵 분위기에 맞는 톤을 고르세요.';
      panel.querySelector('.itstudio-tabwrap').hidden = tool === 'cutout';
      if (tool === 'cutout' && !window.PhotoEditorBgCompose) panel.querySelector('.itstudio-background p').textContent = '이 로컬 미리보기에는 온라인 누끼 서비스가 연결되지 않았어요. 기존 배경 교체 기능은 앱 연결이 필요합니다.';
    } else bridge.tool(tool);
  }
  function setCompare(on) {
    comparing = on; window.ItdStudioPreview.compare(root, bridge.state(), on);
    var b = root.querySelector('[data-studio-compare]');
    b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '편집본 보기' : '원본 비교';
  }
  function selectTab(tab) {
    panel.querySelectorAll('[data-studio-tab]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.studioTab === tab)); });
    panel.querySelectorAll('[data-group]').forEach(function (e) { e.hidden = e.dataset.group !== tab; });
    panel.dataset.studioTab = tab;
  }
  function stateAdj() { var s = bridge.state(); return s.adj[s.adjSel]; }
  function begin() {
    if (comparing) setCompare(false);
    var s = bridge.state();
    if (!gesture) gesture = { state: s, idx: s.adjSel, before: Object.assign({}, stateAdj()) };
    delete s.presetByPhoto[String(s.adjSel)];
  }
  function finish() {
    if (!gesture) return;
    if (gesture.state === bridge.state()) bridge.commit(gesture.idx, gesture.before);
    gesture = null; sync();
  }
  function applyLook(id, strength) {
    var look = looks.find(function (l) { return l.id === id; }); if (!look) return;
    var a = stateAdj(), defaults = bridge.defaults(), keepRot = a.rot;
    Object.assign(a, defaults); window.ItdPhotoLab.keys.forEach(function (k) { a[k] = 0; });
    Object.keys(look.adj).forEach(function (k) { var base = defaults[k] || 0; a[k] = Math.round(base + (look.adj[k] - base) * strength / 100); });
    a.rot = keepRot; a.labLook = id; a.labStrength = strength;
    bridge.refresh(); sync();
  }
  function onInput(e) {
    var input = e.target;
    if (input.matches('[data-adj], [data-r="adjRot"]')) { delete stateAdj().labLook; sync(); return; }
    if (!input.matches('[data-lab], [data-look-strength]')) return;
    begin();
    if (input.hasAttribute('data-look-strength')) applyLook(stateAdj().labLook, Number(input.value));
    else { stateAdj()[input.dataset.lab] = Number(input.value); delete stateAdj().labLook; bridge.refresh(); sync(); }
  }
  function onClick(e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.beautyOpen) { finish(); if (comparing) setCompare(false); window.ItdBeautyEditor.open(root, bridge, b.dataset.beautyOpen); }
    if (b.classList.contains('itstudio-develop')) { finish(); if (comparing) setCompare(false); window.ItdDevelopControls.open(root, bridge); }
    if (b.hasAttribute('data-studio-grid')) { var on = root.classList.toggle('has-photo-grid'); b.setAttribute('aria-pressed', String(on)); }
    if (b.classList.contains('itstudio-precision')) openPreviousLocal();
    if (b.hasAttribute('data-studio-tab')) { finish(); selectTab(b.dataset.studioTab); }
    if (b.hasAttribute('data-studio-compare')) setCompare(!comparing);
    if (b.hasAttribute('data-look')) { begin(); applyLook(b.dataset.look, 100); finish(); }
    if (b.hasAttribute('data-lab-reset')) { begin(); stateAdj()[b.dataset.labReset] = 0; delete stateAdj().labLook; bridge.refresh(); finish(); }
  }
  function openPreviousLocal() {
    finish(); if (comparing) setCompare(false); window.ItdPrecisionEditor.open(root, bridge);
    var pane = root.querySelector('.itprecision'); pane.classList.add('itprecision--local-compat');
    pane.querySelector('[data-retouch-tab="local"]').click();
    pane.querySelector('header b').textContent = '이전에 칠한 부분 수정';
    pane.querySelector('header small').textContent = '기존 사진에 저장된 선택 영역을 다듬어요';
  }
  function keyboard(e) {
    if (!root.classList.contains('is-open') || !root.contains(e.target)) return;
    if (e.target.matches('input, textarea, [contenteditable="true"]')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault(); root.querySelector(e.shiftKey ? '[data-r="redo"]' : '[data-r="undo"]').click();
    }
  }
  function preview() {
    var ticket = ++fullTicket, state = bridge.state();
    var old = root.querySelector('.itstudio-full'); if (old) old.remove();
    if (!state._peek) return;
    var pane = html('div', 'itstudio-full', '<span role="status">미리보기 준비 중…</span>'); root.appendChild(pane);
    bridge.export(function (url) {
      if (ticket !== fullTicket || state !== bridge.state() || !state._peek || !root.classList.contains('is-open')) return;
      if (!url) { pane.textContent = '미리보기를 불러오지 못했어요'; return; }
      pane.textContent = ''; var img = document.createElement('img'); img.src = url; img.alt = '편집한 사진 전체 미리보기'; pane.appendChild(img);
    });
  }
  function exitPreview(e) {
    if (!root.querySelector('.itstudio-full') || e.target.closest('[data-r="peek"]')) return;
    if (e.target.closest('button, input, [data-tool]')) root.querySelector('[data-r="peek"]').click();
  }
  function guardSaving(e) {
    var state = bridge.state();
    if (!state || !state._saving || e.key === 'Escape' || e.target.closest('[data-r="cancel"], .itded__recover--discard')) return;
    e.preventDefault(); e.stopImmediatePropagation();
  }
  function mount(node, api) {
    root = node; bridge = api; panel = root.querySelector('[data-panel="adjust"]');
    root.classList.add('itded--studio'); setupPanel();
    ['pointerdown', 'click', 'input', 'keydown'].forEach(function (event) { root.addEventListener(event, guardSaving, true); });
    var brand = html('div', 'itstudio-brand', '<b>잇데이 <span>STUDIO</span></b><small>한 장의 완성도를 높이는 시간</small>');
    root.querySelector('.itded__top').insertBefore(brand, root.querySelector('.itded__hist'));

    panel.addEventListener('input', onInput); panel.addEventListener('change', finish); panel.addEventListener('click', onClick);
    root.addEventListener('keydown', keyboard);
    root.addEventListener('click', exitPreview, true);
    root.addEventListener('click', function (e) { if (comparing && !e.target.closest('[data-studio-compare]')) setCompare(false); });
    root.addEventListener('pointerdown', function (e) { if (comparing && !e.target.closest('[data-studio-compare]')) setCompare(false); });
  }
  function sync() {
    if (!root || !bridge.state()) return;
    var s = bridge.state(), a = stateAdj();
    panel.querySelector('.itstudio-precision').hidden = !window.ItdLocalAdjustments.active(a.local);
    panel.querySelector('.itstudio-develop').hidden = true;
    var available = !!(window.PhotoEditorBgCompose && window.PhotoEditorBgCompose.compose);
    var cut = panel.querySelector('[data-r="adjCut"]');
    cut.disabled = !available || cut.classList.contains('is-busy');
    panel.querySelectorAll('.itadj__cutbg button, .itadj__cutbg input').forEach(function (b) { b.disabled = !available; });
    panel.querySelector('.itstudio-background p').textContent = available ? '배경을 지우거나 색과 사진으로 바꿔 보세요.' : '이 로컬 미리보기에는 온라인 누끼 서비스가 연결되지 않았어요. 기존 배경 교체 기능은 앱 연결이 필요합니다.';
    if (gesture && gesture.state !== s) gesture = null;
    controls.forEach(function (c) {
      var v = window.ItdPhotoLab.value(a, c[0]); panel.querySelector('[data-lab="' + c[0] + '"]').value = v;
      panel.querySelector('[data-lab-reset="' + c[0] + '"]').textContent = c[0] === 'exposure' ? (v / 50).toFixed(1) : signed(v);
    });
    var strength = panel.querySelector('[data-look-strength]'); strength.disabled = !a.labLook; strength.value = a.labStrength == null ? 100 : a.labStrength;
    panel.querySelector('[data-strength-out]').textContent = a.labLook ? strength.value : '—';
    panel.querySelectorAll('[data-look]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.look === a.labLook)); });
    var strip = panel.querySelector('.itadj__strip'); strip.hidden = s.photos.length < 2;
    panel.querySelector('[data-studio-status]').textContent = s.photos.length > 1 ? (s.adjSel + 1) + ' / ' + s.photos.length + '번째 사진 편집 중' : '원본은 그대로 보관돼요';
    var source = s.photos[s.adjSel];
    if (panel._thumbSource !== source) {
      panel._thumbSource = source;
      renderThumbs(source);
    }
  }
  function renderThumbs(source) {
    bridge.load(source).then(function (img) {
      if (!img || panel._thumbSource !== source) return;
      looks.forEach(function (look) {
        var a = Object.assign(bridge.defaults(), look.adj);
        var cv = window.ItdPhotoLab.render(img, a, 180);
        var target = panel.querySelector('[data-look="' + look.id + '"] .itstudio-look-photo');
        target.style.backgroundImage = 'url("' + cv.toDataURL('image/jpeg', .85) + '")';
        target.style.filter = bridge.filter(a);
      });
    }).catch(function (e) { console.warn('[PhotoStudio] thumbnails unavailable', e); });
  }
  function restoreGeometry(st, state, node, stage) {
    var ratio = String(state.ratio || '4:5').split(':'), aspect = Number(ratio[0]) / Number(ratio[1]);
    // Old drafts omitted their viewport. Reproduce their old fit in this viewport.
    var oldWidth = Math.min(node.clientWidth, node.clientHeight * aspect);
    var source = st.stageSize && Number(st.stageSize.width) > 0 ? Number(st.stageSize.width) : oldWidth;
    var target = parseFloat(stage.style.width), factor = target / source;
    if (!Number.isFinite(factor) || factor <= 0) return;
    if (st.pz) state.pz = Object.assign({}, st.pz, { tx: (st.pz.tx || 0) * factor, ty: (st.pz.ty || 0) * factor });
    if (Array.isArray(st.cellCrop)) state.cellCrop = st.cellCrop.map(function (crop) {
      return crop ? Object.assign({}, crop, { tx: (crop.tx || 0) * factor, ty: (crop.ty || 0) * factor }) : crop;
    });
  }
  function reset() { if (!root) return; fullTicket++;
    panel.querySelector('.itstudio-heading strong').textContent = '사진 톤 · 구도';
    panel.querySelector('.itstudio-heading span').textContent = '샵 분위기에 맞는 톤을 고르세요.';
    panel.querySelector('.itstudio-tabwrap').hidden = false; toolChanged('tone'); root.classList.remove('has-photo-grid'); panel.querySelector('[data-studio-grid]').setAttribute('aria-pressed', 'false'); var full = root.querySelector('.itstudio-full'); if (full) full.remove(); gesture = null; setCompare(false); selectTab('looks'); sync(); }
  function bounds(node) {
    var desktop = window.matchMedia('(min-width: 1060px), (min-width: 740px) and (max-height: 599px)').matches;
    var top = root.querySelector('.itded__top').offsetHeight + 12;
    var bottom = desktop ? 88 : root.querySelector('.itded__rail').offsetHeight + panel.offsetHeight + 8;
    return { width: Math.max(120, node.clientWidth - (desktop ? 390 : 32)), height: Math.max(120, node.clientHeight - top - bottom), left: desktop ? 28 : 16, top: top };
  }
  window.ItdStudioControls = { mount: mount, sync: sync, reset: reset, bounds: bounds, restoreGeometry: restoreGeometry, preview: preview, navigate: navigate, toolChanged: toolChanged };
})();
