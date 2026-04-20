# js/caption — 캡션 생성·편집 모듈

> 부모 `../../CLAUDE.md` + `../../AGENTS.md` 규칙 상속. 이 폴더 전용 규칙만.

## 역할
인스타/카페24용 캡션 생성, AI 보정, 샘플·템플릿 관리. 기존 `app-caption.js`(1167줄) 분할본.

## 공개 API 경계
- 외부 import는 **`index.js`만 허용**. `generator.js`, `templates.js` 등 내부 파일 직접 참조 금지.
- 전역 네임스페이스 노출은 `window.ItdasyCaption` 한 곳.

## 파일 분할 가이드
- `index.js` — 공개 API, 이벤트 바인딩 진입점
- `generator.js` — AI 호출·프롬프트 조립 (400줄 상한)
- `templates.js` — 해시태그·문구 샘플 (데이터 위주)
- `editor.js` — DOM 편집·자동완성 UI
- `__tests__/` — Jest 단위 테스트

## 의존성
- 상위: `app-core.js` (auth, fetch wrapper), `app-ai.js`
- 금지: `app-gallery.js` 직접 참조 (gallery 모듈은 이벤트로만 통신)

## 변경 시 체크
1. 해시태그 중복 검사 로직은 `templates.js`에서만
2. 토큰 키는 `itdasy_token::staging` (하드코딩 금지, `window.getToken()` 사용)
3. 500줄 초과 경고 시 즉시 하위 파일로 추출
4. innerHTML + onclick 인라인 금지 (XSS) — addEventListener 사용

## 분할 상태
- 🔴 **아직 분할 전.** monolith `app-caption.js` 가 루트에 있음. T-1XX 티켓으로 순차 이관 예정.
- 새 기능은 여기 `js/caption/*.js` 에 추가. monolith 수정 금지.
