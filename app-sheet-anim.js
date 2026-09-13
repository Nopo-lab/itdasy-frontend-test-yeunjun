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
    // [전기종 파괴검증 2026-09-12] 닫힘 타이머를 반드시 취소한다.
    //   실측 재현: 샵 관리를 열고 0.2초 안에 뒤로 → 0.15초 안에 다시 열면 **안 열린다**.
    //   close() 가 예약한 220ms `display:none` 타이머가 살아 있다가, 막 다시 연 시트를
    //   덮어버리기 때문. 화면엔 아무것도 없는데 hash 는 #settingsHub 이고
    //   _markSheetOpen 도 찍혀 있어서 **다음 뒤로가기 한 번이 통째로 먹힌다.**
    //   같은 증상 확인: settingsHub / integrationsHub (둘 다 SheetAnim 사용).
    if (sheet.__saCloseTimer) { clearTimeout(sheet.__saCloseTimer); sheet.__saCloseTimer = null; }
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
    if (sheet.__saCloseTimer) clearTimeout(sheet.__saCloseTimer);
    sheet.__saCloseTimer = setTimeout(() => {
      sheet.__saCloseTimer = null;
      sheet.style.display = 'none';
      if (onDone) onDone();
    }, 220);
  }

  window.SheetAnim = { open, close };
})();
