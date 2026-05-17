/* 사진 편집기 — P0 MVP (2026-05-17 v167)
   설계 문서: ~/.claude/plans/zesty-snacking-clarke.md §25

   "뷰티샵 홍보 실무용 올인원 편집기" — 메이투/스노우/캔바/누끼앱/캡션앱을
   잇데이 하나로 대체하는 첫걸음.

   P0 MVP 범위 (1차 푸시):
     • 시트 골격 + 8탭 가로 스크롤 UI
     • 캔버스 + 원본/편집 비교 토글 + 되돌리기 stack (20)
     • [자동] 탭: 한 번에 자동 보정 (밝기·채도·선명도 디폴트)
     • [보정] 탭: 슬라이더 4개 — 밝기 / 채도 / 선명도 / 색온도 (CSS filter)
     • [뷰티] 탭: placeholder ("P1 예정" 안내)
     • [누끼/배경] 탭: 기존 app-gallery-bg 흐름 진입 안내
     • [템플릿] 탭: placeholder ("P1 예정")
     • [텍스트] 탭: 텍스트 1개 (시술명 자동 prefill 시도)
     • [브랜드] 탭: 워터마크 1개 (샵명 자동, brand_kit 미설정 시 사용자 입력)
     • [내보내기] 탭: 비율 3종 (1:1 / 4:5 / 9:16) + PNG/JPG 저장 + 다운로드
     • AI 비서 진입로: window.PhotoEditor.openFromAction({photo_url, ...})

   불가침:
     • 원본 blob/URL은 절대 덮어쓰지 않음. 편집본은 새 blob로만 export.
     • 얼굴형 변형/눈 키우기/몸매 보정 등 셀카앱 기능은 P2 이후.

   사용:
     PhotoEditor.open({ src: '<url|blob>', shopName?: '...', serviceName?: '...', price?: 0 })
     PhotoEditor.openFromAction({ photo_url, initial_tab? })
*/
(function () {
  'use strict';

  const TABS = [
    { id: 'auto',     label: '자동',    icon: 'ic-wand-sparkles' },
    { id: 'tune',     label: '보정',    icon: 'ic-sliders-horizontal' },
    { id: 'beauty',   label: '뷰티',    icon: 'ic-sparkles' },
    { id: 'bg',       label: '누끼·배경', icon: 'ic-scissors' },
    { id: 'template', label: '템플릿',  icon: 'ic-layers' },
    { id: 'text',     label: '텍스트',  icon: 'ic-pen-line' },
    { id: 'brand',    label: '브랜드',  icon: 'ic-badge' },
    { id: 'export',   label: '내보내기', icon: 'ic-upload' },
  ];

  // 합성 상태 (단일 세션). 시트 닫으면 비움.
  let _state = null;

  function _initState(opts) {
    return {
      originalSrc: opts.src,
      originalImg: null,         // HTMLImageElement
      shopName: opts.shopName || _readShopName(),
      serviceName: opts.serviceName || '',
      price: +opts.price || 0,
      activeTab: opts.initial_tab || 'auto',
      ratio: 'original',         // 'original' | '1:1' | '4:5' | '9:16'
      adjust: { brightness: 100, saturate: 100, sharpness: 0, temperature: 0 },
      text: { value: '', x: 0.5, y: 0.92, color: '#ffffff' },
      watermark: { value: '', position: 'br', opacity: 0.85 },
      showOriginal: false,
      history: [],
      historyCursor: -1,
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
    let sheet = document.getElementById('photoEditorSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'photoEditorSheet';
    sheet.className = 'pe-sheet';
    sheet.style.display = 'none';
    sheet.innerHTML = `
      <div class="pe-root" role="dialog" aria-modal="true" aria-label="사진 편집기">
        <header class="pe-topbar">
          <button type="button" class="pe-iconbtn" data-pe-act="close" aria-label="닫기">×</button>
          <div class="pe-title">사진 편집기</div>
          <button type="button" class="pe-iconbtn" data-pe-act="compare" aria-label="원본 비교 (롱탭)">원본</button>
          <button type="button" class="pe-iconbtn" data-pe-act="undo" aria-label="되돌리기">⤺</button>
          <button type="button" class="pe-btn-primary" data-pe-act="save">저장</button>
        </header>
        <main class="pe-stage">
          <div class="pe-canvas-wrap">
            <canvas id="peCanvas" class="pe-canvas"></canvas>
            <div class="pe-canvas-empty" id="peCanvasEmpty">
              <div style="font-size:13px;color:#888;margin-bottom:10px;">편집할 사진을 골라주세요</div>
              <button type="button" class="pe-btn-primary" data-pe-act="pick">사진 고르기</button>
              <input type="file" id="pePicker" accept="image/*" style="display:none" />
            </div>
          </div>
        </main>
        <nav class="pe-tabs" id="peTabs">
          ${TABS.map(t => `<button type="button" class="pe-tab" data-pe-tab="${t.id}">${_esc(t.label)}</button>`).join('')}
        </nav>
        <section class="pe-panel" id="pePanel"></section>
      </div>
    `;
    document.body.appendChild(sheet);
    _bindSheet(sheet);
    return sheet;
  }

  function _bindSheet(sheet) {
    sheet.addEventListener('click', (e) => {
      const act = e.target.closest('[data-pe-act]')?.dataset.peAct;
      if (act === 'close') return _close();
      if (act === 'undo') return _undo();
      if (act === 'save') return _save();
      if (act === 'pick') return sheet.querySelector('#pePicker').click();
      if (act === 'compare') return _toggleCompare();
      const tab = e.target.closest('[data-pe-tab]')?.dataset.peTab;
      if (tab) { _state.activeTab = tab; _renderTabs(); _renderPanel(); }
    });
    const cv = sheet.querySelector('#peCanvas');
    // 롱프레스 = 원본 비교
    let pressTimer = null;
    const startPress = () => { pressTimer = setTimeout(() => { _state.showOriginal = true; _redraw(); }, 250); };
    const endPress = () => { if (pressTimer) clearTimeout(pressTimer); if (_state && _state.showOriginal) { _state.showOriginal = false; _redraw(); } };
    cv.addEventListener('mousedown', startPress);
    cv.addEventListener('mouseup', endPress);
    cv.addEventListener('mouseleave', endPress);
    cv.addEventListener('touchstart', startPress, { passive: true });
    cv.addEventListener('touchend', endPress);
    sheet.querySelector('#pePicker').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const url = URL.createObjectURL(f);
      _loadImage(url);
    });
  }

  function _renderTabs() {
    const wrap = document.getElementById('peTabs');
    if (!wrap || !_state) return;
    wrap.querySelectorAll('.pe-tab').forEach(b => {
      b.classList.toggle('on', b.dataset.peTab === _state.activeTab);
    });
  }

  function _renderPanel() {
    const panel = document.getElementById('pePanel');
    if (!panel || !_state) return;
    const tab = _state.activeTab;
    if (tab === 'auto')     panel.innerHTML = _panelAuto();
    else if (tab === 'tune')    panel.innerHTML = _panelTune();
    else if (tab === 'beauty')  panel.innerHTML = _panelBeauty();
    else if (tab === 'bg')      panel.innerHTML = _panelBg();
    else if (tab === 'template')panel.innerHTML = _panelTemplate();
    else if (tab === 'text')    panel.innerHTML = _panelText();
    else if (tab === 'brand')   panel.innerHTML = _panelBrand();
    else if (tab === 'export')  panel.innerHTML = _panelExport();
    _bindPanel(panel, tab);
  }

  // ── 패널들 ────────────────────────────────────────────
  function _panelAuto() {
    return `
      <div class="pe-panel-row">
        <button type="button" class="pe-action-btn" data-pe-auto="all">⚡ 한 번에 자동 보정</button>
      </div>
      <div class="pe-panel-row pe-panel-grid-2">
        <button type="button" class="pe-chip-btn" data-pe-auto="bright">밝게</button>
        <button type="button" class="pe-chip-btn" data-pe-auto="vivid">선명</button>
        <button type="button" class="pe-chip-btn" data-pe-auto="warm">따뜻하게</button>
        <button type="button" class="pe-chip-btn" data-pe-auto="cool">차갑게</button>
      </div>
      <div class="pe-hint">자연 보정 위주. 시술 결과가 왜곡되지 않게 보수적 강도로 들어갑니다.</div>
    `;
  }

  function _panelTune() {
    const a = _state.adjust;
    return `
      ${_slider('밝기', 'brightness', a.brightness, 50, 150, 1)}
      ${_slider('채도', 'saturate',   a.saturate,   50, 150, 1)}
      ${_slider('선명도', 'sharpness', a.sharpness, 0, 100, 1)}
      ${_slider('색온도', 'temperature', a.temperature, -50, 50, 1)}
      <div class="pe-panel-row" style="margin-top:8px;">
        <button type="button" class="pe-chip-btn" data-pe-tune-reset>모두 초기화</button>
      </div>
    `;
  }

  function _slider(label, key, val, min, max, step) {
    return `
      <label class="pe-slider">
        <div class="pe-slider-head">
          <span>${_esc(label)}</span>
          <span class="pe-slider-val" data-pe-slider-val="${key}">${val}</span>
        </div>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-pe-slider="${key}" />
      </label>
    `;
  }

  function _panelBeauty() {
    return `
      <div class="pe-coming">
        💆 뷰티 특화 보정 — P1 예정<br>
        피부톤·붉은기·잡티·모발 윤기·네일 광택·속눈썹 선명도 슬라이더 10종이 곧 추가됩니다.
      </div>
    `;
  }

  function _panelBg() {
    return `
      <div class="pe-panel-row">
        <button type="button" class="pe-action-btn" data-pe-bg="open-existing">기존 누끼·배경 화면 열기</button>
      </div>
      <div class="pe-hint">알파 보정·프리셋 4종·서버 누끼 모두 기존 안정 흐름을 그대로 사용해요.<br>편집기 내부 통합은 P1에서 마무리됩니다.</div>
    `;
  }

  function _panelTemplate() {
    return `
      <div class="pe-coming">
        🖼 템플릿 — P1 예정<br>
        Before/After 좌우·상하, 가격 안내, 후기, 시술 안내 5종이 곧 추가됩니다.
      </div>
    `;
  }

  function _panelText() {
    const t = _state.text;
    return `
      <label class="pe-field"><span>텍스트</span>
        <input type="text" class="pe-input" data-pe-text-val placeholder="시술명·이벤트 문구 등" value="${_esc(t.value)}" maxlength="40" />
      </label>
      <div class="pe-panel-row pe-panel-grid-2" style="margin-top:8px;">
        <button type="button" class="pe-chip-btn" data-pe-text-prefill="service">시술명 자동</button>
        <button type="button" class="pe-chip-btn" data-pe-text-prefill="price">가격 자동</button>
      </div>
      <label class="pe-slider"><div class="pe-slider-head"><span>위치 (위↔아래)</span><span class="pe-slider-val">${Math.round(t.y*100)}</span></div>
        <input type="range" min="5" max="95" value="${Math.round(t.y*100)}" data-pe-text-y />
      </label>
      <div class="pe-hint">P1: 폰트 8종 / 색상 / 배경 박스 / 그림자 추가 예정.</div>
    `;
  }

  function _panelBrand() {
    const w = _state.watermark;
    return `
      <label class="pe-field"><span>워터마크 문구</span>
        <input type="text" class="pe-input" data-pe-wm-val placeholder="@샵아이디 · 샵이름" value="${_esc(w.value)}" maxlength="40" />
      </label>
      <div class="pe-field-label">위치</div>
      <div class="pe-panel-row pe-panel-grid-4">
        ${['tl','tr','bl','br'].map(p => `<button type="button" class="pe-chip-btn ${w.position===p?'on':''}" data-pe-wm-pos="${p}">${({tl:'↖',tr:'↗',bl:'↙',br:'↘'})[p]}</button>`).join('')}
      </div>
      <label class="pe-slider"><div class="pe-slider-head"><span>투명도</span><span class="pe-slider-val">${Math.round(w.opacity*100)}%</span></div>
        <input type="range" min="20" max="100" value="${Math.round(w.opacity*100)}" data-pe-wm-opacity />
      </label>
      <div class="pe-panel-row" style="margin-top:8px;">
        <button type="button" class="pe-chip-btn" data-pe-wm-save>이 워터마크를 기본값으로 저장</button>
      </div>
    `;
  }

  function _panelExport() {
    const r = _state.ratio;
    return `
      <div class="pe-field-label">비율</div>
      <div class="pe-panel-row pe-panel-grid-4">
        ${['original','1:1','4:5','9:16'].map(rv => `<button type="button" class="pe-chip-btn ${r===rv?'on':''}" data-pe-ratio="${rv}">${rv === 'original' ? '원본' : rv}</button>`).join('')}
      </div>
      <div class="pe-panel-row pe-panel-grid-2" style="margin-top:12px;">
        <button type="button" class="pe-action-btn" data-pe-export="png">PNG 저장</button>
        <button type="button" class="pe-action-btn" data-pe-export="jpg">JPG 저장</button>
      </div>
      <div class="pe-hint">저장 시 원본은 보존됩니다. 편집본만 다운로드 또는 갤러리에 추가돼요.</div>
    `;
  }

  // ── 패널 바인딩 ───────────────────────────────────────
  function _bindPanel(panel, tab) {
    if (tab === 'auto') {
      panel.querySelectorAll('[data-pe-auto]').forEach(btn => {
        btn.addEventListener('click', () => { _applyAuto(btn.dataset.peAuto); });
      });
    } else if (tab === 'tune') {
      panel.querySelectorAll('[data-pe-slider]').forEach(inp => {
        inp.addEventListener('input', () => {
          const key = inp.dataset.peSlider;
          _state.adjust[key] = +inp.value;
          const out = panel.querySelector(`[data-pe-slider-val="${key}"]`);
          if (out) out.textContent = inp.value;
          _redraw();
        });
        inp.addEventListener('change', () => _pushHistory());
      });
      panel.querySelector('[data-pe-tune-reset]')?.addEventListener('click', () => {
        _state.adjust = { brightness: 100, saturate: 100, sharpness: 0, temperature: 0 };
        _renderPanel(); _redraw(); _pushHistory();
      });
    } else if (tab === 'bg') {
      panel.querySelector('[data-pe-bg="open-existing"]')?.addEventListener('click', () => {
        _toast('기존 누끼·배경 화면을 여는 중…');
        if (typeof window.openGalleryBg === 'function') window.openGalleryBg();
        else if (typeof window.openBgGallery === 'function') window.openBgGallery();
      });
    } else if (tab === 'text') {
      panel.querySelector('[data-pe-text-val]')?.addEventListener('input', (e) => {
        _state.text.value = e.target.value; _redraw();
      });
      panel.querySelector('[data-pe-text-y]')?.addEventListener('input', (e) => {
        _state.text.y = +e.target.value / 100; _redraw();
      });
      panel.querySelectorAll('[data-pe-text-prefill]').forEach(btn => {
        btn.addEventListener('click', () => {
          const which = btn.dataset.peTextPrefill;
          if (which === 'service') _state.text.value = _state.serviceName || '시술 결과';
          else if (which === 'price') _state.text.value = _state.price ? (_state.price / 10000).toFixed(0) + '만원' : '가격 문의';
          _renderPanel(); _redraw();
        });
      });
    } else if (tab === 'brand') {
      panel.querySelector('[data-pe-wm-val]')?.addEventListener('input', (e) => {
        _state.watermark.value = e.target.value; _redraw();
      });
      panel.querySelectorAll('[data-pe-wm-pos]').forEach(btn => {
        btn.addEventListener('click', () => { _state.watermark.position = btn.dataset.peWmPos; _renderPanel(); _redraw(); });
      });
      panel.querySelector('[data-pe-wm-opacity]')?.addEventListener('input', (e) => {
        _state.watermark.opacity = +e.target.value / 100; _redraw();
      });
      panel.querySelector('[data-pe-wm-save]')?.addEventListener('click', () => {
        try {
          const bk = JSON.parse(localStorage.getItem('itdasy_brand_kit') || '{}');
          bk.watermark_text = _state.watermark.value;
          bk.watermark_position = _state.watermark.position;
          bk.watermark_opacity = _state.watermark.opacity;
          localStorage.setItem('itdasy_brand_kit', JSON.stringify(bk));
          _toast('워터마크 기본값을 저장했어요');
        } catch (_e) { _toast('저장에 실패했어요'); }
      });
      if (!_state.watermark.value && _state.shopName) {
        _state.watermark.value = _state.shopName;
        const inp = panel.querySelector('[data-pe-wm-val]');
        if (inp) inp.value = _state.watermark.value;
        _redraw();
      }
    } else if (tab === 'export') {
      panel.querySelectorAll('[data-pe-ratio]').forEach(btn => {
        btn.addEventListener('click', () => { _state.ratio = btn.dataset.peRatio; _renderPanel(); _redraw(); _pushHistory(); });
      });
      panel.querySelectorAll('[data-pe-export]').forEach(btn => {
        btn.addEventListener('click', () => _exportImage(btn.dataset.peExport));
      });
    }
  }

  // ── 자동 보정 프리셋 ─────────────────────────────────
  function _applyAuto(kind) {
    if (kind === 'all')   _state.adjust = { brightness: 105, saturate: 110, sharpness: 30, temperature: 5 };
    if (kind === 'bright')_state.adjust = { ..._state.adjust, brightness: 115 };
    if (kind === 'vivid') _state.adjust = { ..._state.adjust, saturate: 120, sharpness: 40 };
    if (kind === 'warm')  _state.adjust = { ..._state.adjust, temperature: 18 };
    if (kind === 'cool')  _state.adjust = { ..._state.adjust, temperature: -18 };
    _redraw(); _pushHistory(); _toast('보정 적용 완료');
  }

  // ── 캔버스 합성 ───────────────────────────────────────
  function _redraw() {
    const cv = document.getElementById('peCanvas');
    const empty = document.getElementById('peCanvasEmpty');
    if (!cv || !_state) return;
    if (!_state.originalImg) {
      cv.style.display = 'none';
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';
    cv.style.display = 'block';

    const img = _state.originalImg;
    const { sx, sy, sw, sh, dw, dh } = _computeCrop(img, _state.ratio);
    // 캔버스 해상도는 출력 크기 그대로 (저장 시 같은 비율 사용)
    cv.width = dw;
    cv.height = dh;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, dw, dh);

    if (_state.showOriginal) {
      // 비교 토글: 필터 0
      ctx.filter = 'none';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
      return;
    }
    const a = _state.adjust;
    // CSS filter 합성 (브라우저 GPU)
    const temp = a.temperature;
    const hueRot = 0; // 색온도는 sepia로 대용 — 더 자연스럽게 보이게.
    const sepia = Math.max(0, temp) / 100; // 양수면 따뜻
    const contrast = 100 + Math.max(0, -temp) * 0.3; // 음수면 약간 더 차갑게 명도대비
    ctx.filter = `brightness(${a.brightness}%) saturate(${a.saturate}%) contrast(${contrast}%) sepia(${sepia})`;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);

    // 선명도 — unsharp mask (소형). 비용 보호를 위해 sharpness>10 일 때만.
    if (a.sharpness > 10) _unsharpMask(ctx, dw, dh, a.sharpness / 100);

    // 텍스트 오버레이
    if (_state.text.value) _drawText(ctx, dw, dh, _state.text);
    // 워터마크
    if (_state.watermark.value) _drawWatermark(ctx, dw, dh, _state.watermark);
  }

  function _computeCrop(img, ratio) {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    if (ratio === 'original') {
      // 미리보기 폭 한도
      const maxW = Math.min(1080, iw);
      const k = maxW / iw;
      return { sx: 0, sy: 0, sw: iw, sh: ih, dw: Math.round(iw * k), dh: Math.round(ih * k) };
    }
    const [rw, rh] = ratio.split(':').map(Number);
    const targetAR = rw / rh;
    const imgAR = iw / ih;
    let sw, sh, sx, sy;
    if (imgAR > targetAR) {
      sh = ih; sw = Math.round(ih * targetAR);
      sx = Math.round((iw - sw) / 2); sy = 0;
    } else {
      sw = iw; sh = Math.round(iw / targetAR);
      sx = 0; sy = Math.round((ih - sh) / 2);
    }
    const outW = Math.min(1080, sw);
    const outH = Math.round(outW / targetAR);
    return { sx, sy, sw, sh, dw: outW, dh: outH };
  }

  // 간단 unsharp mask — 박스 블러로 저주파 만든 뒤 (원본 - 저주파) 가산.
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
  function _clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
  function _boxBlur(img, w, h, r) {
    // 단순 박스 블러 (가로 패스만 — 비용 절감). 실시간 슬라이더 X, sharpness 누를 때만.
    const out = new ImageData(w, h);
    const d = img.data, o = out.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let rSum = 0, gSum = 0, bSum = 0, n = 0;
        for (let kx = -r; kx <= r; kx++) {
          const xx = Math.min(w - 1, Math.max(0, x + kx));
          const p = (y * w + xx) * 4;
          rSum += d[p]; gSum += d[p+1]; bSum += d[p+2]; n++;
        }
        const p = (y * w + x) * 4;
        o[p] = rSum / n; o[p+1] = gSum / n; o[p+2] = bSum / n; o[p+3] = d[p+3];
      }
    }
    return out;
  }

  function _drawText(ctx, w, h, t) {
    ctx.save();
    const fontSize = Math.round(w * 0.06);
    ctx.font = `800 ${fontSize}px Pretendard, "Noto Sans KR", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = Math.round(fontSize * 0.18);
    ctx.fillStyle = t.color || '#ffffff';
    ctx.fillText(t.value, w * t.x, h * t.y, w * 0.9);
    ctx.restore();
  }

  function _drawWatermark(ctx, w, h, wm) {
    ctx.save();
    const fontSize = Math.max(12, Math.round(w * 0.022));
    ctx.font = `600 ${fontSize}px Pretendard, "Noto Sans KR", sans-serif`;
    ctx.globalAlpha = wm.opacity;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 4;
    const pad = Math.round(w * 0.025);
    const metrics = ctx.measureText(wm.value);
    const tw = metrics.width;
    const th = fontSize;
    let x, y;
    if (wm.position === 'tl') { ctx.textAlign = 'left';  ctx.textBaseline = 'top';    x = pad;          y = pad; }
    if (wm.position === 'tr') { ctx.textAlign = 'right'; ctx.textBaseline = 'top';    x = w - pad;      y = pad; }
    if (wm.position === 'bl') { ctx.textAlign = 'left';  ctx.textBaseline = 'bottom'; x = pad;          y = h - pad; }
    if (wm.position === 'br') { ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; x = w - pad;      y = h - pad; }
    void tw; void th;
    ctx.fillText(wm.value, x, y);
    ctx.restore();
  }

  // ── history ──────────────────────────────────────────
  function _snapshot() {
    return JSON.parse(JSON.stringify({
      adjust: _state.adjust, ratio: _state.ratio, text: _state.text, watermark: _state.watermark,
    }));
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
    _state.adjust = s.adjust; _state.ratio = s.ratio; _state.text = s.text; _state.watermark = s.watermark;
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
      const name = 'itdasy-edit-' + Date.now() + '.' + format;
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
      _toast(format.toUpperCase() + ' 저장 완료');
      try {
        window.dispatchEvent(new CustomEvent('itdasy:gallery:photo-replaced', {
          detail: { kind: 'export_marketing_image', source: 'photo-editor' }
        }));
      } catch (_e) { void _e; }
    }, mime, 0.95);
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
    _renderTabs();
    _renderPanel();
    _redraw();
    if (opts.src) _loadImage(opts.src);
  }

  function _close() {
    const sheet = document.getElementById('photoEditorSheet');
    if (sheet) sheet.style.display = 'none';
    document.body.style.overflow = '';
    _state = null;
  }

  // AI 비서 액션 진입로: open_photo_editor
  function _openFromAction(payload) {
    payload = payload || {};
    return _open({
      src: payload.photo_url || payload.src,
      initial_tab: payload.initial_tab || 'auto',
      serviceName: payload.service_name || '',
      price: +payload.price || 0,
    });
  }

  window.PhotoEditor = { open: _open, close: _close, openFromAction: _openFromAction };

  // app-assistant.js 로컬 핸들러로 등록 — kind=open_photo_editor 액션 카드 "실행" 시
  // 백엔드 POST /assistant/execute 우회하고 프론트에서 직접 편집기 오픈.
  function _registerLocal() {
    if (window.ItdasyAssistant && typeof window.ItdasyAssistant.registerLocalHandler === 'function') {
      window.ItdasyAssistant.registerLocalHandler('open_photo_editor', async (action) => {
        const p = (action && action.payload) || {};
        _openFromAction(p);
        return { message: '편집기를 열었어요' };
      });
      return true;
    }
    return false;
  }
  if (!_registerLocal()) {
    let tries = 0;
    const iv = setInterval(() => {
      if (_registerLocal() || ++tries > 50) clearInterval(iv);
    }, 100);
  }
})();
