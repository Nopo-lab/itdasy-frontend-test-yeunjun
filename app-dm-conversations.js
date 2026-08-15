/* DM 채팅방 — 진짜 인스타 DM 화면 (2026-04-30 v2)
   사용:
     window.openDMConversations()       — 채팅방 list 풀스크린
     window.openDMThread(sender_igsid)  — 한 채팅방 풀 대화 풀스크린

   디자인 기준: 인스타그램 다이렉트 메시지 (iOS).
   - 풀스크린 (sheet 아님)
   - 손님 말풍선: 회색 #EFEFEF
   - 사장 말풍선: 브랜드 로즈 그라디언트 [2026-06-07 보라 잔재 제거]
   - 헤더: 흰 바탕, 좌:back / 중앙:이름 / 우:info
   - 같은 분 연속 메시지 그룹화 — 시간 1번만
   - 사장 답장 source 는 말풍선 아래 작은 회색 caption
*/
(function () {
  'use strict';

  // [2026-06-07] 인스타 보라 그라디언트 → 브랜드 로즈 (DM 보라 잔재 제거). 변수명은 호환 위해 유지.
  const IG_GRADIENT = 'linear-gradient(135deg, #D58A95 0%, #BC6675 100%)';

  function _esc(s) { return window._esc(s); } /* [2026-06-11] 중복 제거 — app-core 정본 위임 */
  /* [2026-07-22] 통합 인박스 채널 배지 — IG/네이버 톡톡/카카오. BE list_conversations 의 c.channel 사용. */
  function _channelMark(c) {
    return (window.ChannelMark && window.ChannelMark.mark)
      ? window.ChannelMark.mark(c, { size: 18, pos: 'position:absolute;bottom:-1px;right:-1px;' })
      : '';
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
    const res = await apiFetch(path, {
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
      <div style="display:flex;align-items:center;gap:8px;padding:max(14px,var(--safe-area-inset-top, env(safe-area-inset-top, 0px))) 16px 12px;border-bottom:1px solid #DBDBDB;background:#fff;">
        <button id="dcvClose" aria-label="닫기" style="background:none;border:none;cursor:pointer;color:#262626;display:inline-flex;align-items:center;padding:4px;">
          <svg width="14" height="14" aria-hidden="true"><use href="#ic-chevron-left"/></svg>
        </button>
        <strong style="font-size:18px;font-weight:700;color:#262626;letter-spacing:-0.3px;">실시간 DM</strong>
        <span id="dcvCount" style="font-size:12px;color:#8E8E8E;margin-left:4px;"></span>
        <button id="dcvSettings" aria-label="자동응답 설정" title="자동응답 설정" style="margin-left:auto;background:none;border:none;cursor:pointer;color:#262626;display:inline-flex;align-items:center;padding:6px;">
          <i class="ph-duotone ph-gear" aria-hidden="true" style="font-size:20px;"></i>
        </button>
      </div>
      <!-- 안내 한 줄 -->
      <div style="padding:8px 16px;background:#FAFAFA;border-bottom:1px solid #EFEFEF;">
        <div style="font-size:11px;color:#8E8E8E;line-height:1.5;">
          채팅방을 누르면 대화를 보고 AI 초안으로 바로 답장할 수 있어요. 톱니(설정)에서 자동응답·응대 모드·톤을 바꿀 수 있어요.
        </div>
      </div>
      <!-- 리스트 -->
      <div id="dcvList" style="flex:1;overflow-y:auto;">
        <div style="text-align:center;color:#8E8E8E;padding:40px 0;font-size:13px;">불러오는 중…</div>
      </div>
    `;
    document.body.appendChild(sheet);
    sheet.querySelector('#dcvClose').addEventListener('click', closeList);
    // F3 — 톱니 '설정' = 기존 자동응답 설정(ON/OFF·응대 모드·표준응대·톤·시간·금지어·리텐션 등)
    const _setBtn = sheet.querySelector('#dcvSettings');
    if (_setBtn) _setBtn.addEventListener('click', () => {
      if (typeof window.openDMAutoreplySettings === 'function') window.openDMAutoreplySettings();
    });
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
            <div style="position:relative;width:56px;height:56px;border-radius:50%;background:${IG_GRADIENT};padding:2px;flex-shrink:0;">
              <div style="width:100%;height:100%;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;">
                <div style="width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,#FCE7F3,#FBCFE8);display:flex;align-items:center;justify-content:center;font-weight:700;color:#9D174D;font-size:20px;">${_esc(initial)}</div>
              </div>
              ${_channelMark(c.channel)}
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
          // [2026-06-08] 스레드 은퇴 — 대화 클릭도 '실시간 DM' 카드로
          if (typeof window.openDMCardForSender === 'function') window.openDMCardForSender(row.dataset.sender);
          else openThread(row.dataset.sender);
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
      list.innerHTML = `<div style="text-align:center;color:#ED4956;padding:30px 20px;font-size:13px;">불러오기 실패: ${_esc((window._humanError ? window._humanError(e) : e.message))}</div>`;
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
      <div style="display:flex;align-items:center;gap:10px;padding:max(14px,var(--safe-area-inset-top, env(safe-area-inset-top, 0px))) 14px 10px;border-bottom:1px solid #DBDBDB;background:#fff;">
        <button id="dthBack" aria-label="뒤로" style="background:none;border:none;cursor:pointer;color:#262626;display:inline-flex;align-items:center;padding:4px;">
          <svg width="14" height="14" aria-hidden="true"><use href="#ic-chevron-left"/></svg>
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
      <!-- AI 초안 / 캘린더 안내 바 (잇비) -->
      <div id="dthAiBar" style="display:none;padding:8px 12px;background:#F7F8FA;border-top:1px solid #EFEFEF;font-size:12px;color:#4E5968;"></div>
      <!-- 입력 composer (챗봇 톤) -->
      <div style="padding:8px 12px max(12px,var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));background:#fff;border-top:1px solid #EFEFEF;">
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          <button id="dthAiDraft" type="button" style="display:inline-flex;align-items:center;gap:5px;background:#191F28;color:#fff;border:none;border-radius:999px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer;">✨ AI 초안</button>
          <button id="dthRegen" type="button" style="display:none;background:#F2F4F6;color:#4E5968;border:none;border-radius:999px;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer;">다시 생성</button>
        </div>
        <div style="display:flex;align-items:flex-end;gap:8px;">
          <textarea id="dthInput" rows="1" placeholder="답장을 입력하세요" style="flex:1;background:#F2F4F6;border:none;border-radius:18px;padding:10px 14px;font-size:14px;line-height:1.4;resize:none;max-height:120px;box-sizing:border-box;font-family:inherit;color:#191F28;"></textarea>
          <button id="dthSend" type="button" aria-label="전송" style="flex-shrink:0;width:40px;height:40px;border-radius:50%;background:#191F28;color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;line-height:1;">↑</button>
        </div>
      </div>
    `;
    document.body.appendChild(sheet);
    sheet.querySelector('#dthBack').addEventListener('click', closeThread);
    sheet.querySelector('#dthAiDraft').addEventListener('click', () => _onAiDraft());
    sheet.querySelector('#dthRegen').addEventListener('click', () => _onAiDraft());
    sheet.querySelector('#dthSend').addEventListener('click', () => _onSendReply());
    const _ta = sheet.querySelector('#dthInput');
    if (_ta) {
      _ta.addEventListener('input', () => { _ta.style.height = 'auto'; _ta.style.height = Math.min(120, _ta.scrollHeight) + 'px'; });
      _ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _onSendReply(); }
      });
    }
    return sheet;
  }

  let _curSender = null;
  let _curExcluded = false;
  let _curLogId = null;   // 현재 대화의 검토대기 초안 log_id (send/send_edit 용)

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
    _curLogId = null;
    _threadMsgsCache = [];
    const sheet = _ensureThreadSheet();
    // composer 초기화
    const _ai = sheet && sheet.querySelector('#dthAiBar');
    if (_ai) { _ai.style.display = 'none'; _ai.innerHTML = ''; }
    const _in = sheet && sheet.querySelector('#dthInput');
    if (_in) { _in.value = ''; _in.style.height = 'auto'; }
    const _rg = sheet && sheet.querySelector('#dthRegen');
    if (_rg) _rg.style.display = 'none';
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
          if (window.showToast) window.showToast('실패: ' + (window._humanError ? window._humanError(e) : e.message));
        }
      };

      const msgs = thread.messages || [];
      _threadMsgsCache = msgs;
      // 이미 검토대기 초안(pending)이 있으면 그 log_id 확보 (send/send_edit 재사용)
      const _pend = msgs.filter(m => m && m.source === 'pending' && m.log_id);
      if (_pend.length) _curLogId = _pend[_pend.length - 1].log_id;
      if (!msgs.length) {
        msgsBox.innerHTML = `<div style="text-align:center;color:#8E8E8E;padding:30px 0;font-size:13px;">아직 메시지가 없어요.</div>`;
        return;
      }
      msgsBox.innerHTML = _buildMessagesHtml(msgs);
      msgsBox.scrollTop = msgsBox.scrollHeight;
    } catch (e) {
      msgsBox.innerHTML = `<div style="text-align:center;color:#ED4956;padding:30px 20px;font-size:13px;">불러오기 실패: ${_esc((window._humanError ? window._humanError(e) : e.message))}</div>`;
    }
  }

  function _updateExcludeBtn() {
    const btn = document.getElementById('dthExcludeToggle');
    if (!btn) return;
    btn.style.color = _curExcluded ? '#B45309' : '#262626';
    btn.title = _curExcluded ? '분석에 포함시키기' : '톤 분석에서 제외';
  }

  // ── [2026-06-08 F2] AI 초안 + 전송 (챗봇 톤, send/send_edit 재사용) ──────
  function _postDraft() {
    return _fetch('POST', `/instagram/dm-reply/conversations/${encodeURIComponent(_curSender)}/draft`);
  }
  function _aiBarEl() { const s = document.getElementById('dmThreadSheet'); return s && s.querySelector('#dthAiBar'); }
  function _inputEl() { const s = document.getElementById('dmThreadSheet'); return s && s.querySelector('#dthInput'); }

  function _renderAiBar(d) {
    const bar = _aiBarEl();
    if (!bar) return;
    if (!d || !d.calendar_checked) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
    let gapStr = '';
    if (d.free_gap_minutes != null) {
      const h = Math.floor(d.free_gap_minutes / 60);
      const mm = d.free_gap_minutes % 60;
      gapStr = h >= 1 ? (mm ? `${h}시간 ${mm}분 비어있음` : `${h}시간 비어있음`) : `${d.free_gap_minutes}분 비어있음`;
    }
    if (d.slot_available) {
      bar.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-weight:700;color:#15803D;">✓ 캘린더 확인됨 · 비어있음</span>
          ${d.requested_time ? `<span>${_esc(d.requested_time)}</span>` : ''}
          ${gapStr ? `<span style="color:#8E8E8E;">· ${_esc(gapStr)}</span>` : ''}
          <button id="dthApprove" type="button" style="margin-left:auto;background:linear-gradient(135deg,#10B981,#34D399);color:#fff;border:none;border-radius:10px;padding:8px 12px;font-size:12px;font-weight:800;cursor:pointer;">예약 승인 + 캘린더</button>
        </div>`;
      const ap = bar.querySelector('#dthApprove');
      if (ap) ap.addEventListener('click', () => _onApproveBooking());
    } else {
      const alts = Array.isArray(d.alt_suggestions) ? d.alt_suggestions : [];
      const altBtns = alts.map(a => {
        const label = typeof a === 'string' ? a : (a && a.label) || '';
        return label ? `<button type="button" class="dth-alt" data-label="${_esc(label)}" style="background:#fff;border:1px solid #F59E0B;color:#92400E;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;">${_esc(label)}</button>` : '';
      }).join('');
      bar.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-weight:700;color:#B91C1C;">✕ 그 시간은 예약이 있어요</span>
          ${d.requested_time ? `<span>(${_esc(d.requested_time)})</span>` : ''}
          ${altBtns ? `<span style="width:100%;color:#8E8E8E;margin-top:2px;">대안 시간 — 누르면 답장에 넣어요:</span>${altBtns}` : ''}
        </div>`;
      bar.querySelectorAll('.dth-alt').forEach(b => b.addEventListener('click', () => {
        const inp = _inputEl();
        if (inp) { inp.value = `${b.dataset.label} 어떠세요? 😊`; inp.focus(); }
      }));
    }
    bar.style.display = 'block';
  }

  async function _onAiDraft() {
    if (!_curSender) return;
    const btn = document.getElementById('dthAiDraft');
    const inp = _inputEl();
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; btn.textContent = '✨ 생성 중…'; }
    try {
      const d = await _postDraft();
      _curLogId = d.log_id || _curLogId;
      if (inp && d.ai_draft_text) {
        inp.value = d.ai_draft_text;
        inp.style.height = 'auto'; inp.style.height = Math.min(120, inp.scrollHeight) + 'px';
      }
      _renderAiBar(d);
      const rg = document.getElementById('dthRegen');
      if (rg) rg.style.display = 'inline-flex';
    } catch (e) {
      if (window.showToast) window.showToast('초안 생성 실패: ' + ((window._humanError ? window._humanError(e) : e.message) || ''));
    } finally {
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.textContent = '✨ AI 초안'; }
    }
  }

  function _afterSent() {
    // 홈 '고객 메시지' 카드 자동 제거 신호 + 화면 갱신
    try { window.dispatchEvent(new CustomEvent('itdasy:dm-replied', { detail: { sender_igsid: _curSender, tail: (_curSender || '').slice(-4) } })); } catch (_e) { void _e; }
    _curLogId = null;
    const bar = _aiBarEl(); if (bar) { bar.style.display = 'none'; bar.innerHTML = ''; }
    const inp = _inputEl(); if (inp) { inp.value = ''; inp.style.height = 'auto'; }
    const rg = document.getElementById('dthRegen'); if (rg) rg.style.display = 'none';
    _renderThread().catch(() => {});
  }

  async function _onSendReply() {
    if (!_curSender) return;
    const inp = _inputEl();
    const text = (inp && inp.value || '').trim();
    if (!text) { if (window.showToast) window.showToast('답장 내용을 입력해주세요'); return; }
    const btn = document.getElementById('dthSend');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
    try {
      // log_id 없으면 먼저 초안 생성(pending 로그)으로 확보 — 입력칸은 안 건드림
      if (!_curLogId) {
        try { const d = await _postDraft(); _curLogId = d.log_id || null; } catch (_e) { void _e; }
      }
      if (!_curLogId) throw new Error('초안을 만들 수 없어요');
      await _fetch('POST', `/dm-confirm-queue/${encodeURIComponent(_curLogId)}/send_edit`, { edited_reply: text });
      if (window.showToast) window.showToast('답장을 보냈어요 ✓');
      _afterSent();
    } catch (e) {
      if (window.showToast) window.showToast('발송 실패: ' + ((window._humanError ? window._humanError(e) : e.message) || ''));
    } finally {
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    }
  }

  async function _onApproveBooking() {
    if (!_curLogId) { if (window.showToast) window.showToast('초안을 먼저 생성해주세요'); return; }
    const ap = document.getElementById('dthApprove');
    if (ap) { ap.disabled = true; ap.style.opacity = '0.6'; }
    try {
      const r = await _fetch('POST', `/dm-confirm-queue/${encodeURIComponent(_curLogId)}/send`, { selected_index: 0 });
      if (window.showToast) window.showToast(r.message || '예약 승인 + 발송 완료 ✓');
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'create_booking', source: 'dm_thread' } })); } catch (_e) { void _e; }
      _afterSent();
    } catch (e) {
      if (window.showToast) window.showToast('승인 실패: ' + ((window._humanError ? window._humanError(e) : e.message) || ''));
      if (ap) { ap.disabled = false; ap.style.opacity = '1'; }
    }
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
        // 손님 = 말풍선 없이 평문 (아바타 + 네이비 텍스트) — 챗봇 톤
        lines.push(`
          <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:10px;">
            <div style="width:26px;height:26px;border-radius:50%;background:#F2F4F6;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#8B95A1;">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2.2c-4.5 0-8 2.6-8 5.9V21h16v-.9c0-3.3-3.5-5.9-8-5.9Z"/></svg>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:14px;color:#191F28;line-height:1.5;word-break:break-word;">${_esc(m.text)}</div>
              ${showTime ? `<div style="font-size:11px;color:#8E8E8E;margin-top:3px;">${_timeFmt(m.ts)}</div>` : ''}
            </div>
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
        // 내 답장 = 회색 말풍선 #F2F4F6 (우, radius 18 18 5 18). pending 만 점선 강조.
        const bubbleStyle = isPending
          ? `background:#FFFBEB;color:#92400E;border:1px dashed #F59E0B;border-radius:18px 18px 5px 18px;`
          : `background:#F2F4F6;color:#191F28;border-radius:18px 18px 5px 18px;`;
        lines.push(`
          <div style="display:flex;flex-direction:column;align-items:flex-end;margin-bottom:10px;">
            <div style="max-width:78%;${bubbleStyle}padding:9px 14px;font-size:14px;line-height:1.45;word-break:break-word;">${_esc(m.text)}${isPending ? '<div style="font-size:11px;margin-top:4px;font-weight:700;">사장 확인 대기 중</div>' : ''}</div>
            ${showTime ? `
              <div style="display:flex;align-items:center;gap:6px;margin:4px 4px 0 0;">
                ${sourceLbl ? `<span style="font-size:11px;color:#8E8E8E;font-weight:600;">${sourceLbl}</span>` : ''}
                <span style="font-size:11px;color:#8E8E8E;">${_timeFmt(m.ts)}</span>
              </div>` : ''}
          </div>`);
      }
    });
    return lines.join('');
  }

  // [2026-06-08] 옛 채팅방 목록 뷰 은퇴 — 모든 진입을 '실시간 DM' 카드 리스트로 통합.
  //   openList/_refreshList 등 목록 함수는 죽은 코드(백로그) — 지금 삭제 X.
  window.openDMConversations = function () {
    if (typeof window.openDMConfirmQueue === 'function') return window.openDMConfirmQueue();
    return openList();  // 최후 폴백 (카드 모듈 미로드 시)
  };
  window.closeDMConversations = closeList;
  // [2026-06-08] 옛 풀 대화창(스레드 뷰) 은퇴 — 모든 진입을 '실시간 DM' 카드 리스트로 통합.
  //   openThread/_renderThread/composer 등 스레드 함수는 죽은 코드(백로그) — 지금 삭제 X.
  window.openDMThread = function (sender) {
    if (typeof window.openDMCardForSender === 'function') return window.openDMCardForSender(sender);
    if (typeof window.openDMConfirmQueue === 'function') return window.openDMConfirmQueue();
    return openThread(sender);  // 최후 폴백 (카드 모듈 미로드 시)
  };
  window.closeDMThread = closeThread;
})();
