'use strict';

/* T8-D 골든 — decay / confidence 안정성. 구현보다 먼저 작성 (2026-08-20).

   D 의 목적은 공식을 복잡하게 만드는 게 아니라:
   **반복적·일관된 선호는 오래 유지 · 오래된/일회성 신호는 자연 약화 · 최근 행동으로 취향이 갑자기 뒤집히지 않음.**

   🔴 C 실측 문제(보스/GPT 지적): 현재 `1 - 0.6^n` 은 5회 0.92 · 10회 0.994 · **20회 1.000** 으로
   과도하게 빨리 포화돼 20회와 200회를 구분 못 한다. 자동화 강도로 쓰기 위험 → D 에서 재보정한다.

   개념 분리(계약):
     effectiveEvidence = Σ (weight × decay(age))     ← "오래된 증거의 무게"
     confidence        = f(effectiveEvidence, consistency, publish, recency)  ← "지금 얼마나 믿나"
   둘을 한 수식에 뒤섞지 않는다. now 는 **입력**으로 받아 순수 함수로 만든다(결정론).
   ❌ scoreMemory / personalization 은 여전히 미개입. */

const fs = require('fs');
const path = require('path');

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
  for (const f of ['work-memory-decay.js', 'work-memory-store.js', 'work-memory-preferences.js']) {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
  }
  if (backend) global.window.WMStore._setBackend(backend);
  return { D: global.window.WMDecay, P: global.window.WMPrefs, S: global.window.WMStore };
}
function memBackend() {
  const db = { preferences: new Map(), learning_signals: new Map(), preference_versions: new Map() };
  return {
    async put(s, r) { db[s].set(r.id, JSON.parse(JSON.stringify(r))); return r.id; },
    async get(s, id) { const v = db[s].get(id); return v ? JSON.parse(JSON.stringify(v)) : null; },
    async all(s) { return [...db[s].values()].map((v) => JSON.parse(JSON.stringify(v))); },
    async del(s, id) { db[s].delete(id); },
  };
}
const DAY = 86400000;
const NOW = 1800000000000;                       // 고정 기준 시각(결정론)
const ago = (d) => NOW - d * DAY;
const ev = (kind, ageDays) => ({ kind: kind, at: ago(ageDays) });

describe('[T8-D 3] decay curve — 단조 감소 · 이상 없음', () => {
  test('0/7/30/45/90/180일 가중치가 단조 감소하고 항상 (0,1]', () => {
    const { D } = load(5);
    const pts = [0, 7, 30, 45, 90, 180].map((d) => ({ d, w: D.weight(d) }));
    pts.forEach((p) => {
      expect(Number.isFinite(p.w)).toBe(true);
      expect(p.w).toBeGreaterThan(0);      // 음수·0 금지
      expect(p.w).toBeLessThanOrEqual(1);
    });
    for (let i = 1; i < pts.length; i++) expect(pts[i].w).toBeLessThan(pts[i - 1].w);
    expect(pts[0].w).toBe(1);              // 오늘 = 만점
  });
  test('[계약 5] 아주 오래돼도 0 으로 소멸하지 않는다(floor) — 반복 선호 유지의 근거', () => {
    const { D } = load(5);
    expect(D.weight(3650)).toBeGreaterThanOrEqual(D.FLOOR);
    expect(D.weight(3650)).toBeGreaterThan(0);
  });
});

describe('[T8-D 11] clock 이상값 방어', () => {
  test('future / 0 / null / 음수 / NaN 전부 안전', () => {
    const { D } = load(5);
    [D.decayAt(NOW + 30 * DAY, NOW), D.decayAt(0, NOW), D.decayAt(null, NOW),
      D.decayAt(-1, NOW), D.decayAt(NaN, NOW), D.decayAt(undefined, NOW)].forEach((w) => {
      expect(Number.isFinite(w)).toBe(true);
      expect(w).toBeGreaterThan(0);
      expect(w).toBeLessThanOrEqual(1);
    });
    expect(D.decayAt(NOW + 30 * DAY, NOW)).toBe(1);   // 미래 = 오늘로 클램프(시계 오차 방어)
  });
  test('at 이 falsy(0) 여도 "지금"으로 오인하지 않는다 — T8-B endedAt 버그의 재발 방지', () => {
    const { D } = load(5);
    expect(D.decayAt(0, NOW)).toBeLessThan(1);        // 1970 = 아주 오래된 것
    expect(D.decayAt(0, NOW)).toBeGreaterThanOrEqual(D.FLOOR);
  });
});

describe('[T8-D 1] 핵심 비교 — 18회 반복 + 최근 1회 > 2회 + 최근 1회', () => {
  test('반복 횟수가 많은 쪽이 effective evidence 가 크다', () => {
    const { D } = load(5);
    const many = []; for (let i = 0; i < 18; i++) many.push(ev('chosen', 10 + i));
    many.push(ev('chosen', 0));
    const few = [ev('chosen', 12), ev('chosen', 0)];
    const A = D.effective(many, NOW), B = D.effective(few, NOW);
    expect(A.pos).toBeGreaterThan(B.pos);
  });
});

describe('[T8-D 2·3·5] 최근성으로 취향이 뒤집히지 않는다 / 충분하면 추월된다', () => {
  test('🔴 지난 30회 JUA vs 최근 1회 GAMJA → JUA 우세 유지', () => {
    const { D } = load(5);
    const jua = []; for (let i = 0; i < 30; i++) jua.push(ev('chosen', 5 + i));
    const gamja = [ev('chosen', 0)];
    expect(D.effective(jua, NOW).pos).toBeGreaterThan(D.effective(gamja, NOW).pos);
  });
  test('최근 8회 GAMJA vs 오래된(180일+) 30회 JUA → GAMJA 가 추월 가능', () => {
    const { D } = load(5);
    const oldJua = []; for (let i = 0; i < 30; i++) oldJua.push(ev('chosen', 200 + i));
    const newGamja = []; for (let i = 0; i < 8; i++) newGamja.push(ev('chosen', i));
    expect(D.effective(newGamja, NOW).pos).toBeGreaterThan(D.effective(oldJua, NOW).pos);
  });
  test('[계약 4] 같은 횟수면 오래된 쪽이 약하다', () => {
    const { D } = load(5);
    const recent = []; for (let i = 0; i < 5; i++) recent.push(ev('chosen', i));
    const stale = []; for (let i = 0; i < 5; i++) stale.push(ev('chosen', 200 + i));
    expect(D.effective(stale, NOW).pos).toBeLessThan(D.effective(recent, NOW).pos);
  });
});

describe('[T8-D 7] 포화 — sample 이 늘어도 무한 증가하지 않는다', () => {
  test('10/20/50/100/200 회 confidence 는 증가하지만 포화하고 1 미만', () => {
    const { D } = load(5);
    const at = (n) => {
      const e = []; for (let i = 0; i < n; i++) e.push(ev('chosen', 1));
      const eff = D.effective(e, NOW);
      return D.confidence({ eff: eff, publishRate: 1, now: NOW, lastObservedAt: ago(1) }).confidence;
    };
    const c = [10, 20, 50, 100, 200].map(at);
    for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThan(c[i - 1]);   // 단조 증가
    expect(c[c.length - 1]).toBeLessThan(1);                                     // 1 도달 금지
    expect(c[c.length - 1]).toBeLessThanOrEqual(D.CONF_MAX);
    // 🔴 C 의 문제 재발 방지: 10회에 0.99 같은 과포화가 아니어야 한다
    expect(c[0]).toBeLessThan(0.8);
    // 증가폭이 갈수록 줄어든다(포화형)
    expect(c[4] - c[3]).toBeLessThan(c[1] - c[0]);
  });
});

describe('[T8-D 6·8] 상충 / sample≠confidence', () => {
  test('JUA 10 vs GAMJA 10 → 둘 다 confidence 낮음(선호 불명확)', () => {
    const { D } = load(5);
    const mk = (p, n) => {
      const e = [];
      for (let i = 0; i < p; i++) e.push(ev('chosen', i));
      for (let i = 0; i < n; i++) e.push(ev('replaced', i));
      return D.effective(e, NOW);
    };
    const tie = D.confidence({ eff: mk(10, 10), publishRate: 1, now: NOW, lastObservedAt: ago(0) }).confidence;
    const clear = D.confidence({ eff: mk(10, 0), publishRate: 1, now: NOW, lastObservedAt: ago(0) }).confidence;
    expect(tie).toBeLessThan(clear);
    expect(tie).toBeLessThan(0.5);
  });
  test('🔴 sample 50/50 (많음) < sample 20/0 (적지만 명확)', () => {
    const { D } = load(5);
    const mk = (p, n) => {
      const e = [];
      for (let i = 0; i < p; i++) e.push(ev('chosen', 1));
      for (let i = 0; i < n; i++) e.push(ev('replaced', 1));
      return D.confidence({ eff: D.effective(e, NOW), publishRate: 1, now: NOW, lastObservedAt: ago(1) }).confidence;
    };
    expect(mk(50, 50)).toBeLessThan(mk(20, 0));
  });
});

describe('[T8-D 9] 결정론 — now 를 입력으로 받는 순수 함수', () => {
  test('같은 입력·같은 now → 여러 번 계산해도 동일', () => {
    const { D } = load(5);
    const e = [ev('chosen', 0), ev('chosen', 30), ev('replaced', 90)];
    const r = [];
    for (let i = 0; i < 5; i++) {
      const eff = D.effective(e, NOW);
      r.push(D.confidence({ eff: eff, publishRate: 0.5, now: NOW, lastObservedAt: ago(0) }).confidence);
    }
    expect(new Set(r).size).toBe(1);
  });
  test('now 를 안 주면 Date.now() 로 동작하되 예외 없음', () => {
    const { D } = load(5);
    expect(Number.isFinite(D.effective([ev('chosen', 1)]).pos)).toBe(true);
  });
});

describe('[T8-D 13] explainability — 왜 이 confidence 인지', () => {
  test('구성요소가 전부 드러난다', () => {
    const { D } = load(5);
    const eff = D.effective([ev('chosen', 0), ev('chosen', 30), ev('replaced', 60)], NOW);
    ['pos', 'neg', 'rawPos', 'rawNeg', 'count'].forEach((k) => expect(eff).toHaveProperty(k));
    const c = D.confidence({ eff: eff, publishRate: 0.7, now: NOW, lastObservedAt: ago(0) });
    ['confidence', 'saturation', 'consistency', 'recencyWeight', 'publishWeight'].forEach((k) => expect(c).toHaveProperty(k));
    expect(c.rawPos ?? eff.rawPos).toBeGreaterThan(0);
  });
});

describe('[T8-D 10·12] 통합 — WMPrefs 가 decay 를 쓰고 계약이 유지된다', () => {
  test('preference 레코드에 decay 산출물이 남는다', async () => {
    const b = memBackend(); const { P } = load(5, b);
    const F = (v, f) => ({ event: 'font_changed', layerKey: 'title', before: f || 'pretendard', after: v, at: 0 });
    for (let i = 0; i < 3; i++) {
      await P.learn({ observationId: 'd' + i, memoryId: 'm', context: { service: '젤네일', photoCount: 1, kind: 'service' },
        outcome: 'published', signals: [F('jua')], baseline: [], startedAt: 0, endedAt: ago(i) });
    }
    const p = (await P.list()).find((x) => x.value === 'jua');
    ['decayedPositive', 'decayedNegative', 'saturation'].forEach((k) => expect(p).toHaveProperty(k));
    expect(p.decayedPositive).toBeGreaterThan(0);
    expect(p.confidence).toBeGreaterThan(0);
    expect(p.confidence).toBeLessThan(1);
  });
  test('context 별로 decay 가 섞이지 않는다', async () => {
    const b = memBackend(); const { P } = load(5, b);
    const F = (v) => ({ event: 'font_changed', layerKey: 'title', before: 'pretendard', after: v, at: 0 });
    const NAIL = { service: '젤네일', photoCount: 1, kind: 'service' };
    const HAIR = { service: '펌', photoCount: 2, kind: 'service' };
    // NAIL 은 최근, HAIR 는 아주 오래됨
    for (let i = 0; i < 3; i++) await P.learn({ observationId: 'n' + i, memoryId: 'm', context: NAIL, outcome: 'published', signals: [F('jua')], baseline: [], startedAt: 0, endedAt: ago(0) });
    for (let i = 0; i < 3; i++) await P.learn({ observationId: 'h' + i, memoryId: 'm', context: HAIR, outcome: 'published', signals: [F('jua')], baseline: [], startedAt: 0, endedAt: ago(300) });
    const all = await P.list();
    const nail = all.find((x) => x.value === 'jua' && x.contextKey.indexOf('젤네일') === 0);
    const hair = all.find((x) => x.value === 'jua' && x.contextKey.indexOf('펌') === 0);
    expect(nail.confidence).toBeGreaterThan(hair.confidence);   // 각자 자기 이력으로만 감쇠
  });
});

describe('[T8-D 14] 범위 제한', () => {
  /* ⚠️ migration note (2026-08-20, T8-E): 원래 이 테스트는
       "scoreMemory 에 personalization 축이 아직 없다" 였다.
     D 의 범위가 "preference model 안정성만, T3 미개입" 이었기 때문이다.
     T8-E 에서 bounded 가산 축으로 **의도적으로** 연결했으므로 그 단언은 수명을 다했다.
     의미를 없애지 않고 **D 가 실제로 지키려던 것**으로 바꾼다:
       기존 6축의 가중치·범위가 personalization 때문에 바뀌지 않았는가.
     상한·역전 금지 등 E 의 계약은 work-memory-persona.test.js 가 잠근다. */
  test('기존 6축 가중치·범위는 그대로다 (개인화는 순수 가산)', () => {
    const eng = fs.readFileSync(path.join(__dirname, '..', 'work-memory-engine.js'), 'utf8');
    expect(eng).toMatch(/photoFit:.*\? 40 : 0/);
    expect(eng).toMatch(/baFit:.*\? 25 : 0/);
    expect(eng).toMatch(/parts\.kindFit = 15/);
    expect(eng).toMatch(/parts\.kindFit = -30/);
    expect(eng).toMatch(/Math\.min\(m\.publishCount \|\| 0, 5\) \* 2/);
    expect(eng).toMatch(/Math\.min\(20, 20 - days \* 2\)/);
  });
});

describe('[T8-D 15] 갈린 context 는 global 로 덮지 않는다 (4패턴 실측에서 발견)', () => {
  test('jua/gamja 반반인 context → resolve 는 null (global fallback 금지)', async () => {
    const b = memBackend(); const { P } = load(5, b);
    const S = (v, prev) => ({ event: 'font_changed', layerKey: 'title', before: prev, after: v });
    const C = (s) => ({ service: s, photoCount: 1, kind: 'service' });
    let n = 0;
    const o = (svc, v, prev) => P.learn({ observationId: 'r' + (++n), memoryId: 'm' + (n % 5), context: C(svc),
      outcome: 'published', signals: [S(v, prev)], baseline: [], startedAt: 0, endedAt: ago(n % 30) });
    // 다른 3개 context 에서 jua 를 확실히 선호 → global 후보 성립
    for (const s of ['A', 'B', 'C']) for (let i = 0; i < 3; i++) await o(s, 'jua', 'pretendard');
    expect(await P.getGlobal('font')).not.toBeNull();
    // 겪어본 적 없는 context 는 global 로 대타 가능
    expect((await P.resolve('font', C('처음')))?.via).toBe('global');
    // 반반으로 갈린 context 는 → 제안 없음
    for (let i = 0; i < 6; i++) { await o('갈림', 'jua', 'gamja'); await o('갈림', 'gamja', 'jua'); }
    expect(await P.resolve('font', C('갈림'))).toBeNull();
  });
});
