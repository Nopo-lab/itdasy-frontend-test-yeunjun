/* 사진 편집기 — 템플릿 마켓 v2 */
(function () {
  'use strict';
  if (window.PhotoEditorTemplatesV2) return;

  const MARKET_DATA = window.PhotoEditorTemplateMarketData || { CATS: [], TEMPLATES: [] };
  const CATS = MARKET_DATA.CATS;
  const TEMPLATES = MARKET_DATA.TEMPLATES;

  let _sheetEl = null;
  let _selectedCat = 'ba';   // v320-B — 전후사진 먼저 노출
  let _searchTerm = '';
  let _selectedTag = '';     // [TPL-2] 업종/용도 필터('' = 전체). 'ind:nail' | 'pur:before_after'
  let _recoIds = [];         // [TPL-3] 잇비 추천 템플릿 id(상단 고정 섹션)
  let _openContext = null;
  const IND_LABEL = MARKET_DATA.INDUSTRY_LABEL || {};
  const PUR_LABEL = MARKET_DATA.PURPOSE_LABEL || {};
  // [TPL-2] 필터칩 목록(전체 + 업종 + 용도). 카드 cat 카테고리와 별개의 교차 필터.
  const TAG_FILTERS = [
    { key: '', label: '전체' },
    { key: 'ind:nail', label: '네일' }, { key: 'ind:hair', label: '헤어' }, { key: 'ind:lash', label: '속눈썹' },
    { key: 'ind:brow', label: '눈썹' }, { key: 'ind:skin', label: '피부' }, { key: 'ind:makeup', label: '메이크업' }, { key: 'ind:common', label: '공통' },
    { key: 'pur:before_after', label: '전후' }, { key: 'pur:review', label: '후기' }, { key: 'pur:event', label: '이벤트' },
    { key: 'pur:booking', label: '예약' }, { key: 'pur:retouch', label: '리터치' }, { key: 'pur:price', label: '가격표' },
    { key: 'pur:story', label: '스토리' }, { key: 'pur:feed', label: '피드' },
  ];

  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  // [TPL-4] Lucide 인라인 SVG (스프라이트 심볼 부재 → 직접 삽입, 이모지 미사용)
  const _LOCK_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  const _SPARK_SVG = '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style="margin-right:1px;"><path d="M12 2l1.8 5.6L19 9l-5.2 1.4L12 16l-1.8-5.6L5 9l5.2-1.4z"/></svg>';

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
    _sheetEl.style.cssText = 'position:fixed;inset:0;background:#111217;z-index:10600;display:none;flex-direction:column;';
    _sheetEl.innerHTML = `
      <style>
        /* v320-A 캔바풍 템플릿 카드 폴리싱 — 다크 프리미엄 테마(studio.css) 기반 (scoped #tplV2Sheet) */
        #tplV2Sheet .tpv2-card { position:relative; border:1px solid rgba(255,250,242,.08); border-radius:14px; overflow:hidden; background:#fff; cursor:pointer; padding:0; text-align:left; box-shadow:0 2px 8px rgba(0,0,0,.35); transition:box-shadow .16s ease, transform .12s ease; -webkit-tap-highlight-color:transparent; }
        #tplV2Sheet .tpv2-card:hover { box-shadow:0 10px 26px rgba(0,0,0,.5); transform:translateY(-2px); }
        #tplV2Sheet .tpv2-card:active { transform:translateY(0) scale(.985); box-shadow:0 3px 10px rgba(0,0,0,.45); }
        #tplV2Sheet .tpv2-thumb { display:flex; align-items:center; justify-content:center; text-align:center; color:#fff; font-weight:700; font-size:14px; line-height:1.32; padding:12px; font-family:Georgia,"Noto Serif KR",serif; letter-spacing:.2px; text-shadow:0 1px 6px rgba(0,0,0,.32); }
        #tplV2Sheet .tpv2-meta { padding:8px 10px 10px; background:#fff; }
        #tplV2Sheet .tpv2-name { font-size:12.5px; font-weight:700; color:#2b2620; }
        #tplV2Sheet .tpv2-sub { font-size:10px; font-weight:600; color:#a89e8d; margin-top:2px; }
        #tplV2Sheet .tpv2-badge { position:absolute; top:8px; left:8px; font-size:9px; font-weight:800; letter-spacing:.5px; padding:3px 7px; border-radius:7px; color:#fff; box-shadow:0 1px 3px rgba(0,0,0,.3); }
        #tplV2Sheet .tpv2-badge.free { background:#1f9d63; }
        #tplV2Sheet .tpv2-badge.pro { background:linear-gradient(135deg,#caa15a,#a9823f); color:#1a160f; }
        #tplV2Sheet .pe-chip-btn { border:1px solid transparent; background:rgba(255,250,242,.08); border-radius:999px; padding:6px 13px; font-size:12.5px; font-weight:600; color:#cfc7b8; white-space:nowrap; cursor:pointer; transition:all .14s ease; }
        #tplV2Sheet .pe-chip-btn.on { background:linear-gradient(135deg,#caa15a,#a9823f); color:#1a160f; }
        #tplV2Sheet .tpv2-hd-title { font-family:Georgia,"Noto Serif KR",serif; font-weight:700; font-size:17px; color:#f7f1e8; white-space:nowrap; }
        #tplV2Sheet .tpv2-hd-sub { font-size:11px; color:#b3aa9a; margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        #tplV2Sheet .tpv2-tagfilter { padding:0 16px 9px; display:flex; gap:6px; overflow-x:auto; -webkit-overflow-scrolling:touch; }
        #tplV2Sheet .tpv2-tagchip { border:1px solid rgba(255,250,242,.14); background:transparent; border-radius:999px; padding:5px 11px; font-size:11.5px; font-weight:600; color:#b3aa9a; white-space:nowrap; cursor:pointer; transition:all .14s ease; }
        #tplV2Sheet .tpv2-tagchip.on { background:#f0e6d4; color:#2b2620; border-color:#f0e6d4; }
        #tplV2Sheet .tpv2-tags { display:flex; flex-wrap:wrap; gap:4px; margin-top:5px; }
        #tplV2Sheet .tpv2-tag { font-size:9.5px; font-weight:700; color:#7d7468; background:#f0ece4; border-radius:5px; padding:2px 6px; }
        #tplV2Sheet .tpv2-empty { grid-column:1/-1; color:#999; padding:28px 12px; text-align:center; font-size:13px; }
        /* [TPL-4] Pro 시각 차별 — 썸네일은 보이되 고급/잠금 느낌. */
        #tplV2Sheet .tpv2-card.is-pro { border-color:rgba(202,161,90,.55); box-shadow:0 2px 10px rgba(169,130,63,.35); }
        #tplV2Sheet .tpv2-card.is-pro .tpv2-thumb::after { content:''; position:absolute; inset:0; background:linear-gradient(180deg,rgba(26,22,15,0) 55%,rgba(26,22,15,.32)); pointer-events:none; }
        #tplV2Sheet .tpv2-thumb { position:relative; }
        #tplV2Sheet .tpv2-badge.pro { letter-spacing:.6px; }            /* Pro 배지 강화(골드 그라데이션 기존 + 자간) */
        #tplV2Sheet .tpv2-lock { position:absolute; top:8px; right:8px; width:22px; height:22px; border-radius:50%; background:rgba(26,22,15,.62); color:#f0e0b8; display:flex; align-items:center; justify-content:center; font-size:11px; z-index:2; }
        #tplV2Sheet .tpv2-provalue { font-size:9.5px; font-weight:700; color:#a9823f; margin-top:3px; display:flex; align-items:center; gap:3px; }
        #tplV2Sheet .tpv2-free-hint { font-size:9.5px; color:#9aa0a6; margin-top:3px; }
      </style>
      <header style="padding:14px 16px;display:flex;align-items:center;gap:10px;">
        <button type="button" id="tpv2Close" style="flex-shrink:0;background:rgba(255,250,242,.12);color:#f7f1e8;border:none;border-radius:10px;padding:9px 15px;font-size:13px;font-weight:600;cursor:pointer;">닫기</button>
        <div style="flex:1;min-width:0;"><div class="tpv2-hd-title">템플릿</div><div class="tpv2-hd-sub">초보 원장님도 바로 쓰는 SNS 디자인</div></div>
        <input type="search" id="tpv2Search" placeholder="검색…" style="flex-shrink:0;width:96px;" />
      </header>
      <div id="tpv2Cats" style="padding:11px 16px;display:flex;gap:7px;overflow-x:auto;-webkit-overflow-scrolling:touch;"></div>
      <div id="tpv2TagFilter" class="tpv2-tagfilter"></div>
      <div id="tpv2Grid" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px;"></div>
    `;
    document.body.appendChild(_sheetEl);
    _sheetEl.querySelector('#tpv2Close').addEventListener('click', () => { _sheetEl.style.display = 'none'; });
    _sheetEl.querySelector('#tpv2Search').addEventListener('input', (e) => { _searchTerm = e.target.value || ''; _renderGrid(); });
    _renderTagFilter();
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

  // [TPL-2] 업종/용도 교차 필터칩. cat 카테고리와 별개로 industry/purpose 로 좁힘.
  function _renderTagFilter() {
    const wrap = _sheetEl.querySelector('#tpv2TagFilter');
    if (!wrap) return;
    // [TPL-2] 매칭 템플릿 0개인 필터칩은 숨김(헷갈림 방지). '전체'는 항상 노출.
    const visible = TAG_FILTERS.filter(f => {
      if (!f.key) return true;
      const [kind, val] = f.key.split(':');
      return TEMPLATES.some(t => kind === 'ind' ? t.industry === val : t.purpose === val);
    });
    wrap.innerHTML = visible.map(f =>
      `<button type="button" class="tpv2-tagchip ${_selectedTag === f.key ? 'on' : ''}" data-tpv2-tag="${f.key}">${_esc(f.label)}</button>`
    ).join('');
    wrap.querySelectorAll('[data-tpv2-tag]').forEach(b => {
      b.addEventListener('click', () => { _selectedTag = b.dataset.tpv2Tag; _renderTagFilter(); _renderGrid(); });
    });
  }

  // 태그 필터 통과 여부('' = 전체, 'ind:x' / 'pur:x').
  function _passTag(t) {
    if (!_selectedTag) return true;
    const [kind, val] = _selectedTag.split(':');
    return kind === 'ind' ? (t.industry === val) : (t.purpose === val);
  }

  // [T-007 2026-05-29] 현재 업종에 맞는 템플릿(id 에 업종 키워드 포함)을 앞으로 정렬.
  //   예: 네일샵이면 price-nail / ba-nail-* 이 같은 카테고리 내에서 먼저 노출.
  function _shopKeyword() {
    try {
      const norm = (typeof window.itdasyNormalizeShopType === 'function')
        ? window.itdasyNormalizeShopType(localStorage.getItem('shop_type') || '') : null;
      const cat = norm && norm.cat;
      const map = { nail: 'nail', hair: 'hair', scalp: 'hair', lash: 'lash', skin: 'skin', makeup: 'makeup', wax: 'wax' };
      return (cat && map[cat]) || '';
    } catch (_e) { return ''; }
  }

  function _renderGrid() {
    const grid = _sheetEl.querySelector('#tpv2Grid');
    const bk = _getBrandKit();
    // [TPL-2] 태그 필터 활성 시 cat 경계를 넘어 전체에서 industry/purpose 로 좁힘(원장이 "네일 전후"를 바로 찾게).
    //   태그 없으면 기존 cat 카테고리 기준. 검색어는 항상 AND.
    const tagActive = !!_selectedTag;
    const filtered = TEMPLATES.filter(t => {
      if (tagActive) { if (!_passTag(t)) return false; }
      else if (t.cat !== _selectedCat) return false;
      if (!_searchTerm) return true;
      return (t.label + ' ' + (t.prefillText || '')).toLowerCase().includes(_searchTerm.toLowerCase());
    });
    // 업종 매칭 우선 (안정 정렬 — 동순위는 원래 순서 유지).
    const kw = _shopKeyword();
    if (kw) {
      filtered
        .map((t, i) => [t, i])
        .sort((a, b) => {
          const am = a[0].id.includes(kw) ? 0 : 1;
          const bm = b[0].id.includes(kw) ? 0 : 1;
          return am - bm || a[1] - b[1];
        })
        .forEach((pair, idx) => { filtered[idx] = pair[0]; });
    }
    // [TPL-3] 추천 섹션 — 잇비 추천 id 있으면 상단 고정(태그/검색 없을 때만).
    const recoTpls = (!tagActive && !_searchTerm && _recoIds.length)
      ? _recoIds.map(id => TEMPLATES.find(t => t.id === id)).filter(Boolean) : [];
    let html = '';
    if (recoTpls.length) {
      html += `<div style="grid-column:1/-1;font-size:12px;font-weight:800;color:#e8d9b8;padding:2px 2px 0;">잇비 추천 ${recoTpls.length}</div>`;
      html += recoTpls.map(t => _cardHtml(t, bk)).join('');
      html += `<div style="grid-column:1/-1;height:1px;background:rgba(255,250,242,.1);margin:4px 0;"></div>`;
      html += `<div style="grid-column:1/-1;font-size:12px;font-weight:700;color:#b3aa9a;padding:2px;">${_esc((CATS.find(c=>c.id===_selectedCat)||{}).label || '전체')} 템플릿</div>`;
    }
    if (!filtered.length && !recoTpls.length) { grid.innerHTML = `<div class="tpv2-empty">해당 조건의 템플릿이 없어요. 다른 업종·용도 칩을 눌러보세요.</div>`; return; }
    html += filtered.map(t => _cardHtml(t, bk)).join('');
    grid.innerHTML = html;
    grid.querySelectorAll('[data-tpv2-tpl]').forEach(b => {
      b.addEventListener('click', () => _openPreview(b.dataset.tpv2Tpl, _openContext));
    });
    _renderThumbs(grid, bk);
  }

  // [TPL-1/2/4] 템플릿 카드 HTML(썸네일+배지+태그+Pro가치). _renderGrid·추천섹션 공용.
  function _cardHtml(t, bk) {
    const color = _accentColor(t.accent, bk);
    const cat = CATS.find(c => c.id === t.cat) || { ratio: '4:5', label: '' };
    const ar = cat.ratio === '9:16' ? '9 / 16' : (cat.ratio === '4:5' ? '4 / 5' : '1 / 1');
    const isFree = t.tier !== 'pro';
    const badge = `<span class="tpv2-badge ${isFree ? 'free' : 'pro'}">${isFree ? 'FREE' : 'PRO'}</span>`;
    const fb = `background:linear-gradient(135deg, ${color}33, ${color});`;
    const indL = IND_LABEL[t.industry], purL = PUR_LABEL[t.purpose];
    const tags = [(t.industry && t.industry !== 'common') ? `<span class="tpv2-tag">#${_esc(indL)}</span>` : '', purL ? `<span class="tpv2-tag">#${_esc(purL)}</span>` : ''].join('');
    const lock = isFree ? '' : `<span class="tpv2-lock" aria-hidden="true">${_LOCK_SVG}</span>`;
    const proLine = isFree ? '' : `<div class="tpv2-provalue">${_SPARK_SVG}${_esc((MARKET_DATA.proValueText && MARKET_DATA.proValueText(t)) || '브랜드형 고급 디자인')}</div>`;
    const freeLine = isFree ? `<div class="tpv2-free-hint">바로 쓰는 기본형</div>` : '';
    return `
      <button type="button" class="tpv2-card ${isFree ? '' : 'is-pro'}" data-tpv2-tpl="${t.id}">
        ${badge}${lock}
        <div class="tpv2-thumb" data-tpv2-thumb="${t.id}" data-tpv2-ratio="${cat.ratio}" data-tpv2-accent="${color}" style="aspect-ratio:${ar};${fb}">${_esc(t.prefillText || t.label)}</div>
        <div class="tpv2-meta"><div class="tpv2-name">${_esc(t.label)}</div><div class="tpv2-sub">${_esc(cat.label)}</div><div class="tpv2-tags">${tags}</div>${proLine}${freeLine}</div>
      </button>
    `;
  }

  // [TPL-1] 카드 썸네일 lazy 렌더 — 보이는 카드만 오프스크린 렌더→이미지 주입. 실패 시 gradient 유지.
  function _renderThumbs(grid, bk) {
    const TH = window.PhotoEditorTemplateThumb;
    if (!TH || !TH.make) return;   // 모듈 없으면 fallback(gradient) 그대로
    const paint = (el) => {
      if (!el || el.dataset.tpv2Done) return;
      const t = TEMPLATES.find(x => x.id === el.dataset.tpv2Thumb);
      if (!t) return;
      const url = TH.make(t, { ratio: el.dataset.tpv2Ratio, accent: el.dataset.tpv2Accent, shopName: bk.shopName, logo: bk.logo });
      if (url) {
        el.style.backgroundImage = `url(${url})`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        el.textContent = '';   // 라벨 텍스트 제거(이미지가 디자인을 보여줌)
      }
      el.dataset.tpv2Done = '1';   // 성공/실패 모두 1회만 시도(실패 시 gradient+라벨 유지)
    };
    const thumbs = grid.querySelectorAll('[data-tpv2-thumb]');
    if (typeof IntersectionObserver === 'function') {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) { paint(e.target); io.unobserve(e.target); } });
      }, { root: grid.closest('#tplV2Sheet') || null, rootMargin: '200px' });
      thumbs.forEach(el => io.observe(el));
    } else {
      thumbs.forEach(paint);
    }
  }

  // [TPL-1] 카드 탭 → 큰 미리보기 시트. Pro 잠금이어도 미리보기는 보임. "적용하기"로 _apply.
  function _editorState() {
    try { return window.PhotoEditor?._internal?.getState?.() || null; }
    catch (_e) { return null; }
  }

  function _ensureEditorForPreview(context) {
    if (_editorState()) return true;
    const c = context || {};
    const src = c.src || c.photo_url || c.dataUrl || c.data_url;
    if (!src || !window.PhotoEditor || typeof window.PhotoEditor.open !== 'function') {
      _toast('편집기를 먼저 열어주세요');
      return false;
    }
    try { if (typeof window.closeAssistant === 'function') window.closeAssistant(); } catch (_e) { void 0; }
    window.PhotoEditor.open({
      src,
      secondSrc: c.secondSrc || c.second_src || null,
      initial_tab: 'template',
      initialState: c.initialState || null,
    });
    return true;
  }

  function _openPreview(tplId, context) {
    if (!_ensureEditorForPreview(context)) return;
    const tpl = TEMPLATES.find(t => t.id === tplId);
    if (!tpl) return;
    const cat = CATS.find(c => c.id === tpl.cat);
    const bk = _getBrandKit();
    const color = _accentColor(tpl.accent, bk);
    const TH = window.PhotoEditorTemplateThumb;
    const isFree = tpl.tier !== 'pro';
    const ar = cat.ratio === '9:16' ? '9 / 16' : (cat.ratio === '4:5' ? '4 / 5' : '1 / 1');
    // 편집 중 사진 있으면 "내 사진으로 미리보기", 없으면 placeholder 썸네일(크게)
    const big = (TH && TH.make) ? TH.make(tpl, { ratio: cat.ratio, accent: color, shopName: bk.shopName, logo: bk.logo, base: 640 }) : null;
    let pv = document.getElementById('tpv2PreviewSheet');
    if (!pv) {
      pv = document.createElement('div'); pv.id = 'tpv2PreviewSheet';
      pv.style.cssText = 'position:fixed;inset:0;z-index:10620;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;padding:24px;';
      document.body.appendChild(pv);
    }
    pv.style.zIndex = '10620';
    document.body.appendChild(pv);
    const imgHtml = big
      ? `<div style="aspect-ratio:${ar};max-height:62vh;border-radius:14px;background:#fff url(${big}) center/contain no-repeat;box-shadow:0 12px 40px rgba(0,0,0,.5);"></div>`
      : `<div style="aspect-ratio:${ar};max-height:62vh;border-radius:14px;background:linear-gradient(135deg,${color}33,${color});display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;">${_esc(tpl.prefillText || tpl.label)}</div>`;
    pv.innerHTML = `
      <div style="background:#1b1b1f;border-radius:20px;padding:18px;max-width:420px;width:100%;text-align:center;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <strong style="color:#fff;font-size:15px;">${_esc(tpl.label)}</strong>
          <span class="tpv2-badge ${isFree ? 'free' : 'pro'}">${isFree ? 'FREE' : 'PRO'}</span>
        </div>
        ${imgHtml}
        <div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center;margin-top:10px;">
          ${(tpl.industry && tpl.industry !== 'common') ? `<span class="tpv2-tag">#${_esc(IND_LABEL[tpl.industry] || '')}</span>` : ''}
          ${PUR_LABEL[tpl.purpose] ? `<span class="tpv2-tag">#${_esc(PUR_LABEL[tpl.purpose])}</span>` : ''}
        </div>
        <div style="color:#e8d9b8;font-size:12px;margin-top:7px;font-weight:600;">${_esc((MARKET_DATA.recommendText && MARKET_DATA.recommendText(tpl)) || '')}</div>
        ${isFree ? '' : `<div style="color:#caa15a;font-size:12px;margin-top:6px;font-weight:700;">${_SPARK_SVG} ${_esc((MARKET_DATA.proValueText && MARKET_DATA.proValueText(tpl)) || '브랜드형 고급 디자인')}</div>`}
        <div style="color:#c5cbd2;font-size:11px;margin-top:3px;">${_esc(cat.label)} · ${cat.ratio}${isFree ? '' : ' · Pro 템플릿'}</div>
        <div style="display:flex;gap:8px;margin-top:14px;">
          <button type="button" id="tpv2PvClose" style="flex:1;padding:12px;border-radius:12px;border:1px solid #3a3a40;background:transparent;color:#c5cbd2;font-weight:700;cursor:pointer;">닫기</button>
          <button type="button" id="tpv2PvApply" style="flex:2;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,${isFree ? 'var(--accent,#D58A95),var(--accent2,#e26a85)' : '#caa15a,#a9823f'});color:${isFree ? '#fff' : '#1a160f'};font-weight:800;cursor:pointer;">${isFree ? '이 템플릿 적용' : 'Pro로 사용'}</button>
        </div>
      </div>`;
    pv.style.display = 'flex';
    pv.onclick = (e) => { if (e.target === pv) pv.style.display = 'none'; };
    pv.querySelector('#tpv2PvClose').onclick = () => { pv.style.display = 'none'; };
    pv.querySelector('#tpv2PvApply').onclick = () => { pv.style.display = 'none'; _applyGated(tplId, isFree); };
  }

  // [TPL-4] Pro 적용 게이트 — 기존 플랜 로직(isPaidPlan) 재사용. 유료면 적용, 무료면 안전 안내(+가능하면 업그레이드 팝업).
  //   결제 신규 연결 안 함. Free 는 기존대로 즉시 적용.
  function _applyGated(tplId, isFree) {
    if (isFree) { _apply(tplId); return; }
    let paid = false;
    try { paid = (typeof window.isPaidPlan === 'function') ? !!window.isPaidPlan() : false; } catch (_e) { paid = false; }
    if (paid) { _apply(tplId); return; }
    _toast('Pro 템플릿은 잇데이 멤버십에서 사용할 수 있어요');
    try { if (typeof window.openPlanPopup === 'function') window.openPlanPopup(); } catch (_e) { void 0; }
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
    if (!state) { _toast('편집기를 먼저 열어주세요'); return; }
    // 비율 설정
    state.ratio = cat.ratio;
    if (state.template) state.template.id = null;
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
    const helpers = PE._internal.helpers || {};
    if (helpers.renderPanel) helpers.renderPanel();
    if (helpers.redraw) helpers.redraw();
    else if (helpers.scheduleRedraw) helpers.scheduleRedraw();
    if (helpers.pushHistory) helpers.pushHistory();
    _toast('템플릿 적용: ' + tpl.label);
    if (_sheetEl) _sheetEl.style.display = 'none';
  }

  function _toast(msg) {
    if (window.toast) window.toast(msg);
    else if (window.PhotoEditor && window.PhotoEditor._internal && window.PhotoEditor._internal.helpers && window.PhotoEditor._internal.helpers.toast) {
      window.PhotoEditor._internal.helpers.toast(msg);
    }
  }

  // [TPL-3] open(initialCat) 또는 open({cat, recommendedIds}). 추천 id 있으면 상단 추천 섹션 고정.
  function _open(arg) {
    _ensureSheet();
    let initialCat = null;
    if (arg && typeof arg === 'object') {
      initialCat = arg.cat || null;
      _recoIds = Array.isArray(arg.recommendedIds) ? arg.recommendedIds.slice(0, 3) : [];
      _openContext = arg;
    } else { initialCat = arg || null; _recoIds = []; _openContext = null; }
    if (initialCat) _selectedCat = initialCat;
    _selectedTag = '';   // 추천/일반 진입 시 태그필터 초기화(혼동 방지)
    _renderCats();
    _renderTagFilter();
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

  function _registerDrawHook() {
    const PE = window.PhotoEditor;
    if (!PE || !PE._internal || !PE._internal.registerDrawHook) {
      setTimeout(_registerDrawHook, 500);
      return;
    }
    PE._internal.registerDrawHook('tplV2_overlay', (ctx, dw, dh, state) => {
      const tpl = state && state.tplV2;
      if (!tpl) return;
      const t = TEMPLATES.find(x => x.id === tpl.id);
      if (!t) return;
      window.PhotoEditorTemplateOverlay?.draw?.(ctx, dw, dh, t, tpl);
    });
  }

  // [CF-2] 잇비 메시지용 — 추천 카드 mini HTML + 큰 미리보기 public 노출.
  //   카드 HTML: 썸네일·배지·이름·태그·Pro가치(TPL-1/2/4 _cardHtml 재사용). data-tpv2-tpl 로 클릭 식별.
  function recoCardHtml(tplId) {
    var t = TEMPLATES.find(function (x) { return x.id === tplId; });
    if (!t) return '';
    var bk = _getBrandKit();
    var color = _accentColor(t.accent, bk);
    var cat = CATS.find(function (c) { return c.id === t.cat; }) || { ratio: '4:5', label: '' };
    var ar = cat.ratio === '9:16' ? '9 / 16' : (cat.ratio === '4:5' ? '4 / 5' : '1 / 1');
    var isFree = t.tier !== 'pro';
    var indL = IND_LABEL[t.industry], purL = PUR_LABEL[t.purpose];
    var tagTxt = [(t.industry && t.industry !== 'common') ? '#' + indL : '', purL ? '#' + purL : ''].filter(Boolean).join(' ');
    var badgeBg = isFree ? '#1f9d63' : 'linear-gradient(135deg,#caa15a,#a9823f)';
    var badgeColor = isFree ? '#fff' : '#1a160f';
    var proVal = isFree ? '바로 쓰는 기본형' : ((MARKET_DATA.proValueText && MARKET_DATA.proValueText(t)) || '브랜드형 고급 디자인');
    var proColor = isFree ? '#8B95A1' : '#a9823f';
    // 흰 채팅 배경용 자체 인라인 스타일 mini 카드. data-tpv2-thumb 로 썸네일 주입, data-tpv2-tpl 로 클릭.
    return '<button type="button" data-tpv2-tpl="' + _esc(t.id) + '" style="position:relative;border:1px solid #E5E8EB;border-radius:12px;overflow:hidden;background:#fff;cursor:pointer;padding:0;text-align:left;box-shadow:0 1px 4px rgba(0,0,0,.08);">'
      + '<span style="position:absolute;top:6px;left:6px;z-index:2;font-size:8.5px;font-weight:800;padding:2px 6px;border-radius:6px;background:' + badgeBg + ';color:' + badgeColor + ';">' + (isFree ? 'FREE' : 'PRO') + '</span>'
      + '<div data-tpv2-thumb="' + _esc(t.id) + '" data-tpv2-ratio="' + cat.ratio + '" data-tpv2-accent="' + color + '" style="aspect-ratio:' + ar + ';background:linear-gradient(135deg,' + color + '33,' + color + ');display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700;text-align:center;padding:6px;">' + _esc(t.prefillText || t.label) + '</div>'
      + '<div style="padding:6px 7px 8px;"><div style="font-size:11px;font-weight:700;color:#2b2620;line-height:1.25;">' + _esc(t.label) + '</div>'
      + (tagTxt ? '<div style="font-size:9px;color:#7d7468;margin-top:2px;">' + _esc(tagTxt) + '</div>' : '')
      + '<div style="font-size:9px;color:' + proColor + ';font-weight:700;margin-top:3px;">' + _esc(proVal) + '</div></div>'
      + '</button>';
  }
  // 잇비가 추천 카드 영역을 그린 뒤, 그 컨테이너에 썸네일 즉시 주입 + 클릭→미리보기 바인딩.
  //   추천 카드는 3개뿐 + 어시스턴트 시트 안 → IO root 불일치 회피 위해 즉시 paint.
  function bindRecoCards(containerEl, context) {
    if (!containerEl) return;
    var TH = window.PhotoEditorTemplateThumb, bk = _getBrandKit();
    containerEl.querySelectorAll('[data-tpv2-thumb]').forEach(function (el) {
      if (TH && TH.make && !el.dataset.tpv2Done) {
        try {
          var t = TEMPLATES.find(function (x) { return x.id === el.dataset.tpv2Thumb; });
          var url = t && TH.make(t, { ratio: el.dataset.tpv2Ratio, accent: el.dataset.tpv2Accent, shopName: bk.shopName, logo: bk.logo });
          if (url) { el.style.backgroundImage = 'url(' + url + ')'; el.style.backgroundSize = 'cover'; el.style.backgroundPosition = 'center'; el.textContent = ''; }
        } catch (_e) { void 0; }
        el.dataset.tpv2Done = '1';
      }
    });
    containerEl.querySelectorAll('[data-tpv2-tpl]').forEach(function (b) {
      b.addEventListener('click', function () { _openPreview(b.dataset.tpv2Tpl, context || _openContext); });
    });
  }
  function openPreview(tplId, context) { _ensureSheet(); _openPreview(tplId, context || _openContext); }

  window.PhotoEditorTemplatesV2 = { open: _open, apply: _apply, openPreview, recoCardHtml, bindRecoCards, TEMPLATES, CATS };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _watchPanel);
  } else _watchPanel();
})();
