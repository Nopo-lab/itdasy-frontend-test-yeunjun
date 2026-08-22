/* photo-context.js — 사진 1장의 '문맥'을 한 번만 계산해 재사용하는 단일 진입점.  [Phase 1 / 관측 전용]
 *
 * ⚠️ **이 모듈은 지금 아무 동작도 바꾸지 않는다.** 계산해서 캐시하고 계측 로그만 남긴다.
 *    소비처(자동 배치·contentFit)는 Phase 2(shadow) 통과 전까지 붙이지 않는다.
 *
 * [왜 지금 이걸 만드나 — 2026-08-21 Phase 0 실측 근거]
 *   실사용 원장 edit_state 가 **0건**이다(테스트 계정 1개, 39장뿐). 즉 지금은
 *   "배치를 학습해서 적용하는 단계"가 아니라 **"원장이 실제로 어떻게 편집하는지 측정하는 단계"** 다.
 *   같은 실측에서 자유 텍스트의 75%가 `center` 였는데, 이는 개인 선호가 아니라
 *   **편집기 기본 spawn 위치를 그대로 수용한 결과일 가능성이 높다**(피사체도 대개 center 라
 *   오히려 겹치는 방향이었다). 그래서 이 모듈의 결과로 배치를 강제하는 코드를 만들면 안 된다.
 *
 * [단일 진입점인 이유]
 *   T8 이 `canonicalContext()` 를 한 곳으로 모은 것과 같은 이유다. 두 곳에서 각자 계산하면
 *   언젠가 어긋나고, 실제로 두 번 어긋났다(select 가 service 를 빠뜨림 / flow 가 wmContext 미전달).
 *   그래서 여기서도 `of()` 하나만 공개한다. "새로 계산" 을 직접 부르는 경로를 만들지 마라 —
 *   그게 같은 사진을 반복 분석해 배터리와 (Vision 배선 후엔) 돈을 태우는 유일한 원인이다.
 *
 * [담지 않는 것] 원본 바이트 · dataURL · EXIF · 얼굴 임베딩 · 랜드마크 좌표 · 고객 정보.
 *   숫자와 라벨만 담는다. 이 파일이 그 경계를 지키는 마지막 지점이다.
 *
 * 공개: window.PhotoContext.of(url, opts) → Promise<ctx|null>
 *       window.PhotoContext.peek(hashOrUrl) → ctx|null   (동기, 캐시만)
 *       window.PhotoContext.stats()        → 계측 요약
 */
(function () {
  'use strict';
  if (window.PhotoContext) return;

  /* sRGB → 선형 변환표(WCAG 2.x). 픽셀마다 pow() 를 부르지 않으려고 256칸을 미리 만든다.
     감마 인코딩된 Y 로 대비를 어림하면 **중간톤에서 실제와 어긋난다** — 가독성은
     "대충 맞다"로 넘길 축이 아니라서(안 보이면 게시물이 망한다) 표준대로 간다. */
  var SRGB_LIN = (function () {
    var t = new Float32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i / 255;
      t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    return t;
  })();

  var SCHEMA = 'pctx-v3';   // v2: skinFrac·seam(ContentIntent) · v3: lumGrid(가독성 판정)
  var SAMPLE = 48;              // 다운샘플 한 변(px). safe-zone 은 36, kind 분류는 96 을 쓴다 —
                                //   그 중간값. 색·밝기 통계는 이 해상도로 충분하고 8ms 안쪽이다.
  var L0_MAX = 24;              // 세션 캐시 상한(사진 24장 = 슬롯 몇 개 분)
  var _l0 = Object.create(null);
  var _l0order = [];
  var _metrics = { computed: 0, l0hit: 0, l1hit: 0, failed: 0, ms: [] };

  // ── 저수준 ────────────────────────────────────────────────
  function _load(url) {
    return new Promise(function (res) {
      var im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = function () { res(im); };
      im.onerror = function () { res(null); };
      im.src = url;
    });
  }

  /* photoHash — 같은 사진을 두 번 분석하지 않기 위한 키.
     dataURL/blob URL 은 매번 달라지므로 URL 자체는 키가 될 수 없다 → 픽셀에서 뽑는다.
     암호학적 용도가 아니라 **캐시 키**이므로 축소본의 값 해시로 충분하다(FNV-1a).
     ⚠️ 서버로 보내지 않는다 — 해시만 봐도 '다른 샵도 이 사진을 썼다'를 알 수 있으면 안 된다. */
  function _hash(data) {
    var h = 0x811c9dc5;
    for (var i = 0; i < data.length; i += 17) {     // 전 픽셀 필요 없음 — 17 간격 표본
      h ^= data[i];
      h = (h * 0x01000193) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  function _zoneOf(x, y) {
    if (x == null || y == null) return null;
    var col = x < 1 / 3 ? 0 : (x < 2 / 3 ? 1 : 2);
    var row = y < 1 / 3 ? 0 : (y < 2 / 3 ? 1 : 2);
    return ['upper-left', 'upper-center', 'upper-right',
      'center-left', 'center', 'center-right',
      'lower-left', 'lower-center', 'lower-right'][row * 3 + col];
  }

  // ── 픽셀 통계 (한 번의 getImageData 로 전부) ────────────────
  function _analyzePixels(img) {
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return null;
    var ratio = iw / ih;
    var nw = ratio >= 1 ? SAMPLE : Math.max(1, Math.round(SAMPLE * ratio));
    var nh = ratio >= 1 ? Math.max(1, Math.round(SAMPLE / ratio)) : SAMPLE;
    var c = document.createElement('canvas');
    c.width = nw; c.height = nh;
    var g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, nw, nh);
    var d = g.getImageData(0, 0, nw, nh).data;

    var n = nw * nh, sumY = 0, sumY2 = 0, sumSat = 0, sumR = 0, sumB = 0;
    var white = 0, skin = 0, mnx = nw, mny = nh, mxx = -1, mxy = -1;
    var bins = Object.create(null);              // 주요색 — 4bit/채널 양자화
    var lum = new Float32Array(n);

    for (var y = 0; y < nh; y++) {
      for (var x = 0; x < nw; x++) {
        var i = (y * nw + x) * 4, r = d[i], gg = d[i + 1], b = d[i + 2];
        var Y = 0.299 * r + 0.587 * gg + 0.114 * b;
        lum[y * nw + x] = Y;
        sumY += Y; sumY2 += Y * Y; sumR += r; sumB += b;
        var mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
        sumSat += mx ? (mx - mn) / mx : 0;
        if (r > 226 && gg > 226 && b > 226 && Math.abs(r - gg) < 24 && Math.abs(gg - b) < 24) white++;

        var Cb = 128 - 0.168736 * r - 0.331264 * gg + 0.5 * b;
        var Cr = 128 + 0.5 * r - 0.418688 * gg - 0.081312 * b;
        if (Y > 45 && Cb >= 77 && Cb <= 130 && Cr >= 134 && Cr <= 176 && r > 60) {
          skin++;
          if (x < mnx) mnx = x; if (x > mxx) mxx = x;
          if (y < mny) mny = y; if (y > mxy) mxy = y;
        }
        var key = ((r >> 4) << 8) | ((gg >> 4) << 4) | (b >> 4);
        bins[key] = (bins[key] || 0) + 1;
      }
    }

    // 라플라시안 분산 — 흐림 판정. 다운샘플본이라 절대값이 아닌 상대 지표로만 쓴다.
    var lapSum = 0, lapSum2 = 0, lapN = 0;
    for (var yy = 1; yy < nh - 1; yy++) {
      for (var xx = 1; xx < nw - 1; xx++) {
        var k = yy * nw + xx;
        var L = -4 * lum[k] + lum[k - 1] + lum[k + 1] + lum[k - nw] + lum[k + nw];
        lapSum += L; lapSum2 += L * L; lapN++;
      }
    }
    var lapVar = lapN ? (lapSum2 / lapN) - Math.pow(lapSum / lapN, 2) : 0;

    /* 이음매(seam) — 정중앙에서 밝기가 **얼마나 급하게 끊기나**.
       전·후 비교 사진은 두 장을 붙인 거라 중앙에 인위적 경계가 생긴다.
       절대값은 못 쓴다(복잡한 사진은 어디를 재도 크다) → **평균 인접차 대비 배수**로 낸다. */
    function _seam(vertical) {
      var mid = vertical ? (nw >> 1) : (nh >> 1), best = 0, off, i2, len, sum;
      for (off = -1; off <= 1; off++) {
        var c2 = mid + off;
        if (c2 < 1 || c2 >= (vertical ? nw : nh)) continue;
        sum = 0; len = vertical ? nh : nw;
        for (i2 = 0; i2 < len; i2++) {
          sum += vertical
            ? Math.abs(lum[i2 * nw + c2] - lum[i2 * nw + c2 - 1])
            : Math.abs(lum[c2 * nw + i2] - lum[(c2 - 1) * nw + i2]);
        }
        if (sum / len > best) best = sum / len;
      }
      // 기준선 — 같은 방향 전체 평균 인접차
      var tot = 0, cnt = 0, a, b2;
      if (vertical) {
        for (a = 0; a < nh; a++) for (b2 = 1; b2 < nw; b2++) { tot += Math.abs(lum[a * nw + b2] - lum[a * nw + b2 - 1]); cnt++; }
      } else {
        for (a = 1; a < nh; a++) for (b2 = 0; b2 < nw; b2++) { tot += Math.abs(lum[a * nw + b2] - lum[(a - 1) * nw + b2]); cnt++; }
      }
      var base = cnt ? tot / cnt : 0;
      return base > 1 ? Math.round(best / base * 1000) / 1000 : 0;
    }

    /* 8×8 휘도 격자 — **글자를 어디 놓든 그 자리 배경 밝기를 알 수 있게** 한다.
       흰 글자를 흰 배경에 놓는 사고를 막는 게 목적이다. 전체 평균으론 못 막는다:
       사진 전체는 어두운데 글자 놓을 자리만 밝은 경우가 실제로 흔하다(창문·조명·시술포).
       64개 숫자라 캐시에 얹어도 부담이 없고, 이걸 위해 사진을 다시 열지 않아도 된다. */
    var GRID = 8, grid = new Array(GRID * GRID), gsum = new Float64Array(GRID * GRID), gcnt = new Uint32Array(GRID * GRID);
    for (var gy = 0; gy < nh; gy++) {
      var gr = Math.min(GRID - 1, Math.floor(gy / nh * GRID));
      for (var gx = 0; gx < nw; gx++) {
        var gc = Math.min(GRID - 1, Math.floor(gx / nw * GRID));
        var gi2 = (gy * nw + gx) * 4;
        // WCAG 상대휘도 — 대비비를 표준대로 계산하려면 **선형** 값이어야 한다
        gsum[gr * GRID + gc] += 0.2126 * SRGB_LIN[d[gi2]] + 0.7152 * SRGB_LIN[d[gi2 + 1]] + 0.0722 * SRGB_LIN[d[gi2 + 2]];
        gcnt[gr * GRID + gc]++;
      }
    }
    for (var gk = 0; gk < GRID * GRID; gk++) {
      grid[gk] = gcnt[gk] ? Math.round(gsum[gk] / gcnt[gk] * 10000) / 10000 : 0;
    }

    var meanY = sumY / n;
    var top = Object.keys(bins).sort(function (a, b2) { return bins[b2] - bins[a]; }).slice(0, 3);
    var skinFrac = skin / n;
    // 피부가 너무 적거나(없음) 너무 많으면(클로즈업·살색 배경) 판정을 포기한다.
    //   safe-zone.js 와 같은 임계 — 두 곳이 다르면 같은 사진에 다른 답이 나온다.
    var region = (mxx >= 0 && skinFrac >= 0.03 && skinFrac <= 0.72) ? {
      x: mnx / nw, y: mny / nh, w: (mxx - mnx + 1) / nw, h: (mxy - mny + 1) / nh
    } : null;

    return {
      w: iw, h: ih, aspect: Math.round(ratio * 1000) / 1000,
      brightness: Math.round(meanY / 255 * 1000) / 1000,
      contrast: Math.round(Math.sqrt(Math.max(0, sumY2 / n - meanY * meanY)) / 128 * 1000) / 1000,
      saturation: Math.round(sumSat / n * 1000) / 1000,
      warmth: Math.round((sumR - sumB) / n / 255 * 1000) / 1000,
      whiteRatio: Math.round(white / n * 1000) / 1000,
      skinFrac: Math.round(skinFrac * 1000) / 1000,      // region 이 null 이어도 원값은 필요하다
      seamV: _seam(true),                                 // 좌우 분할(전·후 비교)
      seamH: _seam(false),                                // 상하 분할(텍스트 밴드)
      lumGrid: grid, lumGridSize: GRID,                   // 8×8 **WCAG 상대휘도** — 가독성 판정용
      dominantColors: top.map(function (k) {
        var v = parseInt(k, 10);
        return '#' + [(v >> 8) & 15, (v >> 4) & 15, v & 15]
          .map(function (q) { var s = (q * 17).toString(16); return s.length < 2 ? '0' + s : s; }).join('');
      }),
      subjectRegion: region,
      subjectZone: region ? _zoneOf(region.x + region.w / 2, region.y + region.h / 2) : null,
      blurScore: Math.round(Math.min(1, lapVar / 400) * 1000) / 1000,
      _hash: _hash(d)
    };
  }

  /* 사진 종류 — 기존 photo-kind-classifier 와 **같은 임계**를 쓴다(비율·흰배경).
     여기서 새 기준을 만들면 잇비 버튼과 편집기가 서로 다른 답을 내게 된다. */
  function _kindOf(s) {
    if (s.aspect < 0.72) return 'kakao';
    if (s.aspect > 1.45 && s.aspect < 1.85 && s.whiteRatio > 0.62) return 'card';
    if (s.whiteRatio > 0.72) return 'price';
    return 'unknown';        // 못 알아내면 추론하지 않는다 (T8 원칙과 동일)
  }

  function _confidence(s) {
    var c = 0.3;
    if (s.subjectRegion) c += 0.35;
    if (s.blurScore > 0.15) c += 0.15;                       // 너무 흐리면 신뢰 낮춤
    if (s.brightness > 0.12 && s.brightness < 0.92) c += 0.2;
    return Math.round(Math.min(1, c) * 100) / 100;
  }

  // ── L1 (IDB) — app-gallery-db.js 의 저장소를 재사용 ──────────
  function _l1get(hash) {
    try {
      if (typeof window.wmLearnGet !== 'function') return Promise.resolve(null);
      return window.wmLearnGet('photo_contexts', SCHEMA + ':' + hash).catch(function () { return null; });
    } catch (_e) { void _e; return Promise.resolve(null); }
  }
  function _l1put(ctx) {
    try {
      if (typeof window.wmLearnPut !== 'function') return;
      window.wmLearnPut('photo_contexts', Object.assign({ id: SCHEMA + ':' + ctx.photoHash }, ctx))
        .catch(function () { /* quota·미지원 → 조용히 포기. L0 만으로도 동작한다 */ });
    } catch (_e) { void _e; }
  }

  function _l0put(ctx) {
    _l0[ctx.photoHash] = ctx;
    _l0order.push(ctx.photoHash);
    while (_l0order.length > L0_MAX) {
      var old = _l0order.shift();
      if (_l0order.indexOf(old) < 0) delete _l0[old];
    }
  }

  /* 계측 — 이 Phase 의 **유일한 산출물**. 모바일 p90 이 목표(<400ms)를 넘는지 보려고 만든다.
     PII·이미지·해시는 로그로 내보내지 않는다(해시는 메모리에만). */
  function _mark(ms, how, ctx) {
    _metrics.ms.push(ms);
    if (_metrics.ms.length > 200) _metrics.ms.shift();
    if (how === 'l0') _metrics.l0hit++;
    else if (how === 'l1') _metrics.l1hit++;
    else _metrics.computed++;
    /* stats() 는 세션 메모리라 새로고침이면 사라진다 — 장기 p50/p90 은 WMMetrics 가 누적한다.
       계측 모듈이 없어도(로드 실패·롤백) 여기는 그대로 동작해야 한다. */
    try { if (window.WMMetrics) window.WMMetrics.observePhotoContext(ctx || null, how, ms); }
    catch (_m) { void _m; }
    try {
      if (window.ITDASY_PCTX_DEBUG) console.info('[PHOTO_CTX]', how, Math.round(ms) + 'ms');
    } catch (_e) { void _e; }
  }

  // ── 공개 API ──────────────────────────────────────────────
  /* of(url) — 유일한 진입점. 실패해도 **절대 던지지 않는다**(null 반환).
     이 모듈이 죽어도 앱은 지금과 똑같이 동작해야 한다 — 그게 Phase 1 의 계약이다. */
  function of(url, opts) {
    opts = opts || {};
    if (!url) return Promise.resolve(null);
    var t0 = (window.performance && performance.now) ? performance.now() : Date.now();

    // 호출자가 이미 아는 해시가 있으면 L0 를 먼저 본다(같은 사진 재진입 경로).
    if (opts.hash && _l0[opts.hash]) {
      _mark(0, 'l0', _l0[opts.hash]);
      return Promise.resolve(_l0[opts.hash]);
    }
    return _load(url).then(function (img) {
      if (!img) { _metrics.failed++; _mark(0, 'fail', null); return null; }
      var s;
      try { s = _analyzePixels(img); } catch (_e) { void _e; s = null; }
      if (!s) { _metrics.failed++; _mark(0, 'fail', null); return null; }

      var hash = s._hash;
      delete s._hash;
      if (_l0[hash]) {
        _mark((performance.now ? performance.now() : Date.now()) - t0, 'l0', _l0[hash]);
        return _l0[hash];
      }
      return _l1get(hash).then(function (cached) {
        var now = (window.performance && performance.now) ? performance.now() : Date.now();
        if (cached && cached.schema === SCHEMA) {
          _l0put(cached);
          _mark(now - t0, 'l1', cached);
          return cached;
        }
        var ctx = Object.assign({}, s, {
          schema: SCHEMA,
          photoHash: hash,
          kind: _kindOf(s),
          confidence: _confidence(s),
          source: 'local',
          computedAt: Date.now()
        });
        _l0put(ctx);
        _l1put(ctx);
        _mark(now - t0, 'compute', ctx);
        return ctx;
      });
    }).catch(function () { _metrics.failed++; return null; });
  }

  function peek(k) { return (k && _l0[k]) || null; }

  function stats() {
    var a = _metrics.ms.slice().sort(function (x, y) { return x - y; });
    var p = function (q) { return a.length ? Math.round(a[Math.min(a.length - 1, Math.floor(a.length * q))]) : null; };
    var tot = _metrics.computed + _metrics.l0hit + _metrics.l1hit;
    return {
      schema: SCHEMA,
      computed: _metrics.computed, l0hit: _metrics.l0hit, l1hit: _metrics.l1hit,
      failed: _metrics.failed,
      cacheHitRate: tot ? Math.round((_metrics.l0hit + _metrics.l1hit) / tot * 100) / 100 : 0,
      p50ms: p(0.5), p90ms: p(0.9), maxMs: a.length ? Math.round(a[a.length - 1]) : null
    };
  }

  /* 정규화 rect(0~1) 아래의 **평균 상대휘도·편차**를 격자에서 읽는다.
     편차를 같이 내는 이유: 배경이 얼룩덜룩하면 어떤 색을 골라도 일부는 안 보인다.
     그때는 색만 바꾸지 말고 외곽선·그림자로 가야 한다. */
  function regionLum(pctx, rect) {
    if (!pctx || !pctx.lumGrid || !rect) return null;
    var G = pctx.lumGridSize || 8, g = pctx.lumGrid;
    var x0 = Math.max(0, Math.min(G - 1, Math.floor(rect.x * G)));
    var y0 = Math.max(0, Math.min(G - 1, Math.floor(rect.y * G)));
    var x1 = Math.max(x0, Math.min(G - 1, Math.ceil((rect.x + rect.w) * G) - 1));
    var y1 = Math.max(y0, Math.min(G - 1, Math.ceil((rect.y + rect.h) * G) - 1));
    var vals = [];
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) vals.push(g[y * G + x]);
    if (!vals.length) return null;
    var mean = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    var v = vals.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / vals.length;
    return {
      mean: Math.round(mean * 1000) / 1000,
      sd: Math.round(Math.sqrt(v) * 1000) / 1000,
      min: Math.round(Math.min.apply(null, vals) * 1000) / 1000,
      max: Math.round(Math.max.apply(null, vals) * 1000) / 1000,
      cells: vals.length
    };
  }

  /* 스테이지 좌표 → **사진 좌표** 변환. 이게 없으면 휘도 격자를 엉뚱한 자리에서 읽는다.
     휘도 격자는 사진 전체 기준인데 글자 rect 는 화면(스테이지) 기준이다.
     게시물 비율(1:1·4:5·9:16)이 사진 비율과 다르면 `cover` 가 사진을 잘라서 둘이 어긋난다.

     🔴 실제로 틀렸다(브라우저 실측으로 잡음): 같은 밝은 사진인데 4:5 에선 글자에 외곽선이
        붙고 1:1 에선 안 붙었다. 흰 카드 사진에 흰 글자가 그대로 남기도 했다.
        유닛테스트로는 못 잡는다 — 비율이 같은 합성 데이터만 넣고 있었기 때문이다.

     contain 이면 사진 밖(레터박스)이 나올 수 있다 → 그 부분은 사진이 아니므로 **null** 을 준다
     (배경색 위 가독성은 사진 통계로 답할 수 없다. 모르면 모른다고 한다). */
  function mapStageRect(pctx, rect, stageAspect, fitMode) {
    if (!pctx || !rect || !stageAspect) return null;
    var pa = pctx.aspect;                       // 사진 가로/세로
    if (!pa) return null;
    var x = rect.x, y = rect.y, w = rect.w, h = rect.h;
    if (fitMode === 'contain') {
      // 사진이 스테이지 안에 들어가고 남는 쪽은 배경 — 사진 좌표로 되돌린 뒤 범위를 벗어나면 포기
      if (pa > stageAspect) { var vh = stageAspect / pa; y = (y - (1 - vh) / 2) / vh; h = h / vh; }
      else { var vw = pa / stageAspect; x = (x - (1 - vw) / 2) / vw; w = w / vw; }
      if (x + w < 0 || x > 1 || y + h < 0 || y > 1) return null;   // 전부 레터박스 위
    } else {
      // cover(기본) — 넘치는 쪽이 잘린다. 보이는 구간만 사진 좌표로 환산
      if (pa > stageAspect) { var vw2 = stageAspect / pa; x = (1 - vw2) / 2 + x * vw2; w = w * vw2; }
      else { var vh2 = pa / stageAspect; y = (1 - vh2) / 2 + y * vh2; h = h * vh2; }
    }
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)),
      w: Math.max(0, Math.min(1, w)), h: Math.max(0, Math.min(1, h)) };
  }

  window.PhotoContext = { of: of, peek: peek, stats: stats,
    regionLum: regionLum, mapStageRect: mapStageRect, SCHEMA: SCHEMA };
})();
