/* Home v4.1 render helpers */
(function () {
  'use strict';

  const COLORS = ['pink', 'blue', 'teal', 'purple', 'orange'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function cfg() {
    return window.HomeV41Config || {};
  }

  function todayKor() {
    const d = new Date();
    const w = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${w})`;
  }

  function shopName() {
    try { return localStorage.getItem('shop_name') || '사장님'; }
    catch (_e) { return '사장님'; }
  }

  function shopInitial(shop) {
    return ((shop || '사장님')[0] || '잇').toUpperCase();
  }

  function syncAvatar(container) {
    if (!container) return;
    const slot = container.querySelector('[data-hv-avatar]');
    if (!slot) return;
    const img = document.querySelector('#headerAvatar img');
    let src = img && img.src ? img.src : '';
    // [2026-06-07] #headerAvatar 가 아직 동기화 안 됐어도 연동된 IG 프사를 직접 폴백 → 홈 아바타에 프사 표시.
    if (!src) {
      try { src = localStorage.getItem('itdasy:ig_profile_pic') || ''; } catch (_e) { src = ''; }
    }
    const initialHTML = `<span class="hv-header__initial">${esc(shopInitial(shopName()))}</span>`;
    if (src) {
      // referrerpolicy: 인스타 CDN 403 방지. onerror: 만료/실패 시 깨진 이미지 대신 이니셜.
      // [2026-08-16] 이니셜 폴백 전에 공용 복구(app-core handleIgAvatarError) — 만료 캐시
      //   폐기 + /instagram/status 세션당 1회 재조회 → 새 URL 재시도. 로직 중복 구현 금지.
      slot.innerHTML = `<img src="${esc(src)}" alt="" class="hv-header__avatar-img" referrerpolicy="no-referrer">`;
      const av = slot.querySelector('img');
      if (av) av.onerror = function () {
        if (typeof window.handleIgAvatarError === 'function') window.handleIgAvatarError(this, slot, initialHTML);
        else slot.innerHTML = initialHTML;
      };
    } else {
      slot.innerHTML = initialHTML;
    }
  }

  // [2026-08-16] 미니그래픽 헬퍼(_sparkHtml·_dueBadge·_avatarStack·_slotStrip) 삭제 —
  //   실시간 분석 캐러셀이 잇비 카드로 흡수되면서 그래픽 붙일 자리가 없어짐.

  function cardRevenue(brief) {
    const total = Number(brief.this_month_total) || 0;
    const base = { ok: 0, cat: '이번달 매출', btn: '매출 보기', act: 'openRevenue' };
    if (total === 0) {
      return { ...base, dot: '#3B82F6', hl: '아직 이번달 매출이 없어요', desc: '첫 매출 기록해보기' };
    }
    // [매출감사 2026-08-04] 만원 미만이 '0만원' 으로 찍히던 것.
    //   Math.round(4999/10000) = 0 → "0만원". total===0 분기는 이미 지나왔으므로
    //   "아직 매출이 없어요" 도 아니고, 매출이 있는데 0원이라고 말하는 화면이 된다.
    //   첫 매출 3,000원을 기록한 CBT 첫날 원장님이 바로 보게 되는 숫자다.
    const won = total < 10000
      ? total.toLocaleString('ko-KR') + '원'
      : Math.round(total / 10000) + '만원';
    const mom = brief.mom_delta_pct;                 // 숫자 또는 null
    const p = (mom == null) ? null : Math.round(mom); // 정수 반올림 (BE는 소수1자리)
    const goal = Number(brief.monthly_goal) || 0;
    const hl = won + (p == null ? '' : ` · 전월대비 ${p >= 0 ? '+' : ''}${p}%`);
    const desc = (goal > 0 && goal - total > 0)
      ? `목표까지 ${Math.round((goal - total) / 10000)}만원 남았어요`
      : (goal > 0 ? '이번달 목표 달성!' : '요일별 매출 패턴 보기');
    const card = { ...base, dot: (p != null && p < 0) ? 'var(--danger)' : '#3B82F6', hl, desc };
    if (p != null && p < 0) card.alert = true;       // 마이너스일 때만 '확인 필요'에 포함

    // [2026-09-02] 잇비 표 줄 전용 — 스파크라인 + "지난달 이맘때" 비교 (목업 39 B안).
    //   hl/desc 는 건드리지 않는다. 그건 '전체 보기' 펼침 뷰가 쓰는 값이라,
    //   여기서 바꾸면 표 줄만 고치려다 펼침 뷰까지 같이 흔들린다.
    //   표 줄 금액은 축약 없이 천단위 콤마 — 만원 축약은 "4,231,000원"의 자릿수 감각을 지운다.
    card.rowVal = total.toLocaleString('ko-KR') + '원';
    const cum = Array.isArray(brief.month_daily_cumulative) ? brief.month_daily_cumulative : null;
    if (cum && cum.length >= 2) card.spark = cum;
    // 구버전 BE(필드 없음)거나 지난달 이맘때 매출이 0이면 비교 줄 자체를 안 만든다 —
    //   분모가 없는 비교는 "+전액 ↑" 같은 무의미한 문구가 된다.
    const prevSame = Number(brief.prev_month_same_day_total) || 0;
    if (prevSame > 0) {
      const diff = total - prevSame;
      card.cmp = { diff, up: diff >= 0 };
    }
    return card;
  }

  // [2026-09-02] 이번달 누적 배열 → 56×24 스파크라인 path.
  //   0~max 정규화, 좌→우. 값이 전부 같으면(=하루치뿐) 평평한 선이 되도록 max 를 1 로 깐다.
  function _monthSparkPath(cum) {
    const W = 56, H = 24, PAD = 2;
    const n = cum.length;
    const max = Math.max(...cum, 1);
    const pts = cum.map((v, i) => {
      const x = n === 1 ? W - PAD : PAD + (W - PAD * 2) * (i / (n - 1));
      const y = H - PAD - (H - PAD * 2) * (v / max);
      return `${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    return 'M' + pts.join(' L');
  }

  // [2026-07-05] 고객관리 — "안부" 프레임 폐기. 사실만: 올 차례였던 날이 지났다.
  function cardAtRisk(brief) {
    const raw = Array.isArray(brief.at_risk) ? brief.at_risk : [];
    if (!raw.length) return { ok: 1, cat: '고객관리', dot: '#10B981', okMsg: '다시 올 때 지난 손님 없어요' };
    const base = { ok: 0, cat: '고객관리', dot: 'var(--danger)', alert: true, btn: '고객 보기', act: 'openCustomers' };
    if (raw.length === 1) {
      const a = raw[0] || {};
      const name = a.name || '단골';
      const iv = Number(a.avg_interval_days) || 0;
      const cycle = iv >= 14 ? `${Math.round(iv / 7)}주` : (iv > 0 ? `${Math.round(iv)}일` : '');
      const m = String(a.next_expected || '').match(/^\d{4}-(\d{2})-(\d{2})/);
      const parts = [];
      if (cycle) parts.push(`보통 ${cycle}마다 방문`);
      if (m) parts.push(`${Number(m[1])}월 ${Number(m[2])}일쯤 올 차례였어요`);
      const desc = parts.join(' · ') || `${Math.round(Number(a.days_since_last) || 0)}일째 방문 없음`;
      return { ...base, hl: `${name}님, 다시 올 때가 지났어요`, desc };
    }
    const names = raw.map(a => (a && a.name) || '단골');
    const shown = names.slice(0, 3).join(' · ');
    return {
      ...base,
      hl: `다시 올 때가 지난 손님 ${raw.length}명`,
      desc: names.length > 3 ? `${shown} 외 ${names.length - 3}명` : shown,
    };
  }

  // [2026-07-05] 빈시간 문구 3분기 — []는 "꽉 참"이 아니라 셋 중 하나:
  //   ①진짜 빈 시간 없음 ②주간 창(오늘~일) 소진(일요일 저녁) ③계산 실패 → 단정 금지.
  function cardEmptySlots(brief) {
    const emptySlots = Array.isArray(brief.empty_slots) ? brief.empty_slots : [];
    if (!emptySlots.length) {
      const now = new Date();
      const weekClosing = now.getDay() === 0 && now.getHours() >= 17;
      return {
        ok: 1, cat: '이번주 빈 시간', dot: '#10B981',
        okMsg: weekClosing ? '이번주 마감 — 다음주 예약 받아보세요' : '이번주 빈 시간이 없어요',
      };
    }
    const fmt = s => s.type === 'fullday' ? `${s.day_label} 종일` : `${s.day_label} ${s.from}~${s.to}`;
    const n = emptySlots.length;
    const hl = emptySlots.slice(0, 2).map(fmt).join(' · ') + ' 비어요';
    const desc = n > 2 ? `외 ${n - 2}곳 더 · 예약 잡기 좋은 시간` : '예약 잡기 좋은 시간';
    // [2026-08-16] rowVal — 홈 잇비 카드 표 줄용 축약값 (한 줄 고정, "…비어요" 어절 깨짐 방지)
    const rowVal = fmt(emptySlots[0]) + (n > 1 ? ` 외 ${n - 1}곳` : '');
    return {
      ok: 0, cat: '이번주 빈 시간', dot: '#0891B2',
      hl, desc, rowVal,
      btn: '예약 잡기', act: 'openCalendar',
    };
  }

  // 회원권 — 데이터 없으면 null(조건부 노출). 잔액부족 우선, 없으면 만료임박.
  function cardMembership(brief) {
    const low = Number(brief.membership_low_balance) || 0;
    const exp = Number(brief.membership_expiring_30d) || 0;
    if (!low && !exp) return null;
    let hl;
    if (low > 0) {
      const name = brief.membership_low_first_name || '회원';
      hl = low === 1 ? `${name}님 회원권 잔액 얼마 안 남았어요` : `회원권 잔액 부족 ${low}명`;
    } else {
      const name = brief.membership_expiring_first_name || '회원';
      hl = exp === 1 ? `${name}님 회원권 곧 만료돼요` : `회원권 만료 임박 ${exp}건`;
    }
    return { ok: 0, cat: '회원권', dot: 'var(--brand,#D58A95)', hl, desc: '충전 안내 보낼 시점', btn: '안내 보내기', act: 'openMembership', alert: true };
  }

  // 리터치 — 데이터 없으면 null(조건부 노출).
  function cardRetouch(brief) {
    const n = Number(brief.retouch_due_count) || 0;
    if (!n) return null;
    const name = brief.retouch_due_first_name || '손님';
    const hl = n === 1 ? `${name}님 리터치 시기예요` : `${name}님 외 ${n - 1}명 리터치 때예요`;
    // [죽은동작 정리 2026-07-27] 버튼이 '안내 보내기'(발송 암시)인데 act 는 그냥 고객 허브만 연다(발송 플로우 없음).
    //   실동작에 맞춰 '고객 보기'로 정직화(리터치 대상 확인 후 원장이 직접 DM/문자).
    return { ok: 0, cat: '리터치 시기', dot: '#0D9488', hl, desc: '안내 보낼 타이밍이에요', btn: '고객 보기', act: 'openCustomers', alert: true };
  }

  function buildCarouselCards(brief) {
    const data = brief || {};
    // [2026-07-08] brief 요청 실패 — "없어요"로 단정하지 않고 재시도 카드 1장만.
    if (data._briefFailed) {
      return [{
        ok: 0, retry: 1, cat: '실시간 분석', dot: 'var(--danger)',
        hl: '분석을 불러오지 못했어요', desc: '연결이 잠시 불안정해요',
        btn: '다시 시도', act: 'retryBrief',
      }];
    }
    const cards = [
      cardRevenue(data),
      cardAtRisk(data),
      cardEmptySlots(data),
      cardMembership(data),
      cardRetouch(data),
    ].filter(Boolean);
    return cards.sort((a, b) => a.ok - b.ok);
  }

  function todayBookings(brief) {
    // [2026-06-10] ①취소·노쇼 제외 (BE 필터의 프론트 이중 방어 — 캘린더 기준과 통일)
    //   ②"오늘" 비교를 로컬 날짜로 — toISOString()은 UTC 라 KST 0~9시에 어제로 어긋남.
    const list = (brief && brief.today_bookings) || [];
    const n = new Date();
    const ymd = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    return list
      .filter(b => b.status !== 'cancelled' && b.status !== 'no_show')
      .filter(b => (b.starts_at || '').startsWith(ymd))
      .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
  }

  function statusLabel(s) {
    switch (s) {
      case 'completed': return '완료';
      case 'confirmed': return '확정';
      case 'cancelled': return '취소';
      case 'no_show': return '안 옴';
      default: return '';
    }
  }

  function hhmm(iso) {
    try {
      const d = new Date(iso);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch (_e) { return ''; }
  }

  function servicePrice(name) {
    const key = String(name || '').trim().toLowerCase();
    const cache = window._serviceTemplatesCache || [];
    if (!key || !cache.length) return 0;
    let hit = cache.find(t => String(t.name || '').trim().toLowerCase() === key);
    if (!hit) {
      hit = cache.find(t => {
        const n = String(t.name || '').trim().toLowerCase();
        return n && (key.includes(n) || n.includes(key));
      });
    }
    return Number(hit && hit.default_price) || 0;
  }

  function renderHeader(brief) {
    // [F1] 홈 상단 매출 표시 제거 — 잇비 분석 섹션으로 흡수
    const shop = shopName();
    return `<div class="hv5"><div class="hv5-hdr">
      <div class="av" data-hv-avatar aria-hidden="true">${esc(shopInitial(shop))}</div>
      <div class="meta">
        <div class="date">${esc(todayKor())}</div>
        <div class="shop">${esc(shop)}</div>
      </div>
      <button type="button" class="hv5-bell" data-hv-act="bell" aria-label="알림">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8C6 4.68629 8.68629 2 12 2C15.3137 2 18 4.68629 18 8C18 15 21 17 21 17H3C3 17 6 15 6 8Z"/><path d="M10 20C10.5 21 11.2 21.5 12 21.5C12.8 21.5 13.5 21 14 20"/></svg>
        <span id="dashBellBadge" class="hv5-bell-badge" style="display:none"></span>
      </button>
    </div>`;
  }

  function _fallbackBookings(brief) {
    let bk = Array.isArray(brief.today_bookings) ? brief.today_bookings : [];
    if (bk.length || !window.Booking || typeof window.Booking.list !== 'function') return bk;
    try {
      const all = window.Booking._items || [];
      const ymd = new Date().toISOString().slice(0, 10);
      bk = all.filter(b => b && (b.starts_at || '').slice(0, 10) === ymd);
    } catch (_e) { /* silent */ }
    return bk;
  }



  function _emptyStateMessage(brief) {
    const h = new Date().getHours();
    const todayCount = (brief && (brief.today_bookings_count || (Array.isArray(brief.today_bookings) && brief.today_bookings.length))) || 0;
    if (todayCount === 0) return '오늘은 여유 있는 하루네요. 갤러리 정리 어때요?';
    if (h >= 6 && h < 11)  return '좋은 아침이에요. 오늘 무엇을 도와드릴까요?';
    if (h >= 11 && h < 14) return '점심 시간이네요. 잠깐 쉬셨어요?';
    if (h >= 14 && h < 18) return '오늘 어떻게 흘러가고 있어요?';
    if (h >= 18 && h < 22) return '오늘 마무리 잘 하셨어요?';
    return '수고 많으셨어요. 푹 쉬세요';
  }

  // [2026-08-16] 실시간 분석 캐러셀 → 잇비 카드 흡수.
  //   헤더 상태줄(모두 정상/N건 확인 필요) + 확인 필요 항목 표 줄 + "나머지 N개 문제 없어요".
  function _analysisState(cards) {
    const list = Array.isArray(cards) ? cards : [];
    const retry = list.some(c => c.retry);
    const todo = list.filter(c => c.alert).length;
    const okCnt = list.filter(c => c.ok).length;
    const label = retry ? '연결 불안정' : (todo > 0 ? `${todo}건 확인 필요` : '모두 정상');
    return { retry, todo, okCnt, total: list.length, label };
  }

  function renderItbiCard(brief, cards) {
    const data = brief || {};
    const list = Array.isArray(cards) ? cards : [];
    const st = _analysisState(list);
    const lastMsg = (typeof data.assistant_last_message === 'string' && data.assistant_last_message.trim())
      ? data.assistant_last_message.trim()
      : '';
    const lastTime = (typeof data.assistant_last_time === 'string') ? data.assistant_last_time : '';
    const confirm = (data.assistant_confirm_action && typeof data.assistant_confirm_action === 'object')
      ? data.assistant_confirm_action : null;
    // [2026-08-16] 말풍선은 대화용만(confirm/마지막 대화/인사말). 분석 인사이트는 전부 표 줄로 —
    //   fit-content 말풍선에 문장을 넣으니 "비/어요" 어절이 깨져서 표(라벨+값) 형태로 교체.
    let msgHtml, isEmpty = false;
    if (confirm || lastMsg) {
      msgHtml = `<div class="hv5-itbi-msg-text">${esc(lastMsg || '')}</div>`;
    } else {
      isEmpty = true;
      msgHtml = `<div class="hv5-itbi-msg-text">${esc(_emptyStateMessage(data))}</div>`;
    }
    const actionsHtml = confirm
      ? `<div class="hv5-itbi-actions">
          <button type="button" class="hv5-itbi-action-btn is-primary" data-hv-act="${esc(confirm.confirmAct || 'openAssistant')}">${esc(confirm.confirmLabel || '네, 등록할게요')}</button>
          <button type="button" class="hv5-itbi-action-btn" data-hv-act="${esc(confirm.cancelAct || 'openAssistant')}">${esc(confirm.cancelLabel || '아니요')}</button>
        </div>`
      : '';
    const timeHtml = (lastMsg && lastTime) ? `<div class="hv5-itbi-msg-time">${esc(lastTime)}</div>` : '';
    // [2026-08-16] 확인 필요 항목 표 줄 — not-ok 카드 전부(매출·빈시간·고객·회원권·리터치·재시도)를
    //   같은 규격 행(라벨 + 값 + ›)으로. 값은 rowVal(짧은 축약) 우선, 없으면 hl 을 말줄임.
    // [2026-09-02] 매출 행만 두 줄(목업 39 B안) — 스파크라인 + "지난달 이맘때" 비교.
    //   is-rev 모디파이어로 스코프해서 다른 행(고객관리·빈 시간 등) 레이아웃은 그대로 둔다.
    const rowsHtml = list.filter(c => !c.ok).map(c => {
      const label = esc(c.cat || '');
      const val = esc(c.rowVal || c.hl || '');
      const act = esc(c.act || 'openAssistant');
      if (!c.spark && !c.cmp) {
        return `<button type="button" class="hv5-itbi-mini" data-hv-act="${act}">
          <span class="hv5-itbi-mini-label">${label}</span>
          <span class="hv5-itbi-mini-val">${val}</span>
          <span class="hv5-itbi-mini-arr">›</span>
        </button>`;
      }
      const sparkHtml = c.spark
        ? `<span class="hv5-itbi-spark" aria-hidden="true">
             <svg width="56" height="24" viewBox="0 0 56 24"><path d="${esc(_monthSparkPath(c.spark))}"/></svg>
             <span class="hv5-itbi-spark-tip"></span>
           </span>`
        : '';
      const cmpHtml = c.cmp
        ? `<span class="hv5-itbi-mini-sub${c.cmp.up ? '' : ' is-down'}">지난달 이맘때보다 ${
            c.cmp.up ? '+' : '−'}${Math.abs(c.cmp.diff).toLocaleString('ko-KR')}원 ${c.cmp.up ? '↑' : '↓'}</span>`
        : '';
      return `<button type="button" class="hv5-itbi-mini is-rev" data-hv-act="${act}">
          <span class="hv5-itbi-mini-line1">
            <span class="hv5-itbi-mini-label">${label}</span>
            <span class="hv5-itbi-mini-val">${val}</span>
            ${sparkHtml}
            <span class="hv5-itbi-mini-arr">›</span>
          </span>
          ${cmpHtml}
        </button>`;
    }).join('');
    // 나머지 정상 항목 요약 줄
    const restHtml = (!st.retry && st.okCnt > 0)
      ? `<button type="button" class="hv5-itbi-rest" data-hv-act="openAssistant">
          <span class="hv5-itbi-rest-check">✓</span>${st.okCnt === st.total ? `${st.okCnt}개 모두 문제 없어요` : `나머지 ${st.okCnt}개는 문제 없어요`}<span class="hv5-itbi-rest-arr">›</span>
        </button>`
      : '';
    // [2026-07-05] 저녁(19시~) 마감 리포트 유도 칩 — 하루 1번. seen 키는 closing-report.js run()이 기록.
    let closingHtml = '';
    try {
      const now = new Date();
      const ymd = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      if (now.getHours() >= 19 && !localStorage.getItem('itdasy:closing_report_seen::' + ymd)) {
        closingHtml = `<button type="button" class="hv5-itbi-closing" data-hv-act="itbiClosingReport">
          <svg width="15" height="15" aria-hidden="true"><use href="#ic-moon"/></svg>
          오늘 하루 마감 리포트 나왔어요<span class="hv5-itbi-closing-go">보기 ›</span>
        </button>`;
      }
    } catch (_e) { /* silent */ }
    // [2026-08-16] '전체 보기' = 분석 카드를 그 자리에서 펼쳐 보기 (인라인 토글, 화면 이동 X — 원영 지시.
    //   브리핑 채팅으로 보내던 동작은 대체·삭제). ok 카드는 okMsg, 확인 필요 카드는 hl+desc+액션 버튼.
    const detailHtml = `<div class="hv5-itbi-detail">${list.map(c => `<div class="hv5-itbi-dcard">
          <div class="hv5-itbi-dcard-cat"><span class="hv5-itbi-dcard-dot" style="background:${esc(c.dot || '#B0B8C1')}"></span>${esc(c.cat || '')}</div>
          <div class="hv5-itbi-dcard-hl">${esc(c.ok ? (c.okMsg || '문제 없어요') : (c.hl || ''))}</div>
          ${(!c.ok && c.desc) ? `<div class="hv5-itbi-dcard-desc">${esc(c.desc)}</div>` : ''}
          ${(!c.ok && c.btn) ? `<button type="button" class="hv5-itbi-dcard-btn" data-hv-act="${esc(c.act || '')}">${esc(c.btn)} ›</button>` : ''}
        </div>`).join('')}</div>`;
    const statusHtml = st.retry
      ? `<div class="hv5-itbi-status is-warn"><span class="hv5-itbi-status-dot"></span>실시간 분석 · <b>연결 불안정</b></div>`
      : (st.todo > 0
        ? `<div class="hv5-itbi-status is-warn"><span class="hv5-itbi-status-dot"></span>실시간 분석 · <b>${st.todo}건 확인 필요</b></div>`
        : `<div class="hv5-itbi-status"><span class="hv5-itbi-status-dot"></span>실시간 분석 · 모두 정상</div>`);
    return `<section class="hv5-itbi-card">
      <div class="hv5-itbi-head">
        <div class="hv5-itbi-head-l">
          <span class="hv5-itbi-avatar"><svg width="18" height="18" aria-hidden="true"><use href="#ic-bot"/></svg></span>
          <div class="hv5-itbi-head-text">
            <div class="hv5-itbi-name-row"><strong class="hv5-itbi-name">AI 잇비</strong><span class="hv5-itbi-beta">베타</span></div>
            ${statusHtml}
          </div>
        </div>
        <button type="button" class="hv5-itbi-all" data-hv-act="itbiToggleDetail">전체 보기 ›</button>
      </div>
      <div class="hv5-itbi-msg${isEmpty ? ' is-empty' : ''}">
        <span class="hv5-itbi-msg-avatar"><svg width="16" height="16" aria-hidden="true"><use href="#ic-bot"/></svg></span>
        <div class="hv5-itbi-msg-body">
          ${msgHtml}
          ${actionsHtml}
          ${timeHtml}
        </div>
      </div>
      ${rowsHtml}
      ${restHtml}
      ${detailHtml}
      ${closingHtml}
      <div class="hv5-itbi-input">
        <button type="button" class="hv5-itbi-input-icon" data-itbi-act="photo" aria-label="사진 첨부"><svg width="18" height="18" aria-hidden="true"><use href="#ic-camera"/></svg></button>
        <input type="text" class="hv5-itbi-input-field" placeholder="잇비에게 무엇이든 물어보세요" data-itbi-input />
        <button type="button" class="hv5-itbi-swap" data-itbi-act="swap" aria-label="음성 입력">
          <svg class="hv5-sw-mic" width="16" height="16" aria-hidden="true"><use href="#ic-mic"/></svg>
          <svg class="hv5-sw-send" width="15" height="15" aria-hidden="true"><use href="#ic-send"/></svg>
        </button>
        <input type="file" accept="image/*" data-itbi-file style="display:none;" />
      </div>
    </section>`;
  }

  function overdueAlertContext(brief) {
    const pending = Array.isArray(brief && brief.overdue_bookings) ? brief.overdue_bookings.slice() : [];
    pending.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    if (!pending.length) return clearOverdue();
    const top = pending[0];
    window._homePendingTopId = top.id;
    window._homePendingTopBooking = top;
    const name = (top.customer_name || '').trim() ? `${top.customer_name.trim()}님` : '손님';
    const desc = [name, overdueDate(top.starts_at)].filter(Boolean).join(' · ');
    return { count: pending.length, desc: pending.length > 1 ? `${desc} · 외 ${pending.length - 1}건` : desc };
  }

  function clearOverdue() {
    try { delete window._homePendingTopId; } catch (_e) { /* ignore */ }
    try { delete window._homePendingTopBooking; } catch (_e) { /* ignore */ }
    return null;
  }

  function overdueDate(value) {
    try {
      const d = new Date(value);
      if (!Number.isFinite(d.getTime())) return '';
      const dow = '일월화수목금토'.charAt(d.getDay());
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${d.getMonth() + 1}/${d.getDate()}(${dow}) ${hh}:${mm}`;
    } catch (_e) { return ''; }
  }

  function alertItems(brief, dmQueueCount) {
    const items = [];
    // [F1] 홈 "답장 N건 써뒀어요" 항목 — 실시간 DM 카드와 중복 → 제거
    // [2026-07-20 v785] 답 안 한 댓글 문의 — DM과 달리 홈에 다른 노출이 없어 중복 아님.
    //   공개 방치라 오히려 DM보다 급함. 탭 → 댓글 응대 큐.
    const cq = Number(brief && brief._commentQueueCount) || 0;
    if (cq > 0) items.push({ tone: 'pink', title: '답 안 한 댓글 문의', desc: '잇비가 답장 써뒀어요 — 확인만 하면 발송', count: cq, act: 'openCommentQueue' });
    const overdue = overdueAlertContext(brief);
    if (overdue) items.push({ tone: 'pink', title: '미완료 예약 찾았어요', desc: overdue.desc, count: overdue.count, act: 'completePending' });
    setOverdueCache(brief, Boolean(overdue));
    return items;
  }

  function setOverdueCache(brief, hasOverdue) {
    try {
      window._overdueBookings = hasOverdue && Array.isArray(brief && brief.overdue_bookings)
        ? brief.overdue_bookings.slice()
        : [];
    } catch (_e) { /* ignore */ }
  }

  function renderAlerts(brief, dmQueueCount) {
    const items = alertItems(brief, dmQueueCount);
    if (!items.length) return '';
    const total = items.reduce((s, it) => s + it.count, 0);
    return `<div class="hv5-card">
      <div class="hv5-card-h">
        <div class="hv5-card-title">AI 잇비가 챙겼어요</div>
        <span style="font-size:11px;color:#BC6675;font-weight:700">${total}건</span>
      </div>
      <div class="hv5-noti-list">${items.map(renderAlertItem).join('')}</div>
    </div>`;
  }

  function renderAlertItem(it) {
    return `<button type="button" class="hv5-noti" data-hv-act="${esc(it.act)}">
      <div class="hv5-noti-dot ${it.tone}"></div>
      <div class="hv5-noti-body">
        <div class="hv5-noti-title">${esc(it.title)}</div>
        <div class="hv5-noti-desc">${esc(it.desc)}</div>
      </div>
      <div class="hv5-noti-count">${it.count}건</div>
      <div class="hv5-noti-arrow" aria-hidden="true">›</div>
    </button>`;
  }

  // [2026-08-31] "+N건 더 보기"가 data-hv-act="openCalendar" 라, 누르면 캘린더로 화면이 통째로
  //   넘어갔다(오늘 5건이면 홈에서 5번째 예약을 영영 못 봄). "화면 이동 금지" 원칙 정면 위반이라
  //   제자리 인라인 펼침으로 교체한다.
  //   - 슬롯은 이제 전부 렌더하고, 최대 노출 개수 초과분에만 .is-extra 를 달아 CSS 로 숨긴다
  //     (기존 slice 제거). 그래야 펼칠 때 DOM 을 새로 만들 필요가 없고, data-hv-slot 인덱스도
  //     todayBookings() 원본 배열과 그대로 맞아 슬롯 클릭 바인딩이 전부 유효하다.
  //   - 펼침 상태는 .hv5-slots 의 클래스로만 산다 → localStorage 저장 X. 홈이 다시 그려지면
  //     자동으로 접힘(내일 예약 1건인데 펼쳐진 채 남는 사고 방지).
  function renderBooking(brief) {
    const all = todayBookings(brief);
    const empty = cfg().BOOKING_EMPTY_DISPLAY || 'hide';
    if (!all.length) return empty === 'hide' ? '' : bookingEmptyHtml();
    const max = cfg().BOOKING_SLOTS_MAX || 5;
    const now = Date.now();
    const idxNext = all.findIndex(b => Number.isFinite(Date.parse(b.starts_at || '')) && Date.parse(b.starts_at || '') >= now);
    const slotsHtml = all.map((b, i) => renderBookingSlot(b, i, idxNext, i >= max)).join('');
    const more = all.length - max;
    const moreRow = more > 0 ? `<button type="button" class="hv5-s-more" data-hv-act="toggleBookings" data-hv-more="${more}" aria-expanded="false">
        <span class="hv5-s-more-t">+${more}건 더 보기</span>
        <svg class="hv5-s-more-ic" width="14" height="14" aria-hidden="true"><use href="#ic-chevron-down"/></svg>
      </button>` : '';
    return `<div class="hv5-card">
      <div class="hv5-card-h">
        <div class="hv5-card-title">오늘의 예약 ${all.length}건</div>
        <button type="button" class="hv5-card-link" data-hv-act="openCalendar">캘린더 →</button>
      </div>
      <div class="hv5-slots">${slotsHtml}${moreRow}</div>
    </div>`;
  }

  // [2026-08-31] 오늘의 예약 펼침/접기 — 홈 전체 재렌더가 아니라 이 카드의 DOM 만 만진다.
  //   HomeV41.render() 를 다시 태우면 스크롤이 맨 위로 튀고 brief 재조립 비용도 든다.
  //   여기선 클래스 토글 + 라벨 텍스트 교체만 → 스크롤 위치 그대로. (app-home-v41.js _bindEvents 에서 호출)
  function toggleBookings(btn) {
    const list = btn && btn.closest ? btn.closest('.hv5-slots') : null;
    if (!list) return;
    const open = list.classList.toggle('is-open');
    const label = btn.querySelector('.hv5-s-more-t');
    if (label) label.textContent = open ? '접기' : `+${btn.dataset.hvMore || ''}건 더 보기`;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function bookingEmptyHtml() {
    return `<div class="hv5-card">
      <div class="hv5-card-h">
        <div class="hv5-card-title">오늘의 예약</div>
        <button type="button" class="hv5-card-link" data-hv-act="openCalendar">캘린더 →</button>
      </div>
      <button type="button" class="hv5-bk-empty" data-hv-act="openCalendar">오늘 예약 없음</button>
    </div>`;
  }

  function renderBookingSlot(b, i, idxNext, isExtra) {
    const status = statusLabel(b.status);
    const badge = status ? `<span class="hv5-s-badge ${statusClass(b.status)}">${status}</span>` : '';
    const amount = bookingAmount(b);
    return `<button type="button" class="hv5-slot${i === idxNext ? ' now' : ''}${isExtra ? ' is-extra' : ''} hv5-slot-${COLORS[i % 5]}" data-hv-slot="${i}" data-hv-time="${esc(b.starts_at || '')}">
      <span class="hv5-s-time">${esc(hhmm(b.starts_at))}</span>
      <span class="hv5-s-bar" aria-hidden="true"></span>
      <span class="hv5-s-info">
        <span class="hv5-s-name">${esc(b.customer_name || b.name || '')}</span>
        ${b.service_name ? `<span class="hv5-s-svc">${esc(b.service_name)}</span>` : ''}
        ${amount ? `<span class="hv5-s-amt">${amount}</span>` : ''}
      </span>
      ${badge}
    </button>`;
  }

  function statusClass(status) {
    if (status === 'completed') return 'done';
    if (status === 'cancelled' || status === 'no_show') return 'cncl';
    return 'conf';
  }

  function bookingAmount(b) {
    let amount = Number(b.amount) || 0;
    if (!amount && b.service_name) amount = servicePrice(b.service_name);
    const rounded = amount > 0 ? Math.round(amount / 1000) * 1000 : 0;
    return rounded > 0 ? rounded.toLocaleString('ko-KR') + '원' : '';
  }

  function ensureStyles() {
    if (document.getElementById('hv5Styles')) return;
    const s = document.createElement('style');
    s.id = 'hv5Styles';
    s.textContent = window.HomeV41StylesV5 || '';
    document.head.appendChild(s);
  }

  function middleRow(bookingHtml, alertsHtml) {
    if (bookingHtml && alertsHtml) {
      return `<div class="hv5-row"><div class="hv5-col-7">${bookingHtml}</div><div class="hv5-col-5">${alertsHtml}</div></div>`;
    }
    if (bookingHtml) return `<div class="hv5-row"><div style="grid-column:span 12">${bookingHtml}</div></div>`;
    if (alertsHtml) return `<div class="hv5-row"><div style="grid-column:span 12">${alertsHtml}</div></div>`;
    return '';
  }

  // [2026-06-07] 고객 메시지 카드 줄 — 빈 컨테이너만 렌더. 데이터는 app-home-customer-msgs.js 가
  //   기존 /conversations 폴링으로 채움 (추가 비용 0). 카드 없으면 hidden 유지.
  function renderCustomerMsgs() {
    return `<section class="hv5-cmsg" id="hv5Cmsg" hidden aria-label="고객 메시지">
      <div class="hv5-cmsg-head">
        <span class="hv5-cmsg-title">고객 메시지</span>
        <span class="hv5-cmsg-count" id="hv5CmsgCount"></span>
        <!-- [2026-08-12] ↻ 글자 → lucide SVG — 글자 화살표가 너무 얇아 돌아가는 게 안 보였다 -->
        <button type="button" class="hv5-cmsg-refresh" id="hv5CmsgRefresh" aria-label="새로고침" title="새로고침">
          <svg class="hv5-cmsg-refresh-ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
        </button>
        <button type="button" class="hv5-cmsg-more" id="hv5CmsgMore">전체 보기 ›</button>
      </div>
      <div class="hv5-cmsg-row" id="hv5CmsgRow"></div>
    </section>`;
  }

  function compose(brief, dmQueueCount) {
    ensureStyles();
    const cards = buildCarouselCards(brief);
    const bookingHtml = renderBooking(brief);
    const alertsHtml = renderAlerts(brief, dmQueueCount || 0);
    // [2026-08-16] 홈 순서: 오늘의 예약 → 고객 메시지 → AI 잇비(챗봇+실시간 분석 통합).
    //   renderHeader 가 연 <div class="hv5"> 는 여기서 닫는다 (구 renderAiRecs 가 닫던 것).
    return [
      renderHeader(brief),
      middleRow(bookingHtml, alertsHtml),  // 오늘의 예약 (+ 알림)
      renderCustomerMsgs(),                // 고객 메시지
      renderItbiCard(brief, cards),        // AI 잇비 (챗봇 + 실시간 분석)
      '</div>',
    ].join('');
  }

  window.HomeV41Render = { compose, syncAvatar, todayBookings, toggleBookings };
})();
