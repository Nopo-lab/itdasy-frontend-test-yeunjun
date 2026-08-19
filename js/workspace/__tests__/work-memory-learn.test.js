'use strict';

/* T8-F 골든 — 학습 폐루프. 구현보다 먼저 작성 (2026-08-20).

     owner edit → observation batch → learn() → preference persistence → 다음 select()

   ── 가장 위험한 것: 자기강화 루프(preference runaway)
     자동적용 JUA → observer 가 JUA 감지 → "원장이 JUA 를 좋아함" 학습 → 더 강해짐 → 또 JUA...
     이걸 막는 게 이 티켓의 1순위다. T8-A 의 system/owner scope 를 **그대로** 써서
     system mutation(자동적용·복원·undo·마이그레이션)은 evidence 에 못 들어가게 잠근다.

   ── 언제 positive 를 주나 (계약)
     · 실제 publish 성공 후 최종 상태 = 가장 강한 positive
     · 자동적용을 그대로 두고 publish = positive (단, 원장이 '고른' 것보다 약하다)
     · 자동적용 후 크게 고쳐서 publish = **고친 방향**을 학습
     · undo = 강한 negative
     · cancel = strong positive 없음 — **baseline(자동적용) 유지분은 아예 증거로 안 센다**
       "열어보고 그냥 닫았다"는 취향의 증거가 아니다. 이게 A 케이스를 막는 핵심이다.

   ── fail-open
     학습이 실패해도 발행·편집은 성공한다. 학습은 publish critical path 밖에서 돈다. */

const fs = require('fs');
const path = require('path');

function load(userId, backend, keepLS) {
  global.window = {};
  global.window.ITDASY_WORK_MEMORY = true;
  global.location = { search: '' };
  const ls = keepLS || {};        // keepLS 를 주면 "재시작"(같은 기기·같은 localStorage) 을 흉내낸다
  global.localStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(ls, k) ? ls[k] : null; },
    setItem(k, v) { ls[k] = String(v); },
    removeItem(k) { delete ls[k]; },
  };
  if (userId != null) global.localStorage.setItem('last_user_id', String(userId));
  for (const f of ['work-memory.js', 'work-memory-signals.js', 'work-memory-decay.js',
    'work-memory-store.js', 'work-memory-preferences.js', 'work-memory-persona.js',
    'work-memory-learn.js', 'work-memory-engine.js']) {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
  }
  const w = global.window;
  if (backend) w.WMStore._setBackend(backend);
  return { S: w.WMSignals, St: w.WMStore, P: w.WMPrefs, L: w.WMLearn, E: w.WorkMemoryEngine, Pe: w.WMPersona, LS: global.localStorage, _ls: ls };
}
function memBackend() {
  const db = { preferences: new Map(), learning_signals: new Map(), preference_versions: new Map() };
  return {
    async put(s, r) { db[s].set(r.id, JSON.parse(JSON.stringify(r))); return r.id; },
    async get(s, id) { const v = db[s].get(id); return v ? JSON.parse(JSON.stringify(v)) : null; },
    async all(s) { return [...db[s].values()].map((v) => JSON.parse(JSON.stringify(v))); },
    async del(s, id) { db[s].delete(id); },
    _db: db,
  };
}
const NAIL = { service: '젤네일', photoCount: 1, kind: 'service' };
// 자동적용 결과 = baseline. _src:'wm' 는 "우리가 얹은 것" 표식(T4).
const autoBase = (font) => [{ type: 'text', role: null, text: '제목', font: { key: font }, color: '#111', align: 'center', _src: 'wm' }];
const ownBase = (font) => [{ type: 'text', role: null, text: '제목', font: { key: font }, color: '#111', align: 'center' }];

async function session(L, S, o) {
  S.begin({ memoryId: o.memoryId || 'mem1', context: o.context || NAIL, baseline: o.baseline || [] });
  (o.edits || []).forEach((e) => S.note(e.event, e));
  L.hold({ undone: !!o.undone });
  return L.commit(o.outcome || 'cancelled', o.key || null);
}
const fontOf = async (P, v) => (await P.list()).filter((p) => p.feature === 'font' && p.value === v)[0] || null;

describe('[T8-F A] 🔴 자동 적용만 반복 → preference 증가 0 (runaway 방지)', () => {
  test('열고 아무것도 안 하고 닫으면(cancel) 자동적용 값은 증거가 아니다', async () => {
    const b = memBackend(); const { S, P, L } = load(5, b);
    for (let i = 0; i < 10; i++) await session(L, S, { key: 'k' + i, baseline: autoBase('jua'), outcome: 'cancelled' });
    expect(await fontOf(P, 'jua')).toBeNull();
    expect((await P.list()).length).toBe(0);
  });
  test('자동적용 레이어를 손대지 않았으면 signal 도 0 이다', async () => {
    const b = memBackend(); const { S, L } = load(5, b);
    S.begin({ memoryId: 'm', context: NAIL, baseline: autoBase('jua') });
    L.hold({});
    const obs = L.pending();
    expect(obs.signals.length).toBe(0);
    await L.commit('cancelled');
  });
});

describe('[T8-F 복원/시스템] system mutation 은 학습되지 않는다', () => {
  test('복원(_restoreLayers 스코프) 중의 변경은 signal 로 안 들어간다', async () => {
    const b = memBackend(); const { S, P, L } = load(5, b);
    S.begin({ memoryId: 'm', context: NAIL, baseline: autoBase('jua') });
    S.system(function () {
      S.note('font_changed', { layerKey: 'title', before: 'jua', after: 'gamja' });
      S.note('color_changed', { layerKey: 'title', before: '#111', after: '#e11' });
    });
    L.hold({});
    await L.commit('published', 'kx');
    expect(await fontOf(P, 'gamja')).toBeNull();
  });
  test('undo 로 통째 되돌린 세션 → 그 값에 강한 negative', async () => {
    const b = memBackend(); const { S, P, L } = load(5, b);
    await session(L, S, { key: 'u1', baseline: autoBase('jua'), undone: true, outcome: 'published' });
    const p = await fontOf(P, 'jua');
    expect(p).not.toBeNull();
    expect(p.negative).toBeGreaterThan(0);
    expect(p.positive).toBe(0);
    expect(p.undoCount).toBe(1);
  });
});

describe('[T8-F B·C] 원장이 고친 방향을 학습 / publish 가 가장 강한 positive', () => {
  test('자동 JUA → 원장이 매번 GAMJA 로 변경 + 발행 → GAMJA 가 올라간다', async () => {
    const b = memBackend(); const { S, P, L } = load(5, b);
    for (let i = 0; i < 10; i++) {
      await session(L, S, { key: 'g' + i, baseline: autoBase('jua'), outcome: 'published',
        edits: [{ event: 'font_changed', layerKey: 'title', before: 'jua', after: 'gamja' }] });
    }
    const g = await fontOf(P, 'gamja'), j = await fontOf(P, 'jua');
    expect(g.positive).toBeGreaterThan(0);
    expect(g.sampleCount).toBe(10);
    expect(j.negative).toBeGreaterThan(0);          // 교체당한 쪽은 negative
    expect(g.confidence).toBeGreaterThan(j.confidence);
  });
  test('같은 수정이라도 publish 가 cancel 보다 강하다', async () => {
    const mk = async (outcome) => {
      const b = memBackend(); const { S, P, L } = load(5, b);
      await session(L, S, { key: 'x', baseline: autoBase('jua'), outcome: outcome,
        edits: [{ event: 'font_changed', layerKey: 'title', before: 'jua', after: 'gamja' }] });
      return (await fontOf(P, 'gamja')).positive;
    };
    expect(await mk('published')).toBeGreaterThan(await mk('cancelled'));
  });
  test('🔴 cancel 은 strong positive 를 만들지 않는다 — baseline 유지분 무시', async () => {
    const b = memBackend(); const { S, P, L } = load(5, b);
    await session(L, S, { key: 'c1', baseline: ownBase('jua'), outcome: 'cancelled',
      edits: [{ event: 'color_changed', layerKey: 'title', before: '#111', after: '#e11' }] });
    expect(await fontOf(P, 'jua')).toBeNull();      // 안 건드린 폰트는 증거 아님
    const c = (await P.list()).filter((p) => p.feature === 'color')[0];
    expect(c.positive).toBe(1);                     // 실제로 바꾼 것만, 약하게
  });
  test('자동적용 그대로 publish → positive 이되, 원장이 직접 고른 것보다 약하다', async () => {
    const b1 = memBackend(); const s1 = load(5, b1);
    await session(s1.L, s1.S, { key: 'a', baseline: autoBase('jua'), outcome: 'published' });
    const kept = (await fontOf(s1.P, 'jua')).positive;

    const b2 = memBackend(); const s2 = load(5, b2);
    await session(s2.L, s2.S, { key: 'b', baseline: ownBase('nanum'), outcome: 'published',
      edits: [{ event: 'font_changed', layerKey: 'title', before: 'nanum', after: 'jua' }] });
    const chosen = (await fontOf(s2.P, 'jua')).positive;

    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(chosen);              // 안 건드린 것 < 직접 고른 것
  });
  test('원장 소유 레이어를 그대로 두고 publish → 자동적용 유지보다 강하다', async () => {
    const mk = async (base) => {
      const b = memBackend(); const { S, P, L } = load(5, b);
      await session(L, S, { key: 'k', baseline: base, outcome: 'published' });
      return (await fontOf(P, 'jua')).positive;
    };
    expect(await mk(ownBase('jua'))).toBeGreaterThan(await mk(autoBase('jua')));
  });
});

describe('[T8-F F] 중복 방지 — 하나의 publish → learn 1회', () => {
  test('같은 key 로 여러 번 commit 해도 1회만 반영', async () => {
    const b = memBackend(); const { S, P, L } = load(5, b);
    S.begin({ memoryId: 'm', context: NAIL, baseline: autoBase('jua') });
    S.note('font_changed', { layerKey: 'title', before: 'jua', after: 'gamja' });
    L.hold({});
    const r1 = await L.commit('published', 'pub-1');
    const r2 = await L.commit('published', 'pub-1');
    const r3 = await L.commit('published', 'pub-1');
    expect(r1).toBe(true); expect(r2).toBe(false); expect(r3).toBe(false);
    expect((await fontOf(P, 'gamja')).sampleCount).toBe(1);
  });
  test('세션 없이 commit 해도 안전(발행 콜백이 먼저 온 경우)', async () => {
    const b = memBackend(); const { P, L } = load(5, b);
    expect(await L.commit('published', 'orphan')).toBe(false);
    expect((await P.list()).length).toBe(0);
  });
  test('reload 를 넘겨도 같은 observation 은 두 번 학습되지 않는다', async () => {
    const b = memBackend(); const s1 = load(5, b);
    const sharedLS = s1._ls;
    s1.S.begin({ memoryId: 'm', context: NAIL, baseline: autoBase('jua') });
    s1.S.note('font_changed', { layerKey: 'title', before: 'jua', after: 'gamja' });
    s1.L.hold({});
    const obs = s1.L.pending();
    await s1.L.commit('published', 'pub-9');
    const ledger = global.localStorage.getItem('itdasy:wm_learn_done::5');
    expect(ledger).toContain(obs.observationId);
    // "재시작" — 같은 localStorage/backend 로 다시 로드해 같은 observation 재투입
    const s2 = load(5, b, sharedLS);
    expect(await s2.L.learnObservation(obs, 'published')).toBe(false);
    expect((await s1.P.list()).filter((p) => p.value === 'gamja')[0].sampleCount).toBe(1);
  });
});

describe('[T8-F G] tenant 분리', () => {
  test('계정 A 의 학습이 계정 B 로 새지 않는다', async () => {
    const b = memBackend(); const { S, P, L, LS } = load(5, b);
    await session(L, S, { key: 'a1', baseline: ownBase('nanum'), outcome: 'published',
      edits: [{ event: 'font_changed', layerKey: 'title', before: 'nanum', after: 'jua' }] });
    expect((await P.list()).length).toBeGreaterThan(0);
    LS.setItem('last_user_id', '77');                       // 계정 전환(퍼지 없이 최악의 경우)
    expect((await P.list()).length).toBe(0);
    await session(L, S, { key: 'b1', baseline: ownBase('nanum'), outcome: 'published',
      edits: [{ event: 'font_changed', layerKey: 'title', before: 'nanum', after: 'gamja' }] });
    const asB = await P.list();
    expect(asB.every((p) => p.value !== 'jua')).toBe(true);
    LS.setItem('last_user_id', '5');
    expect((await P.list()).some((p) => p.value === 'jua')).toBe(true);
    expect((await P.list()).every((p) => p.value !== 'gamja')).toBe(true);
  });
  test('로그아웃 상태에서는 관찰도 학습도 안 한다', async () => {
    const b = memBackend(); const { S, P, L, LS } = load(5, b);
    LS.removeItem('last_user_id');
    expect(S.begin({ memoryId: 'm', context: NAIL, baseline: ownBase('jua') })).toBeNull();
    L.hold({});
    expect(await L.commit('published', 'z')).toBe(false);
    LS.setItem('last_user_id', '5');
    expect((await P.list()).length).toBe(0);
  });
});

describe('[T8-F fail-open] 학습 실패가 발행·편집을 망가뜨리지 않는다', () => {
  test('IDB 가 통째로 던져도 commit 은 예외 없이 false 를 돌려준다', async () => {
    const bad = {
      async put() { throw new Error('QuotaExceededError'); },
      async get() { throw new Error('boom'); },
      async all() { throw new Error('boom'); },
      async del() { throw new Error('boom'); },
    };
    const { S, L } = load(5, bad);
    S.begin({ memoryId: 'm', context: NAIL, baseline: autoBase('jua') });
    S.note('font_changed', { layerKey: 'title', before: 'jua', after: 'gamja' });
    L.hold({});
    await expect(L.commit('published', 'p1')).resolves.toBe(false);
  });
  test('WMPrefs 가 없어도(미로드) 죽지 않는다', async () => {
    const b = memBackend(); const { S, L } = load(5, b);
    delete global.window.WMPrefs;
    S.begin({ memoryId: 'm', context: NAIL, baseline: autoBase('jua') });
    L.hold({});
    await expect(L.commit('published', 'p2')).resolves.toBe(false);
  });
  test('hold() 를 안 부르고 commit 해도 안전', async () => {
    const b = memBackend(); const { S, L } = load(5, b);
    S.begin({ memoryId: 'm', context: NAIL, baseline: autoBase('jua') });
    S.note('font_changed', { layerKey: 'title', before: 'jua', after: 'gamja' });
    await expect(L.commit('published', 'p3')).resolves.toBe(true);   // end() 를 알아서 부른다
  });
});

describe('[T8-F H] 🔴 폐루프 — 학습이 다음 select() 순위를 실제로 바꾼다', () => {
  test('GAMJA 로 10회 고쳐 발행 → GAMJA 기억이 1등이 된다', async () => {
    const b = memBackend(); const { S, P, L, E, Pe, LS } = load(5, b);
    const NOW = Date.now();
    const mem = (id, font) => ({
      id, schema: 2, sig: 's' + id, name: id, createdAt: NOW - 30 * 86400000, thumb: null, ratio: '4:5',
      layoutIdx: 0, photoCount: 1, layoutOrder: [], collageBg: null, collageGap: null, fitMode: null,
      layers: [{ type: 'text', text: '제목', x: .5, y: .2, size: .08, align: 'center', color: '#111', font: { key: font } }],
      shopStyleId: null, kind: 'service', applyCount: 0, lastAppliedAt: 0,
      publishCount: 2, lastPublishedAt: NOW - 3 * 86400000
    });
    LS.setItem('itdasy:work_memory:list', JSON.stringify([mem('A', 'jua'), mem('B', 'gamja')]));

    await Pe.warm(NOW);
    const before = E.select(NAIL);
    expect(before.memory.id).toBe('A');                       // 상황 동률 → id tie-break

    for (let i = 0; i < 10; i++) {
      await session(L, S, { key: 'loop' + i, baseline: autoBase('jua'), outcome: 'published',
        edits: [{ event: 'font_changed', layerKey: 'title', before: 'jua', after: 'gamja' }] });
    }
    await Pe.warm(NOW);
    const after = E.select(NAIL);
    expect(after.memory.id).toBe('B');                        // 학습이 순위를 뒤집었다
    expect(after.reason.parts.personalization).toBeGreaterThan(0);
    expect(after.reason.personalization.reason.some((r) => r.value === 'gamja')).toBe(true);
    expect((await P.list()).length).toBeGreaterThan(0);
  });
  test('반대로 자동 JUA 를 그대로 계속 발행하면 JUA 가 강화된다', async () => {
    const b = memBackend(); const { S, P, L } = load(5, b);
    for (let i = 0; i < 10; i++) await session(L, S, { key: 'keep' + i, baseline: autoBase('jua'), outcome: 'published' });
    const j = await fontOf(P, 'jua');
    expect(j.positive).toBeGreaterThan(0);
    expect(j.sampleCount).toBe(10);
    expect(j.confidence).toBeGreaterThan(0);
  });
});

describe('[T8-F 범위] 기존 계약 불변', () => {
  test('T3 6축 가중치·범위 무변경', () => {
    const eng = fs.readFileSync(path.join(__dirname, '..', 'work-memory-engine.js'), 'utf8');
    expect(eng).toMatch(/photoFit:.*\? 40 : 0/);
    expect(eng).toMatch(/baFit:.*\? 25 : 0/);
    expect(eng).toMatch(/parts\.kindFit = 15/);
    expect(eng).toMatch(/parts\.kindFit = -30/);
  });
  test('학습 모듈은 LLM·네트워크를 부르지 않는다', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'work-memory-learn.js'), 'utf8');
    expect(src).not.toMatch(/fetch\s*\(|apiFetch|XMLHttpRequest|generateContent/i);
  });
  test('발행 경로를 막지 않는다 — commit 은 await 없이 던져도 되는 형태', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'work-memory-learn.js'), 'utf8');
    expect(src).toMatch(/commitAsync|queueMicrotask|setTimeout/);
  });
});
