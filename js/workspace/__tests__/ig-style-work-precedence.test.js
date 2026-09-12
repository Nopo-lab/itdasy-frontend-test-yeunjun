/* 스타일 적용의 **우선순위 계약**.  [2026-09-04]
 *
 * 스펙이 요구하는 세 가지가 서로 충돌하기 쉬워서 여기서 못 박는다:
 *
 *   §20  이미 저장된 작업을 다시 열면 그 **스냅샷**이 이긴다.
 *        새로 생긴 개인화 때문에 예전 작업이 달라 보이면 안 된다.
 *   §21  새 작업에서는 원장이 **명시적으로 고른 스타일**이 이긴다.
 *   §22  그 선택이 **다음 작업까지 따라가면 안 된다**(last-used 강제 적용 금지).
 *   §39  스타일을 나중에 고쳐도 이미 저장된 작업은 안 변한다.
 *
 * 이건 소스 계약 테스트다. 실제 편집기를 띄우는 건 브라우저 QA 가 하고,
 * 여기서는 **그 계약을 지우는 변경**이 조용히 들어오는 걸 막는다
 * (이 레포에서 '테스트는 통과하는데 안 도는 코드' 가 반복해서 나왔다).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');

const flow = fs.readFileSync(path.join(ROOT, 'js/workspace/workspace-v2-flow.js'), 'utf8');
const editor = fs.readFileSync(path.join(ROOT, 'js/itd-editor/itd-editor.js'), 'utf8');

describe('§21 — 고른 스타일이 전역 기본값보다 먼저', () => {
  test('_buildShopStyleLayers 가 작업별 선택을 먼저 본다', () => {
    const fn = flow.slice(flow.indexOf('function _buildShopStyleLayers()'));
    const head = fn.slice(0, 1600);
    const iPick = head.indexOf('IgStyleLibrary.styleForWork');
    const iActive = head.indexOf('ShopStyle.getActive');
    expect(iPick).toBeGreaterThan(-1);
    expect(iActive).toBeGreaterThan(-1);
    expect(iPick).toBeLessThan(iActive);   // 순서가 뒤집히면 선택이 무시된다
  });

  test('선택이 없으면 기존 기본값으로 폴백한다 — 기능이 사라지면 안 된다', () => {
    const fn = flow.slice(flow.indexOf('function _buildShopStyleLayers()'), flow.indexOf('function _buildShopStyleLayers()') + 1600);
    expect(fn).toMatch(/if\s*\(!ss\)\s*ss\s*=\s*\(window\.ShopStyle/);
  });

  test('선택 키는 **작업 세션키** 다 — 전역 키로 바뀌면 §22 가 깨진다', () => {
    /* [2026-09-04] 예전엔 `d.slot.id` 를 직접 읽었다. 그런데 그건 **저장 시점에야 생겨서**
       사진 올린 직후 고른 스타일이 통째로 무시됐다(P0, 브라우저 매트릭스로 잡음).
       이제 `_workKey()` — 열릴 때 만들어지는 세션키 — 를 쓴다. */
    const fn = flow.slice(flow.indexOf('function _buildShopStyleLayers()'), flow.indexOf('function _buildShopStyleLayers()') + 1600);
    expect(fn).toMatch(/styleForWork\(_workKey\(\)\)/);
    // 전역 키(테넌트만)로 되돌아가면 안 된다
    expect(fn).not.toMatch(/styleForWork\(\s*['"]/);
  });
});

describe('§22 — setActive 로 전역 기본값을 바꾸지 않는다', () => {
  const lib = fs.readFileSync(path.join(ROOT, 'js/photo/ig-style-library.js'), 'utf8');

  test('apply 경로에 ShopStyle.setActive 강제 지정이 없다', () => {
    const applyFn = lib.slice(lib.indexOf('function apply(groupId, workId)'));
    const body = applyFn.slice(0, applyFn.indexOf('function styleForWork'));
    /* setActive 는 '전역 기본값을 이걸로 바꾼다' 는 뜻이다. apply 안에 있으면
       이번 작업에 써본 스타일이 다음 글까지 따라간다. */
    expect(body).not.toMatch(/ShopStyle[\s\S]{0,40}\.setActive\(/);
  });

  test('create 는 makeActive=false 로 부른다', () => {
    expect(lib).toMatch(/SS\.create\(Object\.assign\(\{ name: name \}, p\), false\)/);
  });

  test('첫 스타일이 자동으로 active 가 되는 것도 되돌린다', () => {
    // ShopStyle.create 는 목록이 비면 무조건 active 로 만든다 — 그 구멍을 막는 코드가 있어야
    expect(lib).toMatch(/ensureSeed/);
    expect(lib).toMatch(/getActiveId\(\) === created\.id/);
  });
});

describe('§20/§39 — 저장된 작업 스냅샷이 스타일보다 먼저', () => {
  test('편집기는 editState 가 있으면 그걸 복원한다', () => {
    expect(editor).toMatch(/var _ed = \(opts\.editState && opts\.editState\.v\) \? opts\.editState : null;/);
    expect(editor).toMatch(/if \(_ed\) \{ try \{ _restoreState\(_ed\);/);
  });

  test('flow 는 저장된 editState 를 editState 로 넘긴다(스타일 레이어로 덮지 않는다)', () => {
    /* [2026-09-04] `_freshPick` 이 붙었다 — **원장이 방금 고른** 스타일만 스냅샷을 한 번 건너뛴다.
       §20 이 막으려던 건 '자동 개인화가 예전 작업을 바꾸는 것' 이지,
       원장이 직접 고른 걸 막는 게 아니다(§21). 자동 경로는 여전히 스냅샷이 이긴다. */
    expect(flow).toMatch(/var _restore = \(!_freshPick && !_hasBg && p0 && p0\.editState\) \|\| null;/);
    expect(flow).toMatch(/editState: _finalEs/);
    // fresh pick 이 아닐 때는 예전 그대로 스냅샷이 이긴다
    expect(flow).toMatch(/\(o\.fresh \|\| _freshPick\) \? _wmEd : \(\(p0 && p0\.editState\) \|\| _wmEd\)/);
  });

  test('저장 시 editState 스냅샷을 사진에 붙인다 — 나중에 스타일이 바뀌어도 이게 진실원', () => {
    expect(flow).toMatch(/if \(meta && meta\.editState\) p\.editState = meta\.editState;/);
  });
});

describe('§23 — 템플릿은 별개로 남는다', () => {
  test('스타일 적용이 템플릿 저장소를 건드리지 않는다', () => {
    const lib = fs.readFileSync(path.join(ROOT, 'js/photo/ig-style-library.js'), 'utf8');
    const sheet = fs.readFileSync(path.join(ROOT, 'js/photo/ig-style-sheet.js'), 'utf8');
    [lib, sheet].forEach((src) => {
      expect(src).not.toMatch(/TemplateLibrary|PhotoEditorTemplates|itdasy:template/);
    });
  });
});

describe('§54 — QA 하네스가 배포본에 안 들어간다', () => {
  test('신규 모듈에 mock·fake 인스타 데이터가 없다', () => {
    ['js/photo/ig-post-analysis.js', 'js/photo/ig-style-grouping.js',
      'js/photo/ig-style-library.js', 'js/photo/ig-style-sheet.js'].forEach((f) => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      expect(src).not.toMatch(/MOCK_|FAKE_|__DEBUG_PANEL|sampleGroups\s*=/);
    });
  });

  test('디버그 전역을 남기지 않는다', () => {
    ['js/photo/ig-post-analysis.js', 'js/photo/ig-style-grouping.js',
      'js/photo/ig-style-library.js', 'js/photo/ig-style-sheet.js'].forEach((f) => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      expect(src).not.toMatch(/window\.__ig/);
      expect(src).not.toMatch(/console\.log\(/);
    });
  });
});

/* [2026-09-10 정정] 이 describe 는 **가짜 초록이었다.**
   "작업진입점이 실제로 연결돼 있다" 면서 소스에 `data-fl="mystyle"` 마크업이 있는지만 봤는데,
   그 버튼을 그리던 `_myStyleBarHtml` 은 **옛 슬라이더 편집기(A)의 'edit' 화면에서만** 렌더됐다.
   그 화면은 2026-07-22 에 진입이 끊겨(ItdEditor 로 이관) 원장이 열 수 없었다 —
   즉 마크업은 있는데 **아무도 못 누르는 버튼**이었고, 테스트는 그걸 '연결됨' 이라고 통과시켰다.
   (실측: `IgStyleSheet.openList()` 호출자는 그 버튼 하나뿐.)
   'edit' 화면 제거와 함께 버튼도 사라졌으므로, 여기서는 **현재 사실**을 고정한다.

   🔴 남은 제품 이슈: 우리샵 스타일 **엔진은 살아 있다**(편집기 열 때 `_buildShopStyleLayers` 가
      활성 스타일을 자동 적용하고, 저장 시 `_learnShopStyle` 이 되학습한다).
      그런데 원장이 그 스타일을 **보거나 바꿀 입구가 지금 없다.** 살릴 거면 진입 UX 를 새로 정해야 한다. */
describe('§17 — 우리샵 스타일 시트: 엔진은 살아 있고 진입은 없다(현재 사실)', () => {
  /* [2026-09-10 scope-lock] 핸들러(`a === 'mystyle'`)도 제거했다.
     버튼(=유일한 emit)이 없어 어떤 클릭으로도 도달할 수 없었다(실측: 라이브 DOM 에서
     [data-fl="mystyle"] 0개). 시트 모듈 IgStyleSheet 자체는 별도 파일로 그대로 있다 —
     되살릴 땐 진입 UX 를 정하고 버튼과 핸들러를 같이 만든다. */
  test('작업실 안의 mystyle 진입(버튼·핸들러)은 둘 다 없다', () => {
    expect(flow).not.toMatch(/if \(a === 'mystyle'\)/);
    expect(flow).not.toContain('data-fl="mystyle"');
  });

  test('시트 모듈은 별도 파일로 살아 있다 — 되살릴 때 쓸 수 있다', () => {
    expect(fs.existsSync(path.join(ROOT, 'js/photo/ig-style-sheet.js'))).toBe(true);
  });

  test('버튼을 그리던 렌더러는 죽은 화면과 함께 제거됐다', () => {
    expect(flow).not.toContain('data-fl="mystyle"');
    expect(flow).not.toContain('function _myStyleBarHtml()');
  });

  test('자동 적용·되학습 엔진은 그대로다 — 원장 화면에 계속 영향을 준다', () => {
    expect(flow).toMatch(/_buildShopStyleLayers/);
    expect(flow).toMatch(/function _learnShopStyle/);
  });
});

describe('§28 — 목록이 서버를 끝없이 두드리지 않는다', () => {
  const sheet = fs.readFileSync(path.join(ROOT, 'js/photo/ig-style-sheet.js'), 'utf8');

  test('_renderList 의 재렌더는 skipRefresh 로 한 번에서 끊긴다', () => {
    /* 🔴 브라우저 카오스 QA 에서 탭이 통째로 얼어붙어 잡았다:
         _renderList → L.list() → then(_renderList) → L.list() → …
       목록 화면이 열려 있는 동안 API 를 무한 호출한다. 운영에선 원장 한 명이
       스타일 목록을 열어두기만 해도 서버를 계속 때린다. */
    expect(sheet).toMatch(/function _renderList\(body, skipRefresh\)/);
    expect(sheet).toMatch(/if \(L && !skipRefresh\)/);
    expect(sheet).toMatch(/_renderList\(body, true\)/);
  });

  test('빠르게 여러 번 눌러도 요청은 한 번 (§46)', () => {
    expect(sheet).toMatch(/var _busy = false;/);
    expect(sheet).toMatch(/function _guard\(fn\)/);
    // 생성·이름변경·게시물저장·삭제·적용 — 전부 _guard 를 통과해야 한다
    ['data-igs-savenew', 'data-igs-rename', 'data-igs-savepost', 'data-igs-delete', 'data-igs-apply']
      .forEach((attr) => {
        const i = sheet.indexOf("t.closest('[" + attr + "]')");
        expect(i).toBeGreaterThan(-1);
        expect(sheet.slice(i, i + 700)).toMatch(/_guard\(/);
      });
  });
});

describe('§48 — 뒤로가기에 등록한다', () => {
  const sheet = fs.readFileSync(path.join(ROOT, 'js/photo/ig-style-sheet.js'), 'utf8');
  test('_registerSheet / _markSheetOpen / _markSheetClosed 전부 부른다', () => {
    /* 안 부르면 안드로이드 백버튼이 이 시트를 모르고 **앱을 종료한다**.
       이 레포에서 반복해서 난 사고라 가드로 둔다. */
    expect(sheet).toMatch(/_registerSheet.*\(ID, close\)/);
    expect(sheet).toMatch(/_markSheetOpen.*\(ID\)/);
    expect(sheet).toMatch(/_markSheetClosed.*\(ID\)/);
  });

  test('열림 클래스를 rAF 에 걸지 않는다 — 백그라운드면 rAF 가 안 돈다', () => {
    const open = sheet.slice(sheet.indexOf('function _open(view, id)'), sheet.indexOf('function close()'));
    // 이름이 아니라 **호출**을 본다 — 주석에 이름이 있는 건 괜찮다(왜 안 쓰는지 적어뒀다).
    expect(open).not.toMatch(/requestAnimationFrame\s*\(/);
    expect(open).toMatch(/void el\.offsetHeight;/);
  });
});
