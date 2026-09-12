/* [PE-01] 편집기 [완료] 가 초안 슬롯에 실제로 적히는지.
 *
 * 실측 근거(라이브 89bf71e): 텍스트 레이어 3개를 만들고 [완료] → "사진을 꾸몄어요" 토스트.
 * 20초 뒤에도 IndexedDB 의 슬롯은 옛 레이어 그대로였고, 새로고침 후 재진입하니 추가분이 없었다.
 * 성공 토스트가 뜨기 때문에 원장은 잃은 걸 알 수 없다 — 그래서 P0.
 */
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js/workspace/workspace-v2-flow.js'), 'utf8');

/** _persistEditQuiet 의 **본문만** 잘라낸다. 넉넉히 자르면 바로 아래 save() 까지 들어와
 *  "쓰면 안 되는 것"(WMLearn 등) 검사가 남의 함수를 보고 터진다. */
function body() {
  const i = SRC.indexOf('function _persistEditQuiet');
  expect(i).toBeGreaterThan(-1);
  const rest = SRC.slice(i);
  const end = rest.indexOf('\n  function ', 1);
  return end > 0 ? rest.slice(0, end) : rest;
}

describe('편집기 완료 → 초안 슬롯 영속화', () => {
  test('onDone 이 영속화를 호출한다', () => {
    // 이 줄이 없으면 편집 결과가 d 메모리에만 남아 새로고침에 사라진다.
    expect(SRC).toMatch(/_persistEditQuiet\(\);/);
  });

  test('영속화 헬퍼가 정의돼 있다', () => {
    expect(SRC).toMatch(/function _persistEditQuiet\s*\(\s*\)\s*\{/);
  });

  test('호출이 _learnShopStyle 뒤, 화면 전환 전에 일어난다', () => {
    // setScreen 이 먼저 돌면 d 가 다음 단계 값으로 바뀐 뒤 저장될 수 있다.
    const learn = SRC.indexOf('_learnShopStyle(meta && meta.layers)');
    // [2026-09-12] 장별 합성(비동기) 쪽에도 같은 호출이 생겼다 — 계약은 "**주 저장**이
    //   학습 뒤·전환 전" 이므로 _learnShopStyle **이후**의 호출을 찾는다(첫 일치가 아니라).
    const call = SRC.indexOf('_persistEditQuiet();', SRC.indexOf('_learnShopStyle(meta && meta.layers)'));
    const nav = SRC.indexOf("if (d._editorNext) { var _nx = d._editorNext;");
    expect(learn).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(learn);
    expect(nav).toBeGreaterThan(call);
  });

  test('갤러리(내 콘텐츠)에는 쓰지 않는다 — 중간본 쌓임 방지 의도 보존', () => {
    const b = body();
    expect(b).toMatch(/saveSlotToDB/);
    expect(b).not.toMatch(/saveToGallery/);
    expect(b).not.toMatch(/WorkspaceAdapter\.saveItem/);   // saveItem 은 갤러리까지 같이 쓴다
  });

  test('학습·토스트·닫기 같은 "작업 끝" 신호를 함께 보내지 않는다', () => {
    const b = body();
    expect(b).not.toMatch(/WMLearn/);
    expect(b).not.toMatch(/captureAndNotify/);
    expect(b).not.toMatch(/\btoast\(/);
    expect(b).not.toMatch(/\bclose\(\)/);
  });

  test('사진이 없으면 빈 슬롯을 만들지 않는다', () => {
    const b = body();
    expect(b).toMatch(/if \(!d\.photos \|\| !d\.photos\.length\) return;/);
  });

  test('저장 실패가 편집기를 막지 않는다 (catch 로 삼킨다)', () => {
    const b = body();
    expect(b).toMatch(/\.catch\(/);
  });
});
