/* Home v4.1 button actions */
(function () {
  'use strict';

  function _tap() {
    if (!window.hapticLight) return;
    try { window.hapticLight(); } catch (_e) { /* ignore */ }
  }

  function _openCalendar() {
    if (typeof window.openCalendarView === 'function') return window.openCalendarView();
    if (typeof window.showTab !== 'function') return undefined;
    const btn = document.querySelector('.tab-bar__btn[data-tab="calendar"]');
    try { window.showTab('calendar', btn); } catch (_e) { /* ignore */ }
    return undefined;
  }

  function _openCaption() {
    if (typeof window.openCaptionScenarioPopup === 'function') return window.openCaptionScenarioPopup();
    if (typeof window.openNavSheet === 'function') return window.openNavSheet();
    return undefined;
  }

  function _openCustomers() {
    if (typeof window.openCustomerHub === 'function') return window.openCustomerHub();
    if (typeof window.openCustomers === 'function') return window.openCustomers();
    return undefined;
  }

  function _openRevenue() {
    if (typeof window.openRevenue === 'function') { window.openRevenue(); return; }
    if (typeof window.openRevenueHub === 'function') window.openRevenueHub();
  }

  async function _loadPendingBooking(id) {
    let booking = window._homePendingTopBooking || { id };
    try {
      if (!window.authHeader) return booking;
      const headers = window.authHeader();
      if (!headers || !headers.Authorization) return booking;
      const res = await apiFetch('/bookings/' + id, { headers });
      if (res.ok) booking = await res.json();
    } catch (_e) { /* booking fallback */ }
    return booking;
  }

  async function _completePending() {
    const id = window._homePendingTopId;
    if (!id) {
      if (window.showToast) window.showToast('완료할 예약 없음');
      return;
    }
    const flow = window.CompleteFlow;
    if (!flow || typeof flow.startFromBooking !== 'function') {
      if (window.showToast) window.showToast('완료 처리 모듈 준비 중');
      return;
    }
    const booking = await _loadPendingBooking(id);
    try { flow.startFromBooking(booking); } catch (_e) {
      if (window.showToast) window.showToast('완료 처리 시트 열기 실패');
    }
  }

  const ACTIONS = {
    openCalendar: _openCalendar,
    openGallery: () => {
      if (typeof window.openFinishTab === 'function') return window.openFinishTab();
      return undefined;
    },
    openCaption: _openCaption,
    bell: () => {
      if (typeof window.openNotifications === 'function') window.openNotifications();
    },
    openDMConfirmQueue: () => {
      if (typeof window.openDMConfirmQueue === 'function') return window.openDMConfirmQueue();
      if (typeof window.openDMQueue === 'function') return window.openDMQueue();
      return undefined;
    },
    openInsights: () => {
      if (typeof window.openInsights === 'function') return window.openInsights();
      if (typeof window.openCustomerInsights === 'function') return window.openCustomerInsights();
      return undefined;
    },
    openCustomers: _openCustomers,
    openRevenue: _openRevenue,
    // [2026-06-15] 회원권 카드 → 만료 임박 리스트(실존 핸들러) → 폴백 고객 허브.
    //   window.openMembership 은 현재 없음 → openMembershipExpiring/MembershipUI 로 라우팅.
    openMembership: () => {
      if (typeof window.openMembership === 'function') return window.openMembership();
      if (typeof window.openMembershipExpiring === 'function') return window.openMembershipExpiring(30);
      if (window.MembershipUI && typeof window.MembershipUI.openExpiringList === 'function') return window.MembershipUI.openExpiringList();
      if (typeof window.openCustomerHub === 'function') return window.openCustomerHub();
      return undefined;
    },
    completePending: _completePending,
    // [2026-07-20 v785] 홈 "답 안 한 댓글 문의" 줄 → 댓글 응대 큐 (extras lazy — 로드 보장 후 진입)
    openCommentQueue: () => {
      const _open = () => { if (typeof window.openCommentReplyQueue === 'function') window.openCommentReplyQueue(); };
      if (typeof window.openCommentReplyQueue === 'function') return _open();
      if (window.AppLoader && window.AppLoader.ensure) Promise.resolve(window.AppLoader.ensure('extras')).then(_open).catch(_open);
      else _open();
      return undefined;
    },
    // [2026-07-08] 분석 불러오기 실패 카드 → 홈 새로 그리기 (brief 재요청)
    retryBrief: () => {
      if (window.HomeV41 && typeof window.HomeV41.refresh === 'function') window.HomeV41.refresh();
    },
    // [2026-08-16] 홈 잇비 카드 '전체 보기' → 분석 카드 인라인 펼침 토글 (화면 이동 X — 원영 지시.
    //   브리핑 채팅으로 열던 openBriefing 은 이 동작으로 대체·삭제)
    itbiToggleDetail: () => {
      const card = document.querySelector('.hv5-itbi-card');
      if (!card) return;
      const open = card.classList.toggle('is-detail');
      const btn = card.querySelector('.hv5-itbi-all');
      if (btn) btn.textContent = open ? '접기 ‹' : '전체 보기 ›';
    },
    // [2026-07-05] 홈 저녁 칩 → 잇비 시트 열고 "마감 리포트" 바로 전송(룰 기반, LLM 0).
    itbiClosingReport: () => {
      const open = (window.AssistantSheet && window.AssistantSheet.open) || window.openAssistant;
      if (typeof open === 'function') open({ sendImmediate: '마감 리포트' });
    },
  };

  function run(act) {
    _tap();
    if (!act) return;
    if (ACTIONS[act]) { ACTIONS[act](); return; }
    if (typeof window[act] === 'function') {
      try { window[act](); } catch (_e) { /* ignore */ }
    }
  }

  window.HomeV41Actions = { run };
})();
