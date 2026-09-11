/* 🔴 [2026-09-11 · 실기기에서 잡음] **선택한 레이어의 회전·크기 핸들이 안 눌렸다.**
 *
 * 도구 패널이 열리면 레이어 순서 줄(.itded__lyr)이 사진 위로 올라온다(z 11).
 * 그런데 레이어 판(.itded__layers)은 z 4 라, 줄과 겹치는 자리의 핸들이 줄에 가려
 * **보이는데 안 눌리는** 상태가 됐다. 스티커는 기본이 가운데 배치라
 * "스티커 넣고 → 패널 열고 → 돌리려고 하면 안 된다" 가 기본 동선이었다.
 *
 * 실측 (iPhone 402×714 실기기 WebKit · Chrome 402×714 동일):
 *   수정 전: rot @241,397 → `itded__lyr` / rs @161,397 → `itlyr`   (둘 다 BLOCKED)
 *   수정 후: del·dup·rot·rs 넷 다 hit=self
 *   순서 줄이 띠 전체를 먹던 것 → 버튼 4개(44%)만. 버튼 4개는 그대로 눌린다.
 *
 * 두 겹으로 고쳤다.
 *   1) 줄 컨테이너는 전폭·무배경인데 탭을 다 먹고 있었다 → 컨테이너는 통과, 버튼만 받는다.
 *   2) 레이어가 선택돼 있는 동안만 레이어 판을 줄 위로 올린다(:has). 판은 탭을 통과시키고
 *      실제 레이어 상자만 받으므로 순서 줄 버튼은 겹치지 않는 곳에서 그대로 눌린다.
 */
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '../../../css/itd-editor.css'), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const CSS = strip(css);

const ruleOf = (sel) => {
  const i = CSS.indexOf(sel + '{') >= 0 ? CSS.indexOf(sel + '{') : CSS.indexOf(sel + ' {');
  if (i < 0) throw new Error('규칙을 못 찾았다: ' + sel);
  return CSS.slice(CSS.indexOf('{', i) + 1, CSS.indexOf('}', i));
};
const zOf = (sel) => {
  const m = /z-index\s*:\s*(\d+)/.exec(ruleOf(sel));
  if (!m) throw new Error('z-index 가 없다: ' + sel);
  return +m[1];
};

describe('🔴 선택한 레이어의 핸들이 레이어 순서 줄에 안 가린다', () => {
  test('순서 줄 컨테이너는 탭을 통과시킨다 (전폭·무배경이라 띠 전체를 먹으면 안 된다)', () => {
    expect(ruleOf('.itded__lyr')).toMatch(/pointer-events\s*:\s*none/);
  });
  test('순서 줄 버튼 4개는 그대로 눌린다', () => {
    expect(ruleOf('.itded__lyr .itlyr')).toMatch(/pointer-events\s*:\s*auto/);
  });
  test('레이어가 선택돼 있으면 레이어 판이 순서 줄보다 위로 온다', () => {
    expect(zOf('.itded__layers:has(.itl.is-active)')).toBeGreaterThan(zOf('.itded__lyr'));
  });
  test('올라간 레이어 판은 탭을 통과시키고 실제 레이어 상자만 받는다', () => {
    expect(ruleOf('.itded__layers:has(.itl.is-active)')).toMatch(/pointer-events\s*:\s*none/);
    expect(ruleOf('.itded__layers:has(.itl.is-active) .itl')).toMatch(/pointer-events\s*:\s*auto/);
  });
  test('선택이 없을 때는 원래 높이를 지킨다 (판이 항상 위로 오면 순서 줄이 통째로 막힌다)', () => {
    expect(zOf('.itded__layers')).toBeLessThan(zOf('.itded__lyr'));
  });
});
