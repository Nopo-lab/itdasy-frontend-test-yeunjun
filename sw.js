// ─────────────────────────────────────────────
//  잇데이 Service Worker
//  CACHE_VERSION = 날짜(YYYYMMDD) + 빌드번호
//  배포할 때마다 이 값만 올리면 구 캐시 자동 삭제
// ─────────────────────────────────────────────
const CACHE_VERSION = '20260419-v8';
const CACHE_NAME    = `itdasy-${CACHE_VERSION}`;
const OFFLINE_URL   = '/itdasy-frontend-test-yeunjun/offline.html';

const STATIC_ASSETS = [
  '/itdasy-frontend-test-yeunjun/index.html',
  '/itdasy-frontend-test-yeunjun/style.css',
  '/itdasy-frontend-test-yeunjun/app-core.js',
  '/itdasy-frontend-test-yeunjun/app-instagram.js',
  '/itdasy-frontend-test-yeunjun/app-caption.js',
  '/itdasy-frontend-test-yeunjun/app-portfolio.js',
  '/itdasy-frontend-test-yeunjun/app-ai.js',
  '/itdasy-frontend-test-yeunjun/app-gallery.js',
  '/itdasy-frontend-test-yeunjun/manifest.json',
  '/itdasy-frontend-test-yeunjun/offline.html',
  'https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600&family=Noto+Sans+KR:wght@300;400;500&display=swap',
];

// ── install: 새 버전 캐시 준비 ──
self.addEventListener('install', event => {
  self.skipWaiting(); // 대기 없이 즉시 활성화
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

// ── activate: 구 버전 캐시 전부 삭제 ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith('itdasy-') && key !== CACHE_NAME)
          .map(key => {
            console.log(`[SW] 구 캐시 삭제: ${key}`);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim()) // 열려있는 탭에 즉시 적용
  );
});

// ── fetch: Network-First 전략 ──
//   API 호출 → 항상 네트워크
//   정적 파일 → 네트워크 우선, 실패 시 캐시 폴백
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API / 외부 서버 요청은 캐시 안 함
  if (
    url.hostname.includes('ngrok') ||
    url.hostname.includes('catbox') ||
    url.hostname.includes('instagram') ||
    url.hostname.includes('facebook') ||
    url.hostname.includes('googleapis.com') && url.pathname.includes('/generate')
  ) {
    return; // 브라우저 기본 fetch 동작
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // 정상 응답이면 캐시에도 저장
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(async () => {
        // 오프라인 폴백: 캐시에 있으면 캐시, HTML 탐색이면 offline.html
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate' || (event.request.headers.get('accept') || '').includes('text/html')) {
          const offline = await caches.match(OFFLINE_URL);
          if (offline) return offline;
        }
        return new Response('', { status: 503, statusText: 'Offline' });
      })
  );
});
