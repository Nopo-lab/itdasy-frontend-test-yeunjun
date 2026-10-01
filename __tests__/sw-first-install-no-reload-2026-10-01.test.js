/**
 * @jest-environment node
 *
 * perf-frontend-04 (2026-10-01) — SW **첫 설치** 의 controllerchange 로 부팅이 두 번 돌았다.
 *
 * 실측(로컬 390px, 토큰 선주입 콜드 부팅 3회): document 로드 2회 [6ms, ~1.3s],
 * Fast 3G 첫 진입 14.8s 중 11.5s 에 리로드 — 콜드 script 103개를 다 받은 뒤 처음부터 다시.
 * 부팅 API 도 모두 2배(/auth/me ×2, /shop/settings ×2, /today/brief ×3 …).
 *
 * 원인: sw.js 가 install 에서 skipWaiting + activate 에서 clients.claim 을 하므로
 * **처음 설치되는 SW 도** controllerchange 를 낸다. app-core.js 의 리스너는
 * "첫 조작 전 + 로드 30초 이내" 면 무조건 location.reload() 였다.
 * 첫 설치는 지금 페이지가 이미 네트워크에서 올바른 번들을 받은 상태라 리로드로 얻는 게 없다.
 * (리로드가 의미 있는 건 '기존 controller 가 있던' 업데이트 케이스뿐.)
 *
 * 여기서는 app-core.js 의 SW 블록을 **그대로 떼어 실행**하고 controllerchange 를 쏜다.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app-core.js'), 'utf8');

function swBlock() {
  const start = SRC.indexOf('const _isCapacitor = !!(window.Capacitor');
  const end = SRC.indexOf('// [2026-07-25] 부팅 정합성 자가복구 워치독');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return SRC.slice(start, end);
}

function emitter() {
  const ls = {};
  return {
    addEventListener(t, fn) { (ls[t] = ls[t] || []).push(fn); },
    removeEventListener(t, fn) { ls[t] = (ls[t] || []).filter((f) => f !== fn); },
    emit(t, ev) { (ls[t] || []).slice().forEach((fn) => fn(ev || { type: t })); },
    listeners(t) { return (ls[t] || []).length; },
  };
}

/** 부팅: SW 등록 시점에 controller 가 있었는지(hadController)를 바꿔 가며 실행 */
function boot({ hadController }) {
  const sw = emitter();
  sw.controller = hadController ? { postMessage: jest.fn() } : null;
  sw.getRegistrations = jest.fn(async () => []);
  const reg = {
    active: { postMessage: jest.fn() },
    update: jest.fn(() => Promise.resolve()),
    addEventListener: jest.fn(),
    scope: 'https://app.test/app/',
  };
  sw.register = jest.fn(() => Promise.resolve(reg));

  const win = emitter();
  win.location = { pathname: '/app/index.html', href: 'https://app.test/app/index.html', origin: 'https://app.test', reload: jest.fn() };
  win.performance = { now: () => 1200 };   // 부팅 직후(30초 이내)
  const doc = emitter();
  doc.visibilityState = 'visible';

  const sandbox = {
    window: win, document: doc, location: win.location, performance: win.performance,
    navigator: { serviceWorker: sw },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    console: { warn: jest.fn(), log: jest.fn() },
    setInterval: jest.fn(), setTimeout,
    MessageChannel: function () { this.port1 = {}; this.port2 = {}; },
    _updateVersionBadge: jest.fn(),
  };
  vm.runInNewContext(swBlock(), sandbox);
  return { sw, win, reg };
}

const flush = () => new Promise((r) => setImmediate(r));

describe('SW controllerchange — 첫 설치는 리로드하지 않는다 (perf-frontend-04)', () => {
  test('★ 첫 설치(등록 시점 controller 없음) → controllerchange 가 와도 reload 0회', async () => {
    const { sw, win } = boot({ hadController: false });
    await flush();
    expect(sw.listeners('controllerchange')).toBeGreaterThan(0);
    sw.controller = { postMessage: jest.fn() };   // 새 SW 가 claim 했다
    sw.emit('controllerchange');
    await flush();
    expect(win.location.reload).not.toHaveBeenCalled();
    expect(win._sw_reloaded).not.toBe(true);
  });

  test('업데이트(등록 시점 controller 있음) → 부팅 중이면 기존대로 즉시 reload 1회', async () => {
    const { sw, win } = boot({ hadController: true });
    await flush();
    sw.emit('controllerchange');
    await flush();
    expect(win.location.reload).toHaveBeenCalledTimes(1);
  });

  test('첫 설치 뒤 같은 세션에서 새 배포가 오면(두 번째 controllerchange) 업데이트 정책이 적용된다', async () => {
    const { sw, win } = boot({ hadController: false });
    await flush();
    sw.controller = { postMessage: jest.fn() };
    sw.emit('controllerchange');       // 첫 설치 — 리로드 없음
    await flush();
    expect(win.location.reload).not.toHaveBeenCalled();
    sw.emit('controllerchange');       // 새 버전 활성화 — 부팅 중이므로 즉시 리로드
    await flush();
    expect(win.location.reload).toHaveBeenCalledTimes(1);
  });

  test('업데이트라도 OAuth 진행 중(itdasy_oauth_inflight)이면 리로드하지 않는다 (기존 가드 유지)', async () => {
    const sw = emitter();
    sw.controller = { postMessage: jest.fn() };
    sw.getRegistrations = jest.fn(async () => []);
    sw.register = jest.fn(() => Promise.resolve({ active: null, update: jest.fn(), addEventListener: jest.fn() }));
    const win = emitter();
    win.location = { pathname: '/app/index.html', href: 'https://app.test/app/index.html', origin: 'https://app.test', reload: jest.fn() };
    win.performance = { now: () => 1200 };
    const doc = emitter();
    const sandbox = {
      window: win, document: doc, location: win.location, performance: win.performance,
      navigator: { serviceWorker: sw },
      sessionStorage: { getItem: (k) => (k === 'itdasy_oauth_inflight' ? '1' : null), setItem: () => {} },
      console: { warn: jest.fn(), log: jest.fn() }, setInterval: jest.fn(), setTimeout,
      MessageChannel: function () { this.port1 = {}; this.port2 = {}; }, _updateVersionBadge: jest.fn(),
    };
    vm.runInNewContext(swBlock(), sandbox);
    await flush();
    sw.emit('controllerchange');
    await flush();
    expect(win.location.reload).not.toHaveBeenCalled();
  });
});
