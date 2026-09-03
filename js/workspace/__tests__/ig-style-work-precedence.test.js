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

  test('선택 키는 **작업 id** 다 — 전역 키로 바뀌면 §22 가 깨진다', () => {
    const fn = flow.slice(flow.indexOf('function _buildShopStyleLayers()'), flow.indexOf('function _buildShopStyleLayers()') + 1600);
    expect(fn).toMatch(/styleForWork\(\s*\(d\.slot && d\.slot\.id\)/);
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
    expect(flow).toMatch(/var _restore = \(!_hasBg && p0 && p0\.editState\) \|\| null;/);
    expect(flow).toMatch(/editState: _finalEs/);
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

describe('§17 — 작업실 진입점이 실제로 연결돼 있다', () => {
  test('버튼이 있고 그 액션이 시트를 연다', () => {
    expect(flow).toMatch(/data-fl="mystyle"/);
    expect(flow).toMatch(/if \(a === 'mystyle'\)/);
    expect(flow).toMatch(/IgStyleSheet\.openList\(\)/);
  });

  test('스타일이 없으면 버튼을 안 보여준다 — 빈 목록만 나오는 버튼은 없느니만 못하다', () => {
    const fn = flow.slice(flow.indexOf('function _myStyleBarHtml()'));
    expect(fn.slice(0, 900)).toMatch(/if \(!gs\.length\) return '';/);
  });
});
