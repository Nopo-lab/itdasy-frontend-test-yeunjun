/* [운영리스크 2026-09-30 C4] 외부 CDN 코드에는 무결성 해시(SRI)와 정확한 버전이 있어야 한다.
 *
 * 이 앱은 GitHub Pages 를 원격으로 불러오는 구조라, 우리 origin 에서 도는 외부 스크립트가
 * 바뀌면 전 사용자에게 즉시 퍼진다(웹은 로그인 토큰이 localStorage 에 있다).
 * 실측(2026-09-30): Tesseract 가 `tesseract.js@5` 처럼 **떠 있는 버전**으로, heic2any·tfjs·
 * face-landmarks 는 **해시 없이** 불러오고 있었다. 해시는 npm 배포본에서 계산했고
 * Chromium 에서 정상 파일 로드 / 1바이트 변조 차단을 확인했다.
 *
 * 새 CDN 로드를 추가하면 이 테스트가 해시를 요구한다. 해시 계산:
 *   npm pack <pkg>@<ver> && tar xzf *.tgz && openssl dgst -sha384 -binary package/<path> | base64
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// 동적으로 <script> 를 만들어 CDN 을 부르는 로더들
const LOADERS = ['app-receipt-scan.js', 'js/heic-convert.js', 'app-mediapipe-loader.js'];
const CDN_JS = /https:\/\/(?:cdn\.jsdelivr\.net|unpkg\.com)\/npm\/((?:@[^/'"]+\/)?[^@/'"]+)@([^/'"]+)\/[^'"]+\.js/g;

describe('CDN 스크립트 무결성', () => {
  test.each(LOADERS)('%s — CDN 주소는 정확한 버전(x.y.z)이고 해시가 붙는다', (file) => {
    const src = read(file);
    const urls = [...src.matchAll(CDN_JS)];
    expect(urls.length).toBeGreaterThan(0);
    for (const m of urls) {
      expect({ url: m[0], exact: /^\d+\.\d+\.\d+$/.test(m[2]) }).toEqual({ url: m[0], exact: true });
    }
    expect(src).toMatch(/\.integrity\s*=/);
    expect(src).toMatch(/crossOrigin\s*=\s*'anonymous'/);
    const hashes = src.match(/sha384-[A-Za-z0-9+/]{64}/g) || [];
    expect(hashes.length).toBeGreaterThanOrEqual(1);
  });

  test('app-mediapipe-loader.js — 불러오는 CDN 스크립트마다 해시 항목이 있다', () => {
    const src = read('app-mediapipe-loader.js');
    const loaded = [...src.matchAll(/_loadScript\('([^']+)'\)/g)].map((m) => m[1]);
    expect(loaded.length).toBeGreaterThan(0);
    for (const u of loaded) expect(src).toContain(`'${u}':`);
  });

  test('index.html — 외부 스타일시트·스크립트 태그에는 전부 integrity 가 있다', () => {
    const html = read('index.html');
    const tags = [
      ...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="https:\/\/[^"]+"[^>]*>/g),
      ...html.matchAll(/<script\b[^>]*src="https:\/\/[^"]+"[^>]*>/g),
    ].map((m) => m[0]);
    expect(tags.length).toBeGreaterThan(0);
    const missing = tags.filter((t) => !/integrity="sha(256|384|512)-/.test(t));
    expect(missing).toEqual([]);
  });

  test('HEIC 로더가 만든 script 태그에 해시가 실제로 들어간다', () => {
    const made = [];
    const doc = {
      createElement: () => { const el = {}; made.push(el); return el; },
      head: { appendChild(el) { setTimeout(() => el.onload && el.onload(), 0); } },
    };
    const win = { showToast: () => {}, document: doc };
    // eslint-disable-next-line no-new-func
    new Function('window', 'document', read('js/heic-convert.js')).call(win, win, doc);
    const H = win.HeicConvert;
    // toJpeg 는 HEIC 일 때만 로더를 부른다. heic2any 는 가짜로 둔다.
    win.heic2any = undefined;
    const p = H.toJpeg({ name: 'a.heic', type: 'image/heic', size: 1 }).catch(() => {});
    return Promise.resolve().then(() => {
      const s = made.find((e) => e.src && e.src.includes('heic2any'));
      expect(s).toBeTruthy();
      expect(s.integrity).toMatch(/^sha384-/);
      expect(s.crossOrigin).toBe('anonymous');
      return p;
    });
  });
});
