/* ─────────────────────────────────────────────────────────────
   파워뷰 — 운영 분석 (Phase 4 · 2026-05-10)

   매출 탭 합계행 옆 [운영 분석] 버튼 → 모달 안에서:
   · 월별 매출 추이 (최근 6개월 SVG bar chart)
   · 카드 수수료 추정 (3.4% 기본, 분기별 합계)
   · 직원·시술자별 매출 분포 (worker_name·staff_name 필드)
   · 회원권 만료 임박 (30일 이내) — customer 데이터에서

   별도 진입점 X — 파워뷰 내부 모달. 백엔드 신규 0.

   ── 가드레일 ──
   1. 모달 닫기 = 파워뷰로 즉시 복귀 (포커스 손실 X)
   2. 데이터 부족 시 "기록이 더 쌓이면 분석이 시작돼요" 안내
   3. 파일 ≤300줄

   사용:
     window._PVOps.button() → 매출 탭 합계행 옆 버튼 HTML
     window._PVOps.bind()
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window._PVOps) return;

  const MODAL_ID = 'pv-ops-modal';
  const CARD_FEE = 0.034; // 카드 수수료 3.4% (설정 가능 추후)

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }
  function _krw(n) {
    try { return '₩' + (Number(n) || 0).toLocaleString('ko-KR'); }
    catch (_e) { return '₩0'; }
  }

  // ── 데이터 집계 ────────────────────────────────────────
  function _aggregate() {
    try {
      const data = (window._PVState && window._PVState.data) || {};
      const revenues = data.revenue || [];
      const customers = data.customer || [];

      // 월별 매출 (최근 6개월)
      const monthMap = {};
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        monthMap[ym] = 0;
      }
      revenues.forEach((r) => {
        const ym = (r.recorded_at || '').slice(0, 7);
        if (ym && monthMap[ym] !== undefined) {
          monthMap[ym] += Number(r.amount || 0);
        }
      });

      // 직원별 매출 (worker_name / staff_name / staff_id 어떤 게 있든)
      const workerMap = {};
      revenues.forEach((r) => {
        const w = r.worker_name || r.staff_name || r.worker || (r.worker_id ? '직원 ' + r.worker_id : '미지정');
        if (!workerMap[w]) workerMap[w] = { count: 0, sum: 0 };
        workerMap[w].count++;
        workerMap[w].sum += Number(r.amount || 0);
      });

      // 카드 수수료 (분기별)
      const quarterMap = {};
      revenues.forEach((r) => {
        if (r.method !== 'card') return;
        const d = (r.recorded_at || '').slice(0, 10);
        if (!d) return;
        const yr = d.slice(0, 4);
        const mo = Number(d.slice(5, 7));
        const q = 'Q' + Math.ceil(mo / 3);
        const key = yr + ' ' + q;
        if (!quarterMap[key]) quarterMap[key] = { gross: 0, fee: 0 };
        quarterMap[key].gross += Number(r.amount || 0);
        quarterMap[key].fee += Number(r.amount || 0) * CARD_FEE;
      });

      // 회원권 만료 임박 (30일 이내) — expires_at 필드 활용
      const soon = [];
      const now30 = Date.now() + 30 * 24 * 60 * 60 * 1000;
      const nowTs = Date.now();
      customers.forEach((c) => {
        if (!c.membership_active) return;
        const exp = Date.parse(c.membership_expires_at || '');
        if (Number.isFinite(exp) && exp > nowTs && exp < now30) {
          soon.push({ id: c.id, name: c.name, expires_at: c.membership_expires_at, balance: c.membership_balance || 0 });
        }
      });
      soon.sort((a, b) => Date.parse(a.expires_at) - Date.parse(b.expires_at));

      return {
        monthly: monthMap,
        workers: workerMap,
        quarters: quarterMap,
        membershipSoon: soon,
        totalRevenue: revenues.reduce((s, r) => s + (Number(r.amount) || 0), 0),
        totalCount: revenues.length,
      };
    } catch (e) {
      console.warn('[PVOps] aggregate', e);
      return null;
    }
  }

  // ── SVG 막대 차트 (단순) ──────────────────────────────
  function _renderBarChart(monthMap) {
    const entries = Object.entries(monthMap);
    if (!entries.length) return '<div class="pv-ops-empty">매출 기록이 더 쌓이면 추이가 보여요</div>';
    const max = Math.max(...entries.map(([, v]) => v), 1);
    const W = 320, H = 120, padL = 32, padB = 24, padT = 8;
    const colW = (W - padL - 12) / entries.length;
    const bars = entries.map(([k, v], i) => {
      const x = padL + i * colW + 4;
      const h = max > 0 ? ((v / max) * (H - padT - padB)) : 0;
      const y = H - padB - h;
      return `<rect x="${x}" y="${y}" width="${colW - 8}" height="${h}" rx="3" fill="var(--brand,var(--brand))" />
        <text x="${x + (colW - 8) / 2}" y="${H - padB + 14}" text-anchor="middle" font-size="9" fill="var(--text-subtle,#888)">${_esc(k.slice(5))}</text>`;
    }).join('');
    const yAxis = `<text x="4" y="${padT + 8}" font-size="9" fill="var(--text-subtle,#888)">${_krw(max)}</text>
      <text x="4" y="${H - padB - 2}" font-size="9" fill="var(--text-subtle,#888)">₩0</text>`;
    return `<svg width="100%" viewBox="0 0 ${W} ${H}" style="display:block;max-width:480px;margin:0 auto;">${yAxis}${bars}</svg>`;
  }

  // ── 모달 닫기 ──────────────────────────────────────────
  function _close() {
    try {
      const el = document.getElementById(MODAL_ID);
      if (el) el.remove();
      document.removeEventListener('keydown', _onKey);
    } catch (_e) { /* silent */ }
  }
  function _onKey(e) { if (e.key === 'Escape') _close(); }

  // ── 모달 열기 ──────────────────────────────────────────
  function open() {
    try {
      _close();
      const agg = _aggregate();
      if (!agg) return;

      const workersArr = Object.entries(agg.workers).sort(([, a], [, b]) => b.sum - a.sum);
      const workersHtml = workersArr.length ? workersArr.map(([name, s]) => `
        <li class="pv-ops-li">
          <span class="pv-ops-li__name">${_esc(name)}</span>
          <span class="pv-ops-li__count">${s.count}건</span>
          <strong class="pv-ops-li__sum">${_krw(s.sum)}</strong>
        </li>
      `).join('') : '<li class="pv-ops-empty">직원 정보가 기록되면 분포가 나와요</li>';

      const quartersArr = Object.entries(agg.quarters).sort();
      const quartersHtml = quartersArr.length ? quartersArr.map(([k, v]) => `
        <tr>
          <td>${_esc(k)}</td>
          <td style="text-align:right;">${_krw(v.gross)}</td>
          <td style="text-align:right;color:#DC3545;font-weight:700;">-${_krw(Math.round(v.fee))}</td>
          <td style="text-align:right;font-weight:700;">${_krw(Math.round(v.gross - v.fee))}</td>
        </tr>
      `).join('') : '<tr><td colspan="4" class="pv-ops-empty">카드 매출이 기록되면 분기별 수수료가 보여요</td></tr>';

      const soonHtml = agg.membershipSoon.length ? agg.membershipSoon.map((c) => {
        const days = Math.ceil((Date.parse(c.expires_at) - Date.now()) / (24 * 60 * 60 * 1000));
        return `<li class="pv-ops-li" data-pv-ops-cid="${_esc(c.id)}" tabindex="0" role="button">
          <span class="pv-ops-li__name">${_esc(c.name || '손님')}</span>
          <span class="pv-ops-li__count" style="color:#E68A00;">D-${days}</span>
          <strong class="pv-ops-li__sum">${_krw(c.balance)}</strong>
        </li>`;
      }).join('') : '<li class="pv-ops-empty">30일 안에 만료될 회원권이 없어요</li>';

      const modal = document.createElement('div');
      modal.id = MODAL_ID;
      modal.className = 'pv-ops-modal';
      modal.innerHTML = `
        <div class="pv-ops-backdrop" data-pv-ops-close></div>
        <div class="pv-ops-card" role="dialog" aria-label="운영 분석">
          <header class="pv-ops-header">
            <strong>운영 분석</strong>
            <span class="pv-ops-sub">매출 ${agg.totalCount}건 · 합계 ${_krw(agg.totalRevenue)}</span>
            <button type="button" class="pv-ops-close-btn" data-pv-ops-close aria-label="닫기">
              <i class="ph-duotone ph-x" aria-hidden="true"></i>
            </button>
          </header>
          <section class="pv-ops-section">
            <h4 class="pv-ops-h4">월별 매출 추이</h4>
            <div class="pv-ops-chart">${_renderBarChart(agg.monthly)}</div>
          </section>
          <section class="pv-ops-section">
            <h4 class="pv-ops-h4">직원·시술자별 매출</h4>
            <ul class="pv-ops-list">${workersHtml}</ul>
          </section>
          <section class="pv-ops-section">
            <h4 class="pv-ops-h4">분기별 카드 수수료 추정 (3.4%)</h4>
            <table class="pv-ops-table">
              <thead><tr><th>분기</th><th style="text-align:right;">카드 매출</th><th style="text-align:right;">수수료</th><th style="text-align:right;">실수령</th></tr></thead>
              <tbody>${quartersHtml}</tbody>
            </table>
          </section>
          <section class="pv-ops-section">
            <h4 class="pv-ops-h4">회원권 만료 임박 (30일 이내)</h4>
            <ul class="pv-ops-list">${soonHtml}</ul>
          </section>
        </div>
      `;
      document.body.appendChild(modal);
      modal.querySelectorAll('[data-pv-ops-close]').forEach((el) => el.addEventListener('click', _close));
      modal.querySelectorAll('[data-pv-ops-cid]').forEach((el) => {
        el.addEventListener('click', () => {
          const cid = el.getAttribute('data-pv-ops-cid');
          if (cid && typeof window.openCustomerDashboard === 'function') {
            _close();
            window.openCustomerDashboard(cid);
          }
        });
      });
      document.addEventListener('keydown', _onKey);
    } catch (e) {
      console.warn('[PVOps] open', e);
    }
  }

  function button() {
    return `<button type="button" class="pv-ops-btn" data-pv-ops-open title="월별 매출 / 직원별 분포 / 카드 수수료 / 회원권 만료">
      <i class="ph-duotone ph-chart-bar" aria-hidden="true"></i>
      운영 분석
    </button>`;
  }

  function bind() {
    try {
      document.querySelectorAll('[data-pv-ops-open]').forEach((btn) => {
        btn.addEventListener('click', open);
      });
    } catch (e) {
      console.warn('[PVOps] bind', e);
    }
  }

  window._PVOps = { open, close: _close, button, bind };
})();
