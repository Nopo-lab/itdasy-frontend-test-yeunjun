/* ─────────────────────────────────────────────────────────────
   고객 통합 대시보드 (Phase 4+ · 2026-04-20)

   GET /customers/{id}/dashboard 에서
     customer / segment / stats / retention / recent_revenues / recent_bookings / recent_nps
   받아 하나의 예쁜 대시보드로 렌더.

   openCustomerDashboard(id) 로 진입 — 기존 app-customer.js 의 행 클릭이 이걸 호출.
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // 단골 ⭐ 미세 펄스 애니메이션 (1회 주입)
  if (typeof document !== 'undefined' && !document.getElementById('cm-membership-style')) {
    const st = document.createElement('style');
    st.id = 'cm-membership-style';
    st.textContent = `
      @keyframes cmStarPulse { 0%{transform:scale(1);} 50%{transform:scale(1.18);} 100%{transform:scale(1);} }
      .cm-toggle--pulse { animation: cmStarPulse 0.45s ease-out 1; }
      .cm-star-on svg { animation: cmStarPulse 0.5s ease-out 1; }
    `;
    document.head.appendChild(st);
  }

  // Lucide SVG inline (이모지 금지 — CLAUDE.md UX 철학)
  const _svg12 = (id) => `<svg width="12" height="12" style="vertical-align:-2px;" aria-hidden="true"><use href="#${id}"/></svg>`;
  const SEGMENT_STYLE = {
    vip:     { label: 'VIP', icon: _svg12('ic-star'), bg: 'linear-gradient(135deg,#FFD700,#FFA500)', color: '#fff' },
    regular: { label: '단골', icon: _svg12('ic-star'), bg: 'linear-gradient(135deg,var(--brand),#FF6B9D)', color: '#fff' },
    new:     { label: '신규', icon: _svg12('ic-sparkles'), bg: 'linear-gradient(135deg,#4ECDC4,#44A08D)', color: '#fff' },
    absent:  { label: '휴면', icon: _svg12('ic-moon'), bg: 'linear-gradient(135deg,#95A5A6,#7F8C8D)', color: '#fff' },
  };

  const RETENTION_BADGE = {
    ok:      null,
    at_risk: { label: '이탈 임박', color: '#f57c00', bg: 'rgba(255,193,7,0.15)' },
    lost:    { label: '이탈', color: '#dc3545', bg: 'rgba(220,53,69,0.12)' },
  };

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  function _formatKRW(n) {
    return (+n || 0).toLocaleString('ko-KR') + '원';
  }

  function _dateShort(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}`;
  }

  function _relativeDays(iso) {
    if (!iso) return '';
    const diff = (Date.now() - new Date(iso).getTime()) / 86400000;
    if (diff < 1) return '오늘';
    if (diff < 7) return `${Math.round(diff)}일 전`;
    if (diff < 30) return `${Math.round(diff / 7)}주 전`;
    if (diff < 365) return `${Math.round(diff / 30)}개월 전`;
    return `${Math.round(diff / 365)}년 전`;
  }

  function _initial(name) {
    return (name || '?').trim().charAt(0);
  }

  async function _apiGet(path) {
    if (!window.API || !window.authHeader) throw new Error('no-auth');
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 22000); // Railway cold start 대응 22s
    try {
      const res = await fetch(window.API + path, {
        headers: window.authHeader(),
        signal: ctrl.signal
      });
      clearTimeout(tid);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const err = new Error(d.detail || ('HTTP ' + res.status));
        err.status = res.status;
        throw err;
      }
      return await res.json();
    } catch (e) {
      clearTimeout(tid);
      throw e;
    }
  }

  async function _apiPatch(path, body) {
    if (!window.API || !window.authHeader) throw new Error('no-auth');
    const res = await fetch(window.API + path, {
      method: 'PATCH',
      headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.status === 204 ? null : await res.json();
  }

  // ── UI ──────────────────────────────────────────────────
  function _ensureSheet() {
    let sheet = document.getElementById('customerDashSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'customerDashSheet';
    // [v208] 풀화면 시트 — PC 디테일과 동일한 v4 본문을 그대로 표시.
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9999;display:none;background:var(--surface,#fff);overflow-y:auto;';
    sheet.innerHTML = `
      <div class="cust-detail" style="position:relative;width:100%;max-width:720px;margin:0 auto;min-height:100vh;background:var(--surface,#fff);">
        <div class="cv4-detail-mobile-head">
          <button class="back" onclick="closeCustomerDashboard()" aria-label="뒤로가기">‹</button>
          <div style="flex:1;text-align:center;font-size:15px;font-weight:600;color:var(--text);">고객 정보</div>
          <div style="width:36px;"></div>
        </div>
        <div id="cdBody" class="cv4-detail-mobile-body"></div>
      </div>
    `;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) closeCustomerDashboard(); });
    return sheet;
  }

  function _renderHero(d) {
    const c = d.customer;
    const isRegular = !!c.is_regular;
    const isBirthday = (() => {
      if (!c.birthday) return false;
      const raw = String(c.birthday).trim();
      const m = raw.match(/^(\d{1,2})[-/](\d{1,2})$/) || raw.match(/^\d{4}-(\d{1,2})-(\d{1,2})/);
      if (!m) return false;
      const today = new Date();
      return +m[1] === today.getMonth() + 1 && +m[2] === today.getDate();
    })();
    const badges = [];
    if (isRegular) badges.push(`<span class="badge badge-regular">단골</span>`);
    if (c.membership_active) badges.push(`<span class="badge badge-member">회원권 ${(c.membership_balance/10000).toFixed(1)}만</span>`);
    if (isBirthday) badges.push(`<span class="badge badge-birthday">오늘 생일</span>`);

    const phoneStr = c.phone ? _esc(c.phone) : '';
    const dobStr = c.birthday ? _esc(c.birthday) : '';
    const fvStr = c.first_visit_at ? `첫 방문 ${_dateShort(c.first_visit_at)}` : '';
    const metas = [phoneStr, dobStr, fvStr].filter(Boolean).join(' · ');

    return `
      <div class="cd-head" style="padding-right: 28px;">
        <div class="cd-avatar-lg">${_esc(_initial(c.name))}</div>
        <div class="cd-name-row">
          <div class="cd-name">${_esc(c.name)} ${badges.join('')}</div>
          <div class="cd-meta">${metas}</div>
        </div>
        <button class="cd-edit" data-act="edit">편집</button>
      </div>
    `;
  }

  function _renderStats(d) {
    const s = d.stats;
    const bal = d.customer && d.customer.membership_active ? +d.customer.membership_balance : 0;
    return `
      <div class="cd-stats">
        <div class="cd-stat"><div class="cd-stat-value">${s.visit_count || 0}회</div><div class="cd-stat-label">방문</div></div>
        <div class="cd-stat"><div class="cd-stat-value">${_formatKRW(s.total_revenue)}</div><div class="cd-stat-label">총 매출</div></div>
        <div class="cd-stat"><div class="cd-stat-value">${bal > 0 ? (bal/10000).toFixed(1) + '만' : '0'}</div><div class="cd-stat-label">회원권 잔액</div></div>
      </div>
    `;
  }

  function _renderActions(id) {
    return ``; // Actions are moved to the bottom
  }

  function _renderRegularMembership(d) {
    const c = d.customer || {};
    const tags = Array.isArray(c.tags) ? c.tags : [];
    
    // 기본 정보 & 태그 렌더링
    const nextBooking = d.stats?.upcoming_bookings > 0 ? '예약 있음' : '없음';
    const avgCycle = c.avg_cycle_weeks ? `${c.avg_cycle_weeks}주` : '—';

    let html = `
      <div class="cd-section">
        <div class="cd-sec-title">기본 정보</div>
        <div class="cd-info-row"><div class="cd-info-label">평균 방문 주기</div><div class="cd-info-value">${avgCycle}</div></div>
        <div class="cd-info-row"><div class="cd-info-label">다음 예약</div><div class="cd-info-value">${nextBooking}</div></div>
      </div>
    `;

    if (tags.length) {
      html += `
        <div class="cd-section">
          <div class="cd-sec-title">태그</div>
          <div class="cd-tags">
            ${tags.map(t => `<div class="cd-tag">${_esc(t)}</div>`).join('')}
          </div>
        </div>
      `;
    }
    return html;
  }

  function _renderRevenues(rows) {
    if (!rows || !rows.length) return '';
    // [v198] limit 5→10, 금액 0 인 경우 '-' 로 표시
    return `
      <div class="cd-section">
        <div class="cd-sec-title">최근 방문 이력</div>
        ${rows.slice(0, 10).map(r => {
          const dt = String(r.recorded_at || '').slice(5, 10).replace('-', '/');
          const amt = Number(r.amount) || 0;
          const amtStr = amt > 0 ? (amt / 10000).toFixed(1) + '만원' : '-';
          return `
          <div class="cd-history-row">
            <div class="cd-history-date">${dt}</div>
            <div class="cd-history-text">${_esc(r.service_name || '시술')}</div>
            <div class="cd-history-amount">${amtStr}</div>
          </div>`;
        }).join('')}
      </div>
    `;
  }

  function _renderBookings(rows) {
    if (!rows || !rows.length) return _emptySection('예약 이력', '아직 예약이 없어요');
    return `
      <div style="margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
          <strong style="font-size:13px;">예약 이력</strong>
          <span style="font-size:10px;color:#888;">최근 ${rows.length}건</span>
        </div>
        <div style="background:#fff;border-radius:12px;border:1px solid rgba(0,0,0,0.05);overflow:hidden;">
          ${rows.map((b, i) => {
            const status = b.status === 'cancelled' ? '❌' : b.status === 'completed' ? '✓' : '•';
            return `
              <div style="padding:10px 12px;${i > 0 ? 'border-top:1px solid rgba(0,0,0,0.05);' : ''}">
                <div style="font-size:12px;font-weight:700;">${status} ${_dateShort(b.starts_at)} <span style="color:#888;font-weight:400;">${_esc(b.service_name || '시술')}</span></div>
                ${b.memo ? `<div style="font-size:10px;color:#888;margin-top:2px;">${_esc(b.memo).slice(0, 50)}</div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function _renderNps(rows) {
    if (!rows || !rows.length) return '';
    return `
      <div style="margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
          <strong style="font-size:13px;">⭐ 고객 후기</strong>
          <span style="font-size:10px;color:#888;">${rows.length}건</span>
        </div>
        <div style="background:#fff;border-radius:12px;border:1px solid rgba(0,0,0,0.05);overflow:hidden;">
          ${rows.map((n, i) => {
            const face = n.rating >= 9 ? '😍' : n.rating >= 7 ? '😐' : '😞';
            const color = n.rating >= 9 ? '#388e3c' : n.rating >= 7 ? '#f57c00' : '#dc3545';
            return `
              <div style="padding:10px 12px;${i > 0 ? 'border-top:1px solid rgba(0,0,0,0.05);' : ''}display:flex;gap:10px;align-items:flex-start;">
                <span style="font-size:18px;">${face}</span>
                <div style="flex:1;min-width:0;">
                  <div style="display:flex;align-items:baseline;gap:6px;">
                    <strong style="color:${color};font-size:14px;">${n.rating}</strong>
                    <span style="font-size:10px;color:var(--text-subtle);margin-left:auto;">${_dateShort(n.responded_at)}</span>
                  </div>
                  ${n.comment ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${_esc(n.comment)}</div>` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function _renderMemo(d) {
    if (!d.customer.memo) return '';
    return `
      <div style="margin-bottom:14px;padding:12px;background:#FFF9E6;border-radius:12px;border-left:3px solid #FFD54F;">
        <div style="font-size:11px;color:#888;margin-bottom:4px;">원장님 메모</div>
        <div style="font-size:13px;color:#555;line-height:1.5;white-space:pre-wrap;">${_esc(d.customer.memo)}</div>
      </div>
    `;
  }

  function _renderEditBar(id, customer) {
    // [v198] 매출 입력 버튼 삭제 — 시술완료 플로우와 중복. 매출은 캘린더→시술완료 또는 매출 대시보드에서만.
    return `
      <div class="cd-actions">
        <button class="cd-act-btn" data-act="booking">예약 잡기</button>
        <button class="cd-act-btn primary" data-act="ms-topup" data-cust-id="${id}" data-cust-name="${_esc(customer.name||'')}">회원권 충전</button>
      </div>
    `;
  }

  function _emptySection(title, msg) {
    return `
      <div style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:700;margin-bottom:8px;">${title}</div>
        <div style="padding:16px;background:#fafafa;border-radius:12px;text-align:center;font-size:12px;color:var(--text-subtle);">${msg}</div>
      </div>
    `;
  }

  async function _patchAndReload(id, patch) {
    try {
      await _apiPatch('/customers/' + id, patch);
      // SWR 캐시 무효화 — 목록 화면이 다시 신선한 데이터 가져오도록
      if (window.CustomerCache?.clear) window.CustomerCache.clear();
      else {
        try { localStorage.removeItem('pv_cache::customers'); } catch (_e) { void _e; }
        try { sessionStorage.removeItem('pv_cache::customers'); } catch (_e) { void _e; }
      }
      try { sessionStorage.removeItem('pv_cache::customer'); } catch (_e) { void _e; }
      window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'update_customer', id } }));
      if (window.hapticLight) window.hapticLight();
      // 대시보드 다시 그리기 (data-changed 리스너가 자동 재로드)
      // 직접 호출도 보장
      await window.openCustomerDashboard(id);
    } catch (e) {
      console.warn('[customer-membership] patch 실패:', e);
      if (window.showToast) window.showToast('저장 실패 — 다시 시도해 주세요');
    }
  }

  function _bindMembership(d) {
    const sheet = document.getElementById('customerDashSheet');
    if (!sheet) return;
    const id = d.customer.id;

    // 단골/멤버십 토글
    sheet.querySelectorAll('[data-cm-toggle]').forEach(el => {
      const key = el.dataset.cmToggle;
      const handler = async () => {
        const cur = el.getAttribute('aria-checked') === 'true';
        const next = !cur;
        const patch = { [key]: next };
        // 단골 ON 시 ⭐ 미세 애니메이션
        if (key === 'is_regular' && next) {
          el.classList.add('cm-toggle--pulse');
        }
        await _patchAndReload(id, patch);
      };
      el.addEventListener('click', handler);
      el.addEventListener('keydown', (ev) => {
        if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); handler(); }
      });
    });

    // 충전 버튼
    sheet.querySelectorAll('[data-cm-charge]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const raw = btn.dataset.cmCharge;
        let delta = 0;
        if (raw === 'custom') {
          const v = window.prompt('충전 금액(원)', '50000');
          if (v == null) return;
          delta = parseInt(String(v).replace(/[^\d]/g, ''), 10) || 0;
          if (delta <= 0) { if (window.showToast) window.showToast('금액을 다시 확인해 주세요'); return; }
        } else {
          delta = parseInt(raw, 10) || 0;
        }
        const curBal = +d.customer.membership_balance || 0;
        await _patchAndReload(id, { membership_balance: curBal + delta });
      });
    });

    // 만료일 변경
    const expInput = sheet.querySelector('[data-cm-expires]');
    if (expInput) {
      expInput.addEventListener('change', async () => {
        const v = expInput.value; // YYYY-MM-DD
        if (!v) {
          await _patchAndReload(id, { membership_expires_at: null });
          return;
        }
        // ISO datetime — 23:59:59 으로 그날 끝까지
        const iso = new Date(v + 'T23:59:59').toISOString();
        await _patchAndReload(id, { membership_expires_at: iso });
      });
    }
  }

  function _bindActions(id, name) {
    const sheet = document.getElementById('customerDashSheet');
    if (!sheet) return;
    sheet.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        if (act === 'edit') {
          closeCustomerDashboard();
          if (typeof window.editCustomer === 'function') {
            window.editCustomer(id);
          } else if (typeof window.openCustomers === 'function') {
            window.openCustomers();
          }
        } else if (act === 'booking') {
          closeCustomerDashboard();
          // 2026-05-01 ── openBooking 안 보임. openCalendarView 가 진짜 진입점.
          // 고객 prefill 위해 _pendingBookingCustomer 세팅 후 호출.
          window._pendingBookingCustomer = { id, name };
          if (typeof window.openCalendarView === 'function') window.openCalendarView();
          else if (typeof window.openBooking === 'function') window.openBooking();
        } else if (act === 'nps') {
          closeCustomerDashboard();
          if (typeof window.openNps === 'function') window.openNps();
        } else if (act === 'ms-topup') {
          // 2026-05-01 ── 고객 dashboard 닫고 회원권 시트 열기 (이전: 안 닫음 → 시트가 dashboard 뒤에).
          closeCustomerDashboard();
          if (window.MembershipUI && typeof window.MembershipUI.openTopupSheet === 'function') {
            const cid = parseInt(btn.dataset.custId, 10);
            window.MembershipUI.openTopupSheet(cid, btn.dataset.custName || '');
          }
        } else if (act === 'ms-use') {
          closeCustomerDashboard();
          if (window.MembershipUI && typeof window.MembershipUI.openUseSheet === 'function') {
            const cid = parseInt(btn.dataset.custId, 10);
            const bal = parseInt(btn.dataset.custBal || '0', 10);
            window.MembershipUI.openUseSheet(cid, btn.dataset.custName || '', bal);
          }
        }
      });
    });
  }

  // 현재 열려 있는 고객 id 기억 (data-changed 이벤트 시 재로드용)
  let _currentCustomerId = null;

  // ── [v208] v4 디테일 (목업 mockup-customer-v4.html 이식) ─────
  function _visitBadgeClass(vc) {
    if (vc >= 10) return 'b3';
    if (vc >= 3)  return 'b2';
    return 'b1';
  }
  function _topService(rows) {
    if (!Array.isArray(rows) || !rows.length) return null;
    const count = {};
    rows.forEach(r => {
      const n = (r && r.service_name) ? String(r.service_name).trim() : '';
      if (n) count[n] = (count[n] || 0) + 1;
    });
    let best = null, bestCount = 0;
    for (const k in count) { if (count[k] > bestCount) { best = k; bestCount = count[k]; } }
    return best;
  }
  function _nextExpectedDate(stats, customer) {
    const lastIso = stats && stats.last_visit_at;
    const avgDays = (customer && +customer.avg_cycle_weeks > 0)
      ? Math.round(+customer.avg_cycle_weeks * 7)
      : null;
    if (!lastIso || !avgDays) return null;
    try {
      const d = new Date(lastIso);
      d.setDate(d.getDate() + avgDays);
      return (d.getMonth() + 1) + '/' + d.getDate();
    } catch (_e) { return null; }
  }
  function _buildDetailHTMLv4(d) {
    const c = (d && d.customer) || {};
    const stats = (d && d.stats) || {};
    const revenues = (d && d.recent_revenues) || [];
    const vc = Number(stats.visit_count || c.visit_count || 0);
    const totalRev = Number(stats.total_revenue || 0);
    const totalMan = totalRev > 0 ? Math.round(totalRev / 10000) : 0;
    const avgDays = (c.avg_cycle_weeks ? Math.round(+c.avg_cycle_weeks * 7) : 0)
      || (d.retention && d.retention.avg_interval_days)
      || 0;
    const badge = _visitBadgeClass(vc);
    const phone = c.phone ? _esc(c.phone) : '';
    const nextDate = _nextExpectedDate(stats, c);
    const nudge = nextDate
      ? `<div class="nudge"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#E5586E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-right:6px"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="M19 13l.75 2.25L22 16l-2.25.75L19 19l-.75-2.25L16 16l2.25-.75L19 13z"/><path d="M5 17l.5 1.5L7 19l-1.5.5L5 21l-.5-1.5L3 19l1.5-.5L5 17z"/></svg> 잇쁜이 다음 방문일 예상: ${_esc(nextDate)}</div>`
      : '';
    const top = _topService(revenues);
    const pref = top ? `<div class="d-sec"><span>선호 시술</span></div><div class="d-pref">${_esc(top)}</div>` : '';
    const vrRows = revenues.slice(0, 5).map(r => {
      const dt = String(r.recorded_at || '').slice(5, 10).replace('-', '/');
      const amt = Number(r.amount) || 0;
      const man = amt > 0 ? Math.round(amt / 10000) + '만' : '-';
      return `<div class="vr"><div class="vr-d">${_esc(dt)}</div><div class="vr-s">${_esc(r.service_name || '시술')}</div><div class="vr-p">${man}</div></div>`;
    }).join('');
    const vrHidden = revenues.slice(5, 20).map(r => {
      const dt = String(r.recorded_at || '').slice(5, 10).replace('-', '/');
      const amt = Number(r.amount) || 0;
      const man = amt > 0 ? Math.round(amt / 10000) + '만' : '-';
      return `<div class="vr hidden"><div class="vr-d">${_esc(dt)}</div><div class="vr-s">${_esc(r.service_name || '시술')}</div><div class="vr-p">${man}</div></div>`;
    }).join('');
    const moreLink = revenues.length > 5
      ? `<span class="d-sec-link" data-cv4-act="toggle-more">더보기</span>`
      : '';
    const memo = c.memo ? `<div class="d-sec"><span>메모</span></div><div class="memo">${_esc(c.memo)}</div>` : '';

    return `
      <div class="cv4-detail">
        <div class="d-header">
          <div class="d-name-row">
            <div style="display:flex;align-items:center;">
              <div class="d-name">${_esc(c.name || '손님')} 님</div>
              <span class="d-badge-lg c-badge ${badge}">${vc}회 방문</span>
            </div>
          </div>
          ${phone ? `<div class="d-phone">${phone}</div>` : ''}
          <div class="d-actions">
            <button class="d-act primary" data-cv4-act="booking">예약 잡기</button>
            ${phone ? `<button class="d-act ghost" data-cv4-act="call">전화</button>` : ''}
            <button class="d-act danger" data-cv4-act="delete">삭제</button>
          </div>
        </div>
        ${nudge}
        <div class="d-cards">
          <div class="dc"><div class="dc-v">${vc}<small>회</small></div><div class="dc-l">총 방문일</div></div>
          <div class="dc"><div class="dc-v">${totalMan}<small>만</small></div><div class="dc-l">총 매출</div></div>
          <div class="dc"><div class="dc-v">${avgDays || '—'}<small>${avgDays ? '일' : ''}</small></div><div class="dc-l">평균 재방문 일</div></div>
        </div>
        ${pref}
        ${revenues.length ? `
        <div class="d-sec"><span>시술 기록</span>${moreLink}</div>
        <div class="vr-wrap">${vrRows}${vrHidden}</div>` : ''}
        ${memo}
      </div>
    `;
  }
  function _bindDetailV4(scopeEl, d) {
    if (!scopeEl) return;
    const c = (d && d.customer) || {};
    scopeEl.querySelectorAll('[data-cv4-act]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const act = btn.dataset.cv4Act;
        if (act === 'booking') {
          // 모바일 시트면 닫고 캘린더 진입. PC 한 화면 분할이면 그대로.
          if (document.getElementById('customerDashSheet')?.style.display === 'flex') {
            closeCustomerDashboard();
          }
          window._pendingBookingCustomer = { id: c.id, name: c.name };
          if (typeof window.openCalendarView === 'function') window.openCalendarView();
          else if (typeof window.openBooking === 'function') window.openBooking();
        } else if (act === 'call') {
          if (c.phone) window.location.href = 'tel:' + String(c.phone).replace(/[^0-9+]/g, '');
        } else if (act === 'delete') {
          if (typeof window.deleteCustomer === 'function') {
            window.deleteCustomer(c.id, c.name);
          } else if (window.confirm('이 고객을 삭제할까요? 매출 기록은 보존됩니다.')) {
            // 백업 — Customer.remove 직접 호출
            (window.Customer && window.Customer.remove ? window.Customer.remove(c.id) : Promise.resolve())
              .then(() => {
                if (window.showToast) window.showToast('삭제됐어요');
                closeCustomerDashboard();
                if (typeof window._rerenderCustomerList === 'function') window._rerenderCustomerList();
              })
              .catch(() => { if (window.showToast) window.showToast('삭제 실패'); });
          }
        } else if (act === 'toggle-more') {
          scopeEl.querySelectorAll('.vr.hidden').forEach(el => el.classList.toggle('hidden'));
          btn.textContent = btn.textContent === '더보기' ? '접기' : '더보기';
        }
      });
    });
  }
  window._renderCustomerDetail = async function (mountEl, customerId) {
    if (!mountEl || !customerId) return;
    mountEl.innerHTML = '<div style="padding:40px 20px;text-align:center;color:#888;font-size:13px;">불러오는 중…</div>';
    try {
      const d = await _apiGet('/customers/' + customerId + '/dashboard');
      mountEl.innerHTML = _buildDetailHTMLv4(d);
      _bindDetailV4(mountEl, d);
    } catch (e) {
      // 폴백 — /customers/{id} 만 받아서 최소 정보 표시
      try {
        const cust = await _apiGet('/customers/' + customerId);
        mountEl.innerHTML = _buildDetailHTMLv4({ customer: cust, stats: {}, recent_revenues: [] });
        _bindDetailV4(mountEl, { customer: cust, stats: {}, recent_revenues: [] });
        if (typeof window.showToast === 'function') window.showToast('기본 정보로 표시 중이에요');
      } catch (_) {
        mountEl.innerHTML = `<div style="padding:40px 20px;text-align:center;color:#c00;font-size:13px;">불러오기 실패<br><span style="color:#888;font-size:11px;">${_esc(e?.message || '네트워크 오류')}</span></div>`;
      }
    }
  };

  window.openCustomerDashboard = async function (id) {
    if (!id) return;
    _currentCustomerId = id;
    _ensureSheet();
    const sheet = document.getElementById('customerDashSheet');
    sheet.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    const body = sheet.querySelector('#cdBody');

    // id 형식 검증 — 비어있거나 숫자/문자열 아니면 안내. 백엔드는 정수 PK 사용.
    if (id == null || (typeof id !== 'number' && typeof id !== 'string') || String(id).trim() === '') {
      console.warn('[customer-dashboard] invalid id:', id);
      body.innerHTML = `
        <div style="padding:40px 20px;text-align:center;">
          <div style="font-size:13px;color:#c00;">손님 정보를 찾을 수 없어요</div>
          <div style="font-size:11px;color:#888;margin-top:4px;">잘못된 손님 식별자입니다.</div>
        </div>
      `;
      return;
    }
    // [v208] 디테일 내용은 v4 마크업으로 공통 (PC 한 화면 분할도 같은 _renderCustomerDetail 사용)
    await window._renderCustomerDetail(body, id);
  };

  window.closeCustomerDashboard = function () {
    const sheet = document.getElementById('customerDashSheet');
    if (sheet) sheet.style.display = 'none';
    document.body.style.overflow = '';
    _currentCustomerId = null;
  };

  // Wave D3 (2026-04-24) — 챗봇·외부 데이터 변경 감지 → 고객 상세 대시보드 재로드
  // customer_id 지정 없어도 전체 영향 가능 (매출/예약/NPS 는 고객 dashboard 의 stats 에 영향)
  if (typeof window !== 'undefined' && !window._customerDashboardDataListenerInit) {
    window._customerDashboardDataListenerInit = true;
    window.addEventListener('itdasy:data-changed', async (e) => {
      if (!_currentCustomerId) return;
      const k = (e && e.detail && e.detail.kind) || '';
      if (!k) return;
      const affects = ['update_customer', 'create_revenue', 'update_revenue', 'create_booking',
                       'update_booking', 'delete_booking', 'cancel_booking', 'reschedule_booking', 'create_nps'];
      if (!affects.includes(k)) return;
      const sheet = document.getElementById('customerDashSheet');
      if (!sheet || sheet.style.display === 'none') return;
      try {
        // 현재 열린 dashboard 다시 로드
        await window.openCustomerDashboard(_currentCustomerId);
      } catch (_err) { void _err; }
    });
  }
})();
