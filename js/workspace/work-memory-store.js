/*
 * work-memory-store.js — T8-B 학습 저장소  [2026-08-19]
 *
 * T8-A(관찰)가 만든 observation 을 **정확히 격리해서** 보관한다.
 * preference *계산*은 T8-C, confidence/decay 는 T8-D, T3 연결은 그 뒤 — 여기선 저장/격리/멱등만.
 *
 * ── 🔴 격리 원칙 (보스/GPT 확정)
 *   `_purgeUserScopedDB()` 가 계정 전환 때 `itdasy-gallery` 를 통째로 지우지만,
 *   **그걸 유일한 격리 수단으로 취급하지 않는다.** 이유: 같은 세션에서 잘못된 tenant 로 쓰거나,
 *   전환 중 race 가 나면 purge 전후로 데이터가 섞일 수 있다.
 *   → ① 레코드마다 `tenantId` 저장 ② write 시 현재 인증 tenant 로 **강제** ③ read 시 일치 검증
 *      ④ tenant 없음/전환 중이면 learning I/O **전면 차단**. purge 는 네 번째 방어선일 뿐.
 *
 * ── 저장소
 *   itdasy-gallery v5 · stores: preferences · learning_signals · preference_versions
 *   (기존 slots·gallery·assets 는 그대로 — T1~T7 무변경)
 *
 * ── 백엔드 주입
 *   node 테스트엔 IndexedDB 가 없다. T6 에서 검증된 방식대로 백엔드를 주입 가능하게 두고,
 *   실제 IDB 동작(v4→v5 업그레이드 포함)은 브라우저 실측으로 검증한다.
 */
(function () {
  'use strict';

  var S_PREF = 'preferences', S_SIG = 'learning_signals', S_VER = 'preference_versions';
  var MAX_OBSERVATIONS = 300;      // tenant 당 raw observation 상한 — 무한 누적 금지
  var MAX_SIGNALS_PER_OBS = 200;   // 한 세션이 비정상적으로 커지는 것 방지
  var MAX_VAL = 64;                // 스타일 토큰 길이 상한(원문·dataURL 차단)

  var _switching = false;
  var _backend = null;

  // 기본 백엔드 = app-gallery-db.js 의 IDB. 없으면 null(앱은 계속 동작).
  function _defaultBackend() {
    if (typeof window === 'undefined' || typeof window.wmLearnPut !== 'function') return null;
    return {
      put: function (s, r) { return window.wmLearnPut(s, r); },
      get: function (s, id) { return window.wmLearnGet(s, id); },
      all: function (s) { return window.wmLearnAll(s); },
      del: function (s, id) { return window.wmLearnDel(s, id); }
    };
  }
  function _be() { if (_backend === null) _backend = _defaultBackend(); return _backend; }

  function _tenant() {
    try { var v = localStorage.getItem('last_user_id'); return v ? String(v) : null; }
    catch (_e) { return null; }
  }
  // learning I/O 를 해도 되는가 — tenant 있고 전환 중이 아닐 때만.
  function _gate() { return !_switching && !!_tenant(); }

  // 저장 단계에서도 원문·바이트가 새지 않게 한 번 더 거른다(T8-A 와 이중 방어).
  function _safe(v) {
    if (v == null) return null;
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    if (typeof v !== 'string') return null;
    if (/^data:/.test(v)) return null;
    if (v.length > MAX_VAL) return null;
    return v;
  }
  function _cleanSignal(s) {
    var out = { event: _safe(s && s.event), at: (s && s.at) || 0 };
    ['layerKey', 'property', 'role', 'type', 'assetRef', 'before', 'after'].forEach(function (k) {
      var v = _safe(s && s[k]); if (v != null) out[k] = v;
    });
    return out;
  }

  // 레코드 id — tenant 를 키에 포함해 **다른 계정이 같은 observationId 를 써도 안 덮어쓴다**.
  function _sigId(t, obsId) { return 'sig:' + t + ':' + obsId; }
  // [T8-C] identity = tenant + feature + **value** + contextKey.
  //   value 가 빠지면 같은 feature 의 서로 다른 값이 한 레코드를 덮어써서 positive/negative 가 섞인다.
  function _prefId(t, feature, value, ctxKey) {
    return 'pref:' + t + ':' + feature + ':' + (value == null ? '*' : value) + ':' + (ctxKey || '*');
  }
  function _verId(t, n) { return 'ver:' + t + ':' + n; }
  function _ctxKey(ctx) {
    ctx = ctx || {};
    return [ctx.service || '', ctx.photoCount == null ? '' : ctx.photoCount, ctx.kind || ''].join('|');
  }

  async function _safePut(store, rec) {
    var be = _be(); if (!be) return null;
    try { await be.put(store, rec); return rec.id; }
    catch (_e) { void _e; return null; }   // quota·IDB 실패 → 기존 보존, 세션 계속, 다음에 재시도
  }
  async function _allMine(store) {
    var be = _be(); if (!be || !_gate()) return [];
    var t = _tenant();
    try { return (await be.all(store) || []).filter(function (r) { return r && r.tenantId === t; }); }
    catch (_e) { void _e; return []; }
  }

  // ── observation (learning_signals) ───────────────────────────
  /* 멱등: 같은 tenant+observationId 는 항상 같은 레코드 id → 재시도·reload 해도 1개.
     retention: tenant 당 MAX_OBSERVATIONS 유지(오래된 것부터, **내 것만** 정리). */
  async function putObservation(obs) {
    if (!_gate() || !obs || !obs.observationId) return null;
    var t = _tenant();
    var rec = {
      id: _sigId(t, obs.observationId),
      tenantId: t,                                   // ← 호출자가 뭘 넣었든 현재 tenant 로 강제
      observationId: String(obs.observationId),
      memoryId: obs.memoryId || null,
      context: obs.context || {},
      outcome: obs.outcome || null,
      signals: (obs.signals || []).slice(0, MAX_SIGNALS_PER_OBS).map(_cleanSignal),
      startedAt: obs.startedAt != null ? obs.startedAt : 0,
      // [실측 버그] `obs.endedAt || Date.now()` 로 두면 endedAt=0 이 falsy 라 '지금'으로 치환돼
      //   retention 정렬에서 가장 최신처럼 취급된다(오래된 게 안 지워짐). null 체크로 고침.
      endedAt: obs.endedAt != null ? obs.endedAt : Date.now()
    };
    var id = await _safePut(S_SIG, rec);
    if (id) await _prune();
    return id;
  }
  async function listObservations() { return _allMine(S_SIG); }

  async function _prune() {
    var be = _be(); if (!be) return;
    var mine = await _allMine(S_SIG);
    if (mine.length <= MAX_OBSERVATIONS) return;
    mine.sort(function (a, b) { return (a.endedAt || 0) - (b.endedAt || 0); });   // 오래된 것부터
    var kill = mine.slice(0, mine.length - MAX_OBSERVATIONS);
    for (var i = 0; i < kill.length; i++) {
      try { await be.del(S_SIG, kill[i].id); } catch (_e) { void _e; }
    }
  }

  // ── preference (T8-C 가 값을 채운다. B 는 저장/격리만) ─────────
  async function putPreference(p) {
    if (!_gate() || !p || !p.feature) return null;
    var t = _tenant();
    var val = _safe(p.value);
    var ctxKey = p.contextKey != null ? p.contextKey : _ctxKey(p.context);
    // T8-C 가 계산한 통계 필드는 그대로 통과시킨다(저장소는 격리·검증만 책임).
    var rec = Object.assign({}, p, {
      id: _prefId(t, p.feature, val, ctxKey),
      tenantId: t,
      feature: String(p.feature),
      value: val,
      context: p.context || {},
      contextKey: ctxKey,
      lastObservedAt: p.lastObservedAt || Date.now(),
      version: p.version || 1
    });
    return _safePut(S_PREF, rec);
  }
  async function listPreferences() { return _allMine(S_PREF); }
  async function getPreference(feature, context) {
    if (!_gate()) return null;
    var be = _be(); if (!be) return null;
    try {
      var r = await be.get(S_PREF, _prefId(_tenant(), feature, arguments[2], _ctxKey(context)));
      return (r && r.tenantId === _tenant()) ? r : null;      // read 게이트
    } catch (_e) { void _e; return null; }
  }

  // ── version / rollback ───────────────────────────────────────
  async function pushVersion(snapshot, reason) {
    if (!_gate()) return null;
    var t = _tenant();
    var n = (await _allMine(S_VER)).length + 1;
    var id = _verId(t, n);
    var ok = await _safePut(S_VER, {
      id: id, tenantId: t, version: n,
      reason: _safe(reason) || null,
      snapshot: JSON.parse(JSON.stringify(snapshot || [])),
      at: Date.now()
    });
    return ok ? id : null;
  }
  async function listVersions() { return _allMine(S_VER); }
  async function rollback(versionId) {
    if (!_gate()) return false;
    var be = _be(); if (!be) return false;
    try {
      var v = await be.get(S_VER, versionId);
      if (!v || v.tenantId !== _tenant()) return false;        // 남의 버전으로 롤백 금지
      var cur = await _allMine(S_PREF);
      for (var i = 0; i < cur.length; i++) await be.del(S_PREF, cur[i].id);
      var snap = v.snapshot || [];
      for (var j = 0; j < snap.length; j++) await putPreference(snap[j]);
      return true;
    } catch (_e) { void _e; return false; }
  }

  // ── 계정 전환 게이트 ─────────────────────────────────────────
  //   app-core `applyNewSession` 이 purge 하는 구간을 감싸면 race 쓰기를 막는다.
  function beginTenantSwitch() { _switching = true; }
  function endTenantSwitch() { _switching = false; }
  function isSwitching() { return _switching; }

  window.WMStore = {
    MAX_OBSERVATIONS: MAX_OBSERVATIONS, MAX_SIGNALS_PER_OBS: MAX_SIGNALS_PER_OBS,
    STORES: { pref: S_PREF, sig: S_SIG, ver: S_VER },
    putObservation: putObservation, listObservations: listObservations,
    putPreference: putPreference, listPreferences: listPreferences, getPreference: getPreference,
    pushVersion: pushVersion, listVersions: listVersions, rollback: rollback,
    beginTenantSwitch: beginTenantSwitch, endTenantSwitch: endTenantSwitch, isSwitching: isSwitching,
    tenantId: _tenant,
    _setBackend: function (b) { _backend = b; }   // 테스트/실측 주입
  };
})();
