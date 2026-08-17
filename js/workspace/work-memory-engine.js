/*
 * work-memory-engine.js — 작업 기억 병합·선택 엔진  [T1 병합 2026-08-17 · T3 선택 2026-08-17]
 *
 * 왜 이 파일이 생겼나: 기억을 화면에 얹는 병합 규칙이 세 경로에 흩어져 있었다 —
 *   ① 편집기 열기(_openStoryEditor)  ② 캡션 결과 헤드리스 굽기(_autoComposeTemplate)
 *   ③ 잇비 "평소 하던 대로"(d._orch.useRecentStyle).
 *   ②는 role 중복 제거를 자체 재구현했고, "첫 장만 시술텍스트" 규칙(2026-07-24 원장 요청)도
 *   ①·②에 각각 복제돼 있었다. 한쪽만 고치면 편집기와 실제 발행 이미지가 어긋나는
 *   구조(반복 실사고 패턴) → 병합 규칙은 여기 한 곳에만 둔다.
 *
 * [T3] 선택(select)도 여기 소유 — "★ 하나를 통째로"에서 "지금 상황에 맞는 기억"으로.
 *   우선순위: once('이 스타일로 또' 1회 지정) > auto(select 스코어) > ★(auto OFF 일 때).
 *   세 경로가 같은 _resolveRec 를 쓰므로 미리보기·편집기·잇비가 같은 기억을 고른다.
 *   reason 은 장식 문구가 아니라 축별 숫자 분해(parts) — 합계가 total 과 항상 일치해야 하고
 *   테스트가 재계산으로 검증한다. 마지막 선택은 _lastSelect 에 남는다(QA·잇비 역추적용).
 *
 * 규칙: workspace-v2-flow.js 에는 병합·선택 로직을 한 줄도 두지 않는다. flow 는 ctx 만 만들어 호출.
 */
(function () {
  'use strict';

  // ── 병합 [T1] ─────────────────────────────────────────────────

  // 시술내용 텍스트 역할 — 여러 장 게시 시 **첫 장에만** 굽는 대상(2026-07-24 원장 요청:
  //   "여러 장 게시할 때 모든 사진에 시술내용이 박히지 않게"). 로고·워터마크·선·스티커·
  //   작업기억 꾸밈은 시술내용 역할이 아니므로 전 장 그대로 유지된다.
  var SERVICE_TEXT_ROLES = { title: 1, sub: 1, hashtag: 1 };
  function stripServiceText(ls) {
    return (ls || []).filter(function (L) {
      return !(L && SERVICE_TEXT_ROLES[L.role] && (L.type === 'text' || L.type === 'badge' || L.type == null));
    });
  }

  /* 레이아웃(콜라주) editState + 기억 꾸밈 합치기 (2026-07-17, flow _mergeWmLayers 에서 이관).
     레이아웃은 칸 배치(layoutIdx·photos·layoutOrder)의 주인이고, 기억은 그 위에 얹는 꾸밈의 주인.
     같은 role 을 둘 다 갖고 있으면 base(레이아웃) 것을 남긴다 —
     이번 글의 문구가 지난 글 문구로 되돌아가면 안 되므로. */
  function mergeEditState(base, wm) {
    if (!wm || !Array.isArray(wm.layers) || !wm.layers.length) return base;
    if (!base) return wm;
    var have = {};
    (base.layers || []).forEach(function (l) { if (l && l.role) have[l.role] = 1; });
    var add = wm.layers.filter(function (l) { return !(l && l.role && have[l.role]); });
    if (!add.length) return base;
    return Object.assign({}, base, { layers: (base.layers || []).concat(add) });
  }

  // 위와 같은 role 규칙을 '레이어 배열'에 적용 — 헤드리스 굽기가 쓰는 모양.
  //   base 에 이미 있는 role 은 기억 것을 버린다(이번 글 문구 보호).
  function mergeLayers(base, wm) {
    if (!wm || !wm.layers || !wm.layers.length) return base;
    var have = {};
    (base || []).forEach(function (L) { if (L && L.role) have[L.role] = 1; });
    return (base || []).concat(wm.layers.filter(function (L) { return !(L && L.role && have[L.role]); }));
  }

  // ── 성격 분류 [T3] ────────────────────────────────────────────
  // 게시물 성격(service/promotion/notice/unknown) — LLM 안 씀, 결정적 규칙만. 확신 없으면 unknown.
  //   ⚠️ 한글 왼쪽 경계 (?<![가-힣]) — '대할인' 같은 단어 일부 오탐 방지(과거 '붙고객님' 실사고 규칙).
  //   단 lookbehind 는 구형 iOS Safari(<16.4)에서 **파싱 단계**에서 죽으므로 리터럴 금지 —
  //   new RegExp + try/catch 로 파스-안전하게, 미지원이면 경계 없는 폴백(보수적으로 넓게 잡힘).
  function _re(pat, fallback) { try { return new RegExp(pat); } catch (_e) { void _e; return fallback; } }
  var PROMO_RE = _re('(?<![가-힣])(이벤트|할인|특가|프로모션|쿠폰|증정|첫\\s*방문|오픈\\s*기념|한정|선착순)',
    /(이벤트|할인|특가|프로모션|쿠폰|증정|첫\s*방문|오픈\s*기념|한정|선착순)/);
  var PCT_RE = /[0-9]{1,3}\s*%/;
  var NOTICE_RE = _re('(?<![가-힣])(공지|안내|휴무|휴진|휴가|영업시간)',
    /(공지|안내|휴무|휴진|휴가|영업시간)/);
  function classifyKind(texts, service) {
    try {
      var t = (texts || []).filter(Boolean).join(' ');
      if (PROMO_RE.test(t) || PCT_RE.test(t)) return 'promotion';   // 시술명이 같이 있어도 이벤트 우선
      if (NOTICE_RE.test(t)) return 'notice';
      if (service && String(service).trim()) return 'service';
      return 'unknown';
    } catch (_e) { void _e; return 'unknown'; }
  }

  // ── 텍스트 안전성 [T5] ────────────────────────────────────────
  /* role 없는 텍스트가 지난 글 문구 그대로 다음 글에 실리는 게 T5 이전의 구멍이었다
     ("8월 이벤트"·손님 이름이 새 글에 남는 사고 + confirmed 게이트 우회 지점).
     규칙: dynamic(날짜·프로모션·금액) → 항상 제거 / static(상시 안내 패턴 또는 3회 승격) → 유지 /
           unknown → 이번 글만(제거). 원장이 지운 문구(dismissed)는 패턴이 static 이어도 제거(명시 > 패턴).
     identity = normalizeText 결과(전역 textbook) — layer index·memoryId 가 아니라 문구 자체라
       순서변경·재적용·reopen·다른 기억에 같은 문구가 와도 veto 가 따라간다. */
  var NORM_RE = /[\s.,!?~·…'"“”‘’]+/g;   // 공백+흔한 문장부호 무시 — 계약은 text-safety 테스트가 잠금
  function normalizeText(t) {
    return String(t == null ? '' : t).toLowerCase().replace(NORM_RE, '');
  }
  // dynamic 판정(확신 있는 것만) — PROMO_RE·PCT_RE 는 성격 분류(classifyKind)와 공유.
  var TXT_DATE_RE = _re('(?<![가-힣])([0-9]{1,2}\\s*월|[0-9]{1,2}\\s*/\\s*[0-9]{1,2}|[0-9]{1,2}\\s*일(?![가-힣])|오늘|내일|이번\\s*주|이번\\s*달|까지|마감)',
    /([0-9]{1,2}\s*월|[0-9]{1,2}\s*\/\s*[0-9]{1,2}|[0-9]{1,2}\s*일(?![가-힣])|오늘|내일|이번\s*주|이번\s*달|까지|마감)/);
  var TXT_MONEY_RE = /[0-9][0-9,]*\s*(원|만원)/;
  // static 패턴(상시 안내) — 좁게. '안내' 같은 넓은 단어는 일반 문구를 오승격시켜 제외.
  var TXT_STATIC_RE = _re('(?<![가-힣])(예약|문의|상담|영업시간|주차|오시는\\s*길)|[dD][mM]|디엠',
    /(예약|문의|상담|영업시간|주차|오시는\s*길)|[dD][mM]|디엠/);
  function classifyText(t) {
    try {
      var s = String(t == null ? '' : t);
      if (PROMO_RE.test(s) || PCT_RE.test(s) || TXT_DATE_RE.test(s) || TXT_MONEY_RE.test(s)) return 'dynamic';   // dynamic 이 static 보다 우선("예약 마감")
      if (TXT_STATIC_RE.test(s)) return 'static';
      return 'unknown';   // 애매하면 unknown — static 간주 금지
    } catch (_e) { void _e; return 'unknown'; }
  }
  // role 없는 text/badge 만 정책 적용. 스티커·선·로고·role 텍스트는 그대로 통과.
  //   결정 전 과정을 _lastSanitize 에 남긴다 — "왜 이 문구가 살았/죽었지?" 역추적용(QA·잇비).
  function sanitizeLayers(layers) {
    var WM = window.WorkMemory;
    var tb = {};
    try { tb = (WM && WM.textbook) ? WM.textbook() : {}; } catch (_e0) { void _e0; }
    var kept = [], dropped = [];
    var out = (layers || []).filter(function (l) {
      if (!l || l.role || !(l.type === 'text' || l.type === 'badge') || !l.text) return true;
      var raw = l.text, norm = normalizeText(raw), cls = classifyText(raw);
      var ent = tb[norm], keep, why;
      if (cls === 'dynamic') { keep = false; why = 'dynamic'; }                       // 날짜·이름·할인은 예외 없음
      else if (ent && ent.st === 'dismissed') { keep = false; why = 'dismissed'; }    // 원장 명시 > 패턴
      else if (cls === 'static') { keep = true; why = 'static-pattern'; }
      else if (ent && ent.st === 'static') { keep = true; why = 'static-promoted'; }  // 3회 승격
      else { keep = false; why = 'unknown'; }                                          // 무응답 = 이번 글만
      (keep ? kept : dropped).push({ raw: raw, norm: norm, cls: cls, why: why });
      return keep;
    });
    try { window.WorkMemoryEngine._lastSanitize = { kept: kept, dropped: dropped }; } catch (_e1) { void _e1; }
    return out;
  }
  // toEditState + 텍스트 안전 정책 — 세 경로(편집기/헤드리스/잇비)가 전부 이 문을 지난다.
  function _toSafeState(WM, rec, opts) {
    var st = null;
    try { st = WM.toEditState(rec, opts); } catch (_e) { st = null; void _e; }
    if (!st) return null;
    var ls = sanitizeLayers(st.layers);
    if (!ls.length) return null;
    st.layers = ls;
    return st;
  }

  // ── 스코어 [T3] ───────────────────────────────────────────────
  // 축은 이 6개로 고정 — "데이터가 있으니 넣자" 식 팽창 금지(합의). 범위는 테스트가 잠근다.
  //   photoFit 40 이 최우선 신호: 최근+자주+브랜드(20+10+5=35)를 합쳐도 못 뒤집는다.
  //   promotion→service 감점 -30 은 최근+자주(30)를 이긴다 — 어제 이벤트가 오늘 시술에 안 튀어나오게(F).
  function _touch(m) { return (m && (m.lastPublishedAt || m.lastAppliedAt || m.lastUsedAt || m.createdAt)) || 0; }
  function scoreMemory(m, ctx) {
    m = m || {}; ctx = ctx || {};
    var pc = (m.photoCount != null) ? m.photoCount : 1;   // list() 가 마이그레이션하므로 항상 있음(직접 호출 방어만)
    var parts = {
      photoFit: (ctx.photoCount != null && pc === ctx.photoCount) ? 40 : 0,
      baFit: (ctx.hasBeforeAfter === true && m.layoutIdx === 7) ? 25 : 0,
      kindFit: 0,
      recency: 0,
      publishWeight: Math.min(m.publishCount || 0, 5) * 2,
      brandFit: (ctx.shopStyleId && m.shopStyleId && ctx.shopStyleId === m.shopStyleId) ? 5 : 0
    };
    var mk = m.kind || 'unknown';
    if (ctx.kind && ctx.kind !== 'unknown' && mk !== 'unknown') {
      if (mk === ctx.kind) parts.kindFit = 15;
      else if (mk === 'promotion' && ctx.kind === 'service') parts.kindFit = -30;
    }
    var t = _touch(m);
    if (t) {
      var days = Math.floor((Date.now() - t) / 86400000);
      parts.recency = Math.max(0, Math.min(20, 20 - days * 2));   // 오늘 20 → 하루 -2 → 10일이면 0. 미래값은 20 상한.
    }
    var total = parts.photoFit + parts.baFit + parts.kindFit + parts.recency + parts.publishWeight + parts.brandFit;
    return { parts: parts, total: total };
  }

  function _activeSSID() {
    try { return (window.ShopStyle && window.ShopStyle.getActiveId && window.ShopStyle.getActiveId()) || null; }
    catch (_e) { void _e; return null; }
  }

  /* 후보 전원 스코어 → 승자. 후보 0개는 { memory:null, candidates:[] } — 절대 안 던진다.
     동점 tie-break 은 결정론: total ↓ → 최근 손댄 시각 ↓ → id 사전순 ↑.
     (랜덤·삽입순 의존이면 같은 입력으로 오늘과 내일 결과가 달라진다.) */
  function select(ctx) {
    ctx = ctx || {};
    var WM = window.WorkMemory;
    var mems = (WM && WM.list) ? WM.list() : [];
    var sctx = {
      photoCount: ctx.photoCount,
      hasBeforeAfter: ctx.hasBeforeAfter,
      kind: ctx.kind || classifyKind(ctx.texts, ctx.service),
      shopStyleId: (ctx.shopStyleId !== undefined) ? ctx.shopStyleId : _activeSSID()
    };
    var scored = mems.map(function (m) { return { m: m, s: scoreMemory(m, sctx) }; });
    scored.sort(function (a, b) {
      if (b.s.total !== a.s.total) return b.s.total - a.s.total;
      var dt = _touch(b.m) - _touch(a.m);
      if (dt) return dt;
      return a.m.id < b.m.id ? -1 : (a.m.id > b.m.id ? 1 : 0);
    });
    var win = scored[0] || null;
    return {
      memory: win ? win.m : null,
      reason: win ? { parts: win.s.parts, total: win.s.total } : { via: 'none' },
      candidates: scored.map(function (x) { return { id: x.m.id, total: x.s.total }; })
    };
  }

  // ── 선택 해석 [T3] — 세 경로 공용 ─────────────────────────────
  function _setLast(info) { try { window.WorkMemoryEngine._lastSelect = info; } catch (_e) { void _e; } }
  /* once('이 스타일로 또') > auto(select) > ★(auto OFF 일 때만).
     consumeOnce: 편집기 경로만 true — 헤드리스(미리보기)가 1회 지정을 소비하면
       정작 편집기가 열릴 때 다른 기억으로 바뀌어 미리보기≠편집기가 된다.
     ignoreFlag: 잇비 "평소 하던 대로"는 원장의 명시 발화라 롤백 플래그보다 우선. */
  function _resolveRec(o, mode) {
    var WM = window.WorkMemory;
    if (!WM) return null;
    try {
      if (!mode.ignoreFlag && !(WM.flagOn && WM.flagOn())) return null;
      var once = mode.consumeOnce ? (WM.takeOnce ? WM.takeOnce() : null) : (WM.peekOnce ? WM.peekOnce() : null);
      if (once) { _setLast({ via: 'once', memoryId: once.id }); return { rec: once }; }
      var auto = WM.autoOn ? WM.autoOn() : true;
      if (auto) {
        var s = select({
          photoCount: o.photoCount, hasBeforeAfter: o.hasBeforeAfter, service: o.service,
          texts: (o.incoming || []).map(function (l) { return l && l.text; })
        });
        _setLast({ via: s.memory ? 'auto' : 'none', memoryId: s.memory ? s.memory.id : null, reason: s.reason, candidates: s.candidates });
        return s.memory ? { rec: s.memory } : null;
      }
      var fav = WM.getDefault && WM.getDefault();
      _setLast({ via: fav ? 'favorite' : 'none', memoryId: fav ? fav.id : null });
      return fav ? { rec: fav } : null;
    } catch (_e) { void _e; return null; }
  }

  // ── 세 경로 진입점 ────────────────────────────────────────────

  /* [v779 보스] 캡션 결과 화면 헤드리스 굽기용 — 선택된 기억의 꾸밈을 결과 사진에도 굽는다
     (예전엔 사진편집을 열어야만 보였다). layersOnly 항상 true — 결과물이 칸 배치를 이미 정한 상태.
     [T2'] 순수 조회: once 는 피크만, 카운트 안 올림. 실패해도 절대 안 던진다 → 원본 layers 그대로. */
  function decorateLayers(layers, opts) {
    try {
      var WM = window.WorkMemory;
      if (!WM || !WM.toEditState) return layers;
      var pick = _resolveRec(opts || {}, { ignoreFlag: false, consumeOnce: false });
      var wm = pick ? _toSafeState(WM, pick.rec, { incoming: layers, photoCount: opts && opts.photoCount, layersOnly: true }) : null;   // [T5] 텍스트 안전 정책 공용
      /* [T7 preflight] 자산 미해소(IDB 웜업 전/유실) 상태로 발행물을 구우면 '조용히 일부 빠진' 이미지가
         나간다 → 이번 굽기는 통째 보류(base 그대로). 웜업 뒤 재굽기(autoSig 재계산 경로)에서 온전히 반영.
         편집기(forEditor)는 원장이 눈으로 보는 단계라 레이어 제외 fallback 을 유지한다(합의 경계). */
      if (wm && WM.assetMissCount && WM.assetMissCount() > 0) return layers;
      return mergeLayers(layers, wm);
    } catch (_e) { void _e; return layers; }
  }

  /* 편집기 열 때 얹을 기억 editState — flow _openStoryEditor 에서 호출.
     o = { restore, orch, incoming, photoCount, layersOnly, service, hasBeforeAfter }

     [버그수정 2026-07-17의 교훈] 예전 주입 조건은 `!_restore && !_wsEd` 라 레이아웃이 켜지면 늘 죽었다.
       지금은 restore(재편집 이어가기)일 때만 건너뛰고, 레이아웃과는 layersOnly 로 공존한다.
     [2026-07-22 원장 스타일] 잇비 "평소 하던 대로"(orch.useRecentStyle)는 플래그와 무관하게 적용.
       orch 가 텍스트를 주면 기억의 텍스트 role 은 비워 중복 방지(incoming:[]).
     [T2'] 실제 얹힐 때만 markApplied — 헤드리스가 카운트를 못 부풀린다. */
  var _applySeq = 1;
  function forEditor(o) {
    o = o || {};
    var WM = window.WorkMemory;
    try { window.WorkMemoryEngine._lastApply = null; } catch (_e0) { void _e0; }   // [T4] 스테일 방지 — 이번 오픈에 적용 안 됐으면 null
    if (o.restore || !WM || !WM.toEditState) return null;
    var orch = !!(o.orch && o.orch.useRecentStyle);
    var incoming = (orch && o.orch.wantsText) ? [] : (o.incoming || []);
    var pick = _resolveRec(o, { ignoreFlag: orch, consumeOnce: true });
    if (!pick) return null;
    var wm = _toSafeState(WM, pick.rec, { incoming: incoming, photoCount: o.photoCount, layersOnly: !!o.layersOnly });   // [T5] 텍스트 안전 정책 공용
    if (wm && WM.markApplied) WM.markApplied(pick.rec.id);
    // [T4] 얹는 레이어에 출처+적용 토큰 — 배너 '되돌리기'/편집기 undoWmApply 가 이 identity 로만 지운다.
    //   사용자 레이어·우리샵 레이어는 안 건드리는 게 목표(오염 금지 — 합의 조건 3).
    //   토큰은 적용마다 새로 — 오래된 배너가 최신 적용을 못 되돌린다(조건 6).
    if (wm && wm.layers && wm.layers.length) {
      var tok = 'wm' + (_applySeq++);
      wm.layers = wm.layers.map(function (l) { return Object.assign({}, l, { _src: 'wm', _wmTok: tok }); });
      // [T5] 얹은 role 없는 문구 목록 — 저장 완료 시 '지워진 문구'(dismissed) 판정의 기준선.
      var wmTexts = wm.layers.filter(function (l) { return l && !l.role && (l.type === 'text' || l.type === 'badge') && l.text; })
        .map(function (l) { return normalizeText(l.text); });
      try { window.WorkMemoryEngine._lastApply = { token: tok, memoryId: pick.rec.id, count: wm.layers.length, texts: wmTexts, undone: false }; } catch (_e2) { void _e2; }
    }
    return wm;
  }

  window.WorkMemoryEngine = {
    stripServiceText: stripServiceText,
    mergeEditState: mergeEditState,
    mergeLayers: mergeLayers,
    classifyKind: classifyKind,
    normalizeText: normalizeText,
    classifyText: classifyText,
    sanitizeLayers: sanitizeLayers,
    scoreMemory: scoreMemory,
    select: select,
    decorateLayers: decorateLayers,
    forEditor: forEditor,
    _lastSelect: null,   // QA·잇비 역추적 — 마지막 선택의 via/후보 점수
    _lastApply: null,    // [T4] 마지막 편집기 적용 { token, memoryId, count, texts, undone } — 배너·되돌리기·dismissed identity
    _lastSanitize: null  // [T5] 마지막 텍스트 정책 { kept:[{raw,norm,cls,why}], dropped:[...] } — 승격/제거 역추적
  };
})();
