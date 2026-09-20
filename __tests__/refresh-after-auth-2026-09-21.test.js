/**
 * 첫 로그인 세션에서 플랜·내 샵 관리가 빈 채로 굳던 것 (2026-09-21)
 *
 * 증상(iOS 시뮬 · 심사 데모계정 review@itdasy.com · v1311 실측):
 *   설치 → 첫 로그인 직후 → 배지 '체험', 내 샵 관리가 '내 샵 / 오늘 0건 / 0원'
 *   앱을 껐다 켜면        → '잇데이 Pro / 오늘 1건 / 564,000원' 으로 정상
 *
 * 원인: 부팅 때 토큰이 없어 app-plan 의 _loadStatus() 와 app-myshop-v3 의
 *   /assistant/brief 가 각각 실패한 채 기본값으로 굳는데, 로그인 성공 후 그 둘을
 *   다시 부르는 훅이 없었다. 2026-08-17 에 같은 원인을 **홈에만** 막아뒀다
 *   (`HomeV41.refresh()`), 플랜과 내 샵 관리는 빠져 있었다.
 *
 * 🔴 앱 심사관이 밟는 경로가 정확히 이것이라 Apple 2.1 로 직결된다.
 *
 * 이 테스트가 고정하는 것:
 *   1) 인증 직후 경로가 **홈만** 새로고침하고 끝나지 않는다 — 플랜도 같이 부른다
 *   2) 로그인·가입·생체 **세 경로 모두** 같은 훅을 쓴다(한쪽만 고쳐지는 재발 방지)
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app-core.js'), 'utf8');

/** 주석을 걷어낸 코드만 본다 — 주석 속 단어에 속지 않기 위해(2026-09-20 에 실제로 속았다). */
function codeOnly(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('인증 직후 새로고침 훅', () => {
  const code = codeOnly(SRC);

  test('refreshAfterAuth 가 정의되어 있다', () => {
    expect(/function\s+refreshAfterAuth\s*\(/.test(code)).toBe(true);
  });

  test('refreshAfterAuth 가 홈만이 아니라 플랜까지 갱신한다', () => {
    const m = code.match(/function\s+refreshAfterAuth\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/);
    expect(m).toBeTruthy();
    const body = m[1];
    // 홈 재렌더
    expect(body).toMatch(/HomeV41[\s\S]*refresh/);
    // 플랜 재조회 — 이게 빠져서 '체험' 으로 굳었다
    expect(body).toMatch(/refreshPlanStatus/);
    // brief 를 쓰는 시트들 깨우기
    expect(body).toMatch(/itdasy:data-changed/);
  });

  test('로그인·가입·생체 세 경로가 모두 같은 훅을 쓴다', () => {
    const calls = code.match(/refreshAfterAuth\s*\(\s*\)/g) || [];
    // 정의부의 `function refreshAfterAuth()` 는 위 정규식에 안 걸린다(뒤에 { 가 옴).
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });

  test('인증 경로에 HomeV41.refresh() 직접 호출이 남아 있지 않다', () => {
    /* 남아 있으면 그 경로만 또 홈만 새로고침하게 된다 — 이번 버그가 정확히 그 모양이었다.
       3346행처럼 인증과 무관한 곳의 호출은 허용하므로, '가입/생체/로그인 직후' 표식이
       붙은 줄만 본다. */
    const suspicious = code
      .split('\n')
      .filter((l) => /HomeV41[\s\S]*refresh\s*\(\s*\)/.test(l))
      .filter((l) => /로그인|가입|생체/.test(l));
    expect(suspicious).toEqual([]);
  });
});
