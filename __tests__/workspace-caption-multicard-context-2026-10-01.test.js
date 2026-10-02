/**
 * @jest-environment jsdom
 */
/* [2026-10-01 flow-workspace-photo-08/09]
 * 08 🔴 캡션 입력 화면이 카드 3장이어도 첫 카드(.wsl-cap-preview) 1장만 보여줬다 — 레이아웃에서 "3장이 올라가요" 직후라 혼란
 *     (실측 e2e-phase2 caption:input carousel:[] · 분기 순서가 templateOutput 우선, 2026-07-06 재오픈 썸네일 수정 때 다중 카드 미고려).
 *     수정: templateOutputs 가 2장 이상이면 입력 화면에서도 _capCarouselHtml, 단일이면 .wsl-cap-preview 그대로.
 * 09 🔴 캡션 컨텍스트가 카드 2장 이상이면 무조건 "전후 결과물 N장 … 각 장은 같은 고객의 시술 전/후 변화 컷" 이라고 했고,
 *     전·후 합치기를 골라도 workspaceContext.type/templatePurpose 가 promo/feed 로 저장됐다(실측 e2e-phase2 genOpts.photo_context · save:idb wc).
 *     수정: 카드 구성(_cardMix: 전후/모아보기/그대로)대로 서술 + 전후 카드가 있으면 content_type·저장 메타가 before_after(_effPurpose).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.ITDASY_SRC_ROOT || path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/workspace/workspace-v2-flow.js'), 'utf8');
const C = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ');

function pickFn(head) {
  const i = SRC.indexOf(head); if (i < 0) return '';
  let depth = 0, started = false;
  for (let k = i; k < SRC.length; k++) {
    const c = SRC[k];
    if (c === '{') { depth++; started = true; } else if (c === '}') { depth--; if (started && depth === 0) return SRC.slice(i, k + 1); }
  }
  return '';
}
function mixApi(d) {
  const parts = [pickFn('function _isBaOutput(o)'), pickFn('function _cardMix()'), pickFn('function _cardMixText(m)'), pickFn('function _effPurpose()'), pickFn('function _capCarHint(outN)')];
  if (parts.some((p) => !p)) return null;   // 수정 전 소스엔 없다
  // eslint-disable-next-line no-new-func
  const f = new Function('d', 'window', parts.join('\n') + '; return { _cardMix, _cardMixText, _effPurpose, _capCarHint };');
  return f(d, { WorkspaceLayout: { getById: (id) => (id === 'wsl-collage-2' ? { kind: 'collage' } : (id === 'wsl-ba-lr' ? { kind: 'before_after' } : null)) } });
}
const BA = { pairId: 'wsc-1', templateId: 'wsl-ba-lr', beforePhotoId: 'p1', afterPhotoId: 'p2', outputUrl: 'data:a' };
const FLAT = (n) => ({ pairId: 'wsc-' + n, templateId: null, outputUrl: 'data:f' + n });
const COLLAGE = { pairId: 'wsc-9', templateId: 'wsl-collage-2', outputUrl: 'data:c' };

describe('09 — 캡션 컨텍스트는 카드 구성대로', () => {
  test('🔴 전후 1장 + 그대로 2장: "전후 비교 1장 + 사진 2장" 으로 서술하고 content_type/저장 메타는 before_after', () => {
    const api = mixApi({ tplPurpose: 'feed', templateOutputs: [BA, FLAT(2), FLAT(3)] });
    expect(api).not.toBeNull();
    const m = api._cardMix();
    expect(m).toEqual({ ba: 1, collage: 0, plain: 2, total: 3 });
    const text = api._cardMixText(m);
    expect(text).toMatch(/카드 3장\(인스타 캐러셀 한 편\): 전후 비교 1장\(같은 고객의 시술 전\/후 변화 컷\) \+ 사진 2장\(시술 결과 컷\)/);
    expect(text).not.toMatch(/전후 결과물 3장/);
    expect(api._effPurpose()).toBe('before_after');
    expect(api._capCarHint(3)).toBe('전후 1장 + 사진 2장, 총 3장으로 게시글을 만들어요');
  });
  test('🔴 그대로 3장만: 전후 문구가 없고(전후 비교 아님 명시) content_type 은 feed 그대로', () => {
    const api = mixApi({ tplPurpose: 'feed', templateOutputs: [FLAT(1), FLAT(2), FLAT(3)] });
    const text = api._cardMixText(api._cardMix());
    expect(text).toMatch(/사진 3장\(시술 결과 컷, 전후 비교 아님\)/);
    expect(text).not.toMatch(/전후 비교 \d장/);
    expect(api._effPurpose()).toBe('feed');
    expect(api._capCarHint(3)).toBe('3장의 사진으로 게시글을 만들어요');
  });
  test('모아보기(콜라주) 카드는 "여러 장 모아보기" 로, 전부 전후면 예전 문구 유지', () => {
    const a = mixApi({ tplPurpose: 'feed', templateOutputs: [COLLAGE, FLAT(2)] });
    expect(a._cardMixText(a._cardMix())).toMatch(/여러 장 모아보기 1장 \+ 사진 1장/);
    expect(a._effPurpose()).toBe('feed');
    const b = mixApi({ tplPurpose: 'feed', templateOutputs: [BA, Object.assign({}, BA, { pairId: 'wsc-2' })] });
    expect(b._capCarHint(2)).toBe('2장의 전후 결과물로 게시글을 만들어요');
    expect(b._effPurpose()).toBe('before_after');
  });
  test('잇비 카테고리로 정해진 용도(review/event)는 전후 카드가 있어도 존중한다 · 레이아웃 "ba" 선택만으로도(아직 안 구움) before_after', () => {
    expect(mixApi({ tplPurpose: 'review', templateOutputs: [BA, FLAT(2)] })._effPurpose()).toBe('review');
    expect(mixApi({ tplPurpose: null, templateOutputs: [], wsComp: 'ba' })._effPurpose()).toBe('before_after');
    expect(mixApi({ tplPurpose: null, templateOutputs: [] })._effPurpose()).toBe('feed');
  });
  test('🔴 배선 — doGenerate 의 photo_context/content_type 과 buildSlot 의 type/expectedPhotos/templatePurpose 가 _effPurpose/_cardMix 를 쓴다', () => {
    const g = C.indexOf('function doGenerate(extra, label)');
    const gen = C.slice(g, g + 9000);
    expect(gen).toMatch(/opts\.photo_context \+= ' · ' \+ _cardMixText\(_mix\)/);
    expect(gen).toMatch(/opts\.content_type = _effPurpose\(\)/);
    expect(gen).not.toMatch(/'전후 결과물 ' \+ _outs\.length \+ '장/);
    const b = C.indexOf('function buildSlot()');
    const bs = C.slice(b, b + 6000);
    expect(bs).toMatch(/var _effP = _effPurpose\(\);/);
    expect(bs).toMatch(/type: TYPE_MAP\[_effP\] \|\| 'promo'/);
    expect(bs).toMatch(/expectedPhotos: _effP === 'before_after' \? 2 : 1/);
    expect(bs).toMatch(/templatePurpose: _effP,/);
  });
});

describe('08 — 캡션 입력 화면 미리보기', () => {
  test('🔴 renderCaption: 카드 2장 이상이면 캐러셀(_capCarouselHtml)이 templateOutput 단일 미리보기보다 먼저', () => {
    const r = C.indexOf('function renderCaption()');
    const body = C.slice(r, r + 3000);
    expect(body).toMatch(/var _capCar = \(\(d\.templateOutputs \|\| \[\]\)\.length >= 2\) \? _capCarouselHtml\(\) : '';/);
    expect(body).toMatch(/var photoThumb = _capCar \|\| \(d\.templateOutput/);
  });
  test('🔴 _capCarouselHtml 이 결과물 3장을 슬라이드 3개로 그린다(단일이면 빈 문자열 → .wsl-cap-preview 폴백)', () => {
    const car = pickFn('function _capCarouselHtml()'), hint = pickFn('function _capCarHint(outN)'), mix = pickFn('function _cardMix()'), isBa = pickFn('function _isBaOutput(o)');
    expect(car).not.toBe('');
    const build = (outs) => {
      const items = outs.map((o) => ({ kind: 'output', id: o.pairId, url: o.outputUrl, label: o.pairId, expandable: false }));
      // eslint-disable-next-line no-new-func
      const f = new Function('d', '_displayItems', 'esc', '_blobDisp', 'window', [isBa, mix, hint, car].join('\n') + '; return _capCarouselHtml();');
      return f({ templateOutputs: outs, activeDisplayId: null, tplPurpose: 'feed' }, () => items, (s) => String(s), (u) => u, { WorkspaceLayout: null });
    };
    document.body.innerHTML = build([BA, FLAT(2), FLAT(3)]);
    expect(document.querySelectorAll('.cap-car__slide').length).toBe(3);
    expect(document.querySelector('.cap-car__hint').textContent).toBe('전후 1장 + 사진 2장, 총 3장으로 게시글을 만들어요');
    expect(build([BA])).toBe('');
  });
});

describe('09 — before_after 용도로 재진입해도 카드에 든 사진을 또 세지 않는다', () => {
  test('🔴 _unpairedPhotos: 그대로/모아보기 카드의 photoIds 에 든 사진은 "남은 사진" 이 아니다(전후 1 + 그대로 1 → 남은 0)', () => {
    const fn = pickFn('function _unpairedPhotos()');
    expect(fn).not.toBe('');
    const d = { templateOutputs: [Object.assign({}, BA, { photoIds: ['p1', 'p2'] }), Object.assign({}, FLAT(2), { photoIds: ['p3'] })] };
    const sel = () => [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }];
    // eslint-disable-next-line no-new-func
    const out = new Function('d', '_selectedOrdered', fn + '; return _unpairedPhotos();')(d, sel);
    expect(out.map((p) => p.id)).toEqual(['p4']);   // 어느 카드에도 없는 p4 만 남는다(p3 는 그대로 카드)
  });
});
