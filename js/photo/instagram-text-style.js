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

  var SCHEMA = 'igtext-v1';
  var LS_KEY = 'itdasy:ig_text_style::';
  var IDB_STORE = 'ig_text_analysis';      // PhotoContext 와 같은 IDB 헬퍼를 쓴다

  var MAX_CALLS = 12;                      // 한 번 연동에 Vision 최대 호출 수
  var MIN_POSTS = 4;                       // 이만큼은 봐야 '습관' 이라고 부른다
  var MIN_AGREE = 0.6;                     // 같은 값이 60% 넘게 반복돼야 채택
  var MIN_BLOCK_CONF = 0.5;                // 서버가 준 덩어리 확신도 하한

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

  /* 최빈값 — 단, **동의율이 낮으면 안 고른다**. 갈린 취향을 하나로 뭉개지 않는다. */
  function _mode(values) {
    var vals = (values || []).filter(function (v) { return v && v !== 'unknown'; });
    if (!vals.length) return null;
    var c = {}, best = null, bestN = 0;
    vals.forEach(function (v) { c[v] = (c[v] || 0) + 1; if (c[v] > bestN) { bestN = c[v]; best = v; } });
    var agree = bestN / vals.length;
    if (agree < MIN_AGREE) return null;            // 갈렸다 → 비워둔다
    return { value: best, agree: Math.round(agree * 100) / 100, n: vals.length };
  }

  function _median(nums) {
    var a = (nums || []).filter(function (v) { return typeof v === 'number' && isFinite(v); })
      .sort(function (x, y) { return x - y; });
    if (!a.length) return null;
    var m = a.length >> 1;
    return { value: a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2, n: a.length };
  }

  /* 분석 결과 여러 장 → 습관 하나 */
  /* 🔴 실호출 실측(4장): `is_ui_screenshot` 은 **2/4 밖에 못 맞혔다**(놓침 1·오탐 1).
     그런데 `composition` 은 **4/4 정확**했다 — 인스타 피드 화면 캡처는 둘 다 `collage`,
     실제 게시물은 둘 다 `text_overlay` 였다.
     그래서 둘 중 하나라도 걸리면 제외한다.

     이건 UI 판정을 우회하는 꼼수가 아니다: **collage 는 여러 게시물이 한 장에 섞인 것**이라
     거기서 뽑은 글자 배치는 '이 원장이 한 게시물에 글자를 어떻게 놓는가'가 아니다.
     UI 캡처든 아니든 학습에서 빼는 게 맞다. */
  function _isNotSinglePost(r) {
    return !!(r.is_ui_screenshot || r.composition === 'collage');
  }

  function _aggregate(results) {
    var used = results.filter(function (r) {
      return r && !_isNotSinglePost(r) && Array.isArray(r.text_blocks);
    });
    var blocks = [];
    used.forEach(function (r) {
      (r.text_blocks || []).forEach(function (b) {
        if (!b || (b.confidence || 0) < MIN_BLOCK_CONF) return;
        blocks.push(b);
      });
    });
    var withText = used.filter(function (r) { return (r.text_blocks || []).length > 0; }).length;

    var out = {
      schema: SCHEMA,
      source: 'instagram_observed',
      postsAnalyzed: used.length,
      /* 이름은 유지하되 뜻은 '한 게시물이 아니라서 뺀 수' 다(UI 캡처 + 콜라주). */
      uiScreenshotsSkipped: results.length - used.length,
      blockCount: blocks.length,
      /* 글자를 넣는 편인가 — 이것부터가 습관이다. 글자를 안 넣는 원장에게
         업종 seed 대로 글자를 얹으면 그게 첫 번째 되돌림이 된다. */
      textUsageRate: used.length ? Math.round(withText / used.length * 100) / 100 : null,
      align: _mode(blocks.map(function (b) { return b.alignment; })),
      position: _mode(blocks.map(function (b) { return b.position; })),
      fontClass: _mode(blocks.map(function (b) { return b.font_family_class; })),
      fontWeight: _mode(blocks.map(function (b) { return b.font_weight; })),
      color: _mode(blocks.map(function (b) { return b.color; })),
      sizeRatio: _median(blocks.map(function (b) { return b.size_ratio; })),
      composition: _mode(used.map(function (r) { return r.composition; })),
      /* 🔑 정확한 폰트명은 **영원히 모른다**. 계열만 안다는 걸 값으로 못박아 둔다 —
         나중에 누가 이걸 폰트 키로 쓰려다 이 필드를 보고 멈추도록. */
      fontExact: 'UNKNOWN',
      enough: used.length >= MIN_POSTS,
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

    var chain = picked.reduce(function (pr, m) {
      return pr.then(function () {
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
                results.push(r);
                _cachePut(key, { version: SCHEMA, result: r, at: Date.now() });
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
      _save(prof);
      return prof;
    }).catch(function () { return null; });
  }

  window.InstagramTextStyle = {
    SCHEMA: SCHEMA, MAX_CALLS: MAX_CALLS, MIN_POSTS: MIN_POSTS, MIN_AGREE: MIN_AGREE,
    build: build, get: get, clear: clear,
    _aggregate: _aggregate, _mode: _mode, _median: _median, _hash: _hash,
    _isNotSinglePost: _isNotSinglePost
  };
})();
