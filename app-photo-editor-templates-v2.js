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

  // 30종 디자인 분기 — 각 템플릿 ID 별 고유 합성
  function _drawOverlay(ctx, dw, dh, t, brand) {
    const accent = brand.bg || '#7b61ff';
    const shopName = brand.shopName || '잇데이 스튜디오';
    const head = t.prefillText || t.label;
    ctx.save();
    const dispatch = {
      // 피드 5
      'feed-showcase':   () => _drawFeedShowcase(ctx, dw, dh, head, accent, shopName),
      'feed-new-menu':   () => _drawFeedNewMenu(ctx, dw, dh, head, accent, shopName),
      'feed-review':     () => _drawFeedReview(ctx, dw, dh, head, accent, shopName),
      'feed-price':      () => _drawFeedPrice(ctx, dw, dh, head, accent, shopName),
      'feed-notice':     () => _drawFeedNotice(ctx, dw, dh, head, accent, shopName),
      // 스토리 5
      'story-count':     () => _drawStoryCount(ctx, dw, dh, head, accent, shopName),
      'story-open':      () => _drawStoryOpen(ctx, dw, dh, head, accent, shopName),
      'story-attend':    () => _drawStoryAttend(ctx, dw, dh, head, accent, shopName),
      'story-qa':        () => _drawStoryQA(ctx, dw, dh, head, accent, shopName),
      'story-poll':      () => _drawStoryPoll(ctx, dw, dh, head, accent, shopName),
      // 릴스 5
      'reels-ba':        () => _drawReelsBA(ctx, dw, dh, head, accent, shopName),
      'reels-price':     () => _drawReelsPrice(ctx, dw, dh, head, accent, shopName),
      'reels-newmenu':   () => _drawReelsNew(ctx, dw, dh, head, accent, shopName),
      'reels-review':    () => _drawReelsReview(ctx, dw, dh, head, accent, shopName),
      'reels-process':   () => _drawReelsProcess(ctx, dw, dh, head, accent, shopName),
      // 이벤트 5
      'event-discount':  () => _drawEventDiscount(ctx, dw, dh, head, accent, shopName),
      'event-member':    () => _drawEventMember(ctx, dw, dh, head, accent, shopName),
      'event-newcomer':  () => _drawEventNewcomer(ctx, dw, dh, head, accent, shopName),
      'event-deadline':  () => _drawEventDeadline(ctx, dw, dh, head, accent, shopName),
      'event-gift':      () => _drawEventGift(ctx, dw, dh, head, accent, shopName),
      // 가격표 5
      'price-hair':      () => _drawPriceTable(ctx, dw, dh, '헤어 메뉴', accent, shopName, ['컷 / 45,000원','펌 / 180,000원','컬러 / 220,000원','드라이 / 25,000원']),
      'price-nail':      () => _drawPriceTable(ctx, dw, dh, '네일 메뉴', accent, shopName, ['젤네일 / 50,000원','속눈썹 / 60,000원','케어 / 25,000원','연장 / 70,000원']),
      'price-lash':      () => _drawPriceTable(ctx, dw, dh, '속눈썹 메뉴', accent, shopName, ['풀세트 / 80,000원','리터치 / 45,000원','클렌징 / 15,000원','제거 / 10,000원']),
      'price-makeup':    () => _drawPriceTable(ctx, dw, dh, '메이크업 메뉴', accent, shopName, ['데일리 / 60,000원','파티 / 90,000원','웨딩 / 200,000원','촬영 / 120,000원']),
      'price-wax':       () => _drawPriceTable(ctx, dw, dh, '왁싱 메뉴', accent, shopName, ['브라질리언 / 60,000원','다리 / 50,000원','얼굴 / 25,000원','겨드랑이 / 20,000원']),
      // 명함 5
      'card-minimal':    () => _drawCardMinimal(ctx, dw, dh, head, accent, shopName),
      'card-gold':       () => _drawCardGold(ctx, dw, dh, head, accent, shopName),
      'card-pink':       () => _drawCardPink(ctx, dw, dh, head, accent, shopName),
      'card-dark':       () => _drawCardDark(ctx, dw, dh, head, accent, shopName),
      'card-nature':     () => _drawCardNature(ctx, dw, dh, head, accent, shopName),
    };
    const fn = dispatch[t.id];
    if (fn) fn();
    ctx.restore();
  }

  // ── 공통 헬퍼 ──
  function _shadow(ctx, alpha, blur, oy) { ctx.shadowColor = `rgba(0,0,0,${alpha})`; ctx.shadowBlur = blur; ctx.shadowOffsetY = oy || 0; }
  function _clearShadow(ctx) { ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }
  function _grad(ctx, x0, y0, x1, y1, c0, c1) { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; }

  // ── 피드 5 (1080×1350 / 4:5) ──
  function _drawFeedShowcase(ctx, dw, dh, head, accent, shop) {
    ctx.fillStyle = _grad(ctx, 0, dh*0.7, 0, dh, 'rgba(0,0,0,0)', accent);
    ctx.fillRect(0, dh*0.7, dw, dh*0.3);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; _shadow(ctx, 0.4, 14, 4);
    ctx.font = `800 ${Math.round(dh*0.05)}px sans-serif`; ctx.fillText(head, dw*0.06, dh*0.86);
    _clearShadow(ctx); ctx.font = `500 ${Math.round(dh*0.022)}px sans-serif`; ctx.globalAlpha = 0.92;
    ctx.fillText(shop, dw*0.06, dh*0.94); ctx.globalAlpha = 1;
  }
  function _drawFeedNewMenu(ctx, dw, dh, head, accent, shop) {
    // 상단 NEW 뱃지 + 가운데 정렬
    ctx.fillStyle = accent;
    _roundRect(ctx, dw*0.06, dh*0.05, dw*0.18, dh*0.05, 8); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
    ctx.font = `800 ${Math.round(dh*0.022)}px sans-serif`; ctx.fillText('NEW', dw*0.09, dh*0.085);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, dh*0.78, dw, dh*0.22);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = `800 ${Math.round(dh*0.045)}px sans-serif`; ctx.fillText(head, dw/2, dh*0.88);
    ctx.font = `500 ${Math.round(dh*0.022)}px sans-serif`; ctx.fillText(shop, dw/2, dh*0.95);
  }
  function _drawFeedReview(ctx, dw, dh, head, accent, shop) {
    // 따옴표 후기 카드
    const boxW = dw*0.84, boxH = dh*0.28, x = (dw-boxW)/2, y = dh*0.66;
    ctx.fillStyle = 'rgba(255,255,255,0.96)'; _roundRect(ctx, x, y, boxW, boxH, 20); ctx.fill();
    ctx.fillStyle = accent; ctx.textAlign = 'left';
    ctx.font = `800 ${Math.round(dh*0.06)}px serif`; ctx.fillText('"', x+12, y+dh*0.07);
    ctx.fillStyle = '#222'; ctx.font = `600 ${Math.round(dh*0.028)}px sans-serif`;
    ctx.fillText(head, x+dw*0.06, y+dh*0.12);
    ctx.fillStyle = '#888'; ctx.font = `400 ${Math.round(dh*0.018)}px sans-serif`;
    ctx.fillText('— ' + shop + ' 고객 후기', x+dw*0.06, y+boxH-dh*0.03);
  }
  function _drawFeedPrice(ctx, dw, dh, head, accent, shop) {
    // 큰 가격 강조
    ctx.fillStyle = accent; ctx.fillRect(0, dh*0.42, dw, dh*0.16);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = `900 ${Math.round(dh*0.07)}px sans-serif`; ctx.fillText(head, dw/2, dh*0.52);
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, dh*0.85, dw, dh*0.15);
    ctx.fillStyle = '#fff'; ctx.font = `500 ${Math.round(dh*0.025)}px sans-serif`;
    ctx.fillText(shop + ' · 한정 진행', dw/2, dh*0.92);
  }
  function _drawFeedNotice(ctx, dw, dh, head, accent, shop) {
    // 상단 NOTICE 헤더
    ctx.fillStyle = accent + 'e0'; ctx.fillRect(0, 0, dw, dh*0.13);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = `800 ${Math.round(dh*0.035)}px sans-serif`; ctx.fillText('📢 안내사항', dw/2, dh*0.08);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, dh*0.72, dw, dh*0.28);
    ctx.fillStyle = '#fff'; ctx.font = `600 ${Math.round(dh*0.032)}px sans-serif`;
    ctx.fillText(head, dw/2, dh*0.85);
    ctx.font = `400 ${Math.round(dh*0.02)}px sans-serif`; ctx.globalAlpha = 0.85;
    ctx.fillText(shop, dw/2, dh*0.93); ctx.globalAlpha = 1;
  }

  // ── 스토리 5 (1080×1920 / 9:16) ──
  function _drawStoryCount(ctx, dw, dh, head, accent, shop) {
    // 큰 D-숫자 중앙
    ctx.fillStyle = accent; ctx.fillRect(0, 0, dw, dh);
    ctx.globalAlpha = 0.92; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, dw, dh); ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = `900 ${Math.round(dh*0.18)}px sans-serif`; _shadow(ctx, 0.5, 24, 6);
    ctx.fillText(head, dw/2, dh*0.55); _clearShadow(ctx);
    ctx.font = `600 ${Math.round(dh*0.025)}px sans-serif`; ctx.fillText(shop, dw/2, dh*0.65);
  }
  function _drawStoryOpen(ctx, dw, dh, head, accent, shop) {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, dw, dh);
    ctx.fillStyle = accent;
    _roundRect(ctx, dw*0.15, dh*0.4, dw*0.7, dh*0.16, 30); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = `900 ${Math.round(dh*0.07)}px sans-serif`; ctx.fillText(head, dw/2, dh*0.51);
    ctx.fillStyle = accent; ctx.font = `700 ${Math.round(dh*0.028)}px sans-serif`;
    ctx.fillText(shop, dw/2, dh*0.62);
  }
  function _drawStoryAttend(ctx, dw, dh, head, accent, shop) {
    // 체크 박스 5개
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, dh*0.3, dw, dh*0.4);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = `800 ${Math.round(dh*0.04)}px sans-serif`; ctx.fillText(head, dw/2, dh*0.42);
    for (let i = 0; i < 5; i++) {
      const x = dw*0.18 + i*dw*0.16;
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(x, dh*0.55, dw*0.04, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(dh*0.025)}px sans-serif`;
      ctx.fillText((i+1).toString(), x, dh*0.56);
    }
    ctx.fillStyle = '#fff'; ctx.font = `500 ${Math.round(dh*0.022)}px sans-serif`;
    ctx.fillText(shop + ' · 5회 방문 시 혜택', dw/2, dh*0.68);
  }
  function _drawStoryQA(ctx, dw, dh, head, accent, shop) {
    // Q&A 박스 + 답변 칸
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, dw, dh);
    ctx.fillStyle = accent;
    _roundRect(ctx, dw*0.1, dh*0.35, dw*0.8, dh*0.08, 16); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = `800 ${Math.round(dh*0.03)}px sans-serif`; ctx.fillText('Q: ' + head, dw/2, dh*0.41);
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2;
    _roundRect(ctx, dw*0.1, dh*0.46, dw*0.8, dh*0.12, 16); ctx.stroke();
    ctx.fillStyle = '#aaa'; ctx.font = `500 ${Math.round(dh*0.024)}px sans-serif`;
    ctx.fillText('답변을 입력하세요...', dw/2, dh*0.535);
    ctx.fillStyle = accent; ctx.font = `700 ${Math.round(dh*0.022)}px sans-serif`;
    ctx.fillText(shop, dw/2, dh*0.94);
  }
  function _drawStoryPoll(ctx, dw, dh, head, accent, shop) {
    // 두 옵션 막대
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, dh*0.3, dw, dh*0.4);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = `800 ${Math.round(dh*0.035)}px sans-serif`; ctx.fillText(head, dw/2, dh*0.4);
    ['A 옵션', 'B 옵션'].forEach((label, i) => {
      ctx.fillStyle = i === 0 ? accent : '#fff';
      _roundRect(ctx, dw*0.15, dh*(0.48 + i*0.08), dw*0.7, dh*0.06, 20); ctx.fill();
      ctx.fillStyle = i === 0 ? '#fff' : accent; ctx.font = `700 ${Math.round(dh*0.024)}px sans-serif`;
      ctx.fillText(label, dw/2, dh*(0.518 + i*0.08));
    });
    ctx.fillStyle = '#fff'; ctx.font = `500 ${Math.round(dh*0.02)}px sans-serif`;
    ctx.fillText(shop, dw/2, dh*0.7);
  }

  // ── 릴스 커버 5 (1080×1920 / 9:16) ──
  function _drawReelsBA(ctx, dw, dh, head, accent, shop) {
    // 좌우 분할 BEFORE / AFTER 라벨
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, dh*0.42, dw, dh*0.16);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = `900 ${Math.round(dh*0.05)}px sans-serif`; ctx.fillText(head, dw/2, dh*0.51);
    // 위 BEFORE / 아래 AFTER 라벨
    ctx.fillStyle = accent; ctx.fillRect(0, dh*0.08, dw*0.32, dh*0.05);
    ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(dh*0.025)}px sans-serif`;
    ctx.textAlign = 'left'; ctx.fillText('BEFORE', dw*0.04, dh*0.115);
    ctx.fillStyle = accent; ctx.fillRect(dw*0.68, dh*0.85, dw*0.32, dh*0.05);
    ctx.fillStyle = '#fff'; ctx.fillText('AFTER', dw*0.72, dh*0.885);
    ctx.textAlign = 'center'; ctx.font = `600 ${Math.round(dh*0.022)}px sans-serif`;
    ctx.fillText(shop, dw/2, dh*0.95);
  }
  function _drawReelsPrice(ctx, dw, dh, head, accent, shop) {
    // 큰 ! 가격 폭로
    ctx.fillStyle = '#000'; ctx.globalAlpha = 0.5; ctx.fillRect(0, 0, dw, dh); ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = `900 ${Math.round(dh*0.08)}px sans-serif`; _shadow(ctx, 0.6, 24, 6);
    ctx.fillText(head, dw/2, dh*0.5); _clearShadow(ctx);
    ctx.fillStyle = accent; ctx.font = `800 ${Math.round(dh*0.035)}px sans-serif`;
    ctx.fillText('탭하여 자세히 보기 →', dw/2, dh*0.6);
    ctx.fillStyle = '#fff'; ctx.font = `500 ${Math.round(dh*0.022)}px sans-serif`;
    ctx.fillText(shop, dw/2, dh*0.95);
  }
  function _drawReelsNew(ctx, dw, dh, head, accent, shop) {
    ctx.fillStyle = accent; ctx.fillRect(0, 0, dw, dh*0.15);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = `900 ${Math.round(dh*0.07)}px sans-serif`; ctx.fillText('✨ NEW', dw/2, dh*0.1);
    ctx.fillStyle = '#000'; ctx.globalAlpha = 0.4; ctx.fillRect(0, dh*0.4, dw, dh*0.2); ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(dh*0.045)}px sans-serif`;
    ctx.fillText(head, dw/2, dh*0.52);
    ctx.font = `500 ${Math.round(dh*0.022)}px sans-serif`; ctx.fillText(shop, dw/2, dh*0.95);
  }
  function _drawReelsReview(ctx, dw, dh, head, accent, shop) {
    // 별 5개 + 후기 카드
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, dh*0.3, dw, dh*0.3);
    ctx.fillStyle = '#FFD700'; ctx.textAlign = 'center';
    ctx.font = `800 ${Math.round(dh*0.05)}px sans-serif`; ctx.fillText('★★★★★', dw/2, dh*0.4);
    ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(dh*0.035)}px sans-serif`;
    ctx.fillText(head, dw/2, dh*0.5);
    ctx.fillStyle = accent; ctx.font = `600 ${Math.round(dh*0.022)}px sans-serif`;
    ctx.fillText('— ' + shop, dw/2, dh*0.58);
  }
  function _drawReelsProcess(ctx, dw, dh, head, accent, shop) {
    // 1 → 2 → 3 → 4 step
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, dh*0.3, dw, dh*0.4);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = `800 ${Math.round(dh*0.04)}px sans-serif`; ctx.fillText(head, dw/2, dh*0.4);
    for (let i = 0; i < 4; i++) {
      const x = dw*0.15 + i*dw*0.22;
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(x, dh*0.55, dw*0.04, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.round(dh*0.028)}px sans-serif`;
      ctx.fillText((i+1).toString(), x, dh*0.563);
      if (i < 3) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x + dw*0.04, dh*0.55); ctx.lineTo(x + dw*0.18, dh*0.55); ctx.stroke();
      }
    }
    ctx.fillStyle = '#fff'; ctx.font = `500 ${Math.round(dh*0.022)}px sans-serif`;
    ctx.fillText(shop, dw/2, dh*0.95);
  }

  // ── 이벤트 5 (1080×1080 / 1:1) ──
  function _drawEventDiscount(ctx, dw, dh, head, accent, shop) {
    // 큰 % 강조 + 회전 라벨
    ctx.save();
    ctx.translate(dw*0.7, dh*0.25); ctx.rotate(-Math.PI/12);
    ctx.fillStyle = accent; _roundRect(ctx, -dw*0.18, -dh*0.06, dw*0.36, dh*0.12, 18); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = `900 ${Math.round(dh*0.06)}px sans-serif`; ctx.fillText('SALE', 0, dh*0.02);
    ctx.restore();
    ctx.fillStyle = accent;
    _roundRect(ctx, dw*0.1, dh*0.4, dw*0.8, dh*0.25, 24); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = `900 ${Math.round(dh*0.1)}px sans-serif`; ctx.fillText(head, dw/2, dh*0.55);
    ctx.fillStyle = '#000'; ctx.font = `700 ${Math.round(dh*0.025)}px sans-serif`;
    ctx.fillText(shop + ' · 한정 진행', dw/2, dh*0.92);
  }
  function _drawEventMember(ctx, dw, dh, head, accent, shop) {
    // 골드 테두리 + 회원 카드
    ctx.strokeStyle = accent; ctx.lineWidth = Math.max(4, dw*0.01);
    _roundRect(ctx, dw*0.05, dh*0.05, dw*0.9, dh*0.9, 28); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    _roundRect(ctx, dw*0.12, dh*0.35, dw*0.76, dh*0.3, 20); ctx.fill();
    ctx.fillStyle = accent; ctx.textAlign = 'center';
    ctx.font = `900 ${Math.round(dh*0.04)}px sans-serif`; ctx.fillText('VIP MEMBERS', dw/2, dh*0.43);
    ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(dh*0.055)}px sans-serif`;
    ctx.fillText(head, dw/2, dh*0.55);
    ctx.font = `500 ${Math.round(dh*0.022)}px sans-serif`; ctx.fillText(shop, dw/2, dh*0.62);
  }
  function _drawEventNewcomer(ctx, dw, dh, head, accent, shop) {
    // 컬러 박스 좌측 + 텍스트 우측
    ctx.fillStyle = accent; ctx.fillRect(0, 0, dw*0.45, dh);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
    ctx.font = `900 ${Math.round(dh*0.045)}px sans-serif`; ctx.fillText('첫 방문', dw*0.05, dh*0.45);
    ctx.fillText('할인 이벤트', dw*0.05, dh*0.55);
    ctx.fillStyle = '#000'; ctx.fillRect(dw*0.45, 0, dw*0.55, dh);
    ctx.fillStyle = accent; ctx.textAlign = 'center';
    ctx.font = `900 ${Math.round(dh*0.1)}px sans-serif`; ctx.fillText(head, dw*0.72, dh*0.55);
    ctx.fillStyle = '#fff'; ctx.font = `500 ${Math.round(dh*0.02)}px sans-serif`;
    ctx.fillText(shop, dw*0.72, dh*0.92);
  }
  function _drawEventDeadline(ctx, dw, dh, head, accent, shop) {
    // 빨간 띠 + ⏰
    ctx.fillStyle = '#ef4444'; ctx.fillRect(0, dh*0.2, dw, dh*0.15);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = `900 ${Math.round(dh*0.045)}px sans-serif`; ctx.fillText('⏰ 마감 임박', dw/2, dh*0.295);
    ctx.fillStyle = accent;
    _roundRect(ctx, dw*0.1, dh*0.45, dw*0.8, dh*0.2, 20); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.round(dh*0.07)}px sans-serif`;
    ctx.fillText(head, dw/2, dh*0.58);
    ctx.fillStyle = '#000'; ctx.font = `500 ${Math.round(dh*0.022)}px sans-serif`;
    ctx.fillText(shop, dw/2, dh*0.92);
  }
  function _drawEventGift(ctx, dw, dh, head, accent, shop) {
    // GIFT 박스 형태
    ctx.fillStyle = accent + '30'; ctx.fillRect(0, 0, dw, dh);
    ctx.fillStyle = accent;
    _roundRect(ctx, dw*0.2, dh*0.35, dw*0.6, dh*0.3, 24); ctx.fill();
    // 리본
    ctx.fillStyle = '#fff'; ctx.fillRect(dw*0.48, dh*0.35, dw*0.04, dh*0.3);
    ctx.fillRect(dw*0.2, dh*0.48, dw*0.6, dh*0.04);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = `900 ${Math.round(dh*0.06)}px sans-serif`; _shadow(ctx, 0.5, 12, 4);
    ctx.fillText('🎁', dw/2, dh*0.46); _clearShadow(ctx);
    ctx.fillStyle = '#000'; ctx.font = `800 ${Math.round(dh*0.04)}px sans-serif`;
    ctx.fillText(head, dw/2, dh*0.75);
    ctx.fillStyle = accent; ctx.font = `600 ${Math.round(dh*0.022)}px sans-serif`;
    ctx.fillText(shop, dw/2, dh*0.85);
  }

  // ── 가격표 5 (1080×1350 / 4:5) — 공통 함수 + 메뉴 배열 ──
  function _drawPriceTable(ctx, dw, dh, title, accent, shop, items) {
    ctx.fillStyle = accent; ctx.fillRect(0, 0, dw, dh*0.15);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
    ctx.font = `800 ${Math.round(dh*0.04)}px sans-serif`; ctx.fillText(title, dw*0.06, dh*0.09);
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(0, dh*0.55, dw, dh*0.45);
    ctx.fillStyle = '#222'; ctx.font = `600 ${Math.round(dh*0.028)}px sans-serif`;
    items.forEach((row, i) => {
      ctx.fillText(row, dw*0.08, dh*0.63 + i*dh*0.06);
    });
    ctx.fillStyle = accent; ctx.font = `500 ${Math.round(dh*0.02)}px sans-serif`;
    ctx.fillText(shop, dw*0.06, dh*0.97);
  }

  // ── 명함 5 (1080×1080 / 1:1) ──
  function _drawCardMinimal(ctx, dw, dh, head, accent, shop) {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, dw, dh);
    ctx.strokeStyle = '#222'; ctx.lineWidth = Math.max(2, dw*0.004);
    ctx.beginPath(); ctx.moveTo(dw*0.1, dh*0.5); ctx.lineTo(dw*0.9, dh*0.5); ctx.stroke();
    ctx.fillStyle = '#222'; ctx.textAlign = 'center';
    ctx.font = `300 ${Math.round(dh*0.04)}px sans-serif`; ctx.fillText(shop, dw/2, dh*0.45);
    ctx.fillStyle = accent; ctx.font = `700 ${Math.round(dh*0.022)}px sans-serif`;
    ctx.fillText(head, dw/2, dh*0.6);
  }
  function _drawCardGold(ctx, dw, dh, head, accent, shop) {
    ctx.fillStyle = '#0e0e10'; ctx.fillRect(0, 0, dw, dh);
    const goldGrad = _grad(ctx, 0, 0, dw, dh, '#fdc66b', '#9a6a1a');
    ctx.strokeStyle = goldGrad; ctx.lineWidth = Math.max(4, dw*0.01);
    _roundRect(ctx, dw*0.08, dh*0.08, dw*0.84, dh*0.84, 24); ctx.stroke();
    ctx.fillStyle = goldGrad; ctx.textAlign = 'center';
    ctx.font = `900 ${Math.round(dh*0.05)}px serif`; ctx.fillText(shop, dw/2, dh*0.48);
    ctx.fillStyle = '#fff'; ctx.font = `400 ${Math.round(dh*0.022)}px sans-serif`;
    ctx.fillText(head, dw/2, dh*0.58);
  }
  function _drawCardPink(ctx, dw, dh, head, accent, shop) {
    ctx.fillStyle = _grad(ctx, 0, 0, dw, dh, '#ffe4ea', '#ffc8d4'); ctx.fillRect(0, 0, dw, dh);
    ctx.fillStyle = '#fff';
    _roundRect(ctx, dw*0.15, dh*0.35, dw*0.7, dh*0.3, 28); ctx.fill();
    ctx.fillStyle = accent; ctx.textAlign = 'center';
    ctx.font = `800 ${Math.round(dh*0.045)}px sans-serif`; ctx.fillText(shop, dw/2, dh*0.5);
    ctx.fillStyle = '#888'; ctx.font = `500 ${Math.round(dh*0.022)}px sans-serif`;
    ctx.fillText(head, dw/2, dh*0.58);
  }
  function _drawCardDark(ctx, dw, dh, head, accent, shop) {
    ctx.fillStyle = '#1a1a1f'; ctx.fillRect(0, 0, dw, dh);
    ctx.fillStyle = accent;
    ctx.fillRect(0, dh*0.4, dw, dh*0.04);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = `300 ${Math.round(dh*0.06)}px sans-serif`; ctx.fillText(shop, dw/2, dh*0.36);
    ctx.fillStyle = accent; ctx.font = `700 ${Math.round(dh*0.025)}px sans-serif`;
    ctx.fillText(head, dw/2, dh*0.52);
  }
  function _drawCardNature(ctx, dw, dh, head, accent, shop) {
    ctx.fillStyle = _grad(ctx, 0, 0, 0, dh, '#f0e8d5', '#d4c9a8'); ctx.fillRect(0, 0, dw, dh);
    // 잎사귀 느낌 라인
    ctx.strokeStyle = '#5d6e3f'; ctx.lineWidth = Math.max(2, dw*0.003);
    ctx.beginPath();
    ctx.moveTo(dw*0.1, dh*0.5); ctx.bezierCurveTo(dw*0.3, dh*0.4, dw*0.5, dh*0.45, dw*0.9, dh*0.5);
    ctx.stroke();
    ctx.fillStyle = '#3a4a23'; ctx.textAlign = 'center';
    ctx.font = `700 ${Math.round(dh*0.04)}px serif`; ctx.fillText(shop, dw/2, dh*0.45);
    ctx.fillStyle = '#5d6e3f'; ctx.font = `400 ${Math.round(dh*0.022)}px sans-serif`;
    ctx.fillText(head, dw/2, dh*0.6);
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
