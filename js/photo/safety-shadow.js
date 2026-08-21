/* safety-shadow.js — [Phase 5 Shadow A] 텍스트가 피사체를 가리는지 **재기만** 한다.
 *
 * ⚠️ **화면 반영 0. 자동 이동 0. 학습 0.** 이 파일은 배치를 바꾸지 않는다.
 *    `applied: false` 가 로그에 항상 박혀 나가고, 테스트가 소비처 0을 감시한다.
 *
 * [왜 Safety 를 개인화보다 먼저 하나]
 *   Phase 4(Replay)는 "원장이 뭘 고를지" 를 맞히는 문제라 **정답 데이터**가 필요하다.
 *   지금 실사용 원장이 1명이라 못 돈다(INSUFFICIENT).
 *   그런데 "텍스트가 피사체를 덮는가" 는 **정답이 필요 없다** — 기하만 보면 판정된다.
 *   그래서 데이터가 적은 지금 검증할 수 있는 유일한 축이다.
 *
 * [두 질문을 절대 섞지 않는다]
 *   Detection : 지금 결과가 위험한가?            → 현재 편집물만 보면 답이 나온다
 *   Candidate : 안전한 대체 위치를 계산할 수 있나? → 계산만 하고 **쓰지 않는다**
 *
 * [size × 1.6 근사를 버렸다]
 *   기존 겹침 추정은 폰트 크기로 박스 높이를 추정했다. 과대인지 과소인지도 모르는 값으로
 *   자동 판단을 하면 안 된다. 이제 `ItdEditor.metaGeometry()` 의 **실제 렌더 rect** 를 쓴다.
 *   회전 레이어는 getBoundingClientRect 가 회전 후 AABB 를 주므로 실제 글자 박스보다 크다 —
 *   겹침 판정에선 **과대검출**이라 안전한 방향이다(놓치는 것보다 낫다).
 *
 * 공개: window.SafetyShadow.detect(geoms, pctx) → detection
 *       window.SafetyShadow.candidates(geom, pctx, opts) → candidate[]
 *       window.SafetyShadow.analyze(geoms, pctx) → shadow 로그 1건
 */
(function () {
  'use strict';
  if (window.SafetyShadow) return;

  var SCHEMA = 'shadowA-v1';

  /* 임계값 — **확정이 아니다.** production baseline 이 쌓이면 그 분포로 다시 정한다.
     지금 값은 "명백한 것만 잡는다" 수준으로 보수적으로 둔다. */
  var TH = {
    subjectConfidence: 0.45,   // 이보다 낮으면 "가려졌다"고 강하게 말하지 않는다
    unsafeOverlap: 0.15,       // 텍스트 면적의 15% 이상이 피사체와 겹치면 위험 후보
    improveDelta: 0.10,        // 후보가 이만큼은 낮춰야 의미 있는 대안
    minSideForText: 0.18,      // 텍스트가 들어갈 최소 폭(정규화) — 이보다 좁으면 잘린다
    edgePad: 0.03,             // 캔버스 가장자리 여백
    /* 회전 허용 오차(도). 실측: AABB 과대율 15°→2.21배 · 45°→3.42배.
       이 밖은 rect 를 못 믿으므로 주 판정에서 뺀다. */
    rotToleranceDeg: 5
  };

  function _inter(a, b) {
    var x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    var y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return x * y;
  }
  function _area(r) { return Math.max(0, r.w) * Math.max(0, r.h); }

  /* 하나의 숫자로 합치지 않는다(§8) — 의미가 다른 비율들이다.
     layerCovered  : 텍스트가 얼마나 먹혔나 (읽기 어려움)
     subjectCovered: 피사체가 얼마나 가려졌나 (사진을 망침)
     둘은 다른 문제고, 어느 쪽이 큰지에 따라 대응도 다르다. */
  function _pair(layer, subject) {
    var inter = _inter(layer, subject);
    var la = _area(layer), sa = _area(subject);
    return {
      intersection: Math.round(inter * 10000) / 10000,
      layerCoveredRatio: la ? Math.round(inter / la * 1000) / 1000 : null,
      subjectCoveredRatio: sa ? Math.round(inter / sa * 1000) / 1000 : null,
      iou: (la + sa - inter) > 0 ? Math.round(inter / (la + sa - inter) * 1000) / 1000 : null,
      distance: inter > 0 ? 0 : Math.round(_gap(layer, subject) * 1000) / 1000
    };
  }
  // 겹치지 않을 때의 최단 거리(축별 갭의 유클리드)
  function _gap(a, b) {
    var dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
    var dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* Detection — 지금 편집 결과가 위험한가. 자유 텍스트만 본다(§16).
     role 있는 자동 레이어는 `_applySafeZone` 이 이미 비켜주고, 이번에 발견된 문제는
     **원장이 직접 놓은 텍스트를 아무도 안 지킨다**는 것이다. */
  function detect(geoms, pctx) {
    var subject = pctx && pctx.subjectRegion;
    var conf = (pctx && typeof pctx.confidence === 'number') ? pctx.confidence : 0;
    var free = (geoms || []).filter(function (g) {
      return g && (g.type === 'text' || g.type === 'badge') && g.origin === 'user';
    });
    var out = {
      schema: SCHEMA,
      subjectKnown: !!subject,
      subjectConfidence: Math.round(conf * 100) / 100,
      // 🔑 신뢰도가 낮으면 "가려졌다"고 단정하지 않는다(§10) — 값은 내되 판정은 보류
      verdictReliable: !!subject && conf >= TH.subjectConfidence,
      freeTextCount: free.length,
      layers: [],
      worstLayerCovered: null,
      anyUnsafe: false,
      rotatedCount: 0,              // 회전이라 판정 보류한 수 (R13 — 실사용 빈도 미측정)
      anyUnsafeRotatedOnly: false   // 회전 레이어에서만 위험 — 주 판정과 분리
    };
    if (!subject || !free.length) return out;

    free.forEach(function (g) {
      var m = _pair(g, subject);
      var unsafe = (m.layerCoveredRatio != null && m.layerCoveredRatio >= TH.unsafeOverlap);
      /* 🔴 회전 레이어는 rect 를 못 믿는다 — **실측**: getBoundingClientRect 의 AABB 가
         실제 글자 박스 대비 15° 에서 2.21배, 45° 에서 3.42배 크다.
         과대검출이라 안전한 방향이긴 하지만, 3.4배를 조용히 받아들이면
         "위험" 판정이 부풀고 baseline 이 통째로 왜곡된다.
         → 값은 그대로 내되 **신뢰 불가로 표시**하고, 주 판정과 후보 대상에서 뺀다.
         회전이 실사용에서 얼마나 흔한지는 아직 못 쟀다(R13). 흔하면 OBB 가 필요하다. */
      var reliable = Math.abs(g.rot || 0) < TH.rotToleranceDeg;
      out.layers.push({
        idx: g.idx, rot: g.rot, metrics: m, unsafe: unsafe,
        geometryReliable: reliable,
        geometryNote: reliable ? null : 'aabb_overestimates_rotated'
      });
      if (reliable) {
        if (out.worstLayerCovered == null || m.layerCoveredRatio > out.worstLayerCovered) {
          out.worstLayerCovered = m.layerCoveredRatio;
        }
        if (unsafe) out.anyUnsafe = true;
      } else {
        out.rotatedCount++;
        if (unsafe) out.anyUnsafeRotatedOnly = true;   // 별도 집계 — 주 판정에 섞지 않는다
      }
    });
    return out;
  }

  /* Candidate — 안전한 대체 위치. **취향·Grammar 를 쓰지 않는다**(§14).
     순수 기하만: 피사체를 피하고, 캔버스 밖으로 안 나가고, 텍스트가 안 잘리는 자리. */
  var ANCHORS = [
    ['upper-left', 0.5, 0.5], ['upper-center', 1.5, 0.5], ['upper-right', 2.5, 0.5],
    ['middle-left', 0.5, 1.5], ['middle-right', 2.5, 1.5],
    ['lower-left', 0.5, 2.5], ['lower-center', 1.5, 2.5], ['lower-right', 2.5, 2.5]
  ];

  function candidates(geom, pctx) {
    var subject = pctx && pctx.subjectRegion;
    if (!geom || !subject) return [];
    var w = geom.w, h = geom.h;
    if (!(w > 0 && h > 0)) return [];
    var out = [];
    ANCHORS.forEach(function (a) {
      // 3×3 구역 중심에 같은 크기 박스를 놓아본다
      var cx = a[1] / 3, cy = a[2] / 3;
      var r = { x: cx - w / 2, y: cy - h / 2, w: w, h: h };
      // 캔버스 안으로 밀어넣기(클램프) — 밀어넣어도 안 들어가면 무효
      r.x = Math.max(TH.edgePad, Math.min(1 - TH.edgePad - w, r.x));
      r.y = Math.max(TH.edgePad, Math.min(1 - TH.edgePad - h, r.y));
      var fits = (w <= 1 - 2 * TH.edgePad) && (h <= 1 - 2 * TH.edgePad) && (w >= TH.minSideForText || w >= geom.w);
      var m = _pair(r, subject);
      out.push({
        anchor: a[0], rect: r, metrics: m,
        valid: fits,
        invalidReason: fits ? null : 'clipped'
      });
    });
    return out;
  }

  /* Shadow 로그 1건 — 이게 Phase 5 의 산출물이다.
     🔴 `wouldImprove` 같은 자기채점은 만들지 않는다(§19). 새 엔진이 "내가 낫다"고 적은 로그는
        증거가 아니다. **기하 수치만** 남기고, 개선 여부는 실제 rollout 이 판정한다. */
  function analyze(geoms, pctx) {
    var d = detect(geoms, pctx);
    var log = {
      schema: SCHEMA,
      photoContextKnown: d.subjectKnown,
      subjectConfidence: d.subjectConfidence,
      verdictReliable: d.verdictReliable,
      freeTextCount: d.freeTextCount,
      currentWorstCovered: d.worstLayerCovered,
      currentUnsafe: d.anyUnsafe,
      candidateAvailable: false,
      candidateAnchor: null,
      candidateCovered: null,
      overlapDelta: null,
      reason: null,
      source: 'local',
      applied: false            // 🔒 이 값은 Phase 5 내내 false 다
    };

    /* 🔑 "지금도 안전하면 아무것도 하지 않는다"(§21).
       PhotoContext 가 있다고 후보를 항상 만들 이유가 없다. 개입은 필요할 때만. */
    if (!d.subjectKnown) { log.reason = 'subject_unknown'; return log; }
    if (!d.verdictReliable) { log.reason = 'low_confidence'; return log; }
    if (!d.anyUnsafe) { log.reason = 'already_safe'; return log; }

    // 가장 많이 가려진 자유 텍스트 하나만 후보를 본다(1순위 문제부터)
    var worst = d.layers.filter(function (l) { return l.unsafe && l.geometryReliable; })
      .sort(function (a, b) { return b.metrics.layerCoveredRatio - a.metrics.layerCoveredRatio; })[0];
    var geom = (geoms || []).filter(function (g) { return g.idx === worst.idx; })[0];
    if (!geom) { log.reason = 'geometry_missing'; return log; }

    var cs = candidates(geom, pctx).filter(function (c) { return c.valid; });
    if (!cs.length) { log.reason = 'no_valid_candidate'; return log; }

    var best = cs.sort(function (a, b) {
      var d1 = a.metrics.layerCoveredRatio - b.metrics.layerCoveredRatio;
      if (Math.abs(d1) > 0.001) return d1;
      return b.metrics.distance - a.metrics.distance;   // 동률이면 피사체에서 먼 쪽
    })[0];

    var cur = worst.metrics.layerCoveredRatio;
    var delta = Math.round((cur - best.metrics.layerCoveredRatio) * 1000) / 1000;
    log.candidateAnchor = best.anchor;
    log.candidateCovered = best.metrics.layerCoveredRatio;
    log.overlapDelta = delta;

    /* 후보가 현재보다 의미 있게 낫지 않으면 후보가 아니다(§20).
       "제일 멀리" 가 아니라 "실제로 덜 가리면서 안 잘리는 자리" 여야 한다. */
    if (delta < TH.improveDelta) { log.reason = 'no_meaningful_gain'; return log; }
    log.candidateAvailable = true;
    log.reason = 'candidate_found';
    return log;
  }

  window.SafetyShadow = {
    SCHEMA: SCHEMA, TH: TH,
    detect: detect, candidates: candidates, analyze: analyze
    // wouldImprove 는 **의도적으로 없다**(§19)
  };
})();
