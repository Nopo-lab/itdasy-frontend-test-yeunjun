/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');
const tick = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };
const record = id => ({ id, service_name: '시술 ' + id, performed_at: '2026-01-01', photos: [] });
const care = { plan: {}, referrer: null, referred_customers: [], referred_total: 0 };
let C, scope;
const click = action => scope.querySelector('[data-cc-action="' + action + '"]').click();
const submit = () => scope.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
beforeEach(() => {
  document.body.innerHTML = '<main><div data-customer-care></div></main>';
  scope = document.querySelector('main'); delete window.CustomerCare;
  window.getToken = () => 'owner'; window.showToast = jest.fn();
  ['data', 'view', 'forms', 'controller'].forEach(file => window.eval(fs.readFileSync(path.join(__dirname, '../js/customer-care', file + '.js'), 'utf8')));
  C = window.CustomerCare; C.newKey = () => 'test-request-key';
  C.request = jest.fn(url => Promise.resolve(url.includes('treatments') ? { items: [], total: 0 } : care));
});
test('draft blocks navigation and defers a same-customer refresh until cancellation', async () => {
  C.mount(scope, { id: 1 }); await tick(); click('new-record');
  scope.querySelector('[name="memo"]').value = '기억할 내용';
  const refresh = jest.fn();
  expect(C.canLeave(scope)).toBe(false);
  expect(C.deferRefresh(scope, 1, refresh)).toBe(true);
  expect(refresh).not.toHaveBeenCalled();
  expect(scope.querySelector('[name="memo"]').value).toBe('기억할 내용');
  click('cancel-form'); expect(refresh).toHaveBeenCalledTimes(1);
  expect(C.canLeave(scope)).toBe(true);
});
test('a requested different customer is never replayed after cancelling the draft', async () => {
  C.mount(scope, { id: 1 }); await tick(); click('new-record');
  const refresh = jest.fn(); expect(C.deferRefresh(scope, 2, refresh)).toBe(true);
  click('cancel-form'); expect(refresh).not.toHaveBeenCalled();
});
test('same-root remount cannot replace a draft or duplicate mutation listeners', async () => {
  C.mount(scope, { id: 1 }); await tick();
  C.mount(scope, { id: 2 }); await tick(); click('new-record');
  scope.querySelector('[name="service_name"]').value = '네일';
  C.mount(scope, { id: 3 }); submit(); await tick();
  const writes = C.request.mock.calls.filter(call => call[1] === 'POST');
  expect(writes).toHaveLength(1); expect(writes[0][2].customer_id).toBe(2);
});
test('save in progress blocks leaving and runs deferred refresh only after save and reads finish', async () => {
  C.mount(scope, { id: 1 }); await tick(); click('new-record');
  scope.querySelector('[name="service_name"]').value = '네일';
  const pending = deferred(); C.request.mockReturnValueOnce(pending.promise); submit();
  const refresh = jest.fn(); C.deferRefresh(scope, 1, refresh);
  expect(C.canLeave(scope)).toBe(false); expect(refresh).not.toHaveBeenCalled();
  pending.resolve(record(1)); await tick();
  expect(refresh).toHaveBeenCalledTimes(1); expect(C.canLeave(scope)).toBe(true);
});
test('late previous pagination cannot hide a record after saving a new one', async () => {
  const pending = deferred(); let saved = false;
  C.request.mockImplementation((url, method = 'GET') => {
    if (method === 'POST') { saved = true; return Promise.resolve(record(21)); }
    if (!url.includes('treatments')) return Promise.resolve(care);
    if (url.includes('offset=10')) return pending.promise;
    const ids = saved ? [21, 1, 2, 3, 4, 5, 6, 7, 8, 9] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    return Promise.resolve({ items: ids.map(record), total: saved ? 21 : 20 });
  });
  C.mount(scope, { id: 1 }); await tick(); click('more-records'); click('new-record');
  scope.querySelector('[name="service_name"]').value = '새 기록'; submit(); await tick();
  pending.resolve({ items: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(record), total: 20 }); await tick();
  expect([...scope.querySelectorAll('[data-record-id]')].map(el => el.dataset.recordId)).toEqual(['21', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
  expect(scope.querySelector('[data-cc-action="more-records"]')).not.toBeNull();
});
