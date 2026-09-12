/**
 * @jest-environment jsdom
 *
 * BUG-S1 회귀 — **로그인이 늦으면 작업실이 영영 0개로 남던 것.**
 *
 * 라이브 실측(2026-09-12, 로그아웃→로그인 사이클 1회차):
 *   서버 3 / 로컬 **0** / 화면 **0** + "첫 글을 만들어보세요".
 *   30초를 더 기다려도 그대로였고, `WorkspaceSync.sync()` 를 **한 번** 부르자 즉시 3개 복구.
 *   즉 pull 로직은 멀쩡했고 **깨우는 사람이 없었다.**
 *
 * 왜: 부팅 폴링이 `ready()`(=로그인됨)를 20회×800ms = **16초만** 기다리고 포기한다.
 * 로그아웃하면 페이지가 `?_logout=` 으로 다시 뜨는데, 그 16초 안에 로그인하지 못하면
 * 남은 트리거는 `online` 과 `visibilitychange` 뿐 — **같은 탭에서 로그인하면 둘 다 안 온다.**
 * 원장이 비밀번호를 천천히 치면 재현되는, 시간에 달린 결함이었다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CORE = fs.readFileSync(path.join(ROOT, 'app-core.js'), 'utf8');
const SYNC = fs.readFileSync(path.join(ROOT, 'js/workspace/workspace-sync.js'), 'utf8');

describe('BUG-S1 · 세션이 생기면 동기화가 깨어난다', () => {
  test('🔴 sync 가 session-ready 를 구독한다 (이번 버그)', () => {
    const i = SYNC.indexOf("addEventListener('itdasy:session-ready'");
    expect(i).toBeGreaterThan(-1);
    expect(SYNC.slice(i, i + 120)).toMatch(/sync\(\)/);
  });

  test('🔴 세션 확립 지점이 그 신호를 실제로 쏜다 (안 쏘면 구독이 무의미)', () => {
    const i = CORE.indexOf('async function applyNewSession');
    expect(i).toBeGreaterThan(-1);
    const body = CORE.slice(i, i + 3000);
    expect(body).toMatch(/dispatchEvent\([\s\S]{0,120}itdasy:session-ready/);
  });

  test('신호는 last_user_id 를 저장한 뒤에 나간다 (구독자가 로그인됨으로 보게)', () => {
    const i = CORE.indexOf('async function applyNewSession');
    const body = CORE.slice(i, i + 3000);
    const setUser = body.indexOf("localStorage.setItem('last_user_id'");
    const fire = body.indexOf('itdasy:session-ready');
    expect(setUser).toBeGreaterThan(-1);
    expect(fire).toBeGreaterThan(setUser);
  });

  test('기존 트리거(online·visibilitychange)를 없애지 않았다', () => {
    expect(SYNC).toMatch(/addEventListener\('online'/);
    expect(SYNC).toMatch(/addEventListener\('visibilitychange'/);
  });

  test('부팅 폴링도 그대로 남아 있다 (빠른 로그인 경로 유지)', () => {
    expect(SYNC).toMatch(/function boot\(\)[\s\S]{0,140}tries\+\+ < 20/);
  });
});

describe('BUG-S1 · 구독이 실제로 sync 를 부른다 (실행 검증)', () => {
  test('session-ready 이벤트 하나로 sync 가 호출된다', () => {
    let called = 0;
    const sync = () => { called += 1; };
    // 실제 소스의 구독 줄을 그대로 떼어 실행한다
    const i = SYNC.indexOf("window.addEventListener('itdasy:session-ready'");
    const line = SYNC.slice(i, SYNC.indexOf('\n', i) + 1);
    expect(line).toMatch(/session-ready/);
    // eslint-disable-next-line no-new-func
    new Function('window', 'sync', line)(window, sync);
    window.dispatchEvent(new CustomEvent('itdasy:session-ready', { detail: {} }));
    expect(called).toBe(1);
  });

  test('로드 순서에 묶이지 않는다 — core 가 WorkspaceSync 를 직접 부르지 않는다', () => {
    const i = CORE.indexOf('async function applyNewSession');
    const body = CORE.slice(i, i + 3000);
    expect(body).not.toMatch(/WorkspaceSync\s*\.\s*sync\s*\(/);
  });
});
