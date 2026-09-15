/* T-602 — A discoverable owner task list, with no automatic customer messages. */
(function () {
  'use strict';
  const C = window.CustomerCare;
  C.mountDueShortcut = scope => {
    const anchor = scope.querySelector('#customerSearch');
    if (!anchor || scope.querySelector('.cc-due')) return;
    const root = document.createElement('details'); root.className = 'cc-due';
    root.innerHTML = '<summary>' + C.icon('calendar') + '<span>다가오는 방문일</span>' + C.icon('chevron-down') + '</summary><div class="cc-due-body"></div>';
    anchor.insertAdjacentElement('afterend', root);
    const state = { root, token: null, version: 0, items: [], total: 0 };
    root.addEventListener('toggle', () => { if (root.open) load(state); });
    root.addEventListener('click', e => {
      const btn = e.target.closest('[data-cc-action]'); if (!btn) return;
      if (btn.dataset.ccAction === 'open-customer') window.openCustomerDashboard?.(Number(btn.dataset.id));
      else load(state, btn.dataset.ccAction === 'more-due');
    });
    window.addEventListener('itdasy:data-changed', e => {
      const kind = e.detail?.kind || '';
      if (root.isConnected && root.open && /^(create|update|delete|cancel|reschedule)_(customer|booking)$/.test(kind)) load(state);
    });
  };
  function row(item) {
    return C.button('open-customer', '<span><strong>' + C.escape(item.name) + '</strong><small>' + C.escape(item.note || (item.has_upcoming_booking ? '다음 예약이 있어요' : '관리 내용을 확인해 보세요')) + '</small></span>' +
      '<span class="cc-due-date">' + C.escape(C.dateLabel(item.due_date)) + '<small>' + C.escape(C.dateHint(item.due_date)) + '</small></span>', 'cc-due-person', 'data-id="' + C.escape(item.customer_id) + '"');
  }
  function render(s, error) {
    const box = s.root.querySelector('.cc-due-body');
    box.innerHTML = '<p class="cc-due-caption">지난 방문일과 앞으로 30일 안에 챙길 고객</p>' + s.items.map(row).join('') +
      (error ? '<p role="alert">' + C.escape(error) + '</p>' + C.button('retry-due', '다시 불러오기') :
        !s.items.length ? '<p class="cc-empty">지금 챙길 방문일이 없어요.</p>' : '') +
      (!error && s.total > s.items.length ? C.button('more-due', '고객 더 보기', 'cc-more') : '');
  }
  async function load(s, more = false) {
    if (more && s.busy) return;
    const token = window.getToken?.(); const version = ++s.version;
    if (!more || token !== s.token) s.items = [];
    s.token = token; s.busy = true;
    s.root.querySelector('.cc-due-body').innerHTML = '<p role="status" class="cc-empty">방문일을 불러오고 있어요…</p>';
    try {
      const data = await C.request(C.paths.due + '&limit=20&offset=' + s.items.length);
      if (version !== s.version || token !== window.getToken?.()) return;
      s.items.push(...data.items); s.total = data.total; render(s);
    } catch (e) {
      console.warn('[care due]', e);
      if (version === s.version && token === window.getToken?.()) render(s, C.errorText(e));
    } finally { if (version === s.version) s.busy = false; }
  }
})();
