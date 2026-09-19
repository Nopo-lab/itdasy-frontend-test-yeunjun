/**
 * T-913 — PC 판정(JS)과 PC 셸(CSS)이 같은 조건인지 고정한다.
 *
 * 왜 필요한가 (2026-09-20 실사고):
 *   CSS 셸은 `@media (width >= 768px) and (height >= 600px)` 에서 사이드바를 켜는데,
 *   JS 는 예약/매출이 1100px, 고객이 1280px 를 PC 기준으로 썼다. 게다가 셋 다
 *   **폭만** 보고 높이를 안 봤다.
 *
 *   → 아이패드 세로(1032x1376)가 그 틈에 빠져 '데스크톱 껍데기 안에 폰 화면' 이 됐다.
 *     실측: 달력이 모바일 그리드(행 높이 고정 78px)로 그려져 화면 높이의 52%(717px)가
 *     빈 공간. 가로(1376x1032)로 돌리면 PC 그리드(`1fr`)가 떠서 빈 공간 0px.
 *
 *   → 높이 조건이 없으면 반대 사고도 난다: 폰 가로(956x440)가 데스크톱 UI 를 받는다.
 *
 * 이 테스트는 '값이 768/600 이어야 한다' 가 아니라 **세 모듈과 CSS 가 서로 같아야 한다**
 * 를 고정한다. 기준을 바꾸려면 네 곳을 같이 바꿔야 실패하지 않는다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/** CSS 셸이 쓰는 (min-width, min-height) 를 style-responsive.css 에서 읽는다. */
function cssShellCondition() {
  const css = read('style-responsive.css');
  const m = css.match(/@media\s*\(width\s*>=\s*(\d+)px\)\s*and\s*\(height\s*>=\s*(\d+)px\)/);
  if (!m) throw new Error('style-responsive.css 에서 PC 셸 미디어쿼리를 못 찾았다');
  return { w: Number(m[1]), h: Number(m[2]) };
}

/** 각 모듈의 _isPC 가 비교하는 폭/높이 상수를 읽는다. */
function moduleCondition(file, widthConst, heightConst) {
  const src = read(file);
  const w = src.match(new RegExp(`${widthConst}\\s*=\\s*(\\d+)`));
  const h = src.match(new RegExp(`${heightConst}\\s*=\\s*(\\d+)`));
  if (!w) throw new Error(`${file}: ${widthConst} 를 못 찾았다`);
  if (!h) throw new Error(`${file}: ${heightConst} 를 못 찾았다 — 높이 조건이 빠지면 폰 가로가 데스크톱 UI 를 받는다`);
  return { w: Number(w[1]), h: Number(h[1]) };
}

const MODULES = [
  ['app-calendar-view.js', 'PC_BREAKPOINT',  'PC_MIN_HEIGHT'],
  ['app-revenue.js',       'PC_BREAKPOINT',  'PC_MIN_HEIGHT'],
  ['app-customer.js',      '_PC_BREAKPOINT', '_PC_MIN_HEIGHT'],
];

describe('T-913 · PC 판정(JS) == PC 셸(CSS)', () => {
  test.each(MODULES)('%s 의 PC 기준이 CSS 셸과 같다', (file, wc, hc) => {
    expect(moduleCondition(file, wc, hc)).toEqual(cssShellCondition());
  });

  test('_isPC 가 폭과 높이를 **둘 다** 본다 (폭만 보면 폰 가로가 데스크톱 UI)', () => {
    for (const [file] of MODULES) {
      const src = read(file);
      const line = src.split('\n').find(l => /_isPC\s*(\(\)|=)/.test(l) && /innerWidth/.test(l));
      expect(line).toBeTruthy();
      expect(line).toMatch(/innerHeight/);
    }
  });

  test('실측으로 갈린 기기들이 의도한 쪽으로 판정된다', () => {
    const { w, h } = cssShellCondition();
    const isPC = (vw, vh) => vw >= w && vh >= h;
    // 아이패드 — 사이드바가 뜨는 폭이므로 PC 레이아웃이어야 한다
    expect(isPC(1032, 1376)).toBe(true);   // iPad Pro 13" 세로 ← 이번 사고 지점
    expect(isPC(1376, 1032)).toBe(true);   // iPad Pro 13" 가로
    expect(isPC(834, 1194)).toBe(true);    // iPad Pro 11" 세로
    expect(isPC(820, 1180)).toBe(true);    // iPad Air 11" 세로
    // 폰 — 가로로 눕혀도 데스크톱 UI 를 받으면 안 된다
    expect(isPC(956, 440)).toBe(false);    // iPhone 17 Pro Max 가로
    expect(isPC(932, 430)).toBe(false);    // iPhone 16 Pro Max 가로
    expect(isPC(393, 852)).toBe(false);    // iPhone 세로
    expect(isPC(744, 1133)).toBe(false);   // iPad mini 세로 — CSS 셸도 안 켜진다(<768)
  });
});
