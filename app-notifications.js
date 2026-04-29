/* ─────────────────────────────────────────────────────────────
   In-app 알림 (2026-04-21)

   - 1분 주기 폴링 (포그라운드만)
   - 대시보드 헤더에 🔔 배지 표시
   - 탭하면 시트로 목록 펼침 + 읽음 처리
   - 운영자 공지(kind=announcement) 도착 시 홈 상단에 인라인 카드 표시
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  let _items = [];
  let _pollTimer = null;
  // sessionStorage 키 — 같은 세션 안에서 X 닫은 공지는 다시 안 띄움 (서버 read 처리되기 전까지)
  const _DISMISS_KEY = 'itdasy::announcement_dismissed_ids';

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
    return {
      booking_soon: '⏰',
      birthday: '🎂',
      retention: '💝',
      proactive_morning_brief: '☀️',
      booking_confirm_prev_day: '📅',
      announcement: '📣',
      support_reply: '💬',
      // [2026-04-29 W5] 회원권 만료/잔액 알림
      membership_expire_7d: '💳',
      membership_expire_1d: '⚠️',
      membership_low_30: '💳',
      membership_low_10: '⚠️',
    }[kind] || '🔔';
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

  function _getDismissed() {
    try {
      const raw = sessionStorage.getItem(_DISMISS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  }
  function _addDismissed(id) {
    try {
      const arr = _getDismissed();
      if (!arr.includes(id)) arr.push(id);
      sessionStorage.setItem(_DISMISS_KEY, JSON.stringify(arr.slice(-50)));
    } catch (_) { void 0; }
  }

  function _renderAnnouncementCard() {
    // 잇데이 운영자가 보낸 공지(kind=announcement) 만 인라인 카드로 노출
    const anchor = document.getElementById('home-today-brief')
      || document.getElementById('homePostConnect')
      || document.querySelector('main') || document.body;
    if (!anchor) return;
    let host = document.getElementById('itdAnnouncementHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'itdAnnouncementHost';
      host.style.cssText = 'margin:0 0 12px 0;';
      // 가장 위에 삽입 (가능한 경우)
      if (anchor.parentNode) anchor.parentNode.insertBefore(host, anchor);
      else anchor.appendChild(host);
    }
    const dismissed = _getDismissed();
    const announcements = _items.filter(n => n.kind === 'announcement' && !dismissed.includes(n.id));
    if (!announcements.length) {
      host.innerHTML = '';
      return;
    }
    // 가장 최신 한 건만 노출 (스택형 카드는 시트에서 확인)
    const a = announcements[0];
    const more = announcements.length - 1;
    host.innerHTML = `
      <div role="status" aria-live="polite" style="background:linear-gradient(135deg,#fff5f7 0%,#ffe8ec 100%);border:1px solid rgba(241,128,145,0.35);border-radius:14px;padding:14px 14px 14px 16px;box-shadow:0 2px 10px rgba(241,128,145,0.10);position:relative;">
        <div style="display:flex;align-items:flex-start;gap:10px;">
          <div style="flex-shrink:0;width:36px;height:36px;border-radius:12px;background:#f18091;display:flex;align-items:center;justify-content:center;font-size:17px;color:#fff;">📢</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:11px;font-weight:600;color:#f18091;letter-spacing:0.2px;margin-bottom:2px;">잇데이 공지</div>
            <div style="font-size:14px;font-weight:700;color:#1f2330;line-height:1.35;">${_esc(a.title)}</div>
            <div style="font-size:12px;color:#525c70;margin-top:4px;line-height:1.5;white-space:pre-wrap;">${_esc(a.body || '')}</div>
            <div style="display:flex;gap:8px;align-items:center;margin-top:10px;">
              <button data-ann-confirm="${a.id}" style="background:#f18091;color:#fff;border:none;padding:7px 14px;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;">확인</button>
              ${more > 0 ? `<button data-ann-more style="background:none;border:none;color:#7a8294;font-size:11px;cursor:pointer;">공지 ${more}개 더 보기</button>` : ''}
              <span style="margin-left:auto;font-size:10px;color:#8b94a7;">${_esc(_relativeTime(a.scheduled_at))}</span>
            </div>
          </div>
          <button data-ann-dismiss="${a.id}" aria-label="공지 닫기" style="position:absolute;top:8px;right:8px;width:26px;height:26px;border-radius:50%;border:none;background:rgba(0,0,0,0.05);font-size:13px;color:#525c70;cursor:pointer;line-height:1;">✕</button>
        </div>
      </div>
    `;
    const confirmBtn = host.querySelector('[data-ann-confirm]');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        const id = parseInt(confirmBtn.dataset.annConfirm, 10);
        await _markRead(id);
        _items = _items.filter(x => x.id !== id);
        _updateBadge();
        _renderAnnouncementCard();
        const list = document.getElementById('notifBody');
        if (list) _renderList();
      });
    }
    const dismissBtn = host.querySelector('[data-ann-dismiss]');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        const id = parseInt(dismissBtn.dataset.annDismiss, 10);
        _addDismissed(id);
        _renderAnnouncementCard();
      });
    }
    const moreBtn = host.querySelector('[data-ann-more]');
    if (moreBtn) moreBtn.addEventListener('click', () => window.openNotifications && window.openNotifications());
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
      _renderAnnouncementCard();
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
