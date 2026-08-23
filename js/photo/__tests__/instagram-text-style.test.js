/* 인스타 글자 습관 집계 — **한 장으로 취향을 정하지 않는지**를 잠근다.
 *
 * 이 프로젝트에서 반복된 실수가 "표본 하나를 취향으로 오독" 이었다
 * (Phase 0 의 center-75%, BrandKit 기본색). 인스타는 표본이 많아 보여서 더 위험하다 —
 * 한 게시물에 글자 덩어리가 5개면 그게 5표처럼 보인다.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const src = fs.readFileSync(path.join(ROOT, 'js/photo/instagram-text-style.js'), 'utf8');
const baseSrc = fs.readFileSync(path.join(ROOT, 'js/photo/shop-baseline.js'), 'utf8');

function load() {
  const win = {};
  new Function('window', src)(win);
  return win.InstagramTextStyle;
}
const IG = load();
const blk = (o) => Object.assign({ text: 'x', alignment: 'left', position: 'lower-left',
  color: '#FFFFFF', font_family_class: 'sans', font_weight: 'bold',
  size_ratio: 0.08, confidence: 0.8 }, o);
/* 🔴 `engine`/`confidence` 를 빠뜨리면 안 된다 — 실제 응답에 항상 있고,
   빠지면 '분석 실패'로 취급된다(429 때 서버가 HTTP 200 에 빈 결과를 주기 때문). */
const post = (blocks, o) => Object.assign({ text_blocks: blocks, composition: 'text_overlay',
  is_ui_screenshot: false, confidence: 0.8, engine: 'gemini' }, o);

describe('집계 — 반복될 때만 채택한다', () => {
  test('같은 값이 반복되면 습관으로 잡는다', () => {
    const r = IG._aggregate([post([blk()]), post([blk()]), post([blk()]), post([blk()])]);
    expect(r.align.value).toBe('left');
    expect(r.position.value).toBe('lower-left');
    expect(r.fontClass.value).toBe('sans');
    expect(r.enough).toBe(true);
  });

  test('🔑 갈리면 비워둔다 — 억지로 하나를 고르지 않는다', () => {
    const r = IG._aggregate([
      post([blk({ alignment: 'left' })]), post([blk({ alignment: 'center' })]),
      post([blk({ alignment: 'left' })]), post([blk({ alignment: 'center' })])
    ]);
    expect(r.align).toBeNull();          // 50:50 → 채택 안 함
  });

  test('표본이 적으면 enough=false', () => {
    expect(IG._aggregate([post([blk()]), post([blk()])]).enough).toBe(false);
  });

  test('확신도 낮은 덩어리는 뺀다', () => {
    const r = IG._aggregate([post([blk({ confidence: 0.2, alignment: 'right' })]),
      post([blk()]), post([blk()]), post([blk()])]);
    expect(r.align.value).toBe('left');   // 확신 0.2 짜리 right 는 무시
  });

  test('unknown 은 집계에서 뺀다 — 모르는 걸 표로 세지 않는다', () => {
    const r = IG._aggregate([post([blk({ font_family_class: 'unknown' })]),
      post([blk({ font_family_class: 'unknown' })]),
      post([blk({ font_family_class: 'serif' })]), post([blk({ font_family_class: 'serif' })])]);
    expect(r.fontClass.value).toBe('serif');
    expect(r.fontClass.posts).toBe(2);    // unknown 2장은 분모에도 안 들어간다
  });

  test('크기는 중앙값 — 한 장이 튀어도 안 끌려간다', () => {
    const r = IG._aggregate([post([blk({ size_ratio: 0.08 })]), post([blk({ size_ratio: 0.09 })]),
      post([blk({ size_ratio: 0.85 })]), post([blk({ size_ratio: 0.08 })])]);
    expect(r.sizeRatio.value).toBeLessThan(0.2);
  });
});

describe('🔑 UI 캡처를 습관으로 세지 않는다', () => {
  test('인스타 앱 화면 캡처는 통째로 제외', () => {
    const r = IG._aggregate([
      post([blk({ alignment: 'right' })], { is_ui_screenshot: true }),
      post([blk()]), post([blk()]), post([blk()]), post([blk()])
    ]);
    expect(r.postsAnalyzed).toBe(4);
    expect(r.counts.clearUi + r.counts.suspect).toBe(1);
    expect(r.align.value).toBe('left');
  });
});

describe('🔑 정확한 폰트명은 영원히 모른다', () => {
  test('fontExact 는 항상 UNKNOWN — 값으로 못박아 둔다', () => {
    const r = IG._aggregate([post([blk()]), post([blk()]), post([blk()]), post([blk()])]);
    expect(r.fontExact).toBe('UNKNOWN');
  });
  test('폰트 계열만 담는다 (편집기 폰트 키가 아니다)', () => {
    const r = IG._aggregate([post([blk({ font_family_class: 'serif' })]), post([blk({ font_family_class: 'serif' })]),
      post([blk({ font_family_class: 'serif' })]), post([blk({ font_family_class: 'serif' })])]);
    expect(['serif', 'sans', 'handwriting', 'display', 'monospace']).toContain(r.fontClass.value);
  });
});

describe('글자를 안 넣는 것도 습관이다', () => {
  test('textUsageRate 로 남긴다 — 안 쓰는 원장에게 얹으면 첫 되돌림이 된다', () => {
    const r = IG._aggregate([post([]), post([]), post([blk()]), post([blk()])]);
    expect(r.textUsageRate).toBe(0.5);
  });
});

describe('비용 — 같은 사진을 두 번 부르지 않는다', () => {
  test('해시는 내용 기반 (URL 아님 — 인스타 CDN 주소는 만료된다)', () => {
    const a = IG._hash(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    const b = IG._hash(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    const c = IG._hash(new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9, 9, 9]));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(src).not.toMatch(/_hash\(\s*url/);
  });

  test('한 번에 부르는 상한이 있다', () => {
    expect(IG.MAX_CALLS).toBeLessThanOrEqual(12);
    expect(src).toMatch(/list\.slice\(0, MAX_CALLS\)/);
  });

  test('편집 중에는 안 부른다 — build() 를 편집 경로가 호출하지 않는다', () => {
    const ed = fs.readFileSync(path.join(ROOT, 'js/itd-editor/itd-editor.js'), 'utf8');
    const plan = fs.readFileSync(path.join(ROOT, 'js/photo/edit-plan.js'), 'utf8');
    expect(ed).not.toMatch(/InstagramTextStyle/);
    expect(plan).not.toMatch(/InstagramTextStyle/);
  });

  test('IDB 캐시를 쓴다 (PhotoContext 와 같은 헬퍼)', () => {
    expect(src).toMatch(/window\.wmLearnGet/);
    expect(src).toMatch(/window\.wmLearnPut/);
  });

  test('🔴 인스타 필드는 thumb — thumbnail_url 로 가정했다가 12장을 흘린 적이 있다', () => {
    expect(src).toMatch(/m\.thumb \|\| m\.thumbnail_url \|\| m\.media_url/);
  });
});

describe('🔑 실제 Gemini 응답으로 검증한다 (mock 아님)', () => {
  /* 2026-08-23 실호출 6장의 **진짜 응답**이다. 합성 데이터로는 두 가지를 못 잡았다:
     · 응답이 thinking 토큰에 잘려 파서가 전부 실패하던 것
     · 모델이 'top-left'·'normal' 이라고 답하는데 우리 스키마가 좁아 버리던 것
     그래서 실제 응답을 골든으로 박아둔다 — 집계기가 진짜 모양을 견디는지 본다. */
  const REAL = require('./fixtures/real-gemini-responses.json');

  test('실제 응답 6건이 집계기를 통과한다', () => {
    const p = IG._aggregate(REAL);
    expect(p.postsAnalyzed).toBe(6);
    expect(p.blockCount).toBeGreaterThan(20);
    expect(p.enough).toBe(true);
  });

  test('안정적인 축은 값이 나온다 (실측: align·fontClass·size 100% 반환)', () => {
    const p = IG._aggregate(REAL);
    expect(p.align).not.toBeNull();
    expect(p.fontClass).not.toBeNull();
    expect(p.sizeRatio).not.toBeNull();
  });

  test('불안정한 축은 비워둔다 — 억지로 채우지 않는다', () => {
    const p = IG._aggregate(REAL);
    // 실제 응답에서 position 은 동의율이 낮았다(58% 반환 + 값이 갈림) → null 이 맞다
    expect(p.position === null || p.position.agree >= IG.MIN_AGREE).toBe(true);
    expect(p.color === null || p.color.agree >= IG.MIN_AGREE).toBe(true);
  });

  test('정확한 폰트명은 실제 응답에서도 UNKNOWN', () => {
    expect(IG._aggregate(REAL).fontExact).toBe('UNKNOWN');
  });
});

describe('🔴 한 게시물이 아닌 이미지는 학습에서 뺀다 (실호출 실측 기반)', () => {
  /* 실호출 4장 실측: `is_ui_screenshot` 은 **2/4** 밖에 못 맞혔다(놓침 1·오탐 1).
     반면 `composition` 은 **4/4** 정확했다 — 피드 화면 캡처는 둘 다 collage.
     collage 는 여러 게시물이 섞인 것이라, UI 캡처든 아니든 학습에서 빼는 게 맞다. */
  const E2E = require('./fixtures/real-gemini-http-e2e.json').map((e) => e.result);

  const R = (o) => Object.assign({ text_blocks: [], engine: 'gemini', confidence: 0.9,
    is_ui_screenshot: false, composition: 'text_overlay' }, o);

  test('collage 면 절대 학습 안 한다 — 실측에서 UI 격자 6/6 이 여기 걸렸다', () => {
    expect(IG._eligibility(R({ composition: 'collage' }))).toBe(IG.ELIG.CLEAR_UI);
    expect(IG._isNotSinglePost(R({ composition: 'collage' }))).toBe(true);
  });

  test('플래그만 켜지고 구도가 단일이면 SUSPECT — 실측 2건 모두 진짜 게시물이었다', () => {
    expect(IG._eligibility(R({ is_ui_screenshot: true }))).toBe(IG.ELIG.SUSPECT);
  });

  test('🔴 분석 실패(429)는 진짜 게시물로 통과시키지 않는다', () => {
    // 서버가 429 를 HTTP 200 + 빈 결과로 준다. 기본값이 is_ui_screenshot:false 라
    // 예전 코드는 **실패한 UI 격자를 진짜 게시물로** 통과시켰다(C_full 실측).
    const fail = { text_blocks: [], engine: 'error', confidence: 0, is_ui_screenshot: false,
      composition: 'unknown' };
    expect(IG._eligibility(fail)).toBe(IG.ELIG.NOT_ANALYZED);
    expect(IG._isNotSinglePost(fail)).toBe(true);
  });

  test('실제 게시물은 남긴다', () => {
    expect(IG._eligibility(R())).toBe(IG.ELIG.GENUINE);
    expect(IG._isNotSinglePost(R())).toBe(false);
  });

  /* 🔑 실호출 **2회차(총 8건)** 실측 — 프롬프트를 보강해도 `is_ui_screenshot` 은 두 번 다 2/4 였다.
     틀린 위치만 옮겨 다녔다. 즉 문구 문제가 아니라 **이 플래그 자체가 불안정하다.**
     그래서 정확도가 아니라 **비대칭 비용**으로 설계한다:
       피드 캡처를 학습에 넣으면 → 남의 게시물 스타일이 섞여 **학습이 오염된다** (치명적)
       진짜 게시물을 뺐으면    → 표본 하나를 잃을 뿐이다               (감수 가능)
     union(플래그 OR collage) 은 실측 8건에서 **UI 캡처 4/4 를 전부 걸렀다.** */
  const RUNS = [
    ['1회차', require('./fixtures/real-gemini-http-e2e.json')],
    ['2회차(프롬프트 보강 후)', require('./fixtures/real-gemini-http-e2e-v2.json')]
  ];

  test.each(RUNS)('%s — UI 캡처는 하나도 학습에 안 들어간다', (_label, run) => {
    const uiCaps = run.filter((e) => e.meta.kind === 'ui');
    expect(uiCaps.length).toBe(2);
    uiCaps.forEach((e) => expect(IG._isNotSinglePost(e.result)).toBe(true));
  });

  test.each(RUNS)('%s — 플래그 하나만 믿으면 UI 캡처가 새어 들어간다 (union 이 필요한 이유)', (_label, run) => {
    const leaked = run.filter((e) => e.meta.kind === 'ui' && !e.result.is_ui_screenshot);
    expect(leaked.length).toBeGreaterThan(0);        // 두 회차 모두 1건씩 샜다
    leaked.forEach((e) => expect(e.result.composition).toBe('collage'));
  });

});

describe('🔴 우선순위 — editor_observed 가 항상 이긴다', () => {
  test('편집기 증거가 있으면 인스타 관찰을 안 쓴다', () => {
    expect(baseSrc).toMatch(/out\.axes\.align = pAlign \? _axis\(pAlign\.value, 'editor_observed'/);
    // 인스타는 pAlign 이 없을 때만
    expect(baseSrc).toMatch(/_al \? _axis\(_al\.value, 'instagram_observed'/);
  });

  test('인스타 확신도는 editor_observed 를 못 이긴다', () => {
    expect(baseSrc).toMatch(/IGT_CONF = 0\.55/);
    expect(baseSrc).toMatch(/IGT_CONF \* IG_DECAY/);   // 0.55 × 0.6 = 0.33
  });

  test('폰트 계열은 편집기 폰트 키와 섞지 않는다 (별도 필드)', () => {
    expect(baseSrc).toMatch(/out\.axes\.fontClassHint/);
    // font 축에 계열을 직접 넣지 않는다
    expect(baseSrc).not.toMatch(/out\.axes\.font = .*igt\.fontClass/);
  });

  test('표본이 모자라면 인스타 관찰을 안 쓴다', () => {
    expect(baseSrc).toMatch(/a\.enough && a\.value != null/);
  });
});

describe('🔴 실제 샵 3곳 cold-start — 실호출 응답 그대로 (2026-08-23)', () => {
  /* 정답은 눈으로 붙였다: 격자 캡처 3장만 UI 이고 셀 18장은 **전부 진짜 게시물**이다.
     그중엔 인셋 사진이 붙은 콜라주형 게시물, 네이버 리뷰 캡처를 디자인에 넣은 게시물까지 있다.
     이 표본에서 실측한 값이 아래 숫자다 — 바뀌면 정책이 바뀐 것이다. */
  const ROWS = require('./fixtures/real-shop-coldstart.json');
  const shopOf = (t) => ROWS.filter((r) => r.meta.shop === t).map((r) => r.result);
  const AX = ['align', 'position', 'fontClass', 'fontWeight', 'color', 'sizeRatio'];

  test('UI 격자 캡처는 어느 샵에서도 학습에 안 들어간다 (오염 0)', () => {
    ROWS.filter((r) => r.meta.kind === 'full_grid').forEach((r) => {
      expect(IG._eligibility(r.result)).not.toBe(IG.ELIG.GENUINE);
    });
  });

  test('🔑 429 로 분석이 실패한 UI 격자도 통과 못 한다 — 예전엔 통과했다', () => {
    const failedGrid = ROWS.find((r) => r.meta.kind === 'full_grid' && r.result.engine !== 'gemini');
    expect(failedGrid).toBeTruthy();                       // C_full 이 실제로 429 로 실패했다
    expect(failedGrid.result.is_ui_screenshot).toBe(false); // 기본값이 false 라서 위험했다
    expect(IG._eligibility(failedGrid.result)).toBe(IG.ELIG.NOT_ANALYZED);
  });

  test('샵 A — 6장 전부 살아서 6축이 다 찬다 (실제 피드: 흰 고딕 굵은 글씨 좌하단)', () => {
    const p = IG._aggregate(shopOf('A'));
    expect(p.counts.genuine).toBe(6);
    expect(p.counts.clearUi).toBe(1);                      // 격자 캡처 1장만 빠졌다
    expect(p.enough).toBe(true);
    AX.forEach((k) => expect(p.axes[k].enough).toBe(true));
    expect(p.axes.color.value).toBe('#FFFFFF');
    expect(p.axes.align.value).toBe('left');
    expect(p.axes.position.value).toBe('lower-left');
  });

  test('샵 B — 절반이 빠져도(UI 2 · 실패 2) 남은 3장으로 프로필이 선다', () => {
    const p = IG._aggregate(shopOf('B'));
    expect(p.counts.genuine).toBe(3);
    expect(p.enough).toBe(true);
    AX.forEach((k) => expect(p.axes[k].enough).toBe(true));
  });

  test('🔑 샵 C — 429 로 6장이 실패하면 프로필을 만들지 않는다 (없는 걸 지어내지 않는다)', () => {
    const p = IG._aggregate(shopOf('C'));
    expect(p.counts.notAnalyzed).toBe(6);
    expect(p.counts.genuine).toBe(1);
    expect(p.enough).toBe(false);
    // 값 자체는 잡히지만 '쓸 수 있다'고 하지 않는다 — 이 구분이 핵심이다
    expect(p.axes.align.value).toBe('left');
    expect(p.axes.align.enough).toBe(false);
  });

  test('게시물 수별 — 3장부터 축이 열린다 (0~2장은 습관이라고 안 부른다)', () => {
    const cells = ROWS.filter((r) => r.meta.shop === 'A' && r.meta.kind === 'cell').map((r) => r.result);
    [0, 1, 2].forEach((n) => expect(IG._aggregate(cells.slice(0, n)).enough).toBe(false));
    [3, 4, 5, 6].forEach((n) => {
      const p = IG._aggregate(cells.slice(0, n));
      expect(p.enough).toBe(true);
      expect(AX.filter((k) => p.axes[k] && p.axes[k].enough).length).toBe(6);
    });
  });

  test('🔑 축은 따로 논다 — 색만 있고 폰트가 없으면 색만 쓴다', () => {
    const mk = (o) => post([blk(Object.assign({ font_family_class: 'unknown' }, o))]);
    const p = IG._aggregate([mk(), mk(), mk()]);
    expect(p.axes.color.enough).toBe(true);
    expect(p.axes.fontClass).toBeNull();                   // 폰트는 비워둔다
    expect(p.enough).toBe(true);                           // 그래도 프로필은 만든다
  });

  test('🔑 글자 많은 게시물 한 장이 축을 혼자 정하지 못한다 (게시물 단위 투표)', () => {
    const loud = post(Array.from({ length: 12 }, () => blk({ alignment: 'right' })));
    const quiet = [post([blk()]), post([blk()]), post([blk()])];   // left 3장
    const p = IG._aggregate([loud].concat(quiet));
    expect(p.axes.align.value).toBe('left');               // 12덩어리가 3장을 못 이긴다
    expect(p.axes.align.posts).toBe(4);
  });
});

describe('🔴 쿼터가 마르면 즉시 멈춘다 (실측 2026-08-23)', () => {
  /* 실제로 21장을 돌리다 8장째부터 429 가 났는데, 서버가 HTTP 200 을 주는 바람에
     클라이언트가 남은 13장을 계속 불렀다. Vertex 쿼터는 프로젝트 공용이라 그 낭비가 곧 운영 장애다. */
  test('build() 가 quota_exhausted 를 보면 남은 장을 안 부른다', async () => {
    const win = {};
    new Function('window', src)(win);
    let calls = 0;
    // 모듈 안에서 전역 fetch 를 쓴다(window.fetch 가 아니다) — 실제 로드 환경과 같게 맞춘다
    const realFetch = global.fetch;
    // 🔑 진짜 Blob 이어야 한다 — _analyze 가 FormData.append(file, blob, name) 을 쓰기 때문에
    //    가짜 객체를 주면 TypeError 가 나고 그게 조용히 삼켜진다(한참 헤맸다).
    global.fetch = () => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['xx'])) });
    win.apiFetch = () => {
      calls += 1;
      return Promise.resolve({ ok: true, json: () => Promise.resolve(
        calls >= 3
          ? { text_blocks: [], engine: 'error', confidence: 0, warnings: ['quota_exhausted'],
              is_ui_screenshot: false, composition: 'unknown' }
          : { text_blocks: [blk()], engine: 'gemini', confidence: 0.9,
              is_ui_screenshot: false, composition: 'text_overlay' }) });
    };
    const media = Array.from({ length: 12 }, (_, i) => ({ id: String(i), thumb: 'https://x/' + i }));
    const prof = await win.InstagramTextStyle.build(media);
    global.fetch = realFetch;
    expect(calls).toBe(3);                 // 12장이 아니라 3장에서 멈춘다
    expect(prof.quotaExhausted).toBe(true);
    expect(prof.counts.genuine).toBe(2);   // 이미 받은 2장으로 만들 수 있는 만큼만
  });

  test('실패한 분석은 결과에도 캐시에도 안 들어간다 — 캐시하면 쿼터가 풀려도 영영 빈 결과를 쓴다', () => {
    expect(src).toMatch(/if \(r\.status === 'FAILED' \|\| r\.engine !== 'gemini'\) return;/);
  });

  test('🔑 429 는 성공으로 삼키지 않는다 — 상태로 구분한다', () => {
    expect(src).toMatch(/r\.status === 429/);
    expect(src).toMatch(/status: 'RATE_LIMITED'/);
    expect(src).toMatch(/status: 'FAILED'/);
  });

  test('🔑 부분 반입 — 이미 성공한 장은 다시 안 부르고, 남은 장 수를 남긴다', () => {
    expect(src).toMatch(/prof\.pendingRetry =/);
    // 성공분만 캐시되므로 다음 동기화의 해시 조회가 그 장을 건너뛴다
    expect(src).toMatch(/_cachePut\(key, \{ version: SCHEMA, result: r/);
  });
});

describe('🔴 부분 반입 (§11) — 12장 중 7장 성공 후 429', () => {
  /* 요구: 성공 7장은 저장하고, 나머지 5장은 저장하지 않으며,
     다음 동기화에서 **실패한 5장만** 다시 시도할 수 있어야 한다. */
  function harness(failFrom) {
    const win = {};
    new Function('window', src)(win);
    const cache = {};
    win.wmLearnGet = (store, k) => Promise.resolve(cache[k] || null);
    win.wmLearnPut = (store, v) => { cache[v.id] = v; };
    let calls = 0;
    const realFetch = global.fetch;
    global.fetch = () => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) });
    win.apiFetch = () => {
      calls += 1;
      if (calls > failFrom) {
        return Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
        text_blocks: [blk()], engine: 'gemini', confidence: 0.9, status: 'OK',
        is_ui_screenshot: false, composition: 'text_overlay' }) });
    };
    return { win, cache, restore: () => { global.fetch = realFetch; }, calls: () => calls };
  }

  test('7장 성공 → 프로필은 만들되 실패분은 저장 안 함', async () => {
    const h = harness(7);
    // 🔑 사진마다 다른 바이트여야 해시가 갈린다 — 같으면 캐시가 한 장으로 뭉갠다
    let n = 0;
    global.fetch = () => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob([String(n++).repeat(9)])) });
    const media = Array.from({ length: 12 }, (_, i) => ({ id: String(i), thumb: 'https://x/' + i }));
    const prof = await h.win.InstagramTextStyle.build(media);
    h.restore();
    expect(h.calls()).toBe(8);                       // 8번째에서 429 → 멈춘다(12번 안 부른다)
    expect(prof.counts.genuine).toBe(7);
    expect(prof.quotaExhausted).toBe(true);
    expect(Object.keys(h.cache).length).toBe(7);     // 성공분만 캐시
    expect(prof.pendingRetry).toBe(5);               // 남은 5장
  });

  test('다음 동기화 — 성공한 7장은 다시 안 부르고 나머지만 시도한다', async () => {
    const h = harness(7);
    let n = 0;
    global.fetch = () => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob([String(n++).repeat(9)])) });
    const media = Array.from({ length: 12 }, (_, i) => ({ id: String(i), thumb: 'https://x/' + i }));
    await h.win.InstagramTextStyle.build(media);
    const first = h.calls();

    // 2회차 — 캐시는 그대로 두고 쿼터는 풀렸다고 본다
    const h2 = { ...h };
    let m = 0;
    global.fetch = () => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob([String(m++).repeat(9)])) });
    let calls2 = 0;
    h.win.apiFetch = () => { calls2 += 1; return Promise.resolve({ ok: true, status: 200,
      json: () => Promise.resolve({ text_blocks: [blk()], engine: 'gemini', confidence: 0.9,
        status: 'OK', is_ui_screenshot: false, composition: 'text_overlay' }) }); };
    const prof2 = await h.win.InstagramTextStyle.build(media);
    h.restore();
    expect(first).toBe(8);
    expect(calls2).toBe(5);                          // 실패했던 5장만 다시 부른다
    expect(prof2.cacheHits).toBe(7);
    expect(prof2.counts.genuine).toBe(12);
    void h2;
  });
});
