# 잇데이 앱 기능 인덱스 (SSOT)

> **세션마다 자동 로드됨.** 파일/기능 찾을 땐 **여기부터** 확인 — "이 기능 없나?" 추측 금지.
> **갱신 규칙:** 기능 파일(`js/**`, `app-*.js`, 백엔드 `routers/services/models`)을 추가·삭제·의미변경하면 **해당 항목 이 문서에서 같이 고칠 것.** (PostToolUse 훅이 리마인드함)
>
> 최종 전수분석: 2026-07-10 (4영역 병렬). 규모: **프론트 ~250파일 + 백엔드 라우터 60 · 서비스 70 · 모델 56테이블.**
> 상태 마커: ✅ 구현·라이브 / 🟡 부분(스텁·심사대기·플래그off) / ❌ 불가(정책·권한)

---

## 🗺️ 도메인 맵 (어디를 봐야 하나)

| 하고 싶은 것 | 프론트 | 백엔드 |
|---|---|---|
| 앱 부팅·API·인증·라우팅 | `app-core.js`, `js/loader.js`, `js/load-groups.js`, `sw.js` | `main.py`, `auth.py` |
| 홈 화면·브리핑 | `app-home-v41.js`, `js/home/*`, `app-today-*.js` | `today.py`, `morning_brief.py` |
| 매출 | `app-revenue*.js`, `js/revenue/*` | `revenue.py`, `revenue_*.py` |
| 예약·캘린더 | `app-calendar-view.js`, `app-booking-api.js`, `app-complete-flow.js` | `bookings.py`, `bookings_confirm.py`, `reminder_scheduler.py` |
| 고객 CRM | `app-customer*.js`, `app-retention-ai.js`, `app-birthday.js` | `customers.py`, `customer_memos.py`, `retention.py`, `treatments.py` |
| **DM 자동응답·통합 인박스** | `app-dm-*.js`, `js/assistant/*` | `dm_autoreply.py`, `dm_confirm_queue.py`, `dm_manual_replies.py`, `services/dm_*`, `services/channels/*` |
| 채널 연동(인스타·네이버·카카오) | `app-integrations-hub.js`, `app-naver-*.js`, `app-kakao-hub.js` | `integrations.py`, `talktalk.py`, `services/kakao_alimtalk.py`, `*_oauth.py` |
| AI 비서(잇비) 챗봇 | `app-assistant.js`, `assistant-intent-router.js`, `js/assistant/**` | `assistant.py`, `assistant_facts.py`, `nl_query.py` |
| 캡션 생성·페르소나 학습 | `app-caption*.js`, `app-instant-caption.js`, `app-persona-survey.js` | `persona.py`, `caption.py`, `services/caption_generator.py`, `fingerprint_*` |
| 인스타 발행·인사이트 | `app-instagram.js`, `js/workspace/workspace-adapter.js` | `instagram.py`, `instagram_insights.py`, `scheduled_publisher.py` |
| 사진 편집·누끼·보정 | `app-photo-editor*.js`(60), `js/photo-editor/**`, `js/itd-editor/**` | `image.py`, `photo_editor_ai.py`, `photo_editor_generative.py` |
| **작업실**(사진→레이아웃→캡션→발행) | `js/workspace/**`, `js/workspace/flow/**` | `workspace_sync.py` |
| 템플릿·가격표·후기·전후 | `js/photo-editor/template-*`, `js/assistant/core/template-*` | `templates.py`, `services/*_ocr.py` |
| 임포트·OCR(명함·영수증·가격표) | `app-import*.js`, `app-receipt-scan.js`, `app-smart-capture.js` | `imports.py`, `smart_import.py`, `services/*_ocr.py` |
| 재고·회원권 | `app-inventory*.js`, `app-membership.js` | `inventory.py`, `memberships.py`, `services.py` |
| 자동화 규칙·리포트 | `app-ai-hub.js`, `app-report.js`, `app-killer-widgets.js` | `automation.py`, `reports.py`, `campaigns.py` |
| 결제·구독 | `app-billing.js`, `app-plan.js` | `subscription.py`, `billing.py`, `iap.py` |
| 알림·푸시 | `app-notifications.js`, `app-push.js` | `notifications.py`, `push.py`, `push_sender.py` |
| 심사·컴플라이언스 | `app-content-report.js`, `app-cookie-consent.js`, `app-data-export.js` | `moderation.py`, `data_export.py`, `medical_ad_guard.py` |

---

## 📡 채널 / DM / 연동 — 실제 구현 상태 (자주 헷갈림)

| 기능 | 상태 | 근거 |
|---|---|---|
| 카카오 **로그인** | ✅ | `kakao_oauth.py` |
| 네이버 **로그인** | ✅ | `naver_oauth.py` |
| 구글 **로그인** | ✅ | `google_oauth.py`, 애플 로그인 `auth.py` |
| **인스타 DM 자동응답** (봇) | 🟡 코드완성, **Meta Advanced 심사통과 후 활성**(env off) | `dm_autoreply.py`(6411줄) |
| 인스타 DM **원장 confirm 큐** (AI초안→검토→발송) | ✅ 엔진 구현 | `dm_confirm_queue.py`, `dm_manual_replies.py`, `services/dm_*` |
| **네이버 톡톡** (문의 통합 인박스 + AI 답장) | ✅ **실전송 구현**(무료, Meta 무관) | `talktalk.py` + `services/channels/naver_talk.py`(httpx send) |
| **카카오 알림톡** (예약확정·리마인드·노쇼·빈슬롯·생일) | 🟡 **BE 발송서비스 실구현(Aligo API)** / FE 관리화면 `app-kakao-hub.js`는 스텁 | `services/kakao_alimtalk.py`(httpx) |
| **네이버 예약(스마트플레이스) 양방향 동기화** | 🟡 스텁 — 사업장ID 저장만, Phase1 예정 | `integrations.py /naver/link`, `app-naver-link.js` |
| **인스타 발행**(피드·스토리·캐러셀) | 🟡 코드완성, `content_publish` **Meta 심사대기** | `instagram.py /publish-file` |
| 인스타 **게시물 댓글 답글 자동화** | ❌ **불가** — `manage_comments` 스코프 일부러 제거(권한 미신청) | `instagram.py:74` |
| 네이버 플레이스 **리뷰 답글 자동화** | ❌ **불가** — 공식 답글 API 없음 | — |
| **리뷰 요청** 관리(손님에게 리뷰 요청·상태추적) | ✅ | `customer_reviews.py`, `app-review.js` |
| 인스타 **인사이트**(도달·저장·최적시간) | ✅ | `instagram_insights.py` |

> **DM 응대 구조 핵심:** DM/문의 답장은 별도 "인박스 파일" 하나가 아니라 — 수신 채널(인스타/톡톡) → `services/channels/*` 어댑터 → 코어 DM 엔진(`services/dm_intent`·`dm_context_builder`·`dm_free_reply`) → `dm_confirm_queue`(원장 검토) 로 흐른다. 잇비 챗봇 쪽 발화는 `reply_dm`/`draft_message` kind로 백엔드 LLM이 초안, FE `js/assistant/marketing-safety-labels.js`·`marketing-draft-policy.js`가 톤·안전 라벨만 입힘.

---

## 🖥️ 프론트엔드

### 코어 인프라 (부팅·API·인증·로더·SW)
- **app-core.js** (2805) — 앱 부팅. `PROD_API`(staging Cloud Run)+`window.apiUrl/apiFetch`, 격리 토큰키 `itdasy_token::staging|prod|local`, `getToken/login/logout`, `showTab()` 라우팅, XSS `_esc`, SW 등록·버전배지.
- **sw.js** (238) — 서비스워커. `CACHE_VERSION` 캐시버전, `/api·/auth` network-first / 정적 cache-first, 읽기전용 GET 오프라인 폴백, 지연그룹 프리캐시 제외.
- **js/loader.js** (92) — 분할 로더 `AppLoader.ensure(group)`. 순서보장 동적로드 + idle 선로딩.
- **js/load-groups.js** (217) — 로드 매니페스트 `APP_LOAD_GROUPS`(photo/assistant/extras). **여기 `?v=` 안 올리면 SW가 옛파일 캐시 → 라이브 반영 안 됨.**
- **js/channel-mark.js** (58) — 인박스 채널 배지 `ChannelMark.norm/mark`(인스타/카카오/네이버톡톡).
- **js/heic-convert.js** (63) — 아이폰 HEIC→JPEG 클라 변환.
- **app-perf-recovery.js** (601) — 3초 체감 성능복구·프리로드·워치독.
- **app-side-nav-unifier.js** (131) — PC 사이드바 활성 동기화.
- **app-drawer.js** (146) — 좌측 슬라이드 드로어. **app-theme.js**(107) 테마. **app-haptic.js**(180) 햅틱. **app-gestures.js**(281) 터치제스처. **app-push.js**(114) 푸시초기화. **app-biometric.js**(80) 생체재로그인. **app-oauth-return.js**(143) OAuth 복귀. **app-secure-storage.js**(89) 암호화 로컬스토리지.
- **app-cookie-consent.js**(155)·**app-data-export.js**(116)·**app-content-report.js**(133)·**app-spec-validator.js**(153)·**app-debug-panel.js**(173) — 동의/내보내기/신고/스펙검증/디버그.
- **app-sheet-anim.js**(54)·**app-generic-sheet.js**(68)·**app-empty-state.js**(50)·**app-fun.js**(178)·**format-money.js**(91)·**app-phase9-ux.js**(188) — 공용 UI 유틸.

### 홈 화면
- **app-home-v41.js** (474) — 홈 v4.1 메인. SWR 캐시(`hv41_cache::brief`)→백그라운드 `/assistant/brief`, 헤더/캐러셀/오늘예약/운영3카드.
- **js/home/v41-renderers.js**(618)·**v41-actions.js**(117)·**v41-styles.js**(4)·**app-home-v41-config.js**(29) — 홈 렌더/액션/스타일/설정.
- **app-home-customer-msgs.js** (346) — 홈 "고객 메시지" 카드줄. `/dm-confirm-queue`(pending) 소스, 탭→DM 포커스.
- **app-today-brief.js**(353)·**app-today-morning.js**(280)·**app-ai-suggestions.js**(85) — 오늘 집중/모닝브리핑/할일3개.
- **app-myshop-v3.js**(608)·**app-dashboard.js**(564)·**app-insights.js**(485) — 내샵관리 v3 / 대시보드 / AI 인사이트.

### 매출
- **app-revenue.js** (1183) — 매출관리 v5 메인 + period 디스패처. `openRevenue/window.Revenue`, CRUD·빠른추가·도넛.
- **app-revenue-hub.js**(541)·**app-revenue-today.js**(243)·**app-revenue-month.js**(630)·**app-revenue-calendar.js**(188)·**app-revenue-report.js**(156) — 허브/오늘·주/월/캘린더칩/리포트.
- **js/revenue/booking-revenue-overlay.js** (248) — 예약금(deposit)을 매출 요약/브리핑에 합산.
- **app-report.js** (157) — 주말 자동 리포트.

### 예약·캘린더
- **app-calendar-view.js** (2541) — 예약관리 v4(월/주/일, 모바일·PC) `CalendarView`.
- **app-booking-api.js** (273) — 예약 CRUD + 오프라인 폴백 `Booking`.
- **app-complete-flow.js** (585) — 시술 완료 시트(예약→매출 전환).
- **app-reminder.js** (113) — 예약 리마인더 컨트롤.

### 고객 CRM
- **app-customer.js** (1066) — 경량 CRM `openCustomers`. **app-customer-dashboard.js**(522)·**app-customer-ai-brief.js**(496)·**app-customer-chips.js**(206)·**app-customer-memo.js**(419)·**app-customer-cache.js**(74)·**app-customer-sync.js**(53) — 대시보드/AI브리핑/추천칩/메모/캐시/예약시 자동등록.
- **app-birthday.js** (164) — 생일/기념일 자동감지. **app-photo-match.js**(162) EXIF 고객매핑. **app-retention-ai.js**(340) 이탈위험 고객. **app-review.js**(199) 리뷰요청. **app-waitlist.js**(149) 대기자.

### DM·SNS·연동 (FE)
- **app-instagram.js** (1153) — 인스타 연동 & 말투분석. **app-dm-autoreply.js**(1541) AI DM 자동응답 v3. **app-dm-conversations.js**(650) DM 채팅방. **app-dm-confirm-queue.js**(821) 원장 confirm 큐. **app-dm-manual-replies.js**(479) 매뉴얼 멘트. **app-dm-menu.js**(489) 빠른안내(Quick Replies+Ice Breakers). **app-dm-booking-form.js**(185) DM 예약양식. **app-dm-settings-cache.js**(55).
- **app-naver-link.js**(207) 네이버 예약연동. **app-naver-talk-link.js**(219) 네이버 톡톡연동. **app-sns-hashtag.js**(198) 해시태그 매니저. **app-notifications.js**(551) 인앱 알림.

### AI 비서(잇비) — FE
- **app-assistant.js** (5230) — 챗봇 메인 `openAssistant`. **assistant-intent-router.js**(1170) FE intent pre-parser. **app-assistant-actions-marketing.js**(118)·**app-assistant-facts.js**(146)·**app-assistant-undo.js**(265)·**app-chat-auto-edit.js**(277)·**app-ai.js**(311)·**app-persona-survey.js**(381).
- **js/assistant/core/** — 잇비 두뇌(순수 로직):
  - 라우팅: **action-hub.js**(378, 다음행동 버튼+안전분류), **context-resolver.js**(125), **active-card.js**(58), **create-intent.js**(60), **memory-intent.js**(182), **saved-cards-intent.js**(159), **unsupported-intent.js**(37), **source-image.js**(131).
  - 예약: **booking-context.js**(365), **booking-draft.js**(189). 고객: **customer-status-card.js**(261), **customer-insight.js**(71), **customer-add-guard.js**(219), **customer-phone-intent.js**(147).
  - DM/발송 안전: **marketing-safety-labels.js**(85, send/reply_dm 발송위험 라벨), **marketing-draft-policy.js**(111, 초안 톤·금지어 sanitize).
  - 브리핑: **daily-briefing.js**(322), **briefing-priority.js**(105), **closing-report.js**(116).
  - 템플릿: **template-sample-matcher.js**(291), **template-autoapply.js**(400), **assistant-template-save.js**(124), **assistant-template-restore.js**(74), **template-sample-catalog*.js**(price/review/ba/event 데이터).
  - 사진모드: **photo-mode.js**(982, 잇비 사진편집 상태머신), **photo-mode-support.js**(110), **photo-session.js**(128), **promo-result-builder.js**(67).
- **js/assistant/** (UI·핸들러): **card-renderers.js**(390), **single-action-controls.js**(173), **group-action-controls.js**(263), **suggestion-controls.js**(154), **kind-core.js**(364, RISKY_ACTION_KINDS), **cache-invalidation.js**(76), **promo-result-card.js**(99), **pending-photos.js**(168), **photo-actions.js**(170), **photo-local-handlers.js**(143), **photo-kind-classifier.js**(54), **photo-workflow-commands.js**(131), **workspace-nl-commands.js**(168, 자연어→작업실 명령), **treatment-link.js**(124), **lightbox.js**(108), **voice-input.js**(160).

### 캡션·갤러리·포트폴리오·서비스
- **app-caption.js** (984) — 캡션 생성(슬롯머신·톤·해시태그). **app-caption-prefill.js**(166)·**app-instant-caption.js**(433, 시술후 1초)·**app-voice-caption.js**(600, 음성)·**app-sample-captions.js**(117).
- **app-portfolio.js** (698)·**app-portfolio-tags.js**(162) — 포트폴리오. **app-service-templates.js**(402)·**app-pricelist.js**(162) — 시술 프리셋/가격표.
- **app-gallery-*.js** (10개) — 갤러리/작업실 레거시 파이프라인: utils(45)·db(171, IndexedDB `loadSlotsFromDB`)·workshop(757)·write(463)·finish(693)·assign(196)·slot-editor(629)·bg(383)·element(384)·review(377).
- **app-emoji-storage.js**(222)·**app-brand-kit.js**(282) — 이모지창고/브랜드킷.

### 사진 편집기 (js/photo-editor/** + app-photo-editor*.js 60개)
- **beauty-engine.js** (773) — 뷰티 픽셀 엔진(네일광택·헤어볼륨/윤기·피부톤·눈빛, 마스크 ROI 게이트). **renderer.js**(360) WebGL+2D 폴백. **basic-panels.js**(509) 기본 패널. **history.js**(53) undo/redo. **studio-presets.js**(146) 살롱 빠른보정. **price-menu.js**(36) 가격표 자동채움.
- 누끼/마스크: **region-mask-provider.js**(720, dispatcher Tier1~3) + **mask-application.js**(317)·**mask-refine.js**(301)·**mask-confidence.js**(63)·**mask-strict-policy.js**(57)·**mask-status-ui.js**(147)·**mask-debug-overlay.js**(169)·**mask-qa-tool.js**(251). 부위 어댑터 7종: hair·hand(nail)·brow·eyelash·sclera(+application).
- AI 추천/생성형: **reco-region.js**(71)·**reco-map.js**(68)·**reco-cards-ui.js**(288)·**reco-vision-client.js**(78)·**reco-consent.js**(81) / **generative-client.js**(87)·**generative-consent.js**(83).
- 템플릿 렌더: **premium-templates.js**(713, 30종 렌더러) + **template-renderer-beauty-pack.js**(345)·**-draws.js**(718, id별 드로)·**template-renderer-wm-pack-draws.js**(380) + **template-overlay.js**(378)·**template-slots.js**(166)·**template-fit-text.js**(195, 자동줄바꿈·폰트축소)·**template-thumb.js**(122)·**template-market-data.js**(292)·**template-pack-beauty-data.js**(445)·**template-pack-v3-*.js**(데이터/preview, 앱 미연결).
- 검증도구: **photo-effect-debug.js**(287)·**photo-effect-manual-debug.js**(470). **app-mediapipe-loader.js**(334)·**app-photo-enhance.js**(328).
- **app-photo-editor*.js** (60) — 편집기 엔진 서브모듈: entry/nav/pro-tab, WebGL(gl-bridge·pipeline·shaders), 마스킹·힐링(face-mask·smart-mask·heal-v2·beauty-ai·relight·cuticle), 배경(bg-compose·bg-blur·bg-cache), 자연어편집(intent-parser·nl-apply·nl-modify·edit-plan), 템플릿·프리셋·B&A슬라이더·콜라주·스티커·내보내기·워커필터. `loader.js` photo 그룹 지연로드.

### 작업실 (js/workspace/**)
- **js/workspace/workspace-v2-flow.js** (3881) — **작업실 전체 오케스트레이터.** 업로드→레이아웃→편집→게시글(캡션+미리보기 통합)→고객연결. 화면전환/CTA/상태(d)/네비스택, flow/*·ItdEditor·PhotoEditor·adapter 조립 허브. **[2026-07-13] 캡션 결과 화면에 발행+피드 미리보기 흡수(구 preview 스텝은 플러밍만 보존, 진입 없음). 진행바 4단계(upload·layout·caption·connect).**
- **workspace-v2-home.js**(634) 홈 렌더러. **[2026-07-13] '피드 정렬' 진입(저장된 콘텐츠 전체를 FeedPlanner 3열 그리드로, 순서 `itdasy:feed_order` 영구저장/복원). 이어서편집 딥링크 preview→caption 재배선.** **workspace-adapter.js**(554) 기존기능 연결 어댑터(보정/누끼/캡션/고객/저장/인스타업로드/`recentMedia`). **workspace-sync.js**(425) 기기간 draft slot 동기화. **workspace-crop.js**(239)·**workspace-tpl-edit.js**(239)·**workspace-settings.js**(240)·**shop-style.js**(188, 브랜드자산)·**workspace-state.js**(78).
- **js/workspace/work-memory.js**(263, `window.WorkMemory`) — **[2026-07-14 T-115 P1] 원장 작업 기억.** 원장이 편집기에서 만든 꾸밈(글씨·스티커·선/도형)을 **작업실 저장·인스타 발행 성공 시점**에 붙잡아 최대 **10개** 보관 + 로컬 규칙으로 이름 자동생성("속눈썹 전후비교, 글씨 아래 왼쪽정렬") + ★기본 지정. 저장 `itdasy:work_memory:list`/`:default`(localStorage).
  - 담는 값 = `ItdEditor._exportState()`(editState)에서 **그 사진 전용값 제거**(`photos`·`photoDraw`·`adj`·`pz`·`cellCrop`) 후 재사용분(`layers`·`ratio`·`layoutIdx`·`collage*`)만. ⚠️ **붓 그림은 기억 못 함** — `photoDraw`는 벡터가 아니라 그 사진에 구워진 PNG.
  - ShopStyle 재사용 안 함(=`list()`가 이미 '내 레이아웃'·'우리샵 스타일' 두 용도로 혼재 + `makeLayer`가 텍스트 4 role 전용이라 스티커/도형 불가).
  - 같은 작업은 지문(`_sig`)으로 dedup → useCount만 증가. 10개 초과 시 `lastUsedAt` 오래된 것부터 제거(**★기본은 보호**). quota 실패 시 밀어내고 재시도.
  - 훅 4곳(호출 1줄씩, 로직 없음): `workspace-v2-flow.js` `save()`·`publish()` 성공·`_markPublishedNow()`(붙잡기) + `_openStoryEditor()`(다시 쓰기). UI = `workspace-settings.js` '원장 작업 기억' 섹션 + 발행 직후 `.wm-cap` 카드(3.5초). CSS `css/screens/sub-screens.css` `wm-*`.
  - **[P2] 다시 쓰기 — `defaultEditState()` → ★기본 기억을 `ItdEditor.open({editState})` 로 주입.** 🚩 **플래그 기본 OFF**: `?wsmem=1` 미리보기 · `?wsmem=0` 강제해제 · `window.ITDASY_WORK_MEMORY=true` 전역ON. OFF면 `null` 반환 = 기존 동작 100% 동일.
    - '깨끗한 열기'에서만 적용(이어서편집 `p0.editState`·ws-hyper 레이아웃 `_wsEd` 가 우선).
    - **같은 role 텍스트는 이번 글 문구로 갈아끼움** — 자리·크기·폰트만 기억. (안 그러면 지난 글 문구가 되살아남)
    - **기억 레이아웃 칸 수 ≠ 지금 사진 수면 `layoutIdx` 생략**(글씨·꾸밈만 얹음). 예: '전후 2칸' 기억 + 사진 1장 → 빈 칸 방지.
    - `photos`·`photoDraw`·`adj`·`pz` 는 안 넘김 — 넘기면 지금 사진을 지난 사진으로 덮어씀(`itd-editor.js:1648`).
    - 적용 시 `markUsed()` → `useCount`↑ = 자주 쓰는 기억은 10칸 밀어내기에서 보호됨.
    - 없는 role 의 시술 텍스트는 편집기 `_renderMissingIncoming` 이 추가(중복 안 됨).
  - **P3(미구현): 기존 `_learnShopStyle`(flow.js:435, 활성 스타일 덮어쓰기 학습) 제거·흡수.** 현재는 둘이 공존.
- flow 클러스터: **util.js**(96, `WSFlowUtil`)·**caption-text.js**(94)·**connect.js**(80)·**brand.js**(217)·**harmony-presets.js**(16)·**layout.js**(188)·**publish-progress.js**(42)·**thumbs.js**(47).
- layout: **layout-model.js**(183, `WorkspaceLayout` 합성기 스타터A~H)·**slot-stage.js**(92, 드래그focal·핀치zoom).

### 편집기 (js/itd-editor/**)
- **itd-editor.js** (1773) — 인스타식 편집기 `ItdEditor`(텍스트·스티커·반달레이아웃·그리기, 12폰트, HSV 색상). **safe-zone.js**(81, 얼굴위 텍스트 회피). **data/itd-decos.js**(104, 스티커 51종).

### 임포트·OCR·성장
- **app-import.js**(475)·**app-import-wizard.js**(539)·**app-template-import.js**(269)·**app-smart-capture.js**(286, 카톡캡처+명함)·**app-receipt-scan.js**(674, 영수증/주문 OCR).
- **app-inventory.js**(605)·**app-inventory-hub.js**(594) 재고. **app-growth-story.js**(189) 월간성장. **app-killer-widgets.js**(602) AI 킬러위젯. **app-auto-ba.js**(160)·**app-ba-auto-trigger.js**(169) 전후 자동감지.

### 허브·결제·설정
- 허브: **app-ai-hub.js**(366, 자동화)·**app-customer-hub.js**(30)·**app-integrations-hub.js**(126)·**app-inventory-hub.js**(594)·**app-kakao-hub.js**(137, 알림톡 UI 스텁)·**app-settings-hub.js**(321). **js/hubs/prototype-render.js**(187).
- 결제: **app-billing.js**(150, PortOne)·**app-plan.js**(284, 월6,900원 단일멤버십)·**app-membership.js**(259, 회원권).
- 설정: **app-shop-settings.js**(397)·**app-backup.js**(224)·**app-support.js**(258)·**app-autocomplete.js**(58).

### index.html
- 메인 탭: `#tab-home`·`#tab-workshop`(작업실)·`#tab-caption`·`#tab-dashboard`(내샵관리)·`#tab-finish`·`#tab-portfolio` → 하단 `nav.tab-bar`+FAB, `showTab()` 라우팅.
- Lucide `<symbol>` 스프라이트 77개(`<use href="#ic-*">`). **UI 아이콘은 이 스프라이트만 — 이모지 금지.**
- 로드순서: 인라인 부트 → `app-core.js` → app-*.js defer → Sentry → 말미 debug-panel·side-nav-unifier. photo/assistant/extras는 `loader.js` idle 분할로드.

---

## ⚙️ 백엔드 (FastAPI · Cloud Run staging asia-northeast3)

### 부트스트랩·cron
- **main.py** — 앱 진입점. `create_all`+런타임 스키마 진화(자동 ALTER), CORS/GZip/JWT, 라우터 60여개 마운트, `/static·/promo` 정적. **APScheduler cron**: 예약리마인드(5분)·자동화엔진(5분)·리터치due(매일15:05)·라이프사이클(1h)·DM배치(3s)·workspace GC(04:20). asyncio: 인스타 토큰 자동갱신(12h)·예약발행 워커.

### 라우터
- 인증/OAuth: **auth.py**(513, 회원/애플/JWT/탈퇴)·**google_oauth.py**(264)·**kakao_oauth.py**(188)·**naver_oauth.py**(165).
- 샵/페르소나/캡션: **shop.py**(127)·**persona.py**(1252, 지문·정체성·서명·few-shot·`/persona/generate`)·**caption.py**(293)·**stories.py**(51).
- 이미지/사진AI: **image.py**(566, 누끼·보정·객체제거·배경생성·얼굴블러)·**photo_editor_ai.py**(330, Vision 분석)·**photo_editor_generative.py**(190, L3)·**background.py**(93)·**portfolio.py**(259).
- 인스타/DM: **instagram.py**(2223, OAuth·recent-media·발행 publish-file/story/carousel·토큰·분석)·**instagram_insights.py**(203)·**dm_autoreply.py**(6411, DM봇 webhook)·**talktalk.py**(41, 네이버톡톡 webhook)·**dm_confirm_queue.py**(1951, 원장 confirm 큐)·**dm_manual_replies.py**(190).
- 잇비/NL: **assistant.py**(6964, ask/stream/execute_chain/브리핑)·**assistant_facts.py**(156)·**assistant_undo.py**(289)·**nl_query.py**(203, NL→SQL read-only)·**user_docs.py**(131, RAG).
- 고객/예약/시술: **customers.py**(716)·**customer_memos.py**(411)·**customer_reviews.py**(132, 리뷰요청)·**bookings.py**(445)·**bookings_confirm.py**(461, 노쇼감지)·**treatments.py**(357)·**waitlist.py**(132).
- 매출/재고/회원권/시술템플릿: **revenue.py**(687, 예측·OCR임포트)·**inventory.py**(108)·**memberships.py**(484)·**services.py**(354, 가격표임포트).
- 리포트/리텐션/추천/자동화: **reports.py**(295)·**today.py**(339, 브리핑)·**retention.py**(347, 이탈위험·초안)·**retouch.py**(188, 리터치DM초안)·**recommendations.py**(379, 시술추천)·**campaigns.py**(81, A/B)·**automation.py**(356, 규칙CRUD).
- 임포트/OCR/음성: **imports.py**(351)·**smart_import.py**(674)·**templates.py**(75, OCR)·**voice.py**(133).
- 발행/동기화/알림: **scheduled_posts.py**(162)·**workspace_sync.py**(275)·**notifications.py**(141)·**push.py**(73).
- 결제: **subscription.py**(220)·**billing.py**(351, PortOne)·**iap.py**(552, Apple/Google).
- 연동/브릿지: **integrations.py**(212, 네이버예약/톡톡 링크)·**platform_bridge.py**(85).
- 운영/컴플라이언스: **support.py**(432)·**moderation.py**(596, 콘텐츠신고)·**data_export.py**(315, GDPR)·**admin.py**(1613)·**admin_ws.py**(128, WebSocket).

### 서비스 (services/)
- AI 게이트웨이: **generation.py**(376, Gemini 단일진입). 캡션: **caption_generator.py**(1337)·**caption_grounding.py**(245)·**service_hashtags.py**(308)·**signature_detector/injector.py**·**text_cleanup.py**·**fingerprint_extractor.py**(144)·**style_extractor.py**(144)·**identity_validator.py**·**fewshot_bank/builder.py**·**instagram_fetcher.py**(100)·**scheduled_publisher.py**(137)·**story_generator.py**·**portfolio_tagger.py**.
- DM 엔진: **dm_intent.py**(426)·**dm_context_builder.py**(470)·**dm_tone_analyzer.py**(261)·**dm_thread.py**·**dm_batching.py**·**dm_menu.py**(227)·**dm_menu_icebreakers.py**·**dm_manual_matcher.py**·**dm_free_reply.py**·**dm_customer_extractor.py**·**customer_memo_extractor.py**.
- 채널 어댑터: **channels/base.py**(공통 인터페이스)·**channels/instagram.py**(229)·**channels/naver_talk.py**(157, 무료 양방향 send).
- 예약/리마인드: **booking_form_parser.py**(355)·**calendar_slots.py**·**reschedule_resolve.py**(314)·**waiting_matcher.py**·**gap_filler.py**(253)·**reminder_scheduler.py**(292)·**retouch_reminder/schedule.py**·**sprint_e.py**(219).
- 고객/리텐션/매출: **customer_lifecycle.py**(358)·**customer_tier.py**·**chip_scorer.py**(444)·**ai_brief.py**·**morning_brief.py**(356)·**retention_predictor.py**(329)·**revenue_analysis.py**·**revenue_forecaster.py**·**membership_stats.py**.
- 자동화/임포트/OCR: **automation_engine.py**·**automation_retry.py**·**importer.py**·**smart_import(er).py**·**receipt_ocr.py**·**business_card_ocr.py**·**pricelist_ocr.py**·**template_ocr.py**(377)·**voice_parser.py**.
- 발송/가드/기타: **kakao_alimtalk.py**(152, Aligo 실발송)·**push_sender.py**(163, FCM)·**support_intent.py**·**sample_seeder.py**(473)·**medical_ad_guard.py**(198)·**sensitive_content_guard.py**·**workspace_gc.py**. 생성형: **photo_generative/**(policy·mock·replicate).

### 모델 (models.py · 56 테이블)
- 계정/샵: User·ShopSettings·Persona·Portfolio·BackgroundAsset·ApiUsageLog.
- 페르소나/학습: PastPost·GenerationLog·UserSignatureBlock·UserIdentity·UserConsent·UserStyleFingerprint·PersonaFeedback·UserFewshot·UserCorrection.
- 결제/알림: Subscription·PaymentHistory·NotificationItem·PushToken·ScheduledPost.
- 고객/예약/시술: Customer·Booking·Staff·Treatment·WaitingList·ServiceTemplate·ServiceConsumption·CustomerMemo·CustomerReview.
- 매출/재고: RevenueRecord·ExpenseRecord·InventoryItem·ImportJob.
- DM/채널: IntegrationSetting·DMAutoReplySetting·DMMessageLog·DMLifecycleLog·DmBookingLink·DMConversationContext·DMManualReply·DMOwnerReplySample.
- 잇비/자동화: AssistantSession·AssistantActionLog·AssistantUserFact·AutomationRule·AutomationFailure·MessageCampaign·UserDoc·ContentReport.
- OCR/작업실: ImageOcrCache·PhotoAiCache·WorkspaceSlot·WorkspaceSlotPhoto·WorkspaceAsset·SupportMessage·UserDeletion.

### 스키마 (schemas/)
auth·customer·booking·treatment·services·revenue·inventory·shop·**persona**(328, 최대)·caption·import_job·__init__(집약).

---

_이 문서 = 앱 기능의 단일 진실원(SSOT). 기능 바꾸면 여기부터 고친다._
