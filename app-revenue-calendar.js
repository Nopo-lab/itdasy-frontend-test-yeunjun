/* 매출 캘린더 (칩 방식) — 2026-06-05
   예약 월 그리드(window.CalendarView.buildMonthGridHTML, .bk-month-m)를 그대로 재사용.
   칸 내용만 매출칩(그 날 합계 "62만")으로 분기. 날짜 탭 → 인라인 매출 상세.
   window.RevenueCalendar = { renderInto(gridEl, detailEl, opts) }
   opts: { items, year, month, isMobile } */
(function () {
  'use strict';

  const TAG_LABEL = {
    card: '카드', cash: '현금', transfer: '계좌',
    bank_transfer: '계좌', membership: '회원권', etc: '기타',
    booking_deposit: '예약금',   // [핫픽스E #2] 예약금 의사항목 — '기타' 대신 '예약금'으로 표시
  };
  const METHOD_ORDER = ['card', 'cash', 'transfer', 'membership', 'etc'];
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];

  function _esc(s) { return window._esc(s); } /* [2026-06-11] 중복 제거 — app-core 정본 위임 */
  function _money(n) { return (+n || 0).toLocaleString('ko-KR'); }
  // 만원 단위 칩 표기 (천 단위 반올림). 0원/내역 없는 날은 호출 안 함.
  function _man(total) {
    const m = Math.round((+total || 0) / 10000);
    return (total > 0 ? Math.max(1, m) : 0) + '만';
  }
  // recorded_at(ISO, tz-aware) → KST 달력 날짜 'YYYY-MM-DD'
  function _kstDay(iso) {
    try { return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }); }
    catch (_e) { return ''; }
  }
  // 시술명 sanitize — 내부 태그([auto_booking:ID]) 절대 노출 X. 없으면 ''.
  function _svcRaw(r) {
    return String((r && r.service_name) || '').replace(/\s*\[auto_booking:[^\]]*\]/gi, '').trim();
  }
  // 항목 제목 — 고객이름 메인 + 시술명 보조. 고객 없으면 시술 메인, 둘 다 없으면 '예약 매출'.
  function _itemTitle(r) {
    const cust = String((r && r.customer_name) || '').trim();
    const svc = _svcRaw(r);
    if (cust) return { main: cust, sub: svc };
    return { main: svc || '예약 매출', sub: '' };
  }
  function _normMethod(m) {
    let k = String(m || 'card').toLowerCase();
    if (k === 'bank_transfer') k = 'transfer';
    return TAG_LABEL[k] ? k : 'etc';
  }
  function _groupByDay(items) {
    const map = {};
    (items || []).forEach(r => {
      const day = _kstDay(r.recorded_at || r.created_at);
      if (!day) return;
      (map[day] = map[day] || []).push(r);
    });
    return map;
  }

  function _ensureStyles() {
    if (document.getElementById('rvcalStyles')) return;
    const s = document.createElement('style');
    s.id = 'rvcalStyles';
    s.textContent = `
      .rvcal-grid .bk-month-m__cell--sel{outline:2px solid var(--brand-strong,#BC6675);outline-offset:-2px;border-radius:6px;z-index:1}
      /* 매출 칩 — 예약 .bk-month-m__evt(8px) 보다 크고 날짜 아래 로즈 알약 */
      .rvcal-grid .bk-month-m__cells{grid-auto-rows:64px}
      .rvcal-grid .bk-month-m__cell{padding:6px 5px 5px 7px}
      .rvcal-grid .bk-month-m__evt{font-size:10.5px;font-weight:600;padding:1px 6px;border-radius:4px;margin-top:4px;align-self:flex-start;line-height:1.45;font-variant-numeric:tabular-nums;background:var(--brand-bg,#F7EFF0);color:var(--brand-strong,#BC6675)}
      @media(min-width:1100px){
        /* 기본: 캘린더 풀폭 + 칩 크게 */
        .rvcal-grid .bk-month-m__cells{grid-auto-rows:88px}
        .rvcal-grid .bk-month-m__num{font-size:13px}
        .rvcal-grid .bk-month-m__evt{font-size:14px;padding:3px 10px;margin-top:6px}
        /* 날짜 선택 시: 캘린더 모바일폭 축소 + 우측 상세 슬라이드 인 */
        .rvcal-wrap{display:flex;gap:16px;align-items:flex-start}
        .rvcal-wrap .rvcal-grid{flex:1 1 auto;min-width:0;transition:flex-basis .32s ease,max-width .32s ease}
        .rvcal-wrap .rvcal-detail{display:none;flex:0 0 360px;margin-top:0}
        .rvcal-wrap.is-detail .rvcal-grid{flex:0 0 460px;max-width:460px}
        .rvcal-wrap.is-detail .rvcal-grid .bk-month-m__cells{grid-auto-rows:72px}
        .rvcal-wrap.is-detail .rvcal-grid .bk-month-m__evt{font-size:11px;padding:2px 7px;margin-top:4px}
        .rvcal-wrap.is-detail .rvcal-detail{display:block;animation:rvcalSlideIn .3s ease}
        @keyframes rvcalSlideIn{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:none}}
      }
      .rvcal-detail{margin-top:14px;background:var(--surface,#fff);border:.5px solid var(--border,rgba(0,0,0,.07));border-radius:16px;padding:16px 18px;box-shadow:var(--shadow-sm,0 2px 8px rgba(0,0,0,.04))}
      .rvcal-detail.is-empty{color:var(--text-subtle,#8B95A1);font-size:12.5px;text-align:center;padding:22px 18px;font-weight:500}
      .rvcal-dh{display:flex;align-items:center;border-left:3px solid var(--brand-strong,#BC6675);padding-left:11px;margin-bottom:6px}
      .rvcal-dh .dt{font-size:14.5px;font-weight:700;color:var(--text,#191F28)}
      .rvcal-dh .da{margin-left:auto;font-size:17px;font-weight:800;letter-spacing:-.03em;color:var(--text,#191F28);font-variant-numeric:tabular-nums}
      .rvcal-x{margin-left:10px;width:26px;height:26px;flex-shrink:0;border:0;background:var(--surface-2,#F7F8FA);border-radius:50%;color:var(--text-subtle,#8B95A1);font-size:14px;cursor:pointer;line-height:1;font-family:inherit}
      .rvcal-dsub{font-size:11.5px;color:var(--text-subtle,#8B95A1);padding-left:14px;margin-bottom:8px;font-weight:500}
      .rvcal-li{display:flex;align-items:center;padding:11px 0;border-top:.5px solid var(--border,rgba(0,0,0,.07))}
      .rvcal-li .nm{flex:1;min-width:0;font-size:13.5px;font-weight:600;color:var(--text,#191F28)}
      .rvcal-li .nm .sub{font-size:11.5px;font-weight:400;color:var(--text-subtle,#8B95A1);margin-left:5px}
      .rvcal-li .pm{min-width:36px;text-align:center;font-size:10.5px;color:var(--text-subtle,#8B95A1);background:var(--surface-2,#F7F8FA);padding:3px 9px;border-radius:999px;font-weight:500;margin-right:14px}
      .rvcal-li .am{min-width:76px;text-align:right;font-size:13.5px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--text,#191F28)}
      .rvcal-add{margin-top:12px;width:100%;padding:11px;border:.5px solid var(--brand,#D58A95);border-radius:10px;background:var(--brand-bg,#F7EFF0);color:var(--brand-strong,#BC6675);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}
      .rvcal-add:active{transform:scale(.99)}
    `;
    document.head.appendChild(s);
  }

  function _dayLabel(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`;
  }

  function _renderDetail(detailEl, dateStr, records) {
    const list = (records || []).slice().sort((a, b) => (b.amount || 0) - (a.amount || 0));
    const total = list.reduce((s, r) => s + (r.amount || 0), 0);
    // 결제수단 카운트 — [매출감사 2026-08-04] **환불은 세지 않는다.**
    //   문구가 'N팀 완료' 다. 환불이 한 팀으로 세지면 시술을 한 번 더 한 것처럼 보인다.
    //   서버 summary.count 도 같은 규칙이라 여기만 다르면 화면끼리 숫자가 갈린다.
    //   금액(total)은 음수가 그대로 더해져 자동 차감된다 — 그게 순매출이라 맞다.
    const sales = list.filter(r => (r.amount || 0) >= 0);
    const refunds = list.length - sales.length;
    const counts = {};
    sales.forEach(r => { const k = _normMethod(r.method); counts[k] = (counts[k] || 0) + 1; });
    const methodStr = METHOD_ORDER.filter(k => counts[k]).map(k => `${TAG_LABEL[k]} ${counts[k]}`).join(' · ');
    const sub = `${sales.length}팀 완료${refunds ? ` · 환불 ${refunds}건` : ''}${methodStr ? ' · ' + methodStr : ''}`;
    const rows = list.map(r => {
      const t = _itemTitle(r);
      const nm = _esc(t.main) + (t.sub ? `<span class="sub">${_esc(t.sub)}</span>` : '');
      const pm = TAG_LABEL[_normMethod(r.method)];
      // [버그2] 실제 매출 행만 인라인 편집 가능 — 예약금 합성 엔트리(_booking_deposit)는 예약에서 관리하므로 제외
      const editable = !r._booking_deposit && r.id != null;
      const attrs = editable ? ` data-rev-id="${_esc(String(r.id))}" style="cursor:pointer"` : '';
      return `<div class="rvcal-li${editable ? ' is-editable' : ''}"${attrs}><span class="nm">${nm}</span><span class="pm">${pm}</span><span class="am">${_money(r.amount)}</span></div>`;
    }).join('');
    detailEl.className = 'rvcal-detail';
    detailEl.innerHTML = `
      <div class="rvcal-dh"><span class="dt">${_esc(_dayLabel(dateStr))}</span><span class="da">${_money(total)}원</span><button type="button" class="rvcal-x" data-rvcal-close aria-label="닫기">✕</button></div>
      ${list.length ? `<div class="rvcal-dsub">${_esc(sub)}</div>` : '<div class="rvcal-dsub">이 날은 기록된 매출이 없어요</div>'}
      ${rows}
      <button type="button" class="rvcal-add" data-rvcal-add="${_esc(dateStr)}">+ 이 날 매출 입력</button>`;
  }

  function renderInto(gridEl, detailEl, opts) {
    opts = opts || {};
    if (!gridEl) return;
    // [P0-2] CalendarView(월 그리드 렌더러)는 이제 lazy 'features' 그룹. 아직 로드 전이면
    //   그룹 로드 후 재렌더 — 빈 그리드로 남지 않게 브리지.
    if (!window.CalendarView || !window.CalendarView.buildMonthGridHTML) {
      if (window.AppLoader && typeof window.AppLoader.ensure === 'function' && !window.AppLoader.loaded('features')) {
        window.AppLoader.ensure('features').then(() => renderInto(gridEl, detailEl, opts));
      }
      return;
    }
    _ensureStyles();
    const byDay = _groupByDay(opts.items);
    const totals = {};
    Object.keys(byDay).forEach(day => { totals[day] = byDay[day].reduce((s, r) => s + (r.amount || 0), 0); });

    const isPC = (window.innerWidth || 0) >= 1100;
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    const inThisMonth = todayStr.startsWith(`${opts.year}-${String(opts.month).padStart(2, '0')}`);
    // PC 기본: 선택 없음(캘린더 풀폭). 모바일: 오늘(이번달) 또는 매출 첫날 자동 선택(아래 상세 펼침).
    let selected = isPC ? '' : (inThisMonth ? todayStr : (Object.keys(byDay).sort()[0] || ''));
    const wrap = gridEl.closest('[data-rvcal-wrap]');

    gridEl.innerHTML = window.CalendarView.buildMonthGridHTML({
      year: opts.year, month: opts.month, selected,
      dayChip: (ds) => { const t = totals[ds]; return t > 0 ? `<div class="bk-month-m__evt">${_man(t)}</div>` : ''; },
    });

    function showDetail(dateStr) {
      selected = dateStr;
      gridEl.querySelectorAll('.bk-month-m__cell--sel').forEach(c => c.classList.remove('bk-month-m__cell--sel'));
      const cell = gridEl.querySelector(`[data-cal-day="${dateStr}"]`);
      if (cell) cell.classList.add('bk-month-m__cell--sel');
      if (wrap) wrap.classList.add('is-detail');   // PC: 캘린더 축소 + 상세 슬라이드 인
      if (detailEl) _renderDetail(detailEl, dateStr, byDay[dateStr] || []);
    }
    function deselect() {
      selected = '';
      gridEl.querySelectorAll('.bk-month-m__cell--sel').forEach(c => c.classList.remove('bk-month-m__cell--sel'));
      if (wrap) wrap.classList.remove('is-detail');  // PC: 풀폭 복귀
      if (detailEl) { detailEl.className = 'rvcal-detail is-empty'; detailEl.textContent = '날짜를 누르면 그 날 매출이 보여요'; }
    }

    if (selected) showDetail(selected);              // 모바일 초기 자동 선택
    else if (detailEl) { detailEl.className = 'rvcal-detail is-empty'; detailEl.textContent = '날짜를 누르면 그 날 매출이 보여요'; }

    // 칸 탭 → 선택 + 상세 (그리드 내부 위임, 다른 캘린더와 DOM 분리)
    if (!gridEl._rvcalBound) {
      gridEl._rvcalBound = true;
      gridEl.addEventListener('click', (e) => {
        const cell = e.target.closest('[data-cal-day]');
        if (!cell || !gridEl.contains(cell) || cell.classList.contains('bk-month-m__cell--other')) return;
        const ds = cell.getAttribute('data-cal-day');
        if (ds) showDetail(ds);
      });
    }
    // 상세 닫기(X) / "+ 이 날 매출 입력"(기존 hub 재사용 + 날짜 힌트 stash; hub 날짜필드 추가는 후속)
    if (detailEl && !detailEl._rvcalBound) {
      detailEl._rvcalBound = true;
      detailEl.addEventListener('click', (e) => {
        if (e.target.closest('[data-rvcal-close]')) { deselect(); return; }
        // [버그2] 매출 행 탭 → 그 행 아래로 인라인 편집(금액·결제수단 수정 + 삭제) 펼침
        const li = e.target.closest('.rvcal-li[data-rev-id]');
        if (li && window.RevenueEdit) {
          const id = li.getAttribute('data-rev-id');
          const rec = (byDay[selected] || []).find(r => String(r.id) === String(id));
          if (rec) window.RevenueEdit.toggle(li, rec);
          return;
        }
        const btn = e.target.closest('[data-rvcal-add]');
        if (!btn) return;
        try { window._revenueHubPrefillDate = btn.getAttribute('data-rvcal-add') || ''; } catch (_e) { void _e; }
        if (typeof window.openRevenueHub === 'function') window.openRevenueHub();
      });
    }
  }

  window.RevenueCalendar = { renderInto };
})();
