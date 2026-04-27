/* ─────────────────────────────────────────────────────────────
   In-app 알림 (2026-04-21)

   - 1분 주기 폴링 (포그라운드만)
   - 대시보드 헤더에 🔔 배지 표시
   - 탭하면 시트로 목록 펼침 + 읽음 처리
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  let _items = [];
  let _pollTimer = null;

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  async function _fetch() {
    if (!window.API || !window.authHeader) return null;
    const auth = window.authHeader();
    if (!auth?.Authorization) return null;
    try {
      const res = await fetch(window.API + '/notifications/pending', { headers: auth });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) { return null; }
  }

  function _updateBadge() {
    const badge = document.getElementById('dashBellBadge');
    if (!badge) return;
    const n = _items.length;
    if (n > 0) {
      badge.style.display = 'flex';
      badge.textContent = n > 9 ? '9+' : String(n);
    } else {
      badge.style.display = 'none';
    }
  }

  async function _markRead(id) {
    try { await fetch(window.API + '/notifications/' + id + '/read', { method: 'PATCH', headers: window.authHeader() }); } catch (_) { void 0; }
  }
  async function _markAllRead() {
    try { await fetch(window.API + '/notifications/read-all', { method: 'PATCH', headers: window.authHeader() }); } catch (_) { void 0; }
  }

  function _ensureSheet() {
    let sheet = document.getElementById('notifSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'notifSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:10001;display:none;background:rgba(0,0,0,0.45);';
    sheet.innerHTML = `
      <div style="position:absolute;inset:auto 0 0 0;background:var(--bg,#fff);border-radius:20px 20px 0 0;max-height:80vh;display:flex;flex-direction:column;padding:18px;padding-bottom:max(18px,env(safe-area-inset-bottom));">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <span style="font-size:22px;">🔔</span>
          <strong style="font-size:17px;">알림</strong>
          <button data-notif-all style="margin-left:auto;font-size:11px;color:#888;background:none;border:none;cursor:pointer;">전부 읽음</button>
          <button onclick="closeNotifications()" style="background:rgba(0,0,0,0.05);border:none;width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer;">✕</button>
        </div>
        <div id="notifBody" style="flex:1;overflow-y:auto;"></div>
      </div>
    `;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) closeNotifications(); });
    sheet.querySelector('[data-notif-all]').addEventListener('click', async () => {
      await _markAllRead();
      _items = [];
      _updateBadge();
      _renderList();
    });
    return sheet;
  }

  function _relativeTime(iso) {
    if (!iso) return '';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (Math.abs(diff) < 60) return '방금';
    const m = Math.round(diff / 60);
    if (Math.abs(m) < 60) return (diff > 0 ? m + '분 전' : Math.abs(m) + '분 뒤');
    const h = Math.round(m / 60);
    if (Math.abs(h) < 24) return (diff > 0 ? h + '시간 전' : Math.abs(h) + '시간 뒤');
    return new Date(iso).toLocaleDateString('ko-KR');
  }

  function _iconByKind(kind) {
    return { booking_soon: '⏰', birthday: '🎂', retention: '💝' }[kind] || '🔔';
  }

  function _renderList() {
    const body = document.getElementById('notifBody');
    if (!body) return;
    if (!_items.length) {
      body.innerHTML = `
        <div style="padding:40px 20px;text-align:center;color:#aaa;">
          <div style="font-size:36px;margin-bottom:10px;">🌿</div>
          <div style="font-size:13px;">새 알림 없음</div>
        </div>
      `;
      return;
    }
    body.innerHTML = _items.map(n => `
      <div data-notif-id="${n.id}" style="display:flex;gap:12px;padding:12px;background:#fff;border-radius:12px;margin-bottom:8px;box-shadow:0 1px 3px rgba(0,0,0,0.04);cursor:pointer;">
        <div style="width:40px;height:40px;border-radius:12px;background:rgba(241,128,145,0.1);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">${_iconByKind(n.kind)}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:700;color:#222;">${_esc(n.title)}</div>
          <div style="font-size:11px;color:#666;margin-top:2px;line-height:1.4;">${_esc(n.body || '')}</div>
          <div style="font-size:10px;color:#aaa;margin-top:3px;">${_esc(_relativeTime(n.scheduled_at))}</div>
        </div>
      </div>
    `).join('');
    body.querySelectorAll('[data-notif-id]').forEach(el => {
      el.addEventListener('click', async () => {
        const id = parseInt(el.dataset.notifId, 10);
        await _markRead(id);
        _items = _items.filter(x => x.id !== id);
        _updateBadge();
        _renderList();
      });
    });
  }

  async function _poll() {
    const d = await _fetch();
    if (d && Array.isArray(d.items)) {
      // 신규 알림 도착 시 햅틱
      if (d.items.length > _items.length && window.hapticLight) {
        try { window.hapticLight(); } catch (_) { void 0; }
      }
      _items = d.items;
      _updateBadge();
    }
  }

  function _startPolling() {
    if (_pollTimer) return;
    _poll();
    _pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') _poll();
    }, 60 * 1000);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') _poll();
  });

  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(_startPolling, 2000);
  else document.addEventListener('DOMContentLoaded', () => setTimeout(_startPolling, 2000));

  window.openNotifications = function () {
    _ensureSheet();
    document.getElementById('notifSheet').style.display = 'block';
    document.body.style.overflow = 'hidden';
    _renderList();
  };
  window.closeNotifications = function () {
    const sheet = document.getElementById('notifSheet');
    if (sheet) sheet.style.display = 'none';
    document.body.style.overflow = '';
  };
  window.Notifications = {
    getAll: () => _items.slice(),
    poll: _poll,
  };
})();
