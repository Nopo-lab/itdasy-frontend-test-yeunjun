/**
 * @jest-environment jsdom
 */
/* 🔴 [2026-10-01 flow-workspace-photo-10] 읽을 수 없는 파일(.txt·손상 JPG) 안내가 항상 "아이폰 설정 > 카메라 > 포맷" 을 가리켰고,
 *   EXIF 전후 추정(_precomputeBAHints)이 files[i](실패 포함 원본 순서) 와 성공한 photo[i] 를 짝지어 실패 파일이 섞이면 어긋났다
 *   (실측 diag-formats: notimage.txt·fake.jpg 에도 아이폰 안내 · [ok, bad, ok] → 두 번째 ok 사진이 bad 파일의 EXIF 를 받음).
 *
 * 수정: ① HEIC/HEIF(MIME·확장자)만 아이폰 안내, 그 외는 '이미지 파일이 아니거나 손상' + 받는 포맷(JPG·PNG·WEBP).
 *       ② addFiles 가 성공 File(okFiles)/실패 File 을 같은 인덱스로 갈라 _precomputeBAHints(okFiles, n) 에 넘긴다.
 *       ③ BMP 는 크기와 무관하게 JPEG 로 재인코딩(workspace-intake-bitmap-memory 테스트).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.ITDASY_SRC_ROOT || path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/workspace/workspace-v2-flow.js'), 'utf8');

function pickFn(head) {
  const i = SRC.indexOf(head); if (i < 0) return '';
  let depth = 0, started = false;
  for (let k = i; k < SRC.length; k++) {
    const c = SRC[k];
    if (c === '{') { depth++; started = true; } else if (c === '}') { depth--; if (started && depth === 0) return SRC.slice(i, k + 1); }
  }
  return '';
}
function msgApi(win) {
  const a = pickFn('function _isHeicFile(f)'), b = pickFn('function _unreadableFilesMsg(failedFiles)');
  if (!a || !b) return null;
  // eslint-disable-next-line no-new-func
  return new Function('window', a + '\n' + b + '; return _unreadableFilesMsg;')(win || {});
}
const F = (name, type) => ({ name, type: type || '' });

describe('① 안내 문구는 원인별로', () => {
  test('🔴 .txt·손상 JPG 만 실패: 아이폰 안내가 아니라 "이미지 파일이 아니거나 손상" + 받는 포맷', () => {
    const msg = msgApi();
    expect(msg).not.toBeNull();
    const t = msg([F('notimage.txt', 'text/plain'), F('fake.jpg', 'image/jpeg')]);
    expect(t).toMatch(/^2장은 이미지 파일이 아니거나 손상돼 뺐어요 — JPG·PNG·WEBP 사진을 골라 주세요$/);
    expect(t).not.toMatch(/아이폰/);
  });
  test('HEIC(MIME 또는 확장자)만 아이폰 "높은 호환성" 안내', () => {
    const msg = msgApi();
    expect(msg([F('IMG_1.HEIC', ''), F('IMG_2.heif', 'image/heif')])).toMatch(/^2장은 아이폰 HEIC 사진이라 읽지 못했어요 — 아이폰 설정 > 카메라 > 포맷을 '높은 호환성'으로 바꾸면 돼요$/);
  });
  test('섞이면 둘 다 말한다 · HeicConvert.isHeic 가 있으면 그 판정을 쓴다', () => {
    const msg = msgApi({ HeicConvert: { isHeic: (f) => f.name === 'octet.bin' } });
    const t = msg([F('octet.bin', 'application/octet-stream'), F('x.txt', 'text/plain')]);
    expect(t).toMatch(/1장은 아이폰 HEIC 사진이라/);
    expect(t).toMatch(/1장은 이미지 파일이 아니거나 손상돼/);
  });
});

describe('② EXIF 매핑 — 성공 파일만 같은 순서로', () => {
  test('🔴 addFiles 가 okFiles/failedFiles 를 인덱스로 가르고 _precomputeBAHints(okFiles, …) 를 부른다', () => {
    const i = SRC.indexOf('function addFiles(files, showToast, toEdit)');
    const body = SRC.slice(i, i + 6000);
    expect(body).toMatch(/rawUrls\.forEach\(function \(u, i\) \{ if \(u\) \{ urls\.push\(u\); okFiles\.push\(files\[i\]\); \} else failedFiles\.push\(files\[i\]\); \}\);/);
    expect(body).toMatch(/_precomputeBAHints\(okFiles, urls\.length\)/);
    expect(body).not.toMatch(/_precomputeBAHints\(files, urls\.length\)/);
    expect(body).toMatch(/toast\(_unreadableFilesMsg\(failedFiles\)\)/);
    expect(body).not.toMatch(/아이폰 설정 > 카메라 > 포맷을/);   // 단일 고정 문구 제거
  });
  test('🔴 [ok, bad, ok] 를 실제 분기 코드로 돌리면 EXIF 읽기 대상이 ok 파일 2개(순서 유지)', () => {
    const i = SRC.indexOf('var urls = [], okFiles = [], failedFiles = [];');
    expect(i).toBeGreaterThan(0);
    const line = SRC.slice(i, SRC.indexOf('\n', SRC.indexOf('rawUrls.forEach', i)) + 1);
    const files = [F('a.jpg', 'image/jpeg'), F('bad.txt', 'text/plain'), F('c.jpg', 'image/jpeg')];
    const rawUrls = ['data:a', null, 'data:c'];
    // eslint-disable-next-line no-new-func
    const out = new Function('files', 'rawUrls', line + '; return { urls, okFiles, failedFiles };')(files, rawUrls);
    expect(out.urls).toEqual(['data:a', 'data:c']);
    expect(out.okFiles.map((f) => f.name)).toEqual(['a.jpg', 'c.jpg']);
    expect(out.failedFiles.map((f) => f.name)).toEqual(['bad.txt']);
  });
});
