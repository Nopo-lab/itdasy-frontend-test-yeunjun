/* ─────────────────────────────────────────────────────────────
   네이버 플레이스 리뷰 수동 저장 (Phase 3 P3.1)
   엔드포인트:
   - GET    /naver-reviews
   - POST   /naver-reviews
   - PATCH  /naver-reviews/{id}
   - DELETE /naver-reviews/{id}

   네이버 자동 크롤링은 ToS 이슈. 사용자가 복붙으로 수동 입력.
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const OFFLINE_KEY = 'itdasy_naver_reviews_offline_v1';
  let _items = [];
  let _isOffline = false;

  function _uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'nr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
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

  async function list() {
    try {
      const d = await _api('GET', '/naver-reviews');
      _isOffline = false;
      _items = d.items || [];
      return _items;
    } catch (e) {
      if (e.message === 'endpoint-missing' || e.message === 'no-token') {
        _isOffline = true;
        _items = _loadOffline();
        return _items;
      }
      throw e;
    }
  }

  async function create(payload) {
    const data = {
      review_url: payload.review_url || null,
      author_name: payload.author_name || null,
      rating: payload.rating != null ? parseInt(payload.rating, 10) : null,
      content: payload.content || null,
      visited_at: payload.visited_at || null,
      sticker_image_url: payload.sticker_image_url || null,
    };
    if (_isOffline) {
      const record = { id: _uuid(), shop_id: localStorage.getItem('shop_id') || 'offline', ...data, content: data.content || '', created_at: new Date().toISOString() };
      const all = _loadOffline();
      all.unshift(record);
      _saveOffline(all);
      _items.unshift(record);
      return record;
    }
    const created = await _api('POST', '/naver-reviews', data);
    _items.unshift(created);
    return created;
  }

  async function update(id, patch) {
    if (_isOffline) {
      const all = _loadOffline();
      const i = all.findIndex(x => x.id === id);
      if (i < 0) throw new Error('not-found');
      all[i] = { ...all[i], ...patch };
      _saveOffline(all);
      const j = _items.findIndex(x => x.id === id);
      if (j >= 0) _items[j] = all[i];
      return all[i];
    }
    const updated = await _api('PATCH', '/naver-reviews/' + id, patch);
    const j = _items.findIndex(x => x.id === id);
    if (j >= 0) _items[j] = updated;
    return updated;
  }

  async function remove(id) {
    if (_isOffline) {
      const all = _loadOffline().filter(x => x.id !== id);
      _saveOffline(all);
      _items = _items.filter(x => x.id !== id);
      return { ok: true };
    }
    await _api('DELETE', '/naver-reviews/' + id);
    _items = _items.filter(x => x.id !== id);
    return { ok: true };
  }

  function _starLine(rating) {
    if (!rating) return '';
    const full = Math.max(0, Math.min(5, parseInt(rating, 10)));
    return '★'.repeat(full) + '☆'.repeat(5 - full);
  }

  // ── UI ──────────────────────────────────────────────────
  function _ensureSheet() {
    let sheet = document.getElementById('naverReviewSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'naverReviewSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9998;display:none;flex-direction:column;';
    sheet.classList.add('dt-overlay');
    sheet.innerHTML = `
      <header class="dt-hdr">
        <button class="dt-back" onclick="closeNaverReviews()" aria-label="뒤로"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>
        <h1 class="dt-title">네이버 리뷰</h1>
        <span id="naverOfflineBadge" class="dt-offline-badge">오프라인</span>
      </header>
      <div class="dt-body">
        <p style="font-size:11px;color:var(--text-subtle);margin:0 0 10px;line-height:1.5;">네이버 플레이스에서 받은 리뷰를 직접 복사해서 저장하세요. 자동 크롤링은 약관상 제한됩니다.</p>
        <div id="naverList"></div>
      </div>
      <footer class="dt-footer">
        <button id="naverAddBtn" class="btn-primary" style="flex:1;">+ 리뷰 추가</button>
      </footer>
    `;
    document.body.appendChild(sheet);
    sheet.querySelector('#naverAddBtn').addEventListener('click', () => _openAddForm());
    return sheet;
  }

  function _rerender() {
    const sheet = document.getElementById('naverReviewSheet');
    if (!sheet) return;
    sheet.querySelector('#naverOfflineBadge').style.display = _isOffline ? 'inline-block' : 'none';
    const listEl = sheet.querySelector('#naverList');
    if (!_items.length) {
      listEl.innerHTML = '<div class="dt-empty">아직 저장된 리뷰가 없어요</div>';
      return;
    }
    listEl.innerHTML = '<div class="dt-list">' + _items.map(r => `
      <button class="dt-list-it" data-id="${r.id}" type="button">
        <div class="dt-list-it__main">
          <p class="dt-list-it__title"><span style="color:#FFB800;">${_starLine(r.rating)}</span> ${_esc(r.author_name||'익명')}${r.visited_at ? ` <span style="font-size:10px;font-weight:400;color:var(--text-subtle);">${_esc(r.visited_at)}</span>` : ''}</p>
          ${r.content ? `<p class="dt-list-it__sub">${_esc(r.content).slice(0, 80)}${r.content.length > 80 ? '…' : ''}</p>` : ''}
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    `).join('') + '</div>';
    listEl.querySelectorAll('[data-id]').forEach(row => row.addEventListener('click', () => _openAddForm(row.dataset.id)));
  }

  function _openAddForm(id) {
    const existing = id ? _items.find(r => r.id === id) : null;
    const sheet = document.getElementById('naverReviewSheet');
    if (!sheet) return;
    const listEl = sheet.querySelector('#naverList');
    listEl.innerHTML = `
      <button onclick="window._naverBack()" class="dt-back" style="margin-bottom:12px;" aria-label="뒤로"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>
      <div class="dt-field-row"><label class="dt-field-lbl">네이버 리뷰 URL (선택)</label><input id="nrUrl" class="dt-field" value="${_esc(existing?.review_url||'')}" placeholder="https://pcmap.place.naver.com/..." maxlength="500" /></div>
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <div style="flex:1;"><label class="dt-field-lbl">작성자</label><input id="nrAuthor" class="dt-field" value="${_esc(existing?.author_name||'')}" maxlength="50" /></div>
        <div style="width:100px;"><label class="dt-field-lbl">평점</label><select id="nrRating" class="dt-field"><option value="">없음</option>${[5,4,3,2,1].map(n => `<option value="${n}" ${existing?.rating === n ? 'selected' : ''}>${'★'.repeat(n)}</option>`).join('')}</select></div>
      </div>
      <div class="dt-field-row"><label class="dt-field-lbl">방문일 (YYYY-MM-DD)</label><input id="nrVisited" type="date" class="dt-field" value="${_esc(existing?.visited_at||'')}" /></div>
      <div class="dt-field-row"><label class="dt-field-lbl">리뷰 내용 *</label><textarea id="nrContent" class="dt-field" rows="4" maxlength="2000" placeholder="네이버에서 복사한 리뷰 본문">${_esc(existing?.content||'')}</textarea></div>
      <div style="display:flex;gap:8px;margin-top:8px;">
        <button type="button" id="nrSave" class="btn-primary" style="flex:1;">${existing ? '수정' : '저장'}</button>
        ${existing ? '<button type="button" id="nrDelete" class="btn-secondary" style="color:var(--danger);">삭제</button>' : ''}
      </div>
    `;
    listEl.querySelector('#nrSave').addEventListener('click', async () => {
      const payload = {
        review_url: document.getElementById('nrUrl').value.trim() || null,
        author_name: document.getElementById('nrAuthor').value.trim() || null,
        rating: document.getElementById('nrRating').value || null,
        visited_at: document.getElementById('nrVisited').value || null,
        content: document.getElementById('nrContent').value.trim() || null,
      };
      if (!payload.content) { if (window.showToast) window.showToast('내용을 입력해 주세요'); return; }
      try {
        if (existing) await update(existing.id, payload);
        else await create(payload);
        if (window.hapticLight) window.hapticLight();
        if (window.showToast) window.showToast(existing ? '수정 완료' : '저장 완료');
        _rerender();
      } catch (e) {
        if (window.showToast) window.showToast('저장 실패');
      }
    });
    if (existing) {
      listEl.querySelector('#nrDelete').addEventListener('click', async () => {
        if (!confirm('이 리뷰를 삭제할까요?')) return;
        try { await remove(existing.id); if (window.hapticLight) window.hapticLight(); _rerender(); }
        catch (e) { if (window.showToast) window.showToast('삭제 실패'); }
      });
    }
  }

  window._naverBack = _rerender;

  window.openNaverReviews = async function () {
    const sheet = _ensureSheet();
    sheet.style.display = 'flex';
    sheet.classList.add('dt-shown');
    document.body.style.overflow = 'hidden';
    const listEl = sheet.querySelector('#naverList');
    listEl.innerHTML = '<div class="dt-loading">불러오는 중…</div>';
    try {
      await list();
      _rerender();
    } catch (e) {
      listEl.innerHTML = '<div class="dt-error">불러오기 실패</div>';
    }
  };

  window.closeNaverReviews = function () {
    const sheet = document.getElementById('naverReviewSheet');
    if (sheet) { sheet.style.display = 'none'; sheet.classList.remove('dt-shown'); }
    document.body.style.overflow = '';
  };

  window.NaverReview = {
    list, create, update, remove,
    get _items() { return _items; },
    get isOffline() { return _isOffline; },
  };
})();
