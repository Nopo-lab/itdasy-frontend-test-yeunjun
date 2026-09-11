/* assistant-intent-router.js — P0-1: FE intent pre-parser
   목적: 명확한 단답 의도(인사·감사·도움말)에 한해 BE/LLM 호출 0회로 즉시 응답.
         매출·예약 SQL-first 응답은 P0-1.5에서 별도 추가 예정.

   사용:
     const r = window.AssistantIntent.classifyObvious(text);
     if (r.matched) {  // 즉시 응답 가능
       // r.response 텍스트로 답변 + return (LLM 호출 skip)
     }

   설계 원칙:
     - 순수 함수. 외부 state 없음. BE 호출 없음.
     - 매칭 안 되면 그대로 false 반환 → 기존 흐름 유지 (안전).
     - 롤백 플래그: localStorage.assistant_router_disabled === '1' 이면 항상 false 반환.
     - 측정: window.__assistantRouterStats.hits / .total 카운트.
*/
(function () {
  'use strict';

  const STATS_KEY = '__assistantRouterStats';
  if (!window[STATS_KEY]) {
    window[STATS_KEY] = { hits: 0, total: 0, byType: {} };
  }

  function _disabled() {
    try { return localStorage.getItem('assistant_router_disabled') === '1'; }
    catch (_e) { void _e; return false; }
  }

  function _trim(s) { return String(s == null ? '' : s).trim(); }

  function _bumpStats(type) {
    try {
      const s = window[STATS_KEY];
      s.total += 1;
      if (type) {
        s.hits += 1;
        s.byType[type] = (s.byType[type] || 0) + 1;
      }
    } catch (_e) { void _e; }
  }

  // ─── 매칭 규칙 ─────────────────────────────────────────
  // 각 규칙은 { test(q), type, response } 형태.
  // response 는 함수 가능 — 시간대별 분기 등.

  const RULES = [
    // [2026-06-11 #3] 정책/지시 문장 — "김민지 없으면 새 고객 만들지 말고 먼저 물어봐" 같은
    //   안전 지시를 통계/조회로 오분류하던 버그. 최우선 매칭으로 차단하고, 잇비 영구 메모(facts)에
    //   저장해 이후 LLM 응답에도 반영되게 한다.
    {
      type: 'policy_instruction',
      test: (q) => /(하지\s*마|하지마|말\s*고\b|만들지\s*말|말지\s*말|금지|임의로\s*(하지|처리)|먼저\s*(물어|확인)|꼭\s*(물어|확인))/.test(q)
        && /(고객|예약|매출|저장|등록|삭제|취소|만들|추가|보내|발송|DM|메시지)/.test(q),
      response: (q) => {
        // [2026-06-11 QA] 같은 정책 반복 시 메모 중복 누적 방지 — 최근 저장분과 비교
        try {
          const seen = JSON.parse(localStorage.getItem('itdasy_policy_saved') || '[]');
          const norm = String(q).replace(/\s+/g, '');
          if (seen.includes(norm)) return '네, 그건 이미 기억하고 있어요 🧠 (메뉴 ⋯ > 잇비 메모에서 확인 가능)';
          seen.push(norm);
          localStorage.setItem('itdasy_policy_saved', JSON.stringify(seen.slice(-20)));
        } catch (_d) { void _d; }
        try {
          if (window.authHeader && typeof apiFetch === 'function') {
            apiFetch('/assistant/facts', {
              method: 'POST',
              headers: Object.assign({ 'Content-Type': 'application/json' }, window.authHeader()),
              body: JSON.stringify({ text: String(q).slice(0, 500), kind: 'permanent' }),
            }).catch(() => {});
          }
        } catch (_e) { void _e; }
        return '네, 기억할게요 🧠 앞으로 그 지시대로 할게요 — 확실하지 않으면 임의로 진행하지 않고 먼저 확인할게요.\n(잇비 메모에 저장해뒀어요. 메뉴 ⋯ > 잇비 메모에서 언제든 수정 가능해요)';
      },
    },
    // [2026-06-11 B8 v2] "저장한 카드 작업실에서 보여줘" — _lastAssistantSave 없으면 DB 최신 슬롯으로 폴백
    {
      type: 'show_last_saved',
      test: (q) => /(저장한|방금).{0,10}(카드|거|결과|템플릿)/.test(q) && /(보여|열어|어디)/.test(q),
      response: () => {
        let last = window._lastAssistantSave;
        if (!last) { try { last = JSON.parse(localStorage.getItem('itdasy_last_asst_save') || 'null'); } catch (_e) { last = null; } }
        setTimeout(() => {
          try { if (typeof window.closeAssistant === 'function') window.closeAssistant(); } catch (_e) { void _e; }
          try { if (typeof showTab === 'function') showTab('workshop', null); } catch (_e) { void _e; }
          const open = async () => {
            // 1순위: 기억된 slotId 하이라이트
            if (last && last.slotId && typeof window.highlightWorkshopSlot === 'function') {
              const found = await Promise.resolve(window.highlightWorkshopSlot(last.slotId)).catch(() => false);
              if (found) return;
            }
            // 폴백: DB 에서 가장 최근 슬롯 하이라이트
            try {
              if (typeof window.loadSlotsFromDB === 'function') {
                const slots = await window.loadSlotsFromDB();
                if (slots && slots.length > 0 && typeof window.highlightWorkshopSlot === 'function') {
                  window.highlightWorkshopSlot(slots[0].id);
                }
              }
            } catch (_e2) { void _e2; }
          };
          if (window.AppLoader && !window.AppLoader.loaded('photo')) window.AppLoader.ensure('photo').then(open);
          else open();
        }, 350);
        return '네! 작업실로 이동해서 저장된 카드를 보여드릴게요 →';
      },
    },
    // 인사
    {
      type: 'greeting',
      test: (q) => /^(안녕|하이|hi|hello|halo|반가워|반갑|좋은\s*(아침|오후|저녁))/i.test(q),
      response: () => {
        const h = new Date().getHours();
        const part = h < 5 ? '늦은 시간까지' : h < 12 ? '좋은 아침이에요' : h < 18 ? '좋은 오후예요' : '좋은 저녁이에요';
        return `${part}, 사장님 😊\n오늘은 뭘 도와드릴까요? 예약·매출·고객·캡션 다 가능해요.`;
      },
    },
    // 감사
    {
      type: 'thanks',
      test: (q) => /^(고마(워|워요|웠|웠어)|감사(해|합니다|요)|땡큐|thx|thanks|thank\s*you)/i.test(q),
      response: '별말씀을요! 또 필요한 거 있으면 편하게 말씀해주세요 🙌',
    },
    // 사과·격려 응답
    {
      type: 'sorry',
      test: (q) => /^(미안|죄송|쏘리|sorry)/i.test(q),
      response: '괜찮아요, 사장님! 다시 편하게 말씀해주세요.',
    },
    // 도움말
    {
      type: 'help',
      test: (q) => /^(뭐\s*할\s*수\s*있|기능\s*(알려|보여|뭐)?|도움말|help|메뉴얼|매뉴얼|사용법|어떻게\s*써)/i.test(_trim(q)),
      response:
        '제가 도와드릴 수 있는 일이에요:\n\n' +
        '📅 예약: "내일 오후 2시 김민지 리터치"\n' +
        '💰 매출: "오늘 매출 얼마?", "이번 달 매출"\n' +
        '👥 고객: "김민지 정보", "새 고객 추가"\n' +
        '📸 사진: 사진 던지면 자동 보정·캡션·인스타\n' +
        '🤖 자동화: DM 자동응답, 리뷰 요청, 이탈 고객 관리\n\n' +
        '편하게 말씀해주세요!',
    },
    // 너 누구야 / 정체
    {
      type: 'who',
      test: (q) => /^(너\s*누구|니가\s*누구|넌\s*누구|자기소개|소개\s*해|who\s*are\s*you)/i.test(_trim(q)),
      response: '저는 잇데이 AI 잇비예요. 사장님의 1인샵 운영을 도와드리는 만능 도우미예요. 예약·매출·고객·사진·마케팅 다 해드릴게요 😊',
    },
  ];

  // ─── 메인 분류 함수 ─────────────────────────────────────
  function classifyObvious(text) {
    _bumpStats(null); // total 카운트
    if (_disabled()) return { matched: false, reason: 'disabled' };

    const q = _trim(text);
    if (!q || q.length > 80) {
      // 너무 길면 LLM 영역. 단답 의도가 아닐 가능성 큼.
      return { matched: false };
    }

    for (const rule of RULES) {
      try {
        if (rule.test(q)) {
          const response = typeof rule.response === 'function' ? rule.response(q) : rule.response;
          _bumpStats(rule.type);
          return { matched: true, type: rule.type, response };
        }
      } catch (_e) { void _e; /* 매칭 실패 시 다음 규칙으로 */ }
    }
    return { matched: false };
  }

  // ─── [P0-1.5] SQL-first 비동기 규칙 ─────────────────────
  // 매출/예약 단순 조회 — BE 의 가벼운 endpoint 호출, LLM 0회.
  // BE 의 /revenue·/bookings 는 이미 KV 캐시 + SQL 직조회 → 빠름 (50~300ms).
  // 응답 포맷:
  //   - RevenueListOut: { items, total, count, net_total, margin_total }
  //   - BookingListOut: { items: [{ starts_at, customer_name, service_name, ... }] }

  function _krw(v) {
    try { return Number(v || 0).toLocaleString('ko-KR') + '원'; }
    catch (_e) { void _e; return (v || 0) + '원'; }
  }

  function _dayRangeISO(offsetDays) {
    const t = new Date();
    if (offsetDays) t.setDate(t.getDate() + offsetDays);
    const s = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 0, 0, 0);
    const e = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 23, 59, 59);
    return { from: s.toISOString(), to: e.toISOString() };
  }

  function _weekRangeISO() {
    const t = new Date();
    const day = t.getDay() || 7; // 일=0 → 7로 환산 (월요일 시작 주)
    const start = new Date(t.getFullYear(), t.getMonth(), t.getDate() - (day - 1), 0, 0, 0);
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
    return { from: start.toISOString(), to: end.toISOString() };
  }

  /* [잇비 전수QA 2026-09-11 · P1] **취소·노쇼를 세고 있었다.**

     실측(실 Chrome, 배포본 6926ff0, 오늘 예약 confirmed 2 + cancelled 1):
       "오늘 예약 알려줘" → 머리글 "📅 오늘 예약 3건" · 카드는 **2장**
     원장님은 3건을 준비한다. 숫자와 목록이 한 화면에서 서로 다른 말을 한다.

     원인은 계산이 **두 갈래**였다는 것 — 머리글은 `_formatBookings(d.items)`(원본),
     카드는 `app-assistant.js _runAsyncIntentRule` 의 `items.filter(status!=='cancelled')`.
     한쪽에만 필터가 있었다. 백엔드 즉답(`today_bookings`)은 처음부터
     `status.notin_(('cancelled','no_show'))` 로 맞게 세고 있었는데, FE 가 가로채서 틀린 값을 냈다.

     그래서 필터를 **execAsyncRule 한 곳**으로 올린다. 머리글도 카드도 같은 배열만 본다. */
  function activeBookings(items) {
    return (items || []).filter((b) => b && b.status !== 'cancelled' && b.status !== 'no_show');
  }

  function _formatBookings(items, label) {
    if (!items || !items.length) return `📅 ${label} 예약 없어요.`;
    const lines = items.slice(0, 8).map((b) => {
      const t = new Date(b.starts_at);
      const hh = String(t.getHours()).padStart(2, '0');
      const mm = String(t.getMinutes()).padStart(2, '0');
      const who = b.customer_name || '손님';
      const svc = b.service_name || '';
      return `${hh}:${mm} ${who}${svc ? ' · ' + svc : ''}`;
    });
    let out = `📅 ${label} 예약 ${items.length}건\n` + lines.join('\n');
    if (items.length > 8) out += `\n... 외 ${items.length - 8}건`;
    return out;
  }

  async function _fetchJson(path) {
    const auth = (typeof window.authHeader === 'function') ? window.authHeader() : {};
    const r = await apiFetch(path, { headers: auth });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  /* [잇비 전수QA 2026-09-11 · P1] **지출을 물었는데 매출을 답했다.**

     실측(실 Chrome, 배포본 6926ff0):
       "이번 달 지출 얼마야?" → "📊 이번 달 매출 385,000원 (21건)"
       (실제 이번 달 지출은 **0원**이다 — 백엔드 `expense_summary` 로 확인)
     원장님이 이 답을 그대로 믿으면 이번 달 재료비를 38만원 쓴 걸로 안다.

     원인: 아래 매출 규칙들이 `(이번 달) + (얼마)` 만 보고 매칭한다. '지출'이라는 단어를
     아무도 안 본다. 백엔드엔 `expense_summary` 즉답이 이미 있고 정확히 답한다 —
     FE 가 가로채는 바람에 거기 닿지 못했을 뿐이다.

     ⚠️ 이 목록은 **돈의 종류**를 가른다. 새 표현을 넣을 땐 매출/지출 양쪽을 같이 본다.
        한쪽만 넣으면 같은 뜻의 다른 말이 또 반대편으로 샌다. */
  const EXPENSE_WORD_RE = /(지출|비용|재료비|매입|경비|나간\s*돈|쓴\s*돈|얼마\s*썼|얼마나\s*썼|원가)/;
  function _isExpenseQ(q) { return EXPENSE_WORD_RE.test(String(q || '')); }

  const ASYNC_RULES = [
    // 매출 — 오늘
    {
      type: 'revenue_today',
      test: (q) => !_isExpenseQ(q) && (/^(오늘|금일)\s*(의)?\s*(매출|얼마|벌)/.test(q) || /오늘\s*얼마/.test(q)),
      fetch: () => _fetchJson('/revenue?period=today'),
      format: (d) => {
        const t = d.total || 0;
        const c = d.count || 0;
        if (c === 0) return '📊 오늘 매출 아직 없어요. 화이팅 💪';
        return `📊 오늘 매출 **${_krw(t)}** (${c}건)`;
      },
    },
    // 매출 — 이번 주
    {
      type: 'revenue_week',
      test: (q) => !_isExpenseQ(q) && /(이번|금)\s*주.*(매출|얼마|벌)/.test(q),
      fetch: () => _fetchJson('/revenue?period=week'),
      format: (d) => `📊 이번 주 매출 **${_krw(d.total || 0)}** (${d.count || 0}건)`,
    },
    // 매출 — 이번 달
    {
      type: 'revenue_month',
      test: (q) => !_isExpenseQ(q) && /((이번|금|이)\s*달|월\s*매출|이달).*(매출|얼마|벌)?/.test(q) && /(매출|얼마|벌)/.test(q),
      fetch: () => _fetchJson('/revenue?period=month'),
      format: (d) => `📊 이번 달 매출 **${_krw(d.total || 0)}** (${d.count || 0}건)`,
    },
    // 매출 — 지난 달
    {
      type: 'revenue_last_month',
      test: (q) => !_isExpenseQ(q) && /(지난|저번)\s*달.*(매출|얼마|벌)/.test(q),
      fetch: () => _fetchJson('/revenue?period=last_month'),
      format: (d) => `📊 지난 달 매출 **${_krw(d.total || 0)}** (${d.count || 0}건)`,
    },
    // ── 예약 조회 [2026-07-05 확장] ─────────────────────────
    // 어순 자유("예약 내일 뭐있어") + 붙여쓰기("내일예약뭐있어") + 모레/주말/요일/다음주/특정날짜.
    // 생성·취소·변경 동사가 있으면 _bookingListQ 가 양보 → 앞단 숏컷(생성/취소 카드)이 처리.
    // 예약 — 특정 날짜 ("7월 20일 예약 뭐 있어")
    {
      type: 'bookings_date',
      test: (q) => _bookingListQ(q) && (/\d{1,2}\s*월\s*\d{1,2}\s*일/.test(q) || /\d{1,2}\/\d{1,2}/.test(q)),
      fetch: () => {
        const md = _lastAsyncQ.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/) || _lastAsyncQ.match(/(\d{1,2})\/(\d{1,2})/);
        const now = new Date();
        const mo = parseInt(md[1], 10), dd = parseInt(md[2], 10);
        const s = new Date(now.getFullYear(), mo - 1, dd, 0, 0, 0);
        const e = new Date(now.getFullYear(), mo - 1, dd, 23, 59, 59);
        _bookingLabel = `${mo}월 ${dd}일`;
        return _fetchJson(`/bookings?from=${encodeURIComponent(s.toISOString())}&to=${encodeURIComponent(e.toISOString())}`);
      },
      format: (d) => _formatBookings(d.items, _bookingLabel || '해당 날짜'),
    },
    // 예약 — 모레 (내일보다 먼저: "내일모레"는 모레)
    {
      type: 'bookings_day_after',
      test: (q) => _bookingListQ(q) && /모레/.test(q),
      fetch: () => {
        const r = _dayRangeISO(2);
        return _fetchJson(`/bookings?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`);
      },
      format: (d) => _formatBookings(d.items, '모레'),
    },
    // 예약 — 내일
    {
      type: 'bookings_tomorrow',
      test: (q) => (_bookingListQ(q) && /내일/.test(q)) || /내일\s*몇\s*건/.test(q),
      fetch: () => {
        const r = _dayRangeISO(1);
        return _fetchJson(`/bookings?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`);
      },
      format: (d) => _formatBookings(d.items, '내일'),
    },
    // 예약 — 주말 ("이번 주말 예약 있어?" — 이번주 규칙보다 먼저)
    {
      type: 'bookings_weekend',
      test: (q) => _bookingListQ(q) && /주말/.test(q),
      fetch: () => {
        const t = new Date();
        const day = t.getDay() || 7;   // 월=1 … 일=7
        let satOffset = 6 - day;       // 이번 주 토요일까지 남은 일수 (일요일이면 -1 = 어제 토요일)
        if (/다음\s*주/.test(_lastAsyncQ)) satOffset += 7;
        const s = new Date(t.getFullYear(), t.getMonth(), t.getDate() + satOffset, 0, 0, 0);
        const e = new Date(t.getFullYear(), t.getMonth(), t.getDate() + satOffset + 1, 23, 59, 59);
        return _fetchJson(`/bookings?from=${encodeURIComponent(s.toISOString())}&to=${encodeURIComponent(e.toISOString())}`);
      },
      format: (d) => _formatBookings(d.items, '주말'),
    },
    // 예약 — 특정 요일 ("토요일 예약 뭐 있어", "다음주 화요일 예약")
    {
      type: 'bookings_weekday',
      test: (q) => _bookingListQ(q) && /[월화수목금토일]요일/.test(q),
      fetch: () => {
        const m = _lastAsyncQ.match(/([월화수목금토일])요일/);
        const dow = _WEEKDAYS[m ? m[1] : '월'];
        const t = new Date();
        let diff = (dow - t.getDay() + 7) % 7;   // 0=오늘 포함, 다가오는 해당 요일
        if (/다음\s*주/.test(_lastAsyncQ)) {
          const day = t.getDay() || 7;
          diff = (8 - day) + ((dow || 7) - 1);   // 다음 주 월요일 + 요일 오프셋
        }
        const s = new Date(t.getFullYear(), t.getMonth(), t.getDate() + diff, 0, 0, 0);
        const e = new Date(t.getFullYear(), t.getMonth(), t.getDate() + diff, 23, 59, 59);
        _bookingLabel = `${m ? m[1] : ''}요일(${s.getMonth() + 1}/${s.getDate()})`;
        return _fetchJson(`/bookings?from=${encodeURIComponent(s.toISOString())}&to=${encodeURIComponent(e.toISOString())}`);
      },
      format: (d) => _formatBookings(d.items, _bookingLabel || '해당 요일'),
    },
    // 예약 — 다음 주
    {
      type: 'bookings_next_week',
      test: (q) => _bookingListQ(q) && /다음\s*주/.test(q),
      fetch: () => {
        const w = _weekRangeISO();
        const MS7 = 7 * 24 * 60 * 60 * 1000;
        const from = new Date(new Date(w.from).getTime() + MS7).toISOString();
        const to = new Date(new Date(w.to).getTime() + MS7).toISOString();
        return _fetchJson(`/bookings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      },
      format: (d) => _formatBookings(d.items, '다음 주'),
    },
    // 예약 — 이번 주
    {
      type: 'bookings_week',
      test: (q) => _bookingListQ(q) && /(이번|금)\s*주/.test(q),
      fetch: () => {
        const r = _weekRangeISO();
        return _fetchJson(`/bookings?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`);
      },
      format: (d) => _formatBookings(d.items, '이번 주'),
    },
    // 예약 — 오늘 (날짜 단어가 아예 없는 "예약 뭐 있어?"도 오늘로)
    {
      type: 'bookings_today',
      test: (q) => _bookingListQ(q)
        && (/오늘|금일/.test(q) || !/(내일|모레|어제|주말|요일|주|달|월|일)/.test(q)),
      fetch: () => {
        const r = _dayRangeISO(0);
        return _fetchJson(`/bookings?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`);
      },
      format: (d) => _formatBookings(d.items, '오늘'),
    },
  ];

  // [2026-07-05] 예약 '조회' 질문 판별 — 생성/취소/변경 동사가 보이면 앞단 숏컷 몫이므로 양보.
  let _lastAsyncQ = '';      // findAsyncRule 매칭 시점의 질문 (fetch/format 에서 날짜 재해석용)
  let _bookingLabel = '';    // 특정 날짜/요일 규칙의 표시 라벨
  function _bookingListQ(q) {
    if (!/예약|몇\s*건/.test(q)) return false;
    if (/(잡아|잡을|잡기|추가|등록|넣어|만들|취소|삭제|캔슬|변경|바꿔|옮겨|미뤄|당겨|복구|되돌)/.test(q)) return false;
    return true;
  }

  // 매칭만 — 동기. fetch 진입 전 사용자 메시지 표시 + loading 띄울 수 있도록 분리.
  function findAsyncRule(text) {
    if (_disabled()) return null;
    const q = _trim(text);
    if (!q || q.length > 40) return null;
    // [2026-06-10 QA] 조언성 질문은 숫자 숏컷이 가로채면 안 됨 — "오늘 매출 조언해줘"가
    //   매출 숫자만 띄우고 끝나던 버그. 조언/분석 의도면 LLM 으로 보낸다.
    if (/조언|추천|어떻게|어떡|어떄|팁|전략|분석|아이디어|뭐부터|뭘 해야|개선/.test(q)) return null;
    // [2026-06-11 #3] 정책/지시 문장도 async 숫자 룰이 가로채면 안 됨 (위 RULES 의 policy_instruction 이 처리)
    if (/(하지\s*마|하지마|말\s*고\b|만들지\s*말|금지|먼저\s*(물어|확인)|꼭\s*(물어|확인))/.test(q)) return null;
    for (const rule of ASYNC_RULES) {
      try { if (rule.test(q)) { _lastAsyncQ = q; return rule; } }
      catch (_e) { void _e; }
    }
    return null;
  }

  // 매칭된 규칙 실행 — async. fetch 실패 시 throw → caller 가 LLM fallback 또는 에러 메시지 결정.
  async function execAsyncRule(rule) {
    const data = await rule.fetch();
    // [2026-09-11 P1] 예약 조회는 **여기서 한 번** 취소·노쇼를 걷어낸다.
    //   format(머리글)과 호출측(카드)이 같은 배열을 보게 하는 유일한 지점이다.
    if (/^bookings_/.test(rule.type || '') && data && Array.isArray(data.items)) {
      data.items = activeBookings(data.items);
    }
    const response = rule.format(data);
    _bumpStats(rule.type);
    return { matched: true, type: rule.type, response, data };
  }

  // ─── [P0-4-SQL] 예약 취소 SQL-first ─────────────────────
  // "{이름} 예약 취소" 패턴 매칭 → FE 가 직접 customer + booking 조회
  // → cancel_booking action 객체 만들어서 호출자에게 반환
  // → 호출자(app-assistant.js)가 기존 카드 렌더링 흐름에 그대로 투입
  // → 사장님이 카드 '실행' 버튼 → P0-4 nativeConfirm → /assistant/execute
  // LLM 안 거침. SYSTEM_PROMPT 이슈 우회. 즉시 카드 표시.

  // "취소" 또는 "캔슬" 동사 패턴
  const _CANCEL_VERB = /(취소|삭제|지워|없애|캔슬)/;
  // "전부 / 모두 / 다 / 싹 / 전체 / 모조리" — 일괄 취소 의도
  const _CANCEL_ALL = /(전부|모두|모조리|싹|전체|싸그리)|(\s|^)다\s*(취소|지워|삭제|캔슬)/;

  // 이름 추출 노이즈 차단 — 날짜·시간·서비스명·일반 동사 제거
  const _NAME_STOP_WORDS = new Set([
    '예약', '취소', '삭제', '캔슬', '전부', '모두', '전체', '모조리',
    '유도', '문구', '캡션', '홍보', '해시', '해시태그',   // [B4] 카피/캡션 단어를 고객명으로 오추출 방지
    '오늘', '내일', '모레', '어제', '이번', '다음', '저번', '지난',
    '주말', '평일', '월요', '화요', '수요', '목요', '금요', '토요', '일요',
    '리터치', '볼륨', '머리', '자연', '붙임', '옴브레', '커트', '염색',
    '하라', '하라고', '해줘', '해주', '부탁', '제발',
    '라고', '이라고', '이라', '에게', '한테', '에서', '으로', '까지',
  ]);

  // 날짜·시간 토큰을 공백으로 치환 (이름 후보에서 "5월 21일거"의 "일거" 같은 가짜 후보 차단)
  function _stripDateTokens(t) {
    return t
      .replace(/\d+\s*월\s*\d+\s*일(?:거|치|에|은|이|을|의)?/g, ' ')  // "5월 21일", "5월 21일거"
      .replace(/\d{1,2}\/\d{1,2}/g, ' ')                                  // "5/21"
      .replace(/\d{1,2}:\d{2}/g, ' ')                                     // "03:00"
      .replace(/\d+\s*시(\s*\d+\s*분)?/g, ' ')                            // "3시", "3시 30분"
      .replace(/\d+\s*분/g, ' ')
      .replace(/(오늘|내일|모레|어제|이번\s*주|다음\s*주|저번\s*주|지난\s*주|이번\s*달|지난\s*달|다음\s*달|이번\s*주말|주말|평일|월요일?|화요일?|수요일?|목요일?|금요일?|토요일?|일요일?)/g, ' ');
  }

  // 날짜 힌트 추출 → { y, m, d } 또는 { dayOffset: 0|1|2 } 또는 null
  function _extractDateHint(q) {
    const today = new Date();
    const md = q.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/) || q.match(/(\d{1,2})\/(\d{1,2})/);
    if (md) {
      return { y: today.getFullYear(), m: parseInt(md[1], 10), d: parseInt(md[2], 10) };
    }
    if (/오늘|금일/.test(q))  return { dayOffset: 0 };
    if (/내일/.test(q))      return { dayOffset: 1 };
    if (/모레/.test(q))      return { dayOffset: 2 };
    return null;
  }

  // 예약이 날짜 힌트와 매칭되는지 확인
  function _bookingMatchesDate(b, hint) {
    if (!hint || !b || !b.starts_at) return true;
    const t = new Date(b.starts_at);
    if (hint.dayOffset != null) {
      const ref = new Date();
      ref.setDate(ref.getDate() + hint.dayOffset);
      return t.getFullYear() === ref.getFullYear()
          && t.getMonth() === ref.getMonth()
          && t.getDate() === ref.getDate();
    }
    if (hint.y != null) {
      return t.getFullYear() === hint.y
          && (t.getMonth() + 1) === hint.m
          && t.getDate() === hint.d;
    }
    return true;
  }

  // 이름 추출 — 날짜 토큰 제거 후 한글 2~5자 후보 중 stop-word 제외, 마지막 후보 우선.
  // 이유: "5월 21일거 예약취소하라고 장수아" 같이 이름이 뒤쪽에 오는 자연어 패턴 대응.
  function _extractCancelTarget(q) {
    const t = _trim(q);
    if (!_CANCEL_VERB.test(t)) return null;
    if (!/예약/.test(t)) return null;
    const stripped = _stripDateTokens(t);
    const candidates = [];
    const re = /([가-힣]{2,5})/g;
    let m;
    while ((m = re.exec(stripped)) !== null) {
      const w = m[1];
      if (_NAME_STOP_WORDS.has(w)) continue;
      // stop word 가 후보 안에 부분 포함된 경우도 제외 ("취소하" → '취소' 포함)
      let blocked = false;
      _NAME_STOP_WORDS.forEach((s) => { if (w.includes(s)) blocked = true; });
      if (blocked) continue;
      candidates.push(w);
    }
    if (!candidates.length) return null;
    // 마지막 후보를 이름으로 (취소 동사 뒤에 이름이 오는 한국어 패턴 우세)
    return { name: candidates[candidates.length - 1], all: _CANCEL_ALL.test(t), dateHint: _extractDateHint(t) };
  }

  // 두 이름 유사도 — fuzzy match (포함 / 정확 / 끝글자 매칭)
  function _nameMatches(target, candidate) {
    if (!target || !candidate) return false;
    /* [잇비 전수QA 2026-09-11 · P2] **정확히 부른 이름이 접두사형과 동점(100)이 됐다.**
       실측: 고객 목록에 "김호영" 과 "E2E_C_김호영" 이 둘 다 있을 때
         "김호영님 예약 있어?" → "🔍 같은 이름 2명 있어요"
       같은 이름이 아니다. 하나는 **완전히 같고** 하나는 접두사가 붙은 다른 사람이다.
       백엔드(`_customer_ids_by_name`)는 exact 를 먼저 찾고 거기서 1명이면 확정한다 —
       FE 만 둘을 같은 등급으로 봤다. 그래서 완전 일치에 한 단계 높은 점수를 준다.
       (진짜 동명이인은 둘 다 110 이라 되묻기가 그대로 살아 있다.) */
    if (target === candidate) return 110;
    // [P1 2026-09-09 실측] DB 이름에 **접두사**가 붙어 있으면 정확히 부른 이름도 '유사'로 떨어졌다.
    //   실 Chrome: "E2E_A_박지우님 모레 오후 3시에 커트 예약 잡아줘"
    //     → "🔍 정확히 일치하는 고객이 없어요. 비슷한 이름 후보예요:
    //        · E2E_B_박지우현 · E2E_A_박지우"        ← 정확한 이름을 댔는데 되묻는다
    //   이름 추출이 `[가-힣]{2,5}` 라 "박지우" 만 뽑고, `candidate.includes(target)` = 90 점이
    //   되어 자동 확정(100)에 못 미친다. 게다가 "박지우현" 도 같은 90 이라 **다른 고객이
    //   후보 1번으로 올라온다.** 되묻기 문구는 "정확한 이름으로 다시 알려주세요" 인데
    //   이미 정확한 이름을 댔으므로 다시 말해도 같은 답이 나온다 — 빠져나갈 길이 없다.
    //
    //   운영 데이터에도 접두사 이름이 실제로 있다("(샘플) 이수민" — 시드·별칭 표기).
    //   그래서 **이름 경계에서 끝나는 접두사형은 같은 사람**으로 본다.
    //   백엔드 `_customer_ids_by_name` 이 쓰는 규칙과 같은 계약이다(형제 경로 정렬).
    //   "박지우현" 은 "박지우" 로 끝나지 않으므로 여전히 90 — 동명 유사자는 안 올라온다.
    if (candidate.endsWith(target) && candidate.length > target.length) {
      const sep = candidate.charAt(candidate.length - target.length - 1);
      if (/[^가-힣]/.test(sep)) return 100;
    }
    if (candidate.includes(target)) return 90;
    if (target.includes(candidate)) return 80;
    // 끝 2글자 매칭 (성 제외 이름)
    if (target.length >= 2 && candidate.length >= 2 && target.slice(-2) === candidate.slice(-2)) return 60;
    return 0;
  }

  // [A4] 고객 확정 결정: 정확 일치(score 100·단독)만 자동 확정. 90/80/60 등 유사 매칭과
  //   동명이인(100·복수)은 조용히 선택하지 않고 확인/후보 안내로 멈춘다.
  //   scored: [{ c, score }] 내림차순 정렬 가정(비어있지 않음). 반환 { customer } | { askText }.
  //   [핫픽스F 보강] askText 와 함께 candidates(후보 목록)도 반환 → 호출측(예약 draft)이 전화/순번으로 재선택.
  function _decideCustomer(scored) {
    const top = scored[0].score;
    const tied = scored.filter((x) => x.score === top);
    if (top >= 100 && tied.length === 1) return { customer: tied[0].c };
    const fmt = (x) => `· ${x.c.name}${x.c.phone ? ' (' + x.c.phone + ')' : ''}`;
    if (top >= 100) {  // 동명이인 — 전화번호로 구분 요청
      return { askText: `🔍 같은 이름 ${tied.length}명 있어요. 전화번호 뒷자리나 순번(1·2…)으로 알려주세요:\n${tied.slice(0, 5).map((x, i) => `${i + 1}) ${x.c.name}${x.c.phone ? ' (' + x.c.phone + ')' : ''}`).join('\n')}`, candidates: tied.slice(0, 5).map((x) => x.c) };
    }
    // top < 100 — 유사 후보뿐. 자동 확정 금지(다른 고객 오선택 방지).
    if (scored.length === 1) {
      return { askText: `🔍 정확히 일치하는 고객은 없어요. 비슷한 이름으로 ${scored[0].c.name} 고객님이 있는데, 맞으면 정확한 이름으로 다시 말씀해 주세요.`, candidates: [scored[0].c] };
    }
    return { askText: `🔍 정확히 일치하는 고객이 없어요. 비슷한 이름 후보예요. 정확한 이름으로 다시 알려주세요:\n${scored.slice(0, 5).map(fmt).join('\n')}`, candidates: scored.slice(0, 5).map((x) => x.c) };
  }

  function _formatBookingShort(b) {
    try {
      const t = new Date(b.starts_at);
      const m = String(t.getMonth() + 1).padStart(2, '0');
      const d = String(t.getDate()).padStart(2, '0');
      const hh = String(t.getHours()).padStart(2, '0');
      const mm = String(t.getMinutes()).padStart(2, '0');
      return `${m}/${d} ${hh}:${mm}`;
    } catch (_e) { void _e; return ''; }
  }

  // 결과 객체:
  //   { matched: true, kind: 'card', action: {...} }  → caller 가 카드 렌더
  //   { matched: true, kind: 'message', text: '...' } → caller 가 텍스트만 표시
  //   { matched: true, kind: 'choices', candidates: [...] }  → 후보 여러 명
  async function tryCancelBooking(text) {
    if (_disabled()) return null;
    const target = _extractCancelTarget(text);
    if (!target) return null;

    // 1) 고객 검색 — 전체 리스트 받아서 FE 필터 (BE 에 q 파라미터 없음)
    let customers;
    try {
      const r = await _fetchJson('/customers?limit=500');
      customers = (r && r.items) || [];
    } catch (_e) {
      void _e;
      return { matched: true, kind: 'message', text: '⚠️ 고객 정보 조회 실패. 잠시 후 다시.' };
    }

    const scored = customers
      .map((c) => ({ c, score: _nameMatches(target.name, c.name || '') }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return { matched: true, kind: 'message', text: `🔍 ${target.name}님 정보를 찾지 못했어요. 이름 다시 확인해 주세요.` };
    }

    // [A4] 정확 일치(100·단독)만 자동 확정. 유사/동명이인은 조용히 선택 금지 → 확인·후보 안내로 멈춤.
    const _picked = _decideCustomer(scored);
    if (_picked.askText) return { matched: true, kind: 'message', text: _picked.askText };
    const customer = _picked.customer; // 정확 일치 1명

    // 2) 예약 조회 — [2026-06-14 QA] from 을 "오늘 0시"로. 기존 from=now 는 오전 10시 예약을
    //    오후에 조회하면 과거로 빠져 "예정된 예약이 없어요" 오답("오늘 예약 확인"은 보이는데 취소는 안 됨).
    const _todayStart = new Date(); _todayStart.setHours(0, 0, 0, 0);
    const todayStartISO = _todayStart.toISOString();
    const futureEndISO = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(); // 90일 안
    let bookings;
    try {
      const r = await _fetchJson(`/bookings?from=${encodeURIComponent(todayStartISO)}&to=${encodeURIComponent(futureEndISO)}`);
      bookings = ((r && r.items) || []).filter((b) =>
        b.customer_id === customer.id || (b.customer_name && b.customer_name === customer.name)
      ).filter((b) => b.status !== 'cancelled' && b.status !== 'completed' && b.status !== 'no_show');
    } catch (_e) {
      void _e;
      return { matched: true, kind: 'message', text: '⚠️ 예약 정보 조회 실패. 잠시 후 다시.' };
    }

    if (bookings.length === 0) {
      return { matched: true, kind: 'message', text: `📅 ${customer.name}님의 예정된 예약이 없어요.` };
    }

    // 날짜 힌트가 있으면 해당 날짜로 필터링 (예: "5월 21일거 장수아 예약취소")
    let filtered = bookings;
    if (target.dateHint) {
      filtered = bookings.filter((b) => _bookingMatchesDate(b, target.dateHint));
      if (filtered.length === 0) {
        const lines = bookings.slice(0, 5).map((b) => `· ${_formatBookingShort(b)}${b.service_name ? ' ' + b.service_name : ''}`);
        return {
          matched: true,
          kind: 'message',
          text: `📅 ${customer.name}님 해당 날짜에 예약 없어요. 예정 예약 ${bookings.length}건:\n${lines.join('\n')}`,
        };
      }
    }

    // "전부 / 모두 / 다" — 일괄 취소 카드 (한 번 확인 → 순차 실행)
    if (target.all && filtered.length > 1) {
      const lines = filtered.map((b) => `· ${_formatBookingShort(b)}${b.service_name ? ' ' + b.service_name : ''}`);
      const action = {
        kind: 'cancel_booking_bulk',
        payload: {
          booking_ids: filtered.map((b) => b.id),
          customer_id: customer.id,
          customer_name: customer.name,
        },
        confirmation_text: `${customer.name}님 예정 예약 ${filtered.length}건 전부 취소할까요?\n${lines.join('\n')}`,
        confidence: 0.95,
        _source_question: text,
      };
      _bumpStats('cancel_booking_bulk');
      return { matched: true, kind: 'card', action, customer };
    }

    if (filtered.length > 1) {
      const lines = filtered.slice(0, 5).map((b) => `· ${_formatBookingShort(b)}${b.service_name ? ' ' + b.service_name : ''}`);
      return {
        matched: true,
        kind: 'message',
        text: `📅 ${customer.name}님 예정 예약 ${filtered.length}건. 어느 예약 취소할지 시간 알려주세요 (전부 취소하려면 "전부" 라고 말씀해주세요):\n${lines.join('\n')}`,
      };
    }

    // 정확히 1건 → cancel_booking action 객체 생성 → caller 가 카드로 렌더
    const b = filtered[0];
    const action = {
      kind: 'cancel_booking',
      payload: {
        booking_id: b.id,
        customer_id: customer.id,
        customer_name: customer.name,
      },
      confirmation_text: `${customer.name}님 ${_formatBookingShort(b)}${b.service_name ? ' ' + b.service_name : ''} 예약 취소할까요?`,
      confidence: 0.95,
      _source_question: text,
      _ai_original: { booking_id: b.id, customer_name: customer.name },
      _context_booking: b,
    };
    _bumpStats('cancel_booking');
    return { matched: true, kind: 'card', action, customer, booking: b };
  }

  // ─── [T-008] 예약 생성 자연어 ("{이름} 예약 잡아줘") ────────
  //   안전 설계: 자연어 시간 파싱은 오인 위험이 커서 하지 않고, 고객을 해석해
  //   예약 화면을 고객까지 채워서 연다(대시보드 "예약 잡기"와 동일 _pendingBookingCustomer 패턴).
  // [핫픽스F #5-2] "…예약해/예약해줘/예약하자/예약 부탁" 도 생성 동사로 인정 — 한 문장 예약을 가격표/OCR로 오라우팅 방지.
  //   "내일 예약"(목적어 뒤 동사 없음=조회)·"예약 확인"은 매칭 안 됨(생성 동사 필수).
  const _CREATE_VERB = /예약\s*(을|를)?\s*(잡아\s*줘|잡아주|잡아|잡아라|잡|추가|등록|넣어\s*줘|넣어|만들어\s*줘|만들어|해\s*줘|해줘|해\s*주세요|해\s*주|하자|부탁해?|해)/;
  // [핫픽스E #1] "예약 잡기" CTA 가 free-text 재주입될 때 "잡기"가 고객명으로 오추출되던 버그 차단.
  //   예약 동사/명사형을 stopword 에 추가 → 후보 0 → tryCreateBooking 이 "어느 고객 예약을…" 으로 정상 안내.
  const _CREATE_STOPS = new Set(['잡아', '잡아줘', '잡기', '잡아라', '예약하기', '하기', '추가', '등록', '넣어', '넣기', '만들어', '만들기', '생성', '변경', '취소', '복구', '되돌려', '손님', '고객', '님', '이', '그', '저', '새']);

  // 시간대 단어(이름 오인 방지). 서비스명은 SHOP_CONFIG treatments 에서 동적으로 제거.
  const _PERIOD_WORDS = /(오전|오후|저녁|아침|밤|낮|정오|새벽)/g;
  function _stripServiceWords(s) {
    try {
      const st = localStorage.getItem('shop_type') || '';
      const cfg = (window.SHOP_CONFIG && window.SHOP_CONFIG[st]) || null;
      const list = (cfg && cfg.treatments) || [];
      let out = s;
      list.forEach((sv) => { if (sv) out = out.split(sv).join(' '); });
      return out;
    } catch (_e) { return s; }
  }

  function _extractCreateTarget(q) {
    const t = _trim(q);
    if (_CANCEL_VERB.test(t)) return null;   // 취소 의도가 우선
    if (!_CREATE_VERB.test(t)) return null;
    if (!/예약/.test(t)) return null;
    // [P0-C] "{이름}님" 접미가 가장 강한 신호 — 서비스/시간 단어 오인 방지.
    const honor = t.match(/([가-힣]{2,4})님/);
    if (honor && !_NAME_STOP_WORDS.has(honor[1]) && !_CREATE_STOPS.has(honor[1])) {
      return { name: honor[1], dateHint: _extractDateHint(t) };
    }
    // 접미 없으면: 날짜·시간대·서비스 단어 제거 후 첫 한글 후보를 이름으로.
    let stripped = _stripDateTokens(t).replace(_PERIOD_WORDS, ' ');
    stripped = _stripServiceWords(stripped);
    const candidates = [];
    const re = /([가-힣]{2,5})/g;
    let m;
    while ((m = re.exec(stripped)) !== null) {
      const w = m[1];
      if (_NAME_STOP_WORDS.has(w) || _CREATE_STOPS.has(w)) continue;
      let blocked = false;
      _NAME_STOP_WORDS.forEach((s) => { if (w.includes(s)) blocked = true; });
      _CREATE_STOPS.forEach((s) => { if (s.length >= 2 && w.includes(s)) blocked = true; });
      if (blocked) continue;
      candidates.push(w);
    }
    // 이름 없으면("이 손님 예약 잡아줘") name='' → currentCustomer fallback.
    return { name: candidates.length ? candidates[0] : '', dateHint: _extractDateHint(t) };
  }

  const _LOOKUP_STOPS = new Set([
    '예약', '언제', '언제야', '몇시', '몇', '시간', '확인', '조회', '알려', '알려줘',
    '있어', '있나', '잡혀', '예정', '일정', '고객', '손님', '님', '은', '는', '이', '가',
    '을', '를', '그', '거', '오늘', '내일', '모레',
    // [2026-07-05 핫픽스] "오늘 예약은 없어?" → '없어'를 고객명으로 오인하던 버그.
    //   부정형도 스톱워드 — 이름 없으면 null 반환 → 날짜 조회 규칙(bookings_today 등)이 처리.
    '없어', '없나', '없냐', '없니', '없지', '없음', '없는', '없대',
  ]);

  function _looksBookingLookup(q) {
    const t = _trim(q);
    if (!/예약/.test(t)) return false;
    if (_CANCEL_VERB.test(t) || _CREATE_VERB.test(t)) return false;
    if (/(복구|되돌|바꿔|바꾸|변경|옮겨|미뤄|당겨)/.test(t)) return false;
    return /(언제|몇\s*시|시간|확인|조회|알려|있어|있나|잡혀|예정|일정|예약은|예약\s*있)/.test(t);
  }

  function _extractLookupTarget(q) {
    const t = _trim(q);
    const honor = t.match(/([가-힣]{2,4})님/);
    if (honor && !_NAME_STOP_WORDS.has(honor[1])) return { name: honor[1], dateHint: _extractDateHint(t) };
    let stripped = _stripDateTokens(t).replace(_PERIOD_WORDS, ' ');
    stripped = _stripServiceWords(stripped);
    const words = stripped.match(/[가-힣]{2,5}/g) || [];
    // [2026-07-05] "내일예약뭐있어" 붙여쓰기 → "예약뭐있어"가 고객명으로 오인되던 버그.
    //   stop word(2자 이상)가 후보 단어 안에 '포함'만 돼도 이름 아님 → 날짜 조회 규칙으로 양보.
    const name = words.find((w) => {
      if (_NAME_STOP_WORDS.has(w) || _LOOKUP_STOPS.has(w)) return false;
      let blocked = false;
      _NAME_STOP_WORDS.forEach((s) => { if (s.length >= 2 && w.includes(s)) blocked = true; });
      _LOOKUP_STOPS.forEach((s) => { if (s.length >= 2 && w.includes(s)) blocked = true; });
      return !blocked;
    });
    return { name: name || '', dateHint: _extractDateHint(t) };
  }

  function _futureRangeISO() {
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const to = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  function _activeBookingsForCustomer(items, customer) {
    return ((items || []).filter((b) =>
      b && (b.customer_id === customer.id || b.customer_name === customer.name)
    ).filter((b) => b.status !== 'cancelled' && b.status !== 'completed' && b.status !== 'no_show')
      .sort((a, b) => new Date(a.starts_at || 0) - new Date(b.starts_at || 0)));
  }

  function _formatLookupBookings(customer, list) {
    if (!list.length) return `📅 ${customer.name}님의 예정된 예약이 없어요.`;
    const lines = list.slice(0, 5).map((b) => `· ${_formatBookingShort(b)}${b.service_name ? ' ' + b.service_name : ''}`);
    if (list.length === 1) return `📅 ${customer.name}님 예약은 ${lines[0].replace(/^·\s*/, '')}예요.`;
    return `📅 ${customer.name}님 예정 예약 ${list.length}건이에요.\n${lines.join('\n')}`;
  }

  // 결과: { matched, kind:'card'|'slots'|'open_booking'|'message', ... }
  //   [P0-C] ctx.currentCustomer 로 "이 손님" 해석. 고객 확정되면 시간 파싱 → 카드/빈시간 추천.
  async function tryCreateBooking(text, ctx) {
    if (_disabled()) return null;
    const target = _extractCreateTarget(text);
    if (!target) return null;

    // 이름 없음("이 손님 예약 잡아줘" 등) → 현재 고객 사용, 없으면 안내.
    if (!target.name) {
      const cur = ctx && ctx.currentCustomer;
      if (cur && cur.id != null) return _bookingForCustomer({ id: cur.id, name: cur.name || '고객' }, text);
      // [핫픽스F #5-1] needCustomer → 호출측이 예약 draft 를 '고객 대기'로 무장. 다음에 고객명만 와도 방문주기로 안 샌다.
      return { matched: true, kind: 'message', needCustomer: true, text: '어느 고객 예약을 잡을까요? 고객 이름을 알려주시거나 고객 상세를 먼저 열어주세요.' };
    }

    let customers;
    try {
      const r = await _fetchJson('/customers?limit=500');
      customers = (r && r.items) || [];
    } catch (_e) {
      void _e;
      return { matched: true, kind: 'message', text: '⚠️ 고객 정보 조회 실패. 잠시 후 다시.' };
    }

    const scored = customers
      .map((c) => ({ c, score: _nameMatches(target.name, c.name || '') }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return { matched: true, kind: 'message',
        text: `🔍 ${target.name}님을 못 찾았어요. 이름을 다시 확인해 주시거나, 새 고객이면 고객 추가 후 예약해 주세요.` };
    }

    // [A4] 정확 일치(100·단독)만 자동 확정. 유사/동명이인은 조용히 선택 금지 → 확인·후보 안내로 멈춤.
    const _picked = _decideCustomer(scored);
    if (_picked.askText) return { matched: true, kind: 'message', text: _picked.askText };
    const customer = _picked.customer;
    return _bookingForCustomer({ id: customer.id, name: customer.name }, text);
  }

  async function tryLookupBooking(text) {
    if (_disabled() || !_looksBookingLookup(text)) return null;
    const target = _extractLookupTarget(text);
    if (!target.name) return null;
    let customers;
    try { const r = await _fetchJson('/customers?limit=500'); customers = (r && r.items) || []; }
    catch (_e) { void _e; return { matched: true, kind: 'message', text: '⚠️ 고객 정보 조회 실패. 잠시 후 다시.' }; }
    const scored = customers.map((c) => ({ c, score: _nameMatches(target.name, c.name || '') }))
      .filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
    if (!scored.length) {
      return { matched: true, kind: 'message', text: `🔍 ${target.name}님을 못 찾았어요. 이름을 다시 확인해 주세요.` };
    }
    const picked = _decideCustomer(scored);
    if (picked.askText) return { matched: true, kind: 'message', text: picked.askText };
    const customer = { id: picked.customer.id, name: picked.customer.name };
    let bookings;
    try {
      const r = _futureRangeISO();
      const data = await _fetchJson(`/bookings?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`);
      bookings = _activeBookingsForCustomer((data && data.items) || [], customer);
    } catch (_e) {
      void _e;
      return { matched: true, kind: 'message', text: '⚠️ 예약 정보 조회 실패. 잠시 후 다시.' };
    }
    const filtered = target.dateHint ? bookings.filter((b) => _bookingMatchesDate(b, target.dateHint)) : bookings;
    const textOut = _formatLookupBookings(customer, filtered);
    _bumpStats('lookup_booking');
    return { matched: true, kind: 'message', type: 'bookings_lookup', text: textOut, booking_cards: filtered.slice(0, 5), data: { items: filtered.slice(0, 5) } };
  }

  // ─── [P0-C] 예약 생성 완성: 시간 해석 + 빈시간 추천 + create_booking 카드 ────────
  const _WEEKDAYS = { '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6 };

  // 날짜 base(해당 날 00:00) 해석: 요일/이번주/다음주 + 기존 dateHint(오늘/내일/MM월DD일).
  function _resolveDateBase(text) {
    const today = new Date();
    const wd = text.match(/([일월화수목금토])요일/);
    if (wd) {
      const target = _WEEKDAYS[wd[1]];
      const nextWeek = /다음\s*주|담주/.test(text);
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      let add = (target - d.getDay() + 7) % 7;
      if (add === 0) add = 7;            // 같은 요일이면 다음 주로
      if (nextWeek) add += 7;
      d.setDate(d.getDate() + add);
      return d;
    }
    const hint = _extractDateHint(text);
    if (!hint) return null;
    if (hint.dayOffset != null) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      d.setDate(d.getDate() + hint.dayOffset);
      return d;
    }
    if (hint.m) return new Date(hint.y, hint.m - 1, hint.d);
    return null;
  }

  // 시간 해석 → { hour, min, concrete } | { period } | null
  function _resolveTime(text) {
    const hm = text.match(/(\d{1,2})\s*시\s*(\d{1,2})?\s*분?/) || text.match(/(\d{1,2}):(\d{2})/);
    const isPM = /오후|저녁|밤/.test(text);
    const isAM = /오전|아침/.test(text);
    if (hm) {
      let hour = parseInt(hm[1], 10);
      const min = hm[2] ? parseInt(hm[2], 10) : (/반/.test(text) ? 30 : 0);
      if (isPM && hour < 12) hour += 12;
      if (isAM && hour === 12) hour = 0;
      if (!isAM && !isPM && hour >= 1 && hour <= 8) hour += 12;
      if (hour >= 0 && hour <= 23) return { hour, min, concrete: true };
    }
    if (isPM) return { period: 'pm' };
    if (isAM) return { period: 'am' };
    if (/저녁|밤/.test(text)) return { period: 'evening' };
    return null;
  }

  function _shopDefaultService() {
    try {
      const st = localStorage.getItem('shop_type') || '';
      const cfg = (window.SHOP_CONFIG && window.SHOP_CONFIG[st]) || null;
      return (cfg && cfg.defaultTag) || '';
    } catch (_e) { return ''; }
  }

  // 텍스트에서 서비스명 추출(업종 treatments 매칭) → 없으면 기본 서비스.
  function _extractService(text) {
    try {
      const st = localStorage.getItem('shop_type') || '';
      const cfg = (window.SHOP_CONFIG && window.SHOP_CONFIG[st]) || null;
      const list = (cfg && cfg.treatments) || [];
      for (const s of list) { if (s && text.includes(s)) return s; }
    } catch (_e) { void 0; }
    return _shopDefaultService();
  }

  function _fmtSlot(d) {
    const wd = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()}(${wd}) ${hh}:${mm}`;
  }

  // 빈 시간 추천: 영업시간 내 1시간 슬롯 중 충돌 없는 미래 시각 N개. Booking 전역 활용.
  async function _suggestSlots(dateBase, period, max) {
    max = max || 3;
    if (!(window.Booking && typeof window.Booking.list === 'function')) return [];
    const base = dateBase || (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); return d; })();
    const hours = (window.Booking.shopHours && window.Booking.shopHours()) || { start: 10, end: 22 };
    let lo = hours.start, hi = hours.end;
    if (period === 'am') hi = Math.min(hi, 12);
    else if (period === 'pm') lo = Math.max(lo, 12);
    else if (period === 'evening') lo = Math.max(lo, 18);
    const from = new Date(base); from.setHours(0, 0, 0, 0);
    const to = new Date(base); to.setHours(23, 59, 59, 0);
    try { await window.Booking.list(from.toISOString(), to.toISOString()); } catch (_e) { void 0; }
    const now = Date.now();
    const out = [];
    for (let h = lo; h < hi && out.length < max; h++) {
      const s = new Date(base); s.setHours(h, 0, 0, 0);
      const e = new Date(s.getTime() + 60 * 60000);
      if (s.getTime() <= now) continue;
      if (window.Booking.hasConflict && window.Booking.hasConflict(s.toISOString(), e.toISOString())) continue;
      out.push(s);
    }
    return out;
  }

  function _bookingCard(customer, startDate, service, text) {
    const svc = service || '';
    const label = _fmtSlot(startDate);
    return {
      matched: true, kind: 'card',
      action: {
        kind: 'create_booking',
        payload: {
          customer_id: customer.id, customer_name: customer.name,
          service_name: svc || null, starts_at: startDate.toISOString(), duration_min: 60,
        },
        confirmation_text: `${customer.name}님 ${label}${svc ? ' ' + svc : ''} 예약 잡을까요?`,
        _source_question: text,
      },
      customer,
    };
  }

  // 고객 확정 후 시간 해석 → 카드 또는 빈시간 추천. (tryCreateBooking 에서 호출)
  async function _bookingForCustomer(customer, text) {
    return _composeBooking(customer, { dateBase: _resolveDateBase(text), time: _resolveTime(text), service: _extractService(text) }, text);
  }

  // [핫픽스F #5] 파싱된 슬롯(dateBase/time/service)으로 카드/빈시간 추천 빌드. booking-draft 의 누적 슬롯필링이 직접 호출.
  //   slots/message 결과에 customer·dateBase·needTime 을 담아, 호출측이 예약 draft 를 이어가게 한다.
  async function _composeBooking(customer, parts, source) {
    const dateBase = (parts && parts.dateBase) || null;
    const time = (parts && parts.time) || null;
    const service = (parts && parts.service) || '';
    if (dateBase && time && time.concrete) {
      const start = new Date(dateBase); start.setHours(time.hour, time.min || 0, 0, 0);
      const end = new Date(start.getTime() + 60 * 60000);
      if (window.Booking && window.Booking.hasConflict) {
        try {
          const f = new Date(dateBase); f.setHours(0, 0, 0, 0);
          const t = new Date(dateBase); t.setHours(23, 59, 59, 0);
          await window.Booking.list(f.toISOString(), t.toISOString());
        } catch (_e) { void 0; }
        if (window.Booking.hasConflict(start.toISOString(), end.toISOString())) {
          const alts = await _suggestSlots(dateBase, null, 3);
          const lines = alts.map((d) => '· ' + _fmtSlot(d));
          return { matched: true, kind: 'slots', customer, dateBase, needTime: true,
            text: `${_fmtSlot(start)} 에는 이미 예약이 있어요. 대신 비어 있는 시간이에요:\n${lines.join('\n') || '(이 날은 빈 시간이 없어요. 다른 날로 말씀해 주세요)'}` };
        }
      }
      _bumpStats('create_booking');
      return _bookingCard(customer, start, service, source);
    }
    // 시간 없음/모호 → 빈시간 추천
    const slots = await _suggestSlots(dateBase, time && time.period, 3);
    if (!slots.length) {
      return { matched: true, kind: 'message', customer, dateBase, needTime: true,
        text: `${customer.name}님 예약을 잡을 시간을 알려주세요. (예: "내일 오후 3시", "다음 주 토요일 2시")` };
    }
    const lines = slots.map((d) => '· ' + _fmtSlot(d));
    return { matched: true, kind: 'slots', customer, dateBase, needTime: true,
      text: `${customer.name}님 예약 가능 시간이에요. 원하시는 시간을 말씀해 주세요:\n${lines.join('\n')}` };
  }

  // [핫픽스F #5-1] 이름 한 개로 고객 1명 확정(정확 일치만). booking-draft 의 customer 슬롯 채우기에 사용.
  //   결과: { customer } | { askText } | { none } | { error }.
  async function resolveCustomer(name) {
    if (!name) return { none: true };
    let customers;
    try { const r = await _fetchJson('/customers?limit=500'); customers = (r && r.items) || []; }
    catch (_e) { void _e; return { error: true }; }
    const scored = customers.map((c) => ({ c, score: _nameMatches(name, c.name || '') }))
      .filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
    if (!scored.length) return { none: true };
    const picked = _decideCustomer(scored);
    if (picked.askText) return { askText: picked.askText, candidates: picked.candidates || [] };
    return { customer: { id: picked.customer.id, name: picked.customer.name } };
  }

  // ─── [T-110] 메시지 초안(draft_message) — 발송 아님, 초안만 ──────────────
  // [T-113] "리터치 안내 써줘" 처럼 명사가 '안내'뿐인 경우도 포함(draft 동사와 결합 시에만 발동).
  const _MSG_NOUN = /(문자|메시지|메세지|문구|안내문|안내|멘트|초안|dm|디엠)/i;
  const _MSG_VERB = /(써|써줘|작성|만들|짜|뽑|보내|발송|초안)/;
  const _MSG_STOPS = new Set(['문자', '메시지', '메세지', '문구', '안내문', '멘트', '초안', '안부', '리터치',
    '재방문', '감사', '안내', '예약', '방문', '생일', '디엠', '손님', '고객', '님', '이', '그', '저', '한테', '에게',
    '유도', '캡션', '홍보', '해시', '해시태그']);   // [B4] 카피/캡션 단어를 고객명으로 오추출 방지

  function _draftTone(t) {
    if (/리터치/.test(t)) return 'retouch_offer';
    if (/(첫\s*방문|첫방문)/.test(t)) return 'first_visit_thanks';
    if (/(감사|고마)/.test(t)) return 'vip_thanks';
    if (/(예약\s*안내|예약\s*확인|예약\s*리마인|방문\s*안내|예약\s*알림)/.test(t)) return 'confirm_reminder';
    if (/생일/.test(t)) return 'birthday';
    if (/(오래|뜸|이탈|안\s*오|안오신|안\s*오신|발길)/.test(t)) return 'we_miss_you';
    return 'warm_checkin'; // 안부/재방문/기본
  }

  // 이름이 아닌 단어(의도 명사 + 동사) — 이름 추출 전에 제거. "만들어줘"/"재방문" 등 오인 방지.
  const _MSG_NONAME = /(유도|캡션|홍보|해시\s*태그|해시|안부|리터치|재방문|방문\s*감사|감사|안내문|안내|예약|방문|생일|이탈|단골|문자|메시지|메세지|문구|멘트|초안|디엠|손님|고객|만들어\s*줘|만들어|만들|써\s*줘|써|작성해\s*줘|작성|짜\s*줘|짜|뽑아|뽑|보내\s*줘|보내|발송|해\s*줘|해주|보낼|줄)/g;

  function _extractMsgTarget(t) {
    // "{이름}님" 접미가 가장 강한 신호.
    const honor = t.match(/([가-힣]{2,4})님/);
    if (honor && !_MSG_STOPS.has(honor[1])) return honor[1];
    // 접미 없으면: 날짜·시간대·의도/동사 단어 제거 후 첫 한글 후보.
    let stripped = _stripDateTokens(t).replace(_PERIOD_WORDS, ' ').replace(_MSG_NONAME, ' ');
    const re = /([가-힣]{2,5})/g;
    let m;
    while ((m = re.exec(stripped)) !== null) {
      const w = m[1];
      if (_MSG_STOPS.has(w)) continue;
      let blocked = false;
      _MSG_STOPS.forEach((s) => { if (s.length >= 2 && w.includes(s)) blocked = true; });
      if (blocked) continue;
      return w;
    }
    return '';
  }

  // [T-113] 업종(shop_type) 라벨·카테고리.
  function _draftShopInfo() {
    try {
      const raw = localStorage.getItem('shop_type') || '';
      const norm = (typeof window.itdasyNormalizeShopType === 'function') ? window.itdasyNormalizeShopType(raw) : null;
      const cfg = (window.SHOP_CONFIG && window.SHOP_CONFIG[raw]) || null;
      return { label: (norm && norm.label) || raw || '', cat: (norm && norm.cat) || '', defaultService: cfg && cfg.defaultTag };
    } catch (_e) { return { label: '', cat: '', defaultService: '' }; }
  }

  // [T-113] 업종×목적별 CTA/문구 가이드 한 줄 (LLM 힌트용 — 그대로 복붙 아님).
  function _draftGuide(cat, tone) {
    const G = {
      nail:   { retouch_offer: '젤 유지 상태 확인 + 자연스러운 리터치/새 디자인 예약 유도', warm_checkin: '손끝 컨디션 가볍게 안부', we_miss_you: '오랜만 안부 + 부담 없는 재방문' },
      hair:   { retouch_offer: '머릿결·컬러·뿌리/붙임머리 연결부 관리 시기 안내', warm_checkin: '스타일 유지 상태 가볍게 안부', we_miss_you: '오랜만 안부 + 컬러/펌 리터치 제안' },
      lash:   { retouch_offer: '컬·연장 유지 상태 확인 + 리터치 주기 안내', warm_checkin: '눈가 컨디션 가볍게 안부', we_miss_you: '오랜만 안부 + 리터치 권유' },
      skin:   { retouch_offer: '지난 관리 후 피부 컨디션 체크 + 다음 관리 주기 안내', warm_checkin: '피부 컨디션 가볍게 안부', we_miss_you: '오랜만 안부 + 관리 재개 제안' },
      wax:    { retouch_offer: '재방문 주기 안내 + 피부 진정 관리 팁', warm_checkin: '가볍게 안부', we_miss_you: '오랜만 안부 + 재방문 제안' },
      makeup: { retouch_offer: '다음 행사/촬영 예약 안내', warm_checkin: '가볍게 안부', we_miss_you: '오랜만 안부' },
      scalp:  { retouch_offer: '두피 관리 주기 안내', warm_checkin: '두피 컨디션 안부', we_miss_you: '오랜만 안부' },
    };
    const byCat = G[cat] || {};
    return byCat[tone] || byCat.retouch_offer || '자연스러운 안부 + 부담 없는 재방문 유도';
  }

  // [T-113] 고객 갤러리 신호 — 최근 시술명 + 사진 수. (TreatmentLink 가 저장한 label 기준)
  //   recent: 의미있는 시술 라벨(없으면 ''), count: 이 고객의 사진 기록 수.
  async function _recentService(customerId) {
    try {
      if (typeof window.loadGalleryItemsByCustomer !== 'function') return { recent: '', count: 0 };
      const items = (await window.loadGalleryItemsByCustomer(customerId)) || [];
      const hit = items.find((it) => it && it.label && it.label !== '시술 사진');
      return { recent: hit ? String(hit.label).slice(0, 30) : '', count: items.length };
    } catch (_e) { return { recent: '', count: 0 }; }
  }

  // [T-113] body_md 힌트 + 카드용 컨텍스트 요약 생성. (≤200자, 안전 문구 원칙 포함)
  async function _buildDraftHint(customer, tone, purpose) {
    const shop = _draftShopInfo();
    const gal = await _recentService(customer.id);
    const recent = gal.recent;
    const guide = _draftGuide(shop.cat, tone);
    const svc = recent || shop.defaultService || '';
    const parts = [];
    if (shop.label) parts.push('업종:' + shop.label);
    if (svc) parts.push('최근시술:' + svc);
    parts.push('가이드:' + guide);
    parts.push('과장/의료/효과보장 표현 금지, 부담 없는 톤');
    const hint = parts.join('. ').slice(0, 200);
    const summary = [recent ? '최근 시술: ' + recent : null, shop.label ? '업종: ' + shop.label : null]
      .filter(Boolean).join(' / ');
    // [EG-1] 재료 전무 — 최근시술·사진·메모 모두 없으면 얇은 초안 대신 정직 안내로 단락.
    const noMaterial = !recent && gal.count === 0 && !customer.hasMemo;
    return { hint, summary, hasRecent: !!recent, noMaterial };
  }

  // 결과: {kind:'execute', action} | {kind:'message', text} | null(초안 의도 아님)
  async function tryDraftMessage(text, ctx) {
    if (_disabled()) return null;
    const t = _trim(text);
    // 예약 생성/취소 의도가 우선(충돌 방지)
    if (_CREATE_VERB.test(t) || _CANCEL_VERB.test(t)) return null;
    if (!_MSG_NOUN.test(t) || !_MSG_VERB.test(t)) return null;

    const tone = _draftTone(t);
    const purpose = t.slice(0, 120);

    // 고객 해석: 이름 → currentCustomer → 안내
    const name = _extractMsgTarget(t);
    let customer = null;
    if (name) {
      let customers;
      try { const r = await _fetchJson('/customers?limit=500'); customers = (r && r.items) || []; }
      catch (_e) { return { kind: 'message', text: '⚠️ 고객 정보 조회 실패. 잠시 후 다시.' }; }
      const scored = customers.map((c) => ({ c, score: _nameMatches(name, c.name || '') }))
        .filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
      if (!scored.length) {
        return { kind: 'message', text: `🔍 ${name}님을 못 찾았어요. 이름을 확인해 주시거나 고객 상세를 먼저 열어주세요.` };
      }
      // [A4] 정확 일치(100·단독)만 자동 확정. 유사/동명이인은 조용히 선택 금지 → 확인·후보 안내로 멈춤.
      const _picked = _decideCustomer(scored);
      if (_picked.askText) return { kind: 'message', text: _picked.askText };
      const rec = _picked.customer;
      customer = { id: rec.id, name: rec.name, hasMemo: !!(rec.memo || rec.notes || rec.note || rec.memo_md) };
    } else {
      const cur = ctx && ctx.currentCustomer;
      if (cur && cur.id != null) customer = { id: cur.id, name: cur.name || '고객', hasMemo: !!(cur.memo || cur.notes || cur.note) };
      else return { kind: 'message', text: '어느 고객에게 보낼 문구를 만들까요? 고객 이름을 알려주시거나 고객 상세를 먼저 열어주세요.' };
    }

    // [T-113] 업종+최근시술 기반 힌트로 body_md 보강(백엔드 무수정 — body_hint 로 LLM 에 주입).
    let hintInfo = { hint: purpose, summary: '', hasRecent: false, noMaterial: false };
    try { hintInfo = await _buildDraftHint(customer, tone, purpose); } catch (_e) { void 0; }

    // [EG-1] 이력·사진·메모 모두 부족 → 얇은 초안 대신 정직 안내(발송 0, 백엔드 호출 0).
    if (hintInfo.noMaterial) {
      return { kind: 'message', text: `${customer.name}님은 아직 리터치 초안을 만들 기록이 부족해요. 최근 시술 기록이나 사진을 먼저 남기면 더 자연스럽게 작성할 수 있어요. (실제 발송은 하지 않았어요)` };
    }

    _bumpStats('draft_message');
    return {
      kind: 'execute',
      hadSendWord: /(보내|발송)/.test(t),
      customer, tone,
      contextSummary: hintInfo.summary,
      hasRecent: hintInfo.hasRecent,
      action: {
        kind: 'draft_message',
        payload: { customer_id: customer.id, customer_name: customer.name, tone, body_md: hintInfo.hint || purpose },
        _source_question: text,
      },
    };
  }

  // ─── public API ─────────────────────────────────────────
  window.AssistantIntent = {
    classifyObvious,
    activeBookings,
    findAsyncRule,
    execAsyncRule,
    tryCreateBooking,
    tryLookupBooking,
    tryDraftMessage,
    tryCancelBooking,
    // [핫픽스F #5] 예약 draft 슬롯필링용 — 누적 슬롯(dateBase/time/service)으로 카드 빌드 + 고객/시간 파싱.
    composeBooking: _composeBooking,
    resolveCustomer,
    resolveDateBase: _resolveDateBase,
    resolveTime: _resolveTime,
    extractService: _extractService,
    // 디버깅용 — 현재 통계 조회
    getStats: () => ({ ...window[STATS_KEY], byType: { ...window[STATS_KEY].byType } }),
    // 디버깅용 — 통계 리셋
    resetStats: () => { window[STATS_KEY] = { hits: 0, total: 0, byType: {} }; },
  };
})();
