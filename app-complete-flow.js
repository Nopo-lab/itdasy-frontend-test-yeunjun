/* ─────────────────────────────────────────────────────────────
   시술 완료 액션 번들 (#3 · 2026-04-20)

   예약 '완료' 처리 시 매출을 한 팝업에서 바로 기록.
   별도 예약·매출 시트를 돌아다닐 필요 없음.

   공개 API:
   - CompleteFlow.startFromBooking(booking)   예약 완료 → 번들 팝업
   - CompleteFlow.show({customer_id, customer_name, service_name, default_amount})
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  let _ctx = null;  // { customer_id, customer_name, service_name, amount, method, memo, booking_id }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  async function _apiPost(path, body) {
    const res = await fetch(window.API + path, {
      method: 'POST',
      headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }
  async function _apiPatch(path, body) {
    const res = await fetch(window.API + path, {
      method: 'PATCH',
      headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }

  function _ensureSheet() {
    let sheet = document.getElementById('completeFlowSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'completeFlowSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:10000;display:none;background:rgba(0,0,0,0.45);align-items:flex-end;';
    sheet.innerHTML = `
      <div style="width:100%;background:#fff;border-radius:20px 20px 0 0;max-height:92vh;display:flex;flex-direction:column;padding:18px;padding-bottom:max(18px,env(safe-area-inset-bottom));">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
          <span style="font-size:22px;">🎀</span>
          <strong style="font-size:17px;">시술 완료 · 빠른 기록</strong>
          <button onclick="closeCompleteFlow()" style="margin-left:auto;background:rgba(0,0,0,0.05);border:none;width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer;" aria-label="닫기">✕</button>
        </div>
        <div id="cfBody" style="flex:1;overflow-y:auto;"></div>
      </div>
    `;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) closeCompleteFlow(); });
    return sheet;
  }

  function _render() {
    const c = _ctx;
    document.getElementById('cfBody').innerHTML = `
      <!-- 고객 헤더 -->
      <div style="padding:12px;background:linear-gradient(135deg,rgba(241,128,145,0.1),rgba(241,128,145,0.02));border-radius:12px;margin-bottom:14px;">
        <div style="font-size:11px;color:#888;margin-bottom:2px;">방금 완료된 시술</div>
        <div style="font-size:15px;font-weight:800;">
          ${c.customer_name ? '👤 ' + _esc(c.customer_name) : '<span style="color:#aaa;">고객 미지정</span>'}
          ${c.service_name ? ` <span style="font-size:12px;color:#666;font-weight:400;">· ${_esc(c.service_name)}</span>` : ''}
        </div>
      </div>

      <!-- 금액 + 결제 (한 줄) -->
      <div style="display:flex;gap:10px;margin-bottom:12px;">
        <div style="flex:2;">
          <label style="display:block;font-size:12px;color:#666;margin-bottom:4px;">💰 금액 (원) *</label>
          <input id="cfAmount" type="number" inputmode="numeric" value="${c.amount||''}" placeholder="50000" style="width:100%;padding:12px;border:1px solid #ddd;border-radius:10px;font-size:16px;font-weight:700;" />
        </div>
        <div style="flex:1;">
          <label style="display:block;font-size:12px;color:#666;margin-bottom:4px;">결제</label>
          <select id="cfMethod" style="width:100%;padding:12px;border:1px solid #ddd;border-radius:10px;font-size:14px;">
            ${['card','cash','transfer','etc'].map(m => `<option value="${m}" ${c.method===m?'selected':''}>${({card:'카드',cash:'현금',transfer:'이체',etc:'기타'})[m]}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- 메모 -->
      <label style="display:block;font-size:12px;color:#666;margin-bottom:4px;">📝 메모 (선택)</label>
      <textarea id="cfMemo" rows="2" maxlength="200" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:10px;margin-bottom:14px;resize:vertical;font-family:inherit;"></textarea>

      <!-- 버튼 -->
      <div style="display:flex;gap:8px;">
        <button id="cfSkip" style="flex:1;padding:13px;border:1px solid #ddd;border-radius:10px;background:#fff;cursor:pointer;color:#555;font-weight:700;font-size:13px;">건너뛰기</button>
        <button id="cfSave" style="flex:2;padding:13px;border:none;border-radius:10px;background:linear-gradient(135deg,#F18091,#D95F70);color:#fff;cursor:pointer;font-weight:800;font-size:15px;">한 번에 기록 ✓</button>
      </div>
    `;

    document.getElementById('cfSkip').addEventListener('click', _skipAndComplete);
    document.getElementById('cfSave').addEventListener('click', _saveAll);
  }

  // 예약만 완료 처리하고 닫기
  async function _skipAndComplete() {
    await _markBookingCompleted();
    if (window.showToast) window.showToast('예약 완료 처리됨');
    closeCompleteFlow();
    if (window.Dashboard?.refresh) window.Dashboard.refresh();
  }

  async function _markBookingCompleted() {
    if (!_ctx.booking_id) return;
    try { await _apiPatch('/bookings/' + _ctx.booking_id, { status: 'completed' }); } catch (_) {}
  }

  async function _saveAll() {
    const amount = parseInt(document.getElementById('cfAmount').value, 10);
    const method = document.getElementById('cfMethod').value;
    const memo = document.getElementById('cfMemo').value.trim() || null;

    if (!amount || amount < 1) {
      if (window.showToast) window.showToast('금액을 입력해 주세요');
      return;
    }

    const btn = document.getElementById('cfSave');
    btn.disabled = true;
    btn.textContent = '저장 중…';

    try {
      await Promise.all([
        _markBookingCompleted(),
        _apiPost('/revenue', {
          amount, method,
          service_name: _ctx.service_name || null,
          customer_id: _ctx.customer_id || null,
          customer_name: _ctx.customer_name || null,
          memo,
        }),
      ]);
      if (window.hapticSuccess) window.hapticSuccess();
      if (window.showToast) window.showToast('✨ 매출 기록 완료!');
      closeCompleteFlow();
      if (window.Dashboard?.refresh) window.Dashboard.refresh();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = '한 번에 기록 ✓';
      if (window.showToast) window.showToast('실패: ' + (e.message || ''));
    }
  }

  // ── 공개 API ──────────────────────────────────────────
  window.CompleteFlow = {
    startFromBooking(booking) {
      if (!booking) return;
      _ctx = {
        booking_id: booking.id,
        customer_id: booking.customer_id || null,
        customer_name: booking.customer_name || null,
        service_name: booking.service_name || null,
        amount: null, method: 'card',
      };
      _ensureSheet();
      document.getElementById('completeFlowSheet').style.display = 'flex';
      document.body.style.overflow = 'hidden';
      _render();
    },
    show(opts) {
      _ctx = {
        booking_id: null,
        customer_id: opts?.customer_id || null,
        customer_name: opts?.customer_name || null,
        service_name: opts?.service_name || null,
        amount: opts?.default_amount || null,
        method: 'card',
      };
      _ensureSheet();
      document.getElementById('completeFlowSheet').style.display = 'flex';
      document.body.style.overflow = 'hidden';
      _render();
    },
  };

  window.closeCompleteFlow = function () {
    const sheet = document.getElementById('completeFlowSheet');
    if (sheet) sheet.style.display = 'none';
    document.body.style.overflow = '';
  };
})();
