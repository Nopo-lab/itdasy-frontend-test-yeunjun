/* AI 잇비 — 업로드 사진 크게 보기 */
(function () {
  'use strict';

  function _escDefault(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function _svgDefault(id, size) {
    return `<svg width="${size}" height="${size}" aria-hidden="true"><use href="#${id}"/></svg>`;
  }

  function _buttonHtml(ctx, key, label, xSide, icon) {
    const side = xSide === 'left' ? 'left:12px;' : 'right:12px;';
    const pos = key === 'close'
      ? 'top:max(12px,var(--safe-area-inset-top, env(safe-area-inset-top, 0px)));right:12px;width:40px;height:40px;'
      : `${side}top:50%;transform:translateY(-50%);width:48px;height:48px;`;
    return `<button data-lightbox-${key} aria-label="${label}" title="${label}"
      style="position:absolute;${pos}border-radius:50%;border:none;background:rgba(255,255,255,0.15);color:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;">
      ${ctx.svg(icon, key === 'close' ? 20 : 22)}
    </button>`;
  }

  function _render(ctx) {
    const s = ctx.state;
    if (!s || !ctx.overlay) return;
    const cur = s.photos[s.idx] || '';
    const hasPrev = s.idx > 0;
    const hasNext = s.idx < s.photos.length - 1;
    ctx.overlay.innerHTML = `
      ${_buttonHtml(ctx, 'close', '닫기', 'right', 'ic-x')}
      <div style="position:absolute;top:max(18px,var(--safe-area-inset-top, env(safe-area-inset-top, 0px)));left:50%;transform:translateX(-50%);color:rgba(255,255,255,0.85);font-size:13px;font-weight:700;background:rgba(0,0,0,0.4);padding:6px 12px;border-radius:14px;">${s.idx + 1} / ${s.photos.length}</div>
      <div style="flex:1;display:flex;align-items:center;justify-content:center;width:100%;max-width:100%;overflow:hidden;">
        <img src="${ctx.esc(cur)}" alt="업로드 사진 ${s.idx + 1}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:6px;" />
      </div>
      ${hasPrev ? _buttonHtml(ctx, 'prev', '이전 사진', 'left', 'ic-chevron-left') : ''}
      ${hasNext ? _buttonHtml(ctx, 'next', '다음 사진', 'right', 'ic-chevron-right') : ''}
    `;
  }

  function _move(ctx, delta) {
    if (!ctx.state) return;
    const nextIdx = Math.max(0, Math.min(ctx.state.idx + delta, ctx.state.photos.length - 1));
    if (nextIdx === ctx.state.idx) return;
    ctx.state.idx = nextIdx;
    _render(ctx);
  }

  function _close(ctx) {
    try { document.removeEventListener('keydown', ctx.onKey); } catch (_e) { void _e; }
    try { ctx.overlay.style.opacity = '0'; } catch (_e) { void _e; }
    setTimeout(() => { try { ctx.overlay.remove(); } catch (_e) { void _e; } }, 150);
    ctx.state = null;
  }

  function _bind(ctx) {
    ctx.overlay.addEventListener('click', e => {
      if (e.target.closest('[data-lightbox-close]')) { _close(ctx); return; }
      if (e.target.closest('[data-lightbox-next]')) { _move(ctx, 1); return; }
      if (e.target.closest('[data-lightbox-prev]')) { _move(ctx, -1); return; }
      if (e.target === ctx.overlay) _close(ctx);
    });
    ctx.onKey = ev => {
      if (ev.key === 'Escape') _close(ctx);
      else if (ev.key === 'ArrowRight') _move(ctx, 1);
      else if (ev.key === 'ArrowLeft') _move(ctx, -1);
    };
    document.addEventListener('keydown', ctx.onKey);
    _bindSwipe(ctx);
  }

  function _bindSwipe(ctx) {
    let touchStartX = null;
    ctx.overlay.addEventListener('touchstart', e => {
      if (e.touches && e.touches.length === 1) touchStartX = e.touches[0].clientX;
    }, { passive: true });
    ctx.overlay.addEventListener('touchend', e => {
      if (touchStartX == null) return;
      const endX = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : touchStartX;
      const dx = endX - touchStartX;
      touchStartX = null;
      if (Math.abs(dx) >= 40) _move(ctx, dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  function open(photos, startIdx, deps) {
    if (!Array.isArray(photos) || !photos.length || document.getElementById('asstLightbox')) return;
    const ctx = {
      esc: deps && typeof deps.esc === 'function' ? deps.esc : _escDefault,
      svg: deps && typeof deps.svg === 'function' ? deps.svg : _svgDefault,
      state: { photos, idx: Math.max(0, Math.min(startIdx || 0, photos.length - 1)) },
      overlay: document.createElement('div'),
      onKey: null,
    };
    ctx.overlay.id = 'asstLightbox';
    ctx.overlay.style.cssText = 'position:fixed;inset:0;z-index:10500;background:rgba(0,0,0,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) 12px var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));opacity:0;transition:opacity 0.15s ease-out;';
    ctx.overlay.setAttribute('role', 'dialog');
    ctx.overlay.setAttribute('aria-label', '업로드 사진 보기');
    _render(ctx);
    document.body.appendChild(ctx.overlay);
    requestAnimationFrame(() => { ctx.overlay.style.opacity = '1'; });
    _bind(ctx);
  }

  window.ItdasyAssistantLightbox = { open };
})();
