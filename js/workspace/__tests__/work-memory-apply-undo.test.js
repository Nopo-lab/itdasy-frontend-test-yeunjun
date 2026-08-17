'use strict';

/* T4 골든 — 자동 적용 배너/되돌리기의 operation identity 와 undo 경계 (2026-08-17).

   합의 조건: ① 5초는 실제 노출 시점 기준 ② _pushOp 한 덩어리 ③ _src='wm' 오염 없음
   ④ 사용자 후속 편집 보존(외과적 제거) ⑤ 중복 undo 불가 ⑥ 오래된 배너가 최신 적용을 못 되돌림.

   편집기(itd-editor)는 DOM 의존이라 node jest 로 실행 불가 → 엔진 태깅은 실동작 테스트,
   편집기/flow/css 는 소스 계약으로 잠그고, 실제 배너·undo 동작은 브라우저 QA 로 확인한다. */

const fs = require('fs');
const path = require('path');

function loadAll(flagOn) {
  global.window = {};
  global.window.ITDASY_WORK_MEMORY = flagOn !== false;
  global.location = { search: '' };
  global.localStorage = {
    _m: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._m, k) ? this._m[k] : null; },
    setItem(k, v) { this._m[k] = String(v); },
    removeItem(k) { delete this._m[k]; },
  };
  for (const f of ['work-memory.js', 'work-memory-engine.js']) {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
  }
  return { WM: global.window.WorkMemory, E: global.window.WorkMemoryEngine };
}
function seedOne(WM, emoji) {
  return WM.captureFromSlot({
    id: 's-' + emoji, service: '젤네일',
    photos: [{ editState: { v: 1, layoutIdx: 0, ratio: '4:5', layoutOrder: [], cellCrop: [], adj: [], photoDraw: {}, photoBg: {}, photos: ['x'],
      layers: [{ type: 'sticker', emoji: emoji || '✨', x: 0.2, y: 0.2, size: 0.1 }] } }],
  }, {});
}

describe('[③] 태깅 경계 — wm 레이어만, 오염 없음', () => {
  test('forEditor 산출 레이어 전부 _src=wm + 같은 토큰, _lastApply 기록', () => {
    const { WM, E } = loadAll();
    seedOne(WM);
    const st = E.forEditor({ restore: false, incoming: [], photoCount: 1, layersOnly: true });
    expect(st.layers.length).toBeGreaterThan(0);
    expect(st.layers.every((l) => l._src === 'wm')).toBe(true);
    const toks = new Set(st.layers.map((l) => l._wmTok));
    expect(toks.size).toBe(1);
    expect(E._lastApply.token).toBe([...toks][0]);
    expect(E._lastApply.count).toBe(st.layers.length);
  });
  test('base(우리샵/이번 글) 레이어는 병합 후에도 태그가 안 붙는다', () => {
    const { WM, E } = loadAll();
    seedOne(WM);
    const wm = E.forEditor({ restore: false, incoming: [], photoCount: 1, layersOnly: true });
    const base = { layoutIdx: 4, layers: [{ role: 'title', text: '이번 글' }, { type: 'line', x: 0.5, y: 0.5 }] };
    const merged = E.mergeEditState(base, wm);
    merged.layers.forEach((l) => {
      if (l._src === 'wm') expect(l._wmTok).toBeTruthy();       // 기억에서 온 것만 토큰
      else expect(l._wmTok).toBeUndefined();                     // base 오염 금지
    });
    expect(merged.layers.filter((l) => l._src !== 'wm')).toHaveLength(2);
  });
  test('저장 원천(_serLayer 화이트리스트)엔 _src 가 없다 — 태그가 기억·슬롯으로 역류 못 함', () => {
    const edSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'itd-editor', 'itd-editor.js'), 'utf8');
    const ser = edSrc.slice(edSrc.indexOf('function _serLayer'), edSrc.indexOf('function _collectPerPhoto'));
    expect(ser).not.toMatch(/_src|_wmTok/);
  });
});

describe('[⑥] 토큰 identity — 적용마다 새 토큰', () => {
  test('두 번 적용 → 서로 다른 토큰 (A 배너가 B 적용을 못 지목)', () => {
    const { WM, E } = loadAll();
    seedOne(WM);
    const a = E.forEditor({ restore: false, incoming: [], photoCount: 1, layersOnly: true });
    const tokA = E._lastApply.token;
    const b = E.forEditor({ restore: false, incoming: [], photoCount: 1, layersOnly: true });
    const tokB = E._lastApply.token;
    expect(tokA).not.toBe(tokB);
    expect(a.layers[0]._wmTok).toBe(tokA);
    expect(b.layers[0]._wmTok).toBe(tokB);
  });
  test('이번 오픈에 적용이 없으면 _lastApply 는 null 로 리셋(스테일 배너 방지)', () => {
    const { WM, E } = loadAll();
    seedOne(WM);
    E.forEditor({ restore: false, incoming: [], photoCount: 1, layersOnly: true });
    expect(E._lastApply).toBeTruthy();
    E.forEditor({ restore: true, incoming: [], photoCount: 1 });        // restore = 적용 안 함
    expect(E._lastApply).toBeNull();
  });
  test('헤드리스(decorateLayers)는 _lastApply 를 안 만든다(배너 주체는 편집기뿐)', () => {
    const { WM, E } = loadAll();
    seedOne(WM);
    E.decorateLayers([], { photoCount: 1 });
    expect(E._lastApply).toBeNull();
  });
});

describe('편집기 소스 계약 — op 한 덩어리·외과적 제거·5초 가드', () => {
  const edSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'itd-editor', 'itd-editor.js'), 'utf8');
  const flowSrc = fs.readFileSync(path.join(__dirname, '..', 'workspace-v2-flow.js'), 'utf8');
  const cssSrc = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'css', 'screens', 'sub-screens.css'), 'utf8');

  test('[②] 열릴 때 wm 레이어를 wmApply op **1개**로 push (레이어별 add 아님)', () => {
    expect(edSrc.match(/op:\s*'wmApply'/g)).toHaveLength(1);
    expect(edSrc).toMatch(/_wmLs\.length\)\s*_pushOp\(\{\s*op:\s*'wmApply',\s*Ls:\s*_wmLs\s*\}\)/);
  });
  test('[②] _applyInverse 가 wmApply/wmRemove 를 그룹으로 처리', () => {
    expect(edSrc).toMatch(/op\.op === 'wmApply' \|\| op\.op === 'wmRemove'/);
  });
  test('[④⑤⑥] undoWmApply — 토큰 필터 + 남은 대상 0 → 0 반환 + wmRemove op 로 push', () => {
    expect(edSrc).toMatch(/function undoWmApply\(token\)/);
    expect(edSrc).toMatch(/L\._wmTok === token/);
    expect(edSrc).toMatch(/if \(!Ls\.length\) return 0;/);
    expect(edSrc).toMatch(/op:\s*'wmRemove'/);
    expect(edSrc).toMatch(/undoWmApply:\s*undoWmApply/);          // export
  });
  test('[①] 배너 — 노출 시점 기준 5초 가드(타이머와 무관) + 닫힘 정리 2경로', () => {
    expect(flowSrc).toMatch(/Date\.now\(\) - shownAt > 5000/);
    expect(flowSrc).toMatch(/setTimeout\(_hideWmBanner, 5000\)/);
    // onDone/onCancel 양쪽에서 배너 정리 — 낡은 배너가 다음 세션에 남으면 ⑥ 위반
    expect(flowSrc.match(/_hideWmBanner\(\);/g).length).toBeGreaterThanOrEqual(3);
    expect(flowSrc).toMatch(/undoWmApply\(tok\)/);
  });
  test('배너는 wm 레이어가 실제 실렸을 때만 + 편집기(z 11200) 위에 뜬다', () => {
    expect(flowSrc).toMatch(/_finalEs\.layers\.some\(function \(l\) \{ return l && l\._src === 'wm'; \}\)/);
    expect(cssSrc).toMatch(/\.wm-cap--editor\s*\{\s*z-index:\s*11500/);
    expect(cssSrc).toMatch(/\.wm-cap__undo/);
  });
});
