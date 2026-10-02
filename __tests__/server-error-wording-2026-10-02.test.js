/**
 * @jest-environment jsdom
 *
 * mobile-ux-07 (P3) — 서버 5xx 를 "연결이 불안정해요 — 인터넷 연결을 확인하고" 로 안내했고(홈), 홈 '다시 시도' 가
 *   location.reload() 였으며, 일부 실패 문구는 서버 detail 원문(영문)을 그대로 붙였다(실측 "불러오기 실패: injected 500").
 *   · 홈 에러 카드: brief 가 5xx 로 끝났으면 '서버가 잠깐 불안정해요'(data-home-error="server"), fetch 예외면 네트워크 문구.
 *     '다시 시도' 는 HomeV41.refresh() (전체 새로고침 아님).
 *   · _humanError: 한글이 없는 원문은 원장에게 보이지 않는다(일시적인 오류…). 한국어 detail 은 그대로.
 *   · DM 큐 실패 화면에 '다시 시도' 버튼(_refresh).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HOME = fs.readFileSync(path.join(ROOT, 'app-home-v41.js'), 'utf8');
const CORE = fs.readFileSync(path.join(ROOT, 'app-core.js'), 'utf8');
const DCQ = fs.readFileSync(path.join(ROOT, 'app-dm-confirm-queue.js'), 'utf8');

function sliceBetween(src, from, to) {
  const a = src.indexOf(from); const b = src.indexOf(to, a + 1);
  if (a < 0 || b < 0) throw new Error('slice not found: ' + from);
  return src.slice(a, b);
}

describe('홈 에러 카드 — 서버/네트워크 구분 + 다시 시도는 refresh', () => {
  function loadHome({ failStatus = null, network = false } = {}) {
    document.body.innerHTML = '<div id="homeV41Root"></div>';
    const fetchSrc = sliceBetween(HOME, '  // [mobile-ux-07 2026-10-02] 마지막 brief 실패 사유', '  async function _withBookingRevenue(data) {');
    const errSrc = sliceBetween(HOME, '  function _showConnectionError(container) {', '  // [2026-08-22 UX-COLD] 스켈레톤');
    const calls = { refresh: 0 };
    window.HomeV41 = { refresh: () => { calls.refresh += 1; } };
    const env = {
      window, document, console,
      _authHeaders: () => ({ Authorization: 'Bearer t' }),
      apiFetch: async () => {
        if (network) throw new TypeError('Failed to fetch');
        return { ok: false, status: failStatus, json: async () => ({}) };
      },
      _writeSWR: () => {}, setTimeout: (fn) => fn(),
    };
    window.API = 'x';
    // eslint-disable-next-line no-new-func
    const f = new Function(...Object.keys(env), fetchSrc + errSrc + '; return { _fetchBrief, _showConnectionError };');
    return { api: f(...Object.values(env)), calls };
  }
  test('🔴 brief 가 5xx 로 끝나면 서버 문구(인터넷 탓 금지)', async () => {
    const { api } = loadHome({ failStatus: 500 });
    const r = await api._fetchBrief();
    expect(r).toBeNull();
    const c = document.getElementById('homeV41Root');
    api._showConnectionError(c);
    expect(c.querySelector('[data-home-error]').getAttribute('data-home-error')).toBe('server');
    expect(c.textContent).toMatch(/서버가 잠깐 불안정해요/);
    expect(c.textContent).not.toMatch(/인터넷 연결을 확인/);
  });
  test('fetch 예외(진짜 네트워크)면 기존 네트워크 문구', async () => {
    const { api } = loadHome({ network: true });
    await api._fetchBrief();
    const c = document.getElementById('homeV41Root');
    api._showConnectionError(c);
    expect(c.querySelector('[data-home-error]').getAttribute('data-home-error')).toBe('network');
    expect(c.textContent).toMatch(/인터넷 연결을 확인/);
  });
  test('🔴 다시 시도 = HomeV41.refresh() (location.reload 아님)', async () => {
    const { api, calls } = loadHome({ failStatus: 503 });
    await api._fetchBrief();
    const c = document.getElementById('homeV41Root');
    api._showConnectionError(c);
    c.querySelector('[data-home-reload]').click();
    expect(calls.refresh).toBe(1);
  });
});

describe('_humanError — 한글 없는 원문은 원장에게 보이지 않는다', () => {
  function loadHumanError() {
    const src = sliceBetween(CORE, 'window._humanError = function (e) {', '// --- Inline dialog helpers');
    window._isInternalErrorText = () => false;
    // eslint-disable-next-line no-new-func
    new Function('window', 'console', src)(window, { warn: () => {} });
    return window._humanError;
  }
  test('🔴 "injected 500" 같은 영문 원문 → 일시적인 오류 문구', () => {
    const h = loadHumanError();
    expect(h(new Error('injected 500'))).toMatch(/일시적인 오류/);
    expect(h({ detail: 'Internal error while saving' })).toMatch(/일시적인 오류/);
  });
  test('서버가 보낸 한국어 detail 은 그대로 통과(기존 동작)', () => {
    const h = loadHumanError();
    expect(h({ detail: '10월 4일 14:00는 이미 예약이 있어요 🥹' })).toBe('10월 4일 14:00는 이미 예약이 있어요 🥹');
  });
  test('기존 분류(5xx·네트워크·401)는 그대로', () => {
    const h = loadHumanError();
    expect(h(new Error('HTTP 502'))).toMatch(/서버 오류/);
    expect(h(new Error('Failed to fetch'))).toMatch(/네트워크/);
    expect(h(new Error('HTTP 401'))).toMatch(/로그인/);
  });
});

test('DM 큐 실패 화면에 다시 시도 버튼이 있고 _refresh 를 부른다 (소스 가드)', () => {
  const block = sliceBetween(DCQ, "불러오기 실패: ${_esc(", '  // [2026-06-16] 탭 카운트 갱신');
  expect(block).toMatch(/data-dcq-retry/);
  expect(block).toMatch(/\[data-dcq-retry\]'\)\?\.addEventListener\('click'/);
  expect(block).toMatch(/_refresh\(\)/);
});
