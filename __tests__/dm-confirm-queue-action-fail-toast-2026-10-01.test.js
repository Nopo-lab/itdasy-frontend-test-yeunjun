/**
 * @jest-environment jsdom
 *
 * flow-inbox-dm-comments-01 / 04 (P1 / P2) — DM 확인 큐 [전송] 결과 토스트는 **서버가 말한 결과**만 믿는다.
 *
 * 실측(evidence/flow-inbox-dm-comments/api_repro.out): 지난 시간 예약 카드 [전송] → BE 200 {ok:true, action:{ok:false}}
 *   → FE _doAction 은 r.ok===false 만 보고 r.action.ok 를 안 봤고, '예약 생성됨' 은 카드의 data-booking-date 만으로
 *   추정해서 예약이 없는데도 '전송했어요 ✓ · 캘린더에서 보기' 토스트 + 캐시 무효화 + data-changed 이벤트가 나갔다.
 *
 * 고정하는 계약:
 *   · {ok:false, message}            → 실패 토스트(message), 카드 유지, 버튼 복구, 이벤트 X
 *   · {ok:true, action:{ok:false}}   → (옛 서버 호환) 위와 동일하게 실패로 처리
 *   · {ok:true, booking_id}          → '전송했어요 ✓ · 캘린더에서 보기' (캘린더 CTA)
 *   · {ok:true} + booking_id 없음     → 그냥 '전송했어요 ✓' (카드 날짜만으로 예약 생성을 추정하지 않는다)
 *   · 502 (발송 실패, 예약은 생성됨) → '실패: 예약 #N은 만들어졌지만…' 그대로 원장에게, 카드 유지
 *   · 목록 항목에 action_result_id 가 있으면 카드에 '예약 #N 은 이미 만들어졌어요' 안내
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'app-dm-confirm-queue.js'), 'utf8');

const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(r => setTimeout(r, 0)); };

const FUTURE = '2026-10-05T05:00:00+00:00';
function item(extra) {
  return Object.assign({
    id: 7, sender_igsid: 'cust-7', sender_tail: 'st-7', received_text: '모레 2시 젤네일 예약이요',
    received_messages: ['모레 2시 젤네일 예약이요'], ai_draft_text: '네 예약 도와드릴게요',
    ai_draft_candidates: ['네 예약 도와드릴게요'], intent: 'booking', intent_confidence: 0.9,
    received_at: new Date().toISOString(), minutes_waiting: 3,
    action_required: 'booking_action',
    action_meta: { starts_at_iso: FUTURE, service_name: '젤네일', default_duration_min: 60 },
    customer_grade: '신규', extracted: null, profile_pic: '', display_name: '홍길동',
    sender_username: '', customer_summary: '', form_auto_sent: false, channel: 'instagram',
  }, extra || {});
}

async function openWith(listItem, postResponse) {
  document.body.innerHTML = '';
  window.API = 'http://127.0.0.1:8000';
  window.authHeader = () => ({ Authorization: 'Bearer t' });
  window._esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  window.showToast = jest.fn();
  window.Booking = { _invalidateCache: jest.fn() };
  window.openIntegrationsHub = jest.fn();
  const posts = [];
  window.apiFetch = jest.fn(async (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    if (method === 'GET') {
      return { ok: true, status: 200, headers: { get: (k) => (String(k).toLowerCase() === 'x-token-state' ? 'ok' : null) }, json: async () => [listItem] };
    }
    posts.push({ url: String(url), body: opts && opts.body ? JSON.parse(opts.body) : null });
    const res = typeof postResponse === 'function' ? postResponse(posts.length) : postResponse;
    return { ok: res.status ? res.status < 400 : true, status: res.status || 200, headers: { get: () => null }, json: async () => res.body };
  });
  const events = [];
  window.addEventListener('itdasy:data-changed', (e) => events.push(e.detail));
  // eslint-disable-next-line no-eval
  window.eval(SRC);
  await window.openDMConfirmQueue();
  await flush();
  return { list: document.getElementById('dcqList'), posts, events };
}

function sendBtn(list) {
  return list.querySelector('.dcq-send[data-act="send"]');
}
function toasts() {
  return window.showToast.mock.calls.map(c => String(c[0]));
}
afterEach(() => { try { window.closeDMConfirmQueue(); } catch (_e) { void _e; } });

test('🔴 {ok:true, action:{ok:false}} (옛 계약) → 성공 토스트·캘린더 CTA·이벤트가 나가지 않는다', async () => {
  const { list, events } = await openWith(item(), { body: { ok: true, message: '✅ 발송 완료', action: { ok: false, label: '예약 확정 실패 (지난 시간)', fail_message: '10월 1일 08:01는 이미 지난 시간이에요 🥹' } } });
  const btn = sendBtn(list);
  expect(btn).toBeTruthy();
  btn.click();
  await flush();
  const t = toasts();
  expect(t.some(s => /전송했어요|캘린더에서 보기/.test(s))).toBe(false);
  expect(t.some(s => /지난 시간/.test(s))).toBe(true);
  expect(events).toEqual([]);
  expect(window.Booking._invalidateCache).not.toHaveBeenCalled();
  expect(list.querySelector('.dcq-item[data-id="7"]')).toBeTruthy();
  expect(btn.disabled).toBe(false);
});

test('{ok:false, message} (새 계약) → 실패 토스트 + 카드 유지 + 버튼 복구', async () => {
  const { list, events } = await openWith(item(), { body: { ok: false, code: 'action_failed', message: '10월 1일 08:01는 이미 지난 시간이에요 🥹', action: { ok: false } } });
  const btn = sendBtn(list);
  btn.click();
  await flush();
  expect(toasts()).toEqual(['10월 1일 08:01는 이미 지난 시간이에요 🥹']);
  expect(events).toEqual([]);
  expect(list.querySelector('.dcq-item[data-id="7"]')).toBeTruthy();
  expect(btn.disabled).toBe(false);
});

test('{ok:true, booking_id} → "전송했어요 ✓ · 캘린더에서 보기" + data-changed(booking_id)', async () => {
  const { list, events } = await openWith(item(), { body: { ok: true, message: '✅ 발송 완료 + 예약 #12 생성', booking_id: 12, action: { ok: true, result_id: 12 } } });
  sendBtn(list).click();
  await flush();
  expect(toasts().some(s => /전송했어요 ✓ · 캘린더에서 보기/.test(s))).toBe(true);
  expect(window.Booking._invalidateCache).toHaveBeenCalled();
  expect(events.length).toBe(1);
  expect(events[0].booking_id).toBe(12);
});

test('🔴 {ok:true} 인데 booking_id 가 없으면 카드 날짜만으로 "캘린더에서 보기" 를 띄우지 않는다', async () => {
  const { list } = await openWith(item(), { body: { ok: true, message: '✅ 발송 완료', action: null } });
  sendBtn(list).click();
  await flush();
  const t = toasts();
  expect(t.some(s => /캘린더에서 보기/.test(s))).toBe(false);
  expect(t.some(s => /^전송했어요 ✓$/.test(s))).toBe(true);
});

test('502(예약은 생성됨, 발송 실패) → 서버 문구가 그대로 원장에게, 카드 유지', async () => {
  const { list, events } = await openWith(item(), { status: 502, body: { detail: '예약 #12은 만들어졌지만 손님에게 확정 DM 을 못 보냈어요. [전송]을 다시 누르면 같은 예약으로 발송만 다시 시도해요.' } });
  const btn = sendBtn(list);
  btn.click();
  await flush();
  expect(toasts().some(s => /예약 #12은 만들어졌지만/.test(s))).toBe(true);
  expect(toasts().some(s => /전송했어요/.test(s))).toBe(false);
  expect(events).toEqual([]);
  expect(list.querySelector('.dcq-item[data-id="7"]')).toBeTruthy();
  expect(btn.disabled).toBe(false);
});

test('🔴 목록 항목에 action_result_id 가 있으면 카드에 "예약 #N 은 이미 만들어졌어요" 안내가 보인다', async () => {
  const { list } = await openWith(item({ action_result_id: 12 }), { body: { ok: true } });
  expect(list.textContent).toMatch(/예약 #12.*이미 만들어졌어요/);
  expect(list.textContent).toMatch(/확정 메시지만/);
});

test('action_result_id 가 없으면 그 안내는 없다', async () => {
  const { list } = await openWith(item(), { body: { ok: true } });
  expect(list.textContent).not.toMatch(/이미 만들어졌어요/);
});
