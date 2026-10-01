/**
 * 쿠키/분석 동의 배너 (GDPR · ePrivacy · CCPA)
 *
 * 동작 정책:
 *  - "필수" (로그인 세션·설정·오프라인 캐시): 배너와 무관하게 항상 사용.
 *  - "선택" (Sentry 크래시 리포팅): 지역과 무관하게 명시 허용 전에는 사용하지 않음.
 *
 * 상태 저장 (localStorage):
 *  - itdasy_consent_v2 = 'granted' | 'denied' | 'dismissed-essential-only'
 *  - itdasy_consent_at_v2 = ISO timestamp
 *  - itdasy_consent_region_v2 = 'EU' | 'NON_EU'
 *
 * 다른 모듈은 `window.itdasyConsent.isAnalyticsAllowed()` 로 확인.
 */
(function () {
  const KEY = 'itdasy_consent_v2';
  const KEY_AT = 'itdasy_consent_at_v2';
  const KEY_REGION = 'itdasy_consent_region_v2';
  const LEGACY_KEYS = ['itdasy_consent_v1', 'itdasy_consent_at', 'itdasy_consent_region'];

  const EU_TZ_PREFIXES = [
    // EU/EEA + UK timezones (enough for consent policy; not border security)
    'Europe/',
    'Atlantic/Azores', 'Atlantic/Madeira', 'Atlantic/Canary', 'Atlantic/Faroe', 'Atlantic/Reykjavik',
    'Arctic/Longyearbyen',
  ];

  function _detectRegion() {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      for (const p of EU_TZ_PREFIXES) {
        if (tz === p || tz.indexOf(p) === 0) return 'EU';
      }
      return 'NON_EU';
    } catch (e) {
      return 'NON_EU';
    }
  }

  function _get() {
    return {
      state: localStorage.getItem(KEY) || null,
      at: localStorage.getItem(KEY_AT) || null,
      region: localStorage.getItem(KEY_REGION) || null,
    };
  }

  function _set(state) {
    const region = _detectRegion();
    localStorage.setItem(KEY, state);
    localStorage.setItem(KEY_AT, new Date().toISOString());
    localStorage.setItem(KEY_REGION, region);
    _applyState(state);
  }

  function _applyState(state) {
    // Sentry 옵트아웃: 동의 거부 시 SDK 초기화 억제(이미 로드된 SDK는 꺼지도록)
    try {
      if (window.Sentry && typeof window.Sentry.getClient === 'function') {
        const client = window.Sentry.getClient();
        if (client && client.getOptions) {
          client.getOptions().enabled = (state === 'granted');
        }
      }
    } catch (e) { /* best-effort */ }
  }

  function _injectBanner() {
    if (document.getElementById('itdasyCookieBanner')) return;
    const region = _detectRegion();
    const euText = (region === 'EU');

    const title = euText ? '개인정보·쿠키 사용 안내' : '더 나은 서비스 제공 안내';
    const body = euText
      ? '잇데이는 로그인 유지·환경설정 같은 필수 항목을 사용합니다. 추가로 앱 오류를 빠르게 고치기 위해 크래시 리포팅(Sentry)을 쓰려면 동의가 필요해요. 거부해도 핵심 기능은 정상 이용 가능합니다.'
      : '로그인 유지·오류 진단에 필요한 최소한의 데이터만 사용해요. 설정에서 언제든 바꿀 수 있어요.';

    // [2026-10-01] 작게·낮게. 전엔 검은 큰 카드(제목+3줄+버튼 2줄)가 하단 탭바까지 덮었다 — 원장이 "팝업" 으로 느낀 것.
    //   · 탭바 위에 앉는다(탭바 높이를 재서 bottom 으로), 한 문단 + 버튼 한 줄.
    //   · 설정 하위화면(.subscreen-overlay.is-open)이 열려 있으면 숨긴다 — 저장 버튼(sv2-savebar)을 가리던 문제.
    // 탭바(.tab-bar)는 fixed 래퍼(#bottomNavGroup) 안의 정적 요소라 자기 position 으론 못 잰다 — 화면 아래에서 탭바 윗선까지의 거리로.
    //   삽입 시점엔 탭바가 아직 올라오는 중(슬라이드 인)일 수 있어 아래 _placeAboveTabBar 가 잠시 뒤 다시 잰다.
    const tabH = _tabBarGap();
    if (!document.getElementById('itdasyCookieBannerStyle')) {
      const st = document.createElement('style');
      st.id = 'itdasyCookieBannerStyle';
      st.textContent = 'body:has(.subscreen-overlay.is-open) #itdasyCookieBanner { display: none !important; }';
      document.head.appendChild(st);
    }
    const html = `
      <div id="itdasyCookieBanner" style="position:fixed;left:0;right:0;bottom:${tabH ? tabH + 'px' : '0'};z-index:9950;display:flex;justify-content:center;padding:8px calc(10px + var(--safe-area-inset-right, env(safe-area-inset-right, 0px))) calc(${tabH ? '6px' : '10px'} + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))) calc(10px + var(--safe-area-inset-left, env(safe-area-inset-left, 0px)));pointer-events:none;">
        <div style="max-width:560px;width:100%;background:rgba(20,20,25,0.96);color:#fff;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,0.28);padding:10px 12px;font-size:12px;line-height:1.5;pointer-events:auto;">
          <div style="opacity:0.9;margin-bottom:8px;"><b style="font-weight:800;">${title}</b> · ${body}
            <a href="https://itdasy.com/privacy.html" target="_blank" rel="noopener" style="color:#FFB2BE;text-decoration:underline;">개인정보처리방침</a>
            · <a href="https://itdasy.com/privacy-en.html" target="_blank" rel="noopener" style="color:#FFB2BE;text-decoration:underline;">English</a>
          </div>
          <div style="display:flex;gap:8px;">
            <button type="button" id="__cc_accept" style="flex:1;min-height:40px;padding:8px 10px;border-radius:10px;border:none;background:linear-gradient(135deg,var(--brand),var(--brand-strong));color:#fff;font-weight:800;cursor:pointer;font-size:12.5px;">전체 허용</button>
            <button type="button" id="__cc_essential" style="flex:1;min-height:40px;padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;font-weight:700;cursor:pointer;font-size:12.5px;">필수만</button>
          </div>
        </div>
      </div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    document.body.appendChild(wrap.firstElementChild);
    [0, 400, 1200, 2500].forEach((ms) => setTimeout(_placeAboveTabBar, ms));
    try { window.addEventListener('resize', _placeAboveTabBar); } catch (_e) { void _e; }

    document.getElementById('__cc_accept').addEventListener('click', () => {
      _set('granted'); _remove();
    });
    document.getElementById('__cc_essential').addEventListener('click', () => {
      _set('denied'); _remove();
    });
  }

  /** 화면 아래에서 탭바 윗선까지의 거리(px). 탭바가 없거나(PC) 아직 안 보이면 0. */
  function _tabBarGap() {
    try {
      const tb = document.querySelector('.tab-bar');
      if (!tb || getComputedStyle(tb).display === 'none') return 0;
      const r = tb.getBoundingClientRect();
      if (!(r.height > 0) || !(r.top > 0) || !(r.top < window.innerHeight)) return 0;
      return Math.ceil(window.innerHeight - r.top) + 6;
    } catch (_e) { return 0; }
  }
  function _placeAboveTabBar() {
    const b = document.getElementById('itdasyCookieBanner');
    if (!b) return;
    const gap = _tabBarGap();
    b.style.bottom = gap ? gap + 'px' : '0';
  }

  function _remove() {
    const b = document.getElementById('itdasyCookieBanner');
    if (b) b.remove();
    try { window.removeEventListener('resize', _placeAboveTabBar); } catch (_e) { void _e; }
  }

  // [T-915] 홈 AI 동의 카드가 같은 화면에서 함께 받기로 하면 배너를 띄우지 않는다.
  //   첫 화면에 동의 팝업이 2개(쿠키 배너 + AI 카드) 겹쳐 뜨던 걸 하나로 합쳤다.
  //   판단은 AI 카드가 한다 — 그쪽만 '지금 물어볼 게 있는지'(서버 동의 상태)를 안다.
  let _deferred = false;
  let _cardHandled = false; // [2026-10-01] AI 카드가 deferToCombined() 로 받고 있는 중

  // 공개 API
  window.itdasyConsent = {
    isAnalyticsAllowed() {
      const { state } = _get();
      // 명시 허용만 허용. 미결정·거부 전부 차단.
      return state === 'granted';
    },
    getState() {
      return _get();
    },
    grant() { _set('granted'); _remove(); },
    deny() { _set('denied'); _remove(); },
    showBanner() { _deferred = false; _injectBanner(); },

    // AI 동의 카드가 "내가 같이 받을게" 라고 알릴 때.
    //   [2026-10-01] _cardHandled 로 '카드가 실제로 받고 있다' 를 표시 — 아래 8초 안전장치가 이걸 보고 물러난다.
    //   전엔 같은 _deferred=true 라 '모듈이 침묵했다' 와 구분이 안 돼, 카드가 떠 있어도 8초 뒤 배너가 또 떴다.
    deferToCombined() { _deferred = true; _cardHandled = true; _remove(); },

    // AI 카드가 결국 안 뜨기로 했을 때(이미 동의함·비로그인 등) 배너를 되돌린다.
    //   아직 분석 동의가 미결정일 때만 띄운다.
    releaseDeferred() {
      if (!_deferred) return;
      _deferred = false;
      _cardHandled = false;
      if (!_get().state) _injectBanner();
    },
    reset() {
      localStorage.removeItem(KEY);
      localStorage.removeItem(KEY_AT);
      localStorage.removeItem(KEY_REGION);
      LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
    },
  };

  function _init() {
    // v1은 한국 사용자에게 자동 허용을 저장하던 시기가 있어 동의 증거로 재사용하지 않는다.
    LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
    const { state } = _get();
    if (state) {
      _applyState(state);
      return;
    }
    // EU: 첫 방문 시 항상 배너 노출 (opt-in 필수)
    // 선택 오류 진단은 지역과 무관하게 사용자가 직접 허용하기 전까지 끈다.
    _applyState('denied');

    // [T-915] 로그인 상태이고 홈에 AI 동의 카드가 있으면, 그쪽이 결론 낼 때까지 기다린다.
    //   카드가 `deferToCombined()`/`releaseDeferred()` 로 알려준다.
    if (_aiCardMayHandle()) {
      _deferred = true;
      // 안전장치: AI 모듈이 끝내 아무 말도 안 하면(로드 실패·예외) 동의를 영영 못 받는다.
      //   그건 조용한 실패라 더 나쁘다 — 8초 뒤엔 배너를 띄운다.
      setTimeout(() => {
        if (_deferred && !_cardHandled && !_get().state) { _deferred = false; _injectBanner(); }
      }, 8000);
      return;
    }
    _injectBanner();
  }

  /** 홈 AI 동의 카드가 이 동의를 같이 받아줄 수 있는 상황인가. */
  function _aiCardMayHandle() {
    try {
      if (!document.getElementById('aiConsentHomeCard')) return false;
      // 카드는 로그인 상태에서만 뜬다(서버에 동의 상태를 물어봐야 한다).
      return typeof window.getToken === 'function' && !!window.getToken();
    } catch (e) {
      console.warn('[cookie-consent] AI 카드 확인 실패:', e);
      return false;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }
})();
