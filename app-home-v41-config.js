/* ─────────────────────────────────────────────────────────────
   Home v4.1 환경 변수 (2026-04-30)
   - HomeV41 모듈에서 참조하는 작은 config
   - localStorage 로 런타임 오버라이드 가능
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function _readInt(key, fallback) {
    try {
      const v = parseInt(localStorage.getItem(key) || '', 10);
      return Number.isFinite(v) && v > 0 ? v : fallback;
    } catch (_e) { return fallback; }
  }
  function _readStr(key, fallback) {
    try {
      return localStorage.getItem(key) || fallback;
    } catch (_e) { return fallback; }
  }

  window.HomeV41Config = {
    // 오늘의 예약 슬롯 최대 노출 개수
    BOOKING_SLOTS_MAX: _readInt('hv41_slots_max', 4),
    // 0건일 때 카드 처리 ('hide' = 카드 숨김 / 'placeholder' = 빈 상태 표시)
    BOOKING_EMPTY_DISPLAY: _readStr('hv41_empty', 'placeholder'),
    // 캐러셀에 노출할 카드 최대 개수
    CAROUSEL_MAX_CARDS: 6,
  };
})();
