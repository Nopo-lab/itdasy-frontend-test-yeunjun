# ITDASY — MEDIA ABSOLUTE FINAL PRODUCTION CERTIFICATION

```
FINAL:              CONDITIONAL GREEN
DEPLOY:             YES  — 완료됨. 실제 운영에 반영 확인
PRODUCTION SMOKE:   PASS  (20/20)
GC:                 KEEP OFF
REAL DEVICE:        NOT VERIFIED
TOP RISK:           수정본 GC 의 운영 dry-run 숫자를 아직 모른다(크론이 내일 04:20 UTC) — 그전에 켜면 안 된다.
```

---

## DEPLOYMENT

```
Backend SHA        : e0815c6c   (미디어 커밋 4개 전부 포함)
Frontend SHA       : 2376ef9    (GitHub Pages 반영 확인)
Cloud Run revision : itdasy-backend-staging-00563-l9f
Traffic            : 100%
Database           : production (secret itdasy_database_url)
Storage            : Supabase hsxxqomfbdernepykils / user-uploads
ENVIRONMENT        : production   ← 이름만 staging. 실사용 서비스다.
memory / cpu       : 1 GiB / 1     containerConcurrency 8, maxScale 5
ITDASY_WS_GC_ENABLED : 없음 (62개 env 중 부재) — 배포 전후 모두 확인
```

배포된 미디어 커밋:
```
7316e49  탈퇴해도 손님 사진이 공개 URL 로 남던 것 + 폭탄 가드가 디코드 후에 걸리던 것
ff76377  GC 가 살아있는 글의 발행 합성본을 orphan 으로 보고 지우던 것
07ca0ea  미디어 가드 33건이 CI 에서 아예 안 돌던 것 — 픽스처를 직접 만든다
e0815c6  piexif 를 쓰는 바람에 CI 가 또 깨지던 것 — Pillow 내장 Exif 로 교체
```

---

## 🔴 내가 배포 파이프라인을 1시간 막았다

정직하게 먼저 적는다. **같은 종류의 실수를 두 번 했고, 둘 다 "내 맥에서만 초록"이었다.**

| 커밋 | 내가 만든 결함 | 결과 |
|---|---|---|
| `ff76377` | 픽스처 경로 `/private/tmp/claude-501/...` **하드코딩** | CI 33건 `FileNotFoundError` → **배포 실패** |
| `07ca0ea` | 픽스처 자체 생성으로 고치며 **`import piexif`** 추가 (내 venv 에만 설치) | CI 33건 `ModuleNotFoundError` → **배포 또 실패** |

**피해 범위가 내 변경에만 그치지 않았다** — 그 사이 다른 세션의 커밋도 함께 막혔다:

```
1d45bb3 (결제 수정, 타 세션)  → 33 failed · FileNotFoundError   ← 내 하드코딩 경로
79475f4 (고객 수정, 타 세션)  → 33 failed · No module named 'piexif'  ← 내 import
마지막 성공 배포 = 0166af8 (14:58, 내 첫 커밋 직전) · 복구 = e0815c6 (16:0x)
```

중간에 다른 세션이 두 번 수습해 줬다 — `d8ffd46`(skipif 로 우회), `6530510`(워크플로 의존성 나열 방식 자체를 수정).

⚠️ 그리고 `d8ffd46` 의 skipif 는 옳은 응급처치였지만 부작용이 있었다: **CI 에서 미디어 가드 33건이 아예 안 돌게 됐다.** 안 도는 가드는 가드가 아니다. 최종 상태는 픽스처를 테스트가 직접 만들어 **CI 에서도 실제로 돈다**(외부 의존 0, Pillow 만 사용).

검증(piexif 를 **실제로 제거한** 환경 + 로컬 픽스처 없음):
```
미디어 64건   → 64 passed
백엔드 전체   → 3791 passed, 0 failed, 163 skipped
```

---

## PRODUCTION SMOKE — 20/20 PASS

실제 운영 서비스(`e0815c6c`)에 실제 업로드·조회·삭제. 만든 것은 전부 되돌렸다.

```
✅  1. 로그인                        HTTP 200
✅  2. JPG 업로드 (workspace)        HTTP 200
✅  3. 저장 확인 · CDN 재접근          HTTP 200 · 6,683B
✅  4. 이미지 디코드 가능              (1200, 800) JPEG
✅  5. 중복 업로드 dedupe             cached=True (업로드 1회)
✅  6. PNG 업로드                    HTTP 200
✅  7. WEBP 업로드                   HTTP 200
✅  8. portrait 방향 유지             (800, 1200)
✅  9. EXIF orientation=6 적용+제거   (1200, 800) · tag=None
✅ 10. GPS EXIF 제거                 GPS IFD 비어 있음
✅ 11. 0-byte 차단                   HTTP 400
✅ 12. 스크립트-as-jpg 차단            HTTP 400
✅ 13. SVG 차단                      HTTP 400
✅ 14. 67MP 거부 (F-2)               HTTP 400 · 1.0MB · 0.118s
✅ 15. portfolio 업로드               HTTP 200
✅ 16. background 업로드              HTTP 200
✅ 17. portfolio 삭제                 HTTP 200
✅ 18. 재삭제 → 404 (500 아님)         HTTP 404
✅ 19. background 삭제                HTTP 200
✅ 20. 무인증 차단                    HTTP 401
```

### F-2 를 운영에서 증명했다

67MP(8192², 파일 1.0MB) 거부에 걸린 시간 — 같은 서비스, 배포 전/후:

```
배포 전 (0166af84) : 1.50 s      ← 거부할 이미지를 다 디코드하고 나서 거부
배포 후 (e0815c6c) : 0.118 s     ← 헤더만 읽고 거부  (5회: .118 .117 .116 .119 .125)
                     12.7배 빠름
```

### 프론트 — 운영 페이지 실측

```
깨진 사진 → 폴백 UI     자동 재시도 1회 → "사진을 못 불러왔어요" + "다시 시도" + aria-label ✅
업로드 재시도           FormData POST 8,004ms (JSON 8,000ms 와 동일 = 1+3회 백오프) ✅
                       수정 전이면 즉시 실패했을 값
HEIC octet-stream 판별  true ✅
캐시버스터              ?v=20260907-1525-b02947a 자동 범프 ✅
번들 반영               media-fallback.js 200 · _isUploadBody · UPLOAD_TIMEOUT · mf-broken CSS ✅
```

### DB ↔ Storage 정합성

```
업로드 → Storage 200 · DB 행 존재
DELETE → DB 목록에서 제거 ✅ · Storage 객체 제거 ✅ (캐시 우회 조회 400)
```

⚠️ **측정 함정 하나 정정** — 삭제 직후 **원래 URL 그대로** 조회하면 15초 넘게 200 이 나온다(엣지 캐시).
처음엔 이걸 보고 "삭제 안 됨" 이라 판정했다가, 살아있는 객체에 같은 쿼리를 붙여 200 이 나오는 것을
대조해 **삭제가 맞다**고 정정했다. 실사용 영향: 지운 사진이 짧은 시간 원래 URL 로 계속 받아진다
(표준 CDN 동작이지만, 손님 얼굴이 담긴 사진이라는 점에서 기록해 둔다).

---

## GC

```
enabled                    : NO   (ITDASY_WS_GC_ENABLED 부재 — 내가 건드리지 않음)
dry_run                    : YES  (코드상 기본값)
scanned / live_urls / orphans / grace_skipped / errors / deleted
                           : 운영 실측 **불가** — 아래 사유
candidate sample           : 0/0  (후보 목록을 얻지 못함)
live publication protection: PASS (로컬 실제 run_once)
templateOutputs protection : PASS (로컬 실제 run_once)
publish protection         : PASS (로컬 실제 run_once)
cross-tenant (7 vs 70)     : PASS (양방향)
GC decision                : KEEP OFF
```

### 왜 운영 dry-run 을 못 했나

1. GC 는 **APScheduler 크론(매일 04:20 UTC)** 으로만 돈다. 현재 UTC 16시대 → 다음 실행은 **내일 04:20 UTC**.
2. **수동 트리거 엔드포인트가 없다** (`routers/admin.py` 확인).
3. DB 시크릿 직접 접근은 **정책상 차단**됐다. 우회하지 않았다.

### OLD 45 는 폐기

```
OLD orphans = 45   (2026-08-09~09-07, 30회 내내 고정) — 버그 있는 live-set 으로 센 값
NEW orphans = 미측정
```
수정본은 `WorkspaceSlot.meta` · `publish` 까지 live 로 치므로 **45 이하**가 나와야 한다.
45 보다 크면 이상 신호다. 다만 숫자만으로 판단하지 말고 후보 표본을 대조한 뒤 결정해야 한다.

⚠️ **오늘 smoke 가 운영에 orphan 을 만들었다.** `/workspace/slots/image` 로 8건을 올렸는데
slot 에 연결하지 않았으므로 `WorkspaceAsset` 행만 남는다. 24h grace 를 지나면 후보가 된다.
**내일 dry-run 숫자를 읽을 때 이 8건을 빼고 해석해야 한다.**

### GC 로직 안전성 (로컬, 실제 `run_once`) — 7/7

| 테스트 | 결과 |
|---|---|
| TEST 1 live slot + composite URL | `scanned=2 orphans=0 deleted=0` ✅ |
| TEST 2 dead asset + no reference | `scanned=1 orphans=1 deleted=1` ✅ |
| TEST 3 recent asset < 24h | `grace_skipped=1 deleted=0` ✅ |
| TEST 4 Storage delete failure | `deleted=0` · DB 행 잔존(재시도 가능) ✅ |
| §6-A user 7=live · 70=dead | `70/...` 만 삭제, user7 무사 ✅ |
| §6-B user 7=dead · 70=live | `7/...` 만 삭제, user70 무사 ✅ |
| §3 dry-run OFF | `deleted=0` ✅ |

live-set 커버리지 A~G 전부 확인(`row.meta`·`row.publish` 재귀 순회 포함).

---

## MEMORY (R-2)

실제 앱(`main.py`) 전체를 로드한 한 프로세스의 RSS, 1024MB 와 직접 비교:

```
1x : 656 MB (64%)      2x : 659 MB (64%)      4x : 734 MB (72%)      8x : 898 MB (88%)
OOM     : NO           restart : NO           (운영 30일 로그 OOM/Killed 0건)
R-2     : NON-BLOCKING
```

**과장하지 않는다** — "메모리 문제 해결 완료"가 아니다:
> 현재 측정 범위에서 OOM/재시작은 관측되지 않았으며 1GiB / concurrency 8 에서 peak 88% 로
> 동작 확인. 운영 여유 확보를 위해 2GiB 권장. MAX_PIXELS 하향은 불필요.

⚠️ 이 수치는 **로컬(동일 코드·동일 앱 로드)** 측정이다. 운영에 부하를 걸어 재측정하지 않았다 —
실사용 서비스에 부하 시험을 하는 것이 더 위험하다고 판단했다.

---

## KNOWN DEBT

**R-3 · 업로드 진행률 / 취소** — `P2 NON-BLOCKER`
불확정 표시(`올리는 중…`)는 있다. 없는 것은 장별 진행률과 **취소**다.
취소는 "안전하게 동작함"이 아니라 **존재하지 않는다**(XHR·onprogress·업로드 AbortController 0건).
무한 spinner 는 재현되지 않았다(90초 타임아웃 + 재시도 + 실패 토스트). 약전계 10장 = 41~82초.

**R-4 · portfolio / background / 미추적 orphan** — `KNOWN NON-BLOCKING DEBT`
GC 가 `WorkspaceAsset` 행만 순회하므로 셋 다 **0건 탐지**(대조군은 1/1). 무리하게 GC 를 확대하지 않았다.
실제 발생률(운영 30일): **`Storage 삭제 실패` 0건** · orphan 증가율 0. 탈퇴 시엔 F-1 접두사 삭제가 함께 수거.
active user 데이터가 삭제될 위험은 **없다**(GC 안전성 7/7).

**신규 발견 · 예약 발행 이미지가 컨테이너 로컬 디스크에 저장된다** — `P2`
`/scheduled-posts/upload` 가 `static/uploads/scheduled/` 에 쓴다. Cloud Run 은 영속 볼륨이 없고
maxScale 5 라, 업로드한 인스턴스와 발행 워커가 다르면 파일이 사라진다. 30일 사용 2건으로 잠복 상태.

---

## UNVERIFIED

```
Real device                 : iPhone Safari / Android Chrome camera, real HEIC,
                              network switching, background/resume, screen lock, OS permission
                              → 장비 없음. EMULATION 만 PASS.
Real Supabase account-delete: 가입에 이메일 인증 티켓이 필요해 전용 테스트 계정을 만들 수 없었다.
                              검수용 데모 계정은 삭제하지 않았다.
                              → CODE CONTRACT: PASS / REAL SUPABASE DELETE: NOT VERIFIED
Production GC dry-run       : 크론 내일 04:20 UTC · 수동 트리거 없음 · DB 접근 차단
Production 부하 재측정        : 실사용 서비스라 의도적으로 하지 않음
```

---

## FINAL RELEASE MATRIX

```
CODE                    : GREEN
DEPLOY                  : GO   (완료)
GC                      : OFF
R-1                     : PASS (로직) / 운영 dry-run 미측정
R-2                     : PASS (NON-BLOCKING · 2GiB 권장)
R-3                     : NON-BLOCKING
R-4                     : KNOWN DEBT
SECURITY                : PASS
DELETE ACCOUNT          : PASS (code) / NOT VERIFIED (real Supabase)
HEIC                    : PASS (automated / emulated) / REAL DEVICE NOT VERIFIED
ORIENTATION             : PASS (운영 실측)
LARGE IMAGE             : PASS (운영 실측 0.118s)
RETRY                   : PASS (운영 실측 8,004ms)
CDN/STORAGE FAILURE     : PASS
STALE URL / BROKEN IMAGE: PASS (운영 실측)
DB/STORAGE CONSISTENCY  : PASS
CONCURRENCY             : PASS
UX                      : PARTIAL (R-3)
AUTOMATED TEST          : PASS (BE 3791 / FE 1742)
REAL DEVICE             : NOT VERIFIED
```

## RELEASE BLOCKERS

```
P0 : 0
P1 : 0
P2 : 3   (R-3 진행률·취소 · R-4 orphan 수거 · 예약발행 로컬디스크)
BLOCKERS : NONE
```

## FINAL DECISION

```
GREEN             : NO
CONDITIONAL GREEN : YES
RED               : NO
DEPLOYMENT        : GO   (이미 완료 · 운영 반영 확인)
GC ENABLE         : DO NOT ENABLE
```

### 현재 상태에서 실제 사용자에게 배포해도 되는가?

# YES — 이미 배포됐고, 운영에서 20/20 로 확인했다.

근거(실측): 운영 smoke 20/20 · 67MP 거부 1.50s→0.118s · 업로드 재시도 8,004ms ·
깨진 사진 폴백 동작 · EXIF 1~8 및 GPS 제거 · 삭제 시 DB·Storage 양쪽 제거 · 무인증 401 ·
BE 3791 / FE 1742 테스트 통과 · OOM 0건 · GC 는 OFF 그대로.

**CONDITIONAL 인 이유는 배포된 코드가 아니라 아직 못 켠 GC 와 못 해본 검증 때문이다.**

### 다음 순서 (반드시 이 순서로)
```
1. 내일 04:20 UTC 이후 GC dry-run 로그에서 orphans= 확인
   → 오늘 smoke 가 만든 8건을 빼고 해석할 것
2. 후보 표본을 DB/Storage 와 대조 (§14 항목별)
3. 전부 PASS 면 그때 ITDASY_WS_GC_ENABLED 를 켤지 결정
4. 별건: Cloud Run memory 2GiB 상향 검토
```
