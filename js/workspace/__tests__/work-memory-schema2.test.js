'use strict';

/* T2 schema 2 골든 테스트 — 구현보다 먼저 작성해 변환 규칙·불변조건을 고정한다 (2026-08-17).

   schema 2 = **평면 유지 + 필드 추가(additive)**. layout/deco 중첩안은 기존 소비자·테스트가
   잠근 계약(rec.layers·rec.ratio)을 전부 깨므로 기각 — 소유권 분리는 저장 모양이 아니라
   쓰기 규칙(캡처 시점에만 씀 + toEditState layersOnly 게이트, work-memory-layout.test.js가 잠금)이 지킨다.

   시나리오 명명은 보스/GPT 합의안 A~O 를 따른다. 이 앱 현실에 안 맞는 항목은
   해당 테스트 주석에 왜 다르게 매핑했는지 적었다.
   원칙: **기존 테스트(capture·layout) 무수정** — 이 파일은 추가 계약만 잠근다. */

const fs = require('fs');
const path = require('path');

function makeLS() {
  return {
    _m: {}, _writes: 0, _failNext: false,
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._m, k) ? this._m[k] : null; },
    setItem(k, v) {
      if (this._failNext) throw new Error('quota');   // [O] 저장 실패 시뮬레이션
      this._writes++; this._m[k] = String(v);
    },
    removeItem(k) { delete this._m[k]; },
  };
}
function loadAll(flagOn) {
  global.window = {};
  global.window.ITDASY_WORK_MEMORY = flagOn !== false;
  global.location = { search: '' };
  global.localStorage = makeLS();
  for (const f of ['work-memory.js', 'work-memory-engine.js']) {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
  }
  return { WM: global.window.WorkMemory, E: global.window.WorkMemoryEngine, LS: global.localStorage };
}

// ── schema 1 픽스처 — 실제 구버전 captureFromSlot 이 만들던 모양 그대로 ──
function s1rec(i, over) {
  return Object.assign({
    id: 'old' + i, schema: 1,
    sig: i + '|4:5|text:title:' + i,   // 구 알고리즘 sig — 마이그레이션이 v2 로 재계산해야 함
    name: '옛 기억 ' + i, createdAt: 1000 + i, lastUsedAt: 2000 + i, useCount: 3 + i, thumb: 'th' + i,
    ratio: '4:5', layoutIdx: i % 8, layoutOrder: [], collageBg: null, collageGap: null, fitMode: null,
    layers: [{ type: 'text', role: 'title', text: '문구' + i, x: 0.1 + i * 0.05, y: 0.2, size: 0.05, align: 'left' }],
  }, over || {});
}
function seedS1(LS, n, defId) {
  const arr = []; for (let i = 0; i < n; i++) arr.push(s1rec(i));
  LS._m['itdasy:work_memory:list'] = JSON.stringify(arr);
  if (defId) LS._m['itdasy:work_memory:default'] = JSON.stringify(defId);
  return arr;
}
// 캡처용 슬롯 (편집기 _exportState 형태)
function slot(layers, opts) {
  opts = opts || {};
  return { id: opts.id || 's', service: opts.service || '젤네일',
    photos: [{ editState: { v: 1, layoutIdx: opts.layoutIdx || 0, ratio: '4:5', layoutOrder: [], cellCrop: [], adj: [], photoDraw: {}, photoBg: {}, photos: ['x'], layers } }] };
}
const T = (over) => Object.assign({ type: 'text', role: 'title', x: 0.5, y: 0.2, size: 0.06, align: 'center', text: '글' }, over || {});

describe('[A/I] schema 1 → 2 변환 — semantic equality', () => {
  test('identity·이름·썸네일·layers·레이아웃 필드 보존 + 카운터 승계', () => {
    const { WM, LS } = loadAll();
    const orig = seedS1(LS, 3, 'old1');
    const out = WM.list();
    expect(out).toHaveLength(3);
    out.forEach((m, i) => {
      const o = orig[i];
      expect(m.id).toBe(o.id);
      expect(m.schema).toBe(2);
      expect(m.name).toBe(o.name);
      expect(m.thumb).toBe(o.thumb);
      expect(m.layers).toEqual(o.layers);          // 꾸밈은 바이트 단위 보존
      expect(m.layoutIdx).toBe(o.layoutIdx);
      expect(m.ratio).toBe(o.ratio);
      expect(m.publishCount).toBe(o.useCount);     // 옛 useCount → 발행 카운트 승계
      expect(m.lastPublishedAt).toBe(o.lastUsedAt);
      expect(m.applyCount).toBe(0);                // 실제 적용 이력은 모름 → 보수적 0
      expect(m.photoCount).toBeGreaterThanOrEqual(1);   // 저장 시점 확정 필드 신설
      expect(m.useCount).toBe(o.useCount);         // 구 필드는 지우지 않는다(롤백 호환)
    });
    expect(WM.getDefaultId()).toBe('old1');        // ★ 보존
  });
  test('sig 는 v2(색·폰트 포함) 알고리즘으로 재계산된다', () => {
    const { WM, LS } = loadAll();
    seedS1(LS, 1);
    const m = WM.list()[0];
    expect(m.sig).not.toBe('0|4:5|text:title:0');
    expect(m.sig).toBe(WM._sig(m));                // 신규 캡처와 같은 산식 = dedup 일치
  });
});

describe('[B] 구버전 기억 10개 생존', () => {
  test('10개 전부 + ★ + toEditState 소비 가능', () => {
    const { WM, LS } = loadAll();
    seedS1(LS, 10, 'old7');
    const out = WM.list();
    expect(out).toHaveLength(10);
    expect(WM.getDefaultId()).toBe('old7');
    const st = WM.toEditState(WM.getDefault(), { incoming: [{ role: 'title', text: '이번 글' }], photoCount: 1, layersOnly: true });
    expect(st).toBeTruthy();
    expect(st.layers.find((l) => l.role === 'title').text).toBe('이번 글');
  });
});

describe('[C] 멱등 — 몇 번 읽어도 결과 불변·재저장 1회', () => {
  test('두 번째 list() 는 쓰기 0회, 결과 동일', () => {
    const { WM, LS } = loadAll();
    seedS1(LS, 5);
    const first = WM.list();
    const writesAfterFirst = LS._writes;           // 승격 재저장 포함
    const second = WM.list();
    expect(LS._writes).toBe(writesAfterFirst);     // 더 안 씀
    expect(second).toEqual(first);
  });
});

describe('[D/E] 캡처 후 불변 — 이름/카운터 조작이 꾸밈·칸 배치를 못 건드린다', () => {
  // GPT 원안은 "layout 수정↔deco 수정 상호 불변"이지만 이 앱엔 캡처 후 layout/deco 를
  // 수정하는 API 자체가 없다(불변이 설계). 존재하는 변이 API(rename·markApplied·markPublished)가
  // 꾸밈·칸 배치를 안 건드리는 것으로 잠근다.
  test('rename / markApplied / markPublished 후 layers·layoutIdx·ratio 불변', () => {
    const { WM } = loadAll();
    const rec = WM.captureFromSlot(slot([T()]), {});
    const snap = JSON.stringify({ layers: rec.layers, layoutIdx: rec.layoutIdx, ratio: rec.ratio, photoCount: rec.photoCount });
    WM.rename(rec.id, '새 이름');
    WM.markApplied(rec.id);
    WM.markPublished(rec.id);
    const after = WM.get(rec.id);
    expect(JSON.stringify({ layers: after.layers, layoutIdx: after.layoutIdx, ratio: after.ratio, photoCount: after.photoCount })).toBe(snap);
    expect(after.name).toBe('새 이름');
    expect(after.applyCount).toBe(1);
    expect(after.publishCount).toBe(2);            // 캡처 1 + markPublished 1
  });
});

describe('[F/G] ★(favorite)와 auto 게이트 분리', () => {
  // ★ 저장 키는 :default 를 그대로 쓴다(개명은 순수 위험) — 그 자체가 호환 경로.
  // auto 는 T3 select() 의 ON/OFF 게이트로 :auto 신설, 기본 ON. 타입부터 다르다(id 문자열 vs boolean).
  test('★는 id, auto 는 boolean — 서로 오염 불가 + auto 기본 ON', () => {
    const { WM } = loadAll();
    const rec = WM.captureFromSlot(slot([T()]), {});
    expect(WM.getDefaultId()).toBe(rec.id);        // 첫 기억 자동 ★ (기존 동작 유지)
    expect(WM.autoOn()).toBe(true);                // 기본 ON
    WM.setAutoOn(false);
    expect(WM.autoOn()).toBe(false);
    expect(WM.getDefaultId()).toBe(rec.id);        // auto 조작이 ★를 안 건드림
    WM.setAutoOn(true);
    expect(WM.autoOn()).toBe(true);
  });
});

describe('[H] 필드 누락 schema 1 — 기본값 채우고 나머지 보존', () => {
  test('layoutIdx·useCount·createdAt 없어도 layers 는 산다', () => {
    const { WM, LS } = loadAll();
    LS._m['itdasy:work_memory:list'] = JSON.stringify([{ id: 'bare', layers: [T()] }]);
    const m = WM.list()[0];
    expect(m.schema).toBe(2);
    expect(m.layers).toHaveLength(1);
    expect(m.publishCount).toBe(1);                // useCount 없음 → 1
    expect(m.photoCount).toBe(1);                  // layoutIdx 없음 → single
    expect(WM.toEditState(m, { incoming: [{ role: 'title', text: '이번 글' }], photoCount: 1 })).toBeTruthy();
  });
});

describe('[J] 3경로 동일 — 헤드리스 / 편집기 / 잇비가 같은 꾸밈을 얹는다', () => {
  test('같은 입력 → 같은 layers', () => {
    const { WM, E } = loadAll();
    WM.captureFromSlot(slot([T(), { type: 'sticker', emoji: '✨', x: 0.2, y: 0.2, size: 0.1 }]), {});
    const opts = { incoming: [{ role: 'title', text: '이번 글' }], photoCount: 1, layersOnly: true };
    const headless = WM.defaultEditState(opts);
    const editor = E.forEditor({ restore: false, incoming: opts.incoming, photoCount: 1, layersOnly: true });
    const orch = E.forEditor({ restore: false, orch: { useRecentStyle: true }, incoming: opts.incoming, photoCount: 1, layersOnly: true });
    // [T4 갱신] 편집기 경로엔 되돌리기용 런타임 태그(_src/_wmTok)가 붙는다 — 계약은 '같은 꾸밈'이지
    //   런타임 메타가 아니므로 태그를 벗기고 비교한다(태그 자체는 work-memory-apply-undo.test.js 가 잠금).
    const strip = (ls) => ls.map(({ _src, _wmTok, ...rest }) => rest);
    expect(JSON.stringify(strip(editor.layers))).toBe(JSON.stringify(headless.layers));
    expect(JSON.stringify(strip(orch.layers))).toBe(JSON.stringify(headless.layers));
  });
});

describe('[K/L/M] 삭제·재캡처·중복 조작과 카운터', () => {
  test('[K] remove 가 다른 기억의 카운터를 안 건드린다', () => {
    const { WM } = loadAll();
    const a = WM.captureFromSlot(slot([T()]), {});
    const b = WM.captureFromSlot(slot([T({ x: 0.1, y: 0.9 })]), {});
    WM.markPublished(a.id);
    const aPub = WM.get(a.id).publishCount;
    WM.remove(b.id);
    expect(WM.get(a.id).publishCount).toBe(aPub);
  });
  test('[L] 삭제 후 같은 작업 재캡처 → 유령 카운터 없이 1부터', () => {
    const { WM } = loadAll();
    const a = WM.captureFromSlot(slot([T()]), {});
    WM.markPublished(a.id);
    WM.remove(a.id);
    const again = WM.captureFromSlot(slot([T()]), {});
    expect(again.id).not.toBe(a.id);
    expect(again.publishCount).toBe(1);
  });
  test("[M] '이 스타일로 또'(publish:false) 재클릭 → 카운터 불변", () => {
    const { WM } = loadAll();
    const a = WM.captureFromSlot(slot([T()]), {});                    // 발행 캡처 = 1
    const r1 = WM.captureFromSlot(slot([T()]), null, { publish: false });
    const r2 = WM.captureFromSlot(slot([T()]), null, { publish: false });
    expect(r1.id).toBe(a.id);
    expect(r2.id).toBe(a.id);
    expect(WM.get(a.id).publishCount).toBe(1);                        // 재클릭이 발행으로 안 잡힘
  });
});

describe('[N] 전환기 혼재 — 옛 탭이 schema 1 을 계속 써넣어도 무손실', () => {
  test('마이그레이션 뒤 끼어든 schema 1 레코드도 다음 read 에서 승격', () => {
    const { WM, LS } = loadAll();
    seedS1(LS, 3, 'old0');
    WM.list();                                     // 승격 저장
    const raw = JSON.parse(LS._m['itdasy:work_memory:list']);
    raw.push(s1rec(99));                           // 옛 코드 탭이 append 한 상황
    LS._m['itdasy:work_memory:list'] = JSON.stringify(raw);
    const out = WM.list();
    expect(out).toHaveLength(4);
    expect(out.every((r) => r.schema === 2)).toBe(true);
    expect(out.filter((r) => r.id === 'old99')).toHaveLength(1);
    expect(WM.getDefaultId()).toBe('old0');
  });
});

describe('[O] 마이그레이션 저장 실패 — 원본 보존 + 다음 read 재시도', () => {
  test('quota 로 재저장 실패해도 반환은 정상, 스토리지는 원본 유지, 복구 후 재시도 성공', () => {
    const { WM, LS } = loadAll();
    seedS1(LS, 3);
    LS._failNext = true;                           // 승격 재저장이 실패하게
    const out = WM.list();
    expect(out).toHaveLength(3);                   // 읽기는 정상(메모리 내 승격)
    expect(out.every((r) => r.schema === 2)).toBe(true);
    expect(JSON.parse(LS._m['itdasy:work_memory:list'])[0].schema).toBe(1);   // 원본 그대로
    LS._failNext = false;
    WM.list();                                     // 재시도
    expect(JSON.parse(LS._m['itdasy:work_memory:list'])[0].schema).toBe(2);
  });
});

describe("[T2'] 카운터 의미 — 헤드리스는 세지 않는다", () => {
  test('defaultEditState(캡션 미리보기) 5회 왕복 → 카운터 0 증가', () => {
    const { WM } = loadAll();
    const rec = WM.captureFromSlot(slot([T()]), {});
    for (let i = 0; i < 5; i++) WM.defaultEditState({ incoming: [], photoCount: 1, layersOnly: true });
    const after = WM.get(rec.id);
    expect(after.applyCount).toBe(0);
    expect(after.publishCount).toBe(1);
  });
  test('편집기 경로(엔진 forEditor)만 applyCount 를 올린다', () => {
    const { WM, E } = loadAll();
    // role 텍스트만 있으면 incoming:[] 일 때 toEditState 가 전부 드롭해 null(기존 동작) → 스티커 포함 픽스처.
    const rec = WM.captureFromSlot(slot([T(), { type: 'sticker', emoji: '✨', x: 0.2, y: 0.2, size: 0.1 }]), {});
    E.forEditor({ restore: false, incoming: [], photoCount: 1 });
    expect(WM.get(rec.id).applyCount).toBe(1);
    expect(WM.get(rec.id).publishCount).toBe(1);   // 발행은 안 올라감
  });
  test('dedup 재캡처(저장/발행) → publishCount++ + 롤백 미러(useCount)도 같이', () => {
    const { WM } = loadAll();
    const a = WM.captureFromSlot(slot([T()]), {});
    const b = WM.captureFromSlot(slot([T({ text: '다른 글자' })]), {});   // 같은 배치·다른 글자 = 같은 작업
    expect(b.id).toBe(a.id);
    expect(WM.get(a.id).publishCount).toBe(2);
    expect(WM.get(a.id).useCount).toBe(2);         // 옛 코드 탭 롤백 호환 미러
  });
});

describe("[T2] applyOnce — '이 스타일로 또'가 ★를 덮어쓰지 않는다", () => {
  test('헤드리스는 피크(소비 안 함) → 편집기가 소비 → 다음 글부터 ★ 복귀', () => {
    const { WM, E } = loadAll();
    const a = WM.captureFromSlot(slot([T(), { type: 'sticker', emoji: '✨', x: 0.2, y: 0.2, size: 0.1 }]), {});   // 첫 기억 = ★
    const b = WM.captureFromSlot(slot([{ type: 'sticker', emoji: '🌙', x: 0.8, y: 0.8, size: 0.1 }]), {});
    expect(WM.getDefaultId()).toBe(a.id);          // ★는 그대로 a
    expect(WM.applyOnce(b.id)).toBe(true);
    expect(WM.getDefaultId()).toBe(a.id);          // applyOnce 가 ★를 안 바꿈 (구 setDefault 와 결정적 차이)
    const peek = WM.defaultEditState({ incoming: [], photoCount: 1, layersOnly: true });
    expect(peek.layers.some((l) => l.emoji === '🌙')).toBe(true);          // 미리보기도 b (피크)
    const ed1 = E.forEditor({ restore: false, incoming: [], photoCount: 1, layersOnly: true });
    expect(ed1.layers.some((l) => l.emoji === '🌙')).toBe(true);           // 편집기 = b (소비)
    expect(E._lastSelect.via).toBe('once');
    // [T3 갱신] 소비 후엔 '강제'가 풀리고 자동 선택으로 돌아간다(★ 복귀가 아니라 상황 스코어).
    //   어느 기억이 뽑히는지는 스코어 소관 — 여기선 once 가 더는 강제되지 않음만 잠근다.
    const ed2 = E.forEditor({ restore: false, incoming: [], photoCount: 1, layersOnly: true });
    expect(ed2).toBeTruthy();
    expect(E._lastSelect.via).toBe('auto');                                // once 아님 = 1회 강제 종료
    expect(WM.getDefaultId()).toBe(a.id);                                  // ★는 끝까지 a
  });
});

describe('[T2·Q6 1차] sig v2 — 색·폰트·굵기가 다르면 다른 작업', () => {
  test('자리 같고 색만 달라도 새 기억으로 쌓인다 (G1 수정)', () => {
    const { WM } = loadAll();
    WM.captureFromSlot(slot([T({ color: '#ffffff' })]), {});
    WM.captureFromSlot(slot([T({ color: '#e53935' })]), {});
    WM.captureFromSlot(slot([T({ color: '#e53935', font: 'gamja' })]), {});
    expect(WM.list()).toHaveLength(3);
    WM.captureFromSlot(slot([T({ color: '#e53935', font: 'gamja' })]), {});   // 완전 동일 → dedup
    expect(WM.list()).toHaveLength(3);
  });
});
