/* ─────────────────────────────────────────────────────────────
   예약 캘린더 뷰 (T-310 · 2026-04-22)
   FullCalendar 6.x CDN 통합. 월/주/일 뷰 + 드래그 리스케줄.

   전역:
     window.openCalendarView()  — 캘린더 시트 열기
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const OVERLAY = 'cal-overlay';
  const FC_CSS = 'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.11/index.global.min.css';
  const FC_JS  = 'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.11/index.global.min.js';
  let _loaded = false;
  let _calendar = null;

  const API = () => window.API || '';
  const AUTH = () => (window.authHeader ? window.authHeader() : {});

  async function _loadFullCalendar() {
    if (_loaded || window.FullCalendar) { _loaded = true; return; }
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = FC_JS;
      s.onload = resolve;
      s.onerror = () => reject(new Error('FullCalendar CDN load failed'));
      document.head.appendChild(s);
    });
    _loaded = true;
  }

  async function _fetchBookings() {
    try {
      const res = await fetch(API() + '/bookings', { headers: AUTH() });
      if (!res.ok) return [];
      const d = await res.json();
      return (d.items || []).map(b => ({
        id: b.id,
        title: `${b.customer_name || '고객'} · ${b.service_name || ''}`,
        start: b.starts_at,
        end: b.ends_at,
        backgroundColor: _statusColor(b.status),
        borderColor: _statusColor(b.status),
        extendedProps: { status: b.status, raw: b },
      }));
    } catch (e) { return []; }
  }

  function _statusColor(status) {
    return ({
      confirmed: '#F18091',
      completed: '#388e3c',
      no_show:   '#F57C00',
      cancelled: '#888',
    })[status] || '#F18091';
  }

  async function _patchBooking(id, patch) {
    const res = await fetch(API() + '/bookings/' + id, {
      method: 'PATCH',
      headers: { ...AUTH(), 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error('예약 수정 실패 (' + res.status + ')');
    return res.json();
  }

  function _close() {
    const o = document.getElementById(OVERLAY);
    if (o) o.remove();
    document.body.style.overflow = '';
    if (_calendar) { try { _calendar.destroy(); } catch(e){} _calendar = null; }
  }

  async function openCalendarView() {
    const existing = document.getElementById(OVERLAY);
    if (existing) existing.remove();

    const o = document.createElement('div');
    o.id = OVERLAY;
    o.style.cssText = `position:fixed;inset:0;z-index:9998;background:rgba(20,8,16,0.55);backdrop-filter:blur(4px);display:flex;align-items:stretch;justify-content:center;padding:12px;padding-bottom:calc(12px + env(safe-area-inset-bottom,0));`;
    o.innerHTML = `
      <div style="width:100%;max-width:1080px;max-height:96vh;background:#fff;border-radius:20px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.3);animation:pvSlideUp 0.3s cubic-bezier(0.22,1,0.36,1);">
        <div style="display:flex;align-items:center;padding:14px 18px;border-bottom:1px solid #eee;background:#fafafa;">
          <div style="font-size:15px;font-weight:900;color:#222;flex:1;">📅 예약 캘린더</div>
          <button id="cal-close" style="width:34px;height:34px;border:none;border-radius:10px;background:#eee;cursor:pointer;font-size:14px;">✕</button>
        </div>
        <div id="cal-root" style="flex:1;overflow:auto;padding:12px;min-height:420px;background:#fff;">
          <div style="padding:40px;text-align:center;color:#aaa;font-size:13px;">캘린더 불러오는 중…</div>
        </div>
        <div style="padding:8px 14px;border-top:1px solid #eee;background:#fafafa;font-size:11px;color:#888;text-align:center;">
          💡 빈 시간 탭 = 예약 추가 · 예약 블록 드래그 = 시간 이동 · 끝 드래그 = 길이 조정
        </div>
      </div>
    `;
    document.body.appendChild(o);
    document.body.style.overflow = 'hidden';
    o.querySelector('#cal-close').addEventListener('click', _close);
    o.addEventListener('click', (e) => { if (e.target === o) _close(); });

    try { await _loadFullCalendar(); } catch (e) {
      if (window.showToast) window.showToast('캘린더 로드 실패 (네트워크 확인)');
      return;
    }

    const events = await _fetchBookings();
    const root = document.getElementById('cal-root');
    root.innerHTML = '';
    // 모바일 감지 → 초기 뷰 `timeGridDay` 로 (주간 뷰는 좁음)
    const isMobile = window.innerWidth < 680;
    _calendar = new FullCalendar.Calendar(root, {
      initialView: isMobile ? 'timeGridDay' : 'timeGridWeek',
      locale: 'ko',
      firstDay: 0,
      slotMinTime: '09:00:00',
      slotMaxTime: '22:00:00',
      slotDuration: '00:30:00',
      slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
      allDaySlot: false,
      height: 'auto',
      expandRows: true,
      nowIndicator: true,
      editable: true,
      selectable: true,
      selectMirror: true,
      longPressDelay: 200,
      eventResizableFromStart: false,
      dayHeaderFormat: { weekday: 'short', day: 'numeric' },
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: isMobile ? 'timeGridDay,timeGridWeek' : 'dayGridMonth,timeGridWeek,timeGridDay',
      },
      buttonText: { today: '오늘', month: '월', week: '주', day: '일' },
      events,
      noEventsContent: '예약이 없어요. 빈 시간을 탭해서 추가해 보세요.',
      select: (info) => {
        if (window.openBooking) {
          // 기본 예약 시트 열고 날짜/시간 미리 채우기 위해 전역 힌트 저장
          window._pendingBookingSlot = {
            starts_at: info.start.toISOString(),
            ends_at: info.end.toISOString(),
          };
          window.openBooking();
          _close();
        }
      },
      eventDrop: async (info) => {
        try {
          await _patchBooking(info.event.id, {
            starts_at: info.event.start.toISOString(),
            ends_at: info.event.end ? info.event.end.toISOString() : new Date(info.event.start.getTime()+60*60*1000).toISOString(),
          });
          if (window.hapticLight) window.hapticLight();
          if (window.showToast) window.showToast('✅ 예약 시간 변경됨');
        } catch (e) {
          info.revert();
          if (window.showToast) window.showToast('실패: ' + e.message);
        }
      },
      eventResize: async (info) => {
        try {
          await _patchBooking(info.event.id, {
            ends_at: info.event.end.toISOString(),
          });
          if (window.hapticLight) window.hapticLight();
          if (window.showToast) window.showToast('✅ 예약 길이 변경됨');
        } catch (e) {
          info.revert();
          if (window.showToast) window.showToast('실패');
        }
      },
      eventClick: (info) => {
        // 단일 예약 상세 — 기본 예약 편집 시트 열기
        if (window.editBooking) {
          window.editBooking(parseInt(info.event.id, 10));
          _close();
        }
      },
    });
    _calendar.render();
  }

  window.openCalendarView = openCalendarView;

  // 전역 위임 — 어디서든 data-open="calendar-view" 버튼으로 호출
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-open="calendar-view"]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    openCalendarView();
  }, true);
})();
