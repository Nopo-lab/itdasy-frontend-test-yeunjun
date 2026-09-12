/**
 * @jest-environment jsdom
 *
 * BUG-D 회귀 — 유지형 시트(display 토글)가 **두 번째 오픈부터 뒤로가기 미등록**이던 것.
 *
 * 재현(예약관리, 3회 중 2회): 완료 시트를 열고 뒤로가기 → 시트는 안 닫히고 뒤 화면이 바뀐다.
 * 그 뒤 예약관리로 들어가면 시트가 유령처럼 떠 있다 (`startFromBooking` 호출 0회 = 새로 연 게 아니라
 * 닫히지 않은 채 남아 있던 것).
 *
 * 원인: `_bindSheetBack` 이 숨겨지는 순간 observer 를 끊고 dataset 도장을 지웠는데,
 * 유지형 시트의 `_ensureSheet()` 는 "이미 있으면 즉시 return" 이라 재오픈 때 다시 바인드하지 않는다.
 * → 보이는 동안만 등록되도록 **가시성 전이를 계속 따라가야** 한다.
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app-core.js'), 'utf8');

function extractAssign(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return '';
  let d = 0, started = false;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(i, k + 1) + ';'; }
  }
  return '';
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/* 테스트마다 시트 이름을 바꾼다. 앞 테스트에서 떼어낸 엘리먼트의 observer 가
   비동기로 한 번 더 울리면서 **다음 테스트의 기록에 섞여** 개수가 부풀었다. */
let _seq = 0;
function setup() {
  document.body.innerHTML = '';
  const name = 'sheetX' + (++_seq);
  const events = [];
  window._registerSheet = (name, fn) => { events.push('register:' + name); window.__closeFn = fn; };
  window._markSheetOpen = (name) => { events.push('open:' + name); };
  window._markSheetClosed = (name) => { events.push('closed:' + name); };
  const body = extractAssign(SRC, 'window._bindSheetBack = function (name, el, closeFn) {');
  expect(body).not.toBe('');
  // eslint-disable-next-line no-new-func
  new Function('window', 'MutationObserver', body)(window, window.MutationObserver);
  return { events, name };
}

function makeSheet(name, display) {
  const el = document.createElement('div');
  el.id = name;
  el.style.display = display;
  document.body.appendChild(el);
  return el;
}

describe('BUG-D · _bindSheetBack 은 보이는 동안만 등록되고 재오픈 때 되살아난다', () => {
  test('숨은 상태로 바인드하면 아직 열림으로 치지 않는다', async () => {
    const { events, name } = setup();
    const el = makeSheet(name, 'none');
    window._bindSheetBack(name, el, () => {});
    await tick();
    expect(events.filter((e) => e === ('open:' + name))).toHaveLength(0);
  });

  test('숨은 채 바인드했다가 보이면 그때 등록된다 (첫 오픈 누락 방지)', async () => {
    const { events, name } = setup();
    const el = makeSheet(name, 'none');
    window._bindSheetBack(name, el, () => {});
    await tick();
    el.style.display = 'flex';
    await tick();
    expect(events).toContain('open:' + name);
  });

  test('🔴 닫았다가 다시 열면 재등록된다 — 재바인드 없이 (이번 버그)', async () => {
    const { events, name } = setup();
    const el = makeSheet(name, 'flex');
    window._bindSheetBack(name, el, () => {});
    await tick();
    el.style.display = 'none';        // 닫기
    await tick();
    expect(events).toContain('closed:' + name);
    const before = events.length;
    el.style.display = 'flex';        // 재오픈 — _ensureSheet 가 early return 하는 경로
    await tick();
    expect(events.slice(before)).toContain('open:' + name);
  });

  test('열림/닫힘이 번갈아 계속 따라온다 (3회 왕복)', async () => {
    const { events, name } = setup();
    const el = makeSheet(name, 'none');
    window._bindSheetBack(name, el, () => {});
    await tick();
    for (let i = 0; i < 3; i++) {
      el.style.display = 'flex'; await tick();
      el.style.display = 'none'; await tick();
    }
    expect(events.filter((e) => e === ('open:' + name))).toHaveLength(3);
    expect(events.filter((e) => e === ('closed:' + name))).toHaveLength(3);
  });

  test('같은 상태가 이어지면 중복 등록하지 않는다', async () => {
    const { events, name } = setup();
    const el = makeSheet(name, 'flex');
    window._bindSheetBack(name, el, () => {});
    await tick();
    el.setAttribute('data-noop', '1');   // 가시성과 무관한 변경
    await tick();
    expect(events.filter((e) => e === ('open:' + name))).toHaveLength(1);
  });

  test('보이는 상태에서 다시 바인드하면 열림으로 맞춰준다', async () => {
    const { events, name } = setup();
    const el = makeSheet(name, 'flex');
    window._bindSheetBack(name, el, () => {});
    await tick();
    const before = events.length;
    window._bindSheetBack(name, el, () => {});
    await tick();
    expect(events.slice(before)).toContain('open:' + name);
  });

  test('DOM 에서 빠지면 닫힘 처리하고 도장을 지운다', async () => {
    const { events, name } = setup();
    const el = makeSheet(name, 'flex');
    window._bindSheetBack(name, el, () => {});
    await tick();
    el.remove();
    await tick();
    expect(events).toContain('closed:' + name);
    expect(el.dataset.sheetBound).toBeUndefined();
  });

  test('완료 시트는 스타일을 넣은 뒤에 바인드한다 (유령 한 칸 방지)', () => {
    const cf = fs.readFileSync(path.join(__dirname, '..', 'app-complete-flow.js'), 'utf8');
    const ens = cf.slice(cf.indexOf('function _ensureSheet()'), cf.indexOf('function _ensureStyles()'));
    expect(ens.indexOf('_ensureStyles()')).toBeGreaterThan(-1);
    expect(ens.indexOf('_ensureStyles()')).toBeLessThan(ens.indexOf('_bindSheetBack'));
  });
});
