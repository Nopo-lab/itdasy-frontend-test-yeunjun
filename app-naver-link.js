/* ───────────────────────────────────────────────────────────
   app-naver-link.js — 네이버 예약 연동 (Phase 1)
   2026-04-28 신규.
   - md §12-1: 양방향 동기화·Pending Lock·웹훅·재시도
   - 백엔드 미구현 — 사업장 ID 입력·연결 상태·동기화 버튼 (스텁)
   ─────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const ID = 'naverLinkScreen';

  function _api() { return window.API || ''; }
  function _auth() { try { return (window.authHeader && window.authHeader()) || {}; } catch (_) { return {}; } }
  function _toast(m) { if (window.showToast) window.showToast(m); }
  function _haptic() { try { window.hapticLight && window.hapticLight(); } catch (_e) { void _e; } }

  function _ensureMounted() {
    let el = document.getElementById(ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = ID;
    el.className = 'subscreen-overlay';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <header class="ss-topbar">
        <button type="button" class="ss-back" data-nv-back aria-label="뒤로">
          <i class="ph-duotone ph-arrow-left" aria-hidden="true"></i>
        </button>
        <div class="ss-title">네이버 예약 연동</div>
      </header>
      <div class="ss-body">
        <div class="ss-card" style="background:#FFF7E6;border:1px solid #FFD666;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <i class="ph-duotone ph-clock" aria-hidden="true"></i>
            <div class="ss-card-tt" style="margin:0;color:#8a5d00;">준비 중 · Phase 1 출시 예정</div>
          </div>
          <div class="ss-card-sub" style="color:#8a5d00;">
            지금은 사업장 ID 만 미리 등록해 두실 수 있어요. 실제 양방향 동기화는 <strong>Phase 1 (예상 2026-05)</strong> 에 자동 활성화돼요.
          </div>
        </div>

        <div class="ss-card">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
            <div class="ss-card-tt" style="margin:0;">연결 상태</div>
            <span class="ss-status ss-status--off" id="nvStatus"><span class="dot"></span>미연결</span>
          </div>
          <div class="ss-card-sub">네이버 스마트플레이스 예약을 잇데이 캘린더와 실시간으로 양방향 동기화해요. 예약 충돌·중복을 자동으로 막아드려요.</div>
          <ol style="margin:10px 0 0 18px;padding:0;font-size:12px;color:var(--text2,#555);line-height:1.7;">
            <li>네이버 비즈니스에 스마트플레이스 등록</li>
            <li>아래 칸에 사업장 ID 입력 → "연결하기"</li>
            <li>네이버 인증 동의 (Phase 1 활성화 시)</li>
            <li>예약이 자동으로 양쪽에 동기화돼요</li>
          </ol>
        </div>

        <div class="ss-card">
          <div class="ss-card-tt">사업장 정보</div>
          <div class="ss-row"><span class="lbl">스마트플레이스 ID</span>
            <input class="ss-input" id="nvBizId" placeholder="예: 1234567890" inputmode="numeric"></div>
          <div class="ss-row"><span class="lbl">사업장 이름</span>
            <input class="ss-input" id="nvBizName" placeholder="네이버에 등록된 이름"></div>
          <div class="ss-card-sub" style="margin-top:8px;">
            <strong style="color:var(--text2,#555);">스마트플레이스 ID 찾는 법</strong><br>
            네이버 비즈니스 → 스마트플레이스 → 내 업체 → URL 의 숫자 부분
          </div>
          <button type="button" class="ss-cta" data-nv-connect>연결하기</button>
        </div>

        <div class="ss-card">
          <div class="ss-card-tt">동기화 옵션</div>
          <div class="ss-toggle">
            <div>
              <div class="ss-toggle-lbl">예약 자동 가져오기</div>
              <div class="ss-toggle-sub">네이버에서 새 예약이 들어오면 잇데이로 즉시 동기화</div>
            </div>
            <div class="ss-switch is-on" role="switch" aria-checked="true" tabindex="0" data-nv-toggle="pull"></div>
          </div>
          <div class="ss-toggle">
            <div>
              <div class="ss-toggle-lbl">잇데이 예약 → 네이버</div>
              <div class="ss-toggle-sub">잇데이에서 만든 예약을 네이버 캘린더에도 자동 등록</div>
            </div>
            <div class="ss-switch is-on" role="switch" aria-checked="true" tabindex="0" data-nv-toggle="push"></div>
          </div>
          <div class="ss-toggle">
            <div>
              <div class="ss-toggle-lbl">예약 충돌 방지 (Pending Lock)</div>
              <div class="ss-toggle-sub">DM 상담 중인 시간은 네이버에도 점유 표시</div>
            </div>
            <div class="ss-switch is-on" role="switch" aria-checked="true" tabindex="0" data-nv-toggle="lock"></div>
          </div>
        </div>

        <div class="ss-card">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
            <div class="ss-card-tt" style="margin:0;">최근 동기화</div>
            <button type="button" class="ss-action" data-nv-sync disabled>지금 동기화</button>
          </div>
          <div class="ss-empty" style="padding:24px 8px;">
            <i class="ph-duotone ph-arrows-clockwise" aria-hidden="true"></i>
            <div class="ss-empty-tt">동기화 기록이 없어요</div>
            <div class="ss-empty-sub">연결 후 자동 동기화가 시작돼요.</div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(el);

    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-nv-back]')) { closeNaverLink(); return; }
      if (e.target.closest('[data-nv-connect]')) { _connect(); return; }
      if (e.target.closest('[data-nv-sync]')) { _syncNow(); return; }
      const sw = e.target.closest('[data-nv-toggle]');
      if (sw) {
        sw.classList.toggle('is-on');
        sw.setAttribute('aria-checked', sw.classList.contains('is-on') ? 'true' : 'false');
        _haptic();
        try { localStorage.setItem('itdasy_nv_' + sw.getAttribute('data-nv-toggle'),
          sw.classList.contains('is-on') ? '1' : '0'); } catch (_e) { void _e; }
      }
    });
    return el;
  }

  function _hydrate() {
    const get = (k) => { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } };
    const id = get('itdasy_nv_biz_id');
    const name = get('itdasy_nv_biz_name');
    const bizIdEl = document.getElementById('nvBizId');
    const bizNameEl = document.getElementById('nvBizName');
    if (bizIdEl) bizIdEl.value = id;
    if (bizNameEl) bizNameEl.value = name;
    const isLinked = get('itdasy_nv_linked') === '1';
    _setStatus(isLinked);
    const syncBtn = document.querySelector('[data-nv-sync]');
    if (syncBtn) syncBtn.disabled = !isLinked;
  }

  function _setStatus(linked) {
    const el = document.getElementById('nvStatus');
    if (!el) return;
    if (linked) {
      el.className = 'ss-status ss-status--on';
      el.innerHTML = '<span class="dot"></span>연결됨';
    } else {
      el.className = 'ss-status ss-status--off';
      el.innerHTML = '<span class="dot"></span>미연결';
    }
  }

  async function _connect() {
    const id = (document.getElementById('nvBizId') || { value: '' }).value.trim();
    const name = (document.getElementById('nvBizName') || { value: '' }).value.trim();
    if (!id) { _toast('스마트플레이스 ID 를 입력해주세요'); return; }
    try { localStorage.setItem('itdasy_nv_biz_id', id); localStorage.setItem('itdasy_nv_biz_name', name); } catch (_e) { void _e; }
    _toast('연결 요청 중...');
    try {
      const res = await fetch(_api() + '/integrations/naver/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ..._auth() },
        body: JSON.stringify({ biz_id: id, biz_name: name }),
      });
      if (res.ok) {
        try { localStorage.setItem('itdasy_nv_linked', '1'); } catch (_e) { void _e; }
        _setStatus(true);
        const sb = document.querySelector('[data-nv-sync]');
        if (sb) sb.disabled = false;
        _toast('연결 완료');
      } else {
        _toast('연결 대기 — 네이버 인증 후 활성화됩니다');
      }
    } catch (_) {
      _toast('네트워크 오류 — 잠시 후 다시 시도해주세요');
    }
  }

  async function _syncNow() {
    _toast('동기화 시작...');
    try {
      const res = await fetch(_api() + '/integrations/naver/sync', {
        method: 'POST', headers: _auth(),
      });
      if (res.ok) _toast('동기화 완료');
      else _toast('동기화 실패 — 다시 시도해주세요');
    } catch (_) {
      _toast('네트워크 오류');
    }
  }

  function openNaverLink() {
    const el = _ensureMounted();
    _hydrate();
    requestAnimationFrame(() => el.classList.add('is-open'));
    el.setAttribute('aria-hidden', 'false');
    _haptic();
  }
  function closeNaverLink() {
    const el = document.getElementById(ID);
    if (!el) return;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    _haptic();
  }

  window.openNaverLink = openNaverLink;
  window.closeNaverLink = closeNaverLink;
})();
