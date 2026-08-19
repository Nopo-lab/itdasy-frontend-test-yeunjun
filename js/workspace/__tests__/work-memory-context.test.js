'use strict';

/* T8-H 골든 — context parity. 구현보다 먼저 작성 (2026-08-20).

   🔴 P0 회귀 고정: 실제 사용자 경로에서 `WMSignals.begin({ context: {} })` 이 벌어졌다.
   flow 가 Editor.open 에 wmContext 를 안 넘겨서 학습된 취향에 **상황이 안 붙었다.**
   context 없는 개인화는 "학습은 되지만 잘못된 상황으로 새는 학습" 이라, 기능을 켜지 않는 편이 낫다.

   재발 방지의 핵심은 테스트 한 줄이 아니라 **구조**다:
   선택(select)과 학습(learn)이 **같은 canonical builder 하나**만 쓰게 만든다.
   두 곳에서 각자 ctx 를 조립하는 한, 언젠가 또 어긋난다(이미 두 번 어긋났다 — service 누락, context {}).

   ── 이 파일이 잠그는 것
   1. canonicalContext() 가 단일 진입점이고 필수 축을 **항상** 채운다.
   2. select 가 쓰는 ctx 와 learn 이 저장하는 ctx 의 **key 가 동일**하다.
   3. contextKey() 도 한 곳 소유 — prefs·persona 가 각자 만들지 않는다.
   4. 서비스는 canonical 하게 정규화하고, 못 알아내면 **추론하지 않고** 'unknown'. */

const fs = require('fs');
const path = require('path');

function load() {
  global.window = {};
  global.window.ITDASY_WORK_MEMORY = true;
  global.location = { search: '' };
  const ls = {};
  global.localStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(ls, k) ? ls[k] : null; },
    setItem(k, v) { ls[k] = String(v); },
    removeItem(k) { delete ls[k]; },
  };
  global.localStorage.setItem('last_user_id', '5');
  for (const f of ['work-memory.js', 'work-memory-decay.js', 'work-memory-store.js',
    'work-memory-preferences.js', 'work-memory-persona.js', 'work-memory-engine.js']) {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
  }
  const w = global.window;
  return { E: w.WorkMemoryEngine, P: w.WMPrefs, Pe: w.WMPersona, LS: global.localStorage };
}
const REQUIRED = ['photoCount', 'service', 'hasBeforeAfter', 'kind'];

describe('[T8-H 2] canonicalContext — 단일 진입점, 필수 축 항상 채움', () => {
  test('필수 축이 전부 있고 타입이 안정적이다', () => {
    const { E } = load();
    const c = E.canonicalContext({ photoCount: 2, service: '젤네일', hasBeforeAfter: true });
    REQUIRED.forEach((k) => expect(c[k]).toBeDefined());
    expect(typeof c.photoCount).toBe('number');
    expect(typeof c.service).toBe('string');
    expect(typeof c.hasBeforeAfter).toBe('boolean');
    expect(typeof c.kind).toBe('string');
  });
  test('🔴 빈 입력이어도 {} 가 아니라 채워진 canonical 을 돌려준다', () => {
    const { E } = load();
    [undefined, null, {}].forEach((raw) => {
      const c = E.canonicalContext(raw);
      REQUIRED.forEach((k) => expect(c[k]).toBeDefined());
      expect(c.service).toBe('unknown');       // 못 알아내면 추론하지 않고 unknown
      expect(c.kind).toBe('unknown');
      expect(c.photoCount).toBe(0);
      expect(c.hasBeforeAfter).toBe(false);
    });
  });
  test('결정론 — 같은 입력이면 항상 같은 결과', () => {
    const { E } = load();
    const raw = { photoCount: 1, service: ' 젤네일  아트 ', hasBeforeAfter: false };
    const out = [];
    for (let i = 0; i < 5; i++) out.push(JSON.stringify(E.canonicalContext(raw)));
    expect(new Set(out).size).toBe(1);
  });
});

describe('[T8-H 3] service canonicalization — 표시 문자열을 그대로 쓰지 않는다', () => {
  test('공백·대소문자·중복 구분자를 정규화한다', () => {
    const { E } = load();
    const k = (s) => E.canonicalContext({ service: s }).service;
    expect(k(' 젤네일 ')).toBe(k('젤네일'));
    expect(k('젤네일,  속눈썹')).toBe(k('젤네일, 속눈썹'));
    expect(k('GEL Nail')).toBe(k('gel nail'));
  });
  test('빈 값·공백·null 은 전부 unknown — 임의 추론 금지', () => {
    const { E } = load();
    ['', '   ', null, undefined].forEach((s) => expect(E.canonicalContext({ service: s }).service).toBe('unknown'));
  });
  test('서로 다른 시술은 서로 다른 key 를 갖는다', () => {
    const { E } = load();
    const a = E.contextKey(E.canonicalContext({ service: '젤네일', photoCount: 1 }));
    const b = E.contextKey(E.canonicalContext({ service: '속눈썹', photoCount: 1 }));
    expect(a).not.toBe(b);
  });
});

describe('[T8-H 2·22] 🔴 select ctx === learn ctx (parity)', () => {
  test('select 가 쓰는 ctx 와 학습에 저장하는 ctx 의 key 가 같다', () => {
    const { E, LS } = load();
    const raw = { photoCount: 2, service: '젤네일', hasBeforeAfter: true };
    LS.setItem('itdasy:work_memory:list', JSON.stringify([{
      id: 'm', schema: 2, sig: 'sm', name: 'm', createdAt: Date.now(), thumb: null, ratio: '4:5',
      layoutIdx: 7, photoCount: 2, layoutOrder: [], collageBg: null, collageGap: null, fitMode: null,
      layers: [{ type: 'text', text: 'x', font: { key: 'jua' }, color: '#111', align: 'center' }],
      shopStyleId: null, kind: 'service', applyCount: 0, lastAppliedAt: 0, publishCount: 1, lastPublishedAt: Date.now()
    }]));
    E.select(raw);
    const usedBySelect = E._lastContextKey;
    const learnCtx = E.canonicalContext(raw);
    expect(usedBySelect).toBe(E.contextKey(learnCtx));
  });
  test('canonicalContext 를 두 번 통과시켜도 key 가 안 변한다(멱등)', () => {
    const { E } = load();
    const once = E.canonicalContext({ photoCount: 1, service: '젤네일' });
    const twice = E.canonicalContext(once);
    expect(E.contextKey(twice)).toBe(E.contextKey(once));
  });
  test('contextKey 는 한 곳이 소유한다 — prefs·persona 가 각자 만들지 않는다', () => {
    const prefs = fs.readFileSync(path.join(__dirname, '..', 'work-memory-preferences.js'), 'utf8');
    const persona = fs.readFileSync(path.join(__dirname, '..', 'work-memory-persona.js'), 'utf8');
    // 엔진의 contextKey 를 쓰는지 (없을 때의 폴백은 허용하되, 우선 위임해야 한다)
    expect(prefs).toMatch(/WorkMemoryEngine[\s\S]{0,80}contextKey/);
    expect(persona).toMatch(/WorkMemoryEngine[\s\S]{0,80}contextKey/);
  });
  test('엔진이 만든 key 와 preference 레코드의 contextKey 가 실제로 일치한다', async () => {
    const { E, P } = load();
    const backend = (() => {
      const db = { preferences: new Map(), learning_signals: new Map(), preference_versions: new Map() };
      return { async put(s, r) { db[s].set(r.id, r); return r.id; }, async get(s, i) { return db[s].get(i) || null; },
        async all(s) { return [...db[s].values()]; }, async del(s, i) { db[s].delete(i); } };
    })();
    global.window.WMStore._setBackend(backend);
    const raw = { photoCount: 1, service: '젤네일', hasBeforeAfter: false };
    const ctx = E.canonicalContext(raw);
    await P.learn({ observationId: 'o1', memoryId: 'm', context: ctx, outcome: 'published',
      signals: [{ event: 'font_changed', layerKey: 'title', before: 'pretendard', after: 'jua' }],
      baseline: [], startedAt: 0, endedAt: Date.now() });
    const rec = (await P.list()).find((p) => p.value === 'jua');
    expect(rec.contextKey).toBe(E.contextKey(ctx));
  });
});

describe('[T8-H 22] 🔴 실제 플로우 배선 — context 가 비면 안 된다', () => {
  test('flow 가 Editor.open 에 canonical context 를 넘긴다', () => {
    const flow = fs.readFileSync(path.join(__dirname, '..', 'workspace-v2-flow.js'), 'utf8');
    const i = flow.indexOf('wmContext:');
    expect(i).toBeGreaterThan(-1);
    expect(flow.slice(i, i + 300)).toMatch(/canonicalContext/);
  });
  test('편집기가 begin 에 넘기는 context 는 opts.wmContext 그대로다 — 중간에 {} 로 안 죽는다', () => {
    const ed = fs.readFileSync(path.join(__dirname, '..', '..', 'itd-editor', 'itd-editor.js'), 'utf8');
    expect(ed).toMatch(/WMSignals\.begin\(\{[^}]*context:\s*opts\.wmContext/);
  });
  test('빈 context 로 학습하면 상황이 뭉개진다 — 그래서 canonical 이 필요하다(회귀 근거)', () => {
    const { E } = load();
    const empty = E.contextKey({});
    const nail = E.contextKey(E.canonicalContext({ service: '젤네일', photoCount: 1 }));
    const perm = E.contextKey(E.canonicalContext({ service: '펌', photoCount: 2 }));
    expect(nail).not.toBe(empty);
    expect(perm).not.toBe(empty);
    expect(nail).not.toBe(perm);
  });
});

describe('[T8-H 5] 사진 장수 분리', () => {
  test('1장 / 2장 / 3장 / before-after 가 각각 다른 key', () => {
    const { E } = load();
    const k = (o) => E.contextKey(E.canonicalContext(Object.assign({ service: '젤네일' }, o)));
    const keys = [k({ photoCount: 1 }), k({ photoCount: 2 }), k({ photoCount: 3 }),
      k({ photoCount: 2, hasBeforeAfter: true })];
    expect(new Set(keys).size).toBe(4);
  });
  test('before/after 는 사진 수가 같아도 다른 상황이다', () => {
    const { E } = load();
    const plain = E.contextKey(E.canonicalContext({ service: '펌', photoCount: 2, hasBeforeAfter: false }));
    const ba = E.contextKey(E.canonicalContext({ service: '펌', photoCount: 2, hasBeforeAfter: true }));
    expect(plain).not.toBe(ba);
  });
});

describe('[T8-H 4·7] kind 분리 / 텍스트 내용과 스타일 분리', () => {
  test('service / promotion / notice 가 각각 다른 key', () => {
    const { E } = load();
    const k = (kind) => E.contextKey(E.canonicalContext({ service: '젤네일', photoCount: 1, kind: kind }));
    expect(new Set([k('service'), k('promotion'), k('notice')]).size).toBe(3);
  });
  test('kind 는 텍스트 분류(T5 dynamic/static)와 다른 개념이다 — promotion 글에도 static 문구가 있을 수 있다', () => {
    const { E } = load();
    const c = E.canonicalContext({ service: '', photoCount: 1, texts: ['새해 이벤트 50% 할인'] });
    expect(c.kind).toBe('promotion');
    expect(E.classifyText('예약문의 DM')).toBe('static');   // 둘은 독립
  });
  test('🔴 학습 저장소에 텍스트 원문이 복제되지 않는다 (T5 소관)', () => {
    const prefs = fs.readFileSync(path.join(__dirname, '..', 'work-memory-preferences.js'), 'utf8');
    expect(prefs).toMatch(/FEATURES\s*=\s*\{[^}]*font[^}]*color[^}]*align[^}]*\}/);
    expect(prefs).not.toMatch(/FEATURES\s*=\s*\{[^}]*text_changed:\s*'text'/);
  });
});

describe('[T8-H 23] raw data 안전 — 학습 저장소에 들어가면 안 되는 것', () => {
  test('canonicalContext 는 화이트리스트 축만 남긴다', () => {
    const { E } = load();
    const c = E.canonicalContext({
      photoCount: 1, service: '젤네일',
      customerName: '김민지', phone: '010-1234-5678', caption: '아주 긴 캡션'.repeat(50),
      token: 'eyJhbGciOi', photoUrl: 'data:image/png;base64,AAAA'
    });
    ['customerName', 'phone', 'caption', 'token', 'photoUrl'].forEach((k) => expect(c[k]).toBeUndefined());
    expect(Object.keys(c).sort()).toEqual(['hasBeforeAfter', 'kind', 'photoCount', 'service', 'shopStyleId'].sort());
  });
  test('service 가 아주 길어도 잘라서 저장한다(캡션 통째 유입 방지)', () => {
    const { E } = load();
    expect(E.canonicalContext({ service: 'ㄱ'.repeat(500) }).service.length).toBeLessThanOrEqual(64);
  });
});
