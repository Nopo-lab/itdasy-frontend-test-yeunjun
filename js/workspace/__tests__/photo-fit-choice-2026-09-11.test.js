/* 🔴 [2026-09-11 · 실제 뷰티 사진 게이트] **원장이 올린 사진의 절반이 흰 여백으로 나갔고,
 * 그걸 없앨 방법이 화면 어디에도 없었다.**
 *
 * 실측 (LIVE, 실계정, 앱의 실제 파일 업로드 경로):
 *   업로드 미리보기 .wsc-one  → background-size: cover   (꽉 찬 사진으로 보여줌)
 *   편집기 .itded__photo      → background-size: contain (흰 여백)
 *   발행본 1080×1350
 *     1:1 사진(붙임머리)      → 흰 여백 19%  (위 128px + 아래 133px)
 *     가로 1.45:1 사진(속눈썹) → 흰 여백 45%  (위 301px + 아래 301px) — 사진은 55%만
 *
 * 바꿀 수단: `꽉 채움/전체` 토글은 편집기 레이아웃 패널 안에 있는데
 *   - 그 패널을 여는 버튼이 2026-07-13 `ce00d20`(요청4)로 제거됐고
 *   - 업로드 화면의 '구성' 선택에도 fit 항목이 없었고
 *   - 사진이 1장이면 구성 화면 자체가 안 뜬다
 *   → 버튼은 뷰포트 밖(y=1027 / 높이 757)에 영영 갇혀 있었다.
 *
 * 요청4 의 전제는 "레이아웃은 업로드 직후 갤러리에서 이미 선택" 이었다.
 * 그 전제가 fit 축에는 성립하지 않아 생긴 사각지대라, **갤러리에서 고르게** 채운다.
 * (편집기 레일 버튼을 되살리지 않는다 — 요청4 를 되돌리지 않기 위해서다.)
 */
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '../../..');
const layout = fs.readFileSync(path.join(R, 'js/workspace/flow/layout.js'), 'utf8');
const flow = fs.readFileSync(path.join(R, 'js/workspace/workspace-v2-flow.js'), 'utf8');
const editor = fs.readFileSync(path.join(R, 'js/itd-editor/itd-editor.js'), 'utf8');
const css = fs.readFileSync(path.join(R, 'css/workspace-hyper.css'), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const L = strip(layout), F = strip(flow), E = strip(editor);

describe('🔴 원장이 사진 채우기를 고를 수 있다 (업로드 화면)', () => {
  test('업로드 화면에 꽉 채움 / 전체 선택이 렌더된다', () => {
    expect(L).toMatch(/data-fl-fit="/);
    expect(layout).toContain('꽉 채움');
    expect(layout).toContain('전체 보이기');
  });
  /* 🔴 주석을 걷어내면 '// ③' 같은 구간 표시가 사라져 slice anchor 가 깨진다 —
     처음 쓴 가드는 1장 경로에서 fit 행을 지워도 통과했다(뮤테이션으로 잡음).
     주석이 아니라 **코드 구조**(n===1 분기 안의 return 문)를 앵커로 삼는다. */
  test('사진 1장일 때도 나온다 (구성 화면이 안 뜨는 경로)', () => {
    /* 🔴 `if (n === 1)` 은 파일에 여러 번 나온다(_compOptions 등) — 첫 번째를 잡으면
       slice 가 10,795자로 벌어져 **n장 분기의 _fitRowHtml 까지 삼켜** 1장 행을 지워도 통과했다.
       (뮤테이션으로 잡음.) 1장 화면에만 있는 `wsc-onemsg` 를 앵커로 쓴다. */
    const i = L.indexOf('wsc-onemsg');
    expect(i).toBeGreaterThan(-1);
    const j = L.indexOf('var cards = CARDS()', i);
    expect(j).toBeGreaterThan(i);
    const one = L.slice(i, j);
    expect(one.length).toBeLessThan(1500);     // 분기 하나만 담겼는지
    expect(one).toContain('_fitRowHtml()');
  });
  test('사진 여러 장일 때도 나온다', () => {
    const i = L.indexOf('var opts = _compOptions(n)');
    expect(i).toBeGreaterThan(-1);
    const many = L.slice(i);
    expect(many).toContain('wsc-opts');        // 구성 칩 구간이 맞는지 확인
    expect(many).toContain('_fitRowHtml()');
  });
  test('탭하면 선택이 저장되고 옛 합성본을 버린다', () => {
    expect(L).toMatch(/data-fl-fit'\)/);
    expect(L).toMatch(/_wsFit = fk/);
    expect(L).toMatch(/dF\.templateOutput = null/);
  });
});

describe('🔴 고른 값이 미리보기·편집기·발행본에 똑같이 간다', () => {
  test('업로드 미리보기가 고른 값대로 그려진다 (cover 고정이 아니다)', () => {
    expect(L).toMatch(/background-size:' \+ _fitOf\(\)/);
  });
  test('플로우가 편집기에 fitMode 를 넘긴다', () => {
    expect(F).toMatch(/fitMode: \(d\._wsFit === 'cover'/);
  });
  test('편집기가 그 값을 수동 선택으로 받는다', () => {
    expect(E).toMatch(/opts\.fitMode === 'cover' \|\| opts\.fitMode === 'contain'/);
    expect(E).toMatch(/S\._fitManual = true/);
  });
  /* 🔴 처음엔 복원보다 **앞**에 뒀다가 실패했다. `_restoreState` 가 `st.fitMode` 로 덮어써서
     원장이 방금 누른 '꽉 채움'이 옛 저장값에 먹혔다(라이브 실측: opts.fitMode='cover' 는
     전달됐는데 편집기는 contain 으로 열림). 조금 전에 누른 것이 저장본보다 최신 의사다. */
  test('🔴 복원 **뒤에** 적용한다 (옛 저장값이 방금 고른 값을 덮으면 안 된다)', () => {
    const iRestore = E.indexOf('_restoreState(_ed)');
    const iFit = E.indexOf("opts.fitMode === 'cover'");
    expect(iRestore).toBeGreaterThan(-1);
    expect(iFit).toBeGreaterThan(iRestore);
  });
  test('수동 선택이면 레이아웃 기본값이 덮지 않는다 (단일=contain 강제 금지)', () => {
    expect(E).toMatch(/if \(!S\._fitManual\) \{ S\.fitMode = isSingleL\(S\.layout\)/);
  });
});

describe('기존 디자인 언어를 그대로 쓴다 (새 UI 언어 금지)', () => {
  test('구성 칩과 같은 .wsc-opt 를 재사용한다', () => {
    expect(L).toMatch(/class="wsc-opt'/);
  });
  test('편집기 레일에 레이아웃 버튼을 되살리지 않았다 (요청4 유지)', () => {
    expect(E).not.toMatch(/data-tool="layout"/);
  });
  test('가로 배치·미니 썸네일 CSS 가 있다', () => {
    expect(css).toContain('.wsc-opts--fit');
    expect(css).toContain('.wsc-fitmini--cover');
    expect(css).toContain('.wsc-fitmini--contain');
  });
});
