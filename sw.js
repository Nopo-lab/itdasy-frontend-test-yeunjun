// ─────────────────────────────────────────────
//  잇데이 Service Worker
//  CACHE_VERSION = 날짜(YYYYMMDD) + 빌드번호
//  배포할 때마다 이 값만 올리면 구 캐시 자동 삭제
//
//  [2026-04-26 A10] 캐시 전략 분리
//    - /api/, /auth/, /data-export/  → network-first (항상 최신)
//    - app-*.js, *.css, *.html       → cache-first + 백그라운드 revalidate
// ─────────────────────────────────────────────
const CACHE_VERSION = '20260515-v125-qa-r7-prose-repair';
const CACHE_NAME    = `itdasy-${CACHE_VERSION}`;
const API_CACHE_NAME = `itdasy-api-${CACHE_VERSION}`;

// 오프라인 fallback 용 GET API 경로 — 정확히 매칭되는 read-only endpoint
// (mutation 은 절대 캐시하지 않음)
const _API_GET_FALLBACK_PATHS = [
  '/customers',
  '/bookings',
  '/revenue',
  '/inventory',
  '/today/brief',
  '/services',
  // [P2] 대시보드 추가 fetch 도 오프라인 폴백 가능하게
  '/retention/at-risk',
  '/naver-reviews/summary',
  '/notifications/pending',
];
function _isCacheableApiGet(req, url) {
  if (req.method !== 'GET') return false;
  return _API_GET_FALLBACK_PATHS.some(p => url.pathname === p || url.pathname.startsWith(p + '?') || url.pathname.startsWith(p + '/'));
}

// SW 기준 상대경로 — 호스팅 경로 바뀌어도 자동 동작
const OFFLINE_URL   = './offline.html';

const STATIC_ASSETS = [
  './index.html',
  './style.css',
  './style-base.css',
  './style-home.css',
  './style-components.css',
  './style-polish.css',
  './style-dark.css',
  './style-hub.css',
  './app-core.js',
  './app-perf-recovery.js',
  './app-instagram.js',
  './app-caption.js',
  './app-portfolio.js',
  './app-portfolio-tags.js',
  './app-ai.js',
  './app-gallery-utils.js',
  './app-gallery-db.js',
  './app-gallery-workshop.js',
  './app-gallery-assign.js',
  './app-gallery-slot-editor.js',
  './app-gallery-bg.js',
  './app-photo-enhance.js',
  './app-gallery-element.js',
  './app-gallery-review.js',
  './app-gallery-write.js',
  './app-gallery-finish.js',
  './app-pricelist.js',
  './app-assistant-facts.js',
  './app-smart-capture.js',
  './app-ai-hub.js',
  './app-settings-hub.js',
  './app-assistant-undo.js',
  './app-sheet-anim.js',
  './app-dm-confirm-queue.js',
  './app-dm-manual-replies.js',
  './app-dm-conversations.js',
  './app-emoji-storage.js',
  './manifest.json',
  './offline.html',
  'https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600&family=Noto+Sans+KR:wght@300;400;500&display=swap',
];

// ── install: 새 버전 캐시 준비 ──
self.addEventListener('install', event => {
  self.skipWaiting(); // 대기 없이 즉시 활성화
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

// ── client 가 버전 문의하면 응답 (배지 표시용) ──
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: CACHE_VERSION });
  }
});

// ── activate: 구 버전 캐시 전부 삭제 ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith('itdasy-') && key !== CACHE_NAME && key !== API_CACHE_NAME)
          .map(key => {
            console.log(`[SW] 구 캐시 삭제: ${key}`);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim()) // 열려있는 탭에 즉시 적용
  );
});

// ── 보조: API 등 동적 요청 분류 ──
function _isDynamicApi(url) {
  // 같은 origin 의 API 또는 절대 URL 의 백엔드 — 둘 다 SW 미개입(브라우저 기본 fetch)
  return /\/(api|auth|data-export|caption|persona|instagram|nps|booking|customer|inventory|revenue|admin|upload|image|iap)\//i.test(url.pathname);
}

// ── fetch: 정적 파일은 cache-first + 백그라운드 revalidate, API 는 SW 미개입 ──
//   SW 가 API 응답까지 캐시하면 매 요청마다 clone+write 비용 발생 → 전체 앱 렉의 주범
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 같은 origin (GitHub Pages) 의 정적 파일만 SW 처리
  // API, CDN, 외부 서비스는 전부 bypass 하여 브라우저 기본 fetch 사용
  const isSameOrigin = url.origin === self.location.origin;

  // [A10] 백엔드 API 패턴 — same-origin 이라도 무조건 SW 미개입 (network-first 대체로 안전한 default)
  if (_isDynamicApi(url)) {
    // 단, read-only GET 일부는 오프라인 fallback 용으로 network-first + cache 응답
    if (_isCacheableApiGet(event.request, url)) {
      event.respondWith((async () => {
        try {
          // network-first
          const fresh = await fetch(event.request);
          if (fresh && fresh.ok) {
            try {
              const clone = fresh.clone();
              caches.open(API_CACHE_NAME).then(c => c.put(event.request, clone)).catch(() => {});
            } catch (_) { /* ignore */ }
            return fresh;
          }
          // [2026-04-28 v29] X-Offline 헤더 부착 제거 — 클라이언트 영구 잠금 원인.
          // 5xx 등 오류 → fresh 응답 그대로 반환 (캐시 폴백 X). 일시 오류 시 fetch가 자체 catch.
          return fresh;
        } catch (_e) {
          // 네트워크 진짜 실패 → 캐시 폴백 (헤더 부착 X). 클라가 navigator.onLine 으로 판단.
          const cached = await caches.match(event.request, { cacheName: API_CACHE_NAME });
          if (cached) return cached;
          throw _e;  // 클라가 catch + onLine 체크
        }
      })());
      return;
    }
    return;  // 그 외 API — 브라우저 기본 fetch (항상 최신, mutation 등)
  }

  const isStaticAsset =
    isSameOrigin &&
    event.request.method === 'GET' &&
    !url.pathname.includes('/api/') &&
    (url.pathname.endsWith('.html') ||
     url.pathname.endsWith('.css') ||
     url.pathname.endsWith('.js') ||
     url.pathname.endsWith('.png') ||
     url.pathname.endsWith('.jpg') ||
     url.pathname.endsWith('.jpeg') ||
     url.pathname.endsWith('.webp') ||
     url.pathname.endsWith('.svg') ||
     url.pathname.endsWith('.json') ||
     url.pathname.endsWith('.woff2') ||
     // 디렉토리 요청 (index.html 암묵)
     url.pathname.endsWith('/'));

  if (!isStaticAsset) {
    // API / 외부 CDN / 이미지 업로드 전부 SW 미개입
    return;
  }

  // [A10] cache-first + stale-while-revalidate
  //   1. 캐시 hit → 즉시 응답 (빠름)
  //   2. 동시에 네트워크로 백그라운드 revalidate → 다음 로드부터 최신
  //   3. 캐시 miss → 네트워크 fetch + 캐시 저장
  //   4. 네트워크 실패 + 캐시 hit → 캐시 사용
  //   5. 네트워크 실패 + 캐시 miss → offline.html (HTML 요청만)
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    const networkPromise = fetch(event.request).then(response => {
      if (response && response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone)).catch(() => {});
      }
      return response;
    }).catch(() => null);

    if (cached) {
      // 백그라운드 revalidate — 결과는 다음 요청에서 반영
      networkPromise.catch(() => {});
      return cached;
    }
    const fresh = await networkPromise;
    if (fresh) return fresh;
    if (event.request.mode === 'navigate' || (event.request.headers.get('accept') || '').includes('text/html')) {
      const offline = await caches.match(OFFLINE_URL);
      if (offline) return offline;
    }
    return new Response('', { status: 503, statusText: 'Offline' });
  })());
});
