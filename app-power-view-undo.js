/* ─────────────────────────────────────────────────────────────
   파워뷰 — Undo 스택 (Phase 1 Tier B · 2026-05-09)

   Cmd+Z 로 최근 5단계 되돌리기. 입력 input 안에서는 브라우저 기본 동작
   양보 (텍스트 undo 충돌 방지). 가능하면 window.AssistantUndo (서버 로그)
   를 우선 호출, 없으면 클라 로컬 롤백.

   ── 가드레일 ──
   1. 백엔드 신규 0
   2. input/textarea/select focus 상태에선 브라우저 undo 양보
   3. 파워뷰 overlay 안에서만 Cmd+Z 캡처
   4. 실패해도 기존 화면 안 죽게 try/catch
   5. 파일 ≤200줄

   전역:
     window._PVUndo.push({ label, undo, log_id? })
     window._PVUndo.pop()
     window._PVUndo.size
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window._PVUndo) return;

  const STACK = [];
  const MAX = 5;

  function _toast(msg) { try { if (typeof window.showToast === 'function') window.showToast(msg); } catch (_e) { /* silent */ } }
  function _haptic() { try { if (typeof window.hapticLight === 'function') window.hapticLight(); } catch (_e) { /* silent */ } }

  function push(action) {
    if (!action || (typeof action.undo !== 'function' && !action.log_id)) return;
    STACK.push({
      label: action.label || '되돌리기',
      undo: action.undo,
      log_id: action.log_id || null,
      pushed_at: Date.now(),
    });
    while (STACK.length > MAX) STACK.shift();
  }

  async function pop() {
    const action = STACK.pop();
    if (!action) {
      _toast('되돌릴 작업이 없어요');
      return false;
    }
    try {
      _haptic();
      // 서버 로그 기반 undo 우선 (AssistantUndo)
      if (action.log_id && window.AssistantUndo && typeof window.AssistantUndo.undoAction === 'function') {
        await window.AssistantUndo.undoAction(action.log_id);
      } else if (typeof action.undo === 'function') {
        await action.undo();
      }
      _toast(`${action.label} 되돌림`);
      _refreshTab();
      return true;
    } catch (e) {
      console.warn('[PVUndo] pop failed', e);
      _toast('되돌리기 실패 — 다시 시도해주세요');
      // 실패한 액션은 다시 스택에 넣지 않음 (영구 실패 가능성)
      return false;
    }
  }

  function _refreshTab() {
    try {
      const tab = window._PVState && window._PVState.currentTab;
      if (!tab) return;
      try { sessionStorage.removeItem('pv_cache::' + tab); } catch (_e) { /* silent */ }
      if (window._PVInt && typeof window._PVInt.fetchTab === 'function') {
        window._PVInt.fetchTab(tab, false).then((items) => {
          if (window._PVState && window._PVState.data) window._PVState.data[tab] = items || [];
          if (window._PVRender && typeof window._PVRender.renderTab === 'function') window._PVRender.renderTab(true);
        }).catch(() => { /* silent */ });
      }
    } catch (_e) { /* silent */ }
  }

  // ── 키보드 핸들러 ─────────────────────────────────────
  function _onKey(e) {
    try {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      // 파워뷰 overlay 가 열려있을 때만 캡처
      const overlay = document.getElementById('power-view-overlay');
      if (!overlay) return;
      // input/textarea/select focus 시 브라우저 기본 undo 양보
      const focused = document.activeElement;
      if (focused) {
        const tag = focused.tagName;
        const ce = focused.getAttribute && focused.getAttribute('contenteditable');
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ce === '' || ce === 'true') return;
      }
      e.preventDefault();
      pop();
    } catch (err) {
      console.warn('[PVUndo] _onKey', err);
    }
  }

  document.addEventListener('keydown', _onKey, true);

  window._PVUndo = {
    push, pop,
    get size() { return STACK.length; },
    clear: () => { STACK.length = 0; },
  };
})();
