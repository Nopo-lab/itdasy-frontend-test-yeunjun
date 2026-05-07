/* Phase 9 P5 — waitlist: localStorage 오프라인 캐시 + API 백엔드 동기화 */
(function () {
  'use strict';

  const KEY = 'itdasy_waitlist_v1';

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

  // localStorage — 오프라인 캐시 (서버 응답으로 덮어씀)
  function _cached() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; } }
  function _setCache(items) { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (_) { void _; } }

  let _items = _cached();

  async function _loadFromServer() {
    try {
      const data = await _api('GET', '/waitlist?status=waiting');
      _items = (data && data.items) ? data.items : [];
      _setCache(_items);
    } catch (_e) {
      _items = _cached(); // 오프라인 폴백
    }
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
          <div class="p9-sheet__title">대기자 목록</div>
          <button type="button" class="p9-sheet__close" data-wl-close aria-label="닫기">✕</button>
        </div>
        <label class="p9-sheet__field">이름 <input id="wlName" maxlength="30" placeholder="고객 이름"></label>
        <label class="p9-sheet__field">연락처 <input id="wlPhone" inputmode="tel" maxlength="30" placeholder="010-0000-0000"></label>
        <label class="p9-sheet__field">원하는 시간 <input id="wlWanted" maxlength="120" placeholder="예: 이번주 토요일 오후, 속눈썹 연장"></label>
        <label class="p9-sheet__field">메모 <textarea id="wlMemo" rows="2" maxlength="200" placeholder="시술 종류, 선호 직원 등"></textarea></label>
        <button type="button" class="p9-sheet__btn" data-wl-add>+ 추가</button>
        <div class="p9-sheet__list" id="wlList"></div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', _onClick);
    return el;
  }

  function _render() {
    const list = document.getElementById('wlList');
    if (!list) return;
    if (!_items.length) {
      list.innerHTML = '<div class="p9-sheet__card" style="color:var(--text-subtle);text-align:center;">아직 대기자가 없어요.</div>';
      return;
    }
    list.innerHTML = _items.map(item => {
      const name = item.customer_name || item.name || '?';
      const phone = item.phone || '';
      const wanted = item.preferred_service || item.wanted || '';
      const memo = item.memo || '';
      return `
        <div class="p9-sheet__card" data-wl-id="${item.id}">
          <div style="font-weight:900;">${_esc(name)} <span style="font-weight:500;color:var(--text-subtle);font-size:12px;">${_esc(phone)}</span></div>
          <div class="p9-sheet__meta">${_esc(wanted || '시간 미정')}${memo ? ' · ' + _esc(memo) : ''}</div>
          <div class="p9-sheet__row" style="margin-top:10px;">
            <button type="button" class="p9-sheet__ghost" data-wl-book>예약으로</button>
            <button type="button" class="p9-sheet__ghost" data-wl-done>완료</button>
          </div>
        </div>`;
    }).join('');
  }

  async function _add(el) {
    const name = el.querySelector('#wlName').value.trim();
    if (!name) return _toast('이름을 입력해 주세요');
    const body = {
      customer_name: name,
      phone: el.querySelector('#wlPhone').value.trim(),
      preferred_service: el.querySelector('#wlWanted').value.trim(),
      memo: el.querySelector('#wlMemo').value.trim(),
    };
    try {
      const item = await _api('POST', '/waitlist', body);
      _items.unshift(item);
      _setCache(_items);
    } catch (_e) {
      // 오프라인: 임시 로컬 항목 추가
      _items.unshift({ id: 'tmp_' + Date.now(), ...body, status: 'waiting', created_at: new Date().toISOString() });
      _setCache(_items);
    }
    ['#wlName', '#wlPhone', '#wlWanted', '#wlMemo'].forEach(sel => { el.querySelector(sel).value = ''; });
    _render();
    _toast('대기자 추가 완료');
  }

  async function _done(id) {
    _items = _items.filter(i => String(i.id) !== String(id));
    _setCache(_items);
    _render();
    try {
      if (!String(id).startsWith('tmp_')) await _api('PATCH', '/waitlist/' + id, { status: 'closed' });
    } catch (_e) { void _e; }
    _toast('대기자 완료 처리');
  }

  function _onClick(e) {
    const el = _ensure();
    if (e.target === el || e.target.closest('[data-wl-close]')) return closeWaitlist();
    if (e.target.closest('[data-wl-add]')) return _add(el);
    const card = e.target.closest('[data-wl-id]');
    if (!card) return;
    const id = card.dataset.wlId;
    if (e.target.closest('[data-wl-done]')) return _done(id);
    if (e.target.closest('[data-wl-book]')) {
      closeWaitlist();
      if (window.openQuickBooking) window.openQuickBooking();
    }
  }

  async function openWaitlist() {
    _ensure();
    document.getElementById('waitlistSheet').style.display = 'flex';
    _render();
    await _loadFromServer();
    _render();
  }

  function closeWaitlist() {
    const el = document.getElementById('waitlistSheet');
    if (el) el.style.display = 'none';
  }

  window.openWaitlist = openWaitlist;
  window.closeWaitlist = closeWaitlist;
})();
