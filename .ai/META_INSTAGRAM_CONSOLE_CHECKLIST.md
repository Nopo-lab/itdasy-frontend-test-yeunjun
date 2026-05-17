# Meta / Instagram 콘솔 확인 체크리스트 (출시 전 사용자 직접 확인)

**대상 환경:** Cloud Run staging (`itdasy-backend-staging-644329093453.asia-northeast3.run.app`)
**Meta App ID (staging):** `1532504155139761`
**Instagram App ID (staging):** `1253045740322624`
**Verify Token (staging):** `YKbG7RNifv`

진입: https://developers.facebook.com/apps → 위 ID 의 앱 선택.

> ⚠️ **보안 경고:** META_APP_SECRET / INSTAGRAM_APP_SECRET / Verify Token 이 Cloud Run env 조회로 노출됐습니다. 출시 전 콘솔에서 모두 **재발급 → Cloud Run env 갱신** 권장.

---

## 0. ⚠️ 즉시 점검 — Scope flag 오설정

**현재 상태 (staging Cloud Run env):**
- `INSTAGRAM_FULL_SCOPE=MAL2IOViT0uct9KUn4e322yzj6187FEE` ← random 값
- 백엔드 코드: `if os.getenv("INSTAGRAM_FULL_SCOPE", "0") == "1"` 만 full scope 활성
- 즉 **현재 staging 은 basic scope 만 사용 중** — DM/Comments/Publish 요청 동작 안 함

**해결:**
- Cloud Run env `INSTAGRAM_FULL_SCOPE` 값을 정확히 `1` 로 변경 (현재 random string)
- 또는 변수 자체 제거 + basic 만 사용 (DM 자동응답·게시물 publish 포기)

**fail 영향:** OAuth 동의 화면에 messages/comments/publish 권한 안 뜸 → DM 자동응답·게시 모든 기능 무력

---

## 1. Meta App Live Mode

**위치:** Meta 앱 대시보드 상단 토글 (`Development` ↔ `Live`)
**정상값:** **Live** (출시 전제)
**확인 시점:** App Review 통과 후 Live 가능. 통과 전엔 Development 만 허용.

**fail 영향:**
- Development 상태면 **앱 개발자/테스터 계정만** OAuth 가능 → 일반 사용자는 "이 앱은 개발 모드입니다" 차단
- 실제 사용자 가입 0명

---

## 2. Instagram 권한 4개 (App Review 통과)

**위치:** Meta 앱 → **App Review** → **Permissions and Features**
**필요 권한 (각각 Approved 상태여야):**

| 권한 | 정상값 | 실패 시 |
|---|---|---|
| `instagram_business_basic` | Approved | OAuth 자체 실패, 프로필 fetch 불가 |
| `instagram_business_manage_messages` | Approved | DM 자동응답 송신 불가 (수신은 webhook 별도) |
| `instagram_business_manage_comments` | Approved | 댓글 fetch / 답글 불가 |
| `instagram_business_content_publish` | Approved | 게시물 자동 publish 불가 → 캡션 생성만 가능, 발행은 수동 |

**App Review 제출 시 필요:**
- 각 권한별 사용 사례 + 데모 비디오 + Privacy Policy URL
- 테스트 계정 정보 (review@itdasy.com / review1234! 등)

**fail 영향:** 권한 1개라도 미통과 시 해당 기능 전체 실패

---

## 3. Webhook 구독 상태

**위치:** Meta 앱 → **Webhooks** → 제품 = Instagram → Subscribe

**필수 구독 fields:**
- `messages` (DM 수신)
- `messaging_postbacks` (버튼 클릭)
- `comments` (선택, 자동 댓글 응답 필요 시)

**Callback URL:** `https://itdasy-backend-staging-644329093453.asia-northeast3.run.app/instagram/dm-reply/webhook`

**검증 URL (Meta 가 GET 호출):**
```
GET /instagram/dm-reply/webhook?hub.mode=subscribe&hub.verify_token=YKbG7RNifv&hub.challenge=XXX
```

**Subscribe 시도 → Pass 조건:**
- `✓ Verified` 표시 (Meta 가 verify_token 일치 확인 후 challenge 응답 받음)
- "Subscribed fields: messages, messaging_postbacks" 표시

**fail 영향:**
- 구독 실패 → 손님이 DM 보내도 백엔드 webhook 호출 안 됨 → DM 자동응답 무작동
- Verify token 불일치 → Meta 가 503 받고 "Could not verify" 에러
- Callback URL 오타 → Subscribe 자체 실패

---

## 4. Verify Token 일치

**위치:** Meta 앱 → Webhooks → Instagram → Edit Subscription → **Verify Token** 칸

**정상값:** `YKbG7RNifv` (현재 Cloud Run env 값)

**확인 방법 (수동 검증):**
```bash
curl "https://itdasy-backend-staging-644329093453.asia-northeast3.run.app/instagram/dm-reply/webhook?hub.mode=subscribe&hub.verify_token=YKbG7RNifv&hub.challenge=ping123"
# Pass: "ping123" 그대로 반환
# Fail: 403 / 503
```

**fail 영향:** Webhook 구독 자체 불가

**보안 권장:** 노출됐으므로 **재발급** (Meta 콘솔에서 새 token 입력 → Cloud Run env `META_WEBHOOK_VERIFY_TOKEN` 갱신)

---

## 5. Redirect URI

**위치:** Meta 앱 → **Instagram Basic Display** (또는 Instagram API) → **Valid OAuth Redirect URIs**

**정상값 (한 줄당 하나, 모두 등록):**
```
https://itdasy-backend-staging-644329093453.asia-northeast3.run.app/instagram/callback
https://itdasy-backend.run.app/instagram/callback   ← 운영 (이미 등록돼있다면 OK)
```

**현재 staging env:** `META_REDIRECT_URI=https://itdasy-backend-staging-644329093453.asia-northeast3.run.app/instagram/callback` ✓ (코드와 일치)

**fail 영향:** OAuth 콜백에서 "Invalid Redirect URI" 에러 → 로그인 불가

---

## 6. 비즈니스 / 크리에이터 계정 여부

**위치:** 테스트 폰의 Instagram 앱 → 프로필 → 설정 및 개인정보 → 계정 → **계정 유형 전환**

**정상값:** **비즈니스 계정** 또는 **크리에이터 계정**
- 개인 계정은 Instagram Graph API (DM/Insights/Publish 모두) 사용 **불가**

**fail 영향:**
- 개인 계정으로 OAuth 시도 → 권한 4개 신청 불가
- DM/Insights/Publish 전체 무작동

**참고:** 사용자 (사장님) 가입 안내 시 "Instagram 프로페셔널 계정 전환" 필수 안내 필요

---

## 7. Facebook Page 연결

**위치:** Instagram 앱 → 프로필 → 설정 → 계정 → **연결된 계정** → Facebook

**정상값:** Facebook Page 1개 연결 (사장님이 관리자 권한 보유)
- Personal Facebook 계정만 연결 = ❌
- Page 가 없으면 → Facebook 에서 새 Page 생성 후 연결

**확인 (코드 레벨):**
- `/instagram/profile` 응답에 `connected_facebook_page` 또는 유사 필드 있는지 (백엔드 fetch 시 page_id 필요)

**fail 영향:**
- Page 미연결 → Instagram 콘텐츠 publish API 호출 시 400 ("No connected Facebook Page")
- DM 자동응답 token 발급 자체 실패할 수 있음

---

## 8. Token 만료 / 갱신

**Long-lived token 수명:** 60일
**갱신 endpoint (백엔드):** Meta `/access_token?grant_type=ig_refresh_token`

**확인 방법:**
- 백엔드 DB `users.shop_settings.instagram_access_token` 컬럼에 발급일 metadata 확인 (60일 - 만료일 < 7일 이면 갱신 cron 동작)
- 또는 로그: `gcloud logging read 'textPayload=~"token refresh|long_lived"' --freshness=7d`

**정상값:**
- 사용자 OAuth 후 60일 안에 자동 갱신 cron 동작 (백엔드 scheduled task)
- 사용자가 60일 이상 미사용 → 재로그인 필요 (UX 안내 필수)

**fail 영향:**
- 갱신 cron 실패 → 60일 후 모든 IG API 호출 401 "Invalid OAuth access token" → 사용자 재로그인 알림 노출 안 되면 사일런트 실패

**확인 권장:** 백엔드 scheduler 로그에 `token refresh ok` 패턴 정상 동작 여부

---

## 9. DM 자동응답 안전모드 기본값

**위치:** 앱 PWA → **DM 자동응답 설정** (챗봇에서 "DM 자동응답 설정" 입력 시 즉시 이동)

**정상 기본값 (코드 확인 — `dm_autoreply.py:DMAutoReplySetting`):**
- `enabled = False` (사용자 명시적 ON 전까진 비활성)
- `business_hours_only = True` (영업시간 외 자동응답 X)
- `timezone = Asia/Seoul`
- `quiet_hours_start/end` (밤 자동응답 차단)
- `dry_run = True` (초기엔 미발송, log 만)

**fail 영향:**
- enabled 기본 True 면 → 사장님 모르게 손님에게 자동 DM 발송 → 사고
- business_hours_only=False 면 → 새벽에 DM 발송 → 손님 불만
- timezone 미설정 → UTC 기준으로 작동, 영업시간 오판

**확인 방법:** 신규 계정 가입 직후 DM 자동응답 페이지 열어 토글 OFF 인지 확인

---

## 출시 Blocker 정리

| 항목 | Blocker 등급 |
|---|---|
| 0. INSTAGRAM_FULL_SCOPE='1' 설정 | 🔴 critical (basic만이면 IG 핵심 기능 무력) |
| 1. App Live Mode | 🔴 critical (Development면 사용자 0명) |
| 2. 권한 4개 Approved | 🔴 critical (App Review) |
| 3. Webhook 구독 | 🔴 critical (DM 자동응답) |
| 4. Verify Token 일치 | 🔴 critical (Webhook 등록 실패) |
| 5. Redirect URI | 🟠 high (OAuth 실패) |
| 6. 비즈니스 계정 | 🟠 high (사용자 측, UX 안내로 완화) |
| 7. Facebook Page | 🟠 high (publish 실패) |
| 8. Token 갱신 cron | 🟡 medium (60일 후 영향) |
| 9. DM 안전모드 기본값 | 🟡 medium (사고 방지) |

---

## 보고 양식 (사용자 → Claude)

각 항목 결과 짧게 보고:

```
0. FULL_SCOPE: ✅ '1' 로 갱신 / ❌ 현재 random
1. Live mode: ✅ Live / ❌ Development
2. 권한 4개: ✅ 4/4 Approved / ❌ 누락: [...]
3. Webhook 구독: ✅ Verified + Subscribed / ❌ [사유]
4. Verify Token: ✅ curl ping123 통과 / ❌
5. Redirect URI: ✅ 등록됨 / ❌
6. 비즈니스 계정: ✅ / ❌
7. FB Page 연결: ✅ / ❌
8. Token 갱신 cron 로그: ✅ 정상 / ❌
9. DM 자동응답 기본값: ✅ OFF + business_hours_only / ❌
```

---

## Claude 가 코드로 확인 가능한 추가 항목 (사용자 부담 X)

다음은 사용자 콘솔 확인 후 결과 보내주면 Claude 가 코드 사이드 점검:

- (2)의 권한 4개 Approved 라면 → 백엔드 `INSTAGRAM_FULL_SCOPE=1` env 갱신 + 재배포
- (8) 갱신 cron 코드 점검 — `backend/services/instagram_token_refresher.py` 또는 유사 파일 동작 확인
- (9) `dm_autoreply.py` 기본값 코드 재확인 (현재 OFF 인지 / 사장님 신규 가입 시점)
