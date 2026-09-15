/* 잇비 예약 문맥 기억
   - "내일 예약"으로 보여준 1건을 "그거 취소해"로 이어서 처리
   - 방금 취소한 예약을 "복구해/되돌리기"로 되살림 */
(function () {
  'use strict';

  const TTL_MS = 10 * 60 * 1000;
  const S = { lastList: null, lastTarget: null, lastCancelled: null, lastCreated: null, pendingReschedule: null };

  function _trim(s) { return String(s == null ? '' : s).trim(); }
  function _fresh(x) { return x && Date.now() - (x.ts || 0) < TTL_MS; }
  function _active(b) { return b && !['cancelled', 'completed', 'no_show'].includes(b.status); }
  function _name(b) { return _trim((b && (b.customer_name || b.name)) || '고객'); }
  function _customerCtx() { return window.ItdasyCustomerContext || null; }

  function _rememberCustomerFromBooking(b) {
    try {
      const C = _customerCtx();
      if (C && typeof C.remember === 'function' && b) {
        C.remember({ id: b.customer_id != null ? b.customer_id : b.id, name: b.customer_name || b.name || '' }, 'booking');
      }
    } catch (_e) { void _e; }
  }

  function _rememberTarget(b) {
    if (!b || !b.id) return;
    S.lastTarget = { ts: Date.now(), booking: b };
    _rememberCustomerFromBooking(b);
  }

  function _lastTarget() {
    return _fresh(S.lastTarget) && S.lastTarget.booking ? S.lastTarget.booking : null;
  }

  // [핫픽스D #8] 사람이 읽는 한글 일시 — ISO/"MM/DD HH:mm" 노출 금지. 공용 포맷터 우선.
  function _fmt(b) {
    try {
      if (!b || !b.starts_at) return '';
      if (typeof window.fmtKDateTime === 'function') return window.fmtKDateTime(b.starts_at);
      const d = new Date(b.starts_at);
      const ap = d.getHours() < 12 ? '오전' : '오후';
      const h12 = (d.getHours() % 12) === 0 ? 12 : (d.getHours() % 12);
      return `${d.getMonth() + 1}월 ${d.getDate()}일 ${ap} ${h12}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch (_e) { return ''; }
  }

  function _dayRange(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
    const e = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
    return { from: s.toISOString(), to: e.toISOString() };
  }

  function _dateHint(q) {
    const t = _trim(q);
    if (/오늘|금일/.test(t)) return { offset: 0 };
    if (/내일/.test(t)) return { offset: 1 };
    if (/모레/.test(t)) return { offset: 2 };
    const md = t.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/) || t.match(/(\d{1,2})\/(\d{1,2})/);
    if (!md) return null;
    return { month: parseInt(md[1], 10), day: parseInt(md[2], 10) };
  }

  function _matchDate(b, hint) {
    if (!hint || !b || !b.starts_at) return true;
    const d = new Date(b.starts_at);
    if (hint.offset != null) {
      const r = new Date();
      r.setDate(r.getDate() + hint.offset);
      return d.getFullYear() === r.getFullYear() && d.getMonth() === r.getMonth() && d.getDate() === r.getDate();
    }
    return (d.getMonth() + 1) === hint.month && d.getDate() === hint.day;
  }

  function _timeHint(q) {
    const t = _trim(q);
    const m = t.match(/(\d{1,2}):(\d{2})/) || t.match(/(\d{1,2})\s*시\s*(\d{1,2})?\s*분?/);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    // [핫픽스F 보강] "4시 반" → 30분.
    const min = m[2] ? parseInt(m[2], 10) : (/시\s*반/.test(t) ? 30 : 0);
    if (/(오후|저녁|밤)/.test(t) && h < 12) h += 12;
    // [2026-07-25 예약QA INT-F5] '밤 12시'=자정(00시). 예전엔 h=12라 위 h<12 조건을 못 타 정오로 남았다.
    if (/(오전|아침|밤)/.test(t) && h === 12) h = 0;
    // [Phase3] 살롱 영업시간(09~24) 기준 — 오전/오후 표기 없이 1~8시면 오후로 본다("4시로"=16:00).
    if (!/(오전|아침|오후|저녁|밤)/.test(t) && h >= 1 && h <= 8) h += 12;
    return { h, min };
  }

  function _matchTime(b, hint) {
    if (!hint || !b || !b.starts_at) return true;
    const d = new Date(b.starts_at);
    return d.getHours() === hint.h && d.getMinutes() === hint.min;
  }

  // [핫픽스E #3] "새 시간" 전용 추출 — 반드시 "…로/으로" 타깃 위치의 시각만.
  //   "윤하영 6/17 14시 예약 시간 바꿔" 의 14시(기존 참조)는 새 시간이 아님 → null → "몇 시로?" 질문.
  //   "내일 3시 예약 4시로 바꿔" 는 3시(참조) 무시하고 4시 채택. 직전 '몇 시로?'(pending) 상태면 바레 시각 허용.
  function _newTimeHint(q, hasPending) {
    const t = _trim(q);
    const m = t.match(/(\d{1,2})\s*:\s*(\d{2})\s*으?로/) || t.match(/(\d{1,2})\s*시\s*(반|\d{1,2})?\s*분?\s*으?로/);
    if (m) {
      let h = parseInt(m[1], 10);
      // [핫픽스F 보강] "4시반으로" → 30분.
      const min = (m[2] === '반') ? 30 : (m[2] ? parseInt(m[2], 10) : 0);
      if (/(오후|저녁|밤)/.test(t) && h < 12) h += 12;
      if (/(오전|아침)/.test(t) && h === 12) h = 0;
      if (!/(오전|아침|오후|저녁|밤)/.test(t) && h >= 1 && h <= 8) h += 12;
      return { h, min };
    }
    // [핫픽스F #5-8] pending('몇 시로?') 상태여도 "바레 시각 답변"만 새 시간으로 인정한다.
    //   "강연준 6/17 14시 예약 시간 바꿔" 처럼 예약/날짜/변경동사가 섞인 원문 재입력은 14시(기존 참조)를
    //   새 시간으로 쓰지 않는다 → null → 항상 "몇 시로?"(같은 문장 반복해도 결정적).
    if (hasPending && _isBareTimeReply(t)) return _timeHint(t);
    return null;
  }

  // "4시로" "오후 4시" "14시" 처럼 시각만 담은 답변인지(예약 식별 토큰이 섞이면 바레 답변 아님).
  function _isBareTimeReply(t) {
    if (!/\d{1,2}\s*시|\d{1,2}\s*:\s*\d{2}/.test(t)) return false;
    if (/(예약|바꿔|바꾸|변경|옮겨|미뤄|당겨)/.test(t)) return false;
    if (/(\d{1,2})\s*월\s*(\d{1,2})\s*일|\d{1,2}\/\d{1,2}|오늘|내일|모레/.test(t)) return false;
    return true;
  }

  function _nameHint(q) {
    let s = _trim(q).replace(/(오늘|내일|모레|예약|시간|오전|오후|저녁|아침|새벽|점심|밤|취소|삭제|지워|없애|캔슬|복구|되돌려|되돌리|되살|바꿔|바꾸|변경|옮겨|미뤄|당겨|그거|그것|이거|이것|저거|저것|그럼|그러면|아니|아냐|아니요|말고|다시|방금|직전|그|응|네|하라고|해줘|해|님)/g, ' ');
    s = s.replace(/\d{1,2}:\d{2}|\d+\s*시\s*(\d+\s*분)?|\d+\s*월\s*\d+\s*일/g, ' ');
    const m = s.match(/[가-힣]{2,5}/);
    return m ? m[0] : '';
  }

  function _softReference(q) {
    const t = _trim(q);
    if (/(그거|그것|이거|이것|저거|저것|그\s*예약|그\s*고객|방금|직전|아니|아냐|아니요|그럼|그러면|말고)/.test(t)) return true;
    return _isBareTimeReply(t);
  }

  async function _fetchByDateHint(hint) {
    if (!hint || hint.offset == null || typeof window.apiFetch !== 'function') return [];
    const r = _dayRange(hint.offset);
    const path = `/bookings?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`;
    const res = await window.apiFetch(path, { headers: window.authHeader ? window.authHeader() : {} });
    if (!res || !res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return ((data && data.items) || []).filter(_active);
  }

  function _rememberList(result) {
    if (!result || !/^bookings_/.test(result.type || '')) return;
    const items = (result.data && Array.isArray(result.data.items)) ? result.data.items.filter(_active) : [];
    S.lastList = { ts: Date.now(), type: result.type, items };
    if (result.data && result.data.customer) _rememberCustomerFromBooking(result.data.customer);
    if (items.length === 1) _rememberTarget(items[0]);
  }

  function _bookingFromAction(action, data) {
    const p = (action && action.payload) || {};
    const b = (action && action._context_booking) || (data && (data.booking || data.item)) || {};
    return {
      id: p.booking_id || b.id || (data && (data.booking_id || data.id)) || null,
      customer_id: p.customer_id || b.customer_id || null,
      customer_name: p.customer_name || b.customer_name || p.name || '',
      service_name: p.service_name || b.service_name || '',
      starts_at: p.starts_at || b.starts_at || '',
      ends_at: p.ends_at || b.ends_at || '',
      // [핫픽스E #4] 복구 재생성 폴백 대비 — 금액/예약금 보존.
      amount: (p.amount != null ? p.amount : (b.amount != null ? b.amount : null)),
      deposit: (p.deposit != null ? p.deposit : (b.deposit != null ? b.deposit : null)),
      status: b.status || '',
    };
  }

  function _rememberAction(action, data) {
    const kind = (action && action.kind) || (data && data.kind) || '';
    const booking = _bookingFromAction(action, data);
    if (kind === 'create_booking' && booking.id) S.lastCreated = { ts: Date.now(), booking };
    if (kind === 'cancel_booking' && booking.id) S.lastCancelled = { ts: Date.now(), booking };
    if (booking.id) _rememberTarget(booking);
    if (kind === 'restore_booking') S.lastCancelled = null;
  }

  function _cancelAction(b, source) {
    return {
      kind: 'cancel_booking',
      payload: { booking_id: b.id, customer_id: b.customer_id || null, customer_name: _name(b) },
      confirmation_text: `${_name(b)}님 ${_fmt(b)}${b.service_name ? ' ' + b.service_name : ''} 예약 취소할까요?`,
      _source_question: source,
      _context_booking: b,
    };
  }

  function _restoreAction(b, source) {
    return {
      kind: 'restore_booking',
      payload: { booking_id: b.id, customer_id: b.customer_id || null, customer_name: _name(b) },
      confirmation_text: `${_name(b)}님 ${_fmt(b)}${b.service_name ? ' ' + b.service_name : ''} 예약 복구할까요?`,
      _source_question: source,
      _context_booking: b,
    };
  }

  function _pad2(n) { return String(n).padStart(2, '0'); }

  // 새 시간(time={h,min})으로 옮긴 예약 변경 액션. 기존 소요시간(ends-starts) 유지.
  function _rescheduleAction(b, time, source) {
    const d = new Date(b.starts_at);
    const nd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), time.h, time.min, 0);
    let ne = null;
    if (b.ends_at) {
      const dur = new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime();
      if (dur > 0) ne = new Date(nd.getTime() + dur);
    }
    return {
      kind: 'reschedule_booking',
      payload: {
        booking_id: b.id,
        customer_id: b.customer_id || null,
        customer_name: _name(b),
        starts_at: nd.toISOString(),
        ends_at: ne ? ne.toISOString() : null,
      },
      confirmation_text: `${_name(b)}님 예약을 ${_fmt({ starts_at: nd.toISOString() })}로 변경할까요?`,
      _source_question: source,
      _context_booking: b,
    };
  }

  function _askPick(list, verb) {
    const v = verb || '취소';
    const lines = list.slice(0, 5).map((b) => `· ${_fmt(b)} ${_name(b)}${b.service_name ? ' ' + b.service_name : ''}`);
    return `어느 예약을 ${v}할까요? 시간이나 고객 이름을 같이 알려주세요.\n${lines.join('\n')}`;
  }

  async function _pickCancelTarget(q) {
    const hint = _dateHint(q);
    const time = _timeHint(q);
    const name = _nameHint(q);
    const target = _lastTarget();
    if (target && !name && _matchDate(target, hint) && _matchTime(target, time) && (_softReference(q) || (!hint && !time))) {
      return { booking: target };
    }
    let list = (_fresh(S.lastList) && S.lastList.items) ? S.lastList.items.slice() : [];
    if (hint && hint.offset != null && (!list.length || !list.some((b) => _matchDate(b, hint)))) {
      list = await _fetchByDateHint(hint);
    }
    list = list.filter((b) => _matchDate(b, hint) && _matchTime(b, time));
    if (name) list = list.filter((b) => _name(b).includes(name) || name.includes(_name(b)));
    if (list.length === 1) return { booking: list[0] };
    if (list.length > 1) return { ask: _askPick(list, '취소') };
    return null;
  }

  // 변경 대상 예약 고르기 — 발화의 시간(=새 시간)은 필터에 쓰지 않는다(취소와 다른 점).
  async function _pickRescheduleTarget(q) {
    const hint = _dateHint(q);
    const name = _nameHint(q);
    const target = _lastTarget();
    if (target && !name && _matchDate(target, hint) && (_softReference(q) || (!hint && _newTimeHint(q, false)))) {
      return { booking: target };
    }
    let list = (_fresh(S.lastList) && S.lastList.items) ? S.lastList.items.slice() : [];
    if (hint && hint.offset != null && (!list.length || !list.some((b) => _matchDate(b, hint)))) {
      list = await _fetchByDateHint(hint);
    }
    if (hint) list = list.filter((b) => _matchDate(b, hint));
    if (name) list = list.filter((b) => _name(b).includes(name) || name.includes(_name(b)));
    if (list.length === 1) return { booking: list[0] };
    if (list.length > 1) return { ask: _askPick(list, '변경') };
    return null;
  }

  function _looksCancel(q) {
    return /(취소|삭제|지워|없애|캔슬)/.test(_trim(q));
  }

  // 예약 복구(undo) — 계정/백업 맥락은 제외하고, '복구/되돌려/되살려' 면 예약 복구로 본다.
  //   (보조 키워드 없어도 OK — context 없으면 _restoreResult 가 정직 안내. 백업창으로 새지 않게.)
  function _looksRestore(q) {
    const t = _trim(q);
    if (!/(복구|되돌려|되돌리|되살|취소\s*취소|다시\s*살|살려)/.test(t)) return false;
    if (/(백업|데이터\s*복구|계정|로그아웃|export|내보내|받기)/.test(t)) return false;
    // 조회 질문("…언제야? 복구테스트")이나 예약이 아닌 대상("메모 되돌려줘")까지 삼키면
    //   입력이 서버에 못 가고 '취소한 예약 없음' 으로 사라진다. 예약을 말하지 않은 채 이런 말이 붙으면 넘긴다.
    if (!/(예약|취소)/.test(t) && /(\?|언제|몇\s*(번|명|시|개)|얼마|누구|알려|메모|매출|회원권|잔액|캡션|사진|고객\s*정보)/.test(t)) return false;
    return true;
  }

  // 예약 시간 변경 — "그거 4시로 바꿔", "4시로 변경", "예약 시간 바꿔".
  //   직전에 '몇 시로?' 를 물어본 상태(pendingReschedule)면 시간만 말해도("4시로") 변경으로 본다.
  function _looksReschedule(q) {
    const t = _trim(q);
    if (/(취소|삭제|지워|없애|캔슬|복구|되돌|백업)/.test(t)) return false;
    const hasTime = /\d{1,2}:\d{2}|\d{1,2}\s*시/.test(t);
    if (_fresh(S.pendingReschedule) && hasTime) return true;
    if (_lastTarget() && _isBareTimeReply(t)) return true;
    if (_fresh(S.lastList) && S.lastList.items && S.lastList.items.length === 1 && _isBareTimeReply(t)) return true;
    const hasChange = /(바꿔|바꾸|변경|옮겨|미뤄|당겨|로\s*해|로\s*잡)/.test(t);
    if (!hasChange) return false;
    const refersBooking = /예약|그거|그\s|내일|오늘|모레|시간/.test(t);
    return hasTime || (refersBooking && /시간/.test(t));
  }

  async function _rescheduleResult(q, raw) {
    const hasPending = _fresh(S.pendingReschedule) && !!S.pendingReschedule.booking;
    const time = _newTimeHint(q, hasPending);
    // 시간을 아직 못 받음 → 대상만 정하고 "몇 시로?" 묻기(pendingReschedule 보관).
    if (!time) {
      const picked = await _pickRescheduleTarget(q);
      if (!picked) return { matched: true, kind: 'message', text: '어떤 예약을 바꿀지 못 찾았어요. "내일 3시 예약 4시로 바꿔"처럼 알려주세요.' };
      if (picked.ask) return { matched: true, kind: 'message', text: picked.ask };
      S.pendingReschedule = { ts: Date.now(), booking: picked.booking };
      // [핫픽스E #3] 새 시간 없을 때 기존시간 변경확인 금지 — "몇 시로?" 질문 + 예약 요약 카드(고객/시술/일시/예약금/상태) 표시.
      return { matched: true, kind: 'message', text: `${_name(picked.booking)}님 ${_fmt(picked.booking)} 예약을 몇 시로 바꿀까요? "4시로"처럼 알려주세요.`, booking_cards: [picked.booking] };
    }
    // 시간 있음 — 직전에 대상이 정해졌으면 그걸로, 아니면 발화에서 대상 찾기.
    let target = (_fresh(S.pendingReschedule) && S.pendingReschedule.booking) ? S.pendingReschedule.booking : null;
    if (!target) {
      const picked = await _pickRescheduleTarget(q);
      if (!picked) return { matched: true, kind: 'message', text: '어떤 예약을 바꿀지 못 찾았어요. "내일 3시 예약 4시로 바꿔"처럼 알려주세요.' };
      if (picked.ask) return { matched: true, kind: 'message', text: picked.ask };
      target = picked.booking;
    }
    S.pendingReschedule = null;
    _rememberTarget(target);
    return { matched: true, kind: 'card', action: _rescheduleAction(target, time, raw) };
  }

  async function tryRun(text) {
    const q = _trim(text);
    if (!q) return null;
    if (_looksRestore(q)) return _restoreResult(q);
    if (_looksReschedule(q)) return _rescheduleResult(q, text);
    if (!_looksCancel(q)) return null;
    const picked = await _pickCancelTarget(q);
    if (!picked) return null;
    if (picked.ask) return { matched: true, kind: 'message', text: picked.ask };
    _rememberTarget(picked.booking);
    return { matched: true, kind: 'card', action: _cancelAction(picked.booking, text) };
  }

  function _restoreResult(q) {
    if (!_fresh(S.lastCancelled) || !S.lastCancelled.booking || !S.lastCancelled.booking.id) {
      return { matched: true, kind: 'message', text: '방금 취소한 예약을 찾지 못했어요. 바로 전에 취소한 예약만 복구할 수 있어요.' };
    }
    return { matched: true, kind: 'card', action: _restoreAction(S.lastCancelled.booking, q) };
  }

  function _installActionSupport() {
    const api = window.ItdasyAssistant;
    if (!api || typeof api.registerLocalHandler !== 'function') return;
    if (typeof api.registerKindMeta === 'function') {
      api.registerKindMeta({
        restore_booking: { icon: 'ic-refresh-cw', label: '예약 복구', color: 'var(--brand)' },
        reschedule_booking: { icon: 'ic-clock', label: '시간 변경', color: 'var(--brand)' },
      });
    }
    if (api.RISKY_ACTION_KINDS && typeof api.RISKY_ACTION_KINDS.add === 'function') {
      api.RISKY_ACTION_KINDS.add('restore_booking');
      api.RISKY_ACTION_KINDS.add('reschedule_booking');
    }
    api.registerLocalHandler('restore_booking', async (action) => {
      const p = (action && action.payload) || {};
      const ctx = (action && action._context_booking) || {};
      if (!p.booking_id) return { message: '방금 취소한 예약을 찾지 못했어요. 예약관리에서 직접 다시 잡아주세요.' };
      if (!window.Booking || typeof window.Booking.update !== 'function') throw new Error('예약 기능을 불러오지 못했어요');
      // [핫픽스E #4] restore 전용 endpoint 호출 안 함 — status 만 confirmed 로 되돌림.
      //   백엔드가 취소를 하드삭제로 처리해 PATCH 가 404(endpoint-missing) 면, 보존한 컨텍스트로 재생성해 실제 복구.
      let updated;
      try {
        updated = await window.Booking.update(p.booking_id, { status: 'confirmed' });
      } catch (e) {
        const missing = String((e && e.message) || '') === 'endpoint-missing';
        if (missing && ctx.starts_at && typeof window.Booking.create === 'function') {
          const startMs = new Date(ctx.starts_at).getTime();
          const endsAt = ctx.ends_at || (Number.isFinite(startMs) ? new Date(startMs + 60 * 60 * 1000).toISOString() : null);
          updated = await window.Booking.create({
            customer_id: ctx.customer_id || null,
            customer_name: ctx.customer_name || _name(ctx),
            service_name: ctx.service_name || null,
            starts_at: ctx.starts_at,
            ends_at: endsAt,
            amount: ctx.amount != null ? ctx.amount : null,
            deposit: ctx.deposit != null ? ctx.deposit : null,
          });
        } else {
          throw e;
        }
      }
      const b = Object.assign({}, ctx, updated || {});
      S.lastCancelled = null;
      _rememberTarget(b);
      return { message: `📅 ${_name(b)}님 ${_fmt(b)} 예약 복구했어요`, booking: b };
    });
    api.registerLocalHandler('reschedule_booking', async (action) => {
      const p = (action && action.payload) || {};
      if (!p.booking_id || !p.starts_at) return { message: '변경할 예약을 찾지 못했어요' };
      if (!window.Booking || typeof window.Booking.update !== 'function') throw new Error('예약 기능을 불러오지 못했어요');
      const patch = { starts_at: p.starts_at };
      if (p.ends_at) patch.ends_at = p.ends_at;
      const updated = await window.Booking.update(p.booking_id, patch);
      const b = Object.assign({}, action._context_booking || {}, updated || {}, { starts_at: p.starts_at, ends_at: p.ends_at });
      _rememberTarget(b);
      return { message: `📅 ${_name(b)}님 예약을 ${_fmt(b)}로 변경했어요`, booking: b };
    });
  }

  _installActionSupport();
  window.ItdasyBookingContext = { rememberList: _rememberList, rememberAction: _rememberAction, tryRun };
})();
