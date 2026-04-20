# Capacitor 세팅 가이드 (iOS/Android 앱 패키징)

## 📦 현재 구성

- `capacitor.config.json` — 앱 ID(`com.nopolab.itdasy`), remote URL 로딩 방식
- `package.json` — Capacitor 6.x + Camera/Push/Share/Splash/StatusBar 플러그인
- **Remote URL 로딩**: 네이티브 앱이 `https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/` 를 WebView로 띄움 → 웹 변경 시 앱에 즉시 반영, 심사 재제출 불필요

## 🎯 최초 세팅 (한 번만)

### 1. Node 의존성 설치
```bash
cd itdasy-frontend-test-yeunjun
npm install
```

### 2. iOS 프로젝트 생성
```bash
npx cap add ios
npx cap sync ios
```
→ `ios/App/App.xcodeproj`, `ios/App/Podfile` 등 자동 생성

### 3. Android 프로젝트 생성
```bash
npx cap add android
npx cap sync android
```
→ `android/app/src/...` 자동 생성

### 4. Xcode / Android Studio 설치
- Xcode: App Store에서 무료. macOS에서 iOS 빌드 필수.
- Android Studio: https://developer.android.com/studio — Android SDK + AVD 포함.

## 📱 개발 중 실기기/시뮬레이터 실행

```bash
# iOS 시뮬레이터
npx cap run ios
# 실기기 (iPhone 케이블 연결 후 Apple Developer 계정 등록 필요)
npx cap open ios  # Xcode 열려서 수동 Run

# Android 에뮬레이터/실기기
npx cap run android
```

## 🚀 웹 업데이트 → 앱 자동 반영

이 앱은 **Remote URL 로딩 방식**이라 웹 수정 → GitHub Pages 반영되면 앱은 다음 실행 시 자동 갱신.

**단 네이티브 영역(아이콘·스플래시·플러그인 버전·권한 설명)을 바꿨을 때만** `cap sync` + 재빌드 + 앱스토어 재제출 필요.

## 🛡 Apple 4.2 반려 회피

단순 WebView 앱은 Apple이 거부함. 본 구성은 다음 네이티브 기능을 사용하여 회피:
- `@capacitor/camera` — 사진 촬영/앨범 접근
- `@capacitor/push-notifications` — FCM/APNs
- `@capacitor/share` — iOS 공유 시트
- `@capacitor/splash-screen` — 네이티브 스플래시
- `@capacitor/status-bar` — 상태바 스타일

프론트 JS에서 Capacitor가 있을 때만 네이티브 API 호출하도록 조건 분기 필요 (추후 `app-core.js`에 플러그인 로딩 코드 추가).

## 🔐 출시 전 체크리스트

- [ ] Apple Developer Program 가입 ($99/년)
- [ ] Google Play Console 가입 ($25)
- [ ] `capacitor.config.json`의 `appId` 최종 확정 (변경 시 Bundle ID 재등록 필요)
- [ ] 앱 아이콘 교체 (현재 `icons/icon-*.png`가 임시 🎀 디자인)
- [ ] 스플래시 스크린 이미지 (2732x2732 권장)
- [ ] iOS Info.plist 권한 설명문구:
  - NSCameraUsageDescription — 카메라 권한
  - NSPhotoLibraryUsageDescription — 사진 앨범 권한
  - NSPhotoLibraryAddUsageDescription — 저장 권한
- [ ] Android AndroidManifest.xml 권한:
  - CAMERA, READ_EXTERNAL_STORAGE, POST_NOTIFICATIONS
- [ ] Firebase 프로젝트 (Push Notifications FCM 용)
- [ ] iOS 인증서 (Apple Developer → Certificates, Identifiers & Profiles)
- [ ] Google Play 앱 서명 키 (Play Console → Setup → App integrity)

## 📞 문의

이 가이드로 막히면 `project_itdasy_launch_blockers.md`의 "앱 패키징" 섹션 참고.
