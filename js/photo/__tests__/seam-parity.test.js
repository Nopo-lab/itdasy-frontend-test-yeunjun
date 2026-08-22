/* seam 정합성 — **실제 사진 픽셀**로 잠근다.
 *
 * ContentIntent 의 임계값(seamRatio 2.5)은 파이썬으로 잰 162셀에서 나왔다.
 * 그런데 제품에서 도는 건 `photo-context.js` 의 JS 구현이다.
 * 둘이 다른 수를 내면 **임계값이 통째로 무의미해진다** — 그런데 그건 조용히 일어난다.
 * 아무 에러도 안 나고, 그냥 판정이 조금씩 틀릴 뿐이다.
 *
 * 그래서 실제 캡처 2셀의 64×64 휘도 배열을 픽스처로 박아두고
 * JS 가 파이썬과 **같은 수**를 내는지 본다. 합성 배열로는 이걸 못 잡는다 —
 * 균일한 그라디언트는 어떤 구현이든 비슷한 답을 낸다.
 *
 * ⚠️ **이건 알고리즘 정합성이지 측정 정합성이 아니다.** 여기선 같은 휘도 배열을 준다.
 *    실제 제품은 사진을 canvas 로 디코딩·축소해서 배열을 만드는데, 그 배열이
 *    PIL 이 만든 배열과 다르다(JPEG 재압축 + 보간). 같은 사진에서 seamV 7.444 → 5.249.
 *    그래서 **임계값은 이 테스트가 아니라 브라우저 실측으로 정해야 한다**
 *    (content-intent.test.js 의 픽스처가 그 값이다). 이 둘을 헷갈려서 한 번 틀렸다.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const src = fs.readFileSync(path.join(ROOT, 'js/photo/photo-context.js'), 'utf8');
const CELLS = require('./fixtures/seam-real-cells.json');

/* 구현을 복붙하지 않는다 — 파일에서 그대로 떼어내 돌린다.
   복붙하면 "테스트용 사본"이 진짜와 갈라져도 초록불이 뜬다. */
function extractSeam(lum, nw, nh) {
  const m = src.match(/function _seam\(vertical\) \{[\s\S]*?\n {4}\}/);
  if (!m) throw new Error('_seam 을 photo-context.js 에서 못 찾았다 (구조가 바뀌었나?)');
  return new Function('lum', 'nw', 'nh', 'Math', m[0] + '; return _seam;')(lum, nw, nh, Math);
}

describe('[STAGE C] seam — JS 가 실측(파이썬)과 같은 수를 낸다', () => {
  test.each(CELLS)('$label 셀에서 seamV·seamH 가 실측과 일치', (cell) => {
    const seam = extractSeam(Float32Array.from(cell.lum), cell.nw, cell.nh);
    // 픽스처는 휘도를 정수로 반올림해 저장했다 — 그만큼의 오차만 허용한다.
    expect(seam(true)).toBeCloseTo(cell.seamV, 1);
    expect(seam(false)).toBeCloseTo(cell.seamH, 1);
  });

  test('전·후 비교 셀은 임계값(2.5)을 확실히 넘는다', () => {
    const c = CELLS.find((x) => x.label === 'before_after');
    const seam = extractSeam(Float32Array.from(c.lum), c.nw, c.nh);
    expect(seam(true)).toBeGreaterThan(2.5);
    expect(seam(true)).toBeGreaterThan(seam(false));   // 세로 경계가 가로보다 뚜렷
  });

  test('텍스트 카드 셀은 가로 경계가 더 크다 — 세로 분할이 아니다', () => {
    const c = CELLS.find((x) => x.label === 'text_card');
    const seam = extractSeam(Float32Array.from(c.lum), c.nw, c.nh);
    expect(seam(false)).toBeGreaterThan(seam(true));
  });

  test('seam 은 절대값이 아니라 평균 대비 배수다 (복잡한 사진에 안 속게)', () => {
    // 전 픽셀이 랜덤이면 중앙도 특별할 게 없다 → 배수는 1 근처여야 한다.
    const n = 64 * 64, lum = new Float32Array(n);
    let s = 12345;
    for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; lum[i] = s % 256; }
    const seam = extractSeam(lum, 64, 64);
    expect(seam(true)).toBeLessThan(1.6);
    expect(seam(false)).toBeLessThan(1.6);
  });

  test('필드가 늘 때마다 스키마를 올린다 — 반쪽짜리 옛 캐시가 더 위험하다', () => {
    // v2=seam · v3=lumGrid. 필드를 추가하면서 스키마를 안 올리면 옛 캐시가 살아남아
    // 새 필드만 undefined 인 객체가 돈다. 그건 '없음'보다 잡기 어렵다.
    expect(src).toMatch(/SCHEMA = 'pctx-v3'/);
  });
});
