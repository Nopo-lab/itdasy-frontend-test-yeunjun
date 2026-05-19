/* 사진 편집기 — HSL 분리 보정 (Sprint 4 v228 2026-05-19)
   8 색상대 (빨강/주황/노랑/초록/시안/파랑/보라/마젠타) × Saturation + Lightness = 16 슬라이더.
   머리색·립·네일 같은 뷰티 컬러 정밀 조정 (Lightroom HSL 패널 스타일).

   GL fragment shader: 입력 RGB → HSV → hue 범위별 가중치 → S/L 시프트 → RGB.
   ranges (degrees): 빨강=0, 주황=30, 노랑=60, 초록=120, 시안=180, 파랑=240, 보라=270, 마젠타=300
   gaussian falloff (반폭 30°) — 자연스러운 경계.
*/
(function () {
  'use strict';
  if (window.PhotoEditorHSL) return;

  const COLORS = [
    { id: 'red',     label: '빨강',   hue: 0,   swatch: '#e74c3c' },
    { id: 'orange',  label: '주황',   hue: 30,  swatch: '#e67e22' },
    { id: 'yellow',  label: '노랑',   hue: 60,  swatch: '#f1c40f' },
    { id: 'green',   label: '초록',   hue: 120, swatch: '#27ae60' },
    { id: 'cyan',    label: '시안',   hue: 180, swatch: '#1abc9c' },
    { id: 'blue',    label: '파랑',   hue: 240, swatch: '#3498db' },
    { id: 'purple',  label: '보라',   hue: 270, swatch: '#8e44ad' },
    { id: 'magenta', label: '마젠타', hue: 300, swatch: '#e84393' },
  ];

  function _ensureState(state) {
    if (!state.hsl) {
      state.hsl = { enabled: false, sat: {}, light: {} };
      COLORS.forEach(c => { state.hsl.sat[c.id] = 0; state.hsl.light[c.id] = 0; });
    }
    return state.hsl;
  }

  function _isIdentity(state) {
    const h = _ensureState(state);
    if (!h.enabled) return true;
    return COLORS.every(c => (h.sat[c.id] || 0) === 0 && (h.light[c.id] || 0) === 0);
  }

  // ── GL Shader ──
  // 8 hue 범위 (0~1 normalized) + S/L 시프트
  const FS = `
uniform float u_satR;
uniform float u_satO;
uniform float u_satY;
uniform float u_satG;
uniform float u_satC;
uniform float u_satB;
uniform float u_satP;
uniform float u_satM;
uniform float u_lightR;
uniform float u_lightO;
uniform float u_lightY;
uniform float u_lightG;
uniform float u_lightC;
uniform float u_lightB;
uniform float u_lightP;
uniform float u_lightM;

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// hue (0~1) 에 대한 색상대별 가중치 (가우시안). center 도 0~1.
float weight(float hue, float center, float halfWidth) {
  float d = abs(hue - center);
  d = min(d, 1.0 - d);  // 순환 거리
  float t = d / halfWidth;
  return exp(-t * t * 2.0);
}

void main() {
  vec4 original = texture(u_image, v_uv);
  vec3 hsv = rgb2hsv(original.rgb);
  float hue = hsv.x;
  float hw = 1.0 / 12.0;  // 반폭 ~30도 (= 30/360)

  // 8 색상대 가중치
  float wR = weight(hue, 0.0/360.0, hw);
  float wO = weight(hue, 30.0/360.0, hw);
  float wY = weight(hue, 60.0/360.0, hw);
  float wG = weight(hue, 120.0/360.0, hw);
  float wC = weight(hue, 180.0/360.0, hw);
  float wB = weight(hue, 240.0/360.0, hw);
  float wP = weight(hue, 270.0/360.0, hw);
  float wM = weight(hue, 300.0/360.0, hw);

  float satShift = wR*u_satR + wO*u_satO + wY*u_satY + wG*u_satG + wC*u_satC + wB*u_satB + wP*u_satP + wM*u_satM;
  float lightShift = wR*u_lightR + wO*u_lightO + wY*u_lightY + wG*u_lightG + wC*u_lightC + wB*u_lightB + wP*u_lightP + wM*u_lightM;

  hsv.y = clamp(hsv.y + satShift, 0.0, 1.0);
  hsv.z = clamp(hsv.z + lightShift, 0.0, 1.0);

  vec3 rgb = hsv2rgb(hsv);
  vec4 effect = vec4(rgb, original.a);
  outColor = applyMask(original, effect);
}`;

  let _program = null;
  function _ensureProgram() {
    if (_program) return _program;
    const Pipe = window.PhotoEditorGLPipeline;
    const Ctx  = window.PhotoEditorGLCtx;
    if (!Pipe || !Ctx) return null;
    _program = Ctx.compileProgram(Pipe.VS_COMMON, Pipe.FS_HEADER + FS);
    return _program;
  }

  function _build(state) {
    const program = _ensureProgram();
    if (!program) return null;
    const h = _ensureState(state);
    const norm = (v) => (v || 0) / 100;  // -100~100 슬라이더 → -1~1
    return {
      program,
      uniforms: {
        u_satR: norm(h.sat.red),     u_satO: norm(h.sat.orange),  u_satY: norm(h.sat.yellow),  u_satG: norm(h.sat.green),
        u_satC: norm(h.sat.cyan),    u_satB: norm(h.sat.blue),    u_satP: norm(h.sat.purple),  u_satM: norm(h.sat.magenta),
        u_lightR: norm(h.light.red), u_lightO: norm(h.light.orange), u_lightY: norm(h.light.yellow), u_lightG: norm(h.light.green),
        u_lightC: norm(h.light.cyan), u_lightB: norm(h.light.blue), u_lightP: norm(h.light.purple), u_lightM: norm(h.light.magenta),
      },
    };
  }

  // ── UI: sub-panel ──
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  let _mode = 'sat';  // 'sat' | 'light'

  function _subPanelHTML(state) {
    const h = _ensureState(state);
    const modeBtn = (id, label) => `<button type="button" class="pe-chip-btn ${_mode === id ? 'on' : ''}" data-hsl-mode="${id}">${_esc(label)}</button>`;
    const HINTS = {
      red: '입술·코끝·붉은기 단색',
      orange: '피부톤 (한국인 피부)',
      yellow: '머리카락 따뜻한 톤',
      green: '잎사귀·이끼',
      cyan: '하늘·차가운 빛',
      blue: '하늘·청록 머리',
      purple: '와인 머리·네일',
      magenta: '핑크 립·핑크 네일',
    };
    const rows = COLORS.map(c => {
      const v = (_mode === 'sat' ? h.sat[c.id] : h.light[c.id]) || 0;
      return `<div style="display:flex;align-items:center;gap:8px;margin:6px 0;">
        <span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:${c.swatch};flex-shrink:0;"></span>
        <div style="width:90px;font-size:11px;line-height:1.2;"><div style="font-weight:600;">${_esc(c.label)}</div><div style="color:#888;font-size:10px;">${_esc(HINTS[c.id] || '')}</div></div>
        <input type="range" min="-100" max="100" step="1" value="${v}" data-hsl-slider="${c.id}" style="flex:1;">
        <span data-hsl-val="${c.id}" style="width:32px;text-align:right;font-size:11px;color:#888;">${v}</span>
      </div>`;
    }).join('');
    return `<div class="pe-field-label">HSL 분리 보정 (색상대별)</div>
      <div class="pe-guide-box">
        <strong>쉽게 쓰는 법:</strong> 원하는 컬러의 채도/밝기만 바꿔요. 예) <strong>오렌지 슬라이더</strong>=피부톤, <strong>마젠타</strong>=핑크 립/네일. 아래 프리셋으로 시작해보세요.
      </div>
      <div class="pe-field-label" style="margin-top:4px;font-size:11px;">빠른 프리셋</div>
      <div class="pe-panel-row" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
        <button type="button" class="pe-chip-btn" data-hsl-preset="skin-pop">피부 자연 톤</button>
        <button type="button" class="pe-chip-btn" data-hsl-preset="hair-warm">머리 따뜻하게</button>
        <button type="button" class="pe-chip-btn" data-hsl-preset="hair-cool">머리 차갑게 (애쉬)</button>
        <button type="button" class="pe-chip-btn" data-hsl-preset="lip-pop">립 컬러 강조</button>
        <button type="button" class="pe-chip-btn" data-hsl-preset="bg-mute">배경 톤 가라앉히기</button>
      </div>
      <div class="pe-panel-row" style="display:flex;gap:6px;">
        ${modeBtn('sat', '채도 (S)')}
        ${modeBtn('light', '명도 (L)')}
      </div>
      <div style="margin-top:10px;">${rows}</div>
      <div class="pe-panel-row" style="display:flex;gap:8px;margin-top:8px;">
        <button type="button" class="pe-action-btn" data-hsl-reset>리셋</button>
        <button type="button" class="pe-action-btn" data-hsl-toggle style="background:${h.enabled ? '#F18091' : '#888'};color:#fff;">${h.enabled ? '적용 켜짐' : '적용 꺼짐'}</button>
      </div>`;
  }

  const HSL_PRESETS = {
    'skin-pop':  { sat: { orange: 20, red: 15 },             light: { orange: 5 } },
    'hair-warm': { sat: { orange: 25, yellow: 30 },          light: { yellow: 8 } },
    'hair-cool': { sat: { orange: -20, yellow: -25 },        light: { yellow: -10 } },
    'lip-pop':   { sat: { red: 35, magenta: 30 },            light: { red: -5 } },
    'bg-mute':   { sat: { green: -40, blue: -30, cyan: -30 }, light: {} },
  };

  function _bindSubPanel(panel, state, helpers) {
    panel.querySelectorAll('[data-hsl-preset]').forEach(b => {
      b.addEventListener('click', () => {
        const preset = HSL_PRESETS[b.dataset.hslPreset];
        if (!preset) return;
        const h = _ensureState(state);
        // 리셋 후 프리셋 적용
        COLORS.forEach(c => { h.sat[c.id] = 0; h.light[c.id] = 0; });
        Object.assign(h.sat, preset.sat || {});
        Object.assign(h.light, preset.light || {});
        h.enabled = true;
        if (helpers.toast) helpers.toast('HSL 프리셋: ' + b.textContent);
        helpers.renderPanel(); helpers.redraw();
        if (helpers.pushHistory) helpers.pushHistory();
      });
    });
    panel.querySelectorAll('[data-hsl-mode]').forEach(b => {
      b.addEventListener('click', () => { _mode = b.dataset.hslMode; helpers.renderPanel(); });
    });
    panel.querySelectorAll('[data-hsl-slider]').forEach(input => {
      const id = input.dataset.hslSlider;
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        const h = _ensureState(state);
        if (_mode === 'sat') h.sat[id] = v;
        else h.light[id] = v;
        h.enabled = true;
        const valEl = panel.querySelector(`[data-hsl-val="${id}"]`);
        if (valEl) valEl.textContent = v;
        helpers.scheduleRedraw();
      });
      input.addEventListener('change', () => { if (helpers.pushHistory) helpers.pushHistory(); });
    });
    const resetBtn = panel.querySelector('[data-hsl-reset]');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      const h = _ensureState(state);
      COLORS.forEach(c => { h.sat[c.id] = 0; h.light[c.id] = 0; });
      helpers.renderPanel(); helpers.redraw();
    });
    const toggleBtn = panel.querySelector('[data-hsl-toggle]');
    if (toggleBtn) toggleBtn.addEventListener('click', () => {
      const h = _ensureState(state);
      h.enabled = !h.enabled;
      helpers.renderPanel(); helpers.redraw();
    });
  }

  function _registerHook() {
    const PE = window.PhotoEditor;
    if (!PE || !PE._internal || !PE._internal.registerDrawHook) return false;
    const Pipe = window.PhotoEditorGLPipeline;
    const Ctx  = window.PhotoEditorGLCtx;
    if (!Pipe || !Ctx) return false;

    PE._internal.registerDrawHook('gl_hsl', (peCanvas, state, _helpers) => {
      if (!Ctx.init() || !Ctx.supported) return;
      if (_isIdentity(state)) return;
      const op = _build(state);
      if (!op) return;
      const out = Pipe.run(peCanvas, [op], { width: peCanvas.width, height: peCanvas.height });
      if (!out) return;
      const ctx2d = peCanvas.getContext('2d');
      ctx2d.save(); ctx2d.filter = 'none';
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

  window.PhotoEditorHSL = {
    subPanelHTML: _subPanelHTML,
    bindSubPanel: _bindSubPanel,
    isIdentity: _isIdentity,
    COLORS,
  };
})();
