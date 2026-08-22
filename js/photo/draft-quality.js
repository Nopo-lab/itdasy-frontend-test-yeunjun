/* draft-quality.js — 자동 초안이 **도움이 됐는지**를 원장 행동으로 잰다. [STAGE D]
 *
 * [무엇을 재는가 — 만족도가 아니라 되돌림]
 *   "좋았나요?" 를 묻지 않는다. 원장은 바쁘고, 물어보면 안 쓴다.
 *   대신 **우리가 얹은 값을 원장이 도로 바꿨는지**를 본다. 그게 유일하게 정직한 신호다.
 *     · 우리가 색을 바꿨는데 원장이 색을 또 바꿨다  → 우리가 틀렸다
 *     · 우리가 옮겼는데 원장이 다시 옮겼다          → 우리가 틀렸다
 *     · 아무것도 안 만지고 발행했다                 → 나쁘지 않았다(강한 증거는 아니다)
 *
 * [축별로 따로 센다 — 뭉치면 못 고친다]
 *   "초안 수정률 40%" 는 아무것도 안 알려준다. 색이 틀린 건지 자리가 틀린 건지 모르면
 *   끌 것도 못 끈다. 그래서 **우리가 건드린 축**과 **원장이 되돌린 축**을 짝지어 센다.
 *
 * [안 만졌다고 좋아한 게 아니다]
 *   발행까지 그대로 갔어도 그건 **약한 증거**다(T8 의 `publishedKeptAuto: 1` 과 같은 취급).
 *   원장이 그냥 바쁠 수도 있다. 이 구분을 잃으면 자기강화가 시작된다.
 *
 * ⚠️ 저장소를 새로 만들지 않는다. 세션 메모리에만 쌓고 `report()` 로 읽는다.
 *    서버 전송 0 · 네트워크 0 · 개인정보 0(레이어 종류와 축 이름만 센다).
 *
 * 공개: window.DraftQuality.applied(axes) · .corrected(axis, layerKey)
 *       .published(opts) · .report() · .reset()
 */
(function () {
  'use strict';
  if (window.DraftQuality) return;

  var SCHEMA = 'draftq-v1';
  var MIN_SAMPLE = 20;          // 비율을 말하려면 최소 이만큼 (WMMetrics 와 같은 규율)

  var AXES = ['color', 'stroke', 'shadow', 'font', 'align', 'size', 'position'];

  /* 🔴 **되돌릴 방법이 있는 축만** 되돌림률을 말할 수 있다.
     편집기엔 외곽선·그림자를 끄는 버튼이 없다. 원장은 그걸 되돌릴 수가 없다.
     그런데도 "되돌림 0/50" 을 내면 **"다 수용됐다"로 읽힌다** — 지표가 스스로를 속인다.
     그래서 이 축들은 비율 대신 `NO_SIGNAL` 을 낸다. 켤지 말지는 다른 근거로 정해야 한다
     (세션 전체 되돌리기 `undone`, 발행률, 그리고 나중에 토글을 만들면 그때 이 목록에서 뺀다). */
  var CORRECTABLE = { color: 1, font: 1, align: 1, size: 1, position: 1 };

  function _blank() {
    var o = { sessions: 0, sessionsWithDraft: 0, published: 0, publishedWithDraft: 0,
      undone: 0, applied: {}, corrected: {}, byIntent: {} };
    AXES.forEach(function (a) { o.applied[a] = 0; o.corrected[a] = 0; });
    return o;
  }
  var _m = _blank();
  var _cur = null;              // 이번 편집 세션

  /* 세션 시작 — 편집기가 열릴 때. 초안이 없을 수도 있다(그것도 세는 게 분모가 된다). */
  function begin(meta) {
    _cur = { axes: {}, corrected: {}, intent: (meta && meta.intent) || null,
      t0: Date.now(), hadDraft: false };
    _m.sessions++;
    return _cur;
  }

  /* 자동 초안이 축을 건드렸다. axes = {color:1, stroke:1, ...} */
  function applied(axes) {
    if (!_cur || !axes) return;
    var any = false;
    Object.keys(axes).forEach(function (a) {
      if (!axes[a] || AXES.indexOf(a) < 0) return;
      if (!_cur.axes[a]) { _cur.axes[a] = 1; _m.applied[a]++; any = true; }
    });
    if (any && !_cur.hadDraft) { _cur.hadDraft = true; _m.sessionsWithDraft++; }
  }

  /* 원장이 그 축을 직접 바꿨다 = **되돌림**.
     우리가 안 건드린 축을 원장이 바꾼 건 되돌림이 아니다 — 원래 자기 작업이다. */
  function corrected(axis, layerKey) {
    if (!_cur || AXES.indexOf(axis) < 0) return;
    if (!_cur.axes[axis]) return;                  // 우리가 안 건드린 축 — 무관
    if (_cur.corrected[axis]) return;              // 축당 한 번만 센다
    _cur.corrected[axis] = 1;
    _m.corrected[axis]++;
    void layerKey;                                 // 레이어 종류는 지금 안 쓴다(개인정보 최소화)
  }

  /* 세션 종료. published=true 면 발행까지 갔다는 뜻. */
  function published(opts) {
    if (!_cur) return;
    opts = opts || {};
    if (opts.published) {
      _m.published++;
      if (_cur.hadDraft) _m.publishedWithDraft++;
    }
    if (opts.undone) _m.undone++;
    if (_cur.intent) {
      var b = _m.byIntent[_cur.intent] || (_m.byIntent[_cur.intent] = { n: 0, corrected: 0 });
      b.n++;
      if (Object.keys(_cur.corrected).length) b.corrected++;
    }
    _cur = null;
  }

  function _rate(num, den) {
    if (!den || den < MIN_SAMPLE) {
      return { value: null, sampleCount: den || 0, status: 'INSUFFICIENT', minSample: MIN_SAMPLE };
    }
    return { value: Math.round(num / den * 1000) / 1000, sampleCount: den, status: 'OK', minSample: MIN_SAMPLE };
  }

  function report() {
    var out = { schema: SCHEMA, sessions: _m.sessions, sessionsWithDraft: _m.sessionsWithDraft,
      axes: {}, overall: null, byIntent: {} };
    /* 축별 되돌림률 — **분모는 그 축을 우리가 건드린 횟수**다.
       전체 세션으로 나누면 안 건드린 세션까지 섞여 늘 낮게 나온다(스스로를 속이는 지표). */
    AXES.forEach(function (a) {
      if (!CORRECTABLE[a]) {
        out.axes[a] = { value: null, sampleCount: _m.applied[a], status: 'NO_SIGNAL',
          reason: '원장이 되돌릴 UI 가 없다 — 되돌림 0 을 수용으로 읽으면 안 된다' };
        return;
      }
      out.axes[a] = _rate(_m.corrected[a], _m.applied[a]);
    });
    /* 전체 되돌림률도 **되돌릴 수 있는 축만** 모아 낸다.
       못 되돌리는 축을 분모에 넣으면 전체 수치가 자동으로 좋아 보인다. */
    var totApplied = 0, totCorrected = 0;
    AXES.forEach(function (a) {
      if (!CORRECTABLE[a]) return;
      totApplied += _m.applied[a]; totCorrected += _m.corrected[a];
    });
    out.overall = _rate(totCorrected, totApplied);
    out.noSignalAxes = AXES.filter(function (a) { return !CORRECTABLE[a] && _m.applied[a] > 0; });
    out.publishRate = _rate(_m.publishedWithDraft, _m.sessionsWithDraft);
    Object.keys(_m.byIntent).forEach(function (k) {
      out.byIntent[k] = _rate(_m.byIntent[k].corrected, _m.byIntent[k].n);
    });
    /* 🔴 "안 만지고 발행" 은 **약한 증거**다. 값을 내되 그렇게 라벨을 붙여 보낸다 —
       숫자만 보면 '수용률'로 읽고 자동화를 더 세게 켜게 된다(T8 publishedKeptAuto 와 같은 함정). */
    out.keptEvidence = 'weak';
    out.note = '되돌림률이 낮아도 "좋았다"는 아니다 — 원장이 바빴을 수도 있다.';
    return out;
  }

  function reset() { _m = _blank(); _cur = null; }

  window.DraftQuality = { SCHEMA: SCHEMA, MIN_SAMPLE: MIN_SAMPLE, AXES: AXES,
    begin: begin, applied: applied, corrected: corrected, published: published,
    report: report, reset: reset };
})();
