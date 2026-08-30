/* ─────────────────────────────────────────────────────────────
   시술 완료 시트 (2026-05-29 재디자인)

   - 메인홈 톤: 0.5px solid #E5E8EB · radius 14px · padding 16px
   - 노쇼 모드는 같은 시트 안에서 setMode('noshow') 로 전환
   - 옵션 토글: 매출 포함 / 시술 주기 기록 (페이드 설명)

   공개 API:
   - CompleteFlow.startFromBooking(booking)
   - CompleteFlow.show({customer_id, customer_name, service_name, default_amount})
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  let _ctx = null;
  let _busy = false; // [카오스 P1-3] 완료/노쇼/취소 종결액션 상호배제 (in-flight 중복 PATCH 방지)

  const METHODS = [
    { key: 'card',       label: '카드' },
    { key: 'cash',       label: '현금' },
    { key: 'transfer',   label: '계좌' },
    { key: 'membership', label: '회원권' },
  ];
  const NOSHOW_METHODS = [
    { key: 'card',     label: '카드' },
    { key: 'cash',     label: '현금' },
    { key: 'transfer', label: '계좌' },
    { key: 'none',     label: '없음' },
  ];

  function _esc(s) { return window._esc(s); } /* [2026-06-11] 중복 제거 — app-core 정본 위임 */
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
      if (amount) { _ctx.amount = amount; _render(); }
    } catch (e) { console.warn('[complete-flow] 기본 금액 자동입력 실패:', e); }
  }

  async function _hydrateVisitCount() {
    if (!_ctx?.customer_id || _ctx.visit_count != null) return;
    try {
      const res = await apiFetch('/customers/' + _ctx.customer_id, { headers: window.authHeader() });
      if (res.ok) {
        const c = await res.json();
        _ctx.visit_count = Number(c?.visit_count || 0);
        _render();
      }
    } catch (e) { /* 옵셔널 */ }
  }

  function _emitChange(kind, extra) {
    try {
      window.dispatchEvent(new CustomEvent('itdasy:data-changed', {
        detail: { kind, optimistic: false, ...(extra || {}) },
      }));
    } catch (e) { console.warn('[complete-flow] 화면 갱신 알림 실패:', e); }
  }
  function _refreshConnectedViews() {
    try { if (window.Dashboard?.refresh)  Promise.resolve(window.Dashboard.refresh(true)).catch(_e => { void _e; }); } catch(e){ void e; }
    try { if (window.MyShopV3?.refresh)   Promise.resolve(window.MyShopV3.refresh()).catch(_e => { void _e; }); } catch(e){ void e; }
    try { if (window.RevenueHub?.refresh) Promise.resolve(window.RevenueHub.refresh()).catch(_e => { void _e; }); } catch(e){ void e; }
  }

  async function _apiPatch(path, body) {
    const res = await apiFetch(path, {
      method: 'PATCH',
      headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }
  function _patchBooking(id, patch) {
    if (window.Booking?.update) return window.Booking.update(id, patch);
    return _apiPatch('/bookings/' + id, patch);
  }

  function _invalidateAllCaches() {
    ['today', 'week', 'month'].forEach(p => {
      try { localStorage.removeItem('pv_cache::revenue::' + p); } catch (e) { void e; }
      try { sessionStorage.removeItem('pv_cache::revenue::' + p); } catch (e) { void e; }
    });
    ['hv41_cache::brief', 'pv_cache::customers', 'rh_cache', 'pv_cache::dashboard'].forEach(k => {
      try { localStorage.removeItem(k); } catch (e) { void e; }
      try { sessionStorage.removeItem(k); } catch (e) { void e; }
    });
  }

  function _ensureSheet() {
    let sheet = document.getElementById('completeFlowSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'completeFlowSheet';
    sheet.className = 'cf-backdrop';
    sheet.innerHTML = `<div class="cf-card" id="cfCard"><div id="cfRoot"></div></div>`;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) _close(); });
    _ensureStyles();
    return sheet;
  }

  function _ensureStyles() {
    if (document.getElementById('cfStyles')) return;
    const s = document.createElement('style');
    s.id = 'cfStyles';
    s.textContent = `
      .cf-backdrop { position:fixed; inset:0; z-index:10000; display:none;
        background:rgba(0,0,0,0.5); align-items:center; justify-content:center; padding:16px; }
      .cf-card { color-scheme:light; width:100%; max-width:420px; background:#fff; color:#191F28;
        border:0.5px solid #E5E8EB; border-radius:14px; overflow:hidden;
        box-shadow:0 12px 40px rgba(0,0,0,0.12);
        animation: cfFadeIn .2s cubic-bezier(.2,.7,.2,1);
        transition: background .2s ease; }
      .cf-card.cf-noshow { background:#FAFAFB; }
      @keyframes cfFadeIn { from { transform:translateY(8px) scale(.985); opacity:0; } to { transform:none; opacity:1; } }

      /* 헤더 */
      .cf-hd { display:flex; align-items:center; justify-content:space-between; padding:12px 12px 0; min-height:32px; }
      .cf-hd-left { display:flex; align-items:center; gap:4px; }
      .cf-hd-right { display:flex; align-items:center; gap:2px; }
      .cf-iconbtn { width:32px; height:32px; border:none; background:transparent; cursor:pointer;
        color:#4E5968; font-size:16px; border-radius:8px; transition:background .12s; padding:0;
        display:inline-flex; align-items:center; justify-content:center; font-family:inherit; }
      .cf-iconbtn:hover { background:#F2F4F6; }
      .cf-back { font-size:13px; color:#8B95A1; padding:0 8px; height:32px; border:none; background:transparent;
        cursor:pointer; border-radius:8px; font-family:inherit; letter-spacing:-0.2px; }
      .cf-back:hover { background:#F2F4F6; color:#4E5968; }
      .cf-menu-wrap { position:relative; }
      .cf-menu-pop { position:absolute; top:36px; right:0; min-width:180px; background:#fff;
        border:0.5px solid #E5E8EB; border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,0.1);
        padding:4px; z-index:5; display:none; }
      .cf-menu-pop.open { display:block; }
      .cf-menu-item { display:block; width:100%; padding:10px 12px; border:none; background:transparent;
        text-align:left; font-size:13px; color:#191F28; cursor:pointer; border-radius:8px;
        font-family:inherit; letter-spacing:-0.2px; }
      .cf-menu-item:hover { background:#F7F8FA; }

      /* 고객 영역 */
      .cf-cust { display:flex; align-items:center; gap:10px; padding:4px 16px 18px; }
      .cf-bar { width:3px; height:44px; border-radius:2px; background:#BC6675; flex-shrink:0; }
      .cf-card.cf-noshow .cf-bar { background:#8B95A1; }
      .cf-cust-text { flex:1; min-width:0; }
      .cf-name-row { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
      .cf-name { font-size:18px; font-weight:500; color:#191F28; letter-spacing:-0.4px; }
      .cf-badge { font-size:11px; padding:1px 6px; border-radius:999px; font-weight:600; letter-spacing:-0.1px; }
      .cf-badge-gray { background:#F2F4F6; color:#8B95A1; }
      .cf-badge-green { background:#E1F5EE; color:#16B55E; }
      .cf-badge-pink { background:#F7EFF0; color:#BC6675; }
      .cf-badge-red { background:#FDECEC; color:#E5484D; }
      .cf-sub { font-size:12px; color:#8B95A1; margin-top:3px; letter-spacing:-0.2px; }

      /* 잇비 한마디 (노쇼) */
      .cf-itby { margin:0 16px 12px; padding:8px 10px; background:#fff;
        border:0.5px solid #F0F1F4; border-radius:8px; font-size:12px; color:#4E5968;
        letter-spacing:-0.2px; line-height:1.5; }
      .cf-itby b { color:#191F28; font-weight:600; }

      /* 금액 섹션 */
      .cf-sec { padding:16px; border-top:0.5px solid #F0F1F4; }
      .cf-label { font-size:11px; color:#8B95A1; font-weight:500; letter-spacing:-0.2px; margin-bottom:8px; }
      .cf-amt-row { display:flex; align-items:baseline; gap:4px; border-bottom:1.5px solid #191F28; padding-bottom:6px; }
      .cf-amt-input { flex:1; min-width:0; border:none; outline:none; background:transparent;
        font-size:26px; font-weight:500; color:#191F28; text-align:right; letter-spacing:-0.5px;
        font-family:inherit; padding:0; }
      .cf-unit { font-size:14px; color:#8B95A1; }
      .cf-chips { display:flex; justify-content:flex-end; gap:6px; margin-top:10px; flex-wrap:wrap; }
      .cf-chip { padding:7px 14px; border:0.5px solid #E5E8EB; border-radius:999px; background:#fff;
        color:#4E5968; font-size:12px; font-weight:500; cursor:pointer; font-family:inherit;
        letter-spacing:-0.2px; transition: background .12s, color .12s; }
      .cf-chip:hover { background:#F7F8FA; color:#191F28; }

      /* 결제수단 */
      .cf-pay-grid { display:grid; grid-template-columns:repeat(4, 1fr); gap:6px; }
      .cf-pay { padding:11px 0; border:0.5px solid #E5E8EB; border-radius:10px; background:#fff;
        color:#4E5968; font-size:12px; font-weight:500; cursor:pointer; font-family:inherit;
        letter-spacing:-0.2px; transition: background .12s, color .12s, border-color .12s; }
      .cf-pay:hover { background:#F7F8FA; }
      .cf-pay.on { background:#191F28; color:#fff; border-color:#191F28; }

      /* 옵션 토글 */
      .cf-opts { padding:6px 16px; }
      .cf-opt-row { display:flex; align-items:center; justify-content:space-between; gap:12px;
        padding:14px 0; border-bottom:0.5px solid #F0F1F4; cursor:pointer; }
      .cf-opt-row:last-child { border-bottom:none; }
      .cf-opt-text { flex:1; min-width:0; }
      .cf-opt-label { font-size:13px; font-weight:500; color:#191F28; letter-spacing:-0.2px; }
      .cf-opt-desc { font-size:11px; color:#8B95A1; height:14px; overflow:hidden; line-height:14px;
        margin-top:2px; transition: opacity .25s ease; letter-spacing:-0.2px; }
      .cf-toggle { width:38px; height:22px; border-radius:999px; background:#D1D6DB; position:relative;
        flex-shrink:0; transition: background .2s ease; cursor:pointer; }
      .cf-toggle.on { background:#16B55E; }
      .cf-toggle::after { content:''; position:absolute; top:2px; left:2px; width:18px; height:18px;
        border-radius:50%; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,0.15);
        transition: transform .2s ease; }
      .cf-toggle.on::after { transform:translateX(16px); }

      /* CTA */
      .cf-cta-wrap { padding:6px 16px 14px; }
      .cf-cta { width:100%; padding:15px; border:none; border-radius:12px; background:#191F28;
        color:#fff; font-size:14px; font-weight:500; cursor:pointer; font-family:inherit;
        letter-spacing:-0.3px; transition: background .12s; }
      .cf-cta:hover { background:#3D434D; }
      .cf-cta.cf-cta-noshow { background:#3D434D; }
      .cf-cta.cf-cta-noshow:hover { background:#191F28; }
      .cf-cta:disabled { opacity:0.6; cursor:default; }
      .cf-sub-acts { display:flex; justify-content:center; gap:14px; margin-top:12px; }
      .cf-link { background:transparent; border:none; color:#8B95A1; font-size:12px;
        text-decoration:underline; cursor:pointer; font-family:inherit; padding:4px 6px;
        letter-spacing:-0.2px; }
      .cf-link:hover { color:#4E5968; }
    `;
    document.head.appendChild(s);
  }

  function _visitBadge(n) {
    if (n == null) return '';
    if (n >= 10) return `<span class="cf-badge cf-badge-pink">${n}회</span>`;
    if (n >= 3)  return `<span class="cf-badge cf-badge-green">${n}회</span>`;
    return `<span class="cf-badge cf-badge-gray">${n}회</span>`;
  }
  function _subtitle() {
    const parts = [];
    if (_ctx.service_name) parts.push(_ctx.service_name);
    if (_ctx.starts_at) {
      try {
        const d = new Date(_ctx.starts_at);
        const wk = ['일','월','화','수','목','금','토'][d.getDay()];
        const hh = String(d.getHours()).padStart(2,'0');
        const mm = String(d.getMinutes()).padStart(2,'0');
        parts.push(`${d.getMonth()+1}/${d.getDate()}(${wk}) ${hh}:${mm}`);
      } catch (e) { void e; }
    }
    return parts.join(' · ');
  }

  function _renderComplete() {
    const c = _ctx;
    const visit = _visitBadge(c.visit_count);
    const sub = _subtitle();
    const valStr = c.amount ? Number(c.amount).toLocaleString('ko-KR') : '';
    const methodsHtml = METHODS.map(m =>
      `<button class="cf-pay ${m.key === c.method ? 'on' : ''}" data-method="${m.key}" type="button">${m.label}</button>`
    ).join('');
    return `
      <div class="cf-hd">
        <div class="cf-hd-left"></div>
        <div class="cf-hd-right">
          <div class="cf-menu-wrap">
            <button class="cf-iconbtn" id="cfMenuBtn" aria-label="더보기" type="button">⋯</button>
            <div class="cf-menu-pop" id="cfMenuPop">
              <button class="cf-menu-item" id="cfEditBooking" type="button">예약 시간·고객 수정</button>
            </div>
          </div>
          <button class="cf-iconbtn" id="cfClose" aria-label="닫기" type="button">✕</button>
        </div>
      </div>
      <div class="cf-cust">
        <div class="cf-bar"></div>
        <div class="cf-cust-text">
          <div class="cf-name-row"><span class="cf-name">${_esc(c.customer_name || '고객')}</span>${visit}</div>
          ${sub ? `<div class="cf-sub">${_esc(sub)}</div>` : ''}
        </div>
      </div>
      <div class="cf-sec">
        <div class="cf-label">시술 금액</div>
        <div class="cf-amt-row">
          <input class="cf-amt-input" id="cfAmtInput" type="text" inputmode="numeric" pattern="[0-9,]*"
            value="${_esc(valStr)}" placeholder="0" />
          <span class="cf-unit">원</span>
        </div>
        <div class="cf-chips">
          <button class="cf-chip" data-add="10000" type="button">+1만</button>
          <button class="cf-chip" data-add="50000" type="button">+5만</button>
          <button class="cf-chip" data-add="100000" type="button">+10만</button>
        </div>
      </div>
      <div class="cf-sec">
        <div class="cf-label">결제수단</div>
        <div class="cf-pay-grid">${methodsHtml}</div>
      </div>
      <div class="cf-opts">
        <div class="cf-opt-row" data-opt="includeRevenue"${c.method === 'membership' ? ' style="opacity:.55;pointer-events:none"' : ''}>
          <div class="cf-opt-text">
            <div class="cf-opt-label">매출에 포함</div>
            <div class="cf-opt-desc">${c.method === 'membership' ? '회원권 차감은 항상 기록돼요' : (c.includeRevenue ? '이번달 매출에 더해요' : '매출에서 빠져요')}</div>
          </div>
          <div class="cf-toggle ${(c.method === 'membership' || c.includeRevenue) ? 'on' : ''}"></div>
        </div>
        <div class="cf-opt-row" data-opt="learnCycle">
          <div class="cf-opt-text">
            <div class="cf-opt-label">시술 주기 기록</div>
            <div class="cf-opt-desc">${c.learnCycle ? '잇비가 다음 시기 알려드려요' : '잇비 학습에서 빠져요'}</div>
          </div>
          <div class="cf-toggle ${c.learnCycle ? 'on' : ''}"></div>
        </div>
      </div>
      <div class="cf-cta-wrap">
        <button class="cf-cta" id="cfSave" type="button">시술 완료</button>
        <div class="cf-sub-acts">
          <button class="cf-link" id="cfNoShow" type="button">노쇼 처리</button>
          <button class="cf-link" id="cfCancel" type="button">예약 취소</button>
        </div>
      </div>
    `;
  }

  function _renderNoShow() {
    const c = _ctx;
    const sub = _subtitle();
    const valStr = c.deposit ? Number(c.deposit).toLocaleString('ko-KR') : '';
    const methodsHtml = NOSHOW_METHODS.map(m =>
      `<button class="cf-pay ${m.key === c.depositMethod ? 'on' : ''}" data-method="${m.key}" type="button">${m.label}</button>`
    ).join('');
    return `
      <div class="cf-hd">
        <div class="cf-hd-left">
          <button class="cf-back" id="cfBack" type="button">‹ 되돌리기</button>
        </div>
        <div class="cf-hd-right">
          <button class="cf-iconbtn" id="cfClose" aria-label="닫기" type="button">✕</button>
        </div>
      </div>
      <div class="cf-cust">
        <div class="cf-bar"></div>
        <div class="cf-cust-text">
          <div class="cf-name-row">
            <span class="cf-name">${_esc(c.customer_name || '고객')}</span>
            <span class="cf-badge cf-badge-red">노쇼</span>
          </div>
          ${sub ? `<div class="cf-sub">${_esc(sub)} · 미방문</div>` : `<div class="cf-sub">미방문</div>`}
        </div>
      </div>
      <div class="cf-itby">
        놓치셨네요. 받으신 <b>예약금</b>만 매출에 잡고 ${_esc(c.customer_name || '')}님 기록엔 <b>미방문</b>으로 남길게요.
      </div>
      <div class="cf-sec">
        <div class="cf-label">받은 예약금</div>
        <div class="cf-amt-row">
          <input class="cf-amt-input" id="cfAmtInput" type="text" inputmode="numeric" pattern="[0-9,]*"
            value="${_esc(valStr)}" placeholder="0" />
          <span class="cf-unit">원</span>
        </div>
        <div class="cf-chips">
          <button class="cf-chip" data-add="10000" type="button">+1만</button>
          <button class="cf-chip" data-add="30000" type="button">+3만</button>
          <button class="cf-chip" data-add="50000" type="button">+5만</button>
        </div>
      </div>
      <div class="cf-sec">
        <div class="cf-label">예약금 결제수단</div>
        <div class="cf-pay-grid">${methodsHtml}</div>
      </div>
      <div class="cf-cta-wrap" style="padding-top:14px;">
        <button class="cf-cta cf-cta-noshow" id="cfSaveNoShow" type="button">노쇼로 기록</button>
      </div>
    `;
  }

  function _bindAmountInput(id, key) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', (e) => {
      const raw = e.target.value.replace(/[^0-9]/g, '');
      const num = parseInt(raw, 10);
      _ctx[key] = Number.isFinite(num) && num > 0 ? num : null;
      e.target.value = _ctx[key] ? _ctx[key].toLocaleString('ko-KR') : '';
    });
  }

  function _render() {
    const card = document.getElementById('cfCard');
    const root = document.getElementById('cfRoot');
    if (!card || !root) return;
    card.classList.toggle('cf-noshow', _ctx.mode === 'noshow');
    root.innerHTML = _ctx.mode === 'noshow' ? _renderNoShow() : _renderComplete();

    document.getElementById('cfClose')?.addEventListener('click', _close);

    if (_ctx.mode === 'noshow') {
      document.getElementById('cfBack')?.addEventListener('click', () => { _ctx.mode = 'complete'; _render(); });
      _bindAmountInput('cfAmtInput', 'deposit');
      document.querySelectorAll('.cf-chip').forEach(b => b.addEventListener('click', () => {
        _ctx.deposit = (_ctx.deposit || 0) + Number(b.dataset.add || 0);
        _render();
      }));
      document.querySelectorAll('.cf-pay').forEach(b => b.addEventListener('click', () => {
        _ctx.depositMethod = b.dataset.method; _render();
      }));
      document.getElementById('cfSaveNoShow')?.addEventListener('click', _saveNoShow);
      return;
    }

    // complete mode
    const menuBtn = document.getElementById('cfMenuBtn');
    const menuPop = document.getElementById('cfMenuPop');
    menuBtn?.addEventListener('click', (e) => { e.stopPropagation(); menuPop?.classList.toggle('open'); });
    document.addEventListener('click', _closeMenuOutside, { once: true });
    document.getElementById('cfEditBooking')?.addEventListener('click', () => {
      const id = _ctx.booking_id; _close();
      if (id) window.dispatchEvent(new CustomEvent('itdasy:open-booking-edit', { detail: { booking_id: id } }));
    });
    _bindAmountInput('cfAmtInput', 'amount');
    document.querySelectorAll('.cf-chip').forEach(b => b.addEventListener('click', () => {
      _ctx.amount = (_ctx.amount || 0) + Number(b.dataset.add || 0);
      _render();
    }));
    document.querySelectorAll('.cf-pay').forEach(b => b.addEventListener('click', () => {
      _ctx.method = b.dataset.method;
      // [P0-2b] 회원권 = 차감 원장이 곧 기록 — 매출 제외 불가, 토글 자동 ON 고정
      if (_ctx.method === 'membership') _ctx.includeRevenue = true;
      _render();
    }));
    document.querySelectorAll('.cf-opt-row').forEach(row => row.addEventListener('click', () => {
      const k = row.dataset.opt;
      if (k === 'includeRevenue' && _ctx.method === 'membership') return; // [P0-2b] 잠금
      _ctx[k] = !_ctx[k]; _render();
    }));
    document.getElementById('cfSave')?.addEventListener('click', _saveAll);
    document.getElementById('cfNoShow')?.addEventListener('click', () => {
      _ctx.mode = 'noshow';
      if (_ctx.depositMethod == null) _ctx.depositMethod = 'cash';
      _render();
    });
    document.getElementById('cfCancel')?.addEventListener('click', _cancelBooking);
  }

  function _closeMenuOutside() {
    document.getElementById('cfMenuPop')?.classList.remove('open');
  }

  async function _saveAll() {
    if (_busy) return;
    if (_ctx.starts_at) {
      const bd = new Date(_ctx.starts_at); bd.setHours(0, 0, 0, 0);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (bd > today) { if (window.showToast) window.showToast('아직 시술일이 안 됐어요'); return; }
    }
    const btn = document.getElementById('cfSave');
    const includeRev = _ctx.method === 'membership' ? true : (_ctx.includeRevenue !== false); // [P0-2b] 회원권은 항상 기록
    if (includeRev && (!_ctx.amount || _ctx.amount <= 0)) {
      if (window.showToast) window.showToast('금액을 입력해 주세요');
      document.getElementById('cfAmtInput')?.focus();
      return;
    }
    const ctx = _ctx; // [카오스 P1-2] 저장 중 다른 예약이 열려도 오염 방지 — 시작 시점 컨텍스트 고정
    _busy = true;
    btn.disabled = true; btn.textContent = '저장 중…';
    const payload = { status: 'completed', payment_method: ctx.method || 'card' };
    if (includeRev) payload.amount = ctx.amount;
    else payload.skip_revenue = true;
    if (ctx.learnCycle === false) payload.skip_retouch = true;
    try {
      const res = await _patchBooking(ctx.booking_id, payload);
      if (_ctx !== ctx) return; // 저장 대기 중 다른 예약으로 교체됨 — 현 소유자 건드리지 않음
      _busy = false;
      const eff = res?.completion_effects || {};
      _invalidateAllCaches();
      _emitChange('update_booking', { booking_id: ctx.booking_id, customer_id: ctx.customer_id });
      if (eff.revenue_created) _emitChange('create_revenue', { booking_id: ctx.booking_id, customer_id: ctx.customer_id, revenue_id: eff.revenue_id });
      if (window.hapticSuccess) window.hapticSuccess();
      if (window.showToast) {
        if (eff.membership_deducted) window.showToast(`회원권 ${_fmt(eff.membership_deducted)} 차감 완료`);
        else if (eff.revenue_created) window.showToast(`${_fmt(ctx.amount)} 매출 자동 기록됨`);
        else window.showToast('예약 완료 (매출 미기록)');
      }
      _close();
      _refreshConnectedViews();
    } catch (e) {
      if (_ctx !== ctx) return;
      _busy = false;
      btn.disabled = false; btn.textContent = '시술 완료';
      if (window.showToast) window.showToast('실패: ' + (e.message || ''));
    }
  }

  async function _saveNoShow() {
    if (_busy) return;
    if (!_ctx.booking_id) { _close(); return; }
    const btn = document.getElementById('cfSaveNoShow');
    const dep = _num(_ctx.deposit) || 0;
    const method = _ctx.depositMethod || 'cash';
    const ctx = _ctx; // [카오스 P1-2] 처리 중 다른 예약 열려도 오염 방지
    _busy = true;
    btn.disabled = true; btn.textContent = '처리 중…';
    try {
      const payload = (dep > 0 && method !== 'none')
        ? { status: 'no_show', deposit: dep, payment_method: method,
            customer_name: ctx.customer_name || null }
        : { status: 'no_show', skip_revenue: true,
            customer_name: ctx.customer_name || null };
      await _patchBooking(ctx.booking_id, payload);
      if (_ctx !== ctx) return;
      _busy = false;
      _emitChange('update_booking', { booking_id: ctx.booking_id, customer_id: ctx.customer_id });
      if (dep > 0 && method !== 'none') _emitChange('create_revenue', { booking_id: ctx.booking_id, customer_id: ctx.customer_id });
      _invalidateAllCaches();
      if (window.showToast) {
        window.showToast(dep > 0 && method !== 'none'
          ? `노쇼 · 예약금 ${dep.toLocaleString('ko-KR')}원 매출 기록`
          : '노쇼 처리됐어요');
      }
      _close();
      _refreshConnectedViews();
    } catch (e) {
      if (_ctx !== ctx) return;
      _busy = false;
      btn.disabled = false; btn.textContent = '노쇼로 기록';
      if (window.showToast) window.showToast('처리 실패: ' + (e.message || ''));
    }
  }

  async function _cancelBooking() {
    if (!_ctx.booking_id) { _close(); return; }
    // [2026-06-10] 네이티브 confirm → 인라인 다이얼로그 (UI 전체 블로킹 + 디자인 이질감 제거)
    if (window._inlineConfirm) { window._inlineConfirm('이 예약을 취소할까요?', () => _doCancelBooking()); return; }
    if (!window.confirm('이 예약을 취소할까요?')) return;
    return _doCancelBooking();
  }

  async function _doCancelBooking() {
    if (_busy) return;
    const btn = document.getElementById('cfCancel');
    if (btn) { btn.disabled = true; btn.textContent = '처리 중…'; }
    const ctx = _ctx; // [카오스 P1-2] 취소 대기 중 다른 예약 열려도 오염 방지
    _busy = true;
    try {
      await _patchBooking(ctx.booking_id, { status: 'cancelled' });
      if (_ctx !== ctx) return;
      _busy = false;
      _emitChange('update_booking', { booking_id: ctx.booking_id, customer_id: ctx.customer_id });
      _invalidateAllCaches();
      if (window.showToast) window.showToast('예약이 취소됐어요');
      _close();
      _refreshConnectedViews();
    } catch (e) {
      if (_ctx !== ctx) return;
      _busy = false;
      if (btn) { btn.disabled = false; btn.textContent = '예약 취소'; }
      if (window.showToast) window.showToast('취소 실패: ' + (e.message || ''));
    }
  }

  function _close() {
    _busy = false; // [카오스] 시트 닫으면 배제 해제 — 다음 시트 잠금 방지
    const sheet = document.getElementById('completeFlowSheet');
    if (sheet) sheet.style.display = 'none';
    document.body.style.overflow = '';
  }

  function _openWith(ctx) {
    _busy = false; // [카오스] 새 예약 열면 이전 in-flight 배제 해제
    _ctx = Object.assign({
      mode: 'complete',
      includeRevenue: true,
      learnCycle: true,
      visit_count: null,
      deposit: 0,
      depositMethod: 'cash',
    }, ctx);
    _ensureSheet();
    document.getElementById('completeFlowSheet').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    _render();
    _hydrateAmountFromServices();
    _hydrateVisitCount();
  }

  window.CompleteFlow = {
    startFromBooking(booking) {
      if (!booking) return;
      _openWith({
        booking_id: booking.id,
        customer_id: booking.customer_id || null,
        customer_name: booking.customer_name || null,
        service_name: booking.service_name || null,
        amount: _num(booking.amount) || _servicePriceFor(booking.service_name),
        method: booking.payment_method || 'card',
        starts_at: booking.starts_at || null,
        deposit: _num(booking.deposit) || 0,
        visit_count: booking.visit_count != null ? Number(booking.visit_count) : null,
      });
    },
    show(opts) {
      _openWith({
        booking_id: opts?.booking_id || null,
        customer_id: opts?.customer_id || null,
        customer_name: opts?.customer_name || null,
        service_name: opts?.service_name || null,
        amount: _num(opts?.default_amount) || _servicePriceFor(opts?.service_name),
        method: 'card',
      });
    },
  };
  window.closeCompleteFlow = _close;
})();
