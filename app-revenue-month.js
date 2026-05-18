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

  function _R() { return window.Revenue || {}; }

  // ── 데이터 ──────────────────────────────────────────────
  async function fetchSummary() {
    if (!window.API || !window.authHeader) throw new Error('no-auth');
    const auth = window.authHeader();
    if (!auth?.Authorization) throw new Error('no-token');
    const isCur = _isCurrentMonth();
    let url = window.API + '/revenue/summary?period=month';
    if (!isCur) url += '&year=' + _viewYear + '&month=' + _viewMonth;
    const res = await fetch(url, { headers: { ...auth, 'Content-Type': 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const summary = await res.json();
    // 과거 월: items 도 별도 fetch → _viewItems 캐시
    if (!isCur) {
      try {
        const r2 = await fetch(
          window.API + '/revenue?period=month&year=' + _viewYear + '&month=' + _viewMonth,
          { headers: { ...auth, 'Content-Type': 'application/json' } }
        );
        if (r2.ok) {
          const d = await r2.json();
          _viewItems = Array.isArray(d.items) ? d.items : [];
        } else { _viewItems = []; }
      } catch (_e) { _viewItems = []; }
    } else {
      _viewItems = null;
    }
    return summary;
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

    return {
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
  function recommendedGoal(summary) {
    const prev = +summary.prev_full_month || 0;
    if (!prev) return 0;
    return Math.max(1000, Math.round(prev / 22 / 1000) * 1000);
  }

  // ── 헬퍼 ───────────────────────────────────────────────
  const _esc = (s) => (_R()._esc ? _R()._esc(s) : String(s == null ? '' : s));
  const _krw = (n) => (((+n) || 0)).toLocaleString('ko-KR') + '원';
  function _dayLabel(s, today) {
    const t = new Date(s);
    const dn = ['일', '월', '화', '수', '목', '금', '토'][t.getDay()];
    const same = today && t.toDateString() === today.toDateString();
    return same ? `${t.getMonth() + 1}/${t.getDate()} 오늘` : `${t.getMonth() + 1}/${t.getDate()} (${dn})`;
  }
  const TAG_LABEL = { card: '카드', cash: '현금', transfer: '계좌', bank_transfer: '계좌', membership: '회원권', etc: '기타' };
  const METHOD_COLOR = { card: '#F18091', cash: '#8B95A1', transfer: '#4A90D9', bank_transfer: '#4A90D9', membership: '#F8C4CC', etc: '#E5E8EB' };

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
      .rvm5-past-badge{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;background:#F7F8FA;font-size:11px;font-weight:600;color:#6B7684;margin-left:6px}

      /* PC 2컬럼 상단 */
      .rvm5-top2{display:flex;gap:20px;margin-bottom:18px}
      .rvm5-left{flex:0 0 360px;min-width:0}
      .rvm5-right{flex:1;min-width:0;display:flex;flex-direction:column;gap:10px}
      @media (max-width: 820px){.rvm5-top2{flex-direction:column}.rvm5-left{flex:1 1 auto}}

      .rvm5-hero{background:#FFF1F3;border-radius:14px;padding:22px 24px;margin-bottom:12px;display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
      .rvm5-hero .amt{font-size:32px;font-weight:800;color:#E5586E;letter-spacing:-1.5px;line-height:1}
      .rvm5-hero .cnt{font-size:13px;font-weight:600;color:#E5586E;opacity:0.65}

      .rvm5-ai{display:flex;align-items:center;gap:10px;padding:12px 16px;background:#F7F8FA;border-radius:8px}
      .rvm5-ai .badge{padding:3px 8px;border-radius:6px;background:#E5586E;color:#fff;font-size:9px;font-weight:800;flex-shrink:0;letter-spacing:0.3px}
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

      .rvm5-gb{display:flex;align-items:center;gap:8px;padding:9px 14px;border-radius:8px;margin-bottom:12px;background:#FFF1F3}
      .rvm5-gb .t{font-size:12px;font-weight:600;color:#E5586E;flex:1;letter-spacing:-0.2px}
      .rvm5-gb .btn{padding:5px 12px;border-radius:999px;font-size:10px;font-weight:600;border:1px solid #E5E8EB;background:#fff;color:#E5586E;cursor:pointer}
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

      /* ── 모바일 v6 ── */
      .rvm5-mbody{padding:14px}
      .rvm5-mmnav{display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:12px}
      .rvm5-mmnav .ar{width:28px;height:28px;border-radius:50%;border:1px solid #E5E8EB;display:flex;align-items:center;justify-content:center;font-size:12px;color:#191F28;background:#fff;cursor:pointer;padding:0;line-height:1}
      .rvm5-mmnav .ar:disabled{opacity:0.25;cursor:not-allowed;pointer-events:none}
      .rvm5-mmnav .ml{font-size:14px;font-weight:700;letter-spacing:-0.3px}

      .rvm5-mhero{background:#FFF1F3;border-radius:14px;padding:16px;margin-bottom:8px}
      .rvm5-mhero-top{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
      .rvm5-mhero-top .amt{font-size:26px;font-weight:800;color:#E5586E;letter-spacing:-1.2px;line-height:1}
      .rvm5-mhero-top .cnt{font-size:12px;font-weight:600;color:#E5586E;opacity:0.65}
      .rvm5-mhero-sub{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#E5E8EB;border-radius:8px;overflow:hidden;margin-top:12px}
      .rvm5-mhero-sub .c{background:#fff;padding:10px}
      .rvm5-mhero-sub .l{font-size:9px;color:#191F28;font-weight:600}
      .rvm5-mhero-sub .v{font-size:14px;font-weight:700;margin-top:2px;letter-spacing:-0.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

      .rvm5-mai{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#fff;border:1px solid #E5E8EB;border-radius:14px;margin-bottom:8px}
      .rvm5-mai .badge{padding:2px 7px;border-radius:5px;background:#E5586E;color:#fff;font-size:8px;font-weight:800;flex-shrink:0}
      .rvm5-mai .txt{font-size:12px;color:#191F28}
      .rvm5-mai .txt b{font-weight:700}

      .rvm5-mc{background:#fff;border:1px solid #E5E8EB;border-radius:14px;padding:14px;margin-bottom:8px}
      .rvm5-mc .t{font-size:11px;font-weight:600;color:#191F28;margin-bottom:8px}

      .rvm5-mbr{display:flex;align-items:center;gap:5px;padding:4px 0}
      .rvm5-mbr .lb{font-size:11px;width:30px;text-align:right;color:#191F28;flex-shrink:0}
      .rvm5-mbr .tk{flex:1;height:12px;background:#F7F8FA;border-radius:3px;overflow:hidden}
      .rvm5-mbr .fl{height:100%;border-radius:3px;transition:width .6s cubic-bezier(.2,.7,.2,1)}
      .rvm5-mbr .pc{font-size:11px;font-weight:600;width:28px;text-align:right;color:#191F28;flex-shrink:0}

      .rvm5-md{display:flex;align-items:center;gap:5px;padding:6px 0;border-bottom:1px solid #F7F8FA}
      .rvm5-md:last-child{border:none}
      .rvm5-md .d{font-size:11px;color:#191F28;width:62px;flex-shrink:0;font-weight:500}
      .rvm5-md .bar{flex:1;height:6px;background:#F7F8FA;border-radius:2px;overflow:hidden;position:relative;min-width:40px}
      .rvm5-md .f{height:100%;border-radius:2px}
      .rvm5-md .gl{position:absolute;top:-1px;bottom:-1px;width:1.5px;background:#191F28;opacity:0.18;border-radius:1px}
      .rvm5-md .a{font-size:12px;font-weight:600;width:78px;text-align:right;letter-spacing:-0.3px;flex-shrink:0}
      .rvm5-md .a.over{color:#0F6E56}
      .rvm5-md .a.under{color:#4E5968}
      .rvm5-md .c{font-size:10px;color:#6B7684;width:24px;text-align:right;flex-shrink:0}

      .rvm5-mli{display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid #F7F8FA;cursor:pointer}
      .rvm5-mli:last-child{border:none}
      .rvm5-mli .dt{font-size:11px;color:#6B7684;width:30px;flex-shrink:0}
      .rvm5-mli .nm{font-size:12px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .rvm5-mli .am{font-size:13px;font-weight:700;letter-spacing:-0.2px;flex-shrink:0}
      .rvm5-mli .ch{font-size:12px;color:#C5CBD2;margin-left:1px;flex-shrink:0}

      .rvm5-mgb{display:flex;align-items:center;gap:6px;padding:7px 10px;border-radius:8px;margin-bottom:8px;background:#FFF1F3}
      .rvm5-mgb .t{font-size:11px;font-weight:600;color:#E5586E;flex:1}
      .rvm5-mgb .btn{padding:3px 10px;border-radius:999px;font-size:9px;font-weight:600;border:1px solid #E5E8EB;background:#fff;color:#E5586E;cursor:pointer}

      /* ═════ today/week 호환 — 옛 v4 톤 ═════ */
      .rvm-body{padding:20px}
      .rvm-pcg4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:14px;margin-bottom:16px}
      .rvm-pcg2{display:grid;grid-template-columns:300px 1fr;gap:16px;margin-top:16px;margin-bottom:16px}
      .rvm-pcstat{background:#F2F4F6;border-radius:14px;padding:16px}
      .rvm-pcstat .l{font-size:11px;color:#8B95A1}
      .rvm-pcstat .v{font-size:22px;font-weight:700;margin-top:6px;letter-spacing:-0.8px}
      .rvm-pcstat .s{font-size:11px;margin-top:4px;color:#8B95A1}
      .rvm-pcstat.hi{background:#FFF1F3}
      .rvm-pcstat.hi .l,.rvm-pcstat.hi .v{color:#E5586E}
      .rvm-pcstat.predict{background:#fff;border:1px solid #E5E8EB}
      .rvm-pcstat.predict .v{color:#E5586E}
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
      .rvm-df.under{background:#E5586E}
      .rvm-dgoal{position:absolute;top:-2px;bottom:-2px;width:2px;background:#191F28;border-radius:1px;opacity:0.3}
      .rvm-damt{font-size:13px;font-weight:600;width:100px;text-align:right;flex-shrink:0;letter-spacing:-0.3px}
      .rvm-damt.over{color:#0F6E56}
      .rvm-damt.under{color:#E5586E}
      .rvm-dcnt{font-size:11px;color:#8B95A1;width:36px;flex-shrink:0;text-align:right}
      .rvm-mbody{padding:14px}
      .rvm-mcard{background:#fff;border-radius:14px;border:1px solid #E5E8EB;padding:16px;margin-bottom:10px}
      .rvm-mpad{padding:12px 14px}
      .rvm-mmain{background:#FFF1F3;border:none;padding:18px}
      .rvm-mmain .ml{font-size:11px;color:#E5586E;letter-spacing:-0.2px}
      .rvm-mmain .mv{font-size:24px;font-weight:700;color:#E5586E;letter-spacing:-1.2px;line-height:1;margin-top:4px}
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
      .rvm-mlsub{font-size:10px;color:#8B95A1;margin-top:2px}
      .rvm-mlamt{font-size:14px;font-weight:600;flex-shrink:0;letter-spacing:-0.3px}
    `;
    document.head.appendChild(s);
  }

  // ── 결제수단 분포 ──────────────────────────────────────
  function _renderPaymentBarsV5(by_method, total, isMobile) {
    const order = ['card', 'cash', 'transfer', 'bank_transfer', 'membership', 'etc'];
    const rows = order
      .filter(k => by_method && by_method[k])
      .map(k => ({ k, label: TAG_LABEL[k] || k, total: by_method[k] || 0 }))
      .filter(x => x.total > 0)
      .sort((a, b) => b.total - a.total);
    const cls = isMobile ? 'rvm5-mbr' : 'rvm5-br';
    if (!rows.length || !total) {
      return `<div style="font-size:11px;color:#8B95A1;padding:6px 0;">아직 데이터가 없어요</div>`;
    }
    return rows.map(r => {
      const pct = Math.round(r.total * 100 / total);
      const color = METHOD_COLOR[r.k] || '#E5E8EB';
      return `<div class="${cls}">
        <div class="lb">${_esc(r.label)}</div>
        <div class="tk"><div class="fl" style="width:${pct}%;background:${color};"></div></div>
        <div class="pc">${pct}%</div>
      </div>`;
    }).join('');
  }

  // ── 일별 매출 — LIMIT 7일 + 더보기 ───────────────────────
  function _renderDailyListV5(summary, goal, isMobile, uidPrefix) {
    const list = (summary.daily || []);
    if (!list.length) return `<div style="font-size:11px;color:#8B95A1;padding:6px 0;">아직 데이터가 없어요</div>`;
    const LIMIT = 7;
    const goalAmt = goal && goal.amount > 0 ? goal.amount : 0;
    const maxVal = Math.max(goalAmt * 1.4, ...list.map(d => d.total)) || 1;
    const today = new Date();
    const cls = isMobile ? 'rvm5-md' : 'rvm5-dr';

    const renderRow = (d) => {
      const ratio = Math.min(100, Math.round(d.total * 100 / maxVal));
      const over = goalAmt > 0 && d.total >= goalAmt;
      const fillColor = over ? '#0F6E56' : (d.total > 0 ? '#F18091' : 'transparent');
      const amtCls = goalAmt > 0 ? (over ? 'over' : 'under') : '';
      const goalPct = goalAmt && maxVal ? Math.round(goalAmt * 100 / maxVal) : 0;
      return `<div class="${cls}">
        <div class="d">${_esc(_dayLabel(d.date, today))}</div>
        <div class="bar">
          ${d.total > 0 ? `<div class="f" style="width:${ratio}%;background:${fillColor};"></div>` : ''}
          ${goalAmt ? `<div class="gl" style="left:${goalPct}%;"></div>` : ''}
        </div>
        <div class="a ${amtCls}">${_krw(d.total)}</div>
        <div class="c">${d.count}건</div>
      </div>`;
    };

    const visible = list.slice(0, LIMIT).map(renderRow).join('');
    const hidden = list.slice(LIMIT);
    if (!hidden.length) return visible;
    const uid = (uidPrefix || 'rvm-daily') + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const hiddenRows = hidden.map(renderRow).join('');
    return visible
      + `<div id="${uid}" class="rvm5-hidden">${hiddenRows}</div>`
      + `<button type="button" class="rvm5-more" data-rvm-toggle="${uid}" data-rvm-total="${hidden.length}" data-rvm-unit="일">나머지 ${hidden.length}일 더보기 ▾</button>`;
  }

  function _renderGoalBannerV5(summary, goal, isMobile, isPast) {
    const cls = isMobile ? 'rvm5-mgb' : 'rvm5-gb';
    if (isPast) return '';  // 과거 월: 목표 설정/수정 의미 X
    if (goal && goal.amount > 0) {
      const list = summary.daily || [];
      const days = list.filter(d => d.total > 0).length;
      const hit = list.filter(d => d.total >= goal.amount).length;
      const rate = days ? Math.round(hit * 100 / days) : 0;
      const rec = recommendedGoal(summary);
      // [v200] 수동 목표 있어도 AI 추천 링크 노출 — 사용자가 AI 추천 값으로 되돌릴 수 있게.
      const aiHint = (rec && rec !== goal.amount)
        ? `<button type="button" class="btn-link" data-rvm-act="accept-goal" data-amount="${rec}" style="background:none;border:none;color:#6B7684;text-decoration:underline;font-size:12px;cursor:pointer;padding:0;margin-top:4px;">AI 추천 ${_krw(rec)} 으로 변경</button>`
        : '';
      return `<div class="${cls}">
        <div class="t">목표 ${_krw(goal.amount)}/일 · 달성 ${rate}%${aiHint ? '<br>' + aiHint : ''}</div>
        <button type="button" class="btn" data-rvm-act="edit-goal">수정</button>
      </div>`;
    }
    const rec = recommendedGoal(summary);
    if (!rec) {
      return `<div class="${cls}">
        <div class="t">일일 목표를 설정해보세요</div>
        <button type="button" class="btn" data-rvm-act="edit-goal">설정</button>
      </div>`;
    }
    return `<div class="${cls}">
      <div class="t">저번달 일평균 ${_krw(rec)} 기반 추천</div>
      <button type="button" class="btn" data-rvm-act="accept-goal" data-amount="${rec}">설정</button>
    </div>`;
  }

  // ── 매출 내역 — LIMIT 5 + 더보기 ───────────────────────
  function _renderTransactionListV5(items, isMobile, uidPrefix) {
    const sorted = [...items].sort((a, b) => new Date(b.recorded_at || b.created_at) - new Date(a.recorded_at || a.created_at));
    if (!sorted.length) return `<div class="rvm5-empty">아직 매출 내역이 없어요</div>`;
    const LIMIT = 5;
    const liCls = isMobile ? 'rvm5-mli' : 'rvm5-li';
    const renderRow = (r) => {
      const t = new Date(r.recorded_at || r.created_at);
      const date = (t.getMonth() + 1) + '/' + t.getDate();
      const who = r.customer_name ? _esc(r.customer_name) : '제품 판매';
      const svc = r.service_name ? ` · ${_esc(r.service_name)}` : '';
      return `<div class="${liCls}">
        <div class="dt">${_esc(date)}</div>
        <div class="nm">${who}${svc}</div>
        <div class="am">${_krw(r.amount)}</div>
        <span class="ch">›</span>
      </div>`;
    };
    const visible = sorted.slice(0, LIMIT).map(renderRow).join('');
    const hidden = sorted.slice(LIMIT);
    if (!hidden.length) return visible;
    const uid = (uidPrefix || 'rvm-tx') + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const hiddenRows = hidden.map(renderRow).join('');
    return visible
      + `<div id="${uid}" class="rvm5-hidden">${hiddenRows}</div>`
      + `<button type="button" class="rvm5-more" data-rvm-toggle="${uid}" data-rvm-total="${hidden.length}" data-rvm-unit="건">나머지 ${hidden.length}건 더보기 ▾</button>`;
  }

  // ── PC 렌더 (mockup-v6 2컬럼) ─────────────────────────
  function renderPC(container, summary, items) {
    _ensureStyles();
    const R = _R();
    const goal = readGoal();
    const isCur = _isCurrentMonth();
    const isPast = !!summary.is_past || !isCur;
    // [v200] "이번달 예상" → "남은 예약 완료 시" 로 라벨 변경. 사용자 의도 명확화.
    const aiRow = (!isPast && summary.projected_total)
      ? `<div class="rvm5-ai"><span class="badge">예상</span><span class="txt">남은 예약 완료 시 <b>${_krw(summary.projected_total)}</b></span></div>`
      : '';
    const pastBadge = isPast ? `<span class="rvm5-past-badge">지난달</span>` : '';

    container.innerHTML = (R._renderPCHeaderHTML ? R._renderPCHeaderHTML('month') : '') + `
      <div class="rvm5-body">
        <div class="rvm5-mnav">
          <button type="button" class="arrow" data-rvm-act="prev-month" aria-label="이전달">‹</button>
          <div class="label">${_esc(_monthLabel())}${pastBadge}</div>
          <button type="button" class="arrow" data-rvm-act="next-month" aria-label="다음달"${isCur ? ' disabled' : ''}>›</button>
        </div>

        <div class="rvm5-top2">
          <div class="rvm5-left">
            <div class="rvm5-hero">
              <span class="amt">${_krw(summary.total)}</span>
              <span class="cnt">${summary.count}건 완료</span>
            </div>
            <!-- PROFIT_HIDDEN
            <div class="rvm5-stats">
              <div class="rvm5-stat"><div class="l">순수익</div><div class="v">${"$"}{_krw(summary.net_profit)}</div></div>
              <div class="rvm5-stat"><div class="l">재료비</div><div class="v">${"$"}{_krw(summary.material_cost_total || 0)}</div></div>
            </div>
            -->
          </div>
          <div class="rvm5-right">
            <div class="rvm5-card">
              <div class="rvm5-card-t">결제수단</div>
              ${_renderPaymentBarsV5(summary.by_method, summary.total, false)}
            </div>
            ${aiRow}
          </div>
        </div>

        <div class="rvm5-card" style="margin-bottom:16px">
          <div class="rvm5-card-t">일별 매출</div>
          ${_renderGoalBannerV5(summary, goal, false, isPast)}
          ${_renderDailyListV5(summary, goal, false, 'rvm-daily-pc')}
        </div>

        <div class="rvm5-card">
          <div class="rvm5-card-t">매출 내역</div>
          ${_renderTransactionListV5(items, false, 'rvm-tx-pc')}
        </div>
      </div>`;
    _bindEvents(container);
    _afterRenderAnim(container, summary, false);
  }

  // ── 모바일 렌더 ─────────────────────────────────────────
  function renderMobile(container, summary, items) {
    _ensureStyles();
    const goal = readGoal();
    const isCur = _isCurrentMonth();
    const isPast = !!summary.is_past || !isCur;
    const aiRow = (!isPast && summary.projected_total)
      ? `<div class="rvm5-mai"><span class="badge">예상</span><span class="txt">남은 예약 완료 시 <b>${_krw(summary.projected_total)}</b></span></div>`
      : '';
    const pastBadge = isPast ? `<span class="rvm5-past-badge">지난달</span>` : '';

    container.innerHTML = `
      <div class="rvm5-mbody">
        <div class="rvm5-mmnav">
          <button type="button" class="ar" data-rvm-act="prev-month" aria-label="이전달">‹</button>
          <div class="ml">${_esc(_monthLabel())}${pastBadge}</div>
          <button type="button" class="ar" data-rvm-act="next-month" aria-label="다음달"${isCur ? ' disabled' : ''}>›</button>
        </div>
        <div class="rvm5-mhero">
          <div class="rvm5-mhero-top">
            <span class="amt">${_krw(summary.total)}</span>
            <span class="cnt">${summary.count}건 완료</span>
          </div>
          <!-- PROFIT_HIDDEN
          <div class="rvm5-mhero-sub">
            <div class="c"><div class="l">순수익</div><div class="v">${"$"}{_krw(summary.net_profit)}</div></div>
            <div class="c"><div class="l">재료비</div><div class="v">${"$"}{_krw(summary.material_cost_total || 0)}</div></div>
          </div>
          -->
        </div>
        ${aiRow}
        <div class="rvm5-mc">
          <div class="t">결제수단</div>
          ${_renderPaymentBarsV5(summary.by_method, summary.total, true)}
        </div>
        <div class="rvm5-mc">
          <div class="t">일별 매출</div>
          ${_renderGoalBannerV5(summary, goal, true, isPast)}
          ${_renderDailyListV5(summary, goal, true, 'rvm-daily-m')}
        </div>
        <div class="rvm5-mc">
          <div class="t">매출 내역</div>
          ${_renderTransactionListV5(items, true, 'rvm-tx-m')}
        </div>
      </div>`;
    _bindEvents(container);
    _afterRenderAnim(container, summary, true);
  }

  // 카운트업 — render 후 호출
  function _afterRenderAnim(container, summary, isMobile) {
    if (isMobile) {
      const heroAmt = container.querySelector('.rvm5-mhero-top .amt');
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
            if (window.showToast) window.showToast(`일일 목표 ${_krw(amt)} 설정됨`);
            _triggerRerender();
          }
        } else if (act === 'edit-goal') {
          const cur = readGoal();
          const def = cur?.amount ? String(cur.amount) : '';
          const v = prompt('일일 목표 매출액 (원). 0 또는 빈값 = 목표 해제', def);
          if (v === null) return;
          const n = parseInt(v, 10);
          if (!n || n <= 0) { clearGoal(); if (window.showToast) window.showToast('일일 목표 해제됨'); }
          else { writeGoal(n); if (window.showToast) window.showToast(`일일 목표 ${_krw(n)} 설정됨`); }
          _triggerRerender();
        } else if (act === 'prev-month') {
          _goPrevMonth();
          _triggerRerender();
        } else if (act === 'next-month') {
          if (!_isCurrentMonth()) {
            _goNextMonth();
            _triggerRerender();
          }
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
