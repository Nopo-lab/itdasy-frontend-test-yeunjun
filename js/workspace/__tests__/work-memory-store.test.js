'use strict';

/* T8-B 골든 — 학습 저장소(격리·마이그레이션·멱등·복구). 구현보다 먼저 작성 (2026-08-19).

   🔴 보스/GPT 확정 계약: `_purgeUserScopedDB()` 가 계정 전환 때 DB 를 통째로 지운다고 해서
   tenant isolation 이 자동 완성됐다고 보지 않는다. **레코드 자체에 tenantId 를 넣고
   read/write 양쪽에서 현재 인증 tenant 와 일치하는지 검증**한다. purge 는 방어 계층 중 하나일 뿐.

   범위: 저장 · 격리 · 마이그레이션 · 멱등 · 복구 · retention 까지.
   ❌ T8-B 에서 scoreMemory / personalization bonus 는 건드리지 않는다(T8-C 이후). */

const fs = require('fs');
const path = require('path');

// IDB 가 없는 node 환경 — T6 에서 검증된 '주입 가능 백엔드' 패턴.
// 실제 IndexedDB 동작(v4→v5 업그레이드 포함)은 브라우저 실측으로 검증한다.
function memBackend() {
  const db = { preferences: new Map(), learning_signals: new Map(), preference_versions: new Map() };
  return {
    _db: db, _fail: false, _writes: 0,
    async put(store, rec) {
      if (this._fail) throw new Error('QuotaExceededError');
      this._writes++; db[store].set(rec.id, JSON.parse(JSON.stringify(rec))); return rec.id;
    },
    async get(store, id) { const v = db[store].get(id); return v ? JSON.parse(JSON.stringify(v)) : null; },
    async all(store) { return [...db[store].values()].map((v) => JSON.parse(JSON.stringify(v))); },
    async del(store, id) { db[store].delete(id); },
  };
}
function load(userId, backend) {
  global.window = {};
  global.location = { search: '' };
  const ls = {};
  global.localStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(ls, k) ? ls[k] : null; },
    setItem(k, v) { ls[k] = String(v); },
    removeItem(k) { delete ls[k]; },
  };
  if (userId !== undefined && userId !== null) global.localStorage.setItem('last_user_id', String(userId));
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(__dirname, '..', 'work-memory-store.js'), 'utf8'));
  const S = global.window.WMStore;
  if (backend) S._setBackend(backend);
  return S;
}
const OBS = (id, extra) => Object.assign({
  observationId: id, tenantId: '5', memoryId: 'm1', batch: true,
  context: { service: '젤네일', photoCount: 1, kind: 'service' },
  signals: [{ event: 'font_changed', layerKey: 'title', before: 'pretendard', after: 'jua', at: 1 }],
  outcome: 'published', startedAt: 1, endedAt: 2, baseline: [],
}, extra || {});

describe('[T8-B 1~3] tenant gate — write/read 양쪽 강제', () => {
  test('write: 레코드에 현재 인증 tenantId 가 박힌다', async () => {
    const b = memBackend(); const S = load(5, b);
    await S.putObservation(OBS('o1', { tenantId: null }));   // 호출자가 안 넣어도
    const rows = await b.all('learning_signals');
    expect(rows).toHaveLength(1);
    expect(rows[0].tenantId).toBe('5');                       // 저장소가 강제로 박음
  });
  test('🔴 write: 다른 tenant 를 사칭해도 현재 tenant 로 덮어쓴다', async () => {
    const b = memBackend(); const S = load(5, b);
    await S.putObservation(OBS('o1', { tenantId: '999' }));
    expect((await b.all('learning_signals'))[0].tenantId).toBe('5');
  });
  test('🔴 read: 다른 tenant 레코드는 반환하지 않는다(DB 에 남아 있어도)', async () => {
    const b = memBackend();
    // B 계정 레코드가 DB 에 섞여 있는 상황을 직접 주입
    await b.put('learning_signals', { id: 'x', tenantId: '9', observationId: 'x', signals: [] });
    const S = load(5, b);
    await S.putObservation(OBS('mine'));
    const got = await S.listObservations();
    expect(got).toHaveLength(1);
    expect(got[0].observationId).toBe('mine');
    expect(got.some((r) => r.tenantId === '9')).toBe(false);
  });
  test('preference / version 도 동일 게이트', async () => {
    const b = memBackend();
    await b.put('preferences', { id: 'p:9:font', tenantId: '9', feature: 'font', value: 'x' });
    await b.put('preference_versions', { id: 'v:9:1', tenantId: '9', version: 1 });
    const S = load(5, b);
    await S.putPreference({ feature: 'font', value: 'jua', context: { kind: 'service' } });
    expect(await S.listPreferences()).toHaveLength(1);
    expect((await S.listPreferences())[0].tenantId).toBe('5');
    await S.pushVersion([{ feature: 'font' }], 'test');
    expect(await S.listVersions()).toHaveLength(1);
  });
});

describe('[T8-B 4] tenant 없음/전환 중 → learning read/write 금지', () => {
  test('로그인 전(tenant 없음) → write 거부·read 빈 배열', async () => {
    const b = memBackend(); const S = load(null, b);
    expect(await S.putObservation(OBS('o1'))).toBeNull();
    expect(await b.all('learning_signals')).toHaveLength(0);
    expect(await S.listObservations()).toEqual([]);
    expect(await S.listPreferences()).toEqual([]);
  });
  test('전환 중(beginTenantSwitch) → 모든 learning I/O 차단', async () => {
    const b = memBackend(); const S = load(5, b);
    S.beginTenantSwitch();
    expect(S.isSwitching()).toBe(true);
    expect(await S.putObservation(OBS('during'))).toBeNull();
    expect(await S.listObservations()).toEqual([]);
    S.endTenantSwitch();
    expect(await S.putObservation(OBS('after'))).toBeTruthy();
  });
});

describe('[T8-B] 계정 전환 race — A 데이터가 B 로 새지 않는다', () => {
  test('A 저장 → 전환 → B 저장 → 각자 자기 것만 본다', async () => {
    const b = memBackend();
    const A = load(5, b);
    await A.putObservation(OBS('a1'));
    // 전환 시작 — 이 구간의 쓰기는 전부 거부돼야(race 방지)
    A.beginTenantSwitch();
    await A.putObservation(OBS('race'));
    A.endTenantSwitch();
    // B 로그인 (purge 없이 같은 DB 를 쓰는 최악 케이스 — DB 삭제에 의존하지 않는지 검증)
    const B = load(9, b);
    await B.putObservation(OBS('b1', { tenantId: '9' }));
    const bRows = await B.listObservations();
    expect(bRows.map((r) => r.observationId)).toEqual(['b1']);
    expect(bRows.every((r) => r.tenantId === '9')).toBe(true);
    // 다시 A 로그인 → A 것만
    const A2 = load(5, b);
    const aRows = await A2.listObservations();
    expect(aRows.map((r) => r.observationId)).toEqual(['a1']);
    expect(aRows.some((r) => r.observationId === 'race')).toBe(false);
  });
});

describe('[T8-B 6] 멱등 — 같은 observationId 는 중복 누적 안 됨', () => {
  test('동일 observation 3회 write → 레코드 1개', async () => {
    const b = memBackend(); const S = load(5, b);
    await S.putObservation(OBS('same'));
    await S.putObservation(OBS('same'));
    await S.putObservation(OBS('same'));
    expect(await b.all('learning_signals')).toHaveLength(1);
    expect(await S.listObservations()).toHaveLength(1);
  });
  test('reload(스토어 재생성) 후 재시도해도 중복 없음', async () => {
    const b = memBackend();
    await load(5, b).putObservation(OBS('same'));
    await load(5, b).putObservation(OBS('same'));   // 새 인스턴스 = reload 상당
    expect(await b.all('learning_signals')).toHaveLength(1);
  });
  test('다른 tenant 가 같은 observationId 를 써도 서로 안 덮어씀', async () => {
    const b = memBackend();
    await load(5, b).putObservation(OBS('dup'));
    await load(9, b).putObservation(OBS('dup', { tenantId: '9' }));
    expect(await b.all('learning_signals')).toHaveLength(2);   // tenant 별로 분리 저장
    expect(await load(5, b).listObservations()).toHaveLength(1);
    expect(await load(9, b).listObservations()).toHaveLength(1);
  });
});

describe('[T8-B 7] 저장 실패 복구 — 원본 보존 + 재시도', () => {
  test('quota 실패 → 예외 안 던지고 null, 기존 데이터 보존, 이후 재시도 성공', async () => {
    const b = memBackend(); const S = load(5, b);
    await S.putObservation(OBS('ok1'));
    b._fail = true;
    expect(await S.putObservation(OBS('willfail'))).toBeNull();   // 조용히 실패(세션 계속)
    expect(await b.all('learning_signals')).toHaveLength(1);      // 기존 보존
    b._fail = false;
    expect(await S.putObservation(OBS('retry'))).toBeTruthy();    // 재시도 가능
    expect(await b.all('learning_signals')).toHaveLength(2);
  });
  test('백엔드 자체가 없어도(IDB 미지원) 앱이 안 죽는다', async () => {
    const S = load(5, null);
    S._setBackend(null);
    expect(await S.putObservation(OBS('x'))).toBeNull();
    expect(await S.listObservations()).toEqual([]);
  });
});

describe('[T8-B] retention — raw signal 무한 누적 금지', () => {
  test('상한 초과 시 오래된 observation 부터 정리(tenant 별)', async () => {
    const b = memBackend(); const S = load(5, b);
    for (let i = 0; i < S.MAX_OBSERVATIONS + 20; i++) {
      await S.putObservation(OBS('o' + i, { endedAt: i }));
    }
    const rows = await S.listObservations();
    expect(rows.length).toBeLessThanOrEqual(S.MAX_OBSERVATIONS);
    // 최신이 남는다
    const ids = rows.map((r) => r.observationId);
    expect(ids).toContain('o' + (S.MAX_OBSERVATIONS + 19));
    expect(ids).not.toContain('o0');
  });
  test('정리는 내 tenant 것만 — 남의 레코드는 안 건드림', async () => {
    const b = memBackend();
    await b.put('learning_signals', { id: 'keep', tenantId: '9', observationId: 'keep', endedAt: 0, signals: [] });
    const S = load(5, b);
    for (let i = 0; i < S.MAX_OBSERVATIONS + 5; i++) await S.putObservation(OBS('m' + i, { endedAt: i }));
    const raw = await b.all('learning_signals');
    expect(raw.some((r) => r.observationId === 'keep')).toBe(true);
  });
  test('signal 개수 상한 — 한 observation 이 무한히 커지지 않는다', async () => {
    const b = memBackend(); const S = load(5, b);
    const many = []; for (let i = 0; i < 500; i++) many.push({ event: 'font_changed', layerKey: 't', at: i });
    await S.putObservation(OBS('big', { signals: many }));
    const got = (await S.listObservations())[0];
    expect(got.signals.length).toBeLessThanOrEqual(S.MAX_SIGNALS_PER_OBS);
  });
});

describe('[T8-B] preference version — rollback 가능', () => {
  test('버전 push → list → rollback 으로 이전 스냅샷 복구', async () => {
    const b = memBackend(); const S = load(5, b);
    await S.putPreference({ feature: 'font', value: 'jua', context: {} });
    const v1 = await S.pushVersion(await S.listPreferences(), 'before-change');
    await S.putPreference({ feature: 'font', value: 'gamja', context: {} });
    expect((await S.listPreferences()).some((p) => p.value === 'gamja')).toBe(true);
    const ok = await S.rollback(v1);
    expect(ok).toBe(true);
    const after = await S.listPreferences();
    expect(after.some((p) => p.value === 'jua')).toBe(true);
    expect(after.some((p) => p.value === 'gamja')).toBe(false);
  });
  test('남의 tenant 버전으로는 rollback 안 됨', async () => {
    const b = memBackend();
    await b.put('preference_versions', { id: 'v:9:1', tenantId: '9', version: 1, snapshot: [] });
    const S = load(5, b);
    expect(await S.rollback('v:9:1')).toBe(false);
  });
});

describe('[T8-B 개인정보] 저장 단계에서도 원문/바이트 미복제', () => {
  test('dataURL·긴 문자열이 섞여 들어와도 저장되지 않는다', async () => {
    const b = memBackend(); const S = load(5, b);
    await S.putObservation(OBS('p', {
      signals: [{ event: 'sticker_changed', layerKey: 's', after: 'data:image/png;base64,' + 'Q'.repeat(4000), assetRef: 'img:ok', at: 1 }],
    }));
    const json = JSON.stringify(await b.all('learning_signals'));
    expect(json).not.toContain('QQQQ');
    expect(json).toContain('img:ok');
  });
});

describe('[T8-B 마이그레이션] v7 소스 계약 (실 업그레이드는 브라우저 실측)', () => {
  const dbSrc = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'app-gallery-db.js'), 'utf8');
  // [Phase 1 2026-08-21] v5 → v6. 사진 문맥 캐시(photo_contexts) 추가.
  //   이 테스트가 버전을 고정하는 이유: store 추가는 되돌리기 어려운 변경이라
  //   "모르는 사이에 올라가는 것"을 막아야 한다. 올릴 땐 여기도 같이 올린다.
  // [IDB-1 2026-09-03] v6 → v7. `ig_text_analysis` 추가 — **이 가드가 의도대로 작동했다.**
  //   버전을 올리자 여기서 걸렸고, 그래서 '몰래 올라간 것' 이 아님을 사람이 확인하고 올린다.
  //   (원인: 인스타 텍스트 스타일 코드가 없는 store 를 써서 배포본에서 NotFoundError 반복)
  test('버전 7 + 신규 store 3종, 기존 store 로직 보존', () => {
    expect(dbSrc).toMatch(/indexedDB\.open\(_GDB_NAME, 7\)/);
    // 구현은 _LEARN_STORES 루프로 생성한다 — 목록에 3종이 있고 루프가 createObjectStore 를 부르는지 확인
    ['preferences', 'learning_signals', 'preference_versions'].forEach((s) => {
      expect(dbSrc).toMatch(new RegExp("_LEARN_STORES[\\s\\S]{0,200}'" + s + "'"));
    });
    expect(dbSrc).toMatch(/_LEARN_STORES\.forEach[\s\S]{0,200}createObjectStore\(name/);
    // 기존 3 store 생성/마이그레이션 분기 보존
    expect(dbSrc).toMatch(/contains\(_GDB_STORE\)/);
    expect(dbSrc).toMatch(/contains\(_GALLERY_STORE\)/);
    expect(dbSrc).toMatch(/contains\(_ASSET_STORE\)/);
    expect(dbSrc).toMatch(/customer_id/);
    // v5→v6: photo_contexts 는 **추가만** — 기존 store 생성 분기를 건드리지 않는다(위 assert 로 보장)
    expect(dbSrc).toMatch(/_PCTX_STORE\s*=\s*'photo_contexts'/);
    expect(dbSrc).toMatch(/contains\(_PCTX_STORE\)[\s\S]{0,120}createObjectStore\(_PCTX_STORE/);
  });
  test('T7 멀티탭 데드락 수정(onversionchange) 유지', () => {
    expect(dbSrc).toMatch(/_gdb\.onversionchange/);
  });
});

describe('[T8-B 범위 제한] T3 미개입', () => {
  /* ⚠️ migration note (2026-08-20, T8-E): 원래 단언은
       "scoreMemory 에 personalization 축이 아직 없다" 였다. T8-B 의 범위가
     "T3 미개입" 이었기 때문이고, 그때는 옳았다.
     T8-E 에서 bounded 가산 축으로 **의도적으로** 연결했으므로 그 단언은 수명을 다했다.
     의미를 지우지 않고 **이 단계가 실제로 지키려던 것**으로 바꾼다:
       T8-B 가 기존 6축의 가중치·범위를 바꾸지 않았는가.
     E 의 계약(상한 15·역전 금지·설명가능)은 work-memory-persona.test.js 가 잠근다. */
  test('scoreMemory 의 기존 6축 가중치·범위는 그대로다', () => {
    const eng = fs.readFileSync(path.join(__dirname, '..', 'work-memory-engine.js'), 'utf8');
    expect(eng).toMatch(/photoFit:.*\? 40 : 0/);
    expect(eng).toMatch(/baFit:.*\? 25 : 0/);
    expect(eng).toMatch(/parts\.kindFit = 15/);
    expect(eng).toMatch(/parts\.kindFit = -30/);
    expect(eng).toMatch(/Math\.min\(20, 20 - days \* 2\)/);
  });
});
