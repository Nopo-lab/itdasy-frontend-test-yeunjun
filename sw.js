// ─────────────────────────────────────────────
//  잇데이 Service Worker
//  CACHE_VERSION = 날짜(YYYYMMDD) + 빌드번호
//  배포할 때마다 이 값만 올리면 구 캐시 자동 삭제
// ─────────────────────────────────────────────
const CACHE_VERSION = '20260420-v21';
const CACHE_NAME    = `itdasy-${CACHE_VERSION}`;

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
  './app-core.js',
  './app-instagram.js',
  './app-caption.js',
  './app-portfolio.js',
  './app-ai.js',
  './app-gallery.js',
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
          .filter(key => key.startsWith('itdasy-') && key !== CACHE_NAME)
          .map(key => {
            console.log(`[SW] 구 캐시 삭제: ${key}`);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim()) // 열려있는 탭에 즉시 적용
  );
});

// ── fetch: 정적 파일만 캐시, API/외부는 SW 미개입 ──
//   ⚠ SW 가 API 응답까지 캐시하면 매 요청마다 clone+write 비용 발생 → 전체 앱 렉의 주범
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 같은 origin (GitHub Pages) 의 정적 파일만 SW 처리
  // API, CDN, 외부 서비스는 전부 bypass 하여 브라우저 기본 fetch 사용
  const isSameOrigin = url.origin === self.location.origin;
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

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(async () => {
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
