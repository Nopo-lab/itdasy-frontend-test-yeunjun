# Apple/Google Review Notes — Itdasy (Y2do)

## Demo Account

- **Email**: `review@itdasy.com`
- **Password**: `review1234!`
- **Role**: Beauty salon owner demo account

## What the app does

Itdasy is an AI-powered operations assistant for solo beauty salon owners in Korea. It combines customer/booking/revenue management with AI caption generation for Instagram and a voice-based chatbot that can execute actions (create bookings, record revenue, etc).

## Key features to test

1. **Login** with the demo account above → dashboard
2. **Power View** (⛶ button on dashboard) — 7 tabs including Customer, Booking, Revenue, Inventory, NPS, Service Presets, More
3. **AI Assistant** (🤖 button) — try: `"김서연 내일 2시 예약 추가"` (add booking) or `"이번 달 매출 어때?"` (query revenue)
4. **Instagram Integration** — skipped in review (requires user's own IG account; our app is verified as Meta Business Partner)
5. **Voice Input** — mic button next to any text input (Korean speech recognition)

## Important notes for reviewer

- Primary language: **Korean**. English not translated yet.
- All data in the demo account is fictional (`(샘플)` prefix).
- App uses Google Gemini API for AI features — customer names are pseudonymized (`고객#1`) before sending to external servers.
- Data transit: TLS 1.3. At rest: Supabase Postgres encryption.
- Users can delete their account from Settings → 로그아웃 → 탈퇴.

## Sign in with Apple

⚠️ **Status**: To be implemented before third-party login is offered in the iOS app. The current iOS review build uses email+password only; Google/Kakao buttons are hidden on iOS.

Web and Android may continue to show Google/Kakao login during staging, but the iOS review surface must stay email-only until Apple login is shipped.

## Privacy

- Full Privacy Policy: https://itdasy.com/privacy.html
- Terms of Service: https://itdasy.com/terms.html
- No third-party tracking (no ads SDK, no analytics like Firebase Analytics)
- Sentry used for crash reports only (opt-out available in Settings)

## IAP Products (if subscribed plans are active)

- `itdasy_pro_monthly` — Pro plan (₩3,900 KRW / $2.99 USD per month)
- `itdasy_premium_monthly` — Premium plan (₩8,900 KRW / $5.99 USD per month)
- 1-week free trial on first subscription (Introductory Offer), no credit card required

## Korean law compliance

- PIPA (Personal Information Protection Act): Consent flow on signup includes cross-border transfer acknowledgment (to Google LLC, US)
- Electronic Commerce Act: Terms of Service at /terms.html
- Business operator: 와이투두(Y2do), 사업자등록번호 179-36-01681

## Contact

- Developer: 강연준 (CEO)
- Email: contact@itdasy.com
- Response time: within 1 business day
