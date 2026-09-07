# ITDASY — MEDIA ABSOLUTE FINAL RELEASE REPORT
**2026-09-07 · GREEN 종결 게이트**

```
FINAL:        CONDITIONAL GREEN
CODE:         GREEN
OPERATIONS:   YELLOW
REAL DEVICE:  NOT VERIFIED
```

---

## R-1 ORPHAN GC

| 항목 | 실측 |
|---|---|
| **Status** | 배포 이래 **dry-run 전용**. 30일간 30회 실행, 삭제 0건 |
| **Dry-run count** | `orphans=45` — 2026-08-09 ~ 09-07 **30일 내내 45로 고정** |
| | `scanned` 154→222, `live_urls` 109→177 (둘 다 +68), `grace_skip=0`, `error=0` |
| **Verified candidates** | 🔴 **GC 를 켰다면 살아있는 글의 발행 합성본을 지웠다** (실측 재현 → 수정) |
| **Safety** | 수정 후 12/12 PASS (실제 `run_once` 호출) |
| **Decision** | **아직 켜지 마세요.** 수정 배포 → dry-run 1회 → 숫자 재확인 → 그때 결정 |

### 새로 잡은 것 — GC 가 발행 이미지를 지운다

FE 는 `meta: buildMeta(c)` 로 **URL 치환된** slot 을 meta 에 올린다. `META_SKIP` 에
`templateOutputs` 가 없어서 `templateOutputs[].outputUrl` — **실제로 인스타에 올라가는 그 합성본** —
이 `WorkspaceSlot.meta` 에 저장된다. `publish` JSON 에도 URL 이 남는다.

그런데 `_live_url_set()` 은 `WorkspaceSlotPhoto` 의 `image_url`/`base_url`/`edit_state` 만 훑고
**slot 행 자체는 안 봤다.** 삭제되지 않은 **살아있는** slot 의 합성본이 참조 0 으로 판정됐다.

```
실제 run_once, live slot + meta 참조
  수정 전 → orphans=1  deleted=1  ['5/workspace/baked_composite.jpg']   ← 발행 이미지 소실
  수정 후 → orphans=0  deleted=0
```

실제 피해는 **0** 이다 — 지금까지 dry-run 이라 삭제가 한 번도 안 일어났다. 켜기 직전에 잡았다.

### ⚠️ orphans=45 는 이제 무효다

그 45 는 **버그 있는 live set 으로 센 값**이라 살아있는 meta·publish 참조가 섞여 있을 수 있다.
수정본을 배포해 dry-run 을 한 번 돌려야 진짜 숫자가 나온다.

### 검증한 안전 속성 (실제 `run_once`, 12/12)

| 속성 | 결과 |
|---|---|
| 살아있는 slot 의 사진 보존 | PASS |
| `edit_state` 중첩 URL(스티커·배경) 보존 | PASS |
| **`meta.templateOutputs[].outputUrl` 보존** | PASS (수정 후) |
| **`publish` 안의 URL 보존** | PASS (수정 후) |
| 24h grace — 방금 올린 asset 보호 | PASS (`grace_skipped=1`) |
| 다른 원장 asset 무사, 내 죽은 것만 삭제 | PASS |
| dry-run 은 아무것도 안 지움 | PASS |
| Storage 삭제 실패 시 행 보존(재시도 가능) | PASS |

### 다른 테이블이 workspace URL 을 참조하는가 — 전수 확인

| 테이블 | 판정 |
|---|---|
| `ScheduledPost.image_url/image_urls` | **위험 없음** — 로컬 디스크 URL(`/static/uploads/scheduled/`), Supabase 아님 |
| `Treatment.photos` | **위험 없음** — FE(`treatment-link.js`)가 photos 를 백엔드로 안 보낸다(로컬 갤러리만) |
| `Portfolio` · `BackgroundAsset` | **위험 없음** — `WorkspaceAsset` 행이 없어 GC 대상 자체가 아님 |
| `RevenueRecord` · `ExpenseRecord` | **위험 없음** — OCR 경로는 Storage 에 저장하지 않음(확인함) |

**GC 는 `WorkspaceAsset` 행이 있는 객체만 지운다. 그 행은 `/workspace/slots/image` 만 만든다.**

---

## R-2 LARGE IMAGE MEMORY

**실제 앱(`main.py` 전체)을 로드한 한 프로세스의 RSS.** 추정 보정 없음, 1024MB 와 직접 비교.
baseline **264 MB**(라우터 60·모델 56·서비스 70 로드 후).

| 케이스 | peak RSS | 한도 대비 | 상태 | 지연(최대) |
|---|---|---|---|---|
| 39.4MP × 1 | **656 MB** | 64% | 200 | 486 ms |
| 39.4MP × 2 동시 | **659 MB** | 64% | 200 | 824 ms |
| 39.4MP × 4 동시 | **734 MB** | 72% | 200 | 1,713 ms |
| 39.4MP × 4 + 일반 API | **665 MB** | 65% | 200 · ping **200 / 7ms** | 1,636 ms |
| 39.4MP × 8 (동시성 상한) | **898 MB** | **88%** | 일부 실패 · ping 503¹ | 3,060 ms |

¹ 이 503 은 테스트 하네스의 `--limit-concurrency 8` 때문이다. **Cloud Run 은 상한을 넘으면
503 이 아니라 큐잉 후 인스턴스를 늘린다**(maxScale 5). 그대로 옮겨 읽으면 안 된다.

```
OOM: 없음 (어느 케이스에서도 관측되지 않음)
컨테이너 재시작: 없음 (30일 로그에 OOM/Killed 0건)
```

### 🔴 이전 보고를 정정합니다

이전 보고서에 **“39MP 두 장 동시면 OOM”** 이라고 썼다. **틀렸다.**
단일 디코드 RSS(420MB)를 요청 수만큼 곱한 추정이었는데, 실제로는 그렇게 안 쌓인다 —
`upload_slot_image` 가 `async def` 안에서 **동기** 디코드를 하기 때문에 이벤트 루프에서
**디코드가 직렬화**된다. 그래서 2× 가 1× 대비 3MB 밖에 안 늘었다(656 → 659).

**Decision**: 출시 차단 아님. 8× 에서 88% 라 여유가 얇으니 **memory 2 GiB 권장**(비용 소폭).
`MAX_PIXELS` 하향은 **불필요** — 아이폰 기본 24MP 는 물론 39.4MP 도 여유 있게 처리된다.

---

## R-3 PROGRESS / CANCEL

실측 페이로드 (FE 1440px · q0.86 축소 후):

| 원본 | 업로드 크기 |
|---|---|
| 12MP 일반 폰 사진 | 58 KB ~ 400 KB (디테일에 따라, 상한 실측 864 KB) |
| 39.4MP 초고해상도 | 43 KB ~ 400 KB (축소가 원본 해상도를 무의미하게 만듦) |

캐러셀 10장 소요 (400 KB/장 상한):

| 회선 | 10장 |
|---|---|
| LTE 양호 (10 Mbps) | 3.3 s |
| LTE 보통 (3 Mbps) | 10.9 s |
| 지하철·약전계 (800 kbps) | **41.0 s** |
| 3G 수준 (400 kbps) | **81.9 s** |

**현재 피드백**: `올리는 중…` 버튼 상태 + 발행 오버레이 = **불확정(indeterminate) 표시는 있다.**
없는 것은 **장별 진행률(3/10)** 과 **취소**다.

```
CANCEL: 기능 없음 — "안전하게 동작함" 이 아니라 "존재하지 않음"
        XMLHttpRequest · upload.onprogress · 업로드용 AbortController = 0건
```

**Decision**: **P2 유지, 출시 차단 아님.**
근거 — ① 단일 사진 경로는 1초 미만 ② 불확정 표시가 존재해 “아무 일도 안 일어남”은 아니다
③ 이번 수정으로 90초 타임아웃 + 재시도 + 실패 토스트가 붙어 **조용한 실패가 사라졌다**.
다만 약전계 캐러셀 40~80초 무진행률 구간은 실재하므로 출시 후 개선 대상으로 남긴다.

---

## R-4 ORPHAN RECOVERY

실제 `run_once` 로 3종을 만들어 돌린 결과:

| 대상 | GC 탐지 | 결과 |
|---|---|---|
| **portfolio** (DB 삭제 성공 + Storage 삭제 실패) | **0 건** | `scanned=0 orphans=0` · 파일 그대로 남음 |
| **background** (동일) | **0 건** | `scanned=0 orphans=0` · 파일 그대로 남음 |
| **미추적 업로드** (Storage 성공 + DB insert 실패) | **0 건** | `scanned=0 orphans=0` · 파일 그대로 남음 |
| 대조군 — `WorkspaceAsset` 행 있는 진짜 orphan | **1/1** | `orphans=1 deleted=1` ✅ |

원인: GC 는 `WorkspaceAsset` 테이블을 순회한다. 위 3종은 애초에 그 행이 없어 **시야 밖**이다.

```
Decision: R-4 = 미해결 (UNRESOLVED)
```
사용자 판정 기준(“탐지하지 못하면 미해결”)을 그대로 적용했다. 테스트로 고정해 뒀으니
나중에 수거 기능이 생기면 이 테스트가 초록으로 바뀐다.
**출시 차단은 아니다** — 누적 속도가 사용량에 비례하고(30일간 orphan 증가 0),
탈퇴 시에는 F-1 의 접두사 삭제가 이 3종까지 함께 걷어낸다.

---

## 판정 매트릭스

```
SECURITY:                PASS
DELETE ACCOUNT:          PASS (코드) / 실 Supabase 왕복 미검증
DB/STORAGE CONSISTENCY:  PARTIAL  (R-4 미해결)
CDN/STORAGE FAILURE:     PASS
HEIC:                    PASS
ORIENTATION:             PASS
LARGE FILE:              PASS
RETRY:                   PASS
CONCURRENCY:             PASS
UX:                      PARTIAL  (R-3 진행률·취소 없음)
AUTOMATED TEST:          PASS
```

---

## RELEASE BLOCKERS

```
없음.
```

출시를 막는 항목이 0 이다. 아래는 **blocker 가 아니다** — 종류를 구분해 적는다.

| 구분 | 항목 |
|---|---|
| **CODE — 해결됨** | F-1 탈퇴 Storage 삭제 · F-2 폭탄 가드 순서 · F-3 업로드 재시도 · F-4 깨진 사진 회수 · F-5 Storage 503 · F-6~F-9 · **GC live-set** |
| **OPERATIONAL DECISION — 미결정** | R-1 GC 켜기(수정본 dry-run 재측정 후) · R-2 memory 2 GiB 권장 |
| **UNRESOLVED — 개선 대상** | R-4 portfolio/background/미추적 orphan 수거 · R-3 진행률·취소 |
| **UNVERIFIED — 장비/권한 없음** | 실기기 · 실 Supabase 삭제 왕복 · **수정본 GC 실데이터 dry-run** |

---

## 검증 못 한 것

- **실기기** — iPhone Safari / Android Chrome 카메라 캡처, HEIC 카메라 출력, 네트워크 전환,
  백그라운드/복귀, 화면잠금, 브라우저 lifecycle. 장비 없이 판정 불가.
- **실 Supabase 왕복** — 탈퇴 파일 삭제는 REST 계약 목으로만 검증(운영 키 미사용).
- **수정본 GC 실데이터 dry-run** — DB 시크릿 접근이 정책상 차단돼 실행하지 못했다.
  우회하지 않았다. 이것 때문에 `orphans=?` 의 **진짜 숫자를 아직 모른다.**

---

## 테스트

```
pytest tests/        3074 passed · 60 skipped · 1 failed* · 1 xfailed   (신규 64)
jest --rootDir .     79 suites / 1556 passed                            (신규 28)
smoke-check --git    passed (92 scripts · 182 lazy entries)
eslint               190 warnings → 190 (신규 0)

* test_D2_today_date_duplicated_with_header — 수정 전 clean HEAD 에서도 동일 실패.
  git stash 로 대조 확인. 이번 변경과 무관(다른 세션 작업 중).
```

---

## FINAL DECISION

```
CONDITIONAL GREEN
```

### 현재 상태에서 실제 배포해도 되는가?

# YES — 단, GC 는 켜지 않은 채로.

**근거(실측):**
- 코드 결함 P0·P1 = **0**. 전부 수정 + 회귀 테스트로 고정(신규 92개).
- GC 는 지금 **dry-run** 이라 배포해도 아무것도 지우지 않는다. 30일간 삭제 0건이 그 증거다.
- 메모리는 8 동시 업로드에서 **898 MB / 1024 MB (88%)**, **OOM 0건**, 30일 로그에 OOM/Killed 0건.
- orphan 은 30일간 **45 고정 — 증가 0**. 누적이 폭주하지 않는다.
- 남은 R-3·R-4 는 사용자 데이터를 잃지 않는다(파일이 **남는** 쪽 · 표시가 **부족한** 쪽).

**배포 후 순서:** ① 수정본 배포 → ② 다음날 04:20 GC dry-run 로그에서 `orphans=` 재확인
→ ③ 숫자가 납득되면 그때 `ITDASY_WS_GC_ENABLED` 를 켠다. **순서를 바꾸면 안 된다** —
지금 켜면 살아있는 발행 이미지가 지워지던 버그가 수정 전 코드로 돌아간다.
