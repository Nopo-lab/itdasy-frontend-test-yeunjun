/* 스타일별 선택 → 적용 → 저장 → 복원.  [2026-09-04 스타일 E2E 게이트]
 *
 * 여기 있는 두 계약은 **브라우저 매트릭스(A~F)에서 실제로 깨진 걸 잡고 고친 것**이다.
 * 유닛테스트는 둘 다 통과하고 있었다 — 합성 workId 를 직접 넘겨서 진짜 경로를 안 탔기 때문이다.
 *
 * P0-1  작업키가 저장 시점에야 생겼다
 *   `d.slot` 은 `buildSlot()` — 즉 **저장·발행** 때 만들어진다. 그런데 원장이 스타일을 고르는 건
 *   사진 올린 직후, 그 한참 전이다. slot.id 를 작업키로 쓰면 그때는 null 이라
 *   선택이 아무 데도 안 걸리고 편집기는 기본 스타일로 연다 — "골랐는데 안 먹는다".
 *
 * P0-2  스냅샷이 명시적 선택을 눌렀다 (게이트가 둘인데 하나만 봄)
 *   A 적용 → 저장 → B 선택 → 편집기가 **여전히 A**.
 *   `_restore` 를 비워도 `_finalEs` 가 `p0.editState` 를 **한 번 더** 읽고 있었다.
 *   §20(스냅샷 우선)은 '자동 개인화' 로부터 지키는 규칙이지, 원장이 직접 고른 걸 막는 규칙이 아니다.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const flow = fs.readFileSync(path.join(ROOT, 'js/workspace/workspace-v2-flow.js'), 'utf8');
const libSrc = fs.readFileSync(path.join(ROOT, 'js/photo/ig-style-library.js'), 'utf8');
const shopSrc = fs.readFileSync(path.join(ROOT, 'js/workspace/shop-style.js'), 'utf8');

function mem(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k), _map: m };
}

function boot(api) {
  const store = mem({ last_user_id: '1' });
  const win = { localStorage: store };
  new Function('window', 'localStorage', shopSrc)(win, store);
  win.apiFetch = api || (() => Promise.reject(new Error('offline')));
  win.authHeader = () => ({});
  new Function('window', 'localStorage', libSrc)(win, store);
  return win;
}

const GROUPS = [
  { id: 1, name: 'A', profile: { visual: { aspect: 0.8 }, text: { alignment: 'left', position: 'lower-left', fontClass: 'sans', color: '#FFFFFF', sizeRatio: 0.07, usageRate: 0.8 } } },
  { id: 2, name: 'B', profile: { visual: { aspect: 1.0 }, text: { alignment: 'center', position: 'center', fontClass: 'display', color: '#FF0000', sizeRatio: 0.12, usageRate: 0.9 } } }
];
const API = (p, o) => {
  const m = (o && o.method) || 'GET';
  const J = v => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(v) });
  if (p === '/instagram-style/groups' && m === 'GET') return J({ groups: GROUPS });
  return J({});
};

// ── P0-1 ────────────────────────────────────────────────────────────
describe('P0-1 작업키는 **저장 전에도** 있어야 한다', () => {
  test('flow 가 open() 에서 세션 작업키를 만든다', () => {
    expect(flow).toMatch(/_workId: 'wk_' \+ uid\(\)/);
  });

  test('_workKey() 가 slot.id 가 아니라 세션키를 먼저 본다', () => {
    const fn = flow.slice(flow.indexOf('function _workKey()'), flow.indexOf('function _buildShopStyleLayers()'));
    // 세션키(_workId)가 먼저, slot.id 는 폴백
    expect(fn.indexOf('d._workId')).toBeLessThan(fn.indexOf('d.slot && d.slot.id'));
  });

  test('getActiveSlot 이 workId 를 노출한다 — 시트가 이걸 쓴다', () => {
    expect(flow).toMatch(/workId: _workKey\(\)/);
  });

  test('시트는 workId 를 slotId 보다 먼저 쓴다', () => {
    const sheet = fs.readFileSync(path.join(ROOT, 'js/photo/ig-style-sheet.js'), 'utf8');
    expect(sheet).toMatch(/_as\.workId \|\| _as\.slotId/);
  });
});

// ── P0-2 ────────────────────────────────────────────────────────────
describe('P0-2 명시적 선택이 저장된 스냅샷을 이긴다 (한 번만)', () => {
  test('flow 가 _restore 와 _finalEs **양쪽**에서 fresh pick 을 본다', () => {
    // 🔴 한쪽만 고치면 증상이 그대로다 — 실제로 그렇게 한 번 틀렸다.
    expect(flow).toMatch(/var _restore = \(!_freshPick && !_hasBg && p0 && p0\.editState\) \|\| null;/);
    expect(flow).toMatch(/\(o\.fresh \|\| _freshPick\) \? _wmEd : \(\(p0 && p0\.editState\) \|\| _wmEd\)/);
  });

  test('한 번 쓰면 소비된다 — 그 뒤 편집은 정상 복원(§20 유지)', () => {
    expect(flow).toMatch(/if \(_freshPick\) \{ try \{ _IGL\.markApplied\(_workKey\(\)\); \}/);
  });

  test('apply 하면 fresh, markApplied 하면 소비', async () => {
    const win = boot(API);
    await win.IgStyleLibrary.apply(1, 'wk_1');
    expect(win.IgStyleLibrary.isFreshPick('wk_1')).toBe(true);
    win.IgStyleLibrary.markApplied('wk_1');
    expect(win.IgStyleLibrary.isFreshPick('wk_1')).toBe(false);
    // 스타일 자체는 그대로 남는다 — 소비는 '다시 덮어쓸지' 만 결정한다
    expect(win.IgStyleLibrary.styleForWork('wk_1')).toBeTruthy();
  });

  test('다른 스타일을 새로 고르면 다시 fresh 가 된다', async () => {
    const win = boot(API);
    await win.IgStyleLibrary.apply(1, 'wk_1');
    win.IgStyleLibrary.markApplied('wk_1');
    await win.IgStyleLibrary.apply(2, 'wk_1');
    expect(win.IgStyleLibrary.isFreshPick('wk_1')).toBe(true);
    expect(win.IgStyleLibrary.styleForWork('wk_1').igStyleGroupId).toBe(2);
  });

  test('작업키가 없으면 fresh 가 아니다 — 엉뚱한 작업에 안 걸린다', () => {
    const win = boot(API);
    expect(win.IgStyleLibrary.isFreshPick(null)).toBe(false);
    expect(win.IgStyleLibrary.isFreshPick('없는키')).toBe(false);
  });
});

// ── 스타일별 정체성 ─────────────────────────────────────────────────
describe('A/B 가 서로 섞이지 않는다', () => {
  test('각 그룹이 자기 ShopStyle 을 갖고 속성이 다르다', async () => {
    const win = boot(API);
    const idA = await win.IgStyleLibrary.apply(1, 'wk_A');
    const idB = await win.IgStyleLibrary.apply(2, 'wk_B');
    expect(idA).not.toBe(idB);
    const A = win.ShopStyle.get(idA), B = win.ShopStyle.get(idB);
    const tA = A.layers.find(l => l.role === 'title'), tB = B.layers.find(l => l.role === 'title');
    expect([tA.font, tA.align, tA.color, tA.size]).toEqual(['pretendard', 'left', '#FFFFFF', 0.07]);
    expect([tB.font, tB.align, tB.color, tB.size]).toEqual(['black', 'center', '#FF0000', 0.12]);
    expect(A.frame.ratio).toBe('4:5');
    expect(B.frame.ratio).toBe('1:1');
  });

  test('작업마다 다른 스타일이 걸린다', async () => {
    const win = boot(API);
    const idA = await win.IgStyleLibrary.apply(1, 'wk_A');
    const idB = await win.IgStyleLibrary.apply(2, 'wk_B');
    expect(win.IgStyleLibrary.styleForWork('wk_A').id).toBe(idA);
    expect(win.IgStyleLibrary.styleForWork('wk_B').id).toBe(idB);
  });

  test('이름이 같아도 id 로 구분된다 — name 으로 식별하면 안 된다', async () => {
    const dup = [{ id: 7, name: '같은이름', profile: { visual: {}, text: { alignment: 'left' } } },
      { id: 8, name: '같은이름', profile: { visual: {}, text: { alignment: 'right' } } }];
    const api = (p, o) => {
      const m = (o && o.method) || 'GET';
      const J = v => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(v) });
      if (p === '/instagram-style/groups' && m === 'GET') return J({ groups: dup });
      return J({});
    };
    const win = boot(api);
    const i7 = await win.IgStyleLibrary.apply(7, 'w7');
    const i8 = await win.IgStyleLibrary.apply(8, 'w8');
    expect(i7).not.toBe(i8);
    expect(win.ShopStyle.get(i7).igStyleGroupId).toBe(7);
    expect(win.ShopStyle.get(i8).igStyleGroupId).toBe(8);
  });
});

// ── 선택 기록이 무한히 쌓이지 않는다 ────────────────────────────────
describe('선택 기록 상한', () => {
  test('작업키는 세션마다 새로 생기므로 상한이 있어야 한다', async () => {
    const win = boot(API);
    for (let i = 0; i < 30; i++) await win.IgStyleLibrary.apply(1, 'wk_' + i);
    const picks = JSON.parse(win.localStorage.getItem('itdasy:ig_style_pick::1'));
    expect(Object.keys(picks).length).toBeLessThanOrEqual(20);
    // 마지막 것은 반드시 살아 있어야 한다
    expect(picks['wk_29']).toBeTruthy();
  });
});
