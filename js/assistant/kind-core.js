/* AI 잇비 — 액션 종류/메타 공통 모듈
   app-assistant.js 본문이 더 커지지 않도록 독립성이 높은 설정을 분리. */
(function () {
  'use strict';

  function _esc(s) { return window._esc(s); } /* [2026-06-11] 중복 제거 — app-core 정본 위임 */

  function _suggestions() {
    // [연준님 2026-08-16] **여기가 구버전 고정칩의 진짜 출처였다.**
    //   app-assistant.js 는 `window.ItdasyAssistant.SUGGESTIONS || [폴백]` 로 읽는데,
    //   이 모듈이 항상 값을 채워서 그쪽 폴백 배열은 **도달조차 안 하는 죽은 코드**였다.
    //   그래서 app-assistant.js 만 고쳤을 때 화면은 그대로 옛 5개였다(캐시 아님 — 실측으로 확인).
    //   초기 추천질문의 정본은 이제 GET /assistant/starters(계정 상태 기반)다.
    //   여기 남기는 건 **서버 응답 전 한 프레임** 동안만 보이는 폴백이라,
    //   계정 상태와 무관하게 항상 참인 것 + 눌러도 0원인 것만 둔다.
    //   ('캡션 만들어줘'·'사진 보정해줘' 는 사진이 없으면 헛걸음이라 뺐다)
    return [
      '오늘 예약 알려줘',
      '이번 달 매출 얼마야?',
      '단골 누구야?',
    ];
  }

  function _categories() {
    return [
      { value: 'nail', label: '네일' },
      { value: 'lash', label: '속눈썹' },
      { value: 'hair', label: '헤어' },
      { value: 'skin', label: '피부' },
      { value: 'food', label: '식품/생수' },
      { value: 'office', label: '사무용품' },
      { value: 'rent', label: '임대료' },
      { value: 'utility', label: '공과금' },
      { value: 'etc', label: '기타' },
    ];
  }

  function _categoryOptionsHtml(categories, selected) {
    const sel = String(selected == null ? '' : selected).toLowerCase();
    const known = categories.some(c => c.value === sel);
    const opts = categories.map(c =>
      `<option value="${_esc(c.value)}"${c.value === sel ? ' selected' : ''}>${_esc(c.label)}</option>`
    ).join('');
    const custom = (!known && sel) ? `<option value="${_esc(sel)}" selected>${_esc(sel)}</option>` : '';
    return custom + opts;
  }

  function _baseCategory() {
    return {
      create_customer:       { icon: 'ic-user',            label: '고객 추가', color: '#4ECDC4' },
      update_customer:       { icon: 'ic-edit-3',          label: '고객 수정', color: '#4ECDC4' },
      create_revenue:        { icon: 'ic-dollar-sign',     label: '매출 기록', color: '#388e3c' },
      create_booking:        { icon: 'ic-calendar',        label: '예약 추가', color: 'var(--brand)' },
      update_booking:        { icon: 'ic-edit-3',          label: '예약 수정', color: '#D58A95' },
      cancel_booking:        { icon: 'ic-x',               label: '예약 취소', color: 'var(--danger)' },
      reschedule_booking:    { icon: 'ic-refresh-cw',      label: '예약 변경', color: '#0288D1' },
      create_expense:        { icon: 'ic-credit-card',     label: '지출 기록', color: '#E07A5F' },
      upsert_inventory:      { icon: 'ic-package',         label: '재고 입고', color: '#2B8C7E' },
      generate_bulk_message: { icon: 'ic-message-square',  label: '메시지', color: '#FF8A5C' },
      charge_membership:     { icon: 'ic-credit-card',     label: '회원권 충전', color: '#BC6675' },
      use_membership:        { icon: 'ic-credit-card',     label: '회원권 사용', color: '#BC6675' },
      mark_booking_no_show:  { icon: 'ic-x-octagon',       label: '노쇼 처리', color: 'var(--danger)' },
      mark_booking_completed:{ icon: 'ic-check-circle',    label: '시술 완료', color: '#15803D' },
      refund_revenue:        { icon: 'ic-corner-up-left',  label: '환불 처리', color: '#F97316' },
      update_service_price:  { icon: 'ic-dollar-sign',     label: '가격 변경', color: '#0EA5E9' },
      // [Phase 0 · 2026-07-20] 잇비 해제 kind — 시술 기록(포트폴리오 1급 엔티티)
      create_treatment_record:{ icon: 'ic-camera',         label: '시술 기록', color: '#7C6BB0' },
      // [Phase 2 · 2026-07-20] CRM 깊이 — 고객 메모 / 리뷰 요청(초안 큐)
      add_customer_memo:     { icon: 'ic-edit-3',          label: '고객 메모', color: '#4ECDC4' },
      request_review:        { icon: 'ic-star',            label: '리뷰 요청', color: '#F59E0B' },
      // [Phase 3 · 2026-07-20] 자동화 제어 토글 (설정 플래그, 발송 아님)
      toggle_dm_autoreply:   { icon: 'ic-message-square',  label: 'DM 자동응답', color: '#8B5CF6' },
      toggle_automation_rule:{ icon: 'ic-settings',        label: '자동화 설정', color: '#6366F1' },
    };
  }

  function _riskyActionKinds() {
    return new Set([
      'cancel_booking',
      'cancel_booking_bulk',
      'refund_revenue',
      'use_membership',
      'charge_membership',
      'mark_booking_no_show',
      'send_message',
      'reply_dm',
      'delete_customer',
      'publish_instagram',
      'update_service_price',
      // [Phase 3 · 2026-07-20] 지속 설정 변경 — 자동화 토글은 native confirm 한 번 더
      'toggle_dm_autoreply',
      'toggle_automation_rule',
    ]);
  }

  function _fmtAmt(a) {
    return a == null ? '' : Number(a).toLocaleString() + '원';
  }

  function _fmtDate(s) {
    try {
      const d = new Date(s);
      return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.getHours() + '시';
    } catch (_e) {
      return '';
    }
  }

  function _pushExpenseParts(parts, p) {
    const v = (p.vendor || '').trim();
    parts.push(v || '지출처 미상');
    if (p.amount) parts.push(_fmtAmt(p.amount));
    if (Array.isArray(p.items) && p.items.length) {
      parts.push(`품목 ${p.items.length}건`);
    } else {
      const m = (p.memo || '').trim();
      if (m) parts.push(m.slice(0, 20));
    }
    _pushExpenseDiscount(parts, p);
  }

  function _pushExpenseDiscount(parts, p) {
    try {
      const total = (Array.isArray(p.items) ? p.items : [])
        .reduce((s, it) => s + (Number(it && it.total) || 0), 0);
      if (total > 0 && p.amount && Math.abs(total - Number(p.amount)) > 100) {
        const diff = total - Number(p.amount);
        if (diff > 0) parts.push(`할인 -${_fmtAmt(diff)}`);
      }
    } catch (_e) {
      void _e;
    }
  }

  function _pushInventoryParts(parts, p) {
    const items = Array.isArray(p.items) ? p.items : [];
    if (items.length) {
      const it0 = items[0] || {};
      const nm = (it0.name || '').trim();
      if (nm) parts.push(nm);
      if (it0.quantity) parts.push(it0.quantity + '개');
      if (items.length > 1) parts.push('외 ' + (items.length - 1) + '건');
      const total = items.reduce((s, x) => s + (Number(x && x.total) || 0), 0);
      if (total > 0) parts.push(_fmtAmt(total));
    } else if (p.amount) {
      parts.push('재고 입고');
      parts.push(_fmtAmt(p.amount));
    } else {
      parts.push('재고 항목 미상');
    }
  }

  function _pushCustomerParts(parts, p) {
    if (p.customer_name || p.name) parts.push(p.customer_name || p.name);
    if (p.customer_phone || p.phone) parts.push(p.customer_phone || p.phone);
    if (p.memo) parts.push(String(p.memo).slice(0, 20));
  }

  function _pushBookingParts(parts, p) {
    if (p.customer_name || p.name) parts.push(p.customer_name || p.name);
    if (p.service_name) parts.push(p.service_name);
    if (p.starts_at) {
      const t = _fmtDate(p.starts_at);
      if (t) parts.push(t);
    }
  }

  function _pushRevenueParts(parts, p) {
    if (p.customer_name || p.name) parts.push(p.customer_name || p.name);
    else parts.push('고객 미상');
    if (p.service_name) parts.push(p.service_name);
    if (p.amount) parts.push(_fmtAmt(p.amount));
    if (!p.amount && (p.customer_phone || p.phone)) parts.push(p.customer_phone || p.phone);
  }

  function _pushMembershipParts(parts, kind, p) {
    if (p.customer_name || p.name) parts.push(p.customer_name || p.name);
    else parts.push('고객 미상');
    if (p.amount) parts.push((kind === 'charge_membership' ? '+' : '−') + _fmtAmt(p.amount));
  }

  function _pushBookingStatusParts(parts, kind, p) {
    if (p.customer_name || p.name) parts.push(p.customer_name || p.name);
    if (p.starts_at) {
      const t = _fmtDate(p.starts_at);
      if (t) parts.push(t);
    } else if (p.booking_id) {
      parts.push('#' + p.booking_id);
    }
    parts.push(kind === 'mark_booking_no_show' ? '노쇼' : '완료');
  }

  function _pushRefundParts(parts, p) {
    if (p.revenue_id) parts.push('매출 #' + p.revenue_id);
    if (p.reason) parts.push(String(p.reason).slice(0, 20));
    if (p.amount) parts.push('환불 ' + _fmtAmt(p.amount));
  }

  function _pushPriceParts(parts, p) {
    if (p.service_name) parts.push(p.service_name);
    else if (p.service_id) parts.push('#' + p.service_id);
    const np = p.new_price != null ? p.new_price : p.amount;
    if (np != null) parts.push('→ ' + _fmtAmt(np));
  }

  function _pushDefaultParts(parts, p) {
    if (p.customer_name || p.name) parts.push(p.customer_name || p.name);
    if (p.customer_phone || p.phone) parts.push(p.customer_phone || p.phone);
    if (p.service_name) parts.push(p.service_name);
    if (p.amount) parts.push(_fmtAmt(p.amount));
    if (p.starts_at) {
      const t = _fmtDate(p.starts_at);
      if (t) parts.push(t);
    }
    if (p.memo) parts.push(String(p.memo).slice(0, 20));
  }

  function _pushToggleParts(parts, kind, p) {
    parts.push(p.enabled === false ? '끄기' : '켜기');
    if (kind === 'toggle_automation_rule' && p.rule_name) parts.push(String(p.rule_name).slice(0, 20));
  }

  function _pushReviewParts(parts, p) {
    if (p.customer_name || p.name) parts.push(p.customer_name || p.name);
  }

  function summarizeAction(action) {
    const p = (action && action.payload) || {};
    const kind = (action && action.kind) || '';
    const parts = [];
    if (kind === 'create_expense') _pushExpenseParts(parts, p);
    else if (kind === 'upsert_inventory') _pushInventoryParts(parts, p);
    else if (kind === 'create_customer') _pushCustomerParts(parts, p);
    else if (kind === 'create_booking') _pushBookingParts(parts, p);
    else if (kind === 'create_revenue') _pushRevenueParts(parts, p);
    else if (kind === 'charge_membership' || kind === 'use_membership') _pushMembershipParts(parts, kind, p);
    else if (kind === 'mark_booking_no_show' || kind === 'mark_booking_completed') _pushBookingStatusParts(parts, kind, p);
    else if (kind === 'refund_revenue') _pushRefundParts(parts, p);
    else if (kind === 'update_service_price') _pushPriceParts(parts, p);
    else if (kind === 'toggle_dm_autoreply' || kind === 'toggle_automation_rule') _pushToggleParts(parts, kind, p);
    else if (kind === 'request_review') _pushReviewParts(parts, p);
    else _pushDefaultParts(parts, p);
    if (!parts.length && action && action.confirmation_text) return action.confirmation_text;
    return parts.join(' · ') || kind || '';
  }

  function _executionPriority() {
    return {
      create_customer: 0,
      update_customer: 1,
      create_booking: 2,
      update_booking: 3,
      reschedule_booking: 3,
      cancel_booking: 3,
      create_revenue: 4,
      create_expense: 5,
      upsert_inventory: 6,
      generate_bulk_message: 8,
    };
  }

  function unifiedExecutionOrder(groups) {
    const priority = _executionPriority();
    const flat = [];
    (groups || []).forEach((g, gi) => {
      (g.items || []).forEach((it, ii) => {
        flat.push({ gi, ii, it, kind: g.kind, order: priority[g.kind] ?? 99 });
      });
    });
    flat.sort((a, b) => (a.order - b.order) || (a.gi - b.gi) || (a.ii - b.ii));
    return flat;
  }

  function _dedupeKeyOf(action) {
    const p = (action && action.payload) || {};
    const kind = action && action.kind;
    if (kind === 'create_expense') return _expenseDedupeKey(p);
    if (kind === 'upsert_inventory') {
      const it0 = (Array.isArray(p.items) && p.items[0]) || {};
      return `inv|${(it0.name || '').trim().toLowerCase()}|${it0.quantity || 0}|${(it0.unit || '').trim()}`;
    }
    if (kind === 'create_revenue') {
      return `rev|${(p.customer_name || p.name || '').trim()}|${(p.service_name || '').trim()}|${p.amount || 0}|${p.starts_at || ''}`;
    }
    if (kind === 'create_customer') {
      return `cust|${(p.customer_name || p.name || '').trim()}|${(p.customer_phone || p.phone || '').trim()}`;
    }
    if (kind === 'create_booking') {
      return `book|${(p.customer_name || p.name || '').trim()}|${(p.service_name || '').trim()}|${p.starts_at || ''}`;
    }
    try { return `${kind}|${JSON.stringify(p).slice(0, 100)}`; }
    catch (_e) { return `${kind}|?`; }
  }

  function _expenseDedupeKey(p) {
    const rmeta = (p.receipt_meta && typeof p.receipt_meta === 'object') ? p.receipt_meta : {};
    const imageHash = (p.image_hash || rmeta.image_hash || '').toString();
    const transactionTime = (rmeta.transaction_time || '').toString();
    const approvalNo = (rmeta.approval_no || '').toString();
    if (imageHash || transactionTime || approvalNo) {
      return `expense|hash:${imageHash}|txn:${transactionTime}|appr:${approvalNo}`;
    }
    try { return `expense|nometa|${JSON.stringify(p).slice(0, 200)}`; }
    catch (_e) { return 'expense|nometa|?'; }
  }

  function _hasPayloadSignal(action) {
    const p = (action && action.payload) || {};
    return !!(
      p.vendor || p.customer_name || p.name || p.service_name ||
      p.amount || p.memo || p.customer_phone || p.phone || p.starts_at ||
      (Array.isArray(p.items) && p.items.length && (p.items[0] && (p.items[0].name || p.items[0].quantity)))
    );
  }

  function dedupeAndCapActions(actions) {
    let list = Array.isArray(actions) ? actions : [];
    list = list.filter(a => a && a.kind !== 'upsert_inventory' && a.kind !== 'delete_inventory');
    if (!list.length) return { actions: [], dropped: 0, droppedKinds: [] };
    const seen = new Map();
    const perKind = {};
    const droppedKindsSet = new Set();
    let dropped = 0;
    for (const action of list) {
      if (!action || !action.kind || !_hasPayloadSignal(action)) {
        dropped += 1;
        if (action && action.kind) droppedKindsSet.add(action.kind);
        continue;
      }
      const key = _dedupeKeyOf(action);
      const kindCount = perKind[action.kind] || 0;
      if (seen.has(key) || kindCount >= 8 || seen.size >= 20) {
        dropped += 1;
        droppedKindsSet.add(action.kind);
        continue;
      }
      seen.set(key, action);
      perKind[action.kind] = kindCount + 1;
    }
    return { actions: Array.from(seen.values()), dropped, droppedKinds: Array.from(droppedKindsSet) };
  }

  function groupActions(actions) {
    const order = [];
    const map = {};
    (actions || []).forEach((action, index) => {
      if (!action || !action.kind) return;
      if (!map[action.kind]) {
        map[action.kind] = [];
        order.push(action.kind);
      }
      map[action.kind].push({ action, skipped: false, status: 'pending', origIdx: index });
    });
    return order.map(kind => ({ kind, items: map[kind], expanded: false, bulkProgress: null }));
  }

  function _installApi() {
    const SUGGESTIONS = _suggestions();
    const CATEGORIES = _categories();
    const CATEGORY = _baseCategory();
    const externalInvalidateKinds = {};
    const localKindHandlers = {};
    const api = window.ItdasyAssistant = window.ItdasyAssistant || {};
    const catMeta = kind => CATEGORY[kind] || { icon: 'ic-check', label: kind || '작업', color: '#666' };
    Object.assign(api, {
      SUGGESTIONS,
      CATEGORIES,
      CATEGORY,
      RISKY_ACTION_KINDS: _riskyActionKinds(),
      externalInvalidateKinds,
      localKindHandlers,
      categoryOptionsHtml: selected => _categoryOptionsHtml(CATEGORIES, selected),
      catMeta,
      summarizeAction,
      unifiedExecutionOrder,
      dedupeAndCapActions,
      groupActions,
    });
    api.registerKindMeta = function (metaMap) {
      if (metaMap && typeof metaMap === 'object') Object.assign(CATEGORY, metaMap);
    };
    api.registerInvalidateKinds = function (kindMap) {
      if (kindMap && typeof kindMap === 'object') Object.assign(externalInvalidateKinds, kindMap);
    };
    api.registerLocalHandler = function (kind, handler) {
      if (typeof kind === 'string' && typeof handler === 'function') localKindHandlers[kind] = handler;
    };
  }

  _installApi();
})();
