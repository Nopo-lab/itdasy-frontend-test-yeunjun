# ITDASY — RESPONSIVE / MOBILE ABSOLUTE FINAL CLOSEOUT

**DATE**: 2026-09-08
**FE**: `029d44c` (origin/main · 배포 빌드 `20260907-1509-029d44c`)
**BE**: staging Cloud Run — 무인증 읽기만 도달 (아래)
**DEPLOY**: `https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/` · Pages `34136836796` **success**

---

## ENVIRONMENT

| | |
|---|---|
| **iOS Simulator** | iOS 26.4 (23E254a) · QA-iPhone17 (402×874pt) · **실제 Safari/WebKit + 실제 한글 소프트웨어 키보드** |
| **Android Emulator** | android-35 (google_apis_playstore) · AVD `itdasy_galaxy` (1080×1920) · **실제 Chrome + 실제 시스템 백 + 실제 스와이프** |
| **Desktop** | Chromium 320~1920 |
| **Physical device** | **없음** |

---

## RESPONSIVE

| | |
|---|---|
| Layout | **PASS** (320~1920 overflow 0 · 안드로이드 landscape 재계산 정상) |
| Touch | **PASS(개선)** — 아래 BUG-5. 잔여 4건은 의도적 제외 |
| Keyboard | **PASS** — 홈 잇비 + **전체화면 시트** 둘 다 실제 키보드로 확인 |
| Modal | **PASS** |
| Scroll | **PASS** — 실제 스와이프 5회, 배경 불변 |
| Back | **PASS** — 안드로이드 실제 시스템 백 4/4 |
| Refresh | **PASS** — 유령 hash 정리·시스템 hash 보존 |
| Safe Area | **PASS(시뮬레이터)** |
| Orientation | **부분** — 안드로이드 PASS / iOS 미검증(도구에 회전 액션 없음) |
| Media | **NOT TESTED** |
| Accessibility | **부분 PASS** — 44px 타깃 개선, 잔여 명시 |
| Error UX | **PASS** |
| Performance | **NOT MEASURED** |
| Regression | **PASS — 352/352 · 25 suites** |

---

## BUG CLOSEOUT

**BUG-1 (iOS15 `:not()`)** — **STRUCTURALLY FIXED / iOS 15 RUNTIME NOT TESTED**
- ROOT CAUSE: `:not(a, b)` 는 Safari 16.4+, 앱 최소 지원 iOS 15.0. 콤마 그룹에 무효 셀렉터 하나면 **규칙 전체 폐기**.
- FIX: 체인 `:not()` + `.stylelintrc.json` `selector-not-notation: "simple"` 고정.
- TEST (A 소스): 활성 CSS 7파일 스캔 → **selector-list `:not()` 0건** (주석 제외).
- TEST (B 툴체인): `stylelint --fix` 재실행 후에도 체인 유지 · pre-commit 통과 · 352/352.
- TEST (C 구형 파서): **수행 못 함** — 이 맥에 iOS 15 런타임 없음(26.4 단독), Playwright 브라우저 바이너리 없음.
- RESULT: 구조적으로는 닫혔다. **iOS 15 실런타임 재현은 NOT TESTED.**

**BUG-2 (시트 뒤로가기)** — **FIXED** · 안드로이드 실제 `KEYCODE_BACK` 로 플랜·리뷰요청·리마인더·내보내기 **4/4** 닫힘, 앱 유지.

**BUG-3 (플랜 닫기 우회)** — **FIXED** · ✕·배경 클릭 모두 hash 정리, 죽은 히스토리 칸 없음.

**BUG-4 (내부 오류 노출)** — **FIXED** · `_humanError`/`showToast` 두 길목에서 흡수. 덤으로 **429 가 "파일이 너무 커요" 로 오분류**되던 것 교정.

**BUG-5 (터치 타깃)** — **FIXED(주요) / 잔여 4건 의도적**
- 측정법: 오버레이(온보딩·오프라인 배너) 제거한 깨끗한 상태에서 `elementFromPoint` 로 히트 영역을 **바깥으로 훑어** 실측. (초기 측정은 오버레이 오염 + `t.contains(el)` 로 부모 탭까지 성공으로 세던 버그가 있어 폐기하고 다시 쟀다)
- FIX (보이는 크기 유지, `::after` 로 히트만): input-icon 32→44 · swap 34→44 · 전체보기 14→44 · 캘린더 15→44 · 벨 41→44 · 플랜배지 33→44 · cmsg새로고침 29→44 · cmsg전체보기 24→44
- **오탭 검사 0건** (모든 버튼 중심에서 자기 자신이 잡힘)
- 잔여(의도): `logo`(브랜드 워드마크) · `hv5-itbi-mini`/`hv5-itbi-rest`(세로로 붙은 행 — 넓히면 옆 행을 먹어 오탭) · `#hv5CmsgWhy`(아래 형제와 5px뿐 → 위로만 비대칭 확장 13→35)

**BUG-6 (잇비 키보드)** — **FIXED · 전체화면 시트까지 완료**
- 홈 입력창(앞 라운드) + **전체화면 시트(이번 라운드)** 둘 다 실제 iOS 키보드로 검증.
- 시트 실측: `innerH=595 vv.h=377 vv.top=337 KEYBOARD=218` · `sheet h=714` · 입력창 커서 보임 · 타이핑 성공 · **전송 버튼 활성화** · 닫으면 `kb-open=false`, navGrp `visible` 복구.
- ROOT CAUSE(앞 라운드): 키보드 높이 식에서 `vv.offsetTop`(스크롤량)을 빼서 상쇄 → 보정이 죽고 fixed 탭바가 입력창 위로 떠오름.

**BUG-7 (유령 hash)** — **FIXED**

**BUG-8 (배경 스크롤)** — **PASS** · 실제 스와이프 5회에도 `BG scrollY` 360 불변, `body.overflow=hidden` 유지.

**BUG-9 (dark css 주석)** — **P3** · 주석이라 파서가 안 읽음.

---

## PRICE / MEMBERSHIP

| | |
|---|---|
| **Displayed** | 월 **9,900** / 연 **99,000** (페이월·약관·랜딩·support) |
| **Authoritative** | 백엔드 `/subscription/plans` — `price:9900` `price_yearly:99000` `price_usd:6.99` |
| **Backend** | 9,900 ✅ (실제 staging 응답으로 확인) |
| **Web PG** | `app-billing.js` `pro:9900` / `pro_yearly:99000` ✅ |
| **Provider (Apple/Google)** | **UNKNOWN — 콘솔 확인 필요** |
| **Product ID** | `itdasy_membership_monthly_6900` (**이름만 옛 가격인 레거시 식별자**) |
| Monthly | 9,900 · 10일 무료체험 |
| Annual | 99,000 · 체험 없음 · **네이티브 IAP 상품 없음** |

**CONSISTENT: 부분 YES**
- FE ↔ BE ↔ 웹 PG: **일치** ✅
- FE ↔ 스토어 콘솔: **UNKNOWN** — 코드로 볼 수 없다.

**이번에 고친 결제 사고 가능성 (P1)**
`ItdasyIAP.purchaseMembership()` 은 플랜 인자를 받지 않고 **단일 월간 상품**만 산다. 그런데 연간을
고르면 버튼이 "연 99,000원으로 시작하기" 가 된다 → **표시 금액과 청구 금액이 달라진다.**
지금은 IAP 플러그인 미설치라 잠복이었지만 켜지는 순간 실제 과금 사고다.
→ 스토어에 연간 상품이 생기기 전까지 **조용히 월간을 태우지 않고 안내 후 중단**하도록 고침.

**문서 9,900 통일**: 출시 문서 5개가 ₩6,900 · 7일 체험 · $4.99 로 남아 있어 9,900 · 10일 · $6.99 로
맞추고 정본 근거를 머리에 명시. 상품ID 이름은 스토어 연결이 끊기므로 **바꾸지 않았다.**

---

## BACKEND E2E

무인증으로 도달 가능한 범위만 **실제 백엔드**로 확인했다. 목킹 아님.

| | |
|---|---|
| `/health` | **200 (실백엔드)** |
| `/subscription/plans` | **200 (실백엔드)** — 가격 정본 확보 |
| AUTH (`/auth/me`) | **401 — NOT TESTED** |
| CUSTOMER (`/customers`) | **401 — NOT TESTED** |
| RESERVATION | NOT TESTED |
| AI | NOT TESTED |
| INSTAGRAM / DM | NOT TESTED |
| MEMBERSHIP (상태 read/write) | NOT TESTED |

사유: staging 이 `localhost` Origin 에 CORS 를 안 열고, 인증 엔드포인트는 토큰이 필요하다.
**비밀번호 입력은 내가 할 수 없는 행위**라 테스트 계정 로그인을 만들지 못했다.
passwordless/seed 로그인 경로도 레포에서 찾지 못했다.

---

## DEVICE STATUS

| | |
|---|---|
| iOS Simulator | **PASS** (실제 Safari + 실제 키보드) |
| Android Emulator | **PASS** (실제 Chrome + 실제 시스템 백 + 실제 스와이프) |
| Desktop | **PASS** |
| Physical iPhone | **NOT TESTED** |
| Physical Android | **NOT TESTED** |

---

## REMAINING

| 이슈 | Severity | Device | Route | Repro | Release impact | Reason |
|---|---|---|---|---|---|---|
| **스토어 콘솔 실제 가격** | **P1 (결제)** | iOS/Android | 결제 | App Store Connect / Play Console 열기 | 콘솔이 아직 ₩6,900 이면 **표시 9,900 ≠ 청구 6,900** = 출시 차단 | 콘솔은 코드에서 볼 수 없다. **사람이 확인해야 함** |
| 연간 IAP 상품 부재 | P2 | iOS/Android | 결제 | 연간 선택 | 앱 내 연간 결제 불가(안내 후 중단으로 안전화됨) | 스토어에 연간 상품 등록 필요 |
| iOS 15 실런타임 | 정보 | iPhone iOS 15.x | 전역 | 입력칸 포커스 | BUG-1 원래 실패 모드 미재현 | 맥에 iOS 15 런타임 없음 |
| iOS orientation | P2 | iPhone | 전역 | 가로 회전 | 미검증 | 시뮬레이터 제어 도구에 회전 액션 없음 |
| 인증 백엔드 E2E | P1(검증공백) | 전부 | 로그인·예약·매출·DM·결제 | — | 핵심 플로우가 **실서버로 한 번도 안 돌아봄** | CORS + 비밀번호 입력 금지 |
| 터치 타깃 잔여 4건 | P2 | 모바일 | 홈 | — | 사용 가능, 44 미달 | 넓히면 옆 행을 먹어 **오탭이 더 나쁨** |
| 실기기 | — | — | — | — | — | 물리 기기 없음 |

---

## FINAL

**RESPONSIVE GATE: 🟢 GREEN**
overflow 0 · modal · keyboard(홈+시트) · scroll · back · refresh · orientation(가능 범위) · regression 352/352 전부 실측 PASS.

**SIMULATOR / EMULATOR: 🟢 GREEN**
iOS 26.4 실제 Safari + android-35 실제 Chrome 에서 실제 키보드·실제 시스템 백·실제 스와이프로 핵심 흐름 PASS.

**BACKEND E2E: 🟡 YELLOW**
공개 읽기(`/health`·`/subscription/plans`)는 **실백엔드로 확인**했으나 인증 이후 핵심 플로우는 NOT TESTED.

**PAYMENT: 🟡 YELLOW**
FE·BE·웹PG 는 9,900 으로 일치하고, 연간 오청구 가능성은 코드로 막았다. 다만 **스토어 콘솔의 실제 가격을 확인하지 못했다.**

**PHYSICAL DEVICE: NOT TESTED**

### OVERALL RELEASE READINESS: 🟡 **YELLOW**

모바일/반응형 자체는 이번 라운드로 닫혔다 — 시뮬레이터·에뮬레이터에서 실제 입력으로 P0/P1 을 0 으로
만들었고, 이번에 새로 찾은 **연간 오청구 가능성(P1)** 까지 고쳤으며 배포본이 그 수정을 담고 있음을
서빙 바이트로 확인했다. 그럼에도 GREEN 이 아닌 이유는 딱 둘이다 — **(1) 스토어 콘솔의 실제 구독
가격이 ₩9,900 인지 확인하지 못했고**(코드 밖이라 확인 불가, 아직 ₩6,900 이면 표시≠청구로 즉시
출시 차단), **(2) 로그인 이후의 핵심 플로우가 실서버로 한 번도 돌지 않았다**(CORS + 비밀번호 입력
제약). 이 둘은 검증 공백이지 알려진 결함은 아니며, 둘 다 사람이 5~10분이면 닫을 수 있다.

### 남은 일 (짧다)

1. **App Store Connect / Play Console** — `itdasy_membership_monthly_6900` 의 실제 가격이 **₩9,900** 인지 확인 ← 유일한 P1
2. 연간(₩99,000) 상품을 스토어에 등록할지 결정 (등록 전까지는 앱에서 안내 후 중단)
3. 테스트 계정으로 로그인해 예약·매출·고객·DM 한 바퀴 (실서버 E2E)
4. 아이폰 실기기 1대 — iOS 15 계열이면 입력칸 자동확대까지 같이 확인
