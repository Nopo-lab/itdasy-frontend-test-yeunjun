/* workspace/blob-url.js — 표시용 dataURL → blob URL 캐시 (P0-1, 2026-07-20)

   문제: 작업실 썸네일/미리보기가 큰 base64 dataURL 을 innerHTML 문자열에
     그대로 박아넣어, 리렌더될 때마다 브라우저가 그 거대한 base64 를 재파싱·재디코드했다.
     사진 여러 장이면(홈 피드 그리드·레이아웃 갤러리·편집기 사진 픽커) 체감 버벅임.

   해법: dataURL 을 한 번만 Blob 으로 디코드해 URL.createObjectURL 로 짧은
     blob: URL 을 만들고, dataURL 문자열을 키로 메모이즈한다.
     → innerHTML 엔 megabyte 대신 ~50자 blob: URL 만 들어가고,
       같은 blob URL 은 브라우저가 디코드된 이미지를 재사용한다.

   ⚠️ 표시(background-image / <img src>) 전용. 합성·저장·업로드 경로엔 쓰지 말 것 —
     blob URL 은 revoke 되거나 새로고침하면 죽으므로, 직렬화·persist 되는 값이면 안 된다.
     disp() 는 dataURL 이 아닌 값(http·blob·상대경로·빈값)은 그대로 돌려주므로,
     렌더 함수 어디서 호출해도 안전하다(비-dataURL 은 no-op).

   메모리: dataURL 당 blob 1개(바이너리 ~0.75×). 세션 중 편집으로 editedDataUrl 이
     바뀌면 옛 버전은 LRU 로 밀려나며 revoke 된다(누수 방지). MAX 는 한 화면이 쓰는
     고유 사진 수보다 훨씬 크게 잡아(같은 렌더 배치의 URL 을 실수로 회수하지 않게). */
(function () {
  'use strict';
  if (window.WSBlobUrl) return;

  var MAX = 192;                 // 캐시 상한 — 한 화면 고유 사진 수(수십)보다 훨씬 큼
  var _cache = new Map();        // dataUrl(string) → blobUrl(string)
  var _order = [];               // dataUrl 삽입 순서(LRU)

  // 환경 지원 여부 — jest(node)·구형 웹뷰에서 없으면 통째로 no-op(항상 원본 반환).
  var _supported = (function () {
    try {
      return typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' &&
             typeof Blob !== 'undefined' && typeof atob === 'function' && typeof Uint8Array === 'function';
    } catch (_e) { return false; }
  })();

  function _isDataUrl(u) { return typeof u === 'string' && u.lastIndexOf('data:', 0) === 0; }

  function _toBlob(dataUrl) {
    var comma = dataUrl.indexOf(',');
    if (comma < 0) return null;
    var meta = dataUrl.slice(5, comma);                 // 예: "image/png;base64"
    var mime = (meta.split(';')[0]) || 'application/octet-stream';
    var body = dataUrl.slice(comma + 1);
    var bytes;
    if (/;base64/i.test(meta)) {
      var bin = atob(body);
      bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      // base64 아닌 dataURL(예: data:image/svg+xml,...) — URL 인코딩 해제 후 UTF-8 바이트로.
      var text = decodeURIComponent(body);
      if (typeof TextEncoder === 'function') {
        bytes = new TextEncoder().encode(text);
      } else {
        bytes = new Uint8Array(text.length);
        for (var j = 0; j < text.length; j++) bytes[j] = text.charCodeAt(j) & 0xff;
      }
    }
    return new Blob([bytes], { type: mime });
  }

  /** 표시용 URL 로 변환. dataURL 이면 (메모이즈된) blob URL, 그 외엔 원본 그대로. */
  function disp(url) {
    if (!_supported || !_isDataUrl(url)) return url;
    var hit = _cache.get(url);
    if (hit) return hit;
    var blob = null, blobUrl;
    try { blob = _toBlob(url); } catch (_e) { blob = null; }
    if (!blob) return url;                               // 파싱 실패 → 안전하게 원본 dataURL
    try { blobUrl = URL.createObjectURL(blob); }
    catch (_e2) { return url; }
    _cache.set(url, blobUrl);
    _order.push(url);
    // LRU 회수 — 방금 만든 항목은 절대 회수하지 않는다(같은 렌더 배치 안전).
    while (_order.length > MAX) {
      var old = _order.shift();
      if (old === url) { _order.push(old); break; }
      var bu = _cache.get(old);
      if (bu) { try { URL.revokeObjectURL(bu); } catch (_e3) { void _e3; } _cache.delete(old); }
    }
    return blobUrl;
  }

  /* [2026-10-01 flow-workspace-photo-07] 세션이 끝난 사진의 blob URL 을 돌려준다(revoke).
     왜: MAX(192) 는 '한 화면' 기준이라 작업실을 열고 닫는 동안엔 한 번도 안 찬다. 사진 5장 → 합성 → 닫기를 반복하면
     라운드마다 사진·합성본 blob URL 이 10개씩 남고, 브라우저는 blob URL 이 살아 있는 한 **디코드한 비트맵·원본 바이트**를
     버리지 못한다(실측 renderer RSS 630 → 744 → 794MB, JS 힙은 16MB 평탄). 닫을 때 그 세션의 dataURL 만 돌려주면
     다음 렌더가 같은 dataURL 을 만나도 새 blob URL 을 만들 뿐이라 안전하다(표시 전용 캐시 계약 그대로).
     opts.keepInUse: true 면 지금 문서에 그려져 있는 URL(홈 썸네일 등)은 남긴다 — 끊어진 이미지 방지.
     opts.except: 그 요소 안의 참조는 '그려져 있음' 으로 치지 않는다(닫힌 플로우의 숨은 화면 — 다음에 열 때 새로 그린다). */
  function _inUse(blobUrl, except) {
    try {
      if (typeof document === 'undefined' || !document.querySelectorAll) return false;
      var q = '[style*="' + blobUrl + '"],[src="' + blobUrl + '"]';
      var ns = document.querySelectorAll(q);
      for (var i = 0; i < ns.length; i++) { if (!(except && except.contains && except.contains(ns[i]))) return true; }
      return false;
    } catch (_e) { return false; }
  }
  function release(dataUrls, opts) {
    opts = opts || {};
    var n = 0;
    (dataUrls || []).forEach(function (u) {
      if (!_isDataUrl(u)) return;
      var bu = _cache.get(u);
      if (!bu) return;
      if (opts.keepInUse && _inUse(bu, opts.except)) return;
      try { URL.revokeObjectURL(bu); } catch (_e) { void _e; }
      _cache.delete(u);
      var i = _order.indexOf(u); if (i >= 0) _order.splice(i, 1);
      n++;
    });
    return n;
  }
  function size() { return _cache.size; }

  window.WSBlobUrl = { disp: disp, release: release, size: size, _internals: { _isDataUrl: _isDataUrl, _toBlob: _toBlob, MAX: MAX } };
})();
