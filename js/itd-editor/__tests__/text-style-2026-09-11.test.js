/* [2026-09-11] 인스타식 글자 스타일 — 기본/그림자/외곽선/배경.
 *
 * 왜 이 가드가 필요한가:
 *   이 편집기는 **화면(DOM)과 발행본(canvas)이 서로 다른 렌더러**다. 값을 양쪽에 따로 적으면
 *   조용히 갈라진다 — 실제로 2026-08-23 에 외곽선이 발행본에서만 사라진 적이 있다.
 *   이번에 바꾼 것도 정확히 그 자리라, 값이 아니라 **"둘이 같은 상수를 읽는가"** 를 계약으로 잡는다.
 *
 *   그리고 바꾸기 전 상태는 "모든 글자에 CSS 가 그림자를 강제" 였다. 기존 작업물이 그대로
 *   보여야 하므로, tstyle 이 없는 옛 초안은 반드시 'shadow'(또는 'outline')로 복원돼야 한다.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const ed = fs.readFileSync(path.join(ROOT, 'itd-editor/itd-editor.js'), 'utf8');
const css = fs.readFileSync(path.resolve(ROOT, '../css/itd-editor.css'), 'utf8');

/** 진짜 소스에서 헬퍼를 떼어내 실행한다 — 사본을 두면 진짜와 갈라져도 초록불이 뜬다. */
function helpers() {
  const marks = ['var TSTYLES = [', 'var TS = {', 'function _tstyleOf(L) {', 'function _inkOn(col) {'];
  const src = marks.map((mark) => {
    const i = ed.indexOf(mark);
    if (i < 0) throw new Error('헬퍼를 못 찾았다: ' + mark);
    const open = mark.includes('[') && !mark.includes('{') ? '[' : '{';
    const close = open === '[' ? ']' : '}';
    let j = ed.indexOf(open, i), d = 0;
    for (; j < ed.length; j++) {
      if (ed[j] === open) d++;
      else if (ed[j] === close) { d--; if (d === 0) break; }
    }
    return ed.slice(i, ed.indexOf('\n', j));
  }).join('\n');
  return new Function(src + '\n return { TS, TSTYLES, _tstyleOf, _inkOn };')();
}

describe('스타일 4종', () => {
  test('기본·그림자·외곽선·배경 네 가지다', () => {
    const { TSTYLES } = helpers();
    expect(TSTYLES.map((t) => t.key)).toEqual(['none', 'shadow', 'outline', 'bg']);
  });

  test('패널에 네 칩과 기울기 슬라이더가 렌더된다', () => {
    expect(ed).toMatch(/data-tstyle="' \+ t\.key \+ '"/);
    expect(ed).toMatch(/data-r="tilt"/);
    expect(ed).toMatch(/data-r="tiltout"/);
  });

  test('칩과 슬라이더에 핸들러가 붙어 있다 — 렌더만 있고 안 걸린 적이 있다', () => {
    expect(ed).toMatch(/\[data-tstyle\]/);
    expect(ed).toMatch(/refs\.tilt\.addEventListener\('input'/);
    expect(ed).toMatch(/refs\.tilt\.addEventListener\('change'/);
  });
});

describe('🔑 옛 초안 호환 — 바꾸기 전엔 CSS 가 모든 글자에 그림자를 강제했다', () => {
  const { _tstyleOf } = helpers();
  test('tstyle 이 없고 아무 플래그도 없으면 shadow (납작해지면 안 된다)', () => {
    expect(_tstyleOf({})).toBe('shadow');
  });
  test('shadow:false 만 저장된 옛 초안도 shadow — false 를 none 으로 읽으면 회귀다', () => {
    expect(_tstyleOf({ shadow: false })).toBe('shadow');
  });
  test('stroke 가 켜져 있으면 outline', () => {
    expect(_tstyleOf({ stroke: true })).toBe('outline');
  });
  test('tstyle 이 있으면 그게 정본', () => {
    expect(_tstyleOf({ tstyle: 'none', stroke: true, shadow: true })).toBe('none');
  });
});

describe('🔑 화면과 발행본이 같은 값을 읽는다', () => {
  const { TS } = helpers();
  test('그림자 CSS 문자열이 canvas 상수와 같은 blur·색을 담고 있다', () => {
    expect(TS.shadowCss).toContain(TS.shadowBlur + 'px');
    expect(TS.shadowCss).toContain(TS.shadowRgba);
    expect(TS.shadowCss).toContain(TS.shadowDy + 'px');
  });
  test('외곽선 CSS 문자열이 canvas 상수와 같은 색을 담고 있다', () => {
    expect(TS.strokeCss).toContain(TS.strokeRgba);
  });
  test('굽기 블록이 숫자를 직접 박지 않는다', () => {
    const i = ed.indexOf("var _ts = _tstyleOf(L);");
    expect(i).toBeGreaterThan(0);
    const seg = ed.slice(i, ed.indexOf('c.shadowOffsetY = 0;', i));
    expect(seg).toMatch(/TS\.shadowBlur/);
    expect(seg).toMatch(/TS\.shadowRgba/);
    expect(seg).toMatch(/TS\.bgRadius/);
  });
});

describe('🔑 배경박스는 줄 수와 무관하게 박스 하나 — 화면과 같아야 한다', () => {
  test('굽기가 ow/oh(요소의 실제 박스)로 그린다 — 줄마다 그리면 두 줄부터 어긋난다', () => {
    const i = ed.indexOf("if (_ts === 'bg') {");
    expect(i).toBeGreaterThan(0);
    const seg = ed.slice(i, i + 900);
    expect(seg).toMatch(/var _bw = ow, _bh = oh;/);
    expect(seg).not.toMatch(/lines\.forEach/);
  });
  test('좌우 패딩이 기본값과 같다 — 키우면 줄바꿈이 바뀐다(실측으로 물렸다)', () => {
    const { TS } = helpers();
    expect(TS.bgPadX).toBe(10);
    expect(css).toMatch(/\.itl-text\{[^}]*padding:6px 10px/s);
  });
  test('배경일 때 글자색은 배경 대비로 뒤집는다', () => {
    const { _inkOn } = helpers();
    expect(_inkOn('#FFFFFF')).toBe('#1c1316');
    expect(_inkOn('#15181D')).toBe('#ffffff');
    expect(_inkOn('rgb(255,255,255)')).toBe('#1c1316');
    expect(_inkOn('이상한값')).toBe('#ffffff');   // 못 읽으면 흰색으로 안전하게
  });
});

describe('🔑 저장 → 재편집 왕복', () => {
  test('_serLayer 가 tstyle 을 실어 보낸다', () => {
    expect(ed).toMatch(/base\.tstyle = _tstyleOf\(L\)/);
  });
  test('복원이 spec.tstyle 을 집는다', () => {
    expect(ed).toMatch(/L\.tstyle = spec\.tstyle \|\|/);
  });
  test('🔴 글자 기울기도 복원한다 — 텍스트 경로에만 빠져 있어 재편집에서 똑바로 돌아왔다', () => {
    const i = ed.indexOf('function _addShopLayerText');
    expect(i).toBeGreaterThan(0);
    const seg = ed.slice(i, ed.indexOf('\n  function ', i + 10));
    expect(seg).toMatch(/L\.rot = spec\.rot \|\| 0;/);
  });
});

describe('되돌리기', () => {
  test('_styleOf 가 스타일과 기울기를 담는다 — 안 담으면 ↩ 가 그것만 못 되돌린다', () => {
    const i = ed.indexOf('function _styleOf(L) {');
    const seg = ed.slice(i, i + 400);
    expect(seg).toMatch(/tstyle: _tstyleOf\(L\)/);
    expect(seg).toMatch(/rot: L\.rot \|\| 0/);
  });
  test('_applyStyleTo 가 되돌릴 때 DOM 도 다시 그린다', () => {
    const i = ed.indexOf('function _applyStyleTo(L, v) {');
    const seg = ed.slice(i, i + 900);
    expect(seg).toMatch(/v\.tstyle/);
    expect(seg).toMatch(/v\.rot/);
    expect(seg).toMatch(/_applyTextStyle\(L\)/);
  });
});

describe('자동 가독성 보정과의 경계', () => {
  test('원장이 스타일을 직접 고르면 자동이 못 덮는다 — 자동이 취향을 이기면 안 된다', () => {
    expect(ed).toMatch(/_ownTs = !!\(L\._own && L\._own\.tstyle\)/);
    expect(ed).toMatch(/if \(!_ownTs && _curTs !== 'bg'\)/);
    expect(ed).toMatch(/_own\(L, 'tstyle'\)/);
  });
});
