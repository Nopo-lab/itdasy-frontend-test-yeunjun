/* 매출 관리 v5 — 3탭 + 도넛 + 인센티브 + 빠른 추가 + PC 레이아웃
   mockup: ../mockups/05-revenue.html · styles: css/screens/revenue-v5.css
   외부: openRevenue/closeRevenue, window.Revenue, window._revenueBack */
(function () {
  'use strict';

  const OFFLINE_KEY = 'itdasy_revenue_offline_v1';
  const PERIODS = ['today', 'week', 'month'];
  const PERIOD_LABEL = { today: '오늘', week: '이번주', month: '이번달' };
  const PC_BREAKPOINT = 1100;

  const TAG_CLS = {
    card: 'rv-tag--card', cash: 'rv-tag--cash',
    transfer: 'rv-tag--transfer', bank_transfer: 'rv-tag--transfer',
    membership: 'rv-tag--membership',
  };
  const TAG_LABEL = {
    card: '카드', cash: '현금', transfer: '계좌',
    bank_transfer: '계좌', membership: '회원권', etc: '기타',
  };
  const DONUT_COLORS = ['#E5586E', '#F4A6B8', '#FBE0E7', '#C4C9D1', '#E5E7EB'];

  let _currentPeriod = 'month';
  let _items = [];
  let _revWindow = 50;
  let _isOffline = false;
  let _cachedIsPC = false;
  const _periodInflight = {};

  // ── 유틸 ────────────────────────────────────────────────
  const _now = () => new Date().toISOString();
  const _uuid = () => (crypto?.randomUUID ? crypto.randomUUID() : 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10));
  const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  const _isPC = () => window.innerWidth >= PC_BREAKPOINT;
  const _formatMan = (n) => {
    const v = +n || 0;
    if (v >= 10000) return (v / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '만원';
    return v.toLocaleString('ko-KR') + '원';
  };
  const _tagHTML = (m) => `<span class="rv-tag ${TAG_CLS[m] || ''}">${TAG_LABEL[m] || _esc(m || '카드')}</span>`;

  // ── 기간 계산 ────────────────────────────────────────────
  function _periodRange(period, baseDate) {
    const now = baseDate ? new Date(baseDate) : new Date();
    const start = new Date(now);
    const end = new Date(now);
    if (period === 'today') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (period === 'week') {
      const day = start.getDay();
      const mondayOffset = (day + 6) % 7;
      start.setDate(start.getDate() - mondayOffset);
      start.setHours(0, 0, 0, 0);
      end.setTime(start.getTime() + 7 * 24 * 3600 * 1000 - 1);
    } else {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(end.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
    }
    return { start, end };
  }

  // ── 오프라인 스토어 ─────────────────────────────────────
  const _loadOffline = () => { try { return JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]'); } catch (_) { return []; } };
  const _saveOffline = (list) => { try { localStorage.setItem(OFFLINE_KEY, JSON.stringify(list)); } catch (_) { void _; } };

  // ── 네트워크 ────────────────────────────────────────────
  async function _api(method, path, body) {
    if (!window.API || !window.authHeader) throw new Error('no-auth');
    const auth = window.authHeader();
    if (!auth?.Authorization) throw new Error('no-token');
    const opts = { method, headers: { ...auth, 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(window.API + path, opts);
    if (res.status === 404 || res.status === 501) throw new Error('endpoint-missing');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.status === 204 ? null : await res.json();
  }

  // ── SWR 캐시 ────────────────────────────────────────────
  const _SWR_TTL = 60 * 1000;
  const _swrKey = (p) => 'pv_cache::revenue::' + p;
  function _readSWRPeriod(p) {
    try {
      const raw = localStorage.getItem(_swrKey(p)) || sessionStorage.getItem(_swrKey(p));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      return { items: obj.d, age: Date.now() - obj.t, fresh: Date.now() - obj.t < _SWR_TTL };
    } catch (_) { return null; }
  }
  function _writeSWRPeriod(p, items) {
    try {
      const payload = JSON.stringify({ t: Date.now(), d: items });
      try { localStorage.setItem(_swrKey(p), payload); }
      catch (_) { try { sessionStorage.setItem(_swrKey(p), payload); } catch (_e) { void _e; } }
    } catch (_) { /* silent */ }
  }
  function _clearSWRRevenue() {
    try {
      ['today', 'week', 'month'].forEach(p => {
        try { localStorage.removeItem(_swrKey(p)); sessionStorage.removeItem(_swrKey(p)); } catch (_e) { void _e; }
      });
      try { localStorage.removeItem('pv_cache::revenue'); sessionStorage.removeItem('pv_cache::revenue'); } catch (_e) { void _e; }
    } catch (_) { /* silent */ }
  }

  async function _fetchPeriodData(p) {
    if (_periodInflight[p]) return _periodInflight[p];
    _periodInflight[p] = _api('GET', '/revenue?period=' + p)
      .then(d => {
        const items = d.items || [];
        _writeSWRPeriod(p, items);
        return items;
      })
      .finally(() => { _periodInflight[p] = null; });
    return _periodInflight[p];
  }

  async function _fetchPeriod(p) {
    const items = await _fetchPeriodData(p);
    _isOffline = false;
    _items = items;
    return _items;
  }

  function _prefetchAllPeriods() {
    PERIODS.forEach(p => {
      if (p === _currentPeriod) return;
      const swr = _readSWRPeriod(p);
      if (swr && swr.fresh) return;
      _fetchPeriodData(p).catch(() => {});
    });
  }

  async function list(period) {
    const p = PERIODS.includes(period) ? period : 'today';
    const swr = _readSWRPeriod(p);
    if (swr) {
      _items = swr.items;
      if (!swr.fresh) {
        _fetchPeriod(p).then(fresh => {
          // [BUG-R2-4] JSON.stringify 전체 비교 제거 — 건수/첫ID 간이 비교로 전환
          if (fresh.length !== _items.length || (fresh[0] && _items[0] && fresh[0].id !== _items[0].id)) {
            _items = fresh;
            try { _rerender && _rerender(); } catch (_e) { void _e; }
          }
        }).catch(() => {});
      }
      return _items;
    }
    try {
      return await _fetchPeriod(p);
    } catch (e) {
      if (e.message === 'endpoint-missing' || e.message === 'no-token') {
        _isOffline = true;
        const { start, end } = _periodRange(p);
        const all = _loadOffline();
        _items = all.filter(r => {
          const t = new Date(r.recorded_at || r.created_at).getTime();
          if (!t || isNaN(t)) return true;  // [BUG-R2-4] 날짜 없는 항목은 포함
          return t >= start.getTime() && t <= end.getTime();
        });
        return _items;
      }
      throw e;
    }
  }

  async function create(payload) {
    if (!payload || !(+payload.amount > 0)) throw new Error('amount-required');
    const data = {
      amount: Math.round(+payload.amount),
      method: payload.method || 'card',
      service_name: payload.service_name ? String(payload.service_name).slice(0, 50) : null,
      customer_id: payload.customer_id || null,
      customer_name: payload.customer_name || null,
      memo: payload.memo ? String(payload.memo).slice(0, 200) : null,
      recorded_at: payload.recorded_at || _now(),
    };
    if (_isOffline) {
      const record = { id: _uuid(), shop_id: localStorage.getItem('shop_id') || 'offline', ...data, created_at: _now() };
      const all = _loadOffline(); all.unshift(record); _saveOffline(all);
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'create_revenue', optimistic: false } })); } catch (_e) { void _e; }
      return record;
    }
    const optimistic = { id: '__opt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), shop_id: localStorage.getItem('shop_id') || '', ...data, created_at: _now(), _optimistic: true };
    _items.unshift(optimistic);
    try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'create_revenue', optimistic: true } })); } catch (_e) { void _e; }
    try {
      const created = await _api('POST', '/revenue', data);
      const idx = _items.findIndex(r => r.id === optimistic.id);
      if (idx >= 0) _items[idx] = created;
      else _items.unshift(created);
      _clearSWRRevenue();
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'create_revenue', optimistic: false } })); } catch (_e) { void _e; }
      return created;
    } catch (err) {
      _items = _items.filter(r => r.id !== optimistic.id);
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'create_revenue', optimistic: false, rollback: true } })); } catch (_e) { void _e; }
      if (window.showToast) window.showToast('매출 저장 실패 — 다시 시도해주세요');
      throw err;
    }
  }

  async function remove(id) {
    if (_isOffline) {
      const all = _loadOffline().filter(r => r.id !== id);
      _saveOffline(all);
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'delete_revenue', optimistic: false } })); } catch (_e) { void _e; }
      return { ok: true };
    }
    await _api('DELETE', '/revenue/' + id);
    _items = _items.filter(r => r.id !== id);
    _clearSWRRevenue();
    try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'delete_revenue', optimistic: false } })); } catch (_e) { void _e; }
    return { ok: true };
  }

  // ── 인센티브 ────────────────────────────────────────────
  const INCENTIVE_KEY = 'itdasy_incentive_settings_v1';
  function _incentiveSettings() {
    try { const raw = localStorage.getItem(INCENTIVE_KEY); if (raw) return JSON.parse(raw); } catch (_) { void _; }
    return { material_pct: 15, fixed_monthly: 0 };
  }
  function _calcIncentive(totalKRW) {
    const s = _incentiveSettings();
    const material = Math.round(totalKRW * (s.material_pct / 100));
    return { gross: totalKRW, material, fixed: s.fixed_monthly || 0, net: totalKRW - material - (s.fixed_monthly || 0), settings: s };
  }
  function _openIncentiveSettings() {
    const s = _incentiveSettings();
    const pct = prompt('재료비율 (%) — 매출 중 재료비로 차감할 비율', String(s.material_pct));
    if (pct === null) return;
    const fixed = prompt('월 고정비 (원) — 월세·통신·보험 등', String(s.fixed_monthly));
    if (fixed === null) return;
    const np = Math.max(0, Math.min(100, parseFloat(pct) || 0));
    const nf = Math.max(0, parseInt(fixed, 10) || 0);
    try { localStorage.setItem(INCENTIVE_KEY, JSON.stringify({ material_pct: np, fixed_monthly: nf })); } catch (_) { void _; }
    if (window.showToast) window.showToast('설정 저장됨');
    _rerender();
  }

  // ── 도넛 + 레전드 (CSS conic-gradient) ───────────────────
  function _renderDonut(breakdown, opts) {
    const total = breakdown && breakdown.total ? breakdown.total : 0;
    if (!total) {
      return `<div class="rv-chart__body"><div class="rv-donut" style="background:var(--surface-2);"><div class="rv-donut__center"><div class="rv-donut__total">—</div><div class="rv-donut__label">데이터 없음</div></div></div><div class="rv-legend"><div class="rv-legend__row"><span class="rv-legend__name">기록을 추가하면 표시돼요</span></div></div></div>`;
    }
    const order = ['card', 'cash', 'transfer', 'bank_transfer', 'membership', 'etc'];
    const rowsAll = order
      .filter(k => breakdown.by_method && breakdown.by_method[k])
      .map(k => ({ k, label: TAG_LABEL[k] || k, total: (breakdown.by_method[k] || {}).total || 0, count: (breakdown.by_method[k] || {}).count || 0 }))
      .filter(x => x.total > 0)
      .sort((a, b) => b.total - a.total);
    if (!rowsAll.length) {
      return `<div class="rv-chart__body"><div class="rv-donut" style="background:var(--surface-2);"></div><div class="rv-legend"><div class="rv-legend__row"><span class="rv-legend__name">데이터 없음</span></div></div></div>`;
    }
    let acc = 0;
    const slices = rowsAll.map((m, i) => {
      const start = acc;
      acc += m.total / total;
      m.color = DONUT_COLORS[Math.min(i, DONUT_COLORS.length - 1)];
      return `${m.color} ${(start * 360).toFixed(2)}deg ${(acc * 360).toFixed(2)}deg`;
    }).join(', ');
    const centerLbl = (opts && opts.centerLabel) || '합계';
    const legend = rowsAll.map(m =>
      `<div class="rv-legend__row"><span class="rv-legend__dot" style="background:${m.color};"></span><span class="rv-legend__name">${_esc(m.label)}</span><span class="rv-legend__value">${_formatMan(m.total)}</span><span class="rv-legend__pct">${Math.round(m.total * 100 / total)}%</span></div>`
    ).join('');
    return `<div class="rv-chart__body"><div class="rv-donut" style="background:conic-gradient(${slices});"><div class="rv-donut__center"><div class="rv-donut__total">${_formatMan(total)}</div><div class="rv-donut__label">${_esc(centerLbl)}</div></div></div><div class="rv-legend">${legend}</div></div>`;
  }

  // ── 인센티브 카드 마크업 ─────────────────────────────────
  function _renderIncentiveCardHTML(totalKRW, extraStyle) {
    const c = _calcIncentive(totalKRW);
    return `
      <div class="rv-incentive" ${extraStyle ? `style="${extraStyle}"` : ''}>
        <div class="rv-incentive__head">
          <div class="rv-incentive__title">이번달 순수익</div>
          <button type="button" class="rv-incentive__config" data-rv-act="incentive-cfg">⚙ 설정</button>
        </div>
        <div class="rv-incentive__net">${_formatMan(c.net)}</div>
        <div class="rv-incentive__formula">
          <div class="rv-incentive__formula-item">매출 <b>${_formatMan(c.gross)}</b></div>
          <div class="rv-incentive__formula-item">- 재료비(${c.settings.material_pct}%) <b>${_formatMan(c.material)}</b></div>
          ${c.fixed > 0 ? `<div class="rv-incentive__formula-item">- 고정비 <b>${_formatMan(c.fixed)}</b></div>` : ''}
        </div>
      </div>`;
  }

  // ── 시트 (overlay) ──────────────────────────────────────
  function _ensureSheet() {
    let sheet = document.getElementById('revenueSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'revenueSheet';
    sheet.className = 'rv-screen';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9000;display:none;background:var(--bg);flex-direction:column;';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    document.body.appendChild(sheet);
    sheet.addEventListener('click', _onRootClick);
    sheet.addEventListener('keydown', _onRootKeydown);
    return sheet;
  }

  function _onRootKeydown(e) {
    if (e.key === 'Escape') { e.preventDefault(); window.closeRevenue(); }
  }

  function _onRootClick(e) {
    const btn = e.target.closest('[data-rv-act]');
    if (!btn) return;
    const act = btn.dataset.rvAct;
    if (act === 'close') return window.closeRevenue();
    if (act === 'period') {
      const p = btn.dataset.period;
      if (!PERIODS.includes(p) || p === _currentPeriod) return;
      _currentPeriod = p;
      _revWindow = 50;
      _loadAndRender();
      _prefetchAllPeriods();
      return;
    }
    if (act === 'incentive-cfg') return _openIncentiveSettings();
    if (act === 'qa-add') return _submitQuickAdd();
    if (act === 'add-form') return _openAddForm();
    if (act === 'load-more') { _revWindow += 50; _rerender(); return; }
    if (act === 'delete') { const id = btn.dataset.id; if (id) _deleteEntry(id); return; }
    if (act === 'side-go') {
      const target = btn.dataset.go;
      window.closeRevenue();
      try {
        if (target === 'goHome' && typeof window.goHome === 'function') window.goHome();
        else if (target === 'goMyshop' && typeof window.goMyshop === 'function') window.goMyshop();
        else if (target === 'booking' && typeof window.openCalendarView === 'function') window.openCalendarView();
        else if (target === 'customer' && typeof window.openCustomerHub === 'function') window.openCustomerHub();
        else if (target === 'inventory' && typeof window.openInventoryHub === 'function') window.openInventoryHub();
        else if (target === 'aiHub' && typeof window.openAIHub === 'function') window.openAIHub();
        else if (target === 'settings' && typeof window.openSettingsHub === 'function') window.openSettingsHub();
      } catch (_e) { void _e; }
      return;
    }
  }

  // ── 마크업: 모바일 ──────────────────────────────────────
  function _mobileLayoutHTML() {
    return `
      <div class="rv-header">
        <button type="button" class="rv-header__back" data-rv-act="close" aria-label="뒤로가기">
          <i class="ph-duotone ph-caret-left" style="font-size:14px" aria-hidden="true"></i>
        </button>
        <div class="rv-header__title-wrap">
          <div class="rv-header__title">매출관리</div>
          <div class="rv-header__sub" id="rvOfflineBadge" style="display:none;color:var(--danger);">오프라인</div>
        </div>
        <button type="button" class="rv-header__action" data-rv-act="add-form">+ 입력</button>
      </div>
      <div class="rv-periods">
        <div class="rv-periods__row">
          ${PERIODS.map(p => `<button type="button" class="rv-periods__btn${p === _currentPeriod ? ' is-on' : ''}" data-rv-act="period" data-period="${p}">${PERIOD_LABEL[p]}</button>`).join('')}
        </div>
      </div>
      <div class="rv-body" id="rvBody"></div>
      <button type="button" class="rv-fab" data-rv-act="add-form" aria-label="매출 입력">
        <i class="ph-duotone ph-plus" style="font-size:22px" aria-hidden="true"></i>
      </button>
      <datalist id="rvDataCustomer"></datalist>
      <datalist id="rvDataService"></datalist>`;
  }

  // ── 마크업: PC ──────────────────────────────────────────
  function _pcSidebarHTML() {
    const item = (act, iconId, label, active) => `
      <button type="button" class="ms-side__item${active ? ' is-active' : ''}" data-rv-act="side-go" data-go="${act}"${active ? ' aria-current="page"' : ''}>
        <span class="ms-side__icon"><svg width="18" height="18" aria-hidden="true"><use href="#${iconId}"/></svg></span>
        <span class="ms-side__label">${_esc(label)}</span>
      </button>`;
    return `
      <aside class="ms-side" aria-label="매출관리 사이드바">
        <div class="ms-side__logo">잇데이</div>
        ${item('goHome', 'ic-home', '홈', false)}
        ${item('goMyshop', 'ic-store', '내샵관리', false)}
        <div class="ms-side__section">운영</div>
        ${item('booking', 'ic-calendar', '예약관리', false)}
        ${item('customer', 'ic-users', '고객관리', false)}
        ${item('revenue', 'ic-dollar-sign', '매출관리', true)}
        ${item('inventory', 'ic-package', '재고관리', false)}
        <div class="ms-side__section">통합 허브</div>
        ${item('aiHub', 'ic-sparkles', 'AI · 자동화', false)}
        ${item('settings', 'ic-settings', '설정 · 연동', false)}
      </aside>`;
  }

  function _pcLayoutHTML() {
    return `
      <div class="ms-root" style="flex-direction:row;min-height:100vh;">
        ${_pcSidebarHTML()}
        <div class="rv-pc" id="rvPCMain" style="display:block;flex:1;"></div>
      </div>
      <datalist id="rvDataCustomer"></datalist>
      <datalist id="rvDataService"></datalist>`;
  }

  // ── 렌더 디스패처 ────────────────────────────────────────
  async function _renderRoot() {
    const sheet = _ensureSheet();
    _cachedIsPC = _isPC();
    if (_cachedIsPC) {
      sheet.classList.add('rv-screen--pc');
      sheet.style.flexDirection = 'row';
      sheet.innerHTML = _pcLayoutHTML();
    } else {
      sheet.classList.remove('rv-screen--pc');
      sheet.style.flexDirection = 'column';
      sheet.innerHTML = _mobileLayoutHTML();
    }
  }

  // ── 빠른추가 (모바일/PC 공통) ────────────────────────────
  function _qaContainer() {
    const sheet = document.getElementById('revenueSheet');
    if (!sheet) return null;
    return sheet.querySelector('[data-rv-qa]');
  }
  function _readQA() {
    const c = _qaContainer();
    if (!c) return null;
    const v = {};
    c.querySelectorAll('[data-rv-field]').forEach(el => { v[el.dataset.rvField] = el.value.trim(); });
    return v;
  }
  function _resetQA() {
    const c = _qaContainer();
    if (!c) return;
    c.querySelectorAll('[data-rv-field]').forEach(el => {
      el.value = el.dataset.rvField === 'method' ? (el.dataset.rvMethodDefault || 'card') : '';
    });
    const focusEl = c.querySelector('[data-rv-field="amount"]');
    if (focusEl) focusEl.focus();
  }
  async function _submitQuickAdd() {
    const v = _readQA();
    if (!v) return;
    const amount = parseInt(v.amount, 10);
    if (!amount || amount <= 0) {
      const c = _qaContainer();
      const amtEl = c && c.querySelector('[data-rv-field="amount"]');
      if (amtEl) amtEl.focus();
      if (window.showToast) window.showToast('금액을 입력해 주세요');
      return;
    }
    try {
      await create({
        amount,
        method: v.method || 'card',
        customer_name: v.customer_name || null,
        service_name: v.service_name || null,
      });
      if (window.Fun && typeof window.Fun.confetti === 'function') {
        try { const btn = _qaContainer()?.querySelector('[data-rv-act="qa-add"]'); if (btn) window.Fun.confetti(btn); } catch (_e) { void _e; }
      }
      if (window.showToast) window.showToast(`매출 +${amount.toLocaleString()}원`);
      _resetQA();
      await _loadAndRender();
    } catch (e) {
      console.warn('[revenue] qa-add 실패:', e);
      if (window.showToast) window.showToast('저장 실패 — 다시 시도해 주세요');
    }
  }

  // ── 모바일 본문 렌더 ─────────────────────────────────────
  function _renderHeroHTML(total, count) {
    const monthLbl = `${new Date().getFullYear()}년 ${new Date().getMonth() + 1}월 매출`;
    const heroLbl = _currentPeriod === 'month' ? monthLbl : (PERIOD_LABEL[_currentPeriod] + ' 매출');
    return `<div class="rv-hero">
      <div class="rv-hero__label">${_esc(heroLbl)}</div>
      <div class="rv-hero__value" id="rvHeroValue">${_formatMan(total)}</div>
      <div class="rv-hero__meta"><div><b>${count}건</b> 거래</div><div class="rv-hero__trend" id="rvHeroTrend"></div></div>
    </div>`;
  }
  function _renderChartShellHTML() {
    return `<div class="rv-chart" id="rvChart">
      <div class="rv-chart__head"><div><div class="rv-chart__title">결제 방식별 분포</div><div class="rv-chart__sub">불러오는 중…</div></div></div>
      <div class="rv-chart__body"><div class="rv-donut" style="background:var(--surface-2);"></div><div class="rv-legend"></div></div>
    </div>`;
  }
  function _renderQAMobileHTML() {
    return `<div class="rv-qa" data-rv-qa>
      <input class="rv-qa__input" data-rv-field="amount" type="number" inputmode="numeric" placeholder="금액 입력" />
      <select class="rv-qa__method" data-rv-field="method" data-rv-method-default="card">
        <option value="card">카드</option><option value="cash">현금</option><option value="transfer">계좌</option><option value="membership">회원권</option>
      </select>
      <button type="button" class="rv-qa__add" data-rv-act="qa-add" aria-label="추가">
        <i class="ph-duotone ph-plus" style="font-size:18px" aria-hidden="true"></i>
      </button>
    </div>`;
  }
  function _renderListBlockHTML(visible, sorted, count, hasMore, withStaff) {
    if (!visible.length) return `<div style="padding:30px;text-align:center;color:var(--text-subtle);font-size:13px;">아직 기록이 없어요</div>`;
    const items = visible.map(r => _renderListItemHTML(r, withStaff)).join('');
    const more = hasMore ? `<button type="button" class="rv-load-more" data-rv-act="load-more">더 보기 (${sorted.length - _revWindow}건)</button>` : '';
    return `<div class="rv-section-row">
      <div class="rv-section__title">${PERIOD_LABEL[_currentPeriod]} 매출 내역</div>
      <div class="rv-section__meta">${count}건${visible.length < count ? ` 중 ${visible.length}건` : ''}</div>
    </div><div class="rv-list">${items}</div>${more}`;
  }
  function _attachCommonHandlers(root, total) {
    if (window.Fun && typeof window.Fun.countUp === 'function') {
      const el = root.querySelector('#rvHeroValue, #rvPCStatTotal');
      if (el) {
        try { window.Fun.countUp(el, 0, total, { duration: 720, format: (n) => _formatMan(Math.round(n)) }); }
        catch (_e) { void _e; }
      }
    }
    root.querySelectorAll('[data-rv-qa] [data-rv-field]').forEach(el => {
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); _submitQuickAdd(); } });
    });
  }
  function _rerenderMobile() {
    const sheet = document.getElementById('revenueSheet');
    if (!sheet) return;
    const bodyEl = sheet.querySelector('#rvBody');
    if (!bodyEl) return;
    sheet.querySelectorAll('.rv-periods__btn').forEach(b => b.classList.toggle('is-on', b.dataset.period === _currentPeriod));
    const total = _items.reduce((s, r) => s + (r.amount || 0), 0);
    const count = _items.length;
    const offlineBadge = sheet.querySelector('#rvOfflineBadge');
    if (offlineBadge) offlineBadge.style.display = _isOffline ? 'block' : 'none';
    const sorted = [..._items].sort((a, b) => new Date(b.recorded_at || b.created_at) - new Date(a.recorded_at || a.created_at));
    const visible = sorted.slice(0, _revWindow);
    const hasMore = sorted.length > _revWindow;
    const monthBlock = _currentPeriod === 'month' ? (_renderChartShellHTML() + _renderIncentiveCardHTML(total)) : '';
    bodyEl.innerHTML = _renderHeroHTML(total, count) + monthBlock + _renderQAMobileHTML() + _renderListBlockHTML(visible, sorted, count, hasMore, false);
    _attachCommonHandlers(bodyEl, total);
    if (_currentPeriod === 'month') _loadDonutAsync(bodyEl.querySelector('#rvChart'));
  }

  function _renderListItemHTML(r, withStaff) {
    const t = new Date(r.recorded_at || r.created_at);
    const hhmm = String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
    const dd = String(t.getMonth() + 1) + '월 ' + String(t.getDate());
    const timeLbl = _currentPeriod === 'today' ? hhmm : `${dd} ${hhmm}`;
    const staffLbl = withStaff && r.staff_name ? ` · ${_esc(r.staff_name)}` : '';
    const tag = _tagHTML(r.method || 'card');
    return `
      <div class="rv-list__item" data-rid="${_esc(r.id)}">
        <div class="rv-list__amount">${_formatMan(r.amount)}</div>
        <div class="rv-list__info">
          <div class="rv-list__service">${_esc(r.service_name || '—')}</div>
          <div class="rv-list__meta">
            ${tag}
            ${r.customer_name ? `<span class="rv-list__customer">${_esc(r.customer_name)}</span> · ` : ''}
            ${timeLbl}${staffLbl}
          </div>
        </div>
        <button type="button" class="rv-list__delete" data-rv-act="delete" data-id="${_esc(r.id)}" aria-label="삭제">
          <i class="ph-duotone ph-trash" style="font-size:14px" aria-hidden="true"></i>
        </button>
      </div>`;
  }

  // ── PC 본문 렌더 ────────────────────────────────────────
  function _calcPCStats(items, totalForIncentive) {
    const total = items.reduce((s, r) => s + (r.amount || 0), 0);
    const count = items.length;
    const avg = count > 0 ? Math.round(total / count) : 0;
    const inc = _calcIncentive(totalForIncentive != null ? totalForIncentive : total);
    return { total, count, avg, net: inc.net };
  }

  function _renderPCStatsHTML(stats) {
    return `
      <div class="rv-pc-stats">
        <div class="rv-pc-stat">
          <div class="rv-pc-stat__label">${PERIOD_LABEL[_currentPeriod]} 매출</div>
          <div class="rv-pc-stat__value" id="rvPCStatTotal">${_formatMan(stats.total)}</div>
          <div class="rv-pc-stat__trend is-neutral">—</div>
        </div>
        <div class="rv-pc-stat">
          <div class="rv-pc-stat__label">거래 건수</div>
          <div class="rv-pc-stat__value">${stats.count}건</div>
          <div class="rv-pc-stat__trend is-neutral">${PERIOD_LABEL[_currentPeriod]}</div>
        </div>
        <div class="rv-pc-stat">
          <div class="rv-pc-stat__label">평균 객단가</div>
          <div class="rv-pc-stat__value">${_formatMan(stats.avg)}</div>
          <div class="rv-pc-stat__trend is-neutral">건당 평균</div>
        </div>
        <div class="rv-pc-stat">
          <div class="rv-pc-stat__label">순수익</div>
          <div class="rv-pc-stat__value" style="color:var(--brand-strong);">${_formatMan(stats.net)}</div>
          <div class="rv-pc-stat__trend is-neutral">재료15% 기본</div>
        </div>
      </div>`;
  }

  function _renderPCQAHTML() {
    return `
      <div class="rv-pc-qa" data-rv-qa>
        <div class="rv-pc-qa__label">빠른 입력</div>
        <input class="rv-pc-qa__input rv-pc-qa__input--amount" data-rv-field="amount" type="number" inputmode="numeric" placeholder="금액 (예: 45000)" />
        <input class="rv-pc-qa__input" data-rv-field="service_name" list="rvDataService" placeholder="시술 (예: 젤 리무브)" />
        <input class="rv-pc-qa__input" data-rv-field="customer_name" list="rvDataCustomer" placeholder="고객명" />
        <div class="rv-pc-qa__methods">
          ${['card', 'cash', 'transfer', 'membership'].map((m, i) => `
            <button type="button" class="rv-pc-qa__method${i === 0 ? ' is-on' : ''}" data-rv-pc-method="${m}">${TAG_LABEL[m]}</button>
          `).join('')}
        </div>
        <input type="hidden" data-rv-field="method" data-rv-method-default="card" value="card" />
        <button type="button" class="rv-pc-qa__add" data-rv-act="qa-add">기록</button>
      </div>`;
  }

  function _renderPCHeaderHTML() {
    const periods = PERIODS.map(p =>
      `<button type="button" class="rv-pc__period-btn${p === _currentPeriod ? ' is-on' : ''}" data-rv-act="period" data-period="${p}">${PERIOD_LABEL[p]}</button>`
    ).join('');
    return `<div class="rv-pc__header">
      <div class="rv-pc__title">매출관리</div>
      <div class="rv-pc__spacer"></div>
      <div class="rv-pc__periods">${periods}</div>
      <button type="button" class="rv-pc__add" data-rv-act="add-form">
        <i class="ph-duotone ph-plus" style="font-size:14px" aria-hidden="true"></i>매출 입력
      </button>
    </div>`;
  }
  function _renderPCChartShellHTML() {
    return `<div class="rv-pc-chart" id="rvPCChart">
      <div class="rv-chart__head"><div><div class="rv-chart__title">결제 방식별 분포</div><div class="rv-chart__sub">불러오는 중…</div></div></div>
      <div class="rv-chart__body"><div class="rv-donut" style="background:var(--surface-2);"></div><div class="rv-legend"></div></div>
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
  function _renderPCMain() {
    const sheet = document.getElementById('revenueSheet');
    if (!sheet) return;
    const main = sheet.querySelector('#rvPCMain');
    if (!main) return;
    const total = _items.reduce((s, r) => s + (r.amount || 0), 0);
    const stats = _calcPCStats(_items, total);
    const sorted = [..._items].sort((a, b) => new Date(b.recorded_at || b.created_at) - new Date(a.recorded_at || a.created_at));
    const visible = sorted.slice(0, _revWindow);
    const hasMore = sorted.length > _revWindow;
    main.innerHTML = _renderPCHeaderHTML() + _renderPCStatsHTML(stats) +
      `<div class="rv-pc-grid">${_renderPCChartShellHTML()}${_renderIncentiveCardHTML(total, 'margin-bottom:0;')}</div>` +
      _renderPCQAHTML() + _renderListBlockHTML(visible, sorted, stats.count, hasMore, true);
    _attachPCMethodToggles(main);
    _attachCommonHandlers(main, total);
    _loadDonutAsync(main.querySelector('#rvPCChart'));
  }

  // ── 도넛 비동기 로딩 ─────────────────────────────────────
  async function _loadDonutAsync(chartEl) {
    if (!chartEl) return;
    const bodyEl = chartEl.querySelector('.rv-chart__body');
    const subEl = chartEl.querySelector('.rv-chart__sub');
    try {
      const r = await _api('GET', '/memberships/revenue-breakdown?period=' + _currentPeriod);
      if (!r) {
        if (bodyEl) bodyEl.outerHTML = _renderDonut({ total: 0 }, { centerLabel: '데이터 없음' });
        if (subEl) subEl.textContent = '데이터 없음';
        return;
      }
      const html = _renderDonut(r, { centerLabel: PERIOD_LABEL[_currentPeriod] + ' 합계' });
      if (bodyEl) bodyEl.outerHTML = html;
      if (subEl) {
        const cnt = r.by_method ? Object.keys(r.by_method).filter(k => (r.by_method[k] || {}).total > 0).length : 0;
        subEl.textContent = `${PERIOD_LABEL[_currentPeriod]} · ${cnt}가지`;
      }
    } catch (_e) {
      // 폴백: 로컬 _items 으로 도넛
      const total = _items.reduce((s, r) => s + (r.amount || 0), 0);
      if (!total) {
        if (bodyEl) bodyEl.outerHTML = _renderDonut({ total: 0 }, { centerLabel: '데이터 없음' });
        if (subEl) subEl.textContent = '데이터 없음';
        return;
      }
      const by = {};
      _items.forEach(r => {
        const m = r.method || 'card';
        if (!by[m]) by[m] = { total: 0, count: 0 };
        by[m].total += r.amount || 0;
        by[m].count += 1;
      });
      const html = _renderDonut({ total, by_method: by }, { centerLabel: PERIOD_LABEL[_currentPeriod] + ' 합계' });
      if (bodyEl) bodyEl.outerHTML = html;
      if (subEl) subEl.textContent = `${PERIOD_LABEL[_currentPeriod]} · 로컬 집계`;
    }
  }

  // ── 자동완성 (datalist) ─────────────────────────────────
  function _refreshDatalists() {
    const sheet = document.getElementById('revenueSheet');
    if (!sheet) return;
    const cust = sheet.querySelector('#rvDataCustomer');
    const svc = sheet.querySelector('#rvDataService');
    if (!cust && !svc) return;
    if (window.AppAutocomplete && typeof window.AppAutocomplete.rebuild === 'function') {
      try { window.AppAutocomplete.rebuild({ revenue: _items }); } catch (_e) { void _e; }
    }
    const custSet = new Set(), svcSet = new Set();
    _items.forEach(r => {
      if (r.customer_name) custSet.add(r.customer_name);
      if (r.service_name) svcSet.add(r.service_name);
    });
    if (cust) cust.innerHTML = Array.from(custSet).slice(0, 200).map(v => `<option value="${_esc(v)}"></option>`).join('');
    if (svc) svc.innerHTML = Array.from(svcSet).slice(0, 200).map(v => `<option value="${_esc(v)}"></option>`).join('');
  }

  // ── rerender 디스패처 ───────────────────────────────────
  function _rerender() {
    if (!document.getElementById('revenueSheet')) return;
    _refreshDatalists();
    if (_cachedIsPC) _renderPCMain();
    else _rerenderMobile();
  }
  window._revenueBack = _rerender;

  // ── 자세히 입력 모달 (모바일·PC 공통) ────────────────────
  function _openAddForm(prefill) {
    let modal = document.getElementById('rvAddModal');
    if (modal) {
      // 기존 모달이 떠있는데 prefill 들어오면 강제 재생성. 그 외엔 그냥 보이기.
      if (prefill) { modal.remove(); }
      else { modal.style.display = 'flex'; return; }
    }
    modal = document.createElement('div');
    modal.id = 'rvAddModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9001;background:rgba(0,0,0,0.4);display:flex;align-items:flex-end;justify-content:center;';
    modal.innerHTML = `
      <div style="background:var(--surface);border-radius:20px 20px 0 0;width:100%;max-width:480px;padding:18px;padding-bottom:max(18px,env(safe-area-inset-bottom));max-height:90vh;overflow-y:auto;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <strong style="font-size:18px;color:var(--text);">매출 입력</strong>
          <button type="button" data-rv-modal-close style="margin-left:auto;background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-muted);" aria-label="닫기">✕</button>
        </div>
        <label style="display:block;font-size:12px;color:var(--text-subtle);margin-bottom:4px;">금액 (원) *</label>
        <input id="rfAmount" type="number" inputmode="numeric" style="width:100%;padding:12px;border:0.5px solid var(--border);border-radius:8px;margin-bottom:10px;font-size:16px;background:var(--surface);" placeholder="50000" />
        <div style="display:flex;gap:6px;margin-bottom:10px;">
          ${['card','cash','transfer','etc'].map(m => `
            <button type="button" data-rf-method="${m}" style="flex:1;padding:10px;border:0.5px solid var(--border);border-radius:8px;background:var(--surface);cursor:pointer;font-size:12px;color:var(--text);">${TAG_LABEL[m]}</button>
          `).join('')}
        </div>
        <label style="display:block;font-size:12px;color:var(--text-subtle);margin-bottom:4px;">서비스</label>
        <input id="rfService" list="rvDataService" style="width:100%;padding:10px;border:0.5px solid var(--border);border-radius:8px;margin-bottom:10px;background:var(--surface);" placeholder="속눈썹 풀세트" maxlength="50" />
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:10px;">
          <input id="rfCustomerName" readonly style="flex:1;padding:10px;border:0.5px solid var(--border);border-radius:8px;background:var(--surface-2);" placeholder="고객 (선택)" />
          <button type="button" id="rfCustomerPick" style="padding:10px 14px;border:0.5px solid var(--border);border-radius:8px;background:var(--surface);cursor:pointer;font-size:12px;color:var(--text);">👤 선택</button>
        </div>
        <label id="rfMembershipToggle" style="display:none;align-items:center;gap:8px;padding:10px;background:var(--brand-bg);border:0.5px solid var(--brand-strong);border-radius:8px;margin-bottom:10px;cursor:pointer;font-size:13px;color:var(--brand-strong);">
          <input type="checkbox" id="rfUseMembership" style="width:18px;height:18px;cursor:pointer;">
          <span>💳 회원권으로 결제 (잔액 자동 차감)</span>
          <span id="rfMembershipBalance" style="margin-left:auto;font-size:11px;font-weight:700;"></span>
        </label>
        <label style="display:block;font-size:12px;color:var(--text-subtle);margin-bottom:4px;">메모</label>
        <textarea id="rfMemo" rows="2" style="width:100%;padding:10px;border:0.5px solid var(--border);border-radius:8px;margin-bottom:10px;font-family:inherit;resize:vertical;background:var(--surface);" maxlength="200"></textarea>
        <button type="button" id="rfSave" style="width:100%;padding:12px;border:none;border-radius:8px;background:var(--brand-strong);color:#fff;font-weight:700;cursor:pointer;font-size:15px;">저장</button>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) _closeAddModal(); });
    modal.querySelector('[data-rv-modal-close]').addEventListener('click', _closeAddModal);
    _wireAddForm(modal, prefill);
  }

  function _closeAddModal() {
    const m = document.getElementById('rvAddModal');
    if (m) m.remove();
  }

  function _onPickCustomer(modal, ctx) {
    return async () => {
      if (!window.Customer || !window.Customer.pick) {
        if (window.showToast) window.showToast('고객 모듈 로드 중…'); return;
      }
      const picked = await window.Customer.pick();
      if (picked === null) return;
      ctx.customer_id = picked.id;
      modal.querySelector('#rfCustomerName').value = picked.name || '';
      const memToggle = modal.querySelector('#rfMembershipToggle');
      const memBal = modal.querySelector('#rfMembershipBalance');
      const memCheck = modal.querySelector('#rfUseMembership');
      if (memCheck) memCheck.checked = false;
      if (picked.membership_active && (picked.membership_balance || 0) > 0) {
        memToggle.style.display = 'flex';
        memBal.textContent = `잔액 ${(picked.membership_balance || 0).toLocaleString()}원`;
      } else {
        memToggle.style.display = 'none';
        memBal.textContent = '';
      }
    };
  }
  function _onSaveAddForm(modal, ctx) {
    return async () => {
      const amount = parseInt(modal.querySelector('#rfAmount').value, 10);
      if (!amount || amount <= 0) {
        if (window.showToast) window.showToast('금액을 입력해 주세요'); return;
      }
      const useMem = !!modal.querySelector('#rfUseMembership')?.checked;
      try {
        await create({
          amount,
          method: useMem ? 'membership' : ctx.method,
          service_name: modal.querySelector('#rfService').value.trim() || null,
          customer_id: ctx.customer_id,
          customer_name: modal.querySelector('#rfCustomerName').value.trim() || null,
          memo: modal.querySelector('#rfMemo').value.trim() || null,
          use_membership: useMem,
        });
        if (window.Fun && typeof window.Fun.celebrate === 'function') {
          window.Fun.celebrate(
            useMem ? `💳 회원권 차감 ${amount.toLocaleString()}원` : `매출 +${amount.toLocaleString()}원`,
            { emojis: useMem ? ['💳', '✨', '🌷'] : ['💰', '💵', '🎉', '✨'], count: 16 }
          );
        } else {
          if (window.hapticLight) window.hapticLight();
          if (window.showToast) window.showToast(useMem ? '회원권 차감 완료' : '매출 기록 완료');
        }
        _closeAddModal();
        await _loadAndRender();
      } catch (e) {
        console.warn('[revenue] create 실패:', e);
        if (window.showToast) window.showToast('저장 실패: ' + (e?.message || ''), { error: true });
      }
    };
  }
  function _wireAddForm(modal, prefill) {
    const ctx = { method: 'card', customer_id: prefill?.customer_id || null };
    const setMethod = (m) => {
      ctx.method = m;
      modal.querySelectorAll('[data-rf-method]').forEach(b => {
        const on = b.dataset.rfMethod === m;
        b.style.background = on ? 'var(--brand-strong)' : 'var(--surface)';
        b.style.color = on ? '#fff' : 'var(--text)';
        b.style.borderColor = on ? 'var(--brand-strong)' : 'var(--border)';
      });
    };
    setMethod('card');
    modal.querySelectorAll('[data-rf-method]').forEach(b => b.addEventListener('click', () => setMethod(b.dataset.rfMethod)));
    modal.querySelector('#rfCustomerPick').addEventListener('click', _onPickCustomer(modal, ctx));
    modal.querySelector('#rfSave').addEventListener('click', _onSaveAddForm(modal, ctx));

    // 고객 대시보드에서 "매출 입력" 진입 — 고객 정보 미리 채움.
    // 멤버십 잔액·활성 여부는 prefill 만으론 부족 → 보고 싶으면 사용자가 "선택" 다시 눌러 갱신.
    if (prefill?.customer_name) {
      modal.querySelector('#rfCustomerName').value = prefill.customer_name;
    }
  }

  // ── 삭제 ────────────────────────────────────────────────
  async function _deleteEntry(id) {
    const ok = window._confirm2 ? window._confirm2('이 매출 기록을 삭제할까요?') : confirm('이 매출 기록을 삭제할까요?');
    if (!ok) return;
    try {
      await remove(id);
      if (window.hapticLight) window.hapticLight();
      await _loadAndRender();
    } catch (_e) {
      if (window.showToast) window.showToast('삭제 실패');
    }
  }

  // ── 로드 + 렌더 ─────────────────────────────────────────
  function _renderSkeletonInto(container) {
    if (!container) return;
    container.innerHTML = (typeof window._renderSkeleton === 'function')
      ? window._renderSkeleton(5)
      : '<div style="padding:30px;text-align:center;color:var(--text-subtle);">불러오는 중…</div>';
  }

  async function _loadAndRender() {
    const sheet = document.getElementById('revenueSheet');
    if (!sheet) return;
    const swr = _readSWRPeriod(_currentPeriod);
    if (swr) {
      _items = swr.items;
      _rerender();
      if (!swr.fresh) {
        list(_currentPeriod).then(() => _rerender()).catch(() => {});
      }
      return;
    }
    // [2026-05-04] 캐시 없을 때: skeleton 으로 #rvPCMain 통째 교체하지 않음.
    // 빈 _items 로 layout 만 보여주고 (0원 표시) fetch 완료 시 _rerender 로 채움.
    // 이전: _renderSkeletonInto 가 main innerHTML 덮어써서 layout 안 보였음.
    try {
      await list(_currentPeriod);
      _rerender();
    } catch (_e) {
      console.warn('[revenue] load 실패:', _e);
      const target = sheet.querySelector(_cachedIsPC ? '#rvPCMain' : '#rvBody');
      if (target) target.innerHTML = '<div style="padding:30px;text-align:center;color:var(--danger);">불러오기 실패</div>';
    }
  }

  // ── open / close ────────────────────────────────────────
  window.openRevenue = async function () {
    // [2026-05-04 v88] 즉시 layout 표시 + 백그라운드 fetch.
    // 1) _renderRoot 로 사이드바 + #rvPCMain 빈 컨테이너
    // 2) _rerender 로 0원 / 0건 placeholder 즉시 표시 (Fun.countUp 가 알아서 0→실제값)
    // 3) display:flex 로 보이기
    // 4) _loadAndRender 백그라운드 (SWR 캐시 / 네트워크)
    const sheet = _ensureSheet();
    _cachedIsPC = _isPC();
    await _renderRoot();
    try { _rerender(); } catch (_e) { void _e; }
    sheet.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    document.body.classList.add('rv-mode');
    _loadAndRender().catch(() => {});
    _prefetchAllPeriods();
    try {
      if (typeof window._registerSheet === 'function') window._registerSheet('revenue', window.closeRevenue);
      if (typeof window._markSheetOpen === 'function') window._markSheetOpen('revenue');
    } catch (_e) { void _e; }
  };

  // 고객 대시보드 → "매출 입력" 진입점. openRevenue 후 prefill 된 추가 모달 즉시 표시.
  window._openRevenueAddFor = async function (customerId, customerName) {
    try {
      if (typeof window.openRevenue === 'function') await window.openRevenue();
    } catch (_e) { /* openRevenue 실패해도 모달은 띄움 */ }
    _openAddForm({ customer_id: customerId || null, customer_name: customerName || '' });
  };

  window.closeRevenue = function () {
    const sheet = document.getElementById('revenueSheet');
    if (sheet) sheet.style.display = 'none';
    document.body.style.overflow = '';
    document.body.classList.remove('rv-mode');
    _closeAddModal();
    try { if (typeof window._markSheetClosed === 'function') window._markSheetClosed('revenue'); } catch (_e) { void _e; }
  };

  window.Revenue = {
    list, create, remove,
    get _items() { return _items; },
    get isOffline() { return _isOffline; },
  };

  // ── resize 시 PC↔모바일 전환 ────────────────────────────
  let _resizeTimer = null;
  window.addEventListener('resize', () => {
    const sheet = document.getElementById('revenueSheet');
    if (!sheet || sheet.style.display === 'none') return;
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(async () => {
      const newIsPC = _isPC();
      if (newIsPC !== _cachedIsPC) {
        _cachedIsPC = newIsPC;
        await _renderRoot();
        await _loadAndRender();
      }
    }, 200);
  });

  // ── 외부 mutation 이벤트 ────────────────────────────────
  if (typeof window !== 'undefined' && !window._revenueDataListenerInit) {
    window._revenueDataListenerInit = true;
    window.addEventListener('itdasy:data-changed', async (e) => {
      const k = (e && e.detail && e.detail.kind) || '';
      if (!k) return;
      if (k === 'create_revenue' || k === 'update_revenue' || k === 'delete_revenue' || k === 'create_expense' ||
          k.indexOf('revenue') !== -1 || k.indexOf('expense') !== -1) {
        _clearSWRRevenue();
        const sheet = document.getElementById('revenueSheet');
        if (sheet && sheet.style.display !== 'none') {
          try { await _loadAndRender(); } catch (_err) { void _err; }
        }
      }
    });
  }
})();
