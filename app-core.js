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
  const avatarEl = document.getElementById('headerAvatar');
  if (avatarEl) {
    if (picUrl) {
      avatarEl.innerHTML = `<img src="${picUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
      const letter = (shopName || '사장님')[0]?.toUpperCase() || '✨';
      avatarEl.textContent = letter;
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
  showTab('caption', document.querySelectorAll('.nav-btn')[2]);
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
function setToken(t) {
  try {
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

// 전역 fetch 래퍼 — 401 감지 시 자동 로그아웃 + 네트워크 에러 친근 처리
(function _installFetchInterceptor(){
  if (window._fetchPatched) return;
  window._fetchPatched = true;
  const _origFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    try {
      const res = await _origFetch(input, init);
      if (res.status === 401 && getToken()) {
        // 토큰 만료 — 조용히 정리하고 로그인 재유도
        setToken(null);
        const msg = document.getElementById('sessionExpiredMsg');
        if (msg) msg.style.display = 'block';
        const lock = document.getElementById('lockOverlay');
        if (lock) lock.classList.remove('hidden');
      }
      return res;
    } catch (err) {
      // 네트워크 오류 (오프라인·DNS·CORS) — 원본 그대로 throw. 호출부에서 개별 처리.
      throw err;
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

  // 헤더 아바타 복사
  const headerAvatarEl = document.getElementById('headerAvatar');
  if (settingsAvatarEl && headerAvatarEl) {
    const img = headerAvatarEl.querySelector('img');
    if (img) {
      settingsAvatarEl.innerHTML = `<img src="${img.src}" alt="">`;
    } else {
      settingsAvatarEl.textContent = headerAvatarEl.textContent || shopName[0] || '잇';
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
    try { localStorage.clear(); } catch (e) {}
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      } catch (e) {}
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

  // 1. 토큰 및 로컬 스토리지 삭제
  setToken(null);
  // 세션 관련 키만 삭제 (온보딩 등 설정 유지)
  [_TOKEN_KEY, 'itdasy_token', 'itdasy_consented', 'itdasy_consented_at', 'itdasy_latest_analysis'].forEach(k => localStorage.removeItem(k));

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
    document.getElementById('lockOverlay').classList.add('hidden');
    checkCbt1Reset();
    checkOnboarding();
    checkInstaStatus(true);
    // T-317 — 생체 인증 등록 제안 (한 번만)
    _offerBiometricEnroll(data.access_token);
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

// T-324 — iOS Safari 100vh 동적 계산
(function _setVH() {
  const set = () => document.documentElement.style.setProperty('--vh', (window.innerHeight * 0.01) + 'px');
  set();
  window.addEventListener('resize', set, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(set, 250));
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
      setToken(decodeURIComponent(t));
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
  }
});

function expandSmartMenu() {
  openQuickAction();
}

function openQuickAction() {
  const popup = document.getElementById('quickActionPopup');
  const content = popup ? popup.querySelector('.popup-content') : null;
  if (!popup || !content) return;
  popup.style.display = 'flex';
  setTimeout(() => {
    content.style.transform = 'scale(1)';
    content.style.opacity = '1';
  }, 10);
}

function closeQuickAction() {
  const popup = document.getElementById('quickActionPopup');
  const content = popup ? popup.querySelector('.popup-content') : null;
  if (!popup || !content) return;
  content.style.transform = 'scale(0.8)';
  content.style.opacity = '0';
  setTimeout(() => {
    popup.style.display = 'none';
  }, 300);
}

// 탭 전환
function showTab(id, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const target = document.getElementById('tab-' + id);
  if (target) target.classList.add('active');
  if (btn) btn.classList.add('active');
  // 탭 전환 시 스크롤 맨 위로 리셋
  window.scrollTo(0, 0);
  document.body.scrollTop = 0;
  document.documentElement.scrollTop = 0;
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
        if (now - lastOpened > 3000 && typeof openPlanPopup === 'function') {
          lastOpened = now;
          try {
            const clone = r.clone();
            const j = await clone.json().catch(() => ({}));
            showToast(j.detail || '사용 한도 초과 — 플랜을 확인해주세요');
          } catch (_) { /* ignore */ }
          setTimeout(() => openPlanPopup(), 600);
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

    // 플랜 팝업
    on('planBadge', openPlanPopup);
    on('planCloseBtn', closePlanPopup);
    on('planActionBtn', doPlanAction);
    document.querySelectorAll('.plan-card[data-plan]').forEach(card => {
      card.addEventListener('click', () => selectPlan(card.dataset.plan));
    });

    // 홈의 "샘플 캡션 보기" 버튼 (연동 전 체험)
    on('sampleBtn', () => {
      if (typeof openSamplePopup === 'function') openSamplePopup();
    });

    // 통계 카드 Pro 업그레이드 버튼
    on('statsUpgradeBtn', openPlanPopup);

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
