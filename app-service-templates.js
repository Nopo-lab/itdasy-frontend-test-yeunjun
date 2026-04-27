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
          </div>
        </div>
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
        <div style="display:flex;gap:6px;align-items:center;">
          <select id="svc-cat" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;">
            <option value="etc">기타</option><option value="hair">헤어</option>
            <option value="nail">네일</option><option value="eye">속눈썹</option>
            <option value="skin">피부</option><option value="wax">왁싱</option>
          </select>
          <button id="svc-add" style="padding:10px 16px;background:linear-gradient(135deg,#F18091,#D95F70);color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">추가</button>
        </div>
      </div>
      <div id="svc-list">${_renderList(_cache)}</div>
    `;
    window.openSheet({ title: '시술 프리셋', body: inputFormHtml });

    setTimeout(() => {
      const addBtn = document.getElementById('svc-add');
      if (addBtn) addBtn.addEventListener('click', async () => {
        const name = document.getElementById('svc-name').value.trim();
        if (!name) return alert('시술 이름을 입력해주세요.');
        const price = parseInt(document.getElementById('svc-price').value) || 0;
        const material = parseInt(document.getElementById('svc-material').value) || 0;
        const dur = parseInt(document.getElementById('svc-dur').value) || 60;
        const cat = document.getElementById('svc-cat').value;
        try {
          await createTemplate({ name, default_price: price, material_cost: material, default_duration_min: dur, category: cat });
          if (window.hapticLight) window.hapticLight();
          await loadServiceTemplates();
          document.getElementById('svc-list').innerHTML = _renderList(_cache);
          document.getElementById('svc-name').value = '';
          document.getElementById('svc-price').value = '';
          const mat = document.getElementById('svc-material');
          if (mat) mat.value = '';
        } catch (e) {
          alert('추가 실패: ' + (window._humanError ? window._humanError(e) : e.message));
        }
      });
      document.getElementById('svc-list')?.addEventListener('click', async (e) => {
        const id = e.target.getAttribute('data-del');
        if (!id) return;
        { const _ok = window._confirm2 ? window._confirm2('이 시술을 삭제할까요?') : confirm('이 시술을 삭제할까요?'); if (!_ok) return; }
        try {
          await deleteTemplate(id);
          await loadServiceTemplates();
          document.getElementById('svc-list').innerHTML = _renderList(_cache);
        } catch (err) {
          alert('삭제 실패');
        }
      });
    }, 50);
  }

  window.openServiceTemplates = openServiceTemplates;
  window.loadServiceTemplates = loadServiceTemplates;
  window._serviceTemplatesCache = _cache;
})();
