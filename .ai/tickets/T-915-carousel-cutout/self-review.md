# T-915 자가 검토

- 변경 파일: js/itd-editor/photo-recipes.js, js/workspace/workspace-v2-flow.js, js/itd-editor/__tests__/carousel-cutout-state.test.js, .ai/APP_FEATURE_INDEX.md, 이 티켓의 plan/self-review.
- 스크립트 순서/전역/토큰/접속 주소/네이티브 설정/DB 권한/워크플로 변경 없음.
- 새 함수는 50줄 미만, 기존 복원 모듈은 500줄 미만. 큰 workspace 파일에는 연결부 6줄 수정만.
- 빈 catch 추가 없음. 기존 실패 알림 정책은 그대로.
- 전체 자동 검사: 224 suites, 3334 tests PASS, 2 skipped, 0 fail.
- npm run lint: exit0, 0 errors, 176 기존 warnings. 새 변경 모듈 경고 없음.
- 독립 검토: 최신 글자/레이어 덮어쓰기/과거 단일 상태의 마스크 누출 3건 수정 후 추가 차단 항목 없음.
- 실제 배포본에서 2장 중 첫 사진 누끼+분홍 배경 소실 재현. 단일사진 누끼+분홍+노출2+저장/재열기는 픽셀 동일 확인.
- 수정 후 여러장 브라우저 검증: 맥 잠금 해제 대기. 이 결과 없이 PASS/배포 완료로 보고하지 않음. PR은 초안.
- 운영 제외, 고객 사진 외부 전송 없음. 키/사진/QA 하니스/로컬 BOARD 변경은 커밋 제외.
