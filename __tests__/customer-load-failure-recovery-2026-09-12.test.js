/**
 * @jest-environment jsdom
 *
 * BUG-C2 회귀 — 고객 목록을 **못 불러온 것**과 **진짜 0명**을 구분해야 한다.
 *
 * 과거 실사고(브리핑 §7 이 지목): customer fetch 실패 → [] 취급 → "0명" →
 * 원장님이 이미 있는 손님을 신규로 다시 등록. 그때는 **고객 선택창만** 고쳤고
 * (`_pickLoadFailed`) 메인 목록엔 같은 가드가 없었다.
 *
 * 남아 있던 두 구멍:
 *   ① 오프라인 폴백이 빈 배열을 돌려주면 "+ 버튼을 눌러 첫 고객을 등록해보세요" 가 떴다
 *      — 서버를 못 봤는데 **없다고 단정**한다.
 *   ② 첫 진입 실패 화면이 '불러오기 실패' 한 줄뿐이라 **다시 시도할 길이 없었다.**
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'app-customer.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css/screens/details.css'), 'utf8');

/** 실제 소스의 빈-상태 분기를 그대로 떼어 실행한다 (문자열 grep 아님). */
function loadEmptyBranch() {
  const start = SRC.indexOf('    if (!items.length) {');
  expect(start).toBeGreaterThan(-1);
  let d = 0, started = false, end = -1;
  for (let k = start; k < SRC.length; k++) {
    const c = SRC[k];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) { end = k + 1; break; } }
  }
  const body = SRC.slice(start, end);
  // eslint-disable-next-line no-new-func
  return new Function('items', '_cache', '_isOffline', 'seg', 'box', '_dupBannerHTML', '_bindDupBanner', '_bindListRetry',
    body + '\n; return null;');
}

function render({ cache, offline, seg = 'all' }) {
  const box = document.createElement('div');
  loadEmptyBranch()([], cache, offline, seg, box, () => '', () => {}, () => {});
  return box.innerHTML;
}

describe('BUG-C2 · 못 불러온 것과 진짜 0명을 구분한다', () => {
  test('🔴 오프라인 + 빈 캐시 → "첫 고객을 등록해보세요" 라고 하지 않는다 (이번 버그)', () => {
    const html = render({ cache: [], offline: true });
    expect(html).not.toMatch(/첫 고객을 등록/);
  });

  test('오프라인 + 빈 캐시 → 못 불러왔다고 말하고 다시 시도를 준다', () => {
    const html = render({ cache: [], offline: true });
    expect(html).toMatch(/불러오지 못했어요/);
    expect(html).toMatch(/data-cust-retry/);
  });

  test('온라인 + 진짜 0명 → 첫 고객 등록 안내가 맞다 (오탐 방지)', () => {
    const html = render({ cache: [], offline: false });
    expect(html).toMatch(/첫 고객을 등록/);
    expect(html).not.toMatch(/불러오지 못했어요/);
  });

  test('캐시가 있는데 검색 0건 → "검색 결과 없음" (기존 계약 유지)', () => {
    const html = render({ cache: [{ id: 1 }], offline: false, seg: 'all' });
    expect(html).toMatch(/검색 결과 없음/);
    expect(html).not.toMatch(/불러오지 못했어요/);
  });

  test('캐시가 있는데 필터 0건 → 필터 문구 (기존 계약 유지)', () => {
    const html = render({ cache: [{ id: 1 }], offline: false, seg: 'vip' });
    expect(html).toMatch(/이 조건에 맞는 손님이 아직 없어요/);
  });

  test('오프라인이어도 캐시가 있으면 그 데이터를 보여준다 (실패로 덮어쓰지 않는다)', () => {
    const html = render({ cache: [{ id: 1 }], offline: true, seg: 'all' });
    expect(html).toMatch(/검색 결과 없음/);
    expect(html).not.toMatch(/불러오지 못했어요/);
  });
});

describe('BUG-C2 · 첫 진입 실패에도 다시 시도할 길이 있다', () => {
  test('list() 실패 화면에 재시도 버튼이 있다', () => {
    const i = SRC.indexOf("console.warn('[customer] list 실패:'");
    expect(i).toBeGreaterThan(-1);
    const around = SRC.slice(i, i + 500);
    expect(around).toMatch(/data-cust-retry/);
    expect(around).toMatch(/_bindListRetry\(box\)/);
  });

  test('재시도는 서버를 다시 보고, 성공해야만 오프라인 표시를 내린다', () => {
    const i = SRC.indexOf('function _bindListRetry(box)');
    expect(i).toBeGreaterThan(-1);
    const body = SRC.slice(i, i + 900);
    expect(body).toMatch(/_fetchFresh\(\)/);
    expect(body).toMatch(/_isOffline\s*=\s*false/);
    // 실패하면 버튼을 되살려 또 누를 수 있어야 한다 (영구 disabled 금지)
    expect(body).toMatch(/catch[\s\S]{0,120}busy\s*=\s*''/);
  });

  test('재시도 버튼이 중복 바인딩되지 않는다', () => {
    const i = SRC.indexOf('function _bindListRetry(box)');
    expect(SRC.slice(i, i + 400)).toMatch(/dataset\.bound === '1'/);
  });

  test('버튼 스타일이 실제로 존재한다 (스타일 없는 유령 버튼 방지)', () => {
    expect(CSS).toMatch(/\.dt-retry\s*\{/);
  });

  test('기존 .dt-error flex 규칙을 건드리지 않았다', () => {
    const i = CSS.indexOf('.dt-error {');
    expect(CSS.slice(i, i + 120)).toMatch(/display:\s*flex/);
  });
});
