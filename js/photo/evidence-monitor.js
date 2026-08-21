/* evidence-monitor.js — [Phase 5.5] 증거가 얼마나 모였고 **얼마나 더 필요한지** 계산한다.
 *
 * ⚠️ 판정과 안내만 한다. 자동 편집을 켜지 않는다. 새 저장소도 만들지 않는다 —
 *    `WMMetrics.report()` 와 `SafetyGate.judge()` 를 **조합만** 한다.
 *
 * [왜 필요한가]
 *   "데이터가 쌓이면 판정한다" 고 해왔는데, **얼마나 쌓여야 하는지를 아무도 몰랐다.**
 *   게이트마다 분모가 다르기 때문이다:
 *
 *     subjectKnownRate    분모 = 관측 수            → 20건이면 판정 가능
 *     rotationExcludedRate 분모 = 자유 텍스트 수     → 비슷
 *     reliableUnsafeRate  분모 = 피사체를 안 관측    → 그보다 큼
 *     candidateAvailableRate 분모 = **위험 사례 수**  → ★ 여기가 병목
 *
 *   위험률이 10% 라면 위험 사례 20건을 모으는 데 관측 **200건**이 필요하다.
 *   이걸 모르면 "곧 되겠지" 하고 막연히 기다리거나, 반대로 부족한 표본에서 성급히 판정한다.
 *   그래서 **각 게이트가 필요로 하는 관측 수를 현재 비율로 역산**해서 알려준다.
 *
 * [Replay 게이트는 여기서 판정하지 않는다]
 *   Replay 는 서버의 `edit_state`(원장 수·holdout)가 필요하다 — 브라우저는 그걸 모른다.
 *   Safety 와 표본을 **공유하지 않는다**(§6). 그래서 여기서는 `UNKNOWN` 으로 두고,
 *   서버 스크립트(`replay_layout_prediction.py`)가 자기 표본으로 따로 판정한다.
 *
 * 공개: window.EvidenceMonitor.status() → { safety, replay, nextAction, needed }
 */
(function () {
  'use strict';
  if (window.EvidenceMonitor) return;

  /* 게이트별 최소 표본 — **분모가 무엇인지** 를 같이 적어둔다.
     이 대응이 틀리면 "20건 모였다" 는 말이 게이트마다 다른 뜻이 된다. */
  var NEED = {
    A_subject_known: { metric: 'subjectKnownRate', denom: 'observations', min: 20 },
    B_rotation_ok: { metric: 'rotationExcludedRate', denom: 'eligibleTextLayers', min: 20 },
    C_problem_exists: { metric: 'reliableUnsafeRate', denom: 'subjectKnown', min: 20 },
    D_candidate_exists: { metric: 'candidateAvailableRate', denom: 'reliableUnsafe', min: 20 },
    E_candidate_better: { metric: 'medianOverlapDelta', denom: 'candidateFound', min: 10 }
  };

  function _n(m) { return (m && typeof m.sampleCount === 'number') ? m.sampleCount : 0; }

  /* 현재 비율로 **관측 몇 건이 더 필요한지** 역산한다.
     비율을 모르면(표본 0) 역산도 불가능하다 — 그때는 추정하지 않고 UNKNOWN 이라고 말한다.
     (없는 근거로 "곧 됩니다" 라고 하는 게 이 프로젝트에서 가장 피해야 할 종류의 말이다) */
  function _project(sf, obs) {
    var out = {};
    var chain = [
      ['A_subject_known', _n(sf.subjectKnownRate), 20],
      ['B_rotation_ok', _n(sf.rotationExcludedRate), 20],
      ['C_problem_exists', _n(sf.reliableUnsafeRate), 20],
      ['D_candidate_exists', _n(sf.candidateAvailableRate), 20],
      ['E_candidate_better', _n(sf.medianOverlapDelta), 10]
    ];
    chain.forEach(function (row) {
      var id = row[0], have = row[1], min = row[2];
      if (have >= min) { out[id] = { have: have, min: min, status: 'READY', moreObservations: 0 }; return; }
      if (!obs || !have) {
        // 이 게이트의 분모가 관측 대비 몇 %인지 모른다 → 역산 불가
        out[id] = { have: have, min: min, status: have ? 'INSUFFICIENT' : 'NO_DATA', moreObservations: null };
        return;
      }
      var ratePerObs = have / obs;                       // 관측 1건당 이 분모가 늘어나는 양
      var needObs = Math.ceil((min - have) / ratePerObs);
      out[id] = { have: have, min: min, status: 'INSUFFICIENT', moreObservations: needObs };
    });
    return out;
  }

  function status() {
    var rep = null;
    try { rep = (window.WMMetrics && window.WMMetrics.report) ? window.WMMetrics.report() : null; }
    catch (_e) { void _e; }
    if (!rep || !rep.safety) return { error: 'metrics_unavailable' };

    var sf = rep.safety;
    var obs = (sf.observations && sf.observations.value) || 0;
    var gate = null;
    try { gate = (window.SafetyGate) ? window.SafetyGate.judge(rep) : null; } catch (_e) { void _e; }

    var needed = _project(sf, obs);
    /* 병목 = 가장 많은 추가 관측을 요구하는 게이트.
       전체 대기 시간은 평균이 아니라 **최댓값**이 정한다. */
    var bottleneck = null, worst = -1;
    Object.keys(needed).forEach(function (k) {
      var v = needed[k].moreObservations;
      if (v != null && v > worst) { worst = v; bottleneck = k; }
    });

    var out = {
      source: rep.source,
      observations: obs,
      /* 🔴 숫자만 보고 판단하지 못하게 게이트별 상태를 **나란히** 낸다(§14).
         "가림률 3%" 한 줄만 보면 GO 라고 오독한다. */
      safety: {
        verdict: gate ? gate.verdict : 'UNKNOWN',
        gates: gate ? gate.gates.map(function (g) {
          return { id: g.id, question: g.question, value: g.value, status: g.status, note: g.note };
        }) : [],
        blockers: gate ? gate.blockers : []
      },
      /* Replay 는 서버 데이터가 필요하다 — 브라우저는 모른다. 추측하지 않는다. */
      replay: {
        verdict: 'UNKNOWN',
        reason: 'server_side_only',
        howToCheck: 'backend: scripts/replay_layout_prediction.py (원장 ≥3 · holdout ≥20)'
      },
      needed: needed,
      bottleneck: bottleneck ? { gate: bottleneck, moreObservations: worst } : null
    };

    out.nextAction = (function () {
      if (rep.source !== 'production') return 'COLLECT_PRODUCTION_EVIDENCE';
      if (!gate) return 'COLLECT_PRODUCTION_EVIDENCE';
      if (gate.verdict === 'INSUFFICIENT') return 'COLLECT_PRODUCTION_EVIDENCE';
      if (gate.verdict === 'STOP') return 'PHASE_6_PERSONALIZATION_PRIORITY';
      if (gate.verdict === 'PIVOT') {
        var f = gate.gates.filter(function (g) { return g.status === 'FAIL'; }).map(function (g) { return g.id; });
        if (f.indexOf('B_rotation_ok') >= 0) return 'PHASE_5_OBB_CONNECT_EVALUATION';
        if (f.indexOf('D_candidate_exists') >= 0) return 'PHASE_5_SAFE_AREA_STRATEGY';
        return 'PHASE_5_SAFETY_CALIBRATION';
      }
      return 'PHASE_5_SAFETY_CONTROLLED_ROLLOUT';
    })();
    return out;
  }

  /* 사람이 읽는 한 줄 — 대기 중이면 **얼마나 더** 인지까지 말한다. */
  function summary() {
    var s = status();
    if (s.error) return '지표 없음';
    if (s.source !== 'production') return 'source=' + s.source + ' — production 증거 아님 (판정 불가)';
    if (s.bottleneck && s.bottleneck.moreObservations) {
      return '관측 ' + s.observations + '건 · 병목=' + s.bottleneck.gate +
        ' · 약 ' + s.bottleneck.moreObservations + '건 더 필요';
    }
    return '관측 ' + s.observations + '건 · Safety=' + s.safety.verdict + ' · 다음=' + s.nextAction;
  }

  window.EvidenceMonitor = { NEED: NEED, status: status, summary: summary };
})();
