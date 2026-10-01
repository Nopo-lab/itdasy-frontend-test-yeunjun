/* 🔴 [2026-10-01 flow-workspace-photo-02] 카드가 여러 장인 글에서 2번째 카드(그대로 사진)를 보며 '사진 편집' 을
 *   누르면 편집기는 1번 카드(전·후 합성본)를 열고, 완료본이 2번 카드 자리에 저장돼 2번 사진이 사라졌다(카드 혼입).
 *
 * 실측(scn-d-edit, 로컬 스택): 도트 ["wsc-4","wsc-5*"] 선택 → 편집기 메인 1080×1080 전후색(1번 카드)
 *   → [완료] → templateOutputs[1](wsc-5) 이 전후 합성본으로 교체 · photos[0].editedDataUrl/storyEdited 도 합성본으로 오염.
 *
 * 원인: _wsLayoutEditState() 가 activeDisplayId 와 무관하게 늘 templateOutputs[0] 을 composite 로 돌려줬고,
 *   onDone 의 _syncOutputForEdit(p, url, true) 가 사진 매칭 실패 시 isWs 폴백으로 '보던 카드' 에 결과를 썼다.
 *   또 p(=첫 사진).editedDataUrl 에 합성본을 넣어 사진 모델까지 더럽혔다.
 *
 * 수정: 편집 대상을 **카드 단위**로 — _wsLayoutEditState(activeId) 가 그 카드를 돌려주고(그대로 카드면 사진 경로),
 *   레이아웃 카드 결과는 _applyCardEdit 가 그 카드에만 적는다(storyEdited/editState 는 카드에). 사진 모델은 그대로.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.ITDASY_SRC_ROOT || path.join(__dirname, '..');
const layoutSrc = fs.readFileSync(path.join(ROOT, 'js/workspace/flow/layout.js'), 'utf8');
const modelSrc = fs.readFileSync(path.join(ROOT, 'js/workspace/layout/layout-model.js'), 'utf8');
const flowSrc = fs.readFileSync(path.join(ROOT, 'js/workspace/workspace-v2-flow.js'), 'utf8');
const stateSrc = fs.readFileSync(path.join(ROOT, 'js/workspace/workspace-state.js'), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function loadLayout(state) {
  const w = {}; global.window = w;
  w.WSFlowUtil = { esc: (x) => String(x == null ? '' : x), toast: () => {} }; w.WSBlobUrl = null;
  // eslint-disable-next-line no-eval
  eval(modelSrc);
  // eslint-disable-next-line no-eval
  eval(layoutSrc);
  return w.WSFlowLayout.create({
    d: () => state.d, cur: () => state.cur, el: () => null, setScreen: () => {},
    editablePhotos: () => state.d.photos.filter((p) => p.selected !== false),
    photoUrl: (p) => (p ? (p.editedDataUrl || p.dataUrl) : ''), cleanBase: (p) => p && p.dataUrl, reassignRoles: () => {},
  });
}
/** flow 안의 함수 하나를 중괄호 짝으로 잘라 주입 가능한 형태로. */
function pick(src, head) {
  const i = src.indexOf(head); if (i < 0) throw new Error('missing: ' + head);
  let depth = 0, started = false;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === '{') { depth++; started = true; } else if (c === '}') { depth--; if (started && depth === 0) return src.slice(i, k + 1); }
  }
  throw new Error('unbalanced');
}
const PHOTOS = () => [
  { id: 'pb', dataUrl: 'd-b', role: 'before', selected: true, selSeq: 1 },
  { id: 'pa', dataUrl: 'd-a', role: 'after', selected: true, selSeq: 2 },
  { id: 'ph', dataUrl: 'd-h', role: 'hero', selected: true, selSeq: 3 },
];
const OUTS = () => [
  { pairId: 'wsc-4', templateId: 'wsl-ba-lr', beforePhotoId: 'pb', afterPhotoId: 'pa', outputUrl: 'ba-composite', ratio: '1:1', pairLabel: '1번째', photoIds: ['pb', 'pa'] },
  { pairId: 'wsc-5', templateId: null, beforePhotoId: null, afterPhotoId: null, outputUrl: 'd-h', pairLabel: '2번째', photoIds: ['ph'] },
];

describe('편집 대상은 보고 있던 카드다 — _wsLayoutEditState(activeId)', () => {
  test('🔴 2번째 카드(그대로 사진)를 보고 있으면 합성본을 열지 않는다(null = 그 사진의 원판을 여는 사진 경로)', () => {
    const st = { cur: 'caption', d: { photos: PHOTOS(), templateOutputs: OUTS(), templateOutput: 'ba-composite' } };
    const api = loadLayout(st);
    expect(api._wsLayoutEditState('wsc-5')).toBeNull();
  });
  test('1번째 카드(전·후 합성)를 보고 있으면 그 카드의 합성본을 단일 이미지로 — card 가 같이 온다', () => {
    const st = { cur: 'caption', d: { photos: PHOTOS(), templateOutputs: OUTS(), templateOutput: 'ba-composite' } };
    const api = loadLayout(st);
    const ed = api._wsLayoutEditState('wsc-4');
    expect(ed.mode).toBe('composite');
    expect(ed.photoUrl).toBe('ba-composite');
    expect(ed.card).toBe(st.d.templateOutputs[0]);
  });
  test('지정이 없으면(단일 결과물 화면) 첫 카드 — 기존 동작 유지 · 자동 꾸밈 원판(_autoBase)이 있으면 그걸 연다', () => {
    const outs = OUTS(); outs[0]._autoBase = 'clean';
    const api = loadLayout({ cur: 'caption', d: { photos: PHOTOS(), templateOutputs: outs, templateOutput: 'ba-composite' } });
    expect(api._wsLayoutEditState(null).photoUrl).toBe('clean');
    expect(api._wsLayoutEditState('wslayout').photoUrl).toBe('clean');
  });
  test('보던 것이 사진 id(결과물 없는 표시)면 사진 경로', () => {
    const api = loadLayout({ cur: 'caption', d: { photos: PHOTOS(), templateOutputs: [], wsComp: 'ba' } });
    expect(api._wsLayoutEditState('ph')).toBeNull();
  });
});

describe('_activeEditPhoto — 그대로 카드의 pairId 는 그 카드가 담은 사진이다', () => {
  function load(d) {
    const body = pick(strip(flowSrc), 'function _activeEditPhoto()');
    // eslint-disable-next-line no-new-func
    return new Function('d', 'curPhoto', body + '; return _activeEditPhoto;')(d, () => d.photos[0]);
  }
  test('🔴 activeDisplayId=wsc-5(그대로 카드) → ph (예전엔 curPhoto()=첫 사진으로 떨어졌다)', () => {
    const d = { photos: PHOTOS(), templateOutputs: OUTS(), activeDisplayId: 'wsc-5' };
    expect(load(d)().id).toBe('ph');
  });
  test('사진 id 그대로·지정 없음은 기존 동작', () => {
    expect(load({ photos: PHOTOS(), templateOutputs: [], activeDisplayId: 'pa' })().id).toBe('pa');
    expect(load({ photos: PHOTOS(), templateOutputs: OUTS(), activeDisplayId: null })().id).toBe('pb');
  });
});

describe('_applyCardEdit — 결과는 그 카드에만, 사진 모델은 그대로', () => {
  function load(d) {
    const body = pick(strip(flowSrc), 'function _applyCardEdit(wsEd, dataUrl, meta)');
    const _photoById = (id) => (d.photos || []).filter((p) => String(p.id) === String(id))[0] || null;
    global.window = { WorkspaceLayout: null };
    // eslint-disable-next-line no-new-func
    return new Function('d', '_photoById', 'window', body + '; return _applyCardEdit;')(d, _photoById, global.window);
  }
  test('🔴 1번 카드(composite) 편집 → outs[0] 만 바뀌고 outs[1]·photos[*] 는 그대로, storyEdited/editState 는 카드에', () => {
    const d = { photos: PHOTOS(), templateOutputs: OUTS(), templateOutput: 'ba-composite' };
    const es = { v: 1, photos: ['ba-composite'], layers: [{ type: 'text', text: 'hi' }] };
    load(d)({ mode: 'composite', card: d.templateOutputs[0], cardId: 'wsc-4', photoUrl: 'ba-composite' }, 'edited-ba', { editState: es });
    expect(d.templateOutputs[0].outputUrl).toBe('edited-ba');
    expect(d.templateOutputs[0].storyEdited).toBe(true);
    expect(d.templateOutputs[0].editState).toBe(es);
    expect(d.templateOutputs[0]._autoBase).toBe('ba-composite');
    expect(d.templateOutputs[1].outputUrl).toBe('d-h');
    expect(d.photos.map((p) => [p.editedDataUrl, p.storyEdited])).toEqual([[undefined, undefined], [undefined, undefined], [undefined, undefined]]);
    expect(d.templateOutput).toBe('edited-ba');   // 첫 카드 미러 계약 유지
  });
  test('2번째 레이아웃 카드를 편집하면 첫 카드 미러(templateOutput)는 건드리지 않는다', () => {
    const outs = OUTS(); outs[1] = { pairId: 'wsc-5', templateId: 'wsl-collage-2', outputUrl: 'c2', photoIds: ['ph', 'pa'] };
    const d = { photos: PHOTOS(), templateOutputs: outs, templateOutput: 'ba-composite' };
    load(d)({ mode: 'composite', card: outs[1], cardId: 'wsc-5', photoUrl: 'c2' }, 'edited-c2', {});
    expect(outs[1].outputUrl).toBe('edited-c2');
    expect(outs[0].outputUrl).toBe('ba-composite');
    expect(d.templateOutput).toBe('ba-composite');
  });
  test('아직 안 구운 카드(콜라주 모드)는 그 카드 자리에 결과물을 새로 만든다', () => {
    const card = { id: 'wsc-7', layout: { id: 'wsl-ba-lr', ratio: '1:1', photoSlots: [{ id: 'before', role: 'before' }, { id: 'after', role: 'after' }] }, photoIds: ['pb', 'pa'] };
    const d = { photos: PHOTOS(), templateOutputs: [], wsCards: [card, { id: 'wsc-8', layout: null, photoIds: ['ph'] }] };
    const o = load(d)({ mode: 'collage', cardRef: card, cardId: 'wsc-7', photos: ['d-b', 'd-a'] }, 'collage-out', { editState: { v: 1 } });
    expect(d.templateOutputs.length).toBe(1);
    expect(o.pairId).toBe('wsc-7');
    expect(o.templateId).toBe('wsl-ba-lr');
    expect(o.outputUrl).toBe('collage-out');
    expect(o.storyEdited).toBe(true);
    expect(d.templateOutput).toBe('collage-out');
  });
});

describe('onDone 배선 — 카드 편집은 사진에 쓰지 않는다', () => {
  const src = strip(flowSrc);
  test('_openStoryEditor 가 activeDisplayId 로 편집 상태를 묻는다', () => {
    expect(src).toMatch(/_wsLayoutEditState\(d\.activeDisplayId\)/);
  });
  test('카드 편집(_cardEd)이면 _applyCardEdit, 아니면 사진에 — 그리고 isWs=true 폴백은 더 이상 쓰지 않는다', () => {
    const i = src.indexOf('var _cardEd = !!(_wsEd && (_wsEd.mode === ');
    expect(i).toBeGreaterThan(0);
    const seg = src.slice(i, i + 700);
    expect(seg).toMatch(/if \(_cardEd\) \{ _applyCardEdit\(_wsEd, dataUrl, meta\); \}/);
    expect(seg).toMatch(/else if \(p\) \{ p\.editedDataUrl = dataUrl; p\.storyEdited = true;/);
    expect(seg).toMatch(/if \(!_cardEd\) _syncOutputForEdit\(p, dataUrl, false\)/);
    expect(src).not.toMatch(/_syncOutputForEdit\(p, dataUrl, !!_wsEd\)/);
  });
  test('카드 편집은 편집기에 그 한 장만 넘기고(썸네일로 장 바꿈 금지), 구워진 비율로 연다', () => {
    expect(src).toMatch(/photos: _soloPhoto \? \[photo\] :/);
    // 레이아웃 카드가 섞인 글의 '그대로 카드' 편집도 한 장만 — 편집기 adjSel=0 이 1번 사진으로 새지 않게
    expect(src).toMatch(/var _soloPhoto = _isCardEd \|\| \(!_wsEd && _hasLayoutCard\);/);
    expect(src).toMatch(/if \(meta && meta\.photoIdx != null && _edPhotosFull\)/);
    expect(src).toMatch(/_pp && _pp\.length && _edPhotosFull/);
    expect(src).toMatch(/ratio: \(_isCardEd && _wsEd\.card && _wsEd\.card\.ratio\) \|\| built\.ratio/);
  });
  test('카드 편집의 이어서-편집 스냅샷은 카드의 editState 이고, 캐러셀 전장 복원은 카드 편집에 안 돈다', () => {
    expect(src).toMatch(/if \(_isCardEd\) _restore = \(!_freshPick && _wsEd\.card && _wsEd\.card\.editState\) \|\| null;/);
    expect(src).toMatch(/&& !\(_wsEd && _wsEd\.mode === 'collage'\) && !_soloPhoto\)/);
  });
  test('_cardWasEdited 는 카드 플래그를 먼저 본다(자동 꾸밈이 원장 편집본을 덮지 않게)', () => {
    const b = pick(src, 'function _cardWasEdited(o)');
    expect(b).toMatch(/if \(o && o\.storyEdited\) return true;/);
  });
});

describe('상태 모델 — 카드 편집도 "편집했다" 로 센다', () => {
  function loadState() { const w = {}; global.window = w; /* eslint-disable-next-line no-eval */ eval(stateSrc); return w.WorkspaceState; }
  test('templateOutputs[].storyEdited 가 있으면 needs_crop 이 아니라 needs_caption', () => {
    const ST = loadState();
    const slot = { photos: [{ id: 'a', dataUrl: 'x' }, { id: 'b', dataUrl: 'y' }], caption: '', templateOutputs: [{ pairId: 'p', templateId: 'wsl-ba-lr', outputUrl: 'o', storyEdited: true }] };
    expect(ST.deriveStatus(slot)).toBe('needs_caption');
    expect(ST.nextAction(slot).key).toBe('caption');
    slot.templateOutputs[0].storyEdited = false;
    expect(ST.deriveStatus(slot)).toBe('needs_crop');
  });
});
