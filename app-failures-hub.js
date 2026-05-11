/* ───────────────────────────────────────────────────────────
   app-failures-hub.js — 자동화 실패 알림함 (Phase 2)
   2026-04-28 신규.
   - md §16 원칙 7: 모든 자동화는 실패 시 원장에게 명확히 알려야 한다
   - 카테고리: DM 발송 / 결제 / 동기화 / 재고 차감 / 카카오 발송
   - 백엔드 GET /automation/failures (없으면 빈 상태 graceful)
   ─────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const ID = 'failuresHubScreen';
  const CATS = [
    { key: 'all',     label: '전체' },
    { key: 'dm',      label: 'DM 발송' },
    { key: 'payment', label: '결제' },
    { key: 'sync',    label: '동기화' },
    { key: 'stock',   label: '재고 차감' },
    { key: 'kakao',   label: '카카오 발송' },
  ];

  let _activeCat = 'all';

  function _api() { return window.API || ''; }
  function _auth() { try { return (window.authHeader && window.authHeader()) || {}; } catch (_) { return {}; } }
  function _toast(m) { if (window.showToast) window.showToast(m); }
  function _haptic() { try { window.hapticLight && window.hapticLight(); } catch (_e) { void _e; } }

  function _ensureMounted() {
    let el = document.getElementById(ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = ID;
    el.className = 'subscreen-overlay';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <header class="ss-topbar">
        <button type="button" class="ss-back" data-fh-back aria-label="뒤로">
          <i class="ph-duotone ph-arrow-left" aria-hidden="true"></i>
        </button>
        <div class="ss-title">자동화 실패 알림함</div>
        <button type="button" class="ss-action" data-fh-refresh>새로고침</button>
      </header>
      <div class="ss-body">
        <div class="ss-chips" id="fhChips">
          ${CATS.map(c => `<button class="ss-chip ${c.key === 'all' ? 'is-active' : ''}" data-fh-cat="${c.key}">${c.label}</button>`).join('')}
        </div>
        <div id="fhList"></div>
      </div>
    `;
    document.body.appendChild(el);

    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-fh-back]')) { closeFailuresHub(); return; }
      if (e.target.closest('[data-fh-refresh]')) { _load(); return; }
      const chip = e.target.closest('[data-fh-cat]');
      if (chip) {
        _activeCat = chip.getAttribute('data-fh-cat');
        el.querySelectorAll('[data-fh-cat]').forEach(c =>
          c.classList.toggle('is-active', c === chip));
        _haptic();
        _render();
        return;
      }
      const retry = e.target.closest('[data-fh-retry]');
      if (retry) {
        const id = retry.getAttribute('data-fh-retry');
        _retry(id);
      }
    });
    return el;
  }

  let _items = [];

  async function _load() {
    const list = document.getElementById('fhList');
    if (list) list.innerHTML = '<div class="ss-empty"><div class="ss-empty-tt">불러오는 중...</div></div>';
    try {
      const res = await fetch(_api() + '/automation/failures?days=7', { headers: _auth() });
      if (res.ok) {
        const j = await res.json();
        _items = (j && j.items) || [];
      } else {
        _items = [];
      }
    } catch (_) {
      _items = [];
    }
    _render();
  }

  function _render() {
    const list = document.getElementById('fhList');
    if (!list) return;
    const filtered = _activeCat === 'all'
      ? _items
      : _items.filter(it => it.category === _activeCat);
    if (!filtered.length) {
      list.innerHTML = `
        <div class="ss-empty">
          <i class="ph-duotone ph-check-circle" aria-hidden="true"></i>
          <div class="ss-empty-tt">최근 7일간 실패 내역이 없어요</div>
          <div class="ss-empty-sub">자동화가 잘 돌아가고 있어요.<br>실패가 생기면 여기에 모아드릴게요.</div>
        </div>
      `;
      return;
    }
    list.innerHTML = filtered.map(_renderItem).join('');
  }

  function _renderItem(it) {
    const icon = ({
      dm: 'ic-message-square', payment: 'ic-credit-card',
      sync: 'ic-refresh-cw', stock: 'ic-package', kakao: 'ic-message-circle',
    })[it.category] || 'ic-alert-triangle';
    const ts = it.created_at ? _relTime(it.created_at) : '';
    const canRetry = it.retryable !== false;
    return `
      <div class="ss-card" style="padding:14px;">
        <div style="display:flex;align-items:flex-start;gap:10px;">
          <div class="ic" style="width:36px;height:36px;border-radius:12px;background:rgba(232,160,176,0.12);
            display:flex;align-items:center;justify-content:center;color:var(--accent2,#d77c92);flex-shrink:0;">
            <svg style="width:18px;height:18px;" aria-hidden="true"><use href="#${icon}"/></svg>
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:800;color:var(--text,#222);">${_esc(it.title || '실패 알림')}</div>
            <div style="font-size:12px;color:var(--text2,#555);margin-top:4px;line-height:1.5;">${_esc(it.message || '')}</div>
            <div style="font-size:11px;color:var(--text3,#999);margin-top:6px;">${_esc(ts)}</div>
          </div>
        </div>
        ${canRetry ? `<button type="button" class="ss-cta-secondary" data-fh-retry="${_esc(it.id)}" style="margin-top:10px;">다시 시도</button>` : ''}
      </div>
    `;
  }

  async function _retry(id) {
    _toast('재시도 중...');
    try {
      const res = await fetch(_api() + '/automation/failures/' + encodeURIComponent(id) + '/retry', {
        method: 'POST', headers: _auth(),
      });
      if (res.ok) { _toast('재시도 성공'); _load(); }
      else _toast('재시도 실패 — 잠시 후 다시');
    } catch (_) { _toast('네트워크 오류'); }
  }

  function _relTime(iso) {
    try {
      const t = new Date(iso).getTime();
      const diff = (Date.now() - t) / 1000;
      if (diff < 60) return '방금 전';
      if (diff < 3600) return Math.floor(diff / 60) + '분 전';
      if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
      return Math.floor(diff / 86400) + '일 전';
    } catch (_) { return ''; }
  }

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function openFailuresHub() {
    const el = _ensureMounted();
    requestAnimationFrame(() => el.classList.add('is-open'));
    el.setAttribute('aria-hidden', 'false');
    _haptic();
    _load();
  }
  function closeFailuresHub() {
    const el = document.getElementById(ID);
    if (!el) return;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    _haptic();
  }

  window.openFailuresHub = openFailuresHub;
  window.closeFailuresHub = closeFailuresHub;
})();
