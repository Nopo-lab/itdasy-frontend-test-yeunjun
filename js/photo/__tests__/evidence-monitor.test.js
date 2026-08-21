/* [Phase 5.5] 증거 모니터 계약 — 게이트별 요구량을 정직하게 계산하는가 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const emSrc = fs.readFileSync(path.join(ROOT, 'js/photo/evidence-monitor.js'), 'utf8');
const gateSrc = fs.readFileSync(path.join(ROOT, 'js/photo/safety-gate.js'), 'utf8');

function load(report) {
  const w = {};
  new Function('window', gateSrc)(w);
  w.WMMetrics = { report: () => report };
  new Function('window', emSrc)(w);
  return w.EvidenceMonitor;
}
const M = (v, n) => ({ value: v, sampleCount: n, status: v == null ? 'NO_DATA' : 'OK' });
const mk = (src, obs, o) => ({ source: src, safety: Object.assign({
  observations: M(obs, obs), subjectKnownRate: M(0.9, obs), rotationExcludedRate: M(0.05, obs),
  reliableUnsafeRate: M(0.1, obs), candidateAvailableRate: M(null, Math.round(obs * 0.1)),
  medianOverlapDelta: M(null, Math.round(obs * 0.1)) }, o) });

describe('[Phase 5.5] 얼마나 더 필요한지 역산한다', () => {
  test('게이트마다 분모가 달라 요구 관측 수가 다르다', () => {
    // 위험률 10% → 위험 사례가 분모인 게이트는 10배 더 걸린다
    const s = load(mk('production', 30, {})).status();
    expect(s.needed.A_subject_known.status).toBe('READY');       // 분모=관측 30 ≥ 20
    expect(s.needed.D_candidate_exists.status).toBe('INSUFFICIENT'); // 분모=위험 3
    expect(s.needed.D_candidate_exists.moreObservations).toBeGreaterThan(100);
  });

  test('병목은 가장 많이 필요한 게이트다 (평균이 아니라 최댓값)', () => {
    const s = load(mk('production', 30, {})).status();
    expect(s.bottleneck.gate).toBe('D_candidate_exists');
  });

  test('비율을 모르면 추정하지 않는다 — 없는 근거로 "곧 됩니다" 금지', () => {
    const s = load(mk('production', 0, {})).status();
    expect(s.needed.D_candidate_exists.status).toBe('NO_DATA');
    expect(s.needed.D_candidate_exists.moreObservations).toBeNull();
  });

  test('production 이 아니면 판정하지 않는다', () => {
    const s = load(mk('test_account', 500, {})).status();
    expect(s.nextAction).toBe('COLLECT_PRODUCTION_EVIDENCE');
  });

  test('Replay 게이트는 Safety 와 표본을 공유하지 않는다 (§6)', () => {
    const s = load(mk('production', 500, {})).status();
    expect(s.replay.verdict).toBe('UNKNOWN');
    expect(s.replay.reason).toBe('server_side_only');
  });

  test('게이트별 상태를 나란히 낸다 — 한 숫자로 판단 못 하게 (§14)', () => {
    const s = load(mk('production', 30, {})).status();
    expect(s.safety.gates.length).toBe(5);
    s.safety.gates.forEach((g) => { expect(g).toHaveProperty('status'); expect(g).toHaveProperty('question'); });
  });

  test('NEXT_ACTION 을 기계가 읽을 수 있게 낸다 (§15)', () => {
    const s = load(mk('production', 30, {})).status();
    expect(typeof s.nextAction).toBe('string');
    expect(s.nextAction).toMatch(/^[A-Z0-9_]+$/);
  });

  test('새 저장소를 만들지 않는다 — 기존 리포트 조합만', () => {
    expect(emSrc).not.toMatch(/localStorage\.setItem|wmLearnPut|indexedDB/);
  });

  test('자동화를 켜지 않는다', () => {
    expect(emSrc).not.toMatch(/applied\s*=\s*true|\.apply\(|setLayer/);
  });
});
