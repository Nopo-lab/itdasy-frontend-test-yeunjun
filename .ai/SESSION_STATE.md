# SESSION_STATE — 세션 인수인계 파일

> 새 세션이 시작되면 **이 파일을 먼저 읽고** 현재 단계·대기 결정·마지막 체크포인트를 파악한다.

**LAST UPDATED:** 2026-05-17 · 뷰티업GPT P1-5 + 사진 편집기 P0 MVP

---

## 🟣 2026-05-17 22:00 — 사진 편집기 P0 MVP (티켓 P0-PE-1/2/3 통합)

설계 문서: `~/.claude/plans/zesty-snacking-clarke.md` §25

신규 모듈:
- `app-photo-editor.js` (≈540줄) — 8탭 시트 (자동/보정/뷰티/누끼·배경/템플릿/텍스트/브랜드/내보내기)
  · 캔버스 합성: CSS filter (밝기/채도/색온도/대비) + unsharp mask (선명도)
  · 비율 4종: 원본/1:1/4:5/9:16 자동 자르기 + export
  · 워터마크: 위치 4종(tl/tr/bl/br) + 투명도 + localStorage 기본값 저장
  · 텍스트 1개: 시술명·가격 자동 prefill, 위치 슬라이더
  · history stack 20 + undo
  · 원본/편집 비교: 캔버스 롱탭 또는 "원본" 버튼
- `css/screens/photo-editor.css` (≈200줄) — 다크 테마, 8탭 가로 스크롤

연결:
- `app-assistant-actions-marketing.js` — kind 6종 추가 (open_photo_editor, apply_photo_preset, adjust_photo, add_text_overlay, add_watermark, export_marketing_image)
- `app-assistant.js` — `registerLocalHandler(kind, handler)` API 추가 → open_photo_editor는 백엔드 호출 없이 프론트 단독 실행
- `app-ai-hub.js` — AI·자동화 시트에 "사진 편집기" 행 추가 (NEW 배지)
- `index.html` — CSS/JS 1줄씩 로드, app-assistant/ai-hub 버스터 v167

진입로 3가지 (사용자 테스트용):
1. **AI 자동화 시트 → "사진 편집기"** 행 탭 → 시트 오픈 → 파일 고르기 → 8탭 편집 → 저장
2. **챗봇:** `window.PhotoEditor.open({src: 'blob:...'})` 콘솔 (또는 backend가 open_photo_editor 액션 응답 시 카드 → 실행)
3. **AI 비서 액션 카드:** open_photo_editor kind를 받으면 즉시 편집기 오픈 (로컬 핸들러)

회귀 영향:
- 원본 blob/URL 절대 덮어쓰지 않음
- 기존 누끼·자동보정·B&A는 0줄 수정. 편집기는 별도 시트로 분리
- assistant `_executeAction`은 로컬 핸들러 우선 분기 1개만 추가 (기존 18 kind 0줄 영향)

다음 (P1 잔여 — 사진 편집기):
- 뷰티 탭 5 슬라이더 (피부톤/붉은기/모발 윤기/네일 광택/속눈썹)
- 템플릿 탭 5종 (B&A 좌우/상하/후기/가격/시술 안내)
- 편집 완료 → 캡션 카드 자동 연결
- 인스타 미리보기 4:5/1:1/9:16 자동 매핑
- brand_kit UI (샵 설정 화면)

---

## 🟣 2026-05-17 18:00 — 뷰티업GPT 초고도화 P1-5 (AI 브리핑 카드)

설계 문서: `~/.claude/plans/zesty-snacking-clarke.md` §7

신규/수정:
- `app-customer-ai-brief.js` 신규 (≤350줄) — `/customers/{id}/ai-brief` 우선, 없으면 dashboard 페이로드로 클라이언트 컴퓨트
- `app-customer-chips.js` — `pickAll`/`renderTopN` 노출 (브리핑 카드에서 상위 3개 chip 호스팅)
- `app-customer-dashboard.js` — Hero 뒤 `#cdAiBriefMount` 삽입 + 두 경로(dashboard / 폴백)에서 모두 렌더
- `app-calendar-view.js` — 예약 폼 고객 섹션 안에 `#bfAiBriefMount` 삽입 + 고객 picker로 선택 시 브리핑 갱신, prefill(수정/대시보드 진입) 케이스도 1회 렌더
- `index.html` — `app-customer-ai-brief.js` 로드 (customer-hub 이전), customer-dashboard/calendar-view 버스터 v167

회귀 영향: 백엔드 ai-brief 부재 시 클라이언트 폴백만으로 동작. 카드 비어 있으면 자체 숨김 — 기존 화면 외형 영향 없음.

다음 (P1 잔여):
- 백엔드 `/customers/{id}/ai-brief` 스켈레톤 (LLM 요약 + churn_risk)
- treatment 1급 엔티티 (백엔드 협업)
- send_message 실제 발송 결선 (백엔드 SMS/알림톡 게이트)

---

## 🔴 새 세션은 먼저 읽기

- **현재 Phase:** 9 — 전면 최적화 + 신기능 (플랜 파일 참조)
- **플랜 파일:** `~/.claude/plans/lively-sniffing-pudding.md`
- **이전 완료:** Phase 0~6.4 완전 완료. Phase 7(앱 심사 50%), Phase 8(운영 승격 50%)
- **최신 빌드:** `20260506-v101-phase3-5`

**불가침 영역:**
- 글쓰기 탭 시나리오 팝업(`openCaptionScenarioPopup` / `scenario-selector.js` / `_doGenerateCaption`) — 원영님 "이 로직 최고". 에러 핸들러 문구 1군데 외 수정 금지.
- `#personaDash` div, `cbt1ResetArea` 버튼, `components/scenario-selector.js` 보존

---

## 🔵 Phase 9 진행 현황

### LAST CHECKPOINT — 2026-05-16 18:45
- 프론트 연준 테스트: 로컬 `main` 과 GitHub `origin/main` 동일 (`3742715`).
- 프론트 운영: GitHub `frontend/main` 은 로컬보다 7개 새 커밋이 있고, 로컬은 운영보다 164개 앞서 있어 서로 섞임. 바로 덮어쓰기 금지.
- 백엔드 스테이징: 로컬 `main` 과 GitHub `test/main` 동일 (`f1fbaac`).
- 백엔드 운영: GitHub `origin/main` 은 스테이징보다 61개 뒤처짐.

### Phase 1: 서버 연결 불안정 수정 ✅ 완료 (2026-05-06)
- `app-core.js`: RETRY_STATUSES에 500 추가, MAX_RETRIES 3회, BACKOFF_MS [500,1500,4000]
- `app-core.js`: JSON POST도 재시도 허용 (_isRetryableMethod 확장)
- `app-core.js`: safeFetch timeout 15s → 25s
- `app-perf-recovery.js`: prefetch timeout 8s → 20s
- `app-perf-recovery.js`: _probeBackendOnline → /auth/me 실제 API ping으로 교체
- `app-dm-autoreply.js`: read timeout 8s → 15s

### Phase 2: 성능 최적화 ✅ 1차 완료 (2026-05-06)
- `app-customer-cache.js` 신규: 고객 목록 공유 캐시 + 중복 요청 방지
- `app-customer.js` / `app-customer-hub.js` / `app-customer-dashboard.js`: 같은 고객 캐시를 함께 사용
- `app-revenue.js`: 오늘/이번주/이번달 매출을 미리 받아 탭 전환 대기 줄임
- `app-dm-settings-cache.js` 신규: DM 자동응답/멘트관리 설정 중복 요청 방지
- `app-customer-hub.js`: 고객 분류 계산 반복 줄임
- 보류: 초기 lazy loader 는 `index.html` 로드 순서 영향이 커서 별도 안전 티켓으로 분리

### Phase 3: UX 간소화 ✅ 1차 완료 (2026-05-06)
- `css/screens/phase9-ux.css` 신규: 고객/예약/매출 버튼 터치 영역 44~48px 확보
- `app-phase9-ux.js` 신규: 예약 빠른 추가, 매출 빠른 입력, 공통 로딩/오류 문구 헬퍼 추가
- 홈 빠른 실행 버튼: 예약 추가, 매출 기록, 대기자, 위험 고객, 리마인더, 리뷰 요청, 회원권, 예약 링크

### Phase 4: 보안 강화 🟡 프론트 1차 완료 (2026-05-06)
- `app-secure-storage.js` 신규: Web Crypto 기반 전화번호/주소 암호화 저장
- `app-shop-settings.js`: 샵 전화번호/주소 저장·불러오기를 암호화 저장으로 교체
- 보류: refresh token, shop_id 응답, 강한 CSP 는 백엔드/외부 스크립트 영향 있어 별도 안전 작업 필요

### Phase 5: 신규 기능 🟡 프론트 1차 완료 (2026-05-06)
- `app-waitlist.js` 신규: 대기자 로컬 관리 + 예약 빠른 추가 연결
- `app-reminder.js` 신규: 리마인더 설정 + 예약 확인 수동 전송 연결
- `app-retention-ai.js` 신규: `/retention/at-risk` 기반 위험 고객 화면 + DM 초안 복사
- `app-review.js` 신규: 리뷰 요청 문구 생성/복사 관리
- `app-public-link.js` 로드: 공개 예약 링크 화면을 빠른 실행에 연결
- 남음: 대기자/멤버십/리뷰 서버 저장, 자동 스케줄러, refresh token 은 연준 백엔드 작업 필요

### Phase 6: Cold Start 버그 수정 ✅ 완료 (2026-05-07)
- `app-customer-dashboard.js`: _apiGet 타임아웃 10s→22s, AbortError 시 /customers/{id} 폴백 추가
- `app-perf-recovery.js`: 헬스체크 프로브 타임아웃 8s→20s, 초기 프로브 딜레이 800ms→3s
- `app-core.js`: AbortController 이미 abort된 신호의 재시도 차단 (불필요 토스트 억제)
- `itdasy_backend-test/generation.py`: Vertex AI location "global"→"us-central1" 수정, SA JSON 인증 배포
  - 원인: 사용자가 Railway에 USE_VERTEX_AI=true + GOOGLE_SERVICE_ACCOUNT_JSON 추가했는데
    기존 코드가 location="global" (무효)로 모든 AI 호출 실패 → 챗봇 1분+ 타임아웃

---

## 🟡 원영님 남은 액션 (Phase 7)

1. Apple Developer 계정 가입 ($99/년)
2. Google Play Developer 가입 ($25 1회)
3. T-320 "Sign in with Apple 구현해" 지시
4. 데모 시드 실행 + 스크린샷 촬영 + TestFlight

---

## 핵심 맥락

**토큰 키 체계:**
- `app-core.js:33` `_TOKEN_KEY = 'itdasy_token::' + (staging|prod|local)` 패턴

**스크립트 로드 순서:**
- `index.html:1084-1104` 순서 변경 절대 금지

**깨지면 안 되는 것:**
- Capacitor 플러그인 (SplashScreen/StatusBar/Push/Camera/App)
- OAuth 스킴 `itdasy://`
- GitHub Actions `Android Build` + `Supabase Daily Backup`

---

## 이전 체크포인트 아카이브

2026-04-20 ~ 2026-05-06 이전 체크포인트는 `.ai/CHANGELOG_2026-05.md` 참조.

---

## 재시작 부트스트랩

```
프로젝트 작업 재개합니다. 다음 순서로 읽고, 읽었으면 "bootstrap:OK" 써주세요:
1. CLAUDE.md
2. .ai/SESSION_STATE.md
그 다음 Phase 9 플랜 파일 (~/.claude/plans/lively-sniffing-pudding.md)을 요약해주세요.
```
