/**
 * @jest-environment jsdom
 */
/* 사진이 사라졌을 때 회색 빈 칸만 남던 것 (2026-09-07 미디어감사)
 *
 * 실측: 미디어 <img> 에 onerror 가 **한 곳도 없다**.
 *   app-portfolio.js:236·299·508 · app-gallery-workshop.js:406 · js/workspace/workspace-perf.js:607
 *   전부 Supabase URL 을 src 에 그대로 넣는다. 객체가 없으면 Supabase 는 400+JSON 을 주고
 *   (404 가 아니다) <img> 는 error 를 낸다 — 실측 493ms. 그런데 받는 사람이 없어서
 *   원장님 화면엔 아무 설명 없는 빈 네모만 남는다. '아직 뜨는 중'인지 '없어진 것'인지 알 수 없고
 *   다시 시도할 방법도 없다.
 *
 * 고침: error 는 버블링을 안 하므로 캡처 단계에서 document 하나로 받는다(js/media-fallback.js).
 *   1회 캐시버스터 자동 재시도 → 그래도 실패면 '사진을 못 불러왔어요 + 다시 시도'.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/media-fallback.js'), 'utf8');

function boot() {
  document.body.innerHTML = '';
  delete window.MediaFallback;
  // eslint-disable-next-line no-new-func
  new Function(SRC).call(window);
}
/** jsdom 은 이미지를 실제로 안 받아온다 → error 를 직접 디스패치 */
function breakImg(img) { img.dispatchEvent(new Event('error')); }

function mkImg(src, attrs) {
  const i = document.createElement('img');
  i.setAttribute('src', src);
  Object.entries(attrs || {}).forEach(([k, v]) => i.setAttribute(k, v));
  document.body.appendChild(i);
  return i;
}

const DEAD = 'https://x.supabase.co/storage/v1/object/public/user-uploads/1/workspace/gone.jpg';

beforeEach(boot);

describe('사진 로드 실패는 회수된다', () => {
  test('1차 실패 → 캐시버스터로 자동 1회 재시도 (폴백 UI 는 아직 아님)', () => {
    const img = mkImg(DEAD);
    breakImg(img);
    expect(img.dataset.mfRetried).toBe('1');
    expect(img.src).toMatch(/[?&]_nc=\d+/);
    expect(document.querySelector('.mf-broken')).toBeNull();
    expect(img.hidden).toBe(false);
  });

  test('★ 2차도 실패 → 상태와 할 일이 있는 UI 로 바뀐다 (이번 버그)', () => {
    const img = mkImg(DEAD);
    breakImg(img); breakImg(img);
    const box = document.querySelector('.mf-broken');
    expect(box).not.toBeNull();
    expect(box.textContent).toContain('사진을 못 불러왔어요');
    expect(box.querySelector('.mf-broken__r').textContent).toBe('다시 시도');
    expect(img.hidden).toBe(true);           // 지우지 않는다 — 되살릴 수 있게
  });

  test('접근성 — 실패 상태에 이름이 있고 재시도는 진짜 button 이다', () => {
    const img = mkImg(DEAD);
    breakImg(img); breakImg(img);
    const box = document.querySelector('.mf-broken');
    expect(box.getAttribute('role')).toBe('img');
    expect(box.getAttribute('aria-label')).toBe('사진을 불러오지 못했어요');
    const btn = box.querySelector('.mf-broken__r');
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('type')).toBe('button');   // form 안에서 submit 안 되게
  });

  test('다시 시도 → 원본 <img> 로 돌아가고 폴백은 사라진다', () => {
    const img = mkImg(DEAD);
    breakImg(img); breakImg(img);
    document.querySelector('.mf-broken__r').click();
    expect(document.querySelector('.mf-broken')).toBeNull();
    expect(img.hidden).toBe(false);
    expect(img.dataset.mfFailed).toBe('');
    expect(img.src).toContain('/user-uploads/1/workspace/gone.jpg');
  });

  test('폴백이 두 번 겹쳐 붙지 않는다 (error 가 여러 번 와도)', () => {
    const img = mkImg(DEAD);
    breakImg(img); breakImg(img); breakImg(img); breakImg(img);
    expect(document.querySelectorAll('.mf-broken').length).toBe(1);
  });
});

describe('건드리면 안 되는 것', () => {
  test('★ inline onerror 가 있는 <img>(프로필 사진 등)는 자기 폴백을 유지한다', () => {
    const img = mkImg(DEAD, { onerror: "this.dataset.own='1'" });
    breakImg(img);
    expect(img.dataset.own).toBe('1');
    expect(img.dataset.mfRetried).toBeUndefined();
    expect(document.querySelector('.mf-broken')).toBeNull();
  });

  test('data: / blob: 이미지는 네트워크와 무관 — 손대지 않는다', () => {
    const a = mkImg('data:image/png;base64,iVBORw0KGgo=');
    const b = mkImg('blob:http://localhost/abc');
    breakImg(a); breakImg(b);
    expect(document.querySelector('.mf-broken')).toBeNull();
  });

  test('data-mf-skip="1" 로 명시 제외할 수 있다', () => {
    const img = mkImg(DEAD, { 'data-mf-skip': '1' });
    breakImg(img); breakImg(img);
    expect(document.querySelector('.mf-broken')).toBeNull();
  });

  test('<img> 아닌 요소의 error(스크립트 로드 실패 등)는 무시', () => {
    const s = document.createElement('script');
    document.body.appendChild(s);
    s.dispatchEvent(new Event('error'));
    expect(document.querySelector('.mf-broken')).toBeNull();
  });
});

describe('배선', () => {
  test('★ index.html 이 media-fallback.js 를 불러온다 (안 부르면 전부 무의미)', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    expect(html).toMatch(/<script src="js\/media-fallback\.js\?v=[^"]+"/);
  });

  test('폴백 스타일이 실제 로드되는 CSS 에 있다', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    expect(html).toContain('css/components.css');
    expect(fs.readFileSync(path.join(ROOT, 'css/components.css'), 'utf8')).toContain('.mf-broken');
  });

  test('캐시 무효화에 _t 를 쓰지 않는다 (인증 파라미터 이름과 충돌 전례)', () => {
    expect(SRC).not.toMatch(/set\(['"]_t['"]/);
    expect(SRC).toMatch(/set\(['"]_nc['"]/);
  });
});
