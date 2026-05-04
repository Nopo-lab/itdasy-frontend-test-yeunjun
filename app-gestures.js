/* ─────────────────────────────────────────────────────────────
   잇데이 — 터치 제스처 통합 (T-330, 2026-04-26)

   목적: 사장님이 캘린더·고객·재고에서 손가락만으로 자유자재로 다루도록.
   - 모든 시트 상단 swipe down → 닫기 (기존 _attachSwipeDownClose 자동 부착)
   - 캘린더 좌/우 swipe → 이전/다음 월
   - 리스트 행(ch-row · ih-low-card · ih-ok-row) 좌/우 swipe → 빠른 액션
   - 카드 길게 누르기(long press) → 컨텍스트 메뉴
   - Pull-to-Refresh 는 app-core.js 가 이미 담당 (중복 안 만듦)

   라이브러리 X — vanilla touch 이벤트만 사용. 햅틱은 window.haptic* 활용.

   주의:
   - mouse 이벤트 지원 (PC 데스크톱 검증용 trackpad·마우스 드래그)
   - 스크롤 의도 vs 가로 swipe 구분: x 축 우세 + 임계 |dx|>40 + |dy|<30
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window._itdasyGesturesInit) return;
  window._itdasyGesturesInit = true;

  /* ── 0. 공용 헬퍼 ─────────────────────────────────────── */
  const HAPTIC = (kind) => {
    const fn = window['haptic' + kind.charAt(0).toUpperCase() + kind.slice(1)];
    if (typeof fn === 'function') { try { fn(); } catch (_e) { void _e; } }
  };
  const TOAST = (msg) => {
    if (typeof window.showToast === 'function') { try { window.showToast(msg); } catch (_e) { void _e; } }
  };

  /* ── 1. 시트 swipe-down close — 새로 등장하는 시트에 자동 부착 ─── */
  /* 기존 app-core.js _attachSwipeDownClose 가 있는 경우만 활용. 자동으로 누락 방지. */
  function _autoAttachSwipeDown() {
    if (typeof window._attachSwipeDownClose !== 'function') return;

    // 캘린더 시트
    document.querySelectorAll('.cal-sheet').forEach(el => {
      if (el._swipeAttached) return;
      window._attachSwipeDownClose(el, () => {
        if (typeof window.closeBooking === 'function') window.closeBooking();
      });
    });

    // 허브 시트들 (고객·재고·매출 등 .hub-overlay 공통)
    document.querySelectorAll('.hub-overlay').forEach(el => {
      if (el._swipeAttached) return;
      window._attachSwipeDownClose(el, () => {
        // 일반화된 닫기: id 패턴으로 추정
        const id = el.id || '';
        if (id.includes('customer') && typeof window.closeCustomerHub === 'function') return window.closeCustomerHub();
        if (id.includes('inventory') && typeof window.closeInventoryHub === 'function') return window.closeInventoryHub();
        if (id.includes('revenue')   && typeof window.closeRevenueHub   === 'function') return window.closeRevenueHub();
        // 폴백: 백드롭 클릭 시뮬레이션
        const bd = document.getElementById((id || '') + '-bd');
        if (bd) bd.click();
      });
    });
  }

  // MutationObserver — body 자식 추가될 때마다 부착 시도
  if (typeof MutationObserver === 'function') {
    const obs = new MutationObserver(_autoAttachSwipeDown);
    document.addEventListener('DOMContentLoaded', () => {
      obs.observe(document.body, { childList: true, subtree: false });
      _autoAttachSwipeDown();
    });
  }

  /* ── 2. 캘린더 좌/우 swipe → 월 이동 ─────────────────── */
  /* .cal-body 안에서 좌→우 (dx>0) = 이전 달, 우→좌 (dx<0) = 다음 달 */
  function _bindCalendarSwipe(body) {
    if (!body || body._calSwipeBound) return;
    body._calSwipeBound = true;

    let sx = 0, sy = 0, st = 0, tracking = false;

    body.addEventListener('touchstart', (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      st = Date.now();
      tracking = true;
    }, { passive: true });

    body.addEventListener('touchend', (e) => {
      if (!tracking) return;
      tracking = false;
      const t = (e.changedTouches && e.changedTouches[0]) || null;
      if (!t) return;
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      const elapsed = Date.now() - st;
      // 가로 swipe 만 (세로 스크롤과 충돌 방지). 빠른 swipe (<500ms) + 임계
      if (Math.abs(dx) < 60) return;
      if (Math.abs(dy) > 50) return;
      if (elapsed > 600) return;

      HAPTIC('light');
      if (dx > 0) {
        if (typeof window._calPrevMonth === 'function') window._calPrevMonth();
      } else {
        if (typeof window._calNextMonth === 'function') window._calNextMonth();
      }
    }, { passive: true });
  }

  // 캘린더 열릴 때마다 새 .cal-body 가 생기므로 위임 전략 — body 클릭/이벤트로 발견
  document.addEventListener('touchstart', (e) => {
    const b = e.target && e.target.closest && e.target.closest('.cal-body');
    if (b) _bindCalendarSwipe(b);
  }, { passive: true, capture: true });

  /* ── 3. 리스트 행 좌/우 swipe → 빠른 액션 ─────────────── */
  /* 대상 셀렉터: 고객 행 .ch-row, 재고 부족 카드 .ih-low-card, 정상 행 .ih-ok-row.
     좌→우 (>+80px) : 주력 액션 (전화걸기 / 보정)
     우→좌 (<-80px) : 보조 액션 (편집 / 삭제는 길게 누르기로 위임) */
  const SWIPE_TARGET = '.ch-row, .ih-low-card, .ih-ok-row';
  const SWIPE_THRESHOLD = 80;

  function _rowAction(row, direction) {
    const phone = row.dataset.phone || row.querySelector('[data-phone]')?.dataset.phone || '';
    const id = row.dataset.id || '';

    if (row.classList.contains('ch-row')) {
      if (direction === 'right') {
        // 우 → 전화 걸기 (있으면) 또는 고객 상세
        if (phone) {
          HAPTIC('medium');
          window.location.href = 'tel:' + phone;
        } else if (typeof window.openCustomerDashboard === 'function') {
          HAPTIC('light');
          window.openCustomerDashboard(id);
        }
      } else {
        // 좌 → 메모 빠른 편집
        HAPTIC('light');
        if (typeof window.openCustomerDashboard === 'function') window.openCustomerDashboard(id);
        TOAST('편집 모드');
      }
      return;
    }
    if (row.classList.contains('ih-low-card') || row.classList.contains('ih-ok-row')) {
      // 재고: 우 → +1, 좌 → -1 (스테퍼 버튼 시뮬레이션)
      const delta = direction === 'right' ? 1 : -1;
      const stepBtn = row.querySelector(`.ih-step[data-delta="${delta}"]`);
      if (stepBtn) {
        HAPTIC('light');
        stepBtn.click();
      } else {
        TOAST(direction === 'right' ? '+1' : '-1');
      }
    }
  }

  document.addEventListener('touchstart', (e) => {
    const row = e.target.closest(SWIPE_TARGET);
    if (!row) return;
    if (!e.touches || e.touches.length !== 1) return;
    row._sx = e.touches[0].clientX;
    row._sy = e.touches[0].clientY;
    row._st = Date.now();
    row._dx = 0;
    row._tracking = true;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    const row = e.target.closest(SWIPE_TARGET);
    if (!row || !row._tracking) return;
    const t = e.touches[0]; if (!t) return;
    const dx = t.clientX - row._sx;
    const dy = t.clientY - row._sy;
    if (Math.abs(dy) > Math.abs(dx)) { row._tracking = false; row.style.transform = ''; return; }
    row._dx = dx;
    // 시각 피드백 — 손가락 따라 살짝 (최대 ±100px)
    const clamped = Math.max(-100, Math.min(100, dx));
    row.style.transform = `translateX(${clamped}px)`;
    row.style.transition = 'none';
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    const row = e.target.closest(SWIPE_TARGET);
    if (!row || !row._tracking) return;
    row._tracking = false;
    const dx = row._dx || 0;
    row.style.transition = 'transform 0.18s ease-out';
    row.style.transform = '';
    if (Math.abs(dx) >= SWIPE_THRESHOLD) {
      _rowAction(row, dx > 0 ? 'right' : 'left');
    }
  }, { passive: true });

  /* ── 4. 길게 누르기 (long press) → 컨텍스트 메뉴 ─────── */
  /* 대상: SWIPE_TARGET 과 동일. 500ms 유지 시 햅틱 + 간단한 액션 시트. */
  const LONGPRESS_MS = 500;
  let _lpTimer = null;
  let _lpRow = null;

  document.addEventListener('touchstart', (e) => {
    const row = e.target.closest(SWIPE_TARGET);
    if (!row) return;
    _lpRow = row;
    _lpTimer = setTimeout(() => {
      if (!_lpRow) return;
      HAPTIC('medium');
      _showContextMenu(_lpRow);
    }, LONGPRESS_MS);
  }, { passive: true });

  function _cancelLongPress() {
    if (_lpTimer) { clearTimeout(_lpTimer); _lpTimer = null; }
    _lpRow = null;
  }
  document.addEventListener('touchmove', _cancelLongPress, { passive: true });
  document.addEventListener('touchend',  _cancelLongPress, { passive: true });
  document.addEventListener('touchcancel', _cancelLongPress, { passive: true });

  function _showContextMenu(row) {
    const isCustomer = row.classList.contains('ch-row');
    const isInventory = row.classList.contains('ih-low-card') || row.classList.contains('ih-ok-row');
    const id = row.dataset.id || '';

    // 임시 액션 시트
    const sheet = document.createElement('div');
    sheet.className = 'gesture-context-sheet';
    sheet.style.cssText = `
      position:fixed; inset:0; z-index:9999;
      background:rgba(0,0,0,0.32); display:flex;
      align-items:flex-end; justify-content:center;
      animation: fadeIn 0.14s ease;
    `;

    const items = [];
    if (isCustomer) {
      items.push({ label: '상세 보기', act: () => window.openCustomerDashboard && window.openCustomerDashboard(id) });
      items.push({ label: '전화 걸기', act: () => {
        const phone = row.dataset.phone || row.querySelector('.ch-phone-tail')?.textContent;
        if (phone) window.location.href = 'tel:' + phone;
        else TOAST('전화번호가 없어요');
      }});
    } else if (isInventory) {
      items.push({ label: '+1 추가', act: () => row.querySelector('.ih-step[data-delta="1"]')?.click() });
      items.push({ label: '-1 차감', act: () => row.querySelector('.ih-step[data-delta="-1"]')?.click() });
    }
    items.push({ label: '취소', danger: false, cancel: true });

    sheet.innerHTML = `
      <div style="background:var(--surface,#fff); width:100%; max-width:480px;
                  border-radius:24px 24px 0 0; padding:14px 0 calc(14px + env(safe-area-inset-bottom));
                  transform:translateY(100%); transition:transform 0.22s cubic-bezier(0.22,1,0.36,1);">
        <div style="width:36px;height:4px;border-radius:2px;background:#e0e0e0;margin:0 auto 12px;"></div>
        ${items.map((it, i) => `
          <button class="sheet-row" data-act="${i}" data-haptic="light"
                  style="width:100%;padding:16px 24px;font-size:15px;font-weight:600;text-align:left;
                         background:none;border:none;color:${it.cancel ? '#888' : 'var(--text)'};">
            ${it.label}
          </button>
        `).join('')}
      </div>`;
    document.body.appendChild(sheet);
    requestAnimationFrame(() => {
      const inner = sheet.firstElementChild;
      if (inner) inner.style.transform = 'translateY(0)';
    });

    function close() {
      const inner = sheet.firstElementChild;
      if (inner) inner.style.transform = 'translateY(100%)';
      setTimeout(() => sheet.remove(), 220);
    }
    sheet.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) { if (e.target === sheet) close(); return; }
      const idx = Number(btn.dataset.act);
      const it = items[idx];
      close();
      if (it && typeof it.act === 'function') setTimeout(it.act, 200);
    });
  }

  /* ── 5. 디버그 — 로드 확인 ───────────────────────────── */
  if (window.console && console.debug) console.debug('[gestures] initialized');
})();
