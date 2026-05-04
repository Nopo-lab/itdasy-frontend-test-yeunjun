/* [2026-05-04] 사이드바 통합 핸들러
   - 사이드바 .ms-side__item 클릭 시 현재 열린 hub 자동 종료 → 새 hub 열기
   - 클릭한 항목에 .is-active 표시 (홈/내샵관리 패턴 동일)
   - 의도: 4개 관리화면 전환을 홈↔내샵관리 처럼 매끄럽게 */
(function () {
  'use strict';

  function _closeAllHubs() {
    // [2026-05-04] SheetAnim.close 의 220ms setTimeout 이 재오픈 직후 display:none 으로
    // 덮어쓰는 race condition 회피 — 직접 display 조작.
    ['aiHubSheet', 'settingsHubSheet', 'planPopup', 'supportChatModal'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.style.display = 'none';
        el.style.opacity = '';
        el.style.transition = '';
      }
      const card = el?.querySelector('#aihCard, #shCard');
      if (card) {
        card.style.transition = '';
        card.style.transform = '';
        card.style.opacity = '';
      }
    });
    // 운영 hub 들 — overlay 요소 제거 (#genericSheet 도 .hub-overlay 라 같이 제거됨)
    document.querySelectorAll('.hub-overlay, .hub-backdrop').forEach(el => el.remove());
    try { window.closeSheet?.(); } catch (_e) { void _e; }
    // navSheet 직접 닫기 — closeNavSheet 의 280ms setTimeout race condition 회피
    const ns = document.getElementById('navSheet');
    if (ns) {
      ns.style.display = 'none';
      const nsInner = document.getElementById('navSheetInner');
      if (nsInner) {
        nsInner.style.transform = '';
        nsInner.style.transition = '';
      }
    }
    const rs = document.getElementById('revenueSheet');
    if (rs) rs.style.display = 'none';
    document.body.classList.remove('rv-mode');
    document.body.style.overflow = '';
    const co = document.getElementById('cal-overlay');
    if (co) co.remove();
    // popstate 관리용 sheet-closed 신호
    ['customers', 'inventory', 'revenue', 'booking', 'revenuehub', 'aihub', 'settingshub', 'nav'].forEach(k => {
      try { window._markSheetClosed?.(k); } catch (_e) { void _e; }
    });
  }
  window._closeAllHubs = _closeAllHubs;

  function _markActive(btn) {
    document.querySelectorAll('.ms-side__item').forEach(b => b.classList.remove('is-active'));
    if (btn) btn.classList.add('is-active');
  }

  // capture: true → inline onclick 이전에 실행되어 기존 hub 먼저 종료
  document.addEventListener('click', function (ev) {
    const btn = ev.target && ev.target.closest && ev.target.closest('.ms-side__item, .ms-side__fab');
    if (!btn) return;
    // 홈/내샵관리는 showTab 이 자체 처리하므로 close 만 호출 (열린 hub 닫고 탭 노출).
    // 만들기(.ms-side__fab) 도 다른 hub 자동 종료 → 새 navSheet 깔끔히 표시.
    _closeAllHubs();
    if (btn.classList.contains('ms-side__item')) _markActive(btn);
  }, true);
})();
