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
  let _ai = null;      // /instagram/dm-reply/settings 전체 (B묶음 토글 = _ai.enabled)
  let _usage = null;   // /subscription/usage 의 dm_draft — 없으면 게이지 숨김
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
      #${ID} textarea,#${ID} .dmm-lblin,#${ID} .dmm-in{font-family:inherit;outline:none;color:#191F28;box-sizing:border-box;background:#fff}
      #${ID} .dmm-greet textarea{width:100%;border:.5px solid rgba(0,0,0,.12);border-radius:12px;padding:11px 12px;font-size:13.5px;line-height:1.5;resize:none}
      #${ID} textarea:focus,#${ID} .dmm-lblin:focus,#${ID} .dmm-in:focus{border-color:var(--brand,#D58A95)}
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
      #${ID} .dmm-fld.muted{color:#B0B8C1;font-weight:600}
      #${ID} .sub{font-weight:600;color:#B0B8C1}
      /* 텍스트 입력 한 벌 — 버튼 글자만 굵게(칩에 그대로 박히는 글자라), 나머지는 보통 굵기 */
      #${ID} .dmm-lblin,#${ID} .dmm-in{width:100%;border:.5px solid rgba(0,0,0,.12);border-radius:10px;padding:9px 11px;font-size:13px}
      #${ID} .dmm-lblin{font-weight:700}
      #${ID} .dmm-in{font-weight:500}
      /* [2026-08-16] 예약 양식 편집기(app-dm-booking-form.js) 마운트 지점.
         원래 css/screens/dm-autoreply-v3.css 의 .dm-field__* 를 썼는데 그 파일을 폐기하면서
         스타일이 통째로 날아갔다(입력칸이 브라우저 기본, '원' 단위가 아래로 떨어짐).
         되살리지 않고 이 화면의 dmm-* 한 벌로 흡수한다 — 라벨·입력칸 규격이 한 곳에만 있게. */
      #${ID} .dmm-booking{display:flex;flex-direction:column;gap:9px}
      #${ID} .dmm-unit{position:relative;display:block}
      #${ID} .dmm-unit .dmm-in{padding-right:36px}
      #${ID} .dmm-unit>.u{position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:12.5px;font-weight:600;color:#8B95A1;pointer-events:none}
      /* [2026-08-16] 접어두는 하위 묶음(예약금 등) — 지금 안 쓰는 값이 편집 흐름을 끊지 않게 */
      #${ID} .dmm-more{display:flex;align-items:center;gap:8px;width:100%;padding:11px 12px;background:#F7F8FA;
        border:.5px solid rgba(0,0,0,.08);border-radius:12px;cursor:pointer;font-family:inherit;text-align:left}
      #${ID} .dmm-more .mt{flex:1;min-width:0;font-size:12.5px;font-weight:700;color:#4E5968;display:flex;align-items:center;gap:7px}
      #${ID} .dmm-more .mb{font-size:10.5px;font-weight:700;color:#B0B8C1;background:#EDF0F3;border-radius:99px;padding:2px 7px}
      #${ID} .dmm-more .mb.on{color:var(--brand-strong,#BC6675);background:var(--brand-bg,#F7EFF0)}
      #${ID} .dmm-more .mc{flex:none;color:#C9CDD4;display:flex;transition:transform .2s}
      #${ID} .dmm-more.open .mc{transform:rotate(180deg)}
      #${ID} .dmm-dep{display:flex;flex-direction:column;gap:9px;padding:2px 0 0}
      #${ID} .dmm-dep[hidden]{display:none}
      #${ID} .dmm-hint{font-size:11.5px;line-height:1.5;color:#8B95A1;background:#F7F8FA;border-radius:10px;padding:9px 11px}
      #${ID} .dmm-cnt{font-size:10.5px;color:#B0B8C1;text-align:right}
      #${ID} .dmm-resp{width:100%;border:.5px solid rgba(0,0,0,.12);border-radius:10px;padding:9px 11px;font-size:13px;line-height:1.5;resize:none;min-height:62px}
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
      /* [2026-08-16] 손님 화면 미리보기 진입 — A묶음(버튼 응대)이 실제로 어떻게 보이는지 한 번에 확인.
         화면 맨 위 한 곳에만 둔다(항목마다 두면 '지금 편집 중인 것'과 '저장된 것'이 헷갈린다). */
      #${ID} .dmm-pvbtn{width:100%;display:flex;align-items:center;gap:10px;padding:13px 14px;background:#fff;
        border:.5px solid rgba(0,0,0,.08);border-radius:16px;cursor:pointer;font-family:inherit;text-align:left}
      #${ID} .dmm-pvbtn:active{transform:scale(.99)}
      #${ID} .dmm-pvbtn .pi{flex:none;color:#191F28;display:flex}
      #${ID} .dmm-pvbtn .pt{flex:1;min-width:0}
      #${ID} .dmm-pvbtn .pt b{display:block;font-size:13.5px;font-weight:800;color:#191F28}
      #${ID} .dmm-pvbtn .pt span{display:block;font-size:11px;color:#8B95A1;margin-top:2px;line-height:1.4}
      #${ID} .dmm-pvbtn .pc{flex:none;color:#C9CDD4;display:flex}
      #${ID} .dmm-addbtn{width:100%;padding:13px;border:1px dashed rgba(0,0,0,.18);background:#fff;border-radius:14px;font-size:13px;font-weight:700;color:#4E5968;cursor:pointer;font-family:inherit;margin-top:10px}
      #${ID} .dmm-dim{opacity:.45;pointer-events:none}
      /* [2026-08-16] 두 묶음 — A:바로 나가요(중립·요금 X) / B:나한테 먼저 와요(로즈=요금 쓰는 쪽) */
      #${ID} .dmm-grp{border-radius:18px;padding:11px 10px 13px;margin-bottom:16px}
      #${ID} .dmm-grp.a{background:#F4F6F8;border:.5px solid rgba(0,0,0,.05)}
      #${ID} .dmm-grp.b{background:var(--brand-bg,#F7EFF0);border:.5px solid rgba(188,102,117,.18)}
      #${ID} .dmm-ghd{display:flex;align-items:flex-start;gap:10px;padding:3px 5px 12px}
      #${ID} .dmm-ghd .tx{flex:1;min-width:0}
      #${ID} .dmm-gh{font-size:14.5px;font-weight:800;color:#191F28;line-height:1.25}
      #${ID} .dmm-grp.b .dmm-gh{color:var(--brand-strong,#BC6675)}
      #${ID} .dmm-gs{font-size:11.5px;color:#8B95A1;line-height:1.45;margin-top:3px}
      #${ID} .dmm-grp .dmm-sec{margin:13px 5px 6px}
      #${ID} .dmm-okico{flex:none;color:#16A34A;margin-top:2px}
      /* [2026-08-20 P0-2] 자동발송 ON 일 때의 주의 아이콘 — 초록(안심)과 반대로 호박(주의) */
      #${ID} .dmm-warnico{flex:none;color:#B45309;margin-top:2px}
      /* 자동발송 안내줄 — 위 토글줄과 같은 카드 안에서 구분되게 얇은 선만 */
      #${ID} .dmm-asnote{border-top:.5px solid rgba(0,0,0,.06);padding-top:13px}
      #${ID} .dmm-gauge{display:flex;align-items:center;gap:9px;padding:11px 14px 13px;border-top:.5px solid rgba(0,0,0,.06)}
      #${ID} .dmm-gauge .trk{flex:1;height:5px;border-radius:99px;background:#E8EBEF;overflow:hidden}
      #${ID} .dmm-gauge .fil{height:100%;border-radius:99px;background:var(--brand,#D58A95);transition:width .3s}
      #${ID} .dmm-gauge .num{font-size:10.5px;font-weight:700;color:#8B95A1;white-space:nowrap}
      #${ID} .dmm-gauge.warn .fil{background:var(--brand-strong,#BC6675)}
      #${ID} .dmm-gauge.warn .num{color:var(--brand-strong,#BC6675)}
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
        <button type="button" class="ss-back" data-dmm-back aria-label="뒤로"><svg class="ic" aria-hidden="true"><use href="#ic-chevron-left"/></svg></button>
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
      <input class="dmm-lblin" data-lbl="${_esc(it.key)}" maxlength="${LABEL_MAX}" value="${_esc(it.label || '')}" placeholder="예약하기">
      <div class="dmm-cnt"><span data-cnt="${_esc(it.key)}">${lblCount}</span>/${LABEL_MAX}</div>`;
    let pvBlock = '';  // '이렇게 답장돼요' 미리보기 — 멘트·수정·첨부 다음 맨 마지막에 붙임
    if (kind === 'booking') {
      // 예약 양식 편집기 — 공용 모듈(DMBookingForm)이 마운트(데이터는 자동응답 설정 채널)
      fields += `<div class="dmm-booking" data-booking-mount></div>`;
    } else if (meta.edit === 'none') {
      fields += `<div class="dmm-fld muted">${_esc(meta.editNote || '')}</div>`;
    } else if (kind === 'resp' && _isFixedData(it.key)) {
      // 영업시간/주소/가격표 — 인사 멘트만 편집. 실제 데이터는 미리보기로 보이고 발송 시 자동으로 붙음.
      const ph = { HOURS: '영업시간 안내드려요 🕐', LOCATION: '오시는 길 안내드려요 📍', PRICE: '가격 안내드려요 💰' }[it.key] || '';
      const pvEmpty = (_real && _real[it.key]) ? '' : ' dmm-pv-empty';
      fields += `<div class="dmm-fld">인사 멘트</div>
        <textarea class="dmm-resp" data-resp="${_esc(it.key)}" maxlength="500" placeholder="${_esc(ph)}">${_esc(it.resp || '')}</textarea>
        <button type="button" class="dmm-jump" data-jump="${_esc(it.key)}">${_esc(_DATA_LABEL[it.key])} 수정 →</button>`;
      pvBlock = `<div class="dmm-fld">이렇게 답장돼요</div>
        <div class="dmm-pv${pvEmpty}" data-preview="${_esc(it.key)}">${_esc(_previewText(it.key, it.resp))}</div>`;
    } else if (kind === 'resp') {
      fields += `<div class="dmm-fld">응답 멘트</div>
        <textarea class="dmm-resp" data-resp="${_esc(it.key)}" maxlength="600" placeholder="손님에게 보낼 답장">${_esc(it.resp || '')}</textarea>`;
    } else if (kind === 'ack') {
      fields += `<div class="dmm-fld">확인 멘트 (보낸 뒤 사장님 큐로)</div>
        <textarea class="dmm-resp" data-ack="${_esc(it.key)}" maxlength="300" placeholder="문의 확인했어요! 곧 답장드릴게요 🙏">${_esc(it.ack || '')}</textarea>`;
    }
    // 사진 첨부 — 모든 항목 공통, 최대 2장. 버튼 탭 시 손님에게 사진을 같이 보냄(가격표·시술설명 등).
    const _imgs = Array.isArray(it.image_urls) ? it.image_urls.slice(0, 2) : [];
    const _thumbs = _imgs.map((u, i) => `<div class="dmm-img-thumb"><img src="${_esc(u)}" alt="첨부 사진">
          <button type="button" class="dmm-img-del" data-img-del="${_esc(it.key)}" data-img-idx="${i}" aria-label="사진 삭제"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>`).join('');
    const _addBtn = _imgs.length >= 2
      ? `<span class="dmm-img-full">2장 다 채웠어요</span>`
      : `<label class="dmm-img-add"><input type="file" accept="image/*" data-img-file="${_esc(it.key)}" hidden><span>+ 사진 추가</span></label>`;
    fields += `
      <div class="dmm-fld">사진 첨부 <span class="sub">(버튼 누르면 손님에게 같이 전송 · 최대 2장)</span></div>
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

  // 사용량 게이지 — BE 가 dm_draft 를 아직 안 주면(한도 배선 전) 통째로 숨긴다. 실패도 조용히.
  function _gaugeHtml() {
    const u = _usage;
    if (!u || typeof u.used !== 'number' || typeof u.limit !== 'number' || u.limit <= 0) return '';
    const pct = Math.min(100, Math.round((u.used / u.limit) * 100));
    const label = u.used >= u.limit ? '이번 달 한도 다 썼어요' : `이번 달 ${u.used} / ${u.limit}`;
    return `<div class="dmm-gauge${pct >= 80 ? ' warn' : ''}"><div class="trk"><div class="fil" style="width:${pct}%"></div></div><div class="num">${_esc(label)}</div></div>`;
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
    const aiOn = !!(_ai && _ai.enabled);
    const aiDim = aiOn ? '' : ' dmm-dim';
    // [2026-08-20 P0-2] 자동발송은 **초안(B묶음)이 켜져 있을 때만** 의미가 있다 —
    //   초안이 없으면 보낼 게 없다(서버도 `autoreply_disabled` 로 막는다). 화면도 같은 규칙.
    const autoSendOn = aiOn && !!(_ai && _ai.dm_autosend_enabled);
    // [2026-08-16] 두 묶음. A 토글=_menu.enabled(/shop/dm-menu), B 토글=_ai.enabled(/instagram/dm-reply/settings).
    body.innerHTML = `
      <div class="dmm-grp a">
        <div class="dmm-ghd">
          <div class="tx">
            <div class="dmm-gh">바로 나가요</div>
            <div class="dmm-gs">손님이 버튼을 누르면 · 내가 써둔 답이 그대로 · 요금 안 써요</div>
          </div>
          ${_tgHtml(!!_menu.enabled, 'master', '')}
        </div>
        <button type="button" class="dmm-pvbtn" data-preview-open>
          <span class="pi" aria-hidden="true"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2.6"/><path d="M11 18.5h2"/></svg></span>
          <span class="pt"><b>손님 화면으로 미리보기</b><span>저장된 설정 그대로 · 눌러봐도 손님에겐 안 가요</span></span>
          <span class="pc" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></span>
        </button>
        <div class="dmm-sec">손님이 DM 보내면 이렇게 인사해요</div>
        <div class="dmm-card dmm-greet${dim}"><textarea rows="2" data-greet maxlength="300">${_esc(_menu.greeting || '')}</textarea></div>
        <div class="dmm-sec">손님이 누를 버튼 <span class="sub">켠 것만 손님에게 보여요 · 탭하면 그 자리에서 편집돼요</span></div>
        <div class="dmm-card${dim}">${rows}</div>
        <button type="button" class="dmm-addbtn${dim}" data-add>+ 메뉴 추가</button>
        <div class="dmm-sec">손님이 대화창을 처음 열면</div>
        <div class="dmm-card${dim}">
          <div class="dmm-master">
            <div class="t"><b>먼저 버튼 보여주기</b><span>손님이 아직 아무 말 안 해도 켠 버튼을 미리 띄워줘요 (최대 ${ICE_MAX}개)</span></div>
            ${_tgHtml(iceOn, 'ice', '')}
          </div>
        </div>
      </div>
      <div class="dmm-grp b">
        <div class="dmm-ghd">
          <div class="tx">
            <div class="dmm-gh">나한테 먼저 와요</div>
            <div class="dmm-gs">버튼에 없는 걸 글로 물어보면 · 잇비가 초안을 써요 · 요금 써요</div>
          </div>
          ${_tgHtml(aiOn, 'draft', '')}
        </div>
        <div class="dmm-card${aiDim}">
          <div class="dmm-master">
            <div class="t"><b>잇비가 직접 답장해요</b><span>${autoSendOn
              ? '손님이 말을 멈추면 잇비가 바로 답장해요 · 위험한 문의는 빼고'
              : '켜면 내 확인 없이 손님에게 바로 나가요'}</span></div>
            ${_tgHtml(autoSendOn, 'autosend', '')}
          </div>
          <div class="dmm-master dmm-asnote">
            <span class="${autoSendOn ? 'dmm-warnico' : 'dmm-okico'}" aria-hidden="true">${autoSendOn
              ? '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>'
              : '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'}</span>
            <div class="t">${autoSendOn
              ? '<b>환불 · 민원 · 거친 말은 안 나가요</b><span>그런 문의는 사장님 확인 목록으로 넘어와요</span>'
              : '<b>잇비가 마음대로 안 보내요</b><span>써둔 초안을 내가 보고 \'보내기\'를 눌러야 손님에게 나가요</span>'}</div>
          </div>
          ${_gaugeHtml()}
        </div>
      </div>`;
    // 예약하기 펼쳐져 있으면 예약 양식 편집기 마운트(공용 모듈)
    if (_open.has('BOOK_FORM') && window.DMBookingForm) {
      const m = body.querySelector('[data-booking-mount]');
      if (m) window.DMBookingForm.mount(m);
    }
  }

  function _onClick(e) {
    // 손님 화면 미리보기 — 저장된 값 기준(서버 조립). 편집 중 값이 아니라는 걸 버튼 부제에 적어둠.
    if (e.target.closest('[data-preview-open]')) {
      if (typeof window.openDMPreview === 'function') window.openDMPreview();
      else _toast('미리보기를 불러오는 중이에요');
      _haptic(); return;
    }
    const tg = e.target.closest('.dmm-tg');
    if (tg) {
      e.stopPropagation();
      const kind = tg.getAttribute('data-tg');
      if (kind === 'master') {
        // [2026-08-16] 마스터 on/off — 화면 상태 즉시 반영 + 서버엔 enabled 만 동기화(아래 이관 함수).
        // [2026-08-16] 켤 때만 승인을 받는다. 이 토글은 **손님에게 실제로 나가는** 유일한 스위치다
        //   (버튼 탭 → 써둔 답이 그대로 발송). 끄는 건 안 묻는다 — 끄는 쪽은 언제나 안전하다.
        const _next = !_menu.enabled;
        _haptic();
        const _apply = () => { _menu.enabled = _next; _render(); _syncDmMenuEnabled(_next); };
        // 끄는 건 안 묻는다 — 끄는 쪽은 언제나 안전하다.
        if (!_next) { _apply(); return; }
        // [2026-08-26] 안내 + 체크박스 + 서버 승인 기록까지 끝난 뒤에만 켠다.
        //   승인 기록이 없으면 서버가 저장을 403 으로 막는다(assert_consent_for_enable).
        _consentThenApply(_AC().DM_QUICK_REPLY, _apply);
        return;
      }
      if (kind === 'draft') {
        // B묶음 — 잇비 답장 초안 on/off. 서버는 /instagram/dm-reply/settings 의 enabled.
        // [2026-08-26] 🔴 여기엔 승인 절차가 **아예 없었다.** 손님 DM 을 AI 가 읽기 시작하는
        //   스위치인데 한 번 탭이면 켜졌고, 서버 기본값도 ON 이라 신규 원장은 켠 적도 없이
        //   돌고 있었다. 이제 안내를 보고 체크해야 켜진다.
        if (!_ai) _ai = {};
        const _next = !_ai.enabled;
        _haptic();
        const _apply = () => { _ai.enabled = _next; _render(); _syncAiDraftEnabled(_next); };
        if (!_next) {
          // 초안을 끄면 자동발송은 보낼 게 없어진다. 화면도 같이 내려 준다
          //   (서버도 `autoreply_disabled` 로 막지만, 켜진 것처럼 보이는 게 최악이다).
          if (_ai.dm_autosend_enabled) _ai.dm_autosend_enabled = false;
          _apply();
          return;
        }
        _consentThenApply(_AC().DM_AUTOREPLY, _apply);
        return;
      }
      if (kind === 'autosend') {
        // [2026-08-20 P0-2] 잇비가 손님에게 직접 답장 보내기 on/off.
        //   서버는 /instagram/dm-reply/settings 의 dm_autosend_enabled.
        //   🔴 켤 때만 동의를 받는다 — 이 토글은 **AI 가 지은 글**이 사장님 확인 없이
        //     나가게 만드는 유일한 스위치다(B묶음 토글은 '초안을 만들까' 까지다).
        //     끄는 건 안 묻는다: 끄는 쪽은 언제나 안전하다.
        //   🔴 서버가 최종 권한자다. 이 토글은 의사 표시일 뿐이고 실제 발송 여부는
        //     매번 dm_autosend.should_autosend() 가 정한다(위험 문의·창밖·kill switch).
        if (!_ai) _ai = {};
        if (!_ai.enabled) {
          // 초안이 꺼져 있으면 보낼 게 없다. 서버도 막지만 여기서 이유를 알려준다.
          _toast('먼저 위의 답장 초안을 켜주세요');
          return;
        }
        const _next = !_ai.dm_autosend_enabled;
        _haptic();
        const _apply = () => { _ai.dm_autosend_enabled = _next; _render(); _syncAutosendEnabled(_next); };
        if (!_next) { _apply(); return; }
        _consentThenApply(_AC().DM_AUTOSEND, _apply);
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
      // [2026-08-26] 403 = 서버가 '승인 기록이 없다'고 막은 것. 다른 실패와 말이 달라야 한다.
      if (put.status === 403) throw new Error('CONSENT');
      if (!put.ok) throw new Error('HTTP ' + put.status);
    } catch (_e) {
      if (seq !== _dmMenuSyncSeq) return; // stale — 최신 토글이 상태 소유, 롤백하지 않음
      // 실패 → 화면 상태 롤백
      _menu.enabled = !on;
      _render();
      _toast(String(_e && _e.message) === 'CONSENT'
        ? '동의가 확인되지 않았어요 — 안내를 다시 확인해 주세요'
        : '인스타DM 손님 응대 ' + (on ? '켜기' : '끄기') + ' 실패 — 다시 시도해주세요');
    }
  }

  // ── B묶음 토글 백엔드 반영. ⚠️ POST /settings 는 부분 저장이 아니다 — 빠진 필드는 기본값으로 덮인다.
  //   반드시 GET 결과 전체를 동봉하고 enabled 만 바꾼다(_syncDmMenuEnabled 와 같은 규칙).
  let _aiSyncSeq = 0;
  /* [2026-08-26] 자동화 켜기 = 안내 → 체크 → 서버 승인 기록 → 그다음 설정 저장.

     옛 시트 두 개(`_askQuickReplyConsent`·`_askAutosendConsent`)를 지우고
     `js/automation-consent.js` 하나로 합쳤다. 이유 두 가지:
       ① 토글이 4개인데 시트는 2개뿐이었다 — 가장 위험한 '초안 만들기'에 아무것도 없었다
       ② 시트가 파일마다 따로면 문구가 갈라진다. 실제로 갈라져 있었다.

     🔴 시트가 true 를 줘도 **아직 켜진 게 아니다.** 켜는 건 아래 `apply()` 의 설정 저장이고,
       서버가 승인 기록을 보고서야 허락한다. 화면은 설명하는 일만 한다. */
  function _AC() { return window.AutomationConsent || {}; }

  function _consentThenApply(feature, apply) {
    const ac = _AC();
    if (!feature || typeof ac.ask !== 'function') {
      // 공용 모듈이 아직 안 떴다 — 승인을 못 받은 채로 켜지 않는다(안전한 쪽으로 실패).
      _toast('잠시 뒤 다시 눌러주세요');
      return;
    }
    ac.ask(feature).then((ok) => { if (ok) apply(); });
  }

  /* [2026-08-20 P0-2] 자동발송 토글 서버 동기화.

     🔴 반드시 GET → 수정 → POST (read-modify-write). 이 엔드포인트는 **full-replace** 다 —
       `{dm_autosend_enabled:true}` 만 보내면 pydantic 기본값이 원장님 톤·운영시간·예약금·
       예약양식을 통째로 덮어쓴다. (백엔드 계약을
       test_dm_autosend_toggle_2026_08_20.py::test_partial_body_would_wipe_settings... 가 고정)
     seq 가드는 `_syncAiDraftEnabled` 와 같은 이유 — 빠르게 두 번 누르면 늦게 온 응답이
     이긴다. 마지막 의도만 반영한다. */
  async function _syncAutosendEnabled(on) {
    const seq = ++_aiSyncSeq;
    const auth = window.authHeader ? window.authHeader() : {};
    try {
      const res = await apiFetch(apiUrl('/instagram/dm-reply/settings'), { headers: auth });
      if (seq !== _aiSyncSeq) return;
      const cur = await res.json().catch(() => null);
      if (!cur || typeof cur !== 'object') throw new Error('설정을 불러오지 못했어요');
      cur.dm_autosend_enabled = !!on;
      const put = await apiFetch(apiUrl('/instagram/dm-reply/settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify(cur),
      });
      if (seq !== _aiSyncSeq) return;
      if (put.status === 403) throw new Error('CONSENT');
      if (!put.ok) throw new Error('HTTP ' + put.status);
      _ai = cur;
      _toast(on ? '이제 잇비가 직접 답장해요' : '자동발송을 껐어요');
    } catch (_e) {
      if (seq !== _aiSyncSeq) return;
      // 서버가 못 받았으면 화면도 되돌린다 — 켜진 것처럼 보이는데 안 나가는 게 최악이다
      if (_ai) _ai.dm_autosend_enabled = !on;
      _render();
      _toast(String(_e && _e.message) === 'CONSENT'
        ? '동의가 확인되지 않았어요 — 안내를 다시 확인해 주세요'
        : '자동발송 ' + (on ? '켜기' : '끄기') + ' 실패 — 다시 시도해주세요');
    }
  }

  async function _syncAiDraftEnabled(on) {
    const seq = ++_aiSyncSeq;
    const auth = window.authHeader ? window.authHeader() : {};
    try {
      const res = await apiFetch(apiUrl('/instagram/dm-reply/settings'), { headers: auth });
      if (seq !== _aiSyncSeq) return;
      const cur = await res.json().catch(() => null);
      if (!cur || typeof cur !== 'object') throw new Error('설정을 불러오지 못했어요');
      cur.enabled = !!on;
      /* [2026-09-04 P1] 초안을 끄면 자동발송도 **서버까지** 내린다.
         전엔 화면(_ai)에서만 내리고 POST 본문은 GET 결과를 그대로 실어서
         서버엔 dm_autosend_enabled=true 가 남았다. 화면은 _render 가
         `aiOn && dm_autosend_enabled` 로 그리니 계속 '꺼짐'으로 보였고,
         원장이 나중에 초안만 다시 켜는 순간 **자동발송이 확인 없이 되살아났다**
         (실측: 초안 ON 시트 하나만 뜨고 자동발송 동의는 다시 안 묻는다).
         손님에게 실제로 나가는 유일한 스위치라 화면·서버가 어긋나면 안 된다. */
      if (!on) cur.dm_autosend_enabled = false;
      const put = await apiFetch(apiUrl('/instagram/dm-reply/settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify(cur),
      });
      if (seq !== _aiSyncSeq) return;
      if (put.status === 403) throw new Error('CONSENT');
      if (!put.ok) throw new Error('HTTP ' + put.status);
      _ai = cur;
      _toast(on ? '이제 잇비가 답장 초안을 만들어요' : '답장 초안을 껐어요');
    } catch (_e) {
      if (seq !== _aiSyncSeq) return;
      // 서버가 못 받았으면 화면도 되돌린다 — 켜진 것처럼 보이는데 안 도는 게 최악이다
      if (_ai) _ai.enabled = !on;
      _render();
      _toast(String(_e && _e.message) === 'CONSENT'
        ? '동의가 확인되지 않았어요 — 안내를 다시 확인해 주세요'
        : '답장 초안 ' + (on ? '켜기' : '끄기') + ' 실패 — 다시 시도해주세요');
    }
  }

  async function _hydrateAi() {
    try {
      const res = await apiFetch(apiUrl('/instagram/dm-reply/settings'), { headers: window.authHeader ? window.authHeader() : {} });
      const d = await res.json().catch(() => null);
      if (d && typeof d === 'object') { _ai = d; _render(); }
    } catch (_e) { void _e; }
  }

  async function _fetchUsage() {
    try {
      const res = await apiFetch(apiUrl('/subscription/usage'), { headers: window.authHeader ? window.authHeader() : {} });
      if (!res.ok) return;
      const d = await res.json().catch(() => null);
      const g = d && d.dm_draft;
      if (g && typeof g.limit === 'number' && typeof g.used === 'number') { _usage = g; _render(); }
    } catch (_e) { void _e; }
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
    _hydrateAi().catch(() => {});   // B묶음 토글 현재값
    _fetchUsage().catch(() => {});  // B묶음 사용량 게이지(없으면 숨김)
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

  // [2026-08-16] 미리보기 '지금 채우기' → 이 화면의 항목만 펼친다.
  //   openDMMenuSettings() 재호출은 _hydrate() 로 서버값을 다시 덮어써 편집 중인 값이 날아간다. 그래서 별도 진입점.
  window.DMMenuExpand = function (key) {
    if (!document.getElementById(ID) || !_menu) { openDMMenuSettings(key); return; }
    _open.add(key);
    _render();
    const row = document.querySelector(`#${ID} [data-exp="${key}"]`);
    if (row && row.scrollIntoView) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  window.openDMMenuSettings = openDMMenuSettings;
  window.closeDMMenuSettings = closeDMMenuSettings;
  /* [2026-08-16] app-dm-autoreply.js 폐기 — 톤3칩·운영시간·금지어·고급설정·리텐션·바로답장 전부 삭제하니
     남는 건 마스터 토글뿐이고 그건 이 화면 B묶음('나한테 먼저 와요')과 같은 필드다.
     진입점 7곳(드로어·잇비·오늘브리핑·확인큐·대화목록·액션허브·톱니)을 여기로 흡수. */
  window.openDMAutoreplySettings = openDMMenuSettings;
  window.closeDMAutoreplySettings = closeDMMenuSettings;
})();
