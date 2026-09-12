/* 🔴 [2026-09-11 · ZERO-HELP 게이트 실측] 편집기에서 [완료] 를 눌러도
 *   돌아온 화면이 **편집 전 사진**을 그대로 보여주던 것.
 *
 * 실측(라이브 547ae68, 실계정 slot mtws7ssfjm7ac):
 *   '사진 확인(layout)' → 편집기 → 글자 '첫 방문 이벤트' → '9월 한정 이벤트' → [완료]
 *   저장본: photos[0].editState.layers = [{type:'text', text:'9월 한정 이벤트'}] ✅
 *   화면:   여전히 '첫 방문 이벤트' ❌ (4초 뒤에도)
 *   해시 대조: 화면 blob 286,657B(2e05ddd88a49) ≠ 저장본 293,630B(a6269558d344)
 *
 * 원인: onDone 이 `d._editorNext` 가 있거나 `cur === 'caption'` 일 때만 setScreen 을 불렀다.
 *   layout 에서 연 경우엔 아무 재렌더도 없어 DOM 이 옛 사진 그대로 남는다.
 *   → 저장은 맞는데 화면만 거짓말을 한다. 원장은 "수정이 안 됐네" 로 읽는다.
 */
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../workspace-v2-flow.js'), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** onDone 의 '다음 화면 결정' 구간만 잘라낸다. */
function routeBlock() {
  const src = strip(SRC);
  const i = src.indexOf("if (d._editorNext) { var _nx = d._editorNext;");
  expect(i).toBeGreaterThan(0);
  const j = src.indexOf("d._orch", i);
  expect(j).toBeGreaterThan(i);
  const block = src.slice(i, j);
  expect(block.length).toBeLessThan(500);   // 앵커가 벌어지면 가드가 무력해진다
  return block;
}

test('편집 완료 후 어떤 화면에서 열었든 **다시 그린다**', () => {
  const b = routeBlock();
  // caption 만 특별대우하고 나머지를 버리는 형태면 안 된다
  expect(b).toMatch(/else\s+setScreen\(cur\)/);
});

test('caption 만 재렌더하고 끝나는 옛 형태가 남아 있지 않다', () => {
  const b = routeBlock();
  const hasCaptionOnly = /else if \(cur === 'caption'\) setScreen\('caption'\);\s*$/.test(b.trim());
  expect(hasCaptionOnly).toBe(false);
});

test('재렌더는 히스토리를 쌓지 않는다 — setScreen 은 name===cur 이면 push 안 함', () => {
  const src = strip(SRC);
  const i = src.indexOf('function setScreen(name, opts)');
  expect(i).toBeGreaterThan(0);
  const seg = src.slice(i, i + 900);
  expect(seg).toMatch(/if \(name !== cur && opts\.push !== false/);
});

test('편집 결과가 사진 객체에 실제로 반영되는 줄은 그대로 있다(재렌더만 고친다)', () => {
  const src = strip(SRC);
  expect(src).toMatch(/p\.editedDataUrl = dataUrl;\s*p\.storyEdited = true;/);
  expect(src).toMatch(/_persistEditQuiet\(\)/);
});
