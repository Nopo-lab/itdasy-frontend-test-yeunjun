/*
 * work-memory-signals.js — T8-A 행동 관찰(Signal Observer)  [2026-08-19]
 *
 * T8 의 폐루프(Memory → Apply → Observe → Learn → Improve) 중 **Observe** 만 책임진다.
 * preference/score/rerank 는 T8-B 이후 — 이 파일은 T3 점수에 손대지 않는다.
 *
 * ── 왜 별도 모듈인가
 *   편집기의 undo 스택(`_pushOp`)은 add/del/move/resize 만 쌓고 **폰트·색·정렬 변경은 일부러 안 쌓는다**
 *   ("드래그로 쉽게 재조정 가능하므로 제외" — itd-editor.js 주석). 거기에 속성변경을 넣으면
 *   ↩ 동작이 바뀌어 T4 계약이 깨진다. → 관찰은 undo 와 완전히 분리된 이 모듈이 한다.
 *
 * ── 고정 계약 (보스 확정, 골든 테스트가 잠금)
 *   1. tenant = `last_user_id`(= JWT payload.sub, **서버 발급**). 없으면 관찰 자체를 안 한다
 *      (귀속 못 하는 데이터는 만들지 않는다). `ShopStyle.getActiveId()` 는 로컬 생성이라
 *      격리 최상위로 쓰지 않는다 — context/style 용도만.
 *      ※ 계정 전환 시 app-core `_purgeUserScopedDB()` 가 `itdasy-gallery` 를 통째로 지우므로,
 *        학습 저장소를 그 DB 에 두면 **격리가 자동**이다(T8-B 저장소 설계 근거).
 *   2. system mutation(자동적용·복원·undo·마이그레이션)은 절대 signal 이 아니다.
 *      전역 boolean 이 아니라 **카운터 + try/finally** — 중첩·예외에도 stuck 되지 않는다.
 *   3. 같은 세션의 수정 N 번 = observation **1개**(batch). N 개 독립 샘플로 세지 않는다.
 *   4. 원문 텍스트·이미지 바이트·개인정보를 담지 않는다. 변경 '사실'과 스타일 값만.
 *      (텍스트 *내용* 정책은 T5 textbook 소관 — 여기서 재정의하지 않는다.)
 *   5. `layer_reordered` 는 reorder UI 자체가 없어 미지원.
 */
(function () {
  'use strict';

  // 관찰 대상 이벤트 — 여기 없으면 무시한다(오염 방지). reorder 는 UI 가 없어 제외.
  var SUPPORTED = [
    'memory_applied', 'layer_added', 'layer_removed', 'layer_modified',
    'text_changed', 'font_changed', 'color_changed', 'size_changed',
    'position_changed', 'alignment_changed', 'sticker_changed',
    // [T8-H+] 도형/텍스트 폭·높이 등 기하 변경. 좌표(position)·크기(size)와 축이 달라 따로 둔다.
    'shape_geometry_changed',
    'undo_wm', 'manual_override'
  ];
  // 스타일 값만 통과시키는 화이트리스트 — dataURL·문구 원문·개인정보가 새지 않게.
  var VALUE_KEYS = ['layerKey', 'property', 'role', 'type', 'assetRef'];
  var MAX_VAL = 64;   // before/after 는 스타일 토큰(폰트키·hex·align)이라 짧다

  var _sysDepth = 0;      // system mutation 중첩 카운터
  var _cur = null;        // 현재 observation(세션당 1개)
  var _seq = 0;

  function _tenantId() {
    try { var v = localStorage.getItem('last_user_id'); return v ? String(v) : null; }
    catch (_e) { return null; }
  }
  function _uid(p) { return p + Date.now().toString(36) + (++_seq).toString(36); }

  /* 스타일 값만 남긴다. dataURL·긴 문자열·객체는 통째로 버리고,
     텍스트 변경은 '바뀌었다'는 사실만(원문은 T5 소관이자 개인정보 위험). */
  /* [T8-H+ V2] 좌표·크기는 값이 {x,y} / {w,h} 객체다. 예전엔 객체를 전부 null 로 버려서
     신호는 남는데 **값이 없어** 학습이 0 이었다(실계정 실험에서 발견 — 조용한 실패라 못 봤다).
     허용은 최소한으로: 아래 키만, 숫자만, 얕게. 중첩·배열·문자열 필드는 그대로 차단한다. */
  var GEO_KEYS = { x: 1, y: 1, w: 1, h: 1, size: 1 };
  function _safeGeo(o) {
    if (Array.isArray(o)) return null;
    var out = null;
    for (var k in o) {
      if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
      if (!GEO_KEYS[k]) continue;                      // 허용 키 밖은 조용히 버린다
      var v = o[k];
      if (typeof v !== 'number' || !isFinite(v)) continue;
      (out = out || {})[k] = v;
    }
    return out;
  }
  function _safeVal(v) {
    if (v == null) return null;
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    if (typeof v === 'object') return _safeGeo(v);
    if (typeof v !== 'string') return null;
    if (/^data:/.test(v)) return null;                 // 이미지 바이트 금지
    if (v.length > MAX_VAL) return null;               // 문구·긴 값 금지
    return v;
  }
  function _sanitize(event, p) {
    p = p || {};
    var out = { event: event, at: Date.now() };
    VALUE_KEYS.forEach(function (k) { if (p[k] != null) { var s = _safeVal(p[k]); if (s != null) out[k] = s; } });
    // 텍스트 '내용'은 절대 담지 않는다 — 바뀌었다는 사실만.
    if (event !== 'text_changed') {
      var b = _safeVal(p.before), a = _safeVal(p.after);
      if (b != null) out.before = b;
      if (a != null) out.after = a;
    }
    return out;
  }

  // ── 공개 API ────────────────────────────────────────────────

  /* system 스코프 — 이 안에서 일어난 변경은 관찰하지 않는다.
     반드시 try/finally 로 해제(예외가 나도 stuck 금지 — 골든 테스트가 잠금). */
  function system(fn) {
    _sysDepth++;
    try { return fn(); }
    finally { _sysDepth = Math.max(0, _sysDepth - 1); }
  }
  function isSystem() { return _sysDepth > 0; }

  // 세션 시작 = 게시물 1개 작업 시작(편집기 오픈). baseline = 자동적용 직후 상태(diff 기준).
  function begin(o) {
    o = o || {};
    var t = _tenantId();
    if (!t) { _cur = null; return null; }   // 귀속 불가 → 관찰 안 함
    _cur = {
      observationId: _uid('obs_'), tenantId: t, batch: true,
      memoryId: o.memoryId || null,
      context: o.context || {},
      baseline: Array.isArray(o.baseline) ? o.baseline : [],
      signals: [], outcome: null,
      startedAt: Date.now(), endedAt: null
    };
    return _cur.observationId;
  }

  /* [STAGE F] 세션 **도중에** baseline 을 덧붙인다.
     자동 초안(EditPlan)은 begin() 이후 비동기로 값을 얹는다 — 그 값이 baseline 에 없으면
     `_distill` 이 "원장이 그대로 뒀다"를 못 본다. 그러면 우리 값은 **틀렸을 때만**
     negative 가 쌓이고 맞았을 때는 아무것도 안 쌓여서, 90% 맞아도 '싫어하는 값'으로 수렴한다.
     그 비대칭이 이 한 줄이 없어서 생긴다.

     ⚠️ 이건 신호가 아니라 **기준선**이다. `note()` 와 달리 system 스코프에서도 받는다
        (우리가 얹은 값을 기록하는 게 목적이므로). 강도는 `publishedKeptAuto`(1) 로 약하다. */
  function baseline(layers) {
    if (!_cur || !Array.isArray(layers) || !layers.length) return false;
    layers.forEach(function (l) { if (l) _cur.baseline.push(l); });
    return true;
  }

  // owner 조작만 기록. system 스코프·세션 밖·미지원 이벤트는 조용히 무시.
  function note(event, payload) {
    if (!_cur) return false;
    if (isSystem()) return false;
    if (SUPPORTED.indexOf(event) < 0) return false;
    _cur.signals.push(_sanitize(event, payload));
    return true;
  }

  // 'published' | 'saved' | 'cancelled' — 학습 강도의 근거(T8-B). 취소는 positive 아님.
  function outcome(kind) { if (_cur) _cur.outcome = kind || null; return _cur ? _cur.outcome : null; }

  // 세션 종료 → observation 1개 반환(=batch). 저장은 T8-B 저장소가 맡는다.
  function end() {
    if (!_cur) return null;
    _cur.endedAt = Date.now();
    var done = _cur;
    _cur = null;
    return done;
  }

  function pending() { return _cur; }

  window.WMSignals = {
    SUPPORTED: SUPPORTED,
    system: system, isSystem: isSystem,
    begin: begin, note: note, outcome: outcome, end: end, baseline: baseline,
    tenantId: _tenantId, _pending: pending
  };
})();
