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
      slot.innerHTML = `<img src="${esc(src)}" alt="" class="hv-header__avatar-img" referrerpolicy="no-referrer">`;
      const av = slot.querySelector('img');
      if (av) av.onerror = function () { slot.innerHTML = initialHTML; };
    } else {
      slot.innerHTML = initialHTML;
    }
  }

  // ── [2026-07-05] 미니그래픽 헬퍼 — 카드 오른쪽 끝에 붙는 시각 요소 ──
  function _sparkHtml(week) {
    if (!Array.isArray(week) || week.length !== 7) return '';
    const vals = week.map(v => Number(v) || 0);
    const max = Math.max.apply(null, vals);
    if (max <= 0) return '';
    const bars = vals.map((v, i) => {
      const h = Math.max(4, Math.round(v / max * 30));
      return `<i style="height:${h}px"${i === 6 ? ' class="on"' : ''}></i>`;
    }).join('');
    return `<div class="hv5-ai-graph"><div class="hv5-ai-spark">${bars}</div><span class="hv5-ai-gcap">최근 7일</span></div>`;
  }

  function _dueBadge(md) {
    if (!md) return '';
    return `<div class="hv5-ai-graph"><div class="hv5-ai-badge"><span class="l">예정일</span><span class="v">${esc(md)}</span></div></div>`;
  }

  function _avatarStack(names) {
    const PAL = [['#FBEAF0', '#993556'], ['#FAEEDA', '#854F0B'], ['#E6F1FB', '#185FA5']];
    const spans = names.slice(0, 3).map((n, i) => {
      const p = PAL[i % 3];
      return `<span class="hv5-ai-av" style="background:${p[0]};color:${p[1]}">${esc(String(n || '').charAt(0))}</span>`;
    }).join('');
    return `<div class="hv5-ai-graph"><div class="hv5-ai-avs">${spans}</div></div>`;
  }

  // 빈시간 스트립 — 오늘~일요일, 요일당 막대 1개. full=종일 빔, am/pm=반 채움.
  function _slotStrip(slots) {
    try {
      const byDate = {};
      slots.forEach(s => {
        if (!s || !s.date) return;
        const cur = byDate[s.date];
        if (s.type === 'fullday') { byDate[s.date] = 'full'; return; }
        if (cur === 'full') return;
        const h = parseInt(String(s.from || '').split(':')[0], 10);
        const half = (Number.isFinite(h) && h < 12) ? 'am' : 'pm';
        byDate[s.date] = (cur && cur !== half) ? 'full' : (cur || half);
      });
      const now = new Date();
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
        const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        days.push(ymd);
        if (d.getDay() === 0) break;       // 일요일까지
      }
      if (days.length < 2) return '';
      const bars = days.map(ymd => `<i class="${byDate[ymd] || ''}"></i>`).join('');
      return `<div class="hv5-ai-graph"><div class="hv5-ai-strip">${bars}</div><span class="hv5-ai-gcap">오늘~일</span></div>`;
    } catch (_e) { return ''; }
  }

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
    const card = { ...base, dot: (p != null && p < 0) ? 'var(--danger)' : '#3B82F6', hl, desc, graph: _sparkHtml(brief.week_revenue) };
    if (p != null && p < 0) card.alert = true;       // 마이너스일 때만 '확인 필요'에 포함
    return card;
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
      return { ...base, hl: `${name}님, 다시 올 때가 지났어요`, desc, graph: m ? _dueBadge(`${Number(m[1])}/${Number(m[2])}`) : '' };
    }
    const names = raw.map(a => (a && a.name) || '단골');
    const shown = names.slice(0, 3).join(' · ');
    return {
      ...base,
      hl: `다시 올 때가 지난 손님 ${raw.length}명`,
      desc: names.length > 3 ? `${shown} 외 ${names.length - 3}명` : shown,
      graph: _avatarStack(names),
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
    const hl = emptySlots.slice(0, 2).map(fmt).join(' · ') + ' 비어요';
    const n = emptySlots.length;
    const desc = n > 2 ? `외 ${n - 2}곳 더 · 예약 잡기 좋은 시간` : '예약 잡기 좋은 시간';
    return {
      ok: 0, cat: '이번주 빈 시간', dot: '#0891B2',
      hl, desc,
      btn: '예약 잡기', act: 'openCalendar',
      graph: _slotStrip(emptySlots),
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

  function renderItbiCard(brief) {
    const data = brief || {};
    const lastMsg = (typeof data.assistant_last_message === 'string' && data.assistant_last_message.trim())
      ? data.assistant_last_message.trim()
      : '';
    const lastTime = (typeof data.assistant_last_time === 'string') ? data.assistant_last_time : '';
    const isEmpty = !lastMsg;
    const msgHtml = isEmpty
      ? esc(_emptyStateMessage(data))
      : esc(lastMsg);
    const confirm = (data.assistant_confirm_action && typeof data.assistant_confirm_action === 'object')
      ? data.assistant_confirm_action : null;
    const actionsHtml = confirm
      ? `<div class="hv5-itbi-actions">
          <button type="button" class="hv5-itbi-action-btn is-primary" data-hv-act="${esc(confirm.confirmAct || 'openAssistant')}">${esc(confirm.confirmLabel || '네, 등록할게요')}</button>
          <button type="button" class="hv5-itbi-action-btn" data-hv-act="${esc(confirm.cancelAct || 'openAssistant')}">${esc(confirm.cancelLabel || '아니요')}</button>
        </div>`
      : '';
    const timeHtml = lastTime ? `<div class="hv5-itbi-msg-time">${esc(lastTime)}</div>` : '';
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
    return `<section class="hv5-itbi-card">
      <div class="hv5-itbi-head">
        <div class="hv5-itbi-head-l">
          <span class="hv5-itbi-avatar"><svg width="18" height="18" aria-hidden="true"><use href="#ic-bot"/></svg></span>
          <div class="hv5-itbi-head-text">
            <div class="hv5-itbi-name-row"><strong class="hv5-itbi-name">AI 잇비</strong><span class="hv5-itbi-beta">베타</span></div>
            <div class="hv5-itbi-status"><span class="hv5-itbi-status-dot"></span>원장님 기다리는 중</div>
          </div>
        </div>
        <button type="button" class="hv5-itbi-all" data-hv-act="openAssistant">전체 보기 ›</button>
      </div>
      <div class="hv5-itbi-msg${isEmpty ? ' is-empty' : ''}">
        <span class="hv5-itbi-msg-avatar"><svg width="16" height="16" aria-hidden="true"><use href="#ic-bot"/></svg></span>
        <div class="hv5-itbi-msg-body">
          <div class="hv5-itbi-msg-text">${msgHtml}</div>
          ${actionsHtml}
          ${timeHtml}
        </div>
      </div>
      ${closingHtml}
      <div class="hv5-itbi-input">
        <button type="button" class="hv5-itbi-input-icon" data-itbi-act="photo" aria-label="사진 첨부"><svg width="18" height="18" aria-hidden="true"><use href="#ic-camera"/></svg></button>
        <input type="text" class="hv5-itbi-input-field" placeholder="잇비에게 무엇이든 물어보세요" data-itbi-input />
        <button type="button" class="hv5-itbi-input-icon" data-itbi-act="voice" aria-label="음성 입력"><svg width="16" height="16" aria-hidden="true"><use href="#ic-mic"/></svg></button>
        <button type="button" class="hv5-itbi-send" data-itbi-act="send" aria-label="보내기"><svg width="14" height="14" aria-hidden="true"><use href="#ic-send"/></svg></button>
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

  function renderBooking(brief) {
    const all = todayBookings(brief);
    const empty = cfg().BOOKING_EMPTY_DISPLAY || 'hide';
    if (!all.length) return empty === 'hide' ? '' : bookingEmptyHtml();
    const max = cfg().BOOKING_SLOTS_MAX || 5;
    const now = Date.now();
    const idxNext = all.findIndex(b => Number.isFinite(Date.parse(b.starts_at || '')) && Date.parse(b.starts_at || '') >= now);
    const visible = all.slice(0, max);
    const slotsHtml = visible.map((b, i) => renderBookingSlot(b, i, idxNext)).join('');
    const more = all.length - visible.length;
    const moreRow = more > 0 ? `<button type="button" class="hv5-s-more" data-hv-act="openCalendar">+${more}건 더 보기</button>` : '';
    return `<div class="hv5-card">
      <div class="hv5-card-h">
        <div class="hv5-card-title">오늘의 예약 ${all.length}건</div>
        <button type="button" class="hv5-card-link" data-hv-act="openCalendar">캘린더 →</button>
      </div>
      <div class="hv5-slots">${slotsHtml}${moreRow}</div>
    </div>`;
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

  function renderBookingSlot(b, i, idxNext) {
    const status = statusLabel(b.status);
    const badge = status ? `<span class="hv5-s-badge ${statusClass(b.status)}">${status}</span>` : '';
    const amount = bookingAmount(b);
    return `<button type="button" class="hv5-slot${i === idxNext ? ' now' : ''} hv5-slot-${COLORS[i % 5]}" data-hv-slot="${i}" data-hv-time="${esc(b.starts_at || '')}">
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

  function renderAiRecs(cards) {
    if (!cards || !cards.length) return '</div>';
    const total = cards.length;
    const todoCnt = cards.filter(c => c.alert).length;
    const okCnt = cards.filter(c => c.ok).length;
    const cardHtml = cards.map(renderAiCard).join('');
    const navHtml = renderAiNav(total);
    // [2026-07-05] 모바일: 정상 카드는 접고 요약 한 줄 (PC는 CSS로 미노출, 카드 그대로)
    const okRow = okCnt > 0
      ? `<button type="button" class="hv5-ai-okrow" data-hv-ok-toggle>
          <span class="hv5-ai-okrow-check">✓</span>${okCnt === total ? `${okCnt}개 모두 문제 없어요` : `나머지 ${okCnt}개는 문제 없어요`}<span class="hv5-ai-okrow-arr">›</span>
        </button>`
      : '';
    return `<div class="hv5-ai">
      <div class="hv5-ai-label">
        <span class="hv5-ai-pulse" aria-hidden="true"></span>
        <span class="hv5-ai-label-t"><b>AI 잇비</b> 실시간 분석</span>
        <span class="hv5-ai-label-count">${cards.some(c => c.retry) ? '연결 불안정' : (todoCnt > 0 ? todoCnt + '건 확인 필요' : '모두 정상')}</span>
      </div>
      <div class="hv5-ai-track" id="hv5AiTrack">${cardHtml}</div>
      ${okRow}
      ${navHtml}
    </div></div>`;
  }

  function renderAiCard(c) {
    if (c.ok) {
      return `<div class="hv5-ai-card hv5-ai-card-page ok hv5-ai-okhide" data-ok="1">
        <div class="hv5-ai-tag"><div class="hv5-ai-dot" style="background:${esc(c.dot || '#10B981')}"></div><div class="hv5-ai-tag-t">${esc(c.cat || '')}</div><span class="hv5-ai-check">✓</span></div>
        <div class="hv5-ai-ok-msg">${esc(c.okMsg || '')}</div>
      </div>`;
    }
    const g = c.graph || '';
    return `<div class="hv5-ai-card hv5-ai-card-page${g ? ' has-graph' : ''}" data-ok="0" data-hv-act="${esc(c.act || '')}" role="button" tabindex="0">
      <div class="hv5-ai-tag"><div class="hv5-ai-dot" style="background:${esc(c.dot || '#BC6675')}"></div><div class="hv5-ai-tag-t">${esc(c.cat || '')}</div></div>
      <div class="hv5-ai-hl">${esc(c.hl || '')}</div>
      <div class="hv5-ai-desc">${esc(c.desc || '')}</div>
      <button type="button" class="hv5-ai-btn" data-hv-act="${esc(c.act || '')}">${esc(c.btn || '확인')} ›</button>
      ${g}
    </div>`;
  }

  function renderAiNav(total) {
    const isMobile = window.matchMedia('(max-width: 540px)').matches;
    const pages = Math.max(1, Math.ceil(total / (isMobile ? 1 : 3)));
    if (pages <= 1) return '';
    const dots = Array.from({ length: pages }, (_, i) =>
      `<button type="button" class="hv5-ai-dot-nav${i === 0 ? ' on' : ''}" data-hv-ai-page="${i}" aria-label="페이지 ${i + 1}"></button>`
    ).join('');
    return `<div class="hv5-ai-nav">
      <button type="button" class="hv5-ai-nav-btn" id="hv5AiPrev" disabled aria-label="이전">‹</button>
      <div class="hv5-ai-dots" id="hv5AiDots">${dots}</div>
      <button type="button" class="hv5-ai-nav-btn" id="hv5AiNext" aria-label="다음">›</button>
    </div>`;
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
        <button type="button" class="hv5-cmsg-refresh" id="hv5CmsgRefresh" aria-label="새로고침" title="새로고침">↻</button>
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
    // [2026-06-08 F4] 홈 순서: 오늘의 예약 → 고객 메시지 → AI 잇비(챗봇) → AI 잇비 실시간 분석
    return [
      renderHeader(brief),
      middleRow(bookingHtml, alertsHtml),  // 오늘의 예약 (+ 알림)
      renderCustomerMsgs(),                // 고객 메시지
      renderItbiCard(brief),               // AI 잇비 (챗봇)
      renderAiRecs(cards),                 // AI 잇비 실시간 분석
    ].join('');
  }

  window.HomeV41Render = { compose, syncAvatar, todayBookings };
})();
