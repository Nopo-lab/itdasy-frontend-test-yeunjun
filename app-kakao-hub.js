/* ───────────────────────────────────────────────────────────
   app-kakao-hub.js — 카카오 알림톡 / 챗봇 서브화면 (Phase 2)
   2026-04-28 신규.
   - md §12-2 기준: 예약 알림톡·전날 리마인드·당일 리마인드·취소 감지·빈슬롯 자동 채우기
   - 백엔드 미구현 — 연결 상태·템플릿 미리보기·발송 통계 (스텁)
   ─────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const ID = 'kakaoHubScreen';

  function _toast(m) { if (window.showToast) window.showToast(m); }
  function _haptic() { try { window.hapticLight && window.hapticLight(); } catch (_e) { void _e; } }

  const TEMPLATES = [
    { key: 'reserved',  title: '예약 확정 안내', body: '안녕하세요 #{고객명}님🌷 #{날짜} #{시간} #{메뉴} 예약 확정되었어요. 혹시 변경 필요하시면 답장 주세요!' },
    { key: 'pre_day',   title: '전날 리마인드',   body: '#{고객명}님, 내일 #{시간} 예약 잊지 않으셨죠? 편하게 오시면 돼요😊' },
    { key: 'same_day',  title: '당일 리마인드',   body: '#{고객명}님 오늘 #{시간} 예약이에요! 위치는 #{주소} 입니다.' },
    { key: 'cancel',    title: '취소 / 노쇼',     body: '예약 취소가 접수되었어요. 다음에 또 뵐게요🥰' },
    { key: 'gap_fill',  title: '빈슬롯 자동 채우기', body: '#{고객명}님, 마침 오늘 #{시간} 자리 비었어요! 혹시 가능하시면 답장 부탁드려요.' },
    { key: 'birthday',  title: '생일 축하 (월 1회)', body: '#{고객명}님, 생일 축하드려요이달 방문 시 작은 선물 준비했어요!' },
  ];

  function _ensureMounted() {
    let el = document.getElementById(ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = ID;
    el.className = 'subscreen-overlay';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <header class="ss-topbar">
        <button type="button" class="ss-back" data-kk-back aria-label="뒤로">
          <svg width="14" height="14" aria-hidden="true"><use href="#ic-chevron-left"/></svg>
        </button>
        <div class="ss-title">카카오 알림톡</div>
      </header>
      <div class="ss-body">
        <div class="ss-card" style="background:#FFF7E6;border:1px solid #FFD666;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <i class="ph-duotone ph-clock" aria-hidden="true"></i>
            <div class="ss-card-tt" style="margin:0;color:#8a5d00;">준비 중 · 출시 예정 안내</div>
          </div>
          <div class="ss-card-sub" style="color:#8a5d00;">
            <strong>내 카카오 채널 직접 연결</strong>(사업자등록증·채널 ID 필요)은 <strong>Phase 2</strong> 에 열려요.
            지금은 아래 발송 템플릿을 미리 볼 수 있어요.<br>
            <!-- [죽은동작 정리 2026-07-27] '두 화면 상반' 해소: 기본 예약 알림톡은 지금도 실제 발송된다.
                 [최종검증 G5 2026-08-24] 그 문장이 **조건부로 거짓**이었다. 알리고 채널이 연결돼
                 있어야만 나가는데 "지금도 … 발송돼요" 라고 단정하고 있었다. 실제로 운영 서버엔
                 ALIGO_* 가 설정돼 있지 않다 → 켜도 아무것도 안 나간다.
                 설정 화면은 이미 channels.alimtalk 로 토글을 잠그고 정직하게 안내하는데,
                 ⚠️ 이 주석은 **템플릿 리터럴 안**이다 — 백틱을 쓰면 문자열이 끊겨 파일 전체가
                    SyntaxError 가 되고, 지연로딩 스텁이 실제 함수로 안 바뀐다(실제로 그랬다).
                 이 화면만 반대로 말하고 있었다(두 화면 상반이 다시 생긴 것).
                 → 서버가 주는 같은 신호를 읽어 **문구를 맞춘다.** 하드코딩하지 않는다 —
                   나중에 채널이 연결되면 저절로 원래 문장으로 돌아와야 한다. -->
            <!-- 🔑 **기본값은 보수적으로.** 조회가 실패하면(401·404·오프라인) 문구가 그대로 남는데,
                 낙관적인 문장이 기본이면 실패할 때마다 "된다" 고 거짓말하게 된다.
                 실제로 그랬다 — apiFetch 가 404 를 주자 "켜면 발송돼요" 가 그대로 남았다.
                 그래서 **연결 확인된 경우에만** 긍정 문장으로 올린다(_syncAlimtalkNote). -->
            <span id="khAlimtalkNote" style="display:inline-block;margin-top:8px;padding:6px 10px;background:#FFF7ED;border-radius:8px;color:#C2410C;">
              ⚠️ <strong>카카오 알림톡은 아직 준비 중이에요.</strong> 채널이 연결되기 전까지는
              <strong>설정 → 예약 알림톡 자동발송</strong> 을 켤 수 없고, 손님에게 발송되지 않아요.
            </span>
          </div>
        </div>

        <div class="ss-card">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
            <div class="ss-card-tt" style="margin:0;">연결 상태</div>
            <span class="ss-status ss-status--off"><span class="dot"></span>미연결 · 준비 중</span>
          </div>
          <div class="ss-card-sub">알림톡을 보내려면 카카오 비즈니스 채널을 먼저 연결해야 해요. 사업자등록증·채널 ID 가 필요해요.</div>
          <ol style="margin:10px 0 12px 18px;padding:0;font-size:12px;color:var(--text2,#555);line-height:1.7;">
            <li>카카오 채널 만들기 (사업자등록증 필요)</li>
            <li>잇데이에 채널 ID·발신번호 등록</li>
            <li>알림톡 템플릿 카카오 검수 통과 (영업일 1-2일)</li>
            <li>예약 흐름과 자동 연결 → 발송 시작</li>
          </ol>
          <button type="button" class="ss-cta" data-kk-connect>카카오 채널 연결하기</button>
          <button type="button" class="ss-cta-secondary" data-kk-help>연결 가이드 보기</button>
        </div>

        <div class="ss-card">
          <div class="ss-card-tt">자동 발송 템플릿</div>
          <div class="ss-card-sub">예약 흐름에 맞춰 자동으로 발송돼요. 연결 후 ON/OFF 가능해요.</div>
          <div id="kkTemplates"></div>
        </div>

        <div class="ss-card">
          <div class="ss-card-tt">최근 30일 발송 통계</div>
          <div class="ss-empty" style="padding:24px 8px;">
            <i class="ph-duotone ph-chat-circle" aria-hidden="true"></i>
            <div class="ss-empty-tt">발송 내역이 없어요</div>
            <div class="ss-empty-sub">카카오 채널 연결 후 자동 발송이 시작돼요.</div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(el);

    // 템플릿 렌더
    const tpl = el.querySelector('#kkTemplates');
    if (tpl) {
      tpl.innerHTML = TEMPLATES.map((t) => `
        <div class="ss-toggle" style="align-items:flex-start;">
          <div style="flex:1;min-width:0;">
            <div class="ss-toggle-lbl">${_esc(t.title)}</div>
            <div class="ss-toggle-sub" style="margin-top:6px;line-height:1.5;color:var(--text2,#555);background:var(--bg2,#f6f6f7);padding:8px 10px;border-radius:10px;">${_esc(t.body)}</div>
          </div>
          <div class="ss-switch is-disabled" role="switch"
            aria-checked="false" aria-disabled="true" tabindex="-1" data-kk-template="${t.key}"></div>
        </div>
      `).join('');
    }

    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-kk-back]')) { closeKakaoHub(); return; }
      if (e.target.closest('[data-kk-connect]')) {
        _toast('카카오 비즈니스 연동 — Phase 2 에 출시 예정');
        return;
      }
      if (e.target.closest('[data-kk-help]')) {
        _toast('가이드 문서 준비 중이에요');
        return;
      }
      const sw = e.target.closest('[data-kk-template]');
      if (sw) {
        // [2026-05-29] 카카오 채널 미연결 — 토글 비활성. 안내만.
        _haptic();
        _toast('카카오 비즈니스 채널 연결 후 켜져요 (Phase 2 출시 예정)');
      }
    });
    return el;
  }

  function _esc(s) { return window._esc(s); } /* [2026-06-11] 중복 제거 — app-core 정본 위임 */

  function openKakaoHub() {
    const el = _ensureMounted();
    requestAnimationFrame(() => el.classList.add('is-open'));
    el.setAttribute('aria-hidden', 'false');
    // [2026-07-22 보스] 뒤로가기 등록 — 안 하면 안드로이드 back/스와이프에서 이 화면 대신 앱이 그대로 꺼진다.
    if (typeof window._registerSheet === 'function') window._registerSheet('kakaoHub', closeKakaoHub);
    if (typeof window._markSheetOpen === 'function') window._markSheetOpen('kakaoHub');
    _haptic();
    _syncAlimtalkNote();
  }

  // [최종검증 G5 2026-08-24] 알림톡 채널 연결 여부에 맞춰 안내 문구를 고친다.
  //   설정 화면과 **같은 신호**(`GET /shop/settings` 의 `channels.alimtalk`)를 쓴다 —
  //   두 화면이 각자 판단하면 또 상반된 말을 하게 된다.
  //   실패하면 문구를 건드리지 않는다(기본값이 "켜면 발송돼요" 라 낙관적이지만,
  //   설정 화면 토글이 잠겨 있어 원장님이 켤 수 없으므로 잘못된 기대로 이어지지 않는다).
  //   방향이 중요하다 — **"안 된다" 가 기본이고, 확인됐을 때만 "된다" 로 올린다.**
  //   반대로 두면 조회가 실패할 때마다(401·404·오프라인) 거짓 안내가 남는다.
  function _syncAlimtalkNote() {
    const note = document.getElementById('khAlimtalkNote');
    if (!note || typeof apiFetch !== 'function') return;
    const headers = (typeof window.authHeader === 'function') ? window.authHeader() : {};
    apiFetch('/shop/settings', { headers })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        // 채널이 **연결됐다고 확인된 경우에만** 긍정 문구로 바꾼다.
        if (!d || !d.channels || d.channels.alimtalk !== true) return;
        note.innerHTML = '💡 <strong>예약 확정·전날 리마인드 알림톡</strong>은 '
          + '<strong>설정 → 예약 알림톡 자동발송</strong> 에서 켜면 손님 폰으로 발송돼요.';
        note.style.background = '#fff';
        note.style.color = '#6b4e00';
      })
      .catch(() => { /* 실패 시 보수적 기본 문구 유지 — 거짓말하지 않는다 */ });
  }
  function closeKakaoHub() {
    const el = document.getElementById(ID);
    if (!el) return;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    if (typeof window._markSheetClosed === 'function') window._markSheetClosed('kakaoHub');
    _haptic();
  }

  window.openKakaoHub = openKakaoHub;
  window.closeKakaoHub = closeKakaoHub;
})();
