/**
 * @jest-environment jsdom
 */
/* 🔴 [2026-10-01 flow-workspace-photo-07] 큰 사진 5장 투입 → 합성 → 닫기를 반복하면 renderer 메모리가 라운드마다 ~100MB 남았다
 *   (실측 diag-5big: RSS 630 → 744 → 794MB, JS 힙은 16MB 평탄).
 *   원인(격리 실험 exp-decode.log): 공용 _resizeIfNeeded 가 `new Image()` + objectURL 로 원본(4000×6000)을 디코드하는데,
 *   브라우저는 <img> 로 디코드한 비트맵을 revoke 뒤에도 이미지 캐시에 남긴다 — 5장 +121MB, 10장 +239MB.
 *   createImageBitmap + close() 는 5장 +3MB, 10장 +3MB.
 *
 * 수정: ① 작업실 투입 경로는 WSFlowUtil.resizeForIntake(createImageBitmap → canvas → close()) 를 쓴다(HEIC·미지원은 기존 경로).
 *       ② 닫을 때(_releaseSessionMedia) 이 세션의 표시용 blob URL 과 크기 캐시를 돌려준다(WSBlobUrl.release).
 *       [flow-workspace-photo-10] ③ BMP 등 서버가 안 받는 포맷은 크기와 무관하게 JPEG 로 다시 굽는다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.ITDASY_SRC_ROOT || path.join(__dirname, '..');
const UTIL = fs.readFileSync(path.join(ROOT, 'js/workspace/flow/util.js'), 'utf8');
const FLOW = fs.readFileSync(path.join(ROOT, 'js/workspace/workspace-v2-flow.js'), 'utf8');
const BLOB = fs.readFileSync(path.join(ROOT, 'js/workspace/blob-url.js'), 'utf8');

function loadUtil() {
  delete window.WSFlowUtil;
  // eslint-disable-next-line no-eval
  eval(UTIL);
  return window.WSFlowUtil;
}
function fakeBitmapEnv(opts) {
  opts = opts || {};
  const made = [];
  global.createImageBitmap = jest.fn((blob, o) => {
    if (opts.reject) return Promise.reject(new Error('decode fail'));
    const bmp = { width: opts.w || 4000, height: opts.h || 6000, closed: false, close() { this.closed = true; }, opts: o };
    made.push(bmp);
    return Promise.resolve(bmp);
  });
  HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, drawImage() {} });
  HTMLCanvasElement.prototype.toBlob = function (cb, mime) { cb(new Blob(['jpeg-bytes'], { type: mime })); };
  window._resizeIfNeeded = jest.fn((f) => Promise.resolve(f));
  return made;
}
const bigFile = (name, type, bytes) => new File([new Uint8Array(bytes || 3 * 1024 * 1024)], name, { type: type || 'image/jpeg' });

describe('① resizeForIntake — createImageBitmap 으로 디코드하고 반드시 close() 한다', () => {
  test('🔴 큰 사진: 비트맵을 열고 → 축소 JPEG 로 굽고 → close() 한다 (공용 _resizeIfNeeded 는 안 탄다)', async () => {
    const made = fakeBitmapEnv({ w: 4000, h: 6000 });
    const U = loadUtil();
    expect(typeof U.resizeForIntake).toBe('function');
    const out = await U.resizeForIntake(bigFile('big.jpg'), 1920);
    expect(global.createImageBitmap).toHaveBeenCalledTimes(1);
    expect(global.createImageBitmap.mock.calls[0][1]).toEqual({ imageOrientation: 'from-image' });   // EXIF 회전은 <img> 와 같게
    expect(made[0].closed).toBe(true);
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('big.jpg');
    expect(window._resizeIfNeeded).not.toHaveBeenCalled();
  });
  test('작은 사진(긴 변 ≤ 1920, 2MB 미만)은 원본 File 그대로 — 그래도 비트맵은 close()', async () => {
    const made = fakeBitmapEnv({ w: 1200, h: 900 });
    const U = loadUtil();
    const f = bigFile('small.jpg', 'image/jpeg', 300 * 1024);
    const out = await U.resizeForIntake(f, 1920);
    expect(out).toBe(f);
    expect(made[0].closed).toBe(true);
  });
  test('[10] BMP 는 작아도 JPEG 로 다시 굽는다(서버가 BMP 를 400 으로 거절)', async () => {
    fakeBitmapEnv({ w: 800, h: 600 });
    const U = loadUtil();
    const out = await U.resizeForIntake(bigFile('photo.bmp', 'image/bmp', 100 * 1024), 1920);
    expect(out.type).toBe('image/jpeg');
    expect(out).not.toBe(undefined);
  });
  test('HEIC 는 기존 경로(_resizeIfNeeded → HeicConvert)로 넘긴다 — 변환 라이브러리 로직 중복 금지', async () => {
    fakeBitmapEnv({});
    window.HeicConvert = { isHeic: (f) => /\.heic$/i.test(f.name) };
    const U = loadUtil();
    const f = bigFile('IMG_1.HEIC', '');
    await U.resizeForIntake(f, 1920);
    expect(window._resizeIfNeeded).toHaveBeenCalledWith(f, 1920);
    expect(global.createImageBitmap).not.toHaveBeenCalled();
    delete window.HeicConvert;
  });
  test('createImageBitmap 이 실패하면(손상·초대형) 기존 경로로 떨어진다 — 동작 회귀 0', async () => {
    fakeBitmapEnv({ reject: true });
    const U = loadUtil();
    const f = bigFile('weird.jpg');
    await U.resizeForIntake(f, 1920);
    expect(window._resizeIfNeeded).toHaveBeenCalledWith(f, 1920);
  });
  test('createImageBitmap 이 없는 환경(구형 웹뷰)도 기존 경로', async () => {
    fakeBitmapEnv({});
    delete global.createImageBitmap;
    const U = loadUtil();
    const f = bigFile('old.jpg');
    await U.resizeForIntake(f, 1920);
    expect(window._resizeIfNeeded).toHaveBeenCalledWith(f, 1920);
  });
});

describe('② 배선 — addFiles 가 작업실 전용 축소 경로를 쓴다', () => {
  test('🔴 addFiles: WSU.resizeForIntake 우선, 없을 때만 window._resizeIfNeeded', () => {
    const i = FLOW.indexOf('function addFiles(files, showToast, toEdit)');
    const body = FLOW.slice(i, i + 2500);
    expect(body).toMatch(/var _resize = \(typeof WSU\.resizeForIntake === 'function'\) \? WSU\.resizeForIntake/);
  });
  test('🔴 close() 가 _releaseSessionMedia() 를 부르고, 그 안에서 세션 URL 의 blob 을 돌려준다(그려진 건 남김·플로우 숨은 화면은 예외)', () => {
    const c = FLOW.indexOf('function close()');
    expect(FLOW.slice(c, c + 4000)).toMatch(/_releaseSessionMedia\(\)/);
    const r = FLOW.indexOf('function _releaseSessionMedia()');
    expect(r).toBeGreaterThan(0);
    const body = FLOW.slice(r, r + 1600);
    expect(body).toMatch(/WSBlobUrl\.release\(urls, \{ keepInUse: true, except: el \}\)/);
    expect(body).toMatch(/delete _outDims\[u\]; delete _capPreviewDims\[u\];/);
  });
});

describe('③ WSBlobUrl.release — 돌려주되 그려져 있는 건 남긴다', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';
  function loadBlob() {
    delete window.WSBlobUrl;
    const revoked = [];
    let seq = 0;
    global.URL.createObjectURL = () => 'blob:mock/' + (++seq);
    global.URL.revokeObjectURL = (u) => { revoked.push(u); };
    // eslint-disable-next-line no-eval
    eval(BLOB);
    return { B: window.WSBlobUrl, revoked };
  }
  test('🔴 release(urls) 는 그 dataURL 의 blob URL 을 revoke 하고 캐시에서 뺀다 — 다시 disp 하면 새 URL', () => {
    const { B, revoked } = loadBlob();
    const a = B.disp(PNG); B.disp(JPG);
    expect(B.size()).toBe(2);
    expect(B.release([PNG, 'https://x/y.jpg', null])).toBe(1);
    expect(revoked).toEqual([a]);
    expect(B.size()).toBe(1);
    expect(B.disp(PNG)).not.toBe(a);
  });
  test('keepInUse: 문서에 그려져 있는 URL 은 남기고, except 안(닫힌 플로우의 숨은 화면)만 있으면 돌려준다', () => {
    const { B, revoked } = loadBlob();
    const a = B.disp(PNG), b = B.disp(JPG);
    document.body.innerHTML = '<div id="home" style="background-image:url(' + a + ')"></div>' +
      '<div id="flow"><div class="s" style="background-image:url(' + b + ')"></div></div>';
    const n = B.release([PNG, JPG], { keepInUse: true, except: document.getElementById('flow') });
    expect(n).toBe(1);
    expect(revoked).toEqual([b]);
    expect(B.size()).toBe(1);
    document.body.innerHTML = '';
  });
});
