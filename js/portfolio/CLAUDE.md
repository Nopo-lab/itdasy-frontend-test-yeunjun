# js/portfolio — 포트폴리오 관리 모듈

> 부모 `../../CLAUDE.md` + `../../AGENTS.md` 규칙 상속. 이 폴더 전용 규칙만.

## 역할
사용자 포트폴리오 CRUD, 이미지 업로드, 순서 재배열, 공개/비공개 토글. 기존 `app-portfolio.js`(1023줄) 분할본.

## 공개 API 경계
- 진입점: `index.js` 만 외부 노출. 나머지 파일은 내부 구현.
- 전역: `window.ItdasyPortfolio` 단일 객체.

## 파일 분할 가이드
- `index.js` — 라우터·이벤트 바인딩
- `crud.js` — Supabase CRUD 호출 (400줄 상한)
- `uploader.js` — 이미지 압축·Capacitor Camera 브리지
- `reorder.js` — 드래그 앤 드롭, 순서 저장
- `render.js` — 카드 리스트 DOM 렌더링
- `__tests__/` — Jest

## 의존성
- 상위: `app-core.js`, `app-haptic.js` (네이티브 피드백)
- 금지: `app-caption.js`, `app-gallery.js` 직접 호출 → 커스텀 이벤트로만

## 변경 시 체크
1. 업로드 전 이미지 용량 검사 (모바일 데이터 고려, 최대 5MB)
2. Supabase RLS 정책 위반 시 사용자에게 한국어 에러 표시
3. 삭제는 soft delete (`deleted_at` 컬럼), hard delete 금지
4. 이미지 URL 에 운영/스테이징 버킷 혼동 주의 — `app-core.js` 의 `ENV` 상수 사용

## 분할 상태
- 🔴 **아직 분할 전.** monolith `app-portfolio.js` 가 루트에 있음.
- 새 기능은 여기 `js/portfolio/*.js` 에 추가. monolith 수정 금지.
