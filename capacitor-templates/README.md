# Capacitor 템플릿

Apple/Google 계정 발급 후 `npx cap add ios` / `npx cap add android`로 네이티브 프로젝트를 생성한 뒤, 아래 스니펫을 해당 파일에 삽입하세요.

## iOS 설정

파일: `ios/App/App/Info.plist`
스니펫: `ios-info-plist-snippets.plist`

Xcode에서 Info.plist를 열면 GUI로 key 입력할 수 있음. 또는 텍스트 편집기로 직접 `<dict>` 안에 추가.

### Xcode 추가 작업
1. **Target → Signing & Capabilities** — Team 선택 (Apple Developer 가입 후)
2. **Bundle Identifier** — `com.nopolab.itdasy` (`capacitor.config.json`과 일치)
3. **Capabilities 추가**:
   - Push Notifications
   - Background Modes → Remote notifications

## Android 설정

파일: `android/app/src/main/AndroidManifest.xml`
스니펫: `android-manifest-snippets.xml`

### Gradle 추가 작업
1. `android/app/build.gradle`의 `applicationId "com.nopolab.itdasy"` 확인
2. `android/build.gradle`에 Firebase 플러그인 추가 (FCM용)
3. `google-services.json` 다운로드해서 `android/app/`에 복사
4. `minSdkVersion 22, targetSdkVersion 34`로 설정

## FCM (Push Notifications) 별도 세팅

1. https://console.firebase.google.com 에서 새 프로젝트 생성 (이름: `itdasy`)
2. Android 앱 추가 — 패키지명 `com.nopolab.itdasy`
3. `google-services.json` 다운로드 → `android/app/`에 복사
4. iOS 앱 추가 — Bundle ID `com.nopolab.itdasy`
5. APNs 키(Apple Developer → Keys)를 Firebase Console에 등록
6. `GoogleService-Info.plist` 다운로드 → `ios/App/App/`에 복사

## Play Store / App Store 제출 체크리스트

- [ ] 스크린샷 (iOS 6.7"/6.5"/5.5", Android 6.7"/5.5")
- [ ] 앱 설명 (한국어·영어)
- [ ] 프라이버시 라벨 (Apple) / Data Safety (Google)
- [ ] Terms of Service URL — https://nopo-lab.github.io/itdasy-frontend/terms.html
- [ ] Privacy Policy URL — https://nopo-lab.github.io/itdasy-frontend/privacy.html
- [ ] 지원 이메일 — kangtaetv@gmail.com
- [ ] 카테고리 선택 — iOS: Business, Android: Business
- [ ] Content rating (Play 전용)
