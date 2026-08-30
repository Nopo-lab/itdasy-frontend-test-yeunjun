/* 연동관리 허브 — 인스타·네이버 톡톡·카톡 연동 모음 (2026-06-16)
   사용: window.openIntegrationsHub() / window.closeIntegrationsHub()
   연동·해제 로직은 기존 window 함수 위임 — 중복 정의 금지.
   디자인: app-settings-hub.js _rowHTML / ms-sh* 패턴 재사용.
*/
(function () {
  'use strict';

  function _esc(s) { return window._esc(s); }
  function _ic(id, size) {
    const sz = size || 16;
    return `<svg width="${sz}" height="${sz}" aria-hidden="true"><use href="#${_esc(id)}"/></svg>`;
  }

  // ChannelMark tint 글리프 (파스텔 박스 + 브랜드색 N / 말풍선).
  // ⚠ 전역 svg{fill:none}(tokens.css) 방어: ChannelMark 내부에서 inline style 처리됨.
  function _cm(ch) {
    if (!(window.ChannelMark && window.ChannelMark.mark)) return '';
    const tints = {
      naver: { bg: '#E1F5EE', fg: '#03C75A' },
      kakao: { bg: '#FEF9C3', fg: '#3C1E1E' },
    };
    return window.ChannelMark.mark(ch, {
      size: 24, radius: 6,
      pos: 'position:relative;',
      ring: false,
      tint: tints[ch] || tints.naver,
    });
  }

  function _rowHTML(act, icon, name, meta, opt) {
    const o = opt || {};
    const nameStyle = o.danger ? ' style="color:var(--danger);"' : '';
    const iconHtml = o.iconHtml
      ? `<div class="ms-sh__icon">${o.iconHtml}</div>`
      : o.boxColor
        ? `<div class="ms-sh__icon"><span class="ic-box ic-box--sm ic-box--${_esc(o.boxColor)}">${_ic(icon, 14)}</span></div>`
        : `<div class="ms-sh__icon">${_ic(icon, 16)}</div>`;
    return `
      <button type="button" class="ms-sh__row" data-act="${_esc(act)}">
        ${iconHtml}
        <div class="ms-sh__info">
          <div class="ms-sh__name"${nameStyle}>${_esc(name)}</div>
          <div class="ms-sh__meta">${_esc(meta)}</div>
        </div>
        <div class="ms-sh__chev">${_ic('ic-chevron-right', 14)}</div>
      </button>
    `;
  }


  /* 인스타 연결 상태 카드 — 원장님이 "지금 정상인지 / 언제 갱신되는지 / 재연동이
     필요한지" 를 여기 한 곳에서 본다.

     [2026-08-31] 예전엔 이 시트에 '인스타그램 연결 / 재연결' 행만 있고 **상태가 전혀
     없었다.** 토큰이 66일 죽어 있어도 화면은 평소와 똑같았다(user_id=27 실장애).
     판정은 js/instagram/token-status.js 한 곳에서만 한다 — 여기서 다시 계산하지 말 것. */
  function _statusCardHTML() {
    const S = window.IgTokenStatus;
    const st = S ? S.resolve(window.IGState && window.IGState.get
      ? _fromStore() : null, { skewMs: window._igServerSkewMs || 0 }) : null;
    if (!S || !st) return '';
    const info = S.describe(st);
    const toneBg = {
      danger: 'var(--danger-soft, #FDECEC)', info: 'var(--info-soft, #EAF2FE)',
      ok: 'var(--ok-soft, #EAF7EF)', idle: 'var(--bg-subtle, #F6F6F7)',
    }[info.tone] || 'var(--bg-subtle, #F6F6F7)';
    const toneFg = {
      danger: 'var(--danger, #D14343)', info: 'var(--text-muted, #667)',
      ok: 'var(--ok, #2E9E63)', idle: 'var(--text-muted, #667)',
    }[info.tone] || 'var(--text-muted, #667)';
    const handle = st.handle ? `<div class="ms-sh__meta" style="margin-top:2px;">${_esc(st.handle)}</div>` : '';
    const cta = info.showCta
      ? `<button type="button" class="banner__cta" data-act="instagram"
           style="margin-top:12px;width:100%;">${_esc(info.cta)}</button>`
      : '';
    return `
      <div id="ihIgStatus" style="background:${toneBg};border-radius:14px;padding:14px 16px;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="font-weight:800;font-size:14px;color:${toneFg};flex:1;">${_esc(info.title)}</div>
          <div style="font-size:11px;font-weight:700;color:${toneFg};opacity:.85;">${_esc(info.badge)}</div>
        </div>
        ${handle}
        <div class="ms-sh__meta" style="margin-top:6px;line-height:1.55;">${_esc(info.detail)}</div>
        ${cta}
      </div>`;
  }

  /* IGState 저장본을 status 응답 모양으로 되돌린다 — resolve() 가 한 가지 입력만 알게. */
  function _fromStore() {
    const s = (window.IGState && window.IGState.get && window.IGState.get()) || null;
    if (!s) return null;
    return {
      connected: !!s.connected,
      token_valid: s.tokenValid !== false,
      reconnect_required: (typeof s.reconnectRequired === 'boolean') ? s.reconnectRequired : undefined,
      expires_at: s.expires_at || null,
      handle: s.handle || '',
      capabilities: s.capabilities || null,
    };
  }

  /* 시트가 열려 있는 동안 상태가 바뀌면(재연동 성공 등) 새로고침 없이 즉시 다시 그린다. */
  function _refreshStatusCard() {
    const host = document.getElementById('ihIgStatusHost');
    if (!host) return;
    host.innerHTML = _statusCardHTML();
  }

  function _buildSheet() {
    const sheet = document.createElement('div');
    sheet.id = 'integrationsHubSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9985;display:none;';
    sheet.innerHTML = `
      <div class="ms-sheet__overlay" id="ihOverlay" style="position:fixed;inset:0;"></div>
      <div class="ms-sheet" id="ihCard" style="max-width:560px;margin:0 auto;">
        <div class="ms-sheet__handle"></div>
        <div class="ms-sheet__head">
          <div class="ms-sheet__head-left">
            <div class="ms-sheet__title">연결된 서비스</div>
            <div class="ms-sheet__sub">인스타 · 네이버 톡톡 · 카톡</div>
          </div>
          <button type="button" class="ms-sheet__close ss-close" id="ihClose" aria-label="닫기"><svg class="ic" width="18" height="18" aria-hidden="true"><use href="#ic-x"/></svg></button>
        </div>
        <div class="ms-sheet__body">
          <div class="ms-section__title">인스타그램</div>
          <div id="ihIgStatusHost"></div>
          <div class="ms-sh">
            ${_rowHTML('instagram',            'ic-instagram', '인스타그램 연결 / 재연결', '콘텐츠 발행 · 말투 분석용', { boxColor: 'pink' })}
            ${_rowHTML('instagram_disconnect', 'ic-instagram', '인스타그램 연결 해제',     '토큰 즉시 폐기 · 잇데이 로그인은 유지', { boxColor: 'red', danger: true })}
          </div>
          <div class="ms-section__title" style="margin-top:14px;">메시지 채널</div>
          <div class="ms-sh">
            ${_rowHTML('naver_talk', '', '네이버 톡톡 연동', '문의 통합 수신 · 잇비 초안', { iconHtml: _cm('naver') })}
            ${_rowHTML('kakao',      '', '카카오톡 채널 연동', 'DM 통합 수신 · 잇비 초안',  { iconHtml: _cm('kakao') })}
          </div>
        </div>
      </div>
    `;
    return sheet;
  }

  function _ensureSheet() {
    let sheet = document.getElementById('integrationsHubSheet');
    if (sheet) return sheet;
    sheet = _buildSheet();
    document.body.appendChild(sheet);

    sheet.querySelector('#ihOverlay')?.addEventListener('click', close);
    sheet.querySelector('#ihClose')?.addEventListener('click', () => {
      try { window.hapticLight && window.hapticLight(); } catch (_e) { void _e; }
      close();
    });
    sheet.querySelectorAll('.ms-sh__row[data-act]').forEach((b) => {
      b.addEventListener('click', () => {
        try { window.hapticLight && window.hapticLight(); } catch (_e) { void _e; }
        _route(b.dataset.act);
      });
    });
    // 상태 카드의 CTA 는 매번 새로 그려지므로 개별 리스너 대신 위임으로 받는다
    //   (innerHTML 로 갈아끼우면 붙여둔 리스너가 같이 사라진다).
    sheet.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('#ihIgStatusHost [data-act]') : null;
      if (!btn) return;
      try { window.hapticLight && window.hapticLight(); } catch (_e) { void _e; }
      _route(btn.dataset.act);
    });
    // 재연동이 끝나면(또는 상태가 바뀌면) 새로고침 없이 즉시 다시 그린다.
    //   app-instagram.js 의 checkInstaStatus 가 이 이벤트를 쏜다.
    try {
      window.addEventListener('itdasy:ig:changed', () => { _refreshStatusCard(); });
    } catch (_e) { void _e; }
    return sheet;
  }

  function _route(act) {
    if (act === 'instagram')            { close(); setTimeout(() => window.connectInstagram    && window.connectInstagram(),    200); return; }
    if (act === 'instagram_disconnect') { close(); setTimeout(() => window.disconnectInstagram && window.disconnectInstagram(), 200); return; }
    if (act === 'naver_talk')           { close(); setTimeout(() => window.openNaverTalkLink   && window.openNaverTalkLink(),   200); return; }
    if (act === 'kakao')                { close(); setTimeout(() => window.openKakaoHub        && window.openKakaoHub(),        200); return; }
  }

  function open() {
    const sheet = _ensureSheet();
    const card = sheet.querySelector('#ihCard');
    // 열 때마다 상태를 다시 그린다 — 시트는 한 번 만들고 재사용하므로,
    //   여기서 안 그리면 처음 열었을 때의 상태가 계속 남는다.
    _refreshStatusCard();
    if (window.SheetAnim) window.SheetAnim.open(sheet, card);
    else sheet.style.display = 'block';
    // [출시감사 2026-08-02] 안드로이드 뒤로가기 등록. 갤럭시 에뮬레이터 실측 —
    //   이 시트를 열고 뒤로가기를 누르면 **아무 반응이 없다**(시트가 그대로 떠 있다).
    //   계속 누르면 결국 앱 종료 확인이 뜬다. aiHub 와 같은 원인 — _registerSheet/
    //   _markSheetOpen 미등록이라 백핸들러가 이 시트를 모른다.
    if (typeof window._registerSheet === 'function') window._registerSheet('integrationsHub', close);
    if (typeof window._markSheetOpen === 'function') window._markSheetOpen('integrationsHub');
  }
  function close() {
    const sheet = document.getElementById('integrationsHubSheet');
    if (!sheet) return;
    const card = sheet.querySelector('#ihCard');
    if (window.SheetAnim) window.SheetAnim.close(sheet, card);
    else sheet.style.display = 'none';
    // [출시감사 2026-08-02] 열 때 쌓은 history 엔트리 되돌리기. 안 부르면 닫은 뒤에도
    //   스택에 남아 "눌러도 아무 일 없는 뒤로가기"가 누적된다.
    if (typeof window._markSheetClosed === 'function') window._markSheetClosed('integrationsHub');
  }

  window.openIntegrationsHub = open;
  window.closeIntegrationsHub = close;
})();
