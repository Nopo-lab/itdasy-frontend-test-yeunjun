/* ─────────────────────────────────────────────────────────────
   사장님 대시보드 (P2 리뉴얼 2026-04-22)

   설정 시트 → 대시보드 오버레이.
   화면: 헤더 / Hero(이번달매출·MoM·3미니) / 주요지표 2×2 /
         바로가기 4버튼 / 데이터&인사이트 5개 리스트

   금지: fetchRevenue·fetchCustomers·fetchBookings·캐싱레이어 수정
         app-power-view.js 일체 수정
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }
  function _formatKRWShort(n) {
    const v = +n || 0;
    if (v >= 10000) return Math.round(v / 1000) / 10 + '만';
    if (v >= 1000) return Math.round(v / 100) / 10 + '천';
    return v.toLocaleString('ko-KR');
  }

  // T-326 — sessionStorage 캐시 (1분 내 재호출 즉시 반환, 네트워크 로딩 지연 해소)
  const _CACHE_TTL = 60 * 1000;
  function _cacheKey(path) { return 'dash_cache::' + path; }
  function _getCached(path) {
    try {
      const raw = sessionStorage.getItem(_cacheKey(path));
      if (!raw) return null;
      const { t, v } = JSON.parse(raw);
      if (Date.now() - t > _CACHE_TTL) return null;
      return v;
    } catch (_) { return null; }
  }
  function _setCached(path, v) {
    try { sessionStorage.setItem(_cacheKey(path), JSON.stringify({ t: Date.now(), v })); } catch(e){ /* storage full — silently ignore */ }
  }

  async function _apiGet(path, opts) {
    if (!window.API || !window.authHeader) throw new Error('no-auth');
    const auth = window.authHeader();
    if (!auth?.Authorization) throw new Error('no-token');
    const cached = (opts && opts.force) ? null : _getCached(path);
    if (cached) return cached;
    const res = await fetch(window.API + path, { headers: auth });
    if (res.status === 404 || res.status === 501) throw new Error('endpoint-missing');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    _setCached(path, data);
    return data;
  }

  // ── 시트 DOM ──────────────────────────────────────────
  function _ensureSheet() {
    let sheet = document.getElementById('dashboardSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'dashboardSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9998;display:none;flex-direction:column;background:var(--bg);';
    sheet.innerHTML = `
      <header class="db-hdr">
        <button class="db-back" onclick="closeDashboard()" aria-label="뒤로">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h1>대시보드</h1>
        <button id="dashPeriodChip" class="chip" aria-label="기간 선택" style="border:none;cursor:pointer;font-family:inherit;font-size:12px;">
          <span id="dashPeriodLabel">이번달</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
        </button>
      </header>
      <div id="dashBody" class="db-body"></div>
    `;
    document.body.appendChild(sheet);
    return sheet;
  }

  // ── SVG 헬퍼 ─────────────────────────────────────────
  function _ic(paths, w) {
    const s = w || 18;
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  }

  const IC = {
    dollar:    '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    trendUp:   '<path d="M7 17l5-5 4 4 5-5"/><path d="M14 7h7v7"/>',
    trendDown: '<path d="M7 7l5 5 4-4 5 5"/><path d="M14 17h7v-7"/>',
    chart:     '<path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/>',
    users:     '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    calendar:  '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    box:       '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7L12 12l8.7-5M12 22V12"/>',
    userPlus:  '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    calPlus:   '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4"/>',
    card:      '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    check:     '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    msg:       '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 10h.01M12 10h.01M16 10h.01"/>',
    star:      '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
    video:     '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
    upload:    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
    sparkles:  '<path d="M12 3l1.5 4.5H18l-3.75 2.7 1.5 4.5L12 12l-3.75 2.7 1.5-4.5L6 7.5h4.5L12 3z"/>',
    chevRight: '<path d="M9 18l6-6-6-6"/>',
  };

  // ── Hero 카드 ─────────────────────────────────────────
  function _heroSection(stats, lastMonthAmount, retData, npsStats, custList) {
    const momPct = lastMonthAmount > 0
      ? Math.round(((stats.month_amount - lastMonthAmount) / lastMonthAmount) * 100)
      : null;
    const momStr = momPct != null
      ? `지난달 대비 ${momPct >= 0 ? '+' : ''}${momPct}%`
      : '지난달 비교 대기 중';
    const deltaIcon = momPct == null || momPct >= 0 ? IC.trendUp : IC.trendDown;

    // 신규 고객: 이번달 생성된 고객 수
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const newCustomers = (custList.items || []).filter(c =>
      c.created_at && new Date(c.created_at).getTime() >= monthStart
    ).length;
    const newCustStr = newCustomers > 0 ? newCustomers + '명' : custList.total > 0 ? '—' : '—';

    // 재방문: retention rate
    const retRate = retData && retData.summary && retData.summary.retention_rate != null
      ? Math.round(retData.summary.retention_rate) + '%'
      : '—';

    // NPS 점수
    const npsScore = npsStats && npsStats.score != null
      ? (npsStats.score >= 0 ? '+' : '') + npsStats.score
      : '—';

    return `
      <div class="db-hero">
        <div class="db-hero__lbl">
          ${_ic(IC.dollar, 14)}
          이번달 매출
        </div>
        <p class="db-hero__val">${_formatKRWShort(stats.month_amount)}원</p>
        <span class="db-hero__delta">
          ${_ic(deltaIcon, 14)}
          ${_esc(momStr)}
        </span>
        <div class="db-hero__row">
          <div class="db-hero__mini">
            <p class="db-hero__mini-lbl">신규 고객</p>
            <p class="db-hero__mini-val">${_esc(newCustStr)}</p>
          </div>
          <div class="db-hero__mini">
            <p class="db-hero__mini-lbl">재방문</p>
            <p class="db-hero__mini-val">${_esc(retRate)}</p>
          </div>
          <div class="db-hero__mini">
            <p class="db-hero__mini-lbl">NPS</p>
            <p class="db-hero__mini-val">${_esc(npsScore)}</p>
          </div>
        </div>
      </div>
    `;
  }

  // ── 주요 지표 2×2 ─────────────────────────────────────
  function _metricsGrid(stats, momPct, inventory) {
    const lowStock = inventory && inventory.items
      ? (inventory.items || []).filter(i => i.quantity != null && i.threshold != null && i.quantity <= i.threshold).length
      : null;
    const invVal = lowStock != null ? (lowStock > 0 ? lowStock + '종 부족' : '재고 정상') : '재고 현황';
    const invSubCls = lowStock != null && lowStock > 0 ? 'db-wid__sub--down' : '';

    const momStr = momPct != null ? (momPct >= 0 ? '+' : '') + momPct + '% MoM' : 'MoM —';
    const momCls = momPct == null ? '' : momPct >= 0 ? 'db-wid__sub--up' : 'db-wid__sub--down';
    const momIcon = momPct == null || momPct >= 0 ? IC.trendUp : IC.trendDown;

    return `
      <div class="db-grid2">
        <button class="db-wid" data-metric="revenue">
          <div class="db-wid__top">
            <div class="db-wid__ic">${_ic(IC.chart)}</div>
            <span class="db-wid__ttl">매출</span>
          </div>
          <p class="db-wid__val">${_formatKRWShort(stats.month_amount)}원</p>
          <span class="db-wid__sub ${momCls}">${_ic(momIcon, 12)} ${_esc(momStr)}</span>
        </button>
        <button class="db-wid" data-metric="customer">
          <div class="db-wid__top">
            <div class="db-wid__ic">${_ic(IC.users)}</div>
            <span class="db-wid__ttl">고객</span>
          </div>
          <p class="db-wid__val">${stats.customer_count}명</p>
          <span class="db-wid__sub">등록 고객</span>
        </button>
        <button class="db-wid" data-metric="booking">
          <div class="db-wid__top">
            <div class="db-wid__ic">${_ic(IC.calendar)}</div>
            <span class="db-wid__ttl">예약</span>
          </div>
          <p class="db-wid__val">${stats.upcoming_bookings}건</p>
          <span class="db-wid__sub">예정 예약</span>
        </button>
        <button class="db-wid" data-metric="inventory">
          <div class="db-wid__top">
            <div class="db-wid__ic">${_ic(IC.box)}</div>
            <span class="db-wid__ttl">재고</span>
          </div>
          <p class="db-wid__val">${_esc(invVal)}</p>
          <span class="db-wid__sub ${invSubCls}">${lowStock != null && lowStock > 0 ? '재주문 필요' : '재고 관리'}</span>
        </button>
      </div>
    `;
  }

  // ── 바로가기 4버튼 ─────────────────────────────────────
  function _quickActionsRow() {
    const actions = [
      { icon: IC.userPlus, label: '고객등록', fn: 'openCustomers' },
      { icon: IC.calPlus,  label: '예약',     fn: 'openBooking' },
      { icon: IC.card,     label: '매출입력', fn: 'openRevenue' },
      { icon: IC.check,    label: '재고체크', fn: 'openInventory' },
    ];
    return `
      <div class="db-qrow">
        ${actions.map(a => `
          <button class="db-qa" data-qa="${_esc(a.fn)}">
            <span class="db-qa__ic">${_ic(a.icon, 20)}</span>
            <span class="db-qa__t">${_esc(a.label)}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  // ── 데이터 & 인사이트 리스트 ─────────────────────────────
  function _insightItems(npsStats, naverData) {
    const npsCount = npsStats && npsStats.count > 0;
    const npsBadge = npsCount ? '<span class="db-badge db-badge--ok">활성</span>' : '';
    const npsSub = npsCount
      ? `이번달 응답 ${npsStats.count}건 · 점수 ${npsStats.score >= 0 ? '+' : ''}${npsStats.score}`
      : 'NPS 설문 관리';
    const naverPending = naverData && naverData.pending_reply > 0 ? naverData.pending_reply : null;
    const naverBadge = naverPending ? `<span class="db-badge db-badge--warn">답변 ${naverPending}</span>` : '';
    const naverSub = naverData && naverData.avg_score
      ? `신규 ${naverData.new_count || 0}건 · 평균 ${naverData.avg_score}점`
      : '네이버 리뷰 관리';
    return [
      { ic: IC.msg,      pink: true,  label: 'NPS 설문',      sub: npsSub,                            badge: npsBadge,                               fn: 'openNps' },
      { ic: IC.star,     pink: true,  label: '네이버 리뷰',   sub: naverSub,                          badge: naverBadge,                              fn: 'openNaverReviews' },
      { ic: IC.video,    pink: false, label: '영상 리포트',   sub: '릴스/쇼츠 분석',                  badge: '',                                     fn: 'openVideo' },
      { ic: IC.upload,   pink: false, label: '데이터 불러오기', sub: '엑셀/CSV · 전자영수증 연동',    badge: '',                                     fn: 'openImport' },
      { ic: IC.sparkles, pink: true,  label: 'AI 인사이트',   sub: '"이번주 집중할 3가지" 자동 추천', badge: '<span class="db-badge">NEW</span>',    fn: 'openInsights' },
    ];
  }

  function _dataInsightsList(npsStats, naverData) {
    const items = _insightItems(npsStats, naverData);
    return `
      <div class="db-menu">
        ${items.map(it => `
          <button class="db-menu-it" data-list="${_esc(it.fn)}">
            <div class="db-menu__ic ${it.pink ? 'db-menu__ic--pink' : ''}">${_ic(it.ic)}</div>
            <div class="db-menu__tx">
              <p class="db-menu__t">${_esc(it.label)}</p>
              <p class="db-menu__s">${_esc(it.sub)}</p>
            </div>
            ${it.badge}
            <span class="db-menu__arr">${_ic(IC.chevRight, 16)}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  // ── 로딩 스켈레톤 ─────────────────────────────────────
  function _renderLoading() {
    const body = document.getElementById('dashBody');
    if (!body) return;
    body.innerHTML = `
      <style>
        @keyframes dashShimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
        .db-skel {
          background:linear-gradient(90deg,var(--surface-2) 0%,var(--surface) 40%,var(--surface-2) 80%);
          background-size:800px 100%;
          animation:dashShimmer 1.4s infinite linear;
          border-radius:12px;
        }
      </style>
      <div class="db-skel" style="height:160px;margin-bottom:20px;border-radius:20px;"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;">
        ${[0,1,2,3].map(() => '<div class="db-skel" style="height:96px;border-radius:14px;"></div>').join('')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:20px;">
        ${[0,1,2,3].map(() => '<div class="db-skel" style="height:68px;border-radius:8px;"></div>').join('')}
      </div>
      <div class="db-skel" style="height:280px;border-radius:14px;"></div>
    `;
  }

  // ── 집계 로직 ──────────────────────────────────────────
  function _aggregateStats(monthRows, todayRows, customersCount, bookings) {
    const today_amount = (todayRows || []).reduce((s, r) => s + (r.amount || 0), 0);
    const today_count = (todayRows || []).length;
    const month_amount = (monthRows || []).reduce((s, r) => s + (r.amount || 0), 0);
    const now = Date.now();
    const upcoming_bookings = (bookings || []).filter(b => new Date(b.starts_at).getTime() >= now).length;
    return {
      today_amount,
      today_count,
      month_amount,
      customer_count: customersCount,
      upcoming_bookings,
    };
  }

  // ── 이벤트 바인딩 ─────────────────────────────────────
  function _bindEvents() {
    const sheet = document.getElementById('dashboardSheet');
    if (!sheet) return;

    // 주요 지표 2×2 → 파워뷰
    sheet.querySelectorAll('[data-metric]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.hapticLight) window.hapticLight();
        const tab = btn.dataset.metric;
        if (typeof window.openPowerView === 'function') window.openPowerView(tab);
      });
    });

    // 바로가기 4버튼
    sheet.querySelectorAll('[data-qa]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.hapticMedium) window.hapticMedium();
        const fn = btn.dataset.qa;
        if (typeof window[fn] === 'function') window[fn]();
      });
    });

    // 데이터 & 인사이트 리스트
    sheet.querySelectorAll('[data-list]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.hapticLight) window.hapticLight();
        const fn = btn.dataset.list;
        if (typeof window[fn] === 'function') window[fn]();
      });
    });

    // 기간 필터 칩
    const periodChip = sheet.querySelector('#dashPeriodChip');
    if (periodChip) {
      periodChip.addEventListener('click', () => {
        if (window.hapticLight) window.hapticLight();
        // 기간 전환 (이번달 → 이번주 → 오늘 → 이번달)
        const periods = ['이번달', '이번주', '오늘'];
        const current = localStorage.getItem('itdasy_dashboard_period') || '이번달';
        const next = periods[(periods.indexOf(current) + 1) % periods.length];
        localStorage.setItem('itdasy_dashboard_period', next);
        const lbl = sheet.querySelector('#dashPeriodLabel');
        if (lbl) lbl.textContent = next;
      });
    }
  }

  // ── 5분 메모리 캐시 + 백그라운드 prefetch ──────────────────
  const _cache = {};
  const _TTL = 5 * 60 * 1000;  // 5분

  async function _cachedGet(path) {
    const hit = _cache[path];
    if (hit && (Date.now() - hit.ts) < _TTL) return hit.data;
    try {
      const data = await _apiGet(path);
      _cache[path] = { ts: Date.now(), data };
      return data;
    } catch (e) {
      if (hit) return hit.data;  // 실패하면 stale 이라도 반환
      throw e;
    }
  }

  // 앱 부팅 시점에 미리 한 번 (유휴 타이밍)
  async function prefetch() {
    const paths = ['/revenue?period=month', '/revenue?period=today', '/customers', '/bookings', '/retention/at-risk', '/revenue/forecast', '/coupons/suggest', '/today/brief'];
    await Promise.all(paths.map(p => _cachedGet(p).catch(() => null)));
  }
  // 외부 노출 — 부팅 훅에서 호출
  window.Dashboard = window.Dashboard || {};
  window.Dashboard.prefetch = prefetch;

  async function _loadAndRender() {
    const body = document.getElementById('dashBody');
    if (!body) return;
    _renderLoading();

    // 병렬 + 캐시 — 실패는 모두 graceful degrade
    const [monthRev, lastMonthRev, todayRev, custList, bookList, ret, npsStats, inventory, naverData] = await Promise.all([
      _cachedGet('/revenue?period=month').catch(() => ({ items: [] })),
      _cachedGet('/revenue?period=lastmonth').catch(() => ({ items: [] })),
      _cachedGet('/revenue?period=today').catch(() => ({ items: [] })),
      _cachedGet('/customers').catch(() => ({ total: 0, items: [] })),
      _cachedGet('/bookings').catch(() => ({ items: [] })),
      _cachedGet('/retention/at-risk').catch(() => null),
      _cachedGet('/nps/stats').catch(() => null),
      _cachedGet('/inventory').catch(() => null),
      _cachedGet('/naver-reviews/summary').catch(() => null),
    ]);

    const stats = _aggregateStats(
      monthRev.items || [],
      todayRev.items || [],
      custList.total != null ? custList.total : (custList.items || []).length,
      bookList.items || [],
    );

    const lastMonthAmount = (lastMonthRev.items || []).reduce((s, r) => s + (r.amount || 0), 0);
    const momPct = lastMonthAmount > 0
      ? Math.round(((stats.month_amount - lastMonthAmount) / lastMonthAmount) * 100)
      : null;

    body.innerHTML = `
      ${_heroSection(stats, lastMonthAmount, ret, npsStats, custList)}
      <div class="db-sec"><h2>주요 지표</h2><span class="db-sec__hint">탭해서 상세보기</span></div>
      ${_metricsGrid(stats, momPct, inventory)}
      <div class="db-sec"><h2>바로가기</h2></div>
      ${_quickActionsRow()}
      <div class="db-sec"><h2>데이터 &amp; 인사이트</h2></div>
      ${_dataInsightsList(npsStats, naverData)}
    `;

    _bindEvents();
  }

  window.openDashboard = async function () {
    const sheet = _ensureSheet();
    sheet.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    // 기간 라벨 동기화
    const stored = localStorage.getItem('itdasy_dashboard_period') || '이번달';
    const lbl = sheet.querySelector('#dashPeriodLabel');
    if (lbl) lbl.textContent = stored;
    await _loadAndRender();
  };

  window.closeDashboard = function () {
    const sheet = document.getElementById('dashboardSheet');
    if (sheet) sheet.style.display = 'none';
    document.body.style.overflow = '';
  };

  // 부팅 시 토큰 있으면 유휴 순간에 prefetch (페이지 로딩 영향 없게 requestIdleCallback)
  function _schedulePrefetch() {
    const hasToken = () => {
      if (typeof window.authHeader === 'function') {
        const h = window.authHeader();
        return !!(h && h.Authorization);
      }
      return false;
    };
    const run = () => { if (hasToken()) prefetch().catch(() => {}); };
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 3000 });
    else setTimeout(run, 1200);
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') _schedulePrefetch();
  else document.addEventListener('DOMContentLoaded', _schedulePrefetch);

  window.Dashboard = {
    refresh: async function (force) {
      if (force) { for (const k in _cache) delete _cache[k]; }
      return _loadAndRender();
    },
    prefetch,
  };
})();
