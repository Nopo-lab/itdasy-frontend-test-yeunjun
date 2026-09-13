/**
 * [2026-09-13 ZERO-HELP S15] X 한 번에 편집한 내용이 확인 없이 통째로 사라지던 것.
 *
 * X·Escape·시스템 뒤로 세 경로 모두 곧바로 닫고 복구 초안까지 지워서 되돌릴 길이 없었다.
 * 실측(iPhone 시뮬레이터 · 실 WebKit): 글자 '첫방문'(한글 IME) → X 1회 → 닫힘, 복구 배너 없음.
 * 수정 후(같은 기기): 아무것도 안 함 → X → 바로 닫힘(괜한 확인 없음)
 *                   글자 '예약' → X → "편집한 내용을 버릴까요?" → 계속 편집 → 글자 유지 → X → 버리기 → 닫힘
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'itd-editor.js'), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
const C = strip(SRC);

function extractFn(name) {
  const i = SRC.indexOf('function ' + name + '(');
  expect(i).toBeGreaterThan(0);
  let depth = 0; const j = SRC.indexOf('{', i);
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === '{') depth++;
    else if (SRC[k] === '}') { depth--; if (depth === 0) return SRC.slice(i, k + 1); }
  }
  throw new Error('unbalanced ' + name);
}

/* _requestCancel 을 실제로 돌려 본다 — 경로별로 무엇이 불리는지만 센다. */
function harness({ unsaved, barShowing }) {
  const calls = [];
  const bar = barShowing ? { classList: { contains: (c) => c === 'itded__recover--discard' } } : null;
  const ctx = {
    S: {}, calls,
    _draftBar: bar,
    _hasUnsaved: () => unsaved,
    _doCancel: () => calls.push('doCancel'),
    _cancelFromPop: () => calls.push('cancelFromPop'),
    _closeKeepDraft: () => calls.push('closeKeepDraft'),
    _hideDraftBar: () => calls.push('hideBar'),
    history: { pushState: () => calls.push('pushState') },
    el: () => {
      const node = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, set innerHTML(v) { this._h = v; calls.push('showConfirm'); },
        querySelector: () => ({ addEventListener() {}, focus() {} }) };
      return node;
    },
    root: { appendChild: () => {} },
  };
  vm.createContext(ctx);
  vm.runInContext(extractFn('_requestCancel') + '; this._requestCancel = _requestCancel;', ctx);
  return { calls, run: (via) => ctx._requestCancel(via) };
}

describe('취소 요청 — 바꾼 게 있을 때만 묻는다', () => {
  test('아무것도 안 했으면 X 는 바로 닫는다(괜한 확인창 금지)', () => {
    const h = harness({ unsaved: false }); h.run('x');
    expect(h.calls).toEqual(['doCancel']);
  });

  test('🔴 바꾼 게 있으면 X 는 닫지 않고 확인창을 띄운다', () => {
    const h = harness({ unsaved: true }); h.run('x');
    expect(h.calls).not.toContain('doCancel');
    expect(h.calls).toContain('showConfirm');
  });

  test('Escape 도 같은 규칙', () => {
    const a = harness({ unsaved: false }); a.run('esc'); expect(a.calls).toEqual(['doCancel']);
    const b = harness({ unsaved: true }); b.run('esc'); expect(b.calls).toContain('showConfirm'); expect(b.calls).not.toContain('doCancel');
  });

  test('🔴 시스템 뒤로 + 바꾼 게 있음 → 확인창을 띄우지 않고, 초안을 남긴 채 닫는다', () => {
    // popstate 안에서 history 를 다시 넣으면 Chrome 이 그 엔트리를 건너뛰어
    // 다음 뒤로가 앱 이전 단계/앱 밖으로 나간다(Android 에뮬레이터 실측: Chrome 이 홈으로 나감).
    const h = harness({ unsaved: true }); h.run('back');
    expect(h.calls).toEqual(['closeKeepDraft']);
    expect(h.calls).not.toContain('pushState');
    expect(h.calls).not.toContain('showConfirm');
  });

  test('시스템 뒤로 + 바꾼 게 없음 → 예전처럼 초안 없이 닫는다', () => {
    const h = harness({ unsaved: false }); h.run('back');
    expect(h.calls).toEqual(['cancelFromPop']);
  });

  test('뒤로 경로 어디에도 history.pushState 가 없다', () => {
    const i = C.indexOf('function _requestCancel(via)');
    const j = C.indexOf('\n  function ', i + 30);
    expect(C.slice(i, j)).not.toMatch(/pushState/);
  });
});

describe('뒤로로 닫을 때 초안을 남긴다', () => {
  test('닫기 **전에** 동기 스냅샷을 찍고, 초안을 지우지 않는다', () => {
    const i = C.indexOf('function _closeKeepDraft()');
    expect(i).toBeGreaterThan(0);
    const body = C.slice(i, C.indexOf('\n  function ', i + 30));
    expect(body).toMatch(/_draftSnap\(true\);/);
    expect(body).not.toMatch(/_draftClear\(\)/);
    // 스냅샷은 is-open 일 때만 쓰므로 반드시 닫기 전
    expect(body.indexOf('_draftSnap(true)')).toBeLessThan(body.indexOf("root.classList.remove('is-open')"));
  });
  test('남겨뒀다고 알린다 — 원장이 잃었다고 오해하지 않게', () => {
    const i = C.indexOf('function _closeKeepDraft()');
    expect(C.slice(i, i + 700)).toMatch(/toastIt\('편집하던 내용은 남겨뒀어요/);
  });
  test('history.back 을 부르지 않는다(이미 pop 됐다 — 부르면 앱 단계를 하나 더 먹는다)', () => {
    const i = C.indexOf('function _closeKeepDraft()');
    const body = C.slice(i, C.indexOf('\n  function ', i + 30));
    expect(body).toMatch(/_teardownBack\(true\)/);
    expect(body).not.toMatch(/history\.back/);
  });
});

describe('세 경로가 모두 _requestCancel 을 거친다', () => {
  test('X 버튼', () => {
    expect(C).toMatch(/refs\.cancel\.addEventListener\('click', function \(\) \{ _requestCancel\('x'\); \}\);/);
    expect(C).not.toMatch(/refs\.cancel\.addEventListener\('click', function \(\) \{ if \(S\) S\._cancelled = true; _draftClear\(\); close\(\);/);
  });
  test('Escape — 확인창이 떠 있으면 Esc = 계속 편집', () => {
    expect(C).toMatch(/if \(_draftBar && _draftBar\.classList\.contains\('itded__recover--discard'\)\) \{ _hideDraftBar\(\); return; \}[^\n]*\n\s*_requestCancel\('esc'\);/);
  });
  test('시스템 뒤로 — 저장 중이면 묻지 않고 취소(onDone 이중발화 차단 유지)', () => {
    const i = C.indexOf('S._popHandler = function () {');
    const body = C.slice(i, i + 400);
    expect(body).toMatch(/if \(S\._saving\) \{ _cancelFromPop\(\); return; \}/);
    expect(body).toMatch(/_requestCancel\('back'\);/);
  });
  test('판정이 실패하면 묻는다 — 잃는 쪽으로 틀리지 않는다', () => {
    const i = C.indexOf('function _hasUnsaved()');
    expect(C.slice(i, i + 400)).toMatch(/catch \(_e\) \{ void _e; return true; \}/);
  });
});
