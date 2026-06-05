/* 사진 편집기 — 템플릿 모듈 (2026-05-18 v168 분할)
   설계 문서: ~/.claude/plans/zesty-snacking-clarke.md §25

   메인 (app-photo-editor.js) 의 _internal API 로 등록.
     • registerTabPanel('template', { html, bind })
     • registerDrawHook('template', drawTemplate)

   책임:
     • 템플릿 패널 HTML (6종 + 해제)
     • 템플릿 패널 이벤트 바인딩 (두 번째 사진/라벨/후기/가격 라인)
     • 캔버스 합성: B&A 좌우/상하 · 후기 카드 · 가격표 · 시술 안내 · 스토리
*/
(function () {
  'use strict';

  const TEMPLATE_MAX_DIM = 2200;
  let _templateInputTimer = null;
  let _selectedPromoCat = 'recommend';
  const PROMO_CATS = [
    ['recommend', '추천'], ['ba', '시술 전후'], ['feed', '피드'], ['story', '스토리'],
    ['price', '가격표'], ['event', '이벤트'], ['review', '후기'], ['shop', '샵 소개'],
  ];
  const SHOP_RECS = {
    nail: ['price-nail', 'event-discount', 'ba-nail-cream'],
    hair: ['ba-hair-cream', 'feed-showcase', 'feed-review'],
    skin: ['ba-skin-cream', 'feed-review', 'event-gift'],
    lash: ['ba-lash-cream', 'story-open', 'card-minimal'],
    common: ['ba-cream', 'feed-showcase', 'story-open'],
  };
  const CAT_RECS = {
    ba: ['ba-cream', 'ba-nail-cream', 'ba-hair-cream'],
    feed: ['feed-showcase', 'feed-review', 'feed-notice'],
    story: ['story-open', 'story-qa', 'story-attend'],
    price: ['price-nail', 'price-hair', 'price-lash'],
    event: ['event-discount', 'event-gift', 'event-newcomer'],
    review: ['feed-review', 'ba-review', 'reels-review'],
    shop: ['card-minimal', 'card-nature', 'card-gold'],
  };
  const CAT_TO_MARKET = { ba: 'ba', feed: 'feed', story: 'story', price: 'price', event: 'event', review: 'feed', shop: 'card' };

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }
  function _toast(msg) {
    if (window.showToast) window.showToast(msg);
  }

  // ── 패널 HTML ─────────────────────────────────────────
  function _panelTemplateHTML(state) {
    return _buildPromoHero(state) + _buildPromoCards(state) + _buildAppliedCtas(state) + _buildLegacyControls(state);
  }

  function _buildPromoHero(state) {
    const ids = _recommendIds();
    const first = ids[0] || 'ba-cream';
    const img = _previewSrc(state);
    const ready = !!(state && state.originalImg);
    return `<section class="pe-tpl-loop-hero">
      <div class="pe-tpl-loop-copy">
        <span>템플릿</span><strong>편집한 사진으로 홍보물 만들기</strong>
        <p>${ready ? '현재 사진을 피드, 스토리, 가격표 홍보물로 바로 넣을 수 있어요.' : '먼저 사진을 선택하면 추천 템플릿에 바로 넣을 수 있어요.'}</p>
      </div>
      <div class="pe-tpl-loop-preview">${img ? `<img src="${_esc(img)}" alt="현재 편집 사진">` : '<b>사진 준비 전</b>'}<i>홍보물 미리보기</i></div>
      <div class="pe-tpl-loop-actions">
        <button type="button" class="pe-action-btn" data-pe-r4-apply-reco="${_esc(first)}">추천 템플릿 적용</button>
        <button type="button" class="pe-chip-btn" data-pe-r4-open-all>전체 템플릿 보기</button>
      </div>
    </section>`;
  }

  function _buildPromoCards(state) {
    const ids = _selectedPromoCat === 'recommend' ? _recommendIds() : (CAT_RECS[_selectedPromoCat] || []);
    const heading = _selectedPromoCat === 'recommend' ? '우리 샵 추천 템플릿' : (_catLabel(_selectedPromoCat) + ' 템플릿');
    return `<div class="pe-tpl-loop-section">
      <div class="pe-tpl-loop-head"><strong>${_esc(heading)}</strong><span>3개만 먼저 보여드릴게요</span></div>
      <div class="pe-tpl-loop-cats">${PROMO_CATS.map(_catChip).join('')}</div>
      <div class="pe-tpl-loop-grid">${ids.slice(0, 3).map(id => _promoCard(id, state)).join('')}</div>
    </div>`;
  }

  // [UX-BA-2] ba-* 시술 전후 템플릿 중 실제 before 사진(secondImg)을 쓰는 것 = ba-compose 경유.
  //   ba-cream/sage/dark 는 빈 프레임(사진 미사용)이라 제외. 마켓(tplV2) 적용분만 대상(레거시 ba-h/v 는 자체 피커 보유).
  const _BA_NO_PHOTO = { 'ba-cream': 1, 'ba-sage': 1, 'ba-dark': 1 };
  function _baNeedsBefore(id) { return typeof id === 'string' && /^ba-/.test(id) && !_BA_NO_PHOTO[id]; }

  function _buildAppliedCtas(state) {
    const marketId = state && state.tplV2 && state.tplV2.id;
    const appliedId = marketId || (state && state.template && state.template.id) || '';
    if (!appliedId) return '';
    const label = state.tplV2 && state.tplV2.label || appliedId || '템플릿';
    // 마켓 시술 전후 템플릿인데 시술 전 사진이 없으면 → 가짜 Before 대신 추가 안내(레거시 ba-h/v 는 기본 템플릿 영역서 처리)
    const needBefore = _baNeedsBefore(marketId) && !(state && state.secondImg);
    const beforeBlock = needBefore ? `<div class="pe-tpl-before-need" style="margin:8px 0;padding:10px 12px;border:1px dashed rgba(120,90,60,.45);border-radius:12px;background:rgba(120,90,60,.06);">
        <p style="margin:0 0 8px;font-size:12.5px;color:#6b5a45;line-height:1.4;">시술 전 사진을 추가하면 전후 비교가 완성돼요.<br>없으면 Before 칸은 안내로 표시돼요.</p>
        <button type="button" class="pe-action-btn" data-pe-pick-2nd>시술 전 사진 추가</button>
        <input type="file" id="pePicker2" accept="image/*" style="display:none" />
      </div>` : '';
    return `<div class="pe-tpl-loop-done">
      <strong>${_esc(label)} 적용됨</strong>
      ${beforeBlock}
      <div><button type="button" class="pe-chip-btn" data-pe-r4-go="text">텍스트 수정</button><button type="button" class="pe-action-btn" data-pe-r4-go="export">저장·게시 준비</button></div>
    </div>`;
  }

  function _buildLegacyControls(state) {
    const t = state.template;
    const tplBtn = (id, label) => `<button type="button" class="pe-chip-btn ${t.id===id?'on':''}" data-pe-tpl="${id}">${_esc(label)}</button>`;
    const baExtra = (t.id === 'ba-h' || t.id === 'ba-v') ? `
      <div class="pe-panel-row" style="margin-top:8px;"><button type="button" class="pe-action-btn" data-pe-pick-2nd>시술 전 사진 추가</button></div>
      <input type="file" id="pePicker2" accept="image/*" style="display:none" />
      <label class="pe-field" style="margin-top:8px;"><span>왼쪽/위 라벨</span><input type="text" class="pe-input" data-pe-tpl-left value="${_esc(t.leftLabel)}" maxlength="8" /></label>
      <label class="pe-field"><span>오른쪽/아래 라벨</span><input type="text" class="pe-input" data-pe-tpl-right value="${_esc(t.rightLabel)}" maxlength="8" /></label>` : '';
    const reviewExtra = t.id === 'review' ? `<label class="pe-field" style="margin-top:8px;"><span>후기 문구</span><textarea class="pe-input" data-pe-tpl-review rows="3" maxlength="120" placeholder="짧은 후기 1~2줄">${_esc(t.reviewText)}</textarea></label>` : '';
    const priceExtra = t.id === 'price' ? `<label class="pe-field" style="margin-top:8px;"><span>가격 라인 (줄바꿈으로 구분)</span><textarea class="pe-input" data-pe-tpl-price rows="4" maxlength="200" placeholder="시술명 | 가격&#10;예) 붙임머리 20인치 | 120,000원">${_esc(t.priceLines)}</textarea></label>` : '';
    const serviceExtra = t.id === 'service' ? `<div class="pe-hint">상단에 시술명 + 소요시간 + 가격이 자동으로 들어가요. (브랜드 탭의 샵명도 함께)</div>` : '';
    const storyExtra = t.id === 'story' ? `<div class="pe-hint">인스타 스토리용 9:16 화면으로 저장돼요. 시술명, 가격, 샵명이 자동으로 들어갑니다.</div>` : '';
    // [UX-CTA-1] 기본 템플릿 묶음을 details 로 접어 첫 화면 과밀 해소. 레거시 템플릿 적용 중이면 펼침(open).
    return `<details class="pe-tpl-legacy" ${t.id ? 'open' : ''} style="margin-top:10px;">
      <summary style="cursor:pointer;font-size:12.5px;font-weight:600;color:#8a7c68;padding:6px 2px;list-style:none;">기본 템플릿 더보기 ▾</summary>
      <div class="pe-panel-row pe-panel-grid-2" style="margin-top:6px;">${tplBtn('ba-h','시술 전후 좌우')}${tplBtn('ba-v','시술 전후 상하')}${tplBtn('service','시술 안내')}${tplBtn('price','가격표')}</div>
      <div class="pe-panel-row pe-panel-grid-2">${tplBtn('review','후기 카드')}${tplBtn('story','스토리 9:16')}</div>
      <div class="pe-panel-row">${tplBtn(null,'템플릿 해제')}</div>
      ${baExtra}${reviewExtra}${priceExtra}${serviceExtra}${storyExtra}
    </details>`;
  }

  function _catChip(pair) {
    const on = _selectedPromoCat === pair[0] ? ' on' : '';
    return `<button type="button" class="pe-chip-btn${on}" data-pe-r4-cat="${_esc(pair[0])}">${_esc(pair[1])}</button>`;
  }

  function _promoCard(id) {
    const tpl = _marketTpl(id);
    if (!tpl) return '';
    const tier = tpl.tier === 'pro' ? 'PRO' : 'FREE';
    return `<button type="button" class="pe-tpl-loop-card" data-pe-r4-tpl="${_esc(id)}">
      <span class="pe-tpl-loop-badge ${tpl.tier === 'pro' ? 'pro' : 'free'}">${tier}</span>
      <strong>${_esc(tpl.label)}</strong><small>${_esc(_purposeLabel(tpl))}</small>
    </button>`;
  }

  function _marketTpl(id) {
    const list = window.PhotoEditorTemplateMarketData && window.PhotoEditorTemplateMarketData.TEMPLATES;
    return Array.isArray(list) ? list.find(t => t.id === id) : null;
  }

  function _purposeLabel(tpl) {
    const data = window.PhotoEditorTemplateMarketData || {};
    const pur = data.PURPOSE_LABEL && tpl && data.PURPOSE_LABEL[tpl.purpose];
    const ind = data.INDUSTRY_LABEL && tpl && data.INDUSTRY_LABEL[tpl.industry];
    return [ind && tpl.industry !== 'common' ? ind : '', pur || '홍보물'].filter(Boolean).join(' · ');
  }

  function _catLabel(id) {
    const found = PROMO_CATS.find(pair => pair[0] === id);
    return found ? found[1] : '추천';
  }

  function _recommendIds() {
    const cat = _shopCat();
    return (SHOP_RECS[cat] || SHOP_RECS.common).filter(_marketTpl).slice(0, 3);
  }

  function _shopCat() {
    let raw = '';
    try { raw = localStorage.getItem('shop_type') || ''; } catch (_e) { raw = ''; }
    const norm = typeof window.itdasyNormalizeShopType === 'function' ? window.itdasyNormalizeShopType(raw) : null;
    const cat = String((norm && (norm.cat || norm.label)) || raw || '').toLowerCase();
    if (/nail|네일/.test(cat)) return 'nail';
    if (/hair|헤어|scalp|두피/.test(cat)) return 'hair';
    if (/skin|피부|esthetic|에스테틱/.test(cat)) return 'skin';
    if (/lash|속눈썹/.test(cat)) return 'lash';
    return 'common';
  }

  function _previewSrc(state) {
    const cv = document.getElementById('peCanvas');
    try { if (cv && cv.width && cv.height) return cv.toDataURL('image/jpeg', 0.78); }
    catch (_e) { void 0; }
    return state && state.originalSrc ? state.originalSrc : '';
  }

  // ── 패널 바인딩 ───────────────────────────────────────
  function _bindTemplatePanel(panel, state, helpers) {
    const { renderPanel, scheduleRedraw, pushHistory } = helpers;
    _bindPromoLoop(panel, state, helpers);
    panel.querySelectorAll('[data-pe-tpl]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.peTpl;
        state.template.id = (id === 'null' || id === '' || id === null) ? null : id;
        state.tplV2 = null;
        if (!state.template.id) state.secondImg = null;
        // [v184 2026-05-18] B&A 라벨 자동 prefill — 챗봇·고객 컨텍스트에서 시술명 받았으면 활용
        if (state.template.id === 'ba-h' || state.template.id === 'ba-v') {
          if (state.template.leftLabel === '전') state.template.leftLabel = 'BEFORE';
          if (state.template.rightLabel === '후') state.template.rightLabel = 'AFTER';
        }
        // 가격표 prefill — 고객 시술 가격이 있으면 자동 채움
        if (state.template.id === 'price' && !state.template.priceLines) {
          const svc = state.serviceName || '시술';
          const priceTxt = state.price ? (state.price / 10000).toFixed(0) + '만원' : '문의';
          state.template.priceLines = svc + ' | ' + priceTxt;
        }
        // 후기 카드 — 고객명 prefill
        if (state.template.id === 'review' && !state.template.reviewText) {
          const cust = state.customerName ? state.customerName + '님' : '손님';
          state.template.reviewText = '"' + cust + '께서 정성껏 해주셔서 만족스러웠어요. 다음에 또 방문할게요."';
        }
        renderPanel(); scheduleRedraw(); pushHistory();
      });
    });
    panel.querySelector('[data-pe-pick-2nd]')?.addEventListener('click', () => document.getElementById('pePicker2')?.click());
    panel.querySelector('#pePicker2')?.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const img = new Image();
      img.onload = () => { state.secondImg = img; scheduleRedraw(); renderPanel(); pushHistory(); };   // [UX-BA-2] 패널 갱신(추가 버튼 숨김)
      img.src = URL.createObjectURL(f);
    });
    panel.querySelector('[data-pe-tpl-left]')?.addEventListener('input', (e) => { state.template.leftLabel = e.target.value; _queueTemplateRedraw(helpers); });
    panel.querySelector('[data-pe-tpl-right]')?.addEventListener('input', (e) => { state.template.rightLabel = e.target.value; _queueTemplateRedraw(helpers); });
    panel.querySelector('[data-pe-tpl-review]')?.addEventListener('input', (e) => { state.template.reviewText = e.target.value; _queueTemplateRedraw(helpers); });
    panel.querySelector('[data-pe-tpl-price]')?.addEventListener('input', (e) => {
      state.template.priceLines = e.target.value; _queueTemplateRedraw(helpers);
    });
    panel.querySelectorAll('[data-pe-tpl-left],[data-pe-tpl-right],[data-pe-tpl-review],[data-pe-tpl-price]').forEach(el => {
      el.addEventListener('change', () => { _flushTemplateRedraw(helpers); pushHistory(); });
    });
  }

  function _bindPromoLoop(panel, state, helpers) {
    panel.querySelectorAll('[data-pe-r4-cat]').forEach(btn => {
      btn.addEventListener('click', () => { _selectedPromoCat = btn.dataset.peR4Cat || 'recommend'; helpers.renderPanel(); });
    });
    panel.querySelector('[data-pe-r4-open-all]')?.addEventListener('click', () => _openMarket());
    panel.querySelector('[data-pe-r4-apply-reco]')?.addEventListener('click', (e) =>
      _selectMarketTemplate(e.currentTarget.dataset.peR4ApplyReco, helpers));
    panel.querySelectorAll('[data-pe-r4-tpl]').forEach(btn => {
      btn.addEventListener('click', () => _selectMarketTemplate(btn.dataset.peR4Tpl, helpers));
    });
    panel.querySelectorAll('[data-pe-r4-go]').forEach(btn => {
      btn.addEventListener('click', () => _goTab(btn.dataset.peR4Go, state, helpers));
    });
  }

  function _openMarket() {
    const api = window.PhotoEditorTemplatesV2;
    if (!api || typeof api.open !== 'function') return _toast('전체 템플릿을 불러오는 중이에요');
    api.open({ cat: CAT_TO_MARKET[_selectedPromoCat] || 'ba', recommendedIds: _recommendIds() });
  }

  function _selectMarketTemplate(tplId, helpers) {
    const tpl = _marketTpl(tplId);
    const api = window.PhotoEditorTemplatesV2;
    if (!tpl || !api) return _toast('템플릿을 불러오는 중이에요');
    if (typeof api.openPreview === 'function') { api.openPreview(tplId); return; }
    _applyMarketTemplate(tplId, helpers);
  }

  function _applyMarketTemplate(tplId, helpers) {
    const api = window.PhotoEditorTemplatesV2;
    if (!api || typeof api.apply !== 'function') return _toast('템플릿을 불러오는 중이에요');
    const state = window.PhotoEditor && window.PhotoEditor._internal && window.PhotoEditor._internal.getState();
    if (state && state.tplV2 === undefined) state.tplV2 = null;
    if (state && helpers && typeof helpers.pushHistory === 'function') helpers.pushHistory();
    if (state && state.template) state.template.id = null;
    api.apply(tplId);
    if (helpers && typeof helpers.renderPanel === 'function') helpers.renderPanel();
  }

  function _goTab(tab, state, helpers) {
    const btn = document.querySelector('#peTabs [data-pe-tab="' + tab + '"]');
    if (btn) { btn.click(); return; }
    if (state) state.activeTab = tab;
    if (helpers && typeof helpers.renderPanel === 'function') helpers.renderPanel();
  }

  // ── 캔버스 합성 — drawHook 진입점 ──────────────────────
  // 기본은 1080×1350 (4:5), 스토리는 1080×1920 (9:16).
  function _drawTemplate(cv, img, state, helpers) {
    const id = state.template.id, W = 1080, H = id === 'story' ? 1920 : 1350;
    if (cv.width !== W) cv.width = W;
    if (cv.height !== H) cv.height = H;
    const ctx = cv.getContext('2d', { alpha: false });
    _resetCanvasState(ctx, W, H);
    ctx.fillStyle = '#1a1a20'; ctx.fillRect(0, 0, W, H);
    const fastImg = _getTemplateSource(img, state);
    if (id === 'ba-h' || id === 'ba-v') return _renderTemplateBA(ctx, W, H, fastImg, id === 'ba-h', state, helpers);
    if (id === 'review')  return _renderTemplateReview(ctx, W, H, fastImg, state, helpers);
    if (id === 'price')   return _renderTemplatePrice(ctx, W, H, fastImg, state, helpers);
    if (id === 'service') return _renderTemplateService(ctx, W, H, fastImg, state, helpers);
    if (id === 'story')   return _renderTemplateStory(ctx, W, H, fastImg, state, helpers);
  }

  function _queueTemplateRedraw(helpers) {
    clearTimeout(_templateInputTimer);
    _templateInputTimer = setTimeout(() => _flushTemplateRedraw(helpers), 140);
  }

  function _flushTemplateRedraw(helpers) {
    clearTimeout(_templateInputTimer);
    _templateInputTimer = null;
    if (helpers && typeof helpers.scheduleRedraw === 'function') helpers.scheduleRedraw();
  }

  function _resetCanvasState(ctx, W, H) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
  }

  function _getTemplateSource(img, state) {
    if (!img) return img;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const key = _templateImageKey(img, state, w, h);
    if (state._templateFastImage && state._templateFastImage.key === key) return state._templateFastImage.canvas;
    const canvas = _makeTemplateFastImage(img, w, h);
    state._templateFastImage = { key, canvas };
    return canvas;
  }

  function _makeTemplateFastImage(img, w, h) {
    const maxDim = Math.max(w, h);
    if (!maxDim || maxDim <= TEMPLATE_MAX_DIM) return img;
    const scale = TEMPLATE_MAX_DIM / maxDim;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function _templateImageKey(img, state, w, h) {
    const src = String(state.originalSrc || img.currentSrc || img.src || '');
    return [w, h, src.length, src.slice(0, 80), src.slice(-80)].join('|');
  }

  function _drawFittedImage(ctx, src, dx, dy, dw, dh, placeholder) {
    if (!src) {
      ctx.fillStyle = '#2a2a32'; ctx.fillRect(dx, dy, dw, dh);
      ctx.fillStyle = '#888';
      ctx.font = '600 28px Pretendard, "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(placeholder || '사진 고르기', dx + dw/2, dy + dh/2);
      return;
    }
    const srcW = src.naturalWidth || src.width, srcH = src.naturalHeight || src.height;
    const sAR = srcW / srcH, dAR = dw / dh;
    let sx, sy, sw, sh;
    if (sAR > dAR) { sh = srcH; sw = sh * dAR; sx = (srcW - sw) / 2; sy = 0; }
    else           { sw = srcW; sh = sw / dAR; sx = 0; sy = (srcH - sh) / 2; }
    ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  function _renderTemplateBA(ctx, W, H, img, horizontal, state, helpers) {
    const PAD = 24;
    if (horizontal) {
      const halfW = (W - PAD * 3) / 2, innerH = H - PAD * 2 - 120;
      _drawFittedImage(ctx, state.secondImg, PAD, PAD, halfW, innerH, '시술 전 사진 추가');
      _drawFittedImage(ctx, img, PAD * 2 + halfW, PAD, halfW, innerH, '시술 후 사진');
      _drawBALabel(ctx, PAD + halfW/2, PAD + 36, state.template.leftLabel);
      _drawBALabel(ctx, PAD * 2 + halfW + halfW/2, PAD + 36, state.template.rightLabel);
    } else {
      const halfH = (H - PAD * 3 - 120) / 2;
      _drawFittedImage(ctx, state.secondImg, PAD, PAD, W - PAD * 2, halfH, '시술 전 사진 추가');
      _drawFittedImage(ctx, img, PAD, PAD * 2 + halfH, W - PAD * 2, halfH, '시술 후 사진');
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

  function _renderTemplateStory(ctx, W, H, img, state, helpers) {
    _drawFittedImage(ctx, img, 0, 0, W, H);
    ctx.save();
    const top = ctx.createLinearGradient(0, 0, 0, 420);
    top.addColorStop(0, 'rgba(0,0,0,0.55)');
    top.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = top; ctx.fillRect(0, 0, W, 420);

    const bottom = ctx.createLinearGradient(0, H - 720, 0, H);
    bottom.addColorStop(0, 'rgba(0,0,0,0)');
    bottom.addColorStop(0.45, 'rgba(0,0,0,0.55)');
    bottom.addColorStop(1, 'rgba(0,0,0,0.86)');
    ctx.fillStyle = bottom; ctx.fillRect(0, H - 720, W, 720);

    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#FFC83D';
    ctx.font = '800 34px Pretendard, "Noto Sans KR", sans-serif';
    ctx.fillText('TODAY STYLE', 72, H - 430);
    ctx.fillStyle = '#fff';
    ctx.font = '900 72px Pretendard, "Noto Sans KR", sans-serif';
    _wrapText(ctx, state.serviceName || '오늘의 시술', 72, H - 370, W - 144, 82, 'left');
    if (state.price) {
      ctx.fillStyle = '#FFC83D';
      ctx.font = '800 42px Pretendard, "Noto Sans KR", sans-serif';
      ctx.fillText((state.price / 10000).toFixed(0) + '만원', 72, H - 180, W - 144);
    }
    if (state.shopName) {
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.font = '600 30px Pretendard, "Noto Sans KR", sans-serif';
      ctx.fillText(state.shopName, 72, H - 112, W - 144);
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
