const fs = require('fs');
const vm = require('vm');
const core = fs.readFileSync(require('path').join(__dirname, '../app-core.js'), 'utf8');

function functionSource(name) {
  const start = core.indexOf('function ' + name + '(');
  let depth = 0;
  const body = core.indexOf('{', start);
  for (let i = body; i < core.length; i++) {
    if (core[i] === '{') depth++;
    if (core[i] === '}' && --depth === 0) return core.slice(start, i + 1);
  }
  throw new Error('missing function');
}

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

function harness(plugin) {
  const values = new Map();
  const localStorage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  const context = {
    window: { Capacitor: { Plugins: { SecureStorage: plugin }, isNativePlatform: () => true }, showToast: jest.fn() },
    _TOKEN_KEY: 'test-token', _LEGACY_TOKEN_KEY: 'old-test-token', _secureMode: true,
    _isNativePlatform: () => true, _clearAllSWRCache: jest.fn(),
    localStorage, console: { warn: jest.fn(), error: jest.fn() }, setTimeout, clearTimeout,
  };
  vm.createContext(context);
  const storage = core.slice(core.indexOf('let _tokenCache ='), core.indexOf('// 휴대폰이면 모듈 로드 즉시'));
  vm.runInContext(storage + '\n' + functionSource('setToken') + '\nthis.read = () => _tokenCache;', context);
  return { context, values };
}

function plugin(initial = 'old-token') {
  let value = initial;
  return {
    internalGetItem: jest.fn(async () => ({ data: value })),
    internalSetItem: jest.fn(async opts => { value = opts.data; }),
    internalRemoveItem: jest.fn(async () => { value = null; }),
    value: () => value,
  };
}

test('missing secure storage never creates an authenticated memory session', async () => {
  const { context } = harness(null);
  expect(await context.setToken('new-token')).toBe(false);
  expect(context.read()).toBe(null);
});

test('new login waits for old hydration and only latest token becomes readable', async () => {
  const store = plugin();
  const wait = deferred();
  store.internalGetItem.mockImplementation(() => wait.promise);
  const { context } = harness(store);
  const hydration = context._hydrateToken();
  await Promise.resolve();
  const save = context.setToken('new-token');
  expect(context.read()).toBe(null);
  wait.resolve({ data: 'old-token' });
  await hydration;
  expect(await save).toBe(true);
  expect(context.read()).toBe('new-token');
  expect(store.value()).toBe('new-token');
});

test('logout queued during slow write removes durable token and cannot be undone by hydration', async () => {
  const store = plugin();
  const wait = deferred();
  const normalSet = store.internalSetItem.getMockImplementation();
  store.internalSetItem.mockImplementation(async opts => { await wait.promise; await normalSet(opts); });
  const { context, values } = harness(store);
  const save = context.setToken('new-token');
  const logout = context.setToken(null);
  expect(context.read()).toBe(null);
  wait.resolve();
  expect(await save).toBe(false);
  expect(await logout).toBe(true);
  expect(store.value()).toBe(null);
  expect(values.get('test-token::blocked')).toBe('1');
});

test('interrupted logout marker prevents old safe-store login on next boot', async () => {
  const store = plugin();
  const { context, values } = harness(store);
  values.set('test-token::blocked', '1');
  expect(await context._hydrateToken()).toBe(null);
  expect(context.read()).toBe(null);
  expect(store.value()).toBe(null);
});

test('successful safe-store hydration removes old plaintext copies', async () => {
  const { context, values } = harness(plugin());
  values.set('test-token', 'duplicate');
  values.set('old-test-token', 'duplicate');
  expect(await context._hydrateToken()).toBe('old-token');
  expect(values.has('test-token')).toBe(false);
  expect(values.has('old-test-token')).toBe(false);
});
