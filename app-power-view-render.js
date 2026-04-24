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
          (p.phone ? ` · <span style="color:#666;">${esc(p.phone)}</span>` : '') +
          (p.memo ? ` · <span style="color:#888;">${esc(String(p.memo).slice(0, 30))}</span>` : '');
      case 'booking': {
        const t = (p.starts_at || '').replace('T', ' ').slice(0, 16);
        return `<strong>${esc(p.customer_name || '고객 없음')}</strong>` +
          (p.service_name ? ` · ${esc(p.service_name)}` : '') +
          (t ? ` · <span style="color:#666;">${esc(t)}</span>` : '');
      }
      case 'revenue':
        return `<strong>${krw(p.amount)}</strong>` +
          (p.method ? ` · <span style="padding:1px 7px;border-radius:100px;background:#FEF4F5;color:#D95F70;font-size:10.5px;font-weight:700;">${esc(p.method)}</span>` : '') +
          (p.service_name ? ` · ${esc(p.service_name)}` : '') +
          (p.customer_name ? ` · <span style="color:#888;">${esc(p.customer_name)}</span>` : '');
      case 'inventory':
        return `<strong>${esc(p.name)}</strong> · <span style="color:#666;">${p.quantity}${esc(p.unit || '개')}</span>` +
          (p.category ? ` · <span style="color:#888;font-size:11px;">${esc(p.category)}</span>` : '');
      case 'nps':
        return `<strong style="color:#E6A100;">★${p.rating}</strong>` +
          (p.comment ? ` · <span style="color:#666;">${esc(String(p.comment).slice(0, 40))}</span>` : '');
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
  function _buildAutoSources() {
    const data = window._PVState.data;
    const out = {
      customer_name: [], service_name: [], method: ['card','cash','transfer','etc'],
      item_name: [], inv_category: ['nail','hair','lash','skin','etc'],
      svc_category: ['hair','nail','eye','skin','wax','etc'],
    };
    const seen = { customer_name: new Set(), service_name: new Set(), item_name: new Set() };
    (data.customer || []).forEach(c => {
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
    const inputs = document.querySelectorAll('#power-view-overlay .pv-qadd input[data-field]');
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

  // ── 배치 쌓기 ─────────────────────────────────────────
  function _stackRow() {
    const state = window._PVState;
    const { values, missing, schema, inputs } = _collectQaddValues();
    if (missing) {
      if (window.showToast) window.showToast(`⚠️ 필수: ${missing}`);
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

  // ── 전체 메뉴 드로어 (§5.8 Bottom Sheet) ──────────────
  function _openMenuDrawer() {
    const { MENU_ITEMS } = window._PVInt;
    const o = document.createElement('div');
    o.id = 'pv-menu-drawer';
    o.className = 'pv-sheet';
    o.innerHTML = `
      <div class="pv-sheet-inner">
        <div style="display:flex;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border,#eee);">
          <div style="font-size:15px;font-weight:900;flex:1;color:var(--text,#222);">메뉴</div>
          <button id="pv-menu-close" style="width:32px;height:32px;border:none;border-radius:10px;background:var(--surface-raised,#eee);cursor:pointer;font-size:14px;color:var(--text,#555);">✕</button>
        </div>
        <div class="list-menu" style="flex:1;overflow:auto;">
          ${MENU_ITEMS.map(e => `
            <button class="list-menu__item" data-pv-menu-fn="${e.fn}">
              <div class="list-menu__icon-box" style="font-size:20px;background:var(--brand-bg,#FEF4F5);">${e.icon}</div>
              <div class="list-menu__body">
                <div class="list-menu__title">${e.label}</div>
                <div class="list-menu__sub">${e.hint}</div>
              </div>
              <div class="list-menu__right"><svg class="ic" aria-hidden="true"><use href="#ic-chevron-right"/></svg></div>
            </button>
          `).join('')}
        </div>
        <div style="padding:12px 20px;border-top:1px solid var(--border,#eee);font-size:11px;color:var(--text-subtle,#aaa);text-align:center;">잇데이 · 와이투두(Y2do)</div>
      </div>
    `;
    document.body.appendChild(o);
    const close = () => o.remove();
    o.addEventListener('click', (e) => { if (e.target === o) close(); });
    o.querySelector('#pv-menu-close').addEventListener('click', close);
    o.querySelectorAll('[data-pv-menu-fn]').forEach(b => {
      b.addEventListener('click', () => {
        const fn = b.getAttribute('data-pv-menu-fn');
        close();
        if (typeof window[fn] === 'function') {
          if (window.hapticLight) window.hapticLight();
          window.closePowerView();
          setTimeout(() => window[fn](), 140);
        }
      });
    });
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

    const list = _applySearch(state.data[state.currentTab] || [], schema);
    const qadd = schema.qadd;
    const autoSource = _buildAutoSources();
    const fieldsHtml = qadd.fields.map(f => {
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
    const actionColWidth = editMode ? 88 : 56;
    const headers = schema.headers.map(h => `<th>${_esc(h)}</th>`).join('') + `<th style="width:${actionColWidth}px;"></th>`;
    const rowsHtml = list.map(r => {
      if (editMode && Array.isArray(schema.editFields)) {
        const editCells = schema.editFields.map(f => {
          if (f.readonly) {
            const txt = typeof f.format === 'function' ? f.format(r) : (r[f.key] == null ? '—' : String(r[f.key]));
            return `<td><span style="color:#888;font-size:12px;">${_esc(txt)}</span></td>`;
          }
          const raw = r[f.key];
          const shown = typeof f.transform === 'function' ? f.transform(raw) : (raw == null ? '' : String(raw));
          const ph = f.placeholder ? ` placeholder="${_esc(f.placeholder)}"` : '';
          return `<td><input data-pv-edit="${r.id}:${f.key}" type="${f.type || 'text'}" value="${_esc(shown)}"${ph} style="width:100%;padding:7px 9px;border:1.5px solid hsl(350, 60%, 88%);border-radius:10px;font-size:12.5px;background:#fff;box-sizing:border-box;" /></td>`;
        }).join('');
        const actionCell = `<td style="text-align:right;white-space:nowrap;">
          <button data-pv-row-save="${r.id}" title="저장" style="border:none;background:linear-gradient(135deg, hsl(350, 75%, 72%), hsl(350, 70%, 60%));color:#fff;cursor:pointer;font-size:13px;padding:6px 9px;border-radius:10px;margin-right:4px;font-weight:800;">💾</button>
          <button data-pv-row-delete="${r.id}" title="삭제" style="border:1.5px solid #f0c0c0;background:#fff;color:#C62828;cursor:pointer;font-size:13px;padding:5px 8px;border-radius:10px;font-weight:700;">🗑</button>
        </td>`;
        return `<tr data-id="${r.id}" class="pv-row-editing">${editCells}${actionCell}</tr>`;
      }
      const cells = schema.row(r).map(c => `<td>${c}</td>`).join('');
      return `<tr data-id="${r.id}">${cells}<td style="text-align:right;"><button class="pv-row-edit" data-edit-id="${r.id}" title="수정" style="border:none;background:transparent;cursor:pointer;font-size:13px;color:#888;padding:4px 8px;border-radius:6px;transition:all 0.12s;">✎</button></td></tr>`;
    }).join('');

    const pendingList = state.pending[state.currentTab] || [];
    const pendingHtml = pendingList.length ? `
      <div style="padding:12px 16px;background:#FFFBEB;border-bottom:1px solid #FFE58F;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div style="font-size:12px;font-weight:800;color:#B45309;">⏳ 쌓아둔 행 ${pendingList.length}개</div>
          <div style="display:flex;gap:6px;">
            <button id="pv-batch-clear" style="padding:6px 10px;font-size:11px;border:1px solid #EAB308;background:#fff;color:#B45309;border-radius:7px;cursor:pointer;font-weight:700;">비우기</button>
            <button id="pv-batch-save" style="padding:6px 12px;font-size:11.5px;border:none;background:linear-gradient(135deg,#F18091,#D95F70);color:#fff;border-radius:7px;cursor:pointer;font-weight:800;box-shadow:0 2px 6px rgba(241,128,145,0.3);">⚡ ${pendingList.length}개 한 번에 저장</button>
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
      <tr><td colspan="${schema.headers.length}">
        <div class="pv-empty">
          <div class="pv-empty-icon">${schema.empty.icon}</div>
          <div style="font-weight:800;color:#555;margin-bottom:6px;">${state.searchKW ? '검색 결과가 없어요' : schema.empty.title}</div>
          <div style="font-size:12px;color:#aaa;">${state.searchKW ? `"${_esc(state.searchKW)}" 에 해당하는 ${schema.empty.title.replace(' 없어요','').replace('아직 ','')} 없음` : schema.empty.desc}</div>
        </div>
      </td></tr>` : '';

    body.innerHTML = `
      ${datalistHtml}
      <div class="pv-qadd" data-voice-root>
        ${fieldsHtml}
        <button class="pv-btn-stack" id="pv-stack-btn" title="목록에 쌓아두고 나중에 일괄 저장" style="padding:11px 12px;background:#fff;border:1.5px solid #F18091;color:#D95F70;border-radius:10px;font-weight:800;font-size:12.5px;cursor:pointer;white-space:nowrap;flex-shrink:0;transition:all 0.15s;">⊕ 쌓기</button>
        <button class="pv-btn-add" id="pv-add-btn">즉시 추가 <span class="pv-kbd">↵</span></button>
      </div>
      ${pendingHtml}
      <div class="pv-toolbar">
        <div style="position:relative;flex:1;max-width:280px;">
          <svg class="ic" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);pointer-events:none;color:#999;" aria-hidden="true"><use href="#ic-search"/></svg>
          <input class="pv-search" id="pv-search" data-no-voice placeholder="검색 (⌘K)" value="${_esc(state.searchKW)}" style="padding-left:32px;padding-right:${state.searchKW ? '32px' : '12px'};" />
          ${state.searchKW ? `<button id="pv-search-clear" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);border:none;background:transparent;cursor:pointer;padding:2px;color:#aaa;" aria-label="검색 지우기"><svg class="ic" aria-hidden="true"><use href="#ic-x"/></svg></button>` : ''}
        </div>
        <label class="pv-excel" for="pv-excel-file" title="엑셀/CSV AI 임포트">
          📥 엑셀 불러오기
          <input type="file" id="pv-excel-file" accept=".xlsx,.xls,.csv" hidden />
        </label>
      </div>
      <div class="pv-list">
        <table class="pv-table">
          <thead><tr>${headers}</tr></thead>
          <tbody id="pv-tbody">${rowsHtml}${emptyHtml}</tbody>
        </table>
      </div>
      <div class="pv-footer">
        <div><span class="pv-count">${list.length}</span><span style="color:#999"> / 총 ${(state.data[state.currentTab] || []).length}건</span></div>
        <div class="pv-hotkeys">단축: <kbd>Enter</kbd> 즉시 · <kbd>Shift+Enter</kbd> 쌓기 · <kbd>⌘K</kbd> 검색 · <kbd>Esc</kbd> 닫기</div>
      </div>
    `;
    _bindBody();
    _focusFirstInput();
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
    document.querySelectorAll('#power-view-overlay .pv-qadd input').forEach(el => {
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
                <svg class="ic" aria-hidden="true"><use href="#ic-calendar"/></svg>
              </div>
              <div class="list-menu__body">
                <div class="list-menu__title">${_esc(b.customer_name || '예약')}</div>
                <div class="list-menu__sub">${_esc(b.service_name || '')}${b.time ? ' · ' + _esc(b.time) : ''}</div>
              </div>
              <div class="list-menu__right">
                <svg class="ic ic--xs" aria-hidden="true"><use href="#ic-chevron-right"/></svg>
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
    openMenuDrawer: _openMenuDrawer,
    stackRow: _stackRow,
    handleExcelFile: _handleExcelFile,
  };
})();
