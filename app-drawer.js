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

  // ── 라우트 매핑 (실제 함수명 기준) ─────────────────────────
  const ROUTES = {
    bookings:  () => _call(['openCalendarView']),
    inventory: () => _call(['openInventoryHub']),
    customer:  () => _call(['openCustomerHub']),
    revenue:   () => _call(['openRevenueHub']),
    dm:        () => _call(['openDMAutoreplySettings']),
    kakao:     () => _call(['openKakaoHub']),
    persona:   () => _call(['openPersonaSurveyModal']),
    posts:     () => _call(['openReviewPanel']),
    caption:   () => _call(['openCaptionScenarioPopup']),
    naver:     () => _call(['openNaverLink']),
    payment:   () => _call(['openPlanPopup']),
    shopinfo:  () => _call(['openShopSettings']),
    failures:  () => _call(['openFailuresHub']),
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
    try { if (window.hapticLight) window.hapticLight(); } catch (_) {}
  }

  function openShopDrawer() {
    const drawer = document.getElementById(DRAWER_ID);
    const backdrop = document.getElementById(BACKDROP_ID);
    if (!drawer || !backdrop || _isOpen) return;
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
      const shopName =
        (window.__shop && window.__shop.name) ||
        localStorage.getItem('itdasy_shop_name') ||
        '내 샵';
      const plan =
        (window.__plan && window.__plan.name) ||
        localStorage.getItem('itdasy_plan_name') ||
        'Free 플랜';
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
    if (typeof fn === 'function') ROUTES[key] = () => { try { fn(); } catch (_) {} };
  };
  window.ShopDrawer.refreshHeader = _hydrateShopHeader;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
  else _init();
})();
