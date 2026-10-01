/**
 * 백엔드 주소 결정 규칙 (2026-09-23)
 *  1) 웹 localhost → 항상 로컬 백엔드. 주소·저장값으로 운영에 붙는 길이 없다(개발은 로컬에서만).
 *  2) 앱(Capacitor)은 hostname 이 localhost 여도 항상 운영 — 앱 내장 번들에서 로컬로 붙으면 앱 전체가 죽는다.
 *  3) 배포 도메인 → 운영.
 * 같은 규칙이 app-core.js · oauth-return.html · reset-password.html 세 곳에 있어 셋 다 고정한다.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PROD = 'https://itdasy-backend-test-644329093453.asia-northeast3.run.app';
const LOCAL = 'http://localhost:8000';

function ctx({ host, search = '', native = false, stored = null }) {
  const store = new Map(stored ? [['itdasy_api', stored]] : []);
  const loc = { hostname: host, search };
  return {
    window: { location: loc, Capacitor: native ? { isNativePlatform: () => true } : undefined },
    location: loc,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    store,
  };
}

function appCoreApi(opts) {
  const s = fs.readFileSync(path.join(ROOT, 'app-core.js'), 'utf8');
  const code = s.slice(s.indexOf('const PROD_API'), s.indexOf('// [2026-08-22 UX-COLD]')) + '\n;API';
  const c = ctx(opts);
  return { api: vm.runInNewContext(code, c), store: c.store };
}

function htmlApi(file, startMarker, opts) {
  const s = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const a = s.indexOf(startMarker);
  const b = s.indexOf(';', s.indexOf("'" + PROD + "'", a));
  expect(a).toBeGreaterThan(-1);
  return vm.runInNewContext(s.slice(a, b + 1) + '\n;API', ctx(opts));
}

const CASES = [
  ['웹 localhost', { host: 'localhost' }, LOCAL],
  ['웹 127.0.0.1', { host: '127.0.0.1' }, LOCAL],
  ['앱(iOS/Android) localhost', { host: 'localhost', native: true }, PROD],
  ['배포 도메인', { host: 'nopo-lab.github.io' }, PROD],
  ['웹 localhost + 옛 ?api=live', { host: 'localhost', search: '?api=live' }, LOCAL],
  ['웹 localhost + 옛 ?api=staging', { host: 'localhost', search: '?api=staging' }, LOCAL],
  ['웹 localhost + 옛 저장값 live', { host: 'localhost', stored: 'live' }, LOCAL],
  ['웹 localhost + 옛 저장값 staging', { host: 'localhost', stored: 'staging' }, LOCAL],
];

describe('app-core.js API 결정', () => {
  test.each(CASES)('%s', (_n, opts, want) => {
    expect(appCoreApi(opts).api).toBe(want);
  });

  test('옛 스위치 저장값은 localhost 에서 청소된다', () => {
    expect(appCoreApi({ host: 'localhost', stored: 'live' }).store.has('itdasy_api')).toBe(false);
  });

  test('운영으로 붙는 옛 스위치 코드가 되살아나지 않는다', () => {
    const s = fs.readFileSync(path.join(ROOT, 'app-core.js'), 'utf8');
    expect(s).not.toMatch(/_API_(STAGING|LIVE)_OVERRIDE/);
  });
});

describe.each([
  ['oauth-return.html', 'var IS_NATIVE'],
  ['reset-password.html', 'var isNative'],
])('%s API 결정', (file, marker) => {
  test.each(CASES.slice(0, 4))('%s', (_n, opts, want) => {
    expect(htmlApi(file, marker, opts)).toBe(want);
  });
});

/* [2026-10-01] 1e8a261 이 oauth-return·reset-password 만 고치고 **booking-confirm.html 과 admin/*.html 을
 * 빠뜨려** 그 세 페이지는 운영(이름은 staging) 백엔드로 계속 붙었다. 손님이 받는 예약 확정 링크는
 * 테스트 백엔드가 발급한 토큰인데 운영 서버가 검증하니 항상 실패한다. 독립 페이지는 app-core.js 를
 * 안 읽으므로 주소가 각자 박혀 있다 — 전부 같은 호스트인지 여기서 고정한다. */
describe('독립 페이지(app-core.js 를 안 읽는 HTML)도 같은 백엔드를 본다', () => {
  const STANDALONE = ['booking-confirm.html', 'admin/support-reply.html', 'admin/moderation-reply.html'];

  test.each(STANDALONE)('%s 는 운영(staging) 주소를 참조하지 않는다', (file) => {
    const s = fs.readFileSync(path.join(ROOT, file), 'utf8');
    expect(s).not.toMatch(/itdasy-backend-staging-/);
    expect(s).toContain(PROD);
  });

  test('booking-confirm.html: localhost 는 로컬, 배포 도메인은 테스트 백엔드', () => {
    expect(htmlApi('booking-confirm.html', 'var isLocal', { host: 'localhost' })).toBe(LOCAL);
    expect(htmlApi('booking-confirm.html', 'var isLocal', { host: 'nopo-lab.github.io' })).toBe(PROD);
  });

  test.each(['admin/support-reply.html', 'admin/moderation-reply.html'])('%s: 토큰 키가 app-core.js 와 같다', (file) => {
    const s = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const a = s.indexOf('const PROD_API');
    const b = s.indexOf(';', s.indexOf('const TOKEN_KEY', a));
    const key = vm.runInNewContext(s.slice(a, b + 1) + '\n;TOKEN_KEY', ctx({ host: 'nopo-lab.github.io' }));
    const core = fs.readFileSync(path.join(ROOT, 'app-core.js'), 'utf8');
    const ca = core.indexOf('const PROD_API');
    const cb = core.indexOf(';', core.indexOf('const _TOKEN_KEY', ca));
    const coreKey = vm.runInNewContext(core.slice(ca, cb + 1) + '\n;_TOKEN_KEY', ctx({ host: 'nopo-lab.github.io' }));
    expect(key).toBe(coreKey);
    expect(key).toBe('itdasy_token::staging');
  });
});
