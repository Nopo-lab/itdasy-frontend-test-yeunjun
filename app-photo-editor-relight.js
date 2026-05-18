/* 잇데이 — AI 조명 보정 릴라이팅 (PE-8) 2026-05-19 v207
   어두운 시술실 → 스튜디오급 조명 보정. 조명 방향/색온도 슬라이더 */
(function () {
  'use strict';
  if (window.PhotoEditorRelight) return;

  let _state = { direction: 0.5, warmth: 0, intensity: 50, ambientBoost: 30 };

  function _panelHTML(edState) {
    const s = _state;
    return `
      <div class="pe-field-label">💡 AI 조명 보정</div>
      <div class="pe-hint" style="margin-bottom:10px;">어두운 시술실 사진을 스튜디오급 밝기로 자동 보정해요</div>
      <label class="pe-slider"><div class="pe-slider-head"><span>조명 방향 (좌↔우)</span><span class="pe-slider-val">${Math.round(s.direction*100)}</span></div><input type="range" min="0" max="100" value="${Math.round(s.direction*100)}" data-relight="direction"></label>
      <label class="pe-slider"><div class="pe-slider-head"><span>색온도 (차가움↔따뜻함)</span><span class="pe-slider-val">${s.warmth}</span></div><input type="range" min="-50" max="50" value="${s.warmth}" data-relight="warmth"></label>
      <label class="pe-slider"><div class="pe-slider-head"><span>보정 강도</span><span class="pe-slider-val">${s.intensity}</span></div><input type="range" min="0" max="100" value="${s.intensity}" data-relight="intensity"></label>
      <label class="pe-slider"><div class="pe-slider-head"><span>암부 보강</span><span class="pe-slider-val">${s.ambientBoost}</span></div><input type="range" min="0" max="100" value="${s.ambientBoost}" data-relight="ambientBoost"></label>
      <div class="pe-panel-row pe-panel-grid-2" style="margin-top:10px;">
        <button type="button" class="pe-action-btn" data-relight-auto>⚡ 자동 릴라이팅</button>
        <button type="button" class="pe-chip-btn" data-relight-reset>초기화</button>
      </div>
      <div class="pe-hint">조명 방향은 빛이 들어오는 각도, 색온도는 형광등(차가움)↔백열등(따뜻함)</div>`;
  }

  function _bindPanel(panel, edState, helpers) {
    const { redraw, pushHistory } = helpers;
    panel.querySelectorAll('[data-relight]').forEach(inp => {
      inp.addEventListener('input', () => {
        const key = inp.dataset.relight;
        _state[key] = key === 'direction' ? +inp.value / 100 : +inp.value;
        redraw();
      });
      inp.addEventListener('change', () => pushHistory());
    });
    const autoBtn = panel.querySelector('[data-relight-auto]');
    if (autoBtn) autoBtn.addEventListener('click', () => {
      _state = { direction: 0.55, warmth: 8, intensity: 65, ambientBoost: 45 };
      helpers.renderPanel(); redraw(); pushHistory();
      helpers.toast('스튜디오급 조명 보정 적용');
    });
    const resetBtn = panel.querySelector('[data-relight-reset]');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      _state = { direction: 0.5, warmth: 0, intensity: 50, ambientBoost: 30 };
      helpers.renderPanel(); redraw(); pushHistory();
    });
  }

  // drawHook — 릴라이팅 효과 적용
  function _drawRelight(ctx, w, h) {
    if (_state.intensity <= 0 && _state.ambientBoost <= 0) return;
    try {
      const imgData = ctx.getImageData(0, 0, w, h);
      const d = imgData.data;
      const dir = _state.direction; // 0=left, 1=right
      const warmth = _state.warmth / 100;
      const intens = _state.intensity / 100;
      const ambient = _state.ambientBoost / 100;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const nx = x / w;
          // 방향성 조명 — 방향에 가까울수록 밝게
          const lightFactor = 1 - Math.abs(nx - dir) * 0.6;
          const boost = 1 + intens * lightFactor * 0.4;
          // 암부 보강 — 어두운 픽셀일수록 더 밝게
          const luma = (d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114) / 255;
          const shadowBoost = luma < 0.4 ? ambient * (0.4 - luma) * 2 : 0;

          let r = d[i] * boost + shadowBoost * 255;
          let g = d[i+1] * boost + shadowBoost * 255;
          let b = d[i+2] * boost + shadowBoost * 255;

          // 색온도
          if (warmth > 0) { r += warmth * 30; b -= warmth * 15; }
          else if (warmth < 0) { b -= warmth * 20; r += warmth * 10; }

          d[i]   = Math.min(255, Math.max(0, r));
          d[i+1] = Math.min(255, Math.max(0, g));
          d[i+2] = Math.min(255, Math.max(0, b));
        }
      }
      ctx.putImageData(imgData, 0, 0);
    } catch (_e) { /* CORS 등 skip */ }
  }

  // 등록
  function _register() {
    if (!window.PhotoEditor || !window.PhotoEditor._internal) return false;
    const i = window.PhotoEditor._internal;
    // 'relight' 탭 동적 추가
    const tabsNav = document.getElementById('peTabs');
    if (tabsNav && !tabsNav.querySelector('[data-pe-tab="relight"]')) {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'pe-tab'; btn.dataset.peTab = 'relight'; btn.textContent = '조명';
      const exportTab = tabsNav.querySelector('[data-pe-tab="export"]');
      if (exportTab) tabsNav.insertBefore(btn, exportTab);
      else tabsNav.appendChild(btn);
    }
    i.registerTabPanel('relight', { html: _panelHTML, bind: _bindPanel });
    // drawHook — relight 탭 활성화 시에만 적용
    const origRedraw = i.helpers.redraw;
    i.helpers.redraw = function () {
      origRedraw();
      try {
        const st = i.getState();
        if (st && st.activeTab === 'relight') {
          const cv = document.getElementById('peCanvas');
          if (cv) _drawRelight(cv.getContext('2d'), cv.width, cv.height);
        }
      } catch (_e) { /* ignore */ }
    };
    return true;
  }
  if (!_register()) { let t = 0; const iv = setInterval(() => { if (_register() || ++t > 50) clearInterval(iv); }, 100); }

  window.PhotoEditorRelight = { getState: () => _state };
})();
