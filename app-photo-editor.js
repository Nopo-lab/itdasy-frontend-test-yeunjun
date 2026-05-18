/* 사진 편집기 메인 — P0 MVP (2026-05-18 v168, 분할 후)
   설계 문서: ~/.claude/plans/zesty-snacking-clarke.md §25
   분할 (T-104):
     • 메인 (이 파일) — 시트/캔버스/탭/상태/history/save/export/auto/tune/bg/text/brand
     • app-photo-editor-beauty.js     — 뷰티 5 슬라이더 + HSV 마스킹 픽셀 walk
     • app-photo-editor-templates.js  — 템플릿 5종 + canvas 합성
   사용:
     PhotoEditor.open({ src, shopName?, serviceName?, price? })
     PhotoEditor.openFromAction({ photo_url, initial_tab? })
*/
(function () {
  'use strict';

  const TABS = [
    { id: 'auto', label: '자동' }, { id: 'tune', label: '보정' },
    { id: 'beauty', label: '뷰티' }, { id: 'brush', label: '부분 보정' },
    { id: 'bg', label: '누끼·배경' }, { id: 'template', label: '템플릿' },
    { id: 'text', label: '텍스트' }, { id: 'brand', label: '브랜드' },
    { id: 'export', label: '내보내기' },
  ];

  let _state = null;                  // 합성 상태 (단일 세션)
  const _externalPanels = {};         // tabId -> { html, bind }   (외부 모듈 등록)
  const _drawHooks = {};              // name  -> fn               (외부 모듈 등록)

  // 드래그 슬라이더 동안 픽셀 합성 폭주 방지 — [v202] 80 → 32ms (반응성 ↑, 모바일 발열 모니터링)
  let _redrawScheduled = null;
  function _scheduleRedraw() {
    if (_redrawScheduled) return;
    _redrawScheduled = setTimeout(() => {
      _redrawScheduled = null;
      try { _redraw(); } catch (_e) { void _e; }
    }, 32);
  }
  // Android 하드웨어 백 + iOS edge swipe — history.pushState 사용.
  let _historyPushed = false;
  function _pushHistoryState() {
    if (_historyPushed) return;
    try { history.pushState({ pe: true }, '', location.href); _historyPushed = true; } catch (_e) { void _e; }
  }
  window.addEventListener('popstate', () => {
    const sheet = document.getElementById('photoEditorSheet');
    if (sheet && sheet.style.display !== 'none' && _state) { _historyPushed = false; _close(true); }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const sheet = document.getElementById('photoEditorSheet');
    if (sheet && sheet.style.display !== 'none' && _state) { e.preventDefault(); _close(); }
  });

  function _initState(opts) {
    return {
      originalSrc: opts.src, originalImg: null, secondImg: null,
      shopName: opts.shopName || _readShopName(),
      serviceName: opts.serviceName || '', price: +opts.price || 0,
      // [v175 2026-05-18] 챗봇 사진+텍스트 shortcut 진입 시 컨텍스트 보존 (다음 라운드에 활용).
      customerId: opts.customer_id || null,
      customerName: opts.customer_name || '',
      autoShop: !!opts.autoShop,
      activeTab: opts.initial_tab || 'auto', ratio: 'original',
      autoIntensity: 'standard',  // [v183] natural | standard | strong
      adjust: { brightness: 100, saturate: 100, sharpness: 0, temperature: 0 },
      beauty: { skin: 0, redness: 0, hairShine: 0, nailGloss: 0, lashSharp: 0, blemish: 0, handSkin: 0, hairColor: 0, hairDetail: 0, eyeShadow: 0 },
      template: { id: null, leftLabel: '전', rightLabel: '후', reviewText: '', priceLines: '' },
      // [v188 2026-05-18] 텍스트 v2 — stroke (외곽선), rotation, x slider 추가
      // [v204 2026-05-19] 다중 레이어 — _state.text 는 active layer alias.
      //   _state.layers[] 가 source of truth. text 비면 layers[0] = 빈 text layer.
      text: { value: '', x: 0.5, y: 0.92, color: '#ffffff', font: 'sans', size: 6, bg: false, stroke: false, rot: 0 },
      layers: [],          // [v204] { id, type:'text', value, x, y, color, font, size, bg, stroke, rot }
      activeLayerId: null, // [v204] 현재 편집 중 layer id
      watermark: { value: '', position: 'br', opacity: 0.85 },
      showOriginal: false, history: [], historyCursor: -1,
    };
  }

  function _readShopName() {
    try {
      return localStorage.getItem('itdasy_shop_name')
          || (JSON.parse(localStorage.getItem('itdasy_brand_kit') || '{}').shop_name)
          || '';
    } catch (_e) { return ''; }
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  function _toast(msg) { if (window.showToast) window.showToast(msg); }

  // ── 시트 ──────────────────────────────────────────────
  function _ensureSheet() {
    const ex = document.getElementById('photoEditorSheet');
    if (ex) return ex;
    const sheet = Object.assign(document.createElement('div'), { id: 'photoEditorSheet', className: 'pe-sheet' });
    sheet.style.display = 'none';
    sheet.innerHTML = `<div class="pe-root" role="dialog" aria-modal="true" aria-label="사진 편집기">
      <header class="pe-topbar">
        <button type="button" class="pe-back-btn" data-pe-act="close" aria-label="편집기 닫고 뒤로가기"><span class="pe-back-arrow" aria-hidden="true">‹</span><span class="pe-back-label">뒤로</span></button>
        <div class="pe-title">사진 편집기</div>
        <button type="button" class="pe-iconbtn" data-pe-act="compare" aria-label="원본 비교">원본</button>
        <button type="button" class="pe-iconbtn" data-pe-act="undo" aria-label="되돌리기">⤺</button>
        <button type="button" class="pe-iconbtn" data-pe-act="redo" aria-label="다시 실행">⤻</button>
        <button type="button" class="pe-btn-primary" data-pe-act="save">저장</button></header>
      <main class="pe-stage"><div class="pe-canvas-wrap">
        <canvas id="peCanvas" class="pe-canvas"></canvas>
        <div class="pe-canvas-empty" id="peCanvasEmpty">
          <div style="font-size:13px;color:#888;margin-bottom:10px;">편집할 사진을 골라주세요</div>
          <button type="button" class="pe-btn-primary" data-pe-act="pick">사진 고르기</button>
          <input type="file" id="pePicker" accept="image/*" style="display:none" /></div></div></main>
      <nav class="pe-tabs" id="peTabs">${TABS.map(t => `<button type="button" class="pe-tab" data-pe-tab="${t.id}">${_esc(t.label)}</button>`).join('')}</nav>
      <section class="pe-panel" id="pePanel"></section></div>`;
    document.body.appendChild(sheet);
    _bindSheet(sheet);
    return sheet;
  }

  const _ACTS = { close: () => _close(), undo: () => _undo(), redo: () => _redo(), save: () => _save(), compare: () => _toggleCompare() };
  function _bindSheet(sheet) {
    sheet.addEventListener('click', (e) => {
      const act = e.target.closest('[data-pe-act]')?.dataset.peAct;
      if (act === 'pick') return sheet.querySelector('#pePicker').click();
      if (_ACTS[act]) return _ACTS[act]();
      const tab = e.target.closest('[data-pe-tab]')?.dataset.peTab;
      if (tab) { _state.activeTab = tab; _renderTabs(); _renderPanel(); }
    });
    const cv = sheet.querySelector('#peCanvas');
    // 롱프레스 = 원본 비교 — [v185] brush 탭일 땐 비활성화 (brush 의 drag 와 충돌)
    let t = null;
    const start = () => {
      if (_state && _state.activeTab === 'brush') return;
      t = setTimeout(() => { _state.showOriginal = true; _redraw(); }, 250);
    };
    const end   = () => { if (t) clearTimeout(t); if (_state && _state.showOriginal) { _state.showOriginal = false; _redraw(); } };
    cv.addEventListener('mousedown', start);  cv.addEventListener('touchstart', start, { passive: true });
    cv.addEventListener('mouseup', end);      cv.addEventListener('mouseleave', end);    cv.addEventListener('touchend', end);
    sheet.querySelector('#pePicker').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) _loadImage(URL.createObjectURL(f));
    });
  }

  function _renderTabs() {
    const wrap = document.getElementById('peTabs');
    if (!wrap || !_state) return;
    wrap.querySelectorAll('.pe-tab').forEach(b => b.classList.toggle('on', b.dataset.peTab === _state.activeTab));
  }

  const _panelRenderers = { auto: _panelAuto, tune: _panelTune, bg: _panelBg, text: _panelText, brand: _panelBrand, export: _panelExport };
  function _renderPanel() {
    const panel = document.getElementById('pePanel');
    if (!panel || !_state) return;
    const tab = _state.activeTab;
    const ext = _externalPanels[tab];
    if (ext && typeof ext.html === 'function') panel.innerHTML = ext.html(_state);
    else if (_panelRenderers[tab]) panel.innerHTML = _panelRenderers[tab]();
    else panel.innerHTML = '';
    _bindPanel(panel, tab);
  }

  // ── 패널들 (메인 유지: auto/tune/bg/text/brand/export) ──
  const _CHIP = (attr, val, label, on) => `<button type="button" class="pe-chip-btn${on?' on':''}" data-pe-${attr}="${val}">${_esc(label)}</button>`;
  function _slider(label, key, val, min, max, step) {
    return `<label class="pe-slider"><div class="pe-slider-head"><span>${_esc(label)}</span><span class="pe-slider-val" data-pe-slider-val="${key}">${val}</span></div><input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-pe-slider="${key}" /></label>`;
  }
  function _shopPresetLabel() {
    try {
      const p = window.PhotoEnhance && window.PhotoEnhance.getShopPreset && window.PhotoEnhance.getShopPreset();
      return (p && p.label) || '일반';
    } catch (_e) { return '일반'; }
  }
  function _panelAuto() {
    const shopLabel = _shopPresetLabel();
    const cur = _state.autoIntensity || 'standard';
    const intChip = (k, label) => `<button type="button" class="pe-chip-btn${cur===k?' on':''}" data-pe-auto-intensity="${k}">${label}</button>`;
    // [v184] 즐겨찾기 프리셋 5슬롯
    const favs = _loadFavorites();
    const favHtml = favs.length
      ? favs.map((f, i) => `<button type="button" class="pe-chip-btn" data-pe-fav-apply="${i}" title="${_esc(f.name)}">★ ${_esc(f.name)}</button>`).join('')
      : '<div class="pe-hint" style="margin:0;">아직 저장된 프리셋이 없어요. 슬라이더 조정 후 ↓ 버튼으로 저장.</div>';
    return `<div class="pe-panel-row"><button type="button" class="pe-action-btn" data-pe-auto="all">⚡ 한 번에 자동 보정</button></div>
      <div class="pe-panel-row"><button type="button" class="pe-action-btn" data-pe-auto="shop">⚡ 우리 샵 업종 자동 (현재: ${_esc(shopLabel)})</button></div>
      <div class="pe-field-label" style="margin-top:10px;">강도</div>
      <div class="pe-panel-row pe-panel-grid-4">${intChip('natural','자연')}${intChip('standard','표준')}${intChip('strong','강조')}</div>
      <div class="pe-field-label" style="margin-top:10px;">업종별 자동 (강도 적용)</div>
      <div class="pe-panel-row pe-panel-grid-2">${_CHIP('auto','hair','헤어·붙임머리')}${_CHIP('auto','scalp','두피·탈모')}${_CHIP('auto','makeup','메이크업·눈썹')}${_CHIP('auto','lash','속눈썹')}${_CHIP('auto','nail','네일·패디')}${_CHIP('auto','wax','왁싱·바디·피부')}</div>
      <div class="pe-field-label" style="margin-top:10px;">분위기</div>
      <div class="pe-panel-row pe-panel-grid-4">${_CHIP('auto','bright','밝게')}${_CHIP('auto','vivid','선명')}${_CHIP('auto','warm','따뜻')}${_CHIP('auto','cool','차갑게')}</div>
      <div class="pe-field-label" style="margin-top:14px;">★ 내 즐겨찾기 프리셋 (${favs.length}/5)</div>
      <div class="pe-panel-row pe-panel-grid-2" style="flex-wrap:wrap;">${favHtml}</div>
      <div class="pe-panel-row" style="margin-top:6px;"><button type="button" class="pe-chip-btn" data-pe-fav-save>현재 슬라이더 → 프리셋 저장</button></div>
      <div class="pe-hint">표준이 기본. 자연은 0.7배, 강조는 1.4배.</div>`;
  }

  // [v184 2026-05-18] 즐겨찾기 프리셋 — localStorage 5슬롯.
  //   각 슬롯: { name, adjust, beauty }
  const _FAV_KEY = 'itdasy_pe_favorites';
  function _loadFavorites() {
    try { return JSON.parse(localStorage.getItem(_FAV_KEY) || '[]') || []; }
    catch (_e) { return []; }
  }
  function _saveFavoritesList(list) {
    try { localStorage.setItem(_FAV_KEY, JSON.stringify(list.slice(0, 5))); }
    catch (_e) { void _e; }
  }
  function _saveCurrentAsFavorite() {
    const list = _loadFavorites();
    if (list.length >= 5) {
      _toast('5개 한도. 기존 프리셋 길게 눌러 삭제 후 다시 저장');
      return;
    }
    const name = (typeof window.prompt === 'function' ? window.prompt('프리셋 이름 (예: 헤어 진하게)', '내 프리셋 ' + (list.length + 1)) : '내 프리셋 ' + (list.length + 1));
    if (!name) return;
    list.push({
      name: String(name).slice(0, 20),
      adjust: JSON.parse(JSON.stringify(_state.adjust)),
      beauty: JSON.parse(JSON.stringify(_state.beauty)),
    });
    _saveFavoritesList(list);
    _renderPanel();
    _toast('프리셋 저장: ' + name);
  }
  function _applyFavorite(idx) {
    const list = _loadFavorites();
    const f = list[idx];
    if (!f) return _toast('프리셋을 찾지 못했어요');
    Object.assign(_state.adjust, f.adjust);
    Object.assign(_state.beauty, f.beauty);
    _redraw(); _pushHistory();
    _toast('적용: ' + f.name);
  }
  function _panelTune() {
    const a = _state.adjust;
    return `${_slider('밝기','brightness',a.brightness,50,150,1)}${_slider('채도','saturate',a.saturate,50,150,1)}${_slider('선명도','sharpness',a.sharpness,0,100,1)}${_slider('색온도','temperature',a.temperature,-50,50,1)}
      <div class="pe-field-label" style="margin-top:10px;">방향 (v202 신규)</div>
      <div class="pe-panel-row pe-panel-grid-4">
        <button type="button" class="pe-chip-btn" data-pe-transform="rotL">↺ 90°</button>
        <button type="button" class="pe-chip-btn" data-pe-transform="rotR">↻ 90°</button>
        <button type="button" class="pe-chip-btn" data-pe-transform="flipH">⇋ 좌우</button>
        <button type="button" class="pe-chip-btn" data-pe-transform="flipV">⇵ 상하</button>
      </div>
      <div class="pe-panel-row" style="margin-top:8px;"><button type="button" class="pe-chip-btn" data-pe-tune-reset>슬라이더 초기화</button></div>
      <div class="pe-hint">방향 버튼은 원본 이미지를 회전·반전 시킵니다. 슬라이더는 따로 초기화.</div>`;
  }
  function _panelBg() {
    // [v186 2026-05-18] 편집기 내부 통합 — app-gallery-bg.js 의 GALLERY_BG_LIST + composeBgForEditor 사용.
    const list = (typeof window.GALLERY_BG_LIST === 'function') ? window.GALLERY_BG_LIST() : [];
    if (!list.length) {
      return `<div class="pe-panel-row"><button type="button" class="pe-action-btn" data-pe-bg="open-existing">기존 누끼·배경 화면 열기</button></div>
        <div class="pe-hint">배경 모듈 로드 중이에요. 잠시 후 다시 열어주세요.</div>`;
    }
    const cards = list.map(bg => {
      const preview = bg.imageData
        ? `<img src="${_esc(bg.imageData)}" alt="${_esc(bg.name)}" style="width:100%;height:100%;object-fit:cover;display:block;" />`
        : `<div style="width:100%;height:100%;background:${_esc(bg.gradient || bg.color || '#fff')};"></div>`;
      return `<button type="button" data-pe-bg-id="${_esc(bg.id)}"
        style="position:relative;width:100%;aspect-ratio:1;border-radius:10px;overflow:hidden;border:1.5px solid rgba(255,255,255,0.10);background:transparent;cursor:pointer;padding:0;">
        ${preview}
        <div style="position:absolute;left:0;right:0;bottom:0;padding:3px 6px;background:rgba(0,0,0,0.55);color:#fff;font-size:10px;font-weight:700;text-align:center;">${_esc(bg.name)}</div>
      </button>`;
    }).join('');
    return `<div class="pe-field-label">배경 선택 (누끼 후 자동 합성)</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;">${cards}</div>
      <div class="pe-panel-row pe-panel-grid-2">
        <button type="button" class="pe-chip-btn" data-pe-bg="restore">↺ 원본 사진으로</button>
        <button type="button" class="pe-chip-btn" data-pe-bg="open-existing">기존 배경 화면</button>
      </div>
      <div class="pe-hint">카드 누르면 자동 누끼 + 합성. 같은 사진은 누끼 캐시되어 다른 배경 즉시 적용. Free 한도 누끼 2/일.</div>`;
  }
  function _panelText() {
    // [v204 2026-05-19] 다중 레이어 — _state.layers 우선, active layer 가 _state.text alias
    _ensureLayers();
    const t = _state.text;  // active layer 가 _state.text 와 동기화됨
    // [v206 2026-05-19] 폰트 4 → 9 종 (Google Fonts 5 추가). 모두 무료·상업 OK.
    const FONTS = [
      { id: 'sans',     label: 'Sans' },
      { id: 'serif',    label: 'Serif' },
      { id: 'playfair', label: 'Playfair' },
      { id: 'nserif',   label: '명조' },
      { id: 'bhan',     label: '블랙 한산스' },
      { id: 'gowun',    label: '고운 도담' },
      { id: 'gaegu',    label: '개구' },
      { id: 'nanumpen', label: '나눔 펜' },
      { id: 'hand',     label: '핸드' },
    ];
    const COLORS = ['#ffffff', '#1a1a20', '#F18091', '#FFC83D'];
    const COLOR_LABEL = { '#ffffff': '흰', '#1a1a20': '검', '#F18091': '핑크', '#FFC83D': '노랑' };
    // [v204] 레이어 리스트 헤더
    const layers = _state.layers || [];
    const layerListHtml = layers.length > 1
      ? `<div class="pe-field-label">텍스트 레이어 (${layers.length})</div>
         <div class="pe-panel-row" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
           ${layers.map((l, i) => `<button type="button" class="pe-chip-btn${l.id === _state.activeLayerId ? ' on' : ''}" data-pe-layer-select="${l.id}" title="${_esc(l.value || '(빈 텍스트)').slice(0, 20)}">${i + 1}. ${_esc((l.value || '빈 텍스트').slice(0, 8))}</button>`).join('')}
         </div>`
      : '';
    const layerActionsHtml = `
      <div class="pe-panel-row" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">
        <button type="button" class="pe-chip-btn" data-pe-layer-add>＋ 새 텍스트</button>
        <button type="button" class="pe-chip-btn" data-pe-sticker-open>🎨 스티커</button>
        ${layers.length > 1 ? '<button type="button" class="pe-chip-btn" data-pe-layer-del>🗑 삭제</button>' : ''}
        ${layers.length > 1 ? '<button type="button" class="pe-chip-btn" data-pe-layer-up>↑ 위로</button>' : ''}
      </div>`;
    return `${layerListHtml}${layerActionsHtml}<label class="pe-field"><span>텍스트 (여러 줄 가능 — Enter)</span><textarea class="pe-input" data-pe-text-val rows="3" maxlength="120" placeholder="시술명·이벤트 문구 등&#10;여러 줄도 OK">${_esc(t.value)}</textarea></label>
      <div class="pe-panel-row pe-panel-grid-2" style="margin-top:8px;">${_CHIP('text-prefill','service','시술명 자동')}${_CHIP('text-prefill','price','가격 자동')}</div>
      <div class="pe-field-label" style="margin-top:10px;">폰트</div>
      <div class="pe-panel-row pe-panel-grid-4">${FONTS.map(f => `<button type="button" class="pe-chip-btn${t.font===f.id?' on':''}" data-pe-text-font="${f.id}">${f.label}</button>`).join('')}</div>
      <div class="pe-field-label" style="margin-top:10px;">색상</div>
      <div class="pe-panel-row pe-panel-grid-4">${COLORS.map(c => `<button type="button" class="pe-chip-btn${t.color===c?' on':''}" data-pe-text-color="${c}" style="background:${c};color:${c==='#ffffff'||c==='#FFC83D'?'#222':'#fff'};">${COLOR_LABEL[c]}</button>`).join('')}</div>
      <!-- [v202 2026-05-18] 색상 무한 선택 (S1-1) -->
      <div class="pe-panel-row" style="margin-top:6px;align-items:center;gap:8px;">
        <label style="font-size:11px;color:#c9c9d0;display:inline-flex;align-items:center;gap:8px;cursor:pointer;">
          <span>커스텀 색상:</span>
          <input type="color" data-pe-text-color-picker value="${_esc(t.color)}" style="width:36px;height:36px;border:none;border-radius:8px;cursor:pointer;background:transparent;" />
        </label>
      </div>
      <label class="pe-slider"><div class="pe-slider-head"><span>크기</span><span class="pe-slider-val">${t.size}</span></div><input type="range" min="3" max="12" value="${t.size}" data-pe-text-size /></label>
      <label class="pe-slider"><div class="pe-slider-head"><span>위치 (위↔아래)</span><span class="pe-slider-val">${Math.round(t.y*100)}</span></div><input type="range" min="5" max="95" value="${Math.round(t.y*100)}" data-pe-text-y /></label>
      <label class="pe-slider"><div class="pe-slider-head"><span>위치 (좌↔우)</span><span class="pe-slider-val">${Math.round(t.x*100)}</span></div><input type="range" min="5" max="95" value="${Math.round(t.x*100)}" data-pe-text-x /></label>
      <label class="pe-slider"><div class="pe-slider-head"><span>회전 (°)</span><span class="pe-slider-val">${t.rot}</span></div><input type="range" min="-45" max="45" value="${t.rot}" data-pe-text-rot /></label>
      <div class="pe-panel-row pe-panel-grid-2" style="margin-top:8px;"><button type="button" class="pe-chip-btn${t.bg?' on':''}" data-pe-text-bg>배경 박스 ${t.bg?'끄기':'켜기'}</button><button type="button" class="pe-chip-btn${t.stroke?' on':''}" data-pe-text-stroke>외곽선 ${t.stroke?'끄기':'켜기'}</button></div>`;
  }
  function _panelBrand() {
    const w = _state.watermark, sym = { tl:'↖', tr:'↗', bl:'↙', br:'↘' };
    return `<label class="pe-field"><span>워터마크 문구</span><input type="text" class="pe-input" data-pe-wm-val placeholder="@샵아이디 · 샵이름" value="${_esc(w.value)}" maxlength="40" /></label>
      <div class="pe-field-label">위치</div>
      <div class="pe-panel-row pe-panel-grid-4">${['tl','tr','bl','br'].map(p => _CHIP('wm-pos', p, sym[p], w.position===p)).join('')}</div>
      <label class="pe-slider"><div class="pe-slider-head"><span>투명도</span><span class="pe-slider-val">${Math.round(w.opacity*100)}%</span></div><input type="range" min="20" max="100" value="${Math.round(w.opacity*100)}" data-pe-wm-opacity /></label>
      <div class="pe-panel-row pe-panel-grid-2" style="margin-top:8px;"><button type="button" class="pe-chip-btn" data-pe-wm-save>기본값으로 저장</button><button type="button" class="pe-chip-btn" data-pe-wm-kit>Brand Kit 전체 설정</button></div>`;
  }
  function _panelExport() {
    const r = _state.ratio;
    // [v206 2026-05-19] 배치 편집 — 갤러리 slot 사진 N장 일괄 자동 보정
    //   조건: window._slots / window._popupSlotId 존재 (갤러리 모듈 로드됨)
    const slotInfo = _peGetCurrentSlot();
    const batchHtml = slotInfo
      ? `<div class="pe-field-label" style="margin-top:12px;">배치 편집 (v206)</div>
         <div class="pe-panel-row"><button type="button" class="pe-action-btn" data-pe-batch-apply>📦 이 슬롯 사진 ${slotInfo.count}장 모두 같은 보정 일괄 적용</button></div>
         <div class="pe-hint">현재 슬라이더 설정으로 슬롯 (${_esc(slotInfo.label)}) 다른 사진까지 한 번에 보정.</div>`
      : '';
    return `<div class="pe-field-label">비율</div>
      <div class="pe-panel-row pe-panel-grid-4">${['original','1:1','4:5','9:16'].map(rv => _CHIP('ratio', rv, rv === 'original' ? '원본' : rv, r===rv)).join('')}</div>
      <div class="pe-panel-row pe-panel-grid-2" style="margin-top:12px;"><button type="button" class="pe-action-btn" data-pe-export="png">PNG 저장</button><button type="button" class="pe-action-btn" data-pe-export="jpg">JPG 저장</button></div>
      ${batchHtml}
      <div class="pe-hint">저장 시 원본은 보존됩니다. 편집본만 다운로드 또는 갤러리에 추가돼요.</div>`;
  }

  // [v206 2026-05-19] 현재 갤러리 슬롯 정보 — 갤러리 모듈이 로드돼 있고 slot 활성일 때만
  function _peGetCurrentSlot() {
    try {
      if (typeof window._slots === 'undefined' || typeof window._popupSlotId === 'undefined') return null;
      const slot = (window._slots || []).find(s => s && s.id === window._popupSlotId);
      if (!slot) return null;
      const photos = (slot.photos || []).filter(p => p && !p.hidden);
      if (photos.length < 2) return null;
      return { id: slot.id, label: slot.label || '슬롯', count: photos.length };
    } catch (_e) { return null; }
  }

  // ── 패널 바인딩 ───────────────────────────────────────
  const _each = (panel, sel, ev, fn) => panel.querySelectorAll(sel).forEach(el => el.addEventListener(ev, fn));
  const _on   = (panel, sel, ev, fn) => panel.querySelector(sel)?.addEventListener(ev, fn);

  function _bindBrandKitSync() {
    window.addEventListener('itdasy:brand-kit:updated', () => {
      try {
        const bk = window.BrandKit && window.BrandKit.get && window.BrandKit.get();
        if (!bk) return;
        const wm = _state.watermark;
        if (bk.watermark_text) wm.value = bk.watermark_text;
        else if (bk.shop_name) wm.value = bk.shop_name + (bk.instagram_handle ? ' · @' + bk.instagram_handle : '');
        if (bk.watermark_position) wm.position = bk.watermark_position;
        if (typeof bk.watermark_opacity === 'number') wm.opacity = bk.watermark_opacity;
        _renderPanel(); _redraw();
      } catch (_e) { void _e; }
    }, { once: true });
  }

  function _saveBrandWm() {
    try {
      const wm = _state.watermark;
      const p = { watermark_text: wm.value, watermark_position: wm.position, watermark_opacity: wm.opacity };
      if (window.BrandKit && typeof window.BrandKit.save === 'function') window.BrandKit.save(p);
      else {
        const bk = JSON.parse(localStorage.getItem('itdasy_brand_kit') || '{}');
        localStorage.setItem('itdasy_brand_kit', JSON.stringify(Object.assign(bk, p)));
      }
      _toast('워터마크 기본값을 저장했어요');
    } catch (_e) { _toast('저장에 실패했어요'); }
  }

  const _BINDERS = {
    auto(panel) {
      _each(panel, '[data-pe-auto]', 'click', e => _applyAuto(e.currentTarget.dataset.peAuto));
      _each(panel, '[data-pe-auto-intensity]', 'click', e => {
        _state.autoIntensity = e.currentTarget.dataset.peAutoIntensity;
        _renderPanel();
        _toast('강도: ' + (_state.autoIntensity === 'natural' ? '자연' : _state.autoIntensity === 'strong' ? '강조' : '표준'));
      });
      // [v184] 즐겨찾기 — 클릭 적용 / 길게 눌러 삭제
      _each(panel, '[data-pe-fav-apply]', 'click', e => _applyFavorite(+e.currentTarget.dataset.peFavApply));
      _each(panel, '[data-pe-fav-apply]', 'contextmenu', e => {
        e.preventDefault();
        const i = +e.currentTarget.dataset.peFavApply;
        const list = _loadFavorites();
        if (typeof window.confirm === 'function' && window.confirm('프리셋 "' + (list[i] && list[i].name) + '" 삭제할까요?')) {
          list.splice(i, 1); _saveFavoritesList(list); _renderPanel(); _toast('프리셋 삭제');
        }
      });
      _on(panel, '[data-pe-fav-save]', 'click', _saveCurrentAsFavorite);
    },
    tune(panel) {
      _each(panel, '[data-pe-slider]', 'input', (e) => {
        const inp = e.currentTarget, key = inp.dataset.peSlider;
        _state.adjust[key] = +inp.value;
        const out = panel.querySelector(`[data-pe-slider-val="${key}"]`);
        if (out) out.textContent = inp.value;
        _scheduleRedraw();
      });
      _each(panel, '[data-pe-slider]', 'change', () => _pushHistory());
      // [v202] 슬라이더 더블탭 reset (S1-2)
      _each(panel, '[data-pe-slider]', 'dblclick', (e) => {
        const key = e.currentTarget.dataset.peSlider;
        const RESET = { brightness: 100, saturate: 100, sharpness: 0, temperature: 0 };
        _state.adjust[key] = RESET[key] || 0;
        _renderPanel(); _redraw(); _pushHistory();
        _toast('초기화: ' + key);
      });
      _on(panel, '[data-pe-tune-reset]', 'click', () => {
        _state.adjust = { brightness: 100, saturate: 100, sharpness: 0, temperature: 0 };
        _renderPanel(); _redraw(); _pushHistory();
      });
      // [v202] 회전·좌우반전 (S1-3) — originalImg 자체를 변환 후 swap
      _each(panel, '[data-pe-transform]', 'click', (e) => _applyTransform(e.currentTarget.dataset.peTransform));
    },
    bg(panel) {
      _on(panel, '[data-pe-bg="open-existing"]', 'click', () => {
        _toast('기존 누끼·배경 화면을 여는 중…');
        (window.openGalleryBg || window.openBgGallery || window.openBgPanel || (() => {}))();
      });
      // [v186] 원본 복원 — _state.originalSrc 다시 로드 + 누끼 캐시 무효
      _on(panel, '[data-pe-bg="restore"]', 'click', () => {
        if (!_state.preBgOriginalSrc) return _toast('원본이 이미 보이고 있어요');
        _loadImage(_state.preBgOriginalSrc);
        _state.removedBgDataUrl = null;
        _state.preBgOriginalSrc = null;
        _toast('원본 사진으로 복원');
      });
      // [v186] 배경 카드 클릭 → composeBgForEditor 호출
      _each(panel, '[data-pe-bg-id]', 'click', async (e) => {
        const bgId = e.currentTarget.dataset.peBgId;
        if (!_state.originalImg) return _toast('먼저 사진을 골라주세요');
        if (typeof window.composeBgForEditor !== 'function') return _toast('배경 모듈 로드 중이에요. 잠시 후 다시.');
        const btn = e.currentTarget;
        btn.disabled = true;
        _toast('누끼 + 배경 합성 중…');
        try {
          // 첫 적용 시 현재 originalSrc 백업 — 복원용
          if (!_state.preBgOriginalSrc) _state.preBgOriginalSrc = _state.originalSrc;
          const srcUrl = _state.preBgOriginalSrc;  // 원본 (다른 배경 재선택 시 일관)
          const ratio = (_state.ratio && _state.ratio !== 'original') ? _state.ratio : '1:1';
          const result = await window.composeBgForEditor(srcUrl, bgId, ratio, _state.removedBgDataUrl);
          _state.removedBgDataUrl = result.removedBgDataUrl;  // 누끼 캐시 — 다음 배경에 재활용
          // 결과 dataURL → originalImg 교체
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            _state.originalImg = img;
            _state.originalSrc = result.composedDataUrl;
            _pushHistory();
            _redraw();
            _toast('배경 적용 완료');
            btn.disabled = false;
          };
          img.onerror = () => { _toast('합성 이미지 로드 실패'); btn.disabled = false; };
          img.src = result.composedDataUrl;
        } catch (err) {
          console.warn('[bg] 합성 실패:', err);
          _toast('합성 실패: ' + ((err && err.message) || '').slice(0, 60));
          btn.disabled = false;
        }
      });
    },
    text(panel) {
      // [v204] 레이어 관리 — 추가/삭제/선택/순서
      _on(panel, '[data-pe-layer-add]', 'click', _addLayer);
      _on(panel, '[data-pe-layer-del]', 'click', _deleteLayer);
      _on(panel, '[data-pe-layer-up]',  'click', _moveLayerUp);
      // [v205 2026-05-19] 스티커 라이브러리 열기
      _on(panel, '[data-pe-sticker-open]', 'click', () => {
        if (window.PhotoEditor && typeof window.PhotoEditor.openStickerLibrary === 'function') {
          window.PhotoEditor.openStickerLibrary();
        } else {
          _toast('스티커 모듈 로드 중이에요');
        }
      });
      _each(panel, '[data-pe-layer-select]', 'click', (e) => _selectLayer(e.currentTarget.dataset.peLayerSelect));
      _on(panel, '[data-pe-text-val]', 'input', (e) => { _state.text.value = e.target.value; _syncTextToLayer(); _redraw(); });
      _on(panel, '[data-pe-text-y]',   'input', (e) => { _state.text.y = +e.target.value / 100; _redraw(); });
      _on(panel, '[data-pe-text-x]',   'input', (e) => { _state.text.x = +e.target.value / 100; _redraw(); });
      _on(panel, '[data-pe-text-rot]', 'input', (e) => { _state.text.rot = +e.target.value; _redraw(); });
      _on(panel, '[data-pe-text-size]','input', (e) => {
        _state.text.size = +e.target.value;
        _redraw();
      });
      _on(panel, '[data-pe-text-stroke]', 'click', () => {
        _state.text.stroke = !_state.text.stroke;
        _renderPanel(); _redraw(); _pushHistory();
      });
      _each(panel, '[data-pe-text-font]', 'click', (e) => {
        _state.text.font = e.currentTarget.dataset.peTextFont;
        _renderPanel(); _redraw(); _pushHistory();
      });
      _each(panel, '[data-pe-text-color]', 'click', (e) => {
        _state.text.color = e.currentTarget.dataset.peTextColor;
        _renderPanel(); _redraw(); _pushHistory();
      });
      // [v202] 색상 무한 선택 picker
      _on(panel, '[data-pe-text-color-picker]', 'input', (e) => {
        _state.text.color = e.target.value;
        _redraw();
      });
      _on(panel, '[data-pe-text-color-picker]', 'change', () => _pushHistory());
      _on(panel, '[data-pe-text-bg]', 'click', () => {
        _state.text.bg = !_state.text.bg;
        _renderPanel(); _redraw(); _pushHistory();
      });
      _each(panel, '[data-pe-text-prefill]', 'click', (e) => {
        const w = e.currentTarget.dataset.peTextPrefill;
        if (w === 'service') _state.text.value = _state.serviceName || '시술 결과';
        else if (w === 'price') _state.text.value = _state.price ? (_state.price / 10000).toFixed(0) + '만원' : '가격 문의';
        _renderPanel(); _redraw();
      });
    },
    brand(panel) {
      _on(panel, '[data-pe-wm-val]', 'input', (e) => { _state.watermark.value = e.target.value; _redraw(); });
      _each(panel, '[data-pe-wm-pos]', 'click', (e) => { _state.watermark.position = e.currentTarget.dataset.peWmPos; _renderPanel(); _redraw(); });
      _on(panel, '[data-pe-wm-opacity]', 'input', (e) => { _state.watermark.opacity = +e.target.value / 100; _redraw(); });
      _on(panel, '[data-pe-wm-save]', 'click', _saveBrandWm);
      _on(panel, '[data-pe-wm-kit]', 'click', () => {
        if (window.BrandKit && typeof window.BrandKit.open === 'function') window.BrandKit.open();
        else _toast('Brand Kit 모듈을 불러오는 중이에요');
      });
      _bindBrandKitSync();
      if (!_state.watermark.value && _state.shopName) {
        _state.watermark.value = _state.shopName;
        const inp = panel.querySelector('[data-pe-wm-val]');
        if (inp) inp.value = _state.watermark.value;
        _redraw();
      }
    },
    export(panel) {
      _each(panel, '[data-pe-ratio]',  'click', (e) => { _state.ratio = e.currentTarget.dataset.peRatio; _renderPanel(); _redraw(); _pushHistory(); });
      _each(panel, '[data-pe-export]', 'click', (e) => _exportImage(e.currentTarget.dataset.peExport));
      // [v206] 배치 편집 — 슬롯 다른 사진에 같은 보정 일괄 적용
      _on(panel, '[data-pe-batch-apply]', 'click', _applyBatchToSlot);
    },
  };
  function _bindPanel(panel, tab) {
    const ext = _externalPanels[tab];
    if (ext && typeof ext.bind === 'function') { try { ext.bind(panel, _state, _helpers); } catch (_e) { void _e; } return; }
    if (_BINDERS[tab]) _BINDERS[tab](panel);
  }

  // ── 자동 보정 프리셋 ─────────────────────────────────
  // [v183 2026-05-18] 강도 토글 (natural/standard/strong) + 업종별 4 분기
  //   기존 PhotoEnhance.getShopPreset(shopType, intensity) 시그니처 활용.
  // [v202] makeup·scalp 카테고리 추가, nail/wax 한국어 hint
  const _SHOP_HINT = { hair: '헤어', scalp: '두피', makeup: '메이크업', lash: '속눈썹', nail: '네일', wax: '왁싱' };
  function _applyAutoShop(forceShop) {
    const PE = window.PhotoEnhance;
    if (!PE || !PE.getShopPreset) return _toast('PhotoEnhance 모듈을 불러오는 중이에요');
    const intensity = _state.autoIntensity || 'standard';
    const preset = forceShop
      ? PE.getShopPreset(_SHOP_HINT[forceShop] || '', intensity)
      : PE.getShopPreset(undefined, intensity);
    if (!preset) return _toast('업종 설정이 없어요');
    Object.assign(_state.adjust, preset.adjust);
    Object.assign(_state.beauty, preset.beauty);
    _redraw(); _pushHistory();
    _toast(preset.label + ' 자동 (' + (intensity === 'natural' ? '자연' : intensity === 'strong' ? '강조' : '표준') + ') 적용');
  }
  // [v204 2026-05-19] 다중 텍스트 레이어 헬퍼 — _state.text ↔ active layer 동기화
  function _ensureLayers() {
    if (!_state) return;
    if (!Array.isArray(_state.layers)) _state.layers = [];
    // 마이그레이션: layers 비었지만 text 가 있으면 layer 1개 생성
    if (_state.layers.length === 0) {
      const id = 'lyr-' + Date.now();
      _state.layers.push(Object.assign({ id, type: 'text' }, _state.text || {}));
      _state.activeLayerId = id;
    }
    // active 가 없거나 사라졌으면 첫 번째 layer 활성
    if (!_state.activeLayerId || !_state.layers.find(l => l.id === _state.activeLayerId)) {
      _state.activeLayerId = _state.layers[0].id;
    }
    // active layer → _state.text 동기화 (alias)
    const active = _state.layers.find(l => l.id === _state.activeLayerId);
    if (active) _state.text = active;
  }
  function _syncTextToLayer() {
    if (!_state || !Array.isArray(_state.layers) || !_state.activeLayerId) return;
    const idx = _state.layers.findIndex(l => l.id === _state.activeLayerId);
    if (idx >= 0) _state.layers[idx] = Object.assign({}, _state.layers[idx], _state.text, { id: _state.activeLayerId, type: 'text' });
  }
  function _addLayer() {
    _ensureLayers();
    const id = 'lyr-' + Date.now();
    _state.layers.push({
      id, type: 'text',
      value: '', x: 0.5, y: 0.5 + (_state.layers.length * 0.08), color: '#ffffff',
      font: 'sans', size: 6, bg: false, stroke: false, rot: 0,
    });
    _state.activeLayerId = id;
    _state.text = _state.layers[_state.layers.length - 1];
    _renderPanel(); _redraw(); _pushHistory();
    _toast('새 텍스트 레이어 추가 (총 ' + _state.layers.length + '개)');
  }
  function _deleteLayer() {
    if (!_state || !_state.layers || _state.layers.length <= 1) return _toast('최소 1개는 남겨야 해요');
    const idx = _state.layers.findIndex(l => l.id === _state.activeLayerId);
    if (idx < 0) return;
    _state.layers.splice(idx, 1);
    _state.activeLayerId = _state.layers[Math.min(idx, _state.layers.length - 1)].id;
    _ensureLayers();  // _state.text 재동기
    _renderPanel(); _redraw(); _pushHistory();
    _toast('레이어 삭제 (남은 ' + _state.layers.length + '개)');
  }
  function _selectLayer(id) {
    _state.activeLayerId = id;
    _ensureLayers();
    _renderPanel(); _redraw();
  }
  function _moveLayerUp() {
    if (!_state || !_state.layers || _state.layers.length <= 1) return;
    const idx = _state.layers.findIndex(l => l.id === _state.activeLayerId);
    if (idx <= 0) return _toast('이미 맨 위');
    [_state.layers[idx - 1], _state.layers[idx]] = [_state.layers[idx], _state.layers[idx - 1]];
    _renderPanel(); _redraw(); _pushHistory();
  }

  // [v206 2026-05-19] 배치 편집 — 현재 _state.adjust + _state.beauty 를 슬롯 다른 사진에 일괄 적용.
  //   ChatAutoEdit.processPhoto 가 있으면 활용 (headless canvas 합성). 없으면 폴백.
  async function _applyBatchToSlot() {
    const slotInfo = _peGetCurrentSlot();
    if (!slotInfo) return _toast('현재 슬롯을 찾지 못했어요');
    const slot = (window._slots || []).find(s => s && s.id === slotInfo.id);
    if (!slot) return _toast('슬롯 데이터 없음');
    const photos = (slot.photos || []).filter(p => p && !p.hidden);
    if (!photos.length) return _toast('적용할 사진이 없어요');
    const ok = (typeof window.confirm === 'function')
      ? window.confirm(`슬롯 사진 ${photos.length}장에 현재 보정을 일괄 적용할까요? 원본은 보존되고 편집본만 갱신.`)
      : true;
    if (!ok) return;
    _toast('배치 보정 중… (' + photos.length + '장)');

    // 현재 슬라이더 값 스냅샷
    const adjust = JSON.parse(JSON.stringify(_state.adjust));
    const beauty = JSON.parse(JSON.stringify(_state.beauty));

    let done = 0, fail = 0;
    for (const photo of photos) {
      try {
        const srcUrl = photo.dataUrl || photo.editedDataUrl;
        if (!srcUrl) { fail++; continue; }
        // headless 처리 — _redraw 와 유사 흐름
        const result = await _composeWithSettings(srcUrl, adjust, beauty);
        if (result) { photo.editedDataUrl = result; done++; }
        else { fail++; }
      } catch (_e) { fail++; }
    }
    // 갤러리 DB 저장 (있을 때만)
    try {
      if (typeof window.saveSlotToDB === 'function') await window.saveSlotToDB(slot);
    } catch (_e) { void _e; }
    _toast(`배치 보정 완료: ${done}장 성공, ${fail}장 실패`);
    try { window.dispatchEvent(new CustomEvent('itdasy:gallery:photo-replaced', { detail: { kind: 'batch_edit', slotId: slot.id, count: done } })); }
    catch (_e) { void _e; }
  }

  // headless 합성 — 한 사진에 adjust + beauty 픽셀 walk 적용 후 dataURL 반환.
  //   메인 _redraw 와 별도로 임시 canvas 사용 (현재 편집 중 사진 영향 X).
  async function _composeWithSettings(srcDataUrl, adjust, beauty) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const iw = img.naturalWidth, ih = img.naturalHeight;
          const k = Math.min(1080, iw) / iw;
          const dw = Math.round(iw * k), dh = Math.round(ih * k);
          const cv = document.createElement('canvas');
          cv.width = dw; cv.height = dh;
          const ctx = cv.getContext('2d');
          const temp = adjust.temperature || 0;
          const sepia = Math.max(0, temp) / 100, contrast = 100 + Math.max(0, -temp) * 0.3;
          ctx.filter = `brightness(${adjust.brightness}%) saturate(${adjust.saturate}%) contrast(${contrast}%) sepia(${sepia})`;
          ctx.drawImage(img, 0, 0, iw, ih, 0, 0, dw, dh);
          ctx.filter = 'none';
          if (adjust.sharpness > 10) _unsharpMask(ctx, dw, dh, adjust.sharpness / 100);
          // beauty hook 호출
          if (typeof _drawHooks.beauty === 'function') {
            try { _drawHooks.beauty(ctx, dw, dh, beauty, _helpers); } catch (_e) { void _e; }
          }
          resolve(cv.toDataURL('image/jpeg', 0.92));
        } catch (_e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = srcDataUrl;
    });
  }

  // [v202 2026-05-18] 사진 회전·좌우/상하 반전 (S1-3) — originalImg 자체를 변환 후 swap.
  //   rotL/rotR/flipH/flipV. swap 시 history push.
  function _applyTransform(kind) {
    if (!_state || !_state.originalImg) return _toast('편집할 사진이 없어요');
    const img = _state.originalImg;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d');
    if (kind === 'rotL' || kind === 'rotR') {
      cv.width = ih; cv.height = iw;
      ctx.translate(cv.width / 2, cv.height / 2);
      ctx.rotate((kind === 'rotL' ? -90 : 90) * Math.PI / 180);
      ctx.drawImage(img, -iw / 2, -ih / 2);
    } else {
      cv.width = iw; cv.height = ih;
      if (kind === 'flipH') { ctx.translate(iw, 0); ctx.scale(-1, 1); }
      else if (kind === 'flipV') { ctx.translate(0, ih); ctx.scale(1, -1); }
      ctx.drawImage(img, 0, 0);
    }
    const dataUrl = cv.toDataURL('image/jpeg', 0.95);
    const newImg = new Image();
    newImg.crossOrigin = 'anonymous';
    newImg.onload = () => {
      _state.originalImg = newImg;
      _state.originalSrc = dataUrl;
      // bg 가 적용된 경우 누끼 캐시 무효 — 방향 바뀌면 다시
      _state.removedBgDataUrl = null;
      _pushHistory(); _redraw();
      _toast({ rotL: '왼쪽 90° 회전', rotR: '오른쪽 90° 회전', flipH: '좌우 반전', flipV: '상하 반전' }[kind] || '변환');
    };
    newImg.onerror = () => _toast('변환 실패');
    newImg.src = dataUrl;
  }

  function _applyAuto(kind) {
    if (kind === 'shop')  return _applyAutoShop();
    // [v202] 신규 카테고리 추가: scalp, makeup
    if (['hair','scalp','makeup','lash','nail','wax'].includes(kind)) return _applyAutoShop(kind);
    if (kind === 'all')   _state.adjust = { brightness: 105, saturate: 110, sharpness: 30, temperature: 5 };
    if (kind === 'bright')_state.adjust = { ..._state.adjust, brightness: 115 };
    if (kind === 'vivid') _state.adjust = { ..._state.adjust, saturate: 120, sharpness: 40 };
    if (kind === 'warm')  _state.adjust = { ..._state.adjust, temperature: 18 };
    if (kind === 'cool')  _state.adjust = { ..._state.adjust, temperature: -18 };
    _redraw(); _pushHistory(); _toast('보정 적용 완료');
  }

  // ── 캔버스 합성 ───────────────────────────────────────
  function _redraw() {
    const cv = document.getElementById('peCanvas'), empty = document.getElementById('peCanvasEmpty');
    if (!cv || !_state) return;
    if (!_state.originalImg) { cv.style.display = 'none'; if (empty) empty.style.display = 'flex'; return; }
    if (empty) empty.style.display = 'none';
    cv.style.display = 'block';
    const img = _state.originalImg;
    // 템플릿 활성화 시 외부 훅으로 분기.
    if (_state.template.id && typeof _drawHooks.template === 'function') {
      try { _drawHooks.template(cv, img, _state, _helpers); return; } catch (_e) { void _e; }
    }
    const { sx, sy, sw, sh, dw, dh } = _computeCrop(img, _state.ratio);
    cv.width = dw; cv.height = dh;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, dw, dh);
    if (_state.showOriginal) { ctx.filter = 'none'; ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh); return; }
    const a = _state.adjust, temp = a.temperature;
    const sepia = Math.max(0, temp) / 100, contrast = 100 + Math.max(0, -temp) * 0.3;
    ctx.filter = `brightness(${a.brightness}%) saturate(${a.saturate}%) contrast(${contrast}%) sepia(${sepia})`;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
    if (a.sharpness > 10) _unsharpMask(ctx, dw, dh, a.sharpness / 100);
    if (typeof _drawHooks.beauty === 'function') {
      try { _drawHooks.beauty(ctx, dw, dh, _state.beauty, _helpers); } catch (_e) { void _e; }
    }
    // [v204 2026-05-19] 다중 텍스트 레이어 — layers[] 우선, 없으면 단일 text 폴백
    if (Array.isArray(_state.layers) && _state.layers.length > 0) {
      _state.layers.forEach(l => { if (l && l.value) _drawText(ctx, dw, dh, l); });
    } else if (_state.text && _state.text.value) {
      _drawText(ctx, dw, dh, _state.text);
    }
    if (_state.watermark.value) _drawWatermark(ctx, dw, dh, _state.watermark);
  }

  function _computeCrop(img, ratio) {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    if (ratio === 'original') {
      const maxW = Math.min(1080, iw), k = maxW / iw;
      return { sx: 0, sy: 0, sw: iw, sh: ih, dw: Math.round(iw * k), dh: Math.round(ih * k) };
    }
    const [rw, rh] = ratio.split(':').map(Number);
    const targetAR = rw / rh, imgAR = iw / ih;
    let sw, sh, sx, sy;
    if (imgAR > targetAR) { sh = ih; sw = Math.round(ih * targetAR); sx = Math.round((iw - sw) / 2); sy = 0; }
    else                  { sw = iw; sh = Math.round(iw / targetAR); sx = 0; sy = Math.round((ih - sh) / 2); }
    const outW = Math.min(1080, sw), outH = Math.round(outW / targetAR);
    return { sx, sy, sw, sh, dw: outW, dh: outH };
  }

  // 간단 unsharp mask — 박스 블러로 저주파 만든 뒤 (원본 - 저주파) 가산.
  function _clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
  function _boxBlur(img, w, h, r) {
    const out = new ImageData(w, h);
    const d = img.data, o = out.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let rSum = 0, gSum = 0, bSum = 0, n = 0;
      for (let kx = -r; kx <= r; kx++) {
        const xx = Math.min(w - 1, Math.max(0, x + kx)), p = (y * w + xx) * 4;
        rSum += d[p]; gSum += d[p+1]; bSum += d[p+2]; n++;
      }
      const p = (y * w + x) * 4;
      o[p] = rSum / n; o[p+1] = gSum / n; o[p+2] = bSum / n; o[p+3] = d[p+3];
    }
    return out;
  }
  function _unsharpMask(ctx, w, h, strength) {
    try {
      const src = ctx.getImageData(0, 0, w, h);
      const blur = _boxBlur(src, w, h, 1);
      const out = ctx.createImageData(w, h);
      const k = 1 + strength * 1.2;
      for (let i = 0; i < src.data.length; i += 4) {
        out.data[i]   = _clamp(src.data[i]   + (src.data[i]   - blur.data[i])   * (k - 1));
        out.data[i+1] = _clamp(src.data[i+1] + (src.data[i+1] - blur.data[i+1]) * (k - 1));
        out.data[i+2] = _clamp(src.data[i+2] + (src.data[i+2] - blur.data[i+2]) * (k - 1));
        out.data[i+3] = src.data[i+3];
      }
      ctx.putImageData(out, 0, 0);
    } catch (_e) { /* CORS·메모리 부족 시 skip */ }
  }

  // [v184 2026-05-18] 텍스트 렌더 — 폰트 4종 + 색상 + 배경 박스 + 사이즈
  // [v206 2026-05-19] Google Fonts 5종 추가 — 모두 OFL/Apache 상업 OK.
  //   Playfair Display, Noto Serif KR, Black Han Sans, Gowun Dodum, Gaegu, Nanum Pen Script
  const _FONT_FAM = {
    sans:     'Pretendard, "Noto Sans KR", sans-serif',
    serif:    'Georgia, "Noto Serif KR", serif',
    playfair: '"Playfair Display", "Noto Serif KR", Georgia, serif',
    nserif:   '"Noto Serif KR", "Nanum Myeongjo", serif',
    bhan:     '"Black Han Sans", "Noto Sans KR", sans-serif',
    gowun:    '"Gowun Dodum", "Noto Sans KR", sans-serif',
    gaegu:    '"Gaegu", "Noto Sans KR", cursive',
    nanumpen: '"Nanum Pen Script", "Gaegu", cursive',
    hand:     '"Brush Script MT", "Nanum Pen Script", cursive',
  };
  function _drawText(ctx, w, h, t) {
    if (!t.value) return;
    ctx.save();
    const sizeK = (t.size || 6) / 100;  // 3~12 → 0.03~0.12
    const fs = Math.round(w * sizeK);
    const fam = _FONT_FAM[t.font] || _FONT_FAM.sans;
    const weight = t.font === 'hand' || t.font === 'serif' ? '700' : '800';
    ctx.font = `${weight} ${fs}px ${fam}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tx = w * t.x, ty = h * t.y;
    // [v188] 회전 — ctx.translate + rotate. 텍스트 그리는 좌표는 (0,0)
    const rot = +t.rot || 0;
    if (rot !== 0) {
      ctx.translate(tx, ty);
      ctx.rotate(rot * Math.PI / 180);
      ctx.translate(-tx, -ty);
    }
    // [v190] 다중 줄 — \n 으로 split, lineHeight = fs * 1.25
    const lines = String(t.value).split('\n').filter(s => s.length > 0);
    const lineH = Math.round(fs * 1.25);
    const totalH = lineH * lines.length;
    // 배경 박스 — 가장 넓은 줄 기준
    if (t.bg) {
      let maxW = 0;
      for (const ln of lines) maxW = Math.max(maxW, ctx.measureText(ln).width);
      const padX = Math.round(fs * 0.4), padY = Math.round(fs * 0.25);
      const bw = Math.min(w * 0.95, maxW + padX * 2);
      const bh = totalH + padY * 2;
      const isLight = (t.color === '#ffffff' || t.color === '#FFC83D');
      ctx.fillStyle = isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.85)';
      ctx.fillRect(tx - bw / 2, ty - bh / 2, bw, bh);
    } else if (!t.stroke) {
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = Math.round(fs * 0.18);
    }
    // [v188] 외곽선
    if (t.stroke) {
      ctx.lineWidth = Math.max(2, Math.round(fs * 0.08));
      ctx.lineJoin = 'round';
      const isLight = (t.color === '#ffffff' || t.color === '#FFC83D');
      ctx.strokeStyle = isLight ? '#000' : '#fff';
    }
    ctx.fillStyle = t.color || '#ffffff';
    // 각 줄 그리기 — 첫 줄이 중앙 위쪽에서 시작하도록 ty 보정
    const startY = ty - (totalH - lineH) / 2;
    lines.forEach((ln, i) => {
      const y = startY + i * lineH;
      if (t.stroke) ctx.strokeText(ln, tx, y, w * 0.9);
      ctx.fillText(ln, tx, y, w * 0.9);
    });
    ctx.restore();
  }

  // wm.position 매핑: [align, baseline, x계수, y계수] — x = w*fx + pad*sign, y = h*fy + pad*sign
  const _WM_POS = {
    tl: ['left',  'top',    0, 0,  1,  1],
    tr: ['right', 'top',    1, 0, -1,  1],
    bl: ['left',  'bottom', 0, 1,  1, -1],
    br: ['right', 'bottom', 1, 1, -1, -1],
  };
  function _drawWatermark(ctx, w, h, wm) {
    ctx.save();
    const fs = Math.max(12, Math.round(w * 0.022));
    ctx.font = `600 ${fs}px Pretendard, "Noto Sans KR", sans-serif`;
    ctx.globalAlpha = wm.opacity;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4;
    const pad = Math.round(w * 0.025);
    const c = _WM_POS[wm.position] || _WM_POS.br;
    ctx.textAlign = c[0]; ctx.textBaseline = c[1];
    ctx.fillText(wm.value, w * c[2] + pad * c[4], h * c[3] + pad * c[5]);
    ctx.restore();
  }

  // ── history ──────────────────────────────────────────
  // [v204 2026-05-19] layers + activeLayerId snapshot — undo/redo 시 다중 텍스트 복원
  const _SNAP_KEYS = ['adjust', 'ratio', 'text', 'watermark', 'beauty', 'template', 'autoIntensity', 'layers', 'activeLayerId'];
  function _snapshot() {
    const o = {};
    for (const k of _SNAP_KEYS) o[k] = _state[k];
    return JSON.parse(JSON.stringify(o));
  }
  function _pushHistory() {
    if (!_state) return;
    _state.history = _state.history.slice(0, _state.historyCursor + 1);
    _state.history.push(_snapshot());
    if (_state.history.length > 20) _state.history.shift();
    _state.historyCursor = _state.history.length - 1;
  }
  function _undo() {
    if (!_state || _state.historyCursor <= 0) return _toast('되돌릴 작업이 없어요');
    _state.historyCursor -= 1;
    const s = _state.history[_state.historyCursor];
    for (const k of _SNAP_KEYS) if (s[k] !== undefined) _state[k] = s[k];
    if (typeof _ensureLayers === 'function') _ensureLayers();  // [v204] reference 재동기
    _renderPanel(); _redraw();
  }
  // [v183 2026-05-18] Redo — historyCursor 가 history.length-1 보다 작으면 앞으로.
  function _redo() {
    if (!_state || _state.historyCursor >= _state.history.length - 1) return _toast('다시 실행할 작업이 없어요');
    _state.historyCursor += 1;
    const s = _state.history[_state.historyCursor];
    for (const k of _SNAP_KEYS) if (s[k] !== undefined) _state[k] = s[k];
    if (typeof _ensureLayers === 'function') _ensureLayers();  // [v204] reference 재동기
    _renderPanel(); _redraw();
  }

  function _toggleCompare() {
    _state.showOriginal = !_state.showOriginal; _redraw();
    setTimeout(() => { _state.showOriginal = false; _redraw(); }, 800);
  }

  // ── 저장 / 내보내기 ───────────────────────────────────
  async function _save() { return _exportImage('png'); }
  async function _exportImage(format) {
    if (!_state || !_state.originalImg) return _toast('편집할 사진이 없어요');
    const cv = document.getElementById('peCanvas');
    if (!cv) return;
    const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
    cv.toBlob((blob) => {
      if (!blob) return _toast('저장 실패 — 다시 시도해 주세요');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'itdasy-edit-' + Date.now() + '.' + format;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
      _toast(format.toUpperCase() + ' 저장 완료');
      if (_state) _state._savedAtCursor = _state.historyCursor;  // [v188] 미저장 경고용 마킹
      try { window.dispatchEvent(new CustomEvent('itdasy:gallery:photo-replaced', { detail: { kind: 'export_marketing_image', source: 'photo-editor' } })); }
      catch (_e) { void _e; }
      _showNextSteps(cv);
    }, mime, 0.95);
  }

  // ── 다음 단계 모달 ────────────────────────────────────
  function _nsCaption() {
    if (typeof window.openCaptionScenarioPopup === 'function') {
      try { window.openCaptionScenarioPopup(); _toast('캡션 시나리오를 열었어요'); }
      catch (_e) { _toast('캡션 화면을 여는 중 문제가 생겼어요'); }
    } else _toast('캡션 모듈을 찾을 수 없어요');
  }
  function _nsInstagram(dataUrl) {
    if (typeof window.openInstagramPreview === 'function') {
      try {
        // [2026-05-18] 편집기 → 인스타 미리보기 ratio 자동 전달.
        const _curRatio = (_state && _state.ratio) ? _state.ratio : '1:1';
        window.openInstagramPreview({ ratio: _curRatio, src: dataUrl });
      } catch (_e) { _toast('인스타 미리보기 화면을 여는 중 문제가 생겼어요'); }
    } else if (typeof window.showTab === 'function') { window.showTab('finish'); _toast('마무리 탭으로 이동했어요'); }
    else _toast('인스타 미리보기 화면을 찾을 수 없어요');
  }
  function _showNextSteps(cv) {
    document.getElementById('peNextStepsModal')?.remove();
    const dataUrl = (() => { try { return cv.toDataURL('image/png'); } catch (_e) { return ''; } })();
    const m = document.createElement('div');
    m.id = 'peNextStepsModal'; m.className = 'pe-modal';
    m.innerHTML = `<div class="pe-modal-backdrop" data-pe-ns="close"></div><div class="pe-modal-card">
      <div class="pe-modal-head"><strong>저장 완료! 다음에 뭘 할까요?</strong><button type="button" class="pe-iconbtn" data-pe-ns="close" aria-label="닫기">×</button></div>
      ${dataUrl ? `<div class="pe-modal-thumb"><img src="${dataUrl}" alt="편집본 미리보기" /></div>` : ''}
      <div class="pe-modal-actions"><button type="button" class="pe-action-btn" data-pe-ns="caption">✨ 캡션 만들기</button><button type="button" class="pe-action-btn" data-pe-ns="attach">📎 고객 기록에 첨부</button><button type="button" class="pe-action-btn" data-pe-ns="instagram">📷 인스타 미리보기</button></div>
      <div class="pe-hint" style="text-align:center;margin-top:10px;">다시 편집하려면 닫고 슬라이더를 조정하세요.</div></div>`;
    document.body.appendChild(m);
    m.addEventListener('click', (e) => {
      const act = e.target.closest('[data-pe-ns]')?.dataset.peNs;
      if (!act) return;
      if (act === 'close') return m.remove();
      m.remove();
      if (act === 'caption') _nsCaption();
      else if (act === 'attach') _toast('편집본을 고객 상세의 사진에 첨부하려면 시술 기록 화면을 열어주세요 (P1 결선 예정)');
      else if (act === 'instagram') _nsInstagram(dataUrl);
    });
  }

  // ── 사진 로드 ─────────────────────────────────────────
  function _loadImage(src) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { _state.originalImg = img; _state.originalSrc = src; _pushHistory(); _redraw(); };
    img.onerror = () => _toast('사진을 불러오지 못했어요');
    img.src = src;
  }

  // ── 공개 API ──────────────────────────────────────────
  function _open(opts) {
    opts = opts || {};
    const sheet = _ensureSheet();
    _state = _initState(opts);
    sheet.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    _renderTabs(); _renderPanel(); _redraw();
    if (opts.src) _loadImage(opts.src);
    _pushHistoryState();
    // [v203 2026-05-19] 핀치 줌 attach — wrap 자식 (메인 canvas + 마스크 + 커서) 모두 같이 변환
    try {
      if (window.PhotoEditor && typeof window.PhotoEditor._zoomAttach === 'function') {
        const wrap = sheet.querySelector('.pe-canvas-wrap');
        if (wrap) window.PhotoEditor._zoomAttach(wrap, _state);
      }
    } catch (_e) { void _e; }
  }
  function _close(fromHistory) {
    // [v188] 미저장 변경 경고 — historyCursor > 0 = 슬라이더/마스크 적용 변경 있음.
    //   _savedSinceOpen 가 마지막 _save 시점의 cursor 와 같으면 패스 (이미 저장)
    if (_state && _state.history && _state.history.length > 1) {
      const dirty = (_state.historyCursor > 0) && (_state._savedAtCursor !== _state.historyCursor);
      if (dirty && !fromHistory) {
        const ok = (typeof window.confirm === 'function')
          ? window.confirm('편집한 내용이 저장되지 않았어요. 정말 닫을까요?')
          : true;
        if (!ok) return;
      }
    }
    const sheet = document.getElementById('photoEditorSheet');
    if (sheet) sheet.style.display = 'none';
    document.body.style.overflow = '';
    try { if (window.PhotoEditor && typeof window.PhotoEditor._brushCleanup === 'function') window.PhotoEditor._brushCleanup(); }
    catch (_e) { void _e; }
    // [v203] 핀치 줌 cleanup — wrap transform 초기화 + 이벤트 해제
    try { if (window.PhotoEditor && typeof window.PhotoEditor._zoomCleanup === 'function') window.PhotoEditor._zoomCleanup(); }
    catch (_e) { void _e; }
    _state = null;
    if (!fromHistory && _historyPushed) { _historyPushed = false; try { history.back(); } catch (_e) { void _e; } }
  }
  function _openFromAction(p) {
    p = p || {};
    return _open({ src: p.photo_url || p.src, initial_tab: p.initial_tab || 'auto', serviceName: p.service_name || '', price: +p.price || 0 });
  }

  // 외부 모듈용 helpers (beauty / templates).
  const _helpers = {
    esc: _esc, toast: _toast, scheduleRedraw: _scheduleRedraw, redraw: _redraw,
    pushHistory: _pushHistory, renderPanel: _renderPanel, drawWatermark: _drawWatermark, slider: _slider,
  };

  // [v205 2026-05-19] 스티커 라이브러리 외부 호출 — 새 layer 추가
  function _addStickerLayer(preset) {
    if (!_state) return;
    _ensureLayers();
    const id = 'lyr-' + Date.now();
    // preset 은 { value, color, font, size, bg, stroke }
    _state.layers.push(Object.assign({
      id, type: 'text',
      x: 0.5, y: 0.5 + (_state.layers.length * 0.06), rot: 0,
    }, preset));
    _state.activeLayerId = id;
    _state.text = _state.layers[_state.layers.length - 1];
    _renderPanel(); _redraw(); _pushHistory();
    _toast('스티커 추가: ' + (preset.value || ''));
  }

  window.PhotoEditor = { open: _open, close: _close, openFromAction: _openFromAction, addStickerLayer: _addStickerLayer };
  // 외부 모듈 (beauty / templates) 등록 API.
  //   registerTabPanel(tabId, { html: (state)=>string, bind: (panel, state, helpers)=>void })
  //   registerDrawHook(name, fn)   • name: 'beauty' | 'template' (호출은 _redraw 안)
  window.PhotoEditor._internal = {
    registerTabPanel: (id, p) => { _externalPanels[id] = p || {}; },
    registerDrawHook: (name, fn) => { _drawHooks[name] = fn; },
    helpers: _helpers,
  };

  // app-assistant.js 로컬 핸들러로 등록 — kind=open_photo_editor 액션 카드 "실행" 시
  function _registerLocal() {
    const A = window.ItdasyAssistant;
    if (!A || typeof A.registerLocalHandler !== 'function') return false;
    A.registerLocalHandler('open_photo_editor', async (action) => {
      _openFromAction((action && action.payload) || {});
      return { message: '편집기를 열었어요' };
    });
    return true;
  }
  if (!_registerLocal()) {
    let tries = 0;
    const iv = setInterval(() => { if (_registerLocal() || ++tries > 50) clearInterval(iv); }, 100);
  }
})();
