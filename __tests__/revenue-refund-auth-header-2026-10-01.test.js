/**
 * @jest-environment jsdom
 *
 * flow-revenue-stats-ui-01 (P1) — 매출 행 탭(인라인 편집)·환불이 Authorization 헤더 없이 나가
 * 401 → 토큰 강제 갱신 → (갱신 실패) 강제 로그아웃 / (갱신 성공) 진행 중 저장이 'session_changed' 거짓 실패.
 *
 * 실측(2026-10-01, 로컬 스택, evidence/flow-revenue-stats-ui/refresh_fail_500.log · inline_slow2_390.log):
 *   행 탭 → `GET /revenue/123/refunds 401 | auth hdr sent: false` → `POST /auth/refresh 500`
 *   → 토큰 삭제 + 잠금화면 '로그인이 필요해요'. 갱신이 성공해도 토큰 값이 바뀌어
 *   PATCH 가 `수정 실패: session_changed` — 서버엔 이미 반영(12500).
 *
 * 원인: js/revenue-edit.js 가 window.apiFetch 를 **헤더 없이 직접** 불렀다(래퍼 우회).
 *   app-revenue.js 의 _api() 는 토큰 **문자열**이 바뀌면 전부 session_changed 로 봤다 — 같은 사용자의
 *   토큰 갱신도 실패로 만든다.
 * 고침: 환불 조회/기록을 Revenue.refunds / Revenue.refund 공용 경로(_api, 인증 자동)로 통일.
 *   session_changed 는 **사용자(sub)가 바뀐 경우**로 좁힌다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const REV = fs.readFileSync(path.join(ROOT, 'app-revenue.js'), 'utf8');
const EDIT = fs.readFileSync(path.join(ROOT, 'js/revenue-edit.js'), 'utf8');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const jwt = (sub, sig) => 'h.' + b64({ sub: String(sub), exp: 9999999999 }) + '.' + sig;
const flush = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)); };

function boot(fetchImpl) {
  document.body.innerHTML = '';
  window.API = 'http://127.0.0.1:8000';
  window._esc = (s) => String(s == null ? '' : s);
  window.showToast = jest.fn();
  if (!window.crypto || typeof window.crypto.randomUUID !== 'function') {
    let n = 0;
    Object.defineProperty(window, 'crypto', { value: { randomUUID: () => 'uuid-' + (++n) }, configurable: true });
  }
  window.apiFetch = jest.fn(fetchImpl);
  // eslint-disable-next-line no-eval
  window.eval(REV);
  // eslint-disable-next-line no-eval
  window.eval(EDIT);
  return { R: window.Revenue, E: window.RevenueEdit };
}
const okJson = (body, status) => ({ ok: true, status: status || 200, json: async () => body });

describe('인라인 편집 패널 — 환불 조회/기록이 인증 헤더를 싣는다', () => {
  test('🔴 행 탭 → GET /revenue/{id}/refunds 에 Authorization 이 실린다', async () => {
    const tok = jwt(7, 'a');
    window.authHeader = () => ({ Authorization: 'Bearer ' + tok });
    const { E } = boot(async () => okJson({ refunded_total: 0, refundable: 12500, items: [] }));
    const row = document.createElement('div');
    document.body.appendChild(row);
    E.toggle(row, { id: 5, amount: 12500, method: 'card' });
    await flush();
    const call = window.apiFetch.mock.calls.find(c => c[0] === '/revenue/5/refunds');
    expect(call).toBeTruthy();
    expect(call[1] && call[1].headers && call[1].headers.Authorization).toBe('Bearer ' + tok);
  });

  test('🔴 환불 버튼 → POST /revenue/{id}/refund 에 Authorization + client_txn_id', async () => {
    const tok = jwt(7, 'a');
    window.authHeader = () => ({ Authorization: 'Bearer ' + tok });
    const { E } = boot(async (p) => {
      if (p === '/revenue/5/refunds') return okJson({ refunded_total: 0, refundable: 12500, items: [] });
      return okJson({ id: 77, amount: -12500, refund_of_id: 5 }, 201);
    });
    const row = document.createElement('div');
    document.body.appendChild(row);
    E.toggle(row, { id: 5, amount: 12500, method: 'card' });
    await flush();
    const panel = row.nextElementSibling;
    panel.querySelector('[data-rie-refund]').click();   // _inlineConfirm 없음 → 바로 실행
    await flush();
    const call = window.apiFetch.mock.calls.find(c => c[0] === '/revenue/5/refund');
    expect(call).toBeTruthy();
    expect(call[1].method).toBe('POST');
    expect(call[1].headers.Authorization).toBe('Bearer ' + tok);
    expect(JSON.parse(call[1].body).client_txn_id).toMatch(/^refund-5-/);
    expect(window.showToast).toHaveBeenCalledWith('환불로 기록했어요', 'success');
  });

  test('소스 가드: revenue-edit.js 는 window.apiFetch 를 직접 부르지 않는다 (공용 경로만)', () => {
    expect(EDIT).not.toMatch(/window\.apiFetch\(/);
    expect(REV).toMatch(/refunds\s*[(:]/);
    expect(REV).toMatch(/refund\s*[(:]/);
  });
});

describe('_api session_changed — 사용자가 바뀐 경우로만', () => {
  test('🔴 같은 사용자의 토큰 갱신(sub 동일·서명 다름)은 실패가 아니다', async () => {
    let tok = jwt(7, 'old');
    window.authHeader = () => ({ Authorization: 'Bearer ' + tok });
    const { R } = boot(async () => { tok = jwt(7, 'refreshed'); return okJson({ id: 1, amount: 12500, method: 'card' }); });
    await expect(R.update(1, { amount: 12500, method: 'card' })).resolves.toMatchObject({ amount: 12500 });
  });
  test('다른 사용자로 바뀌면(sub 다름) session_changed', async () => {
    let tok = jwt(7, 'a');
    window.authHeader = () => ({ Authorization: 'Bearer ' + tok });
    const { R } = boot(async () => { tok = jwt(8, 'b'); return okJson({ id: 1, amount: 12500 }); });
    await expect(R.update(1, { amount: 12500 })).rejects.toThrow(/session_changed/);
  });
  test('요청 중 로그아웃(토큰 사라짐)도 session_changed', async () => {
    let tok = jwt(7, 'a');
    window.authHeader = () => (tok ? { Authorization: 'Bearer ' + tok } : {});
    const { R } = boot(async () => { tok = ''; return okJson({ id: 1, amount: 12500 }); });
    await expect(R.update(1, { amount: 12500 })).rejects.toThrow(/session_changed/);
  });
});
