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
     - PC 좌측 패널 (미니 캘린더 + 직원 리스트 + 통계)
     - PC 일간: 직원별 컬럼 분할
     - localStorage 상태 저장 (bk4_state)
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const OVERLAY_ID = 'cal-overlay';
  const STATE_KEY  = 'bk4_state';
  // [2026-05-23] STAFF_CACHE_KEY 제거 — 직원 기능 폐지

  // === 2026 한국 공휴일 ===
  const _HOLIDAYS_2026 = {
    '1-1':'신정','2-16':'설날 연휴','2-17':'설날','2-18':'설날 연휴',
    '3-1':'삼일절','3-2':'대체공휴일','5-5':'어린이날','5-25':'부처님오신날',
    '6-6':'현충일','8-15':'광복절','8-17':'대체공휴일',
    '9-24':'추석 연휴','9-25':'추석','9-26':'추석 연휴',
    '10-3':'개천절','10-5':'대체공휴일','10-9':'한글날','12-25':'크리스마스',
  };

  // [2026-05-29] 휠 스타일은 booking-form.css 가 단일 소스. 옛 인라인 주입 폐지 (충돌 제거)

  // === 시간 그리드 단위 ===
  // CSS 변수와 동일해야 블록(absolute) 위치 / 셀(grid row) 정렬이 맞음
  // CSS: css/screens/booking-v4.css 의 --bk-h-mobile-day / --bk-h-pc-week / --bk-h-pc-day 와 동기화
  const HOUR_PX_MOBILE_DAY  = 50;   // [2026-05-17 v6] 60→50 — mockup-calendar-blocks 직선 바 톤 컴팩트
  const HOUR_PX_MOBILE_WEEK = 50;
  const HOUR_PX_PC_WEEK     = 60;
  const HOUR_PX_PC_DAY      = 60;   // [Step 5 · 2026-05-16] 60px — 1시간 블록에 3줄(고객/시각/시술) 여유 + CSS 와 동일

  // [2026-05-26] 5색 순환 폐지 → status 기준 일원화.
  //   확정 파랑 #5B7FC4 / 완료 초록 #16B55E / 노쇼 빨강 #E5484D
  const BK_STATUS_COLOR = {
    confirmed: '#5B7FC4',
    completed: '#16B55E',
    no_show:   '#E5484D',
  };
  function _statusDotColor(status) {
    return BK_STATUS_COLOR[status] || BK_STATUS_COLOR.confirmed;
  }
  // [2026-05-26] 캘린더 렌더용 — 취소 예약은 표시 제외 (데이터는 _mappedCache 에 그대로 유지)
  function _visibleCache() {
    return (_mappedCache || []).filter(it => it.status !== 'cancelled');
  }
  const PC_BREAKPOINT       = 1100;

  // === 상태 ===
  let _curYear, _curMonth;
  let _curView = 'month';        // 'month' | 'week' | 'day' — [2026-05-16] 월 뷰 기본 진입

  // 상태별 CSS 클래스 매핑
  function _stCls(status) {
    switch(status) {
      case 'confirmed': return ' bk-st-confirmed';
      case 'completed': return ' bk-st-completed';
      case 'cancelled': return ' bk-st-cancelled';
      case 'no_show':   return ' bk-st-noshow';
      default: return '';
    }
  }
  let _curDate = new Date();
  let _mappedCache = [];         // 현재 월 매핑된 예약
  // [2026-05-23] _staffList / _activeStaffIds 제거 — 직원 기능 폐지
  let _miniMonth = null;         // PC 미니캘 표시 월 {y, m}
  let _cachedIsPC = false;

  // ============================================================
  // §1 헬퍼
  // ============================================================
  function _esc(s) { return window._esc(s); } /* [2026-06-11] 중복 제거 — app-core 정본 위임 */
  function _pad(n)  { return String(n).padStart(2, '0'); }
  // [2026-06-14 QA] 시간 겹침 안내문 — 충돌 예약의 고객명 + 시술시간대 노출.
  function _conflictMsg(b) {
    if (!b) return '이 시간에 이미 예약이 있어요';
    const _hm = (iso) => { try { const d = new Date(iso); return `${_pad(d.getHours())}:${_pad(d.getMinutes())}`; } catch (_e) { return ''; } };
    const name = (b.customer_name || '').trim();
    const span = b.starts_at && b.ends_at ? ` (${_hm(b.starts_at)}~${_hm(b.ends_at)})` : '';
    return name ? `${name} 고객님 시술시간과 겹쳐요${span}` : `이 시간에 이미 예약이 있어요${span}`;
  }
  function _nextDay(dateStr) {
    // [2026-06-11 QA] toISOString()은 UTC 라 KST 자정이 "전날 15시"로 계산 → +1일 해도
    //   같은 날짜 반환 → 자정 넘는 예약(밤 11시+60분)이 ends<starts 로 BE 400 나던 버그 픽스.
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return _ds(d);
  }
  function _ds(d)   { return d.getFullYear() + '-' + _pad(d.getMonth()+1) + '-' + _pad(d.getDate()); }
  function _fmt(d)  { return _pad(d.getHours()) + ':' + _pad(d.getMinutes()); }
  function _overlay()  { return document.getElementById(OVERLAY_ID); }
  function _isPC() { return window.innerWidth >= PC_BREAKPOINT; }

  function _saveState() {
    // [2026-05-28] view 필드 저장 제거 — 디폴트 월. 주/월 토글은 세션 내 메모리만 유지.
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        y: _curYear, m: _curMonth, dateISO: _ds(_curDate),
      }));
    } catch (_e) { void _e; }
  }
  function _loadState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); }
    catch (_e) { return null; }
  }

  function _close() {
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
  // [2026-05-19] _krwShort 삭제 → formatMoney (format-money.js 공통 유틸)

  function _mapItems(items) {
    return items.map(b => {
      const s = new Date(b.starts_at), e = new Date(b.ends_at);
      const amt = (b.amount && b.amount > 0) ? b.amount : _catalogPriceFor(b.service_name);
      // [2026-05-23] staff_idx / staff_id 매핑 제거 — 직원 기능 폐지
      return {
        d: s.getDate(),
        t: s.toTimeString().slice(0, 5),
        cust: b.customer_name || '이름 없음',
        svc: b.service_name || '',
        dur: Math.round((e - s) / 60000),
        id: b.id,
        status: b.status,
        amount: amt || null,
        _raw: b,
      };
    });
  }

  // [2026-07-25 #2] 로드 범위를 현재 달 ±7일로 넓힌다 — 주간 뷰가 월 경계를 넘는 경우
  //   (경계 주가 반쪽만 보이고 충돌검사 _items 에서도 빠지던 것)를 커버. 월 그리드는
  //   _buildMonthGrid 에서 현재 달만 버킷팅하므로 여유분(인접 달)이 엉뚱한 날짜 칸에 안 샌다.
  //   통계(_calcStats)·일/주 뷰는 전부 전체날짜로 필터하므로 여유분은 무해.
  function _monthRange(year, month) {
    const from = new Date(year, month - 1, 1); from.setDate(from.getDate() - 7);
    const to   = new Date(year, month, 0, 23, 59, 59); to.setDate(to.getDate() + 7);
    return { from: from.toISOString(), to: to.toISOString() };
  }
  async function _loadMonth(year, month) {
    const { from, to } = _monthRange(year, month);
    const items = await window.Booking.list(from, to);
    return _mapItems(items);
  }

  // [2026-05-23] _fetchStaff / _filterByStaff 제거 — 직원 기능 폐지.
  // 호출부 인터페이스 호환을 위해 _filterByStaff 만 identity stub 으로 남겨둠.
  function _filterByStaff(items) { return items; }

  // ============================================================
  // §4 통계 계산 (PC 좌측 + 헤더)
  // ============================================================
  // [2026-05-24] 통계 재설계 — 오늘 그룹(노쇼 추가) + 현재 뷰 연동 그룹.
  // estRevenue/"남은 예약 완료 시" 제거.
  function _calcStats(items) {
    const today = new Date();
    const todayDS = _ds(today);
    // [2026-05-28] 라벨 "대기" → "예정". 4칸 분할 위해 todayCancel 추가.
    let todayCnt = 0, todayDone = 0, todayUpcoming = 0, todayNoShow = 0, todayCancel = 0;
    let viewCnt = 0, viewDone = 0, viewUpcoming = 0, viewNoShow = 0, viewCancel = 0;

    // 현재 뷰에 맞는 범위 계산
    let viewStart, viewEnd, viewLabel, viewGroupLabel;
    if (_curView === 'day') {
      viewStart = new Date(_curDate); viewStart.setHours(0,0,0,0);
      viewEnd = new Date(viewStart); viewEnd.setDate(viewEnd.getDate() + 1);
      viewLabel = (viewStart.getMonth()+1) + '/' + viewStart.getDate();
      viewGroupLabel = '선택일';
    } else if (_curView === 'week') {
      viewStart = new Date(_curDate); viewStart.setHours(0,0,0,0);
      viewStart.setDate(viewStart.getDate() - viewStart.getDay());
      viewEnd = new Date(viewStart); viewEnd.setDate(viewEnd.getDate() + 7);
      const we = new Date(viewEnd); we.setDate(we.getDate() - 1);
      viewLabel = `${viewStart.getMonth()+1}/${viewStart.getDate()} ~ ${we.getMonth()+1}/${we.getDate()}`;
      viewGroupLabel = '이번주';
    } else { // month
      viewStart = new Date(_curYear, _curMonth - 1, 1);
      viewEnd = new Date(_curYear, _curMonth, 1);
      viewLabel = _curMonth + '월';
      viewGroupLabel = '이번달';
    }

    items.forEach(it => {
      const sd = new Date(it._raw.starts_at);
      const itemDS = _ds(sd);
      if (itemDS === todayDS) {
        todayCnt++;
        if (it.status === 'completed') todayDone++;
        else if (it.status === 'no_show') todayNoShow++;
        else if (it.status === 'cancelled') todayCancel++;
        else todayUpcoming++;
      }
      if (sd >= viewStart && sd < viewEnd) {
        if (it.status === 'completed') { viewDone++; viewCnt++; }
        else if (it.status === 'confirmed') { viewUpcoming++; viewCnt++; }
        else if (it.status === 'no_show') viewNoShow++;
        else if (it.status === 'cancelled') viewCancel++;
        else { viewUpcoming++; viewCnt++; }
      }
    });

    const DOW = '일월화수목금토';
    const todayLabel = `오늘 ${today.getMonth()+1}/${today.getDate()}(${DOW.charAt(today.getDay())})`;
    return {
      todayCnt, todayDone, todayUpcoming, todayNoShow, todayCancel, todayLabel,
      viewCnt, viewDone, viewUpcoming, viewNoShow, viewCancel, viewLabel, viewGroupLabel,
    };
  }


  // ============================================================
  // §5 모바일 — 월 그리드
  // ============================================================
  // 월 그리드 공통 — 모바일/PC 모두 사용. clsPrefix: 'bk-month-m' or 'bk-pc-month'
  function _buildMonthCellHTML(d, year, month, byDay, today, p, isPC, opts) {
    const isToday = today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === d;
    const dateStr = year + '-' + _pad(month) + '-' + _pad(d);
    let cls = `${p}__cell` + (isToday ? ` ${p}__cell--today` : '');
    if (opts && opts.selected === dateStr) cls += ` ${p}__cell--sel`;
    let h = `<div class="${cls}" data-cal-day="${dateStr}" role="button" tabindex="0">`;
    h += `<div class="${p}__num">${d}</div>`;
    // [2026-06-05] 공용 그리드 — opts.dayChip 제공 시(매출 등) 예약칩 대신 칩 1개 렌더. 예약은 opts 없음(기본 경로).
    if (opts && typeof opts.dayChip === 'function') {
      const chip = opts.dayChip(dateStr, d);
      if (chip) h += chip;
      return h + '</div>';
    }
    const its = byDay[d] || [];
    if (its.length) {
      // [2026-05-16] PC/모바일 모두 시간 + 이름만, 최대 5줄.
      // [2026-05-17 v6] 각 줄에 작은 6px 컬러 dot — 그날 안에서 5색 순환
      const MAX = isPC ? 5 : 3;
      h += `<div class="${p}__events">`;
      its.slice(0, MAX).forEach((it, _i) => {
        // [2026-05-23] is-staff2 분기 제거 — 직원 기능 폐지
        const tm = _fmt(new Date(it._raw.starts_at));
        const dotColor = _statusDotColor(it.status);
        const dot = `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${dotColor};margin-right:4px;vertical-align:middle"></span>`;
        h += `<div class="${p}__evt${_stCls(it.status)}">${dot}${tm} ${_esc(it.cust)}</div>`;
      });
      if (its.length > MAX) h += `<div class="${p}__more">+${its.length - MAX}</div>`;
      h += '</div>';
    }
    return h + '</div>';
  }

  function _buildMonthGrid(year, month, mapped, p, isPC, opts) {
    const filtered = _filterByStaff(mapped);
    const byDay = {};
    // [2026-07-25 #2] byDay 는 일자번호(m.d=getDate)로 그룹핑하므로, ±7 여유분(인접 달)이 섞이면
    //   예: 8월 보는데 7/30 예약이 8/30 칸에 뜬다. 현재 달 항목만 버킷팅해 오염 차단.
    //   (월 그리드의 인접 달 셀은 원래 예약 없는 정적 셀 — 여기서 인접 달 예약을 그릴 자리도 없다.)
    filtered.forEach(m => {
      const sd = new Date(m._raw.starts_at);
      if (sd.getFullYear() !== year || sd.getMonth() + 1 !== month) return;
      (byDay[m.d] = byDay[m.d] || []).push(m);
    });
    const firstDow = new Date(year, month - 1, 1).getDay();
    const lastDate = new Date(year, month, 0).getDate();
    const prevLast = new Date(year, month - 1, 0).getDate();
    const today = new Date();
    let cells = '';
    for (let i = 0; i < firstDow; i++) {
      cells += `<div class="${p}__cell ${p}__cell--other"><div class="${p}__num">${prevLast - firstDow + 1 + i}</div></div>`;
    }
    for (let d = 1; d <= lastDate; d++) cells += _buildMonthCellHTML(d, year, month, byDay, today, p, isPC, opts);
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
      h += '<button class="' + cls + '" data-date="' + ds + '">';
      h += '<span class="bk-date__dow">' + DOW[d.getDay()] + '</span>';
      h += '<span class="bk-date__num">' + d.getDate() + '</span></button>';
    }
    return h + '</div>';
  }

  function _renderDayMobile(date, mapped) {
    const tt = _ttHours();
    const dayDS = _ds(date);
    const filtered = _filterByStaff(mapped).filter(m => _ds(new Date(m._raw.starts_at)) === dayDS);
    const { start, end, shopStart, shopEnd } = _expandHoursForItems(tt.start, tt.end, filtered);
    let h = '<div class="bk-day" id="bk-day-grid" data-date="' + dayDS + '" data-start-h="' + start + '">';
    for (let hr = start; hr < end; hr++) {
      h += '<div class="bk-day__row">';
      h += '<div class="bk-day__hour-label' + _hourLabelCls(hr, shopStart, shopEnd) + '">' + _pad(hr) + ':00</div>';
      h += '<div class="bk-day__hour-content" data-hour="' + hr + '">';
      h += '<div class="bk-day__slot-half" data-hour="' + hr + '" data-min="0"></div>';
      h += '<div class="bk-day__slot-half" data-hour="' + hr + '" data-min="30"></div>';
      h += '</div></div>';
    }
    // 블록 (absolute, hour-content 내부에 배치하는 대신 grid 전체에 absolute)
    h += '</div>';
    return { html: h, items: filtered, start, end };
  }

  function _placeDayBlocks(grid, items, startH) {
    if (!grid) return;
    items.forEach((it, _i) => {
      const s = new Date(it._raw.starts_at);
      const e = new Date(it._raw.ends_at);
      const top = (s.getHours() - startH) * HOUR_PX_MOBILE_DAY + (s.getMinutes() / 60) * HOUR_PX_MOBILE_DAY;
      const height = Math.max(20, Math.round(((e - s) / 60000) / 60 * HOUR_PX_MOBILE_DAY));
      const isDim = it.status === 'cancelled' || it.status === 'no_show';
      // [2026-05-23] is-staff2 분기 제거 — 직원 기능 폐지
      const dim = isDim ? ' is-dim' : '';
      const block = document.createElement('button');
      block.className = 'bk-block bk-block--v6'+ dim + _stCls(it.status);
      block.dataset.bookingId = it.id;
      block.style.position = 'absolute';
      block.style.top = top + 'px';
      block.style.height = height + 'px';
      block.style.left = '54px';
      block.style.right = '12px';
      const priceStr = it.amount ? ' · ' + formatMoney(it.amount) : '';
      const svcStr = it.svc ? '<span class="bk-block__svc">' + _esc(it.svc) + priceStr + '</span>' : '';
      block.innerHTML = '<span class="bk-bar"></span>'
        + '<div class="bk-block__body">'
        + '<div class="bk-block__title">' + _esc(it.cust) + svcStr + '</div>'
        + '<div class="bk-block__sub">' + _fmt(s) + ' ~ ' + _fmt(e) + '</div>'
        + '</div>';
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
    const { start, end, shopStart, shopEnd } = _expandHoursForItems(tt.start, tt.end, inWeek);

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
      h += '<div class="bk-week-m__time-cell' + _hourLabelCls(hr, shopStart, shopEnd) + '">' + hr + '</div>';
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

  // [2026-06-11] 주간뷰 예약 카드 1안 — 흰 배경 + 상태 점 (월간뷰 점 언어와 통일).
  //   확정 파랑 / 완료 초록 / 노쇼 빨강 = BK_STATUS_COLOR 재사용. PC는 1줄, 모바일은 2줄(점·시간 / 이름).
  function _weekCardInner(it, isPC) {
    const s = new Date(it._raw.starts_at);
    const tm = _pad(s.getHours()) + ':' + _pad(s.getMinutes());
    const dotC = _statusDotColor(it.status);
    const done = it.status === 'completed';
    const dim = (it.status === 'no_show' || it.status === 'cancelled');
    const nameColor = done ? '#8B95A1' : (dim ? '#B0B8C1' : '#191F28');
    const strike = dim ? 'text-decoration:line-through;' : '';
    const dot = (sz) => '<span style="width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;background:' + dotC + ';flex-shrink:0;display:inline-block;"></span>';
    if (isPC) {
      return '<div style="display:flex;align-items:center;gap:6px;min-width:0;flex:1;">'
        + dot(8)
        + '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600;color:' + nameColor + ';letter-spacing:-0.2px;' + strike + '">' + _esc(it.cust) + '</span>'
        + '<span style="flex-shrink:0;font-size:11px;color:#8B95A1;' + strike + '">' + tm + '</span>'
        + (done ? '<span style="flex-shrink:0;color:#16B55E;display:inline-flex;align-items:center;"><svg width="13" height="13" aria-hidden="true"><use href="#ic-check"/></svg></span>' : '')
        + '</div>';
    }
    // 모바일: 좁은 컬럼(≈49px) — 점·시간을 윗줄에, 이름은 아랫줄(잘려도 점·시간은 보존)
    return '<div style="display:flex;align-items:center;gap:3px;line-height:1.1;">'
      + dot(7)
      + '<span style="font-size:10px;color:#8B95A1;font-weight:600;flex-shrink:0;' + strike + '">' + tm + '</span>'
      + (done ? '<span style="margin-left:auto;color:#16B55E;flex-shrink:0;display:inline-flex;align-items:center;"><svg width="11" height="11" aria-hidden="true"><use href="#ic-check"/></svg></span>' : '')
      + '</div>'
      + '<div style="font-size:12px;font-weight:600;color:' + nameColor + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2;margin-top:1px;' + strike + '">' + _esc(it.cust) + '</div>';
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
      // [2026-05-23] is-staff2 분기 제거 — 직원 기능 폐지
      const block = document.createElement('button');
      block.className = 'bk-week-m__block bk-week-m__block--v6';
      block.dataset.bookingId = it.id;
      block.style.top = top + 'px';
      block.style.height = height + 'px';
      block.innerHTML = _weekCardInner(it, false);
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
    const { start, end, shopStart, shopEnd } = _expandHoursForItems(tt.start, tt.end, inWeek);

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
      h += '<div class="bk-week__time-cell' + _hourLabelCls(hr, shopStart, shopEnd) + '">' + _pad(hr) + ':00</div>';
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
    h += '</div></div>';
    return { html: h, items: filtered, start, ws };
  }

  function _placeWeekPCBlocks(grid, items, startH, _weekStart) {
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
      // [2026-05-23] is-staff2 분기 제거 — 직원 기능 폐지
      const block = document.createElement('button');
      block.className = 'bk-week__block bk-week__block--v6';
      block.dataset.bookingId = it.id;
      block.style.top = top + 'px';
      block.style.height = height + 'px';
      block.innerHTML = _weekCardInner(it, true);
      if (!fragments.has(dayCol)) fragments.set(dayCol, document.createDocumentFragment());
      fragments.get(dayCol).appendChild(block);
    });
    fragments.forEach((frag, col) => col.appendChild(frag));
  }

  // ============================================================
  // §10 PC — 일간 뷰 (단일 컬럼) [2026-05-23 직원 컬럼 분할 제거]
  // ============================================================
  function _renderDayPC(date, mapped) {
    const tt = _ttHours();
    const dayDS = _ds(date);
    const filtered = mapped.filter(m => _ds(new Date(m._raw.starts_at)) === dayDS);
    const { start, end, shopStart, shopEnd } = _expandHoursForItems(tt.start, tt.end, filtered);
    const totalCnt = filtered.length;
    const totalRev = filtered.reduce((s, it) => s + (it.amount || 0), 0);
    const meta = totalCnt + '건' + (totalRev ? ' · 매출 ' + formatMoney(totalRev) : '');

    let h = '<div class="bk-pc-day" data-start-h="' + start + '">';
    const headerCols = `80px 1fr`;
    h += `<div class="bk-pc-day__header" style="grid-template-columns:${headerCols}">`;
    h += '<div class="bk-pc-day__h-cell"></div>';
    h += '<div class="bk-pc-day__h-cell"><div class="bk-pc-day__h-meta">' + meta + '</div></div>';
    h += '</div>';

    h += `<div class="bk-pc-day__grid" id="bk-pc-day-grid" style="grid-template-columns:${headerCols}">`;
    h += '<div class="bk-pc-day__time-col">';
    for (let hr = start; hr < end; hr++) {
      h += '<div class="bk-pc-day__time-cell' + _hourLabelCls(hr, shopStart, shopEnd) + '">' + _pad(hr) + ':00</div>';
    }
    h += '</div>';
    h += '<div class="bk-pc-day__col">';
    for (let hr = start; hr < end; hr++) {
      h += '<div class="bk-pc-day__hour" data-hour="' + hr + '" data-date="' + dayDS + '"></div>';
    }
    h += '</div>';
    h += '</div></div>';
    return { html: h, items: filtered, start };
  }

  function _placeDayPCBlocks(grid, items, startH) {
    if (!grid) return;
    const col = grid.querySelector('.bk-pc-day__col');
    if (!col) return;
    items.forEach((it, _i) => {
      const s = new Date(it._raw.starts_at);
      const e = new Date(it._raw.ends_at);
      const top = (s.getHours() - startH) * HOUR_PX_PC_DAY + (s.getMinutes() / 60) * HOUR_PX_PC_DAY;
      const height = Math.max(40, ((e - s) / 60000 / 60) * HOUR_PX_PC_DAY);
      // [2026-05-23] is-staff2 분기 제거 — 직원 기능 폐지
      const block = document.createElement('button');
      const dim4 = (it.status === 'cancelled' || it.status === 'no_show') ? ' is-dim' : '';
      block.className = 'bk-pc-day__block bk-pc-day__block--v6'+ dim4 + _stCls(it.status);
      block.dataset.bookingId = it.id;
      block.style.top = top + 'px';
      block.style.height = height + 'px';
      const priceStr = it.amount ? ' · ' + formatMoney(it.amount) : '';
      const svcStr = it.svc ? '<span class="bk-pc-day__block-svc">' + _esc(it.svc) + priceStr + '</span>' : '';
      block.innerHTML = '<span class="bk-bar"></span>'
        + '<div class="bk-pc-day__block-body">'
        + '<div class="bk-pc-day__block-title">' + _esc(it.cust) + svcStr + '</div>'
        + '<div class="bk-pc-day__block-time">' + _fmt(s) + ' ~ ' + _fmt(e) + '</div>'
        + '</div>';
      col.appendChild(block);
    });
  }

  // ============================================================
  // §11 영업시간 — 시간축 동적 확장 (영업외 라벨은 분홍)
  // ============================================================
  function _ttHours() {
    const h = window.Booking?.shopHours ? window.Booking.shopHours() : { start: 9, end: 24, slotMin: 30 };
    const start = Math.max(0, Math.min(23, h.start ?? 9));
    const end   = Math.max(start + 1, Math.min(24, h.end ?? 24));
    return { start, end };
  }
  // 운영시간(shopStart/shopEnd) 보존 + 예약으로 확장된 범위 둘 다 반환.
  // 시간 라벨 렌더에서 운영시간 밖 라벨은 분홍색으로 표시하기 위함.
  function _expandHoursForItems(start, end, items) {
    let s = start, e = end;
    if (items && items.length) {
      for (const it of items) {
        const sd = new Date(it._raw.starts_at);
        const ed = new Date(it._raw.ends_at);
        if (isNaN(sd) || isNaN(ed)) continue;
        const sh = sd.getHours();
        // [2026-06-11 QA] 자정 넘김 예약(23:40~익일 00:40)은 종료시(0시)만 보면 확장이 안 돼
        //   21시 축에서 안 보이던 버그 — 다음날로 넘어가면 그날 칼럼은 24시까지 확장.
        const crosses = ed.getDate() !== sd.getDate();
        const eh = crosses ? 24 : (ed.getHours() + (ed.getMinutes() > 0 ? 1 : 0));
        if (sh < s) s = Math.max(0, sh);
        // 시작 시각이 축 끝보다 늦은 경우(영업시간 밖 늦은 예약)도 확장
        const endCand = Math.max(eh, sh + 1);
        if (endCand > e) e = Math.min(24, endCand);
      }
    }
    return { start: s, end: e, shopStart: start, shopEnd: end };
  }
  // 라벨에 영업외 클래스 부여. 운영시간 [shopStart, shopEnd) 밖이면 is-off.
  function _hourLabelCls(hr, shopStart, shopEnd) {
    return (hr < shopStart || hr >= shopEnd) ? ' is-off' : '';
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
    h += '<button data-mini-nav="prev" aria-label="이전"><svg width="16" height="16" aria-hidden="true"><use href="#ic-chevron-left"/></svg></button>';
    h += '<button data-mini-nav="next" aria-label="다음"><svg width="16" height="16" aria-hidden="true"><use href="#ic-chevron-right"/></svg></button>';
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

  // [2026-05-23] _renderStaffList 제거 — 직원 기능 폐지

  // [2026-05-28] 4칸 분할 카드 (완료·예정·노쇼·취소). 메인 숫자 = 완료+예정 (취소·노쇼 제외).
  //   isMobile=true 이면 button 형태(접힘/펴짐), false 이면 PC 펼친 상태.
  //   open=true 이면 4칸 표시 (모바일에서만 영향).
  function _renderStatCard(kind, s, opts) {
    opts = opts || {};
    const isMobile = !!opts.mobile;
    const open = !!opts.open;
    let label, count, note, done, upcoming, noShow, cancel;
    if (kind === 'today') {
      label = s.todayLabel;
      count = s.todayDone + s.todayUpcoming;
      note  = '취소·노쇼 제외';
      done = s.todayDone; upcoming = s.todayUpcoming; noShow = s.todayNoShow; cancel = s.todayCancel;
    } else {
      label = s.viewGroupLabel + ' · ' + s.viewLabel;
      count = s.viewCnt;
      note  = '취소·노쇼 제외';
      done = s.viewDone; upcoming = s.viewUpcoming; noShow = s.viewNoShow; cancel = s.viewCancel;
    }
    const cardCls = isMobile ? 'bk-stat-card bk-stat-card--m' + (open ? ' is-open' : '') : 'bk-stat-card';
    const tag = isMobile ? 'button' : 'div';
    const typeAttr = isMobile ? ' type="button"' : '';
    let h = '<' + tag + ' class="' + cardCls + '" data-card="' + kind + '"' + typeAttr + '>';
    h += '<div class="bk-stat-card__head">';
    h +=   '<div>';
    h +=     '<div class="bk-stat-card__label">' + _esc(label) + '</div>';
    h +=     '<div class="bk-stat-card__note">' + note + '</div>';
    h +=   '</div>';
    h +=   '<div class="bk-stat-card__count">' + count + '건</div>';
    h += '</div>';
    if (isMobile && !open) {
      h += '<div class="bk-stat-card__compact">';
      h +=   '<span>완료 ' + done + ' · 예정 ' + upcoming + '</span>';
      h +=   '<span class="bk-stat-card__caret" style="display:inline-flex;align-items:center;"><svg width="13" height="13" aria-hidden="true"><use href="#ic-chevron-right"/></svg></span>';
      h += '</div>';
    } else {
      h += '<div class="bk-stat-card__row">';
      h +=   '<div class="bk-stat-card__cell"><span class="bk-stat-card__cell-label">완료</span><span class="bk-stat-card__cell-val">' + done + '</span></div>';
      h +=   '<div class="bk-stat-card__cell"><span class="bk-stat-card__cell-label">예정</span><span class="bk-stat-card__cell-val">' + upcoming + '</span></div>';
      h +=   '<div class="bk-stat-card__cell"><span class="bk-stat-card__cell-label">노쇼</span><span class="bk-stat-card__cell-val">' + noShow + '</span></div>';
      h +=   '<div class="bk-stat-card__cell is-cancel"><span class="bk-stat-card__cell-label">취소</span><span class="bk-stat-card__cell-val">' + cancel + '</span></div>';
      h += '</div>';
    }
    h += '</' + tag + '>';
    return h;
  }

  function _renderStats() {
    const s = _calcStats(_mappedCache);
    return '<div class="bk-stats" style="display:flex;flex-direction:column;gap:14px;">'
         + _renderStatCard('today', s)
         + _renderStatCard('view', s)
         + '</div>';
  }

  // 모바일 카드 영역 — 뷰별 다른 노출 + 접힘 토글
  const _mobileCardOpen = { today: false, view: false };
  function _renderMobileCards() {
    const s = _calcStats(_mappedCache);
    const single = (_curView === 'week');
    let h = '<div class="bk-stat-mobile-row' + (single ? ' is-single' : '') + '" id="bk-mobile-stats">';
    h += _renderStatCard('today', s, { mobile: true, open: _mobileCardOpen.today });
    if (!single) h += _renderStatCard('view', s, { mobile: true, open: _mobileCardOpen.view });
    h += '</div>';
    return h;
  }
  function _bindMobileCards(root) {
    if (!root) return;
    root.querySelectorAll('.bk-stat-card--m').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.card;
        if (k !== 'today' && k !== 'view') return;
        _mobileCardOpen[k] = !_mobileCardOpen[k];
        _refreshMobileCards();
      });
    });
  }
  function _refreshMobileCards() {
    const o = _overlay(); if (!o) return;
    const mount = o.querySelector('#bk-mobile-stats-mount');
    if (!mount) return;
    mount.innerHTML = _renderMobileCards();
    _bindMobileCards(mount);
  }

  // [2026-05-24] 모바일 헤더 sub — 뷰 따라 이번달/이번주/그날 카운트
  function _viewSubText() {
    const s = _calcStats(_mappedCache);
    return s.viewGroupLabel + ' 예약 ' + s.viewCnt + '건';
  }

  function _renderPCLeft() {
    return _renderMiniCal() + _renderStats();
  }

  // ============================================================
  // §14 툴바 (직원 칩 + 뷰 토글) — 모바일/PC 공용
  // ============================================================
  function _renderToolbar() {
    let h = '<div class="bk-toolbar">';
    // [2026-05-23] 직원 칩 제거 — 직원 기능 폐지
    h += '<div class="bk-view">';
    // [v200 DAY_VIEW_HIDDEN] 일간 탭 제거 — 1인 샵에 과한 디테일.
    ['month','week'].forEach(v => {
      const lbl = { month: '월', week: '주' }[v];
      h += '<button class="bk-view__btn' + (v === _curView ? ' is-on' : '') + '" data-view="' + v + '">' + lbl + '</button>';
    });
    h += '</div>';
    h += _renderLegend();
    h += '</div>';
    return h;
  }

  // [2026-05-26] 예약 상태 색상 범례 — 취소 제거, status 3개로 일원화
  function _renderLegend() {
    return (
      '<div class="bk-legend" aria-label="예약 상태 범례">' +
        '<span class="bk-legend__item"><i class="bk-legend__dot" style="background:#5B7FC4"></i>확정</span>' +
        '<span class="bk-legend__item"><i class="bk-legend__dot" style="background:#16B55E"></i>완료</span>' +
        '<span class="bk-legend__item"><i class="bk-legend__dot" style="background:#E5484D"></i>노쇼</span>' +
      '</div>'
    );
  }

  // ============================================================
  // §15 모바일 진입 — 시트 오버레이
  // ============================================================
  function _renderMobileLayout() {
    // [2026-05-24] 뷰 연동 subTxt (이번달/이번주 카운트)
    const subTxt = _viewSubText();
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
            <svg width="14" height="14" aria-hidden="true"><use href="#ic-chevron-left"/></svg>
          </button>
          <div class="bk-header__title-wrap">
            <div style="display:flex;align-items:center;gap:6px;">
              <button id="bk-month-prev" aria-label="이전 달" style="background:none;border:none;font-size:16px;cursor:pointer;padding:4px 6px;color:var(--text-primary,#333);">&lt;</button>
              <div class="bk-header__month" id="bk-month-label">${_curYear}년 ${_curMonth}월</div>
              <button id="bk-month-next" aria-label="다음 달" style="background:none;border:none;font-size:16px;cursor:pointer;padding:4px 6px;color:var(--text-primary,#333);">&gt;</button>
            </div>
            <div class="bk-header__sub" id="bk-month-sub">${subTxt}</div>
            <span id="cal-offline-badge" style="display:none;font-size:11px;font-weight:700;color:var(--danger);background:rgba(220,53,69,.1);padding:2px 8px;border-radius:999px;margin-left:6px;">오프라인</span>
          </div>
          <button class="bk-today-btn" id="bk-today-btn">오늘</button>
        </div>
        <div id="bk-toolbar-mount">${_renderToolbar()}</div>
        <div id="bk-mobile-stats-mount">${_renderMobileCards()}</div>
        <div class="cal-body bk-body" id="bk-body" style="flex:1;display:flex;flex-direction:column;overflow:hidden;"></div>
        <button class="bk-fab" id="bk-fab" aria-label="예약 추가" style="font-size:26px;font-weight:600;line-height:1;">+</button>
      </div>`;
    o.addEventListener('click', e => { if (e.target === o) _close(); });
    document.body.appendChild(o);
    _bindHeader(o);
    _bindToolbar(o);
    _bindMobileCards(o.querySelector('#bk-mobile-stats-mount'));
    _bindEscClose();
    _renderViewBody();
  }

  // ============================================================
  // §16 PC 진입 — myshop-v3 의 .ms-side 재사용
  // ============================================================
  function _buildPCHeaderHTML(_subTxt) {
    // [v200 DAY_VIEW_HIDDEN] 일간 탭 제거 — PC 도 동일.
    const viewBtns = ['month','week'].map(v => {
      const lbl = { month:'월', week:'주' }[v];
      return '<button class="bk-view__btn' + (v === _curView ? ' is-on' : '') + '" data-view="' + v + '">' + lbl + '</button>';
    }).join('');
    return `
        <div class="bk-pc__header">
          <button class="bk-header__back" id="bk-back" aria-label="닫기" title="ESC 또는 클릭으로 닫기">
            <svg width="16" height="16" aria-hidden="true"><use href="#ic-x"/></svg>
          </button>
          <div class="bk-pc__title">예약</div>
          <div class="bk-pc__month-nav">
            <button class="bk-pc__nav-btn" id="bk-pc-prev" aria-label="이전 달">
              <svg width="14" height="14" aria-hidden="true"><use href="#ic-chevron-left"/></svg>
            </button>
            <div class="bk-pc__month-label" id="bk-month-label">${_curYear}년 ${_curMonth}월</div>
            <button class="bk-pc__nav-btn" id="bk-pc-next" aria-label="다음 달">
              <svg width="14" height="14" aria-hidden="true"><use href="#ic-chevron-right"/></svg>
            </button>
          </div>
          <button class="bk-today-btn" id="bk-today-btn" style="margin-left:4px;">오늘</button>
          <div class="bk-pc__spacer"></div>
          <!-- [2026-05-24] #bk-pc-stats (이번달 N건·매출) 제거 — 좌측 통계로 일원화 -->
          <div class="bk-view">${viewBtns}</div>
          ${_renderLegend()}
          <button class="bk-pc__add-btn" id="bk-pc-add">+ 예약 추가</button>
          <span id="cal-offline-badge" style="display:none;font-size:11px;font-weight:700;color:var(--danger);background:rgba(220,53,69,.1);padding:2px 8px;border-radius:999px;">오프라인</span>
        </div>`;
  }

  function _renderPCLayout() {
    // [2026-05-24] PC 헤더 stats 제거 — subTxt 더 이상 사용 안 함 (호환 위해 빈 문자열)
    const subTxt = '';
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
    // [A1] 모바일 달 이동 버튼
    o.querySelector('#bk-month-prev')?.addEventListener('click', _prevMonth);
    o.querySelector('#bk-month-next')?.addEventListener('click', _nextMonth);
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
    // [2026-05-23] 직원 칩 클릭 위임 제거 — 직원 기능 폐지
    // 뷰 토글
    o.querySelectorAll('.bk-toolbar .bk-view__btn').forEach(btn => {
      btn.addEventListener('click', () => _switchView(btn.dataset.view));
    });
  }

  function _bindPCLeft(o) {
    const left = o.querySelector('#bk-pc-left'); if (!left) return;
    // 미니 캘린더 nav — 헤더 월/뷰 본문도 같이 이동 (단일 source of truth)
    left.querySelectorAll('[data-mini-nav]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!_miniMonth) _miniMonth = { y: _curYear, m: _curMonth };
        if (btn.dataset.miniNav === 'prev') {
          _miniMonth.m--; if (_miniMonth.m < 1) { _miniMonth.m = 12; _miniMonth.y--; }
        } else {
          _miniMonth.m++; if (_miniMonth.m > 12) { _miniMonth.m = 1; _miniMonth.y++; }
        }
        _curYear = _miniMonth.y;
        _curMonth = _miniMonth.m;
        _reloadAndRender();
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
    // [2026-05-23] 좌측 직원 토글 클릭 제거 — 직원 기능 폐지
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
    // [2026-07-25 #5] 목록으로 돌아온다 = 예약 폼은 닫힌 상태. 폼 시트-백 정리(멱등 — 폼 안 열렸으면 no-op).
    //   저장/삭제/취소/back 등 모든 폼 나가기 경로가 여길 지나므로 history 엔트리 누적을 한 곳에서 막는다.
    try { if (typeof window._markSheetClosed === 'function') window._markSheetClosed('cvBookingForm'); } catch (_e) { void _e; }
    _updateOfflineBadge();
    _updateHeaderLabel();
    _saveState();

    if (_curView === 'month') {
      const visible = _visibleCache();
      const html = _cachedIsPC ? _renderMonthPC(_curYear, _curMonth, visible)
                               : _renderMonthMobile(_curYear, _curMonth, visible);
      body.innerHTML = html;
      _bindMonthCells(body);
    } else if (_curView === 'week') {
      _renderWeekView(body);
    } else {
      _renderDayView(body);
    }
    _refreshPCLeft();
    _refreshMobileCards();
  }

  function _renderWeekView(body) {
    const visible = _visibleCache();
    if (_cachedIsPC) {
      const r = _renderWeekPC(_curDate, visible);
      body.innerHTML = r.html;
      const grid = body.querySelector('#bk-week-grid');
      _placeWeekPCBlocks(grid, r.items, r.start, r.ws);
      _bindTimetable(body, _curDate);
    } else {
      // [2026-05-26] 모바일 주간 — date strip 제거 (요일 헤더와 중복).
      // _renderDateStripMobile 은 day 뷰에서만 호출.
      const r = _renderWeekMobile(_curDate, visible);
      body.innerHTML = r.html;
      const grid = body.querySelector('#bk-week-m-grid');
      _placeWeekMBlocks(grid, r.items, r.start, r.ws);
      _bindTimetable(body, _curDate);
    }
  }

  function _renderDayView(body) {
    const visible = _visibleCache();
    if (_cachedIsPC) {
      const r = _renderDayPC(_curDate, visible);
      body.innerHTML = r.html;
      const grid = body.querySelector('#bk-pc-day-grid');
      _placeDayPCBlocks(grid, r.items, r.start);
      _bindTimetable(body, _curDate);
    } else {
      const strip = _renderDateStripMobile(_curDate, visible);
      const r = _renderDayMobile(_curDate, visible);
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

  function _bindMonthCells(body) {
    if (!body || body.dataset.calMonthBound === '1') return;
    body.dataset.calMonthBound = '1';
    body.addEventListener('click', e => {
      const cell = e.target.closest('[data-cal-day]');
      if (cell && body.contains(cell)) window._calSelectDay(cell.dataset.calDay);
    });
    body.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const cell = e.target.closest('[data-cal-day]');
      if (!cell || !body.contains(cell)) return;
      e.preventDefault();
      window._calSelectDay(cell.dataset.calDay);
    });
  }

  function _bindDateStrip(body) {
    if (!body || body.dataset.calDateStripBound === '1') return;
    body.dataset.calDateStripBound = '1';
    body.addEventListener('click', e => {
      const btn = e.target.closest('.bk-date[data-date]');
      if (btn && body.contains(btn)) window._calSelectDayChip(btn.dataset.date);
    });
  }

  function _updateHeaderLabel() {
    const o = _overlay(); if (!o) return;
    const lbl = o.querySelector('#bk-month-label');
    if (!lbl) return;
    if (_curView === 'week') {
      const ws = new Date(_curDate); ws.setHours(0,0,0,0);
      ws.setDate(ws.getDate() - ws.getDay());
      const y = ws.getFullYear(), m = ws.getMonth() + 1;
      // n번째 주 — ws 가 속한 월의 1일이 속한 일요일 기준으로 카운트
      const monthFirst = new Date(y, m - 1, 1);
      const firstSun = new Date(monthFirst); firstSun.setDate(1 - monthFirst.getDay());
      const weekIdx = Math.floor((ws - firstSun) / (7 * 24 * 60 * 60 * 1000)) + 1;
      lbl.textContent = y + '년 ' + m + '월 ' + weekIdx + '째 주';
    } else if (_curView === 'day') {
      lbl.textContent = _curDate.getFullYear() + '년 ' + (_curDate.getMonth() + 1) + '월 ' + _curDate.getDate() + '일';
    } else {
      lbl.textContent = _curYear + '년 ' + _curMonth + '월';
    }
    const sub = o.querySelector('#bk-month-sub');
    if (sub) sub.textContent = _viewSubText();
    // [2026-05-24] PC #bk-pc-stats 갱신 분기 제거 — 헤더에서 통째 삭제됨
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
        // [2026-06-14 QA] 주간뷰에서 기존 예약 위를 클릭해도 블록 핸들러가 안 잡혀
        //   "신규 예약 추가"가 뜨던 문제. 클릭 시간대에 예약이 있으면 그 예약을 연다(폴백).
        const _covering = (_visibleCache() || []).find(it => {
          const raw = it._raw || it;
          if (!raw || !raw.starts_at) return false;
          const s = new Date(raw.starts_at), e = new Date(raw.ends_at || raw.starts_at);
          return _ds(s) === ymd && s <= startD && startD < e;
        });
        if (_covering) {
          const raw = _covering._raw || _covering;
          if (window.CompleteFlow?.startFromBooking) window.CompleteFlow.startFromBooking(raw);
          else _openForm(new Date(raw.starts_at), raw);
          return;
        }
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
    const conflict = window.Booking?.findConflict?.(newStart.toISOString(), newEnd.toISOString(), bookingItem.id) || null;
    slotEl.classList.add(conflict ? 'cv-drop-conflict' : 'cv-drop-target');
    return { ymd, hr, conflict, newStart, newEnd };
  }

  // drag-drop helper — drop 후 PATCH 저장
  async function _commitDragDrop(dropped, bookingItem) {
    if (!dropped || dropped.conflict || !bookingItem) {
      if (dropped?.conflict && window.showToast) window.showToast(_conflictMsg(dropped.conflict));
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

  // [Phase4] 예약 카드 탭 → 읽기전용 상세 시트(완료/매출 UI 가 바로 열리지 않음). 버튼으로 수정/완료/취소/닫기.
  function _bookingStatusLabel(s) {
    return s === 'cancelled' ? '취소됨' : s === 'no_show' ? '노쇼' : s === 'done' ? '완료' : '예약 확정';
  }
  function _openBookingDetail(raw) {
    if (!raw) return;
    // [핫픽스F #4] 예약/고객 카드 탭 기본동작 = "시술 완료 시트" 직행(액션 선택 모달 아님).
    //   시술완료 시트 안에 수정(⋯ 메뉴)·노쇼·예약취소(하단 보조)가 모두 들어있어 4버튼 모달 불필요.
    //   이미 끝난 예약(완료/취소/노쇼)만 읽기용 상세(수정/복구) 모달로 폴백.
    const _resolved = ['cancelled', 'no_show', 'done', 'completed'].includes(raw.status);
    if (!_resolved && window.CompleteFlow && typeof window.CompleteFlow.startFromBooking === 'function') {
      try { window.CompleteFlow.startFromBooking(raw); return; } catch (_cf) { void _cf; /* 실패 시 아래 상세 모달 폴백 */ }
    }
    const esc = (s) => (window._esc ? window._esc(String(s == null ? '' : s)) : String(s == null ? '' : s));
    // [핫픽스D #8] 사람이 읽는 한글 일시 — "2026-06-19 13:00~16:00" 같은 ISO/숫자 표기 금지.
    const whenStr = (typeof window.fmtKRange === 'function')
      ? window.fmtKRange(raw.starts_at, raw.ends_at || null)
      : (() => { try { const d = new Date(raw.starts_at); return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + (d.getHours() < 12 ? '오전' : '오후') + ' ' + ((d.getHours() % 12) || 12) + ':' + _pad(d.getMinutes()); } catch (_e) { return ''; } })();
    const statusLabel = _bookingStatusLabel(raw.status);
    const statusColor = raw.status === 'cancelled' ? '#BC6675' : raw.status === 'no_show' ? '#8B95A1' : raw.status === 'done' ? '#16B55E' : '#3182F6';
    const old = document.getElementById('cv-booking-detail'); if (old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'cv-booking-detail';
    ov.style.cssText = 'position:fixed;inset:0;z-index:10040;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center;';
    // [핫픽스D #4·#7] 라벨:값 나열형(AI 티나는 텍스트 카드) 제거 → 흰 배경 카드(고객명 타이틀+상태 배지+정보 블록).
    const info = [];
    if (raw.service_name) info.push(`<div style="font-size:14px;color:var(--text,#222);font-weight:600;">${esc(raw.service_name)}</div>`);
    info.push(`<div style="font-size:14px;color:var(--text-subtle,#4E5968);margin-top:4px;">${esc(whenStr)}</div>`);
    const money = [];
    if (raw.deposit != null && +raw.deposit > 0) money.push('예약금 ' + (+raw.deposit).toLocaleString() + '원');
    if (raw.amount != null && +raw.amount > 0) money.push('예상 시술비 ' + (+raw.amount).toLocaleString() + '원');
    if (money.length) info.push(`<div style="font-size:13px;color:var(--text-subtle,#8B95A1);margin-top:6px;">${esc(money.join('  ·  '))}</div>`);
    const _memoDisp = raw.memo ? (window.itdCleanMemo ? window.itdCleanMemo(String(raw.memo)) : String(raw.memo)) : '';
    if (_memoDisp) info.push(`<div style="font-size:13px;color:var(--text-subtle,#8B95A1);margin-top:6px;white-space:pre-line;">메모 ${esc(_memoDisp)}</div>`);
    ov.innerHTML = `
      <div style="background:var(--surface,#fff);width:100%;max-width:460px;border-radius:20px 20px 0 0;padding:18px 18px calc(18px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));max-height:80vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;">
          <div style="display:flex;align-items:center;gap:8px;min-width:0;">
            <strong style="font-size:18px;color:var(--text,#191F28);">${esc(raw.customer_name || '고객 미지정')}</strong>
            <span style="flex-shrink:0;font-size:12px;font-weight:700;color:${statusColor};background:${statusColor}1A;border-radius:999px;padding:3px 9px;">${esc(statusLabel)}</span>
          </div>
          <button type="button" data-bd="close" aria-label="닫기" style="border:none;background:transparent;font-size:22px;color:var(--text-subtle,#999);cursor:pointer;line-height:1;flex-shrink:0;">×</button>
        </div>
        <div style="margin-bottom:16px;">${info.join('')}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <button type="button" data-bd="edit" data-haptic style="padding:12px;border-radius:14px;border:1px solid var(--accent2,#e26a85);background:transparent;color:var(--accent2,#e26a85);font-weight:800;cursor:pointer;">수정</button>
          <button type="button" data-bd="done" data-haptic style="padding:12px;border-radius:14px;border:none;background:linear-gradient(135deg,var(--accent,#D58A95),var(--accent2,#e26a85));color:#fff;font-weight:800;cursor:pointer;">시술 완료</button>
          <button type="button" data-bd="cancel" data-haptic style="padding:12px;border-radius:14px;border:1px solid var(--line,#ddd);background:transparent;color:var(--text-subtle,#888);font-weight:700;cursor:pointer;">예약 취소</button>
          <button type="button" data-bd="close2" data-haptic style="padding:12px;border-radius:14px;border:1px solid var(--line,#ddd);background:transparent;color:var(--text,#444);font-weight:700;cursor:pointer;">닫기</button>
        </div>
      </div>`;
    if (window.ItdasyMountOverlay) window.ItdasyMountOverlay(ov); else document.body.appendChild(ov);
    // [Phase3-B #10] 공통 시트-백 레지스트리 사용 — Android/브라우저 back 으로 상세만 닫히고
    //   캘린더는 그대로 유지(내샵관리/홈으로 튀지 않게). close 는 멱등.
    const closeDetail = () => { try { ov.remove(); } catch (_e) { void _e; } };
    if (typeof window._registerSheet === 'function') window._registerSheet('cvBookingDetail', closeDetail);
    if (typeof window._markSheetOpen === 'function') window._markSheetOpen('cvBookingDetail');
    const close = () => {
      closeDetail();
      if (typeof window._markSheetClosed === 'function') window._markSheetClosed('cvBookingDetail');
    };
    let _cancelBusy = false;   // [Phase3-B #8] 중복 클릭 방지
    ov.addEventListener('click', (e) => {
      if (e.target === ov) return close();
      const t = e.target.closest('[data-bd]'); if (!t) return;
      const act = t.dataset.bd;
      if (act === 'close' || act === 'close2') return close();
      if (act === 'edit') { close(); _openForm(new Date(raw.starts_at), raw); return; }
      if (act === 'done') { close(); if (window.CompleteFlow && window.CompleteFlow.startFromBooking) window.CompleteFlow.startFromBooking(raw); else _openForm(new Date(raw.starts_at), raw); return; }
      if (act === 'cancel') {
        if (_cancelBusy) return;
        // [Phase3-B #8] 즉시 취소 금지 — 확인 후에만. '아니요' 면 상세 유지(닫지 않음).
        window._inlineConfirm('이 예약을 취소할까요?', async () => {
          if (_cancelBusy) return;
          _cancelBusy = true;
          try {
            await window.Booking.update(raw.id, { status: 'cancelled' });
            // [Phase3-B #8] 잇비 "복구해/되돌리기" 로 복원 가능하게 최근 취소 context 저장.
            try {
              window.ItdasyBookingContext && window.ItdasyBookingContext.rememberAction && window.ItdasyBookingContext.rememberAction({
                kind: 'cancel_booking',
                payload: { booking_id: raw.id, customer_id: raw.customer_id || null, customer_name: raw.customer_name || '', service_name: raw.service_name || '', starts_at: raw.starts_at || '', ends_at: raw.ends_at || '' },
                _context_booking: raw,
              }, {});
            } catch (_e) { void _e; }
            window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'update_booking', booking_id: raw.id } }));
            if (window.showToast) window.showToast('예약을 취소했어요');
            close();   // [Phase3-B #8] 성공했을 때만 상세 닫기
            _mappedCache = await _loadMonth(_curYear, _curMonth);
            _renderViewBody();
          } catch (err) {
            // [Phase3-B #8] 실패 시 상세 유지 + UI 를 취소 상태로 바꾸지 않음.
            if (window.showToast) window.showToast('취소 실패: ' + (window._humanError ? window._humanError(err) : '잠시 후 다시 시도해주세요'));
          } finally { _cancelBusy = false; }
        }, function () { /* 아니요 — 예약 상세 유지, 예약 그대로 */ }, { okText: '예약 취소', cancelText: '아니요' });
      }
    });
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
      ctx.item = _mappedCache.find(m => String(m.id) === btn.dataset.bookingId);
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
        // 폴백: ctx.item이 null이면 재탐색 (strict + loose)
        if (!ctx.item) {
          ctx.item = _mappedCache.find(m => String(m.id) === btn.dataset.bookingId)
                  || _mappedCache.find(m => String(m.id) === String(btn.dataset.bookingId));
        }
        if (ctx.item) {
          // [2026-05-22] 모든 status 에서 CompleteFlow 우선 (사장 요청: 예약 카드 + 시술완료 체크).
          // 옛 분기는 cancelled 만 편집폼이라 picker 만 뜨는 회귀 인식 → 통일.
          // CompleteFlow 안에 "예약 시간·고객 수정" 링크로 편집폼 진입은 그대로.
          const raw = ctx.item._raw;
          btn._cfOpenedAt = Date.now();   // [2026-06-11 QA] click 폴백 이중 오픈 방지 마킹
          _openBookingDetail(raw);   // [Phase4] 완료 UI 바로 X — 읽기전용 상세 먼저
        } else {
          console.warn('[BK] 블록 클릭 매칭 실패:', btn.dataset.bookingId, _mappedCache.map(m => m.id));
        }
        return;
      }
      e.preventDefault();
      const dropped = ctx.dragColEl;
      cleanup();
      await _commitDragDrop(dropped, ctx.item);
    });
    btn.addEventListener('pointercancel', cleanup);
    // [2026-06-11 QA] 갤럭시 실측: 터치 스크롤 제스처와 겹치면 pointerup 이 pointercancel 로
    //   끊겨 완료 카드가 안 뜨고, 합성 click 만 남는 케이스 — click 폴백으로 보강.
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (ctx.dragMode) return;
      if (btn._cfOpenedAt && Date.now() - btn._cfOpenedAt < 600) return; // pointerup 이 이미 처리
      const item = ctx.item
        || _mappedCache.find(m => String(m.id) === String(btn.dataset.bookingId));
      if (!item) return;
      btn._cfOpenedAt = Date.now();
      const raw = item._raw;
      _openBookingDetail(raw);   // [Phase4] 완료 UI 바로 X — 읽기전용 상세 먼저
    });
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

  // [2026-05-29] 시/분 → 휠 3개 인덱스 (오전/오후, 1~12, 10분 단위)
  function _h24toWheel(h, m) {
    const ap = h < 12 ? 0 : 1;
    const h12 = (h % 12) === 0 ? 12 : (h % 12);
    const m10 = Math.round(m / 10) * 10;
    return { ap, h12, m10: m10 >= 60 ? 50 : m10 };
  }
  function _wheelTo24(ap, h12, m10) {
    let h = h12 % 12;
    if (ap === 1) h += 12;
    return { h, m: m10 };
  }

  function _buildFormHTML(existing, slots, dateStr, defStart, defEnd, _autoSlot) {
    const isEdit = !!existing;
    const [defH, defM] = defStart.split(':').map(Number);
    const [endH, endM] = defEnd.split(':').map(Number);
    const durMin = ((endH * 60 + endM) - (defH * 60 + defM)) || 60;
    const dd = new Date(dateStr + 'T00:00:00');
    const DOW = ['일','월','화','수','목','금','토'];
    const dateLabel = (dd.getMonth()+1) + '월 ' + dd.getDate() + '일 ' + DOW[dd.getDay()] + '요일';
    const dayCnt = (_mappedCache || []).filter(it => _ds(new Date(it.starts_at)) === dateStr && it.status !== 'cancelled' && it.status !== 'no_show').length;
    // 휠 3개
    const startW = _h24toWheel(defH, defM);
    const apRows = ['오전','오후'].map((lbl, i) =>
      `<div class="bf-tp-row${i === startW.ap ? ' current' : ''}" data-val="${i}">${lbl}</div>`).join('');
    let h12Rows = '';
    // [2026-05-29] 12시부터 시작 — [12, 1, 2, ..., 11]
    const H12_ORDER = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    H12_ORDER.forEach(i => { h12Rows += `<div class="bf-tp-row${i === startW.h12 ? ' current' : ''}" data-val="${i}">${i}</div>`; });
    let m10Rows = '';
    for (let v = 0; v < 60; v += 10) m10Rows += `<div class="bf-tp-row${v === startW.m10 ? ' current' : ''}" data-val="${v}">${_pad(v)}</div>`;

    // 예상 종료 라벨 (12시간제)
    const _endLbl = (mins) => {
      const eh24 = Math.floor(mins / 60) % 24, em = mins % 60;
      const ap = eh24 < 12 ? '오전' : '오후';
      const eh12 = (eh24 % 12) === 0 ? 12 : (eh24 % 12);
      return `${ap} ${eh12}:${_pad(em)}`;
    };
    const endTimeLabel = _endLbl(defH * 60 + defM + durMin);

    // 오늘/이번주 카운트 (좌측 정보 카드용)
    const _todayKey = _ds(new Date());
    const _isActive = (it) => it.status !== 'cancelled' && it.status !== 'no_show';
    const _todayCnt = (_mappedCache || []).filter(it => _ds(new Date(it.starts_at)) === _todayKey && _isActive(it)).length;
    const _now = new Date();
    const _wkStart = new Date(_now); _wkStart.setDate(_now.getDate() - _now.getDay()); _wkStart.setHours(0,0,0,0);
    const _wkEnd = new Date(_wkStart); _wkEnd.setDate(_wkStart.getDate() + 7);
    const _weekCnt = (_mappedCache || []).filter(it => {
      const t = new Date(it.starts_at).getTime();
      return t >= _wkStart.getTime() && t < _wkEnd.getTime() && _isActive(it);
    }).length;
    const _today = new Date();
    const _todayLabel = `${_today.getMonth()+1}/${_today.getDate()}(${['일','월','화','수','목','금','토'][_today.getDay()]})`;

    let html = `<button class="cv-form-back" id="cv-form-back"><svg width="15" height="15" aria-hidden="true" style="vertical-align:-3px"><use href="#ic-arrow-left"/></svg> 뒤로</button>`;
    html += `<div class="bf-root">`;
    // 좌측 사이드 (PC ≥1100px 만) — 오늘 / 이번주 정보 카드
    html += `<aside class="bf-side-left">
      <div class="bf-card"><div class="bf-side-label">오늘</div><div class="bf-side-date">${_todayLabel}</div><div class="bf-side-meta">${_todayCnt}건</div></div>
      <div class="bf-card"><div class="bf-side-label">이번주</div><div class="bf-side-meta">${_weekCnt}건 예약</div></div>
    </aside>`;
    html += `<section class="bf-center">`;
    if (isEdit) {
      html += `<div class="bf-card"><div class="bf-label">상태</div><div class="bf-status-row">
        <button type="button" data-bf-status="confirmed" class="bf-status-btn${existing.status==='confirmed'?' on':''}">확정</button>
        <button type="button" data-bf-status="completed" class="bf-status-btn${existing.status==='completed'?' on bf-st-completed':''}">완료</button>
        <button type="button" data-bf-status="no_show" class="bf-status-btn${existing.status==='no_show'?' on bf-st-noshow':''}">안 옴</button>
        <button type="button" data-bf-status="cancelled" class="bf-status-btn${existing.status==='cancelled'?' on':''}">취소</button>
      </div></div>`;
    }
    // 날짜 카드 (라벨 제거)
    const metaText = dayCnt > 0 ? `${dayCnt}건 예약됨` : '';
    html += `<div class="bf-card">
      <button type="button" class="bf-date-card" id="bfDateCard">
        <div class="bf-date-info">
          <div class="bf-date-text" id="bfDateLabel">${dateLabel}</div>
          <div class="bf-date-meta" id="bfDateMeta">${metaText}</div>
        </div>
        <span class="bf-date-chev" aria-hidden="true" style="display:inline-flex;align-items:center;"><svg width="17" height="17"><use href="#ic-chevron-right"/></svg></span>
      </button>
      <input type="date" id="bfDate" class="bf-date-native" value="${dateStr}" />
    </div>`;
    // 시간 휠 (3개)
    html += `<div class="bf-card compact">
      <div class="bf-time-picker">
        <div class="bf-tp-selection"></div>
        <div class="bf-tp-wheel" id="bfWheelAP"><div class="bf-tp-inner">${apRows}</div></div>
        <div class="bf-tp-wheel" id="bfWheelH12"><div class="bf-tp-inner">${h12Rows}</div></div>
        <div class="bf-tp-wheel" id="bfWheelM10"><div class="bf-tp-inner">${m10Rows}</div></div>
      </div>
    </div>`;
    // 소요 시간
    const DUR_PRESETS = [60, 90, 120, 180];
    const isPreset = DUR_PRESETS.includes(durMin);
    const durChips = DUR_PRESETS.map(d =>
      `<button type="button" class="bf-dur-chip${d === durMin ? ' on' : ''}" data-dur="${d}">${d}분</button>`
    ).join('') +
    `<button type="button" class="bf-dur-chip${!isPreset ? ' on' : ''}" data-dur="custom" id="bfDurCustom">${!isPreset ? durMin + '분' : '+ 직접'}</button>`;
    html += `<div class="bf-card">
      <div class="bf-dur-head">
        <div class="bf-label" style="margin-bottom:0">소요 시간</div>
        <div class="bf-dur-end" id="bfDurEnd">예상 종료 ${endTimeLabel}</div>
      </div>
      <div class="bf-dur-chips" id="bfDurChips">${durChips}</div>
      <input type="hidden" id="bfDurVal" value="${durMin}" />
    </div>`;
    // 고객 카드 (라벨 제거, + 박스 → 좌측 직선)
    html += `<div class="bf-card">
      <button type="button" class="bf-cust-card${existing?.customer_name ? '' : ' empty'}" id="bfCustCard">
        ${existing?.customer_name
          ? `<div class="bf-cust-bar"></div>
             <div class="bf-cust-info"><div class="bf-cust-name">${_esc(existing.customer_name)}</div><div class="bf-cust-meta" id="bfCustMeta"></div></div>
             <button type="button" class="bf-cust-clear" id="bfCustClear" aria-label="고객 해제">×</button>`
          : `<div class="bf-cust-bar empty"></div>
             <div class="bf-cust-info"><div class="bf-cust-empty-text">고객 골라주세요</div></div>
             <span class="bf-cust-chev" aria-hidden="true" style="display:inline-flex;align-items:center;"><svg width="17" height="17"><use href="#ic-chevron-right"/></svg></span>`}
      </button>
      <input type="hidden" id="bfCustName" value="${_esc(existing?.customer_name || '')}" />
      <div id="bfAiBriefMount" style="margin-top:10px;"></div>
    </div>`;
    // 시술 카드 — 칩 + 잇비 한 마디 + (모바일) 금액 라인 통합
    const _initAmt0 = Number(existing?.amount) || 0;
    const _initDep0 = Number(existing?.deposit) || 0;
    const _depCellMobile = _initDep0 > 0
      ? `<span class="bf-money-val" data-money-edit="deposit"><span class="bf-num" data-hv-count="${_initDep0}">${_initDep0.toLocaleString('ko-KR')}</span><span class="bf-money-unit">원</span></span>`
      : `<span class="bf-money-val empty" data-money-edit="deposit"><button type="button" class="bf-amount-link">탭해서 입력 <svg width="13" height="13" aria-hidden="true" style="vertical-align:-1px"><use href="#ic-chevron-right"/></svg></button></span>`;
    html += `<div class="bf-card bf-service-card">
      <div class="bf-svc-pad">
        <div class="bf-svc-head">
          <span class="bf-svc-sub">시술 종류, 자주 받은 순으로 자동 정렬</span>
          <button type="button" class="bf-svc-more" id="bfSvcMore">전체 <svg width="13" height="13" aria-hidden="true" style="vertical-align:-1px"><use href="#ic-chevron-right"/></svg></button>
        </div>
        <div class="bf-svc-chips" id="bfSvcChips"></div>
        <input type="hidden" id="bfSvc" value="${_esc(existing?.service_name || '')}" />
        <input id="bfSvcCustom" class="bf-svc-input" placeholder="시술명 직접 입력" style="display:none" maxlength="50" autocomplete="off" />
      </div>
      <div class="bf-itby-box bf-svc-itby" style="display:none">
        <div class="bf-itby">
          <span class="bf-itby-icon"><svg width="11" height="11" aria-hidden="true"><use href="#ic-bot"/></svg></span>
          <span class="bf-itby-text"></span>
        </div>
      </div>
      <div class="bf-amount-rows">
        <div class="bf-money">
          <div class="bf-money-row amount"><span class="bf-money-key">예상 시술비</span>
            <span class="bf-money-val" data-money-edit="amount"><span class="bf-num" data-hv-count="${_initAmt0}">${_initAmt0 ? _initAmt0.toLocaleString('ko-KR') : '0'}</span><span class="bf-money-unit">원</span></span>
          </div>
          <div class="bf-money-row deposit"><span class="bf-money-key">예상 예약금</span>${_depCellMobile}</div>
          <div class="bf-money-row total"><span class="bf-money-key">잔금</span>
            <span class="bf-money-val"><span class="bf-num bf-balance-num">${Math.max(0, _initAmt0 - _initDep0).toLocaleString('ko-KR')}</span><span class="bf-money-unit">원</span></span>
          </div>
        </div>
      </div>
    </div>`;
    html += `</section>`;
    // 우측 sticky 패널 — 금액 + 메모 + CTA
    const _initAmt = Number(existing?.amount) || 0;
    const _initDep = Number(existing?.deposit) || 0;
    const _depCell = _initDep > 0
      ? `<span class="bf-money-val" data-money-edit="deposit">
          <span class="bf-num" data-hv-count="${_initDep}">${_initDep.toLocaleString('ko-KR')}</span>
          <span class="bf-money-unit">원</span>
        </span>`
      : `<span class="bf-money-val empty" data-money-edit="deposit"><button type="button" class="bf-amount-link">탭해서 입력 <svg width="13" height="13" aria-hidden="true" style="vertical-align:-1px"><use href="#ic-chevron-right"/></svg></button></span>`;
    html += `<aside class="bf-side-right">`;
    html += `<div class="bf-itby-box bf-itby-pc" style="display:none">
      <div class="bf-itby">
        <span class="bf-itby-icon"><svg width="12" height="12" aria-hidden="true"><use href="#ic-bot"/></svg></span>
        <span class="bf-itby-text"></span>
      </div>
    </div>`;
    html += `<div class="bf-card bf-money-card">
      <div class="bf-money">
        <div class="bf-money-row amount">
          <span class="bf-money-key">예상 시술비</span>
          ${_initAmt > 0
            ? `<span class="bf-money-val" data-money-edit="amount">
                <span class="bf-num" data-hv-count="${_initAmt}">${_initAmt.toLocaleString('ko-KR')}</span>
                <span class="bf-money-unit">원</span>
              </span>`
            : `<span class="bf-money-val empty" data-money-edit="amount"><button type="button" class="bf-amount-link">탭해서 입력 <svg width="13" height="13" aria-hidden="true" style="vertical-align:-1px"><use href="#ic-chevron-right"/></svg></button></span>`}
        </div>
        <div class="bf-money-row deposit">
          <span class="bf-money-key">예상 예약금</span>
          ${_depCell}
        </div>
        <div class="bf-money-row total">
          <span class="bf-money-key">잔금</span>
          <span class="bf-money-val">
            <span class="bf-num bf-balance-num" data-hv-count="${Math.max(0, _initAmt - _initDep)}">${Math.max(0, _initAmt - _initDep).toLocaleString('ko-KR')}</span>
            <span class="bf-money-unit">원</span>
          </span>
        </div>
      </div>
      <input type="hidden" id="bfAmount" value="${_initAmt || ''}" />
      <input type="hidden" id="bfDeposit" value="${_initDep || ''}" />
    </div>`;
    html += `<div class="bf-card">
      <button type="button" class="bf-memo-toggle${existing?.memo ? ' open' : ''}" id="bfMemoToggle">
        <span class="bf-memo-toggle-left">
          <span class="bf-memo-icon">▾</span>
          <span class="bf-memo-title">메모</span>
        </span>
        <span class="bf-memo-hint">선택사항</span>
      </button>
      <div class="bf-memo-fields" id="bfMemoFields" style="${existing?.memo ? 'display:block' : 'display:none'}">
        <textarea class="bf-memo" id="bfMemo" placeholder="시술 메모 · 알러지 · 요청사항 등" maxlength="200">${_esc(existing?.memo || '')}</textarea>
        <div class="bf-memo-counter" id="bfMemoCounter">${(existing?.memo || '').length} / 200</div>
      </div>
    </div>`;
    html += `<div id="bfConflict" class="dt-conflict">이 시간에 이미 예약이 있어요</div>`;
    html += `<div class="bf-cta">
      ${isEdit ? '<button type="button" id="bfDelete" class="bf-btn-danger">삭제</button>' : '<button type="button" id="cv-form-back2" class="bf-btn-secondary">취소</button>'}
      <button type="button" id="bfSave" class="bf-btn-primary">${isEdit ? '변경 저장' : '예약 저장'}</button>
    </div>`;
    html += `</aside></div>`;
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
    // 휠 3개에서 24시간제 시작 시간 읽기
    function _readStart() {
      const apEl = body.querySelector('#bfWheelAP .bf-tp-row.current');
      const h12El = body.querySelector('#bfWheelH12 .bf-tp-row.current');
      const m10El = body.querySelector('#bfWheelM10 .bf-tp-row.current');
      const ap = apEl ? parseInt(apEl.dataset.val, 10) : 1;
      const h12 = h12El ? parseInt(h12El.dataset.val, 10) : 2;
      const m10 = m10El ? parseInt(m10El.dataset.val, 10) : 0;
      const c = _wheelTo24(ap, h12, m10);
      _startH = c.h; _startM = c.m;
    }
    _readStart();
    // 초기 소요시간 계산 (hidden input value)
    try {
      const dv = body.querySelector('#bfDurVal');
      if (dv && dv.value) { const n = parseInt(dv.value, 10); if (isFinite(n)) _durMin = n; }
    } catch (_) { /* ignore */ }

    // --- 날짜 카드 → native date picker ---
    const dateCard = body.querySelector('#bfDateCard');
    const dateInput = body.querySelector('#bfDate');
    if (dateCard && dateInput) {
      dateCard.addEventListener('click', () => dateInput.showPicker ? dateInput.showPicker() : dateInput.click());
      dateInput.addEventListener('change', () => {
        const d = new Date(dateInput.value + 'T00:00:00');
        const DOW2 = ['일','월','화','수','목','금','토'];
        const dLbl = (d.getMonth()+1) + '월 ' + d.getDate() + '일 ' + DOW2[d.getDay()] + '요일';
        const lbl = body.querySelector('#bfDateLabel'); if (lbl) lbl.textContent = dLbl;
        const sideLbl = body.querySelector('#bfSideDate'); if (sideLbl) sideLbl.textContent = dLbl;
        const cnt = (_mappedCache || []).filter(it => _ds(new Date(it.starts_at)) === dateInput.value && it.status !== 'cancelled' && it.status !== 'no_show').length;
        const meta = body.querySelector('#bfDateMeta');
        if (meta) meta.textContent = cnt > 0 ? cnt + '건 예약됨' : '';
        const sideMeta = body.querySelector('#bfSideMeta');
        if (sideMeta) sideMeta.textContent = cnt > 0 ? cnt + '건 예약됨' : '';
        _checkConflict();
      });
    }

    // --- 소요시간 칩 (60/90/120/180 + 직접) ---
    const _DUR_PRESETS = [60, 90, 120, 180];
    function _updateDur() {
      _readStart();
      const endMin = _startH * 60 + _startM + _durMin;
      const eh24 = Math.floor(endMin / 60) % 24, em = endMin % 60;
      const _ap = eh24 < 12 ? '오전' : '오후';
      const _eh12 = (eh24 % 12) === 0 ? 12 : (eh24 % 12);
      const endEl = body.querySelector('#bfDurEnd');
      if (endEl) endEl.textContent = `예상 종료 ${_ap} ${_eh12}:${_pad(em)}`;
      const hv = body.querySelector('#bfDurVal');
      if (hv) hv.value = String(_durMin);
      // 칩 active 동기화
      const isPreset = _DUR_PRESETS.includes(_durMin);
      body.querySelectorAll('.bf-dur-chip').forEach(ch => {
        const v = ch.dataset.dur;
        if (v === 'custom') {
          ch.classList.toggle('on', !isPreset);
          ch.textContent = !isPreset ? (_durMin + '분') : '+ 직접';
        } else {
          ch.classList.toggle('on', String(_durMin) === v);
        }
      });
      _checkConflict();
    }
    body.querySelectorAll('.bf-dur-chip').forEach(ch => {
      ch.addEventListener('click', () => {
        const v = ch.dataset.dur;
        if (v === 'custom') {
          window._inlinePrompt('소요 시간 (분)', String(_durMin), (raw) => {
            const n = parseInt(raw, 10);
            if (!isFinite(n) || n < 5 || n > 600) {
              if (window.showToast) window.showToast('5~600 분 사이로 입력해 주세요');
              return;
            }
            _durMin = n;
            _updateDur();
          });
          return;
        } else {
          _durMin = parseInt(v, 10);
        }
        _updateDur();
      });
    });

    // --- 휠 스크롤 (click + wheel 마우스 + touch swipe 모두 지원) ---
    // 2026-05-01 ── 사용자 보고: '시간 입력 스크롤안됨'. wheel/swipe/click 모두 지원.
    // --- 휠 스크롤 (네이티브 scroll-snap 활용) ---
    // 2026-05-04 ── '뚝뚝 끊김' 보고 대응: 가상 휠 방식 버리고 네이티브 스냅으로 전면 교체
    body.querySelectorAll('.bf-tp-wheel').forEach(wheel => {
      const ROW_H = 44;

      const onScroll = () => {
        const top = wheel.scrollTop;
        const idx = Math.round(top / ROW_H);
        const rows = wheel.querySelectorAll('.bf-tp-row');
        let changed = false;
        rows.forEach((r, i) => {
          const isCur = i === idx;
          if (isCur && !r.classList.contains('current')) changed = true;
          r.classList.toggle('current', isCur);
        });
        if (changed && navigator.vibrate) { try { navigator.vibrate(5); } catch (_) { void _; } }
        _updateDur();
      };

      const curRow = wheel.querySelector('.bf-tp-row.current');
      if (curRow) {
        const rows = Array.from(wheel.querySelectorAll('.bf-tp-row'));
        const idx = rows.indexOf(curRow);
        requestAnimationFrame(() => { wheel.scrollTop = idx * ROW_H; });
      }

      let scrollTimer = null;
      wheel.addEventListener('scroll', () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(onScroll, 60);
      }, { passive: true });

      wheel.addEventListener('click', e => {
        const row = e.target.closest('.bf-tp-row');
        if (!row) return;
        const rows = Array.from(wheel.querySelectorAll('.bf-tp-row'));
        const idx = rows.indexOf(row);
        wheel.scrollTo({ top: idx * ROW_H, behavior: 'smooth' });
      });
    });

    // --- 고객 카드 ---
    // P1-5: 고객 선택 시 AI 브리핑 카드 동시 노출. picker가 picked 객체 그대로 넘기므로 dashboardData 없이 customer만.
    function _renderAiBrief(picked) {
      const mount = body.querySelector('#bfAiBriefMount');
      if (!mount) return;
      if (!picked || !picked.id || !window.CustomerAIBrief) { mount.innerHTML = ''; return; }
      try { window.CustomerAIBrief.render('bfAiBriefMount', picked.id, { customer: picked }); }
      catch (_e) { mount.innerHTML = ''; }
    }
    function _renderCustCard(picked) {
      const card = body.querySelector('#bfCustCard');
      if (!card) return;
      _renderAiBrief(picked && picked.id ? picked : null);
      if (picked) {
        card.className = 'bf-cust-card';
        const visits = +picked.visit_count || 0;
        const bal = +picked.membership_balance || 0;
        const rawBirth = String(picked.birthday || '');
        const bm = rawBirth.match(/^(\d{1,2})[-/](\d{1,2})$/) || rawBirth.match(/^\d{4}-(\d{1,2})-(\d{1,2})/);
        const td = new Date();
        const isBirthday = bm && +bm[1] === td.getMonth() + 1 && +bm[2] === td.getDate();
        // 방문 뱃지 — 1~2회 회색 / 3회 이상 녹색 / 10회 이상 분홍
        const visitBadge = visits > 0
          ? `<span class="bf-cust-badge ${visits >= 10 ? 'pink' : visits >= 3 ? 'green' : ''}">방문 ${visits}회</span>`
          : '';
        const meta = [
          bal ? '회원권 ' + (bal / 10000).toFixed(bal >= 100000 ? 0 : 1) + '만' : '',
          isBirthday ? '오늘 생일' : '',
        ].filter(Boolean).join(' · ');
        card.innerHTML = `<div class="bf-cust-bar"></div>
          <div class="bf-cust-info"><div class="bf-cust-name">${_esc(picked.name || '')}${visitBadge}</div>${meta ? `<div class="bf-cust-meta" id="bfCustMeta">${meta}</div>` : ''}</div>
          <button type="button" class="bf-cust-clear" id="bfCustClear" aria-label="고객 선택 해제">×</button>`;
        body.querySelector('#bfCustName').value = picked.name || '';
      } else {
        card.className = 'bf-cust-card empty';
        card.innerHTML = `<div class="bf-cust-bar empty"></div>
          <div class="bf-cust-info"><div class="bf-cust-empty-text">고객 골라주세요</div></div>
          <span class="bf-cust-chev" aria-hidden="true" style="display:inline-flex;align-items:center;"><svg width="17" height="17"><use href="#ic-chevron-right"/></svg></span>`;
      }
    }
    const _doPick = async () => {
      if (!window.Customer?.pick) { if (window.showToast) window.showToast('고객 모듈 로드 중…'); return; }
      const picked = await window.Customer.pick({ selectedId: custId });
      if (picked === null) return;
      custId = picked.id || null;
      _renderCustCard(picked.name ? picked : null);
      // 잇비 학습 재실행 — 시술 이미 선택돼 있으면
      if (_selectedSvc) _runItbyLearning(_selectedSvc);
    };
    // P1-5: prefill 케이스 (수정 모드 또는 dashboard 진입) — 폼 오픈 직후 브리핑 1회 띄움.
    if (custId) {
      const seed = _pendingCust && _pendingCust.id === custId
        ? _pendingCust
        : { id: custId, name: existing?.customer_name || (body.querySelector('#bfCustName')?.value || '') };
      _renderAiBrief(seed);
    }
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

    // --- 시술 칩 + 잇비 학습 ---
    let _selectedSvc = existing?.service_name || '';
    function _setMoneyDisplay(field, val) {
      const isDep = field === 'deposit';
      const to = +val || 0;
      body.querySelectorAll(`.bf-money-row.${field}`).forEach(row => {
        const valEl = row.querySelector('.bf-money-val');
        if (!valEl) return;
        if (isDep && to <= 0) {
          valEl.classList.add('empty');
          valEl.innerHTML = '<button type="button" class="bf-amount-link">탭해서 입력 <svg width="13" height="13" aria-hidden="true" style="vertical-align:-1px"><use href="#ic-chevron-right"/></svg></button>';
          return;
        }
        let numEl = valEl.querySelector('.bf-num');
        if (!numEl) {
          valEl.classList.remove('empty');
          valEl.innerHTML = '<span class="bf-num" data-hv-count="0">0</span><span class="bf-money-unit">원</span>';
          numEl = valEl.querySelector('.bf-num');
        }
        const from = parseInt(numEl.dataset.hvCount || '0', 10) || 0;
        const dur = 380;
        const t0 = performance.now();
        const step = (now) => {
          const t = Math.min(1, (now - t0) / dur);
          const eased = 1 - Math.pow(1 - t, 3);
          const cur = Math.round(from + (to - from) * eased);
          numEl.textContent = cur.toLocaleString('ko-KR');
          if (t < 1) requestAnimationFrame(step);
          else { numEl.dataset.hvCount = String(to); }
        };
        requestAnimationFrame(step);
      });
    }
    function _updateBalanceDisplay() {
      const a = +(body.querySelector('#bfAmount')?.value) || 0;
      const d = +(body.querySelector('#bfDeposit')?.value) || 0;
      const bal = Math.max(0, a - d).toLocaleString('ko-KR');
      body.querySelectorAll('.bf-balance-num').forEach(el => { el.textContent = bal; });
    }
    async function _runItbyLearning(svcName) {
      const boxes = body.querySelectorAll('.bf-itby-box');
      const texts = body.querySelectorAll('.bf-itby-text');
      if (!boxes.length) return;
      const _hide = () => boxes.forEach(b => b.style.display = 'none');
      if (!svcName || !custId || !window.Booking?.getCustomerLearning) { _hide(); return; }
      try {
        const learn = await window.Booking.getCustomerLearning(custId, svcName);
        if (!learn || (!learn.avgAmount && !learn.avgDeposit)) { _hide(); return; }
        let msg = '잇비가 가격 찾아왔어요';
        if (learn.avgDeposit) {
          const man = Math.round(learn.avgDeposit / 10000);
          msg += ` · 평소 예약금 ${man}만원도 같이 넣었어요`;
        }
        texts.forEach(t => t.textContent = msg);
        boxes.forEach(b => b.style.display = 'block');
        const amtInp = body.querySelector('#bfAmount');
        const depInp = body.querySelector('#bfDeposit');
        if (amtInp && !amtInp.value && learn.avgAmount) {
          amtInp.value = String(learn.avgAmount);
          _setMoneyDisplay('amount', learn.avgAmount);
        }
        if (depInp && !depInp.value && learn.avgDeposit) {
          depInp.value = String(learn.avgDeposit);
          _setMoneyDisplay('deposit', learn.avgDeposit);
        }
        _updateBalanceDisplay();
      } catch (_) { _hide(); }
    }
    function _renderChips(names) {
      const wrap = body.querySelector('#bfSvcChips');
      if (!wrap) return;
      const arr = Array.from(names).slice(0, 8);
      wrap.innerHTML = arr.map(n =>
        `<button type="button" class="bf-svc-chip${n === _selectedSvc ? ' on' : ''}" data-svc="${_esc(n)}">${_esc(n)}</button>`
      ).join('') + '<button type="button" class="bf-svc-chip add" id="bfSvcAddBtn">+ 직접</button>';
      wrap.querySelectorAll('.bf-svc-chip[data-svc]').forEach(btn => {
        btn.addEventListener('click', () => {
          _selectedSvc = _selectedSvc === btn.dataset.svc ? '' : btn.dataset.svc;
          body.querySelector('#bfSvc').value = _selectedSvc;
          _renderChips(names);
          const ci = body.querySelector('#bfSvcCustom');
          if (ci) ci.style.display = 'none';
          const tpl = _selectedSvc && (window._serviceTemplatesCache || []).find(t => t.name === _selectedSvc);
          if (tpl && tpl.default_duration_min > 0) { _durMin = tpl.default_duration_min; _updateDur(); }
          // [2026-05-29] 시술 칩 클릭마다 가격 갈아끼움 (이전: !value 가드로 한번만 채워짐 버그)
          const amtInp = body.querySelector('#bfAmount');
          if (_selectedSvc && tpl && amtInp) {
            const newAmt = Number(tpl.default_price) || 0;
            amtInp.value = newAmt > 0 ? String(newAmt) : '';
            _setMoneyDisplay('amount', newAmt);
            _updateBalanceDisplay();
          } else if (!_selectedSvc && amtInp) {
            // 칩 해제 시 (toggle off) 0 으로
            amtInp.value = '';
            _setMoneyDisplay('amount', 0);
            _updateBalanceDisplay();
          }
          // 잇비 학습 — 고객 + 시술 둘 다 있을 때
          _runItbyLearning(_selectedSvc);
        });
      });
      body.querySelector('#bfSvcAddBtn')?.addEventListener('click', () => {
        const ci = body.querySelector('#bfSvcCustom');
        if (ci) { ci.style.display = ''; ci.focus(); }
      });
    }
    const ci = body.querySelector('#bfSvcCustom');
    if (ci) ci.addEventListener('input', () => { body.querySelector('#bfSvc').value = ci.value; _selectedSvc = ci.value; });
    // 시술 목록 fetch — revenue 빈도수 기반 자동 정렬 (자주 받은 순)
    (async () => {
      const freq = new Map(); // name → count
      const allNames = new Set();
      try {
        if (window.API && window.authHeader) {
          const [r1, r2] = await Promise.allSettled([
            apiFetch('/services', { headers: window.authHeader() }),
            apiFetch('/revenue?period=month', { headers: window.authHeader() }),
          ]);
          if (r1.status === 'fulfilled' && r1.value.ok) {
            const d = await r1.value.json();
            (d.items || []).forEach(s => s.name && allNames.add(s.name));
          }
          if (r2.status === 'fulfilled' && r2.value.ok) {
            const d = await r2.value.json();
            (d.items || []).forEach(r => {
              if (!r.service_name) return;
              allNames.add(r.service_name);
              freq.set(r.service_name, (freq.get(r.service_name) || 0) + 1);
            });
          }
        }
      } catch (_) { /* ignore */ }
      if (!allNames.size) ['젤 리무브','손톱 케어','젤 풀','젤 + 케어','젤 보강'].forEach(n => allNames.add(n));
      // 빈도수 기준 정렬 (없는 건 뒤로)
      const sorted = Array.from(allNames).sort((a, b) => (freq.get(b) || 0) - (freq.get(a) || 0));
      _renderChips(sorted);
      // 학습 자동 실행 (수정 모드: 시술 + 고객 이미 있음)
      if (_selectedSvc && custId) _runItbyLearning(_selectedSvc);
    })();

    // --- 메모 토글 (직원 제거) ---
    const memoToggle = body.querySelector('#bfMemoToggle');
    const memoFields = body.querySelector('#bfMemoFields');
    if (memoToggle && memoFields) {
      memoToggle.addEventListener('click', () => {
        const open = memoFields.style.display !== 'none';
        memoFields.style.display = open ? 'none' : 'block';
        memoToggle.classList.toggle('open', !open);
        if (!open) setTimeout(() => memoFields.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      });
    }

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
      // [2026-07-25 #4] 자정 넘김 처리 — 저장 경로(_bindFormSave)와 동일하게. 예전엔 ends 를 같은 날 d 로
      //   만들어 25:00→01:00 이 되며 ends<starts 로 역전, findConflict overlap 판정이 어긋나 실시간 경고가
      //   저장 차단과 불일치했다(밤 예약 편집 시 경고 오작동).
      const crossesMidnight = endMin >= 1440;
      const adjEnd = crossesMidnight ? endMin - 1440 : endMin;
      const eh = Math.floor(adjEnd / 60), em = adjEnd % 60;
      const endDate = crossesMidnight ? _nextDay(d) : d;
      const starts = `${d}T${_pad(_startH)}:${_pad(_startM)}:00+09:00`;
      const ends = `${endDate}T${_pad(eh)}:${_pad(em)}:00+09:00`;
      const conflict = window.Booking.findConflict(starts, ends, existing?.id);
      const el = body.querySelector('#bfConflict');
      if (el) {
        el.style.display = conflict ? 'block' : 'none';
        if (conflict) el.textContent = _conflictMsg(conflict);
      }
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
    // [2026-05-23] _getStaffId 제거 — 직원 기능 폐지
    body._getDurMin = () => _durMin;
    body._getStartH = () => { _readStart(); return _startH; };
    body._getStartM = () => { _readStart(); return _startM; };

    // 금액 라인 — 탭 시 인라인 input 으로 변환
    body.querySelectorAll('.bf-money-val[data-money-edit]').forEach(valEl => {
      valEl.addEventListener('click', (_e) => {
        const field = valEl.dataset.moneyEdit; // 'amount' | 'deposit'
        if (valEl.querySelector('input')) return;
        const hidden = body.querySelector(field === 'amount' ? '#bfAmount' : '#bfDeposit');
        const cur = +(hidden?.value) || 0;
        valEl.innerHTML = `<input type="text" inputmode="numeric" class="bf-money-input" value="${cur || ''}" placeholder="0" /><span class="bf-money-unit">원</span>`;
        const inp = valEl.querySelector('input');
        inp.style.webkitTapHighlightColor = 'transparent';
        inp.focus();
        try { inp.setSelectionRange(0, (inp.value || '').length); } catch (_) { void _; }
        inp.select && inp.select();
        const commit = () => {
          const raw = inp.value.replace(/[^0-9]/g, '');
          const n = parseInt(raw, 10) || 0;
          if (hidden) hidden.value = n > 0 ? String(n) : '';
          _setMoneyDisplay(field, n);  // 시술 카드 + 우측 패널 양쪽 동기화
          _updateBalanceDisplay();
        };
        inp.addEventListener('blur', commit);
        inp.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') { ev.preventDefault(); inp.blur(); }
          if (ev.key === 'Escape') { inp.value = String(cur || ''); inp.blur(); }
        });
      });
    });
    _updateBalanceDisplay();
  }

  function _bindFormSave(body, existing, _date) {
    let _saving = false; // [2026-07-14 QA] 연타 시 예약 이중 생성 방지
    body.querySelector('#bfSave').addEventListener('click', async (ev) => {
      if (_saving) return;
      const _saveBtn = ev.currentTarget;
      const d = body.querySelector('#bfDate').value;
      if (!d) { if (window.showToast) window.showToast('날짜를 입력해 주세요'); return; }
      const sh = body._getStartH(), sm = body._getStartM(), dur = body._getDurMin();
      const endMin = sh * 60 + sm + dur;
      const eh = Math.floor(endMin / 60) % 24, em = endMin % 60;
      const sTime = _pad(sh) + ':' + _pad(sm);
      const crossesMidnight = endMin >= 1440;
      const adjEh = crossesMidnight ? Math.floor((endMin - 1440) / 60) : eh;
      const adjEm = crossesMidnight ? (endMin - 1440) % 60 : em;
      const eTime = _pad(adjEh) + ':' + _pad(adjEm);
      const endDate = crossesMidnight ? _nextDay(d) : d;
      if (!crossesMidnight && sTime >= eTime) { if (window.showToast) window.showToast('종료 시간이 시작보다 늦어야 해요'); return; }
      // [A3] 과거 날짜 예약 방지
      if (!existing) {
        // [2026-07-25 #6] 로컬(KST) 날짜로. 예전엔 toISOString(UTC)이라 KST 00~09시엔 today 가
        //   하루 뒤처져 그 시간대에 과거 날짜가 통과했다. 폼의 다른 날짜 계산은 전부 _ds()(로컬).
        const today = _ds(new Date());
        if (d < today) {
          if (window.showToast) window.showToast('과거 날짜에는 예약을 추가할 수 없어요');
          return;
        }
      }
      // [A2] 시간 충돌 시 저장 차단
      {
        const starts = `${d}T${sTime}:00+09:00`;
        const ends = `${endDate}T${eTime}:00+09:00`;
        const conflict = window.Booking?.findConflict?.(starts, ends, existing?.id);
        if (conflict) {
          if (window.showToast) window.showToast(_conflictMsg(conflict));
          return;
        }
        // [보안감사 M-4] 고른 날짜가 현재 보고 있는 달 밖이면 findConflict(_items=현재 달)가 못 잡는다.
        //   그 날짜만 직접 조회해 한 번 더 확인(타월 이중예약 무경고 방지). 조회 실패 시엔 막지 않음.
        const _pickYM = d.slice(0, 7);
        const _curYM = `${_curYear}-${_pad(_curMonth)}`;
        if (window.Booking?.dayConflict && _pickYM !== _curYM) {
          const _c2 = await window.Booking.dayConflict(starts, ends, existing?.id);
          if (_c2) {
            if (window.showToast) window.showToast(_conflictMsg(_c2));
            return;
          }
        }
      }
      // [2026-06-10] 신규 예약은 고객 필수 — 이름 없는 "이름 없음" 예약 생성 차단.
      //   (기존 예약 수정은 과거 데이터 호환 위해 그대로 허용)
      if (!existing && !body.querySelector('#bfCustName').value.trim()) {
        if (window.showToast) window.showToast('고객을 먼저 선택해주세요');
        const custCard = body.querySelector('#bfCustCard');
        if (custCard) {
          custCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          custCard.classList.add('bf-cust-required');
          setTimeout(() => custCard.classList.remove('bf-cust-required'), 1600);
        }
        return;
      }
      // [2026-05-16] 시술명: chip 선택값(#bfSvc) 또는 직접입력값(#bfSvcCustom) 둘 다 폴백
      const svcSelected = body.querySelector('#bfSvc').value.trim();
      const svcCustom   = (body.querySelector('#bfSvcCustom')?.value || '').trim();
      // [v206] amount + deposit — BE 정식 저장. 노쇼 시 deposit 으로 자동 매출 기록.
      const amtVal = +body.querySelector('#bfAmount')?.value || 0;
      const depVal = +body.querySelector('#bfDeposit')?.value || 0;
      const payload = {
        starts_at:     `${d}T${sTime}:00+09:00`,
        ends_at:       `${endDate}T${eTime}:00+09:00`,
        customer_id:   body._getCustId?.() || null,
        customer_name: body.querySelector('#bfCustName').value.trim() || null,
        service_name:  svcSelected || svcCustom || null,
        memo:          body.querySelector('#bfMemo').value.trim()      || null,
        // [2026-05-23] staff_id 전송 제거 — 직원 기능 폐지
        amount:        amtVal > 0 ? amtVal : null,
        deposit:       depVal > 0 ? depVal : null,
      };
      _saving = true;
      if (_saveBtn) _saveBtn.disabled = true;
      try {
        const changeDetail = {
          customer_id: payload.customer_id,
          customer_name: payload.customer_name,
          service_name: payload.service_name,
          starts_at: payload.starts_at,
          amount: payload.amount,
          deposit: payload.deposit,
        };
        if (existing) {
          await window.Booking.update(existing.id, payload);
          window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { ...changeDetail, kind: 'update_booking', booking_id: existing.id } }));
        } else {
          const created = await window.Booking.create(payload);
          window.dispatchEvent(new CustomEvent('booking:created', { detail: { customer_name: payload.customer_name, customer_id: payload.customer_id || null } }));
          window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { ...changeDetail, kind: 'create_booking', booking_id: created?.id || null } }));
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
        // [2026-06-10 QA] 실제 사유 노출 — "저장 실패"만 떠서 원인(시간 충돌 등)을 알 수 없던 문제
        console.warn('[cal] save 실패:', err);
        if (window.showToast) window.showToast('저장 실패: ' + (window._humanError ? window._humanError(err) : (err?.message || '잠시 후 다시 시도해주세요')));
      } finally {
        _saving = false;
        if (_saveBtn) _saveBtn.disabled = false;
      }
    });
  }

  function _bindFormActions(body, existing, _date) {
    body.querySelector('#bfDelete')?.addEventListener('click', () => {
      window._inlineConfirm('이 예약을 삭제할까요?', async () => {
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
    });
    // [2026-05-16] #bfComplete 카드는 _buildFormHTML 에서 제거 — 핸들러도 삭제.
    const STATUS_LABEL = { confirmed: '확정', completed: '완료', cancelled: '취소', no_show: '안 옴' };
    let _statusBusy = false; // [카오스] 상태변경 버튼 연타 시 동시 PATCH 방지
    body.querySelectorAll('[data-bf-status]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (_statusBusy) return;
        const newStatus = btn.getAttribute('data-bf-status');
        if (newStatus === existing.status) return;
        // [2026-05-16] 완료 버튼은 직접 status 변경하지 않고 CompleteFlow 거치도록.
        if (newStatus === 'completed') {
          if (window.CompleteFlow?.startFromBooking) {
            if (window.hapticMedium) window.hapticMedium();
            window.CompleteFlow.startFromBooking(existing);
            _renderViewBody();  // 편집폼 닫고 캘린더로
          } else if (window.showToast) {
            window.showToast('완료 모듈 로드 중…');
          }
          return;
        }
        const _applyStatus = async () => {
          if (_statusBusy) return;
          _statusBusy = true;
          try {
            await window.Booking.update(existing.id, { status: newStatus });
            // [핫픽스D #6] 취소면 잇비 "복구해"로 되살릴 수 있게 최근 취소 context 저장.
            if (newStatus === 'cancelled') {
              try {
                window.ItdasyBookingContext && window.ItdasyBookingContext.rememberAction && window.ItdasyBookingContext.rememberAction({
                  kind: 'cancel_booking',
                  payload: { booking_id: existing.id, customer_id: existing.customer_id || null, customer_name: existing.customer_name || '', service_name: existing.service_name || '', starts_at: existing.starts_at || '', ends_at: existing.ends_at || '' },
                  _context_booking: existing,
                }, {});
              } catch (_e) { void _e; }
            }
            window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'update_booking', booking_id: existing.id, customer_id: existing.customer_id || null } }));
            if (window.hapticLight) window.hapticLight();
            if (window.showToast) window.showToast(`상태를 '${STATUS_LABEL[newStatus]}'로 변경했어요`);
            if (window.Dashboard?.refresh) window.Dashboard.refresh(true);
            _mappedCache = await _loadMonth(_curYear, _curMonth);
            _renderViewBody();
          } catch (_) { if (window.showToast) window.showToast('상태 변경 실패'); }
          finally { _statusBusy = false; }
        };
        // [핫픽스D #6] 모든 취소 경로 확인 통일 — 상태 '취소'는 확인 후에만 반영.
        if (newStatus === 'cancelled') {
          window._inlineConfirm('이 예약을 취소할까요?', _applyStatus, function () { /* 아니요 — 그대로 */ }, { okText: '예약 취소', cancelText: '아니요' });
          return;
        }
        await _applyStatus();
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
    body.innerHTML = '<div class="cv-form-wrap bf-wrap" style="flex:1;overflow-y:auto;">' + _buildFormHTML(existing, slots, dateStr, defS, defE, !!pendS) + '</div>';
    body.querySelector('#cv-form-back').addEventListener('click', () => _renderViewBody());
    // [2026-07-25 #5] 폼을 시트-백 레지스트리에 등록 — 안드로이드/브라우저 back 이 폼→목록으로만
    //   돌아가고 예약관리 전체가 닫히지 않게(작성 중이던 고객/금액/메모 소실 방지). 상세시트와 동일 패턴.
    //   close=_renderViewBody(목록 복귀), 목록 복귀 시 _markSheetClosed 는 _renderViewBody 안에서 일괄.
    if (typeof window._registerSheet === 'function') window._registerSheet('cvBookingForm', _renderViewBody);
    if (typeof window._markSheetOpen === 'function') window._markSheetOpen('cvBookingForm');
    _bindFormExtras(body, existing);
    _bindFormSave(body, existing, date);
    if (existing) _bindFormActions(body, existing, date);
    // [2026-05-29] 빈 슬롯 클릭 시 고객 picker 자동 오픈 제거 — 폼만 열고 사용자가 직접 선택
  }


  // ============================================================
  // §21 뷰 전환
  // ============================================================
  function _switchView(view) {
    // [v200 DAY_VIEW_HIDDEN] 'day' 진입은 모두 'week' 로 리디렉트.
    if (view === 'day') view = 'week';
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
    // 뷰에 따라 단위 다르게 — 주뷰: 1주, 일뷰: 1일, 월뷰: 1달
    if (_curView === 'week') {
      _curDate = new Date(_curDate); _curDate.setDate(_curDate.getDate() - 7);
    } else if (_curView === 'day') {
      _curDate = new Date(_curDate); _curDate.setDate(_curDate.getDate() - 1);
    } else {
      _curMonth--;
      if (_curMonth < 1) { _curMonth = 12; _curYear--; }
      _curDate = new Date(_curYear, _curMonth - 1, 1);
    }
    _curYear = _curDate.getFullYear();
    _curMonth = _curDate.getMonth() + 1;
    _miniMonth = { y: _curYear, m: _curMonth };
    await _reloadAndRender();
    _prefetchNeighbors();
  }
  async function _nextMonth() {
    if (_curView === 'week') {
      _curDate = new Date(_curDate); _curDate.setDate(_curDate.getDate() + 7);
    } else if (_curView === 'day') {
      _curDate = new Date(_curDate); _curDate.setDate(_curDate.getDate() + 1);
    } else {
      _curMonth++;
      if (_curMonth > 12) { _curMonth = 1; _curYear++; }
      _curDate = new Date(_curYear, _curMonth - 1, 1);
    }
    _curYear = _curDate.getFullYear();
    _curMonth = _curDate.getMonth() + 1;
    _miniMonth = { y: _curYear, m: _curMonth };
    await _reloadAndRender();
    _prefetchNeighbors();
  }
  let _navSeq = 0; // [카오스 P1-1] 월/주 전환 연타 시 요청 순서 토큰
  async function _reloadAndRender() {
    const my = ++_navSeq;
    try {
      const mapped = await _loadMonth(_curYear, _curMonth);
      if (my !== _navSeq) return;   // 더 최근 전환이 있었음 — 늦게 온 stale 달 무시
      _mappedCache = mapped;
      _renderViewBody();
    } catch (err) {
      if (my !== _navSeq) return;
      // [카오스 P2-1] 월 이동 중 로드 실패 무음 → 헤더/그리드 불일치 방지: 알리고 캐시 유지
      console.warn('[cal] 월 로드 실패:', err);
      if (window.showToast) window.showToast('예약을 불러오지 못했어요. 잠시 후 다시 시도해주세요');
    }
  }
  function _prefetch(year, month) {
    // [#2] _loadMonth 와 같은 ±7일 범위 → 캐시 키 정합(이웃 달로 이동 시 프리페치 캐시 적중).
    const { from, to } = _monthRange(year, month);
    // [2026-07-25 #1] prefetch 플래그 — 이웃 달 캐시만 채우고 화면용 _items(충돌검사 대상)는 안 건드림.
    window.Booking.list(from, to, { prefetch: true }).catch(() => {});
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
    // 2026-05-29 — 월 → 주 전환 시 부드러운 트랜지션
    if (_curView === 'month') {
      const o = _overlay();
      const body = o && o.querySelector('#bk-body');
      if (body) {
        body.classList.add('cv-month-out');
        setTimeout(() => {
          body.classList.remove('cv-month-out');
          _switchView('week');
          // 주 뷰 슬라이드 인
          const grid = (o.querySelector('#bk-week-m-grid') || o.querySelector('#bk-week-grid'));
          if (grid) {
            grid.classList.add('cv-week-slidein');
            setTimeout(() => grid.classList.remove('cv-week-slidein'), 400);
          }
        }, 240);
        return;
      }
    }
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

  // [2026-05-16] CompleteFlow → "예약 시간·고객 수정" 클릭 시 편집폼 진입
  if (typeof window !== 'undefined' && !window._cvOpenEditListenerInit) {
    window._cvOpenEditListenerInit = true;
    window.addEventListener('itdasy:open-booking-edit', (e) => {
      const id = e.detail?.booking_id;
      if (!id) return;
      const item = _mappedCache.find(m => String(m.id) === String(id));
      if (!item) return;
      if (!_overlay()) {
        // 캘린더가 닫혔으면 다시 열고 다음 tick 에 폼 진입
        window.openCalendarView().then(() => _openForm(new Date(item._raw.starts_at), item._raw));
      } else {
        _openForm(new Date(item._raw.starts_at), item._raw);
      }
    });
  }

  window.openCalendarView = async function () {
    if (typeof window._perfMark === 'function') window._perfMark('calendar:open:start');
    const existing = _overlay(); if (existing) existing.remove();

    // [버그8] 예약관리 재진입 시 선택일은 항상 오늘로 초기화 — 이전 세션/선택 잔존으로
    // 미니캘린더가 옛 날짜(예: 6일)로 열리던 문제. 저장된 dateISO는 더 이상 선택일로 복원하지 않는다.
    // [2026-05-28] view는 항상 'month' 로 진입.
    const now = new Date();
    _curYear = now.getFullYear();
    _curMonth = now.getMonth() + 1;
    _curDate = now;
    _curView = 'month';
    _miniMonth = { y: _curYear, m: _curMonth };
    _cachedIsPC = _isPC();

    // [2026-05-23] 직원 목록 로드 제거 — 직원 기능 폐지

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

    // 고객 dashboard → "예약잡기" 진입: 자동으로 예약 추가 폼 표시.
    // _pendingBookingCustomer 는 _bindFormExtras 가 소비하므로 여기선 트리거만.
    if (window._pendingBookingCustomer) {
      setTimeout(() => _openForm(_curDate, null), 50);
    } else {
      // [2026-05-25] 미완료 예약 자동 시트 — 세션당 1회.
      //   홈 'AI잇비가 챙겼어요'에서 빼고 예약관리(타임테이블) 진입 시 안내.
      _maybeShowOverdueSheet();
    }

    if (typeof window._perfMark === 'function') window._perfMark('calendar:open:end');
  };

  // [2026-05-25] 미완료 예약 처리 시트 자동 호출 (세션 1회).
  //   소스 우선순위: window._overdueBookings (홈 brief 캐시) → window._homePendingTopBooking
  function _maybeShowOverdueSheet() {
    try {
      if (sessionStorage.getItem('itdasy_overdue_sheet_shown') === '1') return;
      let candidate = null;
      const list = Array.isArray(window._overdueBookings) ? window._overdueBookings : [];
      const filtered = list.filter(b => b && b.id && b.status !== 'completed' && b.status !== 'cancelled' && b.status !== 'no_show');
      if (filtered.length) {
        filtered.sort((a, b) => new Date(a.starts_at || 0) - new Date(b.starts_at || 0));
        candidate = filtered[0];
      } else if (window._homePendingTopBooking) {
        candidate = window._homePendingTopBooking;
      }
      if (!candidate || !candidate.id) return;
      if (typeof window.CompleteFlow !== 'object' || typeof window.CompleteFlow.startFromBooking !== 'function') return;
      sessionStorage.setItem('itdasy_overdue_sheet_shown', '1');
      setTimeout(() => {
        try { window.CompleteFlow.startFromBooking(candidate); } catch (_) { /* ignore */ }
      }, 500);
    } catch (_) { /* ignore */ }
  }

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

  // [2026-06-05] 공용 월 그리드 — 매출 캘린더 등 다른 모듈이 .bk-month-m 그리드를 그대로 재사용.
  //   예약 칩 대신 opts.dayChip(dateStr) 가 반환한 칩을 칸에 넣음. 예약 자체 렌더는 무변경.
  window.CalendarView = window.CalendarView || {};
  window.CalendarView.buildMonthGridHTML = function (o) {
    o = o || {};
    const DOW = ['일','월','화','수','목','금','토'];
    let h = '<div class="bk-month-m"><div class="bk-month-m__dow-row">';
    DOW.forEach(dd => { h += '<div class="bk-month-m__dow">' + dd + '</div>'; });
    h += '</div><div class="bk-month-m__cells">';
    h += _buildMonthGrid(o.year, o.month, [], 'bk-month-m', false, { dayChip: o.dayChip, selected: o.selected });
    return h + '</div></div>';
  };

})();
