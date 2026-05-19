/* 사진 편집기 — Selective (한 점 탭 부분 보정, Sprint 3 v227 2026-05-19)
   Snapseed 스타일. 핀 최대 3개. 각 핀 4 슬라이더 (노출/대비/채도/구조).

   설계:
     - state.selective = { pins: [...], activeId, enabled }
     - 각 pin = { id, x:0~1, y:0~1, radius:0~1 (캔버스 짧은쪽 기준), exposure, contrast, saturation, structure }
     - 캔버스 위에 핀 마커 overlay (절대 위치 div).
     - 슬라이더 패널은 PhotoEditor._internal.registerTabPanel('selective', ...) 으로 등록.

   진입:
     1. PhotoEditor 의 TABS 에 'selective' 추가 (메인 1줄 수정)
     2. 사용자가 selective 탭 클릭 → 패널 표시, 마커 활성
     3. 더블탭 캔버스 빈 영역 → 새 핀 추가
     4. 핀 탭 → 활성 핀 변경, 슬라이더 갱신

   합성: app-photo-editor-selective-mask.js 가 _drawHooks.gl_selective 등록 (별도 파일).
*/
(function () {
  'use strict';
  if (window.PhotoEditorSelective) return;

  const MAX_PINS = 3;
  const DEFAULT_RADIUS = 0.18;  // 캔버스 짧은쪽의 18%

  function _ensureState(state) {
    if (!state.selective) {
      state.selective = { pins: [], activeId: null, enabled: false };
    }
    return state.selective;
  }

  function _addPin(state, x, y) {
    const sel = _ensureState(state);
    if (sel.pins.length >= MAX_PINS) return null;
    const id = 'sel-' + Date.now();
    sel.pins.push({
      id, x, y, radius: DEFAULT_RADIUS,
      exposure: 0, contrast: 0, saturation: 0, structure: 0,
    });
    sel.activeId = id;
    return id;
  }

  function _removePin(state, id) {
    const sel = _ensureState(state);
    sel.pins = sel.pins.filter(p => p.id !== id);
    if (sel.activeId === id) sel.activeId = sel.pins[0] ? sel.pins[0].id : null;
  }

  function _getActive(state) {
    const sel = _ensureState(state);
    if (!sel.activeId) return null;
    return sel.pins.find(p => p.id === sel.activeId);
  }

  // ── UI: 핀 마커 overlay ──
  let _markerContainer = null;
  let _lastDoubleTap = 0;
  let _draggingPin = null;
  let _wrapRef = null;
  let _stateRef = null;
  let _helpersRef = null;

  function _ensureMarkerContainer() {
    if (_markerContainer && _markerContainer.parentNode) return _markerContainer;
    const wrap = _wrapRef || document.querySelector('.pe-canvas-wrap');
    if (!wrap) return null;
    _markerContainer = document.createElement('div');
    _markerContainer.id = 'peSelectiveMarkers';
    _markerContainer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:8;';
    wrap.appendChild(_markerContainer);
    return _markerContainer;
  }

  function _refreshMarkers() {
    const c = _ensureMarkerContainer();
    if (!c || !_stateRef) return;
    const sel = _ensureState(_stateRef);
    if (!sel.enabled || sel.pins.length === 0) { c.innerHTML = ''; return; }
    const cv = document.getElementById('peCanvas');
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const wRect = c.getBoundingClientRect();
    const offX = rect.left - wRect.left;
    const offY = rect.top - wRect.top;
    const W = rect.width, H = rect.height;
    const shorter = Math.min(W, H);
    // polygon 핀은 별도 SVG overlay 로 외곽선 표시, radial 핀은 기존 원형 마커
    const radialPins = sel.pins.filter(p => p.type !== 'polygon');
    const polygonPins = sel.pins.filter(p => p.type === 'polygon');
    const radialHTML = radialPins.map(p => {
      const px = offX + p.x * W;
      const py = offY + p.y * H;
      const r = p.radius * shorter;
      const isActive = p.id === sel.activeId;
      // [v229 fix] 안쪽 fill 제거 (페인트 칠해짐 버그). 외곽선만 표시.
      return `<div class="pe-sel-marker" data-pin-id="${p.id}" style="position:absolute;left:${px - r}px;top:${py - r}px;width:${2*r}px;height:${2*r}px;border-radius:50%;border:2px ${isActive ? 'solid' : 'dashed'} ${isActive ? '#F18091' : 'rgba(255,255,255,0.95)'};box-shadow:0 0 0 2px rgba(0,0,0,0.35);pointer-events:auto;cursor:move;background:transparent;">
        <div style="position:absolute;left:50%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:${isActive ? '#F18091' : '#fff'};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>
        ${isActive ? `<button type="button" data-pin-remove="${p.id}" style="position:absolute;right:-6px;top:-6px;width:22px;height:22px;border-radius:50%;border:none;background:#fff;color:#F18091;font-weight:800;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.35);font-size:12px;">✕</button>` : ''}
      </div>`;
    }).join('');
    // polygon 핀 SVG overlay
    let polygonHTML = '';
    if (polygonPins.length > 0) {
      const src = _stateRef && _stateRef.originalImg;
      const srcW = (src && src.naturalWidth) || W;
      const srcH = (src && src.naturalHeight) || H;
      const polysvg = polygonPins.map(p => {
        const isActive = p.id === sel.activeId;
        const pts = p.polygon.map(pt => `${(pt.x / srcW) * W},${(pt.y / srcH) * H}`).join(' ');
        const stroke = isActive ? '#F18091' : 'rgba(255,255,255,0.95)';
        const sw = isActive ? 3 : 2;
        // [v229 fix] fill 제거 (페인트 칠해짐 버그). 외곽선만 표시.
        return `<polygon points="${pts}" data-pin-id="${p.id}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-dasharray="${isActive ? '0' : '6,4'}" style="pointer-events:auto;cursor:pointer;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5));" />`;
      }).join('');
      polygonHTML = `<svg style="position:absolute;left:${offX}px;top:${offY}px;width:${W}px;height:${H}px;pointer-events:none;" viewBox="0 0 ${W} ${H}">${polysvg}</svg>`;
    }
    c.innerHTML = polygonHTML + radialHTML;
    _bindMarkers(c, shorter);
    // polygon 클릭 핸들러 (svg 안 polygon 은 별도 바인딩)
    c.querySelectorAll('polygon[data-pin-id]').forEach(poly => {
      const id = poly.dataset.pinId;
      poly.style.pointerEvents = 'auto';
      poly.addEventListener('click', () => {
        const sel2 = _ensureState(_stateRef);
        sel2.activeId = id;
        _refreshMarkers();
        if (_helpersRef && _helpersRef.renderPanel) _helpersRef.renderPanel();
      });
    });
  }

  function _bindMarkers(container, shorter) {
    container.querySelectorAll('[data-pin-id]').forEach(el => {
      const id = el.dataset.pinId;
      el.addEventListener('pointerdown', (e) => {
        if (e.target.dataset.pinRemove) return; // X 버튼은 별도
        e.stopPropagation();
        const sel = _ensureState(_stateRef);
        sel.activeId = id;
        _draggingPin = { id, startX: e.clientX, startY: e.clientY };
        try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        _refreshMarkers();
        if (_helpersRef && _helpersRef.renderPanel) _helpersRef.renderPanel();
      });
      el.addEventListener('pointermove', (e) => {
        if (!_draggingPin || _draggingPin.id !== id) return;
        const sel = _ensureState(_stateRef);
        const p = sel.pins.find(pp => pp.id === id);
        if (!p) return;
        const cv = document.getElementById('peCanvas');
        if (!cv) return;
        const rect = cv.getBoundingClientRect();
        // 절대 좌표로 이동
        const ax = (e.clientX - rect.left) / rect.width;
        const ay = (e.clientY - rect.top) / rect.height;
        p.x = Math.max(0, Math.min(1, ax));
        p.y = Math.max(0, Math.min(1, ay));
        _refreshMarkers();
        if (_helpersRef && _helpersRef.scheduleRedraw) _helpersRef.scheduleRedraw();
      });
      el.addEventListener('pointerup', () => { _draggingPin = null; if (_helpersRef && _helpersRef.pushHistory) _helpersRef.pushHistory(); });
      el.addEventListener('pointercancel', () => { _draggingPin = null; });
    });
    container.querySelectorAll('[data-pin-remove]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.pinRemove;
        _removePin(_stateRef, id);
        _refreshMarkers();
        if (_helpersRef && _helpersRef.renderPanel) _helpersRef.renderPanel();
        if (_helpersRef && _helpersRef.redraw) _helpersRef.redraw();
      });
    });
  }

  // 캔버스 더블탭 = 새 핀 추가
  function _bindCanvasDoubleTap() {
    const cv = document.getElementById('peCanvas');
    if (!cv || cv._selectiveBound) return;
    cv._selectiveBound = true;
    cv.addEventListener('pointerdown', (e) => {
      const sel = _ensureState(_stateRef);
      if (!sel.enabled) return;
      const now = Date.now();
      if (now - _lastDoubleTap < 350) {
        // 더블탭 — 새 핀
        if (sel.pins.length >= MAX_PINS) {
          if (_helpersRef && _helpersRef.toast) _helpersRef.toast('핀은 최대 ' + MAX_PINS + '개까지 추가할 수 있어요');
          _lastDoubleTap = 0;
          return;
        }
        const rect = cv.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        _addPin(_stateRef, x, y);
        _refreshMarkers();
        if (_helpersRef && _helpersRef.renderPanel) _helpersRef.renderPanel();
        if (_helpersRef && _helpersRef.redraw) _helpersRef.redraw();
        _lastDoubleTap = 0;
      } else {
        _lastDoubleTap = now;
      }
    });
  }

  // ── 패널 HTML/Bind (registerTabPanel API) ──
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

  function _panelHTML(state) {
    const sel = _ensureState(state);
    const active = _getActive(state);
    const slider = (key, label, min, max, val) => `
      <label class="pe-field">
        <span>${_esc(label)} (${val})</span>
        <input type="range" class="pe-input" data-sel-slider="${key}" min="${min}" max="${max}" step="1" value="${val}" ${active ? '' : 'disabled'}>
      </label>`;
    const radiusSlider = (active && active.type !== 'polygon') ? `
      <label class="pe-field">
        <span>영역 크기 (${Math.round((active.radius || 0) * 100)}%)</span>
        <input type="range" class="pe-input" data-sel-slider="radius" min="5" max="60" step="1" value="${Math.round((active.radius || 0) * 100)}">
      </label>` : '';
    const sliders = active ? `
      ${slider('exposure',   '노출 (밝기)', -100, 100, active.exposure)}
      ${slider('contrast',   '대비',         -100, 100, active.contrast)}
      ${slider('saturation', '채도',         -100, 100, active.saturation)}
      ${slider('structure',  '구조 (선명)',  0,   100, active.structure)}
      ${radiusSlider}` : `<div class="pe-hint">아래 "AI 자동 영역" 버튼을 누르거나 사진을 더블탭하세요. 그 영역만 보정됩니다.</div>`;
    const FaceMask = window.PhotoEditorFaceMask;
    const faceHTML = (FaceMask && typeof FaceMask.subSectionHTML === 'function') ? FaceMask.subSectionHTML(state) : '';
    const pinChip = (p) => {
      const isAct = p.id === sel.activeId;
      const icon = p.type === 'polygon'
        ? '<svg class="pe-ic" viewBox="0 0 24 24"><use href="#ic-wand-sparkles"/></svg>'
        : '<svg class="pe-ic" viewBox="0 0 24 24"><use href="#ic-pin"/></svg>';
      const label = p.type === 'polygon' ? (p.regionLabel || 'AI') : ((sel.pins.filter(x => x.type !== 'polygon').indexOf(p) + 1) + '번');
      return `<button type="button" class="pe-chip-btn ${isAct ? 'on' : ''}" data-sel-pin="${p.id}">${icon} ${_esc(label)}</button>`;
    };
    return `<div class="pe-field-label">셀렉티브 부분 보정 (최대 ${MAX_PINS}개)</div>
      <div class="pe-panel-row" style="display:flex;gap:6px;flex-wrap:wrap;">${sel.pins.map(pinChip).join('')}<button type="button" class="pe-chip-btn" data-sel-add>+ 수동 핀</button></div>
      ${sliders}
      ${faceHTML}`;
  }

  function _bindPanel(panel, state, helpers) {
    _stateRef = state;
    _helpersRef = helpers;
    _wrapRef = document.querySelector('.pe-canvas-wrap');
    const sel = _ensureState(state);
    sel.enabled = true;  // selective 탭 진입 시 활성
    _bindCanvasDoubleTap();
    _refreshMarkers();

    panel.querySelectorAll('[data-sel-pin]').forEach(btn => {
      btn.addEventListener('click', () => {
        sel.activeId = btn.dataset.selPin;
        _refreshMarkers();
        helpers.renderPanel();
      });
    });
    const addBtn = panel.querySelector('[data-sel-add]');
    if (addBtn) addBtn.addEventListener('click', () => {
      if (sel.pins.length >= MAX_PINS) {
        if (helpers.toast) helpers.toast('핀은 최대 ' + MAX_PINS + '개까지');
        return;
      }
      _addPin(state, 0.5, 0.5);
      _refreshMarkers();
      helpers.renderPanel(); helpers.redraw();
    });
    // face-mask sub-section bind (AI 자동 영역 버튼 핸들러)
    if (window.PhotoEditorFaceMask && typeof window.PhotoEditorFaceMask.bindSubSection === 'function') {
      try { window.PhotoEditorFaceMask.bindSubSection(panel, state, helpers); } catch (_e) { /* ignore */ }
    }
    panel.querySelectorAll('[data-sel-slider]').forEach(input => {
      input.addEventListener('input', () => {
        const active = _getActive(state);
        if (!active) return;
        const key = input.dataset.selSlider;
        const v = parseFloat(input.value);
        if (key === 'radius') active.radius = v / 100;
        else active[key] = v;
        // 핀 마커 크기 갱신
        if (key === 'radius') _refreshMarkers();
        helpers.scheduleRedraw();
        const label = input.parentElement.querySelector('span');
        if (label) {
          const text = label.textContent;
          // "노출 (0)" 형식 갱신
          const newText = text.replace(/\([^)]+\)$/, '(' + (key === 'radius' ? Math.round(v) + '%' : v) + ')');
          label.textContent = newText;
        }
      });
      input.addEventListener('change', () => { if (helpers.pushHistory) helpers.pushHistory(); });
    });
  }

  // selective 탭 비활성 (다른 탭 전환 시) 호출용
  function _onLeave(state) {
    const sel = _ensureState(state);
    sel.enabled = false;
    if (_markerContainer && _markerContainer.parentNode) _markerContainer.parentNode.removeChild(_markerContainer);
    _markerContainer = null;
  }

  // PhotoEditor 의 TABS 에 'selective' 가 있어야 진입 가능 — registerTabPanel 으로 등록
  function _register() {
    const PE = window.PhotoEditor;
    if (!PE || !PE._internal || !PE._internal.registerTabPanel) return false;
    PE._internal.registerTabPanel('selective', { html: _panelHTML, bind: _bindPanel });
    return true;
  }

  if (!_register()) {
    let tries = 0;
    const iv = setInterval(() => { if (_register() || ++tries > 60) clearInterval(iv); }, 100);
  }

  window.PhotoEditorSelective = {
    addPin: _addPin,
    removePin: _removePin,
    getActive: _getActive,
    onLeave: _onLeave,
    refreshMarkers: _refreshMarkers,
    MAX_PINS,
  };
})();
