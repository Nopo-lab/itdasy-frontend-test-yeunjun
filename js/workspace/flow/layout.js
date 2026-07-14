/* workspace/flow/layout.js — 레이아웃 고르기 화면 클러스터 (T-104 P2, 2026-07-10)
   [T-116 2026-07-15] 결과물 여러 장(wsCards) 재설계.
     - 상태: d.wsCards = [{ id, layout(클론|null), photoIds }] · 카드 1개 = 올라갈 사진 1장 = templateOutputs 1개.
     - 진입하면 사진 순서대로 2장씩 자동으로 묶는다(reassignRoles 와 같은 첫=전·둘째=후 규칙).
     - 하단 도크에서 레이아웃을 고르고(=든다) 카드를 누르면 그 카드에 적용. 사진 수가 맞는 카드만 눌린다.
     - d.wsLayout / d._wsAssign 은 '첫 카드' 별칭으로 유지 — 편집기 브리지·발행 kind 등 기존 소비처 무변경.
   flow.js 상태는 context 주입으로 접근: D()=현재 d, CUR()=현재 화면, EL()=루트 엘리먼트.
   window.WSFlowLayout.create(ctx) → 화면 함수 묶음 반환. flow.js 가 별칭으로 재수입. */
(function () {
  'use strict';
  function create(ctx) {
    var WSU = window.WSFlowUtil || {}, esc = WSU.esc, toast = WSU.toast;
    var setScreen = ctx.setScreen, editablePhotos = ctx.editablePhotos, photoUrl = ctx.photoUrl, _cleanBase = ctx.cleanBase;
    function D() { return ctx.d(); }       // 현재 상태 객체(open 마다 새로 할당되므로 접근자)
    function CUR() { return ctx.cur(); }   // 현재 화면 이름
    function EL() { return ctx.el(); }     // 플로우 루트 엘리먼트

    var MAXSLOT = 4;                       // 스타터 최대 칸수 — 한 카드에 이보다 많이 못 넣는다
    var _seq = 0;                          // 카드 id 시퀀스
    var RATIO = { '1:1': 1, '4:5': 0.8, '9:16': 0.5625, '3:4': 0.75 };
    // 메뉴 = layout-model 의 kind 를 원장님 말로. '자랑'은 single+headline 을 합침. 첫 칸 '전체'는 기존 템플릿 칩 관례.
    var CATS = [
      { key: '전체', kinds: null }, { key: '전후', kinds: ['before_after'] },
      { key: '자랑', kinds: ['single', 'headline'] }, { key: '붙이기', kinds: ['collage'] },
      { key: '후기', kinds: ['review'] }, { key: '팁', kinds: ['steps'] }, { key: '가격', kinds: ['price'] }
    ];

    function _starters() { var WL = window.WorkspaceLayout; return (WL && WL.getStarters()) || []; }
    function _mine() { var WL = window.WorkspaceLayout; return (WL && WL.getMyLayouts()) || []; }
    function _allLayouts() { return _mine().concat(_starters()); }
    function _slotsOf(L) { return L ? (L.photoSlots || []).length : 1; }
    function _arOf(L) { return L ? (RATIO[L.ratio] || 0.8) : 0.8; }
    // 사진 n장에 딱 맞는 레이아웃(클론) — 전후 우선(스타터가 '전후 비교 우선' 순이라 앱 관례와 같음)
    function _bestFit(n) {
      var f = _starters().filter(function (L) { return _slotsOf(L) === n; });
      if (!f.length) return null;
      return f.filter(function (L) { return L.kind === 'before_after'; })[0] || f[0];
    }
    function _photoById(id) { return (editablePhotos() || []).filter(function (p) { return String(p.id) === String(id); })[0]; }
    function _cardPhotos(c) { return (c.photoIds || []).map(_photoById).filter(Boolean); }
    function _cardAssign(c) {
      var WL = window.WorkspaceLayout;
      if (!c.layout || !WL) return null;
      return WL.autoAssign(_cardPhotos(c), c.layout);   // 역할(before/after) 우선 → 인셋 같은 슬롯 순서도 안 뒤집힌다
    }
    // 은/는 — 받침 있으면 '은'. '전후 · 상하은' 같은 어색한 말 안 나오게.
    function _eunNeun(s) {
      var ch = String(s).trim().slice(-1), code = ch.charCodeAt(0);
      if (code < 0xAC00 || code > 0xD7A3) return '는';
      return (code - 0xAC00) % 28 ? '은' : '는';
    }

    // 진입 자동 제안 — 사진 순서대로 2장씩. 역할도 같이 박아 넣는다(reassignRoles 와 같은 규칙).
    function _autoCards() {
      var eps = editablePhotos() || [], cards = [], i = 0;
      while (i < eps.length) {
        if (i + 1 < eps.length) {
          eps[i].role = 'before'; eps[i + 1].role = 'after';
          cards.push({ id: 'wsc-' + (++_seq), layout: _bestFit(2), photoIds: [eps[i].id, eps[i + 1].id] });
          i += 2;
        } else {
          cards.push({ id: 'wsc-' + (++_seq), layout: null, photoIds: [eps[i].id] });
          i += 1;
        }
      }
      return cards;
    }
    // 사진이 바뀐 채로 돌아왔을 때(업로드에서 추가/해제) 카드를 현실에 맞춘다 — 없는 사진 빼고, 새 사진은 낱장으로.
    function _reconcile() {
      var d = D(), eps = editablePhotos() || [];
      if (!Array.isArray(d.wsCards) || !d.wsCards.length) { d.wsCards = _autoCards(); _syncAlias(); return; }
      var live = {}; eps.forEach(function (p) { live[String(p.id)] = 1; });
      d.wsCards.forEach(function (c) { c.photoIds = (c.photoIds || []).filter(function (id) { return live[String(id)]; }); });
      d.wsCards = d.wsCards.filter(function (c) { return c.photoIds.length; });
      var seen = {}; d.wsCards.forEach(function (c) { c.photoIds.forEach(function (id) { seen[String(id)] = 1; }); });
      eps.forEach(function (p) { if (!seen[String(p.id)]) d.wsCards.push({ id: 'wsc-' + (++_seq), layout: null, photoIds: [p.id] }); });
      // 사진 수와 칸 수가 어긋나면 빈 칸이 생기거나 사진이 사라진다 — 장수에 맞는 레이아웃으로 다시 잡는다.
      d.wsCards.forEach(function (c) {
        var n = c.photoIds.length;
        if (c.layout && _slotsOf(c.layout) !== n) c.layout = _bestFit(n);
        else if (!c.layout && n > 1) c.layout = _bestFit(n);
      });
      if (!d.wsCards.length) d.wsCards = _autoCards();
      _syncAlias();
    }
    // 첫 카드를 wsLayout/_wsAssign 에 비춰 둔다 — 편집기 브리지·발행 kind 등 기존 소비처가 그대로 동작하게.
    function _syncAlias() {
      var d = D(), c = (d.wsCards || [])[0];
      d.wsLayout = c ? c.layout : null;
      d._wsAssign = c ? _cardAssign(c) : null;
    }
    function CARDS() { var d = D(); if (!Array.isArray(d.wsCards) || !d.wsCards.length) { d.wsCards = _autoCards(); _syncAlias(); } return d.wsCards; }
    function _cardIdx(id) { var cs = CARDS(); for (var i = 0; i < cs.length; i++) { if (cs[i].id === id) return i; } return -1; }
    function _held() { var d = D(); return d._wsHeld ? _allLayouts().filter(function (L) { return L.id === d._wsHeld; })[0] : null; }
    function _canTake(c, L) { return _slotsOf(L) === c.photoIds.length; }

    // ── 카드 → 결과물. 카드 1개 = templateOutputs 1개(레이아웃 없으면 사진 그대로).
    //    전후 2장 카드는 before/afterPhotoId 까지 채워 기존 소비처(짝별 수정·성과 귀속)와 결이 맞게 둔다.
    function composeCards() {
      var d = D(), WL = window.WorkspaceLayout;
      _reconcile();
      var cards = d.wsCards || [];
      if (!WL || !cards.length) return Promise.resolve(null);
      return Promise.all(cards.map(function (c, i) {
        var ps = _cardPhotos(c);
        if (!c.layout) {
          var p0 = ps[0];
          return Promise.resolve(p0 ? { pairId: c.id, templateId: null, beforePhotoId: null, afterPhotoId: null,
            outputUrl: (p0.editedDataUrl || p0.dataUrl || photoUrl(p0)), pairLabel: (i + 1) + '번째', photoIds: c.photoIds.slice() } : null);
        }
        var map = _cardAssign(c) || {};
        var bId = null, aId = null;
        (c.layout.photoSlots || []).forEach(function (sl) {
          if (sl.role === 'before' && map[sl.id]) bId = map[sl.id].id;
          if (sl.role === 'after' && map[sl.id]) aId = map[sl.id].id;
        });
        return Promise.resolve(WL.composeLayout(_fillLayoutText(c.layout), ps, map)).then(function (url) {
          return url ? { pairId: c.id, templateId: c.layout.id, beforePhotoId: bId, afterPhotoId: aId,
            outputUrl: url, pairLabel: (i + 1) + '번째', photoIds: c.photoIds.slice() } : null;
        }).catch(function () { return null; });
      })).then(function (list) {
        var outs = list.filter(Boolean);
        if (!outs.length) { toast('레이아웃을 굽지 못했어요 — 사진 그대로 진행할게요'); return null; }
        d.templateOutputs = outs;
        d.templateOutput = outs[0].outputUrl;
        d.templateOutputId = outs[0].templateId;
        d.activeDisplayId = null;
        d.previewUrl = null;
        if (outs.length < cards.length) toast((cards.length - outs.length) + '장은 못 만들어서 뺐어요');
        return outs;
      });
    }
    // 후기 레이아웃은 캡션이 확정된 뒤에야 본문을 채울 수 있다 → 캡션 단계에서 다시 굽는다.
    function hasReviewCard() { return (CARDS() || []).some(function (c) { return c.layout && c.layout.kind === 'review'; }); }

    // ── 렌더 ─────────────────────────────────────────────
    function _prevInner(c) {
      var L = c.layout, ps = _cardPhotos(c);
      if (!L) { var p0 = ps[0]; return '<i class="wsl-ph" style="left:0;top:0;width:100%;height:100%;background-image:url(' + esc(p0 ? photoUrl(p0) : '') + ')"></i>'; }
      var map = _cardAssign(c) || {};
      return (L.photoSlots || []).map(function (sl) {
        var p = map[sl.id], r = sl.rect;
        return '<i class="wsl-ph" style="left:' + (r.x * 100) + '%;top:' + (r.y * 100) + '%;width:' + (r.w * 100) + '%;height:' + (r.h * 100) + '%;' +
          (p ? 'background-image:url(' + esc(photoUrl(p)) + ');' : '') + '"></i>';
      }).join('') + _layersHtml(L);
    }
    // 텍스트 레이어를 캔버스와 같은 비율로(cqmin) — 굽기 전에도 결과를 짐작할 수 있게.
    function _layersHtml(L) {
      return (L.layers || []).map(function (t) {
        var left = (t.x * 100) + '%', top = (t.y * 100) + '%', w = (t.w * 100) + '%';
        if (t.role === 'panel') return '<b style="left:' + left + ';top:' + top + ';width:' + w + ';height:' + ((1 - t.y) * 100) + '%;background:' + esc(t.bg || '#fff') + '"></b>';
        if (!t.text) return '';
        var pad = t.bg ? 'padding:.25em .4em;background:' + esc(t.bg) + ';border-radius:.2em;display:inline-block;width:auto;' : '';
        var al = t.align === 'left' ? 'left' : (t.align === 'right' ? 'right' : 'center');
        return '<b style="left:' + left + ';top:' + top + ';width:' + w + ';font-size:' + ((t.size || 0.045) * 100) + 'cqmin;color:' + esc(t.color || '#fff') + ';text-align:' + al + ';' + pad + '">' + esc(t.text) + '</b>';
      }).join('');
    }
    function _thumbSvg(L) {
      var ar = _arOf(L), VH = 34, VW = 34 * ar, PAD = 1;
      var panels = (L.layers || []).filter(function (t) { return t.role === 'panel'; }).map(function (t) {
        return '<rect class="pn" x="' + (t.x * VW).toFixed(2) + '" y="' + (t.y * VH).toFixed(2) + '" width="' + (t.w * VW).toFixed(2) + '" height="' + ((1 - t.y) * VH).toFixed(2) + '"/>';
      }).join('');
      var slots = (L.photoSlots || []).map(function (s) {
        var r = s.rect;
        return '<rect class="sl" x="' + (r.x * VW + PAD).toFixed(2) + '" y="' + (r.y * VH + PAD).toFixed(2) +
          '" width="' + Math.max(0, r.w * VW - PAD * 2).toFixed(2) + '" height="' + Math.max(0, r.h * VH - PAD * 2).toFixed(2) + '" rx="1.1"/>';
      }).join('');
      return '<svg viewBox="0 0 ' + VW.toFixed(2) + ' ' + VH + '" aria-hidden="true">' + panels + slots + '</svg>';
    }
    function _cardTitle(c) { return _cardPhotos(c).map(function (p, i) { return '사진 ' + (i + 1); }).join(' · '); }
    function _ttlHtml(c) { return esc(_cardTitle(c)) + (c.layout ? ' <em>· ' + esc(c.layout.name) + '</em>' : ' <em>· 사진 그대로</em>'); }

    function _layoutsIn(key) {
      if (key === '내 것') return _mine();
      var cat = CATS.filter(function (x) { return x.key === key; })[0];
      if (!cat || !cat.kinds) return _allLayouts();
      return _starters().filter(function (L) { return cat.kinds.indexOf(L.kind) >= 0; });
    }
    function _cats() { return (_mine().length ? [{ key: '내 것' }] : []).concat(CATS); }

    function renderLayout() {
      _reconcile();
      var d = D(), cards = CARDS(), HL = _held();
      var cat = d._wsCat || '전체';

      var slides = cards.map(function (c, i) {
        var nextTot = cards[i + 1] ? c.photoIds.length + cards[i + 1].photoIds.length : 99;
        return '<div class="wsc-slide"><div class="wsc-card" data-fl-card="' + esc(c.id) + '">' +
          '<div class="wsc-top"><span class="wsc-n">' + (i + 1) + '</span><span class="wsc-ttl">' + _ttlHtml(c) + '</span></div>' +
          '<div class="wsc-prevbox" data-fl-cardtap="' + esc(c.id) + '" role="button" tabindex="0">' +
            '<div class="wsc-prev" style="width:min(100cqw, calc(100cqh * ' + _arOf(c.layout) + '));aspect-ratio:' + _arOf(c.layout) + '">' +
              _prevInner(c) +
              '<div class="wsc-stagehost" data-fl-cardstage="' + esc(c.id) + '"></div>' +
              '<span class="wsc-tapover"><span>여기 넣기</span></span></div>' +
            '<span class="wsc-needs"></span>' +
          '</div>' +
          '<div class="wsc-acts">' +
            '<button type="button" class="wsc-act" data-haptic="light" data-fl-join="' + i + '"' + (nextTot <= MAXSLOT ? '' : ' disabled') + '>' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>옆이랑 합치기</button>' +
            '<button type="button" class="wsc-act" data-haptic="light" data-fl-split="' + esc(c.id) + '"' + (c.photoIds.length > 1 ? '' : ' disabled') + '>' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 3v18M18 3v18"/></svg>나누기</button>' +
          '</div>' +
        '</div></div>';
      }).join('');

      var dots = cards.map(function (c, i) { return '<button type="button" class="wsc-dot" data-fl-dot="' + i + '"></button>'; }).join('');
      var cats = _cats().map(function (x) {
        return '<button type="button" class="wsc-cat' + (cat === x.key ? ' on' : '') + '" data-fl-cat="' + esc(x.key) + '" aria-pressed="' + (cat === x.key) + '">' + esc(x.key) + '</button>';
      }).join('');
      var thumbs = _layoutsIn(cat).map(function (L, i) {
        var isMine = cat === '내 것';
        return '<div class="wsc-thumbwrap">' +
          '<button type="button" class="wsc-thumb" data-fl-thumb="' + esc(L.id) + '" data-haptic="light" style="animation-delay:' + (i * 26) + 'ms" ' +
            'aria-label="' + esc(L.name) + ' · 사진 ' + _slotsOf(L) + '장 · ' + esc(L.ratio || '4:5') + '">' +
            '<span class="wsc-thumb__f" style="aspect-ratio:' + _arOf(L) + '">' + _thumbSvg(L) + '<span class="wsc-thumb__cnt">' + _slotsOf(L) + '장</span></span>' +
            '<span class="wsc-thumb__n">' + esc(L.name) + '</span></button>' +
          (isMine ? '<button type="button" class="wsc-thumb__del" data-fl-dellayout="' + esc(L.id) + '" aria-label="' + esc(L.name) + ' 삭제">×</button>' : '') +
        '</div>';
      }).join('');

      var hint = HL
        ? '<span><strong>' + esc(HL.name) + '</strong> · ' + (cards.some(function (c) { return _canTake(c, HL); }) ? '넣을 사진을 누르세요' : '사진 ' + _slotsOf(HL) + '장짜리가 없어요') + '</span>' +
          '<button type="button" data-fl="releaselayout">그만두기</button>'
        : '<span>레이아웃을 고르고 → 넣을 사진을 누르세요</span>' +
          (D().wsLayout ? '<button type="button" data-fl="savelayout">이 레이아웃 저장</button>' : '');

      return '<div class="wsc-wrap' + (HL ? ' is-holding' : '') + '">' +
        '<div class="wsc-stage">' +
          '<div class="wsc-rail">' +
            '<button type="button" class="wsc-nav wsc-nav--prev" data-fl-cnav="-1" aria-label="이전 사진"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>' +
            '<div class="wsc-cards" data-fl-cards>' + slides + '</div>' +
            '<button type="button" class="wsc-nav wsc-nav--next" data-fl-cnav="1" aria-label="다음 사진"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>' +
          '</div>' +
          '<div class="wsc-dots" data-fl-dots>' + dots + '</div>' +
        '</div>' +
        '<div class="wsc-dock' + (HL ? ' is-holding' : '') + '">' +
          '<p class="wsc-hint" data-fl-hint>' + hint + '</p>' +
          '<div class="wsc-cats">' + cats + '</div>' +
          '<div class="wsc-lrail">' +
            '<button type="button" class="wsc-lnav wsc-lnav--prev" data-fl-lnav="-1" aria-label="레이아웃 이전"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>' +
            '<div class="wsc-thumbs wsc-thumbs--fresh" data-fl-thumbs>' + thumbs + '</div>' +
            '<button type="button" class="wsc-lnav wsc-lnav--next" data-fl-lnav="1" aria-label="레이아웃 다음"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="wsl-skip" data-haptic="light" data-fl="skiplayout">레이아웃 없이 진행 (사진 그대로)</button>' +
      '</div>';
    }

    // 상태 표시는 클래스만 토글 — 노드를 갈아치우면 트랜지션이 붙을 자리가 없어져 뚝뚝 끊긴다.
    function _syncStates() {
      var root = EL(); if (!root) return;
      var HL = _held(), cards = CARDS();
      var wrap = root.querySelector('.wsc-wrap'), dock = root.querySelector('.wsc-dock');
      if (wrap) wrap.classList.toggle('is-holding', !!HL);
      if (dock) dock.classList.toggle('is-holding', !!HL);
      [].forEach.call(root.querySelectorAll('.wsc-card'), function (el, i) {
        var c = cards[i]; if (!c) return;
        var ok = HL ? _canTake(c, HL) : false;
        el.classList.toggle('ok', !!HL && ok);
        el.classList.toggle('no', !!HL && !ok);
        var needs = el.querySelector('.wsc-needs');
        if (needs) needs.textContent = HL ? ('사진 ' + _slotsOf(HL) + '장 필요') : '';
      });
      [].forEach.call(root.querySelectorAll('.wsc-thumb'), function (t) {
        var on = t.getAttribute('data-fl-thumb') === D()._wsHeld;
        t.classList.toggle('on', on); t.setAttribute('aria-pressed', on);
      });
      _syncDots();
    }
    function _syncDots() {
      var root = EL(); if (!root) return;
      var HL = _held(), cards = CARDS(), cur = D()._wsCur || 0;
      [].forEach.call(root.querySelectorAll('[data-fl-dot]'), function (dt, i) {
        var c = cards[i]; if (!c) return;
        dt.classList.toggle('on', i === cur);
        dt.classList.toggle('fit', !!(HL && _canTake(c, HL)));
        dt.setAttribute('aria-label', (i + 1) + '번째로' + (HL && _canTake(c, HL) ? ' (여기 넣을 수 있어요)' : ''));
      });
      var p = root.querySelector('[data-fl-cnav="-1"]'), n = root.querySelector('[data-fl-cnav="1"]');
      if (p) p.disabled = cur <= 0;
      if (n) n.disabled = cur >= cards.length - 1;
      var lr = root.querySelector('[data-fl-thumbs]');
      var over = lr && (lr.scrollWidth - lr.clientWidth > 4);
      var lp = root.querySelector('[data-fl-lnav="-1"]'), ln = root.querySelector('[data-fl-lnav="1"]');
      if (lp) lp.disabled = !over;
      if (ln) ln.disabled = !over;
    }
    // 렌더 후 캐러셀 위치 복원은 즉시 — scroll-behavior:smooth 가 대입에도 걸려 0→원위치 되감기가 보인다.
    function _syncScroll() {
      var root = EL(); if (!root) return;
      var el = root.querySelector('[data-fl-cards]'); if (!el) return;
      var prev = el.style.scrollBehavior;
      el.style.scrollBehavior = 'auto';
      el.scrollLeft = (D()._wsCur || 0) * el.clientWidth;
      el.style.scrollBehavior = prev || '';
    }

    // 카드 미리보기 = 슬롯 스테이지(드래그로 위치·핀치로 확대). 레이아웃을 들고 있을 땐 '누르면 적용'이라 안 붙인다.
    function _wsMountStage() {
      var root = EL(); if (!root) return;
      _syncStates(); _syncScroll(); _bindCards();
      // 레이아웃을 들고 있으면 '누르면 적용'이라 드래그를 안 붙인다(탭이 스테이지에 먹히면 적용이 안 됨).
      if (_held() || !window.WorkspaceSlotStage) return;
      var cards = CARDS();
      [].forEach.call(root.querySelectorAll('[data-fl-cardstage]'), function (host, i) {
        var c = cards[i]; if (!c || !c.layout) return;
        // mount 가 host.className/innerHTML 을 통째로 갈아치운다(→ '.wsl-stage') — 그래서 전용 안쪽 host 에만 붙인다.
        window.WorkspaceSlotStage.mount(host, {
          layout: c.layout, photos: _cardPhotos(c), assign: _cardAssign(c),
          onChange: function () { D().previewUrl = null; D().templateOutput = null; _syncAlias(); }   // 재조정 시 옛 합성본 무효화
        });
      });
    }
    var _boundEl = null;
    function _bindCards() {
      var root = EL(); if (!root) return;
      var el = root.querySelector('[data-fl-cards]'); if (!el || _boundEl === el) return;
      _boundEl = el;
      el.addEventListener('scroll', function () {
        var i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
        if (i !== D()._wsCur) { D()._wsCur = i; _syncDots(); }
      }, { passive: true });
    }
    function _goCard(i) {
      var root = EL(); if (!root) return;
      var el = root.querySelector('[data-fl-cards]'); if (!el) return;
      var cards = CARDS();
      D()._wsCur = Math.max(0, Math.min(cards.length - 1, i));
      el.scrollTo({ left: D()._wsCur * el.clientWidth });
      _syncDots();
    }

    // 레이아웃 교체 = 그 카드만 갈아끼우고 옛 그림을 겹쳐 지운다(크로스페이드) — 전체 재렌더 안 하니 캐러셀 위치도 안 흔들린다.
    function _swapPreview(ci) {
      var root = EL(); if (!root) return;
      var slide = root.querySelectorAll('.wsc-slide')[ci]; if (!slide) return;
      var box = slide.querySelector('.wsc-prevbox'), oldPrev = box && box.querySelector('.wsc-prev');
      if (!box || !oldPrev) return;
      var c = CARDS()[ci];
      var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var np = document.createElement('div');
      np.className = 'wsc-prev' + (reduced ? '' : ' wsc-prev--in');
      np.setAttribute('style', 'width:min(100cqw, calc(100cqh * ' + _arOf(c.layout) + '));aspect-ratio:' + _arOf(c.layout));
      np.innerHTML = _prevInner(c) + '<div class="wsc-stagehost" data-fl-cardstage="' + esc(c.id) + '"></div>' +
        '<span class="wsc-tapover"><span>여기 넣기</span></span>';
      if (reduced) { oldPrev.replaceWith(np); }
      else {
        var ghost = oldPrev.cloneNode(true);
        ghost.classList.add('wsc-prev--ghost');
        oldPrev.replaceWith(np);
        box.appendChild(ghost);
        requestAnimationFrame(function () { ghost.classList.add('out'); });
        // transitionend 가 안 오는 경우(연타 등)에도 유령이 남지 않게 타이머로 확실히 치운다
        var killed = false;
        var kill = function () { if (killed) return; killed = true; if (ghost.parentNode) ghost.parentNode.removeChild(ghost); };
        ghost.addEventListener('transitionend', kill);
        setTimeout(kill, 600);
      }
      var ttl = slide.querySelector('.wsc-ttl'); if (ttl) ttl.innerHTML = _ttlHtml(c);
    }

    function _applyHeld(ci) {
      var HL = _held(), c = CARDS()[ci];
      if (!HL || !c) return;
      if (!_canTake(c, HL)) {
        var n = _slotsOf(HL);
        toast(HL.name + _eunNeun(HL.name) + ' 사진 ' + n + '장이 필요해요 · ' + (c.photoIds.length < n ? '합치기로 더 넣어주세요' : '나누기로 줄여주세요'));
        return;
      }
      if (c.layout && c.layout.id === HL.id) { toast('이미 ' + HL.name + ' 이에요'); return; }
      c.layout = HL;                    // getStarters/getMyLayouts 가 클론을 주므로 카드끼리 focal 이 안 섞인다
      D().templateOutput = null; D().previewUrl = null;
      _syncAlias(); _swapPreview(ci);
      toast((ci + 1) + '번째에 ' + HL.name + ' 넣었어요');
    }

    function _joinCards(i) {
      var cards = CARDS(), a = cards[i], b = cards[i + 1];
      if (!b) { toast('옆에 합칠 사진이 없어요'); return; }
      var ids = a.photoIds.concat(b.photoIds);
      if (ids.length > MAXSLOT) { toast('한 장에는 사진 ' + MAXSLOT + '장까지 넣을 수 있어요'); return; }
      var ps = ids.map(_photoById).filter(Boolean);
      if (ps.length === 2) { ps[0].role = 'before'; ps[1].role = 'after'; }   // 2장이면 전/후로 — 인셋 같은 슬롯도 안 뒤집히게
      cards.splice(i, 2, { id: 'wsc-' + (++_seq), layout: _bestFit(ids.length), photoIds: ids });
      D()._wsCur = Math.min(i, cards.length - 1);
      D().templateOutput = null; D().previewUrl = null;
      _syncAlias();
      if (CUR() === 'layout') setScreen('layout', { push: false });
      toast('합쳤어요 · 올라갈 사진 ' + cards.length + '장');
    }
    function _splitCard(id) {
      var cards = CARDS(), i = _cardIdx(id); if (i < 0) return;
      var parts = cards[i].photoIds.map(function (pid) { return { id: 'wsc-' + (++_seq), layout: null, photoIds: [pid] }; });
      cards.splice.apply(cards, [i, 1].concat(parts));
      D()._wsCur = i;
      D().templateOutput = null; D().previewUrl = null;
      _syncAlias();
      if (CUR() === 'layout') setScreen('layout', { push: false });
      toast('나눴어요 · 올라갈 사진 ' + cards.length + '장');
    }

    // [E2] 내 레이아웃 저장 — 지금 보고 있는 카드의 레이아웃(드래그로 맞춘 focal/zoom 포함)을 그대로 보관.
    function _wsSaveMyLayout() {
      var c = CARDS()[D()._wsCur || 0];
      if (!c || !c.layout || !(window.ShopStyle && window.ShopStyle.create)) { toast('저장할 레이아웃이 없어요'); return; }
      var L = c.layout;
      var slots = (L.photoSlots || []).map(function (s) { return { id: s.id, role: s.role, rect: Object.assign({}, s.rect), focal: Object.assign({ x: 0.5, y: 0.5 }, s.focal), zoom: s.zoom || 1, fit: s.fit || 'cover' }; });
      var layers = (L.layers || []).map(function (x) { return Object.assign({}, x); });
      var n = _mine().length;
      try {
        window.ShopStyle.create({ name: '내 레이아웃 ' + (n + 1), kind: L.kind || 'custom', ratio: L.ratio || '4:5', photoSlots: slots, layers: layers, _wsMyLayout: true });
        toast('내 레이아웃에 저장했어요');
        if (CUR() === 'layout') setScreen('layout', { push: false });
      } catch (_e) { toast('저장을 못했어요'); }
    }
    // [E3] 내 레이아웃 삭제 — 쓰고 있던 카드가 있으면 장수에 맞는 기본으로 되돌린다(빈 칸 방지).
    function _wsDeleteMyLayout(id) {
      try { if (window.ShopStyle && window.ShopStyle.remove) window.ShopStyle.remove(id); } catch (_e) { void _e; }
      CARDS().forEach(function (c) { if (c.layout && c.layout.id === id) c.layout = _bestFit(c.photoIds.length); });
      if (D()._wsHeld === id) D()._wsHeld = null;
      D().templateOutput = null; D().previewUrl = null;
      _syncAlias();
      toast('삭제했어요');
      if (CUR() === 'layout') setScreen('layout', { push: false });
    }

    // ws-hyper→ItdEditor: 첫 카드의 레이아웃을 편집기 콜라주로. 프리셋 매칭이면 슬롯 재조정 가능, 아니면 합성본 보존.
    //   편집기 LAYOUTS idx: 0=single 1=v2(좌우) 2=h2(상하) 3=v3 4=grid4 5=l1r2 6=t1b2 7=ba(전후)
    function _matchItdPreset(slots) {
      var PRESETS = [
        { idx: 0, cells: [[0, 0, 1, 1]] },
        { idx: 1, cells: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]] },
        { idx: 2, cells: [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]] },
        { idx: 3, cells: [[0, 0, 1 / 3, 1], [1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 1 / 3, 1]] },
        { idx: 4, cells: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
        { idx: 5, cells: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
        { idx: 6, cells: [[0, 0, 1, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
        { idx: 7, cells: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]] }
      ];
      var TOL = 0.02;
      function eq(a, b) { return Math.abs(a - b) <= TOL; }
      function rectEq(r, c) { return r && eq(r.x, c[0]) && eq(r.y, c[1]) && eq(r.w, c[2]) && eq(r.h, c[3]); }
      for (var pi = 0; pi < PRESETS.length; pi++) {
        var P = PRESETS[pi];
        if (P.cells.length !== slots.length) continue;
        var order = [], used = {}, ok = true;
        for (var ci = 0; ci < P.cells.length; ci++) {
          var found = -1;
          for (var sj = 0; sj < slots.length; sj++) { if (!used[sj] && rectEq(slots[sj].rect, P.cells[ci])) { found = sj; break; } }
          if (found < 0) { ok = false; break; }
          used[found] = 1; order.push(found);
        }
        if (ok) return { idx: P.idx, order: order };
      }
      return null;
    }
    function _wsLayoutEditState() {
      try {
        var c = CARDS()[0];
        var L = c && c.layout; if (!L || !Array.isArray(L.photoSlots) || !L.photoSlots.length) return null;
        var slots = L.photoSlots;
        var assign = _cardAssign(c) || {};
        var m = _matchItdPreset(slots);
        if (m && L.kind === 'before_after' && m.idx === 1) m.idx = 7;   // 전후면 좌우(v2) 대신 BEFORE/AFTER(ba)
        if (m) {
          var urls = [], crop = [];
          m.order.forEach(function (si) {
            var sl = slots[si], ph = assign[sl.id];
            urls.push((ph && (ph.editedDataUrl || _cleanBase(ph) || photoUrl(ph))) || '');
            crop.push({ s: Math.max(1, Math.min(4, sl.zoom || 1)), tx: 0, ty: 0 });   // zoom만 이식(focal은 편집기서 재조정)
          });
          if (urls.every(function (u) { return !u; })) return null;
          return { mode: 'collage', photos: urls, editState: {
            v: 1, layoutIdx: m.idx, layoutOrder: urls.map(function (_u, i) { return i; }),
            cellCrop: crop, fitMode: 'cover', ratio: (L.ratio || '4:5') } };
        }
        if (D().templateOutput) return { mode: 'composite', photoUrl: D().templateOutput };
        return null;
      } catch (_e) { return null; }
    }

    // 후기/가격 레이아웃에 실제 텍스트 자동채움(모델은 안 건드리고 클론에 주입). compose 직전에만 호출.
    function _fillLayoutText(layout) {
      if (!layout || !Array.isArray(layout.layers)) return layout;
      var kind = layout.kind;
      var layers = layout.layers.map(function (L) { return Object.assign({}, L); });
      // [다양성 팩] 시술명 분해 → 헤드라인/자막바/부제 자동 채움(review/price 외 kind 도 텍스트 살아있게).
      var parts = {};
      try { parts = (window.WSCaptionText && window.WSCaptionText.splitServiceForLayers) ? window.WSCaptionText.splitServiceForLayers(D().service || '') : {}; } catch (_e0) { parts = {}; }
      var svcTitle = (parts && parts.title) || String(D().service || '').split(/[\n,·]/)[0].trim();
      layers.forEach(function (L) {
        if (L.role === 'headline' || L.role === 'caption_bar') { if (svcTitle) L.text = svcTitle; }
        else if (L.role === 'sub2') { if (parts && parts.sub) L.text = parts.sub; }
      });
      if (kind === 'review') {
        layers.forEach(function (L) {
          if (L.role === 'title') { L.text = D().customerName ? (D().customerName + '님 후기') : (L.text || '고객 후기'); }
          else if (L.role === 'body') {
            var t = String(D().caption || D().service || '').replace(/\s+/g, ' ').trim();
            if (t) L.text = t.length > 120 ? (t.slice(0, 120) + '…') : t;   // layout-model 이 자동 줄바꿈+축소로 맞춤
          }
        });
      } else if (kind === 'price') {
        var rows = null;
        try { rows = (window.ItdasyPriceMenu && window.ItdasyPriceMenu.shopMenu) ? window.ItdasyPriceMenu.shopMenu() : null; } catch (_e) { rows = null; }
        if (rows && rows.length) {
          // [좌우 메뉴 지원] panel 위치를 읽어 가격줄 배치 — 사진 절반+우측 메뉴/상단 사진+하단 표 둘 다 대응.
          var panel = layers.filter(function (L) { return L.role === 'panel'; })[0];
          var px = panel && panel.x ? panel.x : 0, pw = panel && panel.w ? panel.w : 1, py = panel && panel.y != null ? panel.y : 0.5;
          var rx = px + 0.04, rw = pw - 0.08, ry0 = py + 0.14;
          rows.slice(0, 7).forEach(function (row, i) {
            layers.push({ type: 'text', role: 'price_row', text: row, x: rx, y: ry0 + i * 0.058, w: rw,
              size: 0.03, weight: 600, color: '#4E5968', align: 'left', bg: null, shadow: false });
          });
        }
      }
      return Object.assign({}, layout, { layers: layers });
    }

    // [refactor S4] 레이아웃 화면 전용 클릭 핸들러 — 처리하면 true.
    function handleClick(t, a) {
      var dl = t.closest('[data-fl-dellayout]'); if (dl) { _wsDeleteMyLayout(dl.getAttribute('data-fl-dellayout')); return true; }
      var th = t.closest('[data-fl-thumb]');
      if (th) {                                   // 레이아웃 고르기 = 든다(다시 누르면 내려놓기)
        var id = th.getAttribute('data-fl-thumb');
        D()._wsHeld = (D()._wsHeld === id) ? null : id;
        _syncStates();
        var root = EL(), hintEl = root && root.querySelector('[data-fl-hint]');
        if (hintEl) {                             // 안내문만 갈아끼움 — 카드/썸네일은 클래스만 바뀌어 전환이 살아있다
          var HL = _held(), cards = CARDS();
          hintEl.innerHTML = HL
            ? '<span><strong>' + esc(HL.name) + '</strong> · ' + (cards.some(function (c) { return _canTake(c, HL); }) ? '넣을 사진을 누르세요' : '사진 ' + _slotsOf(HL) + '장짜리가 없어요') + '</span><button type="button" data-fl="releaselayout">그만두기</button>'
            : '<span>레이아웃을 고르고 → 넣을 사진을 누르세요</span>' + (D().wsLayout ? '<button type="button" data-fl="savelayout">이 레이아웃 저장</button>' : '');
        }
        if (D()._wsHeld) { var L2 = _held(); if (L2) toast(L2.name + ' · 사진 ' + _slotsOf(L2) + '장짜리에 넣을 수 있어요'); }
        else if (CUR() === 'layout') setScreen('layout', { push: false });   // 내려놓으면 스테이지(드래그) 복귀
        return true;
      }
      var cardTap = t.closest('[data-fl-cardtap]');
      if (cardTap) {
        if (!D()._wsHeld) return false;           // 안 들었으면 스테이지 드래그가 먹어야 한다 — 가로채지 않는다
        var ci = _cardIdx(cardTap.getAttribute('data-fl-cardtap'));
        if (ci >= 0) _applyHeld(ci);
        return true;
      }
      var jn = t.closest('[data-fl-join]'); if (jn) { if (!jn.hasAttribute('disabled')) _joinCards(parseInt(jn.getAttribute('data-fl-join'), 10)); return true; }
      var sp = t.closest('[data-fl-split]'); if (sp) { if (!sp.hasAttribute('disabled')) _splitCard(sp.getAttribute('data-fl-split')); return true; }
      var dot = t.closest('[data-fl-dot]'); if (dot) { _goCard(parseInt(dot.getAttribute('data-fl-dot'), 10)); return true; }
      var cnav = t.closest('[data-fl-cnav]'); if (cnav) { _goCard((D()._wsCur || 0) + parseInt(cnav.getAttribute('data-fl-cnav'), 10)); return true; }
      var lnav = t.closest('[data-fl-lnav]');
      if (lnav) {                                 // behavior 안 적으면 CSS scroll-behavior 를 따름 → 모션 줄이기 설정 존중
        var rail = EL() && EL().querySelector('[data-fl-thumbs]');
        if (rail) rail.scrollBy({ left: parseInt(lnav.getAttribute('data-fl-lnav'), 10) * Math.round(rail.clientWidth * 0.8) });
        return true;
      }
      var cat = t.closest('[data-fl-cat]');
      if (cat) { D()._wsCat = cat.getAttribute('data-fl-cat'); if (CUR() === 'layout') setScreen('layout', { push: false }); return true; }
      if (a === 'releaselayout') { D()._wsHeld = null; if (CUR() === 'layout') setScreen('layout', { push: false }); return true; }
      if (a === 'savelayout') { _wsSaveMyLayout(); return true; }
      if (a === 'skiplayout') {   // 레이아웃 없이 = 사진 그대로 낱장들로
        var d = D();
        d.wsCards = (editablePhotos() || []).map(function (p) { return { id: 'wsc-' + (++_seq), layout: null, photoIds: [p.id] }; });
        d._wsHeld = null; d._wsCur = 0; d.templateOutput = null; d.templateOutputs = []; d.previewUrl = null;
        _syncAlias(); setScreen('caption'); return true;
      }
      return false;
    }

    return {
      renderLayout: renderLayout, _wsSaveMyLayout: _wsSaveMyLayout, _wsDeleteMyLayout: _wsDeleteMyLayout,
      _wsMountStage: _wsMountStage, _wsLayoutEditState: _wsLayoutEditState, _fillLayoutText: _fillLayoutText,
      composeCards: composeCards, hasReviewCard: hasReviewCard, handleClick: handleClick
    };
  }
  window.WSFlowLayout = { create: create };
})();
