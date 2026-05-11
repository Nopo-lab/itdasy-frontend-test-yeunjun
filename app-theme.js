/* ─────────────────────────────────────────────────────────────
   다크모드 토글 — 2단계 순환: 라이트 ↔ 다크
   - localStorage: itdasy_theme = 'light' | 'dark'
   - body[data-theme] 속성 사용, CSS 에서 `[data-theme="dark"]` 선택자로 적용
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const STORAGE_KEY = 'itdasy_theme';
  const MODES = ['light', 'dark'];
  const LABELS = { light: '라이트', dark: '다크' };
  // Phase6: Phosphor 전환 — sprite href → ph-* class. themeToggleIcon은 <i>.
  const ICON_CLASS = { light: 'ph-sun', dark: 'ph-moon' };

  function _current() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (MODES.includes(saved)) return saved;
    // [2026-04-29 W7] saved 값 없으면 시스템 설정 자동 감지 (prefers-color-scheme)
    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch (_) { /* ignore */ }
    return 'light';
  }

  function _applyTheme(mode) {
    const html = document.documentElement;
    const body = document.body;
    if (mode === 'dark') {
      html.setAttribute('data-theme', 'dark');
      body?.setAttribute('data-theme', 'dark');
    } else {
      html.setAttribute('data-theme', 'light');
      body?.setAttribute('data-theme', 'light');
    }
    _updateButton(mode);
  }

  function _updateButton(mode) {
    const btn = document.getElementById('themeToggleBtn');
    if (btn) {
      const ic = document.getElementById('themeToggleIcon');
      if (ic) {
        // <i class="ph-duotone ph-sun"> → ph-moon 으로 토글
        ic.classList.remove('ph-sun', 'ph-moon');
        ic.classList.add(ICON_CLASS[mode]);
      }
      btn.setAttribute('aria-label', `화면 모드: ${LABELS[mode]} (탭하면 전환)`);
      btn.setAttribute('title', `${LABELS[mode]} 모드`);
    }
  }

  window.toggleTheme = function () {
    const cur = _current();
    const next = MODES[(MODES.indexOf(cur) + 1) % MODES.length];
    localStorage.setItem(STORAGE_KEY, next);
    _applyTheme(next);
    _syncLabels();
    if (typeof window.showToast === 'function') {
      window.showToast(`${LABELS[next]} 모드`);
    }
  };

  // Phase 7 T-334 — 설정 메뉴 버튼과 연결
  window.cycleTheme = window.toggleTheme;

  // T-334 — 큰 글씨 모드
  const FS_MODES = ['normal', 'large', 'xl'];
  const FS_LABELS = { normal: '보통', large: '크게', xl: '아주 크게' };
  const FS_KEY = 'itdasy_fontsize';
  function _curFS() { return localStorage.getItem(FS_KEY) || 'normal'; }
  function _applyFS(mode) {
    const html = document.documentElement;
    if (mode === 'normal') html.removeAttribute('data-fontsize');
    else html.setAttribute('data-fontsize', mode);
  }
  window.cycleFontSize = function () {
    const cur = _curFS();
    const next = FS_MODES[(FS_MODES.indexOf(cur) + 1) % FS_MODES.length];
    try { localStorage.setItem(FS_KEY, next); } catch(_){ /* ignore */ }
    _applyFS(next);
    _syncLabels();
    if (typeof window.showToast === 'function') window.showToast(`🔠 글씨 ${FS_LABELS[next]}`);
  };
  _applyFS(_curFS());

  function _syncLabels() {
    const tl = document.getElementById('themeLabel');
    if (tl) tl.textContent = LABELS[_current()];
    const fl = document.getElementById('fontSizeLabel');
    if (fl) fl.textContent = FS_LABELS[_curFS()];
  }

  // 최초 로드 시 저장된 테마 적용
  _applyTheme(_current());

  // DOM ready 때 버튼 아이콘 반영 (초기에 body 없을 수 있음)
  document.addEventListener('DOMContentLoaded', () => { _applyTheme(_current()); _syncLabels(); });
})();
