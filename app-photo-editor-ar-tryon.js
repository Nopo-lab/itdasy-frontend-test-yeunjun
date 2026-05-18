/* 사진 편집기 — AI 가상 시술 시뮬레이션 (PE-6, 2026-05-19 v217)
   초고도화 Phase 2 #1 — YouCam Makeup AR 대체.

   기능:
     • 헤어 컬러 6종 — 이마 위쪽 영역 hue/saturate 변경
     • 입술 컬러 6종 — 입술 영역 색조 변경
     • 속눈썹 진한 정도 4종 — 눈 위 라인 강화
     • 네일 컬러 6종 — 사용자가 손톱 영역 사각 박스 지정 (얼굴 검출 안되는 손 사진 대응)
     • 시술 전/후 비교 토글 (원본 ↔ AR)
     • 상담용 export — PNG 저장

   진입: PhotoEditor 의 별도 탭 "AR 가상 시술"
*/
(function () {
  'use strict';
  if (window.PhotoEditorARTryOn) return;

  const HAIR_COLORS = [
    { id: 'natural-brown', label: '내추럴 브라운', tint: '#5b3924', alpha: 0.45 },
    { id: 'ash-gray',      label: '애쉬 그레이',  tint: '#7a7872', alpha: 0.50 },
    { id: 'wine-burgundy', label: '와인 버건디',  tint: '#5b1f33', alpha: 0.55 },
    { id: 'honey-blonde',  label: '허니 블론드',  tint: '#c89a52', alpha: 0.45 },
    { id: 'rose-pink',     label: '로즈 핑크',    tint: '#c87c8a', alpha: 0.50 },
    { id: 'navy-blue',     label: '네이비 블루',  tint: '#22324d', alpha: 0.55 },
  ];
  const LIP_COLORS = [
    { id: 'coral',     label: '코랄',     tint: '#e87560', alpha: 0.55 },
    { id: 'mlbb',      label: '미디엄 누드', tint: '#b46060', alpha: 0.50 },
    { id: 'rosy-red',  label: '로지 레드', tint: '#c0394d', alpha: 0.60 },
    { id: 'mauve',     label: '모브',     tint: '#9c5b6e', alpha: 0.55 },
    { id: 'deep-plum', label: '딥 플럼',  tint: '#6e2c44', alpha: 0.65 },
    { id: 'peach',     label: '피치',     tint: '#e69985', alpha: 0.50 },
  ];
  const LASH_LEVELS = [
    { id: 'natural',   label: '자연스럽게', alpha: 0.25 },
    { id: 'soft',      label: '소프트',    alpha: 0.40 },
    { id: 'volume',    label: '볼륨',      alpha: 0.55 },
    { id: 'glamorous', label: '글래머',    alpha: 0.75 },
  ];
  const NAIL_COLORS = [
    { id: 'milky',     label: '밀키 화이트', tint: '#f3eee4', alpha: 0.70 },
    { id: 'coral-nail', label: '코랄',      tint: '#ee7e63', alpha: 0.75 },
    { id: 'red-nail',  label: '레드',       tint: '#c1283b', alpha: 0.80 },
    { id: 'nude',      label: '누드',       tint: '#d3a98e', alpha: 0.70 },
    { id: 'glitter',   label: '글리터 골드', tint: '#d8b048', alpha: 0.65 },
    { id: 'navy-nail', label: '네이비',     tint: '#28354d', alpha: 0.80 },
  ];

  let _state = {
    enabled: false,
    hair: null,
    lip: null,
    lash: null,
    nail: null,
    nailBoxes: [],   // 사용자가 지정한 [{x, y, w, h}] (캔버스 비율)
    showOriginal: false,
  };
  let _sheetEl = null;
  let _previewCanvas = null;
  let _landmarksCache = null;

  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  function _ensureSheet() {
    if (_sheetEl) return _sheetEl;
    _sheetEl = document.createElement('div');
    _sheetEl.id = 'arTryOnSheet';
    _sheetEl.className = 'pe-sheet';
    _sheetEl.style.cssText = 'position:fixed;inset:0;background:#0e0f12;z-index:9999;display:none;flex-direction:column;color:#fff;';
    _sheetEl.innerHTML = `
      <header style="padding:14px 16px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #222;">
        <button type="button" id="arClose" class="pe-action-btn" style="background:#222;color:#fff;">닫기</button>
        <div style="font-weight:700;flex:1;">AI 가상 시술 — 상담용 미리보기</div>
        <button type="button" id="arToggle" class="pe-action-btn" style="background:#333;color:#fff;">원본</button>
        <button type="button" id="arExport" class="pe-action-btn" style="background:#7b61ff;color:#fff;">PNG 저장</button>
      </header>
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#000;overflow:hidden;">
        <canvas id="arCanvas" style="max-width:100%;max-height:60vh;background:#222;"></canvas>
        <div id="arNailHint" style="font-size:12px;color:#aaa;margin-top:8px;display:none;">사진 위에서 손톱이 있는 위치를 드래그해 칠해주세요</div>
      </div>
      <div id="arPanel" style="padding:12px 16px 24px;background:#1a1b1f;overflow-y:auto;max-height:42vh;"></div>
    `;
    document.body.appendChild(_sheetEl);
    _previewCanvas = _sheetEl.querySelector('#arCanvas');
    _sheetEl.querySelector('#arClose').addEventListener('click', _close);
    _sheetEl.querySelector('#arExport').addEventListener('click', _export);
    _sheetEl.querySelector('#arToggle').addEventListener('click', () => {
      _state.showOriginal = !_state.showOriginal;
      _renderPreview();
      _sheetEl.querySelector('#arToggle').textContent = _state.showOriginal ? '편집본' : '원본';
    });
    _bindNailPainter();
    return _sheetEl;
  }

  function _bindNailPainter() {
    if (!_previewCanvas) return;
    let drawing = false;
    let start = null;
    _previewCanvas.addEventListener('pointerdown', (e) => {
      if (!_state.nail) return;
      drawing = true;
      const rect = _previewCanvas.getBoundingClientRect();
      start = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
    });
    _previewCanvas.addEventListener('pointermove', (e) => {
      if (!drawing || !start) return;
      const rect = _previewCanvas.getBoundingClientRect();
      const cur = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
      _state._tempBox = {
        x: Math.min(start.x, cur.x), y: Math.min(start.y, cur.y),
        w: Math.abs(cur.x - start.x), h: Math.abs(cur.y - start.y),
      };
      _renderPreview();
    });
    _previewCanvas.addEventListener('pointerup', () => {
      if (drawing && _state._tempBox && _state._tempBox.w > 0.005 && _state._tempBox.h > 0.005) {
        _state.nailBoxes.push(_state._tempBox);
      }
      drawing = false;
      start = null;
      _state._tempBox = null;
      _renderPreview();
    });
  }

  function _renderPanel() {
    const panel = _sheetEl.querySelector('#arPanel');
    const chip = (list, current, prefix) => list.map(it => `
      <button type="button" class="pe-chip-btn ${current === it.id ? 'on' : ''}" data-ar-${prefix}="${it.id}">${_esc(it.label)}</button>
    `).join('');
    panel.innerHTML = `
      <div class="pe-field-label">헤어 컬러</div>
      <div class="pe-panel-row" style="display:flex;flex-wrap:wrap;gap:6px;">${chip(HAIR_COLORS, _state.hair, 'hair')}<button type="button" class="pe-chip-btn ${!_state.hair?'on':''}" data-ar-hair="">없음</button></div>
      <div class="pe-field-label" style="margin-top:14px;">입술 컬러</div>
      <div class="pe-panel-row" style="display:flex;flex-wrap:wrap;gap:6px;">${chip(LIP_COLORS, _state.lip, 'lip')}<button type="button" class="pe-chip-btn ${!_state.lip?'on':''}" data-ar-lip="">없음</button></div>
      <div class="pe-field-label" style="margin-top:14px;">속눈썹</div>
      <div class="pe-panel-row" style="display:flex;flex-wrap:wrap;gap:6px;">${chip(LASH_LEVELS, _state.lash, 'lash')}<button type="button" class="pe-chip-btn ${!_state.lash?'on':''}" data-ar-lash="">없음</button></div>
      <div class="pe-field-label" style="margin-top:14px;">네일 컬러 <span style="font-weight:400;color:#999;font-size:11px;">(사진 위 손톱 위치 드래그)</span></div>
      <div class="pe-panel-row" style="display:flex;flex-wrap:wrap;gap:6px;">${chip(NAIL_COLORS, _state.nail, 'nail')}<button type="button" class="pe-chip-btn ${!_state.nail?'on':''}" data-ar-nail="">없음</button></div>
      <div class="pe-panel-row" style="margin-top:8px;display:flex;gap:8px;">
        <button type="button" class="pe-action-btn" id="arClearNail" style="background:#333;color:#fff;">네일 영역 초기화</button>
        <span style="color:#aaa;font-size:12px;align-self:center;">${_state.nailBoxes.length}개 칠함</span>
      </div>
    `;
    panel.querySelectorAll('[data-ar-hair]').forEach(b => b.addEventListener('click', () => { _state.hair = b.dataset.arHair || null; _renderPanel(); _renderPreview(); }));
    panel.querySelectorAll('[data-ar-lip]').forEach(b => b.addEventListener('click', () => { _state.lip = b.dataset.arLip || null; _renderPanel(); _renderPreview(); }));
    panel.querySelectorAll('[data-ar-lash]').forEach(b => b.addEventListener('click', () => { _state.lash = b.dataset.arLash || null; _renderPanel(); _renderPreview(); }));
    panel.querySelectorAll('[data-ar-nail]').forEach(b => b.addEventListener('click', () => {
      _state.nail = b.dataset.arNail || null;
      _sheetEl.querySelector('#arNailHint').style.display = _state.nail ? 'block' : 'none';
      _renderPanel(); _renderPreview();
    }));
    panel.querySelector('#arClearNail').addEventListener('click', () => { _state.nailBoxes = []; _renderPreview(); _renderPanel(); });
  }

  async function _open(sourceImage) {
    _ensureSheet();
    _state = { enabled: true, hair: null, lip: null, lash: null, nail: null, nailBoxes: [], showOriginal: false };
    _landmarksCache = null;
    _sheetEl._source = sourceImage;
    _sheetEl.style.display = 'flex';
    const w = sourceImage.naturalWidth || sourceImage.width || 800;
    const h = sourceImage.naturalHeight || sourceImage.height || 800;
    _previewCanvas.width = w;
    _previewCanvas.height = h;
    _renderPanel();
    _renderPreview();
    // Face Mesh 비동기 검출
    if (window.MediaPipeLoader) {
      try {
        _landmarksCache = await window.MediaPipeLoader.detect(sourceImage);
        _renderPreview();
      } catch (_e) { /* ignore */ }
    }
  }

  function _close() {
    if (_sheetEl) _sheetEl.style.display = 'none';
  }

  function _renderPreview() {
    if (!_previewCanvas || !_sheetEl._source) return;
    const ctx = _previewCanvas.getContext('2d');
    const src = _sheetEl._source;
    ctx.clearRect(0, 0, _previewCanvas.width, _previewCanvas.height);
    ctx.drawImage(src, 0, 0, _previewCanvas.width, _previewCanvas.height);
    if (_state.showOriginal) return;
    _drawHair(ctx);
    _drawLip(ctx);
    _drawLash(ctx);
    _drawNail(ctx);
    // 임시 박스
    if (_state._tempBox && _state.nail) {
      const c = NAIL_COLORS.find(n => n.id === _state.nail);
      if (c) _fillBox(ctx, _state._tempBox, c.tint, c.alpha * 0.5);
    }
  }

  function _drawHair(ctx) {
    if (!_state.hair) return;
    const c = HAIR_COLORS.find(h => h.id === _state.hair);
    if (!c) return;
    const ML = window.MediaPipeLoader;
    ctx.save();
    if (_landmarksCache && ML) {
      const ovalPoly = ML.regionPolygon(_landmarksCache, 'foreheadTop');
      if (ovalPoly) {
        // 얼굴 위쪽 영역을 헤어로 가정
        const minY = Math.min(...ovalPoly.map(p => p.y));
        ctx.beginPath();
        ctx.rect(0, 0, _previewCanvas.width, minY + 20);
        ctx.fillStyle = c.tint;
        ctx.globalAlpha = c.alpha;
        ctx.globalCompositeOperation = 'soft-light';
        ctx.fill();
      }
    } else {
      ctx.beginPath();
      ctx.rect(0, 0, _previewCanvas.width, _previewCanvas.height * 0.28);
      ctx.fillStyle = c.tint;
      ctx.globalAlpha = c.alpha;
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fill();
    }
    ctx.restore();
  }

  function _drawLip(ctx) {
    if (!_state.lip) return;
    const c = LIP_COLORS.find(l => l.id === _state.lip);
    if (!c) return;
    const ML = window.MediaPipeLoader;
    if (_landmarksCache && ML) {
      const lipsPoly = ML.regionPolygon(_landmarksCache, 'lips');
      if (lipsPoly) {
        ctx.save();
        ML.pathPolygon(ctx, lipsPoly);
        ctx.fillStyle = c.tint;
        ctx.globalAlpha = c.alpha;
        ctx.globalCompositeOperation = 'multiply';
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function _drawLash(ctx) {
    if (!_state.lash) return;
    const level = LASH_LEVELS.find(l => l.id === _state.lash);
    if (!level) return;
    const ML = window.MediaPipeLoader;
    if (_landmarksCache && ML) {
      ['leftEye', 'rightEye'].forEach(name => {
        const poly = ML.regionPolygon(_landmarksCache, name);
        if (!poly) return;
        ctx.save();
        ML.pathPolygon(ctx, poly);
        ctx.fillStyle = '#0a0612';
        ctx.globalAlpha = level.alpha;
        ctx.globalCompositeOperation = 'multiply';
        ctx.fill();
        ctx.restore();
      });
    }
  }

  function _drawNail(ctx) {
    if (!_state.nail || !_state.nailBoxes.length) return;
    const c = NAIL_COLORS.find(n => n.id === _state.nail);
    if (!c) return;
    _state.nailBoxes.forEach(box => _fillBox(ctx, box, c.tint, c.alpha));
  }

  function _fillBox(ctx, box, tint, alpha) {
    ctx.save();
    ctx.fillStyle = tint;
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'multiply';
    ctx.beginPath();
    const x = box.x * _previewCanvas.width;
    const y = box.y * _previewCanvas.height;
    const w = box.w * _previewCanvas.width;
    const h = box.h * _previewCanvas.height;
    // 둥근 사각
    const r = Math.min(w, h) * 0.3;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function _export() {
    if (!_previewCanvas) return;
    const url = _previewCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'itdasy-ar-tryon-' + Date.now() + '.png';
    a.click();
    if (window.toast) window.toast('AR 시뮬레이션 저장 완료');
  }

  // 외부 진입 (PhotoEditor 의 별도 메뉴에서 호출)
  window.PhotoEditorARTryOn = {
    open: _open,
    close: _close,
    HAIR_COLORS, LIP_COLORS, LASH_LEVELS, NAIL_COLORS,
  };

  // MutationObserver — 뷰티 탭 활성일 때마다 AR 버튼 주입
  function _inject(panel) {
    if (!panel || panel.querySelector('[data-pe-ar]')) return;
    const PE = window.PhotoEditor;
    const state = PE && PE._internal && PE._internal.getState();
    if (!state || state.activeTab !== 'beauty') return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pe-action-btn';
    btn.dataset.peAr = '1';
    btn.style.cssText = 'margin-top:12px;background:linear-gradient(135deg,#c87c8a,#7b61ff);color:#fff;font-weight:600;width:100%;';
    btn.textContent = '✨ AR 가상 시술 — 컬러 미리보기 (상담용)';
    btn.addEventListener('click', () => {
      const cur = PE && PE._internal && PE._internal.getState();
      if (cur && cur.originalImg) _open(cur.originalImg);
      else if (window.showToast) window.showToast('사진을 먼저 불러오세요');
    });
    panel.appendChild(btn);
  }

  function _watchPanel() {
    const sheet = document.getElementById('photoEditorSheet');
    const panel = sheet && sheet.querySelector('#pePanel');
    if (!panel) {
      setTimeout(_watchPanel, 800);
      return;
    }
    _inject(panel);
    new MutationObserver(() => _inject(panel)).observe(panel, { childList: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _watchPanel);
  } else _watchPanel();
})();
