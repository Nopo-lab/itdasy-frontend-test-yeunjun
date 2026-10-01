/* 🔴 [2026-10-01 flow-workspace-photo-01] 저장한 전·후 합성 글을 홈에서 다시 열면 레이아웃 구성이 'flat' 으로
 *   초기화되고, '이대로 게시글 쓰기' 한 번에 전·후 합성본이 조용히 사라졌다.
 *
 * 실측(scn-e-resume, 로컬 스택): 저장본 templateOutputs [wsl-ba-lr(wsc-4), null(wsc-5)]
 *   → open({startScreen:'layout'}) → 화면 구성 ["flat*", …] · "이대로 3장이 올라가요"
 *   → CTA → 저장 후 templateOutputs [null, null, null] (합성본 소실, photos[0].editedDataUrl 엔 합성본이 들어감)
 *
 * 원인: buildSlot 은 templateOutputs 만 저장하고 wsComp/wsCards(구성·카드)는 메모리에만 있었다.
 *   _ensureCards 는 wsComp 가 없으면 무조건 'flat' 으로 재전개하고, composeCards 는 매번 전부 새로 구워 덮어썼다.
 *
 * 수정: ① buildSlot 이 workspaceContext.layoutComp/layoutCards/photoFit 을 저장하고 open() 이 복원
 *       ② 저장본에 없어도 _ensureCards 가 templateOutputs 로 구성·카드를 역산('flat' 폴백은 최후)
 *       ③ composeCards 는 안 바뀐 카드(특히 storyEdited)를 다시 굽지 않는다
 *       ④ 홈 KEY2SCREEN 에 crop 을 명시 — 편집기 강제 진입 없이 레이아웃/캡션으로
 *
 * layout.js 와 layout-model.js(실제 프리셋)를 로드해 **실제로 돌린다**(문자열 검사 아님).
 * ITDASY_SRC_ROOT 로 소스 루트를 바꿔 수정 전 코드에 대해 실패를 확인했다(보고서 참조).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.ITDASY_SRC_ROOT || path.join(__dirname, '..');
const layoutSrc = fs.readFileSync(path.join(ROOT, 'js/workspace/flow/layout.js'), 'utf8');
const modelSrc = fs.readFileSync(path.join(ROOT, 'js/workspace/layout/layout-model.js'), 'utf8');
const flowSrc = fs.readFileSync(path.join(ROOT, 'js/workspace/workspace-v2-flow.js'), 'utf8');
const homeSrc = fs.readFileSync(path.join(ROOT, 'js/workspace/workspace-v2-home.js'), 'utf8');

function loadLayout(state, bakeLog) {
  const w = {};
  global.window = w;
  w.WSFlowUtil = { esc: (x) => String(x == null ? '' : x), toast: () => {} };
  w.WSBlobUrl = null;
  // eslint-disable-next-line no-eval
  eval(modelSrc);   // 실제 프리셋(getById 클론·autoAssign)
  // composeLayout 만 가짜(캔버스 없음) — 어떤 카드를 어떤 focal 로 구웠는지 기록
  w.WorkspaceLayout.composeLayout = (layout, photos, assign) => {
    const key = layout.id + ':' + photos.map((p) => p.id).join('+') + ':' + (layout.photoSlots || []).map((s) => s.focal.x.toFixed(2) + ',' + (s.zoom || 1)).join('/');
    bakeLog.push(key);
    return Promise.resolve('baked:' + key);
  };
  // eslint-disable-next-line no-eval
  eval(layoutSrc);
  const ctx = {
    d: () => state.d, cur: () => state.cur, el: () => null,
    setScreen: (name) => { state.cur = name; },
    editablePhotos: () => state.d.photos.filter((p) => p.selected !== false),
    photoUrl: (p) => (p ? (p.editedDataUrl || p.dataUrl) : ''),
    cleanBase: (p) => p && p.dataUrl,
    reassignRoles: () => {},
  };
  return w.WSFlowLayout.create(ctx);
}
const PHOTOS = () => [
  { id: 'pb', dataUrl: 'd-b', role: 'before', selected: true, selSeq: 1 },
  { id: 'pa', dataUrl: 'd-a', role: 'after', selected: true, selSeq: 2 },
  { id: 'ph', dataUrl: 'd-h', role: 'hero', selected: true, selSeq: 3 },
];
// 저장본 그대로(옛 저장본 = wsComp 없음)
const SAVED_OUTS = () => [
  { pairId: 'wsc-4', templateId: 'wsl-ba-lr', beforePhotoId: 'pb', afterPhotoId: 'pa', outputUrl: 'saved-ba', ratio: '1:1', pairLabel: '1번째', photoIds: ['pb', 'pa'] },
  { pairId: 'wsc-5', templateId: null, beforePhotoId: null, afterPhotoId: null, outputUrl: 'd-h', pairLabel: '2번째', photoIds: ['ph'] },
];
const compOn = (html) => ((html.match(/data-fl-comp="([^"]+)"[^>]*aria-pressed="true"/) || [])[1]);
const frames = (html) => (html.match(/class="wsc-frame"/g) || []).length;

describe('② 옛 저장본(wsComp 없음)도 templateOutputs 로 구성을 역산한다 — flat 폴백 금지', () => {
  test('🔴 전·후 합성본 저장본을 열면 레이아웃 화면이 "전·후 합치기" 로, 카드 2장으로 그려진다', () => {
    const st = { cur: 'layout', d: { photos: PHOTOS(), templateOutputs: SAVED_OUTS(), templateOutput: 'saved-ba' } };
    const api = loadLayout(st, []);
    const html = api.renderLayout();
    expect(compOn(html)).toBe('ba');
    expect(frames(html)).toBe(2);
    expect(html).toContain('이대로 <b>2장</b>이 올라가요');
    expect(st.d.wsComp).toBe('ba');
    expect(st.d.wsCards.map((c) => c.id)).toEqual(['wsc-4', 'wsc-5']);   // 카드 id = 결과물 pairId (짝이 맞는다)
  });

  test('🔴 그 상태에서 composeCards(CTA) 를 눌러도 합성본이 유지된다 — 다시 굽지도, flat 으로 덮지도 않는다', async () => {
    const st = { cur: 'layout', d: { photos: PHOTOS(), templateOutputs: SAVED_OUTS(), templateOutput: 'saved-ba' } };
    const log = [];
    const api = loadLayout(st, log);
    const outs = await api.composeCards();
    expect(outs.map((o) => o.templateId)).toEqual(['wsl-ba-lr', null]);
    expect(outs[0].outputUrl).toBe('saved-ba');
    expect(log).toEqual([]);   // 같은 카드 — 굽지 않았다
    expect(st.d.templateOutput).toBe('saved-ba');
  });

  test('표지+모아보기 저장본(첫 카드 그대로 + 뒤 콜라주) → cover', () => {
    const d = { photos: PHOTOS().concat([{ id: 'p4', dataUrl: 'd-4', role: 'hero', selected: true, selSeq: 4 }]),
      templateOutputs: [{ pairId: 'wsc-1', templateId: null, outputUrl: 'd-b', photoIds: ['pb'] }, { pairId: 'wsc-2', templateId: 'wsl-strip-3', outputUrl: 'x', photoIds: ['pa', 'ph', 'p4'] }] };
    const api = loadLayout({ cur: 'layout', d }, []);
    expect(compOn(api.renderLayout())).toBe('cover');
    expect(api.inferComp([{ templateId: 'wsl-collage-2-tb' }], 2)).toBe('merge-tb');
    expect(api.inferComp([{ templateId: 'wsl-cover-1l2' }], 3)).toBe('grid2');
    expect(api.inferComp([{ templateId: null }, { templateId: null }], 2)).toBe('flat');
  });

  test('사진이 바뀌어 역산이 안 맞으면(저장본 사진 id 가 없음) 조용히 flat 으로 재전개 — 예외 없음', () => {
    const d = { photos: PHOTOS(), templateOutputs: [{ pairId: 'wsc-9', templateId: 'wsl-ba-lr', outputUrl: 'x', photoIds: ['gone1', 'gone2'] }] };
    const api = loadLayout({ cur: 'layout', d }, []);
    expect(compOn(api.renderLayout())).toBe('flat');
    expect(d.wsCards.length).toBe(3);
  });
});

describe('① 저장 모델에 구성이 들어간다 — layoutCards 복원 시 슬롯 focal/zoom 까지', () => {
  test('cardsForSave 가 구성·카드·슬롯(focal/zoom) 을 내놓고, 그걸로 다시 열면 같은 카드·같은 focal 로 복원된다', () => {
    const st1 = { cur: 'layout', d: { photos: PHOTOS(), templateOutputs: [], wsComp: 'ba' } };
    const api1 = loadLayout(st1, []);
    api1.renderLayout();   // 레이아웃 화면 진입 = 카드 전개(ba)
    const card = st1.d.wsCards[0];
    card.layout.photoSlots[0].focal = { x: 0.2, y: 0.7 }; card.layout.photoSlots[0].zoom = 1.5;   // 원장이 드래그·핀치로 맞춘 값
    const saved = api1.cardsForSave();
    expect(saved.map((c) => c.layoutId)).toEqual(['wsl-ba-lr', null]);
    expect(saved[0].slots[0]).toEqual({ id: 'before', fx: 0.2, fy: 0.7, zoom: 1.5 });
    // 새 세션(open): workspaceContext 에서 복원된 값만 가지고 시작
    const st2 = { cur: 'layout', d: { photos: PHOTOS(), templateOutputs: [], wsComp: 'ba', _wsSavedCards: JSON.parse(JSON.stringify(saved)) } };
    const api2 = loadLayout(st2, []);
    expect(compOn(api2.renderLayout())).toBe('ba');
    expect(st2.d.wsCards.map((c) => c.id)).toEqual(saved.map((c) => c.id));
    expect(st2.d.wsCards[0].layout.photoSlots[0].focal).toEqual({ x: 0.2, y: 0.7 });
    expect(st2.d.wsCards[0].layout.photoSlots[0].zoom).toBe(1.5);
  });

  test('레이아웃을 아직 안 거친 세션은 cardsForSave 가 null — 저장본의 구성을 덮어쓰지 않는다', () => {
    const api = loadLayout({ cur: 'caption', d: { photos: PHOTOS(), templateOutputs: [] } }, []);
    expect(api.cardsForSave()).toBeNull();
  });

  test('buildSlot 이 workspaceContext.layoutComp/layoutCards/photoFit 을 적고, open() 이 d.wsComp/_wsSavedCards/_wsFit 로 되살린다', () => {
    expect(flowSrc).toMatch(/slot\.workspaceContext\.layoutCards = _lc/);
    expect(flowSrc).toMatch(/slot\.workspaceContext\.layoutComp = /);
    expect(flowSrc).toMatch(/slot\.workspaceContext\.photoFit = d\._wsFit/);
    expect(flowSrc).toMatch(/wsComp: \(wc && wc\.layoutComp\) \|\| null/);
    expect(flowSrc).toMatch(/_wsSavedCards: \(wc && Array\.isArray\(wc\.layoutCards\)\)/);
    expect(flowSrc).toMatch(/_wsFit: \(wc && \(wc\.photoFit === 'cover' \|\| wc\.photoFit === 'contain'\)\)/);
  });
});

describe('③ composeCards 는 안 바뀐 카드를 다시 굽지 않는다', () => {
  test('🔴 원장이 편집기로 꾸민 합성본(storyEdited)은 CTA 를 다시 눌러도 그대로다', async () => {
    const outs = SAVED_OUTS(); outs[0].outputUrl = 'edited-by-owner'; outs[0].storyEdited = true;
    const st = { cur: 'layout', d: { photos: PHOTOS(), templateOutputs: outs, templateOutput: 'edited-by-owner' } };
    const log = [];
    const api = loadLayout(st, log);
    const res = await api.composeCards();
    expect(res[0].outputUrl).toBe('edited-by-owner');
    expect(res[0].storyEdited).toBe(true);
    expect(log).toEqual([]);
  });

  test('슬롯을 드래그해 다시 맞춘 카드(_dirty)만 다시 굽는다', async () => {
    const st = { cur: 'layout', d: { photos: PHOTOS(), templateOutputs: SAVED_OUTS(), templateOutput: 'saved-ba' } };
    const log = [];
    const api = loadLayout(st, log);
    api.renderLayout();
    st.d.wsCards[0]._dirty = true;   // _wsMountStage onChange 가 세우는 표식
    st.d.wsCards[0].layout.photoSlots[1].focal.x = 0.9;
    const res = await api.composeCards();
    expect(log).toEqual(['wsl-ba-lr:pb+pa:0.50,1/0.90,1']);
    expect(res[0].outputUrl).toBe('baked:wsl-ba-lr:pb+pa:0.50,1/0.90,1');
    expect(st.d.wsCards[0]._dirty).toBe(false);
    expect(res[1].outputUrl).toBe('d-h');
  });

  test('구성을 바꾸면(옛 합성본 무효화) 새 구성으로 전부 굽는다 — 재사용이 낡은 결과를 남기지 않는다', async () => {
    const st = { cur: 'layout', d: { photos: PHOTOS(), templateOutputs: SAVED_OUTS(), templateOutput: 'saved-ba' } };
    const log = [];
    const api = loadLayout(st, log);
    api.renderLayout();
    api.handleClick({ closest: (sel) => (sel === '[data-fl-comp]' ? { getAttribute: () => 'grid' } : null) }, null);
    const res = await api.composeCards();
    expect(res.map((o) => o.templateId)).toEqual(['wsl-strip-3']);
    expect(log.length).toBe(1);
  });

  test('지난 굽기에 못 불러온 칸(missing)이 있으면 다시 굽는다', async () => {
    const outs = SAVED_OUTS(); outs[0].missing = 1;
    const st = { cur: 'layout', d: { photos: PHOTOS(), templateOutputs: outs, templateOutput: 'saved-ba' } };
    const log = [];
    const api = loadLayout(st, log);
    await api.composeCards();
    expect(log.length).toBe(1);
  });

  test('그대로 카드: 사진이 그대로면 자동 꾸밈 원판(_autoBase)·지문이 살아남는다(캡션 화면에서 또 굽지 않게)', async () => {
    const outs = SAVED_OUTS(); outs[1].outputUrl = 'decorated'; outs[1]._autoBase = 'd-h'; outs[1].autoSig = 'sig';
    const st = { cur: 'layout', d: { photos: PHOTOS(), templateOutputs: outs, templateOutput: 'saved-ba' } };
    const api = loadLayout(st, []);
    const res = await api.composeCards();
    expect(res[1]).toBe(outs[1]);
    expect(res[1].autoSig).toBe('sig');
  });
});

describe('④ 홈 — 캡션 없는 글(crop)은 편집기 강제 진입 없이 레이아웃/캡션으로', () => {
  test('KEY2SCREEN 에 crop 이 명시돼 있다(edit 폴백 아님)', () => {
    expect(homeSrc).toMatch(/KEY2SCREEN = \{[^}]*crop:'layout'/);
  });
  test('합성본이 있는 글은 캡션(결과) 화면으로, 사진만 있는 글은 레이아웃으로', () => {
    const i = homeSrc.indexOf('function _resumeScreen(');
    expect(i).toBeGreaterThan(0);
    const body = homeSrc.slice(i, homeSrc.indexOf('\n  }', i) + 4);
    // eslint-disable-next-line no-new-func
    const fn = new Function('KEY2SCREEN', body + '; return _resumeScreen;')({ upload: 'upload', crop: 'layout', edit: 'edit', caption: 'caption' });
    expect(fn({ templateOutputs: [{ pairId: 'x' }] }, 'crop')).toBe('caption');
    expect(fn({ templateOutputs: [] }, 'crop')).toBe('layout');
    expect(fn({}, 'caption')).toBe('caption');
    expect(fn({}, 'nope')).toBe('edit');
  });
  test('_resumeSlot / 드로어 next 둘 다 _resumeScreen 을 쓴다(한쪽만 고치면 다른 입구가 그대로 터진다)', () => {
    expect((homeSrc.match(/_resumeScreen\(/g) || []).length).toBeGreaterThanOrEqual(3);
  });
});
