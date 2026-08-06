/* workspace-settings.js — 작업실 설정 화면 (2026-07-10)
   작업실 홈 톱니 → 여기. 편집기 기능스티커·캡션이 읽는 localStorage 키(itdasy:shop_*)를 한 곳에서 입력.
   섹션: ① 원장 작업 기억(T-115) ② 매장 정보(+샵 정보 반영하기 토글) ③ 캡션 고정 멘트.
   [2026-07-14 T-115] 섹션마다 Lucide 아이콘 + 한 줄 설명(리뉴얼). 맨 위에 '원장 작업 기억' 신설 —
     발행/저장 때 붙잡은 꾸밈을 보고 ★기본을 고른다. 데이터·이름은 work-memory.js 소유(여긴 표시만).
   [#15 2026-07-17] '내 레이아웃' 섹션 삭제 — **이미 죽어 있었다.** getMyLayouts() 는 photoSlots 를 가진
     ShopStyle 만 거르는데 그런 레코드를 만드는 코드가 main 에 없다(flow/layout.js 의 create 는
     worktree 에만 있음) → 항상 "저장한 레이아웃이 아직 없어요". 원장 눈엔 '작업 기억'과 겹쳐 보이기만 했다.
     ⚠️ ShopStyle **저장소 자체는 지우면 안 된다** — _buildShopStyleLayers(로고·워터마크·role 텍스트)와
     _learnShopStyle 의 '지운 역할 기억(enabled:false)' 이 같은 키를 쓴다. 여긴 UI 섹션만 제거.
   [#15] '샵 정보 반영하기' 토글을 '캡션 고정 멘트' → '매장 정보' 로 이동(키·동작 동일, 위치만).
   .subscreen-overlay + ss-* 디자인 재사용 → PC 사이드바 자동 안전. window.WorkspaceSettings.open(). */
(function () {
  'use strict';
  var ID = 'wsSettingsOverlay';
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
    // [#16 2026-07-17] '가장 최신이 위로' = 만든 순(createdAt) 내림차순.
    //   예전엔 lastUsedAt(최근 쓴 순)이라 오래 전에 만든 기억을 오늘 한 번 쓰면 맨 위로 올라와
    //   "방금 만든 게 왜 위에 없지?" 가 됐다. createdAt 이 없는 옛 레코드는 lastUsedAt 으로 폴백.
    var rows = mine.slice().sort(function (a, b) {
      return ((b.createdAt || b.lastUsedAt || 0) - (a.createdAt || a.lastUsedAt || 0));
    }).map(function (r) {
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
    return '<textarea class="ss-input" data-wss-footer rows="2" style="width:100%;resize:vertical;min-height:56px" placeholder="게시글 끝에 항상 붙일 문구 (예약 DM·영업시간 등). 비우면 안 붙어요.">' + esc(footer) + '</textarea>';
  }

  /* [2026-07-24] AI가 자동감지한 서명 — 원장님이 보고/고치고/끄게.
     예전엔 이게 안 보여서, 자동감지된 문구가 캡션에 조용히 붙는데 원장님은 알 수도 끌 수도 없었다.
     GET /persona/signature 로 불러와 각각 인라인 편집(→ manual, 재분석에 안 덮임) + 끄기(soft delete). */
  var _sigs = null;   // null=아직 안 불러옴, []=없음
  function _sigHtml() {
    if (_sigs === null) return '<div class="ss-card-sub" style="margin-top:12px">AI가 찾은 문구를 불러오는 중…</div>';
    if (!_sigs.length) return '';   // 없으면 소섹션 자체를 안 보여준다(고정멘트 입력만 깔끔히)
    return '<div class="ss-card-sub" style="margin-top:14px"><b>AI가 찾은 마무리 문구</b><br>원장님이 자주 쓰는 문구를 자동으로 찾았어요. 고치거나 끌 수 있어요.</div>' +
      _sigs.map(function (s) {
        var pos = (s.position === 'top') ? '맨 앞' : '맨 뒤';
        return '<div class="ss-row" style="align-items:flex-start;gap:10px;margin-top:8px">' +
          '<span class="lbl" style="flex:1;min-width:0">' +
            '<span style="display:block;font-size:11px;color:#B0B8C1;margin-bottom:3px">' + pos + '</span>' +
            '<textarea class="ss-input" data-wss-sigedit="' + esc(s.id) + '" rows="2" style="width:100%;resize:vertical;min-height:44px;font-size:13px">' + esc(s.content) + '</textarea>' +
          '</span>' +
          '<button type="button" data-wss-sigoff="' + esc(s.id) + '" aria-label="이 문구 끄기" title="이 문구 끄기" style="flex-shrink:0;background:none;border:1px solid #F0DADF;border-radius:9px;color:#BC6675;font-size:12.5px;font-weight:700;font-family:inherit;padding:6px 10px;cursor:pointer">끄기</button>' +
        '</div>';
      }).join('');
  }
  function _refreshSigs(el) {
    var host = (el || document.getElementById(ID));
    host = host && host.querySelector('[data-wss-sigwrap]');
    if (host) host.innerHTML = _sigHtml();
  }
  function _loadSigs(el) {
    var A = window.WorkspaceAdapter;
    if (!(A && A.listSignatures)) { _sigs = []; _refreshSigs(el); return; }
    A.listSignatures().then(function (list) {
      _sigs = (list || []).filter(function (s) { return s && s.content && String(s.content).trim(); });
      _refreshSigs(el);
    });
  }
  /* [#15 2026-07-17] '샵 정보 반영하기' 토글 — 매장 정보 섹션으로 옮김.
     원장 지적: "매장 정보에 게시물에 자동으로 쓰게 하지 말고 토글 있게 해."
     토글 자체는 원래 있었는데(같은 키 itdasy:caption_shopinfo) '캡션 고정 멘트' 섹션에 숨어 있어서
     매장 정보를 입력하는 사람 눈엔 '입력하면 무조건 자동으로 박힌다'로 보였다. 값을 읽는 곳은
     workspace-v2-flow 의 _shopCTA() 한 곳뿐 → 여기선 UI 위치만 옮긴다(동작·키 그대로). */
  function _shopInfoToggleHtml() {
    var on = get(K_SHOPINFO) === '1';
    return '<div class="ss-toggle" style="margin-top:12px"><div><div class="ss-toggle-lbl">샵 정보 반영하기</div>' +
      // [출시 QA 2026-08-06] 예전 문구는 '전화·예약 링크' 만 말했는데 입력칸은 3개였다.
      //   이제 가격·인스타도 실제로 붙으므로(workspace-v2-flow `_shopCTA`) 문구를 사실에 맞춘다.
      '<div class="ss-toggle-sub">켜면 게시글 <b>끝</b>에 <b>아래 적어둔 매장 정보</b>가 자동으로 붙어요. 끄면 아무것도 안 붙어요.</div></div>' +
      '<div class="ss-switch' + (on ? ' is-on' : '') + '" data-wss-shopinfo role="switch" aria-checked="' + (on ? 'true' : 'false') + '" tabindex="0"></div></div>';
  }


  /* [2026-07-23 보스] "사진에 자동으로 넣기" — 시술내용·해시태그를 사진 위에 자동으로 올릴지.
     저장소를 새로 만들지 않고 **ShopStyle 레이어의 enabled 플래그**를 그대로 쓴다.
     이유: 편집기에서 해시태그 레이어를 지우면 _learnShopStyle 이 이미 enabled:false 로 기록한다
     (원장이 "지우고 작업했으면 다음부터 안 나오게" 요청한 그 동작이 이미 여기 있었다).
     설정에 저장소를 따로 두면 두 곳이 어긋나 "껐는데 또 나온다"가 된다 — 같은 스위치를 보여줄 뿐이다. */
  /* [출시 QA 2026-08-06] 표시와 실제가 정반대였다 — 신규 원장님 기준 실측:
       · 토글 2개가 **켜진 걸로 보인다** (`_autoRoleOn` 이 스타일 없으면 true 를 돌려줬다)
       · 그런데 실제로는 사진에 아무것도 안 박힌다 — 오버레이는 `isConfirmed(ss)` 게이트를
         통과해야 하는데 시드 스타일은 `confirmed:false` 이고, 스타일 자체가 없을 수도 있다
         (workspace-v2-flow.js:311)
       · 게다가 끄려고 누르면 "설정을 저장하지 못했어요" 만 뜨고 안 꺼진다
         (`_setAutoRole` 이 스타일 없으면 곧장 false)
     읽기는 "켜짐"이라 하고 쓰기는 실패하는 비대칭이었다. 둘을 같은 진실에 맞춘다. */
  function _autoRoleOn(role) {
    try {
      var SS = window.ShopStyle;
      var ss = SS && SS.getActive ? SS.getActive() : null;
      // 스타일이 없거나 아직 확정 전이면 **실제로 안 박힌다** → 꺼짐으로 보여야 맞다.
      if (!ss || !Array.isArray(ss.layers)) return false;
      if (SS.isConfirmed && !SS.isConfirmed(ss)) return false;
      var L = ss.layers.filter(function (x) { return x.role === role; })[0];
      return !L || L.enabled !== false;
    } catch (_e) { return false; }
  }
  function _setAutoRole(role, on) {
    try {
      var SS = window.ShopStyle;
      if (!(SS && SS.save)) return false;
      // 아직 스타일이 없으면 여기서 만든다. 예전엔 그냥 실패시켜서, 사진을 한 번도
      // 안 만들어 본 원장님은 이 토글을 **영영 쓸 수 없었다.**
      var ss = SS.getActive && SS.getActive();
      if ((!ss || !Array.isArray(ss.layers)) && SS.ensureSeed) {
        try { ss = SS.ensureSeed(); } catch (_se) { ss = null; }
      }
      if (!ss || !Array.isArray(ss.layers)) return false;
      var next = ss.layers.map(function (L) {
        if (L.role !== role) return L;
        return Object.assign({}, L, { enabled: !!on });
      });
      // [5차] 원장이 설정에서 자동 텍스트를 직접 켜고/끈 것 = 스타일 명시 확정 → 이후 자동 오버레이 opt-in.
      SS.save(ss.id, { layers: next, confirmed: true });
      return true;
    } catch (_e) { return false; }
  }
  function _autoTextHtml() {
    var svcOn = _autoRoleOn('title'), hashOn = _autoRoleOn('hashtag');
    var row = function (key, on, label, sub) {
      return '<div class="ss-toggle" style="margin-top:12px"><div><div class="ss-toggle-lbl">' + label + '</div>' +
        '<div class="ss-toggle-sub">' + sub + '</div></div>' +
        '<div class="ss-switch' + (on ? ' is-on' : '') + '" data-wss-auto="' + key + '" role="switch" aria-checked="' +
        (on ? 'true' : 'false') + '" tabindex="0"></div></div>';
    };
    return '<div class="ss-card-sub">캡션을 만들면 사진 위에 자동으로 올라가는 글자예요. 편집기에서 지우면 여기도 자동으로 꺼져요.</div>' +
      row('title', svcOn, '시술 내용', '입력한 시술명이 사진 위에 큰 글씨로 올라가요.') +
      row('hashtag', hashOn, '해시태그', '만들어진 해시태그 <b>4개까지</b> 사진 위에 올라가요. 끄면 게시글에만 남고 사진엔 안 붙어요.');
  }


  /* [2026-07-23 보스] 아이콘 출처(오픈소스 고지) — **법적 의무**라 화면이 있어야 한다.
     확인한 원문 기준:
       · MIT (Fluent Emoji)      "저작권 고지와 이 허가 고지를 모든 사본에 포함해야 한다" → 고지 의무
       · Apache 2.0 (MingCute)   §4 배포 시 라이선스 사본 제공. 저자 README 는 "귀속은 감사하나 필수 아님,
                                 다만 아이콘 자체를 판매하지 말 것" → 우리는 앱 기능으로 쓰므로 OK
       · CC BY 4.0 (Streamline)  "상업적 이용 포함 자유. 단 적절한 크레딧 + streamlinehq.com 링크 필수"
     즉 **셋 다** 어떤 형태로든 고지가 필요하다 — 링크는 새 창으로 연다(앱 안에서 열면 심사에서 걸린다). */
  function _creditsHtml() {
    var C = (window.ItdIconStickers && window.ItdIconStickers.CREDITS) || [];
    if (!C.length) return '<div class="ss-card-sub">아이콘 정보를 불러오지 못했어요.</div>';
    return '<div class="ss-card-sub">사진 꾸미기(스티커)에 쓰는 아이콘의 출처예요. 라이선스에 따라 표기하고 있어요.</div>' +
      C.map(function (c) {
        return '<div class="ss-row" style="align-items:flex-start">' +
          '<span class="lbl" style="flex:1;min-width:0">' + esc(c.name) +
            '<span style="display:block;font-size:11.5px;color:#8B95A1;margin-top:2px">' + esc(c.license) + '</span></span>' +
          '<a href="' + esc(c.url) + '" target="_blank" rel="noopener noreferrer" ' +
            'style="flex-shrink:0;font-size:12.5px;font-weight:700;color:#BC6675;text-decoration:none;padding:4px 2px">출처 →</a></div>';
      }).join('');
  }


  /* [2026-07-23 보스] 예약한 게시물 — 목록 + 취소.
     이게 없어서 원장이 예약을 걸면 **막을 방법이 없었다.** 발행은 되돌릴 수 없는데
     취소 수단이 없는 건 그 자체로 사고다. 실패한 예약도 볼 데가 없어 조용히 묻혔다.
     백엔드 GET/DELETE /scheduled-posts 는 원래 있었는데 프론트가 안 쓰고 있었을 뿐이다. */
  var _sched = null;   // null=아직 안 불러옴, []=없음
  function _schedHtml() {
    if (_sched === null) return '<div class="ss-card-sub">예약한 게시물을 불러오는 중…</div>';
    if (!_sched.length) return '<div class="ss-card-sub">예약해 둔 게시물이 없어요. 작업실에서 게시글을 만들 때 <b>‘지금 말고 예약해서 올리기’</b>로 걸 수 있어요.</div>';
    var LABEL = { pending: '기다리는 중', sending: '올리는 중', sent: '올라감', failed: '실패' };
    var COLOR = { pending: '#BC6675', sending: '#C9A227', sent: '#0F766E', failed: '#DC2626' };
    return '<div class="ss-card-sub">예약 시각이 되면 자동으로 올라가요. 올라가기 전엔 취소할 수 있어요.</div>' +
      _sched.map(function (x) {
        var st = x.status || 'pending';
        var when = _fmtWhen(x.scheduled_at);
        var n = (x.image_urls || []).length || 1;
        var cancelable = (st === 'pending');
        return '<div class="ss-row" style="align-items:flex-start;gap:10px">' +
          '<span class="lbl" style="flex:1;min-width:0">' +
            '<span style="display:block;font-weight:700;color:#191F28">' + esc(when) + '</span>' +
            '<span style="display:block;font-size:11.5px;color:#8B95A1;margin-top:2px">' +
              '사진 ' + n + '장 · <span style="color:' + COLOR[st] + ';font-weight:700">' + (LABEL[st] || st) + '</span>' +
              (x.error_msg ? ' · ' + esc(String(x.error_msg).slice(0, 40)) : '') + '</span>' +
            (x.caption ? '<span style="display:block;font-size:11.5px;color:#B0B8C1;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(String(x.caption).slice(0, 50)) + '</span>' : '') +
          '</span>' +
          (cancelable
            ? '<button type="button" data-wss-schedcancel="' + esc(x.id) + '" style="flex-shrink:0;background:none;border:1px solid #F0DADF;border-radius:9px;color:#BC6675;font-size:12.5px;font-weight:700;font-family:inherit;padding:6px 10px;cursor:pointer">취소</button>'
            : '') +
        '</div>';
      }).join('');
  }
  function _fmtWhen(iso) {
    try {
      var d = new Date(iso), p = function (n) { return String(n).length < 2 ? '0' + n : '' + n; };
      return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + p(d.getHours()) + ':' + p(d.getMinutes());
    } catch (_e) { return '예약 시각'; }
  }
  function _refreshSched(el) {
    var host = (el || document.getElementById(ID));
    host = host && host.querySelector('[data-wss-schedwrap]');
    if (!host) return;
    host.innerHTML = _schedHtml();
  }
  function _loadSched(el) {
    var A = window.WorkspaceAdapter;
    if (!(A && A.listScheduled)) { _sched = []; _refreshSched(el); return; }
    A.listScheduled().then(function (list) {
      // 올라간 것/실패한 것도 보여주되 최근 것만 — 목록이 무한정 길어지면 취소할 걸 못 찾는다.
      _sched = (list || []).slice(0, 20);
      _refreshSched(el);
    });
  }

  function _ensureMounted() {
    var el = document.getElementById(ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = ID; el.className = 'subscreen-overlay'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      // [2026-07-22 보스] 저장 버튼 — DM 자동응답 설정창과 같은 자리·같은 역할.
      //   값은 원래도 입력이 끝나면 바로 저장되지만, 버튼이 없으면 원장님은 저장됐는지 알 수가 없다.
      '<header class="ss-topbar"><button type="button" class="ss-back" data-wss-back aria-label="뒤로"><svg width="14" height="14" aria-hidden="true"><use href="#ic-chevron-left"/></svg></button>' +
        '<div class="ss-title">작업실 설정</div>' +
        '<button type="button" data-wss-save style="margin-left:auto;background:none;border:none;cursor:pointer;color:#BC6675;font-size:15px;font-weight:700;font-family:inherit;padding:4px 6px;">저장</button></header>' +
      '<div class="ss-body">' +
        '<div class="ss-card">' + _hd('layers', '원장 작업 기억') + '<div data-wss-mem>' + _memHtml() + '</div></div>' +
        '<div class="ss-card">' + _hd('store', '매장 정보') +
          '<div class="ss-card-sub">여기 적어둔 정보는 <b>아래 토글을 켰을 때만</b> 게시글에 붙어요.</div>' +
          '<div class="wss-fromshop"><div class="wss-fromshop__tx"><b>상호·전화·주소·영업시간</b>은 <b>샵 정보</b>에서 관리해요.</div><button type="button" class="wss-fromshop__btn" data-wss-openshop>샵 정보 열기 ›</button></div>' +
          '<div class="ss-card-sub" style="margin:14px 0 10px">아래는 작업실 전용 항목이에요.</div>' +
          '<div data-wss-fields>' + _fieldsHtml() + '</div>' +
          '<div data-wss-shopinfowrap>' + _shopInfoToggleHtml() + '</div></div>' +
        '<div class="ss-card">' + _hd('clock', '예약한 게시물') +
          '<div data-wss-schedwrap>' + _schedHtml() + '</div></div>' +
        '<div class="ss-card">' + _hd('type', '사진에 자동으로 넣기') +
          '<div data-wss-autowrap>' + _autoTextHtml() + '</div></div>' +
        '<div class="ss-card">' + _hd('message-square', '캡션 고정 멘트') +
          '<div class="ss-card-sub">게시글 끝에 항상 붙는 문구예요.</div>' +
          '<div data-wss-footwrap>' + _footerHtml() + '</div>' +
          '<div data-wss-sigwrap>' + _sigHtml() + '</div></div>' +
        '<div class="ss-card">' + _hd('book-open', '아이콘 출처') +
          '<div data-wss-credits>' + _creditsHtml() + '</div></div>' +
      '</div>';
    document.body.appendChild(el);
    el.addEventListener('click', _onClick);
    // 입력 자동 저장(blur/change)
    el.addEventListener('change', function (e) {
      var inp = e.target.closest('[data-wss-key]');
      if (inp) { set(inp.getAttribute('data-wss-key'), inp.value); return; }
      // [2026-07-24] 자동감지 서명 인라인 편집 — blur/change 시 서버 저장(→ manual, 재분석 보호).
      var se = e.target.closest('[data-wss-sigedit]');
      if (se) {
        var seId = se.getAttribute('data-wss-sigedit');
        var val = String(se.value == null ? '' : se.value).trim();
        var A = window.WorkspaceAdapter;
        if (!val) { toast('내용을 비우려면 옆의 끄기를 눌러주세요'); return; }
        if (A && A.updateSignature) {
          A.updateSignature(seId, val).then(function (r) { if (r && r.ok) toast('문구를 저장했어요'); else toast('저장하지 못했어요'); });
        }
        return;
      }
    });
    el.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    return el;
  }

  function _onClick(e) {
    if (e.target.closest('[data-wss-back]')) { close(); return; }
    // [2026-07-22 보스] 저장 — close() 가 이미 고정멘트(서버)+입력값을 확정 저장하므로
    //   여기선 그걸 부르고 "저장됐다"고 말해준다. 저장 경로가 둘로 갈라지지 않게 일부러 재사용.
    if (e.target.closest('[data-wss-save]')) { close(); toast('저장했어요'); return; }
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
    // [2026-07-23] 예약 취소 — 되돌릴 수 없는 발행을 막는 유일한 수단이라 확인을 한 번 묻는다.
    var sc = e.target.closest('[data-wss-schedcancel]');
    if (sc) {
      var sid = sc.getAttribute('data-wss-schedcancel');
      var go = function () {
        var A = window.WorkspaceAdapter;
        if (!(A && A.cancelScheduled)) { toast('취소 기능을 불러오지 못했어요'); return; }
        sc.disabled = true; sc.textContent = '취소 중…';
        A.cancelScheduled(sid).then(function (r) {
          if (r && r.ok) { toast('예약을 취소했어요'); _loadSched(document.getElementById(ID)); }
          else { toast('취소하지 못했어요 — 잠시 뒤 다시'); sc.disabled = false; sc.textContent = '취소'; }
        });
      };
      if (typeof window.nativeConfirm === 'function') {
        window.nativeConfirm('예약 취소', '이 예약을 취소할까요?\n취소하면 인스타에 안 올라가요.', '취소하기')
          .then(function (ok) { if (ok) go(); }).catch(function () {});
      } else go();
      return;
    }
    // [2026-07-24] 자동감지 서명 끄기 — 캡션에 안 붙게 하고, 다음 재분석에도 안 살아난다.
    var so = e.target.closest('[data-wss-sigoff]');
    if (so) {
      var sigId = so.getAttribute('data-wss-sigoff');
      var offGo = function () {
        var A = window.WorkspaceAdapter;
        if (!(A && A.deleteSignature)) { toast('불러오지 못했어요'); return; }
        so.disabled = true; so.textContent = '끄는 중…';
        A.deleteSignature(sigId).then(function (r) {
          if (r && r.ok) { toast('이 문구는 이제 안 붙어요'); _loadSigs(document.getElementById(ID)); }
          else { toast('끄지 못했어요 — 잠시 뒤 다시'); so.disabled = false; so.textContent = '끄기'; }
        });
      };
      if (typeof window.nativeConfirm === 'function') {
        window.nativeConfirm('문구 끄기', '이 문구를 앞으로 캡션에 안 붙일까요?', '끄기')
          .then(function (ok) { if (ok) offGo(); }).catch(function () {});
      } else offGo();
      return;
    }
    // [2026-07-23] 사진 자동삽입(시술내용·해시태그) — ShopStyle 레이어 enabled 토글
    var at = e.target.closest('[data-wss-auto]');
    if (at) {
      var role = at.getAttribute('data-wss-auto');
      var aOn = !at.classList.contains('is-on');
      if (!_setAutoRole(role, aOn)) { toast('설정을 저장하지 못했어요'); return; }
      at.classList.toggle('is-on', aOn); at.setAttribute('aria-checked', aOn ? 'true' : 'false');
      toast(aOn ? (role === 'hashtag' ? '해시태그를 사진에 넣을게요' : '시술 내용을 사진에 넣을게요')
                : (role === 'hashtag' ? '해시태그는 사진에 안 넣어요' : '시술 내용은 사진에 안 넣어요'));
      return;
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

  function open() {
    syncFromShopInfo();   // 열 때마다 앱 샵 정보 최신값을 캡션 키로 미러
    var el = _ensureMounted();
    // 열 때마다 최신값으로 새로 그림
    var fh = el.querySelector('[data-wss-fields]'); if (fh) fh.innerHTML = _fieldsHtml();
    var fw = el.querySelector('[data-wss-footwrap]'); if (fw) fw.innerHTML = _footerHtml();
    _sigs = null; _refreshSigs(el); _loadSigs(el);   // 자동감지 서명은 서버에서 매번 새로
    var sw = el.querySelector('[data-wss-shopinfowrap]'); if (sw) sw.innerHTML = _shopInfoToggleHtml();
    // 편집기에서 해시태그를 지우면 _learnShopStyle 이 enabled:false 를 남긴다 → 열 때마다 최신 상태로.
    var aw = el.querySelector('[data-wss-autowrap]'); if (aw) aw.innerHTML = _autoTextHtml();
    _sched = null; _refreshSched(el); _loadSched(el);   // 예약 목록은 서버에서 매번 새로(취소 반영)
    _selMem = null; _refreshMem();
    el.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(function () { el.classList.add('is-open'); });
    // [2026-07-22 보스] 뒤로가기 등록 — 안 하면 안드로이드 back/스와이프에서 이 화면 대신 앱이 그대로 꺼진다.
    if (typeof window._registerSheet === 'function') window._registerSheet('wsSettings', close);
    if (typeof window._markSheetOpen === 'function') window._markSheetOpen('wsSettings');
  }
  function close() {
    var el = document.getElementById(ID); if (!el) return;
    _saveFooter(el);   // 닫을 때 고정멘트 저장(서버 반영)
    // 입력값도 확정 저장(change 못 받은 것 대비)
    Array.prototype.forEach.call(el.querySelectorAll('[data-wss-key]'), function (inp) { set(inp.getAttribute('data-wss-key'), inp.value); });
    el.classList.remove('is-open'); el.setAttribute('aria-hidden', 'true');
    if (typeof window._markSheetClosed === 'function') window._markSheetClosed('wsSettings');
  }

  window.WorkspaceSettings = { open: open, close: close, syncFromShopInfo: syncFromShopInfo };
  try { syncFromShopInfo(); } catch (_e) { void _e; }   // 부팅 시 1회 미러(캡션이 샵 정보 전화·상호 쓰게)
})();
