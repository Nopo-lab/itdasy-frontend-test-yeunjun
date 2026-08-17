'use strict';

/* T5 골든 — role 없는 텍스트 안전성: 분류·정규화·3회 승격·dismissed veto (2026-08-17).
   구현보다 먼저 작성해 계약을 잠근다.

   합의 계약:
   · role 있는 텍스트 → 기존 role 파이프라인(이번 글 문구로 교체/드롭) — T5 무관
   · role 없는 텍스트 → dynamic(자동 제거) / static(유지) / unknown(기본 = 이번 글만 → 드롭)
   · unknown 을 static 으로 간주 금지. 애매하면 unknown.
   · 3회 승격 = "동일 normalized text 가 서로 다른 게시물(발행 캡처) 3회 누적 관측" — 연속 아님.
   · dismissed veto = 원장이 그 문구를 지운 기록. 3회 조건을 다시 채워도 재승격 금지.
     자동 해제 없음("같은 글을 또 썼다" ≠ "삭제 결정 취소").
   · identity = normalized text (전역 textbook). layer index·배열 위치 금지 —
     memoryId+layerKey 보다 강함: 순서변경·재적용·reopen·다른 기억에 같은 문구가 와도 veto 유지.
   · dynamic 은 dismissed·3회와 무관하게 항상 제거(날짜·할인·이름은 예외 없음).
   · 원장 명시(dismissed) > static 패턴. */

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
// 발행 캡처 1회 = 게시물 1개. 배치(x)를 바꿔 dedup 을 피해서 '서로 다른 게시물'을 흉내낸다.
let _px = 0;
function publishWith(WM, texts, extra) {
  _px += 0.03;
  const layers = [{ type: 'sticker', emoji: '✨', x: 0.1 + _px, y: 0.2, size: 0.1 }]
    .concat((texts || []).map((t, i) => ({ type: 'text', text: t, x: 0.2 + _px + i * 0.05, y: 0.6, size: 0.05 })))
    .concat(extra || []);
  return WM.captureFromSlot({
    id: 'p' + Math.random(), service: '젤네일',
    photos: [{ editState: { v: 1, layoutIdx: 0, ratio: '4:5', layoutOrder: [], cellCrop: [], adj: [], photoDraw: {}, photoBg: {}, photos: ['x'], layers } }],
  }, {});
}
// ★기본 기억을 '이 레이어들'로 강제 시드 — 적용 결과만 보고 싶을 때.
function seedMemory(WM, layers) {
  const NOW = Date.now();
  const rec = {
    id: 'seed-m', schema: 2, sig: 'seed-sig', name: 'seed', createdAt: NOW, thumb: null,
    ratio: '4:5', layoutIdx: 0, photoCount: 1, layoutOrder: [], collageBg: null, collageGap: null, fitMode: null,
    layers, shopStyleId: null, kind: 'unknown', applyCount: 0, lastAppliedAt: 0, publishCount: 1, lastPublishedAt: NOW,
  };
  global.localStorage._m['itdasy:work_memory:list'] = JSON.stringify([rec]);
  global.localStorage._m['itdasy:work_memory:default'] = JSON.stringify('seed-m');
}
const noRole = (t) => ({ type: 'text', text: t, x: 0.5, y: 0.6, size: 0.05 });
const apply = (E) => E.forEditor({ restore: false, incoming: [], photoCount: 1, layersOnly: true });
const texts = (st) => (st ? st.layers.filter((l) => l.type === 'text' && !l.role).map((l) => l.text) : []);

describe('정규화 — 계약을 명시적으로 잠근다', () => {
  test('공백·흔한 문장부호 무시 + 영문 소문자화', () => {
    const { E } = loadAll();
    expect(E.normalizeText('레이어드컷')).toBe(E.normalizeText('레이어드 컷'));
    expect(E.normalizeText(' 레이어드컷 ')).toBe(E.normalizeText('레이어드컷'));
    expect(E.normalizeText('예약문의!')).toBe(E.normalizeText('예약 문의'));
    expect(E.normalizeText('DM 주세요~')).toBe(E.normalizeText('dm주세요'));
    expect(E.normalizeText('레이어드컷')).not.toBe(E.normalizeText('허쉬컷'));
  });
});

describe('분류 — dynamic / static / unknown (확신 없으면 unknown)', () => {
  test('dynamic: 날짜·기간·프로모션·%·금액', () => {
    const { E } = loadAll();
    ['8월 이벤트', '~8/31까지', '15일 마감', '첫 방문 20%', '3만원 할인', '오늘만 특가', '선착순 5명']
      .forEach((t) => expect(E.classifyText(t)).toBe('dynamic'));
  });
  test('static 패턴: 상시 안내 문구', () => {
    const { E } = loadAll();
    ['예약문의 DM', '상담 환영', '영업시간 10-8', '오시는 길'].forEach((t) => expect(E.classifyText(t)).toBe('static'));
  });
  test('dynamic 이 static 패턴보다 우선 — "예약 마감"은 dynamic', () => {
    const { E } = loadAll();
    expect(E.classifyText('예약 마감')).toBe('dynamic');
    expect(E.classifyText('8월 예약문의')).toBe('dynamic');
  });
  test('unknown: 애매한 건 전부 — static 으로 간주 금지', () => {
    const { E } = loadAll();
    ['가을 느낌으로', '레이어드컷', '오늘도 예쁘게'].forEach((t) => expect(['dynamic', 'unknown']).toContain(E.classifyText(t)));
    expect(E.classifyText('가을 느낌으로')).toBe('unknown');
    expect(E.classifyText('레이어드컷')).toBe('unknown');
  });
  test('한글 왼쪽 경계 — 단어 일부(대할인마트)는 dynamic 아님', () => {
    const { E } = loadAll();
    expect(E.classifyText('대할인마트 2층')).not.toBe('dynamic');
  });
});

describe('적용 규칙 — 무응답 = 이번 글만', () => {
  test('unknown 텍스트는 다음 글에 전파되지 않는다(0회 관측)', () => {
    const { WM, E } = loadAll();
    seedMemory(WM, [{ type: 'sticker', emoji: '✨', x: 0.2, y: 0.2, size: 0.1 }, noRole('가을 느낌으로')]);
    const st = apply(E);
    expect(texts(st)).toHaveLength(0);                       // unknown 드롭
    expect(st.layers.some((l) => l.type === 'sticker')).toBe(true);   // 텍스트 아닌 꾸밈은 무관
  });
  test('dynamic 텍스트는 항상 제거', () => {
    const { WM, E } = loadAll();
    seedMemory(WM, [{ type: 'sticker', emoji: '✨', x: 0.2, y: 0.2, size: 0.1 }, noRole('8월 이벤트')]);
    expect(texts(apply(E))).toHaveLength(0);
  });
  test('static 패턴 텍스트는 유지', () => {
    const { WM, E } = loadAll();
    seedMemory(WM, [{ type: 'sticker', emoji: '✨', x: 0.2, y: 0.2, size: 0.1 }, noRole('예약문의 DM')]);
    expect(texts(apply(E))).toEqual(['예약문의 DM']);
  });
  test('role 있는 텍스트는 T5 무관 — 기존 role 파이프라인 그대로', () => {
    const { WM, E } = loadAll();
    seedMemory(WM, [{ type: 'text', role: 'title', text: '지난 글', x: 0.5, y: 0.2, size: 0.06 },
      { type: 'sticker', emoji: '✨', x: 0.2, y: 0.2, size: 0.1 }]);
    const st = E.forEditor({ restore: false, incoming: [{ role: 'title', text: '이번 글' }], photoCount: 1, layersOnly: true });
    expect(st.layers.find((l) => l.role === 'title').text).toBe('이번 글');
  });
});

describe('3회 승격 — 누적(연속 아님), 게시물 단위', () => {
  test('1회·2회 관측 = 비승격(이번 글 ≠ 장기 선호), 3회째 = STATIC 승격', () => {
    const { WM, E } = loadAll();
    seedMemory(WM, [{ type: 'sticker', emoji: '✨', x: 0.2, y: 0.2, size: 0.1 }, noRole('시술후 관리법 안내드려요')]);
    publishWith(WM, ['시술후 관리법 안내드려요']);           // 1회
    expect(texts(apply(E))).toHaveLength(0);
    publishWith(WM, ['시술후 관리법 안내드려요']);           // 2회
    expect(texts(apply(E))).toHaveLength(0);
    publishWith(WM, ['시술후 관리법 안내드려요']);           // 3회 → 승격
    expect(texts(apply(E))).toEqual(['시술후 관리법 안내드려요']);
  });
  test('카운트 semantics: A,A,B,A → A 는 3회(누적)', () => {
    const { WM } = loadAll();
    publishWith(WM, ['우리샵 시그니처']);
    publishWith(WM, ['우리샵 시그니처']);
    publishWith(WM, ['전혀 다른 문구']);
    publishWith(WM, ['우리샵 시그니처']);
    expect(WM.textbook()[global.window.WorkMemoryEngine.normalizeText('우리샵 시그니처')].n).toBe(3);
  });
  test('같은 게시물 안의 중복은 1회', () => {
    const { WM, E } = loadAll();
    publishWith(WM, ['우리샵 시그니처', '우리샵 시그니처', ' 우리샵시그니처 ']);
    expect(WM.textbook()[E.normalizeText('우리샵 시그니처')].n).toBe(1);
  });
  test('dynamic 은 3회 관측돼도 승격 안 됨(예외 없음)', () => {
    const { WM, E } = loadAll();
    seedMemory(WM, [{ type: 'sticker', emoji: '✨', x: 0.2, y: 0.2, size: 0.1 }, noRole('8월 이벤트')]);
    publishWith(WM, ['8월 이벤트']); publishWith(WM, ['8월 이벤트']); publishWith(WM, ['8월 이벤트']);
    expect(texts(apply(E))).toHaveLength(0);
  });
  test("'이 스타일로 또'(publish:false) 캡처는 게시물 관측으로 안 센다", () => {
    const { WM, E } = loadAll();
    for (let i = 0; i < 3; i++) {
      _px += 0.03;
      WM.captureFromSlot({ id: 'r' + i, service: '젤',
        photos: [{ editState: { v: 1, layoutIdx: 0, ratio: '4:5', layoutOrder: [], cellCrop: [], adj: [], photoDraw: {}, photoBg: {}, photos: ['x'],
          layers: [noRole('반복 문구'), { type: 'sticker', emoji: '✨', x: 0.1 + _px, y: 0.2, size: 0.1 }] } }] }, null, { publish: false });
    }
    const tb = WM.textbook();
    const k = E.normalizeText('반복 문구');
    expect(!tb[k] || tb[k].n === 0).toBe(true);
  });
});

describe('dismissed veto — P0 (GPT 필수 시퀀스)', () => {
  test('A×3 승격 → 삭제(veto) → 재등장·재캡처에도 재생성 금지', () => {
    const { WM, E } = loadAll();
    seedMemory(WM, [{ type: 'sticker', emoji: '✨', x: 0.2, y: 0.2, size: 0.1 }, noRole('시술후 관리법')]);
    publishWith(WM, ['시술후 관리법']); publishWith(WM, ['시술후 관리법']); publishWith(WM, ['시술후 관리법']);
    expect(texts(apply(E))).toEqual(['시술후 관리법']);       // 승격 확인
    WM.dismissText(E.normalizeText('시술후 관리법'));         // 원장이 지움
    expect(texts(apply(E))).toHaveLength(0);                  // 즉시 드롭
    publishWith(WM, ['시술후 관리법']);                       // 다시 씀(1회)
    expect(texts(apply(E))).toHaveLength(0);                  // 재생성 금지
    publishWith(WM, ['시술후 관리법']); publishWith(WM, ['시술후 관리법']);   // 누적 6회
    expect(texts(apply(E))).toHaveLength(0);                  // 3회 조건 재충족해도 금지(자동 해제 없음)
  });
  test('원장 명시(dismissed) > static 패턴 — 지운 상시 문구도 안 살아난다', () => {
    const { WM, E } = loadAll();
    seedMemory(WM, [{ type: 'sticker', emoji: '✨', x: 0.2, y: 0.2, size: 0.1 }, noRole('예약문의 DM')]);
    expect(texts(apply(E))).toEqual(['예약문의 DM']);
    WM.dismissText(E.normalizeText('예약문의 DM'));
    expect(texts(apply(E))).toHaveLength(0);
  });
  test('identity 안정성 — 순서 변경·다른 레이어 추가·재적용에도 veto 유지(norm 기반)', () => {
    const { WM, E } = loadAll();
    WM.dismissText(E.normalizeText('시술후 관리법'));
    seedMemory(WM, [
      { type: 'line', x: 0.5, y: 0.5, size: 0.01 },
      noRole(' 시술후관리법! '),                              // 표기 변형 + 위치 다름
      { type: 'sticker', emoji: '✨', x: 0.2, y: 0.2, size: 0.1 },
    ]);
    expect(texts(apply(E))).toHaveLength(0);                  // 변형 표기도 같은 identity
    expect(texts(apply(E))).toHaveLength(0);                  // 재적용에도 동일
  });
});

describe('veto 범위 — 전역·영구 제품 정책 계약 (T5 최종 확정)', () => {
  /* 정책: dismissed = "이 문구를 자동으로 다시 얹지 않는다"의 전역·영구 거부.
     "B 상황에서 의도적으로 다시 쓰고 싶다"는 손으로 쓰면 된다 — veto 는 자동 얹기만 막는다. */
  test('1. 다른 memory·다른 서비스·다른 스타일에서 재등장해도 veto 유지(문구 identity)', () => {
    const { WM, E } = loadAll();
    WM.dismissText(E.normalizeText('시술후 관리법'));
    // 전혀 다른 기억(id·shopStyleId·배치 모두 다름)에 같은 문구
    const NOW = Date.now();
    global.localStorage._m['itdasy:work_memory:list'] = JSON.stringify([{
      id: 'other-mem', schema: 2, sig: 'other', name: 'B', createdAt: NOW, thumb: null,
      ratio: '4:5', layoutIdx: 7, photoCount: 2, layoutOrder: [], collageBg: null, collageGap: null, fitMode: null,
      layers: [{ type: 'sticker', emoji: '🌙', x: 0.8, y: 0.8, size: 0.1 }, noRole('시술후 관리법')],
      shopStyleId: 'ss-B', kind: 'service', applyCount: 0, lastAppliedAt: 0, publishCount: 1, lastPublishedAt: NOW,
    }]);
    global.localStorage._m['itdasy:work_memory:default'] = JSON.stringify('other-mem');
    const st = E.forEditor({ restore: false, incoming: [], photoCount: 2, layersOnly: true, service: '속눈썹', shopStyleId: 'ss-B' });
    expect(texts(st)).toHaveLength(0);                        // 다른 맥락이어도 자동 얹기는 차단
    expect(st.layers.some((l) => l.emoji === '🌙')).toBe(true);
  });
  test('2-a. 손으로 다시 써서 발행해도(관측 n 증가) dismissed 그대로 — 자동 해제 없음(의도된 영구 정책)', () => {
    const { WM, E } = loadAll();
    const k = E.normalizeText('시술후 관리법');
    WM.dismissText(k);
    publishWith(WM, ['시술후 관리법']); publishWith(WM, ['시술후 관리법']); publishWith(WM, ['시술후 관리법']);
    expect(WM.textbook()[k].st).toBe('dismissed');            // n 이 쌓여도 상태는 불변
    seedMemory(WM, [{ type: 'sticker', emoji: '✨', x: 0.2, y: 0.2, size: 0.1 }, noRole('시술후 관리법')]);
    expect(texts(apply(E))).toHaveLength(0);
  });
  test('2-b. veto 는 자동 얹기만 막는다 — 이번 글(원장 입력) 레이어는 절대 안 건드림', () => {
    const { WM, E } = loadAll();
    WM.dismissText(E.normalizeText('예약문의 DM'));
    seedMemory(WM, [{ type: 'sticker', emoji: '✨', x: 0.2, y: 0.2, size: 0.1 }]);
    const base = [{ type: 'text', text: '예약문의 DM', x: 0.5, y: 0.6, size: 0.05 }];   // 원장이 직접 쓴 상당
    const out = E.decorateLayers(base, { photoCount: 1 });
    expect(out.some((l) => l.text === '예약문의 DM')).toBe(true);   // base 는 sanitize 대상 아님
  });
});

describe('3경로 동일 + 디버깅 가능성', () => {
  test('편집기/헤드리스가 같은 sanitize 결과', () => {
    const { WM, E } = loadAll();
    seedMemory(WM, [{ type: 'sticker', emoji: '✨', x: 0.2, y: 0.2, size: 0.1 }, noRole('가을 느낌으로'), noRole('예약문의 DM')]);
    const ed = apply(E);
    const hl = E.decorateLayers([], { photoCount: 1 });
    const pick = (ls) => ls.filter((l) => l.type === 'text' && !l.role).map((l) => l.text).sort();
    expect(pick(ed.layers)).toEqual(pick(hl));
    expect(pick(ed.layers)).toEqual(['예약문의 DM']);
  });
  test('_lastSanitize — raw/norm/분류/사유가 남는다(왜 STATIC 이 됐는지 역추적)', () => {
    const { WM, E } = loadAll();
    seedMemory(WM, [{ type: 'sticker', emoji: '✨', x: 0.2, y: 0.2, size: 0.1 }, noRole('가을 느낌으로'), noRole('예약문의 DM'), noRole('8월 이벤트')]);
    apply(E);
    const s = E._lastSanitize;
    expect(s.kept.map((k) => k.raw)).toEqual(['예약문의 DM']);
    expect(s.kept[0].why).toBe('static-pattern');
    const whys = Object.fromEntries(s.dropped.map((d) => [d.raw, d.why]));
    expect(whys['가을 느낌으로']).toBe('unknown');
    expect(whys['8월 이벤트']).toBe('dynamic');
    expect(s.dropped.every((d) => typeof d.norm === 'string' && d.norm.length > 0)).toBe(true);
  });
  test('textbook 저장이 깨져 있어도(비 JSON) 안 죽고 보수적으로 동작', () => {
    const { WM, E } = loadAll();
    global.localStorage._m['itdasy:work_memory:textbook'] = '{{{broken';
    seedMemory(WM, [{ type: 'sticker', emoji: '✨', x: 0.2, y: 0.2, size: 0.1 }, noRole('가을 느낌으로')]);
    expect(() => apply(E)).not.toThrow();
    expect(texts(apply(E))).toHaveLength(0);                  // unknown 취급(보수적)
    expect(() => publishWith(WM, ['가을 느낌으로'])).not.toThrow();
  });
});

describe('flow 배선 — dismissed 감지(저장 완료 세션·부분 삭제만)', () => {
  const flowSrc = fs.readFileSync(path.join(__dirname, '..', 'workspace-v2-flow.js'), 'utf8');
  test('onDone 에서 적용 텍스트 대비 소실분을 dismissText 로 기록', () => {
    expect(flowSrc).toMatch(/_lastApply/);
    expect(flowSrc).toMatch(/dismissText/);
    // [계약 갱신 — 브라우저 실측이 잡은 결함] 텍스트 개수 비교(gone < texts.length)는 wm 문구가
    //   1개뿐일 때(흔함) 지워도 '전부 사라짐'이 되어 veto 가 영영 안 걸렸다.
    //   기준 = meta.wmKept(남은 wm 레이어 수, 스티커·선 포함): 0 = 자동화 거부 / 1+ = 문구 veto.
    expect(flowSrc).toMatch(/gone\.length && meta\.wmKept > 0/);
    const edSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'itd-editor', 'itd-editor.js'), 'utf8');
    expect(edSrc).toMatch(/meta\.wmKept = \(S\.layers \|\| \[\]\)\.filter/);
  });
  test("배너 '되돌리기'는 통째 빼기 표식(undone) — dismissed 오판 방지", () => {
    expect(flowSrc).toMatch(/\.undone = true/);
    expect(flowSrc).toMatch(/!ap\.undone/);
  });
});
