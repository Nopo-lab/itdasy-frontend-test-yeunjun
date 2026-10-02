/**
 * @jest-environment jsdom
 */
/* 🔴 [2026-10-01 flow-workspace-photo-12] '다시 고르기'(layout → upload) 와 CTA(upload → layout) 를 오가면 setScreen 이
 *   방문 이력을 무조건 push 해 navStack 이 [upload, layout, upload, layout] 이 되고, 뒤로가기가 같은 화면을 되밟아
 *   4번 눌러도 닫히지 않았다(실측 e2e-main-phase1 nav:back-without-caption {screens:['caption','layout','upload','layout'], openAfter:true}).
 *
 * 수정: 이미 거쳐 온 화면으로 **돌아가는** 전환이면 그 지점까지 스택을 접고(history 엔트리도 같은 수만큼 go(-n)),
 *       되감기로 생긴 popstate 는 표식(_rewindPending)으로 한 번 삼킨다.
 *
 * workspace-v2-flow.js 에서 네비 함수(_pushHist/_rewindHist/_bindPop/_navBack/setScreen)를 실제 소스 그대로 잘라
 * 가짜 history(동기 popstate)와 최소 DOM 으로 돌린다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.ITDASY_SRC_ROOT || path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/workspace/workspace-v2-flow.js'), 'utf8');

function pickFn(head, optional) {
  const i = SRC.indexOf(head); if (i < 0) { if (optional) return ''; throw new Error('missing: ' + head); }
  let depth = 0, started = false;
  for (let k = i; k < SRC.length; k++) {
    const c = SRC[k];
    if (c === '{') { depth++; started = true; } else if (c === '}') { depth--; if (started && depth === 0) return SRC.slice(i, k + 1); }
  }
  throw new Error('unbalanced: ' + head);
}
function pickVar(decl) {
  const i = SRC.indexOf(decl); if (i < 0) return '';
  return SRC.slice(i, SRC.indexOf('\n', i) + 1);
}

function makeFlow() {
  const SCREENS = ['upload', 'layout', 'caption', 'connect', 'preview'];
  document.body.innerHTML = '<div id="wsv2Flow" class="wsv2flow is-open"><div data-fl-title></div><div data-fl-step></div>' +
    '<div class="wsv2flow__progress">' + SCREENS.map(() => '<i class="pg-seg"></i>').join('') + '</div>' +
    '<div class="wsv2flow__screens">' + SCREENS.map((s) => '<div class="wsv2flow__s" data-fs="' + s + '"></div>').join('') + '</div>' +
    '<div class="wsv2flow__actionbar"><button data-fl="cta"></button></div></div>';
  const el = document.getElementById('wsv2Flow');
  // 가짜 history — pushState 는 엔트리 push, go(-n) 은 엔트리 pop 뒤 **동기** popstate(브라우저는 비동기지만 순서는 같다)
  const hist = { entries: ['base'], popstates: 0 };
  const history = {
    pushState(st) { hist.entries.push(st); },
    go(n) { for (let i = 0; i < -n; i++) hist.entries.pop(); hist.popstates++; window.dispatchEvent(new Event('popstate')); },
    back() { this.go(-1); },
  };
  const parts = [
    'var navStack = [];', 'var _histDepth = 0;', 'var _popBound = false;', 'var _closingHist = false;', 'var _genToken = 0;', "var cur = 'upload';",
    pickVar('  var _rewindPending = '),
    pickFn('function _pushHist()'),
    pickFn('function _rewindHist(n)', true),   // 수정 전 소스엔 없다 — 그래도 돌려서 '동작' 으로 실패하게
    pickFn('function _bindPop()'), pickFn('function _navBack()'), pickFn('function setScreen(name, opts)'),
    'return { setScreen: setScreen, _navBack: _navBack, _bindPop: _bindPop, stack: function () { return navStack.slice(); }, depth: function () { return _histDepth; }, cur: function () { return cur; } };',
  ];
  const env = {
    el, history, window, document, SCREENS, VISIBLE_SCREENS: SCREENS, TITLE: {}, CTA: { upload: { l: 'x' }, layout: { l: 'y' }, caption: { l: 'z', ghost: true } },
    STEP_FX: Object.fromEntries(SCREENS.map((s) => [s, { render: () => '<p>' + s + '</p>' }])),
    d: { caption: '', photos: [{}] }, editablePhotos: () => [{}], flushCaptionInputs: () => {}, setTimeout,
  };
  // eslint-disable-next-line no-new-func
  const f = new Function(...Object.keys(env), parts.join('\n'));
  const api = f(...Object.values(env));
  api._bindPop();
  return { api, hist, el };
}

afterEach(() => { window.removeEventListener('popstate', () => {}); document.body.innerHTML = ''; });

test('🔴 upload → layout → 다시 고르기(upload) → layout → caption: 스택이 선형이고 back 2회에 upload, 3회에 닫힘', () => {
  const { api, hist } = makeFlow();
  api.setScreen('layout');          // CTA
  expect(api.stack()).toEqual(['upload']);
  api.setScreen('upload');          // 다시 고르기 — 방문했던 화면으로 '돌아감'
  expect(api.stack()).toEqual([]);
  expect(api.depth()).toBe(0);
  expect(hist.entries).toEqual(['base']);   // 엔트리도 되감겼다(되감기 popstate 는 삼켜져 화면이 안 바뀜)
  expect(api.cur()).toBe('upload');
  api.setScreen('layout');          // CTA
  api.setScreen('caption');         // CTA
  expect(api.stack()).toEqual(['upload', 'layout']);
  expect(api.depth()).toBe(2);
  // back ×2 → upload, 스택 비움
  expect(api._navBack()).toBe(true); expect(api.cur()).toBe('layout');
  expect(api._navBack()).toBe(true); expect(api.cur()).toBe('upload');
  expect(api.stack()).toEqual([]);
  // back ×3 → 단계 없음(false) = 전역 시트가 close
  expect(api._navBack()).toBe(false);
});

test('반복해도 쌓이지 않는다 — 다시 고르기 ×5 뒤에도 스택은 [upload] 하나', () => {
  const { api, hist } = makeFlow();
  for (let i = 0; i < 5; i++) { api.setScreen('layout'); api.setScreen('upload'); }
  api.setScreen('layout');
  expect(api.stack()).toEqual(['upload']);
  expect(hist.entries.length).toBe(2);
});

test('되감기 표식은 그 popstate 하나만 삼킨다 — 이어지는 진짜 back 은 화면을 되돌린다', () => {
  const { api, hist } = makeFlow();
  api.setScreen('layout'); api.setScreen('caption');   // [upload, layout]
  api.setScreen('layout');                             // 돌아감: [upload], 엔트리 1 되감김
  expect(api.stack()).toEqual(['upload']);
  const before = hist.popstates;
  hist.entries.pop(); window.dispatchEvent(new Event('popstate'));   // 사용자의 진짜 back
  expect(hist.popstates).toBe(before);
  expect(api.cur()).toBe('upload');
  expect(api.stack()).toEqual([]);
});

test('같은 화면 재렌더(push:false·같은 이름)·뒤로가기 복귀는 예전처럼 push 하지 않는다', () => {
  const { api } = makeFlow();
  api.setScreen('layout');
  api.setScreen('layout');                    // 재렌더
  api.setScreen('caption', { push: false });  // 프로그램적 이동
  expect(api.stack()).toEqual(['upload']);
});
