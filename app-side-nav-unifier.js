/* [2026-05-04] 사이드바 통합 핸들러
   - 사이드바 .ms-side__item 클릭 시 현재 열린 hub 자동 종료 → 새 hub 열기
   - 클릭한 항목에 .is-active 표시 (홈/내샵관리 패턴 동일)
   - 의도: 4개 관리화면 전환을 홈↔내샵관리 처럼 매끄럽게 */
(function () {
  'use strict';

  function _closeAllHubs() {
    try { window.closeCustomerHub?.(); } catch (_e) { void _e; }
    try { window.closeInventoryHub?.(); } catch (_e) { void _e; }
    try { window.closeRevenue?.(); } catch (_e) { void _e; }
    try { window.closeRevenueHub?.(); } catch (_e) { void _e; }
    try { window.closeBooking?.(); } catch (_e) { void _e; }
    try { window.closeServiceTemplates?.(); } catch (_e) { void _e; }
    try { window.closeAiHub?.(); } catch (_e) { void _e; }
    try { window.closeSettingsHub?.(); } catch (_e) { void _e; }
  }
  window._closeAllHubs = _closeAllHubs;

  function _markActive(btn) {
    document.querySelectorAll('.ms-side__item').forEach(b => b.classList.remove('is-active'));
    if (btn) btn.classList.add('is-active');
  }

  // capture: true → inline onclick 이전에 실행되어 기존 hub 먼저 종료
  document.addEventListener('click', function (ev) {
    const btn = ev.target && ev.target.closest && ev.target.closest('.ms-side__item');
    if (!btn) return;
    // 홈/내샵관리는 showTab 이 자체 처리하므로 close 만 호출 (열린 hub 닫고 탭 노출)
    _closeAllHubs();
    _markActive(btn);
  }, true);
})();
