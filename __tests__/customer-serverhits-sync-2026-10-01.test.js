/**
 * @jest-environment node
 */
'use strict';
/**
 * [flow-customers-bookings-03 · 2026-10-01] 서버 검색 결과(_serverHits)가 삭제·수정 후 갱신되지 않아
 * 지운 손님이 목록에 남고(탭하면 404), 이름을 바꿔도 옛 이름이 남던 것 (200명 초과 샵).
 *
 * 실측(Playwright, 307명 샵): 검색 → 상세 → [정보수정] 이름 변경 → 목록엔 옛 이름.
 *   상세 → [삭제] → 서버 total 0 인데 목록엔 같은 행이 그대로.
 *
 * 원인: 캐시가 두 벌(_cache · _serverHits)인데 create/update/remove 와 data-changed 리스너는
 *   _cache 만 고쳤다. search() 는 `_serverHits.q === q` 면 _serverHits.items 를 돌려주므로 옛 결과를 그린다.
 *
 * 여기서 잠그는 것 (실제 app-customer.js 를 새 JSDOM 창에 올려 동작으로 본다):
 *   - 서버 검색 중 update → 목록에 새 이름 · remove → 행 없음 · create(검색어에 맞음) → 행 추가
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'app-customer.js'), 'utf8');

const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(r => setImmediate(r)); };
async function tick(ms) {
  for (let t = 0; t < ms; t += 50) { jest.advanceTimersByTime(50); await flush(); }
}

function customer(id, name) {
  return { id, name, phone: null, memo: null, tags: [], birthday: null, last_visit_at: null,
           visit_count: 0, created_at: '2026-01-01T00:00:00Z', deleted_at: null };
}

async function boot() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>',
    { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
  const w = dom.window;
  await new Promise(r => { if (w.document.readyState === 'complete') r(); else w.addEventListener('load', r); });
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  w.setTimeout = setTimeout; w.clearTimeout = clearTimeout; w.Date = Date;
  Object.defineProperty(w, 'innerWidth', { value: 390, configurable: true });
  Object.defineProperty(w, 'innerHeight', { value: 844, configurable: true });
  w.API = 'http://api.invalid';
  w.authHeader = () => ({ Authorization: 'Bearer t' });
  w._esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  w.showToast = jest.fn();

  // 서버 상태: 캐시엔 2명만 있고 전체는 300명(서버 검색이 켜지는 조건). 검색 'fea' 에 걸리는 손님은 777.
  const local = [customer(1, '가손님'), customer(2, '나손님')];
  const serverDb = new Map([[777, customer(777, 'FEA서버손님')]]);
  const log = [];
  w.apiFetch = jest.fn(async (p, opts) => {
    const method = (opts && opts.method) || 'GET';
    log.push(method + ' ' + p);
    const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
    if (/^\/customers\/duplicates/.test(p)) return json({ groups: [] });
    if (method === 'GET' && /^\/customers\?.*q=/.test(p)) {
      const q = decodeURIComponent(p.match(/q=([^&]*)/)[1]).toLowerCase();
      const items = local.concat([...serverDb.values()]).filter(c => c.name.toLowerCase().includes(q));
      return json({ items, total: items.length, has_more: false });
    }
    if (method === 'GET' && /^\/customers(\?|$)/.test(p)) return json({ items: local, total: 300, has_more: true });
    const idM = p.match(/^\/customers\/(\d+)$/);
    if (idM && method === 'PATCH') {
      const id = Number(idM[1]); const cur = serverDb.get(id);
      const next = Object.assign({}, cur, JSON.parse(opts.body)); serverDb.set(id, next);
      return json(next);
    }
    if (idM && method === 'DELETE') { serverDb.delete(Number(idM[1])); return { ok: true, status: 204 }; }
    if (method === 'POST' && /^\/customers/.test(p)) {
      const body = JSON.parse(opts.body); const c = customer(900, body.name); serverDb.set(900, c);
      return json(c, 201);
    }
    return json({}, 404);
  });
  w.sessionStorage.setItem('pv_cache::customers', JSON.stringify({ t: Date.now(), d: local, n: 300 }));
  w.eval(SRC);
  await w.openCustomers();
  await flush();
  const list = () => w.document.querySelector('#customerSheet #customerList');
  return {
    w, log, list,
    rows: () => [...list().querySelectorAll('[data-id]')].map(e => ({ id: e.getAttribute('data-id'), name: e.querySelector('.c-name-txt').textContent })),
    type: async (q) => {
      const input = w.document.getElementById('customerSearch');
      input.value = q;
      input.dispatchEvent(new w.Event('input', { bubbles: true }));
      await tick(400);   // 300ms 디바운스 뒤 서버 검색
    },
  };
}

afterEach(() => { jest.useRealTimers(); });

describe('서버 검색 결과도 캐시다 — 변경 때 같이 고친다', () => {
  test('전제: 검색 "fea" 는 서버 검색으로 777 을 찾아 보여준다', async () => {
    const h = await boot();
    await h.type('fea');
    expect(h.log.some(l => /GET \/customers\?.*q=fea/.test(l))).toBe(true);
    expect(h.rows()).toEqual([{ id: '777', name: 'FEA서버손님' }]);
  });

  test('🔴 정보수정 후 검색 결과에 새 이름이 보인다', async () => {
    const h = await boot();
    await h.type('fea');
    await h.w.Customer.update(777, { name: 'FEA서버손님수정' });
    await flush();
    expect(h.rows()).toEqual([{ id: '777', name: 'FEA서버손님수정' }]);
  });

  test('🔴 삭제 후 검색 결과에서 행이 사라진다 (유령 행 → 404 금지)', async () => {
    const h = await boot();
    await h.type('fea');
    await h.w.Customer.remove(777);
    await flush();
    expect(h.rows()).toEqual([]);
    expect(h.list().textContent).toMatch(/찾지 못했어요|검색 결과 없음/);
  });

  test('🔴 검색 0건에서 바로 등록한 손님은 검색 결과에 보인다', async () => {
    const h = await boot();
    await h.type('fea새');
    expect(h.rows()).toEqual([]);
    await h.w.Customer.create({ name: 'FEA새손님' });
    await flush();
    expect(h.rows().map(r => r.name)).toContain('FEA새손님');
  });

  test('검색어가 바뀌면 옛 서버 결과를 쓰지 않는다 (기존 계약 유지)', async () => {
    const h = await boot();
    await h.type('fea');
    await h.type('가');
    expect(h.rows().map(r => r.name)).toEqual(['가손님']);
  });
});
