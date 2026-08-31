/* Phase 9 P5 — 리뷰 요청 관리: localStorage 캐시 + /customer-reviews API 연결 */
(function () {
  'use strict';

  const KEY = 'itdasy_review_requests_v1';

  function _esc(s) { return window._esc(s); } /* [2026-06-11] 중복 제거 — app-core 정본 위임 */
  function _toast(msg) { if (window.showToast) window.showToast(msg); }
  function _brand() {
    const bk = (window.BrandKit && typeof window.BrandKit.get === 'function') ? window.BrandKit.get() : {};
    return {
      tone: String(bk.brand_tone || '').trim(),
      bookingPhrase: String(bk.booking_phrase || '').trim(),
      forbiddenWords: String(bk.forbidden_words || '').split(/[,，\n]/).map(v => v.trim()).filter(Boolean),
    };
  }

  function _safeDraft(text, brand) {
    let out = String(text || '');
    const policy = window.ItdasyMarketingDraftPolicy;
    if (policy && typeof policy.sanitize === 'function') out = policy.sanitize(out);
    (brand.forbiddenWords || []).forEach(word => {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(escaped, 'g'), '');
    });
    return out.replace(/\s{2,}/g, ' ').trim();
  }

  function _api(method, path, body) {
    if (!window.API || !window.authHeader) return Promise.reject(new Error('no-auth'));
    return apiFetch(path, {
      method,
      headers: { ...window.authHeader(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }).then(r => {
      if (r.status === 204) return null;
      if (!r.ok) return r.json().catch(() => ({})).then(d => { throw new Error(d.detail || 'HTTP ' + r.status); });
      return r.json();
    });
  }

  let _items = [];
  function _cached() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; } }
  function _setCache(items) { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (_) { void _; } }

  // [죽은동작 정리 2026-07-27] 오프라인에서 만든 리뷰요청(tmp_ id)을 서버로 재전송.
  //   예전엔 _loadFromServer 가 _items 를 서버목록으로 통째 교체해 tmp_ 가 소실됐고,
  //   PATCH/DELETE 도 tmp_ 를 스킵해 영영 미동기화였다. 성공분만 실 항목으로 교체.
  async function _flushTmp() {
    const tmps = _items.filter((r) => String(r.id).startsWith('tmp_'));
    if (!tmps.length) return;
    for (const t of tmps) {
      try {
        const real = await _api('POST', '/customer-reviews', {
          customer_id: t.customer_id || null,
          customer_name: t.customer_name,
          review_link: t.review_link || '',
        });
        const idx = _items.findIndex((r) => r.id === t.id);
        if (idx >= 0) _items[idx] = real; else _items.unshift(real);
      } catch (_e) { break; }  // 여전히 오프라인 → 다음 기회에 재시도(보존)
    }
    _setCache(_items);
    try { _render(); } catch (_e) { void _e; }
  }

  async function _loadFromServer() {
    try {
      const data = await _api('GET', '/customer-reviews');
      const server = (data && data.items) ? data.items : [];
      // 오프라인 생성분(tmp_)은 서버에 없어 덮이면 사라진다 → 앞에 보존 후 flush.
      const pendingTmp = _cached().filter((r) => String(r.id).startsWith('tmp_'));
      _items = pendingTmp.length ? pendingTmp.concat(server) : server;
      _setCache(_items);
      if (pendingTmp.length) _flushTmp();
    } catch (_e) {
      _items = _cached();
    }
  }

  function _message(item) {
    const name = item.customer_name || '고객님';
    const link = item.review_link || item.link || '';
    const brand = _brand();
    const soft = /친근|따뜻|부드/.test(brand.tone);
    const base = soft
      ? `${name}, 오늘 함께해 주셔서 감사해요. 괜찮으셨다면 짧은 리뷰 한 줄 부탁드려도 될까요? 남겨주신 리뷰는 큰 힘이 됩니다.`
      : `${name}, 오늘 시술 만족스러우셨다면 짧은 리뷰 부탁드려요. 남겨주신 리뷰는 큰 힘이 됩니다.`;
    return _safeDraft([base, brand.bookingPhrase, link].filter(Boolean).join(' '), brand);
  }

  function _ensure() {
    let el = document.getElementById('reviewRequestSheet');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'reviewRequestSheet';
    el.className = 'p9-sheet';
    el.style.display = 'none';
    el.innerHTML = `
      <div class="p9-sheet__body" role="dialog" aria-modal="true">
        <div class="p9-sheet__head">
          <div class="p9-sheet__title">리뷰 요청</div>
          <button type="button" class="p9-sheet__close ss-close" data-rvreq-close aria-label="닫기"><svg class="ic" width="18" height="18" aria-hidden="true"><use href="#ic-x"/></svg></button>
        </div>
        <div class="p9-sheet__row">
          <input id="rvreqCustomer" readonly placeholder="고객 선택" style="flex:1;min-height:48px;border:1px solid var(--border);border-radius:8px;padding:0 12px;">
          <button type="button" class="p9-sheet__ghost" data-rvreq-pick>선택</button>
        </div>
        <label class="p9-sheet__field" style="margin-top:10px;">리뷰 링크 (선택)
          <input id="rvreqLink" placeholder="네이버/구글 리뷰 링크">
        </label>
        <button type="button" class="p9-sheet__btn" data-rvreq-add>+ 요청 만들기</button>
        <div class="p9-sheet__meta">시술 완료 후 고객에게 문구를 복사해 DM이나 문자로 보내세요.</div>
        <div class="p9-sheet__list" id="rvreqList"></div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', _onClick);
    return el;
  }

  function _statusLabel(s) {
    return { draft: '준비', sent: '발송됨', done: '완료' }[s] || s;
  }

  function _render() {
    const list = document.getElementById('rvreqList');
    if (!list) return;
    if (!_items.length) {
      list.innerHTML = '<div class="p9-sheet__card" style="color:var(--text-subtle);text-align:center;">아직 만든 리뷰 요청이 없어요.</div>';
      return;
    }
    list.innerHTML = _items.map(item => `
      <div class="p9-sheet__card" data-rvreq-id="${item.id}">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-weight:900;">${_esc(item.customer_name || '고객')}</span>
          <span style="font-size:11px;padding:2px 7px;border-radius:20px;background:var(--surface-2);color:var(--text-subtle);">${_statusLabel(item.status)}</span>
        </div>
        <div class="p9-sheet__meta">${(item.created_at || '').slice(0, 10)} · 시술 후 24시간 안에 보내기</div>
        <div class="p9-sheet__row" style="margin-top:10px;">
          <button type="button" class="p9-sheet__ghost" data-rvreq-copy>문구 복사</button>
          <button type="button" class="p9-sheet__ghost" data-rvreq-sent>발송 완료</button>
          <button type="button" class="p9-sheet__ghost" data-rvreq-del>삭제</button>
        </div>
      </div>`).join('');
  }

  async function _pick(ctx) {
    if (!window.Customer?.pick) return _toast('고객 목록을 불러오는 중이에요');
    const picked = await window.Customer.pick({ selectedId: ctx.customer_id });
    if (picked === null) return;
    ctx.customer_id = picked.id || null;
    ctx.customer_name = picked.name || '';
    document.getElementById('rvreqCustomer').value = ctx.customer_name;
  }

  async function _add(ctx) {
    if (!ctx.customer_name) return _toast('고객을 선택해 주세요');
    const body = {
      customer_id: ctx.customer_id || null,
      customer_name: ctx.customer_name,
      review_link: document.getElementById('rvreqLink').value.trim(),
    };
    try {
      const item = await _api('POST', '/customer-reviews', body);
      _items.unshift(item);
      _setCache(_items);
    } catch (_e) {
      _items.unshift({ id: 'tmp_' + Date.now(), ...body, status: 'draft', created_at: new Date().toISOString() });
      _setCache(_items);
    }
    document.getElementById('rvreqCustomer').value = '';
    document.getElementById('rvreqLink').value = '';
    ctx.customer_id = null; ctx.customer_name = '';
    _render();
    _toast('리뷰 요청 생성 완료');
  }

  async function _onClick(e) {
    const el = _ensure();
    if (!el._ctx) el._ctx = {};
    if (e.target === el || e.target.closest('[data-rvreq-close]')) return closeReviewRequests();
    if (e.target.closest('[data-rvreq-pick]')) return _pick(el._ctx);
    if (e.target.closest('[data-rvreq-add]')) return _add(el._ctx);
    const card = e.target.closest('[data-rvreq-id]');
    if (!card) return;
    const id = card.dataset.rvreqId;
    const item = _items.find(r => String(r.id) === String(id));
    if (!item) return;
    if (e.target.closest('[data-rvreq-copy]')) {
      try { await navigator.clipboard.writeText(_message(item)); _toast('문구 복사 완료'); }
      catch (_) { _toast(_message(item)); }
    } else if (e.target.closest('[data-rvreq-sent]')) {
      item.status = 'sent';
      _setCache(_items);
      _render();
      if (!String(id).startsWith('tmp_')) _api('PATCH', '/customer-reviews/' + id, { status: 'sent' }).catch(() => {});
      _toast('발송 완료 처리');
    } else if (e.target.closest('[data-rvreq-del]')) {
      _items = _items.filter(r => String(r.id) !== String(id));
      _setCache(_items);
      _render();
      if (!String(id).startsWith('tmp_')) _api('DELETE', '/customer-reviews/' + id).catch(() => {});
    }
  }

  async function openReviewRequests() {
    const el = _ensure();
    el._ctx = {};
    el.querySelector('#rvreqCustomer').value = '';
    _items = _cached();
    _render();
    el.style.display = 'flex';
    await _loadFromServer();
    _render();
  }

  function closeReviewRequests() {
    const el = document.getElementById('reviewRequestSheet');
    if (el) el.style.display = 'none';
  }

  window.openReviewRequests = openReviewRequests;
  window.closeReviewRequests = closeReviewRequests;
})();
