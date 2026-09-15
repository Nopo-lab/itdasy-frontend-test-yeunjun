/** @jest-environment jsdom */
'use strict';
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../app-dm-confirm-queue.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const item = { id: 1, sender_igsid: 'qa', sender_username: 'QA', intent: 'location',
  ai_draft_text: '원래 추천 답글', status: 'pending', message_text: '어디인가요?' };
const response = body => ({ ok: true, json: async () => body });
let getQueue, requests;
async function boot(initialItems = [item]) {
  jest.useFakeTimers();
  document.body.innerHTML = '';
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  requests = [];
  getQueue = async () => response(initialItems);
  window.apiUrl = p => p;
  window.authHeader = () => ({});
  window.showToast = jest.fn();
  window._esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  window.apiFetch = jest.fn((url, opts) => {
    requests.push({ url, opts });
    return opts.method === 'GET' ? getQueue() : Promise.resolve(response({ ok: true }));
  });
  new Function(source).call(window);
  await window.openDMConfirmQueue();
}
function edit(text) {
  document.querySelector('.dcq-edit-btn').click();
  const ta = document.querySelector('.dcq-edit');
  ta.value = text;
  return ta;
}
afterEach(() => {
  window.closeDMConfirmQueue();
  jest.clearAllTimers(); jest.useRealTimers();
});

test.each(['success', 'failure'])('조회 시작 후 쓴 DM을 늦은 %s 응답이 지우지 않는다', async mode => {
  await boot();
  let resolve, reject;
  getQueue = () => new Promise((yes, no) => { resolve = yes; reject = no; });
  jest.advanceTimersByTime(4000); await flush();
  const ta = edit('원장이 입력 중');
  if (mode === 'success') resolve(response([item])); else reject(new Error('offline'));
  await flush();
  expect(document.querySelector('.dcq-edit')).toBe(ta);
  expect(ta.value).toBe('원장이 입력 중');
  expect(ta.style.display).toBe('block');
});

test('수정칸을 비운 채 보내면 원문을 보내지 않고 입력을 안내한다', async () => {
  await boot(); edit('   ');
  document.querySelector('.dcq-send').click(); await flush();
  expect(requests.filter(r => r.opts.method === 'POST')).toHaveLength(0);
  expect(window.showToast).toHaveBeenCalledWith('보낼 답장을 입력해 주세요');
});

test('수정한 답글은 수정 발송 경로에 원문 그대로 전달된다', async () => {
  await boot(); edit('새 답글');
  document.querySelector('.dcq-send').click(); await flush();
  const post = requests.find(r => r.opts.method === 'POST');
  expect(post.url).toContain('send_edit');
  expect(JSON.parse(post.opts.body)).toEqual(expect.objectContaining({ edited_reply: '새 답글' }));
});


test('현재 채널을 다시 눌러도 작성한 답글이 유지된다', async () => {
  await boot(); edit('채널 이동 전에 쓴 문장');
  document.querySelector('[data-filter="all"]').click();
  expect(document.querySelector('.dcq-edit').value).toBe('채널 이동 전에 쓴 문장');
  expect(document.querySelector('.dcq-edit').style.display).toBe('block');
});

test('다른 채널과 닫기를 거쳐 돌아와도 작성본을 유지한다', async () => {
  await boot(); edit('아직 보내지 않은 문장');
  window.ChannelMark = { norm: c => c || 'instagram', mark: () => '' };
  document.querySelector('[data-filter="naver"]').click();
  expect(document.querySelector('.dcq-edit')).toBeNull();
  window.closeDMConfirmQueue();
  await window.openDMConfirmQueue();
  document.querySelector('[data-filter="all"]').click();
  expect(document.querySelector('.dcq-edit').value).toBe('아직 보내지 않은 문장');
  delete window.ChannelMark;
});

test('로그인이 끝나면 작성본과 이전 목록을 비운다', async () => {
  await boot(); edit('이전 계정의 문장');
  document.querySelector('[data-filter="all"]').click();
  document.dispatchEvent(new Event('itdasy:auth-expired'));
  expect(document.getElementById('dcqList').textContent).toBe('');
  await window.openDMConfirmQueue();
  expect(document.querySelector('.dcq-edit').value).not.toBe('이전 계정의 문장');
});


test.each(['success', 'failure'])('계정 전환 후 옛 %s 응답이 이전 목록을 되살리지 않는다', async mode => {
  await boot();
  let resolve, reject;
  getQueue = () => new Promise((yes, no) => { resolve = yes; reject = no; });
  jest.advanceTimersByTime(4000); await flush();
  window.dispatchEvent(new CustomEvent('itdasy:session-ready', { detail: { userId: 99 } }));
  if (mode === 'success') resolve(response([item])); else reject(new Error('offline'));
  await flush();
  expect(document.getElementById('dcqList').textContent).toBe('');
});

test('채널 이동 뒤 예약 확정 문구와 시술 시간을 복원한다', async () => {
  const booking = { ...item, action_required: 'booking_action', action_meta: {
    deposit_sent: true, confirm_preview: '처음 확정 문구', default_duration_min: 60, runway_min: 60
  } };
  await boot([booking]);
  document.querySelector('.dcq-cpv-edit').click();
  const confirm = document.querySelector('.dcq-cpv-ta');
  confirm.value = '원장이 고친 확정 문구';
  document.querySelector('.dcq-dur-btn[data-step="30"]').click();
  document.querySelector('[data-filter="all"]').click();
  expect(document.querySelector('.dcq-cpv-ta').value).toBe('원장이 고친 확정 문구');
  expect(document.querySelector('.dcq-cpv-ta').style.display).toBe('block');
  expect(document.querySelector('.dcq-dur').dataset.dur).toBe('90');
  expect(document.querySelector('.dcq-dur-warn').style.display).toBe('flex');
});

test('채널 이동 뒤 입력한 샵 주소를 복원한다', async () => {
  const address = { ...item, action_meta: { set_address: true } };
  await boot([address]);
  document.querySelector('.dcq-set-address').value = '서울 강남구 테스트로 12';
  document.querySelector('[data-filter="all"]').click();
  expect(document.querySelector('.dcq-set-address').value).toBe('서울 강남구 테스트로 12');
});

test('예약 확정 문구를 비운 채 확정하면 원문을 보내지 않는다', async () => {
  const booking = { ...item, action_required: 'booking_action', action_meta: {
    deposit_sent: true, confirm_preview: '처음 확정 문구', default_duration_min: 60
  } };
  await boot([booking]);
  document.querySelector('.dcq-cpv-edit').click();
  document.querySelector('.dcq-cpv-ta').value = '   ';
  document.querySelector('.dcq-send').click();
  await flush();
  expect(requests.filter(r => r.opts.method === 'POST')).toHaveLength(0);
  expect(window.showToast).toHaveBeenCalledWith('손님에게 보낼 확정 문구를 입력해 주세요');
});

test('예약 가능 시간이 0이면 채널 이동 뒤에도 겹침 경고를 새로 켜지 않는다', async () => {
  const booking = { ...item, action_required: 'booking_action', action_meta: {
    default_duration_min: 60, runway_min: 0
  } };
  await boot([booking]);
  document.querySelector('.dcq-dur-btn[data-step="30"]').click();
  document.querySelector('[data-filter="all"]').click();
  expect(document.querySelector('.dcq-dur-warn').style.display).toBe('none');
});

test('채널 이동 뒤 예약 확정 요청에 고친 문구와 시술 시간을 보낸다', async () => {
  const booking = { ...item, action_required: 'booking_action', action_meta: {
    deposit_sent: true, confirm_preview: '처음 확정 문구', default_duration_min: 60
  } };
  await boot([booking]);
  document.querySelector('.dcq-cpv-edit').click();
  document.querySelector('.dcq-cpv-ta').value = '수정 확정';
  document.querySelector('.dcq-dur-btn[data-step="30"]').click();
  document.querySelector('[data-filter="all"]').click();
  document.querySelector('.dcq-send').click();
  await flush();
  const post = requests.find(r => r.opts.method === 'POST');
  expect(JSON.parse(post.opts.body)).toEqual(expect.objectContaining({ final_text: '수정 확정', duration_min: 90 }));
});

test('예약 답글을 고쳐 보내도 시술 시간을 함께 보낸다', async () => {
  const booking = { ...item, action_required: 'booking_action', action_meta: {
    default_duration_min: 60
  } };
  await boot([booking]);
  edit('직접 고친 예약 답글');
  document.querySelector('.dcq-dur-btn[data-step="30"]').click();
  document.querySelector('.dcq-send').click();
  await flush();
  const post = requests.find(r => r.opts.method === 'POST');
  expect(post.url).toContain('send_edit');
  expect(JSON.parse(post.opts.body)).toEqual({ edited_reply: '직접 고친 예약 답글', duration_min: 90 });
});

test('채널 이동 뒤 주소 안내 요청에 입력한 주소를 보낸다', async () => {
  const booking = { ...item, action_required: 'booking_action', action_meta: {
    set_address: true, default_duration_min: 60
  } };
  await boot([booking]);
  document.querySelector('.dcq-set-address').value = '서울 테스트로 12';
  document.querySelector('[data-filter="all"]').click();
  document.querySelector('.dcq-send').click();
  await flush();
  const post = requests.find(r => r.opts.method === 'POST');
  expect(post.url).toMatch(/\/send$/);
  expect(JSON.parse(post.opts.body)).toEqual({
    selected_index: 0, duration_min: 60, address: '서울 테스트로 12'
  });
});
