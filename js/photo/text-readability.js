/* text-readability.js — 글자가 **실제로 보이는지** 확인하고, 안 보이면 최소한만 고친다. [STAGE C]
 *
 * [왜 이게 필요한가 — 편집기 기본값이 만드는 실제 사고]
 *   자유 텍스트는 생성 순간 흰색(`COLORS[0]`)으로 시작한다. 원장이 고른 색이 아니라 **기본값**이다.
 *   그런데 실측한 원장 피드를 보면 왁싱은 6업종 중 가장 밝다(상대휘도 기준 배경이 밝다).
 *   밝은 사진 + 흰 글자 = 안 보인다. 지금은 아무도 이걸 안 막는다.
 *
 * [기본값을 취향으로 오인하지 않는다]
 *   "색이 이미 있으니 원장이 고른 것" 이라고 판단하면 영영 못 고친다.
 *   편집기가 미리 채워둔 값(`#FFFFFF`)과 원장이 고른 값을 **구분해서** 받는다.
 *   같은 실수를 BrandKit 에서 이미 한 번 했다 — `get()` 이 저장 안 해도 기본색을 돌려줘서
 *   그게 인스타 실관찰을 이겼다. 기본값은 증거가 아니다.
 *
 * [고치는 순서 — 덜 눈에 띄는 것부터]
 *   1) 색   — 원장이 안 고른 축일 때만. 가장 깨끗하게 해결된다.
 *   2) 외곽선 — 색을 못 바꿀 때(원장이 골랐을 때). 글자 모양은 유지된다.
 *   3) 그림자 — 배경이 얼룩덜룩해 어떤 단색으로도 안 될 때.
 *   순서를 뒤집으면 원장 디자인을 필요 이상으로 건드린다.
 *
 * [대비는 WCAG 2.x 표준으로 잰다]
 *   감마 인코딩된 밝기로 어림하면 중간톤에서 어긋난다. PhotoContext 가 **선형 상대휘도**를
 *   격자로 들고 있으므로 표준 공식 (L1+0.05)/(L2+0.05) 를 그대로 쓴다.
 *   기준은 3.0 — 편집기 글자는 크다(기본 40px, 굵은 폰트). WCAG 의 '큰 텍스트' 기준이다.
 *
 * 공개: window.TextReadability.check(hex, bg) → {ratio, ok}
 *       window.TextReadability.resolve(opts)  → {color?, stroke?, shadow?, reason} | null
 */
(function () {
  'use strict';
  if (window.TextReadability) return;

  var MIN_RATIO = 3.0;        // WCAG AA 큰 텍스트
  var GOOD_RATIO = 4.5;       // 여유 있게 넘기고 싶은 목표
  var BUSY_SD = 0.12;         // 배경 휘도 편차가 이보다 크면 단색으로는 못 이긴다

  var SRGB_LIN = (function () {
    var t = new Float32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i / 255;
      t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    return t;
  })();

  function _hex(h) {
    if (typeof h !== 'string') return null;
    var s = h.trim().replace(/^#/, '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }

  // WCAG 상대휘도
  function relLum(hex) {
    var c = _hex(hex);
    if (!c) return null;
    return 0.2126 * SRGB_LIN[c[0]] + 0.7152 * SRGB_LIN[c[1]] + 0.0722 * SRGB_LIN[c[2]];
  }

  function ratio(l1, l2) {
    if (l1 == null || l2 == null) return null;
    var a = Math.max(l1, l2), b = Math.min(l1, l2);
    return Math.round((a + 0.05) / (b + 0.05) * 100) / 100;
  }

  /* bg = PhotoContext.regionLum() 결과 {mean, sd, min, max}.
     **최악의 칸**으로 판정한다 — 평균으로 보면 "대체로 보인다"가 되는데,
     실제로는 한 귀퉁이만 안 보여도 원장은 다시 고친다. */
  function check(hex, bg) {
    var tl = relLum(hex);
    if (tl == null || !bg) return { ratio: null, ok: null, reason: 'unknown' };
    var rMean = ratio(tl, bg.mean);
    var rWorst = Math.min(ratio(tl, bg.min), ratio(tl, bg.max));
    return {
      ratio: rWorst, meanRatio: rMean, ok: rWorst >= MIN_RATIO,
      textLum: Math.round(tl * 10000) / 10000, busy: bg.sd > BUSY_SD
    };
  }

  /* opts = { color, colorIsDefault, bg, allowColorChange, hasStroke, hasShadow }
     반환 null = **고칠 게 없다**. 이 제품에서 "아무것도 안 함" 은 정상적인 결론이다. */
  function resolve(opts) {
    opts = opts || {};
    var bg = opts.bg;
    if (!bg) return null;
    var cur = check(opts.color, bg);
    if (cur.ok === null) return null;                    // 색을 못 읽었다 — 손대지 않는다
    if (cur.ok && !cur.busy) return null;                // 이미 잘 보인다

    var out = { reason: cur.busy && cur.ok ? 'busy_background' : 'low_contrast',
      before: cur.ratio, busy: cur.busy };

    /* 1) 색 — 원장이 안 고른 축일 때만 바꾼다.
       배경이 얼룩덜룩하면 단색으로는 못 이기므로 색은 건드리지 않고 외곽선으로 간다. */
    if (opts.allowColorChange !== false && opts.colorIsDefault && !cur.busy) {
      var white = relLum('#FFFFFF'), dark = relLum('#15181D');   // 편집기 팔레트의 두 극단
      var rw = Math.min(ratio(white, bg.min), ratio(white, bg.max));
      var rd = Math.min(ratio(dark, bg.min), ratio(dark, bg.max));
      var pick = rw >= rd ? '#FFFFFF' : '#15181D';
      var best = Math.max(rw, rd);
      if (best >= MIN_RATIO && best > cur.ratio) {
        out.color = pick; out.after = best;
        if (best < GOOD_RATIO) out.shadow = true;        // 아슬아슬하면 그림자로 받쳐준다
        return out;
      }
    }

    /* 2) 외곽선 — 글자 모양·색을 유지하면서 배경에서 떼어낸다.
       편집기의 `L.stroke` 는 `-webkit-text-stroke:1px rgba(0,0,0,.5)` 다(기존 구현 재사용). */
    if (!opts.hasStroke) { out.stroke = true; }

    /* 3) 그림자 — 외곽선만으로 부족하거나 배경이 얼룩덜룩할 때 같이 건다. */
    if (!opts.hasShadow && (cur.busy || cur.ratio < 2.0)) { out.shadow = true; }

    if (!out.color && !out.stroke && !out.shadow) return null;   // 이미 다 걸려 있다
    return out;
  }

  window.TextReadability = {
    MIN_RATIO: MIN_RATIO, GOOD_RATIO: GOOD_RATIO, BUSY_SD: BUSY_SD,
    relLum: relLum, ratio: ratio, check: check, resolve: resolve
  };
})();
