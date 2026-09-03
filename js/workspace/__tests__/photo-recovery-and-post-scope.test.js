'use strict';

/* [2026-09-03 모바일 실사용 감사] 회귀 방지 3종.
 *
 * 왜 이 3개인가 — 셋 다 "테스트는 통과하는데 사용자는 막힌다"는 유형이라 유닛으로 못 잡던 것들이다.
 *   ① 레이아웃 화면에서 사진을 뺄 수단이 아예 없었다(썸네일이 data-* 없는 장식).
 *      파일을 고르면 업로드 화면을 건너뛰고 여기로 오므로, 잘못 고르면 복구 경로가 0이었다.
 *   ② 그 화면에서 뒤로가기 = 작업실 종료 + 사진 전량 폐기(확인창 없음).
 *   ③ 게시물별 비율(4:5/1:1)이 editState 에 저장되는데 **복원 코드가 그 필드를 안 읽어**
 *      마지막에 고른 전역값으로 되돌아왔다 = 게시물 간 스타일 오염.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const layoutSrc = fs.readFileSync(path.join(ROOT, 'js/workspace/flow/layout.js'), 'utf8');
const flowSrc = fs.readFileSync(path.join(ROOT, 'js/workspace/workspace-v2-flow.js'), 'utf8');
const editorSrc = fs.readFileSync(path.join(ROOT, 'js/itd-editor/itd-editor.js'), 'utf8');
const hyperCss = fs.readFileSync(path.join(ROOT, 'css/workspace-hyper.css'), 'utf8');
const editorCss = fs.readFileSync(path.join(ROOT, 'css/itd-editor.css'), 'utf8');

/* ─────────────────────────────────────────────────────────────
   ① 레이아웃 화면에서 사진 빼기·추가·다시 고르기 — 실동작 테스트
   layout.js 를 실제로 로드해 handleClick 을 태운다(문자열 검사 아님).
   ───────────────────────────────────────────────────────────── */
function loadLayout(state) {
  const w = {};
  global.window = w;
  w.WSFlowUtil = { esc: (x) => String(x == null ? '' : x), toast: () => {} };
  w.WorkspaceLayout = null;
  w.WSBlobUrl = null;
  // eslint-disable-next-line no-eval
  eval(layoutSrc);

  const screens = [];
  const ctx = {
    d: () => state.d,
    cur: () => state.cur,
    el: () => null,
    setScreen: (name) => { screens.push(name); state.cur = name; },
    editablePhotos: () => state.d.photos.filter((p) => p.selected !== false),
    photoUrl: (p) => (p ? (p.editedDataUrl || p.dataUrl) : ''),
    cleanBase: (p) => p && p.dataUrl,
    reassignRoles: () => { state.roleRuns = (state.roleRuns || 0) + 1; },
  };
  return { api: w.WSFlowLayout.create(ctx), screens };
}

// closest() 만 있으면 되는 최소 타깃 스텁 — jsdom 없이도 핸들러 계약을 그대로 태운다.
function target(attrs) {
  return {
    closest(sel) {
      const key = sel.replace(/^\[|\]$/g, '');
      return key in attrs ? { getAttribute: (n) => attrs[n] } : null;
    },
  };
}

function mkState() {
  return {
    cur: 'layout',
    d: {
      photos: [
        { id: 'p1', dataUrl: 'd1', selected: true, selSeq: 1 },
        { id: 'p2', dataUrl: 'd2', selected: true, selSeq: 2 },
        { id: 'p3', dataUrl: 'd3', selected: true, selSeq: 3 },
      ],
      templateOutputs: [{ pairId: 'x', outputUrl: 'stale' }],
      templateOutput: 'stale',
      wsCards: null,
    },
  };
}

describe('① 레이아웃 화면 — 잘못 고른 사진을 그 자리에서 복구할 수 있다', () => {
  test('썸네일에 빼기 버튼과 추가 타일이 실제로 렌더된다 (예전엔 장식뿐이었다)', () => {
    const st = mkState();
    const { api } = loadLayout(st);
    const html = api.renderLayout();
    expect(html).toContain('data-fl-lyrm="p1"');
    expect(html).toContain('data-fl-lyrm="p3"');
    expect(html).toContain('wsc-sph--add');     // 사진 추가 타일
    expect(html).toContain('data-fl-lyredit');  // 다시 고르기
  });

  test('사진 1장이어도 더하기·다시 고르기가 있다 (예전엔 "이전 화면에서" 안내뿐 = 갈 방법 없음)', () => {
    const st = mkState();
    st.d.photos = [st.d.photos[0]];
    const { api } = loadLayout(st);
    const html = api.renderLayout();
    expect(html).toContain('wsc-sph--add');
    expect(html).toContain('data-fl-lyredit');
  });

  test('빼기는 인덱스가 아니라 photo.id 로 지운다 — 선택 해제로 어긋나도 엉뚱한 사진이 안 지워진다', () => {
    const st = mkState();
    st.d.photos[0].selected = false;   // 스트립엔 p2,p3 만 보인다 → 스트립 index 0 = p2
    const { api } = loadLayout(st);
    api.handleClick(target({ 'data-fl-lyrm': 'p2' }), null);
    expect(st.d.photos.map((p) => p.id)).toEqual(['p1', 'p3']);
  });

  test('사진을 빼면 이미 구운 합성 결과물을 무효화한다 — 뺀 사진이 그대로 발행되지 않게', () => {
    const st = mkState();
    const { api } = loadLayout(st);
    api.handleClick(target({ 'data-fl-lyrm': 'p2' }), null);
    expect(st.d.templateOutputs).toEqual([]);
    expect(st.d.templateOutput).toBeNull();
  });

  test('되돌리기가 원래 자리에 복원한다 (맨 뒤에 붙지 않는다)', () => {
    const st = mkState();
    const { api } = loadLayout(st);
    api.handleClick(target({ 'data-fl-lyrm': 'p2' }), null);
    expect(st.d.photos.map((p) => p.id)).toEqual(['p1', 'p3']);
    api.handleClick(target({ 'data-fl-lyundo': '' }), null);
    expect(st.d.photos.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  test('마지막 1장은 뺄 수 없다 — 사진 0장 죽은 화면에 갇히지 않게', () => {
    const st = mkState();
    st.d.photos = [{ id: 'only', dataUrl: 'd', selected: true, selSeq: 1 }];
    const { api } = loadLayout(st);
    api.handleClick(target({ 'data-fl-lyrm': 'only' }), null);
    expect(st.d.photos).toHaveLength(1);
  });

  test('다시 고르기는 사진 고르기(upload) 화면으로 보낸다', () => {
    const st = mkState();
    const { api, screens } = loadLayout(st);
    api.handleClick(target({ 'data-fl-lyredit': '' }), null);
    expect(screens).toContain('upload');
  });

  test('빼기 버튼 터치 영역이 44px 이상이다 (아이콘은 22px 라도)', () => {
    // ::after 확장은 타일 **안쪽**으로만 — 위/오른쪽 대칭 확장은 .wsc-strip(overflow:auto)에 잘린다.
    const m = hyperCss.match(/\.wsc-sph__x::after \{[^}]*inset:\s*(-?\d+)px\s+(-?\d+)px\s+(-?\d+)px\s+(-?\d+)px/);
    expect(m).toBeTruthy();
    const [, top, right, bottom, left] = m.map(Number);
    expect(22 - top - bottom).toBeGreaterThanOrEqual(44);   // 세로
    expect(22 - left - right).toBeGreaterThanOrEqual(44);   // 가로
    expect(bottom).toBeLessThan(0);                          // 아래로(타일 안쪽) 확장
    expect(left).toBeLessThan(0);                            // 왼쪽으로(타일 안쪽) 확장
  });
});

/* ─────────────────────────────────────────────────────────────
   ② 뒤로가기가 사진을 통째로 버리지 않는다
   ───────────────────────────────────────────────────────────── */
describe('② 사진과 함께 레이아웃으로 직행해도 뒤로 갈 곳이 있다', () => {
  test('addFiles/addPhotoUrls 둘 다 navStack 을 시드한다 (한쪽만 고치면 채팅 경로가 그대로 터진다)', () => {
    const seeds = flowSrc.match(/if \(!navStack\.length\) _seedNavStack\('layout'\);/g) || [];
    expect(seeds.length).toBe(2);
  });

  test("직접 _pushHist 로 히스토리를 만들지 않는다 — 시트 레지스트리(#wsv2flow)와 어긋나 '먹통 뒤로가기'가 생겼다", () => {
    expect(flowSrc).not.toContain('function _backLayout');
  });

  test('_seedNavStack 은 앞 단계만 시드한다 = layout → upload → 닫힘', () => {
    // VISIBLE_SCREENS = upload, layout, caption, connect → indexOf('layout')=1 → ['upload'] 1개
    const steps = fs.readFileSync(path.join(ROOT, 'js/workspace/flow/steps.js'), 'utf8');
    const m = steps.match(/var visible = \[([^\]]+)\]/);
    const visible = m[1].split(',').map((s) => s.trim().replace(/'/g, ''));
    expect(visible.slice(0, visible.indexOf('layout'))).toEqual(['upload']);
  });
});

/* ─────────────────────────────────────────────────────────────
   ③ 게시물별 편집 스타일이 섞이지 않는다
   ───────────────────────────────────────────────────────────── */
describe('③ 게시물별 스타일 — 기존 게시물 스냅샷이 전역 기본값을 이긴다', () => {
  test('_exportState 가 저장하는 ratio 를 _restoreState 가 실제로 읽는다', () => {
    expect(editorSrc).toMatch(/ratio:\s*S\.ratio/);          // 저장
    // [2026-09-03] 복원은 하되 **검증을 거쳐서** 한다 — 손상된 비율이 그대로 들어오면 스테이지가 2px 로 뭉갰다.
    expect(editorSrc).toMatch(/if \(st\.ratio\) S\.ratio = _safeRatio\(st\.ratio\);/);
  });

  test('_exportState 가 저장하는 필드는 전부 _restoreState 에 대응이 있다 (새 필드 누락 감시)', () => {
    const exp = editorSrc.slice(editorSrc.indexOf('function _exportState'));
    const body = exp.slice(0, exp.indexOf('function _restoreState'));
    const saved = [...body.matchAll(/(\w+):\s*(?:S\.|\(S\.|Object\.assign\(\{\}, S\.)/g)].map((m) => m[1]);
    const restore = editorSrc.slice(editorSrc.indexOf('function _restoreState'), editorSrc.indexOf('function _stageWH'));
    // layers 는 스테이지 크기가 확정된 뒤라야 좌표를 풀 수 있어 _restoreState 가 아니라
    // _applyRestore → _restoreLayers(st.layers) 가 맡는다. 유일한 정당한 예외 — 그것도 검사한다.
    expect(editorSrc).toMatch(/_restoreLayers\(st\.layers\)/);
    const missing = saved.filter((k) => k !== 'v' && k !== 'layers' && !restore.includes('st.' + k));
    expect(missing).toEqual([]);
  });

  test('게시 크기(4:5/1:1)는 세션(게시물)별 — 전역 localStorage 만 보지 않는다', () => {
    expect(flowSrc).toMatch(/if \(d && d\._wsFmt\) return d\._wsFmt/);
    expect(flowSrc).toMatch(/_wsFmt: _slotFormat\(slot\)/);
  });

  test('_slotFormat 은 게시물 스냅샷(editState.ratio) → defaultRatio 순으로 읽고, 새 게시물엔 null(전역 기본)', () => {
    // 함수 본문을 그대로 떼어 실행 — 정책이 코드와 어긋나면 여기서 깨진다.
    const src = flowSrc.slice(flowSrc.indexOf('function _slotFormat'));
    const fn = src.slice(0, src.indexOf('\n  function _wsFormat'));
    // eslint-disable-next-line no-new-func
    const _slotFormat = new Function(fn + '; return _slotFormat;')();
    expect(_slotFormat(null)).toBeNull();                                            // 새 게시물
    expect(_slotFormat({ photos: [{ editState: { ratio: '1:1' } }] })).toBe('11');    // 스냅샷 우선
    expect(_slotFormat({ photos: [{ editState: { ratio: '4:5' } }], workspaceContext: { defaultRatio: '1:1' } })).toBe('45');
    expect(_slotFormat({ workspaceContext: { defaultRatio: '1:1' } })).toBe('11');    // 폴백
    expect(_slotFormat({ photos: [{}] })).toBeNull();                                 // 근거 없으면 전역 기본
  });

  test('_setWsFormat 은 현재 게시물과 전역 기본값을 둘 다 갱신한다 (기존 게시물엔 소급 적용 안 됨)', () => {
    const src = flowSrc.slice(flowSrc.indexOf('function _setWsFormat'));
    expect(src.slice(0, 400)).toMatch(/d\._wsFmt = f/);
    expect(src.slice(0, 400)).toMatch(/localStorage\.setItem\('itdasy:ws_format', f\)/);
  });
});

/* ─────────────────────────────────────────────────────────────
   ④ 아이폰 하단 — 홈 인디케이터/터치 타깃
   ───────────────────────────────────────────────────────────── */
describe('④ 편집기 하단 줄이 아이폰 홈 인디케이터를 피한다', () => {
  test('.itded__lyr 이 safe-area-inset-bottom 을 더한다 (실측: 예전엔 바닥에서 2px)', () => {
    const m = editorCss.match(/\.itded__lyr \{[^}]*\}/);
    expect(m).toBeTruthy();
    expect(m[0]).toContain('safe-area-inset-bottom');
  });

  test('.itlyr 버튼이 44×44 이상이다 (예전 38×34)', () => {
    const m = editorCss.match(/\.itlyr \{[^}]*\}/);
    expect(m[0]).toMatch(/width:\s*(\d+)px/);
    expect(Number(m[0].match(/width:\s*(\d+)px/)[1])).toBeGreaterThanOrEqual(44);
    expect(Number(m[0].match(/height:\s*(\d+)px/)[1])).toBeGreaterThanOrEqual(44);
  });
});
