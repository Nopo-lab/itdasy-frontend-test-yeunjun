# 설계 — 작업실 콘텐츠(slot) 계정 기준 기기 간 동기화

> 상태: **설계안 (승인 대기)** · 작성 2026-07-05 · 대상 레포: `itdasy_backend-test`(BE) + `itdasy-frontend-test-yeunjun`(FE)
> 승인 전 커밋·구현 금지 (승인 게이트 준수).

---

## 0. 먼저 — 브리핑과 실제 코드가 다른 점 2가지 (보스 확인 필요)

1. **이미지 저장소는 R2가 아니라 Supabase Storage.**
   브리핑엔 "이미지는 Cloudflare R2"라고 되어 있으나, 스테이징 백엔드 실제 코드(`backend/utils/cloud_storage.py`)는 **Supabase Storage**(버킷 `user-uploads`, 공개 버킷, 경로 `{user_id}/{category}/{uuid}.{ext}`)를 씀. 발행 사진(portfolio)도 여기 올라감. → **이 설계는 Supabase Storage 기준.** (R2로 가야 하면 별도 지시.)

2. **테스트 백엔드엔 Alembic이 없음.**
   스키마 진화는 `models.Base.metadata.create_all()`(신규 테이블 자동 생성) + `main.py:213`의 수동 `_ensure_col()`(신규 컬럼 ALTER) 방식. → **새 테이블은 SQLAlchemy 모델만 추가하면 자동 생성**, 컬럼 추가는 `_ensure_col` 한 줄. Alembic 리비전 이슈(메모리의 32자 제한 사고)는 여기 해당 없음.

---

## 1. 현재 구조 (있는 그대로)

| 항목 | 위치 | 내용 |
|---|---|---|
| 로컬 저장 | `app-gallery-db.js` | IndexedDB `itdasy-gallery` v3, store `slots`(keyPath `id`), `order` 내림차순 정렬 |
| 저장 진입점 | `WorkspaceAdapter.saveItem(slot)` (`workspace-adapter.js:499`) | `saveSlotToDB` + `saveToGallery` |
| 홈 렌더 | `workspace-v2-home.js:305` | `loadSlotsFromDB()` → render |
| slot 구조 | `workspace-v2-flow.js` buildSlot | `{id, label, photos[], caption, hashtags, publish, customer_id, order, service, ...}` |
| photo 구조 | 〃 | `{id, dataUrl, editedDataUrl, baseUrl, editState, role, ...}` — **이미지는 멀티-MB dataURL** |
| 계정 격리 | `clearGalleryDB()` | 로그아웃·계정 전환 시 IndexedDB 전체 폐기 |
| 서버 통신 | `app-core.js` | `window.apiUrl()` / `apiFetch()` / `authHeader()` / `getToken()`, 토큰키 `itdasy_token::staging` |
| 이미지 축소 | `workspace-adapter.js:27` `_toJpegBlob` | 최장축 1440 · JPEG q0.86 (Cloud Run 32MB 한도 대응, 이미 존재) |

**핵심 난점:** `photo.editState`(레이어·조정값) 안에 `editState.photos:[base64]`, 스티커/로고 `layers[].src:data:...` 같은 **중첩 dataURL**이 들어있음(`workspace-v2-flow.js:641`). 즉 editState는 순수 메타가 아니라 이미지도 품음 → 서버 전송 전 **dataURL 외부화(externalize)** 가 필요.

---

## 2. 데이터 모델 (서버, Postgres via SQLAlchemy)

동기 키는 **클라이언트 uuid(`slot.id`, `photo.id`)** 를 그대로 사용. 서버는 자체 PK 별도.

### `workspace_slots` — slot 메타 1행/slot
```
id           BIGINT PK
user_id      INT FK users.id, index         -- 스코프 강제
slot_id      VARCHAR index                   -- 클라 uuid (기기·편집 넘어 안정)
label        VARCHAR
caption      TEXT
hashtags     TEXT
publish      JSONB    -- {status, ...}
customer_id  INT NULL
sort_order   INT      -- 클라 slot.order
meta         JSONB    -- service/keywords/purpose/captionMode 등 나머지 slot 필드 (미래 호환)
client_updated_at  TIMESTAMPTZ   -- LWW 기준 (클라가 보낸 편집시각)
deleted      BOOLEAN default false           -- tombstone
deleted_at   TIMESTAMPTZ NULL
server_updated_at  TIMESTAMPTZ  -- 서버 반영시각 (delta pull `since` 기준)
created_at   TIMESTAMPTZ
UNIQUE(user_id, slot_id)
```

### `workspace_slot_photos` — slot당 사진 N행
```
id           BIGINT PK
user_id      INT index                       -- 스코프 강제 (조인 없이도 필터)
slot_id      VARCHAR index                    -- 소속 slot
photo_id     VARCHAR                          -- 클라 uuid
role         VARCHAR                          -- hero/before/after/auto
image_url    VARCHAR                          -- 대표 이미지(=editedDataUrl 우선) Supabase URL
base_url     VARCHAR NULL                     -- 깨끗한 원본 Supabase URL
edit_state   JSONB NULL                       -- 레이어·조정값. 중첩 dataURL은 URL로 치환됨(§4)
sort_order   INT
client_updated_at  TIMESTAMPTZ
UNIQUE(user_id, slot_id, photo_id)
```

### `workspace_assets` — 업로드 dedupe (재업로드 방지)
```
id           BIGINT PK
user_id      INT index
content_hash VARCHAR index                    -- sha256(bytes)
url          VARCHAR                           -- Supabase 공개 URL
created_at   TIMESTAMPTZ
UNIQUE(user_id, content_hash)
```
> 같은 사진이 여러 slot·여러 저장에 걸쳐 반복돼도 **1회만 업로드**. `backend/image.py`의 content-hash dedup 철학과 동일.

Storage 경로: `{user_id}/workspace/{content_hash}.jpg` (기존 `upload_bytes` 재사용).

---

## 3. API 엔드포인트 (신규 라우터 `routers/workspace_sync.py`, prefix `/workspace/slots`)

모두 `user_id = Depends(get_current_user)` — **토큰의 user_id만 신뢰**, 모든 쿼리 `WHERE user_id=?`.

| 메서드·경로 | 용도 | 요청/응답 |
|---|---|---|
| `POST /workspace/slots/image` | 이미지 1장 업로드(멀티파트) | in: 파일. 처리: EXIF strip→JPEG→content_hash. `workspace_assets` hit면 재업로드 안 하고 기존 URL 반환. out: `{url, content_hash}` |
| `POST /workspace/slots/upsert` | slot 1개 메타+사진 메타 업서트(JSON) | in: 이미 URL로 치환된 slot. **LWW**: `client_updated_at <= 저장값`이면 스킵하고 저장본 반환. out: 서버 정본 slot |
| `GET /workspace/slots?since=<iso>` | delta pull | out: `since` 이후 바뀐 slot들(사진·editState 포함) **+ tombstone**. `since` 없으면 전체. |
| `DELETE /workspace/slots/{slot_id}` | soft delete | tombstone(deleted=true, deleted_at). 다른 slot이 참조 안 하는 이미지만 best-effort Storage 정리 |

- 이미지 검증: `validate_and_strip_exif` + `to_jpeg`(포트폴리오와 동일), 20MB/장 한도.
- `upsert`는 사진 배열 전체 교체(replace) 방식 — slot 내 사진 추가/삭제 그대로 반영.
- **최초 로그인 마이그레이션은 별도 API 불필요** — 로컬 slot 전부를 dirty로 표시해 `upsert` 반복 호출(멱등, slot_id 기준).

---

## 4. 프론트 동기화 엔진 (신규 `js/workspace/workspace-sync.js`)

로컬 IndexedDB는 **캐시로 유지**(오프라인 동작). 저장·삭제는 항상 로컬 먼저 → 아웃박스에 sync op 적재.

### 로컬 스키마 변경 (IndexedDB v3 → v4)
- slot에 `updatedAt`(매 저장 시각) · `syncState`('dirty'|'synced') 필드 추가
- 새 store `sync_outbox` — 미전송 업서트/삭제 op (오프라인 큐)
- 새 store `sync_meta` — `{lastPulledAt, deviceId, migratedAt}`

### 트리거
- 앱 포그라운드 복귀 / 로그인 직후 → `pull()` + `flushOutbox()`
- 작업실 홈 열 때 → `pull()`
- 최종 액션(저장/발행/고객연결) 후 → 해당 slot `pushDirty()`
- `window 'online'` 이벤트 → `flushOutbox()`

### 흐름
```
저장(saveItem)  → 로컬저장 + slot.updatedAt=now + syncState='dirty' + outbox 적재 → pushDirty()
pushDirty(slot) → slot 내 모든 dataURL 수집 → 바뀐 것만 /image 업로드(hash dedupe) →
                  dataURL을 URL로 치환한 slot → /upsert → 성공 시 syncState='synced'
pull(since)     → GET delta → LWW 병합(updatedAt 비교) → tombstone은 로컬 삭제 → 홈 새로고침
삭제            → 로컬 삭제 + tombstone outbox → DELETE /slots/{id}
```

### dataURL 외부화 (핵심 로직)
전송 직전 slot 객체를 walk → `data:` URL 전부 수집(§1의 중첩 포함): `photos[].dataUrl/editedDataUrl/baseUrl`, `editState.photos[]`, `layers[].src`(이미지 스티커·로고). 유니크 hash별 1회 업로드 → `Map(dataURL→url)` 로 치환. 다운로드 시 표시는 https URL 그대로 사용.

---

## 5. 충돌·오프라인·마이그레이션

- **충돌 = LWW(updatedAt)**. 두 기기가 같은 slot을 오프라인 편집 후 재접속 → 나중 시각이 이김. (1인 다기기 시나리오라 충돌 드묾, 손실 허용 범위. 필요 시 Phase B에서 필드 병합 검토.)
- **삭제 우선**: tombstone은 `deleted_at`이 상대의 `updated_at`보다 최신이면 삭제가 이김 → 되살아남 방지.
- **오프라인**: 아웃박스가 IndexedDB에 영속 → 재접속 시 flush. 업로드 실패해도 로컬 저장은 이미 성공(사용자 절대 안 막음), slot은 dirty로 남아 재시도.
- **최초 마이그레이션**: 플래그 ON 후 첫 동기화에서 `sync_meta.migratedAt` 없으면 → 로컬 slot 전체 dirty 처리 → pushDirty. slot_id 기준이라 재실행 안전(멱등). 완료 후 migratedAt 기록.
- **계정 격리 유지**: 로그아웃 시 `clearGalleryDB()` 그대로. 같은 계정 재로그인 → pull로 복원. 다른 계정 → 서버가 user_id 스코프 + 로컬 wipe라 누수 없음.

---

## 6. 비용 방어 (정책 유지)

- 편집 **중간 저장 없음** — 업로드는 최종 액션(저장/발행)에서만. `saveItem` 경로가 이미 그 지점.
- `content_hash` dedupe — 안 바뀐 사진은 재업로드 0.
- 클라 사전 축소(1440/JPEG q0.86, 기존 `_toJpegBlob`) → Storage·트래픽·32MB 한도 동시 해결.
- delta pull(`since`) → 메타만 작게. editState JSON엔 이미지 없음(URL만).

---

## 7. 보안

- 전 엔드포인트 `get_current_user` — 클라 user_id 안 믿음, 모든 행 `WHERE user_id=?`.
- Storage 경로 `{user_id}/workspace/` 접두. 공개 버킷+추측 불가 URL(=포트폴리오와 동일 수준). ⚠️ 공개 버킷이라 URL 아는 사람은 조회 가능 — 현 포스처와 동일, 추후 signed URL 승격 여지(리스크로 기록).
- EXIF strip + 이미지 검증 + 크기 한도.

---

## 8. 롤아웃 플래그 (단계적)

- FE: **`ITDASY_SLOT_SYNC`**(기본 `false`) — 동기화 모듈 init 게이트. false면 지금 로컬 전용 동작 100% 그대로.
- BE: 엔드포인트는 배포해도 미사용 시 무해. 필요 시 env `WORKSPACE_SYNC_ENABLED`로 404 가드.
- 단계: ① 연준 계정 내부 검증 → ② 소수 CBT → ③ 전체.

---

## 9. 알려진 한계 / 리스크 (정직하게)

1. **editState 재편집 라운드트립(CORS/tainted canvas).** 외부화한 https 이미지를 다른 기기에서 캔버스로 다시 편집·export 하려면 Supabase 응답에 CORS 허용 + `crossOrigin='anonymous'` 필요. 표시(뷰·발행)는 문제없음. **레이어 단위 "이어서 편집" 완전 재현은 Phase B**로 분리 제안.
2. LWW는 필드 단위 병합이 아님 — 동시 편집 손실 가능(저확률).
3. 첫 마이그레이션 시 다량 사진 일괄 업로드 → 최초 1회 네트워크 부담(백그라운드·재시도로 완화).

---

## 10. 구현 순서 (승인 후)

- **BE-1** 모델 3개(`workspace_slots`/`_photos`/`_assets`) + 라우터 `workspace_sync.py`(4 엔드포인트) + main 등록. (create_all 자동생성)
- **BE-2** content_hash dedupe·tombstone·Storage 정리, user_id 스코프 테스트.
- **FE-1** IndexedDB v4 마이그레이션 + `workspace-sync.js`(outbox/pull/push/외부화) + 플래그.
- **FE-2** saveItem/delete/home 트리거 연결, 최초 로그인 마이그레이션.
- **FE-3** 오프라인·재접속·다기기 라운드트립 라이브 QA.
- 각 단계 승인 게이트 · 저위험분리 배포.

### 범위 제안: **Phase A(이번)** = 뷰·발행·재캡션·처음부터 재편집 가능한 완전 동기화 / **Phase B(후속)** = 레이어 단위 이어서 편집 CORS 라운드트립.
