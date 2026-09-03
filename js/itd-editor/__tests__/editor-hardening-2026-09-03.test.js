'use strict';

/* [2026-09-03] 사진 편집기 하드닝 회귀 — 브라우저 실측으로 잡은 것들만 남긴다.
 * 각 테스트는 "무엇이 어떻게 틀렸었는지"를 재현 조건과 함께 고정한다.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const editorSrc = fs.readFileSync(path.join(ROOT, 'js/itd-editor/itd-editor.js'), 'utf8');
const flowSrc = fs.readFileSync(path.join(ROOT, 'js/workspace/workspace-v2-flow.js'), 'utf8');
const utilsSrc = fs.readFileSync(path.join(ROOT, 'app-gallery-utils.js'), 'utf8');
const editorCss = fs.readFileSync(path.join(ROOT, 'css/itd-editor.css'), 'utf8');

/** 소스에서 함수 하나를 떼어 실행 가능한 형태로 뽑는다(중괄호 균형으로 끝을 찾는다). */
function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('함수를 못 찾음: ' + name);
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) break; }
  }
  // eslint-disable-next-line no-new-func
  return new Function(src.slice(start, i + 1) + '; return ' + name + ';')();
}

describe('① 되돌리기/다시실행이 반대로 동작하던 것 (P1)', () => {
  // 실측: 텍스트 3개 추가 → ↩×3(스택 소진)해도 3개 그대로, ↪ 1회에 2개로 줄었다.
  const invert = (opop, undo) => (opop === 'add') !== undo;   // 현재 코드와 같은 식

  test('undo 한 add 는 제거, redo 한 add 는 추가', () => {
    expect(invert('add', true)).toBe(false);    // false = 제거 분기
    expect(invert('add', false)).toBe(true);    // true  = 추가 분기
  });
  test('undo 한 del 은 복원, redo 한 del 은 제거', () => {
    expect(invert('del', true)).toBe(true);
    expect(invert('del', false)).toBe(false);
  });
  test('소스가 === 가 아니라 !== 를 쓴다 (부호 되돌아가면 실패)', () => {
    expect(editorSrc).toContain("var add = (op.op === 'add') !== undo;");
    expect(editorSrc).not.toContain("var add = (op.op === 'add') === undo;");
  });
});

describe('② 새 편집 세션에서 ↩/↪ 가 켜진 채 남던 것 (P2)', () => {
  test('open() 이 _syncHist() 를 부른다', () => {
    const open = editorSrc.slice(editorSrc.indexOf('  function open(opts)'));
    const body = open.slice(0, open.indexOf('\n  function _applyRestore'));
    expect(body).toContain('_syncHist();');
  });
});

describe('③ 비율 검증 — 손상된 editState 가 화면을 뭉개던 것 (P2)', () => {
  const _safeRatio = extractFn(editorSrc, '_safeRatio');

  test.each([
    ['1:1', '1:1'], ['4:5', '4:5'], ['9:16', '9:16'], ['16:9', '16:9'], ['3:4', '3:4'],
  ])('정상 비율 %s 는 그대로', (input, want) => expect(_safeRatio(input)).toBe(want));

  test.each([
    ['999:0'], ['0:0'], [''], ['abc'], [null], [undefined], ['100:1'], ['1:100'], ['-4:5'], ['4:0'],
  ])('못 믿을 값 %p 은 기본값 4:5', (input) => expect(_safeRatio(input)).toBe('4:5'));

  test('실측 사고값 999:0 은 스테이지를 375x2 로 만들었다 — 이제 4:5', () => {
    // 예전 식: `+rp[1] || 5` → '999:0' 이 999:5(=200:1) 로 통과 → height 2px
    expect(_safeRatio('999:0')).toBe('4:5');
  });

  test('복원·open·fitStage 세 곳 모두 정규화를 거친다', () => {
    expect(editorSrc).toContain('if (st.ratio) S.ratio = _safeRatio(st.ratio);');
    expect(editorSrc).toContain("ratio: _safeRatio(opts.ratio)");
    expect(editorSrc).toContain('if (S) S.ratio = _safeRatio(S.ratio);');
  });
});

describe('④ 저장→복원 왕복 무손실 (P1/P3)', () => {
  test('텍스트 폭을 반올림이 아니라 올림+1 로 복원한다 (한 줄이 두 줄로 접히던 것)', () => {
    expect(editorSrc).toContain("css += ';max-width:' + (Math.ceil(spec.w * R.width) + 1) + 'px'");
    expect(editorSrc).not.toContain("';max-width:' + Math.round(spec.w * R.width)");
  });
  test('실측 수치로 재현 — 145.469px 를 반올림하면 부족, 올림+1 이면 충분', () => {
    const need = 0.3879166666666667 * 375;   // 실제 렌더 폭
    expect(Math.round(need)).toBeLessThan(need);          // 예전: 145 < 145.469 → 줄바꿈
    expect(Math.ceil(need) + 1).toBeGreaterThan(need);    // 지금: 147 > 145.469 → 유지
  });
  test('wrapW(가로 늘리기)를 저장·복원한다', () => {
    expect(editorSrc).toContain('if (L.wrapW) base.wrapW = L.wrapW / R.width;');
    expect(editorSrc).toContain('if (spec.wrapW != null)');
  });
  test('굵기(weight)를 폰트 기본값으로 덮지 않는다', () => {
    expect(editorSrc).toContain('base.weight = L.weight || (L.font && L.font.weight)');
    expect(editorSrc).toContain('L.weight = spec.weight || L.font.weight;');
  });
  test('텍스트 중심을 offset* 가 아니라 실측 박스로 잡는다 (회당 0.22px 드리프트)', () => {
    expect(editorSrc).toContain('var _bb = L.el.getBoundingClientRect();');
  });
  test('스티커는 변형 없는 레이아웃 박스로 중심을 잡는다 (`-32` 고정값 제거)', () => {
    expect(editorSrc).toContain("L.el.style.transform = 'none';");
    expect(editorSrc).not.toContain("* R.width - 32;");
  });
});

describe('⑤ 손상된 레이어 spec 이 유령 레이어가 되던 것 (P3)', () => {
  test('객체가 아닌 spec 은 버린다', () => {
    expect(editorSrc).toContain("if (!spec || typeof spec !== 'object') return null;");
  });
});

describe('⑥ 편집기 닫힘 popstate 경합 — 작업실 단계가 한 칸 밀리던 것 (P1 회귀)', () => {
  test('불리언+0ms 타이머가 아니라 개수를 세고 소비하는 쪽이 깎는다', () => {
    expect(editorSrc).toContain('function _swallowNextPop()');
    expect(editorSrc).not.toContain('window.__seSwallowPop = true;');
    expect(flowSrc).toContain('if (+window.__seSwallowPop > 0) { window.__seSwallowPop = Math.max(0, (+window.__seSwallowPop) - 1); return false; }');
  });
  test('편집기 열림 중(__seOpen)에는 그대로 무시한다', () => {
    expect(flowSrc).toContain('if (window.__seOpen) return false;');
  });
});

describe('⑦ 도구 패널이 레이어 순서 줄을 덮어 "보이는데 안 눌리던" 것 (P1)', () => {
  test('패널이 열리면 root 에 itded--panel 이 붙고 닫히면 빠진다', () => {
    expect(editorSrc).toContain("root.classList.toggle('itded--panel', !!tool);");
    expect(editorSrc).toContain("root.classList.remove('itded--panel');");
  });
  test('CSS 가 그때 줄을 감춘다', () => {
    expect(editorCss).toMatch(/\.itded\.itded--panel \.itded__lyr \{\s*display:\s*none/);
  });
});

describe('⑧ 모바일 터치 타깃 — 아이콘이 아니라 히트박스 기준', () => {
  test('상단 아이콘 38px + ::after 확장 = 44px 이상', () => {
    expect(editorCss).toMatch(/\.itded__ic::after\{content:"";position:absolute;inset:-3px\}/);
    expect(38 + 3 * 2).toBeGreaterThanOrEqual(44);
    expect(editorCss).toMatch(/\.itded__hist \.itded__ic::after\{inset:-4px\}/);
    expect(36 + 4 * 2).toBeGreaterThanOrEqual(44);
  });
  test('완료 버튼 높이 38px + 상하 3px = 44px', () => {
    expect(editorCss).toMatch(/\.itded__done::after\{content:"";position:absolute;inset:-3px 0\}/);
    expect(38 + 3 * 2).toBeGreaterThanOrEqual(44);
  });
  test('색 스와치 확장폭이 스와치 간격(13px)의 절반을 넘지 않는다 — 옆 색 오탭 방지', () => {
    const m = editorCss.match(/\.itsw::after,\.itscw::after,\.itdsw::after,\.itlaybg::after\{content:"";position:absolute;inset:(-?\d+)px\}/);
    expect(m).toBeTruthy();
    expect(Math.abs(Number(m[1]))).toBeLessThanOrEqual(13 / 2 + 0.5);
  });
  test('레이어 순서 버튼은 44x44 이고 safe-area 를 더한다', () => {
    const lyr = editorCss.match(/\.itlyr \{[^}]*\}/)[0];
    expect(Number(lyr.match(/width:\s*(\d+)px/)[1])).toBeGreaterThanOrEqual(44);
    expect(Number(lyr.match(/height:\s*(\d+)px/)[1])).toBeGreaterThanOrEqual(44);
    expect(editorCss.match(/\.itded__lyr \{[^}]*\}/)[0]).toContain('safe-area-inset-bottom');
  });
});

describe('⑨ 큰 사진 축소가 가로 폭만 보던 것 (P2)', () => {
  test('긴 변 기준으로 축소한다', () => {
    expect(utilsSrc).toContain('const longSide = Math.max(img.width, img.height);');
    expect(utilsSrc).toContain('const scale = Math.min(1, maxWidth / longSide);');
    expect(utilsSrc).not.toContain('const scale = Math.min(1, maxWidth / img.width);');
  });
  test('바이트 크기만 보고 원본을 통과시키던 빠른 경로를 제거했다', () => {
    expect(utilsSrc).not.toContain('if (file.size < 2 * 1024 * 1024) return file;');
    expect(utilsSrc).toContain('if (longSide <= maxWidth && file.size < 2 * 1024 * 1024) return finish(file);');
  });
  test.each([
    [1200, 9000, 1920], [9000, 1200, 1920], [4000, 6000, 1920], [800, 1000, 1000],
  ])('%ix%i → 긴 변 %i 이하', (w, h, want) => {
    const scale = Math.min(1, 1920 / Math.max(w, h));
    expect(Math.round(Math.max(w, h) * scale)).toBe(want);
  });
});

describe('⑩ 디코드 안 되는 사진이 "추가됨" 으로 통과하던 것 (P2)', () => {
  test('dataURL 이 나왔다고 통과시키지 않고 실제로 그려본다', () => {
    expect(flowSrc).toContain('im.naturalWidth > 0 && im.naturalHeight > 0 ? u : null');
  });
  test('디코드가 안 끝나도 진행하는 타임아웃이 있다 (무한 행 방지)', () => {
    expect(flowSrc).toMatch(/setTimeout\(function \(\) \{ res\(null\); \}, 8000\)/);
  });
  test('무엇을 하면 되는지까지 알려준다', () => {
    expect(flowSrc).toContain('높은 호환성');
  });
});

describe('⑪ objectURL 회수 누락', () => {
  test('템플릿 편집 시트의 사진 선택이 blob 을 회수한다', () => {
    const src = fs.readFileSync(path.join(ROOT, 'app-photo-editor-template-edit-sheet.js'), 'utf8');
    const bind = src.slice(src.indexOf('function _bindImgSlot'));
    const body = bind.slice(0, bind.indexOf('function _setBefore'));
    expect(body).toContain('URL.revokeObjectURL(_u)');
    expect(body).toContain("e.target.value = ''");   // 같은 파일 재선택 가능
  });
  test('월간 리포트 저장이 blob 을 회수한다', () => {
    const src = fs.readFileSync(path.join(ROOT, 'app-growth-story.js'), 'utf8');
    expect(src).toContain('URL.revokeObjectURL(url)');
  });
});
