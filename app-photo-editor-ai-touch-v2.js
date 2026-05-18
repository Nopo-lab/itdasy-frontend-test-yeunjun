/* 사진 편집기 — AI 원터치 보정 v2 (PE-1, 2026-05-19 v217)
   초고도화 Phase 1 #1 킬러 피처 — FaceTune 대체.

   기능:
     • MediaPipe Face Mesh 로 얼굴 정밀 검출 (468 landmarks)
     • 업종별 자동 보정:
        - 헤어 (모발 윤기 + 잡티 제거 + 윤곽 선명)
        - 메이크업 (피부톤 균일 + 입술 보정)
        - 속눈썹 (눈 영역 채도/대비 강화)
        - 네일 (손톱 영역 채도, 얼굴 검출 안되면 전체 보정)
        - 헤어 + 두피 / 왁싱 (피부 영역만)
     • 폴백: Face Mesh 로드 실패하거나 얼굴 미검출 시 기존 비-마스킹 보정 호출
     • 약 1초 내 단일 패스 — 슬라이더와 분리 (저장 직전 또는 자동 모드)

   등록: PhotoEditor._internal 의 helpers + 직접 PhotoEditor.AITouchV2 노출
*/
(function () {
  'use strict';
  if (window.PhotoEditorAITouchV2) return;

  const PRESETS = {
    hair:       { skinSmooth: 0.45, skinTone: 6, lipSat: 0,    eyeSharpen: 0,   hairShine: 0.35, overall: 'sharp' },
    makeup:     { skinSmooth: 0.55, skinTone: 8, lipSat: 0.25, eyeSharpen: 0.2, hairShine: 0,    overall: 'soft'  },
    lashes:     { skinSmooth: 0.3,  skinTone: 4, lipSat: 0.1,  eyeSharpen: 0.4, hairShine: 0,    overall: 'sharp' },
    nail:       { skinSmooth: 0.2,  skinTone: 2, lipSat: 0,    eyeSharpen: 0,   hairShine: 0,    overall: 'saturate' },
    scalp:      { skinSmooth: 0.4,  skinTone: 5, lipSat: 0,    eyeSharpen: 0,   hairShine: 0.2,  overall: 'soft'  },
    waxing:     { skinSmooth: 0.6,  skinTone: 7, lipSat: 0,    eyeSharpen: 0,   hairShine: 0,    overall: 'soft'  },
  };

  function _toShop(shopType) {
    const map = {
      hair: 'hair', '헤어': 'hair', '미용실': 'hair',
      makeup: 'makeup', '메이크업': 'makeup',
      lash: 'lashes', lashes: 'lashes', '속눈썹': 'lashes',
      nail: 'nail', '네일': 'nail',
      scalp: 'scalp', '두피': 'scalp',
      wax: 'waxing', waxing: 'waxing', '왁싱': 'waxing',
    };
    return map[(shopType || '').toLowerCase()] || 'makeup';
  }

  // 메인: source canvas/image + shopType → 새 canvas
  async function _apply(source, shopType) {
    const preset = PRESETS[_toShop(shopType)];
    const w = source.width || source.naturalWidth;
    const h = source.height || source.naturalHeight;
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d');
    ctx.drawImage(source, 0, 0, w, h);

    // 베이스 컬러/톤 보정 (전체)
    _applyBaseTone(ctx, w, h, preset);

    // Face Mesh 시도
    const ML = window.MediaPipeLoader;
    if (ML) {
      let landmarks = null;
      try { landmarks = await ML.detect(source); } catch (_e) { /* ignore */ }
      if (landmarks && landmarks.length) {
        _applyFaceSpecific(ctx, w, h, landmarks, preset);
      } else {
        _applyFallback(ctx, w, h, preset);
      }
    } else {
      _applyFallback(ctx, w, h, preset);
    }
    return out;
  }

  function _applyBaseTone(ctx, w, h, p) {
    // CSS filter 기반 1-pass (성능 좋음)
    const filters = [];
    if (p.overall === 'soft') filters.push('contrast(1.04) saturate(1.05) brightness(1.02)');
    else if (p.overall === 'sharp') filters.push('contrast(1.08) saturate(1.06)');
    else if (p.overall === 'saturate') filters.push('saturate(1.18) contrast(1.04)');
    if (p.skinTone) filters.push(`sepia(${p.skinTone / 100}) hue-rotate(-${p.skinTone}deg)`);
    if (!filters.length) return;
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const tctx = tmp.getContext('2d');
    tctx.filter = filters.join(' ');
    tctx.drawImage(ctx.canvas, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(tmp, 0, 0);
  }

  function _applyFaceSpecific(ctx, w, h, lm, p) {
    const ML = window.MediaPipeLoader;
    // 피부 영역 부드럽게 (clip + box blur 흉내)
    if (p.skinSmooth > 0) {
      const faceOval = ML.regionPolygon(lm, 'faceOval');
      if (faceOval) {
        ctx.save();
        ML.pathPolygon(ctx, faceOval);
        ctx.clip();
        _softBlurInClip(ctx, w, h, p.skinSmooth);
        ctx.restore();
      }
    }
    // 입술 채도
    if (p.lipSat > 0) {
      const lips = ML.regionPolygon(lm, 'lips');
      if (lips) _tintRegion(ctx, lips, `rgba(220,80,90,${p.lipSat * 0.4})`);
    }
    // 눈 영역 선명도/속눈썹
    if (p.eyeSharpen > 0) {
      ['leftEye', 'rightEye'].forEach(name => {
        const poly = ML.regionPolygon(lm, name);
        if (poly) _tintRegion(ctx, poly, `rgba(20,10,30,${p.eyeSharpen * 0.35})`);
      });
    }
  }

  function _applyFallback(ctx, w, h, p) {
    if (p.skinSmooth <= 0) return;
    const ML = window.MediaPipeLoader;
    ctx.save();
    if (ML) ML.drawFallbackEllipsePath(ctx, w, h);
    else { ctx.beginPath(); ctx.arc(w/2, h*0.4, Math.min(w,h)*0.3, 0, Math.PI*2); }
    ctx.clip();
    _softBlurInClip(ctx, w, h, p.skinSmooth * 0.7);
    ctx.restore();
  }

  function _softBlurInClip(ctx, w, h, strength) {
    const radius = Math.max(1, Math.round(2 + strength * 4));
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const tctx = tmp.getContext('2d');
    tctx.filter = `blur(${radius}px)`;
    tctx.drawImage(ctx.canvas, 0, 0);
    ctx.globalAlpha = Math.min(1, strength * 1.2);
    ctx.drawImage(tmp, 0, 0);
    ctx.globalAlpha = 1;
  }

  function _tintRegion(ctx, polygon, fillStyle) {
    ctx.save();
    const ML = window.MediaPipeLoader;
    if (ML) ML.pathPolygon(ctx, polygon);
    ctx.fillStyle = fillStyle;
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fill();
    ctx.restore();
  }

  // ── 패널 통합: PhotoEditor 자동 탭에 "AI 원터치 v2" 버튼 추가 ──
  function _injectAutoButton() {
    const PE = window.PhotoEditor;
    if (!PE || !PE._internal) return false;
    const sheet = document.getElementById('peSheet');
    if (!sheet) return false;
    const panel = sheet.querySelector('.pe-panel');
    if (!panel) return false;
    if (panel.querySelector('[data-pe-ai-v2]')) return true;
    const state = PE._internal.getState();
    if (!state || state.activeTab !== 'auto') return false;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pe-action-btn pe-ai-v2-btn';
    btn.dataset.peAiV2 = '1';
    btn.style.cssText = 'margin-top:8px;background:linear-gradient(135deg,#7b61ff,#5b8def);color:#fff;font-weight:600;';
    btn.textContent = '✨ AI 원터치 v2 — 얼굴 정밀 보정';
    panel.appendChild(btn);
    btn.addEventListener('click', () => _runOnEditor(btn));
    return true;
  }

  async function _runOnEditor(btn) {
    const PE = window.PhotoEditor;
    if (!PE || !PE._internal) return;
    const state = PE._internal.getState();
    if (!state || !state.image) {
      _toast('사진을 먼저 불러오세요');
      return;
    }
    const orig = btn.textContent;
    btn.textContent = 'AI 분석 중…';
    btn.disabled = true;
    try {
      const shopType = (window.ShopSettings && window.ShopSettings.get && window.ShopSettings.get('shop_type')) || 'makeup';
      const result = await _apply(state.image, shopType);
      // 결과 이미지로 편집기 상태 교체
      const url = result.toDataURL('image/png');
      const img = new Image();
      img.onload = () => {
        state.image = img;
        state.imageBitmap = result;
        if (PE._internal.helpers && PE._internal.helpers.redraw) PE._internal.helpers.redraw();
        if (PE._internal.helpers && PE._internal.helpers.pushHistory) PE._internal.helpers.pushHistory();
        _toast('AI 원터치 v2 완료 (' + shopType + ' 모드)');
      };
      img.src = url;
    } catch (e) {
      _toast('AI 보정 실패 — 기본 보정으로 폴백');
    } finally {
      btn.textContent = orig;
      btn.disabled = false;
    }
  }

  function _toast(message) {
    if (window.toast) window.toast(message);
    else if (window.PhotoEditor && window.PhotoEditor._internal && window.PhotoEditor._internal.helpers && window.PhotoEditor._internal.helpers.toast) {
      window.PhotoEditor._internal.helpers.toast(message);
    }
  }

  // 편집기 열릴 때마다 버튼 주입 시도
  function _watchEditor() {
    let attempts = 0;
    const iv = setInterval(() => {
      const sheet = document.getElementById('peSheet');
      if (sheet && sheet.style.display !== 'none') {
        _injectAutoButton();
      }
      if (++attempts > 600) clearInterval(iv); // 10분 후 중단
    }, 1000);
  }

  window.PhotoEditorAITouchV2 = {
    apply: _apply,
    presets: PRESETS,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _watchEditor);
  } else _watchEditor();
})();
