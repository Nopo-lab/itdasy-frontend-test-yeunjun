/* 시술 프리셋 관리 (Phase 6 C4 · 2026-04-21)
 *
 * 자주 하는 시술을 미리 등록해서 예약·매출 입력 시 원탭 선택.
 *
 * 전역:
 *   window.openServiceTemplates()  → 관리 시트 열기
 *   window.loadServiceTemplates()  → 캐시 갱신 + 반환 Promise<Array>
 *   window._serviceTemplatesCache  → 마지막 로드 결과 (다른 시트에서 재사용)
 */
(function () {
  'use strict';

  const API = window.API || window.PROD_API || '';
  let _cache = [];
  let _inventoryCache = [];

  function _token() {
    return (typeof window.getToken === 'function') ? window.getToken() : '';
  }

  async function loadServiceTemplates() {
    try {
      const res = await fetch(`${API}/services`, {
        headers: { 'Authorization': `Bearer ${_token()}` }
      });
      if (!res.ok) return [];
      const data = await res.json();
      _cache = data.items || [];
      window._serviceTemplatesCache = _cache;
      return _cache;
    } catch (e) {
      console.warn('[services] 로드 실패', e);
      return [];
    }
  }

  async function createTemplate(body) {
    const res = await fetch(`${API}/services`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${_token()}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function updateTemplate(id, body) {
    const res = await fetch(`${API}/services/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${_token()}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function loadInventoryItems() {
    const res = await fetch(`${API}/inventory`, {
      headers: { 'Authorization': `Bearer ${_token()}` }
    });
    if (!res.ok) return [];
    const data = await res.json();
    _inventoryCache = data.items || [];
    return _inventoryCache;
  }

  async function loadConsumptions(serviceId) {
    const res = await fetch(`${API}/services/${serviceId}/consumptions`, {
      headers: { 'Authorization': `Bearer ${_token()}` }
    });
    if (!res.ok) return [];
    return res.json();
  }

  async function createConsumption(serviceId, body) {
    const res = await fetch(`${API}/services/${serviceId}/consumptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${_token()}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function deleteConsumption(serviceId, consumptionId) {
    const res = await fetch(`${API}/services/${serviceId}/consumptions/${consumptionId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${_token()}` }
    });
    if (!res.ok) throw new Error('삭제 실패');
    return true;
  }

  async function deleteTemplate(id) {
    const res = await fetch(`${API}/services/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${_token()}` }
    });
    if (!res.ok) throw new Error('삭제 실패');
    return true;
  }

  function _renderList(items) {
    if (!items.length) {
      return (window.emptyState ? window.emptyState({
        icon: '💅',
        title: '아직 시술이 없어요',
        desc: '자주 하는 시술을 미리 등록하면 예약·매출 입력이 한 번에 끝나요.',
        ctaText: '첫 시술 추가',
      }) : '<div style="padding:40px;text-align:center;color:#888;">등록된 시술 없음</div>');
    }
    return items.map(t => `
      <div style="display:flex;align-items:center;padding:12px;border:1px solid #eee;border-radius:12px;margin-bottom:8px;">
        <div style="flex:1;">
          <div style="font-weight:700;">${_esc(t.name)}</div>
          <div style="font-size:11px;color:#888;margin-top:3px;">
            ${t.default_price ? (t.default_price/10000).toFixed(1)+'만원' : '금액 미설정'} · ${t.default_duration_min}분 · ${_catLabel(t.category)}
            ${t.retouch_period_days ? ` · 리터치 ${t.retouch_period_days}일` : ''}
          </div>
        </div>
        <button data-retouch="${t.id}" style="background:none;border:1px solid #eee;border-radius:8px;padding:6px 10px;color:#555;cursor:pointer;margin-right:4px;">주기</button>
        <button data-cons="${t.id}" style="background:none;border:1px solid #eee;border-radius:8px;padding:6px 10px;color:#555;cursor:pointer;margin-right:4px;">재료</button>
        <button data-del="${t.id}" style="background:none;border:1px solid #eee;border-radius:8px;padding:6px 10px;color:#888;cursor:pointer;">삭제</button>
      </div>
    `).join('');
  }

  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch])); }
  function _catLabel(c) { return ({hair:'헤어', nail:'네일', eye:'속눈썹', skin:'피부', wax:'왁싱', etc:'기타'})[c] || c || '기타'; }

  async function openServiceTemplates() {
    if (!window.openSheet) return;
    await loadServiceTemplates();
    const inputFormHtml = `
      <div style="padding:16px 0;border-bottom:1px solid #eee;margin-bottom:14px;">
        <div style="display:grid;grid-template-columns:2fr 1fr 80px;gap:6px;margin-bottom:6px;">
          <input id="svc-name" placeholder="시술 이름" style="padding:10px;border:1px solid #ddd;border-radius:8px;">
          <input id="svc-price" type="number" placeholder="기본 금액" style="padding:10px;border:1px solid #ddd;border-radius:8px;">
          <input id="svc-dur" type="number" value="60" style="padding:10px;border:1px solid #ddd;border-radius:8px;">
        </div>
        <input id="svc-material" type="number" placeholder="재료비 (선택, 실마진 계산용)" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:6px;">
        <input id="svc-retouch" type="number" placeholder="리터치 주기 일수 (선택)" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:6px;">
        <div style="display:flex;gap:6px;align-items:center;">
          <select id="svc-cat" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;">
            <option value="etc">기타</option><option value="hair">헤어</option>
            <option value="nail">네일</option><option value="eye">속눈썹</option>
            <option value="skin">피부</option><option value="wax">왁싱</option>
          </select>
          <button id="svc-add" style="padding:10px 16px;background:linear-gradient(135deg,var(--brand),var(--brand-strong));color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">추가</button>
        </div>
      </div>
      <div id="svc-list">${_renderList(_cache)}</div>
    `;
    window.openSheet({ title: '시술 프리셋', body: inputFormHtml });

    setTimeout(() => {
      const addBtn = document.getElementById('svc-add');
      if (addBtn) addBtn.addEventListener('click', async () => {
        const name = document.getElementById('svc-name').value.trim();
        if (!name) return showToast('시술 이름을 입력해주세요.', 'warning');
        const price = parseInt(document.getElementById('svc-price').value) || 0;
        const material = parseInt(document.getElementById('svc-material').value) || 0;
        const retouch = parseInt(document.getElementById('svc-retouch').value) || null;
        const dur = parseInt(document.getElementById('svc-dur').value) || 60;
        const cat = document.getElementById('svc-cat').value;
        try {
          await createTemplate({ name, default_price: price, material_cost: material, default_duration_min: dur, category: cat, retouch_period_days: retouch });
          if (window.hapticLight) window.hapticLight();
          await loadServiceTemplates();
          document.getElementById('svc-list').innerHTML = _renderList(_cache);
          document.getElementById('svc-name').value = '';
          document.getElementById('svc-price').value = '';
          const mat = document.getElementById('svc-material');
          if (mat) mat.value = '';
          const ret = document.getElementById('svc-retouch');
          if (ret) ret.value = '';
        } catch (e) {
          showToast('추가 실패: ' + (window._humanError ? window._humanError(e) : e.message), 'error');
        }
      });
      document.getElementById('svc-list')?.addEventListener('click', async (e) => {
        const id = e.target.getAttribute('data-del');
        const consId = e.target.getAttribute('data-cons');
        const retouchId = e.target.getAttribute('data-retouch');
        if (consId) return _openConsumptions(consId);
        if (retouchId) return _editRetouchPeriod(retouchId);
        if (!id) return;
        { const _ok = window._confirm2 ? window._confirm2('이 시술을 삭제할까요?') : confirm('이 시술을 삭제할까요?'); if (!_ok) return; }
        try {
          await deleteTemplate(id);
          await loadServiceTemplates();
          document.getElementById('svc-list').innerHTML = _renderList(_cache);
        } catch (err) {
          showToast('삭제 실패', 'error');
        }
      });
    }, 50);
  }

  async function _editRetouchPeriod(id) {
    const svc = _cache.find(x => String(x.id) === String(id));
    const cur = svc?.retouch_period_days || '';
    const val = prompt('리터치 안내를 며칠 뒤에 띄울까요?', String(cur));
    if (val == null) return;
    const days = parseInt(val, 10);
    if (!days || days < 1) return showToast('1 이상의 숫자를 입력해 주세요.', 'warning');
    try {
      await updateTemplate(id, { retouch_period_days: days });
      await loadServiceTemplates();
      const list = document.getElementById('svc-list');
      if (list) list.innerHTML = _renderList(_cache);
    } catch (e) {
      showToast('저장 실패', 'error');
    }
  }

  async function _openConsumptions(serviceId) {
    const svc = _cache.find(x => String(x.id) === String(serviceId));
    await Promise.all([loadInventoryItems(), loadConsumptions(serviceId).then(r => { window._svcConsRows = r; })]);
    const rows = window._svcConsRows || [];
    const body = `
      <div style="padding:8px 0 14px;border-bottom:1px solid #eee;margin-bottom:14px;">
        <div style="font-weight:800;margin-bottom:8px;">${_esc(svc?.name || '시술')} 재료 소모</div>
        <div style="display:grid;grid-template-columns:1fr 88px;gap:6px;">
          <select id="cons-inv" style="padding:10px;border:1px solid #ddd;border-radius:8px;">
            ${_inventoryCache.map(i => `<option value="${i.id}">${_esc(i.name)} (${_esc(i.unit || '개')})</option>`).join('')}
          </select>
          <input id="cons-qty" type="number" step="0.1" placeholder="소모량" style="padding:10px;border:1px solid #ddd;border-radius:8px;">
        </div>
        <button id="cons-add" style="width:100%;margin-top:8px;padding:11px;border:none;border-radius:8px;background:#111;color:#fff;font-weight:800;">추가</button>
      </div>
      <div id="cons-list">${_renderConsRows(serviceId, rows)}</div>
    `;
    window.openSheet({ title: '재료 소모', body });
    setTimeout(() => _bindConsumptionEvents(serviceId), 50);
  }

  function _renderConsRows(serviceId, rows) {
    if (!_inventoryCache.length) return '<div style="padding:20px;color:#888;text-align:center;">먼저 재고를 추가해 주세요.</div>';
    if (!rows.length) return '<div style="padding:20px;color:#888;text-align:center;">연결된 재료가 없어요.</div>';
    return rows.map(r => `
      <div style="display:flex;align-items:center;gap:8px;padding:10px;border:1px solid #eee;border-radius:10px;margin-bottom:8px;">
        <div style="flex:1;">
          <div style="font-weight:800;">${_esc(r.inventory_name)}</div>
          <div style="font-size:12px;color:#777;">${Number(r.consumption_qty || 0).toLocaleString()}${_esc(r.inventory_unit || '')}</div>
        </div>
        <button data-cons-del="${r.id}" data-service-id="${serviceId}" style="border:1px solid #eee;background:#fff;border-radius:8px;padding:7px 10px;">삭제</button>
      </div>
    `).join('');
  }

  function _bindConsumptionEvents(serviceId) {
    document.getElementById('cons-add')?.addEventListener('click', async () => {
      const inventoryId = parseInt(document.getElementById('cons-inv')?.value, 10);
      const qty = parseFloat(document.getElementById('cons-qty')?.value);
      if (!inventoryId || !qty || qty <= 0) return showToast('재료와 소모량을 입력해 주세요.', 'warning');
      await createConsumption(serviceId, { inventory_id: inventoryId, consumption_qty: qty });
      const rows = await loadConsumptions(serviceId);
      document.getElementById('cons-list').innerHTML = _renderConsRows(serviceId, rows);
      document.getElementById('cons-qty').value = '';
      if (window.showToast) window.showToast('저장 완료');
    });
    document.getElementById('cons-list')?.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-cons-del');
      if (!id) return;
      await deleteConsumption(serviceId, id);
      const rows = await loadConsumptions(serviceId);
      document.getElementById('cons-list').innerHTML = _renderConsRows(serviceId, rows);
    });
  }

  window.openServiceTemplates = openServiceTemplates;
  window.loadServiceTemplates = loadServiceTemplates;
  window._serviceTemplatesCache = _cache;
})();
