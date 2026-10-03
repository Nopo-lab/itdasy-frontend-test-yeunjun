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
  /* [2026-10-01 perf-03] 부팅 워밍 소유자(app-perf-recovery _perfPrefetchBoot)가 채운 SWR(pv_cache::*)를
     대시보드 캐시 형태({items,total} / brief 객체)로 읽는다. 예전엔 대시보드가 같은 URL 을 rIC 시점에
     또 불러 자기 dash_cache:: 에 따로 담았다(실측 1879ms vs 소유자 2029ms → 네트워크 2회).
     이제 소유자 캐시를 그대로 쓰니 '내 샵 관리' 첫 진입 0ms 는 그대로고 부팅 요청은 한 번이다.
     SWR 형식: {t, d: items|object, n: total} — items 가 배열이면 {items, total} 로 감싼다. */
  /* [2026-10-02 perf-backend-04 BE-G2-B] 매출은 **합계만** 쓴다 → summary_only=1(목록 생략, 서버 total 은 기간 전체).
     부팅 프리페치(app-perf-recovery BOOT_PREFETCH · app-core _preloadTabs 폴백)와 **같은 URL** 이어야
     apiFetch in-flight 코얼레싱과 이 SWR 맵이 맞물린다(가드: __tests__/list-api-contract-summary-only-2026-10-01). */
  const _OWNER_SWR_KEYS = {
    '/revenue?period=month&summary_only=1': 'pv_cache::revenue::month',
    '/revenue?period=today&summary_only=1': 'pv_cache::revenue::today',
    '/revenue?period=week&summary_only=1':  'pv_cache::revenue::week',
    '/customers':            'pv_cache::customers',
    '/today/brief':          'pv_cache::today',
  };
  function _revPath(period) { return '/revenue?period=' + period + '&summary_only=1'; }
  function _fromOwnerSWR(path, maxAgeMs) {
    try {
      const key = _OWNER_SWR_KEYS[path];
      if (!key) return null;
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.t) return null;
      if (maxAgeMs && Date.now() - obj.t > maxAgeMs) return null;
      const d = obj.d;
      if (d == null) return null;
      if (!Array.isArray(d)) return d;
      // n = 서버가 센 total. 고객은 전체 수, 매출은 기간 전체 합계(원) — 예전엔 매출의 n 을 버려서
      //   summary_only 캐시(d=[])로 그린 첫 화면이 0원, 목록 캐시면 잘린 items 합이 됐다.
      const n = Number.isFinite(obj.n) ? obj.n : null;
      if (path === '/customers') return { items: d, total: n != null ? n : d.length };
      return n != null ? { items: d, total: n } : { items: d };
    } catch (_) { return null; }
  }
  function _getCached(path) {
    try {
      const raw = sessionStorage.getItem(_cacheKey(path));
      if (!raw) return _fromOwnerSWR(path, _CACHE_TTL);
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
        return _fromOwnerSWR(path, 0);
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

  /* ── 재방문율 (2026-10-03 BE-G3-Z) ─────────────────────────────
     예전엔 GET /retention/at-risk 의 summary.retention_rate 를 읽었는데 **그 필드는 서버 응답에 없다**
     (summary 는 total/at_risk/lost 뿐) → 칸은 늘 '—' 였고, 데이터가 바뀔 때마다 이탈 고객 목록 전체
     (perf3 매장1 1,105명·261KB, 새 대시보드 세트에서 가장 느린 호출)를 받아 버렸다. '위험 신호' 는 이미
     /today/brief 의 at_risk_count 를 쓰므로 at-risk 호출은 쓰이는 값이 0개였다 → 호출을 뺐다.
     재방문율은 **이미 받는 /customers** 로 센다 — 각 손님의 visit_count 는 매출 원장 기준 진실원
     (services/customer_visits, 고객관리 화면과 같은 값)이다.
       재방문율 = 2회 이상 방문한 손님 ÷ 1회 이상 방문한 손님 (방문 0회 손님은 분모에서 뺀다)
     🔑 목록이 매장 전체일 때만 % 를 낸다. GET /customers 는 첫 페이지(200명, 최근 등록순)만 주므로
        고객이 더 많으면 '최근 등록 200명' 은 신규 쪽으로 치우친 표본이다 — 그걸로 낸 % 는 매장 재방문율이
        아니다. 그때는 숫자를 지어내지 않고 '미집계' + 이유(고객 N명 중 M명만 받음)를 그대로 보여준다.
     반환: { val, note } — val 은 칸 값, note 는 근거 한 줄(없으면 ''). */
  function _revisitRate(custList) {
    if (custList && custList._failed) return { val: '불러오지 못함', note: '고객 목록을 받지 못했어요' };
    const items = custList && Array.isArray(custList.items) ? custList.items : null;
    if (!items) return { val: '—', note: '' };   // 아직 데이터 없음(캐시도 없음) — 곧 fresh 로 다시 그린다
    const total = Number.isFinite(custList.total) ? custList.total : items.length;
    if (items.length < total) {
      return { val: '미집계', note: `고객 ${total.toLocaleString()}명 중 ${items.length.toLocaleString()}명만 받아 계산하지 않았어요` };
    }
    const vc = (c) => Number((c && c.visit_count) || 0);
    const visited = items.filter(c => vc(c) >= 1).length;
    if (visited === 0) return { val: '방문 기록 없음', note: '' };
    const returning = items.filter(c => vc(c) >= 2).length;
    return { val: Math.round((returning / visited) * 100) + '%', note: `방문 손님 ${visited}명 중 ${returning}명이 2회 이상` };
  }

  // ── Hero 카드 (Task 6: '이번달 브리핑' 흡수, Task 7: 기간 토글 연동) ─────
  function _heroSection(stats, prevAmount, custList, briefData, period) {
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
    const newCustomers = ((custList && custList.items) || []).filter(c =>
      c.created_at && new Date(c.created_at).getTime() >= rangeStart
    ).length;
    const newCustStr = newCustomers > 0 ? newCustomers + '명' : '—';

    // 재방문: 매장 전체 기준(기간 의존 X) — 계산 규칙·'미집계' 조건은 _revisitRate 주석
    const revisit = _revisitRate(custList);

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
          <div class="db-hero__mini" data-db-revisit>
            <p class="db-hero__mini-lbl">재방문</p>
            <p class="db-hero__mini-val">${_esc(revisit.val)}</p>
            ${revisit.note ? `<p class="db-hero__mini-lbl" style="margin-top:2px;">${_esc(revisit.note)}</p>` : ''}
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
  /* [2026-10-02 perf-backend-04 BE-G2-B] 금액은 **응답 total**(DB 가 기간 전체로 낸 합계)을 쓴다.
     예전엔 items 를 다시 더했는데 GET /revenue 목록은 기본 2,000행에서 잘린다 — 한 달 매출이 2,000건을
     넘는 매장은 브리핑 금액이 '최신 2,000건의 합' 이었다(2,500건·250만 원 → 200만 원). total 은 환불(음수)을
     뺀 순매출이라 items 합과 정의가 같다. total 이 없는 옛 캐시 형태일 때만 items 합으로 폴백.
     '다가오는 예약 수' 는 범위 없는 GET /bookings 로 세던 값인데 화면 어디에도 안 쓰였다 — 히어로의
     '오늘 예약' 은 /today/brief 의 upcoming_count 를 쓴다. 그래서 그 호출과 함께 뺐다(perf-backend-01). */
  function _revTotal(resp) {
    if (resp && Number.isFinite(resp.total)) return resp.total;
    return ((resp && resp.items) || []).reduce((s, r) => s + (r.amount || 0), 0);
  }
  function _revCount(resp) {
    if (resp && Number.isFinite(resp.count)) return resp.count;
    return ((resp && resp.items) || []).length;
  }
  function _aggregateStats(monthRev, todayRev, periodRev, customersCount) {
    return {
      today_amount: _revTotal(todayRev),
      today_count: _revCount(todayRev),
      month_amount: _revTotal(monthRev),
      period_amount: _revTotal(periodRev),
      customer_count: customersCount,
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
    /* [2026-10-01 perf-03] 부팅 워밍은 단일 소유자(app-perf-recovery _perfPrefetchBoot)에게 맡긴다.
       예전엔 여기서 같은 3개를 rIC 시점에 또 불러 소유자의 rAF 워밍과 시점이 어긋나 in-flight 코얼레싱이
       안 됐다(실측 네트워크 2회). 게다가 탭이 실제로 쓰는 브리핑은 /today/brief?period=… 라 /today/brief
       워밍은 쓰이지도 않았다. 소유자가 채운 SWR 은 위 _fromOwnerSWR 로 읽는다. */
    if (typeof window._perfPrefetchBoot === 'function') {
      try { await window._perfPrefetchBoot(); } catch (_) { /* silent */ }
      return;
    }
    const paths = ['/today/brief', _revPath('month'), '/customers'];
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
      _revPath('month'),
      prevPath,
      _revPath('today'),
      _revPath(period),
      '/customers',
      null,   // [2026-10-02 perf-backend-01] 범위 없는 /bookings 제거 — 슬롯만 유지(뒤 인덱스 재정렬 방지)
      null,   // [2026-10-03 BE-G3-Z] /retention/at-risk 제거 — 쓰던 필드(retention_rate)가 응답에 없었다. 재방문율은 /customers 로(_revisitRate)
      null,   // [2026-07-22] 재고 제거 — 슬롯만 유지(뒤 인덱스 재정렬 방지)
      '/today/brief?period=' + period,
    ];

    function _renderFromData(data) {
      const [monthRev, prevRev, todayRev, periodRev, custList, _bookings, _ret, _inventory, briefData] = data;
      const stats = _aggregateStats(
        monthRev || {},
        todayRev || {},
        periodRev || {},
        (custList && custList.total != null) ? custList.total : ((custList || {}).items || []).length,
      );
      const prevAmount = _revTotal(prevRev || {});
      body.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
          ${_periodToggle(period)}
        </div>
        ${_heroSection(stats, prevAmount, custList || null, briefData, period)}
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
        staleData[4] || null,                  // custList — 캐시 없으면 null('—', 곧 fresh 로 다시 그림). 빈 목록으로 꾸미면 재방문 칸이 '방문 기록 없음' 이 된다
        null,                                  // (예약 슬롯 — 미사용)
        null,                                  // (위험 고객 슬롯 — 미사용, BE-G3-Z)
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
        _cachedGet(_revPath('month')).catch(() => ({ items: [] })),
        prevPath ? _cachedGet(prevPath).catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
        _cachedGet(_revPath('today')).catch(() => ({ items: [] })),
        _cachedGet(_revPath(period)).catch(() => ({ items: [] })),
        // [2026-10-03 BE-G3-Z] 실패를 빈 목록({total:0, items:[]})으로 바꾸면 재방문 칸이 '방문 기록 없음' 이라고
        //   거짓말을 한다 → 실패 표식을 달아 '불러오지 못함' 으로 그린다(합계·신규 고객 계산은 빈 목록과 같다).
        _cachedGet('/customers').catch(() => ({ total: 0, items: [], _failed: true })),
      ]);
      const fresh = [monthRev, prevRev, todayRev, periodRev, customers, null, null, null, null];
      _renderFromData(fresh);

      // 비핵심 데이터 백그라운드 로드 (UI 먼저 그린 후)
      Promise.all([
        Promise.resolve(null),   // [2026-10-02 perf-backend-01] 범위 없는 /bookings 제거(쓰는 화면 없음) — 슬롯 유지
        Promise.resolve(null),   // [2026-10-03 BE-G3-Z] /retention/at-risk 제거 — 쓰는 값 0개(위 _revisitRate 주석) — 슬롯 유지
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
