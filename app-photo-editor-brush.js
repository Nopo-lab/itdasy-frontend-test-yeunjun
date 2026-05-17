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

  function _clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

  const BRUSHES = {
    smooth:  { label: '부드럽게', color: 'rgba(120,200,150,0.55)' },
    shine:   { label: '윤기',    color: 'rgba(255,220,100,0.55)' },
    redness: { label: '붉은기 ↓', color: 'rgba(100,160,220,0.55)' },
    gloss:   { label: '광택',    color: 'rgba(255,255,255,0.55)' },
    blur:    { label: '블러',    color: 'rgba(150,150,150,0.55)' },
    eraser:  { label: '지우개',  color: 'rgba(220,80,80,0.45)' },
  };

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  function _ensureBrushState(state) {
    if (!state.brush) {
      state.brush = {
        type: 'smooth', size: 40, strength: 50,
        drawing: false, lastX: 0, lastY: 0,
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
        // 부모 position:relative 보장
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

  function _removeMask() {
    const m = document.getElementById('peMaskCanvas');
    if (m) m.remove();
  }

  function _panelBrushHTML(state) {
    const b = _ensureBrushState(state);
    const chip = (k) => `<button type="button" class="pe-chip-btn${b.type===k?' on':''}" data-pe-brush-type="${k}">${_esc(BRUSHES[k].label)}</button>`;
    return `<div class="pe-field-label">브러시 종류</div>
      <div class="pe-panel-row pe-panel-grid-3">${chip('smooth')}${chip('shine')}${chip('redness')}</div>
      <div class="pe-panel-row pe-panel-grid-3">${chip('gloss')}${chip('blur')}${chip('eraser')}</div>
      <label class="pe-slider"><div class="pe-slider-head"><span>브러시 크기</span><span class="pe-slider-val" data-pe-brush-size-val>${b.size}</span></div>
        <input type="range" min="10" max="120" value="${b.size}" data-pe-brush-size /></label>
      <label class="pe-slider"><div class="pe-slider-head"><span>강도</span><span class="pe-slider-val" data-pe-brush-strength-val>${b.strength}</span></div>
        <input type="range" min="10" max="100" value="${b.strength}" data-pe-brush-strength /></label>
      <div class="pe-panel-row pe-panel-grid-2" style="margin-top:8px;">
        <button type="button" class="pe-chip-btn" data-pe-brush-clear>마스크 초기화</button>
        <button type="button" class="pe-action-btn" data-pe-brush-apply>✓ 적용</button>
      </div>
      <div class="pe-hint">사진 위를 드래그해서 부분만 칠해요. 색칠된 영역에만 브러시 효과가 들어갑니다. [적용] 누르면 결과가 합쳐져요.</div>`;
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

    panel.querySelectorAll('[data-pe-brush-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        b.type = btn.dataset.peBrushType;
        panel.querySelectorAll('[data-pe-brush-type]').forEach(x => x.classList.toggle('on', x === btn));
      });
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
      b.drawing = true; b.lastX = p.x; b.lastY = p.y;
      _drawAt(p.x, p.y);
    }
    function _move(e) {
      if (!b.drawing || state.activeTab !== 'brush') return;
      e.preventDefault();
      const p = _getXY(e);
      const dx = p.x - b.lastX, dy = p.y - b.lastY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const step = Math.max(1, b.size / 4);
      const n = Math.max(1, Math.floor(dist / step));
      for (let i = 1; i <= n; i++) _drawAt(b.lastX + dx * i / n, b.lastY + dy * i / n);
      b.lastX = p.x; b.lastY = p.y;
    }
    function _end() { b.drawing = false; }

    // 메인 canvas 에 brush 이벤트 — 중복 등록 방지 위해 한 번만
    if (!mainCv._brushBound) {
      mainCv._brushBound = true;
      mainCv.addEventListener('mousedown', _start);
      mainCv.addEventListener('touchstart', _start, { passive: false });
      mainCv.addEventListener('mousemove', _move);
      mainCv.addEventListener('touchmove', _move, { passive: false });
      mainCv.addEventListener('mouseup', _end);
      mainCv.addEventListener('mouseleave', _end);
      mainCv.addEventListener('touchend', _end);
    }

    panel.querySelector('[data-pe-brush-clear]')?.addEventListener('click', () => {
      mctx.clearRect(0, 0, mask.width, mask.height);
      if (helpers && helpers.toast) helpers.toast('마스크 초기화');
    });

    panel.querySelector('[data-pe-brush-apply]')?.addEventListener('click', () => {
      const ok = _applyBrush(mainCv, mask, b);
      if (ok) {
        mctx.clearRect(0, 0, mask.width, mask.height);
        if (helpers && helpers.toast) helpers.toast('부분 보정 적용 완료');
        if (helpers && helpers.pushHistory) helpers.pushHistory();
      }
    });
  }

  function _applyBrush(mainCv, maskCv, b) {
    const ctx = mainCv.getContext('2d');
    const mctx = maskCv.getContext('2d');
    const w = mainCv.width, h = mainCv.height;
    let src, mdata;
    try {
      src = ctx.getImageData(0, 0, w, h);
      mdata = mctx.getImageData(0, 0, w, h);
    } catch (_e) { return false; }
    const d = src.data, m = mdata.data;
    const k = (b.strength || 50) / 100;
    const type = b.type;

    for (let i = 0; i < d.length; i += 4) {
      const alpha = m[i + 3] / 255;
      if (alpha < 0.05) continue;
      const w_l = alpha * k;
      const r = d[i], g = d[i + 1], bl = d[i + 2];
      const lum = r * 0.299 + g * 0.587 + bl * 0.114;

      if (type === 'smooth') {
        d[i]   = _clamp(r  + 3 * w_l);
        d[i+1] = _clamp(g  + 3 * w_l);
        d[i+2] = _clamp(bl + 3 * w_l);
      } else if (type === 'shine') {
        d[i]   = _clamp(r  + 15 * w_l);
        d[i+1] = _clamp(g  + 15 * w_l);
        d[i+2] = _clamp(bl + 10 * w_l);
      } else if (type === 'redness') {
        d[i]   = _clamp(r  - 30 * w_l);
        d[i+1] = _clamp(g  +  4 * w_l);
        d[i+2] = _clamp(bl +  5 * w_l);
      } else if (type === 'gloss') {
        if (lum > 140) {
          d[i]   = _clamp(r  + 20 * w_l);
          d[i+1] = _clamp(g  + 20 * w_l);
          d[i+2] = _clamp(bl + 20 * w_l);
        }
      } else if (type === 'blur') {
        const mix = w_l * 0.5;
        d[i]   = _clamp(r  * (1 - mix) + lum * mix);
        d[i+1] = _clamp(g  * (1 - mix) + lum * mix);
        d[i+2] = _clamp(bl * (1 - mix) + lum * mix);
      }
      // eraser 는 mask 자체만 영향. 적용 픽셀 walk 영향 X.
    }
    ctx.putImageData(src, 0, 0);
    return true;
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
  window.PhotoEditor._brushCleanup = _removeMask;
})();
