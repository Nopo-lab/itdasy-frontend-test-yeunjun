/** @jest-environment jsdom */
'use strict';
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../app-comment-reply-queue.js'), 'utf8');
const response = body => ({ ok: true, json: async () => body });
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const row = id => ({ comment_id: id, media_id: 'm1', username: 'qa', text: '위치가 어디인가요?',
  intent: 'location', timestamp: new Date().toISOString(), draft_public: '서울에 있어요' });
let queue, reply, requests;

async function boot() {
  jest.useFakeTimers();
  document.body.innerHTML = '';
  localStorage.clear();
  requests = [];
  queue = async () => response({ connected: true, items: [row('c1'), row('c2')] });
  reply = async () => response({ ok: true });
  window.apiUrl = p => p;
  window.authHeader = () => ({});
  window.showToast = jest.fn();
  window._registerSheet = window._markSheetOpen = window._markSheetClosed = () => {};
  window.WorkspaceAdapter = { instagram: () => ({ connected: true }) };
  window._esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  window.requestAnimationFrame = fn => fn();
  window.apiFetch = jest.fn((url, opts) => {
    requests.push({ url, opts });
    if (url.endsWith('/comment-queue')) return queue();
    if (url.endsWith('/comment-reply')) return reply(opts);
    return Promise.resolve(response({ settings: {} }));
  });
  new Function(source).call(window);
  window.openCommentReplyQueue();
  await flush();
}
function edit(text) {
  document.querySelector('.crq-edit').click();
  const ta = document.querySelector('.crq-edit-pub');
  ta.value = text;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
  return ta;
}
async function poll() { jest.advanceTimersByTime(30000); await flush(); }
const cards = () => document.querySelectorAll('.crq-item');

afterEach(() => {
  if (window.closeCommentReplyQueue) window.closeCommentReplyQueue();
  jest.clearAllTimers();
  jest.useRealTimers();
});

test.each(['response', 'network'])('묶음 %s 실패는 문의와 수정 답글을 복구한다', async mode => {
  await boot();
  edit('제가 직접 쓴 답변');
  reply = async () => {
    if (mode === 'network') throw new Error('offline');
    return response({ ok: false, error_code: 'temporary' });
  };
  document.querySelector('.crq-batch').click();
  await flush();
  expect(cards()).toHaveLength(2);
  expect(document.body.textContent).toContain('제가 직접 쓴 답변');
  expect(Object.keys(JSON.parse(localStorage.getItem('itdasy:crq_hidden')))).toHaveLength(0);
  await poll();
  expect(cards()).toHaveLength(2);
  expect(document.body.textContent).toContain('제가 직접 쓴 답변');
});

test('묶음 일부 실패는 성공한 문의만 숨기고 연타도 1회씩만 요청한다', async () => {
  await boot();
  reply = async opts => response({ ok: JSON.parse(opts.body).comment_id === 'c1' });
  const button = document.querySelector('.crq-batch');
  button.click(); button.click();
  await flush();
  expect(cards()).toHaveLength(1);
  expect(requests.filter(x => x.url.endsWith('/comment-reply'))).toHaveLength(2);
});

test('답글 입력 중 자동 새로고침은 입력칸과 포커스를 유지한다', async () => {
  await boot();
  const ta = edit('작성 중인 문장');
  await poll();
  expect(document.querySelector('.crq-edit-pub')).toBe(ta);
  expect(ta.value).toBe('작성 중인 문장');
  expect(document.activeElement).toBe(ta);
});

test.each(['success', 'failure'])('새로고침 시작 후 입력해도 늦은 %s 응답이 덮지 않는다', async mode => {
  await boot();
  let resolve, reject;
  queue = () => new Promise((yes, no) => { resolve = yes; reject = no; });
  await poll();
  const ta = edit('응답을 기다리는 사이 쓴 문장');
  if (mode === 'success') resolve(response({ connected: true, items: [row('c1'), row('c2')] }));
  else reject(new Error('offline'));
  await flush();
  expect(document.querySelector('.crq-edit-pub')).toBe(ta);
  expect(ta.value).toBe('응답을 기다리는 사이 쓴 문장');
});

test('수정 완료한 답글과 보내기 끔 선택은 새 댓글 도착 후에도 유지된다', async () => {
  await boot();
  edit('최종 수정 답글');
  document.querySelector('.crq-edit').click();
  document.querySelector('.crq-tg[data-kind="pub"]').click();
  queue = async () => response({ connected: true, items: [row('c1'), row('c2'), row('c3')] });
  await poll();
  expect(cards()).toHaveLength(3);
  expect(document.querySelector('.crq-tg[data-kind="pub"]').getAttribute('aria-checked')).toBe('false');
  document.querySelector('.crq-tg[data-kind="pub"]').click();
  expect(document.body.textContent).toContain('최종 수정 답글');
});

test('느린 자동 갱신이 진행 중이면 다음 주기에 요청을 중복하지 않는다', async () => {
  await boot();
  let resolve;
  queue = () => new Promise(yes => { resolve = yes; });
  await poll(); await poll();
  expect(requests.filter(x => x.url.endsWith('/comment-queue'))).toHaveLength(2);
  resolve(response({ connected: true, items: [row('c1')] }));
  await flush();
  expect(cards()).toHaveLength(1);
});


test('정렬을 바꿔도 완료를 누르기 전 답글을 보존한다', async () => {
  await boot();
  edit('정렬 전 작성 중');
  document.querySelector('.crq-sort').click();
  expect(document.querySelector('.crq-edit-pub').value).toBe('정렬 전 작성 중');
});
