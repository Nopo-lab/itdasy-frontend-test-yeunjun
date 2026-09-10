'use strict';

/* [2026-09-10] 옛 슬라이더 편집기(A) 'edit' 화면과 'template' 화면 제거 — 회귀 고정.
 *
 * 왜 지웠나(실측):
 *   2026-07-22 에 '사진 편집' 을 ItdEditor(B)로 옮기면서 A 화면 진입을 끊었는데 스텝 정의만 남아 있었다.
 *   · 잇비 NL 커맨드 46개 중 goto 는 connect/caption/layout **리터럴 3개뿐** — 'edit' 없음
 *   · 'bg'·'template' 커맨드는 레포 전체에 **발신처 0건**
 *   · photo-actions.js 주석: "'사진 편집'(ws_edit)은 ItdEditor 로 — 옛 슬라이더 'edit' 화면 아님"
 *   · template 화면은 **edit 화면의 cta2 하나**로만 열려서 같이 도달 불가였다
 *   → 지금 앱에서 쓸 수 있는 기능만 남긴다.
 *
 * ⚠️ 되살리려면 화면만이 아니라 **진입 UX** 를 같이 설계해야 한다.
 *    화면만 되돌리면 예전처럼 '코드에 있는데 아무도 못 여는' 상태로 돌아간다.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/workspace/workspace-v2-flow.js'), 'utf8');
const STEPS = fs.readFileSync(path.join(ROOT, 'js/workspace/flow/steps.js'), 'utf8');

describe('옛 편집기(A)·템플릿 화면이 되살아나지 않는다', () => {
  test('스텝 레지스트리에서 빠져 있다', () => {
    const m = STEPS.match(/var master = \[([^\]]*)\]/);
    expect(m).toBeTruthy();
    const master = m[1].split(',').map((s) => s.trim().replace(/'/g, ''));
    expect(master).not.toContain('edit');
    expect(master).not.toContain('template');
    // 살아 있는 스텝은 그대로
    for (const k of ['upload', 'layout', 'caption', 'connect']) expect(master).toContain(k);
  });

  test('STEP_FX 에 edit/template 스텝이 없다', () => {
    const fx = SRC.slice(SRC.indexOf('var STEP_FX = {'), SRC.indexOf('var STEP_FX = {') + 900);
    expect(fx).not.toMatch(/^\s*edit:\s*\{/m);
    expect(fx).not.toMatch(/^\s*template:\s*\{/m);
    expect(fx).toMatch(/upload:\s*\{/);
    expect(fx).toMatch(/caption:\s*\{/);
  });

  test('화면 섹션 마크업이 없다', () => {
    expect(SRC).not.toContain('data-fs="edit"></section>');
    expect(SRC).not.toContain('data-fs="template"></section>');
  });

  test("cta2('템플릿 선택하기') 버튼과 분기가 없다", () => {
    expect(SRC).not.toContain('data-fl="cta2"');
    expect(SRC).not.toMatch(/a === 'cta2'/);
  });

  test("발신처 0건이던 'bg'·'template' 커맨드가 없다", () => {
    expect(SRC).not.toMatch(/case 'bg':/);
    expect(SRC).not.toMatch(/case 'template':/);
  });

  test('살아 있는 커맨드는 그대로 — adjust / storyedit / goto / edit(headless)', () => {
    for (const c of ['adjust', 'storyedit', 'goto', 'edit', 'caption', 'customer', 'capvar']) {
      expect(SRC).toMatch(new RegExp("case '" + c + "':"));
    }
  });

  test("잇비 goto 는 살아 있는 화면만 연다 — 'edit' 를 보내는 곳이 없다", () => {
    const nl = fs.readFileSync(path.join(ROOT, 'js/assistant/workspace-nl-commands.js'), 'utf8');
    const gotos = [...nl.matchAll(/type: *'goto', *screen: *'([a-z]+)'/g)].map((m) => m[1]);
    expect(gotos.length).toBeGreaterThan(0);
    expect(gotos).not.toContain('edit');
    expect(gotos).not.toContain('template');
  });
});

/* [2026-09-10 실측] 잇비 adjust 커맨드가 **아무것도 안 하고 ok:true** 를 주던 것.
   `{type:'adjust', brightness:60}`(set/delta 없이 평평한 키)나 존재하지 않는 키도 ok:true.
   adjust 는 NL 커맨드 46개 중 14개로 가장 많이 쓰이고(밝게/채도/피부 보정),
   편집 화면 없이도 _refreshPreview 가 사진에 굽기 때문에 **살아 있는 경로**다. */
describe('adjust 커맨드는 안 한 걸 했다고 하지 않는다', () => {
  const i = SRC.indexOf('function _applyAdjustPatch');
  const fn = SRC.slice(i, i + 2200);

  test('인식한 키가 하나도 없으면 실패로 돌려준다', () => {
    expect(fn).toMatch(/if \(!applied\.length\) return \{ ok: false, reason: 'no_known_adjust_key'/);
  });

  test('무엇을 적용했는지 함께 돌려준다', () => {
    expect(fn).toMatch(/return \{ ok: true, applied: applied \}/);
  });

  test('헛 커맨드는 되돌리기 스택을 오염시키지 않는다 — 적용 확인 뒤에 스냅샷', () => {
    expect(fn.indexOf('d.undo.push(_snapEdit())')).toBeGreaterThan(fn.indexOf('if (!applied.length)'));
  });

  test('set / delta / beauty 세 경로 모두 인식 키를 센다', () => {
    expect(fn).toMatch(/if \(set\) Object\.keys\(set\)[\s\S]{0,90}?applied\.push\(k\)/);
    expect(fn).toMatch(/if \(delta\) Object\.keys\(delta\)[\s\S]{0,90}?applied\.push\(k\)/);
    expect(fn).toMatch(/if \(beauty\) Object\.keys\(beauty\)[\s\S]{0,110}?applied\.push\('beauty\.' \+ k\)/);
  });

  test('adjust 는 여전히 잇비가 가장 많이 쓰는 커맨드다 — 죽이지 않았다', () => {
    const nl = fs.readFileSync(path.join(ROOT, 'js/assistant/workspace-nl-commands.js'), 'utf8');
    expect((nl.match(/type: *'adjust'/g) || []).length).toBeGreaterThanOrEqual(10);
  });
});
