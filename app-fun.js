/* 잇데이 — Fun helpers (2026-04-29)
   숫자 count-up · confetti · star burst · pulse 효과 */
(function () {
  'use strict';

  /**
   * 숫자 count-up 애니메이션.
   * @param {HTMLElement} el — 텍스트 표시할 element
   * @param {number} from — 시작 숫자
   * @param {number} to — 도달 숫자
   * @param {object} opts — { duration?: ms, format?: fn, suffix?: '원' }
   */
  function countUp(el, from, to, opts) {
    if (!el) return;
    opts = opts || {};
    const duration = opts.duration || 720;
    const format = opts.format || ((n) => Math.round(n).toLocaleString('ko-KR'));
    const suffix = opts.suffix || '';
    const startedAt = performance.now();
    const delta = to - from;

    function tick(now) {
      const t = Math.min(1, (now - startedAt) / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const cur = from + delta * eased;
      el.textContent = format(cur) + suffix;
      if (t < 1) requestAnimationFrame(tick);
      else {
        el.textContent = format(to) + suffix;
        el.classList.add('itd-num-pop');
        setTimeout(() => el.classList.remove('itd-num-pop'), 500);
      }
    }
    requestAnimationFrame(tick);
  }

  /**
   * 작은 confetti — 별/하트 폭죽 (성공 액션 후).
   * @param {object} opts — { emojis?: array, count?: number, durationMs?: number, origin?: {x, y} }
   */
  function confetti(opts) {
    opts = opts || {};
    const emojis = opts.emojis || ['✨', '🌷', '💖', '⭐', '🎉'];
    const count = opts.count || 14;
    const host = document.createElement('div');
    host.className = 'itd-confetti-host';
    document.body.appendChild(host);

    const cx = (opts.origin && opts.origin.x) || window.innerWidth / 2;
    const cy = (opts.origin && opts.origin.y) || window.innerHeight / 2;

    for (let i = 0; i < count; i++) {
      const piece = document.createElement('div');
      piece.className = 'itd-confetti-piece';
      piece.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      piece.style.left = cx + 'px';
      piece.style.top = cy + 'px';
      const xDir = (Math.random() - 0.5) * 220;
      piece.style.setProperty('--itd-cf-x', xDir + 'px');
      piece.style.fontSize = (16 + Math.random() * 12) + 'px';
      piece.style.animationDelay = (Math.random() * 120) + 'ms';
      host.appendChild(piece);
    }
    setTimeout(() => host.remove(), 1300);
  }

  /**
   * 화면 중앙 큰 별 폭죽 (단골 등록·신기록 갱신 등 강한 축하).
   * @param {string} emoji — 기본 ⭐
   */
  function starBurst(emoji) {
    const el = document.createElement('div');
    el.className = 'itd-star-burst';
    el.textContent = emoji || '⭐';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  /**
   * 카드 등장 애니메이션 일괄 적용 — selector 안의 직속 자식들에 stagger.
   */
  function staggerCards(selector) {
    const parent = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!parent) return;
    Array.from(parent.children).forEach((child, idx) => {
      child.classList.add('itd-card-enter');
      child.style.animationDelay = (idx * 60) + 'ms';
    });
  }

  /**
   * 토스트 + 작은 confetti 동시 — 매출 입력 / 회원권 충전 / 캡션 완성 등.
   */
  function celebrate(msg, opts) {
    if (typeof window.showToast === 'function') window.showToast(msg);
    confetti(opts);
    if (typeof window.hapticLight === 'function') window.hapticLight();
  }

  /**
   * 큰 축하 (신기록 / 첫 단골 등) — star burst + confetti + medium haptic.
   */
  function celebrateBig(msg, emoji) {
    if (typeof window.showToast === 'function') window.showToast(msg);
    starBurst(emoji);
    confetti({ count: 22 });
    if (typeof window.hapticMedium === 'function') window.hapticMedium();
    else if (typeof window.hapticLight === 'function') window.hapticLight();
  }

  /**
   * 스켈레톤 N개 라인 생성.
   */
  function skeleton(n, opts) {
    n = n || 3;
    const wrap = document.createElement('div');
    wrap.style.padding = '14px 0';
    for (let i = 0; i < n; i++) {
      const s = document.createElement('div');
      s.className = 'itd-skel' + ((opts && opts.lg && i === 0) ? ' lg' : '');
      s.style.width = (60 + Math.random() * 40) + '%';
      wrap.appendChild(s);
    }
    return wrap;
  }

  /**
   * 빈 상태 element — 일러스트 + 메시지 + 옵션 액션.
   */
  function emptyState(opts) {
    opts = opts || {};
    const icon = opts.icon || '🌿';
    const title = opts.title || '아직 없어요';
    const sub = opts.sub || '';
    const action = opts.action;  // { label, onClick }
    const wrap = document.createElement('div');
    wrap.style.cssText = 'text-align:center;padding:48px 20px;color:#888;';
    wrap.innerHTML = `
      <div class="itd-empty-icon">${icon}</div>
      <div style="font-size:15px;font-weight:700;color:#333;margin-top:14px;">${title}</div>
      ${sub ? `<div style="font-size:12px;color:var(--text-subtle);margin-top:6px;line-height:1.5;">${sub}</div>` : ''}
    `;
    if (action) {
      const btn = document.createElement('button');
      btn.textContent = action.label;
      btn.style.cssText = 'margin-top:16px;padding:11px 22px;background:linear-gradient(135deg,var(--brand),#FFA8B6);color:#fff;border:none;border-radius:999px;font-weight:700;font-size:13px;cursor:pointer;';
      btn.addEventListener('click', action.onClick);
      wrap.appendChild(btn);
    }
    return wrap;
  }

  // 글로벌 expose
  window.Fun = {
    countUp,
    confetti,
    starBurst,
    staggerCards,
    celebrate,
    celebrateBig,
    skeleton,
    emptyState,
  };

  // 매출/예약/회원권 등 mutation 후 자동 confetti — itdasy:data-changed 리스닝
  if (typeof window !== 'undefined') {
    window.addEventListener('itdasy:data-changed', (e) => {
      const k = (e && e.detail && e.detail.kind) || '';
      const opt = (e && e.detail) || {};
      if (opt.optimistic === true) return;  // 낙관적 호출은 confetti 생략 (실 결과 도착 시만)
      if (opt.rollback === true) return;
      // 2026-05-01 ── 사용자 보고: '이상한 팝콘 터지는 효과 빼줘'.
      // create_customer / create_booking 의 confetti 제거. 매출/회원권은 유지 (성과 강조).
      if (k === 'create_revenue') confetti({ emojis: ['💰', '💵', '✨', '🎉'], count: 12 });
      else if (k === 'membership_topup') confetti({ emojis: ['💳', '✨', '💖'], count: 14 });
      // create_customer / create_booking 은 confetti 안 함 (조용히 추가)
    });
  }
})();
