/* edit-plan-shadow.js — Phase 2 준비. **계산만 한다. 화면 반영 0%.**
 *
 * ⚠️ 이 파일은 지금 **어디에서도 호출되지 않는다.** 인터페이스와 판정 규칙만 미리 세워두는 것이
 *    목적이고, 실제 호출은 Phase 2 진입 게이트(§32)를 통과한 뒤에 붙인다.
 *
 * [Shadow A 와 B 를 절대 섞지 않는다]  ← 이게 이 파일의 존재 이유다
 *   A(Safety)  : "PhotoContext 를 쓰면 **잘못된 배치**(피사체 겹침)를 줄일 수 있는가"
 *                → 정답이 필요 없다. 기하학만 보면 판정된다. **지금 당장 측정 가능.**
 *   B(Personalization): "WorkMemory/Grammar 가 원장이 **실제로 고르는 결과**를 더 잘 맞히는가"
 *                → 정답(원장의 최종 편집)이 필요하다. **실사용 데이터가 쌓여야 측정 가능.**
 *   두 질문은 필요한 데이터도, 성공 기준도, 성숙 시점도 다르다. 한 점수로 합치면
 *   "안전해졌지만 덜 맞는" 변경과 "맞지만 덜 안전한" 변경을 구분할 수 없게 된다.
 *
 * [wouldImprove 를 기록하지 않는 이유]
 *   자기채점이기 때문이다. 새 엔진이 "내가 더 낫다" 고 적은 로그는 증거가 아니다.
 *   개선 여부는 ① retrospective replay(과거 holdout 예측) ② 실제 rollout 지표
 *   두 가지로만 판단한다. 이 파일은 **차이(diff)만** 기록한다.
 *
 * 공개: window.EditPlanShadow.compareSafety(...) · .comparePersonalization(...) · .SCHEMA
 */
(function () {
  'use strict';
  if (window.EditPlanShadow) return;

  var SCHEMA = 'shadow-v1';

  function _rect(L) {
    // metaLayers 형식: 정규화 **중심** 좌표 + 폭. 높이는 폰트 크기로 보수 추정.
    //   과대추정하면 겹침이 실제보다 많이 잡혀 새 엔진이 유리해 보인다 — 그러면 안 된다.
    var w = (typeof L.w === 'number' && L.w > 0) ? L.w : 0.3;
    var h = Math.min(0.25, ((typeof L.size === 'number' && L.size > 0) ? L.size : 0.06) * 1.6);
    return { x: L.x - w / 2, y: L.y - h / 2, w: w, h: h };
  }
  function _overlaps(a, b) {
    return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  }
  function _area(r) { return Math.max(0, r.w) * Math.max(0, r.h); }
  function _interArea(a, b) {
    var x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    var y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return x * y;
  }
  function _outOfFrame(r) {
    return r.x < -0.02 || r.y < -0.02 || r.x + r.w > 1.02 || r.y + r.h > 1.02;
  }

  /* ── Shadow A — Safety ─────────────────────────────────────
     existing / proposed = metaLayers 형식 배열. pctx = PhotoContext(또는 null).
     반환은 **사실만** — 어느 쪽이 낫다는 판단을 담지 않는다. */
  function compareSafety(existing, proposed, pctx) {
    var out = {
      schema: SCHEMA, kind: 'A',
      subjectKnown: !!(pctx && pctx.subjectRegion),
      existing: { overlapCount: 0, overlapArea: 0, outOfFrame: 0, n: 0 },
      proposed: { overlapCount: 0, overlapArea: 0, outOfFrame: 0, n: 0 },
      wouldMove: 0, wouldChange: 0, wouldDelete: 0, wouldOverlap: null
    };
    var sr = (pctx && pctx.subjectRegion) || null;

    function scan(list, acc) {
      (list || []).forEach(function (L) {
        if (!L || L.type !== 'text') return;      // 자유 텍스트만 — 자동 role 은 safe-zone 소관
        acc.n++;
        var r = _rect(L);
        if (_outOfFrame(r)) acc.outOfFrame++;
        if (sr && _overlaps(r, sr)) {
          acc.overlapCount++;
          acc.overlapArea += _interArea(r, sr) / Math.max(1e-6, _area(r));
        }
      });
      acc.overlapArea = Math.round(acc.overlapArea * 1000) / 1000;
    }
    scan(existing, out.existing);
    scan(proposed, out.proposed);

    // 위치·스타일 변화량 — 같은 인덱스끼리 비교(레이어 매칭 규칙은 Phase 2 에서 정교화).
    var a = (existing || []).filter(function (L) { return L && L.type === 'text'; });
    var b = (proposed || []).filter(function (L) { return L && L.type === 'text'; });
    var n = Math.min(a.length, b.length);
    for (var i = 0; i < n; i++) {
      var dx = Math.abs((a[i].x || 0) - (b[i].x || 0));
      var dy = Math.abs((a[i].y || 0) - (b[i].y || 0));
      if (dx > 0.02 || dy > 0.02) out.wouldMove++;
      if (a[i].font !== b[i].font || a[i].color !== b[i].color || a[i].align !== b[i].align) out.wouldChange++;
    }
    out.wouldDelete = Math.max(0, a.length - b.length);
    if (out.subjectKnown) out.wouldOverlap = out.proposed.overlapCount;
    return out;
  }

  /* ── Shadow B — Personalization ────────────────────────────
     actual = 원장의 **최종** 결과(정답). predicted = 엔진 제안.
     ⚠️ 정답이 필요하므로 실사용 데이터 없이는 의미가 없다. Phase 0 이 INCONCLUSIVE 인 이유와 같다. */
  function comparePersonalization(predicted, actual) {
    var out = {
      schema: SCHEMA, kind: 'B',
      anchorHit: null, anchorDistance: null,
      fontHit: null, sizeRelDelta: null, stickerDelta: null, editDistance: 0
    };
    if (!predicted || !actual) return out;

    if (predicted.anchor && actual.anchor) {
      out.anchorHit = predicted.anchor === actual.anchor;
      if (!out.anchorHit) out.editDistance++;
    }
    if (typeof predicted.x === 'number' && typeof actual.x === 'number' &&
        typeof predicted.y === 'number' && typeof actual.y === 'number') {
      out.anchorDistance = Math.round(Math.sqrt(
        Math.pow(predicted.x - actual.x, 2) + Math.pow(predicted.y - actual.y, 2)) * 1000) / 1000;
    }
    if (predicted.font && actual.font) {
      out.fontHit = predicted.font === actual.font;
      if (!out.fontHit) out.editDistance++;
    }
    if (typeof predicted.size === 'number' && typeof actual.size === 'number' && predicted.size > 0) {
      out.sizeRelDelta = Math.round((actual.size - predicted.size) / predicted.size * 1000) / 1000;
      if (Math.abs(out.sizeRelDelta) > 0.1) out.editDistance++;
    }
    if (predicted.sticker !== undefined && actual.sticker !== undefined) {
      out.stickerDelta = (predicted.sticker || null) === (actual.sticker || null) ? 'same'
        : (actual.sticker ? 'added' : 'deleted');
      if (out.stickerDelta !== 'same') out.editDistance++;
    }
    return out;
  }

  /* 제안이 명시 규칙을 존중하는지 — BrandKit(원장이 정한 것) > 학습 결과 우선순위 검증용.
     내부 검증 전용이고, 위반이 발견되면 그 제안은 shadow 단계에서 폐기 대상이다. */
  function respectsExplicit(proposed, brandKit, vetoes) {
    var r = { wouldRespectBrand: true, wouldRespectVeto: true, violations: [] };
    try {
      if (brandKit && brandKit.brand_color && Array.isArray(proposed)) {
        // 브랜드 컬러를 원장이 정했는데 제안이 전혀 다른 색만 쓰면 기록(강제는 안 함)
        var used = proposed.filter(function (L) { return L && L.color; }).map(function (L) { return L.color; });
        if (used.length && used.indexOf(brandKit.brand_color) < 0) {
          r.wouldRespectBrand = false; r.violations.push('brand_color');
        }
      }
      if (vetoes && Array.isArray(proposed)) {
        proposed.forEach(function (L) {
          if (!L) return;
          if (L.font && vetoes['font:' + L.font]) { r.wouldRespectVeto = false; r.violations.push('font'); }
          if (L.emoji && vetoes['sticker:' + L.emoji]) { r.wouldRespectVeto = false; r.violations.push('sticker'); }
        });
      }
    } catch (_e) { void _e; }
    return r;
  }

  window.EditPlanShadow = {
    SCHEMA: SCHEMA,
    compareSafety: compareSafety,
    comparePersonalization: comparePersonalization,
    respectsExplicit: respectsExplicit
    // wouldImprove 는 **의도적으로 없다** — 자기채점 금지(파일 상단 주석 참조)
  };
})();
