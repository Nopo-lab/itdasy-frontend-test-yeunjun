/* Workspace V2 어댑터 (Phase 2) — V2 UI 에서 기존 앱 기능을 "직접 구현 없이" 연결.
   원칙: 구 slot 팝업/openSlotPopup/nav-sheet 직접 노출 금지. 기존 함수는 내부 재사용.
   - 보정/누끼/템플릿: PhotoEditor.open() 직접 호출(모던 에디터) — openSlotPhotoInEditor(구 컨텍스트) 미사용.
   - 캡션: window.CaptionEngine.generate (DOM 비의존, /persona/generate 재사용).
   - 고객: window.Customer.pick → {id,name}.
   - 가격표: window.openPricelistUpload (사진편집 흐름과 분리).
   - 저장: window.saveSlotToDB / saveToGallery.
   - 인스타: 연결(localStorage itdasy:ig_connected_cache)일 때만 실제 업로드, 아니면 준비/연결/복사/저장.
   각 함수는 {ok, reason?, toast?, ...} 또는 Promise 로 결과 반환. */
(function () {
  'use strict';
	  function toast(m) { if (window.showToast) window.showToast(m); }
	  function has(fn) { return typeof fn === 'function'; }
	  function igConnected() { try { return localStorage.getItem('itdasy:ig_connected_cache') === '1'; } catch (_e) { return false; } }
	  function _hasValues(obj) { return !!(obj && Object.keys(obj).some(function (k) { return +obj[k] !== 0; })); }
	  function _loadImage(src) {
	    return new Promise(function (resolve, reject) {
	      var img = new Image();
	      // [버그수정 2026-07-06] slot-sync 로 http(Supabase, CORS *) 이미지가 들어올 수 있어 — crossOrigin 없으면
	      //   캔버스 taint 로 toDataURL 이 SecurityError. data:/blob: 는 무시되므로 무조건 설정 안전(편집기 loadImg 와 동일).
	      if (/^https?:/i.test(String(src || ''))) img.crossOrigin = 'anonymous';
	      img.onload = function () { resolve(img); };
	      img.onerror = reject;
	      img.src = src;
	    });
	  }
	  // [#3] 캐러셀 업로드 payload 축소 — canvas PNG dataURL(장당 3~8MB)을 그대로 보내면
	  //   여러 장 합계가 Cloud Run 32MB 요청 한도/네트워크를 넘겨 fetch 가 rejection('api')로 실패했다.
	  //   백엔드가 어차피 JPEG 로 재인코딩하므로 클라이언트에서 미리 JPEG(최장축 1440, q0.86)로 줄여 보낸다.
	  function _toJpegBlob(src, maxDim, quality) {
	    maxDim = maxDim || 1440; quality = quality || 0.86;
	    return _loadImage(src).then(function (img) {
	      var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
	      var sc = Math.min(1, maxDim / Math.max(w, h || 1));
	      var cw = Math.max(1, Math.round(w * sc)), ch = Math.max(1, Math.round(h * sc));
	      var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
	      var cx = cv.getContext('2d');
	      cx.fillStyle = '#fff'; cx.fillRect(0, 0, cw, ch);   // JPEG 무알파 → 흰 배경 합성
	      cx.drawImage(img, 0, 0, cw, ch);
	      return new Promise(function (res) {
	        if (cv.toBlob) cv.toBlob(function (b) { res(b); }, 'image/jpeg', quality);
	        else { try { res(_dataUrlToBlob(cv.toDataURL('image/jpeg', quality))); } catch (_e) { res(null); } }
	      });
	    }).catch(function () { return null; });
	  }
	  function _dataUrlToBlob(durl) {
	    var parts = durl.split(','), mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
	    var bin = atob(parts[1]), n = bin.length, u8 = new Uint8Array(n);
	    while (n--) u8[n] = bin.charCodeAt(n);
	    return new Blob([u8], { type: mime });
	  }
	  // [이슈10] 디코드 캐시(소형 LRU) — 같은 src 를 슬라이더 commit 마다 다시 디코드하던 비용 제거.
	  //   Image 는 로드 후 불변이고 매번 새 캔버스에 draw 하므로 재사용 안전. 손 떼고 다시 조작 시 즉시 hit.
	  var _imgCache = [];
	  function _loadImageCached(src) {
	    for (var i = 0; i < _imgCache.length; i++) {
	      if (_imgCache[i].src === src) { var hit = _imgCache.splice(i, 1)[0]; _imgCache.push(hit); return Promise.resolve(hit.img); }
	    }
	    return _loadImage(src).then(function (img) {
	      _imgCache.push({ src: src, img: img }); if (_imgCache.length > 4) _imgCache.shift();
	      return img;
	    });
	  }
	  function _encode(cv, src) {
	    return /^data:image\/png/i.test(src || '') ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.92);
	  }
	  function _cover(ctx, img, x, y, w, h) {
	    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
	    if (!iw || !ih) return;
	    var scale = Math.max(w / iw, h / ih);
	    var sw = w / scale, sh = h / scale;
	    var sx = Math.max(0, (iw - sw) / 2), sy = Math.max(0, (ih - sh) / 2);
	    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
	  }
	  function _brand() {
	    var b = {};
	    try { if (window.BrandKit && has(window.BrandKit.get)) b = window.BrandKit.get() || {}; } catch (_e) { b = {}; }
	    try { if (!b.shop_name && localStorage.getItem('shop_name')) b.shop_name = localStorage.getItem('shop_name'); } catch (_e2) { void _e2; }
	    return { shopName: b.shop_name || b.shopName || '잇데이 스튜디오', primary: b.primary || '#BC6675', soft: b.soft || '#FBEFEF' };
	  }
	  function _igProfile() {
	    var s = null;
	    try { s = window.IGState && has(window.IGState.get) ? window.IGState.get() : null; } catch (_e) { s = null; }
	    // [버그수정] 예전엔 live 상태(s.connected)와 로컬 캐시(itdasy:ig_connected_cache)를 OR 로 합쳐서,
	    //   인스타 연동이 끊기거나 비활성화된 뒤에도 옛 캐시 '1'이 남아 있으면 영원히 connected=true 로 보였다
	    //   (여러 장 올리기가 "올리는 중…" 애니메이션까지 보여주고 조용히 실패하던 원인). live 상태가 있으면 그것만 신뢰하고,
	    //   아직 상태를 못 받아온 경우(s===null)에만 캐시를 임시로 사용한다.
	    var connected = s ? !!s.connected : igConnected();
	    // [버그수정] connected 는 "한 번이라도 연동했는가"만 뜻함 — 토큰이 나중에 죽어도(만료·계정 비활성화 등)
	    //   계속 true. 실제로 게시가 될지는 tokenValid(백엔드가 Meta 실시간 검증한 값)로 따로 봐야 한다.
	    //   상태를 아직 못 받아온 경우(s===null)는 낙관적으로 true(연동 안내 배너 등 다른 화면에 영향 안 주려고).
	    var tokenValid = s ? (s.tokenValid !== false) : true;
	    var handle = '';
	    var pic = '';
	    try {
	      handle = (s && s.handle) || localStorage.getItem('itdasy:ig_handle') || window._instaHandle || '';
	      pic = (s && (s.profile_picture_url || s.profilePic)) || localStorage.getItem('itdasy:ig_profile_pic') || '';
	    } catch (_e2) { void _e2; }
	    handle = String(handle || '').replace(/^@/, '');
	    // [출시감사 2026-07-31] 백엔드가 내려주는 권한별 가용 여부(capabilities).
	    //   Meta 심사는 권한마다 따로 통과한다 — 2026-07-31 기준 content_publish·manage_comments 는
	    //   아직 심사 중이라, 연동돼 있어도 자동 발행이 안 된다. connected 만 보고 발행 버튼을 띄우면
	    //   원장님이 누르고 실패를 보게 된다. 상태를 아직 못 받았으면(s===null) 낙관적으로 true —
	    //   기존 동작을 바꾸지 않기 위해서다(백엔드가 값을 주기 시작하면 그때부터 정확해진다).
	    var caps = (s && s.capabilities) || null;
	    var canPublish = caps ? !!caps.publish : true;
	    return {
	      connected: connected, tokenValid: tokenValid,
	      canPublish: canPublish,
	      handle: handle ? ('@' + handle) : '', profilePic: pic,
	      displayName: handle ? ('@' + handle) : ''
	    };
	  }
	  function _eyeMasks(masks, img, b) {
    var MA = window.MaskApplication;
    function ensure() { return masks || (masks = { useMasks: {}, _scale: {}, maskW: img.naturalWidth || img.width, maskH: img.naturalHeight || img.height }); }
    try {
      if ((b.lashSharp || 0) > 10 && MA && has(MA.getLashMaskSync)) { var lash = MA.getLashMaskSync(img); if (lash) { ensure().lashMask = lash.mask; masks.lashScale = lash.scale; } }
      if ((b.eyeRedness || 0) > 0 && MA && has(MA.getScleraMaskSync)) { var sc = MA.getScleraMaskSync(img); if (sc) { ensure().useMasks.scleraMask = sc.mask; masks._scale.scleraMask = sc.scale; } }
      if ((b.browSharp || 0) > 10 && MA && has(MA.getBrowMaskSync)) { var br = MA.getBrowMaskSync(img); if (br) { ensure().browMask = br.mask; masks.browScale = br.scale; } }
      // v550 — 네일은 실제 nailMask가 있을 때만 연결.
      if (((b.nailGloss || 0) > 0 || (b.nailShape || 0) > 10) && MA && has(MA.getNailMaskSync)) { var nl = MA.getNailMaskSync(img); if (nl) { ensure().useMasks.nailMask = nl.mask; masks._scale.nailMask = nl.scale; } }
      // v550 — 손 피부톤은 실제 handSkinMask가 있을 때만 연결.
      if ((b.handSkin || 0) > 0 && MA && has(MA.getHandSkinMaskSync)) { var hs = MA.getHandSkinMaskSync(img); if (hs) { ensure().useMasks.handSkinMask = hs.mask; masks._scale.handSkinMask = hs.scale; } }
    } catch (_e3) { /* eye/nail 마스크 실패 무시 — 베이스 마스크 유지 */ }
    return masks;
  }
  // [#1 FIX] 피부/헤어 마스크는 async getMasksForBeauty 로 실제 계산해서 받는다.
  //   기존 getMasksForBeautySync 는 캐시 hit 일 때만 반환 → 작업실은 재호출 루프가 없어 항상 null → 피부/헤어 무반응.
  //   maskKey(사진별)로 1회만 계산해 캐시 → 슬라이더 놓을 때마다 재계산하던 느림도 제거.
  var _maskCache = {};
  // [v779 성능] 마스크(대형 ImageData)가 사진 수만큼 무제한 쌓이던 누수 방어 — LRU 8개 캡.
  var _maskKeys = [];
  var _MASK_CAP = 8;
  function _maskSet(key, val) {
    if (!key) return;
    if (!Object.prototype.hasOwnProperty.call(_maskCache, key)) {
      _maskKeys.push(key);
      while (_maskKeys.length > _MASK_CAP) { var ev = _maskKeys.shift(); delete _maskCache[ev]; }
    }
    _maskCache[key] = val;
  }
  var MASK_TIMEOUT = 2500;   // 모델 첫 로딩 등으로 마스크가 늦으면 이번 패스는 전역 보정으로(행 방지). 다음 슬라이더에서 캐시 사용.
  function _finishMasks(base, img, b) {
    var m = base ? { useMasks: Object.assign({}, base.useMasks), _scale: Object.assign({}, base._scale), meta: base.meta, maskW: base.maskW, maskH: base.maskH } : null;
    return _eyeMasks(m, img, b);
  }
  function _strictFailures(masks, b) {
    var use = masks && masks.useMasks;
    var out = [];
    if ((b.handSkin || 0) > 0 && !(use && use.handSkinMask)) out.push('hand');
    if (((b.nailGloss || 0) > 0 || (b.nailShape || 0) > 10) && !(use && use.nailMask)) out.push('nail');
    return out;
  }
  function _beautyMasksAsync(img, b, key) {
    var MA = window.MaskApplication;
    if (!MA) return Promise.resolve(_eyeMasks(null, img, b));
    var strict = has(MA.prepareStrictMasks) ? Promise.resolve(MA.prepareStrictMasks(img, b)).catch(function () { return []; }) : Promise.resolve([]);
    // 캐시 hit → 손·네일 검출 완료를 기다린 뒤 연결.
    if (key && Object.prototype.hasOwnProperty.call(_maskCache, key)) {
      return strict.then(function () { return _finishMasks(_maskCache[key], img, b); });
    }
    // 계산 시작 — 완료되면 캐시에 저장(타임아웃돼도 백그라운드로 채워져 다음 호출에서 사용).
    var compute;
    if (has(MA.getMasksForBeauty)) compute = Promise.resolve(MA.getMasksForBeauty(img)).catch(function () { return null; }).then(function (m) { if (key) _maskSet(key, m || null); return m; });
    else compute = Promise.resolve(has(MA.getMasksForBeautySync) ? MA.getMasksForBeautySync(img) : null);
    var timed = new Promise(function (res) { setTimeout(function () { res('__t__'); }, MASK_TIMEOUT); });
    return Promise.all([Promise.race([compute, timed]), strict]).then(function (all) {
      return _finishMasks(all[0] === '__t__' ? null : all[0], img, b);
    });
  }
  // [v561] 수동 마스크(사용자가 직접 칠한 영역) 주입 — 자동 검출 마스크를 덮어쓴다.
  //   manualMasks = { maskType: <canvas> }. canvas(불투명도=마스크값)를 maskW×maskH Float32Array 로
  //   래스터화해 useMasks[type] 에 넣고 _scale=1(전강도). 검출 실패(네일 클로즈업 등)도 칠하면 적용됨.
  function _applyManualMasks(masks, manualMasks, iw, ih) {
    if (!manualMasks) return masks;
    var keys = Object.keys(manualMasks).filter(function (k) { return manualMasks[k]; });
    if (!keys.length) return masks;
    masks = masks || { useMasks: {}, _scale: {}, maskW: iw, maskH: ih };
    if (!masks.useMasks) masks.useMasks = {};
    if (!masks._scale) masks._scale = {};
    var mw = masks.maskW || iw, mh = masks.maskH || ih;
    keys.forEach(function (type) {
      try {
        var cv = manualMasks[type];
        var t = document.createElement('canvas'); t.width = mw; t.height = mh;
        var c = t.getContext('2d'); c.clearRect(0, 0, mw, mh); c.drawImage(cv, 0, 0, mw, mh);
        var id = c.getImageData(0, 0, mw, mh).data, arr = new Float32Array(mw * mh), any = false;
        for (var i = 0; i < mw * mh; i++) { var a = id[i * 4 + 3] / 255; arr[i] = a; if (a > 0.04) any = true; }
        if (any) {
          // [v566·scope3] 자동 마스크와 UNION — 수동 칠은 자동 영역을 '지우지 않고 더한다'.
          //   자동값엔 기존 강도(_scale)를 baked-in(곱해서 보존), 수동 칠 영역은 풀강도(1). 최종 _scale=1.
          var autoArr = masks.useMasks[type], autoSc = (typeof masks._scale[type] === 'number') ? masks._scale[type] : 1;
          if (autoArr && autoArr.length === arr.length) {
            for (var j = 0; j < arr.length; j++) { var av = autoArr[j] * autoSc; if (av > arr[j]) arr[j] = av; }
          }
          masks.useMasks[type] = arr; masks._scale[type] = 1;
        }
      } catch (_e) { /* 수동 마스크 1개 실패는 무시 — 나머지/자동 마스크 유지 */ }
    });
    return masks;
  }
  function _applyBeautyAdjust(opts) {
    opts = opts || {};
    if (!opts.src) return Promise.resolve({ ok: false, reason: 'no_image' });
    if (!(window.PhotoEditorBeautyEngine && has(window.PhotoEditorBeautyEngine.apply))) return Promise.resolve({ ok: false, reason: 'no_beauty_engine' });
    if (!_hasValues(opts.beauty)) return Promise.resolve({ ok: true, dataUrl: opts.src });
    return _loadImageCached(opts.src).then(function (img) {
      return _beautyMasksAsync(img, opts.beauty || {}, opts.maskKey).then(function (masks) {
        masks = _applyManualMasks(masks, opts.manualMasks, img.naturalWidth || img.width, img.naturalHeight || img.height);
        // [v539] 프리뷰 다운스케일 — 드래그/release 체감 렉의 핵심은 풀해상도(naturalW×H) 픽셀 walk.
        //   previewMaxPx 주면 긴 변을 그 값으로 줄여 처리(화면 표시는 background cover 라 동일하게 보임).
        //   마스크는 풀 dims(maskW/H) 유지 → 엔진 _maskAt 가 캔버스↔마스크 비례 매핑하므로 정합 유지.
        //   최종 저장/적용(applyEditToPhoto)은 previewMaxPx 없이 호출 → 풀해상도 품질 보존.
        var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
        var mx = opts.previewMaxPx || 0, w = iw, h = ih;
        if (mx && Math.max(iw, ih) > mx) { var s = mx / Math.max(iw, ih); w = Math.max(1, Math.round(iw * s)); h = Math.max(1, Math.round(ih * s)); }
        var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        var ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        var _t0 = (window.performance && performance.now) ? performance.now() : 0;
        window.PhotoEditorBeautyEngine.apply(ctx, cv.width, cv.height, opts.beauty || {}, false, masks);
        var _ms = _t0 ? Math.round(performance.now() - _t0) : 0;
        try { window.__photofxLast = { w: w, h: h, srcW: iw, srcH: ih, path: mx ? 'preview' : 'final', time: _ms, cacheReuse: !!(opts.maskKey && _maskCache && Object.prototype.hasOwnProperty.call(_maskCache, opts.maskKey)) }; } catch (_e2) { void _e2; }
        if (window.__ITDASY_PHOTO_DEBUG__ && _t0) { try { console.log('[photofx] apply ' + w + 'x' + h + ' (src ' + iw + 'x' + ih + ') path=' + (mx ? 'preview' : 'final') + ' time=' + _ms + 'ms'); } catch (_e) { void _e; } }
        return { ok: true, dataUrl: _encode(cv, opts.src), roiFailures: _strictFailures(masks, opts.beauty || {}) };
      });
    }).catch(function (e) { console.warn('[wsadapter] beauty', e); return { ok: false, reason: 'beauty' }; });
  }
  function _templateById(id) {
	    var MD = window.PhotoEditorTemplateMarketData;
	    if (MD && has(MD.lookupById)) return MD.lookupById(id);
	    var list = window.PhotoEditorTemplatesV2 && window.PhotoEditorTemplatesV2.TEMPLATES;
	    return Array.isArray(list) ? list.filter(function (t) { return t.id === id; })[0] : null;
	  }
	  function _templateSize(tpl) {
	    var cats = (window.PhotoEditorTemplateMarketData && window.PhotoEditorTemplateMarketData.CATS) || (window.PhotoEditorTemplatesV2 && window.PhotoEditorTemplatesV2.CATS) || [];
	    var cat = cats.filter(function (c) { return c.id === tpl.cat; })[0] || {};
	    // [#18] 스토리/릴스(9:16)만 카테고리 크기 유지 — 피드형은 사용자 '게시 크기' 선택(4:5/1:1)이 우선.
	    //   템플릿은 상대좌표 렌더라 캔버스 크기 오버라이드가 안전(premium-templates.js w*0.07 식).
	    if (cat.ratio === '9:16') return { w: cat.size[0], h: cat.size[1] };
	    var sq = false; try { sq = localStorage.getItem('itdasy:ws_format') === '11'; } catch (_e) { void _e; }
	    return sq ? { w: 1080, h: 1080 } : { w: 1080, h: 1350 };
	  }
	  function _pickPhoto(photos, role, fallbackIdx) {
	    photos = photos || [];
	    return photos.filter(function (p) { return p && p.role === role; })[0] || photos[fallbackIdx || 0] || photos[0] || null;
	  }
	  function _applyWorkspaceTemplate(opts) {
	    opts = opts || {};
	    var t = opts.template || {};
	    var found = _templateById(t.id) || t;
	    if (!found || !found.id) return Promise.resolve({ ok: false, reason: 'no_template', toast: '템플릿을 찾지 못했어요' });
	    if (!(window.PhotoEditorPremiumTemplates && has(window.PhotoEditorPremiumTemplates.renderHook))) return Promise.resolve({ ok: false, reason: 'no_renderer', toast: '템플릿 모듈을 아직 불러오지 못했어요' });
	    var photos = opts.photos || [];
	    var roleAfter = photos.filter(function (p) { return p && p.role === 'after'; })[0];
	    var roleHero = photos.filter(function (p) { return p && p.role === 'hero'; })[0];
	    var after = t.purpose === 'before_after' ? (_pickPhoto(photos, 'after', 1) || roleHero) : (roleAfter || roleHero || photos[0]);
	    var before = t.purpose === 'before_after' ? _pickPhoto(photos, 'before', 0) : null;
	    var afterSrc = after && (after.editedDataUrl || after.dataUrl);
	    var beforeSrc = before && (before.editedDataUrl || before.dataUrl);
	    if (!afterSrc) return Promise.resolve({ ok: false, reason: 'no_image', toast: '템플릿에 넣을 사진이 없어요' });
	    return Promise.all([_loadImage(afterSrc), beforeSrc ? _loadImage(beforeSrc).catch(function () { return null; }) : Promise.resolve(null)]).then(function (imgs) {
	      var bk = _brand(), size = _templateSize(found), cv = document.createElement('canvas'), ctx = null;
	      cv.width = size.w; cv.height = size.h; ctx = cv.getContext('2d');
	      _cover(ctx, imgs[0], 0, 0, cv.width, cv.height);
	      if (window.PhotoEditorPremiumTemplates.primeImage) window.PhotoEditorPremiumTemplates.primeImage(afterSrc, imgs[0]);
	      if (window.PhotoEditorBACompose && window.PhotoEditorBACompose.primeImage) window.PhotoEditorBACompose.primeImage(afterSrc, imgs[0]);
	      if (beforeSrc && imgs[1] && window.PhotoEditorBACompose && window.PhotoEditorBACompose.primeImage) window.PhotoEditorBACompose.primeImage(beforeSrc, imgs[1]);
	      var state = { originalImg: imgs[0], editedImg: imgs[0], img: imgs[0], secondImg: imgs[1],
	        tplV2: { id: found.id, label: found.label || t.label, bg: bk.primary, shopName: bk.shopName, cat: found.cat,
	          imageSlots: { main_photo: { src: afterSrc, focal: { x: 0.5, y: 0.5 }, zoom: 1 }, after_photo: { src: afterSrc, focal: { x: 0.5, y: 0.5 }, zoom: 1 }, before_photo: { src: beforeSrc || '', focal: { x: 0.5, y: 0.5 }, zoom: 1 } },
	          slotValues: { headline: found.prefillText || t.label, subtitle: t.use || found.label || '', shop_name: bk.shopName, service_name: opts.service || '', review_text: opts.caption || '', customer_label: opts.customerName || '' } } };
	      var drew = window.PhotoEditorPremiumTemplates.renderHook(ctx, cv.width, cv.height, state);
	      return drew ? { ok: true, dataUrl: _encode(cv, afterSrc), template: found } : { ok: false, reason: 'not_supported', toast: '이 템플릿은 작업실에서 아직 적용하지 못해요' };
	    }).catch(function (e) { console.warn('[wsadapter] template', e); return { ok: false, reason: 'template', toast: '템플릿 적용에 실패했어요' }; });
	  }

  var WorkspaceAdapter = {
    // 크롭 — V2 전용 모달(WorkspaceCrop). PhotoEditor 코어 미수정.
    openCrop: function (opts) {
      if (!(window.WorkspaceCrop && has(window.WorkspaceCrop.open))) { toast('크롭 모듈을 불러오지 못했어요'); return { ok: false, reason: 'no_crop' }; }
      window.WorkspaceCrop.open(opts || {});
      return { ok: true };
    },

    // 경량 보정 — 실 픽셀 워커(PhotoEditorWorkerFilter) 재사용. UI/PhotoEditor 라우팅 없음.
    //  지원: brightness/saturation/color(=temperature)/sharpness(=unsharp) = 워커, contrast = 캔버스 필터.
    //  (워커 schema: workers/photo-filter-worker.js — adjust{brightness,saturate,temperature}, unsharp{strength})
	    applyPixelAdjust: function (opts) {
      opts = opts || {};
      var a = opts.adjust || {};
      if (!opts.src) return Promise.resolve({ ok: false, reason: 'no_image' });
      return _loadImageCached(opts.src).then(function (img) {   // [이슈10] 캐시 디코드 — 반복 commit 가속
        var cv, ctx, png;
        try {
          cv = document.createElement('canvas'); cv.width = img.naturalWidth || img.width; cv.height = img.naturalHeight || img.height;
          ctx = cv.getContext('2d', { willReadFrequently: true });
          var contrast = Math.max(0, 1 + (a.contrast || 0) / 100);   // 대비: 워커 미지원 → 캔버스 필터
          var soft = (a.sharpness || 0) < 0 ? (Math.min(100, -(a.sharpness || 0)) * 0.02) : 0;  // 선명도 좌(-)=부드러움
          var cf = [];
          if (contrast !== 1) cf.push('contrast(' + contrast.toFixed(3) + ')');
          if (soft > 0) cf.push('blur(' + soft.toFixed(2) + 'px)');
          ctx.filter = cf.length ? cf.join(' ') : 'none';
          ctx.drawImage(img, 0, 0); ctx.filter = 'none';
          png = /^data:image\/png/i.test(opts.src);
        } catch (_e) { return { ok: false, reason: 'canvas' }; }
        return new Promise(function (resolve) {
          var finish = function () {
            try { resolve({ ok: true, dataUrl: png ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.92) }); }
            catch (_e2) { resolve({ ok: false, reason: 'encode' }); }
          };
          var wf = window.PhotoEditorWorkerFilter;
          if (!wf || !has(wf.adjustCanvas)) { finish(); return; }   // 워커 없으면 대비만 적용한 결과 반환
          var adj = { brightness: 100 + (a.brightness || 0) * 0.6, saturate: 100 + (a.saturation || 0) * 0.8, temperature: (a.color || 0) * 0.6 };
          wf.adjustCanvas(cv, adj).then(function () {
            var sh = Math.max(0, (a.sharpness || 0));
            if (sh > 0 && has(wf.unsharpCanvas)) { wf.unsharpCanvas(cv, sh / 100).then(finish, finish); }
            else finish();
          }, function () { finish(); });
        });
      }).catch(function () { return { ok: false, reason: 'bad_image' }; });
	    },

	    // [이슈9] 편집 진입 시 부위 마스크/모델 사전 워밍업 — 슬라이더 조작 전에 마스크가 준비되게 함.
	    //   근본 원인: 작업실은 sclera/brow/eyelash 를 sync 게터(getCachedSync)로만 조회하는데, MediaPipe(Tier2)
	    //   모델이 로드돼 있지 않으면 캐시가 영영 비어 헤어볼륨/눈썹/눈가가 전역 fallback(거의 no-op)으로 떨어진다.
	    //   여기서 모델 로드 + getMasksForBeauty(skin/hair/eye…) + 눈/눈썹/속눈썹 LAZY 마스크를 미리 트리거해
	    //   RegionMaskProvider 캐시를 채워두면, 이후 commit 의 sync 게터가 실제 Tier2 마스크를 반환한다.
	    //   전부 추가형(기존 경로 무변경)·실패 무해(휴리스틱 폴백 유지).
	    warmMasks: function (src) {
	      try {
	        if (window.MediaPipeLoader && has(window.MediaPipeLoader.load) &&
	            !(has(window.MediaPipeLoader.isReady) && window.MediaPipeLoader.isReady())) {
	          Promise.resolve(window.MediaPipeLoader.load()).catch(function () {});
	        }
	      } catch (_e) { /* ignore */ }
	      if (!src) return Promise.resolve(false);
	      return _loadImageCached(src).then(function (img) {
	        var MA = window.MaskApplication;
	        if (!MA) return false;
	        var jobs = [];
	        if (has(MA.getMasksForBeauty)) jobs.push(Promise.resolve(MA.getMasksForBeauty(img)).catch(function () { return null; }));
	        try { if (has(MA.getLashMaskSync)) MA.getLashMaskSync(img); } catch (_e2) { /* ignore */ }
	        try { if (has(MA.getScleraMaskSync)) MA.getScleraMaskSync(img); } catch (_e3) { /* ignore */ }
	        try { if (has(MA.getBrowMaskSync)) MA.getBrowMaskSync(img); } catch (_e4) { /* ignore */ }
	        return Promise.all(jobs).then(function () { return true; }).catch(function () { return false; });
	      }).catch(function () { return false; });
	    },

	    applyBeautyAdjust: _applyBeautyAdjust,
	    applyWorkspaceCorrections: function (opts) {
	      opts = opts || {};
	      if (!opts.src) return Promise.resolve({ ok: false, reason: 'no_image' });
	      var src = opts.src;
	      var base = _hasValues(opts.adjust) ? WorkspaceAdapter.applyPixelAdjust({ src: src, adjust: opts.adjust }) : Promise.resolve({ ok: true, dataUrl: src });
	      return base.then(function (r) {
	        src = (r && r.ok && r.dataUrl) ? r.dataUrl : src;
	        return _hasValues(opts.beauty) ? _applyBeautyAdjust({ src: src, beauty: opts.beauty, maskKey: opts.maskKey, previewMaxPx: opts.previewMaxPx, manualMasks: opts.manualMasks }) : { ok: true, dataUrl: src };
	      });
	    },
	    applyWorkspaceTemplate: _applyWorkspaceTemplate,

    // 배경/누끼 — PhotoEditorBgCompose.compose 순수 함수만 호출(UI 無). 실패 사유 분기.
    applyWorkspaceBgAction: function (opts) {
      opts = opts || {};
      if (!(window.PhotoEditorBgCompose && has(window.PhotoEditorBgCompose.compose))) {
        return Promise.resolve({ ok: false, reason: 'no_bg_engine', toast: '배경 엔진을 불러오지 못했어요' });
      }
      if (!opts.src) return Promise.resolve({ ok: false, reason: 'no_image', toast: '배경을 적용할 사진이 없어요' });
      if (opts.action === 'image' && !opts.bgImage) return Promise.resolve({ ok: false, reason: 'no_bg_image', toast: '배경 이미지를 먼저 선택해 주세요' });
      var bg = opts.action === 'image' ? { imageData: opts.bgImage }
        : opts.action === 'color' ? { type: 'procedural', color: opts.color || '#ffffff' }
        : opts.action === 'blur' ? { type: 'blur' } : { type: 'none' };
      return Promise.resolve(window.PhotoEditorBgCompose.compose({ srcUrl: opts.src, bg: bg, targetRatio: opts.ratio || 'original' }))
        .then(function (r) {
          if (!r) return { ok: false, reason: 'compose_empty', toast: '배경 처리에 실패했어요' };
          var url = opts.action === 'removeBg' ? (r.removedBgDataUrl || r.composedDataUrl) : (r.composedDataUrl || r.removedBgDataUrl);
          // removedBg(투명 인물 누끼)를 함께 반환 → 작업실이 배경/인물을 분리 보관해, 이후 보정을 인물에만 적용하고 재합성.
          return url ? { ok: true, dataUrl: url, removedBg: r.removedBgDataUrl || null } : { ok: false, reason: 'no_output', toast: '배경 처리 결과가 없어요' };
        }).catch(function (e) {
          // 에러 메시지 추출 — Error 면 .message, Event(이미지/네트워크 onerror) 면 .type 으로.
          var isEvent = (typeof Event !== 'undefined' && e instanceof Event) || (e && e.target && e.type && !e.message);
          var msg = isEvent ? ('event:' + (e.type || 'error')) : String((e && e.message) || e || '');
          var offline = (typeof navigator !== 'undefined' && navigator.onLine === false);
          var reason, t;
          if (/한도|429|quota/i.test(msg)) { reason = 'quota'; t = (e && e.message) || '오늘 배경 제거 한도를 다 썼어요'; }
          else if (offline) { reason = 'network'; t = '네트워크 연결을 확인해 주세요'; }
          else if (/imgly|removeBackground|_lazyImgly/i.test(msg)) { reason = 'imgly'; t = '누끼 모듈을 불러오지 못했어요 — 잠시 후 다시'; }
          else if (/누끼|배경|remove-bg|서버|HTTP|status|40\d|50\d|fetch|network/i.test(msg)) { reason = 'server_removebg'; t = '서버 누끼 처리에 실패했어요 — 잠시 후 다시'; }
          else if (/image|load|decode|invalid|unsupported|format|event:error/i.test(msg)) { reason = 'bad_image'; t = '이 사진은 배경 처리를 못 했어요 — 다른 사진으로 시도해 주세요'; }
          // 사유 특정 불가 — 꾸며내지 않고 정직하게 재시도 안내
          else { reason = 'bg_process'; t = '배경 처리에 실패했어요 — 잠시 후 다시 시도해 주세요'; }
          console.warn('[wsadapter] bg fail', reason, msg);
          return { ok: false, reason: reason, toast: t };
        });
    },

    // 캡션 — DOM 비의존 엔진. 시술 내역/맥락 없으면 안내(무작정 생성 금지).
    generateCaption: function (opts) {
      opts = opts || {};
      if (!(window.CaptionEngine && has(window.CaptionEngine.generate))) {
        return Promise.resolve({ ok: false, reason: 'no_engine', toast: '캡션 엔진을 불러오지 못했어요' });
      }
      if (!String(opts.service || opts.photo_context || '').trim()) {
        return Promise.resolve({ ok: false, reason: 'need_service', toast: '시술 내역을 먼저 입력해 주세요' });
      }
      return window.CaptionEngine.generate(opts).then(function (r) {
        // [보안감사 M-13 2026-07-26] r 이 null/undefined 면 r.caption 이 TypeError 를 던지고,
        //   그 메시지엔 'TypeError' 단어가 없어 아래 human 필터를 통과 → 개발자 에러문자열이 토스트에 노출됐다.
        r = r || {};
        if (!r.caption) return { ok: false, reason: 'empty', toast: '캡션을 만들지 못했어요 — 잠시 후 다시 시도해 주세요' };
        return { ok: true, caption: r.caption, hashtags: r.hashtags, hashtagsText: r.hashtagsText, log_id: r.log_id };
      }).catch(function (e) {
        console.warn('[wsadapter] caption', e);
        // [2026-07-22 보스] 서버가 사람 말로 이유를 줬으면 그걸 그대로 보여준다.
        //   실제 사고: Vertex AI 쿼터 소진(429)인데 화면엔 "캡션 생성에 실패했어요"만 떠서
        //   원장님이 원인을 모른 채 계속 다시 눌렀다(누를 때마다 30초 대기 + 쿼터 더 소모).
        //   _personaFetch 가 detail 을 Error.message 로 실어 보낸다. 'HTTP 500' 같은 기계 문자열만 거른다.
        var msg = String((e && e.message) || '');
        var _isJsErr = e && (e.name === 'TypeError' || e.name === 'RangeError' || e.name === 'ReferenceError');
        var human = msg && !_isJsErr && !/^HTTP\s|^\d{3}$|^401$|TypeError|NetworkError|Failed to fetch/i.test(msg);
        return { ok: false, reason: 'api', toast: human ? msg : '캡션 생성에 실패했어요 — 잠시 후 다시' };
      });
    },

    // 고객 연결 — Customer.pick (자체 오버레이 z-10800, 위에 정상 표시)
    // 고정 꼬리말(caption_template) 영속화 — PUT /shop/persona. 빈 값이면 BE가 자동첨부 생략.
    setCaptionTemplate: function (text) {
      var headers = window.authHeader ? window.authHeader() : {};
      headers['Content-Type'] = 'application/json';
      var url = (typeof window.apiUrl === 'function') ? window.apiUrl('/shop/persona') : ((window.API || '') + '/shop/persona');
      return fetch(url, { method: 'PUT', headers: headers, body: JSON.stringify({ caption_template: String(text == null ? '' : text) }) })
        .then(function (res) { return res.ok ? { ok: true } : res.json().catch(function () { return {}; }).then(function (j) { return { ok: false, toast: j.detail || ('저장 실패 (' + res.status + ')') }; }); })
        .catch(function () { return { ok: false, toast: '네트워크 오류로 저장하지 못했어요' }; });
    },

    /* [2026-07-24] AI 가 자동감지한 서명(고정 문구) — 원장님이 보고/고치고/끄게.
       백엔드엔 /persona/signature 가 있었는데 프론트가 한 번도 안 불러서, 원장님이
       자동감지 서명을 볼 수도 끌 수도 없었다(조용히 생성돼 조용히 캡션에 붙었다). */
    listSignatures: function () {
      var h = window.authHeader ? window.authHeader() : {};
      if (!h.Authorization) return Promise.resolve([]);
      var u = (typeof window.apiUrl === 'function') ? window.apiUrl('/persona/signature') : ((window.API || '') + '/persona/signature');
      return fetch(u, { headers: h })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (arr) { return Array.isArray(arr) ? arr : []; })
        .catch(function () { return []; });
    },
    // 편집하면 백엔드가 source=manual 로 바꿔 재분석이 안 덮는다(update_signature_block).
    updateSignature: function (id, content) {
      var h = window.authHeader ? window.authHeader() : {};
      if (!h.Authorization || id == null) return Promise.resolve({ ok: false });
      h['Content-Type'] = 'application/json';
      var p = '/persona/signature/' + encodeURIComponent(id);
      var u = (typeof window.apiUrl === 'function') ? window.apiUrl(p) : ((window.API || '') + p);
      return fetch(u, { method: 'PUT', headers: h, body: JSON.stringify({ content: String(content == null ? '' : content) }) })
        .then(function (r) { return { ok: !!(r && r.ok) }; })
        .catch(function () { return { ok: false }; });
    },
    // 끄기 — soft delete(active=false). 다음 재분석에 다시 안 살아난다.
    deleteSignature: function (id) {
      var h = window.authHeader ? window.authHeader() : {};
      if (!h.Authorization || id == null) return Promise.resolve({ ok: false });
      var p = '/persona/signature/' + encodeURIComponent(id);
      var u = (typeof window.apiUrl === 'function') ? window.apiUrl(p) : ((window.API || '') + p);
      return fetch(u, { method: 'DELETE', headers: h })
        .then(function (r) { return { ok: !!(r && r.ok) }; })
        .catch(function () { return { ok: false }; });
    },

    // [v779] 예약 발행 — 백엔드 /scheduled-posts. 서버가 예약시각에 content_publish 로 발행(새 Meta 권한 불필요).
    //   즉시발행(multipart)과 달리 예약 업로드는 JSON {image_data: dataURL} → 서버가 절대 URL 반환 → 예약 생성.
    // [2026-07-22 보스] 여러 장(캐러셀) 예약 지원. o.imageUrls(배열) 를 받아 한 장씩 업로드한 뒤
    //   image_urls 로 예약을 만든다. 예약 시각에 워커가 캐러셀로 올린다.
    //   o.imageUrl(단일) 도 계속 받는다 — 예전 호출부 호환.
    /* [2026-07-23 보스] 예약 목록 / 취소 — 백엔드엔 있는데 프론트가 안 쓰고 있었다.
       그래서 원장이 예약을 걸면 **막을 방법이 없었다.** 발행은 되돌릴 수 없는데 취소가 없는 건
       그 자체로 사고다. 목록도 없어서 실패한 예약을 볼 수도 없었다. */
    listScheduled: function () {
      var h = window.authHeader ? window.authHeader() : {};
      if (!h.Authorization) return Promise.resolve([]);
      var u = (typeof window.apiUrl === 'function') ? window.apiUrl('/scheduled-posts') : ((window.API || '') + '/scheduled-posts');
      return fetch(u, { headers: h })
        .then(function (r) { return r.ok ? r.json() : []; })
        .catch(function () { return []; });
    },
    cancelScheduled: function (id) {
      var h = window.authHeader ? window.authHeader() : {};
      if (!h.Authorization || id == null) return Promise.resolve({ ok: false });
      var p = '/scheduled-posts/' + encodeURIComponent(id);
      var u = (typeof window.apiUrl === 'function') ? window.apiUrl(p) : ((window.API || '') + p);
      return fetch(u, { method: 'DELETE', headers: h })
        .then(function (r) { return { ok: !!(r && r.ok) }; })
        .catch(function () { return { ok: false }; });
    },

    scheduleInstagramV2: function (o) {
      o = o || {};
      var H = function () { var h = window.authHeader ? window.authHeader() : {}; h['Content-Type'] = 'application/json'; return h; };
      var U = function (p) { return (typeof window.apiUrl === 'function') ? window.apiUrl(p) : ((window.API || '') + p); };
      var srcs = (o.imageUrls && o.imageUrls.length) ? o.imageUrls.slice(0, 10) : [o.imageUrl].filter(Boolean);
      if (!srcs.length) return Promise.resolve({ ok: false, toast: '이미지를 준비하지 못했어요' });

      // 한 장 → JPEG dataURL → 서버 업로드 → 절대 URL
      function _uploadOne(src, idx) {
        return _toJpegBlob(src, 1440, 0.86).then(function (blob) {
          if (!blob) throw { toast: (srcs.length > 1 ? (idx + 1) + '번째 ' : '') + '이미지를 준비하지 못했어요' };
          return new Promise(function (res) {
            var fr = new FileReader();
            fr.onload = function () { res(fr.result); };
            fr.onerror = function () { res(null); };
            fr.readAsDataURL(blob);
          });
        }).then(function (dataUrl) {
          if (!dataUrl || typeof dataUrl !== 'string') throw { toast: (srcs.length > 1 ? (idx + 1) + '번째 ' : '') + '이미지 변환에 실패했어요' };
          return fetch(U('/scheduled-posts/upload'), { method: 'POST', headers: H(), body: JSON.stringify({ image_data: dataUrl }) })
            .then(function (r) { return r.ok ? r.json() : r.json().catch(function () { return {}; }).then(function (j) { throw { toast: j.detail || ('이미지 업로드 실패 (' + r.status + ')') }; }); })
            .then(function (up) { return up.url; });
        });
      }

      // 순차 업로드 — 여러 장을 동시에 올리면 모바일 회선에서 서로 잡아먹어 더 잘 실패한다.
      var urls = [];
      var chain = srcs.reduce(function (p, src, idx) {
        return p.then(function () { return _uploadOne(src, idx); }).then(function (u) { urls.push(u); });
      }, Promise.resolve());

      return chain.then(function () {
        return fetch(U('/scheduled-posts'), { method: 'POST', headers: H(), body: JSON.stringify({
          image_url: urls[0], image_urls: urls, caption: String(o.caption || ''),
          hashtags: (o.hashtags || []).join(','), scheduled_at: o.scheduledAt,
        }) }).then(function (r2) { return r2.ok ? { ok: true, count: urls.length } : r2.json().catch(function () { return {}; }).then(function (j) { return { ok: false, toast: j.detail || ('예약 저장 실패 (' + r2.status + ')') }; }); });
      }).catch(function (e) { return { ok: false, toast: (e && e.toast) || '예약에 실패했어요 — 잠시 후 다시' }; });
    },

    // [P1 학습 루프 2026-07-10] 발행한 최종 캡션을 학습에 반영 — PATCH /persona/generation_logs/{id}
    //   published=true 면 백엔드가 final_text 를 PastPost 로 역반입해 few-shot/fingerprint 학습에 씀. 실패해도 조용히.
    recordPublishedCaption: function (logId, finalText, igMediaId) {
      if (!logId) return Promise.resolve({ ok: false });
      var headers = window.authHeader ? window.authHeader() : {};
      headers['Content-Type'] = 'application/json';
      var path = '/persona/generation_logs/' + logId;
      var url = (typeof window.apiUrl === 'function') ? window.apiUrl(path) : ((window.API || '') + path);
      var body = { final_text: String(finalText == null ? '' : finalText).slice(0, 3000), published: true };
      if (igMediaId) body.ig_media_id = String(igMediaId);
      return fetch(url, { method: 'PATCH', headers: headers, body: JSON.stringify(body) })
        .then(function (res) { return { ok: !!(res && res.ok) }; })
        .catch(function () { return { ok: false }; });
    },

    // [피드 미리보기 2026-07-10] 최근 인스타 게시물 썸네일 — 발행 전 '내 피드에 어떻게 들어가는지' 그리드용.
    //   저장소 안 씀: 메모리(_igMediaCache)+sessionStorage 캐시라 켜자마자 즉시. GET /instagram/recent-media.
    recentMedia: function (force) {
      var self = this;
      try {
        if (!force && Array.isArray(self._igMediaCache)) return Promise.resolve(self._igMediaCache);
        if (!force) { var s = sessionStorage.getItem('itdasy:ig_recent_media'); if (s) { self._igMediaCache = JSON.parse(s) || []; return Promise.resolve(self._igMediaCache); } }
      } catch (_e) { void _e; }
      var headers = window.authHeader ? window.authHeader() : {};
      var path = '/instagram/recent-media?limit=12';
      var url = (typeof window.apiUrl === 'function') ? window.apiUrl(path) : ((window.API || '') + path);
      return fetch(url, { method: 'GET', headers: headers })
        .then(function (r) { return r && r.ok ? r.json() : { media: [] }; })
        .then(function (j) {
          var m = (j && Array.isArray(j.media)) ? j.media : [];
          self._igMediaCache = m;
          try { sessionStorage.setItem('itdasy:ig_recent_media', JSON.stringify(m)); } catch (_e) { void _e; }
          return m;
        })
        .catch(function () { return self._igMediaCache || []; });
    },
    recentMediaCached: function () {
      if (Array.isArray(this._igMediaCache)) return this._igMediaCache;
      try { var s = sessionStorage.getItem('itdasy:ig_recent_media'); if (s) { this._igMediaCache = JSON.parse(s) || []; return this._igMediaCache; } } catch (_e) { void _e; }
      return [];
    },

    pickCustomer: function (selectedId) {
      if (!(window.Customer && has(window.Customer.pick))) {
        return Promise.resolve({ ok: false, reason: 'no_customer', toast: '고객 모듈을 불러오지 못했어요' });
      }
      return Promise.resolve(window.Customer.pick({ selectedId: selectedId || null })).then(function (picked) {
        if (!picked || picked.id == null) return { ok: false, reason: 'cancel' };
        // [v779] 방문횟수 전달 — 없으면 connect 가 항상 '첫 방문/0회'로 오표시했다(재방문 고객인데).
        return { ok: true, id: picked.id, name: picked.name, vc: picked.visit_count || picked.vc || 0 };
      });
    },

    // 최근 고객(실데이터) — Customer.list (SWR 캐시). 없으면 [] → V2 가 empty-state 표시. 데모데이터 없음.
    recentCustomers: function (limit) {
      if (!(window.Customer && has(window.Customer.list))) return Promise.resolve([]);
      return Promise.resolve(window.Customer.list()).then(function (items) {
        items = Array.isArray(items) ? items.slice() : [];
        items.sort(function (a, b) { return new Date((b && b.last_visit_at) || 0) - new Date((a && a.last_visit_at) || 0); });
        return items.slice(0, limit || 5).map(function (c) {
          var vc = c.visit_count || 0;
          var sub = [c.phone || '', (vc ? vc + '회' : '')].filter(Boolean).join(' · ');
          return { id: c.id, n: c.name, p: sub, vc: vc };
        });
      }).catch(function () { return []; });
    },

    // 인스타 게이트 — 연결 안 됐으면 실제 업로드 노출 금지
	    instagram: function () {
	      var _p = _igProfile();
	      // [버그수정] tokenValid 를 여기서 안 내려주면 publish() 게이트가 undefined(=falsy)를 보고
	      //   정상 연결까지 전부 '연동 끊김'으로 막아버림 — _igProfile() 전체 결과를 그대로 전달.
	      return {
	        connected: _p.connected, tokenValid: _p.tokenValid,
	        canPublish: _p.canPublish,   // [출시감사 2026-07-31] content_publish 심사 통과 여부
	        next: _p.connected ? 'publish' : 'prepare'
	      };
	    },
	    instagramProfile: _igProfile,
    // [Phase 5-2] V2 전용 실게시 — 레거시 baCanvas/previewFinalCaption/_captionSlotId 의존 제거.
    //  저장된 slot 의 이미지(dataUrl)→blob→/instagram/publish-file. 서버 200 + body 성공마커 확인 시에만 ok.
    //  성공 애매(200이나 마커 없음) → reason:'ambiguous' (호출부에서 게시 준비까지만 처리).
	    publishInstagramV2: function (opts) {
	      opts = opts || {};
	      if (!_igProfile().connected) return Promise.resolve({ ok: false, reason: 'not_connected' });
      if (!has(window.apiFetch)) return Promise.resolve({ ok: false, reason: 'api' });
      var kind = opts.kind || 'feed';
      // 공통 응답 파서 + POST
      /* [출시 QA 2026-08-07] Meta 에러를 **사람 말로** 바꾼다.
         실측: 토큰만료·InvalidToken·권한취소·OAuthError·RateLimit 5종 전부
           "서버가 업로드를 거부했어요 — [object Object]"
         `data.error` 가 Meta 형식({error:{message,code,error_subcode}})이라 객체인데
         문자열로 이어붙여서 `[object Object]` 가 그대로 원장님께 보였다. 게다가 5종이
         **같은 문구**라 무엇을 해야 하는지 알 수 없다 — 토큰 만료는 '다시 연결'이
         유일한 해결인데 "잠시 후 다시"만 반복하게 된다. */
      var _metaMsg = function (err) {
        if (!err) return '';
        if (typeof err === 'string') return err;
        var e = err.error || err;              // {error:{...}} 또는 {...}
        var code = Number(e.code), sub = Number(e.error_subcode);
        // 재연결이 필요한 부류 — 여기서만 행동을 지시한다.
        if (code === 190 || code === 102 || sub === 458 || sub === 463 || sub === 467) {
          return '인스타 로그인이 만료됐어요 — 연동관리에서 다시 연결해 주세요';
        }
        if (code === 200 || code === 10 || code === 3) {
          return '인스타 게시 권한이 없어요 — 연동관리에서 권한을 다시 허용해 주세요';
        }
        if (code === 4 || code === 17 || code === 32 || code === 613) {
          return '인스타 요청 한도를 넘었어요 — 30분쯤 뒤에 다시 시도해 주세요';
        }
        var m = e.message || e.detail || e.error_user_msg || '';
        return typeof m === 'string' ? m : '';
      };
      // 원인별 안내는 **그 문장만** 보여준다(앞에 "서버가 업로드를 거부했어요 —" 를 붙이면
      //   정작 해야 할 일이 뒤로 밀린다). userFacing 이 그 표식이다.
      var _ACTIONABLE = /다시 연결|권한을 다시|한도를 넘었어요/;
      var _fail = function (data, res) {
        var d = _metaMsg(data && (data.error || data.detail));
        if (d) return { ok: false, reason: 'server', detail: d, userFacing: _ACTIONABLE.test(d) };
        var raw = data && data.detail;
        if (typeof raw === 'string' && raw) return { ok: false, reason: 'server', detail: raw };
        return { ok: false, reason: 'server', detail: 'HTTP ' + (res ? res.status : '?') };
      };
      var _parse = function (res) {
        return Promise.resolve(res.json().catch(function () { return {}; })).then(function (data) {
          data = data || {};
          if (!res.ok) return _fail(data, res);
          if (data.error || data.detail) return _fail(data, res);
          var ok = data.ok === true || data.success === true || data.published === true ||
            data.id || data.media_id || data.permalink || data.status === 'published' || data.status === 'success';
          return ok ? { ok: true, data: data } : { ok: false, reason: 'ambiguous' };
        });
      };
      var _post = function (endpoint, fd) {
        // [fix] 인스타 발행(특히 여러장 캐러셀)은 컨테이너 순차 폴링으로 오래 걸림 → 타임아웃 120초로 상향(기본 20초는 abort→조용히 실패).
        return window.apiFetch(endpoint, { method: 'POST', headers: (has(window.authHeader) ? window.authHeader() : {}), body: fd, itdasyTimeoutMs: 120000 })
          .then(_parse).catch(function (e) { console.warn('[wsadapter] publishV2', e); return { ok: false, reason: 'api' }; });
      };
      // [캐러셀] 여러 장 → publish-carousel-file (images 다중 + caption)
      if (kind === 'carousel') {
        var urls = (opts.imageUrls || []).filter(Boolean);
        if (urls.length < 2) return Promise.resolve({ ok: false, reason: 'need_multi' });
        // [#3] 각 장을 클라이언트에서 JPEG(축소)로 변환해 보냄 — PNG 원본은 합계 용량이 커 업로드가 rejection 됐다.
        return Promise.all(urls.map(function (u) { return _toJpegBlob(u); }))
          .then(function (blobs) {
            blobs = blobs.filter(Boolean);
            if (blobs.length < 2) return { ok: false, reason: 'blob' };
            var fd = new FormData();
            blobs.forEach(function (b, i) { fd.append('images', b, 'itdasy_carousel_' + i + '.jpg'); });
            fd.append('caption', opts.caption || '');
            // [계정 태그 2026-07-14] 캐러셀도 태그 전송 — 기존엔 여기서 안 보내서(그리고 flow 도 feed 일 때만 만들어서)
            //   여러 장 발행 시 계정 태그가 에러 없이 조용히 사라졌다. 백엔드가 커버(첫 장) child 에 적용.
            if (opts.userTags && opts.userTags.length) { try { fd.append('user_tags', JSON.stringify(opts.userTags)); } catch (_e) { void _e; } }
            // [P2-H1] 재시도해도 같은 키 → 서버가 재발행 안 하고 이전 결과를 준다(공개 중복 게시 방지).
            if (opts.idempotencyKey) fd.append('idempotency_key', opts.idempotencyKey);
            return _post('/instagram/publish-carousel-file', fd);
          });
      }
      // [피드/스토리] 단일 이미지
      if (!opts.imageUrl) return Promise.resolve({ ok: false, reason: 'blob' });
      var _isStory = kind === 'story';   // 스토리=캡션 없음, media_type=STORIES
      var _endpoint = _isStory ? '/instagram/publish-story-file' : '/instagram/publish-file';
      // [속도 2026-07-14] 캐러셀과 동일하게 JPEG 변환 후 전송.
      //   기존 단일 경로만 원본 blob 을 그대로 올려, 편집/합성본이 PNG 로 나오는 경로(flow:2734·3106)에선
      //   1080x1350 PNG = 수 MB 를 업로드해 30초~1분씩 걸렸다. (캐러셀은 [#3] 에서 이미 _toJpegBlob 적용)
      //   인스타는 어차피 투명도를 버리고 JPEG 로 재인코딩하므로 화질 손실 없이 용량만 줄어든다.
      return Promise.resolve(_toJpegBlob(opts.imageUrl))
        .then(function (blob) {
          if (!blob) return { ok: false, reason: 'blob' };
          var fd = new FormData();
          fd.append('image', blob, _isStory ? 'itdasy_story.jpg' : 'itdasy_v2.jpg');
          if (!_isStory) fd.append('caption', opts.caption || '');
          // [계정 태그] 피드에서만 — user_tags: [{username,x,y}]
          if (!_isStory && opts.userTags && opts.userTags.length) { try { fd.append('user_tags', JSON.stringify(opts.userTags)); } catch (_e) { void _e; } }
          // [P2-H1] 피드만 — 스토리는 24h 휘발이라 백엔드에 키를 안 받는다.
          if (!_isStory && opts.idempotencyKey) fd.append('idempotency_key', opts.idempotencyKey);
          return _post(_endpoint, fd);
        });
    },
    connectInstagram: function () { if (has(window.connectInstagram)) { window.connectInstagram(); return { ok: true }; } return { ok: false, reason: 'no_fn' }; },
    copyText: function (text) {
      // [보안감사 L-9 2026-07-26] writeText 를 await 안 하고 성공 토스트를 선표시 → 권한 거부 시 오안내였다.
      //   실제 결과(성공/실패)에 맞춰 토스트를 띄운다.
      try {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text || '')
            .then(function () { toast('캡션을 복사했어요'); })
            .catch(function () { toast('복사에 실패했어요 — 길게 눌러 복사해 주세요'); });
          return { ok: true };
        }
      } catch (_e) { /* ignore */ }
      return { ok: false, reason: 'no_clipboard' };
    },
    // [출시감사 2026-08-01 P0] 예전엔 `<a download>` 하나로 끝내고 try 블록만 통과하면
    //   무조건 toast('이미지를 저장했어요') + ok:true 였다. 그런데 **네이티브 WebView
    //   (iOS WKWebView·Android Capacitor)는 `<a download>` 로 data:/blob: 를 저장하지 못한다.**
    //   → 사진첩에도 파일 앱에도 아무것도 안 남는데 "저장했어요" 가 뜨고,
    //     곧바로 "게시했나요?" 시트까지 떠서 원장님은 저장된 줄 알고 앱을 닫는다.
    //     나중에 인스타에 올리려고 사진첩을 열면 사진이 없다.
    //   Meta 발행 심사 중엔 발행 버튼이 숨겨져(_publishBlock) 이 저장이 작업실의
    //   **유일한 출구**라 더 치명적이다.
    //   같은 레포 app-gallery-finish.js:290 이 이미 올바른 패턴(navigator.share + canShare)을
    //   쓰고 있었고 @capacitor/share 도 설치돼 있다 — 여기만 안 쓰고 있었다.
    //   Promise 를 반환하도록 바꿨지만 호출부는 반환값을 안 쓰므로 호환된다(아래 확인함).
    saveImage: function (dataUrl, name) {
      if (!dataUrl) return Promise.resolve({ ok: false, reason: 'no_image' });
      var fname = (name || 'itdasy') + '.jpg';

      // 1) 파일 공유 시트 — 네이티브에서 사진첩에 실제로 저장되는 유일한 경로
      var viaShare = function () {
        if (!(navigator.share && navigator.canShare)) return Promise.resolve(false);
        return fetch(dataUrl)
          .then(function (r) { return r.blob(); })
          .then(function (blob) {
            var files = [new File([blob], fname, { type: blob.type || 'image/jpeg' })];
            if (!navigator.canShare({ files: files })) return false;
            return navigator.share({ files: files, title: '사진 저장' }).then(function () { return true; });
          })
          .catch(function (e) {
            // 사용자가 공유 시트를 닫은 건 실패가 아니다 — 성공 토스트만 안 띄운다.
            if (e && e.name === 'AbortError') return 'aborted';
            return false;
          });
      };

      return viaShare().then(function (shared) {
        if (shared === true) { toast('사진을 저장했어요'); return { ok: true, via: 'share' }; }
        if (shared === 'aborted') return { ok: false, reason: 'aborted' };

        // 2) 웹 폴백 — 데스크톱/모바일 브라우저에선 이게 정상 동작한다.
        var isNative = false;
        try { isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (_e) { void _e; }
        if (isNative) {
          // 네이티브인데 공유까지 막혔으면 저장할 방법이 없다. **거짓 성공을 띄우지 않는다.**
          toast('사진을 저장하지 못했어요 — 화면을 길게 눌러 저장해 주세요');
          return { ok: false, reason: 'native_no_share' };
        }
        try {
          var a = document.createElement('a');
          a.href = dataUrl; a.download = fname;
          document.body.appendChild(a); a.click(); a.remove();
          toast('사진을 저장했어요');
          return { ok: true, via: 'download' };
        } catch (_e2) {
          toast('사진을 저장하지 못했어요');
          return { ok: false, reason: 'download_failed' };
        }
      });
    },

    // 가격표 — 전용 OCR 흐름 (사진 편집/홍보 흐름과 분리)
    openPriceList: function () {
      if (has(window.openPricelistUpload)) { window.openPricelistUpload(); return { ok: true }; }
      return { ok: false, reason: 'not_impl', toast: '가격표 기능을 불러오지 못했어요' };
    },

    // 작업실 저장 — saveSlotToDB + saveToGallery(dedupeKey). base64 중복 저장 안 함(slot.photos 그대로).
    saveItem: function (slot) {
      if (!has(window.saveSlotToDB)) return Promise.resolve({ ok: false, reason: 'no_db' });
      return Promise.resolve(window.saveSlotToDB(slot)).then(function () {
        if (has(window.saveToGallery)) { try { window.saveToGallery(slot); } catch (_e) { /* ignore */ } }
        return { ok: true };
      }).catch(function (e) { console.warn('[wsadapter] save', e); return { ok: false, reason: 'db' }; });
    },
  };

  window.WorkspaceAdapter = WorkspaceAdapter;
})();
