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
          <i class="ph-duotone ph-arrow-left" aria-hidden="true"></i>
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
            카카오 비즈니스 채널 연결은 <strong>Phase 2 (예상 2026-05)</strong> 에 활성화돼요.<br>
            지금은 자동 발송 템플릿만 미리 살펴보실 수 있어요.
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
      tpl.innerHTML = TEMPLATES.map((t, i) => `
        <div class="ss-toggle" style="align-items:flex-start;">
          <div style="flex:1;min-width:0;">
            <div class="ss-toggle-lbl">${_esc(t.title)}</div>
            <div class="ss-toggle-sub" style="margin-top:6px;line-height:1.5;color:var(--text2,#555);background:var(--bg2,#f6f6f7);padding:8px 10px;border-radius:10px;">${_esc(t.body)}</div>
          </div>
          <div class="ss-switch ${i < 3 ? 'is-on' : ''}" role="switch"
            aria-checked="${i < 3 ? 'true' : 'false'}" tabindex="0" data-kk-template="${t.key}"></div>
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
        sw.classList.toggle('is-on');
        sw.setAttribute('aria-checked', sw.classList.contains('is-on') ? 'true' : 'false');
        _haptic();
        _toast('연결 후 자동 적용돼요');
      }
    });
    return el;
  }

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function openKakaoHub() {
    const el = _ensureMounted();
    requestAnimationFrame(() => el.classList.add('is-open'));
    el.setAttribute('aria-hidden', 'false');
    _haptic();
  }
  function closeKakaoHub() {
    const el = document.getElementById(ID);
    if (!el) return;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    _haptic();
  }

  window.openKakaoHub = openKakaoHub;
  window.closeKakaoHub = closeKakaoHub;
})();
