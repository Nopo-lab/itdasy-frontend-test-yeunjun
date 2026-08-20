'use strict';

/* T8-H+ 골든 — feature personalization 이 **실제 editState 를 바꾼다**. 구현보다 먼저 작성 (2026-08-20).

   실계정 14회 실발행에서 확인된 구조적 gap:
   T8-E 는 personalization 을 memory **랭킹**에만 썼다. 후보 기억이 사실상 1개면 랭킹을 아무리
   바꿔도 편집기에 들어가는 font/color/align/size/position/sticker 는 그대로다.
   실측: 속눈썹 12~14회 내내 autoFont=jua → **매번 수정 1**. 젤네일만 우연히 수정 0.

   그래서 이번엔 선택된 기억의 **feature 를 원장 취향에 맞게 보정**한다.

   ── 고정 계약
   1. 원본 memory 는 절대 안 바뀐다. 개인화 결과는 이번 세션의 derived state 다.
   2. 대상은 이번 기억에서 나온 layer 뿐 — base/user layer 는 손대지 않는다(T4 undo 계약).
   3. discrete(font/align/emoji/stroke/shadow/fill/shape)는 교체,
      continuous(x/y/size/w/h/radius/strokeW)는 **bounded delta** — 절대 덮어쓰지 않는다.
   4. feature 마다 **독립 confidence**. 낮으면 그 축은 안 건드린다.
   5. exact > service+kind > kind > global. 내려갈수록 약해진다. conflict 면 미적용.
   6. semantic guard — 기억의 구성(before/after 레이아웃 등)을 취향으로 깨지 않는다.
   7. 실패하면 원본 editState 그대로. 개인화는 optional enhancement 다.
   8. 동기·순수. IDB 접근 0, LLM 0. */

const fs = require('fs');
const path = require('path');

function load(userId) {
  global.window = {};
  global.window.ITDASY_WORK_MEMORY = true;
  global.location = { search: '' };
  const ls = {};
  global.localStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(ls, k) ? ls[k] : null; },
    setItem(k, v) { ls[k] = String(v); },
    removeItem(k) { delete ls[k]; },
  };
  global.localStorage.setItem('last_user_id', String(userId == null ? 5 : userId));
  for (const f of ['work-memory.js', 'work-memory-decay.js', 'work-memory-store.js',
    'work-memory-preferences.js', 'work-memory-persona.js', 'work-memory-personalize.js',
    'work-memory-engine.js']) {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
  }
  const w = global.window;
  return { E: w.WorkMemoryEngine, Pz: w.WMPersonalize, Pe: w.WMPersona, LS: global.localStorage };
}

const NAIL = { service: '젤네일', photoCount: 1, kind: 'service', hasBeforeAfter: false };
const LASH = { service: '속눈썹', photoCount: 1, kind: 'service', hasBeforeAfter: false };
const NAIL3 = { service: '젤네일', photoCount: 3, kind: 'service', hasBeforeAfter: false };
const BA = { service: '펌', photoCount: 2, kind: 'service', hasBeforeAfter: true };
const PROMO = { service: '젤네일', photoCount: 1, kind: 'promotion', hasBeforeAfter: false };

// preference 레코드 — contextKey 는 반드시 엔진이 만든다(손으로 조립하면 드리프트).
function pref(feature, value, ctx, over) {
  const E = global.window.WorkMemoryEngine;
  const c = E.canonicalContext(ctx);
  return Object.assign({
    id: 'p:' + feature + ':' + value, feature, value,
    contextKey: E.contextKey(c), context: c,
    positive: 24, negative: 0, sampleCount: 12, publishCount: 12,
    memoryIds: ['a', 'b', 'c'], contextKeys: [E.contextKey(c)], obsIds: [], evidence: [],
    consistency: 1, recency: 1, confidence: 0.8, saturation: 0.8,
    decayedPositive: 24, decayedNegative: 0, lastObservedAt: Date.now(), version: 2
  }, over || {});
}
const LOW = { positive: 2, negative: 0, sampleCount: 1, confidence: 0.07, decayedPositive: 2 };
const CONFLICT = { positive: 16, negative: 16, sampleCount: 16, consistency: 0.5, confidence: 0.01,
  decayedPositive: 16, decayedNegative: 16 };

function snap(Pe, prefs, tenant) { Pe._setSnapshotForTest(prefs || [], tenant == null ? '5' : String(tenant)); }

// 기억에서 나온 editState (아직 _src 태깅 전 — 실제 호출 시점과 같다)
function es(layers, over) {
  return Object.assign({ v: 1, layers: layers, layoutOrder: [], cellCrop: [] }, over || {});
}
const T = (o) => Object.assign({ type: 'text', text: '제목', x: 0.5, y: 0.2, size: 0.08,
  align: 'center', color: '#111111', font: 'pretendard', stroke: false, shadow: false }, o || {});
const STK = (o) => Object.assign({ type: 'sticker', emoji: '✨', x: 0.8, y: 0.8, size: 0.1 }, o || {});
const RECT = (o) => Object.assign({ type: 'rect', shape: 'rect', x: .5, y: .5, w: .3, h: .1,
  color: '#000', fill: true, strokeW: 0.01, radius: 8 }, o || {});

const MEM = { id: 'm1', photoCount: 1, kind: 'service', layoutIdx: 0 };
const run = (Pz, Pe, state, ctx, memory) =>
  Pz.resolveFeaturePatch(memory || MEM, state, ctx || NAIL, Pe.snapshot());

describe('[T8-H+ 1] 취향 없음 → editState 그대로', () => {
  test('snapshot 이 null 이면 아무것도 안 바뀐다', () => {
    const { Pz, Pe } = load();
    Pe._setSnapshotForTest(null, null);
    const state = es([T(), STK()]);
    const before = JSON.stringify(state);
    const r = run(Pz, Pe, state);
    expect(JSON.stringify(state)).toBe(before);       // 입력 mutate 금지
    expect(r.layers).toEqual(state.layers);
    expect(r.applied).toEqual([]);
  });
  test('취향이 비어 있어도 그대로', () => {
    const { Pz, Pe } = load();
    snap(Pe, []);
    const state = es([T()]);
    expect(run(Pz, Pe, state).layers).toEqual(state.layers);
  });
});

describe('[T8-H+ 2·3·4·5] discrete 적용 — font / color / align / sticker', () => {
  test('font 취향이 실제로 교체된다', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('font', 'jua', NAIL)]);
    const r = run(Pz, Pe, es([T({ font: 'pretendard' })]));
    expect(r.layers[0].font).toBe('jua');
    const a = r.applied.find((x) => x.feature === 'font');
    expect(a.before).toBe('pretendard');
    expect(a.after).toBe('jua');
    expect(a.source).toBe('exact');
    expect(a.confidence).toBeGreaterThan(0);
  });
  test('color 도 교체된다', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('color', '#E8D0C0', NAIL)]);
    expect(run(Pz, Pe, es([T({ color: '#111111' })])).layers[0].color).toBe('#E8D0C0');
  });
  test('align 도 교체된다', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('align', 'left', NAIL)]);
    expect(run(Pz, Pe, es([T({ align: 'center' })])).layers[0].align).toBe('left');
  });
  test('여러 축을 동시에 — 취향 있는 축만 바뀌고 나머지는 원본 유지', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('font', 'jua', NAIL), pref('align', 'left', NAIL)]);
    const r = run(Pz, Pe, es([T({ font: 'pretendard', align: 'center', color: '#111111' })]));
    expect(r.layers[0].font).toBe('jua');
    expect(r.layers[0].align).toBe('left');
    expect(r.layers[0].color).toBe('#111111');        // 취향 없음 → 원본 그대로
  });
  test('sticker 종류가 교체된다', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('emoji', '🌸', NAIL)]);
    expect(run(Pz, Pe, es([STK({ emoji: '✨' })])).layers[0].emoji).toBe('🌸');
  });
  test('🔴 sticker 를 반복해서 지우면(강한 negative) 스티커를 안 얹는다', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('emoji', '✨', NAIL, { positive: 0, negative: 30, sampleCount: 10,
      consistency: 0, confidence: 0, decayedPositive: 0, decayedNegative: 30 })]);
    const r = run(Pz, Pe, es([T(), STK({ emoji: '✨' })]));
    expect(r.layers.filter((l) => l.type === 'sticker').length).toBe(0);
    expect(r.applied.some((x) => x.feature === 'emoji' && x.after === null)).toBe(true);
    expect(r.layers.filter((l) => l.type === 'text').length).toBe(1);   // 텍스트는 그대로
  });
  test('stroke / shadow / fill / shape 도 discrete 로 적용된다', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('stroke', true, NAIL), pref('shadow', true, NAIL), pref('fill', false, NAIL)]);
    const r = run(Pz, Pe, es([T({ stroke: false, shadow: false }), RECT({ fill: true })]));
    expect(r.layers[0].stroke).toBe(true);
    expect(r.layers[0].shadow).toBe(true);
    expect(r.layers[1].fill).toBe(false);
  });
});

describe('[T8-H+ 6~10] continuous — bounded delta (절대 덮어쓰기 금지)', () => {
  test('🔴 size 는 선호값으로 점프하지 않고 상한만큼만 움직인다', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('size', 0.18, NAIL)]);
    const r = run(Pz, Pe, es([T({ size: 0.08 })]));
    const v = r.layers[0].size;
    expect(v).toBeGreaterThan(0.08);
    expect(v).toBeLessThan(0.18);                     // 선호값에 도달하지 않는다
    const a = r.applied.find((x) => x.feature === 'size');
    expect(a.preferred).toBe(0.18);
    expect(Math.abs(a.appliedDelta)).toBeLessThanOrEqual(Pz.MAX_DELTA.size + 1e-9);
    expect(Math.abs(a.appliedDelta)).toBeLessThan(Math.abs(a.delta));
  });
  test('x / y 도 bounded delta', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('x', 0.9, NAIL), pref('y', 0.1, NAIL)]);
    const r = run(Pz, Pe, es([T({ x: 0.5, y: 0.5 })]));
    expect(r.layers[0].x).toBeGreaterThan(0.5);
    expect(r.layers[0].x).toBeLessThan(0.9);
    expect(r.layers[0].y).toBeLessThan(0.5);
    expect(r.layers[0].y).toBeGreaterThan(0.1);
  });
  test('선호값이 이미 가까우면 그만큼만 — 넘어가지 않는다', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('x', 0.52, NAIL)]);
    const r = run(Pz, Pe, es([T({ x: 0.5 })]));
    expect(r.layers[0].x).toBeCloseTo(0.52, 5);       // 상한보다 작은 차이는 그대로 도달
  });
  test('sticker size 도 bounded', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('size', 0.30, NAIL)]);
    const r = run(Pz, Pe, es([STK({ size: 0.10 })]));
    expect(r.layers[0].size).toBeGreaterThan(0.10);
    expect(r.layers[0].size).toBeLessThan(0.30);
  });
  test('shape geometry(w/h/radius/strokeW) 도 bounded', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('w', 0.9, NAIL), pref('h', 0.5, NAIL)]);
    const r = run(Pz, Pe, es([RECT({ w: 0.3, h: 0.1 })]));
    expect(r.layers[0].w).toBeGreaterThan(0.3);
    expect(r.layers[0].w).toBeLessThan(0.9);
    expect(r.layers[0].h).toBeGreaterThan(0.1);
    expect(r.layers[0].h).toBeLessThan(0.5);
  });
  test('좌표는 0~1 을 벗어나지 않는다', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('x', 5, NAIL), pref('y', -3, NAIL)]);
    const r = run(Pz, Pe, es([T({ x: 0.98, y: 0.02 })]));
    expect(r.layers[0].x).toBeLessThanOrEqual(1);
    expect(r.layers[0].y).toBeGreaterThanOrEqual(0);
  });
  test('🔴 이상치 하나로 크기가 튀지 않는다 — robust aggregate', () => {
    const { Pz } = load();
    // 0.12 0.13 0.11 0.12 + 이상치 0.90
    expect(Pz.robust([0.12, 0.13, 0.11, 0.12, 0.90])).toBeLessThan(0.2);
    expect(Pz.robust([0.12, 0.13, 0.11, 0.12, 0.90])).toBeGreaterThan(0.10);
    expect(Pz.robust([0.5])).toBe(0.5);
    expect(Pz.robust([])).toBeNull();
  });
});

describe('[T8-H+ 11~15] confidence · context 계층 · conflict', () => {
  test('🔴 confidence 가 낮으면 그 축은 안 건드린다', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('font', 'jua', NAIL, LOW)]);
    const r = run(Pz, Pe, es([T({ font: 'pretendard' })]));
    expect(r.layers[0].font).toBe('pretendard');
    expect(r.skipped.some((x) => x.feature === 'font' && /confidence/.test(x.why))).toBe(true);
  });
  test('confidence 가 높으면 적용된다', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('font', 'jua', NAIL, { confidence: 0.9 })]);
    expect(run(Pz, Pe, es([T()])).layers[0].font).toBe('jua');
  });
  test('continuous 는 discrete 보다 더 높은 확신을 요구한다 — 배치를 흔드는 건 더 조심', () => {
    const { Pz } = load();
    expect(Pz.MIN_CONF.continuous).toBeGreaterThan(Pz.MIN_CONF.discrete);
  });
  test('exact 가 fallback 보다 강하다 — 같은 confidence 라도 이동폭이 크다', () => {
    const { Pz, Pe } = load();
    const move = (prefCtx, queryCtx) => {
      snap(Pe, [pref('x', 0.9, prefCtx, { confidence: 0.9 })]);
      return run(Pz, Pe, es([T({ x: 0.5 })]), queryCtx).layers[0].x - 0.5;
    };
    const exact = move(NAIL, NAIL);
    const kind = move({ service: '펌', photoCount: 7, kind: 'service' }, NAIL);
    expect(exact).toBeGreaterThan(kind);
    expect(kind).toBeGreaterThanOrEqual(0);
  });
  test('🔴 갈린 취향(conflict)이면 적용하지 않는다', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('font', 'jua', NAIL, CONFLICT), pref('font', 'gamja', NAIL, CONFLICT)]);
    const r = run(Pz, Pe, es([T({ font: 'pretendard' })]));
    expect(r.layers[0].font).toBe('pretendard');
    expect(r.skipped.some((x) => x.feature === 'font' && /conflict/.test(x.why))).toBe(true);
  });
});

describe('[T8-H+ 16·17·22] 안전 — 원본 불변 / 대상 제한', () => {
  test('🔴 원본 memory 와 입력 editState 는 안 바뀐다', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('font', 'jua', NAIL), pref('x', 0.9, NAIL)]);
    const mem = { id: 'm1', photoCount: 1, kind: 'service',
      layers: [{ type: 'text', font: 'pretendard', x: 0.5 }] };
    const memSnap = JSON.stringify(mem);
    const state = es([T({ font: 'pretendard', x: 0.5 })]);
    const stateSnap = JSON.stringify(state);
    const r = run(Pz, Pe, state, NAIL, mem);
    expect(JSON.stringify(mem)).toBe(memSnap);
    expect(JSON.stringify(state)).toBe(stateSnap);
    expect(r.layers[0].font).toBe('jua');             // 결과만 바뀐다
    expect(r.layers[0]).not.toBe(state.layers[0]);    // 새 객체
  });
  test('결과 레이어를 고쳐도 입력이 안 따라 바뀐다(얕은 공유 없음)', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('font', 'jua', NAIL)]);
    const state = es([T()]);
    const r = run(Pz, Pe, state);
    r.layers[0].color = '#ff0000';
    expect(state.layers[0].color).toBe('#111111');
  });
  test('🔴 base/user 레이어는 대상이 아니다 — 넘긴 layers 만 본다', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('font', 'jua', NAIL)]);
    const userLayer = T({ font: 'nanum', _src: 'user' });
    const r = run(Pz, Pe, es([T({ font: 'pretendard' })]));
    expect(r.layers.length).toBe(1);
    expect(userLayer.font).toBe('nanum');             // 아예 안 넘어갔으니 그대로
  });
  test('role 이 있는 우리샵 텍스트는 스타일만 바뀌고 문구는 안 바뀐다 (T5 경계)', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('font', 'jua', NAIL)]);
    const r = run(Pz, Pe, es([T({ role: 'title', text: '오늘의 시술', font: 'pretendard' })]));
    expect(r.layers[0].font).toBe('jua');
    expect(r.layers[0].text).toBe('오늘의 시술');
    expect(r.layers[0].role).toBe('title');
  });
});

describe('[T8-H+ 18] 텍스트 내용은 T8 소관이 아니다', () => {
  test('text 값은 어떤 경우에도 patch 하지 않는다', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('text', '다른문구', NAIL, { confidence: 0.99 })]);
    const r = run(Pz, Pe, es([T({ text: '원래문구' })]));
    expect(r.layers[0].text).toBe('원래문구');
    expect(Pz.FEATURES.text).toBeUndefined();
  });
  test('모듈 소스에 caption/고객 데이터가 안 들어간다', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'work-memory-personalize.js'), 'utf8');
    expect(src).not.toMatch(/fetch\s*\(|apiFetch|XMLHttpRequest|generateContent/i);
    expect(src).not.toMatch(/customerName|phone|caption/i);
  });
});

describe('[T8-H+ 21] semantic guard — 기억의 구성은 안 깬다', () => {
  test('🔴 before/after 기억을 1장 취향으로 무너뜨리지 않는다', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('font', 'jua', NAIL)]);   // 1장 취향
    const baMem = { id: 'ba', photoCount: 2, kind: 'service', layoutIdx: 7 };
    const state = es([T()], { layoutIdx: 7 });
    const r = run(Pz, Pe, state, BA, baMem);
    expect(r.layoutIdx === undefined || r.layoutIdx === 7).toBe(true);
    expect(r.layers.length).toBe(1);
  });
  test('레이어 개수·타입·순서는 patch 로 안 바뀐다(스티커 제거 제외)', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('font', 'jua', NAIL), pref('color', '#fff', NAIL)]);
    const state = es([T(), STK(), RECT()]);
    const r = run(Pz, Pe, state);
    expect(r.layers.map((l) => l.type)).toEqual(['text', 'sticker', 'rect']);
  });
  test('레이아웃·칸 배치 필드는 절대 안 건드린다', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('font', 'jua', NAIL)]);
    const state = es([T()], { layoutIdx: 7, layoutOrder: [1, 0], collageGap: 3, fitMode: 'cover' });
    const r = run(Pz, Pe, state);
    ['layoutIdx', 'layoutOrder', 'collageGap', 'fitMode'].forEach((k) => {
      expect(JSON.stringify(r[k] !== undefined ? r[k] : state[k])).toBe(JSON.stringify(state[k]));
    });
  });
});

describe('[T8-H+ 23] explainability', () => {
  test('applied / skipped / reasons 가 실제 산출과 일치한다', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('font', 'jua', NAIL), pref('size', 0.2, NAIL), pref('color', '#0f0', NAIL, LOW)]);
    const r = run(Pz, Pe, es([T({ font: 'pretendard', size: 0.08, color: '#111111' })]));
    const f = r.applied.find((x) => x.feature === 'font');
    ['feature', 'before', 'after', 'confidence', 'context', 'source', 'reason'].forEach((k) => expect(f).toHaveProperty(k));
    const s = r.applied.find((x) => x.feature === 'size');
    ['preferred', 'delta', 'appliedDelta'].forEach((k) => expect(s).toHaveProperty(k));
    expect(r.skipped.some((x) => x.feature === 'color')).toBe(true);
    // 설명이 실제 결과와 일치
    expect(r.layers[0].font).toBe(f.after);
    expect(r.layers[0].size).toBeCloseTo(0.08 + s.appliedDelta, 9);
  });
});

describe('[T8-H+ 22·26] context 격리', () => {
  test('🔴 젤네일 취향이 속눈썹으로 안 샌다', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('font', 'jua', NAIL)]);
    expect(run(Pz, Pe, es([T()]), NAIL).layers[0].font).toBe('jua');
    expect(run(Pz, Pe, es([T()]), LASH).layers[0].font).toBe('pretendard');
  });
  test('🔴 1장 취향이 3장에 강제 적용되지 않는다', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('size', 0.20, NAIL, { confidence: 0.9 })]);
    const one = run(Pz, Pe, es([T({ size: 0.08 })]), NAIL).layers[0].size;
    const three = run(Pz, Pe, es([T({ size: 0.08 })]), NAIL3).layers[0].size;
    expect(one).toBeGreaterThan(three);
  });
  test('🔴 promotion 스타일이 일반 시술로 안 샌다', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('font', 'blackhansans', PROMO, { confidence: 0.95 })]);
    expect(run(Pz, Pe, es([T()]), PROMO).layers[0].font).toBe('blackhansans');
    expect(run(Pz, Pe, es([T()]), NAIL).layers[0].font).toBe('pretendard');
  });
  test('before/after 는 사진 수가 같아도 다른 상황', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('align', 'left', BA, { confidence: 0.9 })]);
    const plain = { service: '펌', photoCount: 2, kind: 'service', hasBeforeAfter: false };
    expect(run(Pz, Pe, es([T()]), BA).layers[0].align).toBe('left');
    expect(run(Pz, Pe, es([T()]), plain).layers[0].align).toBe('center');
  });
});

describe('[T8-H+ 27] tenant 격리', () => {
  test('다른 계정 스냅샷이면 아무것도 적용 안 한다', () => {
    const { Pz, Pe, LS } = load(5);
    snap(Pe, [pref('font', 'jua', NAIL)], 5);
    expect(run(Pz, Pe, es([T()])).layers[0].font).toBe('jua');
    LS.setItem('last_user_id', '77');
    expect(run(Pz, Pe, es([T()])).layers[0].font).toBe('pretendard');
  });
});

describe('[T8-H+ 24·28~30] fail-open', () => {
  test('resolver 가 던져도 forEditor 는 원본 editState 를 쓴다', () => {
    const { Pz, Pe, E } = load();
    snap(Pe, [pref('font', 'jua', NAIL)]);
    const real = Pz.resolveFeaturePatch;
    global.window.WMPersonalize.resolveFeaturePatch = function () { throw new Error('boom'); };
    global.localStorage.setItem('itdasy:work_memory:list', JSON.stringify([{
      id: 'm', schema: 2, sig: 'sm', name: 'm', createdAt: Date.now(), thumb: null, ratio: '4:5',
      layoutIdx: 0, photoCount: 1, layoutOrder: [], collageBg: null, collageGap: null, fitMode: null,
      layers: [{ type: 'sticker', emoji: '✨', x: .5, y: .5, size: .1 }],
      shopStyleId: null, kind: 'service', applyCount: 0, lastAppliedAt: 0, publishCount: 1, lastPublishedAt: Date.now()
    }]));
    let out;
    expect(() => { out = E.forEditor({ restore: false, incoming: [], photoCount: 1, service: '젤네일' }); }).not.toThrow();
    expect(out).not.toBeNull();
    expect(out.layers.length).toBeGreaterThan(0);
    expect(out.layers[0]._src).toBe('wm');            // 기억 자체는 정상 적용
    global.window.WMPersonalize.resolveFeaturePatch = real;
  });
  test('WMPersonalize 가 아예 없어도 forEditor 는 동작한다', () => {
    const { E } = load();
    delete global.window.WMPersonalize;
    global.localStorage.setItem('itdasy:work_memory:list', JSON.stringify([{
      id: 'm', schema: 2, sig: 'sm', name: 'm', createdAt: Date.now(), thumb: null, ratio: '4:5',
      layoutIdx: 0, photoCount: 1, layoutOrder: [], collageBg: null, collageGap: null, fitMode: null,
      layers: [{ type: 'sticker', emoji: '✨', x: .5, y: .5, size: .1 }],
      shopStyleId: null, kind: 'service', applyCount: 0, lastAppliedAt: 0, publishCount: 1, lastPublishedAt: Date.now()
    }]));
    const out = E.forEditor({ restore: false, incoming: [], photoCount: 1, service: '젤네일' });
    expect(out).not.toBeNull();
    expect(out.layers[0]._src).toBe('wm');
  });
  test('망가진 preference 레코드가 섞여도 죽지 않는다', () => {
    const { Pz, Pe } = load();
    snap(Pe, [null, {}, { feature: 'font' }, pref('font', 'jua', NAIL)]);
    expect(() => run(Pz, Pe, es([T()]))).not.toThrow();
    expect(run(Pz, Pe, es([T()])).layers[0].font).toBe('jua');
  });
  test('레이어가 비어도 안전', () => {
    const { Pz, Pe } = load();
    snap(Pe, [pref('font', 'jua', NAIL)]);
    expect(run(Pz, Pe, es([])).layers).toEqual([]);
    expect(() => Pz.resolveFeaturePatch(null, null, null, null)).not.toThrow();
  });
});

describe('[T8-H+ 25] 성능·비용 계약', () => {
  test('동기·순수 — IDB/네트워크/LLM 접근 0', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'work-memory-personalize.js'), 'utf8');
    expect(src).not.toMatch(/indexedDB|wmLearn|WMStore|await |async /);
    expect(src).not.toMatch(/WMPrefs\.list/);
  });
  test('forEditor 는 snapshot 을 한 번만 읽는다', () => {
    const { E, Pe } = load();
    snap(Pe, [pref('font', 'jua', NAIL)]);
    let n = 0;
    const real = Pe.snapshot;
    global.window.WMPersona.snapshot = function () { n++; return real.call(Pe); };
    global.localStorage.setItem('itdasy:work_memory:list', JSON.stringify([{
      id: 'm', schema: 2, sig: 'sm', name: 'm', createdAt: Date.now(), thumb: null, ratio: '4:5',
      layoutIdx: 0, photoCount: 1, layoutOrder: [], collageBg: null, collageGap: null, fitMode: null,
      layers: [{ type: 'text', text: '예약문의 DM', x: .5, y: .8, size: .05, align: 'center', color: '#333', font: 'pretendard' }],
      shopStyleId: null, kind: 'service', applyCount: 0, lastAppliedAt: 0, publishCount: 1, lastPublishedAt: Date.now()
    }]));
    E.forEditor({ restore: false, incoming: [], photoCount: 1, service: '젤네일' });
    global.window.WMPersona.snapshot = real;
    expect(n).toBeLessThanOrEqual(2);   // select 1 + personalize 1
  });
});

describe('[T8-H+ 2·22] forEditor 통합 — 개인화된 결과가 실제로 나온다', () => {
  function seedMemory(font) {
    global.localStorage.setItem('itdasy:work_memory:list', JSON.stringify([{
      id: 'm1', schema: 2, sig: 'sm1', name: 'm1', createdAt: Date.now(), thumb: null, ratio: '4:5',
      layoutIdx: 0, photoCount: 1, layoutOrder: [], collageBg: null, collageGap: null, fitMode: null,
      layers: [{ type: 'text', text: '예약문의 DM', x: .5, y: .85, size: .05, align: 'center', color: '#333', font: font }],
      shopStyleId: null, kind: 'service', applyCount: 0, lastAppliedAt: 0, publishCount: 2, lastPublishedAt: Date.now()
    }]));
  }
  test('🔴 기억의 폰트가 원장 취향으로 보정돼서 편집기에 들어간다', () => {
    const { E, Pe } = load();
    seedMemory('pretendard');
    snap(Pe, [pref('font', 'jua', NAIL)]);
    const out = E.forEditor({ restore: false, incoming: [], photoCount: 1, service: '젤네일' });
    expect(out.layers[0].font).toBe('jua');
    expect(out.layers[0]._src).toBe('wm');            // T4 태깅은 그대로
    expect(out.layers[0]._wmTok).toBeTruthy();
  });
  test('개인화 결과가 원본 기억 레코드를 오염시키지 않는다', () => {
    const { E, Pe } = load();
    seedMemory('pretendard');
    snap(Pe, [pref('font', 'jua', NAIL)]);
    E.forEditor({ restore: false, incoming: [], photoCount: 1, service: '젤네일' });
    const stored = JSON.parse(global.localStorage.getItem('itdasy:work_memory:list'));
    expect(stored[0].layers[0].font).toBe('pretendard');
  });
  test('_lastApply(T4) 가 개인화 후에도 정상', () => {
    const { E, Pe } = load();
    seedMemory('pretendard');
    snap(Pe, [pref('font', 'jua', NAIL)]);
    const out = E.forEditor({ restore: false, incoming: [], photoCount: 1, service: '젤네일' });
    const ap = E._lastApply;
    expect(ap.memoryId).toBe('m1');
    expect(ap.count).toBe(out.layers.length);
    expect(ap.token).toBe(out.layers[0]._wmTok);
    expect(ap.undone).toBe(false);
  });
  test('QA 훅 — 마지막 개인화 결과를 역추적할 수 있다', () => {
    const { E, Pe } = load();
    seedMemory('pretendard');
    snap(Pe, [pref('font', 'jua', NAIL)]);
    E.forEditor({ restore: false, incoming: [], photoCount: 1, service: '젤네일' });
    expect(E._lastPersonalize).toBeTruthy();
    expect(E._lastPersonalize.applied.some((x) => x.feature === 'font')).toBe(true);
  });
});
