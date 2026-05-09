/* ─────────────────────────────────────────────────────────────
   파워뷰 — 행 옆 ⚡ 액션 메뉴 (Phase 1 Tier A · 2026-05-09)

   엑셀 대체급 운영 OS 핵심. 행에서 한 번 탭으로:
     · 고객  → 회원권 충전 / 단골 토글 / 대시보드
     · 예약  → 정상참석(+5) / 노쇼(-10) / 확인메시지 / 전화 / 고객 카드
     · 매출  → 카드↔현금 토글 / 환불 / 고객 카드
     · 재고  → +1 입고 / -1 사용 / 발주 메시지 복사
     · 후기  → 고객 카드
     · 시술  → 가격 수정

   ── 사용자 가드레일 (반드시 준수) ──
   1. 백엔드 신규 0 — 기존 window 후크만 재사용
      (openMembershipCharge / openCustomerDashboard / NoShow.* / PATCH /customers·/revenue·/services / POST /inventory/{id}/adjust)
   2. 외부 후크 미존재 시 안전하게 토스트만 띄우고 화면 유지
   3. 모든 비동기 동작 try/catch — 실패해도 popover 만 닫고 기존 화면 그대로
   4. 파일 ≤300줄

   전역:
     window._PVActions.open(triggerEl, rowData, tab)
     window._PVActions.close()
     window._PVActions.bindRowTriggers(rootEl)
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window._PVActions) return;

  const POPOVER_ID = 'pv-action-popover';

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }
  function _api() { return window.API || ''; }
  function _auth() { try { return window.authHeader ? window.authHeader() : {}; } catch (_e) { return {}; } }
  function _toast(msg) { try { if (typeof window.showToast === 'function') window.showToast(msg); } catch (_e) { /* silent */ } }
  function _haptic() { try { if (typeof window.hapticLight === 'function') window.hapticLight(); } catch (_e) { /* silent */ } }

  async function _patch(path, body) {
    const res = await fetch(_api() + path, {
      method: 'PATCH',
      headers: { ..._auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.status === 204 ? null : await res.json().catch(() => null);
  }

  async function _post(path, body) {
    const res = await fetch(_api() + path, {
      method: 'POST',
      headers: { ..._auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.status === 204 ? null : await res.json().catch(() => null);
  }

  function _emit(kind, detail) {
    try {
      window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: Object.assign({ kind }, detail || {}) }));
    } catch (_e) { /* silent */ }
  }

  function _refreshTab() {
    try {
      const tab = window._PVState && window._PVState.currentTab;
      if (!tab) return;
      try { sessionStorage.removeItem('pv_cache::' + tab); } catch (_e) { /* silent */ }
      if (window._PVInt && typeof window._PVInt.fetchTab === 'function') {
        window._PVInt.fetchTab(tab, false).then((items) => {
          if (window._PVState && window._PVState.data) window._PVState.data[tab] = items || [];
          if (window._PVRender && typeof window._PVRender.renderTab === 'function') {
            window._PVRender.renderTab(true);
          }
        }).catch(() => { /* silent */ });
      }
    } catch (_e) { /* silent */ }
  }

  // ── 탭별 액션 정의 ────────────────────────────────────
  const ACTIONS = {
    customer: (row) => [
      { icon: 'ic-credit-card', label: '회원권 충전', run: async () => {
        if (typeof window.openMembershipCharge === 'function') {
          window.openMembershipCharge(row.id, row.name || '', Number(row.membership_balance || 0));
        } else { _toast('회원권 모듈을 불러오지 못했어요'); }
      }},
      { icon: 'ic-star', label: row.is_regular ? '단골 해제' : '단골 등록', run: async () => {
        await _patch('/customers/' + row.id, { is_regular: !row.is_regular });
        _emit('update_customer', { customer_id: row.id });
        _toast(row.is_regular ? '단골 해제했어요' : '단골 등록했어요');
        _refreshTab();
      }},
      { icon: 'ic-user', label: '고객 카드 열기', run: async () => {
        if (typeof window.openCustomerDashboard === 'function') window.openCustomerDashboard(row.id);
        else _toast('고객 카드 모듈을 불러오지 못했어요');
      }},
    ],
    booking: (row) => [
      { icon: 'ic-check-circle', label: '✓ 정상 참석 (+5)', run: async () => {
        if (window.NoShow && typeof window.NoShow.markAttended === 'function') {
          await window.NoShow.markAttended(row.id);
          _emit('update_booking', { booking_id: row.id });
          _refreshTab();
        } else { _toast('노쇼 모듈을 불러오지 못했어요'); }
      }},
      { icon: 'ic-alert-triangle', label: '🚫 노쇼 표시 (-10)', run: async () => {
        if (window.NoShow && typeof window.NoShow.markNoShow === 'function') {
          await window.NoShow.markNoShow(row.id);
          _emit('update_booking', { booking_id: row.id });
          _refreshTab();
        } else { _toast('노쇼 모듈을 불러오지 못했어요'); }
      }},
      { icon: 'ic-send', label: '📤 확인 메시지 보내기', run: async () => {
        if (window.NoShow && typeof window.NoShow.sendConfirmation === 'function') {
          await window.NoShow.sendConfirmation(row.id);
        } else { _toast('확인 메시지 모듈을 불러오지 못했어요'); }
      }},
      { icon: 'ic-user', label: '고객 카드 열기', run: async () => {
        const cid = row.customer_id;
        if (cid && typeof window.openCustomerDashboard === 'function') window.openCustomerDashboard(cid);
        else _toast('연결된 고객 정보가 없어요');
      }},
    ],
    revenue: (row) => [
      { icon: 'ic-refresh-cw', label: row.method === 'card' ? '현금으로 변경' : '카드로 변경', run: async () => {
        const next = row.method === 'card' ? 'cash' : 'card';
        await _patch('/revenue/' + row.id, { method: next });
        _emit('update_revenue', { revenue_id: row.id });
        _refreshTab();
      }},
      { icon: 'ic-rotate-ccw', label: '환불 처리', run: async () => {
        if (!window.confirm('이 매출을 환불 처리할까요? (취소된 것으로 표시돼요)')) return;
        await _patch('/revenue/' + row.id, { status: 'refunded' });
        _emit('delete_revenue', { revenue_id: row.id });
        _toast('환불 처리됐어요');
        _refreshTab();
      }},
      { icon: 'ic-user', label: '고객 카드 열기', run: async () => {
        const cid = row.customer_id;
        if (cid && typeof window.openCustomerDashboard === 'function') window.openCustomerDashboard(cid);
        else _toast('연결된 고객 정보가 없어요');
      }},
    ],
    inventory: (row) => [
      { icon: 'ic-plus', label: '+1 입고', run: async () => {
        await _post('/inventory/' + row.id + '/adjust', { delta: 1, reason: 'in' });
        _emit('update_inventory', { inventory_id: row.id });
        _refreshTab();
      }},
      { icon: 'ic-minus', label: '-1 사용', run: async () => {
        await _post('/inventory/' + row.id + '/adjust', { delta: -1, reason: 'use' });
        _emit('update_inventory', { inventory_id: row.id });
        _refreshTab();
      }},
      { icon: 'ic-message-square', label: '발주 메시지 복사', run: async () => {
        const qty = Math.max(Number(row.threshold || 3) * 2, 5);
        const txt = `[발주 부탁] ${row.name || '품목'} ${qty}${row.unit || '개'}`;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(txt);
            _toast('발주 메시지 복사됐어요');
          } else { _toast(txt); }
        } catch (_e) { _toast(txt); }
      }},
    ],
    nps: (row) => [
      { icon: 'ic-user', label: '고객 카드 열기', run: async () => {
        const cid = row.customer_id;
        if (cid && typeof window.openCustomerDashboard === 'function') window.openCustomerDashboard(cid);
        else _toast('연결된 고객 정보가 없어요');
      }},
    ],
    service: (row) => [
      { icon: 'ic-edit-3', label: '가격 수정', run: async () => {
        const cur = Number(row.default_price || 0);
        const next = window.prompt('새 기본 금액 (원):', String(cur));
        if (next == null) return;
        const n = Number(String(next).replace(/[^0-9.\-]/g, ''));
        if (!Number.isFinite(n) || n < 0) { _toast('숫자만 입력해주세요'); return; }
        await _patch('/services/' + row.id, { default_price: n });
        _emit('update_service', { service_id: row.id });
        _refreshTab();
      }},
    ],
  };

  // ── popover 닫기 ──────────────────────────────────────
  function _close() {
    try {
      const el = document.getElementById(POPOVER_ID);
      if (el) el.remove();
    } catch (_e) { /* silent */ }
    document.removeEventListener('click', _onDocClick, true);
    document.removeEventListener('keydown', _onKey);
    window.removeEventListener('resize', _close);
    window.removeEventListener('scroll', _close, true);
  }

  function _onDocClick(e) {
    const el = document.getElementById(POPOVER_ID);
    if (!el) return;
    if (el.contains(e.target)) return;
    if (e.target.closest && e.target.closest('[data-pv-actions-trigger]')) return;
    _close();
  }
  function _onKey(e) { if (e.key === 'Escape') _close(); }

  // ── popover 열기 ──────────────────────────────────────
  function open(triggerEl, rowData, tab) {
    try {
      _close();
      const builder = ACTIONS[tab];
      if (typeof builder !== 'function') return;
      const items = (builder(rowData) || []).filter(Boolean);
      if (!items.length) return;

      const pop = document.createElement('div');
      pop.id = POPOVER_ID;
      pop.className = 'pv-action-popover';
      pop.innerHTML = items.map((it, idx) => `
        <button type="button" class="pv-action-item" data-pv-action-idx="${idx}">
          <svg width="14" height="14" aria-hidden="true"><use href="#${_esc(it.icon || 'ic-chevron-right')}"/></svg>
          <span>${_esc(it.label)}</span>
        </button>
      `).join('');

      const r = triggerEl.getBoundingClientRect();
      pop.style.position = 'fixed';
      pop.style.zIndex = '10010';
      pop.style.minWidth = '180px';
      pop.style.right = (window.innerWidth - r.right) + 'px';
      pop.style.top = (r.bottom + 6) + 'px';
      document.body.appendChild(pop);

      // 화면 아래로 넘치면 위로 뒤집기
      const pr = pop.getBoundingClientRect();
      if (pr.bottom > window.innerHeight - 8) {
        pop.style.top = (r.top - pr.height - 6) + 'px';
      }
      // 좌측 끝이 음수면 left 로 뒤집기
      if (pr.left < 8) {
        pop.style.right = '';
        pop.style.left = '8px';
      }

      pop.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-pv-action-idx]');
        if (!btn) return;
        const idx = Number(btn.getAttribute('data-pv-action-idx'));
        const action = items[idx];
        _close();
        if (!action || typeof action.run !== 'function') return;
        try {
          _haptic();
          await action.run();
        } catch (err) {
          console.warn('[PVActions] action failed', err);
          _toast('작업 중 문제가 생겼어요. 다시 시도해주세요');
        }
      });

      // 외부 클릭/Esc/스크롤 로 닫기
      setTimeout(() => {
        document.addEventListener('click', _onDocClick, true);
        document.addEventListener('keydown', _onKey);
        window.addEventListener('resize', _close);
        window.addEventListener('scroll', _close, true);
      }, 50);
    } catch (e) {
      console.warn('[PVActions] open failed', e);
    }
  }

  function bindRowTriggers(root) {
    if (!root) return;
    try {
      root.querySelectorAll('[data-pv-actions-trigger]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const rowId = btn.getAttribute('data-row-id');
          const tab = window._PVState && window._PVState.currentTab;
          if (!rowId || !tab) return;
          const list = (window._PVState.data && window._PVState.data[tab]) || [];
          const row = list.find((r) => String(r.id) === String(rowId));
          if (!row) { _toast('행 정보를 찾지 못했어요'); return; }
          open(btn, row, tab);
        });
      });
    } catch (e) {
      console.warn('[PVActions] bindRowTriggers', e);
    }
  }

  window._PVActions = { open, close: _close, bindRowTriggers };
})();
