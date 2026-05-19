/* 사진 편집기 — 'pro' 탭 sub-tab 래퍼 (Sprint 4 v228 2026-05-19)
   plan v3 — 메인 파일 sub-tab HTML 박지 않고 신규 파일 외부 주입 패턴.

   sub-tab 두 개:
     - curve: app-photo-editor-curve.js
     - hsl:   app-photo-editor-hsl.js

   registerTabPanel('pro', { html, bind }) 으로 PhotoEditor 에 등록.
*/
(function () {
  'use strict';
  if (window.PhotoEditorProTab) return;

  let _subTab = 'curve';  // 'curve' | 'hsl'

  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

  function _html(state) {
    const Curve = window.PhotoEditorCurve;
    const HSL   = window.PhotoEditorHSL;
    const tabBtn = (id, label) => `<button type="button" class="pe-chip-btn ${_subTab === id ? 'on' : ''}" data-pro-sub="${id}" style="${_subTab === id ? 'background:#F18091;color:#fff;' : ''}">${_esc(label)}</button>`;
    let body = '';
    if (_subTab === 'curve' && Curve) body = Curve.subPanelHTML(state);
    else if (_subTab === 'hsl' && HSL) body = HSL.subPanelHTML(state);
    else body = '<div class="pe-hint">모듈 로딩 중…</div>';
    return `<div class="pe-panel-row" style="display:flex;gap:6px;margin-bottom:8px;">
        ${tabBtn('curve', '톤 곡선')}
        ${tabBtn('hsl', 'HSL 분리')}
      </div>
      <div id="peProSubPanel">${body}</div>`;
  }

  function _bind(panel, state, helpers) {
    panel.querySelectorAll('[data-pro-sub]').forEach(btn => {
      btn.addEventListener('click', () => {
        _subTab = btn.dataset.proSub;
        helpers.renderPanel();
      });
    });
    const sub = panel.querySelector('#peProSubPanel');
    if (!sub) return;
    if (_subTab === 'curve' && window.PhotoEditorCurve) {
      window.PhotoEditorCurve.bindSubPanel(sub, state, helpers);
    } else if (_subTab === 'hsl' && window.PhotoEditorHSL) {
      window.PhotoEditorHSL.bindSubPanel(sub, state, helpers);
    }
  }

  function _register() {
    const PE = window.PhotoEditor;
    if (!PE || !PE._internal || !PE._internal.registerTabPanel) return false;
    PE._internal.registerTabPanel('pro', { html: _html, bind: _bind });
    return true;
  }

  if (!_register()) {
    let tries = 0;
    const iv = setInterval(() => { if (_register() || ++tries > 60) clearInterval(iv); }, 100);
  }

  window.PhotoEditorProTab = { _subTab: () => _subTab };
})();
