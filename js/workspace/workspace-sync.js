/* 작업실 slot 계정 동기화 (FE) — 기기 간 draft slot sync. 설계: DESIGN_slot_sync.md
   원칙:
   - 플래그 window.ITDASY_SLOT_SYNC 로 게이트. OFF 면 아무 것도 안 함(기존 로컬 전용 동작 그대로).
   - 로컬 IndexedDB(itdasy-gallery/slots)는 캐시로 유지. 저장/삭제는 항상 로컬 먼저.
   - 이미지는 최종 액션 때만 업로드(content_hash dedupe). 편집 중간 업로드 없음.
   - 충돌 = LWW(updatedAt). 삭제 = tombstone. 오프라인 = tombstone/재시도 큐.
   - 서버 쓰기용 원본 saveSlotToDB/deleteSlotFromDB 참조를 보관(래핑 재귀 방지).
   보조 메타(lastPulledAt/migratedAt/tombstones)는 별도 DB 'itdasy-sync'에 저장 →
   기존 app-gallery-db.js 의 스키마/버전 안 건드림. */
(function () {
  'use strict';

  function enabled() { return window.ITDASY_SLOT_SYNC === true; }
  function has(fn) { return typeof fn === 'function'; }
  function authHeader() { return has(window.authHeader) ? (window.authHeader() || {}) : {}; }
  function loggedIn() { var h = authHeader(); return !!(h && h.Authorization); }
  function ready() { return enabled() && loggedIn() && has(window.apiFetch) && has(window.saveSlotToDB); }
  function log() { if (window.__ITDASY_SYNC_DEBUG__) { try { console.log.apply(console, ['[wssync]'].concat([].slice.call(arguments))); } catch (_e) { void 0; } } }

  // 래핑 전에 잡아둔 원본(서버→로컬 반영 시 dirty 재표시 방지에 사용).
  var _origSaveSlot = null, _origDeleteSlot = null;

  // ── 보조 메타 DB (itdasy-sync) ─────────────────────────────
  var _sdb = null;
  function openSyncDB() {
    return new Promise(function (resolve, reject) {
      if (_sdb) return resolve(_sdb);
      var req = indexedDB.open('itdasy-sync', 1);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
        if (!db.objectStoreNames.contains('tombstones')) db.createObjectStore('tombstones', { keyPath: 'slot_id' });
      };
      req.onsuccess = function (e) { _sdb = e.target.result; resolve(_sdb); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function _tx(store, mode) { return openSyncDB().then(function (db) { return db.transaction(store, mode).objectStore(store); }); }
  function getMeta(k) { return _tx('meta', 'readonly').then(function (s) { return new Promise(function (res) { var r = s.get(k); r.onsuccess = function () { res(r.result ? r.result.v : null); }; r.onerror = function () { res(null); }; }); }); }
  function setMeta(k, v) { return _tx('meta', 'readwrite').then(function (s) { return new Promise(function (res) { var r = s.put({ k: k, v: v }); r.onsuccess = function () { res(true); }; r.onerror = function () { res(false); }; }); }); }
  function addTombstone(slotId) { return _tx('tombstones', 'readwrite').then(function (s) { return new Promise(function (res) { var r = s.put({ slot_id: slotId, at: Date.now() }); r.onsuccess = function () { res(true); }; r.onerror = function () { res(false); }; }); }); }
  function delTombstone(slotId) { return _tx('tombstones', 'readwrite').then(function (s) { return new Promise(function (res) { var r = s.delete(slotId); r.onsuccess = function () { res(true); }; r.onerror = function () { res(false); }; }); }); }
  function listTombstones() { return _tx('tombstones', 'readonly').then(function (s) { return new Promise(function (res) { var r = s.getAll(); r.onsuccess = function () { res(r.result || []); }; r.onerror = function () { res([]); }; }); }); }

  // ── 이미지 dataURL → JPEG blob (최장축 1440, q0.86) — Cloud Run 32MB·저장비용 방어 ──
  function _dataUrlToJpegBlob(dataUrl, maxDim, q) {
    maxDim = maxDim || 1440; q = q || 0.86;
    return new Promise(function (resolve) {
      try {
        var img = new Image();
        img.onload = function () {
          var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          var sc = Math.min(1, maxDim / Math.max(w, h || 1));
          var cw = Math.max(1, Math.round(w * sc)), ch = Math.max(1, Math.round(h * sc));
          var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
          var cx = cv.getContext('2d');
          cx.fillStyle = '#fff'; cx.fillRect(0, 0, cw, ch);
          cx.drawImage(img, 0, 0, cw, ch);
          if (cv.toBlob) cv.toBlob(function (b) { resolve(b); }, 'image/jpeg', q);
          else resolve(null);
        };
        img.onerror = function () { resolve(null); };
        img.src = dataUrl;
      } catch (_e) { resolve(null); }
    });
  }

  // 세션 캐시 — 같은 dataURL 은 세션 내 1회만 업로드.
  var _uploadCache = new Map();
  function uploadImage(dataUrl) {
    if (_uploadCache.has(dataUrl)) return Promise.resolve(_uploadCache.get(dataUrl));
    return _dataUrlToJpegBlob(dataUrl).then(function (blob) {
      if (!blob) return null;
      var fd = new FormData(); fd.append('image', blob, 'ws.jpg');
      return window.apiFetch('/workspace/slots/image', { method: 'POST', headers: authHeader(), body: fd })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { var u = j && j.url; if (u) _uploadCache.set(dataUrl, u); return u || null; })
        .catch(function (e) { log('upload fail', e); return null; });
    });
  }

  // ── 깊은 순회 — data:image URL 수집/치환 ─────────────────────
  function _isDataImg(v) { return typeof v === 'string' && v.indexOf('data:image') === 0; }
  function collectDataUrls(obj, out, depth) {
    out = out || new Set(); depth = depth || 0;
    if (obj == null || depth > 8) return out;
    if (_isDataImg(obj)) { out.add(obj); return out; }
    if (typeof obj !== 'object') return out;
    if (Array.isArray(obj)) { for (var i = 0; i < obj.length; i++) collectDataUrls(obj[i], out, depth + 1); return out; }
    for (var k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k)) collectDataUrls(obj[k], out, depth + 1); }
    return out;
  }
  function deepReplace(obj, map, depth) {
    depth = depth || 0;
    if (obj == null || depth > 8) return obj;
    if (_isDataImg(obj)) return map.has(obj) ? map.get(obj) : null;   // 업로드 실패분은 null
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(function (v) { return deepReplace(v, map, depth + 1); });
    var out = {};
    for (var k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = deepReplace(obj[k], map, depth + 1); }
    return out;
  }
  function _clone(o) { try { return (typeof structuredClone === 'function') ? structuredClone(o) : JSON.parse(JSON.stringify(o)); } catch (_e) { try { return JSON.parse(JSON.stringify(o)); } catch (_e2) { return o; } } }

  // [M2·M3] _rev/_base 는 순수 로컬 동기화 상태다 — meta 로 서버에 올라가면 안 된다(서버 오염 +
  //   다른 기기가 남의 base 를 물려받아 병합 판정이 틀어진다).
  var META_SKIP = { id: 1, label: 1, caption: 1, hashtags: 1, publish: 1, customer_id: 1, order: 1, photos: 1, updatedAt: 1, syncState: 1, _rev: 1, _base: 1 };
  function buildMeta(slot) {
    var m = {};
    for (var k in slot) {
      if (!Object.prototype.hasOwnProperty.call(slot, k) || META_SKIP[k]) continue;
      var v = slot[k];
      if (typeof v === 'function' || _isDataImg(v)) continue;
      // [v779] 100KB 초과 필드는 서버로 안 올린다 — 예전엔 무음 드롭이라 기기 간 소실이 조용히 났다.
      //   URL 치환(deepReplace) 뒤에도 큰 필드가 남으면 로그로 남겨 원인 추적 가능하게.
      // [P0-3] 필드마다 JSON.stringify 를 두 번(truthy 검사 + 길이) 하던 걸 한 번으로 — 큰 메타 필드 재직렬화 절반.
      try { var _s = JSON.stringify(v); if (_s && _s.length > 100000) { try { console.warn('[wsSync] 100KB 초과 필드 드롭:', k); } catch (_w) { void _w; } continue; } } catch (_e) { continue; }
      m[k] = v;
    }
    return m;
  }

  /* ── [M2·M3 2026-07-17] 서버 리비전(rev) + 3-way 병합 ───────────────────────
     문제였던 것:
       M2 — 충돌 판정을 기기 벽시계(updatedAt)로 했다. 태블릿 시계가 10분 느리면 나중에 한
            편집이 '옛것'으로 버려졌다.
       M3 — 폰은 캡션만, 태블릿은 사진만 고쳐도 늦게 올라간 쪽이 슬롯을 통째로 덮어써
            상대 수정이 사라졌다. 서로 다른 필드인데도.
     푸는 방식:
       slot._rev  = 마지막으로 본 서버 리비전(server_updated_at). push 때 base 로 보낸다.
       slot._base = 그 리비전 시점의 값 스냅샷(= 양쪽이 마지막으로 합의한 버전).
       409(충돌)면 base/local/remote 3-way 로 필드별 판정:
         local==base  → 내가 안 건드림 → remote 채택
         remote==base → 상대가 안 건드림 → local 채택
         셋 다 다름   → 진짜 충돌(둘 다 같은 필드를 다르게 고침) → 자동으로 못 고른다
     base 는 사진 blob 을 안 담는다 — 텍스트 메타 + 사진 '서명'만(수백 바이트). */
  var MERGE_FIELDS = ['label', 'caption', 'hashtags', 'customer_id', 'order'];

  /** 사진 집합의 서명 — id 순서 + 편집상태만. blob 없이 '바뀌었나'만 본다. */
  function photoSig(slot) {
    try {
      return (slot && slot.photos || []).map(function (p) {
        return String(p && p.id) + ':' + String(p && p.role || '') + ':' + (p && p.editState ? JSON.stringify(p.editState).length : 0);
      }).join('|');
    } catch (_e) { return ''; }
  }
  /** 합의 스냅샷 — 이 값 위에서 다음 편집이 일어난다. */
  function makeBase(slot) {
    var b = { _sig: photoSig(slot) };
    MERGE_FIELDS.forEach(function (k) { b[k] = slot ? slot[k] : undefined; });
    return b;
  }
  function sameVal(a, b) { return (a == null ? '' : String(a)) === (b == null ? '' : String(b)); }

  /**
   * 3-way 병합. 반환 { slot, conflicts:[필드명] }.
   * conflicts 가 비어 있으면 완전 자동 병합 성공(원장 개입 불필요).
   */
  function merge3(base, local, remote) {
    var out = Object.assign({}, remote);   // 서버본을 바탕으로 시작(rev·서버 필드 보존)
    var conflicts = [];
    MERGE_FIELDS.forEach(function (k) {
      var b = base ? base[k] : undefined, l = local ? local[k] : undefined, r = remote ? remote[k] : undefined;
      if (sameVal(l, r)) { out[k] = r; return; }          // 결과가 같으면 다툼 없음
      if (sameVal(l, b)) { out[k] = r; return; }          // 내가 안 건드림 → 상대 것
      if (sameVal(r, b)) { out[k] = l; return; }          // 상대가 안 건드림 → 내 것
      conflicts.push(k); out[k] = l;                       // 진짜 충돌 — 일단 내 것 두고 아래서 분리
    });
    // 사진은 필드로 못 쪼갠다(순서·추가·삭제가 얽힘) → 서명으로 '한쪽만 바꿨나'만 본다.
    var bs = base ? base._sig : '', ls = photoSig(local), rs = photoSig(remote);
    if (ls !== rs) {
      if (ls === bs) out.photos = remote.photos;           // 내가 사진 안 건드림 → 상대 것
      else if (rs === bs) out.photos = local.photos;       // 상대가 안 건드림 → 내 것
      else { conflicts.push('photos'); out.photos = local.photos; }
    }
    return { slot: out, conflicts: conflicts };
  }

  function tsMs(iso) { if (!iso) return 0; var t = new Date(iso).getTime(); return isNaN(t) ? 0 : t; }
  function isoOf(ms) { try { return new Date(ms || Date.now()).toISOString(); } catch (_e) { return new Date().toISOString(); } }

  // ── slot → 서버 payload (이미지 URL 치환 후) ─────────────────
  function buildPayload(slot) {
    var urls = Array.from(collectDataUrls(slot));
    // 순차 업로드 (draft 사진 수 적음, 서버·네트워크 배려).
    return urls.reduce(function (p, du) { return p.then(function (map) { return uploadImage(du).then(function (u) { if (u) map.set(du, u); return map; }); }); }, Promise.resolve(new Map()))
      .then(function (map) {
        // [버그수정 2026-07-06] 업로드 실패분이 하나라도 있으면 payload 불완전 → 이 사실을 상위(pushSlot)에
        //   알려 slot 을 synced 로 마킹하지 않게 한다(안 그러면 실패한 사진이 서버·로컬 양쪽에서 소실).
        var _complete = (urls.length === map.size);
        var c = deepReplace(_clone(slot), map);
        var photos = (c.photos || []).map(function (p, i) {
          var img = p.editedDataUrl || p.dataUrl;
          return {
            photo_id: String(p.id || ('p' + i)),
            role: p.role || 'hero',
            image_url: (typeof img === 'string' && img.indexOf('data:') !== 0) ? img : null,
            base_url: (typeof p.baseUrl === 'string' && p.baseUrl.indexOf('data:') !== 0) ? p.baseUrl : null,
            edit_state: p.editState || null,
            sort_order: i,
          };
        }).filter(function (p) { return !!p.image_url; });   // 이미지 없는 사진은 스킵
        return {
          _complete: _complete,
          payload: {
            slot_id: String(slot.id),
            label: slot.label || '',
            caption: slot.caption || '',
            hashtags: slot.hashtags || '',
            publish: slot.publish || null,
            customer_id: (slot.customer_id != null ? slot.customer_id : null),
            sort_order: slot.order || 0,
            // [M2] 이 편집이 올라탄 서버 리비전 — 서버가 이걸로 충돌을 판정한다(벽시계 대신).
            base_server_updated_at: slot._rev || null,
            // [버그수정 2026-07-15] 원본 slot 이 아니라 URL 치환된 c 를 넘긴다.
            //   원본엔 templateOutputs[].outputUrl 이 구운 JPEG dataURL(수백 KB) 로 남아있어서
            //   buildMeta 의 100KB 컷에 걸려 templateOutputs 가 통째로 조용히 버려졌다.
            //   → 레이아웃 프리셋 id(어떤 틀로 만든 글인지)가 서버에 안 올라가고 이 기기에만 남아,
            //     폰 바꾸면 성과 화면의 레이아웃 학습이 리셋됐다. c 는 이미 https URL 이라 컷을 안 넘는다.
            meta: buildMeta(c),
            client_updated_at: isoOf(slot.updatedAt),
            photos: photos,
          },
        };
      });
  }

  // ── 서버 slot → 로컬 slot 형태 복원 ──────────────────────────
  function remoteToLocal(rs) {
    var photos = (rs.photos || []).map(function (p) {
      return {
        id: p.photo_id, role: p.role || 'hero', selected: true,
        dataUrl: p.base_url || p.image_url,
        editedDataUrl: p.image_url,
        baseUrl: p.base_url || p.image_url,
        editState: p.edit_state || null,
      };
    });
    var slot = Object.assign({}, rs.meta || {}, {
      id: rs.slot_id, label: rs.label || '', caption: rs.caption || '',
      hashtags: rs.hashtags || '', publish: rs.publish || null,
      customer_id: (rs.customer_id != null ? rs.customer_id : null),
      order: rs.sort_order || 0, photos: photos,
      updatedAt: tsMs(rs.client_updated_at), syncState: 'synced',
      // [M2·M3] 서버본을 받아들인 = 합의 지점. 이 rev 위에서 다음 편집이 일어나고,
      //   충돌 시 이 base 가 '뭐가 바뀌었나'를 가르는 기준이 된다.
      _rev: rs.server_updated_at || null,
    });
    slot._base = makeBase(slot);
    return slot;
  }

  function loadAllLocal() { return has(window.loadSlotsFromDB) ? Promise.resolve(window.loadSlotsFromDB()).catch(function () { return []; }) : Promise.resolve([]); }
  /** [2026-07-16] 단일 슬롯 재조회 — 쓰기 직전 TOCTOU 재확인용(스냅샷은 이미 낡았을 수 있다). */
  function loadOneLocal(id) {
    return loadAllLocal().then(function (list) {
      var k = String(id);
      return (list || []).filter(function (s) { return s && String(s.id) === k; })[0] || null;
    }).catch(function () { return null; });
  }
  function refreshHome() { try { if (window.WorkspaceV2 && has(window.WorkspaceV2.refresh)) window.WorkspaceV2.refresh(); } catch (_e) { void 0; } }

  // ── Phase B: 다른 기기에서 온 http 이미지 → 로컬 dataURL 재수화(hydration) ──
  //   다른 기기가 올린 slot 은 이미지가 Supabase https URL. 뷰·단일발행(fetch→blob)은 CORS(*)로 바로 되지만,
  //   편집기/캐러셀은 캔버스에 다시 굽는데 크로스오리진 이미지는 캔버스를 오염(taint)시켜 export 가 막힌다.
  //   → 픽셀이 필요한 순간(편집기 열기·캐러셀 발행) 직전에 http 이미지를 data:URL 로 되돌려, 로컬 생성 slot 과 동일하게 다룬다.
  var _hydrateCache = new Map();
  function _isHttp(u) { return typeof u === 'string' && /^https?:\/\//.test(u); }
  function _isSyncedImg(u) { return _isHttp(u) && (/\/storage\/v1\/object\/public\//.test(u) || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u)); }
  function hydrateUrl(url) {
    if (_hydrateCache.has(url)) return Promise.resolve(_hydrateCache.get(url));
    return fetch(url).then(function (r) { return r.ok ? r.blob() : null; }).then(function (b) {
      if (!b) return null;
      return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = function () { res(null); }; fr.readAsDataURL(b); });
    }).then(function (du) { if (du) _hydrateCache.set(url, du); return du; }).catch(function (e) { log('hydrate fail', e); return null; });
  }
  function collectSyncedImgs(obj, out, depth) {
    out = out || new Set(); depth = depth || 0;
    if (obj == null || depth > 8) return out;
    if (_isSyncedImg(obj)) { out.add(obj); return out; }
    if (typeof obj !== 'object') return out;
    if (Array.isArray(obj)) { for (var i = 0; i < obj.length; i++) collectSyncedImgs(obj[i], out, depth + 1); return out; }
    for (var k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k)) collectSyncedImgs(obj[k], out, depth + 1); }
    return out;
  }
  function deepMapReplace(obj, map, depth) {
    depth = depth || 0;
    if (obj == null || depth > 8) return obj;
    if (typeof obj === 'string') return map.has(obj) ? map.get(obj) : obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(function (v) { return deepMapReplace(v, map, depth + 1); });
    var out = {};
    for (var k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = deepMapReplace(obj[k], map, depth + 1); }
    return out;
  }
  // photos 배열을 제자리(in place) 수화 — dataUrl/editedDataUrl/baseUrl + editState 중첩까지. 바뀐 게 있으면 true.
  function hydratePhotos(photos) {
    if (!enabled() || !Array.isArray(photos) || !photos.length) return Promise.resolve(false);
    var urls = new Set();
    photos.forEach(function (p) {
      if (!p) return;
      ['dataUrl', 'editedDataUrl', 'baseUrl'].forEach(function (k) { if (_isSyncedImg(p[k])) urls.add(p[k]); });
      if (p.editState) collectSyncedImgs(p.editState, urls, 0);
    });
    if (!urls.size) return Promise.resolve(false);
    var arr = Array.from(urls);
    return arr.reduce(function (pr, u) { return pr.then(function (m) { return hydrateUrl(u).then(function (du) { if (du) m.set(u, du); return m; }); }); }, Promise.resolve(new Map()))
      .then(function (map) {
        if (!map.size) return false;
        photos.forEach(function (p) {
          if (!p) return;
          ['dataUrl', 'editedDataUrl', 'baseUrl'].forEach(function (k) { if (map.has(p[k])) p[k] = map.get(p[k]); });
          if (p.editState) p.editState = deepMapReplace(p.editState, map, 0);
        });
        return true;
      });
  }

  // ── PUSH — dirty slot 업서트 + tombstone 삭제 반영 ───────────
  var _pushing = false;
  function pushAll() {
    if (!ready() || _pushing) return Promise.resolve();
    _pushing = true;
    return flushTombstones()
      .then(loadAllLocal)
      .then(function (slots) {
        var dirty = (slots || []).filter(function (s) { return s && s.syncState !== 'synced'; });
        log('push dirty', dirty.length);
        return dirty.reduce(function (p, slot) { return p.then(function () { return pushSlot(slot); }); }, Promise.resolve());
      })
      .catch(function (e) { log('pushAll err', e); })
      .then(function () { _pushing = false; });
  }
  function pushSlot(slot) {
    var startedAt = slot && slot.updatedAt;   // [버그수정 2026-07-09 TOCTOU] push 시작 스냅샷
    return buildPayload(slot).then(function (built) {
      var payload = built.payload, complete = built._complete;
      return window.apiFetch('/workspace/slots/upsert', {
        method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, authHeader()), body: JSON.stringify(payload),
      }).then(function (r) {
        // [M2·M3] 409 = 내가 본 리비전 이후 다른 기기가 바꿈 → 덮어쓰지 말고 3-way 병합.
        if (r.status === 409) return r.json().catch(function () { return null; }).then(function (b) {
          var remote = b && b.detail && b.detail.slot;
          return remote ? resolveConflict(slot, remote).then(function () { return { _conflict: true }; }) : null;
        });
        return r.ok ? r.json() : null;
      }).then(function (j) {
        if (j && j._conflict) return;   // 병합이 처리 — 이번 push 는 여기서 끝(병합본이 dirty 로 남아 다음 push)
        if (j && (j.ok || j.skipped)) {
          // [버그수정 2026-07-09 TOCTOU] push(업로드) 도중 사용자가 재편집(updatedAt 변경)했으면 그 편집분은
          //   이번 payload(buildPayload 시점 스냅샷)에 없으므로 synced 로 굳히지 않는다(다음 push 로 반영).
          if (slot && slot.updatedAt !== startedAt) { log('pushSlot re-edited during push — keep dirty', slot && slot.id); return; }
          // [버그수정 2026-07-06] 사진 업로드가 하나라도 실패했으면 synced 로 굳히지 않는다(dirty 유지 → 다음 push 재시도).
          //   안 그러면 실패 사진이 서버에 없는 채 synced 로 마킹돼 pull 이 로컬을 덮어 영구 소실.
          if (complete) {
            // [H4 수정 2026-07-16] push 도중 원장이 이 슬롯을 지웠으면 되살리지 않는다.
            //   예전엔 synced 마킹용 write-back(_origSaveSlot)이 '삭제된 슬롯'을 로컬에 재삽입해
            //   지운 글이 유령처럼 되살아났다. 쓰기 직전에 아직 살아있는지 재확인한다.
            return loadOneLocal(slot.id).then(function (still) {
              if (!still) { log('pushSlot deleted during push — skip write-back', slot && slot.id); return; }
              slot.syncState = 'synced';
              // [M2·M3] push 성공 = 서버와 합의한 지점 → 새 rev 와 base 스냅샷을 심는다.
              //   다음 편집은 이 base 위에서 일어나고, 충돌 시 3-way 병합의 기준이 된다.
              var _srv = j && j.slot;
              if (_srv && _srv.server_updated_at) slot._rev = _srv.server_updated_at;
              slot._base = makeBase(slot);
              if (_origSaveSlot) return Promise.resolve(_origSaveSlot(slot)).catch(function () {});   // synced 상태만 영속(재-dirty 안 함)
            });
          }
          log('pushSlot partial — keep dirty for retry', slot && slot.id);
        }
      });
    }).catch(function (e) { log('pushSlot err', slot && slot.id, e); });
  }
  /**
   * [M3] 충돌 해소 — 서버가 409 로 준 remote 와 내 local 을 base 기준 3-way 병합.
   *   자동 병합되면 병합본을 dirty 로 저장(다음 push 가 새 rev 위에서 올린다).
   *   진짜 충돌(둘 다 같은 필드를 다르게 고침)이면 자동으로 고를 근거가 원리적으로 없다 →
   *   서버본을 원본 자리에 두고 내 것을 '다른 기기 수정본' 으로 분리해 아무것도 안 잃는다.
   */
  function resolveConflict(local, remoteRaw) {
    var remote = remoteToLocal(remoteRaw);
    var base = local && local._base;
    var res = merge3(base, local, remote);
    var merged = res.slot;
    merged.id = local.id;
    merged._rev = remoteRaw.server_updated_at || null;   // 새 리비전 위에 올라탄다
    merged.updatedAt = Date.now();
    merged.syncState = 'dirty';                           // 병합 결과를 다시 올려야 서버도 최신이 된다
    merged._base = makeBase(merged);

    if (!res.conflicts.length) {
      log('conflict auto-merged', local.id);
      return Promise.resolve(_origSaveSlot(merged)).catch(function () {});
    }
    // 진짜 충돌 — 서버본을 원본 자리에, 내 것은 사본으로 남긴다(둘 다 보존).
    log('conflict needs human', local.id, res.conflicts);
    var mine = Object.assign({}, local, {
      id: String(local.id) + '_conflict_' + Date.now(),
      label: (local.label || '작업') + ' (다른 기기 수정본)',
      _rev: null, _base: null, updatedAt: Date.now(), syncState: 'dirty',
    });
    var srv = Object.assign({}, remote, {
      id: local.id, _rev: remoteRaw.server_updated_at || null, syncState: 'synced',
    });
    srv._base = makeBase(srv);
    return Promise.resolve(_origSaveSlot(srv)).catch(function () {})
      .then(function () { return Promise.resolve(_origSaveSlot(mine)).catch(function () {}); })
      .then(function () {
        try { if (window.showToast) window.showToast('다른 기기에서도 같은 글을 고쳤어요 — 수정본을 따로 남겼어요'); } catch (_e) { void _e; }
        refreshHome();
      });
  }

  function flushTombstones() {
    return listTombstones().then(function (tombs) {
      return (tombs || []).reduce(function (p, t) {
        return p.then(function () {
          return window.apiFetch('/workspace/slots/' + encodeURIComponent(t.slot_id), { method: 'DELETE', headers: authHeader() })
            .then(function (r) { if (r.ok) return delTombstone(t.slot_id); })
            .catch(function (e) { log('tomb del err', e); });
        });
      }, Promise.resolve());
    });
  }

  // ── PULL — delta 병합(LWW) ──────────────────────────────────
  var _pulling = false;
  function pull() {
    if (!ready() || _pulling) return Promise.resolve();
    _pulling = true;
    return getMeta('lastPulledAt').then(function (since) {
      var url = '/workspace/slots' + (since ? ('?since=' + encodeURIComponent(since)) : '');
      return window.apiFetch(url, { method: 'GET', headers: authHeader() }).then(function (r) { return r.ok ? r.json() : null; });
    }).then(function (resp) {
      if (!resp || !Array.isArray(resp.slots)) return;
      return Promise.all([loadAllLocal(), listTombstones()]).then(function (both) {
        var locals = both[0];
        // [H5 수정 2026-07-16] 로컬에서 지웠는데 아직 서버로 DELETE 를 못 보낸 슬롯(tombstone)은
        //   pull 이 되살리면 안 된다. 예전엔 local 이 없으니 가드를 통과해 삭제한 글이 부활했다.
        var tombs = {}; (both[1] || []).forEach(function (t) { if (t && t.slot_id != null) tombs[String(t.slot_id)] = 1; });
        var byId = {}; (locals || []).forEach(function (s) { if (s && s.id != null) byId[String(s.id)] = s; });
        var changed = false;
        var applyFailed = false;   // [버그수정 2026-07-06] 적용 실패분 있으면 lastPulledAt 전진 금지(그 slot 이 영영 누락되던 것)
        return resp.slots.reduce(function (p, rs) {
          return p.then(function () {
            var local = byId[String(rs.slot_id)];
            if (rs.deleted) {
              if (local && has(_origDeleteSlot)) {
                var delMs = tsMs(rs.deleted_at);
                if (!local.updatedAt || local.updatedAt <= delMs) { changed = true; return Promise.resolve(_origDeleteSlot(rs.slot_id)).catch(function () { applyFailed = true; }).then(function () { return delTombstone(rs.slot_id); }); }
              }
              return delTombstone(rs.slot_id);   // 서버가 삭제 확인 → 로컬 tombstone 정리
            }
            // [H5] 로컬 삭제분(tombstone 대기)은 되살리지 않는다 — DELETE 가 아직 안 나갔을 뿐 이미 지운 글.
            if (tombs[String(rs.slot_id)]) { log('pull skip — tombstoned locally', rs.slot_id); return; }
            // 로컬이 아직 안 올라간 변경(=synced 아님)이고 더 최신이면 로컬 유지(다음 push 로 서버 갱신).
            //   [버그수정 2026-07-06] push 필터(!=='synced')와 술어 일치 — 'dirty' 외 값(undefined 등)도 방어.
            if (local && local.syncState !== 'synced' && (local.updatedAt || 0) > tsMs(rs.client_updated_at)) return;
            // [H3 수정 2026-07-16 TOCTOU] byId 스냅샷은 pull 시작 시점 것이라 낡았다. 쓰기 직전에 다시 읽어
            //   재확인한다 — 그 사이 원장이 저장한 더 최신 편집을 옛 서버본으로 덮어써 날리던 버그.
            //   (push 엔 같은 가드가 있었는데 pull 엔 없었다.)
            return loadOneLocal(rs.slot_id).then(function (fresh) {
              if (fresh && fresh.syncState !== 'synced' && (fresh.updatedAt || 0) > tsMs(rs.client_updated_at)) {
                log('pull skip — local re-edited during pull', rs.slot_id); return;
              }
              changed = true;
              return Promise.resolve(_origSaveSlot(remoteToLocal(rs))).catch(function () { applyFailed = true; });
            });
          });
        }, Promise.resolve()).then(function () {
          // 하나라도 적용 실패면 since 를 전진시키지 않는다 → 다음 pull 이 그 delta 를 다시 받아 재시도.
          if (resp.server_time && !applyFailed) setMeta('lastPulledAt', resp.server_time);
          if (changed) refreshHome();
        });
      });
    }).catch(function (e) { log('pull err', e); }).then(function () { _pulling = false; });
  }

  // ── 최초 로그인 마이그레이션 — 로컬 slot 1회 서버 업로드 ──────
  function migrateIfNeeded() {
    if (!ready()) return Promise.resolve();
    return getMeta('migratedAt').then(function (m) {
      if (m) return;
      return loadAllLocal().then(function (slots) {
        var now = Date.now();
        return (slots || []).reduce(function (p, s) {
          return p.then(function () {
            if (!s) return;
            if (!s.updatedAt) s.updatedAt = now;
            s.syncState = 'dirty';
            if (_origSaveSlot) return Promise.resolve(_origSaveSlot(s)).catch(function () {});
          });
        }, Promise.resolve()).then(function () { return setMeta('migratedAt', isoOf(now)); });
      });
    });
  }

  // ── 통합 sync ───────────────────────────────────────────────
  var _syncing = false;
  function sync() {
    if (!ready() || _syncing) return Promise.resolve();
    _syncing = true;
    // 편집 플로우 열려 있으면(coalesce) 자동 push 생략 — 정착(settleSlot)이나 idle 백스톱에서만 올림. pull 은 계속.
    // [H5 수정 2026-07-16] coalesce 로 pushAll 을 건너뛰어도 삭제(tombstone)는 반드시 보낸다.
    //   pushAll 이 flushTombstones 의 유일한 호출자였어서, 편집 중엔 삭제가 서버에 안 나가고
    //   그 상태로 pull 이 돌아 지운 글이 되살아났다. (pushAll 도 안에서 또 부르지만 idempotent)
    return migrateIfNeeded()
      .then(function () { return flushTombstones().catch(function () {}); })
      .then(function () { return (COALESCE() && _flowOpen) ? null : pushAll(); })
      .then(pull).catch(function (e) { log('sync err', e); }).then(function () { _syncing = false; });
  }
  var _pushTimer = null;
  function schedulePush() { if (!ready()) return; clearTimeout(_pushTimer); _pushTimer = setTimeout(function () { pushAll(); }, 1200); }

  // ── coalesce(비용 방어) — 편집 중엔 매 저장마다 업로드하지 않고, '정착(settle)' 때 1회만 ──
  //   sub-flag ITDASY_SLOT_SYNC_COALESCE. off면 기존 eager 동작 그대로.
  //   신규 slot 은 open 시점에 안정적 id가 없으므로 slot별이 아니라 '플로우 열림' 단위로 억제한다.
  var _flowOpen = false;
  var _idleTimer = null;
  function COALESCE() { return window.ITDASY_SLOT_SYNC_COALESCE === true; }
  function _armIdle() { if (_idleTimer) clearTimeout(_idleTimer); _idleTimer = setTimeout(function () { settleSlot(); }, 20000); }  // 백스톱: 20s 무저장이면 정착
  function _clearIdle() { if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null; } }
  function beginEdit() { if (!COALESCE()) return; _flowOpen = true; clearTimeout(_pushTimer); _clearIdle(); }   // 편집 시작 → auto-push 억제
  function settleSlot() { _flowOpen = false; _clearIdle(); if (!ready()) return Promise.resolve(); return pushAll(); }   // 정착 → 최종본 1회 push

  // ── 전역 래핑 — 저장/삭제 시 dirty 표시 + 동기화 트리거 ──────
  function wrapGlobals() {
    if (has(window.saveSlotToDB) && !window.saveSlotToDB.__wsSyncWrapped) {
      _origSaveSlot = window.saveSlotToDB;
      var wrappedSave = function (slot) {
        try { if (slot && typeof slot === 'object') { slot.updatedAt = Date.now(); slot.syncState = 'dirty'; } } catch (_e) { void 0; }
        var out = _origSaveSlot.apply(this, arguments);
        // 편집 플로우 열려 있으면(coalesce) 즉시 push 대신 idle 백스톱만 — 정착 때 1회 업로드.
        Promise.resolve(out).then(function () { if (COALESCE() && _flowOpen) _armIdle(); else schedulePush(); }).catch(function () {});
        return out;
      };
      wrappedSave.__wsSyncWrapped = true;
      window.saveSlotToDB = wrappedSave;
    }
    if (has(window.deleteSlotFromDB) && !window.deleteSlotFromDB.__wsSyncWrapped) {
      _origDeleteSlot = window.deleteSlotFromDB;
      var wrappedDel = function (id) {
        var out = _origDeleteSlot.apply(this, arguments);
        Promise.resolve(out).then(function () { return addTombstone(String(id)); }).then(function () { if (ready()) flushTombstones(); }).catch(function () {});
        return out;
      };
      wrappedDel.__wsSyncWrapped = true;
      window.deleteSlotFromDB = wrappedDel;
    }
  }

  // ── 로그아웃/계정전환 시 로컬 sync 메타 완전 삭제 ──────────────
  //   [버그수정 2026-07-06] logout 은 itdasy-gallery(slots)만 지우고 itdasy-sync(migratedAt·lastPulledAt·
  //   tombstones)는 안 지웠다 → 다음 계정에서 migrate skip·delta 누락으로 계정 격리 붕괴+slot 유실.
  /* [2026-09-03 모바일 게이트] **이 함수는 로그인 경로에서 await 된다 — 절대 매달리면 안 된다.**
     실측(배포본 0f56fe9, 실기기 크기 390×844): 로그인은 성공했는데(/auth/me 200, 토큰 저장됨)
     버튼이 "로그인 중..." 에서 멈추고 잠금화면이 안 걷혔다. 새로고침해야만 들어가진다.
     추적: _doLogin → applyNewSession(forcePurge) → _purgeUserScopedDB → **여기서 정지**.
     원인: `indexedDB.deleteDatabase` 가 다른 연결이 열려 있으면
       **success·error·blocked 를 하나도 안 내고 readyState=pending 으로 남는다**
       (4초 관찰 결과 이벤트 0건, DB 그대로). 그래서 이 Promise 가 영영 settle 되지 않았다.
       onblocked 를 달아둔 것만으로는 부족하다 — 그 이벤트조차 안 온다.
     → 정리는 **best-effort** 로 강등한다. 못 지워도 로그인은 통과시키고,
       못 지웠다는 사실을 남겨 다음 부팅에서 다시 시도한다(아래 init 의 재시도).
     ⚠️ 타임아웃을 없애지 마라. 이 await 하나가 로그인 전체를 막는다. */
  var CLEAR_LOCAL_TIMEOUT_MS = 2000;
  var PURGE_PENDING_KEY = 'itdasy_sync_purge_pending';
  function clearLocal() {
    return new Promise(function (resolve) {
      var settled = false;
      function finish(ok) {
        if (settled) return;
        settled = true;
        try {
          if (ok) localStorage.removeItem(PURGE_PENDING_KEY);
          else localStorage.setItem(PURGE_PENDING_KEY, '1');   // 다음 부팅에서 재시도
        } catch (_e0) { void 0; }
        resolve(ok);
      }
      var timer = setTimeout(function () { finish(false); }, CLEAR_LOCAL_TIMEOUT_MS);
      try {
        if (_sdb) { try { _sdb.close(); } catch (_e) { void 0; } _sdb = null; }
        try { _uploadCache.clear(); } catch (_e2) { void 0; }
        try { if (typeof _hydrateCache !== 'undefined' && _hydrateCache) _hydrateCache.clear(); } catch (_e3) { void 0; }
        var req = indexedDB.deleteDatabase('itdasy-sync');
        req.onsuccess = req.onerror = req.onblocked = function () { clearTimeout(timer); finish(true); };
      } catch (_e) { clearTimeout(timer); finish(false); }
    });
  }

  // ── init ───────────────────────────────────────────────────
  function init() {
    if (!enabled()) { window.WorkspaceSync = { enabled: false, sync: function () { return Promise.resolve(); }, hydratePhotos: function () { return Promise.resolve(false); }, beginEdit: function () {}, settleSlot: function () { return Promise.resolve(); }, clearLocal: clearLocal }; return; }
    wrapGlobals();
    /* 지난번 정리가 타임아웃으로 못 끝났으면(다른 연결이 붙잡고 있었음) 여기서 다시 시도한다.
       그때는 로그인 경로가 아니라 await 하는 사람이 없으므로 매달려도 화면을 막지 않는다. */
    try {
      if (localStorage.getItem(PURGE_PENDING_KEY) === '1') clearLocal();
    } catch (_e) { void 0; }
    window.WorkspaceSync = { enabled: true, sync: sync, pull: pull, push: pushAll, hydratePhotos: hydratePhotos, beginEdit: beginEdit, settleSlot: settleSlot, clearLocal: clearLocal, _debug: { buildPayload: buildPayload, remoteToLocal: remoteToLocal, hydratePhotos: hydratePhotos, merge3: merge3, makeBase: makeBase, photoSig: photoSig } };
    // 최초 동기화 — 로그인 상태 갖춰지면. 아니면 이후 트리거에서 재시도.
    var tries = 0;
    (function boot() { if (ready()) { sync(); } else if (tries++ < 20) { setTimeout(boot, 800); } })();
    window.addEventListener('online', function () { sync(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) sync(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
