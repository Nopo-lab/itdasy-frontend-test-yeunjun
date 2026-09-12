/* [P1 2026-09-10] 뒤로가기 감사 스크립트에 **사각지대**가 있었다.
 *
 * 실측(배포본 9421f5a · 실 Chrome):
 *   window.openRetentionAI() → retentionSheet 가 화면에 떠 있는데 `location.hash` 가 **비어 있었다**.
 *   즉 history 에 아무것도 안 쌓여서, 뒤로가기를 누르면 시트가 닫히는 게 아니라
 *   **앱이 통째로 종료**된다(안드로이드·PWA). 실제로 테스트 중 페이지가 이탈했다.
 *
 * 그런데 `scripts/overlay-back-audit.js` 는 "미등록 0" 으로 통과시키고 있었다.
 * 이유: 그 스크립트는 **인라인 스타일**(`position:fixed; inset:0`)만 봤는데
 * retentionSheet 는 `el.className = 'p9-sheet'` 로 CSS 클래스에서 전체화면이 된다.
 *
 * "가드가 있다" 와 "가드가 그 경로를 본다" 는 다르다.
 * 이 테스트는 감사 스크립트를 **실제로 실행해서** 클래스형 오버레이를 잡는지 본다.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const AUDIT = path.join(ROOT, 'scripts', 'overlay-back-audit.js');

function runAudit() {
  try {
    return { code: 0, out: execFileSync('node', [AUDIT], { encoding: 'utf8', cwd: ROOT }) };
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}

describe('오버레이 뒤로가기 감사', () => {
  test('현재 코드베이스는 통과한다', () => {
    const r = runAudit();
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/미등록 0/);
  });

  test('🔑 CSS 클래스로 만든 전체화면 오버레이도 검사 대상에 든다', () => {
    /* 옛 스크립트는 인라인만 봐서 오버레이 51개만 셌다. 클래스형까지 보면 더 많아야 한다.
       숫자가 51 이하로 돌아가면 사각지대가 되살아난 것이다. */
    const r = runAudit();
    const m = r.out.match(/오버레이 (\d+)개/);
    expect(m).toBeTruthy();
    expect(Number(m[1])).toBeGreaterThan(51);
  });

  test('클래스형 오버레이에서 등록을 빼면 감사가 실패한다 (실측 사고 재현)', () => {
    const target = path.join(ROOT, 'app-retention-ai.js');
    const orig = fs.readFileSync(target, 'utf8');
    const line = orig.split('\n').find((l) => l.includes("_bindSheetBack('retentionSheet'"));
    expect(line).toBeTruthy();                 // 등록이 실제로 존재해야 한다
    try {
      fs.writeFileSync(target, orig.replace(line, ''), 'utf8');
      const r = runAudit();
      expect(r.code).not.toBe(0);
      expect(r.out).toMatch(/app-retention-ai\.js/);
    } finally {
      fs.writeFileSync(target, orig, 'utf8');
    }
    expect(runAudit().code).toBe(0);           // 복원 확인
  });

  test('ALLOWLIST 항목은 반드시 이유가 적혀 있다', () => {
    const src = fs.readFileSync(AUDIT, 'utf8');
    const block = src.slice(src.indexOf('const ALLOWLIST'), src.indexOf(']);', src.indexOf('const ALLOWLIST')));
    const entries = [...block.matchAll(/\[\s*'([^']+)'\s*,\s*'([^']*)'/g)];
    expect(entries.length).toBeGreaterThan(0);
    for (const [, file, reason] of entries) {
      expect(reason.trim().length).toBeGreaterThan(8);   // "" 나 "TODO" 로 뚫지 못하게
      expect(file).toMatch(/\.js$/);
    }
  });
});
