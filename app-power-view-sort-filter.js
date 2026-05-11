/* ─────────────────────────────────────────────────────────────
   파워뷰 — 정렬·필터 모듈 (Phase 1 Tier A · 2026-05-09)

   엑셀 대체급 운영 OS 1단계. 헤더 클릭 정렬 (asc/desc/none) +
   탭별 필터 칩 (단골만/노쇼위험만/회원권만/카드결제만 등).

   ── 사용자 가드레일 (반드시 준수) ──
   1. 백엔드 신규 0 — 클라 메모리에서 정렬·필터만 (≤500행 가정)
   2. 기존 _PVInt / _PVRender 손대지 않음. 외부에서 hook 만 추가.
   3. 실패해도 기존 화면 안 죽게 try/catch + 기본값 list 그대로 반환
   4. 파일 ≤300줄, CLAUDE.md 500줄 룰

   전역:
     window._PVSort.apply(list, tab)
     window._PVSort.cycleColumn(tab, colKey)
     window._PVSort.toggleFilter(tab, filterKey)
     window._PVSort.renderHeaderArrow(tab, headerIdx)
     window._PVSort.renderFilterChips(tab)
     window._PVSort.bindHeaderClicks(rootEl)
     window._PVSort.getSortKey(tab, headerIdx)
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window._PVSort) return; // 중복 로드 방어

  const LS_PREFIX_SORT = 'pv:sort:';
  const LS_PREFIX_FILTER = 'pv:filter:';

  // 탭별 schema.headers index 와 1:1 매핑되는 정렬 키.
  // null 이면 그 컬럼은 정렬 불가 (예: SVG 칩 같은 비교 불가능 컬럼).
  // app-power-view.js 의 SCHEMAS.headers 순서와 동일하게 유지.
  const SORT_KEYS = {
    customer:  ['name', 'phone', 'memo', 'is_regular', 'membership_active', 'membership_balance', 'visit_count'],
    booking:   ['customer_name', 'service_name', 'starts_at', 'status'],
    revenue:   ['customer_name', 'service_name', 'amount', 'method', 'net_amount'],
    inventory: ['name', 'quantity', 'unit', 'threshold', '_status'],
    nps:       ['rating', 'comment', 'source', 'responded_at'],
    service:   ['name', 'default_price', 'default_duration_min', 'category'],
  };

  // 탭별 필터 칩 정의 — 단순 술어 (true 면 노출)
  const FILTERS = {
    customer: [
      { key: 'regular',    label: '단골만',     test: (r) => !!r.is_regular },
      { key: 'membership', label: '회원권만',   test: (r) => !!r.membership_active },
      { key: 'noshow',     label: '노쇼 위험',  test: (r) => (r.manner_score != null && Number(r.manner_score) < 70) || Number(r.no_show_count || 0) >= 1 },
    ],
    booking: [
      { key: 'today',    label: '오늘만',  test: (r) => {
        const ymd = (r.starts_at || '').slice(0, 10);
        const today = new Date();
        const t = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
        return ymd === t;
      }},
      { key: 'upcoming', label: '예정',    test: (r) => !r.status || r.status === 'confirmed' },
      { key: 'noshow',   label: '노쇼만',  test: (r) => r.status === 'no_show' || !!r.no_show_flagged },
    ],
    revenue: [
      { key: 'card',       label: '카드',     test: (r) => r.method === 'card' },
      { key: 'cash',       label: '현금',     test: (r) => r.method === 'cash' },
      { key: 'membership', label: '회원권',   test: (r) => r.method === 'membership' || r.method === 'transfer' },
    ],
    inventory: [
      { key: 'low', label: '부족만', test: (r) => Number(r.quantity || 0) <= Number(r.threshold || 0) },
    ],
    nps: [
      { key: 'high', label: '★9 이상', test: (r) => Number(r.rating || 0) >= 9 },
      { key: 'low',  label: '★6 이하', test: (r) => Number(r.rating || 0) <= 6 },
    ],
    service: [],
  };

  // ── localStorage 헬퍼 ─────────────────────────────────
  function _readSort(tab) {
    try {
      const raw = localStorage.getItem(LS_PREFIX_SORT + tab);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.key || !obj.dir) return null;
      return obj;
    } catch (_e) { return null; }
  }
  function _writeSort(tab, sort) {
    try {
      if (sort && sort.key && sort.dir) localStorage.setItem(LS_PREFIX_SORT + tab, JSON.stringify(sort));
      else localStorage.removeItem(LS_PREFIX_SORT + tab);
    } catch (_e) { /* quota — 무시 */ }
  }
  function _readFilters(tab) {
    try {
      const raw = localStorage.getItem(LS_PREFIX_FILTER + tab);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch (_e) { return new Set(); }
  }
  function _writeFilters(tab, set) {
    try {
      if (set && set.size > 0) localStorage.setItem(LS_PREFIX_FILTER + tab, JSON.stringify(Array.from(set)));
      else localStorage.removeItem(LS_PREFIX_FILTER + tab);
    } catch (_e) { /* 무시 */ }
  }

  // ── 비교 함수 (null/undefined 끝으로) ─────────────────
  function _compare(a, b, key, dir) {
    const av = a == null ? null : a[key];
    const bv = b == null ? null : b[key];
    const aN = av == null || av === '';
    const bN = bv == null || bv === '';
    if (aN && bN) return 0;
    if (aN) return 1;  // null 은 항상 끝
    if (bN) return -1;

    if (typeof av === 'boolean' || typeof bv === 'boolean') {
      // boolean 은 true 우선 (asc 기준)
      const aT = av ? 1 : 0;
      const bT = bv ? 1 : 0;
      return dir === 'asc' ? bT - aT : aT - bT;
    }
    if (typeof av === 'number' && typeof bv === 'number') {
      return dir === 'asc' ? av - bv : bv - av;
    }
    // 숫자 문자열 — 둘 다 숫자로 파싱되면 숫자 비교
    const aN2 = Number(av);
    const bN2 = Number(bv);
    if (Number.isFinite(aN2) && Number.isFinite(bN2) && String(aN2) === String(av).trim() && String(bN2) === String(bv).trim()) {
      return dir === 'asc' ? aN2 - bN2 : bN2 - aN2;
    }
    // 한국어 친화 문자열 비교
    const aS = String(av);
    const bS = String(bv);
    return dir === 'asc' ? aS.localeCompare(bS, 'ko') : bS.localeCompare(aS, 'ko');
  }

  // ── 변환 API ──────────────────────────────────────────
  function applyFilter(list, tab) {
    try {
      const active = _readFilters(tab);
      if (!active || active.size === 0) return list;
      const defs = (FILTERS[tab] || []).filter((f) => active.has(f.key));
      if (!defs.length) return list;
      // AND 결합 (교집합)
      return list.filter((r) => defs.every((f) => {
        try { return f.test(r); } catch (_e) { return true; }
      }));
    } catch (_e) {
      return list;
    }
  }

  function applySort(list, tab) {
    try {
      const sort = _readSort(tab);
      if (!sort || !sort.key || !sort.dir) return list;
      const copy = list.slice();
      copy.sort((a, b) => _compare(a, b, sort.key, sort.dir));
      return copy;
    } catch (_e) {
      return list;
    }
  }

  function apply(list, tab) {
    if (!Array.isArray(list)) return list;
    return applySort(applyFilter(list, tab), tab);
  }

  // ── 정렬 cycle (asc → desc → none) ────────────────────
  function cycleColumn(tab, colKey) {
    try {
      const cur = _readSort(tab);
      let next;
      if (!cur || cur.key !== colKey) next = { key: colKey, dir: 'asc' };
      else if (cur.dir === 'asc') next = { key: colKey, dir: 'desc' };
      else next = null;
      _writeSort(tab, next);
      _rerender();
    } catch (e) {
      console.warn('[PVSort] cycleColumn', e);
    }
  }

  function toggleFilter(tab, filterKey) {
    try {
      const set = _readFilters(tab);
      if (set.has(filterKey)) set.delete(filterKey);
      else set.add(filterKey);
      _writeFilters(tab, set);
      _rerender();
    } catch (e) {
      console.warn('[PVSort] toggleFilter', e);
    }
  }

  function _rerender() {
    try {
      if (window._PVRender && typeof window._PVRender.renderTab === 'function') {
        window._PVRender.renderTab(true);
      }
    } catch (_e) { /* silent */ }
  }

  // ── 조회 API ──────────────────────────────────────────
  function getCurrentSort(tab) { return _readSort(tab); }
  function getActiveFilters(tab) { return _readFilters(tab); }
  function getFilters(tab) { return FILTERS[tab] || []; }
  function getSortKey(tab, headerIdx) {
    const arr = SORT_KEYS[tab] || [];
    return arr[headerIdx] || null;
  }

  // ── 렌더 헬퍼 ─────────────────────────────────────────
  function _arrowSvg(dir) {
    if (dir === 'asc') {
      return '<i class="ph-duotone ph-caret-up" style="font-size:10px" aria-hidden="true"></i>';
    }
    if (dir === 'desc') {
      return '<i class="ph-duotone ph-caret-down" style="font-size:10px" aria-hidden="true"></i>';
    }
    return '<i class="ph-duotone ph-caret-up" style="font-size:9px" aria-hidden="true"></i>';
  }

  function renderHeaderArrow(tab, headerIdx) {
    try {
      const key = getSortKey(tab, headerIdx);
      if (!key) return '';
      const cur = _readSort(tab);
      const dir = (cur && cur.key === key) ? cur.dir : null;
      return _arrowSvg(dir);
    } catch (_e) { return ''; }
  }

  function renderFilterChips(tab) {
    try {
      const defs = FILTERS[tab] || [];
      if (!defs.length) return '';
      const active = _readFilters(tab);
      const chips = defs.map((f) => {
        const on = active.has(f.key);
        return `<button class="pv-filter-chip${on ? ' is-on' : ''}" data-pv-filter="${f.key}" type="button">${f.label}${on ? ' ✓' : ''}</button>`;
      }).join('');
      const reset = (active && active.size > 0) ? `<button class="pv-filter-reset" data-pv-filter-reset type="button">초기화</button>` : '';
      return `<div class="pv-filter-row" data-pv-filter-row>${chips}${reset}</div>`;
    } catch (_e) { return ''; }
  }

  // ── 이벤트 바인딩 ─────────────────────────────────────
  function bindHeaderClicks(root) {
    if (!root) return;
    try {
      root.querySelectorAll('[data-pv-sort]').forEach((el) => {
        el.addEventListener('click', () => {
          const colKey = el.getAttribute('data-pv-sort');
          const tab = window._PVState && window._PVState.currentTab;
          if (colKey && tab) cycleColumn(tab, colKey);
        });
      });
      root.querySelectorAll('[data-pv-filter]').forEach((el) => {
        el.addEventListener('click', () => {
          const fk = el.getAttribute('data-pv-filter');
          const tab = window._PVState && window._PVState.currentTab;
          if (fk && tab) toggleFilter(tab, fk);
        });
      });
      const resetBtn = root.querySelector('[data-pv-filter-reset]');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          const tab = window._PVState && window._PVState.currentTab;
          if (!tab) return;
          _writeFilters(tab, new Set());
          _rerender();
        });
      }
    } catch (e) {
      console.warn('[PVSort] bindHeaderClicks', e);
    }
  }

  // ── 공개 API ──────────────────────────────────────────
  window._PVSort = {
    apply, applySort, applyFilter,
    cycleColumn, toggleFilter,
    getCurrentSort, getActiveFilters, getFilters, getSortKey,
    renderHeaderArrow, renderFilterChips,
    bindHeaderClicks,
  };
})();
