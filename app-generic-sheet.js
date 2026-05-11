/* [2026-05-04] window.openSheet / closeSheet — generic 시트 유틸리티
   사용처: app-service-templates.js (시술메뉴), 향후 다른 가벼운 시트.
   PC: .hub-overlay 클래스로 다른 hub 들과 동일한 풀패널 (사이드바 232px 우측).
   모바일: 풀스크린.
   opts = { title, body, onClose? } */
(function () {
  'use strict';

  const OID = 'genericSheet';

  function _close() {
    const el = document.getElementById(OID);
    if (el) {
      const onClose = el._onClose;
      el.remove();
      try { onClose && onClose(); } catch (_e) { void _e; }
    }
    const bd = document.getElementById(OID + '-bd');
    if (bd) bd.remove();
    document.body.style.overflow = '';
    try { if (typeof window._markSheetClosed === 'function') window._markSheetClosed('genericsheet'); } catch (_e) { void _e; }
  }

  function _open(opts) {
    opts = opts || {};
    _close(); // 기존 시트 있으면 닫고 새로 열기

    // 백드롭 (모바일 click-outside-to-close)
    const bd = document.createElement('div');
    bd.id = OID + '-bd';
    bd.className = 'hub-backdrop';
    bd.addEventListener('click', _close);
    document.body.appendChild(bd);

    // 본 시트 — .hub-overlay 클래스 → style-responsive.css 의 PC 풀패널 룰 적용
    const overlay = document.createElement('div');
    overlay.id = OID;
    overlay.className = 'hub-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay._onClose = opts.onClose || null;

    const titleEsc = String(opts.title || '').replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
    overlay.innerHTML = `
      <div class="hub-header">
        <button class="hub-back" type="button" aria-label="닫기" data-gs-act="close">
          <i class="ph-duotone ph-caret-left" style="font-size:16px" aria-hidden="true"></i>
        </button>
        <span class="hub-title">${titleEsc}</span>
      </div>
      <div class="gs-body" style="padding:20px 24px;">${opts.body || ''}</div>
    `;

    overlay.addEventListener('click', (e) => {
      if (e.target.closest('[data-gs-act="close"]')) _close();
    });

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    try {
      if (typeof window._registerSheet === 'function') window._registerSheet('genericsheet', _close);
      if (typeof window._markSheetOpen === 'function') window._markSheetOpen('genericsheet');
    } catch (_e) { void _e; }
  }

  window.openSheet = _open;
  window.closeSheet = _close;
})();
