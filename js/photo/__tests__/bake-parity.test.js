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

  test('외곽선은 L.stroke 일 때만 — 무조건 그리지 않는다', () => {
    const i = ed.indexOf('if (L.stroke) {');
    expect(i).toBeGreaterThan(0);
    const seg = ed.slice(i, ed.indexOf('c.shadowBlur = 8', i));
    expect(seg).toMatch(/c\.strokeText/);
  });

  test('화면과 같은 색·두께를 쓴다 (DOM 은 1px rgba(0,0,0,.5) 중앙 기준)', () => {
    const i = ed.indexOf('if (L.stroke) {');
    const seg = ed.slice(i, i + 700);
    expect(seg).toMatch(/strokeStyle = 'rgba\(0,0,0,\.5\)'/);
    expect(seg).toMatch(/lineWidth = Math\.max\(1, 2 \* \(L\.scale \|\| 1\)\)/);
  });

  test('외곽선에는 그림자를 안 씌운다 — 화면보다 두꺼워 보인다', () => {
    const i = ed.indexOf('if (L.stroke) {');
    const seg = ed.slice(i, ed.indexOf('c.shadowBlur = 8', i));
    expect(seg).toMatch(/c\.shadowBlur = 0;/);
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
