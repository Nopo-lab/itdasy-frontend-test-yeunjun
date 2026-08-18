// Itdasy Studio - Core (설정, 인증, 유틸, 탭, 온보딩)

// ===== 프로덕션 console 무력화 =====
// localhost·?debug=1 제외한 실사용자 환경에선 console.log/info/warn/debug 를
// no-op 으로 대체. 민감 정보 유출 + 심사관 devtools 열었을 때 잡음 방지.
// error 는 유지 (실제 에러 추적 위해).
(function _muzzleConsole() {
  const isLocal = (typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1'));
  const isDebug = (typeof location !== 'undefined' && location.search && location.search.includes('debug=1'));
  if (isLocal || isDebug) return;
  const noop = function() {};
  if (typeof console !== 'undefined') {
    const logger = console;
    logger.log = noop;
    logger.info = noop;
    logger.warn = noop;
    logger.debug = noop;
    // console.error 는 유지 — Sentry 등에서 캐치용
  }
})();

// ===== [2026-06-12] pathname 슬래시 증식 정규화 =====
// 재연동 시 return_to 가 `.../yeunjun//` 처럼 슬래시가 누적되면 매번 새 SW scope 가
// 생겨 SW 가 9개씩 등록되고, controllerchange→reload 로 ?connected=success 가 날아감.
// 부팅 최상단에서 pathname 의 // 를 / 로 접어 정규화. 쿼리스트링·해시는 그대로 보존.
(function _normalizePathSlashes() {
  try {
    var p = location.pathname;
    if (/\/{2,}/.test(p)) {
      var fixed = p.replace(/\/{2,}/g, '/');
      history.replaceState(null, '', fixed + location.search + location.hash);
    }
  } catch (_e) { /* ignore */ }
})();

// ===== XSS 방어 유틸 (글로벌) =====
// 사용자 입력 / API 응답을 innerHTML에 넣기 전 _esc()로 감싸기.
// textContent 대체 가능하면 그쪽이 우선.
window._esc = window._esc || function (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
};

// [2026-06-05] 호칭 헬퍼 — 이름이 이미 '님'으로 끝나면 중복 안 붙임 ("연영님님" 버그 방지).
//   withHonorific('연영')='연영님', withHonorific('연영님')='연영님', withHonorific('')=''
window.withHonorific = window.withHonorific || function (name) {
  var n = String(name == null ? '' : name).trim().replace(/(님)+$/, '');
  return n ? n + '님' : '';
};
// 표시단 방어 — 완성 문자열의 '님님…' 을 '님' 으로 축약 (BE/외부 텍스트에도 적용)
window.dedupeNim = window.dedupeNim || function (str) {
  return String(str == null ? '' : str).replace(/님(\s*님)+/g, '님');
};

// ===== data-changed 디바운스 dispatch (PerfFix) =====
// 빠른 연속 조작(예: 고객 일괄 추가) 시 21개 모듈이 매번 동시 발동 → UI 렉.
// force_sync/focus_sync 만 즉시, 그 외엔 50ms 디바운스로 1회만 발동.
let _dcPending = null;
window._fireDataChanged = window._fireDataChanged || function (detail) {
  if (detail && (detail.kind === 'force_sync' || detail.kind === 'focus_sync')) {
    window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail }));
    return;
  }
  clearTimeout(_dcPending);
  _dcPending = setTimeout(() => {
    window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail }));
  }, 50);
};

// [UX-LOAD] 로딩 오버레이 — 최소 노출시간(태그라인 전환 3.8s 다 보이게) + 쫀득 페이드아웃 공통값
var _LOAD_MIN_MS = 4000;
function _loaderFadeOut(lo) {
  lo.style.opacity = '0';
  lo.style.transform = 'scale(1.04)';
  setTimeout(function () { lo.style.display = 'none'; lo.style.opacity = ''; lo.style.transform = ''; }, 440);
}

// [UX-LOAD] 로딩 오버레이 해제 — 최소 1초 보장 후 쫀득 페이드아웃 (인사 없는 경로용: 토큰 자동로그인/워치독)
function _hideLoadingOverlay() {
  var lo = document.getElementById('appLoadingOverlay');
  if (!lo || lo.style.display === 'none') return;
  var wait = Math.max(0, _LOAD_MIN_MS - (Date.now() - (window._loadShownAt || 0)));
  setTimeout(function () { _loaderFadeOut(lo); }, wait);
}

// [2026-08-15 기기QA] preload 는 "캐시 미리 데우기"일 뿐인데 스플래시가 그 완료를 기다리고 있었다.
//   → API 8건 중 하나만 느려도 첫 화면이 인질로 잡힌다. 실측(전 엔진, 429 없음)에서 첫 진입이
//   4.6s ~ 15.2s 로 튀었고, 12초짜리는 정상 경로가 아니라 index.html 의 12s 워치독이 강제로 걷어낸 것이었다.
//   preload 는 계속 백그라운드로 돌게 두고, 스플래시는 최대 _PRELOAD_CAP_MS 만 기다린다.
var _PRELOAD_CAP_MS = 1500;
function _preloadCapped() {
  if (!window._preloadTabs) return Promise.resolve();
  var p = Promise.resolve();
  try { p = window._preloadTabs(); } catch (_) { return Promise.resolve(); }
  // 실패해도 스플래시를 막지 않는다(캐시 워밍이므로).
  return Promise.race([
    Promise.resolve(p).catch(function () { }),
    new Promise(function (r) { setTimeout(r, _PRELOAD_CAP_MS); }),
  ]);
}

// [UX-LOAD] 로그인 직후: preload → 최소시간 → 인사(1회) → 쫀득 해제 (로그인/로딩/인사 한 화면 통일)
async function _finishLoginLoad(withGreeting) {
  try { await _preloadCapped(); } catch (_) { /* ignore */ }
  var rest = _LOAD_MIN_MS - (Date.now() - (window._loadShownAt || Date.now()));
  if (rest > 0) await new Promise(function (r) { setTimeout(r, rest); });
  if (withGreeting) {
    var shopName = '';
    try { shopName = localStorage.getItem('shop_name') || ''; } catch (_) { /* ignore */ }
    if (shopName) {
      var g = document.getElementById('ldGreet'), w = document.getElementById('ldWave'), n = document.getElementById('ldGreetName');
      var tag = document.getElementById('ldTag');
      if (n) n.textContent = shopName;
      if (w) w.style.opacity = '0';
      if (tag) tag.style.opacity = '0';
      if (g) { g.style.opacity = '1'; g.style.transform = 'translateY(0)'; }
      await new Promise(function (r) { setTimeout(r, 1300); });
    }
  }
  var lo = document.getElementById('appLoadingOverlay');
  if (lo && lo.style.display !== 'none') _loaderFadeOut(lo);
}

// ===== 백엔드 설정 =====
// 이 레포(itdasy-frontend-test-yeunjun)는 연준 스테이징 전용 → 스테이징 백엔드 바라봄
// 운영 레포(itdasy-frontend)는 운영 백엔드(별도 Cloud Run 서비스/커스텀 도메인)를 사용해야 함
const PROD_API = 'https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
// [dev] 로컬에서 스테이징 백엔드로 붙어 테스트: ?api=staging (또는 localStorage itdasy_api=staging).
//   localhost 전용 · 명시적 opt-in만 · 운영/배포엔 영향 없음. 로컬 백엔드 안 띄우고 스테이징으로 검증할 때.
const _API_STAGING_OVERRIDE = (function () {
  try {
    if (/[?&]api=staging/.test(location.search)) { try { localStorage.setItem('itdasy_api', 'staging'); } catch (_p) { void _p; } return true; }  // 쿼리 1회 → 리로드에도 유지되게 고정
    return localStorage.getItem('itdasy_api') === 'staging';
  } catch (_e) { return false; }
})();
const API = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? (_API_STAGING_OVERRIDE ? PROD_API : 'http://localhost:8000')
  : PROD_API;

// [보안감사 H-3 2026-07-27] 토큰 저장소 보안 모드 — 기본 OFF, "빌드에 보안저장 플러그인이 실제로 포함됐을 때" 자동 ON.
//   ▶ 웹(비네이티브): 원본 localStorage 경로 100% 불변. 감지·await 자체가 안 돎(부팅비용 0).
//   ▶ 플러그인 없는 네이티브(현재 모든 설치본): 원본 localStorage 경로 100% 불변(감지 실패 → OFF 유지).
//   ▶ 플러그인 있는 네이티브(향후 빌드): 부팅 때 자동 감지 → JWT 를 Keychain/Keystore 로 이관 + 평문 localStorage 제거.
//   오버라이드(?api 와 동일하게 1회 쿼리→localStorage 고정): ?securetoken=1 강제 ON(테스트), ?securetoken=0 강제 OFF(킬스위치).
//   ~26곳의 동기 getToken() 호출부를 async 로 바꾸지 않으려고, 부팅 때 1회 하이드레이션 후 in-memory 캐시로 서빙한다.
const _secureForced = (function () {   // true=강제ON, false=강제OFF(킬스위치), null=자동감지
  try {
    if (/[?&]securetoken=1/.test(location.search)) { try { localStorage.setItem('itdasy_securetoken', '1'); } catch (_p) { void _p; } return true; }  // 쿼리 1회 → 리로드에도 유지
    if (/[?&]securetoken=0/.test(location.search)) { try { localStorage.setItem('itdasy_securetoken', '0'); } catch (_p) { void _p; } return false; }
    const v = localStorage.getItem('itdasy_securetoken');
    if (v === '1') return true;
    if (v === '0') return false;
    return null;
  } catch (_e) { return null; }
})();
// [보안감사 H-3] 런타임 가변 스위치. 기본 false → getToken/setToken 은 (감지 전까지) 원본 경로.
//   강제 ON 이면 즉시 true. 자동감지(네이티브 + 플러그인 확인)는 부팅 게이트에서 true 로 승격한다.
let _secureMode = (_secureForced === true);
// [보안감사 H-3] 네이티브 여부 동기 체크(웹이면 false → 감지 로직 자체를 건너뜀).
function _isNativePlatform() {
  try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }
  catch (_e) { return false; }
}

function apiUrl(path) {
  const raw = String(path == null ? '' : path);
  if (/^https?:\/\//i.test(raw)) return raw;
  if (!raw) return API;
  return API + (raw[0] === '/' ? raw : '/' + raw);
}

function apiFetch(path, opts) {
  return fetch(apiUrl(path), opts);
}

// ===== 토큰 localStorage 키를 백엔드별로 분리 =====
// nopo-lab.github.io는 운영/스테이징 프론트가 같은 origin이라 localStorage 공유.
// 백엔드가 다르면(운영 vs 스테이징) JWT 서명이 달라서 크로스 오염 시 401 "인증 실패" 발생.
// → API URL 기반으로 토큰 키를 분리해서 완전 격리.
const _TOKEN_KEY = 'itdasy_token::' + (API.includes('staging') ? 'staging' : (API.includes('localhost') ? 'local' : 'prod'));
const _LEGACY_TOKEN_KEY = 'itdasy_' + 'token';

// ═══ [보안감사 H-3 2026-07-27] 토큰 저장소 추상화 (secure 모드 _secureMode ON 일 때만 사용) ═══
//   in-memory 캐시. 부팅 때 _hydrateToken() 이 보안저장/localStorage 에서 1회 읽어 채운다.
//   동기 getToken() 호출부(~26곳)는 캐시만 읽으므로 async 전환 불필요.
let _tokenCache = null;
let _tokenReady = false;

// 만료 판정 + 부작용(만료 시 삭제·토스트·lockOverlay)을 한 곳으로. 기존 getToken() 인라인 로직을 그대로 옮겨
//   OFF(인라인)/ON(이 헬퍼) 두 경로의 만료 동작이 100% 동일하도록 한다. 반환: 유효하면 t, 아니면 null.
function _validateToken(t) {
  if (!t) return null;
  try {
    const payload = JSON.parse(atob(t.split('.')[1]));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      localStorage.removeItem(_TOKEN_KEY);
      // [A10] 토큰 만료 안내 + 로그인 화면
      if (window.showToast) window.showToast('로그인이 만료되었어요. 다시 로그인해주세요');
      setTimeout(() => {
        const lock = document.getElementById('lockOverlay');
        if (lock) lock.classList.remove('hidden');
        try { _setAuthGateLocked(true); } catch (_) { /* ignore */ }
      }, 1000);
      return null;
    }
  } catch { return null; }
  return t;
}

// 선택적 네이티브 보안저장 백엔드 — 있으면 {get,set,remove}, 없으면 null(→ 호출부 localStorage 폴백).
//   [보안감사 H-3 2026-07-27] 실제 API: @aparajita/capacitor-secure-storage v6.
//     · 등록 이름/익스포트 = SecureStorage (registerPlugin('SecureStorage'), export { proxy as SecureStorage }).
//     · 저수준 문자열 API(그대로 JWT 문자열용): getItem(key)->Promise<string|null>, setItem(key,value)->Promise<void>,
//       removeItem(key)->Promise<void>.  (get/set/remove 는 JSON 변환·Date 파싱이 붙어 문자열엔 부적합 → getItem 계열 사용)
//     · getItem/setItem/removeItem 은 SecureStorageBase(JS 레이어) 메서드라 반드시 "모듈 익스포트 프록시"로 접근해야 한다.
//       (window.Capacitor.Plugins.SecureStorage 브리지 프록시는 internal* 네이티브 메서드만 노출할 수 있어 getItem 이 없을 수 있음)
let _secureStorePromise = null;
function _secureTokenStore() {
  if (_secureStorePromise) return _secureStorePromise;
  _secureStorePromise = (async () => {
    try {
      // 네이티브가 아니면(웹) 즉시 null → localStorage 폴백 (감지 자체를 안 함)
      if (!_isNativePlatform()) return null;
      // 정본 = 모듈 익스포트(전체 JS API 보장). 실패 시에만 브리지 프록시 폴백(getItem 있을 때만 채택).
      let plugin = null;
      const mod = await import('@aparajita/capacitor-secure-storage').catch(() => null);
      plugin = (mod && mod.SecureStorage) || null;
      if (!plugin || typeof plugin.getItem !== 'function') {
        const bridge = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SecureStorage) || null;
        if (bridge && typeof bridge.getItem === 'function') plugin = bridge;
      }
      if (!plugin || typeof plugin.getItem !== 'function' || typeof plugin.setItem !== 'function') return null;
      const KEY = _TOKEN_KEY; // 백엔드별 키 격리 그대로
      return {
        async get() {
          try { const v = await plugin.getItem(KEY); return (typeof v === 'string' && v) ? v : null; }
          catch (_e) { return null; }
        },
        async set(v) {
          try { await plugin.setItem(KEY, String(v)); } catch (_e) { void _e; }
        },
        async remove() {
          try {
            if (typeof plugin.removeItem === 'function') await plugin.removeItem(KEY);
            else if (typeof plugin.remove === 'function') await plugin.remove(KEY);  // 하위호환(불리언 반환)
          } catch (_e) { void _e; }
        },
      };
    } catch (_e) { return null; }
  })();
  return _secureStorePromise;
}

// 부팅 1회 하이드레이션(ON 전용). 보안저장 → 없으면 localStorage(+레거시키) 순으로 읽어 _tokenCache 채움.
//   localStorage 에서 왔고 보안저장이 가능하면 그쪽으로 이관(secure.set + 평문 제거). 플러그인 오류엔 localStorage 로 폴백.
let _hydratePromise = null;
function _hydrateToken() {
  if (_hydratePromise) return _hydratePromise;
  _hydratePromise = (async () => {
    let token = null, fromLocal = false, secure = null;
    try {
      secure = await _secureTokenStore();
      if (secure) { try { token = await secure.get(); } catch (_e) { token = null; } }
      if (!token) {
        try { token = localStorage.getItem(_TOKEN_KEY); } catch (_e) { token = null; }
        if (!token) {  // 레거시 키 폴백 (기존 getToken 동작 보존)
          try {
            const legacy = localStorage.getItem(_LEGACY_TOKEN_KEY);
            if (legacy) { token = legacy; try { localStorage.setItem(_TOKEN_KEY, legacy); } catch (_e2) { void _e2; } }
          } catch (_e3) { void _e3; }
        }
        if (token) fromLocal = true;
      }
      // localStorage 에서 읽었는데 보안저장 가능 → 이관(평문 제거)
      if (token && fromLocal && secure) {
        try { await secure.set(token); localStorage.removeItem(_TOKEN_KEY); } catch (_e) { void _e; }
      }
    } catch (_e) { /* 무엇이 실패하든 아래에서 캐시 확정 */ }
    _tokenCache = token || null;
    _tokenReady = true;
    return _tokenCache;
  })();
  return _hydratePromise;
}
window._hydrateToken = _hydrateToken;
window._tokenReadyCheck = function () { return _tokenReady; };

// 부팅 게이트 — [보안감사 H-3 2026-07-27] 정적 플래그 → 런타임 플러그인 감지.
//   ▶ 강제 OFF(킬스위치): 즉시 반환 → 원본 경로(하이드레이션 없음).
//   ▶ 감지: 네이티브에서만. 웹은 호출부에서 애초에 이 게이트를 부르지 않지만, 불려도 isNative=false 로 즉시 반환.
//     네이티브면 플러그인 프로브(800ms 바운드) → 있으면 _secureMode=true 로 승격, 없으면 false 유지(원본 경로).
//   ▶ secure 모드 진입 시: 하이드레이션(localStorage→Keychain 이관 포함)을 최대 800ms 만 기다린다(플러그인이 행 걸려도 부팅 안 막힘).
async function _bootHydrateGate() {
  if (_tokenReady) return;              // 이미 하이드레이션 완료(강제 ON 이 로드 때 착수한 경우 등)
  if (_secureForced === false) return;  // 강제 OFF(킬스위치) → 원본 경로
  if (!_secureMode) {
    // 아직 secure 모드가 아니면 = 자동감지 대상. 웹이면 감지 안 함(원본 경로, 추가 async 비용 0).
    if (!_isNativePlatform()) return;
    let store = null;
    try {
      store = await Promise.race([
        _secureTokenStore(),
        new Promise((r) => setTimeout(() => r(null), 800)),  // 프로브도 바운드
      ]);
    } catch (_e) { store = null; }
    if (!store) return;   // 네이티브지만 플러그인 없음 → 원본 localStorage 경로 유지
    _secureMode = true;   // 플러그인 확인 → secure 모드 진입
  }
  try {
    // [보안감사 H-3 2026-07-29 수정] secure 모드에선 평문 localStorage 에 폴백할 토큰이 없다
    //   (Keychain 으로 이관하며 제거됨). 기존 800ms→localStorage(빈값)→_tokenCache=null 폴백은
    //   "로그인했는데 토큰 없음"을 만들어 홈이 첫 로드에서 "연결이 불안정해요"를 띄웠다(재시도하면 복구).
    //   Keychain 읽기는 빠른 네이티브 동기연산이라 실제로 기다린다. 만일의 행 대비 안전상한(4s)만 둔다.
    await Promise.race([
      _hydrateToken(),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
    _tokenReady = true;  // 안전상한 도달 시에도 부팅은 진행(캐시는 하이드레이션이 늦게라도 채움)
  } catch (_e) { /* ignore */ }
}
window._bootHydrateGate = _bootHydrateGate;

// [보안감사 H-3] 강제 ON 이면 모듈 로드 즉시 하이드레이션 착수 — load 이벤트 시점엔 대개 이미 완료돼 게이트가 즉시 통과.
//   (자동감지 경로는 네이티브 여부·플러그인 확인이 필요하므로 로드 즉시가 아니라 부팅 게이트에서 착수.)
if (_secureMode) { try { _hydrateToken(); } catch (_e) { void _e; } }
// ═══ [보안감사 H-3] 끝 ═══

let _instaHandle = '';  // checkInstaStatus에서 저장
Object.defineProperty(window, '_instaHandle', {
  configurable: true,
  get() { return _instaHandle; },
  set(value) { _instaHandle = value || ''; },
});

// ─── 토스트 시스템 v2 (큐 기반, 타입별 색상) ────────────────────
const _toastQueue = [];
let _toastActive = false;

// 숨김·다음큐 타이머 핸들 전역 보관 — 재진입/타이머 중첩 시에도 토스트가 절대 잔류하지 않도록 (버그1 방어)
let _toastHideTimer = null;
let _toastNextTimer = null;
const TOAST_MAX_DURATION = 5000; // duration 상한 캡

function showToast(msg, opts) {
  const o = typeof opts === 'object' ? opts : { type: opts || 'info' };
  const d = Math.min(Number(o.duration) || 2400, TOAST_MAX_DURATION);
  _toastQueue.push({ msg, type: o.type || 'info', duration: d });
  if (!_toastActive) _nextToast();
}

function _hideToastEl(el) {
  if (!el) return;
  el.style.opacity = '0';
  el.style.transform = 'translateX(-50%) translateY(-120%)';
  el.style.pointerEvents = 'none';
}

function _nextToast() {
  // 진입 시 이전 타이머 전부 정리 — 스케줄이 중첩돼 숨김이 씹히는 상황 차단
  if (_toastHideTimer) { clearTimeout(_toastHideTimer); _toastHideTimer = null; }
  if (_toastNextTimer) { clearTimeout(_toastNextTimer); _toastNextTimer = null; }

  if (!_toastQueue.length) { _toastActive = false; return; }
  _toastActive = true;
  const { msg, type, duration } = _toastQueue.shift();

  let el;
  try {
    el = document.getElementById('itdToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'itdToast';
      el.style.cssText = 'position:fixed;top:calc(var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + 16px);left:50%;transform:translateX(-50%) translateY(-120%);z-index:99999;padding:12px 20px;border-radius:var(--r-md,14px);font-size:14px;font-weight:600;box-shadow:var(--shadow-md);transition:transform .3s cubic-bezier(.4,0,.2,1),opacity .3s;opacity:0;pointer-events:none;max-width:calc(100vw - 32px);text-align:center;';
      document.body.appendChild(el);
    }

    const colors = {
      info:    { bg: 'var(--surface)', color: 'var(--text)' },
      success: { bg: '#E8F8EF', color: '#0F6E56' },
      warning: { bg: '#FEF3E2', color: '#854F0B' },
      error:   { bg: '#FEE8E8', color: '#A32D2D' },
    };
    const c = colors[type] || colors.info;
    el.style.background = c.bg;
    el.style.color = c.color;
    el.textContent = msg;

    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateX(-50%) translateY(0)';
      el.style.pointerEvents = 'auto';
    });
  } catch (_e) {
    // 렌더 중 예외가 나도 상태를 절대 물고 있지 않게 — 다음 큐로 넘김
    _toastActive = false;
    _toastNextTimer = setTimeout(_nextToast, 0);
    return;
  }

  _toastHideTimer = setTimeout(() => {
    _toastHideTimer = null;
    _hideToastEl(el);
    _toastNextTimer = setTimeout(_nextToast, 320);
  }, duration);
}

// [버그5] 예약 메모 표시용 정리 — DB 원본은 운영 추적용으로 보존, 화면 표시만 정규식으로 정돈
window.itdCleanMemo = function (s) {
  let m = String(s == null ? '' : s);
  m = m.replace(/\s*\(?sender=\w+\)?/g, '');                // "sender=7480" / "(sender=7480)" 제거
  m = m.replace(/DM 자동 등록\s*\([^)]*\)/g, 'DM 자동 등록');   // "DM 자동 등록 (예약 시 NER, …)" → "DM 자동 등록"
  return m.trim();
};

function isKakaoTalk() {
  return /KAKAOTALK/i.test(navigator.userAgent);
}

function showInstallGuide(extraMsg) {
  const el = document.getElementById('installGuideModal');
  const card = document.getElementById('installGuideCard');
  document.getElementById('installGuideExtra').textContent = extraMsg || '';
  el.style.display = 'flex';
  setTimeout(() => { card.style.transform = 'scale(1)'; card.style.opacity = '1'; }, 10);
}
function hideInstallGuide() {
  const el = document.getElementById('installGuideModal');
  const card = document.getElementById('installGuideCard');
  card.style.transform = 'scale(0.8)'; card.style.opacity = '0';
  setTimeout(() => { el.style.display = 'none'; }, 300);
}

// [2026-08-16] 인스타 프사 로드 실패(대개 CDN 서명 oe= 만료 → 403) 공용 복구 —
//   만료 캐시를 폐기하고 /instagram/status 를 세션당 1회만 재조회해 새 URL 로 다시 그린다.
//   동시 다발 실패(헤더+홈 아바타)는 같은 Promise 를 공유해 status 중복 호출 0.
//   재시도 후에도 실패하면 이니셜 폴백. 호출처: updateHeaderProfile ·
//   js/home/v41-renderers.js syncAvatar — 같은 로직 복붙 금지, 반드시 이 함수 재사용.
let _igPicRecoverPromise = null;
function _recoverIgProfilePic() {
  if (_igPicRecoverPromise) return _igPicRecoverPromise;
  _igPicRecoverPromise = (async () => {
    try { localStorage.removeItem('itdasy:ig_profile_pic'); } catch (_e) { void _e; }
    try {
      const res = await apiFetch('/instagram/status', { headers: authHeader() });
      if (!res.ok) return '';
      const data = await res.json();
      const pic = (data && data.connected && data.profile_picture_url) || '';
      if (pic) { try { localStorage.setItem('itdasy:ig_profile_pic', pic); } catch (_e) { void _e; } }
      return pic;
    } catch (_e) { return ''; }
  })();
  return _igPicRecoverPromise;
}
window.handleIgAvatarError = function (imgEl, slotEl, fallbackHTML) {
  const oldSrc = (imgEl && imgEl.src) || '';
  _recoverIgProfilePic().then((fresh) => {
    if (!slotEl || !slotEl.isConnected) return;
    if (fresh && fresh !== oldSrc) {
      const retry = imgEl.cloneNode(false);  // 속성(referrerpolicy 등)만 복제 — onerror 는 property 라 미복제
      retry.src = fresh;
      retry.onerror = function () { slotEl.innerHTML = fallbackHTML; };  // 2차 실패 → 이니셜 확정(루프 없음)
      slotEl.innerHTML = '';
      slotEl.appendChild(retry);
    } else {
      slotEl.innerHTML = fallbackHTML;
    }
  });
};

function updateHeaderProfile(handle, tone, picUrl) {
  const el = document.getElementById('headerPersona');
  if (!el) return;
  el.style.display = 'flex';

  // [2026-05-29] 사진 URL 이 비면 캐시된 인스타 프사로 폴백.
  //   /me 응답 후 재렌더(아래 updateHeaderProfile(handle,null,'')) 등이 빈 값으로 덮어
  //   인스타 프사가 떴다가 사라지던 버그 방지. 로그아웃·연동해제는 호출 전에 캐시를 지우므로
  //   그때는 정상적으로 이니셜로 떨어짐.
  if (!picUrl) {
    try { picUrl = localStorage.getItem('itdasy:ig_profile_pic') || ''; } catch (_e) { picUrl = ''; }
  }

  const shopName = localStorage.getItem('shop_name') || '사장님';
  const shopNameEl = document.getElementById('headerShopName');
  if (shopNameEl) shopNameEl.textContent = shopName;

  const publishLabel = document.getElementById('publishBtnLabel');
  if (publishLabel) publishLabel.textContent = `${shopName} 피드에 바로 올리기`;

  // 헤더 아바타: 이미지 있으면 img, 없으면 이니셜
  const avatarEl = document.getElementById('headerAvatar');
  if (avatarEl) {
    const letter = (shopName || '사장님')[0]?.toUpperCase() || '✨';
    if (picUrl) {
      // referrerpolicy: 인스타 CDN 은 referrer 있으면 403 → no-referrer 필수
      avatarEl.innerHTML = `<img src="${window._esc(picUrl)}" alt="" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
      // [2026-06-05] CDN 403/URL 만료 시 깨진 이미지 대신 이니셜로 폴백
      // [2026-08-16] 폴백 전에 만료 캐시 폐기 + status 1회 재조회로 새 URL 재시도 (공용 복구).
      const _img = avatarEl.querySelector('img');
      if (_img) _img.onerror = function () {
        window.handleIgAvatarError(this, avatarEl, `<span class="profile-avatar__initial">${window._esc(letter)}</span>`);
      };
    } else {
      avatarEl.innerHTML = `<span class="profile-avatar__initial">${window._esc(letter)}</span>`;
    }
  }

  // 인스타 프레임 핸들 + 아바타 갱신 (미리보기용)
  const fh = document.getElementById('frameHandle');
  if (fh && handle) fh.textContent = window.igHandle(handle);
  const fi = document.getElementById('frameAvatarInner');
  if (fi) {
    const fLetter = (shopName || '사장님')[0]?.toUpperCase() || '✨';
    if (picUrl) {
      fi.innerHTML = `<img src="${window._esc(picUrl)}" alt="" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;">`;
      const _fimg = fi.querySelector('img');
      if (_fimg) _fimg.onerror = function () { fi.innerHTML = `<span id="frameAvatarLetter">${window._esc(fLetter)}</span>`; };
    } else {
      fi.innerHTML = `<span id="frameAvatarLetter">${window._esc(fLetter)}</span>`;
    }
  }
}

// ───── 업종별 설정 ─────
// [v192 2026-05-18] SHOP_CONFIG 13종 통합 — 온보딩 카드와 1:1 매핑.
//   기존 2종(붙임머리/네일아트)만 정의 → 나머지 11종 추가.
//   tagLabel/treatments/defaultTag 일관 정의로 applyShopType() 폴백 제거.
const SHOP_CONFIG = {
  '붙임머리': {
    question:    '오늘 어떤 붙임머리 작업을 하셨나요?',
    tagLabel:    '인치 선택',
    treatments:  ['18인치','20인치','22인치','24인치','26인치','28인치','30인치','특수인치','옴브레','재시술'],
    defaultTag:  '24인치',
  },
  '헤어샵': {
    question:    '오늘 어떤 헤어 작업을 하셨나요?',
    tagLabel:    '시술 종류',
    treatments:  ['커트','펌','매직','염색','뿌리염색','클리닉','셋팅펌','C컬','S컬','발레아쥬','하이라이트','옴브레'],
    defaultTag:  '펌',
  },
  '두피탈모': {
    question:    '오늘 어떤 두피·탈모 관리 하셨나요?',
    tagLabel:    '관리 종류',
    treatments:  ['두피스케일링','두피세럼','LED','MTS','약물','클리닉','홈케어'],
    defaultTag:  '두피스케일링',
  },
  '메이크업': {
    question:    '오늘 어떤 메이크업 하셨나요?',
    tagLabel:    '메이크업 종류',
    treatments:  ['데일리','웨딩','파티','촬영','SNS룩','브라이덜','내추럴','글로우'],
    defaultTag:  '데일리',
  },
  '눈썹': {
    question:    '오늘 어떤 눈썹 작업을 하셨나요?',
    tagLabel:    '시술 종류',
    treatments:  ['셰이딩','왁싱','정리','다듬기','컬러','일자눈썹','아치형'],
    defaultTag:  '정리',
  },
  '속눈썹': {
    question:    '오늘 어떤 속눈썹 작업을 하셨나요?',
    tagLabel:    '시술 종류',
    treatments:  ['속눈썹펌','래쉬리프트','속눈썹연장','클래식','볼륨','3D','5D','J컬','C컬','D컬','L컬','메가볼륨'],
    defaultTag:  '속눈썹펌',
  },
  '네일아트': {
    question:    '오늘 어떤 네일 작업을 하셨나요?',
    tagLabel:    '시술 종류',
    treatments:  ['젤네일','아트네일','아크릴','스컬프처','네일케어','오프','재시술','페디큐어','그라데이션','프렌치'],
    defaultTag:  '젤네일',
  },
  '패디': {
    question:    '오늘 어떤 패디·풋케어 작업을 하셨나요?',
    tagLabel:    '시술 종류',
    treatments:  ['페디큐어','풋케어','각질제거','발마사지','젤페디','아트페디','홈케어'],
    defaultTag:  '페디큐어',
  },
  '왁싱': {
    question:    '오늘 어떤 왁싱 작업을 하셨나요?',
    tagLabel:    '부위 선택',
    treatments:  ['브라질리언','하이바이','로우바이','얼굴','풀바디','다리','팔','겨드랑이','등','눈썹'],
    defaultTag:  '브라질리언',
  },
  '바디': {
    question:    '오늘 어떤 바디관리 하셨나요?',
    tagLabel:    '관리 종류',
    treatments:  ['전신마사지','부분마사지','셀룰라이트','림프','스크럽','보디팩','홈케어'],
    defaultTag:  '전신마사지',
  },
  '피부': {
    question:    '오늘 어떤 피부관리 하셨나요?',
    tagLabel:    '관리 종류',
    treatments:  ['딥클렌징','수분관리','모공관리','MTS','LED','필링','각질','홈케어'],
    defaultTag:  '수분관리',
  },
  '반영구': {
    question:    '오늘 어떤 반영구 작업을 하셨나요?',
    tagLabel:    '시술 종류',
    treatments:  ['눈썹','아이라인','입술','헤어라인','MTS','리터치','SMP'],
    defaultTag:  '눈썹',
  },
  '기타': {
    question:    '오늘 어떤 작업을 하셨나요?',
    tagLabel:    '시술 종류',
    treatments:  ['시술A','시술B','시술C','상담','홈케어'],
    defaultTag:  '시술A',
  },
};

// [v182 2026-05-18] 챗봇 _generateChatCaption 이 정확히 동일한 photo_context 만들도록 노출.
try { window.SHOP_CONFIG = SHOP_CONFIG; } catch (_e) { void _e; }

// [v192 2026-05-18] shop_type 정규화 헬퍼 — 5개 분산 호출 곳 통합.
//   raw shop_type (localStorage 값) → 내부 카테고리 8종 + 한글 label.
//   사진편집기, 캡션, 페르소나 API 등에서 일관되게 사용.
window.itdasyNormalizeShopType = function (raw) {
  const t = String(raw || '').toLowerCase();
  // 카테고리 매핑 (내부 8종) + 한글 label
  if (/(붙임머리|extension)/.test(t))       return { cat: 'hair',   label: '붙임머리' };
  if (/(헤어샵|미용|hair)/.test(t))          return { cat: 'hair',   label: '헤어샵' };
  if (/(두피|탈모|scalp)/.test(t))           return { cat: 'scalp',  label: '두피탈모' };
  if (/(메이크업|makeup)/.test(t))           return { cat: 'makeup', label: '메이크업' };
  if (/(속눈썹|lash)/.test(t))               return { cat: 'lash',   label: '속눈썹' };
  if (/(눈썹|brow)/.test(t))                 return { cat: 'makeup', label: '눈썹' };
  if (/(네일아트|네일|nail)/.test(t))        return { cat: 'nail',   label: '네일아트' };
  if (/(패디|풋케어|pedi|foot)/.test(t))     return { cat: 'nail',   label: '패디' };
  if (/(왁싱|wax)/.test(t))                  return { cat: 'wax',    label: '왁싱' };
  if (/(바디|body)/.test(t))                 return { cat: 'wax',    label: '바디' };
  if (/(피부|skin)/.test(t))                 return { cat: 'skin',   label: '피부' };
  if (/(반영구|문신|tattoo)/.test(t))        return { cat: 'skin',   label: '반영구' };
  return { cat: 'general', label: '기타' };
};

function applyShopType(type) {
  const cfg = SHOP_CONFIG[type];
  if (!cfg) return;

  // 시술 태그 라벨
  const lbl = document.getElementById('typeTagLabel');
  if (lbl) lbl.textContent = cfg.tagLabel;

  // 시술 태그 재빌드
  const container = document.getElementById('typeTags');
  if (container) {
    container.innerHTML = '';
    cfg.treatments.forEach(t => {
      const span = document.createElement('span');
      span.className = 'tag' + (t === cfg.defaultTag ? ' on' : '');
      span.dataset.v = t;
      span.textContent = t;
      container.appendChild(span);
    });
    initSingle('typeTags');
  }
}

// ───── 온보딩 ─────
let obStep = 1;
let obShopType = '';

// [2026-05-21] checkOnboarding — 서버 우선, localStorage 폴백.
// 캐시 지운 사용자가 같은 계정 로그인 시 온보딩이 다시 뜨던 버그 픽스.
// 서버 GET /shop/settings 응답의 shop_name 이 비어있지 않으면 = 이미 설정 완료.
async function checkOnboarding() {
  const ov = document.getElementById('onboardingOverlay');
  // 토큰 없으면 폴백 (로그인 전 상태)
  if (typeof getToken === 'function' && !getToken()) {
    _applyLocalOnboarding();
    return;
  }
  try {
    const headers = (typeof authHeader === 'function') ? authHeader() : null;
    if (!headers || !headers.Authorization) {
      _applyLocalOnboarding();
      return;
    }
    const res = await apiFetch('/shop/settings', { headers });
    if (!res.ok) {
      _applyLocalOnboarding();
      return;
    }
    const data = await res.json();
    const shopName = (data && data.shop_name) ? String(data.shop_name).trim() : '';
    const shopType = (data && data.shop_type) ? String(data.shop_type).trim() : '';
    if (shopName) {
      // 서버에 이미 설정된 계정 — 온보딩 숨김 + localStorage 동기화
      if (ov) ov.classList.add('hidden');
      try {
        localStorage.setItem('onboarding_done', '1');
        localStorage.setItem('shop_name', shopName);
        if (shopType) localStorage.setItem('shop_type', shopType);
      } catch (_) { /* storage full */ }
      applyShopType(shopType);
    } else {
      // 진짜 신규 — 온보딩 표시
      if (ov) ov.classList.remove('hidden');
    }
  } catch (_e) {
    // 네트워크/파싱 실패 — 앱 멈추지 않게 폴백
    _applyLocalOnboarding();
  }
}

function _applyLocalOnboarding() {
  const ov = document.getElementById('onboardingOverlay');
  if (!localStorage.getItem('onboarding_done')) {
    if (ov) ov.classList.remove('hidden');
  } else {
    const savedType = localStorage.getItem('shop_type') || '';
    applyShopType(savedType);
  }
}

function updateHomeQuestion() {
  const type = localStorage.getItem('shop_type') || '';
  applyShopType(type);
}

function goCaption() {
  showTab('caption', document.querySelector('.tab-bar__fab[data-tab="caption"]'));
}

function selectShopType(card) {
  document.querySelectorAll('.ob-shop-card:not(.disabled)').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  obShopType = card.dataset.type;
}

// Phase3: 3단계 축약 — Step1(환영+핵심가치) → Step2(업종, 건너뛰기 허용) → Step3(매장명, 즉시 완료)
const ONBOARD_STEPS = 3;

function obShowStep(n) {
  document.querySelectorAll('.ob-step').forEach(s => s.classList.remove('active'));
  document.getElementById('ob-step-' + n).classList.add('active');
  document.querySelectorAll('.ob-dot').forEach((d, i) => {
    d.classList.toggle('active', i < n);
  });
  const btn = document.getElementById('obBtn');
  btn.textContent = n === ONBOARD_STEPS ? '시작하기' : '계속하기';
  const skip = document.getElementById('obSkipBtn');
  if (skip) skip.style.display = n === 2 ? '' : 'none';
  obStep = n;
}

function obSkipShopType() {
  obShopType = '';
  obShowStep(3);
  setTimeout(() => document.getElementById('obShopNameInput').focus(), 300);
}

function _obFinish() {
  const _nameInput = document.getElementById('obShopNameInput');
  const name = _nameInput.value.trim();
  if (!name) {
    // [O1] 빨간 밑줄만으론 왜 안 넘어가는지 몰라 신규 유저가 멈추던 문제 — 이유를 토스트로 명확히.
    _nameInput.style.borderBottomColor = '#E05555';
    setTimeout(() => _nameInput.style.borderBottomColor = '', 1200);
    showToast('샵 이름을 입력해주세요');
    _nameInput.focus();
    return;
  }
  localStorage.setItem('onboarding_done', '1');
  localStorage.setItem('shop_name', name);
  if (obShopType) localStorage.setItem('shop_type', obShopType);

  document.getElementById('onboardingOverlay').classList.add('hidden');
  applyShopType(obShopType);
  updateHeaderProfile(null, null, null);
  showToast(`${name} 시작해요`, 'success');

  // [T-001 2026-05-29] shop_type 도 서버 저장 — 교차기기/캐시삭제 시 업종 유실 방지.
  //   백엔드 ShopSettingsUpdate 가 shop_type 수용(schemas/shop.py). GET 시 다시 읽어옴(checkOnboarding).
  const _obBody = { shop_name: name };
  if (obShopType) _obBody.shop_type = obShopType;
  apiFetch('/shop/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(_obBody)
  }).then(res => { if (!res.ok) showToast('매장 정보 저장에 실패했어요. 설정에서 다시 시도해주세요'); })
    .catch(() => showToast('매장 정보 저장에 실패했어요. 설정에서 다시 시도해주세요'));
}

async function obNext() {
  if (obStep === 1) {
    obShowStep(2);
  } else if (obStep === 2) {
    if (!obShopType) {
      document.querySelectorAll('.ob-shop-card:not(.disabled)').forEach(c => {
        c.style.transition = 'transform 0.1s';
        c.style.transform = 'scale(0.96)';
        setTimeout(() => c.style.transform = '', 150);
      });
      return;
    }
    obShowStep(3);
    setTimeout(() => document.getElementById('obShopNameInput').focus(), 300);
  } else if (obStep === 3) {
    _obFinish();
  }
}

// Step 3 Enter 키
document.getElementById('obShopNameInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') obNext();
});

function getToken() {
  // [보안감사 H-3 2026-07-27] secure 모드 OFF → 아래 블록은 원본 그대로(byte-for-byte). 웹·플러그인없는네이티브는 항상 여기.
  if (!_secureMode) {
    try {
      let t = localStorage.getItem(_TOKEN_KEY);
      if (!t) {
        const legacy = localStorage.getItem(_LEGACY_TOKEN_KEY);
        if (legacy) {
          t = legacy;
          try { localStorage.setItem(_TOKEN_KEY, legacy); } catch (e) { console.warn('[auth] 토큰 이전 저장 실패', e); }
        }
      }
      if (!t) return null;
      try {
        const payload = JSON.parse(atob(t.split('.')[1]));
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
          localStorage.removeItem(_TOKEN_KEY);
          // [A10] 토큰 만료 안내 + 로그인 화면
          if (window.showToast) window.showToast('로그인이 만료되었어요. 다시 로그인해주세요');
          setTimeout(() => {
            const lock = document.getElementById('lockOverlay');
            if (lock) lock.classList.remove('hidden');
            try { _setAuthGateLocked(true); } catch (_) { /* ignore */ }
          }, 1000);
          return null;
        }
      } catch { return null; }
      return t;
    } catch (_) { return null; }  // iOS Private 모드 SecurityError 방어
  }
  // [보안감사 H-3] secure 모드 ON → in-memory 캐시(_hydrateToken 이 부팅 때 보안저장/localStorage 에서 채움).
  //   만료 판정·부작용은 _validateToken 으로 OFF 경로와 동일 처리.
  return _validateToken(_tokenCache);
}
// [2026-04-24] 디바이스 간 데이터 불일치 방어 — 토큰 변경 감지 시 SWR 캐시 일괄 클리어.
// 폰·노트북·태블릿 같은 계정으로 들어왔을 때 다른 디바이스의 stale 스냅샷이 보이는 문제 해결.
// [PerfFix] 같은 프레임 안에서 N번 호출돼도 rAF로 1번만 실행.
let _swrClearScheduled = false;
function _clearAllSWRCache() {
  if (_swrClearScheduled) return;
  _swrClearScheduled = true;
  requestAnimationFrame(() => {
    _swrClearScheduled = false;
    const prefixes = ['pv_cache::', 'itdasy:cache', 'dash_cache::', 'hv41_cache::', 'mv3_cache::'];
    const exactKeys = ['ch_cache', 'ih_cache', 'rh_cache'];
    [localStorage, sessionStorage].forEach(store => {
      try {
        const keys = Object.keys(store);
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          if (exactKeys.indexOf(k) !== -1 || prefixes.some(p => k.startsWith(p))) {
            try { store.removeItem(k); } catch (_e) { void _e; }
          }
        }
      } catch (_e) { void _e; }
    });
  });
}
window._clearAllSWRCache = _clearAllSWRCache;

// ──────────────────────────────────────────────
// 사용자별 캐시·세션 격리 (T-2026-04-26)
//   다른 계정 로그인 / 신규 가입 시 이전 사용자의 잔존 데이터가 화면에
//   남는 문제 해결. 토큰 변경만으로는 same-user 토큰 갱신 vs other-user
//   새 토큰을 구분 못 하므로 user_id 기준으로 비교.
// ──────────────────────────────────────────────
const _USER_KEY_PREFIXES = ['itdasy_', 'itdasy:', 'pv_cache::', 'persona_'];
// [연준님 2026-08-16] assistant_session_id 추가 — prefix 어디에도 안 걸려 계정 전환 후에도
//   이전 계정의 잇비 세션 id 가 그대로 남았다. 서버가 user_id 로 걸러 유출은 없지만,
//   그 상태 자체가 틀렸고 실측에서 UI 가 꼬였다(대화가 없는데 초기 추천칩이 숨겨짐).
const _USER_KEY_EXACT = ['last_login_email', 'user_oauth_provider', 'last_user_id', 'shop_id',
  'assistant_session_id'];
// [2026-05-07 26차] user 변경 시 보존 키는 "디바이스 단위 UI 설정"만.
// shop_* / onboarding_done 은 user 데이터 → 제거.
// 잘못 보존되면 다른 user 로그인 시 옛 매장명/온보딩 상태가 남는다 (출시 블로커).
// [v203.1 2026-05-19] onboarding_done 보존 — 로그아웃 후 같은 디바이스에서 재진입 시
//   온보딩 다시 보지 않게. 다른 계정 로그인 시도 서버에서 shop_type 받아오면 갱신.
//   원래 KEEP 빠져있어 로그아웃 후 카드 13개 화면이 잘려 보여 흰화면처럼 느껴짐.
const _USER_KEY_KEEP = new Set([
  'theme', 'itdasy_theme', 'lang', 'i18n_lang',
  'itdasy_biometric_asked',
  'onboarding_done',  // [v203.1] 추가
  // [2026-05-21] GDPR/ePrivacy 동의 상태 — 디바이스 단위 결정이라 로그아웃 시
  // 삭제하면 매 로그인마다 안내 재노출. app-cookie-consent.js 정의 키.
  'itdasy_consent_v1',
  'itdasy_consent_at',
  'itdasy_consent_region',
]);

// [2026-04-26 A10] 사용자 데이터 정리 — localStorage 전수 순회는 큰 객체일 때
// UI 블로킹 가능. 즉시 효과 필요한 캐시 부분(_clearAllSWRCache)은 동기 유지하고
// prefix-match 삭제는 requestIdleCallback 으로 양보 (가능 시).
function _purgeUserScopedStorage() {
  function _doPurgeStorage(storage) {
    try {
      Object.keys(storage).forEach(k => {
        if (_USER_KEY_KEEP.has(k)) return;
        if (storage === localStorage && k === _TOKEN_KEY) return; // 토큰은 setToken 이 별도 관리
        const matchPrefix = _USER_KEY_PREFIXES.some(p => k.startsWith(p));
        const matchExact = _USER_KEY_EXACT.includes(k);
        if (matchPrefix || matchExact) {
          try { storage.removeItem(k); } catch (_e) { void _e; }
        }
      });
    } catch (_e) { void _e; }
  }
  // SWR 캐시는 즉시 (동기) — 직후 fetch 가 stale 보지 않게
  _clearAllSWRCache();
  // 사용자 prefix 키 정리는 idle 시점에 수행 (UI 안 막힘)
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => {
      _doPurgeStorage(localStorage);
      _doPurgeStorage(sessionStorage);
    }, { timeout: 1500 });
  } else {
    // rIC 미지원 브라우저는 즉시 동기 (구버전 사파리)
    _doPurgeStorage(localStorage);
    _doPurgeStorage(sessionStorage);
  }
}
window._purgeUserScopedStorage = _purgeUserScopedStorage;

// [H1 2026-07-16] 계정 전환 시 IndexedDB 까지 비운다.
//   _purgeUserScopedStorage 는 localStorage/sessionStorage 만 지운다. 그래서 로그아웃 없이
//   다른 계정으로 로그인하면 이전 원장의 작업실 초안(itdasy-gallery/slots)과 sync 메타
//   (migratedAt·lastPulledAt·tombstones)가 그대로 남아 있었다:
//     · 새 원장이 남의 초안을 봄(프라이버시 유출)
//     · 그 슬롯이 dirty 로 마킹되면 새 계정 서버로 업로드됨(계정 오염)
//     · 남의 lastPulledAt 을 커서로 써서 내 슬롯이 delta 에서 누락됨
//   [주의] 전환 시엔 이전 계정의 미동기화분을 push 하지 않는다 — 새 토큰으로 올리면 그게 바로
//     계정 오염이다. 버리는 게 맞다(로그아웃 경로는 토큰 살아있을 때 push 하고 지운다).
async function _purgeUserScopedDB() {
  try { if (typeof clearGalleryDB === 'function') await clearGalleryDB(); } catch (_e) { void _e; }
  try {
    if (window.WorkspaceSync && typeof window.WorkspaceSync.clearLocal === 'function') {
      await window.WorkspaceSync.clearLocal();
    }
  } catch (_e) { void _e; }
}
window._purgeUserScopedDB = _purgeUserScopedDB;

// 토큰에서 user_id 추출 (JWT payload.sub)
function _userIdFromToken(t) {
  try {
    if (!t) return null;
    const payload = JSON.parse(atob(t.split('.')[1]));
    const sub = payload && payload.sub;
    return sub != null ? String(sub) : null;
  } catch (_) { return null; }
}

// 새 토큰을 받았을 때 호출. 이전 user 와 다르면 캐시 일괄 클리어.
// 백엔드 /auth/me 호출해서 oauth_provider 도 함께 저장.
async function applyNewSession(newToken, opts) {
  opts = opts || {};
  const prevUserId = (() => { try { return localStorage.getItem('last_user_id'); } catch (_) { return null; } })();
  const newUserId = _userIdFromToken(newToken);

  // user 가 바뀌면 사용자 범위 데이터 전부 정리
  // [H1 2026-07-16] IndexedDB(작업실 슬롯 + sync 메타)도 반드시 같이 — storage 만 지우면
  //   이전 원장 초안이 남아 새 계정에 노출·오염된다. await 로 다음 진입 전에 확실히 비운다.
  if (newUserId && prevUserId && newUserId !== prevUserId) {
    _purgeUserScopedStorage();
    await _purgeUserScopedDB();
  } else if (opts.forcePurge) {
    _purgeUserScopedStorage();
    await _purgeUserScopedDB();
  }

  if (newUserId) {
    try { localStorage.setItem('last_user_id', newUserId); } catch (_) { /* storage full / private mode */ }
  }

  // /auth/me 동기화 — fire-and-forget (await 제거: 첫 진입 ~200ms 단축)
  // user_id 는 JWT payload.sub 로 이미 확보, email/oauth_provider 만 백그라운드 보강.
  apiFetch('/auth/me', {
    headers: { 'Authorization': 'Bearer ' + newToken },
  }).then(async (res) => {
    if (res && res.ok) {
      const me = await res.json();
      if (me) {
        try { if (me.email) localStorage.setItem('last_login_email', me.email); } catch (_) { void 0; }
        try { if (me.oauth_provider) localStorage.setItem('user_oauth_provider', me.oauth_provider); } catch (_) { void 0; }
        // [2026-05-07 26차 [F-3]] /me 응답에 shop 정보 있으면 localStorage 동기화
        // _USER_KEY_KEEP 에서 shop_* 빠진 뒤로 user 변경 시 매장명 폴백 노출 방지.
        try {
          // [BUG-LOAD-3] shop_name 빈 값이면 저장 안 함 — JSON.parse('') SyntaxError 방지
          if (typeof me.shop_name === 'string' && me.shop_name) localStorage.setItem('shop_name', me.shop_name);
          if (typeof me.shop_type === 'string' && me.shop_type) localStorage.setItem('shop_type', me.shop_type);
        } catch (_) { void 0; }
        // [2026-05-08 27차 [F-4]] /me 응답 도착 후 헤더/홈 즉시 재렌더 — 옛날 user 잔류 차단
        // renderHomeHeroCard 는 brief 인자 필수라 직접 호출 안 함 (브리프 fetch 후 별도 갱신).
        try {
          if (typeof window.updateHeaderProfile === 'function') {
            const handle = (typeof window._instaHandle === 'string') ? window._instaHandle : '';
            window.updateHeaderProfile(handle, null, '');
          }
          const settingsName = document.getElementById('settingsShopName');
          if (settingsName) settingsName.textContent = me.shop_name || '사장님';
          if (typeof window.renderHomeResume === 'function') {
            Promise.resolve(window.renderHomeResume()).catch(() => {});
          }
        } catch (_e) { void _e; }
      }
    }
  }).catch(() => { /* network error → 무시 */ });
  // sync 결과는 await 안 함 — UI 차단 회피
}
window.applyNewSession = applyNewSession;

function _setAuthGateLocked(locked) {
  if (document.body) document.body.classList.toggle('itdasy-locked', !!locked);
  const lock = document.getElementById('lockOverlay');
  if (lock) lock.setAttribute('aria-hidden', locked ? 'false' : 'true');
}

function _isIOSAppSurface() {
  try {
    if (window.Capacitor && typeof window.Capacitor.getPlatform === 'function') {
      if (window.Capacitor.getPlatform() === 'ios') return true;
    }
  } catch (_) { void 0; }
  return /iPad|iPhone|iPod/.test(navigator.userAgent || '');
}

function applyStoreReviewLoginGuard() {
  // T-320: iOS 에서 Apple 로그인 플러그인이 있으면 소셜 로그인 노출 가능
  // (Apple 심사 규정 — 타사 로그인 제공 시 Apple 로그인 필수. 플러그인 없으면 기존처럼 전부 숨김)
  const hasApple = !!(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SignInWithApple);
  const hideSocial = _isIOSAppSurface() && !hasApple;
  const divider = document.getElementById('loginSocialDivider');
  const wrap = document.getElementById('socialLoginWrap');
  if (divider) divider.style.display = hideSocial ? 'none' : '';
  if (wrap) wrap.style.display = hideSocial ? 'none' : '';
  const appleBtn = document.getElementById('loginAppleBtn');
  if (appleBtn) appleBtn.style.display = hasApple ? '' : 'none';
}
window.applyStoreReviewLoginGuard = applyStoreReviewLoginGuard;

function _bindLoginSocialButtons() {
  const google = document.getElementById('loginGoogleBtn');
  const kakao = document.getElementById('loginKakaoBtn');
  const naver = document.getElementById('loginNaverBtn');
  if (google && !google._itdasyBound) {
    google._itdasyBound = true;
    google.addEventListener('click', () => window.startGoogleLogin && window.startGoogleLogin());
  }
  if (kakao && !kakao._itdasyBound) {
    kakao._itdasyBound = true;
    kakao.addEventListener('click', () => window.startKakaoLogin && window.startKakaoLogin());
  }
  if (naver && !naver._itdasyBound) {
    naver._itdasyBound = true;
    naver.addEventListener('click', () => window.startNaverLogin && window.startNaverLogin());
  }
  const apple = document.getElementById('loginAppleBtn');
  if (apple && !apple._itdasyBound) {
    apple._itdasyBound = true;
    apple.addEventListener('click', () => window.startAppleLogin && window.startAppleLogin());
  }
}

function setToken(t) {
  // [보안감사 H-3 2026-07-27] secure 모드 OFF → 아래 블록은 원본 그대로(byte-for-byte). 웹·플러그인없는네이티브는 항상 여기.
  if (!_secureMode) {
    try {
      // 토큰 값이 바뀌면 (다른 계정·재로그인·로그아웃) 모든 SWR 캐시 무효화.
      let prev = null;
      try { prev = localStorage.getItem(_TOKEN_KEY); } catch (_e) { void _e; }
      if (prev !== t) {
        _clearAllSWRCache();
      }
      if (t === null || t === undefined) {
        localStorage.removeItem(_TOKEN_KEY);
      } else {
        localStorage.setItem(_TOKEN_KEY, t);
      }
    } catch (_) { /* 용량 초과/시크릿 모드 조용히 무시 */ }
    return;
  }
  // [보안감사 H-3] secure 모드 ON → 캐시 갱신 + (변경 시)SWR 무효화 + 영속화.
  try {
    const next = (t === null || t === undefined) ? null : t;
    const prev = _tokenCache;
    if (prev !== next) { _clearAllSWRCache(); }  // 이전 캐시와 비교(OFF 경로의 prev !== t 와 동일 취지)
    _tokenCache = next;
    _tokenReady = true;
    // 웹(비네이티브)에서는 동기 localStorage 로 즉시 반영 — 리로드 즉시 견디게(기존 sync 의미 보존).
    const maybeNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    if (!maybeNative) {
      try {
        if (next === null) { localStorage.removeItem(_TOKEN_KEY); }
        else { localStorage.setItem(_TOKEN_KEY, next); }
      } catch (_e) { void _e; }
      return;
    }
    // 네이티브 → 보안저장(있으면). 넣었으면 평문 복사본 제거. 없으면 localStorage 폴백.
    (async () => {
      try {
        const secure = await _secureTokenStore();
        if (secure) {
          if (next === null) { await secure.remove(); }
          else { await secure.set(next); }
          try { localStorage.removeItem(_TOKEN_KEY); } catch (_e) { void _e; }  // 평문 복사본 제거
        } else {
          try {
            if (next === null) { localStorage.removeItem(_TOKEN_KEY); }
            else { localStorage.setItem(_TOKEN_KEY, next); }
          } catch (_e) { void _e; }
        }
      } catch (_e) { void _e; }
    })();
  } catch (_) { /* 조용히 무시 */ }
}
function authHeader() {
  // [2026-04-28 진짜 fix] ngrok-skip-browser-warning 헤더 제거.
  // 어제 보안 픽스에서 CORS allow_headers 명시 화이트리스트로 변경한 후
  // 이 헤더가 리스트에 없어서 모든 인증 요청이 CORS preflight 에서 400 거부됨.
  // 사용자가 본 "네트워크 연결을 확인해주세요" 의 진짜 원인.
  // ngrok 은 개발 환경 전용이라 운영에선 불필요.
  const t = getToken();
  return t ? { 'Authorization': 'Bearer ' + t } : {};
}

// 전역 fetch 래퍼 — 401 자동 로그아웃 + 5xx/네트워크 에러 자동 재시도 (T-352)
(function _installFetchInterceptor(){
  if (window._fetchPatched) return;
  window._fetchPatched = true;
  const _origFetch = window.fetch.bind(window);

  // 재시도 설정: GET/HEAD + JSON body(string) POST 는 재시도 가능. FormData/Blob 은 body 재사용 불가라 제외.
  // 500 추가: Railway cold start 시 일시적 500 응답도 재시도 대상.
  const RETRY_STATUSES = new Set([500, 502, 503, 504]);
  const MAX_RETRIES = 3;              // 총 4회 시도 (초기 + 3회 재시도)
  const BACKOFF_MS = [500, 1500, 4000]; // exponential backoff (cold start 대응)
  // [2026-05-13] Cloud Run cold start 대응 — 인스턴스 0→1 기동에 5~15초.
  // 기본 fetch 는 timeout 없어 모바일에서 무한 hang → "Failed to fetch" 토스트가 안 떠도
  // 화면이 멈춤. 첫 시도는 넉넉히 20초, 재시도는 12초 (인스턴스 warm 이면 빠름).
  const FETCH_TIMEOUT_FIRST_MS = 20000;
  const FETCH_TIMEOUT_RETRY_MS = 12000;

  // [2026-07-22 보스] AI(LLM) 호출은 20초로 끊으면 안 된다 — 잇비 답변·캡션 생성은 15~60초가 정상이다.
  //   기존 동작: 20초에 abort → 12초짜리 재시도 3회(재시도마다 서버에서 '진짜 LLM 호출'이 새로 돌아 돈이 나감)
  //   → 60초쯤 뒤 "실패했어요". 원장 눈엔 '잇비도 캡션도 아무것도 안 됨'. 백엔드는 멀쩡했다.
  //   고침: ① LLM 경로는 120초까지 기다린다(Cloud Run 요청 상한 300초 안쪽)
  //         ② 타임아웃/네트워크 끊김으로는 재시도하지 않는다(서버는 아직 생성 중 → 재시도는 중복 과금).
  //         ③ 단, 5xx(콜드스타트 등 서버가 실제로 실패한 경우)는 기존대로 재시도한다.
  const LLM_TIMEOUT_MS = 120000;
  // 느린 게 정상인 생성형 엔드포인트. 경로 조각으로 판정(절대 URL·상대 경로 둘 다 매칭).
  const LLM_PATH_RE = /\/(assistant|caption|persona)\/|\/image\/(enhance|remove-bg|remove-object|generate-bg|detect-face|blur-face)/;
  function _isLlmCall(input) {
    try {
      const u = typeof input === 'string' ? input : (input && input.url) || '';
      return LLM_PATH_RE.test(u);
    } catch (_) { return false; }
  }

  // 호출자 signal 보존하면서 timeout 까지 보호하는 fetch 헬퍼.
  // timeout 으로 abort 된 경우는 wrapper 의 retry 분기가 받아서 재시도하도록
  // 호출자의 init.signal 은 건드리지 않는다 (catch 에서 caller-abort 판단 그대로 유지).
  function _fetchWithTimeout(input, init, timeoutMs) {
    const ctl = new AbortController();
    const callerSignal = init && init.signal;
    const onCallerAbort = () => ctl.abort();
    if (callerSignal) {
      if (callerSignal.aborted) ctl.abort();
      else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const newInit = { ...(init || {}), signal: ctl.signal };
    return _origFetch(input, newInit).finally(() => {
      clearTimeout(timer);
      if (callerSignal) {
        try { callerSignal.removeEventListener('abort', onCallerAbort); } catch (_) { /* ignore */ }
      }
    });
  }

  // [2026-07-23] 재시도하면 '손님에게 두 번 나가는' 경로. body 가 재사용 가능해도 절대 재시도 금지.
  //   사고 경로: 서버가 인스타 Graph 에 공개 답글을 이미 성공적으로 게시했는데 응답이 돌아오는 길에
  //   끊기거나 20초 타임아웃(Cloud Run 콜드스타트 + Graph 왕복이면 충분히 난다) → 래퍼가 같은 POST 를
  //   다시 쏨 → 같은 댓글에 답글 2개. 원장 피드에 그대로 남고 앱에서 지울 방법도 없다.
  //   서버에도 멱등성 방어를 넣었지만(CommentReplyLog 선조회) 클라도 안 쏘는 게 맞다.
  //   경로는 실제 라우트를 보고 적었다. 헷갈리기 쉬운 두 곳:
  //     · comment-reply-settings 는 설정 저장이라 재시도해도 안전 → 제외(negative lookahead).
  //     · send_edit 은 '_' 가 단어문자라 /send\b/ 로는 안 걸린다. 명시적으로 나열한다.
  const NO_RETRY_PATH_RE = new RegExp(
    '/(' + [
      'instagram/comment-reply(?!-settings)',                          // 공개 답글
      'instagram/publish',                                             // 인스타 발행(+ -file/-carousel-file/-story-file)
      'scheduled-posts',                                               // 예약 발행 등록
      'dm-confirm-queue/[^/]+/(send|send_edit|send-form|confirm-deposit|decline-with-alternatives)',
      // [출시감사 P1-1 2026-07-31] 결제는 재시도하면 카드가 두 번 긁힌다.
      //   서버가 호출마다 새 payment_id 로 PortOne 에 실청구하므로(billing.py:84-86,243)
      //   멱등 검사(_already_processed)가 아예 걸리지 않는다. 실제 경로: 청구 성공 →
      //   결제 재조회가 502 → 래퍼가 재시도 → 두 번째 청구. 버튼 disable 로는 못 막는다(네트워크 계층).
      'billing/(issue|onetime/verify|cancel)',
    ].join('|') + ')'
  );
  function _isNoRetryPath(input) {
    try {
      const u = typeof input === 'string' ? input : (input && input.url) || '';
      return NO_RETRY_PATH_RE.test(String(u));
    } catch (_) { return false; }
  }
  // [보안감사 C-4 2026-07-26] 예약·매출·고객 '생성' POST 는 재시도 금지.
  //   서버가 이미 커밋했는데 응답이 돌아오는 길에 끊기면(WiFi↔LTE 핸드오프·지하철) 래퍼가
  //   같은 POST 를 다시 쏴서 같은 예약/매출이 2건 생긴다(멱등키 없음 → 돈 숫자·이중예약 사고).
  //   GET(?쿼리)·PATCH/{id}·DELETE/{id} 는 읽기/멱등이라 안전 → 재시도 유지. 컬렉션 POST 만 막는다.
  const CREATE_NO_RETRY_RE = /\/(bookings|revenue|customers)(\?|$)/;
  function _isNonIdempotentCreate(input, init) {
    try {
      const m = (init && init.method ? String(init.method).toUpperCase() : 'GET');
      if (m !== 'POST') return false;
      const u = typeof input === 'string' ? input : (input && input.url) || '';
      return CREATE_NO_RETRY_RE.test(String(u));
    } catch (_) { return false; }
  }
  function _isRetryableMethod(init) {
    const m = (init && init.method ? String(init.method).toUpperCase() : 'GET');
    if (m === 'GET' || m === 'HEAD') return true;
    // JSON body(string) POST 는 body 재사용 가능 → 재시도 허용
    if (m === 'POST' && init && typeof init.body === 'string') return true;
    return false;
  }
  function _bodyReusable(init) {
    if (!init || !init.body) return true;
    const b = init.body;
    if (typeof b === 'string') return true;
    return false; // FormData/Blob/ReadableStream 은 한 번만 읽을 수 있어서 재시도 시 body 재사용 불가
  }

  function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  let _reconnectToastTimer = null;
  // [버그2 2026-07-25] 단발 실패로는 안 띄움 — 20초 안에 최종 실패 2건 이상일 때만 토스트.
  //   로그인 직후 병렬 호출 여러 개 중 1건이 일시 삐끗(콜드스타트 등)해도 "연결 불안정"이
  //   너무 자주 뜨던 것 방지. 성공 응답이 오면 카운터 리셋(아래 fetch 래퍼).
  let _connFailCount = 0;
  let _connFailFirstAt = 0;
  function _resetConnFail() { _connFailCount = 0; _connFailFirstAt = 0; }
  function _showReconnectToast() {
    const _now = Date.now();
    if (!_connFailFirstAt || _now - _connFailFirstAt > 20000) { _connFailFirstAt = _now; _connFailCount = 0; }
    _connFailCount++;
    if (_connFailCount < 2) return;
    if (window.__itdasyReconnectShown) return;
    window.__itdasyReconnectShown = true;
    try {
      if (typeof window.showToast === 'function') {
        window.showToast('서버 연결이 불안정해요. 자동으로 다시 시도 중...');
      }
    } catch (_) { /* ignore */ }
    clearTimeout(_reconnectToastTimer);
    _reconnectToastTimer = setTimeout(() => { window.__itdasyReconnectShown = false; }, 8000);
  }

  let _refreshing = false;
  let _refreshWaiters = [];

  async function _tryRefresh() {
    if (_refreshing) {
      return new Promise((res, rej) => _refreshWaiters.push({ res, rej }));
    }
    _refreshing = true;
    try {
      const tok = getToken();
      // [BUG-2] 10초 타임아웃 — 서버 무응답 시 앱 hang 방지
      const _ac = new AbortController();
      const _to = setTimeout(() => _ac.abort(), 10000);
      let r;
      try {
        r = await _origFetch(apiUrl('/auth/refresh'), {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' },
          signal: _ac.signal,
        });
      } finally {
        clearTimeout(_to);
      }
      if (!r.ok) throw new Error('refresh_failed');
      const data = await r.json();
      setToken(data.access_token);
      _refreshWaiters.forEach(w => w.res(data.access_token));
      return data.access_token;
    } catch (e) {
      _refreshWaiters.forEach(w => w.rej(e));
      throw e;
    } finally {
      _refreshing = false;
      _refreshWaiters = [];
    }
  }

  function _handle401() {
    setToken(null);
    const msg = document.getElementById('sessionExpiredMsg');
    if (msg) msg.style.display = 'block';
    const lock = document.getElementById('lockOverlay');
    if (lock) lock.classList.remove('hidden');
    _setAuthGateLocked(true);
  }

  // [보안감사 H-6 2026-07-27] 401 자동 리프레시/재첨부는 우리 API 오리진에만.
  //   전역 fetch 패치라 Supabase·R2·인스타·공격자 URL 등 아무 호스트가 401 을 주면
  //   원장 JWT 가 그 호스트로 재첨부돼 유출됐다(cross-origin 토큰 유출). 오리진 대조로 차단.
  function _isApiOrigin(input) {
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (!window.API) return false;
      return new URL(url, location.href).origin === new URL(window.API, location.href).origin;
    } catch (_e) { void _e; return false; }
  }

  window.fetch = async function(input, init) {
    const retryable = _isRetryableMethod(init) && _bodyReusable(init) && !_isNoRetryPath(input) && !_isNonIdempotentCreate(input, init);
    const isLlm = _isLlmCall(input);   // [2026-07-22] 생성형 호출 — 오래 기다리되 타임아웃 재시도는 안 함
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // [fix] 캐러셀(여러장) 인스타 발행은 컨테이너 순차 폴링으로 25~50초+ → 호출부가 itdasyTimeoutMs 로 타임아웃 상향 가능(기본 20초는 abort됨)
      const _customTmo = init && init.itdasyTimeoutMs;
      const _tmo = _customTmo
        || (isLlm ? LLM_TIMEOUT_MS : (attempt === 0 ? FETCH_TIMEOUT_FIRST_MS : FETCH_TIMEOUT_RETRY_MS));
      try {
        const res = await _fetchWithTimeout(input, init, _tmo);
        if (res.ok) _resetConnFail();   // [버그2] 성공 응답 = 연결 정상 — 실패 카운터 리셋
        if (res.status === 401 && getToken() && _isApiOrigin(input)) {
          // /auth/refresh 자체가 401이면 무한루프 방지
          const url = typeof input === 'string' ? input : (input.url || '');
          if (url.includes('/auth/refresh') || url.includes('/auth/login')) {
            _handle401();
            return res;
          }
          try {
            const newTok = await _tryRefresh();
            // 갱신된 토큰으로 원 요청 재시도 (refresh 후 fetch 는 timeout 짧게)
            const newInit = { ...init, headers: { ...(init && init.headers), 'Authorization': 'Bearer ' + newTok } };
            return await _fetchWithTimeout(input, newInit, FETCH_TIMEOUT_RETRY_MS);
          } catch (_e) {
            _handle401();
            return res;
          }
        }
        // [2026-07-22 보스] 서버가 Retry-After 로 "지금 다시 때리지 마"라고 하면 재시도하지 않는다.
        //   실제 사고: AI 쿼터가 마르면 잇비가 한 번 실패에 23~29초를 태우는데(백엔드가 Gemini 를
        //   3회 재시도), 그게 5xx 라 프론트가 4번 더 때려서 "야" 한마디에 1분 넘게 걸렸다.
        //   재시도해도 쿼터가 빈 건 그대로고, 매 재시도가 쿼터를 더 갉아먹는다.
        //   콜드스타트 같은 '진짜 일시적' 5xx 는 Retry-After 를 안 붙이므로 기존대로 재시도된다.
        var _retryAfter = '';
        try { _retryAfter = (res.headers && res.headers.get) ? (res.headers.get('Retry-After') || '') : ''; } catch (_) { _retryAfter = ''; }
        if (_retryAfter) return res;
        // 5xx 게이트웨이성 에러: retryable 이면 재시도.
        // [핫픽스F #5-9] 토스트는 "재시도까지 모두 실패한 최종 실패"에서만. 재시도로 회복되면 무noise →
        //   예약 추가/변경이 retry 로 성공한 뒤 "서버 불안정" 문구가 뜨던 버그 차단(성공/실패 상태 분리).
        // [보안감사 C-4] LLM 은 500(핸들러 내부 실패 = 이미 모델이 돌아 과금됨) 재시도 금지.
        //   502/503/504(게이트웨이·콜드스타트 = 과금 전) 만 재시도해 이중 과금을 막는다.
        const _retryStatusOk = isLlm
          ? (res.status === 502 || res.status === 503 || res.status === 504)
          : RETRY_STATUSES.has(res.status);
        if (retryable && _retryStatusOk) {
          if (attempt < MAX_RETRIES) {
            await _sleep(BACKOFF_MS[attempt] || 1500);
            attempt++;
            continue;
          }
          _showReconnectToast();   // 재시도 소진 후 최종 실패
        }
        return res;
      } catch (err) {
        // 호출자 AbortController 가 이미 abort한 경우 → 재시도 없이 즉시 전파
        // (재시도해도 즉시 abort되어 toast만 쌓이는 문제 방지)
        if (err.name === 'AbortError' && init && init.signal && init.signal.aborted) {
          throw err;
        }
        // 네트워크 에러 (DNS·오프라인·CORS·abort) — retryable 한정으로 재시도.
        // [2026-07-22] LLM 호출은 여기서 재시도하지 않는다. 타임아웃 시점에 서버는 아직 답을 만들고 있어서,
        //   재시도 = 같은 질문을 한 번 더 생성시키는 중복 과금이고 사용자 체감 시간만 3배로 늘었다.
        if (retryable && !isLlm && attempt < MAX_RETRIES) {
          await _sleep(BACKOFF_MS[attempt] || 1500);
          attempt++;
          continue;
        }
        // [핫픽스F #5-9] 재시도(≥1회)까지 모두 실패한 최종 네트워크 실패에서만 토스트.
        if (retryable && attempt >= 1) _showReconnectToast();
        throw err;
      }
    }
  };
})();

function getMyUserId() {
  try {
    const token = getToken();
    if (!token) return null;
    return parseInt(JSON.parse(atob(token.split('.')[1])).sub);
  } catch { return null; }
}

// ───── 스플래시 스크린 (iOS PWA 전용) ─────
// 2026-05-01 ── 이미 로그인된 사용자는 splash 짧게 (2s → 600ms). 토큰 없으면 그대로 2s
// (브랜드 노출). 또한 splash 끝나자마자 pointer-events 복구로 네비 즉시 클릭 가능.
(function initSplash() {
  const isPWA = window.navigator.standalone === true
             || window.matchMedia('(display-mode: standalone)').matches;
  if (!isPWA) return;

  const splash = document.getElementById('splashScreen');
  if (!splash) return;

  document.body.classList.add('splashing');
  splash.style.display = 'flex';

  // 토큰 있으면 짧게 (이미 로그인된 사용자는 splash 안 보고 싶어함)
  let tokenExists = false;
  try { tokenExists = !!getToken(); } catch (e) { console.warn('[splash] 토큰 확인 실패', e); }
  const HOLD_MS = tokenExists ? 600 : 2000;

  setTimeout(() => {
    splash.classList.add('fade-out');
    // pointer-events 즉시 복구 — 페이드아웃 동안에도 탭바/콘텐츠 클릭 가능
    document.body.classList.remove('splashing');
    setTimeout(() => { splash.style.display = 'none'; }, 300);
  }, HOLD_MS);

  // BFCache 복귀 보강 — Safari가 페이지를 메모리에서 되살릴 때 .splashing 잔존으로
  //   추천 chip의 pointer-events가 막히는 케이스. 복귀 즉시 정리.
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    document.body.classList.remove('splashing');
    if (splash) splash.style.display = 'none';
  });
})();

// ───── 설정 바텀시트 ─────
// [v162] 1번 설정 시트 → 3번 설정·연동 허브로 리다이렉트.
// settingsSheet DOM 은 그대로 두되 (다른 곳에서 참조 가능성), 진입은 허브로만.
function openSettings() {
  if (typeof window.openSettingsHub === 'function') {
    window.openSettingsHub();
  }
}

function closeSettings() {
  const sheet = document.getElementById('settingsSheet');
  const card  = document.getElementById('settingsCard');
  if (!sheet || !card) return;
  card.classList.remove('open');
  setTimeout(() => { sheet.style.display = 'none'; }, 280);
  // [2026-04-26 A5] hash 정리
  try { if (typeof window._markSheetClosed === 'function') window._markSheetClosed('settings'); } catch (_e) { void _e; }
}

async function resetShopSetup() {
  // [2026-05-08 27차 [H]] 샵 재설정 시 인스타·말투까지 함께 정리
  if (!(await nativeConfirm(
    "확인",
    '샵 이름·종류·인스타 연동·말투 분석을 모두 처음 상태로 돌릴까요?'
  ))) return;

  // 1. 백엔드 인스타 해제 (실패해도 진행)
  try {
    await apiFetch('/instagram/disconnect', { method: 'POST', headers: authHeader() });
  } catch (_e) { void _e; }

  // 2. 로컬 정리 — 샵·온보딩·인스타 동의·말투 분석
  ['shop_name', 'shop_type', 'onboarding_done',
   'itdasy_consented', 'itdasy_consented_at', 'itdasy_latest_analysis',
   'itdasy:ig_profile_pic', 'itdasy:ig_handle', 'itdasy:ig_connected_cache']
    .forEach(k => { try { localStorage.removeItem(k); } catch (_e) { void _e; } });

  // 3. 메모리 + 헤더/말투 카드 즉시 비우기
  try { _instaHandle = ''; } catch (_e) { void _e; }
  try { if (typeof window !== 'undefined') window._instaHandle = ''; } catch (_e) { void _e; }
  if (typeof updateHeaderProfile === 'function') updateHeaderProfile('', '', '');
  const pd = document.getElementById('personaDash');
  if (pd) { pd.style.display = 'none'; const pc = document.getElementById('personaContent'); if (pc) pc.innerHTML = ''; }

  // 4. 온보딩 오버레이 띄우기 (기존 동작 유지)
  const ob = document.getElementById('onboardingOverlay');
  if (ob) ob.classList.remove('hidden');
}

async function localReset() {
  if (!(await nativeConfirm("확인", '앱을 처음 상태로 초기화할까요?\n(로그인은 유지됩니다)'))) return;
  ['itdasy_consented','itdasy_consented_at','itdasy_latest_analysis',
   'onboarding_done','shop_name','shop_type'].forEach(k => localStorage.removeItem(k));
  // 인스타 연동도 백엔드에서 해제
  try {
    const res = await apiFetch('/instagram/disconnect', { method: 'POST', headers: authHeader() });
    if (!res.ok && typeof window.showToast === 'function') window.showToast('인스타 연결 해제에 실패했어요');
  } catch (_) { /* network failure — UI 상태는 이미 초기화됨 */ }
  location.reload();
}

function checkCbt1Reset() {
  if (getMyUserId() === 1) {
    const el = document.getElementById('cbt1ResetArea');
    if (el) el.style.display = 'block';
  }
}

async function fullReset() {
  if (!(await nativeConfirm("확인", '모든 데이터(온보딩·샵설정·인스타연동·말투분석)가 초기화됩니다.\n정말 처음부터 시작할까요?'))) return;
  try {
    const res = await apiFetch('/admin/reset', { method: 'POST', headers: authHeader() });
    if (!res.ok) throw new Error('초기화 실패');
    [_TOKEN_KEY,_LEGACY_TOKEN_KEY,'itdasy_consented','itdasy_consented_at','itdasy_latest_analysis','onboarding_done','shop_name','shop_type','itdasy_master_set'].forEach(k => localStorage.removeItem(k));
    // 말투 카드 즉시 숨기기
    const pd = document.getElementById('personaDash');
    if (pd) { pd.style.display = 'none'; const pc = document.getElementById('personaContent'); if (pc) pc.innerHTML = ''; }
    showToast('초기화 완료! 처음부터 시작합니다.');
    setTimeout(() => location.reload(), 800);
  } catch(e) {
    showToast('초기화 중 오류가 발생했습니다.');
  }
}

function handle401() {
  setToken(null);
  document.body.style.transform  = '';
  document.body.style.transition = '';
  document.getElementById('lockOverlay').classList.remove('hidden');
  document.getElementById('sessionExpiredMsg').style.display = 'block';
  _setAuthGateLocked(true);
}

// ──────────────────────────────────────────────
// 계정 탈퇴 (Apple Guideline 5.1.1(ix) 필수)
// ──────────────────────────────────────────────
// ───── 비밀번호 변경 (2026-08-01 출시감사) ─────
//   백엔드 POST /auth/change-password 는 예전부터 있었는데 화면이 없어서
//   사장님이 앱에서 비번을 바꿀 방법이 아예 없었다. "누가 내 계정 쓰는 것 같다"의
//   첫 대응이 비번 변경인데 그게 막혀 있던 셈.
function openChangePwModal() {
  const m = document.getElementById('changePwModal');
  if (!m) return;
  m.style.display = 'flex';
  ['cpwCurrent', 'cpwNew', 'cpwConfirm'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  _cpwMsg('');
  // 안드로이드 back 으로 닫히게 등록 — 안 하면 back 이 이 모달 대신 앱을 그대로 끈다.
  //   _registerSheet 로 '닫는 방법'을 먼저 알려주고 _markSheetOpen 으로 열렸다고 표시한다.
  if (typeof window._registerSheet === 'function') window._registerSheet('changePw', closeChangePwModal);
  if (typeof window._markSheetOpen === 'function') window._markSheetOpen('changePw');
  setTimeout(() => { const el = document.getElementById('cpwCurrent'); if (el) el.focus(); }, 100);
}

function closeChangePwModal() {
  const m = document.getElementById('changePwModal');
  if (m) m.style.display = 'none';
  if (typeof window._markSheetClosed === 'function') window._markSheetClosed('changePw');
}

function _cpwMsg(text, kind) {
  const el = document.getElementById('cpwMsg');
  if (!el) return;
  if (!text) { el.style.display = 'none'; el.textContent = ''; return; }
  el.style.display = 'block';
  el.textContent = text;
  const ok = kind === 'ok';
  el.style.background = ok ? '#e8f5e9' : '#fdecea';
  el.style.color = ok ? '#0a7b3e' : '#b00020';
}

async function submitChangePw() {
  const btn = document.getElementById('cpwSubmit');
  const cur = (document.getElementById('cpwCurrent') || {}).value || '';
  const nw = (document.getElementById('cpwNew') || {}).value || '';
  const cf = (document.getElementById('cpwConfirm') || {}).value || '';

  if (!cur || !nw) { _cpwMsg('현재 비밀번호와 새 비밀번호를 모두 입력해주세요'); return; }
  if (nw !== cf) { _cpwMsg('새 비밀번호가 서로 달라요'); return; }
  if (nw === cur) { _cpwMsg('지금 쓰는 비밀번호와 같아요'); return; }
  // 서버(_validate_password)가 최종 판정하지만, 왕복 없이 바로 알려주는 게 친절하다
  if (nw.length < 8) { _cpwMsg('새 비밀번호는 8자 이상이어야 해요'); return; }

  if (btn) { btn.disabled = true; btn.textContent = '변경 중…'; }
  _cpwMsg('');
  try {
    const res = await apiFetch('/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: cur, new_password: nw }),
    });
    if (res.ok) {
      closeChangePwModal();
      showToast('비밀번호를 바꿨어요. 다른 기기에서는 다시 로그인해주세요');
      return;
    }
    // 400 = 현재 비번 불일치 / 규칙 위반. 서버 문구를 그대로 쓰는 게 가장 정확하다
    let detail = '';
    try { detail = (await res.json()).detail || ''; } catch (_e) { void _e; }
    _cpwMsg(detail || '비밀번호를 바꾸지 못했어요. 잠시 후 다시 시도해주세요');
  } catch (_e) {
    _cpwMsg('연결이 불안정해요. 잠시 후 다시 시도해주세요');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '변경하기'; }
  }
}

function openDeleteAccountModal() {
  const modal = document.getElementById('deleteAccountModal');
  if (!modal) return;
  modal.style.display = 'flex';
  const input = document.getElementById('deleteAccountConfirmInput');
  if (input) { input.value = ''; setTimeout(() => input.focus(), 100); }
  const err = document.getElementById('deleteAccountError');
  if (err) err.style.display = 'none';
}

function closeDeleteAccountModal() {
  const modal = document.getElementById('deleteAccountModal');
  if (modal) modal.style.display = 'none';
}

let _deleteAccountInFlight = false;
async function confirmDeleteAccount() {
  if (_deleteAccountInFlight) return;
  const input = document.getElementById('deleteAccountConfirmInput');
  const err = document.getElementById('deleteAccountError');
  const btn = document.getElementById('deleteAccountConfirmBtn');
  const v = (input?.value || '').trim();
  if (v !== '탈퇴') {
    if (err) { err.textContent = '"탈퇴" 두 글자를 정확히 입력해주세요.'; err.style.display = 'block'; }
    return;
  }
  // 마지막 한번 더 확인
  if (!(await nativeConfirm('최종 확인', '정말로 계정을 영구 삭제합니다. 이 작업은 되돌릴 수 없습니다. 계속할까요?'))) return;

  _deleteAccountInFlight = true;
  if (btn) { btn.textContent = '삭제 중...'; btn.disabled = true; }
  try {
    const res = await fetch(`${API}/auth/delete-account`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getToken()}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || `삭제 실패 (${res.status})`);
    }
    // 세션·캐시 전면 삭제
    setToken(null);
    try { localStorage.clear(); } catch (e) { console.warn('[auth] 로컬 데이터 삭제 실패', e); }
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      } catch (e) { console.warn('[auth] 캐시 삭제 실패', e); }
    }
    showToast('계정이 완전히 삭제되었습니다. 이용해 주셔서 감사합니다.', 'success');
    setTimeout(() => { location.href = 'index.html'; }, 1200);
  } catch (e) {
    if (err) { err.textContent = e.message || '삭제 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'; err.style.display = 'block'; }
    if (btn) { btn.textContent = '영구 삭제'; btn.disabled = false; }
  } finally {
    _deleteAccountInFlight = false;
  }
}

async function logout(opts) {
  opts = opts || {};
  // [2026-05-08 28차 [J]] skipConfirm — disconnectInstagram 등 다른 흐름에서 이중 컨펌 방지
  if (!opts.skipConfirm && !(await nativeConfirm("확인", "로그아웃 하시겠습니까? 세션과 캐시가 모두 초기화됩니다."))) return;

  // [H2 2026-07-16] 토큰을 지우기 전에 미동기화분을 서버로 올린다.
  //   기존 순서는 setToken(null) → ... → clearGalleryDB/clearLocal 이라, 아직 push 안 된 편집과
  //   아직 못 보낸 삭제(tombstone)가 그대로 삭제됐다:
  //     · 편집 직후(1.2s debounce 안에) 로그아웃 → 그 편집은 서버에도 없고 로컬에서도 사라짐(영구 손실)
  //     · 오프라인 삭제 후 로그아웃 → tombstone 소멸 → 서버 DELETE 가 영영 안 나가 다음 로그인에 부활
  //   settleSlot() = pushAll(dirty 업로드) + flushTombstones(삭제 전송). 토큰이 살아있는 지금만 가능.
  //   [주의] 네트워크가 죽었으면 로그아웃이 막히면 안 되므로 타임아웃으로 끊고 진행한다.
  try {
    if (window.WorkspaceSync && typeof window.WorkspaceSync.settleSlot === 'function') {
      await Promise.race([
        Promise.resolve(window.WorkspaceSync.settleSlot()).catch(() => {}),
        new Promise((res) => setTimeout(res, 4000)),
      ]);
    }
  } catch (_e) { void _e; }

  // [보안감사 H-4 2026-07-27] 서버측 세션 무효화 — 토큰을 지우기 전에 호출.
  //   로컬 토큰만 지우면 탈취된 JWT 는 24h 만료까지 살아있고 /auth/refresh 로 무한 갱신됨.
  //   /auth/logout 이 users.min_valid_iat 를 올려 그 이전 발급 토큰을 전부 거부시킨다.
  //   네트워크 실패해도 로컬 로그아웃은 진행돼야 하므로 best-effort(타임아웃 포함) 로 감싼다.
  try {
    await Promise.race([
      apiFetch('/auth/logout', { method: 'POST', headers: authHeader() }).catch(() => {}),
      new Promise((res) => setTimeout(res, 3000)),
    ]);
  } catch (_e) { void _e; }

  // 1. 토큰 및 사용자 범위 스토리지 광범위 삭제
  setToken(null);
  // [2026-05-07 26차] 메모리 변수도 명시 클리어 — _purgeUserScopedStorage 는 storage 만 청소함.
  // 누락 시 다른 user 로그인 후에도 이전 user 의 인스타 핸들이 남아 헤더/캡션 미리보기에 노출됨.
  _instaHandle = '';
  try { if (typeof window !== 'undefined') window._instaHandle = ''; } catch (_e) { void _e; }
  // 사용자 식별 / 캐시 / 페르소나·일정·세션 컨텍스트 일괄 정리
  // (온보딩·테마·생체등록 같은 디바이스 설정은 _USER_KEY_KEEP 가 보존)
  try { _purgeUserScopedStorage(); } catch (_e) { void _e; }
  // 호환성 — 옛 단일 키도 함께 제거
  // [2026-05-08 28차 hotfix] itdasy_ipc_dismissed (잇비 카드 닫기 상태) +
  // itdasy:ig_connected_cache (콜론 prefix 라 _purgeUserScopedStorage 의 itdasy_ 매칭 못 함) 명시 정리.
  [_LEGACY_TOKEN_KEY, 'itdasy_ipc_dismissed', 'itdasy:ig_connected_cache',
   'itdasy_consented', 'itdasy_consented_at', 'itdasy_latest_analysis'].forEach(k => {
    try { localStorage.removeItem(k); } catch (_e) { void _e; }
  });

  // [2026-04-26] 갤러리 IndexedDB 도 같이 비움 — 다음 사용자한테 새는 거 차단 (Meta 심사 블로커)
  try {
    if (typeof clearGalleryDB === 'function') {
      await clearGalleryDB();
    }
  } catch (e) { /* IDB clear best-effort */ }

  // [2026-07-06] slot-sync 메타 DB(itdasy-sync: migratedAt·lastPulledAt·tombstones)도 삭제 —
  //   안 지우면 다음 계정에서 migrate skip·delta 누락으로 계정 격리 붕괴 + slot 유실.
  try {
    if (window.WorkspaceSync && typeof window.WorkspaceSync.clearLocal === 'function') {
      await window.WorkspaceSync.clearLocal();
    }
  } catch (e) { /* sync meta clear best-effort */ }

  // 2. 서비스 워커 캐시 강제 삭제
  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    } catch (e) { /* cache clear best-effort */ }
  }

  // [v182.1 2026-05-18] SW 자체 unregister — 캐시 비웠지만 SW 가 active 상태로
  //   다음 페이지 요청을 인터셉트해서 흰화면 발생. unregister 해야 깨끗하게 리로드됨.
  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    } catch (e) { /* SW unregister best-effort */ }
  }

  // [v203.1 2026-05-19] sessionStorage 의 build_busted 도 청소 — mismatch 가드가 새 로드 시 재시도 가능하게
  try { sessionStorage.clear(); } catch (_e) { void _e; }

  // [v203.1] SW unregister 가 비동기적으로 완료될 시간 확보 (~100ms) — 즉시 reload 시
  //   SW 가 아직 active 상태로 다음 페이지 인터셉트 가능성 있음.
  await new Promise(r => setTimeout(r, 150));

  // 3. 페이지 새로고침 — cache bust 쿼리로 SW/브라우저 캐시 우회
  location.replace('index.html?_logout=' + Date.now());
}

// [2026-06-20] 앱 강제 업데이트 — 코드 캐시·서비스워커 비우고 리로드(껐다 켠 효과). 로그인·데이터(localStorage)는 유지.
window.forceAppUpdate = async function () {
  try { if (window.showToast) window.showToast('최신 버전 받는 중…'); } catch (_e) { void _e; }
  try { if ('caches' in window) { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); } } catch (_e) { void _e; }
  try { if ('serviceWorker' in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())); } } catch (_e) { void _e; }
  try { sessionStorage.clear(); } catch (_e) { void _e; }
  await new Promise(r => setTimeout(r, 150));
  location.replace(location.pathname + '?_upd=' + Date.now());
};


// 로그인
let _loginInFlight = false;
async function login() {
  if (_loginInFlight) return;
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';
  if (!email || !password) { errEl.textContent = '이메일과 비밀번호를 입력해주세요.'; errEl.style.display = 'block'; return; }
  _loginInFlight = true;
  btn.textContent = '로그인 중...'; btn.disabled = true;
  try {
    const res = await apiFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) {
      // [버그1 2026-07-25] 401(비번 틀림)뿐 아니라 422(이메일 형식 검증 실패 — pydantic EmailStr)도
      //   "요청 형식이 올바르지 않습니다" 같은 기술 문구 대신 사용자 언어로. detail 이 배열(422)이면 노출 금지.
      if (res.status === 401 || res.status === 422) throw new Error('아이디 또는 비밀번호가 달라요. 다시 확인해 주세요.');
      throw new Error((typeof data.detail === 'string' && data.detail) || '로그인 실패');
    }
    setToken(data.access_token);
    // 계정이 다를 때 이전 사용자 데이터 정리 + /me 로 가입방법 동기화
    try {
      const lastEmail = localStorage.getItem('last_login_email');
      const sameEmail = (lastEmail === email);
      // user_id 기준 비교 + 가입방법 배지 갱신
      await applyNewSession(data.access_token, { forcePurge: !sameEmail });
      // 보조: 이메일도 갱신 (applyNewSession 안에서 /me 응답 기준으로 덮어씀)
      localStorage.setItem('last_login_email', email);
    } catch (_) { /* ignore */ }
    _setAuthGateLocked(false);
    checkCbt1Reset();
    checkOnboarding().catch(() => {});
    document.getElementById('lockOverlay').classList.add('hidden');
    // [2026-08-17 보스] 재로그인 후 홈 강제 재렌더 — 만료 토큰으로 부팅해 홈 브리프가 401 로
    //   실패 카드를 띄운 뒤엔, 로그인해도 재렌더 훅이 없어 카드가 고정됐다("맨날 연결 불안정" 신고).
    if (window.HomeV41 && window.HomeV41.refresh) { try { window.HomeV41.refresh(); } catch (_e) { /* ignore */ } }
    // [UX-LOAD] 로그인 후 로딩 화면 표시 → preload + 최소시간 + 인사 후 쫀득 해제
    var _lo = document.getElementById('appLoadingOverlay');
    if (_lo) { _lo.style.display = 'flex'; window._loadShownAt = Date.now(); }
    checkInstaStatus(true);
    // T-317 — 생체 인증 등록 제안 (한 번만)
    _offerBiometricEnroll(data.access_token);
    // Wave 2+ — preload + 최소노출 + 인사("반갑습니다 OO 대표님!") 한 화면에서 처리
    await _finishLoginLoad(true);
    // [2026-04-26 0초딜레이] 홈 화면 AI 추천 카드 즉시 렌더 (500ms 딜레이 제거)
    // SWR 캐시 있으면 0ms, 없으면 fetch — 어차피 비동기라 메인 쓰레드 블로킹 X
    if (window.TodayBrief && typeof window.TodayBrief.render === 'function') {
      try { window.TodayBrief.render('home-today-brief'); } catch (_e) { /* ignore */ }
    }
  } catch(e) {
    errEl.textContent = _friendlyErr(e, '로그인 실패');
    errEl.style.display = 'block';
  } finally {
    btn.textContent = '로그인'; btn.disabled = false;
    _loginInFlight = false;
  }
}

// [2026-07-20 v780] 비밀번호 찾기 — 로그인 화면 인라인 (화면 이동/팝업 없음)
// 흐름: 링크 한 번(확인 단계) → 한 번 더(발송) → 60초 쿨다운. confirm() 금지 규칙 준수.
let _forgotState = 'idle'; // idle | confirm | sending | cooldown
let _forgotTimer = null;
function _forgotMsg(text, ok) {
  const el = document.getElementById('forgotPwMsg');
  if (!el) return;
  if (!text) { el.style.display = 'none'; el.textContent = ''; el.classList.remove('is-ok'); return; }
  el.textContent = text;
  el.classList.toggle('is-ok', !!ok);
  el.style.display = 'block';
}
function _forgotReset() {
  _forgotState = 'idle';
  const btn = document.getElementById('forgotPwLink');
  if (btn) { btn.disabled = false; btn.textContent = '비밀번호를 잊으셨나요?'; btn.classList.remove('is-confirm'); }
}
async function forgotPassword() {
  const btn = document.getElementById('forgotPwLink');
  if (!btn || _forgotState === 'sending' || _forgotState === 'cooldown') return;
  const emailEl = document.getElementById('loginEmail');
  const email = (emailEl && emailEl.value || '').trim();

  // 1단계 — 인라인 확인 (같은 자리에서 버튼 라벨만 바뀜)
  if (_forgotState === 'idle') {
    if (!email) {
      _forgotMsg('이메일을 먼저 입력해주세요.');
      if (emailEl) emailEl.focus();
      return;
    }
    _forgotState = 'confirm';
    btn.classList.add('is-confirm');
    btn.textContent = '이 주소로 메일 보내기';
    _forgotMsg(email + ' 주소로 비밀번호 재설정 메일을 보낼까요?');
    return;
  }

  // 2단계 — 발송 (이메일은 발송 시점 값으로 다시 읽음)
  if (!email) { _forgotReset(); _forgotMsg('이메일을 먼저 입력해주세요.'); return; }
  _forgotState = 'sending';
  btn.disabled = true;
  btn.textContent = '보내는 중...';
  try {
    const res = await apiFetch('/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    _forgotMsg('재설정 메일을 보냈어요. 메일함을 확인해주세요. (30분 안에)', true);
    // 연타 방지 — 60초 쿨다운 후 재발송 가능
    _forgotState = 'cooldown';
    btn.classList.remove('is-confirm');
    let left = 60;
    btn.textContent = '다시 보내기 (' + left + '초)';
    clearInterval(_forgotTimer);
    _forgotTimer = setInterval(() => {
      left -= 1;
      if (left <= 0) { clearInterval(_forgotTimer); _forgotReset(); return; }
      const b = document.getElementById('forgotPwLink');
      if (b) b.textContent = '다시 보내기 (' + left + '초)';
    }, 1000);
  } catch (e) {
    _forgotReset();
    _forgotMsg('메일을 보내지 못했어요. 잠시 후 다시 시도해주세요.');
  }
}

// 네트워크/타임아웃 등 친근한 에러 메시지
function _friendlyErr(e, fallback) {
  const m = String(e && e.message || e || '').toLowerCase();
  // [2026-08-15 기기QA] 'load failed' 는 사파리/WebKit 의 fetch 실패 문구 —
  //   크롬('failed to fetch')만 잡고 있어서 iOS 에서만 한글 UI 에 "Load failed" 영문이 그대로 노출됐다.
  //   (iPhone 시뮬레이터 실측: 로그인 실패 시 빨간 글씨 "Load failed")
  //   'the network connection was lost' / 'cancelled' 도 WebKit 계열 문구라 같이 잡는다.
  if (m.includes('failed to fetch') || m.includes('load failed') || m.includes('networkerror')
      || m.includes('network connection was lost') || m.includes('cancelled') || m.includes('network')) {
    return '인터넷 연결을 확인해 주세요.';
  }
  if (m.includes('timeout')) return '응답이 지연되고 있어요. 잠시 후 다시 시도해 주세요.';
  if (m.includes('401')) return '로그인이 필요해요.';
  if (m.includes('403')) return '권한이 없어요.';
  if (m.includes('429')) return '잠시 후 다시 시도해 주세요.';
  if (m.includes('500') || m.includes('502') || m.includes('503')) return '서버가 잠깐 불안정해요. 다시 시도해 주세요.';
  return e && e.message ? e.message : (fallback || '문제가 생겼어요.');
}

// T-317 — 생체 인증 등록 제안 (최초 1회만)
async function _offerBiometricEnroll(token) {
  try {
    if (localStorage.getItem('itdasy_biometric_asked') === '1') return;
    if (!window.Biometric) return;
    const ok = await window.Biometric.available();
    if (!ok) return;
    localStorage.setItem('itdasy_biometric_asked', '1');
    setTimeout(async () => {
      const yes = confirm('다음부터 Face ID(또는 지문)로 빠르게 로그인하시겠어요?\n비밀번호 재입력 없이 열립니다.');
      if (!yes) return;
      try {
        await window.Biometric.enable(token);
        if (window.showToast) window.showToast('생체 인증 등록됨');
      } catch (_) { /* ignore */ }
    }, 1200);
  } catch (_) { /* ignore */ }
}

// T-317 — 앱 실행 시 생체 인증으로 자동 로그인 시도
async function _tryBiometricLogin() {
  try {
    if (!window.Biometric || !window.Biometric.isEnabled()) return false;
    const ok = await window.Biometric.available();
    if (!ok) return false;
    const token = await window.Biometric.verify();
    if (!token) return false;
    setToken(token);
    try { await applyNewSession(token); } catch (_) { /* session init failed — reload recovers UI state */ location.reload(); }
    return true;
  } catch (_) { return false; }
}

// 회원가입
let _signupInFlight = false;
async function signup() {
  if (_signupInFlight) return;
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const referral_code = document.getElementById('signupRef').value.trim() || null;
  const agree = document.getElementById('signupAgree').checked;
  // PIPA §22-2 — 만 14세 이상 자체 확인 체크박스 (없으면 하위호환으로 통과)
  const ageOver14El = document.getElementById('signupAgeOver14');
  const ageOver14 = ageOver14El ? ageOver14El.checked : true;
  const btn = document.getElementById('signupBtn');
  const errEl = document.getElementById('signupError');
  errEl.style.display = 'none';
  if (!agree) { errEl.textContent = '약관에 동의해주세요.'; errEl.style.display = 'block'; return; }
  if (!ageOver14) { errEl.textContent = '만 14세 이상만 가입할 수 있어요.'; errEl.style.display = 'block'; return; }
  if (!name || !email || !password) { errEl.textContent = '모든 필수 항목을 입력해주세요.'; errEl.style.display = 'block'; return; }
  if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    errEl.textContent = '비밀번호는 8자 이상이고 영문+숫자를 포함해야 합니다.';
    errEl.style.display = 'block'; return;
  }
  btn.textContent = '가입 중…'; btn.disabled = true;
  _signupInFlight = true;
  // 2026-05-01 ── 이전 필드 에러 마크 제거
  ['signupEmail','signupPassword','signupName'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.borderColor = '';
    const errId = id + 'Err';
    const errBelow = document.getElementById(errId);
    if (errBelow) errBelow.remove();
  });
  try {
    const res = await apiFetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, referral_code, age_over_14: ageOver14 }),
    });
    const data = await res.json();
    if (!res.ok) {
      // 2026-05-01 ── 422 (Pydantic validation) 의 detail 배열에서 필드별 에러 추출.
      // FastAPI: detail = [{loc:['body','email'], msg:'value is not a valid email...', type:'...'}, ...]
      if (res.status === 422 && Array.isArray(data.detail)) {
        const fieldMap = { email: 'signupEmail', password: 'signupPassword', name: 'signupName' };
        const koMap = { email: '이메일', password: '비밀번호', name: '이름' };
        let firstFieldErr = '';
        data.detail.forEach(err => {
          const loc = (err.loc || []).filter(p => p !== 'body');
          const field = loc[0];
          const inputId = fieldMap[field];
          if (!inputId) return;
          const input = document.getElementById(inputId);
          if (!input) return;
          input.style.borderColor = '#ef4444';
          // 해당 input 바로 아래 inline 에러 메시지 추가
          const e = document.createElement('div');
          e.id = inputId + 'Err';
          e.style.cssText = 'color:#ef4444;font-size:11px;margin:-6px 0 8px 4px;font-weight:500;';
          let msg = err.msg || '올바르지 않은 형식';
          if (msg.startsWith('value is not a valid email')) msg = `${koMap[field]} 형식이 올바르지 않아요 (예: name@example.com)`;
          else if (field === 'password' && msg.toLowerCase().includes('length')) msg = '비밀번호는 8자 이상이어야 해요';
          else msg = `${koMap[field] || field}: ${msg}`;
          e.textContent = msg;
          input.insertAdjacentElement('afterend', e);
          if (!firstFieldErr) firstFieldErr = msg;
        });
        if (firstFieldErr) throw new Error(firstFieldErr);
      }
      throw new Error(typeof data.detail === 'string' ? data.detail : '가입 실패');
    }
    // 자동 로그인
    const loginRes = await apiFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok) throw new Error(loginData.detail || '자동 로그인 실패');
    setToken(loginData.access_token);
    // 신규 가입 → 무조건 이전 사용자 잔존 데이터 정리 + /me 로 가입방법 동기화
    try {
      await applyNewSession(loginData.access_token, { forcePurge: true });
      localStorage.setItem('last_login_email', email);
    } catch (_) { /* ignore */ }
    document.getElementById('signupOverlay').style.display = 'none';
    _setAuthGateLocked(false);
    checkOnboarding().catch(() => {});
    document.getElementById('lockOverlay').classList.add('hidden');
    if (window.HomeV41 && window.HomeV41.refresh) { try { window.HomeV41.refresh(); } catch (_e) { /* ignore */ } }   // [2026-08-17] 가입 직후 홈 재렌더
    checkInstaStatus(true);
  } catch (e) {
    errEl.textContent = _friendlyErr(e, '가입 실패');
    errEl.style.display = 'block';
  } finally {
    btn.textContent = '회원가입'; btn.disabled = false;
    _signupInFlight = false;
  }
}

function _toggleSignup(show) {
  const lock = document.getElementById('lockOverlay');
  const signup = document.getElementById('signupOverlay');
  if (show) {
    lock.classList.add('hidden');
    signup.style.display = 'flex';
    _setAuthGateLocked(true);
  } else {
    signup.style.display = 'none';
    lock.classList.remove('hidden');
    _setAuthGateLocked(true);
  }
}

// ───── OAuth redirect URL 검증 ─────
const _ALLOWED_OAUTH_HOSTS = ['accounts.google.com', 'kauth.kakao.com', 'nid.naver.com'];
function _isAllowedOAuthUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return _ALLOWED_OAUTH_HOSTS.includes(parsed.hostname);
  } catch (_) {
    return false;
  }
}
// [보안감사 C-2/C-3 2026-07-27] OAuth PKCE 시작.
// 로그인 시작 시 code_verifier 를 생성·로컬저장하고 code_challenge 를 백엔드에 넘긴다.
// 콜백은 JWT 대신 1회용 code 를 돌려주고, 복귀 핸들러(app-oauth-return / oauth-return.html)가
// verifier 로 POST /auth/oauth/exchange 해서 JWT 를 받는다.
// → 딥링크를 가로챈 악성 앱은 verifier 없어 교환 불가(C-3), 공격자 code 는 challenge 불일치로 실패(C-2).
function _oauthB64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function _oauthPkceStart() {
  try {
    const vb = new Uint8Array(32);
    crypto.getRandomValues(vb);
    const verifier = _oauthB64url(vb);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const challenge = _oauthB64url(new Uint8Array(digest));
    localStorage.setItem('itdasy_oauth_pkce', JSON.stringify({ v: verifier, t: Date.now() }));
    return challenge;
  } catch (_e) {
    // [2026-08-03 P0-1-a] 예전엔 ''(challenge 없음)을 돌려줘서 백엔드가 레거시 `?token=` 으로
    //   폴백했다 — 즉 **우리 손으로 세션 고정 경로를 유발**하는 설계였다. 레거시를 걷어냈으니
    //   여기서 실패하면 로그인 자체를 중단시킨다. (Pages 는 항상 HTTPS = secure context 라
    //   실제 발생 가능성은 낮지만, 경로를 완전히 닫으려면 이쪽도 막아야 한다.)
    void _e;
    throw new Error('보안 로그인을 시작할 수 없어요. 브라우저를 업데이트해 주세요');
  }
}
window._oauthPkceStart = _oauthPkceStart;

function _navigateOAuth(url) {
  if (!_isAllowedOAuthUrl(url)) {
    showToast('로그인 서버 응답이 유효하지 않아요. 잠시 후 다시 시도해주세요.', 'error');
    return;
  }
  if (window.Capacitor?.Plugins?.Browser) {
    window.Capacitor.Plugins.Browser.open({ url });
  } else {
    window.location.href = url;
  }
}

// ───── Google OAuth 로그인 시작 ─────
// 백엔드에 authorize URL 을 요청 → 사용자를 Google 로그인 페이지로 이동
// 완료 후 /oauth-return.html 에서 토큰 저장
window.startGoogleLogin = async function () {
  try {
    // GitHub Pages 서브패스 (/itdasy-frontend-test-yeunjun/) 대응 — 현재 URL 기준 상대 경로
    const returnTo = new URL('oauth-return.html', window.location.href).href;
    const _cc = await _oauthPkceStart();
    const res = await fetch(
      // [P0-1-a] code_challenge 는 이제 필수 — 없으면 백엔드가 error=pkce_required 로 돌려보낸다.
      `${window.API}/auth/google/authorize?return_to=${encodeURIComponent(returnTo)}` +
      `&code_challenge=${encodeURIComponent(_cc)}`
    );
    if (!res.ok) throw new Error('Google 로그인 준비 실패');
    const { url } = await res.json();
    _navigateOAuth(url);
  } catch (e) {
    const msg = window._humanError ? window._humanError(e) : (e.message || 'Google 로그인 오류');
    showToast(msg, 'error');
  }
};

// ───── 카카오 OAuth 로그인 시작 ─────
window.startKakaoLogin = async function () {
  try {
    // GitHub Pages 서브패스 (/itdasy-frontend-test-yeunjun/) 대응 — 현재 URL 기준 상대 경로
    const returnTo = new URL('oauth-return.html', window.location.href).href;
    const _cc = await _oauthPkceStart();
    const res = await fetch(
      `${window.API}/auth/kakao/authorize?return_to=${encodeURIComponent(returnTo)}` +
      `&code_challenge=${encodeURIComponent(_cc)}`
    );
    if (!res.ok) throw new Error('카카오 로그인 준비 실패');
    const { url } = await res.json();
    _navigateOAuth(url);
  } catch (e) {
    const msg = window._humanError ? window._humanError(e) : (e.message || '카카오 로그인 오류');
    showToast(msg, 'error');
  }
};

// ───── 네이버 OAuth 로그인 시작 ─────
window.startNaverLogin = async function () {
  try {
    const returnTo = new URL('oauth-return.html', window.location.href).href;
    const _cc = await _oauthPkceStart();
    const res = await fetch(
      `${window.API}/auth/naver/authorize?return_to=${encodeURIComponent(returnTo)}` +
      `&code_challenge=${encodeURIComponent(_cc)}`
    );
    if (!res.ok) throw new Error('네이버 로그인 준비 실패');
    const data = await res.json();
    if (!data.url) {
      if (window.showToast) window.showToast('네이버 로그인 설정이 아직 준비 중이에요');
      return;
    }
    _navigateOAuth(data.url);
  } catch (e) {
    const msg = window._humanError ? window._humanError(e) : (e.message || '네이버 로그인 오류');
    showToast(msg || '네이버 로그인을 시작할 수 없어요', 'error');
  }
};

// ───── T-320 Sign in with Apple (iOS 네이티브 전용) ─────
// Capacitor 플러그인(@capacitor-community/apple-sign-in)이 identity_token 을 받아오면
// BE POST /auth/apple 로 검증 → JWT 발급. 웹에는 버튼 자체가 숨겨져 있음.
let _appleLoginBusy = false;
window.startAppleLogin = async function () {
  if (_appleLoginBusy) return;
  const plug = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SignInWithApple;
  if (!plug) {
    if (window.showToast) window.showToast('Apple 로그인은 아이폰 앱에서 쓸 수 있어요');
    return;
  }
  _appleLoginBusy = true;
  try {
    const r = await plug.authorize({ scopes: 'email name' });
    const resp = (r && r.response) || {};
    const idToken = resp.identityToken;
    if (!idToken) throw new Error('Apple 인증이 취소됐어요');
    // 이름은 최초 로그인 1회만 옴 — 없으면 null (BE가 "Apple 사용자"로 처리)
    const fullName = [resp.familyName, resp.givenName].filter(Boolean).join('').trim() || null;
    const res = await fetch(`${window.API}/auth/apple`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity_token: idToken, name: fullName }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || 'Apple 로그인 실패');
    setToken(data.access_token);
    try { await applyNewSession(data.access_token, { forcePurge: true }); } catch (_) { void 0; }
    window.location.reload(); // oauth-return 과 동일하게 재부팅 경로로 세션 반영
  } catch (e) {
    const msg = window._humanError ? window._humanError(e) : (e.message || 'Apple 로그인 오류');
    showToast(msg, 'error');
  } finally {
    _appleLoginBusy = false;
  }
};

// T-324 — iOS Safari 100vh 동적 계산
(function _setVH() {
  const set = () => document.documentElement.style.setProperty('--vh', (window.innerHeight * 0.01) + 'px');
  set();
  window.addEventListener('resize', set, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(set, 250));
})();

// iOS 하단 네비 '도망' 방지 — 키보드 올라갈 때 탭바 숨기기 (input/textarea focus 기반)
(function _fixTabBarOnKeyboard() {
  const nav = document.getElementById('nav');
  if (!nav) return;

  const hideNav = () => { nav.style.display = 'none'; };
  const showNav = () => { nav.style.display = ''; };

  // 포커스 된 엘리먼트가 입력창이면 숨김
  document.addEventListener('focusin', (e) => {
    const t = e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || e.target.isContentEditable) hideNav();
  });

  document.addEventListener('focusout', () => {
    // 키보드가 내려가면서 focusout될 때 약간의 딜레이 후 복구 (다른 입력창으로 이동할 수 있으므로)
    setTimeout(() => {
      const active = document.activeElement;
      if (!active || (active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA' && !active.isContentEditable)) {
        showNav();
      }
    }, 100);
  });
})();

// 2026-04-24 — iOS Safari 하단 탭바 jump 방지 (Task 5)
//   원인: URL 바 자동숨김 + 키보드로 visual viewport 가 변할 때 position:fixed bottom
//         이 layout viewport 와 visual viewport 차이로 점프함. 클릭 시 좌표가 틀어져
//         재클릭이 빗나간다는 사용자 보고.
//   해법: visualViewport 변화량을 --tab-bar-bottom CSS var 로 실시간 보정.
//         지원되지 않는 브라우저는 CSS 폴백(safe-area + 14px) 사용.
(function _stabilizeTabBarOnIOS() {
  if (!window.visualViewport) return;  // 안드로이드 Chrome 도 대부분 지원
  const vv = window.visualViewport;
  const root = document.documentElement;
  const BASE = 14;  // px — CSS 와 동일
  let raf = 0;
  const update = () => {
    raf = 0;
    // 2026-05-01 ── 탭바 사라짐 버그 픽스. 이전엔 offset 그대로 max(0, x) 만 적용 →
    // 사용자가 탭할 때 iOS PWA 의 viewport 미묘한 흔들림으로 offset 이 크게 튀면
    // 탭바가 화면 밖까지 밀려 안 보임. 작은 noise (≤100px) 는 0 으로, 600px 초과는 cap.
    // 100-600 범위만 실제 키보드/URL바로 간주.
    const raw = (window.innerHeight - vv.height - vv.offsetTop) | 0;
    let offset = 0;
    if (raw > 100 && raw < 600) offset = raw;
    else if (raw >= 600) offset = 0;  // glitch — 무시
    root.style.setProperty(
      '--tab-bar-bottom',
      `calc(${BASE}px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) + ${offset}px)`
    );
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
  vv.addEventListener('resize', schedule, { passive: true });
  vv.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(update, 250), { passive: true });
  update();
})();

// ===== 앱 초기화 (모든 모듈 로드 후 실행) =====
window.addEventListener('load', async function() {
  // [보안감사 H-3 2026-07-27] 부팅 게이트 — 인증 판단(#register/생체/getToken 자동로그인) 전에 토큰 하이드레이션 완료.
  //   ▶ 웹(비네이티브) 또는 강제 OFF → 이 if 가 false → await 자체가 실행되지 않아 아래 부팅 코드는 기존과 100% 동기적으로 동일.
  //   ▶ 강제 ON(_secureMode=true) 또는 (네이티브 && 강제OFF 아님)일 때만 게이트로 들어가 감지·하이드레이션.
  if (_secureMode || (_secureForced !== false && _isNativePlatform())) { await _bootHydrateGate(); }
  _bindLoginSocialButtons();
  applyStoreReviewLoginGuard();

  // Enter 키 로그인 (IME 조합 중 무시)
  const loginPw = document.getElementById('loginPassword');
  if (loginPw) loginPw.addEventListener('keydown', e => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') login();
  });

  // 비밀번호 보기 토글
  const pwToggle = document.getElementById('loginPwToggle');
  if (pwToggle) {
    const _eyeOpen = '<i class="ph-duotone ph-eye" style="font-size:18px" aria-hidden="true"></i>';
    const _eyeOff  = '<i class="ph-duotone ph-eye-slash" style="font-size:18px" aria-hidden="true"></i>';
    pwToggle.addEventListener('click', () => {
      const inp = document.getElementById('loginPassword');
      if (!inp) return;
      inp.type = inp.type === 'password' ? 'text' : 'password';
      pwToggle.innerHTML = inp.type === 'password' ? _eyeOpen : _eyeOff;
    });
  }

  // 회원가입 전환 — document 위임 (타이밍 무관)
  document.addEventListener('click', (e) => {
    const goSignup = e.target.closest('#goSignup');
    if (goSignup) { e.preventDefault(); _toggleSignup(true); return; }
    const goLogin = e.target.closest('#goLogin');
    if (goLogin) { e.preventDefault(); _toggleSignup(false); return; }
    const signupBtn2 = e.target.closest('#signupBtn');
    if (signupBtn2) {
      const a = document.getElementById('signupAgree');
      const ageOk = document.getElementById('signupAgeOver14');
      if (!a || !a.checked) {
        const err = document.getElementById('signupError');
        if (err) { err.textContent = '약관에 동의해주세요.'; err.style.display = 'block'; }
        return;
      }
      // PIPA §22-2 — 만 14세 미만 차단 (체크박스 없는 옛날 빌드는 통과)
      if (ageOk && !ageOk.checked) {
        const err = document.getElementById('signupError');
        if (err) { err.textContent = '만 14세 이상만 가입할 수 있어요.'; err.style.display = 'block'; }
        return;
      }
      signup();
    }
  }, false);

  // 약관·만14세 동의 시 버튼 활성화 (둘 다 체크돼야 활성화)
  document.addEventListener('change', (e) => {
    if (e.target && (e.target.id === 'signupAgree' || e.target.id === 'signupAgeOver14')) {
      const a = document.getElementById('signupAgree');
      const ageOk = document.getElementById('signupAgeOver14');
      const ok = !!(a && a.checked) && (!ageOk || ageOk.checked);
      const btn = document.getElementById('signupBtn');
      if (btn) {
        btn.style.opacity = ok ? '1' : '0.6';
        btn.style.pointerEvents = ok ? 'auto' : 'none';
      }
    }
  }, false);
  // #register 해시로 진입 시 바로 가입 화면
  if ((window.location.hash || '').includes('register') && !getToken()) {
    _toggleSignup(true);
  }
  ['signupName','signupEmail','signupPassword','signupRef'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      // [A14] Enter 키 → signup() 직접 호출 (agree 스코프 문제 수정)
      if (e.key === 'Enter') { e.preventDefault(); signup(); }
    });
  });
  window.signup = signup;

  // 🚫 `?_t=<JWT>` 자동 로그인은 제거됐다 (출시감사 2026-08-02, P0-1-b).
  //    URL 파라미터를 **아무 검증 없이** setToken() 했다 — 공격자가 만든 링크
  //    (…/?_t=<공격자JWT>) 를 원장님이 한 번 열면 그 세션으로 고정되고,
  //    history.replaceState 가 주소창의 흔적까지 지워 눈치채지도 못했다.
  //    (?token= 쪽은 그나마 /auth/me 로 대조라도 했는데 여기는 그것도 없었다.)
  //
  //    지워도 되는 근거 — 9개 표면 전수조사에서 **생성 측 0건**:
  //      생성코드·딥링크/네이티브·OAuth 리다이렉트·CDN/Pages/워크플로·테스트/문서·
  //      Analytics·형제 레포 전부 0건이고, `git log --all -S"?_t="` 도 0건.
  //      (형제 레포엔 소비 코드만 복제돼 있다 — 운영 app-core.js 도 같이 지워야 한다.)
  //
  // ⚠️ 다시 넣지 말 것. `_t` 는 흔한 캐시버스터 이름이라 실제로 충돌 사고가 났다:
  //    91612bc 가 인스타 해제 후 하드리로드용으로 `searchParams.set('_t', Date.now())`
  //    를 붙였고, 그 타임스탬프가 여기서 **토큰으로 저장**됐다(d6ebdd8 에서 제거).
  //    캐시 무효화가 필요하면 `_nc` 처럼 다른 이름을 쓰거나 ?v= 자동 범프를 쓴다.

  // [2026-05-08 27차 [G]] 인스타 OAuth 충돌 처리 — BE 가 ig_conflict=1 로 리다이렉트
  (function() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('ig_conflict') === '1') {
      const handle = params.get('handle') || '';
      history.replaceState(null, '', window.location.pathname);
      if (typeof window.showInstaConflictModal === 'function') {
        window.showInstaConflictModal(handle);
      }
    }
  })();

  // T-317 — 토큰 없어도 생체 인증 등록돼 있으면 먼저 시도
  (async () => {
    if (!getToken() && window.Biometric && window.Biometric.isEnabled()) {
      const ok = await _tryBiometricLogin();
      if (ok) {
        document.getElementById('lockOverlay').classList.add('hidden');
        var _lo2 = document.getElementById('appLoadingOverlay');
        if (_lo2) { _lo2.style.display = 'flex'; window._loadShownAt = Date.now(); }
        _setAuthGateLocked(false);
        checkOnboarding().catch(() => {});
        if (window.HomeV41 && window.HomeV41.refresh) { try { window.HomeV41.refresh(); } catch (_e) { /* ignore */ } }   // [2026-08-17] 생체 로그인 후 홈 재렌더
        checkInstaStatus(true);
        await _finishLoginLoad(true);
      }
    }
  })();

  // 토큰 있으면 자동 로그인
  if(getToken()) {
    document.getElementById('lockOverlay').classList.add('hidden');
    _setAuthGateLocked(false);
    // last_user_id 보정 (기존 캐시값으로 즉시 + /me 로 갱신)
    try { applyNewSession(getToken()); } catch (_) { /* ignore */ }
    checkCbt1Reset();
    checkOnboarding().catch(() => {});
    // [UX-LOAD] 필수 데이터 preload 완료 후 로딩 화면 해제
    (async () => {
      // [2026-08-15 기기QA] 여기도 preload 완료를 통째로 기다리면 첫 진입이 12초 워치독까지 간다. 상한 적용.
      try { await _preloadCapped(); } catch (_) { /* ignore */ }
      _hideLoadingOverlay();
    })();
    // [2026-05-13 QA #blocker1] OAuth 직후 — 백엔드 BG 자동분석을 status 폴링으로 대기.
    // runAutoAnalysisAfterConnect 가 즉시 toast + overlay + 90초 polling + timeout fallback.
    const _params0 = new URLSearchParams(window.location.search);
    const _justOAuthed = _params0.get('connected') === 'success';
    // [v570] OAuth 복귀 의도를 reload 견디는 플래그로 보존 — SW controllerchange→reload 가
    //   ?connected=success 를 날려도 이 플래그로 분석/보고서 흐름을 복원한다(보고서 미노출 hotfix).
    let _pendingReport = false;
    try { _pendingReport = sessionStorage.getItem('itdasy_pending_report') === '1'; } catch (_e) { void _e; }
    if (_justOAuthed) {
      try { sessionStorage.setItem('itdasy_pending_report', '1'); } catch (_e) { void _e; }
      _pendingReport = true;
      history.replaceState(null, '', window.location.pathname);
      try {
        const pd = document.getElementById('personaDash');
        if (pd) pd.style.display = 'none';
      } catch (_e) { void _e; }
    } else if (!_pendingReport) {
      // [2026-06-12] OAuth 복귀도 복원 대기도 아닌 일반 부팅이면 inflight 플래그 정리 —
      //   잔존 시 이후 SW 업데이트 controllerchange→reload 를 계속 막는다.
      try { sessionStorage.removeItem('itdasy_oauth_inflight'); } catch (_e) { void _e; }
    }
    // [2026-06-12] connected=success 직후 경합 제거 — checkInstaStatus 를 먼저 await 로 끝내
    //   (재연동 캐시 정리 선행) 그 다음에 runAutoAnalysisAfterConnect 시작. 동시 출발 금지.
    (async () => {
      try { await checkInstaStatus(); } catch (_e) { void _e; }
      if (_justOAuthed || _pendingReport) {
        try {
          // [v570] reload 로 ?connected=success 가 사라졌어도 분석 결과가 이미 있으면 보고서 즉시 복원.
          let _restored = false;
          if (!_justOAuthed) {
            try {
              const _cached = JSON.parse(localStorage.getItem('itdasy_latest_analysis') || '{}') || {};
              const _hasResult = (String(_cached.style_summary || _cached.tone_summary || '')).trim();
              if (_hasResult && typeof window._openReportPopupDirect === 'function') {
                _restored = window._openReportPopupDirect(_cached);
                if (_restored) {
                  try { sessionStorage.removeItem('itdasy_pending_report'); sessionStorage.removeItem('itdasy_oauth_inflight'); } catch (_e2) { void _e2; }
                }
              }
            } catch (_e3) { void _e3; }
          }
          if (!_restored) {
            if (typeof window.runAutoAnalysisAfterConnect === 'function') {
              window.runAutoAnalysisAfterConnect();
            } else if (typeof runPersonaAnalyze === 'function') {
              runPersonaAnalyze();
            }
          }
        } catch (_e) { void _e; }
      }
      // Chrome 이동 후 자동 연동 시작
      const params = new URLSearchParams(window.location.search);
      if (params.get('auto_connect') === '1') {
        history.replaceState(null, '', window.location.pathname);
        setTimeout(connectInstagram, 500);
      }
    })();

    // 기존 동의 완료 시각 복원
    const consentedAt = localStorage.getItem('itdasy_consented_at');
    const tsEl2 = document.getElementById('consentTimestampDisplay');
    if (tsEl2) {
      if (consentedAt) {
        tsEl2.textContent = `개인정보 동의 완료 · ${consentedAt}`;
        tsEl2.style.display = 'inline';
      } else {
        tsEl2.textContent = '';
        tsEl2.style.display = 'none';
      }
    }
    // [2026-08-15 #38] 리로드 후 마지막 탭 복원 (_restoreLastTab).
    //   iOS 백그라운드 리로드·SW 업데이트 리로드 뒤 무조건 홈으로 떨어지던 문제.
    //   복원 대상은 상태 없이 열어도 안전한 메인 탭만 — caption/finish 처럼 진행 중
    //   데이터(선택한 사진 등)가 필요한 화면은 빈 상태로 복원되면 더 이상해서 제외.
    //   OAuth 복귀·보고서 복원 흐름 중엔 화면을 건드리지 않는다.
    if (!_justOAuthed && !_pendingReport) {
      try {
        const _RESTORABLE = ['calendar', 'dashboard', 'workshop', 'gallery'];
        const _lastTab = sessionStorage.getItem('itdasy_last_tab');
        if (_lastTab && _RESTORABLE.indexOf(_lastTab) !== -1 && document.getElementById('tab-' + _lastTab)) {
          const _lastBtn = document.querySelector('.tab-bar [data-tab="' + _lastTab + '"]')
            || document.querySelector('.ms-side__item[data-side-tab="' + _lastTab + '"]');
          showTab(_lastTab, _lastBtn);
        }
      } catch (_e) { void _e; }
    }
    // [UX-LOAD] preload 완료 후 TodayBrief 렌더 — 캐시 히트로 즉시 표시
    setTimeout(() => {
      if (window.TodayBrief && typeof window.TodayBrief.render === 'function') {
        try { window.TodayBrief.render('home-today-brief'); } catch (_e) { /* ignore */ }
      }
    }, 100);
  } else {
    // [2026-05-21] 토큰 없음 — 로그인 화면 강제 정상화.
    // 인라인 스크립트(index.html L591) 가 1차로 처리하지만, 다음 경로에선 잔존 가능:
    //  · 로그아웃 reload 직후 SW 캐시 stale 한 index.html 인라인 스크립트 실행 누락
    //  · 어떤 모듈이 init 중 lockOverlay 에 'hidden' 잘못 추가
    //  · appLoadingOverlay 가 토큰 없는 상태인데도 떠있는 경우 (백지처럼 보임)
    // 이 분기는 getToken() 정말 null 일 때만 — 정상 로그인 경로엔 영향 없음.
    _setAuthGateLocked(true);
    try {
      const _ov = document.getElementById('lockOverlay');
      if (_ov) {
        _ov.classList.remove('hidden');
        if (_ov.style.display === 'none') _ov.style.display = '';
      }
      const _lo = document.getElementById('appLoadingOverlay');
      if (_lo) _lo.style.display = 'none';
    } catch (_e) { /* DOM 미준비 — 무시 */ }
  }
});

function expandSmartMenu() {
  openNavSheet();
}

function openNavSheet() {
  const sheet = document.getElementById('navSheet');
  if (!sheet) return;
  sheet.style.display = 'flex';
  const inner = document.getElementById('navSheetInner');
  requestAnimationFrame(() => {
    inner.style.transform = 'translateY(0)';
  });
  // [2026-04-26 A5] popstate + 스와이프
  try {
    if (typeof window._registerSheet === 'function') window._registerSheet('nav', closeNavSheet);
    if (typeof window._markSheetOpen === 'function') window._markSheetOpen('nav');
    if (inner && typeof window._attachSwipeDownClose === 'function') {
      window._attachSwipeDownClose(inner, closeNavSheet);
    }
  } catch (_e) { void _e; }
}

function closeNavSheet() {
  const inner = document.getElementById('navSheetInner');
  if (!inner) return;
  inner.style.transform = 'translateY(100%)';
  setTimeout(() => { document.getElementById('navSheet').style.display = 'none'; }, 280);
  try { if (typeof window._markSheetClosed === 'function') window._markSheetClosed('nav'); } catch (_e) { void _e; }
}

// 탭 전환
function showTab(id, btn) {
  // [T-101] 잇비 컨텍스트용 현재 탭 노출 (context-resolver 가 읽음).
  try { window.__ITDASY_CURRENT_TAB__ = id; } catch (_e) { void 0; }
  // [2026-08-15 #38] 마지막 탭 저장 — iOS 가 백그라운드 페이지를 메모리에서 내려 복귀 시
  //   강제 리로드돼도(우리가 막을 수 없는 OS 동작) 부팅 때 이 값으로 화면을 복원한다.
  //   sessionStorage 라 진짜 새로 켠 앱은 평소처럼 홈에서 시작. 복원 로직: _restoreLastTab().
  try { sessionStorage.setItem('itdasy_last_tab', id); } catch (_e) { void 0; }
  // [v505] 작업실 탭에서만 헤더/네비를 프로토타입 따뜻한 톤으로 (body.ws-tab 스코프, 다른 탭 회귀 없음)
  try { document.body.classList.toggle('ws-tab', id === 'workshop'); } catch (_e) { void 0; }
  // P3.1 #2: .tab 바깥 요소 잔존 방지
  if (typeof closeSlotPopup === 'function') closeSlotPopup();
  const sg = document.getElementById('_nextSlotGuide');
  if (sg) sg.style.display = 'none';
  // [2026-08-12 PC 갇힘] 열린 하위화면(subscreen)을 탭 전환 시 닫는다 — PC 에서 연동관리
  //   (카카오/네이버톡톡 등)를 연 채 사이드바 탭을 누르면 오버레이가 콘텐츠를 계속 덮어
  //   "메뉴가 안 넘어가는" 것처럼 보였다. 각 모듈의 뒤로가기(.ss-back)를 눌러주는 방식이라
  //   모듈 자신의 close 로직(_markSheetClosed 등)을 그대로 탄다. captionWork 시트는
  //   subscreen-overlay 가 아니라 영향 없음(아래 캡션 마커 특별 처리 유지).
  try {
    document.querySelectorAll('.subscreen-overlay.is-open .ss-back').forEach(b => b.click());
  } catch (_sse) { void _sse; }

  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-bar button').forEach(b => b.classList.remove('active'));
  // 사이드 nav (PC ≥768px) 활성 동기화
  document.querySelectorAll('.ms-side__item').forEach(b => b.classList.remove('is-active'));
  const sideBtn = document.querySelector('.ms-side__item[data-side-tab="' + id + '"]');
  if (sideBtn) sideBtn.classList.add('is-active');
  const target = document.getElementById('tab-' + id);
  if (target) target.classList.add('active');
  if (btn) btn.classList.add('active');
  // [핫픽스F #2] 작업실→캡션 복귀 마커: 캡션 탭에서 '작업실에서 옴'일 때만 "‹ 작업실로" 버튼 노출.
  //   캡션 외 다른 탭으로 이동하면 마커·시트백 정리(시스템 back 오발동/홈·사진모드로 튐 방지).
  try {
    const _cback = document.getElementById('captionBackToWork');
    const _fromWork = (window._captionReturnTab === 'workshop');
    if (_cback) _cback.style.display = (id === 'caption' && _fromWork) ? 'inline-flex' : 'none';
    if (id !== 'caption' && window._captionReturnTab) {
      window._captionReturnTab = null;
      if (typeof window._markSheetClosed === 'function') window._markSheetClosed('captionWork');
    }
  } catch (_cbe) { void _cbe; }
  // 탭 전환 시 스크롤 맨 위로 리셋
  window.scrollTo(0, 0);
  document.body.scrollTop = 0;
  document.documentElement.scrollTop = 0;
  // [P1-2C] 탭 전환 시 init 호출 디바운스 — 연속 클릭 시 중복 fetch 방지.
  // [2026-05-21] 200ms → 50ms 단축. 0 은 두지 말 것 — 빠른 연속 탭의 중복 렌더 방지 목적.
  if (window._tabInitTimer) clearTimeout(window._tabInitTimer);
  window._tabInitTimer = setTimeout(() => {
    // 홈 탭 활성화 시 통합 카드 렌더 (Task 5: TodayBrief 가 AI 제안까지 함께 그림)
    if (id === 'home') {
      if (window.TodayBrief && typeof window.TodayBrief.render === 'function') {
        try { window.TodayBrief.render('home-today-brief'); } catch (_e) { /* ignore */ }
      }
      // [2026-07-24] 홈 탭 복귀 시 강제 새로고침 — 예전엔 최초 마운트 1회 후 재렌더가 없어
      //   DM/댓글 카운트가 얼어붙었다(옛 값 표시). refresh()=force 라 60초 SWR 도 우회.
      if (window.HomeV41 && typeof window.HomeV41.refresh === 'function') {
        try { window.HomeV41.refresh(); } catch (_e) { /* ignore */ }
      }
    }
    // 내샵관리 탭 활성화 시 대시보드 렌더 (Task 6: 이번달 브리핑 흡수)
    if (id === 'dashboard') {
      if (typeof window.initDashboardTab === 'function') {
        try { window.initDashboardTab(); } catch (_e) { /* ignore */ }
      }
    }
  }, 50);
}

// 태그 선택 (single)
function initSingle(id) {
  document.getElementById(id).querySelectorAll('.tag, .style-opt').forEach(t => {
    t.addEventListener('click', () => {
      document.getElementById(id).querySelectorAll('.tag, .style-opt').forEach(x => x.classList.remove('on'));
      t.classList.add('on');
    });
  });
}
// 태그 선택 (multi)
function initMulti(id) {
  document.getElementById(id).querySelectorAll('.tag').forEach(t => {
    t.addEventListener('click', () => t.classList.toggle('on'));
  });
}

// DOM 초기화 (DOMContentLoaded 보장)
document.addEventListener('DOMContentLoaded', function() {
  initSingle('typeTags');
  document.querySelectorAll('.style-opts').forEach(g => {
    g.querySelectorAll('.style-opt').forEach(t => {
      t.addEventListener('click', () => {
        g.querySelectorAll('.style-opt').forEach(x => x.classList.remove('on'));
        t.classList.add('on');
      });
    });
  });
  const bgOpts = document.getElementById('bgOpts');
  if (bgOpts) bgOpts.querySelectorAll('.style-opt').forEach(t => {
    t.addEventListener('click', () => {
      bgOpts.querySelectorAll('.style-opt').forEach(x => x.classList.remove('on'));
      t.classList.add('on');
      window._customBgUrl = null;
      const toggleBtn = document.getElementById('bgStoreToggle');
      if (toggleBtn && toggleBtn.textContent.includes('선택됨')) toggleBtn.textContent = '배경 창고 열기';
      document.querySelectorAll('#bgStoreGrid > div').forEach(cell => { cell.style.outline = ''; });
    });
  });
  const editWmOpts = document.getElementById('editWmOpts');
  if (editWmOpts) editWmOpts.querySelectorAll('.style-opt').forEach(t => {
    t.addEventListener('click', () => {
      editWmOpts.querySelectorAll('.style-opt').forEach(x => x.classList.remove('on'));
      t.classList.add('on');
    });
  });
});

function getSel(id) {
  return [...document.getElementById(id).querySelectorAll('.tag.on, .style-opt.on')].map(t => t.dataset.v || t.textContent.trim());
}

// ─────────────────────────────────────────────
//  Service Worker 등록 — 새 버전 배포 시 캐시 자동 갱신
// ─────────────────────────────────────────────
window.APP_BUILD = '20260705-v709-fillwide';
function _updateVersionBadge(swVer) {
  const el = document.getElementById('appVersionBadge');
  if (!el) return;
  const v = swVer || window.APP_BUILD || '?';
  // 날짜(20260504-) + 첫 dash 이후 설명 제거 → 'v89' 만 표시
  el.textContent = 'v' + v.replace(/^20\d{6}-?/, '').replace(/^v?(\d+).*$/, '$1');
  el.title = '빌드: ' + v + ' (탭하면 최근 로그)';
  if (swVer && window.APP_BUILD && swVer !== window.APP_BUILD && !sessionStorage.getItem('cache_busted')) {
    console.warn('[SW] 버전 불일치 감지 — 캐시 전부 삭제 후 리로드. active=' + swVer + ' / bundle=' + window.APP_BUILD);
    sessionStorage.setItem('cache_busted', '1');
    (async () => {
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      } catch (_) { /* ignore */ }
      location.reload();
    })();
  }
}
document.addEventListener('DOMContentLoaded', () => _updateVersionBadge(window.APP_BUILD));

// [v196] 옛 #revenuehub hash 잔존 시 즉시 청소 — hub 시트가 죽었기 때문에
// 사용자가 새로고침해도 항상 빈 상태로 시작하도록 함.
document.addEventListener('DOMContentLoaded', () => {
  try {
    if ((window.location.hash || '').toLowerCase().includes('revenuehub')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  } catch (_e) { void _e; }
});

// [2026-05-05] AI 챗봇 사이드바 카드 클릭 → 기존 #assistantFab 동작 트리거.
// 모바일은 카드 자체가 hide(media query) 되어 영향 없음.
document.addEventListener('DOMContentLoaded', () => {
  const chatbotCard = document.getElementById('cw-chatbot-card');
  if (chatbotCard) {
    chatbotCard.addEventListener('click', () => {
      document.getElementById('assistantFab')?.click();
    });
  }
});

const _isCapacitor = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

if ('serviceWorker' in navigator && !_isCapacitor) {
  const _safeSwUpdate = (reg) => {
    try {
      const p = reg && reg.update && reg.update();
      if (p && typeof p.catch === 'function') p.catch(err => console.warn('[SW] 업데이트 확인 실패:', err?.message || err));
    } catch (err) {
      console.warn('[SW] 업데이트 확인 실패:', err?.message || err);
    }
  };

  // [2026-06-12] 정규 scope = 슬래시 정규화된 현재 디렉터리(슬래시 1개). 비정규 scope SW 정리용.
  const _canonScope = location.pathname.replace(/\/{2,}/g, '/').replace(/[^/]*$/, '');

  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => {
      const u = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || '';
      // 스크립트가 sw.js 가 아니거나(구 SW), scope path 에 // 누적된 비정규 scope → 언레지스터.
      const scopePath = (reg.scope || '').replace(/^https?:\/\//, '');
      const badScope = /\/{2,}/.test(scopePath);
      if ((u && !u.endsWith('/sw.js')) || badScope) {
        console.warn('[SW] 비정규 SW 언레지스터:', reg.scope || u);
        reg.unregister().catch(() => {});
      }
    });
  }).catch(() => {});

  // [2026-04-28] updateViaCache: 'none' — sw.js 자체를 HTTP 캐시 안 함 → 매번 새 sw.js fetch
  // 이전엔 기본값 'imports' 라 옛 sw.js 가 영구 서빙되던 버그.
  // [2026-06-12] scope 명시 — './' 는 누적 슬래시 경로에 매번 새 scope SW 를 만든다. 정규 scope 고정.
  navigator.serviceWorker.register('sw.js', { scope: _canonScope, updateViaCache: 'none' })
    .then(reg => {
      // 페이지 진입 시마다 강제 update 시도 (sw.js fresh fetch + 새 SW 발견 시 install)
      _safeSwUpdate(reg);
      const askVersion = () => {
        const ch = new MessageChannel();
        ch.port1.onmessage = (ev) => {
          if (ev.data && ev.data.version) _updateVersionBadge(ev.data.version);
        };
        (navigator.serviceWorker.controller || reg.active)?.postMessage({ type: 'GET_VERSION' }, [ch.port2]);
      };
      if (reg.active) askVersion();
      else reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'activated') askVersion();
        });
      });
      navigator.serviceWorker.addEventListener('controllerchange', askVersion);
      // 1시간마다 자동 update 시도 (사용자 앱 안 닫고 오래 쓰는 케이스)
      setInterval(() => _safeSwUpdate(reg), 60 * 60 * 1000);
      // [v779] iOS PWA 를 백그라운드에서 다시 켜면 페이지가 리로드 안 돼 업데이트 체크가 없었다
      //   ("앱 다시 켰는데 옛 버전 그대로"). 포그라운드 복귀 시마다 sw.js 재확인 → 새 버전이면
      //   위 controllerchange 리스너가 자동 reload 한다.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') _safeSwUpdate(reg);
      });
    })
    .catch(err => {
      console.warn('[SW] 등록 실패:', {
        name: err?.name, message: err?.message, code: err?.code,
        toString: String(err), loc: location.href, origin: location.origin,
      });
    });

  // 첫 상호작용 감지 — 아래 controllerchange 정책에서 "부팅 중 vs 사용 중" 구분에 쓴다.
  window.addEventListener('pointerdown', () => { window._userInteracted = true; }, { once: true, capture: true });
  window.addEventListener('keydown', () => { window._userInteracted = true; }, { once: true, capture: true });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // [2026-06-12] OAuth 복귀 직후 새 SW 활성화로 reload 되면 ?connected=success 가 날아가
    //   분석 오버레이가 못 뜬다. 연동 진행 중(itdasy_oauth_inflight)이면 reload 건너뜀.
    try { if (sessionStorage.getItem('itdasy_oauth_inflight')) return; } catch (_e) { void _e; }
    // [2026-08-15 #38] 무조건 즉시 reload → "다른 앱 갔다 오면 새로고침 + 홈으로 리셋" 주범.
    //   (포그라운드 복귀 때마다 _safeSwUpdate 가 돌고, 새 배포가 있으면 여기로 와서
    //    사용자가 보는 앞에서 리로드됐다.) 정책 분리:
    //   · 부팅 직후(첫 상호작용 전 + 로드 30초 이내) = 기존대로 즉시 reload — 배포 직후
    //     '옛 코드 + 새 캐시' 불일치를 그 자리에서 정리 (캐시버스팅 사고 이력 유지).
    //   · 사용 중 = 즉시 리로드하지 않고, 앱이 백그라운드로 갈 때 조용히 reload.
    //     구버전 페이지가 잠시 더 돌지만 SW 캐시는 not-found 시 network fallback 이라 즉사하지 않고,
    //     다음 복귀 땐 이미 새 버전. 가드: 세션당 1회(_sw_reloaded, 루프 방지).
    if (window._sw_reloaded) return;
    const _sinceLoad = (window.performance && performance.now) ? performance.now() : Infinity;
    if (!window._userInteracted && _sinceLoad < 30000) {
      window._sw_reloaded = true;
      window.location.reload();
      return;
    }
    if (window._swReloadDeferred) return;
    window._swReloadDeferred = true;
    document.addEventListener('visibilitychange', function _deferredSwReload() {
      if (document.visibilityState !== 'hidden') return;
      document.removeEventListener('visibilitychange', _deferredSwReload);
      try { if (sessionStorage.getItem('itdasy_oauth_inflight')) return; } catch (_e) { void _e; }
      window._sw_reloaded = true;
      try { window.location.reload(); } catch (_e) { void _e; }
    });
  });
} else if (_isCapacitor) {
  console.warn('[SW] Capacitor 네이티브 — SW 미사용 (WebView 자체 캐시)');
}

// [2026-07-25] 부팅 정합성 자가복구 워치독.
//   배포 직후 SW 파일캐시가 반쪽만 갱신되면 '옛 코드 + 새 lazy 모듈' 이 섞여 홈 렌더가 터지고
//   '빈 화면 + 네비게이션만' 이 뜬다(controllerchange 가 안 걸리는, 이미-불일치로 로드된 케이스 —
//    위 controllerchange 리스너는 '로드 중 SW 교체' 만 잡는다). 원장은 이걸 '앱 고장' 으로 느끼고
//   직접 설정→데이터 새로고침을 해야만 풀렸다. → 부팅 창(상호작용 전) 안에서 스크립트/CSS 로드 실패나
//   버전 미스매치 예외가 나면, **세션당 한 번만** SW 파일캐시를 비우고 리로드해 정합 버전으로 자가복구.
//   가드: 세션 1회(무한루프 차단) · 부팅 25초 창 · 입력 중이면 스킵(유실 방지) · OAuth 복귀 중 스킵.
if (!_isCapacitor && 'caches' in window) {
  (function _bootCacheWatchdog() {
    var KEY = 'itdasy_cache_recovered';
    try { if (sessionStorage.getItem(KEY)) return; } catch (_e) { return; }  // 이 세션에 이미 복구함 → 루프 차단
    var armed = true;
    setTimeout(function () { armed = false; }, 25000);   // 부팅 창만 감시 — 이후 에러는 정상 운영 에러
    function _shouldRecover() {
      if (!armed) return false;
      var ae = document.activeElement;   // 입력 중이면 유실 방지 — 복구 안 함
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return false;
      try { if (sessionStorage.getItem('itdasy_oauth_inflight')) return false; } catch (_e) { void _e; }
      return true;
    }
    function _recover(reason) {
      armed = false;
      try { sessionStorage.setItem(KEY, '1'); } catch (_e) { void _e; }
      console.warn('[cache-recover] 부팅 에러 → SW 파일캐시 비우고 1회 리로드:', reason);
      (async function () {
        try { var ks = await caches.keys(); await Promise.all(ks.map(function (k) { return caches.delete(k); })); } catch (_e) { void _e; }
        try { location.reload(); } catch (_e) { void _e; }
      })();
    }
    window.addEventListener('error', function (e) {
      var t = e && e.target;
      // (a) JS/CSS 파일 로드 실패 — 배포 후 옛 ?v= 파일이 새 캐시에 없어 404 나는 전형적 캐시 미스매치 신호(강함)
      if (t && (t.tagName === 'SCRIPT' || t.tagName === 'LINK')) {
        if (_shouldRecover()) _recover('asset-load-fail: ' + (t.src || t.href || ''));
        return;
      }
      // (b) 런타임 미처리 예외 — 버전 미스매치로 옛 코드가 새 모듈 심볼을 못 찾는 부류만(일반 버그로 리로드 남발 방지)
      var msg = String((e && e.message) || (e && e.error && e.error.message) || '');
      if (e && e.error && /is not defined|is not a function|Unexpected token|dynamically imported|Importing a module|Failed to fetch/i.test(msg)) {
        if (_shouldRecover()) _recover('version-mismatch: ' + msg);
      }
    }, true);
  })();
}

// ───── Pull-to-Refresh (iOS PWA 전용) ─────
(function initPTR() {
  if (!window.navigator.standalone) return;

  const THRESHOLD  = 120;
  const RESISTANCE = 0.4;
  const SPRING     = 'transform 0.5s cubic-bezier(0.34,1.56,0.64,1)';
  const LABEL = document.getElementById('ptrLabel');
  const EMOJI = document.getElementById('ptrEmoji');

  let startY    = 0;
  let pulling   = false;
  let triggered = false;
  let loading   = false;

  function applyMove(move) {
    document.body.style.transition = 'none';
    document.body.style.transform  = `translateY(${move}px)`;
  }

  function springBack(onDone) {
    document.body.style.transition = SPRING;
    document.body.style.transform  = 'translateY(0)';
    setTimeout(() => {
      document.body.style.transition = '';
      document.body.style.transform  = '';
      if (onDone) onDone();
    }, 500);
  }

  function resetIndicator() {
    LABEL.textContent    = '당겨서 새로고침';
    LABEL.style.color    = '';
    EMOJI.style.transform = '';
    EMOJI.style.color     = '';
    EMOJI.classList.remove('spin');
  }

  document.addEventListener('touchstart', e => {
    if (loading) return;
    const lock = document.getElementById('lockOverlay');
    if (lock && !lock.classList.contains('hidden')) return;
    const ob = document.getElementById('onboardingOverlay');
    if (ob && !ob.classList.contains('hidden')) return;
    if ((window.scrollY || document.documentElement.scrollTop) > 0) return;
    if (e.touches.length !== 1) return;

    // [Hotfix A] 시트/팝업이 열려있으면 PTR 완전 비활성화
    // 팝업 안에서 당겨 새로고침 의도 없음 + body translateY 가 시트도 같이 미는 버그 방지.
    const anySheet = document.querySelector(
      '#settingsSheet[style*="flex"], .ms-sheet[style*="flex"], .hub-sheet.open, .ms-sheet.open, #navSheet[style*="flex"], .drawer-nav.open'
    );
    if (anySheet) return;

    // [Hotfix B] 탭바/하단 네비/AI비서 FAB 위에서 시작된 터치는 PTR 제외
    // PTR이 body를 translateY 로 밀면 탭바도 같이 밀려 버튼이 안 눌리는 문제 방지.
    const nav = e.target.closest('#bottomNavGroup, .tab-bar, #assistantFab');
    if (nav) return;

    startY    = e.touches[0].clientY;
    pulling   = true;
    triggered = false;
  }, { passive: true });

  // [PerfFix] touchmove를 passive:true로 — preventDefault 제거.
  // iOS 200ms 터치 지연 해소. 대신 body overscroll-behavior-y:contain 으로 바운스 차단
  // (CSS는 다른 터미널 동시작업 중이라 JS에서 직접 style 설정).
  try { document.body.style.overscrollBehaviorY = 'contain'; } catch (_e) { void _e; }

  document.addEventListener('touchmove', e => {
    if (!pulling || loading) return;
    // [Hotfix] 시트 열림 재확인 — touchstart→touchmove 사이에 시트가 열릴 수 있음
    const anySheet2 = document.querySelector(
      '#settingsSheet[style*="flex"], .ms-sheet[style*="flex"], .hub-sheet.open, .ms-sheet.open'
    );
    if (anySheet2) { pulling = false; return; }
    if (e.touches.length !== 1) { pulling = false; springBack(); return; }

    const dy   = e.touches[0].clientY - startY;
    if (dy <= 0) { pulling = false; return; }
    e.preventDefault();  // PTR 당기는 동안 브라우저 스크롤 차단 (iOS standalone PTR 복구)

    const move = dy * RESISTANCE;
    applyMove(move);

    if (dy >= THRESHOLD) {
      if (!triggered) {
        triggered = true;
        LABEL.textContent    = '놓으면 새로고침!';
        LABEL.style.color    = 'var(--brand)';
        EMOJI.style.transform = 'scale(1.35)';
        EMOJI.style.color     = 'var(--brand)';
      }
    } else {
      if (triggered) {
        triggered = false;
        LABEL.textContent    = '당겨서 새로고침';
        LABEL.style.color    = '';
        EMOJI.style.transform = 'scale(1)';
        EMOJI.style.color     = '';
      }
    }
  }, { passive: false });

  document.addEventListener('touchend', async () => {
    if (!pulling) return;
    pulling = false;

    if (!triggered) {
      springBack(resetIndicator);
      return;
    }

    loading = true;
    LABEL.textContent    = '확인 중...';
    EMOJI.classList.add('spin');
    EMOJI.style.transform = '';

    try { await checkInstaStatus(); } catch (_) { /* ignore */ }

    springBack(() => {
      resetIndicator();
      loading = false;
      showToast('최신 상태예요!');
    });
  });
})();

// ──────────────────────────────────────────────
// 통계 카드 데이터 로드 (Subscription usage 기반)
// ──────────────────────────────────────────────
async function loadStatsCard() {
  try {
    const headers = authHeader();
    if (!headers.Authorization) return;
    const r = await apiFetch('/subscription/usage', { headers });
    if (!r.ok) return;
    const d = await r.json();
    const cap = document.getElementById('statCaptions');
    const pub = document.getElementById('statPosts');
    if (cap) cap.textContent = d.caption?.used ?? 0;
    if (pub) pub.textContent = d.publish?.used ?? 0;
  } catch(_) { /* ignore */ }
}

// ──────────────────────────────────────────────
// 429 한도 초과 감지 → 플랜 팝업 자동 오픈 (Pro 전환 유도)
// fetch 래핑해서 429 응답을 감시. 단일 이벤트만 발행해서 토스트·팝업 중복 방지.
// ──────────────────────────────────────────────
(function wrapFetchFor429() {
  const origFetch = window.fetch;
  let lastOpened = 0;
  let lastRateToast = 0;
  window.fetch = async function(...args) {
    const r = await origFetch.apply(this, args);
    if (r.status === 429) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      if (url.startsWith(API)) {
        // [2026-05-13 QA] backend detail 검사 — quota_exceeded:* 만 plan popup,
        // rate_limit_exceeded 는 단순 toast (재고 +버튼 1회 클릭에 플랜창 오발화 차단).
        let detail = '';
        try {
          const clone = r.clone();
          const j = await clone.json().catch(() => ({}));
          detail = (j && j.detail) || '';
          if (typeof detail !== 'string') detail = JSON.stringify(detail);
        } catch (_) { /* ignore */ }
        const isQuota = /^quota_exceeded:/.test(detail);
        const isRate = /^rate_limit/.test(detail) || detail.includes('요청이 잠깐') || detail.includes('요청이 너무 많');
        const now = Date.now();
        if (isQuota && now - lastOpened > 3000 && typeof window.openPlanPopup === 'function') {
          lastOpened = now;
          showToast(detail || '사용 한도 초과 — 플랜을 확인해주세요');
          setTimeout(() => window.openPlanPopup(), 600);
        } else if (isRate && now - lastRateToast > 3000) {
          lastRateToast = now;
          showToast('요청이 잠깐 몰렸어요. 잠시 후 자동으로 풀려요 😊');
        }
        // 그 외(인증 만료 등) 는 호출자가 처리.
      }
    }
    return r;
  };
})();

/**
 * 인스타 핸들 표시 정본 — `@` 는 **정확히 하나**. 값이 없으면 빈 문자열.
 *
 * [연준님 2026-08-17 · B] 실측: 잇비가 "연동돼 있어요 — @@disabled_offitial".
 * 저장할 때 `@` 를 붙이는데 보여줄 때 또 붙여서 생긴다. 화면 곳곳에서
 * `'@' + handle` 을 직접 쓰고 있었고 절반만 `.replace(/^@/,'')` 로 막고 있었다.
 * 표시 문자열을 만들 땐 이걸 써라 — 직접 붙이지 마라.
 *   igHandle('x') · igHandle('@x') · igHandle('@@x') → '@x'   ·   igHandle('') → ''
 */
window.igHandle = function (v) {
  var b = String(v == null ? '' : v).trim().replace(/^@+/, '');
  if (b.indexOf('instagram.com/') >= 0) b = b.split('instagram.com/')[1] || '';
  b = b.split('?')[0].split('/')[0].replace(/[^A-Za-z0-9._]/g, '').slice(0, 60);
  return b ? '@' + b : '';
};

// Module에서 접근 가능하도록 window에 노출
window.API = API;
window.apiUrl = apiUrl;
window.apiFetch = apiFetch;
window.authHeader = authHeader;
Object.assign(window, {
  isKakaoTalk,
  showInstallGuide,
  hideInstallGuide,
  updateHomeQuestion,
  goCaption,
  selectShopType,
  obSkipShopType,
  openSettings,
  resetShopSetup,
  localReset,
  handle401,
  openDeleteAccountModal,
  closeDeleteAccountModal,
  confirmDeleteAccount,
  expandSmartMenu,
  initMulti,
  getSel,
});

// ──────────────────────────────────────────────
// 보안 민감 버튼은 inline onclick 대신 addEventListener로 연결
// (CSP strict 대비 + 핸들러 중복 바인딩 방지)
// ──────────────────────────────────────────────
(function bindCriticalHandlers() {
  function on(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }
  const ready = () => {
    on('loginBtn', () => typeof login === 'function' && login());
    on('forgotPwLink', () => typeof forgotPassword === 'function' && forgotPassword());
    on('logoutBtn', () => {
      if (typeof closeSettings === 'function') closeSettings();
      if (typeof logout === 'function') logout();
    });
    on('deleteAccountBtn', () => {
      if (typeof closeSettings === 'function') closeSettings();
      if (typeof openDeleteAccountModal === 'function') openDeleteAccountModal();
    });
    on('changePwBtn', () => {
      if (typeof closeSettings === 'function') closeSettings();
      openChangePwModal();
    });
    on('cpwCancel', closeChangePwModal);
    on('cpwSubmit', submitChangePw);
    // 확인칸에서 엔터 = 변경하기 (모바일 키보드에서 버튼까지 안 내려가도 되게)
    const _cpwCf = document.getElementById('cpwConfirm');
    if (_cpwCf) _cpwCf.addEventListener('keydown', e => { if (e.key === 'Enter') submitChangePw(); });
    on('exportDataBtn', () => {
      if (typeof openDataExport === 'function') openDataExport();
    });
    on('fullResetBtn', () => typeof fullReset === 'function' && fullReset());

    // 플랜 팝업 — app-plan.js 에서 window.openPlanPopup 으로 노출됨
    on('planBadge', () => window.openPlanPopup && window.openPlanPopup());
    on('planCloseBtn', () => window.closePlanPopup && window.closePlanPopup());
    on('planActionBtn', () => window.doPlanAction && window.doPlanAction());
    document.querySelectorAll('.plan-card[data-plan]').forEach(card => {
      card.addEventListener('click', () => window.selectPlan && window.selectPlan(card.dataset.plan));
    });

    // 홈의 "샘플 캡션 보기" 버튼 (연동 전 체험)
    on('sampleBtn', () => {
      if (typeof openSamplePopup === 'function') openSamplePopup();
    });

    // 통계 카드 Pro 업그레이드 버튼
    on('statsUpgradeBtn', () => window.openPlanPopup && window.openPlanPopup());

    // 통계 숫자 로드 (Subscription/usage 에서 가져옴)
    loadStatsCard();

    // 프로덕션(운영) 배포에서만 CBT 전용 버튼 숨김. yeunjun/test 레포는 유지.
    if (location.pathname.startsWith('/itdasy-frontend/') || location.pathname === '/itdasy-frontend') {
      const reset = document.getElementById('fullResetBtn');
      if (reset) reset.style.display = 'none';
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();

// ──────────────────────────────────────────────
// 탭 데이터 preload — 로그인/앱 재오픈 시 백그라운드로 주요 데이터 미리 fetch
// → 사용자가 탭 열 때 캐시 적중 → 0초 체감 렌더
// ──────────────────────────────────────────────
window._preloadTabs = async function () {
  const auth = window.authHeader && window.authHeader();
  if (!auth || !auth.Authorization) return;
  const headers = { ...auth };
  // 예약은 전체 ±3개월 한 번에 prefetch (날짜 스크롤 0ms)
  const now = Date.now();
  const bookingFrom = new Date(now - 3 * 30 * 24 * 3600 * 1000).toISOString();
  const bookingTo = new Date(now + 3 * 30 * 24 * 3600 * 1000).toISOString();
  // [2026-04-26 0초딜레이] revenue 는 기간별 키 분리 — 사용자가 어떤 기간 탭 누르든 0ms
  const tabs = [
    { url: '/customers',            swrKey: 'pv_cache::customers' },
    { url: `/bookings?from=${encodeURIComponent(bookingFrom)}&to=${encodeURIComponent(bookingTo)}`, swrKey: 'pv_cache::bookings_all' },
    { url: '/revenue?period=today', swrKey: 'pv_cache::revenue::today' },
    { url: '/revenue?period=week',  swrKey: 'pv_cache::revenue::week' },
    { url: '/revenue?period=month', swrKey: 'pv_cache::revenue::month' },
    /* INVENTORY_HIDDEN */ // { url: '/inventory', swrKey: 'pv_cache::inventory' },
    { url: '/services',             swrKey: 'pv_cache::service' },
  ];
  // [2026-08-12 첫로그인 3분] AI 2종은 LLM 경로(타임아웃 120s) — 첫 계정은 서버 캐시가 없어
  //   실제 Gemini 호출로 수십 초~2분 걸린다. 이걸 await 하면 로그인 로딩이 그만큼 멈춘다(실측 3분).
  //   → 로딩 대기에서 빼고 백그라운드로만 굽는다. 홈 브리핑/제안 카드는 SWR 라 도착하면 갱신됨.
  const bgTabs = [
    { url: '/today/brief',          swrKey: 'pv_cache::today' },
    { url: '/assistant/suggestions', swrKey: 'pv_cache::ai_suggest' },
  ];
  const _prefetchOne = async t => {
    try {
      const res = await apiFetch(t.url, { headers });
      if (!res.ok) return;
      const d = await res.json();
      const items = d.items || d;
      // [출시감사 2026-08-05 P0-1] total 보존 — 위 주석과 같은 이유 (app-perf-recovery.js 참조).
      const payload = JSON.stringify({
        t: Date.now(), d: items,
        n: Number.isFinite(d.total) ? d.total : (Array.isArray(items) ? items.length : 0),
      });
      try { localStorage.setItem(t.swrKey, payload); } catch (_) {
        try { sessionStorage.setItem(t.swrKey, payload); } catch (_e) { void _e; }
      }
    } catch (_) { /* silent */ }
  };
  // AI 2종: fire-and-forget — 로그인 로딩을 붙잡지 않는다
  bgTabs.forEach(t => { _prefetchOne(t); });
  // Promise.allSettled → 일부 실패해도 나머지 진행. localStorage persistent
  await Promise.allSettled(tabs.map(_prefetchOne));
};

// [UX-LOAD] 자동 preload 제거 — if(getToken()) / login() 에서 직접 await 하므로 중복 방지
// (기존: 부팅 시 자동 _preloadTabs 호출 → 중복 fetch 원인)

// ──────────────────────────────────────────────
// Wave 1+2+3 유틸 함수 (yeunjun 오늘 적용분 재이식 · 원영 base 위에 얹음)
// ──────────────────────────────────────────────

// 안전 localStorage — iOS Safari private mode / quota exceeded 대응
window.safeStorage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      try { return JSON.parse(raw); } catch (_) { return raw; }
    } catch (_e) { return fallback; }
  },
  set(key, value) {
    try {
      const s = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, s);
      return true;
    } catch (e) {
      try {
        const keys = Object.keys(localStorage);
        for (const k of keys) {
          if (k.startsWith('pv_cache::') || k.startsWith('itdasy_debug_')) localStorage.removeItem(k);
        }
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        return true;
      } catch (_e2) { return false; }
    }
  },
  remove(key) { try { localStorage.removeItem(key); return true; } catch (_e) { return false; } },
};

// 안전 fetch — 25초 타임아웃 + AbortController (Railway cold start 10-20s 대응)
window.safeFetch = async function (url, opts = {}) {
  const timeout = opts.timeout || 25000;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: ctl.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      const err = new Error('timeout');
      err.timeout = true;
      throw err;
    }
    throw e;
  }
};

// 에러 메시지 한글 humanizer
window._humanError = function (e) {
  if (e && e.timeout) return '서버 응답이 너무 느려요. 잠시 후 다시 시도해주세요';
  const raw = (e && (e.message || e.detail)) || String(e || '');
  // [2026-08-15 기기QA] Load failed = 사파리/WebKit 의 fetch 실패 문구. 빠져 있어서 iOS 에서 영문 노출.
  if (/HTTP\s*5\d\d|Failed to fetch|Load failed|NetworkError|network connection was lost|timeout|aborted|cancelled/i.test(raw))
    return '네트워크 연결을 확인해주세요';
  if (/HTTP\s*401|unauthor/i.test(raw))
    return '로그인이 만료됐어요. 다시 로그인해주세요';
  if (/HTTP\s*403|forbidden/i.test(raw))
    return '이 작업 권한이 없어요';
  if (/HTTP\s*400|bad request/i.test(raw))
    return '입력값을 확인해주세요';
  if (/HTTP\s*404|not.found/i.test(raw))
    return '요청한 데이터를 찾지 못했어요';
  // [핫픽스E #4·#6] _api 가 404/501 을 'endpoint-missing' 으로 throw — raw 노출(사유: endpoint-missing) 차단.
  if (/endpoint-missing/i.test(raw))
    return '아직 준비 중인 기능이에요';
  if (/HTTP\s*409/i.test(raw))
    return '이미 다른 값이 있어요. 잠시 후 다시 시도해주세요';
  if (/HTTP\s*413|too large|exceeded/i.test(raw))
    return '파일이 너무 커요 (최대 10MB)';
  if (/HTTP\s*422/i.test(raw))
    return '입력 형식을 확인해주세요';
  if (/HTTP\s*429|quota|rate.limit/i.test(raw))
    return '요청이 너무 많아요. 잠시 후 다시 시도해주세요';
  if (/HTTP\s*402|payment/i.test(raw))
    return '플랜 한도 초과예요. 업그레이드가 필요해요';
  // [§11] DB/PostgREST 원문(예: "already has another value", "duplicate key", "unique constraint") 누출 차단
  if (/already\s+has|already\s+exist|duplicate|unique\s+constraint|conflict|overlap/i.test(raw))
    return '이미 등록된 값이 있어요. 다시 확인해주세요';
  if (raw.length > 80) return '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요';
  return raw;
};

// --- Inline dialog helpers (Capacitor 호환) ---
function _inlineConfirm(msg, onYes, onNo, opts) {
  // [2026-06-10] onNo(취소 콜백) 추가 — Promise<boolean> 래핑(nativeConfirm 등)이 가능하도록. 기존 호출엔 영향 없음.
  // [Phase3-B #8] opts.okText / opts.cancelText 로 버튼 라벨 커스터마이즈(예: '예약 취소' / '아니요'). 미지정 시 기존 '확인'/'취소'.
  opts = opts || {};
  const okText = opts.okText || '확인';
  const cancelText = opts.cancelText || '취소';
  const el = document.createElement('div');
  el.className = 'bk-confirm-toast';
  el.innerHTML = `
    <div class="bk-confirm-toast__body">
      <p style="white-space:pre-line;">${msg}</p>
      <div class="bk-confirm-toast__btns">
        <button class="bk-confirm-toast__cancel">${cancelText}</button>
        <button class="bk-confirm-toast__ok">${okText}</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('.bk-confirm-toast__cancel').onclick = () => { el.remove(); if (typeof onNo === 'function') onNo(); };
  el.querySelector('.bk-confirm-toast__ok').onclick = () => { el.remove(); onYes(); };
}

function _inlinePrompt(msg, defaultVal, onSubmit) {
  const el = document.createElement('div');
  el.className = 'bk-confirm-toast';
  el.innerHTML = `
    <div class="bk-confirm-toast__body">
      <p>${msg}</p>
      <input type="text" class="bk-confirm-toast__input" value="${defaultVal || ''}" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;margin:8px 0;font-size:15px;">
      <div class="bk-confirm-toast__btns">
        <button class="bk-confirm-toast__cancel">취소</button>
        <button class="bk-confirm-toast__ok">확인</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  const inp = el.querySelector('.bk-confirm-toast__input');
  inp.focus(); inp.select();
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.querySelector('.bk-confirm-toast__ok').click(); } });
  el.querySelector('.bk-confirm-toast__cancel').onclick = () => el.remove();
  el.querySelector('.bk-confirm-toast__ok').onclick = () => { const v = inp.value.trim(); el.remove(); if (v !== '') onSubmit(v); };
}

window._inlineConfirm = _inlineConfirm;
window._inlinePrompt = _inlinePrompt;

// [2026-06-10] confirm() 대체 공용 헬퍼 — 네이티브 confirm 은 UI 전체를 멈추고(웹뷰/자동화 취약)
//   디자인도 이질적이라 _inlineConfirm 우선, 없을 때만 네이티브 폴백.
window._askConfirm = function (msg, onYes) {
  if (window._inlineConfirm) return window._inlineConfirm(msg, onYes);
  if (confirm(msg)) onYes();
};

// 2중 확인 유틸 — 레거시 호환 stub (호출처는 _inlineConfirm 으로 교체 완료)
window._confirm2 = function (_msg) {
  console.warn('[_confirm2] deprecated — use _inlineConfirm');
  return false;
};

// ─────────────────────────────────────────────────────────────
// [2026-04-24] 디바이스 간 데이터 동기화 (Task 3)
// 같은 계정 폰·노트북·태블릿에서 캐시 차이로 다르게 보이는 문제 해결.
//
// 전략 적용:
//   A. 토큰 변경 감지 → 캐시 자동 클리어 (위 setToken 안에 구현)
//   C. 명시적 동기화 버튼 (window.forceSync — 설정 시트 등에서 호출 가능)
//   E. 앱 포커스 복귀 시 5분 이상 백그라운드였으면 자동 갱신 신호
// ─────────────────────────────────────────────────────────────
window.forceSync = async function () {
  try {
    // 1/3 — 캐시 비우기
    if (typeof window.showToast === 'function') window.showToast('1/3 캐시 비우는 중…');
    if (typeof window._clearAllSWRCache === 'function') window._clearAllSWRCache();
    // sessionStorage 의 dash_cache, pv_cache 등도 함께 정리
    try {
      const keys = Object.keys(sessionStorage);
      keys.forEach(k => {
        if (/^(dash_cache::|pv_cache::|hv41_cache::)/.test(k)) sessionStorage.removeItem(k);
      });
    } catch (_e) { void _e; }

    // 2/3 — 데이터 다시 받기 신호
    setTimeout(() => {
      try {
        if (typeof window.showToast === 'function') window.showToast('2/3 서버에서 다시 받는 중…');
        window._fireDataChanged({ kind: 'force_sync' });
      } catch (_e) { void _e; }
    }, 350);

    // 3/3 — 화면 새로고침 + 마지막 동기화 시각 기록
    setTimeout(() => {
      try {
        if (typeof window.showToast === 'function') window.showToast('3/3 화면 새로고침…');
        localStorage.setItem('itdasy_last_sync_at', String(Date.now()));
      } catch (_e) { void _e; }
      setTimeout(() => { try { location.reload(); } catch (_e) { void _e; } }, 250);
    }, 700);
  } catch (e) {
    if (typeof window.showToast === 'function') window.showToast('새로고침 실패 — 잠시 후 다시 시도해주세요');
  }
};

// 마지막 동기화 시각 — 설정 시트에서 표시용 ("N분 전")
window.getLastSyncRelative = function () {
  try {
    const at = Number(localStorage.getItem('itdasy_last_sync_at') || 0);
    if (!at) return '';
    const diffMs = Date.now() - at;
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return '방금 전';
    if (min < 60) return min + '분 전';
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + '시간 전';
    return Math.floor(hr / 24) + '일 전';
  } catch (_e) { return ''; }
};

// 모든 [data-last-sync] 요소의 텍스트를 마지막 동기화 시각으로 갱신
window.refreshLastSyncBadges = function () {
  try {
    const rel = window.getLastSyncRelative();
    document.querySelectorAll('[data-last-sync]').forEach(el => {
      el.textContent = rel ? '마지막: ' + rel : '';
    });
  } catch (_e) { void _e; }
};

// DOMContentLoaded 후 1회 + 페이지 보이기 / focus 시 매번 갱신
(function _installLastSyncBadgeRefresh() {
  if (window._lastSyncBadgeInstalled) return;
  window._lastSyncBadgeInstalled = true;
  function _tick() { try { window.refreshLastSyncBadges(); } catch (_e) { void _e; } }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _tick);
  } else {
    _tick();
  }
  window.addEventListener('focus', _tick);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') _tick();
  });
})();

// 앱이 백그라운드 → 포커스 복귀 시 캐시 무효화 + data-changed 발사
// 2026-05-01 ── 60s → 300s 환원. 영상 녹화 / 다중 창 전환 시 매번 cache clear 되어 UI 렉.
// 멀티 디바이스 동시 사용 빈도 낮음 — 5분 단위 충분.
(function _installFocusSyncHandler() {
  if (window._focusSyncInstalled) return;
  window._focusSyncInstalled = true;
  const STALE_MS = 300 * 1000;  // 5분 (60s 너무 공격적이라 완화)
  function _onFocus() {
    try {
      const lastFocus = sessionStorage.getItem('itdasy:last_focus_at');
      const elapsed = lastFocus ? (Date.now() - Number(lastFocus)) : Infinity;
      if (elapsed > STALE_MS) {
        if (typeof window._clearAllSWRCache === 'function') window._clearAllSWRCache();
        try {
          window._fireDataChanged({ kind: 'focus_sync' });
        } catch (_e) { void _e; }
      }
      sessionStorage.setItem('itdasy:last_focus_at', String(Date.now()));
    } catch (_e) { void _e; }
  }
  window.addEventListener('focus', _onFocus);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') _onFocus();
  });
})();

// ─────────────────────────────────────────────────────────────
// [2026-04-26 A7] 멀티 디바이스 강화 — itdasy:data-changed 글로벌 핸들러
// 어떤 모듈이 mutation 발사 → 즉시 SWR 캐시 클리어. 다른 디바이스에서
// 갱신된 데이터가 다음 fetch 에서 무조건 fresh 로 나오도록.
// (개별 모듈 listener 는 이미 자기 도메인 캐시는 클리어하지만,
//  교차 도메인 — 매출 추가 후 인사이트 — 이 누락되는 케이스 방어.)
// ─────────────────────────────────────────────────────────────
(function _installGlobalDataChangedSync() {
  if (window._globalDataChangedInstalled) return;
  window._globalDataChangedInstalled = true;
  window.addEventListener('itdasy:data-changed', (e) => {
    try {
      // force_sync / focus_sync 는 이미 _clearAllSWRCache 를 호출함 — 중복 방지
      const kind = e && e.detail && e.detail.kind;
      if (kind === 'force_sync' || kind === 'focus_sync') return;
      if (typeof window._clearAllSWRCache === 'function') window._clearAllSWRCache();
    } catch (_e) { void _e; }
  });
})();

// ─────────────────────────────────────────────────────────────
// [2026-04-26 A5] 시트 popstate + 스와이프 다운 닫기 공통 유틸
// 모든 모달 시트에서 재사용. 안드로이드 뒤로가기 / iOS 스와이프 닫기 통일.
// 사용:  _attachSheetBackHandling('settings', closeSettings, openSettings)
//        — open 시 history.pushState({sheet:'settings'}), close 시 history.back()
//        — popstate 로 hash 사라지면 close 호출
// ─────────────────────────────────────────────────────────────
(function _initSheetBackRegistry() {
  if (window._sheetBackRegistry) return;
  const registry = new Map();   // hash -> { close, open }
  const stack = [];              // 현재 열려있는 시트 hash 스택 (문자열 배열 — 외부 소비처가 lastIndexOf/length 를 씀)
  window._sheetBackRegistry = registry;
  window._sheetBackStack = stack;

  // [2026-07-22 보스] stack 과 1:1 로 따라다니는 '내가 history 엔트리를 실제로 push 했는가' 플래그.
  //   push 안 한 시트를 닫으면서 history.back() 을 하면 남의 엔트리를 훔쳐서 화면이 두 칸 뒤로 간다.
  const pushed = [];
  // 프로그램적 history.back() 이 만들어낼 popstate 를 무시할 횟수(닫기 버튼으로 닫을 때).
  let _progBack = 0;

  // 단일 popstate 리스너 — 모든 시트 통합
  window.addEventListener('popstate', () => {
    // 내가 부른 back → 이미 close 처리까지 끝난 상태라 다시 닫으면 안 된다.
    if (_progBack > 0) { _progBack--; return; }
    if (!stack.length) return;
    const top = stack[stack.length - 1];
    const meta = registry.get(top);
    // 현재 hash 가 더 이상 #top 이 아니면 → 사용자가 뒤로가기 → close 호출
    if (!meta) return;
    const hash = (window.location.hash || '').replace(/^#/, '');
    if (hash !== top) {
      try { meta.close && meta.close(); } catch (_e) { void _e; }
      // 스택에서 pop (close 함수가 이미 _markSheetClosed 호출했으면 중복 pop 안됨)
      const idx = stack.lastIndexOf(top);
      if (idx >= 0) { stack.splice(idx, 1); pushed.splice(idx, 1); }
    }
  });

  // ── [연준님 2026-08-17 · C] 잇비에서 연 화면은 닫을 때 잇비 채팅으로 돌아간다 ──
  //   실측: 잇비 → "고객 화면 열기" → 뒤로가기 → **홈**. 원장님은 하던 대화를 잃는다.
  //   화면이 11개라 각자 고치면 또 빠뜨린다 — 시트 라우터인 여기 한 곳에서 처리한다.
  //   `_nav()` 가 arm 을 걸면 **그 다음 열리는 시트 하나**만 표시를 받고, 그 시트가
  //   닫힐 때 복귀한다. 중첩(목록 위 상세)은 arm 이 이미 풀려서 표시를 못 받으므로
  //   상세는 목록으로, 목록이 닫힐 때 잇비로 — 순서가 자연스럽게 지켜진다.
  //   history 는 건드리지 않는다. 기존 pushState/go(-n) 로직 뒤에 복귀만 붙인다.
  let _itbiReturnFor = null;
  window.__itbiArmReturn = function () { window.__ITBI_RETURN_ARM__ = true; };

  // [연준님 2026-08-18] **닫기가 건 history.go(-n) 이 착지한 뒤에** 다음 화면을 연다.
  //
  //   실측(375px 모바일, 3회 중 2회 재현): 잇비 → "고객 화면 열기" 를 누르면
  //   목록은 열리는데 주소의 `#customers` 가 **사라지고**, 그 뒤 뒤로가기가 아예 안 먹었다
  //   (잇비로도 못 돌아가고 목록이 그대로 남는다).
  //
  //   원인 — `history.go(-n)` 은 **비동기**다. `_nav()` 가 잇비를 닫자마자 다음 줄에서
  //   화면을 열면, 목록이 `pushState('#customers')` 를 한 *뒤에* 잇비의 popstate 가
  //   도착해서 그걸 되돌려 버린다. 스택엔 'customers' 가 남아 있는데 hash 는 비어 있으니
  //   popstate 매칭이 실패하고 뒤로가기가 죽는다.
  //   462px 데스크톱에선 우연히 타이밍이 맞아 통과했다 — 느린 기기일수록 잘 터진다.
  //
  //   `_progBack` 은 "아직 안 착지한 프로그램적 back" 개수다. 그게 0 이 될 때까지만
  //   기다렸다 연다(최대 300ms 폴백 — 영영 안 오는 경우에도 화면은 반드시 열린다).
  window.__afterHistorySettles = function (fn) {
    if (typeof fn !== 'function') return;
    if (_progBack <= 0) { fn(); return; }
    const t0 = Date.now();
    (function poll() {
      if (_progBack <= 0 || Date.now() - t0 > 300) { try { fn(); } catch (_e) { void _e; } return; }
      setTimeout(poll, 16);
    })();
  };

  // 시트 open 시 호출 — history.pushState
  window._markSheetOpen = function (name) {
    try {
      if (window.__ITBI_RETURN_ARM__) {
        window.__ITBI_RETURN_ARM__ = false;
        _itbiReturnFor = name;
      }
      const hash = '#' + name;
      // [연준님 2026-08-18] 스택 맨 위가 같은 시트면 **아무것도 하지 않는다**(멱등).
      //   실측 누수: 뒤로가기로 잇비에 복귀할 때 openAssistant() 가 여기를 다시 부르는데,
      //   그때 hash 는 이미 '#assistant' 로 복원돼 있어 pushState 는 건너뛰면서
      //   stack.push 만 일어났다 → 닫아도 유령 'assistant' 가 스택에 남는다.
      //   유령이 남으면 다음 뒤로가기가 그걸 pop 하려다 아무 일도 안 한다("뒤로가기 한 번 먹통").
      //   app-customer-dashboard 는 이 방어를 자기 쪽에서 직접 하고 있었다 — 라우터로 옮긴다.
      if (stack.length && stack[stack.length - 1] === name) return;
      // 이미 같은 hash 면 push 안 함 (중복 방지)
      let didPush = false;
      if (window.location.hash !== hash) {
        history.pushState({ sheet: name }, '', hash);
        didPush = true;
      }
      stack.push(name);
      pushed.push(didPush);
    } catch (_e) { void _e; }
  };

  // 시트 close 시 호출 — 열 때 쌓은 history 엔트리를 되돌린다.
  // [2026-07-22 보스] 예전엔 replaceState 로 hash 만 지웠다. 그러면 엔트리는 그대로 남아서,
  //   시트를 열었다 닫을 때마다 "눌러도 아무 일 없는 뒤로가기"가 한 칸씩 쌓였다(닫고 나서 back 을
  //   눌러도 화면이 안 바뀌다가, 몇 번 더 누르면 앱이 꺼지던 증상의 절반). 실제로 back() 으로 뺀다.
  // [2026-07-23] 중첩 시트 처리. 부모를 닫으면 그 위에 쌓인 자식들의 엔트리까지 한 번에 뺀다.
  //   예전엔 자기 것 한 칸만 봐서, 자식이 열린 채 부모를 닫으면 hash 가 남았다
  //   (댓글 큐에서 사진 확대를 열어둔 채 큐를 닫으면 주소에 #crq 가 그대로 붙어 있었다).
  //   부모의 close 는 자식 DOM 만 치우고 _markSheetClosed 는 부르지 않아야 한다 — 여기서 같이 뺀다.
  window._markSheetClosed = function (name) {
    try {
      const hash = (window.location.hash || '').replace(/^#/, '');
      const idx = stack.lastIndexOf(name);
      if (idx < 0) return;                       // 이미 정리됨
      const names = stack.splice(idx);           // [name, ...그 위에 쌓인 자식들]
      const flags = pushed.splice(idx);
      let n = flags.filter(Boolean).length;      // 실제로 push 한 엔트리 수
      // 현재 hash 가 지금 빼는 것들 중 하나가 아니면 = 사용자 back 으로 닫히는 중 →
      // 그 한 칸은 브라우저가 이미 뺐다.
      if (names.indexOf(hash) === -1) n -= 1;
      if (n > 0) {
        _progBack++;                             // go(-n) 은 popstate 를 1번만 낸다
        try { history.go(-n); } catch (_e) {
          _progBack--;
          history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      } else if (names.indexOf(hash) !== -1) {
        // push 는 안 했는데 hash 가 내 것 → 흔적만 지운다.
        // (사용자 back 으로 닫히는 중이면 여기 안 온다 — 부모 hash 를 지워버리면 안 되므로)
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      // 잇비에서 연 화면이 닫혔다 → 채팅으로 복귀. (뒤로가기·✕·바깥탭 전부 여기를 지난다)
      //   부모를 닫으며 자식까지 정리되는 경우도 names 에 들어 있으니 같이 본다.
      if (_itbiReturnFor && names.indexOf(_itbiReturnFor) !== -1) {
        _itbiReturnFor = null;
        const _sheet = document.getElementById('assistantSheet');
        const _alreadyOpen = _sheet && _sheet.style.display !== 'none' && _sheet.style.display !== '';
        if (!_alreadyOpen && typeof window.openAssistant === 'function') {
          try { window.openAssistant(); } catch (_e2) { void _e2; }
        }
      }
    } catch (_e) { void _e; }
  };

  // 시트 등록 — close 함수만 필요. open 은 wrapping 하지 않음 (각 모듈이 직접 _markSheetOpen 호출)
  window._registerSheet = function (name, closeFn) {
    if (typeof closeFn !== 'function') return;
    registry.set(name, { close: closeFn });
  };

  // 스와이프 다운 닫기 — sheet 컨테이너에 부착. 핸들 영역(상단 60px) 에서만 트리거.
  // close 함수를 인자로 받음. threshold deltaY > 50px.
  window._attachSwipeDownClose = function (containerEl, closeFn) {
    if (!containerEl || typeof closeFn !== 'function') return;
    if (containerEl._swipeAttached) return;
    containerEl._swipeAttached = true;
    let startY = 0;
    let startTime = 0;
    let dragging = false;
    let inHandleZone = false;

    containerEl.addEventListener('touchstart', (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      const t = e.touches[0];
      const rect = containerEl.getBoundingClientRect();
      // 핸들 영역 = 시트 상단 60px 이내
      inHandleZone = (t.clientY - rect.top) < 60;
      if (!inHandleZone) return;
      startY = t.clientY;
      startTime = Date.now();
      dragging = true;
    }, { passive: true });

    containerEl.addEventListener('touchmove', (e) => {
      if (!dragging || !e.touches || e.touches.length !== 1) return;
      const dy = e.touches[0].clientY - startY;
      if (dy > 0 && dy < 200) {
        containerEl.style.transform = `translateY(${dy}px)`;
      }
    }, { passive: true });

    containerEl.addEventListener('touchend', (e) => {
      if (!dragging) return;
      dragging = false;
      const endY = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientY : startY;
      const dy = endY - startY;
      const elapsed = Date.now() - startTime;
      // 50px 이상 또는 100ms 이내 빠른 swipe + 30px+
      const shouldClose = dy > 50 || (elapsed < 200 && dy > 30);
      containerEl.style.transform = '';
      if (shouldClose) {
        try { closeFn(); } catch (_e) { void _e; }
      }
    });
  };
})();

// ─────────────────────────────────────────────────────────────
// [2026-04-26 A5] PWA standalone 모드 — 모달 열려있을 때 새로고침 차단
// 일반 웹은 영향 없음 (display-mode standalone 일 때만 동작).
// ─────────────────────────────────────────────────────────────
(function _installPwaReloadGuard() {
  if (window._pwaReloadGuardInstalled) return;
  window._pwaReloadGuardInstalled = true;
  function _isStandalone() {
    try {
      return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
             (window.navigator && window.navigator.standalone === true);
    } catch (_e) { return false; }
  }
  function _hasOpenSheet() {
    try {
      const stack = window._sheetBackStack;
      return Array.isArray(stack) && stack.length > 0;
    } catch (_e) { return false; }
  }
  window.addEventListener('beforeunload', (e) => {
    if (!_isStandalone()) return;        // 일반 웹은 그대로
    if (!_hasOpenSheet()) return;        // 시트 안 열려있으면 그대로
    e.preventDefault();
    e.returnValue = '';
    return '';
  });
})();
