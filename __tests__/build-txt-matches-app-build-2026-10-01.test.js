/**
 * @jest-environment node
 *
 * flow-workspace-photo-07 · build.txt 부분 (2026-10-01)
 *
 * index.html 의 '서버 진실 대조' 는 부팅 3초 뒤 build.txt 를 받아 __LATEST_BUILD__ 와 다르면
 * 캐시·SW 를 비우고 리로드한다. 배포본은 deploy.yml 이 build.txt·APP_BUILD·__LATEST_BUILD__ 를
 * 한 값으로 같이 쓰지만, **레포 커밋 시점엔** build.txt 만 낡은 채 남았다(20260915 vs 20260916).
 * 그래서 레포를 그대로 서빙하는 모든 로컬/CI 실행(smoke:flow, Playwright 하네스, 감사 측정)이
 * 부팅 3초 뒤 리로드되고, 리로드 뒤엔 지연 로드 그룹이 없어 작업실 스모크가 4/6 FAIL 로 끝났다.
 *
 * 두 겹으로 막는다:
 *  1) 레포의 build.txt == APP_BUILD == __LATEST_BUILD__ == CACHE_VERSION (여기서 검사 — 어긋나면 jest 가 실패)
 *  2) localhost/127.0.0.1 에서는 서버 대조 자체를 건너뛴다 — 로컬엔 '서버' 가 없다(레포 그대로 서빙).
 *     Capacitor 앱도 hostname 이 localhost 인데, 거기선 build.txt 가 번들 안의 파일이라 대조가 무의미하다.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('레포의 빌드 식별자 4종이 한 값이다', () => {
  const buildTxt = read('build.txt').trim();
  const appBuild = read('app-core.js').match(/window\.APP_BUILD = ['"]([^'"]+)['"];/)[1];
  const latest = read('index.html').match(/window\.__LATEST_BUILD__ = ['"]([^'"]+)['"];/)[1];
  const swVer = read('sw.js').match(/const CACHE_VERSION = ['"]([^'"]+)['"];/)[1];

  test('★ build.txt == APP_BUILD (어긋나면 로컬 부팅 3초 뒤 리로드가 난다)', () => {
    expect(buildTxt).toBe(appBuild);
  });
  test('APP_BUILD == __LATEST_BUILD__ == CACHE_VERSION', () => {
    expect(appBuild).toBe(latest);
    expect(appBuild).toBe(swVer);
  });
  test('build.txt 는 한 줄, 공백·개행 없이 식별자만', () => {
    expect(read('build.txt')).toMatch(/^[0-9A-Za-z._-]+$/);
  });
});

/** index.html 의 서버 대조 블록만 떼어 실행한다 (setTimeout 은 즉시 실행으로 바꿔 3초를 기다리지 않는다) */
function runServerCheck({ hostname, mine = 'build-a', server = 'build-b' }) {
  const html = read('index.html');
  const start = html.indexOf('// ── [출시감사 2026-08-02] 서버 진실 대조');
  expect(start).toBeGreaterThan(-1);
  const end = html.indexOf('</script>', start);
  const block = html.slice(start, end);
  const sandbox = {
    window: { __LATEST_BUILD__: mine },
    location: { hostname, reload: jest.fn() },
    sessionStorage: { getItem: jest.fn(() => null), setItem: jest.fn() },
    fetch: jest.fn(async () => ({ ok: true, text: async () => server })),
    setTimeout: (fn) => fn(),
    console: { warn: jest.fn() },
    caches: { keys: async () => [], delete: async () => true },
    navigator: { serviceWorker: { getRegistrations: async () => [] } },
    Date,
  };
  sandbox.window.location = sandbox.location;
  vm.runInNewContext(block, sandbox);
  return sandbox;
}
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };

describe('서버 빌드 대조는 localhost 에서 건너뛴다', () => {
  test.each(['localhost', '127.0.0.1'])('★ %s — build.txt 를 받지도, 리로드하지도 않는다', async (hostname) => {
    const sb = runServerCheck({ hostname });
    await flush();
    expect(sb.fetch).not.toHaveBeenCalled();
    expect(sb.location.reload).not.toHaveBeenCalled();
  });

  test('배포 호스트 — 서버가 더 최신이면 기존대로 세션 1회 리로드', async () => {
    const sb = runServerCheck({ hostname: 'nopo-lab.github.io' });
    await flush();
    expect(sb.fetch).toHaveBeenCalledTimes(1);
    expect(String(sb.fetch.mock.calls[0][0])).toMatch(/^build\.txt\?_=/);
    expect(sb.sessionStorage.setItem).toHaveBeenCalledWith('srv_build_checked', '1');
    expect(sb.location.reload).toHaveBeenCalledTimes(1);
  });

  test('배포 호스트 — 같은 빌드면 아무것도 안 한다', async () => {
    const sb = runServerCheck({ hostname: 'nopo-lab.github.io', mine: 'same', server: 'same' });
    await flush();
    expect(sb.fetch).toHaveBeenCalledTimes(1);
    expect(sb.location.reload).not.toHaveBeenCalled();
  });
});
