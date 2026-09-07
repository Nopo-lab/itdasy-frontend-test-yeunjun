# 인앱결제(IAP) 셋업 — 남은 단계 (C-1)

> ⚠️ [2026-09-07] 가격 정본은 **월 ₩9,900 / 연 ₩99,000 (USD $6.99), 월간 10일 무료체험**이다.
> 근거: 백엔드 `/subscription/plans` (`price:9900`, `price_yearly:99000`, `price_usd:6.99`) ·
> `index.html` 페이월 · `terms.html` · `landing/index.html` (2026-09-02 가격 개편).
> 상품ID `itdasy_membership_monthly_6900` 은 **이름만 옛 가격이 남은 레거시 식별자**다 —
> 스토어 연결이 끊기므로 이름은 바꾸지 않는다. **콘솔의 실제 가격이 ₩9,900 인지 반드시 확인할 것.**


프론트 연동 코드는 **완료**됐다(`app-iap.js`, `app-plan.js` 네이티브 분기, 구매 복원 버튼).
백엔드 검증 엔드포인트도 구현돼 있다(`itdasy_backend routers/iap.py`: `/iap/apple-verify`,
`/iap/google-verify`, `/iap/status`). 아래는 **코드가 아니라 스토어/네이티브/크레덴셜** 작업이라
Claude 가 대신 못 하는 부분이다.

> 현재 상태: 플러그인 미설치라 앱에서 결제 버튼 누르면 `ItdasyIAP.isAvailable()===false` →
> "앱스토어 결제 준비 중" 토스트만 뜬다(무회귀). 아래를 마치면 실제 결제가 열린다.

---

## 1. 플러그인 설치 + 동기화 (터미널)

```bash
npm install                       # package.json 에 cordova-plugin-purchase ^13 추가됨
npx cap sync                      # ios/android 네이티브에 플러그인 반영 (CdvPurchase 전역 생성)
```

- iOS: Xcode 에서 **Signing & Capabilities → In-App Purchase** capability 추가.
- Android: `com.android.billingclient` 는 플러그인이 자동 포함. Play 결제 권한도 자동.

## 2. 스토어에 상품 등록 — product id `itdasy_membership_monthly_6900`

**정확히 이 id 여야 함**(백엔드 `PRODUCT_TO_PLAN` · 프론트 `app-iap.js PRODUCT_ID` 와 일치).

- **App Store Connect** → 앱 → 구독 → 구독 그룹 생성 → 자동 갱신 구독
  - 참조명/상품ID: `itdasy_membership_monthly_6900`
  - 가격: **₩9,900 / 월**, **무료 체험 10일**(introductory offer) 설정
  - 지역화(한국어) 표시명·설명 입력 → **심사 제출**(구독은 앱과 함께 심사)
- **Google Play Console** → 수익 창출 → 구독 → 구독 만들기
  - 상품ID: `itdasy_membership_monthly_6900`
  - 기본 요금제 **₩9,900/월**, **무료 체험 10일** 추가
  - 활성화

## 3. 백엔드 크레덴셜 주입 (Cloud Run 환경변수)

`iap.py` 는 아래가 있어야 실제 검증한다(없으면 409 "준비 중"으로 안전하게 실패).

- **Apple**: `APPLE_IAP_SHARED_SECRET`(App-Specific Shared Secret), `APPLE_APP_BUNDLE_ID`
- **Google**: `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`(서비스계정 JSON, base64 가능),
  `GOOGLE_PLAY_PACKAGE_NAME`(예: `com.y2do.itdasy`)

## 4. 서버 알림(선택, 권장) — 갱신·취소·환불 자동 반영

- Apple: App Store Connect → App Store Server Notifications V2 URL = `.../iap/apple-notification`
- Google: Play Console → 실시간 개발자 알림(RTDN) Pub/Sub 토픽 → push 구독 → `.../iap/google-rtdn`
  - 검증용 env: `GOOGLE_PUBSUB_VERIFICATION_AUDIENCE`
- ⚠️ `iap.py` 의 알림 핸들러는 현재 **수신 로그만** 남긴다(Phase 2 TODO: notificationType 별
  Subscription 상태 갱신). 크레덴셜/실 payload 확보 후 분기 구현 필요.

## 5. 실기기 검증 체크리스트 (⚠️ Claude 미검증 구간)

`app-iap.js` 의 영수증 추출(`_appleReceipt`/`_googleToken`)은 CdvPurchase 버전차 대비 방어적으로
여러 경로를 시도한다. **실기기(샌드박스)에서 반드시 확인**:

- [ ] iOS 샌드박스 계정으로 구매 → `/iap/apple-verify` 200 + `plan:"membership"` 반환?
- [ ] Android 라이선스 테스터로 구매 → `/iap/google-verify` 200?
- [ ] 구매 후 배지가 브랜드색(멤버십)으로, 유료 기능 게이트 해제?
- [ ] 앱 삭제 후 재설치 → **구매 복원** 버튼 → 멤버십 복구?
- [ ] 결제창에서 취소 → 조용히 원복(에러 토스트 없음)?
- [ ] 영수증 추출 실패 시 → 트랜잭션 미완료 + "영수증을 읽지 못했어요"(과금 후 미활성 방지, 재시도 시 복구)?

추출 필드가 이 플러그인 버전에서 다르면 `_appleReceipt`/`_googleToken` 만 고치면 된다(격리돼 있음).

## 6. Apple/Google 심사 메모

- 구매 복원 버튼: 이미 추가됨(네이티브+플러그인일 때만 노출, `#planRestoreBtn`) — Apple 3.1.1 필수.
- 자동갱신 구독 고지(기간·금액·자동갱신·해지방법): 결제 화면/약관에 명시 필요(현재 약관 6조 일부).
- anti-steering: 네이티브에선 웹 PG 호출 안 함(`app-plan.js` 가 네이티브면 IAP 만) — 준수됨.

_작성: 2026-07-27 (C-1 프론트 연동 완료 시점)_
