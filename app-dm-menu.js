/* 인스타DM 손님 응대 (DM Quick Replies + Ice Breakers) 설정 — [2026-06-20, 2026-08-16 개명]
   진입: window.openDMMenuSettings()
   [2026-08-16] 인스타DM 화면 3개→1개 통합 — AI 허브(마스터 토글)·DM 오버뷰 파일 삭제,
   이 화면이 유일한 인스타DM 설정. 마스터 on/off 토글과 서버 동기화(_syncDmMenuEnabled)를 AI 허브에서 이관.
   BE: GET/PUT /shop/dm-menu (services/dm_menu.py). 고정5 key/action 불변, label/resp/ack/enabled + 커스텀(≤13) 편집.
   디자인: 흰바탕·로즈 포인트·검정 CTA, 그라데이션 X, .subscreen-overlay 재사용(PC 사이드바 자동 안전).
*/
(function () {
  'use strict';
  const ID = 'dmMenuOverlay';
  function _esc(s) { return window._esc ? window._esc(s) : String(s == null ? '' : s); }
  function _toast(m) { if (window.showToast) window.showToast(m); }
  function _haptic() { try { window.hapticLight && window.hapticLight(); } catch (_e) { void _e; } }

  const LABEL_MAX = 20, MAX_ITEMS = 13, ICE_MAX = 4;
  // 고정 항목 설명 + 편집 필드(resp/ack/none) + 토큰 안내
  const FIXED_META = {
    BOOK_FORM: { mt: '예약 양식 보내기', ms: '탭하면 → 손님에게 양식 바로 발송', edit: 'booking' },
    HOURS:     { mt: '영업시간 자동 안내', ms: '영업시간을 바로 답장', edit: 'resp', token: '{영업시간}' },
    LOCATION:  { mt: '위치·주소 자동 안내', ms: '샵 주소를 바로 답장', edit: 'resp', token: '{주소}' },
    PRICE:     { mt: '가격표 자동 안내', ms: '등록한 가격표를 바로 답장', edit: 'resp', token: '{가격표}' },
    OTHER:     { mt: '사장님이 직접 답장', ms: '확인 멘트 보낸 뒤 큐에 올림', edit: 'ack' },
  };
  const FIXED_ORDER = ['BOOK_FORM', 'HOURS', 'LOCATION', 'PRICE', 'OTHER'];
  const DEFAULT_LABEL = { BOOK_FORM: '예약하기', HOURS: '영업시간', LOCATION: '오시는 길', PRICE: '가격 문의', OTHER: '상세문의' };

  let _menu = null;
  const _open = new Set();   // 펼쳐진 항목 key

  function _defaultMenu() {
    return {
      enabled: false,
      greeting: '문의 감사합니다 😊 어떤 게 궁금하세요? 아래에서 골라주세요.',
      items: FIXED_ORDER.map(k => ({
        key: k, label: DEFAULT_LABEL[k], enabled: k !== 'PRICE',
        action: { BOOK_FORM: 'book_form', HOURS: 'hours', LOCATION: 'location', PRICE: 'price', OTHER: 'owner_queue' }[k],
        resp: { HOURS: '영업시간 안내드려요 🕐\n{영업시간}', LOCATION: '오시는 길 안내드려요 📍\n{주소}', PRICE: '가격 안내드려요 💰\n{가격표}' }[k] || '',
        ack: k === 'OTHER' ? '문의남겨주시면 상세히 답변드릴게요' : '',
        image_urls: [],
        custom: false,
      })),
      ice_breakers: ['BOOK_FORM', 'HOURS', 'LOCATION'],
    };
  }
  function _items() { return (_menu && _menu.items) || []; }
  function _itemOf(key) { return _items().find(i => i.key === key); }
  function _isCustom(it) { return !!it.custom || (it.key || '').indexOf('CUSTOM_') === 0; }
  function _editKind(it) {
    if (_isCustom(it)) return it.action === 'owner_direct' ? 'ack' : 'resp';
    return (FIXED_META[it.key] || {}).edit || 'none';
  }

  // ── [2026-06-25] 영업시간/주소/가격표 — 토큰은 화면에 안 보이고, resp 맨끝에 1개만 숨겨 저장 ──
  //   사용자는 '인사 멘트'만 편집. 실제 데이터는 BE 가 토큰 자리에 치환해 발송(기존 _subst 유지).
  const _TOKEN = { HOURS: '{영업시간}', LOCATION: '{주소}', PRICE: '{가격표}' };
  const _DATA_LABEL = { HOURS: '영업시간', LOCATION: '주소', PRICE: '가격표' };
  const _JUMP = { HOURS: 'hours', LOCATION: 'address', PRICE: 'price' };
  function _isFixedData(key) { return key === 'HOURS' || key === 'LOCATION' || key === 'PRICE'; }
  // 처음 열 때 메뉴 = 켠 메뉴를 앞에서부터 최대 ICE_MAX 개 (인스타 제한)
  function _computeIce() { return _items().filter(it => it.enabled).map(it => it.key).slice(0, ICE_MAX); }
  // resp 끝의 숨은 토큰 1개만 제거 → 인사 멘트만 반환 (공백·줄바꿈 변형 흡수, 본문 중간 { 는 무시)
  function _stripToken(resp, key) {
    const tok = _TOKEN[key];
    if (!tok || !resp) return resp || '';
    const esc = tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return resp.replace(new RegExp('\\s*' + esc + '\\s*$'), '').replace(/\s+$/, '');
  }
  // 저장용: 인사 멘트 + 맨끝 토큰 1개 (항상 정확히 1개)
  function _withToken(greet, key) {
    const tok = _TOKEN[key];
    const g = (greet || '').replace(/\s+$/, '');
    if (!tok) return g;
    return g ? (g + '\n' + tok) : tok;
  }

  // ── 미리보기용 실제 저장값 (영업시간/주소/가격표) — 설정 읽기라 사실상 공짜, 무조건 fetch ──
  let _real = null; // { HOURS, LOCATION, PRICE }
  function _won(p) { const n = Number(p); return (p === '' || p == null || isNaN(n)) ? String(p || '') : n.toLocaleString('ko-KR') + '원'; }
  async function _fetchReal() {
    const out = { HOURS: '', LOCATION: '', PRICE: '' };
    const auth = window.authHeader ? window.authHeader() : {};
    try {
      const res = await apiFetch(apiUrl('/shop/settings'), { headers: auth });
      if (res.ok) {
        const d = await res.json().catch(() => null) || {};
        out.HOURS = (d.hours || '').toString().trim();
        out.LOCATION = (d.address || '').toString().trim();
      }
    } catch (_e) { void _e; }
    try { if (!out.HOURS) out.HOURS = (localStorage.getItem('itdasy_shop_hours') || '').trim(); } catch (_e) { void _e; }
    try { if (!out.LOCATION) out.LOCATION = (localStorage.getItem('itdasy_shop_addr') || '').trim(); } catch (_e) { void _e; }
    try {
      const list = (window.ServiceTemplates && window.ServiceTemplates.list) ? await window.ServiceTemplates.list() : null;
      const arr = Array.isArray(list) ? list : (list && Array.isArray(list.items) ? list.items : []);
      out.PRICE = arr.filter(s => s && s.name).slice(0, 12)
        .map(s => `${s.name}${(s.default_price != null && s.default_price !== '') ? ' ' + _won(s.default_price) : ''}`)
        .join('\n').trim();
    } catch (_e) { void _e; }
    _real = out;
    _refreshPreviews();
  }
  // 미리보기 = 인사 멘트(라이브) + 실제 저장값. 값이 진짜 비면 회색 안내(아직 설정 안 한 신규 원장).
  function _previewText(key, greet) {
    const val = (_real && _real[key]) || '';
    const g = (greet || '').replace(/\s+$/, '');
    if (val) return (g ? g + '\n' : '') + val;
    return (g ? g + '\n' : '') + `(아직 ${_DATA_LABEL[key]}을 설정 안 했어요 — 아래 '${_DATA_LABEL[key]} 수정'에서 추가하면 여기에 보여요)`;
  }
  function _refreshPreviews() {
    document.querySelectorAll(`#${ID} [data-preview]`).forEach(node => {
      const key = node.getAttribute('data-preview');
      const it = _itemOf(key);
      node.textContent = _previewText(key, it ? it.resp : '');
      node.classList.toggle('dmm-pv-empty', !(_real && _real[key]));
    });
  }

  function _styleOnce() {
    if (document.getElementById('dmMenuStyle')) return;
    const s = document.createElement('style');
    s.id = 'dmMenuStyle';
    s.textContent = `
      #${ID} .dmm-note{font-size:12.5px;color:var(--text-muted,#4E5968);line-height:1.5;background:var(--brand-bg,#F7EFF0);border:.5px solid rgba(0,0,0,.08);border-radius:14px;padding:11px 13px;margin-bottom:14px}
      #${ID} .dmm-sec{font-size:12px;font-weight:700;color:var(--text-subtle,#8B95A1);margin:14px 4px 6px}
      #${ID} .dmm-card{background:#fff;border:.5px solid rgba(0,0,0,.08);border-radius:18px;overflow:hidden}
      #${ID} .dmm-master{display:flex;align-items:center;gap:12px;padding:15px 14px}
      #${ID} .dmm-master .t{flex:1;min-width:0}
      #${ID} .dmm-master .t b{font-size:15px;font-weight:800;color:#191F28}
      #${ID} .dmm-master .t span{display:block;font-size:11.5px;color:#8B95A1;margin-top:2px}
      #${ID} .dmm-greet{padding:13px 14px}
      #${ID} textarea,#${ID} .dmm-lblin{font-family:inherit;outline:none;color:#191F28;box-sizing:border-box}
      #${ID} .dmm-greet textarea{width:100%;border:.5px solid rgba(0,0,0,.12);border-radius:12px;padding:11px 12px;font-size:13.5px;line-height:1.5;resize:none}
      #${ID} textarea:focus,#${ID} .dmm-lblin:focus{border-color:var(--brand,#D58A95)}
      #${ID} .dmm-it{border-bottom:.5px solid rgba(0,0,0,.06)}
      #${ID} .dmm-it:last-child{border-bottom:0}
      #${ID} .dmm-row{display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:pointer}
      #${ID} .dmm-chip{font-size:13px;font-weight:800;color:var(--brand-strong,#BC6675);background:var(--brand-bg,#F7EFF0);border:.5px solid rgba(0,0,0,.08);border-radius:999px;padding:6px 12px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #${ID} .dmm-tx{flex:1;min-width:0}
      #${ID} .dmm-tx .mt{font-size:13px;font-weight:700;color:#191F28}
      #${ID} .dmm-tx .ms{font-size:11px;color:#8B95A1;margin-top:1px}
      #${ID} .dmm-caret{color:#C9CDD4;transition:transform .2s;flex:none;display:inline-flex}
      #${ID} .dmm-caret.open{transform:rotate(180deg)}
      #${ID} .dmm-body{padding:0 14px 14px;display:flex;flex-direction:column;gap:9px}
      #${ID} .dmm-fld{font-size:11px;font-weight:700;color:#8B95A1;margin-bottom:-3px}
      #${ID} .dmm-lblin{width:100%;border:.5px solid rgba(0,0,0,.12);border-radius:10px;padding:9px 11px;font-size:13px;font-weight:700}
      #${ID} .dmm-cnt{font-size:10.5px;color:#B0B8C1;text-align:right}
      #${ID} .dmm-resp{width:100%;border:.5px solid rgba(0,0,0,.12);border-radius:10px;padding:9px 11px;font-size:13px;line-height:1.5;resize:none;min-height:62px}
      /* [2026-08-16] 초록 약속 안내 — 삭제된 DM 오버뷰 화면의 초록 박스 이관 */
      #${ID} .dmm-green{display:flex;gap:11px;background:#EAF7EF;border:.5px solid #B6E3C6;border-radius:16px;padding:14px 15px}
      #${ID} .dmm-green .ico{flex:none;color:#16A34A;margin-top:1px}
      #${ID} .dmm-green b{display:block;font-size:13px;font-weight:800;color:#15803D;margin-bottom:3px}
      #${ID} .dmm-green p{font-size:12px;line-height:1.5;color:#3F7A54;margin:0}
      #${ID} .dmm-pv{white-space:pre-wrap;font-size:12.5px;line-height:1.55;color:#191F28;background:#F7F8FA;border:.5px solid rgba(0,0,0,.08);border-radius:10px;padding:10px 12px}
      #${ID} .dmm-pv.dmm-pv-empty{color:#B0B8C1}
      #${ID} .dmm-jump{align-self:flex-start;font-size:12.5px;font-weight:700;color:var(--brand-strong,#BC6675);background:none;border:none;padding:4px 0;cursor:pointer;font-family:inherit}
      #${ID} .dmm-seg{display:flex;gap:6px}
      #${ID} .dmm-seg button{flex:1;font-size:12px;font-weight:700;padding:8px;border-radius:10px;border:.5px solid rgba(0,0,0,.12);background:#F7F8FA;color:#4E5968;cursor:pointer;font-family:inherit}
      #${ID} .dmm-seg button.on{background:#191F28;color:#fff;border-color:#191F28}
      #${ID} .dmm-del{align-self:flex-start;font-size:12px;font-weight:700;color:#D95F70;background:none;border:none;padding:4px 0;cursor:pointer}
      #${ID} .dmm-img{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      #${ID} .dmm-img-thumb{position:relative;width:64px;height:64px;border-radius:12px;overflow:hidden;border:.5px solid rgba(0,0,0,.12);flex:none;background:#F7F8FA}
      #${ID} .dmm-img-thumb img{width:100%;height:100%;object-fit:cover;display:block}
      #${ID} .dmm-img-del{position:absolute;top:3px;right:3px;width:19px;height:19px;border-radius:50%;border:none;background:rgba(0,0,0,.55);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}
      #${ID} .dmm-img-add{display:inline-flex;align-items:center;font-size:12.5px;font-weight:700;color:var(--brand-strong,#BC6675);background:var(--brand-bg,#F7EFF0);border:.5px solid rgba(0,0,0,.08);border-radius:12px;padding:10px 14px;cursor:pointer}
      #${ID} .dmm-img-full{display:inline-flex;align-items:center;font-size:11.5px;font-weight:700;color:#B0B8C1}
      #${ID} .dmm-addbtn{width:100%;padding:13px;border:1px dashed rgba(0,0,0,.18);background:#fff;border-radius:14px;font-size:13px;font-weight:700;color:#4E5968;cursor:pointer;font-family:inherit;margin-top:10px}
      #${ID} .dmm-dim{opacity:.45;pointer-events:none}
      /* 쫀득 토글 — 노브 바운스 + 누를 때 살짝 늘었다 튕김 */
      #${ID} .dmm-tg{width:44px;height:26px;border-radius:99px;background:#E2E6EB;position:relative;flex:none;border:none;padding:0;cursor:pointer;transition:background .18s}
      #${ID} .dmm-tg.on{background:#16B55E}
      #${ID} .dmm-tg::after{content:"";position:absolute;top:2.5px;left:2.5px;width:21px;height:21px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.22);transition:left .24s cubic-bezier(.34,1.56,.64,1),width .12s ease}
      #${ID} .dmm-tg.on::after{left:20.5px}
      #${ID} .dmm-tg:active::after{width:26px}
      #${ID} .dmm-tg.on:active::after{left:15.5px}
    `;
    document.head.appendChild(s);
  }

  function _ensureMounted() {
    let el = document.getElementById(ID);
    if (el) return el;
    _styleOnce();
    el = document.createElement('div');
    el.id = ID;
    el.className = 'subscreen-overlay';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <header class="ss-topbar">
        <button type="button" class="ss-back" data-dmm-back aria-label="뒤로"><svg width="14" height="14" aria-hidden="true"><use href="#ic-chevron-left"/></svg></button>
        <div class="ss-title">인스타DM 손님 응대</div>
        <button type="button" class="ss-action" data-dmm-save>저장</button>
      </header>
      <div class="ss-body"><div id="dmmBody"></div></div>`;
    document.body.appendChild(el);
    el.querySelector('[data-dmm-back]').addEventListener('click', closeDMMenuSettings);
    el.querySelector('[data-dmm-save]').addEventListener('click', _save);
    const body = el.querySelector('#dmmBody');
    body.addEventListener('click', _onClick);
    body.addEventListener('input', _onInput);
    body.addEventListener('change', _onChange);
    return el;
  }

  function _caret(open) {
    return `<span class="dmm-caret ${open ? 'open' : ''}" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span>`;
  }
  function _tgHtml(on, kind, key) {
    return `<button type="button" class="dmm-tg ${on ? 'on' : ''}" data-tg="${kind}" data-key="${_esc(key || '')}" aria-pressed="${on}" aria-label="켜기"></button>`;
  }

  function _itemEditor(it) {
    const kind = _editKind(it);
    const meta = FIXED_META[it.key] || {};
    const lblCount = (it.label || '').length;
    let fields = `
      <div class="dmm-fld">버튼 글자 (손님에게 보임)</div>
      <input class="dmm-lblin" data-lbl="${_esc(it.key)}" maxlength="${LABEL_MAX}" value="${_esc(it.label || '')}" placeholder="예: 예약하기">
      <div class="dmm-cnt"><span data-cnt="${_esc(it.key)}">${lblCount}</span>/${LABEL_MAX}</div>`;
    let pvBlock = '';  // '이렇게 답장돼요' 미리보기 — 멘트·수정·첨부 다음 맨 마지막에 붙임
    if (kind === 'booking') {
      // 예약 양식 편집기 — 공용 모듈(DMBookingForm)이 마운트(데이터는 자동응답 설정 채널)
      fields += `<div class="dmm-booking" data-booking-mount></div>`;
    } else if (meta.edit === 'none') {
      fields += `<div class="dmm-fld" style="color:#B0B8C1;">${_esc(meta.editNote || '')}</div>`;
    } else if (kind === 'resp' && _isFixedData(it.key)) {
      // 영업시간/주소/가격표 — 인사 멘트만 편집. 실제 데이터는 미리보기로 보이고 발송 시 자동으로 붙음.
      const ph = { HOURS: '영업시간 안내드려요 🕐', LOCATION: '오시는 길 안내드려요 📍', PRICE: '가격 안내드려요 💰' }[it.key] || '';
      const pvEmpty = (_real && _real[it.key]) ? '' : ' dmm-pv-empty';
      fields += `<div class="dmm-fld">인사 멘트</div>
        <textarea class="dmm-resp" data-resp="${_esc(it.key)}" maxlength="500" placeholder="예: ${_esc(ph)}">${_esc(it.resp || '')}</textarea>
        <button type="button" class="dmm-jump" data-jump="${_esc(it.key)}">${_esc(_DATA_LABEL[it.key])} 수정 →</button>`;
      pvBlock = `<div class="dmm-fld">이렇게 답장돼요</div>
        <div class="dmm-pv${pvEmpty}" data-preview="${_esc(it.key)}">${_esc(_previewText(it.key, it.resp))}</div>`;
    } else if (kind === 'resp') {
      fields += `<div class="dmm-fld">응답 멘트</div>
        <textarea class="dmm-resp" data-resp="${_esc(it.key)}" maxlength="600" placeholder="손님에게 보낼 답장">${_esc(it.resp || '')}</textarea>`;
    } else if (kind === 'ack') {
      fields += `<div class="dmm-fld">확인 멘트 (보낸 뒤 사장님 큐로)</div>
        <textarea class="dmm-resp" data-ack="${_esc(it.key)}" maxlength="300" placeholder="예: 문의 확인했어요! 곧 답장드릴게요 🙏">${_esc(it.ack || '')}</textarea>`;
    }
    // 사진 첨부 — 모든 항목 공통, 최대 2장. 버튼 탭 시 손님에게 사진을 같이 보냄(가격표·시술설명 등).
    const _imgs = Array.isArray(it.image_urls) ? it.image_urls.slice(0, 2) : [];
    const _thumbs = _imgs.map((u, i) => `<div class="dmm-img-thumb"><img src="${_esc(u)}" alt="첨부 사진">
          <button type="button" class="dmm-img-del" data-img-del="${_esc(it.key)}" data-img-idx="${i}" aria-label="사진 삭제"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>`).join('');
    const _addBtn = _imgs.length >= 2
      ? `<span class="dmm-img-full">2장 다 채웠어요</span>`
      : `<label class="dmm-img-add"><input type="file" accept="image/*" data-img-file="${_esc(it.key)}" hidden><span>+ 사진 추가</span></label>`;
    fields += `
      <div class="dmm-fld">사진 첨부 <span style="color:#B0B8C1;font-weight:600;">(버튼 누르면 손님에게 같이 전송 · 최대 2장)</span></div>
      <div class="dmm-img">${_thumbs}${_addBtn}</div>`;
    fields += pvBlock;  // '이렇게 답장돼요' 는 항상 맨 마지막(멘트·수정·첨부 본 뒤 결과 확인)
    if (_isCustom(it)) {
      const at = it.action === 'owner_direct' ? 'owner_direct' : 'auto_text';
      fields += `
        <div class="dmm-fld">응답 방식</div>
        <div class="dmm-seg">
          <button type="button" data-act-set="auto_text" data-key="${_esc(it.key)}" class="${at === 'auto_text' ? 'on' : ''}">자동 답장</button>
          <button type="button" data-act-set="owner_direct" data-key="${_esc(it.key)}" class="${at === 'owner_direct' ? 'on' : ''}">사장님 직접</button>
        </div>
        <button type="button" class="dmm-del" data-del="${_esc(it.key)}">이 메뉴 삭제</button>`;
    }
    return `<div class="dmm-body">${fields}</div>`;
  }

  function _render() {
    const body = document.getElementById('dmmBody');
    if (!body || !_menu) return;
    const dim = _menu.enabled ? '' : ' dmm-dim';
    const rows = _items().map(it => {
      const meta = FIXED_META[it.key] || { mt: it.label || it.key, ms: it.action === 'owner_direct' ? '확인 멘트 후 사장님 직접 답장' : '자동 답장' };
      const open = _open.has(it.key);
      return `
        <div class="dmm-it">
          <div class="dmm-row" data-exp="${_esc(it.key)}">
            <span class="dmm-chip">${_esc(it.label || it.key)}</span>
            <div class="dmm-tx"><div class="mt">${_esc(meta.mt)}</div><div class="ms">${_esc(meta.ms)}</div></div>
            ${_caret(open)}
            ${_tgHtml(it.enabled, 'item', it.key)}
          </div>
          ${open ? _itemEditor(it) : ''}
        </div>`;
    }).join('');
    const iceOn = (_menu.ice_breakers || []).length > 0;
    // [2026-08-16] 마스터 토글 — ai-hub 삭제로 여기가 유일한 on/off. _menu.enabled 를 스위치로 노출.
    body.innerHTML = `
      <div class="dmm-card" style="margin-bottom:14px;">
        <div class="dmm-master">
          <div class="t"><b>인스타DM 손님 응대</b><span>끄면 손님 DM 에 버튼·자동 안내가 안 나가요</span></div>
          ${_tgHtml(!!_menu.enabled, 'master', '')}
        </div>
      </div>
      <div class="dmm-note">손님이 DM 보내면 이렇게 응대해요</div>
      <div class="dmm-sec">① 손님이 DM 보내면 이렇게 인사해요</div>
      <div class="dmm-card dmm-greet${dim}"><textarea rows="2" data-greet maxlength="300">${_esc(_menu.greeting || '')}</textarea></div>
      <div class="dmm-sec">② 손님이 누를 버튼 <span style="font-weight:600;color:#B0B8C1;">켠 것만 손님에게 보여요 · 탭하면 그 자리에서 편집돼요</span></div>
      <div class="dmm-card${dim}">${rows}</div>
      <button type="button" class="dmm-addbtn${dim}" data-add>+ 메뉴 추가</button>
      <div class="dmm-sec">③ 손님이 대화창을 처음 열면</div>
      <div class="dmm-card${dim}">
        <div class="dmm-master">
          <div class="t"><b>먼저 버튼 보여주기</b><span>손님이 아직 아무 말 안 해도 켠 버튼을 미리 띄워줘요 (최대 ${ICE_MAX}개)</span></div>
          ${_tgHtml(iceOn, 'ice', '')}
        </div>
      </div>
      <div class="dmm-green" style="margin-top:14px;">
        <span class="ico" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
        <div>
          <b>손님한텐 잇비가 마음대로 답장 안 해요</b>
          <p>잇비가 답장을 써두면, 원장님이 보고 '보내기'를 눌러야 나갑니다.</p>
        </div>
      </div>`;
    // 예약하기 펼쳐져 있으면 예약 양식 편집기 마운트(공용 모듈)
    if (_open.has('BOOK_FORM') && window.DMBookingForm) {
      const m = body.querySelector('[data-booking-mount]');
      if (m) window.DMBookingForm.mount(m);
    }
  }

  function _onClick(e) {
    const tg = e.target.closest('.dmm-tg');
    if (tg) {
      e.stopPropagation();
      const kind = tg.getAttribute('data-tg');
      if (kind === 'master') {
        // [2026-08-16] 마스터 on/off — 화면 상태 즉시 반영 + 서버엔 enabled 만 동기화(아래 이관 함수).
        _menu.enabled = !_menu.enabled;
        _haptic(); _render();
        _syncDmMenuEnabled(_menu.enabled);
        return;
      }
      if (kind === 'ice') {
        // 처음 열 때 메뉴 — ON: 켠 메뉴 앞에서 최대 4개 자동 / OFF: 비움 (BE 필드 추가 X, 상태=비었나로 판정)
        _menu.ice_breakers = (_menu.ice_breakers || []).length > 0 ? [] : _computeIce();
      } else { const it = _itemOf(tg.getAttribute('data-key')); if (it) it.enabled = !it.enabled; }
      _haptic(); _render(); return;
    }
    const actSet = e.target.closest('[data-act-set]');
    if (actSet) {
      const it = _itemOf(actSet.getAttribute('data-key'));
      if (it) { it.action = actSet.getAttribute('data-act-set'); _haptic(); _render(); }
      return;
    }
    const imgDel = e.target.closest('[data-img-del]');
    if (imgDel) {
      const it = _itemOf(imgDel.getAttribute('data-img-del'));
      const idx = parseInt(imgDel.getAttribute('data-img-idx'), 10);
      if (it && Array.isArray(it.image_urls) && idx >= 0) { it.image_urls.splice(idx, 1); _haptic(); _render(); }
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      const k = del.getAttribute('data-del');
      _menu.items = _items().filter(i => i.key !== k);
      _menu.ice_breakers = (_menu.ice_breakers || []).filter(x => x !== k);
      _open.delete(k); _haptic(); _render(); return;
    }
    const add = e.target.closest('[data-add]');
    if (add) {
      if (_items().length >= MAX_ITEMS) { _toast(`메뉴는 최대 ${MAX_ITEMS}개예요`); return; }
      let n = 1; while (_itemOf('CUSTOM_' + n)) n++;
      const key = 'CUSTOM_' + n;
      _menu.items.push({ key, label: '새 메뉴', enabled: true, action: 'auto_text', resp: '', ack: '', image_urls: [], custom: true });
      _open.add(key); _haptic(); _render(); return;
    }
    const jump = e.target.closest('[data-jump]');
    if (jump) {
      // 영업시간/주소/가격표 설정 화면으로 점프 (현재 편집 화면은 뒤에 유지)
      const k = jump.getAttribute('data-jump');
      if (k === 'PRICE') {
        if (typeof window.openPricelistUpload === 'function') window.openPricelistUpload();
        else _toast('가격표 설정 화면을 찾을 수 없어요');
      } else {
        // TODO: 영업시간/주소 전용 섹션 앵커가 생기면 연결. 현재는 샵 설정 화면 진입.
        if (typeof window.openShopSettings === 'function') window.openShopSettings();
        else _toast('설정 화면을 찾을 수 없어요');
      }
      _haptic(); return;
    }
    const exp = e.target.closest('[data-exp]');
    if (exp) {
      const k = exp.getAttribute('data-exp');
      if (_open.has(k)) _open.delete(k); else _open.add(k);
      _render();
    }
  }

  function _onInput(e) {
    const t = e.target;
    if (t.matches('[data-greet]')) { _menu.greeting = t.value; return; }
    if (t.matches('[data-lbl]')) {
      const it = _itemOf(t.getAttribute('data-lbl'));
      if (it) it.label = t.value;
      const cnt = document.querySelector(`#${ID} [data-cnt="${t.getAttribute('data-lbl')}"]`);
      if (cnt) cnt.textContent = (t.value || '').length;
      return;
    }
    if (t.matches('[data-resp]')) {
      const it = _itemOf(t.getAttribute('data-resp'));
      if (it) {
        it.resp = t.value;
        if (_isFixedData(it.key)) {
          const pv = document.querySelector(`#${ID} [data-preview="${it.key}"]`);
          if (pv) { pv.textContent = _previewText(it.key, it.resp); pv.classList.toggle('dmm-pv-empty', !(_real && _real[it.key])); }
        }
      }
      return;
    }
    if (t.matches('[data-ack]')) { const it = _itemOf(t.getAttribute('data-ack')); if (it) it.ack = t.value; }
  }

  function _onChange(e) {
    const f = e.target.closest('[data-img-file]');
    if (f && f.files && f.files[0]) _uploadImage(f.files[0], f.getAttribute('data-img-file'));
  }

  // 사진 업로드 → Supabase 공개 URL → 항목 image_urls 에 추가(최대 2장). 발송은 손님이 버튼 탭 시.
  async function _uploadImage(file, key) {
    const it = _itemOf(key);
    if (!it || !file) return;
    if (!Array.isArray(it.image_urls)) it.image_urls = [];
    if (it.image_urls.length >= 2) { _toast('사진은 최대 2장이에요'); return; }
    if (!/^image\//.test(file.type || '')) { _toast('이미지 파일만 올릴 수 있어요'); return; }
    if (file.size > 10 * 1024 * 1024) { _toast('10MB 이하 이미지만 가능해요'); return; }
    _toast('사진 올리는 중…');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiFetch(apiUrl('/image/upload'), {
        method: 'POST',
        headers: { ...(window.authHeader ? window.authHeader() : {}) },  // Content-Type 은 브라우저가 multipart 로 설정
        body: fd,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.url) throw new Error(d.detail || ('HTTP ' + res.status));
      if (!Array.isArray(it.image_urls)) it.image_urls = [];
      it.image_urls.push(d.url);
      it.image_urls = it.image_urls.slice(0, 2);
      _haptic(); _render();
      _toast('사진 추가됐어요 ✓');
    } catch (err) {
      _toast('사진 업로드 실패: ' + (err && err.message ? err.message : '네트워크 오류'));
    }
  }

  // ── 마스터 enabled 백엔드 반영 — 반드시 GET 먼저 → 그 객체에서 enabled 만 바꿔 PUT.
  //   (편집 중인 로컬 _menu 를 PUT 소스로 쓰면 저장 안 누른 수정까지 서버에 날아감. 동봉 소스 = GET 결과로 고정.)
  //   [2026-08-16] 삭제된 AI 허브에서 그대로 이관 — _dmMenuSyncSeq 연타 레이스 방지 포함.
  let _dmMenuSyncSeq = 0; // 토글 연타 시 GET→PUT 레이스 방지 — 최신 토글만 서버 반영
  async function _syncDmMenuEnabled(on) {
    const seq = ++_dmMenuSyncSeq;
    try {
      const auth = window.authHeader ? window.authHeader() : {};
      const res = await window.apiFetch(window.apiUrl('/shop/dm-menu'), { headers: auth });
      if (seq !== _dmMenuSyncSeq) return; // 더 최근 토글이 있었음 — 이 GET 결과 폐기(중복 PUT 방지)
      const menu = await res.json().catch(() => null);
      if (!menu || typeof menu !== 'object' || !Array.isArray(menu.items)) {
        throw new Error('메뉴를 불러오지 못했어요');
      }
      menu.enabled = !!on; // enabled 만 변경, items/greeting/ice_breakers 는 GET 결과 그대로 동봉
      const put = await window.apiFetch(window.apiUrl('/shop/dm-menu'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify(menu),
      });
      if (seq !== _dmMenuSyncSeq) return; // PUT 도중 또 토글됨 — 최신 sync 가 정정하므로 이 결과 무시
      if (!put.ok) throw new Error('HTTP ' + put.status);
    } catch (_e) {
      if (seq !== _dmMenuSyncSeq) return; // stale — 최신 토글이 상태 소유, 롤백하지 않음
      // 실패 → 화면 상태 롤백
      _menu.enabled = !on;
      _render();
      _toast('인스타DM 손님 응대 ' + (on ? '켜기' : '끄기') + ' 실패 — 다시 시도해주세요');
    }
  }

  async function _hydrate() {
    try {
      const res = await apiFetch(apiUrl('/shop/dm-menu'), { headers: window.authHeader ? window.authHeader() : {} });
      const d = await res.json().catch(() => null);
      _menu = (d && typeof d === 'object' && Array.isArray(d.items)) ? d : _defaultMenu();
    } catch (_e) { _menu = _defaultMenu(); }
    if (!Array.isArray(_menu.items) || !_menu.items.length) _menu.items = _defaultMenu().items;
    // 영업시간/주소/가격표 — 저장된 resp 끝의 숨은 토큰 제거 → 편집칸엔 인사 멘트만
    _items().forEach(it => { if (_isFixedData(it.key)) it.resp = _stripToken(it.resp, it.key); });
    _render();
  }

  async function _save() {
    if (!_menu) return;
    const payload = {
      enabled: !!_menu.enabled,
      greeting: _menu.greeting || '',
      items: _items().map(it => ({
        key: it.key, label: (it.label || '').slice(0, LABEL_MAX) || '메뉴',
        enabled: !!it.enabled, action: it.action,
        // 영업시간/주소/가격표는 저장 시 인사 멘트 끝에 숨은 토큰 1개 재부착(BE 가 실데이터 치환)
        resp: _isFixedData(it.key) ? _withToken(it.resp, it.key) : (it.resp || ''),
        ack: it.ack || '', image_urls: (it.image_urls || []).slice(0, 2), custom: _isCustom(it),
      })),
      // 처음 열 때 메뉴 ON 이면 켠 메뉴로 자동 계산(최신 enabled 반영), OFF 면 비움
      ice_breakers: (_menu.ice_breakers || []).length > 0 ? _computeIce() : [],
    };
    const btn = document.querySelector('#' + ID + ' [data-dmm-save]');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
    try {
      const res = await apiFetch(apiUrl('/shop/dm-menu'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(window.authHeader ? window.authHeader() : {}) },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.detail || ('HTTP ' + res.status));
      _toast(d && d.ice_breaker_warning ? d.ice_breaker_warning : '저장됐어요 ✓');
      closeDMMenuSettings();
    } catch (e) {
      _toast('저장 실패: ' + (e && e.message ? e.message : '네트워크 오류'));
    } finally {
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    }
  }

  function openDMMenuSettings(expandKey) {
    const el = _ensureMounted();
    _menu = _menu || _defaultMenu();
    _open.clear();
    if (expandKey) _open.add(expandKey); // 외부 진입 시 특정 항목 펼침(예: 예약하기)
    _real = null;
    _render();
    _hydrate().catch(() => {});
    _fetchReal().catch(() => {}); // 미리보기용 실제 영업시간/주소/가격표 로드
    requestAnimationFrame(() => el.classList.add('is-open'));
    el.setAttribute('aria-hidden', 'false');
    // [2026-07-22 보스] 뒤로가기 등록 — 안 하면 안드로이드 back/스와이프에서 이 화면 대신 앱이 그대로 꺼진다.
    if (typeof window._registerSheet === 'function') window._registerSheet('dmMenu', closeDMMenuSettings);
    if (typeof window._markSheetOpen === 'function') window._markSheetOpen('dmMenu');
    _haptic();
  }
  function closeDMMenuSettings() {
    const el = document.getElementById(ID);
    if (!el) return;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    if (typeof window._markSheetClosed === 'function') window._markSheetClosed('dmMenu');
    _haptic();
  }

  window.openDMMenuSettings = openDMMenuSettings;
  window.closeDMMenuSettings = closeDMMenuSettings;
})();
