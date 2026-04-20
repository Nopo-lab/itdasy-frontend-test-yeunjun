/* ─────────────────────────────────────────────────────────────
   Capacitor Push Notifications (FCM/APNs) 초기화 & 서버 등록

   - 웹 브라우저에서는 no-op (window.Capacitor 없으면 return)
   - 네이티브 앱에서만 권한 요청 → 토큰 수령 → /push/register
   - 로그아웃 시 unregister 호출
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (!isNative) return;

  const PushNotifications = window.Capacitor?.Plugins?.PushNotifications;
  if (!PushNotifications) {
    console.warn('[push] PushNotifications 플러그인 없음 (capacitor sync 필요)');
    return;
  }

  const platform = (window.Capacitor.getPlatform && window.Capacitor.getPlatform()) || 'android';

  async function _postToken(token) {
    try {
      const res = await fetch(window.API + '/push/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...window.authHeader() },
        body: JSON.stringify({ token, platform }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      localStorage.setItem('itdasy_push_token', token);
      console.info('[push] 서버 등록 완료 platform=' + platform);
    } catch (e) {
      console.warn('[push] 서버 등록 실패:', e);
    }
  }

  async function initPush() {
    if (!window.API || !window.authHeader) {
      setTimeout(initPush, 1000);
      return;
    }
    // T-003: 레거시 토큰 키 직접 체크 → canonical getToken() 경유로 변경.
    // 이유: _TOKEN_KEY 체계(itdasy_token::staging|prod|local) 로 격리 후, 이 파일만 예전 키를 보고 있어
    //       스테이징 환경에서 푸시 알림 구독이 항상 실패했음. core.js 의 getToken() 은 만료 체크도 포함.
    if (!window.getToken || !window.getToken()) return;

    try {
      const perm = await PushNotifications.requestPermissions();
      if (perm.receive !== 'granted') {
        console.info('[push] 권한 거부됨');
        return;
      }
      await PushNotifications.register();
    } catch (e) {
      console.warn('[push] 권한/등록 실패:', e);
    }
  }

  PushNotifications.addListener('registration', (t) => {
    if (t && t.value) _postToken(t.value);
  });

  PushNotifications.addListener('registrationError', (err) => {
    console.warn('[push] registrationError:', err);
  });

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    if (window.showToast) {
      window.showToast(notification.title || '새 알림', notification.body || '');
    }
  });

  async function unregisterPush() {
    const savedToken = localStorage.getItem('itdasy_push_token');
    if (!savedToken || !window.API || !window.authHeader) return;
    try {
      await fetch(window.API + '/push/unregister', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...window.authHeader() },
        body: JSON.stringify({ token: savedToken }),
      });
      localStorage.removeItem('itdasy_push_token');
    } catch (_) {}
  }

  window.initPushNotifications = initPush;
  window.unregisterPushNotifications = unregisterPush;

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initPush, 1500);
  });
})();
