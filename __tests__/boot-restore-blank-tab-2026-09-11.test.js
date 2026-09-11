/* [부팅 흰 화면] 마지막 탭 복원이 탭만 켜고 내용을 안 그리던 것.
 *
 * 실측(라이브 d4dbfed): 작업실을 본 뒤 앱을 껐다 켜면 tab-workshop 이 ACTIVE 인데
 * innerHTML 33자(빈 칸) → 화면이 **통째로 하얗다.** 홈은 32,934자가 그려진 채 숨어 있었다.
 * 원장이 보는 첫 화면이라 "앱이 고장났다" 로 읽힌다.
 */
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'app-core.js'), 'utf8');

/** _restoreLastTab 블록만 잘라낸다. */
function restoreBlock() {
  const i = SRC.indexOf("const _RESTORABLE");
  expect(i).toBeGreaterThan(-1);
  return SRC.slice(i, i + 2200);
}

describe('부팅 시 마지막 탭 복원', () => {
  test('복원 대상에 workshop 이 들어 있다 (전제)', () => {
    expect(restoreBlock()).toMatch(/_RESTORABLE\s*=\s*\[[^\]]*'workshop'/);
  });

  test('🔴 작업실로 복원하면 내용도 그린다', () => {
    const b = restoreBlock();
    const show = b.indexOf('showTab(_lastTab, _lastBtn)');
    const init = b.indexOf('initWorkshopTab()');
    expect(show).toBeGreaterThan(-1);
    expect(init).toBeGreaterThan(show);   // showTab 뒤에 init 이 와야 한다
  });

  test('init 호출이 workshop 일 때로 한정된다', () => {
    expect(restoreBlock()).toMatch(/_lastTab === 'workshop'/);
  });

  test('없는 함수를 부르지 않는다', () => {
    expect(restoreBlock()).toMatch(/typeof window\.initWorkshopTab === 'function'/);
  });

  test('복원 실패가 부팅을 막지 않는다', () => {
    const b = restoreBlock();
    const i = b.indexOf('initWorkshopTab()');
    expect(b.slice(i, i + 260)).toMatch(/\.catch\(/);
  });

  test('showTab 자체는 여전히 작업실을 init 하지 않는다 (중복 렌더 방지)', () => {
    // 여기에 넣으면 작업실로 갈 때마다 두 번 그린다 — 기존 호출부가 이미 직접 부르고 있다.
    const i = SRC.indexOf('function showTab(id, btn)');
    const body = SRC.slice(i, SRC.indexOf('\n// 태그 선택 (single)', i));
    expect(body).not.toMatch(/initWorkshopTab/);
  });
});
