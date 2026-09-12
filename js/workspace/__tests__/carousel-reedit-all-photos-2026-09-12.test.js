/**
 * [2026-09-12 ZERO-HELP P2-1] 캐러셀 3장을 다시 열면 **사진이 1장만** 들어오던 것.
 *
 * 실측(LIVE): 3장 캐러셀 → 장마다 글자 → 저장 → 재편집
 *   → '보정할 사진을 고르세요' 아래 썸네일 1개. 2·3번 장은 다시 고칠 방법이 없다.
 *
 * 원인은 두 겹이다.
 *   ① 장별 저장이 만든 editState 의 `photos` 가 **자기 원판 1장**이라
 *      `_restoreState` 가 `S.photos` 를 그 1장으로 덮어쓴다.
 *   ② 전체 스냅샷을 집어도 `layersByPhoto` 는 저장에 안 실려 다른 장이 **빈 채로** 열리고,
 *      장을 넘기는 순간 `_switchPhotoLayers` 가 그 빈 상태를 저장해 글자가 사라진다.
 *
 * 이 가드는 소스 계약을 고정한다(라이브 검증은 별도 — 리포트 §2).
 */
const fs = require('fs');
const path = require('path');

const FLOW = fs.readFileSync(path.join(__dirname, '..', 'workspace-v2-flow.js'), 'utf8');
const ED = fs.readFileSync(path.join(__dirname, '..', '..', 'itd-editor', 'itd-editor.js'), 'utf8');

// 주석은 판정에서 뺀다 — 가드가 자기 설명문에 걸려 통과하던 사고가 있었다.
function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
}
const FLOW_C = strip(FLOW);
const ED_C = strip(ED);

function carouselBlock() {
  const i = FLOW_C.indexOf('var _carousel = null;');
  expect(i).toBeGreaterThan(0);
  return FLOW_C.slice(i, i + 2200);
}

describe('캐러셀 재편집 — 전체 장 복원 (P2-1)', () => {
  test('재편집 분기가 존재하고 Editor.open 에 layersByPhoto/photoIdx 를 넘긴다', () => {
    const blk = carouselBlock();
    expect(blk).toMatch(/_carousel\s*=\s*\{[^}]*layersByPhoto/);
    expect(blk).toMatch(/photoIdx:\s*_aIdxC/);
    // open 호출부에 실제로 실려야 한다 — 만들어만 두고 안 넘기면 아무 일도 안 일어난다.
    const openAt = FLOW_C.indexOf('editState: _finalEs,');
    expect(openAt).toBeGreaterThan(0);
    const openBlk = FLOW_C.slice(openAt, openAt + 400);
    expect(openBlk).toMatch(/layersByPhoto:\s*_carousel\s*\?\s*_carousel\.layersByPhoto\s*:\s*null/);
    expect(openBlk).toMatch(/photoIdx:\s*_carousel\s*\?\s*_carousel\.photoIdx\s*:\s*null/);
  });

  test('사진 목록은 **원판**(_cleanBase)으로 만든다 — 편집본을 쓰면 레이어가 두 번 구워진다', () => {
    const blk = carouselBlock();
    expect(blk).toMatch(/_basesC\s*=\s*_epsC\.map\(function \(p\) \{ return _cleanBase\(p\)/);
    expect(blk).not.toMatch(/_basesC[\s\S]{0,120}editedDataUrl/);
    expect(blk).toMatch(/photos:\s*_basesC/);
  });

  test('장별 레이어는 각 사진 자기 editState 에서 모은다(다른 장 것을 섞지 않는다)', () => {
    const blk = carouselBlock();
    expect(blk).toMatch(/_epsC\.forEach\(function \(p, i\) \{[\s\S]{0,200}p\.editState[\s\S]{0,80}\.layers[\s\S]{0,120}_lbpC\[i\]/);
  });

  test('활성 장은 지금 보던 사진의 **id** 로 찾는다(인덱스 추측 금지)', () => {
    const blk = carouselBlock();
    expect(blk).toMatch(/_aIdxC\s*=\s*_epsC\.map\(function \(p\) \{ return p && p\.id; \}\)\.indexOf\(p0 && p0\.id\)/);
    expect(blk).toMatch(/if \(_aIdxC < 0\) _aIdxC = 0;/);
    // 활성 장의 레이어만 editState.layers 로 간다
    expect(blk).toMatch(/layers:\s*\(_lbpC\[_aIdxC\] \|\| \[\]\)/);
  });

  test('비율·채우기·보정 같은 전역 값은 **전 장을 담은 스냅샷**에서 가져온다', () => {
    const blk = carouselBlock();
    // 1장짜리 합성 스냅샷은 fitMode 'contain' · adj [] 라 그걸 기준 삼으면 되돌아간다.
    expect(blk).toMatch(/es\.photos\.length >= _epsC\.length/);
    expect(blk).toMatch(/_baseC\s*=\s*_fullC\s*\|\|/);
    expect(blk).toMatch(/Object\.assign\(\{\}, _baseC,/);
  });

  test('콜라주(여러 장을 한 장으로)는 건드리지 않는다', () => {
    const blk = carouselBlock();
    expect(blk).toMatch(/!\(_wsEd && _wsEd\.mode === 'collage'\)/);
    // 재편집(_restore)이고 여러 장일 때만
    expect(blk).toMatch(/_restore && _epsC\.length > 1/);
  });
});

describe('편집기 — 장별 레이어/활성 장 수신 (P2-1)', () => {
  test('open() 이 opts.layersByPhoto 를 S.layersByPhoto 로 받는다', () => {
    expect(ED_C).toMatch(/opts\.layersByPhoto/);
    expect(ED_C).toMatch(/S\.layersByPhoto\s*=\s*_lbpIn/);
  });

  test('복원(_restoreState) **뒤에** 적용한다 — 앞에 두면 옛 저장값에 먹힌다', () => {
    const rs = ED_C.indexOf('try { _restoreState(_ed); }');
    const lbp = ED_C.indexOf('opts.layersByPhoto');
    expect(rs).toBeGreaterThan(0);
    expect(lbp).toBeGreaterThan(rs);
  });

  test('활성 장 번호를 S.adjSel 과 실제 표시 사진에 모두 반영한다', () => {
    const i = ED_C.indexOf('opts.layersByPhoto');
    const blk = ED_C.slice(i, i + 900);
    expect(blk).toMatch(/S\.adjSel\s*=\s*_selIn/);
    expect(blk).toMatch(/S\.photoUrl\s*=\s*S\.photos\[_selIn\]/);
    // 범위 밖이면 0 으로 — 엉뚱한 장에 레이어가 붙지 않게
    expect(blk).toMatch(/if \(!\(_selIn >= 0 && _selIn < \(S\.photos \|\| \[\]\)\.length\)\) _selIn = 0;/);
  });

  test('빈 배열은 보관하지 않는다 — 빈 항목이 있으면 그 장을 지운 것으로 저장된다', () => {
    const i = ED_C.indexOf('opts.layersByPhoto');
    const blk = ED_C.slice(i, i + 900);
    expect(blk).toMatch(/if \(Array\.isArray\(ls\) && ls\.length\)/);
  });
});
