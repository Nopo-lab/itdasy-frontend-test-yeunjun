/* T-602 — Per-customer state; failed writes retain the form and retry identity. */
(function () {
  'use strict';
  const C = window.CustomerCare;
  const states = new WeakMap();
  C.active = s => s.root.isConnected && states.get(s.root) === s && window.getToken?.() === s.token;
  C.notice = text => window.showToast?.(text);
  function draft(scope) {
    const roots = scope?.matches?.('[data-customer-care]') ? [scope] : [...(scope?.querySelectorAll('[data-customer-care]') || [])];
    return roots.map(root => states.get(root)).find(s => s && C.active(s) && (s.form || s.saving));
  }
  C.hasDraft = scope => !!draft(scope);
  C.canLeave = scope => {
    if (!draft(scope)) return true;
    C.notice('작성 중인 내용을 먼저 저장하거나 취소해 주세요.'); return false;
  };
  C.deferRefresh = (scope, customerId, refresh) => {
    const s = draft(scope); if (!s) return false;
    if (String(s.customer.id) === String(customerId)) s.refresh = refresh;
    return true;
  };
  function flushRefresh(s) {
    if (!C.active(s) || s.form || s.saving || !s.refresh) return;
    const refresh = s.refresh; s.refresh = null; refresh();
  }
  function paint(s) { if (C.active(s) && !s.form) C.paint(s); }
  async function care(s) {
    const version = s.careVersion = (s.careVersion || 0) + 1;
    try { const data = await C.request(C.paths.care(s.customer.id)); if (C.active(s) && version === s.careVersion) { s.care = data; s.careError = ''; } }
    catch (e) { console.warn('[customer care]', e); if (C.active(s) && version === s.careVersion) s.careError = C.errorText(e); }
    finally { if (version === s.careVersion) { s.loading = false; paint(s); } }
  }
  async function records(s, more = false) {
    if (more && s.moreBusy) return;
    const version = s.recordsVersion = (s.recordsVersion || 0) + 1;
    s.moreBusy = more; paint(s);
    try {
      const data = await C.request(C.paths.records(s.customer.id, more ? s.records.length : 0));
      if (!C.active(s) || version !== s.recordsVersion) return;
      s.records = more ? s.records.concat(data.items) : data.items;
      s.total = data.total; s.recordsError = '';
    } catch (e) {
      console.warn('[customer records]', e);
      if (C.active(s) && version === s.recordsVersion) { if (more) C.notice(C.errorText(e)); else s.recordsError = C.errorText(e); }
    } finally { if (version === s.recordsVersion) { s.recordsLoading = false; s.moreBusy = false; paint(s); } }
  }
  function start(s, kind, record, reuse) {
    if (s.form) { C.notice('작성 중인 내용을 먼저 저장하거나 취소해 주세요.'); return; }
    s.form = kind; s.editRecord = reuse ? null : record; s.createKey = C.newKey();
    s.selected = s.care?.referrer || null; s.results = [];
    const section = s.root.querySelector('[data-cc-section="' + (kind === 'record' ? 'records' : kind === 'referrer' ? 'referrals' : 'plan') + '"]');
    section.innerHTML = kind === 'record' ? C.recordForm(record, reuse) : kind === 'plan' ? C.planForm(s.care.plan) : C.referrerForm(s);
    section.querySelector('input,textarea')?.focus({ preventScroll: true });
    section.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }
  function recordPayload(s, form) {
    const value = name => form.elements.namedItem(name).value;
    if (s.editRecord?.paired_booking_id) return { memo: value('memo').trim() };
    const date = value('date');
    return {
      customer_id: s.customer.id, service_name: value('service_name').trim(), memo: value('memo').trim(),
      performed_at: s.editRecord && C.date(s.editRecord.performed_at) === date ? s.editRecord.performed_at : date + 'T00:00:00+09:00',
      ...(!s.editRecord ? { client_record_id: s.createKey } : {})
    };
  }
  function mutation(s, form) {
    if (s.form === 'record') return [C.paths.record(s.editRecord?.id), s.editRecord ? 'PATCH' : 'POST', recordPayload(s, form)];
    if (s.form === 'referrer') return [C.paths.referrer(s.customer.id), 'PUT', { referrer_id: s.selected?.id || null }];
    return [C.paths.plan(s.customer.id), 'PUT', { due_date: form.elements.due_date.value || null, note: form.elements.note.value.trim() }];
  }
  function validForm(form) {
    const date = form.elements.namedItem('due_date');
    // WebKit can leave the form invalid after clearing an optional date, even
    // when the input reports valid. Validate remaining controls individually.
    if (form.dataset.ccForm === 'plan' && date && !date.value && !date.validity.badInput) {
      return [...form.elements].filter(el => el !== date).every(el => el.reportValidity());
    }
    return form.reportValidity();
  }
  async function save(s, form) {
    if (s.saving || !C.active(s) || !validForm(form)) return;
    const args = mutation(s, form);
    if (s.form === 'record' && args[2].service_name === '') { form.querySelector('.cc-form-error').hidden = false; form.querySelector('.cc-form-error').textContent = '시술명을 입력해 주세요.'; return; }
    s.saving = true; const controls = [...form.querySelectorAll('input,textarea,button')];
    controls.forEach(el => { el.disabled = true; });
    const error = form.querySelector('.cc-form-error'); error.hidden = true;
    try {
      await C.request(...args);
      if (!C.active(s)) return;
      s.form = null; s.loading = true; s.recordsLoading = true; paint(s);
      C.notice('저장했어요.');
      window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'update_customer', customer_id: s.customer.id, optimistic: false } }));
      document.dispatchEvent(new CustomEvent('itdasy:customer-care-changed', { detail: { customerId: s.customer.id } }));
      await Promise.allSettled([care(s), records(s)]);
    } catch (e) {
      console.warn('[customer care save]', e);
      if (C.active(s)) {
        s.checkSaved = args[1] === 'POST' && e.status === 409;
        error.textContent = s.checkSaved ? '이전 저장이 완료됐을 수 있어요. 작성한 내용을 복사해 두고 취소를 누르면 최근 기록을 다시 불러와요. 저장된 기록에서 수정해 주세요.' : C.errorText(e);
        error.hidden = false;
      }
    } finally { s.saving = false; controls.forEach(el => { el.disabled = false; }); flushRefresh(s); }
  }
  function selected(s) {
    const el = s.root.querySelector('.cc-selected-referrer');
    if (el) el.textContent = s.selected ? s.selected.name + ' 님 선택됨' : '소개자 지정이 해제돼요. 저장하면 반영됩니다.';
    const results = s.root.querySelector('.cc-search-results');
    if (results && s.results.length) results.innerHTML = C.searchResults(s.results, s.selected);
  }
  function search(s, input) {
    clearTimeout(s.searchTimer); const version = s.searchVersion = (s.searchVersion || 0) + 1;
    const box = s.root.querySelector('.cc-search-results'); const q = input.value.trim();
    s.results = []; box.textContent = q ? '고객을 찾고 있어요…' : '이름을 입력하면 고객을 찾아드려요.';
    if (!q) return;
    s.searchTimer = setTimeout(async () => {
      try {
        const data = await C.request(C.paths.search(q));
        if (!C.active(s) || version !== s.searchVersion || !box.isConnected) return;
        s.results = data.items.filter(c => String(c.id) !== String(s.customer.id));
        box.innerHTML = C.searchResults(s.results, s.selected);
      } catch (e) {
        console.warn('[referrer search]', e);
        if (C.active(s) && version === s.searchVersion && box.isConnected) box.textContent = C.errorText(e);
      }
    }, 250);
  }
  async function moreReferrals(s) {
    if (s.referralsBusy) return; s.referralsBusy = true;
    const version = s.careVersion;
    try {
      const data = await C.request(C.paths.care(s.customer.id) + '?offset=' + s.care.referred_customers.length);
      if (C.active(s) && version === s.careVersion) { s.care.referred_customers.push(...data.referred_customers); s.care.referred_total = data.referred_total; paint(s); }
    } catch (e) { console.warn('[referrals]', e); if (C.active(s)) C.notice(C.errorText(e)); }
    finally { s.referralsBusy = false; }
  }
  function action(s, button) {
    if (s.saving || !C.active(s)) return;
    const act = button.dataset.ccAction;
    const record = s.records.find(r => String(r.id) === button.dataset.id);
    const actions = {
      'new-record': () => start(s, 'record'), 'edit-record': () => record && start(s, 'record', record),
      'reuse-record': () => record && start(s, 'record', record, true),
      'edit-plan': () => start(s, 'plan'), 'edit-referrer': () => start(s, 'referrer'),
      'cancel-form': () => { s.form = null; s.searchVersion++; clearTimeout(s.searchTimer); paint(s); if (s.checkSaved) { s.checkSaved = false; records(s); } flushRefresh(s); },
      'retry': () => care(s), 'retry-records': () => records(s), 'more-records': () => records(s, true),
      'more-referrals': () => moreReferrals(s),
      'clear-date': () => { s.root.querySelector('[name="due_date"]').value = ''; },
      'clear-referrer': () => { s.selected = null; selected(s); },
      'pick-referrer': () => { s.selected = s.results.find(c => String(c.id) === button.dataset.id) || s.selected; selected(s); },
      'date-preset': () => { const date = new Date(C.today()); date.setUTCDate(date.getUTCDate() + Number(button.dataset.days)); s.root.querySelector('[name="due_date"]').value = date.toISOString().slice(0, 10); },
      'open-customer': () => { if (s.form) C.notice('작성 중인 내용을 먼저 저장하거나 취소해 주세요.'); else window.openCustomerDashboard?.(Number(button.dataset.id)); }
    };
    actions[act]?.();
  }
  C.mount = (scope, customer) => {
    const root = scope.querySelector('[data-customer-care]'); if (!root || !customer?.id) return;
    if (C.hasDraft(root)) return;
    const s = { root, customer, token: window.getToken?.(), loading: true, recordsLoading: true, records: [], total: 0, form: null };
    states.set(root, s); paint(s);
    root.onclick = e => { const button = e.target.closest('[data-cc-action]'); if (button && root.contains(button)) action(s, button); };
    root.onsubmit = e => { if (e.target.matches('[data-cc-form]')) { e.preventDefault(); save(s, e.target); } };
    root.oninput = e => { if (e.target.name === 'query') search(s, e.target); };
    Promise.allSettled([care(s), records(s)]);
  };
})();
