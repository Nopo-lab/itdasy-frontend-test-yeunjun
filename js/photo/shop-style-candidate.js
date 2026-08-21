/* shop-style-candidate.js — [Phase 2] 원장 본인 인스타 과거 게시물에서 **시각 스타일 후보**를 뽑는다.
 *
 * ⚠️ **후보(candidate)다. 적용하지 않는다.** 소비처는 없다 — 일부러 없다.
 *    순서는 Instagram history → StyleCandidate → Replay 검증 → Shadow → Rollout 이고,
 *    지금은 첫 칸까지만 만든다. 검증 없이 배치를 바꾸면 Phase 0 에서 배운 걸 되풀이하는 것이다.
 *
 * [왜 이게 콜드스타트의 답인가]
 *   Phase 0 실측: 실사용 원장의 편집 이력이 **0건**이었다. 편집을 안 해봤으니 배울 게 없다.
 *   그런데 원장은 이미 인스타에 수십 장을 올려놨다. 그게 "이 샵이 사진을 어떻게 다루는가"의
 *   유일한 기존 증거다. 편집기를 한 번도 안 써본 첫날에도 쓸 수 있는 데이터가 이것뿐이다.
 *
 * [증거의 급을 반드시 구분한다 — Phase 3 §13/§14]
 *   instagram_observed : 결과물에서 **관찰**된 것. 원장이 그 값을 골랐다는 증거가 아니다
 *                        (필터앱·카메라 기본값·조명일 수 있다). 약한 증거.
 *   editor_observed    : 우리 편집기에서 원장이 **직접 만진** 것. 강한 증거(T8 소관).
 *   이 파일이 만드는 건 전자뿐이다. 후자로 승격하지 마라.
 *
 * [비용] 0원. 새 Meta 권한 0. 새 API 호출 0.
 *   이미 캐시된 `/instagram/recent-media`(instagram_business_basic) 썸네일을
 *   **기존 PhotoContext 로** 분석한다 — 두 번째 픽셀 분석기를 만들지 않는다.
 *
 * [Meta 조건 — 2026-08-21 공식 문서 재확인]
 *   · Instagram API with Instagram Login 은 **프로페셔널(비즈니스/크리에이터) 계정만** 지원.
 *     개인 계정은 토큰 자체가 안 나온다 → 이 경로로는 콜드스타트 불가(업종 prior 로 폴백).
 *   · 우리가 쓰는 필드(media_url·thumbnail_url·timestamp)는 이미 받고 있는 범위 안이다.
 *   · rate limit 은 계정당 시간 200회 — 여기서는 **추가 호출이 0** 이라 무관.
 *
 * 공개: window.ShopStyleCandidate.build(opts) → Promise<candidate|null>
 *       window.ShopStyleCandidate.get()  → candidate|null   (저장분)
 *       window.ShopStyleCandidate.clear()
 */
(function () {
  'use strict';
  if (window.ShopStyleCandidate) return;

  var SCHEMA = 'ssc-v1';
  var KEY = 'itdasy:shop_style_candidate::';      // tenant 스코프 — T8 과 같은 경계
  var MIN_SAMPLE = 5;                              // 이 미만이면 값을 내지 않는다(§R8 정책과 동일)
  var MAX_ANALYZE = 12;                            // recent-media 기본 개수

  function _tenant() {
    try {
      var v = localStorage.getItem('last_user_id');
      return (v == null || v === '' || v === 'null') ? null : String(v);
    } catch (_e) { void _e; return null; }
  }
  function _key() { var t = _tenant(); return t ? (KEY + t) : null; }

  function _median(a) {
    if (!a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function _round(v) { return v == null ? null : Math.round(v * 1000) / 1000; }

  /* 대표 색 — 게시물마다 뽑힌 주요색을 모아 **빈도순**으로. 평균내면 안 된다
     (핑크와 민트를 평균하면 회색이 나온다 — 그 샵엔 없는 색이다). */
  function _topColors(lists) {
    var freq = Object.create(null);
    lists.forEach(function (cs) {
      (cs || []).forEach(function (c) { freq[c] = (freq[c] || 0) + 1; });
    });
    return Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a]; }).slice(0, 5);
  }

  function _read() {
    var k = _key(); if (!k) return null;
    try {
      var raw = localStorage.getItem(k);
      var o = raw ? JSON.parse(raw) : null;
      return (o && o.schema === SCHEMA) ? o : null;
    } catch (_e) { void _e; return null; }
  }
  function _write(o) {
    var k = _key(); if (!k) return false;
    try { localStorage.setItem(k, JSON.stringify(o)); return true; }
    catch (_e) { void _e; return false; }
  }

  /* 후보를 만든다. 실패는 전부 null — 이 모듈이 죽어도 앱은 그대로 동작한다.
     opts.force = true 면 캐시 무시하고 다시 계산. */
  function build(opts) {
    opts = opts || {};
    if (!opts.force) {
      var cached = _read();
      if (cached) return Promise.resolve(cached);
    }
    var A = window.WorkspaceAdapter;
    if (!A || typeof A.recentMedia !== 'function' || !window.PhotoContext) {
      return Promise.resolve(null);
    }
    return Promise.resolve(A.recentMedia(false)).then(function (media) {
      /* 🔴 필드명은 **`thumb`** 이다. 백엔드 `_parse_media_items` 가 Graph 응답을
         `{id, thumb, permalink, media_type}` 로 정규화해서 준다(이미지=media_url,
         동영상=thumbnail_url 을 한 필드로 합침).
         처음에 원시 Graph 필드(`thumbnail_url`/`media_url`)를 가정했다가 실계정에서
         **12장이 전부 걸러져 attempted:0** 이 나왔다 — 합성 테스트로는 절대 못 잡는 종류다.
         원시 필드도 같이 받아두되(직접 호출 대비) 정본은 `thumb`. */
      var items = (media || []).filter(function (m) {
        return m && (m.thumb || m.thumbnail_url || m.media_url);
      }).slice(0, MAX_ANALYZE);
      if (!items.length) return _finish([], 0);

      /* 순차 처리 — 12장을 동시에 디코딩하면 저사양 기기에서 메모리가 튄다.
         콜드스타트는 한 번뿐이라 조금 느려도 된다(체감 경로가 아니다). */
      var ctxs = [];
      var chain = Promise.resolve();
      items.forEach(function (m) {
        chain = chain.then(function () {
          return window.PhotoContext.of(m.thumb || m.thumbnail_url || m.media_url)
            .then(function (c) { if (c) ctxs.push(c); })
            /* IG CDN 이 CORS 를 안 주면 canvas 가 오염돼 getImageData 가 던진다.
               그건 우리가 고칠 수 있는 게 아니다 — 그 장만 건너뛴다. */
            .catch(function () { });
        });
      });
      return chain.then(function () { return _finish(ctxs, items.length); });
    }).catch(function () { return null; });
  }

  function _finish(ctxs, attempted) {
    var n = ctxs.length;
    var enough = n >= MIN_SAMPLE;
    var cand = {
      schema: SCHEMA,
      source: 'instagram_observed',        // 🔑 편집기 관찰(editor_observed)과 절대 섞지 마라
      evidenceStrength: 'weak',            // 결과물 관찰이지 원장의 선택이 아니다
      sampleCount: n,
      attempted: attempted,
      status: n === 0 ? 'NO_DATA' : (enough ? 'OK' : 'INSUFFICIENT'),
      minSample: MIN_SAMPLE,
      visual: null,
      builtAt: Date.now()
    };
    if (enough) {
      cand.visual = {
        brightness: _round(_median(ctxs.map(function (c) { return c.brightness; }))),
        contrast: _round(_median(ctxs.map(function (c) { return c.contrast; }))),
        saturation: _round(_median(ctxs.map(function (c) { return c.saturation; }))),
        warmth: _round(_median(ctxs.map(function (c) { return c.warmth; }))),
        aspect: _round(_median(ctxs.map(function (c) { return c.aspect; }))),
        palette: _topColors(ctxs.map(function (c) { return c.dominantColors; })),
        // 피사체가 주로 어디 오는가 — 배치 판단의 재료(적용은 Shadow 이후)
        subjectZones: _zoneHist(ctxs)
      };
    }
    _write(cand);
    return cand;
  }

  function _zoneHist(ctxs) {
    var h = Object.create(null), known = 0;
    ctxs.forEach(function (c) { if (c.subjectZone) { h[c.subjectZone] = (h[c.subjectZone] || 0) + 1; known++; } });
    /* 중앙값이 아니라 분포를 준다. Phase 0 에서 'center 75%' 를 선호로 오독할 뻔했기 때문에,
       **하나의 대표값으로 뭉개지 않는다.** 읽는 쪽이 분포를 보고 판단하게 한다. */
    return { hist: h, known: known, total: ctxs.length };
  }

  function get() { return _read(); }
  function clear() { var k = _key(); if (k) { try { localStorage.removeItem(k); } catch (_e) { void _e; } } }

  window.ShopStyleCandidate = {
    SCHEMA: SCHEMA, MIN_SAMPLE: MIN_SAMPLE,
    build: build, get: get, clear: clear
  };
})();
