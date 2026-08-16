'use strict';

/* 작업 기억 병합 엔진 — T1 특성화(characterization) 테스트 (2026-08-17).

   T1 은 '동작 변화 0' 리팩터다: flow 세 경로(편집기·헤드리스 굽기·잇비)에 흩어져 있던
   병합 규칙을 work-memory-engine.js 한 곳으로 모았다. 여기 각 테스트는 이관 전
   flow 인라인 코드의 동작을 그대로 옮겨 적은 골든이다 — 엔진이 옛 동작과 다르면 실패한다.

   배선 잠금: 병합 구현이 flow 로 다시 스며들면(한쪽만 고쳐 편집기≠발행본이 되는
   반복 사고 패턴) 아래 'flow 배선' 테스트가 막는다. */

const fs = require('fs');
const path = require('path');

// work-memory.js / work-memory-engine.js 는 IIFE + window 전역 → 가짜 window 에 얹어 실제 함수를 쓴다
// (work-memory-layout.test.js 와 동일 방식 — 이 레포 jest 는 node 환경).
function loadAll(flagOn) {
  global.window = {};
  global.window.ITDASY_WORK_MEMORY = flagOn !== false;   // index.html:83 기본 ON 재현
  global.location = { search: '' };                       // work-memory _flagOn 이 읽음
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

// ★기본 기억 시드 — 편집기 산출물 형태의 슬롯으로 captureFromSlot(첫 기억은 자동 기본).
function seedDefault(WM) {
  return WM.captureFromSlot({
    id: 's1', service: '젤네일',
    photos: [{ editState: {
      v: 1, layoutIdx: 0, ratio: '4:5', layoutOrder: [], cellCrop: [], adj: [], photoDraw: {}, photoBg: {}, photos: ['x'],
      layers: [
        { type: 'text', role: 'title', text: '지난 글 문구', x: 0.5, y: 0.2, size: 0.06, align: 'center' },
        { type: 'sticker', emoji: '✨', x: 0.2, y: 0.2, size: 0.1 },
      ],
    } }],
  }, { service: '젤네일' });
}

describe('stripServiceText — 첫 장만 시술텍스트(2026-07-24 규칙, 두 경로 공유)', () => {
  const { E } = loadAll();
  test('시술내용 역할(title·sub·hashtag)의 text/badge/타입없음 은 뺀다', () => {
    const out = E.stripServiceText([
      { type: 'text', role: 'title', text: '볼륨매직' },
      { type: 'badge', role: 'sub', text: '부제' },
      { role: 'hashtag', text: '#네일' },              // roleText 배치는 type 필드가 없다(audit#3)
    ]);
    expect(out).toHaveLength(0);
  });
  test('로고·워터마크·선·스티커·role 없는 텍스트는 전 장 유지', () => {
    const keep = [
      { type: 'image', role: 'logo', src: 'x' },
      { type: 'badge', role: 'watermark', text: '@shop' },
      { type: 'line', x: 0.5, y: 0.5 },
      { type: 'sticker', emoji: '✨' },
      { type: 'text', text: '원장이 직접 쓴 글' },
    ];
    expect(E.stripServiceText(keep)).toHaveLength(keep.length);
  });
});

describe('mergeEditState — 콜라주 editState 에 기억 꾸밈 합치기(구 _mergeWmLayers)', () => {
  const { E } = loadAll();
  const BASE = { layoutIdx: 4, layers: [{ role: 'title', text: '이번 글' }] };
  const WMST = { layers: [{ role: 'title', text: '지난 글' }, { type: 'sticker', emoji: '✨' }] };
  test('기억이 없으면 base 그대로 / base 가 없으면 기억 그대로', () => {
    expect(E.mergeEditState(BASE, null)).toBe(BASE);
    expect(E.mergeEditState(null, WMST)).toBe(WMST);
  });
  test('같은 role 은 base(이번 글) 승 — 지난 글 문구가 되살아나면 안 됨', () => {
    const out = E.mergeEditState(BASE, WMST);
    expect(out.layers).toHaveLength(2);
    expect(out.layers.find((l) => l.role === 'title').text).toBe('이번 글');
    expect(out.layers.some((l) => l.type === 'sticker')).toBe(true);
  });
  test('추가할 게 없으면(전부 role 겹침) base 객체를 그대로 돌려준다', () => {
    const out = E.mergeEditState(BASE, { layers: [{ role: 'title', text: '지난 글' }] });
    expect(out).toBe(BASE);
  });
});

describe('decorateLayers — 헤드리스 굽기 경로(구 _autoComposeTemplate 인라인)', () => {
  test('★기본 기억의 꾸밈을 얹되 role 겹침은 이번 글 승', () => {
    const { WM, E } = loadAll(true);
    seedDefault(WM);
    const base = [{ role: 'title', text: '이번 글', type: 'text' }];
    const out = E.decorateLayers(base, { photoCount: 1 });
    expect(out).toHaveLength(2);   // base title + 기억 스티커(기억 title 은 role 겹침으로 제외)
    expect(out.find((l) => l.role === 'title').text).toBe('이번 글');
    expect(out.some((l) => l.type === 'sticker')).toBe(true);
  });
  test('플래그 OFF(?wsmem=0 상당)면 아무것도 안 얹는다 — 기존 동작 100% 유지', () => {
    const { WM, E } = loadAll(false);
    seedDefault(WM);
    const base = [{ role: 'title', text: '이번 글', type: 'text' }];
    expect(E.decorateLayers(base, { photoCount: 1 })).toBe(base);
  });
});

describe('forEditor — 편집기 경로(구 _openStoryEditor :582 인라인)', () => {
  test('restore(재편집 이어가기)면 기억을 계산하지 않는다 = null', () => {
    const { WM, E } = loadAll(true);
    seedDefault(WM);
    expect(E.forEditor({ restore: true, incoming: [], photoCount: 1 })).toBeNull();
  });
  test('★기본 + 플래그 ON → editState 반환, layersOnly 면 칸 배치 없음', () => {
    const { WM, E } = loadAll(true);
    seedDefault(WM);
    const st = E.forEditor({ restore: false, incoming: [{ role: 'title', text: '이번 글' }], photoCount: 1, layersOnly: true });
    expect(st).toBeTruthy();
    expect(st.layoutIdx).toBeUndefined();
    expect(st.layers.find((l) => l.role === 'title').text).toBe('이번 글');
  });
  test('플래그 OFF → null (기억 없던 시절과 100% 동일하게 깨끗이 열림)', () => {
    const { WM, E } = loadAll(false);
    seedDefault(WM);
    expect(E.forEditor({ restore: false, incoming: [], photoCount: 1 })).toBeNull();
  });
  test('잇비 "평소 하던 대로"(orch.useRecentStyle)는 플래그 OFF 여도 ★기본을 적용한다', () => {
    const { WM, E } = loadAll(false);
    seedDefault(WM);
    const st = E.forEditor({ restore: false, orch: { useRecentStyle: true }, incoming: [{ role: 'title', text: '이번 글' }], photoCount: 1 });
    expect(st).toBeTruthy();
    expect(st.layers.some((l) => l.type === 'sticker')).toBe(true);
  });
  test('orch 가 텍스트를 주면(wantsText) 기억의 텍스트 role 은 비운다 — orch 레이어가 소유', () => {
    const { WM, E } = loadAll(false);
    seedDefault(WM);
    const st = E.forEditor({ restore: false, orch: { useRecentStyle: true, wantsText: true }, incoming: [{ role: 'title', text: '이번 글' }], photoCount: 1 });
    expect(st).toBeTruthy();
    expect(st.layers.some((l) => l.role === 'title')).toBe(false);   // incoming:[] → role 텍스트 드롭
    expect(st.layers.some((l) => l.type === 'sticker')).toBe(true);
  });
});

describe('flow 배선 — 병합 로직이 flow 에 남아 있으면 안 된다', () => {
  const flowSrc = fs.readFileSync(path.join(__dirname, '..', 'workspace-v2-flow.js'), 'utf8');
  test('세 경로 모두 엔진을 호출한다', () => {
    expect(flowSrc).toMatch(/WorkMemoryEngine\.forEditor\(/);
    expect(flowSrc).toMatch(/WorkMemoryEngine\.decorateLayers\(/);
    expect(flowSrc).toMatch(/WorkMemoryEngine\.stripServiceText\(/);
    expect(flowSrc).toMatch(/WorkMemoryEngine\.mergeEditState\(/);
  });
  test('병합 구현(role 중복 제거·시술역할표)이 flow 에서 사라졌다', () => {
    expect(flowSrc).not.toMatch(/SERVICE_TEXT_ROLES\s*=/);
    expect(flowSrc).not.toMatch(/_have\[L\.role\]/);
  });
  test('로드 순서: work-memory → engine → flow (engine 이 빠지면 기억 주입이 통째로 무음 실패)', () => {
    const lg = fs.readFileSync(path.join(__dirname, '..', '..', 'load-groups.js'), 'utf8');
    const a = lg.indexOf('work-memory.js');
    const b = lg.indexOf('work-memory-engine.js');
    const c = lg.indexOf('workspace-v2-flow.js');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});
