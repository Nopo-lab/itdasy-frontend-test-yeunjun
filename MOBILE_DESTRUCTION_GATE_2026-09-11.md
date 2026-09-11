# ITDASY — ABSOLUTE MOBILE / EVERY-BUTTON DESTRUCTION GATE

**DATE** 2026-09-11 · **BRANCH** `feat/responsive-alldevice` (`795a039` → `ab26a01` → `ed8429d` → `dd64079` → 이 커밋)
**대상** 워크트리 실파일. 시뮬레이터/에뮬레이터의 **진짜 Safari(WebKit)·진짜 Chrome(Blink)** 이 로드.
**앞 보고서** `RESPONSIVE_ALLDEVICE_AUDIT_2026-09-11.md` · `RESPONSIVE_REALDEVICE_CLOSEOUT_2026-09-11.md`

---

## 0. 이번 라운드가 한 일 — "보이나" 가 아니라 "정확히 그게 눌리나"

이전 라운드는 레이아웃(넘침·잘림·가림)을 봤다. 이번엔 **조작**을 봤다.

핵심 판정 규칙 두 개를 동시에 만족해야 통과로 셌다.

```
① 모든 조작요소의 '자기 영역' 안 5점이 전부 자기에게 온다   (= 안 눌리는 버튼 0)
② 그 어떤 점도 옆 버튼에게 가지 않는다                      (= 엉뚱한 게 눌리는 일 0)
```

②는 ①을 위해 히트영역을 넓히다 생긴다. 실제로 **이번 라운드에서 내가 그 실수를 한 번 냈고,
감사가 잡아서 되돌렸다**(§4 R11).

---

## 1. 조작요소 인벤토리 — 런타임 수집

셀렉터만 보면 `addEventListener` 로만 살아 있는 요소를 놓친다. 그래서 에이전트가
**앱 스크립트보다 먼저** `EventTarget.prototype.addEventListener` 를 감싸서,
`click/pointerdown/pointerup/touchstart/touchend/mousedown/mouseup/change/input` 이 붙는
요소에 `data-qa-ev` 를 찍는다. 인벤토리 = 표준 셀렉터 ∪ 런타임 태깅.

| | |
|---|---|
| `TOTAL_INTERACTIVE_ELEMENTS` (한 화면 최대) | **439** (PWA, 오버레이 누적 상태) |
| 화면당 전형값 | 224 ~ 300 |
| 그중 **보이고 활성** (live) 누적 | **4,166** |
| 뷰포트 안에 온전히 들어와 정밀 검사한 것 | 화면당 15 ~ 485 |

---

## 2. 커버리지 숫자

```
TOTAL_ROUTES                 16  (주요 화면 15 + 사진편집기)
TOTAL_STATES                  9  (기본 · 긴콘텐츠(고객40·예약40·긴이름/메모) · 빈상태 ·
                                  오버레이 3겹 · 키보드 열림 · 스크롤 중(최대 8스텝) ·
                                  회전 · PWA standalone · 비활성(dim/pointer-events:none))
TOTAL_INTERACTIVE_ELEMENTS  439  (한 화면 최대) / live 누적 4,166
TOTAL_DEVICE_CONFIGURATIONS   9  (아래 §6 표)
TOTAL_BUTTON_TESTS       40,455  (= 자기영역 5점 hit-test 총 횟수)
TOTAL_BOUNDARY_TESTS     40,455  (중심 + 상하좌우 가장자리. 모서리는 의도적 제외 — §7)
TOTAL_SYSTEM_GESTURE_TESTS   15  (안드 시스템백 11 · 안드 HOME+복귀 1 · iOS 엣지백 1 ·
                                  iOS 홈 제스처+복귀 1 · 회전 전환 3기기)
TOTAL_KEYBOARD_TESTS          2  (iOS·안드 각각 포커스→한글입력→닫기→복구 풀사이클)
TOTAL_ORIENTATION_TESTS       3  (iPhone·iPad·Galaxy 각 세로↔가로↔세로)
TOTAL_OVERLAY_TESTS         139  (화면별 오버레이 개폐 136 + 3겹 쌓기 LIFO 1 + 백 3연타 2)
TOTAL_DOUBLE_TAP_TESTS       13  (실제 손가락 연타 2 + 핸들러 동일틱 2회 클릭 11)
TOTAL_ERRORS                  0  (console.error / uncaught / unhandledrejection)
TOTAL_FAILS                   5  (이번 라운드 신규 발견 — 전부 수정·재검증)
TOTAL_FIXED                   5
TOTAL_NOT_TESTED              6  (§8)
```

**총 136 화면-감사 · 40,455 hit-test · WRONG 0 · BLOCK 0 · ABSORBED 0 · OVERLAP 0 · SAFE-AREA 침범 0 · JS에러 0**

---

## 3. 구성별 결과 (전부 최종 코드)

| config | viewport | screens | hit-test | WRONG | BLOCK | ABS | OVL | SAFE | ERR |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| iPhone Safari 세로 | 402×714 | 15 | 4,390 | 0 | 0 | 0 | 0 | 0 | 0 |
| iPhone Safari 가로 | 874×292 | 15 | 3,640 | 0 | 0 | 0 | 0 | 0 | 0 |
| **iPhone PWA standalone** | 402×812 | 16 | 10,165 | 0 | 0 | 0 | 0 | 0 | 0 |
| Galaxy Chrome 세로 | 411×786 | 15 | 5,610 | 0 | 0 | 0 | 0 | 0 | 0 |
| Galaxy Chrome 가로 | 842×331 | 15 | 3,695 | 0 | 0 | 0 | 0 | 0 | 0 |
| iPad Safari 세로 | 820×1048 | 15 | 4,610 | 0 | 0 | 0 | 0 | 0 | 0 |
| iPad Safari 가로 | 1180×688 | 15 | 4,215 | 0 | 0 | 0 | 0 | 0 | 0 |
| Desktop Chrome | 1280×800 | 15 | 2,065 | 0 | 0 | 0 | 0 | — | 0 |
| Desktop Chrome | 1920×1080 | 15 | 2,065 | 0 | 0 | 0 | 0 | — | 0 |

---

## 4. 이번 라운드에 찾은 결함 — 5건, 전부 수정·재검증

### R8 (P1) — 고객 행 오른쪽 끝을 누르면 **자음 인덱스가 눌렸다**

```
Device/OS/Browser  iPhone 17 시뮬 · iOS 26.4 · 실제 Safari (Galaxy Chrome 에서도 동일)
Viewport           402×714 세로 / 874×292 가로
Route              고객관리
Action             고객 행의 오른쪽 끝 2px·6px 지점을 hit-test
Observed           행이 아니라 `span[data-jump="ㄴ"]`(가나다 인덱스)가 잡힘.
                   가로에서는 **검색창** 오른쪽 끝도 같은 증상 + 인덱스바 박스가 2px 로
                   찌그러지고 자음 11개(20px×11=220px)가 흘러나와 검색창 위에 얹힘
Expected           행 영역 안은 전부 행이 받는다
Root Cause         본문 border-box 는 16~386, 인덱스바는 padding 박스 기준 right:0 → 376~402.
                   `.c-row{padding-right:26px}` 로 막은 줄 알았지만 **padding 은 박스를 안 줄인다**
Fix                ① 인덱스바가 보이는 높이(>430px)에서만 통계·칩·리스트에 오른쪽 홈통 10px,
                     검색창은 inline `width:100%` 라 `max-width: calc(100% - 10px)`
                   ② 짧은 화면(<=430px, 폰 가로)에서는 인덱스바 자체를 접는다(칸이 20px 라 못 누름)
                   ⚠️ @media 는 `.idx-bar` 기본 규칙 **뒤**에 — 앞에 넣었더니 display:none 이 무시됨
Same-condition     행 우단 376 = 바 좌단 376(겹침 0) · 오른쪽 끝 2/6/12px 전부 행이 잡힘
Adjacent/Regression 가로 874×292 겹침 0 · 44px 미달 11종(자음) 소멸 · 전 구성 WRONG 0
Status             FIXED `ab26a01`
```

### R9 (P2) — 실기기 파괴검증에서 남은 조작 버튼 5종이 44px 미달

`.ms-foot > button`(고객센터·로그아웃 61×27) · `.rvcal-add`(+ 이 날 매출 입력 323×38) ·
`.ss-action`(하위화면 저장 52×35) · `.sv2-pill`(연동하기 64×26) · `.wf-seg`/`.wf-perf`(작업실 필터 34)
→ 전부 **세로만** 44 로 확장(가로는 이미 충분, 옆 버튼을 안 뺏는다).

🔑 작업실 필터칩은 `::after` 를 붙여도 **34 그대로**였다 — 칩 줄이 `overflow-x:auto` 라
**세로도 같이 잘린다.** 스크롤 래퍼에 `padding:5px 0; margin:-5px 0` 을 줘서 확장이 안 잘리게 했다.
(CSS 만 읽으면 44 로 보인다. 실기기 실측으로만 드러나는 실패다.) — `ed8429d`

### R10 (P2) — 시트 마지막 행이 안드로이드 제스처 바에 2px 걸침

`.ms-sheet__body` 는 내용이 짧아 스크롤이 없을 때 마지막 행이 하단 제스처 영역에 물렸다
(Galaxy 실측 bottom 764 > 한계 762). 스크롤로 피할 수도 없다 →
하단 패딩에 `env(safe-area-inset-bottom)` 을 더했다. — `ed8429d`

### R11 (P1) — **아이패드는 PC 사이드바를 손가락으로 누른다**

```
Device   iPad Air 11 · 실제 Safari · 820×1048 / 1180×688
Observed .ms-side__item(홈·예약·고객·매출·DM·댓글·연결·샵관리·플랜) 203×**38**
         .ms-side__fab(작업실) 39 · 로그아웃 30 · 고객센터 34
         .bk-pc__nav-btn(PC 달력 이전/다음 달) **30×30** ← 원장이 매일 누른다
         .ms-chart__link(매출관리 →) 69×22 · .bk-pc__add-btn(+ 예약 추가) 87×33
Root     "PC 사이드바 = 마우스" 라는 전제. 태블릿은 PC 셸을 쓰면서 손가락으로 누른다.
Fix      사이드바 항목 padding 9→12px(=44) · 나머지는 ::after 확장(세로 또는 44×44)
Status   FIXED `dd64079` + 이 커밋
```

### R12 (P1) — **내가 넣은 수정이 '엉뚱한 버튼' 을 만들었다 → 되돌림**

미니 달력의 `이전/다음`(22×22)에 44×44 를 주자마자 감사가 **WRONG 1** 을 뱉었다 —
`다음` 의 확장 영역이 `이전` 의 **자기 영역**을 먹었다(실측: 이전 버튼 중심 좌측 지점이 '다음' 에 잡힘).
→ **되돌렸다.** 22×22 로 두고, 같은 화면의 주 조작인 `.bk-pc__nav-btn`(월 이동)만 44 로 확보.

> 숫자(44)를 채우는 것보다 **엉뚱한 게 안 눌리는 것**이 우선이라는 규칙을,
> 내 손으로 어긴 뒤 감사에 잡혀서 되돌린 사례다. 이 라운드에서 가장 값어치 있는 한 건.

---

## 5. 시스템 제스처 · 키보드 · 상태

### 5-1. 안드로이드 시스템 BACK (실제 `keyevent 4`)

11개 상태에서 수행. **10/10 오버레이가 정확히 닫히고, 앱은 살아서 포그라운드 유지, 스크롤락 해제.**
(workshop 은 오버레이가 아닌 탭이라 닫을 것이 없음 — 결함 아님)

| 상태 | BACK 결과 |
|---|---|
| 예약·고객·매출·DM·댓글·연결·샵관리·플랜·잇비·회원권·고객센터 | 해당 오버레이만 닫힘 · `focus=chrome` 유지 · `body overflow` 복구 |

🔑 **여기서 오판할 뻔했다.** 처음엔 "BACK 한 번에 앱이 홈으로 나간다"로 보였다.
원인은 제품이 아니라 **Chrome 탭이 쌓인 것**(`am start` 가 매번 새 탭 → 첫 엔트리에서 BACK = 탭 닫힘).
`--es com.android.browser.application_id com.android.chrome` 로 같은 탭을 재사용하니 정상이었다.
또 **웹 콘텐츠에 포커스가 없으면 BACK 이 페이지에 도달하지 않는다** — 탭을 한 번 준 뒤 눌러야 한다.

### 5-2. 오버레이 3겹 쌓기 → LIFO 닫힘

고객시트 → 플랜팝업 → 고객센터 3겹을 만들고 BACK 3연타:

```
열림  overlays[customerSheet, planPopup, supportChatModal]  stack[customers, plan, supportChat]  hash #supportChat  body overflow: hidden
BACK1 supportChat 닫힘  hash #plan       stack 2
BACK2 plan 닫힘         hash #customers  stack 1
BACK3 customer 닫힘     hash ''          stack 0   → body overflow: hidden auto (스크롤락 해제)
```
**완전한 LIFO · 배경 스크롤 0(scrollY 불변) · click-through 없음 · 유령 오버레이 없음.**

### 5-3. iOS 제스처

| 제스처 | 결과 |
|---|---|
| **왼쪽 엣지 스와이프(Safari back)** — 고객시트 열린 상태 | popstate **1회** · 시트 닫힘 · hash 비워짐 · **같은 페이지 유지**(앱 밖으로 안 나감) · 스크롤락 해제 · 이중 내비 없음 |
| **하단 홈 제스처** — 예약 달력 열린 상태 | 홈으로 나감 → 복귀 시 `#booking` · 달력 그대로 열림 · 뷰포트 402×714 복구 · 에러 0 |

### 5-4. 앱 복귀 (Android HOME → 복귀)

고객시트 + 검색어 "김" + 필터 3행 상태에서 HOME → 복귀:
**hash·검색어·시트·행수·앱 생존 전부 그대로, 에러 0.**

### 5-5. 소프트 키보드 (실제 한글 키보드, 양쪽 엔진)

| | iOS 26.4 Safari | Android Chrome |
|---|---|---|
| 키보드 높이(실측) | **337px** | **312px** |
| 입력창 가림 | 없음 | 없음 |
| `kb-open` / 하단 탭바 | 적용 / `visibility:hidden` | 적용 / `visibility:hidden` |
| 실제 타이핑 | 한글 `ㅛㄱ` | `kim` |
| 닫은 뒤 복구 | vv 714 · 탭바 복구 · `--tab-bar-bottom` 원복 | vv 787 · 동일 |
| **`(height>=600px)` 미디어쿼리** | **true 유지** | **true 유지** |

🔑 마지막 줄이 핵심이다 — PC/모바일 셸을 높이로 가르므로, 키보드가 그 값을 흔들면
**타이핑 중에 셸이 바뀐다.** 두 엔진 모두 키보드는 visual viewport 만 줄인다(레이아웃 뷰포트 불변).

### 5-6. 연타 / 중복 실행

| 방식 | 대상 | 결과 |
|---|---|---|
| **실제 손가락 2연타**(adb, 간격 ~60ms) | DM 설정 **저장** | `PUT /shop/dm-menu` **정확히 1회** |
| **실제 손가락 2연타** | 잇비 **전송** | 사용자 메시지 **1개**, 입력창 비워짐 |
| **실제 손가락 3연타** | 하단 탭바 '내 샵 관리' | 탭 1회 전환 · 스크롤 점프 없음 · 에러 0 |
| 같은 틱에 `click()` 2회 | 저장·추가·충전 등 11개 | 중복 mutation **0건** |

### 5-7. safe-area (PWA standalone 실측)

`navigator.standalone = true` · `env(safe-area-inset-bottom) = **34px**` ·
하단 탭바/FAB 아래 여백 **48px = 34 + 14** → 홈 인디케이터와 겹침 0 ·
`--tab-bar-bottom` 이 실제로 34 를 소비. 가로에서는 20px 로 잡히고 역시 겹침 0.
**고정 UI 중 제스처 영역을 침범하는 것 0건**(전 구성 SAFE=0).

### 5-8. 사진편집기 (실기기 · 실제 제스처)

| | |
|---|---|
| 열림 / 스테이지 | 402×503 (4:5 유지) · 페이지 가로 넘침 0 |
| 보이는 조작 14개 | 유효 히트박스 **전부 44×44** · 가려짐 0 |
| 실제 탭 | 우측 레일 **T** → 텍스트 레이어 `내용을 입력하세요` 생성 |
| **두 손가락 핀치** | `matrix(4,0,0,4,0,0)` = **4배 확대 정상** · 에러 0 |
| **한 손가락 드래그** | 정상 · 넘침 0 · 에러 0 |
| 핀치/드래그 **후** 전체 감사 | **WRONG 0 · BLOCK 0 · 44px 미달 0** (4배 확대 상태에서도 모든 조작 정확) |

---

## 6. Device-class 판정 (§42) — 하나를 다른 것으로 대체하지 않는다

| Device | Engine | Portrait | Landscape | Keyboard | Safe Area | System Back/Home | Every Button | Result |
|---|---|---|---|---|---|---|---|---|
| iPhone | Safari (WebKit) | PASS | PASS | PASS | PASS(브라우저 0, PWA 34) | PASS(엣지백·홈) | PASS 8,030점 | **PASS** |
| iPhone PWA | WKWebView | PASS | NOT TESTED | (Safari 와 동일 엔진) | **PASS 34px** | PASS(홈 제스처) | PASS 10,165점 | **PASS(세로)** |
| Galaxy | Chrome (Blink) | PASS | PASS | PASS | PASS(24px) | **PASS 시스템백 10/10** | PASS 9,305점 | **PASS** |
| Android Phone(일반) | Chrome | = Galaxy AVD | = Galaxy AVD | = | = | = | = | **동일 구성으로 대체 — 별도 기기 NOT TESTED** |
| iPad | Safari | PASS | PASS | NOT TESTED | PASS | NOT TESTED | PASS 8,825점 | **PASS(버튼·레이아웃)** |
| Android Tablet | Chrome | NOT TESTED | NOT TESTED | — | — | — | — | **NOT TESTED** |
| Desktop Safari | WebKit | **NOT TESTED** | — | — | N/A | N/A | **NOT TESTED** | **NOT TESTED** |
| Desktop Chrome | Blink | PASS 1280·1920 | — | — | N/A | N/A | PASS 4,130점 | **PASS** |

> `Android Phone(일반)` 은 Galaxy AVD 와 같은 스톡 Chrome 구성이라 결과를 공유하지만,
> 제조사 커스텀 브라우저·삼성 인터넷은 **검증하지 않았다.**

---

## 7. 측정 규칙에서 **일부러 제외한 것** (기준을 낮춘 게 아니라 정의를 바로잡은 것)

| 제외 | 이유 |
|---|---|
| 버튼 **모서리 4점** | `border-radius` 가 있는 버튼은 모서리가 원래 클릭영역이 아니다(부모가 잡힌다). 세면 둥근 버튼 전부가 거짓 FAIL |
| **화면 절반 넘는 요소** | 버튼이 아니라 스크림/컨테이너다. 그 위에 콘텐츠가 있는 게 정상 (이번 라운드 유일한 WRONG 1건이 이 오탐이었다) |
| **스크롤러에 잘린 요소** | 스크롤하면 나온다. 가로 칩 줄·세로 달력 칸 |
| **sticky/fixed 헤더가 덮은 순간** | 스크롤 중 스냅샷일 뿐 |
| **위에 뜬 다른 오버레이가 덮은 것** | 모달이 뒤를 막는 건 정상 |
| `eff` **43 을 통과선**으로 | 44px 박스를 중심에서 정수 스텝으로 재면 21+21+1 = 43 이 나온다(경계 1px 은 `elementFromPoint` 가 놓침) |
| 스크롤되는 리스트의 마지막 행이 제스처 영역에 걸침 | 스크롤로 피할 수 있다. 침범 판정은 **고정 UI** 에만 |

---

## 8. 남은 44px 미달 — 전부 사유 있음 (숨기지 않는다)

| 항목 | 크기 / 유효 | 왜 안 넓혔나 |
|---|---|---|
| 예약 `월`·`주` 30×44, `오늘` 37×44 | 세로 44 | 세그먼트라 좌우가 붙어 있다. 넓히면 옆을 뺏는다(기존 14-b 판단 유지) |
| 설정 `보통`·`크게` 39×24 → 41×44 | 세로 44 | 같은 이유(세그먼트) |
| 약관/개인정보 링크 37·74 × 17 → 38·75 × 44 | 세로 44 | 둘이 ' · ' 8px 사이로 나란히. 가로 확장 금지 |
| DM `켜기` 44×26 → 44×**40** | 아래 여유 **7px** 이 물리적 상한 | 44 로 키우면 아랫줄 토글을 먹는다 |
| 잇비 `신고` 41×18 → 43×**40** | 아래 여유 12px 상한 | 〃 |
| 고객 가나다 인덱스 26×34 | 자음 14개를 44 로 = 616px, 물리적으로 불가 | 세로가 짧은 화면에선 아예 접었다 |
| 미니 달력 `이전/다음` 22×22 | **넓혔다가 되돌림**(R12) | 넓히면 서로를 뺏는다 |
| 검색창 360×40 · `오늘 N건` 바 378×33 | 가로가 매우 넓어 조준 난이도 낮음 | 세로 확장이 아래 콘텐츠를 먹을 위험 |
| `처음부터 시작하기 (CBT 전용)` 185×33 | **기본 `display:none`**, CBT 테스터만 봄 | 의도적으로 눈에 안 띄게 만든 개발용 버튼 |
| 사이드바 `고객센터` 203×34 → 49×36 | 바로 아래 `로그아웃` 과 붙어 36 이 상한 | 잰 만큼만 |

**공통 전제**: 위 전부 `WRONG 0 / BLOCK 0` — **눌리고, 엉뚱한 게 안 눌린다.**

---

## 9. NOT TESTED (추정으로 PASS 처리하지 않음)

| 항목 | 상태 |
|---|---|
| **실물 기기** (진짜 아이폰·갤럭시·아이패드) | 🔴 **PHYSICAL DEVICE: NOT TESTED** — 이 환경에 실물이 없다 |
| **Desktop Safari** | 🔴 NOT TESTED — AppleScript 자동화가 권한 대기로 멈춰 포기 |
| **Android Tablet** | 🔴 NOT TESTED — 별도 AVD 미생성 |
| **삼성 인터넷 등 제조사 브라우저** | 🔴 NOT TESTED |
| **네트워크 지연·500·429·재시도 중 버튼 상태**(§26) | 🟡 NOT TESTED — 목 API 는 즉시 200 응답 |
| **브라우저/시스템 글자 확대(§36·37)** | 🟡 NOT TESTED — 80~200% 확대·Dynamic Type 미시험 |
| iPad 키보드 · iPad 시스템 제스처 | 🟡 NOT TESTED |
| iPhone PWA 가로 | 🟡 NOT TESTED |
| 롱프레스 전수(§21) | 🟡 부분 — 탭바 1건만(텍스트 선택 발생, P3) |

---

## 10. 최종 판정

### P0 (핵심 action 불가 / 잘못된 버튼 실행 / 시스템 제스처 충돌 / 데이터 손실 / 결제 오조작 / 화면 밖 이탈)
# 0건

### P1 (특정 기기 주요 CTA 오작동 / modal·sheet 내비 문제 / 키보드 / 회전 후 상태 / 히트박스)
# 0건 남음 — 발견 3건(R8·R11·R12) 전부 수정·같은 조건 재검증 완료

### P2
경미 3건 수정(R9·R10 및 §8 일부), 나머지는 §8 에 사유와 함께 공개.

---

# 🟢 GREEN CANDIDATE — 실엔진 기준 통과

**단, 이 줄을 같이 읽어야 한다: `PHYSICAL DEVICE: NOT TESTED` · `Desktop Safari: NOT TESTED` ·
`Android Tablet: NOT TESTED`.**

연준님 정의의 GREEN 이 실물 기기를 요구한다면 이 문서는 그 세 칸이 빌 때까지 **GREEN 이 아니다.**
코드 쪽에서 막고 있는 것은 없다.

### 최종 질문에 대한 답

> iPhone / Galaxy / Android / iPad 에서 세로·가로·회전·키보드·Safari UI·Chrome UI·PWA·시스템 제스처
> 상황에서도 모든 주요 화면과 중요 조작을 오작동 없이 쓸 수 있는가?

**실제 WebKit·실제 Blink 위에서 조작요소 4,166개를 40,455점으로 찔러보고,
시스템 백·홈·엣지백·회전·키보드·연타·3겹 오버레이를 실제로 수행한 범위에서는 YES.**
"눌리지 않는 버튼" 0, "엉뚱하게 눌리는 버튼" 0, "제스처 충돌" 0, "회전 후 상태 붕괴" 0,
"키보드 후 복구 실패" 0, "safe-area 침범" 0, "중복 실행" 0.

남은 것은 실물 기기 · Desktop Safari · Android Tablet 세 칸이다.
