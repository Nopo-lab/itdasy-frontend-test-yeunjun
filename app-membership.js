/* 회원권 / 정기권 관리 — Premium 차별화 (W5 팅커뷰 흡수)
   사용:
     window.MembershipUI.openTopupSheet(customerId, customerName)
     window.MembershipUI.openUseSheet(customerId, customerName)
     window.MembershipUI.openExpiringList()
*/
(function () {
  'use strict';

  const API = window.API || '';

  function _fetch(method, path, body) {
    const headers = window.authHeader ? window.authHeader() : {};
    if (body) headers['Content-Type'] = 'application/json';
    return fetch(API + path, {
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

  function _krw(n) {
    return Number(n || 0).toLocaleString('ko-KR') + '원';
  }

  function _ensureSheet() {
    let el = document.getElementById('membershipSheet');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'membershipSheet';
    el.className = 'sheet-overlay';
    el.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9000;align-items:flex-end;justify-content:center;';
    el.innerHTML = `
      <div class="sheet-body" style="background:var(--bg-1,#fff);width:100%;max-width:480px;border-radius:18px 18px 0 0;padding:18px 18px env(safe-area-inset-bottom,16px);max-height:85vh;overflow:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <h3 id="msTitle" style="font-size:17px;font-weight:700;margin:0;">회원권</h3>
          <button id="msClose" style="background:none;border:none;font-size:24px;cursor:pointer;line-height:1;">×</button>
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
      const items = r.items || [];
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
          <div style="font-size:13px;font-weight:700;color:${color};">${sign}${_krw(it.amount || 0)}</div>
        </div>`;
      }).join('');
      container.innerHTML = `
        <div style="font-size:12px;color:#888;font-weight:600;margin-bottom:6px;">최근 내역</div>
        <div style="background:#FAFAFA;border-radius:10px;padding:6px 10px;">${rows}</div>
      `;
    } catch (_e) {
      container.innerHTML = '<div style="font-size:12px;color:#888;text-align:center;padding:10px;">내역을 불러올 수 없어요.</div>';
    }
  }

  function _open(title, htmlBody) {
    const sheet = _ensureSheet();
    sheet.querySelector('#msTitle').textContent = title;
    sheet.querySelector('#msBody').innerHTML = htmlBody;
    sheet.style.display = 'flex';
  }

  // ── 충전 시트 ───────────────────────────────────────────────
  function openTopupSheet(customerId, customerName) {
    const html = `
      <div style="margin-bottom:14px;color:var(--text-2,#666);font-size:13px;">${customerName || '고객'}님 회원권 충전</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;">
        ${[30000, 50000, 100000, 200000, 300000, 500000].map(amt => `
          <button class="ms-quick-btn" data-amt="${amt}" style="padding:14px 6px;border-radius:10px;border:1px solid var(--border,#e5e5e5);background:var(--bg-2,#fafafa);font-weight:700;font-size:13px;cursor:pointer;">${_krw(amt)}</button>
        `).join('')}
      </div>
      <div style="margin-bottom:14px;">
        <input id="msAmount" type="number" inputmode="numeric" placeholder="직접 입력 (원)" min="1000" step="1000" style="width:100%;padding:14px;border:1px solid var(--border,#e5e5e5);border-radius:10px;font-size:15px;">
      </div>
      <div style="margin-bottom:14px;">
        <select id="msMethod" style="width:100%;padding:12px;border:1px solid var(--border,#e5e5e5);border-radius:10px;font-size:14px;">
          <option value="card">카드</option>
          <option value="cash">현금</option>
          <option value="transfer">계좌이체</option>
        </select>
      </div>
      <button id="msConfirm" style="width:100%;padding:16px;background:linear-gradient(135deg,var(--brand),#FFA8B6);color:#fff;border:none;border-radius:12px;font-weight:700;font-size:15px;cursor:pointer;">충전하기</button>
      <!-- [2026-04-29 B4] 최근 사용 history -->
      <div id="msHistoryWrap" style="margin-top:18px;"></div>
    `;
    _open('💳 회원권 충전', html);
    const sheet = document.getElementById('membershipSheet');
    sheet.querySelectorAll('.ms-quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        sheet.querySelector('#msAmount').value = btn.dataset.amt;
      });
    });
    _loadHistory(customerId, sheet.querySelector('#msHistoryWrap'));
    sheet.querySelector('#msConfirm').addEventListener('click', async () => {
      const amount = parseInt(sheet.querySelector('#msAmount').value, 10);
      const method = sheet.querySelector('#msMethod').value;
      if (!amount || amount < 1000) {
        _toast('충전 금액을 입력해주세요 (1,000원 이상)', { error: true });
        return;
      }
      try {
        const r = await _fetch('POST', '/memberships/topup', {
          customer_id: customerId,
          amount,
          payment_method: method,
          record_revenue: true,
        });
        // [2026-04-29] 충전 성공 — 큰 confetti
        if (window.Fun && window.Fun.celebrate) {
          window.Fun.celebrate(`💳 ${customerName}님 +${_krw(amount)} (잔액 ${_krw(r.membership_balance)})`, {
            emojis: ['💳', '✨', '💖', '🌷'], count: 16,
          });
        } else {
          _toast(`충전 완료! 잔액 ${_krw(r.membership_balance)}`);
        }
        sheet.style.display = 'none';
        try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'membership_topup' } })); } catch (_) { void 0; }
      } catch (e) {
        _toast('충전 실패: ' + e.message, { error: true });
      }
    });
  }

  // ── 사용 시트 ───────────────────────────────────────────────
  function openUseSheet(customerId, customerName, currentBalance) {
    const balanceTxt = currentBalance != null ? `현재 잔액 ${_krw(currentBalance)}` : '';
    const html = `
      <div style="margin-bottom:14px;color:var(--text-2,#666);font-size:13px;">${customerName || '고객'}님 회원권 사용 · ${balanceTxt}</div>
      <div style="margin-bottom:14px;">
        <input id="msUseAmount" type="number" inputmode="numeric" placeholder="차감 금액 (원)" min="1000" step="1000" style="width:100%;padding:14px;border:1px solid var(--border,#e5e5e5);border-radius:10px;font-size:15px;">
      </div>
      <div style="margin-bottom:14px;">
        <input id="msUseService" type="text" placeholder="시술명 (선택)" style="width:100%;padding:12px;border:1px solid var(--border,#e5e5e5);border-radius:10px;font-size:14px;">
      </div>
      <button id="msUseConfirm" style="width:100%;padding:16px;background:linear-gradient(135deg,#0288D1,#03A9F4);color:#fff;border:none;border-radius:12px;font-weight:700;font-size:15px;cursor:pointer;">차감하기</button>
      <!-- [2026-04-29 B4] 최근 사용 history -->
      <div id="msHistoryWrap" style="margin-top:18px;"></div>
    `;
    _open('💳 회원권 사용', html);
    const sheet = document.getElementById('membershipSheet');
    _loadHistory(customerId, sheet.querySelector('#msHistoryWrap'));
    sheet.querySelector('#msUseConfirm').addEventListener('click', async () => {
      const amount = parseInt(sheet.querySelector('#msUseAmount').value, 10);
      const svc = sheet.querySelector('#msUseService').value.trim();
      if (!amount || amount < 1000) {
        _toast('차감 금액을 입력해주세요', { error: true });
        return;
      }
      try {
        const r = await _fetch('POST', '/memberships/use', {
          customer_id: customerId,
          amount,
          service_name: svc || null,
        });
        _toast(`사용 완료! 잔액 ${_krw(r.membership_balance)}`);
        sheet.style.display = 'none';
        // [2026-04-29] 잔액 부족 경고 토스트 (백엔드가 warning 필드 반환)
        if (r.warning) {
          setTimeout(() => _toast(r.warning, { error: true }), 800);
        }
        try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'membership_use' } })); } catch (_) { void 0; }
      } catch (e) {
        _toast('차감 실패: ' + e.message, { error: true });
      }
    });
  }

  // ── 만료 임박 리스트 ────────────────────────────────────────
  async function openExpiringList(days) {
    days = days || 30;
    _open('💳 회원권 만료 임박', `<div style="text-align:center;padding:40px 0;color:var(--text-2,#666);">불러오는 중…</div>`);
    try {
      const r = await _fetch('GET', '/memberships/expiring?days=' + days);
      const items = r.items || [];
      const sheet = document.getElementById('membershipSheet');
      if (!items.length) {
        sheet.querySelector('#msBody').innerHTML = `<div style="text-align:center;padding:40px 0;color:var(--text-2,#666);">${days}일 이내 만료되는 회원권이 없어요 👍</div>`;
        return;
      }
      const list = items.map(it => `
        <div style="padding:14px;border:1px solid var(--border,#e5e5e5);border-radius:10px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:700;font-size:15px;">${(it.name || '').replace(/[<>&"]/g,'')}</div>
            <div style="color:var(--text-2,#666);font-size:12px;margin-top:3px;">잔액 ${_krw(it.membership_balance)} · ${it.days_until_expire ?? '-'}일 후 만료</div>
          </div>
          <button class="ms-row-topup" data-id="${it.customer_id}" data-name="${(it.name || '').replace(/[<>&"]/g,'')}" style="padding:8px 14px;background:var(--brand);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">충전 안내</button>
        </div>
      `).join('');
      sheet.querySelector('#msBody').innerHTML = list;
      sheet.querySelectorAll('.ms-row-topup').forEach(btn => {
        btn.addEventListener('click', () => {
          openTopupSheet(parseInt(btn.dataset.id, 10), btn.dataset.name);
        });
      });
    } catch (e) {
      const sheet = document.getElementById('membershipSheet');
      sheet.querySelector('#msBody').innerHTML = `<div style="text-align:center;padding:40px 0;color:#dc3545;">불러오기 실패: ${e.message}</div>`;
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
