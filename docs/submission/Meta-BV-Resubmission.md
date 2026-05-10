# Meta Business Verification 재제출 체크리스트 (2026-04-22)

## 거절 사유 추정 (이전)

- 앱 스크린샷·비디오 가 **Phase 5 이전 구버전** (AI 캡션 중심)
- 데이터 삭제 콜백 경로가 미검증 상태
- Business Verification 서류 불일치 가능

## 재제출 전 준비

### 1. 법적 이름 통일 ✅

- 모든 사이트/앱/문서에서 **와이투두(Y2do)** 로 통일
- 사업자등록번호: `179-36-01681`
- 대표: 강연준
- 문의: contact@itdasy.com

### 2. 데이터 삭제 콜백 엔드포인트 ✅

- `POST /instagram/deletion-callback` 구현됨 (commit `0d6e1fc`)
- URL: `https://itdasy-backend-staging-644329093453.asia-northeast3.run.app/instagram/deletion-callback`
- Meta Developer Console 에 등록

### 3. 앱 스크린샷·비디오 (Phase 6.3 반영) — ❌ 재촬영 필요

촬영 대상 (CBT4 계정 실제 화면):
- [ ] 잇데이 대시보드 (AI 킬러 위젯 5종)
- [ ] 파워뷰 고객 탭
- [ ] AI 비서 대화 (예약 추가 실행)
- [ ] 인스타 캡션 생성 (기존 기능)
- [ ] 설정 → 사업자 정보 블록
- [ ] 회원가입 폼 (약관 동의 체크박스)

### 4. 권한 사용 설명 (각 scope 에 대해 "왜 필요한지")

| Scope | 사용 목적 | 증빙 스크린샷 |
|---|---|---|
| `instagram_business_basic` | 원장님 인스타 계정 기본 정보(username, id) 조회 | 샵 프로필 화면 |
| `instagram_business_manage_messages` | DM 자동 답변 초안 기능 (T-312) | DM 탭 |
| `instagram_business_manage_comments` | 네이버/인스타 리뷰 수동 통합 | NPS 탭 |
| `instagram_business_content_publish` | 캡션·스토리 발행 | 인스타 발행 버튼 |

## 제출 양식

Meta Developer Dashboard → App Review → Add Use Case 에 각 scope 마다:
- 비디오 (30~90초) 업로드
- "무엇을 어디서 사용자가 보게 되는지" 한국어 + 영문 설명
- Test user credentials: `review@itdasy.com` / `review1234!`
- Test instructions: Review-Notes.md 의 내용 영문 번역 첨부

## 예상 소요

- 서류 준비 1~2일
- Meta 검토 3~7일
- 승인 후 운영 상태 전환
