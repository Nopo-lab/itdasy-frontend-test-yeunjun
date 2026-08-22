/* edit-plan.js — 사진 하나에 대한 **편집안**을 계산한다. [STAGE C]
 *
 * 지금까지 만든 것들(PhotoContext·ShopBaseline·CategoryPrior·SafetyShadow)은 계기판이었다.
 * 이 파일이 그 계기판을 보고 **실제로 편집안을 만드는** 첫 코드다.
 *
 * [설계의 뼈대 — 보수적으로]
 *   근거가 없는 축은 **비운다(null)**. 비어 있으면 편집기가 기존대로 동작한다.
 *   "AI 니까 뭐라도 채워야 한다" 가 이 제품에서 가장 위험한 태도다 —
 *   원장이 매번 되돌려야 하면 없느니만 못하다.
 *
 * [Safety 는 hard constraint]
 *   개인화가 아무리 그럴듯해도 피사체를 심하게 가리면 **채택하지 않는다.**
 *   후보 → 안전검사 → 실패면 다음 후보 → 전부 실패면 아무것도 안 함.
 *
 * [적용 우선순위 — 확실한 것부터]
 *   1) Safety(피사체 회피)  2) 폰트·크기·색  3) 앵커  4) 스티커  5) 보정  6) 캡션
 *   뒤로 갈수록 근거가 약하고 되돌릴 때 짜증이 크다. 그래서 뒤쪽은 기본적으로 안 건드린다.
 *
 * [무엇을 안 하나]
 *   · 네트워크·Vision·LLM 호출 0
 *   · 기존 T8(WorkMemory) 선택 로직을 바꾸지 않는다 — 그건 그대로 두고 **그 위에** 얹는다
 *   · 사용자가 이미 만진 값은 절대 안 건드린다
 *
 * 공개: window.EditPlan.compute(ctxOpts) → Promise<plan|null>
 *       window.EditPlan.applyToLayers(layers, plan) → layers  (순수, 새 배열)
 */
(function () {
  'use strict';
  if (window.EditPlan) return;

  var SCHEMA = 'editplan-v1';

  /* 자동 적용 범위 — 켤 때마다 하나씩 연다.
     처음부터 전부 켜면 뭐가 좋아지고 뭐가 나빠졌는지 못 가른다. */
  var SCOPE = {
    intent: true,       // 게시물 종류 판정 (텍스트 카드엔 글자를 더 얹지 않는다)
    safety: true,       // 피사체를 가리는 자유 텍스트를 안전한 자리로
    typography: true,   // 폰트·색·정렬 (증거 있을 때만)
    size: true,         // 글자 크기 — 업종 실측 sizeRatio 가 있다
    readability: true,  // 🔑 실제 배경 대비를 재서 안 보이면 최소한만 고친다
    anchor: false,      // 취향 앵커 — Safety 가 필요할 때만 움직인다
    sticker: false,     // 근거 약함
    crop: false,        // 원본 훼손 — 되돌리기 가장 어렵다
    adjust: false,      // 사진 보정 — 되돌리기 어려워 보수적으로
    caption: false      // 캡션은 별도 파이프라인 소유
  };

  /* 자동 초안(사진 선택 → 편집기 열림 시 자동 적용) 전용 스위치.
     `flagOn()`(=EditPlan 자체)과 **따로** 둔다: 계산은 켜되 자동 적용은 꺼둔 상태로
     먼저 관측하고 싶기 때문이다. 둘 다 켜져야 자동 초안이 돈다. */
  function autoDraftOn() {
    try {
      if (/[?&]autodraft=1/.test(location.search)) return true;
      if (/[?&]autodraft=0/.test(location.search)) return false;
      if (window.ITDASY_AUTO_EDIT_PLAN === true) return true;
      return _inRollout();
    } catch (_e) { void _e; return false; }
  }

  /* [STAGE D] 단계적 노출 — 10% → 50% → 100%.
     **원장 단위로 고정**한다. 세션마다 켜졌다 꺼졌다 하면 "어제는 됐는데 오늘은 안 되네" 가
     되는데, 그건 기능이 없는 것보다 나쁘다(무엇을 믿을지 모르게 된다).
     그래서 테넌트 id 를 해시해서 버킷을 고정한다 — 같은 원장은 늘 같은 결과다.

     ⚠️ 로그인 전(테넌트 없음)에는 **항상 꺼짐**이다. 익명 버킷을 만들면
        로그인 시점에 결과가 바뀌어서 위의 고정 원칙이 깨진다. */
  var ROLLOUT_PCT = 0;          // 0=아무에게도 안 켬. 게이트 통과 후 10 → 50 → 100.

  function _tenant() {
    try { return localStorage.getItem('last_user_id') || null; } catch (_e) { void _e; return null; }
  }

  // FNV-1a — 짧고 고르게 퍼진다. 암호용이 아니라 버킷용이다.
  function _bucket(id) {
    var h = 2166136261, i;
    for (i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h % 100;
  }

  function _inRollout() {
    var pct = (typeof window.ITDASY_DRAFT_ROLLOUT === 'number')
      ? window.ITDASY_DRAFT_ROLLOUT : ROLLOUT_PCT;
    if (!pct) return false;
    if (pct >= 100) return true;
    var t = _tenant();
    if (!t) return false;                       // 로그인 전엔 안 켠다
    return _bucket(String(t)) < pct;
  }

  function rolloutInfo() {
    var t = _tenant();
    return {
      pct: (typeof window.ITDASY_DRAFT_ROLLOUT === 'number') ? window.ITDASY_DRAFT_ROLLOUT : ROLLOUT_PCT,
      hasTenant: !!t,
      bucket: t ? _bucket(String(t)) : null,
      on: _inRollout()
    };
  }

  /* 플래그 — 기존 T8 `_flagOn()` 과 같은 패턴(URL 로 강제 on/off + 전역 스위치).
     **기본 OFF.** 근거가 쌓이기 전에는 아무에게도 적용되지 않는다.
     긴급 차단: 콘솔에서 `window.ITDASY_EDIT_PLAN = false` 또는 URL `?editplan=0`. */
  function flagOn() {
    try {
      if (/[?&]editplan=1/.test(location.search)) return true;
      if (/[?&]editplan=0/.test(location.search)) return false;
      return window.ITDASY_EDIT_PLAN === true;
    } catch (_e) { void _e; return false; }
  }

  /* 축 하나 = { value, source, confidence }.
     source 를 끝까지 들고 다니는 이유: 나중에 "왜 이렇게 됐지" 를 되짚을 수 있어야
     잘못된 축만 끄고 나머지는 살릴 수 있다. */
  function _axis(value, source, confidence) {
    if (value == null) return null;
    return { value: value, source: source, confidence: Math.round((confidence || 0) * 100) / 100 };
  }

  /* 안전한 앵커를 고른다 — SafetyShadow 의 후보 계산을 그대로 쓴다(중복 구현 금지).
     반환은 `{rect, anchor}` 또는 null(안전한 자리가 없거나 지금도 안전함). */
  function _safeAnchorFor(geom, pctx, intent) {
    if (!window.SafetyShadow || !geom || !pctx || !pctx.subjectRegion) return null;
    var det = window.SafetyShadow.detect([geom], pctx);
    if (!det.verdictReliable) return null;              // 저신뢰면 손대지 않는다
    var mine = det.layers.filter(function (l) { return l.idx === geom.idx; })[0];
    if (!mine || !mine.geometryReliable || !mine.unsafe) return null;   // 지금 안전하면 개입 안 함

    var cands = window.SafetyShadow.candidates(geom, pctx).filter(function (c) { return c.valid; });
    /* 전·후 비교 사진은 중앙 세로 경계가 **정보**다. 거기를 글자로 덮으면 비교가 안 보인다.
       (실측 왁싱 피드에서 17%가 전·후 비교였고, 라벨은 전부 경계를 피해 하단에 있었다) */
    if (intent && intent.layout && intent.layout.avoidCenterSeam) {
      var keep = cands.filter(function (c) {
        return (c.rect.x + c.rect.w) < 0.45 || c.rect.x > 0.55;   // 중앙 띠를 안 건드림
      });
      if (keep.length) cands = keep;      // 전부 걸리면 원래 후보를 쓴다(아무것도 못 하는 것보단 낫다)
    }
    if (!cands.length) return null;
    var best = cands.sort(function (a, b) {
      var d = a.metrics.layerCoveredRatio - b.metrics.layerCoveredRatio;
      if (Math.abs(d) > 0.001) return d;
      return b.metrics.distance - a.metrics.distance;
    })[0];
    var cur = mine.metrics.layerCoveredRatio;
    var gain = cur - best.metrics.layerCoveredRatio;
    if (gain < window.SafetyShadow.TH.improveDelta) return null;   // 의미 있게 낫지 않으면 그대로
    return { rect: best.rect, anchor: best.anchor, from: cur, to: best.metrics.layerCoveredRatio, gain: gain };
  }

  /* ctxOpts = { photoUrl, geoms, category, service, photoCount, kind }
     geoms 는 편집기가 열려 있을 때만 있다(실제 rect). 없으면 Safety 축은 건너뛴다. */
  function compute(ctxOpts) {
    ctxOpts = ctxOpts || {};
    var pc = window.PhotoContext;
    if (!pc || !ctxOpts.photoUrl) return Promise.resolve(null);

    return pc.of(ctxOpts.photoUrl).then(function (pctx) {
      var baseP = (window.ShopBaseline && window.ShopBaseline.resolve)
        ? window.ShopBaseline.resolve({ category: ctxOpts.category, service: ctxOpts.service,
          photoCount: ctxOpts.photoCount, kind: ctxOpts.kind })
        : Promise.resolve(null);
      var intent = (SCOPE.intent && window.ContentIntent) ? window.ContentIntent.classify(pctx) : null;
      return Promise.resolve(baseP).then(function (base) { return _build(pctx, base, ctxOpts, intent); });
    }).catch(function () { return null; });
  }

  function _build(pctx, base, o, intent) {
    var ax = (base && base.axes) || {};
    var plan = {
      schema: SCHEMA,
      photoKnown: !!(pctx && pctx.subjectRegion),
      subjectZone: pctx ? pctx.subjectZone : null,
      confidence: pctx ? pctx.confidence : 0,
      /* 게시물 종류 — 상위(작업실)가 이걸 보고 "글자를 더 권할지"를 정한다.
         canAddText=false 는 **하지 말라는 신호**지 실패가 아니다. */
      intent: intent ? intent.kind : null,
      intentConfidence: intent ? intent.confidence : 0,
      canAddText: intent && intent.layout ? intent.layout.canAddText !== false : true,
      /* 각 축은 근거가 있을 때만 채운다. **null = 건드리지 않음**.
         "AI 니까 뭐라도 채워야 한다" 가 이 제품에서 가장 위험한 태도다. */
      typography: { font: null, color: null, align: null, size: null, stroke: null, shadow: null },
      textAnchor: null,      // 선호 배치 구역 — Safety 가 거부하면 무시된다
      safetyMoves: [],       // [{idx, from, to, anchor, gain}] — 피사체 회피 이동
      readability: [],       // [{idx, before, after, color?, stroke?, shadow?}] — 렌더 후에 채워진다
      crop: null,            // SCOPE.crop=false — 형태만 유지
      imageAdjustments: null,
      stickers: null,
      caption: null,
      confidence: 0,         // 이 초안 전체를 얼마나 믿는가(축들의 최댓값이 아니라 **가중 평균**)
      source: null,          // 가장 센 근거의 출처 — 왜 이렇게 됐는지 되짚을 때 쓴다
      why: {}                // 내부 디버그 — 사용자에게 노출하지 않는다
    };

    // ── 2순위: 폰트·색·정렬 (증거 있을 때만)
    if (SCOPE.typography) {
      if (ax.font) plan.typography.font = _axis(ax.font.value, ax.font.source, ax.font.confidence);
      if (ax.color) plan.typography.color = _axis(ax.color.value, ax.color.source, ax.color.confidence);
      if (ax.align) plan.typography.align = _axis(ax.align.value, ax.align.source, ax.align.confidence);
        plan.why.typography = base ? base.sources : null;
    }

    // ── 1순위: Safety — 자유 텍스트가 피사체를 가리면 안전한 자리로
    if (SCOPE.safety && pctx && pctx.subjectRegion && Array.isArray(o.geoms)) {
      o.geoms.forEach(function (g) {
        if (!g || g.origin !== 'user') return;                 // 원장이 직접 놓은 것만 대상
        if (g.type !== 'text' && g.type !== 'badge') return;
        var mv = _safeAnchorFor(g, pctx, intent);
        if (mv) plan.safetyMoves.push({ idx: g.idx, anchor: mv.anchor, rect: mv.rect,
          from: mv.from, to: mv.to, gain: Math.round(mv.gain * 1000) / 1000 });
      });
      plan.why.safety = { subjectZone: pctx.subjectZone, confidence: pctx.confidence,
        avoidCenterSeam: !!(intent && intent.layout && intent.layout.avoidCenterSeam) };
    }

    /* ── 3~6순위는 아직 닫아둔다.
       근거(Replay·Shadow)가 없는 상태에서 앵커·스티커·보정까지 건드리면
       "AI 가 내 사진을 망쳤다" 가 된다. SCOPE 로 하나씩 연다. */
    if (SCOPE.adjust && ax.tone) {
      plan.adjust = _axis(ax.tone.value, ax.tone.source, ax.tone.confidence);
    }

    plan.why.intent = intent ? intent.why : null;

    /* 전체 확신도 — 채워진 축들의 **평균**이다. 최댓값을 쓰면 축 하나가 센 걸로
       나머지 약한 축까지 믿게 된다. 아무 축도 안 찼으면 0 이다. */
    var filled = [plan.typography.font, plan.typography.color, plan.typography.align,
      plan.typography.size, plan.textAnchor].filter(Boolean);
    if (filled.length) {
      plan.confidence = Math.round(filled.reduce(function (a, x) { return a + x.confidence; }, 0)
        / filled.length * 100) / 100;
      // 가장 센 근거의 출처 — 되짚을 때 "어디서 온 값인가" 를 한 줄로 알 수 있어야 한다
      plan.source = filled.slice().sort(function (a, b) { return b.confidence - a.confidence; })[0].source;
    }

    plan.hasAnything = !!(plan.safetyMoves.length || plan.textAnchor ||
      plan.typography.font || plan.typography.color || plan.typography.align ||
      plan.typography.size || plan.imageAdjustments);
    return plan;
  }

  /* 계획을 레이어에 반영 — **순수 함수**(새 배열 반환, 입력 불변).
     🔴 사용자가 이미 만진 값은 건드리지 않는다. 그걸 어기면 신뢰를 한 번에 잃는다. */
  function applyToLayers(layers, plan, opts) {
    if (!Array.isArray(layers) || !plan) return layers;
    opts = opts || {};
    var touched = opts.userTouched || {};      // { idx: true } — 이번 세션에 원장이 만진 레이어
    var moves = {};
    (plan.safetyMoves || []).forEach(function (m) { moves[m.idx] = m; });

    return layers.map(function (L, i) {
      if (!L || touched[i]) return L;                          // 원장이 만진 건 그대로
      if (L.role) return L;                                    // 역할 레이어는 템플릿 소유
      if (L.type !== 'text' && L.type !== 'badge') return L;
      var out = Object.assign({}, L);
      var changed = false;

      // Safety 이동 — 중심좌표로 환산(레이어 계약이 중심 기준)
      var mv = moves[i];
      if (mv && mv.rect) {
        out.x = mv.rect.x + mv.rect.w / 2;
        out.y = mv.rect.y + mv.rect.h / 2;
        out._planSafety = mv.anchor;
        changed = true;
      }
      // 타이포 — **비어 있는 축만** 채운다. 이미 값이 있으면 원장 것이므로 안 덮는다.
      var t = plan.typography || {};
      if (t.font && (out.font == null || out.font === '')) { out.font = t.font.value; changed = true; }
      if (t.color && (out.color == null || out.color === '')) { out.color = t.color.value; changed = true; }
      if (t.align && (out.align == null || out.align === '')) { out.align = t.align.value; changed = true; }

      /* 출처 태깅 — T8 이 `_src:'wm'` 으로 자기강화를 막는 것과 같은 이유다.
         우리가 얹은 값을 나중에 "원장이 고른 값" 으로 학습하면 안 된다. */
      if (changed) out._src = out._src || 'plan';
      return out;
    });
  }

  window.EditPlan = { SCHEMA: SCHEMA, SCOPE: SCOPE, flagOn: flagOn, autoDraftOn: autoDraftOn,
    rolloutInfo: rolloutInfo, compute: compute, applyToLayers: applyToLayers };
})();
