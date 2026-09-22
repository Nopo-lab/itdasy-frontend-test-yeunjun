const fs = require('fs');
const vm = require('vm');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../app-customer-cache.js'), 'utf8');

function setup(response) {
  const disk = new Map([['pv_cache::customers', JSON.stringify({ t: Date.now(), d: [{ name: 'Old customer' }] })]]);
  const tab = new Map();
  const storage = map => ({ getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) });
  let auth = 'Bearer account-A';
  const context = { window: { API: 'https://example.invalid', authHeader: () => ({ Authorization: auth }) },
    localStorage: storage(disk), sessionStorage: storage(tab), apiFetch: () => response,
    console, Date };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { cache: context.window.CustomerCache, disk, tab, switchUser: () => { auth = 'Bearer account-B'; } };
}

test('does not read old persistent customer copies or write new ones', () => {
  const h = setup();
  expect(h.cache.read()).toBe(null);
  h.cache.set([{ name: 'Current customer' }], 1);
  expect(h.cache.read().items[0].name).toBe('Current customer');
  expect(h.disk.get('pv_cache::customers')).not.toContain('Current customer');
  expect(h.tab.get('pv_cache::customers')).toContain('Current customer');
});

test('old account response cannot populate new account cache', async () => {
  let resolve;
  const h = setup(new Promise(r => { resolve = r; }));
  const request = h.cache.fetchFresh();
  h.switchUser();
  resolve({ ok: true, json: async () => ({ items: [{ name: 'Account A customer' }], total: 1 }) });
  await expect(request).rejects.toThrow('session_changed');
  expect(h.tab.size).toBe(0);
});

function crossTab() {
  const core = fs.readFileSync(path.join(__dirname, '../app-core.js'), 'utf8');
  const code = core.slice(core.indexOf('(function _shareCacheInvalidation()'), core.indexOf('//   다른 계정 로그인'));
  const handlers = {};
  const context = { window: { addEventListener: (kind, fn) => { handlers[kind] = fn; } },
    _secureMode: false, _TOKEN_KEY: 'test-token', _userIdFromToken: token => token.split(':')[0],
    _clearAllSWRCache: jest.fn(), location: { reload: jest.fn() }, console };
  vm.runInNewContext(code, context);
  return { context, send: event => handlers.storage(event) };
}

test.each([
  { key: 'test-token', oldValue: 'A:old', newValue: 'B:new' },
  { key: 'test-token', oldValue: 'A:old', newValue: null },
  { key: null },
])('another tab account change clears private copies and screen: %j', event => {
  const h = crossTab();
  h.send(event);
  expect(h.context._clearAllSWRCache).toHaveBeenCalledTimes(1);
  expect(h.context.location.reload).toHaveBeenCalledTimes(1);
});

test('same account refresh does not reload other tabs', () => {
  const h = crossTab();
  h.send({ key: 'test-token', oldValue: 'A:old', newValue: 'A:new' });
  expect(h.context.location.reload).not.toHaveBeenCalled();
});

// Execute the shipped functions, not a copy of their security conditions. Parsing
// also keeps extraction safe when comments, template strings or braces change.
function loadFunctions(file, names, context) {
  const text = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const ast = require('espree').parse(text, { ecmaVersion: 'latest', range: true });
  const found = new Map();
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' && names.includes(node.id.name)) {
      found.set(node.id.name, text.slice(...node.range));
    }
    Object.values(node).forEach(value => {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    });
  }
  visit(ast);
  expect([...found.keys()].sort()).toEqual([...names].sort());
  vm.runInNewContext([...found.values()].join('\n'), context, { filename: file });
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function lateResponse(stage) {
  const pending = deferred();
  const reached = deferred();
  const payload = { items: [{ name: 'Synthetic account A customer' }], total: 1 };
  const writes = jest.fn();
  let auth = 'Bearer account-A';
  const response = { ok: true, status: 200, json: () => {
    if (stage === 'json') { reached.resolve(); return pending.promise; }
    return Promise.resolve(payload);
  } };
  const context = {
    window: { API: 'https://example.invalid', authHeader: () => ({ Authorization: auth }) },
    apiFetch: jest.fn(() => {
      if (stage === 'response') { reached.resolve(); return pending.promise; }
      return Promise.resolve(response);
    }),
    sessionStorage: { setItem: writes }, console, Date, setTimeout,
  };
  context.window.BookingRevenueOverlay = { enrichBrief: data => {
    if (stage === 'enrichment') { reached.resolve(); return pending.promise; }
    return Promise.resolve(data);
  } };
  return { context, payload, writes, ready: reached.promise,
    switchUser: () => { auth = 'Bearer account-B'; },
    release: () => pending.resolve(stage === 'response' ? response : payload) };
}

describe.each([
  ['app-home-v41.js', 'hv41_cache::brief', 'AUTH'],
  ['app-myshop-v3.js', 'mv3_cache::brief', null],
])('%s private brief fetch', (file, key, deniedResult) => {
  test.each(['response', 'json', 'enrichment'])('rejects old data delayed at %s', async stage => {
    const h = lateResponse(stage);
    h.context.SWR_KEY = key;
    loadFunctions(file, ['_authHeaders', '_fetchBrief', '_withBookingRevenue', '_writeSWR'], h.context);
    const request = h.context._fetchBrief();
    await h.ready;
    h.switchUser();
    h.release();
    expect(await request).toBe(deniedResult);
    expect(h.writes).not.toHaveBeenCalled();
  });

  test('same account still receives and caches the response', async () => {
    const h = lateResponse('json');
    h.context.SWR_KEY = key;
    loadFunctions(file, ['_authHeaders', '_fetchBrief', '_withBookingRevenue', '_writeSWR'], h.context);
    const request = h.context._fetchBrief();
    await h.ready;
    h.release();
    expect(await request).toEqual(h.payload);
    expect(h.writes).toHaveBeenCalledWith(key, expect.stringContaining('Synthetic account A customer'));
  });
});

describe.each(['app-dashboard.js', 'app-customer.js', 'app-revenue.js'])('%s private list fetch', file => {
  function start(h) {
    Object.assign(h.context, {
      _getCached: () => null, _setCached: h.writes, _writeSWR: h.writes,
      _writeSWRPeriod: h.writes, _periodInflight: {},
      _computeRange: () => ({ from: '2026-09-01', to: '2026-09-30' }),
      _mergeOptimistic: items => items, _cache: [], _isOffline: false, _total: 0, _hasMore: false,
    });
    const names = file === 'app-dashboard.js' ? ['_apiGet'] :
      file === 'app-customer.js' ? ['_api', '_fetchFresh'] : ['_api', '_fetchPeriodData'];
    loadFunctions(file, names, h.context);
    if (file === 'app-dashboard.js') return h.context._apiGet('/dashboard');
    if (file === 'app-customer.js') return h.context._fetchFresh();
    return h.context._fetchPeriodData('month');
  }

  test.each(['response', 'json'])('rejects old data delayed at %s before cache or consumer', async stage => {
    const h = lateResponse(stage);
    const request = start(h);
    await h.ready;
    h.switchUser();
    h.release();
    await expect(request).rejects.toThrow('session_changed');
    expect(h.writes).not.toHaveBeenCalled();
    expect(h.context._cache).toEqual([]);
  });

  test('same account still receives and caches the response', async () => {
    const h = lateResponse('json');
    const request = start(h);
    await h.ready;
    h.release();
    expect(await request).toEqual(file === 'app-dashboard.js' ? h.payload : h.payload.items);
    expect(h.writes).toHaveBeenCalledTimes(1);
  });
});

describe.each(['app-home-v41.js', 'app-myshop-v3.js'])('%s final screen boundary', file => {
  test.each([false, true])('late screen response with changed account=%s', async changeAccount => {
    const pending = deferred();
    const oldBrief = { items: [{ name: 'Synthetic account A customer' }] };
    const container = { id: 'test-root', innerHTML: '' };
    const rendered = jest.fn(() => 'rendered');
    const writes = jest.fn();
    let auth = 'Bearer account-A';
    const context = {
      _lastContainerId: null, _inFlight: false, _lastDmCount: 0, _lastCmtCount: 0,
      _authHeaders: () => ({ Authorization: auth }), _readSWR: () => null,
      // Home deliberately finishes brief first, but slots after the account
      // changes: the final render guard must not rely on the brief guard alone.
      _fetchBrief: () => file === 'app-home-v41.js' ? Promise.resolve(oldBrief) : pending.promise,
      _fetchSlots: () => pending.promise,
      _fetchDMQueueCount: async () => 0, _fetchCommentQueueCount: async () => 0,
      _showSkeleton: jest.fn(), _watchHeaderAvatar: jest.fn(), _bindEvents: jest.fn(),
      _writeSWR: writes, _hydrateHome: rendered, _composeHTML: rendered,
      requestAnimationFrame: callback => callback(), window: { scrollTo: jest.fn() },
    };
    loadFunctions(file, ['_doRender'], context);
    const request = context._doRender(container);
    rendered.mockClear(); // MyShop's empty loading screen is not private data.
    if (changeAccount) auth = 'Bearer account-B';
    pending.resolve(file === 'app-home-v41.js' ? [] : oldBrief);
    await request;
    expect(context._inFlight).toBe(false);
    expect(rendered).toHaveBeenCalledTimes(changeAccount ? 0 : 1);
    if (changeAccount) expect(writes).not.toHaveBeenCalled();
  });
});
