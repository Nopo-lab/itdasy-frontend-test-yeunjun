/* ─────────────────────────────────────────────────────────────
   파워뷰 — 페이지네이션 (Phase 2 · 2026-05-09)

   리스트가 800행 초과 시 처음 200행만 렌더 + "더 보기" 칩 → +200행씩.
   IntersectionObserver 로 마지막 행 근접 시 자동 추가 로드 옵션.

   ── 가드레일 ──
   1. 백엔드 신규 0
   2. 모듈 미로드 시 모든 행 그대로 노출 (안전 fallback)
   3. 파일 ≤200줄

   사용:
     window._PVPagination.slice(list, tab) → list 절단
     window._PVPagination.renderMore(list, tab) → "+200행 더 보기" 칩 HTML
     window._PVPagination.bind(rootEl)
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window._PVPagination) return;

  const THRESHOLD = 800;
  const PAGE = 200;

  // tab → 현재 노출 행 수
  const _shown = {};

  function _curShown(tab) {
    if (!_shown[tab]) _shown[tab] = PAGE;
    return _shown[tab];
  }

  function shouldPaginate(list) {
    return Array.isArray(list) && list.length > THRESHOLD;
  }

  function slice(list, tab) {
    try {
      if (!Array.isArray(list)) return list;
      if (!shouldPaginate(list)) return list;
      return list.slice(0, _curShown(tab));
    } catch (_e) { return list; }
  }

  function renderMore(list, tab) {
    try {
      if (!shouldPaginate(list)) return '';
      const cur = _curShown(tab);
      if (cur >= list.length) return '';
      const remaining = list.length - cur;
      const next = Math.min(PAGE, remaining);
      return `
        <div class="pv-paginate-row" data-pv-paginate>
          <span class="pv-paginate-label">${cur} / 총 ${list.length}건 표시 중</span>
          <button type="button" class="pv-paginate-more" data-pv-paginate-more>
            +${next}행 더 보기
          </button>
        </div>
      `;
    } catch (_e) { return ''; }
  }

  function more(tab) {
    try {
      _shown[tab] = (_shown[tab] || PAGE) + PAGE;
      if (window._PVRender && typeof window._PVRender.renderTab === 'function') {
        window._PVRender.renderTab(true);
      }
    } catch (e) {
      console.warn('[PVPagination] more', e);
    }
  }

  function reset(tab) {
    if (tab) delete _shown[tab];
    else Object.keys(_shown).forEach((k) => delete _shown[k]);
  }

  function bind(root) {
    if (!root) return;
    try {
      const btn = root.querySelector('[data-pv-paginate-more]');
      if (!btn) return;
      btn.addEventListener('click', () => {
        const tab = window._PVState && window._PVState.currentTab;
        if (tab) more(tab);
      });
    } catch (e) {
      console.warn('[PVPagination] bind', e);
    }
  }

  // 탭 전환 시 페이지 리셋
  window.addEventListener('itdasy:data-changed', (e) => {
    try {
      const k = (e && e.detail && e.detail.kind) || '';
      // 탭 전환 신호는 따로 없으므로 force_sync 시 모든 탭 리셋
      if (/force_sync|focus_sync/.test(k)) reset();
    } catch (_e) { /* silent */ }
  });

  window._PVPagination = { slice, renderMore, bind, reset, shouldPaginate };
})();
