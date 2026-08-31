/* ───────────────────────────────────────────────────────────
   app-naver-talk-link.js — 네이버 톡톡 연동 (2026-06-16 신규)
   - 원장이 셀프로 파트너 ID·인증키 입력 → IntegrationSetting(naver_talk) 저장.
   - 수신 파이프(/talktalk/webhook) + NaverTalkAdapter 는 BE에 이미 구현됨.
   - app-naver-link.js 의 subscreen-overlay / ss-* 디자인 시스템 그대로 재사용.
   ─────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const ID = 'naverTalkLinkScreen';
  // 네이버 N 글리프 — channel-mark.js 정품 로고타입 N 재사용(중복 정의 금지). 이모지/타이핑 글자 금지.
  function _nBadge() {
    return (window.ChannelMark && window.ChannelMark.mark)
      ? window.ChannelMark.mark('naver', { size: 22, radius: 6, pos: 'position:relative;', ring: false })
      : '';
  }

  function _api() { return window.API || ''; }
  function _auth() { try { return (window.authHeader && window.authHeader()) || {}; } catch (_) { return {}; } }
  function _toast(m) { if (window.showToast) window.showToast(m); }
  function _haptic() { try { window.hapticLight && window.hapticLight(); } catch (_e) { void _e; } }
  function _webhookUrl() { return _api() + '/talktalk/webhook'; }

  function _ensureMounted() {
    let el = document.getElementById(ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = ID;
    el.className = 'subscreen-overlay';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <header class="ss-topbar">
        <button type="button" class="ss-back" data-nt-back aria-label="뒤로">
          <svg class="ic" aria-hidden="true"><use href="#ic-chevron-left"/></svg>
        </button>
        <div class="ss-title" style="display:flex;align-items:center;gap:7px;">${_nBadge()}네이버 톡톡 연동</div>
      </header>
      <div class="ss-body">
        <div class="ss-card">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
            <div class="ss-card-tt" style="margin:0;">연결 상태</div>
            <span class="ss-status ss-status--off" id="ntStatus"><span class="dot"></span>미연결</span>
          </div>
          <div class="ss-card-sub">네이버 톡톡 문의를 통합 인박스에서 한 번에. 잇비가 답장 초안까지 준비해드려요.</div>
          <ol style="margin:10px 0 0 18px;padding:0;font-size:12px;color:var(--text2,#555);line-height:1.7;">
            <li>아래 버튼으로 <strong>네이버 톡톡 파트너센터</strong> 접속 (네이버 로그인)</li>
            <li>챗봇 API 설정에서 <strong>파트너 ID · 인증키</strong> 발급</li>
            <li>아래 <strong>Webhook 주소</strong>를 파트너센터에 등록</li>
            <li>파트너 ID·인증키 입력 → "연결하기"</li>
          </ol>
          <a href="https://partner.talk.naver.com/" target="_blank" rel="noopener noreferrer"
             style="display:flex;align-items:center;justify-content:center;gap:7px;margin-top:12px;padding:12px;border:1.5px solid #03C75A;border-radius:11px;color:#03C75A;font-size:13.5px;font-weight:700;text-decoration:none;">
            네이버 톡톡 파트너센터 열기
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#03C75A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>
          </a>
        </div>

        <div class="ss-card">
          <div class="ss-card-tt">연결 정보 입력</div>
          <div class="ss-row"><span class="lbl">파트너 ID</span>
            <input class="ss-input" id="ntPartnerId" placeholder="예: wc1a2b3c" autocomplete="off"></div>
          <div class="ss-row"><span class="lbl">인증키 (Authorization)</span>
            <input class="ss-input" id="ntAuthToken" placeholder="파트너센터에서 발급받은 키" autocomplete="off"></div>
          <div class="ss-row" style="align-items:flex-start;">
            <span class="lbl">Webhook 주소 <span style="color:var(--text3,#b8b5ac);">(파트너센터에 등록)</span></span>
          </div>
          <div style="display:flex;gap:8px;align-items:center;margin-top:2px;">
            <code id="ntWebhook" style="flex:1;min-width:0;font-size:11px;background:#F2F4F6;border-radius:8px;padding:9px 10px;color:#444;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_webhookUrl()}</code>
            <button type="button" class="ss-action" data-nt-copy>복사</button>
          </div>
          <div class="ss-card-sub" style="margin-top:8px;">
            <strong style="color:var(--text2,#555);">파트너 ID·인증키 찾는 법</strong><br>
            네이버 톡톡 파트너센터 → 개발자도구 → 챗봇API 설정 → 생성
          </div>
          <button type="button" class="ss-cta" data-nt-connect>연결하기</button>
        </div>

        <!-- [죽은동작 정리 2026-07-27] '수신 옵션' 3토글(초안준비·새문의알림·자동발송) 제거.
             localStorage 에만 저장되고 백엔드 DM 코어가 안 읽어 켜든 끄든 무동작이었다. 특히
             '자동 발송 · 원장님 확인 없이 바로 전송'은 켜도 아무 일 없었다(실 발송은 항상 확인 큐 경유).
             톡톡 문의의 초안/알림/발송은 공유 DM 자동응답 설정(내샵관리>잇비 자동화)이 관장한다. -->
      </div>
    `;
    document.body.appendChild(el);

    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-nt-back]')) { closeNaverTalkLink(); return; }
      if (e.target.closest('[data-nt-connect]')) { _connect(); return; }
      if (e.target.closest('[data-nt-copy]')) { _copyWebhook(); return; }
      const sw = e.target.closest('[data-nt-toggle]');
      if (sw) {
        sw.classList.toggle('is-on');
        sw.setAttribute('aria-checked', sw.classList.contains('is-on') ? 'true' : 'false');
        _haptic();
        try {
          localStorage.setItem('itdasy_nt_' + sw.getAttribute('data-nt-toggle'),
            sw.classList.contains('is-on') ? '1' : '0');
        } catch (_e) { void _e; }
      }
    });
    return el;
  }

  function _hydrate() {
    const get = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
    // 입력값 복원 — partner_id 만(인증키는 보안상 미저장, 재연결 시 재입력).
    const pid = get('itdasy_nt_partner_id') || '';
    const pidEl = document.getElementById('ntPartnerId');
    if (pidEl) pidEl.value = pid;
    const hook = document.getElementById('ntWebhook');
    if (hook) hook.textContent = _webhookUrl();
    // 토글 복원 — draft/notify 기본 ON, autosend 기본 OFF.
    const tg = { draft: '1', notify: '1', autosend: '0' };
    Object.keys(tg).forEach((k) => {
      const saved = get('itdasy_nt_' + k);
      const on = (saved == null) ? (tg[k] === '1') : (saved === '1');
      const sw = document.querySelector('[data-nt-toggle="' + k + '"]');
      if (sw) {
        sw.classList.toggle('is-on', on);
        sw.setAttribute('aria-checked', on ? 'true' : 'false');
      }
    });
    _setStatus(get('itdasy_nt_linked') === '1');
  }

  function _setStatus(linked) {
    const el = document.getElementById('ntStatus');
    if (!el) return;
    el.className = linked ? 'ss-status ss-status--on' : 'ss-status ss-status--off';
    el.innerHTML = '<span class="dot"></span>' + (linked ? '연결됨' : '미연결');
  }

  function _copyWebhook() {
    const url = _webhookUrl();
    const done = () => { _haptic(); _toast('복사됐어요'); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(() => _fallbackCopy(url, done));
        return;
      }
    } catch (_e) { void _e; }
    _fallbackCopy(url, done);
  }

  function _fallbackCopy(text, done) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      done();
    } catch (_e) { _toast('복사 실패 — 길게 눌러 복사해주세요'); }
  }

  async function _connect() {
    const partner_id = (document.getElementById('ntPartnerId') || { value: '' }).value.trim();
    const auth_token = (document.getElementById('ntAuthToken') || { value: '' }).value.trim();
    if (!partner_id || !auth_token) { _toast('파트너 ID와 인증키를 입력해주세요'); return; }
    try { localStorage.setItem('itdasy_nt_partner_id', partner_id); } catch (_e) { void _e; }
    _toast('연결 요청 중...');
    try {
      const res = await fetch(_api() + '/integrations/naver_talk/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ..._auth() },
        body: JSON.stringify({ partner_id, auth_token }),
      });
      if (res.ok) {
        try { localStorage.setItem('itdasy_nt_linked', '1'); } catch (_e) { void _e; }
        _setStatus(true);
        _toast('연결 완료');
      } else {
        _toast('연결 실패 — 입력값 확인 후 다시 시도');
      }
    } catch (_) {
      _toast('네트워크 오류 — 잠시 후 다시 시도해주세요');
    }
  }

  // [죽은동작 정리 2026-07-27] 연결 상태를 서버(GET /integrations/naver_talk)에서 재조회.
  //   예전엔 localStorage('itdasy_nt_linked')만 봐서, 다른 기기에서 연결했거나 로컬을 지우면
  //   실제 연결돼 있어도 '미연결'로 잘못 표시됐다.
  function _refreshStatusFromServer() {
    try {
      fetch(_api() + '/integrations/naver_talk', { headers: _auth() })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d) return;
          const linked = !!d.is_linked;
          try { localStorage.setItem('itdasy_nt_linked', linked ? '1' : '0'); } catch (_e) { void _e; }
          _setStatus(linked);
        })
        .catch(() => {});
    } catch (_e) { void _e; }
  }

  function openNaverTalkLink() {
    const el = _ensureMounted();
    _hydrate();
    _refreshStatusFromServer();
    requestAnimationFrame(() => el.classList.add('is-open'));
    el.setAttribute('aria-hidden', 'false');
    // [2026-07-22 보스] 뒤로가기 등록 — 안 하면 안드로이드 back/스와이프에서 이 화면 대신 앱이 그대로 꺼진다.
    if (typeof window._registerSheet === 'function') window._registerSheet('naverTalkLink', closeNaverTalkLink);
    if (typeof window._markSheetOpen === 'function') window._markSheetOpen('naverTalkLink');
    _haptic();
  }
  function closeNaverTalkLink() {
    const el = document.getElementById(ID);
    if (!el) return;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    if (typeof window._markSheetClosed === 'function') window._markSheetClosed('naverTalkLink');
    _haptic();
  }

  window.openNaverTalkLink = openNaverTalkLink;
  window.closeNaverTalkLink = closeNaverTalkLink;
})();
