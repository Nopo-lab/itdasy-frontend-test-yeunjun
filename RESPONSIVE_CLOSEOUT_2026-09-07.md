# ITDASY — RESPONSIVE ABSOLUTE FINAL CERTIFICATION

**DATE**: 2026-09-07
**FE**: `83891ad` (origin/main · 배포 빌드 `20260907-1140-83891ad`)
**BE**: 미접속 (staging 이 localhost Origin 에 CORS 를 안 열고, 비밀번호 입력은 내가 못 함)
**DEPLOY**: `https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/` · Pages `34117761953` **success**

---

## ENVIRONMENT

**iOS Simulator** — 실제 부팅해서 **실제 Safari(WebKit)** 로 검증
- OS: iOS 26.4 (23E254a) / Device: QA-iPhone17 (402×874 pt)
- iOS Safari: **SIMULATOR PASS**
- ⚠️ 설치된 런타임이 **iOS 26.4 하나뿐** — iOS 15 런타임 없음

**Android Emulator** — 실제 부팅해서 **실제 Chrome + 실제 시스템 백** 으로 검증
- OS: android-35 (google_apis_playstore) / Device: AVD `itdasy_galaxy` (1080×1920)
- Android Chrome: **EMULATOR PASS**

**Desktop Chrome**: **PASS** (320~1920, 앞 라운드 실측)

> 뷰포트 리사이즈 에뮬레이션과 구분해서 적는다. 위 두 줄은 **실제 브라우저 엔진 + 실제
> 소프트웨어 키보드 + 실제 시스템 백/스와이프** 로 얻은 결과다. 실기기는 아니다.

---

## CORE RESULT

| 항목 | 판정 | 근거 |
|---|---|---|
| Responsive | **PASS** | 320~1920 overflow 0 · 안드로이드 landscape 재계산 정상 |
| Touch | **부분 PASS** | 시트 닫기 44px 확보 / 나머지 타깃 측정 불가(사유 아래) |
| Keyboard | **PASS** | iOS·안드로이드 실제 키보드로 입력·전송 버튼 접근 확인 |
| Modal | **PASS** | PC 클리핑 0 · 시트 4개 열고닫기 정상 |
| Scroll | **PASS** | 실제 스와이프 5회에도 배경 scrollY 불변 (아래 증거) |
| Back | **PASS** | **안드로이드 실제 시스템 백**으로 시트 4개 전부 닫힘 |
| Refresh | **PASS** | 유령 hash 자동 정리 · 시스템 hash 보존 |
| Safe Area | **PASS(시뮬레이터)** | Dynamic Island·홈 인디케이터 겹침 없음 |
| Orientation | **부분 PASS** | 안드로이드 세로↔가로↔세로 정상 / **iOS 미검증** |
| Media | **NOT TESTED** | 실 백엔드·실사진 파이프라인 미실행 |
| Error UX | **PASS** | 내부 오류 흡수 + 429 오분류 교정 실동작 확인 |
| Accessibility | **부분** | 닫기 버튼 44px / 나머지 미측정 |
| Performance | **NOT MEASURED** | 목킹 환경이라 수치가 무의미 |
| Regression | **PASS** | jest **329/329 · 23 suites** |

---

## BUG STATUS

| | 상태 |
|---|---|
| BUG-1 (iOS15 `:not()`) | **FIXED** — 배포본 확인. 단 iOS 15 런타임이 없어 **원래 실패 모드는 재현 못 함** |
| BUG-2 (시트 뒤로가기) | **FIXED** — 안드로이드 **실제 시스템 백**으로 4/4 검증 |
| BUG-3 (플랜 닫기 우회) | **FIXED** |
| BUG-4 (내부 오류 노출) | **FIXED** (+429/413 오분류 발견·수정) |
| BUG-5 (터치 타깃) | **부분 FIXED** — 닫기 버튼만. 나머지 REMAINING |
| BUG-6 (잇비 키보드) | **FIXED** — 실제 iOS 키보드로 재현·수정·재검증 |
| BUG-7 (유령 hash) | **FIXED** |
| BUG-8 (배경 스크롤) | **PASS** — 실제 스와이프로 검증 |
| BUG-9 (dark css 주석) | **P3** — 주석이라 파서가 안 읽음 |

---

## TEST EVIDENCE

### BUG-6 — 잇비 키보드 (이번 라운드의 핵심)

| | |
|---|---|
| Environment | iOS Simulator · QA-iPhone17 · iOS 26.4 · **실제 Safari** · 한글 키보드 |
| Route | 홈 잇비 입력창 (`.hv5-itbi-input-field`) |
| Action | 입력창 탭 → 소프트웨어 키보드 표시 → 계측 |
| Expected | 입력창이 키보드에 가리지 않는다 |
| **Actual** | 입력창 **VISIBLE** (WebKit 이 자동 스크롤). **가림 없음** |
| Result | **BUG-6 원래 가설(입력창 가림)은 재현되지 않음** |

**대신 다른 결함이 나왔다 — 키보드 높이 계산이 틀렸다.**

```
실측: innerH=696  vv.h=377  vv.top=337
기존 식: innerH - vv.h - vv.offsetTop = 696-377-337 = -18   → 보정 0 (안 걸림)
올바른 값: innerH - vv.h            = 696-377     = 319
결과: tabBarBottom = calc(14px + 0px + 0px)  ← 보정이 죽어 있었다
```
`vv.offsetTop` 은 키보드가 아니라 **iOS 가 페이지를 밀어올린 스크롤량**이라, 키보드가 뜨면
둘이 같이 커져 서로 상쇄된다. 그래서 `position:fixed` 인 `#bottomNavGroup`(탭바+잇비 FAB)이
보정을 못 받고 **화면 한가운데 떠서 잇비 입력창 위에 겹쳐 보였다**(스크린샷 확인).

**수정 후 재검증**

| Env | Action | Expected | Actual | Result |
|---|---|---|---|---|
| iOS Sim | 입력창 탭 → 키보드 ON | 탭바·FAB 안 보임 | FAB 사라짐, 입력창 VISIBLE | **PASS** |
| iOS Sim | 키보드 닫기 | 원복 | `vv.h` 696 복귀, FAB 복구 | **PASS** |
| Android | 키보드 ON | 입력·전송 접근 가능 | `kb-open=YES`, `navGroup hidden/0`, 입력·전송 VISIBLE | **PASS** |
| Android | 키보드 닫기 | 원복 | `kb-open=no`, `visible/1`, `tabBarBottom=14+24+0` | **PASS** |

**이중 보정 없음 확인**: 안드로이드에서 `--tab-bar-bottom` 은 예전과 같은 값(217px)이고,
숨김만 추가로 적용된다.

⚠️ **안드로이드 동작 변화(의도적, 공개)**: 예전엔 탭바를 키보드 위로 밀어올려 **보였고**,
이제는 **숨긴다.** 입력·전송 접근성은 실측으로 동일함을 확인했다.

### BUG-2 — 안드로이드 실제 시스템 백

| Env | Route | Action | Expected | Actual | Result |
|---|---|---|---|---|---|
| Android Emu · Chrome | 플랜(결제) | 열기 → `KEYCODE_BACK` | 시트만 닫힘 | 닫히고 홈 유지 | **PASS** |
| 〃 | 리뷰요청 | 〃 | 〃 | 닫히고 홈 유지 | **PASS** |
| 〃 | 리마인더 | 〃 | 〃 | `OPEN SHEETS:(none)` `hash=-` | **PASS** |
| 〃 | 데이터내보내기 | 〃 | 〃 | 닫히고 홈 유지 | **PASS** |

(브라우저 back 이 아니라 `adb shell input keyevent KEYCODE_BACK` = 실제 시스템 백)

### BUG-8 — 실제 손가락 스와이프

| | |
|---|---|
| Environment | Android Emulator · Chrome · `adb shell input swipe` (실입력) |
| Route | 대기자(waitlistSheet) 열린 상태 |
| Action | 배경 먼저 스크롤(scrollY=360) → 시트 열기 → 시트 위 스와이프 **5회** |
| Expected | 배경이 안 밀린다 |
| **Actual** | `BG scrollY = 360` → 스와이프 후 **`360` 그대로**, `body.overflow=hidden` 유지 |
| Result | **PASS (scroll bleed 없음)** |

> 앞 라운드에서 합성 wheel 이벤트로 했던 판정은 **대조군까지 "움직임"으로 나와 무효**였다.
> 이번엔 실입력으로 다시 했다.

### Orientation — Android

세로(scrollH=1068) → 가로(1077, 시트 재중앙정렬·가로 overflow 없음) → 세로(1068 복귀,
scrollY 360 유지, 잠금 유지). **stale layout 없음. PASS.**

### BUG-1 — 배포본 확인

배포 빌드 `20260907-1140-83891ad` 에서 curl 로 확인:
`css/tokens.css` 체인 `:not()` 1건(리스트형 잔존 1건은 **주석 122행**) · `style-home.css` 1 ·
`style-responsive.css` 2 · `style.css @import` 수동 범프 유지 · `sw.js CACHE_VERSION` 동기화.
iOS Safari(26.4)에서 로그인 입력칸 포커스 시 **자동 확대 없음** 확인.

---

## MODIFICATIONS (이번 라운드)

**BUG-6** · ROOT CAUSE: 키보드 높이 식에서 `vv.offsetTop`(스크롤량)을 빼서 상쇄 →
보정이 죽고 fixed 탭바가 입력창 위로 떠오름 ·
FIX: `innerHeight - vv.height` 로 교정 + `html.kb-open` 일 때 `#bottomNavGroup` 숨김 ·
FILES: `app-core.js` `style-components.css` `style.css`(@import 범프) ·
TEST: 5건 추가(실측값 잠금 포함) · DEVICE: iOS Sim + Android Emu · RESULT: **PASS**

곁다리: `itbi-starters.test.js` 가 `?v=20260816-chip-taparea` 문자열을 박아둬서 버전을
올리는 순간 깨졌다. 계약("자동범프 대상이 아니니 `?v=` 가 붙어 있어야 한다")으로 다시 썼다.

(앞 라운드 수정 BUG-1/2/3/4/5/7/8 은 `RESPONSIVE_RELEASE_AUDIT_2026-09-07.md` 참조)

---

## REMAINING

| 이슈 | Severity | Device | Route | Repro | Impact | 왜 안 고쳤나 |
|---|---|---|---|---|---|---|
| **iOS 15 실검증** | 정보 | iPhone iOS 15.x | 전역 | 입력칸 포커스 | BUG-1 의 **원래 실패 모드**를 재현 못 함 | 이 맥에 **iOS 15 런타임이 없다**(26.4 만 설치). 수정은 구조적 근거+26.4 로만 검증 |
| **iOS orientation** | P2 | iPhone | 전역 | 가로 회전 | 미검증 | 시뮬레이터 제어 도구에 회전 액션이 없음 |
| **잇비 전체화면 시트 + 키보드** | P2 | iPhone | 잇비 시트 | 시트 입력창 탭 | 미검증 | 시뮬레이터가 시트에서 소프트웨어 키보드를 다시 안 띄움(액세서리 바만). 홈 입력창으로는 검증됨 |
| **BUG-5 나머지 터치 타깃** | P2 | 모바일 | 홈·고객관리·설정 | — | 미측정 | 측정 3회 모두 오버레이(온보딩/오프라인 배너)에 오염 → 숫자를 신뢰할 수 없어 **보고하지 않음** |
| **실 백엔드 E2E** | — | 전부 | 로그인·결제·DM·발행 | — | NOT TESTED | staging 이 localhost CORS 미개방 + 비밀번호 입력 금지 |
| **실기기** | — | — | — | — | NOT TESTED | 물리 기기 없음 |
| 플랜 가격 표기 | 확인요망 | — | 플랜 팝업 | 팝업 열기 | 화면은 **월 9,900 / 연 99,000**, CLAUDE.md 는 **월 6,900 단일 멤버십(2026-07-22 확정)** | 반응형 범위 밖이라 손대지 않음. **어느 쪽이 정본인지 확인 필요** |
| 로컬 `main` 분기 | 운영 | — | — | `git log origin/main..HEAD` | 로컬 main 에 origin 과 **중복된 커밋**이 쌓여 있음 | 다른 세션 미푸시 커밋이 섞여 있어 내가 정리하면 안 됨. 내 커밋만 워크트리에서 cherry-pick 해 fast-forward 로 올림 |

---

## FINAL

**SIMULATOR / EMULATOR RELEASE GATE: 🟢 GREEN**

**PHYSICAL DEVICE: NOT TESTED**

**OVERALL RELEASE READINESS: 🟡 YELLOW**

시뮬레이터/에뮬레이터 게이트를 GREEN 으로 올린 근거: iOS 26.4 실제 Safari 와 android-35
실제 Chrome 에서 **실제 소프트웨어 키보드·실제 시스템 백·실제 손가락 스와이프**로 핵심 흐름을
돌려 P0/P1 을 0 으로 만들었고, 이번에 새로 찾은 키보드 보정 결함(BUG-6 계열)까지 원인을 짚어
고치고 양쪽 플랫폼에서 재검증했으며, 배포본(`20260907-1140-83891ad`)이 실제로 그 수정을
담고 있음을 서빙 바이트로 확인했고, 회귀 329/329 가 통과했다. 다만 **전체 출시 준비도는
YELLOW** 로 남긴다 — 물리 기기 검증이 0 이고, **iOS 15 런타임이 없어 BUG-1 의 원래 실패
모드를 끝내 재현하지 못했으며**, 실 백엔드 E2E(로그인·결제·DM·발행)가 통째로 미검증이기
때문이다. 시뮬레이터는 실기기의 근사치이지 대체재가 아니다.

### 물리 기기에서 마지막으로 볼 것 (짧다)

1. **iOS 15.x 아이폰 1대** — 로그인·예약 입력칸 포커스 시 자동 확대 없는지 (BUG-1 원래 실패 모드)
2. 아이폰 아무거나 — 잇비 **전체화면 시트** 입력창 + 키보드, 그리고 가로 회전
3. 안드로이드 실기기 — 시트 위 스와이프 체감(에뮬레이터는 PASS)
4. 플랜 가격 표기(9,900 vs 6,900) 정본 확인 — 반응형과 무관하지만 결제 화면이라 남김
