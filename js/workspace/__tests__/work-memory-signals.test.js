'use strict';

/* T8-A 골든 — 행동 관찰(Signal Observer) 계약. 구현보다 먼저 작성 (2026-08-19).

   T8 에서 가장 위험한 건 학습 알고리즘이 아니라 **관찰 데이터가 처음부터 잘못 들어가는 것**이다.
   그래서 T8-A 는 "원장이 실제로 한 행동만, 정확히 한 번씩 기록한다"만 책임진다.
   preference/score/rerank 는 T8-B 이후 — 여기서 T3 scoreMemory 는 건드리지 않는다.

   고정 계약(보스 확정):
   · tenant identity = `last_user_id`(= JWT payload.sub, 서버 발급). `ShopStyle.getActiveId()` 는
     로컬 생성이라 격리 최상위로 쓰지 않는다(context/style 용도만).
   · system mutation(자동적용·복원·undo·마이그레이션)은 **절대 signal 이 아니다**.
     전역 boolean 이 아니라 **스코프 카운터 + try/finally** 로 구현해 중첩·예외에도 stuck 되지 않아야 한다.
   · 같은 세션의 수정 N 번 = observation **1개**(batch). N 개 독립 샘플로 세지 않는다.
   · learning store 에 원본 이미지 바이트·개인정보를 복제하지 않는다(assetRef 만).
   · layer_reordered 는 reorder UI 자체가 없으므로 **미지원**(계약으로 명시). */

const fs = require('fs');
const path = require('path');

function load(userId) {
  global.window = {};
  global.location = { search: '' };
  const store = {};
  global.localStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
  };
  if (userId !== undefined) global.localStorage.setItem('last_user_id', String(userId));
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(__dirname, '..', 'work-memory-signals.js'), 'utf8'));
  return global.window.WMSignals;
}
const CTX = { service: '젤네일', photoCount: 1, kind: 'service' };

describe('[T8-A 1~4] owner 조작 → 정확히 1 signal', () => {
  test('font 변경 1회 → font signal 정확히 1개', () => {
    const S = load(5);
    S.begin({ memoryId: 'm1', context: CTX });
    S.note('font_changed', { layerKey: 'title', before: 'Pretendard', after: 'gamja' });
    const obs = S.end();
    const fonts = obs.signals.filter((s) => s.event === 'font_changed');
    expect(fonts).toHaveLength(1);
    expect(fonts[0]).toMatchObject({ layerKey: 'title', before: 'Pretendard', after: 'gamja' });
  });
  test('color 변경 → 1개', () => {
    const S = load(5);
    S.begin({ memoryId: 'm1', context: CTX });
    S.note('color_changed', { layerKey: 'title', before: '#ffffff', after: '#e53935' });
    expect(S.end().signals.filter((s) => s.event === 'color_changed')).toHaveLength(1);
  });
  test('align 변경 → 1개', () => {
    const S = load(5);
    S.begin({ memoryId: 'm1', context: CTX });
    S.note('alignment_changed', { layerKey: 'title', before: 'center', after: 'left' });
    expect(S.end().signals.filter((s) => s.event === 'alignment_changed')).toHaveLength(1);
  });
  test('text 변경 → 1개 (내용은 T5 소관이라 원문 저장 안 함)', () => {
    const S = load(5);
    S.begin({ memoryId: 'm1', context: CTX });
    S.note('text_changed', { layerKey: 'title', before: '지난 글', after: '이번 글' });
    const t = S.end().signals.filter((s) => s.event === 'text_changed');
    expect(t).toHaveLength(1);
    // 개인정보/문구 원문은 learning store 에 복제하지 않는다 — 변경 사실만
    expect(JSON.stringify(t[0])).not.toContain('지난 글');
    expect(JSON.stringify(t[0])).not.toContain('이번 글');
  });
});

describe('[T8-A 5~7] system mutation → signal 0', () => {
  test('system() 스코프 안의 변경은 기록되지 않는다 (자동적용·복원)', () => {
    const S = load(5);
    S.begin({ memoryId: 'm1', context: CTX });
    S.system(() => {
      S.note('font_changed', { layerKey: 'title', before: 'a', after: 'b' });
      S.note('color_changed', { layerKey: 'title', before: '#1', after: '#2' });
    });
    expect(S.end().signals).toHaveLength(0);
  });
  test('memory auto-apply(대량 복원) → signal 0', () => {
    const S = load(5);
    S.begin({ memoryId: 'm1', context: CTX });
    S.system(() => { for (let i = 0; i < 20; i++) S.note('layer_added', { layerKey: 'L' + i }); });
    expect(S.end().signals).toHaveLength(0);
  });
  test('T4 undo(wmRemove) → signal 0', () => {
    const S = load(5);
    S.begin({ memoryId: 'm1', context: CTX });
    S.system(() => { S.note('layer_removed', { layerKey: 'title', src: 'wm' }); });
    expect(S.end().signals).toHaveLength(0);
  });
  test('중첩 스코프 — 안쪽이 끝나도 바깥이 살아 있으면 계속 system', () => {
    const S = load(5);
    S.begin({ memoryId: 'm1', context: CTX });
    S.system(() => {
      S.system(() => { S.note('font_changed', { layerKey: 'a' }); });
      S.note('color_changed', { layerKey: 'b' });   // 아직 바깥 스코프 안 — 무시돼야
    });
    S.note('alignment_changed', { layerKey: 'c' });   // 스코프 밖 — 기록돼야
    expect(S.end().signals).toHaveLength(1);
  });
  test('🔴 예외가 나도 스코프가 stuck 되지 않는다 (try/finally)', () => {
    const S = load(5);
    S.begin({ memoryId: 'm1', context: CTX });
    expect(() => S.system(() => { throw new Error('boom'); })).toThrow('boom');
    expect(S.isSystem()).toBe(false);                 // 해제됨
    S.note('font_changed', { layerKey: 'title' });     // 이후 owner 조작은 정상 기록
    expect(S.end().signals).toHaveLength(1);
  });
});

describe('[T8-A 8] 같은 세션 다중 수정 → observation 1개 (batch)', () => {
  test('5회 수정해도 observation 1개, signals 5개', () => {
    const S = load(5);
    S.begin({ memoryId: 'm1', context: CTX });
    for (let i = 0; i < 5; i++) S.note('font_changed', { layerKey: 'title', before: 'a', after: 'b' });
    const obs = S.end();
    expect(obs.signals).toHaveLength(5);
    expect(Array.isArray(obs)).toBe(false);            // 배열(=N개 샘플) 아님
    expect(obs.observationId).toBeTruthy();
    expect(obs.batch).toBe(true);
  });
  test('begin 없이 note → 무시(세션 밖 유실 방지)', () => {
    const S = load(5);
    S.note('font_changed', { layerKey: 'x' });
    expect(S.end()).toBeNull();
  });
});

describe('[T8-A 9] publish outcome 연결', () => {
  test('publish 성공 → outcome published', () => {
    const S = load(5);
    S.begin({ memoryId: 'm1', context: CTX });
    S.note('font_changed', { layerKey: 'title' });
    S.outcome('published');
    expect(S.end().outcome).toBe('published');
  });
  test('취소 → published 로 기록되지 않는다', () => {
    const S = load(5);
    S.begin({ memoryId: 'm1', context: CTX });
    S.note('font_changed', { layerKey: 'title' });
    S.outcome('cancelled');
    const obs = S.end();
    expect(obs.outcome).toBe('cancelled');
    expect(obs.outcome).not.toBe('published');
  });
  test('outcome 미지정 → published 아님(기본은 중립)', () => {
    const S = load(5);
    S.begin({ memoryId: 'm1', context: CTX });
    S.note('font_changed', { layerKey: 'title' });
    expect(S.end().outcome).not.toBe('published');
  });
});

describe('[T8-A 10] tenant 격리 — 서버 발급 identity', () => {
  test('tenant = last_user_id(JWT sub). ShopStyle 로컬 id 를 최상위로 쓰지 않는다', () => {
    const S = load(5);
    expect(S.tenantId()).toBe('5');
    S.begin({ memoryId: 'm1', context: CTX });
    expect(S.end().tenantId).toBe('5');
  });
  test('계정 A 와 B 의 observation 이 서로 다른 tenantId 를 가진다', () => {
    const A = load(5); A.begin({ memoryId: 'm', context: CTX }); A.note('font_changed', { layerKey: 't' });
    const obsA = A.end();
    const B = load(9); B.begin({ memoryId: 'm', context: CTX }); B.note('font_changed', { layerKey: 't' });
    const obsB = B.end();
    expect(obsA.tenantId).toBe('5');
    expect(obsB.tenantId).toBe('9');
    expect(obsA.tenantId).not.toBe(obsB.tenantId);
  });
  test('로그인 전(tenant 없음) → 관찰하지 않는다(귀속 불가 데이터 금지)', () => {
    const S = load(undefined);
    expect(S.tenantId()).toBeNull();
    S.begin({ memoryId: 'm1', context: CTX });
    S.note('font_changed', { layerKey: 'title' });
    expect(S.end()).toBeNull();
  });
});

describe('[T8-A 11] 개인정보/이미지 바이트 미복제', () => {
  test('dataURL 을 넘겨도 signal 에 바이트가 안 남고 assetRef 만 남는다', () => {
    const S = load(5);
    const big = 'data:image/png;base64,' + 'Q'.repeat(5000);
    S.begin({ memoryId: 'm1', context: CTX });
    S.note('sticker_changed', { layerKey: 's1', after: big, assetRef: 'img:abc123' });
    const obs = S.end();
    const json = JSON.stringify(obs);
    expect(json).not.toContain('QQQQ');
    expect(json.length).toBeLessThan(2000);
    expect(obs.signals[0].assetRef).toBe('img:abc123');
  });
  test('고객 개인정보처럼 보이는 값도 저장하지 않는다', () => {
    const S = load(5);
    S.begin({ memoryId: 'm1', context: CTX });
    S.note('text_changed', { layerKey: 't', before: '김민지님 010-1234-5678', after: '예약문의' });
    const json = JSON.stringify(S.end());
    expect(json).not.toContain('010-1234');
    expect(json).not.toContain('김민지');
  });
});

describe('[T8-A] layer_reordered — 미지원 계약', () => {
  test('reorder UI 가 없으므로 관찰하지 않는다(무시)', () => {
    const S = load(5);
    S.begin({ memoryId: 'm1', context: CTX });
    S.note('layer_reordered', { layerKey: 'a', from: 0, to: 2 });
    expect(S.end().signals).toHaveLength(0);
    expect(S.SUPPORTED.indexOf('layer_reordered')).toBe(-1);
  });
});

describe('[T8-A] observation 스키마 — T8-B 가 학습에 쓸 최소 필드', () => {
  test('before/after · memoryId · context · outcome · session/operation identity 보유', () => {
    const S = load(5);
    S.begin({ memoryId: 'mem-7', context: CTX, baseline: [{ type: 'text', role: 'title', font: 'Pretendard' }] });
    S.note('font_changed', { layerKey: 'title', before: 'Pretendard', after: 'gamja' });
    S.outcome('published');
    const o = S.end();
    expect(o).toMatchObject({ memoryId: 'mem-7', outcome: 'published', tenantId: '5', batch: true });
    expect(o.context).toMatchObject(CTX);
    expect(o.observationId).toBeTruthy();
    expect(o.startedAt).toBeTruthy();
    expect(o.endedAt).toBeTruthy();
    expect(Array.isArray(o.baseline)).toBe(true);
    expect(o.signals[0]).toMatchObject({ event: 'font_changed', before: 'Pretendard', after: 'gamja' });
    expect(o.signals[0].at).toBeTruthy();
  });
});

describe('[T8-A 12·13] 기존 계약 불변 — T1~T7 미개입', () => {
  const edSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'itd-editor', 'itd-editor.js'), 'utf8');
  const engSrc = fs.readFileSync(path.join(__dirname, '..', 'work-memory-engine.js'), 'utf8');
  test('T4: _serLayer 화이트리스트에 관찰용 필드가 새지 않는다', () => {
    const ser = edSrc.slice(edSrc.indexOf('function _serLayer'), edSrc.indexOf('function _collectPerPhoto'));
    expect(ser).not.toMatch(/WMSignals|observation|signal/i);
  });
  test('T4: _pushOp 에 속성변경 op 를 추가하지 않았다(undo 계약 보존)', () => {
    ['font', 'color', 'align', 'text_changed'].forEach((k) => {
      expect(edSrc).not.toMatch(new RegExp("_pushOp\\(\\{\\s*op:\\s*'" + k));
    });
  });
  test('T3: scoreMemory 는 T8-A 에서 건드리지 않는다(personalization 축 아직 없음)', () => {
    expect(engSrc).not.toMatch(/personalization/);
  });
});
