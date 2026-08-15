/* [2026-05-04] 사이드바 통합 핸들러
   - 사이드바 .ms-side__item 클릭 시 현재 열린 hub 자동 종료 → 새 hub 열기
   - 클릭한 항목에 .is-active 표시 (홈/내샵관리 패턴 동일)
   - 의도: 4개 관리화면 전환을 홈↔내샵관리 처럼 매끄럽게 */
(function () {
  'use strict';

  function _closeAllHubs() {
    // [2026-05-04] SheetAnim.close 의 220ms setTimeout 이 재오픈 직후 display:none 으로
    // 덮어쓰는 race condition 회피 — 직접 display 조작.
    // [2026-08-16] dmHubSheet — app-dm-hub.js(별도 작업) 반입 대비 선등록 (미존재면 no-op).
    ['aiHubSheet', 'dmHubSheet', 'settingsHubSheet', 'planPopup', 'supportChatModal'].forEach(id => {
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
    // [2026-08-16] 인스타 댓글 큐(subscreen-overlay) — 사이드바 이동 시 잔존 방지
    try { window.closeCommentReplyQueue?.(); } catch (_e) { void _e; }
    // [v215] 고객 v4 시트들도 함께 닫기 (사이드바 이동 시 잔존 방지)
    try { window.closeCustomers?.(); } catch (_e) { void _e; }
    try { window.closeCustomerDashboard?.(); } catch (_e) { void _e; }
    const cs = document.getElementById('customerSheet');
    if (cs) cs.style.display = 'none';
    const cds = document.getElementById('customerDashSheet');
    if (cds) cds.style.display = 'none';
    // popstate 관리용 sheet-closed 신호
    ['customers', 'revenue', 'booking', 'revenuehub', 'aihub', 'settingshub', 'nav'].forEach(k => {
      try { window._markSheetClosed?.(k); } catch (_e) { void _e; }
    });
  }
  window._closeAllHubs = _closeAllHubs;

  function _markActive(btn) {
    document.querySelectorAll('.ms-side__item').forEach(b => b.classList.remove('is-active'));
    if (btn) btn.classList.add('is-active');
  }

  // [2026-06-12 fix] 클릭 직후 보호창 — 클릭이 _closeAllHubs→_markSheetClosed 를 쏘면
  //   60ms 뒤 _syncActive 가 도는데, 그 시점엔 새 화면이 아직 안 열려 "열린 화면 없음→홈"
  //   으로 방금 세팅한 활성을 되돌리던 자기-경합. 클릭 후 900ms 는 sync 가 양보한다.
  let _lastManualTs = 0;

  // capture: true → inline onclick 이전에 실행되어 기존 hub 먼저 종료
  document.addEventListener('click', function (ev) {
    const btn = ev.target && ev.target.closest && ev.target.closest('.ms-side__item, .ms-side__fab');
    if (!btn) return;
    // 홈/내샵관리는 showTab 이 자체 처리하므로 close 만 호출 (열린 hub 닫고 탭 노출).
    // 만들기(.ms-side__fab) 도 다른 hub 자동 종료 → 새 navSheet 깔끔히 표시.
    _closeAllHubs();
    if (btn.classList.contains('ms-side__item')) { _markActive(btn); _lastManualTs = Date.now(); }
  }, true);

  // [2026-06-11 QA] 시트를 X/뒤로가기로 닫으면 활성 표시가 직전 메뉴에 남던 버그 +
  //   [2026-06-12] 새로고침·hashchange 로 화면이 바뀌어도 동기화 안 되던 회귀(#revenue 인데 활성=홈).
  //   → 현재 보이는 화면/시트 기준으로 .is-active 동기화. 클릭 핸들러와 _markActive 공용.
  //   부팅·hashchange·시트 종료 시 호출.
  const _SCREEN_MAP = [
    { action: 'revenue',      sheets: ['revenueSheet'] },
    { action: 'customer',     sheets: ['customerSheet', 'customerDashSheet'] },
    { action: 'customer-dm',  sheets: ['dmConvSheet'] },
    { action: 'calendar',     sheets: ['cal-overlay'] },
    // [2026-08-16] ai-hub → insta-dm. dmHubSheet 는 app-dm-hub.js(별도 작업) 반입 전까지
    //   미존재 id — _visible 이 null 로 안전 통과하므로 미리 매핑해 둔다. 반입 후 실제 id 재확인.
    { action: 'insta-dm',      sheets: ['dmHubSheet'] },
    { action: 'insta-comment', sheets: ['commentReplyQueueScreen'] },
    { action: 'settings-hub', sheets: ['settingsHubSheet'] },
    { action: 'plan',         sheets: ['planPopup'] },
    { action: 'support',      sheets: ['supportChatModal'] },
  ];
  const _visible = (id) => {
    const el = document.getElementById(id);
    // [2026-06-12 fix] offsetParent 는 position:fixed 요소에서 항상 null —
    //   매출관리 등 fixed 시트가 전부 '안 보임' 판정돼 활성이 홈으로 폴백되던 원인.
    //   display:none 이면 offsetHeight 0 이므로 높이로 판정.
    // [2026-08-16] .subscreen-overlay(댓글 큐 등)는 translateX 슬라이드라 닫혀도
    //   offsetHeight > 0 — aria-hidden 으로 먼저 거른다.
    if (el && el.getAttribute('aria-hidden') === 'true') return false;
    return !!(el && el.style.display !== 'none' && el.offsetHeight > 0);
  };
  function _syncActive() {
    // [2026-06-12 fix] 사용자가 방금 직접 클릭했으면 그 선택을 존중 — 화면 열리기
    //   전의 중간 sync 가 홈으로 되돌리던 경합 차단.
    //   [2026-06-13] 900→2500ms: 고객관리처럼 데이터 로드가 느린 화면은 900ms 안에
    //   안 열려서 가드 만료 후 sync 가 또 홈으로 되돌렸음 (라이브 실측).
    if (Date.now() - _lastManualTs < 2500) return;
    // 만들기/어시스턴트 등 임시 시트가 떠 있으면 직전 활성 유지(덮어쓰지 않음)
    if (['navSheet', 'assistantSheet'].some(_visible)) return;
    for (const m of _SCREEN_MAP) {
      if (m.sheets.some(_visible)) {
        _markActive(document.querySelector(`.ms-side__item[data-static-action="${m.action}"]`));
        return;
      }
    }
    // 열린 화면 없음 → 실제 보이는 탭(홈/내샵관리)
    const tabKey = document.getElementById('tab-dashboard')?.classList.contains('active') ? 'dashboard' : 'home';
    _markActive(document.querySelector(`.ms-side__item[data-side-tab="${tabKey}"]`));
  }
  const _origMarkClosed = window._markSheetClosed;
  window._markSheetClosed = function (name) {
    try { if (typeof _origMarkClosed === 'function') _origMarkClosed(name); } catch (_e) { void _e; }
    setTimeout(_syncActive, 60);
  };
  // 부팅 시 + 해시 변경 시 동기화 (시트 복원이 끝난 뒤 반영되도록 약간 지연)
  window.addEventListener('hashchange', () => setTimeout(_syncActive, 60));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(_syncActive, 120));
  else setTimeout(_syncActive, 120);
  // [2026-06-12 fix] 해시 복원(#revenue 등)은 데이터 로드 후 늦게 열림 — 120ms 1회로는
  //   부팅 타이밍을 못 잡아서 지연 재동기화 2회 추가 (이미 맞으면 no-op).
  setTimeout(_syncActive, 900);
  setTimeout(_syncActive, 2500);
})();
