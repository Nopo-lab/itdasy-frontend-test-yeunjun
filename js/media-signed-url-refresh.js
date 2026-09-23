/* Private Supabase 이미지 임시 주소 자동 갱신 (T-915)

   저장소는 public 으로 되돌리지 않는다. 로그인한 앱이 보고 있는 이미지가
   만료되기 전에 서버에 새 signed URL 을 요청한다. 서버가 다시 한 번
   `{user_id}/...` 소유권을 확인하므로, 프론트는 전체 권한을 갖지 않는다. */
(function () {
  'use strict';

  var REFRESH_INTERVAL_MS = 30 * 60 * 1000;
  var ACTIVE_WINDOW_MS = 10 * 60 * 1000;
  var MIN_IMAGE_GAP_MS = 25 * 60 * 1000;
  var lastActivityAt = Date.now();
  var pendingByUrl = new Map();

  function now() { return Date.now(); }

  function isManagedUrl(url) {
    if (!/^https?:\/\//i.test(String(url || ''))) return false;
    try {
      var u = new URL(url, location.href);
      return /\.supabase\.co$/i.test(u.hostname)
        && /\/storage\/v1\/(?:object\/(?:public|sign|authenticated)|render\/image\/sign)\//.test(u.pathname);
    } catch (_e) {
      return false;
    }
  }

  function isActive() {
    return !document.hidden && (now() - lastActivityAt) <= ACTIVE_WINDOW_MS;
  }

  function touch() { lastActivityAt = now(); }

  function currentImageUrl(img) {
    return (img && (img.currentSrc || img.src || img.getAttribute('src'))) || '';
  }

  async function requestFreshUrl(url) {
    if (!isManagedUrl(url)) return '';
    if (pendingByUrl.has(url)) return pendingByUrl.get(url);
    var job = (async function () {
      if (typeof window.apiFetch !== 'function') return '';
      var res = await window.apiFetch('/image/signed-url', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, window.authHeader ? window.authHeader() : {}),
        body: JSON.stringify({ url: url }),
      });
      if (!res || !res.ok) return '';
      var data = await res.json();
      return (data && typeof data.url === 'string') ? data.url : '';
    })().catch(function () { return ''; }).finally(function () {
      pendingByUrl.delete(url);
    });
    pendingByUrl.set(url, job);
    return job;
  }

  async function refreshImage(img, options) {
    if (!img || !img.isConnected) return false;
    var src = currentImageUrl(img);
    if (!isManagedUrl(src)) return false;
    if (!options || options.force !== true) {
      var last = Number(img.dataset.msurAt || 0);
      if (last && (now() - last) < MIN_IMAGE_GAP_MS) return true;
    }
    img.dataset.msurAt = String(now());
    var fresh = await requestFreshUrl(src);
    if (!fresh || !img.isConnected || fresh === currentImageUrl(img)) return false;
    img.dataset.msurSrc = fresh;
    img.dataset.mfSrc = fresh;
    img.src = fresh;
    return true;
  }

  function visibleImages() {
    return Array.prototype.filter.call(document.images || [], function (img) {
      if (!isManagedUrl(currentImageUrl(img))) return false;
      var rect = img.getBoundingClientRect ? img.getBoundingClientRect() : null;
      if (!rect) return true;
      return rect.bottom >= -200 && rect.top <= (window.innerHeight || 0) + 200;
    });
  }

  function refreshVisibleImages(options) {
    if (!isActive() && !(options && options.force)) return;
    visibleImages().slice(0, 80).forEach(function (img) {
      refreshImage(img, options);
    });
  }

  ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach(function (eventName) {
    window.addEventListener(eventName, touch, { passive: true });
  });
  window.addEventListener('focus', function () {
    touch();
    refreshVisibleImages({ force: true });
  });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      touch();
      refreshVisibleImages({ force: true });
    }
  });
  window.setInterval(refreshVisibleImages, REFRESH_INTERVAL_MS);

  window.MediaSignedUrlRefresh = {
    _isManagedUrl: isManagedUrl,
    _requestFreshUrl: requestFreshUrl,
    refreshImage: refreshImage,
    refreshVisibleImages: refreshVisibleImages,
  };
})();
