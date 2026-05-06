/* Phase 9 P5 — at-risk customer surface */
(function () {
  'use strict';

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  }

  function _toast(msg) {
    if (window.showToast) window.showToast(msg);
  }

  function _ensure() {
    let el = document.getElementById('retentionSheet');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'retentionSheet';
    el.className = 'p9-sheet';
    el.style.display = 'none';
    el.innerHTML = `
      <div class="p9-sheet__body" role="dialog" aria-modal="true">
        <div class="p9-sheet__head">
          <div class="p9-sheet__title">위험 고객</div>
          <button type="button" class="p9-sheet__close" data-rt-close aria-label="닫기">x</button>
        </div>
        <div id="rtList"></div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', _onClick);
    return el;
  }

  async function _fetchAtRisk() {
    const res = await fetch(window.API + '/retention/at-risk', { headers: window.authHeader() });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return data.items || data.customers || [];
  }

  function _fallbackItems() {
    const cached = window.CustomerCache?.read ? window.CustomerCache.read({ minItems: 1 }) : null;
    const items = cached?.data || [];
    const now = Date.now();
    return items.filter(c => {
      const raw = c.last_visit_at || c.last_visit || c.updated_at || c.created_at;
      const t = raw ? new Date(raw).getTime() : 0;
      return !t || now - t > 90 * 24 * 3600 * 1000;
    }).slice(0, 20);
  }

  function _draft(item) {
    const name = item.name || item.customer_name || '고객님';
    const service = item.last_service || item.service_name || '지난 시술';
    return `${name}, 안녕하세요. ${service} 이후 시간이 조금 지나서 상태 괜찮으신지 궁금해 연락드렸어요. 편한 시간 알려주시면 다시 예쁘게 잡아드릴게요.`;
  }

  function _render(items, offline) {
    const list = document.getElementById('rtList');
    if (!items.length) {
      list.innerHTML = '<div class="p9-sheet__card">지금 챙길 위험 고객이 없어요.</div>';
      return;
    }
    const badge = offline ? '<div class="p9-sheet__meta">서버 대신 저장된 고객 기준으로 보여줘요.</div>' : '';
    list.innerHTML = badge + items.map(item => {
      const name = item.name || item.customer_name || '고객';
      const reason = item.reason || item.risk_reason || '방문 주기가 지났어요';
      return `<div class="p9-sheet__card" data-rt-draft="${_esc(_draft(item))}">
        <div style="font-weight:900;">${_esc(name)}</div>
        <div class="p9-sheet__meta">${_esc(reason)}</div>
        <button type="button" class="p9-sheet__ghost" style="margin-top:10px;" data-rt-copy>DM 초안 복사</button>
      </div>`;
    }).join('');
  }

  async function openRetentionAI() {
    const el = _ensure();
    el.style.display = 'flex';
    const list = document.getElementById('rtList');
    if (window.showSkeleton) window.showSkeleton(list, 4);
    try {
      _render(await _fetchAtRisk(), false);
    } catch (e) {
      console.warn('[retention] fetch failed:', e);
      _render(_fallbackItems(), true);
    }
  }

  function closeRetentionAI() {
    const el = document.getElementById('retentionSheet');
    if (el) el.style.display = 'none';
  }

  async function _onClick(e) {
    const el = _ensure();
    if (e.target === el || e.target.closest('[data-rt-close]')) return closeRetentionAI();
    const btn = e.target.closest('[data-rt-copy]');
    if (!btn) return;
    const draft = btn.closest('[data-rt-draft]')?.dataset.rtDraft || '';
    try { await navigator.clipboard.writeText(draft); _toast('DM 초안 복사 완료'); }
    catch (_) { _toast(draft); }
  }

  window.openRetentionAI = openRetentionAI;
  window.closeRetentionAI = closeRetentionAI;
})();
