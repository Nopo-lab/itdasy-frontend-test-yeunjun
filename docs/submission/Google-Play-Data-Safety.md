# Google Play Data Safety 설문 답변지 (2026-04-22)

Google Play Console → App content → **Data safety** 페이지 기입용.

## 1. 데이터 수집 및 공유

### Q. 앱이 사용자 데이터를 수집하거나 공유하나요?
**A: 예 (Yes)**

### Q. 제3자 서비스로 데이터를 공유하나요?
**A: 예** — Google LLC (AI 분석), Meta Platforms (Instagram OAuth)

### Q. 데이터 수집은 선택사항입니까?
**A: 일부만 선택** — 이메일·비밀번호는 필수, 인스타 연결·고객 전화는 선택

---

## 2. 수집하는 데이터 카테고리

| 카테고리 | 수집? | 공유? | 수집 목적 | 필수? |
|---|---|---|---|---|
| **Personal info — Name** | ✅ | ✅ (Google/Meta) | App functionality, Account management | 필수 |
| **Personal info — Email address** | ✅ | ❌ | Account management, Communications | 필수 |
| **Personal info — User IDs** | ✅ | ❌ | Account management | 필수 |
| **Personal info — Phone number** | ✅ | ❌ | 고객 관리용 (원장님의 고객 정보) | 선택 |
| **Financial info — Purchase history** | ✅ | ❌ | App functionality (구독) | 자동 |
| **Photos and videos** | ✅ | ✅ (Meta for Instagram) | App functionality | 선택 |
| **Audio — Voice or sound recordings** | ✅ | ✅ (Google Gemini) | App functionality (음성 기록) | 선택 |
| **App info and performance — Crash logs** | ✅ | ✅ (Sentry) | Analytics | 선택 (opt-out 가능) |
| **App info and performance — Diagnostics** | ✅ | ✅ (Sentry) | Analytics | 선택 |
| **Device or other IDs** | ❌ | — | 미수집 | — |
| **Location** | ❌ | — | 미수집 | — |
| **Contacts** | ❌ | — | 주소록 스캔 안 함 | — |
| **Health and fitness** | ✅ | ❌ | App functionality — 손님 알러지·부작용 메모(시술 안전). 30일 후 본문 자동 삭제 | 선택 |

---

## 3. 보안

### Q. 데이터 전송 시 암호화됩니까?
**A: 예 (Yes)** — 모든 통신 HTTPS(TLS) 암호화

### Q. 사용자가 데이터 삭제를 요청할 수 있습니까?
**A: 예 (Yes)**
- 앱 내 설정 → 계정 → 탈퇴 (즉시 파기)
- 이메일 contact@itdasy.com 로 요청
- 웹: https://itdasy.com/privacy.html 에 절차 안내

### Q. Play Families Policy 를 준수합니까?
**A: 해당 없음** — 만 14세 미만 대상 아님

---

## 4. Data Privacy Policy URL

`https://itdasy.com/privacy.html`

---

## 5. Independent Security Review

**없음.** (선택 사항)

---

## 🎯 제출 전 체크리스트

- [ ] 위 표의 데이터 유형 Google Console 에 하나씩 선택
- [ ] 각 항목 "Is this data collected, shared, or both?" 정확히 체크
- [ ] Optional vs Required 표시
- [ ] "Data is encrypted in transit" ✅
- [ ] "Users can request data to be deleted" ✅
- [ ] Privacy Policy URL 입력
