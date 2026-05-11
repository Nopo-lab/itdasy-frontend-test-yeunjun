/* Phase 8 C2 — 대기자 목록 UI */
(function () {
  'use strict';

  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch])); }

  async function _apiGet(path) {
    const res = await fetch(window.API + path, { headers: window.authHeader() });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }
  async function _apiPost(path, body) {
    const res = await fetch(window.API + path, {
      method: 'POST',
      headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'HTTP ' + res.status);
    }
    return await res.json();
  }
  async function _apiDelete(path) {
    const res = await fetch(window.API + path, { method: 'DELETE', headers: window.authHeader() });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }

  function _fmt(s) {
    const d = new Date(s);
    if (isNaN(d)) return s;
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  }

  function _renderList(body, items) {
    if (!items.length) {
      body.innerHTML = `
        <div style="padding:40px 20px;text-align:center;">
          <div style="font-size:40px;margin-bottom:10px;">📋</div>
          <div style="font-size:13px;color:var(--text-muted);">대기자가 없어요</div>
          <div style="font-size:11px;color:var(--text-subtle);margin-top:4px;">"+ 새 대기자" 로 등록</div>
        </div>`;
      return;
    }
    body.innerHTML = items.map(w => {
      const color = w.status === 'matched' ? '#388e3c' : w.status === 'closed' ? '#888' : 'var(--brand)';
      const badge = { waiting: '대기중', matched: '자리남', closed: '종료' }[w.status] || w.status;
      return `
      <div style="background:#fff;border:1px solid #eee;border-radius:12px;padding:12px;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <strong style="font-size:14px;">${_esc(w.customer_name)}</strong>
          <span style="font-size:11px;color:${color};background:${color}15;padding:2px 8px;border-radius:100px;font-weight:700;">${badge}</span>
          <button class="wl-del" data-id="${w.id}" style="margin-left:auto;background:transparent;border:none;color:#ccc;cursor:pointer;font-size:15px;">✕</button>
        </div>
        <div style="font-size:12px;color:var(--text-muted);">
          ${w.phone ? `📞 ${_esc(w.phone)} · ` : ''}${_fmt(w.preferred_date_from)} ~ ${_fmt(w.preferred_date_to)}
          ${w.preferred_service ? ` · ${_esc(w.preferred_service)}` : ''}
        </div>
        ${w.memo ? `<div style="font-size:11px;color:#888;margin-top:4px;">${_esc(w.memo)}</div>` : ''}
      </div>`;
    }).join('');

    body.querySelectorAll('.wl-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('대기자를 삭제할까요?')) return;
        await _apiDelete('/waiting-list/' + btn.dataset.id);
        await _reload();
      });
    });
  }

  let _overlay = null;

  async function _reload() {
    if (!_overlay) return;
    const body = _overlay.querySelector('.wl-body');
    body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-subtle);">불러오는 중…</div>';
    try {
      const d = await _apiGet('/waiting-list');
      _renderList(body, d.items || []);
    } catch (e) {
      body.innerHTML = `<div style="padding:40px;text-align:center;color:#c00;">불러오기 실패: ${_esc(e.message)}</div>`;
    }
  }

  function _buildAddForm() {
    const today = new Date().toISOString().slice(0, 10);
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    return `
      <div style="background:#fff;border-radius:16px;padding:24px;max-width:420px;width:90%;">
        <strong style="font-size:16px;">새 대기자 추가</strong>
        <div style="margin-top:14px;display:flex;flex-direction:column;gap:10px;">
          <input id="wl-name" placeholder="고객 이름" style="padding:11px 14px;border:1px solid #ddd;border-radius:10px;font-size:14px;">
          <input id="wl-phone" placeholder="전화번호 (선택)" style="padding:11px 14px;border:1px solid #ddd;border-radius:10px;font-size:14px;">
          <div style="display:flex;gap:8px;">
            <input id="wl-from" type="date" value="${today}" style="flex:1;padding:11px 14px;border:1px solid #ddd;border-radius:10px;font-size:14px;">
            <input id="wl-to" type="date" value="${nextWeek}" style="flex:1;padding:11px 14px;border:1px solid #ddd;border-radius:10px;font-size:14px;">
          </div>
          <input id="wl-service" placeholder="원하는 시술 (선택)" style="padding:11px 14px;border:1px solid #ddd;border-radius:10px;font-size:14px;">
          <textarea id="wl-memo" placeholder="메모 (선택)" rows="2" style="padding:11px 14px;border:1px solid #ddd;border-radius:10px;font-size:14px;resize:none;"></textarea>
        </div>
        <div style="display:flex;gap:10px;margin-top:18px;">
          <button class="wl-form-cancel" style="flex:1;padding:12px;border:1px solid #ddd;background:#fff;border-radius:10px;font-weight:700;cursor:pointer;">취소</button>
          <button class="wl-form-save" style="flex:2;padding:12px;border:none;background:linear-gradient(135deg,var(--brand),var(--brand-strong));color:#fff;border-radius:10px;font-weight:800;cursor:pointer;">등록</button>
        </div>
      </div>`;
  }

  async function _submitAdd(form) {
    const name = form.querySelector('#wl-name').value.trim();
    const phone = form.querySelector('#wl-phone').value.trim();
    const fromDate = form.querySelector('#wl-from').value;
    const toDate = form.querySelector('#wl-to').value;
    const service = form.querySelector('#wl-service').value.trim();
    const memo = form.querySelector('#wl-memo').value.trim();
    if (!name) { if (window.showToast) window.showToast('이름 필수'); return; }
    try {
      await _apiPost('/waiting-list', {
        customer_name: name,
        phone: phone || undefined,
        preferred_date_from: fromDate + 'T00:00:00',
        preferred_date_to: toDate + 'T23:59:59',
        preferred_service: service || undefined,
        memo: memo || undefined,
      });
      form.remove();
      if (window.showToast) window.showToast('대기자 등록됨');
      await _reload();
    } catch (e) {
      if (window.showToast) window.showToast('실패: ' + (window._humanError ? window._humanError(e) : e.message));
    }
  }

  function _openAddForm() {
    const form = document.createElement('div');
    form.style.cssText = 'position:fixed;inset:0;z-index:10500;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
    form.innerHTML = _buildAddForm();
    document.body.appendChild(form);
    form.querySelector('.wl-form-cancel').addEventListener('click', () => form.remove());
    form.addEventListener('click', e => { if (e.target === form) form.remove(); });
    form.querySelector('.wl-form-save').addEventListener('click', () => _submitAdd(form));
  }

  async function openWaitingList() {
    _overlay = document.createElement('div');
    _overlay.id = 'waitingListSheet';
    _overlay.style.cssText = 'position:fixed;inset:0;z-index:9400;background:rgba(0,0,0,0.5);display:flex;align-items:flex-end;justify-content:center;';
    _overlay.innerHTML = `
      <div style="width:100%;max-width:520px;background:#fafafa;border-radius:24px 24px 0 0;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:18px 20px 14px;background:#fff;border-bottom:1px solid #eee;">
          <div style="width:36px;height:4px;background:#e0e0e0;border-radius:2px;margin:0 auto 14px;"></div>
          <div style="display:flex;align-items:center;gap:8px;">
            <strong style="font-size:17px;">대기자 목록</strong>
            <button class="wl-add" style="margin-left:auto;padding:8px 14px;background:linear-gradient(135deg,var(--brand),var(--brand-strong));color:#fff;border:none;border-radius:100px;font-weight:700;font-size:12px;cursor:pointer;">+ 새 대기자</button>
            <button class="wl-close" style="background:none;border:none;font-size:18px;color:#888;cursor:pointer;">✕</button>
          </div>
          <div style="font-size:11px;color:#888;margin-top:6px;">예약 취소되면 자리 난 대기자에게 자동 알림</div>
        </div>
        <div class="wl-body" style="flex:1;overflow-y:auto;padding:14px;"></div>
      </div>`;
    document.body.appendChild(_overlay);
    _overlay.querySelector('.wl-close').addEventListener('click', () => { _overlay.remove(); _overlay = null; });
    _overlay.addEventListener('click', e => { if (e.target === _overlay) { _overlay.remove(); _overlay = null; } });
    _overlay.querySelector('.wl-add').addEventListener('click', _openAddForm);
    await _reload();
  }

  window.openWaitingList = openWaitingList;
})();
