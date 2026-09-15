/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const plan = { plan: { due_date: null, note: '', source: 'none' }, referrer: null, referred_customers: [], referred_total: 0 };
let C, scope;
function click(action) { scope.querySelector('[data-cc-action="' + action + '"]').click(); }
function submit() { scope.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }
function load(records = []) {
  C.request.mockImplementation(url => Promise.resolve(url.includes('/treatments') ? { items: records, total: records.length } : plan));
  C.mount(scope, { id: 1, name: '가상 고객' });
  return tick();
}
beforeEach(() => {
  document.body.innerHTML = '<main><div data-customer-care></div></main>';
  scope = document.querySelector('main'); delete window.CustomerCare;
  window.getToken = jest.fn(() => 'test-owner'); window.showToast = jest.fn();
  ['data', 'view', 'forms', 'controller', 'due'].forEach(file => window.eval(fs.readFileSync(path.join(__dirname, '../js/customer-care', file + '.js'), 'utf8')));
  C = window.CustomerCare; C.newKey = () => 'stable-request-id'; C.request = jest.fn();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });
test('failed save keeps values, prevents double submission, and reuses the same request key', async () => {
  await load(); click('new-record');
  scope.querySelector('[name="service_name"]').value = '젤 네일';
  scope.querySelector('[name="memo"]').value = '민감해서 짧게';
  const pending = deferred(); C.request.mockReturnValueOnce(pending.promise);
  submit(); submit(); expect(C.request.mock.calls.filter(x => x[1] === 'POST')).toHaveLength(1);
  pending.reject(new Error('offline')); await tick();
  expect(scope.querySelector('[name="memo"]').value).toBe('민감해서 짧게');
  expect(scope.querySelector('.cc-form-error').hidden).toBe(false);
  C.request.mockResolvedValueOnce({ id: 10 }); submit(); await tick();
  const calls = C.request.mock.calls.filter(x => x[1] === 'POST');
  expect(calls[0][2].client_record_id).toBe(calls[1][2].client_record_id);
  expect(scope.querySelector('form')).toBeNull();
});
test('reuse copies only service and memo, uses today and never duplicates photos or payment', async () => {
  await load([{ id: 3, service_name: '연장', memo: 'C컬', performed_at: '2026-01-01T10:00:00Z', photos: ['https://example.com/a.jpg'], price: 50000 }]);
  click('reuse-record'); expect(scope.querySelector('[name="date"]').value).toBe(C.today());
  submit(); await tick(); const body = C.request.mock.calls.find(x => x[1] === 'POST')[2];
  expect(body).toMatchObject({ service_name: '연장', memo: 'C컬' });
  expect(body.photos).toBeUndefined(); expect(body.price).toBeUndefined();
});
test('booking-linked treatment edits memo alone', async () => {
  await load([{ id: 3, paired_booking_id: 4, service_name: '연장', performed_at: '2026-01-01', memo: '' }]);
  click('edit-record'); expect(scope.querySelector('[name="date"]').readOnly).toBe(true);
  scope.querySelector('[name="memo"]').value = '수정'; submit(); await tick();
  expect(C.request.mock.calls.find(x => x[1] === 'PATCH')[2]).toEqual({ memo: '수정' });
});
test('clearing care date sends explicit null rather than omitting the field', async () => {
  await load(); click('edit-plan');
  scope.querySelector('[name="due_date"]').value = '2026-10-01'; click('clear-date'); submit(); await tick();
  expect(C.request.mock.calls.find(x => x[1] === 'PUT')[2]).toEqual({ due_date: null, note: '' });
});
test('a late response cannot overwrite another customer mounted into the same root', async () => {
  const old = deferred(); C.request.mockReturnValue(old.promise); C.mount(scope, { id: 1 });
  C.request.mockImplementation(url => Promise.resolve(url.includes('treatments') ? { items: [], total: 0 } : { ...plan, plan: { due_date: '2026-10-20', note: '두번째 고객', source: 'manual' } }));
  C.mount(scope, { id: 2 }); await tick(); old.resolve({ ...plan, items: [], total: 0 }); await tick();
  expect(scope.textContent).toContain('두번째 고객');
});
test('account change prevents old data from rendering', async () => {
  const old = deferred(); C.request.mockReturnValue(old.promise); C.mount(scope, { id: 1 });
  window.getToken.mockReturnValue('other-owner'); old.resolve({ ...plan, items: [], total: 0, plan: { note: 'private note' } }); await tick();
  expect(scope.textContent).not.toContain('private note');
});
test('loading failures show retry instead of a false empty state', async () => {
  C.request.mockRejectedValue(new Error('offline')); C.mount(scope, { id: 1 }); await tick();
  expect(scope.querySelector('[data-cc-action="retry-records"]')).not.toBeNull();
  expect(scope.textContent).not.toContain('첫 시술 노트를');
});
test('form inputs survive background load and other-section actions', async () => {
  const pending = deferred(); C.request.mockReturnValue(pending.promise); C.mount(scope, { id: 1 });
  click('new-record'); scope.querySelector('[name="memo"]').value = '작성중';
  pending.resolve({ ...plan, items: [], total: 0 }); await tick();
  expect(scope.querySelector('[name="memo"]').value).toBe('작성중');
});
test('referrer search ignores stale results and excludes the customer themself', async () => {
  await load(); click('edit-referrer'); jest.useFakeTimers();
  const first = deferred(), second = deferred(); C.request.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const input = scope.querySelector('[name="query"]');
  input.value = '김'; input.dispatchEvent(new Event('input', { bubbles: true })); jest.advanceTimersByTime(260);
  input.value = '이'; input.dispatchEvent(new Event('input', { bubbles: true })); jest.advanceTimersByTime(260);
  second.resolve({ items: [{ id: 1, name: '나' }, { id: 2, name: '이 고객' }] }); await tick();
  first.resolve({ items: [{ id: 3, name: '김 고객' }] }); await tick();
  expect(scope.querySelector('.cc-search-results').textContent).toContain('이 고객');
  expect(scope.querySelector('.cc-search-results').textContent).not.toContain('김 고객');
  click('pick-referrer'); submit(); await tick();
  expect(C.request.mock.calls.find(x => x[1] === 'PUT')[2]).toEqual({ referrer_id: 2 });
});
test('customer content is escaped and unsafe photo URLs are dropped', async () => {
  await load([{ id: 1, service_name: '<img src=x onerror=alert(1)>', memo: '<script>danger</script>', performed_at: '2026-01-01', photos: ['javascript:alert(1)'] }]);
  expect(scope.querySelector('script,img')).toBeNull(); expect(scope.textContent).toContain('<script>danger</script>');
});
test('date display uses Korea calendar date near midnight', () => {
  expect(C.date('2026-09-15T15:30:00Z')).toBe('2026-09-16');
});
test('confirmed saves notify existing customer screens and conflicts refresh on explicit cancel', async () => {
  await load(); const changed = jest.fn(); window.addEventListener('itdasy:data-changed', changed);
  click('new-record'); scope.querySelector('[name="service_name"]').value = '메모';
  C.request.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { status: 409 }));
  submit(); await tick(); expect(changed).not.toHaveBeenCalled();
  expect(scope.querySelector('.cc-form-error').textContent).toContain('최근 기록을 다시');
  const before = C.request.mock.calls.length; click('cancel-form'); await tick();
  expect(C.request.mock.calls.length).toBeGreaterThan(before);
  click('edit-plan'); submit(); await tick();
  expect(changed.mock.calls[0][0].detail).toMatchObject({ kind: 'update_customer', customer_id: 1 });
  window.removeEventListener('itdasy:data-changed', changed);
});
test('an open care list refreshes after customer deletion rather than keeping a ghost entry', async () => {
  document.body.innerHTML = '<main><input id="customerSearch"></main>';
  scope = document.querySelector('main'); C.mountDueShortcut(scope);
  C.request.mockResolvedValue({ items: [], total: 0 });
  const details = scope.querySelector('details'); details.open = true;
  details.dispatchEvent(new Event('toggle')); await tick();
  const before = C.request.mock.calls.length;
  window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'delete_customer', customer_id: 1 } }));
  await tick(); expect(C.request.mock.calls.length).toBeGreaterThan(before);
});
test('Safari stale form validity does not block explicit care-date clear, while note validation still applies', async () => {
  await load(); click('edit-plan'); const form = scope.querySelector('form');
  form.reportValidity = jest.fn(() => false);
  const note = form.elements.note; note.reportValidity = jest.fn(() => false);
  const before = C.request.mock.calls.length; submit(); await tick();
  expect(C.request.mock.calls).toHaveLength(before);
  note.reportValidity.mockReturnValue(true); submit(); await tick();
  expect(C.request.mock.calls.find(x => x[1] === 'PUT')[2].due_date).toBeNull();
});
