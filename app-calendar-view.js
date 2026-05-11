/* ─────────────────────────────────────────────────────────────
   예약관리 v4 — 월/주/일 뷰 + 모바일 + PC
   의존: app-booking-api.js (window.Booking)
   CSS:  css/screens/booking-v4.css (bk-* prefix)

   전역 진입점 (시그니처 보존):
     window.openCalendarView()       — 메인 진입 (월 뷰)
     window.openBooking(date?)       — 별칭 (대시보드 바로가기 호환)
     window.closeBooking()           — 닫기
     window._calSelectDay(dateStr)   — 월 셀 클릭 위임
     window._calSelectDayChip(dateStr)
     window._calSwitchView(view)
     window._calPrevMonth() / _calNextMonth()

   v4 추가 기능:
     - 직원 필터 칩 (toolbar)
     - now-line (주/일 뷰 현재 시각 표시)
     - PC 좌측 패널 (미니 캘린더 + 직원 리스트 + 통계)
     - PC 일간: 직원별 컬럼 분할
     - localStorage 상태 저장 (bk4_state)
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const OVERLAY_ID = 'cal-overlay';
  const STATE_KEY  = 'bk4_state';
  const STAFF_CACHE_KEY = 'cv4_staff_cache';

  // === 2026 한국 공휴일 ===
  const HOLIDAYS_2026 = {
    '1-1':'신정','2-16':'설날 연휴','2-17':'설날','2-18':'설날 연휴',
    '3-1':'삼일절','3-2':'대체공휴일','5-5':'어린이날','5-25':'부처님오신날',
    '6-6':'현충일','8-15':'광복절','8-17':'대체공휴일',
    '9-24':'추석 연휴','9-25':'추석','9-26':'추석 연휴',
    '10-3':'개천절','10-5':'대체공휴일','10-9':'한글날','12-25':'크리스마스',
  };

  // [2026-05-04] 시간 선택 휠 네이티브 스냅 스타일 주입
  (function _injectWheelStyle() {
    if (typeof document === 'undefined' || document.getElementById('bf-tp-wheel-style')) return;
    const s = document.createElement('style');
    s.id = 'bf-tp-wheel-style';
    s.textContent = `
      .bf-tp-wheel {
        height: 140px !important;
        overflow-y: scroll !important;
        scroll-snap-type: y mandatory !important;
        
        scrollbar-width: none;
        position: relative;
      }
      .bf-tp-wheel::-webkit-scrollbar { display: none; }
      .bf-tp-inner {
        padding: 56px 0 !important; /* 상하 2칸씩 여백 (140/2 - 28/2 = 56) */
        display: flex;
        flex-direction: column;
        transition: none !important;
        transform: none !important;
      }
      .bf-tp-row {
        height: 28px !important;
        line-height: 28px !important;
        scroll-snap-align: center !important;
        flex: 0 0 28px !important;
        opacity: 0.35;
        transition: opacity 0.2s, font-weight 0.2s, transform 0.2s;
        transform: scale(0.9);
      }
      .bf-tp-row.current {
        opacity: 1 !important;
        font-weight: 700 !important;
        color: var(--brand, var(--brand)) !important;
        transform: scale(1.15) !important;
      }
    `;
    document.head.appendChild(s);
  })();

  // === 시간 그리드 단위 ===
  const HOUR_PX_MOBILE_DAY  = 60;
  const HOUR_PX_MOBILE_WEEK = 50;
  const HOUR_PX_PC_WEEK     = 60;
  const HOUR_PX_PC_DAY      = 80;
  const PC_BREAKPOINT       = 1100;

  // === 상태 ===
  let _curYear, _curMonth;
  let _curView = 'month';        // 'month' | 'week' | 'day'
  let _curDate = new Date();
  let _mappedCache = [];         // 현재 월 매핑된 예약
  let _staffList = [];           // [{id, name, color_idx}, ...]
  let _activeStaffIds = null;    // null = 전체, Set = 선택된 직원
  let _miniMonth = null;         // PC 미니캘 표시 월 {y, m}
  let _nowLineTimer = null;
  let _cachedIsPC = false;

  // ============================================================
  // §1 헬퍼
  // ============================================================
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function _pad(n)  { return String(n).padStart(2, '0'); }
  function _ds(d)   { return d.getFullYear() + '-' + _pad(d.getMonth()+1) + '-' + _pad(d.getDate()); }
  function _fmt(d)  { return _pad(d.getHours()) + ':' + _pad(d.getMinutes()); }
  function _overlay()  { return document.getElementById(OVERLAY_ID); }
  function _isPC() { return window.innerWidth >= PC_BREAKPOINT; }

  function _saveState() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        view: _curView, y: _curYear, m: _curMonth, dateISO: _ds(_curDate),
      }));
    } catch (_e) { void _e; }
  }
  function _loadState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); }
    catch (_e) { return null; }
  }

  function _close() {
    if (_nowLineTimer) { clearInterval(_nowLineTimer); _nowLineTimer = null; }
    if (_escHandler) { document.removeEventListener('keydown', _escHandler); _escHandler = null; }
    const o = _overlay(); if (o) o.remove();
    document.body.style.overflow = '';
    document.body.classList.remove('bk-pc-mode');
    try { if (typeof window._markSheetClosed === 'function') window._markSheetClosed('booking'); } catch (_e) { void _e; }
  }
  let _escHandler = null;
  function _bindEscClose() {
    if (_escHandler) return;
    _escHandler = (e) => { if (e.key === 'Escape') _close(); };
    document.addEventListener('keydown', _escHandler);
  }

  // ============================================================
  // §2 데이터 로딩
  // ============================================================
  function _catalogPriceFor(svc) {
    if (!svc) return null;
    const list = window._serviceTemplatesCache || [];
    if (!list.length) return null;
    const k = String(svc).trim().toLowerCase();
    if (!k) return null;
    let hit = list.find(t => (t.name || '').trim().toLowerCase() === k);
    if (!hit) hit = list.find(t => k.includes((t.name || '').trim().toLowerCase()) || (t.name || '').trim().toLowerCase().includes(k));
    return hit && hit.default_price ? hit.default_price : null;
  }
  function _krwShort(n) {
    if (!n || n <= 0) return '';
    if (n >= 10000) {
      const v = n / 10000;
      const fixed = (Math.round(v * 10) / 10);
      return (fixed % 1 === 0 ? fixed.toFixed(0) : fixed.toFixed(1)) + '만';
    }
    if (n >= 1000) return Math.round(n / 1000) + '천';
    return n + '원';
  }

  function _mapItems(items) {
    return items.map(b => {
      const s = new Date(b.starts_at), e = new Date(b.ends_at);
      const amt = (b.amount && b.amount > 0) ? b.amount : _catalogPriceFor(b.service_name);
      // staff_idx: staff_id 가 있으면 _staffList 에서 인덱스 매칭, 없으면 0
      let staffIdx = 0;
      if (b.staff_id != null && _staffList.length) {
        const i = _staffList.findIndex(s2 => String(s2.id) === String(b.staff_id));
        if (i >= 0) staffIdx = i;
      }
      return {
        d: s.getDate(),
        t: s.toTimeString().slice(0, 5),
        cust: b.customer_name || '이름 없음',
        svc: b.service_name || '',
        dur: Math.round((e - s) / 60000),
        id: b.id,
        status: b.status,
        amount: amt || null,
        staff_id: b.staff_id || null,
        staff_idx: staffIdx,
        _raw: b,
      };
    });
  }

  async function _loadMonth(year, month) {
    const from = new Date(year, month - 1, 1).toISOString();
    const to   = new Date(year, month, 0, 23, 59, 59).toISOString();
    const items = await window.Booking.list(from, to);
    return _mapItems(items);
  }

  // === 직원 목록 (TODO[v1.5]: 백엔드 /staff 미구현 시 폴백) ===
  async function _fetchStaff() {
    try {
      const cached = JSON.parse(localStorage.getItem(STAFF_CACHE_KEY) || 'null');
      if (cached && Array.isArray(cached) && cached.length) return cached;
    } catch (_e) { void _e; }
    let list = null;
    try {
      if (window.API && window.authHeader) {
        const r = await fetch(window.API + '/staff', { headers: window.authHeader() });
        if (r.ok) {
          const d = await r.json();
          if (Array.isArray(d.items) && d.items.length) {
            list = d.items.map((s, i) => ({ id: s.id, name: s.name || '직원' + (i+1), color_idx: i }));
          }
        }
      }
    } catch (_e) { void _e; }
    if (!list) {
      // 폴백: 1인샵 기본 — 원장만
      list = [{ id: 1, name: '원장', color_idx: 0 }];
    }
    try { localStorage.setItem(STAFF_CACHE_KEY, JSON.stringify(list)); } catch (_e) { void _e; }
    return list;
  }

  // ============================================================
  // §3 필터링 (직원)
  // ============================================================
  function _filterByStaff(items) {
    if (!_activeStaffIds || _activeStaffIds.size === 0) return items;
    return items.filter(it => {
      if (it.staff_id == null) return _activeStaffIds.has(0); // 미지정 = 0
      return _activeStaffIds.has(it.staff_id);
    });
  }

  // ============================================================
  // §4 통계 계산 (PC 좌측 + 헤더)
  // ============================================================
  function _calcStats(items) {
    const todayDS = _ds(new Date());
    let todayCnt = 0, todayDone = 0, todayWait = 0;
    let weekCnt = 0;
    let estRevenue = 0;
    // 이번 주 범위
    const now = new Date(); now.setHours(0,0,0,0);
    const ws = new Date(now); ws.setDate(ws.getDate() - ws.getDay());
    const we = new Date(ws); we.setDate(we.getDate() + 7);

    items.forEach(it => {
      const sd = new Date(it._raw.starts_at);
      const itemDS = _ds(sd);
      if (itemDS === todayDS) {
        todayCnt++;
        if (it.status === 'completed') todayDone++;
        else if (it.status !== 'cancelled' && it.status !== 'no_show') todayWait++;
        if (it.amount) estRevenue += it.amount;
      }
      if (sd >= ws && sd < we && it.status !== 'cancelled' && it.status !== 'no_show') {
        weekCnt++;
      }
    });
    return { todayCnt, todayDone, todayWait, weekCnt, estRevenue };
  }

  function _monthSummary(items) {
    let cnt = 0, rev = 0;
    items.forEach(it => {
      if (it.status === 'cancelled' || it.status === 'no_show') return;
      cnt++;
      if (it.amount) rev += it.amount;
    });
    return { cnt, rev };
  }

  // ============================================================
  // §5 모바일 — 월 그리드
  // ============================================================
  // 월 그리드 공통 — 모바일/PC 모두 사용. clsPrefix: 'bk-month-m' or 'bk-pc-month'
  function _buildMonthCellHTML(d, year, month, byDay, today, p, isPC) {
    const isToday = today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === d;
    const dateStr = year + '-' + _pad(month) + '-' + _pad(d);
    let cls = `${p}__cell` + (isToday ? ` ${p}__cell--today` : '');
    let h = `<div class="${cls}" onclick="_calSelectDay('${dateStr}')">`;
    h += `<div class="${p}__num">${d}</div>`;
    const its = byDay[d] || [];
    if (its.length) {
      h += `<div class="${p}__events">`;
      its.slice(0, 3).forEach(it => {
        const s2 = it.staff_idx >= 1 ? ' is-staff2' : '';
        const tm = isPC ? (_fmt(new Date(it._raw.starts_at)) + ' ') : '';
        const svc = (isPC && it.svc) ? ' · ' + _esc(it.svc) : '';
        h += `<div class="${p}__evt${s2}">${tm}${_esc(it.cust)}${svc}</div>`;
      });
      if (its.length > 3) h += `<div class="${p}__more">+${its.length - 3}</div>`;
      h += '</div>';
    }
    return h + '</div>';
  }

  function _buildMonthGrid(year, month, mapped, p, isPC) {
    const filtered = _filterByStaff(mapped);
    const byDay = {};
    filtered.forEach(m => { (byDay[m.d] = byDay[m.d] || []).push(m); });
    const firstDow = new Date(year, month - 1, 1).getDay();
    const lastDate = new Date(year, month, 0).getDate();
    const prevLast = new Date(year, month - 1, 0).getDate();
    const today = new Date();
    let cells = '';
    for (let i = 0; i < firstDow; i++) {
      cells += `<div class="${p}__cell ${p}__cell--other"><div class="${p}__num">${prevLast - firstDow + 1 + i}</div></div>`;
    }
    for (let d = 1; d <= lastDate; d++) cells += _buildMonthCellHTML(d, year, month, byDay, today, p, isPC);
    const rem = (firstDow + lastDate) % 7;
    if (rem > 0) {
      for (let i = 1; i <= 7 - rem; i++) {
        cells += `<div class="${p}__cell ${p}__cell--other"><div class="${p}__num">${i}</div></div>`;
      }
    }
    return cells;
  }

  function _renderMonthMobile(year, month, mapped) {
    const DOW = ['일','월','화','수','목','금','토'];
    let h = '<div class="bk-month-m"><div class="bk-month-m__dow-row">';
    DOW.forEach(d => { h += '<div class="bk-month-m__dow">' + d + '</div>'; });
    h += '</div><div class="bk-month-m__cells">';
    h += _buildMonthGrid(year, month, mapped, 'bk-month-m', false);
    return h + '</div></div>';
  }

  // ============================================================
  // §6 모바일 — 일 뷰 (date strip + day grid)
  // ============================================================
  function _renderDateStripMobile(date, mapped) {
    const DOW = ['일','월','화','수','목','금','토'];
    const filtered = _filterByStaff(mapped);
    let h = '<div class="bk-dates" id="bk-dates-strip">';
    for (let i = -14; i <= 14; i++) {
      const d = new Date(date);
      d.setDate(d.getDate() + i);
      const ds = _ds(d);
      const hasEv = filtered.some(m => _ds(new Date(m._raw.starts_at)) === ds);
      const cls = 'bk-date' + (i === 0 ? ' is-on' : '') + (hasEv ? ' has-events' : '');
      h += '<button class="' + cls + '" onclick="_calSelectDayChip(\'' + ds + '\')" data-date="' + ds + '">';
      h += '<span class="bk-date__dow">' + DOW[d.getDay()] + '</span>';
      h += '<span class="bk-date__num">' + d.getDate() + '</span></button>';
    }
    return h + '</div>';
  }

  function _renderDayMobile(date, mapped) {
    const tt = _ttHours();
    const dayDS = _ds(date);
    const filtered = _filterByStaff(mapped).filter(m => _ds(new Date(m._raw.starts_at)) === dayDS);
    const { start, end } = _expandHoursForItems(tt.start, tt.end, filtered);
    let h = '<div class="bk-day" id="bk-day-grid" data-date="' + dayDS + '" data-start-h="' + start + '">';
    for (let hr = start; hr < end; hr++) {
      h += '<div class="bk-day__row">';
      h += '<div class="bk-day__hour-label">' + _pad(hr) + ':00</div>';
      h += '<div class="bk-day__hour-content" data-hour="' + hr + '">';
      h += '<div class="bk-day__slot-half" data-hour="' + hr + '" data-min="0"></div>';
      h += '<div class="bk-day__slot-half" data-hour="' + hr + '" data-min="30"></div>';
      h += '</div></div>';
    }
    // 블록 (absolute, hour-content 내부에 배치하는 대신 grid 전체에 absolute)
    h += '<div class="bk-now-line" style="display:none"></div>';
    h += '</div>';
    return { html: h, items: filtered, start, end };
  }

  function _placeDayBlocks(grid, items, startH) {
    if (!grid) return;
    items.forEach(it => {
      const s = new Date(it._raw.starts_at);
      const e = new Date(it._raw.ends_at);
      const top = (s.getHours() - startH) * HOUR_PX_MOBILE_DAY + (s.getMinutes() / 60) * HOUR_PX_MOBILE_DAY;
      const height = Math.max(20, Math.round(((e - s) / 60000) / 60 * HOUR_PX_MOBILE_DAY));
      const isDim = it.status === 'cancelled' || it.status === 'no_show';
      const s2 = it.staff_idx >= 1 ? ' is-staff2' : '';
      const dim = isDim ? ' is-dim' : '';
      // hour label 폭(50px) 만큼 left offset 필요 → grid 안에서 absolute. 구조: bk-day 안에 row들이 있는데, block 은 row 밖에 절대 배치되어야 함.
      const block = document.createElement('button');
      block.className = 'bk-block' + s2 + dim;
      block.dataset.bookingId = it.id;
      block.style.position = 'absolute';
      block.style.top = top + 'px';
      block.style.height = height + 'px';
      block.style.left = '54px';
      block.style.right = '12px';
      block.innerHTML = '<div class="bk-block__title">' + _esc(it.cust) + '</div>'
        + '<div class="bk-block__sub">' + _fmt(s) + ' · ' + _esc(it.svc || '') + '</div>'
        + (it.staff_idx >= 1 ? '<span class="bk-block__staff-dot bk-staff-dot bk-staff-dot--gray"></span>'
                              : '<span class="bk-block__staff-dot bk-staff-dot bk-staff-dot--pink"></span>');
      grid.appendChild(block);
    });
  }

  // ============================================================
  // §7 모바일 — 주간 뷰
  // ============================================================
  function _renderWeekMobile(baseDate, mapped) {
    const tt = _ttHours();
    const DOW = ['일','월','화','수','목','금','토'];
    const ws = new Date(baseDate); ws.setHours(0,0,0,0);
    ws.setDate(ws.getDate() - ws.getDay());
    const we = new Date(ws); we.setDate(ws.getDate() + 7);
    const today = new Date(); today.setHours(0,0,0,0);
    const filtered = _filterByStaff(mapped);
    const inWeek = filtered.filter(m => {
      const sd = new Date(m._raw.starts_at);
      return sd >= ws && sd < we;
    });
    const { start, end } = _expandHoursForItems(tt.start, tt.end, inWeek);

    let h = '<div class="bk-week-m" data-start-h="' + start + '">';
    // header
    h += '<div class="bk-week-m__header"><div class="bk-week-m__h-cell"></div>';
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws); d.setDate(ws.getDate() + i);
      const cls = 'bk-week-m__h-cell' + (d.getTime() === today.getTime() ? ' is-today' : '');
      h += '<div class="' + cls + '">';
      h += '<div class="bk-week-m__h-dow">' + DOW[d.getDay()] + '</div>';
      h += '<div class="bk-week-m__h-num">' + d.getDate() + '</div></div>';
    }
    h += '</div>';

    // grid
    h += '<div class="bk-week-m__grid" id="bk-week-m-grid">';
    for (let hr = start; hr < end; hr++) {
      h += '<div class="bk-week-m__time-cell">' + hr + '</div>';
      for (let dayI = 0; dayI < 7; dayI++) {
        const d = new Date(ws); d.setDate(ws.getDate() + dayI);
        const ymd = _ds(d);
        h += '<div class="bk-week-m__day" data-date="' + ymd + '" data-hour="' + hr + '">';
        h += '<div class="bk-week-m__hour" data-hour="' + hr + '"></div>';
        h += '</div>';
      }
    }
    h += '</div></div>';
    return { html: h, items: filtered, start, ws };
  }

  function _placeWeekMBlocks(grid, items, startH, weekStart) {
    if (!grid) return;
    // [PERF P3-2] DOM 쿼리 1회 캐싱 + DocumentFragment 배치 삽입
    const cellMap = new Map();
    grid.querySelectorAll('.bk-week-m__day').forEach(cell => {
      const key = (cell.dataset.date || '') + ':' + (cell.dataset.hour || '');
      cellMap.set(key, cell);
    });
    const fragments = new Map();
    items.forEach(it => {
      const s = new Date(it._raw.starts_at);
      const e = new Date(it._raw.ends_at);
      const key = _ds(s) + ':' + s.getHours();
      let target = cellMap.get(key);
      if (!target) {
        const dayI = Math.round((new Date(_ds(s)) - new Date(_ds(weekStart))) / 86400000);
        if (dayI < 0 || dayI > 6) return;
        const allCells = grid.querySelectorAll('.bk-week-m__day');
        target = allCells[(s.getHours() - startH) * 7 + dayI];
      }
      if (!target) return;
      const top = (s.getMinutes() / 60) * HOUR_PX_MOBILE_WEEK;
      const height = Math.max(15, ((e - s) / 60000 / 60) * HOUR_PX_MOBILE_WEEK);
      const s2 = it.staff_idx >= 1 ? ' is-staff2' : '';
      const block = document.createElement('button');
      block.className = 'bk-week-m__block' + s2;
      block.dataset.bookingId = it.id;
      block.style.top = top + 'px';
      block.style.height = height + 'px';
      block.textContent = it.cust;
      if (!fragments.has(target)) fragments.set(target, document.createDocumentFragment());
      fragments.get(target).appendChild(block);
    });
    fragments.forEach((frag, cell) => cell.appendChild(frag));
  }

  // ============================================================
  // §8 PC — 월 뷰
  // ============================================================
  function _renderMonthPC(year, month, mapped) {
    const DOW = ['일','월','화','수','목','금','토'];
    let h = '<div class="bk-pc-month"><div class="bk-pc-month__dow-row">';
    DOW.forEach(d => { h += '<div class="bk-pc-month__dow">' + d + '</div>'; });
    h += '</div><div class="bk-pc-month__cells">';
    h += _buildMonthGrid(year, month, mapped, 'bk-pc-month', true);
    return h + '</div></div>';
  }

  // ============================================================
  // §9 PC — 주간 뷰
  // ============================================================
  function _renderWeekPC(baseDate, mapped) {
    const tt = _ttHours();
    const DOW = ['일','월','화','수','목','금','토'];
    const ws = new Date(baseDate); ws.setHours(0,0,0,0);
    ws.setDate(ws.getDate() - ws.getDay());
    const we = new Date(ws); we.setDate(ws.getDate() + 7);
    const today = new Date(); today.setHours(0,0,0,0);
    const filtered = _filterByStaff(mapped);
    const inWeek = filtered.filter(m => {
      const sd = new Date(m._raw.starts_at);
      return sd >= ws && sd < we;
    });
    const { start, end } = _expandHoursForItems(tt.start, tt.end, inWeek);

    let h = '<div class="bk-pc-main" data-start-h="' + start + '">';
    h += '<div class="bk-week__header"><div class="bk-week__h-cell"></div>';
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws); d.setDate(ws.getDate() + i);
      const cls = 'bk-week__h-cell' + (d.getTime() === today.getTime() ? ' is-today' : '');
      h += '<div class="' + cls + '">';
      h += '<div class="bk-week__h-dow">' + DOW[d.getDay()] + '</div>';
      h += '<div class="bk-week__h-num">' + d.getDate() + '</div></div>';
    }
    h += '</div>';

    h += '<div class="bk-week__grid" id="bk-week-grid">';
    h += '<div class="bk-week__time-col">';
    for (let hr = start; hr < end; hr++) {
      h += '<div class="bk-week__time-cell">' + _pad(hr) + ':00</div>';
    }
    h += '</div>';
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws); d.setDate(ws.getDate() + i);
      const ymd = _ds(d);
      h += '<div class="bk-week__day" data-date="' + ymd + '">';
      for (let hr = start; hr < end; hr++) {
        h += '<div class="bk-week__hour" data-hour="' + hr + '" data-date="' + ymd + '"></div>';
      }
      h += '</div>';
    }
    h += '<div class="bk-week__now-line" style="display:none"></div>';
    h += '</div></div>';
    return { html: h, items: filtered, start, ws };
  }

  function _placeWeekPCBlocks(grid, items, startH, weekStart) {
    if (!grid) return;
    // [PERF P3-2] DOM 쿼리 1회 캐싱 + DocumentFragment 배치 삽입
    const dayColMap = new Map();
    grid.querySelectorAll('.bk-week__day').forEach(col => {
      if (col.dataset.date) dayColMap.set(col.dataset.date, col);
    });
    const fragments = new Map();
    items.forEach(it => {
      const s = new Date(it._raw.starts_at);
      const e = new Date(it._raw.ends_at);
      const dayCol = dayColMap.get(_ds(s));
      if (!dayCol) return;
      const top = (s.getHours() - startH) * HOUR_PX_PC_WEEK + (s.getMinutes() / 60) * HOUR_PX_PC_WEEK;
      const height = Math.max(30, ((e - s) / 60000 / 60) * HOUR_PX_PC_WEEK);
      const s2 = it.staff_idx >= 1 ? ' is-staff2' : '';
      const block = document.createElement('button');
      block.className = 'bk-week__block' + s2;
      block.dataset.bookingId = it.id;
      block.style.top = top + 'px';
      block.style.height = height + 'px';
      block.innerHTML = '<div class="bk-week__block-title">' + _esc(it.cust) + '</div>'
        + '<div class="bk-week__block-sub">' + _fmt(s) + ' · ' + _esc(it.svc || '') + '</div>';
      if (!fragments.has(dayCol)) fragments.set(dayCol, document.createDocumentFragment());
      fragments.get(dayCol).appendChild(block);
    });
    fragments.forEach((frag, col) => col.appendChild(frag));
  }

  // ============================================================
  // §10 PC — 일간 뷰 (직원 컬럼 분할)
  // ============================================================
  function _renderDayPC(date, mapped) {
    const tt = _ttHours();
    const dayDS = _ds(date);
    const filtered = _filterByStaff(mapped).filter(m => _ds(new Date(m._raw.starts_at)) === dayDS);
    const { start, end } = _expandHoursForItems(tt.start, tt.end, filtered);
    const staff = _staffList.length ? _staffList : [{ id: 1, name: '원장', color_idx: 0 }];

    // grid columns 동적 계산 (CSS 기본 3 컬럼 - 필요 시 inline style)
    let h = '<div class="bk-pc-day" data-start-h="' + start + '">';
    const colCount = staff.length;
    const headerCols = `80px repeat(${colCount}, 1fr)`;
    h += `<div class="bk-pc-day__header" style="grid-template-columns:${headerCols}">`;
    h += '<div class="bk-pc-day__h-cell"></div>';
    staff.forEach((sf, idx) => {
      const dotCls = idx === 0 ? 'bk-staff-dot--pink' : (idx === 1 ? 'bk-staff-dot--gray' : 'bk-staff-dot--dark');
      const cnt = filtered.filter(it => it.staff_idx === idx).length;
      const rev = filtered.filter(it => it.staff_idx === idx).reduce((s, it) => s + (it.amount || 0), 0);
      const meta = cnt + '건' + (rev ? ' · 매출 ' + _krwShort(rev) : '');
      h += '<div class="bk-pc-day__h-cell">';
      h += '<div class="bk-pc-day__h-staff-name"><span class="bk-staff-dot ' + dotCls + '"></span>' + _esc(sf.name) + '</div>';
      h += '<div class="bk-pc-day__h-meta">' + meta + '</div></div>';
    });
    h += '</div>';

    h += `<div class="bk-pc-day__grid" id="bk-pc-day-grid" style="grid-template-columns:${headerCols}">`;
    h += '<div class="bk-pc-day__time-col">';
    for (let hr = start; hr < end; hr++) {
      h += '<div class="bk-pc-day__time-cell">' + _pad(hr) + ':00</div>';
    }
    h += '</div>';
    staff.forEach((sf, idx) => {
      h += '<div class="bk-pc-day__staff-col" data-staff-idx="' + idx + '" data-staff-id="' + (sf.id || '') + '">';
      for (let hr = start; hr < end; hr++) {
        h += '<div class="bk-pc-day__hour" data-hour="' + hr + '" data-date="' + dayDS + '"></div>';
      }
      h += '</div>';
    });
    h += '<div class="bk-pc-day__now-line" style="display:none"></div>';
    h += '</div></div>';
    return { html: h, items: filtered, start, staff };
  }

  function _placeDayPCBlocks(grid, items, startH) {
    if (!grid) return;
    items.forEach(it => {
      const s = new Date(it._raw.starts_at);
      const e = new Date(it._raw.ends_at);
      const col = grid.querySelector(`.bk-pc-day__staff-col[data-staff-idx="${it.staff_idx || 0}"]`);
      if (!col) return;
      const top = (s.getHours() - startH) * HOUR_PX_PC_DAY + (s.getMinutes() / 60) * HOUR_PX_PC_DAY;
      const height = Math.max(40, ((e - s) / 60000 / 60) * HOUR_PX_PC_DAY);
      const s2 = it.staff_idx >= 1 ? ' is-staff2' : '';
      const block = document.createElement('button');
      block.className = 'bk-pc-day__block' + s2;
      block.dataset.bookingId = it.id;
      block.style.top = top + 'px';
      block.style.height = height + 'px';
      const priceStr = it.amount ? ' · ' + _krwShort(it.amount) : '';
      block.innerHTML = '<div class="bk-pc-day__block-title">' + _esc(it.cust) + '</div>'
        + '<div class="bk-pc-day__block-time">' + _fmt(s) + ' ~ ' + _fmt(e) + '</div>'
        + (it.svc ? '<div class="bk-pc-day__block-service">' + _esc(it.svc) + priceStr + '</div>' : '');
      col.appendChild(block);
    });
  }

  // ============================================================
  // §11 영업시간
  // ============================================================
  function _ttHours() {
    const h = window.Booking?.shopHours ? window.Booking.shopHours() : { start: 10, end: 22, slotMin: 30 };
    const start = Math.max(0, Math.min(23, h.start ?? 10));
    const end   = Math.max(start + 1, Math.min(24, h.end ?? 22));
    return { start, end };
  }
  // 영업시간 밖에 예약이 있으면 그리드 범위를 확장 (위/아래 잘림 방지)
  function _expandHoursForItems(start, end, items) {
    let s = start, e = end;
    if (!items || !items.length) return { start: s, end: e };
    for (const it of items) {
      const sd = new Date(it._raw.starts_at);
      const ed = new Date(it._raw.ends_at);
      if (isNaN(sd) || isNaN(ed)) continue;
      const sh = sd.getHours();
      const eh = ed.getHours() + (ed.getMinutes() > 0 ? 1 : 0);
      if (sh < s) s = Math.max(0, sh);
      if (eh > e) e = Math.min(24, eh);
    }
    return { start: s, end: e };
  }

  // ============================================================
  // §12 now-line
  // ============================================================
  function _placeNowLine() {
    const o = _overlay(); if (!o) return;
    // 그리드가 expand 된 경우 data-start-h 우선 (없으면 _ttHours fallback)
    const rootSel = (_curView === 'day' && !_cachedIsPC) ? '.bk-day'
                   : (_curView === 'day' && _cachedIsPC) ? '.bk-pc-day'
                   : (_curView === 'week' && _cachedIsPC) ? '.bk-pc-main'
                   : '.bk-week-m';
    const root = o.querySelector(rootSel);
    const dataStart = root ? parseInt(root.getAttribute('data-start-h') || '', 10) : NaN;
    const start = Number.isFinite(dataStart) ? dataStart : _ttHours().start;
    const now = new Date();
    if (now.getHours() < start) return _hideNowLine();
    const minutesFromStart = (now.getHours() - start) * 60 + now.getMinutes();
    if (_curView === 'day' && !_cachedIsPC) {
      const px = (minutesFromStart / 60) * HOUR_PX_MOBILE_DAY;
      const ln = o.querySelector('.bk-now-line');
      if (ln) { ln.style.top = px + 'px'; ln.style.display = ''; }
    } else if (_curView === 'week' && _cachedIsPC) {
      const px = (minutesFromStart / 60) * HOUR_PX_PC_WEEK;
      const ln = o.querySelector('.bk-week__now-line');
      if (ln) { ln.style.top = px + 'px'; ln.style.display = ''; }
    } else if (_curView === 'day' && _cachedIsPC) {
      const px = (minutesFromStart / 60) * HOUR_PX_PC_DAY;
      const ln = o.querySelector('.bk-pc-day__now-line');
      if (ln) { ln.style.top = px + 'px'; ln.style.display = ''; }
    }
  }
  function _hideNowLine() {
    const o = _overlay(); if (!o) return;
    o.querySelectorAll('.bk-now-line, .bk-week__now-line, .bk-pc-day__now-line').forEach(ln => { ln.style.display = 'none'; });
  }

  // ============================================================
  // §13 PC 좌측 패널 — 미니 캘린더 + 직원 + 통계
  // ============================================================
  function _renderMiniCal() {
    if (!_miniMonth) _miniMonth = { y: _curYear, m: _curMonth };
    const { y, m } = _miniMonth;
    const firstDow = new Date(y, m - 1, 1).getDay();
    const lastDate = new Date(y, m, 0).getDate();
    const prevLast = new Date(y, m - 1, 0).getDate();
    const today = new Date();
    const todayDS = _ds(today);
    const selDS = _ds(_curDate);
    const filtered = _filterByStaff(_mappedCache);
    const eventDays = new Set();
    filtered.forEach(it => {
      const sd = new Date(it._raw.starts_at);
      if (sd.getFullYear() === y && sd.getMonth() + 1 === m) eventDays.add(sd.getDate());
    });

    let h = '<div class="bk-mini">';
    h += '<div class="bk-mini__head">';
    h += '<div class="bk-mini__month">' + y + '년 ' + m + '월</div>';
    h += '<div class="bk-mini__nav">';
    h += '<button data-mini-nav="prev" aria-label="이전">‹</button>';
    h += '<button data-mini-nav="next" aria-label="다음">›</button>';
    h += '</div></div>';
    h += '<div class="bk-mini__grid">';
    ['일','월','화','수','목','금','토'].forEach(d => { h += '<div class="bk-mini__dow">' + d + '</div>'; });
    for (let i = 0; i < firstDow; i++) {
      h += '<div class="bk-mini__day bk-mini__day--other">' + (prevLast - firstDow + 1 + i) + '</div>';
    }
    for (let d = 1; d <= lastDate; d++) {
      const ds = y + '-' + _pad(m) + '-' + _pad(d);
      let cls = 'bk-mini__day';
      if (ds === todayDS) cls += ' bk-mini__day--today';
      if (ds === selDS) cls += ' bk-mini__day--selected';
      if (eventDays.has(d)) cls += ' has-event';
      h += '<div class="' + cls + '" data-mini-day="' + ds + '">' + d + '</div>';
    }
    const rem = (firstDow + lastDate) % 7;
    if (rem > 0) {
      for (let i = 1; i <= 7 - rem; i++) {
        h += '<div class="bk-mini__day bk-mini__day--other">' + i + '</div>';
      }
    }
    h += '</div></div>';
    return h;
  }

  function _renderStaffList() {
    if (!_staffList.length) return '';
    const filtered = _filterByStaff(_mappedCache);
    let h = '<div class="bk-staff-list">';
    h += '<div class="bk-staff-list__title">직원 필터</div>';
    _staffList.forEach((sf, idx) => {
      const isOn = !_activeStaffIds || _activeStaffIds.has(sf.id);
      const dotCls = idx === 0 ? 'bk-staff-dot--pink' : (idx === 1 ? 'bk-staff-dot--gray' : 'bk-staff-dot--dark');
      const cnt = filtered.filter(it => String(it.staff_id || '') === String(sf.id || '')).length;
      h += '<button class="bk-staff-row" data-staff-toggle="' + sf.id + '">';
      h += '<span class="bk-staff-row__check' + (isOn ? ' is-on' : '') + '">' + (isOn ? '✓' : '') + '</span>';
      h += '<span class="bk-staff-dot ' + dotCls + '"></span>';
      h += '<span class="bk-staff-row__name">' + _esc(sf.name) + '</span>';
      h += '<span class="bk-staff-row__count">' + cnt + '</span>';
      h += '</button>';
    });
    h += '</div>';
    return h;
  }

  function _renderStats() {
    const stats = _calcStats(_filterByStaff(_mappedCache));
    let h = '<div class="bk-stats">';
    h += '<div class="bk-stats__row"><div class="bk-stats__label">오늘 예약</div><div class="bk-stats__value">' + stats.todayCnt + '건</div></div>';
    h += '<div class="bk-stats__row"><div class="bk-stats__label">완료</div><div class="bk-stats__value" style="color:var(--success,#10A56B)">' + stats.todayDone + '건</div></div>';
    h += '<div class="bk-stats__row"><div class="bk-stats__label">대기</div><div class="bk-stats__value">' + stats.todayWait + '건</div></div>';
    h += '<div class="bk-stats__row"><div class="bk-stats__label">이번주</div><div class="bk-stats__value">' + stats.weekCnt + '건</div></div>';
    h += '<div class="bk-stats__row"><div class="bk-stats__label">예상 매출</div><div class="bk-stats__value">' + (stats.estRevenue ? _krwShort(stats.estRevenue) : '-') + '</div></div>';
    h += '</div>';
    return h;
  }

  function _renderPCLeft() {
    return _renderMiniCal() + _renderStaffList() + _renderStats();
  }

  // ============================================================
  // §14 툴바 (직원 칩 + 뷰 토글) — 모바일/PC 공용
  // ============================================================
  function _renderToolbar() {
    let h = '<div class="bk-toolbar">';
    h += '<div class="bk-staff-chips">';
    const allOn = !_activeStaffIds;
    h += '<button class="bk-staff-chip' + (allOn ? ' is-on' : '') + '" data-staff-toggle="__all">전체</button>';
    _staffList.forEach((sf, idx) => {
      const isOn = !allOn && _activeStaffIds.has(sf.id);
      const dotCls = idx === 0 ? 'bk-staff-dot--pink' : (idx === 1 ? 'bk-staff-dot--gray' : 'bk-staff-dot--dark');
      h += '<button class="bk-staff-chip' + (isOn ? ' is-on' : '') + '" data-staff-toggle="' + sf.id + '">';
      h += '<span class="bk-staff-dot ' + dotCls + '"></span>' + _esc(sf.name) + '</button>';
    });
    h += '</div>';
    h += '<div class="bk-view">';
    ['month','week','day'].forEach(v => {
      const lbl = { month: '월', week: '주', day: '일' }[v];
      h += '<button class="bk-view__btn' + (v === _curView ? ' is-on' : '') + '" data-view="' + v + '">' + lbl + '</button>';
    });
    h += '</div></div>';
    return h;
  }

  // ============================================================
  // §15 모바일 진입 — 시트 오버레이
  // ============================================================
  function _renderMobileLayout() {
    const summ = _monthSummary(_mappedCache);
    const subTxt = '예약 ' + summ.cnt + '건' + (summ.rev ? ' · 매출 ' + _krwShort(summ.rev) : '');
    const o = document.createElement('div');
    o.id = OVERLAY_ID;
    o.className = 'bk-root bk-root--mobile';
    o.setAttribute('role', 'dialog');
    o.setAttribute('aria-modal', 'true');
    // [2026-05-02 hotfix] inline 풀스크린 강제 — CSS 의존 없이 항상 팝업 형태 유지
    o.style.cssText = 'position:fixed;inset:0;z-index:9988;background:var(--surface,#fff);display:flex;flex-direction:column;overflow:hidden;';
    o.innerHTML = `
      <div class="cal-sheet" style="display:flex;flex-direction:column;height:100%;">
        <div class="bk-header">
          <button class="bk-header__back" id="bk-back" aria-label="닫기">
            <i class="ph-duotone ph-caret-left" style="font-size:14px" aria-hidden="true"></i>
          </button>
          <div class="bk-header__title-wrap">
            <div class="bk-header__month" id="bk-month-label">${_curYear}년 ${_curMonth}월</div>
            <div class="bk-header__sub" id="bk-month-sub">${subTxt}</div>
            <span id="cal-offline-badge" style="display:none;font-size:10px;font-weight:700;color:var(--danger);background:rgba(220,53,69,.1);padding:2px 8px;border-radius:999px;margin-left:6px;">오프라인</span>
          </div>
          <button class="bk-today-btn" id="bk-today-btn">오늘</button>
        </div>
        <div id="bk-toolbar-mount">${_renderToolbar()}</div>
        <div class="cal-body bk-body" id="bk-body" style="flex:1;display:flex;flex-direction:column;overflow:hidden;"></div>
        <button class="bk-fab" id="bk-fab" aria-label="예약 추가">
          <i class="ph-duotone ph-plus" style="font-size:22px" aria-hidden="true"></i>
        </button>
      </div>`;
    o.addEventListener('click', e => { if (e.target === o) _close(); });
    document.body.appendChild(o);
    _bindHeader(o);
    _bindToolbar(o);
    _bindEscClose();
    _renderViewBody();
  }

  // ============================================================
  // §16 PC 진입 — myshop-v3 의 .ms-side 재사용
  // ============================================================
  function _buildPCHeaderHTML(subTxt) {
    const viewBtns = ['month','week','day'].map(v => {
      const lbl = { month:'월', week:'주', day:'일' }[v];
      return '<button class="bk-view__btn' + (v === _curView ? ' is-on' : '') + '" data-view="' + v + '">' + lbl + '</button>';
    }).join('');
    return `
        <div class="bk-pc__header">
          <button class="bk-header__back" id="bk-back" aria-label="닫기" title="ESC 또는 클릭으로 닫기">
            <i class="ph-duotone ph-x" style="font-size:16px" aria-hidden="true"></i>
          </button>
          <div class="bk-pc__title">예약</div>
          <div class="bk-pc__month-nav">
            <button class="bk-pc__nav-btn" id="bk-pc-prev" aria-label="이전 달">
              <i class="ph-duotone ph-caret-left" style="font-size:14px" aria-hidden="true"></i>
            </button>
            <div class="bk-pc__month-label" id="bk-month-label">${_curYear}년 ${_curMonth}월</div>
            <button class="bk-pc__nav-btn" id="bk-pc-next" aria-label="다음 달">
              <i class="ph-duotone ph-caret-right" style="font-size:14px" aria-hidden="true"></i>
            </button>
          </div>
          <button class="bk-today-btn" id="bk-today-btn" style="margin-left:4px;">오늘</button>
          <div class="bk-pc__spacer"></div>
          <div class="bk-pc__stats" id="bk-pc-stats">${subTxt}</div>
          <div class="bk-view">${viewBtns}</div>
          <button class="bk-pc__add-btn" id="bk-pc-add">
            <i class="ph-duotone ph-plus" style="font-size:14px" aria-hidden="true"></i>예약 추가
          </button>
          <span id="cal-offline-badge" style="display:none;font-size:10px;font-weight:700;color:var(--danger);background:rgba(220,53,69,.1);padding:2px 8px;border-radius:999px;">오프라인</span>
        </div>`;
  }

  function _renderPCLayout() {
    const summ = _monthSummary(_mappedCache);
    const subTxt = '이번달 ' + summ.cnt + '건' + (summ.rev ? ' · 매출 ' + _krwShort(summ.rev) : '');
    const o = document.createElement('div');
    o.id = OVERLAY_ID;
    o.className = 'bk-root bk-root--pc';
    o.setAttribute('role', 'dialog');
    o.setAttribute('aria-modal', 'true');
    // [2026-05-02 hotfix] z-index 9988 통일 — DM 시트(9988/9989) 와 같은 레이어로 끌어올림
    o.style.cssText = 'position:fixed;inset:0;z-index:9988;background:var(--surface,#fff);display:flex;flex-direction:column;overflow:hidden;';
    document.body.classList.add('bk-pc-mode');
    o.innerHTML = `<div class="bk-pc">${_buildPCHeaderHTML(subTxt)}
        <div class="bk-pc__body">
          <div class="bk-pc__left" id="bk-pc-left">${_renderPCLeft()}</div>
          <div class="cal-body bk-body" id="bk-body" style="flex:1;display:flex;flex-direction:column;overflow:hidden;"></div>
        </div>
      </div>`;
    document.body.appendChild(o);
    _bindHeaderPC(o);
    _bindPCLeft(o);
    _bindEscClose();
    _renderViewBody();
  }

  // ============================================================
  // §17 헤더 바인딩
  // ============================================================
  function _bindHeader(o) {
    o.querySelector('#bk-back')?.addEventListener('click', _close);
    o.querySelector('#bk-today-btn')?.addEventListener('click', () => {
      _curDate = new Date();
      _curYear = _curDate.getFullYear();
      _curMonth = _curDate.getMonth() + 1;
      _miniMonth = { y: _curYear, m: _curMonth };
      _reloadAndRender();
    });
    o.querySelector('#bk-fab')?.addEventListener('click', () => {
      _curDate = new Date();
      _openForm(_curDate, null);
    });
  }
  function _bindHeaderPC(o) {
    o.querySelector('#bk-back')?.addEventListener('click', _close);
    o.querySelector('#bk-pc-prev')?.addEventListener('click', _prevMonth);
    o.querySelector('#bk-pc-next')?.addEventListener('click', _nextMonth);
    o.querySelector('#bk-today-btn')?.addEventListener('click', () => {
      _curDate = new Date();
      _curYear = _curDate.getFullYear();
      _curMonth = _curDate.getMonth() + 1;
      _miniMonth = { y: _curYear, m: _curMonth };
      _reloadAndRender();
    });
    o.querySelector('#bk-pc-add')?.addEventListener('click', () => {
      _openForm(new Date(), null);
    });
    // 뷰 토글 (PC 헤더 내부)
    o.querySelectorAll('.bk-pc__header .bk-view__btn').forEach(btn => {
      btn.addEventListener('click', () => _switchView(btn.dataset.view));
    });
  }

  function _bindToolbar(o) {
    // 직원 칩
    o.querySelectorAll('[data-staff-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.staffToggle;
        if (v === '__all') {
          _activeStaffIds = null;
        } else {
          if (!_activeStaffIds) _activeStaffIds = new Set(_staffList.map(s => s.id));
          const id = isNaN(+v) ? v : +v;
          if (_activeStaffIds.has(id)) _activeStaffIds.delete(id);
          else _activeStaffIds.add(id);
          if (_activeStaffIds.size === 0) _activeStaffIds = null;
        }
        // 툴바 다시 그리기 + 뷰 본문 다시 그리기
        const mount = o.querySelector('#bk-toolbar-mount');
        if (mount) { mount.innerHTML = _renderToolbar(); _bindToolbar(o); }
        _renderViewBody();
      });
    });
    // 뷰 토글
    o.querySelectorAll('.bk-toolbar .bk-view__btn').forEach(btn => {
      btn.addEventListener('click', () => _switchView(btn.dataset.view));
    });
  }

  function _bindPCLeft(o) {
    const left = o.querySelector('#bk-pc-left'); if (!left) return;
    // 미니 캘린더 nav
    left.querySelectorAll('[data-mini-nav]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!_miniMonth) _miniMonth = { y: _curYear, m: _curMonth };
        if (btn.dataset.miniNav === 'prev') {
          _miniMonth.m--; if (_miniMonth.m < 1) { _miniMonth.m = 12; _miniMonth.y--; }
        } else {
          _miniMonth.m++; if (_miniMonth.m > 12) { _miniMonth.m = 1; _miniMonth.y++; }
        }
        _refreshPCLeft();
      });
    });
    // 미니 캘린더 day 클릭
    left.querySelectorAll('[data-mini-day]').forEach(el => {
      el.addEventListener('click', () => {
        const ds = el.getAttribute('data-mini-day');
        _curDate = new Date(ds + 'T00:00:00');
        const y = _curDate.getFullYear(), m = _curDate.getMonth() + 1;
        if (y !== _curYear || m !== _curMonth) {
          _curYear = y; _curMonth = m;
          _reloadAndRender();
        } else {
          if (_curView === 'month') _switchView('day');
          else _renderViewBody();
        }
      });
    });
    // 직원 토글 (좌측 리스트)
    left.querySelectorAll('[data-staff-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.staffToggle;
        const idVal = isNaN(+id) ? id : +id;
        if (!_activeStaffIds) _activeStaffIds = new Set(_staffList.map(s => s.id));
        if (_activeStaffIds.has(idVal)) _activeStaffIds.delete(idVal);
        else _activeStaffIds.add(idVal);
        if (_activeStaffIds.size === 0) _activeStaffIds = null;
        _refreshPCLeft();
        _renderViewBody();
      });
    });
  }

  function _refreshPCLeft() {
    const o = _overlay(); if (!o) return;
    const left = o.querySelector('#bk-pc-left');
    if (left) {
      left.innerHTML = _renderPCLeft();
      _bindPCLeft(o);
    }
  }

  // ============================================================
  // §18 뷰 본문 렌더링 (월/주/일)
  // ============================================================
  function _renderViewBody() {
    const o = _overlay(); if (!o) return;
    const body = o.querySelector('#bk-body'); if (!body) return;
    _updateOfflineBadge();
    _updateHeaderLabel();
    _hideNowLine();
    _saveState();

    if (_curView === 'month') {
      const html = _cachedIsPC ? _renderMonthPC(_curYear, _curMonth, _mappedCache)
                               : _renderMonthMobile(_curYear, _curMonth, _mappedCache);
      body.innerHTML = html;
      _bindMonthCells(body);
    } else if (_curView === 'week') {
      _renderWeekView(body);
    } else {
      _renderDayView(body);
    }
    _refreshPCLeft();
    _placeNowLine();
  }

  function _renderWeekView(body) {
    if (_cachedIsPC) {
      const r = _renderWeekPC(_curDate, _mappedCache);
      body.innerHTML = r.html;
      const grid = body.querySelector('#bk-week-grid');
      _placeWeekPCBlocks(grid, r.items, r.start, r.ws);
      _bindTimetable(body, _curDate);
    } else {
      // 모바일 주간 — date strip + week grid
      const strip = _renderDateStripMobile(_curDate, _mappedCache);
      const r = _renderWeekMobile(_curDate, _mappedCache);
      body.innerHTML = strip + r.html;
      const grid = body.querySelector('#bk-week-m-grid');
      _placeWeekMBlocks(grid, r.items, r.start, r.ws);
      _bindDateStrip(body);
      _bindTimetable(body, _curDate);
    }
  }

  function _renderDayView(body) {
    if (_cachedIsPC) {
      const r = _renderDayPC(_curDate, _mappedCache);
      body.innerHTML = r.html;
      const grid = body.querySelector('#bk-pc-day-grid');
      _placeDayPCBlocks(grid, r.items, r.start);
      _bindTimetable(body, _curDate);
    } else {
      const strip = _renderDateStripMobile(_curDate, _mappedCache);
      const r = _renderDayMobile(_curDate, _mappedCache);
      body.innerHTML = strip + r.html;
      const grid = body.querySelector('#bk-day-grid');
      _placeDayBlocks(grid, r.items, r.start);
      _bindDateStrip(body);
      _bindTimetable(body, _curDate);
      // 활성 chip 가운데로
      setTimeout(() => {
        const active = body.querySelector('.bk-date.is-on');
        if (active) active.scrollIntoView({ inline: 'center', behavior: 'smooth' });
      }, 50);
    }
  }

  function _bindMonthCells(_body) { /* onclick=_calSelectDay 위임 사용 */ }

  function _bindDateStrip(body) {
    body.querySelectorAll('.bk-date').forEach(btn => {
      // 이미 onclick 바인딩됨 (위임)
      void btn;
    });
  }

  function _updateHeaderLabel() {
    const o = _overlay(); if (!o) return;
    const lbl = o.querySelector('#bk-month-label');
    if (!lbl) return;
    if (_curView === 'week') {
      const ws = new Date(_curDate); ws.setHours(0,0,0,0);
      ws.setDate(ws.getDate() - ws.getDay());
      lbl.textContent = (ws.getMonth() + 1) + '월 ' + ws.getDate() + '일 주';
    } else if (_curView === 'day') {
      lbl.textContent = _curDate.getFullYear() + '년 ' + (_curDate.getMonth() + 1) + '월 ' + _curDate.getDate() + '일';
    } else {
      lbl.textContent = _curYear + '년 ' + _curMonth + '월';
    }
    const sub = o.querySelector('#bk-month-sub');
    if (sub) {
      const summ = _monthSummary(_filterByStaff(_mappedCache));
      sub.textContent = '예약 ' + summ.cnt + '건' + (summ.rev ? ' · 매출 ' + _krwShort(summ.rev) : '');
    }
    const pcStats = o.querySelector('#bk-pc-stats');
    if (pcStats) {
      const summ = _monthSummary(_filterByStaff(_mappedCache));
      pcStats.innerHTML = '<div>이번달 <b>' + summ.cnt + '건</b></div>' + (summ.rev ? '<div>매출 <b>' + _krwShort(summ.rev) + '</b></div>' : '');
    }
  }

  function _updateOfflineBadge() {
    const b = document.querySelector('#' + OVERLAY_ID + ' #cal-offline-badge');
    if (b) b.style.display = window.Booking?.isOffline ? 'inline' : 'none';
  }

  // ============================================================
  // §19 시간표 바인딩 (long-press drag-drop + 빈 슬롯 클릭)
  // ============================================================
  function _bindTimetable(body, date) {
    const LONG_PRESS_MS = 300;
    const HOUR_PX = _cachedIsPC
      ? (_curView === 'week' ? HOUR_PX_PC_WEEK : HOUR_PX_PC_DAY)
      : (_curView === 'week' ? HOUR_PX_MOBILE_WEEK : HOUR_PX_MOBILE_DAY);
    const blockSel = '.bk-block, .bk-week__block, .bk-pc-day__block, .bk-week-m__block';

    body.querySelectorAll(blockSel).forEach(btn => {
      _bindBlockDragDrop(btn, body, HOUR_PX, LONG_PRESS_MS);
    });

    // 빈 슬롯 클릭 → 새 예약 (시작시간 prefill)
    const slotSel = '.bk-day__slot-half, .bk-day__hour-content, .bk-week__hour, .bk-pc-day__hour, .bk-week-m__hour';
    body.querySelectorAll(slotSel).forEach(slot => {
      slot.addEventListener('click', e => {
        // 자식 block 클릭 무시
        if (e.target.closest(blockSel)) return;
        const dayCol = slot.closest('[data-date]') || slot;
        const ymd = dayCol?.getAttribute('data-date') || _ds(date || _curDate);
        const hr = parseInt(slot.getAttribute('data-hour'), 10);
        if (isNaN(hr)) return;
        const min = parseInt(slot.getAttribute('data-min') || '0', 10);
        const startD = new Date(ymd + 'T00:00:00');
        startD.setHours(hr, min, 0, 0);
        window._pendingBookingSlot = {
          starts_at: `${ymd}T${_pad(hr)}:${_pad(min)}:00+09:00`,
          ends_at:   `${ymd}T${_pad(hr + 1)}:${_pad(min)}:00+09:00`,
        };
        _openForm(startD, null);
      });
    });
  }

  // drag-drop helper — drag mode 진입
  function _enterDragMode(btn, e) {
    btn.style.zIndex = '1000';
    btn.style.boxShadow = '0 8px 24px rgba(0,0,0,0.25)';
    btn.style.opacity = '0.9';
    btn.style.transform = 'scale(1.04)';
    if (window.navigator.vibrate) window.navigator.vibrate(15);
    if (typeof window.hapticMedium === 'function') window.hapticMedium();
    try { btn.setPointerCapture(e.pointerId); } catch (_e) { void _e; }
  }

  // drag-drop helper — slot 충돌 검사 + 드롭 타겟 표시
  function _detectDropTarget(body, e, bookingItem) {
    body.querySelectorAll('.cv-drop-target, .cv-drop-conflict').forEach(s => s.classList.remove('cv-drop-target', 'cv-drop-conflict'));
    const elBelow = document.elementFromPoint(e.clientX, e.clientY);
    const slotEl = elBelow?.closest('.bk-day__slot-half, .bk-week__hour, .bk-pc-day__hour, .bk-week-m__hour');
    if (!slotEl || !bookingItem) return null;
    const colEl = slotEl.closest('[data-date]');
    const ymd = colEl?.getAttribute('data-date');
    const hr = parseInt(slotEl.getAttribute('data-hour'), 10);
    if (!ymd || isNaN(hr)) return null;
    const newStart = new Date(`${ymd}T${_pad(hr)}:00:00+09:00`);
    const oS = new Date(bookingItem._raw.starts_at), oE = new Date(bookingItem._raw.ends_at);
    const durMin = Math.round((oE - oS) / 60000);
    const newEnd = new Date(newStart.getTime() + durMin * 60000);
    const conflict = window.Booking?.hasConflict?.(newStart.toISOString(), newEnd.toISOString(), bookingItem.id);
    slotEl.classList.add(conflict ? 'cv-drop-conflict' : 'cv-drop-target');
    return { ymd, hr, conflict, newStart, newEnd };
  }

  // drag-drop helper — drop 후 PATCH 저장
  async function _commitDragDrop(dropped, bookingItem) {
    if (!dropped || dropped.conflict || !bookingItem) {
      if (dropped?.conflict && window.showToast) window.showToast('이 시간엔 다른 예약이 있어요');
      return;
    }
    try {
      await window.Booking.update(bookingItem.id, {
        starts_at: dropped.newStart.toISOString().replace(/\.\d{3}Z$/, '+00:00'),
        ends_at:   dropped.newEnd.toISOString().replace(/\.\d{3}Z$/, '+00:00'),
      });
      if (window.showToast) window.showToast(`${dropped.hr}:00 으로 이동`);
      if (typeof window.hapticLight === 'function') window.hapticLight();
      window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'update_booking' } }));
    } catch (err) {
      if (window.showToast) window.showToast('이동 실패: ' + (err?.message || ''));
    }
  }

  function _bindBlockDragDrop(btn, body, _HOUR_PX, LONG_PRESS_MS) {
    const ctx = { pressTimer: null, dragMode: false, startY: 0, startX: 0, dragColEl: null, item: null };
    const cleanup = () => {
      clearTimeout(ctx.pressTimer); ctx.pressTimer = null;
      if (ctx.dragMode) {
        btn.style.cssText = btn.style.cssText.replace(/transform:[^;]*;?|z-index:[^;]*;?|box-shadow:[^;]*;?|opacity:[^;]*;?/g, '');
        body.querySelectorAll('.cv-drop-target, .cv-drop-conflict').forEach(s => s.classList.remove('cv-drop-target', 'cv-drop-conflict'));
      }
      ctx.dragMode = false;
    };
    btn.addEventListener('pointerdown', e => {
      if (e.button !== 0 && e.pointerType !== 'touch') return;
      ctx.startY = e.clientY; ctx.startX = e.clientX;
      ctx.item = _mappedCache.find(m => m.id === btn.dataset.bookingId);
      ctx.pressTimer = setTimeout(() => {
        if (!ctx.item) return;
        ctx.dragMode = true; _enterDragMode(btn, e);
      }, LONG_PRESS_MS);
    });
    btn.addEventListener('pointermove', e => {
      if (!ctx.dragMode) {
        if (Math.abs(e.clientY - ctx.startY) > 10 || Math.abs(e.clientX - ctx.startX) > 10) clearTimeout(ctx.pressTimer);
        return;
      }
      e.preventDefault();
      btn.style.transform = `translateY(${e.clientY - ctx.startY}px) scale(1.04)`;
      ctx.dragColEl = _detectDropTarget(body, e, ctx.item);
    });
    btn.addEventListener('pointerup', async e => {
      if (!ctx.dragMode) {
        clearTimeout(ctx.pressTimer); e.stopPropagation();
        if (ctx.item) _openForm(new Date(ctx.item._raw.starts_at), ctx.item._raw);
        return;
      }
      e.preventDefault();
      const dropped = ctx.dragColEl;
      cleanup();
      await _commitDragDrop(dropped, ctx.item);
    });
    btn.addEventListener('pointercancel', cleanup);
    btn.style.touchAction = 'none';
  }

  // ============================================================
  // §20 예약 폼 (기존 로직 그대로)
  // ============================================================
  function _buildSlots(hours) {
    const slots = [];
    for (let h = hours.start; h < hours.end; h++)
      for (let m = 0; m < 60; m += hours.slotMin)
        slots.push(_pad(h) + ':' + _pad(m));
    return slots;
  }

  function _buildFormHTML(existing, slots, dateStr, defStart, defEnd, autoSlot) {
    const isEdit = !!existing;
    // 시/분 파싱
    const [defH, defM] = defStart.split(':').map(Number);
    const [endH, endM] = defEnd.split(':').map(Number);
    const durMin = ((endH * 60 + endM) - (defH * 60 + defM)) || 60;
    // 날짜 파싱
    const dd = new Date(dateStr + 'T00:00:00');
    const DOW = ['일','월','화','수','목','금','토'];
    const dateLabel = (dd.getMonth()+1) + '월 ' + dd.getDate() + '일 ' + DOW[dd.getDay()] + '요일';
    const todayLabel = _ds(new Date()) === dateStr ? '오늘' : DOW[dd.getDay()] + '요일';
    const dayCnt = (_mappedCache || []).filter(it => _ds(new Date(it.starts_at)) === dateStr && it.status !== 'cancelled' && it.status !== 'no_show').length;
    // 휠 행 생성 (시: 0~23, 분: 0/15/30/45)
    // 휠 행 생성 (시: 0~23 전체, 분: 0/15/30/45 전체)
    const hRows = (cur) => {
      let h = ''; for (let i = 0; i < 24; i++) {
        h += `<div class="bf-tp-row${i === cur ? ' current' : ''}" data-val="${i}">${_pad(i)}</div>`;
      } return h;
    };
    const mRows = (cur) => {
      const ms = [0,15,30,45];
      let h = ''; ms.forEach(v => {
        h += `<div class="bf-tp-row${v === cur ? ' current' : ''}" data-val="${v}">${_pad(v)}</div>`;
      }); return h;
    };
    const endTimeLabel = _pad(endH) + ':' + _pad(endM);

    let html = `<button class="cv-form-back" id="cv-form-back">← 뒤로</button>`;
    if (!isEdit && autoSlot) {
      html += `<div class="bf-auto-banner">
        <i class="ph-duotone ph-sparkle" style="font-size:11px" aria-hidden="true"></i>
        빈 슬롯 ${defStart} 자동 선택 · 고객만 고르면 끝
      </div>`;
    }
    // 수정 모드 — 시술 완료 액션 카드
    if (isEdit && existing.status !== 'completed') {
      html += `<button type="button" class="bf-complete-action" id="bfComplete">
        <div class="bf-ca-icon"><i class="ph-duotone ph-check" style="font-size:14px" aria-hidden="true"></i></div>
        <div style="flex:1"><div class="bf-ca-title">시술 완료 · 매출·후기 한 번에</div><div class="bf-ca-sub">금액 입력 + 캡션 만들기까지</div></div>
        <i class="ph-duotone ph-caret-right bf-ca-chev" style="font-size:14px" aria-hidden="true"></i>
      </button>`;
    }
    // 수정 모드 — 상태 4토글
    if (isEdit) {
      html += `<div class="bf-section"><div class="bf-label">상태</div><div class="bf-status-row">
        <button type="button" data-bf-status="confirmed" class="bf-status-btn${existing.status==='confirmed'?' on bf-st-confirmed':''}">확정</button>
        <button type="button" data-bf-status="completed" class="bf-status-btn${existing.status==='completed'?' on bf-st-completed':''}">완료</button>
        <button type="button" data-bf-status="no_show" class="bf-status-btn${existing.status==='no_show'?' on bf-st-noshow':''}">안 옴</button>
        <button type="button" data-bf-status="cancelled" class="bf-status-btn${existing.status==='cancelled'?' on bf-st-cancelled':''}">취소</button>
      </div></div>`;
    }
    // 날짜 카드
    html += `<div class="bf-section"><div class="bf-label">날짜</div>
      <button type="button" class="bf-date-card" id="bfDateCard">
        <div class="bf-date-icon"><i class="ph-duotone ph-calendar-dots" style="font-size:16px" aria-hidden="true"></i></div>
        <div style="flex:1"><div class="bf-date-text" id="bfDateLabel">${dateLabel}</div><div class="bf-date-meta" id="bfDateMeta">${todayLabel} · ${dayCnt}건 예약됨</div></div>
        <i class="ph-duotone ph-caret-right bf-date-chev" style="font-size:14px" aria-hidden="true"></i>
      </button>
      <input type="date" id="bfDate" class="bf-date-native" value="${dateStr}" />
    </div>`;
    // 시간 휠 픽커
    html += `<div class="bf-section"><div class="bf-label">시작 시간 <span style="color:var(--text-subtle);font-weight:500;text-transform:none;letter-spacing:0">· 위아래 스크롤</span></div>
      <div class="bf-time-picker"><div class="bf-tp-selection"></div>
        <div class="bf-tp-wheel" id="bfWheelH"><div class="bf-tp-inner">${hRows(defH)}</div></div>
        <div class="bf-tp-sep">:</div>
        <div class="bf-tp-wheel" id="bfWheelM"><div class="bf-tp-inner">${mRows(defM)}</div></div>
      </div>
      <div class="bf-duration-row">
        <div class="bf-dur-label">소요 시간</div>
        <div class="bf-dur-val" id="bfDurVal">${durMin}분 · ~ ${endTimeLabel}</div>
        <div class="bf-dur-stepper"><button type="button" id="bfDurMinus">−</button><button type="button" id="bfDurPlus">+</button></div>
      </div>
    </div>`;
    // 고객 카드
    html += `<div class="bf-section"><div class="bf-label">고객</div>
      <button type="button" class="bf-cust-card${existing?.customer_name ? '' : ' empty'}" id="bfCustCard">
        ${existing?.customer_name
          ? `<div class="bf-cust-avatar">${_esc((existing.customer_name||'')[0])}</div>
             <div class="bf-cust-info"><div class="bf-cust-name">${_esc(existing.customer_name)}</div><div class="bf-cust-meta" id="bfCustMeta"></div></div>
             <button type="button" class="bf-cust-clear" id="bfCustClear"><i class="ph-duotone ph-x" style="font-size:11px" aria-hidden="true"></i></button>`
          : `<div class="bf-cust-avatar empty">+</div><div class="bf-cust-info"><div class="bf-cust-empty-text">고객을 골라주세요</div></div>
             <i class="ph-duotone ph-caret-right bf-cust-chev" style="font-size:14px" aria-hidden="true"></i>`}
      </button>
      <input type="hidden" id="bfCustName" value="${_esc(existing?.customer_name || '')}" />
    </div>`;
    // 시술 칩
    html += `<div class="bf-section"><div class="bf-label">시술 <span style="color:var(--text-subtle);font-weight:500;text-transform:none;letter-spacing:0">· 자주 받은 순</span></div>
      <div class="bf-svc-chips" id="bfSvcChips"></div>
      <input type="hidden" id="bfSvc" value="${_esc(existing?.service_name || '')}" />
      <input id="bfSvcCustom" class="bf-svc-input" placeholder="시술명 직접 입력" style="display:none" maxlength="50" autocomplete="off" />
    </div>`;
    // 더보기 (직원 · 메모)
    html += `<div class="bf-section" id="bfMoreSection">
      <button type="button" class="bf-more-toggle" id="bfMoreToggle">
        <i class="ph-duotone ph-caret-down bf-more-icon" style="font-size:13px" aria-hidden="true"></i>
        더보기 (직원 · 메모)
      </button>
      <div class="bf-more-fields" id="bfMoreFields" style="display:none">
        <div class="bf-section" style="margin-bottom:14px"><div class="bf-label">담당 직원</div><div class="bf-staff-row" id="bfStaffRow"></div></div>
        <div><div class="bf-label">메모</div>
          <textarea class="bf-memo" id="bfMemo" placeholder="시술 메모 · 알러지 · 요청사항 등" maxlength="200">${_esc(existing?.memo || '')}</textarea>
          <div class="bf-memo-counter" id="bfMemoCounter">${(existing?.memo || '').length} / 200</div>
        </div>
      </div>
    </div>`;
    // 충돌 경고
    html += `<div id="bfConflict" class="dt-conflict">이 시간에 이미 예약이 있어요</div>`;
    // 하단 CTA
    html += `<div class="bf-cta">
      ${isEdit ? '<button type="button" id="bfDelete" class="bf-btn-danger">삭제</button>' : '<button type="button" id="cv-form-back2" class="bf-btn-secondary">취소</button>'}
      <button type="button" id="bfSave" class="bf-btn-primary">${isEdit ? '변경 저장' : '예약 저장'}</button>
    </div>`;
    return html;
  }

  function _bindFormExtras(body, existing) {
    let custId = existing?.customer_id || null;
    // 고객 dashboard → 예약잡기 진입: prefill 된 고객 정보 자동 적용.
    // _pendingBookingCustomer 는 1회용 — 소비 후 비움 (다음 새 예약은 빈 상태로).
    const _pendingCust = (!existing && window._pendingBookingCustomer) || null;
    if (_pendingCust && _pendingCust.id) {
      custId = _pendingCust.id;
      window._pendingBookingCustomer = null;
      const nameInput = body.querySelector('#bfCustName');
      if (nameInput) nameInput.value = _pendingCust.name || '';
    }
    let _durMin = 60;
    let _startH, _startM;
    // 현재 시작 시간 읽기
    function _readStart() {
      const hEl = body.querySelector('#bfWheelH .bf-tp-row.current');
      const mEl = body.querySelector('#bfWheelM .bf-tp-row.current');
      _startH = hEl ? parseInt(hEl.dataset.val, 10) : 14;
      _startM = mEl ? parseInt(mEl.dataset.val, 10) : 0;
    }
    _readStart();
    // 초기 소요시간 계산
    try {
      const dv = body.querySelector('#bfDurVal');
      if (dv) { const m = dv.textContent.match(/(\d+)분/); if (m) _durMin = parseInt(m[1], 10); }
    } catch (_) { /* ignore */ }

    // --- 날짜 카드 → native date picker ---
    const dateCard = body.querySelector('#bfDateCard');
    const dateInput = body.querySelector('#bfDate');
    if (dateCard && dateInput) {
      dateCard.addEventListener('click', () => dateInput.showPicker ? dateInput.showPicker() : dateInput.click());
      dateInput.addEventListener('change', () => {
        const d = new Date(dateInput.value + 'T00:00:00');
        const DOW2 = ['일','월','화','수','목','금','토'];
        const lbl = body.querySelector('#bfDateLabel');
        if (lbl) lbl.textContent = (d.getMonth()+1) + '월 ' + d.getDate() + '일 ' + DOW2[d.getDay()] + '요일';
        const meta = body.querySelector('#bfDateMeta');
        const cnt = (_mappedCache || []).filter(it => _ds(new Date(it.starts_at)) === dateInput.value && it.status !== 'cancelled' && it.status !== 'no_show').length;
        if (meta) meta.textContent = (_ds(new Date()) === dateInput.value ? '오늘' : DOW2[d.getDay()] + '요일') + ' · ' + cnt + '건 예약됨';
        _checkConflict();
      });
    }

    // --- 소요시간 스텝퍼 ---
    function _updateDur() {
      _readStart();
      const endMin = _startH * 60 + _startM + _durMin;
      const eh = Math.floor(endMin / 60) % 24, em = endMin % 60;
      const dv = body.querySelector('#bfDurVal');
      if (dv) dv.textContent = _durMin + '분 · ~ ' + _pad(eh) + ':' + _pad(em);
      _checkConflict();
    }
    body.querySelector('#bfDurMinus')?.addEventListener('click', () => { if (_durMin > 15) { _durMin -= 15; _updateDur(); } });
    body.querySelector('#bfDurPlus')?.addEventListener('click', () => { if (_durMin < 480) { _durMin += 15; _updateDur(); } });

    // --- 휠 스크롤 (click + wheel 마우스 + touch swipe 모두 지원) ---
    // 2026-05-01 ── 사용자 보고: '시간 입력 스크롤안됨'. wheel/swipe/click 모두 지원.
    // --- 휠 스크롤 (네이티브 scroll-snap 활용) ---
    // 2026-05-04 ── '뚝뚝 끊김' 보고 대응: 가상 휠 방식 버리고 네이티브 스냅으로 전면 교체
    body.querySelectorAll('.bf-tp-wheel').forEach(wheel => {
      const ROW_H = 28;

      const onScroll = () => {
        const top = wheel.scrollTop;
        const idx = Math.round(top / ROW_H);
        const rows = wheel.querySelectorAll('.bf-tp-row');
        rows.forEach((r, i) => r.classList.toggle('current', i === idx));
        _updateDur();
      };

      // 초기 위치 설정
      const curRow = wheel.querySelector('.bf-tp-row.current');
      if (curRow) {
        const rows = Array.from(wheel.querySelectorAll('.bf-tp-row'));
        const idx = rows.indexOf(curRow);
        // rAF를 써서 렌더링 직후에 스크롤 위치를 잡음
        requestAnimationFrame(() => { wheel.scrollTop = idx * ROW_H; });
      }

      let scrollTimer = null;
      wheel.addEventListener('scroll', () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(onScroll, 50); // 스크롤 멈추면 값 확정
      }, { passive: true });

      // 클릭 시 해당 위치로 부드럽게 이동
      wheel.addEventListener('click', e => {
        const row = e.target.closest('.bf-tp-row');
        if (!row) return;
        const rows = Array.from(wheel.querySelectorAll('.bf-tp-row'));
        const idx = rows.indexOf(row);
        wheel.scrollTo({ top: idx * ROW_H, behavior: 'smooth' });
      });
    });

    // --- 고객 카드 ---
    function _renderCustCard(picked) {
      const card = body.querySelector('#bfCustCard');
      if (!card) return;
      if (picked) {
        card.className = 'bf-cust-card';
        const visits = +picked.visit_count || 0;
        const bal = +picked.membership_balance || 0;
        const rawBirth = String(picked.birthday || '');
        const bm = rawBirth.match(/^(\d{1,2})[-/](\d{1,2})$/) || rawBirth.match(/^\d{4}-(\d{1,2})-(\d{1,2})/);
        const td = new Date();
        const isBirthday = bm && +bm[1] === td.getMonth() + 1 && +bm[2] === td.getDate();
        const meta = [
          visits ? '<b>방문 ' + visits + '회</b>' : '',
          bal ? '회원권 ' + (bal / 10000).toFixed(bal >= 100000 ? 0 : 1) + '만' : '',
          isBirthday ? '오늘 생일' : '',
        ].filter(Boolean).join(' · ');
        const badge = (picked.is_regular || visits >= 5) ? '<span class="bf-cust-badge">단골</span>' : '';
        // 2026-05-01 ── X 버튼의 SVG 에 pointer-events:none 으로 자식 클릭을 X 버튼에 위임
        card.innerHTML = `<div class="bf-cust-avatar">${_esc((picked.name || '?')[0])}</div>
          <div class="bf-cust-info"><div class="bf-cust-name">${_esc(picked.name || '')} ${badge}</div><div class="bf-cust-meta" id="bfCustMeta">${meta}</div></div>
          <button type="button" class="bf-cust-clear" id="bfCustClear" aria-label="고객 선택 해제"><i class="ph-duotone ph-x" style="font-size:11px" aria-hidden="true"></i></button>`;
        body.querySelector('#bfCustName').value = picked.name || '';
      } else {
        card.className = 'bf-cust-card empty';
        card.innerHTML = `<div class="bf-cust-avatar empty">+</div><div class="bf-cust-info"><div class="bf-cust-empty-text">고객을 골라주세요</div></div>
          <i class="ph-duotone ph-caret-right bf-cust-chev" style="font-size:14px" aria-hidden="true"></i>`;
      }
    }
    const _doPick = async () => {
      if (!window.Customer?.pick) { if (window.showToast) window.showToast('고객 모듈 로드 중…'); return; }
      const picked = await window.Customer.pick({ selectedId: custId });
      if (picked === null) return;
      custId = picked.id || null;
      _renderCustCard(picked.name ? picked : null);
    };
    // 2026-05-01 ── event delegation: 카드 click 시 X 버튼 안이면 clear, 아니면 picker 열기.
    // 이전엔 X 의 click listener 가 inline 으로 매번 다시 붙어서 재렌더 시 누락 케이스 발생.
    body.querySelector('#bfCustCard')?.addEventListener('click', e => {
      if (e.target.closest('#bfCustClear')) {
        e.preventDefault(); e.stopPropagation();
        custId = null;
        body.querySelector('#bfCustName').value = '';
        _renderCustCard(null);
        return;
      }
      _doPick();
    });

    // --- 시술 칩 자동완성 ---
    let _selectedSvc = existing?.service_name || '';
    function _renderChips(names) {
      const wrap = body.querySelector('#bfSvcChips');
      if (!wrap) return;
      const arr = Array.from(names).slice(0, 8);
      wrap.innerHTML = arr.map(n =>
        `<button type="button" class="bf-svc-chip${n === _selectedSvc ? ' on' : ''}" data-svc="${_esc(n)}">${_esc(n)}</button>`
      ).join('') + '<button type="button" class="bf-svc-chip add" id="bfSvcAddBtn">+ 직접 입력</button>';
      wrap.querySelectorAll('.bf-svc-chip[data-svc]').forEach(btn => {
        btn.addEventListener('click', () => {
          _selectedSvc = _selectedSvc === btn.dataset.svc ? '' : btn.dataset.svc;
          body.querySelector('#bfSvc').value = _selectedSvc;
          _renderChips(names);
          const ci = body.querySelector('#bfSvcCustom');
          if (ci) ci.style.display = 'none';
        });
      });
      body.querySelector('#bfSvcAddBtn')?.addEventListener('click', () => {
        const ci = body.querySelector('#bfSvcCustom');
        if (ci) { ci.style.display = ''; ci.focus(); }
      });
    }
    const ci = body.querySelector('#bfSvcCustom');
    if (ci) ci.addEventListener('input', () => { body.querySelector('#bfSvc').value = ci.value; _selectedSvc = ci.value; });
    // 시술 목록 fetch
    (async () => {
      const names = new Set();
      try {
        if (window.API && window.authHeader) {
          const [r1, r2] = await Promise.allSettled([
            fetch(window.API + '/services', { headers: window.authHeader() }),
            fetch(window.API + '/revenue?period=month', { headers: window.authHeader() }),
          ]);
          if (r1.status === 'fulfilled' && r1.value.ok) { const d = await r1.value.json(); (d.items || []).forEach(s => s.name && names.add(s.name)); }
          if (r2.status === 'fulfilled' && r2.value.ok) { const d = await r2.value.json(); (d.items || []).forEach(r => r.service_name && names.add(r.service_name)); }
        }
      } catch (_) { /* ignore */ }
      if (!names.size) ['젤 리무브','손톱 케어','젤 풀','젤 + 케어','젤 보강'].forEach(n => names.add(n));
      _renderChips(names);
    })();

    // --- 더보기 토글 ---
    const moreToggle = body.querySelector('#bfMoreToggle');
    const moreFields = body.querySelector('#bfMoreFields');
    if (moreToggle && moreFields) {
      // 수정 모드에서는 기본 열기
      if (existing?.memo || existing?.staff_id) {
        moreFields.style.display = '';
        moreToggle.classList.add('open');
      }
      moreToggle.addEventListener('click', () => {
        const open = moreFields.style.display !== 'none';
        moreFields.style.display = open ? 'none' : '';
        moreToggle.classList.toggle('open', !open);
        // 더보기 열렸을 때 해당 영역이 보이도록 스크롤
        if (!open) {
          setTimeout(() => {
            moreFields.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 50);
        }
      });
    }

    // --- 직원 칩 ---
    let _staffId = existing?.staff_id || null;
    (async () => {
      const row = body.querySelector('#bfStaffRow');
      if (!row) return;
      let items = [];
      try {
        if (window.StaffUI?.list) { const d = await window.StaffUI.list(); items = (d?.items) || []; }
        else if (window._staffCache?.items) items = window._staffCache.items;
      } catch (_) { /* ignore */ }
      if (!items.length) { row.innerHTML = '<span style="font-size:12px;color:var(--text-subtle)">등록된 직원이 없어요</span>'; return; }
      const colors = ['#E5586E','#98A1AC','#0F1419','#A78BFA','#10A56B'];
      row.innerHTML = items.map((s, i) =>
        `<button type="button" class="bf-staff-btn${_staffId === s.id ? ' on' : ''}" data-staff-id="${s.id}"><span class="bf-staff-dot" style="background:${s.color || colors[i % 5]}"></span>${_esc(s.name || '')}</button>`
      ).join('');
      row.querySelectorAll('.bf-staff-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = Number(btn.dataset.staffId);
          _staffId = _staffId === id ? null : id;
          row.querySelectorAll('.bf-staff-btn').forEach(b => b.classList.toggle('on', Number(b.dataset.staffId) === _staffId));
        });
      });
    })();

    // --- 메모 카운터 ---
    const memo = body.querySelector('#bfMemo');
    const counter = body.querySelector('#bfMemoCounter');
    if (memo && counter) memo.addEventListener('input', () => { counter.textContent = memo.value.length + ' / 200'; });

    // --- 충돌 체크 ---
    function _checkConflict() {
      _readStart();
      const d = body.querySelector('#bfDate')?.value;
      if (!d) return;
      const endMin = _startH * 60 + _startM + _durMin;
      const eh = Math.floor(endMin / 60) % 24, em = endMin % 60;
      const starts = `${d}T${_pad(_startH)}:${_pad(_startM)}:00+09:00`;
      const ends = `${d}T${_pad(eh)}:${_pad(em)}:00+09:00`;
      const conflict = window.Booking.hasConflict(starts, ends, existing?.id);
      const el = body.querySelector('#bfConflict');
      if (el) el.style.display = conflict ? 'block' : 'none';
    }
    _checkConflict();

    // 취소 버튼
    body.querySelector('#cv-form-back2')?.addEventListener('click', () => _renderViewBody());

    // 고객 dashboard 진입 prefill: 카드도 채우기 (이름 input 은 시작점에서 이미 채움)
    if (_pendingCust && _pendingCust.id) {
      try {
        const _items = (window.Customer && window.Customer._cache) || [];
        const _full = _items.find(c => String(c.id) === String(_pendingCust.id));
        _renderCustCard(_full || { id: _pendingCust.id, name: _pendingCust.name });
      } catch (_e) {
        _renderCustCard({ id: _pendingCust.id, name: _pendingCust.name });
      }
    }

    // 공유 getter
    body._getCustId = () => custId;
    body._getStaffId = () => _staffId;
    body._getDurMin = () => _durMin;
    body._getStartH = () => { _readStart(); return _startH; };
    body._getStartM = () => { _readStart(); return _startM; };
  }

  function _bindFormSave(body, existing, date) {
    body.querySelector('#bfSave').addEventListener('click', async () => {
      const d = body.querySelector('#bfDate').value;
      if (!d) { if (window.showToast) window.showToast('날짜를 입력해 주세요'); return; }
      const sh = body._getStartH(), sm = body._getStartM(), dur = body._getDurMin();
      const endMin = sh * 60 + sm + dur;
      const eh = Math.floor(endMin / 60) % 24, em = endMin % 60;
      const sTime = _pad(sh) + ':' + _pad(sm);
      const eTime = _pad(eh) + ':' + _pad(em);
      if (sTime >= eTime && endMin < 1440) { if (window.showToast) window.showToast('종료 시간이 시작보다 늦어야 해요'); return; }
      const payload = {
        starts_at:     `${d}T${sTime}:00+09:00`,
        ends_at:       `${d}T${eTime}:00+09:00`,
        customer_id:   body._getCustId?.() || null,
        customer_name: body.querySelector('#bfCustName').value.trim() || null,
        service_name:  body.querySelector('#bfSvc').value.trim()      || null,
        memo:          body.querySelector('#bfMemo').value.trim()      || null,
        staff_id:      body._getStaffId?.() || null,
      };
      try {
        if (existing) {
          await window.Booking.update(existing.id, payload);
          window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'update_booking', booking_id: existing.id, customer_id: payload.customer_id } }));
        } else {
          const created = await window.Booking.create(payload);
          window.dispatchEvent(new CustomEvent('booking:created', { detail: { customer_name: payload.customer_name, customer_id: payload.customer_id || null } }));
          window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'create_booking', booking_id: created?.id || null, customer_id: payload.customer_id } }));
        }
        if (window.hapticLight) window.hapticLight();
        const _name = payload.customer_name || '';
        const toastMsg = _name
          ? `✓ ${_name}님 ${d} ${sTime} 예약 ${existing ? '수정' : '추가'}됨`
          : `✓ ${d} ${sTime} 예약 ${existing ? '수정' : '추가'}됨`;
        if (window.showToast) window.showToast(toastMsg);
        if (window.Dashboard?.refresh) window.Dashboard.refresh(true);
        _mappedCache = await _loadMonth(_curYear, _curMonth);
        _renderViewBody();
      } catch (err) {
        console.warn('[cal] save 실패:', err);
        if (window.showToast) window.showToast('저장 실패');
      }
    });
  }

  function _bindFormActions(body, existing, date) {
    body.querySelector('#bfDelete')?.addEventListener('click', async () => {
      if (!confirm('이 예약을 삭제할까요?')) return;
      try {
        await window.Booking.remove(existing.id);
        window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'delete_booking', booking_id: existing.id, customer_id: existing.customer_id || null } }));
        if (window.hapticLight) window.hapticLight();
        if (window.showToast) window.showToast('삭제 완료');
        if (window.Dashboard?.refresh) window.Dashboard.refresh(true);
        _mappedCache = await _loadMonth(_curYear, _curMonth);
        _renderViewBody();
      } catch (_) { if (window.showToast) window.showToast('삭제 실패'); }
    });
    body.querySelector('#bfComplete')?.addEventListener('click', () => {
      if (!window.CompleteFlow?.startFromBooking) {
        if (window.showToast) window.showToast('완료 모듈 로드 중…');
        return;
      }
      if (window.hapticMedium) window.hapticMedium();
      window.CompleteFlow.startFromBooking(existing);
    });
    const STATUS_LABEL = { confirmed: '확정', completed: '완료', cancelled: '취소', no_show: '안 옴' };
    body.querySelectorAll('[data-bf-status]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const newStatus = btn.getAttribute('data-bf-status');
        if (newStatus === existing.status) return;
        try {
          await window.Booking.update(existing.id, { status: newStatus });
          window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'update_booking', booking_id: existing.id, customer_id: existing.customer_id || null } }));
          if (window.hapticLight) window.hapticLight();
          if (window.showToast) window.showToast(`상태를 '${STATUS_LABEL[newStatus]}'로 변경했어요`);
          if (window.Dashboard?.refresh) window.Dashboard.refresh(true);
          _mappedCache = await _loadMonth(_curYear, _curMonth);
          _renderViewBody();
        } catch (_) { if (window.showToast) window.showToast('상태 변경 실패'); }
      });
    });
  }

  function _openForm(date, existing) {
    const o = _overlay(); if (!o) return;
    const body = o.querySelector("#bk-body"); if (!body) return;
    const hours  = window.Booking.shopHours();
    const slots  = _buildSlots(hours);
    const pend   = window._pendingBookingSlot;
    window._pendingBookingSlot = null;
    const pendS  = pend?.starts_at ? new Date(pend.starts_at) : null;
    const pendE  = pend?.ends_at   ? new Date(pend.ends_at)   : null;
    const defDate = existing ? new Date(existing.starts_at) : (pendS || date);
    const dateStr = _ds(defDate);
    const defS = existing ? _fmt(new Date(existing.starts_at)) : (pendS ? _fmt(pendS) : slots[0]);
    const defE = existing ? _fmt(new Date(existing.ends_at))   : (pendE ? _fmt(pendE) : (slots[2] || slots[slots.length - 1]));
    body.innerHTML = '<div class="cv-form-wrap bf-wrap" style="flex:1;overflow-y:auto;padding:16px;">' + _buildFormHTML(existing, slots, dateStr, defS, defE, !!pendS) + '</div>';
    body.querySelector('#cv-form-back').addEventListener('click', () => _renderViewBody());
    _bindFormExtras(body, existing);
    _bindFormSave(body, existing, date);
    if (existing) _bindFormActions(body, existing, date);
    // 빈 슬롯 클릭 시 고객 picker 자동 오픈
    if (!existing && pendS) {
      setTimeout(() => {
        const card = body.querySelector('#bfCustCard');
        if (card && document.body.contains(card)) card.click();
      }, 300);
    }
  }


  // ============================================================
  // §21 뷰 전환
  // ============================================================
  function _switchView(view) {
    _curView = view;
    const o = _overlay(); if (!o) return;
    o.querySelectorAll('.bk-view__btn').forEach(b => {
      b.classList.toggle('is-on', b.dataset.view === view);
    });
    _renderViewBody();
  }

  // ============================================================
  // §22 월 네비
  // ============================================================
  async function _prevMonth() {
    _curMonth--;
    if (_curMonth < 1) { _curMonth = 12; _curYear--; }
    await _reloadAndRender();
    _prefetchNeighbors();
  }
  async function _nextMonth() {
    _curMonth++;
    if (_curMonth > 12) { _curMonth = 1; _curYear++; }
    await _reloadAndRender();
    _prefetchNeighbors();
  }
  async function _reloadAndRender() {
    _mappedCache = await _loadMonth(_curYear, _curMonth);
    _renderViewBody();
  }
  function _prefetch(year, month) {
    const from = new Date(year, month - 1, 1).toISOString();
    const to   = new Date(year, month, 0, 23, 59, 59).toISOString();
    window.Booking.list(from, to).catch(() => {});
  }
  function _prefetchNeighbors() {
    let py = _curYear, pm = _curMonth - 1;
    if (pm < 1)  { pm = 12; py--; }
    let ny = _curYear, nm = _curMonth + 1;
    if (nm > 12) { nm = 1;  ny++; }
    _prefetch(py, pm);
    _prefetch(ny, nm);
  }

  // ============================================================
  // §23 전역 onclick 위임
  // ============================================================
  window._calSelectDay = function (dateStr) {
    _curDate = new Date(dateStr + 'T00:00:00');
    _switchView('day');
  };
  window._calSelectDayChip = function (dateStr) {
    _curDate = new Date(dateStr + 'T00:00:00');
    _renderViewBody();
  };
  window._calSwitchView = _switchView;
  window._calPrevMonth  = _prevMonth;
  window._calNextMonth  = _nextMonth;

  // ============================================================
  // §24 진입점
  // ============================================================
  window.openCalendarView = async function () {
    if (typeof window._perfMark === 'function') window._perfMark('calendar:open:start');
    const existing = _overlay(); if (existing) existing.remove();

    // 상태 복원
    const saved = _loadState();
    const now = new Date();
    if (saved && saved.dateISO) {
      _curDate = new Date(saved.dateISO + 'T00:00:00');
      _curView = saved.view || 'month';
      _curYear = saved.y || now.getFullYear();
      _curMonth = saved.m || (now.getMonth() + 1);
    } else {
      _curYear = now.getFullYear();
      _curMonth = now.getMonth() + 1;
      _curDate = now;
      _curView = 'month';
    }
    _miniMonth = { y: _curYear, m: _curMonth };
    _cachedIsPC = _isPC();

    // 직원 목록 먼저
    try { _staffList = await _fetchStaff(); } catch (_e) { _staffList = [{ id: 1, name: '원장', color_idx: 0 }]; void _e; }

    // 레이아웃 진입
    if (_cachedIsPC) _renderPCLayout();
    else _renderMobileLayout();

    document.body.style.overflow = 'hidden';
    try {
      if (typeof window._registerSheet === 'function') window._registerSheet('booking', _close);
      if (typeof window._markSheetOpen === 'function') window._markSheetOpen('booking');
    } catch (_e) { void _e; }

    // 시술 카탈로그 캐시 워밍 (가격 표시 용)
    if (typeof window.loadServiceTemplates === 'function' && !(window._serviceTemplatesCache || []).length) {
      window.loadServiceTemplates().catch(() => {});
    }

    _mappedCache = await _loadMonth(_curYear, _curMonth);
    _renderViewBody();
    _prefetchNeighbors();

    // now-line 1분마다 갱신
    if (_nowLineTimer) clearInterval(_nowLineTimer);
    _nowLineTimer = setInterval(_placeNowLine, 60000);

    // 고객 dashboard → "예약잡기" 진입: 자동으로 예약 추가 폼 표시.
    // _pendingBookingCustomer 는 _bindFormExtras 가 소비하므로 여기선 트리거만.
    if (window._pendingBookingCustomer) {
      setTimeout(() => _openForm(_curDate, null), 50);
    }

    if (typeof window._perfMark === 'function') window._perfMark('calendar:open:end');
  };

  window.openBooking = async function (date) {
    await window.openCalendarView();
    if (date) {
      _curDate = new Date(date);
      _switchView('day');
    }
  };
  window.closeBooking = _close;

  // data-open="calendar-view" 위임
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-open="calendar-view"]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    window.openCalendarView();
  }, true);

  // 외부 mutation 시 재로드
  if (typeof window !== 'undefined' && !window._calendarViewDataListenerInit) {
    window._calendarViewDataListenerInit = true;
    window.addEventListener('itdasy:data-changed', async (e) => {
      const kind = e && e.detail && e.detail.kind;
      if (kind && !/(booking|force_sync|focus_sync|online_restore)/.test(kind)) return;
      try { if (window.Booking && typeof window.Booking._invalidateCache === 'function') window.Booking._invalidateCache(); } catch (_e) { void _e; }
      if (!_overlay()) return;
      try {
        _mappedCache = await _loadMonth(_curYear, _curMonth);
        _renderViewBody();
      } catch (_e) { void _e; }
    });
  }

  // resize 시 PC↔모바일 전환
  let _resizeTimer = null;
  window.addEventListener('resize', () => {
    if (!_overlay()) return;
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      const newIsPC = _isPC();
      if (newIsPC !== _cachedIsPC) {
        _cachedIsPC = newIsPC;
        const o = _overlay(); if (o) o.remove();
        if (_cachedIsPC) _renderPCLayout();
        else _renderMobileLayout();
      }
    }, 200);
  });

})();
