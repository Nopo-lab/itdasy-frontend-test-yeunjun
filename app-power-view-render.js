/* ─────────────────────────────────────────────────────────────
   파워뷰 렌더 레이어 (P2.5-rev1) — app-power-view.js 에서 분리
   app-power-view.js 로드 후 실행 (window._PVState, window._PVInt 필요)
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // ── 스켈레톤 ────────────────────────────────────────────
  function _skeletonRows(cols, n = 6) {
    return Array.from({ length: n }).map(() => `
      <tr class="pv-skeleton-row">
        ${Array.from({ length: cols }).map((_,i) => `<td><span class="pv-sk" style="width:${[70,90,60,80,75][i%5]}%"></span></td>`).join('')}
      </tr>`).join('');
  }

  // ── 검색 필터 ────────────────────────────────────────────
  function _applySearch(list, schema) {
    const kw = window._PVState.searchKW;
    if (!kw) return list;
    return list.filter(r => schema.search(r, kw.toLowerCase()));
  }

  // ── pending 행 사람 친화 포맷 ────────────────────────────
  function _formatPendingRow(p) {
    if (!p) return '';
    const { esc, krw } = window._PVInt;
    const tab = window._PVState.currentTab;
    switch (tab) {
      case 'customer':
        return `<strong>${esc(p.name || '')}</strong>` +
          (p.phone ? ` · <span style="color:var(--text-muted);">${esc(p.phone)}</span>` : '') +
          (p.memo ? ` · <span style="color:#888;">${esc(String(p.memo).slice(0, 30))}</span>` : '');
      case 'booking': {
        const t = (p.starts_at || '').replace('T', ' ').slice(0, 16);
        return `<strong>${esc(p.customer_name || '고객 없음')}</strong>` +
          (p.service_name ? ` · ${esc(p.service_name)}` : '') +
          (t ? ` · <span style="color:var(--text-muted);">${esc(t)}</span>` : '');
      }
      case 'revenue':
        return `<strong>${krw(p.amount)}</strong>` +
          (p.method ? ` · <span style="padding:1px 7px;border-radius:100px;background:#FEF4F5;color:var(--brand-strong);font-size:10.5px;font-weight:700;">${esc(p.method)}</span>` : '') +
          (p.service_name ? ` · ${esc(p.service_name)}` : '') +
          (p.customer_name ? ` · <span style="color:#888;">${esc(p.customer_name)}</span>` : '');
      case 'inventory':
        return `<strong>${esc(p.name)}</strong> · <span style="color:var(--text-muted);">${p.quantity}${esc(p.unit || '개')}</span>` +
          (p.category ? ` · <span style="color:#888;font-size:11px;">${esc(p.category)}</span>` : '');
      case 'nps':
        return `<strong style="color:#E6A100;">★${p.rating}</strong>` +
          (p.comment ? ` · <span style="color:var(--text-muted);">${esc(String(p.comment).slice(0, 40))}</span>` : '');
      case 'service':
        return `<strong>${esc(p.name)}</strong>` +
          (p.default_price ? ` · ${krw(p.default_price)}` : '') +
          (p.default_duration_min ? ` · ${p.default_duration_min}분` : '') +
          (p.category ? ` · <span style="color:#888;font-size:11px;">${esc(p.category)}</span>` : '');
      default:
        return esc(JSON.stringify(p).slice(0, 80));
    }
  }

  // ── 자동완성 소스 ─────────────────────────────────────
  // service_name 풀: 업종별 기본 풀 + 사용자 데이터 (중복 제거)
  // 2026-05-08: customer_name 정렬 — 단골(is_regular) 먼저, 다음 visit_count 내림차순
  function _buildAutoSources() {
    const data = window._PVState.data;
    const shopServicePool = _getShopServicePool();
    const out = {
      customer_name: [], service_name: [...shopServicePool], method: ['card','cash','transfer','etc'],
      item_name: [], inv_category: ['nail','hair','lash','skin','wax','tattoo','hair_extension','etc'],
      svc_category: ['hair','nail','eye','lash','skin','wax','tattoo','hair_extension','etc'],
    };
    const seen = {
      customer_name: new Set(),
      service_name: new Set(shopServicePool),
      item_name: new Set(),
    };
    // 단골 + 방문 횟수 우선 정렬 — 사장님이 자주 부르는 손님 dropdown 상단에
    const sortedCustomers = (data.customer || []).slice().sort((a, b) => {
      const ar = a.is_regular ? 1 : 0;
      const br = b.is_regular ? 1 : 0;
      if (ar !== br) return br - ar;
      return (b.visit_count || 0) - (a.visit_count || 0);
    });
    sortedCustomers.forEach(c => {
      if (c.name && !seen.customer_name.has(c.name)) { seen.customer_name.add(c.name); out.customer_name.push(c.name); }
    });
    (data.revenue || []).forEach(r => {
      if (r.customer_name && !seen.customer_name.has(r.customer_name)) { seen.customer_name.add(r.customer_name); out.customer_name.push(r.customer_name); }
      if (r.service_name && !seen.service_name.has(r.service_name)) { seen.service_name.add(r.service_name); out.service_name.push(r.service_name); }
    });
    (data.booking || []).forEach(b => {
      if (b.customer_name && !seen.customer_name.has(b.customer_name)) { seen.customer_name.add(b.customer_name); out.customer_name.push(b.customer_name); }
      if (b.service_name && !seen.service_name.has(b.service_name)) { seen.service_name.add(b.service_name); out.service_name.push(b.service_name); }
    });
    (data.service || []).forEach(s => {
      if (s.name && !seen.service_name.has(s.name)) { seen.service_name.add(s.name); out.service_name.push(s.name); }
    });
    (data.inventory || []).forEach(i => {
      if (i.name && !seen.item_name.has(i.name)) { seen.item_name.add(i.name); out.item_name.push(i.name); }
    });
    Object.keys(out).forEach(k => { if (out[k].length > 100) out[k] = out[k].slice(0, 100); });
    return out;
  }

  // ── 배치 입력 수집 / 초기화 ───────────────────────────
  function _collectQaddValues() {
    const { SCHEMAS } = window._PVInt;
    const schema = SCHEMAS[window._PVState.currentTab];
    const inputs = document.querySelectorAll('#power-view-overlay .pv-qadd [data-field]');
    const v = {}; let missing = null;
    inputs.forEach(i => { v[i.getAttribute('data-field')] = i.value; });
    schema.qadd.fields.forEach(f => { if (f.required && !v[f.name]?.trim()) missing = f.name; });
    return { values: v, missing, schema, inputs };
  }

  function _resetInputs(inputs, schema) {
    inputs.forEach(i => {
      const f = schema.qadd.fields.find(x => x.name === i.getAttribute('data-field'));
      i.value = (f && f.default !== undefined) ? f.default : '';
    });
    const first = inputs[0];
    if (first) first.focus();
  }

  // ── 업종별 시술명 풀 (shop_type 기준) ───────────────
  // shop_type 한글 키 — `localStorage.setItem('shop_type', ...)` 에서 저장됨
  // 기본값: 붙임머리 (잇데이 주력 업종)
  const SHOP_SERVICE_POOL = {
    '붙임머리': ['18인치', '20인치', '22인치', '24인치', '26인치', '28인치', '30인치', '특수인치', '옴브레', '재시술'],
    '네일':     ['젤네일', '아트네일', '아크릴', '스컬프처', '네일케어', '오프', '재시술', '페디큐어', '프렌치', '원톤'],
    '네일아트': ['젤네일', '아트네일', '아크릴', '스컬프처', '네일케어', '오프', '재시술', '페디큐어', '프렌치', '원톤'],
    '속눈썹':   ['클래식 연장', '볼륨 연장', '리터치', '제거', '래쉬리프트', '속눈썹펌'],
    '피부':     ['기본 관리', '필링', '마사지', '팩', '앰플 케어'],
    '헤어':     ['커트', '펌', '염색', '매직', '드라이', '클리닉'],
  };

  // shop_type 기준으로 시술명 풀 가져오기 (Task 6 — 업종별 필터)
  function _getShopServicePool() {
    const t = (typeof window.user_shop_type === 'string' && window.user_shop_type)
      || localStorage.getItem('shop_type')
      || '붙임머리';
    return SHOP_SERVICE_POOL[t] || SHOP_SERVICE_POOL['붙임머리'];
  }

  // ── 배치 쌓기 ─────────────────────────────────────────
  function _stackRow() {
    const state = window._PVState;
    const { values, missing, schema, inputs } = _collectQaddValues();
    if (missing) {
      if (window.showToast) window.showToast(`필수: ${missing}`);
      const el = document.querySelector(`#power-view-overlay .pv-qadd input[data-field="${missing}"]`);
      if (el) el.focus();
      return;
    }
    let body;
    try { body = schema.qadd.build(values); } catch (e) {
      if (window.showToast) window.showToast('형식 오류: ' + (window._humanError ? window._humanError(e) : e.message)); return;
    }
    state.pending[state.currentTab].push(body);
    if (window.hapticLight) window.hapticLight();
    _resetInputs(inputs, schema);
    _renderTab(true);
  }

  // ── 엑셀 AI 임포트 트리거 ─────────────────────────────
  async function _handleExcelFile(file) {
    if (!file) return;
    const state = window._PVState;
    const { fetchTab } = window._PVInt;
    const kindMap = { customer: 'customer', booking: 'booking', revenue: 'revenue' };
    const kind = kindMap[state.currentTab];
    if (!kind) {
      if (window.showToast) window.showToast('이 탭은 엑셀 임포트 미지원 (고객/예약/매출만 가능)');
      return;
    }
    if (window.ImportWizard && typeof window.ImportWizard.open === 'function') {
      window.ImportWizard.open({
        file, kind,
        onDone: async () => {
          state.data[state.currentTab] = await fetchTab(state.currentTab);
          await _renderTab(true);
          if (window.Dashboard?.refresh) window.Dashboard.refresh(true);
        },
      });
    } else {
      if (window.showToast) window.showToast('임포트 위저드 스크립트 미로드');
    }
  }

  // ── 탭 콘텐츠 렌더 ────────────────────────────────────
  async function _renderTab(skipFetch) {
    const state = window._PVState;
    const { SCHEMAS, esc: _esc, krw: _krw, fetchTab } = window._PVInt;
    const body = document.getElementById('pv-body');
    if (!body) return;
    const schema = SCHEMAS[state.currentTab];

    if (!skipFetch) {
      body.innerHTML = `
        <div class="pv-qadd">${schema.qadd.fields.map(() => `<span class="pv-sk" style="height:42px;width:120px;border-radius:10px;"></span>`).join('')}</div>
        <div class="pv-list"><table class="pv-table"><thead><tr>${schema.headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${_skeletonRows(schema.headers.length)}</tbody></table></div>
      `;
      state.data[state.currentTab] = await fetchTab(state.currentTab);
    }

    // 검색 → 필터 → 정렬 순으로 변환 (Phase 1 Tier A · 2026-05-09)
    // Phase 2 추가: 페이지네이션 (>800행)
    // 모듈들 미로드되도 안전하게 fall-through (기존 동작 유지)
    let list = _applySearch(state.data[state.currentTab] || [], schema);
    try {
      if (window._PVSort && typeof window._PVSort.apply === 'function') {
        list = window._PVSort.apply(list, state.currentTab);
      }
    } catch (_e) { /* sort/filter 실패해도 검색만 적용된 list 사용 */ }
    const fullList = list; // totals/export/clipboard 용 — 페이지 절단 전
    // Phase 3: 그룹화 (선택 시 그룹 헤더 행이 list 안에 끼어들어감)
    try {
      if (window._PVGroup && typeof window._PVGroup.applyGrouping === 'function') {
        list = window._PVGroup.applyGrouping(list, state.currentTab);
      }
    } catch (_e) { /* silent */ }
    try {
      if (window._PVPagination && typeof window._PVPagination.slice === 'function') {
        list = window._PVPagination.slice(list, state.currentTab);
      }
    } catch (_e) { /* silent */ }
    const qadd = schema.qadd;
    const autoSource = _buildAutoSources();
    const fieldsHtml = qadd.fields.map(f => {
      // select 타입 (결제수단·카테고리 등) — Task 5
      if (f.type === 'select' && Array.isArray(f.options)) {
        const opts = f.options.map(o => {
          const sel = (f.default !== undefined && String(f.default) === String(o.value)) ? ' selected' : '';
          return `<option value="${_esc(o.value)}"${sel}>${_esc(o.label)}</option>`;
        }).join('');
        return `
        <select class="pv-input"
          data-field="${f.name}"
          style="flex:${f.flex};padding:11px 10px;border:1.5px solid hsl(350, 60%, 88%);border-radius:14px;font-size:13px;background:#fff;cursor:pointer;"
        >${opts}</select>`;
      }
      const listId = f.auto ? `pv-dl-${f.auto}` : '';
      return `
      <input class="pv-input"
        data-field="${f.name}"
        type="${f.type || 'text'}"
        placeholder="${_esc(f.placeholder)}"
        ${f.default !== undefined ? `value="${f.default}"` : ''}
        ${listId ? `list="${listId}"` : ''}
        style="flex:${f.flex};"
      />`;
    }).join('');
    const datalistHtml = Object.entries(autoSource).map(([key, items]) => `
      <datalist id="pv-dl-${key}">${items.map(v => `<option value="${_esc(v)}"></option>`).join('')}</datalist>
    `).join('');

    const editMode = !!state.editMode;
    // 주액션 노출 여부에 따라 액션 컬럼 폭 조정 (UX 원칙 2·6)
    const hasPrimary = !editMode && window._PVActions && typeof window._PVActions.getPrimaryActions === 'function';
    const actionColWidth = editMode ? 88 : (hasPrimary ? 124 : 78);
    // 다중 선택 체크박스 — 비편집 모드 + _PVSelect 로드 시에만 (Phase 1 Tier B)
    const showSelect = !editMode && !!window._PVSelect;
    const selectColHeader = showSelect ? `<th style="width:36px;text-align:center;"><input type="checkbox" data-pv-select-all aria-label="전체 선택" style="width:16px;height:16px;cursor:pointer;accent-color:var(--brand,var(--brand));" /></th>` : '';
    // 헤더에 정렬 가능 컬럼이면 data-pv-sort + 화살표 추가 (Phase 1 Tier A)
    const headers = selectColHeader + schema.headers.map((h, idx) => {
      let sortKey = null;
      try {
        if (window._PVSort && typeof window._PVSort.getSortKey === 'function') {
          sortKey = window._PVSort.getSortKey(state.currentTab, idx);
        }
      } catch (_e) { /* silent */ }
      if (!sortKey) return `<th>${_esc(h)}</th>`;
      let arrow = '';
      try {
        if (window._PVSort && typeof window._PVSort.renderHeaderArrow === 'function') {
          arrow = window._PVSort.renderHeaderArrow(state.currentTab, idx);
        }
      } catch (_e) { /* silent */ }
      return `<th data-pv-sort="${_esc(sortKey)}" tabindex="0" role="button">${_esc(h)}${arrow}</th>`;
    }).join('') + `<th style="width:${actionColWidth}px;"></th>`;
    const totalCols = schema.headers.length + 1 + (showSelect ? 1 : 0);
    const rowsHtml = list.map(r => {
      // Phase 3: 그룹 헤더 행 (단순 정보 행)
      if (r && r.__group) {
        try {
          if (window._PVGroup && typeof window._PVGroup.groupHeaderRow === 'function') {
            return window._PVGroup.groupHeaderRow(r, totalCols);
          }
        } catch (_e) { /* silent */ }
        return '';
      }
      if (editMode && Array.isArray(schema.editFields)) {
        const editCells = schema.editFields.map(f => {
          if (f.readonly) {
            const txt = typeof f.format === 'function' ? f.format(r) : (r[f.key] == null ? '—' : String(r[f.key]));
            return `<td><span style="color:#888;font-size:12px;">${_esc(txt)}</span></td>`;
          }
          const raw = r[f.key];
          const shown = typeof f.transform === 'function' ? f.transform(raw) : (raw == null ? '' : String(raw));
          const ph = f.placeholder ? ` placeholder="${_esc(f.placeholder)}"` : '';
          if (f.type === 'checkbox') {
            const ck = !!raw ? ' checked' : '';
            return `<td style="text-align:center;"><input data-pv-edit="${r.id}:${f.key}" data-pv-edit-type="checkbox" type="checkbox"${ck} style="width:18px;height:18px;cursor:pointer;accent-color:var(--brand);" /></td>`;
          }
          return `<td><input data-pv-edit="${r.id}:${f.key}" data-pv-edit-type="${f.type || 'text'}" type="${f.type || 'text'}" value="${_esc(shown)}"${ph} style="width:100%;padding:7px 9px;border:1.5px solid hsl(350, 60%, 88%);border-radius:10px;font-size:12.5px;background:#fff;box-sizing:border-box;" /></td>`;
        }).join('');
        const actionCell = `<td style="text-align:right;white-space:nowrap;">
          <button data-pv-row-save="${r.id}" aria-label="저장" title="저장" style="border:none;background:linear-gradient(135deg, hsl(350, 75%, 72%), hsl(350, 70%, 60%));color:#fff;cursor:pointer;padding:6px 9px;border-radius:10px;margin-right:4px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;"><i class="ph-duotone ph-floppy-disk" aria-hidden="true"></i></button>
          <button data-pv-row-delete="${r.id}" aria-label="삭제" title="삭제" style="border:1.5px solid #f0c0c0;background:#fff;color:#C62828;cursor:pointer;padding:5px 8px;border-radius:10px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;"><i class="ph-duotone ph-trash" aria-hidden="true"></i></button>
        </td>`;
        return `<tr data-id="${r.id}" class="pv-row-editing">${editCells}${actionCell}</tr>`;
      }
      const cells = schema.row(r).map(c => `<td>${c}</td>`).join('');
      // 다중 선택 체크박스 셀 (Tier B — _PVSelect 로드 시)
      const selectCell = showSelect ? `<td style="text-align:center;"><input type="checkbox" data-pv-select aria-label="선택" style="width:16px;height:16px;cursor:pointer;accent-color:var(--brand,var(--brand));" /></td>` : '';
      // 행 끝: 주액션 (UX 원칙 2·6) + ⚡ 기타 메뉴 + 수정
      let primaryHtml = '';
      try {
        if (hasPrimary && typeof window._PVActions.renderPrimaryButtons === 'function') {
          primaryHtml = window._PVActions.renderPrimaryButtons(state.currentTab, r) || '';
        }
      } catch (_e) { /* silent */ }
      // 행 단위 상태 표시 cell (UX 원칙 5: loading/success/error)
      const statusCell = `<span class="pv-row-status" aria-hidden="true">
        <svg class="pv-row-status__loading" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        <i class="ph-duotone ph-check pv-row-status__success" style="font-size:13px" aria-hidden="true"></i>
        <svg class="pv-row-status__error" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      </span>`;
      const actionCell = `<td style="text-align:right;white-space:nowrap;">
        ${statusCell}
        ${primaryHtml}
        <button class="pv-actions-trigger" data-pv-actions-trigger data-row-id="${r.id}" aria-label="기타 액션" title="기타 액션">
          <i class="ph-duotone ph-dots-three" aria-hidden="true"></i>
        </button>
        <button class="pv-row-edit" data-edit-id="${r.id}" aria-label="수정" title="수정" style="border:none;background:transparent;cursor:pointer;color:#888;padding:4px 8px;border-radius:6px;transition:all 0.12s;display:inline-flex;align-items:center;justify-content:center;"><i class="ph-duotone ph-pencil-simple" aria-hidden="true"></i></button>
      </td>`;
      // Phase 2: 조건부 포맷 클래스 (선택 행 클래스와 공존)
      let fmtCls = '';
      try {
        if (window._PVFormat && typeof window._PVFormat.rowClasses === 'function') {
          fmtCls = window._PVFormat.rowClasses(state.currentTab, r) || '';
        }
      } catch (_e) { /* silent */ }
      const trClass = fmtCls ? ` class="${fmtCls}"` : '';
      return `<tr${trClass} data-id="${r.id}">${selectCell}${cells}${actionCell}</tr>`;
    }).join('');

    const pendingList = state.pending[state.currentTab] || [];
    const pendingHtml = pendingList.length ? `
      <div style="padding:12px 16px;background:#FFFBEB;border-bottom:1px solid #FFE58F;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div style="font-size:12px;font-weight:800;color:#B45309;">쌓아둔 행 ${pendingList.length}개</div>
          <div style="display:flex;gap:6px;">
            <button id="pv-batch-clear" style="padding:6px 10px;font-size:11px;border:1px solid #EAB308;background:#fff;color:#B45309;border-radius:7px;cursor:pointer;font-weight:700;">비우기</button>
            <button id="pv-batch-save" style="padding:6px 12px;font-size:11.5px;border:none;background:linear-gradient(135deg,var(--brand),var(--brand-strong));color:#fff;border-radius:7px;cursor:pointer;font-weight:800;box-shadow:0 2px 6px rgba(241,128,145,0.3);">⚡ ${pendingList.length}개 한 번에 저장</button>
          </div>
        </div>
        <div style="font-size:12px;color:#333;line-height:1.65;max-height:120px;overflow:auto;display:flex;flex-direction:column;gap:4px;">
          ${pendingList.map((p, i) => `
            <div style="display:flex;gap:8px;padding:5px 8px;background:#fff;border:1px solid #FDE68A;border-radius:8px;align-items:center;">
              <span style="color:#B45309;font-weight:800;min-width:18px;">${i+1}.</span>
              <span style="flex:1;min-width:0;">${_formatPendingRow(p)}</span>
              <button data-pv-pend-del="${i}" title="제거" style="border:none;background:transparent;color:#C62828;cursor:pointer;font-size:13px;padding:2px 6px;border-radius:4px;">✕</button>
            </div>
          `).join('')}
        </div>
      </div>` : '';

    const emptyHtml = !rowsHtml ? `
      <tr><td colspan="${schema.headers.length + 1 + (showSelect ? 1 : 0)}">
        <div class="pv-empty">
          <div class="pv-empty-icon">${schema.empty.icon}</div>
          <div style="font-weight:800;color:#555;margin-bottom:6px;">${state.searchKW ? '검색 결과가 없어요' : schema.empty.title}</div>
          <div style="font-size:12px;color:var(--text-subtle);">${state.searchKW ? `"${_esc(state.searchKW)}" 에 해당하는 ${schema.empty.title.replace(' 없어요','').replace('아직 ','')} 없음` : schema.empty.desc}</div>
        </div>
      </td></tr>` : '';

    const reportBannerHtml = state.currentTab === 'revenue' ? `
      <button onclick="if(typeof openRevenueReport==='function')openRevenueReport()" style="display:flex;align-items:center;gap:8px;width:100%;padding:11px 16px;margin-bottom:4px;background:#FEF4F5;border:none;border-radius:12px;cursor:pointer;font-size:13px;font-weight:700;color:var(--brand-strong);text-align:left;transition:background 0.15s;" onmouseover="this.style.background='#FDE8EB'" onmouseout="this.style.background='#FEF4F5'">
        <i class="ph-duotone ph-chart-bar" aria-hidden="true"></i>
        상세 리포트
        <i class="ph-duotone ph-caret-right" aria-hidden="true"></i>
      </button>` : '';

    body.innerHTML = `
      ${datalistHtml}
      ${reportBannerHtml}
      <div class="pv-qadd" data-voice-root>
        ${fieldsHtml}
        <button class="pv-btn-stack" id="pv-stack-btn" title="목록에 쌓아두고 나중에 일괄 저장" style="padding:11px 12px;background:#fff;border:1.5px solid var(--brand);color:var(--brand-strong);border-radius:10px;font-weight:800;font-size:12.5px;cursor:pointer;white-space:nowrap;flex-shrink:0;transition:all 0.15s;">⊕ 쌓기</button>
        <button class="pv-btn-add" id="pv-add-btn">즉시 추가 <span class="pv-kbd">↵</span></button>
      </div>
      ${pendingHtml}
      <div class="pv-toolbar">
        <div style="position:relative;flex:1;max-width:280px;">
          <i class="ph-duotone ph-magnifying-glass" aria-hidden="true"></i>
          <input class="pv-search" id="pv-search" data-no-voice placeholder="검색 (⌘K)" value="${_esc(state.searchKW)}" style="padding-left:32px;padding-right:${state.searchKW ? '32px' : '12px'};" />
          ${state.searchKW ? `<button id="pv-search-clear" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);border:none;background:transparent;cursor:pointer;padding:2px;color:var(--text-subtle);" aria-label="검색 지우기"><i class="ph-duotone ph-x" aria-hidden="true"></i></button>` : ''}
        </div>
        <label class="pv-excel" for="pv-excel-file" title="엑셀/CSV AI 임포트">
          엑셀 불러오기
          <input type="file" id="pv-excel-file" accept=".xlsx,.xls,.csv" hidden />
        </label>
        ${window._PVExport ? `<button type="button" id="pv-export-btn" class="pv-export-btn" title="현재 보이는 행 CSV 내려받기">
          <i class="ph-duotone ph-download-simple" aria-hidden="true"></i>
          내보내기
        </button>` : ''}
        ${(() => {
          // Phase 3: 음성 입력 버튼 — Web Speech API 지원 시
          try {
            if (window._PVVoice && typeof window._PVVoice.button === 'function') {
              return window._PVVoice.button() || '';
            }
          } catch (_e) { /* silent */ }
          return '';
        })()}
      </div>
      ${(() => {
        // 필터 칩 행 (Phase 1 Tier A · 2026-05-09) — _PVSort 미로드 시 빈 문자열로 fall-through
        try {
          if (window._PVSort && typeof window._PVSort.renderFilterChips === 'function') {
            return window._PVSort.renderFilterChips(state.currentTab) || '';
          }
        } catch (_e) { /* silent */ }
        return '';
      })()}
      ${(() => {
        // Phase 3: 그룹 칩 — _PVGroup 미로드 시 빈 문자열
        try {
          if (window._PVGroup && typeof window._PVGroup.renderToggle === 'function') {
            return window._PVGroup.renderToggle(state.currentTab) || '';
          }
        } catch (_e) { /* silent */ }
        return '';
      })()}
      ${(() => {
        // Phase 3: KPI 칩 (formula presets) — fullList 기준
        try {
          if (window._PVFormula && typeof window._PVFormula.renderPresetChips === 'function') {
            return window._PVFormula.renderPresetChips(state.currentTab, fullList) || '';
          }
        } catch (_e) { /* silent */ }
        return '';
      })()}
      <div class="pv-list">
        <table class="pv-table">
          <thead><tr>${headers}</tr></thead>
          <tbody id="pv-tbody">${rowsHtml}${emptyHtml}</tbody>
        </table>
      </div>
      ${(() => {
        // Phase 2: 페이지네이션 (>800행) — 모듈 미로드 시 빈 문자열
        try {
          if (window._PVPagination && typeof window._PVPagination.renderMore === 'function') {
            return window._PVPagination.renderMore(fullList, state.currentTab) || '';
          }
        } catch (_e) { /* silent */ }
        return '';
      })()}
      ${(() => {
        // Phase 2: 자동 합계행 + Phase 4: 운영 분석 버튼 + 유료 quota 칩
        try {
          let totals = '';
          if (window._PVTotals && typeof window._PVTotals.render === 'function') {
            totals = window._PVTotals.render(state.currentTab, fullList) || '';
          }
          let opsBtn = '';
          if (state.currentTab === 'revenue' && window._PVOps && typeof window._PVOps.button === 'function') {
            opsBtn = window._PVOps.button();
          }
          let quota = '';
          if (window._PVQuota && typeof window._PVQuota.chip === 'function') {
            quota = window._PVQuota.chip(state.currentTab, fullList);
          }
          if (totals && (opsBtn || quota)) {
            return totals.replace('</div>', `<div class="pv-totals__extra">${quota}${opsBtn}</div></div>`);
          }
          return totals || (opsBtn || quota ? `<div class="pv-totals"><div class="pv-totals__extra">${quota}${opsBtn}</div></div>` : '');
        } catch (_e) { /* silent */ }
        return '';
      })()}
      <div class="pv-footer">
        <div><span class="pv-count">${list.length}</span><span style="color:var(--text-subtle)"> / 총 ${(state.data[state.currentTab] || []).length}건</span></div>
        <div class="pv-hotkeys">단축: <kbd>Enter</kbd> 즉시 · <kbd>Shift+Enter</kbd> 쌓기 · <kbd>⌘K</kbd> 검색 · <kbd>Esc</kbd> 닫기</div>
      </div>
    `;
    _bindBody();
    _focusFirstInput();

    // Phase 1/2 — 모든 신규 모듈 바인딩 (모듈 미로드 시 안전 skip)
    try {
      const bodyEl = document.getElementById('pv-body');
      if (bodyEl) {
        if (window._PVSort && typeof window._PVSort.bindHeaderClicks === 'function') {
          window._PVSort.bindHeaderClicks(bodyEl);
        }
        if (window._PVActions && typeof window._PVActions.bindRowTriggers === 'function') {
          window._PVActions.bindRowTriggers(bodyEl);
        }
        if (window._PVSelect && typeof window._PVSelect.bindRowCheckboxes === 'function') {
          window._PVSelect.bindRowCheckboxes(bodyEl);
        }
        if (window._PVPagination && typeof window._PVPagination.bind === 'function') {
          window._PVPagination.bind(bodyEl);
        }
        if (window._PVGroup && typeof window._PVGroup.bind === 'function') {
          window._PVGroup.bind(bodyEl);
        }
        if (window._PVVoice && typeof window._PVVoice.bind === 'function') {
          window._PVVoice.bind();
        }
        if (window._PVOps && typeof window._PVOps.bind === 'function') {
          window._PVOps.bind();
        }
        if (window._PVQuota && typeof window._PVQuota.bind === 'function') {
          window._PVQuota.bind();
        }
      }
      // Export 버튼 — 현재 보이는 list (필터·정렬 후) 기준 다운로드
      const exportBtn = document.getElementById('pv-export-btn');
      if (exportBtn && window._PVExport && typeof window._PVExport.downloadCSV === 'function') {
        exportBtn.addEventListener('click', () => {
          const tab = window._PVState && window._PVState.currentTab;
          if (!tab) return;
          // 필터·정렬·페이지절단 전체 fullList 와는 별개로, 다운로드는 'fullList' 기준
          // (사용자가 "내보내기" 누른 시점의 보이는 결과)
          // fullList 가 클로저 밖이므로 _PVState.data 와 _PVSort 으로 재계산
          let list = window._PVState.data[tab] || [];
          try {
            if (state.searchKW) list = list.filter((r) => state.currentTab && window._PVInt.SCHEMAS[tab].search(r, state.searchKW.toLowerCase()));
            if (window._PVSort && window._PVSort.apply) list = window._PVSort.apply(list, tab);
          } catch (_e) { /* silent */ }
          window._PVExport.downloadCSV(tab, list);
        });
      }
    } catch (e) {
      console.warn('[PowerView] phase1/2 bind failed', e);
    }
  }

  function _focusFirstInput() {
    requestAnimationFrame(() => {
      const first = document.querySelector('#power-view-overlay .pv-qadd input[data-field]');
      if (first) first.focus();
    });
  }

  // ── 이벤트 바인딩 ───────────────────────────────────────
  function _bindBody() {
    const state = window._PVState;
    const { submitQuickAdd, flushBatch, editRow, saveInlineRow, deleteInlineRow } = window._PVInt;

    const addBtn = document.getElementById('pv-add-btn');
    if (addBtn) addBtn.addEventListener('click', submitQuickAdd);
    const stackBtn = document.getElementById('pv-stack-btn');
    if (stackBtn) stackBtn.addEventListener('click', _stackRow);
    const batchSave = document.getElementById('pv-batch-save');
    if (batchSave) batchSave.addEventListener('click', flushBatch);
    const batchClear = document.getElementById('pv-batch-clear');
    if (batchClear) batchClear.addEventListener('click', () => { state.pending[state.currentTab] = []; _renderTab(true); });

    document.querySelectorAll('[data-pv-pend-del]').forEach(b => {
      b.addEventListener('click', () => {
        const idx = parseInt(b.getAttribute('data-pv-pend-del'), 10);
        if (!isNaN(idx)) { state.pending[state.currentTab].splice(idx, 1); _renderTab(true); }
      });
    });
    document.querySelectorAll('.pv-row-edit').forEach(b => {
      b.addEventListener('click', (e) => { e.stopPropagation(); editRow(b.getAttribute('data-edit-id')); });
    });

    // 편집 모드: 인라인 저장 / 삭제
    document.querySelectorAll('[data-pv-row-save]').forEach(b => {
      b.addEventListener('click', (e) => { e.stopPropagation(); saveInlineRow(b.getAttribute('data-pv-row-save')); });
    });
    document.querySelectorAll('[data-pv-row-delete]').forEach(b => {
      b.addEventListener('click', (e) => { e.stopPropagation(); deleteInlineRow(b.getAttribute('data-pv-row-delete')); });
    });
    // 편집 input 에서 Enter = 저장
    document.querySelectorAll('[data-pv-edit]').forEach(el => {
      el.addEventListener('keydown', (e) => {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          const id = el.getAttribute('data-pv-edit').split(':')[0];
          saveInlineRow(id);
        }
      });
    });

    // 관계형 뷰 — 고객 탭 행 클릭 시 고객 대시보드(매출·예약·NPS 통합) 오픈 (편집 모드 제외)
    if (state.currentTab === 'customer' && !state.editMode) {
      document.querySelectorAll('#pv-tbody tr[data-id]').forEach(tr => {
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', () => {
          const id = parseInt(tr.getAttribute('data-id'), 10);
          if (!id) return;
          if (window.hapticLight) window.hapticLight();
          if (typeof window.openCustomerDashboard === 'function') {
            window.openCustomerDashboard(id);
          }
        });
      });
    }
    document.querySelectorAll('#power-view-overlay .pv-qadd input, #power-view-overlay .pv-qadd select').forEach(el => {
      el.addEventListener('keydown', (e) => {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          if (e.shiftKey) _stackRow(); else submitQuickAdd();
        }
      });
    });

    const search = document.getElementById('pv-search');
    if (search) {
      let t;
      search.addEventListener('input', (e) => {
        clearTimeout(t);
        t = setTimeout(() => {
          state.searchKW = e.target.value.trim();
          _renderTab(true);
          setTimeout(() => {
            const s2 = document.getElementById('pv-search');
            if (s2) { s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); }
          }, 0);
        }, 180);
      });
    }
    const clearBtn = document.getElementById('pv-search-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => { state.searchKW = ''; _renderTab(true); });

    const { TABS } = window._PVInt;
    TABS.forEach(t => {
      const badge = document.querySelector(`[data-pv-tab-badge="${t.key}"]`);
      if (badge) {
        const n = (state.data[t.key] || []).length;
        badge.textContent = n > 99 ? '99+' : n;
        badge.style.display = n > 0 ? '' : 'none';
      }
    });
  }

  function _bindTabs() {
    const state = window._PVState;
    document.querySelectorAll('[data-pv-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-pv-tab');
        if (key === state.currentTab) return;
        state.currentTab = key;
        state.searchKW = '';
        document.querySelectorAll('[data-pv-tab]').forEach(b => {
          b.classList.toggle('chip--active', b.getAttribute('data-pv-tab') === key);
        });
        if (window.hapticLight) window.hapticLight();
        _renderTab();
      });
    });
    const aiBtn = document.getElementById('pv-ai-import-btn');
    if (aiBtn) {
      aiBtn.addEventListener('click', () => {
        const fi = document.createElement('input');
        fi.type = 'file'; fi.accept = '.csv,.xlsx,.xls'; fi.style.display = 'none';
        fi.addEventListener('change', (e) => { const f = e.target.files[0]; if (f) _handleExcelFile(f); fi.remove(); });
        document.body.appendChild(fi); fi.click();
      });
    }
  }

  // ── 홈 히어로 카드 렌더링 ─────────────────────────────
  function renderHomeHeroCard(brief) {
    if (!brief) return;
    const _esc = window._PVInt.esc;

    const rev = document.getElementById('heroMonthRevenue');
    const mom = document.getElementById('heroMomPct');
    const bookings = document.getElementById('heroTodayBookings');
    const risk = document.getElementById('heroRiskCount');

    if (rev) {
      const amount = brief.this_month_total || 0;
      rev.textContent = amount > 0
        ? (amount >= 10000 ? Math.round(amount / 10000) + '만원' : amount.toLocaleString('ko-KR') + '원')
        : '—';
    }
    if (mom) {
      const pct = brief.mom_delta_pct;
      mom.textContent = pct != null ? (pct >= 0 ? '+' + pct : String(pct)) + '%' : '—';
    }
    if (bookings) bookings.textContent = (brief.today_bookings || []).length + '건';
    if (risk) {
      const cnt = (brief.at_risk || []).length;
      risk.textContent = cnt > 0 ? cnt + '명' : '없음';
    }

    const schedEl = document.getElementById('homeTomorrowSched');
    const upcoming = brief.today_bookings || [];
    if (schedEl && upcoming.length > 0) {
      schedEl.style.display = '';
      schedEl.innerHTML = `
        <div class="sec-head" style="padding:0 2px;margin-bottom:10px;">
          <h2 class="home-sec-title">오늘 예약<span style="font-weight:500;font-size:12px;color:var(--text-subtle);margin-left:6px;">${upcoming.length}건</span></h2>
        </div>
        <div class="list-menu">
          ${upcoming.slice(0, 3).map(b => `
            <div class="list-menu__item">
              <div class="list-menu__icon-box list-menu__icon-box--neutral">
                <i class="ph-duotone ph-calendar-dots" aria-hidden="true"></i>
              </div>
              <div class="list-menu__body">
                <div class="list-menu__title">${_esc(b.customer_name || '예약')}</div>
                <div class="list-menu__sub">${_esc(b.service_name || '')}${b.time ? ' · ' + _esc(b.time) : ''}</div>
              </div>
              <div class="list-menu__right">
                <i class="ph-duotone ph-caret-right" aria-hidden="true"></i>
              </div>
            </div>`).join('')}
        </div>`;
    } else if (schedEl) {
      schedEl.style.display = 'none';
    }
  }

  window.renderHomeHeroCard = renderHomeHeroCard;

  window._PVRender = {
    renderTab: _renderTab,
    bindTabs: _bindTabs,
    stackRow: _stackRow,
    handleExcelFile: _handleExcelFile,
  };
})();
