# Firebase / FCM 세팅 가이드

## 1. Firebase 프로젝트 생성 (5분, 연준님 직접)

### Step 1. 콘솔 접속
https://console.firebase.google.com/ → **"프로젝트 추가"** 클릭

### Step 2. 프로젝트 정보
- **프로젝트 이름**: `itdasy`
- Google Analytics: **비활성화** (앱 전용이라 불필요)
- **프로젝트 만들기** 클릭

### Step 3. Android 앱 추가
1. 프로젝트 개요 → **Android 아이콘** 클릭
2. 패키지 이름: **`com.nopolab.itdasy`** (★ 정확히 이 값)
3. 앱 닉네임: `잇데이 스튜디오`
4. 디버그 서명 SHA-1: **지금은 비워도 됨** (나중에 추가)
5. **앱 등록** 클릭
6. **`google-services.json` 다운로드** → 파일 저한테 주시면 배치

### Step 4. iOS 앱 추가 (Apple Developer 승인 후)
1. 프로젝트 개요 → **iOS 아이콘** 클릭
2. iOS 번들 ID: **`com.nopolab.itdasy`**
3. 앱 닉네임: `잇데이 스튜디오`
4. App Store ID: 비워두기
5. **`GoogleService-Info.plist` 다운로드** → 파일 저한테 주시면 배치

### Step 5. Cloud Messaging (FCM) 활성화
- 좌측 **"Messaging"** → **"시작하기"** (자동 활성화됨)
- 서버 키가 필요하면 (백엔드에서 발송할 때):
  - 프로젝트 설정 ⚙️ → **"서비스 계정"** → **"새 비공개 키 생성"**
  - JSON 파일 다운로드 → 백엔드 환경변수로 저장

---

## 2. 연준님 전달할 파일 2개

발급 받으시면 저한테 다음 2개 파일 주시면 됩니다:

```
1. google-services.json      (Android — 지금 바로 필요)
2. GoogleService-Info.plist  (iOS — Apple Dev 승인 후)
```

## 3. 내가 할 것 (파일 받으면 자동)

### Android 배치
```
android/app/google-services.json   ← 여기에 배치
```
(build.gradle에 이미 `apply plugin: 'com.google.gms.google-services'` 설정 완료)

### iOS 배치 (Apple 승인 후)
```
ios/App/App/GoogleService-Info.plist   ← 여기에 배치
```

### Capacitor sync + 빌드
```bash
npm install
npx cap sync
npx cap run android   # 실기기 테스트
```

---

## 4. FCM 플로우 (이미 구현 완료)

### 프론트엔드 (`app-push.js`)
1. 네이티브 앱 실행 시 권한 요청 (`POST_NOTIFICATIONS`)
2. FCM 토큰 수령
3. 백엔드 `POST /push/register` 에 토큰 등록
4. 로그아웃 시 `POST /push/unregister`

### 백엔드 (`routers/push.py`)
- `POST /push/register` — 토큰 upsert (인증 필수)
- `POST /push/unregister` — 토큰 삭제
- DB: `push_tokens` 테이블 (user_id, token, platform)

### 실제 알림 발송 (미구현 — 다음 스프린트)
- 예약 발행 완료 시
- 플랜 한도 초과 경고
- 인스타 토큰 만료 알림
