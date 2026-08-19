/*
 * work-memory-decay.js — T8-D 시간 감쇠 + confidence 재보정  [2026-08-20]
 *
 * 목적은 공식을 복잡하게 만드는 게 아니라 **모델을 안정시키는 것**:
 *   반복적·일관된 선호는 오래 유지 · 오래된/일회성 신호는 자연 약화 ·
 *   최근 행동 하나로 취향이 갑자기 뒤집히지 않음.
 *
 * ── 개념 분리 (계약)
 *   effectiveEvidence = Σ (weight × decay(age))   ← "오래된 증거의 무게가 얼마나 줄었나"
 *   confidence        = f(eff, consistency, publish, recency)  ← "지금 이걸 얼마나 믿나"
 *   둘을 한 수식에 뒤섞지 않는다. `now` 는 **입력**으로 받는 순수 함수(결정론·단위테스트 가능).
 *
 * ── 🔴 왜 재보정하나 (C 실측 문제)
 *   C 의 `1 - 0.6^n` 은 5회 0.92 · 10회 0.994 · **20회 1.000** 으로 과포화 →
 *   20회와 200회를 구분 못 했다. "confidence = 자동화 강도" 로 쓸 수 없다.
 *   → 포화형 `eff / (eff + K)` 로 교체. 절대 1에 도달하지 않고, 높은 확신은 실제 반복으로만 얻는다.
 *     10회≈0.45 · 20회≈0.63 · 50회≈0.81 · 200회≈0.94(×quality, 상한 CONF_MAX).
 *
 * ── decay 에 floor 를 두는 이유
 *   순수 지수감쇠면 180일 뒤 0.06 으로 사실상 소멸해 "오래 반복한 선호"가 통째로 사라진다.
 *   FLOOR 를 두면 18회×오래됨 > 2회×최근 이 성립한다(골든이 잠금).
 */
(function () {
  'use strict';

  var DAY = 86400000;
  var HALF_LIFE_DAYS = 45;   // 반감기
  var FLOOR = 0.15;          // 아주 오래돼도 남는 최소 무게 — 반복 선호 보존
  var K = 12;                // 포화 상수(클수록 천천히 확신)
  var CONF_MAX = 0.95;       // 확신 상한 — 100% 확신은 없다

  // 증거 종류별 기본 무게(T8-C WEIGHTS 와 같은 의미).
  /* ⚠️ 증거 종류를 새로 만들면 **여기에 반드시 등록**해야 한다. 빠지면 effective() 가 조용히
     건너뛰어 pos=0 → confidence=0 이 된다(T8-F 에서 keptAuto 를 빠뜨려 실제로 겪음).
     positive 는 개수가 아니라 무게다 — WMPrefs.WEIGHTS 와 의미를 맞춘다. */
  /* ⚠️ chosen 과 replaced 는 **같은 무게여야 한다.** 다르면 "고르고 또 교체당하기를 반반"
     한 값이 순증에서 0 으로 상쇄되지 않아 상충(conflict) 판정이 통째로 깨진다.
     T8-F 에서 chosen 만 4 로 올렸다가 10:10 이 confidence 0.57 로 나오는 걸 회귀가 잡았다. */
  var KIND_W = { kept: 3, keptAuto: 1, chosen: 2, replaced: 2, undo: 3 };
  var NEGATIVE = { replaced: 1, undo: 1 };

  function _num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

  /* 나이(일) → 무게. 단조 감소, (0,1], 오늘=1, 아주 오래돼도 FLOOR 이상. */
  function weight(ageDays) {
    var a = _num(ageDays);
    if (a === null || a < 0) a = 0;
    var w = Math.pow(0.5, a / HALF_LIFE_DAYS);
    return FLOOR + (1 - FLOOR) * w;
  }

  /* 타임스탬프 → 무게. 시계 이상값 전부 방어:
     · 미래 → 오늘로 클램프(기기 시계 오차)
     · null/NaN/undefined → 알 수 없음이므로 중립(오늘 취급하지 않고 FLOOR 쪽으로 보수적)
     · 0(=1970) → falsy 지만 '지금'이 아니라 **아주 오래된 것**으로 처리
       (T8-B 의 `endedAt || Date.now()` 버그 재발 방지 — 여기선 명시적 finite 검사) */
  function decayAt(at, now) {
    var n = _num(now); if (n === null) n = Date.now();
    var t = _num(at);
    if (t === null) return FLOOR;                    // 알 수 없는 시각 → 보수적으로 최소 무게
    if (t > n) return 1;                             // 미래 → 오늘
    return weight((n - t) / DAY);
  }

  /* evidence 배열 → 감쇠 적용된 positive/negative 합.
     evidence = [{ kind:'kept'|'chosen'|'replaced'|'undo', at:<ms> }, ...] */
  function effective(list, now) {
    var n = _num(now); if (n === null) n = Date.now();
    var out = { pos: 0, neg: 0, rawPos: 0, rawNeg: 0, count: 0 };
    (list || []).forEach(function (e) {
      if (!e) return;
      var w = KIND_W[e.kind]; if (w == null) return;
      var d = decayAt(e.at, n);
      out.count++;
      if (NEGATIVE[e.kind]) { out.rawNeg += w; out.neg += w * d; }
      else { out.rawPos += w; out.pos += w * d; }
    });
    return out;
  }

  /* confidence — "지금 이 preference 를 얼마나 믿나".
     saturation 이 양(量), quality 가 질(質). 둘 다 있어야 높아진다.
     · sample 이 아무리 많아도 상충하면(consistency↓) 낮다 — 50/50 < 20/0 (골든이 잠금)
     · 증거가 적으면 낮다 · 오래되면 낮다 · 발행으로 확인되면 높다 */
  function confidence(o) {
    o = o || {};
    var eff = o.eff || { pos: 0, neg: 0, count: 0 };
    var now = _num(o.now); if (now === null) now = Date.now();
    var total = eff.pos + eff.neg;
    var consistency = total > 0 ? eff.pos / total : 0;
    /* 🔑 증거는 **순증(pos - neg)** 으로 센다. pos 만 세면 "50번 골랐지만 50번 교체당한" 값이
       데이터가 많다는 이유로 confidence 0.69 를 받는다(실측). 그건 취향이 아니라 무취향이다.
       순증으로 세면 상충은 자연히 0 으로 수렴하고, 확신은 **일관되게 반복될 때만** 오른다. */
    var net = Math.max(0, eff.pos - eff.neg);
    var saturation = net / (net + K);                          // 포화형 — 절대 1 미도달
    var recencyWeight = decayAt(o.lastObservedAt, now);
    var publishWeight = Math.max(0, Math.min(1, _num(o.publishRate) || 0));
    var quality = 0.55 + 0.20 * consistency + 0.15 * publishWeight + 0.10 * recencyWeight;
    var c = saturation * quality;
    if ((eff.count || 0) < 2) c *= 0.5;                        // 1회로 취향 확정 금지
    c = Math.max(0, Math.min(CONF_MAX, c));
    return {
      confidence: c, saturation: saturation, consistency: consistency, net: net,
      recencyWeight: recencyWeight, publishWeight: publishWeight,
      rawPos: eff.rawPos, rawNeg: eff.rawNeg
    };
  }

  window.WMDecay = {
    DAY: DAY, HALF_LIFE_DAYS: HALF_LIFE_DAYS, FLOOR: FLOOR, K: K, CONF_MAX: CONF_MAX,
    KIND_W: KIND_W,
    weight: weight, decayAt: decayAt, effective: effective, confidence: confidence
  };
})();
