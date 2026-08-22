/* DM 예약 양식 편집기 — 공용 모듈 [2026-06-25]
   빠른 안내(app-dm-menu)의 '예약하기' 펼친 본문에서 마운트해 사용.
   데이터: DM 자동응답 설정과 동일 채널(window.DmSettingsCache) — get/patch 로 부분 저장.
   → BE 무변경(settings.booking_form/greeting/deposit_* 그대로, _subst·발송로직 불변).
   app-dm-autoreply.js 의 _renderBooking/_renderFormMapCard/_parseKRW + 핸들러를 이전(원본 삭제).
   사용: window.DMBookingForm.mount(containerEl)
*/
(function () {
  'use strict';

  function _esc(s) { return window._esc ? window._esc(s) : String(s == null ? '' : s); }
  function _toast(m) { if (window.showToast) window.showToast(m); }
  function _haptic() { try { window.hapticLight && window.hapticLight(); } catch (_e) { void _e; } }

  // "5만원"→50000 등 만/천/억 단위 해석 (app-dm-autoreply 에서 이전)
  function _parseKRW(raw) {
    let s = String(raw == null ? '' : raw).replace(/[,\s원]/g, '');
    if (!s) return null;
    if (/^\d+$/.test(s)) { const n = parseInt(s, 10); return n > 0 ? n : null; }
    let total = 0, matched = false;
    const eok = s.match(/(\d+)억/);   if (eok) { total += parseInt(eok[1], 10) * 1e8; matched = true; }
    const man = s.match(/(\d+)만/);   if (man) { total += parseInt(man[1], 10) * 1e4; matched = true; }
    const cheon = s.match(/(\d+)천/); if (cheon) { total += parseInt(cheon[1], 10) * 1e3; matched = true; }
    const tail = s.match(/만(\d{3,4})$/); if (tail) { total += parseInt(tail[1], 10); }
    if (matched) return total > 0 ? total : null;
    const digits = s.replace(/[^0-9]/g, '');
    const n = digits ? parseInt(digits, 10) : 0;
    return n > 0 ? n : null;
  }

  // 타임아웃 GET (양식 → 매핑 빌드용)
  function _fetchTimeout(url, opts, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => { try { ctrl.abort(); } catch (_e) { void _e; } }, ms || 15000);
    return fetch(url, { ...(opts || {}), signal: ctrl.signal }).finally(() => clearTimeout(t));
  }

  // [이전] 매핑 JSON → "이렇게 이해했어요" 카드. confirming=true 면 [네 맞아요]/[수정할래요] 표시.
  function _renderFormMapCard(mapJson, confirming) {
    let fmap = {};
    try { fmap = JSON.parse(mapJson); if (typeof fmap !== 'object' || Array.isArray(fmap)) fmap = {}; } catch (_) { fmap = {}; }
    const LABELS = {
      name: '성함·연락처',
      phone: '연락처',
      primary_time: '1순위 날짜·시간',
      secondary_time: '2순위 → 1순위 안 되면 여기로',
      service: '시술',
      options: '옵션 (인치·색상·제거 등)',
      memo: '기타 메모',
    };
    const rows = Object.entries(fmap)
      .filter(([k, v]) => v && k !== 'phone')
      .map(([k, v]) => {
        const label = LABELS[k] || k;
        return `<div style="display:flex;gap:8px;align-items:flex-start;font-size:12px;padding:4px 0;">
          <span style="flex-shrink:0;color:#8B95A1;min-width:140px;word-break:keep-all;">${_esc(label)}</span>
          <span style="color:#191F28;font-weight:600;word-break:keep-all;">${_esc(String(v))}</span>
        </div>`;
      });
    if (!rows.length) return '';
    const btns = confirming ? `
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button type="button" data-act="form-map-confirm"
          style="flex:1;height:40px;border-radius:10px;border:none;background:#2B3A67;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">네 맞아요</button>
        <button type="button" data-act="form-map-edit"
          style="flex:1;height:40px;border-radius:10px;border:1px solid #E0E0E6;background:#fff;color:#4E5968;font-size:13px;font-weight:600;cursor:pointer;">수정할래요</button>
      </div>` : '';
    return `
      <div id="dm-form-map-card" style="background:#F7F8FA;border:1px solid #E8ECF1;border-radius:14px;padding:14px 16px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">
          <svg width="14" height="14" aria-hidden="true"><use href="#ic-bot"/></svg>
          <span style="font-size:12px;font-weight:700;color:#4E5968;">잇비가 이렇게 이해했어요</span>
        </div>
        <div style="display:flex;flex-direction:column;">${rows.join('')}</div>
        ${btns}
      </div>`;
  }

  // [이전] 예약 양식 편집 본문 (인사멘트·양식·이해카드 / 예약금은 접어둠)
  function _renderBooking(settings) {
    const form = _esc(settings.booking_form || '');
    const greeting = _esc(settings.booking_form_greeting || '');
    const acct = _esc(settings.deposit_account || '');
    const amtN = (settings.deposit_amount != null && settings.deposit_amount > 0) ? settings.deposit_amount : '';
    const amt = _esc(amtN);
    const mapJson = settings.booking_form_map || '';
    const mapCard = form && mapJson ? _renderFormMapCard(mapJson, false) : '';
    // [2026-08-16] 라벨·입력칸 클래스를 dmm-* 로 통일. 예전 dm-field__* 는 css/screens/dm-autoreply-v3.css
    //   에 정의돼 있었는데 그 파일이 폐기되면서 스타일이 통째로 날아갔었다(브라우저 기본 폰트로 노출).
    //   이 모듈은 app-dm-menu 안에서만 마운트되므로 그쪽 스타일 한 벌만 쓴다 — 중복 정의를 만들지 않는다.
    // [2026-08-16] placeholder 에서 "예:" 접두사 제거 — 회색 글씨면 이미 예시인 게 보인다.
    //   접두사가 붙으면 원장님이 그 형식을 따라야 하는 줄 알고 자기 말투로 못 쓴다.
    // [2026-08-16] 예약금은 기본 접힘 — **양식과 같이 안 나간다.** 손님이 양식을 채워 보내
    //   성함·연락처가 모이면 그때 예약 흐름에서 안내된다(BE: _booking_flow_draft / _build_avail_reply).
    //   여기 펼쳐두면 "양식 보내면 계좌도 같이 가나?" 로 오해한다.
    const depSet = !!(acct || amt);
    return `
      <div class="dmm-fld">양식 앞 인사 멘트 <span class="sub">비우면 양식만 나가요</span></div>
      <input type="text" class="dmm-in" data-field="booking-form-greeting"
        value="${greeting}" placeholder="안녕하세요! 예약 도와드릴게요 :)">
      <div class="dmm-fld">보낼 양식 <span class="sub">쓴 그대로 손님에게 가요</span></div>
      <textarea class="dmm-resp" data-field="booking-form" rows="5"
        placeholder="1. 성함 / 연락처&#10;2. 희망 시술&#10;3. 희망 날짜·시간 (1순위)&#10;4. 2순위 날짜·시간">${form}</textarea>
      <div id="dm-form-map-area">${mapCard}</div>
      <button type="button" class="dmm-more" data-dep-more aria-expanded="false">
        <span class="mt">예약금 안내<span class="mb${depSet ? ' on' : ''}">${depSet ? '설정됨' : '아직 없음'}</span></span>
        <span class="mc" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span>
      </button>
      <div class="dmm-dep" data-dep-box hidden>
        <div class="dmm-hint">양식이랑 같이 나가지 않아요. 손님이 양식을 채워 보내고 성함·연락처까지 모이면 그때 안내돼요.</div>
        <div class="dmm-fld">예약금 계좌 <span class="sub">은행·예금주까지</span></div>
        <input type="text" class="dmm-in" data-field="deposit-account"
          value="${acct}" placeholder="카카오뱅크 3333-00-000000 김원장">
        <div class="dmm-fld">예약금 금액 <span class="sub">2만원처럼 적어도 돼요</span></div>
        <label class="dmm-unit">
          <input type="text" inputmode="numeric" class="dmm-in" data-field="deposit-amount"
            value="${amt}" placeholder="20000">
          <span class="u">원</span>
        </label>
      </div>`;
  }

  function _bindFormMapButtons(root, mapJson) {
    root.querySelector('[data-act="form-map-confirm"]')?.addEventListener('click', () => {
      _haptic();
      const area = root.querySelector('#dm-form-map-area');
      if (area) area.innerHTML = _renderFormMapCard(mapJson, false);
      _toast('양식 이해 완료!');
    });
    root.querySelector('[data-act="form-map-edit"]')?.addEventListener('click', () => {
      const area = root.querySelector('#dm-form-map-area');
      if (area) area.innerHTML = '';
      const ta = root.querySelector('[data-field="booking-form"]');
      if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    });
  }

  function _bind(root) {
    // 인사 멘트
    root.querySelector('[data-field="booking-form-greeting"]')?.addEventListener('blur', (e) => {
      window.DmSettingsCache?.patch({ booking_form_greeting: String(e.target.value || '').trim() });
    });
    // 예약 양식 blur → 저장 후 매핑 조회 + "이렇게 이해했어요" 카드 (저장 await 로 race 제거)
    const formTA = root.querySelector('[data-field="booking-form"]');
    if (formTA) {
      formTA.addEventListener('blur', async (e) => {
        const val = String(e.target.value || '').trim();
        try { await window.DmSettingsCache?.patch({ booking_form: val }); } catch (_e) { void _e; }
        const area = root.querySelector('#dm-form-map-area');
        if (!val) { if (area) area.innerHTML = ''; return; }
        if (!area) return;
        area.innerHTML = `<div style="font-size:12px;color:#8B95A1;padding:8px 0;">잇비가 양식을 분석하는 중이에요…</div>`;
        try {
          const r = await _fetchTimeout(apiUrl('/instagram/dm-reply/settings/booking-form-map'), { headers: window.authHeader() }, 15000);
          if (!r || !r.ok) throw new Error('map fetch failed');
          const d = await r.json();
          const mapJson = d.map && Object.keys(d.map).length ? JSON.stringify(d.map) : '';
          if (!mapJson) { area.innerHTML = ''; return; }
          // 매핑은 표시용 — 캐시 객체에만 보관(서버 저장 X, 발송 시 BE 가 양식에서 재생성)
          try { const c = await window.DmSettingsCache?.get(); if (c) c.booking_form_map = mapJson; } catch (_e) { void _e; }
          area.innerHTML = _renderFormMapCard(mapJson, true);
          _bindFormMapButtons(root, mapJson);
        } catch (_err) {
          area.innerHTML = '';
        }
      });
    }
    // 예약금 접기/펼치기 — 기본 접힘(양식과 같이 안 나가는 값이라 양식 편집 흐름을 끊지 않게)
    const depBtn = root.querySelector('[data-dep-more]');
    const depBox = root.querySelector('[data-dep-box]');
    if (depBtn && depBox) {
      depBtn.addEventListener('click', () => {
        const open = depBox.hasAttribute('hidden');
        if (open) depBox.removeAttribute('hidden'); else depBox.setAttribute('hidden', '');
        depBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        depBtn.classList.toggle('open', open);
        _haptic();
      });
    }
    // 예약금 계좌 / 금액
    root.querySelector('[data-field="deposit-account"]')?.addEventListener('blur', (e) => {
      window.DmSettingsCache?.patch({ deposit_account: String(e.target.value || '').trim() });
    });
    root.querySelector('[data-field="deposit-amount"]')?.addEventListener('blur', (e) => {
      const raw = String(e.target.value || '').trim();
      const n = _parseKRW(raw);
      window.DmSettingsCache?.patch({ deposit_amount: n });
      if (n != null) {
        e.target.value = String(n);
        _toast(`${n.toLocaleString('ko-KR')}원으로 저장했어요`);
      } else if (raw) {
        _toast('예약금 금액을 숫자로 적어주세요');
      }
    });
  }

  // 컨테이너에 예약 양식 편집기 렌더 + 바인딩. 설정은 DmSettingsCache 공유 채널에서 로드.
  async function mount(container) {
    if (!container) return;
    let s = {};
    try { s = (window.DmSettingsCache ? await window.DmSettingsCache.get() : {}) || {}; } catch (_e) { s = {}; }
    container.innerHTML = _renderBooking(s);
    _bind(container);
  }

  window.DMBookingForm = { mount };
})();
