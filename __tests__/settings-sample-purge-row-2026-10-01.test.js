/**
 * @jest-environment jsdom
 *
 * flow-account-firstrun-04 (P2) — 가입 때 자동 주입되는 샘플(고객 3·예약 4·재고 4)을 지울 진입점이 없다.
 *   BE `POST /auth/sample/purge` 는 2026-04-21 부터 있었지만 프론트 어디에도 버튼이 없어 신규 원장은
 *   홈 '오늘의 예약 (샘플) 김지연' 을 손으로 하나씩 지워야 했다(실측 s6 homeAfterDismiss).
 *   고정하는 계약(app-settings-hub.js):
 *     · '샘플 데이터 지우기' 행은 처음엔 숨김 → open() 이 GET /auth/sample/status 를 읽어 has_sample 일 때만 보인다
 *     · 누르면 확인 → POST /auth/sample/purge → 행 숨김 + SWR 캐시 비움 + data-changed(force_sync) + 토스트 N건
 *     · 확인 취소면 요청 없음 · 실패면 행은 그대로 보이고 실패 토스트(거짓 성공 금지)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HUB = fs.readFileSync(path.join(ROOT, 'app-settings-hub.js'), 'utf8');

const flush = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)); };
const jsonRes = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

function bootHub({ status, purge, confirm = true } = {}) {
  document.body.innerHTML = '';
  localStorage.clear();
  window._esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const calls = [];
  window.authHeader = () => ({ Authorization: 'Bearer test-token' });
  window.apiFetch = jest.fn(async (p, init) => {
    calls.push({ path: p, method: (init && init.method) || 'GET' });
    // 실제 apiFetch 는 로그인 정보를 붙이지 않는다 — 서버처럼 Authorization 없으면 401 (2026-10-03 통합 점검에서 잡힘)
    const h = (init && init.headers) || {};
    if (String(p).startsWith('/auth/sample/') && h.Authorization !== 'Bearer test-token') return jsonRes({ detail: 'Not authenticated' }, false, 401);
    if (p === '/auth/sample/status') return typeof status === 'function' ? status() : jsonRes(status || { has_sample: false, total: 0, counts: {} });
    if (p === '/auth/sample/purge') return typeof purge === 'function' ? purge() : jsonRes(purge || { ok: true, deleted: { customers: 3, bookings: 4, inventory: 4, revenues: 0 } });
    return jsonRes({});
  });
  window.nativeConfirm = jest.fn(async () => confirm);
  window.showToast = jest.fn();
  window._clearAllSWRCache = jest.fn();
  window._fireDataChanged = jest.fn();
  // eslint-disable-next-line no-eval
  window.eval(HUB);
  window.openSettingsHub();
  const sheet = document.getElementById('settingsHubSheet');
  return { sheet, calls, row: sheet.querySelector('.ms-sh__row[data-act="samplepurge"]') };
}

describe('04 — 설정 허브 "샘플 데이터 지우기" 행', () => {
  test('🔴 행이 존재하고 처음엔 숨김(display:none) — 서버가 샘플 없음이라 하면 계속 숨김', async () => {
    const { row, calls } = bootHub({ status: { has_sample: false, total: 0, counts: {} } });
    expect(row).toBeTruthy();
    expect(row.textContent).toMatch(/샘플 데이터 지우기/);
    expect(row.style.display).toBe('none');
    await flush();
    expect(calls.filter(c => c.path === '/auth/sample/status').length).toBe(1);
    expect(row.style.display).toBe('none');
  });
  test('🔴 샘플이 남아 있으면 행이 보이고 설명에 건수가 들어간다', async () => {
    const { row } = bootHub({ status: { has_sample: true, total: 11, counts: { customers: 3, bookings: 4, inventory: 4, revenues: 0 } } });
    await flush();
    expect(row.style.display).toBe('');
    expect(row.querySelector('.ms-sh__meta').textContent).toMatch(/손님 3.*예약 4.*재고 4/);
  });
  test('상태 조회가 실패(401/오프라인)하면 행은 숨긴 채 둔다 — 뭘 지우는지 모른 채 누르게 하지 않는다', async () => {
    const { row } = bootHub({ status: () => { throw new Error('offline'); } });
    await flush();
    expect(row.style.display).toBe('none');
  });
  test('🔴 누르면 확인 → POST /auth/sample/purge → 행 숨김 · 캐시 비움 · data-changed(force_sync) · "샘플 11건을 지웠어요"', async () => {
    const { row, calls } = bootHub({ status: { has_sample: true, total: 11, counts: { customers: 3, bookings: 4, inventory: 4 } } });
    await flush();
    row.click();
    await flush();
    expect(window.nativeConfirm).toHaveBeenCalledTimes(1);
    const purges = calls.filter(c => c.path === '/auth/sample/purge');
    expect(purges).toEqual([{ path: '/auth/sample/purge', method: 'POST' }]);
    expect(row.style.display).toBe('none');
    expect(window._clearAllSWRCache).toHaveBeenCalledTimes(1);
    expect(window._fireDataChanged.mock.calls.map(c => c[0] && c[0].kind)).toEqual(expect.arrayContaining(['force_sync']));
    expect(window.showToast).toHaveBeenCalledWith('샘플 11건을 지웠어요');
  });
  test('확인에서 취소하면 아무 요청도 안 나간다', async () => {
    const { row, calls } = bootHub({ status: { has_sample: true, total: 11, counts: { customers: 3 } }, confirm: false });
    await flush();
    row.click();
    await flush();
    expect(calls.filter(c => c.path === '/auth/sample/purge').length).toBe(0);
    expect(row.style.display).toBe('');
  });
  test('🔴 purge 가 실패하면 행은 그대로 보이고 실패 토스트 — 거짓 "지웠어요" 금지', async () => {
    const { row } = bootHub({ status: { has_sample: true, total: 11, counts: { customers: 3 } }, purge: () => jsonRes({ detail: 'boom' }, false, 500) });
    await flush();
    row.click();
    await flush();
    expect(row.style.display).toBe('');
    expect(window.showToast).toHaveBeenCalledWith(expect.stringMatching(/지우지 못했어요/));
    expect(window.showToast).not.toHaveBeenCalledWith(expect.stringMatching(/지웠어요$/));
    expect(window._fireDataChanged).not.toHaveBeenCalled();
  });
  test('두 번 연달아 눌러도 purge 는 한 번만 나간다(중복 방지)', async () => {
    let resolve; const pending = new Promise(r => { resolve = r; });
    const { row, calls } = bootHub({ status: { has_sample: true, total: 3, counts: { customers: 3 } }, purge: () => pending });
    await flush();
    row.click(); await flush();
    row.click(); await flush();
    resolve(jsonRes({ ok: true, deleted: { customers: 3 } }));
    await flush();
    expect(calls.filter(c => c.path === '/auth/sample/purge').length).toBe(1);
  });
});
