/* app-ba-auto-trigger.js — B&A 자동 트리거 chip (§13.3)
 * 의존: window.AutoBA (app-auto-ba.js), window.openVideo (있으면), window.showToast
 *
 * 동작:
 *   `itdasy:data-changed` 이벤트의 detail.kind 가 'mark_booking_completed' 이거나
 *   detail.mutation_kind === 'mark_booking_completed' 일 때 →
 *   잠시 후 (DB 반영 시간 1.5s) AutoBA.scanAndSuggest 호출.
 *   고객 photos 2장+ pair 가 감지되면 "전·후 카드 만들까요?" chip 노출.
 *
 *   chip 위치: 화면 하단 중앙 (토스트와 충돌 안 나도록 bottom).
 *   chip 액션:
 *     - "만들기" → window.openVideo() (있으면) 또는 AutoBA 의 _openVideoWithPair 폴백
 *     - "X"     → 닫기 (해당 고객 1시간 동안 dismiss — 세션 메모리)
 *
 *   동일 booking 으로 인한 중복 트리거 방지: 30초 디바운스.
 */
(function () {
  'use strict';

  const CHIP_ID = 'baAutoTriggerChip';
  const TRIGGER_KINDS = new Set(['mark_booking_completed']);
  const DEBOUNCE_MS = 30 * 1000;
  const DISMISS_TTL_MS = 60 * 60 * 1000;

  let _lastFiredAt = 0;
  const _sessionDismiss = new Map(); // customer_id -> dismissedAt

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  function _isDismissed(cid) {
    const t = _sessionDismiss.get(String(cid));
    if (!t) return false;
    if (Date.now() - t > DISMISS_TTL_MS) {
      _sessionDismiss.delete(String(cid));
      return false;
    }
    return true;
  }

  function _dismiss(cid) {
    _sessionDismiss.set(String(cid), Date.now());
  }

  function _removeChip() {
    const ex = document.getElementById(CHIP_ID);
    if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
  }

  function _renderChip(pair) {
    _removeChip();
    const chip = document.createElement('div');
    chip.id = CHIP_ID;
    chip.style.cssText = [
      'position:fixed',
      'left:50%',
      'bottom:calc(env(safe-area-inset-bottom,0px) + 84px)',
      'transform:translateX(-50%) translateY(20px)',
      'z-index:9700',
      'display:flex',
      'align-items:center',
      'gap:10px',
      'padding:10px 12px',
      'background:#ffffff',
      'border:1px solid rgba(241,128,145,0.25)',
      'border-radius:999px',
      'box-shadow:0 12px 32px rgba(0,0,0,0.18)',
      'max-width:calc(100vw - 32px)',
      'opacity:0',
      'transition:opacity .25s ease, transform .25s ease',
    ].join(';') + ';';
    const beforeUrl = pair.before && pair.before.image_url || '';
    const afterUrl = pair.after && pair.after.image_url || '';
    const name = pair.customer_name ? (pair.customer_name + '님 ') : '';
    chip.innerHTML = `
      <div style="display:flex;flex-shrink:0;">
        ${beforeUrl ? `<img src="${_esc(beforeUrl)}" style="width:30px;height:30px;border-radius:8px;object-fit:cover;border:2px solid #fff;" alt="" />` : ''}
        ${afterUrl ? `<img src="${_esc(afterUrl)}" style="width:30px;height:30px;border-radius:8px;object-fit:cover;border:2px solid #fff;margin-left:-8px;" alt="" />` : ''}
      </div>
      <span style="font-size:12.5px;font-weight:700;color:#333;line-height:1.3;">${_esc(name)}전·후 카드 만들까요?</span>
      <button type="button" data-ba-act="make"
        style="padding:7px 12px;border:none;border-radius:999px;background:linear-gradient(135deg,#FF6B9D,#F18091);color:#fff;font-weight:700;font-size:12px;cursor:pointer;flex-shrink:0;">만들기</button>
      <button type="button" data-ba-act="dismiss" aria-label="닫기"
        style="background:none;border:none;font-size:18px;color:#aaa;cursor:pointer;line-height:1;padding:0 4px;flex-shrink:0;">×</button>
    `;
    document.body.appendChild(chip);
    requestAnimationFrame(() => {
      chip.style.opacity = '1';
      chip.style.transform = 'translateX(-50%) translateY(0)';
    });

    chip.addEventListener('click', (e) => {
      const act = e.target.closest('[data-ba-act]')?.dataset.baAct;
      if (act === 'make') {
        if (window.hapticMedium) try { window.hapticMedium(); } catch (_e) { void _e; }
        _removeChip();
        _openBa(pair);
      } else if (act === 'dismiss') {
        _dismiss(pair.customer_id);
        _removeChip();
      }
    });

    // 자동 사라짐 — 10초 (사용자 행동 없을 시).
    setTimeout(() => {
      const el = document.getElementById(CHIP_ID);
      if (el === chip) {
        chip.style.opacity = '0';
        chip.style.transform = 'translateX(-50%) translateY(20px)';
        setTimeout(_removeChip, 260);
      }
    }, 10000);
  }

  function _openBa(pair) {
    // 우선순위: ReelsCover (있고 after.image_url 있으면) > Video 시트 > toast 안내
    if (typeof window.ReelsCover === 'object' && typeof window.ReelsCover.open === 'function'
        && pair && pair.after && pair.after.image_url) {
      try {
        window.ReelsCover.open({
          photo_url: pair.after.image_url,
          service_name: pair.after.service_name || pair.before.service_name || '전·후 비교',
          price: pair.after.price || pair.before.price || 0,
        });
        return;
      } catch (_e) { void _e; }
    }
    if (typeof window.openVideo === 'function') {
      try { window.openVideo(); } catch (_e) { void _e; }
      if (typeof window.showToast === 'function') {
        window.showToast('사진 2장을 드롭존에 드래그해 주세요');
      }
      return;
    }
    if (typeof window.showToast === 'function') {
      window.showToast('영상 만들기 화면을 준비 중이에요');
    }
  }

  async function _scanAndShow() {
    if (!window.AutoBA || typeof window.AutoBA.scanAndSuggest !== 'function') return;
    try {
      const res = await window.AutoBA.scanAndSuggest();
      const pair = res && res.pair;
      if (!pair) return;
      if (_isDismissed(pair.customer_id)) return;
      _renderChip(pair);
    } catch (_e) { void _e; }
  }

  function _onDataChanged(e) {
    const d = (e && e.detail) || {};
    const kind = d.kind || d.mutation_kind;
    if (!kind || !TRIGGER_KINDS.has(kind)) return;
    // optimistic 이벤트는 DB 반영 전 → skip (실제 변경 이벤트만)
    if (d.optimistic) return;
    const now = Date.now();
    if (now - _lastFiredAt < DEBOUNCE_MS) return;
    _lastFiredAt = now;
    // DB 반영 + 캐시 무효화 잠시 기다림.
    setTimeout(_scanAndShow, 1500);
  }

  window.addEventListener('itdasy:data-changed', _onDataChanged);

  window.BAAutoTrigger = {
    test: _scanAndShow, // 수동 테스트용
    dismissAll: () => { _sessionDismiss.clear(); _removeChip(); },
  };
})();
