/* wm-metrics.js — Phase 1 계측. **관측만 한다. 아무 동작도 바꾸지 않는다.**
 *
 * [왜 이게 필요한가]
 *   2026-08-21 Phase 0 실측: 실사용 원장의 edit_state 가 **0건**이었다(테스트 계정 1개, 39장).
 *   그래서 지금은 "무엇을 자동화할지" 를 정할 수 없다. 정할 수 있으려면 먼저
 *   **원장이 실제로 어떻게 편집하는지** 를 재야 한다. 이 파일이 그 자(尺)다.
 *
 * [T8 파일을 하나도 수정하지 않는 이유]
 *   work-memory-* 는 이 앱에서 가장 여러 번 조용히 어긋났던 영역이다(select 가 service 를
 *   빠뜨림 / flow 가 wmContext 미전달 — 둘 다 **무증상**이었다). 계측 때문에 그 위험을 새로
 *   만들 이유가 없다. 그래서 여기서는 `WMSignals` 의 공개 함수를 **감싸서 읽기만** 한다.
 *   원본 반환값·부작용은 그대로 통과시키고, 이 파일이 통째로 죽어도 학습은 정상 동작한다.
 *   되돌리기 = load-groups 에서 이 줄 하나 지우기.
 *
 * [기록하지 않는 것] 문구 원문 · dataURL · blob URL · EXIF · 고객명 · 전화번호 · 캡션 ·
 *   photoHash · 얼굴/임베딩 · 이미지 바이트. **정수 카운터와 거친 라벨만 남긴다.**
 *
 * [저장] localStorage, tenant 스코프 키 — work-memory-learn.js 의 ledger 패턴과 같다.
 *   새 IDB store 를 만들지 않는다(§28: 기존 재사용 우선).
 *
 * 공개: window.WMMetrics.report() · .observePublish(...) · .reset() · .snapshot()
 */
(function () {
  'use strict';
  if (window.WMMetrics) return;

  var K = 'itdasy:pctx_metrics::';
  var MAX_LAT = 200;            // 지연 표본 상한(퍼센타일 계산용)
  var SCHEMA = 'm1';

  /* 🔴 tenant 키는 **`last_user_id`** 다 — T8 전체(signals·store·learn)가 이 키를 쓴다.
     처음에 `itdasy:tenant` 로 썼다가 QA 에서 잡혔다: 키가 다르면 계측이 학습과 **다른 사용자
     경계**를 갖게 되고, 최악의 경우 계정 전환 후에도 이전 원장의 카운터에 계속 쌓인다.
     새 키를 만들지 마라 — 격리 경계는 한 곳에서만 정의돼야 한다. */
  function _tenant() {
    try {
      var v = localStorage.getItem('last_user_id');
      return (v == null || v === '' || v === 'null') ? null : String(v);
    } catch (_e) { void _e; return null; }
  }
  function _key() { var t = _tenant(); return t ? (K + t) : null; }

  function _blank() {
    return {
      schema: SCHEMA,
      sessions: 0,                 // 편집기 오픈 수
      photos: 0,                   // 편집기에 들어온 사진 수(세션 합)
      // 원장 조작 — WMSignals.SUPPORTED 이벤트별. **system 스코프는 애초에 안 옴**(WMSignals 가 거른다)
      ev: {},
      // 결과 분류 (§23). preview_only·abandoned 는 **여기서만** 쓰는 라벨이고
      //   학습(WMLearn)에는 넘기지 않는다 → 가중치 0 이 구조적으로 보장된다.
      outcome: {},
      // 레이어 출처 구분 (§7) — 발행 시점 스냅샷 기준
      layerOrigin: { system: 0, user: 0, restored: 0, unknown: 0 },
      // 피사체 겹침 baseline (§6) — **자유 텍스트만**. 현재 safe-zone 이 안 지키는 구간이다.
      overlap: { measured: 0, overlapped: 0, subjectUnknown: 0, safeAreaAvail: 0 },
      // PhotoContext
      pctx: { computed: 0, l0hit: 0, l1hit: 0, failed: 0, subjectKnown: 0, kindKnown: 0, lat: [], conf: [] },
      updatedAt: 0
    };
  }

  function _load() {
    var k = _key(); if (!k) return null;
    try {
      var raw = localStorage.getItem(k);
      var o = raw ? JSON.parse(raw) : null;
      if (!o || o.schema !== SCHEMA) return _blank();
      return o;
    } catch (_e) { void _e; return _blank(); }
  }
  function _save(o) {
    var k = _key(); if (!k) return false;
    try {
      o.updatedAt = Date.now();
      localStorage.setItem(k, JSON.stringify(o));
      return true;
    } catch (_e) { void _e; return false; }   // quota → 조용히 포기. 계측이 앱을 막지 않는다.
    }

  /* 갱신은 항상 read-modify-write 한 번으로. 계측 때문에 성능이 눈에 띄면 본말전도다 —
     편집 조작마다 부르므로 실패해도 절대 던지지 않는다. */
  function _mut(fn) {
    try {
      var o = _load(); if (!o) return;      // 로그아웃 → 귀속 불가 → 기록 안 함(테넌트 격리)
      fn(o);
      _save(o);
    } catch (_e) { void _e; }
  }

  function _pushCapped(arr, v, cap) {
    arr.push(v);
    while (arr.length > cap) arr.shift();
  }

  // ── 관측: WMSignals 래핑 (T8 파일 무수정) ─────────────────
  var _wrapped = false;
  var _cur = null;    // { evs:0, started:at }

  function _wrap() {
    if (_wrapped || !window.WMSignals) return;
    var S = window.WMSignals;
    var oBegin = S.begin, oNote = S.note, oOutcome = S.outcome, oEnd = S.end;
    if (typeof oBegin !== 'function' || typeof oNote !== 'function') return;

    S.begin = function () {
      var r = oBegin.apply(this, arguments);
      /* 🔴 원본이 null 을 돌려주면 **관찰 세션이 시작되지 않은 것**이다(로그아웃 등 귀속 불가).
         그걸 세면 유령 세션이 쌓이고, 뒤이어 end() 가 outcome 까지 적어 지표가 통째로 오염된다.
         QA 에서 실제로 발생했다 — 세션 4건·published_unchanged 3건이 전부 유령이었다. */
      if (!r) { _cur = null; return r; }
      try { _cur = { evs: 0, outcome: null }; _mut(function (o) { o.sessions++; }); } catch (_e) { void _e; }
      return r;
    };
    S.note = function (event) {
      var r = oNote.apply(this, arguments);
      /* 원본이 false 를 돌려줬으면 **기록되지 않은 신호**다(system 스코프·세션 밖·미지원).
         그걸 세면 계측이 학습보다 많은 숫자를 갖게 되어 두 집계가 영원히 안 맞는다. */
      if (r === true) {
        try {
          if (_cur) _cur.evs++;
          _mut(function (o) { o.ev[event] = (o.ev[event] || 0) + 1; });
        } catch (_e) { void _e; }
      }
      return r;
    };
    if (typeof oOutcome === 'function') {
      S.outcome = function (kind) {
        try { if (_cur) _cur.outcome = kind || null; } catch (_e) { void _e; }
        return oOutcome.apply(this, arguments);
      };
    }
    if (typeof oEnd === 'function') {
      S.end = function () {
        var obs = oEnd.apply(this, arguments);
        try {
          var c = _cur; _cur = null;
          if (c) {
            /* [§23] 결과 분류. **학습에 넘기지 않는다** — 여기 라벨은 계측 전용이라
               WMLearn 의 outcome('published'|'saved'|'cancelled')과 별개로 존재한다.
               따라서 새 가중치가 학습에 유입될 경로가 아예 없다(가중치 0 을 구조로 보장). */
            var label;
            if (c.outcome === 'published') label = c.evs > 0 ? 'edited_then_published' : 'published_unchanged';
            else if (c.outcome === 'saved') label = c.evs > 0 ? 'edited_then_saved' : 'saved_unchanged';
            else if (c.evs === 0) label = 'preview_only';      // 열어보고 아무것도 안 만지고 나감
            else label = 'abandoned';                          // 만졌는데 발행·저장 안 함
            _mut(function (o) { o.outcome[label] = (o.outcome[label] || 0) + 1; });
          }
        } catch (_e) { void _e; }
        return obs;
      };
    }
    _wrapped = true;
  }

  // ── PhotoContext 결과 관측 ───────────────────────────────
  /* PhotoContext.stats() 는 **세션 메모리**라 새로고침이면 사라진다.
     장기 p50/p90(§27·§31)을 보려면 여기 누적해야 한다. */
  function observePhotoContext(ctx, how, ms) {
    _mut(function (o) {
      if (how === 'l0') o.pctx.l0hit++;
      else if (how === 'l1') o.pctx.l1hit++;
      else if (how === 'fail') { o.pctx.failed++; return; }
      else o.pctx.computed++;
      if (typeof ms === 'number' && isFinite(ms)) _pushCapped(o.pctx.lat, Math.round(ms), MAX_LAT);
      if (ctx) {
        if (ctx.subjectZone) o.pctx.subjectKnown++;
        if (ctx.kind && ctx.kind !== 'unknown') o.pctx.kindKnown++;
        if (typeof ctx.confidence === 'number') _pushCapped(o.pctx.conf, ctx.confidence, MAX_LAT);
      }
    });
  }

  // ── 발행/저장 시점 관측 (§6 baseline overlap · §7 layer origin) ──
  function _rectsOverlap(a, b) {
    return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  }

  /* layers = itd-editor metaLayers() 산출(정규화 중심좌표). photoUrl = 대표 사진.
     여기서 재는 것은 딱 하나다: **원장이 자유롭게 놓은 텍스트가 피사체를 덮는가.**
     `role` 있는 자동 레이어는 `_applySafeZone` 이 이미 비켜준다 — 안 지켜지는 건 자유 텍스트다.
     ⚠️ 이 값을 근거로 이번 Phase 에 배치를 바꾸지 않는다. baseline 을 아는 것이 목적이다. */
  function observePublish(layers, photoUrl) {
    try {
      if (!Array.isArray(layers) || !window.PhotoContext) return;
      var free = [], sys = 0, usr = 0, rst = 0, unk = 0;
      layers.forEach(function (L) {
        if (!L) return;
        if (L._src === 'wm') sys++;
        else if (L.role) rst++;                       // 템플릿·우리샵 스타일이 만든 역할 레이어
        else if (L.type === 'text') { usr++; free.push(L); }
        else unk++;
      });
      _mut(function (o) {
        o.layerOrigin.system += sys; o.layerOrigin.user += usr;
        o.layerOrigin.restored += rst; o.layerOrigin.unknown += unk;
      });
      if (!photoUrl || !free.length) return;
      window.PhotoContext.of(photoUrl).then(function (ctx) {
        _mut(function (o) {
          o.overlap.measured++;
          if (!ctx || !ctx.subjectRegion) { o.overlap.subjectUnknown++; return; }
          o.overlap.safeAreaAvail++;
          var sr = ctx.subjectRegion;
          var hit = free.some(function (L) {
            // metaLayers 는 중심좌표 + 폭만 준다. 높이는 폭 대비 보수적으로 추정(과대추정 금지).
            var w = L.w || 0.3, h = Math.min(0.25, (L.size || 0.06) * 1.6);
            return _rectsOverlap({ x: L.x - w / 2, y: L.y - h / 2, w: w, h: h }, sr);
          });
          if (hit) o.overlap.overlapped++;
        });
      }).catch(function () { /* 계측 실패는 무시 — 발행 경로를 절대 막지 않는다 */ });
    } catch (_e) { void _e; }
  }

  // ── 리포트 (§31 표) ──────────────────────────────────────
  function _pct(a, q) {
    if (!a || !a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; });
    return s[Math.min(s.length - 1, Math.floor(s.length * q))];
  }
  function _rate(n, d) { return d ? Math.round(n / d * 1000) / 1000 : null; }

  function report() {
    var o = _load();
    if (!o) return { error: '로그인 필요(tenant 스코프 계측)' };
    var p = o.pctx;
    var tot = p.computed + p.l0hit + p.l1hit;
    var outTot = Object.keys(o.outcome).reduce(function (s, k) { return s + o.outcome[k]; }, 0);
    return {
      schema: SCHEMA,
      sessions: o.sessions,
      photoContext: {
        total: tot,
        p50ms: _pct(p.lat, 0.5), p90ms: _pct(p.lat, 0.9), p95ms: _pct(p.lat, 0.95),
        cacheHitRate: _rate(p.l0hit + p.l1hit, tot),
        subjectKnownRate: _rate(p.subjectKnown, tot),
        kindKnownRate: _rate(p.kindKnown, tot),
        confidenceP50: _pct(p.conf, 0.5),
        failed: p.failed
      },
      behavior: {
        events: o.ev,
        positionChanged: o.ev.position_changed || 0,
        correctionCount: Object.keys(o.ev).reduce(function (s, k) { return s + o.ev[k]; }, 0),
        outcome: o.outcome,
        publishUnchangedRate: _rate(o.outcome.published_unchanged || 0, outTot),
        abandonedRate: _rate(o.outcome.abandoned || 0, outTot),
        previewOnlyRate: _rate(o.outcome.preview_only || 0, outTot)
      },
      safety: {
        layerOrigin: o.layerOrigin,
        baselineSubjectOverlapRate: _rate(o.overlap.overlapped, o.overlap.safeAreaAvail),
        subjectUnknownRate: _rate(o.overlap.subjectUnknown, o.overlap.measured),
        measured: o.overlap.measured
      },
      updatedAt: o.updatedAt
    };
  }

  function snapshot() { return _load(); }
  function reset() { var k = _key(); if (k) { try { localStorage.removeItem(k); } catch (_e) { void _e; } } }

  // 로드 순서 방어 — signals 가 아직이면 다음 유휴에 다시 시도(최대 몇 번).
  var _tries = 0;
  (function _tryWrap() {
    _wrap();
    if (!_wrapped && _tries++ < 20) setTimeout(_tryWrap, 300);
  })();

  window.WMMetrics = {
    report: report, snapshot: snapshot, reset: reset,
    observePhotoContext: observePhotoContext, observePublish: observePublish,
    _isWrapped: function () { return _wrapped; }
  };
})();
