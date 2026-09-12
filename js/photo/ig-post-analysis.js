/* ig-post-analysis.js — 인스타 게시물 **하나하나**의 스타일을 남긴다.  [2026-09-04]
 *
 * [왜 새로 만드나 — 기존 두 모듈이 못 하던 딱 한 가지]
 *   `InstagramTextStyle`   글자 배치를 보고 → **중앙값 하나**로 뭉친다
 *   `ShopStyleCandidate`   색감을 재고     → **중앙값 하나**로 뭉친다
 *   둘 다 "이 원장의 습관 한 개"를 만드는 게 목적이라 게시물별 값을 **버린다.**
 *   그래서 "게시물 30개를 비슷한 것끼리 묶어줘"를 할 수가 없었다 — 묶을 재료가 없다.
 *
 *   이 파일은 **분석을 새로 하지 않는다.** 그 둘이 이미 돌리는 분석에 올라타서
 *   버려지던 게시물별 결과를 media_id 에 붙여 남긴다. Vision 호출 추가 0.
 *
 * [게시물의 정체성은 media_id 뿐이다]
 *   썸네일 URL 로 잇지 않는다 — IG CDN 주소는 재발급마다 바뀐다(같은 사진, 다른 주소).
 *   배열 index 로도 잇지 않는다 — 게시물 하나가 지워지면 그 뒤가 통째로 밀린다.
 *
 * [서버에 올리는 이유]
 *   Vision 은 장당 돈이다. localStorage 에만 두면 폰을 바꾸는 순간 30장을 다시 낸다.
 *   서버는 (user_id, media_id) UNIQUE 라 몇 번을 올려도 행은 하나다.
 *
 * [실패해도 앱을 막지 않는다]
 *   서버가 죽어 있어도 로컬 결과로 그룹은 만들어진다. 동기화는 보조다.
 *
 * 공개: window.IgPostAnalysis.collect(mediaList, opts) → Promise<posts[]>
 *       window.IgPostAnalysis.list()   → Promise<posts[]>   (서버 우선, 실패 시 로컬)
 *       window.IgPostAnalysis.cached() → posts[]            (동기, 로컬만)
 *       window.IgPostAnalysis.clear()
 */
(function () {
  'use strict';
  if (window.IgPostAnalysis) return;

  var SCHEMA = 'igpost-v1';
  var LS_KEY = 'itdasy:ig_post_analysis::';     // 테넌트 스코프 — T8·InstagramTextStyle 과 같은 경계

  function _tenant() {
    try {
      var v = localStorage.getItem('last_user_id');
      return (v == null || v === '' || v === 'null') ? null : String(v);
    } catch (_e) { void _e; return null; }
  }
  function _key() { var t = _tenant(); return t ? (LS_KEY + t) : null; }

  function _readLocal() {
    var k = _key(); if (!k) return [];
    try {
      var o = JSON.parse(localStorage.getItem(k) || 'null');
      return (o && o.schema === SCHEMA && Array.isArray(o.posts)) ? o.posts : [];
    } catch (_e) { void _e; return []; }
  }
  function _writeLocal(posts) {
    var k = _key(); if (!k) return false;
    try {
      localStorage.setItem(k, JSON.stringify({ schema: SCHEMA, posts: posts, at: Date.now() }));
      return true;
    } catch (_e) { void _e; return false; }   // quota — 조용히 실패(서버본이 정본)
  }

  /* 로컬 병합 — media_id 기준. 같은 게시물이 두 번 들어오면 **나중 것**이 이긴다.
     (재분석하면 값이 바뀐다. 분석 결과는 최신이 맞다) */
  function _merge(prev, next) {
    var by = Object.create(null);
    (prev || []).forEach(function (p) { if (p && p.media_id) by[p.media_id] = p; });
    (next || []).forEach(function (p) {
      if (!p || !p.media_id) return;
      by[p.media_id] = Object.assign({}, by[p.media_id] || {}, p);
    });
    return Object.keys(by).map(function (k) { return by[k]; });
  }

  /* ── 서버 ─────────────────────────────────────────────────────────── */
  function _auth() {
    try { return (typeof window.authHeader === 'function') ? window.authHeader() : {}; }
    catch (_e) { void _e; return {}; }
  }

  function _push(posts) {
    if (!posts || !posts.length) return Promise.resolve(false);
    if (!window.apiFetch) return Promise.resolve(false);
    var items = posts.map(function (p) {
      return {
        media_id: p.media_id,
        media_type: p.media_type || null,
        permalink: p.permalink || null,
        eligibility: p.eligibility || 'GENUINE',
        visual: p.visual || null,
        text_style: p.text_style || null,
        analysis_version: p.analysis_version || SCHEMA
      };
    });
    // 서버 상한이 60이다. 넘치면 잘라 보내는 게 아니라 나눠 보낸다 — 조용한 손실 금지.
    var chunks = [];
    for (var i = 0; i < items.length; i += 50) chunks.push(items.slice(i, i + 50));
    return chunks.reduce(function (pr, c) {
      return pr.then(function (ok) {
        return window.apiFetch('/instagram-style/posts', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, _auth()),
          body: JSON.stringify({ items: c })
        }).then(function (r) { return ok && !!(r && r.ok); })
          .catch(function () { return false; });
      });
    }, Promise.resolve(true));
  }

  function _pull() {
    if (!window.apiFetch) return Promise.resolve(null);
    return window.apiFetch('/instagram-style/posts', { headers: _auth() })
      .then(function (r) { return (r && r.ok) ? r.json() : null; })
      .then(function (j) { return (j && Array.isArray(j.posts)) ? j.posts : null; })
      .catch(function () { return null; });
  }

  /* ── 한 게시물 → 저장 모양 ────────────────────────────────────────── */

  /* 색감. `PhotoContext` 가 이미 canvas 로 재는 값 그대로 쓴다 —
     두 번째 픽셀 분석기를 만들지 않는다(값이 어긋나면 그룹이 흔들린다). */
  function _visualOf(ctx) {
    if (!ctx) return null;
    return {
      brightness: ctx.brightness, contrast: ctx.contrast,
      saturation: ctx.saturation, warmth: ctx.warmth,
      aspect: ctx.aspect,
      palette: (ctx.dominantColors || []).slice(0, 5),
      subjectZone: ctx.subjectZone || null
    };
  }

  /* 글자. 서버 Vision 결과(text_blocks)를 **게시물 한 장의 대표값**으로 접는다.
     축마다 그 게시물 안에서 가장 많이 나온 값 — 덩어리 수로 세면 글자 많은 한 장이
     나머지를 다 이긴다(InstagramTextStyle 이 같은 이유로 게시물 단위 투표를 쓴다). */
  function _textOf(r) {
    if (!r || !Array.isArray(r.text_blocks)) return null;
    var MIN_CONF = 0.5;
    var blocks = r.text_blocks.filter(function (b) { return b && (b.confidence || 0) >= MIN_CONF; });
    function top(key) {
      var c = {}, best = null, bestN = 0;
      blocks.forEach(function (b) {
        var v = b[key];
        if (!v || v === 'unknown') return;
        c[v] = (c[v] || 0) + 1;
        if (c[v] > bestN) { bestN = c[v]; best = v; }
      });
      return best;
    }
    function med(key) {
      var a = blocks.map(function (b) { return b[key]; })
        .filter(function (v) { return typeof v === 'number' && isFinite(v); })
        .sort(function (x, y) { return x - y; });
      if (!a.length) return null;
      var m = a.length >> 1;
      return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
    }
    return {
      blocks: blocks.length,
      alignment: top('alignment'),
      position: top('position'),
      font_class: top('font_family_class'),
      font_weight: top('font_weight'),
      color: top('color'),
      size_ratio: med('size_ratio'),
      composition: r.composition || null
    };
  }

  /* 자격 판정은 `InstagramTextStyle` 이 정본이다. 여기서 두 번째 규칙을 만들지 않는다 —
     두 곳이 다르게 판정하면 화면과 학습이 어긋난다. 모듈이 없으면 판정을 미룬다. */
  function _eligOf(r) {
    try {
      if (window.InstagramTextStyle && window.InstagramTextStyle._eligibility) {
        return window.InstagramTextStyle._eligibility(r);
      }
    } catch (_e) { void _e; }
    return r ? 'GENUINE' : 'NOT_ANALYZED';
  }

  /* ── 수집 ─────────────────────────────────────────────────────────── */
  /* mediaList = [{id, thumb, permalink, media_type}] (백엔드 정규화본)
     opts.force  = 색감 캐시 무시하고 다시 잼
     opts.onlyNew= 이미 분석된 게시물은 건너뜀 (§38 — 새 게시물만)

     🔑 글자 분석(Vision)은 `InstagramTextStyle.build()` 에 얹혀 간다. 비용 가드
        (MAX_CALLS 12 · 이미지 해시 캐시 · 429 즉시 중단)는 전부 그쪽에 이미 있다.
        여기서 따로 부르면 그 가드를 통째로 우회하게 된다 — 절대 하지 않는다. */
  function collect(mediaList, opts) {
    opts = opts || {};
    var list = (mediaList || []).filter(function (m) {
      return m && m.id && (m.thumb || m.thumbnail_url || m.media_url);
    });
    if (!list.length) return Promise.resolve([]);

    var known = Object.create(null);
    _readLocal().forEach(function (p) { if (p && p.media_id) known[p.media_id] = p; });
    var targets = opts.onlyNew
      ? list.filter(function (m) { return !known[m.id]; })
      : list;
    if (!targets.length) return Promise.resolve(_readLocal());

    var byId = Object.create(null);
    targets.forEach(function (m) {
      byId[m.id] = {
        media_id: m.id,
        media_type: m.media_type || null,
        permalink: m.permalink || null,
        eligibility: 'NOT_ANALYZED',
        visual: null, text_style: null,
        analysis_version: SCHEMA,
        analyzed_at: Date.now()
      };
    });

    // 1) 글자 — InstagramTextStyle 에 올라타 게시물별 결과를 받는다.
    var textDone = Promise.resolve(null);
    if (window.InstagramTextStyle && window.InstagramTextStyle.build) {
      textDone = window.InstagramTextStyle.build(targets, {
        onPost: function (media, result) {
          var row = byId[media && media.id];
          if (!row) return;
          row.text_style = _textOf(result);
          row.eligibility = _eligOf(result);
        }
      }).catch(function () { return null; });
    }

    // 2) 색감 — PhotoContext(canvas). 서버 호출 0원.
    function visualPass() {
      if (!window.PhotoContext || !window.PhotoContext.of) return Promise.resolve();
      /* 순차 처리. 12장을 동시에 디코딩하면 저사양 기기에서 메모리가 튄다
         (ShopStyleCandidate 가 같은 이유로 같은 모양이다). */
      return targets.reduce(function (pr, m) {
        return pr.then(function () {
          var url = m.thumb || m.thumbnail_url || m.media_url;
          return Promise.resolve(window.PhotoContext.of(url))
            .then(function (ctx) { if (byId[m.id]) byId[m.id].visual = _visualOf(ctx); })
            /* IG CDN 이 CORS 를 안 주면 canvas 가 오염돼 getImageData 가 던진다.
               우리가 고칠 수 있는 게 아니다 — 그 장만 색감 없이 간다(글자는 살아 있다). */
            .catch(function () { });
        });
      }, Promise.resolve());
    }

    return textDone.then(visualPass).then(function () {
      var fresh = Object.keys(byId).map(function (k) { return byId[k]; });
      var all = _merge(_readLocal(), fresh);
      _writeLocal(all);
      // 서버 동기화는 fire-and-forget. 실패해도 로컬 결과로 그룹은 만들어진다.
      _push(fresh);
      return all;
    }).catch(function () { return _readLocal(); });
  }

  /* 서버 우선. 서버가 비었거나 실패하면 로컬. 서버 것이 있으면 로컬도 맞춰둔다. */
  function list() {
    return _pull().then(function (remote) {
      if (!remote || !remote.length) return _readLocal();
      var merged = _merge(_readLocal(), remote);
      _writeLocal(merged);
      return merged;
    }).catch(function () { return _readLocal(); });
  }

  function cached() { return _readLocal(); }

  function clear() {
    var k = _key(); if (!k) return;
    try { localStorage.removeItem(k); } catch (_e) { void _e; }
  }

  window.IgPostAnalysis = {
    SCHEMA: SCHEMA,
    collect: collect, list: list, cached: cached, clear: clear,
    // 테스트·디버그용 내부 노출 (동작은 위 4개로만 쓴다)
    _textOf: _textOf, _visualOf: _visualOf, _merge: _merge
  };
})();
