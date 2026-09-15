# ITDASY 실제 출시 인증 기록 — 2026-09-16

## 1. EXECUTIVE VERDICT

**FINAL VERDICT: RELEASE HOLD**

| 항목 | 현재 값 |
|---|---:|
| P0 | 0 |
| P1 | 2 |
| P2 | 0 |
| P3 | 0 |
| Critical NOT VERIFIED | 11 |
| Critical BLOCKED | 5 |
| Security Critical/High | 2 active / 과거 외부 열쇠 폐기 확인 BLOCKED |
| Privacy Critical/High | 0 known / 외부업체 삭제·국외이전 BLOCKED |
| Money mismatch | 0 |
| Tenant leakage | 0 |
| Data-loss path | 0 under executed scope |
| Unauthorized action path | 0 under executed scope |
| AI silent failure | 0 under executed scope |
| Photo deceptive/harmful defect | 0 agent-found / human acceptance required |

25개 게이트 현재 수: **PASS 9 / FAIL 0 / NOT VERIFIED 11 / BLOCKED 5**.

| 게이트 | 상태 | 현재 증거 |
|---|---|---|
| G1 기능 | NOT VERIFIED | FE 206묶음·3,220개 실행 성공과 실제 예약→완료→매출 흐름 확인. 모든 기능의 모든 오류·다중기기 조합은 미실행 |
| G2 로그인/세션 | NOT VERIFIED | 비밀번호·만료·재사용·계정전환 검사는 성공. 실제 Apple 계정 로그인 미실행 |
| G3 매장 분리 | PASS | 살아있는 다른 매장 번호로 357회 변조 차단, DB 76개 표 직접 접근 차단, 사진 저장소 비공개·만료주소 확인 |
| G4 고객 | PASS | 격리 DB 2,628명과 실제 시험계정 고객 흐름 |
| G5 예약 | PASS | 격리 DB 477건과 실제 완료·매출·정리 흐름 |
| G6 회원권 | PASS | 동시 충전·차감·취소·환불 뒤 음수·잔액 불일치 0 |
| G7 돈/장부 | PASS | 20명 동시 시험과 장부 규칙 15개, 중복 경제효과 0 |
| G8 구독 | NOT VERIFIED | 서버 중복·갱신·환불 검사는 성공. Apple·Google·웹 결제사의 실제 결제 미실행 |
| G9 Instagram | BLOCKED | 허용된 Meta 시험계정과 외부 발송 허용목록 없음 |
| G10 자동화 동의 | PASS | 신규 기본 OFF, 동의 OFF 무발송, 위조·재전송 차단 |
| G11 AI | NOT VERIFIED | 동의·실패·사용량 복구·오류 표시 검사 성공. 모든 실제 제공자와 429/장애 조합 미실행 |
| G12 사진 편집 | NOT VERIFIED | 합성 뷰티사진 60장과 20회 편집·전부 취소/재실행·저장/재열기 성공. 미세 시술 왜곡은 사람 평가 필요 |
| G13 원장 스타일 | BLOCKED | 6개 가상 스타일×10장은 자동 확인. 실제 원장 6명의 참고 게시물과 사람 평가 없음 |
| G14 사진 저장 | PASS | 버킷 비공개, 공개주소 400, 만료주소 200, 삭제 뒤 400. 삭제 실패 시 DB 행 보존과 탈퇴 재시도도 실제 배포 확인 |
| G15 개인정보 | BLOCKED | 코드·정책 주요 불일치는 수정. 외부업체별 실제 삭제·보유기간·국가 증빙 없음 |
| G16 법/상점 정책 | BLOCKED | 최신 공식 요구와 대조 완료. 국외이전·광고 진실성은 법률 전문가 확인 필요 |
| G17 보안 | BLOCKED | 현재 Remove.bg 열쇠와 과거 Google AI 열쇠 1개가 Git 이력 노출값으로 실제 동작. 업체별 폐기 필요 |
| G18 서버 안정성 | PASS | 새 격리 동시 시험 161개 PASS, 0 실패, 83.6초. 저장·AI·웹훅 실패 검사 포함 |
| G19 DB/복원 | NOT VERIFIED | 로컬 격리 DB 실제 백업·복원·되돌림·재적용 성공. 관리형 Supabase 백업 복원 미실행 |
| G20 성능 | NOT VERIFIED | 실제 설정과 같은 동시 8명은 p50/p95/p99 모두 0.03초, 12명은 0.04/0.05/0.05초이고 5xx 0. 100명·10,000사진 규모는 미측정 |
| G21 모바일 | NOT VERIFIED | iOS/Android 빌드·기동 확인. 후보판 전체 실제 사용자 흐름 미실행 |
| G22 화면 크기 대응 | PASS | iOS/Android/데스크톱 자동 화면 검사, 주요 가입 누름영역 44px 실측 |
| G23 접근성/기본 사용성 | NOT VERIFIED | 자동 검사 성공. 실제 12명 사람 시험 미실행 |
| G24 운영 감지 | NOT VERIFIED | 요청번호·구조화 오류·주요 실패 로그 확인. 실제 알림 수신과 대응훈련 미실행 |
| G25 사용자 전체 흐름 | NOT VERIFIED | 12개 가상 사용자 자동 흐름 일부 실행. 실제 사람 12명 전 과정 미실행 |

## 2. EXACT BASELINE

| 대상 | 실제 값 |
|---|---|
| FE 제품 코드 / 제공 소스 | `8e838842741d372ae62f9dee518577d8f079c986` |
| FE 실제 제공 빌드 | `20260915-2008-146567a` |
| FE 주소 | https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/ |
| BE 원격 main | `6866a9d4441c7ccb6c16f0da24b50ec78b60d3d6` |
| BE 실제 제공 SHA | `6866a9d4` |
| Cloud Run | `itdasy-backend-staging-00626-h2n`, 트래픽 100% |
| 서버 환경 | `ENVIRONMENT=production`인 스테이징 서비스 |
| DB 격리 시험 | `kang-yeonjun@127.0.0.1:5432/itdasy_release_t904` |
| 격리 복원 DB | `127.0.0.1:5432/itdasy_t904_restore_20260916` |
| Supabase | `hsxxqomfbdernepykils` |
| Storage | `user-uploads`, `public=false`, 20MB, jpeg/png/jpg/webp |
| DB 변경 이력 | 코드·스테이징 `0066_db_advisor_hardening`; 스키마 대조 `ok` |
| 홍보 사이트 | https://itdasy.com/ · 소스 `838be596` |
| Android | `com.y2do.itdasy` |
| iOS | `com.nopolab.itdasy` |
| 시각 | 2026-09-16 Asia/Seoul |

최종 직전 제품 코드를 다시 가져와 대조했다. FE는 `8e838842`, BE는 `6866a9d4`이며
실제 제공판과 일치한다. 이후 FE main에 합친 인증 문서 변경은 제품 코드를 건드리지 않아
FE 제품 기준 SHA에서 제외했다.

## 3. CAPABILITY MAP

| 기능 | UI | API / DB | 외부 연결 | 로그인·매장 규칙 | 돈 | 개인정보 | 확인한 실패 경로 |
|---|---|---|---|---|---|---|---|
| 가입·로그인·로그아웃 | 로그인·가입·설정 | auth, users, blacklist | 이메일, Apple/Google/Naver | 본인 토큰, 계정전환 고정 | 구독 연결 | 이메일·기기 | 만료·재사용·로그아웃·비번변경 |
| 탈퇴 | 설정·웹 삭제 | user_deletions와 전 사용자 표 | Storage·AI·Meta·메일·오류수집 | 본인만 | 결제열쇠 폐기 | 전 데이터 | 실패 시 pending·정기 재시도 |
| 고객 | 목록·상세·검색·가져오기 | customers, memo, review | SMS/알림 | user_id | 회원권 | 이름·전화·메모 | 중복·변조·대량·삭제 |
| 예약 | 달력·완료·취소 | bookings, treatments | 알림 | user_id | 완료 시 매출 | 일정·시술 | 동시완료·취소·겹침 |
| 매출·회원권 | 매출·회원권 | revenue_records | 결제 | user_id | 직접 영향 | 결제 기록 | 2/10/100회 중복·환불·경합 |
| 구독 | 요금제·해지 | subscriptions, payment_history | Apple·Google·PortOne | 본인 | 직접 영향 | 영수증·결제열쇠 | 재전송·환불·갱신·삭제 |
| Instagram | 연결·DM·댓글·발행 | instagram 설정과 DM/댓글 기록 | Meta | 연결 소유자 | 간접 | SNS 신원·메시지 | 서명·재전송·동의 OFF |
| 자동화 | 설정·예약발행 | rules, scheduled_posts, failed_events | Meta·Cloud Tasks | 사용자 명시 ON | 발행비용 | SNS 자료 | 중복 작업·복구·실패대기 |
| AI 글·비서 | 캡션·대화 | usage/action/generation logs | Google AI 등 | 현재 사용자 동의 | 사용량 | 질문·고객 문맥 | 400/429/500·재시도·계정전환 |
| 사진 편집·스타일 | 작업실·편집기 | workspace/media/style | Storage·Vision·Replicate·Remove.bg | user_id와 소유경로 | AI 사용량 | 얼굴·손·시술사진 | 파일검사·동의·저장·삭제 |
| 알림·고객센터 | 알림·문의 | notifications, support | Push·Discord/Sentry | 본인/관리자 | 환불 연결 | 문의 | 외부 오류·비밀값 가림 |
| 운영 작업 | 화면 없음 | cron, locks, failed events | Cloud Run·Meta | 비밀값과 단일 실행 | 갱신 | 운영 로그 | 중복 실행·재시작·재처리 |

현재 코드에서 FE 버튼 114개, 폼 4개, 전체화면 창 53개, BE 경로 407개를 역추적했다.
Supabase의 앱 표 76개는 RLS가 켜져 있고 익명·로그인 사용자의 직접 읽기/쓰기가 막혀 있다.

## 4. TEST EVIDENCE MATRIX

| 시험 | 환경 | 사용자 유형 | 기대 | 실제 | 증거 | 결과 |
|---|---|---|---|---|---|---|
| FE 전체 자동 검사 | FE `266b84e` 제품 코드 | 공통 | 실패 0 | 206묶음·3,220개 성공 | Jest 출력 | PASS |
| BE 전체 자동 검사 | BE #68 배포판 | 공통 | 실패 0 | 공식 전체 4,615개와 순서섞기 4,615개 성공. 299개 제외·1개 예상 실패는 성공으로 계산하지 않음. 격리 PostgreSQL 214개, 매장분리 172개+99개, FE 연결값도 성공 | GitHub #68 run 35013774867 | PASS |
| 실제 예약→완료→매출→정리 | 스테이징 시험계정 | A/L | 경제효과 1회 | 50,000원 1회, 전부 정리 | 실제 API/UI 기록 | PASS |
| 다른 매장 번호 변조 | 격리 PostgreSQL | K | 노출·변경 0 | 살아있는 번호 357회 차단 | `t904-final/result.json` | PASS |
| 20명 동시 업무 | 격리 PostgreSQL | G/H/I/L | 불일치 0 | 161판정 PASS, 0 실패, 83.6초 | `t904-retest2/verdicts.json` | PASS |
| 돈·회원권 대조 | 격리 PostgreSQL | G/H/I/L | 정확히 1회 | 15개 규칙 위반 0 | SQL 직접 대조 | PASS |
| 사진 저장 실제 흐름 | 스테이징 시험계정·합성사진 | C/D | 공개 차단·허가주소 허용·삭제 | 공개 400 / 허가 200 / 삭제 200 / 이후 400 | 배포 `ff34f3bc`, portfolio id 67 | PASS |
| 삭제 실패 뒤 재시도 가능 | 격리 서버·실제 배포 | H/L | 파일 실패면 DB 행 유지 | 126개 관련 검사와 실제 합성사진 흐름 성공 | BE #67·Cloud Run 00625 | PASS |
| AI 사진 분석 동의 없음 | 실제 BE `6866a9d4` | C/F | 제공자 호출 전 차단 | 로그인 200, 분석 400, `instagram_ai_consent_missing`, 제공자 결과 없음 | 합성 네일사진 실제 요청 | PASS |
| AI 질문 운영기록 최소화 | 실제 BE `6866a9d4` | A | 정상 읽기와 원문 미기록 | 로그인 200, 읽기 200, 질문·`q` 필드 0, 길이·되돌릴 수 없는 지문 존재 | Cloud Run 00626 새 기록 | PASS |
| 합성 뷰티사진 60장 | 실제 FE 편집기 | B/C/D/E | 오류·왜곡·검은화면 0 | 60/60 성공, 5비율 각 12장 | `photo-editor-synthetic-golden-60-v4-report.json` | PASS |
| 20회 편집·전부 취소/재실행 | 실제 FE 편집기 | B/D/L | 저장·재열기 동일 | 전 과정 성공, 262,843바이트 | `t904-editor-operation-matrix.json` | PASS |
| 사진 사람 품질 | 생성 결과 60장 | B/C/D/E | 시술 진실성·미세 왜곡 없음 | 에이전트 시각검사는 이상 없음 | contact sheets | NOT VERIFIED |
| 로컬 백업·복원 | 127.0.0.1 격리 DB | 운영자 | 표·행·버전 보존 | 71표·7행 일치, SHA-256 기록 | `/tmp/itdasy_t904_20260916.dump` | PASS |
| DB 되돌림·재적용 | 복원 DB | 운영자 | 오류·행 유실 0 | 0063→0064→0065 및 0066 되돌림·재적용 성공, 행 수 동일 | 실제 PostgreSQL 명령 출력 | PASS |
| 실제 서버 응답시간 | 격리 PostgreSQL | G/H | 실제 동시 수에서 5xx 0 | 8명 0.03/0.03/0.03초, 12명 0.04/0.05/0.05초 | p50/p95/p99 측정 | PASS |
| DB 보안·속도 진단 | Supabase staging | 운영자 | 공개 확장·중복·누락 경고 0 | 경고 7개 수정 뒤 해당 경고 0 | Supabase advisor 재실행 | PASS |
| 관리형 백업 복원 | Supabase | 운영자 | 복구 가능 | 실행 권한·격리 복원 대상 없음 | 없음 | NOT VERIFIED |
| iOS/Android 기동 | 시뮬레이터·에뮬레이터 | I | 설치·시작 | 양쪽 성공 | 화면 캡처 | PASS |
| 실제 Meta 연결·발송 | 외부 Meta 시험계정 | A/B | 연결·재연결·중복 0 | 시험계정 없음 | 없음 | BLOCKED |

## 5. DEFECTS FOUND

| ID | 심각도 | 재현·원인 | 고객/법·보안 영향 | 수정 | 반영·재검사 |
|---|---|---|---|---|---|
| T904-D01 | P1 Security High | 과거 저장소에 Remove.bg 열쇠가 남음 | 비용·사진처리 계정 악용 | GCP 옛 버전 1 비활성 | 업체 화면 폐기 BLOCKED |
| T904-D02 | P1 Privacy High | 사진 저장소가 공개 | 주소를 아는 사람의 사진 열람 | 비공개+만료주소 | 스테이징 실제 흐름 PASS |
| T904-D03 | P1 Privacy High | 탈퇴 뒤 외부 삭제 실패를 완료처럼 표시 | 삭제 완료 오인 | pending 상태·실패 근거 저장 | 검사 PASS |
| T904-D04 | P1 Privacy High | 오류 진단을 자동 허용 | 선택정보 무동의 전송 | 기본 OFF·v2 재동의 | 전체 검사 PASS |
| T904-D05 | P2 | 가입 입력칸 Enter/자동완성 불안정 | 신규 가입 혼란·중복 | 표준 입력 제출 | FE 검사 PASS |
| T904-D06 | P1 Security High | GitHub Pages 화면 덮기 방어 없음 | 클릭 가로채기 | 시작 즉시 frame 차단 | 실제 배포 PASS |
| T904-D07 | P2 | 사진 꽉 채움 선택 유실 | 흰 띠·발행본 불일치 | fit 설정 전 경로 전달 | 60장 PASS |
| T904-D08 | P2 Data loss | 저장소 오류를 빈 목록으로 성공 처리 | 탈퇴 뒤 사진 잔류 | 오류를 pending으로 전달 | 검사 PASS |
| T904-D09 | P2 Security | 시험 증거에 로그인표·전화·메모 기록 | QA 증거 유출 | 저장 전 가림 | 비밀값 탐지 0 |
| T904-D10 | P2 Safety | 격리 주소 추가값으로 원격 DB 우회 가능 | 잘못된 DB 파괴 | 주소·DB·계정·포트 고정 | 안전검사 PASS |
| T904-D11 | P1 Security | 취약한 서명 하위도구 | 로그인 서명 공격 | PyJWT로 교체 | High 0 |
| T904-D12 | P2 Reliability | 실행 중 작업이 자기 자신을 기다림 | 화면 갱신 정지 | 별도 짧은 실행 | 회귀 PASS |
| T904-D13 | P1 Reliability | 이전 동시 시험에서 90초 응답 끊김 | 결과 불명확 | 풀·작업 경로 보완 | 새 161판정 모두 PASS |
| T904-D14 | P1 Legal | 정책의 호스팅·삭제 설명이 실제와 다름 | 잘못된 고지 | 정책·약관·삭제 페이지 수정 | itdasy.com 실제 확인 PASS |
| T904-D15 | P3 QA | 첫 60장 원본에 비뷰티 그림 포함 | 품질 판정 불가 | 뷰티 합성 60장 재구성 | 에이전트 확인 PASS |
| T904-D16 | P1 Auth | Apple 공개키 변환 오류 | Apple 로그인 실패 | 변환·RS256 고정 | 실제 서명 PASS, 계정 흐름 미확인 |
| T904-D17 | P1 Privacy High | 가입 때 AI 동의 자동 기록 | 무동의 AI 전송 | 자동 기록 제거·31개 진입점 차단 | 전체 BE PASS |
| T904-D18 | P2 | AI 동의 없음 뒤 작업 재개 불가 | 같은 작업 반복 | 안내·저장·1회 재시도 | 실제 브라우저 PASS |
| T904-D19 | P2 | 배포 캐시가 새 동의 코드를 가림 | 옛 동작 지속 | 파일 주소 버전 갱신 | 실제 제공판 PASS |
| T904-D20 | P3 | 약관·정책 누름영역 14~39px | 모바일 오동작 | 최소 44px | 390×844 실측 PASS |
| T904-D21 | P1 Privacy High | 동의창 중 계정전환 시 다른 계정에 기록 | 계정 간 오전송 | 최초 로그인표 고정 | 실제 브라우저 PASS |
| T904-D22 | P1 Privacy High | DM 답변 재생성이 동의 없이 AI 호출 | 고객 문의 무동의 전송 | 호출 직전 동의 확인 | 전체 BE PASS |
| T904-D23 | P1 Privacy High | Instagram 분석 동의가 모든 AI 동의도 기록 | 설명하지 않은 처리 허용 | 전용 동의로 분리 | 전체 BE PASS |
| T904-D24 | P1 Privacy High | 연결 버튼이 선택 전에 동의 기록 | 명시 선택 없는 동의 | 체크 뒤에만 저장 | FE/BE PASS |
| T904-D25 | P2 QA Safety | 로컬 DB 주소 표기 차이로 안전검사 오판 | 격리 검사 중단 | 로컬 표기 정상화 | 12개+PG PASS |
| T904-D26 | P1 Privacy High | 과거 자동 동의 1.0 재사용 | 기존 계정 무동의 처리 | 2.0만 허용 | 실제 BE PASS |
| T904-D27 | P2 QA Safety | GitHub 내부 DB를 운영 DB로 오인 | 돈·권한 검사 중단 | 사설 시험주소만 허용 | CI PASS |
| T904-D28 | P2 QA | 검사 두 묶음이 같은 사용자 번호 사용 | 순서에 따라 실패 | 번호 영역 분리 | 순서섞기 PASS |
| T904-D29 | P1 Security High | 앱 표를 Supabase에서 직접 호출 가능 | 서버 권한 우회 가능 | 76표 직접 권한 차단 | 실제 DB 확인 PASS |
| T904-D30 | P1 Money | 웹 자동결제 갱신 실행·중복 방어 부족 | 중복 청구·구독 누락 | 기본 OFF·처리번호·갱신 작업 | 자동 검사 PASS, 실제 결제 미확인 |
| T904-D31 | P1 Consumer | 홍보 사이트 체험기간·가격·신뢰문구 오류 | 결제 오인 | 10일·실가격·근거없는 문구 제거 | itdasy.com PASS |
| T904-D32 | P1 Privacy High | 스타일 사진 분석이 동의 전에 AI 호출 | 고객 사진 외부 전송 | 2.0 동의 선확인 | 실제 BE 400 PASS |
| T904-D33 | P1 Data loss | 개별 사진 삭제가 저장소 실패를 무시 | DB만 지워 영구 고아파일 | 실패 시 행 보존·404 재시도 성공 | #67 병합·실제 배포·합성사진 삭제 PASS |
| T904-D34 | P1 Privacy High | 탈퇴 후 삭제 실패 자동 재시도 없음 | 사진·외부자료 장기 잔류 | 매시간 재시도·실패 대기열 | 관련 검사·#68 공식 검사·Cloud Run 00626 배포 PASS |
| T904-D35 | P1 Privacy High | AI 질문 원문이 운영 기록에 남음 | 고객 질문·문맥 장기 노출 | 길이와 되돌릴 수 없는 지문만 기록 | 질문 원문 없음·49개 검사와 실제 새 서버 기록 PASS |
| T904-D36 | P1 Reliability | 빈 DB가 먼저 새 열을 만든 뒤 변경 이력이 같은 열을 다시 추가 | 새 서버 기동 실패 | 존재 확인 뒤 필요한 열만 추가 | 실제 PostgreSQL 되돌림·재적용 PASS |
| T904-D37 | P1 Privacy High | 서버 여러 대가 같은 탈퇴 재시도를 동시에 집음 | 외부 삭제 중복·제한 초과 | DB에서 한 서버만 30분 점유 | 두 서버 동시 실행, 외부 호출 각 1회 PASS |
| T904-D38 | P1 Privacy High | 외부업체의 빈 답변·알 수 없는 답변도 삭제 완료 취급 | 자료가 남아도 완료 오인 | 확인된 완료값만 인정 | 관련 114개 PASS |
| T904-D39 | P2 Security/Performance | DB 확장이 공개 영역에 있고 외래열 색인 5개 누락·중복 1개 | 공격면 확대·대량 조회 지연 | 전용 영역 이동, 5개 추가, 중복 제거 | Supabase 실제 진단 경고 7→0 |
| T904-D40 | P1 Privacy High | AI 요청문과 사진저장·인스타·DM·알림 등 외부업체 오류 원문을 서버 기록·사용자 오류에 노출 | 전화번호·고객 설명·업체 응답·주소 속 열쇠 노출 | 내용은 제거하고 상태번호·오류 종류·길이만 기록, 사용자에게 행동 가능한 공통 문구 표시 | 공식 전체·순서섞기 각 4,615개와 실제 새 서버 기록 PASS |
| T904-D41 | P1 QA/Money | 돈 관련 검사 파일 3개가 문법 오류라 전체 검사 수집 중단 | 중복 매출·상한·환불 회귀가 실행되지 않을 수 있음 | 깨진 오류문구 3줄 복구 | 돈 관련 53개와 공식 전체·순서섞기 검사 PASS |
| T904-D42 | P1 Security/Privacy | 과거 시험 결과 4개에 로그인표 200개, 그중 이메일 포함 40개가 저장됨 | 시험계정 로그인정보·이메일 이력 노출 | 원시 결과 4개 제거, 저장 전 가림과 재유입 검사 추가 | 현재 결과 폴더 로그인표·이메일·비밀번호 0; Git 이력은 별도 폐기 확인 필요 |
| T904-D43 | P1 Security High | 4월 Git 이력의 Google AI 열쇠 1개와 현재 Remove.bg 열쇠가 실제 업체 API에서 200 응답 | 무단 AI 사용·비용·사진 처리 계정 악용 | 현재 파일에서 제거, 나머지 주요 스테이징 열쇠는 교체 확인 | Google·Remove.bg 업체 폐기 BLOCKED |
| T904-D44 | P2 QA/DB | 고객 소개관계 변경 검사가 DB 색인을 지운 뒤 복구하지 않아 공식 검사가 순서에 따라 실패 | 새 후보판의 DB 검증 결과를 신뢰할 수 없음 | 소개관계 변경 단계가 단일·복합 색인을 모두 복구하고 존재를 직접 검사 | 재현 17개와 격리 PostgreSQL 전체 214개 PASS, 공식 DB 검사 PASS |

## 6. SECURITY REPORT

- IDOR/BOLA: 살아있는 다른 매장 ID로 고객·예약·매출·사진·AI·Instagram·검색·수정·삭제를 공격했고 누출 0.
- 저장소: `user-uploads` 비공개. 만료주소만 접근 가능하며 삭제 뒤 새 요청은 400이다.
- 입력 공격: SQL 주입, 저장형/화면 XSS, 경로조작, MIME 위장, 과대파일, EXIF 제거 검사를 실행했다.
- 로그인: 만료·폐기·로그아웃·비밀번호변경·계정삭제 토큰을 거절한다.
- 웹훅: 무서명·틀린 서명·재전송을 차단하고 정상 서명을 대조군으로 확인했다.
- 비밀값: 현재 QA 결과에서 로그인표·이메일·비밀번호 0. Cloud Run은 Secret Manager 참조.
- Git 전체 이력 검사에서 758건을 찾았다. 722건은 과거 격리 시험 로그인표, 30건은 시험값 포함 일반 열쇠 모양, 5건은 Google 열쇠 모양, 1건은 Hugging Face 열쇠 모양이다.
- 현재 스테이징의 Gemini·Meta·로그인서명·DB·Supabase 열쇠는 과거값과 달랐다. 과거 Meta 3개와 Hugging Face 1개는 실제 업체에서 거절됐다.
- 과거 Google AI 열쇠 1개와 현재 Remove.bg 열쇠는 실제 업체에서 200 응답을 받았다. Google 열쇠는 현재 접근 가능한 두 GCP 프로젝트 목록에는 없어 이 계정에서 폐기할 수 없었다.
- 남은 High: Google AI와 Remove.bg 열쇠를 업체 화면에서 폐기하고, 과거 Supabase/R2 열쇠도 업체 화면에서 폐기 증거를 확보해야 한다.
- 배포 뒤 Supabase 진단에는 High/Warning이 없고, 직접 접근을 막기 위해 정책을 두지 않은 76개 표와 아직 사용 기록이 없는 색인만 INFO로 남았다. 참고: [RLS 정책 없음 진단](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [미사용 색인 진단](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
- 공격은 소유한 스테이징·격리 환경에서만 수행했다.

## 7. PRIVACY / LEGAL GAP REPORT

### 실제 데이터 흐름

| 정보 | 출처·목적 | 저장 | 외부/국가 | 보유·삭제 | 상태 |
|---|---|---|---|---|---|
| 원장 이름·이메일 | 가입·로그인 | users | 메일·로그인업체 | 탈퇴 시 익명화 | 코드 PASS |
| 고객 이름·전화·메모 | 예약·고객관리 | PostgreSQL | 알림업체 가능 | 탈퇴·고객삭제 | 실흐름 일부 PASS |
| 예약·시술·매출 | 운영·장부 | PostgreSQL | 결제·알림 | 법정 보유 확인 필요 | LEGAL COUNSEL REVIEW REQUIRED |
| 고객 사진 | 편집·홍보물 | Supabase Storage | AI/사진처리업체 | 개별삭제·탈퇴 접두사 삭제 | 업체 보유 BLOCKED |
| Instagram 신원·DM | 연결·자동응답 | PostgreSQL | Meta | 연결해제·탈퇴 | 실제 Meta BLOCKED |
| AI 질문·결과 | 생성·재시도 | 사용량/결과 일부 | Google AI 등 | 업체별 기간 미확정 | BLOCKED |
| IP·기기·오류 | 보안·장애대응 | 로그/Sentry | Google Cloud/Sentry | 실제 기간 미확정 | BLOCKED |
| 결제·영수증 | 구독·환불 | PostgreSQL | Apple/Google/PortOne | 법정 기간 미확정 | LEGAL COUNSEL REVIEW REQUIRED |

최신 확인 근거:

- [개인정보 보호법 제28조의8](https://law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1033215841): 이전 항목·국가·시기와 방법·받는 자·목적·보유기간·거부 방법 고지.
- [Apple 계정 삭제 안내](https://developer.apple.com/support/offering-account-deletion-in-your-app): 앱 안에서 계정과 관련 개인정보 전체 삭제를 시작할 수 있어야 함.
- [Google Play 계정 삭제 요구](https://support.google.com/googleplay/android-developer/answer/13327111): 앱 안과 외부 웹 경로 모두 필요.
- [Google Play AI 콘텐츠 정책](https://support.google.com/googleplay/android-developer/answer/14094294): 기만적 AI 콘텐츠 방지와 사용자 신고 기능 요구.

코드와 웹 정책의 큰 불일치는 수정됐지만, 외부업체 계약상 국가·삭제·보유기간과
스토어 실제 기재값은 접근할 수 없었다. 해당 판단은 **LEGAL COUNSEL REVIEW REQUIRED**다.

개인정보 사고 훈련은 코드·문서 탁상 검토만 했다. 사진+전화번호 노출 시 사용자 범위 조회,
주소 폐기, 로그인표 폐기는 가능하지만 실제 알림·신고 담당자 호출은 미실행이다.

## 8. MONEY RECONCILIATION

격리 DB 새 동시 시험 최종값:

- 사용자 20
- 고객 2,628
- 예약 477
- 매출행 291, 합계 24,750,000원
- DM 로그 180
- 시술 195
- AI 행동 44
- 예약 게시 47
- 댓글 작성자 기록 77

예약-고객, 매출-고객, 매출-예약, 중복 완료 매출, 취소 예약 매출, 같은 처리번호 중복,
회원권 음수, 회원권 잔액-장부 합계 등 15개 규칙의 불일치는 0이다. 같은 거래를 2·10·100회
동시에 보낸 경로는 DB의 처리번호까지 대조해 경제효과가 한 번만 남았다.

Apple·Google·PortOne의 실제 돈 이동은 실행하지 않았으므로 G8은 NOT VERIFIED다.

## 9. PHOTO EDITOR REPORT

- **AGENT VERIFIED**: 60개 합성 뷰티 사진. Hair 12, Nail 12, Lash/Brow 10,
  Skin 10, Salon/Product 8, Before/After 8.
- **AGENT VERIFIED**: portrait, landscape, 1:1, 4:5, 9:16 각 12개.
- **AGENT VERIFIED**: high 45, low 15. 검은 화면·늘어짐·잘림·파일 오류 0.
- **AGENT VERIFIED**: crop/rotate/brightness/contrast/saturation/temperature/sharpness/
  skin/background/text/logo/template/ratio/undo/redo/reset/save/reopen/export 연결.
- **AGENT VERIFIED**: 실제 편집기에서 20회 연속 조정→전부 취소→전부 재실행→초기화→
  초기화 취소→저장→재열기 성공.
- **AGENT VERIFIED**: 전 사진이 없을 때 현재 사진 복제로 가짜 Before를 만들지 않음.
- 삭제 직후 아주 짧게 기존 만료주소가 200인 한 번의 전파 지연을 관측했다.
  새 요청은 즉시 400, 3초·10초와 기존 주소 재검사는 400이었다.
- **HUMAN ACCEPTANCE REQUIRED**: 손톱 모양, 속눈썹 수, 머리카락 경계, 피부 질감,
  실제 염색색, 미세 과보정과 소비자 오인 가능성.

## 10. OWNER STYLE BENCHMARK

| 스타일 | 새 입력 | 에이전트 자동 확인 | 사람 평가 |
|---|---:|---|---|
| A 청담 럭셔리 | 10 | 색·글꼴·배치 적용 | HUMAN ACCEPTANCE REQUIRED |
| B 홍대 트렌디 | 10 | 색·글꼴·배치 적용 | HUMAN ACCEPTANCE REQUIRED |
| C 감성 네일 | 10 | 색·글꼴·배치 적용 | HUMAN ACCEPTANCE REQUIRED |
| D 임상적 피부샵 | 10 | 색·글꼴·배치 적용 | HUMAN ACCEPTANCE REQUIRED |
| E 일본 감성 | 10 | 색·글꼴·배치 적용 | HUMAN ACCEPTANCE REQUIRED |
| F Instagram viral | 10 | 색·글꼴·배치 적용 | HUMAN ACCEPTANCE REQUIRED |

60개는 정의한 가상 스타일을 템플릿에 적용한 결과다. 실제 원장 6명의 기존 게시물을
참고해 처음 보는 사진에서 같은 샵 느낌을 재현한 시험이 아니므로 G13을 통과 처리하지 않았다.

## 11. PERSONA REPORT

| 사용자 | 목표·실행 | 완료/혼란/개선 |
|---|---|---|
| A 50대 원장 | 가입→예약→고객→사진 | 자동 흐름 일부 PASS, 실제 사람 시간·탭 수 미확인 |
| B 네일샵 | 하루 여러 홍보물 | 네일 12장·SNS 비율 PASS, 미감 사람 평가 필요 |
| C 속눈썹/눈썹 | 얼굴·전후 사진 | 동의와 가짜 Before 방지 PASS, 초상권 고지 법률 확인 필요 |
| D 헤어샵 | 세로·색 정확도 | 헤어 12장 출력 PASS, 실제 염색색 사람 비교 필요 |
| E 피부샵 | 피부보정·과장 방지 | 가짜 Before 방지 PASS, 미세 과보정 사람 평가 필요 |
| F 신규가입 | 사전지식 없이 첫 가치 | Enter·자동완성·동의 흐름 PASS, 실제 사람 미실행 |
| G 파워사용자 | 1,000+ 고객·다중작업 | 2,628고객·20명 동시 시험 PASS |
| H 불안정망 | 제한시간·재시도 | 저장·AI·장부 재시도 PASS, 실제 3G 기기 미실행 |
| I 여러 기기 | PC+iOS+Android | 세 환경 기동 PASS, 동시 실제계정 전체 흐름 미실행 |
| J 해지 사용자 | 해지·탈퇴·재가입 | 중복방지·pending 표시 PASS, 실제 상점 환불 미실행 |
| K 악의적 사용자 | 다른 매장 ID·토큰·재전송 | 357회 변조·토큰·웹훅 공격 PASS |
| L 실수 많은 사용자 | 연타·뒤로·새로고침·종료 | 돈·사진 작업 회귀 PASS, 전 화면 실제 조작 미실행 |

## 12. REMAINING RISKS

1. Git 이력에 노출된 Google AI 열쇠 1개와 Remove.bg 열쇠가 실제로 동작하며 업체 화면 폐기가 필요하다.
2. 실제 Meta 시험계정 연결·재연결·댓글·DM·실패·재시도를 실행하지 못했다.
3. Apple·Google·PortOne 실제 결제·환불·해지와 스토어 표시를 대조하지 못했다.
4. 실제 원장 6명의 참고자료와 사람 평가가 없다.
5. 외부업체별 국외이전 국가·보유기간·삭제 계약은 법률 전문가 확인이 필요하다.
6. Supabase 관리형 백업을 격리 프로젝트에 실제 복원하지 못했다.
7. 실제 설정과 같은 동시 수의 p50/p95/p99는 측정했지만 100명·10,000사진 규모는 측정하지 못했다.
8. 실제 12명 사용성·접근성 시험과 사고 알림 대응훈련을 실행하지 못했다.
