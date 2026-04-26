/* ─────────────────────────────────────────────────────────────
   OAuth 완료 후 앱으로 복귀했을 때 처리

   Capacitor 네이티브 앱에서:
   - 브라우저에서 인스타 OAuth 마침
   - 백엔드가 itdasy://oauth/callback?connected=success 로 리다이렉트
   - Android intent-filter(itdasy scheme)가 앱 실행
   - Capacitor App 플러그인의 appUrlOpen 리스너가 URL 수신
   - connected=success 파라미터 확인 후 인스타 상태 재조회 + 토스트

   웹 브라우저에서는 no-op.
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (!isNative) return;

  const AppPlugin = window.Capacitor?.Plugins?.App;
  if (!AppPlugin) {
    console.warn('[oauth-return] Capacitor App 플러그인 없음');
    return;
  }

  // Google/Kakao OAuth 딥링크 처리
  // 백엔드가 itdasy://oauth-return?token=JWT&provider=google|kakao 로 리다이렉트
  function _handleSocialLogin(u, fullUrl) {
    const isOAuthReturn =
      u.host === 'oauth-return' ||
      u.pathname === '/oauth-return' ||
      u.pathname === 'oauth-return' ||
      /oauth-return/.test(fullUrl);
    if (!isOAuthReturn) return false;

    // query string 또는 hash fragment 둘 다 지원
    let params;
    try {
      params = new URLSearchParams(u.search || '');
    } catch (_e) {
      void _e;
      params = new URLSearchParams('');
    }
    if ((!params.get('token') && !params.get('error')) && u.hash) {
      try {
        params = new URLSearchParams(u.hash.replace(/^#/, ''));
      } catch (_e2) { void _e2; }
    }

    const token = params.get('token');
    const provider = params.get('provider') || 'oauth';
    const err = params.get('error');

    if (err) {
      if (window.showToast) window.showToast('로그인 실패: ' + decodeURIComponent(err));
      return true;
    }
    if (!token) return true;

    try {
      const api = (window.API || '');
      const keySuffix = api.includes('staging')
        ? 'staging'
        : (api.includes('localhost') ? 'local' : 'prod');
      localStorage.setItem('itdasy_token::' + keySuffix, token);
    } catch (_e) { void _e; }

    // 다른 사용자 토큰일 수 있으니 user_id 비교 → 캐시 정리 + 가입방법 배지 동기화
    // (window.applyNewSession 이 정의된 뒤에만 동작; reload 후에는 자동 로직이 다시 동작)
    try {
      if (typeof window.applyNewSession === 'function') {
        // 비동기지만 reload 전에 캐시 정리·배지 저장이 끝나도록 await
        // (실패해도 reload 는 진행)
        window.applyNewSession(token).catch(() => {});
      }
    } catch (_e) { void _e; }

    if (window.showToast) window.showToast('✓ ' + provider + ' 로그인 완료!');
    // 토큰 반영을 위해 앱 새로고침
    setTimeout(() => { window.location.reload(); }, 300);
    return true;
  }

  function _handleReturn(url) {
    if (!url) return;
    try {
      const u = new URL(url);
      if (u.protocol !== 'itdasy:') return;

      // Google/Kakao OAuth 복귀 먼저 시도
      if (_handleSocialLogin(u, url)) return;

      if (u.searchParams.get('connected') === 'success') {
        if (window.showToast) window.showToast('인스타 연동 완료! 🎉');

        // 인스타 연동 상태 재조회 (app-instagram.js 내부 함수가 있을 경우)
        if (typeof window.checkInstagramStatus === 'function') {
          window.checkInstagramStatus();
        } else if (typeof window.refreshInstagramUI === 'function') {
          window.refreshInstagramUI();
        }

        // 홈 탭으로 유도 (선택)
        const homeTabBtn = document.querySelector('.tab-bar__btn[data-tab="home"]');
        if (homeTabBtn) homeTabBtn.click();

        // [2026-04-24] OAuth 콜백 직후 말투 테스트 자동 오픈 제거
        // window.openPersonaSurveyModal() 함수는 app-persona-survey.js 에 남아있음.
        // 사용자가 설정 메뉴 등에서 명시적으로 트리거하면 그대로 작동.
      } else if (u.searchParams.get('error')) {
        const err = u.searchParams.get('error');
        if (window.showToast) window.showToast('연동 실패: ' + err);
      }
    } catch (e) {
      console.warn('[oauth-return] URL 파싱 실패:', e);
    }
  }

  AppPlugin.addListener('appUrlOpen', (event) => {
    _handleReturn(event && event.url);
  });

  // 앱이 닫혀있다가 딥링크로 처음 열린 경우 (cold start)
  if (typeof AppPlugin.getLaunchUrl === 'function') {
    AppPlugin.getLaunchUrl().then((r) => {
      if (r && r.url) _handleReturn(r.url);
    }).catch(() => {});
  }
})();
