/* [2026-09-11] TEXT EDITOR DESTRUCTION GATE 에서 잡은 결함들의 회귀 가드.
 *
 * 전부 **라이브 브라우저 실측**으로 발견했고, 숫자는 그때 잰 값이다.
 * 여기 있는 건 "다시 그렇게 되지 않는가" 만 본다 — 값이 맞는지는 실측이 판정한다.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const ed = fs.readFileSync(path.join(ROOT, 'itd-editor/itd-editor.js'), 'utf8');
/* 이름이 접두사인 다른 함수(addText vs addTextSticker)를 잡지 않게 여는 괄호까지 맞춘다 —
   실제로 addTextSticker 를 집어서 가드가 헛돌 뻔했다. */
/* 🔴 주석을 걷어내고 본다 — 이 파일의 설명 주석에 함수 이름이 그대로 적혀 있어서
   주석만 보고 통과하는 가드가 될 수 있다(photo-gate 에서 실제로 그랬다). */
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const fn = (name) => {
  const i = ed.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('함수를 못 찾았다: ' + name);
  const j = ed.indexOf('\n  function ', i + 10);
  return strip(ed.slice(i, j < 0 ? i + 4000 : j));
};

describe('🔴 글자가 화면 밖으로 나가 발행본에서 잘리던 것', () => {
  /* 실측(스테이지 656px): 21자 → 오른쪽 끝 1.056 / 36자 → 1.499 / 57자 → 1.824.
     `placeCenter(L,180,50)` 이 글자를 치기 전 180px 기준으로 좌표를 잡고, 줄바꿈도 클램프도 없었다. */
  test('새 글자도 복원 경로와 같은 줄바꿈 규칙을 쓴다 (pre 가 아니라 pre-wrap)', () => {
    const b = fn('addText');
    expect(b).toContain('white-space:pre-wrap');
    expect(b).toContain('word-break:keep-all');
    expect(b).toMatch(/max-width:'\s*\+\s*Math\.round\(_stR\.width \* 0\.88\)/);
    expect(b).not.toMatch(/white-space:pre'/);
  });
  test('상자를 스테이지 안에 유지하는 함수가 있다', () => {
    expect(ed).toMatch(/function _fitTextInStage\(L\)/);
    const b = fn('_fitTextInStage');
    expect(b).toMatch(/if \(!L\._moved\)/);              // 안 옮긴 글자는 가운데
    expect(b).toMatch(/Math\.max\(0, Math\.min\(R\.width - w/); // 옮긴 글자는 클램프
  });
  test('편집·폰트·스타일 변경 뒤에 자리를 다시 잡는다', () => {
    expect(fn('_bindTextGrow')).toContain('_fitTextInStage(L)');
    expect(fn('applyFont')).toContain('_fitTextInStage(L)');
    expect(fn('applyTStyle')).toContain('_fitTextInStage(L)');
  });
  test('드래그하면 자동 가운데를 멈춘다 (원장 배치 존중)', () => {
    expect(ed).toMatch(/drag\.L\._moved = true;/);
  });
});

describe('🔴 원장이 고른 스타일이 재편집에서 되돌아가던 것', () => {
  /* '기본'(그림자 없음)을 고르고 저장 → 다시 열면 'shadow'. `_own` 이 저장 안 돼서
     가독성 자동보정이 원장 선택을 덮었다. */
  test('_own(원장이 고른 축)을 저장한다', () => {
    expect(ed).toMatch(/base\.own = _ow;/);
  });
  test('복원이 _own 을 되살린다', () => {
    expect(ed).toMatch(/if \(spec\.own && spec\.own\.length\)/);
    expect(ed).toMatch(/L\._own\[spec\.own\[_oi\]\] = 1;/);
  });
  test('자동 보정은 _own 이 찍힌 축을 안 건드린다', () => {
    expect(ed).toMatch(/_ownTs = !!\(L\._own && L\._own\.tstyle\)/);
    expect(ed).toMatch(/if \(!_ownTs && _curTs !== 'bg'\)/);
  });
});

describe('🔴 재편집해서 글자를 늘리면 상자가 안 커지던 것', () => {
  /* 실측(스테이지 533px): 복원된 max-width 71px 에서 38자 → 16줄.
     같은 문장을 새 글자에 치면 469px 에서 2줄. */
  test('내용이 바뀌면 저장 당시 폭 제한을 푼다', () => {
    const b = fn('_bindTextGrow');
    expect(b).toMatch(/if \(!L\.wrapW\)/);                       // 가로 늘리기는 존중
    expect(b).toMatch(/Math\.round\(_R\.width \* 0\.88\)/);
  });
  test('⚠️ 글자 레이어를 만드는 모든 경로가 그 리스너를 붙인다', () => {
    // 한 곳에만 붙이면 나머지 경로에선 안 돈다 — 이 레포에서 반복된 실수
    ['editText', '_addShopLayerText', 'addTextSticker'].forEach((f) => {
      expect(fn(f)).toContain('_bindTextGrow(L)');
    });
  });
});

describe('🔴 발행본에서 한 단어가 갈라지던 것 (BEFOR / E)', () => {
  /* 라이브 실측: 자연 폭 102px, 복원된 max-width 102px — 1px 미만 차이로 접히고
     overflow-wrap:anywhere 가 단어 중간을 끊었다. BUG-07 가드는 spec.lines 가 있어야 도는데
     자동 초안 레이어엔 그 값이 없다. */
  test('공백 없는 한 덩어리가 접히면 자연 폭으로 넓힌다', () => {
    expect(ed).toMatch(/!\/\\s\/\.test\(String\(L\.text \|\| ''\)\)/);
    expect(ed).toMatch(/if \(_nat1 <= _cap1\) t\.style\.maxWidth = _nat1 \+ 'px';/);
  });
  test('그래도 스테이지보다 긴 단어는 상한이 있다', () => {
    expect(ed).toMatch(/_cap1 = Math\.floor\(R\.width \* 0\.98\)/);
  });
});

describe('저장→복원 드리프트', () => {
  test('max-width 의 +1 이 스테이지 폭을 못 넘는다 (왕복마다 누적됐다)', () => {
    expect(ed).toMatch(/Math\.min\(Math\.ceil\(spec\.w \* R\.width\) \+ 1, Math\.round\(R\.width\)\)/);
  });
  test('원장이 옮겼는지(moved)를 저장·복원한다', () => {
    expect(ed).toMatch(/base\.moved = !!L\._moved;/);
    expect(ed).toMatch(/L\._moved = \(spec\.moved != null\) \? !!spec\.moved : true;/);
  });
  test('글자 기울기를 복원한다 (텍스트 경로에만 빠져 있었다)', () => {
    expect(fn('_addShopLayerText')).toMatch(/L\.rot = spec\.rot \|\| 0;/);
  });
});
