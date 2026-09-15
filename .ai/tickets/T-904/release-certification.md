# ITDASY 실제 출시 인증 기록 — 2026-09-16

## 1. EXECUTIVE VERDICT

**FINAL VERDICT: RELEASE HOLD**

| 항목 | 개수 |
|---|---:|
| P0 | 0 |
| P1 | 5 |
| P2 | 3 |
| P3 | 1 |
| Critical NOT VERIFIED | 10 |
| Security Critical/High | 2 |
| Privacy Critical/High | 3 |
| Money mismatch | 0 |
| Tenant leakage | 1개 공개 사진 경로 |
| Data-loss path | 1 |

25개 게이트 현재 수: **PASS 6 / FAIL 7 / NOT VERIFIED 10 / BLOCKED 2**.

| 게이트 | 상태 | 현재 증거 |
|---|---|---|
| G1 기능 | NOT VERIFIED | FE 3,220개 실행 성공과 실제 예약→매출 1회만 확인. 모든 기능의 실패·중복·새로고침 조합은 미실행 |
| G2 로그인/세션 | NOT VERIFIED | 이메일·토큰·Apple 실제 서명 검사는 성공, 실제 Apple 계정 로그인 미실행 |
| G3 매장 분리 | FAIL | API/DB 번호 변조 357회는 누출 0이지만 공개 사진 저장소가 매장 경계를 우회함 |
| G4 고객 | PASS | 격리 DB 고객 2,628건과 실제 시험계정 흐름 |
| G5 예약 | PASS | 격리 DB 예약 476건, 실제 완료·정리 흐름 |
| G6 회원권 | PASS | 음수·잔액 불일치 0 |
| G7 돈/장부 | PASS | 장부 규칙 15개 불일치 0 |
| G8 구독 | NOT VERIFIED | 실제 Apple·Google 결제 상점 미실행 |
| G9 Instagram | BLOCKED | 허용된 실제 Meta 시험계정 없음 |
| G10 자동화 동의 | PASS | 동의 OFF 무발송, 위조 요청 거절 |
| G11 AI | NOT VERIFIED | 실패·사용량 복구 검사는 성공, 실제 제공 AI 전체 흐름 미실행 |
| G12 사진 편집 | NOT VERIFIED | 60/60 파일 생성은 성공했지만 원본 선별이 잘못돼 전체 편집 기능·뷰티 품질 인증 불가 |
| G13 원장 스타일 | BLOCKED | 실제 원장 6명의 사람 평가 필요 |
| G14 사진 저장 | FAIL | `user-uploads` 공개 상태 |
| G15 개인정보 | FAIL | 실제 정책·삭제·저장 동작 불일치 |
| G16 법/상점 정책 | FAIL | 웹 삭제 주소 404, 국외이전 세부값 미확정 |
| G17 보안 | FAIL | Remove.bg 열쇠 미교체, 공개 사진 저장소 |
| G18 서버 안정성 | FAIL | 부하 뒤 90초 끊김 |
| G19 DB/복원 | NOT VERIFIED | 실제 백업 복원·구/신 조합 미실행 |
| G20 성능 | FAIL | 동시 흐름 뒤 응답 제한시간 초과 |
| G21 모바일 | NOT VERIFIED | 실제 제공판 실행만 성공, 후보판 미실행 |
| G22 화면 크기 대응 | PASS | iOS/Android/데스크톱 자동 화면 검사 |
| G23 접근성/기본 사용성 | NOT VERIFIED | 자동 검사는 성공, 12명 실제 사람 시험 미실행 |
| G24 운영 감지 | NOT VERIFIED | 요청번호·기본 오류 로그는 확인했지만 결제·저장·작업대기·정기작업 실패 알림 전체는 미실행 |
| G25 사용자 전체 흐름 | NOT VERIFIED | 일부 실제 흐름만 실행, DM 예약 전체 흐름 1개 미검증 |

## 2. EXACT BASELINE

| 대상 | 실제 값 |
|---|---|
| FE 후보 기준 | `db824c047a8760cfb9db5883f544a753d528426c` |
| FE 수정 후보 | `89ee44d` |
| FE 원격 main | `9888ceceb734c37d557becd3facf69ced8900915` |
| FE 실제 제공 빌드 | `20260915-1116-9888cec` |
| BE 후보 기준 | `69b32ac744c2bc6209e6178c5c0c33ae44f6bede` |
| BE 수정 후보 | `88f56e2` |
| BE 실제 제공 SHA | `9850751ebaf79de6709204db4047e588c65ae6ef` |
| BE 원격 main | `ff6253dfd7d34752636830633e52169b7fe63515` |
| Cloud Run | `itdasy-backend-staging-00621-mbg`, 트래픽 100% |
| 서버 환경 | `ENVIRONMENT=production`인 스테이징 서비스 |
| DB 격리 시험 | `itdasy_t904_runner@itdasy_release_t904`, 관리자 권한 없음 |
| Supabase | `hsxxqomfbdernepykils`, `user-uploads` |
| 정책 수정 후보 | `f88e877` |
| DB 표시 이력 | `MIGRATION_APPLIED=20260516-0016-receipt`; 코드 마이그레이션 63개와 불일치 |
| Android | `com.y2do.itdasy` |
| iOS | `com.nopolab.itdasy` |
| 시각 | 2026-09-16 Asia/Seoul |

후보 브랜치와 원격 main의 갈라짐을 마지막에 다시 가져와 확인했다. FE main은 그대로였다.
BE main에는 실제 제공 SHA 뒤 관측 기록 파일 2개만 바꾸는 `ff6253d`가 추가됐고 제품 코드 영향은
없었다. Cloud Run은 계속 `9850751e`/`00621-mbg`를 100% 제공한다. 실제 모바일 앱은
`server.url` 때문에 실제 제공 FE를 읽으므로 후보 FE 수정은 모바일에서 아직 확인되지 않았다.

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
| 화면 전체 자동 검사 | FE 후보 | 공통 | 깨짐 0 | 206묶음, 3,220개 성공 | Jest 출력 | PASS |
| 서버 실행 검사 | BE 후보 | 공통 | 실행 항목 실패 0 | 4,591개 성공 | pytest 출력 | PASS |
| 서버 건너뛴 검사 | BE 후보 | 공통 | 건너뜀 0 | 291개 미실행 | pytest 출력 | NOT VERIFIED |
| DM 예약 전체 흐름 | BE 후보 | A/H/L | 현재 흐름과 기대 일치 | 오래된 기대값이라 1개 예상 실패 처리 | `test_dm_booking_form_autosend.py` | NOT VERIFIED |
| 실제 PostgreSQL 검사 | BE `c38045d`+격리 DB | K/G/L | 권한·장부·삭제 | 211 PASS, 동의 있는 AI 비서 시험 자료로 재검사. 이후 Instagram 동의 버전만 변경 | pytest 출력 | PASS |
| 실제 예약→완료→매출→삭제 | 실제 제공 FE/BE 시험계정 | A/L | 1회 반영 후 정리 | 50,000원 1회, 전부 삭제 | complete-flow 실행 기록 | PASS |
| 다른 매장 번호 변조 | 이전 후보 격리 PostgreSQL | K | 한 바이트도 노출 없음 | API/DB 357회 차단. 공개 사진 경로는 별도 FAIL | `t904-final/result.json` | PASS(이전 후보 증거) |
| 돈·회원권 동시 처리 | BE `c38045d`+격리 PostgreSQL | G/H/I/L | 경제효과 1회 | 211개 DB 검사 PASS; 이후 돈과 무관한 Instagram 동의 버전만 변경. 이전 대량 시험 장부 규칙 15개 위반 0 | pytest+이전 `t904-final/result.json` | PASS |
| 과부하와 재시도 | 이전 후보 격리 PostgreSQL | G/H | 오류가 빨리 보임 | 90초 끊김 다수, 이후 안정성 수정 없음 | `t904-final/evidence.jsonl` | FAIL |
| AI 동의 없는 요청 | FE `89ee44d`/BE `88f56e2` | F/C/I | 전송 전 설명·직접 선택, 계정 혼동 없음 | FE 12개·BE 집중 49개·전체 4,591개 PASS. 브라우저 계정 전환 시 저장 0/재시도 0/400, 같은 계정은 저장 1/재시도 1/200 | `.playwright-cli/page-2026-09-15T15-00-09-824Z.png` | PASS |
| 사진 60장 파일 생성 | FE 후보 | B/C/D/E | 규격·저장 성공 | 60/60, 5비율, 1080px 출력 | `output/photo-editor-realistic-qa-report.json` | PASS |
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
| T904-D04 | P1 Privacy High | 한국 첫 방문 자동 허용과 과거 자동 허용 기록 재사용 | 선택 진단정보 무동의 전송 | 명시 허용 전 OFF, 동의 기록 v2로 교체 | 4개+전체 검사 PASS |
| T904-D05 | P2 | 가입칸이 실제 form이 아니어서 자동완성/Enter가 불안정 | 신규가입 실패·중복 요청 | 표준 form/submit으로 수정 | 5개 검사 PASS |
| T904-D06 | P1 Security High | GitHub Pages에 frame 차단 헤더 없음 | 투명 덮개 클릭 가로채기 | 후보에 시작 즉시 frame guard | 검사 PASS, 실제 배포 전 |
| T904-D07 | P2 | 자동 사진 합성이 사용자의 꽉 채움 선택을 버림 | 흰 띠·미리보기와 발행본 차이 | fitMode를 모든 합성에 전달 | 24개+60출력 PASS |
| T904-D08 | P2 Data loss | 저장소 목록 HTTP 오류를 빈 목록 성공으로 반환 | 탈퇴 사진이 남아도 성공처럼 보임 | 오류로 올려 pending 처리 | 57개 검사 PASS |
| T904-D09 | P2 Security | 격리 증거에 시험 로그인표·전화·메모가 남음 | QA 증거 유출 위험 | 기록 전 가림 처리 | 새 증거 비밀값 0 |
| T904-D10 | P2 Safety | 파괴 시험 주소의 추가값으로 원격 DB를 가리킬 수 있음 | 잘못된 DB 파괴 위험 | 추가 연결값 거절, 실제 주소·포트 확인 | 대상 가드 검사 PASS |
| T904-D11 | P1 Security | 취약 하위 서명 라이브러리 포함 | 서명 공격 위험 | PyJWT로 교체 | 보안 패키지 검사 0 |
| T904-D12 | P2 Reliability | 실행 중인 작업 고리에서 캐시 삭제가 자기 자신을 기다릴 수 있음 | 화면 숫자 갱신 정지 | 별도 짧은 실행으로 분리 | 회귀 검사 PASS |
| T904-D13 | P1 Reliability | 20명 동시 흐름 후 요청들이 90초 끊김 | 예약·환불 결과 불명확 | 미해결 | FAIL |
| T904-D14 | P1 Legal | 실제 정책이 Railway/즉시삭제 등 현재 동작과 다름 | 사용자 고지 불일치 | 별도 후보 문서 작성 | 실제 사이트 미배포 |
| T904-D15 | P3 QA | 사진 시험 원본 선별이 부정확 | 60장 품질 인증 불가 | 수량·분류는 맞췄으나 원본 품질 미달 | NOT VERIFIED |
| T904-D16 | P1 Auth | 새 서명 도구가 Apple 공개키 원본을 받지 못함 | Apple 사용자 정상 로그인 오류 | 공개키 변환·RS256 고정 | 실제 RSA 서명 검사 PASS, 실제 계정 미실행 |
| T904-D17 | P1 Privacy High | 가입 때 AI 동의를 자동 기록하고 과거 기록도 허용 | 동의 없는 외부 AI 전송 가능 | 자동 기록 제거, 2.0 재동의 강제, 확인한 외부 AI 진입점 31곳 차단 | 전체 서버 4,591개 검사 PASS |
| T904-D18 | P2 | 캡션·비서 외 AI 기능은 동의 없음 오류만 보이고 작업 재개가 안 됨 | 원장이 이유를 모르고 같은 작업 반복 | 공통 요청 통로에 안내·저장·1회 재시도 추가 | 실제 브라우저 400→저장 1회→재요청 1회→200 |
| T904-D19 | P2 | 배포 캐시가 새 AI 동의 코드를 이전 파일로 가림 | 수정 배포 후에도 옛 동작 지속 | 공통·캡션·비서 파일 주소 버전 갱신 | 캐시 삭제 없는 새 주소 로드 확인 |
| T904-D20 | P3 | 가입 약관·정책·로그인 링크의 누르는 높이가 14~39px | 모바일에서 잘못 누르기 쉬움 | 모두 최소 44px로 확대 | 390×844 브라우저 실측 PASS |
| T904-D21 | P1 Privacy High | AI 동의창을 연 뒤 계정을 바꾸면 다른 계정에 동의를 저장하고 옛 요청을 다시 보낼 수 있음 | 계정 간 동의 오기록·개인정보 오전송 | 최초 요청의 로그인표를 동의·재시도까지 고정하고 중간 전환 시 중단 | 코드 실행 검사 3개+실제 브라우저 PASS |
| T904-D22 | P1 Privacy High | DM 답변 재생성의 일반 문장이 동의 확인 없이 Gemini를 호출 | 고객 문의 내용 무동의 외부 전송 | 외부 호출 직전에 현재 동의 확인 | 집중+전체 서버 검사 PASS |
| T904-D23 | P1 Privacy High | Instagram 게시물 분석 동의가 모든 AI 기능의 전역 동의도 기록 | 설명하지 않은 사진·음성 처리까지 허용 | Instagram 분석 전용 동의만 기록·검사 | 집중+전체 서버 검사 PASS |
| T904-D24 | P1 Privacy High | Instagram 연결 버튼이 설명·체크 전에 세 종류 동의를 미리 기록 | 명시 선택 없는 동의 기록 | 옛 연결 요청을 무기록 응답으로 바꾸고 설명 화면 체크 뒤에만 저장 | FE/BE 회귀 검사 PASS |
| T904-D25 | P2 QA Safety | 로컬 PostgreSQL 주소가 `127.0.0.1/32`로 보이면 안전 확인이 올바른 대상도 거절 | 격리 시험 중단·검증 공백 | 주소와 주소/범위 표기를 모두 로컬로 확인하되 원격은 계속 거절 | 안전 확인 12개+PostgreSQL 211개 PASS |
| T904-D26 | P1 Privacy High | 과거 앱이 자동 기록한 Instagram 분석 동의 1.0을 새 검사도 인정 | 기존 계정의 게시물이 직접 선택 없이 AI로 전송 가능 | 새 명시 동의만 인정하도록 2.0으로 올리고 1.0 거절 | 집중 49개+전체 서버 4,591개 PASS |

독립 교차검증은 FE `89ee44d`, BE `88f56e2`에서 계정 전환, DM 재생성, Instagram 동의 범위,
연결 전 자동 기록, 과거 1.0 재사용, 격리 DB 원격 차단의 여섯 항목을 모두 PASS로 확인했다.

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
| 선택 오류 진단 자동 허용 | 과거 자동 허용 기록도 인정 | 선택 수집 동의 부족 | 후보에서 기록 v2로 바꾸고 재선택 | PASS 후보 |
| 가입 때 AI 동의 자동 기록 | 가입과 AI 동의를 분리한다고 표시 | 동의 없는 국외 전송 가능 | 자동 기록 제거·첫 사용 2.0 동의·외부 AI 진입점 차단 | PASS 후보 |

대한민국 개인정보 보호법 제28조의8의 국외이전 고지 항목, Apple의 앱 내 계정삭제 및
제3자 AI 공유 명시 동의, Google Play의 앱 안·웹 양쪽 삭제 경로 요구와 실제 동작을 대조했다.
공식 근거:
[개인정보 보호법 제28조의8](https://law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1033215841),
[Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/),
[Apple 계정 삭제 안내](https://developer.apple.com/support/offering-account-deletion-in-your-app),
[Google Play 계정 삭제 요구](https://support.google.com/googleplay/android-developer/answer/13327111),
[Google Play AI 콘텐츠 정책](https://support.google.com/googleplay/android-developer/answer/14094294).

실제 사이트 재확인 결과 개인정보처리방침은 여전히 Railway와 가입 시 일괄 국외이전 동의,
즉시 완전삭제를 적고 있으며 `https://itdasy.com/delete-account.html`은 HTTP 404다.

## 8. MONEY RECONCILIATION

격리 DB 최종값: 사용자 20, 고객 2,628, 예약 476, 매출행 288, 합계 24,775,000원,
DM 180, 시술기록 195, AI 행동 44, 예약게시 47, 댓글 75.

이 대량 수치는 `b5c6f07` 이전 후보에서 얻은 이전 증거이며 결과 파일에 코드 번호가 없다.
현재 돈·회원권 코드가 포함된 `c38045d`에서는 돈·회원권·중복·매장 경계와 마이그레이션을 포함한 PostgreSQL 211개를
다시 실행해 모두 PASS했다. 이전 대량 결과는 현재 AI/DM 경로의 인증 근거로 사용하지 않았다.

예약-고객, 매출-고객, 매출-예약, 중복 완료 매출, 취소 예약 매출, 같은 처리번호 중복,
회원권 음수, 회원권 잔액-장부 합계 등 15개 규칙의 불일치는 0이다. 환불은 DB에 정확히
한 행 생겼지만 사용자는 90초 뒤 결과를 못 받았다. 장부 불일치는 0이어도 재시도 전에
성공 여부를 확인할 방법이 필요하므로 출시 차단 상태다.

## 9. PHOTO EDITOR REPORT

- AGENT VERIFIED: 60개 파일 생성, 비율별 12개, low 15/high 45, 1080px 출력.
- AGENT VERIFIED: hair 12, nail 12, lash/brow 10, skin 10, salon/product 8,
  before/after 8의 수량.
- AGENT VERIFIED: 전 사진이 없을 때 현재 사진을 흑백으로 복제해 가짜 Before를 만들지 않는다.
- 수정: 사용자가 고른 `cover/contain`을 자동 미리보기·다른 캐러셀 장에도 전달한다.
- 실패 사례: 시험 원본 중 역사 삽화, 건물, 말 사진 등이 섞여 뷰티 홍보물 평가에 쓸 수 없다.
- NOT VERIFIED: crop부터 export까지 전 기능을 한 이미지군에서 순서 변경·20회 연속·전부 undo/redo·재열기까지 완주하지 못했다.
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
| C 속눈썹/눈썹 | 얼굴·전후 진실성 | 가짜 Before 방지와 후보 AI 동의 흐름 PASS, 실제 사진 외부처리 NOT VERIFIED |
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
10. DM 예약 전체 흐름 1개가 오래된 기대값 상태로 남아 현재 실제 동작을 인증하지 못했다.
