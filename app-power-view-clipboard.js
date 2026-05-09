/* ─────────────────────────────────────────────────────────────
   파워뷰 — 복사 / 붙여넣기 (Phase 2 · 2026-05-09)

   엑셀 호환 TSV (Tab-Separated Values) 양방향:
   · 다중선택된 행 → Cmd/Ctrl+C → clipboard TSV
   · clipboard TSV → 빈 행에 Cmd/Ctrl+V → 일괄 추가 (qadd 매핑 활용)

   ── 가드레일 ──
   1. 백엔드 신규 0 — 기존 qadd endpoint 재사용
   2. input/textarea focus 상태에선 브라우저 기본 양보
   3. 파워뷰 overlay 안에서만 캡처
   4. 파일 ≤300줄
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window._PVClipboard) return;

  function _toast(msg) { try { if (typeof window.showToast === 'function') window.showToast(msg); } catch (_e) { /* silent */ } }
  function _api() { return window.API || ''; }
  function _auth() { try { return window.authHeader ? window.authHeader() : {}; } catch (_e) { return {}; } }

  function _selectedRows() {
    try {
      const tab = window._PVState && window._PVState.currentTab;
      if (!tab) return { tab: null, rows: [] };
      const data = (window._PVState.data && window._PVState.data[tab]) || [];
      // 다중선택 모듈 활성 시 선택된 행, 아니면 화면 표시된 모든 행
      const selectIds = (window._PVSelect && typeof window._PVSelect.getSelected === 'function')
        ? window._PVSelect.getSelected()
        : null;
      // _PVSelect 가 getSelected 미제공 → DOM 기반 fallback
      let selected = new Set();
      if (selectIds) selected = new Set(selectIds);
      else {
        document.querySelectorAll('#pv-tbody tr.pv-row-selected[data-id]').forEach((tr) => {
          selected.add(String(tr.getAttribute('data-id')));
        });
      }
      if (selected.size === 0) {
        // 선택 없으면 현재 화면 표시된 모든 행
        const visible = Array.from(document.querySelectorAll('#pv-tbody tr[data-id]'))
          .map((tr) => String(tr.getAttribute('data-id')));
        return { tab, rows: data.filter((r) => visible.includes(String(r.id))) };
      }
      return { tab, rows: data.filter((r) => selected.has(String(r.id))) };
    } catch (_e) {
      return { tab: null, rows: [] };
    }
  }

  // 탭별 직렬화 컬럼 — Export 와 동일 정의 재사용 가능하나 자체 구성
  const SERIALIZE = {
    customer:  (r) => [r.name, r.phone, r.memo, r.is_regular ? 'Y' : '', Number(r.membership_balance || 0)],
    booking:   (r) => [r.customer_name, r.service_name, (r.starts_at || '').replace('T', ' ').slice(0, 16), Number(r.duration_min || 60), r.status || 'confirmed'],
    revenue:   (r) => [r.customer_name, r.service_name, Number(r.amount || 0), r.method || 'card'],
    inventory: (r) => [r.name, Number(r.quantity || 0), r.unit || '', Number(r.threshold || 0), r.category || ''],
    nps:       (r) => [Number(r.rating || 0), r.comment || '', r.source || ''],
    service:   (r) => [r.name, Number(r.default_price || 0), Number(r.default_duration_min || 0), r.category || ''],
  };

  // 붙여넣기 시 row 매핑 (복사 직렬화의 역)
  const PARSE = {
    customer:  ([name, phone, memo, regular, balance]) => ({
      name: (name || '').trim(),
      phone: (phone || '').trim() || null,
      memo: (memo || '').trim() || '',
      is_regular: /^[YyㅇO]$/.test(String(regular || '').trim()),
      membership_balance: Number(balance || 0) || 0,
      tags: [],
    }),
    booking: ([customer_name, service_name, starts, duration, status]) => ({
      customer_name: (customer_name || '').trim() || null,
      service_name:  (service_name || '').trim() || null,
      starts_at: (starts || '').trim().replace(' ', 'T'),
      duration_min: Number(duration || 60) || 60,
      status: (status || 'confirmed').trim(),
    }),
    revenue: ([customer_name, service_name, amount, method]) => ({
      customer_name: (customer_name || '').trim() || null,
      service_name:  (service_name || '').trim() || null,
      amount: Number(String(amount || '').replace(/[^0-9.\-]/g, '')) || 0,
      method: (method || 'card').trim() || 'card',
    }),
    inventory: ([name, qty, unit, threshold, cat]) => ({
      name: (name || '').trim(),
      quantity: Number(qty || 0) || 0,
      unit: (unit || '개').trim(),
      threshold: Number(threshold || 3) || 3,
      category: (cat || 'etc').trim() || 'etc',
    }),
    nps: ([rating, comment, source]) => ({
      rating: Number(rating || 0) || 0,
      comment: (comment || '').trim(),
      source: (source || 'manual').trim(),
    }),
    service: ([name, price, duration, cat]) => ({
      name: (name || '').trim(),
      default_price: Number(price || 0) || 0,
      default_duration_min: Number(duration || 60) || 60,
      category: (cat || 'etc').trim() || 'etc',
    }),
  };

  const ENDPOINTS = {
    customer: '/customers?force=true',
    booking: '/bookings',
    revenue: '/revenue',
    inventory: '/inventory',
    nps: '/nps',
    service: '/services',
  };

  async function copySelected() {
    try {
      const { tab, rows } = _selectedRows();
      if (!tab || !rows.length) { _toast('복사할 행이 없어요'); return; }
      const fn = SERIALIZE[tab];
      if (!fn) { _toast('이 탭은 복사 미지원이에요'); return; }
      const tsv = rows.map((r) => fn(r).map((v) => v == null ? '' : String(v).replace(/\t/g, ' ')).join('\t')).join('\n');
      try {
        await navigator.clipboard.writeText(tsv);
        _toast(`${rows.length}건 복사됐어요`);
      } catch (_e) {
        // execCommand 폴백
        const ta = document.createElement('textarea');
        ta.value = tsv;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); _toast(`${rows.length}건 복사됐어요`); }
        finally { document.body.removeChild(ta); }
      }
    } catch (e) {
      console.warn('[PVClipboard] copy', e);
      _toast('복사 실패 — 다시 시도해주세요');
    }
  }

  async function pasteRows() {
    try {
      const tab = window._PVState && window._PVState.currentTab;
      if (!tab || !ENDPOINTS[tab] || !PARSE[tab]) { _toast('이 탭은 붙여넣기 미지원이에요'); return; }
      let text = '';
      try { text = await navigator.clipboard.readText(); }
      catch (_e) { _toast('클립보드 권한이 필요해요'); return; }
      if (!text || !text.trim()) { _toast('붙여넣을 내용이 없어요'); return; }
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (!lines.length) return;
      const parser = PARSE[tab];
      const bodies = lines.map((line) => parser(line.split('\t'))).filter((b) => b && (b.name || b.customer_name || b.amount || b.rating));
      if (!bodies.length) { _toast('변환 가능한 행이 없어요'); return; }
      if (!window.confirm(`${bodies.length}건 추가할까요? (붙여넣기)`)) return;
      const results = await Promise.allSettled(bodies.map((body) =>
        fetch(_api() + ENDPOINTS[tab], {
          method: 'POST',
          headers: { ..._auth(), 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r; })
      ));
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const fail = results.length - ok;
      _toast(`${ok}건 추가됐어요${fail ? ` (${fail}건 실패)` : ''}`);
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'paste_' + tab } })); }
      catch (_e) { /* silent */ }
    } catch (e) {
      console.warn('[PVClipboard] paste', e);
      _toast('붙여넣기 실패 — 다시 시도해주세요');
    }
  }

  // 키보드 핸들러 — input focus 시 양보
  function _onKey(e) {
    try {
      if (!(e.metaKey || e.ctrlKey)) return;
      const overlay = document.getElementById('power-view-overlay');
      if (!overlay) return;
      const focused = document.activeElement;
      if (focused) {
        const tag = focused.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      }
      const k = e.key.toLowerCase();
      if (k === 'c') { e.preventDefault(); copySelected(); }
      else if (k === 'v') { e.preventDefault(); pasteRows(); }
    } catch (err) {
      console.warn('[PVClipboard] _onKey', err);
    }
  }
  document.addEventListener('keydown', _onKey, true);

  window._PVClipboard = { copySelected, pasteRows };
})();
