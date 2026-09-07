# ITDASY — MEDIA SYSTEM FINAL RELEASE REPORT
**감사일 2026-09-07 · 대상: 사진/파일/미디어 lifecycle 전체 (편집 기능 제외)**

## OVERALL: 🟡 YELLOW

P0 2건·P1 4건을 찾아 **코드로 고칠 수 있는 것은 전부 고치고 회귀 테스트로 잠갔다.**
YELLOW 인 이유는 **남은 2건이 코드가 아니라 운영 설정 결정**이기 때문이다(아래 NO-GO 조건 참조).
그 2건은 연준님 판단이 필요하다 — 내가 임의로 바꾸면 **실제 원장 파일이 지워지기 시작**한다.

---

## CODEBASE

| 층 | 실체 |
|---|---|
| **Frontend** | 파일 입력 25곳. 업로드 진입점 = `js/workspace/workspace-sync.js`(작업실·주 경로, 1440px 축소) · `app-dm-menu.js`(`/image/upload`) · `app-gallery-finish.js`(`/portfolio`) · `app-portfolio.js`(`/background`) · OCR 4종. 전송은 전부 `window.fetch` 전역 패치(app-core.js:1418) 경유 |
| **Backend** | 업로드 엔드포인트 20+. 저장하는 것은 5개(`workspace_sync`·`image`·`portfolio`·`background`·`templates`), 나머지 OCR/Vision 계열은 **저장 없이 Gemini 로만 전달**(확인함) |
| **DB** | `workspace_slots` / `workspace_slot_photos` / `workspace_assets`(UNIQUE(user_id, content_hash)) / `portfolio` / `background_assets`. 이미지는 URL 문자열로만 참조 |
| **Storage** | Supabase Storage 단일 버킷 `user-uploads`, **public-read**. 키 = `{user_id}/{category}/{uuid4}.{ext}`. 목록 조회는 막혀 있어 열거 불가(실측 400) |
| **CDN** | Supabase 앞단 Cloudflare. 없는 객체는 **400 + JSON**(404 아님), `cache-control: no-cache`, `access-control-allow-origin: *` |
| **Infra** | Cloud Run `itdasy-backend-staging`(asia-northeast3) · **memory 1 GiB · CPU 1 · containerConcurrency 8 · maxScale 5 · timeout 300s** |

---

## 판정 요약

| 영역 | 결과 |
|---|---|
| E2E | **PASS** (수정 후 재실행) |
| MOBILE | ⚠️ **NOT VERIFIED** — 실기기 없음. 뷰포트 에뮬레이션만 |
| HEIC | **PASS** — 정책 일관(클라 heic2any 변환 + 서버 차단). 판별 버그 1건 수정 |
| ORIENTATION | **PASS** — EXIF 1~8 전수 실측 |
| LARGE FILE | **PASS** (수정 후) |
| CANCEL | ⚠️ **N/A — 기능 자체가 없음** (P2, 미수정) |
| RETRY | **PASS** (수정 후. 수정 전 FAIL) |
| DELETE | **PASS** (경로 정합성은 PASS, orphan 은 아래) |
| STALE REACCESS | **PASS** (수정 후. 수정 전 FAIL) |
| CDN/STORAGE FAILURE | **PASS** (수정 후) |
| SECURITY | **PASS** — IDOR·크로스테넌트 전부 차단 확인 |
| DB/STORAGE CONSISTENCY | 🟡 **PARTIAL** — 탈퇴 경로는 수정, 상시 orphan 은 GC 미가동 |
| ORPHAN CHECK | 🔴 **FAIL — GC 가 배포 이래 dry-run** (미수정, 결정 필요) |
| CONCURRENCY | **PASS** — DB UNIQUE 로 방어됨을 실측 |
| UX | 🟡 **PARTIAL** — 실패/복구는 수정, 진행률·취소 없음 |
| ACCESSIBILITY | **PASS** (신규 UI 한정) |
| OBSERVABILITY | 🟡 **PARTIAL** |
| AUTOMATED TESTS | **PASS** — 신규 80개, 전체 4,618개 통과 |

---

## CRITICAL FINDINGS

### F-1 · P0 · 탈퇴해도 손님 사진이 공개 URL 로 영구히 남는다 — ✅ 수정
- **재현**: `DELETE /auth/delete-account` → DB 행은 전부 삭제됨. Supabase Storage 객체는 **0개 삭제**.
- **근본원인**: `routers/auth.py` 의 정리 코드는 `shutil.rmtree(USERS_ROOT/{id})` 뿐 — 그건 **컨테이너 로컬 디스크**다. Cloud Run 은 재배포마다 초기화되는 ephemeral 이라 실사용 사진은 거기 없다. 실제 사진은 전부 Supabase 에 있고 버킷은 public-read.
- **영향**: 원장 사진에는 손님 시술 전/후 얼굴이 들어간다. 탈퇴 뒤에도 URL 을 가진 사람은 계속 받아간다. DM 빠른안내 사진 URL 은 **손님에게 직접 전달된 적이 있는 값**이다. 게다가 DB 행이 먼저 지워져 orphan GC 가 영영 못 찾는다(GC 는 `WorkspaceAsset` 순회) → **되돌릴 방법 없는 영구 잔류**. `delete_account` docstring 의 "모든 사용자 데이터 즉시 파기" 와 불일치(PIPA · Apple 5.1.1(v)).
- **수정**: `utils/cloud_storage.py` 에 `delete_user_prefix()` 신설 — 키가 `{user_id}/...` 라 접두사로 전량 식별된다. 재귀 목록 + 100개씩 일괄 DELETE. `auth.py` 에서 DB 커밋 뒤 베스트에포트 호출(실패해도 탈퇴는 되돌리지 않고 감사 로그에 숫자로 남김).
- **회귀 테스트**: `test_delete_account_wipes_all_storage_objects_for_user`(`70/` 을 `7/` 로 오인하지 않는지 포함) · `test_delete_user_prefix_never_raises_on_storage_outage` · `test_delete_account_calls_storage_wipe`(배선 끊김 감지)
- **검증**: 3/3 통과. ⚠️ **실 Supabase 왕복은 미검증** — 운영 service key 를 끌어오지 않았다. REST 계약을 그대로 흉내낸 로컬 목으로만 확인.

### F-2 · P0 · decompression bomb 가드가 메모리를 하나도 안 막고 있었다 — ✅ 수정
- **재현**: 8192×8192(67.1MP) 부드러운 사진을 JPEG 로 저장하면 **1.08 MB**. 업로드 → 거부되기까지 **515 MB** 할당.
- **근본원인**: `utils/image_safety.py` 에서 크기 검사가 `ImageOps.exif_transpose()` **다음에** 있었다. transpose 는 래스터를 실제로 펼친다 → **거부될 이미지도 일단 다 디코드하고 나서** 거부. 가드가 상태코드만 맞히고 있었다. 파일 크기 한도(20MB)로는 못 막는다 — 픽셀 수는 압축률과 무관하다.
- **영향**: 1 GiB / concurrency 8 인스턴스에서 **1 MB 짜리 요청 두 건이면 OOM**. OOM 은 그 인스턴스에 물려 있던 나머지 요청 6건까지 같이 죽인다. 인증이 필요하지만 원장 1명이 실수로 큰 사진을 몇 장 올려도 도달한다.
- **수정**: `Image.open()` 은 헤더만 읽는 지연 로딩이라 `size` 는 디코드 없이 안다. 크기 검사를 `exif_transpose()` 앞으로 이동.
- **검증**: **515 MB → 2.2 MB**, 8배 빠름. 통과하는 이미지 동작 무변경(EXIF orientation 1~8 전수 재통과).
- **회귀 테스트**: `test_oversize_image_is_rejected_before_decoding`(실제 RSS 측정) + `test_pixel_guard_precedes_transpose_in_source`(소스 순서 고정)

### F-3 · P1 · 모든 사진 업로드가 재시도 0회였다 — ✅ 수정
- **재현**(로컬 실패주입 서버 + 배포본 코드, 브라우저 실측):

  | 요청 | 서버가 받은 횟수 | 걸린 시간 |
  |---|---|---|
  | JSON body + 503 | 5회 | 8.0s |
  | **FormData + 503** | **1회** | 0.005s |
  | **FormData + 무응답** | **1회**, 20.9s 에 abort | — |

- **근본원인**: `app-core.js` `_bodyReusable()` 이 *"FormData/Blob/ReadableStream 은 한 번만 읽을 수 있다"* 고 단정했다. **사실이 아니다.** 브라우저는 fetch 마다 FormData/Blob 을 새로 직렬화한다 — 같은 객체로 3회 POST 하면 서버가 3회 다 온전한 바디를 받는다(실측). 1회성인 건 ReadableStream 뿐.
- **영향**: Cloud Run 콜드스타트 503 한 번에 원장 사진이 그냥 안 올라갔다. 게다가 재접속 토스트가 `if (retryable && attempt >= 1)` 안이라 **토스트도 안 떴다** — 조용한 실패.
- **수정**: FormData/Blob/ArrayBuffer/URLSearchParams 를 재사용 가능으로 정정. **동시에** `portfolio`·`background` 를 `CREATE_NO_RETRY_RE` 에 추가 — 둘은 컬렉션 POST 로 DB 행을 만들어서, 응답만 유실된 경우 재시도가 사진을 2장 만든다.
- **검증**(수정 후 브라우저 실측): `/workspace/slots/image` 4회 · `/image/upload` 4회 · `/portfolio` 1회 · `/background` 1회 · `/bookings` 1회.
- **회귀 테스트**: `__tests__/media-upload-retry-2026-09-07.test.js` 11개

### F-4 · P1 · 사진이 사라지면 회색 빈 칸만 남는다 — ✅ 수정
- **재현**: 죽은 Supabase URL 을 포트폴리오 카드 마크업 그대로 렌더 → `error` 이벤트는 493ms 에 뜨는데 **받는 핸들러가 없다.** 빈 칸만 남음.
- **근본원인**: 미디어 `<img>` 에 `onerror` 가 **한 곳도 없다** — `app-portfolio.js:236·299·508` · `app-gallery-workshop.js:406` · `js/workspace/workspace-perf.js:607`. (onerror 가 있는 건 외부 프로필 사진뿐.)
- **영향**: 원장님은 '아직 뜨는 중'인지 '없어진 것'인지 구분할 수 없고 다시 시도할 방법도 없다.
- **수정**: `js/media-fallback.js` 신규(70줄). `error` 는 버블링하지 않으므로 **캡처 단계**에서 document 하나로 받는다(개별 img 수정 0건, 앞으로 생길 카드도 자동 적용). 1회 캐시버스터 자동 재시도 → 그래도 실패면 `사진을 못 불러왔어요 + 다시 시도`.
- **검증**: 브라우저 실측 — 폴백 2/2 표시, 자동 재시도 1회 확인, `다시 시도` 로 실제 복구(naturalWidth 150), inline onerror 있는 img 는 자기 폴백 유지.
- **회귀 테스트**: `__tests__/media-fallback-2026-09-07.test.js` 12개(배선·접근성·비간섭 포함)

### F-5 · P1 · Storage 일시 장애가 500 으로 샜다 — ✅ 수정
- **재현**: Storage 계층에 `RuntimeError("Supabase 502")` 주입 → `workspace_sync.upload_slot_image` 가 `HTTPException` 이 아닌 **RuntimeError 를 그대로 올려 500**.
- **근본원인**: `except CloudStorageNotConfigured` 만 잡았다. httpx 타임아웃·502·커넥션리셋은 안 잡힌다. `routers/image.py` 는 이미 502 로 처리하고 있었는데 **주 사진 경로인 workspace_sync·portfolio·background 만 빠져 있었다.**
- **영향**: 500 은 '서버 코드가 터졌다' 는 뜻 → 로그에서 진짜 버그와 안 구분되고, 클라 재시도 정책도 '일시 장애'로 못 알아본다.
- **수정**: 세 라우터 모두 `except Exception` → 503 + 사람이 읽을 수 있는 문구.
- **회귀 테스트**: `test_storage_outage_is_503_not_500`(3개 라우터 파라미터화)

### F-6 · P2 · 파일명이 object key 를 조작할 수 있었다 — ✅ 수정
- **재현**(실제 `upload_bytes` 호출): `a.jp/../../../etc/passwd` → key `7/dm_menu/<uuid>./etc/` · `a.jpg?x=1` → key `...jpg?x`
- **영향**: `{user_id}/` 접두사는 남아 남의 폴더로 새진 **않는다**(크로스테넌트 아님). 하지만 key 에 `?`·`#` 가 들어가면 저장된 URL 이 거기서 잘려 **영영 404** 이고, URL 이 DB 에 통째로 박혀 되돌릴 방법이 없다.
- **수정**: `_safe_ext()` — 영숫자 1~5자만 통과, 나머지는 `jpg`.
- **회귀 테스트**: 10 케이스 파라미터화(유니코드 파일명·대문자 확장자 정상 통과 포함)

### F-7 · P2 · DM 빠른안내 사진만 원본 그대로 올림 — ✅ 수정
- 다른 경로는 전부 축소하는데(작업실 1440 · 잇비 1024 · 영수증 1024) `app-dm-menu.js` 만 **최대 10MB 원본**. 20초 안에 끝내려면 4Mbps 를 계속 유지해야 한다. 서버도 어차피 2000px 로 줄여 저장한다. → 1600px 축소 후 전송.

### F-8 · P2 · HEIC 판별이 MIME 을 너무 믿었다 — ✅ 수정
- `isHeic` 가 `!file.type`(MIME 이 **완전히 빈** 경우)에만 확장자 폴백을 태웠다. `application/octet-stream` 으로 주는 웹뷰에선 변환을 건너뛰고 원본 HEIC 가 `<img>`/canvas 로 흘러가 실패. 드래그앤드롭에선 `image/*` 필터에도 걸려 **아무 안내 없이 사라졌다.**
- 참고 — **HEIC 정책은 일관되다**: 클라 heic2any 변환(CDN 200/1.35MB 도달 확인) + 서버 차단(`ALLOWED_FORMATS={JPEG,PNG,WEBP}`, pillow-heif 미설치 → 400).

### F-9 · P2 · 타임아웃 사유가 영어 원문으로 노출 — ✅ 수정
- 토스트에 그대로 떴다: `사진 업로드 실패: signal is aborted without reason`. → abort 에 한국어 사유를 실어준다(`name` 은 `AbortError` 유지 → 기존 분기 무변경). 업로드 타임아웃도 20초 → 90초.

---

## 🔴 미수정 — 결정이 필요한 것

### R-1 · P1 · orphan GC 가 배포 이래 한 번도 안 돌았다
- **실측**: Cloud Run env 62개 중 **`ITDASY_WS_GC_ENABLED` 없음.** `services/workspace_gc.py` 는 이 값이 없으면 **dry-run**(로그만, 삭제 0). 즉 하루 1회 크론은 돌지만 **지금까지 지운 객체가 0개**다.
- **영향**: 지운 작업실 사진의 Storage 객체가 무한 누적. 비용 + 지웠다고 생각한 사진이 URL 로는 계속 열림.
- **왜 내가 안 켰나**: 켜는 순간 **실제 원장 파일이 지워지기 시작**한다. 되돌릴 수 없다.
- **권하는 순서**: ① 지금 상태로 로그의 dry-run 숫자(`orphans=`)를 먼저 확인 → ② 규모가 납득되면 켠다. GC 는 24h grace + 1회 500개 상한이 이미 걸려 있다.

### R-2 · P1 · 정상 사진 1장이 420 MB 를 쓴다 (용량 결정)
- **실측**: 7300×5400(39.4MP) 사진 = JPEG **2.89 MB** → 처리 피크 **420 MB**. 한도(40MP) 안이라 정상 통과한다.
- 1 GiB / concurrency 8 이면 **이런 사진 2장이 동시에 오면 OOM**. F-2 를 고쳐 '거부되는' 폭탄은 막았지만 **'통과하는' 큰 사진은 그대로다.**
- **선택지**: ⓐ Cloud Run memory 2 GiB (가장 단순, 비용↑) · ⓑ `MAX_PIXELS` 40MP → 24MP 하향(아이폰 기본 24MP 는 통과, 48MP ProRAW 는 거부) · ⓒ 업로드 라우트만 concurrency 하향.
- 참고: 주 경로인 작업실은 FE 가 1440px 로 줄여 보내므로 실사용 위험은 `/portfolio`·`/background` 쪽에 몰려 있다.

### R-3 · P2 · 업로드 진행률·취소가 없다
- `XMLHttpRequest`·`upload.onprogress`·업로드용 `AbortController` **0건**. 취소는 UI 로도 lifecycle 로도 불가능.
- 주 경로는 200~400KB 라 체감이 작지만, 캐러셀 10장 + 느린 회선이면 무피드백 구간이 길다. 제품 판단 필요.

### R-4 · P2 · 남은 orphan 경로 2개
- `portfolio`/`background` 삭제 시 Storage 삭제가 실패하면 재시도가 없다(GC 대상도 아님). **실측 확인**: DB 0행 / Storage 1객체.
- Storage 성공 + DB 실패 시 200 을 주는데 `WorkspaceAsset` 행이 없다 → GC 가 못 찾는 미추적 객체. **실측 확인**. (탈퇴 시엔 F-1 의 접두사 삭제가 함께 걷어낸다.)

---

## 검증 못 한 것 (정직하게)
- **실기기**: iPhone Safari / Android Chrome **미검증**. 카메라 캡처·Live Photo·네트워크 전환·화면잠금·백그라운드 전환 전부 실기기 필요.
- **실 Supabase 왕복**: `delete_user_prefix` 는 REST 계약을 흉내낸 목으로만 검증. 운영 service key 미사용.
- **브라우저 시각 확인**: 미리보기 탭이 `document.hidden=true` · 뷰포트 0×0 이라 스크린샷이 신뢰할 수 없다. DOM 어서션으로 대체했다.
  ⚠️ 이 함정 때문에 감사 중간에 **"`loading=lazy` 카드가 영구 로딩된다"** 고 판단했다가 **철회**했다 — 숨은 탭에서 lazy 가 안 도는 것이 원인이었지 앱 버그가 아니었다.

---

## FILES CHANGED

**백엔드** (`itdasy-be-mediaqa`, `fix/media-lifecycle-audit`, `868d5c4`)
```
backend/utils/cloud_storage.py     +115  _safe_ext() · delete_user_prefix()
backend/utils/image_safety.py       +25  크기 검사를 디코드 앞으로
backend/routers/auth.py             +19  탈퇴 시 Storage 전량 삭제
backend/routers/workspace_sync.py    +8  Storage 장애 503
backend/routers/portfolio.py         +4  동일
backend/routers/background.py        +4  동일
backend/tests/test_media_lifecycle_audit_2026_09_07.py  +592  신규 52개
```

**프론트** (`itdasy-fe-mediaqa`, `fix/media-lifecycle-audit`, `8711fc7`)
```
app-core.js                        +54  업로드 재시도·타임아웃·한국어 abort 사유
js/media-fallback.js               +70  신규 — 사진 실패 회수
js/heic-convert.js                 +10  HEIC 판별
app-dm-menu.js                     +13  업로드 전 축소
css/components.css                 +20  폴백 스타일
index.html                          +1  스크립트 등록
.ai/APP_FEATURE_INDEX.md                인덱스 갱신
__tests__/*-2026-09-07.test.js    +285  신규 28개
```

---

## TEST EVIDENCE

```
pytest tests/                 3062 passed, 60 skipped, 1 failed*, 1 xfailed  (신규 52)
  * test_D2_today_date_duplicated_with_header — 수정 전 clean HEAD 에서도 동일 실패.
    이번 변경과 무관(다른 세션 작업 중)임을 git stash 로 대조 확인.
jest --rootDir .              79 suites / 1556 passed                        (신규 28)
node scripts/smoke-check.js --git   passed (92 scripts, 182 lazy entries)
eslint 'app-*.js' 'js/**/*.js'      190 warnings → 190 (신규 0)
stylelint css/components.css        clean
```

**실행한 실패주입**
| 주입 | 결과 |
|---|---|
| 0-byte · truncated · 셸스크립트-as-jpg · 매직바이트만 위조 · SVG · 63MP | 전부 400 차단, Storage 객체 0 |
| MIME 위조 양방향(`octet-stream`+진짜이미지 / `image/jpeg`+스크립트) | 전부 400 |
| EXIF orientation 1~8 (원본 800×1200) | 5~8 은 1200×800 로 저장, 태그·GPS 제거 확인 |
| 5MB / 11MB / 21MB | 통과 / 통과 / 400 |
| Storage 미설정 · Storage 502 · Storage 삭제 실패 · DB commit 실패 | 각각 503 / 503 / orphan 확인 / orphan 확인 |
| 같은 내용 2회 · 다른 사용자 같은 사진 · UNIQUE 동시 삽입 | dedupe(업로드 1회) / 분리됨 / IntegrityError |
| 남의 portfolio 삭제 · 남의 slot 삭제 · 목록 스코프 | 전부 차단, 남의 파일 무사 |
| 무응답 20s · 503 · FormData vs JSON 재시도 대조 | 브라우저 실측(위 표) |
| 죽은 Supabase URL → `<img>` | 400+JSON 확인, 폴백 UI 동작 확인 |

---

## FINAL DECISION: 🟡 조건부 GO

**코드 관점의 출시 차단 요소는 0 이다.** P0 2건·P1 3건 전부 수정 + 회귀 테스트로 잠갔다.

다만 다음 **3가지가 남아 있어 무조건 GO 는 아니다**:
1. **R-1 (GC dry-run)** — 결정만 하면 된다. 내가 켜면 실파일이 지워지기 시작해서 손대지 않았다.
2. **R-2 (1 GiB / 정상 39MP 사진 420MB)** — 용량 결정. F-2 수정으로 급성 위험은 내려갔다.
3. **실기기 미검증** — 카메라·네트워크 전환은 실기기 없이는 판정할 수 없다.

이 3개가 정리되면 GREEN 이다. **배포는 아직 안 했다** — 두 레포 모두 격리 워크트리의 `fix/media-lifecycle-audit` 브랜치에 **로컬 커밋만** 해뒀다. 탈퇴 삭제·전역 fetch 를 건드리는 변경이라 push 전 확인을 받는 게 맞다고 판단했다.
