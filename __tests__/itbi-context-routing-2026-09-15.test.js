/**
 * @jest-environment jsdom
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CORE = path.join(ROOT, 'js', 'assistant', 'core');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function resetItbiModules() {
  [
    'ItdasyCustomerContext',
    'ItdasyBookingContext',
    'ItdasyCustomerAddGuard',
    'ItdasyCustomerPhoneIntent',
    'ItdasyWorkspaceNL',
  ].forEach((k) => { delete window[k]; });
}

function loadCore(...files) {
  resetItbiModules();
  files.forEach((file) => window.eval(fs.readFileSync(path.join(CORE, file), 'utf8')));
}

function booking(id, name, hour) {
  const starts = new Date(2026, 8, 16, hour, 0, 0);
  const ends = new Date(2026, 8, 16, hour + 1, 0, 0);
  return {
    id,
    customer_id: id + 100,
    customer_name: name,
    service_name: '컷트',
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    status: 'confirmed',
  };
}

describe('잇비 예약 후속말 문맥', () => {
  beforeEach(() => {
    loadCore('customer-context.js', 'booking-context.js');
    window.fmtKDateTime = null;
  });

  test('"아니 5시로"가 직전 변경 카드의 같은 예약을 유지한다', async () => {
    const b = booking(1, '김민지', 11);
    window.ItdasyBookingContext.rememberList({ type: 'bookings_lookup', data: { items: [b] } });

    const first = await window.ItdasyBookingContext.tryRun('그거 오후 4시로 바꿔줘');
    expect(first.kind).toBe('card');
    expect(first.action.payload.booking_id).toBe(1);
    expect(first.action.confirmation_text).toMatch(/오후 4/);

    window.ItdasyBookingContext.rememberList({
      type: 'bookings_lookup',
      data: { items: [booking(2, '황민지', 13), b] },
    });
    const second = await window.ItdasyBookingContext.tryRun('아니 5시로');
    expect(second.kind).toBe('card');
    expect(second.action.payload.booking_id).toBe(1);
    expect(second.action.confirmation_text).toMatch(/오후 5/);
  });

  test('"그럼 취소해"와 "복구해"가 예약 취소/복구로 이어진다', async () => {
    const b = booking(3, '황민지', 14);
    window.ItdasyBookingContext.rememberList({ type: 'bookings_lookup', data: { items: [b] } });
    await window.ItdasyBookingContext.tryRun('그거 4시로 바꿔줘');

    const cancel = await window.ItdasyBookingContext.tryRun('그럼 취소해');
    expect(cancel.kind).toBe('card');
    expect(cancel.action.kind).toBe('cancel_booking');
    expect(cancel.action.payload.booking_id).toBe(3);

    window.ItdasyBookingContext.rememberAction(cancel.action, { booking: b });
    const restore = await window.ItdasyBookingContext.tryRun('복구해');
    expect(restore.kind).toBe('card');
    expect(restore.action.kind).toBe('restore_booking');
    expect(restore.action.payload.booking_id).toBe(3);
  });

  test('예약 조회 고객은 예약이 없어도 "그 고객" 문맥으로 남는다', () => {
    window.ItdasyBookingContext.rememberList({
      type: 'bookings_lookup',
      data: { customer: { id: 44, name: '황민지' }, items: [] },
    });
    expect(window.ItdasyCustomerContext.lastCustomer()).toEqual({ id: 44, name: '황민지', phone: '' });
  });
});

describe('잇비 고객 이름/연락처 후속말 문맥', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    loadCore('customer-context.js', 'customer-add-guard.js', 'customer-phone-intent.js');
    window.apiFetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ items: [{ id: 11, name: '문하영', phone: '010-0000-0000' }] }),
    }));
    window._openCustomerEditSheet = jest.fn();
    window.openCustomerDashboard = jest.fn();
    window.Customer = { update: jest.fn(async () => ({})), create: jest.fn(async () => ({})), _cache: [] };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('유사 이름 제안 뒤 새 고객 선택과 전화번호만 저장을 같은 이름으로 이어간다', async () => {
    const suggest = await window.ItdasyCustomerAddGuard.tryRun('윤하영 고객 기록 보여줘');
    expect(suggest.text).toMatch(/윤하영 고객은 아직 없어요/);
    expect(suggest.text).toMatch(/문하영/);

    const add = await window.ItdasyCustomerAddGuard.tryRun('아니 새 고객으로 추가');
    expect(add.text).toMatch(/윤하영님 정보를 입력하는 창/);
    jest.runOnlyPendingTimers();
    expect(window._openCustomerEditSheet).toHaveBeenLastCalledWith({ name: '윤하영', phone: '' });

    const phone = await window.ItdasyCustomerPhoneIntent.tryRun('전화번호 010-1234-5678로 저장');
    expect(phone.text).toMatch(/윤하영님\(010-1234-5678\)/);
    expect(phone.text).not.toMatch(/저장님/);
    jest.runOnlyPendingTimers();
    expect(window._openCustomerEditSheet).toHaveBeenLastCalledWith({ name: '윤하영', phone: '010-1234-5678' });
  });

  test('"그 고객 기록 열어줘"와 전화번호만 후속 입력이 직전 고객을 쓴다', async () => {
    window.ItdasyCustomerContext.remember({ id: 22, name: '황민지' }, 'test');

    const open = await window.ItdasyCustomerAddGuard.tryRun('그 고객 기록 열어줘');
    expect(open.text).toMatch(/황민지님 고객 기록/);
    jest.runOnlyPendingTimers();
    expect(window.openCustomerDashboard).toHaveBeenLastCalledWith(22);

    const ask = await window.ItdasyCustomerPhoneIntent.tryRun('전화번호 바꿔줘');
    expect(ask.text).toMatch(/황민지님 연락처/);

    const confirm = await window.ItdasyCustomerPhoneIntent.tryRun('010-9999-8888');
    expect(confirm.text).toMatch(/황민지님 연락처를 010-9999-8888로 바꿀까요/);
    expect(window.Customer.update).not.toHaveBeenCalled();

    const done = await window.ItdasyCustomerPhoneIntent.tryRun('응');
    expect(done.text).toMatch(/황민지님 연락처를 010-9999-8888로 바꿨어요/);
    expect(window.Customer.update).toHaveBeenLastCalledWith(22, { phone: '010-9999-8888' });
  });

  test('새 고객 입력 기억이 남아도 "바꿔줘"는 직전 고객 연락처 변경으로 간다', async () => {
    window.ItdasyCustomerContext.armNewCustomer('윤하영', '');
    window.ItdasyCustomerContext.remember({ id: 33, name: '황민지' }, 'test');

    const r = await window.ItdasyCustomerPhoneIntent.tryRun('010-2222-3333로 바꿔줘');
    expect(r.text).toMatch(/황민지님 연락처를 010-2222-3333로 바꿀까요/);
    expect(window._openCustomerEditSheet).not.toHaveBeenCalled();
  });
});

describe('작업실 전후 사진 후속말 문맥', () => {
  beforeEach(() => {
    resetItbiModules();
    window.showToast = jest.fn();
    window._cmds = [];
    window.WorkspaceFlow = {
      isOpen: () => true,
      command: (cmd) => { window._cmds.push(cmd); return { ok: true }; },
    };
    window.eval(read('js/assistant/workspace-nl-commands.js'));
  });

  test('"후 사진만 다시 편집"은 후 사진 편집 대상으로 간다', () => {
    const r = window.ItdasyWorkspaceNL.run('후 사진만 다시 편집');
    expect(r.handled).toBe(true);
    expect(window._cmds.at(-1)).toEqual({ type: 'storyedit', targetRole: 'after' });
  });

  test('"전 사진도 밝게"는 밝기 보정에 before 대상을 같이 싣는다', () => {
    const r = window.ItdasyWorkspaceNL.run('전 사진도 밝게');
    expect(r.handled).toBe(true);
    expect(window._cmds.at(-1)).toMatchObject({ type: 'adjust', targetRole: 'before', delta: { brightness: 25 } });
  });
});
