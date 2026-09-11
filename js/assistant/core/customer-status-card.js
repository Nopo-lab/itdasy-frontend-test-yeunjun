/* 잇비 고객 상태 카드 (J-3 MVP · 2026-06-01)

   "민지님 뭐 챙겨야 돼? / 이 손님 리터치 해야 돼? / 오래 안 온 손님 챙겨줘" →
     고객 1명 상태(최근 시술·마지막 방문·다음 예약·사진 기록·체크포인트)를 한 카드로 + Action Hub 버튼.

   원칙: 조회 전용. 새 백엔드 0. 발송/예약/저장 자동 실행 0. 고객 자동추측 0(모호하면 후보 안내).
   재사용: Customer.search/list · Booking.list · loadGalleryItemsByCustomer · /today/brief · ActionHub · draft 경로(chat_suggest). */
(function () {
  'use strict';
  if (window.ItdasyCustomerStatusCard) return;

  var STATUS = /(뭐|무엇).{0,3}챙겨|고객\s*상태|손님\s*상태|상태\s*(알려|정리|요약)|최근\s*시술\s*(뭐|알려|있)|리터치\s*(해야|대상|필요|할\s*때|할까)|사진\s*기록\s*(있|뭐|확인)|오래\s*안\s*온|한동안\s*안\s*온|재방문\s*안내\s*(필요|대상)|고객별로\s*(뭐|무엇)|챙겨줘/;
  var LIST_Q = /오래\s*안\s*온|한동안\s*안\s*온|리터치\s*(대상|필요)|재방문\s*안내\s*(필요|대상)|고객별로/;
  // 예약/발송 명령은 기존 경로 유지(여기서 가로채지 않음)
  var NOT = /(예약\s*잡|예약\s*해|문자\s*보내|dm\s*보내|발송|취소|변경)/;

  function detectCustomerStatusIntent(text) {
    var t = String(text || '').trim();
    if (!t || NOT.test(t)) return false;
    return STATUS.test(t);
  }

  function _extractName(text) {
    var t = String(text || '');
    var m = t.match(/([가-힣]{2,4})\s*(님|고객님|고객|손님)/);
    if (m) return m[1];
    var m2 = t.match(/([가-힣]{2,4})\s*(상태|최근|시술|리터치|사진|예약)/);
    if (m2 && !/이\s*손님|오래|한동안|재방문|고객별/.test(m2[1])) return m2[1];
    return '';
  }

  // 고객 식별: 명시 이름 → 현재고객 → 현재사진 고객 → 없음/후보. 자동추측 금지.
  function resolveCustomerForStatus(text, ctx) {
    ctx = ctx || {};
    if (LIST_Q.test(text) && !_extractName(text)) return { list: true, kind: /리터치/.test(text) ? 'retouch' : 'at_risk' };
    var name = _extractName(text);
    if (name && window.Customer && typeof window.Customer.search === 'function') {
      var cands = (window.Customer.search(name) || []).filter(function (c) { return c && c.id != null; });
      if (cands.length === 1) return { customer: { id: cands[0].id, name: cands[0].name || name } };
      if (cands.length > 1) return { ambiguous: true, candidates: cands.slice(0, 5).map(function (c) { return { id: c.id, name: c.name }; }) };
    }
    var cur = ctx.currentCustomer;
    if (cur && cur.id != null) return { customer: { id: cur.id, name: cur.name || '' } };
    var ph = ctx.currentPhoto;
    if (ph && ph.customerId != null) return { customer: { id: ph.customerId, name: ph.customerName || '' } };
    return { none: true };
  }

  function _daysAgo(ts) { try { return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000); } catch (_e) { return null; } }
  function _ymd(ts) { try { var d = new Date(ts); return (d.getMonth() + 1) + '월 ' + d.getDate() + '일'; } catch (_e) { return ''; } }

  async function _bookingsFor(cust) {
    var out = { last: null, next: null };
    if (!(window.Booking && typeof window.Booking.list === 'function')) return out;
    var from = new Date(Date.now() - 180 * 86400000).toISOString();
    var to = new Date(Date.now() + 60 * 86400000).toISOString();
    var items = [];
    try { items = (await window.Booking.list(from, to)) || []; } catch (_e) { items = []; }
    items = items.filter(function (b) {
      return b && b.starts_at && b.status !== 'cancelled'
        && (b.customer_id === cust.id || (cust.name && b.customer_name === cust.name));
    });
    var now = Date.now();
    var past = items.filter(function (b) { return new Date(b.starts_at).getTime() < now; }).sort(function (a, b) { return new Date(b.starts_at) - new Date(a.starts_at); });
    var fut = items.filter(function (b) { return new Date(b.starts_at).getTime() >= now; }).sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); });
    if (past.length) out.last = past[0];
    if (fut.length) out.next = fut[0];
    return out;
  }

  async function _galleryFor(cust) {
    var out = { count: 0, recentLabel: '', recentAt: 0, texts: [] };
    if (typeof window.loadGalleryItemsByCustomer !== 'function') return out;
    var items = [];
    try { items = (await window.loadGalleryItemsByCustomer(cust.id)) || []; } catch (_e) { items = []; }
    out.count = items.length;
    var labelled = items.filter(function (it) { return it && it.label && it.label !== '시술 사진'; });
    if (labelled.length) out.recentLabel = String(labelled[0].label).slice(0, 30);
    items.forEach(function (it) {
      if (it && it.savedAt > out.recentAt) out.recentAt = it.savedAt;
      // [⑤] 선호 스타일 추정용 텍스트(라벨/제목/메모) 수집.
      [it && it.label, it && it.title, it && it.memo].forEach(function (t) { if (t && t !== '시술 사진') out.texts.push(String(t)); });
    });
    return out;
  }

  // [⑤] 업종 추론 — 고객 시술/사진 텍스트 + shop_type. (market-data inferTags 와 유사하나 고객 텍스트 기반)
  function _industryOf(texts, shopType) {
    var s = (texts || []).join(' ') + ' ' + (shopType || '');
    if (/네일|손톱|젤|아트|글리터|프렌치|누드|파츠/.test(s)) return 'nail';
    if (/헤어|머리|염색|펌|컷|탈색|클리닉|레이어/.test(s)) return 'hair';
    if (/속눈썹|래쉬|연장/.test(s)) return 'lash';
    if (/눈썹|브로우/.test(s)) return 'brow';
    if (/피부|스킨|페이셜|결|모공|관리/.test(s)) return 'skin';
    if (/메이크업|화장|발색/.test(s)) return 'makeup';
    return '';
  }

  async function _retouchDue(cust) {
    try {
      if (typeof window.apiFetch !== 'function') return false;
      var auth = (typeof window.authHeader === 'function') ? window.authHeader() : {};
      var res = await window.apiFetch('/today/brief', { headers: auth });
      if (!res || !res.ok) return false;
      var b = await res.json();
      return (b.retouch_due_customers || []).some(function (c) { return c && c.id === cust.id; });
    } catch (_e) { return false; }
  }

  async function buildCustomerStatus(customer, _ctx) {
    var bk = await _bookingsFor(customer);
    var gal = await _galleryFor(customer);
    var retouch = await _retouchDue(customer);
    var lastDays = bk.last ? _daysAgo(bk.last.starts_at) : null;
    var galDays = gal.recentAt ? _daysAgo(gal.recentAt) : null;
    var lastVisitDays = (lastDays != null && galDays != null) ? Math.min(lastDays, galDays) : (lastDays != null ? lastDays : galDays);
    // [⑤] 선호 스타일/타이밍/추천행동 인사이트 — 기존 데이터(사진 텍스트·시술명)만 사용.
    var styleTexts = (gal.texts || []).concat([(bk.last && bk.last.service_name) || '']).filter(Boolean);
    var shopType = '';
    try { shopType = (window.ItdasyAssistantContext && window.ItdasyAssistantContext.collect && (function () { var c = window.ItdasyAssistantContext.collect(); return c && c.shopType && (c.shopType.cat || c.shopType.label); })()) || ''; } catch (_e) { void 0; }
    var industry = _industryOf(styleTexts, shopType);
    var s = {
      id: customer.id, name: customer.name || '고객', industry: industry,
      recentService: gal.recentLabel || (bk.last && bk.last.service_name) || '',
      lastVisitDays: lastVisitDays,
      nextBooking: bk.next ? _ymd(bk.next.starts_at) : '',
      photoCount: gal.count, recentPhoto: gal.recentAt ? _ymd(gal.recentAt) : '',
      isRetouchDue: !!retouch,
      isAtRisk: lastVisitDays != null && lastVisitDays >= 30,
      noNext: !bk.next,
    };
    var CI = window.ItdasyCustomerInsight;
    if (CI) {
      s.style = CI.inferStyle(styleTexts, industry);
      s.timing = CI.retouchTiming(lastVisitDays, industry);
      s.recActions = CI.recommendActions({ timing: s.timing, isRetouchDue: s.isRetouchDue, photoCount: s.photoCount, noNext: s.noNext, lastVisitDays: lastVisitDays });
    }
    return s;
  }


  function buildCustomerStatusMessage(s) {
    var lastTxt = (s.lastVisitDays != null) ? (s.lastVisitDays + '일 전') : '확인된 방문 기록 없음';
    var photoTxt = s.photoCount > 0 ? ('사진 기록 ' + s.photoCount + '장' + (s.recentPhoto ? ' (최근 ' + s.recentPhoto + ')' : '')) : '확인된 사진 기록 없음';
    var msg = s.name + '님 고객 상태예요.\n\n'
      + '최근 시술: ' + (s.recentService || '확인된 기록 없음') + '\n'
      + '마지막 방문: ' + lastTxt + '\n'
      + '다음 예약: ' + (s.nextBooking || '아직 없음') + '\n'
      + '사진 기록: ' + photoTxt;
    // [⑤] 선호 스타일 추정
    if (s.style && s.style.summary) msg += '\n\n선호 스타일 추정:\n· ' + s.style.summary;
    // [⑤] 리터치 타이밍
    if (s.timing && s.timing.text) msg += '\n\n리터치 타이밍:\n· ' + s.timing.text;
    // [⑤] 추천 행동(랭킹) — recActions 있으면 사용, 없으면 기존 라벨 폴백
    var recList = (s.recActions && s.recActions.length)
      ? s.recActions.map(function (a, i) { return (i + 1) + '. ' + a.label; })
      : _recLabels(s).map(function (r, i) { return (i + 1) + '. ' + r; });
    msg += '\n\n추천 행동:\n' + recList.join('\n');
    msg += '\n\n실제 발송이나 예약은 하지 않았어요.';
    return msg;
  }

  function _recLabels(s) {
    var out = ['리터치 안내 초안 만들기'];
    if (s.noNext || s.isAtRisk) out.push('재방문 안내 초안 만들기');
    if (s.photoCount > 0) out.push('사진 기록 확인하기');
    if (s.noNext) out.push('빈 시간 보기');
    out.push('고객 기록 열기');
    return out.slice(0, 5);
  }

  // Action Hub 버튼(최대 5, 전부 safe). 초안은 chat_suggest 로 기존 draft 경로 위임(발송 아님). 예약 자동생성 없음.
  // [⑤] 추천 행동 랭킹(recActions)을 버튼으로. 모두 safe/confirm, danger 0. 최대 4개.
  function buildCustomerStatusActions(s) {
    var nm = s.name;
    // [J-5] 초안 프롬프트는 공통 마케팅 정책으로 통일(없으면 로컬 폴백).
    var P = window.ItdasyMarketingDraftPolicy;
    var sug = function (type) { return (P && P.chatSuggest) ? P.chatSuggest(type, { name: nm }) : (nm + '님 안내 문구 만들어줘'); };
    // recActions 키 → 버튼 매핑(중복 제거, 순서 유지). 없으면 기존 규칙.
    var byKey = {
      retouch: { id: 'retouch_draft', kind: 'chat_suggest', label: '리터치 초안 만들기', phase: 'safe', payload: { text: sug('retouch_offer') } },
      promo: { id: 'promo_photo', kind: 'chat_suggest', label: '홍보 사진 만들기', phase: 'safe', payload: { text: '이 사진 홍보용으로 예쁘게 해줘' } },
      revisit: { id: 'revisit_draft', kind: 'chat_suggest', label: '재방문 안내 초안', phase: 'safe', payload: { text: sug('rebook_nudge') } },
      review: { id: 'review_draft', kind: 'chat_suggest', label: '후기 요청 초안', phase: 'safe', payload: { text: sug('review_request') } },
      tidy: { id: 'open_photos', kind: 'open_workshop', label: '사진 기록 정리', phase: 'safe', payload: {} },
    };
    var acts = [];
    if (s.recActions && s.recActions.length) {
      s.recActions.forEach(function (a) { if (byKey[a.key]) acts.push(byKey[a.key]); });
      if (s.noNext && !acts.some(function (x) { return x.id === 'empty_slots'; })) acts.push({ id: 'empty_slots', kind: 'open_calendar', label: '빈시간 보기', phase: 'safe', payload: {} });
    } else {
      // 폴백(인사이트 모듈 없음) — 기존 규칙
      acts.push(byKey.retouch);
      if (s.noNext || s.isAtRisk) acts.push(byKey.revisit);
      if (s.photoCount > 0) acts.push({ id: 'open_photos', kind: 'open_workshop', label: '사진 기록 확인', phase: 'safe', payload: {} });
      if (s.noNext) acts.push({ id: 'empty_slots', kind: 'open_calendar', label: '빈시간 보기', phase: 'safe', payload: {} });
    }
    acts.push({ id: 'open_cust', kind: 'open_customer', label: '고객 기록 열기', phase: 'safe', payload: { customer_id: s.id, name: s.name } });
    // 중복 id 제거 + 최대 4(+고객 기록 열기는 마지막 유지). 총 5 상한.
    var seen = {}, list = [];
    acts.forEach(function (a) { if (!seen[a.id]) { seen[a.id] = 1; list.push(a); } });
    list = list.slice(0, 5);
    return (window.ItdasyActionHub && window.ItdasyActionHub.normalizeActions) ? window.ItdasyActionHub.normalizeActions(list, 'hub') : list;
  }

  // 메인. 반환 { message, hubActions } | { message }(안내/후보). 채팅 푸시는 호출측.
  // [J-6.1] 신규 세션엔 Customer._cache 가 비어 search()가 0건 → 이름 고객이 "고객 먼저 선택"으로 빠짐.
  //   search 전 캐시 1회 보장. 자동 추측 없음(검색 대상만 채움). 실패해도 기존 안내로 fallback.
  async function ensureCustomerCache() {
    try {
      var C = window.Customer;
      if (!C || typeof C.list !== 'function') return;
      if (C._cache && C._cache.length) return;   // 이미 적재됨 → 과호출 방지
      await C.list();
    } catch (_e) { void 0; }
  }

  async function run(text, ctx) {
    ctx = ctx || (window.ItdasyAssistantContext && window.ItdasyAssistantContext.collect()) || {};
    await ensureCustomerCache();                 // [J-6.1] search 전 캐시 보장
    var r = resolveCustomerForStatus(text, ctx);
    if (r.none) {
      return { message: '고객을 먼저 선택해 주세요. 고객을 선택하면 최근 시술, 리터치 여부, 사진 기록까지 같이 확인해드릴게요.' };
    }
    if (r.ambiguous) {
      var names = r.candidates.map(function (c) { return c.name; }).join(', ');
      var btns = r.candidates.map(function (c) { return { id: 'pick_' + c.id, kind: 'chat_suggest', label: c.name, phase: 'safe', payload: { text: c.name + '님 뭐 챙겨야 돼?' } }; });
      return { message: '여러 고객이 있어요: ' + names + '. 누구 상태를 볼까요? (자동으로 고르지 않아요)',
        hubActions: window.ItdasyActionHub ? window.ItdasyActionHub.normalizeActions(btns.slice(0, 5), 'hub') : btns };
    }
    /* [잇비 전수QA 2026-09-11 · P1] '오래 안 온 손님' 은 **여기서 답하면 안 된다.**

       실측(실 Chrome, 배포본 6926ff0): "오래 안 온 손님 누구야?" →
         "한동안 안 오신 고객 정보는 고객 화면에서 확인할 수 있어요."
       이름을 하나도 못 준다. 원인은 아래 `_listMessage` 가 at_risk 일 때 목록을
       **`[]` 로 하드코딩**해 둔 것이고(`kind === 'retouch' ? (...) : []`),
       애초에 그게 읽는 `/today/brief` 엔 **at_risk 고객 목록 자체가 없다**(개수만 있다).
       즉 이 경로는 이탈 고객이 몇 명이든 항상 같은 회피 문장을 낸다 — 죽은 분기다.

       그리고 이 질문은 **백엔드가 이미 제대로 답한다**(`at_risk_customers` 즉답).
       판정기는 `services/retention_predictor.compute_at_risk` — 홈 브리핑·고객관리와
       같은 함수다. 2026-08-17 에 "'오래 안 온 손님' 의 정의는 앱 전체에서 하나여야 한다"
       고 정리한 그 함수다. 여기서 두 번째 정의를 만들 이유가 없다.

       그래서 **가로채지 않고 양보한다**(null → 호출측이 false → 백엔드로). 리터치는
       `/today/brief` 에 실제 목록(`retouch_due_customers`)이 있으므로 그대로 로컬 처리. */
    if (r.list && r.kind === 'at_risk') return null;
    if (r.list) return await _listMessage(r.kind);
    var status = await buildCustomerStatus(r.customer, ctx);
    return { message: buildCustomerStatusMessage(status), hubActions: buildCustomerStatusActions(status) };
  }

  async function _listMessage(_kind) {   // at_risk 는 백엔드로 양보 → 여기 오는 건 리터치뿐
    try {
      var auth = (typeof window.authHeader === 'function') ? window.authHeader() : {};
      var res = (typeof window.apiFetch === 'function') ? await window.apiFetch('/today/brief', { headers: auth }) : null;
      var b = (res && res.ok) ? await res.json() : {};
      // at_risk 는 위에서 백엔드로 양보했다 — 여기 오는 건 리터치뿐이다.
      var custs = (b.retouch_due_customers || []).filter(function (c) { return c && c.name; }).slice(0, 5);
      if (!custs.length) return { message: '지금 리터치 안내 대상으로 잡힌 고객은 없어요.' };
      var btns = custs.map(function (c) { return { id: 'pick_' + c.id, kind: 'chat_suggest', label: c.name, phase: 'safe', payload: { text: c.name + '님 뭐 챙겨야 돼?' } }; });
      return { message: '리터치 안내 대상: ' + custs.map(function (c) { return c.name; }).join(', ') + '. 누구 상태를 볼까요?',
        hubActions: window.ItdasyActionHub ? window.ItdasyActionHub.normalizeActions(btns, 'hub') : btns };
    } catch (_e) { return { message: '대상 고객 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' }; }
  }

  window.ItdasyCustomerStatusCard = {
    detectCustomerStatusIntent, resolveCustomerForStatus, buildCustomerStatus,
    buildCustomerStatusMessage, buildCustomerStatusActions, run,
  };
})();
