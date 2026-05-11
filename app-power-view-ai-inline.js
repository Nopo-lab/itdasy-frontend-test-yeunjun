/* ─────────────────────────────────────────────────────────────
   파워뷰 — 셀 옆 AI 비서 (Phase 3 · 2026-05-09)

   행 옆 ⚡ 메뉴에 "AI 비서에게 묻기" 추가. 행 컨텍스트(고객명·시술·금액)
   를 prompt 에 주입해서 openAssistant 호출. 별도 모듈 — actions.js 와
   분리해서 액션 정의만 추가.

   ── 가드레일 ──
   1. 백엔드 신규 0 — openAssistant + /assistant/ask 재사용
   2. AI 비서 모듈 미로드 시 안내 토스트만
   3. 파일 ≤200줄

   사용:
     _PVActions 가 자동으로 ACTIONS_AI 룰을 머지 (window 후크 아닌 직접 추가)
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window._PVAIInline) return;

  function _toast(msg) { try { if (typeof window.showToast === 'function') window.showToast(msg); } catch (_e) { /* silent */ } }

  function _summarizeRow(tab, row) {
    try {
      switch (tab) {
        case 'customer':
          return `${row.name || '손님'} (전화 ${row.phone || '-'}, 방문 ${row.visit_count || 0}회, 회원권 잔액 ${row.membership_balance || 0}원, 메모: ${(row.memo || '').slice(0, 60)})`;
        case 'booking':
          return `예약 — ${row.customer_name || ''} ${(row.starts_at || '').replace('T', ' ').slice(0, 16)} ${row.service_name || ''} 상태 ${row.status || ''}`;
        case 'revenue':
          return `매출 — ${row.customer_name || ''} ${row.service_name || ''} ${row.amount || 0}원 ${row.method || ''}`;
        case 'inventory':
          return `재고 — ${row.name} 수량 ${row.quantity || 0}${row.unit || '개'} 임계 ${row.threshold || 0}`;
        case 'nps':
          return `후기 — ★${row.rating || 0} ${(row.comment || '').slice(0, 60)}`;
        case 'service':
          return `시술 — ${row.name} ${row.default_price || 0}원 ${row.default_duration_min || 0}분`;
        default:
          return JSON.stringify(row).slice(0, 100);
      }
    } catch (_e) { return ''; }
  }

  function _suggestionsFor(tab, row) {
    if (tab === 'customer') {
      return [
        `${row.name || '이 손님'} 마지막 방문 언제였어?`,
        `${row.name || '이 손님'} 좋아하는 시술 추천 메시지 만들어줘`,
        `${row.name || '이 손님'} 노쇼 이력 알려줘`,
      ];
    }
    if (tab === 'revenue') {
      return [
        `${row.customer_name || '이 손님'} 이번 달 누적 매출 얼마야?`,
        `이 시술(${row.service_name || ''}) 평균 단가 알려줘`,
      ];
    }
    if (tab === 'booking') {
      return [
        `${row.customer_name || '이 손님'} 노쇼 가능성 어때?`,
        '이 시간대 다른 예약 있어?',
      ];
    }
    if (tab === 'inventory') {
      return [
        `${row.name} 평균 사용량 알려줘 (월 단위)`,
        `${row.name} 발주 추천 수량 알려줘`,
      ];
    }
    return [];
  }

  function ask(tab, row) {
    try {
      if (typeof window.openAssistant !== 'function') {
        _toast('AI 비서를 불러오지 못했어요');
        return;
      }
      const ctx = _summarizeRow(tab, row);
      const sugg = _suggestionsFor(tab, row);
      const prompt = sugg[0] || `${ctx} 에 대해 알려줘`;
      // openAssistant 가 prefill option 을 받으면 활용, 아니면 그냥 열기
      try {
        if (window.Assistant && typeof window.Assistant.ask === 'function') {
          window.Assistant.ask(prompt);
        } else {
          window.openAssistant();
          // prefill 시도 (DOM 기반)
          setTimeout(() => {
            const input = document.querySelector('[data-assistant-input]') || document.getElementById('assistantInput');
            if (input && 'value' in input) {
              input.value = prompt;
              input.focus();
            }
          }, 200);
        }
      } catch (_e) {
        window.openAssistant();
      }
    } catch (e) {
      console.warn('[PVAIInline] ask', e);
      _toast('AI 호출 실패');
    }
  }

  // _PVActions 와 통합 — AI 액션 항목 추가
  function aiAction(tab, row) {
    return {
      icon: 'ic-bot',
      label: 'AI 비서에게 묻기',
      run: async () => ask(tab, row),
    };
  }

  window._PVAIInline = { ask, aiAction, summarizeRow: _summarizeRow };
})();
