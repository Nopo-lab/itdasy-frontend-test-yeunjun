/* draft-personalization.js — 자동 초안의 **개입 강도**를 원장별로 조정한다. [STAGE E]
 *
 * [이 파일이 하는 일은 "더 많이 고치기"가 아니다]
 *   반대다. **덜 건드리게** 만드는 게 목적이다.
 *   원장이 폰트를 매번 자기 걸로 바꾼다면, 우리가 폰트를 제안하는 건 도움이 아니라 방해다.
 *   그 원장에겐 폰트 축을 꺼야 한다. 그게 개인화다.
 *
 * [새로 만들지 않는다 — 이미 다 있다]
 *   T8 이 원장 행동을 관찰(`WMSignals`)하고 취향으로 집계(`WMPrefs`)하고
 *   기억에 적용(`WMPersonalize`)하는 스택을 이미 갖고 있다.
 *   여기서 하는 건 그 결과를 **EditPlan 언어로 번역**하는 것뿐이다.
 *     · 새 저장소 0 · 새 이벤트 0 · 새 임계값 0 · AI 호출 0 · API 호출 0
 *   임계값은 `WMPersonalize.MIN_CONF` 를 그대로 쓴다. 여기서 새 숫자를 정하면
 *   같은 판단이 두 곳에서 갈린다(그 실수는 이 레포에서 이미 여러 번 났다).
 *
 * [개인화는 안전장치를 못 이긴다 — 우선순위]
 *   1) 원장이 직접 고른 값(`_own`)   2) ShopStyle·BrandKit 명시 규칙
 *   3) 가독성·안전 최소조건(WCAG)     4) EditPlan 규칙
 *   5) **개인화(여기)**               6) 기본값
 *   가독성은 개인화 대상이 **아니다**. 안 보이는 글자는 취향 문제가 아니다.
 *
 * [상충은 상충으로 둔다]
 *   `WMPrefs.resolve()` 는 취향이 갈린 context 에서 **null 을 준다**(T8-D 에서 확정된 동작).
 *   그걸 '모름'으로 읽고 기본값을 밀어넣으면 원장이 반반 갈렸다는 명확한 증거를 덮는다.
 *   여기서는 그걸 **"이 축은 건드리지 마라"** 로 읽는다.
 *
 * 공개: window.DraftPersonalization.profile(prefs) → PersonalizationProfile  (순수)
 *       window.DraftPersonalization.resolve(ctx)   → Promise<Profile>        (WMPrefs 조회)
 *       window.DraftPersonalization.DEFAULT
 */
(function () {
  'use strict';
  if (window.DraftPersonalization) return;

  var SCHEMA = 'dperson-v1';

  /* 개인화를 **적용**하려면 이만큼은 봐야 한다.
     T8 이 이미 confidence 로 표본을 반영하지만(1~2건이면 confidence 자체가 낮다),
     "몇 건 봤나" 를 따로 들고 다녀야 나중에 왜 안 켜졌는지 설명할 수 있다. */
  var MIN_SAMPLES = 5;          // 5건 미만이면 개인화 없음 — 기본 동작 그대로
  var STRONG_SAMPLES = 10;      // 10건부터 정상 보정. 5~9 는 약하게

  // 축별 최소 확신도는 **기존 SSOT** 를 쓴다. 못 읽으면 T8 과 같은 값으로 폴백.
  function _minConf(kind) {
    var M = (window.WMPersonalize && window.WMPersonalize.MIN_CONF) || null;
    if (M && typeof M[kind] === 'number') return M[kind];
    return kind === 'continuous' ? 0.45 : 0.25;
  }

  var DEFAULT = {
    schema: SCHEMA,
    typography: { font: null, align: null, size: null },
    placement: { preferredZone: null, avoidedZone: null },
    /* 개입 강도 1.0 = STAGE C 그대로. 낮을수록 덜 건드린다.
       🔑 **1.0 을 넘지 않는다.** 개인화가 개입을 늘리는 방향으로는 못 간다 —
          늘리려면 EditPlan 규칙 자체를 고쳐야 하고, 그건 전원에게 검증돼야 한다. */
    intervention: { typography: 1, placement: 1 },
    evidence: { samples: 0, axes: {} },
    source: 'default'
  };

  function _clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* prefs = { font, align, size, position } — 각각 `WMPrefs.resolve()` 결과 또는 null.
     `{ conflict: true }` 를 넣으면 "취향이 갈렸다" 는 뜻이다(값이 없는 것과 다르다). */
  function profile(prefs) {
    var out = _clone(DEFAULT);
    if (!prefs) return out;
    var used = 0, seen = 0;

    function take(key, kind) {
      var p = prefs[key];
      if (!p) { out.evidence.axes[key] = 'none'; return null; }
      seen++;
      if (p.conflict) {
        /* 🔑 갈린 취향 = **개입 금지 신호**. '모름' 이 아니다.
           원장이 A 와 B 를 반반 쓴다면 우리가 하나를 고르는 건 도움이 아니라 간섭이다. */
        out.evidence.axes[key] = 'conflict';
        return { veto: true };
      }
      /* 🔴 연속축(size·x·y)은 값이 아니라 **자리표시자 `'~'`** 로 저장된다.
         실제 대표값은 `pref.samples` 에 쌓이고 T8 이 `robust()`(중앙값)로 뽑는다.
         그걸 안 하면 `'~'` 가 그대로 plan 에 실려 `Math.round('~' * H)` → NaN 이 되고,
         편집기의 `NaN > 0.15` 비교가 **조용히 false** 라 크기 개인화가 영영 안 걸린다.
         실제 UI 제스처로 size 를 학습시켜보고서야 드러났다(font/color/align 은 이 경로가 없다).
         🔑 대표값 계산은 **WMPersonalize.robust 를 재사용**한다 — 여기서 또 만들면 두 곳이 갈린다. */
      var CONT = (window.WMPrefs && window.WMPrefs.CONT_VALUE) || '~';
      if (p.value === CONT) {
        var samples = (p.pref && p.pref.samples) || p.samples || null;
        var rep = (window.WMPersonalize && window.WMPersonalize.robust)
          ? window.WMPersonalize.robust(samples) : null;
        if (rep === null || !isFinite(rep)) {
          out.evidence.axes[key] = 'no-representative';   // 표본은 있는데 대표값을 못 뽑았다
          return null;
        }
        p = Object.assign({}, p, { value: rep });
      }
      var n = p.sampleCount || (p.pref && p.pref.sampleCount) || 0;
      if (n < MIN_SAMPLES) { out.evidence.axes[key] = 'insufficient(' + n + ')'; return null; }
      var conf = p.confidence || 0;
      if (conf < _minConf(kind)) { out.evidence.axes[key] = 'low-conf(' + conf.toFixed(2) + ')'; return null; }
      // 5~9 건은 약하게 — 한 번의 반복이 곧바로 강한 결정이 되면 안 된다
      var w = n >= STRONG_SAMPLES ? 1 : 0.6;
      out.evidence.axes[key] = 'ok(' + n + ')';
      used++;
      return { value: p.value, confidence: Math.round(conf * w * 100) / 100, sampleCount: n };
    }

    var f = take('font', 'discrete');
    var a = take('align', 'discrete');
    var s = take('size', 'continuous');
    var z = take('position', 'continuous');

    if (f && !f.veto) out.typography.font = f;
    if (a && !a.veto) out.typography.align = a;
    if (s && !s.veto) out.typography.size = s;
    if (z && !z.veto) out.placement.preferredZone = z;

    /* 개입 강도 — 갈린 축이 있으면 그 계열의 개입을 낮춘다.
       "이 원장은 타이포를 자기 방식대로 한다" 를 코드로 옮긴 것이다. */
    var typoVeto = (f && f.veto) || (a && a.veto) || (s && s.veto);
    var placeVeto = (z && z.veto);
    if (typoVeto) out.intervention.typography = 0;
    if (placeVeto) out.intervention.placement = 0;

    out.evidence.samples = seen;
    out.source = (used || typoVeto || placeVeto) ? 'wm_prefs' : 'default';
    return out;
  }

  /* WMPrefs 에서 읽어 profile 로. **조회만** 한다 — 저장하지 않는다.
     WMPrefs 가 없거나(모듈 미로드·로그아웃) 실패하면 DEFAULT — 즉 STAGE C 그대로다. */
  function resolve(ctx) {
    var P = window.WMPrefs;
    if (!P || !P.resolve) return Promise.resolve(_clone(DEFAULT));
    /* 🔴 `WMPrefs.resolve()` 는 **상충**과 **데이터 없음**에 똑같이 null 을 준다.
       그 둘을 구분 못 하면 상충이 "경험 부족"으로 떨어지고, 그러면 업종 seed 가
       그대로 적용된다 — 원장이 반반 갈렸다는 명확한 증거를 덮는 것이다.
       브라우저 실측으로 잡았다: A/B/A/B 6회 뒤 center +6/-6 · left +6/-6 인데
       개입 강도가 그대로 1 이었다.

       구분법: `explain()` 은 resolve 가 null 을 줘도 **그 자리의 기록**을 돌려준다.
       기록이 있는데(positive>0) resolve 가 null 이면 = 갈린 것이다. */
    var ask = function (feature) {
      var ctx2 = ctx || {};
      return Promise.resolve(P.resolve(feature, ctx2))
        .then(function (r) {
          if (r) return r;
          if (!P.explain) return null;
          return Promise.resolve(P.explain(feature, ctx2))
            .then(function (e) { return (e && (e.positive || 0) > 0) ? { conflict: true } : null; })
            .catch(function () { return null; });
        })
        .catch(function () { return null; });
    };
    return Promise.all([ask('font'), ask('align'), ask('size'), ask('y')])
      .then(function (r) {
        return profile({ font: r[0], align: r[1], size: r[2], position: r[3] });
      })
      .catch(function () { return _clone(DEFAULT); });
  }

  window.DraftPersonalization = {
    SCHEMA: SCHEMA, DEFAULT: DEFAULT,
    MIN_SAMPLES: MIN_SAMPLES, STRONG_SAMPLES: STRONG_SAMPLES,
    profile: profile, resolve: resolve
  };
})();
