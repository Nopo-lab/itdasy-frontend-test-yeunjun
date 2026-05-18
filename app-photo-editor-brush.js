/* 사진 편집기 — 부분 보정 브러시 모드 (v185 2026-05-18)
   메인 (app-photo-editor.js) _internal API 로 등록 — 'brush' 탭 패널 + bind.

   설계:
     • 메인 canvas 위에 overlay mask canvas (position absolute, pointer-events:none)
     • 사용자가 메인 canvas drag → mask 에 stroke 누적 (mix-blend-mode 로 보임)
     • [적용] 누르면 메인 canvas pixel 에 brush 효과 + mask alpha 가산, mask 초기화
     • [초기화] mask 만 비움 (적용 X)

   브러시 5종 + 지우개:
     • smooth   — 부드럽게 (살짝 명도 ↑)
     • shine    — 윤기 (R/G ↑, 약간 황색)
     • redness  — 붉은기 ↓ (R 채널 -30 강도)
     • gloss    — 광택 (lum > 140 영역만 highlight)
     • blur     — 블러 (lum 중심으로 채도 ↓ — 단일 패스 한계)
     • eraser   — mask 만 지움 (적용 영향 X)

   메이투 수준 (poisson 블렌딩 등) 은 아니지만 P2 부분 보정 기초 — 부분 마스킹
   인프라 자체를 도입. 클론·힐링 P2-2 에서 위에 추가.
*/
(function () {
  'use strict';

  const BRUSHES = {
    smooth:  { label: '부드럽게', color: 'rgba(120,200,150,0.55)' },
    shine:   { label: '윤기',    color: 'rgba(255,220,100,0.55)' },
    redness: { label: '붉은기 ↓', color: 'rgba(100,160,220,0.55)' },
    gloss:   { label: '광택',    color: 'rgba(255,255,255,0.55)' },
    blur:    { label: '블러',    color: 'rgba(150,150,150,0.55)' },
    clone:   { label: '클론 스탬프', color: 'rgba(180,120,255,0.55)' },
    heal:    { label: '힐링 (블렌딩)', color: 'rgba(255,140,200,0.55)' },
    eraser:  { label: '지우개',  color: 'rgba(220,80,80,0.45)' },
  };
  // 클론·힐링 사용 시: source point 설정 모드 필요
  const _CLONE_TYPES = new Set(['clone', 'heal']);

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  function _ensureBrushState(state) {
    if (!state.brush) {
      state.brush = {
        type: 'smooth', size: 40, strength: 50,
        drawing: false, lastX: 0, lastY: 0,
        // [v187] 클론·힐링 — sourcePt: 사용자가 탭한 소스 좌표, firstStrokePt: 드래그 시작 좌표
        sourcePt: null, firstStrokePt: null,
        awaitingSource: false,  // 'set source' 모드
        // [v189] 사각형 선택 + [v191] Lasso (자유 곡선 폐곡선)
        selMode: 'free',   // 'free' | 'rect' | 'lasso'
        rectStart: null,   // rect 드래그 시작점
        lassoPath: [],     // lasso 점 배열 — drag 동안 누적, end 시 polygon close + fill
      };
    }
    return state.brush;
  }

  function _ensureMaskCanvas(mainCv) {
    let m = document.getElementById('peMaskCanvas');
    if (!m) {
      m = document.createElement('canvas');
      m.id = 'peMaskCanvas';
      m.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;opacity:1;mix-blend-mode:screen;';
      const wrap = mainCv.parentElement;
      if (wrap) {
        const cs = window.getComputedStyle(wrap);
        if (cs.position === 'static') wrap.style.position = 'relative';
        wrap.appendChild(m);
      }
    }
    if (m.width !== mainCv.width || m.height !== mainCv.height) {
      m.width = mainCv.width;
      m.height = mainCv.height;
    }
    return m;
  }

  // [v202 2026-05-18] 브러시 커서 미리보기 원 (S1-13) — pointer 따라 div
  function _ensureCursorRing(mainCv) {
    let c = document.getElementById('peBrushCursor');
    if (!c) {
      c = document.createElement('div');
      c.id = 'peBrushCursor';
      c.style.cssText = 'position:absolute;pointer-events:none;border:2px solid rgba(255,255,255,0.85);box-shadow:0 0 0 1px rgba(0,0,0,0.5);border-radius:50%;transform:translate(-50%,-50%);display:none;z-index:5;';
      const wrap = mainCv.parentElement;
      if (wrap) wrap.appendChild(c);
    }
    return c;
  }
  function _removeCursorRing() {
    const c = document.getElementById('peBrushCursor');
    if (c) c.remove();
  }

  function _removeMask() {
    const m = document.getElementById('peMaskCanvas');
    if (m) m.remove();
  }

  function _unbindBrushEvents(mainCv) {
    if (!mainCv || !Array.isArray(mainCv._brushHandlers)) return;
    mainCv._brushHandlers.forEach(([ev, fn]) => mainCv.removeEventListener(ev, fn));
    mainCv._brushHandlers = null;
    mainCv._brushBound = false;
  }

  function _computeCrop(img, ratio) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (ratio === 'original') return { sx: 0, sy: 0, sw: iw, sh: ih };
    const parts = String(ratio || 'original').split(':').map(Number);
    if (parts.length !== 2 || !parts[0] || !parts[1]) return { sx: 0, sy: 0, sw: iw, sh: ih };
    const targetAR = parts[0] / parts[1], imgAR = iw / ih;
    if (imgAR > targetAR) {
      const sh = ih, sw = Math.round(ih * targetAR);
      return { sx: Math.round((iw - sw) / 2), sy: 0, sw, sh };
    }
    const sw = iw, sh = Math.round(iw / targetAR);
    return { sx: 0, sy: Math.round((ih - sh) / 2), sw, sh };
  }

  function _makeBrushBaseCanvas(state, mainCv) {
    const img = state && state.originalImg;
    if (!img || !mainCv) return null;
    const crop = _computeCrop(img, state.ratio);
    const cv = document.createElement('canvas');
    cv.width = mainCv.width; cv.height = mainCv.height;
    cv.getContext('2d').drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, cv.width, cv.height);
    return cv;
  }

  function _commitBrushCanvas(baseCv, state, helpers, onDone) {
    let dataUrl = '';
    try { dataUrl = baseCv.toDataURL('image/jpeg', 0.95); }
    catch (_e) { return false; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      state.originalImg = img;
      state.originalSrc = dataUrl;
      state.removedBgDataUrl = null;
      state.preBgOriginalSrc = null;
      if (helpers && helpers.redraw) helpers.redraw();
      if (helpers && helpers.pushHistory) helpers.pushHistory();
      if (onDone) onDone();
    };
    img.onerror = () => {
      if (helpers && helpers.toast) helpers.toast('부분 보정 적용 실패');
    };
    img.src = dataUrl;
    return true;
  }

  function _panelBrushHTML(state) {
    const b = _ensureBrushState(state);
    const chip = (k) => `<button type="button" class="pe-chip-btn${b.type===k?' on':''}" data-pe-brush-type="${k}">${_esc(BRUSHES[k].label)}</button>`;
    // [v187] 클론·힐링 선택 시 소스 설정 UI
    const isClone = _CLONE_TYPES.has(b.type);
    const cloneHint = isClone ? `
      <div style="margin-top:10px;padding:10px;background:rgba(180,120,255,0.10);border:1px dashed rgba(180,120,255,0.4);border-radius:10px;font-size:11.5px;color:#d4b8ff;line-height:1.5;">
        ${b.sourcePt
          ? `✓ 소스 지점 설정됨 (x:${Math.round(b.sourcePt.x)}, y:${Math.round(b.sourcePt.y)}). 이제 칠하고 싶은 곳을 드래그하세요.<br><button type="button" class="pe-chip-btn" data-pe-brush-clear-source style="margin-top:6px;">↺ 소스 다시 설정</button>`
          : `① <b>"소스 지정"</b> 누른 뒤 ② 사진에서 복사할 좋은 영역 1회 탭. ③ 그다음 칠하고 싶은 영역 드래그.<br><button type="button" class="pe-chip-btn${b.awaitingSource?' on':''}" data-pe-brush-set-source style="margin-top:6px;">${b.awaitingSource?'소스 지정 중… (취소)':'📍 소스 지정'}</button>`
        }
      </div>` : '';
    // [v189] 그리기 모드 — 자유 드래그 / 사각형
    const selMode = b.selMode || 'free';
    const modeChip = (k, label) => `<button type="button" class="pe-chip-btn${selMode===k?' on':''}" data-pe-brush-selmode="${k}">${label}</button>`;
    return `<div class="pe-field-label">브러시 종류</div>
      <div class="pe-panel-row pe-panel-grid-3">${chip('smooth')}${chip('shine')}${chip('redness')}</div>
      <div class="pe-panel-row pe-panel-grid-3">${chip('gloss')}${chip('blur')}${chip('eraser')}</div>
      <div class="pe-panel-row pe-panel-grid-2">${chip('clone')}${chip('heal')}</div>
      <div class="pe-field-label" style="margin-top:10px;">그리기 모드</div>
      <div class="pe-panel-row pe-panel-grid-3">${modeChip('free','✎ 자유 드래그')}${modeChip('rect','▭ 사각형')}${modeChip('lasso','◯ 올가미')}</div>
      ${cloneHint}
      <label class="pe-slider"><div class="pe-slider-head"><span>브러시 크기</span><span class="pe-slider-val" data-pe-brush-size-val>${b.size}</span></div>
        <input type="range" min="10" max="120" value="${b.size}" data-pe-brush-size /></label>
      <label class="pe-slider"><div class="pe-slider-head"><span>강도</span><span class="pe-slider-val" data-pe-brush-strength-val>${b.strength}</span></div>
        <input type="range" min="10" max="100" value="${b.strength}" data-pe-brush-strength /></label>
      <div class="pe-panel-row pe-panel-grid-3" style="margin-top:8px;">
        <button type="button" class="pe-chip-btn" data-pe-brush-clear>마스크 초기화</button>
        <button type="button" class="pe-chip-btn" data-pe-brush-invert>↺ 반전</button>
        <button type="button" class="pe-action-btn" data-pe-brush-apply>✓ 적용</button>
      </div>
      <div class="pe-hint">드래그로 칠한 영역에만 효과. 클론/힐링은 소스 지점에서 픽셀을 가져와 다른 곳에 붙여요 (붙임머리 결합부·후면샷 정리용).</div>`;
  }

  function _bindBrushPanel(panel, state, helpers) {
    const b = _ensureBrushState(state);
    const mainCv = document.getElementById('peCanvas');
    if (!mainCv || !state.originalImg) {
      if (helpers && helpers.toast) helpers.toast('먼저 사진을 골라주세요');
      return;
    }
    const mask = _ensureMaskCanvas(mainCv);
    const mctx = mask.getContext('2d');
    const cursor = _ensureCursorRing(mainCv);

    panel.querySelectorAll('[data-pe-brush-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        b.type = btn.dataset.peBrushType;
        // [v187] 클론·힐링 외 다른 브러시 선택 시 소스/대기 상태 초기화
        if (!_CLONE_TYPES.has(b.type)) {
          b.sourcePt = null; b.firstStrokePt = null; b.awaitingSource = false;
        }
        // 패널 다시 렌더 — cloneHint UI 갱신
        helpers && helpers.renderPanel && helpers.renderPanel();
      });
    });
    // [v189] 그리기 모드 토글
    panel.querySelectorAll('[data-pe-brush-selmode]').forEach(btn => {
      btn.addEventListener('click', () => {
        b.selMode = btn.dataset.peBrushSelmode;
        helpers && helpers.renderPanel && helpers.renderPanel();
      });
    });
    // [v187] 소스 지정 버튼 / 소스 초기화
    panel.querySelector('[data-pe-brush-set-source]')?.addEventListener('click', () => {
      b.awaitingSource = !b.awaitingSource;
      helpers && helpers.renderPanel && helpers.renderPanel();
    });
    panel.querySelector('[data-pe-brush-clear-source]')?.addEventListener('click', () => {
      b.sourcePt = null; b.firstStrokePt = null;
      helpers && helpers.renderPanel && helpers.renderPanel();
    });

    panel.querySelector('[data-pe-brush-size]')?.addEventListener('input', e => {
      b.size = +e.target.value;
      const out = panel.querySelector('[data-pe-brush-size-val]');
      if (out) out.textContent = e.target.value;
    });
    panel.querySelector('[data-pe-brush-strength]')?.addEventListener('input', e => {
      b.strength = +e.target.value;
      const out = panel.querySelector('[data-pe-brush-strength-val]');
      if (out) out.textContent = e.target.value;
    });

    function _getXY(e) {
      const r = mainCv.getBoundingClientRect();
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      const sx = mainCv.width / r.width, sy = mainCv.height / r.height;
      return { x: (cx - r.left) * sx, y: (cy - r.top) * sy };
    }
    function _drawAt(x, y) {
      mctx.globalCompositeOperation = b.type === 'eraser' ? 'destination-out' : 'source-over';
      mctx.fillStyle = (BRUSHES[b.type] && BRUSHES[b.type].color) || 'rgba(255,255,255,0.5)';
      mctx.beginPath();
      mctx.arc(x, y, b.size, 0, Math.PI * 2);
      mctx.fill();
    }
    function _start(e) {
      if (state.activeTab !== 'brush') return;
      e.preventDefault();
      const p = _getXY(e);
      if (b.awaitingSource && _CLONE_TYPES.has(b.type)) {
        b.sourcePt = { x: p.x, y: p.y };
        b.awaitingSource = false;
        b.firstStrokePt = null;
        if (helpers && helpers.toast) helpers.toast('소스 지정됨. 칠하고 싶은 영역 드래그');
        helpers && helpers.renderPanel && helpers.renderPanel();
        return;
      }
      if (_CLONE_TYPES.has(b.type) && !b.sourcePt) {
        if (helpers && helpers.toast) helpers.toast('먼저 [📍 소스 지정] 누르고 복사할 영역 탭하세요');
        return;
      }
      if (_CLONE_TYPES.has(b.type)) b.firstStrokePt = { x: p.x, y: p.y };
      b.drawing = true; b.lastX = p.x; b.lastY = p.y;
      if (b.selMode === 'rect') {
        b.rectStart = { x: p.x, y: p.y };
      } else if (b.selMode === 'lasso') {
        b.lassoPath = [{ x: p.x, y: p.y }];
      } else {
        _drawAt(p.x, p.y);
      }
    }
    function _move(e) {
      if (!b.drawing || state.activeTab !== 'brush') return;
      e.preventDefault();
      const p = _getXY(e);
      if (b.selMode === 'rect') {
        if (!b.rectStart) return;
        mctx.clearRect(0, 0, mask.width, mask.height);
        const x1 = Math.min(b.rectStart.x, p.x), y1 = Math.min(b.rectStart.y, p.y);
        const x2 = Math.max(b.rectStart.x, p.x), y2 = Math.max(b.rectStart.y, p.y);
        mctx.globalCompositeOperation = b.type === 'eraser' ? 'destination-out' : 'source-over';
        mctx.fillStyle = (BRUSHES[b.type] && BRUSHES[b.type].color) || 'rgba(255,255,255,0.5)';
        mctx.fillRect(x1, y1, x2 - x1, y2 - y1);
        b.lastX = p.x; b.lastY = p.y;
        return;
      }
      if (b.selMode === 'lasso') {
        // [v191] 점 누적 + 매 프레임 라이브 폴리곤 라인 그리기 (마스크 아직 채우지 않음)
        b.lassoPath.push({ x: p.x, y: p.y });
        mctx.clearRect(0, 0, mask.width, mask.height);
        mctx.strokeStyle = (BRUSHES[b.type] && BRUSHES[b.type].color) || 'rgba(255,255,255,0.5)';
        mctx.lineWidth = 2;
        mctx.beginPath();
        b.lassoPath.forEach((pt, i) => i ? mctx.lineTo(pt.x, pt.y) : mctx.moveTo(pt.x, pt.y));
        mctx.stroke();
        b.lastX = p.x; b.lastY = p.y;
        return;
      }
      // free 모드
      const dx = p.x - b.lastX, dy = p.y - b.lastY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const step = Math.max(1, b.size / 4);
      const n = Math.max(1, Math.floor(dist / step));
      for (let i = 1; i <= n; i++) _drawAt(b.lastX + dx * i / n, b.lastY + dy * i / n);
      b.lastX = p.x; b.lastY = p.y;
    }
    function _end() {
      // [v191] lasso end — 폴리곤 close + fill (실제 마스크 채움)
      if (b.drawing && b.selMode === 'lasso' && b.lassoPath.length >= 3) {
        mctx.clearRect(0, 0, mask.width, mask.height);
        mctx.globalCompositeOperation = b.type === 'eraser' ? 'destination-out' : 'source-over';
        mctx.fillStyle = (BRUSHES[b.type] && BRUSHES[b.type].color) || 'rgba(255,255,255,0.5)';
        mctx.beginPath();
        b.lassoPath.forEach((pt, i) => i ? mctx.lineTo(pt.x, pt.y) : mctx.moveTo(pt.x, pt.y));
        mctx.closePath();
        mctx.fill();
      }
      b.drawing = false;
      b.rectStart = null;
      b.lassoPath = [];
    }

    // [v202] cursor 핸들러 — 브러시 크기 따라 원 크기 동적
    function _showCursor() {
      if (state.activeTab !== 'brush') return;
      cursor.style.display = 'block';
    }
    function _hideCursor() { cursor.style.display = 'none'; }
    function _moveCursor(e) {
      if (state.activeTab !== 'brush') return;
      const r = mainCv.getBoundingClientRect();
      // CSS px 기준 브러시 크기 — canvas pixel size vs CSS rect size 비율
      const cssK = r.width / Math.max(1, mainCv.width);
      const sz = Math.max(8, b.size * cssK * 2);
      cursor.style.width = sz + 'px';
      cursor.style.height = sz + 'px';
      cursor.style.left = (e.clientX - r.left) + 'px';
      cursor.style.top = (e.clientY - r.top) + 'px';
    }

    // 메인 canvas 에 brush 이벤트 — 편집기를 다시 열 때 이전 state 를 물고 있지 않게 재등록.
    _unbindBrushEvents(mainCv);
    const handlers = [
      ['mousedown', _start],
      ['touchstart', _start],
      ['mousemove', _move],
      ['touchmove', _move],
      ['mouseup', _end],
      ['mouseleave', _end],
      ['touchend', _end],
      ['mouseenter', _showCursor],
      ['mousemove', _moveCursor],
      ['mouseleave', _hideCursor],
    ];
    handlers.forEach(([ev, fn]) => {
      const opts = ev === 'touchstart' || ev === 'touchmove' ? { passive: false } : undefined;
      mainCv.addEventListener(ev, fn, opts);
    });
    mainCv._brushHandlers = handlers;
    mainCv._brushBound = true;

    panel.querySelector('[data-pe-brush-clear]')?.addEventListener('click', () => {
      mctx.clearRect(0, 0, mask.width, mask.height);
      if (helpers && helpers.toast) helpers.toast('마스크 초기화');
    });
    // [v202 2026-05-18] 마스크 invert (S1-14) — 캔버스 전체 alpha 반전
    panel.querySelector('[data-pe-brush-invert]')?.addEventListener('click', () => {
      try {
        const img = mctx.getImageData(0, 0, mask.width, mask.height);
        const d = img.data;
        const color = (BRUSHES[b.type] && BRUSHES[b.type].color) || 'rgba(255,255,255,0.5)';
        // color "rgba(R,G,B,A)" 파싱
        const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        const r = m ? +m[1] : 255, g = m ? +m[2] : 255, bl = m ? +m[3] : 255;
        const a = m && m[4] !== undefined ? Math.round(+m[4] * 255) : 128;
        for (let i = 0; i < d.length; i += 4) {
          const wasFilled = d[i + 3] > 10;
          if (wasFilled) {
            d[i + 3] = 0;
          } else {
            d[i] = r; d[i + 1] = g; d[i + 2] = bl; d[i + 3] = a;
          }
        }
        mctx.putImageData(img, 0, 0);
        if (helpers && helpers.toast) helpers.toast('마스크 반전');
      } catch (e) {
        if (helpers && helpers.toast) helpers.toast('반전 실패: ' + (e.message || ''));
      }
    });

    panel.querySelector('[data-pe-brush-apply]')?.addEventListener('click', () => {
      const baseCv = _makeBrushBaseCanvas(state, mainCv) || mainCv;
      const effects = window.PhotoEditorBrushEffects;
      const ok = effects && typeof effects.apply === 'function'
        ? effects.apply(baseCv, mask, b)
        : false;
      if (ok) {
        const committed = _commitBrushCanvas(baseCv, state, helpers, () => {
          mctx.clearRect(0, 0, mask.width, mask.height);
          if (helpers && helpers.toast) helpers.toast('부분 보정 적용 완료');
        });
        if (!committed) {
          mctx.clearRect(0, 0, mask.width, mask.height);
          if (helpers && helpers.toast) helpers.toast('부분 보정 적용 완료');
        }
      }
    });
  }

  // 탭 떠날 때 마스크 정리 — _state.activeTab 감시 (메인이 알려주는 hook 없으므로 mutation)
  // [추측] popstate / 다른 탭 클릭 시 panel 재바인딩되며 ensureMaskCanvas 재호출됨 → 잔존 OK.
  // 다만 'brush' 외 탭으로 갈 때 mask 숨김 처리.
  document.addEventListener('click', (e) => {
    const tab = e.target.closest && e.target.closest('[data-pe-tab]');
    if (!tab) return;
    const next = tab.dataset.peTab;
    const m = document.getElementById('peMaskCanvas');
    if (m) m.style.display = (next === 'brush') ? 'block' : 'none';
  });

  function _register() {
    if (!window.PhotoEditor || !window.PhotoEditor._internal) return false;
    const i = window.PhotoEditor._internal;
    i.registerTabPanel('brush', { html: _panelBrushHTML, bind: _bindBrushPanel });
    return true;
  }
  if (!_register()) {
    let tries = 0;
    const iv = setInterval(() => {
      if (_register() || ++tries > 50) clearInterval(iv);
    }, 100);
  }

  // 외부에서 mask 제거 트리거 (편집기 close 시 호출 가능)
  window.PhotoEditor = window.PhotoEditor || {};
  window.PhotoEditor._brushCleanup = function () {
    _unbindBrushEvents(document.getElementById('peCanvas'));
    _removeMask();
    _removeCursorRing();
  };
})();
