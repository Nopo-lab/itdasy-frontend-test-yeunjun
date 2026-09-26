/**
 * 앱 내장 번들(iOS 시뮬레이터) 점검에서 나온 심사 직결 결함 2건 (2026-09-24)
 *  1) Apple 로그인 없는 iOS 앱에서 타사 로그인을 숨기는 가드(applyStoreReviewLoginGuard)가
 *     찾는 id 가 로그인 화면 개편 때 빠져서, 가드가 조용히 아무것도 못 숨겼다(심사 4.8).
 *  2) 구독 화면 '이용약관' 이 상대경로+_blank 라 WKWebView 가 무시해 안 열렸다(심사 3.1.2).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const core = fs.readFileSync(path.join(ROOT, 'app-core.js'), 'utf8');

describe('타사 로그인 가드가 실제 요소를 잡는다', () => {
  const body = core.slice(core.indexOf('function applyStoreReviewLoginGuard'), core.indexOf('window.applyStoreReviewLoginGuard ='));
  const ids = [...body.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);

  test('가드가 id 를 찾는다(추출 자체가 비면 검사가 무의미)', () => {
    expect(ids).toEqual(expect.arrayContaining(['loginSocialDivider', 'socialLoginWrap', 'loginAppleBtn']));
  });

  test.each(['loginSocialDivider', 'socialLoginWrap', 'loginAppleBtn'])('index.html 에 id="%s" 가 있다', (id) => {
    expect(html).toContain(`id="${id}"`);
  });

  test('socialLoginWrap 이 카카오·네이버·구글 버튼을 모두 감싼다', () => {
    const start = html.indexOf('id="socialLoginWrap"');
    const end = html.indexOf('</div>', start);
    const block = html.slice(start, end);
    for (const b of ['loginKakaoBtn', 'loginNaverBtn', 'loginGoogleBtn']) expect(block).toContain(b);
  });
});

describe('새 창으로 여는 법적 문서 링크는 절대주소다', () => {
  test('target=_blank 인 terms/privacy 링크에 상대경로가 없다', () => {
    const bad = [...html.matchAll(/<a\b[^>]*>/g)]
      .map((m) => m[0])
      .filter((tag) => /target=["']_blank["']/.test(tag))
      .filter((tag) => /href=["'](?!https?:|mailto:|tel:)[^"']*(terms|privacy)[^"']*["']/.test(tag));
    expect(bad).toEqual([]);
  });
});
