/* 인스타 스타일 그룹핑 — 게시물을 비슷한 것끼리 묶는 규칙.  [2026-09-04]
 *
 * 여기서 지키는 것:
 *   · 같은 입력이면 늘 같은 결과 (결정적) — auto_key 가 흔들리면 재계산마다 그룹이 쌓인다
 *   · 학습 자격 없는 게시물(UI 격자·분석 실패)은 애초에 안 들어간다
 *   · 1~2장은 그룹으로 만들지 않는다 (우연을 습관이라 부르지 않는다)
 *   · 어느 원형에도 안 가까우면 억지로 붙이지 않는다
 *   · 대표 게시물은 '첫 번째' 가 아니라 **원형에 가장 가까운 것**
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadGrouping() {
  const win = { };
  const ctx = vm.createContext({ window: win, Math, JSON, Object, Array, String, Number, isFinite });
  ctx.globalThis = ctx;
  const src = fs.readFileSync(path.join(__dirname, '..', 'ig-style-grouping.js'), 'utf8');
  vm.runInContext(src, ctx);
  return win.IgStyleGrouping;
}

const G = loadGrouping();

/* 원형 좌표 위에 게시물을 만든다. jitter 로 살짝 흩어서 실제 분포를 흉내낸다. */
function post(id, archId, jitter = 0, extra = {}) {
  const a = G.ARCHETYPES.find((x) => x.id === archId);
  return Object.assign({
    media_id: id,
    eligibility: 'GENUINE',
    visual: {
      brightness: a.c.brightness + jitter,
      saturation: a.c.saturation + jitter,
      warmth: a.c.warmth + jitter * 0.5,
      contrast: 0.4,
      aspect: 0.8,
      palette: ['#EFE7E2', '#C9A88A']
    },
    text_style: { blocks: 1, alignment: 'center', position: 'lower-center', size_ratio: 0.07 }
  }, extra);
}

describe('그룹핑 기본', () => {
  test('같은 원형 3장 이상이면 그룹이 된다', () => {
    const r = G.group([post('a', 'white_clean'), post('b', 'white_clean'), post('c', 'white_clean')]);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].archetype).toBe('white_clean');
    expect(r.groups[0].media_ids).toEqual(['a', 'b', 'c']);
  });

  test('2장짜리는 그룹이 아니다 — 우연을 습관이라 부르지 않는다', () => {
    const r = G.group([post('a', 'white_clean'), post('b', 'white_clean')]);
    expect(r.groups).toHaveLength(0);
    expect(r.ungrouped.sort()).toEqual(['a', 'b']);
    expect(r.skipped.tooFew).toBe(2);
  });

  test('서로 다른 톤은 다른 그룹으로 갈린다', () => {
    const posts = [
      ...['w1', 'w2', 'w3'].map((i) => post(i, 'white_clean')),
      ...['d1', 'd2', 'd3', 'd4'].map((i) => post(i, 'deep_studio'))
    ];
    const r = G.group(posts);
    expect(r.groups).toHaveLength(2);
    // 큰 그룹이 먼저 — 원장 화면에서 대표 스타일이 위에 온다
    expect(r.groups[0].archetype).toBe('deep_studio');
    expect(r.groups[0].media_ids).toHaveLength(4);
  });

  test('결정적이다 — 같은 입력이면 auto_key 도 순서도 늘 같다', () => {
    const posts = [
      ...['w1', 'w2', 'w3'].map((i) => post(i, 'white_clean')),
      ...['b1', 'b2', 'b3'].map((i) => post(i, 'warm_brown'))
    ];
    const a = G.group(posts);
    const b = G.group(posts.slice().reverse());
    expect(a.groups.map((g) => g.auto_key)).toEqual(b.groups.map((g) => g.auto_key));
  });

  test('auto_key 는 버전 + 원형 id — 재계산해도 같은 그룹을 알아본다', () => {
    const r = G.group(['a', 'b', 'c'].map((i) => post(i, 'warm_brown')));
    expect(r.groups[0].auto_key).toBe(G.VERSION + ':warm_brown');
  });
});

describe('자격 없는 게시물은 안 들어간다', () => {
  test('UI 격자 캡처(CLEAR_UI)는 제외 — 원장 취향이 되면 안 된다', () => {
    const posts = ['a', 'b', 'c'].map((i) => post(i, 'white_clean'));
    posts.push(post('ui', 'white_clean', 0, { eligibility: 'CLEAR_UI' }));
    const r = G.group(posts);
    expect(r.groups[0].media_ids).not.toContain('ui');
    expect(r.skipped.notEligible).toBe(1);
  });

  test('분석 실패(NOT_ANALYZED)는 제외 — 실패를 성공처럼 세지 않는다', () => {
    const posts = ['a', 'b', 'c'].map((i) => post(i, 'white_clean'));
    posts.push(post('x', 'white_clean', 0, { eligibility: 'NOT_ANALYZED' }));
    const r = G.group(posts);
    expect(r.groups[0].media_ids).not.toContain('x');
    expect(r.skipped.notEligible).toBe(1);
  });

  test('색감이 없으면 묶을 수 없다 — 지어내지 않는다', () => {
    const r = G.group([
      ...['a', 'b', 'c'].map((i) => post(i, 'white_clean')),
      { media_id: 'novis', eligibility: 'GENUINE', visual: null }
    ]);
    expect(r.groups[0].media_ids).not.toContain('novis');
    expect(r.skipped.noVisual).toBe(1);
  });

  test('SUSPECT 는 버리지 않는다 — 실측에서 진짜 게시물이었다', () => {
    const posts = ['a', 'b', 'c'].map((i) => post(i, 'white_clean', 0, { eligibility: 'SUSPECT' }));
    expect(G.group(posts).groups).toHaveLength(1);
  });
});

describe('억지로 붙이지 않는다', () => {
  test('어느 원형에도 멀면 ungrouped', () => {
    const wild = {
      media_id: 'wild', eligibility: 'GENUINE',
      visual: { brightness: 0.02, saturation: 0.98, warmth: -0.6, aspect: 1, palette: [] }
    };
    const r = G.group([...['a', 'b', 'c'].map((i) => post(i, 'natural')), wild]);
    expect(r.ungrouped).toContain('wild');
    expect(r.skipped.tooFar).toBe(1);
  });

  test('빈 입력에서 그룹을 만들어내지 않는다', () => {
    expect(G.group([]).groups).toEqual([]);
    expect(G.group(null).groups).toEqual([]);
  });
});

describe('대표 게시물과 확신도', () => {
  test('대표는 첫 번째가 아니라 원형에 가장 가까운 것', () => {
    const posts = [
      post('far', 'white_clean', 0.05),    // 첫 번째지만 멀다
      post('near', 'white_clean', 0),      // 정중앙
      post('mid', 'white_clean', 0.02)
    ];
    const r = G.group(posts);
    expect(r.groups[0].cover_media_id).toBe('near');
  });

  test('흩어져 있으면 확신도가 낮다', () => {
    // jitter 는 같은 원형 안에 머무는 크기로 — 더 벌리면 다른 원형으로 넘어가서
    // '확신도가 낮다' 가 아니라 '그룹이 갈린다' 를 재게 된다(처음 이 테스트가 그랬다).
    const tight = G.group(['a', 'b', 'c'].map((i) => post(i, 'natural', 0)));
    const loose = G.group(['a', 'b', 'c'].map((i, n) => post(i, 'natural', 0.01 + n * 0.01)));
    expect(loose.groups).toHaveLength(1);
    expect(loose.groups[0].confidence).toBeLessThan(tight.groups[0].confidence);
  });

  test('확신도는 0~1 안에 있고 1.0 을 억지로 만들지 않는다', () => {
    const r = G.group(Array.from({ length: 12 }, (_, i) => post('p' + i, 'natural', 0)));
    const c = r.groups[0].confidence;
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThanOrEqual(1);
  });
});

describe('그룹 프로필', () => {
  test('색감은 중앙값, 팔레트는 빈도순(평균 아님)', () => {
    const posts = ['a', 'b', 'c'].map((i) => post(i, 'warm_brown'));
    posts[0].visual.palette = ['#FF0000', '#00FF00'];
    posts[1].visual.palette = ['#FF0000'];
    posts[2].visual.palette = ['#0000FF'];
    const p = G.group(posts).groups[0].profile;
    expect(p.visual.palette[0]).toBe('#FF0000');       // 2회로 최다
    expect(typeof p.visual.brightness).toBe('number');
  });

  test('글자 축은 60% 넘게 반복될 때만 채택 — 갈리면 비운다', () => {
    const posts = ['a', 'b', 'c'].map((i) => post(i, 'natural'));
    posts[0].text_style.alignment = 'left';
    posts[1].text_style.alignment = 'right';
    posts[2].text_style.alignment = 'center';
    const p = G.group(posts).groups[0].profile;
    expect(p.text.alignment).toBeNull();
  });

  test('같은 값이 반복되면 채택한다', () => {
    const posts = ['a', 'b', 'c'].map((i) => post(i, 'natural'));
    posts.forEach((p) => { p.text_style.alignment = 'left'; });
    expect(G.group(posts).groups[0].profile.text.alignment).toBe('left');
  });

  test('글자를 안 넣는 습관도 기록된다 (usageRate)', () => {
    const posts = ['a', 'b', 'c'].map((i) => post(i, 'natural'));
    posts.forEach((p) => { p.text_style.blocks = 0; });
    expect(G.group(posts).groups[0].profile.text.usageRate).toBe(0);
  });

  test('출처는 instagram_observed — 편집기 증거로 승격하지 않는다', () => {
    const r = G.group(['a', 'b', 'c'].map((i) => post(i, 'natural')));
    expect(r.groups[0].profile.source).toBe('instagram_observed');
  });
});

describe('실측 근거와 어긋나지 않는가', () => {
  /* category-prior.js 의 실측(27샵 162건)이 각 업종 평균을 갖고 있다.
     그 값을 넣었을 때 '납득 가능한' 원형으로 가는지 본다 — 임계값이 실측과 따로 놀면
     원장 사진이 전부 한 바구니에 들어가거나 전부 흩어진다. */
  const MEASURED = {
    hair: { brightness: 0.442, saturation: 0.283, warmth: 0.088 },
    waxing: { brightness: 0.616, saturation: 0.138, warmth: 0.071 },
    extension: { brightness: 0.548, saturation: 0.105, warmth: 0.019 },
    nail: { brightness: 0.544, saturation: 0.248, warmth: 0.139 }
  };

  test('헤어 실측(어둡고 고채도) → deep_studio', () => {
    expect(G._nearest(MEASURED.hair).arch.id).toBe('deep_studio');
  });
  test('왁싱 실측(밝고 저채도) → white_clean', () => {
    expect(G._nearest(MEASURED.waxing).arch.id).toBe('white_clean');
  });
  test('붙임머리 실측(저채도·중립) → chic_mono', () => {
    expect(G._nearest(MEASURED.extension).arch.id).toBe('chic_mono');
  });
  test('네일 실측(따뜻하고 채도 있음) → warm_brown', () => {
    expect(G._nearest(MEASURED.nail).arch.id).toBe('warm_brown');
  });

  test('실측 6업종은 전부 사거리 안에 든다 — 하나도 tooFar 가 아니어야', () => {
    Object.values(MEASURED).forEach((v) => {
      expect(G._nearest(v).dist).toBeLessThanOrEqual(G.MAX_DIST);
    });
  });
});
