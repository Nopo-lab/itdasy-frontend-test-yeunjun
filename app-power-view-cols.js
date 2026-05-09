/* ─────────────────────────────────────────────────────────────
   파워뷰 — 컬럼 숨김/고정 (Phase 2 · 2026-05-09)

   사용자가 보고 싶은 컬럼만 골라보기. localStorage `pv:cols:${tab}` 에
   숨김 인덱스 set 으로 저장. 헤더 우측 ⋯ 토글로 메뉴.

   ── 가드레일 ──
   1. 백엔드 신규 0
   2. 모바일에서 자동 숨김 후보 (사용자 선택 우선)
   3. 모듈 미로드 시 모든 컬럼 표시
   4. 파일 ≤200줄

   사용:
     window._PVCols.applyToHeaders(tab, headersHtml) — 미사용 (단순 hidden 클래스)
     window._PVCols.isHidden(tab, idx)
     window._PVCols.toggle(tab, idx)
     window._PVCols.renderToggle(tab, headerLabels)  → 메뉴 UI
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window._PVCols) return;

  const LS = 'pv:cols:';

  function _read(tab) {
    try {
      const raw = localStorage.getItem(LS + tab);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr.map((n) => Number(n)) : []);
    } catch (_e) { return new Set(); }
  }
  function _write(tab, set) {
    try {
      if (set && set.size > 0) localStorage.setItem(LS + tab, JSON.stringify(Array.from(set)));
      else localStorage.removeItem(LS + tab);
    } catch (_e) { /* silent */ }
  }

  function isHidden(tab, idx) {
    try { return _read(tab).has(Number(idx)); }
    catch (_e) { return false; }
  }

  function toggle(tab, idx) {
    try {
      const s = _read(tab);
      const i = Number(idx);
      if (s.has(i)) s.delete(i); else s.add(i);
      _write(tab, s);
      if (window._PVRender && typeof window._PVRender.renderTab === 'function') {
        window._PVRender.renderTab(true);
      }
    } catch (e) {
      console.warn('[PVCols] toggle', e);
    }
  }

  function reset(tab) {
    try {
      _write(tab, new Set());
      if (window._PVRender && typeof window._PVRender.renderTab === 'function') {
        window._PVRender.renderTab(true);
      }
    } catch (_e) { /* silent */ }
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function renderMenu(tab, headerLabels) {
    try {
      const s = _read(tab);
      const items = (headerLabels || []).map((label, idx) => {
        const hidden = s.has(idx);
        return `
          <label class="pv-cols-item">
            <input type="checkbox" data-pv-col-toggle="${idx}" ${hidden ? '' : 'checked'} />
            <span>${_esc(label)}</span>
          </label>
        `;
      }).join('');
      const reset = `<button type="button" class="pv-cols-reset" data-pv-col-reset>모두 표시</button>`;
      return `<div class="pv-cols-menu" data-pv-cols-menu>${items}${reset}</div>`;
    } catch (_e) { return ''; }
  }

  // 헤더 영역에 매다는 토글 버튼 + 메뉴 바인딩
  function bindMenu(tab, root) {
    if (!root) return;
    try {
      root.querySelectorAll('[data-pv-col-toggle]').forEach((el) => {
        el.addEventListener('change', () => {
          const idx = Number(el.getAttribute('data-pv-col-toggle'));
          toggle(tab, idx);
        });
      });
      const r = root.querySelector('[data-pv-col-reset]');
      if (r) r.addEventListener('click', () => reset(tab));
    } catch (e) {
      console.warn('[PVCols] bindMenu', e);
    }
  }

  window._PVCols = { isHidden, toggle, reset, renderMenu, bindMenu };
})();
