/* 사진 편집기 메인 — P0 MVP (2026-05-18 v168, 분할 후)
   설계 문서: ~/.claude/plans/zesty-snacking-clarke.md §25
   분할 (T-104):
     • 메인 (이 파일) — 시트/캔버스/탭/상태/history/save/export/auto/tune/bg/text/brand
     • app-photo-editor-beauty.js     — 뷰티 5 슬라이더 + HSV 마스킹 픽셀 walk
     • app-photo-editor-templates.js  — 템플릿 6종 + canvas 합성
     • app-photo-editor-layers.js     — 텍스트 레이어 추가/삭제/선택/순서
     • app-photo-editor-export.js     — 저장 + 다음 단계 모달
     • app-photo-editor-batch.js      — 슬롯 사진 N장 일괄 보정
   사용:
     PhotoEditor.open({ src, shopName?, serviceName?, price? })
     PhotoEditor.openFromAction({ photo_url, initial_tab? })
*/
(function () {
  'use strict';

  const TABS = [
    { id: 'auto', label: '자동', icon: 'wand-sparkles' },
    { id: 'tune', label: '보정', icon: 'sun' },
    { id: 'beauty', label: '부위 보정', icon: 'sparkles' },
    { id: 'brush', label: '잡티 보정', icon: 'pen-line' },
    { id: 'selective', label: '부분 보정', icon: 'droplet' },
    { id: 'pro', label: '프로', icon: 'layers' },
    { id: 'relight', label: '조명', icon: 'sun' },
    { id: 'film', label: '필름', icon: 'film' },
    { id: 'bg', label: '배경', icon: 'image' },
    { id: 'ba', label: '전후 비교', icon: 'eye' },
    { id: 'template', label: '템플릿', icon: 'layers' },
    { id: 'text', label: '텍스트', icon: 'edit-3' },
    { id: 'brand', label: '샵 정보', icon: 'tag' },
    { id: 'ai', label: 'AI', icon: 'bot' },
    { id: 'export', label: '저장', icon: 'download' },
  ];

  let _state = null;                  // 합성 상태 (단일 세션)
  const _externalPanels = {};         // tabId -> { html, bind }   (외부 모듈 등록)
  const _drawHooks = {};              // name  -> fn               (외부 모듈 등록)

  // 드래그 슬라이더 동안 픽셀 합성 폭주 방지 — [v202] 80 → 32ms (반응성 ↑, 모바일 발열 모니터링)
  let _redrawScheduled = null;
  let _redrawSeq = 0;
  let _pendingFinal = false;
  // v343 — preview(드래그 중 저해상도) / final(릴리즈 시 풀해상도) 통합 스케줄러.
  //   scheduleRedraw()/scheduleRedraw(false) → final(풀, 기존 호출부 전부 그대로).
  //   scheduleRedraw(true) → preview(저해상도). 디바운스 윈도우에 final 요청이 끼면 final 우선.
  function _scheduleRedraw(preview) {
    if (!preview) _pendingFinal = true;
    if (_redrawScheduled) return;
    _redrawScheduled = setTimeout(() => {
      _redrawScheduled = null;
      const final = _pendingFinal; _pendingFinal = false;
      try {
        const p = _redraw(!final);
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (_e) { void _e; }
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
    // 임베드 모드(onSave — 작업실 슬롯에서 열림): 뒤로 = entry-v6 메뉴로 빠지지 말고 완전 종료(슬롯 복귀).
    const embedded = !!(_state && _state.onSave);
    if (!embedded && sheet && sheet.classList.contains('pe-v6-feature-mode') && window.PhotoEditorEntryV6?.backToMenu) {
      _historyPushed = false;
      window.PhotoEditorEntryV6.backToMenu();
      _pushHistoryState();
      return;
    }
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
      // 저장 콜백 — 있으면 저장 버튼이 PNG 다운로드 대신 편집본 dataURL 을 콜백에 넘기고 종료.
      //   (작업실 손님 사진 편집 → 손님 사진에 되돌려쓰기 용도)
      onSave: typeof opts.onSave === 'function' ? opts.onSave : null,
      autoShop: !!opts.autoShop,
      activeTab: opts.initial_tab || 'auto', ratio: 'original',
      autoIntensity: 'standard',  // [v183] natural | standard | strong
      adjust: { brightness: 100, saturate: 100, sharpness: 0, temperature: 0 },
      beauty: {
        skin: 0, redness: 0, blemish: 0, eyeShadow: 0, textureSmooth: 0, yellowness: 0,
        lipPop: 0, eyeColor: 0, browSharp: 0,
        handSkin: 0, nailGloss: 0, coolness: 0, nailShape: 0,
        hairShine: 0, hairVolume: 0, hairEndsClean: 0, hairColor: 0, hairDetail: 0, hairColorPop: 0, scalpBoost: 0, hairyArm: 0,
        eyeRedness: 0, irisClear: 0, catchLight: 0, underEyeClean: 0, lashSharp: 0, closeUpDetail: 0,
      },
      relight: { direction: 0.5, warmth: 0, intensity: 0, ambientBoost: 0, flash: 0 },
      template: { id: null, leftLabel: '전', rightLabel: '후', reviewText: '', priceLines: '' },
      shadow: { mode: 'none' },
      bg: { id: null },
      bgBlur: { strength: 0 },
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
        <button type="button" class="pe-back-btn" data-pe-act="close" aria-label="뒤로"><svg style="width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2;"><use href="#ic-chevron-left"/></svg></button>
        <div class="pe-topbar-spacer"></div>
        <button type="button" class="pe-iconbtn" data-pe-act="undo" aria-label="되돌리기"><svg style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;"><use href="#ic-rotate-ccw"/></svg></button>
        <button type="button" class="pe-topbar-chip" data-pe-act="compare">원본</button>
        <button type="button" class="pe-btn-primary" data-pe-act="save">저장</button></header>
      <main class="pe-stage"><div class="pe-canvas-wrap">
        <canvas id="peCanvas" class="pe-canvas"></canvas>
        <div class="pe-canvas-empty" id="peCanvasEmpty">
          <div style="font-size:13px;color:#888;margin-bottom:10px;">편집할 사진을 골라주세요</div>
          <button type="button" class="pe-btn-primary" data-pe-act="pick">사진 고르기</button>
          <input type="file" id="pePicker" accept="image/*" style="display:none" /></div></div></main>
      <nav class="pe-tabs" id="peTabs">${TABS.map(t => `<button type="button" class="pe-tab" data-pe-tab="${t.id}"><svg class="pe-tab-icon"><use href="#ic-${t.icon}"/></svg><span>${_esc(t.label)}</span></button>`).join('')}</nav>
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
      if (_state && (_state.activeTab === 'brush' || _state.activeTab === 'text')) return;
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

  const _panelRenderers = {};
  function _slider(label, key, val, min, max, step) {
    return `<label class="pe-slider"><div class="pe-slider-head"><span>${_esc(label)}</span><span class="pe-slider-val" data-pe-slider-val="${key}">${val}</span></div><input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-pe-slider="${key}" /></label>`;
  }
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

  // 기본 화면 패널은 js/photo-editor/basic-panels.js 에서 등록합니다.
  function _bindPanel(panel, tab) {
    // [v227 Sprint 3] selective 가 아닌 탭 진입 시 핀 마커 자동 제거
    if (tab !== 'selective' && window.PhotoEditorSelective && typeof window.PhotoEditorSelective.onLeave === 'function') {
      try { window.PhotoEditorSelective.onLeave(_state); } catch (_e) { void _e; }
    }
    const ext = _externalPanels[tab];
    if (ext && typeof ext.bind === 'function') { try { ext.bind(panel, _state, _helpers); } catch (_e) { void _e; } return; }
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
  function _callLayers(name, ...args) {
    const layers = window.PhotoEditorLayers;
    if (layers && typeof layers[name] === 'function') layers[name](_state, _helpers, ...args);
  }
  function _ensureLayers() { _callLayers('ensure'); }
  function _syncTextToLayer() { _callLayers('syncText'); }
  function _addLayer() { _callLayers('add'); }
  function _deleteLayer() { _callLayers('remove'); }
  function _selectLayer(id) { _callLayers('select', id); }
  function _moveLayerUp() { _callLayers('moveUp'); }

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
    if (kind === 'all')   _state.adjust = { brightness: 105, saturate: 110, sharpness: 24, temperature: 5 };
    if (kind === 'bright')_state.adjust = { ..._state.adjust, brightness: 115 };
    if (kind === 'vivid') _state.adjust = { ..._state.adjust, saturate: 120, sharpness: 40 };
    if (kind === 'warm')  _state.adjust = { ..._state.adjust, temperature: 18 };
    if (kind === 'cool')  _state.adjust = { ..._state.adjust, temperature: -18 };
    _redraw(); _pushHistory(); _toast('보정 적용 완료');
  }

  // ── 캔버스 합성 ───────────────────────────────────────
  async function _redraw(preview, exportFull) {
    const renderer = window.PhotoEditorRenderer;
    const cv = document.getElementById('peCanvas'), empty = document.getElementById('peCanvasEmpty');
    if (!renderer || typeof renderer.redraw !== 'function') {
      if (cv) cv.style.display = _state && _state.originalImg ? 'block' : 'none';
      if (empty) empty.style.display = _state && _state.originalImg ? 'none' : 'flex';
      return;
    }
    const seq = ++_redrawSeq;
    return renderer.redraw({
      canvas: cv,
      empty,
      state: _state,
      drawHooks: _drawHooks,
      helpers: _helpers,
      seq,
      getSeq: () => _redrawSeq,
      preview: !!preview,        // v343 — 드래그 중 저해상도 preview
      exportFull: !!exportFull,  // v345 — 저장/내보내기용 원본급 고화질
    });
  }

  // ── history ──────────────────────────────────────────
  function _pushHistory() {
    window.PhotoEditorHistory?.push?.(_state);
  }
  function _undo() {
    const snap = window.PhotoEditorHistory?.undo?.(_state);
    if (!snap) return _toast('되돌릴 작업이 없어요');
    _restoreSnapshot(snap);
  }
  function _redo() {
    const snap = window.PhotoEditorHistory?.redo?.(_state);
    if (!snap) return _toast('다시 실행할 작업이 없어요');
    _restoreSnapshot(snap);
  }

  function _restoreSnapshot(s) {
    if (!_state || !s) return;
    const prevSrc = _state.originalSrc;
    window.PhotoEditorHistory?.applySnapshot?.(_state, s);
    if (typeof _ensureLayers === 'function') _ensureLayers();  // [v204] reference 재동기
    if (s.originalSrc && s.originalSrc !== prevSrc) return _restoreSnapshotImage(s.originalSrc);
    _renderPanel(); _redraw();
  }

  function _restoreSnapshotImage(src) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!_state) return;
      _state.originalImg = img;
      _state.originalSrc = src;
      _renderPanel(); _redraw();
    };
    img.onerror = () => { _renderPanel(); _redraw(); _toast('이미지 되돌리기 실패'); };
    img.src = src;
  }

  function _toggleCompare() {
    _state.showOriginal = !_state.showOriginal; _redraw();
    setTimeout(() => { _state.showOriginal = false; _redraw(); }, 800);
  }

  // ── 저장 / 내보내기 ───────────────────────────────────
  async function _save() {
    await _renderForExport();   // v345 — 저장/onSave 직전 원본급(exportFull) 고화질 1회 렌더
    if (_state && typeof _state.onSave === 'function') return _saveViaCallback();
    const r = await _exportImage('png');
    try { await _redraw(false); } catch (_e) { void _e; }   // 화면 캔버스 final(2048)로 복귀
    return r;
  }
  // v345 — 대기 중 preview/redraw 취소 후 peCanvas 를 exportFull(원본급)로 1회 렌더.
  //   저장본/slot onSave 가 preview 저해상도(또는 2048 final)가 아닌 원본급 고화질로 나가도록 보장.
  async function _renderForExport() {
    if (_redrawScheduled) { clearTimeout(_redrawScheduled); _redrawScheduled = null; }
    _pendingFinal = false;
    try { await _redraw(false, true); } catch (_e) { void _e; }
  }
  // 저장 콜백 경로 — 편집본을 dataURL 로 넘기고 에디터를 완전히 종료(작업실 슬롯으로 복귀).
  function _saveViaCallback() {
    const cv = document.getElementById('peCanvas');
    if (!cv || !_state) return;
    let dataUrl;
    try { dataUrl = cv.toDataURL('image/jpeg', 0.92); }
    catch (e) { return _toast('저장 실패 — 사진을 파일에서 다시 불러와 주세요'); }
    const cb = _state.onSave;
    _state._savedAtCursor = _state.historyCursor;   // dirty 경고 방지
    try { cb(dataUrl); } catch (err) { console.warn('[photo-editor] onSave 콜백 실패:', err && err.message); }
    _toast('편집이 적용됐어요');
    // feature-mode(entry-v6) 클래스를 먼저 제거해 닫을 때 메뉴로 안 빠지게 → 완전 종료
    const sheet = document.getElementById('photoEditorSheet');
    if (sheet) sheet.classList.remove('pe-v6-feature-mode');
    _close();
  }
  async function _exportImage(format) {
    const exp = window.PhotoEditorExport;
    if (!exp || typeof exp.save !== 'function') return _toast('저장 모듈을 불러오는 중이에요');
    return exp.save(format, _state, _helpers);
  }

  // ── 사진 로드 ─────────────────────────────────────────
  function _loadImage(src) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      _state.originalImg = img; _state.originalSrc = src; _pushHistory(); _redraw(); _renderPanel();
      try { window.PhotoEditorEntryV6?.refresh?.(); } catch (_e) { void _e; }
      // [v313 2026-05-28] RegionMaskProvider precompute — fire-and-forget.
      //   실패해도 기존 사진편집기 동작에 영향 없어야 함. 보정 엔진에 연결 X.
      try {
        if (window.RegionMaskProvider && typeof window.RegionMaskProvider.precompute === 'function') {
          window.RegionMaskProvider.precompute(img).catch(err =>
            console.warn('[mask] precompute failed:', err && err.message));
        }
      } catch (e) { console.warn('[mask] precompute call failed:', e && e.message); }
    };
    img.onerror = () => _toast('사진을 불러오지 못했어요');
    img.src = src;
  }
  function _loadSecondImage(src) {
    if (!src) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!_state) return;
      _state.secondImg = img;
      _renderPanel();
      _redraw();
    };
    img.onerror = () => _toast('시술 전 사진을 불러오지 못했어요');
    img.src = src;
  }
  function _replaceImage(src, message) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      _state.originalImg = img;
      _state.originalSrc = src;
      _pushHistory();
      _redraw();
      if (message) _toast(message);
    };
    img.onerror = () => _toast('합성 이미지 로드 실패');
    img.src = src;
  }

  // ── 공개 API ──────────────────────────────────────────
  function _open(opts) {
    opts = opts || {};
    const sheet = _ensureSheet();
    _state = _initState(opts);
    // [잇비 핸드오프] initialState 화이트리스트 병합 — history seed 전에 처리해 cursor 0 이 "잇비 적용 결과"가 되게 함.
    //   initialState 가 없으면(기존 호출) 병합 자체를 건너뛰어 기존 동작과 100% 동일.
    if (opts.initialState && window.PhotoEditorItbiCards && typeof window.PhotoEditorItbiCards.mergeInitialState === 'function') {
      try { window.PhotoEditorItbiCards.mergeInitialState(_state, opts.initialState); } catch (_e) { void _e; }
    }
    sheet.style.setProperty('display', 'flex', 'important');
    document.body.style.overflow = 'hidden';
    _renderTabs(); _renderPanel(); _redraw();
    // Nav v7 — 편집기 열 때마다 mount 보장. nav-v7 의 _boot 폴링(페이지 로드 후 9.6초)이
    //   만료된 뒤 편집기를 열면 mount 가 영영 안 돼 옛 .pe-tabs 로 보이던 회귀 방지.
    try { if (window.PhotoEditorNavV7?.isEnabled?.()) window.PhotoEditorNavV7.mount(); } catch (_e) { void _e; }
    try { window.PhotoEditorTextDnD?.bind?.(sheet.querySelector('#peCanvas')); } catch (_e) { void _e; }
    if (opts.src) _loadImage(opts.src);
    if (opts.secondSrc) _loadSecondImage(opts.secondSrc);
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
        window._inlineConfirm('편집한 내용이 저장되지 않았어요. 정말 닫을까요?', () => {
          _close(true);
        });
        return;
      }
    }
    const sheet = document.getElementById('photoEditorSheet');
    if (sheet) {
      // 임베드 모드(onSave)는 닫을 때 entry-v6 feature-mode 메뉴로 안 빠지게 클래스 해제
      if (_state && _state.onSave) sheet.classList.remove('pe-v6-feature-mode');
      sheet.style.setProperty('display', 'none', 'important');
    }
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
    return _open({
      src: p.photo_url || p.src || p.dataUrl,
      secondSrc: p.secondSrc || p.second_src || null,
      initial_tab: p.initial_tab || p.tab || 'auto',
      serviceName: p.service_name || '',
      price: +p.price || 0,
      initialState: p.initialState || null,
    });
  }

  function _applyStatePatch(patch) {
    if (!_state || !patch) return false;
    if (patch.adjust) Object.assign(_state.adjust, patch.adjust);
    if (patch.beauty) Object.assign(_state.beauty, patch.beauty);
    if (patch.relight) Object.assign(_state.relight, patch.relight);
    if (patch.template) Object.assign(_state.template, patch.template);
    if (patch.bg) Object.assign(_state.bg, patch.bg);
    if (patch.bgBlur) _state.bgBlur = Object.assign({}, _state.bgBlur || {}, patch.bgBlur);
    if (patch.tplV2) _state.tplV2 = Object.assign({}, _state.tplV2 || {}, patch.tplV2);
    if (patch.beautyFocus !== undefined) _state.beautyFocus = patch.beautyFocus;
    if (patch.activeTab) _state.activeTab = patch.activeTab;
    if (patch.autoIntensity) _state.autoIntensity = patch.autoIntensity;
    if (patch.watermark) Object.assign(_state.watermark, patch.watermark);
    if (patch.text) {
      _ensureLayers();
      Object.assign(_state.text, patch.text);
      _syncTextToLayer();
    }
    if (patch.ratio) _state.ratio = patch.ratio;
    _renderPanel(); _redraw(); _pushHistory();
    return true;
  }

  // 외부 모듈용 helpers (beauty / templates).
  const _helpers = {
    esc: _esc, toast: _toast, scheduleRedraw: _scheduleRedraw, redraw: _redraw,
    pushHistory: _pushHistory, renderPanel: _renderPanel,
    drawWatermark: (...args) => window.PhotoEditorRenderer?.drawWatermark?.(...args),
    slider: _slider,
    getState: () => _state, applyStatePatch: _applyStatePatch,
    applyAuto: _applyAuto, applyTransform: _applyTransform, loadImage: _loadImage, replaceImage: _replaceImage,
    ensureLayers: _ensureLayers, syncTextToLayer: _syncTextToLayer,
    addLayer: _addLayer, deleteLayer: _deleteLayer, selectLayer: _selectLayer, moveLayerUp: _moveLayerUp,
    exportImage: _exportImage,
    unsharpMask: (...args) => window.PhotoEditorRenderer?.unsharpMask?.(...args),
    applyDrawHook: (name, ...args) => {
      if (typeof _drawHooks[name] !== 'function') return undefined;
      return _drawHooks[name](...args);
    },
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
    getState: () => _state,
    applyStatePatch: _applyStatePatch,
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
