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

// ===== XSS 방어 유틸 (글로벌) =====
// 사용자 입력 / API 응답을 innerHTML에 넣기 전 _esc()로 감싸기.
// textContent 대체 가능하면 그쪽이 우선.
window._esc = window._esc || function (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
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

// [UX-LOAD] 로딩 오버레이 해제 — fade out 후 display:none
function _hideLoadingOverlay() {
  var lo = document.getElementById('appLoadingOverlay');
  if (!lo || lo.style.display === 'none') return;
  lo.style.opacity = '0';
  setTimeout(function() { lo.style.display = 'none'; lo.style.opacity = ''; }, 350);
}

// ===== 백엔드 설정 =====
// 이 레포(itdasy-frontend-test-yeunjun)는 연준 스테이징 전용 → 스테이징 백엔드 바라봄
// 운영 레포(itdasy-frontend)는 운영 백엔드(별도 Cloud Run 서비스/커스텀 도메인)를 사용해야 함
const PROD_API = 'https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
const API = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:8000'
  : PROD_API;

// ===== 토큰 localStorage 키를 백엔드별로 분리 =====
// nopo-lab.github.io는 운영/스테이징 프론트가 같은 origin이라 localStorage 공유.
// 백엔드가 다르면(운영 vs 스테이징) JWT 서명이 달라서 크로스 오염 시 401 "인증 실패" 발생.
// → API URL 기반으로 토큰 키를 분리해서 완전 격리.
const _TOKEN_KEY = 'itdasy_token::' + (API.includes('staging') ? 'staging' : (API.includes('localhost') ? 'local' : 'prod'));

let _instaHandle = '';  // checkInstaStatus에서 저장

// ─── 토스트 시스템 v2 (큐 기반, 타입별 색상) ────────────────────
const _toastQueue = [];
let _toastActive = false;

function showToast(msg, opts) {
  const o = typeof opts === 'object' ? opts : { type: opts || 'info' };
  _toastQueue.push({ msg, type: o.type || 'info', duration: o.duration || 2400 });
  if (!_toastActive) _nextToast();
}

function _nextToast() {
  if (!_toastQueue.length) { _toastActive = false; return; }
  _toastActive = true;
  const { msg, type, duration } = _toastQueue.shift();

  let el = document.getElementById('itdToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'itdToast';
    el.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top,0px) + 16px);left:50%;transform:translateX(-50%) translateY(-120%);z-index:99999;padding:12px 20px;border-radius:var(--r-md,14px);font-size:14px;font-weight:600;box-shadow:var(--shadow-md);transition:transform .3s cubic-bezier(.4,0,.2,1),opacity .3s;opacity:0;pointer-events:none;max-width:calc(100vw - 32px);text-align:center;';
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

  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(-120%)';
    el.style.pointerEvents = 'none';
    setTimeout(_nextToast, 320);
  }, duration);
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
      avatarEl.innerHTML = `<img src="${window._esc(picUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
      const letter = (shopName || '사장님')[0]?.toUpperCase() || '✨';
      avatarEl.innerHTML = `<span class="profile-avatar__initial">${window._esc(letter)}</span>`;
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
      fi.innerHTML = `<img src="${window._esc(picUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;">`;
    } else {
      const letter = (shopName || '사장님')[0]?.toUpperCase() || '✨';
      fi.innerHTML = `<span id="frameAvatarLetter">${window._esc(letter)}</span>`;
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
  const name = document.getElementById('obShopNameInput').value.trim();
  if (!name) {
    document.getElementById('obShopNameInput').style.borderBottomColor = '#E05555';
    setTimeout(() => document.getElementById('obShopNameInput').style.borderBottomColor = '', 1200);
    return;
  }
  localStorage.setItem('onboarding_done', '1');
  localStorage.setItem('shop_name', name);
  if (obShopType) localStorage.setItem('shop_type', obShopType);

  document.getElementById('onboardingOverlay').classList.add('hidden');
  applyShopType(obShopType);
  updateHeaderProfile(null, null, null);
  showToast(`${name} 시작해요`, 'success');

  fetch(API + '/shop/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ shop_name: name })
  }).catch(() => {});
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
  try {
    let t = localStorage.getItem(_TOKEN_KEY);
    if (!t) {
      const legacy = localStorage.getItem('itdasy_token');
      if (legacy) {
        t = legacy;
        try { localStorage.setItem(_TOKEN_KEY, legacy); } catch (_) { /* ignore */ }
      }
    }
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
// [PerfFix] 같은 프레임 안에서 N번 호출돼도 rAF로 1번만 실행.
let _swrClearScheduled = false;
function _clearAllSWRCache() {
  if (_swrClearScheduled) return;
  _swrClearScheduled = true;
  requestAnimationFrame(() => {
    _swrClearScheduled = false;
    const prefixes = ['pv_cache::', 'itdasy:cache', 'dash_cache::'];
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
const _USER_KEY_PREFIXES = ['itdasy_', 'pv_cache::', 'persona_'];
const _USER_KEY_EXACT = ['last_login_email', 'user_oauth_provider', 'last_user_id', 'shop_id'];
// [2026-05-07 26차] user 변경 시 보존 키는 "디바이스 단위 UI 설정"만.
// shop_* / onboarding_done 은 user 데이터 → 제거.
// 잘못 보존되면 다른 user 로그인 시 옛 매장명/온보딩 상태가 남는다 (출시 블로커).
const _USER_KEY_KEEP = new Set([
  'theme', 'itdasy_theme', 'lang', 'i18n_lang',
  'itdasy_biometric_asked',
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

  // /auth/me 동기화 — fire-and-forget (await 제거: 첫 진입 ~200ms 단축)
  // user_id 는 JWT payload.sub 로 이미 확보, email/oauth_provider 만 백그라운드 보강.
  fetch(API + '/auth/me', {
    headers: { 'Authorization': 'Bearer ' + newToken, 'ngrok-skip-browser-warning': 'true' },
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
        if (typeof window.applyOAuthProviderBadge === 'function') {
          window.applyOAuthProviderBadge();
        }
      }
    }
  }).catch(() => { /* network error → 무시 */ });
  // sync 결과는 await 안 함 — UI 차단 회피
}
window.applyNewSession = applyNewSession;

// 헤더 아바타에 가입방법 배지 색·툴팁 적용
function applyOAuthProviderBadge() {
  let prov = 'email';
  try { prov = localStorage.getItem('user_oauth_provider') || 'email'; } catch (_) { void 0; }
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
  const hideSocial = _isIOSAppSurface();
  const divider = document.getElementById('loginSocialDivider');
  const wrap = document.getElementById('socialLoginWrap');
  if (divider) divider.style.display = hideSocial ? 'none' : '';
  if (wrap) wrap.style.display = hideSocial ? 'none' : '';
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
}

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

  let _refreshing = false;
  let _refreshWaiters = [];

  async function _tryRefresh() {
    if (_refreshing) {
      return new Promise((res, rej) => _refreshWaiters.push({ res, rej }));
    }
    _refreshing = true;
    try {
      const API = window.API || '';
      const tok = getToken();
      // [BUG-2] 10초 타임아웃 — 서버 무응답 시 앱 hang 방지
      const _ac = new AbortController();
      const _to = setTimeout(() => _ac.abort(), 10000);
      let r;
      try {
        r = await _origFetch(API + '/auth/refresh', {
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

  window.fetch = async function(input, init) {
    const retryable = _isRetryableMethod(init) && _bodyReusable(init);
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const _tmo = attempt === 0 ? FETCH_TIMEOUT_FIRST_MS : FETCH_TIMEOUT_RETRY_MS;
      try {
        const res = await _fetchWithTimeout(input, init, _tmo);
        if (res.status === 401 && getToken()) {
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
        // 5xx 게이트웨이성 에러: retryable 이면 재시도. 첫 실패는 조용히, 2회째 실패부터 토스트.
        if (retryable && RETRY_STATUSES.has(res.status) && attempt < MAX_RETRIES) {
          if (attempt >= 1) _showReconnectToast();
          await _sleep(BACKOFF_MS[attempt] || 1500);
          attempt++;
          continue;
        }
        return res;
      } catch (err) {
        // 호출자 AbortController 가 이미 abort한 경우 → 재시도 없이 즉시 전파
        // (재시도해도 즉시 abort되어 toast만 쌓이는 문제 방지)
        if (err.name === 'AbortError' && init && init.signal && init.signal.aborted) {
          throw err;
        }
        // 네트워크 에러 (DNS·오프라인·CORS·abort) — retryable 한정으로 재시도. 첫 실패는 조용히.
        if (retryable && attempt < MAX_RETRIES) {
          if (attempt >= 1) _showReconnectToast();
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
  try { tokenExists = !!localStorage.getItem('itdasy_token::staging'); } catch (_e) { /* ignore */ }
  const HOLD_MS = tokenExists ? 600 : 2000;

  setTimeout(() => {
    splash.classList.add('fade-out');
    // pointer-events 즉시 복구 — 페이드아웃 동안에도 탭바/콘텐츠 클릭 가능
    document.body.classList.remove('splashing');
    setTimeout(() => { splash.style.display = 'none'; }, 300);
  }, HOLD_MS);
})();

// ───── 설정 바텀시트 ─────
function openSettings() {
  const sheet = document.getElementById('settingsSheet');
  const card  = document.getElementById('settingsCard');
  // [2026-04-26 A5] popstate 등록 + 스와이프 다운 닫기 부착
  try {
    if (typeof window._registerSheet === 'function') window._registerSheet('settings', closeSettings);
    if (typeof window._markSheetOpen === 'function') window._markSheetOpen('settings');
    if (card && typeof window._attachSwipeDownClose === 'function') {
      window._attachSwipeDownClose(card, closeSettings);
    }
  } catch (_e) { void _e; }

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
      settingsAvatarEl.innerHTML = `<img src="${window._esc(img.src)}" alt="">`;
    } else {
      const initialEl = headerAvatarEl.querySelector('.profile-avatar__initial');
      settingsAvatarEl.textContent = (initialEl ? initialEl.textContent : '') || shopName[0] || '잇';
    }
  }

  // [Hotfix] 시트 열릴 때 항상 맨 위에서 시작 — 이전 스크롤 위치 잔존 방지
  card.scrollTop = 0;

  // 먼저 display, 한 프레임 뒤 open (두 번 rAF로 확실히 렌더 후 transition 발동)
  card.classList.remove('open');
  sheet.style.display = 'flex';
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('open')));
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
    await fetch(API + '/instagram/disconnect', { method: 'POST', headers: authHeader() });
  } catch (_e) { void _e; }

  // 2. 로컬 정리 — 샵·온보딩·인스타 동의·말투 분석
  ['shop_name', 'shop_type', 'onboarding_done',
   'itdasy_consented', 'itdasy_consented_at', 'itdasy_latest_analysis']
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
  if (!(await nativeConfirm("확인", '모든 데이터(온보딩·샵설정·인스타연동·말투분석)가 초기화됩니다.\n정말 처음부터 시작할까요?'))) return;
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
  _setAuthGateLocked(true);
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
    try { localStorage.clear(); } catch (_) { /* ignore */ }
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      } catch (_) { /* ignore */ }
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
  ['itdasy_token', 'itdasy_ipc_dismissed', 'itdasy:ig_connected_cache',
   'itdasy_consented', 'itdasy_consented_at', 'itdasy_latest_analysis'].forEach(k => {
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
    _setAuthGateLocked(false);
    checkCbt1Reset();
    checkOnboarding();
    document.getElementById('lockOverlay').classList.add('hidden');
    // [UX-LOAD] 로그인 후 로딩 화면 표시 → preload 완료 후 해제
    var _lo = document.getElementById('appLoadingOverlay');
    if (_lo) _lo.style.display = 'flex';
    checkInstaStatus(true);
    // T-317 — 생체 인증 등록 제안 (한 번만)
    _offerBiometricEnroll(data.access_token);
    // Wave 2+ — 로그인 직후 주요 데이터 preload (탭 열 때 즉시 표시)
    try { await _preloadTabs(); } catch (_) { /* ignore */ }
    _hideLoadingOverlay();
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
  // 2026-05-01 ── 이전 필드 에러 마크 제거
  ['signupEmail','signupPassword','signupName'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.borderColor = '';
    const errId = id + 'Err';
    const errBelow = document.getElementById(errId);
    if (errBelow) errBelow.remove();
  });
  try {
    const res = await fetch(API + '/auth/register', {
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
    _setAuthGateLocked(false);
    checkOnboarding();
    document.getElementById('lockOverlay').classList.add('hidden');
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
    showToast(msg, 'error');
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
    showToast(msg, 'error');
  }
};

// ───── 네이버 OAuth 로그인 시작 ─────
window.startNaverLogin = async function () {
  try {
    const returnTo = new URL('oauth-return.html', window.location.href).href;
    const res = await fetch(
      `${window.API}/auth/naver/authorize?return_to=${encodeURIComponent(returnTo)}`
    );
    if (!res.ok) throw new Error('네이버 로그인 준비 실패');
    const data = await res.json();
    if (!data.url) {
      if (window.showToast) window.showToast('네이버 로그인 설정이 아직 준비 중이에요');
      return;
    }
    if (window.Capacitor?.Plugins?.Browser) {
      await window.Capacitor.Plugins.Browser.open({ url: data.url });
    } else {
      window.location.href = data.url;
    }
  } catch (e) {
    const msg = window._humanError ? window._humanError(e) : (e.message || '네이버 로그인 오류');
    showToast(msg || '네이버 로그인을 시작할 수 없어요', 'error');
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
      `calc(${BASE}px + env(safe-area-inset-bottom, 0px) + ${offset}px)`
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
        if (_lo2) _lo2.style.display = 'flex';
        _setAuthGateLocked(false);
        checkOnboarding();
        checkInstaStatus(true);
        try { if (window._preloadTabs) await window._preloadTabs(); } catch (_) { /* ignore */ }
        _hideLoadingOverlay();
      }
    }
  })();

  // 토큰 있으면 자동 로그인
  if(getToken()) {
    document.getElementById('lockOverlay').classList.add('hidden');
    _setAuthGateLocked(false);
    // 가입방법 배지 + last_user_id 보정 (기존 캐시값으로 즉시 + /me 로 갱신)
    try { applyOAuthProviderBadge(); } catch (_) { /* ignore */ }
    try { applyNewSession(getToken()); } catch (_) { /* ignore */ }
    checkCbt1Reset();
    checkOnboarding();
    // [UX-LOAD] 필수 데이터 preload 완료 후 로딩 화면 해제
    (async () => {
      try {
        if (window._preloadTabs) await window._preloadTabs();
      } catch (_) { /* ignore */ }
      _hideLoadingOverlay();
    })();
    // [2026-05-13 QA #blocker1] OAuth 직후 — 백엔드 BG 자동분석을 status 폴링으로 대기.
    // runAutoAnalysisAfterConnect 가 즉시 toast + overlay + 90초 polling + timeout fallback.
    const _params0 = new URLSearchParams(window.location.search);
    const _justOAuthed = _params0.get('connected') === 'success';
    if (_justOAuthed) {
      history.replaceState(null, '', window.location.pathname);
      try {
        const pd = document.getElementById('personaDash');
        if (pd) pd.style.display = 'none';
      } catch (_e) { void _e; }
      try {
        if (typeof window.runAutoAnalysisAfterConnect === 'function') {
          window.runAutoAnalysisAfterConnect();
        } else if (typeof runPersonaAnalyze === 'function') {
          runPersonaAnalyze();
        }
      } catch (_e) { void _e; }
    }
    checkInstaStatus().then(() => {
      // (connected=success 는 위에서 이미 처리됨 — runPersonaAnalyze 즉시 호출)
      const params = new URLSearchParams(window.location.search);
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
        tsEl2.textContent = `개인정보 동의 완료 · ${consentedAt}`;
        tsEl2.style.display = 'inline';
      } else {
        tsEl2.textContent = '';
        tsEl2.style.display = 'none';
      }
    }
    // [UX-LOAD] preload 완료 후 TodayBrief 렌더 — 캐시 히트로 즉시 표시
    setTimeout(() => {
      if (window.TodayBrief && typeof window.TodayBrief.render === 'function') {
        try { window.TodayBrief.render('home-today-brief'); } catch (_e) { /* ignore */ }
      }
    }, 100);
  } else {
    _setAuthGateLocked(true);
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
  // P3.1 #2: .tab 바깥 요소 잔존 방지
  if (typeof closeSlotPopup === 'function') closeSlotPopup();
  const sg = document.getElementById('_nextSlotGuide');
  if (sg) sg.style.display = 'none';

  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-bar button').forEach(b => b.classList.remove('active'));
  // 사이드 nav (PC ≥768px) 활성 동기화
  document.querySelectorAll('.side-nav__btn').forEach(b => b.classList.remove('active'));
  const sideBtn = document.querySelector('.side-nav__btn[data-side-tab="' + id + '"]');
  if (sideBtn) sideBtn.classList.add('active');
  const target = document.getElementById('tab-' + id);
  if (target) target.classList.add('active');
  if (btn) btn.classList.add('active');
  // 탭 전환 시 스크롤 맨 위로 리셋
  window.scrollTo(0, 0);
  document.body.scrollTop = 0;
  document.documentElement.scrollTop = 0;
  // [P1-2C] 탭 전환 시 init 호출 200ms 디바운스 — 연속 클릭 시 중복 fetch 방지
  if (window._tabInitTimer) clearTimeout(window._tabInitTimer);
  window._tabInitTimer = setTimeout(() => {
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
  }, 200);
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
window.APP_BUILD = '20260515-v123-qa-r5-stabilize';
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
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => {
      const u = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || '';
      if (u && !u.endsWith('/sw.js')) {
        console.warn('[SW] 구 SW 언레지스터:', u);
        reg.unregister();
      }
    });
  }).catch(() => {});

  // [2026-04-28] updateViaCache: 'none' — sw.js 자체를 HTTP 캐시 안 함 → 매번 새 sw.js fetch
  // 이전엔 기본값 'imports' 라 옛 sw.js 가 영구 서빙되던 버그.
  navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' })
    .then(reg => {
      // 페이지 진입 시마다 강제 update 시도 (sw.js fresh fetch + 새 SW 발견 시 install)
      try { reg.update(); } catch (_) { /* ignore */ }
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
      setInterval(() => { try { reg.update(); } catch (_) { /* ignore */ } }, 60 * 60 * 1000);
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
    const r = await fetch(API + '/subscription/usage', { headers });
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
  // [2026-04-26 0초딜레이] revenue 는 기간별 키 분리 — 사용자가 어떤 기간 탭 누르든 0ms
  const tabs = [
    { url: '/customers',            swrKey: 'pv_cache::customers' },
    { url: `/bookings?from=${encodeURIComponent(bookingFrom)}&to=${encodeURIComponent(bookingTo)}`, swrKey: 'pv_cache::bookings_all' },
    { url: '/revenue?period=today', swrKey: 'pv_cache::revenue::today' },
    { url: '/revenue?period=week',  swrKey: 'pv_cache::revenue::week' },
    { url: '/revenue?period=month', swrKey: 'pv_cache::revenue::month' },
    { url: '/inventory',            swrKey: 'pv_cache::inventory' },
    { url: '/services',             swrKey: 'pv_cache::service' },
    { url: '/today/brief',          swrKey: 'pv_cache::today' },
    { url: '/assistant/suggestions', swrKey: 'pv_cache::ai_suggest' },
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
  const stack = [];              // 현재 열려있는 시트 hash 스택
  window._sheetBackRegistry = registry;
  window._sheetBackStack = stack;

  // 단일 popstate 리스너 — 모든 시트 통합
  window.addEventListener('popstate', () => {
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
      if (idx >= 0) stack.splice(idx, 1);
    }
  });

  // 시트 open 시 호출 — history.pushState
  window._markSheetOpen = function (name) {
    try {
      const hash = '#' + name;
      // 이미 같은 hash 면 push 안 함 (중복 방지)
      if (window.location.hash !== hash) {
        history.pushState({ sheet: name }, '', hash);
      }
      stack.push(name);
    } catch (_e) { void _e; }
  };

  // 시트 close 시 호출 — history.back (현재 hash 가 자기 hash 인 경우만)
  window._markSheetClosed = function (name) {
    try {
      const hash = (window.location.hash || '').replace(/^#/, '');
      const idx = stack.lastIndexOf(name);
      if (idx >= 0) stack.splice(idx, 1);
      if (hash === name) {
        // popstate 가 다시 _markSheetClosed 호출 안 하도록 그냥 replaceState 로 hash 제거
        history.replaceState(null, '', window.location.pathname + window.location.search);
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
