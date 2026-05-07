/* Phase 9 P5 — 리뷰 요청 관리: localStorage 캐시 + /customer-reviews API 연결 */
(function () {
  'use strict';

  const KEY = 'itdasy_review_requests_v1';

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  }
  function _toast(msg) { if (window.showToast) window.showToast(msg); }
  function _api(method, path, body) {
    if (!window.API || !window.authHeader) return Promise.reject(new Error('no-auth'));
    return fetch(window.API + path, {
      method,
      headers: { ...window.authHeader(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }).then(r => {
      if (r.status === 204) return null;
      if (!r.ok) return r.json().catch(() => ({})).then(d => { throw new Error(d.detail || 'HTTP ' + r.status); });
      return r.json();
    });
  }

  let _items = [];
  function _cached() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; } }
  function _setCache(items) { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (_) { void _; } }

  async function _loadFromServer() {
    try {
      const data = await _api('GET', '/customer-reviews');
      _items = (data && data.items) ? data.items : [];
      _setCache(_items);
    } catch (_e) {
      _items = _cached();
    }
  }

  function _message(item) {
    const name = item.customer_name || '고객님';
    const link = item.review_link || item.link || '';
    return `${name}, 오늘 시술 만족스러우셨다면 짧은 리뷰 부탁드려요. 남겨주신 리뷰는 큰 힘이 됩니다.${link ? ' ' + link : ''}`.trim();
  }

  function _ensure() {
    let el = document.getElementById('reviewRequestSheet');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'reviewRequestSheet';
    el.className = 'p9-sheet';
    el.style.display = 'none';
    el.innerHTML = `
      <div class="p9-sheet__body" role="dialog" aria-modal="true">
        <div class="p9-sheet__head">
          <div class="p9-sheet__title">리뷰 요청</div>
          <button type="button" class="p9-sheet__close" data-rvreq-close aria-label="닫기">✕</button>
        </div>
        <div class="p9-sheet__row">
          <input id="rvreqCustomer" readonly placeholder="고객 선택" style="flex:1;min-height:48px;border:1px solid var(--border);border-radius:8px;padding:0 12px;">
          <button type="button" class="p9-sheet__ghost" data-rvreq-pick>선택</button>
        </div>
        <label class="p9-sheet__field" style="margin-top:10px;">리뷰 링크 (선택)
          <input id="rvreqLink" placeholder="네이버/구글 리뷰 링크">
        </label>
        <button type="button" class="p9-sheet__btn" data-rvreq-add>+ 요청 만들기</button>
        <div class="p9-sheet__meta">시술 완료 후 고객에게 문구를 복사해 DM이나 문자로 보내세요.</div>
        <div class="p9-sheet__list" id="rvreqList"></div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', _onClick);
    return el;
  }

  function _statusLabel(s) {
    return { draft: '준비', sent: '발송됨', done: '완료' }[s] || s;
  }

  function _render() {
    const list = document.getElementById('rvreqList');
    if (!list) return;
    if (!_items.length) {
      list.innerHTML = '<div class="p9-sheet__card" style="color:var(--text-subtle);text-align:center;">아직 만든 리뷰 요청이 없어요.</div>';
      return;
    }
    list.innerHTML = _items.map(item => `
      <div class="p9-sheet__card" data-rvreq-id="${item.id}">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-weight:900;">${_esc(item.customer_name || '고객')}</span>
          <span style="font-size:11px;padding:2px 7px;border-radius:20px;background:var(--surface-2);color:var(--text-subtle);">${_statusLabel(item.status)}</span>
        </div>
        <div class="p9-sheet__meta">${(item.created_at || '').slice(0, 10)} · 시술 후 24시간 안에 보내기</div>
        <div class="p9-sheet__row" style="margin-top:10px;">
          <button type="button" class="p9-sheet__ghost" data-rvreq-copy>문구 복사</button>
          <button type="button" class="p9-sheet__ghost" data-rvreq-sent>발송 완료</button>
          <button type="button" class="p9-sheet__ghost" data-rvreq-del>삭제</button>
        </div>
      </div>`).join('');
  }

  async function _pick(ctx) {
    if (!window.Customer?.pick) return _toast('고객 목록을 불러오는 중이에요');
    const picked = await window.Customer.pick({ selectedId: ctx.customer_id });
    if (picked === null) return;
    ctx.customer_id = picked.id || null;
    ctx.customer_name = picked.name || '';
    document.getElementById('rvreqCustomer').value = ctx.customer_name;
  }

  async function _add(ctx) {
    if (!ctx.customer_name) return _toast('고객을 선택해 주세요');
    const body = {
      customer_id: ctx.customer_id || null,
      customer_name: ctx.customer_name,
      review_link: document.getElementById('rvreqLink').value.trim(),
    };
    try {
      const item = await _api('POST', '/customer-reviews', body);
      _items.unshift(item);
      _setCache(_items);
    } catch (_e) {
      _items.unshift({ id: 'tmp_' + Date.now(), ...body, status: 'draft', created_at: new Date().toISOString() });
      _setCache(_items);
    }
    document.getElementById('rvreqCustomer').value = '';
    document.getElementById('rvreqLink').value = '';
    ctx.customer_id = null; ctx.customer_name = '';
    _render();
    _toast('리뷰 요청 생성 완료');
  }

  async function _onClick(e) {
    const el = _ensure();
    if (!el._ctx) el._ctx = {};
    if (e.target === el || e.target.closest('[data-rvreq-close]')) return closeReviewRequests();
    if (e.target.closest('[data-rvreq-pick]')) return _pick(el._ctx);
    if (e.target.closest('[data-rvreq-add]')) return _add(el._ctx);
    const card = e.target.closest('[data-rvreq-id]');
    if (!card) return;
    const id = card.dataset.rvreqId;
    const item = _items.find(r => String(r.id) === String(id));
    if (!item) return;
    if (e.target.closest('[data-rvreq-copy]')) {
      try { await navigator.clipboard.writeText(_message(item)); _toast('문구 복사 완료'); }
      catch (_) { _toast(_message(item)); }
    } else if (e.target.closest('[data-rvreq-sent]')) {
      item.status = 'sent';
      _setCache(_items);
      _render();
      if (!String(id).startsWith('tmp_')) _api('PATCH', '/customer-reviews/' + id, { status: 'sent' }).catch(() => {});
      _toast('발송 완료 처리');
    } else if (e.target.closest('[data-rvreq-del]')) {
      _items = _items.filter(r => String(r.id) !== String(id));
      _setCache(_items);
      _render();
      if (!String(id).startsWith('tmp_')) _api('DELETE', '/customer-reviews/' + id).catch(() => {});
    }
  }

  async function openReviewRequests() {
    const el = _ensure();
    el._ctx = {};
    el.querySelector('#rvreqCustomer').value = '';
    _items = _cached();
    _render();
    el.style.display = 'flex';
    await _loadFromServer();
    _render();
  }

  function closeReviewRequests() {
    const el = document.getElementById('reviewRequestSheet');
    if (el) el.style.display = 'none';
  }

  window.openReviewRequests = openReviewRequests;
  window.closeReviewRequests = closeReviewRequests;
})();
