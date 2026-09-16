# 2026-09-16 실제 연동·배포 재검증

## 기준 버전

- FE main: `ecb80363f9b8f87a41d0f1d64230dc96ecc46eb5`
- FE 실제 제공 빌드: `20260916-0155-ecb8036`
- BE main·제공 SHA: `f8546a2f0caa07aec56fe3b965e03db6708f0269`
- Cloud Run 최종 버전: `itdasy-backend-staging-00630-gvt`, 트래픽 100%
- DB 변경 이력: `0068_comment_event_occurred_at`
- DB 대상: Supabase `hsxxqomfbdernepykils`, PostgreSQL `postgres`, 계정
  `postgres.hsxxqomfbdernepykils`, 서울 pooler 6543
- Storage: `user-uploads`

Cloud Run의 `ENVIRONMENT` 값은 `production`이고 서비스 이름은 staging이다. 실제 DB와 연결된
환경이므로 cbt4 시험계정의 최소 영향 정상 흐름만 실행했다. 대량·삭제·장애 주입은 실행하지 않았다.
AI 장애 시험은 사용자 번호 5와 별도 시험 표식이 모두 일치할 때만 작동하도록 잠시 켠 뒤 제거했다.

## Instagram 실제 흐름

- cbt4 로그인: 200
- 연결 상태: connected, token valid, publish/comments/messages 권한 확인
- 실제 최근 게시물 읽기: 12개
- 실제 합성 시험 게시물 발행: 성공
- 같은 처리번호 재전송: 같은 게시물 번호 반환, 중복 게시 0
- 안전한 내부 시험 댓글 공개 답장: 성공
- 같은 댓글 재전송: duplicate 처리, 중복 답장 0
- 오래된 댓글 비공개 답장: `ok=false`, `partial_success=false`,
  `error_code=dm_window_expired`, 외부업체 원문 미노출
- 댓글 실제 시각 복구 뒤 대기열: 12개에서 8개. 7월의 14일 밖 항목은 제외되고 9월 항목은
  실제 8일·12일 전으로 표시됨. 서버가 받은 시각을 댓글 시각처럼 보이던 “41분 전” 표시 제거
- 신규 댓글의 실제 비공개 답장: **NOT VERIFIED**. 연결된 계정의 현재 댓글이 모두 허용 기간 밖임

## AI 실제 장애 흐름

cbt4 사용자 번호 5에만 시험 오류가 적용되도록 Cloud Run 버전 `00629-vq2`를 잠시 사용했다.
일반 이용자는 헤더와 사용자 번호가 모두 맞지 않아 영향을 받지 않는다.

- 시험: 실제 `/assistant/ask`에서 모델 시간초과 경로 실행
- 응답: 504, 행동 가능한 한국어 재시도 안내
- 성공 답변 필드: 없음
- AI 사용량: 39 → 39, 실패 차감 0
- 운영기록: `[ITBI_FAULT] ... kind=model_timeout`, 실제 고객 내용 없음
- 시험 전 AI 동의: OFF
- 시험 후 AI 동의: OFF
- 시험 설정 제거 뒤 최종 버전: `00630-gvt`, 설정 없음, 정상 응답, DB 대조 정상

## 모바일 화면 접근성

368×833 실제 GitHub Pages 제공 화면에서 확인했다.

- 댓글 화면 스위치: 기능 이름 있음, 44×44, Space 키 상태 변경·원복 성공
- 댓글 화면 뒤로·설정·보내기·수정·무시·고객 보기·DM 보기: 44px 이상
- DM 설정 스위치 9개: 각 기능 이름 있음, `role=switch`, 상태 제공, 모두 44×44
- DM 설정 뒤로·저장·메뉴 추가: 모두 높이 44px
- 가격표 자동 안내 스위치: Space 키 `false → true → false` 성공, 저장 없이 원복
- 가로 넘침: 문서 너비 353, 화면 너비 353

## 개인정보 사고 대응

- 운영기록 지표 `privacy_incident_signal`: 존재·필터 확인
- 알림 `Privacy incident signal`: 사용 중, 이메일 채널 연결
- 알림 `Privacy manual incident intake`: 사용 중, 이메일 채널 연결
- 채널 `연준 (잇데이 장애 알림)`: 사용 중, Google Cloud 확인 상태 `VERIFIED`
- 실행 절차: `docs/legal/PRIVACY-INCIDENT-RUNBOOK.md`, FE #56 병합
- 합성 사고 기록 검색: 확인
- 실제 메일 수신함 열람: NOT VERIFIED
- 대체 담당자 연락망: BLOCKED

## 자동 검사

- FE: 208묶음, 3,222개 성공, 2개 제외. 제외는 성공으로 계산하지 않음
- BE: 4,621개 성공, 299개 제외, 1개 예상 실패. 제외·예상 실패는 성공으로 계산하지 않음
- BE 순서 섞기: 4,621개 성공, 299개 제외, 1개 예상 실패
- 격리 PostgreSQL 닫힌 검사: 214개 성공, 제외 0
- 매장 분리 전용 검사: 172개 성공, 24개 제외. 별도 필수 99개 성공, 제외 0

