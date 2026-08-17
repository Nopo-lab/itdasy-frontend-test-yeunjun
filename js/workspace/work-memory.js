/*
 * work-memory.js — 원장 작업 기억 (Work Memory) v1  [T-115 P1+P2]
 *
 * "원장 작업 기억" = 원장이 편집기에서 직접 만든 꾸밈(글씨 위치·크기·폰트·스티커·선·도형)을
 *   작업실 저장/인스타 발행 시점에 붙잡아 두고 다음 사진에 다시 쓰는 것.
 *
 * P1 = 붙잡기 + 이름짓기 + 설정에서 보기.
 * P2 = 다시 쓰기(★기본을 편집기에 주입) — **플래그 기본 ON**(index.html:76). 롤백은 ?wsmem=0.
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
 *   - itdasy:work_memory:default → ★(원장이 명시 지정한 기본) 기억 id
 *
 * [T2 2026-08-17] 레코드 schema 2 — **평면 유지 + 필드 추가(additive)**:
 *   추가: photoCount(저장 시점 확정) · shopStyleId(T3 brandFit) ·
 *         applyCount/lastAppliedAt(편집기에 실제 얹힘) · publishCount/lastPublishedAt(저장/발행 완료)
 *   폐기(읽기 폴백만 유지): useCount·lastUsedAt — 캡션 결과 화면 헤드리스 굽기(markUsed)에서도 올라
 *     화면 왕복만으로 부풀던 값(T2' 원인). 발행 카운트로만 승계.
 *   왜 layout/deco 중첩이 아니라 평면인가: 중첩은 기존 소비자·테스트가 잠근 계약(rec.layers 등)을
 *     전부 깨는데 얻는 건 의미 구분뿐이다. 소유권 분리는 저장 모양이 아니라 쓰기 규칙이 지킨다 —
 *     칸 배치 필드는 캡처 시점에만 쓰고, 소비는 toEditState 의 layersOnly 게이트가 막는다(테스트로 잠김).
 *     additive 라 마이그레이션이 자명하게 멱등이고, 실패해도 원본 필드가 그대로다.
 *   schema 1 레코드는 list() 에서 lazy 승격(변경 있을 때만 1회 재저장). 구 필드는 지우지 않는다 —
 *     롤백(옛 코드)이 lastUsedAt/useCount 를 계속 읽을 수 있게(스테일이지만 동작).
 *
 * 좌표계: editState 그대로 — 중심 기준 0..1 상대값(_serLayer 계약).
 */
(function () {
  'use strict';

  var K_LIST = 'itdasy:work_memory:list';
  var K_DEFAULT = 'itdasy:work_memory:default';
  var SCHEMA = 2;
  var MAX = 10;

  // itd-editor.js LAYOUTS 의 인덱스 → 사진 칸 수. (0 single · 7 ba(전/후))
  //   [T2] 신규 캡처는 이 값을 layout.photoCount 로 저장 시점에 박는다 — 읽기는 저장값 우선(_photoCountOf).
  var LAY_N = [1, 2, 2, 3, 4, 3, 3, 2];
  var LAY_BA = 7, LAY_SINGLE = 0;

  // 사진 칸 수 — schema 2 는 저장값(photoCount), schema 1 폴백은 LAY_N 미러.
  function _photoCountOf(r) {
    return (r && r.photoCount != null) ? r.photoCount : (LAY_N[(r && r.layoutIdx) || 0] || 1);
  }
  // 최근 손댄 시각 — 밀어내기(eviction)·표시 공용. schema 1 은 lastUsedAt 폴백.
  function _lastTouch(r) { return (r && (r.lastPublishedAt || r.lastAppliedAt || r.lastUsedAt || r.createdAt)) || 0; }

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
    if (!Array.isArray(arr)) return [];
    var out = [], changed = false;
    arr.forEach(function (r) {
      if (!r || !r.id) return;
      var m = _migrate(r);
      if (m !== r) changed = true;
      out.push(m);
    });
    // 승격은 변경이 있을 때만 1회 재저장 — 이후엔 전부 schema 2 라 changed=false(매 호출 재저장은 quota 낭비).
    //   재저장이 실패해도(quota) 반환값은 승격본이고 원본은 그대로 남아 다음 read 가 재시도한다.
    if (changed) _writeRaw(K_LIST, out);
    return out;
  }
  /* [T2] schema 1 → 2 lazy 승격. 원장 로컬에 이미 쌓인 기억을 절대 잃지 않는 게 목표 —
     additive 라 원본 필드는 하나도 안 지운다(useCount·lastUsedAt 도 보존 → 롤백한 옛 코드가 계속 읽음).
     publishCount 는 옛 useCount 승계 — 캡션 재렌더(markUsed)로 부풀려진 값이지만
     T3 스코어가 min(publishCount,5) 캡으로 흡수한다. sig 는 색·폰트 포함 v2 로 재계산(신규 캡처와 dedup 일치). */
  function _migrate(r) {
    if (!r || (r.schema || 0) >= 2) return r;
    var m = Object.assign({}, r, {
      schema: 2,
      photoCount: _photoCountOf(r),
      shopStyleId: (r.shopStyleId === undefined ? null : r.shopStyleId),
      applyCount: r.applyCount || 0,
      lastAppliedAt: r.lastAppliedAt || 0,
      publishCount: r.publishCount || r.useCount || 1,
      lastPublishedAt: r.lastPublishedAt || r.lastUsedAt || r.createdAt || 0
    });
    m.sig = _sig(m);
    return m;
  }
  function get(id) {
    var arr = list();
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }
  function getDefaultId() { return _read(K_DEFAULT, null); }
  function getDefault() { var id = getDefaultId(); return (id && get(id)) || null; }
  // [T2] auto 게이트 — T3 자동 선택(select)의 ON/OFF. ★(:default, id 문자열)와 키·타입부터 분리.
  var K_AUTO = 'itdasy:work_memory:auto';
  function autoOn() { return _read(K_AUTO, true) !== false; }   // 기본 ON
  function setAutoOn(v) { _writeRaw(K_AUTO, v !== false); return autoOn(); }
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
    return cands.slice().sort(function (a, b) { return _lastTouch(a) - _lastTouch(b); })[0];
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
    var t = _lastTouch(rec); if (!t) return '';
    var days = Math.floor((_now() - t) / 86400000);
    var when = days <= 0 ? '오늘' : (days === 1 ? '어제' : (days < 7 ? days + '일 전' : (days < 14 ? '지난주' : days + '일 전')));
    var n = (rec && (rec.publishCount || rec.useCount)) || 1;   // [T2] 표시 기준 = 발행 횟수(구 레코드는 useCount 폴백)
    var used = n > 1 ? ' · ' + n + '번 씀' : '';
    return when + used;
  }

  // ── 붙잡기 ────────────────────────────────────────────────────
  // [용량] 이미지 레이어(로고)는 base64 라 통째로 담으면 기억 10개가 localStorage 를 밀어낸다.
  //   실측(2026-07-15): 로고 256px=76KB → 10개 0.79MB / 512px=285KB → 2.83MB / 1024px=1MB → 10.09MB(한도 ~6MB 초과).
  //   같은 로고가 10벌 복사되는 게 원인인데, 로고는 이미 ShopStyle.logo 에 한 벌 있다.
  //   → 바이트 대신 참조만 담고 쓸 때 ShopStyle 에서 꺼낸다. 자리·크기는 그대로 기억된다.
  var LOGO_REF = 'shopLogo';
  var INLINE_MAX = 8 * 1024;   // 이보다 작은 dataURL 은 그냥 담는다(참조할 곳도 없는 일회성 이미지)
  function _shopLogoUrl() {
    try {
      var ss = window.ShopStyle && window.ShopStyle.getActive && window.ShopStyle.getActive();
      return (ss && ss.logo && ss.logo.dataUrl) || null;
    } catch (_e) { return null; }
  }
  /* ── [T6] 에셋 참조화 — 8KB 초과 이미지(내 스티커 등)를 IDB 한 벌 + 참조로 ─────
     G2 수정: 예전엔 참조할 곳이 없다고 조용히 버려서(return null) 원장은 스티커가
     기억된 줄 아는데 다음 글엔 없었다. 이제 바이트는 itdasy-gallery v4 'assets' 에
     콘텐츠 해시 한 벌(기억 10개가 공유), 기억엔 assetRef 만.
     toEditState 는 동기라 IDB 를 직접 못 읽는다 → 로드 시 웜업한 메모리 캐시에서 꺼내고,
     캐시 미적재/자산 유실이면 그 레이어만 뺀다(깨진 이미지 방지 — 로고 srcRef 와 같은 규칙). */
  var ASSET_PREFIX = 'img:';
  var _assetCache = null;      // null = 미적재
  var _assetWarmState = 0;     // 0=대기 1=진행 중 2=완료
  function _assetHash(s) {     // djb2 — 콘텐츠 기반 결정적 id(같은 스티커 = 같은 자산)
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + '-' + s.length.toString(36);
  }
  function _assetWarm() {
    if (_assetWarmState === 1 || !window.loadAssetsFromDB) return;
    _assetWarmState = 1;
    try {
      window.loadAssetsFromDB().then(function (rows) {
        _assetCache = _assetCache || {};
        (rows || []).forEach(function (r) { if (r && r.id && r.dataUrl) _assetCache[r.id] = r.dataUrl; });
        _assetWarmState = 2;
      }).catch(function () { _assetWarmState = 0; });   // 실패 시 다음 요청 때 재시도
    } catch (_e) { _assetWarmState = 0; void _e; }
  }
  function _assetPut(id, dataUrl) {
    _assetCache = _assetCache || {}; _assetCache[id] = dataUrl;   // 같은 세션은 캐시로 즉시 사용 가능
    try { if (window.saveAssetToDB) window.saveAssetToDB({ id: id, dataUrl: dataUrl, createdAt: _now() }); } catch (_e) { void _e; }
  }
  function _assetGet(id) {
    if (_assetCache && _assetCache[id]) return _assetCache[id];
    // 웜업 완료 후의 miss = 그 뒤 IDB 에 추가된 자산일 수 있다(다른 탭/기기 동기화) → 재웜업 허용.
    //   미해소가 지속돼도 굽기 재시도당 getAll 1회 수준(자산 수 적음)이라 부담 없음.
    if (_assetWarmState === 2) _assetWarmState = 0;
    _assetWarm();   // 동기 경로라 이번엔 못 쓰고 다음 기회를 위한 적재만
    return null;
  }
  _assetWarm();     // photo 그룹 로드 직후 적재 시작 — 편집기 열릴 때쯤엔 준비됨

  // [T2] 캡처 당시 활성 우리샵 스타일 — T3 brandFit 스코어 근거.
  function _activeShopStyleId() {
    try { return (window.ShopStyle && window.ShopStyle.getActiveId && window.ShopStyle.getActiveId()) || null; }
    catch (_e) { return null; }
  }
  /* ── [T5] 텍스트북 — role 없는 문구의 전역 관측·정책 ──────────────────────
     왜 레코드별이 아니라 전역인가: "같은 문구를 서로 다른 게시물 3회" 는 게시물 단위의
     전역 사실이다. 레코드별로 세면 기억 3개에 1회씩 흩어져 영영 승격이 안 된다.
     identity = 정규화 문구(엔진 normalizeText) — index·memoryId 무관이라 순서변경·재적용에 안정.
     { "<norm>": { n: 서로 다른 게시물 관측 수, st: 'obs'|'static'|'dismissed', at } }

     [정책 계약 — T5 최종 확정 2026-08-17] dismissed 는 "이 문구를 **자동으로** 다시 얹지 않는다"의
     **전역·영구** 거부다(보스/GPT 합의):
       · 다른 기억·다른 서비스·다른 우리샵 스타일에서 같은 문구가 와도 막는다 — 문구 자체가 identity.
       · 자동 해제 없음 — 원장이 같은 문구를 손으로 다시 써서 발행해도 veto 는 남는다
         ("다시 썼다" ≠ "삭제 결정을 취소했다"). 해제 UI 는 출시 후 설정 화면 몫.
       · 이게 과하지 않은 이유: veto 가 막는 건 '기억에서 온 자동 얹기'뿐이고,
         원장이 손으로 쓰는 문구는 sanitize 대상이 아니라서 언제든 그냥 쓰면 된다. */
  var K_TEXTBOOK = 'itdasy:work_memory:textbook';
  var TB_MAX = 200;   // 상한 — 넘으면 관측(obs) 중 오래된 것부터 정리(static/dismissed 정책은 보존)
  function textbook() { var v = _read(K_TEXTBOOK, null); return (v && typeof v === 'object') ? v : {}; }
  function dismissText(norm) {
    if (!norm) return false;
    var tb = textbook();
    tb[norm] = Object.assign({ n: 0 }, tb[norm], { st: 'dismissed', at: _now() });
    _writeRaw(K_TEXTBOOK, tb);
    return true;
  }
  // 발행 캡처 1회 = 게시물 1개 관측. unknown 만 센다(dynamic 은 예외 없이 제거 대상, static 패턴은 이미 유지).
  //   같은 게시물 안의 중복 문구 = 1회. 3회 누적 시 obs → static 승격. dismissed 는 절대 안 건드림(veto).
  function _noteTexts(state) {
    try {
      var E = window.WorkMemoryEngine;
      if (!(E && E.classifyText && E.normalizeText)) return;   // 엔진 없으면 관측 스킵(보수적)
      var seen = {}, tb = textbook(), changed = false;
      (state.layers || []).forEach(function (l) {
        if (!l || l.role || !(l.type === 'text' || l.type === 'badge') || !l.text) return;
        if (E.classifyText(l.text) !== 'unknown') return;
        var norm = E.normalizeText(l.text);
        if (!norm || seen[norm]) return;
        seen[norm] = 1;
        var ent = tb[norm] || { n: 0, st: 'obs' };
        ent.n = (ent.n || 0) + 1; ent.at = _now();
        if (ent.st === 'obs' && ent.n >= 3) ent.st = 'static';
        tb[norm] = ent; changed = true;
      });
      if (changed) { _tbPrune(tb); _writeRaw(K_TEXTBOOK, tb); }
    } catch (_e) { void _e; }
  }
  function _tbPrune(tb) {
    var keys = Object.keys(tb);
    if (keys.length <= TB_MAX) return;
    keys.filter(function (k) { return tb[k] && tb[k].st === 'obs'; })
      .sort(function (a, b) { return (tb[a].at || 0) - (tb[b].at || 0); })
      .slice(0, keys.length - TB_MAX)
      .forEach(function (k) { delete tb[k]; });
  }

  // [T3] 게시물 성격 — 분류기는 엔진 소유(소프트 의존, 같은 로드그룹). 엔진이 없으면 unknown(보수적).
  function _kindOf(state, service) {
    try {
      var E = window.WorkMemoryEngine;
      if (!(E && E.classifyKind)) return 'unknown';
      var texts = (state.layers || []).map(function (l) { return l && l.text; }).filter(Boolean);
      return E.classifyKind(texts, service);
    } catch (_e) { return 'unknown'; }
  }
  function _shrinkLayer(l) {
    var c = Object.assign({}, l);
    if (c.type !== 'image' || typeof c.src !== 'string') return c;
    if (!/^data:/.test(c.src)) return c;                       // 에셋 경로 등 → 그대로(짧음)
    var logo = _shopLogoUrl();
    if (logo && c.src === logo) { delete c.src; c.srcRef = LOGO_REF; return c; }   // 우리샵 로고 → 참조로
    if (c.src.length > INLINE_MAX) {
      // [T6·G2] 예전엔 여기서 null(조용히 버림) — 원장은 스티커가 기억된 줄 알았다.
      //   이제 IDB 자산 한 벌 + 참조. IDB 저장이 실패해도 세션 캐시로 이번 세션은 동작.
      var ref = ASSET_PREFIX + _assetHash(c.src);
      _assetPut(ref, c.src);
      delete c.src; c.assetRef = ref;
      return c;
    }
    return c;
  }
  // editState 에서 '이 사진 전용' 값 제거 → 재사용 가능한 것만.
  function _distill(st) {
    if (!st || !Array.isArray(st.layers) || !st.layers.length) return null;
    var layers = st.layers.map(_shrinkLayer).filter(Boolean);
    if (!layers.length) return null;
    var li = st.layoutIdx == null ? 0 : st.layoutIdx;
    return {
      ratio: st.ratio || '4:5',
      layoutIdx: li,
      photoCount: LAY_N[li] || 1,   // [T2] 저장 시점 확정 — select(T3)가 하드코딩 미러 대신 이 값을 읽는다
      layoutOrder: (st.layoutOrder || []).slice(),
      collageBg: st.collageBg || null,
      collageGap: st.collageGap == null ? null : st.collageGap,
      fitMode: st.fitMode || null,
      layers: layers
      // 일부러 뺌: photos·photoDraw(구운 붓그림)·photoBg·adj·pz·cellCrop·collageBgImg — 전부 그 사진 전용.
    };
  }
  // 같은 작업인지 — 레이아웃 + 레이어 배치 지문. 비슷한 글만 바꿔 연달아 발행해도 10칸이 안 찬다.
  //   [T2·Q6 1차 2026-08-17] 색·폰트·굵기 포함 — 자리만 같고 색/폰트만 바꾼 작업이 '같은 작업'으로
  //   dedup 되어 새 스타일이 어디에도 저장되지 않던 것(G1). 학습이 아니라 '다른 작업으로 인식'이 1차.
  function _sig(state) {
    var ls = (state.layers || []).map(function (l) {
      return [l.type, l.role || '', Math.round((l.x || 0) * 20), Math.round((l.y || 0) * 20),
        Math.round((l.size || 0) * 100), l.align || '',
        l.color || '', l.font || '', (l.weight == null ? '' : l.weight)].join(':');
    }).sort();
    return state.layoutIdx + '|' + state.ratio + '|' + ls.join(',');
  }

  // 슬롯에서 편집 결과를 찾아 기억으로. 이미 같은 작업이 있으면 새로 안 만들고 '또 썼다'고만 기록.
  //   호출: 작업실 저장 / 인스타 발행 성공 시. 실패해도 절대 안 던짐(호출부는 발행 흐름).
  //   [T2] opts.publish:false = 발행이 아닌 캡처(성과 '이 스타일로 또') — dedup 시 카운트 안 올림(재클릭 중복 방지).
  function captureFromSlot(slot, d, opts) {
    try {
      var st = _pickState(slot);
      var state = _distill(st);
      if (!state) return null;   // 원장이 만든 꾸밈이 없음 → 기억할 게 없음

      var countPublish = !(opts && opts.publish === false);
      if (countPublish) _noteTexts(state);   // [T5] 게시물 1회 관측(3회 승격 재료) — 발행/저장일 때만
      var arr = list(), sig = _sig(state);
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].sig === sig) {   // 같은 작업 재사용 → 발행 카운트만
          if (countPublish) {
            arr[i].lastPublishedAt = _now(); arr[i].publishCount = (arr[i].publishCount || 1) + 1;
            // 롤백 호환 미러 — 옛 코드(useCount·lastUsedAt 소비)가 SW 캐시로 남은 탭을 위해 같이 올린다.
            arr[i].lastUsedAt = _now(); arr[i].useCount = (arr[i].useCount || 1) + 1;
            _persist(arr);
          }
          return arr[i];
        }
      }
      var rec = Object.assign({
        id: _uid(), schema: SCHEMA, sig: sig,
        name: _makeName(state, (d && d.service) || (slot && slot.service), arr.map(function (r) { return r.name; })),
        createdAt: _now(), thumb: null,
        shopStyleId: _activeShopStyleId(),
        kind: _kindOf(state, (d && d.service) || (slot && slot.service) || ''),   // [T3] select 의 kindFit 근거
        applyCount: 0, lastAppliedAt: 0,
        publishCount: 1, lastPublishedAt: _now()   // 캡처 = 저장/발행된 글에서 왔다 — publish:false 여도 사실
      }, state);

      arr.push(rec);
      while (arr.length > MAX) {   // 꽉 참 → 가장 오래 안 쓴 것부터(기본 지정은 보호)
        var victim = _evictable(arr.filter(function (r) { return r.id !== rec.id; }));
        if (!victim) break;
        arr.splice(arr.indexOf(victim), 1);
      }
      // [v779 카오스QA] 저장공간 꽉 참/사생활모드면 무음 소실 → 원장은 기억된 줄 안다. 실패를 알린다.
      if (!_persist(arr)) { try { if (window.showToast) window.showToast('저장 공간이 부족해 이 스타일을 기억하지 못했어요'); } catch (_te) { void _te; } return null; }
      if (arr.length === 1) _writeRaw(K_DEFAULT, rec.id);   // 첫 기억은 자동으로 기본
      _makeThumb(slot, rec.id);   // 비동기 — 썸네일은 늦게 붙어도 됨
      return rec;
    } catch (_e) { return null; }
  }

  // 슬롯 사진들 중 실제 꾸밈이 있는 editState 를 고른다 — 가장 공들인 장 우선.
  //   [T3·G3 2026-08-17] 예전엔 '첫 번째로 layers 있는 사진'이라(주석만 "대표 우선") 1번 장을
  //   대충 두고 2번 장을 공들인 경우 그 꾸밈이 통째로 버려졌다. 점수로 고르고 동점이면 앞 순서(기존 동작).
  function _photoScore(p, st) {
    var L = st.layers, s = 0;
    if (L.some(function (l) { return l && (l.type === 'text' || l.type === 'badge'); })) s += 2;
    if (L.some(function (l) { return l && l.type === 'sticker'; })) s += 1;
    if (L.some(function (l) { return l && l.type === 'image'; })) s += 1;
    if (L.length >= 2) s += 2;
    if (p && p.role === 'hero') s += 2;
    if (p && p.storyEdited) s += 2;
    return s;
  }
  function _pickState(slot) {
    var ps = (slot && slot.photos) || [];
    var best = null, bestScore = -1;
    for (var i = 0; i < ps.length; i++) {
      var st = ps[i] && ps[i].editState;
      if (!(st && st.v && Array.isArray(st.layers) && st.layers.length)) continue;
      var s = _photoScore(ps[i], st);
      if (s > bestScore) { bestScore = s; best = st; }
    }
    return best;
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
  // 플래그: **기본 ON** (index.html:76 이 `!== false` 로 켬). ?wsmem=0 로 강제 해제 · ?wsmem=1 로 강제 ON.
  //   (주석이 'OFF' 라고 하던 걸 실제와 맞춤 — 2026-07-17. 코드는 그대로였고 문서만 틀렸음.)
  function _flagOn() {
    try {
      if (/[?&]wsmem=1/.test(location.search)) return true;
      if (/[?&]wsmem=0/.test(location.search)) return false;
      return window.ITDASY_WORK_MEMORY === true;
    } catch (_e) { return false; }
  }
  // [T2'] 카운터 의미: applied = 편집기에 실제 얹힘 · published = 그 글이 저장/발행 완료.
  //   옛 markUsed 는 캡션 결과 화면 헤드리스 굽기에서도 불려 화면 왕복만으로 부풀었다 → 폐기.
  function _bump(id, patch) {
    var arr = list();
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === id) { Object.assign(arr[i], patch(arr[i])); _persist(arr); return arr[i]; }
    }
    return null;
  }
  function markApplied(id) {
    return _bump(id, function (r) { return { lastAppliedAt: _now(), applyCount: (r.applyCount || 0) + 1 }; });
  }
  function markPublished(id) {
    return _bump(id, function (r) { return { lastPublishedAt: _now(), publishCount: (r.publishCount || 0) + 1 }; });
  }

  // [T7 preflight] 직전 toEditState 에서 자산(assetRef) 미해소로 뺀 레이어 수 —
  //   발행물 굽기(헤드리스)는 이 값이 0이 아닐 때 이번 굽기를 보류한다('조용히 일부 빠진 발행' 금지).
  var _lastAssetMiss = 0;
  function assetMissCount() { return _lastAssetMiss; }

  // 기억 → 편집기 editState. '어떻게 생겼나'만 주고 '이 사진 전용'은 안 준다.
  //   opts.incoming    = 이번 글의 우리샵 자동배치 레이어(role→text) — 같은 role 은 이번 글 문구로 갈아끼움.
  //                      (지난 글 문구가 그대로 되살아나면 안 됨. 위치·크기·폰트만 기억하는 게 요점.)
  //   opts.photoCount  = 지금 사진 수. 기억의 레이아웃과 안 맞으면 레이아웃은 안 건드림
  //                      (예: '전후 2칸' 기억을 사진 1장에 씌우면 빈 칸이 생김).
  function toEditState(rec, opts) {
    _lastAssetMiss = 0;   // [T7] 이번 변환의 자산 미해소 카운트 리셋
    if (!rec || !Array.isArray(rec.layers) || !rec.layers.length) return null;
    opts = opts || {};
    var incoming = opts.incoming || [];
    var byRole = {};
    incoming.forEach(function (l) { if (l && l.role && l.text && !byRole[l.role]) byRole[l.role] = l.text; });

    var layers = rec.layers.map(function (l) {
      // 역할 텍스트(title/sub/시술문구 등)는 자리·스타일만 기억하고 글자는 이번 글로 교체한다.
      //   [v779] 이번 글에 그 역할 텍스트가 없으면 지난 글 문구를 남기지 말고 뺀다 —
      //   안 그러면 새 이미지에 지난 글 시술명("26인치 옴브레")이 남아 캡션과 불일치했다.
      //   (스티커/선/로고/역할없는 커스텀 텍스트는 아래로 내려가 그대로 유지됨.)
      if ((l.type === 'text' || l.type === 'badge') && l.role) {
        return byRole[l.role] ? Object.assign({}, l, { text: byRole[l.role] }) : null;
      }
      // [용량] 로고는 참조로만 담았다 → 쓸 때 ShopStyle 에서 실제 이미지를 꺼낸다.
      //   샵 로고를 지웠으면 되살릴 게 없으니 그 레이어는 뺀다(깨진 이미지 방지).
      if (l.srcRef === LOGO_REF) {
        var url = _shopLogoUrl(); if (!url) return null;
        var c = Object.assign({}, l, { src: url }); delete c.srcRef; return c;
      }
      // [T6] 스티커 등 큰 이미지는 IDB 자산 참조 → 캐시에서 복원. 미적재/유실이면 그 레이어만 뺀다
      //   (편집기 = 원장이 눈으로 보는 단계라 허용). [T7] 발행물 굽기는 assetMissCount 로 보류 판정.
      if (l.assetRef) {
        var au = _assetGet(l.assetRef); if (!au) { _lastAssetMiss++; return null; }
        var ac = Object.assign({}, l, { src: au }); delete ac.assetRef; return ac;
      }
      return Object.assign({}, l);
    }).filter(Boolean);
    if (!layers.length) return null;

    var st = { v: 1, layers: layers, layoutOrder: (rec.layoutOrder || []).slice(), cellCrop: [] };
    /* [2026-07-17] opts.layersOnly = 작업실 레이아웃이 이미 칸 배치를 정한 상태.
       이때 기억의 layoutIdx·collageBg·fitMode 까지 씌우면 원장이 방금 고른 레이아웃을 덮어쓴다.
       → 꾸밈(layers)만 넘기고 칸 배치는 레이아웃이 소유한다. */
    if (!opts.layersOnly) {
      if (rec.fitMode) st.fitMode = rec.fitMode;
      if (rec.collageBg) st.collageBg = rec.collageBg;
      if (rec.collageGap != null) st.collageGap = rec.collageGap;
      // 사진 수가 맞을 때만 레이아웃 복원. 안 맞으면 레이어(글씨·꾸밈)만 얹는다.
      var n = opts.photoCount;
      if (rec.layoutIdx != null && (n == null || _photoCountOf(rec) === n)) st.layoutIdx = rec.layoutIdx;   // [T2] 저장값 우선
    }
    // photos·photoDraw·adj·pz 는 일부러 안 넣음 — 넣으면 지금 사진을 지난 사진으로 덮어쓴다(itd-editor _restoreState:1648).
    return st;
  }

  // [T2] '이 스타일로 또 만들기' 1회 적용 — ★(원장 명시 지정)를 덮어쓰지 않는다.
  //   페이지 세션 메모리에만 둔다(성과 화면 → 새 글 플로우가 같은 페이지에서 이어지므로 충분).
  var _onceId = null;
  function applyOnce(id) { if (get(id)) { _onceId = id; return true; } return false; }
  // [T3] 엔진(_resolveRec)이 쓰는 접근자 — 미리보기는 피크만, 편집기는 소비.
  function peekOnce() { return _onceId ? get(_onceId) : null; }
  function takeOnce() { var r = peekOnce(); _onceId = null; return r; }   // 스테일 id 도 함께 해제(고착 방지)

  // 편집기/헤드리스 공용 선택. consumeOnce 는 편집기 경로만 true —
  //   헤드리스(캡션 미리보기)가 1회 지정을 소비해 버리면 정작 편집기가 열릴 때 ★로 되돌아가
  //   미리보기≠편집기가 된다. 그래서 미리보기는 '보되' 소비하지 않는다.
  function _pick(opts, consumeOnce) {
    try {
      if (!_flagOn()) return null;
      var rec = _onceId ? get(_onceId) : null;
      if (rec && consumeOnce) _onceId = null;   // 소비 — 다음 글부터는 다시 ★
      if (!rec) rec = getDefault();
      if (!rec) return null;
      var st = toEditState(rec, opts); if (!st) return null;
      return { rec: rec, state: st };
    } catch (_e) { return null; }
  }
  // 편집기 경로(엔진 forEditor 전용) — 어떤 기억이 얹혔는지(rec)까지 돌려줘 markApplied 의 근거가 된다.
  function resolveDefault(opts) { return _pick(opts, true); }
  // flow/헤드리스가 쓰는 한 줄짜리 진입점 — 플래그 OFF·기본 없음이면 null(=지금까지와 100% 동일하게 깨끗이 열림).
  //   [T2'] 순수 조회 — 예전엔 여기서 markUsed 를 해 캡션 화면 왕복마다 카운트가 부풀었다.
  function defaultEditState(opts) {
    var r = _pick(opts, false);
    return r ? r.state : null;
  }

  window.WorkMemory = {
    SCHEMA: SCHEMA, MAX: MAX,
    KEYS: { list: K_LIST, def: K_DEFAULT, auto: K_AUTO },
    list: list, get: get,
    getDefault: getDefault, getDefaultId: getDefaultId, setDefault: setDefault, clearDefault: clearDefault,
    autoOn: autoOn, setAutoOn: setAutoOn, applyOnce: applyOnce, peekOnce: peekOnce, takeOnce: takeOnce,
    textbook: textbook, dismissText: dismissText, assetMissCount: assetMissCount,
    rename: rename, remove: remove,
    describe: describe, formatWhen: formatWhen,
    captureFromSlot: captureFromSlot, captureAndNotify: captureAndNotify, showCaptureCard: showCaptureCard,
    markApplied: markApplied, markPublished: markPublished,
    toEditState: toEditState, defaultEditState: defaultEditState, resolveDefault: resolveDefault, flagOn: _flagOn,
    _distill: _distill, _makeName: _makeName, _sig: _sig, _migrate: _migrate   // 테스트용
  };
})();
