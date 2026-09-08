# ITDASY — MEDIA ABSOLUTE FINAL PRODUCTION CERTIFICATION

```
FINAL:              CONDITIONAL GREEN
DEPLOY:             YES  — 완료됨. 실제 운영에 반영 확인
PRODUCTION SMOKE:   PASS  (20/20)
GC:                 KEEP OFF
REAL DEVICE:        NOT VERIFIED
TOP RISK:           없음 — GC dry-run 까지 끝났다(ELIGIBLE). 남은 건 실기기 미검증과 P2 부채뿐.
```

---

## DEPLOYMENT

```
Backend SHA        : 9579ec25   (재검증 시점 · 미디어 커밋 4개 전부 조상으로 포함)
                     (최초 반영 e0815c6c → 이후 타 세션 배포 4회 연속 성공하며 전진)
Frontend SHA       : 9623154    (번들 ?v=20260907-1624-9623154 확인)
Cloud Run revision : 배포 성공 후 traffic 100%
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
배포 후 (9579ec25) : 0.111 s     ← 헤더만 읽고 거부
                     8회 실측 .116 .109 .109 .110 .110 .122 .119 .111 → 중앙값 0.111s
                     **13.5배 빠름**
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

## GC — 운영 DRY-RUN 완료 (2026-09-08)

```
enabled   : NO      (ITDASY_WS_GC_ENABLED 부재 — 끝까지 건드리지 않음)
dry_run   : YES
scanned   : 230     live_urls : 194     orphans : 28
grace_skip: 8       errors    : 0       deleted : 0
run_once() 반환: {'dry_run': True, 'scanned': 230, 'orphans': 28, 'grace_skipped': 8, 'deleted': 0}
```

### 🔴 수정이 운영에서 발행 이미지 17건을 살렸다

옛(버그) live-set 과 수정본을 같은 운영 DB 에서 나란히 돌린 결과:

| | live_urls | orphans | grace_skip |
|---|---|---|---|
| 옛 로직(버그) | 177 | **45** | 8 |
| 수정본 | 194 | **28** | 8 |

```
45 − 17 = 28
```

**17건은 살아있는 slot 의 `meta.templateOutputs[].outputUrl` — 실제로 인스타에 올라간 합성본이다.**
옛 로직으로 `ITDASY_WS_GC_ENABLED` 를 켰다면 그 17장이 지워졌다. 로컬 재현이 아니라 운영 데이터 실측이다.
플래그를 안 켜둔 것이 결과적으로 원장님들 사진을 지켰다.

### 후보 28건 개별 감사 (§14)

```
소유자별 : user 3(6) · 5(13) · 23(4) · 41(2) · 43(2) · 45(1)
계정상태 : 6명 전원 **활성** — 탈퇴 잔여물이 아니라 '지운 글'의 잔여물이다
생성일   : 2026-07-05 ~ 08-04 (35~65일 경과) — 최근 업로드 오판 없음
```

RED 조건 4개 전수 점검:

| 조건 | 결과 |
|---|---|
| 살아있는 참조와 겹침 | **0건** ✅ |
| 경로 user_id 와 DB user_id 불일치 | **0건** ✅ |
| 24h 이내 자산이 후보에 섞임 | **0건** ✅ |
| 발행 합성본(meta·publish) 겹침 | **0건** ✅ |

### grace 8건은 내가 만든 것

`user 23`(review@itdasy.com) · 22.4~22.5시간 전 = **2026-09-07 운영 smoke 가 만든 8건**이다.
24h 유예에 정확히 걸려 후보 28 에 **포함되지 않았다**. 유예가 풀리면 후보는 28 → 36 이 된다.
(진짜 내 쓰레기라 지워지는 것이 맞다.)

```
GC DRY-RUN : PASS
GC         : ELIGIBLE
GC ENABLED : NO     ← 켜지 않았다. 실제 활성화는 연준님의 별도 결정이다(§19).
```

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

---

## 재검증 (배포 파이프라인 복구 확인)

내 CI 수정 이후 배포가 **4회 연속 성공**했다 — 파이프라인이 완전히 복구됐다.

```
16:15 10de45d success   16:21 205d947 success
16:36 3c46531 success   16:52 9579ec2 success   ← 현재 서빙
(실패/취소 0건. 내 결함으로 막혀 있던 구간 15:14~15:57 종료)
```

현재 서빙 `9579ec25` 기준 재검증:
```
운영 smoke              20/20 PASS
F-2 67MP 거부           0.111s 중앙값 (8회, 0.109~0.122) — 배포 전 1.50s 대비 13.5배
FE 번들                 ?v=20260907-1624-9623154
  깨진 사진 폴백          표시 + "다시 시도" 버튼 ✅
  업로드 재시도           FormData 7,984ms / JSON 7,000ms — 둘 다 재시도 ✅
  HEIC octet-stream     true ✅
```
