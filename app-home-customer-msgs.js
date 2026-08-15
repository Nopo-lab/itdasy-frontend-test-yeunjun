/* 홈 "고객 메시지" 카드 줄 — 서버 '답장 필요' 기준 (2026-06-09 개편).

   - 소스: GET /dm-confirm-queue (status=pending_confirm = 미답장/검토 대기). 실시간 DM 카드와 동일 소스.
     → 처리완료·옛 대화(5/1·5/2 등)는 안 뜸. 좀비 제거.
   - 카드 제거: X = 서버 discard(영구) / 답장 전송 성공(itdasy:dm-replied). localStorage 영구숨김 제거
     → 초기화·재연동해도 부활 X (서버가 진실).
   - 카드 탭 → window.openDMCardForSender(sender) (실시간 DM 카드로 포커스).
   - 전체 보기 → window.openDMConfirmQueue() (전체 히스토리·카드 리스트).
   - 토큰 끊김(X-Token-Valid: 0) + 0건 → '재연결' 배너. 새로고침 ↻ 버튼.

   window.HomeCustomerMsgs = { refresh() }
*/
(function () {
  'use strict';

  const MAX_CARDS = 12;
  const POLL_MS = 10000;
  const MIN_FETCH_GAP = 8000;            // 홈 다중 렌더 시 캐시 재사용 (API 과호출 방지)

  // 프사 없을 때 기본 아바타 — 사람 실루엣.
  const _AVATAR_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2.2c-4.5 0-8 2.6-8 5.9V21h16v-.9c0-3.3-3.5-5.9-8-5.9Z"/></svg>';

  let _cache = null;      // 마지막 /dm-confirm-queue 아이템 배열
  let _tokenValid = true; // 인스타 토큰 유효(X-Token-Valid). false면 재연결 배너.
  // [2026-08-15] X-Token-State: 'ok' | 'expired'(연결됐다가 끊김) | 'none'(한 번도 연결 안 함).
  //   'none' 인데 "연결이 끊겼어요" 를 띄우면 거짓말이다 — 끊긴 적이 없다.
  //   옛 백엔드는 이 헤더를 안 주므로 기본값 'ok' → 예전 동작(_tokenValid 만 보기)으로 폴백된다.
  let _tokenState = 'ok';
  let _lastFetch = 0;
  let _inFlight = false;
  let _pollTimer = null;
  let _delegated = false;

  function _esc(s) { return window._esc(s); } /* [2026-06-11] 중복 제거 — app-core 정본 위임 */

  // ── 표시 헬퍼 ──────────────────────────────────────────────
  const _INTENT_LABEL = {
    pricing: '가격 문의', booking: '예약 문의', hours: '영업시간',
    location: '위치 문의', review: '후기', complaint: '문의',
  };
  function _intentLabel(i) { return _INTENT_LABEL[i] || ''; }

  function _relTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const t = d.getTime();
    if (!Number.isFinite(t)) return '';
    const now = new Date();
    const diff = (now.getTime() - t) / 1000;
    if (diff < 60) return '방금';
    if (diff < 3600) return Math.floor(diff / 60) + '분 전';
    if (d.toDateString() === now.toDateString()) return Math.floor(diff / 3600) + '시간 전';
    const yest = new Date(now); yest.setDate(yest.getDate() - 1);
    if (d.toDateString() === yest.toDateString()) return '어제';
    if (diff < 7 * 86400) return d.toLocaleDateString('ko-KR', { weekday: 'short' });
    return d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
  }

  function _name(it) {
    return it.display_name || ('손님 …' + (it.sender_tail || (it.sender_igsid || '').slice(-4)));
  }

  // [2026-06-16] 채널 마크 — 아바타 좌상단 모서리(원형 아바타 코너 여백이라 프사 안 가림, X=우상단·언리드닷과 충돌 X). 공유 모듈 정본.
  function _channelMark(channel) {
    return (window.ChannelMark && window.ChannelMark.mark)
      ? window.ChannelMark.mark(channel, { size: 16, pos: 'position:absolute;top:-2px;left:-2px;' })
      : '';
  }

  // ── 카드 HTML (모든 카드 = 답장 필요 → 로즈 점 ON) ─────────
  function _cardHtml(it) {
    const name = _name(it);
    const pic = (it.profile_pic || '').trim();
    const avImg = pic
      ? `<img class="hv5-cmsg-avimg" src="${_esc(pic)}" referrerpolicy="no-referrer" alt="" onerror="this.remove()">`
      : '';
    const last = (it.received_text || '').trim() || '메시지 없음';
    const intent = _intentLabel(it.intent);
    const sid = _esc(it.sender_igsid || '');
    const id = _esc(String(it.id));
    // [Task 2] 양식 자동발송 카드 배지
    const formBadge = it.form_auto_sent
      ? `<span style="display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:700;color:#2563EB;background:#EFF6FF;padding:2px 7px;border-radius:99px;"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7Z"/></svg>양식발송완료</span>`
      : '';
    return `<button type="button" class="hv5-cmsg-card" data-cmsg-sender="${sid}" data-cmsg-id="${id}">
      <span class="hv5-cmsg-x" data-cmsg-discard="${id}" data-cmsg-sender="${sid}" role="button" tabindex="0" aria-label="${_esc(name)} 지우기">✕</span>
      <div class="hv5-cmsg-ctop">
        <div class="hv5-cmsg-av">${_AVATAR_SVG}${avImg}${_channelMark(it.channel)}</div>
        <div class="hv5-cmsg-id">
          <div class="hv5-cmsg-nm">${_esc(name)}</div>
          <div class="hv5-cmsg-tm">${_esc(_relTime(it.received_at))}</div>
        </div>
      </div>
      <div class="hv5-cmsg-msg un">${_esc(last)}</div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:9px;">
        <span class="hv5-cmsg-badge" style="margin-top:0;${intent ? '' : 'visibility:hidden;'}"${intent ? '' : ' aria-hidden="true"'}>${intent ? _esc(intent) : ' '}</span>
        ${formBadge}
      </div>
    </button>`;
  }

  // [Task 3] 홈 스켈레톤 (초기 로딩 중 표시)
  function _skeletonHtml() {
    return Array.from({ length: 3 }, () =>
      `<div style="flex:0 0 168px;background:#F7F8FA;border-radius:16px;padding:13px;flex-shrink:0;">
        <div style="display:flex;gap:8px;margin-bottom:10px;">
          <div style="width:38px;height:38px;border-radius:50%;background:#E5E8EB;flex-shrink:0;"></div>
          <div style="flex:1;display:flex;flex-direction:column;gap:5px;justify-content:center;">
            <div style="width:70%;height:10px;border-radius:5px;background:#E5E8EB;"></div>
            <div style="width:40%;height:8px;border-radius:5px;background:#F2F4F6;"></div>
          </div>
        </div>
        <div style="height:28px;border-radius:6px;background:#E5E8EB;"></div>
      </div>`
    ).join('');
  }

  function _reconnectBannerHtml() {
    return `<button type="button" id="hv5CmsgReconnect" style="width:100%;text-align:left;display:flex;align-items:center;gap:10px;background:var(--surface);border:.5px solid var(--border);border-radius:16px;padding:13px;box-shadow:var(--shadow-sm);cursor:pointer;font-family:inherit;">
      <span style="width:36px;height:36px;border-radius:50%;background:var(--brand-bg);color:var(--brand-strong);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px;">⚠</span>
      <span style="min-width:0;"><span style="display:block;font-size:13.5px;font-weight:700;color:var(--text);">인스타 연결이 끊겼어요</span><span style="display:block;font-size:12px;color:var(--text-subtle);margin-top:1px;">탭해서 다시 연결 →</span></span>
    </button>`;
  }

  // 토큰 정상 + 0건 → 빈 상태 카드 (상시 표시). 인라인 style: _ensureStyles 1회 주입이라 새 클래스 안 먹을 수 있음.
  function _emptyStateHtml() {
    return `<div style="width:100%;display:flex;align-items:center;gap:11px;background:var(--surface);border:.5px solid var(--border);border-radius:16px;padding:13px;box-shadow:var(--shadow-sm);">
      <span style="width:34px;height:34px;border-radius:50%;background:var(--surface-2);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></span>
      <span style="min-width:0;">
        <span style="display:block;font-size:13.5px;font-weight:700;color:var(--text-subtle);">새 메시지 없어요</span>
        <span style="display:block;font-size:11px;color:var(--text-subtle);margin-top:2px;">메시지가 오면 여기에 미리보기가 떠요</span>
        <!-- [2026-07-22 보스] "DM 왔는데 홈엔 하나도 안 뜬다"는 신고 대응.
             이 줄은 인스타가 DM 을 앱으로 보내주기 시작해야 카드가 뜬다는 걸 알려주고,
             막혔을 때 원장이 스스로 풀 수 있는 유일한 길(재연결)로 보낸다.
             '없다'와 '못 받고 있다'를 구분 못 하면 앱이 고장난 걸로 읽힌다. -->
        <button type="button" id="hv5CmsgWhy" style="display:block;margin-top:5px;padding:0;background:none;border:none;font-family:inherit;font-size:11px;font-weight:700;color:var(--brand-strong);cursor:pointer;text-align:left;">DM이 왔는데 안 보이면? →</button>
      </span>
    </div>`;
  }

  // ── 렌더 (캐시 → DOM) ──────────────────────────────────────
  function _renderFromCache() {
    const sec = document.getElementById('hv5Cmsg');
    const row = document.getElementById('hv5CmsgRow');
    if (!sec || !row) return;
    const items = (_cache || [])
      .filter(it => it && it.id != null && it.sender_igsid)
      .slice()
      .sort((a, b) => new Date(b.received_at || 0) - new Date(a.received_at || 0));

    const cnt = document.getElementById('hv5CmsgCount');
    // [Task 3] 캐시 null = 최초 로드 중 → 스켈레톤 표시
    if (_cache === null) {
      sec.hidden = false;
      row.innerHTML = `<div style="display:flex;gap:11px;overflow:hidden;padding:2px 2px 6px;">${_skeletonHtml()}</div>`;
      if (cnt) cnt.textContent = '';
      return;
    }
    if (!items.length) {
      // 0건 — 토큰 끊겼으면 '재연결' 배너, 아니면 빈 상태 카드 상시 표시
      //   단 'none'(한 번도 연결 안 함)은 배너를 띄우지 않는다. 끊긴 적이 없으니 거짓말이고,
      //   홈 위쪽에 이미 "인스타 연결하면 잇비 시작" 권유 카드가 있어 서로 모순된다.
      if (_tokenValid === false && _tokenState !== 'none') {
        sec.hidden = false;
        row.innerHTML = _reconnectBannerHtml();
        if (cnt) cnt.textContent = '';
      } else {
        sec.hidden = false;
        if (cnt) cnt.textContent = '';
        row.innerHTML = _emptyStateHtml();
      }
      return;
    }

    const cards = items.slice(0, MAX_CARDS);
    sec.hidden = false;
    row.innerHTML = cards.map(_cardHtml).join('');
    if (cnt) cnt.textContent = `· ${items.length}건 답장 필요`;
  }

  // ── fetch (/dm-confirm-queue = 답장 필요) ──────────────────
  async function _fetchConvos() {
    const headers = window.authHeader ? window.authHeader() : {};
    if (!headers || !headers.Authorization) return;
    const res = await apiFetch('/dm-confirm-queue', { headers });
    if (!res.ok) return;
    try {
      const tv = res.headers && res.headers.get ? res.headers.get('X-Token-Valid') : null;
      if (tv != null) _tokenValid = (tv !== '0' && tv.toLowerCase() !== 'false');
      const ts = res.headers && res.headers.get ? res.headers.get('X-Token-State') : null;
      if (ts) _tokenState = ts.toLowerCase();
    } catch (_e) { void _e; }
    const d = await res.json().catch(() => []);
    _cache = Array.isArray(d) ? d : (Array.isArray(d.items) ? d.items : []);
    _lastFetch = Date.now();
  }

  async function refresh() {
    _renderFromCache();                 // 캐시로 즉시 페인트 (DOM 재생성 직후)
    if (_inFlight) return;
    if (_cache && (Date.now() - _lastFetch) < MIN_FETCH_GAP) return;
    _inFlight = true;
    try { await _fetchConvos(); _renderFromCache(); }
    catch (_e) { /* 캐시 유지 */ }
    finally { _inFlight = false; }
  }

  // ── 서버 discard (영구) ────────────────────────────────────
  async function _discardServer(id) {
    if (!id) return;
    try {
      const headers = window.authHeader ? window.authHeader() : {};
      await apiFetch(`/dm-confirm-queue/${encodeURIComponent(id)}/discard`, { method: 'POST', headers });
    } catch (_e) { /* 실패해도 다음 폴링이 서버 기준으로 복원 */ }
  }

  // ── 이벤트 위임 ────────────────────────────────────────────
  function _bindDelegation() {
    if (_delegated) return;
    _delegated = true;
    document.body.addEventListener('click', (e) => {
      // 새로고침 ↻
      const refreshBtn = e.target.closest('#hv5CmsgRefresh');
      if (refreshBtn) {
        e.preventDefault();
        _lastFetch = 0;
        refreshBtn.classList.add('spin');
        refresh().finally(() => { try { refreshBtn.classList.remove('spin'); } catch (_e2) { void _e2; } });
        return;
      }
      // 인스타 재연결 배너
      const reconnect = e.target.closest('#hv5CmsgReconnect');
      if (reconnect) {
        e.preventDefault();
        if (typeof window.connectInstagram === 'function') window.connectInstagram();
        return;
      }
      // [2026-07-22 보스] "DM 왔는데 안 보이면?" — 원인을 있는 그대로 말하고 재연결로 보낸다.
      //   손님 DM 은 인스타가 우리 앱으로 밀어줘야(webhook) 여기 뜬다. 연결이 헐거우면 조용히 0건이 된다.
      const why = e.target.closest('#hv5CmsgWhy');
      if (why) {
        e.preventDefault();
        const msg = '손님 DM은 인스타가 앱으로 보내줘야 여기 떠요. 안 보이면 인스타를 다시 연결해 주세요.';
        if (typeof window.nativeConfirm === 'function') {
          window.nativeConfirm('DM이 안 보여요', msg + '\n\n지금 다시 연결할까요?').then((ok) => {
            if (ok && typeof window.connectInstagram === 'function') window.connectInstagram();
          }).catch(() => {});
        } else {
          if (typeof window.showToast === 'function') window.showToast(msg);
          if (typeof window.connectInstagram === 'function') window.connectInstagram();
        }
        return;
      }
      // 전체 보기
      const more = e.target.closest('#hv5CmsgMore');
      if (more) {
        e.preventDefault();
        if (typeof window.openDMConfirmQueue === 'function') window.openDMConfirmQueue();
        else if (typeof window.openDMConversations === 'function') window.openDMConversations();
        return;
      }
      // X(지우기) = 서버 discard (영구). 카드 탭보다 먼저 가로챔.
      const x = e.target.closest('[data-cmsg-discard]');
      if (x && document.getElementById('hv5Cmsg')) {
        e.preventDefault();
        e.stopPropagation();
        const id = x.dataset.cmsgDiscard;
        _cache = (_cache || []).filter(it => String(it.id) !== String(id));  // 낙관적 제거
        _renderFromCache();
        try { window.hapticLight && window.hapticLight(); } catch (_e2) { void _e2; }
        _discardServer(id);
        return;
      }
      // 카드 탭 → 실시간 DM 카드로 포커스
      const card = e.target.closest('[data-cmsg-sender]');
      if (card && document.getElementById('hv5Cmsg')) {
        e.preventDefault();
        const sender = card.dataset.cmsgSender;
        if (!sender) return;
        try { window.hapticLight && window.hapticLight(); } catch (_e2) { void _e2; }
        _openReply(sender);
      }
    });
  }

  function _openReply(sender) {
    if (typeof window.openDMCardForSender === 'function') {
      window.openDMCardForSender(sender);
    } else if (typeof window.openDMConfirmQueue === 'function') {
      window.openDMConfirmQueue();
    } else if (typeof window.openDMConversations === 'function') {
      window.openDMConversations();
    }
  }

  // ── 폴링 (홈 탭 활성 + 섹션 존재 시에만) ──────────────────
  function _homeActive() {
    const tab = document.getElementById('tab-home');
    return !!(tab && tab.classList.contains('active'));
  }
  function _startPoll() {
    if (_pollTimer) return;
    _pollTimer = setInterval(() => {
      if (document.hidden) return;
      if (!document.getElementById('hv5Cmsg') || !_homeActive()) return;
      refresh();
    }, POLL_MS);
  }

  function _ensureStyles() {
    if (document.getElementById('hv5CmsgStyles')) return;
    const s = document.createElement('style');
    s.id = 'hv5CmsgStyles';
    s.textContent = `
      .hv5-cmsg{margin-top:16px}
      .hv5-cmsg[hidden]{display:none}
      .hv5-cmsg-head{display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:0 2px}
      .hv5-cmsg-title{font-size:15px;font-weight:700;color:var(--text)}
      .hv5-cmsg-count{font-size:11px;font-weight:700;color:var(--brand-strong);background:var(--brand-bg);padding:3px 9px;border-radius:999px}
      .hv5-cmsg-refresh{margin-left:auto;background:none;border:none;cursor:pointer;color:var(--text-subtle);font-size:15px;line-height:1;padding:4px 6px}
      .hv5-cmsg-refresh.spin{animation:hv5cmsgspin .6s linear}
      @keyframes hv5cmsgspin{to{transform:rotate(360deg)}}
      .hv5-cmsg-more{margin-left:6px;font-size:12px;color:var(--text-subtle);font-weight:600;background:none;border:none;cursor:pointer;padding:4px 2px}
      .hv5-cmsg-row{display:flex;gap:11px;overflow-x:auto;padding:2px 2px 6px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
      .hv5-cmsg-row::-webkit-scrollbar{display:none}
      .hv5-cmsg-card{position:relative;flex:0 0 168px;text-align:left;background:var(--surface);border:.5px solid var(--border);border-radius:16px;padding:13px;box-shadow:var(--shadow-sm);cursor:pointer;font-family:inherit;display:block}
      .hv5-cmsg-card:active{transform:scale(.98)}
      .hv5-cmsg-x{position:absolute;top:6px;right:6px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;border-radius:50%;color:var(--text-subtle);font-size:11px;line-height:1;background:transparent;z-index:1}
      .hv5-cmsg-x:hover,.hv5-cmsg-x:active{background:var(--surface-2);color:var(--text-muted)}
      .hv5-cmsg-av svg{width:20px;height:20px}
      .hv5-cmsg-avimg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%}
      .hv5-cmsg-ctop{display:flex;align-items:center;gap:9px;margin-bottom:10px}
      .hv5-cmsg-av{width:38px;height:38px;border-radius:50%;flex-shrink:0;position:relative;background:var(--brand-bg) center/cover no-repeat;display:flex;align-items:center;justify-content:center;color:var(--brand-strong);font-weight:700;font-size:14px}
      .hv5-cmsg-av.is-unread::after{content:"";position:absolute;top:-1px;right:-1px;width:10px;height:10px;border-radius:50%;background:var(--brand);border:2px solid var(--surface)}
      .hv5-cmsg-id{min-width:0;flex:1}
      .hv5-cmsg-nm{font-size:13.5px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .hv5-cmsg-tm{font-size:11px;color:var(--text-subtle);margin-top:1px}
      .hv5-cmsg-msg{font-size:12px;color:var(--text-muted);line-height:1.45;height:35px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
      .hv5-cmsg-msg.un{color:var(--text);font-weight:500}
      .hv5-cmsg-badge{display:inline-block;margin-top:9px;font-size:11px;font-weight:700;color:var(--brand-strong);background:var(--brand-bg);padding:2px 8px;border-radius:6px}
    `;
    document.head.appendChild(s);
  }

  function _init() {
    _ensureStyles();
    _bindDelegation();
    _startPoll();
    // 새 DM 실시간: 데이터 변경 이벤트에도 가볍게 반응
    window.addEventListener('itdasy:data-changed', () => {
      if (document.getElementById('hv5Cmsg')) refresh();
    });
    // 답장 전송/처리 성공 → 해당 손님 카드 즉시 제거(서버도 이미 pending 에서 빠짐).
    window.addEventListener('itdasy:dm-replied', (ev) => {
      const d = (ev && ev.detail) || {};
      const sid = d.sender_igsid || '';
      const tail = d.tail || '';
      _cache = (_cache || []).filter(it => {
        if (!it || !it.sender_igsid) return true;
        if (sid && it.sender_igsid === sid) return false;
        if (tail && it.sender_igsid.endsWith(tail)) return false;
        return true;
      });
      _renderFromCache();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init, { once: true });
  } else {
    _init();
  }

  window.HomeCustomerMsgs = { refresh };
})();
