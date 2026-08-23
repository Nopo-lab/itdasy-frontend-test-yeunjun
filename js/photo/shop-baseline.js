/* shop-baseline.js — [Phase 3] 축마다 "지금 쓸 수 있는 가장 강한 증거"를 골라준다.
 *
 * ⚠️ **아직 아무도 소비하지 않는다.** Phase 4(Replay)가 이 결과를 검증하고,
 *    Phase 5/6(Shadow)이 화면 반영 없이 비교한 뒤에야 적용을 논한다.
 *
 * [새 StyleProfile 객체를 만들지 않는다 — §3B.1]
 *   이미 BrandKit(명시 규칙) · ShopStyle(재사용 자산) · Persona(말투) · WorkMemory(관측 취향) ·
 *   ShopStyleCandidate(인스타 관찰) · CategoryPrior(업종 seed) 가 각자 자리를 갖고 있다.
 *   여기서 값을 **복제해 저장하면** 진실원이 둘이 되고 언젠가 어긋난다.
 *   그래서 이 모듈은 **읽어서 고르기만** 하고 아무것도 소유하지 않는다.
 *
 * [증거 계층 — §3.2/§3.3]
 *   explicit_brandkit  원장이 직접 정한 규칙            confidence 1.00  (무조건 최우선)
 *   editor_observed    우리 편집기에서 직접 만진 행동    T8 confidence   (강한 개인 증거)
 *   instagram_observed 과거 게시물에서 관찰된 결과      × 0.6 감쇠      (선택이 아니라 결과)
 *   category_prior     업종 seed(코드에 박음)          ≤ 0.50          (개인 증거 아님)
 *   ── 없으면 null. **추론하지 않는다.**
 *
 * [왜 instagram 을 감쇠하나]
 *   결과물이 따뜻하다고 원장이 따뜻한 톤을 **고른** 게 아니다 — 필터앱·조명일 수 있다.
 *   그런데 인스타는 20장, 편집기는 6번처럼 **표본이 훨씬 크다.** 빈도로 평균내면
 *   약한 증거가 강한 증거를 수적으로 이겨버린다(§3.5). 그래서 계층으로 자르고,
 *   같은 축에 둘 다 있으면 **편집기 것이 이긴다.**
 *
 * 공개: window.ShopBaseline.resolve(ctx) → Promise<baseline>
 */
(function () {
  'use strict';
  if (window.ShopBaseline) return;

  var IG_DECAY = 0.6;          // instagram_observed 신뢰 감쇠 — 관찰이지 선택이 아님

  /* 개인 증거가 쌓일수록 prior 지분이 줄어야 한다(§3.4).
     🔴 임계값을 하드코딩하지 않는다 — 연속 감쇠 곡선으로 두고, 실제 최적점은
     Phase 4 Replay 의 holdout 결과로 정한다. 지금은 "0이면 prior 가 전부,
     쌓일수록 줄어든다"는 **형태**만 맞춰둔다. */
  function priorWeight(personalCount) {
    var n = Math.max(0, personalCount || 0);
    return 1 / (1 + n / 5);     // n=0 → 1.0 · n=5 → 0.5 · n=20 → 0.2
  }

  function _axis(value, source, confidence, sampleCount) {
    return {
      value: value,
      source: source,                    // 축마다 출처를 **분리 보존**(§3B.3)
      confidence: Math.round(confidence * 100) / 100,
      sampleCount: sampleCount == null ? null : sampleCount
    };
  }

  /* 🔴 전역 이름은 **`window.BrandKit`** 이다(app-brand-kit.js:281).
     `ItdasyBrandKit` 으로 가정했다가 잡혔다 — Phase 2 의 `thumb` 필드와 **같은 종류의 실수**다.
     남의 모듈 계약은 내 기억이 아니라 그 파일에서 읽어와야 한다. 테스트로 잠갔다.

     🔴 그리고 `BrandKit.get()` 은 **저장이 없어도 기본값을 채워서 돌려준다**
     (`_read()` → `_normalize({})` → `brand_color: '#D58A95'`).
     그걸 그대로 쓰면 **아무 설정도 안 한 원장의 기본색이 `explicit` confidence 1.0 으로
     인스타 실측 증거를 눌러버린다.** QA 에서 실제로 그렇게 나왔다.
     이건 Phase 0 의 'center 75%'(스폰 기본값을 선호로 오독) 와 정확히 같은 종류의 오류다.
     → **저장 여부를 직접 확인**한다. 저장된 적 없으면 explicit 증거가 아니다. */
  var BK_KEY = 'itdasy_brand_kit';
  function _brandKit() {
    try {
      if (!(window.BrandKit && window.BrandKit.get)) return null;
      var raw = localStorage.getItem(BK_KEY);
      if (!raw) return null;                       // 한 번도 저장 안 함 = 명시 규칙 없음
      var saved = JSON.parse(raw) || {};
      var full = window.BrandKit.get() || {};
      // 원장이 **직접 넣은 키만** explicit 로 인정한다(기본값 채움분 제외)
      return {
        brand_color: (saved.brand_color != null && saved.brand_color !== '') ? full.brand_color : null,
        watermark_text: (saved.watermark_text != null && saved.watermark_text !== '') ? full.watermark_text : null
      };
    } catch (_e) { void _e; return null; }
  }

  /* T8 취향 — 편집기에서 원장이 실제로 만진 것. resolve() 는 async 다.
     실패·미로드는 전부 null(개인화는 optional enhancement 라는 T8 규칙 그대로). */
  function _editorPref(feature, context) {
    try {
      if (!window.WMPrefs || !window.WMPrefs.resolve) return Promise.resolve(null);
      return Promise.resolve(window.WMPrefs.resolve(feature, context)).catch(function () { return null; });
    } catch (_e) { void _e; return Promise.resolve(null); }
  }

  /* 개인 증거의 양 — prior 지분 계산용. preference 목록 길이를 쓴다.
     (관측 수가 아니라 '갈래 수'라 정확한 대리값은 아니지만, 0 인지 아닌지는 정확하다.) */
  function _personalCount() {
    try {
      if (!window.WMPrefs || !window.WMPrefs.list) return Promise.resolve(0);
      return Promise.resolve(window.WMPrefs.list()).then(function (l) { return (l || []).length; })
        .catch(function () { return 0; });
    } catch (_e) { void _e; return Promise.resolve(0); }
  }

  /* ctx = { category, service, photoCount, kind, hasBeforeAfter }
     반환은 축별 { value, source, confidence, sampleCount } + 메타. */
  function resolve(ctx) {
    ctx = ctx || {};
    var bk = _brandKit();
    var ig = (window.ShopStyleCandidate && window.ShopStyleCandidate.get) ? window.ShopStyleCandidate.get() : null;
    var igOk = !!(ig && ig.status === 'OK' && ig.visual);
    var prior = (window.CategoryPrior)
      ? (window.CategoryPrior.get(ctx.category) || window.CategoryPrior.generic())
      : null;

    return Promise.all([
      _editorPref('font', ctx), _editorPref('color', ctx), _editorPref('align', ctx),
      _personalCount()
    ]).then(function (r) {
      var pFont = r[0], pColor = r[1], pAlign = r[2], personalN = r[3];
      var pw = priorWeight(personalN);
      var out = {
        schema: 'baseline-v1',
        resolvedAt: Date.now(),
        priorWeight: Math.round(pw * 100) / 100,
        personalEvidenceCount: personalN,
        axes: {}
      };

      // ── 색: BrandKit 이 정했으면 그것으로 끝. 학습이 브랜드 규칙을 이기면 안 된다.
      if (bk && bk.brand_color) out.axes.color = _axis(bk.brand_color, 'explicit_brandkit', 1.0, null);
      else if (pColor) out.axes.color = _axis(pColor.value, 'editor_observed', pColor.confidence, null);
      else if (igOk && ig.visual.palette && ig.visual.palette.length) {
        out.axes.color = _axis(ig.visual.palette[0], 'instagram_observed', (ig.sampleCount >= 8 ? 0.7 : 0.5) * IG_DECAY, ig.sampleCount);
      } else out.axes.color = null;                     // 모르면 null — 기본 편집기가 알아서

      /* [2026-08-23] 인스타 글자 습관 — 서버 Vision 이 관찰한 결과.
         🔑 자리는 **editor_observed 아래, category_prior 위**다. 원장이 실제로 편집한 증거가
            있으면 그게 항상 이긴다 — 인스타는 '예전에 이렇게 했더라'지 '지금 그렇게 한다'가 아니다.
         🔑 폰트는 **계열까지만** 온다(serif/sans/...). 편집기 폰트 키가 아니라서 그대로 못 쓴다.
            계열→키 매핑은 하지 않는다 — 'serif' 를 어떤 세리프로 고를지는 우리가 정할 문제가 아니다.
            대신 `fontClassHint` 로 따로 실어 보내 상위가 판단하게 한다. */
      var igt = (window.InstagramTextStyle && window.InstagramTextStyle.get)
        ? window.InstagramTextStyle.get() : null;
      var igtOk = !!(igt && igt.enough);
      var IGT_CONF = 0.55;                       // 관찰이지 선택이 아니다 — editor_observed(최대 1.0)를 못 이긴다

      // ── 폰트·정렬: 편집기 증거 > 인스타 관찰 > 업종 seed
      out.axes.font = pFont ? _axis(pFont.value, 'editor_observed', pFont.confidence, null) : null;
      out.axes.fontClassHint = (!pFont && igtOk && igt.fontClass)
        ? _axis(igt.fontClass.value, 'instagram_observed', IGT_CONF * IG_DECAY, igt.blockCount) : null;
      out.axes.align = pAlign ? _axis(pAlign.value, 'editor_observed', pAlign.confidence, null)
        : (igtOk && igt.align ? _axis(igt.align.value, 'instagram_observed', IGT_CONF * IG_DECAY, igt.blockCount)
          : (prior ? _axis(prior.typography.align, 'category_prior', prior.confidence * pw, null) : null));

      /* 글자 크기 — 편집기 증거가 없을 때 인스타 실측이 업종 seed 보다 이 원장에게 가깝다. */
      if (igtOk && igt.sizeRatio && igt.sizeRatio.value) {
        out.axes.size = _axis(igt.sizeRatio.value, 'instagram_observed', IGT_CONF * IG_DECAY, igt.sizeRatio.n);
      }
      /* 글자를 아예 잘 안 넣는 원장이면 그것도 습관이다 — 상위가 이걸 보고 덜 얹는다. */
      out.axes.textUsage = (igtOk && igt.textUsageRate != null)
        ? _axis(igt.textUsageRate, 'instagram_observed', IGT_CONF * IG_DECAY, igt.postsAnalyzed) : null;

      // ── 보정 톤: 인스타 관찰이 유일한 증거원(편집기는 슬라이더를 T8 이 학습 안 함)
      out.axes.tone = igOk
        ? _axis({ brightness: ig.visual.brightness, saturation: ig.visual.saturation, warmth: ig.visual.warmth },
          'instagram_observed', 0.7 * IG_DECAY, ig.sampleCount)
        : null;

      // ── 텍스트 구역: 아직 **개인 증거가 존재하지 않는 축**이다(Grammar 미검증).
      //    그래서 지금은 prior 만 — 그리고 그 사실을 source 로 정직하게 드러낸다.
      /* [2026-08-23] 예전엔 "개인 증거가 존재하지 않는 축" 이었지만, 이제 인스타 관찰이 생겼다.
         여전히 편집기 증거가 최우선이고, 없을 때만 인스타 → 업종 seed 순이다. */
      out.axes.textZone = (igtOk && igt.position)
        ? _axis([igt.position.value], 'instagram_observed', IGT_CONF * IG_DECAY, igt.blockCount)
        : (prior ? _axis(prior.textZone.slice(), 'category_prior', prior.confidence * pw, null) : null);

      // ── 피사체가 어디 오는가: 인스타 실측 > 업종 추정
      if (igOk && ig.visual.subjectZones && ig.visual.subjectZones.known >= 5) {
        var h = ig.visual.subjectZones.hist;
        var zones = Object.keys(h).sort(function (a, b) { return h[b] - h[a]; });
        out.axes.subjectZoneHint = _axis(zones, 'instagram_observed',
          0.8 * IG_DECAY, ig.visual.subjectZones.known);
      } else {
        out.axes.subjectZoneHint = prior
          ? _axis(prior.subjectZoneHint.slice(), 'category_prior', prior.confidence * pw, null) : null;
      }

      out.sources = Object.keys(out.axes).reduce(function (m, k) {
        m[k] = out.axes[k] ? out.axes[k].source : 'none'; return m;
      }, {});
      return out;
    }).catch(function () { return null; });
  }

  window.ShopBaseline = { resolve: resolve, priorWeight: priorWeight, IG_DECAY: IG_DECAY };
})();
