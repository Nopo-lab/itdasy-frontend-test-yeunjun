/* DM 사장 confirm 큐 시트 — Sprint 4 (2026-04-30)
   사용:
     window.openDMConfirmQueue()       — 시트 열기
     window.refreshDMQueueBadge()      — DM 자동응답 시트의 큐 N건 배지 갱신
*/
(function () {
  'use strict';

  function _esc(s) { return window._esc(s); } /* [2026-06-11] 중복 제거 — app-core 정본 위임 */

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

  function _ensureSheet() {
    let sheet = document.getElementById('dmConfirmQueueSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'dmConfirmQueueSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9988;background:rgba(0,0,0,0.5);display:none;align-items:flex-end;justify-content:center;';
    sheet.innerHTML = `
      <div id="dcqCard" style="width:100%;max-width:560px;background:#F7F8FA;border-radius:20px 20px 0 0;max-height:92vh;display:flex;flex-direction:column;padding:18px 16px max(18px,var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:#F7EFF0;color:#BC6675;"><svg width="15" height="15" aria-hidden="true"><use href="#ic-bot"/></svg></span>
          <strong style="font-size:17px;color:#191F28;">실시간 DM</strong>
          <span id="dcqCount" style="font-size:11px;background:#F2F4F6;color:#4E5968;padding:2px 8px;border-radius:99px;font-weight:700;">0건</span>
          <button id="dcqSettings" aria-label="자동응답 설정" title="자동응답 설정" style="margin-left:auto;background:none;border:none;cursor:pointer;color:#4E5968;display:inline-flex;align-items:center;padding:4px;"><i class="ph-duotone ph-gear" aria-hidden="true" style="font-size:19px;"></i></button>
          <button id="dcqClose" aria-label="닫기" style="background:none;border:none;cursor:pointer;color:#8B95A1;display:inline-flex;align-items:center;padding:4px;"><svg width="14" height="14" aria-hidden="true"><use href="#ic-x"/></svg></button>
        </div>
        <div style="font-size:11.5px;color:#8B95A1;margin-bottom:12px;line-height:1.5;">
          답장이 필요한 손님 메시지예요. 잇비 추천 답장을 확인하고 전송하세요.
        </div>
        <style>@keyframes dcqSpin{to{transform:rotate(360deg)}}
          #dcqTabs::-webkit-scrollbar{display:none}
          .dcq-tab{font-size:12.5px;padding:6px 11px;border-radius:9px;border:1px solid #E5E8EB;background:#fff;color:#8B95A1;white-space:nowrap;cursor:pointer;font-weight:600;font-family:inherit;flex:none;}
          .dcq-tab.on{background:#191F28;border-color:#191F28;color:#fff;}</style>
        <div id="dcqTabs" style="display:flex;gap:6px;overflow-x:auto;margin-bottom:12px;scrollbar-width:none;">
          <button type="button" class="dcq-tab on" data-filter="all">전체 0</button>
          <button type="button" class="dcq-tab" data-filter="instagram">인스타 0</button>
          <button type="button" class="dcq-tab" data-filter="kakao">카톡 0</button>
          <button type="button" class="dcq-tab" data-filter="naver">네이버 톡톡 0</button>
        </div>
        <div id="dcqList" style="flex:1;overflow-y:auto;">
          <div style="display:flex;justify-content:center;padding:40px 20px;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:dcqSpin .8s linear infinite" aria-label="불러오는 중"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg></div>
        </div>
      </div>
    `;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
    sheet.querySelector('#dcqClose').addEventListener('click', close);
    const _setBtn = sheet.querySelector('#dcqSettings');
    if (_setBtn) _setBtn.addEventListener('click', () => {
      // 설정 시트는 생성 시 z-index 9996(카드 9988 위) — setTimeout 보정 불필요.
      if (typeof window.openDMAutoreplySettings === 'function') window.openDMAutoreplySettings();
    });
    // [2026-06-16] 채널 필터 탭 — 재조회 없이 캐시(_lastItems) 로 즉시 필터.
    const _tabs = sheet.querySelector('#dcqTabs');
    if (_tabs) _tabs.addEventListener('click', (e) => {
      const t = e.target.closest('.dcq-tab');
      if (!t) return;
      _activeFilter = t.getAttribute('data-filter') || 'all';
      _applyAndRender();
    });
    return sheet;
  }

  // [2026-05-02 Phase 1.2] 큐 자동 갱신 — 사장이 화면 보고 있는 동안 새 카드 따라잡기
  //   [2026-06-19] 10초→4초. 새 DM 체감 지연 완화. (숨김/닫힘 땐 아래 setInterval 가드로 no-op)
  const QUEUE_POLL_MS = 4000;
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
    // [2026-07-23] 뒤로가기 등록 — 없으면 안드로이드 back 에 앱이 그냥 꺼진다.
    if (typeof window._registerSheet === 'function') window._registerSheet('dmConfirmQueue', close);
    if (typeof window._markSheetOpen === 'function') window._markSheetOpen('dmConfirmQueue');
    await _refresh();
    _startQueuePoll();
  }
  function close() {
    _stopQueuePoll();
    if (typeof window._markSheetClosed === 'function') window._markSheetClosed('dmConfirmQueue');
    const sheet = document.getElementById('dmConfirmQueueSheet');
    if (!sheet) return;
    const card = sheet.querySelector('#dcqCard');
    if (window.SheetAnim) window.SheetAnim.close(sheet, card);
    else sheet.style.display = 'none';
  }

  // ── [2026-06-08] 잇비 챗봇 톤 카드 빌더 ─────────────────────────
  function _intentKo(i) {
    return { pricing: '가격 문의', booking: '예약 문의', hours: '영업시간', location: '위치 문의',
      review: '후기', greeting: '인사', complaint: '문의', reschedule: '예약 변경',
      no_show: '지각/불참', cancel_booking: '예약 취소', unknown: '문의' }[i] || '문의';
  }
  const _AVATAR_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2.2c-4.5 0-8 2.6-8 5.9V21h16v-.9c0-3.3-3.5-5.9-8-5.9Z"/></svg>';
  function _gradeBadge(grade) {
    return `<span style="font-size:11px;font-weight:700;color:#BC6675;background:#F7EFF0;padding:2px 8px;border-radius:99px;flex-shrink:0;">${_esc(grade || '신규')}</span>`;
  }
  // [2026-06-08] 캘린더 확인 한 줄 — calendar_checked 인 카드만. 그레이/로즈 톤만(초록·노랑 X).
  function _bookingLine(am) {
    if (!am || !am.calendar_checked) return '';
    const t = am.time_kst || am.requested_time || '';
    // 날짜 (starts_at_iso → M/D)
    let dateStr = '';
    if (am.starts_at_iso) {
      const d = new Date(am.starts_at_iso);
      if (!isNaN(d.getTime())) dateStr = `${d.getMonth() + 1}/${d.getDate()} `;
    }
    if (am.slot_available) {
      // [2026-07-02] 러너웨이 항상 표기 — 뒤로 남은 여유(원장이 겹침 판단하게)
      const _rw = _fmtRunway(am.runway_min);
      const _rwTxt = _rw ? ` · 뒤로 ${_rw}` : '';
      return `<div style="font-size:12px;color:#8B95A1;margin:10px 0 2px;">✓ 캘린더 확인 · ${_esc(dateStr + t)}${_rwTxt} 비어있음</div>`;
    }
    return `<div style="font-size:12px;color:#BC6675;margin:10px 0 2px;">✕ 그 시간 예약 있음 — 대안 필요</div>`;
  }
  // [2026-06-09] 손님이 보낸 미답장 메시지 전부 — 말풍선 스택(손님 톤). 1건이면 기존과 동일.
  function _receivedStack(it) {
    const raw = (Array.isArray(it.received_messages) && it.received_messages.length)
      ? it.received_messages
      : [it.received_text || ''];
    const msgs = raw.map(m => String(m || '').trim()).filter(Boolean);
    if (msgs.length <= 1) {
      return `<div style="font-size:14px;color:#191F28;line-height:1.5;white-space:pre-wrap;word-break:break-word;">${_esc(msgs[0] || '')}</div>`;
    }
    const bubbles = msgs.map(m => `<div style="align-self:flex-start;max-width:88%;background:#F2F4F6;color:#191F28;border-radius:13px;border-top-left-radius:4px;padding:9px 12px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-break:break-word;">${_esc(m)}</div>`).join('');
    return `<div style="display:flex;flex-direction:column;gap:5px;">${bubbles}</div>`;
  }
  // [2026-06-09] 예약금 안내 단계 — 입금 대기 표시(BE awaiting_deposit). 이모지 → lucide.
  function _depositLine(am) {
    if (!am || !am.awaiting_deposit) return '';
    return `<div style="display:flex;align-items:center;gap:5px;font-size:12px;color:#BC6675;font-weight:600;margin:8px 0 2px;">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20M7 15h.01M11 15h2"/></svg>
      예약금 입금 대기 — 입금 확인되면 [전송 + 캘린더 등록]</div>`;
  }

  // [2026-06-27 #1] 손님에게 갈 '확정 멘트' 미리보기 — 원장 지시문(잇비 추천 답장)과 분리해 노출.
  //   확정 누르면 이 문구가 손님에게 그대로 발송됨(BE confirm_preview ≡ 실제 발송).
  function _confirmPreview(am) {
    const msg = am && am.confirm_preview;
    if (!msg) return '';
    // [2026-07-03] 입금확정 카드(추천답장 박스가 숨겨진 경우)에서만 노출.
    //   변경·취소·예약 카드는 '잇비 추천 답장'이 곧 손님 멘트라 이 박스를 또 띄우면 완전 중복.
    if (!am.deposit_sent) return '';
    // [2026-07-14 #31] 확정 멘트 수정 가능 — 연필 누르면 textarea 로 전환, 확정 시 그 문구로 발송.
    return `<div style="margin-top:10px;padding:10px 12px;border:1px solid #E5E8EB;border-radius:12px;background:#FAFBFC;">
      <div style="display:flex;align-items:center;gap:5px;font-size:10.5px;color:#8B95A1;font-weight:700;margin-bottom:5px;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7Z"/></svg>
        확정 시 손님에게 갈 멘트
        <button type="button" class="dcq-cpv-edit" style="margin-left:auto;display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border:1px solid #E5E8EB;background:#fff;color:#4E5968;font-weight:600;font-size:10.5px;border-radius:8px;cursor:pointer;">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>수정
        </button>
      </div>
      <div class="dcq-cpv-text" style="font-size:13px;color:#191F28;line-height:1.5;white-space:pre-wrap;word-break:break-word;">${_esc(String(msg))}</div>
      <textarea class="dcq-cpv-ta" rows="3" style="display:none;width:100%;padding:9px 11px;border:1px solid #E5E8EB;border-radius:11px;font-size:13px;line-height:1.5;background:#fff;color:#191F28;resize:vertical;box-sizing:border-box;font-family:inherit;">${_esc(String(msg))}</textarea>
    </div>`;
  }
  // 무의미값 필터 — truthy 지만 표시 의미 없는 값
  const _MEANINGLESS = new Set(['모르겠음','모름','?','미정','무','없음','없어요','몰라요','나중에','상관없음','아무거나','기타','etc','n/a','na','null','undefined','-','—','...','..']);
  function _isMeaningless(v) { return !v || _MEANINGLESS.has(String(v).trim().toLowerCase()); }

  // [2026-06-10 #2] 칩: 제목 + 옵션 포함 + 무의미값 필터
  function _extractedChips(ex, am) {
    const name = (ex && ex.name) || (am && am.name);
    const phone = (ex && ex.phone) || (am && am.phone);
    const svc = (am && am.service_name) || (ex && ex.service_interest) || '';
    // [2026-06-27 (c)] 확정될 시간 + 손님이 1순위로 준 시간을 분리. 칩 표시는 날짜포함(_disp) 우선.
    //   1순위가 막혀 n순위로 승격됐으면 1순위·n순위 칩 2개로 보여 원장이 확인하게.
    const wish = (am && (am.time_disp || am.time_kst || am.requested_time)) || '';
    const rank = am && Number(am.booking_rank);
    const primary = (am && (am.primary_disp || am.primary_time)) || '';
    const promoted = !!(wish && rank && rank > 1 && primary && primary !== wish);
    const opts = (am && am.service_options) || {};
    const memo = (am && am.memo) || '';
    const chips = [];
    if (!_isMeaningless(name))  chips.push({ prefix: '성함', val: name });
    if (!_isMeaningless(phone)) chips.push({ prefix: '연락처', val: phone });
    if (!_isMeaningless(svc))   chips.push({ prefix: '시술', val: svc });
    if (promoted) {
      if (!_isMeaningless(primary)) chips.push({ prefix: '1순위', val: primary });
      if (!_isMeaningless(wish))    chips.push({ prefix: `${rank}순위`, val: wish });
    } else if (!_isMeaningless(wish)) {
      chips.push({ prefix: '시간', val: wish });
    }
    if (!_isMeaningless(opts.length))  chips.push({ prefix: '인치', val: opts.length });
    if (!_isMeaningless(opts.color))   chips.push({ prefix: '색상', val: opts.color });
    if (!_isMeaningless(opts.remove))  chips.push({ prefix: '제거', val: opts.remove });
    if (!_isMeaningless(opts.design))  chips.push({ prefix: '디자인', val: opts.design });
    if (!_isMeaningless(memo))  chips.push({ prefix: '요청', val: memo });
    if (!chips.length) return '';
    return `<div style="margin-top:8px;padding:8px 10px;border:1px solid #E5E8EB;border-radius:10px;background:#fff;">
      <div style="display:flex;align-items:center;gap:5px;font-size:10.5px;color:#8B95A1;font-weight:700;margin-bottom:6px;">
        <svg width="12" height="12" aria-hidden="true"><use href="#ic-bot"/></svg>잇비가 정리한 정보
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
      ${chips.map(c => `<span style="font-size:11px;color:#4E5968;background:#F2F4F6;padding:3px 9px;border-radius:99px;"><span style="color:#8B95A1;font-size:11px;">${c.prefix}</span> ${_esc(String(c.val))}</span>`).join('')}
      </div>
    </div>`;
  }
  // [2026-06-24 2a] 예상 시술 시간 — 30분 단위 스테퍼. 초기값=카탈로그 default_duration_min(없으면 60).
  //   원장이 ±30분 조정 → 전송 시 duration_min 으로 보냄(ends_at 보정). 미조정이면 기본값 그대로.
  function _fmtDur(min) {
    const m = Math.max(30, parseInt(min, 10) || 60);
    const h = Math.floor(m / 60), r = m % 60;
    if (h && r) return h + '시간 ' + r + '분';
    if (h) return h + '시간';
    return r + '분';
  }
  // [2026-07-02] 러너웨이(뒤로 남은 여유) 포매터 — 클램프 없이 순수 표기, 0·음수·비정상은 빈문자.
  function _fmtRunway(min) {
    const m = parseInt(min, 10);
    if (!Number.isFinite(m) || m <= 0) return '';
    const h = Math.floor(m / 60), r = m % 60;
    if (h && r) return h + '시간 ' + r + '분';
    if (h) return h + '시간';
    return r + '분';
  }
  function _durationStepper(it) {
    const am = it.action_meta || {};
    // [2026-06-24] booking_action(빈시간 즉시확정) + deposit_sent(입금확인→확정) 둘 다 시술시간 스테퍼 노출.
    //   입금흐름은 action_required 가 confirm 시점에만 'booking_action' 이라 카드 단계에선 안 떴던 버그 대응.
    if (it.action_required !== 'booking_action' && !am.deposit_sent) return '';
    const init = Math.max(30, Math.round(((parseInt(am.default_duration_min, 10) || 60)) / 30) * 30);
    // [2026-07-02] 러너웨이 초과 시 겹침 소프트경고 — 원장 전용, 차단 없음
    const _rwMin = parseInt(am.runway_min, 10);
    const _over0 = Number.isFinite(_rwMin) && _rwMin > 0 && init > _rwMin;
    const _ymd = am.starts_at_iso ? String(am.starts_at_iso).split('T')[0] : '';
    const _btn = (step, lbl, path) => `<button class="dcq-dur-btn" data-step="${step}" aria-label="${lbl}" style="width:28px;height:28px;border:1px solid #E5E8EB;background:#F2F4F6;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#4E5968;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">${path}</svg></button>`;
    return `<div class="dcq-dur-wrap" style="margin-top:8px;display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border:1px solid #E5E8EB;border-radius:12px;background:#fff;">
      <span style="font-size:12px;color:#8B95A1;font-weight:700;">예상 시술 시간</span>
      <div style="display:flex;align-items:center;gap:10px;">
        ${_btn(-30, '30분 줄이기', '<path d="M5 12h14"/>')}
        <span class="dcq-dur" data-dur="${init}" data-runway="${Number.isFinite(_rwMin) ? _rwMin : ''}" style="min-width:64px;text-align:center;font-size:13.5px;font-weight:700;color:#191F28;">${_fmtDur(init)}</span>
        ${_btn(30, '30분 늘리기', '<path d="M12 5v14M5 12h14"/>')}
      </div>
    </div>
    <div class="dcq-dur-warn" style="display:${_over0 ? 'flex' : 'none'};align-items:center;gap:5px;font-size:12px;color:#BC6675;font-weight:500;margin:8px 2px 2px;">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
      <span>다른 손님과 시간이 겹칠 수 있어요</span>
      <button class="dcq-cal-jump" type="button" data-ymd="${_ymd}" style="margin-left:auto;display:inline-flex;align-items:center;gap:3px;background:none;border:none;padding:0;color:#BC6675;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;">캘린더 보기<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
    </div>`;
  }
  // [F2] 전송 버튼 라벨·스타일
  function _mainBtnStyle(it) {
    const am = it.action_meta || {};
    if (it.action_required === 'send_form') return 'background:#191F28;';  // [A] 양식 보내기 → 검정(기본 CTA)
    if (it.action_required === 'reschedule_action') return 'background:#191F28;';  // [2026-06-28] 옮기기 확정 → 검정
    if (am.deposit_sent) return 'background:#191F28;';  // [2026-06-27 #3] 입금 확인+예약 확정 → 검정(기본 CTA 통일)
    if (am.awaiting_deposit) return 'background:#BC6675;';  // 예약금 안내 → 로즈
    return 'background:#191F28;';
  }
  function _mainBtnLabel(it) {
    const am = it.action_meta || {};
    if (it.action_required === 'send_form') return '양식 보내기';  // [A]
    if (it.action_required === 'reschedule_action') return '변경 확정';  // [2026-06-28] 예약 변경
    if (it.action_required === 'cancel_action') return '취소 확정';  // [2026-06-28] 예약 취소
    if (am.set_address) return '주소 저장 + 보내기';  // [2026-06-24] 주소 미설정 카드
    if (am.deposit_sent) return '입금 확인 + 예약 확정';
    if (am.awaiting_deposit) return '예약금 안내 전송';
    return '전송';
  }
  // [2026-06-28] 예약 변경 확정 카드 — 기존 시각 → 옮길 시각을 한눈에.
  function _rescheduleLine(am) {
    if (!am || am.reschedule_manual || am.reschedule_ask) return '';
    const to = am.time_disp || '';
    if (!to) return '';
    const from = am.old_time_disp || '';
    const arrow = from
      ? `<span style="color:#8B95A1;text-decoration:line-through;">${_esc(String(from))}</span>
         <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8B95A1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px;"><path d="M5 12h14M13 6l6 6-6 6"/></svg> `
      : '';
    return `<div style="margin-top:8px;padding:9px 12px;border:1px solid #E5E8EB;border-radius:12px;background:#fff;display:flex;align-items:center;gap:7px;flex-wrap:wrap;">
      <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#BC6675;font-weight:700;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/></svg>예약 변경</span>
      <span style="font-size:13px;color:#191F28;font-weight:600;">${arrow}${_esc(String(to))}</span>
    </div>`;
  }
  // [2026-06-28] 예약 취소 확정 카드 — 취소될 예약(시간·시술)을 취소선으로 한눈에.
  function _cancelLine(am) {
    if (!am) return '';
    const when = [am.time_disp, am.service_name].filter(Boolean).map(function (s) { return _esc(String(s)); }).join(' · ');
    if (!when) return '';
    return `<div style="margin-top:8px;padding:9px 12px;border:1px solid #E5E8EB;border-radius:12px;background:#fff;display:flex;align-items:center;gap:7px;flex-wrap:wrap;">
      <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#BC6675;font-weight:700;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/><path d="m9 16 6-6M15 16l-6-6"/></svg>예약 취소</span>
      <span style="font-size:13px;color:#8B95A1;font-weight:600;text-decoration:line-through;">${when}</span>
    </div>`;
  }
  // deposit_sent 단계: 메인 버튼이 [입금 확인+예약 확정]이므로 별도 버튼 불필요
  function _depositConfirmBtn(_it) { return ''; }
  // [2026-06-24] 주소 미설정 카드 — 손님 위치문의 + 샵 주소 빈값. 주소 한 번 입력 →
  //   손님 발송 + 설정 저장(자가치유). 잇비 추천답장 섹션 대신 이 입력칸이 들어감.
  function _setAddressBlock() {
    return `<div style="margin-top:12px;">
      <div style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#0F766E;background:#ECFDF5;padding:3px 9px;border-radius:99px;margin-bottom:8px;">
        📍 위치 문의 — 주소 한 번만 입력하면 다음부턴 자동
      </div>
      <input class="dcq-set-address" type="text" placeholder="예: 서울 강남구 테헤란로 12길 34, 5층" autocomplete="off" style="width:100%;padding:11px 13px;border:1px solid #E5E8EB;border-radius:13px;font-size:13.5px;background:#fff;color:#191F28;box-sizing:border-box;font-family:inherit;" />
      <div style="font-size:11px;color:#0F766E;margin-top:6px;display:flex;align-items:center;gap:4px;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
        보내면 설정에도 저장돼요
      </div>
    </div>`;
  }
  function _gotoCalendar(ymd) {
    try {
      if (typeof window.showTab === 'function') {
        const btn = document.querySelector('.tab-bar__btn[data-tab="calendar"]');
        window.showTab('calendar', btn);
      }
      if (ymd && typeof window.openBooking === 'function') window.openBooking(ymd);
      else if (typeof window.openCalendarView === 'function') window.openCalendarView();
    } catch (_e) { void _e; }
  }
  // [2026-06-16] 통합 인박스 — 채널 마크/필터. BE channel: 'instagram'|'kakao'|'naver'(talktalk 정규화됨).
  let _lastItems = [];
  let _activeFilter = 'all';
  const _CH_LABEL = { all: '전체', instagram: '인스타', kakao: '카톡', naver: '네이버 톡톡' };

  // 채널 마크/정규화 — 공유 모듈(js/channel-mark.js) 정본 사용(중복 정의 금지). 폴백 instagram.
  function _normChannel(c) { return (window.ChannelMark && window.ChannelMark.norm) ? window.ChannelMark.norm(c) : 'instagram'; }
  function _channelMark(c) { return (window.ChannelMark && window.ChannelMark.mark) ? window.ChannelMark.mark(c) : ''; }

  function _cardHtml(it) {
    const tail = (it.sender_tail || '').slice(-4);
    const ex = it.extracted || null;
    const am = it.action_meta || {};
    const isFormAuto = !!it.form_auto_sent;
    const isSendForm = it.action_required === 'send_form';  // [A] 발송 전 [양식 보내기] 카드
    const isPhotoOnly = !!am.photo_only;
    const name = it.display_name || (ex && ex.name) || ('손님 …' + tail);
    const _rawDraft = (it.ai_draft_candidates && it.ai_draft_candidates[0]) || it.ai_draft_text || '';
    const draft = (!_rawDraft && isFormAuto) ? '손님 양식 답변 대기 중이에요…' : _rawDraft;
    const isBooking = it.action_required === 'booking_action';
    const isSetAddress = !!am.set_address;  // [2026-06-24] 주소 미설정 카드
    const isRisk = !!am.risk_manual;  // [2026-06-26] 위험 문의 — 원장 직접답장(초안 없음·자동발송 X)
    const isReschedManual = !!am.reschedule_manual;  // [2026-06-28] 변경인데 대상 예약 0/2건+ → 원장 직접 확인
    const isNoshow = !!am.noshow_manual;  // [2026-06-28] 지각·당일 불참 통보 — 자동답장 X, 원장 알림만
    const isCancelManual = !!am.cancel_manual;  // [2026-06-28] 취소인데 대상 예약 0/2건+ → 원장 직접 확인
    const noDraft = isRisk || isReschedManual || isNoshow || isCancelManual;  // 초안·전송 버튼 숨기고 직접 처리 안내만
    const pic = (it.profile_pic || '').trim();
    const avImg = pic
      ? `<img src="${_esc(pic)}" referrerpolicy="no-referrer" alt="" onerror="this.remove()" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%;">`
      : '';
    const summary = (it.customer_summary || '').trim();
    const amJson = _esc(JSON.stringify({ awaiting_deposit: !!am.awaiting_deposit, deposit_sent: !!am.deposit_sent }));
    // [2] 양식 발송 배지 — 손님 답 대기 중이거나 정보 누적 중인 카드
    const formAutoBadge = isFormAuto
      ? `<div style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#2563EB;background:#EFF6FF;padding:3px 9px;border-radius:99px;margin-bottom:8px;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7Z"/></svg>
          잇비가 예약 양식 보냈어요
        </div>` : '';
    // [A] 발송 전 — 원장이 [양식 보내기] 눌러야 나감
    const sendFormBadge = isSendForm
      ? `<div style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#0F766E;background:#ECFDF5;padding:3px 9px;border-radius:99px;margin-bottom:8px;">
          📋 예약 문의 — 양식 보낼까요?
        </div>` : '';
    // [Task 4] 사진 카드 배지 + 인스타 열기 안내
    const photoOnlyBlock = isPhotoOnly
      ? `<div style="display:flex;align-items:center;gap:8px;background:#F7F8FA;border:1px solid #EEF0F3;border-radius:12px;padding:11px 13px;margin-bottom:10px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3"/></svg>
          <div style="flex:1;min-width:0;">
            <div style="font-size:12.5px;font-weight:700;color:#344054;">손님이 사진을 보냈어요</div>
            <div style="font-size:11.5px;color:#667085;margin-top:1px;">인스타그램 DM에서 확인 후 직접 답장해 주세요</div>
          </div>
          <a href="${_esc(window.itdasyIgThreadLink ? window.itdasyIgThreadLink(it) : 'https://www.instagram.com/direct/inbox/')}" target="_blank" rel="noopener"
            style="flex-shrink:0;display:inline-flex;align-items:center;gap:5px;padding:8px 11px;background:#FBEEF1;border:1px solid #E6B9C2;color:#BC6675;text-decoration:none;border-radius:11px;font-size:12px;font-weight:700;">
            인스타 DM 열기
          </a>
        </div>` : '';
    // [2026-06-26] 예약/문의 카드에 손님 사진 첨부 — photo_attached(외톨이 photo_only 와 별개).
    //   BE _handle_photo_event(B-1)가 카드 메타에 기록. 인스타 열기 버튼 공유 util 재사용.
    const photoAttachedBlock = (am.photo_attached && !isPhotoOnly)
      ? `<div style="display:flex;align-items:center;gap:8px;background:#F7F8FA;border:1px solid #EEF0F3;border-radius:12px;padding:10px 12px;margin-bottom:10px;">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3"/></svg>
          <div style="flex:1;min-width:0;">
            <div style="font-size:12.5px;font-weight:700;color:#344054;">손님이 사진 ${Math.max(1, Number(am.photo_count) || 1)}장 보냈어요</div>
            <div style="font-size:11.5px;color:#667085;margin-top:1px;">인스타그램 DM에서 확인하세요</div>
          </div>
          <a href="${_esc(window.itdasyIgThreadLink ? window.itdasyIgThreadLink(it) : 'https://www.instagram.com/direct/inbox/')}" target="_blank" rel="noopener"
            style="flex-shrink:0;display:inline-flex;align-items:center;gap:5px;padding:8px 11px;background:#FBEEF1;border:1px solid #E6B9C2;color:#BC6675;text-decoration:none;border-radius:11px;font-size:12px;font-weight:700;">
            인스타 DM 열기
          </a>
        </div>` : '';
    // [2026-06-26] 위험(취소/환불/법적…) 카드 — 사진 배너 스타일 재사용(red 계열). 추천답장 대신 직접 답장 안내.
    const riskBlock = isRisk
      ? `<div style="display:flex;align-items:center;gap:8px;background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:11px 13px;margin-bottom:10px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
          <div style="flex:1;min-width:0;">
            <div style="font-size:12.5px;font-weight:700;color:#DC2626;">⚠️ 위험 문의 — 직접 답장하세요</div>
            <div style="font-size:11.5px;color:#991B1B;margin-top:1px;">잇비가 자동 답장하지 않아요. 인스타에서 확인 후 직접 답장해 주세요.</div>
          </div>
          <a href="${_esc(window.itdasyIgThreadLink ? window.itdasyIgThreadLink(it) : 'https://www.instagram.com/direct/inbox/')}" target="_blank" rel="noopener"
            style="flex-shrink:0;display:inline-flex;align-items:center;gap:5px;padding:9px 12px;background:#DC2626;color:#fff;text-decoration:none;border-radius:11px;font-size:12px;font-weight:700;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
            인스타 DM 열기
          </a>
        </div>` : '';
    // [2026-06-28] 변경 문의인데 옮길 예약을 특정 못함(0건/여러 건) — 원장이 직접 확인·처리.
    const reschedManualBlock = isReschedManual
      ? `<div style="display:flex;align-items:center;gap:8px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:11px 13px;margin-bottom:10px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C2410C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/></svg>
          <div style="flex:1;min-width:0;">
            <div style="font-size:12.5px;font-weight:700;color:#C2410C;">예약 변경 — 직접 확인해 주세요</div>
            <div style="font-size:11.5px;color:#9A3412;margin-top:1px;">${am.reschedule_reason === 'multiple' ? '예정된 예약이 여러 건이라 어떤 걸 옮길지 확인이 필요해요.' : '옮길 예약을 못 찾았어요. 인스타에서 확인 후 직접 처리해 주세요.'}</div>
          </div>
          <a href="${_esc(window.itdasyIgThreadLink ? window.itdasyIgThreadLink(it) : 'https://www.instagram.com/direct/inbox/')}" target="_blank" rel="noopener"
            style="flex-shrink:0;display:inline-flex;align-items:center;gap:5px;padding:9px 12px;background:#C2410C;color:#fff;text-decoration:none;border-radius:11px;font-size:12px;font-weight:700;">
            인스타 DM 열기
          </a>
        </div>` : '';
    // [2026-06-28] 지각·당일 불참 통보 — 자동답장 X, 원장 알림만. 지각(amber)/불참(red) 배지로 대응 구분.
    //   예약을 자동으로 건드리지 않음(취소·변경 아님). 가장 가까운 예정 예약 시간·시술을 함께 표시.
    const noshowBlock = isNoshow
      ? (function () {
          const late = am.noshow_kind === 'late';
          const C = late
            ? { bg: '#FFF7ED', bd: '#FED7AA', fg: '#C2410C', sub: '#9A3412', btn: '#C2410C' }
            : { bg: '#FEF2F2', bd: '#FECACA', fg: '#DC2626', sub: '#991B1B', btn: '#DC2626' };
          const head = late ? '지각 통보 — 손님이 늦어요' : '당일 취소/노쇼 — 손님이 못 와요';
          const when = [am.time_disp, am.service_name].filter(Boolean).map(function (s) { return _esc(String(s)); }).join(' · ');
          const icon = late
            ? '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'
            : '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>';
          return `<div style="display:flex;align-items:center;gap:8px;background:${C.bg};border:1px solid ${C.bd};border-radius:12px;padding:11px 13px;margin-bottom:10px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${C.fg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>
          <div style="flex:1;min-width:0;">
            <div style="font-size:12.5px;font-weight:700;color:${C.fg};">${head}</div>
            <div style="font-size:11.5px;color:${C.sub};margin-top:1px;">${when ? when + ' 예약 · ' : ''}인스타에서 확인 후 직접 답장해 주세요</div>
          </div>
          <a href="${_esc(window.itdasyIgThreadLink ? window.itdasyIgThreadLink(it) : 'https://www.instagram.com/direct/inbox/')}" target="_blank" rel="noopener"
            style="flex-shrink:0;display:inline-flex;align-items:center;gap:5px;padding:9px 12px;background:${C.btn};color:#fff;text-decoration:none;border-radius:11px;font-size:12px;font-weight:700;">
            인스타 DM 열기
          </a>
        </div>`;
        })()
      : '';
    // [2026-06-28] 취소인데 대상 예약을 특정 못함(0건/여러 건) — 원장이 직접 확인·처리.
    const cancelManualBlock = isCancelManual
      ? `<div style="display:flex;align-items:center;gap:8px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:11px 13px;margin-bottom:10px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C2410C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/><path d="m9 16 6-6M15 16l-6-6"/></svg>
          <div style="flex:1;min-width:0;">
            <div style="font-size:12.5px;font-weight:700;color:#C2410C;">예약 취소 — 직접 확인해 주세요</div>
            <div style="font-size:11.5px;color:#9A3412;margin-top:1px;">${am.cancel_reason === 'multiple' ? '예정된 예약이 여러 건이라 어떤 걸 취소할지 확인이 필요해요.' : '취소할 예약을 못 찾았어요. 인스타에서 확인 후 직접 처리해 주세요.'}</div>
          </div>
          <a href="${_esc(window.itdasyIgThreadLink ? window.itdasyIgThreadLink(it) : 'https://www.instagram.com/direct/inbox/')}" target="_blank" rel="noopener"
            style="flex-shrink:0;display:inline-flex;align-items:center;gap:5px;padding:9px 12px;background:#C2410C;color:#fff;text-decoration:none;border-radius:11px;font-size:12px;font-weight:700;">
            인스타 DM 열기
          </a>
        </div>` : '';
    return `
      <div class="dcq-item" data-id="${it.id}" data-channel="${_esc(_normChannel(it.channel))}" data-tail="${_esc(tail)}" data-sender="${_esc(it.sender_igsid || '')}" data-booking-date="${(isBooking || it.action_required === 'reschedule_action') && am.starts_at_iso ? _esc(String(am.starts_at_iso).split('T')[0]) : ''}" data-reschedule="${it.action_required === 'reschedule_action' ? '1' : ''}" data-am="${amJson}" style="position:relative;background:#fff;border:.5px solid #E5E8EB;border-radius:18px;padding:14px;margin-bottom:10px;">
        ${_channelMark(it.channel)}
        ${formAutoBadge}
        ${sendFormBadge}
        <div style="display:flex;align-items:center;gap:9px;margin-bottom:10px;">
          <div style="width:36px;height:36px;border-radius:50%;background:#F2F4F6;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#8B95A1;overflow:hidden;position:relative;">${_AVATAR_SVG}${avImg}</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:14px;font-weight:700;color:#191F28;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_esc(name)}</span>
              ${_gradeBadge(it.customer_grade)}
            </div>
            <div style="font-size:11px;color:#8B95A1;margin-top:1px;">${(it.minutes_waiting <= 0 ? '방금' : it.minutes_waiting + '분 전')} · ${_esc(_intentKo(it.intent))}</div>
            ${summary ? `<div style="font-size:11px;color:#8B95A1;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_esc(summary)}</div>` : ''}
          </div>
        </div>
        ${photoOnlyBlock}
        ${photoAttachedBlock}
        ${riskBlock}
        ${reschedManualBlock}
        ${noshowBlock}
        ${cancelManualBlock}
        ${_receivedStack(it)}
        ${_extractedChips(ex, am)}
        ${_bookingLine(am)}
        ${it.action_required === 'reschedule_action' ? _rescheduleLine(am) : ''}
        ${it.action_required === 'cancel_action' ? _cancelLine(am) : ''}
        ${_durationStepper(it)}
        ${_depositLine(am)}
        ${_confirmPreview(am)}
        ${(noDraft || am.deposit_sent) ? '' : isSetAddress ? _setAddressBlock() : `<div style="display:flex;gap:8px;align-items:flex-start;margin-top:12px;">
          <div style="width:30px;height:30px;border-radius:50%;background:#F7EFF0;color:#BC6675;flex-shrink:0;display:flex;align-items:center;justify-content:center;"><svg width="16" height="16" aria-hidden="true"><use href="#ic-bot"/></svg></div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:11px;color:#8B95A1;font-weight:600;margin-bottom:4px;">${isSendForm ? '보낼 예약 양식 (탭하면 발송)' : '잇비 추천 답장'}</div>
            <div class="dcq-draft" style="background:#F2F4F6;color:#191F28;border-radius:13px;border-top-left-radius:4px;padding:10px 13px;font-size:13.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word;">${_esc(draft)}</div>
            <textarea class="dcq-edit" rows="3" style="display:none;width:100%;margin-top:6px;padding:10px 13px;border:1px solid #E5E8EB;border-radius:13px;font-size:13.5px;line-height:1.5;background:#fff;color:#191F28;resize:vertical;box-sizing:border-box;font-family:inherit;">${_esc(draft)}</textarea>
          </div>
        </div>`}
        <div style="display:flex;gap:6px;margin-top:12px;">
          ${(!noDraft && (!isFormAuto || _rawDraft)) ? `<button class="dcq-send" data-act="${isSendForm ? 'send-form' : 'send'}" style="flex:1;padding:11px;border:none;${_mainBtnStyle(it)}color:#fff;font-weight:700;font-size:13px;border-radius:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7Z"/></svg>${_esc(_mainBtnLabel(it))}</button>` : ''}
          ${(noDraft || isSendForm || isSetAddress || am.deposit_sent || (isFormAuto && !_rawDraft)) ? '' : `<button class="dcq-edit-btn" data-act="edit" style="padding:11px 14px;border:1px solid #E5E8EB;background:#fff;color:#191F28;font-weight:600;font-size:13px;border-radius:13px;cursor:pointer;">수정</button>`}
          <button class="dcq-discard" data-act="discard" title="카드 무시 (정보 보존)" style="padding:11px 14px;border:1px solid #E5E8EB;background:#fff;color:#8B95A1;font-weight:600;font-size:13px;border-radius:13px;cursor:pointer;">무시</button>
        </div>
        ${_depositConfirmBtn(it)}
        <div style="text-align:center;margin-top:8px;">
          <button class="dcq-reset" data-act="reset" style="background:none;border:none;padding:6px 12px;font-size:11.5px;color:#C9CDD4;cursor:pointer;display:inline-flex;align-items:center;gap:4px;">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>대화 초기화
          </button>
        </div>
      </div>`;
  }

  async function _refresh() {
    const list = document.getElementById('dcqList');
    if (!list) return;
    // [2026-06-08] 수정(인라인 textarea) 중이면 폴링 재렌더 스킵 — 입력 내용/카드 안 닫히게.
    const editing = Array.from(list.querySelectorAll('.dcq-edit')).some(t => t.style.display !== 'none')
      || !!list.querySelector('.dcq-cpv-ta[data-touched="1"]')  // [#31] 확정 멘트 수정 중이면 스킵
      || !!list.querySelector('.dcq-dur[data-touched="1"]')  // 스테퍼 조정 중이면 재렌더 스킵
      || Array.from(list.querySelectorAll('.dcq-set-address')).some(i => (i.value || '').trim() || i === document.activeElement);  // 주소 입력 중이면 스킵
    if (editing) return;
    // [Task 3] 빈 화면이면 로딩 표시
    if (!list.children.length) {
      list.innerHTML = '<div style="display:flex;justify-content:center;padding:40px 20px;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:dcqSpin .8s linear infinite" aria-label="불러오는 중"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg></div>';
    }
    try {
      _lastItems = await _fetch('GET', '/dm-confirm-queue');
      const cnt = document.getElementById('dcqCount');
      if (cnt) cnt.textContent = _lastItems.length + '건';
      _applyAndRender();
    } catch (e) {
      list.innerHTML = `<div style="text-align:center;color:var(--danger);padding:20px;font-size:12px;">불러오기 실패: ${_esc(e.message)}</div>`;
    }
  }

  // [2026-06-16] 탭 카운트 갱신 — 전체 items 기준(필터 무관).
  function _updateTabCounts(all) {
    const counts = { all: all.length, instagram: 0, kakao: 0, naver: 0 };
    all.forEach(it => { const c = _normChannel(it.channel); if (counts[c] != null) counts[c] += 1; });
    document.querySelectorAll('#dcqTabs .dcq-tab').forEach(t => {
      const f = t.getAttribute('data-filter');
      t.textContent = (_CH_LABEL[f] || f) + ' ' + (counts[f] || 0);
      t.classList.toggle('on', f === _activeFilter);
    });
  }

  // [2026-06-16] 캐시(_lastItems) → 활성 필터 적용 후 렌더 + 핸들러 바인딩(동작 보존).
  function _applyAndRender() {
    const list = document.getElementById('dcqList');
    if (!list) return;
    const all = _lastItems || [];
    _updateTabCounts(all);
    if (!all.length) {
      list.innerHTML = `<div style="text-align:center;color:var(--text-subtle);padding:40px 20px;font-size:13px;line-height:1.6;">답장이 필요한 메시지가 없어요 ✨<br>잇비가 잘 챙기고 있어요.</div>`;
      return;
    }
    const items = _activeFilter === 'all' ? all : all.filter(it => _normChannel(it.channel) === _activeFilter);
    if (!items.length) {
      list.innerHTML = `<div style="text-align:center;color:#8B95A1;padding:40px 20px;font-size:13px;line-height:1.6;">${_esc(_CH_LABEL[_activeFilter] || '')} 채널 메시지가 없어요</div>`;
      return;
    }
    list.innerHTML = items.map(_cardHtml).join('');
    // 수정 버튼 → 인라인 textarea 노출
    list.querySelectorAll('.dcq-edit-btn').forEach(b => b.addEventListener('click', () => {
      const card = b.closest('[data-id]'); if (!card) return;
      const ta = card.querySelector('.dcq-edit');
      const draft = card.querySelector('.dcq-draft');
      if (ta) { ta.style.display = 'block'; ta.focus(); }
      if (draft) draft.style.display = 'none';
      b.style.display = 'none';
    }));
    // 전송 → 수정 textarea 가 열려있고 내용 있으면 send_edit, 아니면 send(액션 실행)
    list.querySelectorAll('.dcq-send').forEach(b => b.addEventListener('click', () => {
      const card = b.closest('[data-id]'); if (!card) return;
      const am = (() => { try { return JSON.parse(card.dataset.am || '{}'); } catch(_e){ return {}; } })();
      // [A] 양식 보내기 카드 → /send-form (발송은 원장 탭에서)
      if (b.dataset.act === 'send-form') { _doAction(b, 'send-form'); return; }
      // [F2] deposit_sent 단계 메인 버튼 → confirm-deposit 액션
      if (am.deposit_sent) { _doAction(b, 'confirm-deposit'); return; }
      const ta = card.querySelector('.dcq-edit');
      const edited = (ta && ta.style.display !== 'none') ? (ta.value || '').trim() : '';
      if (edited) _doAction(b, 'send_edit', edited);
      else _doAction(b, 'send');
    }));
    // [2026-07-14 #31] 확정 멘트 수정 — 미리보기 → textarea 전환 (touched 마킹으로 폴링 재렌더 방지)
    list.querySelectorAll('.dcq-cpv-edit').forEach(b => b.addEventListener('click', () => {
      const box = b.closest('div[style*="FAFBFC"]') || b.parentElement.parentElement;
      const txt = box.querySelector('.dcq-cpv-text');
      const ta = box.querySelector('.dcq-cpv-ta');
      if (!ta) return;
      ta.style.display = 'block'; ta.dataset.touched = '1'; ta.focus();
      if (txt) txt.style.display = 'none';
      b.style.display = 'none';
    }));
    // [2026-06-24 2a] 시술 시간 스테퍼 ±30분. touched 마킹 → 폴링 재렌더가 값 안 덮게.
    list.querySelectorAll('.dcq-dur-btn').forEach(b => b.addEventListener('click', () => {
      const wrap = b.closest('.dcq-dur-wrap'); if (!wrap) return;
      const span = wrap.querySelector('.dcq-dur'); if (!span) return;
      const step = parseInt(b.dataset.step, 10) || 0;
      let v = (parseInt(span.dataset.dur, 10) || 60) + step;
      v = Math.max(30, Math.min(480, v));
      span.dataset.dur = v; span.dataset.touched = '1';
      span.textContent = _fmtDur(v);
      const _card = b.closest('.dcq-item');
      const _warn = _card && _card.querySelector('.dcq-dur-warn');
      if (_warn) {
        const _rw = parseInt(span.dataset.runway, 10);
        _warn.style.display = (Number.isFinite(_rw) && _rw > 0 && v > _rw) ? 'flex' : 'none';
      }
    }));
    // [2026-07-02] 겹침 경고의 '캘린더 보기' — 탭만 전환(DM 안 닫힘), 확인 후 돌아오면 카드 유지
    list.querySelectorAll('.dcq-cal-jump').forEach(a => a.addEventListener('click', () => _gotoCalendar(a.dataset.ymd || '')));
    list.querySelectorAll('.dcq-discard').forEach(b => b.addEventListener('click', () => _doAction(b, 'discard')));
    list.querySelectorAll('.dcq-reset').forEach(b => b.addEventListener('click', () => _doAction(b, 'reset')));
    list.querySelectorAll('.dcq-confirm-deposit').forEach(b => b.addEventListener('click', () => _doAction(b, 'confirm-deposit')));
  }

  async function _doAction(btn, action, editedText) {
    const card = btn.closest('[data-id]');
    if (!card) return;
    const id = card.dataset.id;
    const tail = card.dataset.tail || '';
    const sender = card.dataset.sender || '';

    btn.disabled = true; btn.style.opacity = '0.6';
    try {
      let r;
      if (action === 'send') {
        const _body = { selected_index: 0 };
        const _durEl = card.querySelector('.dcq-dur');  // [2a] 원장 조정 시술시간(분)
        if (_durEl && _durEl.dataset.dur) {
          const _d = parseInt(_durEl.dataset.dur, 10);
          if (_d > 0) _body.duration_min = _d;
        }
        // [2026-06-24] 주소 미설정 카드 — 입력한 주소를 함께 보냄(설정 저장 + 손님 안내)
        const _addrEl = card.querySelector('.dcq-set-address');
        if (_addrEl) {
          const _addr = (_addrEl.value || '').trim();
          if (!_addr) {
            if (window.showToast) window.showToast('샵 주소를 입력해 주세요');
            _addrEl.focus();
            btn.disabled = false; btn.style.opacity = '1';
            return;
          }
          _body.address = _addr;
        }
        r = await _fetch('POST', `/dm-confirm-queue/${id}/send`, _body);
      } else if (action === 'send-form') {
        r = await _fetch('POST', `/dm-confirm-queue/${id}/send-form`);
        if (window.showToast) window.showToast(r && r.ok ? '예약 양식을 보냈어요 ✓' : ((r && r.message) || '양식 발송 실패'));
        if (!(r && r.ok)) { btn.disabled = false; btn.style.opacity = '1'; return; }
      } else if (action === 'send_edit') {
        if (!editedText) {
          if (window.showToast) window.showToast('수정 내용이 비어있어요');
          btn.disabled = false; btn.style.opacity = '1';
          return;
        }
        r = await _fetch('POST', `/dm-confirm-queue/${id}/send_edit`, { edited_reply: editedText });
      } else if (action === 'confirm-deposit') {
        // [2026-06-24] 입금 확인 → 예약 확정 시 스테퍼 시술시간(분) 같이 전송(ends_at 보정).
        const _cbody = {};
        const _durEl2 = card.querySelector('.dcq-dur');
        if (_durEl2 && _durEl2.dataset.dur) {
          const _d2 = parseInt(_durEl2.dataset.dur, 10);
          if (_d2 > 0) _cbody.duration_min = _d2;
        }
        // [2026-07-14 #31] 확정 멘트를 수정했으면(textarea 열림 + 내용 있음) 그 문구로 발송.
        const _cpvTa = card.querySelector('.dcq-cpv-ta');
        if (_cpvTa && _cpvTa.style.display !== 'none') {
          const _ftxt = (_cpvTa.value || '').trim();
          if (_ftxt) _cbody.final_text = _ftxt;
        }
        r = await _fetch('POST', `/dm-confirm-queue/${id}/confirm-deposit`, _cbody);
        if (window.showToast) window.showToast(r.ok ? '캘린더 추가 + 고객 등록했어요 ✓' : (r.message || '확정 실패'));
      } else if (action === 'reset') {
        const ok = await window.nativeConfirm('대화 초기화', '이 손님의 대화를 초기화할까요?\n성함·연락처·예약 정보가 모두 사라져요.').catch(() => false);
        if (!ok) { btn.disabled = false; btn.style.opacity = '1'; return; }
        // [B5] 카드 있을 때: discard?reset=true / 카드 없을 때(id=0): reset-conversation
        if (id && id !== '0') {
          r = await _fetch('POST', `/dm-confirm-queue/${id}/discard?reset=true`);
        } else {
          r = await _fetch('POST', '/dm-confirm-queue/reset-conversation', { sender_igsid: sender });
        }
        if (window.showToast) window.showToast('대화가 초기화됐어요');
      } else {
        r = await _fetch('POST', `/dm-confirm-queue/${id}/discard`);
      }
      // send / send_edit 성공 시 → 예약 캐시 무효화 + 홈/벨 갱신 + Undo 토스트
      // (app-booking-api.js 의 _invalidateCache 가 itdasy:data-changed 리스너로 발동)
      const isApproveSend = (action === 'send' || action === 'send_edit');
      const undoLogId = r.log_id || r.action_log_id || null;
      // [F3] 전송 후 체크 토스트 — 밋밋한 "발송 완료" 대신 "전송했어요 ✓"
      const bookingYmd = card.dataset.bookingDate || '';
      const isReschedule = card.dataset.reschedule === '1';  // [2026-06-28] 예약 변경 확정
      const isBookingCreated = isApproveSend && (r.booking_id || (action === 'send' && bookingYmd));
      if (isReschedule && window.showToast) {
        try { window.showToast('예약 옮겼어요 ✓ · 캘린더에서 보기 →', { onClick: () => _gotoCalendar(bookingYmd) }); }
        catch (_t) { window.showToast('예약 옮겼어요 ✓'); }
      } else if (isBookingCreated && window.showToast) {
        try { window.showToast('전송했어요 ✓ · 캘린더에서 보기 →', { onClick: () => _gotoCalendar(bookingYmd) }); }
        catch (_t) { if (window.showToast) window.showToast('전송했어요 ✓'); }
      } else if (isApproveSend && window.showToast) {
        window.showToast('전송했어요 ✓');
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

      // [2026-06-08] 전송·예약확정·X(discard) 전부 — 홈 '고객 메시지' 카드 제거(전체 sender_igsid + tail).
      try { window.dispatchEvent(new CustomEvent('itdasy:dm-replied', { detail: { sender_igsid: sender, tail } })); } catch (_e2) { /* ignore */ }

      // 카드 슬라이드 아웃 + 남은 0건이면 시트 자동 닫기
      card.style.transition = 'all 0.25s ease-out';
      card.style.opacity = '0';
      card.style.transform = 'translateX(40px)';
      setTimeout(() => {
        card.remove();
        refreshBadge();
        const _list = document.getElementById('dcqList');
        const _remaining = _list ? _list.querySelectorAll('.dcq-item').length : 0;
        const _cnt = document.getElementById('dcqCount');
        if (_cnt) _cnt.textContent = _remaining + '건';
        if (_remaining === 0) {
          // 마지막 카드 처리 — 토스트 보이고 ~500ms 후 시트 닫기
          setTimeout(() => { try { close(); } catch (_c) { /* ignore */ } }, 500);
        }
      }, 250);
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

  // [2026-06-08] 특정 손님 카드로 진입 — 홈 고객메시지 / 옛 스레드 진입점 통합.
  //   open() 먼저 → 스켈레톤 즉시 표시. 카드가 이미 큐에 있으면 draft 재생성 스킵.
  async function openForSender(sender) {
    if (!sender) return open();
    // 1. 화면 먼저 열기 (스켈레톤/기존 카드 즉시 표시)
    await open();
    // 2. 카드가 이미 리스트에 있으면 draft 호출 스킵
    const _list = document.getElementById('dcqList');
    const _tail = String(sender).slice(-4);
    let _existing = null;
    try { _existing = _list && _list.querySelector(`[data-sender="${(window.CSS && CSS.escape) ? CSS.escape(sender) : sender}"]`); } catch (_e) { /* ignore */ }
    if (!_existing) _existing = _list && _list.querySelector(`[data-tail="${_tail}"]`);
    if (!_existing) {
      // 카드 없을 때만 백그라운드 draft 생성 후 배지·리스트 갱신
      const _h = window.authHeader ? window.authHeader() : {};
      _h['Content-Type'] = 'application/json';
      apiFetch(`/instagram/dm-reply/conversations/${encodeURIComponent(sender)}/draft`, { method: 'POST', headers: _h })
        .then(() => { refreshBadge(); return _refresh(); })
        .catch(() => {});
    }
    // 3. 스크롤·하이라이트 (기존 그대로)
    setTimeout(() => {
      const list = document.getElementById('dcqList');
      if (!list) return;
      const tail = String(sender).slice(-4);
      let el = null;
      try { el = list.querySelector(`[data-sender="${(window.CSS && CSS.escape) ? CSS.escape(sender) : sender}"]`); } catch (_e) { /* ignore */ }
      if (!el) el = list.querySelector(`[data-tail="${tail}"]`);
      if (!el) return;
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_e) { /* ignore */ }
      try {
        el.style.transition = 'box-shadow .3s';
        el.style.boxShadow = '0 0 0 2px #BC6675';
        setTimeout(() => { el.style.boxShadow = ''; }, 1600);
      } catch (_e) { /* ignore */ }
    }, 400);
  }

  window.openDMConfirmQueue = open;
  window.closeDMConfirmQueue = close;
  window.refreshDMQueueBadge = refreshBadge;
  window.openDMCardForSender = openForSender;
})();
