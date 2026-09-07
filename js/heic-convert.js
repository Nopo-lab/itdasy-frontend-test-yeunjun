/* HEIC → JPEG 자동 변환 유틸 (2026-06-10)
   아이폰 기본 카메라 포맷(HEIC/HEIF)은 브라우저 <img>/canvas 에서 디코딩 불가 →
   기존엔 "사진을 불러오지 못했어요"로 끝나던 것을, heic2any(CDN 지연 로드)로
   업로드 시점에 JPG 변환해서 사장님은 그냥 되는 경험.

   사용처: app-gallery-workshop.js(작업실 업로드/드롭) ·
           js/assistant/pending-photos.js(잇비 챗 사진 첨부)
   비용 방어: 변환은 100% 클라이언트(라이브러리 ~300KB, HEIC 만났을 때 1회만 로드). */
(function () {
  'use strict';

  const HEIC_EXT_RE = /\.(heic|heif)$/i;
  const CDN_URL = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';

  function isHeic(file) {
    if (!file) return false;
    const t = (file.type || '').toLowerCase();
    if (t.indexOf('image/heic') === 0 || t.indexOf('image/heif') === 0) return true;
    /* 브라우저/웹뷰가 HEIC 의 MIME 을 제대로 안 주는 경우 → 확장자로 폴백 판별.
       [미디어감사 2026-09-07] 예전엔 `!t`(MIME 이 **완전히 빈** 경우)만 폴백했다.
       그런데 MIME 을 비워서 주는 웹뷰도 있고 `application/octet-stream` 으로 주는 웹뷰도 있다.
       후자는 폴백을 못 타서 변환 없이 <img>/canvas 로 넘어가 "사진을 불러오지 못했어요" 로 끝났고,
       드래그앤드롭(app-gallery-workshop.js:291)에서는 `type.startsWith('image/')` 도 실패해
       **아무 안내 없이 목록에서 사라졌다.** 이미지 MIME 이 아닌데 확장자가 HEIC 면 HEIC 로 본다. */
    if (t.indexOf('image/') === 0) return false;   // 이미 다른 이미지 포맷이면 건드리지 않는다
    return HEIC_EXT_RE.test(file.name || '');
  }

  let _libPromise = null;
  function _loadLib() {
    if (window.heic2any) return Promise.resolve();
    if (_libPromise) return _libPromise;
    _libPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = CDN_URL;
      s.onload = () => resolve();
      s.onerror = () => { _libPromise = null; reject(new Error('heic2any CDN 로드 실패')); };
      document.head.appendChild(s);
    });
    return _libPromise;
  }

  /* HEIC 면 JPEG File 로 변환, 아니면 원본 그대로. 실패 시 throw (호출자가 해당 파일 스킵). */
  async function toJpeg(file) {
    if (!isHeic(file)) return file;
    if (window.showToast) window.showToast('아이폰 사진 변환 중…');
    await _loadLib();
    const out = await window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
    const blob = Array.isArray(out) ? out[0] : out;
    const base = String(file.name || 'photo').replace(HEIC_EXT_RE, '');
    return new File([blob], base + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified || Date.now() });
  }

  /* 여러 장 일괄 — 변환 실패한 파일은 안내 토스트 1회 후 목록에서 제외. */
  async function normalizeAll(files) {
    const out = [];
    let failed = 0;
    for (const f of Array.from(files || [])) {
      try { out.push(await toJpeg(f)); }
      catch (e) { failed++; console.warn('[heic] 변환 실패:', f && f.name, e && e.message); }
    }
    if (failed && window.showToast) {
      window.showToast('아이폰 사진(HEIC) 변환에 실패했어요 — 아이폰 설정 > 카메라 > 포맷을 "높은 호환성"으로 바꿔보세요');
    }
    return out;
  }

  window.HeicConvert = { isHeic, toJpeg, normalizeAll };
})();
