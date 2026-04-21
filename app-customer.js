/* ─────────────────────────────────────────────────────────────
   고객 관리 (Phase 2 P0-1) — 경량 CRM

   엔드포인트 (shared/schemas.json 참조):
   - GET    /customers                 목록
   - POST   /customers                 생성
   - GET    /customers/{id}            상세
   - PATCH  /customers/{id}            수정
   - DELETE /customers/{id}            소프트 삭제

   특징:
   - 백엔드 미배포 시 localStorage 오프라인 폴백
   - 원영 T-200 하단 네비와 독립 — 오버레이 시트로 동작
   - openCustomers() 로 외부 진입
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const OFFLINE_KEY = 'itdasy_customers_offline_v1';
  let _cache = null;
  let _isOffline = false;

  function _now() { return new Date().toISOString(); }

  function _uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }

  // ── 오프라인 스토어 (백엔드 미배포 시) ──────────────────────
  function _loadOffline() {
    try {
      const raw = localStorage.getItem(OFFLINE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  }
  function _saveOffline(list) {
    try { localStorage.setItem(OFFLINE_KEY, JSON.stringify(list)); } catch (_) { /* storage full — ignore */ }
  }

  // ── 네트워크 호출 공통 ────────────────────────────────────
  async function _api(method, path, body) {
    if (!window.API || !window.authHeader) throw new Error('no-auth');
    const auth = window.authHeader();
    if (!auth?.Authorization) throw new Error('no-token');
    const opts = {
      method,
      headers: { ...auth, 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(window.API + path, opts);
    if (res.status === 404 || res.status === 501) throw new Error('endpoint-missing');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.status === 204 ? null : await res.json();
  }

  // ── CRUD ────────────────────────────────────────────────
  async function list() {
    try {
      const d = await _api('GET', '/customers');
      _isOffline = false;
      _cache = d.items || [];
      return _cache;
    } catch (e) {
      if (e.message === 'endpoint-missing' || e.message === 'no-token') {
        _isOffline = true;
        _cache = _loadOffline();
        return _cache;
      }
      throw e;
    }
  }

  const FREE_CUSTOMER_LIMIT = 50;

  function _overLimit() {
    const paid = typeof window.isPaidPlan === 'function' && window.isPaidPlan();
    if (paid) return false;
    const count = (_cache || _loadOffline()).length;
    return count >= FREE_CUSTOMER_LIMIT;
  }

  async function create(payload) {
    if (!payload || !payload.name) throw new Error('name-required');
    if (_overLimit()) {
      const msg = 'Free 플랜은 고객 ' + FREE_CUSTOMER_LIMIT + '명까지 등록할 수 있어요. Pro 로 업그레이드해 주세요.';
      if (window.showToast) window.showToast(msg);
      if (typeof window.openPlanPopup === 'function') {
        setTimeout(() => window.openPlanPopup(), 500);
      }
      throw new Error('free-limit-reached');
    }
    const data = {
      name: String(payload.name).trim().slice(0, 50),
      phone: payload.phone ? String(payload.phone).trim().slice(0, 20) : null,
      memo: payload.memo ? String(payload.memo).slice(0, 500) : null,
      tags: Array.isArray(payload.tags) ? payload.tags.slice(0, 10) : [],
      birthday: payload.birthday || null,
    };
    if (_isOffline) {
      const record = {
        id: _uuid(),
        shop_id: localStorage.getItem('shop_id') || 'offline',
        ...data,
        last_visit_at: null,
        visit_count: 0,
        created_at: _now(),
        deleted_at: null,
      };
      const list = _loadOffline();
      list.unshift(record);
      _saveOffline(list);
      _cache = list;
      return record;
    }
    const created = await _api('POST', '/customers', data);
    if (_cache) _cache.unshift(created);
    return created;
  }

  async function update(id, patch) {
    if (_isOffline) {
      const list = _loadOffline();
      const i = list.findIndex(c => c.id === id);
      if (i < 0) throw new Error('not-found');
      list[i] = { ...list[i], ...patch };
      _saveOffline(list);
      _cache = list;
      return list[i];
    }
    const updated = await _api('PATCH', '/customers/' + id, patch);
    if (_cache) {
      const i = _cache.findIndex(c => c.id === id);
      if (i >= 0) _cache[i] = updated;
    }
    return updated;
  }

  async function remove(id) {
    if (_isOffline) {
      const list = _loadOffline().filter(c => c.id !== id);
      _saveOffline(list);
      _cache = list;
      return { ok: true };
    }
    await _api('DELETE', '/customers/' + id);
    if (_cache) _cache = _cache.filter(c => c.id !== id);
    return { ok: true };
  }

  // ── 검색 ────────────────────────────────────────────────
  function search(query) {
    if (!_cache) return [];
    const q = String(query || '').trim().toLowerCase();
    if (!q) return _cache;
    return _cache.filter(c =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q)) ||
      (c.memo && c.memo.toLowerCase().includes(q)) ||
      (c.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }

  // ── UI: 오버레이 시트 ────────────────────────────────────
  function _ensureSheet() {
    let sheet = document.getElementById('customerSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'customerSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9998;display:none;flex-direction:column;';
    sheet.classList.add('dt-overlay');
    sheet.innerHTML = `
      <header class="dt-hdr">
        <button class="dt-back" onclick="closeCustomers()" aria-label="뒤로"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>
        <h1 class="dt-title">내 고객</h1>
        <span id="customerCount" style="font-size:12px;color:var(--text-subtle);"></span>
        <span id="customerOfflineBadge" class="dt-offline-badge">오프라인</span>
      </header>
      <div class="dt-body">
        <div class="dt-search-wrap">
          <input id="customerSearch" type="search" class="dt-field" placeholder="이름·연락처·태그 검색" />
        </div>
        <div id="customerList"></div>
      </div>
      <footer class="dt-footer">
        <button id="customerAddBtn" class="btn-primary" style="flex:1;">+ 고객 추가</button>
      </footer>
    `;
    document.body.appendChild(sheet);
    sheet.querySelector('#customerSearch').addEventListener('input', _rerender);
    sheet.querySelector('#customerAddBtn').addEventListener('click', _openAddForm);
    return sheet;
  }

  function _rerender() {
    const sheet = document.getElementById('customerSheet');
    if (!sheet) return;
    const q = sheet.querySelector('#customerSearch').value;
    const items = search(q);
    const box = sheet.querySelector('#customerList');
    const count = sheet.querySelector('#customerCount');
    const offBadge = sheet.querySelector('#customerOfflineBadge');
    count.textContent = (_cache ? _cache.length : 0) + '명';
    offBadge.style.display = _isOffline ? 'inline-block' : 'none';

    if (!items.length) {
      box.innerHTML = `<div class="dt-empty">${_cache && _cache.length ? '검색 결과 없음' : '아직 고객이 없어요. 아래 버튼으로 추가해 주세요.'}</div>`;
      return;
    }
    box.innerHTML = '<div class="dt-list">' + items.map(c => `
      <button class="dt-list-it customer-row" data-id="${c.id}" type="button">
        <div class="dt-list-it__main">
          <p class="dt-list-it__title">${_esc(c.name)}${c.visit_count ? ` <span style="font-size:11px;font-weight:400;color:var(--brand);">방문 ${c.visit_count}회</span>` : ''}</p>
          <p class="dt-list-it__sub">${[c.phone ? _esc(c.phone) : '', c.memo ? _esc(c.memo).slice(0,40) : ''].filter(Boolean).join(' · ')}</p>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    `).join('') + '</div>';
    box.querySelectorAll('.customer-row').forEach(row => {
      row.addEventListener('click', () => {
        // 행 클릭 = 대시보드(조회). 편집은 대시보드 안의 '편집' 버튼 또는 _openDetail 직접 호출.
        if (typeof window.openCustomerDashboard === 'function') {
          window.openCustomerDashboard(row.dataset.id);
        } else {
          _openDetail(row.dataset.id);
        }
      });
    });
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  function _openAddForm() {
    _openDetail(null);
  }

  function _openDetail(id) {
    const existing = id && _cache ? _cache.find(c => c.id === id) : null;
    const box = document.getElementById('customerList');
    if (!box) return;
    const c = existing || { name: '', phone: '', memo: '', tags: [], birthday: '' };
    box.innerHTML = `
      <button onclick="window._customerBack()" class="dt-back" style="margin-bottom:12px;" aria-label="뒤로"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>
      <div class="dt-field-row"><label class="dt-field-lbl">이름 *</label><input id="cfName" class="dt-field" value="${_esc(c.name)}" maxlength="50" /></div>
      <div class="dt-field-row"><label class="dt-field-lbl">연락처</label><input id="cfPhone" class="dt-field" value="${_esc(c.phone||'')}" inputmode="tel" maxlength="20" /></div>
      <div class="dt-field-row"><label class="dt-field-lbl">생일 (MM-DD)</label><input id="cfBirthday" class="dt-field" value="${_esc(c.birthday||'')}" placeholder="03-14" maxlength="5" /></div>
      <div class="dt-field-row"><label class="dt-field-lbl">태그 (쉼표로 구분)</label><input id="cfTags" class="dt-field" value="${_esc((c.tags||[]).join(', '))}" placeholder="VIP, 속눈썹" /></div>
      <div class="dt-field-row"><label class="dt-field-lbl">메모</label><textarea id="cfMemo" class="dt-field" rows="3" maxlength="500">${_esc(c.memo||'')}</textarea></div>
      <div style="display:flex;gap:8px;margin-top:8px;">
        <button onclick="window._customerSave('${id||''}')" class="btn-primary" style="flex:1;">${existing ? '수정' : '추가'}</button>
        ${existing ? `<button onclick="window._customerDelete('${id}')" class="btn-secondary" style="color:var(--danger);">삭제</button>` : ''}
      </div>
    `;
    document.getElementById('cfName')?.focus();
  }

  window._customerBack = _rerender;

  window._customerSave = async function (id) {
    const payload = {
      name: document.getElementById('cfName').value.trim(),
      phone: document.getElementById('cfPhone').value.trim() || null,
      birthday: document.getElementById('cfBirthday').value.trim() || null,
      tags: document.getElementById('cfTags').value.split(',').map(t => t.trim()).filter(Boolean).slice(0, 10),
      memo: document.getElementById('cfMemo').value.trim() || null,
    };
    if (!payload.name) {
      if (window.showToast) window.showToast('이름을 입력해 주세요');
      return;
    }
    try {
      if (id) await update(id, payload);
      else await create(payload);
      if (window.hapticLight) window.hapticLight();
      if (window.showToast) window.showToast(id ? '수정 완료' : '추가 완료');
      _rerender();
    } catch (e) {
      console.warn('[customer] save 실패:', e);
      if (window.showToast) window.showToast('저장 실패 — 잠시 후 다시 시도해 주세요');
    }
  };

  window._customerDelete = async function (id) {
    if (!confirm('이 고객을 삭제할까요?')) return;
    try {
      await remove(id);
      if (window.hapticLight) window.hapticLight();
      if (window.showToast) window.showToast('삭제 완료');
      _rerender();
    } catch (e) {
      console.warn('[customer] delete 실패:', e);
      if (window.showToast) window.showToast('삭제 실패');
    }
  };

  window.openCustomers = async function () {
    const sheet = _ensureSheet();
    sheet.style.display = 'flex';
    sheet.classList.add('dt-shown');
    document.body.style.overflow = 'hidden';
    const box = sheet.querySelector('#customerList');
    box.innerHTML = '<div class="dt-loading">불러오는 중…</div>';
    try {
      await list();
      _rerender();
    } catch (e) {
      console.warn('[customer] list 실패:', e);
      box.innerHTML = '<div class="dt-error">불러오기 실패</div>';
    }
  };

  window.closeCustomers = function () {
    const sheet = document.getElementById('customerSheet');
    if (sheet) { sheet.style.display = 'none'; sheet.classList.remove('dt-shown'); }
    document.body.style.overflow = '';
  };

  // ── 픽커 (외부 컴포넌트 재사용) ──────────────────────────
  //   await Customer.pick({ selectedId })  →  {id, name} | null (취소)
  async function pick(opts) {
    opts = opts || {};
    try { if (!_cache) await list(); } catch (_) { /* ignore */ }
    return new Promise((resolve) => {
      const items = _cache || [];
      const pop = document.createElement('div');
      pop.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,0.5);display:flex;align-items:flex-end;';
      pop.innerHTML = `
        <div style="width:100%;background:var(--bg,#fff);border-radius:20px 20px 0 0;max-height:70vh;display:flex;flex-direction:column;padding:16px;padding-bottom:max(16px,env(safe-area-inset-bottom));">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
            <strong style="font-size:16px;">고객 선택</strong>
            <button data-pick-cancel style="margin-left:auto;background:none;border:none;font-size:20px;cursor:pointer;">✕</button>
          </div>
          <input data-pick-search placeholder="이름·연락처 검색" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:10px;margin-bottom:10px;" />
          <div data-pick-list style="flex:1;overflow-y:auto;min-height:120px;"></div>
          <button data-pick-clear style="margin-top:8px;padding:10px;border:1px solid #eee;border-radius:8px;background:#fafafa;color:#c00;cursor:pointer;font-size:12px;">지정 해제 (고객 없음)</button>
        </div>
      `;
      document.body.appendChild(pop);
      const searchEl = pop.querySelector('[data-pick-search]');
      const listEl = pop.querySelector('[data-pick-list]');
      const close = (val) => { pop.remove(); resolve(val); };

      const render = () => {
        const q = searchEl.value;
        const hits = search(q);
        if (!hits.length) {
          listEl.innerHTML = '<div style="padding:30px;text-align:center;color:#aaa;font-size:13px;">' +
            (items.length ? '검색 결과 없음' : '등록된 고객이 없어요. 먼저 설정 → 내 고객 관리에서 추가해 주세요.') +
            '</div>';
          return;
        }
        listEl.innerHTML = hits.map(c => `
          <div data-pick-id="${c.id}" style="padding:12px 8px;border-bottom:1px solid #eee;cursor:pointer;${c.id === opts.selectedId ? 'background:rgba(241,128,145,0.08);' : ''}">
            <strong style="font-size:14px;">${_esc(c.name)}</strong>
            ${c.phone ? `<span style="font-size:12px;color:#888;margin-left:6px;">${_esc(c.phone)}</span>` : ''}
            ${c.visit_count ? `<span style="font-size:10px;color:var(--accent,#F18091);margin-left:6px;">방문 ${c.visit_count}</span>` : ''}
          </div>
        `).join('');
        listEl.querySelectorAll('[data-pick-id]').forEach(row => {
          row.addEventListener('click', () => {
            const pickedId = row.dataset.pickId;
            const c = items.find(x => String(x.id) === String(pickedId));
            close(c ? { id: c.id, name: c.name } : null);
          });
        });
      };
      render();
      searchEl.addEventListener('input', render);
      pop.querySelector('[data-pick-cancel]').addEventListener('click', () => close(null));
      pop.querySelector('[data-pick-clear]').addEventListener('click', () => close({ id: null, name: null }));
      pop.addEventListener('click', (e) => { if (e.target === pop) close(null); });
    });
  }

  // 외부에서 편집 폼 직접 열기 (대시보드의 '정보 편집' 버튼용)
  window.editCustomer = async function (id) {
    try { if (!_cache) await list(); } catch (_) { /* ignore */ }
    const sheet = _ensureSheet();
    sheet.style.display = 'block';
    document.body.style.overflow = 'hidden';
    _openDetail(id);
  };

  // 외부 노출 (디버그·테스트·타 컴포넌트용)
  window.Customer = {
    list, create, update, remove, search, pick,
    get _cache() { return _cache; },
    get isOffline() { return _isOffline; },
  };
})();
