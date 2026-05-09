/* ─────────────────────────────────────────────────────────────
   파워뷰 — 자동 시각화 칼럼 (Phase 2 plan 의 마무리 · 2026-05-10)

   schema.row 결과를 후처리:
   · 고객 이름 옆: 매너 점수 0~100 막대 (< 70 빨강, < 85 주황, 그 외 초록)
   · 고객 잔액 셀 아래: 회원권 잔액 게이지 (20만 기준 비율)
   · 매출 금액 셀 안: 결제수단 색 칩 (이미 row 안에 있는데 시각 강화)

   ── 가드레일 ──
   1. 백엔드 신규 0
   2. _PVInt.SCHEMAS 가 mutable 한 점 활용 (monkey-patch)
   3. 모듈 미로드 시 기존 행 그대로
   4. 파일 ≤200줄
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window._PVViz) return;

  function _wrapCustomer() {
    try {
      if (!window._PVInt || !window._PVInt.SCHEMAS || !window._PVInt.SCHEMAS.customer) return false;
      const sch = window._PVInt.SCHEMAS.customer;
      if (sch.__vizWrapped) return true;
      const origRow = sch.row;
      sch.row = function (r) {
        try {
          const cells = origRow(r) || [];
          // 1) 매너 점수 막대 — 이름 셀에 inline 추가
          if (r.manner_score != null) {
            const score = Math.max(0, Math.min(100, Number(r.manner_score)));
            const color = score < 70 ? '#DC3545' : score < 85 ? '#E68A00' : '#2E8C7E';
            cells[0] = (cells[0] || '') + `<span class="pv-manner-bar" title="매너 ${score}점${r.no_show_count ? ' (노쇼 ' + r.no_show_count + '회)' : ''}" aria-label="매너 ${score}점">
              <span class="pv-manner-bar__fill" style="width:${score}%;background:${color};"></span>
            </span>`;
          }
          // 2) 회원권 잔액 게이지 — 잔액 셀(idx 5)
          if (r.membership_active && cells[5]) {
            const balance = Number(r.membership_balance || 0);
            const max = 200000; // 일반적 충전 단위 기준
            const ratio = Math.min(100, Math.max(0, (balance / max) * 100));
            const color = balance < 30000 ? '#E68A00' : '#A78BFA';
            cells[5] = cells[5] + `<span class="pv-balance-gauge" aria-hidden="true">
              <span class="pv-balance-gauge__fill" style="width:${ratio}%;background:${color};"></span>
            </span>`;
          }
          return cells;
        } catch (_e) {
          return origRow(r);
        }
      };
      sch.__vizWrapped = true;
      return true;
    } catch (e) {
      console.warn('[PVViz] wrap customer', e);
      return false;
    }
  }

  function _wrapBooking() {
    try {
      if (!window._PVInt || !window._PVInt.SCHEMAS || !window._PVInt.SCHEMAS.booking) return false;
      const sch = window._PVInt.SCHEMAS.booking;
      if (sch.__vizWrapped) return true;
      const origRow = sch.row;
      sch.row = function (r) {
        try {
          const cells = origRow(r) || [];
          // 시간 셀(idx 2) 옆에 D-day 또는 "방금 끝남" 표시
          const t = Date.parse(r.starts_at || '');
          if (Number.isFinite(t)) {
            const diffMin = Math.round((t - Date.now()) / 60000);
            let badge = '';
            if (diffMin > 60 * 24) {
              const days = Math.round(diffMin / (60 * 24));
              badge = `<span class="pv-time-badge">D-${days}</span>`;
            } else if (diffMin > 0) {
              badge = `<span class="pv-time-badge pv-time-badge--soon">${Math.round(diffMin / 60) || ''}${diffMin < 60 ? diffMin + '분 후' : '시간 후'}</span>`;
            } else if (diffMin > -120) {
              badge = `<span class="pv-time-badge pv-time-badge--past">방금</span>`;
            }
            if (badge && cells[2]) cells[2] = cells[2] + ' ' + badge;
          }
          return cells;
        } catch (_e) {
          return origRow(r);
        }
      };
      sch.__vizWrapped = true;
      return true;
    } catch (e) {
      console.warn('[PVViz] wrap booking', e);
      return false;
    }
  }

  function _wrapInventory() {
    try {
      if (!window._PVInt || !window._PVInt.SCHEMAS || !window._PVInt.SCHEMAS.inventory) return false;
      const sch = window._PVInt.SCHEMAS.inventory;
      if (sch.__vizWrapped) return true;
      const origRow = sch.row;
      sch.row = function (r) {
        try {
          const cells = origRow(r) || [];
          // 수량(idx 1) 셀에 임계 대비 막대 추가
          const qty = Number(r.quantity || 0);
          const threshold = Number(r.threshold || 1);
          const ratio = threshold > 0 ? Math.min(100, (qty / (threshold * 3)) * 100) : 100;
          const color = qty <= 0 ? '#DC3545' : qty <= threshold ? '#E68A00' : '#2E8C7E';
          if (cells[1]) {
            cells[1] = cells[1] + `<span class="pv-stock-bar" aria-hidden="true">
              <span class="pv-stock-bar__fill" style="width:${ratio}%;background:${color};"></span>
            </span>`;
          }
          return cells;
        } catch (_e) {
          return origRow(r);
        }
      };
      sch.__vizWrapped = true;
      return true;
    } catch (e) {
      console.warn('[PVViz] wrap inventory', e);
      return false;
    }
  }

  function _tryWrapAll() {
    let n = 0;
    if (_wrapCustomer()) n++;
    if (_wrapBooking()) n++;
    if (_wrapInventory()) n++;
    return n;
  }

  // _PVInt 가 정의되는 시점은 power-view.js 마지막 — defer 순서 보장되어 있지만
  // 여러 번 시도하여 안전 보장
  function _init() {
    if (_tryWrapAll() === 3) return;
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      if (_tryWrapAll() === 3 || tries > 20) clearInterval(t);
    }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init, { once: true });
  } else {
    _init();
  }

  window._PVViz = { _init };
})();
