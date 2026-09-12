/**
 * @jest-environment jsdom
 */
/* HEIC 판별이 MIME 을 너무 믿던 것 (2026-09-07 미디어감사)
 *
 * 정책은 명확하다 — 클라이언트에서 heic2any 로 JPEG 변환(정책 B), 서버는 HEIC 거부(정책 C 백스톱).
 *   실측: 서버 ALLOWED_FORMATS = {JPEG,PNG,WEBP}, pillow-heif 미설치 → HEIC 는 400.
 * 그런데 판별이 `!file.type` (MIME 이 **완전히 빈** 경우)만 확장자 폴백을 태웠다.
 * MIME 을 `application/octet-stream` 으로 주는 웹뷰에선 변환을 건너뛰고 원본 HEIC 가
 * <img>/canvas 로 흘러가 실패했고, 드래그앤드롭에선 image/* 필터에도 걸려 조용히 사라졌다.
 */
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js/heic-convert.js'), 'utf8');

function load() {
  const win = { showToast: () => {}, document: { createElement: () => ({}), head: { appendChild() {} } } };
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', SRC).call(win, win, win.document);
  return win.HeicConvert;
}
const H = load();
const f = (name, type) => ({ name, type, size: 100 });

describe('HEIC 판별', () => {
  test('정식 MIME', () => {
    expect(H.isHeic(f('a.heic', 'image/heic'))).toBe(true);
    expect(H.isHeic(f('a.heif', 'image/heif'))).toBe(true);
  });

  test('MIME 이 빈 경우 확장자로 판별 (기존 동작 유지)', () => {
    expect(H.isHeic(f('IMG_0001.HEIC', ''))).toBe(true);
    expect(H.isHeic(f('IMG_0001.heif', undefined))).toBe(true);
  });

  test('★ MIME 이 application/octet-stream 이어도 확장자로 판별 (이번 버그)', () => {
    expect(H.isHeic(f('IMG_0001.HEIC', 'application/octet-stream'))).toBe(true);
    expect(H.isHeic(f('IMG_0001.heic', 'application/unknown'))).toBe(true);
  });

  test('정상 이미지 포맷은 절대 HEIC 로 오인하지 않는다', () => {
    expect(H.isHeic(f('a.jpg', 'image/jpeg'))).toBe(false);
    expect(H.isHeic(f('a.png', 'image/png'))).toBe(false);
    expect(H.isHeic(f('a.webp', 'image/webp'))).toBe(false);
    // 확장자가 heic 여도 MIME 이 진짜 이미지면 브라우저 판정을 믿는다
    expect(H.isHeic(f('weird.heic', 'image/jpeg'))).toBe(false);
  });

  test('HEIC 가 아닌 것에 오탐 없음', () => {
    expect(H.isHeic(f('a.pdf', 'application/pdf'))).toBe(false);
    expect(H.isHeic(f('a.csv', ''))).toBe(false);
    expect(H.isHeic(null)).toBe(false);
  });
});
