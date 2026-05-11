/* DM 사장 confirm 큐 시트 — Sprint 4 (2026-04-30)
   사용:
     window.openDMConfirmQueue()       — 시트 열기
     window.refreshDMQueueBadge()      — DM 자동응답 시트의 큐 N건 배지 갱신
*/
(function () {
  'use strict';

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
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

  function _intentLabel(intent) {
    return {
      pricing: '견적', booking: '예약', hours: '⏰ 영업시간',
      location: '📍 위치', review: '후기', greeting: '👋 인사',
      complaint: '위험', unknown: '❓ 모름',
    }[intent] || intent;
  }

  function _intentColor(intent) {
    return {
      pricing: '#B45309', booking: '#1E40AF', hours: '#0E7490',
      location: '#15803D', review: '#9D174D', greeting: '#5B21B6',
      complaint: '#B91C1C', unknown: '#6B7280',
    }[intent] || '#6B7280';
  }

  function _ensureSheet() {
    let sheet = document.getElementById('dmConfirmQueueSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'dmConfirmQueueSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9988;background:rgba(0,0,0,0.5);display:none;align-items:flex-end;justify-content:center;';
    sheet.innerHTML = `
      <div id="dcqCard" style="width:100%;max-width:560px;background:#fff;border-radius:20px 20px 0 0;max-height:92vh;display:flex;flex-direction:column;padding:18px 18px max(18px,env(safe-area-inset-bottom));">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span style="display:inline-flex;align-items:center;color:#7C3AED;"><i class="ph-duotone ph-bell" aria-hidden="true"></i></span>
          <strong style="font-size:17px;">DM 사장 확인 대기</strong>
          <span id="dcqCount" style="font-size:11px;background:#FEF3C7;color:#B45309;padding:2px 8px;border-radius:99px;font-weight:700;">0건</span>
          <button id="dcqClose" aria-label="닫기" style="margin-left:auto;background:none;border:none;cursor:pointer;color:#888;display:inline-flex;align-items:center;"><i class="ph-duotone ph-x" aria-hidden="true"></i></button>
        </div>
        <div style="font-size:11px;color:#888;margin-bottom:12px;line-height:1.5;">
          AI 가 초안 만들어둔 답장. 손님에겐 "잠시만요" 자동 발송됨. 30분 무응답 → template fallback 자동.
        </div>
        <div id="dcqList" style="flex:1;overflow-y:auto;">
          <div style="text-align:center;color:var(--text-subtle);padding:30px 0;font-size:13px;">불러오는 중…</div>
        </div>
      </div>
    `;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
    sheet.querySelector('#dcqClose').addEventListener('click', close);
    return sheet;
  }

  // [2026-05-02 Phase 1.2] 큐 자동 갱신 — 사장이 화면 보고 있는 동안 10초마다 새 카드 따라잡기
  const QUEUE_POLL_MS = 10000;
  let _queuePollTimer = null;
  let _queueVisHandlerBound = false;
  function _isQueueOpen() {
    const s = document.getElementById('dmConfirmQueueSheet');
    if (!s) return false;
    const ds = s.style.display;
    return ds === 'flex' || ds === 'block';
  }
  function _bindQueueVisHandler() {
    if (_queueVisHandlerBound) return;
    _queueVisHandlerBound = true;
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && _isQueueOpen()) _refresh().catch(() => {});
    });
  }
  function _startQueuePoll() {
    _stopQueuePoll();
    _bindQueueVisHandler();
    _queuePollTimer = setInterval(() => {
      if (document.hidden || !_isQueueOpen()) return;
      _refresh().catch(() => {});
    }, QUEUE_POLL_MS);
  }
  function _stopQueuePoll() {
    if (_queuePollTimer) clearInterval(_queuePollTimer);
    _queuePollTimer = null;
  }

  async function open() {
    const sheet = _ensureSheet();
    const card = sheet.querySelector('#dcqCard');
    // [2026-05-02 hotfix] 이전 close 의 transition 잔여 상태 reset — opacity 0 으로 재진입 시 빈 화면 방지
    sheet.style.transition = '';
    sheet.style.opacity = '';
    if (card) {
      card.style.transition = '';
      card.style.transform = '';
    }
    if (window.SheetAnim) window.SheetAnim.open(sheet, card);
    else sheet.style.display = 'flex';
    await _refresh();
    _startQueuePoll();
  }
  function close() {
    _stopQueuePoll();
    const sheet = document.getElementById('dmConfirmQueueSheet');
    if (!sheet) return;
    const card = sheet.querySelector('#dcqCard');
    if (window.SheetAnim) window.SheetAnim.close(sheet, card);
    else sheet.style.display = 'none';
  }

  async function _refresh() {
    const list = document.getElementById('dcqList');
    if (!list) return;
    try {
      const items = await _fetch('GET', '/dm-confirm-queue');
      const count = items.length;
      const cnt = document.getElementById('dcqCount');
      if (cnt) cnt.textContent = count + '건';
      if (!count) {
        list.innerHTML = `<div style="text-align:center;color:var(--text-subtle);padding:30px 0;font-size:13px;line-height:1.6;">대기 중인 메시지가 없어요.<br>AI 가 자동 답변 잘 하고 있어요.</div>`;
        return;
      }
      const _actionLabel = {
        booking_action: '예약 자동 생성',
        revenue_action: '결제 확인',
        cancel_action: '🗑 취소 처리',
        customer_register_action: '👤 신규 고객 자동 등록',
      };
      // [기능 7] 후보 라벨 — 첫 번째는 기본, 나머지는 "짧게" / "따뜻하게"
      const _CAND_LABELS = ['기본', '짧게', '따뜻하게', '정중'];
      list.innerHTML = items.map(it => {
        const actLbl = _actionLabel[it.action_required];
        const actMeta = it.action_meta || {};
        const actInfo = actLbl ? `
          <div style="display:flex;flex-direction:column;gap:4px;padding:8px 10px;background:#FFF7E6;border:1px solid #FBBF24;border-radius:8px;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span style="font-size:12px;font-weight:800;color:#92400E;">${actLbl}</span>
              ${actMeta.calendar_checked ? `<span style="font-size:10px;background:#10B981;color:#fff;padding:1px 7px;border-radius:99px;font-weight:700;">캘린더 확인됨</span>` : ''}
              <span style="margin-left:auto;font-size:10px;color:#92400E80;">승인 시 자동 실행</span>
            </div>
            ${actMeta.owner_label ? `<div style="font-size:12px;color:#92400E;font-weight:700;line-height:1.4;">${_esc(actMeta.owner_label)}</div>` : `
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                ${actMeta.time_kst ? `<span style="font-size:11px;color:#92400E;font-weight:700;">${_esc(actMeta.time_kst)}</span>` : (actMeta.requested_time ? `<span style="font-size:11px;color:#92400E;">${_esc(actMeta.requested_time)}</span>` : '')}
                ${actMeta.service_name ? `<span style="font-size:11px;color:#92400E;">· ${_esc(actMeta.service_name)}</span>` : ''}
                ${actMeta.name ? `<span style="font-size:11px;color:#92400E;font-weight:700;">${_esc(actMeta.name)}</span>` : ''}
                ${actMeta.phone ? `<span style="font-size:11px;color:#92400E;">${_esc(actMeta.phone)}</span>` : ''}
                ${actMeta.service_interest ? `<span style="font-size:10px;background:#fff;padding:1px 6px;border-radius:99px;color:#92400E;">${_esc(actMeta.service_interest)}</span>` : ''}
              </div>
            `}
            ${actMeta.confidence ? `<div style="font-size:10px;color:#92400E80;">신뢰도 ${Math.round((actMeta.confidence || 0) * 100)}%</div>` : ''}
          </div>` : '';
        // [Phase 1.1+] booking_action + calendar_checked 카드면 [거절+대안] 버튼 노출
        const showDeclineAlt = it.action_required === 'booking_action' && actMeta.calendar_checked;
        // [기능 7] 후보 list (없으면 ai_draft_text 1개로 fallback)
        const candidates = (it.ai_draft_candidates && it.ai_draft_candidates.length)
          ? it.ai_draft_candidates
          : (it.ai_draft_text ? [it.ai_draft_text] : []);
        const cardsHtml = candidates.map((c, idx) => `
          <label class="dcq-cand" data-idx="${idx}" style="display:block;padding:10px 12px;border:2px solid ${idx === 0 ? '#A78BFA' : '#e5e5e5'};border-radius:10px;background:${idx === 0 ? '#FAF5FF' : '#fff'};margin-bottom:6px;cursor:pointer;transition:all .15s;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
              <span style="font-size:10px;font-weight:800;color:${idx === 0 ? '#5B21B6' : '#888'};background:${idx === 0 ? '#DDD6FE' : '#F4F4F8'};padding:1px 7px;border-radius:99px;">${_CAND_LABELS[idx] || `후보 ${idx+1}`}</span>
              <input type="radio" name="dcq-cand-${it.id}" value="${idx}" ${idx === 0 ? 'checked' : ''} style="margin-left:auto;accent-color:#7C3AED;">
            </div>
            <div style="font-size:13px;color:#333;line-height:1.5;white-space:pre-wrap;">${_esc(c)}</div>
          </label>
        `).join('');
        const sendBtnLabel = it.action_required ? '✓ 승인 + 액션' : '✓ 선택 발송';
        return `
        <div data-id="${it.id}" style="padding:14px;background:#FAFAFA;border:1px solid #f0f0f0;border-radius:14px;margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
            <span style="display:inline-flex;align-items:center;font-size:11px;font-weight:700;color:${_intentColor(it.intent)};background:${_intentColor(it.intent)}15;padding:2px 8px;border-radius:99px;">${_intentLabel(it.intent)}</span>
            <span style="font-size:10px;color:#888;">…${_esc(it.sender_tail)}</span>
            <span style="margin-left:auto;font-size:10px;color:#888;">${it.minutes_waiting}분 대기</span>
          </div>
          <div style="font-size:12px;color:#555;background:#fff;padding:8px 10px;border-radius:8px;margin-bottom:8px;line-height:1.5;">
            <span style="color:#888;font-size:10px;">손님</span><br>
            ${_esc(it.received_text)}
          </div>
          ${actInfo}
          <div style="margin-bottom:8px;">${cardsHtml}</div>
          <details style="margin-bottom:8px;">
            <summary style="font-size:11px;color:#7C3AED;cursor:pointer;font-weight:600;">✏️ 직접 수정해서 발송</summary>
            <textarea class="dcq-edit" rows="3" style="width:100%;margin-top:6px;padding:9px;border:1px solid #DDD6FE;border-radius:8px;font-size:13px;line-height:1.5;background:#FAF5FF;resize:vertical;box-sizing:border-box;font-family:inherit;">${_esc(candidates[0] || '')}</textarea>
            <button class="dcq-send-edit" style="margin-top:6px;width:100%;padding:9px;border:none;background:linear-gradient(135deg,#7C3AED,#A78BFA);color:#fff;font-weight:700;font-size:12px;border-radius:10px;cursor:pointer;">수정한 텍스트로 발송</button>
          </details>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="dcq-send" style="flex:1;min-width:120px;padding:11px;border:none;background:linear-gradient(135deg,#10B981,#34D399);color:#fff;font-weight:800;font-size:13px;border-radius:10px;cursor:pointer;">${sendBtnLabel}</button>
            ${showDeclineAlt ? `<button class="dcq-decline-alt" style="padding:11px 12px;border:1px solid #F59E0B;background:#FFFBEB;color:#92400E;font-weight:700;font-size:12px;border-radius:10px;cursor:pointer;" title="이 시간은 안 되니 대안 시간을 손님에게 안내">⏰ 거절+대안</button>` : ''}
            <button class="dcq-discard" style="padding:11px 14px;border:1px solid #FCA5A5;background:#fff;color:#B91C1C;font-weight:700;font-size:12px;border-radius:10px;cursor:pointer;">✕</button>
          </div>
        </div>
      `;}).join('');
      // 후보 카드 클릭 시 라디오 선택 + 시각 강조
      list.querySelectorAll('.dcq-cand').forEach(el => {
        el.addEventListener('click', () => {
          const card = el.closest('[data-id]');
          if (!card) return;
          card.querySelectorAll('.dcq-cand').forEach(x => {
            const isOn = x === el;
            x.style.border = isOn ? '2px solid #A78BFA' : '2px solid #e5e5e5';
            x.style.background = isOn ? '#FAF5FF' : '#fff';
            const r = x.querySelector('input[type=radio]');
            if (r) r.checked = isOn;
          });
        });
      });
      list.querySelectorAll('.dcq-send').forEach(b => {
        b.addEventListener('click', () => _doAction(b, 'send'));
      });
      list.querySelectorAll('.dcq-send-edit').forEach(b => {
        b.addEventListener('click', () => _doAction(b, 'send_edit'));
      });
      list.querySelectorAll('.dcq-discard').forEach(b => {
        b.addEventListener('click', () => _doAction(b, 'discard'));
      });
      list.querySelectorAll('.dcq-decline-alt').forEach(b => {
        b.addEventListener('click', () => _doAction(b, 'decline_alt'));
      });
    } catch (e) {
      list.innerHTML = `<div style="text-align:center;color:#dc3545;padding:20px;font-size:12px;">불러오기 실패: ${_esc(e.message)}</div>`;
    }
  }

  async function _doAction(btn, action) {
    const card = btn.closest('[data-id]');
    if (!card) return;
    const id = card.dataset.id;
    const editArea = card.querySelector('.dcq-edit');
    const editedText = editArea ? editArea.value.trim() : '';
    // [기능 7] 라디오 체크된 후보 idx
    let selectedIdx = 0;
    const checkedRadio = card.querySelector('input[type=radio]:checked');
    if (checkedRadio) selectedIdx = parseInt(checkedRadio.value, 10) || 0;

    btn.disabled = true; btn.style.opacity = '0.6';
    try {
      let r;
      if (action === 'send') {
        r = await _fetch('POST', `/dm-confirm-queue/${id}/send`, { selected_index: selectedIdx });
      } else if (action === 'send_edit') {
        if (!editedText) {
          if (window.showToast) window.showToast('수정 내용이 비어있어요');
          btn.disabled = false; btn.style.opacity = '1';
          return;
        }
        r = await _fetch('POST', `/dm-confirm-queue/${id}/send_edit`, { edited_reply: editedText });
      } else if (action === 'decline_alt') {
        if (!confirm('이 시간은 거절하고 대안 시간을 손님에게 안내할까요?')) {
          btn.disabled = false; btn.style.opacity = '1';
          return;
        }
        r = await _fetch('POST', `/dm-confirm-queue/${id}/decline-with-alternatives`);
      } else {
        r = await _fetch('POST', `/dm-confirm-queue/${id}/discard`);
      }
      // send / send_edit 성공 시 → 예약 캐시 무효화 + 홈/벨 갱신 + Undo 토스트
      // (app-booking-api.js 의 _invalidateCache 가 itdasy:data-changed 리스너로 발동)
      const isApproveSend = (action === 'send' || action === 'send_edit');
      const undoLogId = r.log_id || r.action_log_id || null;
      const baseMsg = r.message || '예약 등록됐어요';

      if (isApproveSend && undoLogId && typeof window.showUndoToast === 'function') {
        // 백엔드가 action log id 를 돌려주면 "되돌리기 →" 버튼 토스트
        try { window.showUndoToast(baseMsg, undoLogId); } catch (_t) {
          if (window.showToast) window.showToast(baseMsg);
        }
      } else if (window.showToast) {
        window.showToast(baseMsg);
      }

      if (isApproveSend) {
        try {
          window.dispatchEvent(new CustomEvent('itdasy:data-changed', {
            detail: { kind: 'create_booking', source: 'dm_confirm', booking_id: r.booking_id || null }
          }));
        } catch (_evt) { /* ignore */ }
        try { if (typeof window.refreshDashBell === 'function') window.refreshDashBell(); } catch (_b) { /* ignore */ }
        try { if (window.HomeV41 && typeof window.HomeV41.refresh === 'function') window.HomeV41.refresh(); } catch (_h) { /* ignore */ }
      }

      // 카드 슬라이드 아웃
      card.style.transition = 'all 0.25s ease-out';
      card.style.opacity = '0';
      card.style.transform = 'translateX(40px)';
      setTimeout(() => { card.remove(); refreshBadge(); }, 250);
    } catch (e) {
      if (window.showToast) window.showToast('실패: ' + e.message);
      btn.disabled = false; btn.style.opacity = '1';
    }
  }

  // 큐 N건 배지 갱신 — DM 자동응답 시트에서 부름
  async function refreshBadge() {
    try {
      const items = await _fetch('GET', '/dm-confirm-queue');
      const n = items.length;
      // 1) DM 자동응답 시트 안의 배지
      const badge = document.getElementById('dmQueueBadge');
      if (badge) {
        if (n > 0) {
          badge.textContent = n + '건 대기';
          badge.style.display = 'inline-flex';
        } else {
          badge.style.display = 'none';
        }
      }
      // 2) AI 허브 카드 배지 (있으면)
      const hubBadge = document.getElementById('aihDmQueueBadge');
      if (hubBadge) {
        if (n > 0) { hubBadge.textContent = n; hubBadge.style.display = 'inline-flex'; }
        else hubBadge.style.display = 'none';
      }
      return n;
    } catch (_e) { return 0; }
  }

  window.openDMConfirmQueue = open;
  window.closeDMConfirmQueue = close;
  window.refreshDMQueueBadge = refreshBadge;
})();
