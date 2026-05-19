/* ─────────────────────────────────────────────────────────────
   매출관리 — 오늘 / 이번주 뷰 (Step 5 · 2026-05-16 리디자인)

   이번달 뷰와 같은 rvm- 톤. 빠른입력 제거.
   - today : hero + by_method 가로바 + 매출 내역
   - week  : hero + 7일 막대 + by_method + 매출 내역
   PC/모바일 공통 구조, PC 만 4스탯 상단 추가.

   외부 API: window.RevenueToday = { renderPC, renderMobile }
   의존: window.Revenue, window.RevenueMonth._ensureStyles
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const TAG_LABEL = { card: '카드', cash: '현금', transfer: '계좌', bank_transfer: '계좌', membership: '회원권', etc: '기타' };
  const METHOD_COLOR = { card: 'var(--bs)', cash: 'var(--brand)', transfer: '#F5A3B0', bank_transfer: '#F5A3B0', membership: '#F8C4CC', etc: '#E5E8EB' };

  function _R() { return window.Revenue || {}; }
  function _ensureStyles() {
    if (window.RevenueMonth && typeof window.RevenueMonth._ensureStyles === 'function') {
      try { window.RevenueMonth._ensureStyles(); } catch (_e) { /* silent */ }
    }
  }

  // ── 유틸 ───────────────────────────────────────────────
  const _esc = (s) => (_R()._esc ? _R()._esc(s) : String(s == null ? '' : s));
  // [2026-05-19] _krw 삭제 → formatMoney (format-money.js 공통 유틸)
  function _sumByMethod(items) {
    const by = {};
    items.forEach(r => {
      let k = (r.method || 'card').toLowerCase();
      if (k === 'bank_transfer') k = 'transfer';
      by[k] = (by[k] || 0) + (r.amount || 0);
    });
    return by;
  }
  function _sortedItems(items) {
    return [...items].sort((a, b) =>
      new Date(b.recorded_at || b.created_at) - new Date(a.recorded_at || a.created_at)
    );
  }
  function _ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function _weekDays(now) {  // 최근 7일 (오늘 마지막)
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate() - i);
      out.push({ key: _ymd(d), d });
    }
    return out;
  }
  function _dayLabel(d, today) {
    const dn = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    const same = today && d.toDateString() === today.toDateString();
    return same ? `${d.getMonth() + 1}/${d.getDate()} 오늘` : `${d.getMonth() + 1}/${d.getDate()} (${dn})`;
  }

  // ── 결제수단 가로바 (PC/모바일 공통) ───────────────────
  function _renderPaymentBars(by_method, total) {
    const order = ['card', 'cash', 'transfer', 'membership', 'etc'];
    const rows = order
      .filter(k => (by_method[k] || 0) > 0)
      .map(k => ({ k, label: TAG_LABEL[k] || k, total: by_method[k] || 0 }))
      .sort((a, b) => b.total - a.total);
    if (!rows.length || !total) {
      return `<div style="font-size:12px;color:#8B95A1;padding:8px 0;">아직 데이터가 없어요</div>`;
    }
    return rows.map(r => {
      const pct = Math.round(r.total * 100 / total);
      const color = METHOD_COLOR[r.k] || '#E5E8EB';
      return `<div class="rvm-barrow">
        <div class="rvm-blabel">${_esc(r.label)}</div>
        <div class="rvm-btrack"><div class="rvm-bfill" style="width:${pct}%;background:${color};"></div></div>
        <div class="rvm-bval">${pct}%</div>
      </div>`;
    }).join('');
  }

  // ── 7일 막대 (week 전용) ───────────────────────────────
  function _renderWeekDays(items, today) {
    const days = _weekDays(today);
    const map = {};
    items.forEach(r => {
      const t = new Date(r.recorded_at || r.created_at);
      if (isNaN(t)) return;
      const k = _ymd(t);
      if (!map[k]) map[k] = { total: 0, count: 0 };
      map[k].total += r.amount || 0;
      map[k].count += 1;
    });
    const maxVal = Math.max(1, ...days.map(d => (map[d.key] && map[d.key].total) || 0));
    return days.map(({ key, d }) => {
      const cell = map[key] || { total: 0, count: 0 };
      const ratio = Math.round(cell.total * 100 / maxVal);
      return `<div class="rvm-dayrow">
        <div class="rvm-dd">${_esc(_dayLabel(d, today))}</div>
        <div class="rvm-db">${cell.total > 0 ? `<div class="rvm-df over" style="width:${ratio}%;"></div>` : ''}</div>
        <div class="rvm-damt">${formatMoney(cell.total)}</div>
        <div class="rvm-dcnt">${cell.count}건</div>
      </div>`;
    }).join('');
  }

  // ── 매출 내역 (today/week 공용, 가벼운 카드 리스트) ─────
  function _renderTransactionList(items, limit) {
    const sorted = _sortedItems(items).slice(0, limit || 10);
    if (!sorted.length) {
      return `<div class="rvm-mcard" style="text-align:center;color:#8B95A1;font-size:13px;padding:18px;">아직 매출 내역이 없어요</div>`;
    }
    const rows = sorted.map(r => {
      const t = new Date(r.recorded_at || r.created_at);
      const time = (t.getMonth() + 1) + '/' + t.getDate() + ' ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
      const isAuto = /\[auto_booking:/.test(r.memo || '');
      const who = r.customer_name ? _esc(r.customer_name) : '제품 판매';
      const svc = r.service_name ? ` · ${_esc(r.service_name)}` : '';
      const methodLbl = TAG_LABEL[r.method] || r.method || '카드';
      // [v201] row 자체에 amount/service/method/date 데이터 박음 — _items 미스매치 방어
      return `<div class="rvm-mli"
          data-rev-id="${r.id}"
          data-rev-amount="${Number(r.amount)||0}"
          data-rev-service="${_esc(r.service_name||'')}"
          data-rev-customer="${_esc(r.customer_name||'')}"
          data-rev-method="${_esc(r.method||'')}"
          data-rev-date="${_esc(String(r.recorded_at||'').slice(0,10))}"
          style="cursor:pointer;">
        <div class="rvm-mdot ${isAuto ? '' : 'man'}"></div>
        <div class="rvm-minf">
          <div class="rvm-mln">${who}${svc}</div>
          <div class="rvm-mlsub">${_esc(time)} · ${_esc(methodLbl)} ${isAuto ? '<span class="rvm-bg au">자동</span>' : '<span class="rvm-bg mn">수동</span>'}</div>
        </div>
        <div class="rvm-mlamt">${formatMoney(r.amount)}</div>
      </div>`;
    }).join('');
    // [v201] 클릭 위임 — document 1회 bind. 매번 render 해도 동작.
    if (!window._rvRowClickBound) {
      window._rvRowClickBound = true;
      document.addEventListener('click', (e) => {
        const row = e.target.closest('[data-rev-id]');
        if (!row) return;
        const id = row.dataset.revId;
        // row 데이터 객체 첨부 (fallback 용)
        const data = {
          id,
          amount:        +row.dataset.revAmount || 0,
          service_name:  row.dataset.revService || '',
          customer_name: row.dataset.revCustomer || '',
          method:        row.dataset.revMethod || '',
          recorded_at:   row.dataset.revDate || '',
        };
        if (typeof window._openRevenueEdit === 'function') window._openRevenueEdit(id, data);
      });
    }
    return `<div class="rvm-mcard" style="padding:0 14px;">${rows}</div>`;
  }

  // ── PC 4-stat ───────────────────────────────────────────
  function _renderPCStats(items, period, displayLabel) {
    const R = _R();
    const total = items.reduce((s, r) => s + (r.amount || 0), 0);
    const count = items.length;
    const avg = count > 0 ? Math.round(total / count) : 0;
    const inc = R._calcIncentive ? R._calcIncentive(total) : { net: total };
    const lbl = displayLabel || (period === 'today' ? '오늘' : (period === 'week' ? '이번주' : period));
    return `
      <div class="rvm-pcg4">
        <div class="rvm-pcstat hi">
          <div class="l">${_esc(lbl)} 매출</div>
          <div class="v">${formatMoney(total)}</div>
          <div class="s">완료 ${count}건</div>
        </div>
        <div class="rvm-pcstat">
          <div class="l">거래 건수</div>
          <div class="v">${count}건</div>
          <div class="s">${_esc(lbl)} 합계</div>
        </div>
        <div class="rvm-pcstat">
          <div class="l">평균 객단가</div>
          <div class="v">${formatMoney(avg)}</div>
          <div class="s">건당 평균</div>
        </div>
        <!-- PROFIT_HIDDEN
        <div class="rvm-pcstat">
          <div class="l">순수익</div>
          <div class="v">${"$"}{formatMoney(inc.net || 0)}</div>
          <div class="s">재료${"$"}{inc.settings ? inc.settings.material_pct : 15}% 기본</div>
        </div>
        -->
      </div>`;
  }

  // ── 모바일 ─────────────────────────────────────────────
  function renderMobile(container, items, period, displayLabel) {
    _ensureStyles();
    const total = items.reduce((s, r) => s + (r.amount || 0), 0);
    const count = items.length;
    const by_method = _sumByMethod(items);
    const lbl = displayLabel || (period === 'today' ? '오늘' : (period === 'week' ? '이번주' : period));
    const weekBlock = period === 'week'
      ? `<div class="rvm-sl">일별 매출</div><div class="rvm-mcard rvm-mpad">${_renderWeekDays(items, new Date())}</div>`
      : '';
    container.innerHTML = `
      <div class="rvm-mbody">
        <div class="rvm-mcard rvm-mmain">
          <div class="ml">${_esc(lbl)} 매출</div>
          <div class="mv">${formatMoney(total)}</div>
          <div class="ms">완료 ${count}건</div>
        </div>
        ${weekBlock}
        <div class="rvm-sl">결제수단</div>
        <div class="rvm-mcard rvm-mpad">${_renderPaymentBars(by_method, total)}</div>
        <div class="rvm-sl">${_esc(lbl)} 매출 내역</div>
        ${_renderTransactionList(items, 20)}
      </div>`;
  }

  // ── PC ─────────────────────────────────────────────────
  function renderPC(container, items, period, displayLabel) {
    _ensureStyles();
    const R = _R();
    const total = items.reduce((s, r) => s + (r.amount || 0), 0);
    const by_method = _sumByMethod(items);
    const lbl = displayLabel || (period === 'today' ? '오늘' : (period === 'week' ? '이번주' : period));
    const weekCard = period === 'week'
      ? `<div class="rvm-cd"><div class="rvm-sl" style="margin-top:0">일별 매출</div>${_renderWeekDays(items, new Date())}</div>`
      : '';
    /* PROFIT_HIDDEN */ const incentive = ''; // 순수익 카드 비활성화
    const layout = period === 'week'
      ? `<div class="rvm-pcg2" style="grid-template-columns:1fr 1fr;">
          <div class="rvm-cd"><div class="rvm-sl" style="margin-top:0">결제수단 분포</div>${_renderPaymentBars(by_method, total)}</div>
          ${weekCard}
        </div>`
      : `<div class="rvm-pcg2">
          <div class="rvm-cd"><div class="rvm-sl" style="margin-top:0">결제수단 분포</div>${_renderPaymentBars(by_method, total)}</div>
          ${incentive}
        </div>`;
    container.innerHTML = (R._renderPCHeaderHTML ? R._renderPCHeaderHTML(period) : '') + `
      <div class="rvm-body">
        ${_renderPCStats(items, period, displayLabel)}
        ${layout}
        <div class="rvm-sl">${_esc(lbl)} 매출 내역</div>
        ${_renderTransactionList(items, 12)}
      </div>`;
  }

  window.RevenueToday = { renderPC, renderMobile };
})();
