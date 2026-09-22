# T-912 자가검토

## 변경 파일

- 로그인 보호: `app-core.js`, `app-oauth-return.js`, `oauth-return.html`, `app-persona-survey.js`
- 인스타 연동: `app-instagram.js`
- 자동 확인: `__tests__/auth-token-theft-guards-2026-09-22.test.js`
- 공개 시험 파일: `output/_qa*.mjs` 29개, `.gitignore`
- 비밀번호 없는 심사 문서: `.ai/META_INSTAGRAM_CONSOLE_CHECKLIST.md`, `docs/submission/Meta-BV-Resubmission.md`, `docs/submission/Review-Notes.md`, `docs/submission/iOS-Preflight-Checklist.md`
- 기록: `.ai/tickets/T-912.md`, `.ai/tickets/T-912/plan.md`, `.ai/APP_FEATURE_INDEX.md`, `.ai/FOR_USER.md`, `.ai/BOARD.md`, `.ai/SESSION_STATE.md`

## 필수 확인 10개

1. ☑ 전체 파일 목록을 위에 기록함.
2. ☑ `index.html` 파일 연결 순서 변경 없음.
3. ☑ 새 `window.*` 추가·제거 없음.
4. ☑ 로그인 값은 `getToken()` / `setToken()` 경로를 사용. 휴대폰 직접 저장 우회 제거.
5. ☑ 휴대폰 연결 설정은 변경하지 않음. 설치된 안전 저장 기능의 실제 `internal*` 연결 모양을 확인하고 가짜 휴대폰 연결로 읽기·쓰기·삭제 시험 통과. 실제 기기 재빌드는 별도 승인 대상.
6. ☑ 운영 고객 DB 조회·변경 없음.
7. ☑ 새 50줄 초과 함수 없음. 기존 소셜 로그인 함수는 수정 전 60줄, 수정 후 60줄로 유지.
8. ☑ 빈 오류 처리 추가 없음. 사용자 경로 실패에는 안내 표시 유지.
9. ☐ 아직 커밋하지 않아 커밋 문구 확인은 배포 승인 뒤 진행.
10. ☑ 전체 자동 확인 219묶음·3,277개 통과. 앱 파일 연결 103개/지연 연결 186개, 뒤로가기 화면 73개 통과. 자동 검사 오류 0개, 기존 경고 177개.

## 추가 보안 확인

- 새 탈취 방지 검사 12개 통과. 설치 도구 보안 공지 0개.
- 현재 파일에서 확인된 두 시험 비밀번호 문자열 0건.
- 공개 웹에서 옛 QA 파일이 HTTP 200으로 열리는 사실 확인. 비밀번호 변경과 `output/` 공개 제외는 사용자 승인 대기.
- 비밀값 자동 찾기 결과 10건 중 8건은 동의 저장 이름·설치 잠금값 오탐. Android Firebase 공개 키 2건은 앱에 포함되는 값이라 숨김이 아니라 Google 쪽 앱 제한 설정 확인이 필요.

## 파일 크기/분리 판단

- 큰 기존 파일은 로그인 저장과 인스타 연동의 필요한 부분만 작게 수정했다.
- 새 검사는 한 파일로 독립됐고 500줄보다 작다.
- 공개 시험 파일 29개는 각각 1줄만 환경값 참조로 바꿨다. 기능 분할 대상이 아니다.
