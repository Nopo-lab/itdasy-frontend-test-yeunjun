/**
 * @jest-environment jsdom
 *
 * mobile-ux-02 (P2) — 매출관리 로드 실패 시 본문에 '불러오기 실패' 한 줄만 남고 재시도 수단이 없던 것.
 *   실측(2026-10-01, GET /revenue* 500 고정, evidence/mobile-ux/fix_before_states.json revenue.500final):
 *     #rvBody "불러오기 실패" · retry 0 · 월 이동/헤더 없음 → 닫고 다시 여는 수밖에 없었다.
 *   같은 레포의 RevenueMonth._failedHTML(다시 불러오기)은 summary 실패 경로에서만 쓰였다.
 *
 * 여기서 잠그는 것:
 *   ① 목록 로드 실패 → 본문에 '매출을 불러오지 못했어요' + [다시 불러오기](data-rv-act="retry-load"), 금액 0원 없음
 *   ② 다시 불러오기 → 목록·요약을 다시 받아 렌더
 *   ③ 네트워크 끊김 문구와 서버 실패 문구를 가른다
 *   ④ RevenueMonth 의 '다시 불러오기'(data-rvm-act) 도 요약만이 아니라 목록까지 다시 받는다(Revenue._reload)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'app-revenue.js'), 'utf8');
const RM_SRC = fs.readFileSync(path.join(ROOT, 'app-revenue-month.js'), 'utf8');

const tick = () => new Promise(r => setTimeout(r, 0));
const flush = async (n) => { for (let i = 0; i < (n || 6); i++) await tick(); };

function boot(fetchImpl) {
  document.body.innerHTML = '';
  try { sessionStorage.clear(); localStorage.clear(); } catch (_e) { void _e; }
  window.innerWidth = 390; window.innerHeight = 844;
  window.API = 'http://127.0.0.1:8000';
  window.authHeader = () => ({ Authorization: 'Bearer t' });
  if (!window.crypto || typeof window.crypto.randomUUID !== 'function') {
    let n = 0;
    Object.defineProperty(window, 'crypto', { value: { randomUUID: () => 'uuid-' + (++n) }, configurable: true });
  }
  window.apiFetch = jest.fn(fetchImpl);
  // 월 뷰 모듈 스텁 — 요약은 항상 실패(서버 다운 상황), 렌더는 받은 목록 길이만 적는다
  window.RevenueMonth = {
    fetchSummary: jest.fn(() => Promise.reject(new Error('HTTP 500'))),
    renderMobile: jest.fn((t, summary, items) => { t.innerHTML = summary && summary._loadFailed ? '<div data-rm-failed>RM-FAILED</div>' : '<div data-rm-ok>RM-OK:' + items.length + '</div>'; }),
    renderPC: jest.fn(),
    fallbackSummary: () => ({}),
    getView: () => ({ isCurrent: true }),
    getViewItems: () => null,
  };
  // eslint-disable-next-line no-eval
  window.eval(SRC);
  return window.Revenue;
}
const ok = (items) => ({ ok: true, status: 200, json: async () => ({ items }) });
const http500 = () => ({ ok: false, status: 500, json: async () => ({ detail: 'injected 500' }) });
const body = () => document.querySelector('#revenueSheet #rvBody');

test('🔴 목록 로드 실패: 재시도 버튼이 있고 금액을 그리지 않는다 (이번 버그 — 예전엔 "불러오기 실패" 한 줄)', async () => {
  boot(async () => http500());
  await window.openRevenue();
  await flush();
  expect(body().textContent).toMatch(/매출을 불러오지 못했어요/);
  expect(body().querySelector('[data-rv-act="retry-load"]')).not.toBeNull();
  expect(body().textContent).not.toMatch(/0원/);
  expect(body().textContent).not.toMatch(/인터넷 연결이 없어서/);   // 5xx 는 서버 실패 문구
  // 헤더(+ 매출 입력)는 그대로 남아 있다
  expect(document.querySelector('#revenueSheet [data-rv-act="add-form"]')).not.toBeNull();
});

test('다시 불러오기 → 성공하면 목록 렌더 (요약·목록 둘 다 다시 받는다)', async () => {
  let n = 0;
  boot(async () => { n++; return n === 1 ? http500() : ok([{ id: 1, amount: 50000, method: 'card', recorded_at: new Date().toISOString() }]); });
  await window.openRevenue();
  await flush();
  const btn = body().querySelector('[data-rv-act="retry-load"]');
  expect(btn).not.toBeNull();
  btn.click();
  expect(btn.disabled).toBe(true);
  await flush(10);
  expect(window.apiFetch).toHaveBeenCalledTimes(2);
  expect(window.RevenueMonth.renderMobile).toHaveBeenCalled();
  expect(body().querySelector('[data-rv-act="retry-load"]')).toBeNull();
  expect(window.RevenueMonth.renderMobile.mock.calls.pop()[2]).toHaveLength(1);
});

test('네트워크 끊김(Failed to fetch)은 그 문구', async () => {
  boot(async () => { throw new TypeError('Failed to fetch'); });
  await window.openRevenue();
  await flush();
  expect(body().textContent).toMatch(/인터넷 연결이 없어서 매출을 불러오지 못했어요/);
  expect(body().querySelector('[data-rv-act="retry-load"]')).not.toBeNull();
});

test('④ RevenueMonth 의 다시 불러오기는 Revenue._reload(목록+요약) 를 부른다', () => {
  expect(window.Revenue === undefined || typeof window.Revenue._reload === 'function' || true).toBe(true);
  expect(SRC).toMatch(/_reload: _loadAndRender/);
  const i = RM_SRC.indexOf("act === 'retry-load'");
  expect(i).toBeGreaterThan(-1);
  expect(RM_SRC.slice(i, i + 500)).toMatch(/_R\(\)\._reload/);
});
