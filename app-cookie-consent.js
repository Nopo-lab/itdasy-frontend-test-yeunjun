/**
 * 쿠키/분석 동의 배너 (GDPR · ePrivacy · CCPA)
 *
 * 동작 정책:
 *  - "필수" (로그인 세션·설정·오프라인 캐시): 배너와 무관하게 항상 사용.
 *  - "선택" (Sentry 크래시 리포팅): EU/EEA/UK 사용자는 opt-in 필수, 기타 지역은 기본 허용 (묵시적 동의 + 언제든 철회).
 *  - Timezone 기반 경량 지역 추정 (IP 판별 없이). 정확도 제한적이지만 EU/UK 시간대 커버.
 *
 * 상태 저장 (localStorage):
 *  - itdasy_consent_v1 = 'granted' | 'denied' | 'dismissed-essential-only'
 *  - itdasy_consent_at = ISO timestamp
 *  - itdasy_consent_region = 'EU' | 'NON_EU'
 *
 * 다른 모듈은 `window.itdasyConsent.isAnalyticsAllowed()` 로 확인.
 */
(function () {
  const KEY = 'itdasy_consent_v1';
  const KEY_AT = 'itdasy_consent_at';
  const KEY_REGION = 'itdasy_consent_region';

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
      : '잇데이는 로그인 유지·오류 진단에 필요한 최소한의 데이터만 사용합니다. 자세한 내용은 개인정보처리방침을 확인해 주세요. 언제든 설정에서 변경 가능합니다.';

    const html = `
      <div id="itdasyCookieBanner" style="position:fixed;left:0;right:0;bottom:0;z-index:9950;display:flex;justify-content:center;padding:12px calc(12px + env(safe-area-inset-right)) calc(12px + env(safe-area-inset-bottom)) calc(12px + env(safe-area-inset-left));pointer-events:none;">
        <div style="max-width:560px;width:100%;background:rgba(20,20,25,0.96);color:#fff;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,0.3);padding:16px 18px;font-size:12.5px;line-height:1.6;pointer-events:auto;backdrop-filter:saturate(140%) blur(8px);-webkit-backdrop-filter:saturate(140%) blur(8px);">
          <div style="font-size:13.5px;font-weight:800;margin-bottom:6px;letter-spacing:-0.2px;">🍪 ${title}</div>
          <div style="opacity:0.85;margin-bottom:12px;">
            ${body}
            <a href="https://itdasy.com/privacy.html" target="_blank" rel="noopener" style="color:#FFB2BE;text-decoration:underline;">개인정보처리방침</a>
            · <a href="https://itdasy.com/privacy-en.html" target="_blank" rel="noopener" style="color:#FFB2BE;text-decoration:underline;">English</a>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" id="__cc_accept" style="flex:1;min-width:120px;padding:10px 12px;border-radius:10px;border:none;background:linear-gradient(135deg,#F18091,#D95F70);color:#fff;font-weight:800;cursor:pointer;font-size:12.5px;">✅ 전체 허용</button>
            <button type="button" id="__cc_essential" style="flex:1;min-width:120px;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#fff;font-weight:700;cursor:pointer;font-size:12.5px;">필수만</button>
          </div>
        </div>
      </div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    document.body.appendChild(wrap.firstElementChild);

    document.getElementById('__cc_accept').addEventListener('click', () => {
      _set('granted'); _remove();
    });
    document.getElementById('__cc_essential').addEventListener('click', () => {
      _set('denied'); _remove();
    });
  }

  function _remove() {
    const b = document.getElementById('itdasyCookieBanner');
    if (b) b.remove();
  }

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
    showBanner() { _injectBanner(); },
    reset() {
      localStorage.removeItem(KEY);
      localStorage.removeItem(KEY_AT);
      localStorage.removeItem(KEY_REGION);
    },
  };

  function _init() {
    const { state } = _get();
    const region = _detectRegion();
    if (state) {
      _applyState(state);
      return;
    }
    // EU: 첫 방문 시 항상 배너 노출 (opt-in 필수)
    // Non-EU: 첫 방문 시 기본 허용 + 배너(소프트) 노출 → 명시 거부 시에만 저장
    if (region === 'EU') {
      // Pre-consent default = denied (GDPR: 사전 동의 없이는 optional 처리 금지)
      _applyState('denied');
      _injectBanner();
    } else {
      // Non-EU: 기본 허용이지만 사용자에게 알림 배너는 여전히 표시
      _applyState('granted');
      _injectBanner();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }
})();
