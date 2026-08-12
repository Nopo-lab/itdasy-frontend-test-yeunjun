# ITDASY RELEASE CLOSURE REPORT — 2026-08-12

## 1. FINAL VERDICT

> # RELEASE BLOCKED

코드·DB·배포는 전부 끝났다. 막는 건 **코드 밖 3개**뿐이다.

| # | 막는 것 | 왜 코드로 못 푸나 |
|---|---|---|
| 1 | **Google Play Console / App Store Connect 실물 미확인** | 콘솔 접근 권한이 없다. 제품ID·base plan·가격·RTDN 구독이 코드와 맞는지는 사람이 봐야 한다. |
| 2 | **실기기 모바일 QA 0회** | 실기기가 없다. 로컬 브라우저까지가 한계다. |
| 3 | **DM-003 / DM-004 최종 PASS 판정** | 별도 작업. 이 감사는 충돌·회귀만 확인했다(없음). |

2026-08-12 감사에서 나온 **P0 1건 · P1 2건은 전부 수정·배포·라이브 검증 완료**다.
그 과정에서 새로 발견한 P0급 1건(긴 영수증 결제 500)도 같이 잡았다.

---

## 2. 실제 변경사항

### 백엔드 (`itdasy_backend-test`, 3커밋)

| 파일 | 변경 | 이유 |
|---|---|---|
| `backend/main.py` | 데모 가드를 허용목록 → **차단목록**으로 | 심사관이 핵심 흐름을 하나도 못 돌렸다 |
| `backend/scripts/seed_review_demo.py` | 비밀번호 로그 출력 제거 · plan `pro`→`membership` · 기존 데모 구독도 정정 | 자격증명이 매 기동마다 Cloud Run 로그에 평문으로 쌓였다 |
| `backend/models.py` | `__table_args__` 에 제약·인덱스 6종 추가, `refund_of_id` 에 `ondelete="SET NULL"` | 마이그레이션에만 있어서 새 DB 에 안 생겼다 |
| `backend/scripts/db_bootstrap.py` | PG 전용 DDL 3종 + **패리티 검사(실패 시 exit 1)** | 반쪽 스키마로 기동하면 이중예약이 조용히 통과한다 |
| `backend/alembic/versions/0044_iap_receipt_uq.py` | 영수증 소유자 UNIQUE 2종 (신규) | 1결제 → N계정 유료화 경합 |
| `backend/alembic/versions/0045_iap_token_md5_idx.py` | 0044 의 원문 색인 → **md5 색인** (신규) | 긴 토큰이 결제 직후 500 |
| `backend/routers/iap.py` | `IntegrityError` → 409 · 같은 계정 경합 재시도 | 제약 위반이 500 으로 샜다 |
| `backend/tests/test_release_audit_2026_08_12.py` | 감사 스위트 19개 (신규) | 회귀 고정 |
| `.github/workflows/ci.yml` | **PostgreSQL 17 job 신설** | SQLite 초록은 동시성·FK 를 증명하지 못한다 |

커밋: `a728283` → `38158cc` → `f36a642`

### 프론트 (`itdasy-frontend-test-yeunjun`, 1커밋)

| 파일 | 변경 | 이유 |
|---|---|---|
| `app-customer.js` | `loadMore()` 신설 + `_serverHasMore()` 판정 + 버튼 배선 | 201번째 손님부터 목록에서 볼 방법이 없었다 |
| `css/workspace-v2.css` · `workspace-v2-flow.css` · `itd-editor.css` | 폰트 스택에서 Pretendard 를 앞으로 | iOS·macOS 에서 시스템 폰트가 항상 이겼다 |

커밋: `5d92a93`

### 문서 (루트)

`STORE_SUBMISSION.md` — 약관/개인정보/지원 URL 을 앱이 실제로 여는 `itdasy.com` 으로 통일,
Review Notes 에 "데모 계정이 무엇을 할 수 있고 무엇이 403 인지" 명시, `Pro`→`Membership`.

---

## 3. P0 — 심사용 데모 계정

**문제**: `STORE_SUBMISSION.md` 는 심사관에게 "이 계정으로 핵심 흐름을 테스트하라"고 보내는데,
가드가 허용목록 9개를 뺀 **모든** 쓰기를 403 으로 막았다. Apple 2.1 반려 사유다.

**수정**: 차단목록으로 뒤집었다. 경로는 짐작하지 않고 `app.routes` 열거로 대조했다
(문서에 적혀 있던 `/data-export/delete` 는 **존재하지 않는 경로**라 뺐다).

```
차단: /auth/delete-account · /auth/change-password · /auth/sample/purge
      /subscription/cancel · /subscription/start-trial · /iap/ · /billing/ · /admin/
```

**검증** — `tests/test_release_audit_2026_08_12.py`, PostgreSQL 17:

| 테스트 | 결과 |
|---|---|
| `test_demo_account_can_run_core_flows` — 손님 등록/수정 · 예약 등록/수정 · 매출 등록 | **PASS** (전부 2xx) |
| `test_demo_account_sensitive_mutations_blocked` — 위 8경로 | **PASS** (전부 403) |
| `test_demo_account_cannot_touch_other_shop` — 남의 샵 조회/수정/삭제 | **PASS** (403/404) |

> 검증 방식 주의: `dependency_overrides` 만으로는 **Authorization 헤더가 없어 미들웨어가
> 그냥 통과**한다. 그 상태의 통과는 가드를 증명하지 못한다. 서버의 `create_access_token`
> 으로 진짜 JWT 를 발급해 헤더에 실어서 미들웨어를 실제로 태웠다.

**부수 효과**: 이 미들웨어를 지나가는 요청이 "인증된 모든 쓰기" → "8개 경로" 로 줄었다.
DM-003 교착의 최다 진입점이던 자리다.

---

## 4. P1 — 새 DB 스키마 패리티

**문제**: `Dockerfile` 은 `db_bootstrap && alembic upgrade head` 로 뜬다. 빈 DB 에서는
`create_all` + `stamp head` 라 **마이그레이션에만 있던 제약이 영영 안 생긴다.**

실측 (라이브 DB vs 빈 부트스트랩 DB, `pg_catalog` 전수 비교):

```
수정 전 — 제약 6개 · 인덱스 7개 누락
  excl_booking_user_timerange     ← 예약 시간대 겹침 차단
  uq_booking_user_starts_active   ← 같은 시각 예약 중복 차단
  uq_shop_settings_ig_user_id     ← 인스타 계정 중복 연결 차단
  ck_revenue_refund_negative / ck_revenue_refund_not_self
  fk_revenue_refund_of (ON DELETE SET NULL)
  ix_customers_dup_scan · ix_revenue_user_recorded · ix_revenue_user_customer
  ix_sched_posts_status_at 외
```

**마이그레이션 재생은 불가능하다 — 실측으로 확인했다.**
빈 DB → `create_all` → `stamp 0001_baseline` → `upgrade head`:

```
sqlalchemy.exc.ProgrammingError: (psycopg2.errors.DuplicateColumn)
column "referral_code" of relation "users" already exists
[SQL: ALTER TABLE users ADD COLUMN referral_code VARCHAR(16)]   ← 0002 에서 즉사
```

`0001_baseline` 이 의도적 no-op 이고 0002 부터는 create_all 이전의 옛 스키마를 전제한다.
그래서 `stamp head` 방식 자체는 유지하고, **드리프트가 생길 수 없게** 세 겹으로 막았다.

1. **모델로 표현 가능한 건 전부 모델로** — 이 저장소가 0032·0033 주석에서 이미 쓰던
   "마이그레이션과 모델 **양쪽에**" 규칙을 나머지에도 적용한 것뿐이다.
2. **PG 전용만 DDL 로** — GiST EXCLUDE·표현식 인덱스는 SQLAlchemy 로 선언하면
   SQLite `create_all` 이 깨진다.
3. **끝나고 다시 세서 하나라도 없으면 `exit 1`** (`_assert_parity` + `SchemaParityError`).
   Dockerfile 이 `&&` 로 묶여 있어 여기서 죽으면 uvicorn 이 안 뜨고 옛 revision 이 트래픽을 계속 받는다.

**세 번째 겹이 바로 값을 했다.** 이 라운드의 0044 를 모델에 안 넣었더니 부트스트랩이
`uq_sub_apple_otid / uq_sub_google_token 없음` 으로 죽었다. 원래대로면 새 환경에서
조용히 빠졌을 것이다.

**결과** (라이브 DB 대비 전수 비교):

```
수정 후 — 누락 제약 0건 · 누락 인덱스 0건
```

남은 차이 1건은 `uq_shop_settings_ig_user_id` 가 라이브에선 UNIQUE **제약**,
새 DB 에선 UNIQUE **인덱스** 로 잡히는 것뿐이다. Postgres 는 제약을 인덱스로 구현하므로
동작은 같고, 인덱스 비교에서는 차이가 없다.

---

## 5. P1 — IAP 영수증 계정간 재사용

**문제**: `iap.py` 가 "다른 계정이 이미 쓰나" 를 SELECT 로 보고 upsert 했다(read-then-write).
동시 요청 둘이 각각 '없음' 을 보고 둘 다 통과한다. `subscriptions` 의 UNIQUE 는
`(user_id)` 하나뿐이라 영수증 쪽은 아무것도 막지 않았다.

**적용 전 라이브 실측** — 안전하게 걸 수 있는지부터 확인했다:

```
subscriptions 6행 · original_transaction_id NOT NULL 0건 · purchase_token NOT NULL 0건
중복 그룹 0개 · 빈 문자열 0건   → 기존 데이터 무영향
```

**수정**:
- `0044` — 부분 UNIQUE 2종 (빈 문자열 제외 — Apple 경로에서 `purchase_token` 이 `""` 라
  실값으로 치면 Apple 구독끼리 충돌한다)
- `0045` — `purchase_token` 은 **md5 색인** (아래 §5.1)
- `routers/iap.py` — `IntegrityError` → 409 (SELECT 와 같은 문구), 같은 계정 경합은 1회 재시도
- 중복이 있는 DB 에서 돌면 **자동으로 안 지우고 멈춘다** (돈 기록은 사람이 판단)

**검증** (PostgreSQL 17):

| 테스트 | 결과 |
|---|---|
| Apple 영수증 동시 100발 (계정 A/B 교대) | 유료 소유자 **정확히 1명** · 500 유출 0 |
| Google 토큰 동시 100발 (계정 A/B 교대) | 유료 소유자 **정확히 1명** · 500 유출 0 |
| 같은 계정 재전송 100발 | 구독 **1건** · 전부 200 |
| 임자 있는 영수증을 타 계정이 (순차) | **409** (500 아님) |
| 압축 안 되는 4,000자 토큰 | 저장 **200**, 타 계정 재사용은 **409** |

### 5.1 이 라운드에서 내가 만든 결함 하나 (자체 발견·수정)

0044 의 첫 판은 `purchase_token` **원문**에 btree UNIQUE 를 걸었다. 그게 틀렸다.
`purchase_token` 은 Text 인데 btree 인덱스 행은 2,704바이트를 못 넘는다.
길이가 아니라 **압축 후 크기** 기준이라 실제 토큰처럼 압축이 안 되는 값에서 걸린다.

```
실측 (PostgreSQL 17, 랜덤 영숫자)
  2,000자 → INSERT OK
  2,700자 → OperationalError: index row size 2712 exceeds btree version 4 maximum 2704
  3,000자 → 동일
```

Google 토큰은 보통 300~1,000자라 평소엔 안 걸린다. 그런데 걸리는 순간이 하필
**돈이 이미 오간 직후**다. 스토어 결제는 끝났는데 서버가 500 을 뱉는다.
"확률이 낮다"는 결제 경로에서 PASS 사유가 아니다.

`0044` 를 고쳐 쓰지 않고 `0045` 로 뺀 이유: 0044 는 이미 라이브에 적용됐고
(alembic `0044_iap_receipt_uq`, 인덱스는 원문 색인 — 실측 확인), 적용이 끝난 리비전은
다시 안 읽힌다. **새 리비전만 그 인덱스를 갈아끼울 수 있다.**
0045 는 정의를 보고 판단한다 — 이미 md5 면 건너뛰고, 원문이면 드롭 후 재생성.

라이브 상황을 그대로 재현해서 검증했다:
```
원문 색인 있는 DB → alembic upgrade head
  [0044] uq_sub_google_token 이미 있음 — 건너뜀
  [0045] uq_sub_google_token 원문 색인 제거
  [0045] uq_sub_google_token md5 색인 생성
```

---

## 6. Regression

| 대상 | 결과 |
|---|---|
| SQLite 전체 (= CI `test` job) | **1,717 passed · 25 skipped · 1 xfailed · 0 failed** (35s) |
| PostgreSQL 감사 스위트 | **19 passed** — 같은 DB 연속 2회 모두 19 (멱등) |
| 빈 DB 부트스트랩 | `exit 0` · 패리티 필수객체 19/19 · `alembic current` = head |
| 0044→0045 마이그레이션 | 원문 색인 재현 → md5 교체 확인 |
| CI `test` (GitHub Actions) | **success** |
| CI `security-integrity-postgres` (신규) | **success** — 19 passed |

**레거시 전체 스위트는 PostgreSQL 에서 완주하지 못한다.** 이건 이번 작업과 무관한
기존 문제다 — 내 파일을 `--ignore` 로 빼고도 같은 지점에서 멈춘다. 원인은 여러 테스트가
`sqlite:///:memory:` 로 **자기 엔진을 따로 연다**는 것이다
(`test_revenue_booking_fk.py` · `test_revenue_month_and_delete.py` 등).
프로세스 스택이 `_sqlite3.so` 안에 멈춰 있고, PostgreSQL 쪽엔 잠금 대기가 0건이다.
제품 코드 문제가 아니라 픽스처 문제이며, 별도 정리 대상으로 남긴다.
그래서 CI 의 PG job 은 **PG 에서 의미가 있는 스위트만** 돌린다.

---

## 7. LIVE (배포 후 실측)

```
Backend
  Git SHA          f36a642feb7c2825f05b26047e039b8a80ef2f5e
  /health git_sha  f36a642f                                   ← 일치 ✅
  Cloud Run rev    itdasy-backend-staging-00442-tv4  (traffic 100%)
  ENVIRONMENT      production
  DM 서명          enforce
  BYPASS 계열 env  없음 ✅
  concurrency 12 · minScale 1 · maxScale 7 · cpu 1 · mem 1Gi
  커넥션 예산      7 × (요청 5 + 백그라운드 3 = 8) = 56  ≤ pooler 60 ✅

Database (운영 DB 직접 조회)
  alembic head     0045_iap_token_md5_idx                     ← 일치 ✅
  필수 제약/인덱스  19/19 존재 (누락 0)
  uq_sub_google_token   md5(purchase_token) 색인 ✅
  uq_sub_apple_otid     존재 ✅
  데모 계정 플랜    membership / active / demo  ✅ (pro 에서 정정됨)

Frontend
  Git SHA          5d92a93
  SW CACHE_VERSION 20260812-2246-5d92a93                      ← 일치 ✅
  index.html ?v=   135개 전부 동일값
  app-customer.js  _serverHasMore 포함 (라이브 파일 확인)
  workspace-v2.css font-family: Pretendard, -apple-system, …  ✅
```

**라이브 스모크**

```
노출면    /openapi.json /docs /redoc /admin /debug /metrics  → 전부 404
무인증    /auth/me /customers /revenue /bookings /subscription/status /instagram/status → 전부 401
staging   POST /admin/seed-staging-only → 403
CORS      정상 200 · 오류 401 둘 다 ACAO 헤더 유지 / 악성 Origin → 헤더 0개
보안헤더  HSTS · X-Frame · nosniff · Referrer · Permissions · CSP  6/6
약관      itdasy.com/terms.html · /privacy.html → 200 (본문 확인: 와이투두 Y2do)
```

**프론트 페이지네이션 — 실제 브라우저 측정** (손님 450명 스텁, 로컬 서버)

```
수정 전   클릭 3번 → 200행에서 버튼 사라짐 · 서버 호출 1회
수정 후   클릭 8번 → 450행 전부 · 서버 호출 3회 (offset 0 · 200 · 400)
          손님0001 … 손님0450 · 손님0449(200번째 이후) 목록에 존재 ✅
```

> 한 번 헛짚었다. 처음엔 `_hasMore` 만 보고 판정했는데 그래도 200에서 멈췄다 —
> SWR 캐시 경로가 `_total` 만 복원하고 `_hasMore` 는 false 로 남기기 때문이다.
> 그리고 `?v=` 를 안 올려서 브라우저가 옛 파일을 서빙한 것도 한 번 겪었다.

---

## 8. Remaining UNVERIFIED (외부 접근이 없어서 못 한 것)

| 영역 | 코드/런타임 쪽에서 확인한 것 | 사람이 확인해야 할 것 |
|---|---|---|
| **Google Play Console** | FE `itdasy_membership_monthly_6900` = BE `PRODUCT_TO_PLAN` → `membership` · 패키지 `com.y2do.itdasy` = `GOOGLE_PLAY_PACKAGE_NAME` · `iap_google`·`rtdn_audience` wiring true | 콘솔의 제품ID·base plan·가격·서비스계정·Pub/Sub 토픽·RTDN 구독 |
| **App Store Connect** | 번들 `com.nopolab.itdasy` = `APPLE_APP_BUNDLE_ID` · `iap_apple` wiring true | 콘솔의 제품ID·구독그룹·가격·S2S 알림 URL |
| **실기기 모바일** | 로컬 브라우저 DOM/네트워크 측정까지 | 터치 타깃·safe-area·키보드·실제 렌더 |
| **Instagram 실발송 E2E** | 서명 강제 `enforce` · 스코프 ON · DM 중복 제약 존재 | 승인된 실발송 1회 |
| **Sentry 실제 캡처** | `send_default_pii=False` · `before_send=_scrub_event` · env/release 태그 · wiring true | 운영에 테스트 오류 1건 발사 |
| **알림톡 / SMS** | 코드 완료, `wiring.alimtalk=false`·`wiring.sms=false` | 사업자 계약 (env 넣으면 즉시 동작) |

---

## 9. Remaining P2 (출시를 막지 않음)

| # | 내용 | 상태 |
|---|---|---|
| P2-1 | 레거시 스위트가 PG 에서 완주 못 함 (자체 SQLite 엔진 픽스처) | 별도 정리 — CI 는 PG job 으로 핵심을 덮음 |
| P2-5 | Cloud Run 시크릿 57개가 평문 env (Secret Manager 미사용) | 하드닝 대상 |
| P2-6 | `ITDASY_STAGING_BYPASS_ALL=1` 하나로 rate limit·데모가드·플랜게이트가 전부 풀림. 현재 미설정(실측) | Cloud Run 서비스가 하나뿐이라 "staging 전용" 전제가 성립하지 않음 — 환경 가드 검토 필요 |
| P2-10 | 스토어 앱은 `capacitor.config.json` 의 `server.url` 로 **test-yeunjun Pages** 를 로드하는 얇은 셸. 이 레포에 푸시하면 스토어 사용자에게 즉시 반영된다 | 구조상 사실 — 문서화 필요 |

**해결된 P2**: P2-2 페이지네이션 · P2-3 비밀번호 로그 · P2-4 커넥션 예산(7×8=56) ·
P2-7 약관 URL · P2-8 plan 명칭 · P2-9 Pretendard 순서.

---

## 10. FINAL RELEASE GATE

| Gate | Status | Evidence |
|---|---|---|
| Demo write | **PASS** | `test_demo_account_can_run_core_flows` — 손님·예약 등록/수정·매출 전부 2xx (PG, 실제 JWT) |
| Demo tenant isolation | **PASS** | `test_demo_account_cannot_touch_other_shop` — 403/404 |
| Demo sensitive mutation | **PASS** | `test_demo_account_sensitive_mutations_blocked` — 8경로 403 |
| DB bootstrap parity | **PASS** | 빈 DB → 누락 제약 0 · 인덱스 0 · `_assert_parity` 19/19 · CI PG job success |
| IAP cross-account | **PASS** | Apple/Google 동시 100발 → 소유자 1명 · 500 유출 0 |
| IAP long token | **PASS** | 4,000자 토큰 저장 200 · 재사용 409 (md5 색인, 0045) |
| Authentication | **PASS** | 라이브 무인증 6경로 401 · `test_unauthenticated_is_401` |
| Authorization / IDOR | **PASS** | 손님·매출·예약 3도메인 교차 차단 (PG) |
| Booking race | **PASS** | 동시 20발 → 1건 (GiST EXCLUDE 라이브 존재) |
| Revenue race | **PASS** | 동시 100발 → 1건 (`uq_revenue_user_txn`) |
| Customer race | **PASS** | 동시 30발 → 1명 (`uq_customers_dedup`) |
| CRM scale | **PASS** | 450명 전수 도달 · 2만명 <3초 · 매출 2,500건 합계 정확 |
| DB constraints (live) | **PASS** | 운영 DB 필수 19/19 · alembic `0045` |
| Production config | **PASS** | ENVIRONMENT=production · BYPASS 없음 · DM enforce · 커넥션 56≤60 |
| CORS / 보안헤더 | **PASS** | 오류응답에도 ACAO 유지 · 악성 Origin 차단 · 헤더 6/6 |
| Cache / SW | **PASS** | 빌드ID·SW·`?v=` 135개 완전 일치 |
| Privacy / Terms | **PASS** | 앱 내 링크 200 · 본문 확인 · 스토어 문서와 URL 통일 |
| Regression | **PASS** | SQLite 1,717 passed 0 failed · PG 19 passed · CI 2 job 전부 success |
| Deploy 일치 | **PASS** | Git `f36a642` = `/health.git_sha` = Cloud Run `00442-tv4` · DB `0045` |
| Mobile | **UNVERIFIED** | 실기기 없음 (§8) |
| Google Play Console | **UNVERIFIED** | 콘솔 접근 없음 (§8) |
| App Store Connect | **UNVERIFIED** | 콘솔 접근 없음 (§8) |
| Instagram 실발송 | **UNVERIFIED** | 승인 전 발송 금지 (§8) |
| DM-003 | **IN PROGRESS** | 별도 작업 — 충돌·회귀 없음 확인 |
| DM-004 | **IN PROGRESS** | 별도 작업 — `uq_dm_dedup_claim` 라이브 존재 |

### RELEASE BLOCKED 해제 조건

1. Play Console / App Store Connect 실물 확인 (제품ID·가격·RTDN·구독그룹)
2. 실기기 모바일 QA 1회
3. DM-003 / DM-004 PASS
4. 위 3개 후 §6 회귀 + §7 라이브 스모크 재실행

---

## 부록 — 이번 라운드에서 내가 틀린 것

기록으로 남긴다. 같은 실수를 반복하지 않기 위해서다.

1. **파일을 옮기기 전에 돌린 테스트 결과를 믿었다.**
   `tests/` 로 옮기기 전 SQLite 전체가 초록이라 그대로 푸시했더니
   `no such table: users` 로 CI 가 깨졌고 배포까지 같이 실패했다.
   (배포 게이트가 막아줘서 라이브는 무사했다 — 설계대로 동작한 것이다.)
   → 옮긴 **뒤에** 다시 돌린다.

2. **인덱스를 크기 검증 없이 넣었다.**
   `purchase_token` 원문 btree 색인이 긴 토큰에서 결제를 500 으로 만든다.
   내가 만든 지뢰를 내가 밟아서 찾았다.
   → Text 컬럼에 btree 를 걸 땐 2,704바이트 한계를 먼저 잰다.

3. **`?v=` 를 안 올리고 브라우저 검증을 했다.**
   파일엔 수정이 들어갔는데 브라우저는 옛 파일을 서빙했고, "고쳤는데 그대로" 를
   한참 들여다봤다. `CLAUDE.md` 에 적혀 있는 함정에 그대로 빠졌다.

---
_기준: FE `5d92a93` / BE `f36a642` / Cloud Run `00442-tv4` / DB `0045_iap_token_md5_idx`_
