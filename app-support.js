/* ─────────────────────────────────────────────────────────────
   고객센터 채팅 — 메신저 UX

   - POST /support/messages  유저가 메시지 전송 (Discord 알림 자동)
   - GET  /support/messages  대화 목록 + 읽지않음 수
   - POST /support/messages/read  관리자 메시지 전부 읽음 처리

   30초마다 poll 해서 새 관리자 답장 감지 (채팅 모달 열려있을 때만).
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  let _pollTimer = null;
  let _lastMessageId = 0;
  const CACHE_KEY = 'itdasy_support_cache_v1';

  function _saveCache(messages) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ messages, saved_at: Date.now() })); } catch (_) {}
  }
  function _loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      // 7일 이상 오래된 캐시는 무시
      if (Date.now() - (d.saved_at || 0) > 7 * 24 * 3600 * 1000) return null;
      return d.messages || [];
    } catch (_) { return null; }
  }

  async function _fetchMessages() {
    if (!window.API || !window.authHeader || !window.authHeader()?.Authorization) {
      return { messages: [], unread_count: 0 };
    }
    try {
      const res = await fetch(window.API + '/support/messages', { headers: window.authHeader() });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      console.warn('[support] 메시지 조회 실패:', e);
      return { messages: [], unread_count: 0 };
    }
  }

  function _renderMessage(m) {
    const box = document.getElementById('supportChatMessages');
    if (!box) return;
    const isMine = !m.from_admin;
    const row = document.createElement('div');
    row.dataset.msgId = m.id;
    row.style.cssText = `display:flex;gap:8px;align-items:flex-end;${isMine ? 'justify-content:flex-end;' : ''}`;

    const time = new Date(m.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

    if (isMine) {
      row.innerHTML = `
        <span style="font-size:10px;color:#999;align-self:flex-end;margin-bottom:2px;">${time}</span>
        <div style="background:linear-gradient(135deg,#f18091,#ff9aa8);color:#fff;border-radius:14px 4px 14px 14px;padding:10px 14px;max-width:78%;font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word;">${_escape(m.content)}</div>
      `;
    } else {
      row.innerHTML = `
        <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#f18091,#ff9aa8);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0;">잇</div>
        <div style="background:#fff;border-radius:4px 14px 14px 14px;padding:10px 14px;max-width:78%;font-size:13px;line-height:1.5;color:#333;white-space:pre-wrap;word-break:break-word;box-shadow:0 1px 2px rgba(0,0,0,0.05);">${_escape(m.content)}</div>
        <span style="font-size:10px;color:#999;align-self:flex-end;margin-bottom:2px;">${time}</span>
      `;
    }
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
    _lastMessageId = Math.max(_lastMessageId, m.id);
  }

  function _escape(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function _renderFromList(messages) {
    const box = document.getElementById('supportChatMessages');
    if (!box) return;
    box.querySelectorAll('[data-msg-id]').forEach(el => el.remove());
    _lastMessageId = 0;
    (messages || []).forEach(_renderMessage);
  }

  async function _renderAll() {
    // 1) 캐시 즉시 표시 (체감 0ms)
    const cached = _loadCache();
    if (cached && cached.length) _renderFromList(cached);

    // 2) 네트워크 결과로 교체
    const d = await _fetchMessages();
    _renderFromList(d.messages || []);
    _saveCache(d.messages || []);
    _updateBadge(d.unread_count || 0);
  }

  function _updateBadge(count) {
    const badge = document.getElementById('supportUnreadBadge');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }

  window.openSupportChat = async function () {
    const modal = document.getElementById('supportChatModal');
    if (!modal) return;
    modal.style.display = 'flex';
    if (window.hapticLight) window.hapticLight();

    await _renderAll();

    // 관리자 메시지 전부 읽음 처리
    try {
      if (window.API && window.authHeader) {
        await fetch(window.API + '/support/messages/read', {
          method: 'POST',
          headers: window.authHeader(),
        });
      }
      _updateBadge(0);
    } catch (_) {}

    // 30초 polling (모달 닫히면 정지)
    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = setInterval(async () => {
      if (document.getElementById('supportChatModal')?.style.display === 'none') {
        clearInterval(_pollTimer); _pollTimer = null; return;
      }
      const d = await _fetchMessages();
      const newOnes = (d.messages || []).filter(m => m.id > _lastMessageId);
      newOnes.forEach(_renderMessage);
      // 관리자 답장 즉시 읽음 처리
      if (newOnes.some(m => m.from_admin)) {
        try {
          await fetch(window.API + '/support/messages/read', { method: 'POST', headers: window.authHeader() });
        } catch (_) {}
      }
    }, 30000);

    // 입력창 포커스
    setTimeout(() => document.getElementById('supportChatInput')?.focus(), 200);
  };

  window.closeSupportChat = function () {
    const modal = document.getElementById('supportChatModal');
    if (modal) modal.style.display = 'none';
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  };

  window.sendSupportMessage = async function () {
    const input = document.getElementById('supportChatInput');
    if (!input) return;
    const content = input.value.trim();
    if (!content) return;
    if (content.length > 2000) {
      if (window.showToast) window.showToast('메시지가 너무 길어요 (최대 2000자)');
      return;
    }
    if (!window.API || !window.authHeader) return;

    // 1) optimistic render — 서버 응답 기다리지 않고 즉시 말풍선 표시
    const tempId = -Date.now();
    const tempMsg = { id: tempId, from_admin: false, content, created_at: new Date().toISOString(), _pending: true };
    _renderMessage(tempMsg);
    input.value = '';
    input.focus();
    if (window.hapticLight) window.hapticLight();

    // 2) 서버 전송은 비동기 — UI 블로킹 없음
    try {
      const res = await fetch(window.API + '/support/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...window.authHeader() },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const msg = await res.json();
      // temp 말풍선을 실제 id 로 교체
      const tempEl = document.querySelector(`[data-msg-id="${tempId}"]`);
      if (tempEl) {
        tempEl.dataset.msgId = msg.id;
        tempEl.style.opacity = '1';
      }
      _lastMessageId = Math.max(_lastMessageId, msg.id);
      if (window.hapticSuccess) window.hapticSuccess();
    } catch (e) {
      // 전송 실패 — 말풍선에 빨간색 느낌표 표시
      const tempEl = document.querySelector(`[data-msg-id="${tempId}"]`);
      if (tempEl) {
        tempEl.style.opacity = '0.5';
        const errSpan = document.createElement('span');
        errSpan.textContent = ' ⚠️전송실패';
        errSpan.style.cssText = 'color:#e74c3c;font-size:10px;';
        tempEl.appendChild(errSpan);
      }
      if (window.showToast) window.showToast('전송 실패 — 잠시 후 다시 시도');
      if (window.hapticError) window.hapticError();
    }
  };

  // 로그인 후 앱 로드 시 읽지않음 배지 1회 체크
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(async () => {
      if (!localStorage.getItem('itdasy_token::staging') &&
          !localStorage.getItem('itdasy_token::prod') &&
          !localStorage.getItem('itdasy_token::local') &&
          !localStorage.getItem('itdasy_token')) return;
      const d = await _fetchMessages();
      _updateBadge(d.unread_count || 0);
    }, 2500);
  });

  // 배경 클릭으로 닫기
  document.addEventListener('click', (e) => {
    const modal = document.getElementById('supportChatModal');
    if (modal && e.target === modal) window.closeSupportChat();
  });
})();
