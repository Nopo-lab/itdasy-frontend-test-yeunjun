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
  /* [Phase 5.1] m1 → m2. 옛 `overlap` 블록은 `size×1.6` **추정**으로 잰 값이라
   실제 rect 로 잰 값과 같은 리포트에 섞으면 안 된다(실측: 추정이 1.36배 과대).
   스키마가 바뀌면 _load 가 _blank() 를 주므로 옛 값은 자동 폐기된다 — 의도된 동작이다. */
var SCHEMA = 'm2';

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
      /* [Phase 5.1] 실제 렌더 rect 기반 Safety baseline. 옛 추정 블록을 대체한다.
         "몇 건 중 몇 건이 겹쳤나" 만이 아니라 **왜 판정에서 빠졌는지**(미상·저신뢰·회전)까지
         남긴다 — 그걸 모르면 낮은 겹침률이 '안전해서'인지 '못 재서'인지 구분이 안 된다. */
      safety: {
        observations: 0,          // Shadow A 를 돌린 발행/저장 횟수
        eligibleText: 0,          // 자유 텍스트(origin:'user') 총합
        subjectKnown: 0,          // 피사체를 안 관측 수
        subjectUnknown: 0,
        lowConfidence: 0,
        reliableUnsafe: 0,        // 회전 제외 후 실제 위험
        alreadySafe: 0,
        candidateAvailable: 0,
        noValidCandidate: 0,
        noMeaningfulGain: 0,
        rotatedExcluded: 0,       // R13 — 회전이라 주 판정에서 뺀 레이어 수
        rotBucket: { '0': 0, '0-10': 0, '10-30': 0, '30-60': 0, '60+': 0 },
        curCovered: [],           // 현재 겹침 분포(중앙값·p90 계산용)
        candCovered: [],
        delta: [],
        obsLat: []                // 관측 자체의 지연(§17) — PhotoContext 지연과 분리
      },
      // PhotoContext
      //   [R9] 지연은 **계산과 캐시를 나눠서** 잰다. 섞으면 캐시 적중률이 높을수록 p90 이
      //   좋아 보여서, 정작 알고 싶은 "처음 볼 때 얼마나 걸리나"가 가려진다.
      pctx: {
        computed: 0, l0hit: 0, l1hit: 0, failed: 0, subjectKnown: 0, kindKnown: 0,
        latCompute: [], latCache: [], conf: [],
        // [R9] 연속 작업 부하 — 원장은 사진을 한 장씩 올리지 않는다(5장·10장 묶음).
        //   버스트 안에서 몇 번째냐에 따라 지연이 어떻게 변하는지가 실제 체감이다.
        burst: { first: [], mid: [], deep: [] }   // 1번째 / 2~5번째 / 6번째 이상
      },
      device: null,     // [R9] 최초 1회만 기록 — 이 저장소 자체가 기기당 하나다
      updatedAt: 0
    };
  }

  /* [R9] 기기 분류 — **UA 전문을 저장하지 않는다.**
     알고 싶은 건 "이 숫자가 어떤 급의 기기에서 나왔나"뿐이고, UA 전문은 지문(fingerprint)이
     되어 개인 식별에 쓰일 수 있다. 그래서 거친 라벨 3개로만 줄인다.
     tier 는 코어 수·메모리 기반 추정이다 — 정확한 기종이 아니라 **저가/중급/고급 구간**만 본다.
     (iOS Safari 는 deviceMemory 를 안 준다 → 코어 수만으로 판정, 모르면 'unknown') */
  function _device() {
    try {
      var ua = navigator.userAgent || '';
      var os = /iPhone|iPad|iPod/i.test(ua) ? 'ios'
        : /Android/i.test(ua) ? 'android'
          : /Macintosh/i.test(ua) ? 'macos'
            : /Windows/i.test(ua) ? 'windows' : 'other';
      var tablet = /iPad/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
      var phone = !tablet && (/iPhone|iPod/i.test(ua) || /Android/i.test(ua));
      var cls = tablet ? 'tablet' : (phone ? 'phone' : (os === 'macos' || os === 'windows' ? 'desktop' : 'other'));
      /* ⚠️ cores·memory 는 브라우저마다 신뢰도가 다르다.
         iOS Safari 는 deviceMemory 를 아예 안 주고, 일부 브라우저는 지문 방지를 위해
         고정값을 돌려준다. 그래서 **둘 다 없으면 tier 는 'unknown'** 이다 —
         모르는 걸 'mid' 로 채우면 저가 안드로이드가 중급으로 둔갑한다(Gate 2 오판). */
      var cores = navigator.hardwareConcurrency || null;
      var mem = navigator.deviceMemory || null;
      var tier = 'unknown';
      if (cores || mem) {
        if ((mem && mem <= 3) || (cores && cores <= 4)) tier = 'low';
        else if ((mem && mem <= 6) || (cores && cores <= 6)) tier = 'mid';
        else tier = 'high';
      }
      return { os: os, class: cls, tier: tier, cores: cores, memoryGb: mem };
    } catch (_e) { void _e; return null; }
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
  /* [R9] 버스트 추적 — 마지막 계산으로부터 이 간격 안에 또 오면 "연속 작업"으로 본다.
     원장이 5~10장을 한 번에 올릴 때의 체감이 여기서 드러난다(메모리 압박·GC·스로틀). */
  var BURST_GAP_MS = 3000;
  var _burstN = 0, _burstLast = 0;

  function observePhotoContext(ctx, how, ms) {
    var isCompute = (how !== 'l0' && how !== 'l1' && how !== 'fail');
    var slot = null;
    if (isCompute) {
      var now = Date.now();
      _burstN = (now - _burstLast <= BURST_GAP_MS) ? _burstN + 1 : 1;
      _burstLast = now;
      slot = _burstN === 1 ? 'first' : (_burstN <= 5 ? 'mid' : 'deep');
    }
    _mut(function (o) {
      if (!o.device) o.device = _device();          // 최초 1회만
      if (how === 'l0') o.pctx.l0hit++;
      else if (how === 'l1') o.pctx.l1hit++;
      else if (how === 'fail') { o.pctx.failed++; return; }
      else o.pctx.computed++;
      if (typeof ms === 'number' && isFinite(ms)) {
        var v = Math.round(ms);
        _pushCapped(isCompute ? o.pctx.latCompute : o.pctx.latCache, v, MAX_LAT);
        if (slot && o.pctx.burst && o.pctx.burst[slot]) _pushCapped(o.pctx.burst[slot], v, MAX_LAT);
      }
      if (ctx) {
        if (ctx.subjectZone) o.pctx.subjectKnown++;
        if (ctx.kind && ctx.kind !== 'unknown') o.pctx.kindKnown++;
        if (typeof ctx.confidence === 'number') _pushCapped(o.pctx.conf, ctx.confidence, MAX_LAT);
      }
    });
  }

  // ── 발행/저장 시점 관측 (§6 baseline overlap · §7 layer origin) ──
  /* layers = itd-editor metaLayers() 산출(정규화 중심좌표). photoUrl = 대표 사진.
     여기서 재는 것은 딱 하나다: **원장이 자유롭게 놓은 텍스트가 피사체를 덮는가.**
     `role` 있는 자동 레이어는 `_applySafeZone` 이 이미 비켜준다 — 안 지켜지는 건 자유 텍스트다.
     ⚠️ 이 값을 근거로 이번 Phase 에 배치를 바꾸지 않는다. baseline 을 아는 것이 목적이다. */
  function observePublish(layers, photoUrl, geoms) {
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
      /* [Phase 5.1] 겹침 판정은 **실제 렌더 rect(geoms)** 로만 한다.
         geoms 가 없으면(구 호출부·편집기 밖) 아무것도 재지 않는다 —
         옛 `size×1.6` 추정으로 폴백하면 두 종류 숫자가 한 통에 섞여서
         "이 겹침률이 실측인가 추정인가"를 영영 구분 못 하게 된다. */
      if (!photoUrl || !geoms || !geoms.length || !window.SafetyShadow) return;

      /* 발행 경로를 절대 느리게 하지 않는다(§15) — 저장이 끝난 뒤에 잰다.

         🔴 `requestIdleCallback` 은 **최적화 수단이지 정합성 보장 수단이 아니다.**
            백그라운드 탭에서는 `{timeout}` 을 줘도 아예 안 돈다 — 이 앱에서 이미 겪은 문제고
            `work-memory-persona.js` 가 같은 이유로 setTimeout 을 정합성 선으로 쓴다.
            여기서 rIC 만 믿었다가 QA 에서 `observations: 0` 이 나왔다(탭이 hidden 이었다).
            원장은 발행하고 바로 다른 앱으로 넘어간다 — 그 순간이 정확히 이 조건이다.
         → **setTimeout 을 보장선으로**, rIC 은 "더 빨리 되면 좋고" 로만. 둘 중 먼저 온 쪽 1회. */
      var _ran = false;
      var run = function () {
        if (_ran) return; _ran = true;
        var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
        window.PhotoContext.of(photoUrl).then(function (ctx) {
          var log = window.SafetyShadow.analyze(geoms, ctx || {});
          var det = window.SafetyShadow.detect(geoms, ctx || {});
          var ms = ((window.performance && performance.now) ? performance.now() : Date.now()) - t0;
          _mut(function (o) {
            var s = o.safety;
            s.observations++;
            s.eligibleText += log.freeTextCount;
            _pushCapped(s.obsLat, Math.round(ms), MAX_LAT);

            if (!log.photoContextKnown) { s.subjectUnknown++; }
            else {
              s.subjectKnown++;
              if (!log.verdictReliable) s.lowConfidence++;
            }
            // 회전 분포 — R13(회전 실사용 빈도 미측정)을 닫기 위한 유일한 경로
            (det.layers || []).forEach(function (L) {
              var a = Math.abs(L.rot || 0);
              var b = a < 0.5 ? '0' : (a < 10 ? '0-10' : (a < 30 ? '10-30' : (a < 60 ? '30-60' : '60+')));
              s.rotBucket[b] = (s.rotBucket[b] || 0) + 1;
              if (!L.geometryReliable) s.rotatedExcluded++;
            });

            switch (log.reason) {
              case 'already_safe': s.alreadySafe++; break;
              case 'no_valid_candidate': s.noValidCandidate++; break;
              case 'no_meaningful_gain': s.noMeaningfulGain++; break;
              case 'candidate_found': s.candidateAvailable++; break;
              default: break;    // subject_unknown / low_confidence 는 위에서 셌다
            }
            if (log.currentUnsafe) s.reliableUnsafe++;
            if (log.currentWorstCovered != null) _pushCapped(s.curCovered, log.currentWorstCovered, MAX_LAT);
            if (log.candidateCovered != null) _pushCapped(s.candCovered, log.candidateCovered, MAX_LAT);
            if (log.overlapDelta != null) _pushCapped(s.delta, log.overlapDelta, MAX_LAT);
          });
        }).catch(function () { /* 계측 실패는 무시 — 발행 경로를 절대 막지 않는다 */ });
      };
      setTimeout(run, 60);                                   // 보장선 — 백그라운드에서도 돈다
      if (window.requestIdleCallback) {                      // 있으면 더 일찍
        try { window.requestIdleCallback(run, { timeout: 2000 }); } catch (_r) { void _r; }
      }
    } catch (_e) { void _e; }
  }

  // ── 리포트 (§31 표) ──────────────────────────────────────
  function _pct(a, q) {
    if (!a || !a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; });
    return s[Math.min(s.length - 1, Math.floor(s.length * q))];
  }

  /* 🔴 [R8] 모든 지표는 **값과 표본수를 함께** 낸다.
     왜: 2026-08-21 에 합성 데이터 2건에서 나온 overlap 0.5 가 보고서에 숫자로 실렸고,
     "현재 겹침률 50%" 로 읽힐 뻔했다. 표본 2건은 아무것도 말해주지 않는다.
     이제 표본이 기준 미만이면 **값 자체를 null 로 막고** status 로 이유를 말한다 —
     읽는 사람이 sampleCount 를 눈여겨보지 않아도 오독할 수 없게 구조로 강제한다. */
  var MIN_RATE = 20;     // 비율 지표 최소 표본 (0/1 한 건이 100%/0% 로 튀는 구간을 넘김)
  var MIN_PCTL = 10;     // 퍼센타일 최소 표본 (p90 을 말하려면 최소 이 정도는 필요)

  /* source 를 **지표마다** 넣는다. 중복이지만 의도적이다 —
     보고서엔 지표 한 조각만 잘라 붙이는 일이 많고, 그때 "이게 합성인가 실사용인가"가
     같이 따라와야 오독이 안 난다. 최상위 source 하나만 두면 잘린 조각은 출처를 잃는다. */
  function _metric(value, n, min) {
    var enough = n >= min;
    return {
      value: enough ? value : null,
      sampleCount: n,
      status: n === 0 ? 'NO_DATA' : (enough ? 'OK' : 'INSUFFICIENT'),
      minSample: min,
      source: _source()
    };
  }
  function _rateM(num, den, min) {
    return _metric(den ? Math.round(num / den * 1000) / 1000 : null, den, min == null ? MIN_RATE : min);
  }
  function _pctM(arr, q) { return _metric(_pct(arr, q), (arr || []).length, MIN_PCTL); }
  function _countM(n) { return { value: n, sampleCount: n, status: n === 0 ? 'NO_DATA' : 'OK' }; }

  /* [§19·§20] 이 저장소가 실사용 데이터인지 판정.
     개발/테스트 계정의 숫자를 production 지표에 섞으면 Phase 2 판단이 통째로 오염된다.
     origin 이 github.io(배포본)이고 알려진 테스트 계정이 아닐 때만 production 으로 본다. */
  var TEST_USER_IDS = ['5'];            // Phase 0 에서 확인된 개발 계정(u5)
  function _source() {
    try {
      var host = (location && location.hostname) || '';
      var local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(host) || host === '';
      var t = _tenant();
      if (local) return 'synthetic';
      if (t && TEST_USER_IDS.indexOf(String(t)) >= 0) return 'test_account';
      return 'production';
    } catch (_e) { void _e; return 'unknown'; }
  }

  function report() {
    var o = _load();
    if (!o) return { error: '로그인 필요(tenant 스코프 계측)', source: _source() };
    var p = o.pctx;
    var tot = p.computed + p.l0hit + p.l1hit;
    var outTot = Object.keys(o.outcome).reduce(function (s, k) { return s + o.outcome[k]; }, 0);
    var evTot = Object.keys(o.ev).reduce(function (s, k) { return s + o.ev[k]; }, 0);
    var sf = o.safety || {};
    return {
      schema: SCHEMA,
      /* 🔑 이 두 줄을 먼저 읽어라. source 가 production 이 아니면 아래 숫자는
         제품 지표가 아니다. Phase 1 보고서에서 합성값 0.5 가 실제 겹침률처럼 읽힐 뻔했다. */
      source: _source(),
      device: o.device || _device(),
      sessions: _countM(o.sessions),

      photoContext: {
        total: tot,
        /* [R9] 계산(cold)과 캐시(warm)를 나눠서 — 섞으면 캐시가 잘 맞을수록 p90 이 좋아 보여서
           정작 알고 싶은 "처음 보는 사진이 얼마나 걸리나"가 가려진다. 목표 p90<400ms 는 cold 기준. */
        coldCompute: { p50: _pctM(p.latCompute, 0.5), p90: _pctM(p.latCompute, 0.9), p95: _pctM(p.latCompute, 0.95) },
        warmCache: { p50: _pctM(p.latCache, 0.5), p90: _pctM(p.latCache, 0.9) },
        // [R9] 연속 작업 — 원장은 5~10장을 한 번에 올린다
        burst: {
          first: { p90: _pctM(p.burst && p.burst.first, 0.9) },
          within5: { p90: _pctM(p.burst && p.burst.mid, 0.9) },
          beyond5: { p90: _pctM(p.burst && p.burst.deep, 0.9) }
        },
        cacheHitRate: _rateM(p.l0hit + p.l1hit, tot),
        subjectKnownRate: _rateM(p.subjectKnown, tot),
        kindKnownRate: _rateM(p.kindKnown, tot),
        confidenceP50: _pctM(p.conf, 0.5),
        failed: _countM(p.failed)
      },

      behavior: {
        events: o.ev,
        positionChangedCount: _countM(o.ev.position_changed || 0),
        correctionCount: _countM(evTot),
        outcome: o.outcome,
        publishedUnchangedCount: _countM(o.outcome.published_unchanged || 0),
        editedThenPublishedCount: _countM(o.outcome.edited_then_published || 0),
        previewOnlyCount: _countM(o.outcome.preview_only || 0),
        abandonedCount: _countM(o.outcome.abandoned || 0),
        publishUnchangedRate: _rateM(o.outcome.published_unchanged || 0, outTot),
        abandonedRate: _rateM(o.outcome.abandoned || 0, outTot),
        previewOnlyRate: _rateM(o.outcome.preview_only || 0, outTot)
      },

      /* [Phase 5.1] 실제 렌더 rect 로 잰 Safety baseline.
         🔴 "왜 판정에서 빠졌는지"(미상·저신뢰·회전)를 같이 낸다 — 그게 없으면
            낮은 겹침률이 '안전해서'인지 '못 재서'인지 구분이 안 된다. */
      safety: {
        layerOrigin: o.layerOrigin,
        observations: _countM(sf.observations),
        eligibleTextLayers: _countM(sf.eligibleText),
        // 노출 — 얼마나 잴 수 있었나
        subjectKnownRate: _rateM(sf.subjectKnown, sf.observations),
        subjectUnknownRate: _rateM(sf.subjectUnknown, sf.observations),
        lowConfidenceRate: _rateM(sf.lowConfidence, sf.observations),
        rotationExcludedRate: _rateM(sf.rotatedExcluded, sf.eligibleText),
        rotationBuckets: sf.rotBucket,          // R13 — 회전 실사용 빈도
        // 위험 — 실제로 가리고 있나
        reliableUnsafeRate: _rateM(sf.reliableUnsafe, sf.subjectKnown),
        alreadySafeRate: _rateM(sf.alreadySafe, sf.subjectKnown),
        medianCurrentCovered: _pctM(sf.curCovered, 0.5),
        p90CurrentCovered: _pctM(sf.curCovered, 0.9),
        // 후보 — 대안을 계산할 수 있나 (※ "AI가 좋아졌다"는 뜻이 아니다)
        candidateAvailableRate: _rateM(sf.candidateAvailable, sf.reliableUnsafe),
        noValidCandidate: _countM(sf.noValidCandidate),
        noMeaningfulGain: _countM(sf.noMeaningfulGain),
        medianCandidateCovered: _pctM(sf.candCovered, 0.5),
        medianOverlapDelta: _pctM(sf.delta, 0.5),
        // 관측 자체의 비용(§17) — PhotoContext 지연과 분리
        observationLatency: { p50: _pctM(sf.obsLat, 0.5), p90: _pctM(sf.obsLat, 0.9) }
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
