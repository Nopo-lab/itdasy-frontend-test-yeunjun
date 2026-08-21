/* safety-gate.js — [Phase 5.2] Safety 지표를 읽어 Gate 를 **객관적으로** 판정한다.
 *
 * ⚠️ 판정만 한다. 어떤 자동화도 켜지 않는다. 이 파일은 배치를 바꾸지 않는다.
 *
 * [왜 코드로 판정하나]
 *   숫자를 사람이 눈으로 보고 "괜찮아 보인다" 로 넘기면, 표본이 적을 때마다 낙관 쪽으로 기운다.
 *   이 프로젝트에서 이미 두 번 그럴 뻔했다 — Phase 0 의 'center 75%'(표본 1명)와
 *   Phase 1 의 겹침 0.5(합성 2건). 그래서 **통과 조건을 미리 코드에 박아두고**
 *   데이터가 그걸 넘는지 기계가 답하게 한다.
 *
 * [가장 중요한 규칙] 표본이 모자라면 FAIL 이 아니라 **INSUFFICIENT** 다.
 *   "데이터가 없다" 와 "가설이 틀렸다" 는 완전히 다른 결론인데, 섞으면
 *   멀쩡한 방향을 조기에 폐기하거나 반대로 없는 근거로 자동화를 켜게 된다.
 *
 * 공개: window.SafetyGate.judge(report) → { verdict, gates[], blockers[] }
 */
(function () {
  'use strict';
  if (window.SafetyGate) return;

  /* 통과 기준 — **잠정값이다.** production 분포를 보고 다시 정한다.
     지금 확정할 수 없는 이유: 실사용 baseline 이 아직 0 이라 무엇이 '정상'인지 모른다. */
  var MIN_OBS = 20;              // Gate 판정 최소 관측 수
  var TH = {
    subjectKnownRate: 0.50,      // 이보다 낮으면 Safety 자체가 대부분 무력(R16)
    rotationExcluded: 0.30,      // 이보다 높으면 AABB 로는 부족 → OBB 필요(R13)
    candidateAvailable: 0.50,    // 위험한 경우 중 절반은 대안이 있어야 의미가 있다
    medianDelta: 0.15,           // 후보가 겹침을 이만큼은 낮춰야 한다
    /* 🔴 문제가 **실재해야** 기능을 만들 이유가 있다.
       처음엔 Gate C 를 "값만 있으면 통과" 로 뒀다가 QA 에서 잡혔다:
       위험률 1% 인데도 GO/rollout 준비가 나왔다 — 아무도 안 겪는 문제에 자동화를 켜라는 판정이다.
       낮은 위험률은 **좋은 소식이지 통과 근거가 아니다.** */
    problemExists: 0.05
  };

  function _v(m) { return (m && m.status === 'OK') ? m.value : null; }
  function _n(m) { return (m && typeof m.sampleCount === 'number') ? m.sampleCount : 0; }

  function _gate(id, question, value, pass, note) {
    return {
      id: id, question: question,
      value: value,
      status: value == null ? 'INSUFFICIENT' : (pass ? 'PASS' : 'FAIL'),
      note: note || null
    };
  }

  function judge(report) {
    var out = { verdict: 'INSUFFICIENT', source: null, observations: 0, gates: [], blockers: [] };
    if (!report || !report.safety) { out.blockers.push('report_missing'); return out; }
    var s = report.safety;
    out.source = report.source || 'unknown';
    out.observations = _v(s.observations) || 0;

    /* 🔴 production 이 아닌 데이터로 Gate 를 통과시키지 않는다.
       합성·테스트계정 숫자는 알고리즘 검증용이지 제품 근거가 아니다. */
    if (out.source !== 'production') {
      out.blockers.push('source_not_production:' + out.source);
    }
    if (out.observations < MIN_OBS) {
      out.blockers.push('insufficient_observations:' + out.observations + '/' + MIN_OBS);
    }

    var known = _v(s.subjectKnownRate);
    var rotEx = _v(s.rotationExcludedRate);
    var unsafe = _v(s.reliableUnsafeRate);
    var cand = _v(s.candidateAvailableRate);
    var delta = _v(s.medianOverlapDelta);

    out.gates = [
      // A — 잴 수 있는가 (이게 낮으면 나머지가 의미 없다)
      _gate('A_subject_known', '피사체를 인식한 비율', known,
        known != null && known >= TH.subjectKnownRate,
        known != null && known < TH.subjectKnownRate ? 'PhotoContext 가 대부분 피사체를 못 찾음 → Safety 무력(R16)' : null),

      // B — 기하를 믿을 수 있는가
      _gate('B_rotation_ok', '회전으로 판정 제외된 비율', rotEx,
        rotEx != null && rotEx <= TH.rotationExcluded,
        rotEx != null && rotEx > TH.rotationExcluded ? 'AABB 과대(15°→2.21배) 표본이 큼 → OBB 필요(R13)' : null),

      /* C — 문제가 실재하는가.
         ⚠️ 여기서 FAIL 은 "구현이 틀렸다" 가 아니라 **"만들 이유가 없다"** 는 뜻이다.
            원장들이 이미 텍스트를 잘 피해서 놓고 있다면 그건 좋은 소식이고,
            우리는 Safety 대신 다른 데(개인화)에 시간을 써야 한다. */
      _gate('C_problem_exists', '실제로 피사체를 가린 비율', unsafe,
        unsafe != null && unsafe >= TH.problemExists,
        unsafe != null && unsafe < TH.problemExists
          ? '위험이 거의 없음(' + Math.round(unsafe * 100) + '%) → Safety 자동화의 제품 가치가 낮다' : null),

      // D — 대안이 있는가
      _gate('D_candidate_exists', '위험한 경우 중 대안을 찾은 비율', cand,
        cand != null && cand >= TH.candidateAvailable,
        cand != null && cand < TH.candidateAvailable ? '안전한 자리를 못 찾음 → safe-area 전략 개선 필요' : null),

      // E — 대안이 실제로 나은가
      _gate('E_candidate_better', '후보가 낮춘 겹침(중앙값)', delta,
        delta != null && delta >= TH.medianDelta,
        delta != null && delta < TH.medianDelta ? '후보가 의미 있게 낫지 않음 → 전략 pivot' : null)
    ];

    var decided = out.gates.filter(function (g) { return g.status !== 'INSUFFICIENT'; });
    var failed = out.gates.filter(function (g) { return g.status === 'FAIL'; });

    if (out.blockers.length || decided.length < out.gates.length) {
      out.verdict = 'INSUFFICIENT';        // 표본 부족은 FAIL 이 아니다
    } else if (failed.length === 0) {
      out.verdict = 'GO';                  // controlled rollout **후보**일 뿐, 적용은 별도 승인
    } else {
      /* C 만 실패 = 문제가 실재하지 않음 → 기능을 만들 이유가 없다(STOP 이 정직하다).
         나머지 실패 = 접근을 바꾸면 될 수 있다(PIVOT). */
      var onlyC = failed.length === 1 && failed[0].id === 'C_problem_exists';
      out.verdict = onlyC ? 'STOP' : 'PIVOT';
    }

    /* §28 다음 단계 자동 선택 — 판정에 근거를 붙인다 */
    out.nextAction = (function () {
      if (out.verdict === 'INSUFFICIENT') return 'keep_observing';
      if (out.verdict === 'STOP') return 'safety_not_valuable_pivot_to_personalization';
      var g = function (id) { return out.gates.filter(function (x) { return x.id === id; })[0]; };
      if (g('B_rotation_ok').status === 'FAIL') return 'implement_obb_geometry';
      if (g('D_candidate_exists').status === 'FAIL') return 'improve_safe_area_strategy';
      if (g('E_candidate_better').status === 'FAIL') return 'pivot_safety_strategy';
      return 'prepare_controlled_rollout';
    })();
    return out;
  }

  window.SafetyGate = { MIN_OBS: MIN_OBS, TH: TH, judge: judge };
})();
