/* Phase 9 P5 — review request manager */
(function () {
  'use strict';

  const KEY = 'itdasy_review_requests_v1';

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  }

  function _items() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; }
  }

  function _save(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
  }

  function _toast(msg) {
    if (window.showToast) window.showToast(msg);
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
          <button type="button" class="p9-sheet__close" data-rvreq-close aria-label="닫기">x</button>
        </div>
        <div class="p9-sheet__row">
          <input id="rvreqCustomer" readonly placeholder="고객 선택" style="flex:1;min-height:48px;border:1px solid var(--border);border-radius:8px;padding:0 12px;">
          <button type="button" class="p9-sheet__ghost" data-rvreq-pick>선택</button>
        </div>
        <label class="p9-sheet__field" style="margin-top:10px;">리뷰 링크
          <input id="rvreqLink" placeholder="네이버/구글 리뷰 링크">
        </label>
        <button type="button" class="p9-sheet__btn" data-rvreq-add>요청 만들기</button>
        <div class="p9-sheet__list" id="rvreqList"></div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', _onClick);
    return el;
  }

  function _render() {
    const list = document.getElementById('rvreqList');
    const items = _items();
    if (!items.length) {
      list.innerHTML = '<div class="p9-sheet__card">아직 만든 리뷰 요청이 없어요.</div>';
      return;
    }
    list.innerHTML = items.map(item => `
      <div class="p9-sheet__card" data-rvreq-id="${_esc(item.id)}">
        <div style="font-weight:900;">${_esc(item.customer_name || '고객')}</div>
        <div class="p9-sheet__meta">${_esc(item.created_at.slice(0, 10))} · 시술 후 24시간 안에 보내기</div>
        <div class="p9-sheet__row" style="margin-top:10px;">
          <button type="button" class="p9-sheet__ghost" data-rvreq-copy>문구 복사</button>
          <button type="button" class="p9-sheet__ghost" data-rvreq-done>완료</button>
        </div>
      </div>`).join('');
  }

  function _message(item) {
    const name = item.customer_name || '고객님';
    const link = item.link || '';
    return `${name}, 오늘 시술 만족스러우셨다면 짧은 리뷰 부탁드려요. 남겨주신 리뷰는 큰 힘이 됩니다. ${link}`.trim();
  }

  async function _pick(ctx) {
    if (!window.Customer?.pick) return _toast('고객 목록을 불러오는 중이에요');
    const picked = await window.Customer.pick({ selectedId: ctx.customer_id });
    if (picked === null) return;
    ctx.customer_id = picked.id || null;
    ctx.customer_name = picked.name || '';
    document.getElementById('rvreqCustomer').value = ctx.customer_name;
  }

  function _add(ctx) {
    if (!ctx.customer_name) return _toast('고객을 선택해 주세요');
    const item = {
      id: 'review_' + Date.now(),
      customer_id: ctx.customer_id,
      customer_name: ctx.customer_name,
      link: document.getElementById('rvreqLink').value.trim(),
      created_at: new Date().toISOString(),
    };
    _save([item].concat(_items()));
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
    if (e.target.closest('[data-rvreq-done]')) {
      _save(_items().filter(item => item.id !== card.dataset.rvreqId));
      return _render();
    }
    if (e.target.closest('[data-rvreq-copy]')) {
      const item = _items().find(row => row.id === card.dataset.rvreqId);
      try { await navigator.clipboard.writeText(_message(item)); _toast('문구 복사 완료'); }
      catch (_) { _toast(_message(item)); }
    }
  }

  function openReviewRequests() {
    const el = _ensure();
    el._ctx = {};
    el.querySelector('#rvreqCustomer').value = '';
    _render();
    el.style.display = 'flex';
  }

  function closeReviewRequests() {
    const el = document.getElementById('reviewRequestSheet');
    if (el) el.style.display = 'none';
  }

  window.openReviewRequests = openReviewRequests;
  window.closeReviewRequests = closeReviewRequests;
})();
