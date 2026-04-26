/* ─────────────────────────────────────────────────────────────
   예약 캘린더 + CRUD 통합 (T-D1/D2)
   의존: app-booking-api.js (window.Booking)

   전역 진입점:
     window.openCalendarView()    — 월 캘린더 열기
     window.openBooking(date?)    — 별칭 (대시보드 바로가기 호환)
     window.closeBooking()        — 닫기
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const OVERLAY = 'cal-overlay';

  // === 2026 한국 공휴일 ===
  const HOLIDAYS_2026 = {
    '1-1':'신정','2-16':'설날 연휴','2-17':'설날','2-18':'설날 연휴',
    '3-1':'삼일절','3-2':'대체공휴일','5-5':'어린이날','5-25':'부처님오신날',
    '6-6':'현충일','8-15':'광복절','8-17':'대체공휴일',
    '9-24':'추석 연휴','9-25':'추석','9-26':'추석 연휴',
    '10-3':'개천절','10-5':'대체공휴일','10-9':'한글날','12-25':'크리스마스',
  };

  const STATUS_CLR = {
    completed: 'var(--info)',
    no_show:   'var(--danger)',
    cancelled: 'var(--text-subtle)',
  };

  // === 시술별 컬러 팔레트 (Pastel pink 톤 — 잇데이 정체성) ===
  // 키워드 매칭 기반. 시술명에 키워드가 포함되면 해당 색상 사용.
  const SERVICE_COLORS = {
    eyelash: { bg: '#FFE4E9', border: '#F18091' }, // 속눈썹 — 연핑크
    nail:    { bg: '#FFD7BA', border: '#E89B6E' }, // 네일 — 살구
    hair:    { bg: '#FFCFE2', border: '#E78AB1' }, // 붙임머리 — 분홍
    perm:    { bg: '#E8D5F2', border: '#A87BC8' }, // 펌 — 라일락
    cut:     { bg: '#D4F1E0', border: '#7ABF95' }, // 커트 — 민트
    makeup:  { bg: '#FFF4D6', border: '#D9B95A' }, // 메이크업 — 연노랑
    skin:    { bg: '#D6ECFF', border: '#6FA8D9' }, // 피부/관리 — 연파랑
    _default:{ bg: '#FFE0E6', border: '#F18091' }, // 기본 — 잇데이 핑크
  };

  function _colorForService(svc) {
    if (!svc) return SERVICE_COLORS._default;
    const s = String(svc).toLowerCase();
    if (s.includes('속눈썹') || s.includes('래쉬') || s.includes('lash') || s.includes('연장')) return SERVICE_COLORS.eyelash;
    if (s.includes('네일') || s.includes('젤') || s.includes('nail') || s.includes('패디')) return SERVICE_COLORS.nail;
    if (s.includes('붙임') || s.includes('익스텐션') || s.includes('extension')) return SERVICE_COLORS.hair;
    if (s.includes('펌') || s.includes('perm')) return SERVICE_COLORS.perm;
    if (s.includes('커트') || s.includes('컷') || s.includes('cut')) return SERVICE_COLORS.cut;
    if (s.includes('메이크') || s.includes('makeup') || s.includes('mua')) return SERVICE_COLORS.makeup;
    if (s.includes('피부') || s.includes('관리') || s.includes('스킨') || s.includes('skin') || s.includes('왁싱')) return SERVICE_COLORS.skin;
    return SERVICE_COLORS._default;
  }

  let _curYear, _curMonth, _curView = 'month', _curDate = new Date();
  let _mappedCache = [];

  // 시간표 픽셀 단위
  const TT_HOUR_PX = 60;

  // === 헬퍼 ===
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function _pad(n)  { return String(n).padStart(2, '0'); }
  function _ds(d)   { return d.getFullYear() + '-' + _pad(d.getMonth()+1) + '-' + _pad(d.getDate()); }
  function _fmt(d)  { return _pad(d.getHours()) + ':' + _pad(d.getMinutes()); }
  function _overlay()  { return document.getElementById(OVERLAY); }
  function _body()     { const o = _overlay(); return o && o.querySelector('.cal-body'); }
  function _label()    { const o = _overlay(); return o && o.querySelector('.cal-month-label'); }

  function _updateOfflineBadge() {
    const b = document.querySelector('#' + OVERLAY + ' #cal-offline-badge');
    if (b) b.style.display = window.Booking?.isOffline ? 'inline' : 'none';
  }
  function _close() {
    const o = _overlay(); if (o) o.remove();
    document.body.style.overflow = '';
  }

  // === 데이터 ===
  function _mapItems(items) {
    return items.map(b => {
      const s = new Date(b.starts_at), e = new Date(b.ends_at);
      return {
        d: s.getDate(), t: s.toTimeString().slice(0, 5),
        cust: b.customer_name || '이름 없음', svc: b.service_name || '',
        dur: Math.round((e - s) / 60000), id: b.id, status: b.status,
        _raw: b,
      };
    });
  }

  async function _loadMonth(year, month) {
    const from = new Date(year, month - 1, 1).toISOString();
    const to   = new Date(year, month, 0, 23, 59, 59).toISOString();
    const items = await window.Booking.list(from, to);
    _updateOfflineBadge();
    return _mapItems(items);
  }

  // === 월 그리드 ===
  function _renderMonthCells(year, month, byDay, firstDow, lastDate, today) {
    const prevLast = new Date(year, month - 1, 0).getDate();
    let h = '';
    for (let i = 0; i < firstDow; i++)
      h += '<div class="cv-cell other"><div class="cv-num">' + (prevLast - firstDow + 1 + i) + '</div></div>';

    for (let d = 1; d <= lastDate; d++) {
      const dow     = (firstDow + d - 1) % 7;
      const isToday = today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === d;
      const hkey    = month + '-' + d;
      const holiday = HOLIDAYS_2026[hkey];
      const dateStr = year + '-' + _pad(month) + '-' + _pad(d);
      let cls = 'cv-cell';
      if (isToday)            cls += ' today';
      if (dow === 0 || holiday) cls += ' sun';
      if (dow === 6)          cls += ' sat';
      if (holiday)            cls += ' holiday';

      h += '<div class="' + cls + '" onclick="_calSelectDay(\'' + dateStr + '\')">';
      h += '<div class="cv-num">' + d + '</div>';
      if (holiday) h += '<div class="cv-holiday-name">' + holiday + '</div>';

      const its = byDay[d] || [];
      if (its.length) {
        h += '<div class="cv-mini-list">';
        its.slice(0, 3).forEach(it => {
          const clr = STATUS_CLR[it.status] || 'var(--brand)';
          h += '<div class="cv-mini-card" style="--card-clr:' + clr + '">' + _esc(it.cust) + '</div>';
        });
        if (its.length > 3) h += '<div class="cv-mini-more">+' + (its.length - 3) + '건</div>';
        h += '</div>';
      }
      h += '</div>';
    }

    const rem = (firstDow + lastDate) % 7;
    if (rem > 0)
      for (let i = 1; i <= 7 - rem; i++)
        h += '<div class="cv-cell other"><div class="cv-num">' + i + '</div></div>';
    return h;
  }

  function _renderMonth(year, month, mapped) {
    const body = _body(); if (!body) return;
    const lbl  = _label(); if (lbl) lbl.textContent = year + '년 ' + month + '월';
    const byDay = {};
    mapped.forEach(m => { (byDay[m.d] = byDay[m.d] || []).push(m); });
    const firstDow = new Date(year, month - 1, 1).getDay();
    const lastDate = new Date(year, month, 0).getDate();
    const today    = new Date();
    const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
    let h = '<div class="cv-wk-hdr">';
    DAY_NAMES.forEach(d => { h += '<div>' + d + '</div>'; });
    h += '</div><div class="cv-cal-grid">'
      + _renderMonthCells(year, month, byDay, firstDow, lastDate, today)
      + '</div>'
      + '<button class="cv-fab" id="cv-fab-add">＋ 예약 추가</button>';
    body.innerHTML = h;
    body.querySelector('#cv-fab-add').addEventListener('click', () => {
      _curDate = new Date();
      _openForm(_curDate, null);
    });
  }

  // === 일 뷰 ===
  function _buildChipStrip(date) {
    const DOW = ['일', '월', '화', '수', '목', '금', '토'];
    let h = '<div class="cv-wk-chip" id="cv-day-strip">';
    for (let i = -14; i <= 14; i++) {
      const d = new Date(date);
      d.setDate(d.getDate() + i);
      const ds = _ds(d);
      h += '<button class="' + (i === 0 ? 'active' : '') + '" onclick="_calSelectDayChip(\'' + ds + '\')" data-date="' + ds + '">';
      h += '<span style="font-size:10px">' + DOW[d.getDay()] + '</span>';
      h += '<span style="font-size:14px;font-weight:700">' + d.getDate() + '</span></button>';
    }
    return h + '</div>';
  }

  function _buildDaySlots(date, mapped) {
    const dayItems = mapped.filter(m => m.d === date.getDate());
    const dayLabel  = date.getFullYear() + '년 ' + (date.getMonth() + 1) + '월 ' + date.getDate() + '일';
    let h = '<div class="cv-d-hd">'
      + '<span style="font-size:14px;font-weight:700">' + dayLabel + '</span>'
      + '<span style="font-size:12px;color:var(--text-subtle)">' + dayItems.length + '건</span>'
      + '</div>';
    if (!dayItems.length) {
      h += '<div class="cv-d-empty">예약이 없어요</div>';
    } else {
      dayItems.forEach(it => {
        const clr = STATUS_CLR[it.status] || 'var(--brand)';
        h += '<button class="cv-d-slot cv-d-slot--btn" data-booking-id="' + _esc(it.id) + '">';
        h += '<div class="cv-d-time">' + it.t + ' · ' + it.dur + '분</div>';
        h += '<div class="cv-d-card" style="--card-clr:' + clr + '">'
          + '<div style="font-size:13px;font-weight:700">' + _esc(it.cust) + '</div>';
        if (it.svc) h += '<div style="font-size:11px;color:var(--text-subtle)">' + _esc(it.svc) + '</div>';
        h += '</div></button>';
      });
    }
    return h + '<button class="cv-d-add" id="cv-add-btn">+ 예약 추가</button>';
  }

  function _renderDay(date, mapped) {
    const body = _body(); if (!body) return;
    body.innerHTML = _buildChipStrip(date) + _buildDaySlots(date, mapped);
    body.querySelectorAll('[data-booking-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = _mappedCache.find(m => m.id === btn.dataset.bookingId);
        if (item) _openForm(date, item._raw);
      });
    });
    body.querySelector('#cv-add-btn')?.addEventListener('click', () => _openForm(date, null));
    setTimeout(() => {
      const strip  = document.getElementById('cv-day-strip');
      const active = strip?.querySelector('.active');
      if (active) active.scrollIntoView({ inline: 'center', behavior: 'smooth' });
    }, 50);
  }

  // === 예약 폼 ===
  function _buildSlots(hours) {
    const slots = [];
    for (let h = hours.start; h < hours.end; h++)
      for (let m = 0; m < 60; m += hours.slotMin)
        slots.push(_pad(h) + ':' + _pad(m));
    return slots;
  }

  function _buildFormHTML(existing, slots, dateStr, defStart, defEnd) {
    const isEdit = !!existing;
    const opt = (def) => slots.map(s => `<option value="${s}"${s === def ? ' selected' : ''}>${s}</option>`).join('');
    const STATUS_BTNS = [
      ['confirmed','📅 확정','--confirmed'], ['no_show','🚫 안 옴','--no-show'],
      ['completed','✅ 완료','--completed'], ['cancelled','❌ 취소','--cancelled'],
    ];
    return `
<button class="cv-form-back" id="cv-form-back">← 뒤로</button>
<div class="dt-field-row"><label class="dt-field-lbl">날짜 *</label><input id="bfDate" type="date" class="dt-field" value="${dateStr}" /></div>
<div style="display:flex;gap:8px;margin-bottom:12px;">
  <div style="flex:1"><label class="dt-field-lbl">시작 *</label><select id="bfStart" class="dt-field">${opt(defStart)}</select></div>
  <div style="flex:1"><label class="dt-field-lbl">종료 *</label><select id="bfEnd" class="dt-field">${opt(defEnd)}</select></div>
</div>
<div class="dt-field-row"><label class="dt-field-lbl">고객</label>
<div style="display:flex;gap:6px;align-items:center;">
  <input id="bfCustName" readonly class="dt-field" style="flex:1;cursor:pointer;" placeholder="탭해서 고객 선택" value="${_esc(existing?.customer_name || '')}" />
  <button type="button" id="bfCustPick" class="btn-secondary">👤 선택</button>
</div>
<div id="bfCustChip" style="margin-top:6px;display:${existing?.customer_name ? 'flex' : 'none'};align-items:center;gap:6px;padding:6px 12px;background:rgba(241,128,145,0.08);border-radius:10px;font-size:12px;color:var(--brand,#F18091);font-weight:700;">
  <span id="bfCustChipName">${_esc(existing?.customer_name || '')}</span>
  <button type="button" id="bfCustClear" style="background:none;border:none;color:#c00;cursor:pointer;font-size:14px;padding:0 4px;" title="고객 지정 해제">✕</button>
</div>
</div>
<div class="dt-field-row"><label class="dt-field-lbl">서비스</label>
  <input id="bfSvc" list="bfSvcDl" class="dt-field" value="${_esc(existing?.service_name || '')}" placeholder="시술명" maxlength="50" autocomplete="off" /><datalist id="bfSvcDl"></datalist></div>
<div class="dt-field-row"><label class="dt-field-lbl">메모</label><textarea id="bfMemo" class="dt-field" rows="2" maxlength="200">${_esc(existing?.memo || '')}</textarea></div>
<div id="bfConflict" class="dt-conflict">⚠️ 이 시간에 이미 예약이 있어요</div>
<div style="display:flex;gap:8px;margin-bottom:8px;">
  <button type="button" id="bfSave" class="btn-primary" style="flex:1">${isEdit ? '수정' : '저장'}</button>
  ${isEdit ? '<button type="button" id="bfDelete" class="btn-secondary" style="color:var(--danger)">삭제</button>' : ''}
</div>
${isEdit && existing.status !== 'completed'
  ? '<button type="button" id="bfComplete" class="main-cta" style="width:100%;margin-bottom:10px">🎀 시술 완료 · 매출·후기 한 번에 기록</button>'
  : ''}
${isEdit ? `
<div style="margin-top:4px;padding-top:12px;border-top:1px dashed var(--border)">
  <div style="font-size:11px;color:var(--text-subtle);margin-bottom:8px;font-weight:700">예약 상태</div>
  <div class="dt-status-row">
    ${STATUS_BTNS.map(([s, l, c]) => `<button type="button" data-bf-status="${s}" class="dt-status-btn${existing.status === s ? ' dt-status-btn' + c : ''}">${l}</button>`).join('')}
  </div>
</div>` : ''}`;
  }

  function _bindFormExtras(body, existing) {
    let custId = existing?.customer_id || null;
    const _updateCustChip = (name) => {
      const chip = body.querySelector('#bfCustChip');
      const chipName = body.querySelector('#bfCustChipName');
      if (chip && chipName) {
        if (name) {
          chipName.textContent = '✅ ' + name + ' 선택됨';
          chip.style.display = 'flex';
        } else {
          chip.style.display = 'none';
        }
      }
    };
    const _doPick = async () => {
      if (!window.Customer?.pick) { if (window.showToast) window.showToast('고객 모듈 로드 중…'); return; }
      const picked = await window.Customer.pick({ selectedId: custId });
      if (picked === null) return;
      custId = picked.id;
      const name = picked.name || '';
      body.querySelector('#bfCustName').value = name;
      _updateCustChip(name);
    };
    body.querySelector('#bfCustPick').addEventListener('click', _doPick);
    body.querySelector('#bfCustName').addEventListener('click', _doPick);
    body.querySelector('#bfCustClear')?.addEventListener('click', () => {
      custId = null;
      body.querySelector('#bfCustName').value = '';
      _updateCustChip(null);
    });
    const chk = () => {
      const d = body.querySelector('#bfDate').value;
      const s = body.querySelector('#bfStart').value;
      const e = body.querySelector('#bfEnd').value;
      if (!d || !s || !e) return;
      const conflict = window.Booking.hasConflict(
        new Date(d + 'T' + s + ':00').toISOString(),
        new Date(d + 'T' + e + ':00').toISOString(),
        existing?.id,
      );
      body.querySelector('#bfConflict').style.display = conflict ? 'block' : 'none';
    };
    ['bfDate', 'bfStart', 'bfEnd'].forEach(id => body.querySelector('#' + id).addEventListener('change', chk));
    chk();
    body._getCustId = () => custId;
    (async () => {
      const dl = body.querySelector('#bfSvcDl'); if (!dl || !window.API || !window.authHeader) return;
      const names = new Set();
      try { const r = await fetch(window.API + '/services', { headers: window.authHeader() }); if (r.ok) { const d = await r.json(); (d.items || []).forEach(s => s.name && names.add(s.name)); } } catch (_) { /* ignore */ }
      try { const r = await fetch(window.API + '/revenue?period=month', { headers: window.authHeader() }); if (r.ok) { const d = await r.json(); (d.items || []).forEach(r => r.service_name && names.add(r.service_name)); } } catch (_) { /* ignore */ }
      dl.innerHTML = Array.from(names).slice(0, 50).map(n => `<option value="${_esc(n)}"></option>`).join('');
    })();
  }

  function _bindFormSave(body, existing, date) {
    body.querySelector('#bfSave').addEventListener('click', async () => {
      const d = body.querySelector('#bfDate').value;
      const s = body.querySelector('#bfStart').value;
      const e = body.querySelector('#bfEnd').value;
      if (!d || !s || !e) { if (window.showToast) window.showToast('날짜·시간을 입력해 주세요'); return; }
      if (s >= e) { if (window.showToast) window.showToast('종료 시간이 시작보다 늦어야 해요'); return; }
      const payload = {
        starts_at:     new Date(d + 'T' + s + ':00').toISOString(),
        ends_at:       new Date(d + 'T' + e + ':00').toISOString(),
        customer_id:   body._getCustId?.() || null,
        customer_name: body.querySelector('#bfCustName').value.trim() || null,
        service_name:  body.querySelector('#bfSvc').value.trim()      || null,
        memo:          body.querySelector('#bfMemo').value.trim()      || null,
      };
      try {
        if (existing) {
          await window.Booking.update(existing.id, payload);
        } else {
          await window.Booking.create(payload);
          window.dispatchEvent(new CustomEvent('booking:created', { detail: { customer_name: payload.customer_name, customer_id: payload.customer_id || null } }));
        }
        if (window.hapticLight) window.hapticLight();
        // T-D 토스트: ✓ {name}님 {date} {time} 예약 추가됨
        const _name = payload.customer_name || '';
        const _date = d || '';
        const _time = s || '';
        const _addToast = _name
          ? `✓ ${_name}님 ${_date} ${_time} 예약 추가됨`
          : `✓ ${_date} ${_time} 예약 추가됨`;
        const _editToast = _name
          ? `✓ ${_name}님 ${_date} ${_time} 예약 수정됨`
          : `✓ ${_date} ${_time} 예약 수정됨`;
        if (window.showToast) window.showToast(existing ? _editToast : _addToast);
        if (window.Dashboard?.refresh) window.Dashboard.refresh(true);
        _mappedCache = await _loadMonth(_curYear, _curMonth);
        _renderDay(date || _curDate, _mappedCache);
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
        if (window.hapticLight) window.hapticLight();
        if (window.showToast) window.showToast('삭제 완료');
        if (window.Dashboard?.refresh) window.Dashboard.refresh(true);
        _mappedCache = await _loadMonth(_curYear, _curMonth);
        _renderDay(date || _curDate, _mappedCache);
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
          if (window.hapticLight) window.hapticLight();
          if (window.showToast) window.showToast(`✅ 상태를 '${STATUS_LABEL[newStatus]}'로 변경했어요`);
          if (window.Dashboard?.refresh) window.Dashboard.refresh(true);
          _mappedCache = await _loadMonth(_curYear, _curMonth);
          _renderDay(date || _curDate, _mappedCache);
        } catch (_) { if (window.showToast) window.showToast('상태 변경 실패'); }
      });
    });
  }

  function _openForm(date, existing) {
    const body = _body(); if (!body) return;
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
    body.innerHTML = '<div class="cv-form-wrap">' + _buildFormHTML(existing, slots, dateStr, defS, defE) + '</div>';
    body.querySelector('#cv-form-back').addEventListener('click', () => _switchView(_curView));
    _bindFormExtras(body, existing);
    _bindFormSave(body, existing, date);
    if (existing) _bindFormActions(body, existing, date);
  }

  // === 뷰 토글 ===
  function _switchView(view) {
    _curView = view;
    const o = _overlay(); if (!o) return;
    o.querySelectorAll('.cal-view-toggle button').forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
    });
    if (view === 'month') _renderMonth(_curYear, _curMonth, _mappedCache);
    else                  _renderDay(_curDate, _mappedCache);
  }

  // === 인접 월 미리 캐싱 ===
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

  // === 월 네비 ===
  async function _prevMonth() {
    _curMonth--;
    if (_curMonth < 1) { _curMonth = 12; _curYear--; }
    const lbl = _label(); if (lbl) lbl.textContent = _curYear + '년 ' + _curMonth + '월';
    const body = _body(); if (body) body.innerHTML = _skeletonMonth();
    _mappedCache = await _loadMonth(_curYear, _curMonth);
    _renderMonth(_curYear, _curMonth, _mappedCache);
    _prefetchNeighbors();
  }
  async function _nextMonth() {
    _curMonth++;
    if (_curMonth > 12) { _curMonth = 1; _curYear++; }
    const lbl = _label(); if (lbl) lbl.textContent = _curYear + '년 ' + _curMonth + '월';
    const body = _body(); if (body) body.innerHTML = _skeletonMonth();
    _mappedCache = await _loadMonth(_curYear, _curMonth);
    _renderMonth(_curYear, _curMonth, _mappedCache);
    _prefetchNeighbors();
  }

  // === 전역 onclick 핸들러 ===
  window._calSelectDay = function (dateStr) {
    _curDate = new Date(dateStr + 'T00:00:00');
    _switchView('day');
  };
  window._calSelectDayChip = function (dateStr) {
    _curDate = new Date(dateStr + 'T00:00:00');
    _renderDay(_curDate, _mappedCache);
  };
  window._calSwitchView = _switchView;
  window._calPrevMonth  = _prevMonth;
  window._calNextMonth  = _nextMonth;

  // === 스켈레톤 ===
  function _skeletonMonth() {
    const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
    let h = '<div class="cv-wk-hdr">';
    DAY_NAMES.forEach(d => { h += '<div>' + d + '</div>'; });
    h += '</div><div class="cv-cal-grid">';
    for (let i = 0; i < 35; i++)
      h += '<div class="cv-cell cv-cell--sk"><div class="cv-sk-num"></div></div>';
    h += '</div>';
    return h;
  }

  // === 진입점 ===
  window.openCalendarView = async function () {
    const existing = _overlay(); if (existing) existing.remove();
    const now  = new Date();
    _curYear   = now.getFullYear();
    _curMonth  = now.getMonth() + 1;
    _curDate   = now;
    _curView   = 'month';

    const o = document.createElement('div');
    o.id        = OVERLAY;
    o.className = 'cal-overlay-wrap';
    o.setAttribute('role', 'dialog');
    o.setAttribute('aria-modal', 'true');
    o.innerHTML = `
      <div class="cal-sheet">
        <div class="cal-sheet-hdr">
          <button class="cal-nav-btn" onclick="_calPrevMonth()">◁</button>
          <span class="cal-month-label">${_curYear}년 ${_curMonth}월</span>
          <button class="cal-nav-btn" onclick="_calNextMonth()">▷</button>
          <span id="cal-offline-badge" style="display:none;font-size:10px;font-weight:700;color:var(--danger);background:rgba(220,53,69,.1);padding:2px 8px;border-radius:999px;">오프라인</span>
          <div class="cal-view-toggle">
            <button class="active" data-view="month" onclick="_calSwitchView('month')">월</button>
            <button data-view="day" onclick="_calSwitchView('day')">일</button>
          </div>
          <button class="cal-close-btn" onclick="(function(){var o=document.getElementById('${OVERLAY}');if(o)o.remove();document.body.style.overflow=''})()">✕</button>
        </div>
        <div class="cal-body"></div>
      </div>`;
    o.addEventListener('click', e => { if (e.target === o) _close(); });
    document.body.appendChild(o);
    document.body.style.overflow = 'hidden';
    o.querySelector('.cal-body').innerHTML = _skeletonMonth();
    _mappedCache = await _loadMonth(_curYear, _curMonth);
    _renderMonth(_curYear, _curMonth, _mappedCache);
    _prefetchNeighbors();
  };

  // 대시보드 바로가기 · 파워뷰 · 외부 호출 호환
  window.openBooking = async function (date) {
    await window.openCalendarView();
    if (date) { _curDate = new Date(date); _switchView('day'); }
  };
  window.closeBooking = _close;

  // data-open="calendar-view" 전역 위임
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-open="calendar-view"]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    window.openCalendarView();
  }, true);

})();
