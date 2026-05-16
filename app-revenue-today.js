/* ─────────────────────────────────────────────────────────────
   매출관리 — 오늘 / 이번주 뷰 (Step 3A · 2026-05-16)

   기존 app-revenue.js 의 _rerenderMobile / _renderPCMain 등 렌더 로직을 분리.
   month 뷰는 app-revenue-month.js 가 별도 담당.

   외부 API: window.RevenueToday = { renderPC, renderMobile }
   의존: window.Revenue (내부 헬퍼·유틸·데이터)
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function _R() { return window.Revenue; }

  // ── 공통 헬퍼 ───────────────────────────────────────────
  function _sortedItems(items) {
    return [...items].sort((a, b) =>
      new Date(b.recorded_at || b.created_at) - new Date(a.recorded_at || a.created_at)
    );
  }
  function _periodLabel(period) {
    return (_R().PERIOD_LABEL || {})[period] || period;
  }
  function _shopExample() {
    const fn = _R()._rvShopExample;
    return typeof fn === 'function' ? fn() : '시술명';
  }

  // ── 모바일 — 본문 마크업 ───────────────────────────────
  function _renderHeroHTML(total, count, period) {
    const R = _R();
    const monthLbl = `${new Date().getFullYear()}년 ${new Date().getMonth() + 1}월 매출`;
    const heroLbl = period === 'month' ? monthLbl : (_periodLabel(period) + ' 매출');
    return `<div class="rv-hero">
      <div class="rv-hero__label">${R._esc(heroLbl)}</div>
      <div class="rv-hero__value" id="rvHeroValue">${R._formatMan(total)}</div>
      <div class="rv-hero__meta"><div><b>${count}건</b> 거래</div><div class="rv-hero__trend" id="rvHeroTrend"></div></div>
    </div>`;
  }
  function _renderQAMobileHTML() {
    const TAG_LABEL = _R().TAG_LABEL;
    return `<div class="rv-qa" data-rv-qa>
      <input class="rv-qa__input" data-rv-field="amount" type="number" inputmode="numeric" placeholder="금액 입력" />
      <select class="rv-qa__method" data-rv-field="method" data-rv-method-default="card">
        ${['card','cash','transfer','membership'].map(m => `<option value="${m}">${TAG_LABEL[m]}</option>`).join('')}
      </select>
      <button type="button" class="rv-qa__add" data-rv-act="qa-add" aria-label="추가">
        <i class="ph-duotone ph-plus" style="font-size:18px" aria-hidden="true"></i>
      </button>
    </div>`;
  }
  function _renderListItemHTML(r, withStaff, period) {
    const R = _R();
    const t = new Date(r.recorded_at || r.created_at);
    const hhmm = String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
    const dd = String(t.getMonth() + 1) + '월 ' + String(t.getDate());
    const timeLbl = period === 'today' ? hhmm : `${dd} ${hhmm}`;
    const staffLbl = withStaff && r.staff_name ? ` · ${R._esc(r.staff_name)}` : '';
    const tag = R._tagHTML(r.method || 'card');
    return `
      <div class="rv-list__item" data-rid="${R._esc(r.id)}">
        <div class="rv-list__amount">${R._formatMan(r.amount)}</div>
        <div class="rv-list__info">
          <div class="rv-list__service">${R._esc(r.service_name || '—')}</div>
          <div class="rv-list__meta">
            ${tag}
            ${r.customer_name ? `<span class="rv-list__customer">${R._esc(r.customer_name)}</span> · ` : ''}
            ${timeLbl}${staffLbl}
          </div>
        </div>
        <button type="button" class="rv-list__delete" data-rv-act="delete" data-id="${R._esc(r.id)}" aria-label="삭제">
          <i class="ph-duotone ph-trash" style="font-size:14px" aria-hidden="true"></i>
        </button>
      </div>`;
  }
  function _renderListBlockHTML(visible, sortedCount, count, hasMore, withStaff, period) {
    if (!visible.length) return `<div style="padding:30px;text-align:center;color:var(--text-subtle);font-size:13px;">아직 기록이 없어요</div>`;
    const items = visible.map(r => _renderListItemHTML(r, withStaff, period)).join('');
    const more = hasMore ? `<button type="button" class="rv-load-more" data-rv-act="load-more">더 보기 (${sortedCount - _R()._revWindow}건)</button>` : '';
    return `<div class="rv-section-row">
      <div class="rv-section__title">${_periodLabel(period)} 매출 내역</div>
      <div class="rv-section__meta">${count}건${visible.length < count ? ` 중 ${visible.length}건` : ''}</div>
    </div><div class="rv-list">${items}</div>${more}`;
  }
  function _attachCommonHandlers(root, total) {
    const R = _R();
    if (window.Fun && typeof window.Fun.countUp === 'function') {
      const el = root.querySelector('#rvHeroValue, #rvPCStatTotal');
      if (el) {
        try { window.Fun.countUp(el, 0, total, { duration: 720, format: (n) => R._formatMan(Math.round(n)) }); }
        catch (_e) { void _e; }
      }
    }
    root.querySelectorAll('[data-rv-qa] [data-rv-field]').forEach(el => {
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); R._submitQuickAdd(); } });
    });
  }

  function renderMobile(container, items, period) {
    const R = _R();
    const total = items.reduce((s, r) => s + (r.amount || 0), 0);
    const count = items.length;
    const sorted = _sortedItems(items);
    const visible = sorted.slice(0, R._revWindow);
    const hasMore = sorted.length > R._revWindow;
    container.innerHTML =
      _renderHeroHTML(total, count, period) +
      _renderQAMobileHTML() +
      _renderListBlockHTML(visible, sorted.length, count, hasMore, false, period);
    _attachCommonHandlers(container, total);
  }

  // ── PC — 본문 마크업 ───────────────────────────────────
  function _calcPCStats(items, totalForIncentive) {
    const R = _R();
    const total = items.reduce((s, r) => s + (r.amount || 0), 0);
    const count = items.length;
    const avg = count > 0 ? Math.round(total / count) : 0;
    const inc = R._calcIncentive(totalForIncentive != null ? totalForIncentive : total);
    return { total, count, avg, net: inc.net };
  }
  function _renderPCStatsHTML(stats, period) {
    const R = _R();
    const lbl = _periodLabel(period);
    return `
      <div class="rv-pc-stats">
        <div class="rv-pc-stat">
          <div class="rv-pc-stat__label">${lbl} 매출</div>
          <div class="rv-pc-stat__value" id="rvPCStatTotal">${R._formatMan(stats.total)}</div>
          <div class="rv-pc-stat__trend is-neutral">—</div>
        </div>
        <div class="rv-pc-stat">
          <div class="rv-pc-stat__label">거래 건수</div>
          <div class="rv-pc-stat__value">${stats.count}건</div>
          <div class="rv-pc-stat__trend is-neutral">${lbl}</div>
        </div>
        <div class="rv-pc-stat">
          <div class="rv-pc-stat__label">평균 객단가</div>
          <div class="rv-pc-stat__value">${R._formatMan(stats.avg)}</div>
          <div class="rv-pc-stat__trend is-neutral">건당 평균</div>
        </div>
        <div class="rv-pc-stat">
          <div class="rv-pc-stat__label">순수익</div>
          <div class="rv-pc-stat__value" style="color:var(--brand-strong);">${R._formatMan(stats.net)}</div>
          <div class="rv-pc-stat__trend is-neutral">재료15% 기본</div>
        </div>
      </div>`;
  }
  function _renderPCQAHTML() {
    const TAG_LABEL = _R().TAG_LABEL;
    return `
      <div class="rv-pc-qa" data-rv-qa>
        <div class="rv-pc-qa__label">빠른 입력</div>
        <input class="rv-pc-qa__input rv-pc-qa__input--amount" data-rv-field="amount" type="number" inputmode="numeric" placeholder="금액 (예: 45000)" />
        <input class="rv-pc-qa__input" data-rv-field="service_name" list="rvDataService" placeholder="시술 (예: ${_shopExample()})" />
        <input class="rv-pc-qa__input" data-rv-field="customer_name" list="rvDataCustomer" placeholder="고객명" />
        <div class="rv-pc-qa__methods">
          ${['card','cash','transfer','membership'].map((m,i) => `
            <button type="button" class="rv-pc-qa__method${i===0?' is-on':''}" data-rv-pc-method="${m}">${TAG_LABEL[m]}</button>
          `).join('')}
        </div>
        <input type="hidden" data-rv-field="method" data-rv-method-default="card" value="card" />
        <button type="button" class="rv-pc-qa__add" data-rv-act="qa-add">기록</button>
      </div>`;
  }
  function _attachPCMethodToggles(main) {
    main.querySelectorAll('.rv-pc-qa__method').forEach(btn => {
      btn.addEventListener('click', () => {
        main.querySelectorAll('.rv-pc-qa__method').forEach(b => b.classList.remove('is-on'));
        btn.classList.add('is-on');
        const hid = main.querySelector('[data-rv-field="method"]');
        if (hid) hid.value = btn.dataset.rvPcMethod || 'card';
      });
    });
  }

  function renderPC(container, items, period) {
    const R = _R();
    const total = items.reduce((s, r) => s + (r.amount || 0), 0);
    const stats = _calcPCStats(items, total);
    const sorted = _sortedItems(items);
    const visible = sorted.slice(0, R._revWindow);
    const hasMore = sorted.length > R._revWindow;
    container.innerHTML =
      R._renderPCHeaderHTML(period) +
      _renderPCStatsHTML(stats, period) +
      `<div class="rv-pc-grid">${R._renderPCChartShellHTML()}${R._renderIncentiveCardHTML(total, 'margin-bottom:0;')}</div>` +
      _renderPCQAHTML() +
      _renderListBlockHTML(visible, sorted.length, stats.count, hasMore, true, period);
    _attachPCMethodToggles(container);
    _attachCommonHandlers(container, total);
    R._loadDonutAsync(container.querySelector('#rvPCChart'));
  }

  window.RevenueToday = { renderPC, renderMobile };
})();
