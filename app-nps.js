/* ─────────────────────────────────────────────────────────────
   NPS 응답 수집 (Phase 3 P3.2)
   엔드포인트:
   - GET    /nps
   - POST   /nps
   - DELETE /nps/{id}
   - GET    /nps/stats
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const OFFLINE_KEY = 'itdasy_nps_offline_v1';
  let _items = [];
  let _stats = null;
  let _isOffline = false;

  function _uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }
  function _loadOffline() {
    try { return JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]'); }
    catch (_) { return []; }
  }
  function _saveOffline(list) {
    try { localStorage.setItem(OFFLINE_KEY, JSON.stringify(list)); } catch (_) { /* storage full — ignore */ }
  }

  async function _api(method, path, body) {
    if (!window.API || !window.authHeader) throw new Error('no-auth');
    const auth = window.authHeader();
    if (!auth?.Authorization) throw new Error('no-token');
    const opts = { method, headers: { ...auth, 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(window.API + path, opts);
    if (res.status === 404 || res.status === 501) throw new Error('endpoint-missing');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.status === 204 ? null : await res.json();
  }

  function _computeStatsLocal(items) {
    const total = items.length;
    if (total === 0) return { total: 0, promoters: 0, passives: 0, detractors: 0, score: 0, avg_rating: 0 };
    const promoters = items.filter(i => i.rating >= 9).length;
    const detractors = items.filter(i => i.rating <= 6).length;
    const passives = total - promoters - detractors;
    const score = Math.round(((promoters - detractors) * 100 / total) * 10) / 10;
    const avg = Math.round((items.reduce((s, i) => s + (i.rating || 0), 0) / total) * 100) / 100;
    return { total, promoters, passives, detractors, score, avg_rating: avg };
  }

  async function list() {
    try {
      const d = await _api('GET', '/nps');
      _isOffline = false;
      _items = d.items || [];
      try { _stats = await _api('GET', '/nps/stats'); } catch (_) { _stats = _computeStatsLocal(_items); }
      return _items;
    } catch (e) {
      if (e.message === 'endpoint-missing' || e.message === 'no-token') {
        _isOffline = true;
        _items = _loadOffline();
        _stats = _computeStatsLocal(_items);
        return _items;
      }
      throw e;
    }
  }

  async function create(payload) {
    const rating = parseInt(payload.rating, 10);
    if (!Number.isFinite(rating) || rating < 0 || rating > 10) throw new Error('rating-out-of-range');
    const data = {
      rating,
      comment: payload.comment ? String(payload.comment).slice(0, 500) : null,
      customer_id: payload.customer_id || null,
      customer_name: payload.customer_name || null,
      source: payload.source || 'manual',
    };
    if (_isOffline) {
      const record = { id: _uuid(), shop_id: localStorage.getItem('shop_id') || 'offline', ...data, responded_at: new Date().toISOString(), created_at: new Date().toISOString() };
      const all = _loadOffline();
      all.unshift(record);
      _saveOffline(all);
      _items.unshift(record);
      _stats = _computeStatsLocal(_items);
      return record;
    }
    const created = await _api('POST', '/nps', data);
    _items.unshift(created);
    try { _stats = await _api('GET', '/nps/stats'); } catch (_) { /* ignore */ }
    return created;
  }

  async function remove(id) {
    if (_isOffline) {
      const all = _loadOffline().filter(i => i.id !== id);
      _saveOffline(all);
      _items = _items.filter(i => i.id !== id);
      _stats = _computeStatsLocal(_items);
      return { ok: true };
    }
    await _api('DELETE', '/nps/' + id);
    _items = _items.filter(i => i.id !== id);
    try { _stats = await _api('GET', '/nps/stats'); } catch (_) { /* ignore */ }
    return { ok: true };
  }

  // ── UI ──────────────────────────────────────────────────
  function _ensureSheet() {
    let sheet = document.getElementById('npsSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'npsSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9998;display:none;flex-direction:column;';
    sheet.classList.add('dt-overlay');
    sheet.innerHTML = `
      <header class="dt-hdr">
        <button class="dt-back" onclick="closeNps()" aria-label="뒤로"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>
        <h1 class="dt-title">고객 만족도 (NPS)</h1>
        <span id="npsOfflineBadge" class="dt-offline-badge">오프라인</span>
      </header>
      <div class="dt-body">
        <div id="npsStats"></div>
        <div id="npsList"></div>
      </div>
      <footer class="dt-footer">
        <button id="npsAddBtn" class="btn-primary" style="flex:1;">+ 응답 입력</button>
      </footer>
    `;
    document.body.appendChild(sheet);
    sheet.querySelector('#npsAddBtn').addEventListener('click', _openAddForm);
    return sheet;
  }

  function _renderStats(s) {
    if (!s || s.total === 0) {
      return '<div class="dt-empty" style="padding:14px;">아직 응답 없음</div>';
    }
    return `
      <div class="dt-nps-hero">
        <div>
          <div class="dt-nps-hero__label">NPS 점수 · ${s.total}명</div>
          <div class="dt-nps-hero__score">${s.score}</div>
          <div class="dt-nps-hero__pills">
            <div class="dt-nps-pill">😍 추천 ${s.promoters}</div>
            <div class="dt-nps-pill">😐 중립 ${s.passives}</div>
            <div class="dt-nps-pill">😞 비추 ${s.detractors}</div>
          </div>
        </div>
      </div>
    `;
  }

  function _renderRow(r) {
    const face = r.rating >= 9 ? '😍' : r.rating >= 7 ? '😐' : '😞';
    const t = new Date(r.responded_at || r.created_at);
    const date = `${t.getMonth() + 1}/${t.getDate()}`;
    return `
      <div class="dt-list-it" style="cursor:default;">
        <div class="dt-list-it__main">
          <p class="dt-list-it__title">${face} <strong>${r.rating}</strong>${r.customer_name ? ` · ${_esc(r.customer_name)}` : ''}<span style="float:right;font-size:11px;font-weight:400;color:var(--text-subtle);">${date}</span></p>
          ${r.comment ? `<p class="dt-list-it__sub">${_esc(r.comment)}</p>` : ''}
        </div>
        <button data-del="${r.id}" class="dt-back" style="color:var(--danger);" type="button" aria-label="삭제"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>
      </div>
    `;
  }

  function _rerender() {
    const sheet = document.getElementById('npsSheet');
    if (!sheet) return;
    sheet.querySelector('#npsStats').innerHTML = _renderStats(_stats);
    sheet.querySelector('#npsOfflineBadge').style.display = _isOffline ? 'inline-block' : 'none';
    const listEl = sheet.querySelector('#npsList');
    if (!_items.length) {
      listEl.innerHTML = '<div class="dt-empty">아직 응답이 없어요</div>';
      return;
    }
    listEl.innerHTML = '<div class="dt-list">' + _items.map(_renderRow).join('') + '</div>';
    listEl.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => _deleteEntry(btn.dataset.del)));
  }

  function _openAddForm() {
    const sheet = document.getElementById('npsSheet');
    if (!sheet) return;
    const listEl = sheet.querySelector('#npsList');
    listEl.innerHTML = `
      <button onclick="window._npsBack()" class="dt-back" style="margin-bottom:12px;" aria-label="뒤로"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>
      <div class="dt-field-row"><label class="dt-field-lbl">추천 점수 (0~10) *</label><input id="nfRating" type="range" min="0" max="10" value="8" style="width:100%;margin-bottom:4px;" /></div>
      <div id="nfRatingLabel" style="text-align:center;font-size:32px;font-weight:800;color:var(--brand);margin-bottom:10px;">8</div>
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:12px;">
        <input id="nfCustomerName" readonly class="dt-field" style="flex:1;" placeholder="고객 (선택)" />
        <button type="button" id="nfCustomerPick" class="btn-secondary">👤 선택</button>
      </div>
      <div class="dt-field-row"><label class="dt-field-lbl">코멘트 (선택)</label><textarea id="nfComment" class="dt-field" rows="3" maxlength="500"></textarea></div>
      <button type="button" id="nfSave" class="btn-primary" style="width:100%;margin-top:8px;">저장</button>
    `;
    const ratingEl = document.getElementById('nfRating');
    const labelEl = document.getElementById('nfRatingLabel');
    ratingEl.addEventListener('input', () => { labelEl.textContent = ratingEl.value; });
    let customer_id = null;
    listEl.querySelector('#nfCustomerPick').addEventListener('click', async () => {
      if (!window.Customer || !window.Customer.pick) { if (window.showToast) window.showToast('고객 모듈 로드 중…'); return; }
      const picked = await window.Customer.pick();
      if (picked === null) return;
      customer_id = picked.id;
      listEl.querySelector('#nfCustomerName').value = picked.name || '';
    });
    listEl.querySelector('#nfSave').addEventListener('click', async () => {
      try {
        await create({
          rating: parseInt(ratingEl.value, 10),
          comment: document.getElementById('nfComment').value.trim() || null,
          customer_id,
          customer_name: listEl.querySelector('#nfCustomerName').value.trim() || null,
        });
        if (window.hapticLight) window.hapticLight();
        if (window.showToast) window.showToast('저장 완료');
        _rerender();
      } catch (e) {
        if (window.showToast) window.showToast('저장 실패');
      }
    });
  }

  window._npsBack = _rerender;

  async function _deleteEntry(id) {
    if (!confirm('이 응답을 삭제할까요?')) return;
    try {
      await remove(id);
      if (window.hapticLight) window.hapticLight();
      _rerender();
    } catch (e) {
      if (window.showToast) window.showToast('삭제 실패');
    }
  }

  window.openNps = async function () {
    const sheet = _ensureSheet();
    sheet.style.display = 'flex';
    sheet.classList.add('dt-shown');
    document.body.style.overflow = 'hidden';
    const listEl = sheet.querySelector('#npsList');
    listEl.innerHTML = '<div class="dt-loading">불러오는 중…</div>';
    try {
      await list();
      _rerender();
    } catch (e) {
      listEl.innerHTML = '<div class="dt-error">불러오기 실패</div>';
    }
  };

  window.closeNps = function () {
    const sheet = document.getElementById('npsSheet');
    if (sheet) { sheet.style.display = 'none'; sheet.classList.remove('dt-shown'); }
    document.body.style.overflow = '';
  };

  window.Nps = {
    list, create, remove,
    get _items() { return _items; },
    get _stats() { return _stats; },
    get isOffline() { return _isOffline; },
  };
})();
