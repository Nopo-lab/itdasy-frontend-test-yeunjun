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

  function _esc(s) { return window._esc(s); } /* [2026-06-11] 중복 제거 — app-core 정본 위임 */
  // [2026-05-19] _formatKRWShort 삭제 → formatMan (format-money.js 공통 유틸)

  // T-326 — sessionStorage 캐시. [2026-04-30] 1분 → 5분 (재진입 hit 율 ↑, fetch 빈도 ↓)
  const _CACHE_TTL = 5 * 60 * 1000;
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
  // [P1-2A] stale-while-revalidate — TTL 만료 무관 캐시 반환 (없으면 null)
  // 즉시 화면 표시 후 백그라운드에서 fresh fetch
  function _getCachedStale(path) {
    try {
      const raw = sessionStorage.getItem(_cacheKey(path));
      if (!raw) {
        return null;
      }
      const { v } = JSON.parse(raw);
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
    const res = await apiFetch(path, { headers: auth });
    if (res.status === 404 || res.status === 501) throw new Error('endpoint-missing');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (auth.Authorization !== window.authHeader()?.Authorization) throw new Error('session_changed');
    _setCached(path, data);
    return data;
  }

  // ── 렌더 타겟 (탭 모드) ─────────────────────────────
  function _getBody() {
    return document.getElementById('dashboardMetrics');
  }

  // ── 아이콘 헬퍼 ─────────────────────────────────────────
  // Phase 5: Phosphor 이름 (ph-*)이면 <i> 렌더, 그 외엔 레거시 SVG path 폴백.
  function _ic(nameOrPaths, w) {
    const s = w || 18;
    // [2026-05-28] sprite use 분기 — 'ic-' 접두는 index.html sprite 심볼
    if (typeof nameOrPaths === 'string' && nameOrPaths.startsWith('ic-')) {
      return `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#${nameOrPaths}"/></svg>`;
    }
    if (typeof nameOrPaths === 'string' && nameOrPaths.startsWith('ph-')) {
      return `<i class="ph-duotone ${nameOrPaths}" style="font-size:${s}px;" aria-hidden="true"></i>`;
    }
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${nameOrPaths}</svg>`;
  }

  const IC = {
    dollar:    'ph-currency-dollar',
    trendUp:   'ph-trend-up',
    trendDown: 'ph-trend-down',
    chart:     'ph-chart-line-up',
    users:     'ph-users-three',
    calendar:  'ph-calendar-check',
    box:       'ph-package',
    userPlus:  'ph-user-plus',
    calPlus:   'ph-calendar-plus',
    card:      'ph-credit-card',
    check:     'ph-check-square',
    msg:       'ph-chat-circle-dots',
    star:      'ph-star',
    video:     'ph-video-camera',
    upload:    'ph-upload',
    sparkles:  'ph-sparkle',
    chevRight: 'ic-chevron-right',
  };

  // ── 기간 라벨 / 비교 라벨 ─────────────────────────────
  function _periodLabel(p) {
    return ({ today: '오늘', week: '이번주', month: '이번달' })[p] || '이번달';
  }
  function _periodDeltaLabel(p) {
    // 같은 기간 단위 직전 비교 (예: 오늘=어제, 이번주=지난주, 이번달=지난달)
    return ({ today: '어제 대비', week: '지난주 대비', month: '지난달 대비' })[p] || '지난달 대비';
  }

  // ── Hero 카드 (Task 6: '이번달 브리핑' 흡수, Task 7: 기간 토글 연동) ─────
  function _heroSection(stats, prevAmount, retData, custList, briefData, period) {
    const periodAmount = stats.period_amount != null ? stats.period_amount : stats.month_amount;
    const deltaPct = prevAmount > 0
      ? Math.round(((periodAmount - prevAmount) / prevAmount) * 100)
      : null;
    const deltaStr = deltaPct != null
      ? `${_periodDeltaLabel(period)} ${deltaPct >= 0 ? '+' : ''}${deltaPct}%`
      : `${_periodDeltaLabel(period)} 대기 중`;
    const deltaIcon = deltaPct == null || deltaPct >= 0 ? IC.trendUp : IC.trendDown;

    // 신규 고객: 기간 시작점부터 생성된 고객 수
    const now = new Date();
    let rangeStart;
    if (period === 'today') {
      rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    } else if (period === 'week') {
      const d = new Date(now); d.setDate(now.getDate() - now.getDay());
      d.setHours(0,0,0,0);
      rangeStart = d.getTime();
    } else {
      rangeStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    }
    const newCustomers = (custList.items || []).filter(c =>
      c.created_at && new Date(c.created_at).getTime() >= rangeStart
    ).length;
    const newCustStr = newCustomers > 0 ? newCustomers + '명' : '—';

    // 재방문: retention rate (전체 기준 — 기간 의존 X)
    const retRate = retData && retData.summary && retData.summary.retention_rate != null
      ? Math.round(retData.summary.retention_rate) + '%'
      : '—';

    // ── 브리핑 미니 라인 (오늘 예약 / 위험 신호) — 흡수된 hero-card 내용 ──
    const todayBookings = briefData && briefData.upcoming_count != null ? briefData.upcoming_count : null;
    const atRisk = briefData && briefData.at_risk_count != null ? briefData.at_risk_count : null;

    const briefRow = (todayBookings != null || atRisk != null) ? `
      <div class="db-hero__brief" style="display:flex;gap:10px;margin-top:10px;padding-top:10px;border-top:1px dashed rgba(255,255,255,0.18);">
        <div class="db-hero__mini" style="flex:1;">
          <p class="db-hero__mini-lbl">오늘 예약</p>
          <p class="db-hero__mini-val">${todayBookings != null ? todayBookings + '건' : '—'}</p>
        </div>
        <div class="db-hero__mini" style="flex:1;">
          <p class="db-hero__mini-lbl">위험 신호</p>
          <p class="db-hero__mini-val">${atRisk != null ? (atRisk > 0 ? atRisk + '명' : '없음') : '—'}</p>
        </div>
      </div>
    ` : '';

    return `
      <div class="db-hero">
        <div class="db-hero__lbl">
          ${_ic(IC.dollar, 14)}
          ${_esc(_periodLabel(period))} 브리핑
        </div>
        <p class="db-hero__val">${formatMan(periodAmount)}</p>
        <span class="db-hero__delta">
          ${_ic(deltaIcon, 14)}
          ${_esc(deltaStr)}
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
        </div>
        ${briefRow}
      </div>
    `;
  }

  // ── 기간 토글 (Task 7: 오늘 / 이번주 / 이번달) ─────────
  function _periodToggle(active) {
    const opts = [
      { key: 'today', label: '오늘' },
      { key: 'week',  label: '이번주' },
      { key: 'month', label: '이번달' },
    ];
    return `
      <div class="period-toggle" role="tablist" aria-label="기간 선택"
           style="display:inline-flex;gap:4px;padding:4px;background:var(--surface-2);border-radius:14px;">
        ${opts.map(o => `
          <button type="button" data-period="${o.key}"
                  class="${active === o.key ? 'active' : ''}"
                  style="border:none;cursor:pointer;font-family:inherit;font-size:12px;font-weight:${active === o.key ? '700' : '500'};
                         padding:6px 12px;border-radius:10px;
                         background:${active === o.key ? 'linear-gradient(135deg,var(--brand),#E96A7E)' : 'transparent'};
                         color:${active === o.key ? '#fff' : 'var(--text)'};
                         transition:background .15s ease,color .15s ease;">
            ${o.label}
          </button>
        `).join('')}
      </div>
    `;
  }

  // ── 주요 지표 (재고 제외 1×3) ───────────────────────

  // ── 데이터 & 인사이트 리스트 ─────────────────────────────
  function _insightItems() {
    // [2026-05-16] '영상 리포트' (실제는 영상 합성 도구) 제거 — 사용자 요청
    return [
      { ic: IC.upload,   pink: false, boxColor: 'teal',   label: '데이터 불러오기', sub: '엑셀/CSV · 전자영수증 연동',    badge: '',                                     fn: 'openImport' },
      { ic: IC.sparkles, pink: true,  boxColor: 'pink',   label: 'AI 인사이트',   sub: '"이번주 집중할 3가지" 자동 추천', badge: '<span class="db-badge">NEW</span>',    fn: 'openInsights' },
    ];
  }

  function _dataInsightsList() {
    const items = _insightItems();
    return `
      <div class="db-menu">
        ${items.map(it => `
          <button class="db-menu-it" data-list="${_esc(it.fn)}">
            <div class="db-menu__ic"><span class="ic-box ic-box--sm ic-box--${_esc(it.boxColor)}">${_ic(it.ic, 14)}</span></div>
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
    const body = _getBody();
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
      <div class="db-skel" style="height:280px;border-radius:14px;"></div>
    `;
  }

  // ── 집계 로직 ──────────────────────────────────────────
  function _aggregateStats(monthRows, todayRows, periodRows, customersCount, bookings) {
    const today_amount = (todayRows || []).reduce((s, r) => s + (r.amount || 0), 0);
    const today_count = (todayRows || []).length;
    const month_amount = (monthRows || []).reduce((s, r) => s + (r.amount || 0), 0);
    const period_amount = (periodRows || []).reduce((s, r) => s + (r.amount || 0), 0);
    const now = Date.now();
    const upcoming_bookings = (bookings || []).filter(b => new Date(b.starts_at).getTime() >= now).length;
    return {
      today_amount,
      today_count,
      month_amount,
      period_amount,
      customer_count: customersCount,
      upcoming_bookings,
    };
  }

  // ── 이벤트 바인딩 ─────────────────────────────────────
  function _bindEvents() {
    const sheet = document.getElementById('tab-dashboard');
    if (!sheet) return;

    // 주요 지표 2×2 → 각 독립 허브로 라우팅
    sheet.querySelectorAll('[data-metric]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.hapticLight) window.hapticLight();
        const tab = btn.dataset.metric;
        if      (tab === 'booking')   { if (typeof window.openCalendarView  === 'function') window.openCalendarView(); }
        else if (tab === 'revenue')   { (window.openRevenue || window.openRevenueHub)?.(); }
        else if (tab === 'customer')  { if (typeof window.openCustomerHub   === 'function') window.openCustomerHub(); }
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

    // 기간 토글 (Task 7: 클릭 시 브리핑·매출·신규고객 모두 해당 기간으로 갱신)
    sheet.querySelectorAll('.period-toggle [data-period]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (window.hapticLight) window.hapticLight();
        const next = btn.dataset.period;  // 'today' | 'week' | 'month'
        const cur = localStorage.getItem('itdasy_dashboard_period_key') || 'month';
        if (next === cur) return;
        localStorage.setItem('itdasy_dashboard_period_key', next);
        await _loadAndRender();
      });
    });
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
  // 2026-05-01 ── 우선순위 핵심 3개만 prefetch. 9개 동시 fetch → cold start 누적 + pool 폭주.
  // 나머지는 사용자가 dashboard 진입 시 lazy load. forecast/at-risk 는 거의 안 봄.
  async function prefetch() {
    const paths = ['/today/brief', '/revenue?period=month', '/customers'];
    await Promise.all(paths.map(p => _cachedGet(p).catch(() => null)));
  }
  // 외부 노출 — 부팅 훅에서 호출
  window.Dashboard = window.Dashboard || {};
  window.Dashboard.prefetch = prefetch;

  // ── 기간 키 저장/조회 (Task 7) ─────────────────────────
  function _getPeriod() {
    const v = localStorage.getItem('itdasy_dashboard_period_key');
    if (v === 'today' || v === 'week' || v === 'month') return v;
    // 레거시 라벨 마이그레이션 ('이번달'/'이번주'/'오늘')
    const legacy = localStorage.getItem('itdasy_dashboard_period');
    if (legacy === '오늘')  { localStorage.setItem('itdasy_dashboard_period_key', 'today'); return 'today'; }
    if (legacy === '이번주') { localStorage.setItem('itdasy_dashboard_period_key', 'week');  return 'week'; }
    return 'month';
  }
  // 기간별 비교(prev) endpoint — 서버 지원 전까지 요청하지 않고 "대기 중"으로 표시.
  function _prevPeriodPath(period) {
    if (period === 'month' || period === 'week' || period === 'today') return null;
    return null;
  }

  async function _loadAndRender() {
    const body = _getBody();
    if (!body) return;
    // [2026-04-26 0초딜레이] 캐시에 모든 path 가 있으면 skeleton 없이 바로 렌더
    // (캐시 _cache 자체에 들어있으면 = sessionStorage 도 있음 → _cachedGet 즉시 반환)
    const period = _getPeriod();
    const prevPath = _prevPeriodPath(period);

    // [P1-2A] stale-while-revalidate — stale 캐시 즉시 렌더 → 백그라운드 fresh fetch → 다시 렌더
    const allPaths = [
      '/revenue?period=month',
      prevPath,
      '/revenue?period=today',
      '/revenue?period=' + period,
      '/customers',
      '/bookings',
      '/retention/at-risk',
      null,   // [2026-07-22] 재고 제거 — 슬롯만 유지(뒤 인덱스 재정렬 방지)
      '/today/brief?period=' + period,
    ];

    function _renderFromData(data) {
      const [monthRev, prevRev, todayRev, periodRev, custList, bookList, ret, _inventory, briefData] = data;
      const stats = _aggregateStats(
        (monthRev || {}).items || [],
        (todayRev || {}).items || [],
        (periodRev || {}).items || [],
        (custList && custList.total != null) ? custList.total : ((custList || {}).items || []).length,
        (bookList || {}).items || [],
      );
      const prevAmount = ((prevRev || {}).items || []).reduce((s, r) => s + (r.amount || 0), 0);
      body.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
          ${_periodToggle(period)}
        </div>
        ${_heroSection(stats, prevAmount, ret, custList || { total: 0, items: [] }, briefData, period)}
        <div class="db-sec"><h2>데이터 &amp; 인사이트</h2></div>
        ${_dataInsightsList()}
      `;
      _bindEvents();
    }

    // 1) stale 캐시 (sessionStorage 또는 localStorage) 즉시 렌더 — 0ms 체감
    const staleData = allPaths.map(p => p ? _getCachedStale(p) : null);
    const hasStale = staleData.some(v => v !== null && v !== undefined);
    if (hasStale) {
      _renderFromData([
        staleData[0] || { items: [] },        // monthRev
        staleData[1] || { items: [] },        // prevRev
        staleData[2] || { items: [] },        // todayRev
        staleData[3] || { items: [] },        // periodRev
        staleData[4] || { total: 0, items: [] }, // custList
        staleData[5] || { items: [] },        // bookList
        staleData[6],                          // ret
        staleData[7],                          // inventory
        staleData[8],                          // briefData
      ]);
    } else {
      _renderLoading();
    }

    // 2) 백그라운드 fresh fetch — 도착 후 다시 렌더 (조용히 갱신)
    try {
      // [PERF P1-1] critical 5개 우선 로드, 나머지 lazy (cold start 60%↓)
      const [monthRev, prevRev, todayRev, periodRev, customers] = await Promise.all([
        _cachedGet('/revenue?period=month').catch(() => ({ items: [] })),
        prevPath ? _cachedGet(prevPath).catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
        _cachedGet('/revenue?period=today').catch(() => ({ items: [] })),
        _cachedGet('/revenue?period=' + period).catch(() => ({ items: [] })),
        _cachedGet('/customers').catch(() => ({ total: 0, items: [] })),
      ]);
      const fresh = [monthRev, prevRev, todayRev, periodRev, customers, { items: [] }, null, null, null];
      _renderFromData(fresh);

      // 비핵심 데이터 백그라운드 로드 (UI 먼저 그린 후)
      Promise.all([
        _cachedGet('/bookings').catch(() => ({ items: [] })),
        _cachedGet('/retention/at-risk').catch(() => null),
        Promise.resolve(null),   // [2026-07-22] 재고 제거 — 페치 안 함(슬롯 유지)
        _cachedGet('/today/brief?period=' + period).catch(() => null),
      ]).then(([bookings, atRisk, inventory, brief]) => {
        fresh[5] = bookings;
        fresh[6] = atRisk;
        fresh[7] = inventory;
        fresh[8] = brief;
        // [2026-07-26 에러스윕] 비핵심 데이터(예약·위험고객·브리핑) 도착 후 전체 재렌더.
        //   예전엔 _renderBookingWidget 등 '존재하지 않는' 함수를 호출했다. 'X && X()' 가드는
        //   미선언 식별자를 못 막아(ReferenceError) 매번 터졌고, 그래서 예약·위험고객·브리핑 위젯이
        //   데이터가 도착해도 빈 채로 남았다. 완성된 fresh 로 한 번 다시 그린다.
        try { _renderFromData(fresh); } catch(e){ console.warn('[dashboard] fresh 재렌더 실패:', e); }
      }).catch(() => {});
    } catch (_e) {
      // fresh 실패해도 stale 화면은 이미 표시됨 — 조용히 무시
    }
  }

  /* powerview:removed */
  // P3.2 — 탭 진입 시 호출
  window.initDashboardTab = async function () {
    await _loadAndRender();
  };

  // 하위호환 — 설정시트 "대시보드" 메뉴 항목이 아직 호출 (Commit 5에서 메뉴 항목 제거 예정)
  window.openDashboard = function () {
    const btn = document.querySelector('.tab-bar__btn[data-tab="dashboard"]');
    if (typeof window.showTab === 'function') window.showTab('dashboard', btn);
    return window.initDashboardTab();
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
    // [2026-04-26 0초딜레이] 1200ms 폴백 → rAF (다음 프레임). 메인 쓰레드 블로킹 안 함
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 1500 });
    else if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 0);
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

  // 챗봇·외부 데이터 변경 감지 → 대시보드 캐시 비우고 재로드
  if (typeof window !== 'undefined' && !window._dashboardDataListenerInit) {
    window._dashboardDataListenerInit = true;
    window.addEventListener('itdasy:data-changed', async () => {
      try { for (const k in _cache) delete _cache[k]; } catch (_e) { void _e; }
      try { await _loadAndRender(); } catch (_e) { void _e; }
    });
  }
})();
