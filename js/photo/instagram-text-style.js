/* instagram-text-style.js — 인스타 기존 게시물의 **글자 배치 습관**을 모은다. [2026-08-23]
 *
 * [왜]
 *   `ShopStyleCandidate` 는 이미 인스타에서 **색감·피사체 위치**를 뽑는다(픽셀 통계).
 *   하지만 글자는 픽셀 통계로 못 읽는다 — 이 프로젝트에서 여러 번 확인했다
 *   (엣지 밀집도로 텍스트 위치를 추정했다가 6/6 틀렸다).
 *   그래서 글자만 서버 Vision 으로 보고, 여기서 **여러 장을 모아 습관으로** 만든다.
 *
 * [게시물 하나로 취향을 정하지 않는다]
 *   한 장에서 가운데정렬이 나왔다고 "이 원장은 가운데정렬" 이 아니다.
 *   여러 장에서 **반복될 때만** 채택하고, 갈리면 그 축은 비워둔다(억지로 하나를 고르지 않는다).
 *   T8 이 편집 행동에 쓰는 규율과 같다.
 *
 * [비용 — 이게 설계의 절반이다]
 *   Vision 은 이미지 1장당 1회다. 그래서:
 *     · 이미지 해시로 **캐시**(같은 사진 두 번 안 부른다). PhotoContext 와 같은 IDB 를 쓴다.
 *     · `analysis_version` 이 바뀌었을 때만 다시 부른다.
 *     · 한 번에 최대 `MAX_CALLS` 장까지만. 게시물이 50장이어도 12장이면 습관은 충분히 보인다.
 *     · **편집할 때는 절대 안 부른다.** 인스타 연동 시점 1회뿐이다.
 *
 * [모르는 건 모른다고 둔다]
 *   서버가 `unknown` 을 주면 그 축은 집계에서 뺀다. 추측한 값으로 원장 기본값을 만들면
 *   원장이 매번 되돌려야 하고, 그건 없느니만 못하다.
 *
 * 공개: window.InstagramTextStyle.build(mediaList) → Promise<profile>
 *       window.InstagramTextStyle.get() → profile|null   (동기, 저장된 것)
 */
(function () {
  'use strict';
  if (window.InstagramTextStyle) return;

  var SCHEMA = 'igtext-v2';   // v2: 자격/학습 분리 + 축별 cold-start (옛 결과는 버린다)
  var LS_KEY = 'itdasy:ig_text_style::';
  var IDB_STORE = 'ig_text_analysis';      // PhotoContext 와 같은 IDB 헬퍼를 쓴다

  var MAX_CALLS = 12;                      // 한 번 연동에 Vision 최대 호출 수
  var MIN_POSTS = 4;                       // 이만큼은 봐야 '습관' 이라고 부른다
  var MIN_AGREE = 0.6;                     // 같은 값이 60% 넘게 반복돼야 채택
  var MIN_BLOCK_CONF = 0.5;                // 서버가 준 덩어리 확신도 하한
  /* 축 하나를 '습관' 이라고 부르려면 **서로 다른 게시물** 이만큼에서 같은 값이 나와야 한다.
     예전엔 MIN_POSTS(4)가 프로필 전체를 한 번에 막았고, 정작 투표는 덩어리 단위여서
     글자 많은 게시물 한 장이 축을 혼자 정할 수 있었다. 단위를 게시물로 바꾸고 축마다 따로 센다. */
  var MIN_AXIS_POSTS = 3;

  function _tenant() {
    try { var v = localStorage.getItem('last_user_id'); return v ? String(v) : null; }
    catch (_e) { void _e; return null; }
  }

  /* 이미지 해시 — 같은 사진을 두 번 분석하지 않기 위한 키.
     URL 은 못 쓴다: 인스타 CDN 주소는 만료되고 재발급 때마다 바뀐다(같은 사진인데 다른 주소). */
  function _hash(bytes) {
    var h1 = 0x811c9dc5, h2 = 0x01000193, i;
    for (i = 0; i < bytes.length; i += 7) {          // 전량 스캔은 과하다 — 7바이트 간격 표본
      h1 ^= bytes[i]; h1 = (h1 * 16777619) >>> 0;
      h2 = (h2 + bytes[i] * (i + 1)) >>> 0;
    }
    return (h1.toString(36) + '-' + h2.toString(36) + '-' + bytes.length.toString(36));
  }

  function _cacheGet(key) {
    try {
      if (typeof window.wmLearnGet !== 'function') return Promise.resolve(null);
      return window.wmLearnGet(IDB_STORE, key).catch(function () { return null; });
    } catch (_e) { void _e; return Promise.resolve(null); }
  }
  function _cachePut(key, val) {
    try {
      if (typeof window.wmLearnPut !== 'function') return;
      window.wmLearnPut(IDB_STORE, Object.assign({ id: key }, val));
    } catch (_e) { void _e; }
  }

  /* 서버 호출 — 실패는 조용히 null. 인스타 연동 전체가 이것 때문에 깨지면 안 된다. */
  function _analyze(blob) {
    try {
      if (!window.apiFetch) return Promise.resolve(null);
      var fd = new FormData();
      fd.append('file', blob, 'p.jpg');
      return window.apiFetch('/instagram-style/analyze', { method: 'POST', body: fd })
        .then(function (r) { return (r && r.ok) ? r.json() : null; })
        .catch(function () { return null; });
    } catch (_e) { void _e; return Promise.resolve(null); }
  }

  function _fetchBytes(url) {
    return fetch(url, { mode: 'cors' })
      .then(function (r) { return r.ok ? r.blob() : null; })
      .catch(function () { return null; });
  }

  /* ─────────────────────────────────────────────────────────────────────────
     자격(eligibility)과 학습(learning)은 다른 단계다.
     "분석 결과가 있다" 와 "이걸 원장 취향으로 배워도 된다" 를 섞으면
     실패한 분석이 조용히 취향이 된다 — 실제로 그랬다(아래 NOT_ANALYZED).

     [실측 근거 — 실호출 29건(성공 21 · 429 실패 8), 정답은 눈으로 붙였다]
       UI 격자 캡처 6건은 **6/6 전부 composition='collage'** 였다.
       반대로 `is_ui_screenshot=true` 인데 구도가 collage 가 아닌 2건은 **둘 다 진짜 게시물**이었다.
       → 오염을 막는 실제 신호는 collage 다. 플래그는 혼자 두면 6건 중 2건을 놓치고,
         진짜 게시물 2건을 잘못 잡는다.
       현재 규칙(플래그 OR collage): 오염 0/6 · 진짜 유지 11/15 (73%)
       이 규칙       (collage 제외 + 플래그는 SUSPECT): 오염 0/6 · 진짜 유지 13/15 (87%)
     ───────────────────────────────────────────────────────────────────────── */
  var ELIG = {
    /* 🔴 429 를 맞으면 서버가 **HTTP 200 에 빈 결과**를 준다(engine:'error', confidence:0).
       그 기본값이 `is_ui_screenshot:false` 라서, 예전 코드는 **분석에 실패한 UI 격자를
       "진짜 게시물"로 통과**시켰다. 실측에서 실제로 한 건 통과했다(C_full).
       실패는 실패로 다룬다 — 학습에도 안 쓰고, 분모(postsAnalyzed)에도 안 넣는다. */
    NOT_ANALYZED: 'NOT_ANALYZED',
    /* 여러 게시물이 한 장에 섞인 것. 피드 격자 캡처가 여기 다 걸린다.
       진짜 콜라주 게시물도 같이 걸리지만, 거기서 뽑은 배치는 어차피
       '이 원장이 한 게시물에 글자를 어떻게 놓는가'가 아니다. */
    CLEAR_UI: 'CLEAR_UI',
    /* 모델이 앱 화면이라고 했지만 구도는 단일 게시물. 실측에선 둘 다 진짜 게시물이었다.
       버리지 않되, **진짜 증거가 모자란 축에만 보조로** 쓴다.
       (플래그가 true 면 프롬프트가 UI 글자를 text_blocks 에서 빼라고 지시하므로,
        여기 남는 덩어리는 디자인 글자일 가능성이 높다) */
    SUSPECT: 'SUSPECT',
    GENUINE: 'GENUINE'
  };

  function _eligibility(r) {
    if (!r || !Array.isArray(r.text_blocks)) return ELIG.NOT_ANALYZED;
    if (r.engine !== 'gemini' || !(r.confidence > 0)) return ELIG.NOT_ANALYZED;
    if (r.composition === 'collage') return ELIG.CLEAR_UI;
    if (r.is_ui_screenshot) return ELIG.SUSPECT;
    return ELIG.GENUINE;
  }

  /* 옛 이름 유지 — '학습에 쓸 단일 게시물이 아니다'. 호출부가 아직 이걸 본다. */
  function _isNotSinglePost(r) {
    var e = _eligibility(r);
    return e === ELIG.CLEAR_UI || e === ELIG.NOT_ANALYZED;
  }

  /* 한 게시물이 그 축에 던지는 **표 한 장**. 덩어리 수로 세면 글자 많은 게시물 하나가
     나머지를 다 이긴다(12덩어리짜리 한 장 vs 1덩어리짜리 세 장). 습관은 그렇게 안 센다. */
  function _postVote(post, key) {
    var c = {}, best = null, bestN = 0;
    (post.blocks || []).forEach(function (b) {
      var v = b[key];
      if (!v || v === 'unknown') return;
      c[v] = (c[v] || 0) + 1;
      if (c[v] > bestN) { bestN = c[v]; best = v; }
    });
    return best;
  }

  /* 축 하나 — **게시물 단위 투표**. 동의율이 낮으면 안 고른다(갈린 취향을 뭉개지 않는다). */
  function _axis(posts, key) {
    var votes = posts.map(function (p) { return _postVote(p, key); })
      .filter(function (v) { return !!v; });
    if (!votes.length) return null;
    var c = {}, best = null, bestN = 0;
    votes.forEach(function (v) { c[v] = (c[v] || 0) + 1; if (c[v] > bestN) { bestN = c[v]; best = v; } });
    var agree = bestN / votes.length;
    if (agree < MIN_AGREE) return null;
    return { value: best, agree: Math.round(agree * 100) / 100, posts: votes.length };
  }

  function _axisNum(posts, key) {
    /* 크기는 게시물마다 중앙값을 내고, 그 중앙값들의 중앙값을 쓴다 —
       글자 많은 게시물이 분포를 끌고 가지 않게. */
    var per = posts.map(function (p) {
      var a = (p.blocks || []).map(function (b) { return b[key]; })
        .filter(function (v) { return typeof v === 'number' && isFinite(v); })
        .sort(function (x, y) { return x - y; });
      if (!a.length) return null;
      var m = a.length >> 1;
      return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
    }).filter(function (v) { return v !== null; }).sort(function (x, y) { return x - y; });
    if (!per.length) return null;
    var k = per.length >> 1;
    return { value: per.length % 2 ? per[k] : (per[k - 1] + per[k]) / 2, posts: per.length };
  }

  /* 축마다 따로 판정한다 — 게시물 4장을 모았다고 **모든 축이** 충분한 게 아니다.
     색은 4장에서 다 나오는데 폰트는 0장일 수 있다. 그때 폰트까지 억지로 채우면
     원장이 매번 되돌린다. 충분한 축만 초기 프로필에 넣고 나머지는 비워두면,
     그 축은 원장이 실제로 편집할 때 T8(WMPrefs)이 채운다. */
  function _buildAxis(genuine, suspect, key, isNum) {
    var f = isNum ? _axisNum : _axis;
    var a = f(genuine, key);
    var evidence = 'genuine';
    if (!a || a.posts < MIN_AXIS_POSTS) {
      // 진짜 증거만으론 모자라다 → 의심분까지 넣어 한 번 더 (확신도는 호출부가 낮춘다)
      var b = f(genuine.concat(suspect), key);
      if (b && (!a || b.posts > a.posts)) { a = b; evidence = 'mixed'; }
    }
    if (!a) return null;
    a.evidence = evidence;
    a.enough = a.posts >= MIN_AXIS_POSTS;
    return a;
  }

  /* 분석 결과 여러 장 → 습관 하나 */
  function _aggregate(results) {
    var buckets = { NOT_ANALYZED: [], CLEAR_UI: [], SUSPECT: [], GENUINE: [] };
    (results || []).forEach(function (r) {
      if (!r) { buckets.NOT_ANALYZED.push(r); return; }
      buckets[_eligibility(r)].push(r);
    });

    function pack(list) {
      return list.map(function (r) {
        return {
          blocks: (r.text_blocks || []).filter(function (b) {
            return b && (b.confidence || 0) >= MIN_BLOCK_CONF;
          }),
          composition: r.composition
        };
      });
    }
    var genuine = pack(buckets.GENUINE);
    var suspect = pack(buckets.SUSPECT);
    var learnable = genuine.concat(suspect);
    var blockCount = learnable.reduce(function (n, p) { return n + p.blocks.length; }, 0);

    var axes = {
      align: _buildAxis(genuine, suspect, 'alignment'),
      position: _buildAxis(genuine, suspect, 'position'),
      fontClass: _buildAxis(genuine, suspect, 'font_family_class'),
      fontWeight: _buildAxis(genuine, suspect, 'font_weight'),
      color: _buildAxis(genuine, suspect, 'color'),
      sizeRatio: _buildAxis(genuine, suspect, 'size_ratio', true)
    };

    /* 글자를 넣는 편인가 — 이것부터가 습관이다. 글자를 안 넣는 원장에게
       업종 seed 대로 글자를 얹으면 그게 첫 번째 되돌림이 된다.
       🔴 분모는 **분석에 성공한** 게시물뿐이다. 429 로 실패한 걸 '글자 없음' 으로 세면
       글자를 쓰는 원장이 안 쓰는 원장으로 둔갑한다. */
    var withText = genuine.filter(function (p) { return p.blocks.length > 0; }).length;
    var textUsage = genuine.length >= MIN_AXIS_POSTS
      ? { value: Math.round(withText / genuine.length * 100) / 100,
          posts: genuine.length, evidence: 'genuine', enough: true }
      : null;

    var out = {
      schema: SCHEMA,
      source: 'instagram_observed',
      /* 자격 단계의 내역을 그대로 남긴다 — 프로필이 안 만들어졌을 때
         '표본이 없었나' 와 '전부 걸러졌나' 와 '분석이 실패했나' 는 완전히 다른 문제다. */
      counts: {
        received: (results || []).length,
        notAnalyzed: buckets.NOT_ANALYZED.length,   // 429·오류 — 없는 데이터지 나쁜 데이터가 아니다
        clearUi: buckets.CLEAR_UI.length,           // 격자·콜라주 — 학습 금지
        suspect: buckets.SUSPECT.length,            // 플래그만 켜짐 — 보조로만
        genuine: buckets.GENUINE.length
      },
      postsAnalyzed: genuine.length,
      uiScreenshotsSkipped: buckets.CLEAR_UI.length,
      blockCount: blockCount,
      textUsageRate: textUsage ? textUsage.value : null,
      textUsage: textUsage,
      axes: axes,
      /* 옛 필드 이름 유지 — 호출부(shop-baseline)가 아직 이 모양을 본다 */
      align: axes.align, position: axes.position, fontClass: axes.fontClass,
      fontWeight: axes.fontWeight, color: axes.color, sizeRatio: axes.sizeRatio,
      composition: _axis(genuine, 'composition') || null,
      /* 🔑 정확한 폰트명은 **영원히 모른다**. 계열만 안다는 걸 값으로 못박아 둔다 —
         나중에 누가 이걸 폰트 키로 쓰려다 이 필드를 보고 멈추도록. */
      fontExact: 'UNKNOWN',
      /* 전역 게이트가 아니다 — **한 축이라도 쓸 만하면** 프로필은 만든다.
         나머지 축은 비워두고 원장 편집으로 채운다. */
      enough: Object.keys(axes).some(function (k) { return axes[k] && axes[k].enough; })
        || !!(textUsage && textUsage.enough),
      builtAt: Date.now()
    };
    return out;
  }

  function _save(p) {
    var t = _tenant(); if (!t) return;
    try { localStorage.setItem(LS_KEY + t, JSON.stringify(p)); } catch (_e) { void _e; }
  }
  function get() {
    var t = _tenant(); if (!t) return null;
    try {
      var raw = localStorage.getItem(LS_KEY + t);
      if (!raw) return null;
      var o = JSON.parse(raw);
      return (o && o.schema === SCHEMA) ? o : null;   // 스키마 바뀌면 옛 결과는 버린다
    } catch (_e) { void _e; return null; }
  }
  function clear() {
    var t = _tenant(); if (!t) return;
    try { localStorage.removeItem(LS_KEY + t); } catch (_e) { void _e; }
  }

  /* mediaList = 백엔드가 정규화한 인스타 미디어 [{id, thumb, permalink, media_type}]
     🔴 필드는 `thumb` 다. `thumbnail_url` 로 가정했다가 12장을 통째로 흘린 적이 있다. */
  function build(mediaList) {
    var list = (mediaList || []).filter(function (m) {
      return m && (m.thumb || m.thumbnail_url || m.media_url);
    });
    if (!list.length) return Promise.resolve(null);

    var picked = list.slice(0, MAX_CALLS);
    var results = [], calls = 0, cacheHits = 0;
    /* 🔴 쿼터가 마르면 **즉시 멈춘다.** 실측(2026-08-23): 429 가 나도 서버가 HTTP 200 을 주는 바람에
       남은 장을 계속 불렀다 — 13장을 더 태우고 전부 빈 결과를 받았다. Vertex 쿼터는 프로젝트 공용이라
       그 낭비가 곧 운영 쪽 장애다. 이미 받은 결과로 만들 수 있는 만큼만 만든다. */
    var quotaOut = false;

    var chain = picked.reduce(function (pr, m) {
      return pr.then(function () {
        if (quotaOut) return;
        var url = m.thumb || m.thumbnail_url || m.media_url;
        return _fetchBytes(url).then(function (blob) {
          if (!blob) return;
          return blob.arrayBuffer().then(function (buf) {
            var key = SCHEMA + ':' + _hash(new Uint8Array(buf));
            return _cacheGet(key).then(function (hit) {
              // 같은 사진 + 같은 분석 버전이면 Vision 을 다시 부르지 않는다
              if (hit && hit.result && hit.version === SCHEMA) { cacheHits++; results.push(hit.result); return; }
              calls++;
              return _analyze(blob).then(function (r) {
                if (!r) return;
                if ((r.warnings || []).indexOf('quota_exhausted') >= 0) { quotaOut = true; return; }
                results.push(r);
                // 실패한 분석은 캐시하지 않는다 — 캐시해버리면 쿼터가 풀려도 영영 빈 결과를 쓴다
                if (r.engine === 'gemini') _cachePut(key, { version: SCHEMA, result: r, at: Date.now() });
              });
            });
          });
        }).catch(function () { /* 한 장 실패는 무시 — 나머지로 계속 */ });
      });
    }, Promise.resolve());

    return chain.then(function () {
      if (!results.length) return null;
      var prof = _aggregate(results);
      prof.visionCalls = calls;
      prof.cacheHits = cacheHits;
      prof.quotaExhausted = quotaOut;      // 프로필이 빈약한 이유가 '표본 없음'인지 '쿼터'인지 구분된다
      prof.candidates = list.length;
      _save(prof);
      return prof;
    }).catch(function () { return null; });
  }

  window.InstagramTextStyle = {
    SCHEMA: SCHEMA, MAX_CALLS: MAX_CALLS, MIN_POSTS: MIN_POSTS, MIN_AGREE: MIN_AGREE,
    MIN_AXIS_POSTS: MIN_AXIS_POSTS, ELIG: ELIG,
    build: build, get: get, clear: clear,
    _aggregate: _aggregate, _hash: _hash,
    _eligibility: _eligibility, _isNotSinglePost: _isNotSinglePost,
    _axis: _axis, _axisNum: _axisNum
  };
})();
