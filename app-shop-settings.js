/* ───────────────────────────────────────────────────────────
   app-shop-settings.js — 샵 정보 서브화면
   2026-04-28 신규. 2026-05-23 직원 기능 제거 (1인샵 전용).
   - 샵 이름·전화·주소·영업시간·자동확정 토글
   - PUT /shop/settings (백엔드 미구현 시 graceful)
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

  // [2026-07-05 리디자인] 심사 상태 행 — status: 'progress'(로즈 필) | 'ok'(초록 필)
  function _reviewRowHTML(title, sub, status) {
    const ok = status === 'ok';
    const icon = ok ? 'ic-check' : 'ic-clock';
    const badge = ok ? 'sv2-badge--ok' : 'sv2-badge--progress';
    return `
      <div class="sv2-review-row">
        <span class="sv2-review-ic"><svg width="18" height="18" aria-hidden="true"><use href="#${icon}"/></svg></span>
        <div style="flex:1;min-width:0;">
          <div class="t1">${title}</div>
          <div class="t2">${sub}</div>
        </div>
        <span class="sv2-badge ${badge}"><svg width="12" height="12" aria-hidden="true"><use href="#${icon}"/></svg>${ok ? '승인됨' : '심사 중'}</span>
      </div>
    `;
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
          <svg width="14" height="14" aria-hidden="true"><use href="#ic-chevron-left"/></svg>
        </button>
        <div class="ss-title">샵 정보</div>
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
          <div class="ss-row" style="flex-direction:column;align-items:stretch;min-width:0;"><span class="lbl" style="flex:0 0 auto;margin-bottom:8px;">영업시간</span>
            <div id="ssShopHoursGrid" style="display:flex;flex-direction:column;gap:6px;min-width:0;width:100%;box-sizing:border-box;"></div>
          </div>
        </div>

        <div class="ss-card">
          <div class="ss-card-tt">운영 모드</div>
          <div class="ss-toggle">
            <div>
              <div class="ss-toggle-lbl">예약 자동 확정</div>
              <div class="ss-toggle-sub">손님 입금 신호가 오면 원장 확인 없이 자동으로 예약을 확정해요. 꺼두면 [입금 확인+예약 확정] 버튼으로 직접 확정해요(기본).</div>
            </div>
            <div class="ss-switch" id="ssAutoConfirmSwitch" role="switch" aria-checked="false" tabindex="0"></div>
          </div>
          <div class="ss-toggle" style="margin-top:12px;">
            <div>
              <div class="ss-toggle-lbl">예약 알림톡 자동발송</div>
              <div class="ss-toggle-sub">예약 확인·전날 리마인드를 고객에게 카카오 알림톡으로 자동 발송해요. 켜면 발송돼요.</div>
            </div>
            <div class="ss-switch" id="ssAlimtalkSwitch" role="switch" aria-checked="false" tabindex="0"></div>
          </div>
        </div>

        <div class="ss-card">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
            <div class="ss-card-tt" style="margin:0;">외부 심사 진행 상태</div>
          </div>
          <div class="ss-card-sub" style="margin-bottom:10px;">제3자 플랫폼 검증 현황이에요. 통과 즉시 자동 활성화돼요.</div>
          ${_reviewRowHTML('Meta 비즈니스 검증', 'DM 자동응답·인스타 게시 · 예상 1~2주', 'progress')}
          ${_reviewRowHTML('Apple App Store 심사', 'iOS 앱 출시 · 예상 1~2주', 'progress')}
          ${_reviewRowHTML('Google Play 심사', 'Android 앱 출시 · 예상 3~7일', 'progress')}
          <div class="sv2-note">
            심사 진행 중에는 일부 외부 연동(DM 자동응답·카카오 알림톡)이 제한돼요. 통과되면 알림으로 알려 드릴게요.
          </div>
        </div>

        <button type="button" class="sv2-cta" data-ss-save>저장</button>
      </div>
    `;
    document.body.appendChild(el);

    // back / save / switches
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-ss-back]')) { closeShopSettings(); return; }
      if (e.target.closest('[data-ss-save]')) { _save(); return; }
      const sw = e.target.closest('.ss-switch');
      if (sw) {
        // [출시게이트 2026-08-06] 채널이 연결 안 된 토글은 켜지지 않는다.
        //   회색으로만 보여주고 클릭은 되면, 켜놓고 "발송되겠지" 하고 기다리게 된다.
        if (sw.classList.contains('is-disabled')) {
          _toast('아직 연결되지 않은 채널이라 켤 수 없어요');
          return;
        }
        sw.classList.toggle('is-on');
        sw.setAttribute('aria-checked', sw.classList.contains('is-on') ? 'true' : 'false');
        _haptic();
      }
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeShopSettings();
    });
    return el;
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

  // [2026-07-05 리디자인 v2 · 네이버식 프리셋] "매일 같아요 / 평일·주말 달라요 / 요일별로 달라요" 3모드.
  //   매일·평일주말 = 요일 칩(영업 on/off) + 시간 select 1~2줄. 요일별 = 기존 행+인라인 확장.
  //   데이터 스키마(business_hours_json)·저장 로직은 기존 그대로 — 모드는 UI 상태일 뿐, 저장 시 요일별로 풀어서 저장.
  let _hours = null;        // 편집 중 영업시간 상태 (정본)
  let _expandedDay = null;  // 인라인 확장이 열린 요일 (요일별 모드, 한 번에 하나만)
  let _hoursMode = null;    // 'same' | 'wd' | 'day' — null이면 데이터에서 추론

  const _MODES = [['same', '매일 같아요'], ['wd', '평일·주말 달라요'], ['day', '요일별로 달라요']];
  const _WD = _DAY_KEYS.slice(0, 5);
  const _WE = _DAY_KEYS.slice(5);

  function _sig(k) { return `${_hours[k].open}~${_hours[k].close}`; }
  function _inferMode() {
    const on = _DAY_KEYS.filter(k => !_hours[k].off);
    if (!on.length || on.every(k => _sig(k) === _sig(on[0]))) return 'same';
    const wd = _WD.filter(k => !_hours[k].off);
    const we = _WE.filter(k => !_hours[k].off);
    if (wd.every(k => _sig(k) === _sig(wd[0])) && we.every(k => _sig(k) === _sig(we[0]))) return 'wd';
    return 'day';
  }
  // 모드 전환 시 그룹 대표 시간(첫 영업일 기준)으로 데이터 정규화
  function _normalizeToMode(mode) {
    const spread = (days, refDays) => {
      const ref = _hours[refDays.find(k => !_hours[k].off) || refDays[0]];
      days.forEach(d => { _hours[d] = { ..._hours[d], open: ref.open, close: ref.close }; });
    };
    if (mode === 'same') spread(_DAY_KEYS, _DAY_KEYS);
    if (mode === 'wd') { spread(_WD, _WD); spread(_WE, _WE); }
  }

  function _timeOpts(selected, isClose) {
    const out = [];
    const from = isClose ? 1 : 0;
    const to = isClose ? 48 : 47; // open 00:00~23:30 / close 00:30~24:00
    for (let i = from; i <= to; i++) {
      const v = `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`;
      out.push(`<option value="${v}"${v === selected ? ' selected' : ''}>${v}</option>`);
    }
    return out.join('');
  }

  function _hoursRowHTML(k) {
    const h = _hours[k] || { open: '10:00', close: '20:00', off: false };
    const off = !!h.off;
    const editing = _expandedDay === k && !off;
    return `
      <div class="sv2-hr__row${off ? ' is-off' : ''}" data-day="${k}">
        <span class="sv2-hr__day">${_DAY_LABELS[k]}</span>
        <button type="button" class="sv2-hr__time${editing ? ' is-editing' : ''}" data-hr-time="${k}" ${off ? 'disabled' : ''}>${off ? '휴무' : `${h.open} ~ ${h.close}`}</button>
        <div class="ss-switch${off ? '' : ' is-on'}" data-hr-switch="${k}" role="switch" aria-checked="${off ? 'false' : 'true'}" aria-label="${_DAY_LABELS[k]}요일 영업 여부" tabindex="0"></div>
      </div>
      ${editing ? `
      <div class="sv2-hr__expand" data-hr-expand="${k}">
        <div class="sv2-hr__selects">
          <select class="sv2-hr__select" data-hr-sel="open" aria-label="시작 시간">${_timeOpts(h.open, false)}</select>
          <span class="sv2-hr__tilde">~</span>
          <select class="sv2-hr__select" data-hr-sel="close" aria-label="종료 시간">${_timeOpts(h.close, true)}</select>
        </div>
        <button type="button" class="sv2-hr__applyall" data-hr-applyall>이 시간을 모든 요일에 적용</button>
      </div>` : ''}
    `;
  }

  // 매일/평일·주말 모드용: 그룹 시간 select 한 줄
  function _groupRowHTML(label, days, group) {
    const h = _hours[days.find(k => !_hours[k].off) || days[0]];
    return `
      <div class="sv2-hm__timerow">
        <span class="sv2-hm__grouplbl">${label}</span>
        <select class="sv2-hr__select" data-hr-gsel="open" data-hr-group="${group}" aria-label="${label} 시작 시간">${_timeOpts(h.open, false)}</select>
        <span class="sv2-hr__tilde">~</span>
        <select class="sv2-hr__select" data-hr-gsel="close" data-hr-group="${group}" aria-label="${label} 종료 시간">${_timeOpts(h.close, true)}</select>
      </div>`;
  }

  function _renderHoursGrid(hours) {
    if (hours) { _hours = hours; _hoursMode = null; }
    if (!_hours) _hours = _defaultHours();
    if (!_hoursMode) _hoursMode = _inferMode();
    const wrap = document.getElementById('ssShopHoursGrid');
    if (!wrap) return;
    const seg = `<div class="sv2-hm__seg">${_MODES.map(([v, l]) =>
      `<button type="button" class="sv2-hm__segbtn${_hoursMode === v ? ' is-on' : ''}" data-hr-mode="${v}">${l}</button>`).join('')}</div>`;
    let body;
    if (_hoursMode === 'day') {
      body = _DAY_KEYS.map(_hoursRowHTML).join('');
    } else {
      const chips = `<div class="sv2-hm__chips">${_DAY_KEYS.map(k =>
        `<button type="button" class="sv2-hm__chip${_hours[k].off ? '' : ' is-on'}" data-hr-chip="${k}" aria-pressed="${_hours[k].off ? 'false' : 'true'}">${_DAY_LABELS[k]}</button>`).join('')}</div>
        <div class="sv2-hm__hint">영업하는 요일만 켜 두세요</div>`;
      body = chips + (_hoursMode === 'same'
        ? _groupRowHTML('매일', _DAY_KEYS, 'all')
        : _groupRowHTML('평일', _WD, 'wd') + _groupRowHTML('주말', _WE, 'we'));
    }
    wrap.innerHTML = seg + body;
    _bindHoursEvents(wrap);
  }

  function _bindHoursEvents(wrap) {
    // 모드 세그먼트
    wrap.querySelectorAll('[data-hr-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.hrMode;
        if (v === _hoursMode) return;
        _normalizeToMode(v);
        _hoursMode = v;
        _expandedDay = null;
        _renderHoursGrid();
        _haptic();
      });
    });
    // 요일 칩 (매일/평일·주말 모드) — 켜짐=영업
    wrap.querySelectorAll('[data-hr-chip]').forEach(chip => {
      chip.addEventListener('click', () => {
        const k = chip.dataset.hrChip;
        _hours[k].off = !_hours[k].off;
        _renderHoursGrid();
        _haptic();
      });
    });
    // 그룹 시간 select — 그룹 소속 요일 전체에 반영
    wrap.querySelectorAll('[data-hr-gsel]').forEach(sel => {
      sel.addEventListener('change', () => {
        const days = sel.dataset.hrGroup === 'wd' ? _WD : sel.dataset.hrGroup === 'we' ? _WE : _DAY_KEYS;
        days.forEach(d => { _hours[d][sel.dataset.hrGsel] = sel.value; });
      });
    });
    // 시간 텍스트 탭 → 해당 행 아래 인라인 확장 (다른 행 확장은 자동으로 닫힘)
    wrap.querySelectorAll('[data-hr-time]').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.hrTime;
        _expandedDay = (_expandedDay === k) ? null : k;
        _renderHoursGrid();
        _haptic();
      });
    });
    // 초록 토글 = 영업/휴무. stopPropagation — 오버레이 공통 .ss-switch 핸들러와 중복 토글 방지.
    wrap.querySelectorAll('[data-hr-switch]').forEach(sw => {
      sw.addEventListener('click', (e) => {
        e.stopPropagation();
        const k = sw.dataset.hrSwitch;
        _hours[k].off = !_hours[k].off;
        if (_hours[k].off && _expandedDay === k) _expandedDay = null;
        _renderHoursGrid();
        _haptic();
      });
    });
    const box = wrap.querySelector('[data-hr-expand]');
    if (!box) return;
    const k = box.dataset.hrExpand;
    box.querySelectorAll('[data-hr-sel]').forEach(sel => {
      sel.addEventListener('change', () => {
        _hours[k][sel.dataset.hrSel] = sel.value;
        const t = wrap.querySelector(`[data-hr-time="${k}"]`);
        if (t) t.textContent = `${_hours[k].open} ~ ${_hours[k].close}`;
      });
    });
    box.querySelector('[data-hr-applyall]')?.addEventListener('click', () => {
      const ref = _hours[k];
      _DAY_KEYS.forEach(d => { _hours[d] = { ..._hours[d], open: ref.open, close: ref.close }; });
      _renderHoursGrid();
      _toast('모든 요일에 적용했어요');
      _haptic();
    });
  }

  function _collectHours() {
    return _hours ? JSON.parse(JSON.stringify(_hours)) : null;
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
    // [2026-05-23] 1인샵 토글 복원 + _refreshStaffVisibility 제거 — 직원 기능 폐지.
    // 영업시간 hydrate — 백엔드 GET /shop/settings 우선, 실패 시 localStorage, 그것도 없으면 default
    let hours = _defaultHours();
    let _serverHadHours = false; // [보안감사 M-9] 서버가 영업시간을 주면 로컬로 덮지 않는다(다중기기 stale 롤백 방지)
    try {
      const res = await fetch(_api() + '/shop/settings', { headers: { ..._auth() } });
      if (res.ok) {
        const data = await res.json();
        // [출시감사 2026-08-01] 전화·주소를 서버에서 **한 번도 다시 읽지 않던** 것 수정.
        //   _hydrate 는 두 값을 로컬(itdasy_shop_phone/addr)에서만 읽었는데, 그 키는
        //   로그아웃 시 _USER_KEY_PREFIXES 로 전부 지워진다. 재로그인하거나 폰을 바꾸면
        //   입력칸이 비어 보이고, 영업시간만 고쳐 저장하는 순간 빈 문자열이 PUT 돼
        //   **서버에 있던 전화·주소가 지워졌다.** (백엔드 shop.py 의 exclude_none 은 "" 를 못 거른다)
        //   그러면 DM 자동응답의 위치 안내가 주소를 못 찾는다.
        //   로컬이 비어 있을 때만 서버값으로 채운다 — 방금 입력 중인 값을 덮지 않으려고.
        try {
          [['ssShopPhone', 'phone'], ['ssShopAddr', 'address']].forEach(([id, key]) => {
            const el = document.getElementById(id);
            const sv = (data && data[key] != null) ? String(data[key]) : '';
            if (el && !el.value.trim() && sv.trim()) el.value = sv;
          });
        } catch (_e) { void _e; }

        let bh = data && data.business_hours_json;
        if (typeof bh === 'string') { try { bh = JSON.parse(bh); } catch (_e) { bh = null; } }
        if (bh && typeof bh === 'object' && !Array.isArray(bh)) {
          _DAY_KEYS.forEach(k => { if (bh[k]) hours[k] = { ...hours[k], ...bh[k] }; });
          _serverHadHours = true;
        }
        // [2026-07-25 예약QA F5] 알림톡 자동발송 스위치 서버값 반영.
        const _alSw = document.getElementById('ssAlimtalkSwitch');
        if (_alSw) {
          const _on = !!data.alimtalk_auto_enabled;
          _alSw.classList.toggle('is-on', _on);
          _alSw.setAttribute('aria-checked', _on ? 'true' : 'false');
        }
        // [출시게이트 2026-08-06] **아직 안 되는 걸 된다고 말하지 않는다.**
        //   토글 설명이 "켜면 발송돼요" 인데, 알림톡 채널이 연결 안 돼 있으면 켜도
        //   아무것도 안 나간다. 실패 알림조차 안 만든다(도배 방지로 일부러 그렇게 돼 있다).
        //   원장님은 손님에게 예약 확인이 갔다고 믿는다 — 잇비 문자에서 고쳤던
        //   "조용히 아무것도 안 함" 과 같은 종류라 같은 방식으로 고친다.
        const _ch = data.channels || null;
        if (_ch && _ch.alimtalk === false && _alSw) {
          _alSw.classList.add('is-disabled');
          _alSw.setAttribute('aria-disabled', 'true');
          const _sub = _alSw.closest('.ss-toggle')?.querySelector('.ss-toggle-sub');
          if (_sub) {
            _sub.textContent = '카카오 알림톡 채널이 아직 연결되지 않았어요. '
              + '지금 켜도 손님에게는 발송되지 않아요 — 연결되면 알려 드릴게요.';
            _sub.style.color = 'var(--warn, #C2410C)';
          }
        }
        // [C-6 2026-07-27] 예약 자동확정 스위치 서버값 반영. 백엔드에 auto_confirm 컬럼을 신설해
        //   이제 GET 에서 실제 값을 내려준다(기본 False = 팀 설계대로 원장 수동 확정). 켠 샵에서만 자동확정.
        const _acSw = document.getElementById('ssAutoConfirmSwitch');
        if (_acSw) {
          const _acOn = !!data.auto_confirm;
          _acSw.classList.toggle('is-on', _acOn);
          _acSw.setAttribute('aria-checked', _acOn ? 'true' : 'false');
        }
      }
    } catch (_e) { /* ignore — fallback to default */ }
    // [보안감사 M-9] 로컬 영업시간은 '서버에 값이 없을 때만' 폴백으로 쓴다.
    //   예전엔 서버 로드 뒤 무조건 로컬로 재override 해서, 다른 기기가 고친 최신 영업시간이
    //   이 기기의 오래된 로컬로 되돌아가고 저장 시 서버까지 롤백됐다.
    if (!_serverHadHours) {
      try {
        const localBH = localStorage.getItem('itdasy_business_hours_json');
        if (localBH) {
          const parsed = JSON.parse(localBH);
          if (parsed && typeof parsed === 'object') {
            _DAY_KEYS.forEach(k => { if (parsed[k]) hours[k] = { ...hours[k], ...parsed[k] }; });
          }
        }
      } catch (_e) { /* ignore */ }
    }
    _expandedDay = null; // 화면 재진입 시 인라인 확장 초기화
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
      hours: _hrText,
      business_hours_json: hoursObj ? JSON.stringify(hoursObj) : null,
      auto_confirm: document.getElementById('ssAutoConfirmSwitch')?.classList.contains('is-on') ? 1 : 0,
      // [2026-07-25 예약QA F5] 예약 알림톡 자동발송 opt-in — 백엔드 ShopSettings.alimtalk_auto_enabled.
      alimtalk_auto_enabled: !!document.getElementById('ssAlimtalkSwitch')?.classList.contains('is-on'),
    };
    // [출시감사 2026-08-01] 전화·주소는 **값이 있을 때만** 보낸다.
    //   빈 문자열을 보내면 백엔드 shop.py 의 `exclude_none` 이 "" 를 못 걸러
    //   `settings.phone = ""` 로 서버 값을 지워버린다. 입력칸이 비어 보이는 상황
    //   (재로그인·기기 변경으로 로컬 캐시가 없을 때)에서 영업시간만 고쳐 저장해도
    //   전화·주소가 날아가던 경로다. 정말 지우고 싶으면 그건 별도 동작이어야 한다.
    const _phone = get('ssShopPhone');
    const _addr = get('ssShopAddr');
    if (_phone) payload.phone = _phone;
    if (_addr) payload.address = _addr;

    if (!payload.shop_name) { _toast('샵 이름을 입력해주세요'); return; }

    // 로컬 저장 (즉시 반영)
    try {
      localStorage.setItem('itdasy_shop_name', payload.shop_name);
      await _safeSet('itdasy_shop_phone', payload.phone);
      await _safeSet('itdasy_shop_addr', payload.address);
      localStorage.setItem('itdasy_shop_hours', _hrText);
      if (payload.business_hours_json) localStorage.setItem('itdasy_business_hours_json', payload.business_hours_json);
      // [보안감사 L-8] payload.solo_mode 는 폐지돼 항상 undefined → 문자열 "undefined" 저장되던 것 제거.
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
      // [출시감사 2026-08-01] 예전엔 실패해도 "로컬에 저장됨 — 서버 연결 후 자동 동기화" 라고
      //   안심시켰는데 **자동 동기화 코드가 어디에도 없다.** /shop/settings 재전송 큐도,
      //   online 리스너도 없다. 게다가 알림톡·자동확정 토글은 로컬에도 안 남아서
      //   화면을 나갔다 들어오면 그냥 꺼져 있다 — 원장님은 자기가 안 켠 줄 안다.
      //   되지도 않는 약속을 하지 말고 사실대로 말한다.
      if (res.ok) _toast('저장됨');
      else _toast('저장하지 못했어요. 잠시 후 다시 시도해 주세요');
    } catch (_) {
      _toast('저장하지 못했어요. 인터넷 연결을 확인해 주세요');
    }
  }

  function openShopSettings() {
    const el = _ensureMounted();
    _hydrate().catch(() => {});
    requestAnimationFrame(() => el.classList.add('is-open'));
    el.setAttribute('aria-hidden', 'false');
    // [2026-07-22 보스] 뒤로가기 등록 — 안 하면 안드로이드 back/스와이프에서 이 화면 대신 앱이 그대로 꺼진다.
    if (typeof window._registerSheet === 'function') window._registerSheet('shopSettings', closeShopSettings);
    if (typeof window._markSheetOpen === 'function') window._markSheetOpen('shopSettings');
    _haptic();
  }
  function closeShopSettings() {
    const el = document.getElementById(ID);
    if (!el) return;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    if (typeof window._markSheetClosed === 'function') window._markSheetClosed('shopSettings');
    _haptic();
  }

  window.openShopSettings = openShopSettings;
  window.closeShopSettings = closeShopSettings;
})();
