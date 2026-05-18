/* 사진 편집기 — Before/After 인터랙티브 슬라이더 (PE-2, 2026-05-19)
   초고도화 Phase 1 첫 번째 킬러 피처.

   기능:
     • 전/후 사진을 하나의 캔버스에 겹치고, 드래그 가능한 구분선으로 비교
     • 수직(좌우) / 수평(상하) 모드 전환
     • 터치 & 마우스 드래그 지원
     • 라벨 커스터마이징 (BEFORE/AFTER 또는 전/후)
     • 구분선 스타일 3종 (라인/그라데이션/없음)
     • PNG/JPG export — 현재 슬라이더 위치 그대로 저장
     • 인스타 미리보기 연동

   등록: PhotoEditor._internal.registerTabPanel('ba', ...)
   TABS 에 ba 탭이 없으면 동적으로 추가.
*/
(function () {
  'use strict';

  // ── 상태 ──
  let _baState = {
    enabled: false,
    secondImg: null,
    secondSrc: '',
    position: 0.5,        // 0~1, 슬라이더 위치
    mode: 'vertical',     // vertical(좌우) | horizontal(상하)
    dividerStyle: 'line', // line | gradient | none
    leftLabel: 'BEFORE',
    rightLabel: 'AFTER',
    labelVisible: true,
    animating: false,
  };

  let _dragging = false;
  let _overlayEl = null;

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  // ── 패널 HTML ──
  function _panelHTML(state) {
    const ba = _baState;
    const modeBtn = (m, label) =>
      `<button type="button" class="pe-chip-btn${ba.mode===m?' on':''}" data-ba-mode="${m}">${label}</button>`;
    const styleBtn = (s, label) =>
      `<button type="button" class="pe-chip-btn${ba.dividerStyle===s?' on':''}" data-ba-style="${s}">${label}</button>`;

    return `
      <div class="pe-field-label">Before / After 비교</div>
      <div class="pe-panel-row">
        <button type="button" class="pe-action-btn" data-ba-pick>📷 비교할 사진 고르기 (${ba.secondImg ? '선택됨 ✓' : '미선택'})</button>
      </div>
      <input type="file" id="baPicker" accept="image/*" style="display:none" />

      <div class="pe-field-label" style="margin-top:12px;">비교 방향</div>
      <div class="pe-panel-row pe-panel-grid-2">
        ${modeBtn('vertical','⇋ 좌우 비교')}
        ${modeBtn('horizontal','⇵ 상하 비교')}
      </div>

      <div class="pe-field-label" style="margin-top:10px;">구분선 스타일</div>
      <div class="pe-panel-row pe-panel-grid-3" style="display:flex;gap:6px;">
        ${styleBtn('line','라인')}
        ${styleBtn('gradient','그라데이션')}
        ${styleBtn('none','없음')}
      </div>

      <label class="pe-field" style="margin-top:10px;">
        <span>왼쪽/위 라벨</span>
        <input type="text" class="pe-input" data-ba-left value="${_esc(ba.leftLabel)}" maxlength="12" />
      </label>
      <label class="pe-field">
        <span>오른쪽/아래 라벨</span>
        <input type="text" class="pe-input" data-ba-right value="${_esc(ba.rightLabel)}" maxlength="12" />
      </label>

      <div class="pe-panel-row pe-panel-grid-2" style="margin-top:8px;">
        <button type="button" class="pe-chip-btn${ba.labelVisible?' on':''}" data-ba-label-toggle>
          라벨 ${ba.labelVisible ? '숨기기' : '보이기'}
        </button>
        <button type="button" class="pe-chip-btn" data-ba-animate>✨ 슬라이드 애니메이션</button>
      </div>

      <label class="pe-slider" style="margin-top:10px;">
        <div class="pe-slider-head">
          <span>슬라이더 위치</span>
          <span class="pe-slider-val">${Math.round(ba.position * 100)}%</span>
        </div>
        <input type="range" min="0" max="100" value="${Math.round(ba.position * 100)}" data-ba-pos />
      </label>

      <div class="pe-panel-row" style="margin-top:10px;">
        <button type="button" class="pe-action-btn" data-ba-export>💾 현재 비교 화면 저장</button>
      </div>

      <div class="pe-hint">
        캔버스 위에서 직접 드래그해도 슬라이더가 움직여요. 터치·마우스 모두 지원.
        ${!ba.secondImg ? '<br><strong>비교할 사진을 먼저 골라주세요.</strong>' : ''}
      </div>`;
  }

  // ── 패널 바인딩 ──
  function _bindPanel(panel, state, helpers) {
    const { redraw, pushHistory, toast, renderPanel } = helpers;

    // 사진 고르기
    panel.querySelector('[data-ba-pick]')?.addEventListener('click', () => {
      panel.querySelector('#baPicker')?.click();
    });
    panel.querySelector('#baPicker')?.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        _baState.secondImg = img;
        _baState.secondSrc = URL.createObjectURL(f);
        _baState.enabled = true;
        renderPanel(); redraw(); pushHistory();
        toast('비교 사진 선택 완료');
      };
      img.onerror = () => toast('사진 로드 실패');
      img.src = URL.createObjectURL(f);
    });

    // 모드 전환
    panel.querySelectorAll('[data-ba-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        _baState.mode = btn.dataset.baMode;
        renderPanel(); redraw();
      });
    });

    // 구분선 스타일
    panel.querySelectorAll('[data-ba-style]').forEach(btn => {
      btn.addEventListener('click', () => {
        _baState.dividerStyle = btn.dataset.baStyle;
        renderPanel(); redraw();
      });
    });

    // 라벨 입력
    panel.querySelector('[data-ba-left]')?.addEventListener('input', (e) => {
      _baState.leftLabel = e.target.value; redraw();
    });
    panel.querySelector('[data-ba-right]')?.addEventListener('input', (e) => {
      _baState.rightLabel = e.target.value; redraw();
    });

    // 라벨 토글
    panel.querySelector('[data-ba-label-toggle]')?.addEventListener('click', () => {
      _baState.labelVisible = !_baState.labelVisible;
      renderPanel(); redraw();
    });

    // 슬라이더 위치
    panel.querySelector('[data-ba-pos]')?.addEventListener('input', (e) => {
      _baState.position = +e.target.value / 100;
      redraw();
    });

    // 애니메이션
    panel.querySelector('[data-ba-animate]')?.addEventListener('click', () => {
      _animateSlider(redraw);
    });

    // 저장
    panel.querySelector('[data-ba-export]')?.addEventListener('click', () => {
      _exportBA(state, helpers);
    });

    // 캔버스 드래그 이벤트 연결
    _attachCanvasDrag(helpers);
  }

  // ── 캔버스 드래그 ──
  function _attachCanvasDrag(helpers) {
    const cv = document.getElementById('peCanvas');
    if (!cv || cv._baDragBound) return;
    cv._baDragBound = true;

    const getPos = (e, rect) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      if (_baState.mode === 'vertical') {
        return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      }
      return Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    };

    const onStart = (e) => {
      if (!_baState.enabled || !_baState.secondImg) return;
      // ba 탭일 때만 드래그 활성화
      const editorState = window.PhotoEditor?._internal?.getState?.();
      if (!editorState || editorState.activeTab !== 'ba') return;
      _dragging = true;
      const rect = cv.getBoundingClientRect();
      _baState.position = getPos(e, rect);
      helpers.redraw();
    };
    const onMove = (e) => {
      if (!_dragging) return;
      e.preventDefault();
      const rect = cv.getBoundingClientRect();
      _baState.position = getPos(e, rect);
      helpers.redraw();
    };
    const onEnd = () => { _dragging = false; };

    cv.addEventListener('mousedown', onStart);
    cv.addEventListener('mousemove', onMove);
    cv.addEventListener('mouseup', onEnd);
    cv.addEventListener('mouseleave', onEnd);
    cv.addEventListener('touchstart', onStart, { passive: true });
    cv.addEventListener('touchmove', onMove, { passive: false });
    cv.addEventListener('touchend', onEnd);
  }

  // ── 슬라이드 애니메이션 ──
  function _animateSlider(redraw) {
    if (_baState.animating) return;
    _baState.animating = true;
    const start = _baState.position;
    const dur = 1200;
    const t0 = performance.now();

    function frame(now) {
      const elapsed = now - t0;
      const t = Math.min(1, elapsed / dur);
      // ease-in-out: 0→1→0 (왕복)
      const phase = t < 0.5 ? t * 2 : (1 - t) * 2;
      _baState.position = start + (1 - start) * phase * (t < 0.5 ? 1 : -1);
      _baState.position = Math.max(0.02, Math.min(0.98, _baState.position));
      redraw();
      if (t < 1) requestAnimationFrame(frame);
      else { _baState.position = start; _baState.animating = false; redraw(); }
    }
    requestAnimationFrame(frame);
  }

  // ── 캔버스 합성 (drawHook) ──
  function _drawBA(ctx, dw, dh, _beautyState, helpers) {
    // 이 훅은 beauty 와 다른 방식으로 호출 — 아래 _redrawOverride 에서 직접 사용
  }

  // BA 모드 활성화 시 _redraw 를 오버라이드하는 대신, template drawHook 패턴 활용
  function _drawBAComposite(cv, img, state, helpers) {
    if (!_baState.enabled || !_baState.secondImg || !img) return;

    const W = Math.min(1080, img.naturalWidth || img.width);
    const ratio = W / (img.naturalWidth || img.width);
    const H = Math.round((img.naturalHeight || img.height) * ratio);

    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    const pos = _baState.position;
    const isV = _baState.mode === 'vertical';

    // 원본 (BEFORE) — 전체 그리기
    ctx.drawImage(_baState.secondImg, 0, 0, W, H);

    // 편집본 (AFTER) — 클리핑
    ctx.save();
    ctx.beginPath();
    if (isV) {
      ctx.rect(Math.round(W * pos), 0, W, H);
    } else {
      ctx.rect(0, Math.round(H * pos), W, H);
    }
    ctx.clip();

    // 편집 필터 적용 (tune/beauty 등)
    const a = state.adjust || {};
    const temp = a.temperature || 0;
    const sepia = Math.max(0, temp) / 100;
    const contrast = 100 + Math.max(0, -temp) * 0.3;
    ctx.filter = `brightness(${a.brightness||100}%) saturate(${a.saturate||100}%) contrast(${contrast}%) sepia(${sepia})`;
    ctx.drawImage(img, 0, 0, W, H);
    ctx.filter = 'none';

    // 뷰티 보정 적용
    if (helpers && typeof helpers.applyDrawHook === 'function') {
      try { helpers.applyDrawHook('beauty', ctx, W, H, state.beauty, helpers); } catch (_e) { void _e; }
    }
    ctx.restore();

    // ── 구분선 ──
    if (_baState.dividerStyle !== 'none') {
      ctx.save();
      const lineW = _baState.dividerStyle === 'gradient' ? 6 : 3;

      if (isV) {
        const x = Math.round(W * pos);
        if (_baState.dividerStyle === 'gradient') {
          const grad = ctx.createLinearGradient(x - 12, 0, x + 12, 0);
          grad.addColorStop(0, 'rgba(255,255,255,0)');
          grad.addColorStop(0.5, 'rgba(255,255,255,0.9)');
          grad.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = grad;
          ctx.fillRect(x - 12, 0, 24, H);
        } else {
          ctx.strokeStyle = 'rgba(255,255,255,0.95)';
          ctx.lineWidth = lineW;
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
          ctx.shadowBlur = 4;
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
        // 드래그 핸들 (원형)
        _drawHandle(ctx, x, H / 2, isV);
      } else {
        const y = Math.round(H * pos);
        if (_baState.dividerStyle === 'gradient') {
          const grad = ctx.createLinearGradient(0, y - 12, 0, y + 12);
          grad.addColorStop(0, 'rgba(255,255,255,0)');
          grad.addColorStop(0.5, 'rgba(255,255,255,0.9)');
          grad.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = grad;
          ctx.fillRect(0, y - 12, W, 24);
        } else {
          ctx.strokeStyle = 'rgba(255,255,255,0.95)';
          ctx.lineWidth = lineW;
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
          ctx.shadowBlur = 4;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }
        _drawHandle(ctx, W / 2, y, isV);
      }
      ctx.restore();
    }

    // ── 라벨 ──
    if (_baState.labelVisible) {
      _drawLabel(ctx, W, H, pos, isV);
    }

    // ── 워터마크 ──
    if (state.watermark && state.watermark.value && helpers && typeof helpers.drawWatermark === 'function') {
      helpers.drawWatermark(ctx, W, H, state.watermark);
    }
  }

  function _drawHandle(ctx, x, y, isVertical) {
    ctx.save();
    // 외부 원
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 8;
    ctx.fill();
    // 화살표
    ctx.fillStyle = '#333';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 0;
    ctx.fillText(isVertical ? '⇔' : '⇕', x, y);
    ctx.restore();
  }

  function _drawLabel(ctx, W, H, pos, isV) {
    ctx.save();
    const fs = Math.max(16, Math.round(W * 0.028));
    ctx.font = `800 ${fs}px Pretendard, "Noto Sans KR", sans-serif`;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 4;

    if (isV) {
      const splitX = Math.round(W * pos);
      // BEFORE (왼쪽)
      if (splitX > 60) {
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        _drawLabelPill(ctx, 20, 24, _baState.leftLabel, fs);
      }
      // AFTER (오른쪽)
      if (W - splitX > 60) {
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        _drawLabelPill(ctx, W - 20, 24, _baState.rightLabel, fs);
      }
    } else {
      const splitY = Math.round(H * pos);
      if (splitY > 40) {
        ctx.textAlign = 'left';
        _drawLabelPill(ctx, 20, 24, _baState.leftLabel, fs);
      }
      if (H - splitY > 40) {
        ctx.textAlign = 'left';
        _drawLabelPill(ctx, 20, H - 20, _baState.rightLabel, fs);
      }
    }
    ctx.restore();
  }

  function _drawLabelPill(ctx, x, y, text, fs) {
    const tw = ctx.measureText(text).width;
    const padX = Math.round(fs * 0.5);
    const padY = Math.round(fs * 0.3);
    const pillW = tw + padX * 2;
    const pillH = fs + padY * 2;
    const align = ctx.textAlign;
    const rx = align === 'right' ? x - pillW : x;

    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    _roundRect(ctx, rx, y - padY, pillW, pillH, 8);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'top';
    ctx.fillText(text, align === 'right' ? x - padX : x + padX, y);
  }

  function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ── Export ──
  function _exportBA(state, helpers) {
    const cv = document.getElementById('peCanvas');
    if (!cv) return helpers.toast('캔버스를 찾을 수 없어요');
    if (!_baState.secondImg) return helpers.toast('비교 사진을 먼저 골라주세요');

    cv.toBlob((blob) => {
      if (!blob) return helpers.toast('저장 실패');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'itdasy-ba-compare-' + Date.now() + '.png';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
      helpers.toast('Before/After 비교 이미지 저장 완료');

      // 인스타 미리보기 연동
      if (typeof window.openInstagramPreview === 'function') {
        try {
          const dataUrl = cv.toDataURL('image/png');
          setTimeout(() => {
            window.openInstagramPreview({ ratio: '4:5', src: dataUrl });
          }, 300);
        } catch (_e) { void _e; }
      }
    }, 'image/png', 0.95);
  }

  // ── 메인 모듈에 탭 동적 추가 + 등록 ──
  function _register() {
    if (!window.PhotoEditor || !window.PhotoEditor._internal) return false;
    const internal = window.PhotoEditor._internal;

    // 'ba' 탭을 TABS 에 동적 추가 — 'template' 앞에 삽입
    const tabsNav = document.getElementById('peTabs');
    if (tabsNav && !tabsNav.querySelector('[data-pe-tab="ba"]')) {
      const templateTab = tabsNav.querySelector('[data-pe-tab="template"]');
      const baBtn = document.createElement('button');
      baBtn.type = 'button';
      baBtn.className = 'pe-tab';
      baBtn.dataset.peTab = 'ba';
      baBtn.textContent = 'B/A 비교';
      if (templateTab) tabsNav.insertBefore(baBtn, templateTab);
      else tabsNav.appendChild(baBtn);

      // 탭 클릭 이벤트 — 기존 sheet 의 click delegate 가 data-pe-tab 처리
      // 추가 클릭 핸들러 불필요 (메인 모듈의 _bindSheet 에서 처리)
    }

    // 패널 등록
    internal.registerTabPanel('ba', { html: _panelHTML, bind: _bindPanel });

    // drawHook 등록 — 'ba' 탭 활성화 시에만 합성
    // template drawHook 패턴: _drawHooks['template'] → _redraw 에서 호출됨.
    // ba 는 template 과 동일 레벨에서 동작. activeTab === 'ba' 면 합성.
    // 단, 기존 drawHook 은 'beauty'와 'template' 만 지원. ba 용으로 우회.
    //
    // 방법: template drawHook 을 래핑하여 ba 탭일 때 ba 합성 수행
    const origTemplateHook = internal.getState && null; // 기존 template hook 보존

    // ba 전용 redraw 오버라이드 — _redraw 이벤트 리스닝
    window.addEventListener('itdasy:pe:redraw', () => {
      const state = internal.getState();
      if (!state || state.activeTab !== 'ba' || !_baState.enabled) return;
      const cv = document.getElementById('peCanvas');
      if (!cv || !state.originalImg) return;
      _drawBAComposite(cv, state.originalImg, state, internal.helpers);
    });

    // _redraw 에 훅 — 기존 _redraw 끝나면 ba 탭이면 덮어씀
    // 더 안전한 방법: 50ms 마다 체크하여 ba 탭 활성화 시 캔버스 다시 그림
    let _lastTab = null;
    const _checkInterval = setInterval(() => {
      try {
        const state = internal.getState();
        if (!state) return;
        if (state.activeTab === 'ba' && _baState.enabled && _baState.secondImg) {
          if (_lastTab !== 'ba') {
            // 탭 전환 직후 — 즉시 BA 합성
            const cv = document.getElementById('peCanvas');
            if (cv && state.originalImg) {
              _drawBAComposite(cv, state.originalImg, state, internal.helpers);
            }
          }
          _lastTab = 'ba';
        } else {
          _lastTab = state.activeTab;
        }
      } catch (_e) { void _e; }
    }, 100);

    // scheduleRedraw 를 래핑하여 ba 탭일 때 BA 합성 트리거
    const origSchedule = internal.helpers.scheduleRedraw;
    const origRedraw = internal.helpers.redraw;

    internal.helpers.redraw = function () {
      origRedraw();
      try {
        const state = internal.getState();
        if (state && state.activeTab === 'ba' && _baState.enabled && _baState.secondImg) {
          const cv = document.getElementById('peCanvas');
          if (cv && state.originalImg) {
            _drawBAComposite(cv, state.originalImg, state, internal.helpers);
          }
        }
      } catch (_e) { void _e; }
    };

    return true;
  }

  // 폴링 등록
  if (!_register()) {
    let tries = 0;
    const iv = setInterval(() => {
      if (_register() || ++tries > 50) clearInterval(iv);
    }, 100);
  }

  // 공개 API
  window.PhotoEditorBA = {
    getState: () => _baState,
    setSecondImage: (img) => { _baState.secondImg = img; _baState.enabled = true; },
    setPosition: (p) => { _baState.position = Math.max(0, Math.min(1, p)); },
  };
})();
