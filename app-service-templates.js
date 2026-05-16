/* 시술 프리셋 관리 (Step 4 · 2026-05-16 리디자인)
 *
 * 한 번 설정하면 예약·매출·재고가 자동으로 움직이는 "허브" 화면.
 *
 * 전역:
 *   window.openServiceTemplates()  → 관리 시트 열기
 *   window.loadServiceTemplates()  → 캐시 갱신 + 반환 Promise<Array>
 *   window._serviceTemplatesCache  → 마지막 로드 결과
 *   window.ServiceTemplates        → { open, edit, del, editConsumptions }
 */
(function () {
  'use strict';

  const API = window.API || window.PROD_API || '';
  let _cache = [];
  let _inventoryCache = [];
  let _monthUsage = {};  // service_name → count

  // ── 토큰/네트워크 ───────────────────────────────────────
  function _token() { return (typeof window.getToken === 'function') ? window.getToken() : ''; }
  async function _req(method, path, body) {
    const opts = { method, headers: { 'Authorization': `Bearer ${_token()}` } };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(`${API}${path}`, opts);
    if (!res.ok) throw new Error(await res.text().catch(() => 'HTTP ' + res.status));
    return res.status === 204 ? null : res.json();
  }

  async function loadServiceTemplates() {
    try {
      const data = await _req('GET', '/services');
      _cache = (data && data.items) || [];
      window._serviceTemplatesCache = _cache;
      return _cache;
    } catch (e) { console.warn('[services] 로드 실패', e); return []; }
  }
  async function createTemplate(body) { return _req('POST', '/services', body); }
  async function updateTemplate(id, body) { return _req('PATCH', `/services/${id}`, body); }
  async function deleteTemplate(id) { await _req('DELETE', `/services/${id}`); return true; }

  async function loadInventoryItems() {
    try { const d = await _req('GET', '/inventory'); _inventoryCache = (d && d.items) || []; }
    catch (_) { _inventoryCache = []; }
    return _inventoryCache;
  }
  async function loadConsumptions(serviceId) {
    try { return await _req('GET', `/services/${serviceId}/consumptions`); }
    catch (_) { return []; }
  }
  async function createConsumption(serviceId, body) { return _req('POST', `/services/${serviceId}/consumptions`, body); }
  async function deleteConsumption(serviceId, consumptionId) { await _req('DELETE', `/services/${serviceId}/consumptions/${consumptionId}`); return true; }

  // ── 이번달 사용량 (매출에서 service_name 카운트) ─────────
  async function _loadMonthUsage() {
    _monthUsage = {};
    try {
      let items = [];
      if (window.Revenue && typeof window.Revenue.list === 'function') {
        items = await window.Revenue.list('month');
      } else {
        const d = await _req('GET', '/revenue?period=month');
        items = (d && d.items) || [];
      }
      (items || []).forEach(r => {
        if (r.service_name) _monthUsage[r.service_name] = (_monthUsage[r.service_name] || 0) + 1;
      });
    } catch (_) { /* 실패해도 0건 표시 */ }
  }

  // ── 유틸 ───────────────────────────────────────────────
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch])); }
  function _catLabel(c) { return ({hair:'헤어', nail:'네일', eye:'속눈썹', skin:'피부', wax:'왁싱', etc:'기타'})[c] || c || '기타'; }
  function _formatPrice(n) { const v = Number(n) || 0; return v.toLocaleString('ko-KR') + '원'; }

  // ── 헤더 ───────────────────────────────────────────────
  function _renderHeader() {
    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;gap:12px;">
        <div style="min-width:0;">
          <h2 style="font-size:20px;font-weight:700;color:#191F28;margin:0;">시술 프리셋</h2>
          <p style="font-size:13px;color:#8B95A1;margin:4px 0 0;line-height:1.5;">한 번 설정하면 예약·매출·재고가 자동으로 움직입니다</p>
        </div>
        <button type="button" class="svc-add-btn" style="padding:10px 18px;border-radius:999px;background:#E5586E;color:#fff;border:none;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0;">+ 새 시술 추가</button>
      </div>`;
  }

  // ── 카드 ───────────────────────────────────────────────
  function _renderCard(svc) {
    const price = Number(svc.default_price) || 0;
    const matCost = Number(svc.material_cost) || 0;
    const margin = price - matCost;
    const marginPct = price > 0 ? ((margin / price) * 100).toFixed(1) : '0';
    const consCount = Array.isArray(svc._consumptions) ? svc._consumptions.length : 0;
    const dur = Number(svc.default_duration_min) || 0;
    const usage = _monthUsage[svc.name] || 0;
    return `
      <div class="svc-card" data-svc-id="${_esc(svc.id)}" style="background:#fff;border-radius:16px;padding:20px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,0.04),0 1px 2px rgba(0,0,0,0.06);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
          <div style="min-width:0;flex:1;">
            <div style="font-size:17px;font-weight:700;color:#191F28;">${_esc(svc.name)}</div>
            <div style="font-size:13px;color:#8B95A1;margin-top:4px;">${dur}분 · ${_esc(_catLabel(svc.category))}</div>
          </div>
          <div style="font-size:20px;font-weight:700;color:#E5586E;white-space:nowrap;">${_formatPrice(price)}</div>
        </div>
        <div style="margin-top:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          <span style="font-size:14px;font-weight:600;color:${margin >= 0 ? '#0F6E56' : '#E5586E'};">마진 ${_formatPrice(margin)} (${marginPct}%)</span>
          <span style="font-size:12px;color:#8B95A1;">재료원가 ${_formatPrice(matCost)}</span>
        </div>
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid #E5E8EB;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-size:11px;padding:4px 10px;border-radius:999px;background:#F7F8FA;color:#4E5968;">${consCount > 0 ? '소모재료 ' + consCount + '종' : '소모재료 미설정'}</span>
          ${svc.retouch_period_days ? `<span style="font-size:11px;padding:4px 10px;border-radius:999px;background:#FFF1F3;color:#E5586E;">리터치 ${_esc(svc.retouch_period_days)}일</span>` : ''}
          <span style="margin-left:auto;font-size:11px;color:#8B95A1;">${usage}건 이번달</span>
          <a data-svc-edit="${_esc(svc.id)}" style="font-size:12px;color:#E5586E;font-weight:600;cursor:pointer;text-decoration:none;">수정</a>
        </div>
      </div>`;
  }

  function _renderCards() {
    if (!_cache.length) {
      if (window.emptyState) return window.emptyState({ icon: '', title: '아직 시술이 없어요', desc: '자주 하는 시술을 미리 등록하면 예약·매출 입력이 한 번에 끝나요.', ctaText: '첫 시술 추가' });
      return '<div style="padding:40px;text-align:center;color:#8B95A1;">등록된 시술 없음</div>';
    }
    return _cache.map(_renderCard).join('');
  }

  // ── 자동 연동 흐름 다이어그램 ───────────────────────────
  function _renderFlowDiagram() {
    const steps = ['프리셋 설정', '예약 추가', '예약 완료', '매출+재고', '리터치 알림'];
    const item = (s, i) => `
      <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
        <div style="width:32px;height:32px;border-radius:50%;background:#FFF1F3;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#E5586E;">${i + 1}</div>
        <div style="font-size:11px;color:#4E5968;white-space:nowrap;">${_esc(s)}</div>
      </div>`;
    return `
      <div style="margin-top:24px;padding:20px;background:#fff;border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
        <div style="font-size:14px;font-weight:700;color:#191F28;margin-bottom:16px;">자동 연동 흐름</div>
        <div style="display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;">
          ${steps.map((s, i) => item(s, i) + (i < steps.length - 1 ? '<div style="color:#E5E8EB;font-size:16px;">→</div>' : '')).join('')}
        </div>
      </div>`;
  }

  // ── 메인 진입 ───────────────────────────────────────────
  async function openServiceTemplates() {
    if (!window.openSheet) return;
    await Promise.all([loadServiceTemplates(), _loadMonthUsage()]);
    const html = _renderHeader() +
      `<div id="svc-add-panel" style="display:none;margin-bottom:14px;">${_addFormHTML()}</div>` +
      `<div id="svc-list">${_renderCards()}</div>` +
      _renderFlowDiagram();
    window.openSheet({ title: '시술 프리셋', body: html });
    setTimeout(_bindMainHandlers, 50);
  }

  function _addFormHTML(prefill) {
    const p = prefill || {};
    return `
      <div style="padding:16px;background:#F7F8FA;border-radius:14px;">
        <div style="font-size:13px;font-weight:700;color:#191F28;margin-bottom:10px;">새 시술 정보</div>
        <div style="display:grid;grid-template-columns:2fr 1fr 80px;gap:6px;margin-bottom:6px;">
          <input id="svc-name" placeholder="시술 이름" value="${_esc(p.name || '')}" style="padding:10px;border:1px solid #ddd;border-radius:8px;background:#fff;">
          <input id="svc-price" type="number" placeholder="기본 금액" value="${_esc(p.default_price || '')}" style="padding:10px;border:1px solid #ddd;border-radius:8px;background:#fff;">
          <input id="svc-dur" type="number" placeholder="분" value="${_esc(p.default_duration_min || 60)}" style="padding:10px;border:1px solid #ddd;border-radius:8px;background:#fff;">
        </div>
        <input id="svc-material" type="number" placeholder="재료비 (선택, 실마진 계산용)" value="${_esc(p.material_cost || '')}" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:6px;background:#fff;">
        <input id="svc-retouch" type="number" placeholder="리터치 주기 일수 (선택)" value="${_esc(p.retouch_period_days || '')}" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:6px;background:#fff;">
        <div style="display:flex;gap:6px;align-items:center;">
          <select id="svc-cat" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;background:#fff;">
            ${['etc','hair','nail','eye','skin','wax'].map(c => `<option value="${c}" ${(p.category||'etc')===c?'selected':''}>${_catLabel(c)}</option>`).join('')}
          </select>
          <button id="svc-add" type="button" style="padding:10px 18px;background:#E5586E;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">추가</button>
        </div>
      </div>`;
  }

  function _bindMainHandlers() {
    // 추가 패널 토글
    document.querySelector('.svc-add-btn')?.addEventListener('click', () => {
      const panel = document.getElementById('svc-add-panel');
      if (!panel) return;
      const opening = panel.style.display === 'none';
      panel.style.display = opening ? '' : 'none';
      if (opening) { setTimeout(() => document.getElementById('svc-name')?.focus(), 30); _bindAddHandlers(); }
    });
    _bindAddHandlers();
    // 카드 "수정" 클릭
    document.getElementById('svc-list')?.addEventListener('click', (e) => {
      const editId = e.target.getAttribute('data-svc-edit');
      if (editId) { e.preventDefault(); edit(editId); }
    });
  }

  function _bindAddHandlers() {
    const btn = document.getElementById('svc-add');
    if (!btn || btn._wired) return;
    btn._wired = true;
    btn.addEventListener('click', async () => {
      const name = document.getElementById('svc-name')?.value.trim();
      if (!name) { if (window.showToast) window.showToast('시술 이름을 입력해주세요.', 'warning'); return; }
      const body = {
        name,
        default_price: parseInt(document.getElementById('svc-price')?.value, 10) || 0,
        material_cost: parseInt(document.getElementById('svc-material')?.value, 10) || 0,
        default_duration_min: parseInt(document.getElementById('svc-dur')?.value, 10) || 60,
        retouch_period_days: parseInt(document.getElementById('svc-retouch')?.value, 10) || null,
        category: document.getElementById('svc-cat')?.value || 'etc',
      };
      try {
        await createTemplate(body);
        if (window.hapticLight) window.hapticLight();
        await Promise.all([loadServiceTemplates(), _loadMonthUsage()]);
        const list = document.getElementById('svc-list');
        if (list) list.innerHTML = _renderCards();
        const panel = document.getElementById('svc-add-panel');
        if (panel) panel.style.display = 'none';
        if (window.showToast) window.showToast('시술 추가됨');
      } catch (e) {
        if (window.showToast) window.showToast('추가 실패: ' + (window._humanError ? window._humanError(e) : e.message), 'error');
      }
    });
  }

  // ── 통합 편집 ──────────────────────────────────────────
  function edit(id) {
    const svc = _cache.find(x => String(x.id) === String(id));
    if (!svc || !window.openSheet) return;
    const body = `
      ${_addFormHTML(svc)}
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button id="svc-edit-cons" type="button" style="flex:1;padding:11px;border:1px solid #E5E8EB;background:#fff;border-radius:10px;font-size:13px;font-weight:600;color:#4E5968;cursor:pointer;">소모재료 설정</button>
        <button id="svc-edit-del"  type="button" style="padding:11px 18px;border:1px solid #E5E8EB;background:#fff;border-radius:10px;font-size:13px;font-weight:600;color:#E5586E;cursor:pointer;">삭제</button>
      </div>`;
    window.openSheet({ title: `${svc.name} 수정`, body });
    setTimeout(() => {
      // 저장 버튼 동작 변경 — create 대신 update
      const saveBtn = document.getElementById('svc-add');
      if (saveBtn) {
        saveBtn.textContent = '저장';
        saveBtn._wired = true;  // _bindAddHandlers 자동 wire 차단
        saveBtn.addEventListener('click', async () => {
          const name = document.getElementById('svc-name')?.value.trim();
          if (!name) { if (window.showToast) window.showToast('시술 이름을 입력해주세요.', 'warning'); return; }
          const patch = {
            name,
            default_price: parseInt(document.getElementById('svc-price')?.value, 10) || 0,
            material_cost: parseInt(document.getElementById('svc-material')?.value, 10) || 0,
            default_duration_min: parseInt(document.getElementById('svc-dur')?.value, 10) || 60,
            retouch_period_days: parseInt(document.getElementById('svc-retouch')?.value, 10) || null,
            category: document.getElementById('svc-cat')?.value || 'etc',
          };
          try {
            await updateTemplate(svc.id, patch);
            await Promise.all([loadServiceTemplates(), _loadMonthUsage()]);
            if (window.showToast) window.showToast('저장됨');
            openServiceTemplates();  // 메인 시트로 복귀
          } catch (e) {
            if (window.showToast) window.showToast('저장 실패: ' + (e.message || ''), 'error');
          }
        });
      }
      document.getElementById('svc-edit-cons')?.addEventListener('click', () => editConsumptions(svc.id));
      document.getElementById('svc-edit-del')?.addEventListener('click', async () => {
        const ok = window._confirm2 ? window._confirm2('이 시술을 삭제할까요?') : confirm('이 시술을 삭제할까요?');
        if (!ok) return;
        try {
          await deleteTemplate(svc.id);
          await Promise.all([loadServiceTemplates(), _loadMonthUsage()]);
          if (window.showToast) window.showToast('삭제됨');
          openServiceTemplates();
        } catch (_e) { if (window.showToast) window.showToast('삭제 실패', 'error'); }
      });
    }, 50);
  }

  // ── 재료 소모 (기존 구조 유지) ──────────────────────────
  async function editConsumptions(serviceId) {
    if (!window.openSheet) return;
    const svc = _cache.find(x => String(x.id) === String(serviceId));
    const [, rows] = await Promise.all([loadInventoryItems(), loadConsumptions(serviceId)]);
    window._svcConsRows = rows;
    const body = `
      <div style="padding:8px 0 14px;border-bottom:1px solid #E5E8EB;margin-bottom:14px;">
        <div style="font-weight:700;margin-bottom:8px;font-size:14px;color:#191F28;">${_esc(svc?.name || '시술')} 재료 소모</div>
        <div style="display:grid;grid-template-columns:1fr 88px;gap:6px;">
          <select id="cons-inv" style="padding:10px;border:1px solid #ddd;border-radius:8px;">
            ${_inventoryCache.map(i => `<option value="${i.id}">${_esc(i.name)} (${_esc(i.unit || '개')})</option>`).join('')}
          </select>
          <input id="cons-qty" type="number" step="0.1" placeholder="소모량" style="padding:10px;border:1px solid #ddd;border-radius:8px;">
        </div>
        <button id="cons-add" type="button" style="width:100%;margin-top:8px;padding:11px;border:none;border-radius:8px;background:#E5586E;color:#fff;font-weight:700;cursor:pointer;">추가</button>
      </div>
      <div id="cons-list">${_renderConsRows(serviceId, rows)}</div>`;
    window.openSheet({ title: '재료 소모', body });
    setTimeout(() => _bindConsumptionEvents(serviceId), 50);
  }

  function _renderConsRows(serviceId, rows) {
    if (!_inventoryCache.length) return '<div style="padding:20px;color:#8B95A1;text-align:center;font-size:13px;">먼저 재고를 추가해 주세요.</div>';
    if (!rows.length) return '<div style="padding:20px;color:#8B95A1;text-align:center;font-size:13px;">연결된 재료가 없어요.</div>';
    return rows.map(r => `
      <div style="display:flex;align-items:center;gap:8px;padding:10px;border:1px solid #E5E8EB;border-radius:10px;margin-bottom:8px;background:#fff;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;">${_esc(r.inventory_name)}</div>
          <div style="font-size:12px;color:#8B95A1;">${Number(r.consumption_qty || 0).toLocaleString()}${_esc(r.inventory_unit || '')}</div>
        </div>
        <button data-cons-del="${r.id}" type="button" style="border:1px solid #E5E8EB;background:#fff;border-radius:8px;padding:7px 10px;font-size:12px;cursor:pointer;">삭제</button>
      </div>`).join('');
  }

  function _bindConsumptionEvents(serviceId) {
    document.getElementById('cons-add')?.addEventListener('click', async () => {
      const inventoryId = parseInt(document.getElementById('cons-inv')?.value, 10);
      const qty = parseFloat(document.getElementById('cons-qty')?.value);
      if (!inventoryId || !qty || qty <= 0) { if (window.showToast) window.showToast('재료와 소모량을 입력해 주세요.', 'warning'); return; }
      try {
        await createConsumption(serviceId, { inventory_id: inventoryId, consumption_qty: qty });
        const rows = await loadConsumptions(serviceId);
        const list = document.getElementById('cons-list');
        if (list) list.innerHTML = _renderConsRows(serviceId, rows);
        const qtyInput = document.getElementById('cons-qty');
        if (qtyInput) qtyInput.value = '';
        if (window.showToast) window.showToast('저장 완료');
      } catch (_e) { if (window.showToast) window.showToast('저장 실패', 'error'); }
    });
    document.getElementById('cons-list')?.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-cons-del');
      if (!id) return;
      try {
        await deleteConsumption(serviceId, id);
        const rows = await loadConsumptions(serviceId);
        const list = document.getElementById('cons-list');
        if (list) list.innerHTML = _renderConsRows(serviceId, rows);
      } catch (_e) { if (window.showToast) window.showToast('삭제 실패', 'error'); }
    });
  }

  // ── 외부 노출 ──────────────────────────────────────────
  window.openServiceTemplates = openServiceTemplates;
  window.loadServiceTemplates = loadServiceTemplates;
  window._serviceTemplatesCache = _cache;
  window.ServiceTemplates = { open: openServiceTemplates, edit, del: deleteTemplate, editConsumptions };
})();
