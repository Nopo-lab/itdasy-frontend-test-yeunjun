/* workspace/flow/layout.js — 레이아웃 고르기 화면 (구성 3종 재설계, 2026-07-15)
   [배경] 예전엔 "사진 장수와 슬롯 수가 딱 맞는 레이아웃"을 골라 끼우는 방식이라
     5~6장이면 카드 캐러셀에 사진이 숨고, 4컷 레이아웃은 "사진 4장짜리가 없어요"로 거절됐다.
   [새 설계] 장수 n에 맞춰 늘어나는 구성 3종만 제공 (기획/33_작업실_개편_목업_v1.html ③·④ 승인):
     - n=1 : 구성 없음 — "사진 확인" 화면(그대로 1장, 안내만).
     - n=2 : 그대로 2장 · 한 장으로 합치기(좌우) · 한 장으로 합치기(상하).
     - n>=3: 그대로 n장 · 표지 크게+모아보기(1번 단독 + 나머지 2~4장씩 콜라주) · 전·후 합치기(1·2번 콜라주 + 나머지 그대로).
   상태: d.wsComp(구성 키) → d.wsCards = [{ id, layout(클론|null), photoIds }] 로 전개.
     카드 1개 = 올라갈 이미지 1장 = templateOutputs 1개 — 뒤 단계(캡션·발행) 소비 형태는 기존 그대로.
     d.wsLayout / d._wsAssign 은 '첫 카드' 별칭 유지 — 편집기 브리지·발행 kind 등 기존 소비처 무변경.
   flow.js 상태는 context 주입으로 접근: D()=현재 d, CUR()=현재 화면, EL()=루트 엘리먼트.
   window.WSFlowLayout.create(ctx) → 화면 함수 묶음 반환. flow.js 가 별칭으로 재수입. */
(function () {
  'use strict';
  function create(ctx) {
    var WSU = window.WSFlowUtil || {}, esc = WSU.esc, toast = WSU.toast;
    // [P0-1] 표시용 dataURL → blob URL (리렌더 재파싱 제거). 비-dataURL 은 그대로 통과.
    function disp(u) { return (window.WSBlobUrl && window.WSBlobUrl.disp) ? window.WSBlobUrl.disp(u) : u; }
    var setScreen = ctx.setScreen, editablePhotos = ctx.editablePhotos, photoUrl = ctx.photoUrl, _cleanBase = ctx.cleanBase;
    var reassignRoles = ctx.reassignRoles || function () {};
    function D() { return ctx.d(); }       // 현재 상태 객체(open 마다 새로 할당되므로 접근자)
    function CUR() { return ctx.cur(); }   // 현재 화면 이름
    function EL() { return ctx.el(); }     // 플로우 루트 엘리먼트

    var _seq = 0;                          // 카드 id 시퀀스
    var RATIO = { '1:1': 1, '4:5': 0.8, '9:16': 0.5625, '3:4': 0.75 };
    function _arOf(L) { return L ? (RATIO[L.ratio] || 0.8) : 0.8; }
    function _layoutById(id) { var WL = window.WorkspaceLayout; return (WL && WL.getById) ? WL.getById(id) : null; }   // getById 는 클론 — 카드끼리 focal 안 섞임
    function _photoById(id) { return (editablePhotos() || []).filter(function (p) { return String(p.id) === String(id); })[0]; }
    function _cardPhotos(c) { return (c.photoIds || []).map(_photoById).filter(Boolean); }
    function _cardAssign(c) {
      var WL = window.WorkspaceLayout;
      if (!c.layout || !WL) return null;
      return WL.autoAssign(_cardPhotos(c), c.layout);   // 역할(before/after) 우선 → 슬롯 순서 안 뒤집힘
    }

    // ── 구성 3종 — 장수 n별 선택지 ─────────────────────────
    function _compOptions(n) {
      if (n <= 1) return [];
      if (n === 2) return [
        { key: 'flat', name: '그대로 2장', desc: '인스타에서 한 장씩 넘겨보기' },
        { key: 'ba', name: '전·후 합치기', desc: '전·후를 한 장으로 — BEFORE/AFTER 표시' },
        { key: 'merge-lr', name: '한 장으로 합치기 · 좌우', desc: '두 장을 나란히 붙여 한 장으로' },
        { key: 'merge-tb', name: '한 장으로 합치기 · 상하', desc: '두 장을 위아래로 붙여 한 장으로' }
      ];
      var list = [
        { key: 'flat', name: '그대로 ' + n + '장', desc: '인스타에서 한 장씩 넘겨보기' },
        { key: 'cover', name: '표지 크게 + 모아보기', desc: '1번 사진 크게, 나머지 ' + (n - 1) + '장 모아서' }
      ];
      /* [#3 2026-07-18] '모두 한 장에' — 3·4장을 한 컷 콜라주로. 원장 요청("나머지 3장도 레이아웃, 딸깍딸깍 몇 개 더").
         3장=나란히(strip-3)·2x2(grid-4 는 4장 전용). 4장=2×2(grid-4). 5장 이상은 한 프리셋에 안 맞아 cover 로. */
      if (n === 3) {
        list.push({ key: 'grid', name: '3장 한 컷에 · 나란히', desc: '세 장을 가로로 한 장에 모아' });
        list.push({ key: 'grid2', name: '3장 한 컷에 · 크게+2', desc: '1번 크게, 2·3번을 옆에 모아' });
      } else if (n === 4) {
        list.push({ key: 'grid', name: '4장 한 컷에 · 2×2', desc: '네 장을 바둑판으로 한 장에' });
      }
      list.push({ key: 'ba', name: '전·후 합치기', desc: '1·2번을 한 장으로, 나머지 ' + (n - 2) + '장은 그대로' });
      return list;
    }
    function _curComp() {
      var d = D(), n = (editablePhotos() || []).length;
      return _compOptions(n).some(function (o) { return o.key === d.wsComp; }) ? d.wsComp : 'flat';
    }
    // 모아보기 묶음 크기 → 콜라주 재료 (2=좌우, 3=3분할, 4=2×2)
    function _gridIdFor(k) { return k === 2 ? 'wsl-collage-2' : (k === 3 ? 'wsl-strip-3' : 'wsl-grid-4'); }
    function _card(layoutId, ids) { return { id: 'wsc-' + (++_seq), layout: layoutId ? _layoutById(layoutId) : null, photoIds: ids.slice() }; }
    // 구성 → 카드 배열. 카드 1개 = 올라갈 이미지 1장(레이아웃 없으면 사진 그대로).
    function _buildCards(comp) {
      var eps = editablePhotos() || [], n = eps.length;
      function flat() { return eps.map(function (p) { return _card(null, [p.id]); }); }
      if (!n) return [];
      if (n === 1) return flat();
      if (n === 2 && (comp === 'merge-lr' || comp === 'merge-tb'))
        return [_card(comp === 'merge-tb' ? 'wsl-collage-2-tb' : 'wsl-collage-2', [eps[0].id, eps[1].id])];
      // [#3 2026-07-18] '모두 한 컷에' — 3장·4장을 한 프리셋 콜라주 카드 1개로.
      if (n === 3 && comp === 'grid') return [_card('wsl-strip-3', eps.map(function (p) { return p.id; }))];
      if (n === 3 && comp === 'grid2') return [_card('wsl-cover-1l2', eps.map(function (p) { return p.id; }))];
      if (n === 4 && comp === 'grid') return [_card('wsl-grid-4', eps.map(function (p) { return p.id; }))];
      if (n >= 3 && comp === 'cover') {
        // 1번 단독 + 나머지는 2×2씩(4장). 5장 남으면 3+2 로 나눠 외톨이 1장이 안 생기게.
        var cards = [_card(null, [eps[0].id])], rest = eps.slice(1), i = 0;
        while (i < rest.length) {
          var rem = rest.length - i, take = rem === 5 ? 3 : Math.min(4, rem);
          var chunk = rest.slice(i, i + take);
          if (chunk.length === 1) cards.push(_card(null, [chunk[0].id]));
          else cards.push(_card(_gridIdFor(chunk.length), chunk.map(function (p) { return p.id; })));
          i += take;
        }
        return cards;
      }
      if (n >= 2 && comp === 'ba') {
        // [v779] reassignRoles/_precomputeBAHints(EXIF·밝기)·수동지정으로 이미 정해진 전/후를 존중한다.
        //   예전엔 무조건 eps[0]=before 로 덮어써서, '후' 사진을 먼저 올리면 전/후 뱃지가 뒤집혔다.
        var _bef = eps.filter(function (p) { return p.role === 'before'; })[0];
        var _aft = eps.filter(function (p) { return p.role === 'after'; })[0];
        if (!_bef || !_aft || _bef === _aft) { _bef = eps[0]; _aft = eps[1]; }   // 불명확하면 업로드 순서
        _bef.role = 'before'; _aft.role = 'after';
        var _u = {}; _u[_bef.id] = 1; _u[_aft.id] = 1;
        var out = [_card('wsl-ba-lr', [_bef.id, _aft.id])];
        eps.forEach(function (p) { if (!_u[p.id]) out.push(_card(null, [p.id])); });
        return out;
      }
      return flat();
    }

    // 사진 목록·구성이 바뀌었을 때만 카드 재전개 — 같은 상태면 유지(슬롯 드래그로 맞춘 focal/zoom 보존).
    function _sig() { var d = D(); return (d.wsComp || '') + '|' + (editablePhotos() || []).map(function (p) { return p.id; }).join(','); }
    function _ensureCards() {
      var d = D(), n = (editablePhotos() || []).length;
      if (d.wsComp && !_compOptions(n).some(function (o) { return o.key === d.wsComp; })) d.wsComp = null;   // 장수가 바뀌어 안 맞는 구성이면 '그대로'
      var sig = _sig();
      if (d._wsSig !== sig || !Array.isArray(d.wsCards) || (!d.wsCards.length && n)) {
        d.wsCards = _buildCards(_curComp());
        d._wsSig = sig;
      }
      _syncAlias();
    }
    // 첫 카드를 wsLayout/_wsAssign 에 비춰 둔다 — 편집기 브리지·발행 kind 등 기존 소비처가 그대로 동작하게.
    function _syncAlias() {
      var d = D(), c = (d.wsCards || [])[0];
      d.wsLayout = c ? c.layout : null;
      d._wsAssign = c ? _cardAssign(c) : null;
    }
    function CARDS() { _ensureCards(); return D().wsCards; }

    // ── 카드 → 결과물. 카드 1개 = templateOutputs 1개(레이아웃 없으면 사진 그대로).
    //    전후 콜라주 카드는 before/afterPhotoId 까지 채워 기존 소비처(짝별 수정·성과 귀속)와 결이 맞게 둔다.
    function composeCards() {
      var d = D(), WL = window.WorkspaceLayout;
      _ensureCards();
      var cards = d.wsCards || [];
      if (!WL || !cards.length) return Promise.resolve(null);
      var _compAtStart = d.wsComp;   // [v779 카오스QA] 굽는 도중 구성 변경 감지용
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
        var _meta = {};
        return Promise.resolve(WL.composeLayout(_fillLayoutText(c.layout), ps, map, _meta)).then(function (url) {
          return url ? { pairId: c.id, templateId: c.layout.id, beforePhotoId: bId, afterPhotoId: aId,
            // [2026-07-24] 이 출력이 실제로 구워진 비율(콜라주 STARTER 는 대개 '1:1').
            //   캡션 자동합성(_autoComposeTemplate)이 작업기억 꾸밈을 얹을 때 이 비율로 굽지 않으면,
            //   1:1 콜라주가 4:5 스테이지에 contain 레터박스돼 꾸밈이 콜라주 실제 영역과 어긋났다(원장 지적).
            outputUrl: url, ratio: (c.layout.ratio || null), pairLabel: (i + 1) + '번째', photoIds: c.photoIds.slice(), missing: _meta.missing || 0 } : null;
        }).catch(function () { return null; });
      })).then(function (list) {
        // [v779 카오스QA·P1] 굽는 도중 세션 교체/구성 변경(다른 옵션 탭)됐으면 이 낡은 결과로 덮어쓰지 않는다.
        //   예전엔 무조건 덮어써서, 화면은 새 구성인데 발행은 방금 버린 구성이 조용히 올라갔다.
        if (D() !== d || d.wsComp !== _compAtStart) return null;
        var outs = list.filter(Boolean);
        if (!outs.length) { toast('레이아웃을 굽지 못했어요 — 사진 그대로 진행할게요'); return null; }
        d.templateOutputs = outs;
        d.templateOutput = outs[0].outputUrl;
        d.templateOutputId = outs[0].templateId;
        d.activeDisplayId = null;
        d.previewUrl = null;
        if (outs.length < cards.length) toast((cards.length - outs.length) + '장은 못 만들어서 뺐어요');
        // [v779] 일부 칸을 못 불러와 회색으로 구워진 경우(다기기 CORS·손상 이미지) 무경고 발행 방지.
        var _miss = 0; outs.forEach(function (o) { _miss += (o && o.missing) || 0; });
        if (_miss) toast('사진 ' + _miss + '칸을 못 불러와 회색으로 나왔어요 — 사진을 다시 확인해 주세요');
        return outs;
      });
    }
    // 후기 레이아웃(내 레이아웃 경유)은 캡션 확정 뒤 본문을 채운다 → 캡션 단계에서 다시 굽는다.
    function hasReviewCard() { return (CARDS() || []).some(function (c) { return c.layout && c.layout.kind === 'review'; }); }

    // ── 렌더 ─────────────────────────────────────────────
    function _prevInner(c) {
      var L = c.layout, ps = _cardPhotos(c);
      if (!L) { var p0 = ps[0]; return '<i class="wsl-ph" style="left:0;top:0;width:100%;height:100%;background-image:url(' + esc(disp(p0 ? photoUrl(p0) : '')) + ')"></i>'; }
      var map = _cardAssign(c) || {};
      return (L.photoSlots || []).map(function (sl) {
        var p = map[sl.id], r = sl.rect;
        return '<i class="wsl-ph" style="left:' + (r.x * 100) + '%;top:' + (r.y * 100) + '%;width:' + (r.w * 100) + '%;height:' + (r.h * 100) + '%;' +
          (p ? 'background-image:url(' + esc(disp(photoUrl(p))) + ');' : '') + '"></i>';
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
    // 구성 카드의 미니 다이어그램(목업 ③ .mini) — 사진 대신 칸 모양만.
    function _miniHtml(key, n) {
      if (key === 'flat') {
        var k = Math.min(n, 5), cells = '';
        for (var i = 0; i < k; i++) cells += '<i></i>';
        return '<span class="wsc-mini" style="grid-template-columns:repeat(' + k + ',1fr)" aria-hidden="true">' + cells + '</span>';
      }
      if (key === 'cover') return '<span class="wsc-mini wsc-mini--cover" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>';
      if (key === 'merge-tb') return '<span class="wsc-mini wsc-mini--2h" aria-hidden="true"><i></i><i></i></span>';
      // [#3 2026-07-18] 한 컷 콜라주 미니 — grid: 3장=가로 3분할·4장=2×2 / grid2: 크게+2
      if (key === 'grid') {
        if (n === 4) return '<span class="wsc-mini wsc-mini--g4" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
        return '<span class="wsc-mini" style="grid-template-columns:repeat(3,1fr)" aria-hidden="true"><i></i><i></i><i></i></span>';
      }
      if (key === 'grid2') return '<span class="wsc-mini wsc-mini--1l2" aria-hidden="true"><i></i><i></i><i></i></span>';
      return '<span class="wsc-mini wsc-mini--2v" aria-hidden="true"><i></i><i></i></span>';   // ba · merge-lr
    }

    /* [2026-09-03 사진 복구 P0] 레이아웃 화면에서 사진을 **뺄 수도 바꿀 수도** 없었다.
       실측(iPhone 375×812): 파일을 고르면 업로드 화면을 건너뛰고 바로 여기로 오는데
       상단 썸네일은 data-* 가 하나도 없는 장식이었고, 유일한 탈출구인 뒤로가기는
       navStack 이 비어 있어 **작업실을 통째로 닫아 사진 전부를 버렸다**(확인창도 없음).
       → 썸네일에 빼기(×) · 끝에 추가 타일 · '다시 고르기'(업로드 화면=선택/순서/역할)를 둔다.
       실수로 뺐을 때를 위해 방금 뺀 1장은 되돌릴 수 있게 d._lyUndo 에 담아둔다. */
    function _stripHtml(eps) {
      var d = D();
      var cells = eps.map(function (p, i) {
        return '<span class="wsc-sph" style="background-image:url(' + esc(disp(photoUrl(p))) + ')" role="img" aria-label="' + (i + 1) + '번째 사진"><i>' + (i + 1) + '</i>' +
          '<button type="button" class="wsc-sph__x" data-fl-lyrm="' + esc(String(p.id)) + '" data-haptic="light" aria-label="' + (i + 1) + '번째 사진 빼기">' +
            '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
          '</button></span>';
      }).join('');
      // 10장 상한(addFiles 와 동일) — 꽉 찼으면 추가 타일을 숨겨 눌러도 안 되는 버튼을 안 만든다.
      var add = eps.length >= 10 ? '' :
        '<button type="button" class="wsc-sph wsc-sph--add" data-fl-pick data-haptic="light" aria-label="사진 추가">' +
          '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>' +
        '</button>';
      var undo = (d._lyUndo && d._lyUndo.photo)
        ? '<div class="wsc-undo"><span>사진 1장을 뺐어요</span><button type="button" data-fl-lyundo data-haptic="light">되돌리기</button></div>'
        : '';
      return '<div class="wsc-strip">' + cells + add + '</div>' + undo;
    }
    function _stripSecHtml(eps) {
      return '<div><div class="wsc-sec">사진 ' + eps.length + '장 <span>탭해서 빼거나 더할 수 있어요</span>' +
          '<button type="button" class="wsc-repick" data-fl-lyredit data-haptic="light">다시 고르기</button></div>' +
        _stripHtml(eps) + '</div>';
    }

    function renderLayout() {
      _ensureCards();
      var eps = editablePhotos() || [], n = eps.length;
      if (!n) return '<div class="wsc-wrap"><p class="wsc-empty">사진이 없어요 — 이전 화면에서 사진을 추가해 주세요</p></div>';

      // ④ 사진 1장 — 구성 선택 없이 확인만 (타이틀은 _wsMountStage 에서 '사진 확인'으로)
      if (n === 1) {
        var p1 = eps[0];
        return '<div class="wsc-wrap">' +
          '<div class="wsc-one" style="background-image:url(' + esc(disp(photoUrl(p1))) + ')" role="img" aria-label="올릴 사진"></div>' +
          '<div class="wsc-onemsg">' +
            '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>' +
            // [2026-09-03] '사진 더하기는 이전 화면에서' 라고 써놨지만 **이전 화면으로 갈 방법이 없었다**(뒤로=플로우 종료).
            //   안내 대신 이 화면에서 바로 되는 컨트롤(아래 스트립)을 준다.
            '<div><b>사진이 1장이라 그대로 올라가요</b><span>레이아웃은 2장부터 — 아래에서 사진을 더하거나 바꿔요</span></div>' +
          '</div>' +
          _stripSecHtml(eps) +
        '</div>';
      }

      // ③ n장 — 번호 썸네일 전부 보이기 + 결과 미리보기 + 구성 2~3종
      var cards = CARDS(), comp = _curComp();
      var frames = cards.map(function (c, i) {
        return '<div class="wsc-frame" style="aspect-ratio:' + _arOf(c.layout) + '">' +
          _prevInner(c) +
          (c.layout ? '<div class="wsc-stagehost" data-fl-cardstage="' + esc(c.id) + '"></div>' : '') +
          '<span class="wsc-fn">' + (i + 1) + '</span>' +
        '</div>';
      }).join('');
      var opts = _compOptions(n).map(function (o) {
        var on = o.key === comp;
        return '<button type="button" class="wsc-opt' + (on ? ' on' : '') + '" data-fl-comp="' + o.key + '" data-haptic="light" aria-pressed="' + on + '">' +
          _miniHtml(o.key, n) +
          '<span class="wsc-opt-t"><b>' + esc(o.name) + '</b><span>' + esc(o.desc) + '</span></span>' +
        '</button>';
      }).join('');

      return '<div class="wsc-wrap">' +
        _stripSecHtml(eps) +
        '<div class="wsc-preview"><div class="wsc-frames">' + frames + '</div>' +
          '<p class="wsc-count">이대로 <b>' + cards.length + '장</b>이 올라가요</p></div>' +
        '<div><div class="wsc-sec">구성 <span>썸네일 눌러 골라요 · 한 컷에 모으거나 한 장씩</span></div>' +
          '<div class="wsc-opts">' + opts + '</div></div>' +
      '</div>';
    }

    // 콜라주 프레임엔 슬롯 스테이지(드래그로 위치·핀치로 확대). 사진 그대로 프레임엔 안 붙인다.
    function _wsMountStage() {
      var root = EL(); if (!root) return;
      var eps = editablePhotos() || [];
      // ④ 목업 — 사진 1장이면 타이틀을 '사진 확인'으로 (setScreen 이 TITLE 로 되돌려도 onEnter 가 다시 덮는다)
      if (eps.length === 1) { var tt = root.querySelector('[data-fl-title]'); if (tt) tt.textContent = '사진 확인'; }
      if (!window.WorkspaceSlotStage) return;
      var cards = CARDS();
      [].forEach.call(root.querySelectorAll('[data-fl-cardstage]'), function (host) {
        var id = host.getAttribute('data-fl-cardstage'), c = null;
        for (var i = 0; i < cards.length; i++) { if (cards[i].id === id) { c = cards[i]; break; } }
        if (!c || !c.layout) return;
        // mount 가 host.className/innerHTML 을 통째로 갈아치운다(→ '.wsl-stage') — 그래서 전용 안쪽 host 에만 붙인다.
        window.WorkspaceSlotStage.mount(host, {
          layout: c.layout, photos: _cardPhotos(c), assign: _cardAssign(c),
          onChange: function () { D().previewUrl = null; D().templateOutput = null; _syncAlias(); }   // 재조정 시 옛 합성본 무효화
        });
      });
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
        // [v779 보스] 레이아웃은 처음 고른 대로 고정 — 사진편집은 '합쳐진 1장'(합성본)을 편집한다.
        //   합성본이 있으면 그걸 단일 이미지로 연다 → 편집기/캡션전/캡션후 세 화면 통일(원장 지적 "다 달라").
        // [v779] 자동합성(시술명·작업기억 텍스트를 구움) 전 원판(_autoBase)이 있으면 그걸 연다(이중 굽기 방지).
        // [v779 4장버그] 모드 판정을 outputUrl() 과 동일하게 스칼라+배열 기준으로 통일 — 드래그·구성변경으로
        //   스칼라만 null 되도 배열에 합성본 있으면 composite 로.
        // [v779 재오픈] ★ 이 검사를 카드(세션 전용 wsCards) 검사보다 먼저 둔다 — 재오픈 초안은 wsCards 가
        //   복원 안 돼 아래 L 검사에서 null 나 원본 사진이 열리고 편집이 발행에 반영 안 되던 버그.
        var _o0 = (D().templateOutputs || [])[0];
        var _comp = D().templateOutput || (_o0 && _o0.outputUrl);
        if (_comp) {
          return { mode: 'composite', photoUrl: (_o0 && _o0._autoBase) || _comp };
        }
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

    // 후기/가격 레이아웃(내 레이아웃 경유)에 실제 텍스트 자동채움(모델은 안 건드리고 클론에 주입). compose 직전에만 호출.
    function _fillLayoutText(layout) {
      if (!layout || !Array.isArray(layout.layers)) return layout;
      var kind = layout.kind;
      var layers = layout.layers.map(function (L) { return Object.assign({}, L); });
      // 시술명 분해 → 헤드라인/자막바/부제 자동 채움(review/price 외 kind 도 텍스트 살아있게).
      var parts = {};
      try { parts = (window.WSCaptionText && window.WSCaptionText.splitServiceForLayers) ? window.WSCaptionText.splitServiceForLayers(D().service || '') : {}; } catch (_e0) { parts = {}; }
      // [P3 프라이버시 2026-07-16] parts.title 이 비면(모든 토큰이 사담/이모지로 걸러진 경우) 예전엔
      //   raw d.service 첫 줄을 그대로 넣어, '남친이랑 왔어요 김수현 고객님' 같은 사담·고객명이 공개
      //   이미지에 구워졌다. 폴백도 정제 파이프라인(publicServiceKeywords)을 태우고, 그마저 비면 빈값.
      var svcClean = '';
      try { svcClean = (window.WSCaptionText && window.WSCaptionText.publicServiceKeywords) ? window.WSCaptionText.publicServiceKeywords(D().service || '') : ''; } catch (_e1) { svcClean = ''; }
      var svcTitle = (parts && parts.title) || svcClean.split(/\s+/).slice(0, 4).join(' ').trim();
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
      void a;
      /* [2026-09-03 사진 복구 P0] 빼기 / 되돌리기 / 다시 고르기.
         인덱스가 아니라 **photo.id** 로 지운다 — 스트립은 editablePhotos()(선택된 것만) 순서라
         d.photos 인덱스와 다를 수 있고, 그 어긋남이 '엉뚱한 사진이 지워짐'의 고전적 원인이다. */
      var delBtn = t.closest('[data-fl-lyrm]');
      if (delBtn) {
        var d0 = D(), pid = delBtn.getAttribute('data-fl-lyrm');
        var idx = -1;
        for (var i = 0; i < (d0.photos || []).length; i++) { if (String(d0.photos[i].id) === String(pid)) { idx = i; break; } }
        if (idx < 0) return true;
        if ((editablePhotos() || []).length <= 1) { toast('마지막 사진은 뺄 수 없어요 \u2014 다른 사진을 먼저 추가해 주세요'); return true; }
        d0._lyUndo = { photo: d0.photos[idx], at: idx };
        d0.photos.splice(idx, 1);
        reassignRoles();
        // 사진이 바뀌면 이미 구운 결과물은 그 사진을 담고 있으니 무효화(안 하면 뺀 사진이 그대로 발행된다).
        d0.templateOutput = null; d0.templateOutputs = []; d0.templateOutputId = null; d0.activeDisplayId = null; d0.previewUrl = null;
        if (CUR() === 'layout') setScreen('layout', { push: false });
        return true;
      }
      if (t.closest('[data-fl-lyundo]')) {
        var d1 = D(), u = d1._lyUndo;
        if (u && u.photo) {
          d1.photos.splice(Math.min(u.at, d1.photos.length), 0, u.photo);
          d1._lyUndo = null;
          reassignRoles();
          d1.templateOutput = null; d1.templateOutputs = []; d1.templateOutputId = null; d1.activeDisplayId = null; d1.previewUrl = null;
          if (CUR() === 'layout') setScreen('layout', { push: false });
        }
        return true;
      }
      if (t.closest('[data-fl-lyredit]')) { setScreen('upload'); return true; }
      var op = t.closest('[data-fl-comp]');
      if (op) {
        var d = D(), key = op.getAttribute('data-fl-comp');
        if (_curComp() === key) return true;   // 같은 구성 다시 눌러도 재전개 안 함(focal 조정 보존)
        d.wsComp = key;
        d.wsCards = _buildCards(key); d._wsSig = _sig();
        d.templateOutput = null; d.templateOutputs = []; d.previewUrl = null;   // 구성이 바뀌면 옛 합성본 무효화
        _syncAlias();
        if (CUR() === 'layout') setScreen('layout', { push: false });
        return true;
      }
      return false;
    }

    /* [2026-07-22 보스] 잇비 채팅 안에서 레이아웃을 고르게 하려고 두 개를 밖으로 연다.
       화면(DOM) 없이도 "이 장수엔 어떤 구성이 있나"를 묻고, 고른 구성을 적용할 수 있어야 한다.
       ⚠️ 목록을 잇비 쪽에 복사해 두지 않는다 — 구성이 바뀔 때 두 곳이 어긋나면
          채팅엔 있는데 눌러도 안 먹는 유령 선택지가 생긴다. 항상 여기가 정본. */
    function compOptions(n) { return _compOptions(n); }
    function applyComp(key) {
      var d = D();
      if (!key || !_compOptions((editablePhotos() || []).length).some(function (o) { return o.key === key; })) return false;
      d.wsComp = key;
      d.wsCards = _buildCards(key); d._wsSig = _sig();
      d.templateOutput = null; d.templateOutputs = []; d.previewUrl = null;   // 구성이 바뀌면 옛 합성본 무효화
      _syncAlias();
      return true;
    }

    return {
      renderLayout: renderLayout, _wsMountStage: _wsMountStage,
      _wsLayoutEditState: _wsLayoutEditState, _fillLayoutText: _fillLayoutText,
      composeCards: composeCards, hasReviewCard: hasReviewCard, handleClick: handleClick,
      compOptions: compOptions, applyComp: applyComp
    };
  }
  window.WSFlowLayout = { create: create };
})();
