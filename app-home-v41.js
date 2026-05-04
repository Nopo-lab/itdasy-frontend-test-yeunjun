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
        <button type="button" class="hv-bell" data-hv-act="bell" aria-label="알림">
          <svg width="14" height="14" aria-hidden="true"><use href="#ic-bell"/></svg>
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
    // 3) DM 자동응답 — TODO[v1.5]: /dm/pending_drafts 확정 후 카드 추가
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
          <svg width="13" height="13" aria-hidden="true"><use href="#ic-chevron-right"/></svg>
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
        <span class="hv-ai-label__icon"><svg width="14" height="14" aria-hidden="true"><use href="#ic-sparkles"/></svg></span>
        <span class="hv-ai-label__text"><b>AI 비서</b>가 ${total}가지 추천했어요</span>
        <span class="hv-ai-label__count" data-hv-counter>1 / ${total}</span>
      </div>
      <div class="hv-carousel-wrap" style="position:relative;">
        <button type="button" class="hv-carousel-nav hv-carousel-nav--prev" data-hv-nav="prev" aria-label="이전 카드">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="hv-carousel" data-hv-carousel role="region" aria-label="AI 비서 추천">
          ${items}
        </div>
        <button type="button" class="hv-carousel-nav hv-carousel-nav--next" data-hv-nav="next" aria-label="다음 카드">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
      <div class="hv-dots" data-hv-dots>${dots}</div>
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

  function _composeHTML(brief, slots) {
    const cards = _buildCarouselCards(brief, slots);
    return [
      _renderHeader(),
      _renderCarousel(cards),
      _renderBooking(brief),
      _renderOps(brief),
    ].join('');
  }

  async function _doRender(containerId) {
    const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!container) return;
    _lastContainerId = container.id || _lastContainerId;

    // SWR: 캐시 즉시
    const swr = _readSWR();
    if (swr && swr.d) {
      try {
        const slots = await _fetchSlots();
        container.innerHTML = _composeHTML(swr.d, slots);
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
      const [brief, slots] = await Promise.all([
        _fetchBrief().catch(() => null),
        _fetchSlots().catch(() => []),
      ]);
      const merged = brief || (swr && swr.d) || {};
      container.innerHTML = _composeHTML(merged, slots || []);
      _setupCarousel(container);
      _bindEvents(container, merged);
      _syncAvatar(container);
      _scheduleAvatarRetry(container);
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
