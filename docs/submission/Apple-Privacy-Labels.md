# Apple Privacy Labels — App Store Connect 질문지 답변 (2026-04-22)

> **용도:** App Store Connect → App Privacy → Privacy Questionnaire 입력 시 이 문서 그대로 복붙.
> **근거:** 현재 BE/FE 코드와 `privacy.html` v1.0 기반. 수집 항목 변경 시 즉시 업데이트 필수.

---

## 📋 Section 1 — Does your app collect data?

**Answer:** ✅ **Yes, we collect data**

---

## 📋 Section 2 — Data Types Collected

### ✅ Contact Info

| Data Type | Collected? | Purpose | Linked to User? | Tracking? |
|---|---|---|---|---|
| Name | ✅ Yes (회원 이름) | App Functionality, Account | Yes | No |
| Email Address | ✅ Yes | Account, Customer Support | Yes | No |
| Phone Number | ⚠️ Optional (샵 연락처) | App Functionality | Yes | No |
| Physical Address | ⚠️ Optional (샵 주소) | App Functionality | Yes | No |
| Other User Contact Info | ❌ No | — | — | — |

### ✅ Health & Fitness — ❌ No

### ✅ Financial Info

| Data Type | Collected? | Purpose | Linked to User? | Tracking? |
|---|---|---|---|---|
| Payment Info | ⚠️ IAP transaction ID only (no card) | Billing | Yes | No |
| Credit Info | ❌ No | — | — | — |
| Other Financial Info | ✅ Yes (매출 기록 — 회원이 입력하는 업무용 데이터) | App Functionality, Analytics | Yes | No |

### ✅ Location

| Data Type | Collected? | Purpose | Linked to User? | Tracking? |
|---|---|---|---|---|
| Precise Location | ❌ No | — | — | — |
| Coarse Location | ❌ No | — | — | — |

**주:** 샵 주소는 회원이 직접 입력하는 텍스트이며, GPS/OS Location API로 수집하지 않음.

### ✅ Sensitive Info — ❌ No

### ✅ Contacts

| Data Type | Collected? | Purpose | Linked to User? | Tracking? |
|---|---|---|---|---|
| Contacts | ⚠️ Optional (주소록 권한 — 기존 고객 임포트 시에만) | App Functionality | Yes | No |

**주:** `NSContactsUsageDescription` 선언됨. 사용자가 명시적으로 "주소록에서 고객 불러오기" 버튼을 눌렀을 때만 접근. 앱 자동 수집 없음.

### ✅ User Content

| Data Type | Collected? | Purpose | Linked to User? | Tracking? |
|---|---|---|---|---|
| Photos or Videos | ✅ Yes (시술 전·후 사진) | App Functionality | Yes | No |
| Audio Data | ✅ Yes (음성 메모 — 임시 처리 후 텍스트 저장, 원본 오디오 미보관) | App Functionality | Yes | No |
| Customer Support | ✅ Yes (인앱 고객지원 채팅) | Customer Support | Yes | No |
| Other User Content | ✅ Yes (고객 메모, 인스타 캡션 원문 등) | App Functionality | Yes | No |

### ✅ Browsing History — ❌ No

### ✅ Search History — ❌ No

### ✅ Identifiers

| Data Type | Collected? | Purpose | Linked to User? | Tracking? |
|---|---|---|---|---|
| User ID | ✅ Yes (회원 user_id — 내부) | App Functionality | Yes | No |
| Device ID | ❌ No (AdID/IDFA 미수집) | — | — | — |

**중요:** 본 앱은 App Tracking Transparency를 통한 `IDFA` 접근을 요청하지 않습니다.
`NSUserTrackingUsageDescription` 은 선언됐으나 실제로 `ATTrackingManager.requestTrackingAuthorization` 호출 코드는 없음.

### ✅ Purchases

| Data Type | Collected? | Purpose | Linked to User? | Tracking? |
|---|---|---|---|---|
| Purchase History | ✅ Yes (구독 내역 — IAP transaction_id, product_id) | App Functionality, Analytics | Yes | No |

### ✅ Usage Data

| Data Type | Collected? | Purpose | Linked to User? | Tracking? |
|---|---|---|---|---|
| Product Interaction | ✅ Yes (기능 사용 로그 — 내부 개선용) | Analytics, App Functionality | Yes | No |
| Advertising Data | ❌ No | — | — | — |
| Other Usage Data | ❌ No | — | — | — |

### ✅ Diagnostics

| Data Type | Collected? | Purpose | Linked to User? | Tracking? |
|---|---|---|---|---|
| Crash Data | ✅ Yes (Sentry — 개인정보 자동 스크러빙) | App Functionality, Analytics | Yes | No |
| Performance Data | ✅ Yes (Sentry 성능 트레이스) | Analytics | Yes | No |
| Other Diagnostic Data | ❌ No | — | — | — |

### ✅ Surroundings — ❌ No
### ✅ Body — ❌ No
### ✅ Other Data — ❌ No

---

## 📋 Section 3 — Data Used to Track You

**Answer:** ❌ **No** — 모든 데이터는 앱 기능/회원 관리용이며, 크로스 사이트/앱 추적에 사용하지 않음.
Sentry, Gemini, 내부 로그 모두 "자사 서비스 내" 사용이며 광고 네트워크 연동 없음.

---

## 📋 Section 4 — Data Linked to You

다음 카테고리가 **회원 계정과 연결되어 저장**됨 (앱 기능 제공 목적):

1. Contact Info (Name, Email, Phone)
2. Financial Info (Revenue records — business data)
3. Contacts (선택 사용 시)
4. User Content (Photos, Audio notes, Customer memos)
5. Identifiers (User ID)
6. Purchases (IAP history)
7. Usage Data (Product Interaction)
8. Diagnostics (Crash, Performance)

**연결 이유:** 뷰티샵 CRM 특성상 "내 고객 목록", "내 매출", "내 사진" 구분이 서비스 핵심 기능.

---

## 📋 Section 5 — Data Not Linked to You

**해당 없음** — 수집되는 모든 데이터는 회원 계정(user_id)에 연결됩니다.

---

## 📋 Third-Party SDKs 고지

| SDK / Service | 용도 | 전송 데이터 | 모델 학습? | 위치 |
|---|---|---|---|---|
| Google Gemini API | AI 캡션/챗봇 | 가명처리된 텍스트(`고객#1` 등) | ❌ No | 미국 |
| Meta Graph API | Instagram OAuth/발행 | Instagram User ID, 토큰 | ❌ No | 미국/아일랜드 |
| Replicate / Remove.bg | AI 누끼 | 업로드 사진 (즉시 파기) | ❌ No | 미국/독일 |
| Cloudflare R2 | 이미지 스토리지 | 업로드 사진 | — | 미국 |
| Supabase | DB 관리 | 전체 DB 레코드 | — | 미국 |
| Railway | 서버 호스팅 | 모든 개인정보 | — | 미국 |
| Sentry | 크래시 로깅 | 에러 스택 (PII 스크러빙됨) | — | 미국 |

---

## 📋 추가 중요 선언

- **Sign in with Apple** 구현됨 (`/auth/apple` 엔드포인트, JWKS 검증)
- **In-App Account Deletion** 구현됨 (Settings → 🗑 계정 탈퇴 → 2단계 확인 → `DELETE /auth/delete-account`)
- **AI 생성 콘텐츠 신고** 구현됨 (🚩 버튼 → `POST /moderation/report` → 24시간 내 검토)
- **Cross-border transfer** 명시 동의 필수 (가입 체크박스)
- **ITSAppUsesNonExemptEncryption:** `<false/>` — HTTPS 표준 암호화만 사용, export compliance exempt

---

## 📋 데이터 관리자 정보 (App Store Connect Contact Info)

- 회사: 와이투두 (Y2do)
- 사업자등록번호: 179-36-01681
- 대표자: 강연준
- 이메일: contact@itdasy.com
- 개인정보처리방침 URL: https://itdasy.com/privacy.html
- 영문: https://itdasy.com/privacy-en.html

---

## ⚠️ 변경 관리

신규 SDK 추가, 수집 항목 확대, 분석 도구 도입 시 **반드시 이 문서와 App Store Connect 양쪽 동시 업데이트**.
Apple은 Privacy Labels 부정확 기재를 Guideline 5.1.2 위반으로 간주하며 심사 반려/앱 철회 사유가 됩니다.

| 버전 | 날짜 | 변경 |
|---|---|---|
| v1.0 | 2026-04-22 | 최초 작성 — Gemini·Meta·IAP·Sentry·R2·Supabase·Railway·Replicate 기준 |
