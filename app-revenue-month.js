/* ─────────────────────────────────────────────────────────────
   매출관리 — 이번달 뷰 (Step 3A · 2026-05-16, mockup-revenue-v4 기반)

   - BE GET /revenue/summary?period=month 호출 (실패 시 FE 폴백 계산)
   - 4 stat 카드 / 동기간 대비 / 결제수단 분포 / 일별 + AI 목표 / 매출 내역
   - AI 일일 목표 localStorage('itdasy_daily_goal_v1') · 미설정 시 저번달 일평균 추천

   외부 API: window.RevenueMonth = { fetchSummary, fallbackSummary, renderPC, renderMobile }
   의존: window.Revenue (내부 헬퍼)
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

  // 일요일 제외 영업일 계산 (BE 와 동일 규칙)
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

  // BE 실패 시 GET /revenue?period=month items 로부터 클라이언트 계산
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
    // 저번달 일평균 — prev_full_month / 저번달 영업일 수 (BE 가 안 주면 22일 가정)
    const prev = +summary.prev_full_month || 0;
    if (!prev) return 0;
    return Math.max(1000, Math.round(prev / 22 / 1000) * 1000);
  }

  // ── 헬퍼 ───────────────────────────────────────────────
  const _esc = (s) => (_R()._esc ? _R()._esc(s) : String(s == null ? '' : s));
  const _krw = (n) => (((+n) || 0)).toLocaleString('ko-KR') + '원';
  const _man = (n) => (_R()._formatMan ? _R()._formatMan(n) : _krw(n));
  function _pctDelta(cur, prev) { if (!prev) return null; return Math.round((cur - prev) * 1000 / prev) / 10; }
  function _diffSign(v, suffix) {
    if (v == null) return '<span class="rvm-diff">—</span>';
    const cls = v >= 0 ? 'rvm-diff rvm-up' : 'rvm-diff rvm-dn';
    const sign = v > 0 ? '+' : '';
    return `<span class="${cls}">${sign}${v}${suffix || ''}</span>`;
  }
  function _ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function _shortDate(s) {
    const t = new Date(s);
    return (t.getMonth() + 1) + '/' + t.getDate();
  }
  function _dayLabel(s, today) {
    const t = new Date(s);
    const dn = ['일', '월', '화', '수', '목', '금', '토'][t.getDay()];
    const same = today && t.toDateString() === today.toDateString();
    return same ? `${t.getMonth() + 1}/${t.getDate()} 오늘` : `${t.getMonth() + 1}/${t.getDate()} (${dn})`;
  }
  const TAG_LABEL = { card: '카드', cash: '현금', transfer: '계좌', bank_transfer: '계좌', membership: '회원권', etc: '기타' };
  const METHOD_COLOR = { card: 'var(--bs)', cash: 'var(--brand)', transfer: '#F5A3B0', bank_transfer: '#F5A3B0', membership: '#F8C4CC', etc: '#E5E8EB' };

  // ── 스타일 주입 (목업 v4 톤, rvm- prefix 로 격리) ────────
  function _ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
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

      .rvm-compare{background:#fff;border:1px solid #E5E8EB;border-radius:14px;padding:16px;margin-top:16px}
      .rvm-compare h4{font-size:13px;font-weight:700;margin-bottom:10px}
      .rvm-cmpg{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:14px}
      .rvm-cmpitem .l{font-size:10px;color:#8B95A1}
      .rvm-cmpitem .vals{font-size:13px;font-weight:600;margin-top:2px}
      .rvm-diff{font-size:12px;font-weight:700;margin-top:2px;display:block}
      .rvm-diff.rvm-up{color:#0F6E56}
      .rvm-diff.rvm-dn{color:#E5586E}

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

      .rvm-goal{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:10px;margin-bottom:12px;border:1px dashed #E5E8EB;background:#F2F4F6}
      .rvm-goal.set{border:1px solid #E5E8EB;background:#FFF1F3;border-style:solid}
      .rvm-goal .icon{font-size:13px;font-weight:800;color:#E5586E;flex-shrink:0}
      .rvm-goal .info{flex:1;min-width:0}
      .rvm-goal .gt{font-size:12px;font-weight:600;color:#E5586E}
      .rvm-goal .gd{font-size:11px;color:#4E5968;margin-top:2px}
      .rvm-gbtn{padding:6px 14px;border-radius:999px;font-size:11px;font-weight:600;border:1px solid #E5E8EB;background:#fff;color:#E5586E;cursor:pointer;flex-shrink:0}

      .rvm-tbl{width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #E5E8EB;border-radius:14px;overflow:hidden}
      .rvm-tbl th{text-align:left;font-weight:600;font-size:11px;color:#8B95A1;padding:10px 14px;border-bottom:2px solid #E5E8EB;white-space:nowrap}
      .rvm-tbl td{padding:12px 14px;border-bottom:1px solid #E5E8EB;vertical-align:middle}
      .rvm-tbl tbody tr:last-child td{border-bottom:none}
      .rvm-tbl tbody tr:hover{background:#F7F8FA}
      .rvm-bg{font-size:10px;padding:3px 9px;border-radius:999px;font-weight:600;white-space:nowrap;display:inline-block}
      .rvm-bg.cd,.rvm-bg.cs,.rvm-bg.tf,.rvm-bg.mb,.rvm-bg.au{background:#FFF1F3;color:#E5586E}
      .rvm-bg.mn{background:#F2F4F6;color:#8B95A1}

      /* 모바일 */
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
      .rvm-mg3 .c .v.up{color:#0F6E56}
      .rvm-mg3 .c .v.dn{color:#E5586E}
      .rvm-mpredict{background:#fff;border:1px solid #E5E8EB;padding:14px;border-radius:14px;margin-bottom:10px}
      .rvm-mpredict .l{font-size:11px;color:#4E5968;font-weight:600}
      .rvm-mpredict .v{font-size:22px;font-weight:700;color:#E5586E;margin-top:4px;letter-spacing:-0.8px}
      .rvm-mpredict .d{font-size:10px;color:#4E5968;margin-top:4px;line-height:1.5}
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

  // ── 결제수단 분포 (PC/모바일 공용) ──────────────────────
  function _renderPaymentBars(by_method, total) {
    const order = ['card', 'cash', 'transfer', 'bank_transfer', 'membership', 'etc'];
    const rows = order
      .filter(k => by_method && by_method[k])
      .map(k => ({ k, label: TAG_LABEL[k] || k, total: by_method[k] || 0 }))
      .filter(x => x.total > 0)
      .sort((a, b) => b.total - a.total);
    if (!rows.length || !total) {
      return `<div style="font-size:12px;color:#8B95A1;padding:8px 0;">아직 데이터가 없어요</div>`;
    }
    return rows.map(r => {
      const pct = Math.round(r.total * 100 / total);
      const color = METHOD_COLOR[r.k] || '#E5E8EB';
      return `<div class="rvm-barrow">
        <div class="rvm-blabel">${_esc(r.label)}</div>
        <div class="rvm-btrack"><div class="rvm-bfill" style="width:${pct}%;background:${color};"></div></div>
        <div class="rvm-bval">${pct}%</div>
      </div>`;
    }).join('');
  }

  // ── 일별 매출 (PC/모바일 공용) ──────────────────────────
  function _renderDailyList(summary, goal) {
    const list = (summary.daily || []).slice(0, 12);  // 최근 12일만 표시
    if (!list.length) return `<div style="font-size:12px;color:#8B95A1;padding:8px 0;">아직 데이터가 없어요</div>`;
    const goalAmt = goal && goal.amount > 0 ? goal.amount : 0;
    const maxVal = Math.max(goalAmt, ...list.map(d => d.total));
    const today = new Date();
    return list.map(d => {
      const ratio = maxVal ? Math.min(100, Math.round(d.total * 100 / maxVal)) : 0;
      const over = goalAmt && d.total >= goalAmt;
      const fillCls = over ? 'over' : (goalAmt && d.total > 0 ? 'under' : 'over');
      const amtCls = goalAmt ? (over ? 'over' : 'under') : '';
      const goalPct = goalAmt && maxVal ? Math.round(goalAmt * 100 / maxVal) : 0;
      return `<div class="rvm-dayrow">
        <div class="rvm-dd">${_esc(_dayLabel(d.date, today))}</div>
        <div class="rvm-db">
          ${d.total > 0 ? `<div class="rvm-df ${fillCls}" style="width:${ratio}%;"></div>` : ''}
          ${goalAmt ? `<div class="rvm-dgoal" style="left:${goalPct}%;"></div>` : ''}
        </div>
        <div class="rvm-damt ${amtCls}">${_krw(d.total)}</div>
        <div class="rvm-dcnt">${d.count}건</div>
      </div>`;
    }).join('');
  }

  function _renderGoalBanner(summary, goal) {
    if (goal && goal.amount > 0) {
      const list = summary.daily || [];
      const days = list.filter(d => d.total > 0).length;
      const hit = list.filter(d => d.total >= goal.amount).length;
      const rate = days ? Math.round(hit * 100 / days) : 0;
      return `<div class="rvm-goal set">
        <div class="icon">AI</div>
        <div class="info">
          <div class="gt">일일 목표: ${_krw(goal.amount)}</div>
          <div class="gd">달성률 ${rate}% (${hit}/${days}일)${summary.prev_full_month ? ' · 저번달 기반 AI 추천' : ''}</div>
        </div>
        <button type="button" class="rvm-gbtn" data-rvm-act="edit-goal">수정</button>
      </div>`;
    }
    const rec = recommendedGoal(summary);
    if (!rec) {
      return `<div class="rvm-goal">
        <div class="icon">AI</div>
        <div class="info">
          <div class="gt">일일 목표를 설정해 보세요</div>
          <div class="gd">매출 데이터가 쌓이면 저번달 기반 추천이 표시돼요</div>
        </div>
        <button type="button" class="rvm-gbtn" data-rvm-act="edit-goal">설정</button>
      </div>`;
    }
    return `<div class="rvm-goal">
      <div class="icon">AI</div>
      <div class="info">
        <div class="gt">저번달 일평균 ${_krw(rec)} 기반</div>
        <div class="gd">이번달 일일 목표를 ${_krw(rec)}로 설정할까요?</div>
      </div>
      <button type="button" class="rvm-gbtn" data-rvm-act="accept-goal" data-amount="${rec}">설정</button>
    </div>`;
  }

  // ── PC: stat 카드 / compare 카드 / 매출 내역 테이블 ─────
  function _renderPCStatCards(summary, now) {
    const monthLbl = (now.getMonth() + 1) + '월 매출';
    const matPct = summary.total ? Math.round((summary.material_cost_total || 0) * 100 / summary.total) : 0;
    return `
      <div class="rvm-pcg4">
        <div class="rvm-pcstat hi">
          <div class="l">${_esc(monthLbl)} (1~${now.getDate()}일)</div>
          <div class="v">${_krw(summary.total)}</div>
          <div class="s">완료 ${summary.count}건 · 영업일 ${summary.business_days}일</div>
        </div>
        <div class="rvm-pcstat predict">
          <div class="l">이번달 예상 매출</div>
          <div class="v">≈ ${_krw(summary.projected_total)}</div>
          <div class="s">현재 추세 유지 시 (일평균 × 남은 영업일)</div>
        </div>
        <div class="rvm-pcstat">
          <div class="l">순수익 (재료비 제외)</div>
          <div class="v">${_krw(summary.net_profit)}</div>
          <div class="s">재료비 ${_krw(summary.material_cost_total)}${matPct ? ` (${matPct}%)` : ''}</div>
        </div>
        <div class="rvm-pcstat">
          <div class="l">평균 객단가</div>
          <div class="v">${_krw(summary.avg_per_customer)}</div>
          <div class="s">일평균 ${_krw(summary.daily_avg)} 매출</div>
        </div>
      </div>`;
  }
  function _renderCompareCard(summary, now) {
    const prevMonth = ((now.getMonth() + 11) % 12 + 1) + '월';
    const ps = summary.prev_same_period || { total: 0, count: 0, avg_per_customer: 0 };
    const dTotal = _pctDelta(summary.total, ps.total);
    const dCount = summary.count - (ps.count || 0);
    const dAvg = _pctDelta(summary.avg_per_customer, ps.avg_per_customer);
    const dProj = _pctDelta(summary.projected_total, summary.prev_full_month);
    return `
      <div class="rvm-compare">
        <h4>${_esc(prevMonth)} 같은 기간 (1~${now.getDate()}일) 대비</h4>
        <div class="rvm-cmpg">
          <div class="rvm-cmpitem"><div class="l">매출</div><div class="vals">${_krw(ps.total)} → ${_krw(summary.total)}</div>${_diffSign(dTotal, '%')}</div>
          <div class="rvm-cmpitem"><div class="l">완료 건수</div><div class="vals">${ps.count}건 → ${summary.count}건</div>${_diffSign(dCount, '건')}</div>
          <div class="rvm-cmpitem"><div class="l">객단가</div><div class="vals">${_krw(ps.avg_per_customer)} → ${_krw(summary.avg_per_customer)}</div>${_diffSign(dAvg, '%')}</div>
          <div class="rvm-cmpitem"><div class="l">예상 vs 저번달 전체</div><div class="vals">${_krw(summary.prev_full_month)} → ${_krw(summary.projected_total)}</div>${_diffSign(dProj, '% 예상')}</div>
        </div>
      </div>`;
  }
  function _methodBadge(m) {
    const cls = ({ card: 'cd', cash: 'cs', transfer: 'tf', bank_transfer: 'tf', membership: 'mb' })[m] || 'cd';
    return `<span class="rvm-bg ${cls}">${_esc(TAG_LABEL[m] || m || '카드')}</span>`;
  }
  function _renderTransactionTable(items) {
    const sorted = [...items].sort((a, b) => new Date(b.recorded_at || b.created_at) - new Date(a.recorded_at || a.created_at));
    const visible = sorted.slice(0, 10);
    if (!visible.length) {
      return `<div style="padding:24px;text-align:center;color:#8B95A1;font-size:13px;background:#fff;border:1px solid #E5E8EB;border-radius:14px;">아직 매출 내역이 없어요</div>`;
    }
    const rows = visible.map(r => {
      const t = new Date(r.recorded_at || r.created_at);
      const date = (t.getMonth() + 1) + '/' + t.getDate() + ' ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
      const isAuto = /\[auto_booking:/.test(r.memo || '');
      const who = r.customer_name ? `<strong>${_esc(r.customer_name)}</strong>` : '제품 판매';
      const svc = r.service_name ? ` · ${_esc(r.service_name)}` : '';
      return `<tr>
        <td>${_esc(date)}</td>
        <td>${who}${svc}</td>
        <td style="font-weight:600">${_krw(r.amount)}</td>
        <td>${_methodBadge(r.method || 'card')}</td>
        <td>${isAuto ? '<span class="rvm-bg au">자동</span>' : '<span class="rvm-bg mn">수동</span>'}</td>
      </tr>`;
    }).join('');
    const moreRow = sorted.length > visible.length
      ? `<tr><td colspan="5" style="text-align:center;padding:14px;font-size:12px;color:#8B95A1;">${sorted.length}건 중 ${visible.length}건 표시</td></tr>`
      : '';
    return `<table class="rvm-tbl">
      <thead><tr><th>날짜</th><th>고객 · 시술</th><th>금액</th><th>결제</th><th>구분</th></tr></thead>
      <tbody>${rows}${moreRow}</tbody>
    </table>`;
  }

  function renderPC(container, summary, items) {
    _ensureStyles();
    const R = _R();
    const goal = readGoal();
    const now = new Date();
    container.innerHTML = (R._renderPCHeaderHTML ? R._renderPCHeaderHTML('month') : '') + `
      <div class="rvm-body">
        ${_renderPCStatCards(summary, now)}
        ${_renderCompareCard(summary, now)}
        <div class="rvm-pcg2">
          <div class="rvm-cd"><div class="rvm-sl" style="margin-top:0">결제수단 분포</div>${_renderPaymentBars(summary.by_method, summary.total)}</div>
          <div class="rvm-cd"><div class="rvm-sl" style="margin-top:0">일별 매출${goal && goal.amount ? ` (목표: ${_krw(goal.amount)}/일)` : ''}</div>${_renderGoalBanner(summary, goal)}${_renderDailyList(summary, goal)}</div>
        </div>
        <div class="rvm-sl">이번달 매출 내역</div>
        ${_renderTransactionTable(items)}
      </div>`;
    _bindEvents(container);
  }

  // ── 모바일 ──────────────────────────────────────────────
  function _renderMobileHero(summary, now) {
    return `
      <div class="rvm-mcard rvm-mmain">
        <div class="ml">${now.getMonth() + 1}월 매출 (1~${now.getDate()}일)</div>
        <div class="mv">${_krw(summary.total)}</div>
        <div class="ms">완료 ${summary.count}건 · 영업일 ${summary.business_days}일</div>
        <div class="rvm-mg3">
          <div class="c"><div class="l">순수익</div><div class="v">${_krw(summary.net_profit)}</div></div>
          <div class="c"><div class="l">재료비</div><div class="v">${_krw(summary.material_cost_total)}</div></div>
          <div class="c"><div class="l">객단가</div><div class="v">${_krw(summary.avg_per_customer)}</div></div>
        </div>
      </div>`;
  }
  function _renderMobilePredict(summary) {
    const dProj = _pctDelta(summary.projected_total, summary.prev_full_month);
    const projTxt = dProj == null ? '저번달 데이터 없음' : `저번달 전체 (${_krw(summary.prev_full_month)}) 대비 ${dProj >= 0 ? '+' : ''}${dProj}% 예상`;
    return `
      <div class="rvm-mpredict">
        <div class="l">이번달 예상 매출</div>
        <div class="v">≈ ${_krw(summary.projected_total)}</div>
        <div class="d">현재 추세 유지 시 (일평균 ${_krw(summary.daily_avg)} × 남은 영업일 ${summary.remaining_business_days}일)<br>${_esc(projTxt)}</div>
      </div>`;
  }
  function _renderMobileCompare(summary, now) {
    const prevMonth = ((now.getMonth() + 11) % 12 + 1) + '월';
    const ps = summary.prev_same_period || { total: 0, count: 0, avg_per_customer: 0 };
    const dTotal = _pctDelta(summary.total, ps.total);
    const dCount = summary.count - (ps.count || 0);
    const dAvg = _pctDelta(summary.avg_per_customer, ps.avg_per_customer);
    const cell = (val, suffix) => {
      if (val == null) return `<div class="v">—</div>`;
      const cls = val >= 0 ? 'up' : 'dn';
      return `<div class="v ${cls}">${val >= 0 ? '+' : ''}${val}${suffix || ''}</div>`;
    };
    return `
      <div class="rvm-mcard rvm-mpad">
        <div style="font-size:11px;font-weight:600;margin-bottom:8px;">${_esc(prevMonth)} 같은 기간 (1~${now.getDate()}일) 대비</div>
        <div class="rvm-mg3">
          <div class="c"><div class="l">매출</div>${cell(dTotal, '%')}</div>
          <div class="c"><div class="l">건수</div>${cell(dCount, '건')}</div>
          <div class="c"><div class="l">객단가</div>${cell(dAvg, '%')}</div>
        </div>
      </div>`;
  }
  function _renderMobileTransactions(items) {
    const sorted = [...items].sort((a, b) => new Date(b.recorded_at || b.created_at) - new Date(a.recorded_at || a.created_at));
    const visible = sorted.slice(0, 5);
    if (!visible.length) {
      return `<div class="rvm-mcard" style="text-align:center;color:#8B95A1;font-size:13px;padding:18px;">아직 매출 내역이 없어요</div>`;
    }
    const rows = visible.map(r => {
      const t = new Date(r.recorded_at || r.created_at);
      const time = (t.getMonth() + 1) + '/' + t.getDate() + ' ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
      const isAuto = /\[auto_booking:/.test(r.memo || '');
      const who = r.customer_name ? _esc(r.customer_name) : '제품 판매';
      const svc = r.service_name ? ` · ${_esc(r.service_name)}` : '';
      return `<div class="rvm-mli">
        <div class="rvm-mdot ${isAuto ? '' : 'man'}"></div>
        <div class="rvm-minf">
          <div class="rvm-mln">${who}${svc}</div>
          <div class="rvm-mlsub">${_esc(time)} ${isAuto ? '<span class="rvm-bg au">자동</span>' : '<span class="rvm-bg mn">수동</span>'}</div>
        </div>
        <div class="rvm-mlamt">${_krw(r.amount)}</div>
      </div>`;
    }).join('');
    return `<div class="rvm-mcard" style="padding:0 14px;">${rows}</div>`;
  }

  function renderMobile(container, summary, items) {
    _ensureStyles();
    const goal = readGoal();
    const now = new Date();
    container.innerHTML = `
      <div class="rvm-mbody">
        ${_renderMobileHero(summary, now)}
        ${_renderMobilePredict(summary)}
        ${_renderMobileCompare(summary, now)}
        <div class="rvm-sl">결제수단</div>
        <div class="rvm-mcard rvm-mpad">${_renderPaymentBars(summary.by_method, summary.total)}</div>
        <div class="rvm-sl">일별 매출</div>
        ${_renderGoalBanner(summary, goal)}
        <div class="rvm-mcard rvm-mpad">${_renderDailyList(summary, goal)}</div>
        <div class="rvm-sl">최근 매출</div>
        ${_renderMobileTransactions(items)}
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
        }
      });
    });
  }
  function _triggerRerender() {
    const fn = _R()._rerender;
    if (typeof fn === 'function') { try { fn(); } catch (_e) { /* silent */ } }
  }

  window.RevenueMonth = { fetchSummary, fallbackSummary, renderPC, renderMobile, readGoal, writeGoal, clearGoal };
})();
