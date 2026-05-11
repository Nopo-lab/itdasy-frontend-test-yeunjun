/* 설정 허브 — 샵정보/네이버/백업/undo/실패알림 + 인라인 진동·테마·글씨 + 로그아웃 (v3 디자인 · 2026-04-30)
   사용:
     window.openSettingsHub()  — v3 시트 열기
     window.closeSettingsHub() — 닫기
   진입 시그니처 / _route(act) 9개 매핑 / _refreshLabels() 외부 anchor 동기화 모두 보존.
*/
(function () {
  'use strict';

  // ─── XSS 방어 ────────────────────────────────────────────
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // ─── 아이콘 헬퍼 (sprite use) ────────────────────────────
  function _ic(id, size) {
    const sz = size || 16;
    // Phase1: Phosphor 매핑
    const phMap = {
      'ic-store': 'ph-storefront',
      'ic-link': 'ph-link',
      'ic-download': 'ph-cloud-arrow-down',
      'ic-rotate-ccw': 'ph-arrow-counter-clockwise',
      'ic-bell': 'ph-bell-ringing',
      'ic-arrow-left': 'ph-sign-out',
    };
    const ph = phMap[id];
    if (ph) return `<i class="ph-duotone ${_esc(ph)}" style="font-size:${sz}px;" aria-hidden="true"></i>`;
    return `<svg width="${sz}" height="${sz}" aria-hidden="true"><use href="#${_esc(id)}"/></svg>`;
  }

  // ─── 현재 상태 읽기 ──────────────────────────────────────
  function _curTheme() {
    const v = (function () { try { return localStorage.getItem('itdasy_theme'); } catch (_e) { void _e; return null; } })();
    if (v === 'light' || v === 'dark') return v;
    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    } catch (_e) { void _e; }
    return 'light';
  }
  function _curFS() {
    try { return localStorage.getItem('itdasy_fontsize') || 'normal'; } catch (_e) { void _e; return 'normal'; }
  }
  function _hapticOn() {
    try { return localStorage.getItem('itdasy_haptic_enabled') !== 'off'; } catch (_e) { void _e; return true; }
  }

  // ─── 시트 마크업 (조각별) ────────────────────────────────
  function _headHTML() {
    return `
      <div class="ms-sheet__handle"></div>
      <div class="ms-sheet__head">
        <div class="ms-sheet__head-left">
          <div class="ms-sheet__title">설정 · 연동</div>
          <div class="ms-sheet__sub">샵 정보 · 외부 연동 · 백업</div>
        </div>
        <button type="button" class="ms-sheet__close" id="shClose" aria-label="닫기">닫기</button>
      </div>
    `;
  }
  // [QA #9] 현재 로그인 provider/email 정보 — localStorage 기반.
  function _accountInfo() {
    let prov = '';
    let email = '';
    try { prov = localStorage.getItem('user_oauth_provider') || ''; } catch (_e) { void _e; }
    try { email = localStorage.getItem('last_login_email') || ''; } catch (_e) { void _e; }
    const provMap = { google: 'Google', kakao: '카카오', naver: '네이버', email: '이메일' };
    const provLabel = provMap[String(prov).toLowerCase()] || (prov ? prov : '이메일');
    return { provLabel, email };
  }
  function _accountHTML() {
    const { provLabel, email } = _accountInfo();
    const right = email ? `${_esc(provLabel)} · ${_esc(email)}` : _esc(provLabel);
    return `
      <div class="ms-section__title" style="margin-top:4px;">계정</div>
      <div class="ms-sh" id="shAccount">
        <div class="ms-sh__row" style="cursor:default;">
          <div class="ms-sh__icon"><span class="ic-box ic-box--sm ic-box--blue">${_ic('ic-store', 14)}</span></div>
          <div class="ms-sh__info">
            <div class="ms-sh__name">현재 로그인</div>
            <div class="ms-sh__meta">${right}</div>
          </div>
        </div>
      </div>
    `;
  }
  function _listHTML() {
    return `
      <div class="ms-sh" id="shList">
        ${_rowHTML('shopinfo', 'ic-store',      '샵 정보 · 직원',     '영업시간 · 시술 메뉴 · 직원', { boxColor: 'blue' })}
        ${_rowHTML('naver',    'ic-link',       '네이버 예약 연동',   '연결 상태 확인', { metaClass: 'is-ok', boxColor: 'teal' })}
        ${_rowHTML('backup',   'ic-download',   '백업 · 내보내기',    '자동 백업 · 데이터 내보내기', { boxColor: 'purple' })}
        ${_rowHTML('undo',     'ic-rotate-ccw', '챗봇 액션 되돌리기', '최근 30일 이력', { boxColor: 'amber' })}
        ${_rowHTML('failures', 'ic-bell',       '자동화 실패 알림함', '실패 로그 · 재시도', { boxColor: 'coral' })}
      </div>
    `;
  }
  function _inlineHTML() {
    return `
      <div class="ms-section__title" style="margin-top:14px;">앱 설정</div>
      <div class="ms-ic" id="shInline">
        <div class="ms-ic__row">
          <div class="ms-ic__label">진동 피드백</div>
          <button type="button" class="ms-toggle ${_hapticOn() ? 'is-on' : ''}" id="shHaptic" aria-label="진동 피드백 토글">
            <div class="ms-toggle__track"></div>
            <div class="ms-toggle__knob"></div>
          </button>
        </div>
        <div class="ms-ic__row">
          <div class="ms-ic__label">화면 테마</div>
          <div class="ms-ic__seg" id="shThemeSeg" role="group" aria-label="화면 테마">
            <button type="button" class="ms-ic__seg-btn" data-theme="light">라이트</button>
            <button type="button" class="ms-ic__seg-btn" data-theme="dark">다크</button>
          </div>
        </div>
        <div class="ms-ic__row">
          <div class="ms-ic__label">글씨 크기</div>
          <div class="ms-ic__seg" id="shFontSeg" role="group" aria-label="글씨 크기">
            <button type="button" class="ms-ic__seg-btn" data-fs="normal">보통</button>
            <button type="button" class="ms-ic__seg-btn" data-fs="large">크게</button>
            <button type="button" class="ms-ic__seg-btn" data-fs="xl">아주 크게</button>
          </div>
        </div>
      </div>
    `;
  }
  function _logoutHTML() {
    return `
      <div class="ms-sh" style="margin-top:14px;">
        <button type="button" class="ms-sh__row" data-act="logout">
          <div class="ms-sh__icon" style="color:var(--danger);"><span class="ic-box ic-box--sm ic-box--red">${_ic('ic-arrow-left', 14)}</span></div>
          <div class="ms-sh__info">
            <div class="ms-sh__name" style="color:var(--danger);">로그아웃</div>
            <div class="ms-sh__meta">현재 기기에서 로그아웃</div>
          </div>
        </button>
      </div>
    `;
  }
  function _buildSheet() {
    const sheet = document.createElement('div');
    sheet.id = 'settingsHubSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9985;display:none;';
    sheet.innerHTML = `
      <div class="ms-sheet__overlay" id="shOverlay" style="position:fixed;inset:0;"></div>
      <div class="ms-sheet" id="shCard" style="position:fixed;left:0;right:0;bottom:0;max-width:560px;margin:0 auto;">
        ${_headHTML()}
        <div class="ms-sheet__body">
          ${_accountHTML()}
          ${_listHTML()}
          ${_inlineHTML()}
          ${_logoutHTML()}
        </div>
      </div>
    `;
    return sheet;
  }

  function _rowHTML(act, icon, name, meta, opt) {
    const o = opt || {};
    const metaCls = o.metaClass ? ` ${_esc(o.metaClass)}` : '';
    const iconHtml = o.boxColor
      ? `<div class="ms-sh__icon"><span class="ic-box ic-box--sm ic-box--${_esc(o.boxColor)}">${_ic(icon, 14)}</span></div>`
      : `<div class="ms-sh__icon">${_ic(icon, 16)}</div>`;
    return `
      <button type="button" class="ms-sh__row" data-act="${_esc(act)}">
        ${iconHtml}
        <div class="ms-sh__info">
          <div class="ms-sh__name">${_esc(name)}</div>
          <div class="ms-sh__meta${metaCls}">${_esc(meta)}</div>
        </div>
        <div class="ms-sh__chev">${_ic('ic-chevron-right', 14)}</div>
      </button>
    `;
  }

  // ─── 시트 보장 + 이벤트 바인딩 ──────────────────────────
  function _ensureSheet() {
    let sheet = document.getElementById('settingsHubSheet');
    if (sheet) return sheet;
    sheet = _buildSheet();
    document.body.appendChild(sheet);

    // 오버레이 / 닫기
    sheet.querySelector('#shOverlay')?.addEventListener('click', close);
    sheet.querySelector('#shClose')?.addEventListener('click', () => {
      try { window.hapticLight && window.hapticLight(); } catch (_e) { void _e; }
      close();
    });

    // 일반 행
    sheet.querySelectorAll('.ms-sh__row[data-act]').forEach((b) => {
      b.addEventListener('click', () => {
        try { window.hapticLight && window.hapticLight(); } catch (_e) { void _e; }
        _route(b.dataset.act);
      });
    });

    // 진동 토글
    sheet.querySelector('#shHaptic')?.addEventListener('click', () => {
      try { window.toggleHapticSetting && window.toggleHapticSetting(); } catch (_e) { void _e; }
      try { window.updateHapticToggleLabel && window.updateHapticToggleLabel(); } catch (_e) { void _e; }
      _refreshLabels();
    });

    // 테마 segment
    sheet.querySelectorAll('#shThemeSeg .ms-ic__seg-btn').forEach((b) => {
      b.addEventListener('click', () => _setTheme(b.dataset.theme));
    });

    // 글씨 크기 segment
    sheet.querySelectorAll('#shFontSeg .ms-ic__seg-btn').forEach((b) => {
      b.addEventListener('click', () => _setFS(b.dataset.fs));
    });

    return sheet;
  }

  // ─── 테마/폰트 직접 set (cycle 반복으로 도달) ───────────
  function _setTheme(mode) {
    if (mode !== 'light' && mode !== 'dark') return;
    if (_curTheme() === mode) { _refreshLabels(); return; }
    try { window.cycleTheme && window.cycleTheme(); } catch (_e) { void _e; }
    _refreshLabels();
  }
  function _setFS(mode) {
    const order = ['normal', 'large', 'xl'];
    if (order.indexOf(mode) < 0) return;
    let guard = 0;
    while (_curFS() !== mode && guard < 4) {
      try { window.cycleFontSize && window.cycleFontSize(); } catch (_e) { void _e; break; }
      guard += 1;
    }
    _refreshLabels();
  }

  // ─── 9개 라우팅 (변동 X) ────────────────────────────────
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
      try { if (typeof window.setToken === 'function') window.setToken(''); } catch (_e) { void _e; }
      location.reload();
      return;
    }
  }

  // ─── 라벨/상태 동기화 ────────────────────────────────────
  function _refreshLabels() {
    const sheet = document.getElementById('settingsHubSheet');
    if (!sheet) return;
    try {
      // 외부 anchor (다른 화면에서 참조) — 기존 동작 보존
      const headerHap = document.getElementById('hapticToggleStatus');
      const headerTh  = document.getElementById('themeLabel');
      const headerFs  = document.getElementById('fontSizeLabel');
      void headerHap; void headerTh; void headerFs; // 외부에서 갱신, 여기선 read-only

      // 시트 안 진동 토글
      const hapBtn = sheet.querySelector('#shHaptic');
      if (hapBtn) hapBtn.classList.toggle('is-on', _hapticOn());

      // 시트 안 테마 segment
      const curTh = _curTheme();
      sheet.querySelectorAll('#shThemeSeg .ms-ic__seg-btn').forEach((b) => {
        b.classList.toggle('is-on', b.dataset.theme === curTh);
      });

      // 시트 안 글씨 segment
      const curFs = _curFS();
      sheet.querySelectorAll('#shFontSeg .ms-ic__seg-btn').forEach((b) => {
        b.classList.toggle('is-on', b.dataset.fs === curFs);
      });
    } catch (_e) { void _e; }
  }

  // ─── open / close ────────────────────────────────────────
  function open() {
    const sheet = _ensureSheet();
    const card = sheet.querySelector('#shCard');
    if (window.SheetAnim) window.SheetAnim.open(sheet, card);
    else sheet.style.display = 'block';
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
