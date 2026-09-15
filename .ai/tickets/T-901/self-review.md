# T-901 검토 기록

2026-09-15 · 로컬 변경 완료 · 운영 배포 및 스토어 심사 통과를 의미하지 않음.
사용자의 이번 조사·개선 요청 범위에서 구현했다. 계획 커밋 `5664fa6`, 기준 `259803f`.

## 전체 변경 파일

제품:
- `app-assistant.js`
- `app-comment-reply-queue.js`
- `app-dm-confirm-queue.js`
- `css/itd-editor.css`

검사:
- `__tests__/assistant-execute-result-2026-09-15.test.js`
- `__tests__/comment-draft-refresh-recovery-2026-09-15.test.js`
- `__tests__/dm-draft-refresh-recovery-2026-09-15.test.js`
- `scripts/release-offline-flow-smoke.js`

문서:
- `.ai/BOARD.md`
- `.ai/SESSION_STATE.md`
- `.ai/FOR_USER.md`
- `.ai/APP_FEATURE_INDEX.md`
- `.ai/tickets/T-901.md`
- `.ai/tickets/T-901/plan.md`
- `.ai/tickets/T-901/self-review.md`
- `docs/submission/App-Store-Metadata.md`
- `docs/submission/Play-Store-Metadata.md`
- `docs/submission/Release-Copy-2026-09-15.md`
- `output/APP_RELEASE_QUALITY_AUDIT_2026-09-15.md`

증거:
- `output/release-audit-2026-09-15/final-tests.log`
- `output/release-audit-2026-09-15/final-lint.log`
- `output/release-audit-2026-09-15/source-inventory.json`
- `output/release-audit-2026-09-15/dependencies-audit.json`
- `output/release-audit-2026-09-15/dependencies-runtime-audit.json`
- `output/release-audit-2026-09-15/workspace-flow.log`
- `output/playwright/t901-editor-reopen-mobile.png`
- `output/playwright/t901-editor-reopen-desktop.png`
- `output/playwright/t901-editor-small-phone.png`
- `output/playwright/t901-editor-small-phone-fixed.png`

## 공통 10항목

1. [x] 변경 파일 전체 목록을 위에 기록. 추가 로컬 진단 로그는 커밋 대상이 아님.
2. [x] `index.html`과 실행 파일 로드 순서 변경 없음.
3. [x] 제품 `window.*` 공개 전역 추가·제거 없음. 기존 session-ready/auth-expired 이벤트 사용.
4. [x] 새 localStorage 키·토큰 처리 변경 없음. DM 작성본은 실행 메모리에만 두고 계정 변경 시 삭제.
5. [x] Capacitor 브릿지·설정 변경 없음. 실제 Android/iOS 검증은 수행했다고 주장하지 않음.
6. [x] DB/권한 의존 쿼리 추가·실행 없음. 계정 분리 변경은 가상 응답 테스트이며 서버 권한 검증과 구별.
7. [x] 새 함수 50줄 초과 없음. 기존 큰 함수/파일 경고는 늘리지 않음.
8. [x] 빈 catch 추가 없음. 사용자 영향 경로에는 기존 실패 안내 또는 신규 빈 답글 안내 사용.
9. [x] 계획 커밋 및 구현 커밋 제목에 `T-901` 포함.
10. [x] `npm run lint` 오류 0·기존 경고 203, `npm test -- --runInBand` 198묶음/3,164개 통과. 기존 설치된 도구 사용.

## 별도 검증

- 신규 24개: 댓글 9, DM 9, 잇비 6. 실패 응답·연결 실패·입력 도중 늦은 응답·계정 변경·재시도 결과를 검사.
- 댓글 수정 전 새 검사 8개 실패, 잇비 수정 전 6개 중 4개 실패. 변경 후 모두 통과.
- T1 독립 검토에서 DM 채널 이동 작성본 소실과 이전 계정 지연 응답을 추가 지적받아 수정 후 재검토 통과.
- 기존 DM 예약 세부 입력의 채널 전환 보존은 이번 일반 답글 보존과 다름. 후속 검증 대상.
- 로컬 파일 연결 97/185, 뒤로가기 73화면 통과. 일반 smoke의 미주입 배포 버전 차이는 로컬용 `--git` 경로로 확인.
- 외부 연결 차단 작업실 9/9, 차단 요청 10건. 합성 사진으로 저장/재편집, PC 1440·휴대폰 390/320 확인.
- 사진편집 CSS 검사 오류·경고 0. `git diff --check` 통과.
- 개발/빌드 의존성 경고 15건은 별도 업데이트와 양 플랫폼 빌드 검증이 필요. 실행용 경고 0건을 전체 보안 통과로 확대 해석하지 않음.

## 파일 크기/분리 판단

- 기존 댓글 1,311줄, DM 1,002줄, 잇비 6,157줄: 필요한 분기와 짧은 내부 함수만 수정. 큰 파일 전체 분해는 별도 작업.
- 새 검사 각각 132/106/79줄, 외부 차단 도구 26줄. 역할별로 분리했고 신규 제품 로드 의존성은 만들지 않음.
- 원래 작업 폴더의 요금제 수정과 사진 자료는 손대지 않음. 현재 변경은 별도 작업 가지에만 존재.
