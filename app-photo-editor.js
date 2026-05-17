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
    { id: 'beauty', label: '뷰티' }, { id: 'bg', label: '누끼·배경' },
    { id: 'template', label: '템플릿' }, { id: 'text', label: '텍스트' },
    { id: 'brand', label: '브랜드' }, { id: 'export', label: '내보내기' },
  ];

  let _state = null;                  // 합성 상태 (단일 세션)
  const _externalPanels = {};         // tabId -> { html, bind }   (외부 모듈 등록)
  const _drawHooks = {};              // name  -> fn               (외부 모듈 등록)

  // 드래그 슬라이더 동안 픽셀 합성 폭주 방지 — 80ms throttle.
  let _redrawScheduled = null;
  function _scheduleRedraw() {
    if (_redrawScheduled) return;
    _redrawScheduled = setTimeout(() => {
      _redrawScheduled = null;
      try { _redraw(); } catch (_e) { void _e; }
    }, 80);
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
      adjust: { brightness: 100, saturate: 100, sharpness: 0, temperature: 0 },
      beauty: { skin: 0, redness: 0, hairShine: 0, nailGloss: 0, lashSharp: 0, blemish: 0, handSkin: 0, hairColor: 0, hairDetail: 0, eyeShadow: 0 },
      template: { id: null, leftLabel: '전', rightLabel: '후', reviewText: '', priceLines: '' },
      text: { value: '', x: 0.5, y: 0.92, color: '#ffffff' },
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

  const _ACTS = { close: () => _close(), undo: () => _undo(), save: () => _save(), compare: () => _toggleCompare() };
  function _bindSheet(sheet) {
    sheet.addEventListener('click', (e) => {
      const act = e.target.closest('[data-pe-act]')?.dataset.peAct;
      if (act === 'pick') return sheet.querySelector('#pePicker').click();
      if (_ACTS[act]) return _ACTS[act]();
      const tab = e.target.closest('[data-pe-tab]')?.dataset.peTab;
      if (tab) { _state.activeTab = tab; _renderTabs(); _renderPanel(); }
    });
    const cv = sheet.querySelector('#peCanvas');
    // 롱프레스 = 원본 비교
    let t = null;
    const start = () => { t = setTimeout(() => { _state.showOriginal = true; _redraw(); }, 250); };
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
    return `<div class="pe-panel-row"><button type="button" class="pe-action-btn" data-pe-auto="all">⚡ 한 번에 자동 보정</button></div>
      <div class="pe-panel-row"><button type="button" class="pe-action-btn" data-pe-auto="shop">⚡ 우리 샵 업종 자동 (현재: ${_esc(shopLabel)})</button></div>
      <div class="pe-panel-row pe-panel-grid-2">${_CHIP('auto','bright','밝게')}${_CHIP('auto','vivid','선명')}${_CHIP('auto','warm','따뜻하게')}${_CHIP('auto','cool','차갑게')}</div>
      <div class="pe-hint">자연 보정 위주. 시술 결과가 왜곡되지 않게 보수적 강도로 들어갑니다.</div>`;
  }
  function _panelTune() {
    const a = _state.adjust;
    return `${_slider('밝기','brightness',a.brightness,50,150,1)}${_slider('채도','saturate',a.saturate,50,150,1)}${_slider('선명도','sharpness',a.sharpness,0,100,1)}${_slider('색온도','temperature',a.temperature,-50,50,1)}
      <div class="pe-panel-row" style="margin-top:8px;"><button type="button" class="pe-chip-btn" data-pe-tune-reset>모두 초기화</button></div>`;
  }
  function _panelBg() {
    return `<div class="pe-panel-row"><button type="button" class="pe-action-btn" data-pe-bg="open-existing">기존 누끼·배경 화면 열기</button></div>
      <div class="pe-hint">알파 보정·프리셋 4종·서버 누끼 모두 기존 안정 흐름을 그대로 사용해요.<br>편집기 내부 통합은 P1에서 마무리됩니다.</div>`;
  }
  function _panelText() {
    const t = _state.text;
    return `<label class="pe-field"><span>텍스트</span><input type="text" class="pe-input" data-pe-text-val placeholder="시술명·이벤트 문구 등" value="${_esc(t.value)}" maxlength="40" /></label>
      <div class="pe-panel-row pe-panel-grid-2" style="margin-top:8px;">${_CHIP('text-prefill','service','시술명 자동')}${_CHIP('text-prefill','price','가격 자동')}</div>
      <label class="pe-slider"><div class="pe-slider-head"><span>위치 (위↔아래)</span><span class="pe-slider-val">${Math.round(t.y*100)}</span></div><input type="range" min="5" max="95" value="${Math.round(t.y*100)}" data-pe-text-y /></label>
      <div class="pe-hint">P1: 폰트 8종 / 색상 / 배경 박스 / 그림자 추가 예정.</div>`;
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
    return `<div class="pe-field-label">비율</div>
      <div class="pe-panel-row pe-panel-grid-4">${['original','1:1','4:5','9:16'].map(rv => _CHIP('ratio', rv, rv === 'original' ? '원본' : rv, r===rv)).join('')}</div>
      <div class="pe-panel-row pe-panel-grid-2" style="margin-top:12px;"><button type="button" class="pe-action-btn" data-pe-export="png">PNG 저장</button><button type="button" class="pe-action-btn" data-pe-export="jpg">JPG 저장</button></div>
      <div class="pe-hint">저장 시 원본은 보존됩니다. 편집본만 다운로드 또는 갤러리에 추가돼요.</div>`;
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
    auto(panel) { _each(panel, '[data-pe-auto]', 'click', e => _applyAuto(e.currentTarget.dataset.peAuto)); },
    tune(panel) {
      _each(panel, '[data-pe-slider]', 'input', (e) => {
        const inp = e.currentTarget, key = inp.dataset.peSlider;
        _state.adjust[key] = +inp.value;
        const out = panel.querySelector(`[data-pe-slider-val="${key}"]`);
        if (out) out.textContent = inp.value;
        _scheduleRedraw();
      });
      _each(panel, '[data-pe-slider]', 'change', () => _pushHistory());
      _on(panel, '[data-pe-tune-reset]', 'click', () => {
        _state.adjust = { brightness: 100, saturate: 100, sharpness: 0, temperature: 0 };
        _renderPanel(); _redraw(); _pushHistory();
      });
    },
    bg(panel) {
      _on(panel, '[data-pe-bg="open-existing"]', 'click', () => {
        _toast('기존 누끼·배경 화면을 여는 중…');
        (window.openGalleryBg || window.openBgGallery || (() => {}))();
      });
    },
    text(panel) {
      _on(panel, '[data-pe-text-val]', 'input', (e) => { _state.text.value = e.target.value; _redraw(); });
      _on(panel, '[data-pe-text-y]',   'input', (e) => { _state.text.y = +e.target.value / 100; _redraw(); });
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
    },
  };
  function _bindPanel(panel, tab) {
    const ext = _externalPanels[tab];
    if (ext && typeof ext.bind === 'function') { try { ext.bind(panel, _state, _helpers); } catch (_e) { void _e; } return; }
    if (_BINDERS[tab]) _BINDERS[tab](panel);
  }

  // ── 자동 보정 프리셋 ─────────────────────────────────
  function _applyAutoShop() {
    const preset = (window.PhotoEnhance && window.PhotoEnhance.getShopPreset)
      ? window.PhotoEnhance.getShopPreset() : null;
    if (!preset) return _toast('업종 설정이 없어요');
    Object.assign(_state.adjust, preset.adjust);
    Object.assign(_state.beauty, preset.beauty);
    _redraw(); _pushHistory();
    _toast(preset.label + ' 자동 보정 적용');
  }
  function _applyAuto(kind) {
    if (kind === 'shop')  return _applyAutoShop();
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
    if (_state.text.value) _drawText(ctx, dw, dh, _state.text);
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

  function _drawText(ctx, w, h, t) {
    ctx.save();
    const fs = Math.round(w * 0.06);
    ctx.font = `800 ${fs}px Pretendard, "Noto Sans KR", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = Math.round(fs * 0.18);
    ctx.fillStyle = t.color || '#ffffff';
    ctx.fillText(t.value, w * t.x, h * t.y, w * 0.9);
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
  const _SNAP_KEYS = ['adjust', 'ratio', 'text', 'watermark', 'beauty', 'template'];
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
  }
  function _close(fromHistory) {
    const sheet = document.getElementById('photoEditorSheet');
    if (sheet) sheet.style.display = 'none';
    document.body.style.overflow = '';
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

  window.PhotoEditor = { open: _open, close: _close, openFromAction: _openFromAction };
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
