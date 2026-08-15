/**
 * ESLint 설정 (T-002)
 *
 * 철학: 스테이징 레포라 처음엔 대부분 `warn`, 2개만 `error`.
 * Phase 2 완료 후 (app-caption/portfolio/gallery 분할 끝난 뒤)
 * max-lines-per-function / max-lines 를 error 로 승격 예정.
 *
 * 실행: npm run lint
 */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
    jest: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'script',
  },
  globals: {
    // Capacitor 네이티브 브리지
    Capacitor: 'readonly',
    // app-core.js 가 노출하는 전역 (AGENTS.md §2 허용 목록)
    API: 'readonly',
    apiUrl: 'readonly',
    apiFetch: 'readonly',
    authHeader: 'readonly',
    getToken: 'readonly',
    setToken: 'readonly',
    hapticLight: 'readonly',
    // 모듈 네임스페이스 (향후)
    ItdasyCore: 'readonly',
    ItdasyCaption: 'readonly',
    ItdasyPortfolio: 'readonly',
    ItdasyGallery: 'readonly',
    ItdasyPersona: 'readonly',
  },
  rules: {
    // ===== error (절대 안 됨) =====

    // 레거시 토큰 키 하드코딩 금지 — AGENTS.md §3.1
    // app-core.js 마이그레이션 블록(line 35-43) 은 override 로 예외
    'no-restricted-syntax': [
      'error',
      {
        selector: "Literal[value='itdasy_token']",
        message:
          "레거시 토큰 키 'itdasy_token' 직접 사용 금지. window.getToken() / setToken() 사용. (app-core.js 마이그레이션 블록 제외)",
      },
    ],

    // 빈 catch 금지 — AGENTS.md §3.5
    'no-empty': ['error', { allowEmptyCatch: false }],

    // ===== warn (개선 권장) =====

    // 함수 50줄 초과 경고 — AGENTS.md §3.3
    'max-lines-per-function': [
      'warn',
      { max: 50, skipBlankLines: true, skipComments: true },
    ],

    // 파일 500줄 초과 경고 — AGENTS.md §3.4
    'max-lines': [
      'warn',
      { max: 500, skipBlankLines: true, skipComments: true },
    ],

    // console.log 경고 (warn/error 는 허용)
    'no-console': ['warn', { allow: ['warn', 'error'] }],

    // 미사용 변수 경고
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

    // eqeqeq 경고
    eqeqeq: ['warn', 'smart'],
  },
  overrides: [
    // app-core.js 의 마이그레이션 블록은 레거시 키 참조 허용
    {
      files: ['app-core.js'],
      rules: {
        'no-restricted-syntax': 'off',
      },
    },
    // 기존 monolith 파일들은 500줄 초과 허용 (분할 전까지)
    {
      files: [
        'app-caption.js',
        'app-portfolio.js',
        'app-core.js',
      ],
      rules: {
        'max-lines': 'off',
        'max-lines-per-function': 'off',
      },
    },
    // 오래된 큰 화면은 단계적으로 쪼개는 대상입니다. 새로 정리된 파일부터 엄격하게 봅니다.
    {
      files: [
        'app-ai.js',
        'app-assistant-undo.js',
        'app-assistant.js',
        'app-ba-auto-trigger.js',
        'app-backup.js',
        'app-brand-kit.js',
        'app-calendar-view.js',
        'app-chat-auto-edit.js',
        'app-complete-flow.js',
        'app-customer-memo.js',
        'app-customer.js',
        'app-dashboard.js',
        'app-dm-confirm-queue.js',
        'app-dm-conversations.js',
        'app-dm-manual-replies.js',
        'app-gallery-assign.js',
        'app-gallery-element.js',
        'app-gallery-finish.js',
        'app-gallery-slot-editor.js',
        'app-gallery-workshop.js',
        'app-gallery-write.js',
        'app-gestures.js',
        'app-growth-story.js',
        'app-import-wizard.js',
        'app-import.js',
        'app-insights.js',
        'app-instagram.js',
        'app-instant-caption.js',
        'app-inventory-hub.js',
        'app-inventory.js',
        'app-kakao-hub.js',
        'app-killer-widgets.js',
        'app-membership.js',
        'app-myshop-v3.js',
        'app-naver-link.js',
        'app-notifications.js',
        'app-photo-enhance.js',
        'app-pricelist.js',
        'app-receipt-scan.js',
        'app-report.js',
        'app-revenue-month.js',
        'app-revenue.js',
        'app-shop-settings.js',
        'app-smart-capture.js',
        'app-today-brief.js',
        'app-voice-caption.js',
        'components/scenario-selector.js',
      ],
      rules: {
        'max-lines': 'off',
        'max-lines-per-function': 'off',
      },
    },
    // 테스트 파일
    {
      files: ['**/__tests__/**/*.js', '**/*.test.js'],
      rules: {
        'max-lines-per-function': 'off',
      },
    },
  ],
  ignorePatterns: [
    'node_modules/',
    'android/',
    'ios/',
    'dist/',
    'coverage/',
    '*.min.js',
  ],
};
