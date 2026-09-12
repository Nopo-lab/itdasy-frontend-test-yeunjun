'use strict';

/* [인증감사 2026-09-06] 계정 전환 시 **앞 원장 데이터가 다음 원장 화면에 남던** 회귀.
 *
 * 실측(로컬 백엔드 2계정, 원장A uid49 → 원장B uid50, 브라우저 실행):
 *   ① 로그아웃 뒤에도 localStorage 에 이것들이 그대로 남았다:
 *        hv41_cache::brief = {this_month_total: 1665000, total_customers: 3}   ← 원장A 매출·고객수
 *        shop_name        = '원장A의 뷰티샵'
 *   ② 원인 A — `_clearAllSWRCache()` 가 지우는 일을 `requestAnimationFrame` 으로 미뤘다.
 *      그런데 이걸 부르는 `logout()` 은 곧바로 `location.replace` 로 나간다 → 다음 프레임이 안 온다.
 *      숨은 탭·백그라운드 탭은 rAF 자체가 멈춘다(같은 함정을 이 레포에서 여러 번 밟았다).
 *   ③ 원인 B — `_purgeUserScopedStorage()` 도 `requestIdleCallback(…, {timeout:1500})` 으로 미뤘다.
 *      timeout 이 있어도 **그 전에 페이지가 사라지면** 아무 의미가 없다.
 *   ④ 원인 C — `shop_name`·`shop_type` 은 어느 prefix 에도 안 걸리는데
 *      `_USER_KEY_EXACT` 에도 없었다. 바로 위 주석은 "shop_* 는 제거" 라고 못박아 뒀는데
 *      정작 목록엔 `shop_id` 만 있었다(주석과 코드가 어긋난 자리).
 *   ⑤ 피해 — app-home-v41.js 의 render() 는 이 캐시를 **먼저 그리고**(_hydrateHome),
 *      60초 안이면 `swr.fresh && !force` 로 **네트워크 요청조차 없이 return** 한다.
 *      즉 다음 원장 홈에 앞 원장 매출이 뜬 채 스스로 고쳐지지도 않는다.
 *
 * 아래 ⑤번 테스트가 이 결함군의 핵심 가드다: 캐시 네임스페이스가 새로 생겼는데
 * purge 목록에 안 올리면 같은 사고가 조용히 재발한다.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const coreSrc = fs.readFileSync(path.join(ROOT, 'app-core.js'), 'utf8');

function sliceFn(src, header) {
  const i = src.indexOf(header);
  if (i === -1) throw new Error('함수를 못 찾았다: ' + header);
  // 다음 최상위 `\n}` 까지 = 함수 본문
  const end = src.indexOf('\n}', i);
  return src.slice(i, end + 2);
}

describe('① 계정 경계 청소는 미루지 않는다 (rAF/rIC 금지)', () => {
  test('_clearAllSWRCache 는 requestAnimationFrame 으로 미루지 않는다', () => {
    const fn = sliceFn(coreSrc, 'function _clearAllSWRCache()');
    expect(fn).not.toMatch(/requestAnimationFrame/);
    // 실제로 지우는 코드는 그대로 있어야 한다
    expect(fn).toMatch(/removeItem/);
  });

  test('_purgeUserScopedStorage 는 requestIdleCallback 으로 미루지 않는다', () => {
    const fn = sliceFn(coreSrc, 'function _purgeUserScopedStorage()');
    expect(fn).not.toMatch(/requestIdleCallback/);
    expect(fn).toMatch(/_doPurgeStorage\(localStorage\)/);
    expect(fn).toMatch(/_doPurgeStorage\(sessionStorage\)/);
  });
});

describe('② 매장 정보는 계정 데이터다 — 전환 시 지워야 한다', () => {
  const exact = coreSrc.match(/const _USER_KEY_EXACT = \[[\s\S]*?\];/)[0];

  test('shop_name 이 _USER_KEY_EXACT 에 있다', () => {
    expect(exact).toContain("'shop_name'");
  });
  test('shop_type 이 _USER_KEY_EXACT 에 있다', () => {
    expect(exact).toContain("'shop_type'");
  });
  test('shop_* 가 KEEP(보존) 목록에 잘못 들어가 있지 않다', () => {
    const s = coreSrc.indexOf('const _USER_KEY_KEEP');
    const keep = coreSrc.slice(s, coreSrc.indexOf(']);', s));
    expect(keep).not.toContain("'shop_name'");
    expect(keep).not.toContain("'shop_type'");
  });
  test('last_user_id 는 여전히 남는다 (전환 감지 기준 — 2026-09-03 P0 회귀 방지)', () => {
    expect(exact).not.toContain("'last_user_id'");
  });
});

describe('③ /auth/me 덮어쓰기는 구멍을 못 막는다 (그래서 purge 가 필요하다)', () => {
  test('shop_name 은 비어 있으면 덮어쓰지 않는다 = 신규 원장에겐 앞 원장 상호가 남는다', () => {
    // 이 조건 자체는 옳다(빈 값으로 지우면 안 되니까). 다만 이것만으로는
    // 격리가 안 된다는 사실을 고정해 둔다 — purge 를 지우면 이 테스트가 이유를 설명한다.
    expect(coreSrc).toMatch(
      /if \(typeof me\.shop_name === 'string' && me\.shop_name\) localStorage\.setItem\('shop_name'/);
  });
});

describe('④ 비밀번호 변경은 이 기기를 로그아웃시키지 않는다', () => {
  test('성공 응답의 access_token 으로 토큰을 갈아끼운다', () => {
    const i = coreSrc.indexOf("apiFetch('/auth/change-password'");
    expect(i).toBeGreaterThan(-1);
    const after = coreSrc.slice(i, i + 1600);
    expect(after).toMatch(/data\.access_token/);
    expect(after).toMatch(/setToken\(data\.access_token\)/);
  });
});

describe('⑤ [드리프트 가드] 모든 *_cache:: 네임스페이스는 purge 대상이어야 한다', () => {
  /* 이 사고의 재발 방식은 늘 같다 — 새 SWR 캐시를 만들고 purge 목록에 안 올린다.
     그러면 그 캐시만 계정 경계를 통과한다(hv41_cache:: 가 정확히 그랬다).
     여기서 코드베이스가 **실제로 쓰는** 네임스페이스를 긁어와 목록과 대조한다. */
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === '__tests__') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|html)$/.test(e.name)) files.push(p);
    }
  })(ROOT);

  const used = new Set();
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const re = /['"`]([A-Za-z0-9_]+_cache)::/g;
    let m;
    while ((m = re.exec(src)) !== null) used.add(m[1] + '::');
  }

  const purged = coreSrc.match(/const prefixes = \[([^\]]*)\]/)[1];

  test('코드가 쓰는 캐시 네임스페이스를 최소 하나는 찾았다 (정규식이 죽지 않았는지)', () => {
    expect(used.size).toBeGreaterThan(0);
  });

  test.each([...used])('%s 가 _clearAllSWRCache 의 prefixes 에 있다', (ns) => {
    expect(purged).toContain(`'${ns}'`);
  });
});
