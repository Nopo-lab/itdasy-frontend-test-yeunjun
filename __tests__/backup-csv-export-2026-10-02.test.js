/**
 * @jest-environment jsdom
 *
 * [기존 결함 · BE-G2-B 재수정 2026-10-02] 설정 > 백업 > '매출 데이터만 CSV(최근 12개월)' 가 GET /revenue?period=year 로
 * **422** 를 받고, 그 실패를 `.catch(() => ({ items: [] }))` 가 빈 목록으로 삼켜 원장에게 '내보낼 데이터가 없어요' 라고 안내했다.
 *
 * 실측(검증자 backup_revenue_csv.txt — 데모 계정, 9월 710,000원 8건 · 10월 50,611,000원 4건):
 *   reqs ["422 /revenue?period=year"] · toasts ["데이터 받아오는 중...", "내보낼 데이터가 없어요"]
 *   curl: 'String should match pattern ^(today|week|month|last_week|last_month|custom)$' HTTP 422
 *
 * 같은 함수의 남은 구멍도 같이 본다:
 *   · 12개월 custom 범위로 고쳐도 목록은 기본 2,000행에서 잘린다(has_more) → offset 으로 끝까지 이어 받는다.
 *   · 열 이름이 응답과 달랐다(r.date·r.menu·r.service·r.channel 은 RevenueOut 에 없다) → 날짜·시술·결제수단 칸이 비었다.
 *   · '고객 데이터만 CSV' 도 같은 삼키기 + GET /customers 기본 200명 상한(has_more) → 201번째 손님부터 빠졌다.
 * 계약: 실패는 '내보내기 실패', 데이터가 정말 0건일 때만 '내보낼 데이터가 없어요'. 잘린 채로 저장하지 않는다(멈추면 알린다).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'app-backup.js'), 'utf8');

const flush = async () => { for (let i = 0; i < 30; i++) await new Promise(r => setTimeout(r, 0)); };

function revRows(n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({ id: n - i, amount: 10000 + i, method: i % 2 ? 'cash' : 'card', service_name: '젤네일', customer_name: '손님' + i,
      memo: i === 0 ? '쉼표, "따옴표"' : null, recorded_at: new Date(Date.UTC(2026, 8, 30, 15, 0, 0) - i * 60000).toISOString(),
      created_at: '2026-10-02T00:00:00Z' });
  }
  return rows;
}
function custRows(n) {
  const rows = [];
  for (let i = 0; i < n; i++) rows.push({ id: i + 1, name: '고객' + i, phone: '010-0000-' + String(i).padStart(4, '0'), visit_count: i % 5, last_visit_at: '2026-09-01T03:00:00Z', memo: '' });
  return rows;
}

/** 실제 백엔드 규칙: period 패턴 밖이면 422, 목록은 기본 limit(매출 2000·고객 200) + offset. */
function boot({ revenue = revRows(0), customers = custRows(0), fail = null, offsetSupported = true } = {}) {
  document.body.innerHTML = '';
  window.API = 'http://127.0.0.1:8000';
  window.authHeader = () => ({ Authorization: 'Bearer t' });
  window.showToast = jest.fn();
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  const saved = [];
  // jsdom 의 Blob 엔 text() 가 없다 → FileReader 로 읽는다
  const readBlob = (blob) => new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsText(blob); });
  window.saveFile = jest.fn(async (blob, filename) => { saved.push({ filename, text: await readBlob(blob) }); return { ok: true }; });
  const urls = [];
  global.fetch = window.fetch = jest.fn(async (u) => {
    const p = String(u).replace(window.API, '');
    urls.push(p);
    const q = new URL('http://x' + p);
    const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
    if (fail && q.pathname === fail) return json(500, { detail: '서버 오류' });
    if (q.pathname === '/revenue') {
      if (!/^(today|week|month|last_week|last_month|custom)$/.test(q.searchParams.get('period') || 'today')) {
        return json(422, { detail: '요청 형식이 올바르지 않습니다.' });
      }
      const limit = Number(q.searchParams.get('limit') || 2000);
      const offset = offsetSupported ? Number(q.searchParams.get('offset') || 0) : 0;
      const page = revenue.slice(offset, offset + limit);
      return json(200, { items: page, total: revenue.reduce((s, r) => s + r.amount, 0), count: revenue.length,
        has_more: offset + page.length < revenue.length, returned: page.length });
    }
    if (q.pathname === '/customers') {
      const limit = Number(q.searchParams.get('limit') || 200);
      const offset = offsetSupported ? Number(q.searchParams.get('offset') || 0) : 0;
      const page = customers.slice(offset, offset + limit);
      return json(200, { items: page, total: customers.length, has_more: offset + page.length < customers.length, returned: page.length });
    }
    return json(404, {});
  });
  // eslint-disable-next-line no-eval
  window.eval(SRC);
  window.openBackupScreen();
  const click = async (kind) => { document.querySelector(`[data-bk-export="${kind}"]`).click(); await flush(); };
  const toasts = () => window.showToast.mock.calls.map(c => String(c[0]));
  return { urls, saved, click, toasts };
}

const lines = (text) => text.replace(/^﻿/, '').split('\n');

test('🔴 매출 CSV — 422 나는 period=year 대신 최근 12개월 custom 범위, 목록 상한을 넘어도 끝까지', async () => {
  const { urls, saved, click, toasts } = boot({ revenue: revRows(5200) });
  await click('revenue');
  const rev = urls.filter(u => u.indexOf('/revenue?') === 0);
  expect(rev.some(u => /period=year/.test(u))).toBe(false);
  expect(rev[0]).toMatch(/^\/revenue\?period=custom&from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/);
  const m = rev[0].match(/from=(\d{4}-\d{2}-\d{2})&to=(\d{4}-\d{2}-\d{2})/);
  const days = (new Date(m[2]) - new Date(m[1])) / 86400000;
  expect(days).toBeGreaterThanOrEqual(364);
  expect(days).toBeLessThanOrEqual(366);
  expect(rev[1]).toBe(rev[0] + '&offset=5000');          // 한 페이지(서버 상한 5,000)를 넘으면 이어 받는다
  expect(saved).toHaveLength(1);
  const ls = lines(saved[0].text);
  expect(ls).toHaveLength(1 + 5200);
  expect(toasts()).toContain('5200건 내보냈어요');
  expect(toasts().some(t => /없어요/.test(t))).toBe(false);
});

test('🔴 매출 CSV — 칸이 실제 응답 필드로 채워진다 (날짜·금액·시술·결제수단·고객·메모)', async () => {
  const { saved, click } = boot({ revenue: revRows(3) });
  await click('revenue');
  const ls = lines(saved[0].text);
  expect(ls[0]).toBe('날짜,금액,시술/메뉴,결제수단,고객,메모');
  // recorded_at 2026-09-30T15:00Z = 10/1 00:00 KST
  expect(ls[1]).toBe('2026-10-01 00:00,10000,젤네일,카드,손님0,"쉼표, ""따옴표"""');
  expect(ls[2].split(',')[3]).toBe('현금');
});

test('🔴 매출 CSV — 서버 실패는 "내보내기 실패" (데이터 없음이라고 하지 않는다), 파일도 안 만든다', async () => {
  const { saved, click, toasts } = boot({ revenue: revRows(5), fail: '/revenue' });
  await click('revenue');
  expect(saved).toHaveLength(0);
  expect(toasts().some(t => /내보내기 실패/.test(t))).toBe(true);
  expect(toasts().some(t => /내보낼 데이터가 없어요/.test(t))).toBe(false);
});

test('매출이 정말 0건이면 그때만 "내보낼 데이터가 없어요"', async () => {
  const { saved, click, toasts } = boot({ revenue: [] });
  await click('revenue');
  expect(saved).toHaveLength(0);
  expect(toasts()).toContain('내보낼 데이터가 없어요');
});

test('🔴 고객 CSV — 기본 200명 상한을 넘어 끝까지, 실패는 실패로', async () => {
  const a = boot({ customers: custRows(450) });
  await a.click('customers');
  expect(lines(a.saved[0].text)).toHaveLength(1 + 450);
  expect(a.toasts()).toContain('450건 내보냈어요');
  const b = boot({ customers: custRows(3), fail: '/customers' });
  await b.click('customers');
  expect(b.saved).toHaveLength(0);
  expect(b.toasts().some(t => /내보내기 실패/.test(t))).toBe(true);
});

test('offset 을 모르는 옛 서버 — 무한히 돌지 않고, 잘린 파일을 "완료" 로 저장하지 않는다', async () => {
  const { saved, click, toasts, urls } = boot({ revenue: revRows(5200), offsetSupported: false });
  await click('revenue');
  expect(urls.filter(u => u.indexOf('/revenue?') === 0).length).toBeLessThanOrEqual(3);
  expect(saved).toHaveLength(0);
  expect(toasts().some(t => /내보내기 실패/.test(t) && /전체 데이터/.test(t))).toBe(true);
});
