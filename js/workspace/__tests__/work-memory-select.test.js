'use strict';

/* T3 select() 골든 테스트 — 구현보다 먼저 작성 (2026-08-17).

   합격조건(보스/GPT 합의): 기존 테스트 무수정 유지 + 이 골든 전부 통과 +
   동일 입력 결정론 + 3경로 동일 + reason↔실제 점수 근거 일치 + 후보 0/필드 누락 안전.

   reason 은 장식 문구가 아니라 축별 숫자 분해다 — parts 합 === total 을 구조로 강제한다.
   ⚠️ photoFit(선택: 사진 수 적합)과 대표사진 점수(캡처: 어느 사진을 기억할지)는 다른 것 —
     GPT 2차 피드백에서 혼동됐던 지점. 둘 다 여기서 각각 역전 테스트로 잠근다. */

const fs = require('fs');
const path = require('path');

function loadAll(flagOn) {
  global.window = {};
  global.window.ITDASY_WORK_MEMORY = flagOn !== false;
  global.location = { search: '' };
  global.localStorage = {
    _m: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._m, k) ? this._m[k] : null; },
    setItem(k, v) { this._m[k] = String(v); },
    removeItem(k) { delete this._m[k]; },
  };
  for (const f of ['work-memory.js', 'work-memory-engine.js']) {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
  }
  return { WM: global.window.WorkMemory, E: global.window.WorkMemoryEngine, LS: global.localStorage };
}

const NOW = Date.now();
const DAY = 86400000;
// schema 2 레코드 직접 시드 — 카운터·시각을 정밀 제어(캡처 경유로는 못 만드는 조합).
function m2(id, over) {
  return Object.assign({
    id, schema: 2, sig: 'sig-' + id, name: id, createdAt: NOW - 30 * DAY, thumb: null,
    ratio: '4:5', layoutIdx: 0, photoCount: 1, layoutOrder: [], collageBg: null, collageGap: null, fitMode: null,
    layers: [{ type: 'sticker', emoji: '⭐', x: 0.5, y: 0.5, size: 0.1 }],
    shopStyleId: null, kind: 'unknown',
    applyCount: 0, lastAppliedAt: 0, publishCount: 1, lastPublishedAt: NOW - 30 * DAY,
  }, over || {});
}
function seed(LS, mems, favId) {
  LS._m['itdasy:work_memory:list'] = JSON.stringify(mems);
  if (favId) LS._m['itdasy:work_memory:default'] = JSON.stringify(favId);
}

describe('[1] 후보 0개 — 안전한 계약', () => {
  test('select → memory:null + 빈 candidates, forEditor → null, ctx 없음도 안전', () => {
    const { E } = loadAll();
    const r = E.select({ photoCount: 1 });
    expect(r.memory).toBeNull();
    expect(r.candidates).toEqual([]);
    expect(E.select()).toBeTruthy();                        // undefined ctx 도 안 던짐
    expect(E.forEditor({ restore: false, incoming: [], photoCount: 1 })).toBeNull();
  });
});

describe('[2] 후보 1개 + [15/16] reason = 축별 분해, 합계 일치', () => {
  test('reason.parts 합 === total === scoreMemory 재계산', () => {
    const { E, LS } = loadAll();
    seed(LS, [m2('a', { publishCount: 3, lastPublishedAt: NOW })]);
    const r = E.select({ photoCount: 1, kind: 'unknown' });
    expect(r.memory.id).toBe('a');
    const p = r.reason.parts;
    const sum = p.photoFit + p.baFit + p.kindFit + p.recency + p.publishWeight + p.brandFit;
    expect(sum).toBe(r.reason.total);
    const re = E.scoreMemory(r.memory, { photoCount: 1, kind: 'unknown' });
    expect(re.total).toBe(r.reason.total);                  // 재계산 일치 — reason 은 장식이 아니다
    expect(re.parts).toEqual(p);
  });
  test('축별 범위 잠금 — photoFit{0,40} baFit{0,25} kindFit{-30,0,15} recency 0..20 pub 0..10 brand{0,5}', () => {
    const { E } = loadAll();
    const cases = [
      m2('x', { photoCount: 4, layoutIdx: 7, kind: 'promotion', publishCount: 10000, lastPublishedAt: NOW + 1e9, shopStyleId: 'ss' }),
      m2('y', { photoCount: 1, kind: 'service', publishCount: 0, lastPublishedAt: 0, createdAt: 0 }),
    ];
    cases.forEach((m) => {
      [{ photoCount: 4, hasBeforeAfter: true, kind: 'service', shopStyleId: 'ss' }, { photoCount: 1, kind: 'promotion' }, {}].forEach((ctx) => {
        const { parts } = E.scoreMemory(m, ctx);
        expect([0, 40]).toContain(parts.photoFit);
        expect([0, 25]).toContain(parts.baFit);
        expect([-30, 0, 15]).toContain(parts.kindFit);
        expect(parts.recency).toBeGreaterThanOrEqual(0);
        expect(parts.recency).toBeLessThanOrEqual(20);
        expect(parts.publishWeight).toBeGreaterThanOrEqual(0);
        expect(parts.publishWeight).toBeLessThanOrEqual(10);
        expect([0, 5]).toContain(parts.brandFit);
      });
    });
  });
});

describe('[4/14] 우선순위 역전 — 가중치가 의도를 실제로 보장하는가', () => {
  test('photoFit(40) > 최근+자주+브랜드 합(20+10+5=35): 사진 수 맞는 옛 기억이 이긴다', () => {
    const { E, LS } = loadAll();
    seed(LS, [
      m2('old-fit', { photoCount: 3, lastPublishedAt: NOW - 60 * DAY, publishCount: 1 }),
      m2('hot-unfit', { photoCount: 1, lastPublishedAt: NOW, publishCount: 5, shopStyleId: 'ss' }),
    ]);
    const r = E.select({ photoCount: 3, shopStyleId: 'ss' });
    expect(r.memory.id).toBe('old-fit');                    // 40 > 0+20+10+5
  });
  test('promotion 감점(-30)이 최근(20)+자주(10)를 이긴다: 어제 이벤트가 오늘 시술에 안 뽑힘 (F)', () => {
    const { E, LS } = loadAll();
    seed(LS, [
      m2('event', { kind: 'promotion', lastPublishedAt: NOW, publishCount: 5 }),        // 40-30+20+10 = 40
      m2('daily', { kind: 'service', lastPublishedAt: NOW - 60 * DAY, publishCount: 1 }), // 40+15+0+2 = 57
    ]);
    const r = E.select({ photoCount: 1, kind: 'service' });
    expect(r.memory.id).toBe('daily');
  });
});

describe('[5] baFit — 전후 게시물엔 전후 기억', () => {
  test('둘 다 2장일 때 hasBeforeAfter=true 면 전/후(layoutIdx 7) 기억이 +25 로 승', () => {
    const { E, LS } = loadAll();
    seed(LS, [
      m2('grid2', { layoutIdx: 1, photoCount: 2 }),
      m2('ba2', { layoutIdx: 7, photoCount: 2 }),
    ]);
    expect(E.select({ photoCount: 2, hasBeforeAfter: true }).memory.id).toBe('ba2');
    // 전후가 아니면 가점 없음 → 동점 → tie-break(id 사전순)
    expect(E.select({ photoCount: 2, hasBeforeAfter: false }).memory.id).toBe('ba2');   // 'ba2' < 'grid2'
  });
});

describe('[6] kindFit 가점 + [분류기] classifyKind', () => {
  test('같은 성격 +15 / promotion→service -30 / unknown 은 중립', () => {
    const { E } = loadAll();
    expect(E.scoreMemory(m2('a', { kind: 'service' }), { kind: 'service' }).parts.kindFit).toBe(15);
    expect(E.scoreMemory(m2('a', { kind: 'promotion' }), { kind: 'service' }).parts.kindFit).toBe(-30);
    expect(E.scoreMemory(m2('a', { kind: 'unknown' }), { kind: 'service' }).parts.kindFit).toBe(0);
    expect(E.scoreMemory(m2('a', { kind: 'promotion' }), { kind: 'unknown' }).parts.kindFit).toBe(0);
    expect(E.scoreMemory(m2('a', { kind: 'promotion' }), {}).parts.kindFit).toBe(0);
  });
  test('분류: 이벤트/%/쿠폰=promotion · 휴무=notice · 시술명=service · 그 외=unknown, 확신 없으면 unknown', () => {
    const { E } = loadAll();
    expect(E.classifyKind(['8월 이벤트'], '볼륨매직')).toBe('promotion');   // 시술명 있어도 이벤트 우선
    expect(E.classifyKind(['첫 방문 20%'], '')).toBe('promotion');
    expect(E.classifyKind(['여름 휴무 안내'], '')).toBe('notice');
    expect(E.classifyKind([], '속눈썹 연장')).toBe('service');
    expect(E.classifyKind(['예쁘게 완성'], '')).toBe('unknown');
  });
  test('한글 왼쪽 경계 — 단어 일부(대할인)는 promotion 으로 안 잡는다', () => {
    const { E } = loadAll();
    // node(lookbehind 지원)에선 경계가 걸린다. 미지원 브라우저는 new RegExp 폴백으로 넓게 잡힘(보수적 허용).
    expect(E.classifyKind(['대할인마트 앞 2층'], '네일')).toBe('service');
  });
});

describe('[7/8] recency·publishWeight 극단값', () => {
  test('미래 시각 → 20 상한, 고대 → 0, publishCount 10000 → 10 상한', () => {
    const { E } = loadAll();
    expect(E.scoreMemory(m2('f', { lastPublishedAt: NOW + 1e9 }), {}).parts.recency).toBe(20);
    expect(E.scoreMemory(m2('o', { lastPublishedAt: NOW - 400 * DAY }), {}).parts.recency).toBe(0);
    expect(E.scoreMemory(m2('z', { lastPublishedAt: 0, createdAt: 0 }), {}).parts.recency).toBe(0);   // 시각 없음
    expect(E.scoreMemory(m2('p', { publishCount: 10000 }), {}).parts.publishWeight).toBe(10);
  });
});

describe('[9/19] brandFit + 저장된 photoCount 활용', () => {
  test('나머지 동일하면 활성 우리샵 스타일에서 만든 기억이 +5 로 승', () => {
    const { E, LS } = loadAll();
    seed(LS, [m2('other', { shopStyleId: 'ss-B' }), m2('mine', { shopStyleId: 'ss-A' })]);
    expect(E.select({ photoCount: 1, shopStyleId: 'ss-A' }).memory.id).toBe('mine');
  });
  test('photoFit 은 LAY_N 미러가 아니라 저장된 photoCount 를 읽는다', () => {
    const { E, LS } = loadAll();
    // layoutIdx 0(=미러로는 1장)이지만 캡처 시점 photoCount 4 로 저장된 기억 — 저장값이 이겨야 함
    seed(LS, [m2('stamped', { layoutIdx: 0, photoCount: 4 }), m2('single', { layoutIdx: 0, photoCount: 1 })]);
    expect(E.select({ photoCount: 4 }).memory.id).toBe('stamped');
  });
});

describe('[10/17/20] 결정론 — 동점·반복·후보 다수', () => {
  test('완전 동점 → 최근 손댄 순 → id 사전순, 반복해도 동일', () => {
    const { E, LS } = loadAll();
    const t = NOW - 3 * DAY;
    seed(LS, [m2('bb', { lastPublishedAt: t }), m2('aa', { lastPublishedAt: t })]);
    const r1 = E.select({ photoCount: 1 });
    const r2 = E.select({ photoCount: 1 });
    expect(r1.memory.id).toBe('aa');                        // 완전 동점 → id 사전순
    expect(JSON.stringify(r1.candidates)).toBe(JSON.stringify(r2.candidates));
  });
  test('50개 후보, 시드 순서를 섞어도 같은 승자', () => {
    const build = (order) => {
      const { E, LS } = loadAll();
      const mems = order.map((i) => m2('m' + String(i).padStart(2, '0'), {
        photoCount: (i % 4) + 1, publishCount: (i % 7), lastPublishedAt: NOW - (i % 15) * DAY,
      }));
      seed(LS, mems);
      return E.select({ photoCount: 3 }).memory.id;
    };
    const asc = Array.from({ length: 50 }, (_, i) => i);
    const desc = asc.slice().reverse();
    expect(build(asc)).toBe(build(desc));
  });
});

describe('[11/12] 필드 누락·구버전 후보 안전', () => {
  test('layers 만 있는 깡통 + schema 1 레코드 섞여도 점수 계산이 안 죽는다', () => {
    const { E, LS } = loadAll();
    LS._m['itdasy:work_memory:list'] = JSON.stringify([
      { id: 'bare', layers: [{ type: 'sticker', emoji: '⭐', x: 0.5, y: 0.5, size: 0.1 }] },
      { id: 'v1', schema: 1, ratio: '4:5', layoutIdx: 4, useCount: 3, lastUsedAt: NOW - DAY, createdAt: NOW - 9 * DAY, layers: [{ type: 'sticker', emoji: '🌙', x: 0.2, y: 0.2, size: 0.1 }] },
    ]);
    const r = E.select({ photoCount: 4 });
    expect(r.candidates).toHaveLength(2);
    expect(r.memory.id).toBe('v1');                         // 마이그레이션된 photoCount 4 = photoFit 40
  });
});

describe('[13] 대표 사진 점수 — 여러 장 중 가장 공들인 장을 기억 (G3)', () => {
  const richLayers = [
    { type: 'text', role: 'title', text: '볼륨매직', x: 0.5, y: 0.2, size: 0.06, align: 'center' },
    { type: 'sticker', emoji: '✨', x: 0.2, y: 0.2, size: 0.1 },
    { type: 'line', x: 0.5, y: 0.5, size: 0.3 },
  ];
  const es = (layers) => ({ v: 1, layoutIdx: 0, ratio: '4:5', layoutOrder: [], cellCrop: [], adj: [], photoDraw: {}, photoBg: {}, photos: ['x'], layers });
  test('2번째 장이 더 꾸며졌으면(스토리편집·hero·레이어 수) 그 장을 캡처', () => {
    const { WM } = loadAll();
    const rec = WM.captureFromSlot({
      id: 's', service: '펌',
      photos: [
        { editState: es([{ type: 'sticker', emoji: '⭐', x: 0.5, y: 0.5, size: 0.1 }]) },
        { role: 'hero', storyEdited: true, editState: es(richLayers) },
      ],
    }, {});
    expect(rec.layers).toHaveLength(3);                     // 1번째(1레이어)가 아니라 2번째(3레이어)
  });
  test('동점이면 앞 순서(기존 동작 보존)', () => {
    const { WM } = loadAll();
    const rec = WM.captureFromSlot({
      id: 's2', service: '펌',
      photos: [
        { editState: es([{ type: 'sticker', emoji: '1', x: 0.1, y: 0.1, size: 0.1 }]) },
        { editState: es([{ type: 'sticker', emoji: '2', x: 0.9, y: 0.9, size: 0.1 }]) },
      ],
    }, {});
    expect(rec.layers[0].emoji).toBe('1');
  });
});

describe('[18] 3경로 동일 — 편집기 / 헤드리스 / 잇비가 같은 기억을 고른다', () => {
  test('다수 후보에서도 세 경로 승자·레이어 동일', () => {
    const { WM, E, LS } = loadAll();
    seed(LS, [
      m2('loser', { photoCount: 2 }),
      m2('winner', { photoCount: 1, layers: [{ type: 'sticker', emoji: '🏆', x: 0.5, y: 0.5, size: 0.1 }] }),
    ]);
    const headless = E.decorateLayers([], { photoCount: 1 });
    const editor = E.forEditor({ restore: false, incoming: [], photoCount: 1, layersOnly: true });
    expect(headless.some((l) => l.emoji === '🏆')).toBe(true);
    expect(editor.layers.some((l) => l.emoji === '🏆')).toBe(true);
    void WM;
  });
  test('잇비(orch) 경로도 같은 선택 — 플래그 OFF 여도(명시 요청) 같은 승자', () => {
    const { E, LS } = loadAll(false);
    seed(LS, [
      m2('loser', { photoCount: 2 }),
      m2('winner', { photoCount: 1, layers: [{ type: 'sticker', emoji: '🏆', x: 0.5, y: 0.5, size: 0.1 }] }),
    ]);
    const orch = E.forEditor({ restore: false, orch: { useRecentStyle: true }, incoming: [], photoCount: 1, layersOnly: true });
    expect(orch.layers.some((l) => l.emoji === '🏆')).toBe(true);
  });
});

describe('선택 우선순위 — once > auto(select) > ★(auto OFF 시)', () => {
  test('applyOnce 가 select 승자보다 우선', () => {
    const { WM, E, LS } = loadAll();
    seed(LS, [
      m2('best', { photoCount: 1, lastPublishedAt: NOW, publishCount: 5 }),
      m2('once', { photoCount: 4, layers: [{ type: 'sticker', emoji: '1️⃣', x: 0.5, y: 0.5, size: 0.1 }] }),
    ]);
    WM.applyOnce('once');
    const st = E.forEditor({ restore: false, incoming: [], photoCount: 1, layersOnly: true });
    expect(st.layers.some((l) => l.emoji === '1️⃣')).toBe(true);
  });
  test('auto OFF → select 안 돌고 ★만 (T2 동작 보존)', () => {
    const { WM, E, LS } = loadAll();
    seed(LS, [
      m2('fav', { photoCount: 2, layers: [{ type: 'sticker', emoji: '⭐', x: 0.5, y: 0.5, size: 0.1 }] }),
      m2('fit', { photoCount: 1, layers: [{ type: 'sticker', emoji: '🎯', x: 0.5, y: 0.5, size: 0.1 }] }),
    ], 'fav');
    WM.setAutoOn(false);
    const st = E.forEditor({ restore: false, incoming: [], photoCount: 1, layersOnly: true });
    expect(st.layers.some((l) => l.emoji === '⭐')).toBe(true);   // 사진 수 안 맞아도 ★ (auto 꺼짐)
  });
  test('QA 역추적 — _lastSelect 에 via·후보 점수가 남는다', () => {
    const { E, LS } = loadAll();
    seed(LS, [m2('a'), m2('b', { photoCount: 3 })]);
    E.forEditor({ restore: false, incoming: [], photoCount: 3, layersOnly: true });
    expect(E._lastSelect.via).toBe('auto');
    expect(E._lastSelect.memoryId).toBe('b');
    expect(E._lastSelect.candidates.length).toBe(2);
  });
});
