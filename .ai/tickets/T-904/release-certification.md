# ITDASY 실제 출시 인증 기록 — 2026-09-15

## 1. EXECUTIVE VERDICT

**FINAL VERDICT: RELEASE HOLD**

| 항목 | 개수 |
|---|---:|
| P0 | 0 |
| P1 | 5 |
| P2 | 3 |
| P3 | 1 |
| Critical NOT VERIFIED | 7 |
| Security Critical/High | 2 |
| Privacy Critical/High | 3 |
| Money mismatch | 0 |
| Tenant leakage | 0 |
| Data-loss path | 1 |

25개 게이트 현재 수: **PASS 10 / FAIL 6 / NOT VERIFIED 7 / BLOCKED 2**.

## 2. EXACT BASELINE

| 대상 | 실제 값 |
|---|---|
| FE 후보 기준 | `db824c047a8760cfb9db5883f544a753d528426c` |
| FE 원격 main | `9888ceceb734c37d557becd3facf69ced8900915` |
| FE 실제 제공 빌드 | `20260915-1116-9888cec` |
| BE 후보 기준 | `69b32ac744c2bc6209e6178c5c0c33ae44f6bede` |
| BE 실제 제공 SHA | `9850751ebaf79de6709204db4047e588c65ae6ef` |
| Cloud Run | `itdasy-backend-staging-00621-mbg`, 트래픽 100% |
| 서버 환경 | `ENVIRONMENT=production`인 스테이징 서비스 |
| DB 격리 시험 | `itdasy_t904_runner@itdasy_release_t904`, 관리자 권한 없음 |
| Supabase | `hsxxqomfbdernepykils`, `user-uploads` |
| DB 표시 이력 | `MIGRATION_APPLIED=20260516-0016-receipt`; 코드 마이그레이션 63개와 불일치 |
| Android | `com.y2do.itdasy` |
| iOS | `com.nopolab.itdasy` |
| 시각 | 2026-09-15 Asia/Seoul |

후보 브랜치와 원격 main의 갈라짐을 마지막에 다시 가져와 확인했다. 감사 중 원격 main의
새 변경은 없었다. 실제 모바일 앱은 `server.url` 때문에 실제 제공 FE를 읽으므로 후보 FE
수정은 모바일에서 아직 확인되지 않았다.

## 3. CAPABILITY MAP

| 기능 | UI | API/DB | 외부 | 로그인/매장 | 돈 | 개인정보 | 실패 시험 |
|---|---|---|---|---|---|---|---|
| 가입·로그인·탈퇴 | 로그인/설정 | auth, users, token blacklist, user deletions | 메일·외부 로그인 | 본인 | 구독 연결 | 이메일·기기 | 만료·재사용·삭제 일부 실행 |
| 고객 | 고객 목록/상세 | customers | 없음 | user_id | 회원권 | 이름·전화·메모 | 중복·변조·대량 실행 |
| 예약 | 달력/완료창 | bookings, treatments | 알림 | user_id | 자동 매출 | 일정·시술 | 동시 완료·취소 실행 |
| 매출·회원권 | 매출/회원권 | revenue_records, customers | 결제·스토어 | user_id | 직접 영향 | 결제 기록 | 동시 2/10/100·환불 실행 |
| 구독 | 요금제 | subscriptions, IAP | Apple·Google·PortOne | 본인 | 직접 영향 | 영수증 | 실제 상점 미실행 |
| Instagram | 연동/DM/댓글 | instagram, dm/comment logs | Meta | 연결 소유자 | 간접 | SNS 신원·메시지 | 서명·재전송·동의 OFF 실행 |
| AI/잇비 | 채팅/캡션 | assistant logs, generation logs | Google AI 등 | user_id | 사용량 | 질문·고객 문맥 | 대체 응답·실패 UI 실행, 실모델 제한 |
| 사진 편집 | 작업실/편집기 | workspace/media | Supabase·사진 처리업체 | user_id/경로 | AI 사용량 | 고객 사진 | 60출력·전후·저장·비율 실행 |
| 지원·운영 | 고객센터/관리 | support/admin/logs | Discord·Sentry | 관리자/본인 | 환불 연결 | 문의 내용 | 비밀값·오류문구 검사 |
| 예약 작업 | 화면 없음 | cron/worker/queue | Cloud Tasks·Meta | 작업 서명 | 발행 비용 | SNS 자료 | 중복·재시작 일부 실행 |

코드에서 FE 버튼 114개, 폼 4개, 전체화면 창 53개, BE 경로 407개, DB 표 69개를 다시 셌다.

## 4. TEST EVIDENCE MATRIX

| 시험 | 환경 | 사용자 유형 | 기대 | 실제 | 증거 | 결과 |
|---|---|---|---|---|---|---|
| 화면 전체 자동 검사 | FE 후보 | 공통 | 깨짐 0 | 205묶음, 3,210개 성공 | Jest 출력 | PASS |
| 실제 예약→완료→매출→삭제 | 실제 제공 FE/BE 시험계정 | A/L | 1회 반영 후 정리 | 50,000원 1회, 전부 삭제 | complete-flow 실행 기록 | PASS |
| 다른 매장 번호 변조 | 격리 PostgreSQL | K | 한 바이트도 노출 없음 | 357회 차단, 연결 위반 0 | `t904-final/result.json` | PASS |
| 돈·회원권 동시 처리 | 격리 PostgreSQL | G/H/I/L | 경제효과 1회 | 장부 불변조건 15개 위반 0 | 같은 파일 | PASS |
| 과부하와 재시도 | 격리 PostgreSQL | G/H | 오류가 빨리 보임 | 90초 끊김 다수 | `t904-final/evidence.jsonl` | FAIL |
| 사진 60장 생성 | FE 후보 | B/C/D/E | 규격·저장 성공 | 60/60, 5비율, 1080px 출력 | `output/photo-editor-realistic-qa-report.json` | PASS |
| 사진 60장 사람 품질 | FE 후보 | B/C/D/E | 뷰티 사진만 사용 | 역사 그림·건물 등 부적절 원본 포함 | contact sheet | NOT VERIFIED |
| 시술 전/후 진실성 | FE 후보 | C/E | 전 사진 없으면 가짜 전 사진 금지 | 16/16 성공 | photo-ba-ux 실행 기록 | PASS |
| iOS 실행 | 실제 제공 FE | I | 설치·로그인 화면 | Simulator 빌드/실행 성공 | `/tmp/itdasy-t904-ios-10s.png` | PASS |
| Android 실행 | 실제 제공 FE | I | 설치·로그인 화면 | 빌드/실행 8.033초 | `/tmp/itdasy-t904-android.png` | PASS |
| 후보 모바일 전체 흐름 | 후보 FE | I | 후보와 같은 코드 | 모바일이 실제 제공 FE를 읽음 | Capacitor 설정 | NOT VERIFIED |
| 비밀값 검사 | FE/BE/카오스 증거 | K | 실제 비밀 0 | FE 3건은 이름/체크섬 오탐, 새 카오스 증거 0 | gitleaks 출력 | PASS |

## 5. DEFECTS FOUND

| ID | 심각도 | 재현/원인 | 영향 | 수정 | 재검사 |
|---|---|---|---|---|---|
| T904-D01 | P1 Security High | 과거 저장소의 Remove.bg 열쇠가 현재 열쇠와 같음 | 사진 처리 비용·접근 악용 | 업체 회전 필요 | BLOCKED |
| T904-D02 | P1 Privacy High | `user-uploads`가 public | 주소를 아는 사람이 고객 사진 열람 가능 | 비공개 전환+인증 전달 경로 필요 | FAIL |
| T904-D03 | P1 Privacy High | 외부 삭제 확인 없이 탈퇴 완료 표시 | 사용자가 삭제 완료로 오해 | 후보에서 pending 표시·저장 | PASS, 재시도 작업 없음 |
| T904-D04 | P1 Privacy High | 한국 첫 방문에서 Sentry 자동 허용, 확인 실패 때도 허용 | 선택 진단정보 무동의 전송 | 명시 허용 전 항상 OFF | 2개+전체 검사 PASS |
| T904-D05 | P2 | 가입칸이 실제 form이 아니어서 자동완성/Enter가 불안정 | 신규가입 실패·중복 요청 | 표준 form/submit으로 수정 | 5개 검사 PASS |
| T904-D06 | P1 Security High | GitHub Pages에 frame 차단 헤더 없음 | 투명 덮개 클릭 가로채기 | 후보에 시작 즉시 frame guard | 검사 PASS, 실제 배포 전 |
| T904-D07 | P2 | 자동 사진 합성이 사용자의 꽉 채움 선택을 버림 | 흰 띠·미리보기와 발행본 차이 | fitMode를 모든 합성에 전달 | 24개+60출력 PASS |
| T904-D08 | P2 Data loss | 저장소 목록 HTTP 오류를 빈 목록 성공으로 반환 | 탈퇴 사진이 남아도 성공처럼 보임 | 오류로 올려 pending 처리 | 57개 검사 PASS |
| T904-D09 | P2 Security | 격리 증거에 시험 로그인표·전화·메모가 남음 | QA 증거 유출 위험 | 기록 전 가림 처리 | 새 증거 비밀값 0 |
| T904-D10 | P2 Safety | 파괴 시험 대상 확인이 약함 | 잘못된 DB 파괴 위험 | DB 사용자·이름 정확 확인표 추가 | 대상 가드 검사 PASS |
| T904-D11 | P1 Security | 취약 하위 서명 라이브러리 포함 | 서명 공격 위험 | PyJWT로 교체 | 보안 패키지 검사 0 |
| T904-D12 | P2 Reliability | 실행 중인 작업 고리에서 캐시 삭제가 자기 자신을 기다릴 수 있음 | 화면 숫자 갱신 정지 | 별도 짧은 실행으로 분리 | 회귀 검사 PASS |
| T904-D13 | P1 Reliability | 20명 동시 흐름 후 요청들이 90초 끊김 | 예약·환불 결과 불명확 | 미해결 | FAIL |
| T904-D14 | P1 Legal | 실제 정책이 Railway/즉시삭제 등 현재 동작과 다름 | 사용자 고지 불일치 | 별도 후보 문서 작성 | 실제 사이트 미배포 |
| T904-D15 | P3 QA | 사진 시험 원본 선별이 부정확 | 60장 품질 인증 불가 | 수량·분류는 맞췄으나 원본 품질 미달 | NOT VERIFIED |

## 6. SECURITY REPORT

- 다른 매장 접근 변조 357건과 DB 연결 관계 검사에서 누출은 발견되지 않았다.
- 웹훅 무서명·틀린 서명은 20개 매장 모두 거절됐고, 자동응답 동의 OFF에서는 발송하지 않았다.
- 현재 Cloud Run의 민감 설정은 Secret Manager 참조다. 고객센터 Discord 주소도
  `itdasy_support_discord_webhook`으로 옮겼다.
- FE의 3개 비밀값 탐지 결과는 동의 저장 이름 1개와 CocoaPods 체크섬 2개였다.
- 새 카오스 증거 1.57MB는 비밀값 탐지 0건이었다.
- 열려 있는 High: Remove.bg 열쇠 회전, 공개 사진 저장 공간.
- Bandit: High 0, Medium 36. Medium은 고정된 마이그레이션 SQL과 시험/도구의 URL 검사 경고다.

## 7. PRIVACY / LEGAL GAP REPORT

| 실제 동작 | 정책/앱 표시 | 위험 | 필요한 변경 | 상태 |
|---|---|---|---|---|
| Google Cloud Run 사용 | 실제 정책은 Railway 기재 | 사실 불일치 | 후보 정책 배포 | FAIL |
| 외부 업체 삭제는 확인 대기 | 실제 정책은 즉시삭제처럼 표현 | 삭제 완료 오인 | pending·업체별 기간/국가 명시 | FAIL |
| 사진 저장 공간 public | 정책은 안전한 보관으로 이해됨 | 고객 사진 노출 | 비공개 저장+짧은 접근주소 | FAIL |
| Google AI 등 국외 처리 | 국가·시기·방법·보유기간 일부 불명 | 법 필수 고지 판단 필요 | 계약/지역/기간 확정 | LEGAL COUNSEL REVIEW REQUIRED |
| 앱 삭제는 가능 | 웹 삭제 신청 주소는 실제 사이트에 없음 | Play 요구 미충족 | `delete-account.html` 배포·콘솔 연결 | FAIL |
| 선택 오류 진단 자동 허용 | 가입 동의로 대신함 | 선택 수집 동의 부족 | 후보에서 명시 허용으로 수정 | PASS 후보 |

대한민국 개인정보 보호법 제28조의8의 국외이전 고지 항목, Apple의 앱 내 계정삭제 및
제3자 AI 공유 명시 동의, Google Play의 앱 안·웹 양쪽 삭제 경로 요구와 실제 동작을 대조했다.

## 8. MONEY RECONCILIATION

격리 DB 최종값: 사용자 20, 고객 2,628, 예약 476, 매출행 288, 합계 24,775,000원,
DM 180, 시술기록 195, AI 행동 44, 예약게시 47, 댓글 75.

예약-고객, 매출-고객, 매출-예약, 중복 완료 매출, 취소 예약 매출, 같은 처리번호 중복,
회원권 음수, 회원권 잔액-장부 합계 등 15개 규칙의 불일치는 0이다. 환불은 DB에 정확히
한 행 생겼지만 사용자는 90초 뒤 결과를 못 받았다. 장부 불일치는 0이어도 재시도 전에
성공 여부를 확인할 방법이 필요하므로 출시 차단 상태다.

## 9. PHOTO EDITOR REPORT

- AGENT VERIFIED: 60개 출력 파일, 비율별 12개, low 15/high 45, 1080px 출력.
- AGENT VERIFIED: hair 12, nail 12, lash/brow 10, skin 10, salon/product 8,
  before/after 8의 수량.
- AGENT VERIFIED: 전 사진이 없을 때 현재 사진을 흑백으로 복제해 가짜 Before를 만들지 않는다.
- 수정: 사용자가 고른 `cover/contain`을 자동 미리보기·다른 캐러셀 장에도 전달한다.
- 실패 사례: 시험 원본 중 역사 삽화, 건물, 말 사진 등이 섞여 뷰티 홍보물 평가에 쓸 수 없다.
- HUMAN ACCEPTANCE REQUIRED: 손·눈·머리카락·피부·한글·로고의 최종 사람 평가.

## 10. OWNER STYLE BENCHMARK

| 스타일 | 자동 출력 | 일관성 자동 확인 | 실제 원장 평가 |
|---|---:|---|---|
| A 청담 럭셔리 | 10 | 글꼴/색/위치 적용 | HUMAN ACCEPTANCE REQUIRED |
| B 홍대 트렌디 | 10 | 글꼴/색/위치 적용 | HUMAN ACCEPTANCE REQUIRED |
| C 감성 네일 | 10 | 글꼴/색/위치 적용 | HUMAN ACCEPTANCE REQUIRED |
| D 임상적 피부샵 | 10 | 글꼴/색/위치 적용 | HUMAN ACCEPTANCE REQUIRED |
| E 일본 감성 | 10 | 글꼴/색/위치 적용 | HUMAN ACCEPTANCE REQUIRED |
| F Instagram viral | 10 | 글꼴/색/위치 적용 | HUMAN ACCEPTANCE REQUIRED |

이번 60개는 스타일 레이어 주입 시험이다. 여섯 원장의 실제 과거 게시물을 학습한 뒤 새로운
사진에 재현한 시험이 아니므로 실제 원장 스타일 재현을 PASS로 처리하지 않았다.

## 11. PERSONA REPORT

| 사용자 유형 | 확인한 목표 | 결과 |
|---|---|---|
| A 컴퓨터가 익숙하지 않은 원장 | 가입·예약·고객·사진 흐름 | 후보 전체 실제 사용 NOT VERIFIED |
| B 네일샵 | 네일 12출력·SNS 비율 | AGENT VERIFIED, 사람 평가 필요 |
| C 속눈썹/눈썹 | 얼굴·전후 진실성 | 기능 PASS, 동의 흐름 NOT VERIFIED |
| D 헤어샵 | 헤어 출력·색/세로 | 출력 PASS, 색 정확도 사람 평가 필요 |
| E 피부샵 | 과보정·가짜 Before | 가짜 Before 방지 PASS |
| F 신규가입 | 자동완성·Enter | 후보 수정/검사 PASS |
| G 파워사용자 | 1,000+ 고객·동시작업 | 목록 PASS, 부하 FAIL |
| H 불안정망 | 끊김·재시도 | 환불 90초 끊김 FAIL |
| I 여러 기기 | iOS/Android/PC | 실제 제공판 실행 PASS, 후보 NOT VERIFIED |
| J 해지 사용자 | 탈퇴·삭제 | pending 표시 수정, 완전삭제 FAIL |
| K 악의적 사용자 | 번호변조·토큰·웹훅 | 격리 공격 PASS |
| L 실수 많은 사용자 | 더블클릭·새로고침 | 장부 PASS, 일부 실제 화면 NOT VERIFIED |

## 12. REMAINING RISKS

1. 공개 사진 저장 공간과 이미 노출된 Remove.bg 열쇠.
2. 20명 동시 시험 뒤 90초 응답 끊김과 사용자가 성공 여부를 모르는 환불.
3. 계정 탈퇴 후 외부 업체·로그·캐시·백업 삭제 완료를 재시도하고 확인하는 작업 없음.
4. 후보 FE/BE/정책 문서가 실제 주소에 배포되지 않아 실제 제공판과 감사 대상이 다름.
5. 실제 Meta 시험계정의 연결·재연결·실패 발송·재시도 미실행.
6. Apple/Google 상점 표시와 실제 앱 동작 대조 미실행.
7. 유효한 뷰티 사진 60장과 여섯 실제 원장 스타일의 사람 평가 미실행.
8. 백업을 실제 복원한 뒤 구·신 앱 조합 시험 미실행.
9. 업체별 국외 이전 국가·보유기간·계약 근거는 법률 전문가 확인 필요.
