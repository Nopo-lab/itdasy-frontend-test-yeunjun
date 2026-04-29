/* 시트 진입/종료 애니메이션 헬퍼 (2026-04-30)
   사용:
     window.SheetAnim.open(sheetEl, cardEl)
     window.SheetAnim.close(sheetEl, cardEl, onDone)

   효과:
   - sheet: opacity 0 → 1 (220ms ease-out)
   - card: translateY(24px) → 0 (280ms cubic-bezier — overshoot 약간)
   - 종료: 역순 + display:none

   spec: cubic-bezier(0.34, 1.56, 0.64, 1) — 살짝 튀어오르는 진입감
*/
(function () {
  'use strict';

  const SHEET_TR = 'opacity 220ms ease-out';
  const CARD_TR = 'transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1)';

  function open(sheet, card) {
    if (!sheet) return;
    sheet.style.transition = '';
    sheet.style.opacity = '0';
    if (card) {
      card.style.transition = '';
      card.style.transform = 'translateY(24px)';
    }
    sheet.style.display = sheet.style.display === 'none' || !sheet.style.display ? 'flex' : sheet.style.display;
    if (sheet.style.display !== 'flex' && sheet.style.display !== 'block') sheet.style.display = 'flex';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      sheet.style.transition = SHEET_TR;
      sheet.style.opacity = '1';
      if (card) {
        card.style.transition = CARD_TR;
        card.style.transform = 'translateY(0)';
      }
    }));
  }

  function close(sheet, card, onDone) {
    if (!sheet) { if (onDone) onDone(); return; }
    sheet.style.transition = SHEET_TR;
    sheet.style.opacity = '0';
    if (card) {
      card.style.transition = 'transform 200ms ease-in';
      card.style.transform = 'translateY(20px)';
    }
    setTimeout(() => {
      sheet.style.display = 'none';
      if (onDone) onDone();
    }, 220);
  }

  window.SheetAnim = { open, close };
})();
