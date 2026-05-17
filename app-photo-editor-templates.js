/* 사진 편집기 — 템플릿 모듈 (2026-05-18 v168 분할)
   설계 문서: ~/.claude/plans/zesty-snacking-clarke.md §25

   메인 (app-photo-editor.js) 의 _internal API 로 등록.
     • registerTabPanel('template', { html, bind })
     • registerDrawHook('template', drawTemplate)

   책임:
     • 템플릿 패널 HTML (5종 + 해제)
     • 템플릿 패널 이벤트 바인딩 (두 번째 사진/라벨/후기/가격 라인)
     • 캔버스 합성: B&A 좌우/상하 · 후기 카드 · 가격표 · 시술 안내
*/
(function () {
  'use strict';

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  // ── 패널 HTML ─────────────────────────────────────────
  function _panelTemplateHTML(state) {
    const t = state.template;
    const tplBtn = (id, label) => `<button type="button" class="pe-chip-btn ${t.id===id?'on':''}" data-pe-tpl="${id}">${_esc(label)}</button>`;
    const baExtra = (t.id === 'ba-h' || t.id === 'ba-v') ? `
      <div class="pe-panel-row" style="margin-top:8px;"><button type="button" class="pe-action-btn" data-pe-pick-2nd>두 번째 사진 고르기</button></div>
      <input type="file" id="pePicker2" accept="image/*" style="display:none" />
      <label class="pe-field" style="margin-top:8px;"><span>왼쪽/위 라벨</span><input type="text" class="pe-input" data-pe-tpl-left value="${_esc(t.leftLabel)}" maxlength="8" /></label>
      <label class="pe-field"><span>오른쪽/아래 라벨</span><input type="text" class="pe-input" data-pe-tpl-right value="${_esc(t.rightLabel)}" maxlength="8" /></label>` : '';
    const reviewExtra = t.id === 'review' ? `<label class="pe-field" style="margin-top:8px;"><span>후기 문구</span><textarea class="pe-input" data-pe-tpl-review rows="3" maxlength="120" placeholder="짧은 후기 1~2줄">${_esc(t.reviewText)}</textarea></label>` : '';
    const priceExtra = t.id === 'price' ? `<label class="pe-field" style="margin-top:8px;"><span>가격 라인 (줄바꿈으로 구분)</span><textarea class="pe-input" data-pe-tpl-price rows="4" maxlength="200" placeholder="시술명 | 가격&#10;예) 붙임머리 20인치 | 120,000원">${_esc(t.priceLines)}</textarea></label>` : '';
    const serviceExtra = t.id === 'service' ? `<div class="pe-hint">상단에 시술명 + 소요시간 + 가격이 자동으로 들어가요. (브랜드 탭의 샵명도 함께)</div>` : '';
    return `<div class="pe-field-label">템플릿</div>
      <div class="pe-panel-row pe-panel-grid-2">${tplBtn('ba-h','B&A 좌우')}${tplBtn('ba-v','B&A 상하')}${tplBtn('service','시술 안내')}${tplBtn('price','가격표')}</div>
      <div class="pe-panel-row pe-panel-grid-2">${tplBtn('review','후기 카드')}${tplBtn(null,'템플릿 해제')}</div>
      ${baExtra}${reviewExtra}${priceExtra}${serviceExtra}`;
  }

  // ── 패널 바인딩 ───────────────────────────────────────
  function _bindTemplatePanel(panel, state, helpers) {
    const { renderPanel, redraw, pushHistory } = helpers;
    panel.querySelectorAll('[data-pe-tpl]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.peTpl;
        state.template.id = (id === 'null' || id === '' || id === null) ? null : id;
        if (!state.template.id) state.secondImg = null;
        renderPanel(); redraw(); pushHistory();
      });
    });
    panel.querySelector('[data-pe-pick-2nd]')?.addEventListener('click', () => document.getElementById('pePicker2')?.click());
    panel.querySelector('#pePicker2')?.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const img = new Image();
      img.onload = () => { state.secondImg = img; redraw(); pushHistory(); };
      img.src = URL.createObjectURL(f);
    });
    panel.querySelector('[data-pe-tpl-left]')?.addEventListener('input', (e) => { state.template.leftLabel = e.target.value; redraw(); });
    panel.querySelector('[data-pe-tpl-right]')?.addEventListener('input', (e) => { state.template.rightLabel = e.target.value; redraw(); });
    panel.querySelector('[data-pe-tpl-review]')?.addEventListener('input', (e) => { state.template.reviewText = e.target.value; redraw(); });
    panel.querySelector('[data-pe-tpl-price]')?.addEventListener('input', (e) => {
      state.template.priceLines = e.target.value; redraw();
    });
  }

  // ── 캔버스 합성 — drawHook 진입점 ──────────────────────
  // 모든 템플릿은 1080×1350 (4:5) — 인스타 피드 최대.
  function _drawTemplate(cv, img, state, helpers) {
    const id = state.template.id, W = 1080, H = 1350;
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#1a1a20'; ctx.fillRect(0, 0, W, H);
    if (id === 'ba-h' || id === 'ba-v') return _renderTemplateBA(ctx, W, H, img, id === 'ba-h', state, helpers);
    if (id === 'review')  return _renderTemplateReview(ctx, W, H, img, state, helpers);
    if (id === 'price')   return _renderTemplatePrice(ctx, W, H, img, state, helpers);
    if (id === 'service') return _renderTemplateService(ctx, W, H, img, state, helpers);
  }

  function _drawFittedImage(ctx, src, dx, dy, dw, dh) {
    if (!src) {
      ctx.fillStyle = '#2a2a32'; ctx.fillRect(dx, dy, dw, dh);
      ctx.fillStyle = '#888';
      ctx.font = '600 28px Pretendard, "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('두 번째 사진 고르기', dx + dw/2, dy + dh/2);
      return;
    }
    const sAR = src.naturalWidth / src.naturalHeight, dAR = dw / dh;
    let sx, sy, sw, sh;
    if (sAR > dAR) { sh = src.naturalHeight; sw = sh * dAR; sx = (src.naturalWidth - sw) / 2; sy = 0; }
    else           { sw = src.naturalWidth;  sh = sw / dAR; sx = 0; sy = (src.naturalHeight - sh) / 2; }
    ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  function _renderTemplateBA(ctx, W, H, img, horizontal, state, helpers) {
    const PAD = 24;
    if (horizontal) {
      const halfW = (W - PAD * 3) / 2, innerH = H - PAD * 2 - 120;
      _drawFittedImage(ctx, img, PAD, PAD, halfW, innerH);
      _drawFittedImage(ctx, state.secondImg, PAD * 2 + halfW, PAD, halfW, innerH);
      _drawBALabel(ctx, PAD + halfW/2, PAD + 36, state.template.leftLabel);
      _drawBALabel(ctx, PAD * 2 + halfW + halfW/2, PAD + 36, state.template.rightLabel);
    } else {
      const halfH = (H - PAD * 3 - 120) / 2;
      _drawFittedImage(ctx, img, PAD, PAD, W - PAD * 2, halfH);
      _drawFittedImage(ctx, state.secondImg, PAD, PAD * 2 + halfH, W - PAD * 2, halfH);
      _drawBALabel(ctx, PAD + 70, PAD + 36, state.template.leftLabel);
      _drawBALabel(ctx, PAD + 70, PAD * 2 + halfH + 36, state.template.rightLabel);
    }
    _drawTitleStrip(ctx, W, H, state.serviceName || 'BEFORE / AFTER', state);
    _drawWatermarkIfAny(ctx, W, H, state, helpers);
  }

  function _drawBALabel(ctx, x, y, text) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    const tw = Math.max(70, text.length * 26 + 28);
    ctx.fillRect(x - tw/2, y - 22, tw, 44);
    ctx.fillStyle = '#fff';
    ctx.font = '800 26px Pretendard, "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function _drawTitleStrip(ctx, W, H, title, state) {
    ctx.save();
    ctx.fillStyle = '#0c0c10'; ctx.fillRect(0, H - 96, W, 96);
    ctx.fillStyle = '#fff';
    ctx.font = '800 36px Pretendard, "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(title, W / 2, H - 48, W * 0.9);
    if (state.shopName) {
      ctx.font = '500 18px Pretendard, "Noto Sans KR", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillText(state.shopName, W / 2, H - 22);
    }
    ctx.restore();
  }

  function _renderTemplateReview(ctx, W, H, img, state, helpers) {
    _drawFittedImage(ctx, img, 0, 0, W, Math.round(H * 0.55));
    // 그라데이션 페이드
    const grad = ctx.createLinearGradient(0, Math.round(H * 0.45), 0, Math.round(H * 0.55));
    grad.addColorStop(0, 'rgba(12,12,16,0)'); grad.addColorStop(1, '#0c0c10');
    ctx.fillStyle = grad; ctx.fillRect(0, Math.round(H * 0.45), W, Math.round(H * 0.10));
    ctx.fillStyle = '#0c0c10'; ctx.fillRect(0, Math.round(H * 0.55), W, H);

    // 별 5개
    ctx.fillStyle = '#FFC83D';
    ctx.font = '700 56px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('★★★★★', W / 2, Math.round(H * 0.60));

    // 후기 본문
    const txt = state.template.reviewText || '“정성껏 해주셔서 만족스러웠어요. 다음에 또 방문할게요.”';
    ctx.fillStyle = '#fff';
    ctx.font = '600 36px Pretendard, "Noto Sans KR", sans-serif';
    _wrapText(ctx, txt, W / 2, Math.round(H * 0.74), W * 0.85, 46, 'center');

    // 샵명
    if (state.shopName) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '500 24px Pretendard, "Noto Sans KR", sans-serif';
      ctx.fillText(state.shopName, W / 2, Math.round(H * 0.93));
    }
    _drawWatermarkIfAny(ctx, W, H, state, helpers);
  }

  function _renderTemplatePrice(ctx, W, H, img, state, helpers) {
    _drawFittedImage(ctx, img, 0, 0, W, Math.round(H * 0.5));
    ctx.fillStyle = '#0c0c10'; ctx.fillRect(0, Math.round(H * 0.5), W, H);

    ctx.fillStyle = '#fff';
    ctx.font = '800 56px Pretendard, "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('PRICE', W / 2, Math.round(H * 0.55));

    const lines = (state.template.priceLines || '붙임머리 20인치 | 120,000원\n속눈썹 연장 | 70,000원').split('\n');
    ctx.font = '600 32px Pretendard, "Noto Sans KR", sans-serif';
    lines.slice(0, 6).forEach((ln, idx) => {
      const parts = ln.split('|').map(s => s.trim());
      const y = Math.round(H * 0.68) + idx * 56;
      ctx.textAlign = 'left'; ctx.fillStyle = '#e8e8ee';
      ctx.fillText(parts[0] || '', 80, y);
      if (parts[1]) {
        ctx.textAlign = 'right'; ctx.fillStyle = '#FFC83D';
        ctx.fillText(parts[1], W - 80, y);
      }
    });
    _drawWatermarkIfAny(ctx, W, H, state, helpers);
  }

  function _renderTemplateService(ctx, W, H, img, state, helpers) {
    _drawFittedImage(ctx, img, 0, 0, W, H);
    // 좌상단 박스
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(40, 40, 520, 200);
    ctx.fillStyle = '#fff';
    ctx.font = '800 38px Pretendard, "Noto Sans KR", sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(state.serviceName || '시술명', 64, 60, 480);
    if (state.price) {
      ctx.font = '700 30px Pretendard, "Noto Sans KR", sans-serif';
      ctx.fillStyle = '#FFC83D';
      ctx.fillText((state.price / 10000).toFixed(0) + '만원', 64, 110, 480);
    }
    if (state.shopName) {
      ctx.font = '500 22px Pretendard, "Noto Sans KR", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.78)';
      ctx.fillText(state.shopName, 64, 170, 480);
    }
    ctx.restore();
    _drawWatermarkIfAny(ctx, W, H, state, helpers);
  }

  function _drawWatermarkIfAny(ctx, W, H, state, helpers) {
    if (state.watermark && state.watermark.value && helpers && typeof helpers.drawWatermark === 'function') {
      helpers.drawWatermark(ctx, W, H, state.watermark);
    }
  }

  function _wrapText(ctx, text, x, y, maxWidth, lineHeight, align) {
    ctx.textAlign = align || 'left';
    const words = text.split(' ');
    let line = '';
    let cy = y;
    for (let i = 0; i < words.length; i++) {
      const test = line + words[i] + ' ';
      if (ctx.measureText(test).width > maxWidth && i > 0) {
        ctx.fillText(line, x, cy);
        line = words[i] + ' ';
        cy += lineHeight;
      } else line = test;
    }
    ctx.fillText(line, x, cy);
  }

  // ── 메인 모듈 준비될 때까지 폴링 후 등록 ──
  function _register() {
    if (!window.PhotoEditor || !window.PhotoEditor._internal) return false;
    const i = window.PhotoEditor._internal;
    i.registerTabPanel('template', { html: _panelTemplateHTML, bind: _bindTemplatePanel });
    i.registerDrawHook('template', _drawTemplate);
    return true;
  }
  if (!_register()) {
    let tries = 0;
    const iv = setInterval(() => {
      if (_register() || ++tries > 50) clearInterval(iv);
    }, 100);
  }
})();
