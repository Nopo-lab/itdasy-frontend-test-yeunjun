/* [2026-10-01 mobile-ux-04] WCAG AA(4.5:1) 미달 회색 텍스트.
 *  tokens.css 는 2026-06-10 에 --text-subtle 을 #6B7684(5.9:1) 로 올렸지만 화면 CSS 들이
 *  옛 값 #8B95A1(3.0:1)·#C4C4C4(1.7:1)·#BBB(1.9:1)·#A8B0BA(2.2:1) 를 직접 쓰고 있었다.
 *  이 테스트가 보는 범위(FE-F 소유 파일): css/screens/*.css · style-base.css · style-components.css 의
 *  **라이트모드** 텍스트 색. 다크모드 블록([data-theme="dark"])은 보류 정책대로 손대지 않는다.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/** 다크모드 블록을 지운 라이트모드 CSS 텍스트 */
function lightOnly(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');   // 주석 제거 (옛 값을 설명하는 주석은 허용)
  return css.replace(/\[data-theme="dark"\][^{]*\{[^}]*\}/g, '').replace(/html\[data-theme="dark"\][^{]*\{[^}]*\}/g, '');
}

const files = fs.readdirSync(path.join(ROOT, 'css/screens')).filter((f) => f.endsWith('.css')).map((f) => 'css/screens/' + f)
  .concat(['style-base.css', 'style-components.css']);

test('라이트모드에서 글자색 #8B95A1 하드코딩이 없다 (→ var(--text-subtle))', () => {
  const bad = [];
  for (const f of files) {
    const css = lightOnly(read(f));
    const re = /(^|[;{\s])color\s*:\s*#8B95A1\b/gi;
    let m; while ((m = re.exec(css))) bad.push(f + ' @' + css.slice(0, m.index).split('\n').length);
  }
  expect(bad).toEqual([]);
});

test('고객 목록 보조문구(.c-sub/.c-last)·섹션 헤더(.sec-hd)·인덱스바(.idx-bar) 가 1.7~1.9:1 회색이 아니다', () => {
  const css = lightOnly(read('css/screens/customer-v4.css'));
  expect(css).not.toMatch(/\.c-sub\s*\{[^}]*#C4C4C4/i);
  expect(css).not.toMatch(/\.c-last\s*\{[^}]*#C4C4C4/i);
  expect(css).not.toMatch(/\.sec-hd\s*\{[^}]*#BBB\b/i);
  expect(css).not.toMatch(/\.idx-bar\s*(button|span)?\s*\{[^}]*#BBB\b/i);
  expect(css).not.toMatch(/#C4C4C4/i);
});

test("홈 '나중에 할게요'(.ipc-skip) 가 #A8B0BA(2.2:1) 가 아니다", () => {
  expect(lightOnly(read('css/screens/home-pre-connect.css'))).not.toMatch(/\.ipc-skip\s*\{[^}]*#A8B0BA/i);
});
