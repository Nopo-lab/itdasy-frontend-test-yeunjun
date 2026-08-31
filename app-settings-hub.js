/* 설정 허브 — 샵정보/네이버/백업/undo/실패알림 + 인라인 진동·테마·글씨 + 로그아웃 (v3 디자인 · 2026-04-30)
   사용:
     window.openSettingsHub()  — v3 시트 열기
     window.closeSettingsHub() — 닫기
   진입 시그니처 / _route(act) 9개 매핑 / _refreshLabels() 외부 anchor 동기화 모두 보존.
*/
(function () {
  'use strict';

  // ─── XSS 방어 ────────────────────────────────────────────
  function _esc(s) { return window._esc(s); } /* [2026-06-11] 중복 제거 — app-core 정본 위임 */

  // ─── 아이콘 헬퍼 (sprite use only) ───────────────────────
  function _ic(id, size) {
    const sz = size || 16;
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
          <div class="ms-sheet__title">설정</div>
          <div class="ms-sheet__sub">앱 설정 · 샵 정보 · 백업</div>
        </div>
        <button type="button" class="ms-sheet__close ss-close" id="shClose" aria-label="닫기"><svg class="ic" width="18" height="18" aria-hidden="true"><use href="#ic-x"/></svg></button>
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
  // 연동된 인스타 핸들 / 프사 — 캐시(itdasy:ig_handle / itdasy:ig_profile_pic) 기반.
  function _igInfo() {
    let handle = '';
    let pic = '';
    // 저장값에 @가 이미 붙어있는 경우가 있어 표시 전에 제거 (@@ 중복 방지)
    try { handle = (localStorage.getItem('itdasy:ig_handle') || '').replace(/^@+/, ''); } catch (_e) { void _e; }
    try { pic = localStorage.getItem('itdasy:ig_profile_pic') || ''; } catch (_e) { void _e; }
    return { handle, pic };
  }
  // [2026-07-05 리디자인] 원형 프로필 + @핸들 + 연동 상태 필 배지 — 카드 자체가 설명(라벨 텍스트 제거).
  function _accountHTML() {
    const { provLabel, email } = _accountInfo();
    const { handle, pic } = _igInfo();
    const emailText = email ? `${_esc(provLabel)} · ${_esc(email)}` : _esc(provLabel);
    const isUrl = /^https?:\/\//i.test(pic || '');
    const initial = (handle || 'I').trim().charAt(0).toUpperCase();
    const avatar = isUrl
      ? `<img class="sv2-acc__avatar" src="${_esc(pic)}" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none'">`
      : `<span class="sv2-acc__avatar sv2-acc__avatar--init">${_esc(initial)}</span>`;
    const badge = handle
      ? `<span class="sv2-pill sv2-pill--ok">인스타 연동됨</span>`
      : `<button type="button" class="sv2-pill sv2-pill--brand" id="shIgConnect">연동하기</button>`;
    return `
      <div class="ms-section__title" style="margin-top:4px;">계정</div>
      <div class="ms-sh" id="shAccount">
        <div class="sv2-acc">
          ${avatar}
          <div class="sv2-acc__info">
            <div class="sv2-acc__handle">${handle ? _esc(window.igHandle(handle)) : '인스타 미연동'}</div>
            <div class="sv2-acc__email">${emailText}</div>
          </div>
          ${badge}
        </div>
      </div>
    `;
  }
  function _listHTML() {
    return `
      <div class="ms-section__title">샵</div>
      <div class="ms-sh" id="shList">
        ${_rowHTML('shopinfo', 'ic-store',    '샵 정보',          '영업시간 · 시술 메뉴', { boxColor: 'blue' })}
        ${_rowHTML('sync',     'ic-refresh-cw', '데이터 새로고침', '최신 버전·데이터로 새로고침 (껐다 켠 효과)', { boxColor: 'blue' })}
        ${_rowHTML('backup',   'ic-download', '백업 · 내보내기',  '자동 백업 · 데이터 내보내기', { boxColor: 'pink' })}
      </div>
      <div class="ms-section__title" style="margin-top:14px;">계정</div>
      <div class="ms-sh">
        ${_rowHTML('subscription','ic-credit-card', '구독 관리',          '플랜 · 결제 · 취소', { boxColor: 'pink' })}
        ${_rowHTML('membership','ic-ticket',    '회원권',             '만료 임박 고객 · 충전 안내', { boxColor: 'coral' })}
        ${_rowHTML('deleteaccount','ic-trash-2', '계정 탈퇴',          '모든 데이터 영구 삭제', { boxColor: 'coral', danger: true })}
      </div>
    `;
    // [2026-06-09] '도움(고객센터·문의)' 행 제거 — PC 사이드바 '문의하기' / 모바일 내샵관리 하단 링크로 일원화.
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
            <button type="button" class="ms-ic__seg-btn" data-theme="dark" style="opacity:0.5;cursor:not-allowed;" title="정비 중 — 잠시만요">다크 <span style="background:#FEF7E5;color:#8B6F00;font-size:11px;padding:2px 7px;border-radius:5px;margin-left:4px;font-weight:600;">정비 중</span></button>
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
  // [2026-06-09] _logoutHTML 제거 — 로그아웃은 PC 사이드바 푸터 / 모바일 내샵관리 하단으로 이전.
  function _buildSheet() {
    const sheet = document.createElement('div');
    sheet.id = 'settingsHubSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9985;display:none;';
    sheet.innerHTML = `
      <div class="ms-sheet__overlay" id="shOverlay" style="position:fixed;inset:0;"></div>
      <div class="ms-sheet" id="shCard" style="max-width:560px;margin:0 auto;">
        ${_headHTML()}
        <div class="ms-sheet__body">
          ${_accountHTML()}
          ${_listHTML()}
          ${_inlineHTML()}
        </div>
      </div>
    `;
    return sheet;
  }

  function _rowHTML(act, icon, name, meta, opt) {
    const o = opt || {};
    const metaCls = o.metaClass ? ` ${_esc(o.metaClass)}` : '';
    const nameStyle = o.danger ? ' style="color:var(--danger);"' : '';
    const iconHtml = o.iconHtml
      ? `<div class="ms-sh__icon">${o.iconHtml}</div>`  // 커스텀 브랜드 글리프(예: 네이버 N) — 이모지 금지
      : o.boxColor
        ? `<div class="ms-sh__icon"><span class="ic-box ic-box--sm ic-box--${_esc(o.boxColor)}">${_ic(icon, 14)}</span></div>`
        : `<div class="ms-sh__icon">${_ic(icon, 16)}</div>`;
    return `
      <button type="button" class="ms-sh__row" data-act="${_esc(act)}">
        ${iconHtml}
        <div class="ms-sh__info">
          <div class="ms-sh__name"${nameStyle}>${_esc(name)}</div>
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

    // 미연동 시 '연동하기' 필 → 연동관리 허브로
    sheet.querySelector('#shIgConnect')?.addEventListener('click', () => {
      try { window.hapticLight && window.hapticLight(); } catch (_e) { void _e; }
      close();
      setTimeout(() => window.openIntegrationsHub && window.openIntegrationsHub(), 200);
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
    if (act === 'shopinfo')  { close(); setTimeout(() => window.openShopSettings && window.openShopSettings(), 200); return; }
    // [2026-05-24] powerview 액션 제거 — 파워뷰 기능 폐지
    if (act === 'sync')      { close(); setTimeout(() => window.forceAppUpdate && window.forceAppUpdate(), 200); return; }
    if (act === 'backup')    { close(); setTimeout(() => window.openBackupScreen && window.openBackupScreen(), 200); return; }
    // 'undo' 라우트는 잇비 채팅 ⋯ 메뉴로 일원화 (2026-05-25, 행 제거).
    // [2026-07-05] 'failures' 라우트 제거 — 자동화 실패는 알림함(app-notifications)으로 통합.
    if (act === 'subscription'){ close(); setTimeout(() => window.openPlanPopup && window.openPlanPopup(), 200); return; }
    if (act === 'membership'){ close(); setTimeout(() => window.MembershipUI && window.MembershipUI.openExpiringList && window.MembershipUI.openExpiringList(30), 200); return; }
    // [보안감사 C-2 2026-07-26] 계정 탈퇴 — 삭제 로직·모달·API 는 완성돼 있었으나(app-core openDeleteAccountModal)
    //   여는 UI 경로가 끊겨 있어(레거시 settingsSheet 미오픈) 앱심사 필수 요건(Apple 5.1.1)이 도달 불가였다.
    if (act === 'deleteaccount'){ close(); setTimeout(() => window.openDeleteAccountModal && window.openDeleteAccountModal(), 200); return; }
    // [2026-06-09] 'support'/'logout' 라우트 제거 — 설정·연동에서 빠지고 사이드바/내샵관리 하단으로 이전.
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
    // [출시감사 2026-08-02] 안드로이드 뒤로가기 등록. 갤럭시 에뮬레이터 실측 —
    //   이 시트를 열고 뒤로가기를 누르면 **아무 반응이 없다**(시트가 그대로 떠 있다).
    //   계속 누르면 결국 앱 종료 확인이 뜬다. aiHub 와 같은 원인 — _registerSheet/
    //   _markSheetOpen 미등록이라 백핸들러가 이 시트를 모른다.
    if (typeof window._registerSheet === 'function') window._registerSheet('settingsHub', close);
    if (typeof window._markSheetOpen === 'function') window._markSheetOpen('settingsHub');
  }
  function close() {
    const sheet = document.getElementById('settingsHubSheet');
    if (!sheet) return;
    const card = sheet.querySelector('#shCard');
    if (window.SheetAnim) window.SheetAnim.close(sheet, card);
    else sheet.style.display = 'none';
    // [출시감사 2026-08-02] 열 때 쌓은 history 엔트리 되돌리기. 안 부르면 닫은 뒤에도
    //   스택에 남아 "눌러도 아무 일 없는 뒤로가기"가 누적된다.
    if (typeof window._markSheetClosed === 'function') window._markSheetClosed('settingsHub');
  }

  window.openSettingsHub = open;
  window.closeSettingsHub = close;
})();
