const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const guard = html.slice(
  html.indexOf('// [T-910]'),
  html.indexOf('// ── [출시감사 2026-08-02] 서버 진실 대조'),
);

function runGuard(appBuild) {
  let onLoad;
  const sandbox = {
    window: {
      APP_BUILD: appBuild,
      __LATEST_BUILD__: 'build-current',
      addEventListener: jest.fn((_name, fn) => { onLoad = fn; }),
    },
    document: { readyState: 'loading' },
    sessionStorage: { getItem: jest.fn(() => null), setItem: jest.fn() },
    caches: { keys: jest.fn(async () => []), delete: jest.fn(async () => true) },
    navigator: { serviceWorker: { getRegistrations: jest.fn(async () => []) } },
    console: { warn: jest.fn() },
    location: { reload: jest.fn() },
    Promise,
  };
  vm.runInNewContext(guard, sandbox);
  return { sandbox, onLoad };
}

describe('느린 망의 배포 버전 검사', () => {
  test('문서 로딩 중에는 정상 파일을 실패로 오인하지 않는다', async () => {
    const { sandbox, onLoad } = runGuard(undefined);
    expect(sandbox.window.addEventListener).toHaveBeenCalledWith('load', expect.any(Function), { once: true });
    expect(sandbox.sessionStorage.setItem).not.toHaveBeenCalled();
    expect(sandbox.location.reload).not.toHaveBeenCalled();

    sandbox.window.APP_BUILD = 'build-current';
    onLoad();
    await Promise.resolve();
    expect(sandbox.sessionStorage.setItem).not.toHaveBeenCalled();
    expect(sandbox.location.reload).not.toHaveBeenCalled();
  });

  test('문서 로드 뒤에도 파일 버전이 없으면 복구를 실행한다', async () => {
    const { sandbox, onLoad } = runGuard(undefined);
    onLoad();
    await new Promise(setImmediate);
    expect(sandbox.sessionStorage.setItem).toHaveBeenCalledWith('build_busted', '1');
    expect(sandbox.location.reload).toHaveBeenCalledTimes(1);
  });
});
