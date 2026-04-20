# js/core — 공통 인프라 모듈 (모니터링 대상)

> 부모 `../../CLAUDE.md` + `../../AGENTS.md` 규칙 상속. **코어라서 더 엄격**.

## 현재 상태
`app-core.js` 831줄 — 분할은 아직 보류 (의존성 광범위). 대신 **엄격 규칙** 우선 적용.

## 엄격 규칙
- 모든 신규 export 함수는 **JSDoc 필수** (영문 시그니처 + 한국어 설명)
- 새 전역 변수 추가 금지 (`window.*` 신규 추가 시 오케스트레이터 리뷰 필수)
- fetch wrapper 는 `app-core.js` 에서만 정의. 다른 모듈은 wrapper 를 호출만.
- localStorage 키는 `app-core.js` 상단에서 상수로 관리:
  ```js
  const _TOKEN_KEY = 'itdasy_token::' +
    (API.includes('staging') ? 'staging'
     : (API.includes('localhost') ? 'local' : 'prod'));
  ```
  `API` 상수값으로 환경 자동 판별 (staging 우선, 그 외 localhost, 기본값 prod). 새 환경 추가 시 이 삼항 연산만 건드림.

## 토큰 키 체계 (매우 중요)
```
정답:   itdasy_token::staging   (스테이징)
정답:   itdasy_token::prod      (운영)
정답:   itdasy_token::local     (로컬 개발)
레거시:  itdasy_token            (app-core.js 35~43 마이그레이션 블록에서만 참조)
```
- **레거시 키 직접 참조 금지** (ESLint 로 차단 예정)
- 타 모듈은 반드시 `window.getToken()` / `window.setToken()` 경유

## 분할 로드맵 (900줄 도달 시)
- `index.js` — 공개 API
- `auth.js` — 토큰·OAuth
- `http.js` — fetch wrapper, 에러 매핑
- `events.js` — 모듈 간 이벤트 버스
- `env.js` — 환경 상수 (staging/prod 스위치)
- `__tests__/`

## 변경 시 체크
1. auth 관련 수정은 반드시 `itdasy_token::staging` 키 격리 유지 확인
2. fetch wrapper 수정 시 오프라인(`sw.js`) 케이스 테스트
3. 에러 메시지는 한국어 우선, 사용자 노출 문구는 상수화
4. OAuth 스킴 `itdasy://` 건드릴 시 🔴 빨간불 (원영님 승인 필수)
