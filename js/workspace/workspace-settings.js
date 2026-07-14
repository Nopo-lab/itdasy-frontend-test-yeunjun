/* workspace-settings.js — 작업실 설정 화면 (2026-07-10)
   작업실 홈 톱니 → 여기. 편집기 기능스티커·캡션이 읽는 localStorage 키(itdasy:shop_*)를 한 곳에서 입력.
   섹션: ① 원장 작업 기억(T-115) ② 매장 정보 ③ 캡션 고정 멘트(+샵정보 자동첨부)
        ④ 내 레이아웃(실제 합성 썸네일 · 이름변경 · 삭제).
   [2026-07-14 T-115] 섹션마다 Lucide 아이콘 + 한 줄 설명(리뉴얼). 맨 위에 '원장 작업 기억' 신설 —
     발행/저장 때 붙잡은 꾸밈을 보고 ★기본을 고른다. 데이터·이름은 work-memory.js 소유(여긴 표시만).
     ※ '내 레이아웃'(사진 틀, ShopStyle)과 '작업 기억'(그 위 글씨·꾸밈, WorkMemory)은 다른 것 — 설명으로 구분.
   .subscreen-overlay + ss-* 디자인 재사용 → PC 사이드바 자동 안전. window.WorkspaceSettings.open(). */
(function () {
  'use strict';
  var ID = 'wsSettingsOverlay';
  var SAMPLE = ['assets/workshop-cats/cat-1.jpg', 'assets/workshop-cats/cat-3.jpg', 'assets/workshop-cats/cat-4.jpg'];
  // [2026-07-10] 상호·전화·주소·영업시간은 앱 '샵 정보'(서버)와 중복 → 작업실에선 제거하고 거기서 관리(sync로 반영).
  //   여기 남기는 건 '샵 정보'에 없는 작업실 전용값. 필드: [키, 라벨, placeholder, inputmode]
  var FIELDS = [
    ['itdasy:shop_book', '예약 링크', '예) naver.me/xxxx', 'url'],
    ['itdasy:shop_price', '가격 안내', '예) 컷 3만원~', 'text'],
    ['itdasy:shop_handle', '인스타 아이디', '@ 없이', 'text']
  ];
  // 앱 '샵 정보'(서버/SecureStorage) → 편집기·캡션이 읽는 키로 미러. 상호·전화만 게시글에서 실제 사용.
  function syncFromShopInfo() {
    try {
      var name = get('itdasy_shop_name') || get('shop_name');
      if (name && name.trim()) set('shop_name', name.trim());
      if (window.SecureStorage && window.SecureStorage.get) {
        Promise.resolve(window.SecureStorage.get('itdasy_shop_phone')).then(function (ph) {
          if (ph && String(ph).trim()) set('itdasy:shop_phone', String(ph).trim());
        }).catch(function () { void 0; });
      } else {
        var ph = get('itdasy_shop_phone'); if (ph && ph.trim()) set('itdasy:shop_phone', ph.trim());
      }
    } catch (_e) { void _e; }
  }
  var _selMem = null;   // 액션이 펼쳐진 기억 id(한 번에 하나)
  var K_FOOTER = 'itdasy:caption_footer_local';   // 고정멘트 로컬 미러(표시용) — 저장은 서버 setCaptionTemplate
  var K_SHOPINFO = 'itdasy:caption_shopinfo';

  function toast(m) { if (window.showToast) window.showToast(m); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function get(k) { try { return String(localStorage.getItem(k) || ''); } catch (_) { return ''; } }
  function set(k, v) { try { localStorage.setItem(k, v == null ? '' : v); } catch (_) { void _; } }

  // ── 섹션 헤더(리뉴얼) — 아이콘 + 제목 + (선택)카운트
  function _hd(icon, title, count) {
    return '<div class="ss-hd"><span class="ss-hd__ic"><svg width="15" height="15" aria-hidden="true"><use href="#ic-' + icon + '"/></svg></span>' +
      '<span class="ss-hd__t">' + esc(title) + '</span>' +
      (count ? '<span class="ss-hd__n">' + esc(count) + '</span>' : '') + '</div>';
  }

  // ── ① 원장 작업 기억 ─────────────────────────────────────────
  function _memHtml() {
    var WM = window.WorkMemory;
    if (!WM) return '<div class="ss-card-sub">기억 기능을 불러오지 못했어요.</div>';
    var mine = WM.list(), defId = WM.getDefaultId();
    var head = '<div class="ss-card-sub">발행하거나 저장할 때마다 원장님이 꾸민 그대로 기억해요. <b>★ 기본</b>으로 고른 건 다음 사진에 자동으로 올라가요.</div>';
    if (!mine.length) {
      return head + '<div class="wm-empty"><svg width="15" height="15" aria-hidden="true"><use href="#ic-plus"/></svg><span>아직 기억이 없어요 — 사진을 꾸며서 발행하면 여기 쌓여요</span></div>';
    }
    var rows = mine.slice().sort(function (a, b) { return (b.lastUsedAt || 0) - (a.lastUsedAt || 0); }).map(function (r) {
      var on = r.id === defId, sel = r.id === _selMem;
      return '<div class="wm' + (on ? ' is-default' : '') + (sel ? ' is-sel' : '') + '" data-wm-id="' + esc(r.id) + '">' +
        '<div class="wm__th">' + (r.thumb ? '<img src="' + esc(r.thumb) + '" alt="">' : '') + '</div>' +
        '<div class="wm__c"><div class="wm__name">' + esc(r.name || '내 작업') + '</div>' +
        '<div class="wm__chips">' + esc(WM.describe(r)) + '</div>' +
        '<div class="wm__when">' + esc(WM.formatWhen(r)) + '</div></div>' +
        '<button type="button" class="wm__star' + (on ? ' on' : '') + '" data-haptic="light" data-wm-star="' + esc(r.id) + '" ' +
          'aria-pressed="' + (on ? 'true' : 'false') + '" aria-label="' + esc(r.name || '') + ' 기본으로 쓰기">' +
          '<svg width="14" height="14" aria-hidden="true"><use href="#ic-star"/></svg></button></div>' +
        (sel ? _actsHtml(r) : '');
    }).join('');
    var left = window.WorkMemory.MAX - mine.length;
    var rest = left > 0 ? '<div class="wm-empty"><svg width="14" height="14" aria-hidden="true"><use href="#ic-plus"/></svg><span>발행하면 여기 쌓여요 · ' + left + '칸 남음</span></div>' : '';
    return head + '<div class="wm-list">' + rows + rest + '</div>';
  }
  // 선택된 기억 아래로 펼치는 인라인 액션(팝업 금지 — 같은 화면에서 완결)
  function _actsHtml(rec) {
    return '<div class="wm-acts" data-wm-acts><div class="wm-acts__t">“' + esc(rec.name || '') + '”</div>' +
      '<div class="wm-acts__row">' +
      '<button type="button" class="wm-btn wm-btn--pri" data-haptic="success" data-wm-star="' + esc(rec.id) + '"><svg width="12" height="12" aria-hidden="true"><use href="#ic-star"/></svg>기본으로</button>' +
      '<button type="button" class="wm-btn" data-haptic="light" data-wm-rename="' + esc(rec.id) + '"><svg width="12" height="12" aria-hidden="true"><use href="#ic-pen-line"/></svg>이름</button>' +
      '<button type="button" class="wm-btn wm-btn--del" data-haptic="light" data-wm-del="' + esc(rec.id) + '"><svg width="12" height="12" aria-hidden="true"><use href="#ic-trash-2"/></svg>삭제</button>' +
      '</div></div>';
  }

  function _fieldsHtml() {
    return FIELDS.map(function (f) {
      return '<div class="ss-row"><span class="lbl">' + esc(f[1]) + '</span>' +
        '<input class="ss-input" data-wss-key="' + esc(f[0]) + '" inputmode="' + esc(f[3]) + '" placeholder="' + esc(f[2]) + '" value="' + esc(get(f[0])) + '"></div>';
    }).join('');
  }
  function _footerHtml() {
    var footer = get(K_FOOTER);
    var on = get(K_SHOPINFO) === '1';
    return '<textarea class="ss-input" data-wss-footer rows="2" style="width:100%;resize:vertical;min-height:56px" placeholder="게시글 끝에 항상 붙일 문구 (예약 DM·영업시간 등). 비우면 안 붙어요.">' + esc(footer) + '</textarea>' +
      '<div class="ss-toggle" style="margin-top:10px"><div><div class="ss-toggle-lbl">샵 정보 자동 첨부</div><div class="ss-toggle-sub">전화·예약 링크를 게시글 끝에 자동으로</div></div>' +
      '<div class="ss-switch' + (on ? ' is-on' : '') + '" data-wss-shopinfo role="switch" aria-checked="' + (on ? 'true' : 'false') + '" tabindex="0"></div></div>';
  }
  function _layoutsHtml() {
    var mine = (window.WorkspaceLayout && window.WorkspaceLayout.getMyLayouts) ? window.WorkspaceLayout.getMyLayouts() : [];
    if (!mine.length) return '<div class="ss-card-sub">저장한 레이아웃이 아직 없어요. 작업실에서 레이아웃을 고르고 <b>‘이 레이아웃 저장’</b>을 누르면 여기에 모여요.</div>';
    return '<div class="wss-lay-grid">' + mine.map(function (L) {
      return '<div class="wss-lay" data-wss-layid="' + esc(L.id) + '">' +
        '<div class="wss-lay__thumb" data-wss-thumb><div class="wss-lay__ph"></div></div>' +
        '<div class="wss-lay__name">' + esc(L.name || '내 레이아웃') + '</div>' +
        '<div class="wss-lay__acts"><button type="button" class="wss-lay__btn" data-wss-layrename="' + esc(L.id) + '">이름</button>' +
        '<button type="button" class="wss-lay__btn wss-lay__btn--del" data-wss-laydel="' + esc(L.id) + '">삭제</button></div></div>';
    }).join('') + '</div>';
  }

  function _ensureMounted() {
    var el = document.getElementById(ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = ID; el.className = 'subscreen-overlay'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<header class="ss-topbar"><button type="button" class="ss-back" data-wss-back aria-label="뒤로"><svg width="14" height="14" aria-hidden="true"><use href="#ic-chevron-left"/></svg></button><div class="ss-title">작업실 설정</div></header>' +
      '<div class="ss-body">' +
        '<div class="ss-card">' + _hd('layers', '원장 작업 기억') + '<div data-wss-mem>' + _memHtml() + '</div></div>' +
        '<div class="ss-card">' + _hd('store', '매장 정보') +
          '<div class="ss-card-sub">게시글에 자동으로 들어가는 우리 샵 정보예요.</div>' +
          '<div class="wss-fromshop"><div class="wss-fromshop__tx"><b>상호·전화·주소·영업시간</b>은 <b>샵 정보</b>에서 관리해요.<br>거기 입력하면 게시글에 자동으로 쓰여요.</div><button type="button" class="wss-fromshop__btn" data-wss-openshop>샵 정보 열기 ›</button></div>' +
          '<div class="ss-card-sub" style="margin:14px 0 10px">아래는 작업실 전용 항목이에요.</div>' +
          '<div data-wss-fields>' + _fieldsHtml() + '</div></div>' +
        '<div class="ss-card">' + _hd('message-square', '캡션 고정 멘트') +
          '<div class="ss-card-sub">게시글 끝에 항상 붙는 문구예요.</div>' +
          '<div data-wss-footwrap>' + _footerHtml() + '</div></div>' +
        '<div class="ss-card">' + _hd('layout-grid', '내 레이아웃') +
          '<div class="ss-card-sub">사진이 들어갈 <b>틀</b>이에요. 위 <b>작업 기억</b>은 그 틀 위에 올라가는 <b>글씨·꾸밈</b>이고요.</div>' +
          '<div data-wss-layouts>' + _layoutsHtml() + '</div></div>' +
      '</div>';
    document.body.appendChild(el);
    el.addEventListener('click', _onClick);
    // 입력 자동 저장(blur/change)
    el.addEventListener('change', function (e) {
      var inp = e.target.closest('[data-wss-key]');
      if (inp) { set(inp.getAttribute('data-wss-key'), inp.value); return; }
    });
    el.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    return el;
  }

  function _onClick(e) {
    if (e.target.closest('[data-wss-back]')) { close(); return; }
    // ── 작업 기억 ★기본 지정(다시 누르면 해제)
    var st = e.target.closest('[data-wm-star]');
    if (st) {
      var sid = st.getAttribute('data-wm-star');
      try {
        if (window.WorkMemory.getDefaultId() === sid) { window.WorkMemory.clearDefault(); toast('기본을 해제했어요'); }
        else { window.WorkMemory.setDefault(sid); toast('기본으로 쓸게요'); }
      } catch (_e) { void _e; }
      _refreshMem(); return;
    }
    // ── 작업 기억 이름 변경
    var mr = e.target.closest('[data-wm-rename]');
    if (mr) {
      var mid = mr.getAttribute('data-wm-rename');
      var rec = (window.WorkMemory && window.WorkMemory.get(mid)) || {};
      var nv = window.prompt('이 작업을 뭐라고 부를까요?', rec.name || ''); if (nv == null) return;
      nv = String(nv).trim(); if (!nv) return;
      try { window.WorkMemory.rename(mid, nv); } catch (_e) { void _e; }
      toast('이름을 바꿨어요'); _refreshMem(); return;
    }
    // ── 작업 기억 삭제
    var md = e.target.closest('[data-wm-del]');
    if (md) {
      try { window.WorkMemory.remove(md.getAttribute('data-wm-del')); } catch (_e) { void _e; }
      _selMem = null; toast('기억을 지웠어요'); _refreshMem(); return;
    }
    // ── 기억 카드 탭 → 아래로 액션 펼침(같은 화면에서 완결)
    var mc = e.target.closest('[data-wm-id]');
    if (mc) {
      var cid = mc.getAttribute('data-wm-id');
      _selMem = (_selMem === cid) ? null : cid;
      _refreshMem(); return;
    }
    // 샵 정보(앱 전체 설정) 열기 — 작업실 설정은 닫고 그쪽으로
    if (e.target.closest('[data-wss-openshop]')) {
      close();
      if (window.openShopSettings) window.openShopSettings();
      else toast('샵 정보를 불러오지 못했어요');
      return;
    }
    // 샵정보 자동첨부 토글
    var sw = e.target.closest('[data-wss-shopinfo]');
    if (sw) {
      var on = !sw.classList.contains('is-on');
      sw.classList.toggle('is-on', on); sw.setAttribute('aria-checked', on ? 'true' : 'false');
      set(K_SHOPINFO, on ? '1' : '0'); return;
    }
    // 레이아웃 이름 변경
    var rn = e.target.closest('[data-wss-layrename]');
    if (rn) {
      var rid = rn.getAttribute('data-wss-layrename');
      var cur = (window.ShopStyle && window.ShopStyle.get) ? (window.ShopStyle.get(rid) || {}) : {};
      var nv = window.prompt('레이아웃 이름', cur.name || '내 레이아웃'); if (nv == null) return;
      nv = String(nv).trim(); if (!nv) return;
      try { window.ShopStyle.save(rid, { name: nv }); } catch (_e) { void _e; }
      toast('이름을 바꿨어요'); _refreshLayouts(); return;
    }
    // 레이아웃 삭제
    var dl = e.target.closest('[data-wss-laydel]');
    if (dl) {
      var did = dl.getAttribute('data-wss-laydel');
      try { if (window.ShopStyle && window.ShopStyle.remove) window.ShopStyle.remove(did); } catch (_e2) { void _e2; }
      toast('삭제했어요'); _refreshLayouts(); return;
    }
  }

  function _saveFooter(el) {
    var ta = el.querySelector('[data-wss-footer]'); if (!ta) return;
    var text = String(ta.value || '');
    set(K_FOOTER, text);   // 로컬 미러(표시용)
    try { if (window.WorkspaceAdapter && window.WorkspaceAdapter.setCaptionTemplate) window.WorkspaceAdapter.setCaptionTemplate(text); } catch (_e) { void _e; }
  }

  function _refreshMem() {
    var el = document.getElementById(ID); if (!el) return;
    var host = el.querySelector('[data-wss-mem]'); if (host) host.innerHTML = _memHtml();
  }

  function _refreshLayouts() {
    var el = document.getElementById(ID); if (!el) return;
    var host = el.querySelector('[data-wss-layouts]'); if (host) host.innerHTML = _layoutsHtml();
    _paintThumbs();
  }
  // 실제 합성 썸네일 — 샘플 사진을 슬롯에 넣어 composeLayout(비동기)로 굽는다.
  function _paintThumbs() {
    var el = document.getElementById(ID); if (!el || !(window.WorkspaceLayout && window.WorkspaceLayout.composeLayout)) return;
    var mine = window.WorkspaceLayout.getMyLayouts ? window.WorkspaceLayout.getMyLayouts() : [];
    mine.forEach(function (L) {
      var card = el.querySelector('.wss-lay[data-wss-layid="' + (window.CSS && CSS.escape ? CSS.escape(L.id) : L.id) + '"]');
      var host = card && card.querySelector('[data-wss-thumb]'); if (!host) return;
      var n = (L.photoSlots || []).length || 1;
      var photos = SAMPLE.slice(0, n).map(function (u) { return { dataUrl: u }; });
      try {
        Promise.resolve(window.WorkspaceLayout.composeLayout(L, photos)).then(function (url) {
          if (url) host.innerHTML = '<img src="' + url + '" alt="">';
        }).catch(function () { void 0; });
      } catch (_e) { void _e; }
    });
  }

  function open() {
    syncFromShopInfo();   // 열 때마다 앱 샵 정보 최신값을 캡션 키로 미러
    var el = _ensureMounted();
    // 열 때마다 최신값으로 새로 그림
    var fh = el.querySelector('[data-wss-fields]'); if (fh) fh.innerHTML = _fieldsHtml();
    var fw = el.querySelector('[data-wss-footwrap]'); if (fw) fw.innerHTML = _footerHtml();
    _selMem = null; _refreshMem();
    _refreshLayouts();
    el.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(function () { el.classList.add('is-open'); });
    _paintThumbs();
  }
  function close() {
    var el = document.getElementById(ID); if (!el) return;
    _saveFooter(el);   // 닫을 때 고정멘트 저장(서버 반영)
    // 입력값도 확정 저장(change 못 받은 것 대비)
    Array.prototype.forEach.call(el.querySelectorAll('[data-wss-key]'), function (inp) { set(inp.getAttribute('data-wss-key'), inp.value); });
    el.classList.remove('is-open'); el.setAttribute('aria-hidden', 'true');
  }

  window.WorkspaceSettings = { open: open, close: close, syncFromShopInfo: syncFromShopInfo };
  try { syncFromShopInfo(); } catch (_e) { void _e; }   // 부팅 시 1회 미러(캡션이 샵 정보 전화·상호 쓰게)
})();
