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

  function _buildCarouselCards(brief, slots) {
    const cards = [];
    const hasCaption = _hasUnpublishedPhotoSlot(slots);
    // 1) AI 캡션 (featured)
    if (hasCaption) {
      const cnt = slots.filter(s => s.status !== 'done' && Array.isArray(s.photos) && s.photos.length > 0).length;
      cards.push({
        kind: 'caption', featured: true, dot: 'pink', cat: '캡션 추천',
        headline: `사진 ${cnt}장, 캡션 만들까요?`,
        sub: '갤러리에 발행 대기 중인 작업이 있어요',
        cta: '캡션 만들기', act: 'openCaption',
      });
    }
    // 2) 이탈 위험
    const atRisk = (brief && brief.at_risk) || [];
    if (atRisk.length > 0) {
      const first = atRisk[0] && atRisk[0].name ? atRisk[0].name : '단골';
      cards.push({
        kind: 'risk', dot: 'amber', cat: '단골 관리',
        headline: `${first}님 다녀가신 지 오래`,
        sub: atRisk.length > 1 ? `이탈 위험 손님 ${atRisk.length}명` : '안부 한 통 보낼 타이밍이에요',
        cta: '안부 보내기', act: 'openInsights',
      });
    }
    // 3) 입금 대기 예약
    const pendingCount = (brief && brief.pending_booking_count) || 0;
    if (pendingCount > 0) {
      cards.push({
        kind: 'booking-pending', dot: 'amber', cat: '예약 승인',
        headline: `입금 대기 예약 ${pendingCount}건`,
        sub: '입금 확인 후 승인하면 캘린더에 반영돼요',
        cta: '확인하기', act: 'openBookingApproval',
      });
    }
    // 4) 이어하기 (캡션 카드 있으면 dedup — 같은 갤러리 상태 가리킴)
    if (!hasCaption && _hasInProgressSlot(slots)) {
      cards.push({
        kind: 'resume', dot: 'green', cat: '이어하기',
        headline: '진행 중인 작업이 있어요',
        sub: '갤러리에서 마무리할 슬롯이 남았어요',
        cta: '이어서 작업', act: 'openGallery',
      });
    }
    // 5) 내일 예약
    if (_hasTomorrowBooking(brief)) {
      cards.push({
        kind: 'tomorrow', dot: 'purple', cat: '내일 예약',
        headline: '내일도 예약이 있어요',
        sub: '미리 자료 챙겨두면 편해요',
        cta: '캘린더 보기', act: 'openCalendar',
      });
    }
    // 빈 상태 → 온보딩 카드로 채워서 첫 화면이 비지 않게
    const final = cards.length ? cards : _onboardingCards();
    return final.slice(0, CFG().CAROUSEL_MAX_CARDS || 6);
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
      return `<button type="button" class="hv-slot${cls}" data-hv-slot="${i}" data-hv-time="${_esc(b.starts_at || '')}">${_esc(_hhmm(b.starts_at))}</button>`;
    }).join('');
    const moreChip = more > 0 ? `<div class="hv-slot" aria-label="추가 예약">+${more}건 더</div>` : '';
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
  function _won(n) {
    try { return '₩' + (Number(n) || 0).toLocaleString('ko-KR'); }
    catch (_e) { return '₩0'; }
  }
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
    return _won(v);
  }
  function _renderOps(brief) {
    const stock = _opsStock(brief);
    const custVal = _opsCustomers(brief);
    const revVal = _opsRevenue(brief);
    const stockDanger = stock.danger ? ' is-danger' : '';
    return `
      <section class="hv-ops" aria-label="운영 관리">
        <div class="hv-ops__title">운영 관리</div>
        <div class="hv-ops__grid">
          <button type="button" class="hv-ops__card" data-hv-act="openInventory">
            <div class="hv-ops__cat">재고관리</div>
            <div class="hv-ops__val${stockDanger}">${_esc(stock.val)}</div>
          </button>
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
        if (typeof window.showTab === 'function') {
          const btn = document.querySelector('.tab-bar__btn[data-tab="dashboard"]');
          try { window.showTab('dashboard', btn); } catch (_e) { /* ignore */ }
        }
      },
      openInventory: () => {
        if (typeof window.openInventoryPanel === 'function') return window.openInventoryPanel();
      },
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
  }

  // ─────────── 메인 렌더 ───────────
  let _lastContainerId = null;
  let _inFlight = false;

  // 2026-05-08 (rev2): 캐러셀 복구 + 상단에 승인 알림 센터 추가.
  // 진짜 "8개 퀵탭" 은 app-phase9-ux.js 의 p9-quick-dock — 거기서 제거.
  function _composeHTML(brief, slots, dmQueueCount, onlinePendingCount) {
    const cards = _buildCarouselCards(brief, slots);
    return [
      _renderHeader(),
      _renderApprovalCenter(brief, dmQueueCount || 0, onlinePendingCount || 0),
      _renderCarousel(cards),
      _renderBooking(brief),
      _renderOps(brief),
    ].join('');
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
        if (swr.fresh) return;
      } catch (_e) { /* fall through */ }
    }

    if (_inFlight) return;
    _inFlight = true;
    try {
      const [brief, slots, onlinePendingCount, dmQueueCount] = await Promise.all([
        _fetchBrief().catch(() => null),
        _fetchSlots().catch(() => []),
        _fetchPendingCount().catch(() => 0),
        _fetchDMQueueCount().catch(() => 0),
      ]);
      const merged = brief || (swr && swr.d) || {};
      // brief.pending_booking_count 은 입금 대기 — 그대로 유지
      merged._dmQueueCount = dmQueueCount;
      merged._onlinePendingCount = onlinePendingCount;
      try { _writeSWR(merged); } catch (_e) { void _e; }
      container.innerHTML = _composeHTML(merged, slots || [], dmQueueCount, onlinePendingCount);
      _setupCarousel(container);
      _bindEvents(container, merged);
      _syncAvatar(container);
      _scheduleAvatarRetry(container);
      // [Hotfix] 홈 첫 로딩 시 두 번째 innerHTML 교체로 스크롤이 밀리는 문제 — 한 프레임 뒤 리셋
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
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _autoMount, { once: true });
  } else {
    _autoMount();
  }

  // 데이터 변경 이벤트 — 홈 탭 활성 시 재렌더 + 아바타 즉시 동기화
  if (!window._homeV41DataListenerInit) {
    window._homeV41DataListenerInit = true;
    window.addEventListener('itdasy:data-changed', () => {
      const root = document.getElementById('homeV41Root');
      if (!root) return;
      // 홈 탭 비활성이어도 아바타는 최신화 (다음 진입 시 깜빡임 방지)
      _syncAvatar(root);
      const homeTab = document.getElementById('tab-home');
      if (homeTab && homeTab.classList.contains('active')) _doRender(root);
    });
  }
})();
