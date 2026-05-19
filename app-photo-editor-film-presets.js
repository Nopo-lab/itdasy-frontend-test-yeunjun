/* 사진 편집기 — Film 프리셋 8종 (Sprint 5 v230 2026-05-19)
   뷰티 도메인 큐레이션. 3D LUT 32×32×32 함수형 생성 → Sprint 2 LUT3D 셰이더 재사용.

   8 프리셋 (LUT 함수):
     - Salon Soft     : 채도 -10%, 명도 +5%, 따뜻한 톤, 부드러운 fade
     - Nail Glow      : 채도 +20%, 핑크/마젠타 강조
     - Hair Shine     : 대비 +15%, 따뜻한 갈색 톤
     - Lash Crisp     : 대비 +25%, 검정 진하게
     - Brow Sharp     : 대비 +20%, 갈색 강조
     - Studio Light   : 밝기 +10%, 채도 +5%, 화이트 밸런스 약간 차갑게
     - Warm Skin      : R+, B- (따뜻), 명도 +5%
     - Cool Skin      : R-, B+ (차가움), 채도 -5%

   state.film = { presetId: null|string, strength: 100 }
   strength: 0~100 (LUT 결과와 원본 blend 비율)
*/
(function () {
  'use strict';
  if (window.PhotoEditorFilmPresets) return;

  const LUT_SIZE = 32;
  const TEX_W = LUT_SIZE * LUT_SIZE;  // 1024
  const TEX_H = LUT_SIZE;             // 32

  // HSL 변환 helpers
  function _rgbToHsl(r, g, b) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = 0; s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h /= 6;
    }
    return [h, s, l];
  }
  function _hue2rgb(p, q, t) {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  }
  function _hslToRgb(h, s, l) {
    if (s === 0) return [l, l, l];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [_hue2rgb(p, q, h + 1/3), _hue2rgb(p, q, h), _hue2rgb(p, q, h - 1/3)];
  }

  // ── 8 프리셋 LUT 함수 (입력 0~1, 출력 0~1) ──
  const PRESETS = {
    'salon-soft': {
      label: '살롱 소프트',
      desc: '부드러운 살결 + 따뜻한 톤',
      fn: (r, g, b) => {
        const [h, s, l] = _rgbToHsl(r, g, b);
        const nl = Math.min(1, l * 1.05);
        const ns = Math.max(0, s * 0.9);
        let [nr, ng, nb] = _hslToRgb(h, ns, nl);
        // 따뜻한 톤 (R+, B-)
        nr = Math.min(1, nr + 0.025);
        nb = Math.max(0, nb - 0.02);
        // 부드러운 fade (양 끝 압축)
        return [
          0.04 + nr * 0.92,
          0.04 + ng * 0.92,
          0.04 + nb * 0.92,
        ];
      },
    },
    'nail-glow': {
      label: '네일 글로우',
      desc: '핑크 강조 + 광택감',
      fn: (r, g, b) => {
        const [h, s, l] = _rgbToHsl(r, g, b);
        let ns = Math.min(1, s * 1.2);
        // 핑크/마젠타 hue (0.85~1.0) 채도 더 강조
        if (h > 0.85 || h < 0.05) ns = Math.min(1, ns * 1.15);
        const [nr, ng, nb] = _hslToRgb(h, ns, Math.min(1, l * 1.03));
        return [nr, ng, nb];
      },
    },
    'hair-shine': {
      label: '헤어 샤인',
      desc: '대비 + 갈색 톤 강조',
      fn: (r, g, b) => {
        // 대비 +15%
        const nr = Math.max(0, Math.min(1, (r - 0.5) * 1.15 + 0.5));
        const ng = Math.max(0, Math.min(1, (g - 0.5) * 1.15 + 0.5));
        const nb = Math.max(0, Math.min(1, (b - 0.5) * 1.15 + 0.5));
        // 갈색 톤 (R+, B-)
        return [Math.min(1, nr + 0.02), ng, Math.max(0, nb - 0.025)];
      },
    },
    'lash-crisp': {
      label: '래쉬 크리스프',
      desc: '강한 대비 + 검정 진하게',
      fn: (r, g, b) => {
        const nr = Math.max(0, Math.min(1, (r - 0.5) * 1.25 + 0.5));
        const ng = Math.max(0, Math.min(1, (g - 0.5) * 1.25 + 0.5));
        const nb = Math.max(0, Math.min(1, (b - 0.5) * 1.25 + 0.5));
        // 검정 영역 더 진하게
        const lum = (nr + ng + nb) / 3;
        const k = lum < 0.3 ? 0.85 : 1;
        return [nr * k, ng * k, nb * k];
      },
    },
    'brow-sharp': {
      label: '브로우 샤프',
      desc: '대비 + 갈색 진하게',
      fn: (r, g, b) => {
        const nr = Math.max(0, Math.min(1, (r - 0.5) * 1.20 + 0.5));
        const ng = Math.max(0, Math.min(1, (g - 0.5) * 1.20 + 0.5));
        const nb = Math.max(0, Math.min(1, (b - 0.5) * 1.20 + 0.5));
        return [Math.min(1, nr + 0.015), ng * 0.97, nb * 0.93];
      },
    },
    'studio-light': {
      label: '스튜디오 라이트',
      desc: '밝기 + 화이트 밸런스 차갑게',
      fn: (r, g, b) => {
        const nr = Math.max(0, Math.min(1, r * 1.08));
        const ng = Math.max(0, Math.min(1, g * 1.10));
        const nb = Math.max(0, Math.min(1, b * 1.12));
        const [h, s, l] = _rgbToHsl(nr, ng, nb);
        return _hslToRgb(h, Math.min(1, s * 1.05), Math.min(1, l));
      },
    },
    'warm-skin': {
      label: '웜 스킨',
      desc: '따뜻한 피부톤',
      fn: (r, g, b) => {
        const nr = Math.max(0, Math.min(1, r * 1.06 + 0.02));
        const ng = Math.max(0, Math.min(1, g * 1.02));
        const nb = Math.max(0, Math.min(1, b * 0.94));
        return [nr, ng, nb];
      },
    },
    'cool-skin': {
      label: '쿨 스킨',
      desc: '차가운 피부톤',
      fn: (r, g, b) => {
        const nr = Math.max(0, Math.min(1, r * 0.96));
        const ng = Math.max(0, Math.min(1, g * 1.01));
        const nb = Math.max(0, Math.min(1, b * 1.08 + 0.015));
        const [h, s, l] = _rgbToHsl(nr, ng, nb);
        return _hslToRgb(h, Math.max(0, s * 0.95), l);
      },
    },
  };

  // ── LUT 캔버스 생성 (한 프리셋당 1024×32) — lazy + 캐시 ──
  const _lutCache = {};

  function _buildLUTCanvas(presetId) {
    if (_lutCache[presetId]) return _lutCache[presetId];
    const preset = PRESETS[presetId];
    if (!preset) return null;
    const cv = document.createElement('canvas');
    cv.width = TEX_W; cv.height = TEX_H;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(TEX_W, TEX_H);
    const d = img.data;
    for (let b = 0; b < LUT_SIZE; b++) {
      for (let g = 0; g < LUT_SIZE; g++) {
        for (let r = 0; r < LUT_SIZE; r++) {
          const x = b * LUT_SIZE + r;
          const y = g;
          const idx = (y * TEX_W + x) * 4;
          const rIn = r / (LUT_SIZE - 1);
          const gIn = g / (LUT_SIZE - 1);
          const bIn = b / (LUT_SIZE - 1);
          const [rOut, gOut, bOut] = preset.fn(rIn, gIn, bIn);
          d[idx]     = Math.round(Math.max(0, Math.min(1, rOut)) * 255);
          d[idx + 1] = Math.round(Math.max(0, Math.min(1, gOut)) * 255);
          d[idx + 2] = Math.round(Math.max(0, Math.min(1, bOut)) * 255);
          d[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    _lutCache[presetId] = cv;
    return cv;
  }

  function _ensureState(state) {
    if (!state.film) state.film = { presetId: null, strength: 100 };
    return state.film;
  }

  function _isIdentity(state) {
    const f = _ensureState(state);
    return !f.presetId || f.strength === 0;
  }

  // ── 패널 HTML/Bind (registerTabPanel('film')) ──
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

  function _previewCard(id, preset, isActive) {
    // 작은 색 그라데이션 카드 — LUT 결과 미리 시각화 (간단)
    const samples = [preset.fn(0.3, 0.3, 0.3), preset.fn(0.6, 0.5, 0.5), preset.fn(0.8, 0.7, 0.7)];
    const colorStops = samples.map(([r, g, b], i) => {
      const hex = '#' + [r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
      return `${hex} ${i * 50}%`;
    }).join(', ');
    return `<button type="button" class="pe-chip-btn" data-film-preset="${id}" style="display:flex;flex-direction:column;align-items:stretch;padding:0;overflow:hidden;${isActive ? 'outline:3px solid #F18091;outline-offset:-3px;' : ''}">
      <div style="background:linear-gradient(135deg, ${colorStops});height:48px;"></div>
      <div style="padding:6px 8px;font-size:11px;font-weight:600;text-align:center;background:#fff;">${_esc(preset.label)}</div>
    </button>`;
  }

  function _panelHTML(state) {
    const f = _ensureState(state);
    const cards = Object.keys(PRESETS).map(id => _previewCard(id, PRESETS[id], f.presetId === id)).join('');
    const activePreset = f.presetId && PRESETS[f.presetId];
    return `<div class="pe-field-label"><svg class="pe-ic" viewBox="0 0 24 24" style="margin-right:4px;"><use href="#ic-film"/></svg> 필름 프리셋 (뷰티 큐레이션 8종)</div>
      <div class="pe-guide-box">
        탭하면 즉시 적용. 강도 슬라이더로 세기 조절. 다시 같은 카드 누르면 해제.
      </div>
      <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:8px;margin:8px 0;">${cards}</div>
      ${activePreset ? `
        <div style="background:rgba(241,128,145,0.06);border-radius:10px;padding:10px 12px;margin-top:8px;">
          <div style="font-weight:700;font-size:13px;margin-bottom:4px;">${_esc(activePreset.label)}</div>
          <div style="font-size:11px;color:#666;margin-bottom:6px;">${_esc(activePreset.desc)}</div>
          <label class="pe-field" style="margin:0;">
            <span>강도 (${f.strength}%)</span>
            <input type="range" min="0" max="100" step="1" value="${f.strength}" data-film-strength>
          </label>
        </div>` : ''}
      <div class="pe-panel-row" style="display:flex;gap:8px;margin-top:8px;">
        <button type="button" class="pe-action-btn" data-film-reset>리셋</button>
      </div>`;
  }

  function _bindPanel(panel, state, helpers) {
    panel.querySelectorAll('[data-film-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.filmPreset;
        const f = _ensureState(state);
        // 같은 거 다시 누르면 해제
        if (f.presetId === id) f.presetId = null;
        else { f.presetId = id; f.strength = 75; }
        helpers.renderPanel(); helpers.redraw();
        if (helpers.pushHistory) helpers.pushHistory();
        if (helpers.toast && f.presetId) helpers.toast('필름 프리셋: ' + PRESETS[id].label);
      });
    });
    const sIn = panel.querySelector('[data-film-strength]');
    if (sIn) sIn.addEventListener('input', () => {
      const f = _ensureState(state);
      f.strength = parseInt(sIn.value, 10);
      const span = sIn.parentElement.querySelector('span');
      if (span) span.textContent = `강도 (${f.strength}%)`;
      helpers.scheduleRedraw();
    });
    const reset = panel.querySelector('[data-film-reset]');
    if (reset) reset.addEventListener('click', () => {
      const f = _ensureState(state);
      f.presetId = null; f.strength = 100;
      helpers.renderPanel(); helpers.redraw();
    });
  }

  // ── GL hook ──
  function _registerHook() {
    const PE = window.PhotoEditor;
    if (!PE || !PE._internal || !PE._internal.registerDrawHook || !PE._internal.registerTabPanel) return false;
    const Pipe = window.PhotoEditorGLPipeline;
    const LUT  = window.PhotoEditorGLShadersLUT;
    const Ctx  = window.PhotoEditorGLCtx;
    if (!Pipe || !LUT || !Ctx) return false;

    PE._internal.registerTabPanel('film', { html: _panelHTML, bind: _bindPanel });

    PE._internal.registerDrawHook('gl_film', (peCanvas, state, _helpers) => {
      if (!Ctx.init() || !Ctx.supported) return;
      if (_isIdentity(state)) return;
      const f = _ensureState(state);
      const lutCanvas = _buildLUTCanvas(f.presetId);
      if (!lutCanvas) return;
      // 1) LUT 결과 GL 합성
      const op = LUT.build3D(lutCanvas, LUT_SIZE);
      if (!op) return;
      const out = Pipe.run(peCanvas, [op], { width: peCanvas.width, height: peCanvas.height });
      if (!out) return;
      // 2) strength < 100 이면 원본과 blend
      const ctx2d = peCanvas.getContext('2d');
      ctx2d.save();
      ctx2d.filter = 'none';
      ctx2d.globalAlpha = 1;
      ctx2d.globalCompositeOperation = 'source-over';
      if (f.strength < 100) {
        ctx2d.globalAlpha = f.strength / 100;
      }
      ctx2d.drawImage(out, 0, 0, peCanvas.width, peCanvas.height);
      ctx2d.restore();
    });
    return true;
  }

  function _tryRegister() {
    if (_registerHook()) return;
    let tries = 0;
    const iv = setInterval(() => { if (_registerHook() || ++tries > 60) clearInterval(iv); }, 100);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _tryRegister);
  else _tryRegister();

  window.PhotoEditorFilmPresets = {
    PRESETS,
    buildLUTCanvas: _buildLUTCanvas,
    panelHTML: _panelHTML,
    bindPanel: _bindPanel,
  };
})();
