'use strict';

/* [Editor A · 2026-09-10 실측] 보정 도구를 눌러도 **조절 슬라이더가 화면에 안 나오던 것** — 회귀 고정.
 *
 * 실측(780×844, 라이브):
 *   '대비' 클릭 → 슬라이더가 y=780 에 렌더되는데 CTA 액션바(763~844) 뒤라
 *   document.elementFromPoint(중앙) === .wsv2flow__actionbar → 보이지도 눌리지도 않음.
 *   scrollTop 은 0 그대로(자동 스크롤 없음). 원장 눈에는 '눌러도 아무 일 없는 버튼'.
 *
 * 또한 이 화면(Editor A)은 죽은 코드가 아니다 — 잇비의 command({type:'goto',screen:'edit'})
 * 와 bg/template 커맨드가 setScreen('edit') 로 실제 진입한다(런타임 확인).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/workspace/workspace-v2-flow.js'), 'utf8');

describe('Editor A · 보정 조절부가 화면에 보인다', () => {
  test('보정 도구를 고르면 조절부를 가시 영역으로 스크롤한다', () => {
    expect(SRC).toMatch(/basictool\)[\s\S]{0,600}?_scrollAdjIntoView\('\[data-ed-basic\]'\)/);
  });

  test('고급(뷰티) 도구도 같이 처리한다', () => {
    expect(SRC).toMatch(/beautytool\)[\s\S]{0,220}?_scrollAdjIntoView\('\[data-ed-adv\]'\)/);
  });

  test('가시 밴드를 사진 아래 ~ 액션바 위로 잡는다', () => {
    const fn = SRC.slice(SRC.indexOf('function _scrollAdjIntoView'));
    expect(fn).toMatch(/\.ed-photo/);                 // 위 경계 = 고정 사진 영역 아래
    expect(fn).toMatch(/wsv2flow__actionbar/);        // 아래 경계 = CTA 액션바 위
    expect(fn).toMatch(/closest\('\.wsv2flow__s'\)/); // 실제 스크롤 컨테이너
  });

  test('이미 다 보이면 스크롤하지 않는다 — 불필요한 튐 방지', () => {
    const fn = SRC.slice(SRC.indexOf('function _scrollAdjIntoView'));
    expect(fn).toMatch(/if \(sTop >= top && sBot <= bot - 8\) return;/);
    expect(fn).toMatch(/Math\.abs\(delta\) < 1\) return;/);   // 1px 미만 이동은 무시
  });

  test('측정 실패해도 편집을 막지 않는다', () => {
    const i = SRC.indexOf('function _scrollAdjIntoView');
    const fn = SRC.slice(i, i + 3200);
    expect(fn).toMatch(/catch \(_e\)/);
    expect(fn).toMatch(/if \(!sec\) return;/);
    expect(fn).toMatch(/if \(!isFinite\(sTop\) \|\| !isFinite\(sBot\)\)/);   // 자식이 하나도 없어도 폴백
  });
});

describe('Editor A · 도달 경로가 살아 있다 (죽은 코드 아님)', () => {
  test("잇비 goto 커맨드가 SCREENS 의 화면을 연다", () => {
    expect(SRC).toMatch(/case 'goto':[\s\S]{0,220}?setScreen\(cmd\.screen\)/);
  });
  test("누끼(bg)·템플릿 커맨드가 edit 화면으로 진입한다", () => {
    expect(SRC).toMatch(/case 'bg':[\s\S]{0,200}?cur !== 'edit'\) setScreen\('edit'\)/);
    expect(SRC).toMatch(/case 'template':[\s\S]{0,200}?cur !== 'edit'\) setScreen\('edit'\)/);
  });
});


/* [2026-09-10 실측] 잇비 adjust 커맨드가 **아무것도 안 하고 ok:true** 를 주던 것.
   `{type:'adjust', brightness:60}`(set/delta 없이 평평한 키) → 적용 0, 그런데 ok:true.
   존재하지 않는 키도 ok:true. 잇비는 "밝기 낮췄어요" 라고 말하는데 화면은 그대로다. */
describe('adjust 커맨드는 안 한 걸 했다고 하지 않는다', () => {
  const fn = SRC.slice(SRC.indexOf('function _applyAdjustPatch'), SRC.indexOf('function _applyAdjustPatch') + 2200);

  test('인식한 키가 하나도 없으면 실패로 돌려준다', () => {
    expect(fn).toMatch(/if \(!applied\.length\) return \{ ok: false, reason: 'no_known_adjust_key'/);
  });

  test('무엇을 적용했는지 함께 돌려준다', () => {
    expect(fn).toMatch(/return \{ ok: true, applied: applied \}/);
  });

  test('헛 커맨드는 되돌리기 스택을 오염시키지 않는다 — 적용 확인 뒤에 스냅샷', () => {
    const iCheck = fn.indexOf("if (!applied.length)");
    const iSnap = fn.indexOf('d.undo.push(_snapEdit())');
    expect(iCheck).toBeGreaterThan(-1);
    expect(iSnap).toBeGreaterThan(iCheck);   // 실패 반환이 스냅샷보다 먼저
  });

  test('set / delta / beauty 세 경로 모두 인식 키를 센다', () => {
    expect(fn).toMatch(/if \(set\) Object\.keys\(set\)[\s\S]{0,90}?applied\.push\(k\)/);
    expect(fn).toMatch(/if \(delta\) Object\.keys\(delta\)[\s\S]{0,90}?applied\.push\(k\)/);
    expect(fn).toMatch(/if \(beauty\) Object\.keys\(beauty\)[\s\S]{0,110}?applied\.push\('beauty\.' \+ k\)/);
  });
});


/* [2026-09-10 3차 실측] 사진 뷰포트가 64vh 고정(844 화면=540px)이라 조절부 밴드가 141px 뿐이었다.
   배경 패널(도구줄 67 + 버튼 40 + 색상 40)은 거기 안 들어가서 버튼 0/3, 색상 0/10 이 가려졌다.
   사진을 늘 줄이면 주 화면이 손해라 **긴 패널일 때만** 줄인다.
   수정 후 실측: 사진 540→388, 버튼 3/3 · 색상 10/10 · 도구 6/6 전부 도달. */
describe('긴 패널일 때만 사진을 줄여 조절부 자리를 만든다', () => {
  const CSS = require('fs').readFileSync(require('path').join(ROOT, 'css/workspace-v2-flow.css'), 'utf8');

  test('is-tallpanel 규칙이 사진 높이를 줄인다', () => {
    expect(CSS).toMatch(/\.wsv2flow\.is-tallpanel \.ed-photo-vp \{ height: clamp\(/);
  });

  test('기본 높이(64vh)는 그대로 둔다 — 주 화면 손해 방지', () => {
    expect(CSS).toMatch(/\.wsv2flow \.ed-photo-vp \{[^}]*height: clamp\(360px, 64vh, 720px\)/);
  });

  test('배경 도구일 때만 클래스를 붙인다', () => {
    expect(SRC).toMatch(/classList\.toggle\('is-tallpanel', d\.basicTool === 'background'\)/);
  });

  test('섹션 높이는 래퍼가 아니라 자식 합집합으로 잰다 — 래퍼는 높이 0 으로 collapse 한다', () => {
    const fn = SRC.slice(SRC.indexOf('function _scrollAdjIntoView'));
    expect(fn).toMatch(/sec\.querySelectorAll\('\*'\)/);
    expect(fn).toMatch(/rr\.width > 0 && rr\.height > 0/);
  });

  test('짧은 섹션은 하단 정렬, 긴 섹션은 상단 정렬', () => {
    const fn = SRC.slice(SRC.indexOf('function _scrollAdjIntoView'));
    expect(fn).toMatch(/var delta = fits \? \(sBot - \(bot - 8\)\) : \(sTop - \(top \+ 8\)\)/);
  });

  test('스크롤 값은 컨테이너 범위로 클램프한다', () => {
    const fn = SRC.slice(SRC.indexOf('function _scrollAdjIntoView'));
    expect(fn).toMatch(/Math\.max\(0, Math\.min\(sc\.scrollHeight - sc\.clientHeight/);
  });
});
