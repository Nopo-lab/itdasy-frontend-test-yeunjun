/**
 * [2026-09-13 ZERO-HELP P2] 복구 배너를 띄운 채 한 번 더 새로고침되면 원래 초안이 사라지던 것.
 *
 * 새로 연 세션은 원장이 아무것도 안 해도 2초 뒤 자기 (빈) 상태를 DRAFT_KEY 에 쓴다.
 * 다음 새로고침에서 _draftStash 가 그걸 **무조건** pending 으로 옮겨 진짜 초안을 덮었다.
 * 배너는 그대로라 '이어서 편집' 을 눌러도 아무것도 안 돌아온다(거짓 복구).
 *
 * 실측(Chrome 402×684 실엔진): 'DRAFT-A' → 새로고침(안 누름) → pending 에 A
 *   → 한 번 더 새로고침 → pending 320B, A 없음.  iPhone 시뮬레이터에서도 '가나다' 가 같은 식으로 사라짐.
 * 수정 후: 새로고침 3회 뒤 '이어서 편집' → ['DRAFT-A'] 복구.
 *           복구 후 새 글자 B → 새로고침 → pending 에 A·B 둘 다(최신 실제 작업 보존).
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
  let depth = 0, j = SRC.indexOf('{', i);
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === '{') depth++;
    else if (SRC[k] === '}') { depth--; if (depth === 0) return SRC.slice(i, k + 1); }
  }
  throw new Error('unbalanced ' + name);
}

/* 실제 함수 본문을 떼어 가짜 sessionStorage 위에서 **돌려 본다** — 문자열 모양만 보는 가드는 우회된다. */
function makeStash() {
  const store = {};
  const sessionStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const ctx = { sessionStorage, DRAFT_KEY: 'D', DRAFT_PENDING_KEY: 'P', JSON };
  vm.createContext(ctx);
  vm.runInContext(extractFn('_draftStash') + '; this._draftStash = _draftStash;', ctx);
  return { store, stash: () => ctx._draftStash() };
}
const draft = (text, touched) => JSON.stringify({ v: 1, ts: 1, sig: 's', state: { layers: [{ text }] }, touched });

describe('복구 대기본은 손 안 댄 세션에 덮이지 않는다', () => {
  test('🔴 재현 경로: pending(A) 있고, 손 안 댄 새 세션 초안이 오면 → A 유지, 빈 초안은 버림', () => {
    const t = makeStash();
    t.store.P = draft('DRAFT-A', true);
    t.store.D = draft('', false);
    t.stash();
    expect(t.store.P).toContain('DRAFT-A');
    expect(t.store.D).toBeUndefined();
  });

  test('새로고침을 여러 번 해도(손 안 댄 세션 반복) A 가 살아남는다', () => {
    const t = makeStash();
    t.store.P = draft('DRAFT-A', true);
    for (let i = 0; i < 5; i++) { t.store.D = draft('', false); t.stash(); }
    expect(t.store.P).toContain('DRAFT-A');
  });

  test('새 세션에서 **실제로 작업**했으면 그게 최신이라 교체한다(작업을 잃지 않게)', () => {
    const t = makeStash();
    t.store.P = draft('DRAFT-A', true);
    t.store.D = draft('DRAFT-C', true);
    t.stash();
    expect(t.store.P).toContain('DRAFT-C');
    expect(t.store.D).toBeUndefined();
  });

  test('대기본이 없으면 예전처럼 옮긴다(첫 새로고침)', () => {
    const t = makeStash();
    t.store.D = draft('DRAFT-A', true);
    t.stash();
    expect(t.store.P).toContain('DRAFT-A');
    expect(t.store.D).toBeUndefined();
  });

  test('touched 표시가 없는 옛 초안(배포 전 저장분)은 손댄 것으로 본다 — 잃는 쪽으로 틀리지 않는다', () => {
    const t = makeStash();
    t.store.P = draft('DRAFT-A', true);
    t.store.D = JSON.stringify({ v: 1, ts: 1, sig: 's', state: { layers: [{ text: 'OLD' }] } });
    t.stash();
    expect(t.store.P).toContain('OLD');
  });

  test('초안이 없으면 아무것도 안 건드린다', () => {
    const t = makeStash();
    t.store.P = draft('DRAFT-A', true);
    t.stash();
    expect(t.store.P).toContain('DRAFT-A');
  });

  test('대기본이 **없어도** 손 안 댄 초안은 옮기지 않는다 — 아무것도 안 한 세션에 복구 배너를 띄우지 않게', () => {
    const t = makeStash();
    t.store.D = draft('', false);
    t.stash();
    expect(t.store.P).toBeUndefined();
    expect(t.store.D).toBeUndefined();
  });
});

describe('스냅샷이 touched 를 정확히 남긴다', () => {
  test('입력이 있었고(기준 있음) 그 뒤 상태가 달라졌을 때만 touched:true — 입력이 없었으면 잃을 게 없다', () => {
    const i = C.indexOf('function _draftSnap(sync)');
    const body = C.slice(i, i + 900);
    expect(body).toMatch(/var _lightOnly = JSON\.stringify\(sp\.light\);/);
    expect(body).toMatch(/touched: _draftBaseLight != null && _lightOnly !== _draftBaseLight/);
    // 🔴 스냅샷이 기준을 스스로 잡으면 안 된다 — 첫 틱 전에 친 글자가 기준에 들어가 '손 안 댐'이 된다
    expect(body).not.toMatch(/_draftBaseLight = _lightOnly/);
  });

  test('기준은 **원장의 첫 입력 직전**에 capture 단계로 잡는다(핸들러가 상태를 바꾸기 전)', () => {
    const i = C.indexOf("['pointerdown', 'keydown', 'input'].forEach(function (ev) {");
    expect(i).toBeGreaterThan(0);
    const body = C.slice(i, i + 300);
    expect(body).toMatch(/root\.addEventListener\(ev, function \(\) \{ if \(S && _draftBaseLight == null\) _draftMarkBase\(\); \}, true\);/);
  });

  test('🔴 기준을 rAF 에 두지 않는다 — 가려진 탭에선 rAF 가 멈춰 기준이 영영 안 잡힌다', () => {
    const r = C.indexOf('requestAnimationFrame(function () {\n      initCanvas();');
    expect(r).toBeGreaterThan(0);
    const rafBody = C.slice(r, C.indexOf('\n  function ', r));
    expect(rafBody).not.toMatch(/_draftMarkBase/);
  });

  test('세션을 새로 시작할 때 기준을 비운다(안 비우면 이전 세션 상태와 비교된다)', () => {
    const i = C.indexOf('function _draftStart()');
    expect(C.slice(i, i + 250)).toMatch(/_draftBaseLight = null;/);
  });

  test('열 때 순서: 격리(stash) → 타이머 시작 — 순서가 바뀌면 새 세션이 먼저 덮는다', () => {
    const a = C.indexOf('_draftStash();      ');
    const b = C.indexOf('_draftStart();', a);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
  });
});
