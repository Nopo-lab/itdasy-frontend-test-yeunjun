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
  const canWebVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

  const HAPTIC_KEY = 'itdasy_haptic_enabled';
  function _hapticEnabled() {
    return localStorage.getItem(HAPTIC_KEY) !== 'off';  // 기본 on
  }

  window.setHapticEnabled = function (on) {
    localStorage.setItem(HAPTIC_KEY, on ? 'on' : 'off');
    // 토글 UI 갱신
    const lbl = document.getElementById('hapticToggleStatus');
    if (lbl) {
      lbl.textContent = on ? '켜짐' : '꺼짐';
      lbl.style.color = on ? 'var(--accent)' : '#888';
    }
  };
  window.updateHapticToggleLabel = function () {
    const on = _hapticEnabled();
    const lbl = document.getElementById('hapticToggleStatus');
    if (lbl) {
      lbl.textContent = on ? '켜짐' : '꺼짐';
      lbl.style.color = on ? 'var(--accent)' : '#888';
    }
  };
  document.addEventListener('DOMContentLoaded', () => window.updateHapticToggleLabel());
  window.isHapticEnabled = _hapticEnabled;
  window.toggleHapticSetting = function () {
    const now = _hapticEnabled();
    window.setHapticEnabled(!now);
    if (!now && window.showToast) window.showToast('진동 켜짐');
    else if (now && window.showToast) window.showToast('진동 꺼짐');
    // 토글 확인용 마지막 가벼운 진동
    if (!now) {
      if (isNative && Haptics) _safe(() => Haptics.impact({ style: 'LIGHT' }));
      else if (canWebVibrate) _safe(() => navigator.vibrate(15));
    }
  };

  function _safe(fn) { try { fn(); } catch (_) { /* ignore */ } }

  function _webVibrate(pattern) {
    if (!_hapticEnabled()) return;
    if (!canWebVibrate) return;
    _safe(() => navigator.vibrate(pattern));
  }

  // 부드럽고 고급스러운 진동 패턴 (2026-04-20 조정)
  // 네이티브: iOS UIImpactFeedbackGenerator, Android Android Vibrator API 로 섬세한 진동
  // 웹: navigator.vibrate 는 ms 만 제어 가능 → 짧게 + 간격 좁게 해서 "톡" 느낌

  // 버튼 탭 — 아주 짧은 탭 (화면 터치 확인감)
  window.hapticLight = () => {
    if (!_hapticEnabled()) return;
    if (isNative && Haptics) { _safe(() => Haptics.impact({ style: 'LIGHT' })); return; }
    _webVibrate(6);  // 기존 10 → 6 (더 짧고 부드럽게)
  };

  // 중요 액션 — "톡" 한 번
  window.hapticMedium = () => {
    if (!_hapticEnabled()) return;
    if (isNative && Haptics) { _safe(() => Haptics.impact({ style: 'MEDIUM' })); return; }
    _webVibrate(12);  // 기존 25 → 12
  };

  // 위험·삭제 — "톡톡" (경고)
  window.hapticHeavy = () => {
    if (!_hapticEnabled()) return;
    if (isNative && Haptics) { _safe(() => Haptics.impact({ style: 'HEAVY' })); return; }
    _webVibrate(20);  // 기존 40 → 20
  };

  // 성공 — "톡-톡" 리듬 (경쾌한 두 번)
  window.hapticSuccess = () => {
    if (!_hapticEnabled()) return;
    if (isNative && Haptics) { _safe(() => Haptics.notification({ type: 'SUCCESS' })); return; }
    _webVibrate([8, 35, 8]);  // 기존 [15,60,15] → 더 짧고 간격 좁게
  };

  // 경고 — 살짝 길게 한 번
  window.hapticWarning = () => {
    if (!_hapticEnabled()) return;
    if (isNative && Haptics) { _safe(() => Haptics.notification({ type: 'WARNING' })); return; }
    _webVibrate([14, 45, 14]);
  };

  // 에러 — 짧은 세 번 (주의 환기, 예전 길게는 과함)
  window.hapticError = () => {
    if (!_hapticEnabled()) return;
    if (isNative && Haptics) { _safe(() => Haptics.notification({ type: 'ERROR' })); return; }
    _webVibrate([20, 30, 20, 30, 20]);
  };

  // 네이티브 다이얼로그 (confirm 대체)
  // 사용법: const ok = await nativeConfirm('삭제', '정말 삭제할까요?')
  window.nativeConfirm = async function (title, message, okText = '확인', cancelText = '취소') {
    // 네이티브면 Capacitor Dialog 플러그인 사용
    if (isNative && Dialog) {
      try {
        const r = await Dialog.confirm({ title, message, okButtonTitle: okText, cancelButtonTitle: cancelText });
        return !!r.value;
      } catch (_) { /* ignore */ }
    }
    // 웹 폴백
    return window.confirm(`${title}\n\n${message}`);
  };

  // 네이티브 alert 대체
  window.nativeAlert = async function (title, message) {
    if (isNative && Dialog) {
      try { await Dialog.alert({ title, message }); return; } catch (_) { /* ignore */ }
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
      const homeBtn = document.querySelector('.tab-bar__btn[data-tab="home"]');
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
