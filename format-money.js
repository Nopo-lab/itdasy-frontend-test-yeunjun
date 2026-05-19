/**
 * 잇데이 금액 포맷 공통 유틸
 * 규칙 (원영 확정 2026-05-19):
 *   - ₩ 접두어 금지. 전부 "원" 접미어
 *   - 실제 매출 = 원 단위 정확 (반올림 없음)
 *   - 예상매출만 1,000원 단위 반올림 허용
 *   - 만원 단위 표기: "419.5만원" 형태
 */
(function () {
  'use strict';

  function _comma(n) {
    return Math.floor(n).toLocaleString('ko-KR');
  }

  function formatMoney(v) {
    const n = Number(v) || 0;
    return _comma(n) + '원';
  }

  function formatEstimate(v) {
    const n = Math.round((Number(v) || 0) / 1000) * 1000;
    return _comma(n) + '원';
  }

  function formatMan(v) {
    const n = Number(v) || 0;
    if (n === 0) return '0원';
    const man = Math.round(n / 1000) / 10;
    return man + '만원';
  }

  window.formatMoney = formatMoney;
  window.formatEstimate = formatEstimate;
  window.formatMan = formatMan;
})();
