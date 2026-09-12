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
      if (!r.ok) {
        // [돈감사 2026-09-07] status 를 실어 보낸다 — 아래 `_moneyError` 가
        //   "서버가 분명히 거절함(4xx)" 과 "결과를 모름(네트워크/5xx)" 을 갈라야 한다.
        const err = new Error(typeof data.detail === 'string' ? data.detail : ('HTTP ' + r.status));
        err.status = r.status;
        throw err;
      }
      return data;
    });
  }

  // ── 돈 오류 문구 (돈감사 2026-09-07) ─────────────────────────────
  //
  // 왜 고쳤나 — 전엔 무조건 `'충전 실패: ' + e.message` 였다. 실측(로컬 실서버,
  // 커밋 직후 응답만 유실시킴):
  //
  //     화면:  "충전 실패: Failed to fetch"
  //     서버:  membership_balance = 70,000원  (이미 커밋됨)
  //
  // 원장님은 안 된 줄 안다. 실제로는 들어갔다. 이 상황에서 "실패" 라고 단정하면
  // 원장님이 손님에게 "다시 결제해 주세요" 라고 말하게 된다.
  //
  // 🔑 돈은 **멱등키로** 이미 안전하다 — 같은 시도의 키는 성공할 때까지 재사용되므로
  //    같은 버튼을 다시 눌러도 두 번 반영되지 않는다(실측: 같은 키 재전송 → 잔액 그대로).
  //    그러니 문구도 사실대로 "모른다 + 다시 눌러도 안전하다" 여야 한다.
  const _MONEY_UNKNOWN = '처리 결과를 확인하고 있어요. 같은 버튼을 다시 눌러도 두 번 처리되지 않아요.';

  function _moneyError(e, verb) {
    const st = e && e.status;
    const msg = (e && e.message) || '';
    // 서버가 **분명히 거절**한 것들 — 돈은 움직이지 않았다. 사유를 그대로 전한다.
    if (st === 400) return { text: msg || (verb + '할 수 없어요.'), certain: true };
    if (st === 404) return { text: '고객을 찾을 수 없어요. 목록을 새로고침해 주세요.', certain: true };
    if (st === 422) return { text: '입력값을 다시 확인해 주세요.', certain: true };
    if (st === 401 || st === 403) return { text: '로그인이 만료됐어요. 다시 로그인해 주세요.', certain: true };
    if (st === 429) return { text: '요청이 잠깐 몰렸어요. 몇 초 뒤 다시 눌러 주세요.', certain: true };
    // 여기서부터는 **결과를 모른다.** 5xx 는 커밋 뒤 끊겼을 수 있고, 네트워크 오류는
    //   요청이 서버에 닿았는지조차 알 수 없다. 실패라고 단정하지 않는다.
    return { text: _MONEY_UNKNOWN, certain: false };
  }

  // 처리 중 표시 (돈감사 2026-09-07 · §30 · §49)
  //   전엔 버튼이 흐려지기만 하고 글자는 "충전하기" 그대로였다. 느린 망에서 원장님은
  //   눌린 건지 아닌지 알 수 없고, 스크린리더는 아무것도 읽어 주지 않는다(aria-busy 없음).
  function _busy(btn, on, busyText, idleText) {
    if (!btn) return;
    btn.disabled = !!on;
    btn.setAttribute('aria-busy', on ? 'true' : 'false');
    btn.textContent = on ? busyText : idleText;
    btn.style.opacity = on ? '.7' : '';
  }

  function _toast(msg, opts) {
    if (typeof window.showToast === 'function') window.showToast(msg, opts);
  }

  // ── 멱등키 (카오스 F-3 · 2026-08-23) ────────────────────────────
  //
  // 왜 필요한가 — `apiFetch` 는 `/memberships/*` 를 **자동 재시도한다**
  // (app-core.js 의 CREATE_NO_RETRY_RE 는 bookings|revenue|customers 뿐이다).
  // 서버가 이미 커밋했는데 응답이 돌아오는 길에 끊기면(WiFi↔LTE 핸드오프·지하철)
  // 래퍼가 같은 POST 를 다시 쏜다 → **잔액이 두 번 오른다.**
  // 실측: 동시 10발에서 화면엔 전부 '실패' 인데 서버 잔액은 +200,000원이었다.
  //
  // 🔑 키는 **시도(intent) 단위**여야 한다. 호출마다 새로 만들면 재시도가 새 충전이 되고,
  //    영구 고정하면 원장님이 진짜로 두 번 충전하고 싶을 때 막힌다.
  //    그래서 "같은 고객·같은 금액·같은 수단으로 아직 성공 못 한 시도" 만 키를 재사용하고,
  //    성공하면 즉시 버린다.
  const _uuid = () => (crypto?.randomUUID ? crypto.randomUUID()
    : 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10));
  const _pendingTxn = new Map();   // signature → key

  function _txnFor(kind, customerId, amount, extra) {
    const sig = [kind, customerId, amount, extra || ''].join('|');
    let key = _pendingTxn.get(sig);
    if (!key) { key = _uuid(); _pendingTxn.set(sig, key); }
    return { sig, key };
  }
  function _txnDone(sig) { _pendingTxn.delete(sig); }

  // [2026-05-19] _krw 삭제 → formatMoney (format-money.js 공통 유틸)

  function _ensureSheet() {
    let el = document.getElementById('membershipSheet');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'membershipSheet';
    el.className = 'sheet-overlay';
    /* [BUG-1 2026-09-11] z-index 9000 → 10650.
       원장이 고객 화면에서 [회원권]을 눌러도 **아무 일도 안 일어나는 것처럼 보였다.**
       시트는 정상적으로 만들어지고 `/memberships/{id}/history` 도 200 인데,
       9000 이라 고객 화면들 **뒤에** 깔려서 화면에 안 보인 것이다.
       실측(라이브 c3bf4ca, 실 Chrome): `elementFromPoint(시트 중앙)` 이 시트가 아니라
       고객 상세의 `.cd-memory-head` 를 돌려줬다. 가리는 것은 둘:
         #customerSheet     z=9998   (고객 목록)
         #customerDashSheet z=10600  (고객 상세)
       회원권 충전은 **그 화면 위에 얹히는 모달**이다(닫으면 원래 고객 화면으로 돌아와야 한다).
       그래서 잇비처럼 '먼저 닫기'가 아니라 **위로 올리는 게** 맞는 처리다.

       10650 을 고른 이유 — 이 앱의 오버레이 사다리에 맞춘 값이다:
         9998  고객 목록 · 10500 잇비 · 10600 고객 상세 · **10650 회원권** · 10700 DM 미리보기 ·
         10800 고객 픽커 · 12000 자동화 동의 · 99999 토스트
       고객 상세(10600)보다는 위, DM 미리보기(10700)보다는 아래 — 기존 관계를 하나도 안 건드린다.

       🔴 이건 이 레포에서 **네 번째** 같은 결함이다. 앞의 셋은 이미 고쳐져 있었다:
         핫픽스D #3  customerDashSheet → 10600 ("채팅에서 고객 기록 열기 시 뒤에 깔리던 버그")
         2026-06-11  고객 픽커        → 10800 ("잇비(10500) 위로 — 픽커 가림 픽스")
         2026-09-09  잇비 단축키      → 여는 쪽을 먼저 닫음 (app-assistant.js `_runSheetShortcut`)
       그 주석의 표현 그대로 "한 경로엔 가드가 있고 형제 경로엔 없다" 였다. */
    el.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10650;align-items:flex-end;justify-content:center;';
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
            <!-- [돈감사 2026-09-07] word-break:keep-all — 320px 에서 "630,000원" 이
                 "630,000" / "원" 으로 갈려 줄바꿈됐다. 금액과 단위가 떨어지면 한순간
                 다른 숫자로 읽힌다. 돈 화면에서 단위는 숫자에 붙어 있어야 한다. -->
            <div id="msSub" style="font-size:12.5px;color:var(--text-subtle);margin-top:2px;word-break:keep-all;"></div>
          </div>
          <button class="ss-close" id="msClose" style="background:transparent;border:none;font-size:24px;cursor:pointer;line-height:1;color:var(--text-subtle);"><svg class="ic" width="18" height="18" aria-hidden="true"><use href="#ic-x"/></svg></button>
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
      /* [BUG-N3 2026-09-11] 머리글의 잔액을 **서버 값으로 덮는다.**
         예전엔 호출부가 넘긴 `currentBalance` 만 썼는데, 그건 화면이 들고 있던 옛 값이다.
         실측(라이브 ec4cf71): 30,000원을 충전하고(POST /memberships/topup 200,
         토스트 "잔액 30,000원", 내역 "+30,000원") 시트를 다시 열었더니
         머리글만 **"현재 잔액 0원"** 이었다. 서버는 `current_balance: 30000` 이었고
         그 값은 **바로 이 응답 안에 들어 있었는데 안 쓰고 있었다.**
         원장이 0원으로 보고 또 충전하면 이중 충전이 된다 — 돈 화면에서 제일 위험한 표기다.
         호출부 값은 응답이 오기 전 한순간을 메우는 용도로만 남긴다(즉시 그려지는 게 낫다). */
      try {
        if (r && r.current_balance != null && !Number.isNaN(Number(r.current_balance))) {
          const _sub = document.querySelector('#membershipSheet #msSub');
          if (_sub && /현재 잔액/.test(_sub.textContent || '')) {
            _sub.textContent = (_sub.textContent || '').replace(/현재 잔액\s*[^·]*/, '현재 잔액 ' + formatMoney(Number(r.current_balance)));
          }
        }
      } catch (_be) { void _be; }
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
    /* [2026-09-09] 뒤로가기로 닫히게 등록. 안 하면 back 이 이 시트 대신 뒤 화면을 닫아
       충전하려던 흐름이 통째로 날아간다(돈 화면이라 더 위험하다).
       닫기 지점이 4곳(× · 배경탭 · 충전성공 · 사용성공)이라 각각에 _markSheetClosed 를
       붙이면 하나 빠질 때 유령 hash 가 남는다 → DOM 에서 사라짐을 관찰하는 헬퍼를 쓴다. */
    try { window._bindSheetBack && window._bindSheetBack('membershipSheet', sheet, () => { sheet.style.display = 'none'; }); } catch (_e) { void _e; }
  }

  // ── 충전 시트 ───────────────────────────────────────────────
  function openTopupSheet(customerId, customerName, currentBalance) {
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
    // [돈감사 2026-09-07 §28] 현재 잔액을 보여준다.
    //   호출부(app-customer.js:1150)는 예전부터 `currentBalance` 를 넘기고 있었는데
    //   이 함수가 **인자로 받지도 않아** 통째로 버려졌다. 그래서 충전 화면 어디에도
    //   "지금 얼마 남았는지" 가 없었다 — 얼마를 채워 줘야 할지 모른 채 금액을 고른다.
    const _balTxt = (currentBalance != null && !Number.isNaN(Number(currentBalance)))
      ? `현재 잔액 ${formatMoney(Number(currentBalance))}`
      : '';
    _open('회원권 충전', html,
      `${customerName || '고객'}님 회원권 충전${_balTxt ? ' · ' + _balTxt : ''}`);
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
      _busy(btn, true, '충전 중…', '충전하기');
      // [F-3] 같은 시도의 재시도면 같은 키를 다시 쓴다 — 서버가 중복을 흡수한다.
      const { sig: _sig, key: _txn } = _txnFor('topup', customerId, amount, method);
      try {
        const r = await _fetch('POST', '/memberships/topup', {
          customer_id: customerId,
          amount,
          payment_method: method,
          record_revenue: true,
          client_txn_id: _txn,
        });
        _txnDone(_sig);   // 성공했으니 이 키는 버린다 — 다음 충전은 새 시도다
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
        // [돈감사 2026-09-07] 결과를 모르는 실패를 "충전 실패" 라고 단정하지 않는다.
        //   시트도 닫지 않는다 — 같은 버튼(=같은 멱등키)을 다시 누를 수 있어야 한다.
        const _m = _moneyError(e, '충전');
        _toast(_m.certain ? ('충전 실패 — ' + _m.text) : _m.text, { error: true });
      } finally {
        _busy(btn, false, '충전 중…', '충전하기');
      }
    });
  }

  // ── 사용 시트 ───────────────────────────────────────────────
  // [P0-2 2026-08-30] bookingId(선택) — 예약 맥락에서 차감하면 넘겨준다.
  //
  // ⚠️ [돈 마감감사 2026-09-07 정정] 예전 주석은 "그 예약이 취소될 때 잔액을 자동 복구한다"
  //    고 적혀 있었는데 **사실이 아니다.** 백엔드에 회원권 자동 복구 코드는 0줄이고
  //    (bookings.py 전수 확인), 취소는 잔액을 되돌리지 않는다.
  //    이번 출시 정책은 **자동 복구 미지원(A안)** 이다 — 취소 후 잔액을 되돌리려면
  //    원장님이 충전으로 직접 정산한다.
  //    지금 booking_id 가 하는 일은 하나뿐이다: **이 차감이 어느 예약에서 나왔는지
  //    원장에 남겨 나중에 설명할 수 있게 하는 것.**
  //    (백엔드는 이 값이 내 원장·이 손님의 예약일 때만 기록하고, 아니면 조용히 버린다.)
  function openUseSheet(customerId, customerName, currentBalance, bookingId) {
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
      _busy(btn, true, '차감 중…', '차감하기');
      // [F-3] 차감도 동일 — 재시도로 손님 잔액이 두 번 빠지면 안 된다.
      // [P0-2] 예약이 다르면 다른 시도다 — bookingId 를 서명에 포함해 키를 분리한다.
      const { sig: _sig, key: _txn } = _txnFor('use', customerId, amount, svc + '|bk' + (bookingId || ''));
      try {
        const r = await _fetch('POST', '/memberships/use', {
          customer_id: customerId,
          amount,
          service_name: svc || null,
          client_txn_id: _txn,
          booking_id: bookingId || null,   // [P0-2] 이 차감이 나온 예약 (기록용 — 자동 복구는 없다)
        });
        _txnDone(_sig);
        _busy(btn, false, '차감 중…', '차감하기');
        _toast(`사용 완료! 잔액 ${formatMoney(r.membership_balance)}`);
        sheet.style.display = 'none';
        // [2026-04-29] 잔액 부족 경고 토스트 (백엔드가 warning 필드 반환)
        if (r.warning) {
          setTimeout(() => _toast(r.warning, { error: true }), 800);
        }
        try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'membership_use' } })); } catch (_) { void 0; }
      } catch (e) {
        const _m = _moneyError(e, '차감');
        _toast(_m.certain ? ('차감 실패 — ' + _m.text) : _m.text, { error: true });
        // [2026-07-22 fix] 실패 시 재활성화 — 안 하면 버튼 영구 잠김(충전 시트엔 있던 로직)
        _busy(btn, false, '차감 중…', '차감하기');
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
  window.openMembershipUse = function (customerId, customerName, balance, bookingId) {
    return openUseSheet(customerId, customerName, balance, bookingId);
  };
  window.openMembershipExpiring = function (days) {
    return openExpiringList(days);
  };
})();
