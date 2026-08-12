/* ─────────────────────────────────────────────────────────────
   In-app 알림 (2026-04-21)

   - 1분 주기 폴링 (포그라운드만)
   - 대시보드 헤더에 배지 표시
   - 탭하면 시트로 목록 펼침 + 읽음 처리
   - 운영자 공지(kind=announcement) 도착 시 홈 상단에 인라인 카드 표시
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  let _items = [];
  let _pollTimer = null;
  // 2026-05-01 ── localStorage 로 변경. sessionStorage 면 앱 재시작 시 닫은 공지 다시 뜸.
  // 사용자 보고: '공지 한번 끄면 계속 꺼져야하는데 안꺼짐.' — 영구 dismissal 로 통일.
  const _DISMISS_KEY = 'itdasy::announcement_dismissed_ids';
  const _DISMISS_STORAGE = (function () {
    try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return localStorage; }
    catch (_) { return sessionStorage; }
  })();

  function _esc(s) { return window._esc(s); } /* [2026-06-11] 중복 제거 — app-core 정본 위임 */

  async function _fetch() {
    if (!window.API || !window.authHeader) return null;
    const auth = window.authHeader();
    if (!auth?.Authorization) return null;
    try {
      const res = await apiFetch('/notifications/pending', { headers: auth });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) { return null; }
  }

  function _updateBadge() {
    const badge = document.getElementById('dashBellBadge');
    if (!badge) return;
    // [2026-05-28] 숫자 표기 제거 — dot만 보임
    badge.textContent = '';
    badge.style.display = _items.length > 0 ? 'block' : 'none';
  }

  async function _markRead(id) {
    try { await apiFetch('/notifications/' + id + '/read', { method: 'PATCH', headers: window.authHeader() }); } catch (_) { void 0; }
  }
  async function _markAllRead() {
    try { await apiFetch('/notifications/read-all', { method: 'PATCH', headers: window.authHeader() }); } catch (_) { void 0; }
  }

  // [2026-07-05] 자동화 실패 재시도 — BE가 kind=automation_failure 알림의 meta/data에 failure_id를 내려줌.
  function _failureId(n) {
    for (const src of [n.data, n.meta, n.payload]) {
      if (!src) continue;
      try {
        const p = typeof src === 'string' ? JSON.parse(src) : src;
        if (p && p.failure_id != null) return p.failure_id;
      } catch (_) { /* ignore */ }
    }
    return null;
  }
  async function _retryFailure(n, btn) {
    const fid = _failureId(n);
    if (fid == null) { if (window.showToast) window.showToast('재시도 대상을 찾지 못했어요'); return; }
    if (btn) btn.disabled = true;
    try {
      const res = await apiFetch('/automation/failures/' + encodeURIComponent(fid) + '/retry', {
        method: 'POST',
        headers: window.authHeader ? window.authHeader() : {},
      });
      // [죽은동작 정리 2026-07-27] BE 는 쿨다운·재시도한도·실제 발송실패를 전부 HTTP 200 + {ok:false}
      //   로 응답한다. 예전엔 res.ok(200)만 보고 "다시 보냈어요"를 띄워, 실제로 안 나갔는데도
      //   성공으로 오인시켰다. body 의 ok 와 message 를 읽어 정확히 안내한다.
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data && data.ok) {
          if (window.showToast) window.showToast(data.message || '다시 보냈어요');
          return;
        }
        if (window.showToast) window.showToast((data && data.message) || '재시도하지 못했어요 — 잠시 후 다시 시도해주세요');
        if (btn) btn.disabled = false;
        return;
      }
      if (window.showToast) window.showToast('재시도 실패 — 잠시 후 다시 시도해주세요');
      if (btn) btn.disabled = false;
    } catch (_) {
      if (window.showToast) window.showToast('재시도 실패 — 잠시 후 다시 시도해주세요');
      if (btn) btn.disabled = false;
    }
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
          <svg width="22" height="22" aria-hidden="true" style="color:#191F28;"><use href="#ic-bell"/></svg>
          <strong style="font-size:17px;">알림</strong>
          <span id="notifHeaderBadge" style="display:none;background:#BC6675;color:#fff;font-size:11px;padding:2px 7px;border-radius:5px;font-weight:600;"></span>
          <button data-notif-all style="margin-left:auto;font-size:11px;color:#888;background:none;border:none;cursor:pointer;">전부 읽음</button>
          <button data-notif-close style="background:rgba(0,0,0,0.05);border:none;width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer;">✕</button>
        </div>
        <div id="notifBody" style="flex:1;overflow-y:auto;"></div>
      </div>
    `;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) closeNotifications(); });
    sheet.querySelector('[data-notif-close]')?.addEventListener('click', () => closeNotifications());
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

  // [2026-05-28] 사이드바 아이콘과 통일 — kind별 박스 색 + SVG sprite
  function _iconBoxByKind(kind) {
    const ICON_MAP = {
      booking_soon:              { bg: '#E1F5EE', color: '#1D9E75', icon: 'ic-calendar-check', link: '예약관리 보기 →' },
      booking_confirm_prev_day:  { bg: '#E1F5EE', color: '#1D9E75', icon: 'ic-calendar-check', link: '예약관리 보기 →' },
      dm_risk_alert:             { bg: '#FDECEC', color: '#E5484D', icon: 'ic-alert-triangle', link: 'DM 관리 보기 →' },
      announcement:              { bg: '#F7F8FA', color: '#4E5968', icon: 'ic-megaphone',      link: '공지 보기 →' },
      // [2026-07-05] 자동화 실패 — 구 실패알림함(app-failures-hub) 흡수. 인라인 '재시도' 버튼 포함.
      automation_failure:        { bg: '#FDEDEE', color: '#C0262C', icon: 'ic-alert-triangle', link: '' },
    };
    return ICON_MAP[kind] || { bg: '#F7F8FA', color: '#4E5968', icon: 'ic-bell', link: '' };
  }
  function _iconBoxHtml(kind) {
    const c = _iconBoxByKind(kind);
    return `<span style="width:36px;height:36px;border-radius:10px;background:${c.bg};color:${c.color};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="18" height="18" aria-hidden="true"><use href="#${c.icon}"/></svg></span>`;
  }
  function _isUnread(n) { return n.read === false || n.read == null; }
  function _isToday(iso) {
    if (!iso) return false;
    const d = new Date(iso); const t = new Date();
    return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
  }
  function _groupKey(n) {
    if (n.kind === 'dm_risk_alert') return 'urgent';
    if (_isToday(n.scheduled_at)) return 'today';
    return 'past';
  }
  const _GROUP_LABEL = { urgent: '긴급', today: '오늘', past: '이전' };
  const _GROUP_COLOR = { urgent: '#E5484D', today: '#8B95A1', past: '#8B95A1' };

  // [2026-04-30] 알림 kind 별 click → 적절한 화면으로 이동
  function _openByKind(n) {
    const kind = n.kind || '';
    try {
      if (['dm_pending_confirm', 'dm_customer_register', 'dm_action_pending', 'dm_risk_alert'].includes(kind)) {
        if (window.openDMConfirmQueue) { window.openDMConfirmQueue(); return true; }
      }
      if (kind === 'support_reply' || kind === 'support_ai_reply') {
        // [2026-08-12] openSupportSheet 은 **어디에도 없는 이름**이었다 — 고객센터 답변·
        //   AI 답변 알림을 눌러도 아무 화면도 안 열리고 읽음 처리만 됐다. 실함수로 교체.
        if (window.openSupportChat) { window.openSupportChat(); return true; }
      }
      // [죽은동작 정리 2026-07-27] 예약 알림은 "예약관리 보기 →" 라벨인데 라우팅이 없어 읽음+제거만 됐다.
      //   (payload.customer_id 가 있으면 오히려 고객카드로 튀었음.) 캘린더로 보낸다. payload 분기보다 먼저.
      if (kind === 'booking_soon' || kind === 'booking_confirm_prev_day' || kind.indexOf('booking') === 0) {
        if (window.openCalendar) { window.openCalendar(); return true; }
      }
      // payload 안에 customer_id 있으면 고객 카드 열기
      if (n.payload) {
        try {
          const p = typeof n.payload === 'string' ? JSON.parse(n.payload) : n.payload;
          if (p && p.customer_id && window.openCustomerCard) {
            window.openCustomerCard(p.customer_id);
            return true;
          }
        } catch (_) { /* ignore */ }
      }
    } catch (_) { /* ignore */ }
    return false;
  }

  function _renderList() {
    const body = document.getElementById('notifBody');
    if (!body) return;
    if (!_items.length) {
      body.innerHTML = `
        <div class="sv2-empty">
          <svg width="36" height="36" aria-hidden="true"><use href="#ic-bell"/></svg>
          <div class="t">새 알림이 없어요</div>
        </div>
      `;
      return;
    }
    // [2026-05-28] 그룹핑 (긴급/오늘/이전) + 미읽/읽음 시각 구분
    const groups = { urgent: [], today: [], past: [] };
    _items.forEach(n => groups[_groupKey(n)].push(n));
    const _stripEmoji = (s) => String(s || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu, '').replace(/\s{2,}/g, ' ').trim();
    const renderCard = (n) => {
      const c = _iconBoxByKind(n.kind);
      const unread = _isUnread(n);
      const titleColor = unread ? '#191F28' : '#4E5968';
      const cardOpacity = unread ? 1 : 0.55;
      const dot = unread ? '<span style="position:absolute;left:4px;top:50%;transform:translateY(-50%);width:5px;height:5px;border-radius:50%;background:#BC6675;"></span>' : '';
      const timeText = (unread ? '' : '읽음 · ') + _esc(_relativeTime(n.scheduled_at));
      const linkLabel = c.link ? `<span style="font-size:11px;color:#8B95A1;margin-left:8px;">${c.link}</span>` : '';
      // [2026-07-05] 자동화 실패 알림 — 인라인 '재시도' 필 버튼. 버튼 중첩 방지 위해 div 컨테이너 사용.
      const isFail = n.kind === 'automation_failure';
      const retryHtml = isFail
        ? `<span style="display:block;margin-top:8px;"><button type="button" class="sv2-retry" data-fail-retry="${n.id}"><svg width="13" height="13" aria-hidden="true"><use href="#ic-refresh-cw"/></svg>재시도</button></span>`
        : '';
      const tag = isFail ? 'div' : 'button';
      const attrs = isFail ? 'role="button" tabindex="0"' : 'type="button"';
      return `<${tag} ${attrs} data-notif-id="${n.id}" style="position:relative;display:flex;gap:12px;padding:12px;width:100%;box-sizing:border-box;background:transparent;border:0;border-radius:10px;text-align:left;cursor:pointer;opacity:${cardOpacity};font-family:inherit;">
        ${dot}${_iconBoxHtml(n.kind)}
        <span style="flex:1;min-width:0;">
          <span style="display:block;font-size:13px;font-weight:500;color:${titleColor};">${_esc(_stripEmoji(n.title))}</span>
          <span style="display:block;font-size:11px;color:#4E5968;margin-top:2px;line-height:1.4;">${_esc(_stripEmoji(n.body || ''))}</span>
          ${retryHtml}
          <span style="display:block;font-size:11px;color:#B0B8C1;margin-top:4px;">${timeText}${linkLabel}</span>
        </span>
      </${tag}>`;
    };
    const groupHtml = (key) => {
      const list = groups[key];
      if (!list.length) return '';
      const label = _GROUP_LABEL[key];
      const color = _GROUP_COLOR[key];
      const sep = key === 'urgent' ? '' : 'border-top:0.5px solid #F0F1F4;';
      return `<div style="${sep}"><div style="padding:14px 16px 6px;font-size:11px;font-weight:500;letter-spacing:0.3px;color:${color};">${label}</div>${list.map(renderCard).join('')}</div>`;
    };
    body.innerHTML = groupHtml('urgent') + groupHtml('today') + groupHtml('past');
    // 헤더 미읽 카운트 뱃지
    const unreadCount = _items.filter(_isUnread).length;
    const headerBadge = document.getElementById('notifHeaderBadge');
    if (headerBadge) {
      if (unreadCount > 0) {
        headerBadge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
        headerBadge.style.display = 'inline-block';
      } else {
        headerBadge.style.display = 'none';
      }
    }
    // 재시도 버튼 — stopPropagation으로 카드(읽음 처리) 클릭과 분리
    body.querySelectorAll('[data-fail-retry]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.failRetry, 10);
        const n = _items.find(x => x.id === id);
        if (n) _retryFailure(n, btn);
      });
    });
    body.querySelectorAll('[data-notif-id]').forEach(el => {
      el.addEventListener('click', async () => {
        const id = parseInt(el.dataset.notifId, 10);
        const target = _items.find(x => x.id === id);
        await _markRead(id);
        _items = _items.filter(x => x.id !== id);
        _updateBadge();
        _renderList();
        // 시트 닫고 해당 화면으로 이동
        if (target && _openByKind(target)) {
          try { window.closeNotifications && window.closeNotifications(); } catch (_) { /* ignore */ }
        }
      });
    });
  }

  function _getDismissed() {
    try {
      const raw = _DISMISS_STORAGE.getItem(_DISMISS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  }
  function _addDismissed(id) {
    try {
      const arr = _getDismissed();
      if (!arr.includes(id)) arr.push(id);
      _DISMISS_STORAGE.setItem(_DISMISS_KEY, JSON.stringify(arr.slice(-50)));
    } catch (_) { void 0; }
  }

  // [죽은코드 정리 2026-07-27] 홈 상단 인라인 알림 카드 3종(회원권/DM큐/공지)은 2026-06-07 비활성
  //   (알림은 종 목록으로 일원화). 항상 빈 배열→display:none 뒤의 카드 렌더 ~200줄이 죽어 있어 제거.
  //   호출부(폴링·이벤트 핸들러 다수)가 참조하므로 함수 껍데기는 no-op 로 유지.
  function _renderMembershipAlertCard() {}
  function _renderDMConfirmQueueCard() {}
  function _renderAnnouncementCard() {}

  // [2026-05-28] 메인홈 잇비 카드/오늘 예약과 중복되거나 불필요한 알림은 알림함에서 제외.
  // 추후 백엔드 /notifications/pending 자체에서 제외하는 게 정석.
  // ⚠️ automation_failure는 여기 넣지 말 것 — 실패알림함 통합(2026-07-05)으로 알림함이 유일한 노출처.
  const EXCLUDED_KINDS = [
    'proactive_morning_brief',  // 좋은 아침 — 메인홈 잇비 카드와 중복
    'dm_pending_confirm',       // DM 답장 대기 — 메인홈 잇비 챙겼어요
    'dm_customer_register',     // DM 새 고객 — 동일
    'public_booking_pending',   // 외부 예약 요청 — 동일
    'birthday',                 // 생일 — 불필요
  ];

  async function _poll() {
    const d = await _fetch();
    if (d && Array.isArray(d.items)) {
      const items = d.items.filter(it => !EXCLUDED_KINDS.includes(it.kind));
      // 신규 알림 도착 시 햅틱
      if (items.length > _items.length && window.hapticLight) {
        try { window.hapticLight(); } catch (_) { void 0; }
      }
      _items = items;
      _updateBadge();
      _renderAnnouncementCard();
      _renderMembershipAlertCard();
      _renderDMConfirmQueueCard();
    }
  }

  function _startPolling() {
    if (_pollTimer) return;
    _poll();
    // [P1-2B] 폴링 60초 → 120초 (visibilitychange 즉시 폴링은 그대로 유지)
    _pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') _poll();
    }, 120 * 1000);
  }

  // [PerfFix] 탭이 백그라운드로 가면 폴링 중단 — 배터리/CPU 절약. 복귀 시 재시작.
  function _stopPolling() {
    if (!_pollTimer) return;
    clearInterval(_pollTimer);
    _pollTimer = null;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      _poll();
      _startPolling();
    } else {
      _stopPolling();
    }
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
