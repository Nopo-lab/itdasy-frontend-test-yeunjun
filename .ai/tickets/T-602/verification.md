# T-602 검증 결과

## 기능과 화면

- 시술 노트: 새 기록·수정·지난 내용 복사. 복사는 시술명/메모만; 과거 사진이나 금액을 새 실적으로 복제하지 않음.
- 다음 관리: 날짜·메모 직접 지정, 날짜 비우기로 해제. 지난 관리일과 향후 30일 고객 목록. 자동 고객 연락 없음.
- 소개 고객: 기존 고객 검색 후 명시적 선택/저장, 변경/해제, 소개받은 고객 목록 더보기.
- 세 화면은 고객 상세 내부에 표시. 별도 앱 이동이나 새 팝업 없음.

## 자동 검사

- FE 전체 Jest: 199 suites / 3,168 tests PASS. 신규 케어 관련 20개 포함.
- 자동 코드 검사: 오류 0, 기존 경고 201. 신규 케어 JS 및 CSS 검사 통과.
- 앱 파일 연결 102 scripts / 186 lazy entries PASS. 모든 새 파일 등록 및 캐시 버전 포함.
- 기존 작업실 흐름 9/9 PASS, 뒤로가기 점검 73개 / 미등록 0.
- cap sync: Android + iOS + web 성공. 생성된 로컬 node_modules 경로는 소스에 반영하지 않음.

## 실제 브라우저와 저장소 연결

`node scripts/customer-care-qa.js` / BE `backend/scripts/customer_care_local_server.py`.
가상 고객만 든 별도 SQLite, 실제 고객/시술/케어 라우터와 기존 `app-customer-dashboard.js` 사용.

10개: 기존 상세 연결, 시술 저장, 관리일 지정/해제, 소개 검색/저장, 관리일 목록, 재조회 유지, 타 원장 404, 390px 가로 넘침 없음, 1440px 화면, 브라우저 예외 없음.
화면 사진: `output/playwright/t602-mobile.png`, `t602-mobile-form.png`, `t602-desktop.png`.
실제 휴대폰 터치·네이티브 바이너리 빌드·App Store 심사 완료를 뜻하지 않음.

## 독립 검토 반영

- 작성 중 외부 갱신/이동/닫기 보호와 저장 뒤 미뤄둔 갱신.
- 다시 mount할 때 이벤트 중복 제거, 이전 고객/이전 더보기 응답 무시.
- 뒤로가기 거부 때 브라우저 이동 기록 복구.
- 저장 응답 유실 후 다른 내용 재시도는 오류 안내·입력 보존·최근 기록 확인 경로.
- 서버 시술 삭제/신규 등록의 동시 관리일 변경은 같은 고객 잠금 순서.

## 변경 파일과 파일 크기/분리 판단

기존: `AGENTS.md`, `app-core.js`, `app-customer.js`, `app-customer-dashboard.js`, `index.html` 및 `.ai` 인수인계.
신규: `js/customer-care/{data,view,forms,controller,due}.js`, `css/screens/customer-care.css`, `__tests__/customer-care-*.test.js` 3개, `scripts/customer-care-qa.js`.
새 제품 코드는 데이터/화면/입력/저장/목록 역할로 분리했고 각각 500줄 미만. 기존 큰 파일은 연결·보호 부분만 수정.
운영 프론트 별도 저장소와 실제 고객 데이터는 테스트에 사용하지 않음.

## 출시 범위

프론트 `itdasy-frontend-test-yeunjun`, 서버 `itdasy_backend-test`에만 반영. 후자는 이름과 달리 실제 운영 서버이므로 서버 선배포 후 프론트 반영.
최종 서버 검사 및 커밋/배포 결과는 확인 후 추가.

## 서버 최종 검사와 반영

- 기본 전체 4,518 PASS / 환경별 289 SKIP / 기존 예상실패 1개. PostgreSQL 전체 209 PASS / 생략 0.
- 최종 수정 뒤 관련 기본 42개, PostgreSQL 9개 PASS.
- 서버 구현 4c1c1da, PR #63, main 병합 9850751. 배포 SUCCESS, 실제 /health healthy / wiring.git_sha=9850751e / schema_parity=ok 확인.
- FE PR #44. 서버 적용 확인 뒤 병합하며 화면 배포 결과는 해당 PR 연결 Actions에서 확인. 고객 관리일 목록도 고객 삭제·수정·예약 변경 때 갱신.

## Safari 계열 추가 검증

- WebKit 375px와 Chromium 320px에서 실제 로컬 서버 연결 흐름 각각 10/10 PASS.
- WebKit에서 빈 날짜의 각 입력은 정상인데 폼 전체는 잘못됐다고 판단하는 현상을 재현.
- 명시적인 관리일 해제 버튼을 추가. 빈 날짜이며 badInput이 아닐 때만 다른 입력을 개별 검사. 날짜가 있거나 잘못 입력 중이면 기존 검사 유지.
- 독립 검토: 범위 밖 날짜 2개와 잘못 입력 중인 빈 날짜 모두 저장 요청 0건 확인. 메모 검사는 유지.
- 최종 FE 전체 199묶음 3,168 PASS. 신규 고객 케어 관련 20개.
- 최종 화면: output/playwright/t602-webkit-mobile.png, t602-chromium-mobile.png 및 각 -desktop.png.
