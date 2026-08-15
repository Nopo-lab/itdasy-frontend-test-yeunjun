/* 회원권 / 정기권 관리 — Premium 차별화 (W5 팅커뷰 흡수)
   사용:
     window.MembershipUI.openTopupSheet(customerId, customerName)
     window.MembershipUI.openUseSheet(customerId, customerName)
     window.MembershipUI.openExpiringList()
*/
(function () {
  'use strict';

  function _fetch(method, path, body) {
    const headers = window.authHeader ? window.authHeader() : {};
    if (body) headers['Content-Type'] = 'application/json';
    return apiFetch(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.detail || ('HTTP ' + r.status));
      return data;
    });
  }

  function _toast(msg, opts) {
    if (typeof window.showToast === 'function') window.showToast(msg, opts);
  }

  // [2026-05-19] _krw 삭제 → formatMoney (format-money.js 공통 유틸)

  function _ensureSheet() {
    let el = document.getElementById('membershipSheet');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'membershipSheet';
    el.className = 'sheet-overlay';
    el.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9000;align-items:flex-end;justify-content:center;';
    el.innerHTML = `
      <style>
        #membershipSheet .ms-cta:active { transform: scale(.985); }
        #membershipSheet .ms-quick-btn[data-on="1"] { border-color: var(--brand); background: var(--brand-bg); color: var(--brand-strong); }
      </style>
      <div class="sheet-body" style="background:var(--bg-1,#fff);width:100%;max-width:480px;border-radius:var(--r-xl,28px) var(--r-xl,28px) 0 0;padding:12px 18px var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 16px));max-height:85vh;overflow:auto;">
        <div style="display:flex;justify-content:center;margin-bottom:14px;"><div style="width:40px;height:4px;border-radius:2px;background:#D1D6DB;"></div></div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
          <div style="width:36px;height:36px;border-radius:12px;background:var(--brand-bg);color:var(--brand-strong);display:flex;align-items:center;justify-content:center;flex:0 0 36px;">
            <svg width="18" height="18" aria-hidden="true"><use href="#ic-credit-card"/></svg>
          </div>
          <div style="flex:1;min-width:0;">
            <h3 id="msTitle" style="font-size:17px;font-weight:800;margin:0;">회원권</h3>
            <div id="msSub" style="font-size:12.5px;color:var(--text-subtle);margin-top:2px;"></div>
          </div>
          <button id="msClose" style="background:none;border:none;font-size:24px;cursor:pointer;line-height:1;color:var(--text-subtle);">×</button>
        </div>
        <div id="msBody"></div>
      </div>
    `;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.id === 'msClose') {
        el.style.display = 'none';
      }
    });
    return el;
  }

  // [2026-04-29 B4] 회원권 충전/사용 history
  async function _loadHistory(customerId, container) {
    if (!container || !customerId) return;
    container.innerHTML = '<div style="font-size:12px;color:#888;text-align:center;padding:8px;">최근 내역 불러오는 중…</div>';
    try {
      const r = await _fetch('GET', `/memberships/${customerId}/history?limit=8`);
      const items = r.history || r.items || [];   // [2026-07-22 fix] BE는 {history:[]} 반환 — 키 불일치로 항상 빈칸이던 버그
      if (!items.length) {
        container.innerHTML = '<div style="font-size:12px;color:#888;text-align:center;padding:10px;">아직 내역이 없어요.</div>';
        return;
      }
      const rows = items.map(it => {
        const isUse = it.kind === 'use';
        const sign = isUse ? '−' : '+';
        const color = isUse ? '#0288D1' : 'var(--brand)';
        const dt = (it.recorded_at || '').replace('T', ' ').slice(5, 16);
        const svc = it.service_name ? ` · ${(it.service_name + '').replace(/[<>&"]/g,'')}` : '';
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 4px;border-bottom:1px solid #f3f3f3;">
          <div style="font-size:12px;color:#444;">${dt}${svc}</div>
          <!-- [출시감사 2026-08-01] display_amount 우선 — 사용 기록은 회계상 amount=0(충전 때 이미
               매출로 잡힘)이라 그대로 찍으면 이력이 전부 "−0원" 으로 보였다. 원장님이 "이 손님
               얼마나 썼지?" 를 확인할 수 없고 손님이 잔액을 따지면 근거를 못 댔다.
               백엔드가 memo 에서 실제 차감액을 뽑아 display_amount 로 내려준다.
               (옛 백엔드면 undefined → amount 폴백이라 하위호환) -->
          <div style="font-size:13px;font-weight:700;color:${color};">${sign}${formatMoney(it.display_amount != null ? it.display_amount : (it.amount || 0))}</div>
        </div>`;
      }).join('');
      container.innerHTML = `
        <div style="font-size:12px;color:var(--text-subtle,#888);font-weight:600;margin-bottom:6px;">최근 내역</div>
        <div style="background:var(--bg-2,#FAFAFA);border-radius:var(--r-md,14px);padding:6px 10px;">${rows}</div>
      `;
    } catch (_e) {
      container.innerHTML = '<div style="font-size:12px;color:#888;text-align:center;padding:10px;">내역을 불러올 수 없어요.</div>';
    }
  }

  function _open(title, htmlBody, sub) {
    const sheet = _ensureSheet();
    sheet.querySelector('#msTitle').textContent = title;
    const subEl = sheet.querySelector('#msSub');
    subEl.textContent = sub || '';
    subEl.style.display = sub ? 'block' : 'none';
    sheet.querySelector('#msBody').innerHTML = htmlBody;
    sheet.style.display = 'flex';
  }

  // ── 충전 시트 ───────────────────────────────────────────────
  function openTopupSheet(customerId, customerName) {
    const html = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;">
        ${[30000, 50000, 100000, 200000, 300000, 500000].map(amt => `
          <button class="ms-quick-btn" data-amt="${amt}" style="padding:14px 6px;border-radius:var(--r-md,14px);border:1.5px solid var(--border,#e5e5e5);background:transparent;font-weight:700;font-size:13px;cursor:pointer;transition:background .12s,border-color .12s;">${formatMoney(amt)}</button>
        `).join('')}
      </div>
      <div style="margin-bottom:14px;">
        <input id="msAmount" type="number" inputmode="numeric" placeholder="직접 입력 (원)" min="1000" step="1000" style="width:100%;padding:14px;border:1.5px solid var(--border,#e5e5e5);border-radius:var(--r-md,14px);font-size:15px;">
      </div>
      <div style="margin-bottom:14px;">
        <select id="msMethod" style="width:100%;padding:12px;border:1.5px solid var(--border,#e5e5e5);border-radius:var(--r-md,14px);font-size:14px;">
          <option value="card">카드</option>
          <option value="cash">현금</option>
          <option value="transfer">계좌이체</option>
        </select>
      </div>
      <button id="msConfirm" class="ms-cta" style="width:100%;height:54px;background:var(--brand);color:#fff;border:none;border-radius:var(--r-md,14px);font-weight:700;font-size:15px;cursor:pointer;transition:transform .12s;">충전하기</button>
      <!-- [2026-04-29 B4] 최근 사용 history -->
      <div id="msHistoryWrap" style="margin-top:18px;"></div>
    `;
    _open('회원권 충전', html, `${customerName || '고객'}님 회원권 충전`);
    const sheet = document.getElementById('membershipSheet');
    sheet.querySelectorAll('.ms-quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        sheet.querySelector('#msAmount').value = btn.dataset.amt;
        sheet.querySelectorAll('.ms-quick-btn').forEach(b => { b.dataset.on = (b === btn) ? '1' : ''; });
      });
    });
    _loadHistory(customerId, sheet.querySelector('#msHistoryWrap'));
    sheet.querySelector('#msConfirm').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      if (btn.disabled) return; // [2026-07-14 QA] 연타 중복 충전 방지
      const amount = parseInt(sheet.querySelector('#msAmount').value, 10);
      const method = sheet.querySelector('#msMethod').value;
      if (!amount || amount < 1000) {
        _toast('충전 금액을 입력해주세요 (1,000원 이상)', { error: true });
        return;
      }
      btn.disabled = true;
      try {
        const r = await _fetch('POST', '/memberships/topup', {
          customer_id: customerId,
          amount,
          payment_method: method,
          record_revenue: true,
        });
        // [2026-04-29] 충전 성공 — 큰 confetti
        if (window.Fun && window.Fun.celebrate) {
          window.Fun.celebrate(`${customerName}님 +${formatMoney(amount)} (잔액 ${formatMoney(r.membership_balance)})`, {
            emojis: ['✨', '💖', '🌷'], count: 16,
          });
        } else {
          _toast(`충전 완료! 잔액 ${formatMoney(r.membership_balance)}`);
        }
        sheet.style.display = 'none';
        try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'membership_topup' } })); } catch (_) { void 0; }
      } catch (e) {
        _toast('충전 실패: ' + e.message, { error: true });
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ── 사용 시트 ───────────────────────────────────────────────
  function openUseSheet(customerId, customerName, currentBalance) {
    const balanceTxt = currentBalance != null ? `현재 잔액 ${formatMoney(currentBalance)}` : '';
    const html = `
      <div style="margin-bottom:14px;">
        <input id="msUseAmount" type="number" inputmode="numeric" placeholder="차감 금액 (원)" min="1000" step="1000" style="width:100%;padding:14px;border:1.5px solid var(--border,#e5e5e5);border-radius:var(--r-md,14px);font-size:15px;">
      </div>
      <div style="margin-bottom:14px;">
        <input id="msUseService" type="text" placeholder="시술명 (선택)" style="width:100%;padding:12px;border:1.5px solid var(--border,#e5e5e5);border-radius:var(--r-md,14px);font-size:14px;">
      </div>
      <button id="msUseConfirm" class="ms-cta" style="width:100%;height:54px;background:var(--brand);color:#fff;border:none;border-radius:var(--r-md,14px);font-weight:700;font-size:15px;cursor:pointer;transition:transform .12s;">차감하기</button>
      <!-- [2026-04-29 B4] 최근 사용 history -->
      <div id="msHistoryWrap" style="margin-top:18px;"></div>
    `;
    _open('회원권 사용', html, `${customerName || '고객'}님${balanceTxt ? ' · ' + balanceTxt : ''}`);
    const sheet = document.getElementById('membershipSheet');
    _loadHistory(customerId, sheet.querySelector('#msHistoryWrap'));
    sheet.querySelector('#msUseConfirm').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      if (btn.disabled) return; // [2026-07-14 QA] 연타 중복 차감 방지
      const amount = parseInt(sheet.querySelector('#msUseAmount').value, 10);
      const svc = sheet.querySelector('#msUseService').value.trim();
      if (!amount || amount < 1000) {
        _toast('차감 금액을 입력해주세요', { error: true });
        return;
      }
      btn.disabled = true;
      try {
        const r = await _fetch('POST', '/memberships/use', {
          customer_id: customerId,
          amount,
          service_name: svc || null,
        });
        _toast(`사용 완료! 잔액 ${formatMoney(r.membership_balance)}`);
        sheet.style.display = 'none';
        // [2026-04-29] 잔액 부족 경고 토스트 (백엔드가 warning 필드 반환)
        if (r.warning) {
          setTimeout(() => _toast(r.warning, { error: true }), 800);
        }
        try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'membership_use' } })); } catch (_) { void 0; }
      } catch (e) {
        _toast('차감 실패: ' + e.message, { error: true });
        btn.disabled = false;   // [2026-07-22 fix] 실패 시 재활성화 — 안 하면 버튼 영구 잠김(충전 시트엔 있던 로직)
      }
    });
  }

  // ── 만료 임박 리스트 ────────────────────────────────────────
  async function openExpiringList(days) {
    days = days || 30;
    _open('회원권 만료 관리', `<div style="text-align:center;padding:40px 0;color:var(--text-2,#666);">불러오는 중…</div>`, `이미 만료됨 + ${days}일 이내 만료 예정`);
    try {
      const r = await _fetch('GET', '/memberships/expiring?days=' + days);
      const items = r.items || [];
      const sheet = document.getElementById('membershipSheet');
      if (!items.length) {
        sheet.querySelector('#msBody').innerHTML = `<div style="text-align:center;padding:40px 0;color:var(--text-2,#666);">만료됐거나 ${days}일 이내 만료되는 회원권이 없어요</div>`;
        return;
      }
      // [회원권감사 2026-08-05] 이미 만료된 회원권이 "0일 후 만료" 로 떴다.
      //   `days_until_expire` 가 max(0,..) 라 열흘 전에 끝난 것도 0 이었다(실측).
      //   원장님이 그 명단 보고 "곧 만료돼요" 라고 연락하면 손님은 "이미 끝났다는데요?" 가 된다.
      //   서버가 이제 `is_expired` 와 음수 일수를 준다 — 화면도 나눠서 보여준다.
      const _dayLabel = (it) => {
        const d = it.days_until_expire;
        if (it.is_expired) return `<span style="color:var(--danger,#E5484D);font-weight:700;">만료됨${typeof d === 'number' && d < 0 ? ` (${Math.abs(d)}일 지남)` : ''}</span>`;
        if (typeof d !== 'number') return '만료일 미정';
        return d === 0 ? '오늘 만료' : `${d}일 후 만료`;
      };
      const list = items.map(it => `
        <div style="padding:14px;border:1.5px solid ${it.is_expired ? 'var(--danger,#E5484D)' : 'var(--border,#e5e5e5)'};border-radius:var(--r-md,14px);margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:700;font-size:15px;">${(it.name || '').replace(/[<>&"]/g,'')}</div>
            <div style="color:var(--text-2,#666);font-size:12px;margin-top:3px;">잔액 ${formatMoney(it.membership_balance)} · ${_dayLabel(it)}</div>
            ${it.is_expired ? '<div style="color:var(--text-2,#666);font-size:11px;margin-top:3px;">잔액은 남아 있어요. 충전하면 1년 연장되고, 해지하면 환불로 정산돼요.</div>' : ''}
          </div>
          <div style="display:flex;gap:6px;flex:none;">
            <button class="ms-row-topup" data-id="${it.customer_id}" data-name="${(it.name || '').replace(/[<>&"]/g,'')}" style="min-height:44px;padding:8px 14px;background:var(--brand);color:#fff;border:none;border-radius:var(--r-pill,999px);font-size:12px;font-weight:700;cursor:pointer;">${it.is_expired ? '재충전' : '충전 안내'}</button>
            ${it.is_expired && it.membership_balance > 0 ? `<button class="ms-row-settle" data-id="${it.customer_id}" data-name="${(it.name || '').replace(/[<>&"]/g,'')}" data-bal="${it.membership_balance}" style="min-height:44px;padding:8px 12px;background:transparent;color:var(--danger,#E5484D);border:1.5px solid var(--danger,#E5484D);border-radius:var(--r-pill,999px);font-size:12px;font-weight:700;cursor:pointer;">환불 정산</button>` : ''}
          </div>
        </div>
      `).join('');
      const _hdr = (r.expired_count || 0) > 0
        ? `<div style="padding:10px 12px;margin-bottom:10px;border-radius:12px;background:var(--surface-2,#F7F8FA);font-size:12px;color:var(--text);">이미 만료 <b>${r.expired_count}명</b> · 곧 만료 <b>${r.expiring_soon_count || 0}명</b></div>`
        : '';
      sheet.querySelector('#msBody').innerHTML = _hdr + list;
      // [회원권감사 2026-08-05] 해지(정산) 진입점 — `POST /memberships/cancel` 은 백엔드에
      //   예전부터 있었는데 **프론트·잇비 어디서도 부르지 않았다**(호출처 0건).
      //   그래서 만료된 회원권의 잔액을 끝낼 방법이 화면에 없었다. 위 안내문("해지하면
      //   환불로 정산돼요")이 실행 가능하려면 여기서 부를 수 있어야 한다.
      sheet.querySelectorAll('.ms-row-settle').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (btn.dataset.busy === '1') return;
          const bal = Number(btn.dataset.bal) || 0;
          const ok = window.confirm(
            `${btn.dataset.name}님 회원권을 정산할까요?\n\n남은 잔액 ${formatMoney(bal)}을 환불로 기록하고 회원권을 종료해요.\n장부에 환불 내역이 남습니다.`
          );
          if (!ok) return;
          btn.dataset.busy = '1'; btn.disabled = true; btn.textContent = '정산 중…';
          try {
            await _fetch('POST', '/memberships/cancel/' + btn.dataset.id);
            if (window.showToast) window.showToast(`${btn.dataset.name}님 회원권 정산 완료 (환불 ${formatMoney(bal)})`);
            openExpiringList(days);
          } catch (e) {
            console.warn('[membership] 정산 실패', e);
            if (window.showToast) window.showToast('정산 실패 — 잠시 후 다시 시도해 주세요');
            btn.dataset.busy = '0'; btn.disabled = false; btn.textContent = '환불 정산';
          }
        });
      });
      sheet.querySelectorAll('.ms-row-topup').forEach(btn => {
        btn.addEventListener('click', () => {
          openTopupSheet(parseInt(btn.dataset.id, 10), btn.dataset.name);
        });
      });
    } catch (e) {
      const sheet = document.getElementById('membershipSheet');
      sheet.querySelector('#msBody').innerHTML = `<div style="text-align:center;padding:40px 0;color:var(--danger);">불러오기 실패: ${e.message}</div>`;
    }
  }

  window.MembershipUI = {
    openTopupSheet,
    openUseSheet,
    openExpiringList,
  };
  // [2026-04-29 B1] 글로벌 진입점 통일 — 모든 곳에서 같은 함수 호출
  window.openMembershipCharge = function (customerId, customerName, currentBalance) {
    return openTopupSheet(customerId, customerName, currentBalance);
  };
  window.openMembershipUse = function (customerId, customerName, balance) {
    return openUseSheet(customerId, customerName, balance);
  };
  window.openMembershipExpiring = function (days) {
    return openExpiringList(days);
  };
})();
