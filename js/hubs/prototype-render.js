(function () {
  'use strict';

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function _money(n) {
    const v = Number(n || 0);
    if (!v) return '0';
    return v >= 10000 ? (v / 10000).toFixed(v >= 100000 ? 0 : 1) + '만' : v.toLocaleString('ko-KR');
  }

  function _tail(phone) {
    const d = String(phone || '').replace(/\D/g, '');
    return d.length >= 4 ? '010...' + d.slice(-4) : _esc(phone || '');
  }

  function _dateShort(v) {
    if (!v) return '';
    return String(v).slice(0, 10).replace(/-/g, '/');
  }

  function _customerBadges(c, cl) {
    const badges = [];
    if (cl.isRegular) badges.push('<span class="badge badge-regular">단골</span>');
    if (cl.hasMember) badges.push('<span class="badge badge-member">회원권 ' + _money(c.membership_balance) + '</span>');
    if (cl.isNew && !cl.isRegular) badges.push('<span class="badge badge-new">신규</span>');
    if (cl.isRisk) badges.push('<span class="badge badge-risk">' + cl.lastDays + '일+ 미방문</span>');
    if (cl.isBirthday) badges.push('<span class="badge badge-birthday">오늘 생일</span>');
    return badges.join('');
  }

  function _customerRows(state, classify) {
    const kw = String(state.searchKW || '').toLowerCase();
    const filter = state.filter || 'all';
    let list = (state.enriched || []).slice();
    if (kw) {
      list = list.filter(c => {
        const tags = Array.isArray(c.tags) ? c.tags.join(' ') : '';
        return ((c.name || '') + ' ' + (c.phone || '') + ' ' + (c.memo || '') + ' ' + tags).toLowerCase().includes(kw);
      });
    }
    if (filter !== 'all') {
      list = list.filter(c => {
        const cl = classify(c);
        return (filter === 'member' && cl.hasMember) ||
          (filter === 'new' && cl.isNew) ||
          (filter === 'regular' && cl.isRegular) ||
          (filter === 'risk' && cl.isRisk);
      });
    }
    return list.sort((a, b) => (b.last_visit_at || '').localeCompare(a.last_visit_at || ''));
  }

  function _customerFilterChips(state, classify, stats) {
    const s = stats(state.enriched || []);
    const rows = state.enriched || [];
    const counts = {
      all: s.total,
      member: s.member,
      new: rows.filter(c => classify(c).isNew).length,
      regular: rows.filter(c => classify(c).isRegular).length,
      risk: s.risk,
    };
    const f = state.filter || 'all';
    return '<div class="hub-filter-chips hub-filter-chips--pc">' +
      '<button class="hub-fc-chip' + (f === 'all' ? ' on' : '') + '" data-act="filter" data-filter="all">전체 ' + counts.all + '</button>' +
      '<button class="hub-fc-chip' + (f === 'member' ? ' on' : '') + '" data-act="filter" data-filter="member">멤버 ' + counts.member + '</button>' +
      '<button class="hub-fc-chip' + (f === 'new' ? ' on' : '') + '" data-act="filter" data-filter="new">신규 ' + counts.new + '</button>' +
      '<button class="hub-fc-chip' + (f === 'regular' ? ' on' : '') + '" data-act="filter" data-filter="regular">단골 ' + counts.regular + '</button>' +
      '<button class="hub-fc-chip danger' + (f === 'risk' ? ' on' : '') + '" data-act="filter" data-filter="risk">이탈 위험 ' + counts.risk + '</button>' +
    '</div>';
  }

  function _customerRow(c, selectedId, classify) {
    const cl = classify(c);
    const selected = String(selectedId || '') === String(c.id);
    const meta = [_tail(c.phone), c.avg_cycle_weeks ? c.avg_cycle_weeks + '주 주기' : '', c.last_visit_at ? '최근 ' + _dateShort(c.last_visit_at) : ''].filter(Boolean);
    return '<button class="hp-customer-row' + (selected ? ' selected' : '') + '" data-act="select-customer" data-id="' + _esc(c.id) + '">' +
      '<span class="cust-avatar' + (cl.isRegular || cl.hasMember ? '' : ' gray') + '">' + _esc((c.name || '?').slice(0, 1)) + '</span>' +
      '<span class="cust-info"><span class="cust-name-row"><span class="cust-name">' + _esc(c.name) + '</span>' +
      (cl.visits > 0 ? '<span class="cust-visits">방문 ' + cl.visits + '회</span>' : '') + '</span>' +
      '<span class="cust-meta">' + _customerBadges(c, cl) + (meta.length ? '<span>' + meta.join(' · ') + '</span>' : '') + '</span></span>' +
      '<span class="cust-chev"><i class="ph-duotone ph-caret-right" aria-hidden="true"></i></span>' +
    '</button>';
  }

  function _customerDetail(c, classify) {
    if (!c) {
      return '<section class="hp-detail"><div class="hub-empty"><div class="hub-empty-title">고객을 선택해 주세요</div></div></section>';
    }
    const cl = classify(c);
    const tags = Array.isArray(c.tags) ? c.tags : [];
    const pref = c.preferred_service || c.favorite_service || c.main_service || (tags[0] || '기록 없음');
    const next = c.next_booking_at ? _dateShort(c.next_booking_at) : '없음';
    return '<section class="hp-detail">' +
      '<div class="cd-head"><div class="cd-avatar-lg">' + _esc((c.name || '?').slice(0, 1)) + '</div>' +
      '<div class="cd-name-row"><div class="cd-name">' + _esc(c.name) + ' ' + _customerBadges(c, cl) + '</div>' +
      '<div class="cd-meta">' + [_esc(c.phone || ''), _esc(c.birthday || ''), c.first_visit_at ? '첫 방문 ' + _dateShort(c.first_visit_at) : ''].filter(Boolean).join(' · ') + '</div></div>' +
      '<button class="cd-edit" data-act="open-customer" data-id="' + _esc(c.id) + '">편집</button></div>' +
      '<div class="cd-stats"><div class="cd-stat"><div class="cd-stat-value">' + (cl.visits || 0) + '회</div><div class="cd-stat-label">방문</div></div>' +
      '<div class="cd-stat"><div class="cd-stat-value">' + _money(c.total_spent) + '</div><div class="cd-stat-label">총 매출</div></div>' +
      '<div class="cd-stat"><div class="cd-stat-value">' + _money(c.membership_balance) + '</div><div class="cd-stat-label">회원권 잔액</div></div></div>' +
      '<div class="cd-section"><div class="cd-sec-title">기본 정보</div>' +
      '<div class="cd-info-row"><div class="cd-info-label">평균 방문 주기</div><div class="cd-info-value">' + (c.avg_cycle_weeks ? c.avg_cycle_weeks + '주' : '-') + '</div></div>' +
      '<div class="cd-info-row"><div class="cd-info-label">선호 시술</div><div class="cd-info-value">' + _esc(pref) + '</div></div>' +
      '<div class="cd-info-row"><div class="cd-info-label">다음 예약</div><div class="cd-info-value">' + next + '</div></div></div>' +
      (tags.length ? '<div class="cd-section"><div class="cd-sec-title">태그</div><div class="cd-tags">' + tags.map(t => '<span class="cd-tag">' + _esc(t) + '</span>').join('') + '</div></div>' : '') +
      '<div class="cd-section"><div class="cd-sec-title">최근 방문 이력</div><div class="cd-history-row"><div class="cd-history-date">' + (c.last_visit_at ? _dateShort(c.last_visit_at).slice(5) : '-') + '</div><div class="cd-history-text">' + _esc(c.memo || pref || '최근 기록') + '</div><div class="cd-history-amount">' + _money(c.total_spent) + '</div></div></div>' +
      '<div class="cd-actions"><button class="cd-act-btn" data-act="desktop-revenue" data-id="' + _esc(c.id) + '">매출 입력</button>' +
      '<button class="cd-act-btn" data-act="desktop-booking" data-id="' + _esc(c.id) + '">예약 잡기</button>' +
      '<button class="cd-act-btn primary" data-act="desktop-membership" data-id="' + _esc(c.id) + '">회원권 충전</button></div>' +
    '</section>';
  }

  function customer(ctx) {
    const state = ctx.state;
    const rows = _customerRows(state, ctx.classify);
    const selected = rows.find(c => String(c.id) === String(state.selectedId)) || rows[0] || null;
    const s = ctx.stats(state.enriched || []);
    return '<div class="hub-desktop-shell">' + _sidebar('고객관리') +
      '<main class="hp-main"><div class="hp-header"><h2>고객관리</h2><div class="hp-search"><i class="ph-duotone ph-magnifying-glass" aria-hidden="true"></i><input id="ch-search" placeholder="이름·연락처·태그 검색" value="' + _esc(state.searchKW) + '"></div><button class="pc-add-btn" data-act="toggle-add">+ 고객 추가</button></div>' +
      '<div class="hp-stats hp-stats--four"><div class="hub-stat-mini"><div class="lbl">전체 고객</div><div class="val">' + s.total + '명</div></div><div class="hub-stat-mini"><div class="lbl">이번달 신규</div><div class="val">' + s.newThisMonth + '명</div></div><div class="hub-stat-mini"><div class="lbl">회원권 보유</div><div class="val">' + s.member + '명</div></div><div class="hub-stat-mini"><div class="lbl">이탈 위험</div><div class="val danger">' + s.risk + '명</div></div></div>' +
      _customerFilterChips(state, ctx.classify, ctx.stats) +
      (state.addPanelOpen ? '<div class="ch-add-panel hp-add-panel"><input class="hub-input" data-field="name" placeholder="이름" list="ac-customer_name"><input class="hub-input" data-field="phone" placeholder="연락처"><input class="hub-input" data-field="memo" placeholder="메모·태그"><button class="hub-btn-add" data-act="add-customer">추가</button></div>' : '') +
      '<div class="hp-two-col"><section class="hp-list"><div class="pc-list-head"><div class="pc-list-title">고객 목록</div><div class="pc-list-meta">' + rows.length + '명 · 최근 방문순</div></div>' + (rows.length ? rows.map(c => _customerRow(c, selected && selected.id, ctx.classify)).join('') : '<div class="hub-empty"><div class="hub-empty-title">해당 고객이 없어요</div></div>') + '</section>' +
      _customerDetail(selected, ctx.classify) + '</div></main></div>';
  }

  function _sidebar(active) {
    const items = ['예약관리', '매출관리', '고객관리', '재고관리'];
    return '<aside class="hp-sidebar"><div class="sb-logo">잇데이</div><div class="sb-section-label">운영</div>' +
      items.map(name => '<div class="sb-item' + (name === active ? ' active' : '') + '"><span class="sb-icon"></span><span class="sb-label">' + name + '</span>' + (name === '재고관리' ? '<span class="sb-badge" data-inv-low-badge style="display:none">0</span>' : '') + '</div>').join('') +
      '<button class="sb-fab-bottom">+ 빠른 추가</button></aside>';
  }

  function _invStatsCards(stats) {
    return '<div class="hp-stats hp-stats--four"><div class="hub-stat-mini"><div class="lbl">전체 재고</div><div class="val">' + stats.total + '개</div></div><div class="hub-stat-mini"><div class="lbl">부족</div><div class="val danger">' + stats.low + '개</div></div><div class="hub-stat-mini"><div class="lbl">정상</div><div class="val green">' + stats.ok + '개</div></div><div class="hub-stat-mini"><div class="lbl">평균 입고 주기</div><div class="val">14일</div></div></div>';
  }

  function _invRow(r, ctx, low) {
    if (String(ctx.state.editingId || '') === String(r.id)) return _invEditRow(r, low);
    const forecast = ctx.forecast(r);
    const cls = low ? ' low' : '';
    const lastIn = r.last_received_at || r.last_received_date;
    return '<div class="hp-inv-row' + cls + '">' +
      '<div class="hp-inv-cell"><span class="pc-inv-name">' + _esc(r.name) + '</span>' + (low ? '<span class="inv-low-badge">부족</span>' : '') + '</div>' +
      '<div class="hp-inv-cell"><span class="pc-inv-qty-val' + (low ? ' low' : '') + '">' + ctx.fmtQty(r) + _esc(r.unit || '') + '</span></div>' +
      '<div class="hp-inv-cell"><span class="pc-inv-thresh">' + ctx.fmtNum(r.threshold, r.decimal_places) + _esc(r.unit || '') + '</span></div>' +
      '<div class="hp-inv-cell">' + (low ? '<span class="inv-forecast">' + forecast + '일 후 소진 예상</span>' : '<span class="pc-inv-last">' + (lastIn ? _dateShort(lastIn) : '-') + '</span>') + '</div>' +
      '<div class="hp-inv-cell"><span class="stepper"><button class="stepper-btn" data-act="step" data-id="' + _esc(r.id) + '" data-delta="-1">−</button><span class="stepper-val' + (low ? ' low' : '') + '">' + ctx.fmtQty(r) + '</span><button class="stepper-btn" data-act="step" data-id="' + _esc(r.id) + '" data-delta="1">+</button></span></div>' +
      '<div class="hp-inv-cell"><button class="inv-edit" data-act="edit" data-id="' + _esc(r.id) + '"><i class="ph-duotone ph-pencil-simple" aria-hidden="true"></i></button></div></div>';
  }

  function _invEditRow(r, low) {
    return '<div class="hp-inv-edit-row editing' + (low ? ' low' : '') + '" data-id="' + _esc(r.id) + '">' +
      '<input class="rh-edit-input" data-ef="name" value="' + _esc(r.name || '') + '" placeholder="품목">' +
      '<input class="rh-edit-input" data-ef="quantity" value="' + _esc(r.quantity || 0) + '" type="number" step="0.1" placeholder="수량">' +
      '<input class="rh-edit-input" data-ef="unit" value="' + _esc(r.unit || '개') + '" placeholder="단위">' +
      '<input class="rh-edit-input" data-ef="threshold" value="' + _esc(r.threshold || 0) + '" type="number" step="0.1" placeholder="임계">' +
      '<input class="rh-edit-input" data-ef="decimal_places" value="' + _esc(r.decimal_places ?? 1) + '" type="number" min="0" max="3" placeholder="자리">' +
      '<input class="rh-edit-input" data-ef="category" value="' + _esc(r.category || '') + '" placeholder="분류">' +
      '<button class="rh-edit-cancel" data-act="edit-cancel">취소</button><button class="rh-edit-save" data-act="edit-save" data-id="' + _esc(r.id) + '">저장</button></div>';
  }

  function _inventoryTable(title, rows, ctx, low) {
    if (!rows.length && low) return '';
    const cls = low ? ' danger' : '';
    const meta = low ? '자동 주문 가능' : rows.length + '개';
    return '<section class="hp-inv-section' + cls + '"><div class="pc-sec-head"><div class="pc-sec-title' + cls + '">' + title + '</div><div class="pc-sec-meta">' + meta + '</div></div>' +
      '<div class="hp-inv-table"><div class="hp-inv-th">품목명</div><div class="hp-inv-th">현재 수량</div><div class="hp-inv-th">임계치</div><div class="hp-inv-th">' + (low ? '소진 예상' : '마지막 입고') + '</div><div class="hp-inv-th">조정</div><div class="hp-inv-th">수정</div>' +
      (rows.length ? rows.map(r => _invRow(r, ctx, low)).join('') : '<div class="hub-empty hp-table-empty"><div class="hub-empty-title">정상 재고가 없어요</div></div>') + '</div></section>';
  }

  function inventory(ctx) {
    const state = ctx.state;
    const parts = ctx.partition(state.rows || []);
    const stats = ctx.stats();
    return '<div class="hub-desktop-shell">' + _sidebar('재고관리') +
      '<main class="hp-main"><div class="hp-header"><h2>재고관리</h2><div class="hp-search"><i class="ph-duotone ph-magnifying-glass" aria-hidden="true"></i><input id="ih-search" placeholder="재고 검색" value="' + _esc(state.searchKW) + '"></div><button class="pc-ocr-btn" data-act="ocr">가격표 OCR</button><button class="pc-add-btn" data-act="focus-add">+ 재고 추가</button></div>' +
      _invStatsCards(stats) +
      '<div class="hub-qadd hub-qadd--desktop"><input class="hub-input" data-field="name" placeholder="품목명" list="ac-item_name"><input class="hub-input" data-field="quantity" placeholder="수량" type="number" step="0.1"><input class="hub-input" data-field="unit" placeholder="단위" value="개"><input class="hub-input" data-field="threshold" placeholder="임계치" type="number" step="0.1" value="3"><input class="hub-input" data-field="category" placeholder="분류" list="ac-inv_category"><button class="hub-btn-add" data-act="add">추가</button></div>' +
      _inventoryTable('부족한 재고', parts.low, ctx, true) +
      _inventoryTable('정상 재고', parts.ok, ctx, false) + '</main></div>';
  }

  window.HubPrototypeRender = { customer, inventory };
})();
