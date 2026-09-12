# 출시 남은 작업 체크리스트 (2026-07-27 감사 후속)

> ⚠️ [2026-09-07] 가격 정본은 **월 ₩9,900 / 연 ₩99,000 (USD $6.99), 월간 10일 무료체험**이다.
> 근거: 백엔드 `/subscription/plans` (`price:9900`, `price_yearly:99000`, `price_usd:6.99`) ·
> `index.html` 페이월 · `terms.html` · `landing/index.html` (2026-09-02 가격 개편).
> 상품ID `itdasy_membership_monthly_6900` 은 **이름만 옛 가격이 남은 레거시 식별자**다 —
> 스토어 연결이 끊기므로 이름은 바꾸지 않는다. **콘솔의 실제 가격이 ₩9,900 인지 반드시 확인할 것.**


전면 감사(6도메인)에서 프론트로 고칠 수 있는 건 전부 라이브 반영됨. 아래는 **코드로 못 끝내는**
것 + **프론트로 이어서 할** 것. 완료되면 체크.

---

## 🔴 A. IAP 인앱결제 — 콘솔/시크릿 (Claude 불가, 사장님/원영)
상세: `IAP_SETUP.md`. 프론트 연동·플러그인·lockfile 은 완료(라이브).

- [ ] App Store Connect: 자동갱신구독 `itdasy_pro_monthly_9900` (₩9,900/월, 10일 무료체험) + `itdasy_pro_yearly_99000` (₩99,000/년, 체험 없음) **같은 구독 그룹**으로 등록·심사제출
- [ ] App Store Connect: `itdasy_membership_monthly_6900` **판매중지** (삭제 금지)
      ⚠️ 기존 `itdasy_membership_monthly_6900` 의 **가격을 올리지 않는다.** 그 상품의 가격을
         바꾸면 이미 구독 중인 원장님들도 인상 대상이 되고, Apple 은 동의를 받지 못하면
         구독을 끊는다. 신규 상품을 따로 등록해 기존 구독자를 그대로 두는 게 표준이다.
- [ ] Play Console: 동일 상품ID 구독 등록·활성화
- [ ] Cloud Run(itdasy-backend-staging, asia-northeast3, itdasy-495513) env:
      `APPLE_IAP_SHARED_SECRET`, `APPLE_APP_BUNDLE_ID`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`(base64), `GOOGLE_PLAY_PACKAGE_NAME`
- [ ] (운영 배포 시 운영 Cloud Run 에도 동일 env)
- [ ] `npx cap sync` 를 실빌드 환경(Xcode/Android Studio/GitHub Actions)에서 — 로컬 맥은 @capacitor/android template 누락으로 update 실패(무해)
- [ ] 실기기 샌드박스 결제 1회 → `_appleReceipt`/`_googleToken` 추출 확인(`IAP_SETUP.md §5`). 안 맞으면 그 2함수만 수정
- [ ] Apple S2S / Google RTDN 알림 핸들러 Phase 2(갱신·취소·환불 반영) — 백엔드 `iap.py` TODO

## 🔎 라이브 E2E 검증 발견 (2026-07-27, 토큰으로 실계정 검증)
전 플로우 콘솔 에러 0. 검증 통과: 잇비(매출/예약 조회 실데이터+LLM), 작업실(실 AI 캡션),
C-2 계정삭제 UI 도달+2단계, M-7 고객 옵티미스틱(중복0), C-4 예약 생성 1건, M-4 dayConflict
(겹침 검출·오탐 없음), M-1/M-2 IG token_valid 정상.

- [ ] **C-6 auto_confirm 은 '죽은 토글'** — 라이브 검증 결과 백엔드에 `auto_confirm` 이 **전혀 없음**
      (models/routers/schemas 전무). GET `/shop/settings` 도 안 돌려줌. 예약은 생성 시 항상
      `status="confirmed"`(bookings.py:162)라 사실상 이미 전건 자동확정. **감사가 우려한 '의도치
      않은 자동확정 과금 사고'는 실재하지 않고**, 문제는 토글이 켜져 보이지만 아무것도 안 한다는 것.
      → **제품 결정**: (a) 죽은 토글 제거/비활성+안내, 또는 (b) 백엔드에 auto_confirm 컬럼+로직+GET 반영.
      내 C-6 hydrate 수정(app-shop-settings.js)은 hydrate 할 값이 없어 **무효**(무해). 결정 나면 정리.

## 🟠 B. 백엔드 동반 필요
- [ ] **H-2 OAuth state/nonce 완전화**: 프론트는 oauth-return 시 `/auth/me` 검증을 추가함(부분 완화, 라이브). 완전 방어는 백엔드가 OAuth 시작 시 `state` 발급→딥링크로 회신→프론트 대조 필요.
- [ ] **M-14 결제 멱등키**: 프론트가 요청별 idempotency 키 부여(라이브). 백엔드가 그 키로 중복 결제/충전 dedup 해야 완성.

## 🟡 C. 네이티브 플러그인/설정 (원영 판단)
- [ ] **H-4 미사용 권한 삭제**: iOS `NSContactsUsageDescription`/`NSFaceIDUsageDescription`/`NSMicrophoneUsageDescription` — 실제 구현 예정 없으면 Info.plist 에서 키 제거(Apple 5.1.1). 문구 한국어화는 완료.
- [ ] **M-19 Secure Storage**: access 토큰을 localStorage 대신 Keychain/Keystore 로 — Capacitor Secure Storage 플러그인 필요
- [ ] **L-10 Sign in with Apple**: `@capacitor-community/apple-sign-in` 설치 후 iOS 소셜로그인 노출(현재 4.8 회피 위해 숨김)

## ✅ D. 프론트로 이어서 진행 (이 세션)
- [x] IAP 프론트 연동(app-iap.js) + 구매복원 + 셋업문서
- [x] **H-2 프론트 완화**(oauth-return): 딥링크 토큰을 저장 전 `/auth/me` 로 검증 + 토큰 sub↔서버 user id 일치 확인(세션 고정 완화). 라이브.
- [ ] **L-1 마무리 killer-widgets 이모지** — 보류(카드 단위 일괄이라야 함. 💝🎯 심볼은 스프라이트에 없어 추가 필요). 조각 변환하면 한 카드 안에 아이콘/이모지 혼재로 더 지저분. 별도 디자인 배치.
- [ ] **M-17 포그라운드 herd** — 보류(visibilitychange 7개 모듈 생명주기 리팩터. 각 refresh 는 의도된 동작이라 무테스트 블라인드 수정 = 회귀 위험). 실기기 리줌 테스트와 함께 진행 권장.
- [ ] **M-14 결제 멱등키** — 보류(백엔드 dedup 없으면 프론트 키만으론 무효. IAP 경로는 스토어가 이미 멱등. 웹 PG 만 해당 → 백엔드 §B 와 함께).

_기준 문서: 감사 6도메인 결과. 진행상황은 memory `project_itdasy_launch_audit_6domain`._
