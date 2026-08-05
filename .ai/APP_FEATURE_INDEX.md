# 잇데이 앱 기능 인덱스 (SSOT)

> **세션마다 자동 로드됨.** 파일/기능 찾을 땐 **여기부터** 확인 — "이 기능 없나?" 추측 금지.
> **갱신 규칙:** 기능 파일(`js/**`, `app-*.js`, 백엔드 `routers/services/models`)을 추가·삭제·의미변경하면 **해당 항목 이 문서에서 같이 고칠 것.** (PostToolUse 훅이 리마인드함)
>
> 최종 전수분석: 2026-07-10 (4영역 병렬). **마지막 갱신: 2026-08-02** (FE `b6e36ff..HEAD` 108커밋 + BE `itdasy_backend-test` 81커밋 반영).
> 규모(2026-08-02 실측): **프론트 ~250파일 + 백엔드 라우터 60 · 서비스 78파일(top 70) · 모델 60클래스.**
> 상태 마커: ✅ 구현·라이브 / 🟡 부분(스텁·심사대기·플래그off) / ❌ 불가(정책·권한)
>
> **[2026-07-24~08-02 변경 요약]** 출시 전 감사 라운드가 몰려 있어 *기능 추가보다 "죽은 토글 실기능화 / 거짓 성공 제거 / 돈 무결성"* 이 많다.
> 신규 FE 3파일(`app-iap.js`·`app-save-file.js`·`js/service-categories.js`), 신규 BE 8모듈(services 4 · utils 3 · scripts 1) + 마이그레이션 `0026~0033`.
> 큰 방향 4가지: ① **인앱결제(IAP) 프론트 배선** ② **돈·동시성 무결성**(DB UNIQUE·CHECK·원자적 카운터) ③ **오프라인 오판 근본수정**(HTTP 에러 ≠ 오프라인) ④ **정직화**(안 되는 CTA 제거·거짓 저장 성공 제거·심사중 기능 안내).

---

## 🗺️ 도메인 맵 (어디를 봐야 하나)

| 하고 싶은 것 | 프론트 | 백엔드 |
|---|---|---|
| 앱 부팅·API·인증·라우팅 | `app-core.js`, `js/loader.js`, `js/load-groups.js`, `sw.js` | `main.py`, `auth.py` |
| 파일 저장·공유(네이티브 포함) | `app-save-file.js` | — |
| 시술 분류(카테고리 7종 SSOT) | `js/service-categories.js` | `config/services.py` |
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
| 결제·구독 | `app-billing.js`, `app-plan.js`, **`app-iap.js`** | `subscription.py`, `billing.py`, `iap.py` |
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
| **인스타 발행**(피드·스토리·캐러셀) | 🟡 코드완성, `content_publish` **Meta 심사대기**. **[2026-07-31]** 심사중이면 발행 버튼 대신 **캡션 복사 안내**로 대체 — 눌러도 실패하는 버튼을 없앴다 | `instagram.py /publish-file`, `app-instagram.js:208,1189` |
| **인앱결제(IAP)** — StoreKit / Play Billing | 🟡 **FE·BE 완비·실기기 미검증**. `window.ItdasyIAP`(cordova-plugin-purchase v13, RevenueCat 아님) → 영수증/purchaseToken 을 백엔드 교차검증(`/iap/apple-verify`·`/iap/google-verify`·`/iap/status`). 플러그인 없으면 `isAvailable()=false` → 웹은 무회귀. **구매 복원 버튼**은 네이티브에서만 노출. ⚠️ 영수증 추출 필드가 플랫폼·버전마다 달라 여러 경로를 방어적으로 시도, 실패 시 `finish()` 안 함(스토어 재통지) | `app-iap.js`(225), `app-plan.js:213,356,428`, `iap.py`(1191) |
| **IAP 자동갱신·환불** — S2S / RTDN | ✅ **구현·라이브**(2026-08-03). 예전엔 두 웹훅이 `TODO(Phase 2)` 로 **로그만 찍어** 갱신이 반영 안 됐다 → 결제자가 한 주기 뒤 free 강등(P0). 이제 Apple `/iap/apple-notification`(JWS x5c → **Apple Root CA G3 바이트 핀** + bundleId 검증) · Google `/iap/google-rtdn`(Pub/Sub OIDC) 이 상태를 반영한다. **Apple**: SUBSCRIBED·DID_RENEW·OFFER_REDEEMED·RENEWAL_EXTENDED·**REFUND_REVERSED**→활성 / EXPIRED·GRACE_PERIOD_EXPIRED→만료 / REFUND·REVOKE→환불 / DID_CHANGE_RENEWAL_STATUS→취소예약 / DID_FAIL_TO_RENEW→유예. **Google**: 20코드 매핑, PURCHASED·RECOVERED·RENEWED·RESTARTED·IN_GRACE_PERIOD→활성(단 `payment_state` 미결제면 권한 미부여) / CANCELED→취소예약(즉시 강등 아님) / EXPIRED·REVOKED→종료 / ON_HOLD·PAUSED→만료일만 동기화. 🔑 **기간은 `+30일` 이 아니라 스토어 만료일 절대값 대입 + 단조연장**이라 재전송·순서역전에 멱등(`used_nonces` PK 로 중복 차단). 웹훅 유실 대비 **백업 2단**: Google 은 `purchase_token` 재조회, Apple 은 3일 유예(App Store Server API 자격증명 없어 재조회 불가) | `iap.py:480`(이벤트셋)·`:401`(_mark_active)·`:646`(유예), `subscription.py:133`(강등 직전 훅) |
| **구독 해지 경로** — 스토어 vs 웹 PG | ✅ **라이브**. 예전엔 '구독 취소' 버튼이 결제 주체를 안 가리고 `POST /billing/cancel` 을 불러, **스토어 결제자가 "취소됨" 을 보고도 계속 청구**됐다(Apple 3.1.2 위반). 이제 `/subscription/status` 가 `store`·`product_id`·`auto_renewing` 을 내려주고 프론트가 분기: `apple`/`google` → 버튼이 **"스토어에서 구독 관리"**, 취소 API 호출 0, 딥링크만(iOS `itms-apps://apps.apple.com/account/subscriptions` / Android `play.google.com/store/account/subscriptions?sku=&package=`**`com.y2do.itdasy`** ⚠️iOS 번들ID와 다름). `portone`/`demo`/`null` → 기존 서버 취소. `store` 미상이면 네이티브는 플랫폼으로 폴백. 스토어 구독엔 `cancel_at_period_end` 를 **표시하지 않는다**(스토어에서 해지해도 false라 거짓말이 된다) | `app-plan.js:176,213,224,236,405`, `subscription.py:163`(store 반환) |
| **토큰 보안저장**(Keychain / Keystore) | 🟡 **네이티브에서 자동활성**, 웹·기존설치 무변경 | `app-secure-storage.js`(89) + `app-core.js` 저장소 추상화 |
| **비밀번호 변경** | ✅ **[2026-08-01 신설]** — 백엔드는 있는데 앱에서 못 바꾸던 상태였음 | `app-core.js:1479` |
| 인스타 **게시물 댓글 답글 자동화** | 🟡 **스테이징 ON** — `INSTAGRAM_FULL_SCOPE=1`(Cloud Run env, 코드 아님)이라 개발모드/테스터는 App Review 전에도 `manage_comments` 획득 가능. **운영은 env 없음 → basic scope**. 스코프는 동의 시점에 토큰에 박히므로 **기존 연동자는 인스타 재연결 필요**(refresh-token 으론 안 바뀜) | `instagram.py:74,710`, `/instagram/comment-queue`(:799) · FE 큐 UI `app-comment-reply-queue.js` **[2026-07-20 v785 리디자인]** 게시물칩+미리보기팝업·채널별 토글(답글만/DM만)·DM접기 + 홈 "AI 잇비가 챙겼어요" 진입줄(`app-home-v41.js _fetchCommentQueueCount`) **[2026-07-21]** 분류 인텐트 확장 = price·booking·location·hours·service·**duration(소요시간·지속력, 유실복구)·event(이벤트)·membership(회원권)·eligibility(건강여부→항상 사람)**·complaint(`instagram.py _classify_comment` + LLM 재판정 `comment_intent_llm.py`) · **응답 시간대(방해금지)** 설정 = `itdasy:crq_settings.active_hours`+`quiet_outside`, 운영시간 밖엔 홈 넛지 뮤트(`window.crqQuietNow`)+큐 배너, 발송은 언제든 가능 · autoreply_gate `within_hours`(DM 운영시간 재사용, 자동발송 켜질 때만 유효·shadow) **[2026-07-22 v790]** 설정 **서버 보관** = `GET/PUT /instagram/comment-reply-settings` → `dm_auto_reply_settings.crq_settings_json`(예전엔 localStorage 뿐이라 폰 교체·캐시 삭제로 소실). 헤더 **저장 버튼**(DM 자동응답과 같은 자리) + 세부설정 2종 = `default_dm`(새 문의의 'DM 같이 보내기' 기본값)·`exclude_words`(이 말 든 댓글은 큐에서 제외, 쉼표 구분) **[2026-07-25~26]** **'무시' 서버 영속화**(`f8b833a`) — 예전엔 로컬만이라 배지 숫자와 리스트가 어긋나고 기기 간 동기화가 안 됐음 · **webhook 저장분(`CommentAuthorLog`) 큐 병합**으로 실시간화(`9c4897c`) · **자동갱신 폴링 + 토글 라벨 정정**(`bfc1666`) · 🚨 **발송 API(답글·DM)를 전역 재시도 목록에서 제외**(`33cdd1f`) — 안 그러면 같은 답글이 최대 4번 나감 · 공개 초안에서 DM 언급 제거(`5f617ff`, 화면 = 실제로 달리는 문구) |
| 네이버 플레이스 **리뷰 답글 자동화** | ❌ **불가** — 공식 답글 API 없음 | — |
| **리뷰 요청** 관리(손님에게 리뷰 요청·상태추적) | ✅ | `customer_reviews.py`, `app-review.js` |
| **예약 자동확정**(auto_confirm) | ✅ **[2026-07-27] 죽은 토글 → 실기능화** (기본 OFF) | `17804d8`, 마이그 `0027`, FE `8bb708d` |
| **운영시간 외 자리비움 자동응답** | ✅ **[2026-07-27] 죽은 토글 → 실기능화** (기본 OFF). 운영시간 외 DM 에 **손님당 12h 1회 dedup** 발송 | `ff5ffd8`, 마이그 `0028`, FE `9bb3832`. 실발송은 실DM E2E 미검증 |
| **백엔드 다운·LLM 이상 Discord 알림** | ✅ **[2026-07-27]** GitHub Actions cron. ⚠️ **실측 감시 주기는 5분이 아니라 약 1시간**(Actions cron 지연, `09198b4` 에서 정정) | `68f7c8d`, `6cdbefe`(YAML 파싱 실패로 알림이 영영 안 올 뻔) |
| 인스타 **인사이트**(도달·저장·최적시간) | ✅ | `instagram_insights.py` |
| **게시물별 성과 + "무엇이 먹혔나" 학습** | ✅ **[2026-07-18]** 표본 부족 축은 축마다 "3건 올려야" 박스를 그려 다닥다닥했음(축 5개면 최대 5줄) → 데이터 있는 축만 막대, **부족 축들은 이름만 모아 한 줄로 통합**(`_compareHtml` 의 `pending`, CSS `.wsp-axis__pending`, 은/는 조사 자동). **[2026-07-15]** 발행 게시물을 레이아웃 프리셋(`wsl-*`)·말투·사진장수 축으로 묶어 반응 비교. 표본 3건 미만은 순위 안 매김. 게시물별 미응대 문의 댓글도 표시 | `js/workspace/workspace-perf.js`, `__tests__/workspace-perf.test.js` |
| 성과 화면 **DM 유입 귀속** | ❌ **데이터 없음**(심사 문제 아님) — `/dm/conversations`는 '마지막 대화 시각'만, `DMMessageLog`에 게시물 참조 컬럼 없음. `messaging_referral` 웹훅은 구독만 하고 파싱 없이 버려짐 | `dm_autoreply.py:3100`(버리는 곳), `:5200`(구독) |

> **DM 응대 구조 핵심:** DM/문의 답장은 별도 "인박스 파일" 하나가 아니라 — 수신 채널(인스타/톡톡) → `services/channels/*` 어댑터 → 코어 DM 엔진(`services/dm_intent`·`dm_context_builder`·`dm_free_reply`) → `dm_confirm_queue`(원장 검토) 로 흐른다. 잇비 챗봇 쪽 발화는 `reply_dm`/`draft_message` kind로 백엔드 LLM이 초안, FE `js/assistant/marketing-safety-labels.js`·`marketing-draft-policy.js`가 톤·안전 라벨만 입힘.

---

## 🖥️ 프론트엔드

### 코어 인프라 (부팅·API·인증·로더·SW)
- **app-core.js** (3520) — 앱 부팅. `PROD_API`(staging Cloud Run)+`window.apiUrl/apiFetch`, 격리 토큰키 `itdasy_token::staging|prod|local`, `getToken/login/logout`, `showTab()` 라우팅, XSS `_esc`, SW 등록·버전배지.
  - **[2026-07-26~08-01 보안·결제]** **오리진 게이트** — 전역 fetch 가 허용 오리진 외로는 토큰을 안 실음 · **`NO_RETRY_PATH_RE`**(`:1135`) = `/billing`·발송류 **재시도 금지**(결제 이중청구·답글 4번 발송 차단) · **`CREATE_NO_RETRY_RE`**(`:1158`) = `/bookings`·`/revenue`·`/customers` 생성 POST 재시도 금지(중복 생성) · **비밀번호 변경 화면**(`:1479`) · 로그아웃 시 서버 세션 무효화 호출 · 토큰 저장소 추상화(보안저장 스왑 지점).
  - 🚨 **전역 fetch 래퍼 타임아웃** — 일반 20초(재시도 12초·최대 4회). **[2026-07-22 v790]** `LLM_PATH_RE`(`/assistant/`·`/caption/`·`/persona/`·`/image/enhance|remove-bg|…`) 매칭 시 **120초 + 타임아웃 재시도 금지**(5xx 재시도는 유지). 이걸 안 하면 잇비 답변·캡션 생성이 20초에 강제중단되고 12초짜리로 3번 더 재호출돼 **LLM 중복 과금 + 60초 뒤 '실패했어요'** — '백엔드가 고장난 것 같다'의 실제 정체였다. 느린 신규 API 는 `itdasyTimeoutMs` 로 개별 상향.
  - **시트 뒤로가기 레지스트리** `_registerSheet/_markSheetOpen/_markSheetClosed`(:2888~). 풀스크린 오버레이는 **반드시 open 에서 등록**해야 안드로이드 back/스와이프에 앱이 안 꺼진다. **[2026-07-22]** 미등록 7화면(내샵정보·작업실설정·DM메뉴·네이버연동·톡톡·카카오·백업) 전부 등록 + close 가 replaceState 대신 실제 `history.back()` 으로 엔트리를 뺀다(안 그러면 '눌러도 아무 일 없는 뒤로가기'가 쌓임).
- **sw.js** (256) — 서비스워커. `CACHE_VERSION` 캐시버전, `/api·/auth` network-first / 정적 cache-first, 읽기전용 GET 오프라인 폴백, 지연그룹 프리캐시 제외. **[2026-07-27]** `CACHE_VERSION` 이 7/24 에 고착돼 새 배포가 폰에 안 보이던 사고 있었음(`1347e8c`).
- **js/loader.js** (129) — 분할 로더 `AppLoader.ensure(group)`. 순서보장 동적로드 + idle 선로딩. **[2026-08-01]** 한 번 실패하면 영구 먹통이던 것 수정(`7cab714`).
- **js/load-groups.js** (186) — 로드 매니페스트 `APP_LOAD_GROUPS`(photo/assistant/extras). ✅ **[2026-07-23~] `?v=` 는 배포가 자동 범프**(`deploy.yml` + `scripts/bump_cache_busters.py`, `2d5a9cc`) — `load-groups.js` 자신의 버전이 안 바뀌면 배포를 실패시킨다. **아직 `?v=` 가 안 붙은 새 파일만 한 번 손으로 붙이면 됨.**
- **app-save-file.js** (93) — 🆕 **[2026-08-01 P0] 파일 저장 공용 헬퍼.** 앱 곳곳이 `<a download>` + 무조건 `toast('저장 완료')` 였는데 **iOS WKWebView·Android Capacitor WebView 는 data:/blob: 를 그 방식으로 저장 못 한다** → 아무 일도 안 일어나는데 "저장했어요". 사진 저장·백업·데이터 내보내기(개인정보 이동권) 전부 해당 = 심사·법무 리스크. `navigator.share + canShare`(@capacitor/share) 패턴을 공용으로 뽑고 **실패 시 실패를 말한다.**
- **js/channel-mark.js** (58) — 인박스 채널 배지 `ChannelMark.norm/mark`(인스타/카카오/네이버톡톡).
- **js/heic-convert.js** (63) — 아이폰 HEIC→JPEG 클라 변환.
- **app-perf-recovery.js** (663) — 3초 체감 성능복구·프리로드·워치독 + **오프라인 판정·쓰기잠금**(`_markOffline`·`_setMutationLock`).
  - 🚨 **[2026-08-01 오프라인 오판 근본수정]** 라이브 실측: `/auth/me` 를 **딱 한 번** 503 으로 만들자 즉시 오프라인 배너 + `_setMutationLock(true)` 로 **저장 버튼 전부 잠김**. 이 경로는 원래 `_markOffline` 미정의라 죽어 있었는데 전날(`506c0d7`) 정의해 살리면서 설계 결함이 그대로 터졌다. → 결함 4 수정: ① **응답이 왔으면 네트워크는 정상** (429/500/503 ≠ 오프라인, fetch 가 실제로 throw/abort 할 때만) ② 재시도 0회 → **3회 백오프**(0·1.2s·3s) ③ **자가복구** 15초마다 재확인 → 사용자가 아무것도 안 해도 풀림 ④ 앱 복귀마다 무방비 프로브 제거. **교훈: 죽은 코드를 살릴 땐 원래 옳았는지부터 본다.**
  - ⚠️ **"배너 CSS 가 없다"는 오진이었고 되돌렸다**(`ac16eed`) — 원본 스타일은 처음부터 멀쩡했다. `transform` 요소는 height 가 그대로라 '보임' 판정이 어긋나고, **배경 탭은 레이아웃 갱신이 지연**된다(시각 측정은 fronted 탭에서).
- **[2026-08-01 부팅 관측]** **Sentry 를 `app-core.js` 앞으로** 옮김(`0ad4c0f`) — 그전엔 부팅 크래시가 통째로 사각지대였다. CDN 스크립트엔 **SRI(`integrity`)** 부착. **[2026-07-26]** 부팅 캐시 미스매치 자가복구 — '빈 홈+네비만' 상태를 감지해 자동 리로드(`3d24e94`).
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
- **app-revenue-hub.js**(**35** — [2026-07-27] 옛 UI 550줄 삭제, 지금은 얇은 진입점만. 죽은 코드였음)·**app-revenue-today.js**(243)·**app-revenue-month.js**(630)·**app-revenue-calendar.js**(188)·**app-revenue-report.js**(156) — 허브/오늘·주/월/캘린더칩/리포트.
- **js/revenue/booking-revenue-overlay.js** (248) — 예약금(deposit)을 매출 요약/브리핑에 합산.
- **app-report.js** (157) — 주말 자동 리포트.

### 예약·캘린더
- **app-calendar-view.js** (2595) — 예약관리 v4(월/주/일, 모바일·PC) `CalendarView`. **[2026-07-25 예약 QA]** 주간뷰 월경계 예약 누락·자정넘김 충돌표시 수정, 텍스트 글리프 → Lucide.
- **app-booking-api.js** (350) — 예약 CRUD + 오프라인 폴백 `Booking`. **[2026-07-25 예약 QA]** 🚨 **충돌검사가 무력화돼 있던 것** + 과거날짜 KST 구멍 + 폼 back 소실 + 고객 자동등록 중복(`force` 우회) 수정. **[2026-07-26]** 예약 알림톡 자동발송 토글(F5 opt-in, `app-shop-settings`).
- **app-complete-flow.js** (585) — 시술 완료 시트(예약→매출 전환).
- **app-reminder.js** (113) — 예약 리마인더 컨트롤.

### 고객 CRM
- **app-customer.js** (1066) — 경량 CRM `openCustomers`. **app-customer-dashboard.js**(522)·**app-customer-ai-brief.js**(496)·**app-customer-chips.js**(206)·**app-customer-memo.js**(419)·**app-customer-cache.js**(74)·**app-customer-sync.js**(53) — 대시보드/AI브리핑/추천칩/메모/캐시/예약시 자동등록.
- **[2026-08-05 출시감사]** 🚨 **목록이 200명에서 잘려 201번째부터 앱에서 영구히 안 보이던 P0** 수정.
  `GET /customers` 에 **`q`(서버 검색)·`limit`·`offset`** 추가, `total` 은 DB 가 센 실제 수(예전엔 잘린 개수).
  프론트 검색은 캐시 안에서만 찾다가 → **캐시 밖이면 서버 검색**으로 넘어감(`_total > 캐시길이`일 때만, 300ms 디바운스).
  같이 고친 것: 동시 생성 중복(DB UNIQUE `uq_customers_dedup` + `dedup_key`, 마이그 0039) ·
  방문 횟수 3화면 불일치(`services/customer_visits.py` 단일 정의) · 목록 캐시 무효화 누락
  (매출·회원권·예약 라우터 3곳 → `utils/kv_cache.invalidate_customer_caches`) ·
  409/402/401 이 전부 "다시 시도해주세요"로 뭉개지던 것(`_api` 가 서버 detail 보존) ·
  오프라인 폴백이 죽은 코드였던 것(네트워크 끊김 감지 + 온라인 복귀 시 flush) · 탭 간 동기화(storage 리스너) ·
  회원권 잔액 남은 고객 삭제 차단. 회귀: `backend/tests/test_customer_audit_2026_08_05.py`(34건).
  ⚠️ `POST /customers/backfill-visits` **삭제됨**(호출처 0건인데 7,917행 일괄 UPDATE).
- **[2026-08-05 릴리즈]** 중복 손님 **정리 UI 신설** — 목록 상단 배너 → 남길 손님 선택 → 합치기.
  `POST /customers/merge` 는 예전부터 있었지만 **프론트 호출처가 0건**이라 합칠 방법이 없었다.
  탐색은 신설 `GET /customers/duplicates`(서버가 dedup_key 와 **같은 기준**으로 묶음, `total_groups` 는 자르기 전 실수).
  검색은 **공백 무시 양방향**(`"김 철수"`↔`"김철수"`). 접근성: 포커스 트랩·ESC 2단계·Tab 순환·배경 aria-hidden.
  터치 영역 44pt(칩은 `::after` 히트박스로 — 보이는 크기는 그대로).
  🔴 회귀 1건 잡음: `before_update` 가 dedup_key 를 되살려 **동명이인 손님에게 매출·회원권이 500** 이었다
  (`force=true` 로 만든 중복 + 0039 가 남긴 기존 중복 전부 해당). NULL = 중복 허용은 이제 sticky.
- **app-birthday.js** (164) — 생일/기념일 자동감지. **app-photo-match.js**(162) EXIF 고객매핑. **app-retention-ai.js**(340) 이탈위험 고객. **app-review.js**(199) 리뷰요청. **app-waitlist.js**(149) 대기자.

### DM·SNS·연동 (FE)
- **app-instagram.js** (1245) — 인스타 연동 & 말투분석. **[2026-07-30~31]** 연동 주소에서 **JWT 를 빼고 60초 1회용 티켓** 사용(전엔 Cloud Run 로그에 평문 노출) · 네이티브 앱에서 연동이 막히던 버그(PWA 가드가 네이티브 미인식) · `content_publish` 심사중이면 발행 버튼 대신 캡션 복사 안내(`:208`) · shopName 이스케이프. **app-dm-autoreply.js**(1541) AI DM 자동응답 v3. **app-dm-conversations.js**(650) DM 채팅방. **app-dm-confirm-queue.js**(821) 원장 confirm 큐. **app-dm-manual-replies.js**(479) 매뉴얼 멘트. **app-dm-menu.js**(489) 빠른안내(Quick Replies+Ice Breakers). **app-dm-booking-form.js**(185) DM 예약양식. **app-dm-settings-cache.js**(55).
- **app-naver-link.js**(207) 네이버 예약연동. **app-naver-talk-link.js**(219) 네이버 톡톡연동. **app-sns-hashtag.js**(198) 해시태그 매니저. **app-notifications.js**(**368** — [2026-07-27] 홈 인라인 알림 3종 죽은 코드 제거) 인앱 알림. **app-comment-reply-queue.js**(767) 댓글 문의 응대 큐.

### AI 비서(잇비) — FE
> **[Phase 0 · 2026-07-20 잇비 만능화]** 실행 배관(`assistant.py:_execute_action_impl`)은 26 kind 지원했지만 Gemini `RESPONSE_SCHEMA` enum이 ~10개만 허용해 나머지가 잠겨 있었음. **7 kind 해제**(refund_revenue·charge_membership·use_membership·mark_booking_no_show·mark_booking_completed·create_treatment_record·update_service_price) — 두 enum+payload+SYSTEM_PROMPT 트리거 확장으로 자유발화 실행 가능. FE는 `kind-core.js` CATEGORY에 create_treatment_record만 추가(나머지 기존 메타·RISKY 재사용). 발송정책=항상 confirm. 남은 로드맵(P1조회~P4작업실)=memory `project_itbi_omni_upgrade`.
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
- 🆕 **js/service-categories.js** (66) — **[2026-07-23] 시술 카테고리 7종 단일 진실원**(`lash·nail·waxing·tattoo·skin·extension·hair`). 예전엔 분류가 앱 안에 **5벌** 따로 있었고 서로 안 맞아서 속눈썹·왁싱·반영구가 전부 `makeup` 한 통에 들어갔다(= 성격이 완전히 다른 시술이 같은 few-shot 풀·같은 톤 지시를 받음). **백엔드 `config/services.py` 가 SSOT 이고 이 파일은 복제본** — 한쪽만 고치면 BE `test_service_categories.py` 가 빨강. **고칠 땐 백엔드부터.** 검사 순서 = 모호성 적은 것부터(`extension` 이 `hair` 보다 앞, `hair` 가 마지막).

### 사진 편집기 (js/photo-editor/** + app-photo-editor*.js 60개)
- **beauty-engine.js** (773) — 뷰티 픽셀 엔진(네일광택·헤어볼륨/윤기·피부톤·눈빛, 마스크 ROI 게이트). **renderer.js**(360) WebGL+2D 폴백. **basic-panels.js**(509) 기본 패널. **history.js**(53) undo/redo. **studio-presets.js**(146) 살롱 빠른보정. **price-menu.js**(36) 가격표 자동채움.
- **[#11 2026-07-17 배경엔 기본보정 제외]** `PhotoEditorBgCompose.compose()` 가 **`personMaskDataUrl`(합성본 정렬 사람 알파)** 을 추가 반환 → `basic-panels` 이 `state.bgFgMaskDataUrl` 로 보관 → `renderer._keepBgUnadjusted()` 가 보정 체인 **끝난 뒤** 사람만 오려내고(`destination-in`) 보정 전 원본을 뒤에 깔아(`destination-over`) **배경 색을 되돌린다**. CPU필터·WebGL톤·워커샤픈 어느 경로든 결과만 손대므로 파이프라인 무변경. ⚠️ **`removedBgDataUrl` 로 마스킹하면 안 됨** — 그건 누끼 PNG 자기 좌표계라 `place.dx/dy` 로 배치·크롭된 합성본과 안 맞는다. 마스크 async 로드 시 **`_fxCache` 를 버려야 함**(hash 가 같아 안 버리면 배경까지 보정된 캐시가 계속 나옴). 마스크 없으면(구 슬롯) 예전 동작 폴백. **[#11 나머지 2026-07-18 v775 ItdEditor 적용]** 누끼(`doCutout`)가 `compose` 의 `personMaskDataUrl` 을 `S.fgMask[i]`(세션 전용, 매트처럼)로 보관 → 기본 보정을 사람에만. **미리보기**: 단일 = `refs.photofx` 오버레이(같은 사진 + 보정 + `-webkit-mask`=사람마스크, `photowrap` 안이라 pz 변형 상속, base `photo` 는 필터 없음=배경 원래색) / 콜라주 = 셀마다 base `img`(보정X) + `.itcellfx` **background-image div**(보정+마스크, `background-size` 가 `object-fit` 과 같은 방식 크롭이라 정렬 — img+mask 는 어긋남). **export**: 오프스크린에 보정본 그려 `destination-in` 사람마스크 → 본 캔버스엔 보정 전(배경) 위에 보정된 사람. `_fgActive(i)` = 누끼+실보정일 때만(항등 보정은 예전 경로). `_adjIsId` 로 항등 판정(`filterStr` 기본값이 `brightness(1.00)…` 라 `'none'` 아님). **검증**: 단일 export 배경`[48,80,191]` 유지·사람 `[255,89,89]` 밝아짐 + 미리보기 2겹 정렬 + 비-누끼 회귀 없음 확인. 🚧 **콜라주+누끼+보정 E2E는 헤드리스 미검증**(레일에 layout 도구 없어 구동 불가) — 코드는 단일과 동일 패턴, 비-누끼 셀은 원본과 동일 HTML(회귀 없음). 누끼 매트는 서버 호출이라 실검증은 합성 데이터로만.
- 누끼/마스크: **region-mask-provider.js**(720, dispatcher Tier1~3) + **mask-application.js**(317)·**mask-refine.js**(301)·**mask-confidence.js**(63)·**mask-strict-policy.js**(57)·**mask-status-ui.js**(147)·**mask-debug-overlay.js**(169)·**mask-qa-tool.js**(251). 부위 어댑터 7종: hair·hand(nail)·brow·eyelash·sclera(+application).
- AI 추천/생성형: **reco-region.js**(71)·**reco-map.js**(68)·**reco-cards-ui.js**(288)·**reco-vision-client.js**(78)·**reco-consent.js**(81) / **generative-client.js**(87)·**generative-consent.js**(83).
- 템플릿 렌더: **premium-templates.js**(713, 30종 렌더러) + **template-renderer-beauty-pack.js**(345)·**-draws.js**(718, id별 드로)·**template-renderer-wm-pack-draws.js**(380) + **template-overlay.js**(378)·**template-slots.js**(166)·**template-fit-text.js**(195, 자동줄바꿈·폰트축소)·**template-thumb.js**(122)·**template-market-data.js**(292)·**template-pack-beauty-data.js**(445)·**template-pack-v3-*.js**(데이터/preview, 앱 미연결).
- 검증도구: **photo-effect-debug.js**(287)·**photo-effect-manual-debug.js**(470). **app-mediapipe-loader.js**(334)·**app-photo-enhance.js**(328).
- **app-photo-editor*.js** (60) — 편집기 엔진 서브모듈: entry/nav/pro-tab, WebGL(gl-bridge·pipeline·shaders), 마스킹·힐링(face-mask·smart-mask·heal-v2·beauty-ai·relight·cuticle), 배경(bg-compose·bg-blur·bg-cache), 자연어편집(intent-parser·nl-apply·nl-modify·edit-plan), 템플릿·프리셋·B&A슬라이더·콜라주·스티커·내보내기·워커필터. `loader.js` photo 그룹 지연로드.

### 작업실 (js/workspace/**)
- **js/workspace/workspace-v2-flow.js** (4732) — **작업실 전체 오케스트레이터.**
  - **[#18 2026-07-28 게시 크기 선택]** 업로드 화면 세그먼트로 **4:5(세로로 크게, 기본) / 1:1(정사각)** 선택 → 편집기·템플릿·콜라주·크롭·미리보기까지 관통(`:261~272`, `_wsFormat()`/`_wsRatio()`). 마지막 선택 기억. **비율 우선순위: 사용자 선택 > ShopStyle `frame.ratio`**(전엔 4:5 고정). 콜라주 캔버스 `W=1080, H=(1:1?1080:1350)`(`:3583`).
  - **[2026-07-24]** 작업 기억 꾸밈이 **구워진 실제 비율**로 합성 — 콜라주(3장→1장)가 '1:1'로 구워졌는데 샵 프레임 4:5로 다시 구우면 contain 레터박스되며 꾸밈이 작게 얹혔다(`:431`).
  - **[2026-07-24~25]** 기본 시술내용 텍스트는 **첫 장에만**(나머지는 원장이 직접) · 시술명 없으면 해시태그도 안 올림(사진에 해시태그만 덩그러니) · 사진 확대에서 back 누르면 큐까지 닫히던 것 · 잇비에 사진 11장 던지면 1장이 조용히 사라지던 것(안내 추가). 업로드→레이아웃→편집→게시글(캡션+미리보기 통합)→고객연결. 화면전환/CTA/상태(d)/네비스택, flow/*·ItdEditor·PhotoEditor·adapter 조립 허브. **[2026-07-13] 캡션 결과 화면에 발행+피드 미리보기 흡수(구 preview 스텝은 플러밍만 보존, 진입 없음). 진행바 4단계(upload·layout·caption·connect).** **[2026-07-15] 캡션 = 질문 3개 한 화면(스크롤 없이). '직접' 선택 시 인라인 입력 토글 복구, 시술 칩 단일선택 + 특이사항 분리. 원문 verbatim 강제 로직 삭제(욕설·하소연 원문 복붙 버그 → 사용자 텍스트는 재료로만).**
  - **[2026-07-17 v771 근본원인 4건]** ① `_displayItems()` 가 `d.templateOutput`(=첫 카드 미러)에서 조기 리턴해 **T-116 다중 카드를 통째로 가림** → 캡션·결과 화면이 늘 1장(캐러셀은 `items.length<2` 로 도달 불가였음). 이제 `templateOutputs<2` 일 때만 리턴. ② **`_syncOutputForEdit()` 신설** — 편집기 `onDone` 이 `templateOutput` 미러만 갱신하고 `templateOutputs[]` 엔 편집 전 합성본을 남겨 **꾸미기 전 사진이 발행됨**. ③ **발행 판단 기준 = `d.wsLayout` → `templateOutputs`** — `wsLayout` 은 레이아웃 화면이 세션 중에만 채우고 `open()` 이 복원 안 함 → 재오픈 초안 발행 시 원본 여러 장이 캐러셀로 나가 **레이아웃 소실 + 30초**(서버가 child 마다 2초 순차 폴링). ④ **세션 가드(`_stale`)가 발행 사실까지 삼킴** → 업로드 중 닫으면 인스타엔 올라갔는데 로컬은 영원히 draft. 이제 화면·전역 `d` 는 두고 `myD`/`slot` 에만 기록(P1#1 오염방지 의도는 유지).
  - **[2026-07-17] `_autoComposeTemplate()` 부활** (구 no-op) — 시술명·해시태그·로고가 편집기 안에서만 살아서 "사진편집 눌러야 텍스트가 보임"이었음. **편집기와 같은 렌더러(`ItdEditor.compose`)** 로 같은 레이어·비율로 굽는다(2026-07-12 에 지운 이유였던 '다른 경로 → 미리보기 어긋남'을 피함). **겹쳐 굽기 3중 방어**: `storyEdited` 카드 skip(원장 편집 우선) / `o.autoSig` 같으면 skip(재렌더 무한루프도 차단) / 원판 `o._autoBase` 없으면 skip(재오픈 시 구운 것 위에 또 굽기 금지). ⚠️ **`_autoBase` 는 메모리 전용** — `buildSlot()` 이 떼어냄(저장하면 같은 dataURL 2벌 = sync 100KB 컷). **`storyEdited` 는 저장·복원 추가**(메모리에만 있어 재오픈 시 방어①이 무력화됐음).
- **[2026-07-17 v774 3차]** **#1** 성과의 '고객·매출 인사이트 보기' 버튼 삭제(AI 인사이트 진입점은 5곳 더 있어 고아 안 됨: `app-dashboard.js:221`·`app-assistant.js:4147`·`app-today-brief.js:215`·`js/home/v41-actions.js:79`·홈 성과버튼 폴백). **#5** 시술 칩 **중복선택**(최대 5) — `d.service` 는 **쉼표 조인 문자열 유지**(소비처 20곳이 이미 쉼표를 다룸: `_svcTitle`='첫시술 외 N개', `_makeName`=첫 조각). `_svcList()/_svcSet()` 로 편집만 다중화, `_saveRecentService` 는 쉼표로 쪼개 **하나씩** 저장(조인문자열이 칩으로 박제되는 것 방지), 다중이면 프롬프트 문구도 '유일한 시술'→'N가지 전부 반영'. **최근 시술 6→5**. **#6** 특이사항 placeholder **업종별**(`_NOTE_EG`, 키=`_SVC_TYPES` 라벨 → `itdasyNormalizeShopType` 폴백 → 무난한 기본). **#14** 성과 = ⋯ 메뉴 → **홈 필터 줄**(`data-wsv2-perf`, `.wf-perf`), ⋯ 에선 제거. **#16** 작업 기억 정렬 `lastUsedAt` → **`createdAt`**(최근 만든 게 위).
- **workspace-v2-home.js**(634) 홈 렌더러. **[2026-07-15] 헤더 = @인스타핸들 + 샵이름(구 '내 작업실' 대체). 할일/이번달 발행/성과/피드 정렬 카드 제거, 설정·선택은 ⋯ 메뉴로 이동. 발행 타일 무배지(진행 중만 '작성 중' 칩). 이어서 카드 제목 키메라 수정('첫시술 외 N개').** **workspace-adapter.js**(769) 기존기능 연결 어댑터(보정/누끼/캡션/고객/저장/인스타업로드/`recentMedia`). **workspace-sync.js**(425) 기기간 draft slot 동기화. **[2026-07-15 버그수정]** `buildMeta(slot)`→`buildMeta(c)`: 원본 slot 의 `templateOutputs[].outputUrl` 이 구운 dataURL 이라 100KB 컷에 걸려 레이아웃 프리셋 id 가 서버에 안 올라가고 기기 바꾸면 성과 학습이 리셋됐음. **workspace-perf.js**(성과·학습 화면 — 레이아웃/말투/사진장수 축 비교, 미응대 문의). **workspace-crop.js**(239)·**workspace-tpl-edit.js**(239)·**shop-style.js**(188, 브랜드자산)·**workspace-state.js**(78).
- **workspace-settings.js** (461) — 섹션: ①원장 작업 기억 ②매장 정보(+**샵 정보 반영하기** 토글) ③캡션 고정 멘트 ④**[2026-07-23] 사진 자동삽입 토글**(시술내용·해시태그 — ShopStyle 레이어 `enabled` 토글, `:407`) ⑤**[2026-07-23] 예약한 게시물 목록 + 취소**(`:369`, 되돌릴 수 없는 발행을 막는 유일한 수단이라 확인을 한 번 묻는다) ⑥**[2026-07-24] 자동감지 서명 관리**(`:300`·`:388`) — 인라인 편집 시 서버 저장 → `source=manual` 로 확정돼 **재분석이 못 덮는다**, 끄면 다음 재분석에도 안 살아남. **[#15 2026-07-17]** '내 레이아웃' 섹션 삭제 — **이미 죽어 있었다**(`getMyLayouts()`=photoSlots 있는 ShopStyle 만 거르는데 그걸 만드는 코드가 main 에 없음 → 항상 빈 목록). ⚠️ **ShopStyle 저장소 자체는 삭제 금지** — `_buildShopStyleLayers`(로고·워터마크·role 텍스트)와 `_learnShopStyle` 의 '지운 역할 기억(`enabled:false`)' 이 같은 키를 씀. 샵정보 토글은 '캡션 고정 멘트'→'매장 정보'로 위치만 이동(키 `itdasy:caption_shopinfo` 동일, 읽는 곳은 `_shopCTA()` 하나뿐 = 캡션 꼬리 `📅 예약 →`·`☎`).
- **js/workspace/work-memory.js**(263, `window.WorkMemory`) — **[2026-07-14 T-115 P1] 원장 작업 기억.** 원장이 편집기에서 만든 꾸밈(글씨·스티커·선/도형)을 **작업실 저장·인스타 발행 성공 시점**에 붙잡아 최대 **10개** 보관 + 로컬 규칙으로 이름 자동생성("속눈썹 전후비교, 글씨 아래 왼쪽정렬") + ★기본 지정. 저장 `itdasy:work_memory:list`/`:default`(localStorage).
  - 담는 값 = `ItdEditor._exportState()`(editState)에서 **그 사진 전용값 제거**(`photos`·`photoDraw`·`adj`·`pz`·`cellCrop`) 후 재사용분(`layers`·`ratio`·`layoutIdx`·`collage*`)만. ⚠️ **붓 그림은 기억 못 함** — `photoDraw`는 벡터가 아니라 그 사진에 구워진 PNG.
  - ShopStyle 재사용 안 함(=`list()`가 이미 '내 레이아웃'·'우리샵 스타일' 두 용도로 혼재 + `makeLayer`가 텍스트 4 role 전용이라 스티커/도형 불가).
  - 같은 작업은 지문(`_sig`)으로 dedup → useCount만 증가. 10개 초과 시 `lastUsedAt` 오래된 것부터 제거(**★기본은 보호**). quota 실패 시 밀어내고 재시도.
  - 훅 4곳(호출 1줄씩, 로직 없음): `workspace-v2-flow.js` `save()`·`publish()` 성공·`_markPublishedNow()`(붙잡기) + `_openStoryEditor()`(다시 쓰기). UI = `workspace-settings.js` '원장 작업 기억' 섹션 + 발행 직후 `.wm-cap` 카드(3.5초). CSS `css/screens/sub-screens.css` `wm-*`.
  - **[P2] 다시 쓰기 — `defaultEditState()` → ★기본 기억을 `ItdEditor.open({editState})` 로 주입.** 🚩 **플래그 기본 ON**(`index.html:76` 이 `!== false` 로 켬). 롤백 `?wsmem=0` · 강제 `?wsmem=1`.
    - **[2026-07-17 v772 버그수정]** 주입 조건이 `!_restore && !_wsEd` 였다 — `_wsEd` 는 **작업실 레이아웃이 켜지면 늘 채워지는데 기본 흐름이 업로드→레이아웃→캡션이라 사실상 항상 꺼져 있었다**(★기본을 지정해도 새 글에 아무것도 안 올라옴). 이제 레이아웃이 있어도 `defaultEditState({layersOnly:true})` 로 **꾸밈(layers)만** 가져오고 **칸 배치(`layoutIdx`·`collageBg`·`fitMode`)는 레이아웃이 소유**(안 그러면 반대로 레이아웃이 기억에 덮임). 콜라주는 `_mergeWmLayers(_wsEd.editState, _wmEd)` 로 합침 — **같은 role 은 레이아웃 것 유지**(지난 글 문구 되살아남 방지). 잠금 = `__tests__/work-memory-layout.test.js`(7건).
    - 이어서편집(`p0.editState`)은 여전히 우선.
    - **같은 role 텍스트는 이번 글 문구로 갈아끼움** — 자리·크기·폰트만 기억. (안 그러면 지난 글 문구가 되살아남)
    - **기억 레이아웃 칸 수 ≠ 지금 사진 수면 `layoutIdx` 생략**(글씨·꾸밈만 얹음). 예: '전후 2칸' 기억 + 사진 1장 → 빈 칸 방지.
    - `photos`·`photoDraw`·`adj`·`pz` 는 안 넘김 — 넘기면 지금 사진을 지난 사진으로 덮어씀(`itd-editor.js:1648`).
    - 적용 시 `markUsed()` → `useCount`↑ = 자주 쓰는 기억은 10칸 밀어내기에서 보호됨.
    - 없는 role 의 시술 텍스트는 편집기 `_renderMissingIncoming` 이 추가(중복 안 됨).
  - **[P3] `_learnShopStyle`(flow.js) 과 소유권 분리 — 삭제가 아니라 '둘 중 하나만'.** 이 함수는 두 일을 한다:
    - ① **배치 학습**(위치·크기·폰트·외곽선 → 활성 ShopStyle 덮어쓰기) → **기억이 소유**. `WorkMemory.flagOn()` 이면 여기선 안 배움(같은 걸 두 곳에 저장하면 '왜 내 스타일이 저절로 바뀌지?' 가 됨). **기억 OFF(기본)면 예전 그대로 배움** — 안 그러면 대체재 없이 기능만 잃는다.
    - ② **지운 역할 기억**(`enabled:false`, v590) → **flow 가 계속 소유. 절대 지우면 안 됨.** 기억엔 대응물이 없고, 이게 빠지면 `_buildShopStyleLayers`(`L.enabled === false` 체크)가 지운 레이어를 다시 올리고 편집기 `_renderMissingIncoming` 도 '빠진 역할'로 보고 되살린다. **기억 ON 에서도 필요.**
    - `window.WorkMemory` 자체가 없으면(모듈 로드 실패) 예전 동작으로 폴백.
- flow 클러스터: **util.js**(96, `WSFlowUtil`)·**caption-text.js**(94)·**connect.js**(80)·**brand.js**(217)·**harmony-presets.js**(16)·**layout.js**(392)·**publish-progress.js**(42)·**thumbs.js**(47).
  - **[2026-07-15 T-116] layout.js = 결과물 여러 장(`d.wsCards`).** 카드 1개 = 올라갈 사진 1장 = `templateOutputs` 1개. 진입하면 사진 순서대로 **2장씩 자동 묶음**(첫=전·둘째=후, `reassignRoles` 와 같은 규칙) → 5장이면 2+2+낱장 = 결과물 3장. 화면=카드 좌우 캐러셀 + **하단 도크**(메뉴 전체/전후/자랑/붙이기/후기/팁/가격 = `kind` 매핑, 썸네일 좌우 슬라이드). **레이아웃을 고르고(=든다) 카드를 누르면 적용** — 사진 수가 맞는 카드만 눌림(빈 칸/사진증발 차단). 합치기(옆 카드와, 최대 4장)·나누기(낱장으로). 안 들고 있을 땐 미리보기가 곧 `slot-stage`(드래그=위치·핀치=확대). **[2026-07-15 개편] 장수 정확일치 거절 폐지 → 구성 3종 제시(그대로 / 표지+모아보기 / 전·후 합치기). 사진 1장은 구성 없이 확인만. 카드 캐러셀 → 번호 나열로 변경.**
  - `d.wsLayout`/`d._wsAssign` 은 **첫 카드 별칭**으로 유지 — 편집기 브리지(`_wsLayoutEditState`)·발행 kind 등 기존 소비처 무변경. 카드 목록/사진이 바뀌면 `_reconcile()` 이 **슬롯 수=사진 수** 불변식을 맞춘다.
  - 발행: 결과물 2장 이상이면 `_publishKind()`=carousel 이고 **캐러셀에 합성본(`templateOutputs[].outputUrl`)을 보낸다** — 원본 사진을 보내면 레이아웃이 조용히 사라짐.
- layout: **layout-model.js**(`WorkspaceLayout` 합성기)·**slot-stage.js**(92, 드래그focal·핀치zoom). 프리셋 6종: `wsl-ba-lr`(전후)·`wsl-collage-2`(좌우)·`wsl-collage-2-tb`(상하)·`wsl-strip-3`(3분할)·`wsl-grid-4`(2×2)·**`wsl-cover-1l2`(3장 크게+2, #3 신규 2026-07-18)**.
  - **[#3 2026-07-18 v776]** 3·4장 '한 컷에 모으기' 구성 추가 — 원장 요청("나머지 3장도 레이아웃, 딸깍딸깍 몇 개 더, 썸네일 직관적"). `_compOptions(n)`: **3장 = flat·cover·grid(나란히)·grid2(크게+2)·ba** / **4장 = flat·cover·grid(2×2)·ba** (5장+ 는 한 프리셋에 안 맞아 cover 로). `_buildCards` 가 comp==='grid'/'grid2' 면 전체 사진을 **한 콜라주 카드**(strip-3/grid-4/cover-1l2)로. 미니 썸네일 `_miniHtml` + CSS `.wsc-mini--g4`·`--1l2`. 검증: 세 프리셋 composeLayout 각 구역에 다른 사진(육안 스크린샷).

### 편집기 (js/itd-editor/**)
- **itd-editor.js** (2176) — 인스타식 편집기 `ItdEditor`(텍스트·스티커·반달레이아웃·그리기, 12폰트, HSV 색상). **safe-zone.js**(81, 얼굴위 텍스트 회피). **data/itd-decos.js**(104, 스티커 51종).
  - **[2026-07-23 아이콘 스티커]** `data/itd-icon-stickers.js`(~100KB) — 공개 아이콘 세트 96개를 **빌드 시점에 data URL 로 인라인**(런타임 CDN 무·오프라인 OK·CSP 안전). 스티커 탭 3개 추가: **아이콘**(`mingcute`, Apache 2.0, 단색이라 앱 스킨색으로 치환해 구움)·**컬러**(`fluent-emoji-flat`, MIT)·**라인**(`streamline-color`, **CC BY 4.0 → 귀속 표기 의무**). `STK_TABS` 가 `ItdIconStickers.tabs` 를 읽어 탭을 만들고(목록 이중관리 X), 삽입은 도형 데코와 같은 `addImageSticker` 경로. ⚠️ **로드 순서**: `itd-icon-stickers.js` 가 `itd-editor.js` 보다 앞이어야 탭이 생긴다. 🚨 **미완**: CC BY 귀속 표기 화면 없음(`ItdIconStickers.CREDITS` 데이터만 준비) — 심사 전 노출하거나 라인 탭 제거. 세트 추가·교체 절차와 라이선스 판단표는 **`.ai/ICON_SETS.md`**.
  - **[#9·#10 2026-07-18 v776]** **선·도형 비균등 늘리기** — 도형 레이어에 `L.w`/`L.h`(box px) 추가. `.itl__rs` 핸들이 **도형이면** 포인터 이동량을 회전 역보정해 box w/h 조절(중심 고정, 선은 가로=길이만·두께는 굵기슬라이더), 텍스트·스티커·이미지는 **예전대로 균등 `scale`**(`_fgActive`처럼 `L.type==='shape' && L.w!=null`일 때만 분기 → 회귀 0). `styleShape` inner=`width/height:100%`, `drawShape`/export 는 `offsetWidth`(=box)라 자동 반영, `_serLayer`는 회전 도형 AABB 오류 피하려 **`L.w/L.h` 직접 저장**(bounding rect 아님). **되돌리기(↩) 확장**: `move`(레이어 이동)·`cellcrop`(콜라주 칸 사진 위치)·`resize`(도형 늘리기) op 추가 — 실수로 옮긴 것 ↩로 원위치(예전엔 add/del/photo만). `addShape` 에 빠져 있던 `_pushOp` 도 복구. 검증: 선 180→420(두께 유지)·사각형 가로만 늘리기·↩ 복원·왕복(340×120 상대값 저장/복원)·스티커 균등 scale 회귀X.
  - **[2026-07-17 도형 왕복 버그수정]** `_serLayer` 가 shape 의 **`fill`·`strokeW` 를 안 내보내고** `addShopRect` 가 **`circle`→`round` 로 뭉개고 `fill=true` 를 강제**해서, 원장이 만든 '테두리 원'이 재편집·작업기억 복원 시 **'꽉 채운 둥근 사각형'**이 됐다. 굽기(`drawShape`)는 셋 다 이미 존중했으므로 **결과물은 맞고 왕복만 틀렸던 것**. `addShopLine` 도 `role` 을 무조건 `'rule'` 로 박아 원장이 직접 그린 선까지 자동 재배치(`:800`·`:822` 가 `role==='rule'` shape 를 옮김) 대상이 됐음 → `spec.role` 존중. ⚠️ `addShopRect` 의 `role` 기본값 `'panel'` 은 자동 재배치 대상이 아니라 그대로 둠.

### 임포트·OCR·성장
- **app-import.js**(475)·**app-import-wizard.js**(539)·**app-template-import.js**(269)·**app-smart-capture.js**(286, 카톡캡처+명함)·**app-receipt-scan.js**(674, 영수증/주문 OCR).
- **app-inventory.js**(605)·**app-inventory-hub.js**(594) 재고. **app-growth-story.js**(189) 월간성장. **app-killer-widgets.js**(602) AI 킬러위젯. **app-auto-ba.js**(160)·**app-ba-auto-trigger.js**(169) 전후 자동감지.

### 허브·결제·설정
- 허브: **app-ai-hub.js**(366, 자동화)·**app-customer-hub.js**(30)·**app-integrations-hub.js**(126)·**app-inventory-hub.js**(594)·**app-kakao-hub.js**(137, 알림톡 UI 스텁)·**app-settings-hub.js**(321). **js/hubs/prototype-render.js**(187).
- 결제: **app-billing.js**(150, PortOne — ⚠️`/billing/config.enabled=false` 라 **웹 결제는 현재 도달 불가**, 버튼이 "결제 준비 중" 으로 비활성)·**app-plan.js**(471, 월6,900원 단일멤버십 + **IAP 구매·복원 + 스토어/웹PG 해지 분기**)·**app-membership.js**(259, 회원권)·**app-iap.js**(225, StoreKit/Play Billing → 백엔드 영수증 교차검증).
  - **[2026-07-31~08-01 돈 P0]** 회원권 결제 시 **잔액이 안 빠지고 매출이 이중으로 잡히던 것**(`cb62ce7`) · `/billing` 재시도 금지로 **이중청구 차단**(`6a1cf3a`) · `membership` 을 유료 플랜으로 인식(`isPaidPlan`·구독 메타) · 가격 6,900원 단일 멤버십으로 문구 통일 + 무료체험 7일 통일.
- 설정: **app-shop-settings.js**(460)·**app-backup.js**(224)·**app-support.js**(258)·**app-autocomplete.js**(58).

### index.html
- 메인 탭: `#tab-home`·`#tab-workshop`(작업실)·`#tab-caption`·`#tab-dashboard`(내샵관리)·`#tab-finish`·`#tab-portfolio` → 하단 `nav.tab-bar`+FAB, `showTab()` 라우팅.
- Lucide `<symbol>` 스프라이트 **78개**(`<use href="#ic-*">`). **UI 아이콘은 이 스프라이트만 — 이모지 금지.**
- 로드순서: 인라인 부트 → **Sentry(`:2389~2391`, SRI 부착)** → `app-core.js` → app-*.js defer → 말미 debug-panel·side-nav-unifier. photo/assistant/extras는 `loader.js` idle 분할로드.
  - 🚨 **[2026-08-01] Sentry 가 `app-core.js` 앞으로 옮겨졌다** — 뒤에 있으면 **부팅 크래시가 통째로 사각지대**다. 외부 CDN(`pretendard`·`phosphor-icons`·`sentry-cdn`)은 전부 `integrity`+`crossorigin`.

---

## ⚙️ 백엔드 (FastAPI · Cloud Run staging asia-northeast3)

### 부트스트랩·cron
- 🆕 **scripts/db_bootstrap.py** (80) — **[2026-08-02] 빈 DB 부트스트랩. `alembic upgrade head` 앞에 돈다.** Dockerfile 이 `alembic upgrade head && uvicorn` 으로 뜨는데 **완전히 빈 DB 에서는 이 명령이 반드시 실패한다** — `0001_baseline` 이 의도적으로 no-op 이라(당시엔 `create_all` + `alembic stamp head` 관행) `0002_user_referral` 의 `ALTER TABLE users` 가 "users 가 없다"로 죽는다. 실측(로컬 postgres 17): 빈 DB → `relation "users" does not exist` → **컨테이너 기동 실패**. ⚠️ **"`create_all` 이 스키마 격차를 메운다"는 서술은 틀렸다**(`1cda32a` 에서 정정).
- **alembic 마이그레이션 [2026-07-24~08-02]**: `0026_persona_manual_fields` · `0027_shop_auto_confirm` · `0028_dm_away_message` · `0029_h4_token_epoch` · `0030_revenue_txn_uq` · `0031_payment_key_uq` · `0032_money_check_constraints` · `0033_used_nonces`. 🚨 리비전 ID 는 **≤32자**(초과 시 startup crash).
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
- 발행/동기화/알림: **scheduled_posts.py**(162, **[2026-07-22] 여러 장 예약=`image_urls`** 개행구분 절대URL, `image_url`=커버·옛 행 호환)·**workspace_sync.py**(275)·**notifications.py**(141)·**push.py**(73).
- 결제: **subscription.py**(288, `/status` 가 `store`·`product_id`·`auto_renewing` 반환 + 강등 직전 재검증·유예)·**billing.py**(362, PortOne 웹PG — env 미설정이라 비활성)·**iap.py**(1191, Apple/Google 검증 + S2S/RTDN 자동갱신·환불 반영).
  - `Subscription.store` 실제 값 = `apple`·`google`·`portone`·`demo`(심사 시드 전용)·`null`. **`toss` 는 유령**(대입처 0건, 토스는 결제 전략에서 제외). 이 값이 프론트 해지 경로를 가르므로 틀리면 오해지로 이어진다.
- 연동/브릿지: **integrations.py**(212, 네이버예약/톡톡 링크)·**platform_bridge.py**(85).
- 운영/컴플라이언스: **support.py**(432)·**moderation.py**(596, 콘텐츠신고)·**data_export.py**(315, GDPR)·**admin.py**(1613)·**admin_ws.py**(128, WebSocket).

### 서비스 (services/)
- AI 게이트웨이: **generation.py**(376, Gemini 단일진입). **[2026-07-27~28 원가]** 잇비 **Pro 폐지 → 전부 Flash** + 영수증 OCR 규칙 제거 → **13.2원 → 7.5원(43%↓)**, 캡션 한도 3배(`8f5dbaa`·`d02cc1c`). 상한은 `utils/cost_guard.py`.
- **[2026-07-23~24 말투 학습 — 여태 분석만 하고 안 쓰고 있었다]** 원장님 말투를 캡션에 **실제로 반영**(`e9ff58e`) + 인스타 연동 시 과거글 자동 적재(`7aa1146`) + **캡션 품질 게이트**(`84f426b`). 🐛 문체 지문이 **해시태그를 어미로 학습**하고 있었다 = "'티그램'으로 끝내라"는 셈(`dfc0e87`). 시술 분류 **7종 단일 진실원**으로(앱 안에 5벌이 따로 있었음, `bbb4789`).
- 캡션: **caption_generator.py**(1337)·**caption_grounding.py**(245)·**service_hashtags.py**(308)·**signature_detector/injector.py**·**text_cleanup.py**·**fingerprint_extractor.py**(144)·**style_extractor.py**(144)·**identity_validator.py**·**fewshot_bank/builder.py**·**instagram_fetcher.py**(100)·**scheduled_publisher.py**(137, **[2026-07-22] 2장 이상이면 캐러셀 발행**: child `is_carousel_item` → `CAROUSEL` 부모 → FINISHED 폴링 → publish)·**story_generator.py**·**portfolio_tagger.py**.
- DM 엔진: **dm_intent.py**(426)·**dm_context_builder.py**(470)·**dm_tone_analyzer.py**(261)·**dm_thread.py**·**dm_batching.py**·**dm_menu.py**(227)·**dm_menu_icebreakers.py**·**dm_manual_matcher.py**·**dm_free_reply.py**·**dm_customer_extractor.py**·**customer_memo_extractor.py**.
- 채널 어댑터: **channels/base.py**(공통 인터페이스)·**channels/instagram.py**(229)·**channels/naver_talk.py**(157, 무료 양방향 send).
- 예약/리마인드: **booking_form_parser.py**(355)·**calendar_slots.py**·**reschedule_resolve.py**(314)·**waiting_matcher.py**·**gap_filler.py**(253)·**reminder_scheduler.py**(292)·**retouch_reminder/schedule.py**·**sprint_e.py**(219).
- 고객/리텐션/매출: **customer_lifecycle.py**(358)·**customer_tier.py**·**chip_scorer.py**(444)·**ai_brief.py**·**morning_brief.py**(356)·**retention_predictor.py**(329)·**revenue_analysis.py**·**revenue_forecaster.py**·**membership_stats.py**.
- 자동화/임포트/OCR: **automation_engine.py**·**automation_retry.py**·**importer.py**·**smart_import(er).py**·**receipt_ocr.py**·**business_card_ocr.py**·**pricelist_ocr.py**·**template_ocr.py**(377)·**voice_parser.py**.
- 발송/가드/기타: **kakao_alimtalk.py**(152, Aligo 실발송)·**push_sender.py**(163, FCM)·**support_intent.py**·**sample_seeder.py**(473)·**medical_ad_guard.py**(198)·**sensitive_content_guard.py**·**workspace_gc.py**. 생성형: **photo_generative/**(policy·mock·replicate).
- 🆕 **[2026-07-23~08-01 신규 4종]**
  - **caption_quality.py**(172) — **생성된 캡션이 원장님께 보여도 되는 상태인지 검사 + 필요하면 1회만 재생성.** 프롬프트 지시만으론 모델이 규칙을 어긴다(같은 날 DM 응대 실측 위반율 **83%**, 6건 중 5건). 캡션엔 여태 결과 검사 단계가 아예 없었다. ⚠️ **'첫 문장 뭉개짐'은 일부러 안 잡는다** — 파손이 문장 *중간*에 있고 한국어 캡션은 마침표를 잘 안 써 전체가 한 문장으로 보인다.
  - **korean_endings.py**(21) — '조사/연결어미로 끝나면 문장이 잘린 것' 판정. `caption_quality` 와 `signature_detector` 가 **둘 다 필요로 해서** 규칙이 두 벌로 갈라지지 않게 여기 둔다.
  - **past_post_ingest.py**(149) — **인스타 과거글 → `PastPost` 자동 적재.** 말투 학습(few-shot·fingerprint)의 유일한 재료가 `PastPost` 인데 채우는 경로가 **앱에서 발행할 때 도는 역반입 하나뿐**이었다. `/persona/posts/ingest/instagram` 은 구현돼 있었지만 **아무도 호출 안 하는 죽은 코드** → 인스타에 글이 100개 있어도 앱으로 5번 발행하기 전엔 학습이 시작조차 안 됐다(fingerprint 는 5건 필요). 스테이징 user=5 실측: 인스타 게시물 20개 / PastPost **0개**. 적재하면서 **시술 분류도 같이 붙인다**(`build_fewshot` 이 카테고리 지정 시 폴백을 안 해서, 적재만 해선 few-shot 이 여전히 0개).
  - **medical_memo_expiry.py**(75) — **의료 메모(PIPA §23 민감정보) 30일 자동 만료.** `privacy.html` 이 이용자에게 약속해 놓고 구현이 없었다 = PIPA 위반이자 Apple 심사(개인정보처리방침 URL 을 읽는다) 노출점. **행은 남기고 의료 내용만** 안내 문구로 치환(통째로 사라지면 "내가 안 지웠는데?" + 시술 이력 맥락 끊김), 태그·`is_warning` 도 비워 재식별 단서 제거.
- 🆕 **utils/ [2026-07-27~08-02]**: **cost_guard.py**(AI 기능 킬스위치 + **전체 합산 일일 지출 상한** — 한도 구멍 3개 차단) · **nonce_store.py**(1회용 티켓 **재생(replay) 차단** — "1회용"이 실제로는 5회 재사용됐다) · **client_ip.py**(**IP 위조 우회 방어** — 레이트리밋이 헤더로 뚫렸다).

### 💰 돈·동시성 무결성 (2026-07-30~08-02 카오스 QA·출시감사) — **여기 손대기 전 반드시 읽을 것**
> **교훈: 순차 테스트는 전부 통과해도 `Promise.all` 동시 100발이면 뚫린다. 방어선은 애플리케이션 코드가 아니라 DB 제약이다.**
- **매출 멱등키가 동시요청에 뚫려 6건 생성**(read-then-write) → `(user_id, client_txn_id)` **UNIQUE**(`0030`). 재실측 1건 · 15.5s→1.2s. 결제 멱등키도 같은 구멍(`0031`).
- **회원권 충전만 비원자적이라 5만원×10 동시에 30만원 증발**(lost update). ⚠️ **차감은 이미 원자적이었다 = 비대칭 함정.** 카운터 7곳 원자화(`f59e26e`).
- **돈 컬럼 CHECK 제약 4종**(`0032`) — DB 가 마지막 방어선. ⚠️ **`amount >= 0` 은 금지** — 환불이 음수다. **모델과 마이그레이션 양쪽에 다 넣어야** 한다(한쪽만이면 새 DB·기존 DB 중 하나가 무방비).
- **금액 경계값**: 21억 초과 시 서버 500 크래시 · `card_fee_rate = -5` 가 1만원 순액을 60,000원으로(가장 조용한 버그) → 상·하한 방어(`31de138`).
- **세션 검사 fail-open → fail-closed(503)**(`23175c9`) + 유저별 **토큰 에폭**(`0029`)으로 서버측 세션 revocation · 비번 변경 시 세션 무효화.
- **표시 한도 ≠ 강제 한도**(표시 3회 / 실제 100회 두 벌) → 플랜 한도 **단일 소스화**(`7234855`).
- **회원 탈퇴가 FK 위반으로 통째로 실패**(Apple 심사 블로커, `79b116a`) · 회원권 해지 환불정산 · 0원 매출 지표오염 · 완료매출 취소/삭제 시 미삭제(P0 돈) · PATCH `customer_id` **IDOR**.
- ⚠️ **`STAGING_BYPASS_ALL` 이 라이브였다**(전원 premium) → OFF. 검증은 **정규식 말고 AST·실DB**로.

### 모델 (models.py · **60 클래스**)
- 계정/샵: User·ShopSettings·Persona·Portfolio·BackgroundAsset·ApiUsageLog.
- 페르소나/학습: PastPost·GenerationLog·UserSignatureBlock·UserIdentity·UserConsent·UserStyleFingerprint·PersonaFeedback·UserFewshot·UserCorrection.
- 결제/알림: Subscription·PaymentHistory·NotificationItem·PushToken·ScheduledPost.
- 고객/예약/시술: Customer·Booking·Staff·Treatment·WaitingList·ServiceTemplate·ServiceConsumption·CustomerMemo·CustomerReview.
- 매출/재고: RevenueRecord·ExpenseRecord·InventoryItem·ImportJob.
- DM/채널: IntegrationSetting·DMAutoReplySetting·DMMessageLog·DMLifecycleLog·DmBookingLink·DMConversationContext·DMManualReply·DMOwnerReplySample.
- 잇비/자동화: AssistantSession·AssistantActionLog·AssistantUserFact·AutomationRule·AutomationFailure·MessageCampaign·UserDoc·ContentReport.
- OCR/작업실: ImageOcrCache·PhotoAiCache·WorkspaceSlot·WorkspaceSlotPhoto·WorkspaceAsset·SupportMessage·UserDeletion.
- **[2026-07-24~08-02 추가·변경]** `UsedNonce`(1회용 티켓 재생 차단, `0033`) · `CommentAuthorLog`(webhook 저장분 → 댓글 큐 병합) · `Persona.manual_fields`(원장이 직접 정한 값은 재연동·재분석이 못 덮음, `0026`) · `ShopSettings.auto_confirm`(예약 자동확정, `0027`) · `DMAutoReplySetting.auto_reply_outside_hours`+`away_message`(운영시간 외 자리비움, `0028`) · `User` 토큰 에폭(`0029`) · `RevenueRecord.client_txn_id` UNIQUE(`0030`) · 결제키 UNIQUE(`0031`) · 돈 컬럼 CHECK(`0032`).

### 스키마 (schemas/)
auth·customer·booking·treatment·services·revenue·inventory·shop·**persona**(328, 최대)·caption·import_job·__init__(집약).

---

## 🕳️ 아직 안 채운 곳 (다음 갱신 때 확인)

- **실기기 미검증**: IAP 실제 구매·복원(StoreKit/Play Billing 영수증 추출 필드가 플랫폼·버전마다 다름) · 자리비움 자동응답 **실발송**(실DM E2E 필요) · 콜라주+누끼+보정 E2E.
- **심사 대기**: 인스타 `content_publish`(발행) · DM 봇 Advanced. 댓글 답글은 **스테이징만 ON**(`INSTAGRAM_FULL_SCOPE=1`, 운영은 basic).
- **미완**: 아이콘 스티커 CC BY **귀속 표기 화면 없음**(`ItdIconStickers.CREDITS` 데이터만) — 심사 전 노출하거나 라인 탭 제거.
- **스텁 유지**: 네이버 예약 양방향 동기화 · `app-kakao-hub.js` 관리화면.

---

_이 문서 = 앱 기능의 단일 진실원(SSOT). 기능 바꾸면 여기부터 고친다._
_갱신 이력: 2026-07-10 전수분석 → 2026-07-23 아이콘 스티커 → **2026-08-02 출시감사 라운드 반영**(FE 108커밋 · BE 81커밋)._
