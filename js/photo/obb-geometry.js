/* obb-geometry.js — 회전 사각형의 **실제** 교집합을 구하는 순수 함수들. [Phase 5.4 사전검증]
 *
 * ⚠️ **어디에도 연결돼 있지 않다.** SafetyShadow 도 편집기도 이걸 부르지 않는다.
 *    production 의 `rotationExcludedRate` 가 높게 나올 때 즉시 갈아끼울 수 있게
 *    미리 만들어 검증만 해두는 것이다.
 *
 * [왜 필요한가 — 실측]
 *   회전된 요소의 `getBoundingClientRect()` 는 **회전 후 AABB** 라 실제 글자 박스보다 크다.
 *   Phase 5 실측: 15° → 2.21배 · 45° → 3.42배.
 *   그래서 지금은 회전 레이어를 안전 판정에서 아예 빼고 있는데, 회전이 흔하면
 *   그만큼 표본이 통째로 빠져 baseline 이 왜곡된다.
 *
 * [🔴 이 파일이 못 하는 것 — 입력이 부족하다]
 *   `metaGeometry()` 는 회전 **후** AABB(x,y,w,h) 와 rot 만 준다.
 *   AABB 에서 원래 크기(W,H)를 역산하려면
 *       a = W·|cosθ| + H·|sinθ|
 *       b = W·|sinθ| + H·|cosθ|
 *   를 풀어야 하는데 행렬식이 `cos2θ` 라 **45° 에서 0** 이다(실측 조건수: 44°→28.7, 45°→∞).
 *   즉 45° 부근은 **수학적으로 복원 불가**다.
 *   → OBB 를 채택하려면 `metaGeometry` 가 **회전 전 크기**(el.offsetWidth/offsetHeight,
 *     transform 의 영향을 안 받는 레이아웃 크기)를 같이 줘야 한다. 필드 2개 추가.
 *   이 파일은 그 입력이 있다는 전제로 계산만 담당한다.
 *
 * [좌표계] 전부 0..1 정규화. transform-origin 은 `center center`(css `.itl`).
 *
 * 공개: window.OBBGeometry.{ toPolygon, intersectionArea, polygonArea, overlapRatios, aabbOf }
 */
(function () {
  'use strict';
  if (window.OBBGeometry) return;

  var EPS = 1e-12;

  /* 중심·크기·각도 → 꼭짓점 4개.
     ⚠️ 정규화 좌표는 x 와 y 의 실제 축척이 다르다(사진이 4:5 면 세로가 더 길다).
        회전을 정규화 공간에서 그대로 돌리면 사각형이 찌그러진다.
        그래서 `aspect`(stage 폭/높이 비)를 받아 **정사각 공간에서 회전시키고 되돌린다.**
        aspect 를 안 주면 1 로 두는데, 그건 정사각 캔버스에서만 맞다. */
  function toPolygon(rect, aspect) {
    var a = (typeof aspect === 'number' && aspect > 0) ? aspect : 1;
    var cx = rect.cx, cy = rect.cy;
    var hw = rect.w / 2, hh = rect.h / 2;
    var t = (rect.rot || 0) * Math.PI / 180;
    var cos = Math.cos(t), sin = Math.sin(t);
    var pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    return pts.map(function (p) {
      // 정규화 → 등방(x 를 aspect 배) → 회전 → 정규화 복귀
      var ux = p[0] * a, uy = p[1];
      var rx = ux * cos - uy * sin;
      var ry = ux * sin + uy * cos;
      return { x: cx + rx / a, y: cy + ry };
    });
  }

  // 신발끈 공식. 볼록·시계/반시계 무관하게 절댓값.
  function polygonArea(poly) {
    if (!poly || poly.length < 3) return 0;
    var s = 0;
    for (var i = 0; i < poly.length; i++) {
      var p = poly[i], q = poly[(i + 1) % poly.length];
      s += p.x * q.y - q.x * p.y;
    }
    return Math.abs(s) / 2;
  }

  /* Sutherland–Hodgman 클리핑 — **볼록 다각형에서만** 옳다.
     사각형은 항상 볼록이라 안전하다. 오목 다각형을 넣으면 조용히 틀린 답이 나오므로
     이 함수를 다른 도형에 재사용하지 마라. */
  function intersectionArea(subject, clip) {
    if (!subject || !clip || subject.length < 3 || clip.length < 3) return 0;
    var out = subject.slice();
    // clip 의 감김 방향에 무관하게 동작하도록 방향을 맞춘다
    var cw = _signedArea(clip) < 0 ? clip.slice().reverse() : clip.slice();
    for (var i = 0; i < cw.length && out.length; i++) {
      var A = cw[i], B = cw[(i + 1) % cw.length];
      var input = out; out = [];
      for (var j = 0; j < input.length; j++) {
        var P = input[j], Q = input[(j + 1) % input.length];
        var pIn = _side(A, B, P) >= -EPS, qIn = _side(A, B, Q) >= -EPS;
        if (pIn) out.push(P);
        if (pIn !== qIn) {
          var X = _isect(A, B, P, Q);
          if (X) out.push(X);
        }
      }
    }
    return polygonArea(out);
  }
  function _signedArea(poly) {
    var s = 0;
    for (var i = 0; i < poly.length; i++) { var p = poly[i], q = poly[(i + 1) % poly.length]; s += p.x * q.y - q.x * p.y; }
    return s / 2;
  }
  function _side(A, B, P) { return (B.x - A.x) * (P.y - A.y) - (B.y - A.y) * (P.x - A.x); }
  function _isect(A, B, P, Q) {
    var d1x = B.x - A.x, d1y = B.y - A.y, d2x = Q.x - P.x, d2y = Q.y - P.y;
    var den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) < EPS) return null;
    var t = ((P.x - A.x) * d2y - (P.y - A.y) * d2x) / den;
    return { x: A.x + t * d1x, y: A.y + t * d1y };
  }

  // 다각형의 축정렬 경계상자 — AABB 와 비교할 때 쓴다
  function aabbOf(poly) {
    var xs = poly.map(function (p) { return p.x; }), ys = poly.map(function (p) { return p.y; });
    var x = Math.min.apply(null, xs), y = Math.min.apply(null, ys);
    return { x: x, y: y, w: Math.max.apply(null, xs) - x, h: Math.max.apply(null, ys) - y };
  }

  /* SafetyShadow 와 **같은 의미**의 비율을 낸다 — 하나로 합치지 않는다.
     layerCovered  : 글자가 얼마나 먹혔나
     subjectCovered: 피사체가 얼마나 가려졌나 */
  function overlapRatios(layerPoly, subjectPoly) {
    var inter = intersectionArea(layerPoly, subjectPoly);
    var la = polygonArea(layerPoly), sa = polygonArea(subjectPoly);
    return {
      intersection: inter,
      layerCoveredRatio: la > EPS ? inter / la : null,
      subjectCoveredRatio: sa > EPS ? inter / sa : null,
      iou: (la + sa - inter) > EPS ? inter / (la + sa - inter) : null
    };
  }

  window.OBBGeometry = {
    toPolygon: toPolygon, polygonArea: polygonArea, intersectionArea: intersectionArea,
    aabbOf: aabbOf, overlapRatios: overlapRatios
  };
})();
