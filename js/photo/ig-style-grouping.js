/* ig-style-grouping.js — 게시물을 **비슷한 것끼리** 묶는다.  [2026-09-04]
 *
 * [왜 k-means 가 아닌가]
 *   1. 이름을 못 붙인다. k-means 는 "군집 2번"을 줄 뿐이고, 원장 화면엔 "웜 브라운" 이 떠야 한다.
 *      군집에 이름을 붙이려면 어차피 절대 기준이 필요하다 — 그럼 처음부터 그걸 쓰는 게 맞다.
 *   2. 결과가 안 정한다. 초기값에 따라 같은 사진 30장이 오늘과 내일 다르게 묶인다.
 *      그러면 재계산할 때마다 '같은 그룹'을 알아볼 수 없고(auto_key 가 흔들린다),
 *      원장이 이름을 고쳐놔도 다음 분석에서 새 그룹이 하나 더 생긴다.
 *   3. 표본이 12~24장이다. 이 크기에서 k-means 의 이점은 없고 불안정만 남는다.
 *
 *   그래서 **이름 있는 원형(archetype)에 가장 가까운 것끼리** 모은다.
 *   결정적이다 — 같은 사진이면 늘 같은 그룹, 같은 auto_key.
 *
 * [원형 값은 지어낸 게 아니다]
 *   `category-prior.js` 가 실제 원장 인스타 **27샵 × 6게시물 = 162건**을 PhotoContext 와
 *   같은 공식으로 잰 값을 갖고 있다. 그 실측이 각 축의 실제 폭을 알려준다:
 *
 *     밝기   0.442(헤어) ~ 0.616(왁싱)     폭 0.174
 *     채도   0.105(붙임머리) ~ 0.283(헤어)  폭 0.178
 *     색온도 0.001(반영구) ~ 0.139(네일)    폭 0.138
 *
 *   원형은 이 실측 **극점 방향**에 놓았다. "밝고 저채도" 는 왁싱 실측(0.616/0.138)이 있는 쪽,
 *   "어둡고 고채도" 는 헤어 실측(0.442/0.283)이 있는 쪽이다. 업종 이름이 아니라
 *   **그 업종 사진이 실제로 어떤 톤이었나**를 좌표로 쓴 것이다.
 *
 *   ⚠️ 이 값은 업종 **평균**이라 게시물 하나의 분산은 더 크다. 그래서 원형에서 멀면
 *      억지로 붙이지 않고 확신도를 깎거나 그룹에서 뺀다(§31).
 *
 * [묶이지 않는 게시물은 묶지 않는다]
 *   3장 미만이 모인 원형은 그룹으로 만들지 않는다. 1~2장짜리 "스타일" 은 습관이 아니라 우연이다.
 *   남은 것들은 `ungrouped` 로 정직하게 돌려준다 — 화면이 '기타' 로 보여주거나 숨긴다.
 *
 * 공개: window.IgStyleGrouping.group(posts) → { groups[], ungrouped[] }
 */
(function () {
  'use strict';
  if (window.IgStyleGrouping) return;

  var VERSION = 'grp-v1';        // auto_key 접두. 규칙이 바뀌면 올린다(옛 그룹과 안 섞이게)
  var MIN_GROUP_POSTS = 3;       // 이 미만이면 습관이 아니라 우연
  /* 이보다 멀면 그 원형 사람이 아니다. 축 폭(≈0.17)으로 정규화한 거리라
     1.0 은 '한 축에서 업종 간 최대 폭만큼 떨어짐' 을 뜻한다. */
  var MAX_DIST = 1.15;

  /* 정규화 가중치 = 1 / 실측 폭. 축마다 스케일이 달라서 그냥 더하면
     폭이 좁은 색온도(0.138)가 무시된다. */
  var W = { brightness: 1 / 0.174, saturation: 1 / 0.178, warmth: 1 / 0.138 };

  /* 원형. `id` 는 auto_key 재료라 **절대 바꾸지 않는다**(바꾸면 원장이 고친 이름이 날아간다).
     `name` 은 첫 제안일 뿐이고 원장이 고치면 그 이름이 이긴다. */
  var ARCHETYPES = [
    { id: 'white_clean', name: '화이트 클린',
      c: { brightness: 0.640, saturation: 0.130, warmth: 0.055 },
      desc: '밝고 깨끗한 톤' },
    { id: 'warm_brown', name: '웜 브라운',
      c: { brightness: 0.540, saturation: 0.250, warmth: 0.140 },
      desc: '따뜻하고 차분한 톤' },
    { id: 'chic_mono', name: '시크 모노',
      c: { brightness: 0.520, saturation: 0.105, warmth: 0.010 },
      desc: '색을 아낀 차가운 톤' },
    { id: 'deep_studio', name: '딥 스튜디오',
      c: { brightness: 0.440, saturation: 0.285, warmth: 0.090 },
      desc: '어둡고 진한 톤' },
    { id: 'pink_lovely', name: '핑크 러블리',
      c: { brightness: 0.625, saturation: 0.275, warmth: 0.135 },
      desc: '밝고 화사한 톤' },
    { id: 'natural', name: '내추럴',
      c: { brightness: 0.550, saturation: 0.195, warmth: 0.070 },
      desc: '치우치지 않은 기본 톤' }
  ];

  function _dist(v, c) {
    var d = 0, k;
    for (k in W) {
      if (typeof v[k] !== 'number' || !isFinite(v[k])) return null;   // 축이 비면 판정 불가
      var t = (v[k] - c[k]) * W[k];
      d += t * t;
    }
    return Math.sqrt(d);
  }

  function _nearest(v) {
    var best = null, bestD = Infinity;
    ARCHETYPES.forEach(function (a) {
      var d = _dist(v, a.c);
      if (d != null && d < bestD) { bestD = d; best = a; }
    });
    return best ? { arch: best, dist: bestD } : null;
  }

  function _median(a) {
    if (!a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; });
    var m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function _r3(v) { return v == null ? null : Math.round(v * 1000) / 1000; }

  /* 그룹 안에서 축 하나 — 게시물 단위 다수결. 갈리면 비운다.
     (InstagramTextStyle 이 같은 규율을 쓴다: 반복될 때만 채택, 갈리면 그 축은 null) */
  var MIN_AGREE = 0.6;
  function _textAxis(members, key) {
    var votes = members.map(function (p) { return p.text_style && p.text_style[key]; })
      .filter(function (v) { return !!v && v !== 'unknown'; });
    if (votes.length < 2) return null;
    var c = {}, best = null, bestN = 0;
    votes.forEach(function (v) { c[v] = (c[v] || 0) + 1; if (c[v] > bestN) { bestN = c[v]; best = v; } });
    return (bestN / votes.length) >= MIN_AGREE ? best : null;
  }

  /* 대표 색 — 빈도순. 평균내면 안 된다(핑크와 민트를 평균하면 그 샵에 없는 회색이 나온다). */
  function _palette(members) {
    var freq = Object.create(null);
    members.forEach(function (p) {
      ((p.visual && p.visual.palette) || []).forEach(function (c) { freq[c] = (freq[c] || 0) + 1; });
    });
    return Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a]; }).slice(0, 5);
  }

  function _profile(members) {
    var num = function (k) {
      return _r3(_median(members.map(function (p) { return p.visual && p.visual[k]; })
        .filter(function (v) { return typeof v === 'number' && isFinite(v); })));
    };
    var sizes = members.map(function (p) { return p.text_style && p.text_style.size_ratio; })
      .filter(function (v) { return typeof v === 'number' && isFinite(v); });
    var withText = members.filter(function (p) {
      return p.text_style && (p.text_style.blocks || 0) > 0;
    }).length;

    return {
      schema: VERSION,
      source: 'instagram_observed',      // 🔑 관찰이지 원장의 선택이 아니다. 편집기 증거를 못 이긴다.
      visual: {
        brightness: num('brightness'), contrast: num('contrast'),
        saturation: num('saturation'), warmth: num('warmth'),
        aspect: num('aspect'), palette: _palette(members)
      },
      text: {
        alignment: _textAxis(members, 'alignment'),
        position: _textAxis(members, 'position'),
        fontClass: _textAxis(members, 'font_class'),
        fontWeight: _textAxis(members, 'font_weight'),
        color: _textAxis(members, 'color'),
        sizeRatio: _r3(_median(sizes)),
        /* 글자를 넣는 편인가 — 이것부터가 습관이다. 안 넣는 원장에게 글자를 얹으면
           그게 첫 번째 되돌림이 된다. */
        usageRate: members.length ? Math.round(withText / members.length * 100) / 100 : null
      },
      posts: members.length
    };
  }

  /* 확신도 — 원장에게 "이게 당신 스타일이에요" 라고 말해도 되는 정도.
     가까이 모였고(거리 작음) 표본이 여럿이면 높다. 억지로 1.0 을 만들지 않는다. */
  function _confidence(members, dists) {
    var md = _median(dists) || 0;
    var tight = Math.max(0, 1 - md / MAX_DIST);          // 0(경계) ~ 1(원형 정중앙)
    var enough = Math.min(1, members.length / 6);        // 6장이면 표본 몫은 다 찬다
    return Math.round((0.35 + 0.45 * tight + 0.20 * enough) * 100) / 100;
  }

  /* posts = IgPostAnalysis 가 만든 배열.
     반환 { groups: [...], ungrouped: [media_id...], skipped: {...} }

     🔑 학습 자격이 없는 게시물은 애초에 안 넣는다. UI 격자 캡처(CLEAR_UI)나
        분석 실패(NOT_ANALYZED)를 그룹에 넣으면 그게 곧 원장 취향으로 굳는다 —
        실패를 성공처럼 세는 건 이 프로젝트에서 이미 한 번 사고였다. */
  function group(posts) {
    var skipped = { noVisual: 0, notEligible: 0, tooFar: 0, tooFew: 0 };
    var usable = [];
    (posts || []).forEach(function (p) {
      if (!p || !p.media_id) return;
      if (p.eligibility === 'CLEAR_UI' || p.eligibility === 'NOT_ANALYZED') {
        skipped.notEligible++; return;
      }
      if (!p.visual || typeof p.visual.brightness !== 'number') { skipped.noVisual++; return; }
      usable.push(p);
    });

    var buckets = Object.create(null);
    var ungrouped = [];
    usable.forEach(function (p) {
      var hit = _nearest(p.visual);
      if (!hit) { skipped.noVisual++; return; }
      if (hit.dist > MAX_DIST) {
        // 어느 원형에도 안 가깝다 — 지어내지 않는다.
        skipped.tooFar++; ungrouped.push(p.media_id); return;
      }
      var b = buckets[hit.arch.id] || (buckets[hit.arch.id] = { arch: hit.arch, members: [], dists: [] });
      b.members.push(p); b.dists.push(hit.dist);
    });

    var groups = [];
    Object.keys(buckets).forEach(function (id) {
      var b = buckets[id];
      if (b.members.length < MIN_GROUP_POSTS) {
        // 1~2장은 스타일이 아니라 우연이다.
        skipped.tooFew += b.members.length;
        b.members.forEach(function (p) { ungrouped.push(p.media_id); });
        return;
      }
      /* 대표 게시물 = 원형에 **가장 가까운** 것. '첫 번째' 로 하면 우연히 뽑힌
         이상한 장이 스타일 얼굴이 된다. */
      var bestI = 0;
      for (var i = 1; i < b.dists.length; i++) if (b.dists[i] < b.dists[bestI]) bestI = i;

      groups.push({
        auto_key: VERSION + ':' + b.arch.id,   // 재계산해도 같은 그룹을 알아본다(§37/§38)
        archetype: b.arch.id,
        name: b.arch.name,
        desc: b.arch.desc,
        media_ids: b.members.map(function (p) { return p.media_id; }),
        cover_media_id: b.members[bestI].media_id,
        confidence: _confidence(b.members, b.dists),
        profile: _profile(b.members)
      });
    });

    // 큰 그룹부터 — 원장 화면에서 자기 대표 스타일이 위에 온다.
    groups.sort(function (a, b) {
      return b.media_ids.length - a.media_ids.length || (a.auto_key < b.auto_key ? -1 : 1);
    });
    return { groups: groups, ungrouped: ungrouped, skipped: skipped, analyzed: usable.length };
  }

  window.IgStyleGrouping = {
    VERSION: VERSION, MIN_GROUP_POSTS: MIN_GROUP_POSTS, MAX_DIST: MAX_DIST,
    ARCHETYPES: ARCHETYPES,
    group: group,
    // 테스트·디버그용
    _dist: _dist, _nearest: _nearest, _profile: _profile, _confidence: _confidence
  };
})();
