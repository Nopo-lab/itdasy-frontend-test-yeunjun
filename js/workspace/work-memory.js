/*
 * work-memory.js — 원장 작업 기억 (Work Memory) v1  [T-115 P1+P2]
 *
 * "원장 작업 기억" = 원장이 편집기에서 직접 만든 꾸밈(글씨 위치·크기·폰트·스티커·선·도형)을
 *   작업실 저장/인스타 발행 시점에 붙잡아 두고 다음 사진에 다시 쓰는 것.
 *
 * P1 = 붙잡기 + 이름짓기 + 설정에서 보기.
 * P2 = 다시 쓰기(★기본을 편집기에 주입) — 플래그 기본 OFF 라 켜기 전엔 기존 동작 그대로.
 *
 * ── 왜 ShopStyle 을 안 쓰나 (2026-07-14)
 *   ShopStyle.list() 는 이미 '내 레이아웃'(_wsMyLayout)과 '우리샵 스타일'(presetKey) 두 용도가 섞여 있어
 *   세 번째 용도를 얹으면 list() 쓰는 모든 곳이 필터 지옥이 된다. 게다가 ShopStyle.makeLayer 는
 *   텍스트 4개 role 전용 스키마라 스티커·선·도형이 안 들어간다. → 별도 키. CRUD 관용구는 shop-style.js 를 따름.
 *
 * ── 무엇을 담나
 *   ItdEditor._exportState() 가 주는 editState 에서 '이 사진 전용' 값(photos·photoDraw·adj·pz·cellCrop)을
 *   빼고 재사용 가능한 것(layers·ratio·layoutIdx·collage*)만 담는다.
 *   ※ 붓으로 그린 그림(photoDraw)은 벡터가 아니라 그 사진에 구워진 PNG 라 재사용 불가 → 일부러 버림.
 *
 * 저장소: localStorage
 *   - itdasy:work_memory:list    → 기억 배열(JSON, 최대 10)
 *   - itdasy:work_memory:default → 기본으로 쓸 기억 id
 *
 * 좌표계: editState 그대로 — 중심 기준 0..1 상대값(_serLayer 계약).
 */
(function () {
  'use strict';

  var K_LIST = 'itdasy:work_memory:list';
  var K_DEFAULT = 'itdasy:work_memory:default';
  var SCHEMA = 1;
  var MAX = 10;

  // itd-editor.js LAYOUTS 의 인덱스 → 사진 칸 수. (0 single · 7 ba(전/후))
  var LAY_N = [1, 2, 2, 3, 4, 3, 3, 2];
  var LAY_BA = 7, LAY_SINGLE = 0;

  // ── 저수준 저장 ───────────────────────────────────────────────
  function _read(key, fallback) {
    try { var v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
    catch (_e) { return fallback; }
  }
  function _writeRaw(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (_e) { return false; }
  }
  function _uid() {
    return (typeof window._uid === 'function') ? window._uid()
      : 'wm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function _now() { return Date.now(); }

  // 용량(quota) 방어 — 실패하면 안 쓰는 기억부터 버리고 최대 3번 재시도. 기본 지정은 안 버림.
  function _persist(arr) {
    for (var i = 0; i < 3; i++) {
      if (_writeRaw(K_LIST, arr)) return true;
      var victim = _evictable(arr);
      if (!victim) return false;
      arr.splice(arr.indexOf(victim), 1);
    }
    return _writeRaw(K_LIST, arr);
  }

  // ── 컬렉션 CRUD ───────────────────────────────────────────────
  function list() {
    var arr = _read(K_LIST, null);
    return Array.isArray(arr) ? arr.filter(function (r) { return r && r.id; }) : [];
  }
  function get(id) {
    var arr = list();
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }
  function getDefaultId() { return _read(K_DEFAULT, null); }
  function getDefault() { var id = getDefaultId(); return (id && get(id)) || null; }
  function setDefault(id) {
    if (!get(id)) return false;
    _writeRaw(K_DEFAULT, id);
    return true;
  }
  function clearDefault() { _writeRaw(K_DEFAULT, null); return true; }

  function rename(id, name) {
    var arr = list();
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === id) { arr[i].name = String(name || '').trim() || arr[i].name; _persist(arr); return arr[i]; }
    }
    return null;
  }
  function remove(id) {
    var arr = list().filter(function (r) { return r.id !== id; });
    _persist(arr);
    if (getDefaultId() === id) _writeRaw(K_DEFAULT, null);
    return true;
  }

  // 밀어낼 후보 = 기본 지정 아닌 것 중 가장 오래 안 쓴 것. 전부 기본이면(=1개뿐) null.
  function _evictable(arr) {
    var def = getDefaultId();
    var cands = arr.filter(function (r) { return r.id !== def; });
    if (!cands.length) return null;
    return cands.slice().sort(function (a, b) {
      return (a.lastUsedAt || a.createdAt || 0) - (b.lastUsedAt || b.createdAt || 0);
    })[0];
  }

  // ── 이름짓기 (로컬 규칙 · 서버/AI 안 씀) ───────────────────────
  //   [무엇을] 시술명 + [어떤 틀에] 레이아웃 + [어떻게] 글씨 배치
  function _structureWord(layoutIdx) {
    if (layoutIdx === LAY_BA) return '전후비교';
    if (layoutIdx == null || layoutIdx === LAY_SINGLE) return '한 장';
    var n = LAY_N[layoutIdx] || 2;
    return '콜라주 ' + n + '장';
  }
  function _featureWord(layers) {
    var texts = layers.filter(function (l) { return l.type === 'text' || l.type === 'badge'; });
    if (!texts.length) {
      var deco = layers.filter(function (l) { return l.type === 'sticker'; }).length;
      return deco ? '스티커만' : '';
    }
    var big = texts.slice().sort(function (a, b) { return (b.size || 0) - (a.size || 0); })[0];
    var avgY = texts.reduce(function (s, l) { return s + (l.y || 0); }, 0) / texts.length;
    var pos = avgY > 0.6 ? '아래' : (avgY < 0.35 ? '위' : '가운데');
    var align = big.align === 'center' ? '가운데' : (big.align === 'right' ? '오른쪽' : '왼쪽');
    // 큰 제목이 가운데면 그 자체가 특징 — '가운데 큰 제목'
    if ((big.size || 0) >= 0.07 && big.align === 'center') return '가운데 큰 제목';
    return '글씨 ' + pos + ' ' + align + '정렬';
  }
  function _makeName(state, service, taken) {
    var subject = String(service || '').split(',')[0].trim().slice(0, 10);
    var head = [subject, _structureWord(state.layoutIdx)].filter(Boolean).join(' ');
    var feat = _featureWord(state.layers || []);
    var base = head + (feat ? ', ' + feat : '');
    var name = base, n = 2;
    while (taken.indexOf(name) >= 0) { name = base + ' (' + (n++) + ')'; }
    return name;
  }

  // 표시용 칩 — '전후 · 글씨 2 · 밑줄 1 · 스티커 1'
  function describe(rec) {
    var L = (rec && rec.layers) || [];
    var out = [_structureWord(rec && rec.layoutIdx)];
    function n(t) { return L.filter(function (l) { return l.type === t; }).length; }
    var textN = n('text') + n('badge');
    if (textN) out.push('글씨 ' + textN);
    if (n('line')) out.push('밑줄 ' + n('line'));
    if (n('rect')) out.push('도형 ' + n('rect'));
    if (n('sticker')) out.push('스티커 ' + n('sticker'));
    if (n('image')) out.push('로고 ' + n('image'));
    return out.join(' · ');
  }
  function formatWhen(rec) {
    var t = rec && (rec.lastUsedAt || rec.createdAt); if (!t) return '';
    var days = Math.floor((_now() - t) / 86400000);
    var when = days <= 0 ? '오늘' : (days === 1 ? '어제' : (days < 7 ? days + '일 전' : (days < 14 ? '지난주' : days + '일 전')));
    var used = rec.useCount > 1 ? ' · ' + rec.useCount + '번 씀' : '';
    return when + used;
  }

  // ── 붙잡기 ────────────────────────────────────────────────────
  // editState 에서 '이 사진 전용' 값 제거 → 재사용 가능한 것만.
  function _distill(st) {
    if (!st || !Array.isArray(st.layers) || !st.layers.length) return null;
    return {
      ratio: st.ratio || '4:5',
      layoutIdx: st.layoutIdx == null ? 0 : st.layoutIdx,
      layoutOrder: (st.layoutOrder || []).slice(),
      collageBg: st.collageBg || null,
      collageGap: st.collageGap == null ? null : st.collageGap,
      fitMode: st.fitMode || null,
      layers: st.layers.map(function (l) { return Object.assign({}, l); })
      // 일부러 뺌: photos·photoDraw(구운 붓그림)·photoBg·adj·pz·cellCrop·collageBgImg — 전부 그 사진 전용.
    };
  }
  // 같은 작업인지 — 레이아웃 + 레이어 배치 지문. 비슷한 글만 바꿔 연달아 발행해도 10칸이 안 찬다.
  function _sig(state) {
    var ls = (state.layers || []).map(function (l) {
      return [l.type, l.role || '', Math.round((l.x || 0) * 20), Math.round((l.y || 0) * 20),
        Math.round((l.size || 0) * 100), l.align || ''].join(':');
    }).sort();
    return state.layoutIdx + '|' + state.ratio + '|' + ls.join(',');
  }

  // 슬롯에서 편집 결과를 찾아 기억으로. 이미 같은 작업이 있으면 새로 안 만들고 '또 썼다'고만 기록.
  //   호출: 작업실 저장 / 인스타 발행 성공 시. 실패해도 절대 안 던짐(호출부는 발행 흐름).
  function captureFromSlot(slot, d) {
    try {
      var st = _pickState(slot);
      var state = _distill(st);
      if (!state) return null;   // 원장이 만든 꾸밈이 없음 → 기억할 게 없음

      var arr = list(), sig = _sig(state);
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].sig === sig) {   // 같은 작업 재사용 → 카운트만
          arr[i].lastUsedAt = _now(); arr[i].useCount = (arr[i].useCount || 1) + 1;
          _persist(arr);
          return arr[i];
        }
      }
      var rec = Object.assign({
        id: _uid(), schema: SCHEMA, sig: sig,
        name: _makeName(state, (d && d.service) || (slot && slot.service), arr.map(function (r) { return r.name; })),
        createdAt: _now(), lastUsedAt: _now(), useCount: 1, thumb: null
      }, state);

      arr.push(rec);
      while (arr.length > MAX) {   // 꽉 참 → 가장 오래 안 쓴 것부터(기본 지정은 보호)
        var victim = _evictable(arr.filter(function (r) { return r.id !== rec.id; }));
        if (!victim) break;
        arr.splice(arr.indexOf(victim), 1);
      }
      if (!_persist(arr)) return null;
      if (arr.length === 1) _writeRaw(K_DEFAULT, rec.id);   // 첫 기억은 자동으로 기본
      _makeThumb(slot, rec.id);   // 비동기 — 썸네일은 늦게 붙어도 됨
      return rec;
    } catch (_e) { return null; }
  }

  // 슬롯 사진들 중 실제 꾸밈이 있는 editState 를 고른다(대표 우선).
  function _pickState(slot) {
    var ps = (slot && slot.photos) || [];
    for (var i = 0; i < ps.length; i++) {
      var st = ps[i] && ps[i].editState;
      if (st && st.v && Array.isArray(st.layers) && st.layers.length) return st;
    }
    return null;
  }

  // 설정 화면용 작은 썸네일 — 발행 결과 이미지를 96px 로 줄여 저장(장당 ~3KB).
  //   다른 기기 이미지(http)는 canvas taint 로 실패할 수 있음 → 조용히 포기(썸네일 없이 표시).
  function _makeThumb(slot, id) {
    try {
      var src = (slot && (slot.templateOutput ||
        ((slot.photos || []).map(function (p) { return p.editedDataUrl || p.dataUrl; }).filter(Boolean)[0]))) || null;
      if (!src) return;
      var img = new Image();
      img.onload = function () {
        try {
          var W = 96, H = Math.max(1, Math.round(W * (img.height / img.width)));
          var c = document.createElement('canvas'); c.width = W; c.height = H;
          c.getContext('2d').drawImage(img, 0, 0, W, H);
          var url = c.toDataURL('image/jpeg', 0.7);
          var arr = list();
          for (var i = 0; i < arr.length; i++) if (arr[i].id === id) { arr[i].thumb = url; _persist(arr); break; }
        } catch (_e) { void _e; }   // taint 등 → 썸네일 없이 진행
      };
      img.onerror = function () { void 0; };
      if (!/^data:/.test(src)) img.crossOrigin = 'anonymous';
      img.src = src;
    } catch (_e) { void _e; }
  }

  // 기억됐다고 알리는 인라인 카드 — 팝업 아님. 3.5초 뒤 스스로 사라짐. 탭하면 설정으로.
  function showCaptureCard(rec) {
    try {
      if (!rec) return;
      var old = document.getElementById('wmCaptureCard'); if (old && old.parentNode) old.parentNode.removeChild(old);
      var el = document.createElement('div');
      el.id = 'wmCaptureCard'; el.className = 'wm-cap';
      el.innerHTML =
        '<div class="wm-cap__th">' + (rec.thumb ? '<img src="' + rec.thumb + '" alt="">' : '') + '</div>' +
        '<div class="wm-cap__c">' +
          '<div class="wm-cap__k"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="#ic-layers"/></svg>이 작업을 기억했어요</div>' +
          '<div class="wm-cap__n"></div>' +
          '<div class="wm-cap__m"></div>' +
        '</div>';
      el.querySelector('.wm-cap__n').textContent = rec.name || '';
      el.querySelector('.wm-cap__m').textContent = describe(rec) + ' · 기억 ' + list().length + '/' + MAX;
      el.addEventListener('click', function () {
        _dismiss(el);
        try { if (window.WorkspaceSettings && window.WorkspaceSettings.open) window.WorkspaceSettings.open(); } catch (_e) { void _e; }
      });
      document.body.appendChild(el);
      // [버그수정] rAF 로 is-on 을 붙이면 탭이 안 그려지는 상황(백그라운드·저전력)에선 콜백이 안 와서
      //   카드가 opacity:0 인 채로 안 보인다. 강제 리플로우로 시작 상태를 확정한 뒤 붙이면 rAF 없이도 전환된다.
      void el.offsetWidth;
      el.classList.add('is-on');
      setTimeout(function () { _dismiss(el); }, 3500);
    } catch (_e) { void _e; }
  }
  function _dismiss(el) {
    if (!el || !el.parentNode) return;
    el.classList.remove('is-on');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
  }

  // 붙잡기 + 알림 한 번에 — 호출부(flow)가 이 한 줄만 쓰게.
  function captureAndNotify(slot, d) {
    var rec = captureFromSlot(slot, d);
    if (rec) showCaptureCard(rec);
    return rec;
  }

  // ── [P2] 다시 쓰기 — ★기본 기억을 편집기에 올리기 ──────────────
  // 플래그: 기본 OFF. ?wsmem=1 로 미리보기 · ?wsmem=0 로 강제 해제 · window.ITDASY_WORK_MEMORY=true 로 전역 ON.
  function _flagOn() {
    try {
      if (/[?&]wsmem=1/.test(location.search)) return true;
      if (/[?&]wsmem=0/.test(location.search)) return false;
      return window.ITDASY_WORK_MEMORY === true;
    } catch (_e) { return false; }
  }
  function markUsed(id) {
    var arr = list();
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === id) { arr[i].lastUsedAt = _now(); arr[i].useCount = (arr[i].useCount || 1) + 1; _persist(arr); return arr[i]; }
    }
    return null;
  }

  // 기억 → 편집기 editState. '어떻게 생겼나'만 주고 '이 사진 전용'은 안 준다.
  //   opts.incoming    = 이번 글의 우리샵 자동배치 레이어(role→text) — 같은 role 은 이번 글 문구로 갈아끼움.
  //                      (지난 글 문구가 그대로 되살아나면 안 됨. 위치·크기·폰트만 기억하는 게 요점.)
  //   opts.photoCount  = 지금 사진 수. 기억의 레이아웃과 안 맞으면 레이아웃은 안 건드림
  //                      (예: '전후 2칸' 기억을 사진 1장에 씌우면 빈 칸이 생김).
  function toEditState(rec, opts) {
    if (!rec || !Array.isArray(rec.layers) || !rec.layers.length) return null;
    opts = opts || {};
    var incoming = opts.incoming || [];
    var byRole = {};
    incoming.forEach(function (l) { if (l && l.role && l.text && !byRole[l.role]) byRole[l.role] = l.text; });

    var layers = rec.layers.map(function (l) {
      if ((l.type === 'text' || l.type === 'badge') && l.role && byRole[l.role]) {
        return Object.assign({}, l, { text: byRole[l.role] });   // 자리는 기억대로, 글자는 이번 글로
      }
      return Object.assign({}, l);
    });

    var st = { v: 1, layers: layers, layoutOrder: (rec.layoutOrder || []).slice(), cellCrop: [] };
    if (rec.fitMode) st.fitMode = rec.fitMode;
    if (rec.collageBg) st.collageBg = rec.collageBg;
    if (rec.collageGap != null) st.collageGap = rec.collageGap;
    // 사진 수가 맞을 때만 레이아웃 복원. 안 맞으면 레이어(글씨·꾸밈)만 얹는다.
    var n = opts.photoCount;
    if (rec.layoutIdx != null && (n == null || (LAY_N[rec.layoutIdx] || 1) === n)) st.layoutIdx = rec.layoutIdx;
    // photos·photoDraw·adj·pz 는 일부러 안 넣음 — 넣으면 지금 사진을 지난 사진으로 덮어쓴다(itd-editor _restoreState:1648).
    return st;
  }

  // flow 가 쓰는 한 줄짜리 진입점 — 플래그 OFF·기본 없음이면 null(=지금까지와 100% 동일하게 깨끗이 열림).
  function defaultEditState(opts) {
    try {
      if (!_flagOn()) return null;
      var rec = getDefault(); if (!rec) return null;
      var st = toEditState(rec, opts); if (!st) return null;
      markUsed(rec.id);
      return st;
    } catch (_e) { return null; }
  }

  window.WorkMemory = {
    SCHEMA: SCHEMA, MAX: MAX,
    KEYS: { list: K_LIST, def: K_DEFAULT },
    list: list, get: get,
    getDefault: getDefault, getDefaultId: getDefaultId, setDefault: setDefault, clearDefault: clearDefault,
    rename: rename, remove: remove,
    describe: describe, formatWhen: formatWhen,
    captureFromSlot: captureFromSlot, captureAndNotify: captureAndNotify, showCaptureCard: showCaptureCard,
    markUsed: markUsed, toEditState: toEditState, defaultEditState: defaultEditState, flagOn: _flagOn,
    _distill: _distill, _makeName: _makeName, _sig: _sig   // 테스트용
  };
})();
