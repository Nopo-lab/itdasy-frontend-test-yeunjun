/**
 * Sign in with Apple 배선 (2026-09-24)
 *  - iOS 에서 타사 로그인(카카오·네이버·구글)을 보이려면 Apple 로그인이 같이 있어야 한다(심사 4.8).
 *    가드(applyStoreReviewLoginGuard)는 플러그인이 없으면 타사 로그인을 숨긴다 → 플러그인·권한이 빠지면
 *    조용히 '이메일만' 으로 돌아간다. 그래서 설치·권한·호출 경로를 함께 고정한다.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('플러그인이 의존성에 있다', () => {
  const pkg = JSON.parse(read('package.json'));
  expect(pkg.dependencies['@capacitor-community/apple-sign-in']).toBeTruthy();
});

test('iOS 앱 타깃이 Apple 로그인 권한을 선언한다(Debug·Release 둘 다)', () => {
  const ent = read('ios/App/App/App.entitlements');
  expect(ent).toMatch(/<key>com\.apple\.developer\.applesignin<\/key>\s*<array>\s*<string>Default<\/string>/);
  const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
  expect((pbx.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g) || []).length).toBe(2);
});

describe('startAppleLogin 오류 문구', () => {
  const core = read('app-core.js');
  const src = core.slice(core.indexOf('let _appleLoginBusy'), core.indexOf('// T-324'));

  function run(err) {
    const toasts = [];
    const ctx = {
      window: {
        Capacitor: { Plugins: { SignInWithApple: { authorize: () => Promise.reject(err) } } },
        API: 'https://api.test',
      },
      showToast: (m) => toasts.push(m),
      console,
    };
    ctx.window.showToast = ctx.showToast;
    vm.runInNewContext(src, ctx);
    return ctx.window.startAppleLogin().then(() => toasts);
  }

  test('사용자가 닫으면(1001) 아무 말도 안 한다', async () => {
    expect(await run(new Error('작업을 완료할 수 없습니다.(com.apple.AuthenticationServices.AuthorizationError 오류 1001.)'))).toEqual([]);
  });

  test('애플 내부 오류 원문을 사용자에게 보이지 않는다', async () => {
    const t = await run(new Error('작업을 완료할 수 없습니다.(com.apple.AuthenticationServices.AuthorizationError 오류 1000.)'));
    expect(t).toHaveLength(1);
    expect(t[0]).not.toMatch(/AuthorizationError|com\.apple/);
  });
});

test('서버에 authorization_code 를 보낸다(탈퇴 때 Apple 연결 해제용)', async () => {
  const core = read('app-core.js');
  const src = core.slice(core.indexOf('let _appleLoginBusy'), core.indexOf('// T-324'));
  let body = null;
  const ctx = {
    window: {
      Capacitor: { Plugins: { SignInWithApple: { authorize: () => Promise.resolve({ response: { identityToken: 'id.tok.en', authorizationCode: 'c_123' } }) } } },
      API: 'https://api.test',
      location: { reload: () => {} },
    },
    fetch: (_u, o) => { body = JSON.parse(o.body); return Promise.resolve({ ok: false, json: () => Promise.resolve({ detail: 'stop' }) }); },
    showToast: () => {},
    console,
  };
  vm.runInNewContext(src, ctx);
  await ctx.window.startAppleLogin();
  expect(body.authorization_code).toBe('c_123');
  expect(body.identity_token).toBe('id.tok.en');
});
