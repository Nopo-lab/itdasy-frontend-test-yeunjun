/* ─────────────────────────────────────────────────────────────
   시술 완료 액션 (#4 · 2026-05-16 UX 개선)

   변경:
   - 블록 클릭 시 바로 이 팝업이 열림 (편집폼 거치지 않음).
   - 금액 인라인 편집 가능 (프리셋 기본값 + 직접 수정).
   - "예약 시간·고객 수정" 링크로 편집폼 진입 가능
     (itdasy:open-booking-edit 이벤트, 캘린더가 수신).
   - BE 는 PATCH /bookings/{id} 시 자동 매출생성 + 재고차감 + 리터치.

   공개 API:
   - CompleteFlow.startFromBooking(booking)
   - CompleteFlow.show({customer_id, customer_name, service_name, default_amount})
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  let _ctx = null;  // { booking_id, customer_id, customer_name, service_name, amount, method }

  const METHODS = [
    { key: 'card',       label: '카드' },
    { key: 'cash',       label: '현금' },
    { key: 'transfer',   label: '계좌이체' },
    { key: 'membership', label: '회원권' },
  ];

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }
  function _num(v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; }
  function _fmt(n)  { const v = _num(n); return v ? v.toLocaleString('ko-KR') + '원' : '0원'; }

  function _servicePriceFor(svc) {
    const k = String(svc || '').trim().toLowerCase();
    const list = window._serviceTemplatesCache || [];
    if (!k || !list.length) return null;
    let hit = list.find(t => String(t.name || '').trim().toLowerCase() === k);
    if (!hit) {
      hit = list.find(t => {
        const name = String(t.name || '').trim().toLowerCase();
        return name && (k.includes(name) || name.includes(k));
      });
    }
    return _num(hit?.default_price);
  }

  async function _hydrateAmountFromServices() {
    if (!_ctx?.service_name || _ctx.amount) return;
    try {
      if (typeof window.loadServiceTemplates === 'function') await window.loadServiceTemplates();
      const amount = _servicePriceFor(_ctx.service_name);
      if (amount) {
        _ctx.amount = amount;
        _render();   // 금액 채워서 다시 그리기
      }
    } catch (e) { console.warn('[complete-flow] 기본 금액 자동입력 실패:', e); }
  }

  function _emitChange(kind, extra) {
    try {
      window.dispatchEvent(new CustomEvent('itdasy:data-changed', {
        detail: { kind, optimistic: false, ...(extra || {}) },
      }));
    } catch (e) { console.warn('[complete-flow] 화면 갱신 알림 실패:', e); }
  }
  function _refreshConnectedViews() {
    try { if (window.Dashboard?.refresh)  Promise.resolve(window.Dashboard.refresh(true)).catch(()=>{}); } catch(e){}
    try { if (window.MyShopV3?.refresh)   Promise.resolve(window.MyShopV3.refresh()).catch(()=>{}); } catch(e){}
    try { if (window.RevenueHub?.refresh) Promise.resolve(window.RevenueHub.refresh()).catch(()=>{}); } catch(e){}
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
  // BE 응답 그대로 반환 (completion_effects 포함)
  function _patchBooking(id, patch) {
    if (window.Booking?.update) return window.Booking.update(id, patch);
    return _apiPatch('/bookings/' + id, patch);
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
          <strong style="font-size:17px;color:#191F28;">시술 완료</strong>
          <button id="cfClose" style="margin-left:auto;background:rgba(0,0,0,0.05);border:none;width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer;color:#4E5968;" aria-label="닫기">✕</button>
        </div>
        <div id="cfBody" style="flex:1;overflow-y:auto;"></div>
      </div>
    `;
    document.body.appendChild(sheet);
    sheet.querySelector('#cfClose')?.addEventListener('click', _close);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) _close(); });
    _ensureStyles();
    return sheet;
  }

  function _ensureStyles() {
    if (document.getElementById('cfStyles')) return;
    const s = document.createElement('style');
    s.id = 'cfStyles';
    s.textContent = `
      .cf-section-label { font-size:12px; font-weight:600; color:#8B95A1; margin-bottom:8px; letter-spacing:-0.2px; }
      .cf-info-box { padding:14px 16px; background:#F7F8FA; border-radius:14px; margin-bottom:16px; }
      .cf-info-name { font-size:18px; font-weight:800; color:#191F28; letter-spacing:-0.4px; }
      .cf-info-svc  { font-size:13px; color:#4E5968; font-weight:500; margin-top:4px; }
      .cf-amount-row { display:flex; align-items:baseline; gap:8px; margin-bottom:14px; padding:14px 16px; background:#F7F8FA; border-radius:14px; }
      .cf-amount-row input { font-size:22px; font-weight:800; color:#191F28; letter-spacing:-0.4px; }
      .cf-method-pills { display:flex; gap:8px; margin-bottom:14px; }
      .cf-pill { flex:1; padding:12px 0; border:none; border-radius:12px; font-size:14px; font-weight:600; cursor:pointer; background:#F7F8FA; color:#4E5968; transition:background .15s ease, color .15s ease, box-shadow .15s ease; }
      .cf-pill.active { background:#FFF1F3; color:#E5586E; box-shadow:inset 0 0 0 1.5px #E5586E; }
      .cf-auto-preview { margin-bottom:16px; padding:14px 16px; background:#F7F8FA; border-radius:14px; }
      .cf-preview-row { display:flex; align-items:center; gap:8px; padding:4px 0; font-size:13px; color:#4E5968; }
      .cf-check { color:#0F6E56; font-weight:700; }
      .cf-sub-actions { display:flex; gap:8px; margin-top:12px; }
      .cf-sub-btn { flex:1; padding:13px; border:1px solid #E5E8EB; border-radius:12px; background:#fff; cursor:pointer; color:#4E5968; font-weight:600; font-size:13px; }
      .cf-sub-btn:hover { background:#F7F8FA; }
    `;
    document.head.appendChild(s);
  }

  function _renderAmount() {
    const amt = _ctx.amount;
    const valStr = amt ? Number(amt).toLocaleString('ko-KR') : '';
    return `
      <div class="cf-section-label">시술 금액</div>
      <div class="cf-amount-row">
        <input type="text" id="cfAmountInput" inputmode="numeric"
          value="${_esc(valStr)}"
          placeholder="금액 입력"
          style="flex:1;min-width:0;border:none;background:transparent;outline:none;padding:0;"
        />
        <span style="font-size:16px;color:#8B95A1;font-weight:600;">원</span>
      </div>`;
  }
  function _renderMethodPills() {
    return `
      <div class="cf-section-label">결제수단</div>
      <div class="cf-method-pills">
        ${METHODS.map(m => `
          <button class="cf-pill ${m.key === _ctx.method ? 'active' : ''}" data-method="${m.key}" type="button">${m.label}</button>
        `).join('')}
      </div>`;
  }
  function _renderAutoPreview() {
    const willRevenue = !!_ctx.amount && _ctx.amount > 0;
    return `
      <div class="cf-auto-preview">
        <div class="cf-preview-row"><span class="cf-check">✓</span><span>${willRevenue ? `매출 ${_esc(_fmt(_ctx.amount))} 자동 기록` : '매출은 기록되지 않아요 (금액 없음)'}</span></div>
        <div class="cf-preview-row"><span class="cf-check">✓</span><span>소모재료 자동 차감 (프리셋 설정 기준)</span></div>
        <div class="cf-preview-row"><span class="cf-check">✓</span><span>리터치 알림 자동 등록 (프리셋 설정 주기)</span></div>
      </div>`;
  }

  function _render() {
    const c = _ctx;
    document.getElementById('cfBody').innerHTML = `
      <div class="cf-info-box">
        <div class="cf-section-label">고객님 성함</div>
        <div class="cf-info-name">${c.customer_name ? _esc(c.customer_name) : '<span style="color:#8B95A1;font-weight:600;">고객 미지정</span>'}</div>
        ${c.service_name ? `<div class="cf-info-svc">${_esc(c.service_name)}</div>` : ''}
      </div>

      ${_renderAmount()}
      ${_renderMethodPills()}
      ${_renderAutoPreview()}

      <div style="display:flex;gap:8px;">
        <button id="cfSkip" type="button" style="flex:1;padding:14px;border:1px solid #E5E8EB;border-radius:14px;background:#fff;cursor:pointer;color:#4E5968;font-weight:700;font-size:13px;">건너뛰기</button>
        <button id="cfSave" type="button" style="flex:2;padding:14px;border:none;border-radius:14px;background:linear-gradient(135deg,#F18091,#E5586E);color:#fff;cursor:pointer;font-weight:800;font-size:15px;">시술 완료</button>
      </div>
      <div class="cf-sub-actions">
        <button id="cfEditBooking" type="button" class="cf-sub-btn">예약 시간·고객 수정</button>
        <button id="cfInventory" type="button" class="cf-sub-btn">재고 확인</button>
      </div>
    `;

    document.getElementById('cfSkip').addEventListener('click', _skipAndComplete);
    document.getElementById('cfSave').addEventListener('click', _saveAll);
    document.getElementById('cfInventory').addEventListener('click', _openInventory);
    document.querySelectorAll('.cf-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        _ctx.method = btn.dataset.method;
        document.querySelectorAll('.cf-pill').forEach(b => b.classList.toggle('active', b === btn));
      });
    });
    // 금액 인라인 편집 (천 단위 콤마 + 숫자만)
    const amtInput = document.getElementById('cfAmountInput');
    if (amtInput) {
      amtInput.addEventListener('input', (e) => {
        const raw = e.target.value.replace(/[^0-9]/g, '');
        const num = parseInt(raw, 10);
        _ctx.amount = Number.isFinite(num) && num > 0 ? num : null;
        e.target.value = _ctx.amount ? _ctx.amount.toLocaleString('ko-KR') : '';
      });
    }
    // 예약 시간·고객 수정 — 팝업 닫고 캘린더 편집폼 진입 이벤트 발행
    document.getElementById('cfEditBooking')?.addEventListener('click', () => {
      const bookingId = _ctx.booking_id;
      _close();
      if (bookingId) {
        window.dispatchEvent(new CustomEvent('itdasy:open-booking-edit', { detail: { booking_id: bookingId } }));
      }
    });
  }

  function _openInventory() {
    _close();
    if (typeof window.openInventoryHub === 'function') window.openInventoryHub();
    else if (window.showToast) window.showToast('재고 화면을 불러올 수 없어요');
  }

  // 매출 미기록 — BE에 skip_revenue 플래그 전달 (리터치/재고는 그대로 처리됨)
  async function _skipAndComplete() {
    if (!_ctx.booking_id) { _close(); return; }
    const btn = document.getElementById('cfSkip');
    if (btn) { btn.disabled = true; btn.textContent = '처리 중…'; }
    try {
      await _patchBooking(_ctx.booking_id, { status: 'completed', skip_revenue: true });
      _emitChange('update_booking', { booking_id: _ctx.booking_id, customer_id: _ctx.customer_id });
      if (window.showToast) window.showToast('예약 완료 (매출 미기록)');
      _close();
      _refreshConnectedViews();
    } catch (e) {
      console.warn('[complete-flow] 매출 미기록 완료 실패:', e);
      if (btn) { btn.disabled = false; btn.textContent = '매출 미기록 완료'; }
      if (window.showToast) window.showToast('완료 처리 실패: ' + (e.message || ''));
    }
  }

  async function _saveAll() {
    const btn = document.getElementById('cfSave');
    btn.disabled = true; btn.textContent = '저장 중…';
    // 사용자 인라인 편집 금액도 BE 에 전달 — BE 가 booking.amount 업데이트 후 매출 자동기록에 사용
    const payload = { status: 'completed', payment_method: _ctx.method || 'card' };
    if (_ctx.amount && _ctx.amount > 0) payload.amount = _ctx.amount;
    try {
      const res = await _patchBooking(_ctx.booking_id, payload);
      const eff = res?.completion_effects || {};
      console.log('[complete-flow] PATCH 응답:', { payload, completion_effects: eff, amount: res?.amount });
      // 매출 SWR 캐시 강제 무효화 — Revenue 화면 다음 진입 시 fresh fetch
      try {
        ['today', 'week', 'month'].forEach(p => {
          try { localStorage.removeItem('pv_cache::revenue::' + p); } catch (_e) { /* silent */ }
          try { sessionStorage.removeItem('pv_cache::revenue::' + p); } catch (_e) { /* silent */ }
        });
      } catch (_e) { /* silent */ }
      if (_ctx.booking_id) _emitChange('update_booking', { booking_id: _ctx.booking_id, customer_id: _ctx.customer_id });
      if (eff.revenue_created) _emitChange('create_revenue', { booking_id: _ctx.booking_id, customer_id: _ctx.customer_id, revenue_id: eff.revenue_id });
      if (window.hapticSuccess) window.hapticSuccess();
      if (window.showToast) {
        if (eff.revenue_created) window.showToast(`${_fmt(_ctx.amount)} 매출 자동 기록됨`);
        else if (eff.revenue_skipped) window.showToast('예약 완료 (매출 미기록)');
        else if (res && 'completion_effects' in res) window.showToast('예약 완료 (매출 기록은 다음 화면에서 확인하세요)');
        else window.showToast('예약 완료 · 옛 버전 BE — 화면 새로고침 필요');
      }
      _close();
      _refreshConnectedViews();
    } catch (e) {
      btn.disabled = false; btn.textContent = '시술 완료';
      if (window.showToast) window.showToast('실패: ' + (e.message || ''));
    }
  }

  function _close() {
    const sheet = document.getElementById('completeFlowSheet');
    if (sheet) sheet.style.display = 'none';
    document.body.style.overflow = '';
  }

  window.CompleteFlow = {
    startFromBooking(booking) {
      if (!booking) return;
      _ctx = {
        booking_id: booking.id,
        customer_id: booking.customer_id || null,
        customer_name: booking.customer_name || null,
        service_name: booking.service_name || null,
        amount: _num(booking.amount) || _servicePriceFor(booking.service_name),
        method: booking.payment_method || 'card',
      };
      _ensureSheet();
      document.getElementById('completeFlowSheet').style.display = 'flex';
      document.body.style.overflow = 'hidden';
      _render();
      _hydrateAmountFromServices();
    },
    show(opts) {
      _ctx = {
        booking_id: opts?.booking_id || null,
        customer_id: opts?.customer_id || null,
        customer_name: opts?.customer_name || null,
        service_name: opts?.service_name || null,
        amount: _num(opts?.default_amount) || _servicePriceFor(opts?.service_name),
        method: 'card',
      };
      _ensureSheet();
      document.getElementById('completeFlowSheet').style.display = 'flex';
      document.body.style.overflow = 'hidden';
      _render();
      _hydrateAmountFromServices();
    },
  };
  window.closeCompleteFlow = _close;
})();
