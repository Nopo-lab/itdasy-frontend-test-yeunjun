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

  function _handleReturn(url) {
    if (!url) return;
    try {
      const u = new URL(url);
      if (u.protocol !== 'itdasy:') return;

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
