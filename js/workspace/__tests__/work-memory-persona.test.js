'use strict';

/* T8-E 골든 — personalization 을 T3 select() 에 **bounded** 로 연결. 구현보다 먼저 작성 (2026-08-20).

   합격 기준은 "개인화가 추가됐다"가 아니라
   **"기존 추천 품질을 보존하면서 원장 취향을 bounded 하게 반영한다"** 다(보스).

   ── 고정 계약
   1. finalTotal = 기존 T3 total + bounded personalization. 기존 6축 가중치·범위 **무변경**.
      parts.personalization 추가, `parts 합 === total` 계약 유지. 상한 15 도 테스트가 잠근다.
   2. 개인화가 **상황 적합성을 압도하지 못한다** — photoFit/baFit/kindFit 이 높은 memory 를
      개인 취향만으로 역전시키지 않는다.
   3. 근거는 reason.personalization 에 분해해서 남긴다(valueScore·confidence·contextMatch·pos·neg).
      숫자는 parts 에, 설명은 reason 에 — 그래야 parts 합 === total 이 깨지지 않는다.
   4. hierarchy: exact > service > kind > global. fallback 일수록 영향도가 준다.
   5. "경험 없음"과 "결론 없음"을 뭉개지 않는다 — 갈린 context 는 global 로 덮지 않는다(T8-D 계약).
   6. bonus ≠ confidence×15. contextMatch·negative·conflict 를 함께 본다.
   7. negative 증거가 쌓이면 bonus 가 **감소**한다.
   8. cold start = personalization 0 = 기존 T3 와 동일.
   10. tie-break(total ↓ → _touch ↓ → id) 결정론 유지.
   11. **LLM 호출 금지** — 전부 로컬 결정론.
   12. select() 는 동기다. IDB 를 후보마다 읽지 않는다 — snapshot 한 번 로드해 재사용. */

const fs = require('fs');
const path = require('path');

function loadAll(opts) {
  opts = opts || {};
  global.window = {};
  global.window.ITDASY_WORK_MEMORY = true;
  global.location = { search: '' };
  const ls = {};
  global.localStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(ls, k) ? ls[k] : null; },
    setItem(k, v) { ls[k] = String(v); },
    removeItem(k) { delete ls[k]; },
  };
  global.localStorage.setItem('last_user_id', String(opts.userId == null ? 5 : opts.userId));
  for (const f of ['work-memory.js', 'work-memory-decay.js', 'work-memory-persona.js', 'work-memory-engine.js']) {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
  }
  return { WM: global.window.WorkMemory, E: global.window.WorkMemoryEngine, P: global.window.WMPersona };
}

const NOW = Date.now();
const DAY = 86400000;

function m2(id, over) {
  return Object.assign({
    id, schema: 2, sig: 'sig-' + id, name: id, createdAt: NOW - 30 * DAY, thumb: null,
    ratio: '4:5', layoutIdx: 0, photoCount: 1, layoutOrder: [], collageBg: null, collageGap: null, fitMode: null,
    layers: [{ type: 'text', text: '제목', x: 0.5, y: 0.2, size: 0.08, align: 'center', color: '#111', font: { key: 'pretendard' } }],
    shopStyleId: null, kind: 'unknown',
    applyCount: 0, lastAppliedAt: 0, publishCount: 1, lastPublishedAt: NOW - 30 * DAY
  }, over || {});
}
// memory 를 특정 스타일로 — personalization 입력이 되는 축만 바꾼다.
function styled(id, style, over) {
  return m2(id, Object.assign({
    layers: [Object.assign({ type: 'text', text: '제목', x: 0.5, y: 0.2, size: 0.08 }, style)]
  }, over || {}));
}
function seed(_WM, list) { global.localStorage.setItem('itdasy:work_memory:list', JSON.stringify(list)); }

/* preference snapshot 을 직접 만든다 — IDB 없이 순수 계산만 검증(빠르고 결정론).
   실제 IDB 경로는 브라우저 실측에서 따로 확인한다. */
function pref(feature, value, ctx, over) {
  return Object.assign({
    id: 'p:' + feature + ':' + value, feature, value,
    /* [T8-H migration] 예전엔 3부분 키를 테스트가 직접 조립했다. before/after 축이 붙으면서
       엔진과 어긋나 exact 매칭이 조용히 service 폴백으로 떨어졌다(이 파일이 잡아냈다).
       이제 **엔진의 contextKey 를 그대로 쓴다** — 손으로 만들면 또 어긋난다. */
    contextKey: global.window.WorkMemoryEngine.contextKey(ctx),
    context: ctx, positive: 20, negative: 0, sampleCount: 10, publishCount: 10,
    memoryIds: ['a', 'b', 'c'], contextKeys: ['x', 'y', 'z'], obsIds: [], evidence: [],
    consistency: 1, recency: 1, confidence: 0.6, saturation: 0.6,
    decayedPositive: 20, decayedNegative: 0, lastObservedAt: NOW, version: 2
  }, over || {});
}
const NAIL = { service: '젤네일', photoCount: 1, kind: 'service' };
const HAIR = { service: '펌', photoCount: 2, kind: 'service' };

// snapshot 주입 — warm() 대신 테스트가 직접 넣는다(IDB 비의존).
function snap(P, prefs, tenant) { P._setSnapshotForTest(prefs || [], tenant == null ? '5' : String(tenant)); }

describe('[T8-E 1·13] bounded — parts 합 === total, 상한 15', () => {
  test('personalization 축이 parts 에 있고 합이 total 과 같다', () => {
    const { E, P } = loadAll();
    snap(P, [pref('font', 'jua', NAIL)]);
    const s = E.scoreMemory(styled('m', { font: { key: 'jua' } }), NAIL);
    expect(s.parts).toHaveProperty('personalization');
    const sum = Object.keys(s.parts).reduce((a, k) => a + s.parts[k], 0);
    expect(sum).toBe(s.total);
  });
  test('상한 15 — 아무리 강한 취향도 15 를 넘지 못한다', () => {
    const { E, P } = loadAll();
    expect(P.MAX).toBe(15);
    const strong = { positive: 200, negative: 0, sampleCount: 200, publishCount: 200, confidence: 0.95, decayedPositive: 400, decayedNegative: 0 };
    snap(P, [pref('font', 'jua', NAIL, strong), pref('color', '#e11', NAIL, strong), pref('align', 'center', NAIL, strong)]);
    const s = E.scoreMemory(styled('m', { font: { key: 'jua' }, color: '#e11', align: 'center' }), NAIL);
    expect(s.parts.personalization).toBeLessThanOrEqual(15);
    expect(s.parts.personalization).toBeGreaterThan(0);
  });
  test('bonus 는 음수가 되지 않는다 — 상황 적합한 memory 를 강등시키지 않는다', () => {
    const { E, P } = loadAll();
    snap(P, [pref('font', 'jua', NAIL, { positive: 0, negative: 40, decayedPositive: 0, decayedNegative: 40, consistency: 0, confidence: 0 })]);
    const s = E.scoreMemory(styled('m', { font: { key: 'jua' } }), NAIL);
    expect(s.parts.personalization).toBe(0);
  });
});

describe('[T8-E 8·11] cold start — 개인화 없으면 기존 T3 와 완전히 동일', () => {
  test('snapshot 없음 → personalization 0, 나머지 축 무변경', () => {
    const { E, P } = loadAll();
    P._setSnapshotForTest(null, null);
    const s = E.scoreMemory(m2('m'), NAIL);
    expect(s.parts.personalization).toBe(0);
    expect(s.parts.photoFit).toBe(40);
    expect(s.parts.kindFit).toBe(0);
  });
  test('snapshot 이 비어 있어도 0', () => {
    const { E, P } = loadAll();
    snap(P, []);
    expect(E.scoreMemory(m2('m'), NAIL).parts.personalization).toBe(0);
  });
  test('신규 원장 ranking = 기존 T3 ranking', () => {
    const { WM, E, P } = loadAll();
    const list = [m2('a', { photoCount: 1 }), m2('b', { photoCount: 3 }), m2('c', { photoCount: 1, publishCount: 5 })];
    seed(WM, list);
    P._setSnapshotForTest(null, null);
    const cold = E.select(NAIL).candidates.map((x) => x.id);
    snap(P, []);
    expect(E.select(NAIL).candidates.map((x) => x.id)).toEqual(cold);
  });
});

describe('[T8-E 2] 🔴 개인화가 상황 적합성을 압도하지 못한다', () => {
  test('photoFit/baFit/kindFit 이 높은 A 를, personalization 만점인 B 가 못 뒤집는다', () => {
    const { WM, E, P } = loadAll();
    // A: 상황 완벽(photoFit 40 + baFit 25 + kindFit 15 = 80) · 취향은 0
    const A = m2('A', { photoCount: 2, layoutIdx: 7, kind: 'service', layers: [{ type: 'text', text: 'x', font: { key: 'nanum' }, color: '#000', align: 'left' }] });
    // B: 상황 전혀 안 맞음(photoCount 다름·B/A 아님) · 취향 만점
    const B = m2('B', { photoCount: 5, layoutIdx: 0, kind: 'service', layers: [{ type: 'text', text: 'x', font: { key: 'jua' }, color: '#e11', align: 'center' }] });
    seed(WM, [A, B]);
    const strong = { positive: 200, negative: 0, sampleCount: 200, publishCount: 200, confidence: 0.95, decayedPositive: 400, decayedNegative: 0 };
    const ctx = { service: '젤네일', photoCount: 2, kind: 'service', hasBeforeAfter: true };
    snap(P, [pref('font', 'jua', ctx, strong), pref('color', '#e11', ctx, strong), pref('align', 'center', ctx, strong)]);
    const r = E.select(ctx);
    expect(r.memory.id).toBe('A');
    // 최대 보너스를 받아도 격차를 못 메운다
    const sb = E.scoreMemory(B, ctx);
    expect(sb.parts.personalization).toBeLessThanOrEqual(15);
    expect(E.scoreMemory(A, ctx).total).toBeGreaterThan(sb.total);
  });
  test('상황이 동률이면 개인화가 순위를 가른다 — 이건 의도된 동작', () => {
    const { WM, E, P } = loadAll();
    const A = styled('A', { font: { key: 'nanum' } }, { photoCount: 1, kind: 'service', lastPublishedAt: NOW - 5 * DAY });
    const B = styled('B', { font: { key: 'jua' } }, { photoCount: 1, kind: 'service', lastPublishedAt: NOW - 5 * DAY });
    seed(WM, [A, B]);
    snap(P, [pref('font', 'jua', NAIL)]);
    expect(E.select(NAIL).memory.id).toBe('B');
  });
});

describe('[T8-E 3·14] explainability — reason 이 실제 산출 근거와 일치', () => {
  test('reason.personalization 에 분해가 남는다', () => {
    const { WM, E, P } = loadAll();
    seed(WM, [styled('m', { font: { key: 'jua' }, align: 'center' }, { photoCount: 1 })]);
    snap(P, [pref('font', 'jua', NAIL), pref('align', 'center', NAIL)]);
    const r = E.select(NAIL);
    const p = r.reason.personalization;
    ['valueScore', 'confidence', 'contextMatch', 'positive', 'negative', 'reason', 'bonus'].forEach((k) => expect(p).toHaveProperty(k));
    expect(p.bonus).toBe(r.reason.parts.personalization);          // 설명 ↔ 점수 일치
    expect(Array.isArray(p.reason)).toBe(true);
    expect(p.reason.length).toBeGreaterThan(0);
    expect(p.positive).toBeGreaterThan(0);
  });
  test('reason 은 날조가 아니다 — 근거가 없으면 빈 목록 + bonus 0', () => {
    const { WM, E, P } = loadAll();
    seed(WM, [styled('m', { font: { key: 'unknown-font' } })]);
    snap(P, [pref('font', 'jua', NAIL)]);
    const p = E.select(NAIL).reason.personalization;
    expect(p.bonus).toBe(0);
    expect(p.reason).toEqual([]);
  });
  test('parts 합 === total 은 personalization 이 있을 때도 유지', () => {
    const { WM, E, P } = loadAll();
    seed(WM, [styled('m', { font: { key: 'jua' } })]);
    snap(P, [pref('font', 'jua', NAIL)]);
    const r = E.select(NAIL);
    const sum = Object.keys(r.reason.parts).reduce((a, k) => a + r.reason.parts[k], 0);
    expect(sum).toBe(r.reason.total);
  });
});

describe('[T8-E 4] hierarchy — exact > service > kind > global', () => {
  test('fallback 일수록 영향도가 준다', () => {
    const { E, P } = loadAll();
    const M = styled('m', { font: { key: 'jua' } });
    const bonus = (prefCtx, queryCtx) => { snap(P, [pref('font', 'jua', prefCtx)]); return E.scoreMemory(M, queryCtx).parts.personalization; };
    const exact = bonus(NAIL, NAIL);
    const svc = bonus({ service: '젤네일', photoCount: 3, kind: 'service' }, NAIL);   // 서비스만 일치
    const kind = bonus({ service: '펌', photoCount: 3, kind: 'service' }, NAIL);       // kind 만 일치
    const glob = bonus({ service: '펌', photoCount: 3, kind: 'promotion' }, NAIL);     // 아무것도 안 맞음
    expect(exact).toBeGreaterThan(svc);
    expect(svc).toBeGreaterThan(kind);
    expect(kind).toBeGreaterThan(glob);
    expect(glob).toBeGreaterThanOrEqual(0);
  });
  test('🔴 nail 1장 취향이 hair before/after memory 를 같은 강도로 끌어올리지 않는다', () => {
    const { E, P } = loadAll();
    snap(P, [pref('font', 'jua', NAIL)]);
    const M = styled('m', { font: { key: 'jua' } });
    const atNail = E.scoreMemory(M, NAIL).parts.personalization;
    const atHair = E.scoreMemory(M, Object.assign({ hasBeforeAfter: true }, HAIR)).parts.personalization;
    expect(atHair).toBeLessThan(atNail);
  });
});

describe('[T8-E 5·10] 🔴 "경험 없음" ≠ "결론 없음"', () => {
  test('갈린 context(8/8) → personalization ≈ 0, global fallback 사용 금지', () => {
    const { E, P } = loadAll();
    const tie = { positive: 16, negative: 16, sampleCount: 16, consistency: 0.5, confidence: 0.01, decayedPositive: 16, decayedNegative: 16 };
    snap(P, [
      pref('font', 'jua', NAIL, tie),
      pref('font', 'gamja', NAIL, tie),
      // 다른 context 들에서는 jua 를 확실히 선호 → global 후보가 성립하지만 써선 안 된다
      pref('font', 'jua', { service: 'A', photoCount: 9, kind: 'service' }),
      pref('font', 'jua', { service: 'B', photoCount: 8, kind: 'service' })
    ]);
    const s = E.scoreMemory(styled('m', { font: { key: 'jua' } }), NAIL);
    expect(s.parts.personalization).toBe(0);
    const p = P.score(styled('m', { font: { key: 'jua' } }), NAIL, P.snapshot());
    expect(p.contextMatch).toBe('conflict');
  });
  test('경험 자체가 없는 context → global fallback 사용 가능(약하게)', () => {
    const { E, P } = loadAll();
    snap(P, [
      pref('font', 'jua', { service: 'A', photoCount: 9, kind: 'service' }),
      pref('font', 'jua', { service: 'B', photoCount: 8, kind: 'service' }),
      pref('font', 'jua', { service: 'C', photoCount: 7, kind: 'service' })
    ]);
    const M = styled('m', { font: { key: 'jua' } });
    // service·kind 어느 것도 안 겹치는 완전 신규 상황(kind 분류 실패 = unknown) → global 만 남는다
    const FRESH = { service: '처음보는시술', photoCount: 4, kind: 'unknown' };
    const s = E.scoreMemory(M, FRESH);
    expect(s.parts.personalization).toBeGreaterThan(0);
    expect(P.score(M, FRESH, P.snapshot()).contextMatch).toBe('global');
    // 그리고 exact 보다 확실히 약하다
    expect(s.parts.personalization).toBeLessThan(E.scoreMemory(M, { service: 'A', photoCount: 9, kind: 'service' }).parts.personalization);
  });
  test('두 상태는 같은 값으로 뭉개지지 않는다 — contextMatch 로 구분된다', () => {
    const { P } = loadAll();
    const M = styled('m', { font: { key: 'jua' } });
    snap(P, []);
    expect(P.score(M, NAIL, P.snapshot()).contextMatch).toBe('none');
    const tie = { positive: 16, negative: 16, consistency: 0.5, confidence: 0.01, decayedPositive: 16, decayedNegative: 16 };
    snap(P, [pref('font', 'jua', NAIL, tie), pref('font', 'gamja', NAIL, tie)]);
    expect(P.score(M, NAIL, P.snapshot()).contextMatch).toBe('conflict');
  });
});

describe('[T8-E 6·7] bonus ≠ confidence×15 / negative 보호', () => {
  test('🔴 반복 교체당한 폰트는 bonus 가 감소한다', () => {
    const { E, P } = loadAll();
    const M = styled('m', { font: { key: 'jua' } });
    snap(P, [pref('font', 'jua', NAIL)]);
    const clean = E.scoreMemory(M, NAIL).parts.personalization;
    snap(P, [pref('font', 'jua', NAIL, { negative: 12, decayedNegative: 12, consistency: 20 / 32, confidence: 0.35 })]);
    const withNeg = E.scoreMemory(M, NAIL).parts.personalization;
    expect(withNeg).toBeLessThan(clean);
    expect(withNeg).toBeGreaterThan(0);            // 완전히 죽이진 않는다 — 아직 우세하므로
  });
  test('같은 confidence 라도 context 가 안 맞으면 bonus 가 작다', () => {
    const { E, P } = loadAll();
    const M = styled('m', { font: { key: 'jua' } });
    snap(P, [pref('font', 'jua', NAIL, { confidence: 0.6 })]);
    const exact = E.scoreMemory(M, NAIL).parts.personalization;
    snap(P, [pref('font', 'jua', { service: '펌', photoCount: 9, kind: 'promotion' }, { confidence: 0.6 })]);
    const far = E.scoreMemory(M, NAIL).parts.personalization;
    expect(far).toBeLessThan(exact);
    expect(exact).not.toBeCloseTo(0.6 * 15, 1);    // 단순 confidence×15 아님
  });
  test('confidence 가 낮으면 bonus 도 낮다(단조)', () => {
    const { E, P } = loadAll();
    const M = styled('m', { font: { key: 'jua' } });
    const at = (c) => { snap(P, [pref('font', 'jua', NAIL, { confidence: c })]); return E.scoreMemory(M, NAIL).parts.personalization; };
    const v = [0.07, 0.25, 0.45, 0.61, 0.75, 0.93].map(at);
    for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThanOrEqual(v[i - 1]);
    expect(v[0]).toBeLessThan(3);                  // 1회 반복으로는 거의 못 움직인다
  });
});

describe('[T8-E 9] ranking regression — 6가지 강도 골든', () => {
  const CTX = { service: '젤네일', photoCount: 1, kind: 'service' };
  function rank(P, E, WM, prefs) {
    const A = styled('A', { font: { key: 'nanum' } }, { photoCount: 1, kind: 'service', lastPublishedAt: NOW - 3 * DAY });
    const B = styled('B', { font: { key: 'jua' } }, { photoCount: 1, kind: 'service', lastPublishedAt: NOW - 3 * DAY });
    seed(WM, [A, B]);
    snap(P, prefs);
    const r = E.select(CTX);
    return { win: r.memory.id, bonusB: E.scoreMemory(B, CTX).parts.personalization };
  }
  test('없음 / weak / medium / strong / negative / conflicting', () => {
    const { WM, E, P } = loadAll();
    const none = rank(P, E, WM, []);
    const weak = rank(P, E, WM, [pref('font', 'jua', CTX, { positive: 2, negative: 0, sampleCount: 1, confidence: 0.07, decayedPositive: 2 })]);
    const med = rank(P, E, WM, [pref('font', 'jua', CTX, { confidence: 0.45, decayedPositive: 14 })]);
    const strong = rank(P, E, WM, [pref('font', 'jua', CTX, { positive: 100, negative: 0, sampleCount: 50, confidence: 0.86, decayedPositive: 100 })]);
    const neg = rank(P, E, WM, [pref('font', 'jua', CTX, { positive: 4, negative: 30, sampleCount: 17, consistency: 4 / 34, confidence: 0, decayedPositive: 4, decayedNegative: 30 })]);
    const conflict = rank(P, E, WM, [
      pref('font', 'jua', CTX, { positive: 16, negative: 16, consistency: 0.5, confidence: 0.01, decayedPositive: 16, decayedNegative: 16 }),
      pref('font', 'gamja', CTX, { positive: 16, negative: 16, consistency: 0.5, confidence: 0.01, decayedPositive: 16, decayedNegative: 16 })
    ]);
    expect(none.bonusB).toBe(0);
    expect(neg.bonusB).toBe(0);
    expect(conflict.bonusB).toBe(0);
    expect(weak.bonusB).toBeGreaterThan(0);
    expect(med.bonusB).toBeGreaterThan(weak.bonusB);
    expect(strong.bonusB).toBeGreaterThan(med.bonusB);
    expect(strong.bonusB).toBeLessThanOrEqual(15);
    // 동률 상황이라 취향이 있으면 B 가 이기고, 없거나 부정적이면 tie-break(id) 로 A
    expect(none.win).toBe('A');
    expect(neg.win).toBe('A');
    expect(conflict.win).toBe('A');
    expect(strong.win).toBe('B');
  });
});

describe('[T8-E 12] tie-break 결정론 유지', () => {
  test('총점이 같으면 _touch ↓ → id 순 — personalization 이 개입해도 동일', () => {
    const { WM, E, P } = loadAll();
    const a = styled('aaa', { font: { key: 'jua' } }, { photoCount: 1, lastPublishedAt: NOW - DAY });
    const b = styled('bbb', { font: { key: 'jua' } }, { photoCount: 1, lastPublishedAt: NOW - DAY });
    seed(WM, [b, a]);
    snap(P, [pref('font', 'jua', NAIL)]);
    const r1 = E.select(NAIL), r2 = E.select(NAIL);
    expect(r1.memory.id).toBe('aaa');
    expect(r1.candidates.map((x) => x.id)).toEqual(r2.candidates.map((x) => x.id));
  });
  test('동일 입력 반복 → 완전 동일 결과(결정론)', () => {
    const { WM, E, P } = loadAll();
    seed(WM, [styled('a', { font: { key: 'jua' } }), styled('b', { font: { key: 'nanum' } })]);
    snap(P, [pref('font', 'jua', NAIL)]);
    const out = [];
    for (let i = 0; i < 5; i++) out.push(JSON.stringify(E.select(NAIL).candidates));
    expect(new Set(out).size).toBe(1);
  });
});

describe('[T8-E 15] tenant isolation', () => {
  test('snapshot tenant 가 현재 사용자와 다르면 personalization 0', () => {
    const { E, P } = loadAll({ userId: 5 });
    snap(P, [pref('font', 'jua', NAIL)], 5);
    expect(E.scoreMemory(styled('m', { font: { key: 'jua' } }), NAIL).parts.personalization).toBeGreaterThan(0);
    global.localStorage.setItem('last_user_id', '77');            // 계정 전환
    expect(E.scoreMemory(styled('m', { font: { key: 'jua' } }), NAIL).parts.personalization).toBe(0);
  });
  test('로그아웃(tenant 없음) → personalization 0', () => {
    const { E, P } = loadAll({ userId: 5 });
    snap(P, [pref('font', 'jua', NAIL)], 5);
    global.localStorage.removeItem('last_user_id');
    expect(E.scoreMemory(styled('m', { font: { key: 'jua' } }), NAIL).parts.personalization).toBe(0);
  });
});

describe('[T8-E 11·12] 비용·성능 계약', () => {
  test('🔴 LLM 도, 네트워크도 부르지 않는다', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'work-memory-persona.js'), 'utf8');
    expect(src).not.toMatch(/fetch\s*\(|apiFetch|XMLHttpRequest|generateContent|assistant/i);
  });
  test('select() 는 동기다 — snapshot 만 읽고 IDB 를 후보마다 열지 않는다', () => {
    const { WM, E, P } = loadAll();
    const src = fs.readFileSync(path.join(__dirname, '..', 'work-memory-persona.js'), 'utf8');
    expect(/function\s+score\s*\([^)]*\)\s*\{[\s\S]{0,400}await/.test(src)).toBe(false);
    let reads = 0;
    const real = P.snapshot;
    P.snapshot = function () { reads++; return real.call(P); };
    seed(WM, [styled('a', { font: { key: 'jua' } }), styled('b', {}), styled('c', {}), styled('d', {}), styled('e', {})]);
    snap(P, [pref('font', 'jua', NAIL)]);
    P.snapshot = function () { reads++; return real.call(P); };
    E.select(NAIL);
    expect(reads).toBe(1);                                        // 후보 5개인데 스냅샷 조회는 1회
    P.snapshot = real;
  });
  test('warm() 이 없어도(미로드) select 는 죽지 않는다', () => {
    const { WM, E } = loadAll();
    delete global.window.WMPersona;
    seed(WM, [m2('a')]);
    expect(() => E.select(NAIL)).not.toThrow();
    expect(E.scoreMemory(m2('a'), NAIL).parts.personalization).toBe(0);
  });
});

describe('[T8-E] 스타일 값 정규화 — font 는 객체로 저장된다', () => {
  test('layer.font 가 {key} 객체여도 문자열 취향과 매칭된다', () => {
    const { P } = loadAll();
    snap(P, [pref('font', 'jua', NAIL)]);
    expect(P.styleOf(styled('m', { font: { key: 'jua' } })).font).toContain('jua');
    expect(P.styleOf(styled('m', { font: 'jua' })).font).toContain('jua');
  });
  test('이미지·스티커 레이어는 스타일 원천이 아니다', () => {
    const { P } = loadAll();
    const M = m2('m', { layers: [{ type: 'image', src: 'x.png' }, { type: 'sticker', emoji: '⭐' }] });
    const st = P.styleOf(M);
    expect(st.font).toEqual([]);
    expect(st.color).toEqual([]);
  });
});

describe('[T8-E] 🔴 select() 경유에서도 context 가 온전히 전달된다 (브라우저 실측에서 발견)', () => {
  /* scoreMemory 를 직접 부르는 테스트만 있어서 놓쳤다: select() 는 ctx 를 sctx 로 재조립하는데
     거기서 service 가 빠져 있었다. 기존 6축은 service 를 안 써서 아무 증상이 없었고,
     personalization 만 조용히 exact 를 못 잡고 늘 kind 폴백으로 떨어졌다.
     → 직접 호출과 select() 경유가 **같은 tier** 를 내는지 잠근다. */
  test('select() 경유 bonus === scoreMemory 직접 호출 bonus (exact 유지)', () => {
    const { WM, E, P } = loadAll();
    const B = styled('B', { font: { key: 'jua' } }, { photoCount: 1, kind: 'service' });
    seed(WM, [B]);
    snap(P, [pref('font', 'jua', NAIL)]);
    const direct = E.scoreMemory(B, NAIL).parts.personalization;
    const viaSelect = E.select(NAIL).reason.parts.personalization;
    expect(viaSelect).toBe(direct);
    expect(E.select(NAIL).reason.personalization.contextMatch).toBe('exact');
  });
  test('service 가 다르면 select() 도 tier 를 낮춘다 — 폴백이 실제로 동작', () => {
    const { WM, E, P } = loadAll();
    const B = styled('B', { font: { key: 'jua' } }, { photoCount: 1, kind: 'service' });
    seed(WM, [B]);
    snap(P, [pref('font', 'jua', NAIL)]);
    const same = E.select(NAIL).reason.parts.personalization;
    const other = E.select({ service: '다른시술', photoCount: 1, kind: 'service' }).reason.parts.personalization;
    expect(other).toBeLessThan(same);
    expect(other).toBeGreaterThan(0);
  });
});
