/* ─────────────────────────────────────────────────────────────
   파워뷰 — 조건부 포맷 (Phase 2 · 2026-05-09)

   행/셀 레벨 시각 강조:
   · 매너 점수 < 70 → 빨강 (노쇼 위험)
   · 회원권 잔액 < 30000 → 주황 (충전 권유)
   · 단일 매출 > 10만 → 초록 강조 (큰 매출)
   · 재고 부족 (수량 ≤ 임계) → 빨강
   · 평점 ≥ 9 → 초록 (프로모터), ≤ 6 → 빨강 (이탈자)

   탭별 룰을 행 클래스로 부여. 셀 단위는 inline color override (의도된 시인성).

   ── 가드레일 ──
   1. 백엔드 신규 0 — 클라 데이터에서만 판정
   2. 모듈 미로드 시 안전 skip — 행에 클래스 안 붙음
   3. 파일 ≤300줄
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window._PVFormat) return;

  const RULES = {
    customer: (r) => {
      const cls = [];
      if (r.manner_score != null && Number(r.manner_score) < 70) cls.push('pv-row-warn');
      else if (Number(r.no_show_count || 0) >= 2) cls.push('pv-row-warn');
      if (r.membership_active && Number(r.membership_balance || 0) < 30000) cls.push('pv-row-low-balance');
      return cls;
    },
    booking: (r) => {
      const cls = [];
      if (r.status === 'no_show' || r.no_show_flagged) cls.push('pv-row-danger');
      else if (r.status === 'confirmed' && _isPast(r.starts_at)) cls.push('pv-row-stale');
      return cls;
    },
    revenue: (r) => {
      const cls = [];
      if (Number(r.amount || 0) >= 100000) cls.push('pv-row-highlight');
      if (r.status === 'refunded') cls.push('pv-row-stale');
      return cls;
    },
    inventory: (r) => {
      const cls = [];
      const q = Number(r.quantity || 0);
      const t = Number(r.threshold || 0);
      if (q <= 0) cls.push('pv-row-danger');
      else if (q <= t) cls.push('pv-row-warn');
      return cls;
    },
    nps: (r) => {
      const cls = [];
      const rating = Number(r.rating || 0);
      if (rating >= 9) cls.push('pv-row-highlight');
      else if (rating <= 6 && rating > 0) cls.push('pv-row-warn');
      return cls;
    },
    service: () => [],
  };

  function _isPast(iso) {
    try { return Date.parse(iso) < Date.now() - 60 * 60 * 1000; } catch (_e) { return false; }
  }

  function rowClasses(tab, row) {
    try {
      const fn = RULES[tab];
      if (typeof fn !== 'function') return '';
      const arr = fn(row) || [];
      return arr.join(' ');
    } catch (_e) { return ''; }
  }

  window._PVFormat = { rowClasses };
})();
