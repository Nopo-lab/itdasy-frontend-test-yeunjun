/* 멀티스타일 — 원장 한 명이 스타일 여러 개를 쓴다. [2026-08-23]
 *
 * 같은 '펌 1장' 인데 어떤 날은 미니멀(흰 글씨 왼쪽), 어떤 날은 포스터(검정 가운데)다.
 * 예전 키(`service|photoCount|kind|ba`)는 둘을 같은 칸에 넣었고, 그러면 `resolve` 가
 * "갈렸다" 며 그 축을 통째로 비웠다 — 안전하지만 **두 스타일 다 못 쓴다.**
 *
 * 🔴 이 파일이 필요한 이유: 사다리를 처음 짰을 때 `contextKeyLadder` 가 옛 모양(`key`)을
 *    반환하고 있었는데 **테스트 1131개가 전부 통과했다.** `resolve` 가 `step.want` 가 없으면
 *    조용히 옛 동작(정확 키 비교)으로 떨어지기 때문이다. 아무도 3·4단을 밟지 않았다.
 *    그래서 여기서는 **각 단을 직접 밟는다.**
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const load = (f, win) => { new Function('window', fs.readFileSync(path.join(ROOT, f), 'utf8'))(win); return win; };

function fresh() {
  const win = { localStorage: {
    _d: {}, getItem(k) { return this._d[k] == null ? null : this._d[k]; },
    setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } } };
  load('workspace/work-memory-engine.js', win);
  return win;
}

describe('contextKey — 스타일이 맨 앞 자리다', () => {
  const E = fresh().WorkMemoryEngine;

  test('자리는 5개: 스타일|시술|사진수|종류|전후', () => {
    expect(E.contextKey({ shopStyleId: 'ss1', service: 'perm', photoCount: 2, kind: 'service', hasBeforeAfter: true }))
      .toBe('ss1|perm|2|service|ba');
    expect(E.contextKey({})).toBe('||||');
  });

  test('스타일이 다르면 다른 칸이다', () => {
    const a = E.contextKey({ shopStyleId: 'A', service: 'perm', photoCount: 1 });
    const b = E.contextKey({ shopStyleId: 'B', service: 'perm', photoCount: 1 });
    expect(a).not.toBe(b);
  });
});

describe('사다리(§11) — 좁은 칸부터 넓은 칸으로', () => {
  const E = fresh().WorkMemoryEngine;
  const ctx = { shopStyleId: 'ss1', service: 'perm', photoCount: 1, kind: 'service', hasBeforeAfter: false };

  test('순서가 스펙 그대로다', () => {
    expect(E.contextKeyLadder(ctx).map((s) => s.via))
      .toEqual(['style_exact', 'style_service', 'exact', 'service']);
  });

  test('스타일이 없으면 스타일 단계를 아예 안 만든다', () => {
    expect(E.contextKeyLadder({ service: 'perm', photoCount: 1 }).map((s) => s.via))
      .toEqual(['exact', 'service']);
  });

  test('🔑 단마다 "키" 가 아니라 "자리 조건" 을 준다 — 아니면 아래 칸이 영영 비어 있다', () => {
    /* 학습은 항상 스타일을 달고 저장되므로 `|perm|1|service|` 같은 무스타일 키는
       아무도 만들지 않는다. 정확 키 비교로 짜면 3·4단이 죽은 코드가 된다. */
    E.contextKeyLadder(ctx).forEach((s) => {
      expect(Array.isArray(s.want)).toBe(true);
      expect(s.want.length).toBe(5);
      expect(s.key).toBeUndefined();
    });
  });

  test('자리 조건 매칭 — null 자리는 아무거나 통과', () => {
    const L = E.contextKeyLadder(ctx);
    const store = ['ss1|perm|1|service|', 'ss2|perm|1|service|', 'ss1|perm|3|promotion|ba'];
    const hit = (i) => store.filter((k) => E.contextKeyMatches(k, L[i].want));
    expect(hit(0)).toEqual(['ss1|perm|1|service|']);                       // 스타일+상황
    expect(hit(1).sort()).toEqual(['ss1|perm|1|service|', 'ss1|perm|3|promotion|ba']);  // 스타일+시술
    expect(hit(2).sort()).toEqual(['ss1|perm|1|service|', 'ss2|perm|1|service|']);      // 상황(스타일 무관)
    expect(hit(3).length).toBe(3);                                          // 시술만
  });
});

describe('🔴 오염 0 (§12) · 상충은 개입 0 (§13)', () => {
  /* resolve 는 async + 저장소가 필요해 여기서는 **판정 규칙**을 직접 검증한다.
     실제 저장소를 통과하는 확인은 브라우저 실측으로 했다(보고서 참조). */
  const src = fs.readFileSync(path.join(ROOT, 'workspace/work-memory-preferences.js'), 'utf8');

  test('resolve 가 사다리를 실제로 돈다', () => {
    expect(src).toMatch(/E\.contextKeyLadder\(context\)/);
    expect(src).toMatch(/for \(var i = 0; i < ladder\.length; i\+\+\)/);
  });

  test('넓은 칸은 값이 같으면 합쳐서 센다 (안 합치면 갈림 판정을 못 한다)', () => {
    expect(src).toMatch(/byVal\[k\]\.pos \+= \(p\.positive \|\| 0\)/);
  });

  test('갈리거나 동점이면 아래 칸으로 안 내려간다 — 다른 스타일 취향으로 덮으면 안 된다', () => {
    const i = src.indexOf('var tie = win &&');
    expect(i).toBeGreaterThan(0);
    const seg = src.slice(i, i + 900);
    expect(seg).toMatch(/if \(win && !tie\)/);
    expect(seg).toMatch(/return null;/);
  });

  test('넓은 칸에서 온 값은 내려온 만큼 확신을 깎는다 (새 상수 없이)', () => {
    expect(src).toMatch(/Math\.pow\(FALLBACK_PENALTY, i\)/);
  });
});

describe('🔴 같은 함수를 두 번 정의하면 뒤엣것이 조용히 이긴다', () => {
  /* 실제로 그랬다 — 사다리를 새로 짰는데 파일 아래쪽에 옛 정의가 남아 있어서
     새 코드가 통째로 무시됐고, 테스트 1131개가 전부 통과했다. */
  const src = fs.readFileSync(path.join(ROOT, 'workspace/work-memory-engine.js'), 'utf8');
  test.each(['contextKey', 'contextKeyLadder', 'contextKeyMatches', 'canonicalContext'])(
    '%s 정의가 하나뿐이다', (fn) => {
      const n = (src.match(new RegExp(`^\\s*function ${fn}\\(`, 'gm')) || []).length;
      expect(n).toBe(1);
    });
});
