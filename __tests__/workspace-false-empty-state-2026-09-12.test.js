/**
 * @jest-environment jsdom
 *
 * BUG-W1 회귀 — 작업실이 **못 불러온 것**을 "글이 하나도 없다" 고 말하던 것 (§4-6).
 *
 * 실측 경로: `initWorkshopTab()` 의 catch 가 `slots = []` 로 두고 그대로 렌더 →
 * `_shellHTML([])` → "위 <b>새 게시물</b>을 눌러 첫 글을 만들어보세요".
 * 토스트는 몇 초 뒤 사라지고 화면엔 **손님이 글을 하나도 안 쓴 것처럼** 남는다.
 * 서버엔 멀쩡히 있는데도 그렇다(2026-09-11 실측: 서버 4 / 화면 0).
 *
 * 같은 파일의 `refresh()` 는 이미 "가진 걸 없애면 더 나쁘다" 며 화면을 지키는데
 * **첫 진입만** 안 지키고 있었다 — 한쪽만 고쳐진 전형적인 패턴.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HOME = fs.readFileSync(path.join(ROOT, 'js/workspace/workspace-v2-home.js'), 'utf8');
const WS = fs.readFileSync(path.join(ROOT, 'app-gallery-workshop.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css/workspace-home-c.css'), 'utf8');

/** `_shellHTML` 안의 빈-상태 분기를 그대로 떼어 실행한다. */
function loadEmptyBranch() {
  const start = HOME.indexOf('    var emptyHint = ');
  expect(start).toBeGreaterThan(-1);
  const endMark = HOME.indexOf('return \'\' +', start);
  expect(endMark).toBeGreaterThan(start);
  const body = HOME.slice(start, endMark);
  // eslint-disable-next-line no-new-func
  return new Function('slots', 'loadFailed', body + '\n; return emptyHint;');
}

describe('BUG-W1 · 못 불러온 것과 진짜 0개를 구분한다', () => {
  test('🔴 불러오기 실패 → "첫 글을 만들어보세요" 라고 하지 않는다 (이번 버그)', () => {
    const html = loadEmptyBranch()([], true);
    expect(html).not.toMatch(/첫 글을 만들어/);
  });

  test('불러오기 실패 → 못 불러왔다고 말하고 다시 시도를 준다', () => {
    const html = loadEmptyBranch()([], true);
    expect(html).toMatch(/불러오지 못했어요/);
    expect(html).toMatch(/data-wsv2-retry/);
  });

  test('진짜 0개 → 첫 글 안내가 맞다 (오탐 방지)', () => {
    const html = loadEmptyBranch()([], false);
    expect(html).toMatch(/첫 글을 만들어/);
    expect(html).not.toMatch(/불러오지 못했어요/);
  });

  test('슬롯이 있으면 어느 쪽 안내도 안 뜬다', () => {
    expect(loadEmptyBranch()([{ id: 1 }], false)).toBe('');
  });

  test('🔴 슬롯이 있는데 실패 플래그가 서면 실패를 우선한다 (부분 로드 은폐 금지)', () => {
    const html = loadEmptyBranch()([{ id: 1 }], true);
    expect(html).toMatch(/불러오지 못했어요/);
  });
});

describe('BUG-W1 · 실패 사실이 렌더까지 실제로 전달된다 (조용한 무효화 방지)', () => {
  test('initWorkshopTab 이 loadFailed 를 세운다', () => {
    const i = WS.indexOf('async function initWorkshopTab()');
    const body = WS.slice(i, i + 1800);
    expect(body).toMatch(/loadFailed\s*=\s*true/);
  });

  test('render 호출에 loadFailed 가 실려 나간다 — 안 실으면 조건이 영영 거짓이다', () => {
    expect(WS).toMatch(/WorkspaceV2\.render\(root,\s*\{\s*slots:\s*_slots,\s*loadFailed:\s*loadFailed\s*\}\)/);
  });

  test('render 가 opts.loadFailed 를 _shellHTML 로 넘긴다', () => {
    expect(HOME).toMatch(/_shellHTML\(_slotsCache,\s*!!\(opts && opts\.loadFailed\)\)/);
  });

  test('_shellHTML 이 그 인자를 받는다', () => {
    expect(HOME).toMatch(/function _shellHTML\(slots,\s*loadFailed\)/);
  });
});

describe('BUG-W1 · 다시 시도가 실제로 동작한다', () => {
  test('클릭 핸들러가 initWorkshopTab 을 다시 탄다', () => {
    const i = HOME.indexOf("data-wsv2-retry]");
    expect(i).toBeGreaterThan(-1);
    const body = HOME.slice(i, i + 700);
    expect(body).toMatch(/initWorkshopTab/);
  });

  test('실패하면 버튼을 되살린다 (영구 disabled 금지)', () => {
    const i = HOME.indexOf("data-wsv2-retry]");
    const body = HOME.slice(i, i + 700);
    expect(body).toMatch(/catch[\s\S]{0,160}busy\s*=\s*''/);
  });

  test('연타를 막는다', () => {
    const i = HOME.indexOf("data-wsv2-retry]");
    expect(HOME.slice(i, i + 400)).toMatch(/busy === '1'/);
  });

  test('버튼 스타일이 존재한다 (유령 버튼 방지)', () => {
    expect(CSS).toMatch(/\.wshc-retry\s*\{/);
  });
});
