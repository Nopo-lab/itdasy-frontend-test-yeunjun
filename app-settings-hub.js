/* 설정 허브 — 샵정보/직원/네이버연동/백업/실패알림/앱설정 통합 (2026-04-30)
   사용:
     window.openSettingsHub()  — 카드 list 시트 열기
*/
(function () {
  'use strict';

  function _ensureSheet() {
    let sheet = document.getElementById('settingsHubSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'settingsHubSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9985;background:rgba(0,0,0,0.5);display:none;align-items:flex-end;justify-content:center;';
    const _ic = (id, size = 18) => `<svg width="${size}" height="${size}" aria-hidden="true"><use href="#${id}"/></svg>`;
    sheet.innerHTML = `
      <div id="shCard" style="width:100%;max-width:560px;background:#fff;border-radius:20px 20px 0 0;max-height:92vh;overflow-y:auto;padding:18px 18px max(18px,env(safe-area-inset-bottom));">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <span style="display:inline-flex;align-items:center;color:#555;">${_ic('ic-settings', 20)}</span>
          <strong style="font-size:18px;">설정 · 연동</strong>
          <button id="shClose" aria-label="닫기" style="margin-left:auto;background:none;border:none;cursor:pointer;color:#888;display:inline-flex;align-items:center;">${_ic('ic-x', 18)}</button>
        </div>

        <div style="font-size:11px;font-weight:800;color:#999;letter-spacing:1px;margin:6px 4px 6px;">샵 운영</div>
        <button class="sh-row" data-act="shopinfo">
          <span class="sh-ic">${_ic('ic-store')}</span>
          <span class="sh-lbl">샵 정보 · 직원 관리</span>
          <span class="sh-chev">${_ic('ic-chevron-right', 14)}</span>
        </button>
        <button class="sh-row" data-act="naver">
          <span class="sh-ic">${_ic('ic-link')}</span>
          <span class="sh-lbl">네이버 예약 연동</span>
          <span class="sh-badge">soon</span>
        </button>

        <div style="font-size:11px;font-weight:800;color:#999;letter-spacing:1px;margin:14px 4px 6px;">데이터</div>
        <button class="sh-row" data-act="backup">
          <span class="sh-ic">${_ic('ic-download')}</span>
          <span class="sh-lbl">백업 · 내보내기</span>
          <span class="sh-chev">${_ic('ic-chevron-right', 14)}</span>
        </button>
        <button class="sh-row" data-act="undo">
          <span class="sh-ic">${_ic('ic-rotate-ccw')}</span>
          <span class="sh-lbl">챗봇 액션 되돌리기 (최근 30일)</span>
          <span class="sh-chev">${_ic('ic-chevron-right', 14)}</span>
        </button>
        <button class="sh-row" data-act="failures">
          <span class="sh-ic">${_ic('ic-bell')}</span>
          <span class="sh-lbl">자동화 실패 알림함</span>
          <span class="sh-badge">soon</span>
        </button>

        <div style="font-size:11px;font-weight:800;color:#999;letter-spacing:1px;margin:14px 4px 6px;">앱 설정</div>
        <button class="sh-row" data-act="haptic">
          <span class="sh-ic">${_ic('ic-wifi-off')}</span>
          <span class="sh-lbl">진동 피드백</span>
          <span id="shHapticStatus" class="sh-status">켜짐</span>
        </button>
        <button class="sh-row" data-act="theme">
          <span class="sh-ic">${_ic('ic-moon')}</span>
          <span class="sh-lbl">화면 테마</span>
          <span id="shThemeLabel" class="sh-status">라이트</span>
        </button>
        <button class="sh-row" data-act="font">
          <span class="sh-ic">${_ic('ic-pen-line')}</span>
          <span class="sh-lbl">글씨 크기</span>
          <span id="shFontLabel" class="sh-status">보통</span>
        </button>

        <div style="font-size:11px;font-weight:800;color:#999;letter-spacing:1px;margin:14px 4px 6px;">계정</div>
        <button class="sh-row" data-act="logout" style="color:#dc3545;">
          <span class="sh-ic">${_ic('ic-arrow-left')}</span>
          <span class="sh-lbl">로그아웃</span>
          <span class="sh-chev">${_ic('ic-chevron-right', 14)}</span>
        </button>
      </div>
      <style>
        .sh-row {
          width: 100%; display: flex; align-items: center; gap: 10px;
          padding: 13px 14px; border: none; background: #FAFAFA;
          border-radius: 12px; margin-bottom: 6px; cursor: pointer;
          font-size: 14px; color: #222; text-align: left;
          transition: background 0.15s;
        }
        .sh-row:hover { background: #F0F0F0; }
        .sh-ic { display:inline-flex; align-items:center; flex-shrink: 0; color: #555; }
        .sh-lbl { flex: 1; font-weight: 600; }
        .sh-chev { color: #aaa; display:inline-flex; align-items:center; }
        .sh-badge {
          font-size: 10px; font-weight: 700;
          background: rgba(0,0,0,0.06); color: #888;
          padding: 2px 8px; border-radius: 99px;
        }
        .sh-status {
          font-size: 12px; font-weight: 700; color: var(--accent, #F18091);
        }
      </style>
    `;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
    sheet.querySelector('#shClose').addEventListener('click', close);
    sheet.querySelectorAll('.sh-row').forEach(b => {
      b.addEventListener('click', () => _route(b.dataset.act));
    });
    return sheet;
  }

  function _route(act) {
    if (act === 'shopinfo') { close(); setTimeout(() => window.openShopSettings && window.openShopSettings(), 200); return; }
    if (act === 'naver')    { close(); setTimeout(() => window.openNaverLink && window.openNaverLink(), 200); return; }
    if (act === 'backup')   { close(); setTimeout(() => window.openBackupScreen && window.openBackupScreen(), 200); return; }
    if (act === 'undo')     { close(); setTimeout(() => window.openUndoHistory && window.openUndoHistory(), 200); return; }
    if (act === 'failures') { close(); setTimeout(() => window.openFailuresHub && window.openFailuresHub(), 200); return; }
    if (act === 'haptic') {
      try { window.toggleHapticSetting && window.toggleHapticSetting(); window.updateHapticToggleLabel && window.updateHapticToggleLabel(); } catch (_e) { void _e; }
      _refreshLabels();
      return;
    }
    if (act === 'theme') {
      try { window.cycleTheme && window.cycleTheme(); } catch (_e) { void _e; }
      _refreshLabels();
      return;
    }
    if (act === 'font') {
      try { window.cycleFontSize && window.cycleFontSize(); } catch (_e) { void _e; }
      _refreshLabels();
      return;
    }
    if (act === 'logout') {
      if (!confirm('로그아웃 하시겠어요?')) return;
      try {
        if (typeof window.setToken === 'function') window.setToken('');
      } catch (_e) { void _e; }
      location.reload();
      return;
    }
  }

  function _refreshLabels() {
    const sheet = document.getElementById('settingsHubSheet');
    if (!sheet) return;
    try {
      const hap = sheet.querySelector('#shHapticStatus');
      const headerHap = document.getElementById('hapticToggleStatus');
      if (hap && headerHap) hap.textContent = headerHap.textContent || '';
      const th = sheet.querySelector('#shThemeLabel');
      const headerTh = document.getElementById('themeLabel');
      if (th && headerTh) th.textContent = headerTh.textContent || '';
      const fs = sheet.querySelector('#shFontLabel');
      const headerFs = document.getElementById('fontSizeLabel');
      if (fs && headerFs) fs.textContent = headerFs.textContent || '';
    } catch (_e) { void _e; }
  }

  function open() {
    const sheet = _ensureSheet();
    const card = sheet.querySelector('#shCard');
    if (window.SheetAnim) window.SheetAnim.open(sheet, card);
    else sheet.style.display = 'flex';
    _refreshLabels();
  }
  function close() {
    const sheet = document.getElementById('settingsHubSheet');
    if (!sheet) return;
    const card = sheet.querySelector('#shCard');
    if (window.SheetAnim) window.SheetAnim.close(sheet, card);
    else sheet.style.display = 'none';
  }

  window.openSettingsHub = open;
  window.closeSettingsHub = close;
})();
