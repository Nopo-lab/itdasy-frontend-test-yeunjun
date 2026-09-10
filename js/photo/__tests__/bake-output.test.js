/* 🔴 **굽는 코드를 실제로 돌려서** 검증한다 — 소스 grep 이 아니다. [출고 감사 2026-08-23]
 *
 * 이번에 물린 버그가 정확히 이 종류였다:
 *   편집기 DOM 은 CSS 로 외곽선을 그리고, 발행본은 canvas 로 **다시** 그린다.
 *   canvas 쪽에 `strokeText` 가 없어서 **발행본에서만** 외곽선이 사라졌다.
 *   DOM 스냅샷 테스트는 전부 통과했다. 소스에 문자열이 있는지 보는 것도 부족하다 —
 *   순서가 틀리거나 조건이 틀리면 여전히 잘못 그린다.
 *
 * 그래서 **실제 굽기 블록을 파일에서 떼어내** 호출을 기록하는 가짜 2D context 로 돌린다.
 * node-canvas 를 새로 깔지 않는다(출고 직전에 네이티브 의존성을 늘리지 않는다).
 * 복붙 사본을 쓰지도 않는다 — 사본은 진짜와 갈라져도 초록불이 뜬다.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const ed = fs.readFileSync(path.join(ROOT, 'js/itd-editor/itd-editor.js'), 'utf8');

/* 실제 파일에서 텍스트 굽기 블록만 떼어낸다. 구조가 바뀌면 못 찾고 테스트가 실패한다
   — 그게 맞다(누가 이 경로를 손대면 여기를 다시 보게 된다). */
function extractBakeBlock() {
  const start = ed.indexOf('          var lines = _textLines(L); var fs = L.fontSize * L.scale;');
  if (start < 0) throw new Error('굽기 블록을 못 찾았다 — exportComposite 구조가 바뀌었나?');
  /* ⚠️ 끝 표시를 `c.shadowBlur = 0;` 로 잡으면 **if(L.stroke) 안쪽 첫 줄**에 걸려
     블록이 중간에서 잘린다(처음에 그렇게 짜서 SyntaxError 가 났다).
     fill 루프 **뒤에** 오는 것을 찾아야 한다. */
  const fillLoop = ed.indexOf('lines.forEach(function (ln, i) { c.fillText(', start);
  if (fillLoop < 0) throw new Error('fill 루프를 못 찾았다');
  const endMark = ed.indexOf('c.shadowBlur = 0;', fillLoop);
  if (endMark < 0) throw new Error('굽기 블록 끝을 못 찾았다');
  return ed.slice(start, endMark + 'c.shadowBlur = 0;'.length);
}

// 호출을 순서대로 기록하는 가짜 context
function recordingCtx() {
  const calls = [];
  const state = {};
  const ctx = {
    get shadowBlur() { return state.shadowBlur; },
    set shadowBlur(v) { state.shadowBlur = v; calls.push(['shadowBlur', v]); },
    get lineWidth() { return state.lineWidth; },
    set lineWidth(v) { state.lineWidth = v; calls.push(['lineWidth', v]); },
    get strokeStyle() { return state.strokeStyle; },
    set strokeStyle(v) { state.strokeStyle = v; calls.push(['strokeStyle', v]); },
    set font(v) { state.font = v; }, get font() { return state.font; },
    set fillStyle(v) { state.fillStyle = v; }, get fillStyle() { return state.fillStyle; },
    set textAlign(v) { state.textAlign = v; }, get textAlign() { return state.textAlign; },
    set textBaseline(v) { state.textBaseline = v; },
    set shadowColor(v) { state.shadowColor = v; calls.push(['shadowColor', v]); },
    set lineJoin(v) { state.lineJoin = v; }, set miterLimit(v) { state.miterLimit = v; },
    save() { calls.push(['save']); }, restore() { calls.push(['restore']); },
    strokeText(t, x, y) { calls.push(['strokeText', t, x, Math.round(y), state.shadowBlur, state.lineWidth, state.strokeStyle]); },
    fillText(t, x, y) { calls.push(['fillText', t, x, Math.round(y), state.shadowBlur, state.fillStyle]); }
  };
  return { ctx, calls, state };
}

/* [2026-09-11] 굽기 블록이 쓰는 헬퍼도 **진짜 소스에서 떼어낸다**.
   여기에 사본을 두면 진짜와 갈라져도 초록불이 뜬다 — 이 파일이 처음부터 경계하던 그 함정이다. */
function extractHelpers() {
  const names = ['var TSTYLES = [', 'var TS = {', 'function _tstyleOf(L) {', 'function _inkOn(col) {'];
  return names.map((mark) => {
    const i = ed.indexOf(mark);
    if (i < 0) throw new Error('헬퍼를 못 찾았다: ' + mark + ' — itd-editor 구조가 바뀌었나?');
    // 중괄호/대괄호 균형으로 선언 하나를 통째로 집는다
    const open = mark.includes('[') && !mark.includes('{') ? '[' : '{';
    const close = open === '[' ? ']' : '}';
    let j = ed.indexOf(open, i), d = 0;
    for (; j < ed.length; j++) {
      if (ed[j] === open) d++;
      else if (ed[j] === close) { d--; if (d === 0) break; }
    }
    const end = ed.indexOf('\n', j);
    return ed.slice(i, end);
  }).join('\n');
}

/* 굽기가 쓰는 상수(TS)를 소스에서 그대로 읽는다 — 숫자를 여기 적어두면 값을 조정할 때
   테스트만 빨개지고, 정작 **DOM 과 canvas 가 갈라진 것**은 못 잡는다. 계약은 '둘이 같다' 이다. */
function styleConsts() {
  return new Function(extractHelpers() + '\n return { TS: TS, TSTYLES: TSTYLES, _tstyleOf: _tstyleOf, _inkOn: _inkOn };')();
}

function bake(layer, opts) {
  const { ctx, calls, state } = recordingCtx();
  const L = Object.assign({
    text: '속눈썹 연장', fontSize: 40, scale: 1, color: '#FFFFFF', align: 'center',
    font: { weight: 800, family: 'Pretendard, sans-serif' }, stroke: false, shadow: false
  }, layer);
  const fn = new Function('c', 'L', 'ow', 'oh', '_textLines', 'Math',
    extractHelpers() + '\n' + extractBakeBlock() + '\n return true;');
  fn(ctx, L, (opts && opts.ow) || 200, (opts && opts.oh) || 60, (l) => (l.text || '').split('\n'), Math);
  return { calls, state,
    strokes: calls.filter((x) => x[0] === 'strokeText'),
    fills: calls.filter((x) => x[0] === 'fillText') };
}

describe('[굽기 실행] 외곽선이 실제로 그려진다', () => {
  test('🔑 L.stroke=true 면 strokeText 가 실제로 호출된다', () => {
    const r = bake({ stroke: true });
    expect(r.strokes.length).toBe(1);
    expect(r.fills.length).toBe(1);
  });

  test('🔑 L.stroke=false 면 strokeText 가 호출되지 않는다 (과잉 그리기 없음)', () => {
    const r = bake({ stroke: false });
    expect(r.strokes.length).toBe(0);
    expect(r.fills.length).toBe(1);
  });

  test('외곽선을 fill **보다 먼저** 그린다 (안쪽 절반을 글자가 덮어야 화면과 비슷)', () => {
    const r = bake({ stroke: true });
    const iS = r.calls.findIndex((x) => x[0] === 'strokeText');
    const iF = r.calls.findIndex((x) => x[0] === 'fillText');
    expect(iS).toBeGreaterThanOrEqual(0);
    expect(iF).toBeGreaterThan(iS);
  });

  test('외곽선에는 그림자를 안 씌운다 — 씌우면 화면보다 훨씬 두꺼워 보인다', () => {
    const r = bake({ stroke: true });
    expect(r.strokes[0][4]).toBe(0);          // strokeText 시점의 shadowBlur
  });

  /* [2026-09-11] 값을 리터럴로 박지 않는다 — 굽기와 화면이 **같은 상수(TS)** 를 읽는지가 계약이다.
     예전엔 화면이 CSS 로 `0 1px 12px rgba(0,0,0,.4)`, 굽기가 `blur 8 / rgba(0,0,0,.35)` 를 써서
     둘이 조용히 갈라져 있었다(둘 다 '그림자가 있다' 는 통과했다). */
  test('fill 그림자가 화면과 같은 값이다', () => {
    const { TS } = styleConsts();
    expect(bake({ stroke: true }).fills[0][4]).toBe(TS.shadowBlur);
    expect(bake({ shadow: true }).fills[0][4]).toBe(TS.shadowBlur);
    // 화면 CSS 문자열에도 같은 blur 가 들어 있어야 한다
    expect(TS.shadowCss).toContain(TS.shadowBlur + 'px');
  });

  test('외곽선 색이 화면과 같은 값이다', () => {
    const { TS } = styleConsts();
    expect(bake({ stroke: true }).strokes[0][6]).toBe(TS.strokeRgba);
    expect(TS.strokeCss).toContain(TS.strokeRgba);
  });

  test('두께가 확대에 비례한다 (webkit 은 획 중앙 기준이라 2배)', () => {
    const { TS } = styleConsts();
    expect(TS.strokeW).toBe(2);
    expect(bake({ stroke: true, scale: 1 }).strokes[0][5]).toBe(2);
    expect(bake({ stroke: true, scale: 2 }).strokes[0][5]).toBe(4);
    expect(bake({ stroke: true, scale: 0.2 }).strokes[0][5]).toBe(1);   // 최소 1
  });

  test('외곽선을 그린 뒤 fill 설정을 되돌린다 (색이 검정으로 새면 안 된다)', () => {
    const r = bake({ stroke: true, color: '#15181D' });
    expect(r.fills[0][5]).toBe('#15181D');
  });

  test('여러 줄이면 줄마다 외곽선도 그린다', () => {
    const r = bake({ stroke: true, text: '속눈썹\n연장' });
    expect(r.strokes.length).toBe(2);
    expect(r.fills.length).toBe(2);
  });

  test('정렬이 굽기에 반영된다 (좌/우 정렬이 중앙으로 어긋나던 버그 회귀)', () => {
    expect(bake({ align: 'left' }).state.textAlign).toBe('left');
    expect(bake({ align: 'right' }).state.textAlign).toBe('right');
  });

  test('폰트·크기가 굽기에 반영된다', () => {
    const r = bake({ fontSize: 30, scale: 2, font: { weight: 400, family: "'Jua', sans-serif" } });
    expect(r.state.font).toBe("400 60px 'Jua', sans-serif");
  });
});

describe('[굽기 실행] 🔑 AUTO ON 과 OFF 의 산출물이 실제로 다르다', () => {
  /* 이번 버그의 증상이 정확히 "ON/OFF 결과가 바이트까지 동일" 이었다.
     가독성 보정이 켜져서 L.stroke 가 붙으면 **그리는 호출 자체가 달라져야** 한다. */
  test('가독성 보정 전후로 draw 호출 시퀀스가 달라진다', () => {
    const off = bake({ stroke: false }).calls.map((c) => c[0]).join(',');
    const on = bake({ stroke: true }).calls.map((c) => c[0]).join(',');
    expect(on).not.toBe(off);
    expect(on).toMatch(/strokeText/);
    expect(off).not.toMatch(/strokeText/);
  });
});
