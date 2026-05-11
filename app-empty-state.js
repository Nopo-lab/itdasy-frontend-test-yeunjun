/* ─────────────────────────────────────────────────────────────
   빈 상태(Empty State) 공통 컴포넌트 (Phase 6 C2 · 2026-04-21)

   사용:
     window.emptyState({
       icon: '👥',
       title: '아직 고객이 없어요',
       desc: '첫 고객을 등록하면 관리가 편해져요.',
       ctaText: '첫 고객 추가',
       onCta: () => _openAddForm()
     })
   → HTML 문자열 반환. 시트 내용에 그대로 삽입 후 [data-empty-cta] 바인딩.
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  window.emptyState = function (opts) {
    const icon = opts?.icon || '🌱';
    const title = opts?.title || '아직 기록이 없어요';
    const desc = opts?.desc || '첫 기록을 남겨 보세요.';
    const ctaText = opts?.ctaText || '지금 추가';
    const sampleHint = opts?.sampleHint || '';
    return `
      <div style="padding:36px 20px;text-align:center;">
        <div style="display:inline-flex;width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,rgba(241,128,145,0.15),rgba(241,128,145,0.05));align-items:center;justify-content:center;font-size:36px;margin-bottom:14px;">
          ${icon}
        </div>
        <div style="font-size:15px;font-weight:800;color:#222;margin-bottom:6px;">${_esc(title)}</div>
        <div style="font-size:12px;color:#888;line-height:1.6;margin-bottom:18px;">${_esc(desc)}</div>
        <button data-empty-cta style="padding:12px 22px;border:none;border-radius:12px;background:linear-gradient(135deg,var(--brand),var(--brand-strong));color:#fff;font-weight:800;cursor:pointer;font-size:13px;box-shadow:0 4px 14px rgba(241,128,145,0.35);">${_esc(ctaText)}</button>
        ${sampleHint ? `<div style="font-size:10px;color:var(--text-subtle);margin-top:14px;line-height:1.5;">${_esc(sampleHint)}</div>` : ''}
      </div>
    `;
  };

  /**
   * 이미 렌더된 empty state 안의 [data-empty-cta] 버튼에 콜백 바인딩.
   * opts.container = 시트 body DOM / opts.onCta = 실행 함수
   */
  window.bindEmptyCta = function (container, onCta) {
    if (!container || !onCta) return;
    const btn = container.querySelector('[data-empty-cta]');
    if (btn) btn.addEventListener('click', () => {
      if (window.hapticLight) window.hapticLight();
      onCta();
    });
  };
})();
