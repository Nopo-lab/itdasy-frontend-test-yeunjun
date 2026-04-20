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

  async function _renderAll() {
    const box = document.getElementById('supportChatMessages');
    if (!box) return;
    // 기존 환영 메시지(정적) 유지, 동적 msgId 있는 것만 제거
    box.querySelectorAll('[data-msg-id]').forEach(el => el.remove());

    const d = await _fetchMessages();
    (d.messages || []).forEach(_renderMessage);
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

    input.disabled = true;
    try {
      const res = await fetch(window.API + '/support/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...window.authHeader() },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const msg = await res.json();
      _renderMessage(msg);
      input.value = '';
      if (window.hapticSuccess) window.hapticSuccess();
    } catch (e) {
      if (window.showToast) window.showToast('전송 실패: ' + e.message);
      if (window.hapticError) window.hapticError();
    } finally {
      input.disabled = false;
      input.focus();
    }
  };

  // 로그인 후 앱 로드 시 읽지않음 배지 1회 체크
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(async () => {
      // T-006: 레거시 키 itdasy_token 제거 + getToken() 통합
      // app-core.js getToken() 이 _TOKEN_KEY 기반으로 현재 환경 토큰만 반환.
      // 만료 체크도 포함되므로 수동 분기 불필요.
      if (!window.getToken()) return;
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
