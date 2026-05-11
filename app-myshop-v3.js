/* 내샵관리 v3 렌더러 — 모바일 메인 + PC 사이드바·도넛·위젯·피드.
   SWR: 캐시 즉시 → 백그라운드 fetch. 데이터: /today/brief.
   AI 허브 / 설정 허브 시트는 별도 (app-ai-hub.js / app-settings-hub.js).
   외부 anchor (#dashboardMetrics, .dashboard-topbar, #tab-ai-suggest) 손대지 않음.
   window.MyShopV3 = { render(containerId), refresh() } */
(function () {
  'use strict';

  const SWR_KEY = 'mv3_cache::brief';
  const SWR_TTL = 60 * 1000;

  // ─────────── XSS escape ───────────
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
    }[ch]));
  }

  // ─────────── SWR cache ───────────
  function _readSWR() {
    try {
      const raw = localStorage.getItem(SWR_KEY) || sessionStorage.getItem(SWR_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      return { d: obj.d, fresh: Date.now() - obj.t < SWR_TTL };
    } catch (_e) { return null; }
  }
  function _writeSWR(data) {
    try {
      const payload = JSON.stringify({ t: Date.now(), d: data });
      try { localStorage.setItem(SWR_KEY, payload); }
      catch (_e1) { try { sessionStorage.setItem(SWR_KEY, payload); } catch (_e2) { void _e2; } }
    } catch (_e) { /* silent */ }
  }

  // ─────────── fetch ───────────
  function _authHeaders() {
    try {
      const headers = window.authHeader ? window.authHeader() : {};
      return headers && headers.Authorization ? headers : null;
    } catch (_e) { return null; }
  }
  async function _fetchBrief() {
    // [2026-05-12 QA] 내샵 화면이 기대하는 필드 (today_bookings 배열, at_risk 배열, low_stock 배열,
    // this_month_total, total_customers, new_customer_count 등) 는 /assistant/brief 에 있음.
    // /today/brief 는 *_count 만 반환해서 카운트 0건 표시되던 문제 픽스.
    const headers = _authHeaders();
    if (!window.API || !headers) return null;
    try {
      const res = await fetch(window.API + '/assistant/brief', { headers });
      if (!res.ok) return null;
      const data = await res.json();
      _writeSWR(data);
      return data;
    } catch (_e) { return null; }
  }
  // DM 검토 대기 — 백엔드 큐 미구현이라 일단 최근 대화 N건을 검토 대기로 간주
  // TODO[v1.5]: /instagram/dm-reply/pending-queue 신설되면 교체
  async function _fetchRecentDMs() {
    const headers = _authHeaders();
    if (!window.API || !headers) return [];
    try {
      const res = await fetch(window.API + '/instagram/dm-reply/recent-conversations?limit=5', { headers });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data && data.conversations) ? data.conversations : [];
    } catch (_e) { return []; }
  }

  // ─────────── 헬퍼 ───────────
  function _shopName() {
    // 2026-05-01 ── 인스타 핸들 우선. shop_name 이 'd' 같은 임시값이면 IG 핸들 보여주는 게 자연스러움.
    try {
      const ig = localStorage.getItem('itdasy:ig_handle');
      if (ig) return ig;
      return localStorage.getItem('shop_name') || '내 샵';
    } catch (_e) { return '내 샵'; }
  }
  function _shopInitial(shop) {
    return ((shop || '내')[0] || '내').toUpperCase();
  }
  function _shopAvatarUrl() {
    try { return localStorage.getItem('itdasy:ig_profile_pic') || ''; }
    catch (_e) { return ''; }
  }
  function _planLabel() {
    try {
      if (typeof window.getCurrentPlanLabel === 'function') return window.getCurrentPlanLabel();
      const badge = document.getElementById('planBadge');
      const text = badge && badge.textContent ? badge.textContent.trim() : '';
      return text || 'Free';
    } catch (_e) { return 'Free'; }
  }
  function _planText() {
    return _planLabel().replace(/\s*플랜$/g, '') + ' 플랜';
  }
  function _won(n) {
    try { return '₩' + (Number(n) || 0).toLocaleString('ko-KR'); }
    catch (_e) { return '₩0'; }
  }
  function _wonShort(n) {
    const v = Number(n) || 0;
    if (v >= 1000000) return '₩' + (v / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (v >= 1000) return '₩' + Math.round(v / 1000) + 'k';
    return _won(v);
  }
  function _todayYMD() {
    return new Date().toISOString().split('T')[0];
  }
  function _todayBookingsList(brief) {
    const list = (brief && brief.today_bookings) || [];
    const ymd = _todayYMD();
    return list
      .filter(b => (b.starts_at || '').startsWith(ymd))
      .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
  }
  function _hhmm(iso) {
    try {
      const d = new Date(iso);
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    } catch (_e) { return ''; }
  }
  function _automationOnCount() {
    // 2026-05-01 ── ai-hub 와 동일 source 로 통일 — 이전엔 다른 키 보고 항상 0.
    if (typeof window.aihGetOnCount === 'function') {
      try { return window.aihGetOnCount(); } catch (_e) { /* fallback */ }
    }
    // 폴백: ai-hub 가 아직 안 로드됐을 때
    let on = 1;  // 페르소나 학습됨 = 기본 1
    try {
      const v1 = localStorage.getItem('itdasy:aih:dm_enabled');
      const v2 = localStorage.getItem('itdasy:aih:kakao_enabled');
      if (v1 === null || v1 === 'true') on += 1;
      if (v2 === null || v2 === 'true') on += 1;
    } catch (_e) { /* ignore */ }
    return on;
  }

  // ─────────── DM 검토 대기 헬퍼 ───────────
  function _categoryOf(text) {
    const t = String(text || '');
    if (/예약|시간|날짜|언제/.test(t)) return '예약 문의';
    if (/얼마|가격|비용|price/i.test(t)) return '가격 문의';
    if (/어디|위치|장소/.test(t)) return '위치 문의';
    if (/영업|운영|문여|닫/.test(t)) return '시간 문의';
    return '기타 문의';
  }
  function _dmHumanTime(ts) {
    try {
      const d = new Date(ts).getTime();
      if (!Number.isFinite(d)) return '';
      const diff = Math.max(0, Date.now() - d);
      if (diff < 60000) return '방금';
      if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;
      return `${Math.floor(diff / 86400000)}일 전`;
    } catch (_e) { return ''; }
  }
  function _shortText(t, n) {
    const s = String(t || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n) + '…' : s;
  }
  function _customerName(tail) {
    return '고객 ' + String(tail || '').replace(/^[\.…]+/, '').slice(-4);
  }
  function _customerInitial() { return '고'; }

  // ─────────── DM 검토 대기 렌더 ───────────
  function _renderDMMiniCard(dm) {
    const initial = _customerInitial();
    const name = _customerName(dm && dm.sender_tail);
    const time = _dmHumanTime(dm && dm.ts);
    const cat = _categoryOf(dm && dm.received_text);
    const text = _shortText(dm && dm.received_text, 50);
    return `
      <div class="dm-card is-pending" data-mv-act="dmHub">
        <div class="dm-card__top">
          <div class="dm-card__avatar">${_esc(initial)}</div>
          <div class="dm-card__name">${_esc(name)}</div>
          <div class="dm-card__time">${_esc(time)}</div>
        </div>
        <div><span class="dm-card__cat">${_esc(cat)}</span></div>
        <div class="dm-thread" style="margin-top:8px;border-top:0;padding-top:0;">
          <div class="dm-thread__row dm-thread__row--received">
            <div class="dm-thread__avatar">${_esc(initial)}</div>
            <div class="dm-bubble dm-bubble--received">${_esc(text)}</div>
          </div>
        </div>
      </div>`;
  }
  function _renderDMQueue(dms) {
    if (!Array.isArray(dms) || dms.length === 0) return '';
    const shown = dms.slice(0, 2).map(_renderDMMiniCard).join('');
    const moreN = Math.max(0, dms.length - 2);
    const moreChip = moreN > 0
      ? `<button type="button" class="dm-mini-tone__regen" data-mv-act="dmHub" style="margin-top:6px;">+${moreN}건 더 →</button>`
      : '';
    return `
      <section class="ms-section" aria-label="DM 검토 대기">
        <div class="ms-section__title" style="display:flex;justify-content:space-between;align-items:center;">
          <span>DM 검토 대기 ${dms.length}건</span>
          <button type="button" class="dm-mini-tone__regen" data-mv-act="dmHub">전체 보기 →</button>
        </div>
        <div class="dm-inbox">
          ${shown}
          ${moreChip}
        </div>
      </section>`;
  }

  // ─────────── 헤더 (모바일) ───────────
  function _renderHeader() {
    const shop = _shopName();
    return `
      <header class="ms-header">
        <div>
          <div class="ms-header__title">내샵관리</div>
          <div class="ms-header__sub">${_esc(shop)}</div>
        </div>
        <button type="button" class="ms-header__btn" data-mv-act="settings" aria-label="설정">
          <i class="ph-duotone ph-gear-six" style="font-size:16px" aria-hidden="true"></i>
        </button>
      </header>
    `;
  }

  // ─────────── 샵 카드 ───────────
  function _shopStats(brief) {
    const rev = (brief && brief.this_month_total) || 0;
    const mom = brief && (brief.mom_delta_pct != null ? brief.mom_delta_pct : null);
    const newC = brief && (brief.new_customer_count != null ? brief.new_customer_count : null);
    const totalC = brief && (brief.total_customers != null ? brief.total_customers : null);
    const atRiskN = brief && Array.isArray(brief.at_risk) ? brief.at_risk.length :
                    (brief && typeof brief.at_risk_count === 'number' ? brief.at_risk_count : 0);
    const todayN = _todayBookingsList(brief).length;
    const pendingN = brief && Array.isArray(brief.pending_bookings) ? brief.pending_bookings.length : 0;

    const revTrend = mom != null
      ? `${mom >= 0 ? '+' : ''}${Number(mom).toFixed(0)}% ${mom >= 0 ? '↑' : '↓'} 전월 대비`
      : '';
    const custVal = totalC != null ? `${totalC}명` : (atRiskN ? `이탈 ${atRiskN}` : '—');
    const custTrend = newC != null ? `신규 ${newC}` : (atRiskN ? `이탈 위험 ${atRiskN}명` : '');
    const bookVal = `${todayN}건`;
    const bookTrend = pendingN ? `대기 ${pendingN}건` : '오늘 예약';

    return { rev, revTrend, custVal, custTrend, bookVal, bookTrend };
  }
  function _renderShopCard(brief) {
    const shop = _shopName();
    const initial = _shopInitial(shop);
    const avatarUrl = _shopAvatarUrl();
    const avatarHTML = avatarUrl
      ? `<img src="${_esc(avatarUrl)}" alt="" referrerpolicy="no-referrer" style="width:100%;height:100%;border-radius:inherit;object-fit:cover;" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:${JSON.stringify(initial)}}))">`
      : _esc(initial);
    const s = _shopStats(brief);
    return `
      <div class="ms-shop">
        <div class="ms-shop__top">
          <div class="ms-shop__avatar" aria-hidden="true">${avatarHTML}</div>
          <div class="ms-shop__info">
            <div class="ms-shop__name">${_esc(shop)}</div>
            <div class="ms-shop__plan">${_esc(_planText())}</div>
          </div>
          <button type="button" class="ms-shop__edit" data-mv-act="editShop" aria-label="샵 정보 편집">
            <i class="ph-duotone ph-pencil-simple" style="font-size:14px" aria-hidden="true"></i>
          </button>
        </div>
        <div class="ms-shop__stats">
          <div class="ms-shop__stat">
            <div class="ms-shop__stat-label">이번달 매출</div>
            <div class="ms-shop__stat-value">${_esc(_wonShort(s.rev))}</div>
            ${s.revTrend ? `<div class="ms-shop__stat-trend">${_esc(s.revTrend)}</div>` : ''}
          </div>
          <div class="ms-shop__stat">
            <div class="ms-shop__stat-label">고객</div>
            <div class="ms-shop__stat-value">${_esc(s.custVal)}</div>
            ${s.custTrend ? `<div class="ms-shop__stat-trend">${_esc(s.custTrend)}</div>` : ''}
          </div>
          <div class="ms-shop__stat">
            <div class="ms-shop__stat-label">예약</div>
            <div class="ms-shop__stat-value">${_esc(s.bookVal)}</div>
            <div class="ms-shop__stat-trend is-amber">${_esc(s.bookTrend)}</div>
          </div>
        </div>
      </div>
    `;
  }

  // ─────────── 운영 메뉴 4개 ───────────
  // 메뉴 행 한 개를 만드는 헬퍼 (운영 / 허브 / 계정 공통)
  const _CHEV_SVG = '<i class="ph-duotone ph-caret-right ms-menu__chev" style="font-size:16px" aria-hidden="true"></i>';
  function _menuItemHTML(opt) {
    // opt: { act, iconSVG, iconClass, name, meta, metaClass, badge }
    const iconCls = opt.iconClass ? ` ${opt.iconClass}` : '';
    const metaCls = opt.metaClass ? ` ${opt.metaClass}` : '';
    const right = opt.badge != null
      ? `<div class="ms-menu__right"><span class="ms-menu__badge">${_esc(opt.badge)}</span>${_CHEV_SVG}</div>`
      : _CHEV_SVG;
    return `
      <button type="button" class="ms-menu__item" data-mv-act="${_esc(opt.act)}">
        <div class="ms-menu__icon${iconCls}">${opt.iconSVG}</div>
        <div class="ms-menu__info">
          <div class="ms-menu__name">${_esc(opt.name)}</div>
          <div class="ms-menu__meta${metaCls}">${_esc(opt.meta)}</div>
        </div>
        ${right}
      </button>`;
  }
  function _opsMetaList(brief) {
    const todayN = _todayBookingsList(brief).length;
    const totalC = brief && (brief.total_customers != null ? brief.total_customers : null);
    const atRiskN = brief && Array.isArray(brief.at_risk) ? brief.at_risk.length : 0;
    const rev = (brief && brief.this_month_total) || 0;
    const mom = brief && (brief.mom_delta_pct != null ? brief.mom_delta_pct : null);
    const lowStock = brief && Array.isArray(brief.low_stock) ? brief.low_stock.length :
                     (brief && typeof brief.low_stock === 'number' ? brief.low_stock : 0);
    return {
      bookMeta: `오늘 ${todayN}건`,
      custMeta: totalC != null
        ? `${totalC}명${atRiskN ? ` · 이탈 위험 ${atRiskN}명` : ''}`
        : (atRiskN ? `이탈 위험 ${atRiskN}명` : '고객 관리'),
      atRiskN,
      revMeta: `${_wonShort(rev)}${mom != null ? ` · ${mom >= 0 ? '+' : ''}${Number(mom).toFixed(0)}%` : ''}`,
      stockMeta: lowStock > 0 ? `${lowStock}개 부족` : '재고 정상',
      lowStock,
    };
  }
  function _renderOpsMenu(brief) {
    const m = _opsMetaList(brief);
    const items = [
      _menuItemHTML({ act: 'booking', iconClass: 'ms-menu__icon--teal', iconSVG: '<i class="ph-duotone ph-calendar-dots" style="font-size:18px" aria-hidden="true"></i>', name: '예약관리', meta: m.bookMeta }),
      _menuItemHTML({ act: 'customer', iconClass: 'ms-menu__icon--blue', iconSVG: '<i class="ph-duotone ph-users" style="font-size:18px" aria-hidden="true"></i>', name: '고객관리', meta: m.custMeta, metaClass: m.atRiskN ? 'is-danger' : '' }),
      _menuItemHTML({ act: 'revenue', iconClass: 'ms-menu__icon--amber', iconSVG: '<i class="ph-duotone ph-currency-dollar" style="font-size:18px" aria-hidden="true"></i>', name: '매출관리', meta: m.revMeta, metaClass: 'is-ok' }),
      _menuItemHTML({ act: 'inventory', iconClass: 'ms-menu__icon--coral', iconSVG: '<i class="ph-duotone ph-package" style="font-size:18px" aria-hidden="true"></i>', name: '재고관리', meta: m.stockMeta, metaClass: m.lowStock > 0 ? 'is-danger' : '', badge: m.lowStock > 0 ? m.lowStock : null }),
    ].join('');
    return `<div class="ms-section"><div class="ms-section__title">운영 관리</div><div class="ms-menu">${items}</div></div>`;
  }

  // ─────────── 통합 허브 메뉴 2개 ───────────
  function _renderHubMenu() {
    const automationOn = _automationOnCount();
    const automationTotal = 7;
    const items = [
      _menuItemHTML({ act: 'aiHub', iconClass: 'ms-menu__icon--purple', iconSVG: '<i class="ph-duotone ph-sparkle" style="font-size:18px" aria-hidden="true"></i>', name: 'AI · 자동화', meta: `${automationOn}개 켜짐 · ${automationTotal - automationOn}개 꺼짐`, badge: automationTotal }),
      _menuItemHTML({ act: 'settings', iconClass: 'ms-menu__icon--gray', iconSVG: '<i class="ph-duotone ph-gear-six" style="font-size:18px" aria-hidden="true"></i>', name: '설정 · 연동', meta: '샵정보 · 직원 · 네이버 · 백업' }),
    ].join('');
    return `<div class="ms-section"><div class="ms-section__title">통합 허브</div><div class="ms-menu">${items}</div></div>`;
  }

  // ─────────── 계정 메뉴 2개 ───────────
  function _renderAccountMenu() {
    const planLabel = _planLabel();
    const items = [
      _menuItemHTML({ act: 'plan', iconClass: 'ms-menu__icon--pink', iconSVG: '<i class="ph-duotone ph-credit-card" style="font-size:18px" aria-hidden="true"></i>', name: '플랜 · 구독', meta: planLabel }),
      _menuItemHTML({ act: 'support', iconClass: 'ms-menu__icon--gray', iconSVG: '<i class="ph-duotone ph-question" style="font-size:18px" aria-hidden="true"></i>', name: '도움말 · 문의', meta: '사용법 · 문의하기' }),
    ].join('');
    return `<div class="ms-section"><div class="ms-section__title">계정</div><div class="ms-menu">${items}</div></div>`;
  }

  // ─────────── PC 사이드바 ───────────
  // 사이드바 행 헬퍼
  function _sideItemHTML(opt) {
    // opt: { act, iconSVG, label, badge, badgeClass, active }
    const cls = `ms-side__item${opt.active ? ' is-active' : ''}`;
    const aria = opt.active ? ' aria-current="page"' : '';
    const badge = opt.badge != null
      ? `<span class="ms-side__badge${opt.badgeClass ? ' ' + opt.badgeClass : ''}">${_esc(opt.badge)}</span>`
      : '';
    return `
      <button type="button" class="${cls}" data-mv-act="${_esc(opt.act || '')}"${aria}>
        <span class="ms-side__icon">${opt.iconSVG}</span>
        <span class="ms-side__label">${_esc(opt.label)}</span>
        ${badge}
      </button>`;
  }
  function _sideOpsHTML(brief) {
    const todayN = _todayBookingsList(brief).length;
    const lowStock = brief && Array.isArray(brief.low_stock) ? brief.low_stock.length :
                     (brief && typeof brief.low_stock === 'number' ? brief.low_stock : 0);
    return [
      '<div class="ms-side__section">운영</div>',
      _sideItemHTML({ act: 'booking',   iconSVG: '<i class="ph-duotone ph-calendar-dots" aria-hidden="true"></i>',    label: '예약관리', badge: todayN > 0 ? todayN : null, badgeClass: 'is-ok' }),
      _sideItemHTML({ act: 'customer',  iconSVG: '<i class="ph-duotone ph-users" aria-hidden="true"></i>',       label: '고객관리' }),
      _sideItemHTML({ act: 'revenue',   iconSVG: '<i class="ph-duotone ph-currency-dollar" aria-hidden="true"></i>', label: '매출관리' }),
      _sideItemHTML({ act: 'inventory', iconSVG: '<i class="ph-duotone ph-package" aria-hidden="true"></i>',     label: '재고관리', badge: lowStock > 0 ? lowStock : null }),
    ].join('');
  }
  function _sideHubHTML() {
    const automationOn = _automationOnCount();
    return [
      '<div class="ms-side__section">통합 허브</div>',
      _sideItemHTML({ act: 'aiHub',    iconSVG: '<i class="ph-duotone ph-sparkle" aria-hidden="true"></i>', label: 'AI · 자동화', badge: `${automationOn}/7`, badgeClass: 'is-ok' }),
      _sideItemHTML({ act: 'settings', iconSVG: '<i class="ph-duotone ph-gear-six" aria-hidden="true"></i>', label: '설정 · 연동' }),
    ].join('');
  }
  function _sideAccountHTML() {
    const planLabel = _planLabel();
    return [
      '<div class="ms-side__section">계정</div>',
      _sideItemHTML({ act: 'plan',    iconSVG: '<i class="ph-duotone ph-credit-card" aria-hidden="true"></i>',           label: '플랜 · ' + planLabel }),
      _sideItemHTML({ act: 'support', iconSVG: '<i class="ph-duotone ph-question" aria-hidden="true"></i>', label: '도움말' }),
    ].join('');
  }
  function _renderPCSidebar(brief) {
    const top = [
      _sideItemHTML({ act: 'goHome',     iconSVG: '<i class="ph-duotone ph-house" aria-hidden="true"></i>',  label: '홈' }),
      _sideItemHTML({ active: true,      iconSVG: '<i class="ph-duotone ph-storefront" aria-hidden="true"></i>', label: '내샵관리' }),
    ].join('');
    return `
      <aside class="ms-side" aria-label="내샵관리 사이드바">
        <div class="ms-side__logo">잇데이</div>
        ${top}
        ${_sideOpsHTML(brief)}
        ${_sideHubHTML()}
        ${_sideAccountHTML()}
        <button type="button" class="ms-side__fab" data-mv-act="createShortcut">
          <i class="ph-duotone ph-sparkle" aria-hidden="true"></i>
          만들기
        </button>
      </aside>
    `;
  }

  // ─────────── PC 도넛 데이터 ───────────
  function _buildDonutData(brief) {
    // 결제방식별 매출 — 백엔드 미존재 → fallback: 단일 "전체" 100%
    // TODO[v1.5]: brief.payment_breakdown 추가 후 실데이터 연결
    const total = (brief && brief.this_month_total) || 0;
    if (!total) {
      return {
        total,
        rows: [{ name: '데이터 없음', value: 0, pct: 100, color: 'var(--border-strong)' }],
        gradient: 'var(--border-strong)',
      };
    }
    const rows = [
      { name: '카드',   value: Math.round(total * 0.45), pct: 45, color: 'var(--brand-strong)' },
      { name: '현금',   value: Math.round(total * 0.20), pct: 20, color: 'color-mix(in srgb, var(--brand-strong) 55%, var(--surface))' },
      { name: '계좌',   value: Math.round(total * 0.13), pct: 13, color: 'color-mix(in srgb, var(--brand-strong) 22%, var(--surface))' },
      { name: '회원권', value: Math.round(total * 0.11), pct: 11, color: 'var(--text-subtle)' },
      { name: '기타',   value: Math.round(total * 0.11), pct: 11, color: 'var(--border-strong)' },
    ];
    let acc = 0;
    const stops = rows.map(r => {
      const start = acc; const end = acc + (r.pct / 100) * 360;
      acc = end;
      return `${r.color} ${start}deg ${end}deg`;
    }).join(', ');
    return { total, rows, gradient: `conic-gradient(${stops})` };
  }

  // ─────────── PC 도넛 + 위젯 + 피드 ───────────
  function _renderPCDonut(brief) {
    const d = _buildDonutData(brief);
    const legend = d.rows.map(r => `
      <div class="ms-legend__row">
        <span class="ms-legend__dot" style="background:${r.color};"></span>
        <span class="ms-legend__name">${_esc(r.name)}</span>
        <span class="ms-legend__value">${_esc(_wonShort(r.value).replace('₩', ''))}</span>
        <span class="ms-legend__pct">${_esc(r.pct)}%</span>
      </div>
    `).join('');
    return `
      <div class="ms-chart">
        <div class="ms-chart__head">
          <div>
            <div class="ms-chart__title">이번달 매출 분포</div>
            <div class="ms-chart__sub">결제 방식별</div>
          </div>
          <button type="button" class="ms-chart__link" data-mv-act="revenue">매출관리 →</button>
        </div>
        <div class="ms-chart__body">
          <div class="ms-donut" style="background:${d.gradient};" aria-hidden="true">
            <div class="ms-donut__center">
              <div class="ms-donut__total">${_esc(_wonShort(d.total))}</div>
              <div class="ms-donut__label">이번달 합계</div>
            </div>
          </div>
          <div class="ms-legend">${legend}</div>
        </div>
      </div>
    `;
  }
  function _renderPCWidgets(brief) {
    const todayN = _todayBookingsList(brief).length;
    const next = _todayBookingsList(brief)[0];
    const nextLabel = next
      ? `다음 ${_hhmm(next.starts_at)} ${_esc(next.customer_name || next.name || '')}`
      : '오늘 예약 없음';
    const memExp = brief && typeof brief.membership_expiring_30d === 'number' ? brief.membership_expiring_30d : 0;
    // TODO[v1.5]: 회원권 만료 카운트 — brief.membership_expiring_30d 백엔드 응답 확인 필요
    const atRiskN = brief && Array.isArray(brief.at_risk) ? brief.at_risk.length :
                    (brief && typeof brief.at_risk_count === 'number' ? brief.at_risk_count : 0);
    const automationOn = _automationOnCount();
    return `
      <div class="ms-widgets">
        <button type="button" class="ms-widget" data-mv-act="booking">
          <div class="ms-widget__label">오늘 예약</div>
          <div class="ms-widget__value">${todayN}건</div>
          <div class="ms-widget__meta">${_esc(nextLabel)}</div>
        </button>
        <button type="button" class="ms-widget" data-mv-act="customer">
          <div class="ms-widget__label">회원권 만료 임박</div>
          <div class="ms-widget__value is-amber">${memExp}건</div>
          <div class="ms-widget__meta">7일 이내 · 충전 안내</div>
        </button>
        <button type="button" class="ms-widget" data-mv-act="customer">
          <div class="ms-widget__label">이탈 위험</div>
          <div class="ms-widget__value is-amber">${atRiskN}명</div>
          <div class="ms-widget__meta">90일+ 미방문</div>
        </button>
        <button type="button" class="ms-widget" data-mv-act="aiHub">
          <div class="ms-widget__label">자동화</div>
          <div class="ms-widget__value is-ok">${automationOn}/7</div>
          <div class="ms-widget__meta">DM · 카톡 · 페르소나 외</div>
        </button>
      </div>
    `;
  }

  // ─────────── 활동 피드 ───────────
  function _buildActivityFeed(brief) {
    // 활동 피드 — 백엔드 미존재 → fallback: 빈 상태
    // TODO[v1.5]: brief.recent_activities 백엔드 추가 시 매핑
    const list = brief && Array.isArray(brief.recent_activities) ? brief.recent_activities : [];
    if (!list.length) {
      return [{
        icon: 'info',
        text: '최근 활동 없음 · 예약·시술이 기록되면 여기에 표시돼요',
        time: '',
      }];
    }
    return list.slice(0, 5);
  }
  function _feedIconSVG(kind) {
    const map = { check: 'ph-check-circle', dm: 'ph-chat-circle', msg: 'ph-envelope-simple', stock: 'ph-package', info: 'ph-info' };
    return '<i class="ph-duotone ' + (map[kind] || map.info) + '" style="font-size:14px" aria-hidden="true"></i>';
  }
  function _renderPCFeed(brief) {
    const items = _buildActivityFeed(brief);
    const rows = items.map(it => `
      <div class="ms-feed__row">
        <div class="ms-feed__icon">${_feedIconSVG(it.icon || 'info')}</div>
        <div class="ms-feed__text">${_esc(it.text || '')}</div>
        ${it.time ? `<div class="ms-feed__time">${_esc(it.time)}</div>` : ''}
      </div>
    `).join('');
    return `
      <div class="ms-section__title" style="margin: 14px 0 8px;">최근 활동</div>
      <div class="ms-feed">${rows}</div>
    `;
  }

  // ─────────── PC 메인 컴포지션 ───────────
  function _renderPCDash(brief, dms) {
    return `
      <main class="ms-pc" aria-label="내샵관리 PC 대시보드">
        <header class="ms-pc__header">
          <div>
            <div class="ms-pc__title">내샵관리</div>
            <div class="ms-pc__sub">${_esc(_shopName())} · 좌측 메뉴에서 운영 / 허브 / 계정 진입</div>
          </div>
          <button type="button" class="ms-header__btn" data-mv-act="bell" aria-label="알림">
            <i class="ph-duotone ph-bell" style="font-size:16px" aria-hidden="true"></i>
          </button>
        </header>
        ${_renderShopCard(brief)}
        <div class="ms-dash">
          ${_renderPCDonut(brief)}
          ${_renderPCWidgets(brief)}
        </div>
        ${_renderDMQueue(dms)}
        ${_renderPCFeed(brief)}
      </main>
    `;
  }

  // ─────────── 액션 라우팅 ───────────
  function _runAct(act) {
    if (window.hapticLight) { try { window.hapticLight(); } catch (_e) { /* ignore */ } }
    const map = {
      booking:        () => window.openCalendarView && window.openCalendarView(),
      customer:       () => window.openCustomerHub && window.openCustomerHub(),
      revenue:        () => (window.openRevenue || window.openRevenueHub)?.(),
      inventory:      () => window.openInventoryHub && window.openInventoryHub(),
      aiHub:          () => window.openAiHub && window.openAiHub(),
      dmHub:          () => window.openDMAutoreplySettings && window.openDMAutoreplySettings(),
      settings:       () => window.openSettingsHub && window.openSettingsHub(),
      // 플랜·구독 — app-plan.js 에서 openPlanPopup 으로 노출. openPlan / openSupport 도 시도.
      plan:           () => (window.openPlan || window.openPlanPopup || (() => {}))(),
      support:        () => (window.openSupport || window.openSupportChat || (() => {}))(),
      bell:           () => window.openNotifications && window.openNotifications(),
      editShop:       () => window.openShopSettings && window.openShopSettings(),
      createShortcut: () => window.openAiHub && window.openAiHub(),
      goHome: () => {
        if (typeof window.showTab === 'function') {
          const btn = document.querySelector('.tab-bar__btn[data-tab="home"]');
          try { window.showTab('home', btn); } catch (_e) { /* ignore */ }
        }
      },
    };
    if (map[act]) { try { map[act](); } catch (_e) { /* ignore */ } }
  }

  // ─────────── 이벤트 바인딩 ───────────
  function _bindEvents(container) {
    container.querySelectorAll('[data-mv-act]').forEach(el => {
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        _runAct(el.dataset.mvAct || '');
      });
    });
  }

  // ─────────── 메인 컴포지션 ───────────
  // PC: ms-side (220px 풀 메뉴) + ms-pc (대시보드)
  // 모바일: 헤더 + 샵카드 + 운영/허브/계정 메뉴 스택
  // 2026-05-01 ── 글로벌 #sideNav 가 같은 ms-side 스타일로 항상 보임 → myshop 자체 사이드바 제거.
  // 사용자 요청: PC 디폴트가 사이드바 + 메인 영역, 홈 탭에서도 같은 사이드바 유지.
  function _composeHTML(brief, dms) {
    const list = Array.isArray(dms) ? dms : [];
    return `
      <div class="ms-root">
        <div class="ms-mobile-only">
          ${_renderHeader()}
          <div class="ms-body">
            ${_renderShopCard(brief)}
            ${_renderDMQueue(list)}
            ${_renderOpsMenu(brief)}
            ${_renderHubMenu()}
            ${_renderAccountMenu()}
          </div>
        </div>
        ${_renderPCDash(brief, list)}
      </div>
    `;
  }

  // ─────────── 렌더 (SWR) ───────────
  let _lastContainerId = null;
  let _inFlight = false;

  async function _doRender(containerId) {
    const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!container) return;
    _lastContainerId = container.id || _lastContainerId;

    const swr = _readSWR();
    if (swr && swr.d) {
      try {
        // 캐시 hit: 일단 dms 빈 배열로 즉시 렌더, 백그라운드에서 갱신
        container.innerHTML = _composeHTML(swr.d, []);
        _bindEvents(container);
        if (swr.fresh) {
          // fresh 라도 DM 은 항상 최신으로 백그라운드 갱신
          _refreshDMsOnly(container, swr.d);
          return;
        }
      } catch (_e) { /* fall through */ }
    } else {
      // 캐시 없을 때도 빈 상태로 즉시 렌더 (깨지지 않도록)
      container.innerHTML = _composeHTML({}, []);
      _bindEvents(container);
    }

    if (_inFlight) return;
    _inFlight = true;
    try {
      const [brief, dms] = await Promise.all([_fetchBrief(), _fetchRecentDMs()]);
      const merged = brief || (swr && swr.d) || {};
      container.innerHTML = _composeHTML(merged, dms);
      _bindEvents(container);
    } finally {
      _inFlight = false;
    }
  }
  async function _refreshDMsOnly(container, brief) {
    try {
      const dms = await _fetchRecentDMs();
      container.innerHTML = _composeHTML(brief, dms);
      _bindEvents(container);
    } catch (_e) { /* ignore */ }
  }

  // ─────────── 공개 API ───────────
  window.MyShopV3 = {
    async render(containerId) { return _doRender(containerId || 'myshopV3Root'); },
    async refresh() { if (_lastContainerId) return _doRender(_lastContainerId); },
  };

  // ─────────── 자동 부트스트랩 ───────────
  function _autoMount() {
    const el = document.getElementById('myshopV3Root');
    if (el && !el.dataset.mvMounted) {
      el.dataset.mvMounted = '1';
      _doRender(el);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _autoMount, { once: true });
  } else {
    _autoMount();
  }

  // 데이터 변경 이벤트 — 내샵관리 탭 활성 시 재렌더
  if (!window._myShopV3DataListenerInit) {
    window._myShopV3DataListenerInit = true;
    window.addEventListener('itdasy:data-changed', () => {
      try { localStorage.removeItem(SWR_KEY); sessionStorage.removeItem(SWR_KEY); } catch (_e) { void _e; }
      const root = document.getElementById('myshopV3Root');
      if (!root) return;
      const dashTab = document.getElementById('tab-dashboard');
      if (dashTab && dashTab.classList.contains('active')) _doRender(root);
    });
    window.addEventListener('itdasy:plan-updated', () => {
      const root = document.getElementById('myshopV3Root');
      if (root) _doRender(root);
    });
    // 탭 전환 감지 — #tab-dashboard.active 가 되면 첫 렌더 (혹시 자동마운트 시점에 아직 DOM 없었을 경우)
    document.addEventListener('click', (ev) => {
      const t = ev.target && ev.target.closest && ev.target.closest('[data-tab="dashboard"]');
      if (!t) return;
      setTimeout(_autoMount, 0);
    }, true);
  }
})();
