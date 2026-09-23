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
const PROD = 'https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
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
