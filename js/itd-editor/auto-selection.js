/* No photo upload or API key. Public model/runtime are bundled static app files. */
(function () {
  'use strict';
  var script = document.currentScript.src, cache = new WeakMap();
  function run(img) {
    return new Promise(function (resolve, reject) {
      var workerUrl = new URL('selection-worker.js', script); workerUrl.search = new URL(script).search;
      var worker = new Worker(workerUrl), timer;
      function finish(error, result) { clearTimeout(timer); worker.terminate(); if (error) reject(error); else resolve(result); }
      timer = setTimeout(function () { finish(new Error('자동 선택 시간이 초과됐어요. 다시 시도하거나 브러시로 선택해 주세요.')); }, 45000);
      worker.onerror = function (e) { finish(new Error(e.message || '이 기기에서 자동 선택을 실행하지 못했어요.')); };
      worker.onmessage = function (e) { finish(e.data.error ? new Error(e.data.error) : null, e.data); };
      var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, scale = Math.min(1, 512 / Math.max(w, h));
      createImageBitmap(img, { resizeWidth: Math.max(1, Math.round(w * scale)), resizeHeight: Math.max(1, Math.round(h * scale)) }).then(function (bitmap) { worker.postMessage({ bitmap: bitmap }, [bitmap]); }).catch(function (e) { finish(e); });
    });
  }
  function select(img) {
    if (!cache.has(img)) cache.set(img, run(img).catch(function (e) { cache.delete(img); throw e; }));
    return cache.get(img);
  }
  function mask(result, kind) { return { w: result.w, h: result.h, data: window.ItdRegionEngine.encode(result[kind]) }; }
  window.ItdAutoSelection = { select: select, mask: mask };
})();
