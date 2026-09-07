/**
 * 반응형 릴리즈 게이트 (2026-09-07) 회귀 가드 2종.
 *
 * [1] 셀렉터-리스트 `:not(a, b)` 금지
 *   `:not()` 에 콤마 리스트를 주는 문법은 Safari 16.4+ 다. 이 앱의 iOS 최소 지원은 15.0
 *   (ios/App/Podfile · pbxproj IPHONEOS_DEPLOYMENT_TARGET). 그리고 CSS 는 콤마 그룹 안에
 *   무효 셀렉터가 하나라도 있으면 **규칙 전체를 버린다**(브라우저 실측 확인).
 *   → iOS 15.0~16.3 에서 통째로 죽었던 것들:
 *     · css/tokens.css     : 입력칸 16px 강제(= iOS 자동확대 방어) 전체
 *     · style-home.css     : 로그인 게이트 뒤 앱 화면 숨김
 *     · style-responsive.css: 허브 오버레이 위 탭바 숨김(그룹 12개 전체)
 *   체인 `:not():not()` 은 결과가 동일하면서 구형 사파리에서도 산다(실측 28/28·63/63).
 *
 * [2] 풀스크린 시트의 뒤로가기 등록
 *   `_markSheetOpen` 을 안 부르면 history 엔트리가 안 생겨서, 안드로이드 하드웨어 백이
 *   시트를 닫는 대신 **앱을 종료**한다. 실측으로 4개가 빠져 있었다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** /* ... *\/ 주석을 걷어낸다 — 주석 안의 예시 코드는 실제 CSS 가 아니다. */
function stripCssComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** `:not(...)` 안에 톱레벨 콤마가 있으면 셀렉터 리스트 형태다. */
function findListNot(src) {
  const hits = [];
  const re = /:not\(/g;
  let m;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = m.index + m[0].length;
    let hasComma = false;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ',' && depth === 1) hasComma = true;
      i++;
    }
    if (hasComma) hits.push(src.slice(m.index, Math.min(i, m.index + 90)));
  }
  return hits;
}

describe('iOS 15 호환 — 셀렉터 리스트 :not() 금지', () => {
  const CSS_FILES = [
    'css/tokens.css',
    'style-home.css',
    'style-responsive.css',
    'style-base.css',
    'style-components.css',
  ];

  test.each(CSS_FILES)('%s 에 :not(a, b) 형태가 없다', (file) => {
    const hits = findListNot(stripCssComments(read(file)));
    expect(hits).toEqual([]);
  });

  test('iOS 자동확대 방어 규칙이 살아 있다 (pointer:coarse + 16px)', () => {
    const css = stripCssComments(read('css/tokens.css'));
    expect(css).toMatch(/@media\s*\(pointer:\s*coarse\)/);
    expect(css).toMatch(/font-size:\s*16px\s*!important/);
    // 체인 형태여야 한다
    expect(css).toMatch(/input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/);
  });

  test('로그인 게이트가 앱 화면을 가리는 규칙이 체인 형태다', () => {
    expect(stripCssComments(read('style-home.css')))
      .toMatch(/body\.itdasy-locked\s*>\s*:not\(#lockOverlay\):not\(#signupOverlay\)/);
  });
});

describe('풀스크린 시트 — 뒤로가기(history) 등록', () => {
  // [파일, 시트이름] — _markSheetOpen/_markSheetClosed/_registerSheet 3종이 다 있어야 한다.
  const SHEETS = [
    ['app-plan.js', 'plan'],
    ['app-review.js', 'reviewRequests'],
    ['app-reminder.js', 'reminder'],
    ['app-data-export.js', 'dataExport'],
  ];

  test.each(SHEETS)('%s → _markSheetOpen/_markSheetClosed/_registerSheet 등록', (file, name) => {
    const src = read(file);
    expect(src).toContain(`_markSheetOpen('${name}')`);
    expect(src).toContain(`_markSheetClosed('${name}')`);
    expect(src).toContain(`_registerSheet('${name}'`);
  });

  test('플랜 팝업의 모든 닫기 경로가 closePlanPopup() 을 지난다', () => {
    const src = read('app-plan.js');
    // ✕ 버튼·배경 클릭이 display 를 직접 끄면 _markSheetClosed 가 안 불려
    // "눌러도 아무 일 없는 뒤로가기" 칸이 쌓인다.
    const bypass = src.match(/addEventListener\('click',[^)]*pop\.style\.display\s*=\s*'none'/g);
    expect(bypass).toBeNull();
    expect(src).toMatch(/closeBtn\.addEventListener\('click',\s*\(\)\s*=>\s*\{\s*closePlanPopup\(\);/);
  });
});

describe('style.css @import 캐시버스터', () => {
  // deploy.yml 의 자동 범프는 index.html·js/load-groups.js 만 훑는다.
  // style.css 의 @import 는 손으로 올려야 반영된다 — 고친 파일은 버전이 달라야 한다.
  test('수정한 파일의 @import 버전이 옛 버전이 아니다', () => {
    const css = read('style.css');
    expect(css).not.toContain('style-home.css?v=20260720-cbt-firstrun');
    expect(css).not.toContain('style-responsive.css?v=20260815-dmthread-pc');
    expect(css).toMatch(/style-home\.css\?v=/);
    expect(css).toMatch(/style-responsive\.css\?v=/);
  });
});
