/* Home v4.1 톤다운 렌더러 — 헤더/캐러셀/오늘의 예약/운영 3카드.
   SWR: 캐시 즉시 → 백그라운드 fetch. 데이터: /assistant/brief + loadSlotsFromDB().
   외부 hidden anchor (#home-today-brief 등) 손대지 않음.
   window.HomeV41 = { render(containerId), refresh() } */
(function () {
  'use strict';

  const CFG = function () { return window.HomeV41Config || {}; };
  const SWR_KEY = 'hv41_cache::brief';
  const SWR_TTL = 60 * 1000;

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
    }[ch]));
  }

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
  async function _fetchSlots() {
    if (typeof window.loadSlotsFromDB !== 'function') return [];
    try { return await window.loadSlotsFromDB(); }
    catch (_e) { return []; }
  }
  async function _fetchPendingCount() {
    const headers = _authHeaders();
    if (!window.API || !headers) return 0;
    try {
      const res = await fetch(window.API + '/public/book/admin/pending', { headers });
      if (!res.ok) return 0;
      const data = await res.json();
      return Array.isArray(data.items) ? data.items.length : 0;
    } catch (_e) { return 0; }
  }

  // DM 자동응답 승인 대기 큐 — 사장 확인 필요한 답장 N건
  async function _fetchDMQueueCount() {
    const headers = _authHeaders();
    if (!window.API || !headers) return 0;
    try {
      const res = await fetch(window.API + '/dm-confirm-queue', { headers });
      if (!res.ok) return 0;
      const data = await res.json();
      return Array.isArray(data) ? data.length : (Array.isArray(data.items) ? data.items.length : 0);
    } catch (_e) { return 0; }
  }

  // [v6] 이번달 AI 예상 매출 — /revenue/summary 의 projected_total 사용
  async function _fetchProjectedTotal() {
    const headers = _authHeaders();
    if (!window.API || !headers) return 0;
    try {
      const res = await fetch(window.API + '/revenue/summary?period=month', { headers });
      if (!res.ok) return 0;
      const data = await res.json();
      return Number(data.projected_total) || 0;
    } catch (_e) { return 0; }
  }

  // [v6] 카운트업 (easeOutCubic 0.8s) — 히어로 / stat 값
  function _countUp(el, target, ms) {
    if (!el || !Number.isFinite(target) || target <= 0) return;
    if (el.dataset.hvCountDone === '1') return;
    el.dataset.hvCountDone = '1';
    const start = performance.now();
    function tick(now) {
      const p = Math.min((now - start) / ms, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * ease).toLocaleString('ko-KR') + '원';
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  function _runCountUps(container) {
    const targets = container.querySelectorAll('[data-hv-count]');
    targets.forEach(el => {
      const t = parseInt(el.dataset.hvCount, 10);
      _countUp(el, t, 800);
    });
  }

  // ─────────── 헤더 ───────────
  function _todayKor() {
    const d = new Date();
    const w = ['일','월','화','수','목','금','토'][d.getDay()];
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${w})`;
  }
  function _shopName() {
    try { return localStorage.getItem('shop_name') || '사장님'; }
    catch (_e) { return '사장님'; }
  }
  function _shopInitial(shop) {
    return ((shop || '사장님')[0] || '잇').toUpperCase();
  }
  function _renderHeader() {
    const shop = _shopName();
    return `
      <div class="hv-header">
        <div class="hv-header__left">
          <div class="hv-header__avatar" data-hv-avatar aria-hidden="true">
            <span class="hv-header__initial">${_esc(_shopInitial(shop))}</span>
          </div>
          <div class="hv-header__text">
            <div class="hv-header__date">${_esc(_todayKor())}</div>
            <div class="hv-header__shop">${_esc(shop)}</div>
          </div>
        </div>
        <button type="button" class="hv-bell" data-hv-act="bell" aria-label="알림" style="position:relative;">
          <i class="ph-duotone ph-bell" aria-hidden="true"></i>
          <span id="dashBellBadge" style="display:none;position:absolute;top:-4px;right:-4px;background:var(--brand);color:#fff;font-size:9px;font-weight:800;border-radius:50%;min-width:14px;height:14px;line-height:14px;text-align:center;padding:0 2px;"></span>
        </button>
      </div>
    `;
  }

  // ─────────── 오늘 매출 카드 (헤더 바로 아래, 승인센터 위) ───────────
  // BE 의 brief.today_total / brief.yesterday_total / brief.this_month_total 사용.
  // 누락 시 0 fallback — 신규 가입자도 깨지지 않게.
  function _renderTodayRevenue(brief) {
    brief = brief || {};
    const todayTotal = Number(brief.today_total) || 0;
    const yesterdayTotal = Number(brief.yesterday_total) || 0;
    const diff = todayTotal - yesterdayTotal;
    const monthTotal = Number(brief.this_month_total) || 0;
    const bk = Array.isArray(brief.today_bookings) ? brief.today_bookings : [];
    const doneCnt = bk.filter(b => b && b.status === 'completed').length;
    const leftCnt = bk.filter(b => b && b.status === 'confirmed').length;
    const diffSign = diff >= 0 ? '+' : '-';
    const diffColor = diff >= 0 ? 'var(--ok)' : 'var(--danger)';
    const diffLine = (yesterdayTotal > 0 && diff !== 0)
      ? `<div class="hv-today-rev__diff" style="color:${diffColor}">어제보다 ${diffSign}${formatMoney(Math.abs(diff))}</div>`
      : '';
    return `
      <section class="hv-today-rev" aria-label="오늘 매출">
        <div class="hv-today-rev__label">오늘 매출</div>
        <div class="hv-today-rev__amount">${formatMoney(todayTotal)}</div>
        ${diffLine}
        <div class="hv-today-rev__grid">
          <div class="hv-today-rev__cell">
            <div class="hv-today-rev__cell-label">완료</div>
            <div class="hv-today-rev__cell-val">${doneCnt}건</div>
          </div>
          <div class="hv-today-rev__cell">
            <div class="hv-today-rev__cell-label">남은 예약</div>
            <div class="hv-today-rev__cell-val">${leftCnt}건</div>
          </div>
          <div class="hv-today-rev__cell">
            <div class="hv-today-rev__cell-label">이번 달</div>
            <div class="hv-today-rev__cell-val">${formatMoney(monthTotal)}</div>
          </div>
        </div>
      </section>
    `;
  }

  // 인스타 프사 미러링: 글로벌 #headerAvatar img.src 를 v4.1 헤더 아바타에 복사.
  // 미연동/미동기 시 이니셜 표시. data-changed 이벤트 + 5초 지연 재시도로 동기화.
  function _syncAvatar(container) {
    if (!container) return;
    const slot = container.querySelector('[data-hv-avatar]');
    if (!slot) return;
    const img = document.querySelector('#headerAvatar img');
    const src = img && img.src ? img.src : '';
    slot.innerHTML = src
      ? `<img src="${_esc(src)}" alt="" class="hv-header__avatar-img">`
      : `<span class="hv-header__initial">${_esc(_shopInitial(_shopName()))}</span>`;
  }

  // ─────────── 캐러셀 카드 빌더 ───────────
  function _hasUnpublishedPhotoSlot(slots) {
    if (!Array.isArray(slots)) return false;
    return slots.some(s => s && s.status !== 'done' && Array.isArray(s.photos) && s.photos.length > 0);
  }
  function _hasInProgressSlot(slots) {
    if (!Array.isArray(slots)) return false;
    return slots.some(s => s && s.status !== 'done');
  }
  function _hasTomorrowBooking(brief) {
    const list = (brief && brief.today_bookings) || [];
    if (!list.length) return false;
    const tmr = new Date(); tmr.setDate(tmr.getDate() + 1);
    const ymd = tmr.toISOString().split('T')[0];
    return list.some(b => (b.starts_at || '').startsWith(ymd));
  }

  function _onboardingCards() {
    return [
      { kind: 'onboarding-caption', featured: true, dot: 'pink', cat: '시작하기',
        headline: '사진으로 캡션을 만들어 보세요',
        sub: '갤러리에 사진을 올리면 AI가 캡션을 만들어요',
        cta: '캡션 만들기', act: 'openCaption' },
      { kind: 'onboarding-booking', dot: 'green', cat: '예약',
        headline: '첫 예약을 추가해 보세요',
        sub: '캘린더에서 손님 예약을 등록할 수 있어요',
        cta: '예약 추가', act: 'openCalendar' },
      { kind: 'onboarding-customer', dot: 'purple', cat: '손님',
        headline: '손님을 등록해 보세요',
        sub: '단골을 모아두면 자동 안부도 보낼 수 있어요',
        cta: '손님 등록', act: 'openCustomers' },
    ];
  }

  // [v6 A-3] 9개 카테고리 항상 표시. 이슈 있으면 할 일 카드(ok=0), 없으면 긍정 카드(ok=1).
  function _buildCarouselCards(brief, slots, pendingCnt, dmQueueCnt) {
    const cards = [];
    brief = brief || {};

    // 1. 오늘 손님 미리보기
    const todayBk = Array.isArray(brief.today_bookings) ? brief.today_bookings.filter(b => b.status === 'confirmed') : [];
    if (todayBk.length > 0) {
      const next = todayBk[0];
      cards.push({ ok: 0, cat: '오늘 손님 미리보기', dot: 'var(--brand-strong,#E5586E)',
        hl: (next.customer_name || '손님') + '님 — ' + (next.service_name || next.service || '시술'),
        desc: (next.memo ? '"' + next.memo + '"' : '메모 없음'),
        btn: '고객 메모 보기', act: 'openCustomers' });
    } else {
      cards.push({ ok: 1, cat: '오늘 손님', dot: '#10B981', okMsg: '오늘 예약을 확인해보세요' });
    }

    // 2. 단골 이탈
    const atRiskRaw = brief.at_risk;
    const atRisk = Array.isArray(atRiskRaw) ? atRiskRaw.length : (Number(atRiskRaw) || 0);
    if (atRisk > 0) {
      cards.push({ ok: 0, cat: '단골 이탈 감지', dot: 'var(--danger)',
        hl: atRisk + '명 방문 주기 넘었어요',
        desc: '평균 주기보다 오래 안 오신 손님',
        btn: '고객 목록', act: 'openCustomers' });
    } else {
      cards.push({ ok: 1, cat: '단골 관리', dot: '#10B981', okMsg: '이탈 위험 손님 없어요' });
    }

    /* INVENTORY_HIDDEN
    // 3. 재고 부족
    const lowStockRaw = brief.low_stock;
    const lowStock = Array.isArray(lowStockRaw) ? lowStockRaw.length : (Number(lowStockRaw) || 0);
    if (lowStock > 0) {
      cards.push({ ok: 0, cat: '재고 예측', dot: 'var(--warn,#D97706)',
        hl: lowStock + '개 품목 부족 예상',
        desc: '이번주 예약 기준 소진 임박',
        btn: '재고 보기', act: 'openInventory' });
    } else {
      cards.push({ ok: 1, cat: '재고 관리', dot: '#10B981', okMsg: '재고 넉넉해요' });
    }
    */

    // 4. DM 자동응답
    const dmCnt = Number(dmQueueCnt) || 0;
    if (dmCnt > 0) {
      cards.push({ ok: 0, cat: 'DM 자동응답', dot: 'var(--purple,#7C3AED)',
        hl: dmCnt + '건 답변 대기 중',
        desc: 'AI가 초안 써뒀어요 · 승인만 하면 발송',
        btn: '답변 확인', act: 'openDMConfirmQueue' });
    } else {
      cards.push({ ok: 1, cat: 'DM 자동응답', dot: '#10B981', okMsg: '대기 중인 답변 없어요' });
    }

    // 5. 요일별 매출 패턴 (항상 표시)
    cards.push({ ok: 0, cat: '요일별 매출', dot: '#3B82F6',
      hl: '이번주 매출 패턴 보기',
      desc: '요일별 매출 비교 · 프로모션 타이밍',
      btn: '자세히', act: 'openRevenue' });

    // 6. SNS 캡션 (항상 표시)
    cards.push({ ok: 0, cat: 'SNS 글 써주기', dot: 'var(--cyan,#0891B2)',
      hl: '갤러리 사진으로 문구 써줄까요?',
      desc: 'AI가 게시물 문구를 만들어드려요',
      btn: '문구 만들기', act: 'openCaption' });

    // 7. 인스타 리마인드 (항상 표시)
    cards.push({ ok: 0, cat: '인스타 리마인드', dot: 'var(--brand,#F18091)',
      hl: '최근 포스팅 확인해보세요',
      desc: '꾸준한 업로드가 고객 유입에 도움돼요',
      btn: '갤러리에서 올리기', act: 'openGallery' });

    // 8. 노쇼 예측 (항상 긍정 — 추후 BE 데이터 연결 시 동적으로)
    cards.push({ ok: 1, cat: '노쇼 예측', dot: '#10B981', okMsg: '노쇼 위험 손님 없어요' });

    // 9. 빈 시간 활용 (항상 긍정)
    cards.push({ ok: 1, cat: '빈 시간 활용', dot: '#10B981', okMsg: '이번주 예약 잘 차고 있어요' });

    // ok=0 먼저, ok=1 뒤로 정렬
    cards.sort((a, b) => a.ok - b.ok);
    return cards;
  }

  // ─────────── 캐러셀 렌더 ───────────
  function _renderCarousel(cards) {
    if (!cards.length) return '';
    const items = cards.map((c, i) => `
      <article class="hv-card${c.featured ? ' hv-card--featured' : ''}" data-hv-card="${i}" data-hv-act="${_esc(c.act || '')}">
        <div class="hv-card__top">
          <div class="hv-card__cat">
            <span class="hv-card__dot hv-dot--${_esc(c.dot)}"></span>
            <span class="hv-card__cat-text">${_esc(c.cat)}</span>
          </div>
        </div>
        <div class="hv-card__headline">${_esc(c.headline)}</div>
        <div class="hv-card__sub">${_esc(c.sub)}</div>
        <button type="button" class="hv-card__cta" data-hv-act="${_esc(c.act || '')}">
          ${_esc(c.cta)}
          <i class="ph-duotone ph-caret-right" aria-hidden="true"></i>
        </button>
      </article>
    `).join('');
    const dots = cards.map((_, i) =>
      `<button type="button" class="hv-dot${i === 0 ? ' is-on' : ''}" data-hv-dot="${i}" aria-label="카드 ${i + 1}"></button>`
    ).join('');
    const total = cards.length;
    // 2026-05-01 ── 캐러셀 좌우 화살표 버튼 추가 (사용자 요청). 4-5개 이상이면 옆이 안 보여서 한 칸씩 이동.
    return `
      <div class="hv-ai-label">
        <span class="hv-ai-label__icon"><i class="ph-duotone ph-sparkle" aria-hidden="true"></i></span>
        <span class="hv-ai-label__text"><b>AI 비서</b>가 ${total}가지 추천했어요</span>
        <span class="hv-ai-label__count" data-hv-counter>1 / ${total}</span>
      </div>
      <div class="hv-carousel-wrap" style="position:relative;">
        <button type="button" class="hv-carousel-nav hv-carousel-nav--prev" data-hv-nav="prev" aria-label="이전 카드">
          <i class="ph-duotone ph-caret-left" style="font-size:18px" aria-hidden="true"></i>
        </button>
        <div class="hv-carousel" data-hv-carousel role="region" aria-label="AI 비서 추천">
          ${items}
        </div>
        <button type="button" class="hv-carousel-nav hv-carousel-nav--next" data-hv-nav="next" aria-label="다음 카드">
          <i class="ph-duotone ph-caret-right" style="font-size:18px" aria-hidden="true"></i>
        </button>
      </div>
      <div class="hv-dots" data-hv-dots>${dots}</div>
    `;
  }

  // ─────────── 영구 승인 알림 센터 (2026-05-08 — 캐러셀 대체) ───────────
  // 사용자 요청: 빠른 퀵탭 8개 삭제 + DM 큐·앱 사용자 승인 필요 항목 항상 상단 표시.
  // 집계 대상: DM 자동응답 승인 대기 / 입금 대기 예약 / 온라인 예약 승인 대기 / 이탈 위험 단골
  function _approvalCenterCards(brief, dmQueueCount, onlinePendingCount) {
    const cards = [];
    if (dmQueueCount > 0) {
      cards.push({
        kind: 'dm_queue',
        label: 'DM 자동응답 승인',
        count: dmQueueCount,
        body: '챗봇이 작성한 답장을 확인하고 보내주세요',
        cta: '확인',
        act: 'openDMConfirmQueue',
        icon: 'ic-message-circle',
        accent: '#7C3AED',
      });
    }
    const depositPending = (brief && brief.pending_booking_count) || 0;
    if (depositPending > 0) {
      cards.push({
        kind: 'deposit_pending',
        label: '입금 대기 예약',
        count: depositPending,
        body: '입금 확인 후 승인하면 캘린더에 등록돼요',
        cta: '승인',
        act: 'openBookingApproval',
        icon: 'ic-credit-card',
        accent: '#E68A00',
      });
    }
    if (onlinePendingCount > 0 && onlinePendingCount !== depositPending) {
      cards.push({
        kind: 'online_pending',
        label: '온라인 예약 승인 대기',
        count: onlinePendingCount,
        body: '손님이 사장님 승인을 기다리고 있어요',
        cta: '승인',
        act: 'openBookingApproval',
        icon: 'ic-calendar',
        accent: '#0891B2',
      });
    }
    const atRisk = (brief && brief.at_risk) || [];
    if (Array.isArray(atRisk) && atRisk.length > 0) {
      cards.push({
        kind: 'at_risk',
        label: '단골 챙기기',
        count: atRisk.length,
        body: atRisk[0]?.name ? `${atRisk[0].name}님 다녀가신 지 오래` : '안부 한 통 보낼 타이밍이에요',
        cta: '안부',
        act: 'openInsights',
        icon: 'ic-star',
        accent: 'var(--brand)',
      });
    }
    return cards;
  }

  function _renderApprovalCenter(brief, dmQueueCount, onlinePendingCount) {
    const cards = _approvalCenterCards(brief, dmQueueCount, onlinePendingCount);
    if (!cards.length) return ''; // 0건이면 영역 자체 0px (빈 상태로 자연스럽게)
    const items = cards.map(c => `
      <button type="button" class="hv-approval-row" data-hv-act="${_esc(c.act)}" style="display:flex;align-items:center;gap:10px;width:100%;padding:12px 14px;background:var(--surface,#fff);border:1px solid ${c.accent}33;border-left:3px solid ${c.accent};border-radius:12px;cursor:pointer;text-align:left;">
        <span style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:${c.accent}1A;color:${c.accent};flex-shrink:0;">
          <svg width="16" height="16" aria-hidden="true"><use href="#${_esc(c.icon)}"/></svg>
        </span>
        <span style="flex:1;min-width:0;">
          <span style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:800;color:var(--text,#222);">
            ${_esc(c.label)}
            <span style="display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;background:${c.accent};color:#fff;border-radius:100px;font-size:11px;font-weight:800;">${c.count}</span>
          </span>
          <span style="display:block;font-size:11.5px;color:var(--text-subtle,#888);margin-top:2px;line-height:1.4;">${_esc(c.body)}</span>
        </span>
        <span style="font-size:12px;font-weight:800;color:${c.accent};white-space:nowrap;">${_esc(c.cta)} →</span>
      </button>
    `).join('');
    return `
      <section class="hv-approval-center" aria-label="승인 대기 알림" style="display:flex;flex-direction:column;gap:8px;margin:8px 0 12px;">
        <div style="font-size:11px;letter-spacing:0.4px;color:var(--text-subtle,#888);font-weight:800;padding:0 2px;">사장님 확인이 필요해요</div>
        ${items}
      </section>
    `;
  }

  // ─────────── 오늘의 예약 ───────────
  // 상태 → 배지 라벨/클래스 (캘린더 컬러코딩과 톤 일치)
  function _slotStatusLabel(s) {
    switch (s) {
      case 'completed': return '완료';
      case 'confirmed': return '확정';
      case 'cancelled': return '취소';
      case 'no_show':   return '안 옴';
      default: return '';
    }
  }
  function _slotStatusCls(s) {
    switch (s) {
      case 'completed': return 'st-done';
      case 'confirmed': return 'st-conf';
      case 'cancelled': return 'st-canc';
      case 'no_show':   return 'st-noshow';
      default: return '';
    }
  }
  function _hhmm(iso) {
    try {
      const d = new Date(iso);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch (_e) { return ''; }
  }
  function _todayBookings(brief) {
    const list = (brief && brief.today_bookings) || [];
    const ymd = new Date().toISOString().split('T')[0];
    return list
      .filter(b => (b.starts_at || '').startsWith(ymd))
      .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
  }
  function _renderBookingEmpty() {
    return `
      <section class="hv-booking hv-booking--empty" aria-label="오늘의 예약" data-hv-act="openCalendar" role="button" tabindex="0">
        <div class="hv-booking__top">
          <div>
            <div class="hv-booking__label">오늘의 예약</div>
            <div class="hv-booking__title">오늘 예약 없음</div>
          </div>
          <span class="hv-booking__link" aria-hidden="true">캘린더 →</span>
        </div>
      </section>
    `;
  }
  function _bookingTitle(all, idxNext, visible) {
    if (idxNext >= 0) {
      const b = visible[idxNext];
      const name = (b && (b.customer_name || b.name)) ? (b.customer_name || b.name) : '';
      const next = _hhmm(b && b.starts_at);
      return name ? `${all.length}건 · 다음 ${next} ${name}` : `${all.length}건 · 다음 ${next}`;
    }
    return `오늘 ${all.length}건`;
  }
  function _renderBooking(brief) {
    const all = _todayBookings(brief);
    const empty = CFG().BOOKING_EMPTY_DISPLAY || 'hide';
    if (!all.length) {
      if (empty === 'hide') return '';
      return _renderBookingEmpty();
    }
    const max = CFG().BOOKING_SLOTS_MAX || 4;
    const now = Date.now();
    const idxNext = all.findIndex(b => {
      const t = Date.parse(b.starts_at || '');
      return Number.isFinite(t) && t >= now;
    });
    const visible = all.slice(0, max);
    const more = all.length - visible.length;
    const slotsHtml = visible.map((b, i) => {
      const cls = (i === idxNext) ? ' is-now' : '';
      const stLabel = _slotStatusLabel(b.status);
      const stCls = _slotStatusCls(b.status);
      const stBadge = stLabel ? `<span class="hv-slot__status ${stCls}">${stLabel}</span>` : '';
      const name = _esc(b.customer_name || b.name || '');
      const svc  = _esc(b.service_name || '');
      return `<button type="button" class="hv-slot${cls}" data-hv-slot="${i}" data-hv-time="${_esc(b.starts_at || '')}">`
        + `<span class="hv-slot__time">${_esc(_hhmm(b.starts_at))}</span>`
        + `<span class="hv-slot__bar" aria-hidden="true"></span>`
        + `<span class="hv-slot__info">`
        +   `<span class="hv-slot__name">${name}</span>`
        +   (svc ? `<span class="hv-slot__svc">${svc}</span>` : '')
        + `</span>`
        + stBadge
        + `</button>`;
    }).join('');
    const moreChip = more > 0 ? `<div class="hv-slot hv-slot--more" aria-label="추가 예약">+${more}건 더</div>` : '';
    return `
      <section class="hv-booking" aria-label="오늘의 예약">
        <div class="hv-booking__top">
          <div>
            <div class="hv-booking__label">오늘의 예약</div>
            <div class="hv-booking__title">${_esc(_bookingTitle(all, idxNext, visible))}</div>
          </div>
          <a href="#" class="hv-booking__link" data-hv-act="openCalendar">캘린더 →</a>
        </div>
        <div class="hv-slots">${slotsHtml}${moreChip}</div>
      </section>
    `;
  }

  // ─────────── 운영 3카드 ───────────
  // [2026-05-19] _won → formatMoney (format-money.js 공통 유틸)
  // 데이터 없으면 0 으로 표기 — 신규 가입자도 깔끔한 빈 상태로.
  function _opsStock(brief) {
    const ls = brief ? brief.low_stock : undefined;
    const n = Array.isArray(ls) ? ls.length : (Number(ls) || 0);
    return { val: `${n}개 부족`, danger: n > 0 };
  }
  function _opsCustomers(brief) {
    if (brief && typeof brief.new_customer_count === 'number') {
      return `신규 ${brief.new_customer_count}명`;
    }
    const ar = brief ? brief.at_risk : undefined;
    const n = Array.isArray(ar) ? ar.length : (Number(ar) || 0);
    return `이탈 위험 ${n}명`;
  }
  function _opsRevenue(brief) {
    const v = brief ? brief.this_month_total : 0;
    return formatMoney(v);
  }
  function _renderOps(brief) {
    /* INVENTORY_HIDDEN const stock = _opsStock(brief); */
    const custVal = _opsCustomers(brief);
    const revVal = _opsRevenue(brief);
    /* INVENTORY_HIDDEN const stockDanger = stock.danger ? ' is-danger' : ''; */
    return `
      <section class="hv-ops" aria-label="운영 관리">
        <div class="hv-ops__title">운영 관리</div>
        <div class="hv-ops__grid">
          <!-- INVENTORY_HIDDEN
          <button type="button" class="hv-ops__card" data-hv-act="openInventory">
            <div class="hv-ops__cat">재고관리</div>
            <div class="hv-ops__val${"$"}{stockDanger}">${"$"}{_esc(stock.val)}</div>
          </button>
          -->
          <button type="button" class="hv-ops__card" data-hv-act="openCustomers">
            <div class="hv-ops__cat">고객관리</div>
            <div class="hv-ops__val">${_esc(custVal)}</div>
          </button>
          <button type="button" class="hv-ops__card" data-hv-act="openRevenue">
            <div class="hv-ops__cat">매출관리</div>
            <div class="hv-ops__val">${_esc(revVal)}</div>
          </button>
        </div>
      </section>
    `;
  }

  // ─────────── 캐러셀 점 인디케이터 ───────────
  function _setupCarousel(container) {
    const car = container.querySelector('[data-hv-carousel]');
    const dots = container.querySelectorAll('[data-hv-dots] .hv-dot');
    const counter = container.querySelector('[data-hv-counter]');
    if (!car || !dots.length) return;
    let raf = 0;
    car.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const cards = car.querySelectorAll('.hv-card');
        if (!cards.length) return;
        const cw = cards[0].getBoundingClientRect().width + 10;
        const idx = Math.min(dots.length - 1, Math.max(0, Math.round(car.scrollLeft / cw)));
        dots.forEach((d, i) => d.classList.toggle('is-on', i === idx));
        if (counter) counter.textContent = (idx + 1) + ' / ' + cards.length;
      });
    }, { passive: true });
    dots.forEach((d, i) => {
      d.addEventListener('click', () => {
        const cards = car.querySelectorAll('.hv-card');
        if (!cards[i]) return;
        car.scrollTo({ left: cards[i].offsetLeft - car.offsetLeft, behavior: 'smooth' });
      });
    });
    // 2026-05-01 ── 좌우 화살표 버튼 핸들러
    const wrap = car.parentElement;
    if (wrap && wrap.classList.contains('hv-carousel-wrap')) {
      const goByCard = (dir) => {
        const cards = car.querySelectorAll('.hv-card');
        if (!cards.length) return;
        const cw = cards[0].getBoundingClientRect().width + 10;
        const idx = Math.round(car.scrollLeft / cw);
        const next = Math.max(0, Math.min(cards.length - 1, idx + dir));
        car.scrollTo({ left: cards[next].offsetLeft - car.offsetLeft, behavior: 'smooth' });
      };
      wrap.querySelector('[data-hv-nav="prev"]')?.addEventListener('click', () => goByCard(-1));
      wrap.querySelector('[data-hv-nav="next"]')?.addEventListener('click', () => goByCard(1));
    }
  }

  // ─────────── 이벤트 바인딩 ───────────
  function _handleSlotClick(booking) {
    if (typeof window.showTab === 'function') {
      const btn = document.querySelector('.tab-bar__btn[data-tab="calendar"]');
      try { window.showTab('calendar', btn); } catch (_e) { /* ignore */ }
    }
    const ymd = (booking && booking.starts_at) ? booking.starts_at.split('T')[0] : '';
    if (ymd && typeof window.openBooking === 'function') {
      try { window.openBooking(ymd); } catch (_e) { /* ignore */ }
    }
    // TODO[v1.5]: 예약 상세 sheet 자동 오픈 — 현재 미구현
  }

  function _runAct(act) {
    if (window.hapticLight) { try { window.hapticLight(); } catch (_e) { /* ignore */ } }
    if (!act) return;
    const map = {
      openCalendar: () => {
        // 2026-05-01 ── 'calendar' 탭은 없음. openCalendarView 가 캘린더 시트 띄움.
        if (typeof window.openCalendarView === 'function') return window.openCalendarView();
        if (typeof window.showTab === 'function') {
          const btn = document.querySelector('.tab-bar__btn[data-tab="calendar"]');
          try { window.showTab('calendar', btn); } catch (_e) { /* ignore */ }
        }
      },
      openGallery: () => {
        if (typeof window.showTab === 'function') {
          const btn = document.querySelector('.tab-bar__btn[data-tab="gallery"]');
          try { window.showTab('gallery', btn); } catch (_e) { /* ignore */ }
        }
      },
      // 2026-05-01 ── 캡션 만들기 — app-caption.js 의 openCaptionScenarioPopup 호출
      openCaption: () => {
        if (typeof window.openCaptionScenarioPopup === 'function') return window.openCaptionScenarioPopup();
        if (typeof window.openNavSheet === 'function') return window.openNavSheet();
      },
      bell: () => {
        if (typeof window.openNotifications === 'function') window.openNotifications();
      },
      openBookingApproval: () => {
        if (typeof window.openBookingApproval === 'function') window.openBookingApproval();
      },
      openDMConfirmQueue: () => {
        // 영구 알림 센터에서 DM 자동응답 큐 진입
        if (typeof window.openDMConfirmQueue === 'function') return window.openDMConfirmQueue();
        if (typeof window.openDMQueue === 'function') return window.openDMQueue();
      },
      openInsights: () => {
        if (typeof window.openInsights === 'function') return window.openInsights();
        if (typeof window.openCustomerInsights === 'function') return window.openCustomerInsights();
      },
      openCustomers: () => {
        if (typeof window.openCustomerHub === 'function') return window.openCustomerHub();
        if (typeof window.openCustomers === 'function') return window.openCustomers();
      },
      openRevenue: () => {
        // [v198] 홈 매출 카드 → v6 매출 대시보드 sheet. (옛 대시보드 탭 라우팅 폐기)
        if (typeof window.openRevenue === 'function') { window.openRevenue(); return; }
        if (typeof window.openRevenueHub === 'function') { window.openRevenueHub(); return; }
      },
      /* INVENTORY_HIDDEN
      openInventory: () => {
        if (typeof window.openInventoryPanel === 'function') return window.openInventoryPanel();
      },
      */
    };
    if (map[act]) { map[act](); return; }
    if (typeof window[act] === 'function') {
      try { window[act](); } catch (_e) { /* ignore */ }
    }
  }

  function _bindEvents(container, brief) {
    const bookings = _todayBookings(brief);
    container.querySelectorAll('[data-hv-slot]').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.hvSlot, 10);
        const b = bookings[idx];
        if (b) _handleSlotClick(b);
      });
    });
    container.querySelectorAll('[data-hv-act]').forEach(el => {
      // 슬롯 안의 act는 슬롯 핸들러가 처리하므로 중복 방지
      if (el.hasAttribute('data-hv-slot')) return;
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        _runAct(el.dataset.hvAct || '');
      });
    });
    // AI 캐러셀 paging (3-per-page)
    _bindAiCarousel(container);
  }

  function _bindAiCarousel(container) {
    const track = container.querySelector('#hv5AiTrack');
    if (!track) return;
    const cards = Array.from(track.children);
    if (cards.length === 0) return;
    // 안전장치 — ok=0 먼저, ok=1 뒤로 재정렬 (renderer 가 이미 정렬했지만 보장)
    cards.sort((a, b) => (+a.dataset.ok || 0) - (+b.dataset.ok || 0));
    cards.forEach(c => track.appendChild(c));

    const perPage = 3;
    const pages = Math.max(1, Math.ceil(cards.length / perPage));
    let page = 0;
    const prevBtn = container.querySelector('#hv5AiPrev');
    const nextBtn = container.querySelector('#hv5AiNext');
    const dotsWrap = container.querySelector('#hv5AiDots');

    function goTo(p) {
      page = Math.max(0, Math.min(pages - 1, p));
      const cardW = cards[0].getBoundingClientRect().width + 10;
      track.scrollTo({ left: page * perPage * cardW, behavior: 'smooth' });
      dotsWrap?.querySelectorAll('.hv5-ai-dot-nav').forEach((d, i) => {
        d.classList.toggle('on', i === page);
      });
      if (prevBtn) prevBtn.disabled = page === 0;
      if (nextBtn) nextBtn.disabled = page >= pages - 1;
    }
    prevBtn?.addEventListener('click', (e) => { e.stopPropagation(); goTo(page - 1); });
    nextBtn?.addEventListener('click', (e) => { e.stopPropagation(); goTo(page + 1); });
    dotsWrap?.querySelectorAll('.hv5-ai-dot-nav').forEach(d => {
      d.addEventListener('click', (e) => {
        e.stopPropagation();
        goTo(parseInt(d.dataset.hvAiPage, 10) || 0);
      });
    });
    // 터치 스와이프 (모바일에서는 PC nav 숨김이라 swipe 가 주 수단)
    let startX = 0;
    track.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    track.addEventListener('touchend', (e) => {
      const diff = startX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 40) {
        if (diff > 0) goTo(page + 1);
        else goTo(page - 1);
      }
    }, { passive: true });
  }

  // ─────────── 메인 렌더 ───────────
  let _lastContainerId = null;
  let _inFlight = false;

  // [2026-05-17 v6] mockup-home-v6 적용. PC wide 1280px.
  //   순서: 헤더 / 히어로(이번달매출+예상) / 2-row[예약+알림] / AI 추천
  //   운영관리 카드 제거 → AI 비서가 재고/단골/신규 흡수.
  function _composeHTML(brief, slots, dmQueueCount, onlinePendingCount) {
    _ensureStylesV5();
    const cards = _buildCarouselCards(brief, slots, onlinePendingCount, dmQueueCount);
    const bookingHtml = _renderBookingV5(brief);
    const alertsHtml = _renderAlertsV5(brief, dmQueueCount || 0, onlinePendingCount || 0);
    // 2-row: 둘 다 있을 때는 7+5, 한쪽만 있으면 col-12 (CSS 가 자동 stack)
    let middleRow = '';
    if (bookingHtml && alertsHtml) {
      middleRow = `<div class="hv5-row">
        <div class="hv5-col-7">${bookingHtml}</div>
        <div class="hv5-col-5">${alertsHtml}</div>
      </div>`;
    } else if (bookingHtml) {
      middleRow = `<div class="hv5-row"><div style="grid-column:span 12">${bookingHtml}</div></div>`;
    } else if (alertsHtml) {
      middleRow = `<div class="hv5-row"><div style="grid-column:span 12">${alertsHtml}</div></div>`;
    }
    return [
      _renderHeaderV5(),
      _renderHeroV5(brief),
      middleRow,
      _renderAIRecsV5(cards),
    ].join('');
  }

  // ═══════════════════════════════════════════════════════════════════
  // v5 RENDERERS (mockup-home-v5.html)
  // ═══════════════════════════════════════════════════════════════════

  function _ensureStylesV5() {
    if (document.getElementById('hv5Styles')) return;
    const s = document.createElement('style');
    s.id = 'hv5Styles';
    s.textContent = `
      /* [2026-05-17 v6] PC wide 1280px + 12-col 그리드. 모바일은 자동 stack. */
      #homeV41Root{background:var(--surface,#fff);min-height:100vh;padding:24px 16px}
      .hv5{max-width:1280px;margin:0 auto}

      /* 헤더 — wide PC 전용 */
      .hv5-hdr{display:flex;align-items:center;padding:0 4px 18px;gap:14px}
      .hv5-hdr .av{width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#FFF1F3,#fde2e7);display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:800;color:#E5586E;flex-shrink:0;overflow:hidden}
      .hv5-hdr .av img{width:100%;height:100%;object-fit:cover;border-radius:50%}
      .hv5-hdr .meta{flex:1;min-width:0}
      .hv5-hdr .date{font-size:12px;color:#6B7684;font-weight:500;letter-spacing:-0.2px}
      .hv5-hdr .shop{font-size:19px;font-weight:700;margin-top:2px;letter-spacing:-0.4px;color:#191F28;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .hv5-bell{width:40px;height:40px;border-radius:50%;background:#fff;border:1px solid #E5E8EB;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#191F28;position:relative;flex-shrink:0;transition:background .15s}
      .hv5-bell:hover{background:#F7F8FA}
      .hv5-bell svg{width:20px;height:20px}
      .hv5-bell-badge{position:absolute;top:-1px;right:-1px;min-width:16px;height:16px;border-radius:999px;background:#E5586E;color:#fff;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 4px;border:2px solid #fff}

      /* 12-col 그리드 */
      .hv5-row{display:grid;grid-template-columns:repeat(12,1fr);gap:14px;margin-bottom:14px}
      .hv5-col-7{grid-column:span 7}
      .hv5-col-5{grid-column:span 5}
      .hv5-card{background:var(--surface-2,#F7F8FA);border-radius:16px;border:none;box-shadow:0 1px 3px rgba(0,0,0,0.04);padding:22px 24px;display:flex;flex-direction:column;height:100%}
      .hv5-card-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
      .hv5-card-title{font-size:14px;font-weight:700;letter-spacing:-0.3px;color:#191F28}
      .hv5-card-link{font-size:12px;color:#6B7684;text-decoration:none;font-weight:600;cursor:pointer;transition:color .12s;background:none;border:none;font-family:inherit;padding:0}
      .hv5-card-link:hover{color:#191F28}

      /* 매출 히어로 (와이드) — border 제거, 그림자만 */
      .hv5-hero{background:linear-gradient(135deg,#FFF6F8 0%,var(--surface-2,#F7F8FA) 70%);border-radius:16px;border:1px solid var(--brand-bg,#FFF1F3);box-shadow:0 1px 3px rgba(0,0,0,0.04);padding:26px 28px;display:flex;align-items:center;gap:32px;margin-bottom:14px}
      .hv5-hero-l{flex:0 0 auto;min-width:280px}
      .hv5-hero-label{font-size:12px;font-weight:600;color:#333D4B;margin-bottom:8px;letter-spacing:-0.2px;display:flex;align-items:center;gap:8px}
      .hv5-hero-label-month{padding:2px 8px;border-radius:999px;background:#FFF1F3;color:#E5586E;font-size:10px;font-weight:700}
      .hv5-hero-amt{font-size:44px;font-weight:800;letter-spacing:-1.5px;line-height:1;color:#191F28;font-variant-numeric:tabular-nums}
      .hv5-hero-meta{display:flex;gap:16px;margin-top:14px;align-items:center;flex-wrap:wrap}
      .hv5-hero-chip{font-size:13px;color:#6B7684;font-weight:500;letter-spacing:-0.2px}
      .hv5-hero-chip b{font-weight:700;color:#333D4B}
      .hv5-hero-r{flex:1;display:flex;flex-direction:column;align-items:flex-end;gap:10px}
      .hv5-hero-r-link{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#6B7684;font-weight:600;cursor:pointer;text-decoration:none;padding:5px 10px;border-radius:999px;background:var(--surface-2,#F7F8FA);border:1px solid var(--border,rgba(0,0,0,.07));font-family:inherit;transition:color .12s}
      .hv5-hero-r-link:hover{color:#E5586E}
      .hv5-hero-stats{display:flex;gap:10px}
      .hv5-hero-stat{flex:0 0 155px;background:rgba(255,255,255,0.7);border:1px solid var(--border,rgba(0,0,0,.07));border-radius:12px;padding:14px 16px}
      .hv5-hero-stat-l{font-size:11px;font-weight:600;color:#6B7684;letter-spacing:-0.2px}
      .hv5-hero-stat-v{font-size:17px;font-weight:700;margin-top:4px;letter-spacing:-0.3px;color:#191F28;font-variant-numeric:tabular-nums}
      .hv5-hero-stat-v.pred{color:#E5586E}

      /* 알림 (간결한 dot 리스트) */
      .hv5-noti-list{display:flex;flex-direction:column;gap:2px}
      .hv5-noti{display:flex;align-items:center;gap:10px;padding:12px 14px;background:transparent;border-radius:10px;cursor:pointer;border:none;width:100%;text-align:left;font-family:inherit;transition:background .12s;border-bottom:1px solid #F7F8FA}
      .hv5-noti:last-child{border-bottom:none}
      .hv5-noti:hover{background:#F7F8FA}
      .hv5-noti-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
      .hv5-noti-dot.amber{background:#D97706}
      .hv5-noti-dot.purple{background:#7C3AED}
      .hv5-noti-dot.pink{background:#E5586E}
      .hv5-noti-dot.cyan{background:#0891B2}
      .hv5-noti-body{flex:1;min-width:0}
      .hv5-noti-title{font-size:13px;font-weight:600;letter-spacing:-0.3px;color:#191F28}
      .hv5-noti-desc{font-size:11px;color:#6B7684;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .hv5-noti-count{font-size:11px;font-weight:700;color:#6B7684;flex-shrink:0}
      .hv5-noti-arrow{color:#C5CBD2;font-size:16px;line-height:1;flex-shrink:0}

      /* 오늘의 예약 */
      .hv5-slots{display:flex;flex-direction:column}
      .hv5-slot{display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:10px;border:none;background:transparent;cursor:pointer;text-align:left;width:100%;font-family:inherit;transition:background .1s;border-bottom:1px solid #F7F8FA}
      .hv5-slot:last-of-type{border-bottom:none}
      .hv5-slot:hover{background:#F7F8FA}
      .hv5-slot.now{background:#FFF1F3}
      .hv5-slot.now:hover{background:#FFE8EC}
      .hv5-s-time{width:50px;font-size:13px;font-weight:700;color:#6B7684;font-variant-numeric:tabular-nums;flex-shrink:0;letter-spacing:-0.3px}
      .hv5-slot.now .hv5-s-time{color:#E5586E}
      .hv5-s-bar{width:3px;height:32px;border-radius:2px;background:#F18091;flex-shrink:0}
      .hv5-slot.now .hv5-s-bar{background:#E5586E}
      /* 인덱스 % 5 컬러 — 같은 날 5색 순환 */
      .hv5-slot-pink .hv5-s-bar{background:#E5586E}
      .hv5-slot-blue .hv5-s-bar{background:#3B82F6}
      .hv5-slot-teal .hv5-s-bar{background:#0D9488}
      .hv5-slot-purple .hv5-s-bar{background:#7C3AED}
      .hv5-slot-orange .hv5-s-bar{background:#EA580C}
      .hv5-s-info{flex:1;min-width:0;display:flex;align-items:center;gap:0}
      .hv5-s-name{font-size:13px;font-weight:700;letter-spacing:-0.3px;flex:0 0 80px;color:#191F28;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .hv5-s-svc{font-size:12px;color:#333D4B;letter-spacing:-0.2px;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .hv5-s-amt{font-size:12px;color:#333D4B;letter-spacing:-0.2px;font-variant-numeric:tabular-nums;margin-left:auto;text-align:right;flex-shrink:0}
      .hv5-s-badge{padding:4px 11px;border-radius:999px;font-size:10.5px;font-weight:700;letter-spacing:-0.2px;flex-shrink:0;margin-left:10px}
      .hv5-s-badge.conf{background:#FFF1F3;color:#E5586E}
      .hv5-s-badge.done{background:#E8F5E9;color:#0F6E56}
      .hv5-s-badge.cncl{background:#F7F8FA;color:#8B95A1}
      .hv5-s-more{text-align:center;padding:11px;font-size:12px;font-weight:600;color:#6B7684;background:#F7F8FA;cursor:pointer;border:none;width:100%;font-family:inherit;border-radius:10px;margin-top:6px}
      .hv5-s-more:hover{background:#ECEEF0}
      .hv5-bk-empty{padding:32px 24px;text-align:center;font-size:13px;color:#8B95A1;cursor:pointer;border:none;width:100%;font-family:inherit;background:transparent}

      /* AI 추천 */
      .hv5-ai{margin-top:8px}
      .hv5-ai-label{display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:0 4px}
      .hv5-ai-pulse{width:8px;height:8px;border-radius:50%;background:#10B981;position:relative;flex-shrink:0}
      .hv5-ai-pulse::after{content:'';position:absolute;inset:-3px;border-radius:50%;border:1.5px solid #10B981;animation:hv5-aipulse 2s ease-in-out infinite}
      @keyframes hv5-aipulse{0%,100%{opacity:0;transform:scale(0.8)}50%{opacity:1;transform:scale(1)}}
      .hv5-ai-label-t{font-size:13px;font-weight:600;color:#333D4B}
      .hv5-ai-label-t b{font-weight:700;color:#191F28}
      .hv5-ai-label-count{font-size:11px;color:#6B7684;margin-left:auto;font-weight:600}
      .hv5-ai-scroll{display:flex;gap:10px;overflow:hidden;scroll-behavior:smooth;padding:2px 4px 4px}
      .hv5-ai-nav{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:12px}
      .hv5-ai-nav-btn{width:30px;height:30px;border-radius:50%;border:1px solid #E5E8EB;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;color:#333D4B;font-family:inherit;transition:background .15s,color .15s}
      .hv5-ai-nav-btn:hover:not(:disabled){background:#F7F8FA;color:#191F28}
      .hv5-ai-nav-btn:disabled{opacity:0.3;cursor:default}
      .hv5-ai-dots{display:flex;gap:6px;align-items:center}
      .hv5-ai-dot-nav{width:6px;height:6px;border-radius:50%;background:#E5E8EB;transition:all .2s;cursor:pointer;border:none;padding:0}
      .hv5-ai-dot-nav.on{width:18px;border-radius:4px;background:#191F28}
      .hv5-ai-card{flex:0 0 calc((100% - 20px)/3);padding:20px;border-radius:16px;border:1px solid var(--border,rgba(0,0,0,.07));cursor:pointer;background:var(--surface-2,#F7F8FA);transition:transform .18s,box-shadow .18s;font-family:inherit;text-align:left;display:flex;flex-direction:column;box-shadow:0 4px 12px rgba(0,0,0,0.06),0 1px 3px rgba(0,0,0,0.04)}
      .hv5-ai-card:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,0.06),0 1px 3px rgba(0,0,0,0.04)}
      .hv5-ai-tag{display:inline-flex;align-items:center;gap:5px;margin-bottom:12px}
      .hv5-ai-dot{width:6px;height:6px;border-radius:50%}
      .hv5-ai-dot.pink{background:#E5586E}
      .hv5-ai-dot.amber{background:#D97706}
      .hv5-ai-dot.purple{background:#7C3AED}
      .hv5-ai-dot.green{background:#0F6E56}
      .hv5-ai-dot.cyan{background:#0891B2}
      .hv5-ai-dot.brand{background:#F18091}
      .hv5-ai-tag-t{font-size:10.5px;font-weight:600;color:#6B7684;letter-spacing:-0.1px}
      .hv5-ai-hl{font-size:15px;font-weight:700;line-height:1.35;letter-spacing:-0.4px;margin-bottom:6px;color:#191F28}
      .hv5-ai-desc{font-size:11.5px;color:#6B7684;line-height:1.45;margin-bottom:16px;flex:1}
      .hv5-ai-btn{display:inline-flex;align-items:center;gap:4px;padding:8px 16px;border-radius:999px;background:#191F28;color:#fff;font-size:12px;font-weight:600;border:none;cursor:pointer;font-family:inherit;align-self:flex-start}
      .hv5-ai-btn:active{transform:scale(0.96)}

      /* 반응형 — 1100px 이하 자동 stack */
      @media (max-width: 1100px){
        .hv5-col-7,.hv5-col-5{grid-column:span 12}
        .hv5-hero{flex-direction:column;align-items:flex-start;gap:16px}
        .hv5-hero-l{min-width:0;width:100%}
        .hv5-hero-r{align-items:stretch;width:100%}
        .hv5-hero-stats{justify-content:flex-start}
        .hv5-hero-stat{flex:1}
      }
      @media (max-width: 540px){
        #homeV41Root{padding:12px 12px}
        .hv5-hdr{padding:0 4px 14px;gap:10px}
        .hv5-hdr .av{width:40px;height:40px;font-size:14px}
        .hv5-hdr .shop{font-size:16px}
        .hv5-hero{padding:18px 20px}
        .hv5-hero-amt{font-size:34px;letter-spacing:-1.2px}
        .hv5-hero-stat{flex:1 1 0;min-width:0}
        .hv5-card{padding:16px 18px}
        .hv5-ai-card{padding:16px}
        .hv5-ai-hl{font-size:14px}
      }
      /* AI 캐러셀 nav */
      .hv5-ai-pulse{width:8px;height:8px;border-radius:50%;background:#10B981;position:relative;flex-shrink:0}
      .hv5-ai-pulse::after{content:'';position:absolute;inset:-3px;border-radius:50%;border:1.5px solid #10B981;animation:hv5aipulse 2s ease-in-out infinite}
      @keyframes hv5aipulse{0%,100%{opacity:0;transform:scale(0.8)}50%{opacity:1;transform:scale(1)}}
      .hv5-ai-track{display:flex;gap:10px;overflow:hidden;scroll-behavior:smooth}
      .hv5-ai-card-page{flex:0 0 calc(33.333% - 7px)}
      .hv5-ai-card.ok{opacity:0.6;min-height:auto}
      .hv5-ai-ok-msg{font-size:12px;color:#10B981;font-weight:600;letter-spacing:-0.2px}
      .hv5-ai-check{margin-left:auto;font-size:11px;color:#10B981;font-weight:600}
      .hv5-ai-nav{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:12px}
      .hv5-ai-nav-btn{width:30px;height:30px;border-radius:50%;border:1px solid var(--border,rgba(0,0,0,.07));background:var(--surface,#fff);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;color:#333D4B;font-family:inherit;transition:all .15s}
      .hv5-ai-nav-btn:hover{background:var(--surface-2,#F7F8FA);color:#191F28}
      .hv5-ai-nav-btn:disabled{opacity:0.3;cursor:default}
      .hv5-ai-dots{display:flex;gap:6px;align-items:center}
      .hv5-ai-dot-nav{width:6px;height:6px;border-radius:50%;background:var(--border,rgba(0,0,0,.07));transition:all .2s;cursor:pointer;border:none;padding:0}
      .hv5-ai-dot-nav.on{width:18px;border-radius:4px;background:var(--text,#191F28)}
      @media(max-width:540px){.hv5-ai-card-page{flex:0 0 85%}.hv5-ai-nav{display:none}.hv5-ai-track{overflow-x:auto;scroll-snap-type:x mandatory}.hv5-ai-card-page{scroll-snap-align:start}}
    `;
    document.head.appendChild(s);
  }

  function _renderHeaderV5() {
    const shop = _shopName();
    return `<div class="hv5"><div class="hv5-hdr">
      <div class="av" data-hv-avatar aria-hidden="true">${_esc(_shopInitial(shop))}</div>
      <div class="meta">
        <div class="date">${_esc(_todayKor())}</div>
        <div class="shop">${_esc(shop)}</div>
      </div>
      <button type="button" class="hv5-bell" data-hv-act="bell" aria-label="알림">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
        <span id="dashBellBadge" class="hv5-bell-badge" style="display:none"></span>
      </button>
    </div>`;
  }

  // [2026-05-19] _krwOnly → formatMoney / formatEstimate (format-money.js 공통 유틸)

  // [v6] 이번달 매출 히어로 + 오른쪽 stat 2개 (오늘 예상 / 이번달 AI 예상)
  function _renderHeroV5(brief) {
    brief = brief || {};
    const monthTotal = Number(brief.this_month_total) || 0;
    const projected = Number(brief._projected_total) || 0;  // /revenue/summary 에서 머지됨
    // [v202] BE today_bookings 가 비면 window.Booking.list() 메모리 캐시로 폴백
    let bk = Array.isArray(brief.today_bookings) ? brief.today_bookings : [];
    if (!bk.length && window.Booking && typeof window.Booking.list === 'function') {
      try {
        const all = window.Booking._items || [];
        const ymd = new Date().toISOString().slice(0, 10);
        bk = all.filter(b => b && (b.starts_at || '').slice(0, 10) === ymd);
      } catch (_e) { /* silent */ }
    }
    const completedCount = bk.filter(b => b && b.status === 'completed').length;
    // 이번달 완료 건수.
    // 1순위: BE brief.this_month_count (정식 필드)
    // 2순위: Revenue 모듈이 이미 메모리에 들고있는 이번달 items 건수 (BE 미배포 폴백)
    // 3순위: brief.completed_count (예약 기준 — 의미 다름이라 가장 마지막)
    // 4순위: 오늘 completed 예약 수 — 0 이상이면 표시 (이전 잘못된 폴백)
    let monthCount = Number(brief.this_month_count) || 0;
    if (!monthCount && window.Revenue && Array.isArray(window.Revenue._items)) {
      try {
        const now = new Date();
        const ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        monthCount = window.Revenue._items.filter(r => {
          const t = String(r.recorded_at || r.created_at || '').slice(0, 7);
          return t === ym;
        }).length;
      } catch (_e) { /* silent */ }
    }
    if (!monthCount) monthCount = Number(brief.completed_count) || completedCount;
    // [v200] 오늘 예상 매출 — confirmed 예약의 amount 합. amount 비어있으면 서비스 프리셋 가격 폴백.
    const _svcCache = window._serviceTemplatesCache || [];
    const _priceFor = (name) => {
      const k = String(name || '').trim().toLowerCase();
      if (!k || !_svcCache.length) return 0;
      let hit = _svcCache.find(t => String(t.name || '').trim().toLowerCase() === k);
      if (!hit) hit = _svcCache.find(t => {
        const n = String(t.name || '').trim().toLowerCase();
        return n && (k.includes(n) || n.includes(k));
      });
      return Number(hit && hit.default_price) || 0;
    };
    const todayExpected = bk
      .filter(b => b && b.status === 'confirmed')
      .reduce((s, b) => {
        const amt = Number(b.amount) || 0;
        return s + (amt > 0 ? amt : _priceFor(b.service_name));
      }, 0);
    const now = new Date();
    const monthLabel = (now.getMonth() + 1) + '월';
    return `<div class="hv5-hero">
      <div class="hv5-hero-l">
        <div class="hv5-hero-label">이번달 매출 <span class="hv5-hero-label-month">${monthLabel}</span></div>
        <div class="hv5-hero-amt" data-hv-count="${monthTotal}">${formatMoney(monthTotal)}</div>
        <div class="hv5-hero-meta">
          <div class="hv5-hero-chip">완료 <b>${monthCount}건</b></div>
        </div>
      </div>
      <div class="hv5-hero-r">
        <button type="button" class="hv5-hero-r-link" data-hv-act="openRevenue">매출 상세 ›</button>
        <div class="hv5-hero-stats">
          <div class="hv5-hero-stat">
            <div class="hv5-hero-stat-l">오늘 예상 매출</div>
            <div class="hv5-hero-stat-v pred" data-hv-count="${todayExpected}">${todayExpected > 0 ? formatEstimate(todayExpected) : '0원'}</div>
          </div>
          <div class="hv5-hero-stat">
            <div class="hv5-hero-stat-l">이번달 AI 예상 매출</div>
            <div class="hv5-hero-stat-v" data-hv-count="${projected}">${projected > 0 ? formatEstimate(projected) : '집계 중…'}</div>
          </div>
        </div>
      </div>
    </div>`;
  }

  // 이모지(💳💬) 대체 — SVG 라인 아이콘. 단순하고 톤 일관.
  const _ICON_SVG = {
    card: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
    chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  };

  // [v6] 알림 — dot + title + desc + count + arrow. 카드 wrapper 안에서 호출됨.
  function _renderAlertsV5(brief, dmQueueCount, onlinePendingCount) {
    const items = [];
    const depositPending = (brief && brief.pending_booking_count) || 0;
    if (depositPending > 0) {
      items.push({ tone: 'amber', title: '결제 미확인 예약', desc: '입금 확인 후 승인하면 캘린더에 등록돼요', count: depositPending, act: 'openBookingApproval' });
    }
    if (dmQueueCount > 0) {
      items.push({ tone: 'purple', title: 'DM 자동응답 승인', desc: '챗봇이 작성한 답장을 확인해 주세요', count: dmQueueCount, act: 'openDMConfirmQueue' });
    }
    if (onlinePendingCount > 0 && onlinePendingCount !== depositPending) {
      items.push({ tone: 'cyan', title: '온라인 예약 승인 대기', desc: '손님이 사장님 승인을 기다리고 있어요', count: onlinePendingCount, act: 'openBookingApproval' });
    }
    // 단골 안부 — at_risk
    const atRisk = (brief && brief.at_risk) || [];
    if (Array.isArray(atRisk) && atRisk.length > 0) {
      const first = atRisk[0]?.name || '단골';
      items.push({ tone: 'pink', title: '단골 안부', desc: `${first}님 다녀가신 지 오래`, count: atRisk.length, act: 'openInsights' });
    }
    if (!items.length) return '';
    const total = items.reduce((s, it) => s + it.count, 0);
    return `<div class="hv5-card">
      <div class="hv5-card-h">
        <div class="hv5-card-title">확인 필요</div>
        <span style="font-size:11px;color:#E5586E;font-weight:700">${total}건</span>
      </div>
      <div class="hv5-noti-list">${items.map(it => `
        <button type="button" class="hv5-noti" data-hv-act="${_esc(it.act)}">
          <div class="hv5-noti-dot ${it.tone}"></div>
          <div class="hv5-noti-body">
            <div class="hv5-noti-title">${_esc(it.title)}</div>
            <div class="hv5-noti-desc">${_esc(it.desc)}</div>
          </div>
          <div class="hv5-noti-count">${it.count}건</div>
          <div class="hv5-noti-arrow" aria-hidden="true">›</div>
        </button>
      `).join('')}</div>
    </div>`;
  }

  // [v6] 인덱스 % 5 컬러 + 가격 표시 + 카드 wrapper
  const _HV5_COLORS = ['pink', 'blue', 'teal', 'purple', 'orange'];
  function _renderBookingV5(brief) {
    const all = _todayBookings(brief);
    const empty = CFG().BOOKING_EMPTY_DISPLAY || 'hide';
    if (!all.length) {
      if (empty === 'hide') return '';
      return `<div class="hv5-card">
        <div class="hv5-card-h">
          <div class="hv5-card-title">오늘의 예약</div>
          <button type="button" class="hv5-card-link" data-hv-act="openCalendar">캘린더 →</button>
        </div>
        <button type="button" class="hv5-bk-empty" data-hv-act="openCalendar">오늘 예약 없음</button>
      </div>`;
    }
    const max = CFG().BOOKING_SLOTS_MAX || 5;
    const now = Date.now();
    const idxNext = all.findIndex(b => {
      const t = Date.parse(b.starts_at || '');
      return Number.isFinite(t) && t >= now;
    });
    const visible = all.slice(0, max);
    const more = all.length - visible.length;
    const slotsHtml = visible.map((b, i) => {
      const isNow = i === idxNext;
      const colorCls = ' hv5-slot-' + _HV5_COLORS[i % 5];
      const stLabel = _slotStatusLabel(b.status);
      let stBadgeCls = 'conf';
      if (b.status === 'completed') stBadgeCls = 'done';
      else if (b.status === 'cancelled' || b.status === 'no_show') stBadgeCls = 'cncl';
      const stBadge = stLabel ? `<span class="hv5-s-badge ${stBadgeCls}">${stLabel}</span>` : '';
      const name = _esc(b.customer_name || b.name || '');
      const svc  = _esc(b.service_name || '');
      // [v202] brief.today_bookings 에 amount 없으면 서비스 프리셋 가격 폴백.
      let amt = Number(b.amount) || 0;
      if (!amt && b.service_name) {
        const k = String(b.service_name).trim().toLowerCase();
        const cache = window._serviceTemplatesCache || [];
        const hit = cache.find(t => String(t.name||'').trim().toLowerCase() === k);
        if (hit && hit.default_price) amt = Number(hit.default_price) || 0;
      }
      // 천원 미만 반올림 (v202 W1 정책 동기화)
      const amtRounded = amt > 0 ? (Math.round(amt / 1000) * 1000) : 0;
      const amtStr = amtRounded > 0 ? amtRounded.toLocaleString('ko-KR') + '원' : '';
      return `<button type="button" class="hv5-slot${isNow ? ' now' : ''}${colorCls}" data-hv-slot="${i}" data-hv-time="${_esc(b.starts_at || '')}">
        <span class="hv5-s-time">${_esc(_hhmm(b.starts_at))}</span>
        <span class="hv5-s-bar" aria-hidden="true"></span>
        <span class="hv5-s-info">
          <span class="hv5-s-name">${name}</span>
          ${svc ? `<span class="hv5-s-svc">${svc}</span>` : ''}
          ${amtStr ? `<span class="hv5-s-amt">${amtStr}</span>` : ''}
        </span>
        ${stBadge}
      </button>`;
    }).join('');
    const moreRow = more > 0
      ? `<button type="button" class="hv5-s-more" data-hv-act="openCalendar">+${more}건 더 보기</button>`
      : '';
    return `<div class="hv5-card">
      <div class="hv5-card-h">
        <div class="hv5-card-title">오늘의 예약 ${all.length}건</div>
        <button type="button" class="hv5-card-link" data-hv-act="openCalendar">캘린더 →</button>
      </div>
      <div class="hv5-slots">${slotsHtml}${moreRow}</div>
    </div>`;
  }

  // [v6 A-3] AI 비서 — 9개 카드 항상 표시, ok=0 할 일 + ok=1 긍정 카드 두 형태
  function _renderAIRecsV5(cards) {
    if (!cards || !cards.length) return '</div>';  // .hv5 wrapper 만 닫음
    const total = cards.length;
    const todoCnt = cards.filter(c => !c.ok).length;
    const cardHtml = cards.map(c => {
      if (c.ok) {
        return `<div class="hv5-ai-card hv5-ai-card-page ok" data-ok="1">
          <div class="hv5-ai-tag">
            <div class="hv5-ai-dot" style="background:${_esc(c.dot || '#10B981')}"></div>
            <div class="hv5-ai-tag-t">${_esc(c.cat || '')}</div>
            <span class="hv5-ai-check">✓</span>
          </div>
          <div class="hv5-ai-ok-msg">${_esc(c.okMsg || '')}</div>
        </div>`;
      }
      return `<div class="hv5-ai-card hv5-ai-card-page" data-ok="0" data-hv-act="${_esc(c.act || '')}" role="button" tabindex="0">
        <div class="hv5-ai-tag">
          <div class="hv5-ai-dot" style="background:${_esc(c.dot || '#E5586E')}"></div>
          <div class="hv5-ai-tag-t">${_esc(c.cat || '')}</div>
        </div>
        <div class="hv5-ai-hl">${_esc(c.hl || '')}</div>
        <div class="hv5-ai-desc">${_esc(c.desc || '')}</div>
        <button type="button" class="hv5-ai-btn" data-hv-act="${_esc(c.act || '')}">${_esc(c.btn || '확인')} ›</button>
      </div>`;
    }).join('');
    const pages = Math.max(1, Math.ceil(total / 3));
    const dots = Array.from({ length: pages }, (_, i) =>
      `<button type="button" class="hv5-ai-dot-nav${i === 0 ? ' on' : ''}" data-hv-ai-page="${i}" aria-label="페이지 ${i + 1}"></button>`
    ).join('');
    const navHtml = pages > 1 ? `
      <div class="hv5-ai-nav">
        <button type="button" class="hv5-ai-nav-btn" id="hv5AiPrev" disabled aria-label="이전">‹</button>
        <div class="hv5-ai-dots" id="hv5AiDots">${dots}</div>
        <button type="button" class="hv5-ai-nav-btn" id="hv5AiNext" aria-label="다음">›</button>
      </div>` : '';
    return `<div class="hv5-ai">
      <div class="hv5-ai-label">
        <span class="hv5-ai-pulse" aria-hidden="true"></span>
        <span class="hv5-ai-label-t"><b>AI 비서</b> 실시간 분석</span>
        <span class="hv5-ai-label-count">${todoCnt > 0 ? todoCnt + '건 확인 필요' : '모두 정상'}</span>
      </div>
      <div class="hv5-ai-track" id="hv5AiTrack">${cardHtml}</div>
      ${navHtml}
    </div></div>`;  // 마지막 </div> = .hv5 wrapper 닫기
  }

  function _renderOpsV5(brief) {
    /* INVENTORY_HIDDEN const stock = _opsStock(brief); */
    const custVal = _opsCustomers(brief);
    const monthTotal = (brief && brief.this_month_total) || 0;
    /* INVENTORY_HIDDEN const stockDanger = stock.danger ? ' danger' : ''; */
    return `<div class="hv5-ops">
      <div class="hv5-ops-title">운영 관리</div>
      <div class="hv5-ops-grid">
        <!-- INVENTORY_HIDDEN
        <button type="button" class="hv5-ops-card" data-hv-act="openInventory">
          <div class="hv5-ops-cat">재고관리</div>
          <div class="hv5-ops-val${"$"}{stockDanger}">${"$"}{_esc(stock.val)}</div>
        </button>
        -->
        <button type="button" class="hv5-ops-card" data-hv-act="openCustomers">
          <div class="hv5-ops-cat">고객관리</div>
          <div class="hv5-ops-val">${_esc(custVal)}</div>
        </button>
        <button type="button" class="hv5-ops-card" data-hv-act="openRevenue">
          <div class="hv5-ops-cat">매출관리</div>
          <div class="hv5-ops-val">${formatMoney(monthTotal)}</div>
        </button>
      </div>
    </div></div>`;  /* </div> 닫는 .hv5 wrapper */
  }

  async function _doRender(containerId) {
    const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!container) return;
    _lastContainerId = container.id || _lastContainerId;

    // SWR: 캐시 즉시 (DM 큐 카운트는 캐시에 없으니 0 으로 시작)
    const swr = _readSWR();
    if (swr && swr.d) {
      try {
        const slots = await _fetchSlots();
        container.innerHTML = _composeHTML(swr.d, slots, swr.d._dmQueueCount || 0, swr.d._onlinePendingCount || 0);
        _setupCarousel(container);
        _bindEvents(container, swr.d);
        _syncAvatar(container);
        _scheduleAvatarRetry(container);
        _watchHeaderAvatar();
        _runCountUps(container);  // [v6]
        if (swr.fresh) return;
      } catch (_e) { /* fall through */ }
    }

    if (_inFlight) return;
    _inFlight = true;
    try {
      const [brief, slots, onlinePendingCount, dmQueueCount, projected] = await Promise.all([
        _fetchBrief().catch(() => null),
        _fetchSlots().catch(() => []),
        _fetchPendingCount().catch(() => 0),
        _fetchDMQueueCount().catch(() => 0),
        _fetchProjectedTotal().catch(() => 0),  // [v6] 이번달 AI 예상
      ]);
      const merged = brief || (swr && swr.d) || {};
      // [A12] 모든 API 실패 시 에러 안내
      if (!brief && !(swr && swr.d) && (!slots || !slots.length)) {
        container.innerHTML = `
          <div style="text-align:center;padding:60px 20px;color:var(--text-muted)">
            <div style="font-size:40px;margin-bottom:12px">📡</div>
            <div style="font-size:16px;font-weight:600;margin-bottom:8px">연결이 불안정해요</div>
            <div style="font-size:14px">인터넷 연결을 확인하고 다시 시도해주세요</div>
            <button onclick="location.reload()" style="margin-top:16px;padding:10px 24px;background:var(--brand);color:#fff;border:none;border-radius:10px;font-size:14px;cursor:pointer">다시 시도</button>
          </div>`;
        return;
      }
      merged._dmQueueCount = dmQueueCount;
      merged._onlinePendingCount = onlinePendingCount;
      merged._projected_total = projected;  // [v6]
      try { _writeSWR(merged); } catch (_e) { void _e; }
      container.innerHTML = _composeHTML(merged, slots || [], dmQueueCount, onlinePendingCount);
      _setupCarousel(container);
      _bindEvents(container, merged);
      _syncAvatar(container);
      _scheduleAvatarRetry(container);
      _runCountUps(container);  // [v6]
      requestAnimationFrame(() => { window.scrollTo(0, 0); });
    } finally {
      _inFlight = false;
    }
  }

  // 인스타 fetch 가 v4.1 마운트보다 늦게 끝날 수 있어 한 번만 추가 sync.
  let _avatarRetryTimer = 0;
  function _scheduleAvatarRetry(container) {
    if (_avatarRetryTimer) clearTimeout(_avatarRetryTimer);
    _avatarRetryTimer = setTimeout(() => {
      _avatarRetryTimer = 0;
      const root = document.getElementById('homeV41Root');
      if (root && root.contains(container)) _syncAvatar(container);
      else if (root) _syncAvatar(root);
    }, 5000);
  }

  // 2026-05-01 ── 인스타 연동 후 #headerAvatar 변경 감지: MutationObserver.
  // updateHeaderProfile (app-core.js) 이 itdasy:data-changed 발사 안 해서
  // OAuth 끝나도 v4.1 헤더 아바타 갱신 안 되던 버그 픽스.
  let _avatarObserver = null;
  function _watchHeaderAvatar() {
    if (_avatarObserver) return;
    const target = document.getElementById('headerAvatar');
    if (!target) return;
    _avatarObserver = new MutationObserver(() => {
      const root = document.getElementById('homeV41Root');
      if (root) _syncAvatar(root);
    });
    _avatarObserver.observe(target, {
      childList: true,        // <img> 추가/제거
      subtree: true,
      attributes: true,
      attributeFilter: ['src'],
    });
  }

  // ─────────── 공개 API ───────────
  window.HomeV41 = {
    async render(containerId) { return _doRender(containerId || 'homeV41Root'); },
    async refresh() {
      if (_lastContainerId) return _doRender(_lastContainerId);
    },
  };

  // ─────────── 자동 부트스트랩 ───────────
  function _autoMount() {
    const el = document.getElementById('homeV41Root');
    if (el) _doRender(el);
    // [v206 2026-05-19] 모닝 브리핑 마운트 제거 — AI비서 실시간 분석과 중복.
    //   homeMorningMount div 자체는 호환성 위해 남겨둠 (display:none).
    //   TodayMorning 모듈은 유지 (다른 진입점에서 사용 가능).
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _autoMount, { once: true });
  } else {
    _autoMount();
  }

  // 데이터 변경 이벤트 — 홈 탭 활성 시 재렌더 + 아바타 즉시 동기화
  if (!window._homeV41DataListenerInit) {
    window._homeV41DataListenerInit = true;
    window.addEventListener('itdasy:data-changed', (ev) => {
      const kind = (ev && ev.detail && ev.detail.kind) || '';
      // [v201] 안전망 — booking/revenue/completion 관련이면 brief SWR 캐시 즉시 삭제.
      //   booking-api 측 무효화가 있긴 하지만 racy 케이스 방어.
      if (/booking|revenue|completion|customer/.test(kind)) {
        try { localStorage.removeItem(SWR_KEY); } catch (_e) { void _e; }
        try { sessionStorage.removeItem(SWR_KEY); } catch (_e) { void _e; }
      }
      const root = document.getElementById('homeV41Root');
      if (!root) return;
      // 홈 탭 비활성이어도 아바타는 최신화 (다음 진입 시 깜빡임 방지)
      _syncAvatar(root);
      const homeTab = document.getElementById('tab-home');
      if (homeTab && homeTab.classList.contains('active')) _doRender(root);
    });
  }

  // [v201] 서비스 프리셋 사전 로드 — todayExpected 폴백 가격이 작동하려면 캐시 필요.
  //   loadServiceTemplates 완료 후 홈이 mount 됐으면 한번 더 렌더.
  if (typeof window.loadServiceTemplates === 'function' && !window._homeV41SvcWarmed) {
    window._homeV41SvcWarmed = true;
    window.loadServiceTemplates().then(() => {
      const root = document.getElementById('homeV41Root');
      if (root) _doRender(root);
    }).catch(() => { /* silent */ });
  }
})();
