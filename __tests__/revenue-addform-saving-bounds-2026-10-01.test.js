/**
 * @jest-environment jsdom
 *
 * flow-revenue-stats-ui-04/05/06 — 매출 입력 모달.
 *   04 (P2) 저장 중 상태 표시 없음: 버튼이 비활성만 되고 글자는 '12,000원 기록하기' 그대로
 *       (실측 d_double_390.log: `during save (0.4s): btn={disabled:true, text:'12,000원 기록하기'}`).
 *   05 (P2) 금액 상한(5천만원)이 화면에 없어 99,999,999 까지 입력·활성, 눌러야
 *       '저장 실패: 요청 형식이 올바르지 않습니다' (f_bounds.log). 서버 422 errors[].msg 는
 *       'Input should be less than or equal to 50000000'.
 *   06 (P3) '-5000' 을 치면 부호가 조용히 사라져 +5,000원으로 저장 (f_bounds.log: toasts=['매출 +5,000원']).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const REV = fs.readFileSync(path.join(ROOT, 'app-revenue.js'), 'utf8');
const EDIT = fs.readFileSync(path.join(ROOT, 'js/revenue-edit.js'), 'utf8');

const flush = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)); };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

async function openForm(fetchImpl) {
  document.body.innerHTML = '';
  sessionStorage.clear();
  window.API = 'http://127.0.0.1:8000';
  window.authHeader = () => ({ Authorization: 'Bearer t' });
  window._esc = (s) => String(s == null ? '' : s);
  window.showToast = jest.fn();
  if (!window.crypto || typeof window.crypto.randomUUID !== 'function') {
    let n = 0;
    Object.defineProperty(window, 'crypto', { value: { randomUUID: () => 'uuid-' + (++n) }, configurable: true });
  }
  window.apiFetch = jest.fn(fetchImpl);
  // eslint-disable-next-line no-eval
  window.eval(REV);
  window.openRevenue = null;   // 시트는 안 띄우고 모달만
  await window._openRevenueAddFor(null, '');
  const modal = document.getElementById('rvAddModal');
  const amt = modal.querySelector('#rfAmount');
  const save = modal.querySelector('#rfSave');
  const type = (v) => { amt.value = v; amt.dispatchEvent(new Event('input', { bubbles: true })); };
  return { R: window.Revenue, modal, amt, save, type };
}
const toastTexts = () => window.showToast.mock.calls.map(c => String(c[0]));

describe('04 — 저장 중 상태', () => {
  test('🔴 기록하기 누르면 버튼이 "저장 중…" + aria-busy, 응답 뒤 모달이 닫힌다', async () => {
    const d = deferred();
    const { save, type } = await openForm(() => d.promise);
    type('12000');
    expect(save.disabled).toBe(false);
    expect(save.textContent).toBe('12,000원 기록하기');
    save.click();
    await flush();
    expect(save.disabled).toBe(true);
    expect(save.textContent).toBe('저장 중…');
    expect(save.getAttribute('aria-busy')).toBe('true');
    d.resolve({ ok: true, status: 201, json: async () => ({ id: 1, amount: 12000, method: 'card' }) });
    await flush();
    expect(document.getElementById('rvAddModal')).toBeNull();
  });
  test('저장 실패하면 버튼이 원래 라벨로 돌아오고 입력은 남는다', async () => {
    const { save, amt, type } = await openForm(async () => ({ ok: false, status: 503, json: async () => ({ detail: 'down' }) }));
    type('12000');
    save.click();
    await flush();
    expect(document.getElementById('rvAddModal')).not.toBeNull();
    expect(save.disabled).toBe(false);
    expect(save.textContent).toBe('12,000원 기록하기');
    expect(save.getAttribute('aria-busy')).not.toBe('true');
    expect(amt.value).toBe('12,000');
  });
});

describe('05 — 금액 상한 5,000만원', () => {
  test('🔴 99,999,999 → 버튼 비활성 + 상한 안내 라벨 (서버까지 안 간다)', async () => {
    const { save, type } = await openForm(async () => ({ ok: true, status: 201, json: async () => ({}) }));
    type('99999999');
    expect(save.disabled).toBe(true);
    expect(save.textContent).toMatch(/최대 5,000만원/);
    save.click();
    await flush();
    expect(window.apiFetch).not.toHaveBeenCalled();
  });
  test('50,000,000 은 통과, 50,000,001 은 막힘', async () => {
    const { save, type } = await openForm(async () => ({ ok: true, status: 201, json: async () => ({}) }));
    type('50000000');
    expect(save.disabled).toBe(false);
    expect(save.textContent).toBe('50,000,000원 기록하기');
    type('50000001');
    expect(save.disabled).toBe(true);
  });
  test('🔴 서버 422(상한)는 "요청 형식" 이 아니라 상한 금액을 그대로 말한다', async () => {
    const e422 = { ok: false, status: 422, json: async () => ({ detail: '요청 형식이 올바르지 않습니다.', errors: [{ field: 'body.amount', msg: 'Input should be less than or equal to 50000000' }] }) };
    const { R, save, type } = await openForm(async () => e422);
    await expect(R.create({ amount: 50000000, method: 'card' })).rejects.toThrow(/50,000,000원/);
    type('50000000');
    save.click();
    await flush();
    const t = toastTexts().join(' | ');
    expect(t).toMatch(/50,000,000원/);
    expect(t).not.toMatch(/요청 형식/);
  });
  test('인라인 편집도 상한을 넘기면 서버로 보내지 않는다', async () => {
    const { R } = await openForm(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    // eslint-disable-next-line no-eval
    window.eval(EDIT);
    const row = document.createElement('div'); document.body.appendChild(row);
    window.RevenueEdit.toggle(row, { id: 5, amount: 50000, method: 'card' });
    await flush();
    window.apiFetch.mockClear();
    const panel = row.nextElementSibling;
    panel.querySelector('.rie-amt').value = '99999999';
    panel.querySelector('.rie-save').click();
    await flush();
    expect(window.apiFetch.mock.calls.some(c => (c[1] && c[1].method) === 'PATCH')).toBe(false);
    expect(toastTexts().join(' | ')).toMatch(/최대 5,000만원/);
    expect(R.MAX_KRW).toBe(50000000);
  });
});

describe('06 — 음수 입력', () => {
  test('🔴 "-5000" 은 값으로 삼지 않고 환불 경로를 안내한다 (부호는 지우지 않고 보여 준다)', async () => {
    const { save, amt, type } = await openForm(async () => ({ ok: true, status: 201, json: async () => ({}) }));
    type('-5000');
    expect(save.disabled).toBe(true);
    expect(amt.value).toBe('-5,000');
    expect(save.textContent).toMatch(/환불/);
    expect(toastTexts().join(' | ')).toMatch(/환불/);
    save.click();
    await flush();
    expect(window.apiFetch).not.toHaveBeenCalled();
  });
  test('PC 처럼 "-" 를 먼저 치고 숫자를 이어 쳐도 양수로 둔갑하지 않는다', async () => {
    const { save, amt, type } = await openForm(async () => ({ ok: true, status: 201, json: async () => ({}) }));
    type('-'); type('-5'); type('-5,0'); type('-5,00'); type('-5,000');
    expect(amt.value).toBe('-5,000');
    expect(save.disabled).toBe(true);
    type('5000');   // 부호를 지우면 정상
    expect(amt.value).toBe('5,000');
    expect(save.disabled).toBe(false);
    expect(save.textContent).toBe('5,000원 기록하기');
  });
});
