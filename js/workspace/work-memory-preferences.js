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
  var FEATURES = { font_changed: 'font', color_changed: 'color', alignment_changed: 'align',
    sticker_changed: 'emoji' };
  /* [T8-H+] continuous 축 — 신호 하나가 축 여러 개로 갈릴 수 있다(position → x·y).
     🔴 좌표를 value 로 쓰면 안 된다. identity 가 feature+**value**+context 라
     0.12 / 0.13 / 0.11 이 각각 별개 레코드가 되어 영원히 sampleCount 1 이 된다.
     → feature+context 당 **한 레코드**에 표본만 모으고 대표값은 robust(중앙값)로 뽑는다. */
  var CONT_EVENTS = {
    size_changed: [['size', null]],
    position_changed: [['x', 'x'], ['y', 'y']],
    shape_geometry_changed: [['w', 'w'], ['h', 'h']]
  };
  var CONT_VALUE = '~';          // continuous 레코드의 고정 value — 표본은 samples 에 쌓인다
  var MAX_SAMPLES = 30;
  // baseline(자동 적용 결과)에서 읽는 스타일 축 — "그대로 두고 publish" 를 positive 로 잡기 위함.
  var BASE_FEATURES = [['font', 'font'], ['color', 'color'], ['align', 'align']];

  /* 증거 강도. 한 번의 행동이 취향을 확정하지 못하도록 값을 작게 두고, 반복으로 쌓이게 한다.
     숫자는 골든이 상대관계만 잠근다(publishedKept > changedThenPublished > cancelled 등). */
  var WEIGHTS = {
    publishedKept: 3,          // 원장 레이어를 그대로 두고 발행 — 강한 positive
    /* [T8-F] **우리가 얹은 값**(_src:'wm')을 안 건드리고 발행한 건 "동의"지 "선택"이 아니다.
       같은 3점을 주면 자동적용 → 유지 → 강화 → 더 자주 자동적용 의 자기강화 루프가 돈다.
       실제로 이 한 줄이 preference runaway 를 막는 지점이라 약하게(1) 센다. */
    publishedKeptAuto: 1,
    changedThenPublished: 2,   // 직접 골라서 발행 — 강한 positive (replaced 와 대칭이어야 상충이 상쇄된다)
    changedNotPublished: 1,    // 편집만 하고 취소/이탈 — 약한 증거
    replaced: 2,               // 그 값이 교체당함 — negative
    undo: 3                    // 자동 적용 직후 되돌림 — 가장 강한 negative
  };
  var MAX_COUNT = 200;         // 수치 폭주 방지(장기 사용 안정성)
  var MAX_EVIDENCE = 20;       // explainability 용 최근 근거만 보관
  var GLOBAL_MIN_MEMORIES = 3; // global 승격 최소 서로 다른 memory 수
  var GLOBAL_MIN_CONTEXTS = 3; // + 서로 다른 context 수
  var FALLBACK_PENALTY = 0.6;  // exact 가 아닌 근거는 confidence 를 낮춰서 쓴다
  // [T8-D] 반감기·floor·포화 상수는 work-memory-decay.js 소유

  /* [T8-H] key 는 엔진이 소유한다 — 여기서 따로 만들면 축이 추가될 때 조용히 드리프트한다
     (before/after 축이 붙었을 때 실제로 갈릴 뻔했다). 엔진이 없을 때만 같은 규칙으로 폴백. */
  function _ctxKey(c) {
    var E = window.WorkMemoryEngine;
    if (E && E.contextKey) return E.contextKey(c);
    c = c || {};
    return [c.service || '', c.photoCount == null ? '' : c.photoCount, c.kind || '',
      c.hasBeforeAfter ? 'ba' : ''].join('|');
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
    // 원장이 손대지 않은 축은 baseline 값이 그대로 유지된 것.
    // [T8-F] 그 baseline 이 **우리가 얹은 것**인지(_src:'wm') 원장 것인지 구분해서 돌려준다 — 증거 강도가 다르다.
    var kept = {}, keptAuto = {};
    (o.baseline || []).forEach(function (l) {
      if (!l || (l.type !== 'text' && l.type !== 'badge')) return;
      BASE_FEATURES.forEach(function (pair) {
        var srcKey = pair[0], feat = pair[1];
        /* [T8-E] font 는 편집기에서 객체({key,...})로 들고 다닌다. 그대로 넣으면 preference
           value 가 객체가 돼 identity 가 깨진다(signals 는 key 문자열을 보낸다). 여기서 맞춘다. */
        var raw = l[srcKey];
        if (raw != null && typeof raw === 'object') raw = raw.key;
        if (raw != null && raw !== '' && final[feat] === undefined && kept[feat] === undefined) {
          kept[feat] = raw;
          /* [STAGE F] `plan`(자동 초안)도 **우리가 얹은 값**이다 — `wm` 과 같은 취급.
             여기서 빠뜨리면 `publishedKept`(3점, 강한 positive)로 세어져서
             우리 추측이 원장의 강한 취향으로 둔갑한다. 정확히 반대로 가야 한다. */
          if (l._src === 'wm' || l._src === 'plan') keptAuto[feat] = 1;
        }
      });
    });
    return { final: final, replaced: replaced, kept: kept, keptAuto: keptAuto };
  }

  function _num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  /* 신호에서 continuous 표본을 뽑는다. after 가 객체면 축별로 갈라 담는다.
     숫자가 아니면 버린다 — 좌표 자리에 문자열이 오면 대표값 계산이 통째로 망가진다. */
  function _contSamples(sig) {
    var spec = CONT_EVENTS[sig && sig.event];
    if (!spec) return [];
    var out = [];
    spec.forEach(function (pair) {
      var feat = pair[0], key = pair[1];
      var raw = (key == null) ? sig.after : (sig.after && sig.after[key]);
      var v = _num(raw);
      if (v !== null) out.push({ feature: feat, value: v });
    });
    return out;
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

  /* [T8-D] confidence 계산을 WMDecay 로 위임한다.
     C 의 `1 - 0.6^n` 은 20회에 1.000 으로 과포화돼 20회와 200회를 구분 못 했다
     (= 자동화 강도로 쓸 수 없음). D 는 evidence 에 시간 감쇠를 적용한 뒤 포화형으로 계산한다.
     decay 가 없으면(모듈 미로드) C 방식으로 안전하게 폴백 — 앱은 계속 동작. */
  function _confidence(p, now) {
    var D = window.WMDecay;
    if (!D) {
      var tot0 = p.positive + p.negative;
      var cons0 = tot0 > 0 ? p.positive / tot0 : 0;
      var vol0 = 1 - Math.pow(0.6, p.sampleCount);
      var c0 = vol0 * (0.30 + 0.45 * cons0 + 0.25 * (p.sampleCount > 0 ? Math.min(1, p.publishCount / p.sampleCount) : 0));
      if (p.sampleCount < 2) c0 *= 0.5;
      return { consistency: cons0, recency: 0, confidence: Math.max(0, Math.min(1, c0)),
        decayedPositive: p.positive, decayedNegative: p.negative, saturation: vol0 };
    }
    var eff = D.effective(p.evidence || [], now);
    var pubRate = p.sampleCount > 0 ? Math.min(1, p.publishCount / p.sampleCount) : 0;
    var r = D.confidence({ eff: eff, publishRate: pubRate, now: now, lastObservedAt: p.lastObservedAt });
    return {
      consistency: r.consistency, recency: r.recencyWeight, confidence: r.confidence,
      decayedPositive: eff.pos, decayedNegative: eff.neg, saturation: r.saturation
    };
  }

  async function _load(feature, value, ctxKey) {
    var all = await window.WMStore.listPreferences();
    return all.filter(function (r) {
      return r.feature === feature && r.value === value && r.contextKey === ctxKey;
    })[0] || null;
  }

  async function _bump(feature, value, o, kind, sample) {
    var ctxKey = _ctxKey(o.context);
    var p = (await _load(feature, value, ctxKey)) || _blank(feature, value, ctxKey, o.context);
    if (p.obsIds.indexOf(o.observationId) >= 0) return true;   // 멱등 — 같은 게시물은 한 번만(이미 반영됨)
    p.obsIds = p.obsIds.concat(o.observationId).slice(-MAX_EVIDENCE);

    var published = o.outcome === 'published';
    var w;
    if (kind === 'kept') w = published ? WEIGHTS.publishedKept : WEIGHTS.changedNotPublished;
    else if (kind === 'keptAuto') w = published ? WEIGHTS.publishedKeptAuto : WEIGHTS.changedNotPublished;
    else if (kind === 'chosen') w = published ? WEIGHTS.changedThenPublished : WEIGHTS.changedNotPublished;
    else if (kind === 'replaced') w = WEIGHTS.replaced;
    else w = WEIGHTS.undo;

    if (kind === 'keptAuto') p.autoKeptCount = _cap((p.autoKeptCount || 0) + 1);   // [T8-F] runaway 감사용
    if (kind === 'replaced' || kind === 'undo') p.negative = _cap(p.negative + w);
    else p.positive = _cap(p.positive + w);
    if (kind === 'undo') p.undoCount = _cap(p.undoCount + 1);

    p.sampleCount = _cap(p.sampleCount + 1);
    if (published) p.publishCount = _cap(p.publishCount + 1);
    if (o.memoryId && p.memoryIds.indexOf(o.memoryId) < 0) p.memoryIds = p.memoryIds.concat(o.memoryId).slice(-MAX_EVIDENCE);
    if (p.contextKeys.indexOf(ctxKey) < 0) p.contextKeys = p.contextKeys.concat(ctxKey).slice(-MAX_EVIDENCE);
    if (sample != null) {
      p.samples = (p.samples || []).concat(sample).slice(-MAX_SAMPLES);   // 최근 표본만 — 무한 증가 방지
    }
    p.lastObservedAt = o.endedAt || Date.now();
    p.evidence = p.evidence.concat({ obs: o.observationId, kind: kind, outcome: o.outcome || null, at: p.lastObservedAt }).slice(-MAX_EVIDENCE);

    var c = _confidence(p, Date.now());   // [T8-D] 기록 시점 스냅샷 (읽을 때 list() 가 다시 계산)
    p.consistency = c.consistency; p.recency = c.recency; p.confidence = c.confidence;
    // [T8-D] explainability — 왜 이 confidence 인지 역추적용
    p.decayedPositive = c.decayedPositive; p.decayedNegative = c.decayedNegative; p.saturation = c.saturation;
    p.version = (p.version || 1) + 1;
    /* [T8-F] 기록 성공 여부를 돌려준다. 예전엔 무시해서, 저장소가 통째로 죽어도(쿼터 초과 등)
       learn() 이 true 를 반환했다 → 호출자가 "학습 완료" 로 원장(ledger)에 적어버리고
       그 observation 은 **영영 재시도되지 않는다**. 조용한 데이터 손실이라 반환값을 살렸다. */
    return !!(await window.WMStore.putPreference(p));
  }

  /* observation → preference 반영.
     [계약 7] 이벤트/프로모션 작업은 style 취향으로 학습하지 않는다 — 일회성이라 오염원이다. */
  async function learn(o) {
    if (!o || !o.observationId) return false;
    if (o.context && o.context.kind === 'promotion') return false;
    var d = _distill(o);
    var undone = !!o.undone;
    var tried = 0, wrote = 0;
    /* [T8-H+] continuous 축은 **최종 값만** 표본으로 센다.
       "교체당한 좌표"를 negative 로 세지 않는다 — 원장은 0.5 를 싫어한 게 아니라 그냥 옮긴 것이다.
       한 게시물에서 여러 번 옮겼어도 마지막 값 하나만(계약 2: 게시물 1개 = 증거 1개). */
    var contFinal = {};
    (o.signals || []).forEach(function (sg) {
      _contSamples(sg).forEach(function (c) { contFinal[c.feature] = c.value; });
    });
    for (var cf in contFinal) {
      if (!Object.prototype.hasOwnProperty.call(contFinal, cf)) continue;
      tried++; if (await _bump(cf, CONT_VALUE, o, 'chosen', contFinal[cf])) wrote++;
    }
    for (var f in d.final) if (Object.prototype.hasOwnProperty.call(d.final, f)) { tried++; if (await _bump(f, d.final[f], o, 'chosen')) wrote++; }
    for (var g in d.replaced) if (Object.prototype.hasOwnProperty.call(d.replaced, g)) { tried++; if (await _bump(g, d.replaced[g], o, 'replaced')) wrote++; }
    /* [T8-F] 🔴 baseline 유지분은 **발행했을 때만** 증거다.
       "열어서 자동적용을 보고 그냥 닫았다"는 취향의 증거가 아니다 — 그걸 세면
       자동적용만 반복해도 preference 가 오르는 자기강화 루프가 생긴다.
       단, undo(거부)는 발행 여부와 무관하게 센다 — 거부는 발행보다 확실한 신호다. */
    var counts = undone || o.outcome === 'published';
    if (counts) {
      for (var h in d.kept) {
        if (!Object.prototype.hasOwnProperty.call(d.kept, h)) continue;
        tried++; if (await _bump(h, d.kept[h], o, undone ? 'undo' : (d.keptAuto[h] ? 'keptAuto' : 'kept'))) wrote++;
      }
    }
    // [T8-E] 취향이 갱신됐으니 select 가 보는 스냅샷은 낡았다 — 다음 유휴에 다시 만든다.
    try { if (window.WMPersona) window.WMPersona.invalidate(); } catch (_e) { void _e; }
    return tried > 0 && wrote > 0;
  }

  /* [T8-D] decay 는 **읽는 시점**의 함수다.
     저장된 confidence 는 기록 당시 스냅샷이라 시간이 지나면 낡는다 —
     읽을 때마다 현재 시각으로 다시 계산해서 "오래된 선호는 지금 약하다" 가 실제로 성립하게 한다.
     원본 evidence 는 그대로 두고(재계산 가능), 파생값만 갱신한다. DB 재기록은 하지 않는다. */
  async function list(now) {
    var t = (typeof now === 'number' && isFinite(now)) ? now : Date.now();
    var all = await window.WMStore.listPreferences();
    return all.map(function (p) {
      var c = _confidence(p, t);
      p.confidence = c.confidence; p.consistency = c.consistency; p.recency = c.recency;
      p.decayedPositive = c.decayedPositive; p.decayedNegative = c.decayedNegative; p.saturation = c.saturation;
      return p;
    });
  }

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
    var here = all.filter(function (p) { return p.feature === feature && p.contextKey === ctxKey; });
    var exact = here.filter(function (p) { return p.positive > p.negative; })
      .sort(function (a, b) { return (b.positive - b.negative) - (a.positive - a.negative); })[0];
    if (exact) {
      return { feature: feature, value: exact.value, via: 'exact',
        confidence: exact.confidence, rawConfidence: exact.confidence, pref: exact };
    }
    /* [T8-D] 🔴 여기서 골라본 적이 있는데 우세값이 없다 = **취향이 갈린 것**이지 '경험 없음'이 아니다.
       global fallback 은 "이 상황을 겪어본 적 없을 때"의 대타인데, 갈린 context 에 그걸 쓰면
       원장이 실제로 반반 갈렸다는 명확한 증거를 다른 상황의 취향으로 덮어쓴다.
       실측(T8-D 4패턴): jua 8 / gamja 8 인 context 에서 confidence 는 0.013 인데
       resolve() 가 global 로 jua(0.375) 를 반환했다 → 여기선 아무것도 제안하지 않는 게 맞다. */
    if (here.some(function (p) { return p.positive > 0; })) return null;
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
    CONT_EVENTS: CONT_EVENTS, CONT_VALUE: CONT_VALUE, MAX_SAMPLES: MAX_SAMPLES,
    GLOBAL_MIN_MEMORIES: GLOBAL_MIN_MEMORIES, GLOBAL_MIN_CONTEXTS: GLOBAL_MIN_CONTEXTS,
    learn: learn, list: list, resolve: resolve, getGlobal: getGlobal, explain: explain,
    _distill: _distill, _confidence: _confidence
  };
})();
