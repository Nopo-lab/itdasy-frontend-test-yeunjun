/* Phase 9 P5 — booking reminder controls */
(function () {
  'use strict';

  const KEY = 'itdasy_reminder_settings_v1';

  function _settings() {
    try {
      return { enabled: true, h24: true, h2: false, channel: 'push', ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    } catch (_) {
      return { enabled: true, h24: true, h2: false, channel: 'push' };
    }
  }

  function _saveSettings(v) {
    localStorage.setItem(KEY, JSON.stringify(v));
  }

  function _toast(msg) {
    if (window.showToast) window.showToast(msg);
  }

  function _ensure() {
    let el = document.getElementById('reminderSheet');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'reminderSheet';
    el.className = 'p9-sheet';
    el.style.display = 'none';
    el.innerHTML = `
      <div class="p9-sheet__body" role="dialog" aria-modal="true">
        <div class="p9-sheet__head">
          <div class="p9-sheet__title">예약 리마인더</div>
          <button type="button" class="p9-sheet__close" data-rm-close aria-label="닫기">x</button>
        </div>
        <label class="p9-sheet__card"><input type="checkbox" id="rmEnabled"> 자동 알림 켜기</label>
        <label class="p9-sheet__card"><input type="checkbox" id="rm24"> 예약 24시간 전</label>
        <label class="p9-sheet__card"><input type="checkbox" id="rm2"> 예약 2시간 전</label>
        <label class="p9-sheet__field">알림 방식
          <select id="rmChannel">
            <option value="push">푸시</option>
            <option value="sms">SMS 초안</option>
            <option value="dm">DM 초안</option>
          </select>
        </label>
        <div class="p9-sheet__row">
          <button type="button" class="p9-sheet__btn" data-rm-save>저장</button>
          <button type="button" class="p9-sheet__ghost" data-rm-send>오늘 예약 확인 보내기</button>
        </div>
        <div class="p9-sheet__meta">서버 스케줄러가 5분마다 자동으로 확인 메시지를 보내고 있어요. "오늘 예약 확인 보내기"는 즉시 수동 발송입니다.</div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', _onClick);
    return el;
  }

  function _hydrate() {
    const s = _settings();
    document.getElementById('rmEnabled').checked = !!s.enabled;
    document.getElementById('rm24').checked = !!s.h24;
    document.getElementById('rm2').checked = !!s.h2;
    document.getElementById('rmChannel').value = s.channel || 'push';
  }

  function _read() {
    return {
      enabled: document.getElementById('rmEnabled').checked,
      h24: document.getElementById('rm24').checked,
      h2: document.getElementById('rm2').checked,
      channel: document.getElementById('rmChannel').value || 'push',
      saved_at: new Date().toISOString(),
    };
  }

  async function _sendConfirmations() {
    try {
      const res = await fetch(window.API + '/bookings/auto-send-confirmations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...window.authHeader() },
        body: JSON.stringify({ source: 'phase9-reminder' }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      _toast('예약 확인 요청 완료');
    } catch (e) {
      console.warn('[reminder] send failed:', e);
      _toast(window.standardError ? window.standardError(e) : '전송 실패');
    }
  }

  function _onClick(e) {
    const el = _ensure();
    if (e.target === el || e.target.closest('[data-rm-close]')) return closeReminderSettings();
    if (e.target.closest('[data-rm-save]')) {
      _saveSettings(_read());
      _toast('리마인더 저장 완료');
    }
    if (e.target.closest('[data-rm-send]')) _sendConfirmations();
  }

  function openReminderSettings() {
    const el = _ensure();
    _hydrate();
    el.style.display = 'flex';
  }

  function closeReminderSettings() {
    const el = document.getElementById('reminderSheet');
    if (el) el.style.display = 'none';
  }

  window.openReminderSettings = openReminderSettings;
  window.closeReminderSettings = closeReminderSettings;
})();
