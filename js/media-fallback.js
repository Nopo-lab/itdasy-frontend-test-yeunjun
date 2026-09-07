/* 사진이 안 열릴 때의 마지막 방어선 (2026-09-07 미디어감사)

   문제였던 것 — 미디어 <img> 에 onerror 가 **한 곳도 없다.**
   포트폴리오 그리드(app-portfolio.js:236·299·508)·작업실 카드(app-gallery-workshop.js:406·
   workspace-perf.js:607) 모두 Supabase URL 을 그대로 src 에 넣는다. 객체가 사라지면
   (탈퇴 정리·GC·경로 깨짐·CDN 장애) 회색 빈 칸만 남는다 — 원장님은 "아직 뜨는 중인지
   없어진 건지" 를 알 수 없고, 할 수 있는 것도 없다.
   (참고: 없는 객체를 Supabase 는 **400 + JSON** 으로 준다. 404 가 아니다.
    <img> 입장에선 어느 쪽이든 디코드 실패라 error 가 뜬다 — 실측 493ms.)

   푸는 방식 — 개별 <img> 를 다 고치지 않는다(수십 곳 + 앞으로 생길 것들).
   error 는 버블링을 안 하므로 **캡처 단계**에서 document 하나로 받는다. 그러면 나중에
   innerHTML 로 다시 그려지는 카드까지 등록 없이 전부 걸린다.
     1회는 캐시버스터로 자동 재시도 → CDN 일시 오류·캐시 꼬임은 대개 여기서 회복.
     그래도 실패면 '사진을 못 불러왔어요 + 다시 시도' 로 바꾼다. 빈 칸으로 두지 않는다.

   건드리지 않는 것: inline onerror 를 이미 가진 <img>(프로필 사진 등 — 자기 폴백이 있다),
   data:/blob: 이미지(네트워크와 무관), data-mf-skip="1" 을 명시한 것. */
(function () {
  'use strict';

  function isMedia(el) {
    return el && el.tagName === 'IMG'
      && /^https?:\/\//.test(el.currentSrc || el.src || '')
      && !el.hasAttribute('onerror')
      && el.dataset.mfSkip !== '1';
  }

  function bust(url) {
    // 캐시 무효화는 `_nc` 로. `_t` 는 인증 파라미터 이름과 충돌한 전례가 있어 쓰지 않는다.
    try { var u = new URL(url, location.href); u.searchParams.set('_nc', Date.now()); return u.toString(); }
    catch (_e) { return url + (url.indexOf('?') === -1 ? '?' : '&') + '_nc=' + Date.now(); }
  }

  function fail(img) {
    if (img.dataset.mfFailed === '1') return;
    img.dataset.mfFailed = '1';
    var box = document.createElement('div');
    box.className = 'mf-broken';
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', '사진을 불러오지 못했어요');
    box.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-image"/></svg>' +
      '<span class="mf-broken__t">사진을 못 불러왔어요</span>' +
      '<button type="button" class="mf-broken__r">다시 시도</button>';
    img.hidden = true;                       // 지우지 않는다 — '다시 시도' 로 되살린다.
    if (img.parentNode) img.parentNode.insertBefore(box, img.nextSibling);
    box.querySelector('.mf-broken__r').addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var src = img.dataset.mfSrc || img.src;
      img.dataset.mfFailed = ''; img.dataset.mfRetried = '';
      img.hidden = false; box.remove();
      img.src = bust(src);
    });
  }

  function onError(img) {
    if (img.dataset.mfFailed === '1') return;
    if (!img.dataset.mfSrc) img.dataset.mfSrc = img.src;
    if (img.dataset.mfRetried === '1') return fail(img);
    img.dataset.mfRetried = '1';
    img.src = bust(img.dataset.mfSrc);
  }

  document.addEventListener('error', function (e) {
    if (isMedia(e.target)) onError(e.target);
  }, true);   // ← 캡처. error 는 버블링하지 않는다.

  window.MediaFallback = { _onError: onError, _fail: fail };
})();
