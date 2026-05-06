/* Phase 9 P5 — waitlist first-pass UI */
(function () {
  'use strict';

  const KEY = 'itdasy_waitlist_v1';

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
    let el = document.getElementById('waitlistSheet');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'waitlistSheet';
    el.className = 'p9-sheet';
    el.style.display = 'none';
    el.innerHTML = `
      <div class="p9-sheet__body" role="dialog" aria-modal="true">
        <div class="p9-sheet__head">
          <div class="p9-sheet__title">대기자</div>
          <button type="button" class="p9-sheet__close" data-wl-close aria-label="닫기">x</button>
        </div>
        <label class="p9-sheet__field">이름 <input id="wlName" maxlength="30" placeholder="고객 이름"></label>
        <label class="p9-sheet__field">연락처 <input id="wlPhone" inputmode="tel" maxlength="30" placeholder="010-0000-0000"></label>
        <label class="p9-sheet__field">원하는 시간 <input id="wlWanted" maxlength="60" placeholder="예: 이번주 토요일 오후"></label>
        <label class="p9-sheet__field">메모 <textarea id="wlMemo" rows="2" maxlength="160" placeholder="시술, 선호 직원 등"></textarea></label>
        <button type="button" class="p9-sheet__btn" data-wl-add>추가</button>
        <div class="p9-sheet__list" id="wlList"></div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', _onClick);
    return el;
  }

  function _render() {
    const el = _ensure();
    const list = el.querySelector('#wlList');
    const items = _items();
    if (!items.length) {
      list.innerHTML = '<div class="p9-sheet__card">아직 대기자가 없어요.</div>';
      return;
    }
    list.innerHTML = items.map(item => `
      <div class="p9-sheet__card" data-wl-id="${_esc(item.id)}">
        <div style="font-weight:900;">${_esc(item.name)} <span style="font-weight:600;color:var(--text-subtle);font-size:12px;">${_esc(item.phone)}</span></div>
        <div class="p9-sheet__meta">${_esc(item.wanted || '시간 미정')}${item.memo ? ' · ' + _esc(item.memo) : ''}</div>
        <div class="p9-sheet__row" style="margin-top:10px;">
          <button type="button" class="p9-sheet__ghost" data-wl-book>예약으로 이동</button>
          <button type="button" class="p9-sheet__ghost" data-wl-done>완료</button>
        </div>
      </div>`).join('');
  }

  function _add(el) {
    const name = el.querySelector('#wlName').value.trim();
    if (!name) return _toast('이름을 입력해 주세요');
    const item = {
      id: 'wl_' + Date.now(),
      name,
      phone: el.querySelector('#wlPhone').value.trim(),
      wanted: el.querySelector('#wlWanted').value.trim(),
      memo: el.querySelector('#wlMemo').value.trim(),
      created_at: new Date().toISOString(),
    };
    _save([item].concat(_items()));
    ['#wlName', '#wlPhone', '#wlWanted', '#wlMemo'].forEach(sel => { el.querySelector(sel).value = ''; });
    _render();
    _toast('대기자 추가 완료');
  }

  function _remove(id) {
    _save(_items().filter(item => item.id !== id));
    _render();
  }

  function _onClick(e) {
    const el = _ensure();
    if (e.target === el || e.target.closest('[data-wl-close]')) return closeWaitlist();
    if (e.target.closest('[data-wl-add]')) return _add(el);
    const card = e.target.closest('[data-wl-id]');
    if (!card) return;
    if (e.target.closest('[data-wl-done]')) return _remove(card.dataset.wlId);
    if (e.target.closest('[data-wl-book]')) {
      closeWaitlist();
      if (window.openQuickBooking) window.openQuickBooking();
    }
  }

  function openWaitlist() {
    const el = _ensure();
    _render();
    el.style.display = 'flex';
  }

  function closeWaitlist() {
    const el = document.getElementById('waitlistSheet');
    if (el) el.style.display = 'none';
  }

  window.openWaitlist = openWaitlist;
  window.closeWaitlist = closeWaitlist;
})();
