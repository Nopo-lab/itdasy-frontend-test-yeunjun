/* ─────────────────────────────────────────────────────────────
   다크모드 토글 — 3단계 순환: 시스템 → 라이트 → 다크 → 시스템 ...
   - localStorage: itdasy_theme = 'system' | 'light' | 'dark'
   - body[data-theme] 속성 사용, CSS 에서 `[data-theme="dark"]` 선택자로 적용
   - 시스템 모드에서는 prefers-color-scheme 미디어쿼리 활용
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const STORAGE_KEY = 'itdasy_theme';
  const MODES = ['system', 'light', 'dark'];
  const ICONS = { system: '🌗', light: '☀️', dark: '🌙' };
  const LABELS = { system: '시스템', light: '라이트', dark: '다크' };

  function _current() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return MODES.includes(saved) ? saved : 'system';
  }

  function _applyTheme(mode) {
    const html = document.documentElement;
    const body = document.body;
    if (mode === 'dark') {
      html.setAttribute('data-theme', 'dark');
      body?.setAttribute('data-theme', 'dark');
    } else if (mode === 'light') {
      html.setAttribute('data-theme', 'light');
      body?.setAttribute('data-theme', 'light');
    } else {
      // system — data-theme 제거하면 prefers-color-scheme 미디어쿼리만 동작
      html.removeAttribute('data-theme');
      body?.removeAttribute('data-theme');
    }
    _updateButton(mode);
  }

  function _updateButton(mode) {
    const btn = document.getElementById('themeToggleBtn');
    if (btn) {
      btn.textContent = ICONS[mode];
      btn.setAttribute('aria-label', `화면 모드: ${LABELS[mode]} (탭하면 전환)`);
      btn.setAttribute('title', `${LABELS[mode]} 모드`);
    }
  }

  window.toggleTheme = function () {
    const cur = _current();
    const next = MODES[(MODES.indexOf(cur) + 1) % MODES.length];
    localStorage.setItem(STORAGE_KEY, next);
    _applyTheme(next);
    if (typeof window.showToast === 'function') {
      window.showToast(`${ICONS[next]} ${LABELS[next]} 모드`);
    }
  };

  // 최초 로드 시 저장된 테마 적용
  _applyTheme(_current());

  // DOM ready 때 버튼 아이콘 반영 (초기에 body 없을 수 있음)
  document.addEventListener('DOMContentLoaded', () => _applyTheme(_current()));
})();
