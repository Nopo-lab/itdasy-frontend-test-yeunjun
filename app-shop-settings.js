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
  async function _safeGet(key) {
    try {
      if (window.SecureStorage) return await window.SecureStorage.get(key);
      return localStorage.getItem(key) || '';
    } catch (_) { return ''; }
  }
  async function _safeSet(key, value) {
    if (window.SecureStorage) return window.SecureStorage.set(key, value);
    localStorage.setItem(key, value || '');
  }

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
          <i class="ph-duotone ph-arrow-left" aria-hidden="true"></i>
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
          <div class="ss-row" style="flex-direction:column;align-items:stretch;"><span class="lbl" style="margin-bottom:8px;">영업시간 (요일별)</span>
            <div id="ssShopHoursGrid" style="display:flex;flex-direction:column;gap:6px;"></div>
          </div>
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
          <div class="ss-card-tt">직원</div>
          <div class="ss-card-sub" id="ssStaffSub">2인 이상 운영 모드에서 직원 등록 가능 (플랜에 따라 인원 한도 다름).</div>
          <div id="ssStaffList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;"></div>
          <button type="button" class="ss-cta-secondary" id="ssAddStaffBtn">+ 직원 추가</button>
        </div>

        <div class="ss-card">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
            <div class="ss-card-tt" style="margin:0;">외부 심사 진행 상태</div>
          </div>
          <div class="ss-card-sub" style="margin-bottom:10px;">제3자 플랫폼 검증 현황이에요. 통과 즉시 자동 활성화돼요.</div>

          <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--bg2,#f0f0f0);">
            <i class="ph-duotone ph-clock" aria-hidden="true"></i>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:700;color:var(--text,#222);">Meta 비즈니스 검증</div>
              <div style="font-size:11px;color:var(--text3,#999);margin-top:2px;">DM 자동응답·인스타 게시 · 예상 1~2주</div>
            </div>
            <span style="font-size:11px;font-weight:800;color:#B45309;background:#FFF7E6;padding:4px 10px;border-radius:999px;">심사 중</span>
          </div>

          <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--bg2,#f0f0f0);">
            <i class="ph-duotone ph-clock" aria-hidden="true"></i>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:700;color:var(--text,#222);">Apple App Store 심사</div>
              <div style="font-size:11px;color:var(--text3,#999);margin-top:2px;">iOS 앱 출시 · 예상 1~2주</div>
            </div>
            <span style="font-size:11px;font-weight:800;color:#B45309;background:#FFF7E6;padding:4px 10px;border-radius:999px;">심사 중</span>
          </div>

          <div style="display:flex;align-items:center;gap:10px;padding:10px 0;">
            <i class="ph-duotone ph-clock" aria-hidden="true"></i>
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
      // [2026-05-12 QA #11] 직원 추가 버튼 활성화 — 백엔드 /staff API 호출.
      if (e.target.closest('#ssAddStaffBtn')) { _onAddStaff(); return; }
      const _staffDel = e.target.closest('[data-staff-del]');
      if (_staffDel) { _onDeleteStaff(_staffDel.dataset.staffDel); return; }
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
    const visible = !solo.classList.contains('is-on');
    card.style.display = visible ? 'block' : 'none';
    if (visible) _hydrateStaffList().catch(() => {});
  }

  async function _hydrateStaffList() {
    const list = document.getElementById('ssStaffList');
    const sub  = document.getElementById('ssStaffSub');
    if (!list) return;
    list.innerHTML = '<div style="font-size:12px;color:var(--text3,#999);">불러오는 중…</div>';
    try {
      const res = await fetch(_api() + '/staff', { headers: { ..._auth() } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : (data || []);
      const limit = data.plan_limit != null ? data.plan_limit : null;
      const plan = data.plan || '';
      if (sub && limit !== null) {
        sub.textContent = `현재 ${items.length}명 등록 · ${plan || '플랜'} 한도 ${limit}명. 한도 초과 시 Pro/Premium 업그레이드 필요.`;
      }
      if (!items.length) {
        list.innerHTML = '<div style="font-size:12px;color:var(--text3,#999);">아직 등록된 직원이 없어요.</div>';
        return;
      }
      list.innerHTML = items.map(s => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#F6F8FA;border-radius:10px;">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${(s.color || '#ccc')};"></span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:700;color:var(--text,#222);">${_esc(s.name || '이름없음')}</div>
            <div style="font-size:11px;color:var(--text3,#999);">${_esc(s.role || '')}</div>
          </div>
          <button type="button" data-staff-del="${s.id}" style="background:transparent;border:none;color:#dc2626;font-size:11px;cursor:pointer;">삭제</button>
        </div>
      `).join('');
    } catch (e) {
      list.innerHTML = `<div style="font-size:12px;color:#dc2626;">직원 목록 불러오기 실패 (${e && e.message || ''})</div>`;
    }
  }

  function _esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  async function _onAddStaff() {
    const name = prompt('직원 이름을 입력해주세요 (예: 이지수)');
    if (!name || !name.trim()) return;
    const role = prompt('역할 (선택사항, 예: 디자이너) — 비워도 됩니다') || '';
    _haptic();
    try {
      const res = await fetch(_api() + '/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ..._auth() },
        body: JSON.stringify({ name: name.trim(), role: role.trim() || null }),
      });
      if (!res.ok) {
        let detail = '';
        try { const j = await res.json(); detail = j.detail || ''; } catch (_e) { void _e; }
        if (res.status === 402 || res.status === 403) {
          _toast(detail || '플랜 한도를 초과했어요. Pro/Premium 업그레이드가 필요해요.');
        } else {
          _toast('직원 추가 실패 — ' + (detail || ('HTTP ' + res.status)));
        }
        return;
      }
      _toast('직원 추가 완료');
      await _hydrateStaffList();
    } catch (e) {
      _toast('직원 추가 실패 — ' + (e && e.message || ''));
    }
  }

  async function _onDeleteStaff(id) {
    if (!id) return;
    if (!confirm('이 직원을 삭제할까요?')) return;
    try {
      const res = await fetch(_api() + '/staff/' + encodeURIComponent(id), {
        method: 'DELETE',
        headers: { ..._auth() },
      });
      if (!res.ok) { _toast('삭제 실패 (HTTP ' + res.status + ')'); return; }
      _toast('삭제 완료');
      await _hydrateStaffList();
    } catch (e) {
      _toast('삭제 실패 — ' + (e && e.message || ''));
    }
  }

  // [2026-05-12 QA #10] 영업시간 자유텍스트 → 요일별 캘린더 UI.
  // business_hours_json 스키마: {"mon":{"open":"10:00","close":"20:00","off":false}, ...}
  const _DAY_KEYS = ['mon','tue','wed','thu','fri','sat','sun'];
  const _DAY_LABELS = { mon:'월', tue:'화', wed:'수', thu:'목', fri:'금', sat:'토', sun:'일' };

  function _defaultHours() {
    const out = {};
    _DAY_KEYS.forEach(k => { out[k] = { open: '10:00', close: '20:00', off: (k === 'sun') }; });
    return out;
  }

  // [2026-05-13 QA] 캘린더/예약앱 느낌 — 큰 토글 + native time picker + 일괄 적용 + 시각적 휴무
  function _renderHoursGrid(hours) {
    const wrap = document.getElementById('ssShopHoursGrid');
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="ss-hr-bulk" style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
        <button type="button" data-hr-bulk="weekday" style="flex:1;min-width:90px;padding:8px;border:1px solid #E5E5EA;border-radius:10px;background:#F8F9FB;font-size:12px;font-weight:700;color:#444;cursor:pointer;">평일 일괄 적용</button>
        <button type="button" data-hr-bulk="weekend" style="flex:1;min-width:90px;padding:8px;border:1px solid #E5E5EA;border-radius:10px;background:#F8F9FB;font-size:12px;font-weight:700;color:#444;cursor:pointer;">주말 일괄 적용</button>
        <button type="button" data-hr-bulk="all" style="flex:1;min-width:90px;padding:8px;border:1px solid #E5E5EA;border-radius:10px;background:#FCEEF1;font-size:12px;font-weight:700;color:#D95F70;cursor:pointer;">모든 요일 적용</button>
      </div>
      ${_DAY_KEYS.map(k => {
        const h = hours[k] || { open: '10:00', close: '20:00', off: false };
        const off = !!h.off;
        return `
          <div class="ss-hours-row" data-day="${k}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:${off ? '#FAFAFA' : '#fff'};border:1px solid ${off ? 'rgba(217,95,112,0.15)' : 'rgba(0,0,0,0.06)'};border-radius:14px;margin-bottom:8px;transition:background 0.15s;">
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:44px;flex-shrink:0;">
              <span style="font-size:15px;font-weight:800;color:${off ? '#bbb' : 'var(--text,#222)'};line-height:1;">${_DAY_LABELS[k]}</span>
              <span style="font-size:10px;color:${off ? '#bbb' : 'var(--text3,#999)'};margin-top:2px;">요일</span>
            </div>
            <div style="flex:1;display:flex;align-items:center;gap:6px;${off ? 'opacity:0.35;pointer-events:none;' : ''}">
              <input type="time" data-hr-field="open" value="${h.open || '10:00'}" ${off ? 'disabled' : ''}
                style="flex:1;min-width:0;height:42px;padding:0 10px;border:1.5px solid #E5E5EA;border-radius:10px;font-size:15px;font-weight:600;text-align:center;background:#fff;-webkit-appearance:none;">
              <span style="font-size:12px;color:var(--text3,#999);font-weight:600;">~</span>
              <input type="time" data-hr-field="close" value="${h.close || '20:00'}" ${off ? 'disabled' : ''}
                style="flex:1;min-width:0;height:42px;padding:0 10px;border:1.5px solid #E5E5EA;border-radius:10px;font-size:15px;font-weight:600;text-align:center;background:#fff;-webkit-appearance:none;">
            </div>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;flex-shrink:0;padding:6px 10px;border-radius:999px;background:${off ? 'var(--accent2,#D95F70)' : 'transparent'};color:${off ? '#fff' : 'var(--text3,#888)'};font-size:11px;font-weight:700;border:1px solid ${off ? 'var(--accent2,#D95F70)' : 'transparent'};">
              <input type="checkbox" data-hr-field="off" ${off ? 'checked' : ''} style="display:none;">
              <span>${off ? '✕ 휴무' : '휴무'}</span>
            </label>
          </div>
        `;
      }).join('')}
      <div style="margin-top:6px;padding:10px 12px;background:rgba(241,128,145,0.05);border-radius:10px;font-size:11px;color:#888;line-height:1.5;">💡 시간 칸을 누르면 모바일에서 시간 휠이 떠요. 휴무 토글로 요일별 영업/휴무를 바꿀 수 있어요.</div>
    `;
    // off 토글 → 행 전체 dim + 휴무 배지 색
    wrap.querySelectorAll('[data-hr-field="off"]').forEach(chk => {
      chk.addEventListener('change', () => {
        _renderHoursGrid(_collectHoursForceFresh());
      });
    });
    // 클릭으로 토글 (label 전체 클릭 가능하게)
    wrap.querySelectorAll('label').forEach(lbl => {
      lbl.addEventListener('click', (e) => {
        const chk = lbl.querySelector('[data-hr-field="off"]');
        if (chk && e.target !== chk) {
          e.preventDefault();
          chk.checked = !chk.checked;
          chk.dispatchEvent(new Event('change'));
        }
      });
    });
    // 일괄 적용 — 첫 번째 활성 요일의 open/close 시간을 weekday(월~금) / weekend(토일) / all 에 복사
    wrap.querySelectorAll('[data-hr-bulk]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.hrBulk;
        const cur = _collectHoursForceFresh();
        // 기준 요일: 평일=mon, 주말=sat, all=mon
        const refDay = (target === 'weekend') ? 'sat' : 'mon';
        const ref = cur[refDay] || { open: '10:00', close: '20:00', off: false };
        const setKeys = target === 'weekday' ? ['mon','tue','wed','thu','fri']
                       : target === 'weekend' ? ['sat','sun']
                       : _DAY_KEYS;
        setKeys.forEach(k => { cur[k] = { open: ref.open, close: ref.close, off: ref.off }; });
        _renderHoursGrid(cur);
        try { _haptic(); } catch (_e) { void _e; }
      });
    });
  }

  function _collectHoursForceFresh() {
    return _collectHours() || _defaultHours();
  }

  function _collectHours() {
    const wrap = document.getElementById('ssShopHoursGrid');
    if (!wrap) return null;
    const out = {};
    wrap.querySelectorAll('.ss-hours-row').forEach(row => {
      const d = row.dataset.day;
      const open = row.querySelector('[data-hr-field="open"]')?.value || '10:00';
      const close = row.querySelector('[data-hr-field="close"]')?.value || '20:00';
      const off = !!row.querySelector('[data-hr-field="off"]')?.checked;
      out[d] = { open, close, off };
    });
    return out;
  }

  async function _hydrate() {
    const get = (k) => { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } };
    const fields = {
      ssShopName:  get('itdasy_shop_name') || get('shop_name') || '',
      ssShopPhone: await _safeGet('itdasy_shop_phone'),
      ssShopAddr:  await _safeGet('itdasy_shop_addr'),
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
    // 영업시간 hydrate — 백엔드 GET /shop/settings 우선, 실패 시 localStorage, 그것도 없으면 default
    let hours = _defaultHours();
    try {
      const res = await fetch(_api() + '/shop/settings', { headers: { ..._auth() } });
      if (res.ok) {
        const data = await res.json();
        let bh = data && data.business_hours_json;
        if (typeof bh === 'string') { try { bh = JSON.parse(bh); } catch (_e) { bh = null; } }
        if (bh && typeof bh === 'object' && !Array.isArray(bh)) {
          _DAY_KEYS.forEach(k => { if (bh[k]) hours[k] = { ...hours[k], ...bh[k] }; });
        }
      }
    } catch (_e) { /* ignore — fallback to default */ }
    try {
      const localBH = localStorage.getItem('itdasy_business_hours_json');
      if (localBH) {
        const parsed = JSON.parse(localBH);
        if (parsed && typeof parsed === 'object') {
          _DAY_KEYS.forEach(k => { if (parsed[k]) hours[k] = { ...hours[k], ...parsed[k] }; });
        }
      }
    } catch (_e) { /* ignore */ }
    _renderHoursGrid(hours);
  }

  async function _save() {
    const get = (id) => (document.getElementById(id) || { value: '' }).value.trim();
    const hoursObj = _collectHours();
    // 사람이 읽을 수 있는 hours 문자열 (백엔드 free-text 필드 호환용)
    const _hrText = hoursObj ? _DAY_KEYS.filter(k => !hoursObj[k].off)
      .map(k => `${_DAY_LABELS[k]} ${hoursObj[k].open}-${hoursObj[k].close}`).join(', ') : '';
    const payload = {
      shop_name: get('ssShopName'),
      phone: get('ssShopPhone'),
      address: get('ssShopAddr'),
      hours: _hrText,
      business_hours_json: hoursObj ? JSON.stringify(hoursObj) : null,
      solo_mode: document.getElementById('ssSoloSwitch')?.classList.contains('is-on') ? 1 : 0,
      auto_confirm: document.getElementById('ssAutoConfirmSwitch')?.classList.contains('is-on') ? 1 : 0,
    };
    if (!payload.shop_name) { _toast('샵 이름을 입력해주세요'); return; }

    // 로컬 저장 (즉시 반영)
    try {
      localStorage.setItem('itdasy_shop_name', payload.shop_name);
      await _safeSet('itdasy_shop_phone', payload.phone);
      await _safeSet('itdasy_shop_addr', payload.address);
      localStorage.setItem('itdasy_shop_hours', _hrText);
      if (payload.business_hours_json) localStorage.setItem('itdasy_business_hours_json', payload.business_hours_json);
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
    _hydrate().catch(() => {});
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
