/* [2026-09-10] CURRENT PRODUCT SCOPE LOCK — 죽은 Editor A / edit / template 잔재 제거 가드.
 *
 * 왜 필요한가: 이 라운드에서 지운 것들은 **문법적으로는 멀쩡히 살아 있던 코드**였다.
 *   - 렌더러는 실행됐지만 출력이 들어갈 컨테이너([data-ed-basic] 등)가 없어 통째로 버려졌고,
 *   - 클릭 핸들러는 등록됐지만 그 data-fl 을 가진 버튼을 아무도 그리지 않았다.
 * 즉 "호출그래프상 도달 가능"이 "원장이 쓸 수 있다"를 전혀 뜻하지 않았다.
 * 실측 근거(라이브 DOM, 2026-09-10): [data-fs="edit"]·[data-ed-*]·.ed-photo-vp 전부 0개.
 *
 * 이 가드는 그 상태가 되돌아가지 않는지만 본다. 되살리려면 **버튼(emit)과 핸들러를 같이** 만들어야 한다.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const raw = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/* 주석은 제거하고 본다 — 이번 정리에서 남긴 "왜 지웠는지" 주석에 지운 이름이 그대로 적혀 있어서,
   원문 그대로 검사하면 가드가 자기 설명문에 걸려 실패한다(실제로 4건 걸렸다). */
const decomment = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const flow = decomment(raw('js/workspace/workspace-v2-flow.js'));
const steps = decomment(raw('js/workspace/flow/steps.js'));
/* 살아있는 화면 마크업 일부는 flow/ 하위 모듈이 그린다(layout·connect·caption). */
const mods = fs.readdirSync(path.join(ROOT, 'js/workspace/flow'))
  .filter((f) => f.endsWith('.js')).map((f) => raw('js/workspace/flow/' + f)).join('\n');
const flowAll = flow + '\n' + mods;

describe('§18-1 — 살아있는 화면 5개는 그대로 있다', () => {
  test.each(['upload', 'layout', 'caption', 'connect', 'preview'])('%s 섹션이 렌더된다', (s) => {
    expect(flow).toContain(`data-fs="${s}"`);
  });
  test('STEP_FX 에 5개 전부 등록돼 있다', () => {
    const reg = flow.slice(flow.indexOf('var STEP_FX = {'), flow.indexOf('var STEP_FX = {') + 700);
    ['upload', 'layout', 'caption', 'connect', 'preview'].forEach((s) => expect(reg).toContain(s + ':'));
  });
  test('SCREENS(master) 순서도 5개다', () => {
    expect(steps).toMatch(/master\s*=\s*\[\s*'upload',\s*'layout',\s*'caption',\s*'connect',\s*'preview'\s*\]/);
  });
});

describe('§18-2 — 제거된 화면은 어떤 경로로도 못 연다', () => {
  test('edit·template 섹션 마크업이 없다', () => {
    expect(flow).not.toMatch(/<section[^>]*data-fs="edit"/);
    expect(flow).not.toMatch(/<section[^>]*data-fs="template"/);
  });
  test('STEP 사전에 edit·template 이 없다', () => {
    expect(steps).not.toMatch(/\bedit\s*:/);
    expect(steps).not.toMatch(/\btemplate\s*:/);
  });
  test('goto 는 SCREENS 화이트리스트로 막고 unknown_screen 으로 정직하게 실패한다', () => {
    expect(flow).toMatch(/SCREENS\.indexOf\(cmd\.screen\)\s*<\s*0/);
    expect(flow).toContain("reason: 'unknown_screen'");
  });
  test("startScreen:'edit' 로 진입하는 코드가 없다", () => {
    expect(flow).not.toMatch(/startScreen\s*===?\s*'edit'/);
    expect(flow).not.toMatch(/startScreen:\s*'edit'/);
  });
});

describe('§18-3 — Editor A(옛 슬라이더) 잔재가 다시 들어오지 않는다', () => {
  /* 이 셀렉터들은 "찾는 코드만 있고 그리는 코드가 없는" 상태였다.
     하나라도 다시 생기면 그건 화면을 되살리는 것이므로 여기서 잡는다. */
  test.each(['[data-ed-basic]', '[data-ed-adv]', '[data-ed-tpl]', '[data-ed-bottom]', '[data-ed-switcher]', '[data-ed-vptools]'])(
    '%s 를 읽거나 쓰는 코드가 없다', (sel) => { expect(flow).not.toContain(sel); });
  test.each(['_setEditSection', '_mainAdjustHtml', '_advFoldHtml', '_editSwitcherHtml', '_vpToolsHtml',
    '_paintEditPhoto', '_renderVpTools', '_renderMaskOverlay', '_renderPaintOverlay', 'switchEditPhoto',
    '_bindZoom', '_bindPaint', '_bindEditResize', 'openCropFlow', 'applyBg'])(
    '%s 정의가 없다', (fn) => { expect(flow).not.toMatch(new RegExp('function\\s+' + fn + '\\s*\\(')); });
  test("cur === 'edit' 분기가 없다 — cur 은 'edit' 이 될 수 없다", () => {
    expect(flow).not.toMatch(/cur\s*===\s*'edit'/);
  });
});

describe('§18-4 — 템플릿(옛 편집화면 전용) 잔재가 없다', () => {
  test.each(['renderTemplate', '_rerenderTemplate', 'applyTemplate', '_applyCollage', '_composeCollage',
    '_openTplEdit', '_openTplPreview', 'releaseTemplate', '_tplAppliedHtml', '_renderTplSection'])(
    '%s 정의가 없다', (fn) => { expect(flow).not.toMatch(new RegExp('function\\s+' + fn + '\\s*\\(')); });
});

describe('§18-5 — 잇비(작업실 커맨드) 계약은 그대로다', () => {
  test('공개 API 5종 유지', () => {
    expect(flow).toMatch(/window\.WorkspaceFlow\s*=\s*\{[^}]*open[^}]*close[^}]*command[^}]*isOpen[^}]*getActiveSlot/);
  });
  test.each(['open', 'storyedit', 'orchestrate', 'layoutopts', 'goto', 'adjust', 'edit', 'caption', 'customer', 'capvar'])(
    "command case '%s' 유지", (c) => { expect(flow).toContain(`case '${c}':`); });
  test('되돌리기/다시실행/초기화는 _editBottom 으로 간다 — 잇비 NL 발신처 3건이 살아있다', () => {
    expect(flow).toMatch(/_editBottom\(cmd\.action\)/);
    const nl = fs.readFileSync(path.join(ROOT, 'js/assistant/workspace-nl-commands.js'), 'utf8');
    expect((nl.match(/type:\s*'edit'/g) || []).length).toBeGreaterThanOrEqual(3);
  });
  test('adjust 는 모르는 키를 성공이라 하지 않는다', () => {
    expect(flow).toContain("reason: 'no_known_adjust_key'");
  });
});

describe('§18-6 — 살아있는 작업실 UI 는 손대지 않았다', () => {
  /* 라이브 DOM 실측(2026-09-10, 780×844)에서 실제로 존재한 토큰/속성.
     제거 전후 census 가 완전히 같았다 — 이 목록이 그 계약이다. */
  test.each(['back', 'cta', 'textonly', 'storyedit', 'copycap', 'saveimg', 'igconnect', 'pickcust', 'skipcust'])(
    'data-fl="%s" 버튼이 남아 있다', (t) => { expect(flowAll + steps).toContain(t); });
  test.each(['data-fl-cgen', 'data-fl-svctag', 'data-fl-svctypetoggle', 'data-fl-wizpick', 'data-fl-wizcustom',
    'data-fl-hashdel', 'data-fl-setrole', 'data-fl-format', 'data-fl-cardot', 'data-fl-tplexpand', 'data-fl-tplcollapse'])(
    '%s 핸들러가 남아 있다', (a) => { expect(flowAll).toContain(`[${a}]`); });
});
