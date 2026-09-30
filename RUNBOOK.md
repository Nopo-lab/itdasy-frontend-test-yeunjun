# 잇데이 운영 런북

> 장애가 났을 때 **뭘 보고 뭘 누를지**. 당황한 상태에서 읽는 문서라 짧게 썼다.
> 여기 적힌 명령·수치는 전부 2026-08-01 스테이징에서 **실제로 해보고** 확인한 것이다.

---

## ⚠️ 먼저 — 서비스 이름이 바뀌었다 (2026-09-30 확인)

이 문서의 옛 판(2026-08-01)은 `itdasy-backend-staging` 하나가 모두를 서빙한다고 적었다.
**지금은 둘로 나뉘었다**(백엔드 레포 README · `scripts/ops_guard_check.py` · 배포 워크플로 기준).

| 용도 | Cloud Run 서비스 | 주소 | DB | 배포 |
|---|---|---|---|---|
| **운영** | `itdasy-backend-prod` | https://itdasy-backend-prod-zzd4ktuxgq-du.a.run.app | Supabase `itdasy-staging` (hsxxqomfbdernepykils) — 이름만 staging | 수동 (`itdasy_backend` 레포는 2026-08-04 보관됨) |
| 테스트 | `itdasy-backend-test` | https://itdasy-backend-test-644329093453.asia-northeast3.run.app | Supabase `itdasy-test` (pgsvvcjrifbidwpwfdst) | `itdasy_backend-test` main 푸시 = 자동 |

아래 명령은 전부 `SVC` 변수를 쓴다. **장애 대응은 운영부터.**

```bash
export SVC=itdasy-backend-prod      # 테스트를 볼 땐 itdasy-backend-test
export REGION=asia-northeast3 PROJECT=itdasy-495513
export B=https://itdasy-backend-prod-zzd4ktuxgq-du.a.run.app
```

| 옛 DB | — | — | Supabase `beauty-platform` (wlwauinqvmegnqdtbrtg) — 쓰는 서비스 없음 | — |

🏷️ **Supabase 이름 바꾸기 (헷갈림 방지, 5분)** — 이름만 바뀌고 주소(고유번호)·접속·코드는 그대로다.
1. Supabase 대시보드 → 프로젝트 `itdasy-staging` → Settings → General → Project name 을 `itdasy-prod` 로
2. `beauty-platform` → `itdasy-old-archive` · `itdasy-test` 는 그대로
3. GitHub 이 레포 → Settings → Secrets → Actions: `SUPABASE_LIVE_DB_URL` 에 옛 `SUPABASE_STAGING_DB_URL` 과 **같은 값**,
   `SUPABASE_ARCHIVE_DB_URL` 에 옛 `SUPABASE_PROD_DB_URL` 과 같은 값을 넣는다
4. Actions → Supabase Daily Backup → Run workflow → 로그에 `LIVE 주소 출처: SUPABASE_LIVE_DB_URL (운영 ref 일치)` 확인
5. 확인되면 옛 시크릿 2개 삭제. 이후 문서의 `itdasy-staging` 표기는 `itdasy-prod` 로 읽으면 된다

✅ **백업은 운영 DB 를 뜨고 있다 (2026-09-30 근거 3개).** `supabase-backup.yml` 의 LIVE 가 `hsxxq…` 다.
① 백엔드 `dev/local_env_guard.py`(9/23)가 `hsxxq…` 를 "운영 Supabase" 로 적는다
② 9/28 커밋으로 테스트 서비스가 새 DB `itdasy-test` 로 떠났다
③ 그 뒤에도 LIVE 백업 크기가 매일 늘어난다(9/25 1,153,371 → 9/29 1,155,474 바이트).
남은 한 가지: 콘솔 권한 있는 사람이 아래 명령으로 **눈으로 한 번** 확인하면 추정이 아니라 사실이 된다.

```bash
# 운영 서비스가 쓰는 DB 호스트 — 값이 Secret Manager 참조면 그 시크릿의 최신 버전을 본다
gcloud run services describe $SVC --region=$REGION --project=$PROJECT \
  --format='yaml(spec.template.spec.containers[0].env)' | grep -A3 DATABASE_URL
# 결과의 프로젝트 ref 가 hsxxqomfbdernepykils 여야 한다. 다르면 supabase-backup.yml 의 LIVE_REF 와 시크릿을 운영 DB 로 바꾼다.
```

---

## 0. 30초 안에 상황 파악

| 확인 | 어디서 |
|---|---|
| 서버 살아있나 | `$B/health` → `{"status":"healthy"}` (운영 주소는 맨 위 표) |
| AI 살아있나 | 같은 주소 `/ai-health` → `api_key_fallback_ready:true` · `fallback_fail:0` |
| 지금 뭐가 막혀있나 | admin → **🚀 출시 첫날** 맨 위 빨간 카드 |
| 사용량·원가 | 같은 화면. 상한 사용률 90% 넘으면 빨강 |
| 알림 이력 | [Uptime Alert 실행 기록](https://github.com/Nopo-lab/itdasy_backend-test/actions/workflows/uptime-alert.yml) |

**감시는 두 겹이다 — 성격이 다르다:**

| 수단 | 실제 주기 | 알림 |
|---|---|---|
| GCP Uptime Check `itdasy-backend-staging-health` ⚠️ 옛 이름 — **운영 주소(`itdasy-backend-prod`)를 보고 있는지 콘솔에서 확인** | **5분 (보장됨)** · 3개 대륙 | GCP 콘솔 인시던트. Discord/이메일은 알림 채널 연결 필요 |
| GitHub Actions `Uptime Alert` | cron 은 `*/5` 지만 **실측 약 1시간** | Discord 웹훅 (즉시) |

⚠️ **Actions cron 은 5분이 아니다.** 실측(2026-08-01): 11:00 → 12:08 → 13:53 → 14:58 → 16:08
= 약 1~1.2시간 간격. private 레포라 러너가 크게 밀린다. Actions 만 믿으면 장애를 최대
**70분 늦게** 안다. 그래서 GCP Uptime Check 를 따로 뒀다(무료, 5분 보장).

🔴 **연준님 1회 작업**: GCP 콘솔 → 모니터링 → 알림 → 알림 채널에 이메일 추가 후 **인증 메일 클릭**.
그래야 "잇데이 백엔드 다운 (5분 감지)" 정책이 실제로 통보한다. 지금은 콘솔에만 뜬다.
(이메일 인증은 사람이 클릭해야 해서 자동화 불가)

---

## 1. 서버가 안 뜬다 (`/health` 실패 · 🚨 알림)

1. **Cloud Run 콘솔**에서 리비전 상태 확인
   [콘솔 열기](https://console.cloud.google.com/run/detail/asia-northeast3/itdasy-backend-prod/metrics?project=itdasy-495513)
2. 최근 배포가 원인 같으면 **이전 리비전으로 롤백**:
   ```bash
   gcloud run services update-traffic $SVC \
     --region=asia-northeast3 --project=itdasy-495513 --to-revisions=<이전리비전>=100
   ```
   리비전 목록: `gcloud run revisions list --service=$SVC --region=$REGION --project=$PROJECT`
3. 롤백해도 안 되면 **DB 쪽 의심** — `/health` 는 DB 핑이 실패해도 503 을 준다(`main.py:1366`).
   Supabase 대시보드에서 인스턴스 상태 확인.

⚠️ **알림이 안 왔는데 죽어 있는 경우**: cron 이 밀렸거나 워크플로가 깨진 것.
과거에 YAML 파싱 실패로 알림이 아예 안 돈 적 있다(2026-07-31). Actions 화면을 직접 볼 것.

---

## 2. 서버는 뜨는데 AI 만 실패 (캡션·잇비만 안 됨)

`/health` 200 인데 `/ai-health` 의 `fallback_fail > 0` 이거나 `api_key_fallback_ready:false`.

1. **원인 확인** — GCP 콘솔 → Vertex AI 쿼터. 429 가 쌓이면 여기가 원인.
2. **길어지면 기능만 끈다** (서비스 전체는 살린다):
   ```bash
   gcloud run services update $SVC \
     --region=asia-northeast3 --project=itdasy-495513 \
     --update-env-vars FEATURE_CAPTION=off
   ```
   원장님에겐 "캡션 만들기를 잠시 점검 중이에요 🙏" 가 뜬다.
3. **복구**:
   ```bash
   gcloud run services update $SVC \
     --region=asia-northeast3 --project=itdasy-495513 \
     --remove-env-vars FEATURE_CAPTION
   ```

**실측(2026-08-01)**: 반영까지 새 리비전 배포 **약 40초**. 캡션만 503 이 되고
잇비·`/health` 는 200 유지 — 기능별로 격리된다.

| 끄고 싶은 것 | env |
|---|---|
| 잇비 | `FEATURE_ASSISTANT=off` |
| 캡션 | `FEATURE_CAPTION=off` |
| 누끼 | `FEATURE_REMOVEBG=off` |
| AI 이미지 3종 | `FEATURE_IMAGE_AI=off` |
| **전체 점검 모드** | `MAINTENANCE_MODE=1` |

---

## 3. AI 비용이 튄다

1. admin **🚀 출시 첫날** → "오늘 누적" 과 "상한 사용률" 확인
2. 상한이 안 걸려 있으면 지금 건다:
   ```bash
   gcloud run services update $SVC \
     --region=asia-northeast3 --project=itdasy-495513 \
     --update-env-vars ITDASY_DAILY_COST_CAP_KRW=50000
   ```
   넘으면 AI 호출이 429 로 막히고 "오늘 AI 사용량이 많아 잠시 쉬어가요" 가 뜬다.
3. **특정 기능이 범인이면** 그것만 끈다(위 2번 표).

🔥 **누끼 원가 순서 (2026-09-30 백엔드 PR #107)**

| 순서 | 경로 | 장당 | 켜는 조건 |
|---|---|---|---|
| 1 | Replicate `cjwbw/rembg` | 약 5원 | `REPLICATE_API_TOKEN` |
| 2 | fal BiRefNet v2 | 약 1~2원 | `FAL_KEY` 가 있을 때 |
| 3 | Remove.bg | 250~310원(구독) · 최대 1,780원(종량제) | **기본 꺼짐.** `REMOVEBG_FALLBACK_DAILY_MAX` 에 양수를 넣을 때만 |

- 로그 `[NUKKI] Replicate 실패, 다음 경로로` 가 반복되면 Replicate 상태를 본다. fal 이 받아주는 동안은 원장님 화면은 멀쩡하다.
- 1·2 둘 다 실패하면 원장님은 "잠시 후 다시" 안내를 받는다. 급하면 Remove.bg 를 잠깐 켠다:
  `--update-env-vars REMOVEBG_FALLBACK_DAILY_MAX=30,REMOVEBG_FALLBACK_UNIT_KRW=300` (끝나면 `--remove-env-vars`).
- PR #107 적용 전 서버라면: Remove.bg 폴백이 무제한으로 돌고 원가 상한에 1.4원으로 잡힌다 → `REMOVEBG_API_KEY` 를 비워 끊는다.

---

## 4. 인스타(Meta) 가 안 된다

- **연동은 되는데 발행이 안 됨** → 정상이다. `content_publish` 가 심사 중이라
  앱이 발행 버튼 대신 "캡션 복사해서 직접 올려주세요" 를 보여준다.
- **연동 자체가 안 됨** → 토큰 만료(60일) 의심. 원장님에게 설정 → 인스타 다시 연결 안내.
- **심사 통과했을 때**: `INSTAGRAM_SCOPES` 에 통과한 권한을 추가한다.
  ⚠️ **심사 기간 중에는 4개 전부 요청해야 한다**(`INSTAGRAM_FULL_SCOPE=1` 유지) —
  리뷰어가 권한을 부여받아 기능을 눌러봐야 심사가 진행된다.

---

## 4.5 "연결이 불안정해요" · 안테나 배너 신고가 들어온다

**서버가 멀쩡한데 이 신고가 오면 대부분 클라이언트 오판이다.** 먼저 서버부터 배제한다.

```bash
curl -s -o /dev/null -w '%{http_code} %{time_total}s\n' $B/health
```

200 이고 1초 이내면 서버 문제가 아니다. 그다음 판별:

| 사용자가 보는 것 | 나오는 곳 | 의미 |
|---|---|---|
| 상단 회색 띠 + 안테나(wifi-slash) "오프라인 모드 — 추가/수정은 잠시 멈춰요" | `app-perf-recovery.js` `_markOffline` | `/auth/me` 프로브가 **3회 연속** 서버에 못 닿음. 저장 버튼도 같이 잠긴다 |
| 홈 카드 "연결이 불안정해요" | `app-home-v41.js` `_fetchBrief` | `/assistant/brief` 3회 실패 |
| 토스트 "서버 연결이 불안정해요. 자동으로 다시 시도 중..." | `app-core.js` `_showReconnectToast` | 20초 안에 요청 2건 이상 실패 |

셋은 **원인이 다르다.** 안테나만 뜨면 `/auth/me` 만 막힌 것이고,
셋 다 뜨면 진짜로 백엔드 전체가 안 닿는 것이다.

- 2026-08-01 이전 빌드에는 오판 버그가 있었다(재시도 0회 · HTTP 에러를 오프라인으로 취급
  · 앱 복귀마다 무방비 프로브). `RELEASE_AUDIT` §4.95 참고.
  **구버전을 캐시로 물고 있는 사용자**면 SW 캐시를 지우게 안내한다.
- 안테나가 떠 있는데 서버가 200 이면 15초 안에 저절로 사라져야 한다(자가복구 루프).
  안 사라지면 그건 새 버그다.

---

## 5. DB 가 이상하다

- 현재 **읽기 전용 모드는 없다.** DB 가 죽으면 `/health` 가 503 → 앱 전체가 멈춘다.
- 할 수 있는 것: `MAINTENANCE_MODE=1` 로 점검 안내를 띄우고 Supabase 복구를 기다린다.

### 🔐 DB 장애 중 인증은 어떻게 되나 (2026-08-01 결정 — fail-closed)

로그인 세션 유효성 검사(`utils/security.py` — 로그아웃·비번변경·탈퇴로 무효화된 토큰인지 확인)가
**DB 를 읽는다.** DB 가 흔들리면 이 검사를 못 한다. 그때 어떻게 할지가 보안 트레이드오프다.

| 선택 | 보안 | 사용자 |
|---|---|---|
| fail-open (~2026-07-31) | ❌ **취소된 세션이 되살아난다** — 탈취 대응이 가장 필요한 순간에 방어가 꺼짐 | 서비스 계속 |
| fail-closed + 401 | ✅ | ❌ 프론트가 토큰을 지워(`_handle401`→`setToken(null)`) **전원 강제 로그아웃**, DB 회복돼도 비번 재입력 |
| **fail-closed + 503 (현재)** | ✅ | ✅ 5xx 백오프 재시도, 토큰 유지, DB 회복 시 자동 복구 |

**지금은 세 번째다.** 장애 중엔 인증이 걸린 요청이 전부 503 을 받는다.
사용자에겐 "일시적으로 확인이 어려워요"로 보이고, 로그아웃되지는 않는다.

- 로그에서 찾을 문구: `[AUTH] 세션 유효성 확인 실패 — 요청 거부(fail-closed)`
- 이게 대량으로 찍히면 **인증 문제가 아니라 DB 문제**다. 위 5번 절차로 간다.
- 진짜 무효화된 세션은 그대로 401 이므로 503 과 헷갈리지 않는다.

> ⚠️ 남은 리스크: DB 장애 = 사실상 전면 중단이다(대부분 엔드포인트가 DB 를 쓰므로
> fail-open 이어도 어차피 못 돌았다). 읽기 전용 모드는 아직 없다 — 출시 후 과제.

### 백업은 두 겹이다 (2026-09-30 — Supabase Pro)

| 백업 | 보관 | 복구 단위 | 언제 쓰나 |
|---|---|---|---|
| **Supabase 자체 일일 백업** (Pro 기본) | 7일 | 하루 단위, 프로젝트 전체를 그 시점으로 | "어제 새벽 상태로 통째로" — 대시보드 Database → Backups 에서 버튼 |
| **PITR(시점 복구)** | 애드온을 켰을 때만 | 분 단위 | Pro 에 기본 포함이 **아니다**. Settings → Add-ons 에서 켜져 있는지 확인 |
| **우리 백업** (`supabase-backup.yml` → GCS) | 400일 | 하루 단위, 테이블만 골라 복원 가능 | Supabase 계정 자체 사고 · 7일 지난 복구 · 특정 원장 데이터만 되살릴 때 |

🔴 Supabase 복원은 **프로젝트 전체를 덮어쓴다** — 그 시점 이후 모든 원장님의 입력이 사라진다.
한 원장님 데이터만 필요하면 우리 백업을 **별도 DB 에 복원한 뒤 그 행만 옮긴다**(아래 절차).

### 백업에서 복구하기 — ✅ 리허설 완료 (2026-08-01)

백업: Supabase Daily Backup (Actions, UTC 18:00 = 한국 03:00). **최근 5일 연속 성공 확인.**
아티팩트 보관 30일. 운영 80KB · 스테이징 618KB(gz).

**실제로 복구해봤다. 순서:**

```bash
# 1) 백업 내려받기 (프론트 레포 Actions)
gh run list --workflow=supabase-backup.yml --limit 5      # 성공한 run id 확인
gh run download <RUN_ID> -D ./restore

# 2) 로컬 postgres 17 (Supabase 도 17)
brew install postgresql@17
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
export LC_ALL="en_US.UTF-8"          # ← 없으면 "postmaster became multithreaded" 로 기동 실패
initdb -D /tmp/pgdrill -U drill --encoding=UTF8 --locale=C
pg_ctl -D /tmp/pgdrill -o "-p 55432 -k /tmp -c listen_addresses=''" -l /tmp/pgdrill/log start
#   ⚠️ 소켓 경로가 103자를 넘으면 기동 실패 — 반드시 /tmp 같은 짧은 경로에

# 3) 복원
psql -h /tmp -p 55432 -U drill -d postgres -c "CREATE DATABASE restored;"
gzip -dc restore/*/itdasy_PROD_*.sql.gz | psql -h /tmp -p 55432 -U drill -d restored
```

**실측 결과 (운영 백업 기준):**

| 항목 | 결과 |
|---|---|
| 복원 소요 | **1초** (운영 516KB 기준. 데이터 늘면 비례) |
| 에러 | 10건 — **전부 Supabase 전용**(`pg_cron`·`supabase_vault`·`cron` 스키마). 앱 데이터와 무관, 무시해도 됨 |
| 복원된 테이블 | public 63개 + auth 23 + storage 8 |
| 무결성 | FK 73 · PK 63 · 인덱스 250 · 시퀀스 49 — 전부 복원됨 |
| 동작 확인 | JOIN 조회 ✅ · 매출 합계 ✅ · **신규 INSERT ✅** |

👉 **결론: 백업에서 실제로 되살릴 수 있다.** 다만 위 3개 Supabase 확장은 자체 postgres 로
옮길 땐 따로 챙겨야 한다(Supabase → Supabase 복구면 문제없음).

### 🔴 리허설에서 발견한 것 — "운영 DB" 는 아무도 안 쓰는 유령이다

리허설 중 운영/스테이징 스키마가 갈린 걸 보고 파고들어 확인한 사실:

| 확인 항목 | 결과 |
|---|---|
| 운영 DB alembic revision | **`0012_customer_trust_fields`** |
| 스테이징 DB revision | `0029_h4_token_epoch` — **17개 앞섬** |
| 운영 레포(`itdasy_backend`) 코드 | alembic `0019` 까지 (코드조차 DB 보다 앞섬) |
| 운영 Cloud Run 서비스 | **존재하지 않음** — `itdasy-495513` 에 `itdasy-backend-staging` 하나뿐 _(2026-08-01 당시. 지금은 `itdasy-backend-prod` 가 있다 — 맨 위 표)_ |
| 운영 프론트(`itdasy-frontend`) 의 `PROD_API` | **스테이징 백엔드 주소** (라이브 파일에서 실측) |

👉 **결론: 지금 스테이징 백엔드 하나가 모두를 서빙하고 있다. 그게 사실상 운영이다.**
운영 DB 는 0012 시점에 멈춘 채 아무도 안 쓴다 — 그래서 스키마가 뒤처진 것이다.

**출시 전에 반드시 정할 것 (연준님):**
1. 이대로 스테이징 백엔드를 운영으로 쓸 것인가? → 그러면 **스테이징 전용 env 를 반드시 걷어내야 한다**
   (`ITDASY_STAGING_BYPASS_ALL=1` 이 켜져 있으면 **모든 사용자가 premium + 한도 우회**)
2. 별도 운영 백엔드를 세울 것인가? → 그러면 운영 DB 를 0029 까지 올려야 한다

⚠️ **`Base.metadata.create_all` 이 격차를 메워준다고 생각하면 안 된다.**
그건 **없는 테이블을 만들 뿐**이고 컬럼 추가·타입 변경·인덱스·제약은 하지 않는다.
0013~0029 실제 내용: `add_column` 9 · `create_index` 5 · unique/제약 3 · `create_table` 2.
게다가 이 9개 컬럼은 `_ensure_col` 로도 **하나도 커버되지 않는다**(실측 0/9) —
`users.min_valid_iat`(로그아웃·비번변경 시 세션 무효화의 전제) 포함.
**Alembic 을 실제로 돌려야만 생긴다.**
다행히 Dockerfile CMD 가 `alembic upgrade head && uvicorn` 이라 컨테이너 부팅 시 자동 적용되고,
실패하면 fail-loud 로 uvicorn 이 안 뜬다(옛 리비전 유지).

### 운영 DB 에만 있는 옛 테이블 12개

`posts` · `profiles` · `comments` · `blocks` · `reports` · `entitlements` · `eula_consents` ·
`generated_images` · `meta_connections` · `webhook_events` · `access_logs` · `account_deletion_requests`

현재 코드에 대응 모델이 없다(전수 grep 확인). **다만 바로 지우지 말 것** —
Supabase Function·직접 SQL·cron 이 참조할 수 있으니 먼저 확인하고, deprecated 확정 후 삭제.
개인정보가 남아 있을 수 있어 정리 대상이긴 하다. **출시 후 작업 권장.**

---

## 6. 첫날 지표 임계값

| 지표 | 정상 | 이럴 땐 본다 |
|---|---|---|
| 신규 가입 | — | 0 이면 가입 경로 확인(회원가입 500 여부) |
| 활성 사용자 / 가입 | 50%+ | 낮으면 온보딩·로그인 문제 |
| 오늘 원가 / 상한 | <60% | 90% 넘으면 범인 기능 확인 |
| 잇비 응답 | 3초 내외 | 10초+ 지속이면 Vertex 상태 확인 |
| 캡션 응답 | 30~50초 | 60초+ 면 내부 재생성 폭주 의심(`CAPTION_REGEN` 로그) |

---

## 6.5 손님에게 잘못 나가고 있다 — 자동발송 긴급 중지

**고치기 전에 먼저 끈다.** 원인 찾는 동안에도 발송은 계속 나간다.

| 끄고 싶은 것 | env | 반영 |
|---|---|---|
| **자동화 4종 전부**(DM 초안·DM 자동발송·DM 버튼 안내·댓글 문의 초안) | `AUTOMATION_DISABLE_ALL=1` | 호출마다 읽는다 — 새 리비전이 뜨는 즉시(약 40초) |
| DM 자동발송만(초안은 유지) | `DM_AUTOSEND_DISABLE=1` | 같음 |
| 인스타 DM 봇 수신 자체 + 네이버 톡톡 | `DM_AUTOREPLY_ENABLED=false` | 모듈 로드 때 읽는다 — 새 리비전 필요(env 변경이 곧 새 리비전) |
| 카카오 알림톡 | `ALIGO_API_KEY` 제거 | 발송 함수가 `not_configured` 로 건너뜀 |

```bash
gcloud run services update $SVC --region=$REGION --project=$PROJECT \
  --update-env-vars AUTOMATION_DISABLE_ALL=1
# 복구
gcloud run services update $SVC --region=$REGION --project=$PROJECT \
  --remove-env-vars AUTOMATION_DISABLE_ALL
```

근거: 백엔드 `services/automation_gate.py` `_kill_switch()` (웹훅·워커·재시도가 실행 시점에 재조회).
끈 뒤에는 **이미 나간 메시지 목록**을 DM 로그에서 뽑아 원장님께 알린다 — 손님 쪽 정정은 원장님 몫이다.

---

## 6.6 환불·구독 문의가 왔다

**iPhone 환불은 Apple 만 할 수 있다.** Android 는 구매 48시간 안이면 사용자가 Play 에서 직접,
그 뒤엔 **우리가 Play Console → 주문 관리에서** 환불할 수 있다. 어느 쪽이든 우리가 할 일은
① 스토어 결정이 앱에 반영됐는지 확인 ② 안 됐으면 원인을 찾는 것이다.

1. 원장님께 받을 것: 가입 이메일, 결제한 스토어(아이폰/안드로이드), 대략의 결제 날짜. **카드번호·영수증 사진은 받지 않는다.**
2. 환불 요청 안내 — 우리가 대신 못 한다:
   - iPhone: `reportaproblem.apple.com` 에서 본인이 요청
   - Android: 48시간 안 = Google Play → 결제 및 구독 → 해당 구독 → 환불 요청.
     48시간 지남 = 우리가 판단해 Play Console → 주문 관리 → 해당 주문 → 환불(권한 있는 관리자만)
3. 앱 반영 확인 (운영 DB):
   ```sql
   SELECT user_id, store, plan, status, next_bill_at, cancel_at_period_end, last_verified_at
   FROM subscriptions WHERE user_id = <원장 id> ORDER BY last_verified_at DESC LIMIT 5;
   ```
   환불 반영 = `plan='free'` · `status='refunded'`. 해지 예약 = `cancel_at_period_end=true` 이고 `plan` 은 그대로(기간 끝까지 사용 가능 — 정상).
4. 반영이 안 됐으면 스토어 알림이 왔는지 본다:
   ```bash
   gcloud logging read 'resource.labels.service_name="itdasy-backend-prod" AND textPayload:"IAP"' \
     --project=$PROJECT --limit=30 --freshness=7d --format="value(timestamp,textPayload)"
   ```
   `[IAP Apple S2S] 반영 … type=REFUND → revoked` / `[IAP Google RTDN] 반영 … REVOKED` 가 없으면 알림 미수신이다.
   원인 판별은 백엔드 `backend/docs/IAP_GO_LIVE_RUNBOOK.md` §2 "401 원인 판별표".
5. **DB 를 손으로 고치지 않는다.** 스토어 알림이 다시 오면(재전송) 멱등하게 반영된다. 급하면 원장님께
   앱에서 **구매 복원**을 누르게 해 영수증 재검증을 태운다.

---

## 6.7 잘못된 화면을 배포했다 — 프론트 롤백

🔴 **앱은 웹을 원격으로 불러온다**(`capacitor.config.json` 의 `server.url`). 그래서 `main` 푸시가
스토어 심사 없이 **전 사용자 앱에 바로** 퍼지고, 되돌리기도 같은 길로 한다.

```bash
git fetch origin main && git switch main && git pull
git log --oneline -5                    # 문제 커밋 확인
git revert --no-edit <문제커밋>          # 여러 개면 새것부터 차례로. 강제 푸시·reset 금지
git push origin main                     # deploy.yml 이 lint·테스트 후 자동 배포(몇 분)
```

확인:
1. Actions `Deploy to GitHub Pages` 가 초록인지 — 실패하면 **이전 화면이 그대로 서빙 중**이다(더 나빠지지는 않는다).
2. 배포본의 빌드값이 새 커밋인지: `https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/build.txt`
   (이 레포는 테스트 프론트다. 운영 프론트는 `itdasy-frontend` 레포에서 같은 절차)
3. 사용자 폰: GitHub Pages 가 `index.html` 을 최대 10분 캐시한다. 앱은 **부팅 3초 뒤** `build.txt` 를
   대조해 다르면 캐시를 비우고 한 번 다시 불러온다(세션당 1회, `index.html` 상단 가드).
   **이미 켜져 있는 앱은 다음에 켤 때 바뀐다.** 급하면 원장님께 앱을 완전히 껐다 켜게 안내한다.

⚠️ 네이티브 쪽(플러그인·권한·아이콘)은 이 방법으로 안 돌아간다 — 스토어 재심사가 필요하다.
그래서 웹 코드는 옛 네이티브 앱에서도 죽지 않게 플러그인 유무를 확인하고 쓴다(`isAvailable()` 가드).

---

## 7. 연락·계정

- Cloud Run / Vertex: GCP 프로젝트 `itdasy-495513` (asia-northeast3)
- Discord 알림 채널: `DISCORD_ALERT_WEBHOOK` (= Cloud Run 의 `DISCORD_MODERATION_WEBHOOK`)
- admin: https://nopo-lab.github.io/itdasy-admin/ (`is_admin=True` 계정 필요)
- 데모 계정: `review@itdasy.com` (심사용)

---

_최종 갱신: 2026-08-01 · 킬스위치·알림은 스테이징에서 실제로 눌러보고 검증함_
