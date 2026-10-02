# 잇데이 출시 마감 보고서 (2026-10-01)

> 작업 레포: 프런트 `Nopo-lab/itdasy-frontend-test-yeunjun` 브랜치 `ccr-d5f1311f-u6e0c1` · 백엔드 `Nopo-lab/itdasy_backend-test` 브랜치 `ccr-d5f1311f-be`.
> 모든 검증은 **이 컨테이너의 로컬 스택**(로컬 백엔드 sqlite + 실제 PostgreSQL 16 + Chromium 390px)에서 했다. 운영 서버·운영 DB·실발송·실결제·배포·스토어는 건드리지 않았다.
> 재개 지점·환경 명령은 `STATE.md`. 감사 원본(발견·근거·측정)은 세션 스크래치 `scratchpad/results/*.json`, 증거 스크린샷/로그는 `scratchpad/evidence/<영역>/`(개인정보 없음, 레포에 커밋하지 않음).

## 1. 최종 판정

| 범위 | 판정 | 근거 |
|---|---|---|
| 핵심 운영 동선(고객 → 예약 → 시술/완료 → 매출/회원권 → 재방문 → 통계) | **VERIFIED (로컬)** | §4 동선 E2E + PG 동시성 테스트. 돈 무결성 P0 0건, P1 전부 수정 |
| 콘텐츠 동선(사진 → 전후 합성 → 템플릿 → 캡션 → 저장/내보내기) | **VERIFIED (로컬, AI 성공 경로는 mock)** | 작업실 P1 4건 수정, 시나리오 스크립트·QA 17/17. 실제 발행 비율(pad) 은 2차 수정 진행 중 |
| 인스타 문의(댓글/DM 수신 → 분류 → 초안 → 수동 전송 → 고객/예약 연결) | **VERIFIED (합성 웹훅) / 실 Meta BLOCKED** | 서명·중복·page_id 귀속·게이트 전부 합성 payload 로 확인. 발송 실패와 예약 생성 분리(inbox-01)는 2차 수정 진행 중 |
| 첫 사용·계정·세션 | **VERIFIED (로컬)** | 계정 전환 잔존 0, 만료 시 잠금화면, 비밀번호 변경 도달 가능. 소셜 로그인 실계정은 BLOCKED |
| 멀티테넌트 격리 | **VERIFIED (하네스 110 케이스 + 교차 실측)** | 2매장 교차 접근 전 영역 404. 하네스가 모든 마운트 라우터를 자동 추출 |
| 성능 | **개선·측정됨 (로컬)** | 부팅 API 43→24, 문서 로드 2→1, 로그인 직후 홈 ∞→1.1s, 달력 최대 longtask 370→200ms |
| 모바일 UX | **부분** | 거짓 빈 상태·재시도·키보드/터치는 P1 수정, 44px 터치·키보드 보정은 2차 수정 진행 중 |
| 앱 빌드·IAP·스토어 | **BLOCKED** | Xcode/Android SDK·서명키·스토어 콘솔·샌드박스 결제가 이 컨테이너에 없다. 서버 측 IAP 멱등 테스트는 기존 회귀로 통과 |
| 운영 배포 | **미실행** | 두 브랜치 모두 PR 전. 백엔드 `main` 머지 = 즉시 운영 배포이므로 리뷰 필수 |

한 줄로: **로컬/격리 검증 완료, 외부 연동(Meta·결제·실기기·스토어) 검증 미완료.** 출시 준비 완료가 아니라 "코드 수정·격리 검증 완료 → PR 리뷰 → 스테이징 배포 → 외부 검증" 단계다.

## 2. 실제로 달라진 점 (원장 체감)

- **홈이 홈답게 보인다.** 인스타를 안 연결한 매장에서 홈 전체를 덮던 "인스타만 연결하면…" 카드가 사라지고 오늘 예약·문의·고객 메시지가 바로 보인다. 안내는 위쪽 한 줄 띠(✕로 닫으면 로그아웃해도 다시 안 뜸). AI 동의 카드는 한 줄 요약만 보이고 "나중에"가 있다. 쿠키 배너는 작아져 탭바 위에 앉는다.
- **로그인하면 홈이 바로 그려진다.** 부팅 직후 로그인하면 스켈레톤만 영원히 남던 문제 제거.
- **돈이 두 번 빠지지 않는다.** 매출 저장이 타임아웃돼 다시 눌러도 매출 1건·회원권 1회 차감. 부분 환불된 매출을 환불액보다 작게 못 바꾸고, 만료된 회원권은 어느 경로로도 차감되지 않는다.
- **작업실에서 만든 전후 합성본이 사라지지 않는다.** 저장한 글을 다시 열어도 구성이 유지되고, 2번째 카드를 편집하면 2번째 카드가 열린다. AI 캡션이 실패해도 "나중에 이어서하기"가 보이고 뒤로가기해도 작업이 남는다. 사진 업로드가 실패하면 서버의 사진을 지우지 않는다.
- **예약 화면이 거짓말을 안 한다.** 로드 실패/로딩 중에 "오늘 0건"을 보여주지 않고 로딩/오류+다시 시도를 보여준다. 노쇼 처리된 자리에 새 예약을 잡을 수 있다. 영업시간·휴무가 예약 폼에 반영된다. 자정~오전 9시 예약이 홈 "오늘의 예약"에서 빠지지 않는다.
- **캡션이 없는 사실을 지어내지 않는다.** 가격·할인·예약시간·지점 문장은 원장이 입력한 것만 남는다. 5개 진입 경로가 같은 규칙을 쓴다. AI 실패를 4번씩 자동 재시도하지 않는다(과금 4배 방지).
- **설정에서 비밀번호를 바꿀 수 있다.** 샵 이름을 바꾸면 헤더에 바로 반영된다.
- **빨라졌다.** 콜드 부팅 API 호출 43→24, 첫 방문 이중 부팅 제거, 지연 로드 4.3MB 가 홈 그리기와 경쟁하지 않는다.

## 3. 주요 수정

### 3.1 프런트 (커밋 8)
| 커밋 | 문제 | 원인 | 수정 | 검증 |
|---|---|---|---|---|
| `c4e246f` | 손님 예약 확정 링크·관리자 페이지가 **운영(이름만 staging) 백엔드**로 감 | `1e8a261` 이 3개 독립 HTML 을 빠뜨림 | 테스트 백엔드로 통일, 토큰 키 파생 일치, 가드 테스트 확장 | `api-target-local-only` 24 PASS, Playwright 로 확정 링크 응답 200 |
| `232d4a3` | 로그인 직후 홈 영구 스켈레톤(P1) · 다른 경로로 만든 손님이 재진입 목록에 없음(P1) · 모바일 고객 편집 모달이 상세 뒤(P1) | `_inFlight` 가드가 refresh 를 버림 · `_fetchFresh` 가 비교 전에 `_cache` 를 덮음 · z-index 10010<10600 | pending 큐 재렌더 · 순수 조회 + 호출자 대입 · z 토큰 사다리 | 22 테스트(수정 전 실패) · 390px 재검증 hv5 1.1s · 모달 저장 OK |
| `1238fd3` | 타임아웃 재시도 시 매출 2건·회원권 이중 차감(P1) · 달력 거짓 "0건"(P1) · 영업시간 미반영(P2) · 월뷰 longtask | 호출마다 새 `client_txn_id` · 로드 상태 없음 · 죽은 저장 키 · 강제 레이아웃 | 의도 단위 키 · `_fetchState` + 재시도 · `shopHours` 정본 · rAF 분리 | 28 테스트 · 재클릭 시 서버 1건 · 500 주입 시 오류+재시도 · longtask 370→200ms |
| `6918ac8` | 합성본 소실(P1) · 카드 혼입(P1) · 캡션 전 소실(P1) · 빈 사진 upsert(P1) | 구성 미저장 · 편집 대상 outs[0] 고정 · close 에 저장 없음 · `_complete` 무시 | 구성 저장/역산 · 카드 단위 편집 · 조용한 임시저장 · upsert 보류 | 52 테스트 · smoke 9/9 · multipair QA 17/17 |
| `5c73422` | 부팅 API 43건·이중 부팅·지연 그룹 경쟁·AI 실패 4회 재시도 | 프리페치 3계층 · SW 첫 설치 리로드 · idle 기준 선로딩 · 5xx=과금 전 가정 | 단일 소유자 · `_swHadController` · 홈 뒤 선로딩 · `ai_*` 재시도 금지 · 로그아웃 미전송 가드 | 33 테스트 · API 24 · 문서 로드 1 · requests=1 |
| `e603778` | `use_persona` 미전송·안내문을 캡션으로 표시·환각 재료 주입 | 진입점마다 복제된 payload 빌더 | 공통 빌더/통로, 사실 출처는 원장 문구뿐 | 27 테스트(24 실패→통과) · route mock 네트워크 캡처 |
| `57b509d` | **홈 상단 가림(원장 지적)** | 홍보 카드가 홈 대체·닫음이 로그아웃에 지워짐 · 동의 카드 영구 · 배너 8초 재팝업 | 띠+✕(계정별 보존) · 한 줄 요약/나중에/결정 후 숨김 · 배너 축소·탭바 위·`_cardHandled` | 14 테스트 · 390px 재검증(로그아웃/재로그인 유지, 10초 후 팝업 0) |
| `6c0c010` | 환불 호출 401→강제 로그아웃(P1) · 저장 직후 목록 사라짐(P1) · 자정~9시 예약 누락(P1) · 비밀번호 변경 도달 불가(P1) | 인증 헤더 없는 직접 호출 · 읽기 세대 없음 · UTC 문자열 비교 · 허브에 행 없음 | 공용 경로+401 판정 좁힘 · `_mutGen` · KST 달력일 · 허브 행 | 39 테스트 · 390/1440 재검증 |

### 3.2 백엔드 (커밋 5)
| 커밋 | 문제 | 수정 | 검증 |
|---|---|---|---|
| `57aec85` | 확정 메시지가 늘 "내일", 연결 고객 이름 미사용 | KST 달력일 기준 오늘/내일/모레, 연결 고객 이름(테넌트 한정) | 13 테스트 + 로컬 서버 실측 |
| `ce50080` | `/persona/generate` 가 LLM 대기 내내 DB 커넥션 점유(P1) · 가격/할인/시간/지점 환각 백스톱 없음(P1) · 레거시 안내문이 한도 소진 · 502/504 자동 재시도 · 페르소나 403 열거 | 매 LLM 호출 전 `release_db` · `scrub_ungrounded_commercial_sentences` · 환불+status · `Retry-After` · 404 통일 | 62+5 테스트(59 실패→통과), checkedout 1→0 프로브 |
| `9ae2965` | 노쇼가 같은 시각 UNIQUE 를 점유(P1) · 작업실 upsert FK 무검증·사진 전체 삭제 · 하네스가 /storage 미추출 | 0070 인덱스 정본화 · `owned_or_none`·409 `photos_would_be_cleared` · 추출 범위·INVARIANT-2b/5b · memo 마커 보존 | 하네스 110(0 skip), PG 0070 왕복, 9 마커 테스트 |
| `55b5710` | 부분환불 매출 축소로 음수 장부 · 방문 컬럼 경로별 상이 · 만료 회원권 차감 · 검색 NUL 500 | FOR UPDATE+하한 400/409 · `touch_visit` 단일 헬퍼 · `membership_ledger` 만료 정본 · `_strip_nul` | 24 sqlite + 5 PG(실패→통과), 관련 700+ 회귀 통과 |
| `4a9f10c` | **재고 +/- 가 PG 에서 100% 500**(P1) · 웹훅 APP_SECRET 없으면 fail-open(P1) · 잇비 등록=방문 1 · 쿼리 NUL | `CASE` 클램프 · enforce 면 처리 안 함 · visit 0 · `_strip_nul` | PG 테스트가 옛 코드에서 실패·새 코드 통과, 5 테스트 |

### 3.3 2차 수정 (백엔드 3커밋 + 프런트 1커밋 — 완료 / 프런트 FE-F·FE-G 진행 중)

**백엔드 `e046d47` fix(inbox)** — flow-inbox-dm-comments 01(P1)/03/04/06
- [전송] 중 DM 발송만 실패해도 예약은 이미 생성 → 재전송이 "이미 예약이 있어요" 를 손님에게 보내던 사고: `action_result_id` 를 예약과 **같은 트랜잭션**에 저장하고, 재전송은 같은 예약으로 발송만 재시도(502 본문에 "예약 #N은 만들어졌어요"). 액션 실패는 `{ok:false, code:'action_failed'}` 로 **발송 안 함**(send/send_edit 같은 계약).
- 잇비 "DM 자동응답 켜줘" 가 승인 게이트를 우회해 enabled=True 저장 → 이후 설정 저장 403 갇힘: `has_consent` 없으면 `ok:false consent_required`(끄기는 항상 허용). **되돌리기(undo)** 로 켜는 것도 같은 검사(리드 추가, 수정 전 실패 재현).
- 웹훅 순서 역전: `DMMessageLog.external_received_at`(payload timestamp, alembic 0071) + 큐·스레드·대화 로그·24h 창 정렬 `coalesce(external_received_at, received_at)`.

**백엔드 `29e5fcb` fix(robustness)** — backend-robustness 02/03
- 문자열 NUL(0x00) → PG 500(13개+ 경로): `schemas/base.InputModel` 을 **109개 요청 본문 모델 전부** 상속(재귀 제거). `app.routes` 전수 가드 테스트(허용목록 0). dict 본문 3곳은 핸들러에서 `strip_nul_deep`. 실제 PG 67요청 → 500: 0.
- 발행 워커·IG 토큰 갱신이 Meta 대기 중 bg 풀 커넥션을 'idle in transaction' 으로 점유: 스냅샷/튜플로 뜨고 `release_db` 후 await, 저장은 샵별 짧은 세션. PG `pg_stat_activity` 테스트로 0 확인. 크론 락 폴백은 error 로그 + `/health wiring.cron_lock_fallbacks`.

**백엔드 `c921655` fix(money,publish,sample)** — money-integrity 05/06 · flow-revenue-stats-ui-03 · flow-workspace-photo-04(P1) · flow-account-firstrun-04
- 같은 멱등키 + 다른 본문(고객·금액·대상)이면 409 `txn_body_mismatch`(매출 생성/환불·회원권 충전/차감, 빠른 경로+IntegrityError 경로). 실측 전: 50,000 충전 뒤 같은 키로 99,000 → 200/잔액 그대로(조용히 버림).
- `record_revenue=false` 충전행(0원)이 '시술 1건' 으로 세어져 객단가가 반으로 — 목록·summary·일별 cnt 공통 규칙 `_is_counted_sale`.
- 고객 상세 응답에 `membership_balance/active/expires_at` → '회원권 N만원' 라벨이 실제로 뜸.
- **발행 crop → pad**: 단일 2:3→1:1 중앙 crop, 캐러셀 전부 4:5 crop 으로 전후 합성본 BEFORE/AFTER 가 잘리던 것 → 허용 범위(4:5~1.91:1) 안은 그대로, 밖은 흰 여백 pad, 캐러셀은 첫 장 비율 통일. Pillow 로 뱃지 보존 잠금.
- `GET /auth/sample/status` + purge 가 샘플 고객의 예약까지(멱등). 로컬 실측: 11건 → purge → 0, 두 번째 0건.

**프런트 `03f135c`** — 위 백엔드 계약의 프런트 쪽
- DM 큐: 실패 토스트/카드 유지/예약 생성은 `booking_id` 로만, "예약 #N 은 이미 만들어졌어요" 배지.
- 설정 허브 **샘플 데이터 지우기** 행(샘플이 남아 있을 때만 표시 → 확인 → purge → 캐시 비움·재조회·토스트, 실패면 행 유지). jest 7건.
- 작업실 결과 미리보기 칸 비율 = 발행 규칙(캐러셀 첫 장 비율 통일, 결과물 contain+흰 바탕). 기존 '장마다 실비율' 테스트를 새 계약으로 갱신(+경계 clamp 2케이스).

**진행 중(워크플로 재실행)**: FE-F 44px 터치 영역·키보드 가림, FE-G 작업실 `clear_photos` 계약·렌더러 메모리·P3, 감사 3영역(perf-backend·build-iap-native·past-defects-regression). 1차 실행은 세션 한도로 중단돼 재실행함.

## 4. 검증 결과

### 4.1 자동 테스트 (최종 수정 후 재실행)
| 검사 | 명령 | 환경 | 대상 | 결과 |
|---|---|---|---|---|
| 프런트 단위/소스가드 | `npx jest` | node 22, jsdom | `6c0c010` | **255 suites / 3,585 tests PASS** (기준선 228/3,363) |
| 프런트 린트/스모크 | `npm run lint:ci` · `npm run smoke` · `npm run audit:overlay` | node 22 | `6c0c010` | 0 errors / 175 warnings · 통과 · 오버레이 73 미등록 0 |
| 백엔드 단위/통합(sqlite) | `pytest -q tests` | python 3.11 venv | `55b5710` 직전 트리 | **4,998 passed · 311 skipped · 1 xfailed** (15m21s). seed 스크립트 변경 되돌려 실패 3→0 |
| 백엔드 PostgreSQL 통합 | `pytest -q tests/pg` (ITDASY_PG_URL) | PG 16.14 로컬 | 같은 트리 | **231 passed** (4m06s) + 리드 PG 테스트 1 |
| 테넌트 하네스 | `pytest tests/test_tenant_isolation_harness.py` | sqlite | `9ae2965` | 110 passed, SKIP 0 |

> skipped 311 은 기존 PG 전용·환경 조건 스킵(기준선 301). xfail 1 은 기존 예상 실패. PASS 수에 섞지 않았다.

### 4.2 동선 E2E (Chromium 390×844, 로컬 스택)
| 동선 | 결과 | 근거 |
|---|---|---|
| A 로그인 → 홈 → 설정 저장 → 로그아웃 → 다른 계정 → 잔존 0 | VERIFIED | account-firstrun verified_ok 13건, `home-top/*.png` |
| B 고객 305명 페이지네이션 누락/중복 0 → 추가 → 중복 409 안내 → 상세 → 수정 → 예약 생성 → 취소 → 같은 시각 재예약 201 | VERIFIED | customers-bookings verified_ok 17건, PG 동시 20발 1/19 |
| C 예약 완료 동시 5발 → 매출 1행 · 취소 → 환불행 · 회원권 충전/차감 동시 20발 1회 · KST 00:10/23:50 경계 | VERIFIED | money-integrity verified_ok 16건(PG), 리드 재검증 |
| D 사진 2쌍 → 전후 합성 → 템플릿 → 저장 → 재진입 복원 → 2번 카드 편집 → 캡션 실패 시 보존 | VERIFIED | `fe-c-wsphoto/final-*.log`, smoke 9/9, QA 17/17 |
| E 합성 웹훅(서명·중복·page_id) → 큐 → 전송 실패가 성공으로 안 보임 → 예약 확정 전송이 고객·예약 생성 | VERIFIED(합성) | inbox verified_ok 15건 |
| F 홈 오늘 예약(00:30/08:30/21:45 KST 3건 = BE 3건) · 생일 줄 · 띠/카드 닫힘 유지 | VERIFIED | `fe-e/home_verify_390.log`, `home-top/06-relogin` |
| 손님 예약 확정 링크 → 로컬 백엔드 → 확정 응답 200 | VERIFIED | `evidence/booking-confirm-valid.png` |

### 4.3 과거 결함 이력 재검증 (§6)
| 항목 | 판정 | 근거 |
|---|---|---|
| 회원권 충전 멱등/중복 | VERIFIED | 같은 키 동시 20발 → 1회(PG·sqlite) |
| 고객 페이지네이션 누락/중복·정렬 | VERIFIED | limit 3~500 전수 순회 0건 |
| 직접 매출 경로 재방문 반영 | FIXED+VERIFIED | `touch_visit` 단일 헬퍼, 역행 없음 |
| NUL 입력 500 | 부분 FIXED | 고객/예약/매출 본문·검색 쿼리는 통과. 나머지 13개 본문 경로는 2차 수정(BE-D) 진행 중 |
| DB 풀 포화·세션 반환 | 부분 FIXED | 캡션 경로 release_db(checkedout 0). 백그라운드 루프 2개는 2차 수정 진행 중 |
| IG page_id 폴백 | VERIFIED | 모르는 recipient 는 어느 샵에도 저장 안 됨 |
| 공개 스토리지·테넌트 캐시 | VERIFIED | 캐시 키 전부 user_id, /storage 는 user_id 스코프(하네스 편입) |
| AI 429/타임아웃/복구 | VERIFIED+개선 | 429 Retry-After·120초 UX·실패 환불, 502/504 재시도 금지 |
| 스케줄러 중복 실행 | 부분 | 락/리스 존재. 락 획득 실패 시 폴백 로그 강화는 2차(BE-D) |

## 5. 성능 전후 (같은 조건, 로컬 390px, 3회 중앙값)
| 항목 | 전 | 후 | 조건 |
|---|---|---|---|
| 콜드 부팅 API 호출 | 43건(중복 2~4회) | 24건 | 무스로틀, 토큰 선주입 |
| 문서 로드 횟수(첫 방문) | 2 (build.txt 불일치 로컬은 4) | 1 | SW 첫 설치 |
| navigation→홈(.hv5) 무스로틀 | 2,563ms | 1,837ms | 첫 방문 |
| Fast 3G 첫 진입(페이지+SW 공정 조건) | 24,356ms | 21,734ms | 180KB/s 공유 정적서버 |
| 로그인 직후 홈 렌더(부팅 1.5s 후 로그인) | 영영 안 그려짐 | 1,111ms | 390px |
| 예약 달력 월뷰 최대 longtask | ≈370ms (합 675) | ≈200ms (합 655) | CPU 4x, 예약 200건 |
| 월뷰 칩 표시 시점 | 565ms | 271ms | 동일 |
| 지연 그룹 선로딩 시작 | load 직후(홈 전) | 홈 뒤·API 유휴 후, 3g 는 photo 제외 | — |
| 화면 재진입 10회 누수 | — | Nodes 7289→7286, 리스너 741→740, heap +0.27MB | 누수 없음(수정 전후 동일) |
| 백엔드 핵심 GET p50 (데모 데이터, sqlite 로컬) | — | /customers 12ms · /bookings 6ms · /revenue 7ms | 참고치. 대량 데이터 PG 측정은 2차 감사(perf-backend) 진행 중 |

한계: 로컬 수치이며 운영 SLA 가 아니다. 한글 셰이핑 비용이 큰 달력 합계는 목표(<400ms) 미달 — 칩 마크업 단순화는 디자인 결정 필요.

## 6. 남은 문제와 승인 필요 사항

### 6.1 진행 중(2차 워크플로)
§3.3 참조. 완료되면 §3/§4 갱신.

### 6.2 수정하지 않은 발견 (심각도 · 영향 · 조건)
| ID | 심각도 | 내용 | 조건 |
|---|---|---|---|
| flow-account-firstrun-02 | P2 | 신규 가입자가 온보딩(업종·샵 이름)을 못 봄 — 서버 임시 이름이 완료로 간주됨 | 제품 결정(온보딩 플로우 재노출) |
| flow-workspace-photo-07(워크플로판) | P2 | 큰 사진 반복 투입 시 렌더러 메모리 누적 | FE-G 진행 중 |
| mobile-ux-04 | P3 | 대비 미달 색 하드코딩 226곳 | FE-F 일부 |
| tenant-isolation-04 | P3 | 문서/코드 괴리(결정적 이미지 캐시 키) | 문서 |
| money-integrity 보고의 `routers/assistant.py:5711` 등 컬럼 직독 | P3 | 원장 우선으로 이미 보정됨 | — |

### 6.3 승인·외부 필요 (BLOCKED)
- Meta 실발송·실웹훅(승인된 테스트 수신처 필요), Apple/Google 샌드박스 결제·구독 복원, 실기기 빌드(Xcode/Android SDK·서명키), 스토어 콘솔 가격/상품 확인, 운영 DB 제약 실존 확인(`excl_booking_user_timerange` 등 — 배포 전 `alembic current` 와 0070 적용 점검), 운영 환경변수(`INSTAGRAM_APP_SECRET`, `DM_WEBHOOK_REQUIRE_SIGNATURE=enforce`) 확인.
- 0070 마이그레이션은 중복 행이 있으면 중단한다. 배포 전 1회: `SELECT user_id, starts_at, COUNT(*) FROM bookings WHERE deleted_at IS NULL AND status IN ('confirmed','completed') GROUP BY 1,2 HAVING COUNT(*)>1;` → 0건 확인.
- 제품 결정: 캡션 실패 즉시 영속(현재는 저장 버튼 + 닫을 때 임시저장), 달력 칩 마크업 단순화, 온보딩 재노출.

## 7. 배포 상태와 복구 방법
| 단계 | 상태 |
|---|---|
| 코드 수정 | 완료(프런트 8커밋·백엔드 5커밋 푸시) + 2차 진행 중 |
| 테스트 | 프런트 전부 통과 · 백엔드 sqlite/PG 전부 통과(최종 수정 후 재실행 필요 — 2차 완료 시) |
| 스테이징(테스트 사이트) 반영 | **미반영** — PR 생성·리뷰·main 머지 후 GitHub Pages 자동 배포(`deploy.yml` 이 `?v=`·`build.txt` 자동 범프) |
| 백엔드 배포 | **미반영** — `main` 머지가 곧 Cloud Run 배포. 마이그레이션 0070 은 기동 시 자동(중복 시 중단) |
| 운영 승격·앱 빌드·스토어 | 미실행 |

복구: 프런트는 GitHub Pages 이전 커밋으로 `main` 되돌리기(revert) → 자동 재배포. 백엔드는 Cloud Run 이전 리비전 트래픽 100% 복귀 + `alembic downgrade 0069`(0070 은 인덱스 재생성만이라 데이터 손실 없음). 0070 downgrade 도 중복 검사 후 옛 조건으로 재생성한다.
