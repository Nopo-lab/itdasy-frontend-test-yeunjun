/*
 * work-memory-preferences.js — T8-C preference 계산/집계  [2026-08-20]
 *
 * T8-A 가 관찰하고 T8-B 가 저장한 observation 을 **원장 취향**으로 집계한다.
 * ❌ 이 단계에서 scoreMemory / T3 자동선택은 건드리지 않는다(T8-E 이후).
 *
 * ── 왜 평균·횟수로는 안 되나
 *   원장이 `A → B → A → B` 를 썼다고 B 선호가 아니고, 이벤트 한 번에 쓴 색이 평소 취향도 아니다.
 *   그래서 **증거 강도(outcome) · 일관성 · context · negative · publish** 를 함께 본다.
 *
 * ── 고정 계약 (보스 확정 · 골든 22개가 잠금)
 *   1. identity = tenantId + feature + **value** + contextKey. 같은 font 라도 context 다르면 별개.
 *   2. observation 1개 = 증거 1개. 한 게시물에서 A→B→C→B 로 4번 바꿔도 **최종값 B 에 sample +1**.
 *   3. positive / negative 를 **분리 보존**(pos-neg 압축 금지) — "안 좋아함"과 "싫어함"은 다르다.
 *   4. outcome 별 강도: 자동적용 유지+publish = 강한 positive · undo = 강한 negative · 취소 = 중립.
 *   5. confidence 는 sample 만으로 안 오른다(consistency·recency·pos/neg·publish 함께).
 *      상충 행동이 있으면 **떨어진다**.
 *   6. global 승격은 보수적 — 서로 다른 memory **와** context 에서 같은 값이 반복될 때만.
 *   7. 이벤트/프로모션(kind=promotion) 작업은 style preference 로 승격되지 않는다(T5 정책 존중).
 *      텍스트 '내용'은 T5 textbook 소관이라 여기선 text_changed 를 학습하지 않는다.
 */
(function () {
  'use strict';

  // 학습 대상 feature — 스타일만. 텍스트 내용·레이아웃은 각각 T5·레이아웃 소관.
  var FEATURES = { font_changed: 'font', color_changed: 'color', alignment_changed: 'align' };
  // baseline(자동 적용 결과)에서 읽는 스타일 축 — "그대로 두고 publish" 를 positive 로 잡기 위함.
  var BASE_FEATURES = [['font', 'font'], ['color', 'color'], ['align', 'align']];

  /* 증거 강도. 한 번의 행동이 취향을 확정하지 못하도록 값을 작게 두고, 반복으로 쌓이게 한다.
     숫자는 골든이 상대관계만 잠근다(publishedKept > changedThenPublished > cancelled 등). */
  var WEIGHTS = {
    publishedKept: 3,          // 자동 적용을 그대로 두고 발행 — 가장 강한 positive
    changedThenPublished: 2,   // 직접 골라서 발행 — 강한 positive
    changedNotPublished: 1,    // 편집만 하고 취소/이탈 — 약한 증거
    replaced: 2,               // 그 값이 교체당함 — negative
    undo: 3                    // 자동 적용 직후 되돌림 — 가장 강한 negative
  };
  var MAX_COUNT = 200;         // 수치 폭주 방지(장기 사용 안정성)
  var MAX_EVIDENCE = 20;       // explainability 용 최근 근거만 보관
  var GLOBAL_MIN_MEMORIES = 3; // global 승격 최소 서로 다른 memory 수
  var GLOBAL_MIN_CONTEXTS = 3; // + 서로 다른 context 수
  var FALLBACK_PENALTY = 0.6;  // exact 가 아닌 근거는 confidence 를 낮춰서 쓴다
  var HALF_LIFE_DAYS = 45;     // recency 반감기

  function _ctxKey(c) {
    c = c || {};
    return [c.service || '', c.photoCount == null ? '' : c.photoCount, c.kind || ''].join('|');
  }
  function _cap(n) { return Math.min(MAX_COUNT, Math.max(0, n || 0)); }

  /* observation 하나에서 feature 별 **최종 상태**와 **교체당한 값**을 뽑는다.
     A→B→C→B 면: final=B(증거 1), replaced={A,C}(중간 경유는 negative 로 세지 않음 —
     원장이 고르는 과정일 뿐이고, 최종적으로 버린 건 처음 값 A 다). */
  function _distill(o) {
    var final = {}, replaced = {}, firstBefore = {};
    (o.signals || []).forEach(function (s) {
      var f = FEATURES[s && s.event];
      if (!f) return;                                   // text_changed 등은 학습 대상 아님
      if (s.after != null) final[f] = s.after;
      if (firstBefore[f] === undefined && s.before != null) firstBefore[f] = s.before;
    });
    // 최종값과 다른 '처음 값'만 negative — 중간 경유값은 무시
    Object.keys(firstBefore).forEach(function (f) {
      if (firstBefore[f] !== final[f]) replaced[f] = firstBefore[f];
    });
    // 원장이 손대지 않은 축은 baseline(자동 적용) 값이 그대로 유지된 것
    var kept = {};
    (o.baseline || []).forEach(function (l) {
      if (!l || (l.type !== 'text' && l.type !== 'badge')) return;
      BASE_FEATURES.forEach(function (pair) {
        var srcKey = pair[0], feat = pair[1];
        if (l[srcKey] != null && final[feat] === undefined && kept[feat] === undefined) kept[feat] = l[srcKey];
      });
    });
    return { final: final, replaced: replaced, kept: kept };
  }

  function _blank(feature, value, ctxKey, context) {
    return {
      feature: feature, value: value, contextKey: ctxKey, context: context || {},
      positive: 0, negative: 0, sampleCount: 0, publishCount: 0, undoCount: 0,
      memoryIds: [], contextKeys: [], obsIds: [], evidence: [],
      consistency: 0, recency: 0, confidence: 0, globalCandidate: false,
      lastObservedAt: 0, version: 1
    };
  }

  function _recency(lastAt) {
    if (!lastAt) return 0;
    var days = Math.max(0, (Date.now() - lastAt) / 86400000);
    return Math.pow(0.5, days / HALF_LIFE_DAYS);   // 반감기 감쇠
  }

  /* confidence — sample 만으로 오르지 않는다.
     ① 표본이 쌓일수록(포화형) ② 일관될수록 ③ 최근일수록 ④ 발행으로 확인될수록 높다.
     상충(negative 가 섞임)이면 consistency 가 떨어져 confidence 도 같이 떨어진다. */
  function _confidence(p) {
    var pos = p.positive, neg = p.negative, tot = pos + neg;
    var consistency = tot > 0 ? pos / tot : 0;
    var volume = 1 - Math.pow(0.6, p.sampleCount);            // 1회=0.4 → 5회=0.92 (포화)
    var recency = _recency(p.lastObservedAt);
    var published = p.sampleCount > 0 ? Math.min(1, p.publishCount / p.sampleCount) : 0;
    var c = volume * (0.30 + 0.45 * consistency + 0.15 * recency + 0.10 * published);
    if (p.sampleCount < 2) c *= 0.5;                          // 1회로 취향 확정 금지
    return { consistency: consistency, recency: recency, confidence: Math.max(0, Math.min(1, c)) };
  }

  async function _load(feature, value, ctxKey) {
    var all = await window.WMStore.listPreferences();
    return all.filter(function (r) {
      return r.feature === feature && r.value === value && r.contextKey === ctxKey;
    })[0] || null;
  }

  async function _bump(feature, value, o, kind) {
    var ctxKey = _ctxKey(o.context);
    var p = (await _load(feature, value, ctxKey)) || _blank(feature, value, ctxKey, o.context);
    if (p.obsIds.indexOf(o.observationId) >= 0) return;        // 멱등 — 같은 게시물은 한 번만
    p.obsIds = p.obsIds.concat(o.observationId).slice(-MAX_EVIDENCE);

    var published = o.outcome === 'published';
    var w;
    if (kind === 'kept') w = published ? WEIGHTS.publishedKept : WEIGHTS.changedNotPublished;
    else if (kind === 'chosen') w = published ? WEIGHTS.changedThenPublished : WEIGHTS.changedNotPublished;
    else if (kind === 'replaced') w = WEIGHTS.replaced;
    else w = WEIGHTS.undo;

    if (kind === 'replaced' || kind === 'undo') p.negative = _cap(p.negative + w);
    else p.positive = _cap(p.positive + w);
    if (kind === 'undo') p.undoCount = _cap(p.undoCount + 1);

    p.sampleCount = _cap(p.sampleCount + 1);
    if (published) p.publishCount = _cap(p.publishCount + 1);
    if (o.memoryId && p.memoryIds.indexOf(o.memoryId) < 0) p.memoryIds = p.memoryIds.concat(o.memoryId).slice(-MAX_EVIDENCE);
    if (p.contextKeys.indexOf(ctxKey) < 0) p.contextKeys = p.contextKeys.concat(ctxKey).slice(-MAX_EVIDENCE);
    p.lastObservedAt = o.endedAt || Date.now();
    p.evidence = p.evidence.concat({ obs: o.observationId, kind: kind, outcome: o.outcome || null, at: p.lastObservedAt }).slice(-MAX_EVIDENCE);

    var c = _confidence(p);
    p.consistency = c.consistency; p.recency = c.recency; p.confidence = c.confidence;
    p.version = (p.version || 1) + 1;
    await window.WMStore.putPreference(p);
  }

  /* observation → preference 반영.
     [계약 7] 이벤트/프로모션 작업은 style 취향으로 학습하지 않는다 — 일회성이라 오염원이다. */
  async function learn(o) {
    if (!o || !o.observationId) return false;
    if (o.context && o.context.kind === 'promotion') return false;
    var d = _distill(o);
    var undone = !!o.undone;
    for (var f in d.final) if (Object.prototype.hasOwnProperty.call(d.final, f)) await _bump(f, d.final[f], o, 'chosen');
    for (var g in d.replaced) if (Object.prototype.hasOwnProperty.call(d.replaced, g)) await _bump(g, d.replaced[g], o, 'replaced');
    for (var h in d.kept) if (Object.prototype.hasOwnProperty.call(d.kept, h)) await _bump(h, d.kept[h], o, undone ? 'undo' : 'kept');
    return true;
  }

  async function list() { return window.WMStore.listPreferences(); }

  /* global 후보 — 특정 memory 하나에서 반복된 것만으로는 절대 승격되지 않는다.
     서로 다른 memory **와** context 양쪽에서 같은 값이 반복돼야 "이 원장의 전역 취향" 으로 본다. */
  async function getGlobal(feature) {
    var all = await list();
    var byValue = {};
    all.filter(function (p) { return p.feature === feature; }).forEach(function (p) {
      var v = byValue[p.value] || (byValue[p.value] = { value: p.value, mem: {}, ctx: {}, pos: 0, neg: 0, samples: 0, last: 0, conf: 0 });
      (p.memoryIds || []).forEach(function (m) { v.mem[m] = 1; });
      (p.contextKeys || []).forEach(function (c) { v.ctx[c] = 1; });
      v.pos += p.positive; v.neg += p.negative; v.samples += p.sampleCount;
      v.last = Math.max(v.last, p.lastObservedAt || 0);
      v.conf = Math.max(v.conf, p.confidence || 0);
    });
    var best = null;
    Object.keys(byValue).forEach(function (k) {
      var v = byValue[k];
      v.globalCandidate = Object.keys(v.mem).length >= GLOBAL_MIN_MEMORIES
        && Object.keys(v.ctx).length >= GLOBAL_MIN_CONTEXTS
        && v.pos > v.neg;
      if (v.globalCandidate && (!best || v.pos - v.neg > best.pos - best.neg)) best = v;
    });
    if (!best) return null;
    return { feature: feature, value: best.value, globalCandidate: true, positive: best.pos, negative: best.neg,
      sampleCount: best.samples, confidence: best.conf, lastObservedAt: best.last };
  }

  /* 지금 이 context 에서 쓸 선호 하나 — exact 우선, 없으면 global fallback(confidence 감쇠).
     fallback 은 "정확한 경험이 없을 때만" 쓰고, 그 사실을 via/confidence 로 드러낸다. */
  async function resolve(feature, context) {
    var ctxKey = _ctxKey(context);
    var all = await list();
    var exact = all.filter(function (p) {
      return p.feature === feature && p.contextKey === ctxKey && p.positive > p.negative;
    }).sort(function (a, b) { return (b.positive - b.negative) - (a.positive - a.negative); })[0];
    if (exact) {
      return { feature: feature, value: exact.value, via: 'exact',
        confidence: exact.confidence, rawConfidence: exact.confidence, pref: exact };
    }
    var g = await getGlobal(feature);
    if (!g) return null;
    return { feature: feature, value: g.value, via: 'global',
      confidence: g.confidence * FALLBACK_PENALTY, rawConfidence: g.confidence, pref: g };
  }

  // QA — "왜 이 취향이 됐는지" 역추적.
  async function explain(feature, context) {
    var ctxKey = _ctxKey(context);
    var all = await list();
    return all.filter(function (p) { return p.feature === feature && p.contextKey === ctxKey; })
      .sort(function (a, b) { return (b.positive - b.negative) - (a.positive - a.negative); })[0] || null;
  }

  window.WMPrefs = {
    WEIGHTS: WEIGHTS, MAX_COUNT: MAX_COUNT, FEATURES: FEATURES,
    GLOBAL_MIN_MEMORIES: GLOBAL_MIN_MEMORIES, GLOBAL_MIN_CONTEXTS: GLOBAL_MIN_CONTEXTS,
    learn: learn, list: list, resolve: resolve, getGlobal: getGlobal, explain: explain,
    _distill: _distill, _confidence: _confidence
  };
})();
