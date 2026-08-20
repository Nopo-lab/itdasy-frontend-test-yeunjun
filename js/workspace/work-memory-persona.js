/*
 * work-memory-persona.js — T8-E personalization (bounded) [2026-08-20]
 *
 * T8-C/D 가 계산한 원장 취향을 T3 select() 에 **경계 안에서** 얹는다.
 * 목표는 "개인화가 추가됐다"가 아니라 **기존 추천 품질을 보존하면서 취향을 반영하는 것**.
 *
 * ── 설계 계약
 *   finalTotal = 기존 T3 total + bounded personalization(0..MAX)
 *   · 기존 6축 가중치·범위는 **손대지 않는다**. 이 축은 순수 가산이다.
 *   · MAX = 15 — photoFit 40 은 물론 baFit 25 하나도 못 뒤집는다.
 *     "개인 취향이 상황 적합성을 이기면 안 된다"가 이 숫자의 근거다.
 *
 * ── 왜 bonus 를 음수로 두지 않았나 (판단 근거)
 *   negative 증거는 bonus 를 **0 까지 깎는다**. 더 내려가면 상황이 완벽히 맞는 memory 를
 *   취향 하나로 강등시킬 수 있고, 그건 "기존 추천 품질 보존" 과 정면으로 부딪친다.
 *   깎는 것으로 충분하다 — 그 memory 는 개인화 이득을 못 받고 기존 T3 점수로 겨룬다.
 *
 * ── "경험 없음" vs "결론 없음" (T8-D 에서 얻은 계약)
 *   갈린 context(jua 8 / gamja 8)는 **경험이 없는 게 아니라 결론이 안 난 것**이다.
 *   여기에 global 취향을 끌어와 덮으면, 원장이 실제로 반반 갈렸다는 명확한 증거를 지운다.
 *   → contextMatch = 'conflict' 로 구분하고 bonus 0. 'none'(경험 없음)일 때만 global 을 쓴다.
 *
 * ── 성능 (select 는 동기 경로다)
 *   IDB 는 여기서 안 읽는다. warm() 이 미리 스냅샷을 만들고 score() 는 **동기·순수**다.
 *   후보가 몇 개든 스냅샷 조회는 select 당 1회(테스트가 잠근다).
 *   스냅샷이 없으면(콜드스타트·미warm) bonus 0 — 기존 T3 와 완전히 같게 동작한다.
 *
 * ── LLM 안 부른다. 전부 로컬 결정론 — 비용 0 · 재현 가능 · 설명 가능.
 */
(function () {
  'use strict';

  var MAX = 15;                 // personalization 상한 (테스트가 잠금)
  // fallback 단계별 영향도 — 멀어질수록 약해진다.
  //   "nail 1장 service 에서 JUA 를 좋아한다"가 hair before/after 를 같은 강도로 올리면 안 된다.
  var TIERS = { exact: 1.0, service: 0.7, kind: 0.45, global: 0.25 };
  // feature 별 비중 — 폰트가 인상을 가장 크게 좌우한다(합 1.0).
  var FEATURE_W = { font: 0.5, color: 0.3, align: 0.2 };
  var GLOBAL_MIN_CONTEXTS = 3;  // global 로 인정할 최소 서로 다른 context 수(T8-C 와 동일 기준)

  var _snap = null;             // { tenantId, prefs, at }

  function _tenant() {
    try {
      var v = localStorage.getItem('last_user_id');
      return (v == null || v === '' || v === 'null') ? null : String(v);
    } catch (_e) { void _e; return null; }
  }

  /* layer 의 스타일 값 → 문자열. font 는 편집기에서 객체({key,...})로 들고 다니지만
     preference 의 value 는 key 문자열이다. 여기서 한 번에 맞춘다. */
  function _val(feature, l) {
    var v = l[feature];
    if (v == null) return null;
    if (typeof v === 'object') v = v.key;
    if (v == null || v === '') return null;
    return String(v);
  }

  /* memory 에서 취향 비교 대상이 되는 스타일 값들을 뽑는다.
     텍스트/배지 레이어만 — 이미지·스티커는 폰트·정렬 개념이 없다. */
  function styleOf(m) {
    var out = { font: [], color: [], align: [] };
    var ls = (m && m.layers) || [];
    ls.forEach(function (l) {
      if (!l || (l.type !== 'text' && l.type !== 'badge')) return;
      Object.keys(out).forEach(function (f) {
        var v = _val(f, l);
        if (v && out[f].indexOf(v) < 0) out[f].push(v);
      });
    });
    return out;
  }

  /* [T8-H] key 는 엔진이 소유한다 — 여기서 따로 만들면 축이 추가될 때 조용히 드리프트한다
     (before/after 축이 붙었을 때 실제로 갈릴 뻔했다). 엔진이 없을 때만 같은 규칙으로 폴백. */
  function _ctxKey(c) {
    var E = window.WorkMemoryEngine;
    if (E && E.contextKey) return E.contextKey(c);
    c = c || {};
    return [c.service || '', c.photoCount == null ? '' : c.photoCount, c.kind || '',
      c.hasBeforeAfter ? 'ba' : ''].join('|');
  }
  function _isConflict(p) {
    // 우세하지 않다 = 결론이 안 났다. positive 가 0 이면 애초에 고른 적이 없는 것.
    return (p.positive || 0) > 0 && (p.positive || 0) <= (p.negative || 0);
  }

  /* 한 feature·value 에 대해 계층을 따라 근거를 찾는다.
     반환 tier 가 곧 영향도이고, state 로 '경험 없음/결론 없음'을 구분한다. */
  function lookup(prefs, feature, value, ctx) {
    var key = _ctxKey(ctx);
    var mine = prefs.filter(function (p) { return p.feature === feature; });
    var here = mine.filter(function (p) { return p.contextKey === key; });

    // ① exact — 이 상황을 겪어봤다
    if (here.length) {
      var hit = here.filter(function (p) { return p.value === value; })[0];
      // 이 context 에서 뭔가를 골라본 적이 있는데 우세값이 없다 → conflict. global 로 덮지 않는다.
      var decided = here.filter(function (p) { return (p.positive || 0) > (p.negative || 0); }).length > 0;
      var experienced = here.filter(function (p) { return (p.positive || 0) > 0; }).length > 0;
      if (!decided && experienced) return { tier: 'conflict', pref: hit || null };
      if (hit) return { tier: 'exact', pref: hit };
      // 이 상황을 겪었지만 이 값은 안 써봤다 → 이 memory 엔 근거 없음
      if (decided) return { tier: 'none', pref: null };
    }
    // ② service 일치 — 같은 시술, 사진 수만 다름
    var bySvc = mine.filter(function (p) {
      return p.value === value && p.context && ctx && p.context.service && p.context.service === ctx.service;
    })[0];
    if (bySvc) return _isConflict(bySvc) ? { tier: 'conflict', pref: bySvc } : { tier: 'service', pref: bySvc };
    // ③ kind 일치 — 시술은 다르지만 같은 성격(service/promotion)
    var byKind = mine.filter(function (p) {
      return p.value === value && p.context && ctx && p.context.kind && p.context.kind === ctx.kind;
    })[0];
    if (byKind) return _isConflict(byKind) ? { tier: 'conflict', pref: byKind } : { tier: 'kind', pref: byKind };
    // ④ global — 서로 다른 context 여러 곳에서 반복된 값만
    var g = mine.filter(function (p) { return p.value === value && (p.positive || 0) > (p.negative || 0); });
    if (g.length >= GLOBAL_MIN_CONTEXTS) {
      var best = g.slice().sort(function (a, b) { return (b.confidence || 0) - (a.confidence || 0); })[0];
      return { tier: 'global', pref: best };
    }
    return { tier: 'none', pref: null };
  }

  /* memory 하나의 personalization 점수. **동기·순수** — snapshot 만 읽는다. */
  function score(m, ctx, snapshot) {
    var out = {
      bonus: 0, valueScore: 0, confidence: 0, contextMatch: 'none',
      positive: 0, negative: 0, reason: []
    };
    if (!snapshot || !snapshot.prefs || !snapshot.prefs.length) return out;
    if (!snapshot.tenantId || snapshot.tenantId !== _tenant()) return out;   // 계정 전환 → 남의 취향 금지

    var style = styleOf(m);
    var acc = 0, wsum = 0, confSum = 0, confN = 0, sawConflict = false, bestTier = null;
    var ORDER = { exact: 4, service: 3, kind: 2, global: 1 };

    Object.keys(FEATURE_W).forEach(function (f) {
      var vals = style[f];
      if (!vals || !vals.length) return;
      // 한 memory 안에 같은 축 값이 여러 개면 가장 강한 근거 하나만 — 레이어 수로 점수가 부풀지 않게.
      var best = null;
      vals.forEach(function (v) {
        var r = lookup(snapshot.prefs, f, v, ctx);
        if (r.tier === 'conflict') { sawConflict = true; return; }
        if (r.tier === 'none' || !r.pref) return;
        if (!best || ORDER[r.tier] > ORDER[best.tier]) best = { tier: r.tier, pref: r.pref, value: v };
      });
      if (!best) return;
      var p = best.pref;
      var pos = p.decayedPositive != null ? p.decayedPositive : (p.positive || 0);
      var neg = p.decayedNegative != null ? p.decayedNegative : (p.negative || 0);
      var net = pos - neg;
      if (net <= 0) return;                                   // 우세하지 않으면 가산 없음
      /* 값 하나의 점수 = confidence × (순증 비율). confidence 만 쓰면
         "negative 가 쌓였는데 confidence 는 아직 높은" 구간에서 감점이 안 된다. */
      var margin = net / (pos + neg);
      var conf = Math.max(0, Math.min(1, p.confidence || 0));
      var v = conf * margin * TIERS[best.tier];
      acc += v * FEATURE_W[f];
      wsum += FEATURE_W[f];
      confSum += conf; confN++;
      out.positive += pos; out.negative += neg;
      if (!bestTier || ORDER[best.tier] > ORDER[bestTier]) bestTier = best.tier;
      out.reason.push({
        feature: f, value: best.value, tier: best.tier,
        confidence: +conf.toFixed(3), positive: +pos.toFixed(1), negative: +neg.toFixed(1),
        contribution: +(v * FEATURE_W[f]).toFixed(3)
      });
    });

    if (!out.reason.length) {
      out.contextMatch = sawConflict ? 'conflict' : 'none';
      return out;
    }
    /* 근거가 있는 축만으로 정규화하지 **않는다** — 3축 중 1축만 아는 취향이
       3축 다 아는 취향과 같은 만점을 받으면 안 된다. wsum(=아는 축의 비중 합)을 그대로 쓴다. */
    out.valueScore = Math.max(0, Math.min(1, acc));
    out.confidence = confN ? confSum / confN : 0;
    out.contextMatch = sawConflict ? 'conflict' : bestTier;
    // 갈린 축이 하나라도 있으면 확신을 절반으로 — "이 상황에서 원장은 아직 안 정했다".
    var bonus = out.valueScore * MAX * (sawConflict ? 0.5 : 1);
    out.bonus = Math.max(0, Math.min(MAX, Math.round(bonus * 100) / 100));
    void wsum;
    return out;
  }

  // ── 스냅샷 수명주기 ────────────────────────────────────────────
  /* IDB 읽기는 여기서만. select() 는 절대 이 함수를 기다리지 않는다.
     실패하면 스냅샷 없음 = 개인화 0 = 기존 T3 동작(안전한 기본값). */
  async function warm(now) {
    var t = _tenant();
    if (!t || !window.WMPrefs || !window.WMPrefs.list) { _snap = null; return null; }
    try {
      var prefs = await window.WMPrefs.list(now);
      if (_tenant() !== t) { _snap = null; return null; }      // 로딩 중 계정 전환 → 버린다
      _snap = { tenantId: t, prefs: prefs || [], at: Date.now() };
    } catch (_e) { void _e; _snap = null; }
    return _snap;
  }
  /* 🔴 스냅샷이 비면 **다시 만들 사람이 있어야 한다.**
     처음엔 invalidate() 가 버리기만 했고 재생성은 페이지 load 때 1회뿐이었다.
     그래서 원장이 앱을 켜둔 채 게시물을 만들면 — 첫 학습 직후 스냅샷이 버려지고
     그 세션 내내 personalization 이 0 이었다. 학습은 쌓이는데 추천엔 영영 반영 안 됨.
     실계정 8회 실측에서 잡았다(confidence 0.071→0.43 인데 bonus 8회 내내 0).
     이제 비는 순간마다 유휴 재생성을 예약한다 — 어떤 경로로 비었든 회복된다. */
  function snapshot() {
    if (!_snap) { _warmIdle(); return null; }
    if (_snap.tenantId !== _tenant()) { _snap = null; _warmIdle(); return null; }   // 계정 바뀌면 즉시 무효
    return _snap;
  }
  function invalidate() { _snap = null; _warmIdle(); }

  /* 첫 스냅샷은 **유휴 시점에** 만든다. select() 는 이걸 기다리지 않는다 —
     아직 안 만들어졌으면 개인화 0 으로 기존 T3 처럼 동작하고, 다음 열기부터 반영된다.
     편집기 여는 순간의 지연을 1ms 도 늘리지 않는 게 이 축의 전제다. */
  /* 🔴 requestIdleCallback 은 **최적화 수단**이지 정합성 보장 수단이 아니다.
     백그라운드 탭에서는 {timeout} 을 줘도 아예 안 돈다(실측: 5초까지 한 번도 안 옴).
     게다가 예전 _warming 래치는 예약된 콜백이 유실되면 true 로 남아 **이후 모든 warm 을
     영구 차단**했다 — 한 번 놓치면 그 세션 내내 개인화가 0 이다.
     원장은 앱을 켜둔 채 계속 작업한다. 같은 세션에서 방금 배운 취향이 반영돼야 한다.
     → setTimeout 을 정합성 보장선으로 두고, rIC 은 "더 빨리 되면 좋고" 로만 쓴다.
       래치 대신 **예약 시각**을 들고 있어 콜백이 유실돼도 다음 요청이 다시 예약한다. */
  var WARM_FALLBACK_MS = 800;     // 같은 세션의 다음 작업 전에 반영되도록 — 편집기 오픈은 이걸 안 기다린다
  var _warmAt = 0;                // 마지막 예약 시각(0 = 예약 없음)
  function _warmIdle() {
    var now = Date.now();
    // 짧은 시간 안의 중복 요청만 합친다. 유실되면 이 창이 지나고 다시 예약된다(영구 차단 없음).
    if (_warmAt && (now - _warmAt) < WARM_FALLBACK_MS * 2) return;
    _warmAt = now;
    var go = function () { _warmAt = 0; try { warm(); } catch (_e) { void _e; } };
    var fired = false;
    var once = function () { if (fired) return; fired = true; go(); };
    setTimeout(once, WARM_FALLBACK_MS);                        // ← 보장선
    // rIC 은 best-effort 가속. 안 돌아도 위 setTimeout 이 책임진다.
    try { if (typeof requestIdleCallback === 'function') requestIdleCallback(once, { timeout: WARM_FALLBACK_MS }); }
    catch (_e) { void _e; }
  }
  /* 탭이 백그라운드였다 돌아오면 곧바로 최신화 — 백그라운드에서 타이머가 조여도
     원장이 화면을 다시 보는 순간엔 맞는 취향으로 시작하게 한다. */
  try {
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden && !_snap) { _warmAt = 0; _warmIdle(); }
      });
    }
  } catch (_e) { void _e; }
  try {
    if (typeof document !== 'undefined' && typeof setTimeout === 'function') {
      if (document.readyState === 'complete') _warmIdle();
      else window.addEventListener('load', _warmIdle, { once: true });
    }
  } catch (_e) { void _e; }

  window.WMPersona = {
    MAX: MAX, TIERS: TIERS, FEATURE_W: FEATURE_W,
    styleOf: styleOf, lookup: lookup, score: score,
    warm: warm, snapshot: snapshot, invalidate: invalidate,
    _setSnapshotForTest: function (prefs, tenantId) {
      _snap = prefs ? { tenantId: String(tenantId), prefs: prefs, at: Date.now() } : null;
    }
  };
})();
