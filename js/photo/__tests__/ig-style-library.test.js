/* '내 스타일' 라이브러리 — 서버 CRUD + **ShopStyle 로 잇는 다리**.  [2026-09-04]
 *
 * 이 파일이 지키는 건 "새 스타일 시스템을 만들지 않았다" 는 것이다.
 * 그룹은 ShopStyle **한 개로 번역**돼서 기존 편집기 레일을 탄다.
 * 번역이 틀리면 원장 화면엔 "적용했는데 아무 일도 안 일어남" 으로 보인다 —
 * 이 앱에서 이미 여러 번 겪은 종류라 계약을 여기서 못 박는다.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const libSrc = fs.readFileSync(path.join(ROOT, 'js/photo/ig-style-library.js'), 'utf8');
const shopStyleSrc = fs.readFileSync(path.join(ROOT, 'js/workspace/shop-style.js'), 'utf8');

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _map: m
  };
}

/* 실제 ShopStyle 을 그대로 싣는다. 가짜로 대체하면 "필드명이 맞는가" 를 못 잡는다 —
   이 프로젝트에서 `thumb` vs `thumbnail_url` 로 12장을 통째로 흘린 적이 있다. */
function boot(opts = {}) {
  const store = memStorage();
  const win = { localStorage: store };
  win.localStorage.setItem('last_user_id', opts.uid || '1');
  new Function('window', 'localStorage', shopStyleSrc)(win, store);
  win.apiFetch = opts.apiFetch || (() => Promise.reject(new Error('no-net')));
  win.authHeader = () => ({ Authorization: 'Bearer T' });
  new Function('window', 'localStorage', libSrc)(win, store);
  return win;
}

const GROUP = {
  id: 7,
  name: '웜 브라운',
  archetype: 'warm_brown',
  profile: {
    visual: { brightness: 0.54, saturation: 0.25, warmth: 0.14, aspect: 0.8, palette: ['#C9A88A'] },
    text: {
      alignment: 'left', position: 'lower-left', fontClass: 'serif',
      fontWeight: 'bold', color: '#FFFFFF', sizeRatio: 0.07, usageRate: 0.8
    }
  }
};

// ── 번역 (순수 함수) ────────────────────────────────────────────────
describe('그룹 → ShopStyle 번역', () => {
  test('관찰된 축이 레이어에 실제로 실린다', () => {
    const win = boot();
    const p = win.IgStyleLibrary.toShopStylePatch(GROUP);
    const title = p.layers.find((L) => L.role === 'title');
    expect(title.align).toBe('left');
    expect(title.color).toBe('#FFFFFF');
    expect(title.size).toBeCloseTo(0.07, 3);
  });

  test('🔑 폰트는 **key** 로 실린다 — itd-editor 가 fontByKey(spec.font) 로 읽는다', () => {
    const win = boot();
    const p = win.IgStyleLibrary.toShopStylePatch(GROUP);
    const title = p.layers.find((L) => L.role === 'title');
    // 'Noto Serif KR' 같은 family 를 넣으면 편집기가 조용히 FONTS[0] 으로 떨어진다.
    expect(title.font).toBe('serif');
  });

  test('🔑 confirmed:true — 아니면 _buildShopStyleLayers 의 opt-in 게이트에 걸려 아무것도 안 박힌다', () => {
    const win = boot();
    expect(win.IgStyleLibrary.toShopStylePatch(GROUP).confirmed).toBe(true);
  });

  test('lower-left 위치가 좌표로 옮겨진다', () => {
    const win = boot();
    const p = win.IgStyleLibrary.toShopStylePatch(GROUP);
    const title = p.layers.find((L) => L.role === 'title');
    expect(title.x).toBeCloseTo(0.08, 2);     // 왼쪽
    expect(title.y).toBeGreaterThan(0.5);      // 아래쪽
  });

  test('근거 없는 축은 비운다 — 기본값으로 채우면 거짓말이 된다', () => {
    const win = boot();
    const bare = { id: 1, name: 'X', profile: { visual: {}, text: {} } };
    const p = win.IgStyleLibrary.toShopStylePatch(bare);
    const title = p.layers.find((L) => L.role === 'title');
    // ShopStyle.makeLayer 기본값은 남지만, 우리가 **관찰로 덮어쓴 값은 없어야** 한다
    expect(title.font).toBe('Pretendard');     // makeLayer 기본 — 우리가 손대지 않았다는 증거
    expect(p.frame).toBeUndefined();           // aspect 가 없으니 비율도 안 정한다
  });

  test('비율은 아는 것만 — 이상한 aspect 면 손대지 않는다', () => {
    const win = boot();
    const L = win.IgStyleLibrary;
    expect(L._ratio(0.8)).toBe('4:5');
    expect(L._ratio(1.0)).toBe('1:1');
    expect(L._ratio(0.5625)).toBe('9:16');
    expect(L._ratio(3.5)).toBeNull();          // 파노라마 — 인스타 비율이 아니다
    expect(L._ratio(null)).toBeNull();
  });

  test('글자를 거의 안 쓰는 원장이면 본문·해시태그는 꺼둔 채로 시작한다', () => {
    const win = boot();
    const quiet = JSON.parse(JSON.stringify(GROUP));
    quiet.profile.text.usageRate = 0.1;
    const p = win.IgStyleLibrary.toShopStylePatch(quiet);
    expect(p.layers.find((L) => L.role === 'body').enabled).toBe(false);
    expect(p.layers.find((L) => L.role === 'hashtag').enabled).toBe(false);
    // 제목까지 끄지는 않는다 — 그건 스타일이 아니라 기능을 없애는 것
    expect(p.layers.find((L) => L.role === 'title').enabled).not.toBe(false);
  });

  test('되추적용 연결이 남는다', () => {
    const win = boot();
    const p = win.IgStyleLibrary.toShopStylePatch(GROUP);
    expect(p.igStyleGroupId).toBe(7);
    expect(p.igArchetype).toBe('warm_brown');
  });
});

// ── ShopStyle 생성 ──────────────────────────────────────────────────
describe('ShopStyle 로 굳히기', () => {
  test('그룹 하나당 ShopStyle 하나 — 두 번 불러도 안 늘어난다', () => {
    const win = boot();
    const a = win.IgStyleLibrary.ensureShopStyle(GROUP);
    const b = win.IgStyleLibrary.ensureShopStyle(GROUP);
    expect(a.id).toBe(b.id);
    /* 목록 전체 길이로 세지 않는다 — 첫 호출이 기본 시드('우리샵 스타일 A')를 함께 만든다.
       그 시드는 전역 기본값 자리를 채워서 인스타 스타일이 기본값이 되는 걸 막는 장치다.
       세야 하는 건 **이 그룹에서 나온 스타일이 몇 개인가**. */
    const mine = win.ShopStyle.list().filter((x) => x.igStyleGroupId === GROUP.id);
    expect(mine).toHaveLength(1);
  });

  test('🔑 전역 기본값(active)을 바꾸지 않는다 — 이번 작업 스타일이 다음 글까지 따라오면 안 된다', () => {
    const win = boot();
    const mine = win.ShopStyle.create({ name: '내가 만든 스타일' }, true);
    win.IgStyleLibrary.ensureShopStyle(GROUP);
    expect(win.ShopStyle.getActiveId()).toBe(mine.id);
  });

  test('🔴 스타일이 하나도 없던 원장도 전역 기본값이 안 바뀐다 (브라우저 실측으로 잡은 구멍)', () => {
    /* `ShopStyle.create(.., false)` 는 **목록이 비어 있으면 무조건 active** 로 만든다
       (`if (makeActive || arr.length === 1)`). 게다가 `getActive()` 는 active 가 없으면
       `list()[0]` 으로 폴백한다. 그래서 우리샵 스타일을 한 번도 안 만든 원장이 인스타
       스타일을 한 번 적용하면 그게 **앞으로 모든 새 글의 기본값**이 됐다 — §22 위반.
       위 테스트는 스타일을 미리 만들어 두고 검사해서 이걸 못 봤다. */
    const win = boot();
    expect(win.ShopStyle.list()).toHaveLength(0);
    const ig = win.IgStyleLibrary.ensureShopStyle(GROUP);
    expect(win.ShopStyle.getActiveId()).not.toBe(ig.id);
    // getActive() 폴백(list()[0])까지 봐야 진짜다 — active 만 비워두면 폴백이 우리 걸 집는다
    expect(win.ShopStyle.getActive().id).not.toBe(ig.id);
  });

  test('이미 만든 스타일을 재적용이 덮어쓰지 않는다 — 원장이 다듬었을 수 있다', () => {
    const win = boot();
    const ss = win.IgStyleLibrary.ensureShopStyle(GROUP);
    win.ShopStyle.save(ss.id, { name: '내가 고친 이름' });
    const again = win.IgStyleLibrary.ensureShopStyle(GROUP);
    expect(again.name).toBe('내가 고친 이름');
  });
});

// ── 작업별 선택 (§21/§22) ───────────────────────────────────────────
describe('스타일 선택은 이번 작업에만', () => {
  function withApi(groups) {
    const calls = [];
    const api = (p, o) => {
      calls.push([p, (o && o.method) || 'GET']);
      if (p === '/instagram-style/groups' && (!o || !o.method || o.method === 'GET')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ groups }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    };
    return { api, calls };
  }

  test('apply 하면 그 작업에서만 그 스타일이 잡힌다', async () => {
    const { api } = withApi([GROUP]);
    const win = boot({ apiFetch: api });
    const ssId = await win.IgStyleLibrary.apply(7, 'slot-A');
    expect(win.IgStyleLibrary.styleForWork('slot-A').id).toBe(ssId);
    // 다른 작업엔 안 걸린다 — 이게 §22 의 핵심이다
    expect(win.IgStyleLibrary.styleForWork('slot-B')).toBeNull();
  });

  test('작업 id 가 없으면 아무 데도 안 건다', async () => {
    const { api } = withApi([GROUP]);
    const win = boot({ apiFetch: api });
    await win.IgStyleLibrary.apply(7, null);
    expect(win.IgStyleLibrary.styleForWork('slot-A')).toBeNull();
  });

  test('clearWork 로 선택을 뗀다 → 기존 기본값으로 돌아간다', async () => {
    const { api } = withApi([GROUP]);
    const win = boot({ apiFetch: api });
    await win.IgStyleLibrary.apply(7, 'slot-A');
    win.IgStyleLibrary.clearWork('slot-A');
    expect(win.IgStyleLibrary.styleForWork('slot-A')).toBeNull();
  });

  test('사용 횟수를 올리지만, 실패해도 적용은 성공이다', async () => {
    let usedCalled = false;
    const api = (p, o) => {
      if (/\/used$/.test(p)) { usedCalled = true; return Promise.reject(new Error('down')); }
      if (p === '/instagram-style/groups') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ groups: [GROUP] }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    };
    const win = boot({ apiFetch: api });
    await expect(win.IgStyleLibrary.apply(7, 'slot-A')).resolves.toBeTruthy();
    expect(usedCalled).toBe(true);
  });

  test('없는 스타일을 적용하려 하면 실패로 알린다 — 조용히 넘어가지 않는다', async () => {
    const { api } = withApi([]);
    const win = boot({ apiFetch: api });
    await expect(win.IgStyleLibrary.apply(999, 'slot-A')).rejects.toThrow();
  });
});

// ── 테넌트 격리 (§32/§34) ───────────────────────────────────────────
describe('원장 격리', () => {
  test('스타일 캐시·작업선택은 원장별로 분리된다', async () => {
    const { api } = withApiFor([GROUP]);
    const winA = boot({ apiFetch: api, uid: '1' });
    await winA.IgStyleLibrary.apply(7, 'slot-A');
    const keys = [...winA.localStorage._map.keys()];
    // 키에 테넌트가 박혀 있어야 다른 원장이 같은 기기를 써도 안 섞인다
    expect(keys.some((k) => k.includes('ig_style_pick::1'))).toBe(true);
    expect(keys.some((k) => k === 'itdasy:ig_style_pick')).toBe(false);
  });

  test('테넌트가 없으면(로그아웃) 아무것도 저장하지 않는다', () => {
    const store = memStorage();
    const win = { localStorage: store };
    new Function('window', 'localStorage', shopStyleSrc)(win, store);
    new Function('window', 'localStorage', libSrc)(win, store);
    expect(win.IgStyleLibrary.cached()).toEqual([]);
    expect(win.IgStyleLibrary.styleForWork('slot-A')).toBeNull();
  });

  function withApiFor(groups) {
    const api = (p, o) => {
      if (p === '/instagram-style/groups' && (!o || !o.method || o.method === 'GET')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ groups }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    };
    return { api };
  }
});

// ── 오프라인·오류 ───────────────────────────────────────────────────
describe('서버가 안 될 때', () => {
  test('목록은 캐시로 보여준다 — "안 보임" 보다 "조금 옛것" 이 낫다', async () => {
    const win = boot({
      apiFetch: (p, o) => {
        if (p === '/instagram-style/groups' && (!o || !o.method || o.method === 'GET')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ groups: [GROUP] }) });
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      }
    });
    await win.IgStyleLibrary.list();
    win.apiFetch = () => Promise.reject(new Error('offline'));
    await expect(win.IgStyleLibrary.list()).resolves.toHaveLength(1);
  });

  test('쓰기 실패는 조용히 삼키지 않는다 — 저장됐다고 믿게 두면 안 된다', async () => {
    const win = boot({ apiFetch: () => Promise.reject(new Error('offline')) });
    await expect(win.IgStyleLibrary.rename(1, '새 이름')).rejects.toThrow();
  });

  test('이름 중복(409)은 코드로 구분돼 화면이 안내할 수 있다', async () => {
    const win = boot({
      apiFetch: () => Promise.resolve({
        ok: false, status: 409, json: () => Promise.resolve({ detail: '같은 이름의 스타일이 이미 있어요.' })
      })
    });
    await expect(win.IgStyleLibrary.create({ name: '시크' })).rejects.toMatchObject({ code: 409 });
  });

  test('🔴 id 없는 응답이 목록을 오염시키지 않는다 (카오스 QA 실측)', async () => {
    /* 실측: PATCH 가 200 + `{}` 를 돌려준 적이 있었고, 그게 `id: undefined` 로 캐시에 들어가
       "게시물 0개" 짜리 이름 없는 줄이 목록 맨 위에 영원히 붙었다.
       id 가 없으니 지울 수도 없다 — 원장 입장에선 고칠 방법이 없는 유령이다. */
    const win = boot({
      apiFetch: (p, o) => {
        if (p === '/instagram-style/groups' && (!o || !o.method || o.method === 'GET')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ groups: [GROUP] }) });
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });  // 본문이 빈 200
      }
    });
    await win.IgStyleLibrary.list();
    await win.IgStyleLibrary.patch(7, { shop_style_id: 'x' });
    const ids = win.IgStyleLibrary.cached().map((g) => g.id);
    expect(ids).toEqual([7]);
    expect(ids).not.toContain(undefined);
  });

  test('만들었다면서 id 를 안 주면 실패로 알린다', async () => {
    const win = boot({
      apiFetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })
    });
    await expect(win.IgStyleLibrary.create({ name: '새 스타일' })).rejects.toThrow();
    expect(win.IgStyleLibrary.cached()).toEqual([]);
  });

  test('옛 캐시에 이미 든 유령 행은 읽을 때 걸러진다', () => {
    const win = boot();
    win.localStorage.setItem('itdasy:ig_style_groups::1',
      JSON.stringify([{ name: '유령' }, { id: 3, name: '진짜' }]));
    expect(win.IgStyleLibrary.cached().map((g) => g.id)).toEqual([3]);
  });

  test('자동 그룹 저장은 한 건 실패해도 나머지를 저장한다', async () => {
    let n = 0;
    const win = boot({
      apiFetch: (p, o) => {
        if (o && o.method === 'POST') {
          n++;
          if (n === 2) return Promise.resolve({ ok: false, status: 409, json: () => Promise.resolve({}) });
          return Promise.resolve({
            ok: true, status: 200,
            json: () => Promise.resolve({ id: n, name: 'g' + n, media_ids: [] })
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ groups: [] }) });
      }
    });
    const saved = await win.IgStyleLibrary.saveAuto([
      { auto_key: 'k1', name: 'A', media_ids: ['m1'] },
      { auto_key: 'k2', name: 'B', media_ids: ['m2'] },
      { auto_key: 'k3', name: 'C', media_ids: ['m3'] }
    ]);
    expect(saved).toHaveLength(2);
  });
});
