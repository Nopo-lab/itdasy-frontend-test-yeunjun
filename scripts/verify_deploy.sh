#!/usr/bin/env bash
# 배포가 "정말로" 라이브에 반영됐는지 SHA 기준으로 검증한다.
#
# 왜 필요한가 (2026-08-02 실측):
#   `gh run list --limit 1` 로 배포 성공을 판정하면 **직전 커밋의 이미 끝난 실행**을 보고
#   즉시 통과한다. 실제로 `6e4fd48` 을 푸시하고 "배포 성공"을 확인했는데 그건 `96a4683` 의
#   실행이었고 내 커밋은 아직 in_progress 였다 — 배포가 끝나기도 전에 QA 를 시작했고,
#   그 회차 결과가 통째로 오염됐다.
#
# 검증 대상 3종이 **모두** 같은 SHA 를 가리켜야 성공:
#   1) build.txt          — 배포가 쓴 빌드 버전
#   2) index.html         — window.__LATEST_BUILD__
#   3) 실제 내려오는 JS   — index.html 이 참조하는 app-core.js 의 ?v= 와 그 파일의 APP_BUILD
#
# 사용:
#   scripts/verify_deploy.sh                 # HEAD 의 short SHA 로 검증
#   scripts/verify_deploy.sh <sha7>          # 특정 SHA
#   BASE_URL=... scripts/verify_deploy.sh    # 배포 URL 오버라이드
#
# 종료코드: 0=일치, 1=불일치/타임아웃 → CI 를 실패시킨다.

set -uo pipefail

# [2026-08-03] 기본 URL 을 **레포에서 유도**한다. 예전엔 yeunjun 주소가 하드코딩돼 있어서,
#   이 스크립트가 운영 레포로 동기화되자마자 운영 배포가 **남의 사이트(yeunjun)를 40번 폴링**하다
#   SHA 불일치로 실패했다. 운영엔 그 SHA 가 있을 리 없으니 영원히 안 맞는다.
#   (같은 유형의 사고 전례: `18ada8b fix(seo): 동기화로 박힌 test-yeunjun URL 교정`)
#   CI 에선 GITHUB_REPOSITORY 로 자동 결정되므로 **다음에 또 복제돼도 알아서 맞는다.**
_DEFAULT_BASE_URL="https://nopo-lab.github.io/itdasy-frontend-test-yeunjun"
if [ -n "${GITHUB_REPOSITORY:-}" ]; then
  _OWNER="$(printf '%s' "${GITHUB_REPOSITORY%%/*}" | tr '[:upper:]' '[:lower:]')"
  _DEFAULT_BASE_URL="https://${_OWNER}.github.io/${GITHUB_REPOSITORY#*/}"
fi
BASE_URL="${BASE_URL:-$_DEFAULT_BASE_URL}"
SHA="${1:-$(git rev-parse --short HEAD 2>/dev/null)}"
MAX_TRIES="${MAX_TRIES:-40}"
SLEEP_SEC="${SLEEP_SEC:-10}"

if [ -z "$SHA" ]; then
  echo "❌ SHA 를 알 수 없다 (인자도 없고 git 도 없음)" >&2
  exit 1
fi

# CDN·프록시 캐시를 확실히 피한다. 이 검증만큼은 절대 캐시를 믿지 않는다.
fetch() {
  curl -fsSL --max-time 25 \
       -H 'Cache-Control: no-cache, no-store, max-age=0' \
       -H 'Pragma: no-cache' \
       "$1?_cb=$(date +%s%N)" 2>/dev/null
}

echo "🔎 배포 검증 — SHA=$SHA"
echo "   대상: $BASE_URL"

for i in $(seq 1 "$MAX_TRIES"); do
  BUILD_TXT="$(fetch "$BASE_URL/build.txt" | tr -d '[:space:]')"
  INDEX_HTML="$(fetch "$BASE_URL/index.html")"
  IDX_BUILD="$(printf '%s' "$INDEX_HTML" | grep -o "__LATEST_BUILD__ = '[^']*'" | head -1 | sed "s/.*'\(.*\)'/\1/")"
  # index.html 이 실제로 참조하는 app-core.js 경로(?v= 포함) 를 그대로 받아서 APP_BUILD 확인.
  CORE_REF="$(printf '%s' "$INDEX_HTML" | grep -o "app-core\.js?v=[^\"']*" | head -1)"
  JS_BUILD=""
  if [ -n "$CORE_REF" ]; then
    JS_BUILD="$(curl -fsSL --max-time 25 -H 'Cache-Control: no-cache' "$BASE_URL/$CORE_REF" 2>/dev/null \
                | grep -o "window.APP_BUILD = '[^']*'" | head -1 | sed "s/.*'\(.*\)'/\1/")"
  fi

  ok=1
  case "$BUILD_TXT" in *"$SHA") ;; *) ok=0 ;; esac
  case "$IDX_BUILD"  in *"$SHA") ;; *) ok=0 ;; esac
  case "$JS_BUILD"   in *"$SHA") ;; *) ok=0 ;; esac
  [ "$BUILD_TXT" = "$IDX_BUILD" ] && [ "$IDX_BUILD" = "$JS_BUILD" ] || ok=0

  if [ "$ok" = "1" ]; then
    echo "✅ 라이브 반영 확인 (${i}회차)"
    echo "   build.txt   = $BUILD_TXT"
    echo "   index.html  = $IDX_BUILD"
    echo "   app-core.js = $JS_BUILD   (참조: $CORE_REF)"
    exit 0
  fi

  echo "   …대기 ${i}/${MAX_TRIES}  build.txt=${BUILD_TXT:-∅} index=${IDX_BUILD:-∅} js=${JS_BUILD:-∅}"
  sleep "$SLEEP_SEC"
done

echo "❌ 배포 검증 실패 — SHA=$SHA 가 라이브에 반영되지 않았다" >&2
echo "   build.txt=${BUILD_TXT:-∅}  index.html=${IDX_BUILD:-∅}  app-core.js=${JS_BUILD:-∅}" >&2
exit 1
