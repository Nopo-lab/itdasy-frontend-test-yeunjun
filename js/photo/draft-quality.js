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
 * [영속화 — 이게 없으면 측정 자체가 성립하지 않는다]
 *   🔴 처음엔 세션 메모리에만 쌓았다. 그러면 **새로고침 한 번에 0 으로 돌아간다.**
 *      원장이 하루 종일 써도 축별 카운트가 20건에 영원히 도달하지 못한다 —
 *      "측정 준비됨" 이라고 말할 수 없는 상태였다. 실사용 직전 감사에서 잡았다.
 *   → `localStorage` 에 **테넌트별로** 누적한다. 기존 키 규약(`itdasy:xxx::` + 테넌트)을 따른다.
 *      담는 건 숫자 카운터뿐이다(축 이름 7개 × 3). 사진·글자·개인정보는 안 담는다.
 *      서버 전송 0 · 네트워크 0.
 *
 * [실사용과 QA 를 섞지 않는다]
 *   `?editplan=1` 로 강제한 QA 세션이나 harness 가 만든 숫자가 실사용 지표에 들어가면
 *   내일 판정이 통째로 오염된다. **rollout 버킷으로 켜진 세션만** 센다.
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
  /* 테넌트별 키. 테넌트가 없으면(로그아웃) **아예 안 센다** — 귀속 불가한 숫자는
     나중에 누구 것인지 못 가린다. WMSignals 가 같은 이유로 관찰을 건너뛴다. */
  var LS_PREFIX = 'itdasy:draft_quality::';
  function _tenant() {
    try { var v = localStorage.getItem('last_user_id'); return v ? String(v) : null; }
    catch (_e) { void _e; return null; }
  }

  /* 이 세션을 실사용으로 셀 것인가.
     🔑 **rollout 버킷으로 켜진 것만** 실사용이다. QA 강제(`?editplan=1`·전역 override)는
        코드가 도는지 보려고 켠 것이지 원장이 쓴 게 아니다. 섞이면 내일 판정이 오염된다. */
  function _isProduction() {
    try {
      /* 귀속 못 할 숫자는 아예 만들지 않는다 — 나중에 누구 것인지 못 가린다.
         (rollout 도 테넌트 없이는 안 켜지지만, 여기서 한 번 더 못박는다.
          메모리에만 세고 저장은 실패하는 반쪽 상태가 제일 위험하다) */
      if (!_tenant()) return false;
      if (/[?&](editplan|autodraft|safetyReport|qa)=/.test(location.search)) return false;
      if (typeof window.ITDASY_DRAFT_ROLLOUT === 'number') return false;   // 수동 override 중
      if (window.ITDASY_EDIT_PLAN === true || window.ITDASY_AUTO_EDIT_PLAN === true) return false;
      return !!(window.EditPlan && window.EditPlan.rolloutInfo && window.EditPlan.rolloutInfo().on);
    } catch (_e) { void _e; return false; }
  }

  function _load() {
    var t = _tenant();
    if (!t) return _blank();
    try {
      var raw = localStorage.getItem(LS_PREFIX + t);
      if (!raw) return _blank();
      var o = JSON.parse(raw);
      if (!o || o.schema !== SCHEMA) return _blank();      // 스키마가 바뀌면 옛 숫자는 버린다
      var b = _blank();
      ['sessions', 'sessionsWithDraft', 'published', 'publishedWithDraft', 'undone'].forEach(function (k) {
        if (typeof o[k] === 'number') b[k] = o[k];
      });
      AXES.forEach(function (a) {
        if (o.applied && typeof o.applied[a] === 'number') b.applied[a] = o.applied[a];
        if (o.corrected && typeof o.corrected[a] === 'number') b.corrected[a] = o.corrected[a];
      });
      if (o.byIntent && typeof o.byIntent === 'object') b.byIntent = o.byIntent;
      return b;
    } catch (_e) { void _e; return _blank(); }
  }

  /* 🔴 저장 실패를 조용히 성공으로 넘기지 않는다. 실패하면 세어봐야 사라지므로,
     실패 사실 자체를 카운터로 남겨 `report()` 가 드러낸다(용량 초과·사생활 모드 등). */
  var _writeFail = 0;
  function _save() {
    var t = _tenant();
    if (!t) return false;
    try {
      localStorage.setItem(LS_PREFIX + t, JSON.stringify(Object.assign({ schema: SCHEMA }, _m)));
      return true;
    } catch (_e) { void _e; _writeFail++; return false; }
  }

  var _m = _load();
  var _cur = null;              // 이번 편집 세션

  /* 세션 시작 — 편집기가 열릴 때. 초안이 없을 수도 있다(그것도 세는 게 분모가 된다). */
  function begin(meta) {
    /* QA·harness 세션은 **아예 세션으로 세지 않는다.** 분모에 들어가면 되돌림률이 희석된다. */
    if (!_isProduction()) { _cur = null; return null; }
    _cur = { axes: {}, corrected: {}, intent: (meta && meta.intent) || null,
      t0: Date.now(), hadDraft: false };
    _m.sessions++;
    _save();
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
    if (any) _save();
  }

  /* 원장이 그 축을 직접 바꿨다 = **되돌림**.
     우리가 안 건드린 축을 원장이 바꾼 건 되돌림이 아니다 — 원래 자기 작업이다. */
  function corrected(axis, layerKey) {
    if (!_cur || AXES.indexOf(axis) < 0) return;
    if (!_cur.axes[axis]) return;                  // 우리가 안 건드린 축 — 무관
    if (_cur.corrected[axis]) return;              // 축당 한 번만 센다
    _cur.corrected[axis] = 1;
    _m.corrected[axis]++;
    _save();
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
    _save();
  }

  /* [STAGE G] 축별 판정. **기존 어휘를 그대로 쓴다** — NO_DATA · INSUFFICIENT · NO_SIGNAL · OK
     는 이미 safety-gate·wm-metrics 가 쓰는 말이다. 여기서 새 체계를 만들면 같은 상태를
     두 이름으로 부르게 된다.
     판정에만 두 개를 더한다: 잰 결과가 좋은지 나쁜지는 기존 어휘로 표현할 수 없다.
       GOOD              되돌림이 적다 — 이 축은 계속 켜도 된다
       NEEDS_CORRECTION  되돌림이 잦다 — 이 축의 규칙을 고치거나 꺼야 한다

     🔴 경계값은 **결론을 내리는 선**이지 튜닝 손잡이가 아니다.
        되돌림 30% = 세 번에 한 번은 원장이 다시 손댄다는 뜻이다. 그 정도면 도움이 아니다. */
  var BAD_RATE = 0.30;

  function _verdict(m) {
    if (m.status === 'NO_SIGNAL') return 'NO_SIGNAL';
    if (!m.sampleCount) return 'NO_DATA';
    if (m.status === 'INSUFFICIENT') return 'INSUFFICIENT';
    return m.value >= BAD_RATE ? 'NEEDS_CORRECTION' : 'GOOD';
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
    /* 🔴 저장 실패를 숨기지 않는다. 실패하면 숫자가 사라지는데 report 는 멀쩡해 보인다. */
    out.writeFailures = _writeFail;
    out.persisted = !!_tenant();
    out.keptEvidence = 'weak';
    out.note = '되돌림률이 낮아도 "좋았다"는 아니다 — 원장이 바빴을 수도 있다.';

    /* [STAGE G] 축별 판정 + 무엇이 남았는지. 데이터가 들어오면 **자동으로** 갱신된다 —
       여기서 사람이 다시 계산할 일이 없어야 폐루프가 닫힌 것이다. */
    out.verdicts = {};
    AXES.forEach(function (a) { out.verdicts[a] = _verdict(out.axes[a]); });
    out.overallVerdict = _verdict(out.overall);

    /* 축당 몇 건이 더 필요한가 — 역산해서 알려준다.
       "곧 되겠지" 라고 말하지 않기 위해서다(evidence-monitor 와 같은 규율). */
    out.needed = {};
    AXES.forEach(function (a) {
      var m = out.axes[a];
      if (m.status === 'NO_SIGNAL') { out.needed[a] = null; return; }   // 더 모아도 못 잰다
      var have = m.sampleCount || 0;
      out.needed[a] = have >= MIN_SAMPLE ? 0 : (MIN_SAMPLE - have);
    });

    /* 🔴 "측정 대기" 와 "품질 나쁨" 을 절대 섞지 않는다.
       표본이 0 인데 "되돌림 0%" 라고 읽으면 성공으로 오독한다 — 이 프로젝트에서 이미 난 사고다. */
    out.measurable = AXES.filter(function (a) { return out.verdicts[a] === 'GOOD' || out.verdicts[a] === 'NEEDS_CORRECTION'; });
    out.awaitingData = AXES.filter(function (a) { return out.verdicts[a] === 'NO_DATA' || out.verdicts[a] === 'INSUFFICIENT'; });
    out.unmeasurable = AXES.filter(function (a) { return out.verdicts[a] === 'NO_SIGNAL'; });
    return out;
  }

  /* reset 은 QA 전용이다. 실사용 누적을 지우는 건 되돌릴 수 없으니 저장본도 같이 지운다
     (반쯤 지워진 상태가 제일 나쁘다 — 메모리는 0 인데 저장본은 남아 다음 로드에 되살아난다). */
  function reset() {
    _m = _blank(); _cur = null; _writeFail = 0;
    var t = _tenant();
    if (t) { try { localStorage.removeItem(LS_PREFIX + t); } catch (_e) { void _e; } }
  }

  // 내일 실검증용 — 지금 이 세션이 실사용으로 세어지는지 한 줄로 확인한다
  function status() {
    var t = _tenant();
    return { tenant: t ? t.slice(0, 6) + '…' : null, counting: _isProduction(),
      rollout: (window.EditPlan && window.EditPlan.rolloutInfo) ? window.EditPlan.rolloutInfo() : null,
      persisted: !!t, writeFailures: _writeFail, sessions: _m.sessions };
  }

  window.DraftQuality = { SCHEMA: SCHEMA, MIN_SAMPLE: MIN_SAMPLE, BAD_RATE: BAD_RATE, AXES: AXES,
    LS_PREFIX: LS_PREFIX,
    begin: begin, applied: applied, corrected: corrected, published: published,
    report: report, reset: reset, status: status, _isProduction: _isProduction };
})();
