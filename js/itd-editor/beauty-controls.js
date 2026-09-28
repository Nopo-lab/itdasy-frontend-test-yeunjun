/* Purpose-first controls for the shared photo canvas. */
(function () {
  'use strict';
  var TABS = [['skin', '피부'], ['hair', '헤어'], ['shape', '성형'], ['heal', '잡티'], ['background', '배경'], ['light', '빛/색'], ['brush', '부분']];
  var FIELDS = {
    skin: [['smooth', '피부결 정돈', 0], ['redness', '붉은기 완화', 0], ['shine', '번들거림 완화', 0], ['exposure', '피부 밝기'], ['temperature', '피부 색온도']],
    hair: [['hue', '헤어 색상'], ['vibrance', '색의 진하기'], ['exposure', '헤어 밝기'], ['detail', '모발 선명도', 0]],
    background: [['blur', '배경 흐림', 0], ['exposure', '배경 밝기'], ['vibrance', '배경 색의 진하기'], ['temperature', '배경 색온도']],
    brush: [['exposure', '부분 밝기'], ['temperature', '부분 색온도'], ['vibrance', '부분 생동감'], ['detail', '부분 선명도', 0], ['smooth', '부분 질감 정돈', 0]],
    light: [['exposure', '노출'], ['highlights', '밝은 영역'], ['shadows', '어두운 영역'], ['temperature', '색온도'], ['tint', '색조'], ['vibrance', '생동감']]
  };
  var ICONS = {
    text: '<path d="M4 5h16M12 5v15M8 20h8"/>',
    cutout: '<path d="M4 8V4h4m8 0h4v4m0 8v4h-4M8 20H4v-4"/><circle cx="12" cy="9" r="3"/><path d="M7 18c0-6 10-6 10 0"/>',
    sticker: '<path d="M20 13V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h8Zm0 0h-7v7M7 8h.1m6 0h.1M7 12q3 3 6 0"/>',
    shapes: '<circle cx="9" cy="9" r="6"/><path d="M12 12h9v9h-9Z"/>',
    layout: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M6 9h3m6 6h3"/>',
    tone: '<path d="M4 7h16M4 17h16M9 4v6m6 4v6"/>',
    skin: '<path d="M8 3c-3 3-4 6-4 9a8 8 0 0 0 16 0c0-3-1-6-4-9M8 13h.01M16 13h.01M9 17q3 2 6 0M12 2v5M9.5 4.5h5"/>',
    hair: '<path d="M5 21V10a7 7 0 0 1 14 0v11M8 21V11c0-3 2-5 4-6M12 8c4 2 4 8 4 13M11 13v8"/>',
    shape: '<path d="M6 3c-5 7 5 9 0 18M18 3c5 7-5 9 0 18M9 12h6m-2-2 2 2-2 2"/>',
    heal: '<path d="m14 4 6 6M4 14l6 6M8 12l4 4m-1-7 4 4M3 17 17 3a3 3 0 0 1 4 4L7 21a3 3 0 0 1-4-4Z"/>',
    background: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m3 17 5-5 4 4 4-7 5 8M8 8h.01"/>',
    light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
    brush: '<path d="m10 14 9-11 3 3-11 9M10 14c-6-2-2 6-8 6 5 3 11 0 9-5"/>',
    undo: '<path d="M8 4 3 9l5 5M3 9h10a7 7 0 0 1 0 14" transform="translate(0 -2)"/>',
    redo: '<path d="m16 4 5 5-5 5m5-5H11a7 7 0 0 0 0 14" transform="translate(0 -2)"/>',
    compare: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M12 4v16m3-12h3m-3 4h3m-3 4h3"/>',
    pan: '<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3"/>',
    push: '<path d="M3 12h16m-5-5 5 5-5 5M21 3v18"/>',
    pinch: '<path d="m3 3 6 6H4m5 0V4m12 17-6-6v5m0-5h5"/>',
    bulge: '<path d="m9 9-6-6v5m0-5h5m7 12 6 6h-5m5 0v-5"/>',
    restore: '<path d="M4 10a8 8 0 1 1 1 8M4 3v7h7M12 7v6l4 2"/>',
    protect: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Z"/><path d="m8 12 3 3 5-6"/>',
    unprotect: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6ZM8 12h8"/>',
    erase: '<path d="m3 14 9-11 9 8-8 10H9Zm5-6 9 8M13 21h8"/>',
    source: '<circle cx="12" cy="12" r="6"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
    clone: '<rect x="8" y="8" width="12" height="12" rx="3"/><path d="M5 16H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1"/>'
  };
  function icon(key) { return ICONS[key] ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[key] + '</svg>' : ''; }
  function button(action, text) { return '<button type="button" data-beauty-action="' + action + '" aria-label="' + text + '" title="' + text + '">' + icon(action) + '<span>' + text + '</span></button>'; }
  function range(key, title, min, max, attr) {
    return '<label class="itbeauty-slider"><span>' + title + '</span><input type="range" ' + (attr || 'data-beauty-value') + '="' + key + '" aria-label="' + title + '" min="' + (min == null ? -100 : min) + '" max="' + (max == null ? 100 : max) + '" value="0"><output>0</output></label>';
  }
  function modes(list) { return '<div class="itbeauty-modes">' + list.map(function (v) { return '<button type="button" data-beauty-mode="' + v[0] + '" aria-pressed="false">' + icon(v[0]) + '<span>' + v[1] + '</span></button>'; }).join('') + '</div>'; }
  function brush() {
    return '<div class="itbeauty-brush">' + range('radius', '크기', 1, 30, 'data-beauty-setting') + range('strength', '강도', 1, 100, 'data-beauty-setting') + '</div>';
  }
  function selection(s) {
    var label = TABS.find(function (t) { return t[0] === s.tab; })[1];
    var html = '<div class="itbeauty-section-title"><b>' + (s.tab === 'brush' ? '원하는 곳을 칠하세요' : label + '만 골라 보정') + '</b>' + '</div>';
    html += '<div class="itbeauty-regions" aria-label="독립 선택 영역"></div>';
    html += '<div class="itbeauty-selection-tools">' + modes([['brush', '칠하기'], ['erase', '지우기']]) + button('overlay', '선택 보기') + button('new', '＋ 새 영역') + '</div>';
    return html;
  }
  function panel(s) {
    var tab = s.tab, r = s.region(), html = '';
    if (FIELDS[tab] && tab !== 'light') html += selection(s);
    if (tab === 'shape') html += '<div class="itbeauty-section-title"><b>윤곽을 직접 밀어 다듬기</b></div>' + modes([['push', '밀기'], ['pinch', '줄이기'], ['bulge', '볼륨'], ['restore', '복원'], ['protect', '보호'], ['unprotect', '보호 해제']]);
    if (tab === 'heal') html += '<div class="itbeauty-section-title"><b>잡티 위를 가볍게 칠하세요</b></div>' + modes([['heal', '잡티 복원'], ['source', '원본 찍기'], ['clone', '복제'], ['restore', '복원']]);
    if (tab !== 'light') html += brush();
    if (FIELDS[tab]) html += '<div class="itbeauty-adjustments">' + FIELDS[tab].map(function (f) { return range(f[0], f[1], f[2]); }).join('') + '</div>';
    if (FIELDS[tab] && tab !== 'light') html += '<div class="itbeauty-region-actions">' + (tab === 'brush' ? '' : button('auto', '자동 선택')) + (r ? button('toggle', r.enabled ? '보정 끄기' : '보정 켜기') + button('remove', '영역 삭제') : '') + '</div>';
    if (tab === 'shape') html += '<div class="itbeauty-region-actions">' + button('protect-clear', '보호 초기화') + '</div><p>보호를 칠한 곳은 고정돼요. 사진을 확대하면 더 섬세하게 다듬을 수 있어요.</p>';
    if (tab === 'heal') html += '<p>복제: 깨끗한 곳을 먼저 찍고, 덮고 싶은 부분을 칠하세요.</p>';
    if (tab === 'light') html += '<div class="itbeauty-recipe">' + button('save-recipe', '내 보정 저장') + button('load-recipe', '불러오기') + button('batch', '모든 사진에 적용') + button('analysis', '곡선 · 색상 분석') + '</div><label class="itbeauty-match"><input type="checkbox" data-beauty-match-lighting> 사진 밝기 차이 맞추기</label><p>비슷한 구도에 사용하세요. 색감은 유지하고 노출만 맞춰요. 수동 붓질·성형은 각 사진에 그대로 남아요.</p>';
    s.controls.innerHTML = html;
    var match = s.controls.querySelector('[data-beauty-match-lighting]'); if (match) match.checked = !!s.matchLighting;
    if (r && s.controls.querySelector('.itbeauty-regions')) s.draft.regions.filter(function (item) { return item.kind === s.tab; }).forEach(function (region) {
      var b = document.createElement('button'); b.dataset.beautyRegion = region.id; b.textContent = region.name; b.setAttribute('aria-pressed', String(region.id === s.regionId)); s.controls.querySelector('.itbeauty-regions').appendChild(b);
    });
    sync(s);
  }
  function sync(s) {
    s.node.querySelector('[data-beauty-action="compare"]').setAttribute('aria-pressed', String(!!s.comparing));
    s.node.querySelector('[data-beauty-action="pan"]').setAttribute('aria-pressed', String(s.mode === 'pan'));
    var value = s.tab === 'light' ? s.draft : s.region() || {};
    s.node.querySelectorAll('[data-beauty-value]').forEach(function (el) { el.value = value[el.dataset.beautyValue] || 0; el.nextElementSibling.textContent = el.value; });
    s.node.querySelectorAll('[data-beauty-setting]').forEach(function (el) { el.value = el.dataset.beautySetting === 'radius' ? s.radius * 200 : s.strength * 100; el.nextElementSibling.textContent = el.value; });
    s.node.querySelectorAll('[data-beauty-mode]').forEach(function (el) { el.setAttribute('aria-pressed', String(el.dataset.beautyMode === s.mode)); });
    s.node.querySelectorAll('[data-beauty-tab]').forEach(function (el) { el.setAttribute('aria-pressed', String(el.dataset.beautyTab === s.tab)); el.disabled = !!s.busy && s.busyKind !== 'selection'; });
    s.node.parentElement.querySelectorAll('[data-studio-workspace]').forEach(function (el) { el.disabled = !!s.busy && s.busyKind !== 'selection'; });
    ['undo', 'redo'].forEach(function (a, i) { s.node.querySelector('[data-beauty-action="' + a + '"]').disabled = !(i ? s.future : s.past).length || s.busy; });
    s.node.querySelector('[data-beauty-action="apply"]').disabled = !s.img || s.busy;
    s.controls.querySelectorAll('button,input').forEach(function (el) { el.disabled = !!s.busy; });
    s.node.querySelector('.itbeauty-photo-nav').hidden = s.state.photos.length < 2;
    var toggle = s.node.querySelector('[data-beauty-action="overlay"]'); if (toggle) toggle.setAttribute('aria-pressed', String(!!s.showMask));
    s.node.querySelector('[data-beauty-count]').textContent = (s.idx + 1) + ' / ' + s.state.photos.length;
    s.node.querySelector('[data-beauty-action="previous"]').disabled = !s.idx || s.busy;
    s.node.querySelector('[data-beauty-action="next"]').disabled = s.idx >= s.state.photos.length - 1 || s.busy;
  }
  function markup() {
    return '<header><div><b>사진 편집</b><small>PHOTO STUDIO</small></div>' + button('cancel', '취소') + button('apply', '보정 적용') + '</header>' +
      '<div class="itbeauty-work"><main><div class="itbeauty-photo-nav">' + button('previous', '이전 사진') + '<span data-beauty-count></span>' + button('next', '다음 사진') + '</div><div class="itbeauty-viewport"><div class="itbeauty-image"><canvas data-beauty-photo></canvas><canvas data-beauty-mask></canvas><span class="itbeauty-cursor" hidden></span><span class="itbeauty-source" hidden>＋</span></div></div>' +
      '<div class="itbeauty-toolbar">' + button('undo', '되돌리기') + button('redo', '다시 실행') + button('compare', '원본 비교') + button('zoom-out', '−') + '<button type="button" data-beauty-action="zoom-fit" data-beauty-zoom aria-label="사진을 화면에 맞추기" title="화면에 맞추기">100%</button>' + button('zoom-in', '＋') + button('pan', '이동') + '</div></main><aside><nav aria-label="사진 편집 도구">' + TABS.map(function (t) { return '<button data-beauty-tab="' + t[0] + '" aria-pressed="false">' + icon(t[0]) + '<span>' + t[1] + '</span></button>'; }).join('') + '</nav><div class="itbeauty-controls"></div><p data-beauty-status role="status"></p></aside></div>';
  }
  window.ItdBeautyControls = { markup: markup, panel: panel, sync: sync, tabs: TABS, icon: icon };
})();
