/* Booking deposit overlay for revenue summaries. */
(function () {
  'use strict';

  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const EXCLUDED_STATUS = new Set(['cancelled', 'completed', 'no_show']);

  function _num(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  }

  function _currentYearMonth() {
    const kst = new Date(Date.now() + KST_OFFSET_MS);
    return { year: kst.getUTCFullYear(), month: kst.getUTCMonth() + 1 };
  }

  function _resolveYearMonth(source) {
    const cur = _currentYearMonth();
    const year = Number(source && source.year) || cur.year;
    const month = Number(source && source.month) || cur.month;
    return { year, month };
  }

  function _monthRange(year, month) {
    const mm = String(month).padStart(2, '0');
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const dd = String(last).padStart(2, '0');
    return {
      from: `${year}-${mm}-01T00:00:00+09:00`,
      to: `${year}-${mm}-${dd}T23:59:59+09:00`,
    };
  }

  function _kstParts(value) {
    const ms = new Date(value || '').getTime();
    if (!Number.isFinite(ms)) return null;
    const kst = new Date(ms + KST_OFFSET_MS);
    return { year: kst.getUTCFullYear(), month: kst.getUTCMonth() + 1 };
  }

  function _inMonth(booking, year, month) {
    const p = _kstParts(booking && booking.starts_at);
    return !!p && p.year === year && p.month === month;
  }

  function _isActive(booking) {
    if (!booking || booking.deleted_at) return false;
    const status = String(booking.status || 'confirmed').toLowerCase();
    return !EXCLUDED_STATUS.has(status);
  }

  function _isFuture(booking, nowMs) {
    const ms = new Date(booking && booking.starts_at).getTime();
    return Number.isFinite(ms) && ms > nowMs;
  }

  function summarizeBookings(bookings, opts) {
    const ym = _resolveYearMonth(opts);
    const nowMs = opts && opts.now ? new Date(opts.now).getTime() : Date.now();
    const out = _emptySummary();
    (Array.isArray(bookings) ? bookings : []).forEach((booking) => {
      _addBooking(out, booking, ym, nowMs);
    });
    return out;
  }

  function _emptySummary() {
    return {
      booking_count: 0,
      booking_deposit_count: 0,
      confirmed_deposit_total: 0,
      pending_bookings_total: 0,
      pending_booking_amount_total: 0,
      pending_booking_remaining_total: 0,
    };
  }

  function _addBooking(out, booking, ym, nowMs) {
    if (!_isActive(booking) || !_inMonth(booking, ym.year, ym.month)) return;
    const amount = _num(booking.amount);
    const deposit = _num(booking.deposit);
    out.booking_count += 1;
    out.confirmed_deposit_total += deposit;
    if (deposit > 0) out.booking_deposit_count += 1;
    if (!_isFuture(booking, nowMs)) return;
    const remaining = Math.max(amount - deposit, 0);
    out.pending_booking_amount_total += amount;
    out.pending_booking_remaining_total += remaining;
    out.pending_bookings_total += remaining;
  }

  function _depositPatch(base, agg) {
    // [A2 2026-07-27] BE /revenue/summary 의 total 은 확정 예약금(confirmed_deposit_total)을 포함하지 않는다
    //   (revenue.py: total=완료매출 RevenueRecord 합, confirmed_deposit_total 은 별개 필드). 예전엔
    //   base.confirmed_deposit_total 이 '있으면' 이미 total 에 든 걸로 보고 delta 만 더해, 히어로 총매출이
    //   예약금만큼 캘린더 합계(예약금 포함)와 상시 어긋났다. 확정 예약은 완료 전이라 RevenueRecord 가 없어
    //   전액 더해도 이중계상되지 않는다 → 확정 예약금 전액을 total 에 더한다.
    const target = Math.max(
      _num(base.confirmed_deposit_total),
      _num(base.booking_deposit_total),
      _num(agg && agg.confirmed_deposit_total)
    );
    // [매출감사 2026-08-04] **이미 이 함수를 거친 객체에 다시 걸면 예약금이 두 번 더해진다.**
    //
    //   app-revenue-month.js 가 정확히 그렇게 하고 있었다:
    //     _doFetchSummary : summary = await _withBookingOverlay(응답)   ← 보정본을
    //                       _swrWriteKey(_monthSwrKey(), summary)        ← 그대로 캐시에 쓴다
    //     캐시 히트       : return await _withBookingOverlay(cachedSummary)  ← 또 건다
    //
    //   실측(스테이징 user 5, 2026-08-04) — 매출 5만원을 UI 로 저장한 직후 화면:
    //     매출 51,000 + 예약금 50,000 = 101,000 이어야 하는데 **151,000** 이 떴다.
    //   원장님이 매출 화면을 다시 열 때마다 예약금이 계속 불어난다.
    //
    //   호출처를 하나씩 고치는 대신 **이 함수를 멱등하게** 만든다. 호출처는 3곳이고
    //   (month · home · myshop) 앞으로 늘어난다. 한 곳만 놓쳐도 같은 버그가 돌아온다.
    //   이미 얹은 금액(deposit_total)을 빼서 '차액만' 더한다 — 예약금이 그 사이 늘었으면
    //   늘어난 만큼만 반영되고, 그대로면 0 이 더해진다.
    const prev = base._booking_revenue_overlay;
    if (prev) return { target, delta: target - _num(prev.deposit_total) };
    return { target, delta: target };
  }

  function mergeSummary(summary, agg) {
    const out = Object.assign({}, summary || {});
    const patch = _depositPatch(out, agg || {});
    out.confirmed_deposit_total = patch.target;
    out.booking_deposit_total = patch.target;
    out.total = _num(out.total) + patch.delta;
    _addDepositToOptionalMoney(out, patch.delta);
    _mergePending(out, agg || {});
    _mergeProjection(out, patch.delta);
    out._booking_revenue_overlay = _overlayMeta(patch, agg);
    return out;
  }

  function _addDepositToOptionalMoney(out, delta) {
    if (!delta) return;
    ['net_total', 'net_profit'].forEach((key) => {
      if (out[key] != null) out[key] = _num(out[key]) + delta;
    });
  }

  function _mergePending(out, agg) {
    const pending = _num(agg.pending_bookings_total);
    if (agg.booking_count > 0 || pending > 0) out.pending_bookings_total = pending;
    out.pending_booking_amount_total = _num(agg.pending_booking_amount_total);
    out.pending_booking_remaining_total = _num(agg.pending_booking_remaining_total);
  }

  function _mergeProjection(out, depositDelta) {
    if (out.is_past) {
      out.projected_total = _num(out.total);
      return;
    }
    const current = _num(out.projected_total);
    const pace = current > 0 ? current + depositDelta : _num(out.total);
    const knownBookings = _num(out.total) + _num(out.pending_bookings_total);
    out.projected_total = Math.max(pace, knownBookings);
  }

  function mergeBrief(brief, agg) {
    const out = Object.assign({}, brief || {});
    const patch = _depositPatch(out, agg || {});
    out.confirmed_deposit_total = patch.target;
    out.booking_deposit_total = patch.target;
    out.this_month_total = _num(out.this_month_total) + patch.delta;
    _mergePending(out, agg || {});
    _mergeBriefProjection(out, patch.delta);
    _mergePaymentBreakdown(out, patch.delta);
    _mergeMomDelta(out, patch.delta);
    out._booking_revenue_overlay = _overlayMeta(patch, agg);
    return out;
  }

  function _mergeBriefProjection(out, depositDelta) {
    const current = _num(out.projected_total);
    const pace = current > 0 ? current + depositDelta : _num(out.this_month_total);
    const knownBookings = _num(out.this_month_total) + _num(out.pending_bookings_total);
    out.projected_total = Math.max(pace, knownBookings);
  }

  // [매출감사 2026-08-04] 예약금을 this_month_total 에 더했으면 **그 total 로 계산된 값들도**
  //   같이 고쳐야 한다. mom_delta_pct 만 빠져 있었다.
  //
  //   백엔드(assistant.py:7098)의 mom_delta_pct 는 RevenueRecord 만으로 계산한다 — 예약금이 없다.
  //   프론트는 this_month_total 에 예약금을 더한다. 그래서 홈 카드 한 줄 안에서
  //   **앞 숫자와 뒤 숫자의 기준이 달라졌다.** 실측(2026-08-04, 스테이징 user 5):
  //
  //     화면      "5만원 · 전월대비 -100%"
  //     5만원  ← 51,000 (매출 1,000 + 예약금 50,000)  ← 오버레이 적용값
  //     -100%  ← (1,000 - 500,000) / 500,000          ← 오버레이 **미적용** 서버값
  //     맞는 값 = (51,000 - 500,000) / 500,000 = -90%
  //
  //   원장님이 보면 "5만원 벌었는데 100% 줄었다"는 모순된 문장이 된다.
  //   전월(prev_month_total)에는 예약금을 더하지 않는다 — 지난달 확정 예약은 이미 완료되어
  //   RevenueRecord 로 잡혔거나 취소됐고, 어느 쪽이든 오버레이의 active 집합에 없다.
  function _mergeMomDelta(out, depositDelta) {
    if (!depositDelta) return;
    const prev = _num(out.prev_month_total);
    if (prev <= 0) return;   // 전월 0원이면 백엔드도 null 로 둔다(나눗셈 불가). 그대로 둔다.
    out.mom_delta_pct = Math.round((_num(out.this_month_total) - prev) / prev * 1000) / 10;
  }

  function _mergePaymentBreakdown(out, depositDelta) {
    if (!depositDelta) return;
    const pm = Object.assign({}, out.payment_breakdown || {});
    pm.booking_deposit = _num(pm.booking_deposit) + depositDelta;
    out.payment_breakdown = pm;
  }

  function _overlayMeta(patch, agg) {
    return {
      deposit_delta: patch.delta,
      deposit_total: patch.target,
      booking_count: _num(agg && agg.booking_count),
      pending_remaining_total: _num(agg && agg.pending_booking_remaining_total),
    };
  }

  async function _loadBookings(year, month, opts) {
    if (opts && Array.isArray(opts.bookings)) return opts.bookings;
    const range = _monthRange(year, month);
    if (window.Booking && typeof window.Booking.list === 'function') {
      return await window.Booking.list(range.from, range.to);
    }
    return await _fetchBookings(range);
  }

  async function _fetchBookings(range) {
    const headers = window.authHeader ? window.authHeader() : null;
    if (!headers || !headers.Authorization || typeof window.apiFetch !== 'function') return [];
    const qs = new URLSearchParams({ from: range.from, to: range.to });
    const res = await window.apiFetch('/bookings?' + qs.toString(), { headers });
    if (!res.ok) throw new Error('bookings HTTP ' + res.status);
    const data = await res.json();
    return Array.isArray(data && data.items) ? data.items : [];
  }

  async function enrichSummary(summary, opts) {
    const ym = _resolveYearMonth(Object.assign({}, summary || {}, opts || {}));
    try {
      const bookings = await _loadBookings(ym.year, ym.month, opts || {});
      return mergeSummary(summary, summarizeBookings(bookings, Object.assign({}, opts || {}, ym)));
    } catch (err) {
      console.warn('[booking-revenue] 매출 예약금 보강 실패:', err);
      return summary;
    }
  }

  async function enrichBrief(brief, opts) {
    const ym = _resolveYearMonth(opts || {});
    try {
      const bookings = await _loadBookings(ym.year, ym.month, opts || {});
      return mergeBrief(brief, summarizeBookings(bookings, Object.assign({}, opts || {}, ym)));
    } catch (err) {
      console.warn('[booking-revenue] 내샵 예약금 보강 실패:', err);
      return brief;
    }
  }

  // [핫픽스E #2] 예약금을 매출 캘린더/리스트에 "예약일 기준" 의사 매출항목으로 변환.
  //   총매출 카드는 이미 mergeSummary 로 예약금 delta 를 더하므로, 캘린더 합계도 일치시키려 같은 active 예약 집합에서 생성.
  //   active(취소/완료/노쇼 제외) + 해당월 + deposit>0 만. method='booking_deposit'.
  function depositEntries(bookings, opts) {
    const ym = _resolveYearMonth(opts);
    const out = [];
    (Array.isArray(bookings) ? bookings : []).forEach((b) => {
      if (!_isActive(b) || !_inMonth(b, ym.year, ym.month)) return;
      const deposit = _num(b && b.deposit);
      if (deposit <= 0) return;
      out.push({
        id: 'bkdep_' + (b.id != null ? b.id : Math.random().toString(36).slice(2)),
        amount: deposit,
        method: 'booking_deposit',
        recorded_at: b.starts_at,
        created_at: b.starts_at,
        customer_name: b.customer_name || b.name || '',
        service_name: b.service_name || '',
        _booking_deposit: true,
        _booking_id: b.id != null ? b.id : null,
      });
    });
    return out;
  }

  window.BookingRevenueOverlay = {
    summarizeBookings,
    mergeSummary,
    mergeBrief,
    enrichSummary,
    enrichBrief,
    depositEntries,
    _monthRange,
  };
})();
