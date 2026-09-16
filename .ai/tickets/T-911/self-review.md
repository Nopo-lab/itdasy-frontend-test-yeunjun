# T-911 자가검토

- [x] 변경 파일 전체 목록 확인
- [x] `index.html` 파일 불러오기 순서 변경 없음
- [x] 새 전역 기능 추가 없음
- [x] 로그인 저장 방식 변경 없음
- [x] 웹 경로 수정이며 네이티브 설정 변경 없음
- [x] 데이터베이스 권한 변경 없음
- [x] 50줄 넘는 새 함수 없음
- [x] 빈 오류 처리 추가 없음
- [x] 커밋 메시지에 T-911 포함 예정
- [x] 전체 자동 검사 통과: 화면 시험 3,226개 성공, 2개 제외, 실패 0

## 변경 파일

- `app-caption.js`
- `app-instant-caption.js`
- `app-voice-caption.js`
- `app-assistant.js`
- `index.html`
- `js/load-groups.js`
- `__tests__/caption-consent-retry-2026-09-16.test.js`
- `.ai/tickets/T-911.md`
- `.ai/tickets/T-911/plan.md`
- `.ai/tickets/T-911/self-review.md`

## 파일 크기/분리 판단

기존 큰 파일에는 요청 함수 호출 한 줄씩만 바꿨다. 실제 동의 처리는 이미 분리된 공통 함수에 두어 새 큰 함수를 만들지 않았다.
