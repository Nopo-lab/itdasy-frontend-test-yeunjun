/*
 * work-memory-personalize.js — T8-H+ feature personalization (적용 계층) [2026-08-20]
 *
 * 선택된 기억의 **feature 를 원장 취향에 맞게 보정**해서 편집기에 넣는다.
 *
 * ── 왜 필요했나 (실계정 14회 실발행에서 확인된 구조적 gap)
 *   T8-E 는 personalization 을 memory **랭킹**에만 썼다. 그런데 후보 기억이 사실상 1개면
 *   랭킹을 아무리 바꿔도 편집기에 들어가는 font/color/size/위치는 그대로다.
 *   실측: 속눈썹 12~14회 내내 autoFont=jua → **매번 수정 1**. 젤네일만 우연히 수정 0 이었다.
 *   "내가 하던 반복작업을 기억한다"가 되려면 **고른 기억의 속성까지** 취향으로 맞춰야 한다.
 *
 * ── 어디서 부르나
 *   WorkMemoryEngine.forEditor() 안, _src/_wmTok 태깅 **직전** 한 곳.
 *   이 자리를 고르면 세 가지가 공짜로 따라온다:
 *     · 결과가 _restoreLayers()(= WMSignals.system 래핑)를 지나므로 **자가강화 자동 차단**
 *     · 대상이 wm 레이어뿐이라 T4 undo(wmRemove)가 patch 까지 통째로 되돌린다
 *     · 앞단이 이미 3중 복사라 원본 기억이 안 바뀐다
 *
 * ── 적용 원칙
 *   discrete(font/align/emoji/stroke/shadow/fill/shape) → 교체
 *   continuous(x/y/size/w/h/radius/strokeW) → **bounded delta**. 절대 선호값으로 점프하지 않는다.
 *     원장이 그 기억을 고른 건 그 배치가 마음에 들어서이기도 하다. 취향으로 배치를 통째로
 *     갈아엎으면 "기억"이 아니라 "다른 디자인"이 된다.
 *   feature 마다 **독립 confidence** — 폰트는 확실한데 크기는 애매할 수 있다.
 *   continuous 는 discrete 보다 높은 확신을 요구한다(배치를 흔드는 쪽이 더 위험).
 *
 * ── 안 하는 것
 *   텍스트 내용(T5 소관) · 레이아웃/칸 배치 · 레이어 추가 · base/user 레이어.
 *   기억의 구성을 깨는 변경(before/after 를 1장으로 등)도 하지 않는다.
 *
 * 동기·순수. IDB/네트워크/LLM 접근 0 — 스냅샷만 읽는다.
 */
(function () {
  'use strict';

  // 학습·적용 대상 feature. text 는 없다 — 문구는 T5 소관이다(테스트가 잠근다).
  var FEATURES = {
    font: 'discrete', align: 'discrete', emoji: 'discrete', assetRef: 'discrete',
    stroke: 'discrete', shadow: 'discrete', fill: 'discrete', shape: 'discrete',
    color: 'discrete',
    x: 'continuous', y: 'continuous', size: 'continuous',
    w: 'continuous', h: 'continuous', radius: 'continuous', strokeW: 'continuous'
  };
  // 레이어 타입별로 만질 수 있는 축 — _serLayer 화이트리스트와 같아야 왕복 보존된다.
  var BY_TYPE = {
    text: ['font', 'color', 'align', 'size', 'x', 'y', 'stroke', 'shadow'],
    badge: ['font', 'color', 'align', 'size', 'x', 'y', 'stroke', 'shadow'],
    sticker: ['emoji', 'size', 'x', 'y'],
    rect: ['color', 'x', 'y', 'w', 'h', 'fill', 'strokeW', 'radius', 'shape'],
    line: ['color', 'x', 'y', 'w', 'h', 'strokeW', 'size']
  };

  /* 한 번에 움직일 수 있는 최대 폭. 좌표계는 0~1 정규화라 0.06 이면 화면의 6%.
     숫자 자체보다 "선호값에 절대 도달하지 않는다"가 계약이고 테스트가 그걸 잠근다. */
  var MAX_DELTA = { x: 0.06, y: 0.06, size: 0.03, w: 0.08, h: 0.08, radius: 4, strokeW: 0.004 };
  // continuous 는 배치를 흔들므로 더 높은 확신을 요구한다.
  var MIN_CONF = { discrete: 0.25, continuous: 0.45 };
  // 계층별 영향도 — 멀어질수록 약하게(T8-E TIERS 와 같은 사상).
  var TIERS = { exact: 1.0, service: 0.7, kind: 0.45, global: 0.25 };
  /* 🔴 **적용**은 랭킹보다 높은 기준을 쓴다.
     T8-E 는 kind/global 근거로 점수를 조금 얹을 뿐이라 틀려도 손해가 작다. 하지만 여기서 틀리면
     원장이 보는 화면이 실제로 바뀐다 — "다른 시술 취향이 내 작업에 튀어나온" 것으로 느껴진다.
     그래서 exact 와 service(같은 시술·성격·전후, 사진 수만 다름)만 적용한다.
     kind/global 은 근거로만 남기고 화면은 안 건드린다. */
  var APPLY_TIERS = { exact: 1, service: 1 };
  var GLOBAL_MIN_CONTEXTS = 3;

  function _num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function _tenant() {
    try {
      var v = localStorage.getItem('last_user_id');
      return (v == null || v === '' || v === 'null') ? null : String(v);
    } catch (_e) { void _e; return null; }
  }
  function _engine() { return window.WorkMemoryEngine; }
  function _ctxKey(c) {
    var E = _engine();
    if (E && E.contextKey) return E.contextKey(c);
    c = c || {};
    return [c.service || '', c.photoCount == null ? '' : c.photoCount, c.kind || '',
      c.hasBeforeAfter ? 'ba' : ''].join('|');
  }

  /* 이상치에 안 휘둘리는 대표값. 원장이 0.12·0.13·0.11 을 반복하다 한 번 0.90 을 만들었다고
     크기가 확 튀면 안 된다 → 중앙값 기반(짝수면 가운데 둘의 평균). */
  function robust(vals) {
    var a = (vals || []).map(_num).filter(function (v) { return v !== null; }).sort(function (p, q) { return p - q; });
    if (!a.length) return null;
    var m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  function _isConflict(p) { return (p.positive || 0) > 0 && (p.positive || 0) <= (p.negative || 0); }
  function _net(p) {
    var pos = p.decayedPositive != null ? p.decayedPositive : (p.positive || 0);
    var neg = p.decayedNegative != null ? p.decayedNegative : (p.negative || 0);
    return { pos: pos, neg: neg, net: pos - neg };
  }

  /* 이 feature 의 취향을 계층 따라 찾는다.
     exact 에서 **골라본 적은 있는데 우세값이 없으면** conflict — 아래로 안 내려간다(T8-D 계약).
     "겪어봤는데 결론이 안 난 것"을 다른 상황의 취향으로 덮으면 명확한 증거를 지우는 것이다. */
  function lookup(prefs, feature, ctx) {
    var key = _ctxKey(ctx);
    var mine = [];
    for (var i = 0; i < prefs.length; i++) {
      var p = prefs[i];
      if (p && p.feature === feature) mine.push(p);
    }
    if (!mine.length) return { tier: 'none' };

    var here = mine.filter(function (p) { return p.contextKey === key; });
    if (here.length) {
      var win = here.filter(function (p) { return _net(p).net > 0; })
        .sort(function (a, b) { return _net(b).net - _net(a).net; })[0];
      if (!win && here.some(_isConflict)) return { tier: 'conflict' };
      if (win) return { tier: 'exact', pref: win };
      return { tier: 'none' };
    }
    var same = function (f) {
      return mine.filter(function (p) { return p.context && ctx && f(p.context); })
        .filter(function (p) { return _net(p).net > 0; })
        .sort(function (a, b) { return _net(b).net - _net(a).net; })[0];
    };
    /* service 티어 = "같은 시술·같은 성격·같은 전후여부, 사진 수만 다름".
       hasBeforeAfter 를 빼면 전후비교 취향이 일반 게시물로 샌다(골든이 잡았다). */
    var bySvc = same(function (c) {
      return c.service && c.service === ctx.service && c.kind === ctx.kind
        && !!c.hasBeforeAfter === !!ctx.hasBeforeAfter;
    });
    if (bySvc) return { tier: 'service', pref: bySvc };
    var byKind = same(function (c) { return c.kind && c.kind === ctx.kind; });
    if (byKind) return { tier: 'kind', pref: byKind };

    var g = mine.filter(function (p) { return _net(p).net > 0; });
    var ctxs = {};
    g.forEach(function (p) { ctxs[p.contextKey] = 1; });
    if (Object.keys(ctxs).length >= GLOBAL_MIN_CONTEXTS) {
      return { tier: 'global', pref: g.sort(function (a, b) { return (b.confidence || 0) - (a.confidence || 0); })[0] };
    }
    return { tier: 'none' };
  }

  /* 선호값을 향해 **상한만큼만** 움직인다. 차이가 상한보다 작으면 그대로 도달한다.
     tier 가 멀수록 폭을 더 줄인다 — 확실하지 않은 근거로 배치를 크게 흔들지 않는다. */
  function _bounded(feature, cur, want, tier) {
    var c = _num(cur), w = _num(want);
    if (c === null || w === null) return null;
    var cap = (MAX_DELTA[feature] != null ? MAX_DELTA[feature] : 0.05) * (TIERS[tier] || 1);
    var d = w - c;
    var applied = Math.max(-cap, Math.min(cap, d));
    var next = c + applied;
    if (feature === 'x' || feature === 'y') next = Math.max(0, Math.min(1, next));
    if (feature === 'size' || feature === 'w' || feature === 'h' || feature === 'strokeW') next = Math.max(0, next);
    return { next: next, delta: d, appliedDelta: next - c };
  }

  /* memory / editState / context / snapshot → 개인화된 layers + 근거.
     입력은 절대 mutate 하지 않는다 — 결과 레이어는 전부 새 객체다. */
  function resolveFeaturePatch(memory, editState, context, snapshot) {
    var src = (editState && Array.isArray(editState.layers)) ? editState.layers : [];
    var out = { layers: src.map(function (l) { return Object.assign({}, l); }),
      applied: [], skipped: [], reasons: [] };
    try {
      if (!snapshot || !snapshot.prefs || !snapshot.prefs.length) return out;
      if (!snapshot.tenantId || snapshot.tenantId !== _tenant()) return out;   // 계정 전환 → 남의 취향 금지
      var E = _engine();
      var ctx = (E && E.canonicalContext) ? E.canonicalContext(context) : (context || {});
      var ctxKey = _ctxKey(ctx);
      var prefs = snapshot.prefs.filter(Boolean);
      var drop = [];

      out.layers.forEach(function (L, idx) {
        var axes = BY_TYPE[L && L.type];
        if (!axes) return;
        axes.forEach(function (feature) {
          var kind = FEATURES[feature];
          if (!kind) return;
          /* 스티커 종류는 **negative 만 있는 경우**가 핵심 신호다("매번 지운다").
             lookup 은 우세값(net>0)만 찾으므로 여기서 먼저 본다 — 안 그러면 영영 못 잡는다. */
          if (feature === 'emoji' && L.emoji != null) {
            var selfP = prefs.filter(function (q) {
              return q.feature === 'emoji' && q.value === L.emoji && q.contextKey === ctxKey;
            })[0];
            if (selfP && _net(selfP).net < 0) {
              var sn = _net(selfP);
              drop.push(idx);
              out.applied.push({ idx: idx, feature: 'emoji', before: L.emoji, after: null, note: 'removed',
                confidence: +(selfP.confidence || 0).toFixed(3), context: ctxKey, source: 'exact',
                reason: sn.pos.toFixed(1) + ' positive / ' + sn.neg.toFixed(1) + ' negative' });
              return;
            }
          }
          var r = lookup(prefs, feature, ctx);
          if (r.tier === 'conflict') { out.skipped.push({ idx: idx, feature: feature, why: 'conflict' }); return; }
          if (r.tier === 'none' || !r.pref) return;
          if (!APPLY_TIERS[r.tier]) {
            out.skipped.push({ idx: idx, feature: feature, why: 'weak-context', source: r.tier });
            return;
          }
          var p = r.pref;
          var conf = Math.max(0, Math.min(1, p.confidence || 0)) * (TIERS[r.tier] || 1);
          if (conf < MIN_CONF[kind]) {
            out.skipped.push({ idx: idx, feature: feature, why: 'low-confidence', confidence: +conf.toFixed(3) });
            return;
          }
          var n = _net(p);
          var base = { idx: idx, feature: feature, confidence: +conf.toFixed(3), context: ctxKey,
            source: r.tier, reason: n.pos.toFixed(1) + ' positive / ' + n.neg.toFixed(1) + ' negative' };

          if (kind === 'discrete') {
            if (L[feature] === p.value) return;                       // 이미 취향과 같다
            out.applied.push(Object.assign({}, base, { before: L[feature], after: p.value }));
            L[feature] = p.value;
            return;
          }
          // continuous — 선호값은 robust 대표값, 이동은 bounded delta
          var want = _num(p.value);
          if (want === null) want = robust(p.samples);
          var b = _bounded(feature, L[feature], want, r.tier);
          if (!b || b.appliedDelta === 0) return;
          out.applied.push(Object.assign({}, base, { before: L[feature], preferred: want,
            delta: b.delta, appliedDelta: b.appliedDelta, after: b.next }));
          L[feature] = b.next;
        });
      });

      if (drop.length) {
        out.layers = out.layers.filter(function (_l, i) { return drop.indexOf(i) < 0; });
      }
      out.reasons = out.applied.map(function (a) {
        return a.feature + ': ' + JSON.stringify(a.before) + ' → ' + JSON.stringify(a.after) +
          ' (' + a.source + ' conf ' + a.confidence + ')';
      });
      return out;
    } catch (_e) {
      void _e;
      // fail-open — 개인화는 optional enhancement 다. 실패하면 기억 그대로 쓴다.
      return { layers: src.map(function (l) { return Object.assign({}, l); }),
        applied: [], skipped: [{ feature: '*', why: 'error' }], reasons: [] };
    }
  }

  window.WMPersonalize = {
    FEATURES: FEATURES, BY_TYPE: BY_TYPE, MAX_DELTA: MAX_DELTA, MIN_CONF: MIN_CONF, TIERS: TIERS,
    robust: robust, lookup: lookup, resolveFeaturePatch: resolveFeaturePatch
  };
})();
