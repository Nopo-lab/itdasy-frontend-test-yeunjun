const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '../..');
const dataSrc = fs.readFileSync(path.join(ROOT, 'itd-editor/data/itd-beauty-stickers.js'), 'utf8');
const editorSrc = fs.readFileSync(path.join(ROOT, 'itd-editor/itd-editor.js'), 'utf8');
const homeSrc = fs.readFileSync(path.join(ROOT, 'workspace/workspace-v2-home.js'), 'utf8');

function catalog() {
  const sandbox = { window: {} };
  vm.runInNewContext(dataSrc, sandbox);
  return sandbox.window.ItdBeautyStickers;
}

describe('살롱용 스티커 목록', () => {
  test('사진에 바로 쓸 수 있는 SVG 12종 이상이며 이름이 겹치지 않는다', () => {
    const list = catalog();
    expect(list.length).toBeGreaterThanOrEqual(12);
    expect(new Set(list.map((s) => s.id)).size).toBe(list.length);
    list.forEach((s) => expect(s.src).toMatch(/^data:image\/svg\+xml,/));
  });

  test('모든 스티커가 추천과 기본 배치에 필요한 정보를 가진다', () => {
    catalog().forEach((s) => {
      expect(s.name).toBeTruthy();
      expect(s.category).toBeTruthy();
      expect(s.industries.length).toBeGreaterThan(0);
      expect(s.occasions.length).toBeGreaterThan(0);
      expect(s.defaultSize).toBeGreaterThanOrEqual(72);
      expect(s.defaultPosition).toMatch(/^(top|bottom)-(left|center|right)$/);
      expect(s.contrast).toBeTruthy();
    });
  });

  test('핵심 업종은 바로 쓸 수 있는 선택지 4개 이상을 가진다', () => {
    const list = catalog();
    ['붙임머리', '네일', '속눈썹', '왁싱', '피부관리'].forEach((industry) => {
      expect(list.filter((s) => s.industries.includes(industry)).length).toBeGreaterThanOrEqual(4);
    });
  });

  test('추천 탭은 살롱 목록을 쓰고 선택 시 크기·위치를 적용한다', () => {
    expect(editorSrc).toMatch(/key === 'reco'[\s\S]{0,220}_beautyStickerGrid\(_recommendedBeautyStickers\(\)\)/);
    expect(editorSrc).toMatch(/data-bstk=/);
    expect(editorSrc).toMatch(/addImageSticker\(bo\.src, bo\)/);
    expect(editorSrc).toMatch(/meta\.defaultSize/);
    expect(editorSrc).toMatch(/meta\.defaultPosition/);
  });
});

describe('사진 꾸미기는 선택', () => {
  test('사진만 올린 상태를 편집 미완료라고 재촉하지 않는다', () => {
    expect(homeSrc).not.toContain('사진 완료 · 편집이 남았어요');
    expect(homeSrc).toContain('사진을 올렸어요 · 게시글을 써볼까요?');
  });

  test('캡션까지 있으면 게시 준비로 안내한다', () => {
    expect(homeSrc).toContain('게시 준비가 됐어요 · 사진 꾸미기는 선택');
    expect(homeSrc).toContain("_isReady(slot) ? '게시 준비'");
  });
});

describe('새 글자 기본 위치', () => {
  test('가운데 배치가 아니라 하단 안전 배치를 쓴다', () => {
    const i = editorSrc.indexOf('function addText()');
    const j = editorSrc.indexOf('\n  function editText', i);
    const block = editorSrc.slice(i, j);
    expect(block).toContain('placeSafeBottom(L, L.el.offsetWidth || 180, L.el.offsetHeight || 44)');
    expect(block).not.toMatch(/placeCenter\(L,\s*180/);
  });
});

describe('뷰티 보정 프리셋 기억', () => {
  test('원장이 바로 고를 수 있는 뷰티 프리셋 9종이 있다', () => {
    ['자연스럽게 밝게', '머리결 또렷하게', '네일 컬러 그대로', '속눈썹 또렷하게',
      '피부톤 자연스럽게', '저조도 살리기', '전후 비교 선명하게', '따뜻한 살롱톤', '차분한 무드톤']
      .forEach((name) => expect(editorSrc).toContain("name: '" + name + "'"));
  });

  test('선택한 프리셋만 저장하고 직접 숫자를 바꾸면 프리셋 표시를 해제한다', () => {
    expect(editorSrc).toMatch(/presetByPhoto\[String\(S\.adjSel\)\] = \{ presetId: p\.id, presetStrength: 1 \}/);
    expect(editorSrc).toMatch(/delete S\.presetByPhoto\[String\(S\.adjSel\)\]/);
    expect(editorSrc).toMatch(/presetByPhoto: Object\.assign\(\{\}, S\.presetByPhoto\)/);
  });

  test('저장본을 다시 열어도 적용 중인 보정 프리셋을 버튼에 표시한다', () => {
    expect(editorSrc).toMatch(/S\.presetByPhoto && S\.presetByPhoto\[String\(S\.adjSel\)\]/);
    expect(editorSrc).toMatch(/classList\.toggle\('is-selected', on\)/);
    expect(editorSrc).toMatch(/setAttribute\('aria-pressed', on \? 'true' : 'false'\)/);
  });

  test('기억한 프리셋은 다음 사진 전부에 실제 보정으로 적용되고 되돌릴 수 있다', () => {
    expect(editorSrc).toMatch(/function _applyMemoryPreset\(mark\)/);
    expect(editorSrc).toMatch(/\(S\.photos \|\| \[\]\)\.forEach/);
    expect(editorSrc).toMatch(/_pushOp\(\{ op: 'wmApply', Ls: added, adjPack: adjPack, wmToken: sug\.token \}\)/);
    expect(editorSrc).toMatch(/_restoreMemoryPreset\(op\.adjPack, det \? 'before' : 'after'\)/);
    expect(editorSrc).toMatch(/원장이 적용 뒤 직접 바꾼 보정은 보존/);
  });
});

describe('기억한 스타일을 언제든 뺄 수 있음', () => {
  test('새로 적용한 레이어도 기억 출처와 적용 번호를 보존한다', () => {
    expect(editorSrc).toMatch(/function _tagMemoryLayer\(L, spec\)/);
    expect(editorSrc).toMatch(/L\._src = 'wm'; L\._wmTok = spec\._wmTok \|\| null/);
    expect(editorSrc).toMatch(/_tagMemoryLayer\(addShopLayer\(spec, R\), spec\)/);
  });

  test('기억 레이어나 보정이 있으면 편집기 상단 제거 버튼을 연다', () => {
    expect(editorSrc).toMatch(/refs\.wmRemove\.hidden = !\(_wmLs\.length \|\| S\._wmAdjPack\)/);
    expect(editorSrc).toMatch(/undoWmApply\(ap && ap\.token\)/);
  });

  test('추천만 보기는 편집기 안에서 원장이 눌러 적용할 수 있다', () => {
    expect(editorSrc).toMatch(/data-r="wmSuggest"/);
    expect(editorSrc).toMatch(/function _applyWmSuggestion\(\)/);
    expect(editorSrc).toMatch(/WorkMemoryEngine\.acceptSuggestion\(sug\)/);
    expect(editorSrc).toMatch(/지난 .* 스타일 적용/);
  });
});
