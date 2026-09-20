/* ───────────────────────────────────────────────────────────
   app-drawer.js — 내샵관리 좌측 슬라이드 드로어
   2026-04-28 (라우팅 보정 v2)
   - 정확한 진입 함수명으로 매핑 (조사 결과 반영)
   - 햅틱·ESC 닫기·백드롭 클릭 닫기·body 스크롤 잠금
   ─────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const DRAWER_ID = 'shopDrawer';
  const BACKDROP_ID = 'shopDrawerBackdrop';
  const TRIGGER_SELECTOR = '[data-drawer-trigger]';

  let _isOpen = false;

  // ── 라우트 매핑 (2026-04-30 — 13개 → 5개 + AI허브 + 설정허브로 통합) ──
  const ROUTES = {
    // 핵심 4 운영 메뉴
    bookings:     () => _call(['openCalendarView']),
    customer:     () => _call(['openCustomerHub']),
    revenue:      () => _call(['openRevenue', 'openRevenueHub']),
    // 손님 문의 (2026-08-16 — "통합 허브" 폐지, ai_hub 라우트 → insta_dm 이 대신함)
    // 인스타DM 화면 3개→1개 통합 — app-dm-menu.js '인스타DM 손님 응대' 직결.
    insta_dm:      () => _call(['openDMMenuSettings']),
    // 인스타 댓글 — app-comment-reply-queue.js 는 lazy(extras). 로드 보장 후 호출
    //   (js/home/v41-actions.js openCommentQueue 와 같은 패턴).
    insta_comment: () => {
      if (typeof window.openCommentReplyQueue === 'function') return _call(['openCommentReplyQueue']);
      if (window.AppLoader && window.AppLoader.ensure) {
        const go = () => _call(['openCommentReplyQueue']);
        Promise.resolve(window.AppLoader.ensure('extras')).then(go).catch(go);
        return true;
      }
      return _call(['openCommentReplyQueue']);
    },
    // 내 정보
    integrations: () => _call(['openIntegrationsHub']),
    settings_hub: () => _call(['openSettingsHub']),
    plan:         () => _call(['openPlan', 'openPlanPopup']),
    // 레거시 라우트 호환 (외부 링크가 직접 호출하는 경우)
    dm:        () => _call(['openDMMenuSettings']),
    kakao:     () => _call(['openKakaoHub']),
    persona:   () => _call(['openPersonaSurveyModal']),
    posts:     () => _call(['openFinishTab']),
    caption:   () => _call(['openCaptionScenarioPopup']),
    naver:     () => _call(['openNaverLink']),
    payment:   () => _call(['openRevenue', 'openRevenueHub', 'openRevenueInput']),
    shopinfo:  () => _call(['openShopSettings']),
    // [2026-07-05] failures 라우트 제거 — 실패 알림은 알림함(app-notifications)으로 통합.
    backup:    () => _call(['openBackupScreen']),
  };

  function _call(fnNames) {
    for (const n of fnNames) {
      const fn = window[n];
      if (typeof fn === 'function') {
        try { fn(); return true; } catch (e) { console.warn('[drawer] route error:', n, e); }
      }
    }
    if (window.showToast) window.showToast('해당 화면이 아직 준비 중이에요');
    return false;
  }

  function _haptic() {
    try { if (window.hapticLight) window.hapticLight(); } catch (_) { /* ignore */ }
  }

  function openShopDrawer() {
    const drawer = document.getElementById(DRAWER_ID);
    const backdrop = document.getElementById(BACKDROP_ID);
    if (!drawer || !backdrop || _isOpen) return;
    /* [2026-09-21 CBT] 열 때마다 다시 그린다. _init 에서 한 번만 그리면
       app-plan.js 의 `_currentPlan` 이 아직 초기값 'free' 인 시점이라
       (_loadStatus 가 비동기 + 1.5초 지연 재시도) 유료 계정도 '체험' 으로 굳는다.
       샵 이름도 마찬가지로 나중에 채워진다. 드로어는 자주 열리지 않으니
       열 때 한 번 다시 읽는 비용이 싸다. */
    _hydrateShopHeader();
    _isOpen = true;
    document.body.style.overflow = 'hidden';
    drawer.classList.add('is-open');
    backdrop.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    _haptic();
    const first = drawer.querySelector('.drawer-item');
    if (first) setTimeout(() => first.focus(), 280);
  }

  function closeShopDrawer() {
    const drawer = document.getElementById(DRAWER_ID);
    const backdrop = document.getElementById(BACKDROP_ID);
    if (!drawer || !backdrop || !_isOpen) return;
    _isOpen = false;
    drawer.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    _haptic();
  }

  function toggleShopDrawer() { _isOpen ? closeShopDrawer() : openShopDrawer(); }

  function _onItemClick(e) {
    const btn = e.target.closest('[data-drawer-route]');
    if (!btn) return;
    const route = btn.getAttribute('data-drawer-route');
    _haptic();
    closeShopDrawer();
    setTimeout(() => {
      const handler = ROUTES[route];
      if (handler) handler();
      else if (window.showToast) window.showToast('해당 화면이 아직 준비 중이에요');
    }, 220);
  }

  function _hydrateShopHeader() {
    try {
      const nameEl = document.querySelector('.shop-drawer .shop-name');
      const avatarEl = document.querySelector('.shop-drawer .shop-avatar');
      const planEl = document.querySelector('.shop-drawer .shop-plan');
      if (!nameEl) return;
      /* [2026-09-21 CBT] 여기가 **읽는 키를 아무도 쓰지 않아서** 통째로 폴백만 타고 있었다.
         실측(에뮬레이터, membership 계정 cbt01):
           window.__plan            → undefined  (전 코드베이스에 `__plan =` 대입 0건)
           localStorage.itdasy_plan_name → null  (읽는 곳만 여기, 쓰는 곳 0건)
           → 하드코딩 '체험' 으로 떨어져 **유료 사용자 전원이 메뉴에서 '체험'** 으로 보였다.
             정작 상단 헤더는 app-plan.js 가 '잇데이 Pro' 를 제대로 그리고 있어서
             같은 화면에 플랜이 두 개로 갈렸다.
           localStorage.itdasy_shop_name → null  (app-shop-settings 가 저장할 때만 생김)
           → 샵 설정을 한 번도 안 연 계정은 '내 샵'. 정작 `shop_name` 키엔
             '로즈네일 스튜디오' 가 들어 있었다.
         정본을 먼저 본다: 플랜은 app-plan.js 의 getCurrentPlanLabel(),
         샵 이름은 실제로 채워지는 `shop_name` 키(app-shop-settings.js:309 와 같은 순서). */
      const shopName =
        (window.__shop && window.__shop.name) ||
        localStorage.getItem('itdasy_shop_name') ||
        localStorage.getItem('shop_name') ||
        '내 샵';
      const plan =
        (typeof window.getCurrentPlanLabel === 'function' && window.getCurrentPlanLabel()) ||
        (window.__plan && window.__plan.name) ||
        localStorage.getItem('itdasy_plan_name') ||
        '체험';
      nameEl.textContent = shopName;
      if (planEl) planEl.textContent = plan;
      if (avatarEl) avatarEl.textContent = (shopName || '잇').trim().charAt(0);
    } catch (_) { /* silent */ }
  }

  function _init() {
    document.addEventListener('click', (e) => {
      const t = e.target.closest(TRIGGER_SELECTOR);
      if (t) { e.preventDefault(); openShopDrawer(); }
    });
    const drawer = document.getElementById(DRAWER_ID);
    const backdrop = document.getElementById(BACKDROP_ID);
    if (backdrop) backdrop.addEventListener('click', closeShopDrawer);
    if (drawer) {
      drawer.addEventListener('click', _onItemClick);
      const closeBtn = drawer.querySelector('[data-drawer-close]');
      if (closeBtn) closeBtn.addEventListener('click', closeShopDrawer);
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && _isOpen) closeShopDrawer();
    });
    _hydrateShopHeader();
  }

  window.openShopDrawer = openShopDrawer;
  window.closeShopDrawer = closeShopDrawer;
  window.toggleShopDrawer = toggleShopDrawer;
  window.ShopDrawer = window.ShopDrawer || {};
  window.ShopDrawer.registerRoute = function (key, fn) {
    if (typeof fn === 'function') ROUTES[key] = () => { try { fn(); } catch (_) { /* ignore */ } };
  };
  window.ShopDrawer.refreshHeader = _hydrateShopHeader;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
  else _init();
})();
