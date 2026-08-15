/* 잇비 Daily Ops Briefing (T-114 MVP · 2026-05-30)

   "오늘 뭐 해야 돼? / 오늘 브리핑해줘 / 오늘 샵 상태" → 오늘 운영 우선순위 요약.
   운영 "판단"이지 자동 실행 아님 — 읽기 전용. 발송/예약생성/기록수정 0.

   데이터 소스(전부 기존, 백엔드 수정 0):
   - GET /today/brief : 매출(오늘/어제)·리터치 대상·이탈·미기록·다음예약·추천(proactive_suggestions)
   - window.Booking.list/shopHours : 오늘 예약 목록 + 공백시간 계산
   - window.loadGalleryItems : 고객기록 미연결 사진(customer_id 없음, 최근 2일) 수

   추천 액션은 "~할까요?" 제안만 — 실행은 기존 잇비 명령(리터치 초안/사진연결/예약)으로 이어감. */
(function () {
  'use strict';
  if (window.ItdasyDailyBriefing) return;

  // 브리핑(종합 요청)만 감지. 단순 조회("오늘 매출?","오늘 예약 보여줘")는 제외 → 기존 경로 유지.
  const _BRIEF = /(브리핑|오늘\s*뭐\s*(해야|하면|할|하지)|오늘\s*할\s*일|샵\s*상태|가게\s*상태|매장\s*상태|오늘\s*어때|오늘\s*어떄|오늘\s*상황|오늘\s*정리|오늘\s*요약|오늘\s*체크|운영\s*(요약|브리핑|상황))/;
  const _NOT = /(매출|얼마|벌었|예약\s*(보여|목록|몇|있|확인))/;

  function detect(text) {
    const t = String(text || '').trim();
    if (!t) return false;
    return _BRIEF.test(t) && !_NOT.test(t);
  }

  function _todayRangeISO() {
    const s = new Date(); s.setHours(0, 0, 0, 0);
    const e = new Date(); e.setHours(23, 59, 59, 0);
    return { from: s.toISOString(), to: e.toISOString(), start: s, end: e };
  }
  function _hhmm(d) {
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function _man(n) {
    const v = Number(n) || 0;
    if (v >= 10000) return Math.round(v / 10000) + '만원';
    return v.toLocaleString('ko-KR') + '원';
  }

  async function _fetchBrief() {
    try {
      if (typeof window.apiFetch !== 'function') return null;
      const auth = (typeof window.authHeader === 'function') ? window.authHeader() : {};
      const res = await window.apiFetch('/today/brief', { headers: auth });
      if (!res || !res.ok) return null;
      return await res.json();
    } catch (_e) { return null; }
  }

  // 오늘 예약 목록 → {count, next, gaps[]}
  async function _bookingsAndGaps() {
    const out = { count: 0, next: null, gaps: [] };
    if (!(window.Booking && typeof window.Booking.list === 'function')) return out;
    const r = _todayRangeISO();
    let items = [];
    try { items = (await window.Booking.list(r.from, r.to)) || []; } catch (_e) { items = []; }
    items = items.filter((b) => b && b.starts_at && b.status !== 'cancelled')
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    out.count = items.length;
    const now = Date.now();
    const future = items.filter((b) => new Date(b.starts_at).getTime() >= now);
    if (future.length) {
      out.next = { at: new Date(future[0].starts_at), name: future[0].customer_name || '', service: future[0].service_name || '' };
    }
    // 공백: 영업시간 내, 1시간 이상, 지금 이후 끝나는 구간 최대 3개.
    const hours = (window.Booking.shopHours && window.Booking.shopHours()) || { start: 10, end: 22 };
    const dayStart = new Date(r.start); dayStart.setHours(hours.start, 0, 0, 0);
    const dayEnd = new Date(r.start); dayEnd.setHours(hours.end, 0, 0, 0);
    let cursor = new Date(Math.max(dayStart.getTime(), now));
    const blocks = items.map((b) => ({ s: new Date(b.starts_at), e: new Date(b.ends_at || (new Date(b.starts_at).getTime() + 60 * 60000)) }))
      .filter((x) => x.e.getTime() > cursor.getTime());
    for (const blk of blocks) {
      if (out.gaps.length >= 3) break;
      if (blk.s.getTime() - cursor.getTime() >= 60 * 60000) {
        out.gaps.push({ s: new Date(cursor), e: new Date(blk.s) });
      }
      if (blk.e.getTime() > cursor.getTime()) cursor = new Date(blk.e);
    }
    if (out.gaps.length < 3 && dayEnd.getTime() - cursor.getTime() >= 60 * 60000) {
      out.gaps.push({ s: new Date(cursor), e: new Date(dayEnd) });
    }
    return out;
  }

  // 고객기록 미연결 사진(최근 2일 저장, customer_id 없음) 수.
  async function _unlinkedPhotoCount() {
    try {
      if (typeof window.loadGalleryItems !== 'function') return 0;
      const all = await window.loadGalleryItems();
      const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000;
      return (all || []).filter((it) => it && it.customer_id == null && (it.savedAt || 0) >= cutoff).length;
    } catch (_e) { return 0; }
  }

  // [④] /today/brief + 예약/사진 신호 → 우선순위 모듈 입력 형태로 변환.
  function _toSignals(brief, bk, unlinked) {
    var b = brief || {};
    // 객단가 추정: 오늘 매출/예약수 (둘 다 있을 때만, 보수적).
    var avg = 0;
    if (b.revenue_total > 0 && bk.count > 0) avg = Math.round(b.revenue_total / bk.count);
    return {
      retouch: { count: b.retouch_due_count || 0, customers: (b.retouch_due_customers || []).slice(0, 3).map((c) => ({ id: c.id, name: c.name })).filter((c) => c.name) },
      unrecorded: { count: b.unrecorded_count || 0 },
      emptySlots: (bk.gaps || []).map((g) => ({ from: _hhmm(g.s) })),
      atRisk: { count: b.at_risk_count || 0 },
      unlinked: { count: unlinked || 0 },
      revenueTotal: b.revenue_total || 0,
      avgTicket: avg,
    };
  }

  async function run() {
    const [brief, bk, unlinked] = await Promise.all([_fetchBrief(), _bookingsAndGaps(), _unlinkedPhotoCount()]);

    // [④] 매출 우선순위 랭킹 — briefing-priority 모듈로 점수화. 모듈 있으면 랭킹 메시지, 없으면 기존 나열 fallback.
    const PR = window.ItdasyBriefingPriority;
    if (PR && typeof PR.rank === 'function') {
      return _runRanked(PR.rank(_toSignals(brief, bk, unlinked), { limit: 3 }), brief, bk);
    }

    const lines = [];
    const recs = [];
    const actions = [];   // [T-115] 추천 버튼(안전 — 화면 이동/초안 경로만)

    // 처리할 거리(시그널)가 하나도 없으면 = 조용한 날 → 친절 안내. (공백만 있는 빈 스케줄은 시그널 아님)
    const hasSignal = bk.count > 0 || unlinked > 0
      || !!(brief && (brief.retouch_due_count > 0 || brief.at_risk_count > 0 || brief.unrecorded_count > 0 || brief.revenue_total > 0));
    if (!hasSignal) {
      return { message: '오늘은 특별히 처리할 알림이 없어요. 예약과 매출 흐름은 안정적이에요.' };
    }

    // 예약 + 다음
    if (bk.count > 0) {
      const nx = bk.next ? `, 다음은 ${_hhmm(bk.next.at)} ${bk.next.name || ''}${bk.next.service ? '(' + bk.next.service + ')' : ''}`.replace(/\s+,/, ',') : '';
      lines.push(`오늘 예약 ${bk.count}건${nx}`);
    } else {
      lines.push('오늘 예약은 아직 없어요');
    }
    // 공백
    if (bk.gaps.length) {
      lines.push('비어 있는 시간: ' + bk.gaps.map((g) => `${_hhmm(g.s)}~${_hhmm(g.e)}`).join(', '));
    }
    // 리터치
    if (brief && brief.retouch_due_count > 0) {
      const custs = (brief.retouch_due_customers || []).slice(0, 3).map((c) => ({ id: c.id, name: c.name })).filter((c) => c.name);
      const names = custs.map((c) => c.name);
      lines.push(`리터치 시기 지난 고객 ${brief.retouch_due_count}명${names.length ? ': ' + names.join('·') : ''}`);
      recs.push(`리터치 고객 ${Math.min(brief.retouch_due_count, 3)}명에게 안내 초안 만들기`);
      actions.push({ id: 'retouch_draft', kind: 'retouch_draft', label: '리터치 안내 초안', safety: 'safe', payload: { customers: custs } });
    }
    // 이탈 임박
    if (brief && brief.at_risk_count > 0) {
      lines.push(`한동안 안 오신 고객 ${brief.at_risk_count}명`);
      actions.push({ id: 'at_risk', kind: 'open_at_risk', label: '이탈 고객 확인', safety: 'safe', payload: { count: brief.at_risk_count } });
    }
    // 미연결 사진
    if (unlinked > 0) {
      lines.push(`최근 저장한 사진 ${unlinked}장이 아직 고객 기록에 안 붙었어요`);
      recs.push(`미연결 사진 ${unlinked}장 고객 기록에 연결`);
      actions.push({ id: 'unlinked_photos', kind: 'open_unlinked_photos', label: '미연결 사진 확인', safety: 'safe', payload: { count: unlinked } });
    }
    // 매출 미기록
    if (brief && brief.unrecorded_count > 0) {
      lines.push(`매출 미기록 ${brief.unrecorded_count}건`);
      recs.push(`매출 미기록 ${brief.unrecorded_count}건 정리`);
      actions.push({ id: 'unrecorded_revenue', kind: 'open_unrecorded', label: '매출 미기록 정리', safety: 'safe', payload: { count: brief.unrecorded_count } });
    }
    // 매출 + 어제 대비
    if (brief && brief.revenue_total > 0) {
      let cmp = '';
      if (brief.today_total != null && brief.yesterday_total != null) {
        if (brief.today_total > brief.yesterday_total) cmp = ', 어제보다 좋아요';
        else if (brief.today_total < brief.yesterday_total) cmp = ', 어제보단 낮아요';
      }
      lines.push(`오늘 매출 ${_man(brief.revenue_total)}${cmp}`);
    }
    // 공백 추천 (예약 제안은 실행 아님, 제안만)
    if (bk.gaps.length && recs.length < 3) {
      recs.push(`${_hhmm(bk.gaps[0].s)} 공백에 단골 예약 제안`);
    }
    if (bk.gaps.length && actions.length < 5) {
      actions.push({ id: 'empty_slot', kind: 'open_empty_slot', label: '공백 시간 활용', safety: 'safe', payload: { first: _hhmm(bk.gaps[0].s) } });
    }
    // 백엔드 능동 추천 보강 (중복 최소화)
    if (brief && Array.isArray(brief.proactive_suggestions)) {
      brief.proactive_suggestions.forEach((s) => {
        if (recs.length >= 3) return;
        const txt = (s && (s.text || s.label)) ? String(s.text || s.label) : '';
        if (txt && !recs.some((r) => r.includes('리터치') && /리터치/.test(txt))) {
          // 너무 긴 텍스트는 컷
          if (!recs.includes(txt)) recs.push(txt.slice(0, 40));
        }
      });
    }

    if (!lines.length) {
      return { message: '오늘은 특별히 처리할 알림이 없어요. 예약과 매출 흐름은 안정적이에요.', actions: [] };
    }
    let msg = '☀️ 오늘 브리핑이에요.\n\n' + lines.map((l) => '• ' + l).join('\n');
    if (recs.length) {
      msg += '\n\n추천:\n' + recs.slice(0, 3).map((r, i) => `${i + 1}. ${r}`).join('\n');
    }
    try { window.ItdasyAssistantContext && window.ItdasyAssistantContext.markRecentAction('오늘 브리핑'); } catch (_e) { void 0; }
    return { message: msg, actions: actions };
  }

  // [④] 우선순위 랭킹 결과 → 불릿 메시지 + briefing_actions(항목 버튼 평탄화). 자동 실행 0.
  function _runRanked(ranked, brief, _bk) {
    try { window.ItdasyAssistantContext && window.ItdasyAssistantContext.markRecentAction('오늘 브리핑'); } catch (_e) { void 0; }
    // 매출 한 줄(정보) — 있으면 헤더에.
    var revLine = '';
    if (brief && brief.revenue_total > 0) {
      var cmp = '';
      if (brief.today_total != null && brief.yesterday_total != null) {
        if (brief.today_total > brief.yesterday_total) cmp = ' (어제보다 좋아요)';
        else if (brief.today_total < brief.yesterday_total) cmp = ' (어제보단 낮아요)';
      }
      revLine = '오늘 매출 ' + _man(brief.revenue_total) + cmp + '\n';
    }
    if (ranked.fallback) {
      return { message: '☀️ 오늘 브리핑이에요.\n' + revLine + '\n' + ranked.summaryLine
        + '\n\n자동 발송·예약·매출 기록은 하지 않았어요. 버튼을 눌러 확인 후 진행할 수 있어요.',
        actions: (ranked.fallbackActions || []) };
    }
    // [2026-08-16] "오늘 우선순위 TOP N" 헤더·"1./이유:" 보고서 포맷 폐기(원영 지적 — 일반 분기와
    //   문체가 달라 일관성 깨짐). 일반 브리핑과 같은 "☀️ 오늘 브리핑이에요 + • 불릿" 으로 통일.
    var lines = ['☀️ 오늘 브리핑이에요.'];
    if (revLine) lines.push(revLine.trim());
    lines.push('');
    lines.push(ranked.summaryLine);
    lines.push('');
    var actions = [];
    ranked.items.forEach(function (it, i) {
      lines.push('• ' + it.title);
      lines.push('  ' + it.reason);
      // 항목 버튼 — id 에 순번 prefix(중복 방지). briefing_actions 평탄화(J-4 runAction 라우팅 재사용).
      (it.actions || []).slice(0, 3).forEach(function (a) {
        actions.push({ id: (i + 1) + '_' + a.id, kind: a.kind, label: a.label, safety: a.safety || 'safe', payload: a.payload || {} });
      });
    });
    lines.push('');
    lines.push('자동 발송·예약·매출 기록은 하지 않았어요. 버튼을 눌러 확인 후 진행할 수 있어요.');
    return { message: lines.join('\n'), actions: actions };
  }

  // [T-115/J-4] 추천 버튼 클릭 → 다음 단계를 "한 카드 + Action Hub 버튼"으로 펼침.
  //   J-1~J-3 체인 연결(safe nav/draft, confirm 안내). 자동 발송/예약/매출생성/기록수정/고객연결 0.
  //   반환: { message, hubActions } | { message }. 버튼은 route:'hub'(data-asst-hub-act) → ActionHub 가 처리.
  function _act(id, kind, label, phase, payload) { return { id, kind, label, phase, payload: payload || {}, route: 'hub' }; }
  // [J-5] 초안 프롬프트는 공통 마케팅 정책으로 통일(없으면 폴백).
  function _sug(type, name) {
    var P = window.ItdasyMarketingDraftPolicy;
    if (P && P.chatSuggest) return P.chatSuggest(type, name ? { name } : null);
    return (name ? name + '님 ' : '') + '안내 문구 만들어줘';
  }

  function _retouchCard(p) {
    const custs = Array.isArray(p.customers) ? p.customers : [];
    if (custs.length === 1) {
      const nm = custs[0].name;
      return { message: `${nm}님 리터치 안내가 필요해요. 먼저 고객 상태를 확인하거나, 안내 초안을 만들 수 있어요.`,
        hubActions: [
          _act('cust_status', 'chat_suggest', '고객 상태 확인', 'safe', { text: `${nm}님 뭐 챙겨야 돼?` }),
          _act('retouch', 'chat_suggest', '리터치 초안 만들기', 'safe', { text: _sug('retouch_offer', nm) }),
          _act('open_cust', 'open_customer', '고객 기록 열기', 'safe', {}),
        ] };
    }
    if (custs.length > 1) {
      const btns = custs.slice(0, 5).map((c) => _act('pick_' + c.id, 'chat_suggest', c.name, 'safe', { text: `${c.name}님 뭐 챙겨야 돼?` }));
      return { message: `리터치 안내가 필요한 고객이 있어요: ${custs.map((c) => c.name).join(', ')}. 누구부터 볼까요? (자동으로 고르지 않아요)`, hubActions: btns };
    }
    return { message: '리터치 대상 고객이 없어요.' };
  }

  // [J-4] 각 추천을 체인 버튼 세트로 확장. 기존 kind 유지하고 반환만 강화.
  function runAction(action) {
    if (!action || !action.kind) return { message: '' };
    const p = action.payload || {};
    switch (action.kind) {
      case 'retouch_draft':
        return _retouchCard(p);
      case 'open_unlinked_photos':
        return { message: '고객 기록에 아직 연결되지 않은 사진이 있어요. 사진을 확인한 뒤 고객 기록에 저장할 수 있어요. (자동 연결은 하지 않아요)',
          hubActions: [
            _act('open_ws', 'open_workshop', '미연결 사진 확인', 'safe', {}),
            _act('promo', 'chat_suggest', '홍보용으로 정리', 'safe', { text: '이 사진 홍보용으로 예쁘게 해줘' }),
            _act('save_cust', 'save_photo_to_customer', '고객기록에 저장', 'confirm', {}),
          ] };
      case 'open_unrecorded':
        return { message: '매출 미기록 건이 있어요. 매출 화면에서 확인하고 정리할 수 있어요. (자동 기록은 하지 않아요)',
          hubActions: [
            _act('rev', 'open_revenue', '매출 확인', 'safe', {}),
            _act('bookings', 'open_calendar', '미기록 예약 보기', 'safe', {}),
            _act('rec_rev', 'record_revenue', '매출 기록하기', 'confirm', {}),
          ] };
      case 'open_at_risk':
        return { message: '한동안 안 오신 고객이 있어요. 고객 상태를 확인하거나 재방문 안내 초안을 만들 수 있어요. (실제 발송은 하지 않아요)',
          hubActions: [
            _act('cust_status', 'chat_suggest', '고객 상태 확인', 'safe', { text: '오래 안 온 손님 챙겨줘' }),
            _act('revisit', 'chat_suggest', '재방문 안내 초안', 'safe', { text: _sug('rebook_nudge') }),
            _act('open_cust', 'open_customer', '고객 기록 열기', 'safe', {}),
          ] };
      case 'open_empty_slot':
        return { message: '비어 있는 시간이 있어요. 빈 시간을 확인하거나 재방문 안내 초안을 만들 수 있어요. (자동 예약은 하지 않아요)',
          hubActions: [
            _act('slots', 'open_calendar', '빈시간 보기', 'safe', {}),
            _act('revisit', 'chat_suggest', '재방문 안내 초안', 'safe', { text: _sug('rebook_nudge') }),
            _act('book', 'create_booking', '예약 카드 만들기', 'confirm', {}),
          ] };
      // [④] 랭킹 항목 직결 kind — 한 번 더 카드로 펼치지 않고 바로 초안/이동/안내.
      case 'at_risk_revisit':
        return { chatInput: _sug('rebook_nudge') };   // 재방문 초안 → 기존 draft 경로(발송 아님)
      case 'promo_from_photo':
        return { chatInput: '이 사진 홍보용으로 예쁘게 해줘' };   // 홍보 사진 체인 진입
      case 'record_revenue':
        return { message: '매출 기록은 확인 단계가 필요해요. 매출 화면에서 완료 처리하면 기록돼요. (자동 기록은 하지 않아요)',
          hubActions: [_act('rev_open', 'open_revenue', '매출 확인', 'safe', {})] };
      default:
        return { message: '' };
    }
  }

  window.ItdasyDailyBriefing = { detect, run, runAction };
})();
