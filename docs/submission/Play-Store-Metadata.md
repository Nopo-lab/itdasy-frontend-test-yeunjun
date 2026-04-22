# Google Play Console Metadata — 잇데이 / Itdasy

**Package Name**: `com.nopolab.itdasy`
**Category**: Business
**Content Rating**: Everyone
**Default Language**: Korean (한국어 - 대한민국)
**Additional Languages**: English (영어 - 미국)

---

## 🇰🇷 Korean (한국어 - 대한민국)

### App Title (30자)
```
잇데이 - 1인샵 AI 비서
```

### Short Description (80자)
```
뷰티샵 원장님을 위한 AI 인스타 자동화. 말투 분석으로 내 글처럼 캡션을 써드리고, 사진 누끼·합성까지.
```

### Full Description (4000자)
(App-Store-Metadata.md 의 한국어 본문 그대로 사용 — Play Store 와 App Store 간 문구 통일)

---

## 🇺🇸 English (English - United States)

### App Title (30 chars)
```
Itdasy - AI for Beauty Salons
```

### Short Description (80 chars)
```
AI Instagram marketing for solo beauty salon owners. Captions, photo editing, scheduling.
```

### Full Description (4000 chars)
(App-Store-Metadata-EN.md 의 Description 본문 그대로 사용)

---

## Data Safety Form (Play Console)

### Data Collection & Sharing Overview

| Data Type | Collected | Shared | Purpose | Optional | Encrypted in Transit | Can Delete |
|---|---|---|---|---|---|---|
| Email address | ✅ | ❌ | Account management, Communication | ❌ | ✅ | ✅ |
| Name | ✅ | ❌ | Account management | ❌ | ✅ | ✅ |
| Phone number | ✅ (optional) | ❌ | Account management, Fraud prevention | ✅ | ✅ | ✅ |
| User IDs | ✅ | ❌ | Account management | ❌ | ✅ | ✅ |
| Photos | ✅ | ✅ to Replicate, Remove.bg, Google Gemini | App functionality (AI processing) | ❌ | ✅ | ✅ |
| User-generated content (captions) | ✅ | ✅ to Google Gemini | App functionality | ❌ | ✅ | ✅ |
| Audio (voice input) | ✅ (on-device) | ❌ (processed on device) | App functionality | ✅ | N/A | N/A |
| Purchase history | ✅ | ❌ | Account management | ❌ | ✅ | ❌ (legal retention) |
| App interactions | ❌ | ❌ | — | — | — | — |
| Crash logs | ✅ (opt-out in Settings) | ✅ to Sentry | Analytics | ✅ | ✅ | ✅ |
| Approximate location | ❌ | ❌ | — | — | — | — |
| Precise location | ❌ | ❌ | — | — | — | — |
| Device or other IDs | ❌ | ❌ | — | — | — | — |

### Security Practices
- ✅ Data is encrypted in transit (TLS 1.3, HSTS)
- ✅ You can request that data be deleted (in-app Delete Account, or email request)
- ✅ Passwords are hashed (bcrypt), never stored in plaintext
- ✅ Compliant with Google Play Families Policy (age 13+)

### Commitments
- We do not sell user data to third parties
- We do not use user data for advertising
- Data deletion URL: `https://nopo-lab.github.io/itdasy-frontend/data-deletion.html`
- Data deletion callback (for automated systems): `https://itdasy260417-production.up.railway.app/instagram/data-deletion`

---

## App Content Declarations

| Declaration | Answer |
|---|---|
| Target age group | 13+ (Teen / Everyone) |
| Contains ads | ❌ No |
| In-app purchases | ✅ Yes — subscriptions ($2.99 / $5.99 monthly) |
| Access to sensitive permissions | Camera, Photos, Microphone, Face ID, Contacts (all with rationale) |
| COPPA compliance | ✅ Not directed at children under 13 |
| Government apps | ❌ No |
| Financial features | ❌ No (only own revenue tracking for the salon owner) |
| News apps | ❌ No |
| Contains user-generated content | ✅ Yes (captions, images — posted to user's own Instagram) |
| Moderation | Content reporting available (`app-content-report.js`), AI safety filters active |

---

## IAP Products

### Subscription Details
Both products are billed monthly with auto-renewal. 1-week free trial on first subscription.

| Product ID | Base Plan | Pricing (KR) | Pricing (US) | Description |
|---|---|---|---|---|
| `itdasy_pro_monthly_19900` | monthly-autorenew | ₩3,900 | $2.99 | Pro — unlimited captions, daily 20 bg removals, scheduled publishing |
| `itdasy_premium_monthly_39900` | monthly-autorenew | ₩8,900 | $5.99 | Premium — Pro + unlimited bg removals + DM auto-reply + AI vision quotes |

**Note**: Product IDs kept from earlier build for backend compatibility. Actual displayed prices are ₩3,900 / ₩8,900 (T-355 pricing change).

### Real-Time Developer Notifications (RTDN)
After creating Pub/Sub topic, configure notification endpoint:
```
https://itdasy260417-production.up.railway.app/iap/google/webhook
```
(Endpoint exists in `backend/routers/iap.py` — verify after Railway recovery.)

---

## Testing Tracks

### Internal Testing (immediate, no review)
- Testers: kangtaetv@gmail.com, l2doworks@gmail.com, 원영 email
- Install via Play Console invite link
- Use for basic QA before Closed Testing

### Closed Testing (required for new apps — 14-day rule)
- **Minimum 20 testers for 14 days** (Google's 2023+ policy for new developer accounts)
- Create Google Group `itdasy-testers@googlegroups.com` or use existing email list
- Recommended: recruit beauty shop owners from KakaoTalk community, offer 3 months Premium free in exchange for testing

### Open Testing (optional, before Production)
- Skip unless wide beta desired

### Production
- Eligible after 14 days of Closed Testing with 20+ testers + bug log demonstrating fixes
- Staged rollout: 5% → 20% → 50% → 100%

---

## Screenshots

| Device | Resolution | Count | Notes |
|---|---|---|---|
| Phone | 1080×1920 to 1440×2560 | 2~8 | Recommended 4 per language |
| 7-inch Tablet | 1024×600+ | 0 or 1+ | Optional |
| 10-inch Tablet | 1280×800+ | 0 or 1+ | Optional |

### Feature Graphic
- **Required**: 1024×500 PNG/JPG (no alpha)
- Shown in Play Store card and promotions
- Generation guide in `docs/submission/_gen_iap_screenshot.py` (adapt for feature graphic)

### Phone Screenshots Strategy
Same as App Store — 5 scenarios:
1. Dashboard overview
2. AI Assistant chat
3. Power View (customer list)
4. Calendar drag
5. Caption generation result

---

## Privacy Policy & Terms URLs

```
Privacy Policy (KR): https://nopo-lab.github.io/itdasy-frontend/privacy.html
Privacy Policy (EN): https://nopo-lab.github.io/itdasy-frontend/privacy-en.html
Terms (KR):          https://nopo-lab.github.io/itdasy-frontend/terms.html
Terms (EN):          https://nopo-lab.github.io/itdasy-frontend/terms-en.html
```

---

## Developer Contact

| Field | Value |
|---|---|
| Developer Name | 와이투두 / Y2do |
| Developer Email (external) | contact@itdasy.com |
| Developer Website | https://nopo-lab.github.io/itdasy-promo/ |
| Developer Phone (optional) | — |
| Physical Address (for Play Console) | 18405 경기도 화성시 효행로 1068, 6F 603-J257 (Hwaseong-si, Gyeonggi-do, South Korea) |

---

## AAB Upload

### Build Location
```
GitHub Actions → Workflows → Android Build → Run workflow
→ Artifact: app-release-{hash}.aab
```

### Signing
- Keystore: stored in `~/itdasy-release.jks` + macOS Keychain + iCloud Drive backup
- Key alias: `itdasy`
- Signed by: 강연준

### Upload Steps
1. Play Console → Production / Internal testing → **Create new release**
2. Upload `.aab` file
3. Release notes (Korean + English):
   ```
   v1.0 정식 출시 / v1.0 Official Launch
   ```
4. Save → Review release → Roll out

---

_Last updated: 2026-04-22 by Claude / 연준_
