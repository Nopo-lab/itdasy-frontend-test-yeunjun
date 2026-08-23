/* 캐러셀 — **장마다 따로 판단하는가**를 잠근다. [2026-08-23]
 *
 * 증상이었던 것: `_planApplied`·`_safeApplied`·`_userMoved` 가 세션 전역이라
 * **1번 장에서 한 번 돌고 끝**이었다. 텍스트·스티커는 이미 `layersByPhoto` 로 장별인데
 * 자동 초안만 전역이어서, 2~6번 장은 맨몸으로 나갔다.
 * 가독성 외곽선·안전 배치도 1번 장 밝기로만 계산됐다.
 *
 * 실제 브라우저(375×812)에서 샵 사진 6장으로 확인한 것:
 *   0 bright  자동텍스트 → 흰 글씨 + 외곽선
 *   1 dark    직접추가   → 흰 글씨 + 외곽선
 *   2 text-heavy 직접추가 → **검은 글씨 · 외곽선 없음**   ← 장마다 다르게 판단한다
 *   4 clean   직접추가   → 흰 글씨 + 외곽선
 *   Vision 호출 = 0 (8회 전환 내내)
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ed = rd('js/itd-editor/itd-editor.js');

describe('사진별 상태 — 전역 플래그가 남아 있으면 안 된다', () => {
  test('세션 전역 플래그가 코드에서 사라졌다', () => {
    // 주석에는 옛 이름이 남는다(왜 바꿨는지 적어둬야 하니까) → 블록/라인 주석을 걷어내고 본다
    const code = ed.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/S\._planApplied/);
    expect(code).not.toMatch(/S\._safeApplied/);
    expect(code).not.toMatch(/S\._userMoved/);
  });

  test('장별 상태는 새 틀이 아니라 현재 장 번호(adjSel)를 키로 쓴다', () => {
    expect(ed).toMatch(/function _ps\(i\)/);
    expect(ed).toMatch(/S\.adjSel \|\| 0/);
    expect(ed).toMatch(/planApplied: false, safeApplied: false, moved: false/);
  });

  test('비동기 결과가 다른 장에 새지 않는다 (세대 확인에 장 번호 포함)', () => {
    expect(ed).toMatch(/S === mySession && \(S\.adjSel \|\| 0\) === _psIdx/);
  });
});

describe('🔴 빈 장에 도장을 찍으면 나중에 글자를 넣어도 영영 안 돈다', () => {
  test('손댈 글자가 없으면 planApplied 를 안 찍고 나간다', () => {
    const i = ed.indexOf('var _hasText =');
    expect(i).toBeGreaterThan(0);
    const seg = ed.slice(i, i + 400);
    expect(seg).toMatch(/if \(!_hasText\) return;/);
    // 도장은 그 **뒤에** 찍힌다
    expect(seg.indexOf('if (!_hasText) return;')).toBeLessThan(seg.indexOf('planApplied = true'));
  });

  test('글자를 새로 만들면 그 장 기준으로 초안이 돈다 — addText 안에서 건다', () => {
    const i = ed.indexOf('function addText()');
    const seg = ed.slice(i, ed.indexOf('function editText', i));
    expect(seg).toMatch(/_planForCurrentPhoto\(\)/);
  });

  test('호출부가 아니라 addText 한 곳에만 건다 (경로가 넷이다)', () => {
    expect(ed).not.toMatch(/addText\(\); _planForCurrentPhoto\(\)/);
  });
});

describe('장 전환 경로는 둘 다 같게 동작한다', () => {
  test('보정 스트립도 레이어를 갈아끼운다 — 예전엔 한쪽만 했다', () => {
    const i = ed.indexOf('function onAdjThumb');
    const seg = ed.slice(i, ed.indexOf('\n  }', i));
    expect(seg).toMatch(/_switchPhotoLayers\(S\.adjSel, i\)/);
    expect(seg).toMatch(/_planForCurrentPhoto\(\)/);
  });

  test('레이아웃 스트립도 전환 뒤 초안을 돌린다', () => {
    const i = ed.indexOf('function onLayThumb');
    const seg = ed.slice(i, ed.indexOf('\n  }', i));
    expect(seg).toMatch(/_planForCurrentPhoto\(\)/);
  });
});

describe('🔑 장 전환에 Vision 호출 0 — 구조로 보장한다', () => {
  /* 실제 브라우저에서 8회 전환 동안 0 이었지만, 그건 '지금 0'이지 '앞으로도 0'이 아니다.
     계획 경로 모듈에 네트워크 호출이 생기면 그때부터 장을 넘길 때마다 돈다. */
  const PLAN_PATH = ['js/photo/photo-context.js', 'js/photo/content-intent.js', 'js/photo/edit-plan.js',
    'js/photo/shop-baseline.js', 'js/photo/draft-personalization.js', 'js/photo/text-readability.js'];

  test.each(PLAN_PATH)('%s 에 네트워크 호출이 없다', (f) => {
    const src = rd(f);
    expect(src).not.toMatch(/apiFetch\s*\(/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/XMLHttpRequest/);
  });

  test('Vision 을 부르는 곳은 인스타 연동 모듈 하나뿐이다', () => {
    expect(rd('js/photo/instagram-text-style.js')).toMatch(/apiFetch\('\/instagram-style\/analyze'/);
  });
});

describe('🔴 크기 취향이 핀치에서만 잡히고 있었다 (2026-08-23)', () => {
  /* 슬라이더로 크기를 바꾸면 `size_changed` 가 **한 건도 안 나왔다.**
     크기 개인화가 핀치를 쓰는 원장에게만 붙는다는 뜻이었다.
     실제 UI 로 확인: 슬라이더만 움직였을 때 신호 4개(정렬·색·폰트·위치) → 수정 후 5개. */
  test('슬라이더 조작 끝(change)에 size_changed 를 한 건 남긴다', () => {
    const i = ed.indexOf("refs.size.addEventListener('change'");
    expect(i).toBeGreaterThan(0);
    const seg = ed.slice(i, i + 700);
    expect(seg).toMatch(/_sig\('size_changed'/);
    expect(seg).toMatch(/before: _sizeSnap\.size, after: after\.size/);   // 배율이 아니라 정규화 size
  });

  test('input 마다 남기지 않는다 — 한 번 끄는 데 수백 건이면 IDB·배터리가 죽는다', () => {
    const i = ed.indexOf("refs.size.addEventListener('input'");
    const seg = ed.slice(i, ed.indexOf("refs.size.addEventListener('change'"));
    expect(seg).not.toMatch(/_sig\('size_changed'/);
  });

  test('값이 실제로 바뀌었을 때만 남긴다', () => {
    expect(ed).toMatch(/after\.size !== _sizeSnap\.size/);
  });
});
