# iOS 빌드·제출 프리플라이트 체크리스트 (2026-04-22)

## 📋 0. Prerequisites (연준님 확인)

- [ ] Apple Developer Program 가입 완료 ✅ (2026-04-22 완료)
- [ ] Mac 에 Xcode 15+ 설치
- [ ] `npm` · `node 16+` 로컬 설치
- [ ] Apple ID 로 Xcode Sign-In (Xcode → Settings → Accounts)

---

## 📋 1. App Store Connect 세팅

- [ ] **App ID 등록**: `com.nopolab.itdasy`
  - Capabilities: ☑ Sign in with Apple · ☑ In-App Purchase · ☑ Push Notifications
- [ ] **App Store Connect 앱 생성**: 이름 "잇데이"
- [ ] **IAP 상품 2개**
  - `itdasy_pro_monthly_19900` — ₩19,900 자동갱신 구독
  - `itdasy_premium_monthly_39900` — ₩39,900
  - 두 상품 같은 Subscription Group ("Itdasy Subscriptions")
- [ ] **App-Specific Shared Secret** 발급 → Railway env `APPLE_IAP_SHARED_SECRET=<값>` 주입
- [ ] **Privacy Policy URL**: `https://itdasy.com/privacy.html`
- [ ] **Marketing/Support URL**: `https://itdasy.com/`

---

## 📋 2. Capacitor iOS 프로젝트 추가 (Mac 터미널)

```bash
cd ~/프로젝트/깃허브with원영/itdasy_beauty_app_recent/itdasy-frontend-test-yeunjun

# 의존성
npm install

# iOS 플랫폼 추가 (최초 1회)
npx cap add ios

# Web assets → ios/App/App/public 복사
npx cap sync ios
```

- [ ] `ios/App/` 폴더 생성 확인

---

## 📋 3. Privacy Manifest 적용 (2024+ Apple 필수)

```bash
# 이 레포의 docs/submission/PrivacyInfo.xcprivacy 를 Xcode 프로젝트에 추가
cp docs/submission/PrivacyInfo.xcprivacy ios/App/App/PrivacyInfo.xcprivacy
```

그 다음 Xcode 에서:
- **File → Add Files to "App"** → `PrivacyInfo.xcprivacy` 선택 → **Add to targets: App**

- [ ] 파일이 Xcode Project Navigator 에 보임
- [ ] Target Membership 에 `App` 체크됨

---

## 📋 4. Info.plist 권한 문구 추가

`ios/App/App/Info.plist` 를 Xcode 로 열어서 다음 키 추가. (문구는 `docs/submission/Info.plist-keys.md` 복붙)

- [ ] `NSCameraUsageDescription`
- [ ] `NSPhotoLibraryUsageDescription`
- [ ] `NSPhotoLibraryAddUsageDescription`
- [ ] `NSMicrophoneUsageDescription`
- [ ] `NSFaceIDUsageDescription`
- [ ] `NSContactsUsageDescription`
- [ ] `NSUserTrackingUsageDescription`

---

## 📋 5. Sign in with Apple Capability

Xcode → **App target** → **Signing & Capabilities** → `+ Capability` → **"Sign in with Apple"** 추가

- [ ] Capabilities 목록에 "Sign in with Apple" 표시
- [ ] Apple Developer Console 의 App ID 에도 동일 capability 체크돼 있는지 확인

---

## 📋 6. 앱 아이콘 · 스플래시

- [ ] 앱 아이콘 1024×1024 PNG (투명 배경 X, 둥근 모서리 Apple 이 자동) → `AppIcon.appiconset`
- [ ] 스플래시 스크린 (Capacitor SplashScreen 플러그인 기본 사용)

**아이콘 생성 툴**: https://appicon.co 에 1024×1024 올리면 모든 사이즈 자동 생성

---

## 📋 7. Build Settings

Xcode → App target → **General**:
- [ ] **Display Name**: `잇데이`
- [ ] **Bundle Identifier**: `com.nopolab.itdasy`
- [ ] **Version**: `1.0.0` (마케팅 버전)
- [ ] **Build**: `1` (제출할 때마다 증가)
- [ ] **Deployment Target**: iOS 14.0+ (권장)
- [ ] **Device Orientation**: Portrait 만 (뷰티샵 원장님 주로 세로)

---

## 📋 8. Signing

- [ ] **Automatic Signing** 체크 (가장 쉬움)
- [ ] Team 에 연준님 Apple Developer 계정 선택
- [ ] Provisioning Profile 자동 생성 확인

---

## 📋 9. Archive → TestFlight

```
Xcode → Product → Destination → "Any iOS Device (arm64)"
Xcode → Product → Archive  (10~15분 소요)
Organizer 창 → Distribute App → App Store Connect → Upload
```

- [ ] 업로드 성공 (30분 후 TestFlight 에 나타남)
- [ ] Export Compliance: "No, my app doesn't use encryption" (실제로는 HTTPS 만 씀 — exempt)

---

## 📋 10. 앱 심사 제출

- [ ] 스크린샷 업로드: 6.7" / 6.5" / 5.5" 각 3~5장
- [ ] **App Review Information**
  - Sign-in Required: Yes
  - Demo Account: `review@itdasy.com` / `review1234!`
  - Review Notes: `docs/submission/Review-Notes.md` 복붙
- [ ] **Submit for Review**
- [ ] Apple 검토 대기 (평균 24시간)

---

## ⚠️ 자주 Rejected 되는 사유 대비

| 사유 | 예방 |
|---|---|
| Guideline 4.8 (Sign in with Apple 없음) | T-320 구현 완료 ✅ — Capability 추가 + 버튼 노출 |
| Guideline 3.1.1 (IAP 미사용) | 앱 내 유료 기능은 반드시 IAP 만. 외부 결제 링크 금지 |
| Privacy Policy 누락 | `https://itdasy.com/privacy.html` ✅ |
| Demo 계정 로그인 실패 | 시드 스크립트 최신화 확인 |
| 카메라/마이크 권한 설명 모호 | `NSCameraUsageDescription` 구체 문구 |
| 백엔드 서버 다운 | Railway Pro 업그레이드 고려 |
| **"한국어만" 지원 시 "Localization" 확인 요구** | App Store Connect → Localization → Korean 명시 |
| "일반적 앱 설명" (너무 포괄적) | "뷰티샵 원장님용 AI 비서" 처럼 구체화 |
| AI 답변이 부적절·위험 | Gemini safety_settings 기본값 유지 |

---

## 📞 제출 후 할 일

- TestFlight 외부 테스터 추가 (10명 정도, Apple Review 없이 바로 가능)
- Sentry 에서 크래시/에러 모니터링
- Apple 승인 후 → Play Store 제출 (Android 병행)
