/* Phase 9 P3 — quick booking/revenue and common loading helpers */
(function () {
  'use strict';

  function _toast(msg) {
    if (window.showToast) window.showToast(msg);
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  }

  function _nextSlot() {
    const hours = window.Booking?.shopHours ? window.Booking.shopHours() : { start: 10, end: 22, slotMin: 30 };
    const d = new Date();
    const min = hours.slotMin || 30;
    d.setMinutes(Math.ceil(d.getMinutes() / min) * min, 0, 0);
    if (d.getHours() < hours.start) d.setHours(hours.start, 0, 0, 0);
    if (d.getHours() >= hours.end) {
      d.setDate(d.getDate() + 1);
      d.setHours(hours.start, 0, 0, 0);
    }
    const e = new Date(d.getTime() + 60 * 60000);
    return { starts_at: d.toISOString(), ends_at: e.toISOString() };
  }

  async function openQuickBooking() {
    if (!window.openCalendarView) return _toast('예약 화면을 불러오는 중이에요');
    window._pendingBookingSlot = _nextSlot();
    await window.openCalendarView();
    setTimeout(() => {
      const btn = document.getElementById('bk-pc-add') || document.getElementById('bk-fab');
      if (btn) btn.click();
    }, 80);
  }

  function _ensureRevenueSheet() {
    let el = document.getElementById('p9QuickRevenue');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'p9QuickRevenue';
    el.className = 'p9-sheet';
    el.style.display = 'none';
    el.innerHTML = `
      <div class="p9-sheet__body" role="dialog" aria-modal="true">
        <div class="p9-sheet__head">
          <div class="p9-sheet__title">매출 빠른 입력</div>
          <button type="button" class="p9-sheet__close" data-p9-close aria-label="닫기">x</button>
        </div>
        <label class="p9-sheet__field">고객
          <div class="p9-sheet__row">
            <input id="p9RevCustomer" readonly placeholder="선택 안 함">
            <button type="button" class="p9-sheet__icon-btn" data-p9-pick>선택</button>
          </div>
        </label>
        <label class="p9-sheet__field">금액
          <input id="p9RevAmount" type="number" inputmode="numeric" placeholder="예: 55000">
        </label>
        <label class="p9-sheet__field">결제
          <select id="p9RevMethod">
            <option value="card">카드</option><option value="cash">현금</option>
            <option value="transfer">계좌</option><option value="membership">회원권</option>
          </select>
        </label>
        <button type="button" class="p9-sheet__btn" data-p9-save>기록</button>
      </div>`;
    document.body.appendChild(el);
    _bindRevenueSheet(el);
    return el;
  }

  function _bindRevenueSheet(el) {
    const ctx = { customer_id: null, customer_name: '' };
    el.addEventListener('click', async (e) => {
      if (e.target === el || e.target.closest('[data-p9-close]')) return closeQuickRevenue();
      if (e.target.closest('[data-p9-pick]')) return _pickRevenueCustomer(el, ctx);
      if (e.target.closest('[data-p9-save]')) return _saveQuickRevenue(el, ctx);
    });
  }

  async function _pickRevenueCustomer(el, ctx) {
    if (!window.Customer?.pick) return _toast('고객 목록을 불러오는 중이에요');
    const picked = await window.Customer.pick({ selectedId: ctx.customer_id });
    if (picked === null) return;
    ctx.customer_id = picked.id || null;
    ctx.customer_name = picked.name || '';
    el.querySelector('#p9RevCustomer').value = ctx.customer_name || '선택 안 함';
  }

  async function _saveQuickRevenue(el, ctx) {
    const amount = parseInt(el.querySelector('#p9RevAmount').value, 10);
    if (!amount || amount <= 0) return _toast('금액을 입력해 주세요');
    if (!window.Revenue?.create) return _toast('매출 화면을 먼저 불러오는 중이에요');
    await window.Revenue.create({
      amount,
      method: el.querySelector('#p9RevMethod').value || 'card',
      customer_id: ctx.customer_id,
      customer_name: ctx.customer_name || null,
    });
    closeQuickRevenue();
    _toast('매출 기록 완료');
  }

  function openQuickRevenue() {
    const el = _ensureRevenueSheet();
    el.style.display = 'flex';
    setTimeout(() => el.querySelector('#p9RevAmount')?.focus(), 60);
  }

  function closeQuickRevenue() {
    const el = document.getElementById('p9QuickRevenue');
    if (el) el.style.display = 'none';
  }

  function showSkeleton(el, rows) {
    if (!el) return;
    const n = rows || 3;
    el.dataset.p9Skeleton = el.innerHTML;
    el.innerHTML = Array.from({ length: n }, (_, i) =>
      `<div class="p9-skeleton-row" style="width:${90 - i * 12}%;margin:10px 0;"></div>`
    ).join('');
  }

  function hideSkeleton(el) {
    if (!el || el.dataset.p9Skeleton == null) return;
    el.innerHTML = el.dataset.p9Skeleton;
    delete el.dataset.p9Skeleton;
  }

  function standardError(err) {
    const msg = String(err?.message || err || '');
    if (msg.includes('endpoint-missing') || msg.includes('404')) return '아직 준비 중인 기능이에요';
    if (msg.includes('no-token') || msg.includes('401')) return '로그인이 필요해요';
    if (msg.includes('Abort') || msg.includes('timeout')) return '요청 시간이 너무 오래 걸렸어요';
    if (msg.includes('500')) return '서버 오류예요. 잠시 후 다시 시도해 주세요';
    return msg || '잠시 후 다시 시도해 주세요';
  }

  function _dockHTML() {
    return `
      <div class="p9-quick-dock" id="p9QuickDock">
        <button type="button" class="p9-quick-dock__btn is-primary" data-p9-act="booking">예약 추가</button>
        <button type="button" class="p9-quick-dock__btn is-primary" data-p9-act="revenue">매출 기록</button>
        <button type="button" class="p9-quick-dock__btn" data-p9-act="waitlist">대기자</button>
        <button type="button" class="p9-quick-dock__btn" data-p9-act="retention">위험 고객</button>
        <button type="button" class="p9-quick-dock__btn" data-p9-act="reminder">리마인더</button>
        <button type="button" class="p9-quick-dock__btn" data-p9-act="review">리뷰 요청</button>
        <button type="button" class="p9-quick-dock__btn" data-p9-act="membership">회원권</button>
        <button type="button" class="p9-quick-dock__btn" data-p9-act="booklink">예약 링크</button>
      </div>`;
  }

  // 2026-05-08: 사용자 요청으로 홈 상단 8개 퀵탭(p9-quick-dock) 제거.
  // 동일 기능은 햄버거 사이드바 / 탭바 / 챗봇으로 접근 가능.
  // 기존에 dock 이 이미 DOM 에 박혀있으면 정리.
  function installQuickDock() {
    const existing = document.getElementById('p9QuickDock');
    if (existing) { try { existing.remove(); } catch (_e) { void _e; } }
    return; // 더 이상 새로 만들지 않음
  }

  function _onDockClick(e) {
    const act = e.target.closest('[data-p9-act]')?.dataset.p9Act;
    if (!act) return;
    const map = {
      booking: openQuickBooking,
      revenue: openQuickRevenue,
      waitlist: window.openWaitlist,
      retention: window.openRetentionAI,
      reminder: window.openReminderSettings,
      review: window.openReviewRequests,
      membership: () => window.openMembershipExpiring ? window.openMembershipExpiring(30) : _toast('회원권 화면을 불러오는 중이에요'),
      booklink: window.openPublicBookingSettings,
    };
    const fn = map[act];
    if (typeof fn === 'function') fn();
    else _toast('화면을 불러오는 중이에요');
  }

  window.openQuickBooking = openQuickBooking;
  window.openQuickRevenue = openQuickRevenue;
  window.closeQuickRevenue = closeQuickRevenue;
  window.showSkeleton = showSkeleton;
  window.hideSkeleton = hideSkeleton;
  window.standardError = standardError;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installQuickDock);
  else installQuickDock();
  setTimeout(installQuickDock, 800);
})();
