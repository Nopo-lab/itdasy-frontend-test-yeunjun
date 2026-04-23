#!/bin/bash
# ============================================================
# 잇데이 Signed APK 원커맨드 빌드 스크립트
# 용도: Google Play Console 소유권 인증용 APK 빌드
# ============================================================
#
# 사용법:
#   1. 비번 환경변수 설정 (터미널에서 바로 입력, 히스토리에 안 남김):
#      read -s ITDASY_STORE_PASS   # 엔터 → 비번 입력
#      export ITDASY_STORE_PASS
#      export ITDASY_KEY_PASS="$ITDASY_STORE_PASS"   # 보통 같은 비번
#      export ITDASY_KEY_ALIAS="itdasy"              # 실제 alias (모르면 아래 keytool 로 확인)
#
#   2. 이 스크립트 실행:
#      bash build-signed-apk.sh
#
#   3. 출력된 APK 경로를 Google Play Console 드롭 영역에 드래그
# ============================================================

set -e

KEYSTORE="${ITDASY_KEYSTORE:-$HOME/itdasy-release.jks}"
ALIAS="${ITDASY_KEY_ALIAS:-itdasy}"

# 전제 조건 확인
if [[ ! -f "$KEYSTORE" ]]; then
  echo "❌ Keystore 파일 없음: $KEYSTORE"
  exit 1
fi
if [[ -z "$ITDASY_STORE_PASS" ]]; then
  echo "❌ ITDASY_STORE_PASS 환경변수 미설정. 위 사용법 참조."
  exit 1
fi
if [[ -z "$ITDASY_KEY_PASS" ]]; then
  export ITDASY_KEY_PASS="$ITDASY_STORE_PASS"
fi

echo "📦 1. Keystore 정보 확인 (SHA-256 지문):"
keytool -list -v -keystore "$KEYSTORE" -alias "$ALIAS" -storepass "$ITDASY_STORE_PASS" 2>&1 | grep "SHA256" | head -1
echo

EXPECTED="66:EA:82:F1:28:E3:B3:2F:64:24:3D:94:FF:AD:E0:72:CF:DA:32:98:7B:AB:E8:24:A3:37:71:53:2A:3D:5D:1C"
ACTUAL=$(keytool -list -v -keystore "$KEYSTORE" -alias "$ALIAS" -storepass "$ITDASY_STORE_PASS" 2>&1 | grep "SHA256:" | awk '{print $2}' | tr -d '[:space:]')
if [[ -n "$ACTUAL" ]]; then
  if [[ "$ACTUAL" == "$EXPECTED" ]]; then
    echo "✅ 지문 일치 — Google Play 에 등록된 키스토어와 동일"
  else
    echo "⚠️  지문 불일치"
    echo "    예상: $EXPECTED"
    echo "    실제: $ACTUAL"
    echo "    → 다른 키스토어 사용 또는 Google Play 에 다른 keystore 먼저 등록됨"
    echo "    → 계속 진행하면 업로드 시 반려됨"
    read -p "계속 빌드할까요? (y/n) " cont
    [[ "$cont" != "y" ]] && exit 1
  fi
fi
echo

# npm build
echo "📦 2. Capacitor sync (웹 → android 복사)"
cd "$(dirname "$0")"
npx cap sync android
echo

# gradle build
echo "📦 3. Release APK 빌드 (gradle)"
cd android
chmod +x gradlew
./gradlew clean assembleRelease
echo

APK_PATH="app/build/outputs/apk/release/app-release.apk"
if [[ -f "$APK_PATH" ]]; then
  ABS_PATH="$(pwd)/$APK_PATH"
  echo "✅ 빌드 완료!"
  echo "   APK 위치: $ABS_PATH"
  echo
  echo "📤 Google Play Console 에서 이 파일을 드래그해서 업로드하세요:"
  echo "   open -R \"$ABS_PATH\"    # Finder 에서 파일 위치 열기"
  echo
  # Finder 자동으로 열기
  open -R "$ABS_PATH"
else
  echo "❌ 빌드 실패 — APK 생성 안 됨"
  exit 1
fi
