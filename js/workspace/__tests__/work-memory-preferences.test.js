'use strict';

/* T8-C 골든 — preference 계산/집계. 구현보다 먼저 작성 (2026-08-20).

   이 단계의 합격 기준은 "값이 저장된다"가 아니라 **원장 취향을 잘못 학습하지 않는가** 다.
   평균·횟수만으로 선호를 만들면 안 된다 — 증거 강도·일관성·context·negative·publish outcome 을 함께 본다.

   고정 계약(보스 확정):
   1. identity = tenantId + feature + **value** + contextKey (같은 font 라도 context 다르면 별개)
   2. observation 1개 = 증거 1개. 한 게시물에서 A→B→C→B 로 4번 바꿔도 sample +1 (최종값 B 에게)
   3. positive/negative 를 **분리 보존**(pos-neg 압축 금지) — "안 좋아함" vs "싫어함" 구분
   4. outcome 별 증거 강도: publish 유지 = 강한 positive · undo = 강한 negative · 취소 = 중립
   5. confidence = sample 만으로 안 오름(consistency·recency·pos/neg·publish 함께)
   6. global 승격은 보수적 — 서로 다른 memory/context 에서 반복될 때만
   7. 이벤트/임시 작업이 style preference 를 오염시키지 않음(T5 정책 존중)
   ❌ scoreMemory / T3 연결은 이 단계에서 하지 않는다. */

const fs = require('fs');
const path = require('path');

function memBackend() {
  const db = { preferences: new Map(), learning_signals: new Map(), preference_versions: new Map() };
  return {
    _db: db, _fail: false,
    async put(s, r) { if (this._fail) throw new Error('quota'); db[s].set(r.id, JSON.parse(JSON.stringify(r))); return r.id; },
    async get(s, id) { const v = db[s].get(id); return v ? JSON.parse(JSON.stringify(v)) : null; },
    async all(s) { return [...db[s].values()].map((v) => JSON.parse(JSON.stringify(v))); },
    async del(s, id) { db[s].delete(id); },
  };
}
function load(userId, backend) {
  global.window = {};
  global.location = { search: '' };
  const ls = {};
  global.localStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(ls, k) ? ls[k] : null; },
    setItem(k, v) { ls[k] = String(v); },
    removeItem(k) { delete ls[k]; },
  };
  if (userId != null) global.localStorage.setItem('last_user_id', String(userId));
  for (const f of ['work-memory-store.js', 'work-memory-preferences.js']) {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
  }
  if (backend) global.window.WMStore._setBackend(backend);
  return { P: global.window.WMPrefs, S: global.window.WMStore };
}

const NAIL = { service: '젤네일', photoCount: 1, kind: 'service' };
const HAIR = { service: '펌', photoCount: 2, kind: 'service' };
let _n = 0;
// observation 하나 = 게시물 하나. sig = [{event, layerKey, before, after}]
function obs(sigs, o) {
  o = o || {};
  return Object.assign({
    observationId: 'o' + (++_n), memoryId: o.memoryId || 'mem-1', context: o.context || NAIL,
    outcome: o.outcome === undefined ? 'published' : o.outcome,
    signals: (sigs || []).map((s, i) => Object.assign({ at: i }, s)),
    baseline: o.baseline || [], startedAt: 0, endedAt: _n,
  }, o.extra || {});
}
const fontTo = (v, from) => ({ event: 'font_changed', layerKey: 'title', before: from || 'pretendard', after: v });

describe('[T8-C 1] identity — feature + value + context 분리', () => {
  test('같은 font 라도 context 가 다르면 별개 preference', async () => {
    const { P } = load(5, memBackend());
    await P.learn(obs([fontTo('jua')], { context: NAIL }));
    await P.learn(obs([fontTo('jua')], { context: HAIR }));
    // 교체당한 'pretendard' 에도 negative 레코드가 생긴다(계약 3) — jua 만 골라서 검증
    const jua = (await P.list()).filter((p) => p.value === 'jua');
    expect(jua).toHaveLength(2);
    expect(jua.every((p) => p.feature === 'font')).toBe(true);
    expect(new Set(jua.map((p) => p.contextKey)).size).toBe(2);   // context 로 분리됨
  });
  test('같은 context 에서 값이 다르면 별개 preference', async () => {
    const { P } = load(5, memBackend());
    await P.learn(obs([fontTo('jua')]));
    await P.learn(obs([fontTo('gamja')]));
    const chosen = (await P.list()).filter((p) => p.positive > 0).map((p) => p.value).sort();
    expect(chosen).toEqual(['gamja', 'jua']);
  });
});

describe('[T8-C 2] observation batch = 증거 1개', () => {
  test('한 게시물에서 A→B→C→B 4번 바꿔도 최종값 B 에 sample 1', async () => {
    const { P } = load(5, memBackend());
    await P.learn(obs([
      fontTo('a', 'pretendard'), fontTo('b', 'a'), fontTo('c', 'b'), fontTo('b', 'c'),
    ]));
    const b = (await P.list()).find((p) => p.value === 'b');
    expect(b).toBeTruthy();
    expect(b.sampleCount).toBe(1);      // 4 가 아니다
    expect(b.positive).toBeGreaterThan(0);
    // 중간값 c 는 최종이 아니므로 positive 를 얻지 않는다
    const c = (await P.list()).find((p) => p.value === 'c');
    expect(!c || c.positive === 0).toBe(true);
  });
  test('서로 다른 게시물 3개 → sample 3', async () => {
    const { P } = load(5, memBackend());
    for (let i = 0; i < 3; i++) await P.learn(obs([fontTo('jua')]));
    expect((await P.list()).find((p) => p.value === 'jua').sampleCount).toBe(3);
  });
});

describe('[T8-C 3·4] positive/negative 분리 + outcome 별 증거 강도', () => {
  test('반복 유지 → positive 증가 (pos-neg 압축 없이 둘 다 보존)', async () => {
    const { P } = load(5, memBackend());
    for (let i = 0; i < 3; i++) await P.learn(obs([fontTo('jua')]));
    const p = (await P.list()).find((x) => x.value === 'jua');
    expect(p.positive).toBeGreaterThan(0);
    expect(p.negative).toBe(0);
    expect(p).toHaveProperty('positive');
    expect(p).toHaveProperty('negative');
    expect(p).toHaveProperty('sampleCount');
    expect(p).toHaveProperty('publishCount');
    expect(p).toHaveProperty('undoCount');
  });
  test('반복 교체 → 교체당한 값(before)에 negative 누적', async () => {
    const { P } = load(5, memBackend());
    for (let i = 0; i < 3; i++) await P.learn(obs([fontTo('jua', 'pretendard')]));
    const old = (await P.list()).find((x) => x.value === 'pretendard');
    expect(old).toBeTruthy();
    expect(old.negative).toBeGreaterThan(0);
    expect(old.positive).toBe(0);
  });
  test('publish 없이 취소 → 강한 positive 아님', async () => {
    const { P } = load(5, memBackend());
    await P.learn(obs([fontTo('jua')], { outcome: 'cancelled' }));
    const p = (await P.list()).find((x) => x.value === 'jua');
    const strong = P.WEIGHTS.publishedKept;
    expect(p.positive).toBeLessThan(strong);
    expect(p.publishCount).toBe(0);
  });
  test('자동 적용 → 거의 그대로 publish → 강한 positive', async () => {
    const { P } = load(5, memBackend());
    // baseline 에 있던 값을 원장이 안 건드리고 publish
    await P.learn(obs([], { baseline: [{ type: 'text', role: 'title', font: 'jua', color: '#fff', align: 'center' }] }));
    const p = (await P.list()).find((x) => x.feature === 'font' && x.value === 'jua');
    expect(p).toBeTruthy();
    expect(p.positive).toBeGreaterThanOrEqual(P.WEIGHTS.publishedKept);
    expect(p.publishCount).toBe(1);
  });
  test('자동 적용 → undo → 강한 negative', async () => {
    const { P } = load(5, memBackend());
    await P.learn(obs([], {
      baseline: [{ type: 'text', role: 'title', font: 'jua' }],
      extra: { undone: true }, outcome: 'cancelled',
    }));
    const p = (await P.list()).find((x) => x.value === 'jua');
    expect(p).toBeTruthy();
    expect(p.negative).toBeGreaterThanOrEqual(P.WEIGHTS.undo);
    expect(p.undoCount).toBe(1);
  });
});

describe('[T8-C 5] confidence — sample 만으로 안 오른다', () => {
  test('일관된 반복 → confidence 상승', async () => {
    const { P } = load(5, memBackend());
    const seen = [];
    for (let i = 0; i < 5; i++) {
      await P.learn(obs([fontTo('jua')]));
      seen.push((await P.list()).find((x) => x.value === 'jua').confidence);
    }
    expect(seen[4]).toBeGreaterThan(seen[0]);
    expect(seen[4]).toBeLessThanOrEqual(1);
  });
  test('🔴 상충 행동 → confidence 하락 (같은 sample 수라도)', async () => {
    const A = load(5, memBackend());
    for (let i = 0; i < 4; i++) await A.P.learn(obs([fontTo('jua')]));
    const consistent = (await A.P.list()).find((x) => x.value === 'jua').confidence;

    const B = load(5, memBackend());
    await B.P.learn(obs([fontTo('jua')]));
    await B.P.learn(obs([fontTo('gamja', 'jua')]));   // jua 를 버림
    await B.P.learn(obs([fontTo('jua', 'gamja')]));
    await B.P.learn(obs([fontTo('gamja', 'jua')]));
    const conflicted = (await B.P.list()).find((x) => x.value === 'jua').confidence;

    expect(conflicted).toBeLessThan(consistent);
  });
  test('sample 이 적으면 confidence 가 낮게 유지된다(1회로 확정 금지)', async () => {
    const { P } = load(5, memBackend());
    await P.learn(obs([fontTo('jua')]));
    expect((await P.list()).find((x) => x.value === 'jua').confidence).toBeLessThan(0.5);
  });
});

describe('[T8-C 6] global 승격 — 보수적', () => {
  test('한 memory/context 에서만 반복 → global 승격 안 됨', async () => {
    const { P } = load(5, memBackend());
    for (let i = 0; i < 5; i++) await P.learn(obs([fontTo('jua')], { memoryId: 'mem-1', context: NAIL }));
    expect((await P.list()).find((x) => x.value === 'jua').globalCandidate).toBe(false);
  });
  test('서로 다른 memory + context 에서 반복 → global 후보', async () => {
    const { P } = load(5, memBackend());
    await P.learn(obs([fontTo('jua')], { memoryId: 'mem-1', context: NAIL }));
    await P.learn(obs([fontTo('jua')], { memoryId: 'mem-2', context: HAIR }));
    await P.learn(obs([fontTo('jua')], { memoryId: 'mem-3', context: { service: '속눈썹', photoCount: 3, kind: 'service' } }));
    const g = await P.getGlobal('font');
    expect(g).toBeTruthy();
    expect(g.value).toBe('jua');
    expect(g.globalCandidate).toBe(true);
  });
  test('서로 다른 memory 지만 값이 제각각 → global 승격 안 됨', async () => {
    const { P } = load(5, memBackend());
    await P.learn(obs([fontTo('jua')], { memoryId: 'm1', context: NAIL }));
    await P.learn(obs([fontTo('gamja')], { memoryId: 'm2', context: HAIR }));
    await P.learn(obs([fontTo('pen')], { memoryId: 'm3', context: NAIL }));
    expect(await P.getGlobal('font')).toBeNull();
  });
});

describe('[T8-C] context fallback — exact 우선, fallback 은 confidence 감쇠', () => {
  test('exact context preference 가 fallback 보다 우선', async () => {
    const { P } = load(5, memBackend());
    // global 후보를 만들어 두고
    await P.learn(obs([fontTo('gamja')], { memoryId: 'm1', context: HAIR }));
    await P.learn(obs([fontTo('gamja')], { memoryId: 'm2', context: { service: '속눈썹', photoCount: 3, kind: 'service' } }));
    await P.learn(obs([fontTo('gamja')], { memoryId: 'm3', context: { service: '왁싱', photoCount: 1, kind: 'service' } }));
    // NAIL 에는 jua 를 반복
    for (let i = 0; i < 3; i++) await P.learn(obs([fontTo('jua')], { memoryId: 'm4', context: NAIL }));
    const best = await P.resolve('font', NAIL);
    expect(best.value).toBe('jua');
    expect(best.via).toBe('exact');
  });
  test('exact 가 없으면 fallback — 단 confidence 를 낮춰서 준다', async () => {
    const { P } = load(5, memBackend());
    await P.learn(obs([fontTo('gamja')], { memoryId: 'm1', context: HAIR }));
    await P.learn(obs([fontTo('gamja')], { memoryId: 'm2', context: { service: '속눈썹', photoCount: 3, kind: 'service' } }));
    await P.learn(obs([fontTo('gamja')], { memoryId: 'm3', context: { service: '왁싱', photoCount: 1, kind: 'service' } }));
    const r = await P.resolve('font', { service: '처음보는시술', photoCount: 1, kind: 'service' });
    expect(r).toBeTruthy();
    expect(r.value).toBe('gamja');
    expect(r.via).toBe('global');
    expect(r.confidence).toBeLessThan(r.rawConfidence);   // fallback 감쇠
  });
  test('아무 근거도 없으면 null', async () => {
    const { P } = load(5, memBackend());
    expect(await P.resolve('font', NAIL)).toBeNull();
  });
});

describe('[T8-C 7] 이벤트/임시 오염 방지', () => {
  test('promotion kind 작업은 style preference 를 오염시키지 않는다', async () => {
    const { P } = load(5, memBackend());
    for (let i = 0; i < 5; i++) {
      await P.learn(obs([fontTo('pen')], { context: { service: '젤네일', photoCount: 1, kind: 'promotion' } }));
    }
    // service context 로 물어보면 이벤트 취향이 안 새어나온다
    expect(await P.resolve('font', NAIL)).toBeNull();
  });
  test('text_changed 는 style preference 대상이 아니다(T5 소관)', async () => {
    const { P } = load(5, memBackend());
    await P.learn(obs([{ event: 'text_changed', layerKey: 'title' }]));
    expect(await P.list()).toHaveLength(0);
  });
});

describe('[T8-C 13·14] 멱등 + rollback', () => {
  test('같은 observationId 재학습 → preference 1회만 반영', async () => {
    const { P } = load(5, memBackend());
    const o = obs([fontTo('jua')]);
    await P.learn(o); await P.learn(o); await P.learn(o);
    expect((await P.list()).find((x) => x.value === 'jua').sampleCount).toBe(1);
  });
  test('rollback → 이전 preference 복구', async () => {
    const { P, S } = load(5, memBackend());
    await P.learn(obs([fontTo('jua')]));
    const v = await S.pushVersion(await P.list(), 'before');
    await P.learn(obs([fontTo('gamja')]));
    expect((await P.list()).some((x) => x.value === 'gamja')).toBe(true);
    await S.rollback(v);
    const after = await P.list();
    expect(after.some((x) => x.value === 'jua')).toBe(true);
    expect(after.some((x) => x.value === 'gamja')).toBe(false);
  });
});

describe('[T8-C 12] tenant 격리', () => {
  test('A 의 preference 가 B 에 안 보인다', async () => {
    const b = memBackend();
    const A = load(5, b);
    for (let i = 0; i < 3; i++) await A.P.learn(obs([fontTo('jua')]));
    const B = load(9, b);
    expect(await B.P.list()).toHaveLength(0);
    expect(await B.P.resolve('font', NAIL)).toBeNull();
    await B.P.learn(obs([fontTo('gamja')]));
    const pos = (rows) => rows.filter((p) => p.positive > 0).map((p) => p.value);
    expect(pos(await B.P.list())).toEqual(['gamja']);
    const A2 = load(5, b);
    expect(pos(await A2.P.list())).toEqual(['jua']);   // A 는 자기 것만
  });
});

describe('[T8-C 10] 수치 상한/안정성', () => {
  test('장기 사용해도 positive/sample 이 폭주하지 않는다', async () => {
    const { P } = load(5, memBackend());
    for (let i = 0; i < 400; i++) await P.learn(obs([fontTo('jua')]));
    const p = (await P.list()).find((x) => x.value === 'jua');
    expect(p.positive).toBeLessThanOrEqual(P.MAX_COUNT);
    expect(p.sampleCount).toBeLessThanOrEqual(P.MAX_COUNT);
    expect(Number.isFinite(p.confidence)).toBe(true);
    expect(p.confidence).toBeLessThanOrEqual(1);
  });
});

describe('[T8-C 8] explainability', () => {
  test('왜 이 취향이 됐는지 역추적 필드가 다 있다', async () => {
    const { P } = load(5, memBackend());
    for (let i = 0; i < 3; i++) await P.learn(obs([fontTo('jua')]));
    const e = await P.explain('font', NAIL);
    expect(e).toMatchObject({ feature: 'font', value: 'jua' });
    ['contextKey', 'positive', 'negative', 'sampleCount', 'publishCount', 'undoCount',
      'consistency', 'recency', 'confidence', 'version'].forEach((k) => expect(e).toHaveProperty(k));
    expect(Array.isArray(e.evidence)).toBe(true);
    expect(e.evidence.length).toBeGreaterThan(0);
  });
});

describe('[T8-C 범위] T3 미개입', () => {
  test('scoreMemory 에 personalization 축이 아직 없다', () => {
    const eng = fs.readFileSync(path.join(__dirname, '..', 'work-memory-engine.js'), 'utf8');
    expect(eng).not.toMatch(/personalization/);
  });
});
