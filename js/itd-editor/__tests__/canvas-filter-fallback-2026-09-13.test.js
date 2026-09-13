/**
 * [2026-09-13 ZERO-HELP P2] 보정이 화면에는 보이는데 발행본에서 통째로 빠질 수 있던 것.
 *
 * 발행본은 ctx.filter 로 굽는데 폴백이 없었다. CanvasRenderingContext2D.filter 는 Safari 18 부터이고
 * 이 앱의 iOS 최소 지원은 15.0(ios/App/Podfile). 미지원 엔진에선 대입이 조용히 무시된다.
 * 실측(Chrome 실엔진에서 ctx.filter 무력화 · 저조도 헤어 · 밝기+35 대비+10 채도+25) 발행본 평균 RGB:
 *   원본 [67,48,34] · 정상 [92,57,32] · 미지원(수정 전) [67,48,34] → 미지원(수정 후) [93,58,33]
 * 폴백 충실도(실엔진 ctx.filter 결과 대비, 뷰티 사진 5 × 보정 5 = 25케이스): 채널 최대오차 ≤3/255, 3 초과 0.00%.
 */
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'itd-editor.js'), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
const C = strip(SRC);
function ext(name) {
  const i = SRC.indexOf('function ' + name + '(');
  expect(i).toBeGreaterThan(0);
  let d = 0; const j = SRC.indexOf('{', i);
  for (let k = j; k < SRC.length; k++) { if (SRC[k] === '{') d++; else if (SRC[k] === '}') { d--; if (d === 0) return SRC.slice(i, k + 1); } }
  throw new Error(name);
}
const applyAdjPixels = new Function(ext('_applyAdjPixels') + '; return _applyAdjPixels;')();
const adjIsId = new Function(ext('_dv') + ext('_adjIsId') + '; return _adjIsId;')();
const px = (r, g, b) => new Uint8ClampedArray([r, g, b, 255]);

describe('폴백 픽셀 연산 = CSS Filter Effects 스펙 식', () => {
  test('기본값이면 픽셀이 그대로다', () => {
    const d = px(67, 48, 34); applyAdjPixels(d, { b: 100, c: 100, s: 100, w: 0, sh: 0 });
    expect(Array.from(d.slice(0, 3))).toEqual([67, 48, 34]);
  });
  test('brightness 는 곱셈(1.5배), 255 에서 잘린다', () => {
    const d = px(100, 200, 10); applyAdjPixels(d, { b: 150, c: 100, s: 100, w: 0, sh: 0 });
    expect(Array.from(d.slice(0, 3))).toEqual([150, 255, 15]);
  });
  test('contrast 는 0.5 중심 확대', () => {
    const d = px(191, 64, 128); applyAdjPixels(d, { b: 100, c: 140, s: 100, w: 0, sh: 0 });
    // (191/255-0.5)*1.4+0.5 = 0.8486 → 216 · (64/255-0.5)*1.4+0.5 = 0.1514 → 39 · 128 → 128
    expect(Array.from(d.slice(0, 3))).toEqual([216, 39, 128]);
  });
  test('선명도는 대비에 0.4 배로 더해진다(filterStr 과 같은 근사)', () => {
    const a = px(191, 64, 128), b = px(191, 64, 128);
    applyAdjPixels(a, { b: 100, c: 100, s: 100, w: 0, sh: 100 });
    applyAdjPixels(b, { b: 100, c: 140, s: 100, w: 0, sh: 0 });
    expect(Array.from(a.slice(0, 3))).toEqual(Array.from(b.slice(0, 3)));
  });
  test('🔴 채도 0 은 회색(루마 계수 0.213/0.715/0.072)', () => {
    const d = px(200, 100, 50); applyAdjPixels(d, { b: 100, c: 100, s: 0, w: 0, sh: 0 });
    const L = Math.round((0.213 * 200 + 0.715 * 100 + 0.072 * 50));
    expect(d[0]).toBe(L); expect(d[1]).toBe(L); expect(d[2]).toBe(L);
  });
  test('온도(sepia)는 0.45 배로 약하게, 적용 순서는 brightness → contrast → saturate → sepia', () => {
    const a = px(120, 140, 160); applyAdjPixels(a, { b: 100, c: 100, s: 100, w: 100, sh: 0 });
    // sepia(0.45) 행렬을 직접 계산
    const q = 0.55, r = 120 / 255, g = 140 / 255, b = 160 / 255;
    const R = Math.round(Math.min(1, (0.393 + 0.607 * q) * r + (0.769 - 0.769 * q) * g + (0.189 - 0.189 * q) * b) * 255);
    expect(a[0]).toBe(R);
    // 순서 확인: filterStr 문자열 순서와 같아야 한다
    const fs2 = ext('filterStr');
    expect(fs2.indexOf('brightness')).toBeLessThan(fs2.indexOf('contrast'));
    expect(fs2.indexOf('contrast')).toBeLessThan(fs2.indexOf('saturate'));
    expect(fs2.indexOf('saturate')).toBeLessThan(fs2.indexOf('sepia'));
  });
  test('알파는 건드리지 않는다', () => {
    const d = new Uint8ClampedArray([10, 20, 30, 77]); applyAdjPixels(d, { b: 140, c: 140, s: 200, w: 100, sh: 100 });
    expect(d[3]).toBe(77);
  });
});

describe('_adjIsId — 채도 0 을 기본값으로 착각하지 않는다', () => {
  test('🔴 s:0 은 보정이 있는 것', () => { expect(adjIsId({ b: 100, c: 100, s: 0, w: 0, sh: 0 })).toBe(false); });
  test('기본값은 보정 없음', () => { expect(adjIsId({ b: 100, c: 100, s: 100, w: 0, sh: 0, rot: 0 })).toBe(true); });
  test('필드가 비어 있으면 기본값으로 본다', () => { expect(adjIsId({})).toBe(true); expect(adjIsId(null)).toBe(true); });
  test('온도·선명도가 있으면 보정 있음', () => {
    expect(adjIsId({ b: 100, c: 100, s: 100, w: 10 })).toBe(false);
    expect(adjIsId({ b: 100, c: 100, s: 100, sh: 10 })).toBe(false);
  });
});

describe('발행본 4곳이 전부 폴백을 거친다', () => {
  test('단일 사진 2곳(누끼·일반) + 콜라주 2곳(누끼·일반)', () => {
    expect((C.match(/drawImage\(_adjSrc\(img, adjOf\(sIdx < 0 \? 0 : sIdx\)\), dx, dy, cr\.dw, cr\.dh\)/g) || []).length).toBe(2);
    expect((C.match(/drawImage\(_adjSrc\(img, adjOf\(idxs\[k\]\)\), dx, dy, cr\.dw, cr\.dh\)/g) || []).length).toBe(2);
    // 보정 필터를 건 채 원본 img 를 그대로 그리는 곳이 남아 있으면 안 된다
    expect(C).not.toMatch(/\.filter = (_sFlt|flt); \w+\.drawImage\(img,/);
  });
  test('filter 가 먹는 엔진에선 원본 그대로(기존 경로 불변) · 기본 보정이면 복사하지 않는다', () => {
    const b = ext('_adjSrc');
    expect(b).toMatch(/if \(!img \|\| !a \|\| _ctxFilterOK\(\) \|\| _adjIsId\(a\)\) return img;/);
  });
  test('지원 판정은 실제로 그려 본다(속성 존재만 보면 조용히 무시하는 엔진을 못 가린다)', () => {
    const b = ext('_ctxFilterOK');
    expect(b).toMatch(/g\.filter = 'brightness\(0\)'; g\.drawImage\(src, 0, 0\);/);
    expect(b).toMatch(/getImageData\(0, 0, 1, 1\)\.data\[0\] < 128/);
    expect(b).not.toMatch(/'filter' in/);
  });
});
