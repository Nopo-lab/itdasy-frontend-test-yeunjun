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
const post = (blocks, o) => Object.assign({ text_blocks: blocks, composition: 'text_overlay',
  is_ui_screenshot: false, confidence: 0.8 }, o);

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
    expect(r.fontClass.n).toBe(2);        // unknown 2장은 분모에도 안 들어간다
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
    expect(r.uiScreenshotsSkipped).toBe(1);
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

describe('🔴 우선순위 — editor_observed 가 항상 이긴다', () => {
  test('편집기 증거가 있으면 인스타 관찰을 안 쓴다', () => {
    expect(baseSrc).toMatch(/out\.axes\.align = pAlign \? _axis\(pAlign\.value, 'editor_observed'/);
    // 인스타는 pAlign 이 없을 때만
    expect(baseSrc).toMatch(/: \(igtOk && igt\.align \? _axis\(igt\.align\.value, 'instagram_observed'/);
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
    expect(baseSrc).toMatch(/igtOk = !!\(igt && igt\.enough\)/);
  });
});
