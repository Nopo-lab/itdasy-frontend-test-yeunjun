/* [2026-05-04] 사이드바 통합 핸들러
   - 사이드바 .ms-side__item 클릭 시 현재 열린 hub 자동 종료 → 새 hub 열기
   - 클릭한 항목에 .is-active 표시 (홈/내샵관리 패턴 동일)
   - 의도: 4개 관리화면 전환을 홈↔내샵관리 처럼 매끄럽게 */
(function () {
  'use strict';

  /* [2026-09-02 PC/모바일 전수감사] 사이드바로 화면을 바꿀 때 **직접 display 를 끄는** 풀스크린 시트 목록.
     여기에 빠지면 PC 에서만 조용히 고장난다 — 시트(z 950~951)가 사이드바(z 10000) 아래 깔리므로
     사이드바는 눌리는데 화면은 그대로다. 새 화면은 열리지만 시트 뒤에 가려 보이지 않는다.
     모바일은 시트가 탭바를 덮어 애초에 누를 수 없어 증상이 안 난다(= PC 전용 결함).

     실측(2026-09-02, 1440×900): 연결된 서비스를 연 뒤 샵 관리·이용 플랜·작업실을 눌러도
     계속 '연결된 서비스' 화면. 사이드바 활성 표시만 옮겨다녀서 더 헷갈렸다.

     sheetKey = _registerSheet 에 등록한 이름(history 스택 정리용). 없으면 null.
     ⚠️ 목록 추가/삭제 시 __tests__/side-nav-hub-close.test.js 가 style-responsive.css 의
        PC 오프셋 대상과 대조한다 — 새 시트를 만들고 여기 안 넣으면 테스트가 잡는다. */
  const SIDE_NAV_MANAGED_SHEETS = [
    { id: 'settingsHubSheet',      sheetKey: null },   // 아래 일괄 _markSheetClosed 에 이미 있음
    { id: 'planPopup',             sheetKey: null },
    { id: 'supportChatModal',      sheetKey: 'supportChat' },
    { id: 'integrationsHubSheet',  sheetKey: 'integrationsHub' },
    { id: 'dmConfirmQueueSheet',   sheetKey: 'dmConfirmQueue' },
    { id: 'dmThreadSheet',         sheetKey: 'dmThread' },
    { id: 'dmConversationsSheet',  sheetKey: 'dmList' },
    // 작업실 슬롯 편집 팝업 — z 1000 이라 역시 사이드바(10000) 아래에 깔린다.
    //   _registerSheet 등록도 없어서 안드로이드 뒤로가기도 모르는 화면이다(별건).
    { id: 'slotPopup',             sheetKey: null, removeClass: 'dt-shown' },
  ];

  function _closeAllHubs() {
    // [2026-05-04] SheetAnim.close 의 220ms setTimeout 이 재오픈 직후 display:none 으로
    // 덮어쓰는 race condition 회피 — 직접 display 조작.
    // ⚠️ 여기 있는 시트는 **절대 close() 를 부르지 마라.** 사이드바 클릭은 "닫고 곧바로 연다" 라서
    //    close() 의 220ms 예약 타이머가 새로 연 시트를 뒤늦게 display:none 으로 덮는다
    //    (2026-09-02 실측: 이 규칙을 모르고 closeIntegrationsHub() 를 부르게 했더니
    //     연결된 서비스가 열렸다가 220ms 뒤에 사라졌다).
    // [2026-09-02] integrationsHubSheet / dm* 3종 추가 — 아래 SIDE_NAV_MANAGED_SHEETS 참조.
    SIDE_NAV_MANAGED_SHEETS.forEach(({ id, sheetKey, removeClass }) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.display = 'none';
      el.style.opacity = '';
      el.style.transition = '';
      if (removeClass) el.classList.remove(removeClass);
      // SheetAnim 이 카드에 남긴 transform/opacity 도 되돌린다. 예전엔 '#shCard' 만 찾아서
      // 설정허브 말고는 다음에 열 때 카드가 20px 내려간 채로 떴다.
      el.querySelectorAll(':scope > *').forEach(card => {
        card.style.transition = '';
        card.style.transform = '';
        card.style.opacity = '';
      });
      // history 스택 정리 — 안 하면 "눌러도 아무 일 없는 뒤로가기"가 한 칸씩 쌓인다.
      if (sheetKey) { try { window._markSheetClosed?.(sheetKey); } catch (_e) { void _e; } }
    });
    // 운영 hub 들 — overlay 요소 제거 (#genericSheet 도 .hub-overlay 라 같이 제거됨)
    document.querySelectorAll('.hub-overlay, .hub-backdrop').forEach(el => el.remove());
    // [2026-09-02] 고객 추가/편집 모달 — z 10010 이라 **사이드바(10000)까지 덮는다.**
    //   위 SIDE_NAV_MANAGED_SHEETS 가 아니라 여기서 제거하는 이유: 이 모달은 열 때마다
    //   새로 만들고 닫을 때 DOM 에서 사라지는(remove) 방식이라, display:none 으로 숨기면
    //   유령 노드가 남는다. 애니메이션 타이머도 없어 remove 가 안전하다.
    document.getElementById('custEditModal')?.remove();
    try { window._markSheetClosed?.('custEdit'); } catch (_e) { void _e; }
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
    // [2026-08-16] 인스타 댓글 큐·인스타DM 설정(subscreen-overlay) — 사이드바 이동 시 잔존 방지
    try { window.closeCommentReplyQueue?.(); } catch (_e) { void _e; }
    try { window.closeDMMenuSettings?.(); } catch (_e) { void _e; }
    // [2026-09-02 PC/모바일 감사] 위 두 줄처럼 **이름을 하나씩 적는 방식이 이 버그의 원인**이다 —
    //   .subscreen-overlay 를 쓰는 하위화면은 9개인데(샵관리·네이버링크·네이버톡톡·카톡허브·백업·
    //   작업실설정·작업실성과·댓글큐·DM설정) 여기엔 2개만 적혀 있었다. 새 화면을 만들 때마다
    //   여기에 줄을 추가해야 한다는 걸 아무도 모른다.
    //   → 안드로이드 뒤로가기가 쓰는 것과 **같은 공용 계약**(.subscreen-overlay.is-open .ss-back,
    //     app-core.js:2809)으로 일괄 처리한다. 새 하위화면은 등록 없이 자동으로 닫힌다.
    try {
      document.querySelectorAll('.subscreen-overlay.is-open .ss-back').forEach((b) => b.click());
    } catch (_e) { void _e; }
    // [v215] 고객 v4 시트들도 함께 닫기 (사이드바 이동 시 잔존 방지)
    try { window.closeCustomers?.(); } catch (_e) { void _e; }
    try { window.closeCustomerDashboard?.(); } catch (_e) { void _e; }
    const cs = document.getElementById('customerSheet');
    if (cs) cs.style.display = 'none';
    const cds = document.getElementById('customerDashSheet');
    if (cds) cds.style.display = 'none';
    // popstate 관리용 sheet-closed 신호
    ['customers', 'revenue', 'booking', 'revenuehub', 'settingshub', 'nav'].forEach(k => {
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
    // [2026-08-16] 인스타DM = app-dm-menu.js 오버레이 (_registerSheet 키는 'dmMenu').
    //   [2026-09-02] DM 하위 화면(확인큐·대화목록·타임라인)도 같은 메뉴 소속 —
    //   드릴다운해도 활성 표시가 '인스타 DM' 에 남는다.
    { action: 'insta-dm',      sheets: ['dmMenuOverlay', 'dmConfirmQueueSheet', 'dmConversationsSheet', 'dmThreadSheet'] },
    { action: 'insta-comment', sheets: ['commentReplyQueueScreen'] },
    // [2026-09-02] 빠져 있어서, 연결된 서비스가 떠 있는데 활성 표시는 '홈' 으로 되돌아갔다.
    { action: 'integrations', sheets: ['integrationsHubSheet'] },
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
