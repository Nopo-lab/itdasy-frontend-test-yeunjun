/* [2026-09-11] PHOTO EDITOR FINAL GATE — 사진 보정(adjust) 회귀 가드.
 *
 * 🔴 잡은 결함: 재편집하면 **화면엔 보정이 안 걸리는데 발행본에는 걸려 나갔다.**
 *   `_restoreState` 가 S.adj(밝기·대비·채도·온도·선명도·수평)를 되살리는데,
 *   그걸 화면에 거는 applyAdjToDisplay/applyStraighten 을 아무도 안 불렀다.
 *   슬라이더는 보정 패널을 열 때 renderAdjust() 가 맞춰주니 "+30 이라고 적혀 있는데
 *   큰 사진은 그대로" 였고, 원장은 보정이 안 된 줄 알고 또 올리게 된다.
 *   실측(스테이지 533×666): 저장→재편집 시 stage photo filter=none, 회색패치 64(원본),
 *   발행본 74(보정). 필터가 걸린 요소는 보정 패널 썸네일 하나뿐이었다.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const ed = fs.readFileSync(path.join(ROOT, 'itd-editor/itd-editor.js'), 'utf8');
/* 🔴 주석을 반드시 걷어낸다.
   이 파일의 설명 주석에 `_flushEditingText()` 같은 **함수 이름이 그대로 적혀 있어서**,
   주석만 보고 통과하는 가드가 됐다(실제로 호출을 지워도 14/14 초록이었다).
   테스트가 초록인데 아무것도 안 보는 상태가 제일 위험하다. */
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const fn = (name) => {
  const i = ed.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('함수를 못 찾았다: ' + name);
  const j = ed.indexOf('\n  function ', i + 10);
  return strip(ed.slice(i, j < 0 ? i + 4000 : j));
};

describe('🔴 재편집 시 사진 보정이 화면에 반영된다', () => {
  test('복원 렌더가 applyAdjToDisplay 를 부른다', () => {
    expect(fn('_applyRestore')).toContain('applyAdjToDisplay()');
  });
  test('복원 렌더가 applyStraighten(수평)도 부른다', () => {
    expect(fn('_applyRestore')).toContain('applyStraighten()');
  });
  test('_restoreState 는 S.adj 를 되살린다 (값 자체는 살아 있어야 한다)', () => {
    expect(fn('_restoreState')).toMatch(/S\.adj = st\.adj\.map/);
  });
});

describe('보정 값이 화면·굽기 양쪽에서 같은 함수로 만들어진다', () => {
  /* 화면은 filterStr(...) 로 CSS filter 를 만들고, 굽기는 WorkspaceAdapter 가 같은 adjust 객체를 받는다.
     여기서 갈라지면 "화면은 밝은데 발행본은 어둡다" 가 된다. */
  test('화면 필터는 filterStr 하나로만 만든다', () => {
    expect(fn('_syncSingleFx')).toContain('filterStr(');
    expect(fn('applyAdjToDisplay')).toContain('filterStr(');
  });
  /* 굽기도 **같은 filterStr(adjOf(i))** 를 canvas filter 로 쓴다. 이게 SSOT 라서
     밝기·대비·채도·온도가 화면과 픽셀까지 일치했다(실측: 회색 64→89 = ×1.4 정확).
     한쪽에 숫자를 따로 적기 시작하면 그 순간 갈라진다. */
  test('굽기도 filterStr(adjOf(...)) 를 canvas filter 로 쓴다', () => {
    const i = ed.indexOf('function exportComposite');
    expect(i).toBeGreaterThan(0);
    const seg = ed.slice(i, i + 6000);
    expect(seg).toMatch(/filterStr\(adjOf\(/);
    expect(seg).toMatch(/\.filter = _sFlt|\.filter = flt/);
  });
});

describe('보정 되돌리기 (BUG-03 계약 유지)', () => {
  test('adj op 가 되돌릴 때 화면·슬라이더·썸네일을 모두 다시 그린다', () => {
    const i = ed.indexOf("if (op.op === 'adj')");
    expect(i).toBeGreaterThan(0);
    const seg = ed.slice(i, i + 400);
    expect(seg).toContain('syncAdjSliders()');
    expect(seg).toContain('applyAdjToDisplay()');
    expect(seg).toContain('applyStraighten()');
    expect(seg).toContain('renderAdjust()');
  });
});

describe('초기화', () => {
  test('보정 초기화가 되돌리기 스택에 쌓인다 (되돌릴 수 있어야 한다)', () => {
    const i = ed.indexOf('refs.adjReset.addEventListener');
    expect(i).toBeGreaterThan(0);
    expect(ed.slice(i, i + 400)).toMatch(/_pushAdj|_pushOp/);
  });
});

describe('🔴 삭제를 되돌리면 레이어가 원래 자리로 돌아온다', () => {
  /* 모델(S.layers)은 op.idx 로 제자리에 되돌리는데 DOM 은 항상 맨 뒤에 붙이고 있었다.
     굽기는 모델 순서로 그리므로 **화면에선 맨 위인데 발행본에선 원래 자리**로 나갔다.
     실측: 겹친 A·B·C 에서 B 삭제 → ↩ → 화면 맨 위 BBBB / 발행본 맨 위 CCCC. */
  test('DOM 을 appendChild 가 아니라 모델과 같은 자리에 끼워 넣는다', () => {
    const i = ed.indexOf("var add = (op.op === 'add') !== undo;");
    expect(i).toBeGreaterThan(0);
    const seg = ed.slice(i, i + 1400);
    expect(seg).toContain('insertBefore(op.L.el');
    expect(seg).toMatch(/var ref = S\.layers\[at \+ 1\]/);
  });
  test('모델 삽입 자리와 DOM 삽입 자리가 같은 at 을 쓴다', () => {
    const i = ed.indexOf("var add = (op.op === 'add') !== undo;");
    const seg = ed.slice(i, i + 1400);
    expect(seg).toMatch(/var at = \(op\.idx != null[\s\S]{0,120}S\.layers\.splice\(at, 0, op\.L\)/);
  });
  test('삭제가 위치(idx)를 기록한다 — 없으면 되돌릴 자리를 모른다', () => {
    expect(fn('removeLayer')).toMatch(/_pushOp\(\{ op: 'del', L: L, idx: i \}\)/);
  });
});

describe('🔴 치던 글자가 사진 전환·저장에서 사라지지 않는다', () => {
  /* `_serLayer` 는 모델(L.text)을 읽는데, contenteditable 로 입력 중인 내용은 blur 전까지
     모델에 안 들어간다. 원장이 사진1에 문구를 치다가 사진2를 눌러보고 돌아오면
     방금 친 글자가 통째로 없고 '내용을 입력하세요' 로 돌아와 있었다.
     실측: 'REALTYPED' 입력(편집 모드 유지) → 썸네일로 2번 → 1번 복귀 → 플레이스홀더.
     `_flushEditingText()` 는 이미 있었지만 **2초 초안 타이머만** 불렀다. */
  test.each(['_switchPhotoLayers', '_collectPerPhoto', '_exportState'])(
    '%s 가 직렬화 전에 _flushEditingText 를 부른다', (f) => {
      expect(fn(f)).toContain('_flushEditingText()');
    });
  test('flush 는 편집 중(contenteditable=true)인 레이어만 건드린다', () => {
    const b = fn('_flushEditingText');
    expect(b).toMatch(/getAttribute\('contenteditable'\) !== 'true'/);
    expect(b).toMatch(/L\.text = _t/);
  });
});

describe('접근성 — 조작 요소에 읽어줄 이름이 있다', () => {
  /* 실측(편집기 열고 5개 도구 패널 전부 펼침): 조작 요소 144개 중 **63개에 이름이 없었다.**
     대부분 색 스와치였고, 슬라이더 7개도 옆의 글자만 있고 프로그램적 이름이 없었다.
     화면·크기·색은 그대로 두고 aria-label 만 붙였다(디자인 변경 아님). 63 → 0. */
  test('색 스와치가 aria-label 을 단다', () => {
    expect(fn('_swRow')).toMatch(/aria-label="' \+ _colorName\(c\) \+ '"/);
  });
  test('색 이름표가 팔레트 8색을 모두 덮는다', () => {
    const i = ed.indexOf('var COLOR_NAMES');
    expect(i).toBeGreaterThan(0);
    const seg = ed.slice(i, i + 400);
    ['#FFFFFF', '#15181D', '#BC6675', '#E08A6E', '#E6B45A', '#86B06E', '#6E9BC4', '#A98AC4']
      .forEach((c) => expect(seg).toContain(c));
  });
  test.each([
    ['data-r="size"', '글자 크기'], ['data-r="tilt"', '글자 기울기'],
    ['data-r="adjRot"', '사진 수평'], ['data-r="shapeThick"', '도형 굵기'],
    ['data-r="layGap"', '사진 간격'], ['data-r="brushSize"', '붓 굵기'],
  ])('%s 슬라이더에 이름이 있다', (attr, name) => {
    const i = ed.indexOf(attr);
    expect(i).toBeGreaterThan(0);
    expect(ed.slice(i, i + 120)).toContain('aria-label="' + name + '"');
  });
  test('보정 슬라이더 5종은 라벨을 그대로 이름으로 쓴다', () => {
    expect(ed).toMatch(/data-adj="' \+ c\.k \+ '" aria-label="' \+ c\.label \+ '"/);
  });
  test('사진 썸네일에 몇 번째 사진인지 이름이 있다', () => {
    expect(ed).toMatch(/data-adjthumb="' \+ i \+ '" aria-label="' \+ \(i \+ 1\) \+ '번째 사진"/);
  });
});

/* 🔴 [2026-09-11 · §37 동시성] 탭 두 개로 서로 다른 사진을 편집하면
   **다른 탭 사진이 내 복구본에 들어왔다.**
   가벼운 상태(글자·스티커·보정)는 sessionStorage 라 탭별인데,
   사진은 `DRAFT_ASSET` **키 한 개**에 브라우저 전체가 겹쳐 쓴다 → 마지막에 쓴 탭이 이긴다.
   `_draftRead` 는 sig 를 대조하는데 `_draftLoadMedia` 는 **아무 대조도 안 했다.**

   실측(로컬 8199, build 20260911-pg5):
     A 사진 1,115,874B 로 편집 → B 사진 530,558B 로 편집(공유 키 덮어씀)
     → A 새로고침 → '이어서 편집' 을 **29ms 만에** 클릭(A 자신의 첫 2초 틱 이전)
     → 글자 "AAAA"(A 것)인데 사진 photoLen=530,558(**B 것**).
   수정 후 같은 재현: photoLen=1,115,874(A 것), 콘솔 오류 0.
*/
describe('🔴 초안 사진은 그 초안의 것일 때만 되살린다 (탭 간 오염)', () => {
  test('초안 사진을 저장할 때 어느 초안 것인지 도장(sig)을 같이 남긴다', () => {
    expect(strip(ed)).toMatch(/saveAssetToDB\(\{\s*id:\s*DRAFT_ASSET,\s*sig:\s*_photosSig\(sp\.media\.photos\)/);
  });
  test('_draftLoadMedia 가 기대 sig 를 인자로 받는다', () => {
    expect(strip(ed)).toMatch(/function _draftLoadMedia\(expectSig\)/);
  });
  test('_draftLoadMedia 가 sig 불일치면 사진을 안 돌려준다', () => {
    expect(fn('_draftLoadMedia')).toMatch(/expectSig\s*&&\s*rec\.sig\s*!==\s*expectSig/);
  });
  test('복구 호출부가 그 초안의 sig 를 넘긴다', () => {
    expect(strip(ed)).toContain('_draftLoadMedia(_dr.sig)');
  });
});

/* 🔴 [2026-09-11 · §40 뮤테이션] **사진 수평(회전)이 화면에 반영되는 경로에 가드가 없었다.**
   `applyPhotoTransform` 안에서 `deg` 를 0 으로 만들어도 편집기 테스트 9개 스위트가
   전부 초록이었다 — 보정(밝기·대비)은 가드가 있는데 회전만 비어 있었다.
   증상은 보정 미반영과 같은 계열이다: 슬라이더엔 8.5° 라고 적혀 있는데 큰 사진은 안 기울고,
   발행본에서만 기울어 나간다(화면≠발행본).
   그래서 "활성 사진의 adj.rot 을 읽어 photowrap 에 rotate 로 건다" 를 가드로 박는다. */
describe('🔴 사진 수평(회전)이 화면에 걸린다', () => {
  const apt = fn('applyPhotoTransform');
  test('활성 사진의 adj.rot 을 읽는다 (0 으로 굳히면 안 된다)', () => {
    expect(apt).toMatch(/deg\s*=\s*\(?\s*adjOf\(/);
  });
  test('읽은 각도를 photowrap 의 rotate 로 건다', () => {
    expect(apt).toMatch(/refs\.photowrap\.style\.transform/);
    expect(apt).toMatch(/rotate\('\s*\+\s*deg\s*\+\s*'deg\)/);
  });
  test('회전 시 여백이 보이지 않게 cover 배율을 같이 건다', () => {
    expect(apt).toMatch(/coverScaleForRot\(deg\)/);
  });
  test('수평 슬라이더 변경이 applyStraighten → applyPhotoTransform 으로 이어진다', () => {
    expect(fn('applyStraighten')).toContain('applyPhotoTransform()');
  });
  test('복원도 수평을 화면에 다시 건다', () => {
    expect(fn('_applyRestore')).toContain('applyStraighten()');
  });
});

/* 🔴 [2026-09-11 · §24 실측] **붓그림이 재편집에서 사라졌다 — 발행본에서도.**
   `_exportState` 는 `photoDraw` 를 저장하고 `_restoreState` 는 `S.photoDraw` 로 되살린다.
   그런데 **캔버스에 다시 칠하는 코드가 없었고**, `initCanvas()` 가 width/height 를
   세팅하며 캔버스를 비운다. 발행은 이 캔버스를 합성하므로 그림이 통째로 빠진다.
   실측(스테이지 714×893): 그린 직후 잉크 샘플 91 → 재편집 후 0,
   발행본 55,131B → 46,571B. 보정 미반영과 같은 계열(상태는 있는데 화면에 안 건다). */
describe('🔴 붓그림이 재편집에서 살아남는다', () => {
  test('복원 경로에 붓그림 다시 칠하기가 있다', () => {
    expect(strip(ed)).toContain('_restorePhotoDraw()');
  });
  test('initCanvas 가 캔버스를 비운 **뒤에** 칠한다 (순서가 핵심)', () => {
    const src = strip(ed);
    const i = src.indexOf('initCanvas();\n      if (_ed) _restorePhotoDraw();');
    expect(i).toBeGreaterThan(-1);
  });
  test('복원 모드일 때만 칠한다 (새 편집에 옛 그림이 묻으면 안 된다)', () => {
    expect(strip(ed)).toMatch(/if \(_ed\) _restorePhotoDraw\(\)/);
  });
  test('활성 사진의 그림을 고른다 (사진별 보관)', () => {
    expect(fn('_restorePhotoDraw')).toMatch(/S\.photoDraw\[idx\]/);
  });
  test('저장 당시와 캔버스 크기가 달라도 맞춰 그린다', () => {
    expect(fn('_restorePhotoDraw')).toMatch(/drawImage\(im, 0, 0, refs\.draw\.width, refs\.draw\.height\)/);
  });
  test('_exportState 는 붓그림을 계속 저장한다 (원천이 없으면 복원도 없다)', () => {
    expect(fn('_exportState')).toMatch(/photoDraw: Object\.assign\(\{\}, S\.photoDraw\)/);
  });

  /* 🔴 2차: 복원 코드를 넣었는데도 그림이 안 돌아왔다. 한 단계 앞이 비어 있었다 —
     붓그림은 **캔버스에만** 있고 `S.photoDraw` 에는 사진 전환 때만 들어갔다.
     사진이 한 장이면 그게 영영 안 돌아 **빈 채로 저장**된다.
     실측: 잉크 133 인데 저장본 photoDraw 키 0개. 입력 중 글자와 같은 자리·같은 이유. */
  test('저장 직전에 캔버스를 상태로 옮긴다 (입력 중 글자와 같은 자리)', () => {
    const es = fn('_exportState');
    expect(es).toContain('_flushEditingText()');
    expect(es).toContain('_flushPhotoDraw()');
  });
  test('한 획도 안 그었으면 건드리지 않는다 (빈 캔버스를 저장하지 않는다)', () => {
    expect(fn('_flushPhotoDraw')).toMatch(/if \(!S\._drawInk\) return;/);
  });
  test('획이 끝나면 그림 있음으로 표시한다 (픽셀 훑기로 판정하면 얇은 획을 놓친다)', () => {
    expect(fn('drawUp')).toMatch(/S\._drawInk = true/);
  });
  test('전체 지우기는 표시와 저장본을 함께 지운다', () => {
    const src = strip(ed);
    expect(src).toMatch(/drawClear[\s\S]{0,260}S\._drawInk = false[\s\S]{0,120}delete S\.photoDraw\[/);
  });
  test('되살린 그림도 있음으로 표시한다 (다음 저장에서 건너뛰면 안 된다)', () => {
    expect(fn('_restorePhotoDraw')).toMatch(/S\._drawInk = true/);
  });
});
