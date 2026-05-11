// ─────────────────────────────────────────────────────────────
// app-perf-recovery.js — 잇데이 3대 체감 개선
//   1. 속도(Prefetch on hover/touch + Skeleton + Critical path warming)
//   2. 폼 자동 복구 (localStorage draft)
//   3. 오프라인 인지 (X-Offline 헤더 감지 + mutation 잠금)
//
// app-core.js 다음에 로드. 의존: window.API, window.authHeader, window.showToast
// ─────────────────────────────────────────────────────────────
(function () {
  'use strict';
  if (window._perfRecoveryInstalled) return;
  window._perfRecoveryInstalled = true;

  // ============================================================
  // 0. 공통 유틸
  // ============================================================
  const _safeGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const _safeSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } };
  const _safeDel = (k) => { try { localStorage.removeItem(k); } catch (_) { /* ignore */ } };

  function _toast(msg) {
    if (typeof window.showToast === 'function') {
      try { window.showToast(msg); } catch (_) { /* ignore */ }
    }
  }

  // ============================================================
  // 1-A·1-D. Prefetch 매니저 — hover/touch + critical path warming
  //
  // SWR 캐시(pv_cache::*)를 미리 채워서 진짜 클릭 시 0ms 렌더.
  // 1초 내 중복 프리페치 방지.
  // ============================================================
  const _prefetchInflight = new Map();   // url → Promise
  const _prefetchAt = new Map();         // url → timestamp
  const PREFETCH_DEDUPE_MS = 30 * 1000;  // 30초 안에 한 URL 은 한 번만

  async function _prefetch(url, swrKey) {
    try {
      const auth = window.authHeader && window.authHeader();
      if (!auth || !auth.Authorization) return;
      const last = _prefetchAt.get(url) || 0;
      if (Date.now() - last < PREFETCH_DEDUPE_MS) return;
      if (_prefetchInflight.has(url)) return _prefetchInflight.get(url);

      // 이미 신선한 캐시 있으면 skip
      try {
        const raw = _safeGet(swrKey);
        if (raw) {
          const obj = JSON.parse(raw);
          if (obj && obj.t && (Date.now() - obj.t < 60 * 1000)) {
            _prefetchAt.set(url, Date.now());
            return;
          }
        }
      } catch (_) { /* ignore */ }

      const p = (async () => {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 20000); // Railway cold start 대응
        try {
          const res = await fetch(window.API + url, {
            headers: { ...auth },
            signal: ctl.signal,
          });
          clearTimeout(timer);
          if (!res.ok) return;
          const d = await res.json();
          const items = (d && (d.items || d)) || null;
          if (items) {
            _safeSet(swrKey, JSON.stringify({ t: Date.now(), d: items }));
          }
        } catch (_) { /* silent */ } finally {
          clearTimeout(timer);
          _prefetchAt.set(url, Date.now());
          _prefetchInflight.delete(url);
        }
      })();
      _prefetchInflight.set(url, p);
      return p;
    } catch (_) { /* silent */ }
  }

  // 데이터 탭 → SWR 키 매핑 (app-core.js 의 _preloadTabs 와 동일)
  const PREFETCH_MAP = {
    home:      { url: '/today/brief',          key: 'pv_cache::today' },
    dashboard: { url: '/today/brief',          key: 'pv_cache::today' },
    customer:  { url: '/customers',            key: 'pv_cache::customers' },
    // [2026-04-26 0초딜레이] 매출은 기본을 today 로 (앱 첫 진입 시 가장 자주 보는 탭)
    revenue:   { url: '/revenue?period=today', key: 'pv_cache::revenue::today' },
    inventory: { url: '/inventory',            key: 'pv_cache::inventory' },
    service:   { url: '/services',             key: 'pv_cache::service' },
    nps:       { url: '/nps',                  key: 'pv_cache::nps' },
  };
  function _bookingRange() {
    const now = Date.now();
    const f = new Date(now - 90 * 24 * 3600 * 1000).toISOString();
    const t = new Date(now + 90 * 24 * 3600 * 1000).toISOString();
    return `/bookings?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`;
  }
  // 캘린더는 좁은 범위(현재월) 캐시도 채워둠 — Booking.list 가 같은 키 형식 쓰진 않지만
  // SWR 'pv_cache::bookings_all' 가 calendar _loadMonth 의 fallback 으로 활용됨.

  // hover/touch 리스너 — 위임 방식. tab-bar 버튼 + 자주 쓰는 nav 트리거
  function _bindHoverPrefetch() {
    const handler = (ev) => {
      const t = ev.target && ev.target.closest && ev.target.closest('[data-prefetch], .tab-bar__btn, .tab-bar__fab, [data-tab], [data-metric], [data-pv-open], [data-open="calendar-view"], [onclick*="openCustomerSheet"], [onclick*="openRevenue"], [onclick*="openInventorySheet"], [onclick*="openBookingSheet"], [onclick*="openCalendarView"], [onclick*="openPowerView"], [onclick*="openShopManagement"], [onclick*="openManagementHub"], [onclick*="goCaption"]');
      if (!t) return;
      // 명시적 data-prefetch="customer,revenue" 가 우선
      const explicit = t.getAttribute && t.getAttribute('data-prefetch');
      if (explicit) {
        explicit.split(',').map(s => s.trim()).filter(Boolean).forEach(k => {
          if (k === 'bookings') _prefetch(_bookingRange(), 'pv_cache::bookings_all');
          else if (PREFETCH_MAP[k]) _prefetch(PREFETCH_MAP[k].url, PREFETCH_MAP[k].key);
        });
        return;
      }
      // tab-bar — data-tab 으로 매핑
      const tab = t.getAttribute && t.getAttribute('data-tab');
      if (tab && PREFETCH_MAP[tab]) {
        _prefetch(PREFETCH_MAP[tab].url, PREFETCH_MAP[tab].key);
        return;
      }
      // 대시보드 KPI 카드 (data-metric) — 클릭 시 해당 허브 열림
      const metric = t.getAttribute && t.getAttribute('data-metric');
      if (metric) {
        if (metric === 'booking')        _prefetch(_bookingRange(), 'pv_cache::bookings_all');
        else if (PREFETCH_MAP[metric])   _prefetch(PREFETCH_MAP[metric].url, PREFETCH_MAP[metric].key);
        return;
      }
      // 파워뷰 탭 직행 (data-pv-open="customer|booking|revenue|...")
      const pvTab = t.getAttribute && t.getAttribute('data-pv-open');
      if (pvTab) {
        if (pvTab === 'booking')        _prefetch(_bookingRange(), 'pv_cache::bookings_all');
        else if (PREFETCH_MAP[pvTab])   _prefetch(PREFETCH_MAP[pvTab].url, PREFETCH_MAP[pvTab].key);
        return;
      }
      // 캘린더 뷰 직행
      if (t.getAttribute && t.getAttribute('data-open') === 'calendar-view') {
        _prefetch(_bookingRange(), 'pv_cache::bookings_all');
        return;
      }
      // onclick 휴리스틱
      const oc = (t.getAttribute && t.getAttribute('onclick')) || '';
      if (oc.includes('openCustomerSheet'))  _prefetch(PREFETCH_MAP.customer.url, PREFETCH_MAP.customer.key);
      if (oc.includes('openRevenue'))        _prefetch(PREFETCH_MAP.revenue.url,  PREFETCH_MAP.revenue.key);
      if (oc.includes('openInventorySheet')) _prefetch(PREFETCH_MAP.inventory.url, PREFETCH_MAP.inventory.key);
      if (oc.includes('openBookingSheet') || oc.includes('openCalendarView')) _prefetch(_bookingRange(), 'pv_cache::bookings_all');
      if (oc.includes('openPowerView')) {
        // openPowerView('customer') 같이 첫 인자로 탭이 오면 가능한 한 매칭
        const m = oc.match(/openPowerView\(\s*['"]([a-z]+)['"]/i);
        if (m && PREFETCH_MAP[m[1]]) _prefetch(PREFETCH_MAP[m[1]].url, PREFETCH_MAP[m[1]].key);
        else _prefetch(PREFETCH_MAP.customer.url, PREFETCH_MAP.customer.key);
      }
    };
    document.addEventListener('mouseenter', handler, true);
    document.addEventListener('touchstart', handler, { passive: true, capture: true });
    document.addEventListener('focusin', handler, true);
  }

  // [2026-04-26 0초딜레이] Critical path 캐시 워밍 — DOMContentLoaded 직후 즉시
  // 사용자 입력 먼저 우선이라 rAF 한 프레임만 기다림 (= ~16ms).
  // 매출은 기간별 키 분리 (today/week/month) — 사용자가 어느 탭 누르든 0ms.
  function _criticalPathWarm() {
    const run = () => {
      const auth = window.authHeader && window.authHeader();
      if (!auth || !auth.Authorization) return;
      _prefetch('/today/brief',           'pv_cache::today');
      _prefetch('/customers',             'pv_cache::customers');
      _prefetch('/revenue?period=today',  'pv_cache::revenue::today');
      _prefetch('/revenue?period=week',   'pv_cache::revenue::week');
      _prefetch('/revenue?period=month',  'pv_cache::revenue::month');
      _prefetch('/inventory',             'pv_cache::inventory');
      _prefetch('/services',              'pv_cache::service');
      _prefetch(_bookingRange(),          'pv_cache::bookings_all');
    };
    // requestAnimationFrame — 첫 프레임 그린 직후
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  // ============================================================
  // 1-E. Performance 측정 헬퍼 — 시트 열림 시간 (개발 모드에서만)
  //   사용: window._perfMark('powerview:open:start') / window._perfMark('powerview:open:end')
  //   localStorage.setItem('itdasy_perf_log', '1') 활성화
  // ============================================================
  function _perfMark(label) {
    try {
      if (typeof performance === 'undefined' || !performance.mark) return;
      performance.mark('itdasy:' + label);
      if (label.endsWith(':end') && _safeGet('itdasy_perf_log') === '1') {
        const start = label.replace(':end', ':start');
        try {
          const m = performance.measure(label.replace(':end', ''), 'itdasy:' + start, 'itdasy:' + label);
          if (m && typeof m.duration === 'number') {
            console.log('[itdasy-perf]', label.replace(':end', ''), m.duration.toFixed(2), 'ms');
          }
        } catch (_) { /* mark 가 없을 수 있음 */ }
      }
    } catch (_) { /* ignore */ }
  }
  window._perfMark = _perfMark;

  window._perfPrefetch = _prefetch;

  // ============================================================
  // 1-B. Skeleton loaders — 공통 함수
  //   sheet 가 열릴 때 데이터 도착 전 회색 placeholder.
  //   기존 .skeleton-box / .sk shimmer CSS 활용 (style-components.css).
  // ============================================================
  function _renderSkeleton(count, opts) {
    count = Math.max(1, Math.min(count || 4, 10));
    opts = opts || {};
    const rows = [];
    for (let i = 0; i < count; i++) {
      rows.push(`
        <div class="itdasy-sk-row" style="display:flex;align-items:center;gap:10px;padding:12px 4px;border-bottom:1px solid rgba(0,0,0,0.04);">
          <div class="sk" style="width:40px;height:40px;border-radius:50%;flex-shrink:0;"></div>
          <div style="flex:1;display:flex;flex-direction:column;gap:6px;">
            <div class="sk" style="width:${50 + Math.floor(Math.random() * 30)}%;height:14px;"></div>
            <div class="sk" style="width:${30 + Math.floor(Math.random() * 30)}%;height:11px;opacity:0.6;"></div>
          </div>
        </div>
      `);
    }
    return `
      <div class="itdasy-skeleton-wrap" data-itdasy-skeleton="1"
           style="opacity:1;transition:none;${opts.style || ''}">
        ${rows.join('')}
      </div>
    `;
  }

  function _replaceSkeleton(containerEl, freshHtml) {
    if (!containerEl) return;
    // [2026-04-26 0초딜레이] 100ms 페이드아웃 제거 — 즉시 교체 (사람 눈은 차이 거의 없음)
    containerEl.innerHTML = freshHtml;
  }

  window._renderSkeleton = _renderSkeleton;
  window._replaceSkeleton = _replaceSkeleton;

  // ============================================================
  // 1-C. 모달 0ms transition (시각 즉시 반응)
  //   기존 사이트 sheet 들이 .style.display='flex' 로 여닫는 패턴 → 그대로 둠.
  //   새 시트만 [data-instant-sheet] 로 표시 — opacity transition 0→1 5ms.
  //   기본 동작 깨지지 않도록 opt-in.
  // ============================================================
  // (CSS 와 결합 — head 에 한 번만 주입)
  (function _injectInstantSheetCSS() {
    if (document.getElementById('itdasy-perf-css')) return;
    const s = document.createElement('style');
    s.id = 'itdasy-perf-css';
    s.textContent = `
      [data-instant-sheet] {
        opacity: 0;
        transition: none;
      }
      [data-instant-sheet].is-open { opacity: 1; }
      .itdasy-offline-banner {
        position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
        padding: 8px 14px;
        background: linear-gradient(90deg, #FFE9A8, #FFD86E);
        color: #6B4D00; font-size: 12px; font-weight: 700;
        text-align: center;
        box-shadow: 0 2px 6px rgba(0,0,0,0.08);
        transform: translateY(-100%);
        transition: transform 0.22s cubic-bezier(.22,.61,.36,1);
      }
      .itdasy-offline-banner.show { transform: translateY(0); }
      [data-mutation]:disabled, [data-mutation][aria-disabled="true"] {
        opacity: 0.45; cursor: not-allowed; filter: grayscale(0.4);
      }
      .itdasy-recover-toast {
        display: inline-flex; align-items: center; gap: 6px;
      }
    `;
    document.head.appendChild(s);
  })();

  // ============================================================
  // 2. 폼 자동 복구
  //   모든 input/textarea/select 변경 시 localStorage 에 draft 저장.
  //   sheet/모달 열릴 때 form 단위로 복원. submit 성공 시 삭제.
  //
  //   [data-form-id="xxx"] 컨테이너 안의 입력만 추적 (전역 오염 방지).
  //   비번/카드번호는 type=password 또는 [data-no-recover] 로 제외.
  // ============================================================
  const FR_PREFIX = 'form_draft::';
  const FR_DEBOUNCE = 250;
  const FR_TIMERS = new Map();
  // 24시간 지난 draft 는 무시
  const FR_TTL = 24 * 60 * 60 * 1000;

  function _isRecoverableField(el) {
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (!['input', 'textarea', 'select'].includes(tag)) return false;
    if (el.type === 'password' || el.type === 'file' || el.type === 'hidden') return false;
    if (el.hasAttribute && (el.hasAttribute('data-no-recover') || el.hasAttribute('data-secret'))) return false;
    if (el.disabled || el.readOnly) return false;
    return true;
  }
  function _fieldId(el) {
    return el.name || el.id || el.getAttribute('data-field') || null;
  }
  function _formContainer(el) {
    return el.closest && el.closest('[data-form-id]');
  }
  function _draftKey(formId, fieldId) {
    return `${FR_PREFIX}${formId}::${fieldId}`;
  }
  function _saveDraft(formId, fieldId, value) {
    try {
      const payload = JSON.stringify({ t: Date.now(), v: value });
      _safeSet(_draftKey(formId, fieldId), payload);
    } catch (_) { /* ignore */ }
  }
  function _readDraft(formId, fieldId) {
    try {
      const raw = _safeGet(_draftKey(formId, fieldId));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || (Date.now() - (obj.t || 0)) > FR_TTL) {
        _safeDel(_draftKey(formId, fieldId));
        return null;
      }
      return obj.v;
    } catch (_) { return null; }
  }
  function _clearForm(formId) {
    try {
      const prefix = FR_PREFIX + formId + '::';
      Object.keys(localStorage).forEach(k => {
        if (k.indexOf(prefix) === 0) _safeDel(k);
      });
    } catch (_) { /* ignore */ }
  }
  window._formRecoveryClear = _clearForm;

  function _onFieldChange(ev) {
    const el = ev.target;
    if (!_isRecoverableField(el)) return;
    const cont = _formContainer(el);
    if (!cont) return;
    const formId = cont.getAttribute('data-form-id');
    const fieldId = _fieldId(el);
    if (!formId || !fieldId) return;
    const tk = `${formId}::${fieldId}`;
    if (FR_TIMERS.has(tk)) clearTimeout(FR_TIMERS.get(tk));
    FR_TIMERS.set(tk, setTimeout(() => {
      const value = (el.type === 'checkbox' || el.type === 'radio') ? !!el.checked : el.value;
      // [렉 박멸 2026-04-26] localStorage.setItem 을 idle 시점으로 미뤄 main thread 블록 방지.
      //   타자 빠를 때 매 250ms 마다 mainthread sync write → keystroke jank.
      //   requestIdleCallback 이 있으면 idle 으로, 없으면 즉시 (구형 브라우저 fallback).
      const _flush = () => { _saveDraft(formId, fieldId, value); };
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(_flush, { timeout: 1500 });
      } else {
        _flush();
      }
      FR_TIMERS.delete(tk);
    }, FR_DEBOUNCE));
  }
  document.addEventListener('input', _onFieldChange, true);
  document.addEventListener('change', _onFieldChange, true);

  // 폼 컨테이너 표시될 때 자동 복원 (수동 호출도 가능)
  function _restoreForm(formId, opts) {
    if (!formId) return false;
    opts = opts || {};
    const cont = document.querySelector(`[data-form-id="${formId}"]`);
    if (!cont) return false;
    let restoredCount = 0;
    cont.querySelectorAll('input, textarea, select').forEach(el => {
      if (!_isRecoverableField(el)) return;
      const fid = _fieldId(el);
      if (!fid) return;
      const v = _readDraft(formId, fid);
      if (v == null) return;
      // 이미 사용자 입력 채워져 있으면 덮어쓰지 않음 (수정 모드 보호)
      if (el.value && !opts.force) return;
      try {
        if (el.type === 'checkbox' || el.type === 'radio') el.checked = !!v;
        else el.value = v;
        restoredCount++;
      } catch (_) { /* ignore */ }
    });
    if (restoredCount > 0 && !opts.silent) {
      const t = document.getElementById('copyToast');
      if (t) {
        t.innerHTML = `<span class="itdasy-recover-toast">이전에 입력하던 데이터를 복원했어요 <button data-undo-recover style="margin-left:8px;background:none;border:1px solid rgba(255,255,255,0.4);color:#fff;border-radius:6px;padding:2px 8px;font-size:11px;cursor:pointer;">복원 안 함</button></span>`;
        t.classList.add('show');
        const undoBtn = t.querySelector('[data-undo-recover]');
        if (undoBtn) {
          undoBtn.addEventListener('click', () => {
            cont.querySelectorAll('input, textarea, select').forEach(el => {
              if (!_isRecoverableField(el)) return;
              try {
                if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
                else el.value = '';
              } catch (_) { /* ignore */ }
            });
            _clearForm(formId);
            t.classList.remove('show');
          }, { once: true });
        }
        setTimeout(() => t.classList.remove('show'), 4500);
      } else {
        _toast('이전에 입력하던 데이터를 복원했어요');
      }
    }
    return restoredCount > 0;
  }
  window._formRecoveryRestore = _restoreForm;

  // 폼 제출 성공 후 호출 (각 모듈이 mutation 후 명시적으로) — 미호출 시 24시간 TTL 로 자연소멸
  // 자동 감지: itdasy:data-changed 발사 시 detail.formId 가 있으면 자동 클리어
  window.addEventListener('itdasy:data-changed', (e) => {
    try {
      const fid = e && e.detail && e.detail.formId;
      if (fid) _clearForm(fid);
    } catch (_) { /* ignore */ }
  });

  // MutationObserver — body 안에 [data-form-id] 가 새로 들어오면 자동 복원 (silent + 1회)
  const FR_RESTORED = new Set();
  const _frObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes && m.addedNodes.forEach(n => {
        if (n.nodeType !== 1) return;
        const containers = [];
        if (n.matches && n.matches('[data-form-id]')) containers.push(n);
        if (n.querySelectorAll) n.querySelectorAll('[data-form-id]').forEach(x => containers.push(x));
        containers.forEach(c => {
          const fid = c.getAttribute('data-form-id');
          if (!fid || FR_RESTORED.has(fid)) return;
          FR_RESTORED.add(fid);
          // 한 프레임 뒤 (다른 JS 가 value 채우는 거 기다림)
          requestAnimationFrame(() => {
            try { _restoreForm(fid); } catch (_) { /* ignore */ }
          });
        });
      });
    }
  });
  document.addEventListener('DOMContentLoaded', () => {
    // [PerfFix] body 전체 subtree → 메인 컨텐츠만. 헤더/사이드바 DOM 변경에 반응 안 함.
    const _formTarget = document.querySelector('.main-content')
      || document.querySelector('main')
      || document.body;
    _frObserver.observe(_formTarget, { childList: true, subtree: true });
    // 초기 페이지에 이미 떠 있는 폼도 복원
    document.querySelectorAll('[data-form-id]').forEach(c => {
      const fid = c.getAttribute('data-form-id');
      if (fid && !FR_RESTORED.has(fid)) {
        FR_RESTORED.add(fid);
        requestAnimationFrame(() => { try { _restoreForm(fid); } catch (_) { /* ignore */ } });
      }
    });
  });

  // ============================================================
  // 3. 오프라인 모드
  //   3-B/3-C: online/offline 이벤트로 노란 배너 + mutation 잠금
  //   3-A: SW 의 X-Offline 헤더는 SW 가 처리(이번 변경에선 SW 수정 포함)
  // ============================================================
  function _ensureBanner() {
    let b = document.getElementById('itdasy-offline-banner');
    if (b) return b;
    b = document.createElement('div');
    b.id = 'itdasy-offline-banner';
    b.className = 'itdasy-offline-banner';
    b.setAttribute('role', 'status');
    b.setAttribute('aria-live', 'polite');
    b.innerHTML = `<i class="ph-duotone ph-wifi-slash" aria-hidden="true"></i><span data-banner-text>오프라인 모드 — 마지막 동기화 데이터로 보고 있어요</span>`;
    document.body.appendChild(b);
    return b;
  }

  function _setMutationLock(locked) {
    document.documentElement.classList.toggle('itdasy-offline', !!locked);
    document.querySelectorAll('[data-mutation]').forEach(el => {
      try {
        if (locked) {
          el.setAttribute('aria-disabled', 'true');
          if ('disabled' in el) el.disabled = true;
          el.dataset._origTitle = el.title || '';
          el.title = '오프라인 — 인터넷 연결되면 다시 가능해요';
        } else {
          el.removeAttribute('aria-disabled');
          if ('disabled' in el) el.disabled = false;
          if (el.dataset._origTitle != null) {
            el.title = el.dataset._origTitle;
            delete el.dataset._origTitle;
          }
        }
      } catch (_) { /* ignore */ }
    });
  }

  function _showOfflineBanner(lastSyncMs) {
    const b = _ensureBanner();
    const t = b.querySelector('[data-banner-text]');
    if (t) {
      let suffix = '';
      if (lastSyncMs) {
        const d = new Date(lastSyncMs);
        suffix = ' · 마지막 동기화 ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      }
      t.textContent = '오프라인 모드 — 추가/수정은 잠시 멈춰요' + suffix;
    }
    b.classList.add('show');
  }
  function _hideOfflineBanner() {
    const b = document.getElementById('itdasy-offline-banner');
    if (b) b.classList.remove('show');
  }
  function _markOnline() {
    _hideOfflineBanner();
    _setMutationLock(false);
  }

  function _lastSyncMs() {
    try {
      const keys = ['pv_cache::today', 'pv_cache::customers', 'pv_cache::revenue', 'pv_cache::bookings_all'];
      let latest = 0;
      keys.forEach(k => {
        const raw = _safeGet(k);
        if (!raw) return;
        try { const o = JSON.parse(raw); if (o && o.t > latest) latest = o.t; } catch (_) { /* ignore */ }
      });
      return latest || null;
    } catch (_) { return null; }
  }

  function _onOffline() {
    _showOfflineBanner(_lastSyncMs());
    _setMutationLock(true);
    _toast('오프라인 — 마지막 동기화 데이터로 보여요');
  }
  function _onOnline() {
    _markOnline();
    _toast('온라인 복구! 새로 불러올게요');
    try {
      // 캐시 클리어 + data-changed 로 모든 시트가 자동 새로고침
      if (typeof window._clearAllSWRCache === 'function') window._clearAllSWRCache();
      window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'online_restore' } }));
    } catch (_) { /* ignore */ }
  }
  window.addEventListener('offline', _onOffline);
  window.addEventListener('online', _onOnline);

  // [2026-04-28 v29 — X-Offline 검사 자체 비활성화]
  // 영구 오프라인 잠금 사용자 보고 다수 → X-Offline 헤더 검사 로직 전면 제거.
  // 오프라인 판단은 navigator.onLine 만 사용 (online/offline 이벤트 + DOMContentLoaded).
  // SW 가 stale cache 응답 반환해도 배너 안 뜸 — UX 약간 stale 데이터 유지하지만
  // 영구 잠금보다 훨씬 나음.
  // fetch 자체 실패 (네트워크 끊김) 는 navigator.onLine 가 자동 감지.

  // [2026-04-28 nuclear 픽스] 페이지 로드 시 navigator.onLine 가 true 면
  // 무조건 오프라인 상태 reset. 이전 X-Offline 캐시·잠금 흔적 청소.
  // SW 가 fresh 응답 줄 거고, 진짜 오프라인이면 다음 fetch 에서 다시 잠긴다.
  document.addEventListener('DOMContentLoaded', () => {
    if (navigator.onLine) {
      try { _markOnline(); } catch (_) { /* ignore */ }
    } else {
      _onOffline();
    }
  });
  function _probeBackendOnline() {
    const auth = window.authHeader && window.authHeader();
    if (!navigator.onLine || !window.API || !auth || !auth.Authorization) return;
    // /auth/me 로 실제 API 응답성 확인 (401도 서버 정상 신호)
    // Railway cold start 최대 20s — 프로브 타임아웃도 20s로 맞춤
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 20000);
    fetch(window.API + '/auth/me', { cache: 'no-store', headers: auth, signal: ctl.signal })
      .then(r => {
        if (r.ok || r.status === 401) {
          _markOnline();
          try {
            if (typeof window._clearAllSWRCache === 'function') window._clearAllSWRCache();
          } catch (_) { /* ignore */ }
        } else {
          _markOffline();
        }
      })
      .catch(() => { _markOffline(); });
  }
  window.addEventListener('online', _probeBackendOnline);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) _probeBackendOnline();
  });
  // cold start 시 800ms 프로브가 즉시 실패해 오프라인 배너를 띄우는 문제 방지 — 3s 지연
  document.addEventListener('DOMContentLoaded', () => setTimeout(_probeBackendOnline, 3000));
  // SW v26+ activate 메시지 받으면 즉시 reload (cache busting)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // 새 SW 가 controller 잡으면 한 번 자동 reload — fresh state
      if (window._sw_reloaded) return;
      window._sw_reloaded = true;
      try { window.location.reload(); } catch (_) { /* ignore */ }
    });
  }

  // ============================================================
  // 부팅
  // ============================================================
  document.addEventListener('DOMContentLoaded', () => {
    _bindHoverPrefetch();
    _criticalPathWarm();
  });
})();
