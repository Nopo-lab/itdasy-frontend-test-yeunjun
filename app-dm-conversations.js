/* DM 채팅방 — 진짜 인스타 DM 화면 (2026-04-30 v2)
   사용:
     window.openDMConversations()       — 채팅방 list 풀스크린
     window.openDMThread(sender_igsid)  — 한 채팅방 풀 대화 풀스크린

   디자인 기준: 인스타그램 다이렉트 메시지 (iOS).
   - 풀스크린 (sheet 아님)
   - 손님 말풍선: 회색 #EFEFEF
   - 사장 말풍선: 인스타 그라디언트 (보라 → 핑크 → 주황)
   - 헤더: 흰 바탕, 좌:back / 중앙:이름 / 우:info
   - 같은 분 연속 메시지 그룹화 — 시간 1번만
   - 사장 답장 source 는 말풍선 아래 작은 회색 caption
*/
(function () {
  'use strict';

  const IG_GRADIENT = 'linear-gradient(135deg, #833AB4 0%, #C13584 35%, #E1306C 65%, #FD1D1D 100%)';

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }
  function _timeFmt(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const now = new Date();
      const sameDay = d.toDateString() === now.toDateString();
      if (sameDay) {
        return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      }
      const diffDays = (now - d) / 86400000;
      if (diffDays < 7) {
        return d.toLocaleDateString('ko-KR', { weekday: 'short' });
      }
      return d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
    } catch (_e) { return ''; }
  }
  function _dayDivider(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const now = new Date();
      const sameDay = d.toDateString() === now.toDateString();
      if (sameDay) return '오늘';
      const yest = new Date(now); yest.setDate(yest.getDate() - 1);
      if (d.toDateString() === yest.toDateString()) return '어제';
      return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
    } catch (_e) { return ''; }
  }
  function _minuteKey(iso, side) {
    if (!iso) return side + '?';
    try {
      const d = new Date(iso);
      return side + ':' + d.getFullYear() + d.getMonth() + d.getDate() + d.getHours() + d.getMinutes();
    } catch (_e) { return side + '?'; }
  }

  async function _fetch(method, path, body) {
    const headers = window.authHeader ? window.authHeader() : {};
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(window.API + path, {
      method, headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.detail || ('HTTP ' + res.status));
    return d;
  }

  // ── 공통: 풀스크린 컨테이너 ─────────────────────────
  function _fullscreenStyle() {
    return [
      'position:fixed',
      'inset:0',
      'z-index:9988',
      'background:#fff',
      'display:none',
      'flex-direction:column',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    ].join(';') + ';';
  }

  // ── 채팅방 list 풀스크린 ─────────────────────────
  function _ensureListSheet() {
    let sheet = document.getElementById('dmConversationsSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'dmConversationsSheet';
    sheet.style.cssText = _fullscreenStyle();
    sheet.innerHTML = `
      <!-- 헤더: 인스타 다이렉트 스타일 -->
      <div style="display:flex;align-items:center;gap:8px;padding:max(14px,env(safe-area-inset-top)) 16px 12px;border-bottom:1px solid #DBDBDB;background:#fff;">
        <button id="dcvClose" aria-label="닫기" style="background:none;border:none;cursor:pointer;color:#262626;display:inline-flex;align-items:center;padding:4px;">
          <i class="ph-duotone ph-caret-left" aria-hidden="true"></i>
        </button>
        <strong style="font-size:18px;font-weight:700;color:#262626;letter-spacing:-0.3px;">메시지</strong>
        <span id="dcvCount" style="font-size:12px;color:#8E8E8E;margin-left:4px;"></span>
      </div>
      <!-- 안내 한 줄 -->
      <div style="padding:8px 16px;background:#FAFAFA;border-bottom:1px solid #EFEFEF;">
        <div style="font-size:11px;color:#8E8E8E;line-height:1.5;">
          채팅방을 누르면 대화 내용을 볼 수 있어요. 친구·가족 채팅방은 우측 깃발 아이콘으로 톤 분석에서 제외할 수 있어요.
        </div>
      </div>
      <!-- 리스트 -->
      <div id="dcvList" style="flex:1;overflow-y:auto;">
        <div style="text-align:center;color:#8E8E8E;padding:40px 0;font-size:13px;">불러오는 중…</div>
      </div>
    `;
    document.body.appendChild(sheet);
    sheet.querySelector('#dcvClose').addEventListener('click', closeList);
    return sheet;
  }

  async function openList() {
    const sheet = _ensureListSheet();
    sheet.style.display = 'flex';
    sheet.style.animation = 'dmScreenIn .22s ease-out both';
    await _refreshList();
    _startListPoll();
  }
  function closeList() {
    _stopListPoll();
    const sheet = document.getElementById('dmConversationsSheet');
    if (!sheet) return;
    sheet.style.animation = 'dmScreenOut .18s ease-in both';
    setTimeout(() => { sheet.style.display = 'none'; sheet.style.animation = ''; }, 180);
  }

  async function _refreshList() {
    const list = document.getElementById('dcvList');
    if (!list) return;
    try {
      const d = await _fetch('GET', '/instagram/dm-reply/conversations');
      const convos = d.conversations || [];
      const cnt = document.getElementById('dcvCount');
      if (cnt) cnt.textContent = convos.length ? `(${convos.length})` : '';
      if (!convos.length) {
        list.innerHTML = `
          <div style="text-align:center;color:#8E8E8E;padding:60px 20px;font-size:14px;line-height:1.7;">
            <div style="width:80px;height:80px;border-radius:50%;background:#FAFAFA;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;">
              <i class="ph-duotone ph-chat-circle" aria-hidden="true"></i>
            </div>
            <div style="color:#262626;font-weight:600;font-size:16px;margin-bottom:4px;">메시지</div>
            <div>아직 도착한 DM 이 없어요.</div>
          </div>`;
        return;
      }
      list.innerHTML = convos.map(c => {
        const displayName = c.nickname || `손님 …${c.sender_tail}`;
        const excluded = c.excluded_from_analysis;
        const time = _timeFmt(c.last_seen);
        const last = (c.last_text || '').trim();
        const initial = (displayName.charAt(0) || '?');
        return `
          <div data-sender="${_esc(c.sender_igsid)}" class="dcv-row" style="display:flex;align-items:center;gap:12px;padding:8px 16px;cursor:pointer;${excluded ? 'background:#FAFAFA;' : ''}">
            <div style="width:56px;height:56px;border-radius:50%;background:${IG_GRADIENT};padding:2px;flex-shrink:0;">
              <div style="width:100%;height:100%;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;">
                <div style="width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,#FCE7F3,#FBCFE8);display:flex;align-items:center;justify-content:center;font-weight:700;color:#9D174D;font-size:20px;">${_esc(initial)}</div>
              </div>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:6px;">
                <strong style="font-size:14px;color:#262626;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%;">${_esc(displayName)}</strong>
                ${excluded ? '<span style="font-size:9px;font-weight:600;background:#FEF3C7;color:#B45309;padding:1px 6px;border-radius:99px;">분석 제외</span>' : ''}
              </div>
              <div style="display:flex;align-items:center;gap:6px;margin-top:2px;">
                <span style="font-size:13px;color:#8E8E8E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;">${_esc(last || '메시지 없음')}</span>
                <span style="font-size:13px;color:#8E8E8E;flex-shrink:0;">·</span>
                <span style="font-size:13px;color:#8E8E8E;flex-shrink:0;">${time}</span>
              </div>
            </div>
            <button class="dcv-toggle-excl" data-sender="${_esc(c.sender_igsid)}" data-excluded="${excluded ? '1' : '0'}" aria-label="분석 제외 토글" style="flex-shrink:0;background:none;border:none;cursor:pointer;color:${excluded ? '#B45309' : '#C7C7C7'};display:inline-flex;align-items:center;padding:8px;border-radius:50%;" title="${excluded ? '분석에 포함시키기' : '톤 분석에서 제외'}">
              <i class="ph-duotone ph-flag" aria-hidden="true"></i>
            </button>
          </div>
        `;
      }).join('');
      list.querySelectorAll('.dcv-row').forEach(row => {
        row.addEventListener('click', (e) => {
          if (e.target.closest('.dcv-toggle-excl')) return;
          openThread(row.dataset.sender);
        });
      });
      list.querySelectorAll('.dcv-toggle-excl').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const sid = btn.dataset.sender;
          const cur = btn.dataset.excluded === '1';
          try {
            await _fetch('PATCH', `/instagram/dm-reply/conversations/${encodeURIComponent(sid)}`, {
              excluded_from_analysis: !cur,
            });
            if (window.showToast) {
              window.showToast(!cur ? '톤 분석에서 제외됐어요' : '다시 분석 대상이에요');
            }
            await _refreshList();
          } catch (err) {
            if (window.showToast) window.showToast('실패: ' + err.message);
          }
        });
      });
    } catch (e) {
      list.innerHTML = `<div style="text-align:center;color:#ED4956;padding:30px 20px;font-size:13px;">불러오기 실패: ${_esc(e.message)}</div>`;
    }
  }

  // ── 채팅방 풀 대화 풀스크린 ─────────────────────────
  function _ensureThreadSheet() {
    let sheet = document.getElementById('dmThreadSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'dmThreadSheet';
    sheet.style.cssText = _fullscreenStyle().replace('z-index:9988', 'z-index:9989');
    sheet.innerHTML = `
      <!-- 인스타 DM 헤더 -->
      <div style="display:flex;align-items:center;gap:10px;padding:max(14px,env(safe-area-inset-top)) 14px 10px;border-bottom:1px solid #DBDBDB;background:#fff;">
        <button id="dthBack" aria-label="뒤로" style="background:none;border:none;cursor:pointer;color:#262626;display:inline-flex;align-items:center;padding:4px;">
          <i class="ph-duotone ph-caret-left" aria-hidden="true"></i>
        </button>
        <div id="dthAvatar" style="width:36px;height:36px;border-radius:50%;background:${IG_GRADIENT};padding:2px;flex-shrink:0;">
          <div style="width:100%;height:100%;border-radius:50%;background:linear-gradient(135deg,#FCE7F3,#FBCFE8);display:flex;align-items:center;justify-content:center;font-weight:700;color:#9D174D;font-size:14px;">?</div>
        </div>
        <div style="flex:1;min-width:0;">
          <div id="dthName" style="font-size:15px;font-weight:600;color:#262626;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">손님</div>
          <div id="dthMeta" style="font-size:11px;color:#8E8E8E;margin-top:1px;"></div>
        </div>
        <button id="dthExcludeToggle" aria-label="분석 제외 토글" style="background:none;border:none;cursor:pointer;color:#262626;display:inline-flex;align-items:center;gap:4px;padding:6px;border-radius:50%;">
          <i class="ph-duotone ph-flag" aria-hidden="true"></i>
        </button>
      </div>
      <!-- 메시지 -->
      <div id="dthMessages" style="flex:1;overflow-y:auto;background:#fff;padding:14px 12px 6px;">
        <div style="text-align:center;color:#8E8E8E;padding:30px 0;font-size:13px;">불러오는 중…</div>
      </div>
      <!-- 입력창 (인스타 흉내 — 실제로 발송 X, IG 본앱에서) -->
      <div style="padding:8px 12px max(12px,env(safe-area-inset-bottom));background:#fff;border-top:1px solid #EFEFEF;">
        <div style="display:flex;align-items:center;gap:8px;background:#FAFAFA;border:1px solid #EFEFEF;border-radius:99px;padding:8px 14px;">
          <span style="flex:1;font-size:13px;color:#8E8E8E;">답장은 인스타그램 앱에서 보낼 수 있어요</span>
          <i class="ph-duotone ph-link" aria-hidden="true"></i>
        </div>
      </div>
    `;
    document.body.appendChild(sheet);
    sheet.querySelector('#dthBack').addEventListener('click', closeThread);
    return sheet;
  }

  let _curSender = null;
  let _curExcluded = false;

  // ── [2026-05-02 Phase 1.2] 실시간 폴링 ──────────────────────
  // 사장이 화면 보고 있는 동안 8초 간격으로 신규 메시지 받아온다.
  // visibilitychange 로 백그라운드 탭이면 정지 → 배터리/네트워크 절약.
  // 사용자가 위로 스크롤한 상태면 자동 스크롤 X, "↓ 새 메시지 N" 토스트만.
  const THREAD_POLL_MS = 8000;
  const LIST_POLL_MS = 10000;
  let _threadPollTimer = null;
  let _listPollTimer = null;
  let _visHandlerBound = false;
  let _threadMsgsCache = [];

  function _isThreadOpen() {
    const s = document.getElementById('dmThreadSheet');
    return !!(s && s.style.display === 'flex');
  }
  function _isListOpen() {
    const s = document.getElementById('dmConversationsSheet');
    return !!(s && s.style.display === 'flex');
  }
  function _bindVisHandler() {
    if (_visHandlerBound) return;
    _visHandlerBound = true;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      // 보이는 화면으로 돌아오면 즉시 한 번 따라잡기
      if (_isThreadOpen()) _pollThreadOnce().catch(() => {});
      if (_isListOpen()) _refreshList().catch(() => {});
    });
  }
  function _startThreadPoll() {
    _stopThreadPoll();
    _bindVisHandler();
    _threadPollTimer = setInterval(() => {
      if (document.hidden || !_isThreadOpen() || !_curSender) return;
      _pollThreadOnce().catch(() => {});
    }, THREAD_POLL_MS);
  }
  function _stopThreadPoll() {
    if (_threadPollTimer) clearInterval(_threadPollTimer);
    _threadPollTimer = null;
    _threadMsgsCache = [];
  }
  function _startListPoll() {
    _stopListPoll();
    _bindVisHandler();
    _listPollTimer = setInterval(() => {
      if (document.hidden || !_isListOpen()) return;
      _refreshList().catch(() => {});
    }, LIST_POLL_MS);
  }
  function _stopListPoll() {
    if (_listPollTimer) clearInterval(_listPollTimer);
    _listPollTimer = null;
  }

  async function _pollThreadOnce() {
    if (!_curSender) return;
    const sheet = document.getElementById('dmThreadSheet');
    if (!sheet) return;
    const msgsBox = sheet.querySelector('#dthMessages');
    if (!msgsBox) return;

    const thread = await _fetch('GET', `/instagram/dm-reply/conversations/${encodeURIComponent(_curSender)}/messages?limit=200`);
    const msgs = thread.messages || [];

    // 변화 감지 — 길이 또는 마지막 ts 비교
    const lastTs = msgs.length ? msgs[msgs.length - 1].ts : null;
    const cachedLast = _threadMsgsCache.length ? _threadMsgsCache[_threadMsgsCache.length - 1].ts : null;
    if (msgs.length === _threadMsgsCache.length && lastTs === cachedLast) {
      return; // no change
    }

    // 사용자가 하단 근처(60px 이내)에 있는지
    const nearBottom = (msgsBox.scrollTop + msgsBox.clientHeight) >= (msgsBox.scrollHeight - 60);
    const newCount = Math.max(0, msgs.length - _threadMsgsCache.length);
    _threadMsgsCache = msgs;
    msgsBox.innerHTML = _buildMessagesHtml(msgs);

    if (nearBottom) {
      msgsBox.scrollTop = msgsBox.scrollHeight;
    } else if (newCount > 0) {
      if (window.showToast) {
        try {
          window.showToast(`↓ 새 메시지 ${newCount}건`, {
            onClick: () => { msgsBox.scrollTop = msgsBox.scrollHeight; },
          });
        } catch (_e) {
          window.showToast(`↓ 새 메시지 ${newCount}건`);
        }
      }
    }
  }

  async function openThread(sender_igsid) {
    if (!sender_igsid) return;
    _curSender = sender_igsid;
    _threadMsgsCache = [];
    const sheet = _ensureThreadSheet();
    sheet.style.display = 'flex';
    sheet.style.animation = 'dmScreenIn .22s ease-out both';
    await _renderThread();
    _startThreadPoll();
  }
  function closeThread() {
    _stopThreadPoll();
    const sheet = document.getElementById('dmThreadSheet');
    if (!sheet) return;
    sheet.style.animation = 'dmScreenOut .18s ease-in both';
    setTimeout(() => { sheet.style.display = 'none'; sheet.style.animation = ''; }, 180);
  }

  async function _renderThread() {
    const sheet = document.getElementById('dmThreadSheet');
    if (!sheet || !_curSender) return;
    const msgsBox = sheet.querySelector('#dthMessages');
    msgsBox.innerHTML = `<div style="text-align:center;color:#8E8E8E;padding:30px 0;font-size:13px;">불러오는 중…</div>`;
    try {
      const [convos, thread] = await Promise.all([
        _fetch('GET', '/instagram/dm-reply/conversations'),
        _fetch('GET', `/instagram/dm-reply/conversations/${encodeURIComponent(_curSender)}/messages?limit=200`),
      ]);
      const ctx = (convos.conversations || []).find(c => c.sender_igsid === _curSender);
      const displayName = (ctx && ctx.nickname) || (ctx && `손님 …${ctx.sender_tail}`) || `손님 …${_curSender.slice(-4)}`;
      sheet.querySelector('#dthName').textContent = displayName;
      const avatarBox = sheet.querySelector('#dthAvatar');
      if (avatarBox) {
        const inner = avatarBox.firstElementChild;
        if (inner) inner.textContent = displayName.charAt(0) || '?';
      }
      sheet.querySelector('#dthMeta').textContent = ctx ? `누적 ${ctx.total_msgs || 0}건 · ${ctx.last_intent || 'unknown'}` : '';
      _curExcluded = !!(ctx && ctx.excluded_from_analysis);
      _updateExcludeBtn();

      const exBtn = sheet.querySelector('#dthExcludeToggle');
      exBtn.onclick = async () => {
        try {
          const r = await _fetch('PATCH', `/instagram/dm-reply/conversations/${encodeURIComponent(_curSender)}`, {
            excluded_from_analysis: !_curExcluded,
          });
          _curExcluded = !!r.excluded_from_analysis;
          _updateExcludeBtn();
          if (window.showToast) window.showToast(_curExcluded ? '톤 분석에서 제외됐어요' : '다시 분석 대상이에요');
        } catch (e) {
          if (window.showToast) window.showToast('실패: ' + e.message);
        }
      };

      const msgs = thread.messages || [];
      _threadMsgsCache = msgs;
      if (!msgs.length) {
        msgsBox.innerHTML = `<div style="text-align:center;color:#8E8E8E;padding:30px 0;font-size:13px;">아직 메시지가 없어요.</div>`;
        return;
      }
      msgsBox.innerHTML = _buildMessagesHtml(msgs);
      msgsBox.scrollTop = msgsBox.scrollHeight;
    } catch (e) {
      msgsBox.innerHTML = `<div style="text-align:center;color:#ED4956;padding:30px 20px;font-size:13px;">불러오기 실패: ${_esc(e.message)}</div>`;
    }
  }

  function _updateExcludeBtn() {
    const btn = document.getElementById('dthExcludeToggle');
    if (!btn) return;
    btn.style.color = _curExcluded ? '#B45309' : '#262626';
    btn.title = _curExcluded ? '분석에 포함시키기' : '톤 분석에서 제외';
  }

  // ── 메시지 list HTML 빌더 (초기 렌더 + 폴링 공용) ─────────
  function _buildMessagesHtml(msgs) {
    const lines = [];
    let lastDate = '';
    msgs.forEach((m, idx) => {
      const d = new Date(m.ts || Date.now());
      const dateStr = d.toDateString();
      if (dateStr !== lastDate) {
        lines.push(`
          <div style="text-align:center;margin:18px 0 10px;">
            <span style="font-size:11px;color:#8E8E8E;font-weight:600;">${_esc(_dayDivider(m.ts))}</span>
          </div>`);
        lastDate = dateStr;
      }
      const isCustomer = m.side === 'customer';
      const sideKey = isCustomer ? 'cust' : 'owner';
      const minKey = _minuteKey(m.ts, sideKey);
      const next = msgs[idx + 1];
      const nextSameMin = next && _minuteKey(next.ts, next.side === 'customer' ? 'cust' : 'owner') === minKey;
      const nextSameSide = next && (next.side === 'customer' ? 'cust' : 'owner') === sideKey;
      const showTime = !(nextSameMin && nextSameSide);

      if (isCustomer) {
        lines.push(`
          <div style="display:flex;flex-direction:column;align-items:flex-start;margin-bottom:2px;">
            <div style="max-width:78%;background:#EFEFEF;color:#262626;padding:9px 14px;border-radius:22px;font-size:14px;line-height:1.4;word-break:break-word;">${_esc(m.text)}</div>
            ${showTime ? `<div style="font-size:11px;color:#8E8E8E;margin:4px 0 8px 8px;">${_timeFmt(m.ts)}</div>` : ''}
          </div>`);
      } else {
        const sourceLbl = {
          ai_auto:      'AI 자동',
          ai_confirmed: '확인 후 발송',
          ai_edited:    '수정 후 발송',
          owner:        '직접 보냄',
          template:     '템플릿',
          pending:      '확인 대기',
        }[m.source] || '';
        const isPending = m.source === 'pending';
        const bubbleStyle = isPending
          ? `background:#FFFBEB;color:#92400E;border:2px dashed #F59E0B;`
          : `background:${IG_GRADIENT};color:#fff;`;
        lines.push(`
          <div style="display:flex;flex-direction:column;align-items:flex-end;margin-bottom:2px;">
            <div style="max-width:78%;${bubbleStyle}padding:9px 14px;border-radius:22px;font-size:14px;line-height:1.4;word-break:break-word;">${_esc(m.text)}${isPending ? '<div style="font-size:11px;margin-top:4px;font-weight:700;">사장 확인 대기 중</div>' : ''}</div>
            ${showTime ? `
              <div style="display:flex;align-items:center;gap:6px;margin:4px 8px 8px 0;">
                ${sourceLbl ? `<span style="font-size:10px;color:#8E8E8E;font-weight:600;">${sourceLbl}</span>` : ''}
                <span style="font-size:11px;color:#8E8E8E;">${_timeFmt(m.ts)}</span>
              </div>` : ''}
          </div>`);
      }
    });
    return lines.join('');
  }

  window.openDMConversations = openList;
  window.closeDMConversations = closeList;
  window.openDMThread = openThread;
  window.closeDMThread = closeThread;
})();
