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
      const res = await apiFetch('/push/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...window.authHeader() },
        body: JSON.stringify({ token, platform }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      localStorage.setItem('itdasy_push_token', token);
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

    // [2026-08-15] 안드로이드는 google-services.json 이 번들에 있어야만 등록한다.
    //
    //   이 가드가 왜 있나: 파일이 없던 동안 register() 가 앱을 죽였다. build.gradle 은
    //   파일이 없으면 google-services 플러그인을 건너뛰는데(android/app/build.gradle:75),
    //   플러그인이 빠져도 register() 는 그대로 FirebaseMessaging 을 부른다 →
    //     FATAL: Default FirebaseApp is not initialized in this process com.y2do.itdasy
    //   API 35 에뮬레이터 실측: 알림 "허용" 을 누른 순간 죽고, 그 뒤로 실행할 때마다
    //   죽었다(재실행 3회 전부 FATAL). 네이티브 스레드 FATAL 이라 아래 try/catch 로는
    //   **못 잡는다** — 호출 자체를 막는 것 말고 방법이 없다.
    //
    //   지금은 Firebase 프로젝트 `itdasy`(project_number 524023965960)에
    //   com.y2do.itdasy 가 등록돼 있고 google-services.json 도 두 레포에 들어갔다.
    //   백엔드 FIREBASE_PROJECT_ID 도 같은 `itdasy` 라 프로젝트가 일치한다 —
    //   토큰 발급처와 발송처가 다르면 조용히 안 가므로 이 일치가 핵심이다.
    //
    //   iOS 는 APNs 라 이 경로를 타지 않는다.
    //
    // ⚠️ google-services.json 을 지우면 false 로 되돌려라. 안 그러면 앱이 죽는다.
    const ANDROID_FIREBASE_READY = true;
    if (platform === 'android' && !ANDROID_FIREBASE_READY) {
      console.warn('[push] google-services.json 미설정 — 안드로이드 푸시 등록 건너뜀 (크래시 방지)');
      return;
    }

    try {
      const perm = await PushNotifications.requestPermissions();
      if (perm.receive !== 'granted') {
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
    // 고객센터·신고 답변이면 미읽음 배지 즉시 갱신 (모달 안 열려도 빨간 점 보이도록)
    const t = notification?.data?.type;
    if (t === 'support_reply' || t === 'moderation_reply') {
      try {
        const badge = document.getElementById('supportUnreadBadge');
        if (badge) {
          const cur = parseInt(badge.textContent || '0', 10) || 0;
          badge.textContent = String(cur + 1);
          badge.style.display = 'inline-block';
        }
      } catch (_e) { void _e; }
    }
  });

  // 푸시 탭(클릭) → 알림 종류에 따라 적절한 화면으로 이동
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const data = action?.notification?.data || {};
    const type = data.type;
    if (type === 'support_reply' || type === 'moderation_reply') {
      // 고객센터 채팅 모달 자동 열기
      if (typeof window.openSupportChat === 'function') {
        try { window.openSupportChat(); } catch (_e) { void _e; }
      }
    }
  });

  async function unregisterPush() {
    const savedToken = localStorage.getItem('itdasy_push_token');
    if (!savedToken || !window.API || !window.authHeader) return;
    try {
      await apiFetch('/push/unregister', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...window.authHeader() },
        body: JSON.stringify({ token: savedToken }),
      });
      localStorage.removeItem('itdasy_push_token');
    } catch (_) { void 0; }
  }

  window.initPushNotifications = initPush;
  window.unregisterPushNotifications = unregisterPush;

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initPush, 1500);
  });
})();
