/* 🔴 화면과 발행본이 달랐다 — 실제 인스타 캡처를 구워보고 잡았다. [2026-08-23]
 *
 * 편집기 화면(DOM)은 `-webkit-text-stroke` 로 외곽선을 그리는데
 * 굽는 쪽(canvas)엔 `strokeText` 가 **아예 없었다.**
 * 그래서 가독성 보정의 주된 수단인 외곽선이 **발행에서 통째로 사라졌다.**
 * 증상: 플랜을 켜든 끄든 구운 결과가 **바이트까지 동일**했다.
 *
 * 이게 왜 아무 데서도 안 걸렸나 — 편집기만 열어보면 멀쩡해 보인다.
 * 굽기 결과를 실제 이미지로 비교해야 드러난다.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const ed = fs.readFileSync(path.join(ROOT, 'js/itd-editor/itd-editor.js'), 'utf8');

describe('[화면 = 발행본] 굽기가 외곽선을 그린다', () => {
  test('canvas 굽기에 strokeText 가 있다', () => {
    expect(ed).toMatch(/c\.strokeText\(ln,/);
  });

  /* [2026-09-11] 게이트가 `L.stroke` 에서 글자 스타일(`_ts === 'outline'`)로 바뀌었다.
     원장이 그림자/외곽선/배경을 직접 고르게 하면서 값을 상수 하나(TS)로 묶었고,
     `L.stroke` 는 그 스타일에서 파생되는 값이 됐다(`_applyTextStyle` 이 맞춰준다).
     ⚠️ 여기 세 개는 **소스 문자열 검사**라 구조가 바뀌면 이렇게 깨진다. 같은 계약을
     `bake-output.test.js` 가 **굽기 블록을 실제로 실행해서** 더 강하게 지킨다
     (색·두께·그림자 blur 가 화면 상수와 같은지까지 본다). 여기서는 게이트가
     '조건부인지' 만 확인하고, 값 비교는 그쪽에 맡긴다. */
  test('외곽선은 스타일이 outline 일 때만 — 무조건 그리지 않는다', () => {
    const i = ed.indexOf("if (_ts === 'outline') {");
    expect(i).toBeGreaterThan(0);
    const seg = ed.slice(i, i + 800);
    expect(seg).toMatch(/c\.strokeText/);
  });

  test('외곽선에는 그림자를 안 씌운다 — 화면보다 두꺼워 보인다', () => {
    const i = ed.indexOf("if (_ts === 'outline') {");
    const seg = ed.slice(i, ed.indexOf('c.restore();', i));
    expect(seg).toMatch(/c\.shadowBlur = 0;/);
  });

  test('굽기와 화면이 같은 상수를 읽는다 — 값을 양쪽에 따로 적지 않는다', () => {
    // 굽기 블록에 색·두께 숫자가 직접 박혀 있으면 화면과 갈라진다
    const i = ed.indexOf("if (_ts === 'outline') {");
    const seg = ed.slice(i, i + 800);
    expect(seg).toMatch(/TS\.strokeRgba/);
    expect(seg).toMatch(/TS\.strokeW/);
    expect(seg).not.toMatch(/rgba\(0,0,0,\.\d+\)/);
  });

  test('fill 보다 **먼저** 그린다 (안쪽 절반을 글자가 덮어야 화면과 비슷하다)', () => {
    const iStroke = ed.indexOf('c.strokeText(ln,');
    const iFill = ed.indexOf('c.fillText(ln, _ax', iStroke);
    expect(iStroke).toBeGreaterThan(0);
    expect(iFill).toBeGreaterThan(iStroke);
  });
});

describe('[화면 = 발행본] 굽기가 자동 초안을 기다린다', () => {
  test('플랜 체인을 S 에 노출한다', () => {
    expect(ed).toMatch(/S\._planP = window\.EditPlan\.compute\(planCtx\)/);
  });

  test('굽기 전에 기다리되 상한이 있다 — 미리보기가 영영 안 나오면 안 된다', () => {
    expect(ed).toMatch(/Promise\.race\(\[S\._planP/);
    expect(ed).toMatch(/setTimeout\(rz, 1200\)/);
  });

  test('플랜이 실패해도 굽기는 진행한다', () => {
    expect(ed).toMatch(/S\._planP\.catch\(function \(\) \{ return null; \}\)/);
  });
});
