/**
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/media-signed-url-refresh.js'), 'utf8');
const FALLBACK = fs.readFileSync(path.join(ROOT, 'js/media-fallback.js'), 'utf8');
const MANAGED = 'https://project.supabase.co/storage/v1/object/sign/user-uploads/7/workspace/a.jpg?token=old';

function bootRefresh(apiFetch) {
  delete window.MediaSignedUrlRefresh;
  window.authHeader = () => ({ Authorization: 'Bearer jwt' });
  window.apiFetch = apiFetch || jest.fn(async () => ({
    ok: true,
    json: async () => ({
      url: 'https://project.supabase.co/storage/v1/object/sign/user-uploads/7/workspace/a.jpg?token=new',
      expires_in: 3600,
    }),
  }));
  // eslint-disable-next-line no-new-func
  new Function(SRC).call(window);
  return window.apiFetch;
}

function bootFallback() {
  delete window.MediaFallback;
  // eslint-disable-next-line no-new-func
  new Function(FALLBACK).call(window);
}

function mkImg(src) {
  const img = document.createElement('img');
  img.setAttribute('src', src);
  img.getBoundingClientRect = () => ({ top: 10, bottom: 50 });
  document.body.appendChild(img);
  return img;
}

beforeEach(() => {
  jest.useRealTimers();
  document.body.innerHTML = '';
});

test('로그인 헤더로 서버에 새 임시 이미지 주소를 받아와 img를 교체한다', async () => {
  const apiFetch = bootRefresh();
  const img = mkImg(MANAGED);

  const ok = await window.MediaSignedUrlRefresh.refreshImage(img, { force: true });

  expect(ok).toBe(true);
  expect(apiFetch).toHaveBeenCalledWith('/image/signed-url', expect.objectContaining({
    method: 'POST',
    headers: expect.objectContaining({ Authorization: 'Bearer jwt' }),
  }));
  expect(JSON.parse(apiFetch.mock.calls[0][1].body)).toEqual({ url: MANAGED });
  expect(img.src).toContain('token=new');
  expect(img.dataset.mfSrc).toContain('token=new');
});

test('Supabase 관리 저장소 이미지가 아니면 갱신 API를 부르지 않는다', async () => {
  const apiFetch = bootRefresh();
  const img = mkImg('https://images.example.com/a.jpg');

  const ok = await window.MediaSignedUrlRefresh.refreshImage(img, { force: true });

  expect(ok).toBe(false);
  expect(apiFetch).not.toHaveBeenCalled();
});

test('이미지 로드 실패 시 회색 실패 UI 전에 signed URL 갱신을 먼저 시도한다', async () => {
  bootRefresh();
  bootFallback();
  const img = mkImg(MANAGED);

  img.dispatchEvent(new Event('error'));
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(img.dataset.mfSignedRetried).toBe('1');
  expect(img.src).toContain('token=new');
  expect(document.querySelector('.mf-broken')).toBeNull();
});

test('배선: index와 서비스워커가 자동연장 모듈을 로드한다', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  expect(html).toMatch(/js\/media-signed-url-refresh\.js\?v=[^"']+/);
  expect(html.indexOf('js/media-signed-url-refresh.js')).toBeLessThan(html.indexOf('js/media-fallback.js'));
  expect(sw).toContain('./js/media-signed-url-refresh.js');
});
