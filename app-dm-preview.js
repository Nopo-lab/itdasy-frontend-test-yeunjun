/* [2026-08-16] 손님 화면 미리보기 — "이 버튼 누르면 손님이 뭘 받나" 를 인스타 DM 그대로 보여준다.
   진입: window.openDMPreview()  (인스타DM 손님 응대 화면 상단 버튼)

   ⚠️ 정직성 원칙 — 이 화면의 존재 이유는 원장님에게 '확신' 을 주는 것이다. 그러려면 절대 거짓말하면 안 된다.
     · 문구 조립은 전부 서버(GET /instagram/dm-reply/dm-menu/preview → build_menu_reply).
       여기서 문장을 만들지 않는다. 만들면 실제 발송과 어긋나고, 그 순간 미리보기는 거짓말이 된다.
     · 값이 비면 비었다고 그대로 보여준다(가짜 예시로 채우지 않는다). 대신 '지금 채우기' 로 점프.
     · 손님에게 안 나가고 원장 큐로만 가는 건 손님 말풍선이 아니라 회색 안내로 구분해 보여준다.
   · 발송 X · AI 호출 X · 요금 X. 몇 번을 눌러도 안전하다. */
(function () {
  'use strict';
  const ID = 'dmPreview';
  let _data = null;      // 서버 응답
  let _busy = false;

  function _esc(s) { return window._esc ? window._esc(s) : String(s == null ? '' : s); }
  function _toast(m) { if (window.showToast) window.showToast(m); }
  function _haptic() { try { window.hapticLight && window.hapticLight(); } catch (_e) { void _e; } }

  function _styleOnce() {
    if (document.getElementById('dmPreviewStyle')) return;
    const s = document.createElement('style');
    s.id = 'dmPreviewStyle';
    /* 인스타 DM 은 라이트 고정. 앱 다크 토큰을 쓰면 '손님 화면' 이 아니게 되므로 전부 하드코딩. */
    s.textContent = `
      #${ID}{position:fixed;inset:0;z-index:10700;display:flex;align-items:flex-end;justify-content:center;
        opacity:0;pointer-events:none;transition:opacity .2s}
      #${ID}.is-open{opacity:1;pointer-events:auto}
      #${ID} .dmpv-bg{position:absolute;inset:0;background:rgba(0,0,0,.45)}
      #${ID} .dmpv-sheet{position:relative;width:100%;max-width:440px;height:92vh;background:#fff;
        border-radius:22px 22px 0 0;overflow:hidden;display:flex;flex-direction:column;
        transform:translateY(18px);transition:transform .24s cubic-bezier(.34,1.3,.64,1)}
      #${ID}.is-open .dmpv-sheet{transform:translateY(0)}
      /* 안내 바 — 여긴 앱(잇데이)이고 아래가 인스타라는 걸 구분 */
      #${ID} .dmpv-hd{display:flex;align-items:center;gap:10px;padding:13px 14px 11px;border-bottom:.5px solid rgba(0,0,0,.08)}
      #${ID} .dmpv-hd .tx{flex:1;min-width:0}
      #${ID} .dmpv-hd .t{font-size:15px;font-weight:800;color:#191F28}
      #${ID} .dmpv-hd .s{font-size:11px;color:#8B95A1;margin-top:2px;line-height:1.4}
      #${ID} .dmpv-x{flex:none;width:30px;height:30px;border-radius:50%;border:none;background:#F2F4F6;color:#4E5968;
        cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}
      /* ── 인스타 DM 복제 ── */
      #${ID} .ig{flex:1;min-height:0;display:flex;flex-direction:column;background:#fff}
      #${ID} .ig-hd{display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:.5px solid #DBDBDB;flex:none}
      #${ID} .ig-hd .bk{color:#262626;display:flex;flex:none}
      #${ID} .ig-av{width:30px;height:30px;border-radius:50%;flex:none;background:linear-gradient(135deg,#F9CE34,#EE2A7B 50%,#6228D7);
        display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:800}
      #${ID} .ig-hd .nm{flex:1;min-width:0}
      #${ID} .ig-hd .nm b{display:block;font-size:14px;font-weight:700;color:#262626;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #${ID} .ig-hd .nm span{display:block;font-size:11px;color:#8E8E8E;margin-top:1px}
      #${ID} .ig-hd .ic{color:#262626;display:flex;flex:none}
      #${ID} .ig-th{flex:1;min-height:0;overflow-y:auto;padding:12px 12px 6px;display:flex;flex-direction:column;gap:3px;-webkit-overflow-scrolling:touch}
      #${ID} .ig-sp{flex:1 0 auto}
      #${ID} .b{max-width:76%;padding:9px 13px;font-size:14px;line-height:1.42;white-space:pre-wrap;word-break:break-word;
        border-radius:20px;animation:dmpvIn .22s ease both}
      @keyframes dmpvIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
      #${ID} .b.in{align-self:flex-start;background:#EFEFEF;color:#262626;border-bottom-left-radius:6px}
      #${ID} .b.out{align-self:flex-end;background:#3797F0;color:#fff;border-bottom-right-radius:6px}
      #${ID} .b.img{padding:0;overflow:hidden;background:#EFEFEF;max-width:62%}
      #${ID} .b.img img{display:block;width:100%;height:auto}
      #${ID} .gap{height:6px;flex:none}
      /* 손님에겐 안 나가는 것 — 말풍선이 아니라 회색 안내로 명확히 구분 */
      #${ID} .note{align-self:stretch;margin:6px 2px;padding:10px 12px;border-radius:12px;background:#F7F8FA;
        border:.5px solid rgba(0,0,0,.08);font-size:11.5px;line-height:1.5;color:#8B95A1;animation:dmpvIn .22s ease both}
      #${ID} .note b{color:#4E5968;font-weight:700}
      #${ID} .warn{align-self:stretch;margin:6px 2px;padding:11px 12px;border-radius:12px;background:#FDF3F4;
        border:1px dashed rgba(188,102,117,.45);animation:dmpvIn .22s ease both}
      #${ID} .warn .wt{font-size:12.5px;font-weight:700;color:#BC6675;line-height:1.45}
      #${ID} .warn .ws{font-size:11.5px;color:#8B95A1;margin-top:3px;line-height:1.45}
      #${ID} .warn button{margin-top:8px;font-size:12.5px;font-weight:700;color:#fff;background:#BC6675;border:none;
        border-radius:9px;padding:8px 13px;cursor:pointer;font-family:inherit}
      /* 아래 고정 — 인스타처럼 칩이 입력창 '위' 에서 가로 스크롤 (세로로 쌓지 않는다) */
      #${ID} .ig-bt{flex:none;border-top:.5px solid #DBDBDB;background:#fff;padding:8px 0 10px}
      #${ID} .ig-chips{display:flex;gap:6px;overflow-x:auto;padding:0 12px 8px;scrollbar-width:none}
      #${ID} .ig-chips::-webkit-scrollbar{display:none}
      #${ID} .ig-chips.hide{opacity:0;pointer-events:none;transition:opacity .15s}
      #${ID} .ig-chip{flex:none;white-space:nowrap;font-size:13px;font-weight:600;color:#0095F6;background:#fff;
        border:1px solid #0095F6;border-radius:999px;padding:7px 14px;cursor:pointer;font-family:inherit;
        transition:transform .1s}
      #${ID} .ig-chip:active{transform:scale(.95)}
      #${ID} .ig-in{display:flex;align-items:center;gap:9px;padding:0 12px}
      #${ID} .ig-cam{width:30px;height:30px;border-radius:50%;flex:none;background:#3797F0;display:flex;
        align-items:center;justify-content:center;color:#fff}
      #${ID} .ig-fake{flex:1;border:1px solid #DBDBDB;border-radius:999px;padding:8px 14px;font-size:13.5px;color:#8E8E8E}
      #${ID} .dmpv-load{padding:34px;text-align:center;font-size:13px;color:#8B95A1;line-height:1.6}
    `;
    document.head.appendChild(s);
  }

  const _ICON = {
    back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
    x: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    phone: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/></svg>',
    cam: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3.2"/></svg>',
  };

  function _ensureMounted() {
    let el = document.getElementById(ID);
    if (el) return el;
    _styleOnce();
    el = document.createElement('div');
    el.id = ID;
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="dmpv-bg" data-pv-close></div>
      <div class="dmpv-sheet" role="dialog" aria-label="손님 화면 미리보기">
        <div class="dmpv-hd">
          <div class="tx">
            <div class="t">손님 화면 미리보기</div>
            <div class="s">실제로 나가는 그대로예요 · 여기서 눌러도 손님에겐 안 가요</div>
          </div>
          <button type="button" class="dmpv-x" data-pv-close aria-label="닫기">${_ICON.x}</button>
        </div>
        <div class="ig" id="dmpvIg"><div class="dmpv-load">불러오는 중…</div></div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', _onClick);
    return el;
  }

  function _shell() {
    const d = _data || {};
    const handle = (d.instagram_handle || '').replace(/^@/, '') || (d.shop_name || '내 샵');
    const initial = (d.shop_name || handle || '?').trim().charAt(0);
    return `
      <div class="ig-hd">
        <span class="bk">${_ICON.back}</span>
        <span class="ig-av">${_esc(initial)}</span>
        <div class="nm"><b>${_esc(handle)}</b><span>Instagram</span></div>
        <span class="ic">${_ICON.phone}</span>
      </div>
      <div class="ig-th" id="dmpvTh"><div class="ig-sp"></div></div>
      <div class="ig-bt">
        <div class="ig-chips" id="dmpvChips"></div>
        <div class="ig-in">
          <span class="ig-cam">${_ICON.cam}</span>
          <div class="ig-fake">메시지 보내기...</div>
        </div>
      </div>`;
  }

  function _th() { return document.getElementById('dmpvTh'); }
  function _toBottom() { const t = _th(); if (t) t.scrollTop = t.scrollHeight; }

  function _append(html) {
    const t = _th();
    if (!t) return;
    t.insertAdjacentHTML('beforeend', html);
    _toBottom();
  }

  function _bubbleIn(text) { _append(`<div class="b in">${_esc(text)}</div>`); }
  function _bubbleOut(text) { _append(`<div class="gap"></div><div class="b out">${_esc(text)}</div><div class="gap"></div>`); }
  function _bubbleImg(url) { _append(`<div class="b in img"><img src="${_esc(url)}" alt=""></div>`); }

  function _renderChips() {
    const box = document.getElementById('dmpvChips');
    if (!box) return;
    const chips = (_data && _data.chips) || [];
    box.innerHTML = chips.map(c =>
      `<button type="button" class="ig-chip" data-pv-chip="${_esc(c.key)}">${_esc(c.label)}</button>`).join('');
    box.classList.remove('hide');
  }

  // 설정이 비어 답을 못 만드는 지점 — 가짜로 채우지 않고 그대로 드러내고 점프 버튼을 준다.
  function _needCard(need, action) {
    const label = (need && need.label) || '설정값';
    const who = action === 'book_form'
      ? '손님에게 아무것도 안 나가고, 나한테 "직접 안내해주세요" 알림만 와요.'
      : '손님에게 아무것도 안 나가고, 나한테 알림만 와요.';
    return `
      <div class="warn">
        <div class="wt">${_esc(label)}이(가) 아직 비어 있어요</div>
        <div class="ws">${_esc(who)}</div>
        <button type="button" data-pv-jump="${_esc((need && need.field) || '')}">지금 채우기</button>
      </div>`;
  }

  function _tap(key) {
    const item = (_data && _data.items && _data.items[key]) || null;
    const chip = ((_data && _data.chips) || []).find(c => c.key === key);
    if (!item || !chip) return;
    _haptic();
    // 인스타는 칩을 누르면 칩이 사라진다 → 자동답(텍스트)에 다시 붙어야 다시 뜬다. 그대로 재현.
    const box = document.getElementById('dmpvChips');
    if (box) box.classList.add('hide');
    _bubbleOut(chip.label);

    const steps = [];
    (item.images || []).forEach(u => steps.push(() => _bubbleImg(u)));
    (item.messages || []).forEach(m => steps.push(() => _bubbleIn(m)));
    if (item.needs_setup || item.location_card) steps.push(() => _append(_needCard(item.needs_setup, item.action)));
    if (item.owner_queue) {
      steps.push(() => _append(
        `<div class="note"><b>여기까지가 손님이 받는 전부</b> — 이어서 나한테 알림이 와요: “${_esc(item.owner_queue)}”</div>`));
    }
    if (!steps.length) {
      steps.push(() => _append('<div class="note"><b>손님에게 나가는 게 없어요</b> — 이 버튼은 지금 아무것도 안 보내요.</div>'));
    }

    let i = 0;
    const run = () => {
      if (i >= steps.length) {
        // 텍스트 답장이 하나라도 나갔으면 칩 재첨부(실제 동작과 동일). 아니면 칩은 사라진 채로 둔다.
        if (box && (item.messages || []).length > 0) { box.classList.remove('hide'); box.scrollLeft = 0; }
        _toBottom();
        return;
      }
      steps[i++]();
      setTimeout(run, 260);
    };
    setTimeout(run, 220);
  }

  function _jump(field) {
    closeDMPreview();
    if (field === 'price') {
      if (typeof window.openPricelistUpload === 'function') return window.openPricelistUpload();
      return _toast('가격표 설정 화면을 찾을 수 없어요');
    }
    if (field === 'booking_form') {
      if (typeof window.DMMenuExpand === 'function') return window.DMMenuExpand('BOOK_FORM');
      return _toast('예약하기 항목을 열어 양식을 채워주세요');
    }
    // address / business_hours → 샵 설정
    if (typeof window.openShopSettings === 'function') return window.openShopSettings();
    _toast('설정 화면을 찾을 수 없어요');
  }

  function _onClick(e) {
    if (e.target.closest('[data-pv-close]')) { closeDMPreview(); return; }
    const chip = e.target.closest('[data-pv-chip]');
    if (chip) { _tap(chip.getAttribute('data-pv-chip')); return; }
    const jump = e.target.closest('[data-pv-jump]');
    if (jump) { _jump(jump.getAttribute('data-pv-jump')); return; }
  }

  async function _load() {
    const ig = document.getElementById('dmpvIg');
    if (!ig) return;
    try {
      const res = await window.apiFetch(window.apiUrl('/instagram/dm-reply/dm-menu/preview'), {
        headers: window.authHeader ? window.authHeader() : {},
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      _data = await res.json();
    } catch (e) {
      ig.innerHTML = `<div class="dmpv-load">미리보기를 못 불러왔어요<br><span style="font-size:11.5px">${_esc((e && e.message) || '네트워크 오류')}</span></div>`;
      return;
    }
    ig.innerHTML = _shell();
    if (_data.greeting) _bubbleIn(_data.greeting);
    _renderChips();
    _toBottom();
  }

  function openDMPreview() {
    if (_busy) return;
    const el = _ensureMounted();
    const ig = document.getElementById('dmpvIg');
    if (ig) ig.innerHTML = '<div class="dmpv-load">불러오는 중…</div>';
    _data = null;
    requestAnimationFrame(() => el.classList.add('is-open'));
    el.setAttribute('aria-hidden', 'false');
    // 뒤로가기 등록 — 안 하면 안드로이드 back 에서 이 팝업 대신 앱이 꺼진다.
    if (typeof window._registerSheet === 'function') window._registerSheet('dmPreview', closeDMPreview);
    if (typeof window._markSheetOpen === 'function') window._markSheetOpen('dmPreview');
    _haptic();
    _busy = true;
    _load().finally(() => { _busy = false; });
  }

  function closeDMPreview() {
    const el = document.getElementById(ID);
    if (!el) return;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    if (typeof window._markSheetClosed === 'function') window._markSheetClosed('dmPreview');
    _haptic();
  }

  window.openDMPreview = openDMPreview;
  window.closeDMPreview = closeDMPreview;
})();
