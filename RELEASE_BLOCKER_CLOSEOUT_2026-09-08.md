# ITDASY — FINAL RELEASE BLOCKER CLOSEOUT

**DATE**: 2026-09-08
**FE**: `e7d2ad2` (내 마지막 커밋) · 이후 다른 세션 배포로 라이브 빌드는 `v1525`
**BE**: staging Cloud Run — **인증 포함 실검증 완료** (아래)
**DEPLOY**: `https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/`

---

## RESPONSIVE

**PASS** — 이번 세션에서 반응형 코드는 건드리지 않았고(이미 GREEN), 회귀만 확인했다.
테스트 354/354 · 25 suites.

---

## iOS SIMULATOR (iOS 26.4 · QA-iPhone17 · 실제 Safari/WebKit)

| | |
|---|---|
| Safari | **PASS** — 배포본 렌더·조작 정상 |
| Keyboard | **PASS** — 실제 한글 소프트웨어 키보드 |
| Fullscreen AI | **PASS** — 시트 입력창 커서·타이핑·전송버튼 활성·닫으면 복구 |
| Scroll | **PASS** |
| Back | **PASS** — 상세→목록, 플랜팝업 닫힘 (실계정에서 재확인) |
| Refresh | **PASS** — 인증 세션 유지, 로그인으로 안 튕김 |
| Orientation | **NOT TESTED** — 회전 수단 없음(도구에 액션 없음 · simctl 미지원 · osascript 보조접근 차단) |

## ANDROID EMULATOR (android-35 · 실제 Chrome)

| | |
|---|---|
| Chrome | **PASS** |
| Keyboard | **PASS** — 입력·전송 접근, 닫으면 복구, 이중보정 없음 |
| System Back | **PASS** — 실제 `KEYCODE_BACK` 로 시트 4/4 닫힘 |
| Scroll | **PASS** — 실제 스와이프 5회, 배경 불변 |
| Orientation | **PASS** — 세로↔가로↔세로, stale layout 없음 |

---

## STORE

| | |
|---|---|
| Monthly displayed | **9,900** (실계정·실배포본 플랜팝업에서 확인) |
| Monthly backend | **9,900** (`/subscription/plans` 실응답) |
| Monthly PG | **9,900** (`app-billing.js`) |
| **Monthly store** | **UNKNOWN — NOT VERIFIED** |
| Annual displayed | **99,000** (118,800 취소선·2개월 무료) |
| Annual product | **없음** — 네이티브 IAP 상품 미등록 |
| Product ID | `itdasy_membership_monthly_6900` (이름만 옛 가격인 레거시 식별자) |

**PRICE CONSISTENCY: 부분 PASS / 스토어는 UNKNOWN**

조사한 것 — 레포에 `.storekit` 설정·상품 fixture **없음**, 백엔드 `/iap/products`·`/iap/config`·
`/subscription/products` **전부 404**, App Store Connect / Play Console 접근 수단 **없음**.
→ 추측하지 않고 **NOT VERIFIED** 로 남긴다.

**중요 정정** — 지난 라운드에 "IAP 플러그인 미설치라 잠복" 이라고 적었는데 **틀렸다.**
`cordova-plugin-purchase@^13.18.0` 이 package.json 에 있고 iOS·Android 번들에 실제로
포함·등록돼 있다(`cordova_plugins.js`). `isAvailable()` 은 네이티브 빌드에서 **true** 다.
즉 연간→월간 오청구는 **잠복이 아니라 네이티브 빌드에서 살아 있던 P1** 이었다.

---

## AUTHENTICATED BACKEND (실계정 · 실서버 · iOS Safari)

연준님이 로그인해 주셔서 이번에 처음으로 인증 이후를 돌렸다. **전부 읽기 전용** —
실제 샵 데이터라 생성·수정·삭제는 하지 않았다.

| | Env / Action | Expected | Actual | Result |
|---|---|---|---|---|
| **Auth** | iOS Safari · 배포본 진입 | 세션 유지 | 샵 `테스트5.7` · IG `@disabled_offitial` · 체험 플랜 | **PASS** |
| **Customer** | 내샵관리→고객관리 | 목록 로드 | 2명(강연준 1회 단골 / 김호영 0회) · 세그먼트·칩 정상 | **PASS** |
| **Customer 상세** | 고객 탭 | 상세 로드 | 방문 1회·총매출 15만·가게기억 60%·선호시술·시술기록 09/07 | **PASS** |
| **Back** | 상세에서 브라우저 백 | 목록 복귀 | 목록 복귀, 앱 안 벗어남, 데이터 유지 | **PASS** |
| **Refresh** | 인증 화면에서 새로고침 | 세션 유지 | 내샵관리 유지, 로그인 안 튕김, blank 없음 | **PASS** |
| **Reservation** | 예약관리 | 캘린더 로드 | 2026년 9월 · 오늘 1건/이번달 2건 · 9/7 15시 강연준(완료) · 9/8 16시 김호영(확정) | **PASS** |
| **Revenue** | 매출관리 | 집계·상세 | 250,000원(2건) · 예상 929,000원 · 9/7 25만 · 빈 날짜 "기록된 매출이 없어요" | **PASS** |
| **Membership** | 플랜 팝업 | 가격 표시 | 월 9,900 / 연 99,000 · 사용량(잇비 14/10) | **PASS** |
| AI (잇비 호출) | — | — | **미수행** — 이번 달 사용량이 이미 14/10 초과. Vertex 쿼터는 운영과 공용이라 QA 로 태우지 않음 | NOT TESTED |
| Instagram / DM | — | — | **미수행** — 외부 발송 위험 | NOT TESTED |
| 쓰기(생성·수정·삭제) | — | — | **의도적 미수행** — 실제 샵 데이터 보호 | NOT TESTED |

---

## MONEY SAFETY

| | |
|---|---|
| Annual→monthly mismatch | **FIXED + 실배포본에서 위험 상태 재현 확인** |
| Duplicate purchase | NOT TESTED (실결제 없이 불가) |
| Retry / Failure | NOT TESTED |
| Refresh / Back (결제 팝업) | **PASS** — 백으로 팝업만 닫힘 |

실계정 플랜팝업에서 연간을 선택하니 버튼이 정확히 **"연 99,000원으로 시작하기"** 로 바뀌는 것을
확인했다. 네이티브였다면 이 버튼이 **월간 상품**을 샀다. 이제는 가드가 막는다.
(웹이라 실제로 누르지 않았다 — 결제 개시 행위는 하지 않음)

앱 하단 고지: **"가격은 스토어 정책에 따라 표시돼요"** — 네이티브 표시가가 스토어를 따른다는
뜻이라, 콘솔 가격 확인이 더 중요해진다.

---

## TEST

| | |
|---|---|
| Jest | **354 / 354** |
| Suites | **25** |
| Responsive | PASS |
| Price 정합성 | PASS (신규 7건) |
| Annual purchase safety | PASS (가드 제거 시 실패하는 것까지 확인) |
| Touch target | PASS |
| Auth E2E | 자동화 아님 — 위 수동 실검증 표로 대체 |

---

## REMAINING

| 이슈 | Severity | Evidence | Release impact |
|---|---|---|---|
| **스토어 콘솔 실제 가격 미확인** | **P1** | 레포에 상품 fixture 없음 · BE `/iap/*` 404 · 콘솔 접근 수단 없음 | 콘솔이 ₩6,900 이면 **표시 9,900 ≠ 청구 6,900** → 즉시 RED. ₩9,900 이면 STORE GREEN |
| 연간 IAP 상품 미등록 | P2 | `app-iap.js` 단일 상품 · 스토어 연간 없음 | 앱 내 연간 결제 불가(가드로 안전화). 웹은 가능 |
| AI·DM·인스타 인증 플로우 | P2 | 쿼터·외부발송 위험으로 미수행 | 핵심 매출 흐름은 아님 |
| 쓰기 경로(예약·매출 생성) | P2 | 실데이터 보호로 미수행 | 읽기는 전부 정상 |
| iOS orientation | P2 | 회전 수단 없음 | 안드로이드는 PASS |
| iOS 15 런타임 | 정보 | 런타임 미설치(26.4 단독) | 구조·툴체인은 잠금 완료 |
| 실기기 | — | 물리 기기 없음 | — |

---

## FINAL

| | |
|---|---|
| **RESPONSIVE** | 🟢 **GREEN** |
| **SIMULATOR / EMULATOR** | 🟢 **GREEN** |
| **MOBILE** | 🟢 **GREEN** |
| **STORE** | 🟡 **YELLOW** (NOT VERIFIED — 콘솔 확인 필요) |
| **BACKEND E2E** | 🟢 **GREEN (읽기 핵심 경로)** / 쓰기·AI·DM 미수행 |
| **PAYMENT** | 🟡 **YELLOW** |
| **PHYSICAL DEVICE** | **NOT TESTED** |

### OVERALL RELEASE READINESS: 🟡 **YELLOW**

이번 세션으로 **P1 두 개 중 하나가 닫혔다** — 인증 백엔드 E2E 는 연준님 로그인 덕에 실계정·실서버로
고객·예약·매출·멤버십·백·새로고침까지 전부 PASS 했고, 반응형·시뮬레이터·에뮬레이터는 그대로
GREEN 이며 회귀 354/354 다. 그럼에도 GREEN 이 아닌 이유는 **딱 하나** 다 —
**스토어 콘솔의 실제 구독 가격을 확인하지 못했다.** 화면은 9,900 을 말하는데 상품ID 는
`..._6900` 이고, 앱 스스로 "가격은 스토어 정책에 따라 표시돼요" 라고 고지한다. 콘솔이 아직
₩6,900 이면 **표시 ≠ 청구** 로 즉시 출시 차단(RED)이고, ₩9,900 이면 STORE·PAYMENT 가 GREEN 이
되어 **전체 GREEN 으로 승격**된다. 이건 코드로 확인할 수 없고 사람이 콘솔을 열어야 한다.

### GREEN 까지 남은 일 — 1개

1. **App Store Connect / Play Console** 에서 `itdasy_membership_monthly_6900` 의 실제 구독 가격이
   **₩9,900** 인지 확인 (연간 상품 등록 여부도 같이)
   - ₩9,900 이면 → 알려주시면 STORE/PAYMENT/OVERALL 을 GREEN 으로 갱신
   - ₩6,900 이면 → **RED**. 콘솔 가격을 9,900 으로 올리거나, 9,900 짜리 새 상품ID 를 만들고
     `app-iap.js` + 백엔드 `PRODUCT_TO_PLAN` 을 같이 바꿔야 한다(둘을 반드시 같은 배포에)

(선택) 실기기 1대 · iOS 15 계열 · AI/DM 인증 플로우는 GREEN 차단 사유가 아니다.
