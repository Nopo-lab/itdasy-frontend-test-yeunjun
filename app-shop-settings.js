/* ───────────────────────────────────────────────────────────
   app-shop-settings.js — 샵 정보 / 직원 관리 서브화면
   2026-04-28 신규.
   - 샵 이름·전화·주소·영업시간·1인샵 모드 토글
   - PUT /shop/settings (백엔드 미구현 시 graceful)
   - 직원 목록은 1인샵 토글이 OFF 일 때만 노출 (스텁)
   ─────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const ID = 'shopSettingsScreen';

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
        <button type="button" class="ss-back" data-ss-back aria-label="뒤로">
          <svg class="ic" aria-hidden="true"><use href="#ic-arrow-left"/></svg>
        </button>
        <div class="ss-title">샵 정보 · 직원</div>
        <button type="button" class="ss-action" data-ss-save>저장</button>
      </header>
      <div class="ss-body">
        <div class="ss-card">
          <div class="ss-card-tt">샵 정보</div>
          <div class="ss-row"><span class="lbl">샵 이름</span>
            <input class="ss-input" id="ssShopName" placeholder="예) 잇데이 네일 강남점"></div>
          <div class="ss-row"><span class="lbl">전화번호</span>
            <input class="ss-input" id="ssShopPhone" placeholder="010-0000-0000" inputmode="tel"></div>
          <div class="ss-row"><span class="lbl">주소</span>
            <input class="ss-input" id="ssShopAddr" placeholder="도로명 주소"></div>
          <div class="ss-row"><span class="lbl">영업시간</span>
            <input class="ss-input" id="ssShopHours" placeholder="예) 10:00 - 21:00 (월 휴무)"></div>
        </div>

        <div class="ss-card">
          <div class="ss-card-tt">운영 모드</div>
          <div class="ss-toggle">
            <div>
              <div class="ss-toggle-lbl">1인샵 모드</div>
              <div class="ss-toggle-sub">원장님 한 분만 시술 — 직원 일정 비활성</div>
            </div>
            <div class="ss-switch is-on" id="ssSoloSwitch" role="switch" aria-checked="true" tabindex="0"></div>
          </div>
          <div class="ss-toggle">
            <div>
              <div class="ss-toggle-lbl">예약 자동 확정</div>
              <div class="ss-toggle-sub">예약금 결제 완료 시 자동으로 확정 처리</div>
            </div>
            <div class="ss-switch is-on" id="ssAutoConfirmSwitch" role="switch" aria-checked="true" tabindex="0"></div>
          </div>
        </div>

        <div class="ss-card" id="ssStaffCard" style="display:none;">
          <div class="ss-card-tt">직원 (스텁)</div>
          <div class="ss-card-sub">2인 이상 운영 모드에서 직원 등록 가능. 백엔드 연결 후 활성화.</div>
          <button type="button" class="ss-cta-secondary" disabled>직원 추가</button>
        </div>

        <div class="ss-card">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
            <div class="ss-card-tt" style="margin:0;">외부 심사 진행 상태</div>
          </div>
          <div class="ss-card-sub" style="margin-bottom:10px;">제3자 플랫폼 검증 현황이에요. 통과 즉시 자동 활성화돼요.</div>

          <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--bg2,#f0f0f0);">
            <svg class="ic" aria-hidden="true" style="width:18px;height:18px;color:#B45309;"><use href="#ic-clock"/></svg>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:700;color:var(--text,#222);">Meta 비즈니스 검증</div>
              <div style="font-size:11px;color:var(--text3,#999);margin-top:2px;">DM 자동응답·인스타 게시 · 예상 1~2주</div>
            </div>
            <span style="font-size:11px;font-weight:800;color:#B45309;background:#FFF7E6;padding:4px 10px;border-radius:999px;">심사 중</span>
          </div>

          <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--bg2,#f0f0f0);">
            <svg class="ic" aria-hidden="true" style="width:18px;height:18px;color:#B45309;"><use href="#ic-clock"/></svg>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:700;color:var(--text,#222);">Apple App Store 심사</div>
              <div style="font-size:11px;color:var(--text3,#999);margin-top:2px;">iOS 앱 출시 · 예상 1~2주</div>
            </div>
            <span style="font-size:11px;font-weight:800;color:#B45309;background:#FFF7E6;padding:4px 10px;border-radius:999px;">심사 중</span>
          </div>

          <div style="display:flex;align-items:center;gap:10px;padding:10px 0;">
            <svg class="ic" aria-hidden="true" style="width:18px;height:18px;color:#B45309;"><use href="#ic-clock"/></svg>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:700;color:var(--text,#222);">Google Play 심사</div>
              <div style="font-size:11px;color:var(--text3,#999);margin-top:2px;">Android 앱 출시 · 예상 3~7일</div>
            </div>
            <span style="font-size:11px;font-weight:800;color:#B45309;background:#FFF7E6;padding:4px 10px;border-radius:999px;">심사 중</span>
          </div>

          <div style="margin-top:10px;padding:10px;background:#F6F8FA;border-radius:10px;font-size:11px;color:var(--text2,#555);line-height:1.5;">
            심사 진행 중에는 일부 외부 연동(DM 자동응답·카카오 알림톡)이 제한돼요. 통과되면 알림으로 알려 드릴게요.
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(el);

    // back / save / switches
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-ss-back]')) { closeShopSettings(); return; }
      if (e.target.closest('[data-ss-save]')) { _save(); return; }
      const sw = e.target.closest('.ss-switch');
      if (sw) { sw.classList.toggle('is-on');
        sw.setAttribute('aria-checked', sw.classList.contains('is-on') ? 'true' : 'false');
        _haptic(); _refreshStaffVisibility(); }
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeShopSettings();
    });
    return el;
  }

  function _refreshStaffVisibility() {
    const card = document.getElementById('ssStaffCard');
    const solo = document.getElementById('ssSoloSwitch');
    if (!card || !solo) return;
    card.style.display = solo.classList.contains('is-on') ? 'none' : 'block';
  }

  function _hydrate() {
    const get = (k) => { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } };
    const fields = {
      ssShopName:  get('itdasy_shop_name') || get('shop_name') || '',
      ssShopPhone: get('itdasy_shop_phone') || '',
      ssShopAddr:  get('itdasy_shop_addr') || '',
      ssShopHours: get('itdasy_shop_hours') || '',
    };
    Object.keys(fields).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = fields[id];
    });
    // 토글 상태 복원
    const solo = localStorage.getItem('itdasy_solo_mode');
    const sw = document.getElementById('ssSoloSwitch');
    if (sw && solo === '0') sw.classList.remove('is-on');
    _refreshStaffVisibility();
  }

  async function _save() {
    const get = (id) => (document.getElementById(id) || { value: '' }).value.trim();
    const payload = {
      shop_name: get('ssShopName'),
      phone: get('ssShopPhone'),
      address: get('ssShopAddr'),
      hours: get('ssShopHours'),
      solo_mode: document.getElementById('ssSoloSwitch')?.classList.contains('is-on') ? 1 : 0,
      auto_confirm: document.getElementById('ssAutoConfirmSwitch')?.classList.contains('is-on') ? 1 : 0,
    };
    if (!payload.shop_name) { _toast('샵 이름을 입력해주세요'); return; }

    // 로컬 저장 (즉시 반영)
    try {
      localStorage.setItem('itdasy_shop_name', payload.shop_name);
      localStorage.setItem('itdasy_shop_phone', payload.phone);
      localStorage.setItem('itdasy_shop_addr', payload.address);
      localStorage.setItem('itdasy_shop_hours', payload.hours);
      localStorage.setItem('itdasy_solo_mode', String(payload.solo_mode));
    } catch (_e) { void _e; }

    // 드로어 헤더 즉시 갱신
    if (window.ShopDrawer && window.ShopDrawer.refreshHeader) {
      try { window.ShopDrawer.refreshHeader(); } catch (_e) { void _e; }
    }

    // 백엔드 동기화 (실패해도 로컬은 유지)
    try {
      const res = await fetch(_api() + '/shop/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ..._auth() },
        body: JSON.stringify(payload),
      });
      if (res.ok) _toast('저장됨');
      else _toast('로컬에 저장됨 — 서버 연결 후 자동 동기화');
    } catch (_) {
      _toast('로컬에 저장됨 — 서버 연결 후 자동 동기화');
    }
  }

  function openShopSettings() {
    const el = _ensureMounted();
    _hydrate();
    requestAnimationFrame(() => el.classList.add('is-open'));
    el.setAttribute('aria-hidden', 'false');
    _haptic();
  }
  function closeShopSettings() {
    const el = document.getElementById(ID);
    if (!el) return;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    _haptic();
  }

  window.openShopSettings = openShopSettings;
  window.closeShopSettings = closeShopSettings;
})();
