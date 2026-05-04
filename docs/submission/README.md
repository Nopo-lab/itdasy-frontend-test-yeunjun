# 잇데이 앱스토어 심사 제출 가이드 (2026-04-22)

## 📂 파일 안내

- `PrivacyInfo.xcprivacy` — iOS Privacy Manifest (Apple 2024+ 필수). `npx cap add ios` 후 `ios/App/App/` 에 복사하고 Xcode 프로젝트에 추가.
- `Info.plist-keys.md` — iOS 권한 사용 사유 문구 (카메라·마이크·사진)
- `Google-Play-Data-Safety.md` — Google Play 제출 시 Data Safety 설문 답변지
- `App-Store-Metadata.md` — App Store Connect 에 입력할 앱 설명·키워드·카테고리
- `Meta-BV-Resubmission.md` — Meta Business Verification 재제출 체크리스트
- `Review-Notes.md` — Apple 리뷰어에게 전달할 영문 데모 가이드
- `Screenshot-Plan.md` — 스크린샷 촬영 계획 (6.5"/5.5" 각 5장)

## 🎯 제출 순서 권장

1. Apple Developer Program 가입 확인 ($99/년)
2. Google Play Developer 가입 확인 ($25 1회)
3. `npx cap add ios` → iOS 프로젝트 생성
4. `PrivacyInfo.xcprivacy` 복사 + Info.plist 키 추가
5. iOS 로그인 점검: 현재는 이메일 로그인만 노출. Google/카카오 재노출 전 Sign in with Apple 구현 (T-320)
6. 리뷰어 데모 계정 시드 스크립트 실행 (`scripts/seed_review_demo.py`)
7. 스크린샷 촬영 (CBT4 계정 실제 데이터)
8. TestFlight / Play Internal 테스트
9. 심사 제출
