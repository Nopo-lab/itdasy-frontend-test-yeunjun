/* ig-style-library.js — '내 스타일' 라이브러리. 서버 CRUD + **기존 ShopStyle 로 잇는 다리**.
 * [2026-09-04]
 *
 * [두 번째 스타일 시스템을 만들지 않는다]
 *   이 앱엔 이미 `window.ShopStyle`(우리샵 스타일)이 있다 — 이름·텍스트 레이어 좌표·폰트·색·
 *   로고·워터마크를 갖고, `workspace-v2-flow._buildShopStyleLayers()` 가 그걸 읽어
 *   **실제로 편집기에 레이어를 올린다.** 작업 저장·복원도 그 레일 위에서 이미 돈다.
 *
 *   그래서 여기서 새 '스타일 적용 엔진' 을 만들면 같은 일을 하는 코드가 두 벌이 되고,
 *   언젠가 어긋난다. 이 파일이 하는 일은 딱 둘이다:
 *     ① 인스타 분석에서 나온 그룹을 서버에 보관·수정한다
 *     ② 그룹을 **ShopStyle 한 개로 번역**해서 기존 레일에 태운다
 *
 * [적용은 출발점이지 잠금이 아니다 — §18]
 *   번역 결과는 평범한 ShopStyle 레이어다. 원장이 편집기에서 자유롭게 고칠 수 있고,
 *   고친 결과는 기존 `_learnShopStyle` 이 하던 대로 학습된다. 아무것도 잠그지 않는다.
 *
 * [픽셀을 베끼지 않는다 — §19]
 *   원본 인스타 사진의 픽셀은 손대지 않는다. 옮기는 건 **좌표(0..1 상대)·비율·색·정렬**뿐이라
 *   새 사진의 비율이 달라도 그대로 맞는다.
 *
 * [이번 작업에만 적용 — §22]
 *   `ShopStyle.setActive()` 로 바꾸면 그건 '앞으로 모든 새 글' 의 기본이 된다.
 *   원장이 이번 게시물에 한 번 써본 스타일이 다음 글까지 따라오면 안 된다.
 *   그래서 선택은 **작업(slot) 단위**로 따로 기록하고, 기록이 없으면 기존 기본값으로 간다.
 *
 * 공개: window.IgStyleLibrary
 *   .list() / .refresh()          → Promise<groups[]>
 *   .cached()                     → groups[]        (동기)
 *   .saveAuto(groups)             → Promise<groups[]>   자동 그룹 저장(재계산 멱등)
 *   .create({name, media_ids, …}) → Promise<group>
 *   .rename(id, name) / .setPosts(id, ids) / .setCover(id, mediaId) / .remove(id)
 *   .apply(groupId, workId)       → Promise<shopStyleId>   이번 작업에 적용
 *   .styleForWork(workId)         → ShopStyle|null         (동기, flow 가 부른다)
 *   .clearWork(workId)
 *   .toShopStylePatch(group)      → ShopStyle 부분 스키마   (순수 — 테스트가 이걸 본다)
 */
(function () {
  'use strict';
  if (window.IgStyleLibrary) return;

  var LS_CACHE = 'itdasy:ig_style_groups::';    // 서버 응답 캐시(오프라인에서도 목록이 보이게)
  var LS_PICK = 'itdasy:ig_style_pick::';       // 작업별 선택 {workId: shopStyleId}

  function _tenant() {
    try {
      var v = localStorage.getItem('last_user_id');
      return (v == null || v === '' || v === 'null') ? null : String(v);
    } catch (_e) { void _e; return null; }
  }
  function _k(prefix) { var t = _tenant(); return t ? (prefix + t) : null; }

  function _read(key, fb) {
    var k = _k(key); if (!k) return fb;
    try { var v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); }
    catch (_e) { void _e; return fb; }
  }
  function _write(key, val) {
    var k = _k(key); if (!k) return false;
    try { localStorage.setItem(k, JSON.stringify(val)); return true; }
    catch (_e) { void _e; return false; }
  }

  function _auth() {
    try { return (typeof window.authHeader === 'function') ? window.authHeader() : {}; }
    catch (_e) { void _e; return {}; }
  }
  function _json() { return Object.assign({ 'Content-Type': 'application/json' }, _auth()); }

  /* 서버 호출. 실패는 **던진다** — 목록 읽기와 달리 쓰기는 조용히 실패하면 안 된다
     (원장은 저장됐다고 믿는데 안 저장돼 있는 상태가 가장 나쁘다). */
  function _req(path, opts) {
    if (!window.apiFetch) return Promise.reject(new Error('offline'));
    return window.apiFetch(path, opts).then(function (r) {
      if (!r) throw new Error('no_response');
      if (r.status === 409) return r.json().catch(function () { return {}; })
        .then(function (j) { var e = new Error('duplicate'); e.code = 409; e.detail = j.detail; throw e; });
      if (!r.ok) return r.json().catch(function () { return {}; })
        .then(function (j) { var e = new Error('http_' + r.status); e.code = r.status; e.detail = j.detail; throw e; });
      return r.json();
    });
  }

  // ── 목록 ──────────────────────────────────────────────────────────
  function cached() { var a = _read(LS_CACHE, []); return Array.isArray(a) ? a : []; }

  function refresh() {
    return _req('/instagram-style/groups', { headers: _auth() }).then(function (j) {
      var gs = (j && j.groups) || [];
      _write(LS_CACHE, gs);
      return gs;
    });
  }
  /* 화면용 — 서버가 안 되면 캐시로 보여준다. "안 보임" 보다 "조금 옛것" 이 낫다. */
  function list() {
    return refresh().catch(function () { return cached(); });
  }

  // ── 쓰기 ──────────────────────────────────────────────────────────
  function _afterWrite(g) {
    var arr = cached().filter(function (x) { return x && x.id !== g.id; });
    arr.unshift(g);
    _write(LS_CACHE, arr);
    return g;
  }

  function create(body) {
    return _req('/instagram-style/groups', {
      method: 'POST', headers: _json(), body: JSON.stringify(body)
    }).then(_afterWrite);
  }

  function patch(id, body) {
    return _req('/instagram-style/groups/' + encodeURIComponent(id), {
      method: 'PATCH', headers: _json(), body: JSON.stringify(body)
    }).then(_afterWrite);
  }

  function rename(id, name) { return patch(id, { name: String(name || '').trim() }); }
  function setPosts(id, mediaIds) { return patch(id, { media_ids: mediaIds || [] }); }
  function setCover(id, mediaId) { return patch(id, { cover_media_id: mediaId || '' }); }

  function remove(id) {
    return _req('/instagram-style/groups/' + encodeURIComponent(id), {
      method: 'DELETE', headers: _auth()
    }).then(function (j) {
      _write(LS_CACHE, cached().filter(function (x) { return x && x.id !== id; }));
      return j;
    });
  }

  /* 자동 그룹 저장 — `auto_key` 가 있어서 몇 번을 돌려도 그룹은 안 늘어난다(§37/§38).
     한 건이 실패해도 나머지는 저장한다. 전부-또는-전무는 여기서 得이 없다. */
  function saveAuto(groups) {
    var list_ = (groups || []).filter(function (g) { return g && g.auto_key && g.name; });
    if (!list_.length) return Promise.resolve([]);
    var out = [];
    return list_.reduce(function (pr, g) {
      return pr.then(function () {
        return create({
          name: g.name, origin: 'auto', auto_key: g.auto_key,
          media_ids: g.media_ids || [], profile: g.profile || null,
          cover_media_id: g.cover_media_id || null, confidence: g.confidence
        }).then(function (saved) { out.push(saved); })
          .catch(function () { /* 이 그룹만 건너뛴다 */ });
      });
    }, Promise.resolve()).then(function () { return out; });
  }

  // ══════════════════════════════════════════════════════════════════
  //  그룹 → ShopStyle 번역
  // ══════════════════════════════════════════════════════════════════

  /* 폰트 계열 → 편집기 폰트 키.
     🔑 `shop-baseline.js` 는 이 매핑을 **일부러 안 한다** — "'serif' 를 어떤 세리프로 고를지는
        우리가 정할 문제가 아니다" 는 이유였고, 그건 **자동 개인화** 맥락에서 옳다.
        여기는 다르다: 원장이 "이 스타일 적용" 을 **직접 눌렀다.** 시작점을 하나 골라주는 게
        맞고, 마음에 안 들면 편집기에서 바로 바꾸면 된다(잠그지 않는다).
        계열을 모르면 손대지 않는다(null → 편집기 기본값). */
  var FONT_BY_CLASS = {
    serif: 'serif',            // 'Noto Serif KR'
    handwriting: 'pen',        // 'Nanum Pen Script'
    script: 'pen',
    sans: 'pretendard',
    'sans-serif': 'pretendard',
    display: 'black'           // 'Black Han Sans'
  };

  /* 9분할 위치 → ShopStyle 좌표(좌상단 기준 0..1).
     ShopStyle 레이어는 x/y 가 **좌상단**이고 w 가 폭이다(_buildShopStyleLayers 가
     중앙 기준으로 변환해서 편집기에 넘긴다 — 여기선 ShopStyle 규약을 따른다). */
  function _zone(position) {
    var p = String(position || '').toLowerCase();
    var vert = p.indexOf('upper') === 0 ? 'upper' : (p.indexOf('lower') === 0 ? 'lower' : 'center');
    var horiz = /right$/.test(p) ? 'right' : (/left$/.test(p) ? 'left' : 'center');
    // 세로: 제목이 놓일 기준선. 부제·본문·해시태그는 이 아래로 흐른다.
    var y = vert === 'upper' ? 0.12 : (vert === 'lower' ? 0.62 : 0.42);
    var x = horiz === 'right' ? 0.42 : (horiz === 'left' ? 0.08 : 0.08);
    var w = horiz === 'center' ? 0.84 : 0.50;
    return { x: x, y: y, w: w, vert: vert, horiz: horiz };
  }

  /* 사진 비율 → ShopStyle frame.ratio. PhotoContext 의 aspect 는 **가로/세로**다.
     인스타에서 실제로 쓰는 셋만 고른다 — 없는 비율을 만들어내지 않는다. */
  function _ratio(aspect) {
    if (typeof aspect !== 'number' || !isFinite(aspect)) return null;
    var cands = [['1:1', 1], ['4:5', 0.8], ['3:4', 0.75], ['9:16', 0.5625]];
    var best = null, bestD = Infinity;
    cands.forEach(function (c) {
      var d = Math.abs(aspect - c[1]);
      if (d < bestD) { bestD = d; best = c[0]; }
    });
    return bestD <= 0.12 ? best : null;    // 어느 것과도 안 맞으면 손대지 않는다
  }

  function _hex(c) {
    var v = String(c || '').trim();
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? v : null;
  }

  /* group → ShopStyle 부분 스키마. **순수 함수** — 저장도 안 하고 전역도 안 읽는다(테스트가 이걸 본다).
     근거 없는 축은 **비운다.** 기본값으로 채우면 그게 거짓말이 되고, 원장은 매번 되돌려야 한다. */
  function toShopStylePatch(group) {
    var prof = (group && group.profile) || {};
    var t = prof.text || {};
    var v = prof.visual || {};
    var SS = window.ShopStyle;
    if (!SS || !SS.makeLayer) return null;

    var z = _zone(t.position);
    var size = (typeof t.sizeRatio === 'number' && isFinite(t.sizeRatio))
      ? Math.min(0.16, Math.max(0.03, t.sizeRatio)) : null;
    var align = ({ left: 'left', center: 'center', right: 'right' })[String(t.alignment || '').toLowerCase()] || null;
    var fontKey = FONT_BY_CLASS[String(t.fontClass || '').toLowerCase()] || null;
    /* 글자색: 관찰된 **글자색**이 우선. palette[0] 은 '사진에 많이 보이는 색' 이지
       '이 원장이 글자에 쓰는 색' 이 아니다(shop-baseline 이 같은 순서를 쓴다). */
    var color = _hex(t.color) || null;
    var weight = ({ bold: 800, medium: 600, regular: 400 })[String(t.fontWeight || '').toLowerCase()] || null;

    function layer(role, over) {
      var base = { y: over.y, w: z.w, x: z.x };
      if (align) base.align = align;
      if (color) base.color = color;
      /* 🔑 필드명은 **`font`** 이고 값은 편집기 FONTS 의 **key** 다.
         itd-editor 는 `fontByKey(spec.font)` 로 읽는다(itd-editor.js:1025) —
         'Pretendard' 같은 family 문자열을 넣으면 조용히 null → FONTS[0] 으로 떨어진다.
         (ShopStyle.makeLayer 의 기본값 'Pretendard' 가 지금 그 상태다) */
      if (fontKey) base.font = fontKey;
      if (weight != null) base.weight = weight;
      if (over.size != null) base.size = over.size;
      return SS.makeLayer(role, base);
    }

    // 제목 기준 크기. 근거가 없으면 ShopStyle 기본값을 그대로 둔다(over.size 를 안 준다).
    var tSize = size;
    var layers = [
      layer('title', { y: z.y, size: tSize }),
      layer('sub', { y: z.y + (tSize ? tSize * 1.5 : 0.105), size: tSize ? tSize * 0.65 : null }),
      layer('body', { y: z.y + (tSize ? tSize * 2.6 : 0.20), size: tSize ? tSize * 0.45 : null }),
      layer('hashtag', { y: z.vert === 'lower' ? 0.94 : 0.90, size: tSize ? tSize * 0.36 : null })
    ];

    /* 글자를 거의 안 넣는 원장이면 자동 텍스트를 꺼둔 채로 시작한다.
       "AI 니까 뭐라도 얹어야 한다" 가 이 제품에서 가장 위험한 태도다 — 매번 지우게 만든다. */
    if (typeof t.usageRate === 'number' && t.usageRate < 0.3) {
      layers = layers.map(function (L) {
        return (L.role === 'body' || L.role === 'hashtag') ? Object.assign({}, L, { enabled: false }) : L;
      });
    }

    var patch_ = {
      layers: layers,
      /* 🔑 원장이 "이 스타일로" 를 직접 눌렀다 = 명시 확정. 이게 false 면
         `_buildShopStyleLayers` 의 opt-in 게이트에 걸려 **아무것도 안 박힌다**
         (그러면 '적용했는데 화면이 그대로' 가 된다 — 이 앱에서 이미 겪은 종류다). */
      confirmed: true,
      igStyleGroupId: (group && group.id) || null,      // 되추적용. ShopStyle 스키마엔 없던 필드지만 보존된다
      igArchetype: (group && group.archetype) || null
    };
    var ratio = _ratio(v.aspect);
    if (ratio) patch_.frame = { ratio: ratio, pad: 0.06 };
    return patch_;
  }

  /* 그룹 하나에 대응하는 ShopStyle 을 보장한다. 이미 있으면 **덮어쓰지 않는다** —
     원장이 편집기에서 그 스타일을 다듬었을 수 있고, 그걸 재적용이 되돌리면 안 된다. */
  function ensureShopStyle(group) {
    var SS = window.ShopStyle;
    if (!SS || !SS.create) return null;
    if (group && group.shop_style_id) {
      var exist = SS.get(group.shop_style_id);
      if (exist) return exist;
    }
    var p = toShopStylePatch(group);
    if (!p) return null;
    /* 이름 충돌 회피 — ShopStyle 목록엔 원장이 만든 스타일도 섞여 있다.
       같은 이름이 이미 있으면 그걸 재사용한다(중복 생성 금지). */
    var name = (group && group.name) || '내 스타일';
    var same = (SS.list() || []).filter(function (s) { return s && s.igStyleGroupId === group.id; })[0];
    if (same) return same;

    /* 🔴 `makeActive=false` 만으로는 부족하다 — 실측으로 잡은 구멍이다.
       `ShopStyle.create` 는 **목록이 비어 있으면 무조건 active 로 만든다**
       (`if (makeActive || arr.length === 1)`). 게다가 `getActive()` 는 active 가 없으면
       `list()[0]` 으로 폴백한다. 즉 우리샵 스타일을 한 번도 안 만든 원장이 인스타 스타일을
       한 번 적용하면 **그게 앞으로 모든 새 글의 기본값**이 된다 — §22 가 막으려던 바로 그것.
       (유닛테스트는 스타일을 미리 하나 만들어 두고 검사해서 이걸 못 봤다)

       그래서 먼저 기본 시드를 보장한다. 시드가 list()[0]·active 를 차지하므로
       인스타 스타일은 '고른 작업에서만' 쓰이는 두 번째 스타일로 남는다.
       (`ensureSeed` 는 캡션 화면이 이미 부르는 기존 함수다 — 새 개념을 만들지 않는다) */
    var prevActive = SS.getActiveId ? SS.getActiveId() : null;
    if (!(SS.list() || []).length && SS.ensureSeed) {
      try { SS.ensureSeed(); } catch (_se) { void _se; }
    }
    var created = SS.create(Object.assign({ name: name }, p), false);
    // 그래도 active 가 바뀌었으면 되돌린다(create 의 첫-항목 규칙 방어).
    try {
      if (created && SS.getActiveId && SS.getActiveId() === created.id && SS.setActive) {
        var back = prevActive || ((SS.list() || []).filter(function (x) {
          return x && x.id !== created.id;
        })[0] || {}).id;
        if (back) SS.setActive(back);
      }
    } catch (_ae) { void _ae; }
    if (created && group && group.id) {
      // 서버에도 연결을 남긴다(다른 기기에서 다시 만들지 않게). 실패해도 로컬 동작엔 지장 없다.
      patch(group.id, { shop_style_id: created.id }).catch(function () {});
    }
    return created;
  }

  // ── 작업별 선택 (§21/§22) ─────────────────────────────────────────
  function _picks() { var o = _read(LS_PICK, {}); return (o && typeof o === 'object') ? o : {}; }

  /* 이번 작업에 스타일을 건다. 전역 기본값(`ShopStyle.setActive`)은 **건드리지 않는다** —
     이번 게시물에 써본 스타일이 다음 글까지 따라오면 안 된다. */
  /* `window.ShopStyle` 은 photo 그룹에서 **지연 로드**된다. 원장이 설정 화면에서
     바로 '이 스타일로' 를 누르면 아직 안 실려 있을 수 있다 —
     그때 조용히 실패하면 "눌렀는데 아무 일도 안 남" 이 된다. 먼저 보장한다. */
  function _ensureShopStyleModule() {
    if (window.ShopStyle) return Promise.resolve(true);
    try {
      if (window.AppLoader && window.AppLoader.ensure) {
        return Promise.resolve(window.AppLoader.ensure('photo'))
          .then(function () { return !!window.ShopStyle; })
          .catch(function () { return false; });
      }
    } catch (_e) { void _e; }
    return Promise.resolve(false);
  }

  function apply(groupId, workId) {
    var g = cached().filter(function (x) { return x && x.id === groupId; })[0];
    var p = g ? Promise.resolve(g) : refresh().then(function (gs) {
      return gs.filter(function (x) { return x && x.id === groupId; })[0];
    });
    return p.then(function (grp) {
      if (!grp) throw new Error('not_found');
      return _ensureShopStyleModule().then(function () { return grp; });
    }).then(function (grp) {
      var ss = ensureShopStyle(grp);
      if (!ss) throw new Error('shopstyle_unavailable');
      if (workId) {
        var picks = _picks();
        picks[String(workId)] = ss.id;
        _write(LS_PICK, picks);
      }
      // 사용 횟수 — 실패해도 적용은 이미 끝났다. 통계 때문에 기능을 막지 않는다.
      _req('/instagram-style/groups/' + encodeURIComponent(groupId) + '/used',
        { method: 'POST', headers: _auth() }).catch(function () {});
      return ss.id;
    });
  }

  /* flow 가 편집기를 열 때 부른다. 이 작업에 고른 게 없으면 null → 기존 기본값으로 간다. */
  function styleForWork(workId) {
    if (!workId) return null;
    var id = _picks()[String(workId)];
    if (!id) return null;
    try { return (window.ShopStyle && window.ShopStyle.get) ? window.ShopStyle.get(id) : null; }
    catch (_e) { void _e; return null; }
  }

  function clearWork(workId) {
    if (!workId) return;
    var picks = _picks();
    delete picks[String(workId)];
    _write(LS_PICK, picks);
  }

  function clear() {
    ['itdasy:ig_style_groups::', 'itdasy:ig_style_pick::'].forEach(function (pre) {
      var k = _k(pre); if (k) { try { localStorage.removeItem(k); } catch (_e) { void _e; } }
    });
  }

  window.IgStyleLibrary = {
    list: list, refresh: refresh, cached: cached,
    create: create, patch: patch, rename: rename, setPosts: setPosts,
    setCover: setCover, remove: remove, saveAuto: saveAuto,
    apply: apply, styleForWork: styleForWork, clearWork: clearWork, clear: clear,
    ensureShopStyle: ensureShopStyle, toShopStylePatch: toShopStylePatch,
    // 테스트·디버그용
    _zone: _zone, _ratio: _ratio, FONT_BY_CLASS: FONT_BY_CLASS
  };
})();
