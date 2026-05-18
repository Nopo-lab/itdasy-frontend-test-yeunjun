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
    sheet.className = 'cf-backdrop';
    sheet.innerHTML = `
      <div class="cf-card">
        <div class="cf-header">
          <div class="cf-title-wrap">
            <div class="cf-title">시술 완료</div>
            <div class="cf-subtitle">결제 정보를 확인하고 마무리해 주세요</div>
          </div>
          <button id="cfClose" class="cf-close" aria-label="닫기">✕</button>
        </div>
        <div id="cfBody" class="cf-body"></div>
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
      /* ── 백드롭 (모바일=바텀시트, PC=센터 모달) ── */
      .cf-backdrop {
        position:fixed; inset:0; z-index:10000; display:none;
        background:rgba(17, 24, 39, 0.5);
        backdrop-filter: blur(2px);
        -webkit-backdrop-filter: blur(2px);
        align-items:flex-end; justify-content:center;
      }
      .cf-card {
        width:100%;
        background:#fff;
        border-radius:24px 24px 0 0;
        max-height:92vh;
        display:flex; flex-direction:column;
        padding:22px 20px 20px;
        padding-bottom:max(20px,env(safe-area-inset-bottom));
        box-shadow:0 -8px 40px rgba(0,0,0,0.18);
        animation: cfSlideUp .28s cubic-bezier(.2,.7,.2,1);
      }
      @keyframes cfSlideUp { from { transform:translateY(40px); opacity:0; } to { transform:none; opacity:1; } }
      @keyframes cfFadeIn  { from { transform:translateY(8px) scale(.985); opacity:0; } to { transform:none; opacity:1; } }
      /* PC — 센터 모달, max-width 제한 */
      @media (min-width: 768px) {
        .cf-backdrop { align-items:center; }
        .cf-card {
          width:auto;
          min-width:440px;
          max-width:460px;
          border-radius:24px;
          padding:26px 26px 24px;
          padding-bottom:24px;
          max-height:88vh;
          box-shadow:0 24px 60px rgba(0,0,0,0.22), 0 4px 12px rgba(0,0,0,0.08);
          animation: cfFadeIn .22s cubic-bezier(.2,.7,.2,1);
        }
      }

      /* ── 헤더 ── */
      .cf-header { display:flex; align-items:flex-start; gap:12px; margin-bottom:20px; }
      .cf-title-wrap { flex:1; min-width:0; }
      .cf-title { font-size:19px; font-weight:800; color:#111827; letter-spacing:-0.5px; line-height:1.2; }
      .cf-subtitle { font-size:12.5px; color:#6B7280; margin-top:4px; font-weight:500; letter-spacing:-0.2px; }
      .cf-close {
        background:rgba(0,0,0,0.04); border:none;
        width:34px; height:34px; border-radius:50%;
        font-size:15px; cursor:pointer; color:#4B5563;
        transition: background .15s ease;
        flex-shrink:0;
      }
      .cf-close:hover { background:rgba(0,0,0,0.08); }

      .cf-body { flex:1; overflow-y:auto; }

      /* ── 섹션 ── */
      .cf-section-label {
        font-size:11.5px; font-weight:700; color:#9CA3AF;
        margin-bottom:8px; letter-spacing:0.2px;
        text-transform:uppercase;
      }

      /* ── 고객 정보 카드 ── */
      .cf-info-box {
        padding:16px 18px;
        background:linear-gradient(135deg, #FFF5F7 0%, #FFEFF3 100%);
        border-radius:16px; margin-bottom:18px;
        border:1px solid rgba(229, 88, 110, 0.08);
      }
      .cf-info-box .cf-section-label { color:#9F4858; }
      .cf-info-name { font-size:20px; font-weight:800; color:#111827; letter-spacing:-0.5px; line-height:1.2; }
      .cf-info-svc  { font-size:13.5px; color:#6B7280; font-weight:600; margin-top:6px; letter-spacing:-0.2px; }

      /* ── 금액 입력 ── */
      .cf-amount-row {
        display:flex; align-items:baseline; gap:6px;
        margin-bottom:16px; padding:16px 18px;
        background:#F9FAFB; border:1.5px solid #E5E7EB;
        border-radius:16px;
        transition: border-color .15s ease, background .15s ease;
      }
      .cf-amount-row:focus-within {
        border-color:#E5586E;
        background:#fff;
        box-shadow:0 0 0 4px rgba(229, 88, 110, 0.08);
      }
      .cf-amount-row input {
        font-size:24px; font-weight:800; color:#111827;
        letter-spacing:-0.6px;
        font-family:inherit;
      }
      .cf-amount-row input::placeholder { color:#D1D5DB; font-weight:700; }

      /* ── 결제수단 pills ── */
      .cf-method-pills { display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; margin-bottom:18px; }
      .cf-pill {
        padding:13px 8px; border:1.5px solid #E5E7EB; border-radius:14px;
        font-size:13.5px; font-weight:700; cursor:pointer;
        background:#fff; color:#4B5563;
        transition: all .15s ease;
        font-family:inherit;
        letter-spacing:-0.2px;
      }
      .cf-pill:hover { background:#F9FAFB; border-color:#D1D5DB; }
      .cf-pill.active {
        background:linear-gradient(135deg, #FFE8EC 0%, #FFD9DF 100%);
        color:#C53A52;
        border-color:#E5586E;
        box-shadow:0 2px 8px rgba(229, 88, 110, 0.15);
      }

      /* ── 자동 처리 안내 ── */
      .cf-auto-preview {
        margin-bottom:20px; padding:14px 16px;
        background:#F9FAFB; border:1px solid #F3F4F6;
        border-radius:14px;
      }
      .cf-preview-row {
        display:flex; align-items:center; gap:10px;
        padding:4px 0; font-size:13px; color:#4B5563;
        font-weight:500; letter-spacing:-0.2px;
      }
      .cf-check {
        display:inline-flex; align-items:center; justify-content:center;
        width:18px; height:18px; border-radius:50%;
        background:#10B981; color:#fff;
        font-size:10px; font-weight:900;
        flex-shrink:0;
      }

      /* ── 메인 액션 ── */
      .cf-actions { display:flex; gap:10px; }
      .cf-btn-skip {
        flex:1; padding:15px; border:1.5px solid #E5E7EB; border-radius:14px;
        background:#fff; cursor:pointer; color:#4B5563;
        font-weight:700; font-size:14px;
        font-family:inherit; letter-spacing:-0.2px;
        transition: all .15s ease;
      }
      .cf-btn-skip:hover { background:#F9FAFB; border-color:#D1D5DB; }
      .cf-btn-save {
        flex:2; padding:15px; border:none; border-radius:14px;
        background:linear-gradient(135deg, #F18091 0%, #E5586E 100%);
        color:#fff; cursor:pointer; font-weight:800; font-size:15px;
        font-family:inherit; letter-spacing:-0.3px;
        box-shadow:0 4px 14px rgba(229, 88, 110, 0.32);
        transition: transform .12s ease, box-shadow .15s ease;
      }
      .cf-btn-save:hover { transform:translateY(-1px); box-shadow:0 6px 18px rgba(229, 88, 110, 0.4); }
      .cf-btn-save:active { transform:translateY(0); }

      /* ── 보조 액션 ── */
      .cf-sub-actions { display:flex; gap:8px; margin-top:14px; padding-top:14px; border-top:1px solid #F3F4F6; }
      .cf-sub-btn {
        flex:1; padding:12px; border:1px solid #E5E7EB; border-radius:12px;
        background:#fff; cursor:pointer; color:#4B5563;
        font-weight:600; font-size:13px; font-family:inherit;
        letter-spacing:-0.2px;
        transition: all .15s ease;
      }
      .cf-sub-btn:hover { background:#F9FAFB; color:#111827; border-color:#D1D5DB; }
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
        <!-- INVENTORY_HIDDEN
        <div class="cf-preview-row"><span class="cf-check">✓</span><span>소모재료 자동 차감 (프리셋 설정 기준)</span></div>
        -->
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

      <div class="cf-actions">
        <button id="cfSkip" type="button" class="cf-btn-skip">건너뛰기</button>
        <button id="cfSave" type="button" class="cf-btn-save">시술 완료</button>
      </div>
      <div class="cf-sub-actions">
        <button id="cfEditBooking" type="button" class="cf-sub-btn">예약 시간·고객 수정</button>
        <!-- INVENTORY_HIDDEN
        <button id="cfInventory" type="button" class="cf-sub-btn">재고 확인</button>
        -->
      </div>
    `;

    document.getElementById('cfSkip').addEventListener('click', _skipAndComplete);
    document.getElementById('cfSave').addEventListener('click', _saveAll);
    /* INVENTORY_HIDDEN */ // document.getElementById('cfInventory').addEventListener('click', _openInventory);
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

  /* INVENTORY_HIDDEN
  function _openInventory() {
    _close();
    if (typeof window.openInventoryHub === 'function') window.openInventoryHub();
    else if (window.showToast) window.showToast('재고 화면을 불러올 수 없어요');
  }
  */

  // 매출 미기록 — BE에 skip_revenue 플래그 전달 (리터치/재고는 그대로 처리됨)
  async function _skipAndComplete() {
    if (!_ctx.booking_id) { _close(); return; }
    // [v198] 미래 예약 완료 차단 — 자정 기준, 당일까지 허용
    if (_ctx.starts_at) {
      const bd = new Date(_ctx.starts_at); bd.setHours(0, 0, 0, 0);
      const today = new Date();            today.setHours(0, 0, 0, 0);
      if (bd > today) {
        if (window.showToast) window.showToast('아직 시술일이 안 됐어요');
        return;
      }
    }
    const btn = document.getElementById('cfSkip');
    if (btn) { btn.disabled = true; btn.textContent = '처리 중…'; }
    try {
      await _patchBooking(_ctx.booking_id, { status: 'completed', skip_revenue: true });
      _emitChange('update_booking', { booking_id: _ctx.booking_id, customer_id: _ctx.customer_id });
      // [v198] 홈 brief / 고객 리스트 / 매출 허브 캐시 명시 무효화
      try { localStorage.removeItem('hv41_cache::brief');   } catch (_e) { /* silent */ }
      try { sessionStorage.removeItem('hv41_cache::brief'); } catch (_e) { /* silent */ }
      try { localStorage.removeItem('pv_cache::customers');   } catch (_e) { /* silent */ }
      try { sessionStorage.removeItem('pv_cache::customers'); } catch (_e) { /* silent */ }
      try { sessionStorage.removeItem('rh_cache');           } catch (_e) { /* silent */ }
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
    // [v198] 미래 예약 완료 차단 — 자정 기준, 당일까지 허용
    if (_ctx.starts_at) {
      const bd = new Date(_ctx.starts_at); bd.setHours(0, 0, 0, 0);
      const today = new Date();            today.setHours(0, 0, 0, 0);
      if (bd > today) {
        if (window.showToast) window.showToast('아직 시술일이 안 됐어요');
        return;
      }
    }
    const btn = document.getElementById('cfSave');
    // [2026-05-16] amount 비어있으면 차단 — 자동 매출 기록은 amount>0 필수.
    //   매출 기록 없이 완료만 하고 싶으면 "건너뛰기" 버튼을 명확히 누르도록 유도.
    if (!_ctx.amount || _ctx.amount <= 0) {
      if (window.showToast) window.showToast('금액을 입력해 주세요. 매출 미기록 완료는 "건너뛰기"');
      const amtInput = document.getElementById('cfAmountInput');
      if (amtInput) {
        amtInput.focus();
        amtInput.parentElement?.animate?.(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
          { duration: 240, easing: 'ease-in-out' }
        );
      }
      return;
    }
    btn.disabled = true; btn.textContent = '저장 중…';
    // 사용자 인라인 편집 금액도 BE 에 전달 — BE 가 booking.amount 업데이트 후 매출 자동기록에 사용
    const payload = { status: 'completed', payment_method: _ctx.method || 'card', amount: _ctx.amount };
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
      // [v198] 홈 brief / 고객 리스트 / 매출 허브 캐시도 명시 무효화
      try { localStorage.removeItem('hv41_cache::brief');   } catch (_e) { /* silent */ }
      try { sessionStorage.removeItem('hv41_cache::brief'); } catch (_e) { /* silent */ }
      try { localStorage.removeItem('pv_cache::customers');   } catch (_e) { /* silent */ }
      try { sessionStorage.removeItem('pv_cache::customers'); } catch (_e) { /* silent */ }
      try { sessionStorage.removeItem('rh_cache');           } catch (_e) { /* silent */ }
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
        starts_at: booking.starts_at || null,  // [v198] 미래예약 가드용
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
