/* ─────────────────────────────────────────────────────────────
   Capacitor Haptics 래퍼 + 네이티브 다이얼로그

   웹 브라우저에서는 no-op. 네이티브 앱에서만 진동.
   전역 window 에 hapticLight/Medium/Heavy/Success/Warning/Error,
   그리고 nativeConfirm(title, message) 제공.
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const Haptics = window.Capacitor?.Plugins?.Haptics;
  const Dialog = window.Capacitor?.Plugins?.Dialog;

  function _safe(fn) { try { fn(); } catch (_) {} }

  // 버튼 탭·확인 액션용 (가벼운 탁)
  window.hapticLight = () => {
    if (!isNative || !Haptics) return;
    _safe(() => Haptics.impact({ style: 'LIGHT' }));
  };

  // 중요 액션 (만들기·저장)
  window.hapticMedium = () => {
    if (!isNative || !Haptics) return;
    _safe(() => Haptics.impact({ style: 'MEDIUM' }));
  };

  // 위험·삭제 액션
  window.hapticHeavy = () => {
    if (!isNative || !Haptics) return;
    _safe(() => Haptics.impact({ style: 'HEAVY' }));
  };

  // 성공 알림 (복사·발행)
  window.hapticSuccess = () => {
    if (!isNative || !Haptics) return;
    _safe(() => Haptics.notification({ type: 'SUCCESS' }));
  };

  window.hapticWarning = () => {
    if (!isNative || !Haptics) return;
    _safe(() => Haptics.notification({ type: 'WARNING' }));
  };

  window.hapticError = () => {
    if (!isNative || !Haptics) return;
    _safe(() => Haptics.notification({ type: 'ERROR' }));
  };

  // 네이티브 다이얼로그 (confirm 대체)
  // 사용법: const ok = await nativeConfirm('삭제', '정말 삭제할까요?')
  window.nativeConfirm = async function (title, message, okText = '확인', cancelText = '취소') {
    // 네이티브면 Capacitor Dialog 플러그인 사용
    if (isNative && Dialog) {
      try {
        const r = await Dialog.confirm({ title, message, okButtonTitle: okText, cancelButtonTitle: cancelText });
        return !!r.value;
      } catch (_) {}
    }
    // 웹 폴백
    return window.confirm(`${title}\n\n${message}`);
  };

  // 네이티브 alert 대체
  window.nativeAlert = async function (title, message) {
    if (isNative && Dialog) {
      try { await Dialog.alert({ title, message }); return; } catch (_) {}
    }
    window.alert(`${title}\n\n${message}`);
  };

  // 자동 haptic: data-haptic 속성 달린 버튼 탭 시 자동 실행
  // 예: <button data-haptic="medium">만들기</button>
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-haptic]');
    if (!el) return;
    const type = el.getAttribute('data-haptic');
    const fn = window['haptic' + type.charAt(0).toUpperCase() + type.slice(1)];
    if (typeof fn === 'function') fn();
  }, { passive: true });

  // Android 뒤로가기 버튼 처리 — 탭 히스토리 또는 앱 종료
  const AppPlugin = window.Capacitor?.Plugins?.App;
  if (isNative && AppPlugin) {
    AppPlugin.addListener('backButton', ({ canGoBack }) => {
      // 1) 열려있는 팝업/모달 먼저 닫기
      const openPopup = document.querySelector(
        '.popup[style*="display: flex"], .modal-overlay[style*="display: flex"], ' +
        '.bottom-sheet[style*="display: flex"], .pop[style*="display: block"]'
      );
      if (openPopup) {
        const closeBtn = openPopup.querySelector('.close-btn, [data-close], [aria-label*="닫기"]');
        if (closeBtn) { closeBtn.click(); return; }
        openPopup.style.display = 'none';
        return;
      }

      // 2) 캡션·AI·예약·마무리 탭에 있으면 홈으로
      const homeBtn = document.querySelector('nav .nav-btn[onclick*="home"], nav button[data-tab="home"]');
      const activeTab = document.querySelector('.tab.active, .tab[style*="display: block"]');
      const inHome = activeTab && (activeTab.id === 'tab-home' || activeTab.id === 'home');
      if (!inHome && homeBtn) {
        homeBtn.click();
        return;
      }

      // 3) 홈에서 한 번 더 누르면 종료 확인
      window.hapticWarning();
      window.nativeConfirm('앱 종료', '정말 나가시겠어요?', '종료', '머물기').then((ok) => {
        if (ok) AppPlugin.exitApp();
      });
    });
  }
})();
