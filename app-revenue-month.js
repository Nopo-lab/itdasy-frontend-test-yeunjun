/* ─────────────────────────────────────────────────────────────
   매출관리 — 이번달 뷰 (Step 5 · 2026-05-17, mockup-revenue-v5 기반)

   v5 핵심:
   - 히어로 한 줄 (금액 + 건수)
   - AI 예상 인라인 row
   - 순수익 / 재료비 2-stat row
   - 결제수단 (260px) + 일별 매출 (flex) 2컬럼
   - 일별 매출: 목표 배너 + bar + 목표선
   - 매출 내역: 간단한 li (날짜 · 이름 · 금액 · ›)
   - 월 네비게이션 (← 2026년 5월 →) — 시각만, 이전달 토스트

   외부 API: window.RevenueMonth = { fetchSummary, fallbackSummary, renderPC, renderMobile, _ensureStyles }
   의존: window.Revenue (내부 헬퍼)

   호환: today/week 가 사용하는 rvm-* (rvm-pcg4, rvm-pcstat, rvm-cd 등) 스타일도 함께 주입
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const GOAL_KEY = 'itdasy_daily_goal_v1';
  const STYLE_ID = 'rvmStyles';

  function _R() { return window.Revenue || {}; }

  // ── 데이터 ──────────────────────────────────────────────
  async function fetchSummary() {
    if (!window.API || !window.authHeader) throw new Error('no-auth');
    const auth = window.authHeader();
    if (!auth?.Authorization) throw new Error('no-token');
    const res = await fetch(window.API + '/revenue/summary?period=month', {
      headers: { ...auth, 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
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
      period: 'month',
      total, count, net_total,
      material_cost_total: 0,
      net_profit: net_total,
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
  const METHOD_COLOR = { card: '#E5586E', cash: '#F18091', transfer: '#F5A3B0', bank_transfer: '#F5A3B0', membership: '#F8C4CC', etc: '#E5E8EB' };

  // ── 스타일 주입 ──────────────────────────────────────────
  // rvm5-* (mockup v5 — 이번달 전용) + rvm-* (today/week 호환용, 옛 v4 톤)
  function _ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      /* ═════ mockup-v5 (이번달 메인) ═════ */
      .rvm5-body{padding:24px}
      .rvm5-mnav{display:flex;align-items:center;gap:14px;margin-bottom:20px}
      .rvm5-mnav .arrow{width:30px;height:30px;border-radius:50%;border:1px solid #E5E8EB;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:13px;color:#191F28;line-height:1;padding:0}
      .rvm5-mnav .arrow:hover:not(:disabled){background:#F2F4F6}
      .rvm5-mnav .arrow:disabled{opacity:0.3;cursor:not-allowed}
      .rvm5-mnav .label{font-size:15px;font-weight:700;color:#191F28;letter-spacing:-0.4px}

      .rvm5-hero{background:#FFF1F3;border-radius:14px;padding:22px 26px;margin-bottom:14px;display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
      .rvm5-hero .amt{font-size:32px;font-weight:800;color:#E5586E;letter-spacing:-1.5px;line-height:1}
      .rvm5-hero .cnt{font-size:13px;font-weight:600;color:#E5586E;opacity:0.7}

      .rvm5-ai{display:flex;align-items:center;gap:10px;padding:12px 16px;background:#F2F4F6;border-radius:8px;margin-bottom:14px}
      .rvm5-ai .badge{padding:3px 8px;border-radius:6px;background:#E5586E;color:#fff;font-size:9px;font-weight:800;flex-shrink:0;letter-spacing:0.3px}
      .rvm5-ai .txt{font-size:13px;color:#191F28}
      .rvm5-ai .txt b{font-weight:700;color:#191F28}

      .rvm5-stats{display:flex;gap:10px;margin-bottom:18px}
      .rvm5-stat{flex:1;padding:14px 16px;background:#F2F4F6;border-radius:8px}
      .rvm5-stat .l{font-size:10px;color:#191F28;margin-bottom:3px;opacity:0.7}
      .rvm5-stat .v{font-size:18px;font-weight:700;letter-spacing:-0.5px;color:#191F28}

      .rvm5-g2{display:grid;grid-template-columns:260px 1fr;gap:14px;margin-bottom:18px}
      @media (max-width: 720px){.rvm5-g2{grid-template-columns:1fr}}
      .rvm5-card{background:#fff;border:1px solid #E5E8EB;border-radius:14px;padding:16px}
      .rvm5-card-t{font-size:11px;font-weight:600;color:#191F28;margin-bottom:10px;letter-spacing:-0.2px}

      .rvm5-br{display:flex;align-items:center;gap:7px;padding:5px 0}
      .rvm5-br .lb{font-size:11px;width:36px;text-align:right;color:#191F28;flex-shrink:0}
      .rvm5-br .tk{flex:1;height:14px;background:#F2F4F6;border-radius:3px;overflow:hidden}
      .rvm5-br .fl{height:100%;border-radius:3px}
      .rvm5-br .pc{font-size:11px;font-weight:600;width:32px;text-align:right;color:#191F28;flex-shrink:0}

      .rvm5-dr{display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #F2F4F6}
      .rvm5-dr:last-child{border:none}
      .rvm5-dr .d{font-size:11px;color:#191F28;width:78px;flex-shrink:0;letter-spacing:-0.2px}
      .rvm5-dr .bar{flex:1;height:6px;background:#F2F4F6;border-radius:3px;overflow:hidden;position:relative;min-width:60px}
      .rvm5-dr .f{height:100%;border-radius:3px}
      .rvm5-dr .gl{position:absolute;top:-2px;bottom:-2px;width:1.5px;background:#191F28;border-radius:1px;opacity:0.18}
      .rvm5-dr .a{font-size:12px;font-weight:600;width:90px;text-align:right;letter-spacing:-0.3px;flex-shrink:0}
      .rvm5-dr .a.over{color:#0F6E56}
      .rvm5-dr .a.under{color:#4E5968}
      .rvm5-dr .c{font-size:10px;color:#191F28;width:28px;text-align:right;opacity:0.6;flex-shrink:0}

      .rvm5-gb{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;margin-bottom:8px;background:#FFF1F3}
      .rvm5-gb .t{font-size:11px;font-weight:600;color:#E5586E;flex:1;letter-spacing:-0.2px}
      .rvm5-gb .btn{padding:4px 12px;border-radius:999px;font-size:10px;font-weight:600;border:1px solid #E5E8EB;background:#fff;color:#E5586E;cursor:pointer}
      .rvm5-gb .btn:hover{background:#F7F8FA}

      .rvm5-sl{font-size:12px;font-weight:600;color:#191F28;margin:18px 0 8px;letter-spacing:-0.2px}
      .rvm5-list{border:1px solid #E5E8EB;border-radius:14px;overflow:hidden;background:#fff}
      .rvm5-li{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #E5E8EB;cursor:pointer}
      .rvm5-li:last-child{border:none}
      .rvm5-li:hover{background:#F7F8FA}
      .rvm5-li .dt{font-size:11px;color:#191F28;width:34px;opacity:0.6;flex-shrink:0}
      .rvm5-li .nm{font-size:13px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .rvm5-li .am{font-size:13px;font-weight:700;letter-spacing:-0.3px;flex-shrink:0}
      .rvm5-li .ch{font-size:13px;color:#C5CBD2;margin-left:2px;flex-shrink:0}
      .rvm5-empty{padding:24px;text-align:center;color:#8B95A1;font-size:13px;background:#fff;border:1px solid #E5E8EB;border-radius:14px}

      /* ── 모바일 v5 ── */
      .rvm5-mbody{padding:14px}
      .rvm5-mmnav{display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:12px}
      .rvm5-mmnav .ar{width:26px;height:26px;border-radius:50%;border:1px solid #E5E8EB;display:flex;align-items:center;justify-content:center;font-size:12px;color:#191F28;background:#fff;cursor:pointer;padding:0;line-height:1}
      .rvm5-mmnav .ar:disabled{opacity:0.3;cursor:not-allowed}
      .rvm5-mmnav .ml{font-size:14px;font-weight:700;letter-spacing:-0.3px}

      .rvm5-mhero{background:#FFF1F3;border-radius:14px;padding:16px;margin-bottom:8px}
      .rvm5-mhero-top{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
      .rvm5-mhero-top .amt{font-size:26px;font-weight:800;color:#E5586E;letter-spacing:-1.2px;line-height:1}
      .rvm5-mhero-top .cnt{font-size:12px;font-weight:600;color:#E5586E;opacity:0.7}
      .rvm5-mhero-sub{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#E5E8EB;border-radius:8px;overflow:hidden;margin-top:12px}
      .rvm5-mhero-sub .c{background:#fff;padding:10px}
      .rvm5-mhero-sub .l{font-size:9px;color:#191F28;opacity:0.7}
      .rvm5-mhero-sub .v{font-size:13px;font-weight:700;margin-top:2px;letter-spacing:-0.3px}

      .rvm5-mai{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#fff;border:1px solid #E5E8EB;border-radius:14px;margin-bottom:8px}
      .rvm5-mai .badge{padding:2px 7px;border-radius:5px;background:#E5586E;color:#fff;font-size:8px;font-weight:800;flex-shrink:0}
      .rvm5-mai .txt{font-size:12px;color:#191F28}
      .rvm5-mai .txt b{font-weight:700}

      .rvm5-mc{background:#fff;border:1px solid #E5E8EB;border-radius:14px;padding:12px;margin-bottom:8px}
      .rvm5-mc .t{font-size:10px;font-weight:600;color:#191F28;margin-bottom:6px}

      .rvm5-mbr{display:flex;align-items:center;gap:5px;padding:4px 0}
      .rvm5-mbr .lb{font-size:10px;width:30px;text-align:right;color:#191F28;flex-shrink:0}
      .rvm5-mbr .tk{flex:1;height:10px;background:#F2F4F6;border-radius:3px;overflow:hidden}
      .rvm5-mbr .fl{height:100%;border-radius:3px}
      .rvm5-mbr .pc{font-size:10px;font-weight:600;width:28px;text-align:right;color:#191F28;flex-shrink:0}

      .rvm5-md{display:flex;align-items:center;gap:5px;padding:6px 0;border-bottom:1px solid #F2F4F6}
      .rvm5-md:last-child{border:none}
      .rvm5-md .d{font-size:10px;color:#191F28;width:58px;flex-shrink:0}
      .rvm5-md .bar{flex:1;height:4px;background:#F2F4F6;border-radius:2px;overflow:hidden;position:relative;min-width:40px}
      .rvm5-md .f{height:100%;border-radius:2px}
      .rvm5-md .gl{position:absolute;top:-1px;bottom:-1px;width:1.5px;background:#191F28;opacity:0.18;border-radius:1px}
      .rvm5-md .a{font-size:11px;font-weight:600;width:74px;text-align:right;letter-spacing:-0.3px;flex-shrink:0}
      .rvm5-md .a.over{color:#0F6E56}
      .rvm5-md .a.under{color:#4E5968}
      .rvm5-md .c{font-size:9px;color:#191F28;width:24px;text-align:right;opacity:0.6;flex-shrink:0}

      .rvm5-mli{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #E5E8EB;cursor:pointer}
      .rvm5-mli:last-child{border:none}
      .rvm5-mli .dt{font-size:10px;color:#191F28;width:30px;opacity:0.6;flex-shrink:0}
      .rvm5-mli .nm{font-size:12px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .rvm5-mli .am{font-size:12px;font-weight:700;letter-spacing:-0.2px;flex-shrink:0}
      .rvm5-mli .ch{font-size:11px;color:#C5CBD2;margin-left:1px;flex-shrink:0}

      .rvm5-mgb{display:flex;align-items:center;gap:6px;padding:7px 10px;border-radius:8px;margin-bottom:6px;background:#FFF1F3}
      .rvm5-mgb .t{font-size:10px;font-weight:600;color:#E5586E;flex:1}
      .rvm5-mgb .btn{padding:3px 10px;border-radius:999px;font-size:9px;font-weight:600;border:1px solid #E5E8EB;background:#fff;color:#E5586E;cursor:pointer}

      /* ═════ today/week 호환 — 옛 v4 톤 (변경 X) ═════ */
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

  // ── 결제수단 분포 (v5) ──────────────────────────────────
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

  // ── 일별 매출 (v5) ──────────────────────────────────────
  function _renderDailyListV5(summary, goal, isMobile) {
    const list = (summary.daily || []).slice(0, 14);
    if (!list.length) return `<div style="font-size:11px;color:#8B95A1;padding:6px 0;">아직 데이터가 없어요</div>`;
    const goalAmt = goal && goal.amount > 0 ? goal.amount : 0;
    const maxVal = Math.max(goalAmt * 1.4, ...list.map(d => d.total));
    const today = new Date();
    const cls = isMobile ? 'rvm5-md' : 'rvm5-dr';
    return list.map(d => {
      const ratio = maxVal ? Math.min(100, Math.round(d.total * 100 / maxVal)) : 0;
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
    }).join('');
  }

  function _renderGoalBannerV5(summary, goal, isMobile) {
    const cls = isMobile ? 'rvm5-mgb' : 'rvm5-gb';
    if (goal && goal.amount > 0) {
      const list = summary.daily || [];
      const days = list.filter(d => d.total > 0).length;
      const hit = list.filter(d => d.total >= goal.amount).length;
      const rate = days ? Math.round(hit * 100 / days) : 0;
      return `<div class="${cls}">
        <div class="t">목표 ${_krw(goal.amount)}/일 · 달성 ${rate}%</div>
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

  // ── 매출 내역 (v5) ──────────────────────────────────────
  function _renderTransactionListV5(items, isMobile) {
    const sorted = [...items].sort((a, b) => new Date(b.recorded_at || b.created_at) - new Date(a.recorded_at || a.created_at));
    const visible = sorted.slice(0, isMobile ? 8 : 12);
    if (!visible.length) return `<div class="rvm5-empty">아직 매출 내역이 없어요</div>`;
    const liCls = isMobile ? 'rvm5-mli' : 'rvm5-li';
    const rows = visible.map(r => {
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
    }).join('');
    return `<div class="rvm5-list">${rows}</div>`;
  }

  // ── PC 렌더 ─────────────────────────────────────────────
  function renderPC(container, summary, items) {
    _ensureStyles();
    const R = _R();
    const goal = readGoal();
    const now = new Date();
    const monthLabel = now.getFullYear() + '년 ' + (now.getMonth() + 1) + '월';
    const aiRow = summary.projected_total
      ? `<div class="rvm5-ai"><span class="badge">AI</span><span class="txt">이번달 예상 <b>${_krw(summary.projected_total)}</b></span></div>`
      : '';

    container.innerHTML = (R._renderPCHeaderHTML ? R._renderPCHeaderHTML('month') : '') + `
      <div class="rvm5-body">
        <div class="rvm5-mnav">
          <button type="button" class="arrow" data-rvm-act="prev-month" aria-label="이전달">‹</button>
          <div class="label">${_esc(monthLabel)}</div>
          <button type="button" class="arrow" data-rvm-act="next-month" aria-label="다음달" disabled>›</button>
        </div>
        <div class="rvm5-hero">
          <span class="amt">${_krw(summary.total)}</span>
          <span class="cnt">${summary.count}건 완료</span>
        </div>
        ${aiRow}
        <div class="rvm5-stats">
          <div class="rvm5-stat"><div class="l">순수익</div><div class="v">${_krw(summary.net_profit)}</div></div>
          <div class="rvm5-stat"><div class="l">재료비</div><div class="v">${_krw(summary.material_cost_total)}</div></div>
        </div>
        <div class="rvm5-g2">
          <div class="rvm5-card">
            <div class="rvm5-card-t">결제수단</div>
            ${_renderPaymentBarsV5(summary.by_method, summary.total, false)}
          </div>
          <div class="rvm5-card">
            <div class="rvm5-card-t">일별 매출</div>
            ${_renderGoalBannerV5(summary, goal, false)}
            ${_renderDailyListV5(summary, goal, false)}
          </div>
        </div>
        <div class="rvm5-sl">매출 내역</div>
        ${_renderTransactionListV5(items, false)}
      </div>`;
    _bindEvents(container);
  }

  // ── 모바일 렌더 ─────────────────────────────────────────
  function renderMobile(container, summary, items) {
    _ensureStyles();
    const goal = readGoal();
    const now = new Date();
    const monthLabel = now.getFullYear() + '년 ' + (now.getMonth() + 1) + '월';
    const aiRow = summary.projected_total
      ? `<div class="rvm5-mai"><span class="badge">AI</span><span class="txt">이번달 예상 <b>${_krw(summary.projected_total)}</b></span></div>`
      : '';

    container.innerHTML = `
      <div class="rvm5-mbody">
        <div class="rvm5-mmnav">
          <button type="button" class="ar" data-rvm-act="prev-month" aria-label="이전달">‹</button>
          <div class="ml">${_esc(monthLabel)}</div>
          <button type="button" class="ar" data-rvm-act="next-month" aria-label="다음달" disabled>›</button>
        </div>
        <div class="rvm5-mhero">
          <div class="rvm5-mhero-top">
            <span class="amt">${_krw(summary.total)}</span>
            <span class="cnt">${summary.count}건 완료</span>
          </div>
          <div class="rvm5-mhero-sub">
            <div class="c"><div class="l">순수익</div><div class="v">${_krw(summary.net_profit)}</div></div>
            <div class="c"><div class="l">재료비</div><div class="v">${_krw(summary.material_cost_total)}</div></div>
          </div>
        </div>
        ${aiRow}
        <div class="rvm5-mc">
          <div class="t">결제수단</div>
          ${_renderPaymentBarsV5(summary.by_method, summary.total, true)}
        </div>
        <div class="rvm5-mc">
          <div class="t">일별 매출</div>
          ${_renderGoalBannerV5(summary, goal, true)}
          ${_renderDailyListV5(summary, goal, true)}
        </div>
        <div class="rvm5-sl" style="margin:14px 0 6px;font-size:11px;">매출 내역</div>
        ${_renderTransactionListV5(items, true)}
      </div>`;
    _bindEvents(container);
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
        } else if (act === 'prev-month' || act === 'next-month') {
          if (window.showToast) window.showToast('월 단위 이력 조회는 곧 추가됩니다');
        }
      });
    });
  }
  function _triggerRerender() {
    const fn = _R()._rerender;
    if (typeof fn === 'function') { try { fn(); } catch (_e) { /* silent */ } }
  }

  window.RevenueMonth = { fetchSummary, fallbackSummary, renderPC, renderMobile, readGoal, writeGoal, clearGoal, _ensureStyles };
})();
