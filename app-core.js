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
    console.log = noop;
    console.info = noop;
    console.warn = noop;
    console.debug = noop;
    // console.error 는 유지 — Sentry 등에서 캐치용
  }
})();

// ===== 백엔드 설정 =====
// 이 레포(itdasy-frontend-test-yeunjun)는 연준 스테이징 전용 → 스테이징 백엔드 바라봄
// 운영 레포(itdasy-frontend)는 프로덕션 백엔드(itdasy260417-production)를 사용해야 함
const PROD_API = 'https://itdasy260417-staging-production.up.railway.app';
const API = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:8000'
  : PROD_API;

// ===== 토큰 localStorage 키를 백엔드별로 분리 =====
// nopo-lab.github.io는 운영/스테이징 프론트가 같은 origin이라 localStorage 공유.
// 백엔드가 다르면(운영 vs 스테이징) JWT 서명이 달라서 크로스 오염 시 401 "인증 실패" 발생.
// → API URL 기반으로 토큰 키를 분리해서 완전 격리.
const _TOKEN_KEY = 'itdasy_token::' + (API.includes('staging') ? 'staging' : (API.includes('localhost') ? 'local' : 'prod'));

let _instaHandle = '';  // checkInstaStatus에서 저장

function showToast(msg) {
  const t = document.getElementById('copyToast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

function showWelcome(shopName) {
  const overlay = document.getElementById('welcomeOverlay');
  const nameEl  = document.getElementById('welcomeShopName');
  if (!overlay) return;
  if (nameEl) nameEl.textContent = shopName || '사장';
  overlay.classList.add('show');
  setTimeout(() => {
    overlay.classList.add('hide');
    setTimeout(() => overlay.classList.remove('show', 'hide'), 400);
  }, 1800);
}

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

function updateHeaderProfile(handle, tone, picUrl) {
  const el = document.getElementById('headerPersona');
  if (!el) return;
  el.style.display = 'flex';

  const shopName = localStorage.getItem('shop_name') || '사장님';
  const shopNameEl = document.getElementById('headerShopName');
  if (shopNameEl) shopNameEl.textContent = shopName;

  const publishLabel = document.getElementById('publishBtnLabel');
  if (publishLabel) publishLabel.textContent = `${shopName} 피드에 바로 올리기`;

  // 헤더 아바타: 이미지 있으면 img, 없으면 이니셜
  // (가입 방법 배지 #headerProviderBadge 는 보존)
  const avatarEl = document.getElementById('headerAvatar');
  if (avatarEl) {
    const badge = document.getElementById('headerProviderBadge');
    if (picUrl) {
      avatarEl.innerHTML = `<img src="${picUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
      const letter = (shopName || '사장님')[0]?.toUpperCase() || '✨';
      avatarEl.innerHTML = `<span class="profile-avatar__initial">${letter}</span>`;
    }
    // 배지 다시 붙이기 (innerHTML 로 날아갔으므로)
    if (badge) avatarEl.appendChild(badge);
    // 현재 저장된 가입 방법 즉시 반영
    if (typeof window.applyOAuthProviderBadge === 'function') {
      window.applyOAuthProviderBadge();
    }
  }

  // 인스타 프레임 핸들 + 아바타 갱신 (미리보기용)
  const fh = document.getElementById('frameHandle');
  if (fh && handle) fh.textContent = '@' + handle.replace('@','');
  const fi = document.getElementById('frameAvatarInner');
  if (fi) {
    if (picUrl) {
      fi.innerHTML = `<img src="${picUrl}" alt="" style="width:100%;height:100%;object-fit:cover;">`;
    } else {
      const letter = (shopName || '사장님')[0]?.toUpperCase() || '✨';
      fi.innerHTML = `<span id="frameAvatarLetter">${letter}</span>`;
    }
  }
}

// ───── 업종별 설정 ─────
const SHOP_CONFIG = {
  '붙임머리': {
    question:    '오늘 어떤 붙임머리 작업을 하셨나요? 💇',
    tagLabel:    '인치 선택',
    treatments:  ['18인치','20인치','22인치','24인치','26인치','28인치','30인치','특수인치','옴브레','재시술'],
    defaultTag:  '24인치',
    baGuide:     '시술 전후 머리 길이 변화를 극명하게 보여주세요. 옆모습 기준이 효과적이에요 💇',
  },
  '네일아트': {
    question:    '오늘 어떤 네일 작업을 하셨나요? 💅',
    tagLabel:    '시술 종류',
    treatments:  ['젤네일','아트네일','아크릴','스컬프처','네일케어','오프','재시술','페디큐어'],
    defaultTag:  '젤네일',
    baGuide:     '손톱 클로즈업으로 Before/After 변화를 선명하게 보여주세요 💅',
  },
};

function applyShopType(type) {
  const cfg = SHOP_CONFIG[type];
  if (!cfg) return;

  const shopName = localStorage.getItem('shop_name') || '사장님';

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

  // BA 가이드 텍스트
  const baGuide = document.getElementById('baGuideText');
  if (baGuide) baGuide.textContent = cfg.baGuide;
}

// ───── 온보딩 ─────
let obStep = 1;
let obShopType = '';

function checkOnboarding() {
  if (!localStorage.getItem('onboarding_done')) {
    document.getElementById('onboardingOverlay').classList.remove('hidden');
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

function obShowStep(n) {
  document.querySelectorAll('.ob-step').forEach(s => s.classList.remove('active'));
  document.getElementById('ob-step-' + n).classList.add('active');
  document.querySelectorAll('.ob-dot').forEach((d, i) => {
    d.classList.toggle('active', i < n);
  });
  const btn = document.getElementById('obBtn');
  btn.textContent = n === 4 ? '시작하기 🎉' : '계속하기';
  obStep = n;
}

async function obNext() {
  if (obStep === 1) {
    obShowStep(2);
  } else if (obStep === 2) {
    if (!obShopType) {
      // 선택 안 했으면 카드 살짝 흔들기
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
    const name = document.getElementById('obShopNameInput').value.trim();
    if (!name) {
      document.getElementById('obShopNameInput').style.borderBottomColor = '#E05555';
      setTimeout(() => document.getElementById('obShopNameInput').style.borderBottomColor = '', 1200);
      return;
    }
    localStorage.setItem('shop_name', name); // 로컬에도 저장해서 즉시 반영
    document.getElementById('obCompleteName').textContent = name;
    obShowStep(4);
    // 백엔드에 샵 이름 저장 (에러 무시)
    fetch(API + '/shop/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ shop_name: name })
    }).catch(() => {});
  } else if (obStep === 4) {
    const name = document.getElementById('obShopNameInput').value.trim();
    localStorage.setItem('onboarding_done', '1');
    localStorage.setItem('shop_type', obShopType);
    if (name) localStorage.setItem('shop_name', name);

    document.getElementById('onboardingOverlay').classList.add('hidden');
    applyShopType(obShopType);
    updateHeaderProfile(null, null, null);
  }
}

// Step 3 Enter 키
document.getElementById('obShopNameInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') obNext();
});

function getToken() {
  try {
    const t = localStorage.getItem(_TOKEN_KEY);
    if (!t) return null;
    try {
      const payload = JSON.parse(atob(t.split('.')[1]));
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        localStorage.removeItem(_TOKEN_KEY);
        return null;
      }
    } catch { return null; }
    return t;
  } catch (_) { return null; }  // iOS Private 모드 SecurityError 방어
}
// [2026-04-24] 디바이스 간 데이터 불일치 방어 — 토큰 변경 감지 시 SWR 캐시 일괄 클리어.
// 폰·노트북·태블릿 같은 계정으로 들어왔을 때 다른 디바이스의 stale 스냅샷이 보이는 문제 해결.
function _clearAllSWRCache() {
  try {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('pv_cache::') || k.startsWith('itdasy:cache')) {
        try { localStorage.removeItem(k); } catch (_e) { void _e; }
      }
    });
  } catch (_e) { void _e; }
  try {
    Object.keys(sessionStorage).forEach(k => {
      if (k.startsWith('pv_cache::') || k.startsWith('itdasy:cache')) {
        try { sessionStorage.removeItem(k); } catch (_e) { void _e; }
      }
    });
  } catch (_e) { void _e; }
}
window._clearAllSWRCache = _clearAllSWRCache;

// ──────────────────────────────────────────────
// 사용자별 캐시·세션 격리 (T-2026-04-26)
//   다른 계정 로그인 / 신규 가입 시 이전 사용자의 잔존 데이터가 화면에
//   남는 문제 해결. 토큰 변경만으로는 same-user 토큰 갱신 vs other-user
//   새 토큰을 구분 못 하므로 user_id 기준으로 비교.
// ──────────────────────────────────────────────
const _USER_KEY_PREFIXES = ['itdasy_', 'pv_cache::', 'persona_'];
const _USER_KEY_EXACT = ['last_login_email', 'user_oauth_provider', 'last_user_id'];
// 디바이스/UI 설정처럼 사용자 변경 시 보존할 키 (온보딩·테마·언어)
const _USER_KEY_KEEP = new Set([
  'onboarding_done', 'shop_type', 'shop_name',
  'theme', 'itdasy_theme', 'lang', 'i18n_lang',
  'itdasy_biometric_asked',
]);

function _purgeUserScopedStorage() {
  try {
    Object.keys(localStorage).forEach(k => {
      if (_USER_KEY_KEEP.has(k)) return;
      if (k === _TOKEN_KEY) return; // 토큰은 setToken 이 별도 관리
      const matchPrefix = _USER_KEY_PREFIXES.some(p => k.startsWith(p));
      const matchExact = _USER_KEY_EXACT.includes(k);
      if (matchPrefix || matchExact) {
        try { localStorage.removeItem(k); } catch (_e) { void _e; }
      }
    });
  } catch (_e) { void _e; }
  try {
    Object.keys(sessionStorage).forEach(k => {
      if (_USER_KEY_KEEP.has(k)) return;
      const matchPrefix = _USER_KEY_PREFIXES.some(p => k.startsWith(p));
      const matchExact = _USER_KEY_EXACT.includes(k);
      if (matchPrefix || matchExact) {
        try { sessionStorage.removeItem(k); } catch (_e) { void _e; }
      }
    });
  } catch (_e) { void _e; }
  _clearAllSWRCache();
}
window._purgeUserScopedStorage = _purgeUserScopedStorage;

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
  if (newUserId && prevUserId && newUserId !== prevUserId) {
    _purgeUserScopedStorage();
  } else if (opts.forcePurge) {
    _purgeUserScopedStorage();
  }

  if (newUserId) {
    try { localStorage.setItem('last_user_id', newUserId); } catch (_) { /* ignore */ }
  }

  // /auth/me 로 가입방법·이메일 동기화 (실패는 무시)
  try {
    const res = await fetch(API + '/auth/me', {
      headers: { 'Authorization': 'Bearer ' + newToken, 'ngrok-skip-browser-warning': 'true' },
    });
    if (res && res.ok) {
      const me = await res.json();
      if (me) {
        try { if (me.email) localStorage.setItem('last_login_email', me.email); } catch (_) {}
        try { if (me.oauth_provider) localStorage.setItem('user_oauth_provider', me.oauth_provider); } catch (_) {}
        if (typeof window.applyOAuthProviderBadge === 'function') {
          window.applyOAuthProviderBadge();
        }
      }
    }
  } catch (_) { /* network error → 무시 */ }
}
window.applyNewSession = applyNewSession;

// 헤더 아바타에 가입방법 배지 색·툴팁 적용
function applyOAuthProviderBadge() {
  let prov = 'email';
  try { prov = localStorage.getItem('user_oauth_provider') || 'email'; } catch (_) {}
  const allow = new Set(['email', 'google', 'kakao', 'apple']);
  if (!allow.has(prov)) prov = 'email';
  const el = document.getElementById('headerProviderBadge');
  if (!el) return;
  el.dataset.provider = prov;
  const labels = {
    email: '잇데이 계정으로 가입',
    google: '구글 계정으로 가입',
    kakao: '카카오 계정으로 가입',
    apple: 'Apple 계정으로 가입',
  };
  el.title = labels[prov];
  el.setAttribute('aria-label', '가입 방법: ' + (
    prov === 'email' ? '잇데이' : prov === 'google' ? '구글' : prov === 'kakao' ? '카카오' : 'Apple'
  ));
}
window.applyOAuthProviderBadge = applyOAuthProviderBadge;

function setToken(t) {
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
}
function authHeader() {
  const t = getToken();
  return t ? { 'Authorization': 'Bearer ' + t, 'ngrok-skip-browser-warning': 'true' }
           : { 'ngrok-skip-browser-warning': 'true' };
}

// 전역 fetch 래퍼 — 401 자동 로그아웃 + 5xx/네트워크 에러 자동 재시도 (T-352)
(function _installFetchInterceptor(){
  if (window._fetchPatched) return;
  window._fetchPatched = true;
  const _origFetch = window.fetch.bind(window);

  // 재시도 설정: 읽기성 요청(GET/HEAD)과 멱등성 POST 는 재시도. 파일 업로드 요청(body 가 FormData/Blob)도 재시도 가능하나 body 를 재사용 못하므로 제외.
  const RETRY_STATUSES = new Set([502, 503, 504]);
  const MAX_RETRIES = 2;          // 총 3회 시도 (초기 + 2회 재시도)
  const BACKOFF_MS = [400, 1200]; // exponential-ish

  function _isRetryableMethod(init) {
    const m = (init && init.method ? String(init.method).toUpperCase() : 'GET');
    return m === 'GET' || m === 'HEAD';
  }
  function _bodyReusable(init) {
    if (!init || !init.body) return true;
    const b = init.body;
    if (typeof b === 'string') return true;
    return false; // FormData/Blob/ReadableStream 은 한 번만 읽을 수 있어서 재시도 시 body 재사용 불가
  }

  function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  let _reconnectToastTimer = null;
  function _showReconnectToast() {
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

  window.fetch = async function(input, init) {
    const retryable = _isRetryableMethod(init) && _bodyReusable(init);
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const res = await _origFetch(input, init);
        if (res.status === 401 && getToken()) {
          setToken(null);
          const msg = document.getElementById('sessionExpiredMsg');
          if (msg) msg.style.display = 'block';
          const lock = document.getElementById('lockOverlay');
          if (lock) lock.classList.remove('hidden');
          return res;
        }
        // 5xx 게이트웨이성 에러: retryable 이면 재시도
        if (retryable && RETRY_STATUSES.has(res.status) && attempt < MAX_RETRIES) {
          _showReconnectToast();
          await _sleep(BACKOFF_MS[attempt] || 1500);
          attempt++;
          continue;
        }
        return res;
      } catch (err) {
        // 네트워크 에러 (DNS·오프라인·CORS·abort) — retryable 한정으로 재시도
        if (retryable && attempt < MAX_RETRIES) {
          _showReconnectToast();
          await _sleep(BACKOFF_MS[attempt] || 1500);
          attempt++;
          continue;
        }
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
(function initSplash() {
  const isPWA = window.navigator.standalone === true
             || window.matchMedia('(display-mode: standalone)').matches;
  if (!isPWA) return;

  const splash = document.getElementById('splashScreen');
  if (!splash) return;

  // 메인 콘텐츠 숨기고 스플래시 표시
  document.body.classList.add('splashing');
  splash.style.display = 'flex';

  // 2.0s → 페이드아웃 시작, 2.3s → 완전 제거
  setTimeout(() => {
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.style.display = 'none';
      document.body.classList.remove('splashing');
    }, 300);
  }, 2000);
})();

// ───── 설정 바텀시트 ─────
function openSettings() {
  const sheet = document.getElementById('settingsSheet');
  const card  = document.getElementById('settingsCard');

  // 프로필 카드 업데이트
  const shopName = localStorage.getItem('shop_name') || document.getElementById('headerShopName')?.textContent || '사장님';
  const profileNameEl  = document.getElementById('settingsProfileName');
  const profileHandleEl = document.getElementById('settingsProfileHandle');
  const settingsAvatarEl = document.getElementById('settingsAvatar');

  if (profileNameEl)   profileNameEl.textContent  = shopName;
  if (profileHandleEl) profileHandleEl.textContent = _instaHandle ? `@${_instaHandle}` : '인스타 미연동';

  // 헤더 아바타 복사 (이니셜 span 만 가져오기 — 배지 span 제외)
  const headerAvatarEl = document.getElementById('headerAvatar');
  if (settingsAvatarEl && headerAvatarEl) {
    const img = headerAvatarEl.querySelector('img');
    if (img) {
      settingsAvatarEl.innerHTML = `<img src="${img.src}" alt="">`;
    } else {
      const initialEl = headerAvatarEl.querySelector('.profile-avatar__initial');
      settingsAvatarEl.textContent = (initialEl ? initialEl.textContent : '') || shopName[0] || '잇';
    }
  }

  // 먼저 display, 한 프레임 뒤 open (두 번 rAF로 확실히 렌더 후 transition 발동)
  card.classList.remove('open');
  sheet.style.display = 'flex';
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('open')));
}

function closeSettings() {
  const sheet = document.getElementById('settingsSheet');
  const card  = document.getElementById('settingsCard');
  card.classList.remove('open');
  setTimeout(() => { sheet.style.display = 'none'; }, 280);
}

async function resetShopSetup() {
  if (!(await nativeConfirm("확인", '샵 이름과 종류를 다시 설정할까요?'))) return;
  localStorage.removeItem('shop_name');
  localStorage.removeItem('shop_type');
  localStorage.removeItem('onboarding_done');
  const ob = document.getElementById('onboardingOverlay');
  if (ob) ob.classList.remove('hidden');
}

async function localReset() {
  if (!(await nativeConfirm("확인", '앱을 처음 상태로 초기화할까요?\n(로그인은 유지됩니다)'))) return;
  ['itdasy_consented','itdasy_consented_at','itdasy_latest_analysis',
   'onboarding_done','shop_name','shop_type'].forEach(k => localStorage.removeItem(k));
  // 인스타 연동도 백엔드에서 해제
  try { await fetch(API + '/instagram/disconnect', { method: 'POST', headers: authHeader() }); } catch(_) { /* ignore */ }
  location.reload();
}

function checkCbt1Reset() {
  if (getMyUserId() === 1) {
    const el = document.getElementById('cbt1ResetArea');
    if (el) el.style.display = 'block';
  }
}

async function fullReset() {
  if (!(await nativeConfirm("확인", '⚠️ 모든 데이터(온보딩·샵설정·인스타연동·말투분석)가 초기화됩니다.\n정말 처음부터 시작할까요?'))) return;
  try {
    const res = await fetch(API + '/admin/reset', { method: 'POST', headers: authHeader() });
    if (!res.ok) throw new Error('초기화 실패');
    [_TOKEN_KEY,'itdasy_token','itdasy_consented','itdasy_consented_at','itdasy_latest_analysis','onboarding_done','shop_name','shop_type','itdasy_master_set'].forEach(k => localStorage.removeItem(k));
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
}

// ──────────────────────────────────────────────
// 계정 탈퇴 (Apple Guideline 5.1.1(ix) 필수)
// ──────────────────────────────────────────────
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
    const res = await fetch(`${API_BASE}/auth/delete-account`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getToken()}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || `삭제 실패 (${res.status})`);
    }
    // 세션·캐시 전면 삭제
    setToken(null);
    try { localStorage.clear(); } catch (_) { /* ignore */ }
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      } catch (_) { /* ignore */ }
    }
    alert('계정이 완전히 삭제되었습니다. 이용해 주셔서 감사합니다.');
    location.href = 'index.html';
  } catch (e) {
    if (err) { err.textContent = e.message || '삭제 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'; err.style.display = 'block'; }
    if (btn) { btn.textContent = '영구 삭제'; btn.disabled = false; }
  } finally {
    _deleteAccountInFlight = false;
  }
}

async function logout() {
  if (!(await nativeConfirm("확인", "로그아웃 하시겠습니까? 세션과 캐시가 모두 초기화됩니다."))) return;

  // 1. 토큰 및 사용자 범위 스토리지 광범위 삭제
  setToken(null);
  // 사용자 식별 / 캐시 / 페르소나·일정·세션 컨텍스트 일괄 정리
  // (온보딩·테마·생체등록 같은 디바이스 설정은 _USER_KEY_KEEP 가 보존)
  try { _purgeUserScopedStorage(); } catch (_e) { void _e; }
  // 호환성 — 옛 단일 키도 함께 제거
  ['itdasy_token', 'itdasy_consented', 'itdasy_consented_at', 'itdasy_latest_analysis'].forEach(k => {
    try { localStorage.removeItem(k); } catch (_e) { void _e; }
  });

  // [2026-04-26] 갤러리 IndexedDB 도 같이 비움 — 다음 사용자한테 새는 거 차단 (Meta 심사 블로커)
  try {
    if (typeof clearGalleryDB === 'function') {
      await clearGalleryDB();
    }
  } catch (e) { /* IDB clear best-effort */ }

  // 2. 서비스 워커 캐시 강제 삭제
  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    } catch (e) { /* cache clear best-effort */ }
  }

  // 3. 페이지 새로고침 (클린 캐시 상태로 진입)
  location.href = 'index.html'; // 아예 홈으로 보냄
}


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
    const res = await fetch(API + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || '로그인 실패');
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
    document.getElementById('lockOverlay').classList.add('hidden');
    checkCbt1Reset();
    checkOnboarding();
    checkInstaStatus(true);
    // T-317 — 생체 인증 등록 제안 (한 번만)
    _offerBiometricEnroll(data.access_token);
    // Wave 2+ — 로그인 직후 주요 데이터 preload (탭 열 때 즉시 표시)
    _preloadTabs();
    // 홈 화면 AI 추천 카드 즉시 렌더 (로그인하자마자 바로 보이도록)
    setTimeout(() => {
      if (window.TodayBrief && typeof window.TodayBrief.render === 'function') {
        try { window.TodayBrief.render('home-today-brief'); } catch (_e) { /* ignore */ }
      }
    }, 500);
  } catch(e) {
    errEl.textContent = _friendlyErr(e, '로그인 실패');
    errEl.style.display = 'block';
  } finally {
    btn.textContent = '로그인'; btn.disabled = false;
    _loginInFlight = false;
  }
}

// 네트워크/타임아웃 등 친근한 에러 메시지
function _friendlyErr(e, fallback) {
  const m = String(e && e.message || e || '').toLowerCase();
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('network')) {
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
        if (window.showToast) window.showToast('✅ 생체 인증 등록됨');
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
    try { await applyNewSession(token); } catch (_) { /* ignore */ }
    return true;
  } catch (_) { return false; }
}

// 회원가입
let _signupInFlight = false;
async function signup() {
  if (_signupInFlight) return;
  _signupInFlight = true;
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const referral_code = document.getElementById('signupRef').value.trim() || null;
  const agree = document.getElementById('signupAgree').checked;
  const btn = document.getElementById('signupBtn');
  const errEl = document.getElementById('signupError');
  errEl.style.display = 'none';
  if (!agree) { errEl.textContent = '약관에 동의해주세요.'; errEl.style.display = 'block'; return; }
  if (!name || !email || !password) { errEl.textContent = '모든 필수 항목을 입력해주세요.'; errEl.style.display = 'block'; return; }
  if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    errEl.textContent = '비밀번호는 8자 이상이고 영문+숫자를 포함해야 합니다.';
    errEl.style.display = 'block'; return;
  }
  btn.textContent = '가입 중…'; btn.disabled = true;
  try {
    const res = await fetch(API + '/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, referral_code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || '가입 실패');
    // 자동 로그인
    const loginRes = await fetch(API + '/auth/login', {
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
    document.getElementById('lockOverlay').classList.add('hidden');
    checkOnboarding();
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
  } else {
    signup.style.display = 'none';
    lock.classList.remove('hidden');
  }
}

// ───── Google OAuth 로그인 시작 ─────
// 백엔드에 authorize URL 을 요청 → 사용자를 Google 로그인 페이지로 이동
// 완료 후 /oauth-return.html 에서 토큰 저장
window.startGoogleLogin = async function () {
  try {
    // GitHub Pages 서브패스 (/itdasy-frontend-test-yeunjun/) 대응 — 현재 URL 기준 상대 경로
    const returnTo = new URL('oauth-return.html', window.location.href).href;
    const res = await fetch(
      `${window.API}/auth/google/authorize?return_to=${encodeURIComponent(returnTo)}`
    );
    if (!res.ok) throw new Error('Google 로그인 준비 실패');
    const { url } = await res.json();
    // Capacitor 네이티브 환경이면 in-app browser, 아니면 같은 탭 이동
    if (window.Capacitor?.Plugins?.Browser) {
      await window.Capacitor.Plugins.Browser.open({ url });
    } else {
      window.location.href = url;
    }
  } catch (e) {
    const msg = window._humanError ? window._humanError(e) : (e.message || 'Google 로그인 오류');
    alert(msg);
  }
};

// ───── 카카오 OAuth 로그인 시작 ─────
window.startKakaoLogin = async function () {
  try {
    // GitHub Pages 서브패스 (/itdasy-frontend-test-yeunjun/) 대응 — 현재 URL 기준 상대 경로
    const returnTo = new URL('oauth-return.html', window.location.href).href;
    const res = await fetch(
      `${window.API}/auth/kakao/authorize?return_to=${encodeURIComponent(returnTo)}`
    );
    if (!res.ok) throw new Error('카카오 로그인 준비 실패');
    const { url } = await res.json();
    if (window.Capacitor?.Plugins?.Browser) {
      await window.Capacitor.Plugins.Browser.open({ url });
    } else {
      window.location.href = url;
    }
  } catch (e) {
    const msg = window._humanError ? window._humanError(e) : (e.message || '카카오 로그인 오류');
    alert(msg);
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

  document.addEventListener('focusout', (e) => {
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
    // visual viewport 가 layout viewport 보다 작아진 만큼(키보드/URL바) 보정
    const offset = (window.innerHeight - vv.height - vv.offsetTop) | 0;
    // 안전영역 + 기본 14px + 보정값
    root.style.setProperty(
      '--tab-bar-bottom',
      `calc(${BASE}px + env(safe-area-inset-bottom, 0px) + ${Math.max(0, offset)}px)`
    );
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
  vv.addEventListener('resize', schedule, { passive: true });
  vv.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(update, 250), { passive: true });
  update();
})();

// ===== 앱 초기화 (모든 모듈 로드 후 실행) =====
window.addEventListener('load', function() {
  // Enter 키 로그인 (IME 조합 중 무시)
  const loginPw = document.getElementById('loginPassword');
  if (loginPw) loginPw.addEventListener('keydown', e => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') login();
  });

  // 비밀번호 보기 토글
  const pwToggle = document.getElementById('loginPwToggle');
  if (pwToggle) pwToggle.addEventListener('click', () => {
    const inp = document.getElementById('loginPassword');
    if (!inp) return;
    inp.type = inp.type === 'password' ? 'text' : 'password';
    pwToggle.textContent = inp.type === 'password' ? '👁' : '🙈';
  });

  // 회원가입 전환 — document 위임 (타이밍 무관)
  document.addEventListener('click', (e) => {
    const goSignup = e.target.closest('#goSignup');
    if (goSignup) { e.preventDefault(); _toggleSignup(true); return; }
    const goLogin = e.target.closest('#goLogin');
    if (goLogin) { e.preventDefault(); _toggleSignup(false); return; }
    const signupBtn2 = e.target.closest('#signupBtn');
    if (signupBtn2) {
      const a = document.getElementById('signupAgree');
      if (!a || !a.checked) {
        const err = document.getElementById('signupError');
        if (err) { err.textContent = '약관에 동의해주세요.'; err.style.display = 'block'; }
        return;
      }
      signup();
    }
  }, false);

  // 약관 동의 시 버튼 활성화
  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'signupAgree') {
      const btn = document.getElementById('signupBtn');
      if (btn) {
        btn.style.opacity = e.target.checked ? '1' : '0.6';
        btn.style.pointerEvents = e.target.checked ? 'auto' : 'none';
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
      if (e.key === 'Enter' && agree && agree.checked) signup();
    });
  });
  window.signup = signup;

  // Chrome으로 이동 시 토큰 자동 복원 + 연동 자동 실행
  (function() {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('_t');
    if (t) {
      const tok = decodeURIComponent(t);
      setToken(tok);
      // 다른 사용자 토큰일 수 있으니 사용자 범위 캐시 정리 + 배지 동기화
      try { window.applyNewSession && window.applyNewSession(tok); } catch (_) { /* ignore */ }
      history.replaceState(null, '', window.location.pathname);
    }
  })();

  // T-317 — 토큰 없어도 생체 인증 등록돼 있으면 먼저 시도
  (async () => {
    if (!getToken() && window.Biometric && window.Biometric.isEnabled()) {
      const ok = await _tryBiometricLogin();
      if (ok) {
        document.getElementById('lockOverlay').classList.add('hidden');
        checkOnboarding();
        checkInstaStatus(true);
      }
    }
  })();

  // 토큰 있으면 자동 로그인
  if(getToken()) {
    document.getElementById('lockOverlay').classList.add('hidden');
    // 가입방법 배지 + last_user_id 보정 (기존 캐시값으로 즉시 + /me 로 갱신)
    try { applyOAuthProviderBadge(); } catch (_) { /* ignore */ }
    try { applyNewSession(getToken()); } catch (_) { /* ignore */ }
    checkCbt1Reset();
    checkOnboarding();
    checkInstaStatus().then(() => {
      // 인스타 OAuth 콜백 후 내 말투 자동 완성
      const params = new URLSearchParams(window.location.search);
      if (params.get('connected') === 'success') {
        history.replaceState(null, '', window.location.pathname);
        setTimeout(runPersonaAnalyze, 800);
      }
      // Chrome 이동 후 자동 연동 시작
      if (params.get('auto_connect') === '1') {
        history.replaceState(null, '', window.location.pathname);
        setTimeout(connectInstagram, 500);
      }
    });

    // 기존 동의 완료 시각 복원
    const consentedAt = localStorage.getItem('itdasy_consented_at');
    const tsEl2 = document.getElementById('consentTimestampDisplay');
    if (tsEl2) {
      if (consentedAt) {
        tsEl2.textContent = `✅ 개인정보 동의 완료 · ${consentedAt}`;
        tsEl2.style.display = 'inline';
      } else {
        tsEl2.textContent = '';
        tsEl2.style.display = 'none';
      }
    }
    // 홈 화면 AI 추천 카드 즉시 렌더 (자동 로그인 시에도)
    setTimeout(() => {
      if (window.TodayBrief && typeof window.TodayBrief.render === 'function') {
        try { window.TodayBrief.render('home-today-brief'); } catch (_e) { /* ignore */ }
      }
    }, 800);
  }
});

function expandSmartMenu() {
  openNavSheet();
}

function openNavSheet() {
  const sheet = document.getElementById('navSheet');
  if (!sheet) return;
  sheet.style.display = 'flex';
  requestAnimationFrame(() => {
    document.getElementById('navSheetInner').style.transform = 'translateY(0)';
  });
}

function closeNavSheet() {
  const inner = document.getElementById('navSheetInner');
  if (!inner) return;
  inner.style.transform = 'translateY(100%)';
  setTimeout(() => { document.getElementById('navSheet').style.display = 'none'; }, 280);
}

// 탭 전환
function showTab(id, btn) {
  // P3.1 #2: .tab 바깥 요소 잔존 방지
  if (typeof closeSlotPopup === 'function') closeSlotPopup();
  const sg = document.getElementById('_nextSlotGuide');
  if (sg) sg.style.display = 'none';

  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-bar button').forEach(b => b.classList.remove('active'));
  const target = document.getElementById('tab-' + id);
  if (target) target.classList.add('active');
  if (btn) btn.classList.add('active');
  // 탭 전환 시 스크롤 맨 위로 리셋
  window.scrollTo(0, 0);
  document.body.scrollTop = 0;
  document.documentElement.scrollTop = 0;
  // 홈 탭 활성화 시 통합 카드 렌더 (Task 5: TodayBrief 가 AI 제안까지 함께 그림)
  if (id === 'home') {
    if (window.TodayBrief && typeof window.TodayBrief.render === 'function') {
      try { window.TodayBrief.render('home-today-brief'); } catch (_e) { /* ignore */ }
    }
  }
  // 내샵관리 탭 활성화 시 대시보드 렌더 (Task 6: 이번달 브리핑 흡수)
  if (id === 'dashboard') {
    if (typeof window.initDashboardTab === 'function') {
      try { window.initDashboardTab(); } catch (_e) { /* ignore */ }
    }
  }
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
      if (toggleBtn && toggleBtn.textContent.includes('선택됨')) toggleBtn.textContent = '📦 배경 창고 열기';
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
window.APP_BUILD = '20260420-v21';
function _updateVersionBadge(swVer) {
  const el = document.getElementById('appVersionBadge');
  if (!el) return;
  const v = swVer || window.APP_BUILD || '?';
  el.textContent = 'v' + v.replace(/^20\d{6}-?/, '');
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

const _isCapacitor = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

if ('serviceWorker' in navigator && !_isCapacitor) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => {
      const u = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || '';
      if (u && !u.endsWith('/sw.js')) {
        console.warn('[SW] 구 SW 언레지스터:', u);
        reg.unregister();
      }
    });
  }).catch(() => {});

  navigator.serviceWorker.register('sw.js', { scope: './' })
    .then(reg => {
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
    })
    .catch(err => {
      console.warn('[SW] 등록 실패:', {
        name: err?.name, message: err?.message, code: err?.code,
        toString: String(err), loc: location.href, origin: location.origin,
      });
    });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
} else if (_isCapacitor) {
  console.log('[SW] Capacitor 네이티브 — SW 미사용 (WebView 자체 캐시)');
}

// ───── Pull-to-Refresh (iOS PWA 전용) ─────
(function initPTR() {
  if (!window.navigator.standalone) return;

  const THRESHOLD  = 120;
  const RESISTANCE = 0.4;
  const SPRING     = 'transform 0.5s cubic-bezier(0.34,1.56,0.64,1)';
  const BAR_H      = 56;

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
    startY    = e.touches[0].clientY;
    pulling   = true;
    triggered = false;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!pulling || loading) return;
    if (e.touches.length !== 1) { pulling = false; springBack(); return; }

    const dy   = e.touches[0].clientY - startY;
    if (dy <= 0) { pulling = false; return; }

    e.preventDefault();

    const move = dy * RESISTANCE;
    applyMove(move);

    if (dy >= THRESHOLD) {
      if (!triggered) {
        triggered = true;
        LABEL.textContent    = '놓으면 새로고침!';
        LABEL.style.color    = '#F18091';
        EMOJI.style.transform = 'scale(1.35)';
        EMOJI.style.color     = '#F18091';
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
      showToast('✨ 최신 상태예요!');
    });
  });
})();

// ──────────────────────────────────────────────
// 통계 카드 데이터 로드 (Subscription usage 기반)
// ──────────────────────────────────────────────
async function loadStatsCard() {
  try {
    const r = await fetch(API + '/subscription/usage', { headers: authHeader() });
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
  window.fetch = async function(...args) {
    const r = await origFetch.apply(this, args);
    if (r.status === 429) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      // API 도메인에 한정 (외부 요청 무시)
      if (url.includes('railway.app') || url.startsWith(API)) {
        const now = Date.now();
        if (now - lastOpened > 3000 && typeof window.openPlanPopup === 'function') {
          lastOpened = now;
          try {
            const clone = r.clone();
            const j = await clone.json().catch(() => ({}));
            showToast(j.detail || '사용 한도 초과 — 플랜을 확인해주세요');
          } catch (_) { /* ignore */ }
          setTimeout(() => window.openPlanPopup(), 600);
        }
      }
    }
    return r;
  };
})();

// Module에서 접근 가능하도록 window에 노출
window.API = API;
window.authHeader = authHeader;

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
    on('logoutBtn', () => {
      if (typeof closeSettings === 'function') closeSettings();
      if (typeof logout === 'function') logout();
    });
    on('deleteAccountBtn', () => {
      if (typeof closeSettings === 'function') closeSettings();
      if (typeof openDeleteAccountModal === 'function') openDeleteAccountModal();
    });
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
  const tabs = [
    { url: '/customers',            swrKey: 'pv_cache::customers' },
    { url: `/bookings?from=${encodeURIComponent(bookingFrom)}&to=${encodeURIComponent(bookingTo)}`, swrKey: 'pv_cache::bookings_all' },
    { url: '/revenue?period=month', swrKey: 'pv_cache::revenue' },
    { url: '/inventory',            swrKey: 'pv_cache::inventory' },
    { url: '/services',             swrKey: 'pv_cache::service' },
    { url: '/today/brief',          swrKey: 'pv_cache::today' },
  ];
  // Promise.allSettled → 일부 실패해도 나머지 진행. localStorage persistent
  await Promise.allSettled(tabs.map(async t => {
    try {
      const res = await fetch(window.API + t.url, { headers });
      if (!res.ok) return;
      const d = await res.json();
      const items = d.items || d;
      const payload = JSON.stringify({ t: Date.now(), d: items });
      try { localStorage.setItem(t.swrKey, payload); } catch (_) {
        try { sessionStorage.setItem(t.swrKey, payload); } catch (_e) { void _e; }
      }
    } catch (_) { /* silent */ }
  }));
};

// 앱 첫 부팅 시에도 preload (토큰 이미 있으면)
if (typeof window !== 'undefined') {
  setTimeout(() => {
    if (window._preloadTabs && window.authHeader) {
      const auth = window.authHeader();
      if (auth && auth.Authorization) window._preloadTabs();
    }
  }, 1500);
}

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

// 안전 fetch — 15초 타임아웃 + AbortController
window.safeFetch = async function (url, opts = {}) {
  const timeout = opts.timeout || 15000;
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
  if (/HTTP\s*5\d\d|Failed to fetch|NetworkError|timeout|aborted/i.test(raw))
    return '네트워크 연결을 확인해주세요';
  if (/HTTP\s*401|unauthor/i.test(raw))
    return '로그인이 만료됐어요. 다시 로그인해주세요';
  if (/HTTP\s*403|forbidden/i.test(raw))
    return '이 작업 권한이 없어요';
  if (/HTTP\s*404|not.found/i.test(raw))
    return '요청한 데이터를 찾지 못했어요';
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
  if (raw.length > 80) return '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요';
  return raw;
};

// 2중 확인 유틸 — 파괴적 액션에 사용
window._confirm2 = function (msg, opts) {
  opts = opts || {};
  const first = window.confirm((opts.first || msg));
  if (!first) return false;
  const second = window.confirm(opts.second || ('한 번 더 확인할게요.\n' + msg + '\n이 작업은 되돌릴 수 없어요.'));
  return !!second;
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
    if (typeof window._clearAllSWRCache === 'function') window._clearAllSWRCache();
    if (typeof window.showToast === 'function') window.showToast('동기화 중…');
    // data-changed 신호 한 번 — TodayBrief / 인사이트 등이 즉시 재렌더
    try {
      window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'force_sync' } }));
    } catch (_e) { void _e; }
    setTimeout(() => { try { location.reload(); } catch (_e) { void _e; } }, 800);
  } catch (e) {
    if (typeof window.showToast === 'function') window.showToast('동기화 실패 — 잠시 후 다시 시도해주세요');
  }
};

// 앱이 백그라운드 → 포커스 복귀 시 5분 이상 비활성이었으면 캐시 무효화 + data-changed 발사
(function _installFocusSyncHandler() {
  if (window._focusSyncInstalled) return;
  window._focusSyncInstalled = true;
  const STALE_MS = 5 * 60 * 1000;
  function _onFocus() {
    try {
      const lastFocus = sessionStorage.getItem('itdasy:last_focus_at');
      const elapsed = lastFocus ? (Date.now() - Number(lastFocus)) : Infinity;
      if (elapsed > STALE_MS) {
        if (typeof window._clearAllSWRCache === 'function') window._clearAllSWRCache();
        try {
          window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'focus_sync' } }));
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
