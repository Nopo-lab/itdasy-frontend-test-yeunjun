/* 사진 편집기 — Tone Curve (Sprint 4 v228 2026-05-19)
   Canvas 곡선 에디터 (RGB/R/G/B 채널) + 4 control point Catmull-Rom spline + 256 px Uint8Array LUT.
   Sprint 2 LUT 1D 셰이더 재사용 + gl-pipeline.run 의 textures slot 으로 u_lut 바인딩.

   state.curve = {
     channel: 'rgb' | 'r' | 'g' | 'b',
     points: { rgb: [[0,0],[0.33,0.33],[0.66,0.66],[1,1]], r: [...], g: [...], b: [...] },
     enabled: true
   }
*/
(function () {
  'use strict';
  if (window.PhotoEditorCurve) return;

  const SIZE = 256;

  function _ensureState(state) {
    if (!state.curve) {
      const id = [[0,0],[0.33,0.33],[0.66,0.66],[1,1]];
      state.curve = {
        channel: 'rgb',
        points: { rgb: id.slice(), r: id.slice(), g: id.slice(), b: id.slice() },
        enabled: false,
      };
    }
    return state.curve;
  }

  // ── Catmull-Rom spline 보간 ──
  function _catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2*p0 - 5*p1 + 4*p2 - p3) * t2 + (-p0 + 3*p1 - 3*p2 + p3) * t3);
  }

  // 4 control point → 256 lookup table
  function _buildLUTArray(points) {
    // points = [[x,y], ...] 0~1
    const sorted = points.slice().sort((a, b) => a[0] - b[0]);
    const arr = new Uint8Array(SIZE);
    for (let i = 0; i < SIZE; i++) {
      const x = i / (SIZE - 1);
      // x 가 속하는 segment 찾기
      let seg = 0;
      for (let j = 0; j < sorted.length - 1; j++) {
        if (x >= sorted[j][0] && x <= sorted[j+1][0]) { seg = j; break; }
      }
      const p0 = sorted[Math.max(0, seg - 1)];
      const p1 = sorted[seg];
      const p2 = sorted[Math.min(sorted.length - 1, seg + 1)];
      const p3 = sorted[Math.min(sorted.length - 1, seg + 2)];
      const t = (x - p1[0]) / Math.max(1e-6, p2[0] - p1[0]);
      const y = _catmullRom(p0[1], p1[1], p2[1], p3[1], Math.max(0, Math.min(1, t)));
      arr[i] = Math.max(0, Math.min(255, Math.round(y * 255)));
    }
    return arr;
  }

  // RGBA 1024-byte texture data (R/G/B 채널별 LUT 합침)
  function _buildLUTRGBA(state) {
    const c = _ensureState(state);
    const masterLUT = _buildLUTArray(c.points.rgb);
    const rLUT = _buildLUTArray(c.points.r);
    const gLUT = _buildLUTArray(c.points.g);
    const bLUT = _buildLUTArray(c.points.b);
    const out = new Uint8Array(SIZE * 4);
    for (let i = 0; i < SIZE; i++) {
      // 채널별: master 적용 후 채널 LUT 적용
      out[i*4]     = rLUT[masterLUT[i]];
      out[i*4 + 1] = gLUT[masterLUT[i]];
      out[i*4 + 2] = bLUT[masterLUT[i]];
      out[i*4 + 3] = 255;
    }
    return out;
  }

  function _isIdentity(state) {
    const c = _ensureState(state);
    if (!c.enabled) return true;
    for (const key of ['rgb', 'r', 'g', 'b']) {
      const pts = c.points[key];
      for (const p of pts) {
        if (Math.abs(p[0] - p[1]) > 0.001) return false;
      }
    }
    return true;
  }

  function _reset(state) {
    const id = [[0,0],[0.33,0.33],[0.66,0.66],[1,1]];
    const c = _ensureState(state);
    c.points = { rgb: id.slice(), r: id.slice(), g: id.slice(), b: id.slice() };
  }

  // ── UI: sub-panel HTML (pro-tab.js 가 호출) ──
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

  function _subPanelHTML(state) {
    const c = _ensureState(state);
    const chBtn = (id, label, color) => `<button type="button" class="pe-chip-btn ${c.channel === id ? 'on' : ''}" data-curve-ch="${id}" style="${c.channel === id ? 'background:' + color + ';color:#fff;' : ''}">${_esc(label)}</button>`;
    return `<div class="pe-field-label">톤 곡선 (Curves)</div>
      <div class="pe-guide-box">
        <strong>쉽게 쓰는 법:</strong> 아래 프리셋부터 눌러보고, 곡선 점은 익숙해진 후에. RGB = 전체 밝기/대비, R/G/B = 각 색 채널.
      </div>
      <div class="pe-field-label" style="margin-top:6px;font-size:11px;">빠른 프리셋</div>
      <div class="pe-panel-row" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
        <button type="button" class="pe-chip-btn" data-curve-preset="bright">밝게</button>
        <button type="button" class="pe-chip-btn" data-curve-preset="dark">어둡게</button>
        <button type="button" class="pe-chip-btn" data-curve-preset="contrast">대비 강하게 (S-커브)</button>
        <button type="button" class="pe-chip-btn" data-curve-preset="fade">필름 페이드 (옅게)</button>
        <button type="button" class="pe-chip-btn" data-curve-preset="lift-shadow">그림자 들어올리기</button>
      </div>
      <div class="pe-field-label" style="font-size:11px;">채널 선택</div>
      <div class="pe-panel-row" style="display:flex;gap:6px;">
        ${chBtn('rgb', '전체 RGB', '#555')}
        ${chBtn('r', 'R (빨강)', '#e74c3c')}
        ${chBtn('g', 'G (초록)', '#27ae60')}
        ${chBtn('b', 'B (파랑)', '#3498db')}
      </div>
      <canvas id="peCurveCanvas" width="256" height="256" style="display:block;width:100%;max-width:280px;margin:12px auto;background:#1a1a1f;border-radius:12px;touch-action:none;cursor:crosshair;"></canvas>
      <div class="pe-panel-row" style="display:flex;gap:8px;">
        <button type="button" class="pe-action-btn" data-curve-reset>리셋</button>
        <button type="button" class="pe-action-btn" data-curve-toggle style="background:${c.enabled ? '#F18091' : '#888'};color:#fff;">${c.enabled ? '적용 켜짐' : '적용 꺼짐'}</button>
      </div>
      <div class="pe-hint">검은 박스 안 점을 드래그 — 왼쪽 = 어두운 영역, 오른쪽 = 밝은 영역.</div>`;
  }

  // ── 곡선 캔버스 렌더 + 인터랙션 ──
  function _drawCurveCanvas(cv, state) {
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const c = _ensureState(state);
    ctx.clearRect(0, 0, W, H);
    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const x = (W / 4) * i;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      const y = (H / 4) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    // diagonal reference
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(W, 0); ctx.stroke();
    // 곡선
    const lut = _buildLUTArray(c.points[c.channel]);
    const lineColor = c.channel === 'r' ? '#e74c3c' : c.channel === 'g' ? '#27ae60' : c.channel === 'b' ? '#3498db' : '#fff';
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < SIZE; i++) {
      const x = (i / (SIZE - 1)) * W;
      const y = H - (lut[i] / 255) * H;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // control points
    const pts = c.points[c.channel];
    pts.forEach(p => {
      const px = p[0] * W;
      const py = H - p[1] * H;
      ctx.fillStyle = lineColor;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  function _bindCurveCanvas(cv, state, helpers) {
    const c = _ensureState(state);
    let dragging = -1;
    function _hitTest(e) {
      const rect = cv.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width);
      const y = 1 - ((e.clientY - rect.top) / rect.height);
      const pts = c.points[c.channel];
      for (let i = 0; i < pts.length; i++) {
        if (Math.hypot(x - pts[i][0], y - pts[i][1]) < 0.06) return i;
      }
      return -1;
    }
    cv.addEventListener('pointerdown', (e) => {
      dragging = _hitTest(e);
      if (dragging >= 0) try { cv.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    });
    cv.addEventListener('pointermove', (e) => {
      if (dragging < 0) return;
      const rect = cv.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
      c.points[c.channel][dragging] = [x, y];
      c.enabled = true;
      _drawCurveCanvas(cv, state);
      if (helpers && helpers.scheduleRedraw) helpers.scheduleRedraw();
    });
    cv.addEventListener('pointerup', () => {
      if (dragging >= 0 && helpers && helpers.pushHistory) helpers.pushHistory();
      dragging = -1;
    });
  }

  // 빠른 프리셋 — 4 control point 가 미리 설정된 곡선 모양
  const PRESETS = {
    bright:       [[0,0.05],[0.33,0.43],[0.66,0.76],[1,1]],
    dark:         [[0,0],[0.33,0.23],[0.66,0.56],[1,0.95]],
    contrast:     [[0,0],[0.25,0.15],[0.75,0.85],[1,1]],         // S-커브
    fade:         [[0,0.12],[0.33,0.38],[0.66,0.66],[1,0.88]],   // 양 끝 압축 (필름 페이드)
    'lift-shadow':[[0,0.18],[0.33,0.43],[0.66,0.7],[1,1]],
  };

  function _bindSubPanel(panel, state, helpers) {
    panel.querySelectorAll('[data-curve-preset]').forEach(b => {
      b.addEventListener('click', () => {
        const c = _ensureState(state);
        const pts = PRESETS[b.dataset.curvePreset];
        if (!pts) return;
        c.channel = 'rgb';
        c.points.rgb = pts.map(p => p.slice());
        c.enabled = true;
        if (helpers.toast) helpers.toast('곡선 프리셋: ' + b.textContent);
        helpers.renderPanel(); helpers.redraw();
        if (helpers.pushHistory) helpers.pushHistory();
      });
    });
    panel.querySelectorAll('[data-curve-ch]').forEach(b => {
      b.addEventListener('click', () => {
        const c = _ensureState(state);
        c.channel = b.dataset.curveCh;
        helpers.renderPanel();
      });
    });
    const resetBtn = panel.querySelector('[data-curve-reset]');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      _reset(state);
      helpers.renderPanel(); helpers.redraw();
    });
    const toggleBtn = panel.querySelector('[data-curve-toggle]');
    if (toggleBtn) toggleBtn.addEventListener('click', () => {
      const c = _ensureState(state);
      c.enabled = !c.enabled;
      helpers.renderPanel(); helpers.redraw();
    });
    const cv = panel.querySelector('#peCurveCanvas');
    if (cv) { _drawCurveCanvas(cv, state); _bindCurveCanvas(cv, state, helpers); }
  }

  // ── GL hook ──
  let _lutTex = null;
  function _ensureLutTex() {
    const Ctx = window.PhotoEditorGLCtx;
    if (!Ctx || !Ctx.init() || !Ctx.supported) return null;
    if (_lutTex) return _lutTex;
    _lutTex = Ctx.gl.createTexture();
    return _lutTex;
  }

  function _registerHook() {
    const PE = window.PhotoEditor;
    if (!PE || !PE._internal || !PE._internal.registerDrawHook) return false;
    const Pipe = window.PhotoEditorGLPipeline;
    const LUT  = window.PhotoEditorGLShadersLUT;
    const Ctx  = window.PhotoEditorGLCtx;
    if (!Pipe || !LUT || !Ctx) return false;

    PE._internal.registerDrawHook('gl_curve', (peCanvas, state, _helpers) => {
      if (!Ctx.init() || !Ctx.supported) return;
      if (_isIdentity(state)) return;
      const op = LUT.build1D();
      if (!op) return;
      // LUT 텍스처 업로드 (매 redraw 새로 — 곡선 자주 변경)
      const arr = _buildLUTRGBA(state);
      const tex = _ensureLutTex();
      if (!tex) return;
      const gl = Ctx.gl;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SIZE, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, arr);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      op.textures = { u_lut: tex };
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

  window.PhotoEditorCurve = {
    subPanelHTML: _subPanelHTML,
    bindSubPanel: _bindSubPanel,
    isIdentity: _isIdentity,
    reset: _reset,
  };
})();
