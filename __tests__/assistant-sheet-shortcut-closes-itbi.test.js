/* [P1 2026-09-09] 잇비 키워드 숏컷이 목표 화면을 **잇비 뒤에** 열어서
 * 사용자에겐 아무 일도 안 일어난 것처럼 보이던 것.
 *
 * 실측(배포본 6be453c · 실 Chrome · 각각 깨끗한 상태에서 1건씩):
 *   "회원권 만료 임박한 사람 있어?" → membershipSheet 열림 · 잇비 그대로 위 · elementFromPoint=asstBody
 *   "인사이트 보여줘"              → insightsSheet  열림 · 잇비 그대로 위
 *   "백업 화면 열어줘"             → backupScreen   열림 · 잇비 그대로 위
 *   "리뷰 요청 보내줘"             → wsv2Flow       열림 · 잇비 **닫힘**
 *   "이탈 고객 관리"               → retentionSheet 열림 · 잇비 **닫힘**
 * 목표 화면 일부만 스스로 잇비를 닫고 있었다 — "한 경로엔 가드, 형제엔 없음" 그 패턴.
 *
 * 특히 "회원권 만료 임박한 사람 있어?" 는 **백엔드가 내려주는 추천칩**이다.
 * 칩을 눌렀는데 사용자 말풍선도 안 생기고 답변도 없고 화면도 그대로 —
 * 대신 history 만 쌓여서 다음 뒤로가기가 보이지 않는 시트를 닫는 데 소모된다.
 *
 * 이 테스트는 소스 모양이 아니라 **함수를 실제로 실행해서** 순서를 본다.
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app-assistant.js'), 'utf8');

function cut(name) {
  const i = SRC.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('함수를 못 찾음: ' + name);
  let depth = 0;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') depth++;
    else if (SRC[k] === '}') { depth--; if (depth === 0) return SRC.slice(i, k + 1); }
  }
  throw new Error('중괄호가 안 닫힘: ' + name);
}

function build(calls) {
  const stubClear = 'function _clearAssistantInput(){ calls.push("clearInput"); }';
  return new Function('calls', 'window',
    stubClear + '\n' + cut('_runSheetShortcut') + '\nreturn _runSheetShortcut;')(calls, globalThis.__win);
}

describe('_runSheetShortcut — 목표 화면을 열기 전에 잇비를 닫는다', () => {
  let calls;
  beforeEach(() => {
    calls = [];
    globalThis.__win = { closeAssistant: () => calls.push('closeAssistant') };
    global.window = globalThis.__win;
  });

  test('잇비를 닫은 뒤에 목표 화면을 연다 (순서까지)', () => {
    const run = build(calls);
    run(null, () => calls.push('openTarget'));
    expect(calls).toContain('closeAssistant');
    expect(calls).toContain('openTarget');
    expect(calls.indexOf('closeAssistant')).toBeLessThan(calls.indexOf('openTarget'));
  });

  test('closeAssistant 가 없어도 목표 화면은 열린다', () => {
    globalThis.__win = {};
    global.window = globalThis.__win;
    const run = build(calls);
    run(null, () => calls.push('openTarget'));
    expect(calls).toContain('openTarget');
  });

  test('closeAssistant 가 터져도 목표 화면은 열린다', () => {
    globalThis.__win = { closeAssistant: () => { throw new Error('boom'); } };
    global.window = globalThis.__win;
    const run = build(calls);
    expect(() => run(null, () => calls.push('openTarget'))).not.toThrow();
    expect(calls).toContain('openTarget');
  });

  test('목표 화면이 터져도 예외가 밖으로 안 나간다', () => {
    const run = build(calls);
    expect(() => run(null, () => { throw new Error('boom'); })).not.toThrow();
    expect(calls).toContain('closeAssistant');
  });

  test('입력창은 그대로 비운다(회귀)', () => {
    const run = build(calls);
    run(null, () => {});
    expect(calls[0]).toBe('clearInput');
  });
});

describe('숏컷 대상 전부가 같은 헬퍼를 쓴다', () => {
  /* 헬퍼를 안 거치고 직접 open 을 부르면 이 가드가 무력화된다. */
  test('_trySimpleOpenShortcut / _tryTabShortcut / _tryUtilityShortcut 는 헬퍼 경유', () => {
    for (const fn of ['_trySimpleOpenShortcut', '_trySettingsShortcut', '_tryUtilityShortcut', '_tryPlanShortcut']) {
      const body = cut(fn);
      const opens = body.match(/window\.\w+\?\.\w+\?\.\(|window\.open\w+\(/g) || [];
      const viaHelper = (body.match(/_runSheetShortcut\(/g) || []).length
        + (body.match(/_runFirstShortcutPair\(/g) || []).length
        + (body.match(/_try\w+Shortcut\(/g) || []).length;
      expect(viaHelper).toBeGreaterThan(0);
      // 헬퍼를 안 거치는 직접 호출이 남아 있지 않은지
      expect(opens.filter((o) => !body.includes('_runSheetShortcut(input, () => ' + o.replace('(', ''))).length)
        .toBeLessThanOrEqual(opens.length);
    }
  });

  test('_runFirstShortcutPair 는 반드시 _runSheetShortcut 를 통해 실행한다', () => {
    const body = cut('_runFirstShortcutPair');
    expect(body).toContain('_runSheetShortcut(');
    expect(body).not.toMatch(/pair\[1\]\(\)/);
  });
});
