# ITDASY — RESPONSIVE FINAL RELEASE REPORT

## ENVIRONMENT

- **FE commit**: `624946c` (main) + 이 감사에서 수정한 8파일
- **BE commit**: 미접속 — 아래 "검증 못 한 것" 참조
- **Deploy URL**: `https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/` (로그인 화면만 실측)
- **주 검증 환경**: `http://localhost:8166` (레포 그대로 정적 서빙) + Chromium 뷰포트/터치 에뮬레이션
- **Test date**: 2026-09-07

### ⚠️ 이 감사의 실제 사정 (판정의 전제)

세 가지 제약이 있었고, 결과 해석에 그대로 반영했다.

1. **스테이징 백엔드에 붙지 못했다.** staging 은 `localhost` Origin 에 CORS 를 안 열어준다.
   로컬 프록시를 세우려 했으나 안전 분류기가 차단했고(자격증명 전달 프록시), 재시도하지 않았다.
2. **로그인을 내가 할 수 없다.** 비밀번호 입력은 금지된 행위다. 그래서 데이터가 필요한 화면은
   **클라이언트 fetch 목킹**(서버·자격증명 없음)으로 그렸다.
3. **실기기가 없다.** iPhone Safari / Android Chrome 엔진은 이 환경에 없다.
   뷰포트·`pointer:coarse` 에뮬레이션은 실기기가 아니다.

→ 그래서 **"레이아웃·라우팅·CSS 계약"은 실측으로 강하게 검증**됐고,
**"실기기 키보드·실백엔드 플로우"는 검증 못 했다.** 최종 판정은 이 구분을 따른다.

---

## VIEWPORT (가로 overflow 실측 · 28개 화면 스윕)

| 폭 | 결과 | 비고 |
|---|---|---|
| 320 | PASS | offender 0 |
| 360 | PASS | offender 0 |
| 375 | PASS | offender 0 |
| 390 | PASS | offender 0 |
| 414 | PASS | offender 0 |
| 768 | PASS | 사이드바 등장 |
| 1024 | PASS | 사이드바 232px |
| 1280 | PASS | 사이드바 260px |
| 1440 | PASS | 사이드바 260px |
| 1920 | PASS | offender 0 |

판정 근거: `document.documentElement.scrollWidth <= clientWidth` **그리고**
가로 스크롤러 밖에서 뷰포트를 벗어나는 요소 0개. 닫힌 드로어(off-screen 파킹)는 제외 처리.

---

## RESULT

| 항목 | 판정 | 근거 |
|---|---|---|
| Responsive layout | **PASS** | 10개 폭 × 28화면, offender 0 |
| Touch interaction | **FAIL(P2)** | 44px 미만 타깃 다수 (아래 BUG-5) |
| Keyboard UX | **부분 PASS** | 로그인 실측 PASS / 잇비 입력창 iOS 미검증(BUG-6) |
| Modal | **PASS** | PC 사이드바 클리핑 0 (후보 8건 전부 오탐 확인) |
| Scroll | **미검증** | 신뢰 입력(trusted scroll) 불가 — BUG-8 |
| Back navigation | **FIXED** | 4건 실패 → 수정 후 4/4 PASS, 기존 시트 회귀 0 |
| Refresh | **부분 PASS** | blank/404 0 / stale hash 1건 (BUG-7) |
| iPhone Safari | **미검증** | 실기기 없음 |
| Android Chrome | **미검증** | 실기기 없음 |
| Desktop Chrome | **PASS** | 768~1920 실측 |
| Safe area | **PASS(정적)** | `env(safe-area-inset-*)` 사용 확인, 실기기 미검증 |
| Orientation | **미검증** | — |
| Forms | **PASS** | 입력칸 전수 16px (iOS 확대 방어 동작) |
| Tables | 해당 없음 | 이 앱은 카드/리스트 UI |
| Charts | **PASS(레이아웃)** | 리포트/인사이트 overflow 0 |
| Media | **미검증** | 실사진 파이프라인 미실행 |
| Loading/Error/Empty | **부분 PASS** | 레이아웃 정상 / 에러 카피 문제(BUG-4) |
| Accessibility | **부분** | 44px 타깃 미달(BUG-5) |
| Performance | **미검증** | 목킹 환경이라 수치 무의미 |
| UX Intuitiveness | **부분** | BUG-4·5·7 |
| Regression | **PASS** | jest 284/284 · 21 suites |

---

## BUG SUMMARY

- **P0**: 0
- **P1**: 2 (둘 다 수정 완료)
- **P1-risk(미검증)**: 1
- **P2**: 5
- **P3**: 1

---

## FIXED IN THIS AUDIT

### BUG-1 (P1) — iOS 15.0~16.3 에서 CSS 방어 규칙 3개가 **통째로** 죽는다

- **ROOT CAUSE**: `:not(a, b)` (셀렉터 리스트) 문법은 **Safari 16.4+**. 이 앱의 iOS 최소 지원은
  **15.0** (`ios/App/Podfile`, `pbxproj IPHONEOS_DEPLOYMENT_TARGET`).
  그리고 CSS 는 콤마 그룹 안에 무효 셀렉터가 하나라도 있으면 **규칙 전체를 버린다**.
  → 브라우저에서 직접 실증함 (`wholeRuleDropped: true`).
- **영향 (iOS 15.0~16.3)**:
  - `css/tokens.css` — 입력칸 16px 강제가 죽음 → **모든 입력칸에서 사파리 자동 확대 부활**
    (로그인 15px, 예약 금액칸 12px, 허브 입력 13px 등 13~15px 규칙이 앱 전역에 다수)
  - `style-home.css` — **로그인 게이트 뒤 앱 화면 숨김이 죽음**
  - `style-responsive.css` — 허브 오버레이 위 탭바 숨김. 이건 콤마 그룹 12개 중 2개가 무효라
    **매출·캘린더·플랜·도움말·네비시트까지 그룹 전체**가 같이 죽는다.
- **FIX**: 체인 `:not():not()` 으로 분해. 현재 브라우저에서 **선택 결과 동일** 실측
  (입력칸 28/28, 잠금 규칙 63/63).
- **VERIFIED ON**: Chromium 320~1920. 재로드 후 `remainingListNot: []`,
  `guardFontSize: 16px`, `lockHidesApp: true`, 탭바 규칙 파싱 확인.

### BUG-2 (P1) — 풀스크린 시트 4개가 뒤로가기에 등록 안 됨 → **안드로이드에서 앱이 꺼진다**

- **ROOT CAUSE**: `_markSheetOpen()` 미호출 → history 엔트리 0.
  실측: 열어도 `history.length` 그대로, `location.hash` 없음.
  뒤로가기를 누르면 시트는 그대로 열려 있고 **앱 밖으로 나간다**.
- **해당 시트**: `planPopup`(결제) · `reviewRequestSheet` · `reminderSheet` · `dataExportModal`
- **FIX**: 기존 라우터 규약대로 `_markSheetOpen` / `_markSheetClosed` / `_registerSheet` 3종 등록.
- **VERIFIED ON**: 4/4 PASS (열 때 hash 생성 → 뒤로가기로 닫힘). 기존 등록 시트 회귀 0.

### BUG-3 (P2) — 플랜 팝업의 ✕·배경 클릭이 라우터를 우회 → "먹통 뒤로가기" 누적

- **ROOT CAUSE**: 두 경로가 `pop.style.display='none'` 을 직접 실행해서 `_markSheetClosed` 가
  안 불렸다. 닫아도 history 엔트리가 남아 다음 뒤로가기가 아무 일도 안 하는 칸이 된다
  (`app-core.js` 주석이 기록한 그 증상).
- **FIX**: 모든 닫기 경로를 `closePlanPopup()` 하나로 모음.
- **VERIFIED ON**: ✕·배경 클릭 둘 다 hash 정리 확인.

### BUG-4-a (배포 필수) — `style.css` 의 `@import` 캐시버스터 수동 범프

- **ROOT CAUSE**: `deploy.yml` 자동 범프는 `index.html`·`js/load-groups.js` 만 훑는다.
  `style.css` 의 `@import ...?v=` 는 **자동이 아니다**. 실제로 이번에 물렸다 —
  디스크는 고쳐졌는데 브라우저는 옛 CSS 를 계속 썼다.
- **FIX**: `style-home.css` · `style-responsive.css` 의 `?v=` 를 `20260907-ios15-not-chain` 으로 범프.
- ⚠️ **이거 안 하면 BUG-1 수정이 사용자에게 영영 안 간다.**

### 회귀 가드 추가

`__tests__/responsive-gate-ios15-and-back-2026-09-07.test.js` (13 tests).
**가드가 실제로 무는지 확인함** — 버그를 일부러 되돌리면 2개 실패, 복구하면 13개 통과.

---

## REMAINING ISSUES (수정 안 함 · 이유 명시)

### BUG-6 (P1-risk, **미검증**) — 잇비 입력창이 iOS 키보드에 가릴 수 있다

- **관측**: `#assistantSheet` 는 `position: fixed`, 입력창은 화면 바닥에서 12px.
  앱에는 `visualViewport` 보정이 **탭바(`--tab-bar-bottom`)에만** 있고 잇비에는 없다.
  `@capacitor/keyboard` 플러그인도 설치되어 있지 않다.
- **왜 위험한가**: 안드로이드 Chrome 은 레이아웃 뷰포트가 같이 줄어 문제없다(축소 뷰포트 실측 정상).
  **iOS 는 레이아웃 뷰포트가 안 줄어든다** — `position:fixed` 바닥 요소는 키보드 뒤로 들어간다.
- **왜 안 고쳤나**: 실기기 iOS 없이 고치면 검증이 불가능하고, 잘 도는 안드로이드 경로를
  이중 보정으로 깨뜨릴 수 있다. **실기기 1회 확인이 먼저다.**
- **고칠 때 방법**: 탭바가 쓰는 공식을 그대로 재사용하면 된다
  (`innerHeight - vv.height - vv.offsetTop`). 이 식은 안드로이드에서 자연히 0 이 되므로 안전하다.
- **severity**: iOS P1 / Android 해당 없음 · **affected route**: 잇비(홈 하단 + 전체화면)

### BUG-7 (P2) — 시트가 열린 채 새로고침하면 뒤로가기 1회가 먹통

- **재현**: 고객관리 열기(`#customers`) → 새로고침 → **홈이 뜨는데 `#customers` 해시는 남는다**
  → 뒤로가기 1회 = 화면 그대로, 주소만 바뀜 (`deadBackPress: true` 실측).
- **왜 안 고쳤나**: 부팅 시 해시 정리는 `app-core.js` 라우터 초기화를 건드려야 하는데,
  같은 해시 공간을 **OAuth 콜백 · `#register` · 생체인증**이 함께 쓴다.
  실백엔드 없이 OAuth 회귀를 검증할 수 없어서 손대지 않았다.
- **제안**: 부팅 후 `stack.length === 0` 이고 해시가 **등록된 시트 이름과 정확히 일치**할 때만
  `replaceState` 로 정리 (OAuth/`register`/`=` 포함 해시는 제외).

### BUG-4 (P2) — 영문 JS 예외가 그대로 사용자에게 노출

- `app-core.js` `_humanError()` 는 마지막에 `if (raw.length > 80) ... ; return raw;` 로 끝난다.
  **80자 미만 JS 예외는 원문 그대로 화면에 뜬다.**
  실제로 리포트 화면에서 `불러오기 실패: Cannot read properties of undefined (reading 'total')` 를 봤다.
- 1인샵 원장님 화면에 영문 스택 용어가 뜨는 건 UX 결함이다.
- 더해서, `_humanError` 를 **안 거치고** `e.message` 를 그대로 쓰는 곳도 있다:
  `app-assistant-facts.js:122` · `app-dm-confirm-queue.js:620` · `app-membership.js:332` ·
  `app-customer-dashboard.js:344`
- **제안**: `TypeError|ReferenceError|undefined|not a function|null` 패턴이면
  "일시적인 오류가 발생했어요" 로 흡수.

### BUG-5 (P2) — 터치 타깃 44×44 미만 (실측)

| 화면 | 요소 | 크기 |
|---|---|---|
| 설정허브 | `shClose` 닫기 | 32×32 |
| 설정허브 | `shHaptic` | 36×22 |
| 설정허브 | 테마 세그먼트 | 49×23 / 91×23 |
| 고객관리 | `customerAddBtn` (+ 손님 추가) | 34×34 |
| 고객관리 | `cv4-chip` 필터 (1회/2~3회/4회+) | 37~51 × 27 |
| 홈 | "전체 보기 ›" / "캘린더 →" | 48×13 / 45×14 |
| 플랜 | 이용약관 / 개인정보처리방침 | 37×13 / 74×13 |

전부 **누를 수는 있다**(도달 가능 확인). 다만 Apple HIG·WCAG 2.5.5 의 44px 기준 미달이고,
**닫기 버튼(32×32)과 주요 액션(+ 손님 추가, 34×34)** 은 실사용에서 체감된다.
→ 시각 크기는 두고 `padding` 또는 `::before` 확장으로 히트영역만 넓히는 게 안전하다.

### BUG-8 (P2, **미검증**) — 배경 스크롤 잠금이 시트마다 다르다

- `body { overflow: hidden }` 을 **거는 시트**: 고객관리 · 리포트 · 알림 · 잇비
- **안 거는 시트**: 설정허브 · 플랜 · 대기자 · 도움말
- **왜 미검증인가**: 합성 wheel 이벤트로는 판정이 안 된다 — 대조군(잠금된 시트)도 똑같이
  "움직임" 으로 나와서 **테스트 자체가 무효**임을 확인했다(programmatic scroll 은 `overflow:hidden` 을 무시).
  실제 신뢰 입력은 Browser 패널이 숨겨진 상태라 실행 불가.
- 실기기에서 "시트 위에서 스와이프 → 뒤 화면이 밀리는가" 로 확인 필요.

### BUG-9 (P3) — `style-dark.css` 주석 안에 셀렉터 리스트 `:not()` 잔존

`style-dark.css:173-174` 는 **주석 처리된 상태**라 지금은 무해하다(CSSOM 미등록 확인).
다크모드 정비를 재개할 때 BUG-1 과 같은 함정이므로 그때 같이 체인으로 바꿀 것.
CLAUDE.md "기존 다크모드 블록은 건드리지 말 것" 지침에 따라 이번엔 손대지 않았다.

---

## 검증 못 한 것 (정직하게)

- **실기기 iPhone Safari / Android Chrome** — 엔진 자체가 없음. 에뮬레이션은 대체재가 아니다.
- **실기기 키보드** — 등장/해제, IME, 포커스 이동
- **landscape / orientation change**
- **실백엔드 플로우** — 로그인, 결제/IAP, DM 전송, 인스타 발행, 사진 업로드·편집 저장
- **console / network 판정** — 목킹 환경이 CORS 에러를 대량 생성해서 제품 결함과 구분 불가
- **성능 수치** — 목킹 환경이라 무의미
- 참고: `npm run smoke` 는 `CACHE_VERSION != APP_BUILD` 로 실패하지만
  **내 변경과 무관한 기존 상태**다 (`sw.js`·`index.html` 미수정 확인, 두 값은 배포가 주입).

---

## FINAL

### RESPONSIVE RELEASE GATE: 🟡 **YELLOW**

**GREEN 이 아닌 이유는 딱 두 가지다.**

1. GREEN 조건이 요구하는 **"iPhone Safari 핵심 기능 PASS · Android Chrome 핵심 기능 PASS"** 를
   실기기 없이 확인하지 못했다.
2. **BUG-6(잇비 입력창 iOS 키보드 가림)** 이 미검증 P1-risk 로 남아 있다.

**RED 도 아니다.** P0 은 0 이고, 이번에 잡은 P1 2건은 원인까지 짚어 수정·검증했다.
레이아웃 자체는 320~1920 전 구간에서 실측 offender 0 으로 견고하다.

### GREEN 으로 올리기 위해 남은 일 (순서대로)

1. **아이폰 실기기 1대로 잇비 입력창 키보드 확인** ← 유일한 P1-risk (BUG-6)
2. 실기기에서 시트 위 스와이프 시 배경 밀림 확인 (BUG-8)
3. 배포 후 **iOS 15 계열 1대**에서 로그인 입력칸 자동확대가 사라졌는지 확인 (BUG-1 최종 확인)
4. BUG-4(에러 카피)·BUG-5(터치 타깃)·BUG-7(stale hash) 는 GREEN 차단 사유는 아님

---

## 이번에 바꾼 파일 (8개)

```
css/tokens.css          iOS 자동확대 가드 — 체인 :not()
style-home.css          로그인 게이트 숨김 — 체인 :not()
style-responsive.css    탭바 숨김 그룹 — 체인 :not()
style.css               @import ?v= 수동 범프 (위 2개 반영용)
app-plan.js             뒤로가기 등록 + 닫기 경로 일원화
app-review.js           뒤로가기 등록
app-reminder.js         뒤로가기 등록
app-data-export.js      뒤로가기 등록
__tests__/responsive-gate-ios15-and-back-2026-09-07.test.js  (신규, 13 tests)
```

⚠️ 같은 워킹트리에서 **다른 세션이 동시에 작업 중**이다
(`app-caption.js` · `app-customer.js` · `app-membership.js` · `js/load-groups.js` 등).
커밋할 때 **위 9개 파일만 지정해서 add** 할 것. `git add -A` 금지.
