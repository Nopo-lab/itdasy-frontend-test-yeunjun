/*
 * work-memory-learn.js — T8-F 학습 폐루프 연결 [2026-08-20]
 *
 *   owner edit → observation batch → learn() → preference persistence → 다음 select()
 *
 * T8-A 가 관찰하고, T8-C 가 집계하고, T8-E 가 채점에 쓴다. 여기서 그 셋을 실제 사용자 경로에 잇는다.
 *
 * ── 🔴 1순위 위험: 자기강화 루프(preference runaway)
 *   자동적용 JUA → observer 가 JUA 를 보고 "원장이 JUA 를 좋아함" 학습 → 더 강해짐 → 또 JUA…
 *   막는 방법은 두 겹이다:
 *     ① T8-A 의 system scope — 자동적용·복원·마이그레이션 중의 변경은 signal 이 아예 안 남는다.
 *     ② 여기 outcome 정책 — **원장이 발행하지 않은 세션의 baseline 유지분은 증거가 아니다.**
 *        "열어보고 그냥 닫았다"는 취향의 증거가 아니다. 이게 A 케이스("자동적용만 반복")를 막는 핵심.
 *
 * ── 언제 얼마나 positive 를 주나
 *   원장이 직접 고름 + 발행    > 원장 레이어 유지 + 발행 > 자동적용 유지 + 발행 > 발행 안 함
 *   자동적용을 그대로 두고 발행한 건 "동의"지 "선택"이 아니라서 가장 약하게 센다(runaway 완화).
 *   undo 는 outcome 과 무관하게 강한 negative — 거부는 발행 여부보다 확실한 신호다.
 *
 * ── 중복 방지
 *   captureAndNotify 경로가 3곳(save · '올렸어요' · 실제 발행 콜백)이라 같은 작업이 여러 번 들어온다.
 *   observationId 기반 원장(ledger)을 localStorage 에 남겨 **재시작·재시도에도 1회만** 반영한다.
 *
 * ── fail-open
 *   학습이 실패해도 발행·편집은 성공한다. 여기서 던지는 예외는 없다(전부 false 반환).
 *   발행 경로는 commitAsync() 로 부른다 — 응답을 기다리지 않는다.
 */
(function () {
  'use strict';

  var LEDGER_MAX = 200;
  var _pending = null;      // hold() 된 observation — outcome 이 정해지길 기다리는 중

  function _tenant() {
    try {
      var v = localStorage.getItem('last_user_id');
      return (v == null || v === '' || v === 'null') ? null : String(v);
    } catch (_e) { void _e; return null; }
  }
  function _ledgerKey(t) { return 'itdasy:wm_learn_done::' + t; }
  function _ledger(t) {
    try { var s = localStorage.getItem(_ledgerKey(t)); var a = s ? JSON.parse(s) : []; return Array.isArray(a) ? a : []; }
    catch (_e) { void _e; return []; }
  }
  function _ledgerAdd(t, id) {
    try {
      var a = _ledger(t);
      if (a.indexOf(id) >= 0) return;
      a.push(id);
      if (a.length > LEDGER_MAX) a = a.slice(-LEDGER_MAX);
      localStorage.setItem(_ledgerKey(t), JSON.stringify(a));
    } catch (_e) { void _e; }
  }

  /* baseline 은 diff 기준일 뿐이라 스타일 축과 출처 표식만 남긴다.
     원본을 그대로 들고 있으면 data: URI 가 통째로 따라와 메모리·IDB 를 먹는다.
     `_src` 는 반드시 보존 — "우리가 얹은 것 vs 원장 것" 을 여기서만 구분할 수 있다(T4 표식). */
  function _slim(layers) {
    return (layers || []).filter(function (l) {
      return l && (l.type === 'text' || l.type === 'badge');
    }).map(function (l) {
      return { type: l.type, role: l.role || null, _src: l._src || null,
        font: l.font, color: l.color, align: l.align };
    }).slice(0, 40);
  }

  /* 편집기 세션 종료 — 관찰을 닫아 보관만 한다. 여기서 학습하지 않는다:
     발행할지 저장할지 취소할지는 아직 모르고, 그게 증거 강도를 좌우하기 때문이다. */
  function hold(o) {
    o = o || {};
    try {
      if (_pending) drop('superseded');                 // 이전 세션이 결론 없이 남아 있으면 버린다
      var S = window.WMSignals;
      var obs = (S && S.end) ? S.end() : null;
      if (!obs) return null;
      obs.baseline = _slim(obs.baseline);
      obs.undone = !!o.undone;
      _pending = obs;
      return obs.observationId;
    } catch (_e) { void _e; return null; }
  }
  function pending() { return _pending; }
  function drop(_why) { _pending = null; void _why; }

  /* observation 하나를 실제로 학습에 반영. 멱등 — 이미 반영된 observation 은 false. */
  async function learnObservation(obs, outcome) {
    try {
      if (!obs || !obs.observationId) return false;
      var t = _tenant();
      if (!t) return false;                              // 로그아웃 → 귀속 불가
      if (obs.tenantId && obs.tenantId !== t) return false;   // 관찰 후 계정이 바뀌었다 → 남의 취향에 못 넣는다
      if (_ledger(t).indexOf(obs.observationId) >= 0) return false;
      obs.outcome = outcome || obs.outcome || null;

      // 관찰 원본 보관(감사용). 실패해도 학습은 계속 — 이건 부가 기록이다.
      try { if (window.WMStore && window.WMStore.putObservation) await window.WMStore.putObservation(obs); }
      catch (_e1) { void _e1; }

      if (!window.WMPrefs || !window.WMPrefs.learn) return false;
      var ok = await window.WMPrefs.learn(obs);
      if (!ok) return false;
      _ledgerAdd(t, obs.observationId);
      // 취향이 바뀌었으니 select 가 보는 스냅샷은 낡았다 — 다음 유휴에 다시 만든다.
      try { if (window.WMPersona) window.WMPersona.invalidate(); } catch (_e2) { void _e2; }
      return true;
    } catch (_e) { void _e; return false; }              // fail-open — 발행·편집을 절대 방해하지 않는다
  }

  /* 결론을 붙여 학습한다. outcome: 'published' | 'saved' | 'cancelled'
     반환값은 "이번에 실제로 반영됐나" — 중복 호출은 false. */
  async function commit(outcome, key) {
    try {
      if (!_pending) hold({});                           // hold 없이 바로 온 경로 방어(발행 콜백이 먼저인 경우)
      var obs = _pending;
      if (!obs) return false;
      _pending = null;                                   // 먼저 비운다 — 재진입해도 두 번 안 들어가게
      if (key) obs.publishKey = String(key);
      return await learnObservation(obs, outcome);
    } catch (_e) { void _e; return false; }
  }

  /* 발행 critical path 용 — 응답을 기다리지 않는다.
     학습 계산·IDB 쓰기 때문에 발행 응답이나 편집기 UI 가 느려지면 안 된다. */
  function commitAsync(outcome, key) {
    try {
      var run = function () { commit(outcome, key); };
      if (typeof setTimeout === 'function') setTimeout(run, 0);
      else run();
    } catch (_e) { void _e; }
  }

  window.WMLearn = {
    hold: hold, pending: pending, drop: drop,
    commit: commit, commitAsync: commitAsync, learnObservation: learnObservation,
    _ledger: function () { var t = _tenant(); return t ? _ledger(t) : []; }
  };
})();
