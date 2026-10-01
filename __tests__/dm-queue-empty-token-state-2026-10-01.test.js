/**
 * @jest-environment jsdom
 *
 * flow-inbox-dm-comments-05 (P3) — 인스타를 한 번도 연결하지 않은 계정의 DM 확인 큐 빈 화면이
 * '답장이 필요한 메시지가 없어요 ✨ 잇비가 잘 챙기고 있어요' — 다음 행동(인스타 연결) 안내가 없다.
 *
 * 실측(evidence/flow-inbox-dm-comments/fe_02_dm_queue.png): 데모 계정 GET /dm-confirm-queue 응답 헤더
 *   x-token-state: none 인데 시트는 그 헤더를 버리고(_fetch 가 JSON 만 돌려줌) 0건이면 상태 구분 없이 같은 문구.
 *   댓글 큐는 NOT_CONNECTED 에서 '인스타가 연결되어 있지 않아요 … [인스타 연결하기]' 로 안내한다.
 * 고침: 응답 헤더 X-Token-State 를 보관하고 빈 목록을 none / expired / ok 3분기로 — 문구는 댓글 큐·홈 카드와 동일.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'app-dm-confirm-queue.js'), 'utf8');

const flush = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)); };

async function openWith(tokenState) {
  document.body.innerHTML = '';
  window.API = 'http://127.0.0.1:8000';
  window.authHeader = () => ({ Authorization: 'Bearer t' });
  window._esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  window.showToast = jest.fn();
  window.openIntegrationsHub = jest.fn();
  window.apiFetch = jest.fn(async () => ({
    ok: true, status: 200,
    headers: { get: (k) => (String(k).toLowerCase() === 'x-token-state' ? tokenState : (String(k).toLowerCase() === 'x-token-valid' ? (tokenState === 'ok' ? '1' : '0') : null)) },
    json: async () => [],
  }));
  // eslint-disable-next-line no-eval
  window.eval(SRC);
  await window.openDMConfirmQueue();
  await flush();
  return document.getElementById('dcqList');
}
afterEach(() => { try { window.closeDMConfirmQueue(); } catch (_e) { void _e; } });

test('🔴 none(한 번도 연결 안 함) → "인스타가 연결되어 있지 않아요" + [인스타 연결하기] → 연동 허브', async () => {
  const list = await openWith('none');
  expect(list.textContent).toMatch(/인스타가 연결되어 있지 않아요/);
  expect(list.textContent).not.toMatch(/잇비가 잘 챙기고 있어요/);
  const btn = Array.from(list.querySelectorAll('button')).find(b => /인스타 연결하기/.test(b.textContent));
  expect(btn).toBeTruthy();
  btn.click();
  await flush();
  expect(window.openIntegrationsHub).toHaveBeenCalledTimes(1);
  expect(document.getElementById('dmConfirmQueueSheet').style.display).toBe('none');
});

test('🔴 expired(연결됐다가 끊김) → "인스타 연결이 끊겼어요" + [다시 연결]', async () => {
  const list = await openWith('expired');
  expect(list.textContent).toMatch(/인스타 연결이 끊겼어요/);
  const btn = Array.from(list.querySelectorAll('button')).find(b => /다시 연결/.test(b.textContent));
  expect(btn).toBeTruthy();
  btn.click();
  await flush();
  expect(window.openIntegrationsHub).toHaveBeenCalledTimes(1);
});

test('ok(연결 정상·0건) → 기존 문구 그대로', async () => {
  const list = await openWith('ok');
  expect(list.textContent).toMatch(/답장이 필요한 메시지가 없어요/);
  expect(list.textContent).not.toMatch(/연결/);
});

test('헤더가 없는 옛 서버 응답도 기존 문구 (모르면 끊겼다고 하지 않는다)', async () => {
  const list = await openWith(null);
  expect(list.textContent).toMatch(/답장이 필요한 메시지가 없어요/);
});
