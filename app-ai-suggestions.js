/* v1.3 AI 제안 위젯 — 홈 상단 '오늘 할 일 3개'
   /assistant/suggestions 호출 → 카드 3개 렌더 → 클릭 시 해당 기능 오픈
   v1.3 (2026-05-17): iOS Safari/PWA chip 미터치 fix — render마다 listener 재등록 대신
   document-level 1회 위임. innerHTML 재렌더에도 chip이 살아 있도록. */
(function () {
  'use strict';

  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch])); }

  async function _fetch() {
    if (!window.API || !window.authHeader) return null;
    try {
      const res = await fetch(window.API + '/assistant/suggestions', { headers: window.authHeader() });
      if (!res.ok) return null;
      return await res.json();
    } catch (_e) { return null; }
  }

  function _handleAction(action) {
    if (!action) return;
    if (action === 'chat' && typeof window.openAssistant === 'function') {
      window.openAssistant();
      return;
    }
    const fn = window[action];
    if (typeof fn === 'function') {
      try { fn(); } catch (_e) { /* ignore */ }
    }
  }

  async function render(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    // 로딩 skeleton
    container.innerHTML = `
      <div style="background:linear-gradient(135deg,rgba(241,128,145,.08),rgba(241,128,145,.02));border:1px solid rgba(241,128,145,.18);border-radius:14px;padding:12px 14px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
          <span style="font-size:13px;">✨</span>
          <strong style="font-size:12px;color:var(--brand-strong);">AI 추천 · 오늘 할 일</strong>
        </div>
        <div style="font-size:11px;color:var(--text-subtle);">불러오는 중…</div>
      </div>`;

    const d = await _fetch();
    if (!d || !Array.isArray(d.items) || !d.items.length) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = `
      <div style="background:linear-gradient(135deg,rgba(241,128,145,.08),rgba(241,128,145,.02));border:1px solid rgba(241,128,145,.18);border-radius:14px;padding:12px 14px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">
          <span style="font-size:13px;">✨</span>
          <strong style="font-size:12px;color:var(--brand-strong);letter-spacing:.3px;">AI 추천 · 오늘 할 일</strong>
        </div>
        ${d.items.map((it, i) => `
          <button data-ai-sug="${_esc(it.action || 'chat')}"
                  style="display:block;width:100%;text-align:left;padding:10px 12px;background:#fff;border:1px solid rgba(241,128,145,.15);border-radius:10px;cursor:pointer;${i > 0 ? 'margin-top:6px;' : ''}">
            <div style="font-size:13px;font-weight:700;color:#333;">${_esc(it.title || '')}</div>
            ${it.reason ? `<div style="font-size:10.5px;color:#888;margin-top:3px;">${_esc(it.reason)}</div>` : ''}
          </button>
        `).join('')}
      </div>
    `;
    // listener는 모듈 init 시 한 번만 (아래 _ensureDelegation) — 여기서는 등록 안 함.
  }

  // document-level 위임 1회 등록.
  // 계기: 외부 위젯이 같은 container를 innerHTML 재렌더하면 row별 listener가 사라져
  //   특히 iOS PWA에서 chip 무반응으로 보임. 위임은 DOM 교체와 무관.
  let _delegationBound = false;
  function _ensureDelegation() {
    if (_delegationBound) return;
    _delegationBound = true;
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ai-sug]');
      if (!btn) return;
      if (window.hapticLight) window.hapticLight();
      _handleAction(btn.getAttribute('data-ai-sug'));
    });
  }
  _ensureDelegation();

  window.AISuggestions = { render };
})();
