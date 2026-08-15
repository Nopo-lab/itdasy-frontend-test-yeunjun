/* 인스타DM 손님 응대 허브 — 손님 여정 3단 오버뷰 [2026-08-16]
   진입: window.openDmHub() / window.closeDmHub()

   설계:
   - 전체화면 라우팅 신설 X. 기존 .ms-sheet 시트 시스템 + SheetAnim 재사용
     (integrations-hub / settings-hub / ai-hub 와 동일 — PC 사이드바 자동 안전).
   - 데이터는 전부 기존 것. GET/PUT /shop/dm-menu (신설 API·필드 0).
   - 편집은 기존 모듈에 위임(중복 정의 금지):
       · 인사말/버튼 내용   → window.openDMMenuSettings(key)
       · 예약 양식          → window.DMBookingForm.mount(el)  (그 자리 인라인 마운트)
   - 켜기/끄기 마스터 토글은 이 화면에 없음. enabled===false 일 때만 상단 배너로 유도.
   - 서버 반영은 반드시 GET → 받은 객체에서 필드만 바꿔 통째로 PUT (부분 PUT 금지).
*/
(function () {
  'use strict';
  const ID = 'dmHubSheet';
  function _esc(s) { return window._esc ? window._esc(s) : String(s == null ? '' : s); }
  function _toast(m) { if (window.showToast) window.showToast(m); }
  function _haptic() { try { window.hapticLight && window.hapticLight(); } catch (_e) { void _e; } }
  function _authHeader() { return window.authHeader ? window.authHeader() : {}; }

  // 고정 5개(app-dm-menu.js FIXED_ORDER 와 동일 순서·키). 커스텀은 뒤에 CUSTOM_n.
  const BTN_META = {
    BOOK_FORM: '탭하면 손님에게 예약 양식을 보내요',
    HOURS:     '영업시간을 바로 답장해요',
    LOCATION:  '샵 위치·주소를 바로 답장해요',
    PRICE:     '가격표를 바로 답장해요',
    OTHER:     '확인 멘트 보낸 뒤 사장님이 직접 답장',
  };
  const EMPTY_HINT = {
    BOOK_FORM: '예약 양식을 아직 안 만들었어요',
    HOURS:     '영업시간을 아직 안 넣었어요',
    LOCATION:  '주소를 아직 안 넣었어요',
    PRICE:     '가격표를 아직 안 넣었어요',
    OTHER:     '확인 멘트를 아직 안 썼어요',
  };

  let _menu = null;         // 마지막 GET /shop/dm-menu 결과 (표시용)
  let _real = null;         // { HOURS, LOCATION, PRICE, BOOK } — 실데이터 채움 여부
  let _editingGreet = false;
  let _bookOpen = false;    // '예약' 줄 인라인 펼침 상태

  // ── 커스텀/OTHER 는 항목 텍스트로, 고정데이터(HOURS/LOCATION/PRICE)·예약은 실데이터로 채움 판정 ──
  function _isCustom(it) { return !!it.custom || (it.key || '').indexOf('CUSTOM_') === 0; }
  function _filled(it) {
    if (_isCustom(it)) {
      return it.action === 'owner_direct'
        ? !!String(it.ack || '').trim()
        : !!String(it.resp || '').trim();
    }
    if (it.key === 'OTHER') return !!String(it.ack || '').trim();
    if (it.key === 'BOOK_FORM') return !!(_real && _real.BOOK);
    if (it.key === 'HOURS' || it.key === 'LOCATION' || it.key === 'PRICE') {
      return !!(_real && _real[it.key]);
    }
    return true;
  }
  function _btnTitle(it) { return it.label || it.key; }
  function _btnMeta(it) {
    if (BTN_META[it.key]) return BTN_META[it.key];
    return it.action === 'owner_direct' ? '사장님이 직접 답장해요' : '자동으로 답장해요';
  }

  function _styleOnce() {
    if (document.getElementById('dmHubStyle')) return;
    const s = document.createElement('style');
    s.id = 'dmHubStyle';
    s.textContent = `
      #${ID} .dh-step{margin:18px 0 0}
      #${ID} .dh-stepno{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;color:#8B95A1;margin:0 2px 8px}
      #${ID} .dh-num{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#EEF1F4;color:#4E5968;font-size:11px;font-weight:800;flex:none}
      #${ID} .dh-banner{display:flex;align-items:center;gap:10px;background:#FEF7E5;border:.5px solid #F2D48A;border-radius:14px;padding:12px 14px;margin:4px 0 2px}
      #${ID} .dh-banner .t{flex:1;min-width:0;font-size:12.5px;line-height:1.45;color:#8B6F00;font-weight:600}
      #${ID} .dh-banner button{flex:none;border:none;background:#191F28;color:#fff;font-size:12.5px;font-weight:800;border-radius:10px;padding:8px 16px;cursor:pointer;font-family:inherit}
      #${ID} .dh-card{background:#fff;border:.5px solid rgba(0,0,0,.08);border-radius:16px;overflow:hidden}
      #${ID} .dh-greet{padding:13px 14px}
      #${ID} .dh-greet-txt{font-size:13.5px;line-height:1.55;color:#191F28;white-space:pre-wrap;word-break:break-word}
      #${ID} .dh-greet-txt.is-empty{color:#B0B8C1}
      #${ID} .dh-greet-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
      #${ID} .dh-greet-head .l{font-size:11.5px;font-weight:700;color:#8B95A1}
      #${ID} .dh-edit{border:none;background:var(--brand-bg,#F7EFF0);color:var(--brand-strong,#BC6675);font-size:12px;font-weight:800;border-radius:9px;padding:6px 12px;cursor:pointer;font-family:inherit}
      #${ID} .dh-ta{width:100%;box-sizing:border-box;border:.5px solid rgba(0,0,0,.14);border-radius:12px;padding:11px 12px;font-size:13.5px;line-height:1.55;resize:none;font-family:inherit;outline:none;color:#191F28}
      #${ID} .dh-ta:focus{border-color:var(--brand,#D58A95)}
      #${ID} .dh-ta-row{display:flex;gap:8px;margin-top:9px}
      #${ID} .dh-ta-row button{flex:1;font-size:13px;font-weight:800;border-radius:10px;padding:10px;cursor:pointer;font-family:inherit}
      #${ID} .dh-save{border:none;background:#191F28;color:#fff}
      #${ID} .dh-cancel{border:.5px solid rgba(0,0,0,.14);background:#fff;color:#4E5968}
      #${ID} .dh-btnrow{display:flex;align-items:center;gap:11px;padding:12px 14px;border-bottom:.5px solid rgba(0,0,0,.06);cursor:pointer;width:100%;text-align:left;background:none;border-left:0;border-right:0;border-top:0;font-family:inherit}
      #${ID} .dh-btnrow:last-of-type{border-bottom:0}
      #${ID} .dh-chip{font-size:12.5px;font-weight:800;color:var(--brand-strong,#BC6675);background:var(--brand-bg,#F7EFF0);border:.5px solid rgba(0,0,0,.08);border-radius:999px;padding:6px 12px;max-width:118px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:none}
      #${ID} .dh-btx{flex:1;min-width:0}
      #${ID} .dh-btx .mt{font-size:13px;font-weight:700;color:#191F28;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #${ID} .dh-btx .ms{font-size:11px;color:#8B95A1;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #${ID} .dh-right{flex:none;display:flex;align-items:center;gap:6px}
      #${ID} .dh-empty{font-size:11px;font-weight:700;color:#B58A00;background:#FEF7E5;border:1px dashed #E7C25A;border-radius:999px;padding:4px 10px;white-space:nowrap}
      #${ID} .dh-hide{font-size:11px;font-weight:700;color:#B0B8C1;background:#F2F4F6;border-radius:999px;padding:4px 9px;white-space:nowrap}
      #${ID} .dh-caret{color:#C9CDD4;display:inline-flex;transition:transform .2s}
      #${ID} .dh-caret.open{transform:rotate(180deg)}
      #${ID} .dh-book{padding:2px 14px 14px;border-bottom:.5px solid rgba(0,0,0,.06)}
      #${ID} .dh-add{width:100%;padding:12px;border:1px dashed rgba(0,0,0,.18);background:#fff;border-radius:13px;font-size:13px;font-weight:700;color:#4E5968;cursor:pointer;font-family:inherit;margin-top:10px}
      #${ID} .dh-green{display:flex;gap:11px;background:#EAF7EF;border:.5px solid #B6E3C6;border-radius:16px;padding:14px 15px}
      #${ID} .dh-green .ico{flex:none;color:#16A34A;margin-top:1px}
      #${ID} .dh-green b{display:block;font-size:13px;font-weight:800;color:#15803D;margin-bottom:3px}
      #${ID} .dh-green p{font-size:12px;line-height:1.5;color:#3F7A54;margin:0}
      #${ID} .dh-foot{display:flex;align-items:center;justify-content:center;gap:8px;margin:16px 2px 4px;font-size:12px;color:#B0B8C1}
      #${ID} .dh-foot .soon{font-size:10.5px;font-weight:700;color:#8B95A1;background:#F2F4F6;border-radius:6px;padding:2px 8px}
    `;
    document.head.appendChild(s);
  }

  function _caretSvg(open) {
    return `<span class="dh-caret ${open ? 'open' : ''}" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span>`;
  }
  function _chevSvg() {
    return `<span class="dh-caret" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></span>`;
  }

  // ── 배너: enabled===false 일 때만 렌더 (true 면 아예 안 그림) ──
  function _bannerHTML() {
    if (!_menu || _menu.enabled !== false) return '';
    return `
      <div class="dh-banner">
        <div class="t">빠른 안내가 꺼져 있어요 · 손님이 버튼을 못 봐요</div>
        <button type="button" data-dh-enable>켜기</button>
      </div>`;
  }

  // ── 1단: 인사말 ──
  function _greetHTML() {
    const g = (_menu && _menu.greeting) || '';
    if (_editingGreet) {
      return `
        <div class="dh-step">
          <div class="dh-stepno"><span class="dh-num">1</span> 손님이 DM 보내면 이렇게 인사해요</div>
          <div class="dh-card dh-greet">
            <textarea class="dh-ta" rows="3" data-dh-greet maxlength="300" placeholder="예: 문의 감사합니다 😊 어떤 게 궁금하세요?">${_esc(g)}</textarea>
            <div class="dh-ta-row">
              <button type="button" class="dh-cancel" data-dh-greet-cancel>취소</button>
              <button type="button" class="dh-save" data-dh-greet-save>저장</button>
            </div>
          </div>
        </div>`;
    }
    return `
      <div class="dh-step">
        <div class="dh-stepno"><span class="dh-num">1</span> 손님이 DM 보내면 이렇게 인사해요</div>
        <div class="dh-card dh-greet">
          <div class="dh-greet-head">
            <span class="l">첫 인사 멘트</span>
            <button type="button" class="dh-edit" data-dh-greet-edit>수정</button>
          </div>
          <div class="dh-greet-txt ${g ? '' : 'is-empty'}">${g ? _esc(g) : '아직 인사말이 없어요 — 수정을 눌러 적어주세요'}</div>
        </div>
      </div>`;
  }

  // ── 2단: 버튼 ──
  function _btnRowHTML(it) {
    const filled = _filled(it);
    const hidden = it.enabled === false;
    let right = '';
    if (!filled) right = `<span class="dh-empty">아직 안 채웠어요</span>`;
    else if (hidden) right = `<span class="dh-hide">숨김</span>`;
    const isBook = it.key === 'BOOK_FORM';
    right += isBook ? _caretSvg(_bookOpen && isBook) : _chevSvg();
    const meta = filled ? _btnMeta(it) : (EMPTY_HINT[it.key] || '답장 내용을 아직 안 썼어요');
    return `
      <button type="button" class="dh-btnrow" data-dh-btn="${_esc(it.key)}">
        <span class="dh-chip">${_esc(it.label || it.key)}</span>
        <span class="dh-btx"><span class="mt">${_esc(_btnTitle(it))}</span><span class="ms">${_esc(meta)}</span></span>
        <span class="dh-right">${right}</span>
      </button>
      ${isBook && _bookOpen ? `<div class="dh-book" data-dh-book-mount></div>` : ''}`;
  }
  function _buttonsHTML() {
    const items = (_menu && Array.isArray(_menu.items)) ? _menu.items : [];
    const rows = items.map(_btnRowHTML).join('');
    return `
      <div class="dh-step">
        <div class="dh-stepno"><span class="dh-num">2</span> 손님이 누를 버튼</div>
        <div class="dh-card">${rows || '<div style="padding:16px;color:#B0B8C1;font-size:12.5px;">버튼을 불러오는 중…</div>'}</div>
        <button type="button" class="dh-add" data-dh-add>+ 버튼 추가</button>
      </div>`;
  }

  // ── 3단: 읽기 전용 안내(토글 아님) ──
  function _stage3HTML() {
    return `
      <div class="dh-step">
        <div class="dh-green">
          <span class="ico" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
          <div>
            <b>손님한텐 잇비가 마음대로 답장 안 해요</b>
            <p>잇비가 답장을 써두면, 원장님이 보고 '보내기'를 눌러야 나갑니다.</p>
          </div>
        </div>
      </div>
      <div class="dh-foot">카카오 알림톡 · 네이버 톡톡 <span class="soon">준비 중</span></div>`;
  }

  function _bodyHTML() {
    return _bannerHTML() + _greetHTML() + _buttonsHTML() + _stage3HTML();
  }

  function _render() {
    const body = document.getElementById('dmHubBody');
    if (!body) return;
    body.innerHTML = _bodyHTML();
    // 예약 줄 펼쳐져 있으면 공용 예약 양식 모듈 인라인 마운트 (새로 만들지 않음)
    if (_bookOpen) {
      const m = body.querySelector('[data-dh-book-mount]');
      if (m && window.DMBookingForm && typeof window.DMBookingForm.mount === 'function') {
        window.DMBookingForm.mount(m);
      }
    }
  }

  // ── 서버 반영: 반드시 GET → 받은 객체에서 필드만 바꿔 통째로 PUT ──
  async function _patchMenu(mutate) {
    const auth = _authHeader();
    const res = await apiFetch(apiUrl('/shop/dm-menu'), { headers: auth });
    const menu = await res.json().catch(() => null);
    if (!menu || typeof menu !== 'object' || !Array.isArray(menu.items)) {
      throw new Error('메뉴를 불러오지 못했어요');
    }
    mutate(menu); // greeting/enabled 만 변경 — items/ice_breakers 는 GET 결과 그대로 동봉
    const put = await apiFetch(apiUrl('/shop/dm-menu'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify(menu),
    });
    if (!put.ok) throw new Error('HTTP ' + put.status);
    _menu = menu;
    return menu;
  }

  async function _enableQuickGuide(btn) {
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
    try {
      await _patchMenu((m) => { m.enabled = true; });
      _haptic(); _render();
      _toast('빠른 안내를 켰어요 ✓');
    } catch (e) {
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
      _toast('켜기 실패 — 다시 시도해주세요');
    }
  }

  async function _saveGreeting(text) {
    const btn = document.querySelector('#' + ID + ' [data-dh-greet-save]');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
    try {
      await _patchMenu((m) => { m.greeting = text; });
      _editingGreet = false;
      _haptic(); _render();
      _toast('인사말을 저장했어요 ✓');
    } catch (e) {
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
      _toast('저장 실패 — 다시 시도해주세요');
    }
  }

  // ── 채움 판정용 실데이터 (설정 읽기라 저비용). 없으면 '아직 안 채웠어요' 로 유도 ──
  async function _fetchReal() {
    const out = { HOURS: '', LOCATION: '', PRICE: '', BOOK: '' };
    const auth = _authHeader();
    try {
      const r = await apiFetch(apiUrl('/shop/settings'), { headers: auth });
      if (r.ok) {
        const d = (await r.json().catch(() => null)) || {};
        out.HOURS = String(d.hours || '').trim();
        out.LOCATION = String(d.address || '').trim();
      }
    } catch (_e) { void _e; }
    try {
      const list = (window.ServiceTemplates && window.ServiceTemplates.list) ? await window.ServiceTemplates.list() : null;
      const arr = Array.isArray(list) ? list : (list && Array.isArray(list.items) ? list.items : []);
      out.PRICE = arr.filter((s) => s && s.name).length ? 'y' : '';
    } catch (_e) { void _e; }
    try {
      const c = window.DmSettingsCache ? await window.DmSettingsCache.get() : null;
      out.BOOK = String((c && c.booking_form) || '').trim();
    } catch (_e) { void _e; }
    _real = out;
    _render();
  }

  async function _hydrate() {
    try {
      const res = await apiFetch(apiUrl('/shop/dm-menu'), { headers: _authHeader() });
      const d = await res.json().catch(() => null);
      _menu = (d && typeof d === 'object' && Array.isArray(d.items)) ? d : { enabled: false, greeting: '', items: [] };
    } catch (_e) {
      _menu = { enabled: false, greeting: '', items: [] };
    }
    _render();
  }

  // ── 이벤트 위임 ──
  function _onClick(e) {
    if (e.target.closest('[data-dh-enable]')) { _enableQuickGuide(e.target.closest('[data-dh-enable]')); return; }
    if (e.target.closest('[data-dh-greet-edit]')) { _editingGreet = true; _render(); return; }
    if (e.target.closest('[data-dh-greet-cancel]')) { _editingGreet = false; _render(); return; }
    if (e.target.closest('[data-dh-greet-save]')) {
      const ta = document.querySelector('#' + ID + ' [data-dh-greet]');
      _saveGreeting(ta ? String(ta.value || '').trim() : '');
      return;
    }
    if (e.target.closest('[data-dh-add]')) {
      // 추가·상세편집은 기존 빠른 안내 편집기에 위임(중복 정의 금지). 닫힌 뒤 열려 스택으로 복귀.
      _haptic();
      if (typeof window.openDMMenuSettings === 'function') window.openDMMenuSettings();
      else _toast('편집 화면을 열 수 없어요');
      return;
    }
    const btn = e.target.closest('[data-dh-btn]');
    if (btn) {
      const key = btn.getAttribute('data-dh-btn');
      _haptic();
      if (key === 'BOOK_FORM') { _bookOpen = !_bookOpen; _render(); return; }
      // 나머지 버튼 내용 편집은 기존 편집기에서 해당 항목 펼쳐서
      if (typeof window.openDMMenuSettings === 'function') window.openDMMenuSettings(key);
      else _toast('편집 화면을 열 수 없어요');
      return;
    }
  }

  function _ensureSheet() {
    let sheet = document.getElementById(ID);
    if (sheet) return sheet;
    _styleOnce();
    sheet = document.createElement('div');
    sheet.id = ID;
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9985;display:none;';
    sheet.innerHTML = `
      <div class="ms-sheet__overlay" id="dhOverlay" style="position:fixed;inset:0;"></div>
      <div class="ms-sheet" id="dhCard" style="max-width:560px;margin:0 auto;">
        <div class="ms-sheet__handle"></div>
        <div class="ms-sheet__head">
          <div class="ms-sheet__head-left">
            <div class="ms-sheet__title">인스타DM 손님 응대</div>
            <div class="ms-sheet__sub">손님이 DM 보내면 이렇게 응대해요</div>
          </div>
          <button type="button" class="ms-sheet__close" id="dhClose" aria-label="닫기">✕</button>
        </div>
        <div class="ms-sheet__body"><div id="dmHubBody"></div></div>
      </div>`;
    document.body.appendChild(sheet);
    sheet.querySelector('#dhOverlay')?.addEventListener('click', close);
    sheet.querySelector('#dhClose')?.addEventListener('click', () => { _haptic(); close(); });
    sheet.querySelector('#dmHubBody').addEventListener('click', _onClick);
    return sheet;
  }

  function open() {
    const sheet = _ensureSheet();
    const card = sheet.querySelector('#dhCard');
    _editingGreet = false;
    _bookOpen = false;
    _render();               // 이전 캐시(있으면)로 즉시 골격
    _hydrate().catch(() => {}); // GET /shop/dm-menu → 인사말·버튼·배너
    _fetchReal().catch(() => {}); // 채움 여부(영업시간·주소·가격표·예약양식)
    if (window.SheetAnim) window.SheetAnim.open(sheet, card);
    else sheet.style.display = 'block';
    // 안드로이드 뒤로가기 등록(기존 스택 재사용) — 안 하면 뒤로가기가 이 시트를 모른다.
    if (typeof window._registerSheet === 'function') window._registerSheet('dmHub', close);
    if (typeof window._markSheetOpen === 'function') window._markSheetOpen('dmHub');
  }
  function close() {
    const sheet = document.getElementById(ID);
    if (!sheet) return;
    const card = sheet.querySelector('#dhCard');
    if (window.SheetAnim) window.SheetAnim.close(sheet, card);
    else sheet.style.display = 'none';
    if (typeof window._markSheetClosed === 'function') window._markSheetClosed('dmHub');
  }

  window.openDmHub = open;
  window.closeDmHub = close;
})();
