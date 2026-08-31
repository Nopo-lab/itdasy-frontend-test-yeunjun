/* ─────────────────────────────────────────────────────────────
   매출관리 — 이번달 뷰 (Step 5+6 · 2026-05-17, mockup-revenue-v6 기반)

   v6 추가:
   - PC 상단 2컬럼 (히어로+순수익 왼쪽 360px / 결제수단+AI 오른쪽 flex)
   - 일별 매출 / 매출 내역 = 전체 너비 카드
   - 월 네비게이션 실제 동작 — BE year/month 파라미터 전달
   - 과거 월: AI 예상 row 숨김, 다음달 버튼 enable
   - 일별 7일 / 매출 5건 + 더보기 접기
   - 카운트업 (easeOutCubic 0.8s)

   외부 API: window.RevenueMonth = {
     fetchSummary, fallbackSummary, renderPC, renderMobile,
     readGoal, writeGoal, clearGoal, _ensureStyles,
     getView, getViewItems
   }
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const GOAL_KEY = 'itdasy_daily_goal_v1';
  const STYLE_ID = 'rvmStyles';

  // 월 네비 상태 — IIFE 내부 let
  let _viewYear = new Date().getFullYear();
  let _viewMonth = new Date().getMonth() + 1;  // 1~12
  let _viewItems = null;  // 과거 월일 때만 채워짐 (이번달은 호출자 _items 사용)

  function _isCurrentMonth() {
    const now = new Date();
    return _viewYear === now.getFullYear() && _viewMonth === (now.getMonth() + 1);
  }
  function _monthLabel() {
    return _viewYear + '년 ' + _viewMonth + '월';
  }
  function _goPrevMonth() {
    if (_viewMonth === 1) { _viewYear -= 1; _viewMonth = 12; }
    else { _viewMonth -= 1; }
  }
  function _goNextMonth() {
    const now = new Date();
    const curY = now.getFullYear(), curM = now.getMonth() + 1;
    if (_viewYear < curY || (_viewYear === curY && _viewMonth < curM)) {
      if (_viewMonth === 12) { _viewYear += 1; _viewMonth = 1; }
      else { _viewMonth += 1; }
    }
  }
  function _goThisMonth() {
    const now = new Date();
    _viewYear = now.getFullYear(); _viewMonth = now.getMonth() + 1;
  }

  function _R() { return window.Revenue || {}; }

  // [2026-05-20] 월 요약 SWR — revenue.js 의 generic SWR 재활용. TTL 60초 (주 탭과 동일).
  const _MONTH_SWR_TTL = 60 * 1000;
  function _monthSwrKey() {
    return `pv_cache::revenue::summary::${_viewYear}-${String(_viewMonth).padStart(2, '0')}`;
  }
  function _monthItemsSwrKey() {
    return `pv_cache::revenue::month-items::${_viewYear}-${String(_viewMonth).padStart(2, '0')}`;
  }

  // ── 데이터 ──────────────────────────────────────────────
  async function fetchSummary() {
    if (!window.API || !window.authHeader) throw new Error('no-auth');
    const auth = window.authHeader();
    if (!auth?.Authorization) throw new Error('no-token');
    const isCur = _isCurrentMonth();
    // [2026-05-20] SWR 캐시: 1순위. 신선하면 그대로 반환. stale 이면 백그라운드 갱신.
    const R = _R();
    const cached = (R._swrReadKey && R._swrReadKey(_monthSwrKey(), _MONTH_SWR_TTL)) || null;
    if (cached && cached.items) {
      const cachedSummary = cached.items;
      // 과거 월: items 캐시도 있으면 같이 복원
      if (!isCur && R._swrReadKey) {
        const ci = R._swrReadKey(_monthItemsSwrKey(), _MONTH_SWR_TTL);
        _viewItems = (ci && Array.isArray(ci.items)) ? ci.items : null;
      } else {
        _viewItems = null;
      }
      // stale 이면 백그라운드 새로고침 (await X)
      if (!cached.fresh) {
        _refreshSummaryInBackground(auth, isCur).catch(() => {});
      }
      return await _withBookingOverlay(cachedSummary);
    }
    // 캐시 미스 — 정상 fetch
    return await _doFetchSummary(auth, isCur);
  }

  async function _doFetchSummary(auth, isCur) {
    let url = '/revenue/summary?period=month';
    if (!isCur) url += '&year=' + _viewYear + '&month=' + _viewMonth;
    const res = await apiFetch(url, { headers: { ...auth, 'Content-Type': 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const summary = await _withBookingOverlay(await res.json());
    const R = _R();
    if (R._swrWriteKey) R._swrWriteKey(_monthSwrKey(), summary);
    if (!isCur) {
      try {
        const r2 = await fetch(
          apiUrl('/revenue?period=month&year=' + _viewYear + '&month=' + _viewMonth),
          { headers: { ...auth, 'Content-Type': 'application/json' } }
        );
        if (r2.ok) {
          const d = await r2.json();
          _viewItems = Array.isArray(d.items) ? d.items : [];
          if (R._swrWriteKey) R._swrWriteKey(_monthItemsSwrKey(), _viewItems);
        } else { _viewItems = []; }
      } catch (_e) { _viewItems = []; }
    } else {
      _viewItems = null;
    }
    return summary;
  }

  async function _withBookingOverlay(summary) {
    if (!window.BookingRevenueOverlay || typeof window.BookingRevenueOverlay.enrichSummary !== 'function') return summary;
    return await window.BookingRevenueOverlay.enrichSummary(summary, { year: _viewYear, month: _viewMonth });
  }

  async function _refreshSummaryInBackground(auth, isCur) {
    try {
      await _doFetchSummary(auth, isCur);
      // 백그라운드 fresh 도착 — 화면 갱신
      const R = _R();
      if (R._rerender) R._rerender();
    } catch (_e) { /* silent */ }
  }

  function _bizDaysBetween(fromD, toD) {
    let n = 0;
    const d = new Date(fromD.getFullYear(), fromD.getMonth(), fromD.getDate());
    const end = new Date(toD.getFullYear(), toD.getMonth(), toD.getDate());
    while (d <= end) {
      if (d.getDay() !== 0) n++;
      d.setDate(d.getDate() + 1);
    }
    return n;
  }

  function fallbackSummary(items) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const total = items.reduce((s, r) => s + (r.amount || 0), 0);
    const count = items.length;
    const net_total = items.reduce((s, r) => s + (r.net_amount != null ? r.net_amount : (r.amount || 0)), 0);
    const avg_per = count ? Math.floor(total / count) : 0;

    const biz = _bizDaysBetween(monthStart, now);
    const daily_avg = biz ? Math.floor(total / biz) : 0;
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    const remaining = tomorrow <= lastDay ? _bizDaysBetween(tomorrow, lastDay) : 0;

    const by_method = {};
    const dailyMap = {};
    items.forEach(r => {
      const m = r.method || 'card';
      by_method[m] = (by_method[m] || 0) + (r.amount || 0);
      const t = new Date(r.recorded_at || r.created_at);
      if (isNaN(t)) return;
      const key = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
      if (!dailyMap[key]) dailyMap[key] = { date: key, total: 0, count: 0 };
      dailyMap[key].total += r.amount || 0;
      dailyMap[key].count += 1;
    });
    const daily = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

    const summary = {
      period: 'month', year: now.getFullYear(), month: now.getMonth() + 1, is_past: false,
      total, count, net_total,
      /* PROFIT_HIDDEN */ material_cost_total: 0,
      /* PROFIT_HIDDEN */ net_profit: net_total,
      avg_per_customer: avg_per,
      business_days: biz,
      daily_avg,
      projected_total: total + daily_avg * remaining,
      remaining_business_days: remaining,
      prev_same_period: { total: 0, count: 0, avg_per_customer: 0 },
      prev_full_month: 0,
      daily,
      by_method,
      _fallback: true,
    };
    if (!window.BookingRevenueOverlay || !window.Booking) return summary;
    const agg = window.BookingRevenueOverlay.summarizeBookings(window.Booking._items || [], summary);
    return window.BookingRevenueOverlay.mergeSummary(summary, agg);
  }

  // ── AI 일일 목표 ────────────────────────────────────────
  function readGoal() {
    try { const raw = localStorage.getItem(GOAL_KEY); return raw ? JSON.parse(raw) : null; }
    catch (_e) { return null; }
  }
  function writeGoal(amount) {
    const v = { amount: Math.max(0, Math.floor(+amount || 0)), set_at: new Date().toISOString().slice(0, 10) };
    try { localStorage.setItem(GOAL_KEY, JSON.stringify(v)); } catch (_e) { /* storage full */ }
    return v;
  }
  function clearGoal() {
    try { localStorage.removeItem(GOAL_KEY); } catch (_e) { /* silent */ }
  }
  // ── 헬퍼 ───────────────────────────────────────────────
  const _esc = (s) => (_R()._esc ? _R()._esc(s) : String(s == null ? '' : s));
  // [2026-06-05] recommendedGoal·_dayLabel·TAG_LABEL·METHOD_COLOR 제거 —
  //   일별리스트/결제바/목표배너가 칩 캘린더(app-revenue-calendar.js)로 대체되며 미사용.

  // ── 카운트업 (easeOutCubic) ─────────────────────────────
  function _countUp(el, target, duration) {
    if (!el || !Number.isFinite(target) || target <= 0) return;
    const start = performance.now();
    const fmt = (n) => n.toLocaleString('ko-KR') + '원';
    function tick(now) {
      const p = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(target * ease));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ── 스타일 주입 ──────────────────────────────────────────
  function _ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      /* ═════ mockup-v6 (이번달 메인) ═════ */
      .rvm5-body{padding:24px}
      .rvm5-mnav{display:flex;align-items:center;gap:14px;margin-bottom:22px}
      .rvm5-mnav .arrow{width:32px;height:32px;border-radius:50%;border:1px solid #E5E8EB;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;color:#191F28;line-height:1;padding:0;transition:background .12s}
      .rvm5-mnav .arrow:hover:not(:disabled){background:#F7F8FA}
      .rvm5-mnav .arrow:disabled{opacity:0.25;cursor:not-allowed;pointer-events:none}
      .rvm5-mnav .label{font-size:15px;font-weight:700;color:#191F28;letter-spacing:-0.4px}
      .rvm5-today{margin-left:8px;padding:0 12px;height:30px;border:1px solid #E5E8EB;border-radius:8px;background:#F7F8FA;color:#4E5968;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit}
      .rvm5-today:disabled{opacity:0.35;cursor:default;pointer-events:none}
      .rvm5-past-badge{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;background:#F7F8FA;font-size:11px;font-weight:600;color:#6B7684;margin-left:6px}

      /* PC 2컬럼 상단 */
      .rvm5-top2{display:flex;gap:20px;margin-bottom:18px}
      .rvm5-left{flex:0 0 360px;min-width:0}
      .rvm5-right{flex:1;min-width:0;display:flex;flex-direction:column;gap:10px}
      @media (max-width: 820px){.rvm5-top2{flex-direction:column}.rvm5-left{flex:1 1 auto}}

      .rvm5-hero{background:#F7EFF0;border-radius:14px;padding:22px 24px;margin-bottom:12px;display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
      .rvm5-hero .amt{font-size:32px;font-weight:800;color:#BC6675;letter-spacing:-1.5px;line-height:1}
      .rvm5-hero .cnt{font-size:13px;font-weight:600;color:#BC6675;opacity:0.65}

      .rvm5-ai{display:flex;align-items:center;gap:10px;padding:12px 16px;background:#F7F8FA;border-radius:8px}
      .rvm5-ai .badge{padding:3px 8px;border-radius:6px;background:#BC6675;color:#fff;font-size:9px;font-weight:800;flex-shrink:0;letter-spacing:0.3px}
      .rvm5-ai .txt{font-size:13px;color:#191F28}
      .rvm5-ai .txt b{font-weight:700;color:#191F28}

      .rvm5-stats{display:flex;gap:8px}
      .rvm5-stat{flex:1;padding:14px 16px;background:#F7F8FA;border-radius:8px;min-width:0}
      .rvm5-stat .l{font-size:11px;color:#191F28;margin-bottom:3px;font-weight:600}
      .rvm5-stat .v{font-size:18px;font-weight:700;letter-spacing:-0.5px;color:#191F28;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

      .rvm5-card{background:#fff;border:1px solid #E5E8EB;border-radius:14px;padding:16px}
      .rvm5-card-t{font-size:12px;font-weight:600;color:#191F28;margin-bottom:10px;letter-spacing:-0.2px}

      .rvm5-br{display:flex;align-items:center;gap:8px;padding:6px 0}
      .rvm5-br .lb{font-size:12px;width:36px;text-align:right;color:#191F28;flex-shrink:0;font-weight:500}
      .rvm5-br .tk{flex:1;height:16px;background:#F7F8FA;border-radius:4px;overflow:hidden}
      .rvm5-br .fl{height:100%;border-radius:4px;transition:width .6s cubic-bezier(.2,.7,.2,1)}
      .rvm5-br .pc{font-size:12px;font-weight:600;width:32px;text-align:right;color:#191F28;flex-shrink:0}

      .rvm5-dr{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #F7F8FA}
      .rvm5-dr:last-child{border:none}
      .rvm5-dr .d{font-size:12px;color:#191F28;width:80px;flex-shrink:0;font-weight:500}
      .rvm5-dr .bar{flex:1;height:8px;background:#F7F8FA;border-radius:4px;overflow:hidden;position:relative;min-width:60px}
      .rvm5-dr .f{height:100%;border-radius:4px;transition:width .6s cubic-bezier(.2,.7,.2,1)}
      .rvm5-dr .gl{position:absolute;top:-2px;bottom:-2px;width:1.5px;background:#191F28;border-radius:1px;opacity:0.18}
      .rvm5-dr .a{font-size:13px;font-weight:600;width:96px;text-align:right;letter-spacing:-0.3px;flex-shrink:0}
      .rvm5-dr .a.over{color:#0F6E56}
      .rvm5-dr .a.under{color:#4E5968}
      .rvm5-dr .c{font-size:11px;color:#6B7684;width:30px;text-align:right;flex-shrink:0}

      .rvm5-gb{display:flex;align-items:center;gap:8px;padding:9px 14px;border-radius:8px;margin-bottom:12px;background:#F7EFF0}
      .rvm5-gb .t{font-size:12px;font-weight:600;color:#BC6675;flex:1;letter-spacing:-0.2px}
      .rvm5-gb .btn{padding:5px 12px;border-radius:999px;font-size:11px;font-weight:600;border:1px solid #E5E8EB;background:#fff;color:#BC6675;cursor:pointer}
      .rvm5-gb .btn:hover{background:#F7F8FA}

      .rvm5-sl{font-size:13px;font-weight:700;color:#191F28;margin:0 0 12px;letter-spacing:-0.2px}
      .rvm5-list{}
      .rvm5-li{display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid #F7F8FA;cursor:pointer;transition:background .1s}
      .rvm5-li:last-child{border:none}
      .rvm5-li:hover{background:#F7F8FA}
      .rvm5-li .dt{font-size:12px;color:#6B7684;width:36px;flex-shrink:0;font-weight:500}
      .rvm5-li .nm{font-size:13px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#191F28}
      .rvm5-li .am{font-size:14px;font-weight:700;letter-spacing:-0.3px;flex-shrink:0;color:#191F28}
      .rvm5-li .ch{font-size:14px;color:#C5CBD2;margin-left:4px;flex-shrink:0}
      .rvm5-empty{padding:24px;text-align:center;color:#8B95A1;font-size:13px}

      /* 더보기 토글 */
      .rvm5-more{display:flex;align-items:center;justify-content:center;gap:4px;width:100%;padding:12px;margin-top:6px;border:none;background:#F7F8FA;border-radius:10px;font-size:12px;font-weight:600;color:#6B7684;cursor:pointer;font-family:inherit;transition:background .12s}
      .rvm5-more:hover{background:#E5E8EB}
      .rvm5-hidden{display:none}

      /* ── 모바일 v4 (2026-08-31) ──
         폰트는 4단계만: 11(라벨·캡션) / 13(본문행) / 15(섹션타이틀·행금액) / 26(히어로).
         여백도 4단계만: 4 / 8 / 14 / 20.
         카드 금지 — 히어로는 흰 바탕에 라벨+숫자, 보조 숫자는 리스트 행.
         (v6 의 로즈 카드 + .rvm5-mai 알림카드 3장은 세로 112px 를 먹어서 캘린더가 잘렸다) */
      .rvm5-mbody{padding:0}

      .rvm5-mhero{padding:8px 14px 14px}
      .rvm5-mhero .l{display:block;font-size:11px;font-weight:500;color:#8B95A1;letter-spacing:-.2px}
      .rvm5-mhero .amt{display:block;font-size:26px;font-weight:800;color:#191F28;letter-spacing:-1.4px;line-height:1.15;font-variant-numeric:tabular-nums}
      .rvm5-mhero .note{font-size:11px;color:#6B7684;margin-top:5px}
      .rvm5-mhero .note b{font-weight:700}
      .rvm5-mhero .note b.up{color:#0F6E56}
      .rvm5-mhero .note b.dn{color:#C0392B}

      .rvm5-mlist{border-top:1px solid #F1F3F5}
      .rvm5-mrow{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid #F1F3F5}
      .rvm5-mrow .l{flex:1;min-width:0;font-size:13px;font-weight:500;color:#4E5968;letter-spacing:-.2px}
      .rvm5-mrow .c{flex-shrink:0;font-size:11px;font-weight:600;color:#8B95A1;background:#F7F8FA;padding:2px 7px;border-radius:6px}
      .rvm5-mrow .v{flex-shrink:0;font-size:15px;font-weight:700;color:#191F28;letter-spacing:-.4px;font-variant-numeric:tabular-nums}
      .rvm5-mrow.ghost .l,.rvm5-mrow.ghost .v{color:#8B95A1;font-weight:500}

      .rvm5-mc{padding-bottom:8px}
      .rvm5-mc .t{display:flex;align-items:baseline;gap:8px;padding:0 14px;margin:14px 0 8px}
      .rvm5-mc .t b{font-size:15px;font-weight:700;color:#191F28;letter-spacing:-.3px}
      .rvm5-mc .t span{font-size:11px;font-weight:500;color:#8B95A1}
      .rvm5-mbody .rvcal-wrap{padding:0 14px}

      /* ═════ today/week 호환 — 옛 v4 톤 ═════ */
      .rvm-body{padding:20px}
      .rvm-pcg4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:14px;margin-bottom:16px}
      .rvm-pcg2{display:grid;grid-template-columns:300px 1fr;gap:16px;margin-top:16px;margin-bottom:16px}
      .rvm-pcstat{background:#F2F4F6;border-radius:14px;padding:16px}
      .rvm-pcstat .l{font-size:11px;color:#8B95A1}
      .rvm-pcstat .v{font-size:22px;font-weight:700;margin-top:6px;letter-spacing:-0.8px}
      .rvm-pcstat .s{font-size:11px;margin-top:4px;color:#8B95A1}
      .rvm-pcstat.hi{background:#F7EFF0}
      .rvm-pcstat.hi .l,.rvm-pcstat.hi .v{color:#BC6675}
      .rvm-pcstat.predict{background:#fff;border:1px solid #E5E8EB}
      .rvm-pcstat.predict .v{color:#BC6675}
      .rvm-cd{background:#fff;border:1px solid #E5E8EB;border-radius:14px;padding:16px}
      .rvm-sl{font-size:12px;font-weight:600;color:#8B95A1;margin:20px 0 8px;letter-spacing:-0.2px}
      .rvm-sl:first-child{margin-top:0}
      .rvm-barrow{display:flex;align-items:center;gap:8px;padding:7px 0}
      .rvm-blabel{font-size:12px;width:50px;text-align:right;color:#8B95A1;flex-shrink:0}
      .rvm-btrack{flex:1;height:18px;background:#F2F4F6;border-radius:4px;overflow:hidden}
      .rvm-bfill{height:100%;border-radius:4px}
      .rvm-bval{font-size:12px;font-weight:600;width:54px;flex-shrink:0;text-align:right;letter-spacing:-0.3px}
      .rvm-dayrow{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #E5E8EB}
      .rvm-dayrow:last-child{border-bottom:none}
      .rvm-dd{font-size:12px;color:#8B95A1;width:92px;flex-shrink:0}
      .rvm-db{flex:1;height:8px;background:#F2F4F6;border-radius:4px;overflow:hidden;position:relative}
      .rvm-df{height:100%;border-radius:4px}
      .rvm-df.over{background:#0F6E56}
      .rvm-df.under{background:#BC6675}
      .rvm-dgoal{position:absolute;top:-2px;bottom:-2px;width:2px;background:#191F28;border-radius:1px;opacity:0.3}
      .rvm-damt{font-size:13px;font-weight:600;width:100px;text-align:right;flex-shrink:0;letter-spacing:-0.3px}
      .rvm-damt.over{color:#0F6E56}
      .rvm-damt.under{color:#BC6675}
      .rvm-dcnt{font-size:11px;color:#8B95A1;width:36px;flex-shrink:0;text-align:right}
      .rvm-mbody{padding:14px}
      .rvm-mcard{background:#fff;border-radius:14px;border:1px solid #E5E8EB;padding:16px;margin-bottom:10px}
      .rvm-mpad{padding:12px 14px}
      .rvm-mmain{background:#F7EFF0;border:none;padding:18px}
      .rvm-mmain .ml{font-size:11px;color:#BC6675;letter-spacing:-0.2px}
      .rvm-mmain .mv{font-size:24px;font-weight:700;color:#BC6675;letter-spacing:-1.2px;line-height:1;margin-top:4px}
      .rvm-mmain .ms{font-size:11px;color:#4E5968;margin-top:4px}
      .rvm-mg3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:#E5E8EB;border-radius:8px;overflow:hidden;margin-top:12px}
      .rvm-mg3 .c{background:#fff;padding:10px}
      .rvm-mg3 .c .l{font-size:9px;color:#8B95A1}
      .rvm-mg3 .c .v{font-size:14px;font-weight:600;margin-top:2px;letter-spacing:-0.3px}
      .rvm-mli{display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #E5E8EB}
      .rvm-mli:last-child{border-bottom:none}
      .rvm-mdot{width:7px;height:7px;border-radius:50%;flex-shrink:0;background:#0F6E56}
      .rvm-mdot.man{background:#8B95A1}
      .rvm-minf{flex:1;min-width:0}
      .rvm-mln{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .rvm-mlsub{font-size:11px;color:#8B95A1;margin-top:2px}
      .rvm-mlamt{font-size:14px;font-weight:600;flex-shrink:0;letter-spacing:-0.3px}
    `;
    document.head.appendChild(s);
  }


  // ── PC 렌더 (mockup-v6 2컬럼) ─────────────────────────
  // [2026-06-05] 칩 캘린더 마운트 — 예약 월그리드 재사용(app-revenue-calendar.js)
  function _mountCalendar(container, items) {
    const grid = container.querySelector('[data-rvcal-grid]');
    const detail = container.querySelector('[data-rvcal-detail]');
    if (grid && window.RevenueCalendar) {
      window.RevenueCalendar.renderInto(grid, detail, {
        items: Array.isArray(items) ? items : [],
        year: _viewYear, month: _viewMonth,
      });
    }
  }

  function renderPC(container, summary, items) {
    _ensureStyles();
    const R = _R();
    const isCur = _isCurrentMonth();
    const isPast = !!summary.is_past || !isCur;
    // [2026-05-20] 두 개념 분리:
    //   · 남은 예약 완료 시 = pending_bookings_total (future confirmed 예약 amount 합)
    //   · 이번달 예상 매출 = projected_total (현재 페이스로 월말 외삽)
    // [2026-06-14 QA] 예약금 넣은 확정 예약 = 확정매출. 완료 매출과 별도로 보여줌.
    const depositRow = (Number(summary.confirmed_deposit_total) > 0)
      ? `<div class="rvm5-ai"><span class="badge">확정매출</span><span class="txt">예약금 <b>${formatMoney(summary.confirmed_deposit_total)}</b></span></div>`
      : '';
    const pendingRow = (!isPast && Number(summary.pending_bookings_total) > 0)
      ? `<div class="rvm5-ai"><span class="badge">남은 예약</span><span class="txt">모두 완료 시 <b>+${formatEstimate(summary.pending_bookings_total)}</b></span></div>`
      : '';
    const aiRow = (!isPast && summary.projected_total)
      ? `<div class="rvm5-ai"><span class="badge">예상</span><span class="txt">이번달 예상 매출 <b>${formatEstimate(summary.projected_total)}</b></span></div>`
      : '';
    const pastBadge = isPast ? `<span class="rvm5-past-badge">지난달</span>` : '';

    container.innerHTML = (R._renderPCHeaderHTML ? R._renderPCHeaderHTML('month') : '') + `
      <div class="rvm5-body">
        <div class="rvm5-mnav">
          <button type="button" class="arrow" data-rvm-act="prev-month" aria-label="이전달">‹</button>
          <div class="label">${_esc(_monthLabel())}${pastBadge}</div>
          <button type="button" class="arrow" data-rvm-act="next-month" aria-label="다음달"${isCur ? ' disabled' : ''}>›</button>
          <button type="button" class="rvm5-today" data-rvm-act="this-month"${isCur ? ' disabled' : ''}>오늘</button>
        </div>

        <div class="rvm5-top2">
          <div class="rvm5-left">
            <div class="rvm5-hero">
              <span class="amt">${formatMoney(summary.total)}</span>
              <span class="cnt">${summary.count}건 완료</span>
            </div>
            <!-- PROFIT_HIDDEN
            <div class="rvm5-stats">
              <div class="rvm5-stat"><div class="l">순수익</div><div class="v">${"$"}{formatMoney(summary.net_profit)}</div></div>
              <div class="rvm5-stat"><div class="l">재료비</div><div class="v">${"$"}{formatMoney(summary.material_cost_total || 0)}</div></div>
            </div>
            -->
          </div>
          <div class="rvm5-right">
            ${depositRow}
            ${pendingRow}
            ${aiRow}
          </div>
        </div>

        <div class="rvm5-card">
          <div class="rvm5-card-t">날짜별 매출</div>
          <div class="rvcal-wrap" data-rvcal-wrap>
            <div class="rvcal-grid" data-rvcal-grid></div>
            <div class="rvcal-detail is-empty" data-rvcal-detail></div>
          </div>
        </div>
      </div>`;
    _bindEvents(container);
    _mountCalendar(container, items);
    _afterRenderAnim(container, summary, false);
  }

  // ── 모바일 렌더 ─────────────────────────────────────────
  function renderMobile(container, summary, items) {
    _ensureStyles();
    const isCur = _isCurrentMonth();
    const isPast = !!summary.is_past || !isCur;

    // [v4] 월 네비를 셸 헤더(#rvHeaderMonth)로 올린다.
    //   월 상태(_viewYear/_viewMonth)는 이 모듈이 들고 있어서 셸(app-revenue.js)이 직접 못 그린다.
    //   예약관리 #bk-toolbar-mount 와 같은 마운트 패턴. PC(renderPC)는 마운트가 없어 무영향.
    //   innerHTML 로 매번 갈아끼우니 _bindEvents 를 다시 걸어도 리스너가 중복되지 않는다.
    const headerMount = document.getElementById('rvHeaderMonth');
    if (headerMount) {
      headerMount.innerHTML = `
        <button type="button" class="ar" data-rvm-act="prev-month" aria-label="이전달">‹</button>
        <span class="ml">${_esc(_monthLabel())}</span>
        <button type="button" class="ar" data-rvm-act="next-month" aria-label="다음달"${isCur ? ' disabled' : ''}>›</button>
        <button type="button" class="tdy" data-rvm-act="this-month"${isCur ? ' disabled' : ''}>오늘</button>`;
      _bindEvents(headerMount);
    }

    // [v4] 지난달 대비 — 서버가 이미 주는 prev_same_period.total 기준. 추가 API 호출 없음.
    //   [주의] summary.total 은 확정 예약금이 더해진 값(booking-revenue-overlay._depositPatch)이고
    //   prev_same_period.total 은 서버 원본이라 예약금이 없다. 지난달 확정 예약은 이미 완료돼
    //   RevenueRecord 가 됐거나 취소됐으므로 이 비교가 맞다 — mergeBrief._mergeMomDelta 와 같은 기준.
    //   prev<=0 이면 -100%/∞ 가 뜨므로 줄 자체를 숨긴다.
    const prevTotal = Number(summary && summary.prev_same_period && summary.prev_same_period.total) || 0;
    let momHTML = '';
    if (prevTotal > 0) {
      const pct = Math.round((Number(summary.total) - prevTotal) / prevTotal * 1000) / 10;
      const cls = pct >= 0 ? 'up' : 'dn';
      const base = isCur ? '지난달 같은 기간보다' : '전달보다';
      momHTML = ` · ${base} <b class="${cls}">${pct >= 0 ? '+' : ''}${pct}%</b>`;
    }

    // [v4] 확정 예약금 줄 삭제 — 예약금은 위 히어로 total 에 이미 더해져 있다(_depositPatch).
    //   따로 한 줄 더 보여주면 같은 돈이 화면에 두 번 나온다.
    const pendingCnt = Number(summary.pending_booking_count) || 0;
    const pendingRow = (!isPast && Number(summary.pending_bookings_total) > 0)
      ? `<div class="rvm5-mrow"><span class="l">아직 안 받은 돈</span>${pendingCnt ? `<span class="c">예약 ${pendingCnt}건</span>` : ''}<span class="v">${formatEstimate(summary.pending_bookings_total)}</span></div>`
      : '';
    const aiRow = (!isPast && Number(summary.projected_total) > 0)
      ? `<div class="rvm5-mrow ghost"><span class="l">이번달 예상 매출</span><span class="v">${formatEstimate(summary.projected_total)}</span></div>`
      : '';
    const listHTML = (pendingRow || aiRow) ? `<div class="rvm5-mlist">${pendingRow}${aiRow}</div>` : '';
    const heroLabel = isPast ? `${_viewMonth}월 매출` : '이번달 매출';

    container.innerHTML = `
      <div class="rvm5-mbody">
        <div class="rvm5-mhero">
          <span class="l">${_esc(heroLabel)}</span>
          <span class="amt">${formatMoney(summary.total)}</span>
          <div class="note">${summary.count}건 완료${momHTML}</div>
        </div>
        ${listHTML}
        <div class="rvm5-mc">
          <div class="t"><b>날짜별 매출</b><span>날짜를 누르면 상세</span></div>
          <div class="rvcal-wrap" data-rvcal-wrap>
            <div class="rvcal-grid" data-rvcal-grid></div>
            <div class="rvcal-detail is-empty" data-rvcal-detail></div>
          </div>
        </div>
      </div>`;
    _bindEvents(container);
    _mountCalendar(container, items);
    _afterRenderAnim(container, summary, true);
  }

  // 카운트업 — render 후 호출
  function _afterRenderAnim(container, summary, isMobile) {
    if (isMobile) {
      const heroAmt = container.querySelector('.rvm5-mhero .amt');
      if (heroAmt) _countUp(heroAmt, summary.total, 800);
      /* PROFIT_HIDDEN
      const subVals = container.querySelectorAll('.rvm5-mhero-sub .v');
      if (subVals[0]) _countUp(subVals[0], summary.net_profit, 900);
      if (subVals[1] && summary.material_cost_total > 0) _countUp(subVals[1], summary.material_cost_total, 600);
      */
    } else {
      const heroAmt = container.querySelector('.rvm5-hero .amt');
      if (heroAmt) _countUp(heroAmt, summary.total, 800);
      /* PROFIT_HIDDEN
      const statVals = container.querySelectorAll('.rvm5-stat .v');
      if (statVals[0]) _countUp(statVals[0], summary.net_profit, 900);
      if (statVals[1] && summary.material_cost_total > 0) _countUp(statVals[1], summary.material_cost_total, 600);
      */
    }
  }

  // ── 이벤트 ──────────────────────────────────────────────
  function _bindEvents(container) {
    container.querySelectorAll('[data-rvm-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.rvmAct;
        if (act === 'accept-goal') {
          const amt = parseInt(btn.dataset.amount, 10);
          if (amt > 0) {
            writeGoal(amt);
            if (window.showToast) window.showToast(`일일 목표 ${formatMoney(amt)} 설정됨`);
            _triggerRerender();
          }
        } else if (act === 'edit-goal') {
          const cur = readGoal();
          const def = cur?.amount ? String(cur.amount) : '';
          // [v201] "20만원" / "200,000원" / "200000" 모두 허용. 숫자만 추출.
          window._inlinePrompt('일일 목표 매출액 (원, 숫자만)\n예: 200000 = 20만원\n0 또는 빈값 = 목표 해제', def, (v) => {
            const cleaned = String(v).replace(/[^0-9]/g, '');
            const n = parseInt(cleaned, 10);
            if (!n || n <= 0) { clearGoal(); if (window.showToast) window.showToast('일일 목표 해제됨'); }
            else { writeGoal(n); if (window.showToast) window.showToast(`일일 목표 ${formatMoney(n)} 설정됨`); }
            _triggerRerender();
          });
          return;
        } else if (act === 'prev-month') {
          _goPrevMonth();
          _triggerRerender();
        } else if (act === 'next-month') {
          if (!_isCurrentMonth()) {
            _goNextMonth();
            _triggerRerender();
          }
        } else if (act === 'this-month') {
          if (!_isCurrentMonth()) { _goThisMonth(); _triggerRerender(); }
        }
      });
    });
    // 더보기 토글
    container.querySelectorAll('[data-rvm-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.rvmToggle);
        if (!target) return;
        const isHidden = target.classList.contains('rvm5-hidden');
        if (isHidden) {
          target.classList.remove('rvm5-hidden');
          btn.innerHTML = `접기 ▴`;
        } else {
          target.classList.add('rvm5-hidden');
          const n = btn.dataset.rvmTotal;
          const u = btn.dataset.rvmUnit || '건';
          btn.innerHTML = `나머지 ${n}${u} 더보기 ▾`;
        }
      });
    });
  }
  function _triggerRerender() {
    const fn = _R()._rerender;
    if (typeof fn === 'function') { try { fn(); } catch (_e) { /* silent */ } }
  }

  function getView() { return { year: _viewYear, month: _viewMonth, isCurrent: _isCurrentMonth() }; }
  function getViewItems() { return _viewItems; }

  window.RevenueMonth = {
    fetchSummary, fallbackSummary,
    renderPC, renderMobile,
    readGoal, writeGoal, clearGoal,
    _ensureStyles,
    getView, getViewItems,
  };
})();
