# ITDASY — MEDIA ABSOLUTE FINAL DEPLOYMENT / GREEN CLOSEOUT

```
FINAL:             CONDITIONAL GREEN
DEPLOY:            YES  (단, push 는 승인 대기 — 대상이 실사용 서비스다)
GC:                KEEP OFF
REAL DEVICE:       NOT VERIFIED
TOP REMAINING RISK: 수정본 GC 의 실데이터 orphan 숫자를 아직 모른다 — 그래서 GC 를 켜면 안 된다.
```

---

## 0. BASELINE LOCK

🔴 **프롬프트가 준 baseline SHA 는 더 이상 유효하지 않다.**

| | 프롬프트 기준 | 실제 (리베이스 후) |
|---|---|---|
| Backend | `868d5c4` | **`aba935d`** |
| Frontend | `8711fc7` | **`fc07e90`** |

이유 — 내 브랜치가 공유 워크트리의 **낡은 local main** 에서 갈라져 있었다:

```
BE: origin/main 보다 154 커밋 뒤처짐   FE: 24 커밋 뒤처짐
겹치는 파일: backend/routers/auth.py(내 F-1 수정) · app-core.js · app-dm-menu.js · index.html
```

`origin/main` 으로 리베이스했다. **충돌 0건.**

```
BE  aba935d ← 5107e41 (origin/main)
FE  fc07e90 ← 4a02db2 (origin/main)
working tree: clean (양쪽 모두)
push 대상: origin 만  ⚠️ FE 에는 frontend(운영)·frontend-test(원영) remote 도 등록돼 있다
```

**리베이스 후 수정 17종 전수 잔존 확인 — 유실 0.**

---

## 1. PRE-DEPLOY REGRESSION GATE

```
Backend   passed = 3713   failed = 0   skipped = 140   xfailed = 1
Frontend  passed = 1713   failed = 0   (88 suites)
Smoke     PASS  (96 scripts · 182 lazy-group entries · git mode)
Lint      PASS  (eslint 195 → 195, 신규 0 · stylelint clean)
```

**기존 unrelated failure 가 사라졌다.** 이전 라운드에서 실패하던
`test_D2_today_date_duplicated_with_header` 가 통과한다 — `origin/main` 에 다른 세션의 수정이
들어와 있었다. 내 변경과 무관했다는 게 이걸로 확정됐다.

eslint 195 는 `origin/main` 을 별도 워크트리로 체크아웃해 **직접 대조**한 값이다(신규 0).

---

## 2. MEDIA CORE REGRESSION — 64/64 PASS

| 항목 | 결과 | 항목 | 결과 |
|---|---|---|---|
| valid JPG · PNG · WEBP | ✅ | EXIF 1~8 | ✅ (8/8) |
| HEIC 변환 판별 | ✅ (5/5, jest) | upload retry | ✅ |
| invalid extension | ✅ | timeout recovery | ✅ |
| MIME spoof (양방향) | ✅ | CDN failure | ✅ |
| corrupt image | ✅ | Storage failure | ✅ (503) |
| 0 byte | ✅ | stale URL | ✅ |
| truncated image | ✅ | broken image fallback | ✅ |
| oversized file (21MB) | ✅ | duplicate upload | ✅ (dedupe) |
| oversized pixels (63MP) | ✅ | concurrent upload | ✅ (DB UNIQUE) |
| unauthorized access | ✅ | unauthorized delete | ✅ |
| delete account | ✅ (코드 계약) | | |

---

## 3·5·6. GC SAFETY GATE — 7/7 PASS (실제 `run_once` 호출)

```
§3 dry-run (ITDASY_WS_GC_ENABLED = OFF)
   dry_run=True  orphans=1  deleted=0  삭제키=[]        → deleted=0 ✅
```

| 테스트 | 결과 | 기대 |
|---|---|---|
| **TEST 1** live slot + composite URL | `scanned=2 orphans=0 deleted=0` | orphans=0 deleted=0 ✅ |
| **TEST 2** dead asset + no reference | `scanned=1 orphans=1 deleted=1` | orphans=1 deleted=1 ✅ |
| **TEST 3** recent asset < 24h | `orphans=0 grace_skipped=1 deleted=0` | grace_skipped=1 ✅ |
| **TEST 4** Storage delete failure | `deleted=0` · DB 행 잔존=1 | 재시도 가능 ✅ |
| **§6-A** user 7=live · 70=dead | 삭제 `['70/…/dead_seventy.jpg']` · user7 무사 | ✅ |
| **§6-B** user 7=dead · 70=live (반대) | 삭제 `['7/…/dead_seven.jpg']` · user70 무사 | ✅ |

접두사 substring 충돌(`7` vs `70`)·카테고리 충돌 **없음**, 양방향 확인.

### live-set 커버리지 A~G (코드 확인)

```
A  WorkspaceSlotPhoto.image_url        live.add(p.image_url)            ✅
B  WorkspaceSlotPhoto.base_url         live.add(p.base_url)             ✅
C  edit_state 내부 URL                  _collect_urls(p.edit_state)      ✅
D  WorkspaceSlot.meta                  _collect_urls(row.meta)          ✅
E  meta.templateOutputs[].outputUrl    ↑ 재귀 순회로 포함                ✅
F  publish 내부 URL                     _collect_urls(row.publish)       ✅
G  기타 slot 필드                        재귀라 새 필드도 자동 보호         ✅
```

---

## 4. OLD "45 ORPHANS" 폐기

```
OLD:  45   (2026-08-09 ~ 09-07, 30회 실행 내내 고정)
NEW:  미측정 — 실행 불가
```

**변화 원인을 설명할 수 없다.** 수정본을 실데이터에 돌려보지 못했기 때문이다.

- DB 시크릿(`itdasy_database_url`) 접근이 **정책상 차단**됐다. 우회하지 않았다.
- **GC 수동 트리거 엔드포인트가 없다**(`routers/admin.py` 확인) → HTTP 로도 못 돌린다.
- 따라서 **배포 후 다음 04:20 UTC 크론 로그**가 유일한 측정 경로다.

예상 방향만 말하면: live-set 이 넓어졌으므로 새 숫자는 **45 이하**여야 한다. 45보다 크면
그 자체가 이상 신호다. 다만 §19 지시대로, 숫자가 작아졌다는 이유만으로 좋다고 판단하지 않고
후보 샘플을 실제 DB/Storage 와 대조한 뒤에 결정해야 한다.

---

## 7. GC DRY-RUN GO/NO-GO

```
GC ENABLE = 판정 불가 (NOT ELIGIBLE YET)
```

§7 이 요구한 "삭제 후보 일부를 실제 DB/Storage reference 와 대조" 를 **수행하지 못했다.**
로직 안전성은 7/7 PASS 지만, 실데이터 후보 대조 없이 ELIGIBLE 을 선언하지 않는다.

---

## 8. R-1 ENABLE ORDER (준수)

```
STEP 1  MEDIA 수정본 배포          ← 지금 여기 (승인 대기)
STEP 2  배포 health check
STEP 3  MEDIA smoke / E2E
STEP 4  GC OFF 유지                ← 환경변수 건드리지 않음
STEP 5  수정본 GC dry-run          ← 다음날 04:20 UTC 크론
STEP 6  dry-run 숫자 검증
STEP 7  live-set safety 검증
STEP 8  삭제 후보 일부 수동 대조
STEP 9  모든 결과 PASS
STEP 10 그때만 GC enable 검토
```

배포 → 즉시 GC ON 은 **하지 않는다.**

---

## 9·10. R-2 MEMORY

실제 앱(`main.py` 전체, baseline 264MB)을 로드한 한 프로세스의 RSS. 추정 보정 없음.

| | peak RSS | 한도 대비 | 결과 |
|---|---|---|---|
| 39.4MP × 1 | 656 MB | 64% | 200 |
| 39.4MP × 2 | 659 MB | 64% | 200 |
| 39.4MP × 4 | 734 MB | 72% | 200 |
| 39.4MP × 4 + 일반 API | 665 MB | 65% | 200 · ping 200 / 7ms |
| 39.4MP × 8 | 898 MB | **88%** | 하네스 한계로 일부 503¹ |

¹ `--limit-concurrency 8` 때문이다. Cloud Run 은 상한 초과 시 503 이 아니라 큐잉 후 스케일아웃(maxScale 5).

```
OOM: 관측되지 않음        container restart: 없음 (30일 로그 OOM/Killed 0건)
```

**§10 지시대로 기록한다** — "메모리 문제 해결 완료" 라고 쓰지 않는다:

> 현재 측정 범위에서 OOM/재시작은 관측되지 않았으며 1GiB / concurrency 8 에서 peak 88% 로
> 동작 확인. 운영 여유 확보를 위해 2GiB 권장.

```
R-2 = RELEASE NON-BLOCKER
2GiB          : RECOMMENDED
MAX_PIXELS 하향 : NOT REQUIRED
```

실배포 환경 재측정은 배포 후에만 가능하다(현재 값은 동일 코드·동일 앱 로드 기준).

---

## 11. R-4 ORPHAN RECOVERY

실제 `run_once` 재현 결과:

| 경로 | GC 탐지 | 이유 |
|---|---|---|
| portfolio (DB 삭제 + Storage 삭제 실패) | **0건** | `WorkspaceAsset` 행이 없어 순회 대상 밖 |
| background (동일) | **0건** | 〃 |
| untracked (Storage 성공 + DB insert 실패) | **0건** | 〃 |
| 대조군 WorkspaceAsset orphan | **1/1** ✅ | |

**실제 발생률 — 30일 로그 실측:**

```
"Storage 삭제 실패" 로그 : 0건
CLOUD_STORAGE 경고      : 4건 — 전부 dedup 캐시 조회 miss(정상 동작, 삭제 실패 아님)
WorkspaceAsset orphan 증가율: 0 (45 고정, scanned +68 / live +68)
```

**탈퇴 시 수거 가능한가**: ✅ 가능. F-1 의 `delete_user_prefix()` 가 `{user_id}/` 접두사를
통째로 지우므로 portfolio·background·미추적 객체까지 함께 걷힌다.

```
R-4 = KNOWN NON-BLOCKING DEBT
```
새 GC 로직으로 무리하게 확대하지 않았다(별도 변경으로 분리). active user 데이터가 삭제될
가능성은 **없다** — GC 는 `WorkspaceAsset` 행이 있는 것만 지우고, 그 안전성은 7/7 PASS 다.

---

## 12. ACCOUNT DELETE

```
CODE CONTRACT : PASS
REAL SUPABASE : NOT VERIFIED
```

- `delete_user_prefix()` 정의 + `auth.py` 배선 = 리베이스 후에도 잔존 확인
- 테스트 3종 PASS — 전량 삭제 / `70` 을 `7` 로 오인하지 않음 / 남의 파일 무사 / Storage 장애 시에도 탈퇴는 성공
- **실 Supabase 왕복은 검증하지 않았다** — 운영 service key 미사용. "실 Supabase PASS" 라고 쓰지 않는다.

---

## 13. R-3 UX

```
upload progress   : INDETERMINATE ("올리는 중…" 존재)
per-file progress : 없음
cancel            : 없음  ← "안전하게 동작함" 아님. 존재하지 않음.
```

| 회선 | 단일 | 10장 |
|---|---|---|
| LTE 양호 (10 Mbps) | < 1s | 3.3 s |
| LTE 보통 (3 Mbps) | < 1s | 10.9 s |
| 지하철·약전계 (800 kbps) | ~1s | 41.0 s |
| 3G (400 kbps) | ~1.2s | 81.9 s |

무한 spinner **재현되지 않음** — 90초 타임아웃 + 재시도(4회) + 실패 토스트가 붙었다.

```
R-3 = P2 NON-BLOCKER
```

---

## 14. REAL DEVICE

```
REAL DEVICE : NOT VERIFIED
EMULATION   : PASS
```
미검증 범위: iPhone Safari camera · Android Chrome camera · iPhone HEIC ·
network switching · background/resume · screen lock · OS permission flow.

---

## 15. DEPLOYMENT SAFETY — ⚠️ 반드시 읽을 것

```
Cloud Run 서비스 : itdasy-backend-staging  ← 이 프로젝트의 유일한 서비스
ENVIRONMENT      : production
DATABASE_URL     : secret:itdasy_database_url        (실데이터)
SUPABASE         : hsxxqomfbdernepykils / user-uploads (실파일)
serving revision : itdasy-backend-staging-00561-x9b (traffic 100%)
```

**이름은 staging 이지만 실사용 서비스다.** `itdasy_backend-test` 의 main 에 푸시하면
`deploy-cloudrun.yml` 이 이 서비스에 자동 배포된다 → **실사용자에게 즉시 반영된다.**
잘못된 DB 를 가리키는 문제는 없다(확인 완료). 다만 "테스트 배포" 로 취급하면 안 된다.

FE 캐시버스터: `bump_cache_busters.py` 가 신규 `js/media-fallback.js?v=` 를 정상 범프한다
(실측 326건 갱신, `load-groups.js` 자체 버전 포함). index.html 원복 확인.

---

## 16. FINAL PRODUCTION SMOKE

```
미실행 — 배포하지 않았으므로 실행 불가.
```
15개 핵심 경로(로그인→업로드→저장→새로고침→재접근→CDN→삭제→retry→fallback→HEIC→
portrait→portfolio→background→workspace slot)는 **배포 직후 수행해야 한다.**

---

## 17. FINAL RELEASE MATRIX

```
CODE:                    GREEN
DEPLOY:                  GO        (승인 대기 — 대상이 실사용 서비스)
GC:                      OFF       (ELIGIBLE 아님 — 실데이터 dry-run 미측정)
R-1:                     PASS      (로직 안전성 7/7). 실데이터 검증은 배포 후
R-2:                     PASS      (NON-BLOCKER · 2GiB 권장)
R-3:                     NON-BLOCKING
R-4:                     KNOWN DEBT
SECURITY:                PASS
DELETE ACCOUNT:          PASS (코드) / NOT VERIFIED (실 Supabase)
HEIC:                    PASS
ORIENTATION:             PASS
LARGE IMAGE:             PASS
RETRY:                   PASS
CDN/STORAGE FAILURE:     PASS
DB/STORAGE CONSISTENCY:  PASS (GC 범위 내) · R-4 는 KNOWN DEBT
CONCURRENCY:             PASS
AUTOMATED TEST:          PASS
REAL DEVICE:             NOT VERIFIED
```

---

## 18. RELEASE DECISION

```
P0 = 0
P1 = 0
media E2E · security · orientation · HEIC · large-image · retry
· delete-account(code) · GC live-set safety · deployment target  = 전부 PASS
unexpected regression = 없음 (오히려 기존 실패 1건이 해소됨)
```

```
FINAL: CONDITIONAL GREEN
```

**CONDITIONAL 인 이유는 코드 결함이 아니다.** 남은 것은 전부 (a) 배포 후에만 측정 가능하거나
(b) 장비/권한이 없어서다:

| 구분 | 항목 |
|---|---|
| 배포 후 측정 가능 | 수정본 GC 실데이터 dry-run · production smoke · 실환경 메모리 |
| 권한 없음 | 실 Supabase 삭제 왕복 |
| 장비 없음 | 실기기 |
| 비차단 부채 | R-3 진행률·취소 · R-4 orphan 수거 |
