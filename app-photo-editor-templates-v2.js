/* 사진 편집기 — 템플릿 마켓 v2 (PE-5, 2026-05-19 v217)
   초고도화 Phase 1 #5 — Canva 수준 30+ 템플릿.

   기능:
     • 6 카테고리 × 5+ 템플릿 = 30+ 종 등록
       - 피드 (1080×1350): 시술 자랑, 신메뉴, 후기, 가격 강조, 안내
       - 스토리 (1080×1920): 카운트다운, 오픈 알림, 출석체크, Q&A, 투표
       - 릴스 커버 (1080×1920): 비포애프터, 가격, 신메뉴, 후기, 시술과정
       - 이벤트 (1080×1080): 할인, 회원가, 신규, 데드라인, 무료증정
       - 가격표 (1080×1350): 헤어/네일/속눈썹/메이크업/왁싱 5종
       - 명함 (1080×1080): 미니멀, 골드, 핑크, 다크, 자연

     • 카테고리 탭 + 검색
     • Brand Kit 자동 적용 (색상·로고·샵명)
     • 적용 시 캔버스에 합성 + 텍스트 레이어 자동 prefill

   기존 `app-photo-editor-templates.js` 와 공존 — v2 는 별도 시트로 표시.
*/
(function () {
  'use strict';
  if (window.PhotoEditorTemplatesV2) return;

  const CATS = [
    { id: 'feed',    label: '피드',    ratio: '4:5', size: [1080, 1350] },
    { id: 'story',   label: '스토리',  ratio: '9:16', size: [1080, 1920] },
    { id: 'reels',   label: '릴스커버', ratio: '9:16', size: [1080, 1920] },
    { id: 'event',   label: '이벤트',  ratio: '1:1', size: [1080, 1080] },
    { id: 'price',   label: '가격표',  ratio: '4:5', size: [1080, 1350] },
    { id: 'card',    label: '명함',    ratio: '1:1', size: [1080, 1080] },
  ];

  // 30종 템플릿 데이터 — 각 템플릿은 layout 함수 가짐
  const TEMPLATES = [
    // ── 피드 5 ──
    { id: 'feed-showcase',   cat: 'feed',  label: '시술 자랑',  prefillText: '오늘의 시술', accent: 'primary' },
    { id: 'feed-new-menu',   cat: 'feed',  label: '신메뉴 소개', prefillText: '신메뉴 출시', accent: 'primary' },
    { id: 'feed-review',     cat: 'feed',  label: '고객 후기',  prefillText: '"정말 만족해요"', accent: 'soft' },
    { id: 'feed-price',      cat: 'feed',  label: '가격 강조',  prefillText: '특가 진행 중', accent: 'gold' },
    { id: 'feed-notice',     cat: 'feed',  label: '안내사항',  prefillText: '안내 드립니다', accent: 'soft' },
    // ── 스토리 5 ──
    { id: 'story-count',     cat: 'story', label: '카운트다운', prefillText: 'D-3', accent: 'primary' },
    { id: 'story-open',      cat: 'story', label: '오픈 알림',  prefillText: 'OPEN', accent: 'primary' },
    { id: 'story-attend',    cat: 'story', label: '출석체크',  prefillText: 'CHECK-IN', accent: 'soft' },
    { id: 'story-qa',        cat: 'story', label: 'Q&A 받기', prefillText: 'Q&A 받습니다', accent: 'soft' },
    { id: 'story-poll',      cat: 'story', label: '투표',     prefillText: '어떤 게 좋아요?', accent: 'primary' },
    // ── 릴스 커버 5 ──
    { id: 'reels-ba',        cat: 'reels', label: '비포애프터', prefillText: 'BEFORE → AFTER', accent: 'gold' },
    { id: 'reels-price',     cat: 'reels', label: '가격 공개',  prefillText: '가격 공개!', accent: 'gold' },
    { id: 'reels-newmenu',   cat: 'reels', label: '신메뉴',    prefillText: 'NEW', accent: 'primary' },
    { id: 'reels-review',    cat: 'reels', label: '후기 영상',  prefillText: 'REAL REVIEW', accent: 'soft' },
    { id: 'reels-process',   cat: 'reels', label: '시술 과정',  prefillText: 'PROCESS', accent: 'primary' },
    // ── 이벤트 5 ──
    { id: 'event-discount',  cat: 'event', label: '할인',      prefillText: '50% OFF', accent: 'gold' },
    { id: 'event-member',    cat: 'event', label: '회원가',    prefillText: 'MEMBER ONLY', accent: 'primary' },
    { id: 'event-newcomer',  cat: 'event', label: '신규 할인',  prefillText: '신규 -30%', accent: 'gold' },
    { id: 'event-deadline',  cat: 'event', label: '마감 임박',  prefillText: '오늘까지!', accent: 'gold' },
    { id: 'event-gift',      cat: 'event', label: '무료 증정',  prefillText: '+ FREE GIFT', accent: 'soft' },
    // ── 가격표 5 ──
    { id: 'price-hair',      cat: 'price', label: '헤어 가격표',     prefillText: 'HAIR MENU', accent: 'soft' },
    { id: 'price-nail',      cat: 'price', label: '네일 가격표',     prefillText: 'NAIL MENU', accent: 'soft' },
    { id: 'price-lash',      cat: 'price', label: '속눈썹 가격표',    prefillText: 'LASH MENU', accent: 'soft' },
    { id: 'price-makeup',    cat: 'price', label: '메이크업 가격표',  prefillText: 'MAKEUP', accent: 'soft' },
    { id: 'price-wax',       cat: 'price', label: '왁싱 가격표',     prefillText: 'WAX MENU', accent: 'soft' },
    // ── 명함 5 ──
    { id: 'card-minimal',    cat: 'card',  label: '미니멀',   prefillText: '샵 안내', accent: 'soft' },
    { id: 'card-gold',       cat: 'card',  label: '골드',     prefillText: 'OUR SHOP', accent: 'gold' },
    { id: 'card-pink',       cat: 'card',  label: '핑크',     prefillText: 'WELCOME', accent: 'primary' },
    { id: 'card-dark',       cat: 'card',  label: '다크',     prefillText: 'STUDIO', accent: 'soft' },
    { id: 'card-nature',     cat: 'card',  label: '내추럴',   prefillText: 'STUDIO', accent: 'soft' },
  ];

  let _sheetEl = null;
  let _selectedCat = 'feed';
  let _searchTerm = '';

  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  function _getBrandKit() {
    try {
      if (window.BrandKit && window.BrandKit.get) return window.BrandKit.get();
    } catch (_e) { /* ignore */ }
    return {
      primary: '#7b61ff', accent: '#c89a52', soft: '#f3eee4',
      shopName: '잇데이 스튜디오', logo: null,
    };
  }

  function _accentColor(accent, bk) {
    if (accent === 'gold') return bk.accent || '#c89a52';
    if (accent === 'primary') return bk.primary || '#7b61ff';
    return bk.soft || '#f3eee4';
  }

  function _ensureSheet() {
    if (_sheetEl) return _sheetEl;
    _sheetEl = document.createElement('div');
    _sheetEl.id = 'tplV2Sheet';
    _sheetEl.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:9999;display:none;flex-direction:column;';
    _sheetEl.innerHTML = `
      <header style="padding:14px 16px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #eee;">
        <button type="button" id="tpv2Close" class="pe-action-btn" style="background:#eee;">닫기</button>
        <div style="font-weight:700;flex:1;">템플릿 마켓 (30+)</div>
        <input type="search" id="tpv2Search" placeholder="검색…" style="border:1px solid #ddd;padding:6px 10px;border-radius:8px;font-size:13px;" />
      </header>
      <div id="tpv2Cats" style="padding:10px 16px;display:flex;gap:6px;overflow-x:auto;border-bottom:1px solid #eee;background:#fafafa;"></div>
      <div id="tpv2Grid" style="flex:1;overflow-y:auto;padding:14px 16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;"></div>
    `;
    document.body.appendChild(_sheetEl);
    _sheetEl.querySelector('#tpv2Close').addEventListener('click', () => { _sheetEl.style.display = 'none'; });
    _sheetEl.querySelector('#tpv2Search').addEventListener('input', (e) => { _searchTerm = e.target.value || ''; _renderGrid(); });
    return _sheetEl;
  }

  function _renderCats() {
    const cats = _sheetEl.querySelector('#tpv2Cats');
    cats.innerHTML = CATS.map(c => `
      <button type="button" class="pe-chip-btn ${_selectedCat === c.id ? 'on' : ''}" data-tpv2-cat="${c.id}">${_esc(c.label)}</button>
    `).join('');
    cats.querySelectorAll('[data-tpv2-cat]').forEach(b => {
      b.addEventListener('click', () => { _selectedCat = b.dataset.tpv2Cat; _renderCats(); _renderGrid(); });
    });
  }

  function _renderGrid() {
    const grid = _sheetEl.querySelector('#tpv2Grid');
    const bk = _getBrandKit();
    const filtered = TEMPLATES.filter(t => {
      if (t.cat !== _selectedCat) return false;
      if (!_searchTerm) return true;
      return (t.label + ' ' + (t.prefillText || '')).toLowerCase().includes(_searchTerm.toLowerCase());
    });
    if (!filtered.length) { grid.innerHTML = `<div style="grid-column:1/-1;color:#999;padding:24px;text-align:center;">검색 결과 없음</div>`; return; }
    grid.innerHTML = filtered.map(t => {
      const color = _accentColor(t.accent, bk);
      const cat = CATS.find(c => c.id === t.cat);
      const ar = cat.ratio === '9:16' ? '9 / 16' : (cat.ratio === '4:5' ? '4 / 5' : '1 / 1');
      return `
        <button type="button" class="tpv2-card" data-tpv2-tpl="${t.id}" style="border:1px solid #eee;border-radius:14px;overflow:hidden;background:#fff;cursor:pointer;padding:0;text-align:left;">
          <div style="aspect-ratio:${ar};background:linear-gradient(135deg, ${color}33, ${color});display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;text-shadow:0 1px 4px rgba(0,0,0,0.3);">${_esc(t.prefillText || t.label)}</div>
          <div style="padding:8px 10px;font-size:12px;font-weight:600;">${_esc(t.label)}</div>
        </button>
      `;
    }).join('');
    grid.querySelectorAll('[data-tpv2-tpl]').forEach(b => {
      b.addEventListener('click', () => _apply(b.dataset.tpv2Tpl));
    });
  }

  // 템플릿 적용: PhotoEditor 상태에 카드 정보 + 텍스트 레이어 prefill
  function _apply(tplId) {
    const tpl = TEMPLATES.find(t => t.id === tplId);
    if (!tpl) return;
    const cat = CATS.find(c => c.id === tpl.cat);
    const bk = _getBrandKit();
    const PE = window.PhotoEditor;
    if (!PE || !PE._internal) { _toast('편집기를 먼저 열어주세요'); return; }
    const state = PE._internal.getState();
    if (!state) return;
    // 비율 설정
    state.aspect = cat.ratio;
    state.tplV2 = {
      id: tpl.id,
      label: tpl.label,
      bg: _accentColor(tpl.accent, bk),
      shopName: bk.shopName,
      logo: bk.logo,
      cat: cat.id,
    };
    // 텍스트 레이어 prefill
    if (window.PhotoEditorLayers && window.PhotoEditorLayers.ensure) {
      window.PhotoEditorLayers.ensure(state);
      const active = state.layers && state.layers.find(l => l.id === state.activeLayerId);
      if (active) {
        active.value = tpl.prefillText;
        active.color = '#ffffff';
        active.size = (cat.ratio === '9:16' ? 9 : 7);
        active.bg = true;
      }
    }
    if (PE._internal.helpers && PE._internal.helpers.redraw) PE._internal.helpers.redraw();
    if (PE._internal.helpers && PE._internal.helpers.pushHistory) PE._internal.helpers.pushHistory();
    _toast('템플릿 적용: ' + tpl.label);
    _sheetEl.style.display = 'none';
  }

  function _toast(msg) {
    if (window.toast) window.toast(msg);
    else if (window.PhotoEditor && window.PhotoEditor._internal && window.PhotoEditor._internal.helpers && window.PhotoEditor._internal.helpers.toast) {
      window.PhotoEditor._internal.helpers.toast(msg);
    }
  }

  function _open(initialCat) {
    _ensureSheet();
    if (initialCat) _selectedCat = initialCat;
    _renderCats();
    _renderGrid();
    _sheetEl.style.display = 'flex';
  }

  // MutationObserver — 템플릿 탭 활성일 때마다 버튼 주입
  function _inject(panel) {
    if (!panel || panel.querySelector('[data-pe-tplv2]')) return;
    const PE = window.PhotoEditor;
    const state = PE && PE._internal && PE._internal.getState();
    if (!state || state.activeTab !== 'template') return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pe-action-btn';
    btn.dataset.peTplv2 = '1';
    btn.style.cssText = 'margin-top:12px;background:linear-gradient(135deg,#7b61ff,#5b8def);color:#fff;font-weight:600;width:100%;';
    btn.textContent = '✨ 더 많은 템플릿 (30+) — 카테고리·검색';
    btn.addEventListener('click', () => _open());
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
    _registerDrawHook();
  }

  // PhotoEditor _drawHooks.tplV2_overlay 등록 — 실제 캔버스 합성
  function _registerDrawHook() {
    const PE = window.PhotoEditor;
    if (!PE || !PE._internal || !PE._internal.registerDrawHook) {
      setTimeout(_registerDrawHook, 500);
      return;
    }
    PE._internal.registerDrawHook('tplV2_overlay', (ctx, dw, dh, state, helpers) => {
      const tpl = state && state.tplV2;
      if (!tpl) return;
      const t = TEMPLATES.find(x => x.id === tpl.id);
      if (!t) return;
      _drawOverlay(ctx, dw, dh, t, tpl);
    });
  }

  // 카테고리별 디자인 합성 — 단순 그라데이션 대신 실제 카드 디자인
  function _drawOverlay(ctx, dw, dh, t, brand) {
    const accent = brand.bg || '#7b61ff';
    const shopName = brand.shopName || '잇데이 스튜디오';
    ctx.save();
    switch (t.cat) {
      case 'feed':    _drawFeed(ctx, dw, dh, t, accent, shopName); break;
      case 'story':   _drawStory(ctx, dw, dh, t, accent, shopName); break;
      case 'reels':   _drawReels(ctx, dw, dh, t, accent, shopName); break;
      case 'event':   _drawEvent(ctx, dw, dh, t, accent, shopName); break;
      case 'price':   _drawPrice(ctx, dw, dh, t, accent, shopName); break;
      case 'card':    _drawCard(ctx, dw, dh, t, accent, shopName); break;
    }
    ctx.restore();
  }

  function _setShadow(ctx, alpha) {
    ctx.shadowColor = 'rgba(0,0,0,' + alpha + ')';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
  }

  function _drawFeed(ctx, dw, dh, t, accent, shopName) {
    // 하단 30% 강조 띠
    const bandY = dh * 0.72;
    const bandH = dh * 0.28;
    const grad = ctx.createLinearGradient(0, bandY, 0, dh);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, accent + '99');
    grad.addColorStop(1, accent);
    ctx.fillStyle = grad;
    ctx.fillRect(0, bandY, dw, bandH);
    // 샵명 + 헤드라인
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(dh * 0.046)}px sans-serif`;
    ctx.textAlign = 'left';
    _setShadow(ctx, 0.35);
    ctx.fillText(t.prefillText || t.label, dw * 0.06, dh * 0.86);
    ctx.shadowBlur = 0;
    ctx.font = `500 ${Math.round(dh * 0.024)}px sans-serif`;
    ctx.globalAlpha = 0.85;
    ctx.fillText(shopName, dw * 0.06, dh * 0.94);
  }

  function _drawStory(ctx, dw, dh, t, accent, shopName) {
    // 상단 빈 영역 컬러 박스 + 큰 헤드라인
    const headH = dh * 0.18;
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, dw, headH);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = `700 ${Math.round(dh * 0.052)}px sans-serif`;
    _setShadow(ctx, 0.3);
    ctx.fillText(t.prefillText || t.label, dw / 2, headH * 0.65);
    ctx.shadowBlur = 0;
    // 하단 샵명
    ctx.font = `600 ${Math.round(dh * 0.025)}px sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = 0.9;
    ctx.fillText(shopName, dw / 2, dh - dh * 0.04);
  }

  function _drawReels(ctx, dw, dh, t, accent, shopName) {
    // 중앙에 큰 헤드라인 + 배경 어둡게
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, dh * 0.35, dw, dh * 0.3);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = `900 ${Math.round(dh * 0.06)}px sans-serif`;
    _setShadow(ctx, 0.5);
    ctx.fillText(t.prefillText || t.label, dw / 2, dh * 0.52);
    ctx.shadowBlur = 0;
    // 하단 컬러 띠
    ctx.fillStyle = accent;
    ctx.fillRect(0, dh - 8, dw, 8);
    ctx.font = `600 ${Math.round(dh * 0.02)}px sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText(shopName, dw / 2, dh - dh * 0.05);
  }

  function _drawEvent(ctx, dw, dh, t, accent, shopName) {
    // 코너 컬러 라운드 박스 + 큰 텍스트
    const pad = dw * 0.06;
    const boxW = dw * 0.6, boxH = dh * 0.25;
    const x = (dw - boxW) / 2, y = dh * 0.4;
    ctx.fillStyle = accent;
    _roundRect(ctx, x, y, boxW, boxH, 24);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = `800 ${Math.round(dh * 0.07)}px sans-serif`;
    ctx.fillText(t.prefillText || t.label, dw / 2, y + boxH * 0.65);
    // 샵명
    ctx.font = `500 ${Math.round(dh * 0.022)}px sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = 0.95;
    _setShadow(ctx, 0.4);
    ctx.fillText(shopName, dw / 2, dh - pad);
  }

  function _drawPrice(ctx, dw, dh, t, accent, shopName) {
    // 상단 헤더 띠
    const headH = dh * 0.12;
    ctx.fillStyle = accent + 'ee';
    ctx.fillRect(0, 0, dw, headH);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.font = `700 ${Math.round(dh * 0.035)}px sans-serif`;
    ctx.fillText(t.prefillText || t.label, dw * 0.06, headH * 0.65);
    // 하단 정보 영역
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(0, dh - dh * 0.22, dw, dh * 0.22);
    ctx.fillStyle = '#222';
    ctx.font = `600 ${Math.round(dh * 0.022)}px sans-serif`;
    ctx.fillText('샵 메뉴 안내', dw * 0.06, dh - dh * 0.15);
    ctx.font = `400 ${Math.round(dh * 0.02)}px sans-serif`;
    ctx.fillStyle = '#666';
    ctx.fillText(shopName, dw * 0.06, dh - dh * 0.08);
  }

  function _drawCard(ctx, dw, dh, t, accent, shopName) {
    // 카드 스타일 가장자리 + 중앙 텍스트
    const inset = dw * 0.05;
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(3, dw * 0.008);
    ctx.strokeRect(inset, inset, dw - inset * 2, dh - inset * 2);
    ctx.fillStyle = '#000';
    ctx.globalAlpha = 0.3;
    ctx.fillRect(inset * 2, dh / 2 - dh * 0.08, dw - inset * 4, dh * 0.16);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = `700 ${Math.round(dh * 0.05)}px sans-serif`;
    ctx.fillText(t.prefillText || t.label, dw / 2, dh / 2);
    ctx.font = `500 ${Math.round(dh * 0.022)}px sans-serif`;
    ctx.fillStyle = accent;
    ctx.fillText(shopName, dw / 2, dh / 2 + dh * 0.06);
  }

  function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  window.PhotoEditorTemplatesV2 = { open: _open, TEMPLATES, CATS };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _watchPanel);
  } else _watchPanel();
})();
