# js/persona — 페르소나 설정 모듈 (예방적 배치)

> 부모 `../../CLAUDE.md` + `../../AGENTS.md` 규칙 상속. **분할 전 선제 규칙 적용**.

## 현재 상태
`app-persona.js` 900줄 — 임계치(1000줄) 직전. **이 폴더는 비어있으나 선규칙 배치**하여, 다음 수정 시 자동으로 분할되도록 유도.

## 규칙 (분할 없이도 적용)
- 새 기능 추가 시, **`app-persona.js`에 직접 추가 금지**. 새 파일을 `js/persona/` 하위에 만들고 `index.js`에서 import.
- 기존 함수 수정은 허용. 단 **함수 하나당 50줄 상한** (AGENTS.md §3 준수). 50줄 초과 시 새 파일 `js/persona/*.js` 로 추출 PR 필수.

## 분할 목표
- `index.js` — 공개 API
- `wizard.js` — 페르소나 생성 위저드 UI
- `storage.js` — Supabase persona 테이블 CRUD
- `suggest.js` — AI 기반 페르소나 제안
- `__tests__/`

## 의존성
- 상위: `app-core.js`, `app-ai.js`
- 금지: `app-caption.js`, `app-portfolio.js` 직접 호출

## 변경 시 체크
1. 페르소나 삭제 시 연관된 캡션/포트폴리오 영향 → 경고 모달 필수
2. `itdasy_token::staging` 토큰 스코프 확인 (하드코딩 금지)
3. 전역 `window.ItdasyPersona` 단일 객체만 노출
