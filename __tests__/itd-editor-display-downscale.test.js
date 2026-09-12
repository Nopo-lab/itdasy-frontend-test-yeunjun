/**
 * [성능 2026-09-09] 편집기 표시용 축소본 가드
 *
 * 실 Chrome 계측(dpr1, 2400x1800, scale(4) 확대 + 확대/축소 반복 3회):
 *   JPEG 430KB → 59fps(median 16.6ms) / 불투명 PNG 5MB → 29fps(median 50.5ms, 33ms초과 103프레임)
 *   같은 5MB PNG 를 긴 변 2000px JPEG(339KB)로 축소 → 59fps(16.4ms, 초과 0)
 * 원인은 누끼·filter·2겹 오버레이가 아니라 **dataURL 바이트 크기**였다(전부 대조군 60fps).
 *
 * 이 테스트가 지키는 계약 3가지:
 *  1) 표시(photoCss)는 _cssUrl 을 거친다 — 직접 'url("'+x+'")' 조립이 다시 생기면 실패.
 *  2) 내보내기는 S.photoUrl(원본)을 쓴다 — 축소본이 발행 화질에 새면 실패.
 *  3) 투명 PNG 는 축소해도 PNG 로 유지한다(JPEG 로 바꾸면 누끼 배경이 검게 깨진다).
 */
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'itd-editor', 'itd-editor.js'), 'utf8');

describe('itd-editor 표시용 축소본', () => {
  test('1) photoCss 를 손으로 조립하는 코드가 남아 있지 않다', () => {
    const raw = SRC.match(/photoCss\s*[:=]\s*'url\("'/g) || [];
    expect(raw).toEqual([]);
  });

  test('1b) photoCss 대입은 전부 _cssUrl 을 거친다', () => {
    const assigns = SRC.match(/photoCss\s*[:=][^;,\n]*/g) || [];
    const bad = assigns.filter((a) => !/_cssUrl\(/.test(a) && !/S\.photoCss;/.test(a) && !/=\s*S\.photoCss/.test(a));
    expect(bad).toEqual([]);
  });

  test('2) exportComposite 는 원본(S.photoUrl)을 로드한다 — 축소본 아님', () => {
    const i = SRC.indexOf('function exportComposite');
    expect(i).toBeGreaterThan(-1);
    const body = SRC.slice(i, i + 4000);
    expect(body).toMatch(/loadImg\(S\.photoUrl\)/);
    expect(body).not.toMatch(/loadImg\(_disp\(/);
  });

  test('3) 투명 여부는 확장자가 아니라 실제 알파로 판정한다', () => {
    const i = SRC.indexOf('function _prepDisp');
    expect(i).toBeGreaterThan(-1);
    const body = SRC.slice(i, i + 3000);
    // 확장자로 갈라서 PNG 를 유지하던 1차 수정은 5MB 불투명 PNG 축소본이 3.4MB PNG 로 남아
    // 42fps 에서 안 올라갔다. 반드시 _hasAlpha 로 갈라야 한다.
    expect(body).toMatch(/_hasAlpha\(cv\)/);
    expect(body).toMatch(/toDataURL\('image\/png'\)/);
    expect(body).toMatch(/toDataURL\('image\/jpeg', 0\.9\)/);
    // 분기 조건이 확장자로 되돌아가면 실패
    expect(body).not.toMatch(/\/\^data:image\\\/png\/i\.test\(url\) \?/);
  });

  test('3b) _hasAlpha 는 읽기 실패 시 PNG 를 유지한다(투명 깨짐 방지)', () => {
    const i = SRC.indexOf('function _hasAlpha');
    expect(i).toBeGreaterThan(-1);
    const body = SRC.slice(i, i + 800);
    expect(body).toMatch(/catch[\s\S]*return true/);
  });

  test('3c) 알파가 있는데도 크면 한 단계 더 줄인다', () => {
    expect(SRC).toMatch(/DISP_SMALL_EDGE\s*=\s*\d{3,4}/);
    const i = SRC.indexOf('function _prepDisp');
    expect(SRC.slice(i, i + 3000)).toMatch(/out\.length > DISP_BYTES/);
  });

  test('4) 임계값이 사라지지 않았다(무조건 축소/무조건 통과 방지)', () => {
    expect(SRC).toMatch(/DISP_MAX_EDGE\s*=\s*\d{3,4}/);
    expect(SRC).toMatch(/DISP_BYTES\s*=\s*\d{6,}/);
    expect(SRC).toMatch(/DISP_PIXELS\s*=\s*\d{6,}/);
  });

  test('5) 축소본이 더 크면 원본을 쓴다(역효과 방지)', () => {
    const i = SRC.indexOf('function _prepDisp');
    const body = SRC.slice(i, i + 2200);
    expect(body).toMatch(/out\.length\s*<\s*url\.length/);
  });
});
