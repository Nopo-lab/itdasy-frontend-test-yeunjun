// Itdasy Studio - Core (설정, 인증, 유틸, 탭, 온보딩)

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
// 구버전 토큰 자동 마이그레이션 (한 번만 실행)
(function migrateLegacyToken(){
  try {
    const legacy = localStorage.getItem('itdasy_token');
    if (legacy && !localStorage.getItem(_TOKEN_KEY)) {
      // 현재 API가 스테이징인데 기존 토큰이 존재하면 보수적으로 정리 (어느 백엔드 토큰인지 알 수 없음)
      localStorage.removeItem('itdasy_token');
    }
  } catch(_){}
})();

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

  const statusEl = document.getElementById('headerPersonaName');
  if (statusEl) {
    statusEl.textContent = handle ? `${handle} · ${tone || '말투 분석 완료'}` : (tone || '말투 분석 대기 중');
  }

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

  // 홈 질문 카드 (개인화)
  const q = document.getElementById('homeQuestion');
  if (q) {
      // 구체적인 작업 유형 추출 (예: '붙임머리')
      const jobAction = cfg.tagLabel.replace(' 시술', '').replace(' 작업', '');
      q.innerHTML = `<span style="color:var(--accent2); font-weight:800;">${shopName}</span> 대표님!<br>오늘 어떤 <span style="background:rgba(241,128,145,0.08); padding:0 4px; border-radius:4px;">${jobAction}</span> 작업을 하셨나요? ✨`;
  }

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
}
function setToken(t) {
  if (t === null || t === undefined) {
    localStorage.removeItem(_TOKEN_KEY);
  } else {
    localStorage.setItem(_TOKEN_KEY, t);
  }
}
function authHeader() { return { 'Authorization': 'Bearer ' + getToken(), 'ngrok-skip-browser-warning': 'true' }; }

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

function resetShopSetup() {
  if (!confirm('샵 이름과 종류를 다시 설정할까요?')) return;
  localStorage.removeItem('shop_name');
  localStorage.removeItem('shop_type');
  localStorage.removeItem('onboarding_done');
  const ob = document.getElementById('onboardingOverlay');
  if (ob) ob.classList.remove('hidden');
}

async function localReset() {
  if (!confirm('앱을 처음 상태로 초기화할까요?\n(로그인은 유지됩니다)')) return;
  ['itdasy_consented','itdasy_consented_at','itdasy_latest_analysis',
   'onboarding_done','shop_name','shop_type'].forEach(k => localStorage.removeItem(k));
  // 인스타 연동도 백엔드에서 해제
  try { await fetch(API + '/instagram/disconnect', { method: 'POST', headers: authHeader() }); } catch(_) {}
  location.reload();
}

function checkCbt1Reset() {
  if (getMyUserId() === 1) {
    const el = document.getElementById('cbt1ResetArea');
    if (el) el.style.display = 'block';
  }
}

async function fullReset() {
  if (!confirm('⚠️ 모든 데이터(온보딩·샵설정·인스타연동·말투분석)가 초기화됩니다.\n정말 처음부터 시작할까요?')) return;
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

async function logout() {
  if (!confirm("로그아웃 하시겠습니까? 세션과 캐시가 모두 초기화됩니다.")) return;

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
async function login() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';
  if (!email || !password) { errEl.textContent = '이메일과 비밀번호를 입력해주세요.'; errEl.style.display = 'block'; return; }
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
    checkInstaStatus(true); // 로그인 직후: 서버 shop_name으로 환영 처리
  } catch(e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  }
  btn.textContent = '로그인'; btn.disabled = false;
}

// ===== 앱 초기화 (모든 모듈 로드 후 실행) =====
window.addEventListener('load', function() {
  // Enter 키 로그인
  document.getElementById('loginPassword').addEventListener('keydown', e => { if(e.key === 'Enter') login(); });

  // Chrome으로 이동 시 토큰 자동 복원 + 연동 자동 실행
  (function() {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('_t');
    if (t) {
      setToken(decodeURIComponent(t));
      history.replaceState(null, '', window.location.pathname);
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
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/itdasy-studio/sw.js')
    .then(reg => {
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated') {
            /* SW 활성화 완료 */
          }
        });
      });
    })
    .catch(err => console.warn('[SW] 등록 실패:', err));

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
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

    try { await checkInstaStatus(); } catch (_) {}

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
  } catch(_) {}
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
          } catch (_) {}
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
    on('fullResetBtn', () => typeof fullReset === 'function' && fullReset());

    // 플랜 팝업
    on('planBadge', openPlanPopup);
    on('planCloseBtn', closePlanPopup);
    on('planActionBtn', doPlanAction);
    document.querySelectorAll('.plan-card[data-plan]').forEach(card => {
      card.addEventListener('click', () => selectPlan(card.dataset.plan));
    });

    // 예약 발행 팝업 (설정 시트 내 진입점)
    on('openScheduledBtn', () => {
      if (typeof closeSettings === 'function') closeSettings();
      if (typeof openScheduledPopup === 'function') openScheduledPopup();
    });
    // 하단 nav 예약 탭 — 탭 전환 대신 팝업 오픈 방식 (상시 접근)
    on('schedNavBtn', () => {
      if (typeof openScheduledPopup === 'function') openScheduledPopup();
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
