/* 배포 안전 계약 — 2026-08-21 실사고(라이브 404 3건) 재발 방지.
 *
 * 이 파일이 잠그는 것은 "검사가 있다"가 아니라 **"두 검사가 서로 다른 질문을 한다"** 이다.
 *   filesystem mode : 지금 디스크에 파일이 있는가?      → 배포 직전(CI). 체크아웃 기준.
 *   git mode        : 이 커밋 뒤 저장소에 남아 있는가?  → 커밋 직전. tracked+staged 기준.
 * 사고는 **둘이 답이 다른 구간**에서 났다 — 로컬엔 있는데 커밋엔 없었다.
 * 하나로 합치려는 시도가 나오면 이 테스트가 막는다.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SMOKE = path.join(ROOT, 'scripts', 'smoke-check.js');
const src = fs.readFileSync(SMOKE, 'utf8');

function runSmoke(args) {
  try {
    const out = execFileSync('node', [SMOKE, ...args], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') };
  }
}

describe('[배포안전] 두 모드는 서로 다른 질문을 한다', () => {
  test('git mode 존재판정은 파일시스템이 아니라 git 에게 묻는다', () => {
    expect(src).toMatch(/git', \['ls-files'\]/);
    expect(src).toMatch(/'diff', '--cached', '--name-only'/);
    expect(src).toMatch(/const GIT_MODE = process\.argv\.includes\('--git'\)/);
  });

  test('git mode 는 버전 3종 검사를 건너뛴다 (안 그러면 모든 커밋이 막힌다)', () => {
    // deploy.yml 이 빌드 때 주입하므로 로컬은 항상 불일치가 정상이다
    expect(src).toMatch(/if \(!GIT_MODE\) \{[\s\S]*CACHE_VERSION[\s\S]*\}/);
  });

  test('filesystem mode 는 버전 검사를 유지한다 (배포 게이트)', () => {
    const r = runSmoke([]);
    // 로컬 작업본은 버전이 어긋나 있는 게 정상 → 이 모드에서는 걸려야 한다
    expect(r.out).toMatch(/CACHE_VERSION|APP_BUILD|__LATEST_BUILD__/);
  });
});

describe('[배포안전] 매니페스트를 검사 대상에 포함한다', () => {
  test('js/load-groups.js 를 읽어 참조 파일을 자동 추출한다 (하드코딩 목록 금지)', () => {
    expect(src).toMatch(/read\('js\/load-groups\.js'\)/);
    expect(src).toMatch(/matchAll\(/);
    // 파일 목록을 스크립트에 박아두면 항목이 늘 때 또 빠뜨린다
    expect(src).not.toMatch(/const KNOWN_GROUP_FILES = \[/);
  });

  test('index.html · sw.js · load-groups.js 세 곳을 모두 본다', () => {
    expect(src).toMatch(/read\('index\.html'\)/);
    expect(src).toMatch(/read\('sw\.js'\)/);
    expect(src).toMatch(/read\('js\/load-groups\.js'\)/);
  });

  test('현재 저장소는 git mode 를 통과한다', () => {
    expect(runSmoke(['--git']).code).toBe(0);
  });
});

describe('[배포안전] 사고 재현 — 매니페스트가 없는 파일을 부르면 막힌다', () => {
  const LG = path.join(ROOT, 'js', 'load-groups.js');
  let backup;
  beforeEach(() => { backup = fs.readFileSync(LG, 'utf8'); });
  afterEach(() => { fs.writeFileSync(LG, backup); });

  test('저장소에 없는 파일을 등록하면 git mode 가 차단한다', () => {
    fs.writeFileSync(LG, backup.replace(
      "  'js/photo/photo-context.js",
      "  'js/photo/__never-committed__.js?v=1',\n  'js/photo/photo-context.js"));
    const r = runSmoke(['--git']);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/__never-committed__\.js/);
    expect(r.out).toMatch(/저장소에 없음/);
  });

  test('filesystem mode 도 없는 파일이면 차단한다 (CI 최종 게이트)', () => {
    fs.writeFileSync(LG, backup.replace(
      "  'js/photo/photo-context.js",
      "  'js/photo/__nope__.js?v=1',\n  'js/photo/photo-context.js"));
    const r = runSmoke([]);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/__nope__\.js/);
  });
});

describe('[배포안전] pre-commit 이 실제로 git mode 를 건다', () => {
  test('.husky/pre-commit 이 smoke --git 을 실행한다', () => {
    const hook = fs.readFileSync(path.join(ROOT, '.husky', 'pre-commit'), 'utf8');
    expect(hook).toMatch(/smoke-check\.js --git/);
    expect(hook).toMatch(/exit 1/);
  });
});

describe('[워크트리] 공유 위험을 세션 시작에 알린다', () => {
  const guard = path.join(ROOT, 'scripts', 'worktree-guard.js');

  test('가드가 존재하고 JSON 판정을 낸다', () => {
    expect(fs.existsSync(guard)).toBe(true);
    const out = execFileSync('node', [guard, '--json'], { cwd: ROOT, encoding: 'utf8' });
    const j = JSON.parse(out);
    expect(j).toHaveProperty('sharedRisk');
    expect(j).toHaveProperty('isPrimary');
    expect(j).toHaveProperty('otherWorktrees');
  });

  test('가드는 경고만 하고 작업을 막지 않는다 (막으면 사람들이 꺼버린다)', () => {
    const g = fs.readFileSync(guard, 'utf8');
    // 위험 판정에서 프로세스를 죽이면 안 된다 — 차단은 pre-commit 소관
    expect(g).not.toMatch(/sharedRisk[\s\S]{0,200}process\.exit\(1\)/);
  });

  test('SessionStart 훅에 등록돼 있다', () => {
    const s = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude', 'settings.json'), 'utf8'));
    const cmds = (s.hooks.SessionStart || []).flatMap((h) => (h.hooks || []).map((x) => x.command || ''));
    expect(cmds.join(' ')).toMatch(/worktree-guard\.js/);
  });
});
