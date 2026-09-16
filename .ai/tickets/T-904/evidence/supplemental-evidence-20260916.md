# T-904 보충 증거 — 2026-09-16

> 이 파일은 오전 시점 증거다. 이후 실제 Instagram·AI 장애·접근성 재검증은
> `runtime-closeout-20260916.md`가 이어받으며, 아래 “실행하지 않았다” 항목보다 나중 증거다.

## 1. Supabase/백업 복원

- GitHub Actions `Supabase Daily Backup` 최신 성공 실행: `35020540689`, 2026-09-15 20:35:12 UTC.
- GCS 최신 LIVE 백업: `gs://itdasy-db-backups/itdasy_LIVE_hsxxqomfbdernepykils_20260915_2035.sql.gz`.
- 백업 파일을 격리 로컬 PostgreSQL `itdasy_t904_supabase_restore_20260916`에 복원했다.
- 로컬에 없는 Supabase 전용 확장 `supabase_vault`와 `vault.secrets` 복원만 제외했다.
- 복원 결과: 공개 표 76개.
- 핵심 행 수: bookings 567, customers 494, revenue_records 506, shop_settings 47, users 80, workspace_slots 131.

결론: 실제 구성된 백업 경로는 복원 가능함을 확인했다. Supabase 관리 화면의 원클릭 복원은 별도 실행하지 않았다.

## 2. Instagram cbt4 연결 상태

최신 LIVE 백업 복원 DB에서 `cbt4@itdasy.com` 계정을 확인했다.

- user id: 5
- Instagram user id 있음
- Instagram page id 있음
- Instagram access token 있음
- token invalid: false
- token expires: 2026-11-12 11:40:07 KST

실제 앱 로그인 세션이 없어 Meta API 상태조회, 댓글, DM, 발행, 실패 재시도는 실행하지 않았다.

## 3. 개인정보 사고 감지 흐름

Google Cloud에 개인정보 사고 감지용 운영기록 지표와 알림을 추가했다.

- 기록 지표: `privacy_incident_signal`
- 알림 1: `🔴 Privacy incident signal`
- 알림 2: `🔴 Privacy manual incident intake`
- 알림 채널: 기존 운영 알림 채널 `12496700105414525763`
- QA 기록: `[PRIVACY_INCIDENT] QA주입: metric_filter_after_update no_real_pii runbook=T904`
- 기록 검색 확인 시각: 2026-09-16 00:15:09 UTC

실제 개인정보는 사용하지 않았다. 실제 담당자 수신함 확인과 신고 제출은 실행하지 않았다.

## 4. 원장 스타일 에이전트 평가

증거 이미지:

- `owner-style-synthetic-contact-20260916.jpg`
- `owner-style-realistic-contact-20260916.jpg`

주 평가 대상은 합성 뷰티 golden set 60장이다. 사용자 지시에 따라 사람 평가 대신 에이전트가 직접 시각 평가했다.

- A 청담 럭셔리: 흰 대문자, 여백, 프리미엄 톤 일관.
- B 홍대 트렌디: 진한 분홍, 굵은 문구, 강한 대비 일관.
- C 감성 네일: 작은 한글 감성 문구, 부드러운 하단 배치 일관. 일부 밝은 사진은 가독성 약함.
- D 임상적 피부샵: `CARE RECORD`와 깨끗한 흰색 기록 톤 일관.
- E 일본 감성: 작은 일본어풍 문구, 따뜻한 저채도 톤 일관. 일부 밝은 사진은 가독성 약함.
- F Instagram viral: 굵은 before/after 훅 일관. 실제 전후쌍이 아닌 사진에 쓰면 소비자 오해 위험이 있어 템플릿 제한 필요.

결론: G13은 `AGENT VERIFIED PASS`. `HUMAN ACCEPTANCE PASS`는 아니다.

## 5. 공식 정책 확인

확인한 공식 기준:

- 개인정보 보호법 제28조의8: 개인정보 국외 이전 고지 항목. https://law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1033215841
- Apple account deletion guideline: 앱 안에서 계정 삭제 시작 경로 필요. https://developer.apple.com/support/offering-account-deletion-in-your-app
- Google Play account deletion requirement: 앱 안과 웹 삭제 경로 필요. https://support.google.com/googleplay/android-developer/answer/13327111
- Google Play AI content policy: 기만적 AI 콘텐츠 방지와 신고 기능 요구. https://support.google.com/googleplay/android-developer/answer/14094294
- Supabase changelog: 2026년 백업·복원 관련 변경과 주의사항 확인. https://supabase.com/changelog.md

법률 해석과 계약상 보유·삭제·국가 확정은 `LEGAL COUNSEL REVIEW REQUIRED`로 남긴다.
