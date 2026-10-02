/**
 * @jest-environment jsdom
 */
/* [2026-10-01 flow-workspace-photo-05/06]
 * 05 🔴 카드가 2장 이상이면 결과 캐러셀 칸이 4:5 고정+cover 라 1:1 전후 합성본(BEFORE/AFTER)이 좌우 10%씩 잘렸다.
 *     실측(scn-d [D3]): 슬라이드 350×438(0.800)·cover vs 결과물 1080×1080(1.000). 단일 결과물 분기(2026-09-13)에만 실제 비율이 있었다.
 *     수정: 다중 슬라이드도 kind 'output' 이면 실제 픽셀 비율을 inline aspect-ratio 로, 모르면 한 번 읽어 갱신.
 *     [04 갱신 2026-10-01] 발행(BE publish-carousel-file)이 캐러셀을 **첫 장의 clamp 된 비율로 통일·pad** 하므로
 *     미리보기도 같은 규칙 — 결과물 슬라이드 전부가 첫 장 비율(허용 범위 4:5~1.91:1 밖이면 경계)을 받는다.
 *     장마다 실비율이면 발행본(통일)과 달라져 04 가 다시 깨진다.
 * 06 🔴 '폰에 저장' 이 보고 있던 1장만 내려받고 "인스타에 올리셨어요?" 를 물었다(나머지 카드 저장 안 됨·안내 없음).
 *     실측(scn-f2 [F2c]): 다운로드 ["itdasy.jpg"] · 카드 2.
 *     수정: 카드가 2장 이상이면 WorkspaceAdapter.saveImages 로 전부 저장하고 "N장을 저장했어요" + 시트에 N장 표시.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.ITDASY_SRC_ROOT || path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/workspace/workspace-v2-flow.js'), 'utf8');
const ADAPTER = fs.readFileSync(path.join(ROOT, 'js/workspace/workspace-adapter.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css/workspace-v2-flow.css'), 'utf8');

function slice(startMarker, endMarker) {
  const i = SRC.indexOf(startMarker); const j = SRC.indexOf(endMarker, i);
  if (i < 0 || j < 0) throw new Error('marker missing: ' + startMarker);
  return SRC.slice(i, j);
}
const inlineAR = (n) => ((n.getAttribute('style') || '').match(/aspect-ratio:([^;"]+)/) || [])[1] || '';
function loadCarousel({ items, capDims = {}, fmt = '45' }) {
  const probe = slice('  var _outDims = {};', '  function _blobDisp(u) {');
  const car = slice('	  function _igCarouselHtml(fallbackUrl) {', '	  // [v583] 인스타 미리보기 카드(.ig-card2)');
  const images = [];
  const env = {
    Image: function () { const o = { src: '' }; images.push(o); return o; },
    document, _blobDisp: (u) => 'blob:' + u, esc: (s) => String(s), _wsFormat: () => fmt,
    _displayItems: () => items, _capPreviewDims: capDims, d: { activeDisplayId: null },
  };
  // eslint-disable-next-line no-new-func
  const f = new Function(...Object.keys(env), probe + car + '; return { _igCarouselHtml, _probeOutDims };');
  return { api: f(...Object.values(env)), images };
}
// jsdom 의 CSSOM 은 aspect-ratio 를 모른다 → 갱신은 style 을 평범한 객체로 바꿔 끼워서 본다
function plainStyles(sel) {
  document.querySelectorAll(sel).forEach((n) => {
    const bg = (n.getAttribute('style') || '').match(/background-image:(url\([^)]*\))/);
    Object.defineProperty(n, 'style', { value: { backgroundImage: bg ? bg[1] : '', aspectRatio: '' }, configurable: true });
  });
}

describe('05 — 다중 슬라이드도 구워진 결과물은 실제 비율', () => {
  const ITEMS = [{ kind: 'output', id: 'wsc-4', url: 'ba1' }, { kind: 'output', id: 'wsc-5', url: 'flat1' }];
  test('🔴 크기를 아직 모르면 한 번 읽고(중복 없음), 읽히면 그 슬라이드 칸이 실제 비율로 바뀐다', () => {
    const { api, images } = loadCarousel({ items: ITEMS });
    document.body.innerHTML = api._igCarouselHtml('x');
    const slides = document.querySelectorAll('.ig-car__slide');
    expect(slides.length).toBe(2);
    expect(slides[0].getAttribute('data-fl-igout')).toBe('1');
    expect(inlineAR(slides[0])).toBe('');
    expect(images.map((i) => i.src)).toEqual(['blob:ba1', 'blob:flat1']);
    document.body.innerHTML = api._igCarouselHtml('x');   // 읽는 중 재렌더 — 중복 요청 없음
    expect(images.length).toBe(2);
    plainStyles('.ig-car__slide, .ig-car__img');
    images[0].naturalWidth = 1080; images[0].naturalHeight = 1080; images[0].onload();
    images[1].naturalWidth = 1080; images[1].naturalHeight = 1350; images[1].onload();
    const after = document.querySelectorAll('.ig-car__slide');
    expect(after[0].style.aspectRatio).toBe('1080 / 1080');
    // [04] 두 번째 장은 자기 비율(4:5)이 아니라 **첫 장 비율**(발행 때 첫 장 비율로 통일·pad 되므로)
    expect(after[1].style.aspectRatio).toBe('1080 / 1080');
    // 다시 그리면 처음부터 첫 장 비율
    document.body.innerHTML = api._igCarouselHtml('x');
    const again = document.querySelectorAll('.ig-car__slide');
    expect(inlineAR(again[0])).toBe('1080 / 1080');
    expect(inlineAR(again[1])).toBe('1080 / 1080');
    expect(images.length).toBe(2);
  });
  test('[04] 첫 장이 허용 범위 밖(2:3)이면 경계 4:5 로 clamp 되고 나머지 장도 그 비율을 받는다', () => {
    const { api } = loadCarousel({ items: ITEMS, capDims: { ba1: { w: 1440, h: 1920 }, flat1: { w: 1080, h: 1080 } } });
    document.body.innerHTML = api._igCarouselHtml('x');
    const s = document.querySelectorAll('.ig-car__slide');
    expect(inlineAR(s[0])).toBe('4 / 5');
    expect(inlineAR(s[1])).toBe('4 / 5');
    // 너무 넓은 첫 장(2.5:1)은 1.91:1 경계
    const wide = loadCarousel({ items: ITEMS, capDims: { ba1: { w: 2500, h: 1000 }, flat1: { w: 1080, h: 1080 } } });
    document.body.innerHTML = wide.api._igCarouselHtml('x');
    const w = document.querySelectorAll('.ig-car__slide');
    expect(inlineAR(w[0])).toBe('191 / 100');
    expect(inlineAR(w[1])).toBe('191 / 100');
  });
  test('캡션 화면이 이미 디코드한 크기가 있으면 바로 쓴다', () => {
    const { api, images } = loadCarousel({ items: ITEMS, capDims: { ba1: { w: 1080, h: 1080 }, flat1: { w: 1440, h: 1920 } } });
    document.body.innerHTML = api._igCarouselHtml('x');
    const s = document.querySelectorAll('.ig-car__slide');
    expect(inlineAR(s[0])).toBe('1080 / 1080');
    expect(inlineAR(s[1])).toBe('1080 / 1080');   // [04] 첫 장 비율로 통일(1440×1920 은 자기 비율이 아니라)
    expect(images.length).toBe(0);
  });
  test('원본 사진(kind photo) 슬라이드는 규격 칸 그대로(data-fl-igout 없음·읽지 않음)', () => {
    const { api, images } = loadCarousel({ items: [{ kind: 'photo', id: 'a', url: 'ra' }, { kind: 'photo', id: 'b', url: 'rb' }] });
    document.body.innerHTML = api._igCarouselHtml('x');
    const s = document.querySelectorAll('.ig-car__slide');
    expect(s[0].hasAttribute('data-fl-igout')).toBe(false);
    expect(inlineAR(s[0])).toBe('');
    expect(images.length).toBe(0);
  });
  test('단일 결과물 칸(.ig-photo)의 갱신 경로는 그대로 살아 있다(2026-09-13 수정 회귀 방지)', () => {
    const { api, images } = loadCarousel({ items: [{ kind: 'output', id: 'w', url: 'one' }] });
    document.body.innerHTML = api._igCarouselHtml('x');
    plainStyles('.ig-photo');
    images[0].naturalWidth = 1080; images[0].naturalHeight = 1080; images[0].onload();
    expect(document.querySelector('.ig-photo').style.aspectRatio).toBe('1080 / 1080');
  });
  test('CSS: 트랙은 가운데 정렬(stretch 면 inline aspect-ratio 가 안 먹는다) · 결과물 슬라이드는 contain', () => {
    expect(CSS).toMatch(/\.ig-car__track \{[^}]*align-items: center/);
    expect(CSS).toMatch(/\.ig-car__slide\[data-fl-igout\] \.ig-car__img \{ background-size: contain; \}/);
  });
});

describe('06 — 폰에 저장은 카드 전부', () => {
  function loadAdapter() {
    window.showToast = jest.fn();
    window.Capacitor = undefined;
    // eslint-disable-next-line no-eval
    eval(ADAPTER);
    return window.WorkspaceAdapter;
  }
  test('🔴 saveImages: 공유 시트가 없는 웹에선 N장을 순서대로 내려받고 "N장을 저장했어요"', async () => {
    const A = loadAdapter();
    delete navigator.share; delete navigator.canShare;
    const clicked = [];
    const origCreate = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreate(tag);
      if (tag === 'a') el.click = () => clicked.push(el.download);
      return el;
    });
    const r = await A.saveImages(['data:image/jpeg;base64,A', 'data:image/jpeg;base64,B', 'data:image/jpeg;base64,C'], '커트');
    document.createElement.mockRestore();
    expect(r).toEqual({ ok: true, via: 'download', saved: 3, total: 3 });
    expect(clicked).toEqual(['커트-1.jpg', '커트-2.jpg', '커트-3.jpg']);
    expect(window.showToast).toHaveBeenCalledWith('사진 3장을 저장했어요');
  });
  test('saveImages: 1장이면 기존 saveImage 와 같은 결과(이름·토스트)', async () => {
    const A = loadAdapter();
    delete navigator.share; delete navigator.canShare;
    const clicked = [];
    const origCreate = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag) => { const el = origCreate(tag); if (tag === 'a') el.click = () => clicked.push(el.download); return el; });
    const r = await A.saveImages(['data:image/jpeg;base64,A'], 'itdasy');
    document.createElement.mockRestore();
    expect(r.ok).toBe(true); expect(r.saved).toBe(1); expect(clicked).toEqual(['itdasy.jpg']);
  });
  test('saveImages: 네이티브에서 공유가 막히면 거짓 성공을 띄우지 않는다', async () => {
    const A = loadAdapter();
    delete navigator.share; delete navigator.canShare;
    window.Capacitor = { isNativePlatform: () => true };
    const r = await A.saveImages(['data:image/jpeg;base64,A', 'data:image/jpeg;base64,B'], 'x');
    expect(r.ok).toBe(false); expect(r.saved).toBe(0);
  });
  test('🔴 flow 의 saveimg 핸들러는 표시 카드가 2장 이상이면 saveImages(전부) 를 쓰고, 저장 장수를 시트에 넘긴다', () => {
    const i = SRC.indexOf("if (a === 'saveimg') {");
    const seg = SRC.slice(i, i + 1200);
    expect(seg).toMatch(/_displayItems\(\)\.map\(function \(it\) \{ return it && it\.url; \}\)/);
    expect(seg).toMatch(/_imgs\.length > 1 && window\.WorkspaceAdapter\.saveImages/);
    expect(seg).toMatch(/_askPublishedSheet\(r\.saved \|\| 1\)/);
    expect(SRC).toMatch(/savedN > 1 \? '이미지 ' \+ savedN \+ '장을 기기에 저장했어요\.'/);
  });
});
