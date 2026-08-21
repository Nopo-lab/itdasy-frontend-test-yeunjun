/* Sync 병합 규칙 **설계 검증** — 구현 아님, 계약을 미리 잠그는 참조 구현.
 *
 * [왜 구현 전에 테스트를 쓰나]
 *   앞선 설계에서 `obsIds 합집합` 으로 병합하려다 틀렸다는 걸 코드를 다시 읽고서야 알았다
 *   (`obsIds` 는 slice(-20) 로 잘린다 → 이미 반영된 증거를 재계산하는 조용한 이중계산).
 *   같은 실수를 또 하지 않으려면 **규칙 자체를 실행 가능한 형태로** 고정해야 한다.
 *   실사용 preference 가 쌓이면 이 파일의 함수를 서버로 옮겨 구현한다.
 *
 * ⚠️ 이 파일은 앱 코드가 아니다. 어떤 런타임 경로도 이걸 부르지 않는다.
 */

/* ── 참조 구현 ────────────────────────────────────────────────
   preference 는 "최종 상태"가 아니라 **증거의 누적**이다.
   그래서 기기끼리 값을 덮어쓰지 않고, 각자 자기 칸만 쓰고 읽을 때 합산한다. */
function mergeDeviceCounter(serverRec, incoming) {
  const rec = serverRec ? JSON.parse(JSON.stringify(serverRec)) : { byDevice: {} };
  const d = incoming.deviceId;
  if (!d) return rec;                                  // 귀속 불가 → 버린다(추론 금지)
  const cur = rec.byDevice[d];

  /* 단조 증가 보장 — 늦게 도착한 옛 요청이 최신 값을 되돌리면 안 된다.
     sampleCount 를 기준으로 삼는 이유: 이 기기가 처리한 관측 수라 **절대 줄지 않는다**.
     positive/negative 는 decay 로 줄 수 있어 기준이 될 수 없다. */
  if (cur && incoming.sampleCount < cur.sampleCount) return rec;   // stale → 무시

  rec.byDevice[d] = {
    positive: incoming.positive,
    negative: incoming.negative,
    sampleCount: incoming.sampleCount,
    publishCount: incoming.publishCount,
    updatedAt: incoming.updatedAt
  };
  return rec;
}

function aggregate(rec) {
  const out = { positive: 0, negative: 0, sampleCount: 0, publishCount: 0, devices: 0 };
  for (const d of Object.keys(rec.byDevice || {}).sort()) {   // 정렬 = 결정론
    const v = rec.byDevice[d];
    out.positive += v.positive; out.negative += v.negative;
    out.sampleCount += v.sampleCount; out.publishCount += v.publishCount;
    out.devices++;
  }
  return out;
}

/* veto 는 카운터가 아니라 **명시적 거부**다 → 합집합.
   해제는 원장의 명시적 행동(unvetoedAt)으로만. LWW 로 되살아나면 안 된다. */
function mergeVeto(serverSet, incomingSet) {
  const out = JSON.parse(JSON.stringify(serverSet || {}));
  for (const k of Object.keys(incomingSet || {})) {
    const inc = incomingSet[k], cur = out[k];
    if (!cur) { out[k] = inc; continue; }
    // 거부는 합집합, 해제는 **더 최근의 명시적 해제만** 이긴다
    const curActive = !cur.unvetoedAt || cur.unvetoedAt < cur.vetoedAt;
    const incActive = !inc.unvetoedAt || inc.unvetoedAt < inc.vetoedAt;
    if (curActive && incActive) { out[k] = { ...cur, vetoedAt: Math.max(cur.vetoedAt, inc.vetoedAt) }; continue; }
    if (curActive && !incActive) { out[k] = inc.unvetoedAt > cur.vetoedAt ? inc : cur; continue; }
    if (!curActive && incActive) { out[k] = inc.vetoedAt > cur.unvetoedAt ? inc : cur; continue; }
    out[k] = (inc.unvetoedAt > cur.unvetoedAt) ? inc : cur;
  }
  return out;
}
function vetoActive(v) { return !!v && (!v.unvetoedAt || v.unvetoedAt < v.vetoedAt); }

// ── 테스트 ───────────────────────────────────────────────────
const DEV_A = 'dev_a1b2', DEV_B = 'dev_c3d4';

describe('[Sync 설계] preference — 기기별 카운터', () => {
  test('A 가 B 를 덮지 않고, B 도 A 를 덮지 않는다', () => {
    let rec = mergeDeviceCounter(null, { deviceId: DEV_A, positive: 7, negative: 1, sampleCount: 8, publishCount: 5, updatedAt: 100 });
    rec = mergeDeviceCounter(rec, { deviceId: DEV_B, positive: 4, negative: 0, sampleCount: 4, publishCount: 3, updatedAt: 101 });
    const agg = aggregate(rec);
    expect(agg.positive).toBe(11);        // 7 + 4 — 어느 쪽도 사라지지 않는다
    expect(agg.sampleCount).toBe(12);
    expect(agg.devices).toBe(2);
  });

  test('같은 기기의 재전송은 이중 계산되지 않는다 (멱등)', () => {
    const msg = { deviceId: DEV_A, positive: 7, negative: 1, sampleCount: 8, publishCount: 5, updatedAt: 100 };
    let rec = mergeDeviceCounter(null, msg);
    rec = mergeDeviceCounter(rec, msg);
    rec = mergeDeviceCounter(rec, msg);
    expect(aggregate(rec).positive).toBe(7);   // 절대값 대입이라 몇 번 보내도 같다
  });

  test('늦게 도착한 옛 요청이 최신 값을 되돌리지 못한다 (§15·§16)', () => {
    // Request A(count 8) → Request B(count 9) → Request A 재시도(count 8)
    let rec = mergeDeviceCounter(null, { deviceId: DEV_A, positive: 6, negative: 0, sampleCount: 8, publishCount: 4, updatedAt: 100 });
    rec = mergeDeviceCounter(rec, { deviceId: DEV_A, positive: 7, negative: 0, sampleCount: 9, publishCount: 5, updatedAt: 101 });
    rec = mergeDeviceCounter(rec, { deviceId: DEV_A, positive: 6, negative: 0, sampleCount: 8, publishCount: 4, updatedAt: 100 });
    expect(rec.byDevice[DEV_A].sampleCount).toBe(9);
    expect(aggregate(rec).positive).toBe(7);
  });

  test('같은 카운터 재전송은 결과를 바꾸지 않는다', () => {
    let rec = mergeDeviceCounter(null, { deviceId: DEV_A, positive: 5, negative: 1, sampleCount: 6, publishCount: 3, updatedAt: 100 });
    const before = JSON.stringify(rec);
    rec = mergeDeviceCounter(rec, { deviceId: DEV_A, positive: 5, negative: 1, sampleCount: 6, publishCount: 3, updatedAt: 100 });
    expect(JSON.stringify(rec)).toBe(before);
  });

  test('멀티탭 — 같은 기기의 동시 쓰기가 카운터를 망가뜨리지 않는다', () => {
    /* 두 탭이 같은 deviceId 로 서로 다른 시점 스냅샷을 보낸다.
       절대값 대입 + 단조 가드라 "더 많이 관측한 쪽"이 남는다 — 덧셈이면 이중계산이 됐을 것이다. */
    let rec = mergeDeviceCounter(null, { deviceId: DEV_A, positive: 3, negative: 0, sampleCount: 3, publishCount: 2, updatedAt: 100 });
    rec = mergeDeviceCounter(rec, { deviceId: DEV_A, positive: 5, negative: 1, sampleCount: 6, publishCount: 3, updatedAt: 102 });
    rec = mergeDeviceCounter(rec, { deviceId: DEV_A, positive: 4, negative: 0, sampleCount: 4, publishCount: 2, updatedAt: 101 });  // 늦게 온 옛 탭
    expect(rec.byDevice[DEV_A].sampleCount).toBe(6);
    expect(aggregate(rec).positive).toBe(5);
  });

  test('기기 초기화 후 새 deviceId 는 새 칸을 얻는다 (틀리지 않고 갈릴 뿐)', () => {
    let rec = mergeDeviceCounter(null, { deviceId: DEV_A, positive: 7, negative: 1, sampleCount: 8, publishCount: 5, updatedAt: 100 });
    rec = mergeDeviceCounter(rec, { deviceId: 'dev_new', positive: 2, negative: 0, sampleCount: 2, publishCount: 1, updatedAt: 200 });
    expect(aggregate(rec).positive).toBe(9);     // 옛 증거가 사라지지 않는다
    expect(aggregate(rec).devices).toBe(2);
  });

  test('deviceId 가 없으면 버린다 (귀속 못 하면 추론하지 않는다)', () => {
    const rec = mergeDeviceCounter(null, { positive: 9, negative: 0, sampleCount: 9, publishCount: 9, updatedAt: 1 });
    expect(aggregate(rec).devices).toBe(0);
  });

  test('집계는 결정적이다 — 기기 등록 순서와 무관', () => {
    const a = { deviceId: DEV_A, positive: 7, negative: 1, sampleCount: 8, publishCount: 5, updatedAt: 100 };
    const b = { deviceId: DEV_B, positive: 4, negative: 2, sampleCount: 6, publishCount: 3, updatedAt: 101 };
    const r1 = mergeDeviceCounter(mergeDeviceCounter(null, a), b);
    const r2 = mergeDeviceCounter(mergeDeviceCounter(null, b), a);
    expect(aggregate(r1)).toEqual(aggregate(r2));
  });
});

describe('[Sync 설계] veto — 합집합 + 명시적 해제', () => {
  test('한 기기에서 거부하면 다른 기기의 미거부가 되살리지 못한다', () => {
    const server = { 'sticker:sparkle': { vetoedAt: 100 } };
    const merged = mergeVeto(server, {});                    // B 기기엔 그 veto 가 없다
    expect(vetoActive(merged['sticker:sparkle'])).toBe(true);
  });

  test('명시적 해제가 거부보다 나중이면 해제된다', () => {
    const server = { 'font:jua': { vetoedAt: 100 } };
    const merged = mergeVeto(server, { 'font:jua': { vetoedAt: 100, unvetoedAt: 200 } });
    expect(vetoActive(merged['font:jua'])).toBe(false);
  });

  test('해제 뒤 다시 거부하면 거부가 이긴다', () => {
    const server = { 'font:jua': { vetoedAt: 100, unvetoedAt: 200 } };
    const merged = mergeVeto(server, { 'font:jua': { vetoedAt: 300 } });
    expect(vetoActive(merged['font:jua'])).toBe(true);
  });

  test('단순 LWW 였다면 부활했을 상황에서 부활하지 않는다', () => {
    // B 기기의 낡은 "거부 없음" 상태가 나중에 도착 — LWW 면 veto 가 사라진다
    const server = { 'sticker:heart': { vetoedAt: 500 } };
    const merged = mergeVeto(server, { 'sticker:heart': { vetoedAt: 100 } });
    expect(vetoActive(merged['sticker:heart'])).toBe(true);
    expect(merged['sticker:heart'].vetoedAt).toBe(500);
  });
});

describe('[Sync 설계] 폐기된 방식은 다시 쓰지 않는다', () => {
  test('obsIds 합집합은 병합 근거가 될 수 없다 (20개로 잘림)', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', '..',
      'js/workspace/work-memory-preferences.js'), 'utf8');
    // 이 줄이 살아 있는 한 obsIds 는 전체 이력이 아니다
    expect(src).toMatch(/p\.obsIds = p\.obsIds\.concat\(o\.observationId\)\.slice\(-MAX_EVIDENCE\)/);
    expect(src).toMatch(/MAX_EVIDENCE = 20/);
  });
});
