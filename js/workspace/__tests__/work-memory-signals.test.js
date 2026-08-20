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
  /* ⚠️ migration note (2026-08-20, T8-E): 원래 단언은
       "scoreMemory 에 personalization 축이 아직 없다" 였다. T8-A 의 범위가
     "T3 미개입" 이었기 때문이고, 그때는 옳았다.
     T8-E 에서 bounded 가산 축으로 **의도적으로** 연결했으므로 그 단언은 수명을 다했다.
     의미를 지우지 않고 **이 단계가 실제로 지키려던 것**으로 바꾼다:
       T8-A 가 기존 6축의 가중치·범위를 바꾸지 않았는가.
     E 의 계약(상한 15·역전 금지·설명가능)은 work-memory-persona.test.js 가 잠근다. */
  test('T3: 기존 6축 가중치·범위는 그대로다', () => {
    expect(engSrc).toMatch(/photoFit:.*\? 40 : 0/);
    expect(engSrc).toMatch(/baFit:.*\? 25 : 0/);
    expect(engSrc).toMatch(/parts\.kindFit = 15/);
    expect(engSrc).toMatch(/parts\.kindFit = -30/);
    expect(engSrc).toMatch(/Math\.min\(20, 20 - days \* 2\)/);
  });
});

describe('[T8-H+ 12·13] continuous 신호 — 조작이 끝날 때 딱 한 번', () => {
  /* 드래그는 pointermove 가 수십~수백 번 뜬다. 매번 신호를 남기면 IDB·배터리가 죽는다.
     그래서 관측은 **종료 지점 한 곳**(cleanupLayerPointer)에서만 한다.
     _pushOp(undo 스택)은 건드리지 않는다 — 되돌리기 계약은 T4 소유다. */
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'itd-editor', 'itd-editor.js'), 'utf8');
  test('종료 지점(cleanupLayerPointer)에서만 continuous 신호를 낸다', () => {
    const i = src.indexOf('function cleanupLayerPointer');
    expect(i).toBeGreaterThan(-1);
    const blk = src.slice(i, i + 2200);
    expect(blk).toMatch(/position_changed/);
    expect(blk).toMatch(/size_changed/);
    expect(blk).toMatch(/shape_geometry_changed/);
  });
  test('🔴 pointermove 안에서는 신호를 내지 않는다', () => {
    const mv = src.slice(src.indexOf("document.addEventListener('pointermove'"), src.indexOf('function cleanupLayerPointer'));
    expect(mv).not.toMatch(/position_changed|size_changed|shape_geometry_changed/);
  });
  test('_pushOp 계약은 안 건드린다 — 새 op 종류를 추가하지 않았다', () => {
    const ops = [...src.matchAll(/_pushOp\(\{\s*op:\s*'([a-zA-Z]+)'/g)].map((m) => m[1]);
    const allowed = ['add', 'del', 'move', 'resize', 'wrap', 'photo', 'cellcrop', 'wmApply', 'wmRemove'];
    ops.forEach((o) => expect(allowed).toContain(o));
  });
  test('세 신호가 SUPPORTED 에 들어 있다 — 없으면 note() 가 조용히 버린다', () => {
    const S = load(5);
    ['position_changed', 'size_changed', 'shape_geometry_changed'].forEach((e) => {
      expect(S.SUPPORTED).toContain(e);
    });
  });
  test('continuous 신호도 owner scope 에서만 기록된다', () => {
    const S = load(5);
    S.begin({ memoryId: 'm', context: { service: 'a', photoCount: 1, kind: 'service' }, baseline: [] });
    S.system(function () { S.note('position_changed', { layerKey: 'title', before: 0.5, after: 0.7 }); });
    expect(S._pending().signals.length).toBe(0);
    S.note('position_changed', { layerKey: 'title', before: 0.5, after: 0.7 });
    expect(S._pending().signals.length).toBe(1);
  });
  test('좌표·크기 값은 숫자로만 남는다(원문·큰 값 유입 금지)', () => {
    const S = load(5);
    S.begin({ memoryId: 'm', context: { service: 'a', photoCount: 1, kind: 'service' }, baseline: [] });
    S.note('size_changed', { layerKey: 'title', before: 0.08, after: 0.12 });
    const sig = S._pending().signals[0];
    expect(typeof sig.after).toBe('number');
    expect(sig.after).toBe(0.12);
  });
});

describe('[T8-H+ V2] 🔴 continuous 값이 통째로 버려지던 문제 (실계정 실험 V1 에서 발견)', () => {
  /* position/geometry 는 값이 {x,y} 객체인데 _safeVal 이 객체를 전부 null 로 버렸다.
     신호는 남는데 **값이 없어서** 학습이 0 이었다 — 조용한 실패라 골든도 못 봤다.
     좌표 몇 개짜리 얕은 숫자 객체만 허용한다. 중첩·문자열·긴 값은 여전히 차단. */
  test('숫자만 든 얕은 좌표 객체는 통과한다', () => {
    const S = load(5);
    S.begin({ memoryId: 'm', context: { service: 'a', photoCount: 1, kind: 'service' }, baseline: [] });
    S.note('position_changed', { layerKey: 'title', before: { x: 0.5, y: 0.5 }, after: { x: 0.62, y: 0.18 } });
    const sig = S._pending().signals[0];
    expect(sig.after).toEqual({ x: 0.62, y: 0.18 });
    expect(sig.before).toEqual({ x: 0.5, y: 0.5 });
  });
  test('shape geometry {w,h} 도 통과', () => {
    const S = load(5);
    S.begin({ memoryId: 'm', context: { service: 'a', photoCount: 1, kind: 'service' }, baseline: [] });
    S.note('shape_geometry_changed', { layerKey: 'rect', before: { w: 0.3, h: 0.1 }, after: { w: 0.5, h: 0.2 } });
    expect(S._pending().signals[0].after).toEqual({ w: 0.5, h: 0.2 });
  });
  test('🔴 허용 키 밖의 필드는 잘라낸다 — 임의 객체 유입 금지', () => {
    const S = load(5);
    S.begin({ memoryId: 'm', context: { service: 'a', photoCount: 1, kind: 'service' }, baseline: [] });
    S.note('position_changed', { layerKey: 'title', after: { x: 0.5, y: 0.5, caption: '고객 김민지', token: 'abc' } });
    const a = S._pending().signals[0].after;
    expect(a).toEqual({ x: 0.5, y: 0.5 });
    expect(a.caption).toBeUndefined();
    expect(a.token).toBeUndefined();
  });
  test('숫자가 아닌 좌표·중첩 객체·배열은 버린다', () => {
    const S = load(5);
    S.begin({ memoryId: 'm', context: { service: 'a', photoCount: 1, kind: 'service' }, baseline: [] });
    S.note('position_changed', { layerKey: 't', after: { x: 'abc', y: { deep: 1 } } });
    S.note('position_changed', { layerKey: 't', after: [1, 2, 3] });
    S.note('position_changed', { layerKey: 't', after: { x: Infinity } });
    S._pending().signals.forEach((s) => expect(s.after).toBeUndefined());
  });
  test('문자열 값의 기존 방어는 그대로 — data URI·긴 값 차단', () => {
    const S = load(5);
    S.begin({ memoryId: 'm', context: { service: 'a', photoCount: 1, kind: 'service' }, baseline: [] });
    S.note('font_changed', { layerKey: 't', after: 'data:image/png;base64,AAAA' });
    S.note('font_changed', { layerKey: 't', after: 'x'.repeat(200) });
    S._pending().signals.forEach((s) => expect(s.after).toBeUndefined());
  });
});

describe('[T8-H+ V2] 🔴 좌표 단위 — 픽셀이 아니라 저장 스키마와 같은 정규화 값', () => {
  /* 편집기 런타임의 L.x 는 **스테이지 픽셀**이고, _serLayer 가 저장하는 x 는 **0~1 정규화**다.
     observer 가 픽셀을 보내면 personalize 가 "선호 x=137" 을 0~1 좌표에 적용하게 된다 —
     화면 밖으로 날아간다. 관측도 적용도 _serLayer 와 같은 기준을 써야 한다. */
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'itd-editor', 'itd-editor.js'), 'utf8');
  test('continuous 신호는 _serLayer 스냅샷에서 값을 뽑는다(픽셀 직접 사용 금지)', () => {
    const i = src.indexOf('function cleanupLayerPointer');
    const blk = src.slice(i, i + 2600);
    expect(blk).toMatch(/_serLayer|_serSnap/);
    /* _sig(...) 로 나가는 좌표만 검사한다. _pushOp 의 after:{x:drag.L.x} 는 **픽셀이 맞다** —
       T4 되돌리기는 런타임 좌표를 그대로 복원해야 하므로 건드리면 안 된다. */
    const sigCalls = blk.match(/_sig\('(position_changed|size_changed|shape_geometry_changed)'[\s\S]{0,240}?\}\);/g) || [];
    expect(sigCalls.length).toBeGreaterThan(0);
    sigCalls.forEach((c) => {
      expect(c).toMatch(/_serSnap|_sa\.|_pa\.|_ra\.|_wa\./);   // 정규화 스냅샷에서만 값을 뽑는다
      expect(c).not.toMatch(/drag\.L\.x|drag\.ox|rsd\.L\.w|wd\.L\.wrapW|_pl\.scale/);
    });
  });
  test('드래그 시작 시 정규화 스냅샷을 남긴다', () => {
    expect(src).toMatch(/drag = \{[^}]*_serSnap|_serSnap[\s\S]{0,200}drag = \{/);
  });
});
