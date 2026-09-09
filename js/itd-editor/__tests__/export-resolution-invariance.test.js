'use strict';

/* [BUG-01 2026-09-09] 발행 이미지 해상도가 브라우저 창 크기에 좌우되던 것 — 회귀 고정.
 *
 * 무엇이 틀렸었나(브라우저 실측):
 *   exportComposite() 가 `canvas = stage.getBoundingClientRect() × devicePixelRatio` 로
 *   캔버스를 잡았다. 그래서 같은 1080×1350 원본 + 같은 편집인데
 *     창 1440 → 650×812 (27KB)
 *     창  500 → 500×625 (15.8KB)
 *   가 나왔고, 그 축소본이 Supabase 에 저장되고 인스타 발행 payload 로 그대로 갔다.
 *
 * 이 테스트는 "출력 크기는 선언 비율만으로 정해진다"를 고정한다.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const editorSrc = fs.readFileSync(path.join(ROOT, 'js/itd-editor/itd-editor.js'), 'utf8');

function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('함수를 못 찾음: ' + name);
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) break; }
  }
  return src.slice(start, i + 1);
}

/** 소스에서 상수 하나를 숫자로 읽는다 — 테스트가 소스를 따라가게(하드코딩 금지). */
function constOf(src, name) {
  const m = new RegExp('var\\s+' + name + '\\s*=\\s*(\\d+)').exec(src);
  if (!m) throw new Error('상수를 못 찾음: ' + name);
  return Number(m[1]);
}

const EXPORT_W = constOf(editorSrc, 'EXPORT_W');
const EXPORT_MAX_H = constOf(editorSrc, 'EXPORT_MAX_H');

// eslint-disable-next-line no-new-func
const _exportSize = new Function(
  'var EXPORT_W = ' + EXPORT_W + ', EXPORT_MAX_H = ' + EXPORT_MAX_H + ';' +
  extractFn(editorSrc, '_safeRatio') + extractFn(editorSrc, '_exportSize') +
  '; return _exportSize;'
)();

/** fitStageToRatio 와 같은 규칙으로 스테이지 크기를 계산(실제 편집기가 하는 것). */
function stageFor(ratio, availW, availH) {
  const rp = String(ratio).split(':');
  const rw = +rp[0], rh = +rp[1];
  let w = availW, h = w * rh / rw;
  if (h > availH) { h = availH; w = h * rw / rh; }
  return { width: Math.round(w), height: Math.round(h) };
}

// 실제 지원 뷰포트 — 좁은 폰부터 데스크톱 최대까지
const VIEWPORTS = [
  [360, 800], [390, 844], [430, 932], [500, 737], [625, 900],
  [768, 1024], [812, 900], [1024, 768], [1280, 720], [1440, 812], [1920, 1080],
];

describe('BUG-01 · 출력 해상도는 뷰포트와 무관하다', () => {
  test('4:5 는 어떤 창 크기에서도 1080×1350 으로 나온다', () => {
    const seen = new Set();
    for (const [vw, vh] of VIEWPORTS) {
      const r = stageFor('4:5', vw, vh);
      const out = _exportSize('4:5', r);
      seen.add(out.w + 'x' + out.h);
      expect([out.w, out.h]).toEqual([1080, 1350]);
    }
    // 창이 11종인데 출력 크기는 정확히 1종이어야 한다 — 이게 이 버그의 핵심
    expect([...seen]).toEqual(['1080x1350']);
  });

  test('비율별 고정 출력 정책', () => {
    const cases = [
      ['4:5', 1080, 1350],
      ['1:1', 1080, 1080],
      ['3:4', 1080, 1440],
      ['9:16', 1080, 1920],   // EXPORT_MAX_H 상한에 정확히 걸림
      ['16:9', 1080, 608],
    ];
    for (const [ratio, w, h] of cases) {
      const r = stageFor(ratio, 1440, 812);
      const out = _exportSize(ratio, r);
      expect([ratio, out.w, out.h]).toEqual([ratio, w, h]);
    }
  });

  test('배율은 균등(k 하나)이고 캔버스를 빈틈없이 덮는다', () => {
    for (const [vw, vh] of VIEWPORTS) {
      const r = stageFor('4:5', vw, vh);
      const o = _exportSize('4:5', r);
      // 균등 배율이라 회전·비균등 도형이 왜곡되지 않는다
      expect(typeof o.k).toBe('number');
      expect(o.k).toBeGreaterThan(0);
      // 덮기: 스케일된 스테이지가 캔버스보다 작지 않아야 한다(가장자리 빈칸 방지)
      expect(r.width * o.k).toBeGreaterThanOrEqual(o.w - 0.01);
      expect(r.height * o.k).toBeGreaterThanOrEqual(o.h - 0.01);
      // 센터링 오프셋은 0 이하(넘치는 만큼 안쪽으로) 이고 1px 미만이어야 한다
      expect(Math.abs(o.ox)).toBeLessThan(1);
      expect(Math.abs(o.oy)).toBeLessThan(1);
    }
  });

  test('스테이지 측정 실패(rect 0)여도 출력 크기는 유지된다', () => {
    const o = _exportSize('4:5', { width: 0, height: 0 });
    expect([o.w, o.h]).toEqual([1080, 1350]);
  });

  test('망가진 비율은 4:5 로 폴백한다', () => {
    for (const bad of ['', null, 'abc', '0:0', '999:1', '1:999', undefined]) {
      const o = _exportSize(bad, stageFor('4:5', 1440, 812));
      expect([o.w, o.h]).toEqual([1080, 1350]);
    }
  });
});

describe('BUG-01 · 옛 구조가 되살아나지 못하게 막는다 (mutation guard)', () => {
  const exportFn = extractFn(editorSrc, 'exportComposite');

  test('exportComposite 이 캔버스를 스테이지 픽셀 × dpr 로 잡지 않는다', () => {
    // 옛 코드: cv.width = Math.round(r.width * dpr)
    expect(exportFn).not.toMatch(/cv\.width\s*=\s*Math\.round\(\s*r\.width\s*\*\s*dpr/);
    expect(exportFn).not.toMatch(/cv\.height\s*=\s*Math\.round\(\s*r\.height\s*\*\s*dpr/);
    // dpr 자체가 export 경로에 남아 있으면 안 된다(오프스크린 누끼 캔버스 포함)
    expect(exportFn).not.toMatch(/\bdpr\b/);
  });

  test('exportComposite 이 _exportSize 로 캔버스를 잡는다', () => {
    expect(exportFn).toMatch(/_exportSize\(/);
    expect(exportFn).toMatch(/cv\.width\s*=\s*_xs\.w/);
    expect(exportFn).toMatch(/cv\.height\s*=\s*_xs\.h/);
  });

  test('누끼 오프스크린 캔버스도 본 캔버스와 같은 변환을 쓴다', () => {
    // 두 곳(단일/콜라주) 모두 _xs.k 로 setTransform 해야 마스크가 어긋나지 않는다
    const m = exportFn.match(/fc\.setTransform\(_xs\.k, 0, 0, _xs\.k, _xs\.ox, _xs\.oy\)/g) || [];
    expect(m.length).toBe(2);
  });

  test('자동 합성(_composeOne) 스테이지가 432px 로 하드코딩돼 있지 않다', () => {
    const compose = extractFn(editorSrc, '_composeOne');
    expect(compose).not.toMatch(/var\s+Wpx\s*=\s*432/);
    expect(compose).toMatch(/var\s+Wpx\s*=\s*EXPORT_W/);
  });
});
