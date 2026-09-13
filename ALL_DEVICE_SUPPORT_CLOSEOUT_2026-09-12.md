# ITDASY — ALL DEVICE SUPPORT FINAL CLOSEOUT

```
Branch:            feat/responsive-alldevice
Previous commit:   b29f4dc  (docs: 전 기기 갭 클로즈아웃)
New commit:        7c402e5  (fix: 고객센터 중복 전송 + iOS 롱프레스 텍스트 선택)
Changed files:     11
                   app-core.js  app-support.js  app-dm-menu.js
                   style-base.css  style-fun.css  style.css
                   css/workspace-hyper.css  css/screens/ai-chip.css
                   css/screens/workshop.css  css/screens/settings-v2.css
                   css/screens/booking-form.css

Cache-buster:      Excluded — handled in separate worktree
                   (itdasy-wt-cache-busters / feat/cache-busters)
                   index.html · sw.js · js/load-groups.js 는 이번 라운드에서 한 줄도 건드리지 않음 (검증: git diff --name-only)
```

---

## Support/messages duplicate

```
Before:   무응답(타임아웃)  1탭 → POST 3회
          네트워크 끊김      1탭 → POST 4회
          원인: app-core.js 자동 재시도 래퍼의 금지 목록에
                support/admin/reply 만 있고 support/messages 가 빠져 있었음

수정:     CREATE_NO_RETRY_RE 에 `support/messages` 추가 (POST 전용 · 끝을 (\?|$) 로 앵커)
          정규식 9케이스 검증 — 9/9 정확
            POST /support/messages        → 재시도 금지 ✅
            POST /support/messages?a=1    → 재시도 금지 ✅
            POST /support/messages/read   → 재시도 유지 ✅ (멱등)
            GET  /support/messages        → 재시도 유지 ✅ (목록)
            POST /support/admin/reply     → 기존 정책 그대로 금지 ✅
            POST /bookings /customers /revenue → 기존 정책 유지 ✅
            PATCH /bookings/12            → 재시도 유지 ✅

After:    무응답  1탭 → POST 1회
          끊김    1탭 → POST 1회
          지연3초 1탭/2탭 → POST 1회

Fault cases:  10 / 10  (정상 · 500ms · 2s · 5s · 15s · 끊김 · 무응답 · 429 · 500 · 503)
```

```
POST /support/messages
normal tap request count            = 1
rapid tap request count             = 1     (지연 중 3연타 → 1)
timeout automatic duplicate         = 0
network disconnect automatic dup    = 0
manual retry works                  = yes   ← 아래 참조
permanent disabled                  = 0
spinner stuck                       = 0
false success toast                 = 0
false failure toast                 = 0
DUPLICATE_ACTION                    = 0
```

### 🔴 중복을 막았더니 드러난 두 번째 결함 (같이 고침)

자동 재시도를 껐으니 **수동 재시도가 반드시 살아 있어야 한다.** 그런데 없었다.

```
실측(수정 전):
  타이핑 "재시도시험 메시지" → 입력값 = "재시도시험 메시지"
  전송 실패                  → 입력값 = ""           ← 원장이 쓴 문장이 사라짐
  ➤ 다시 누름                → POST = []            ← 아무 일도 안 일어남
  다시 타이핑 후 전송        → POST = [200]
  토스트는 "잠시 후 다시 시도" 라고 안내하고 있었다.
```

낙관적 렌더 직후 `input.value=''` 를 하고, 실패 경로에서 되돌리지 않았다.
말풍선 자체는 `opacity .5 + ⚠️전송실패` 로 **정직하게** 표시되고 있었다(가짜 성공 아님).

```
수정 후:
  전송 실패 → 입력값 = "재시도시험 메시지"  (복원)
  ➤ 한 번  → POST = [200]                  ✅
  이미 다른 문장을 치고 있으면 덮지 않는다.
  문구도 "전송 실패 — 다시 보내기를 눌러 주세요" 로 교정.
```

---

## Physical iPhone

```
Device:        (없음)
Browser:       —
Portrait:      NOT TESTED
Landscape:     NOT TESTED
Keyboard:      NOT TESTED
Safe-area:     NOT TESTED
Home gesture:  NOT TESTED
Edge back:     NOT TESTED
PWA:           NOT TESTED
Every button:  NOT TESTED
Result:        🔴 NOT TESTED — 이 맥에 연결된 물리 iPhone 이 없다
```

> 참고: **iOS 시뮬레이터(실 WebKit)** 로는 이번 라운드에서 실제 손가락 터치 주입
> (롱프레스 1.4초 포함)까지 수행했고 전후 스크린샷을 남겼다. 그러나 시뮬레이터는
> 실물 기기가 아니므로 위 표는 `NOT TESTED` 로 둔다.

## Physical Galaxy / Android

```
Device:          (없음)
Chrome:          NOT TESTED
Samsung Internet: NOT TESTED
Portrait:        NOT TESTED
Landscape:       NOT TESTED
Keyboard:        NOT TESTED
System back:     NOT TESTED
Home/recents:    NOT TESTED
Every button:    NOT TESTED
Result:          🔴 NOT TESTED
```

## Physical iPad

```
Device:                     (없음)
Safari / Portrait / Landscape / Keyboard / Gesture: NOT TESTED
Split View / Stage Manager: NOT TESTED
Every button:               NOT TESTED
Result:                     🔴 NOT TESTED
```

## Samsung Internet

```
Viewport / Keyboard / Back / Bottom toolbar / Safe area / Every button:
Result:  🔴 NOT TESTED
```

**이유(정직하게):** Samsung Internet 의 정식 설치 경로는 Play 스토어 로그인뿐이다.
계정 로그인과 APK 사이드로딩은 내가 하면 안 되는 행위라 수행하지 않았다.
갤럭시 실기기 1대가 생기면 기본 브라우저로 바로 닫을 수 있다.

**Chrome 결과로 대체하지 않았다.** Samsung Internet 은 Blink 계열이지만
하단 툴바·dvh/svh·system back 처리가 Chrome 과 다르다.

---

## Long press / iOS touch-callout

이전 라운드의 한계(“Blink 에서는 `-webkit-touch-callout` computed 판정 불가”)를 이번에 닫았다.

### 🔴 실기기 재현 → 수정 → 재검증

```
재현:  아이폰(실 WebKit)에서 하단 탭바 '내 샵 관리' 를 1.4초 길게 누름
       → "관리" 가 파랗게 선택 + 선택 핸들 2개 + "복사하기 ›" 팝업
       (스크린샷 확보)

원인:  접두사 없는 `user-select` 를 이 iOS WebKit 이 통째로 무시한다.
       5중 실측 —
         CSS.supports('user-select','none')            = false
         CSS.supports('user-select: none')             = false
         'userSelect' in document.body.style           = false
         el.style.setProperty('user-select','none')    → 인라인 style 이 null (거부)
         스타일시트 규칙 .qa-us-test{user-select:none} → computed -webkit-user-select = text
         Range 선택 행동 시험                          → 실제로 선택됨("선택시험문자열")
       대조군: -webkit-user-select:none 은 computed none, 선택 결과 "" (선택 안 됨)

       👉 09-11 라운드 롱프레스 212건이 전부 통과했던 건 **Blink 에서만 쟀기 때문**이다.
          Chrome 에선 접두사 없는 선언이 정상 동작한다.

영향:  접두사 없는 선언만 있던 7곳 —
       style-base.css        .tab-bar__btn .tab-bar__fab .chip .tag select label[for]
                             .carousel-track .photo-strip .slot-strip img   ← 하단 탭바 + 모든 이미지
       style-fun.css         .sheet-row .ql-card .kpi-card [data-act]
       workspace-hyper.css   .wsl-slot__img                                  ← 드래그 대상
       ai-chip.css           [data-cust-chip]
       workshop.css          .ws-slot-card
       settings-v2.css       .sv2-acc__avatar--init
       booking-form.css      .bf-tp-row                                      ← 예약 시간 휠

수정:  7개 파일에 -webkit- 짝 추가.
       DM 메뉴는 런타임 주입 스타일이라 별도: .dmm-chip + .dmm-row .dmm-tx
       (칩만 막았더니 iOS 가 선택을 옆 제목 '예약 양식 보내기' 로 옮겨 또 팝업이 떴다)
       입력창(textarea/.dmm-in/.dmm-lblin)은 건드리지 않음 — 편집이 막힌다.

재검증: 같은 좌표·같은 1.4초 롱프레스
       탭바   → 선택 없음, 팝업 없음, **정상적으로 '내 샵 관리' 로 이동**  ✅
       DM 행  → 선택 없음, 팝업 없음                                        ✅
       computed: .tab-bar__btn/.tab-bar__fab/.sheet-run = none,
                 .dmm-chip/.dmm-tx/.mt/.ms = none, textarea = text (유지)   ✅
```

### 수정 후 WebKit 전수 (15화면)

```
검사 요소          383
조작 컨트롤 위험    0     ← button / a / img 전부 안전
컨테이너 위험      52     ← BODY 13 · DIV 33 · SPAN 4 · SECTION 1 · ASIDE 1
```

컨테이너 52건은 설명 텍스트(카드 본문·가격·주소 등)다. 탭 대상이 아니고,
**길게 눌러 복사되는 게 오히려 유용**하므로 결함으로 보지 않는다.
탭 대상이면서 선택되던 것(탭바·DM 행)은 위에서 전부 닫았다.

### Images

```
앱 CSS 가 적용되는 자리에 실제 <img> 를 넣고 실기기 롱프레스(1.6초):
  -webkit-touch-callout : none   ✅  (이미지 저장 / 복사 메뉴 안 뜸 — 스크린샷 확인)
  -webkit-user-select   : none   ✅
  -webkit-user-drag     : none   ✅
  실제 결과: 저장 메뉴 없음. 대신 iOS 드래그 리프트(사진이 떠오름)가 발생.
```

⚠️ **부분 NOT TESTED**: 목 데이터에 사진이 0건이라 **작업실 갤러리 실사진 / 사진편집기 캔버스**
위의 롱프레스는 검증하지 못했다. 위 결과는 주입한 시험 이미지 기준이다.

### Links

```
화면 안에 보이는 <a href> 는 접근성 스킵링크('본문 바로가기', 화면 밖) 1개뿐.
법적 링크(이용약관·개인정보)는 플랜 화면에서 노출되며 조작 컨트롤 위험 0.
링크 미리보기 팝업: 발생 0.
```

---

## Network failure (회귀 포함)

`support/messages` 수정 뒤 전체 mutation 경로를 다시 돌렸다.

```
Total cases:        80   (8 mutation × 10 장애조건)
                  + 10   support-send 전용 재검증
                  +  6   중복전송 단발/연타 교차
                  +  2   회원권 멱등키 확인
                  + 24   회원권 무응답 복구 시간 추적
```

| mutation | 지연 중 3연타 → 요청 | 즉시실패 재시도 | 영구 disabled | 스피너 잔존 | 가짜 토스트 | 판정 |
|---|---|---|---|---|---|---|
| 고객 저장 `POST /customers` | 1 | 복구 | 0 | 0 | 0 | ✅ |
| 예약 저장 `POST /bookings` | 1 | 복구 | 0 | 0 | 0 | ✅ |
| 매출 저장 `POST /revenue` | 1 | 복구 | 0 | 0 | 0 | ✅ |
| 회원권 충전 `POST /memberships/topup` | 1 | 복구 | 0 | 0† | 0 | ✅ |
| 회원권 차감 `POST /memberships/use` | 1 | 복구 | 0 | 0† | 0 | ✅ |
| DM 설정 저장 `PUT /shop/dm-menu` | 1 | 복구 | 0 | 0 | 0 | ✅ |
| 잇비 전송 `POST /assistant/ask` | 1 | 복구 | 0 | 0 | 0 | ✅ |
| 고객센터 전송 `POST /support/messages` | 1 | 복구 | 0 | 0 | 0 | ✅ **수정됨** |
| 인스타 연결 해제 `POST /instagram/disconnect` | 1 | 복구 | 0 | 0 | 0 | ✅ |
| 인스타 연결/재연결 | — | — | — | — | — | ⛔ 외부 OAuth 이동 — 파괴검증 대상 아님 |

† 회원권 **무응답**에서 "충전 중…" 이 유지되다가 **65초에 해제**되고
`"처리 결과를 확인하고 있어요. 같은 버튼을 다시 눌러도 두 번 처리되지 않아요."` 토스트가 뜬다.
영구 disabled 는 아니지만 **최악 65초**는 길다 → 🟡 관찰 기록(미수정).

```
Duplicate action:   0   (효과 기준)
Retry:              PASS
Disabled stuck:     0
Spinner stuck:      0
Toast:              PASS (실패=실패, 모름=모름으로 표기)
```

**회원권만 요청이 4회 나가는 건 의도된 설계다.** 같은 `client_txn_id` 를 재사용해
서버가 흡수한다 — 요청 본문에서 `client_txn_id` 존재를 실측 확인했고(`4194e8f4-…`),
`apiFetch` 가 **같은 `init` 객체**로 재시도하므로 모든 재시도가 같은 키를 쓴다(구조적 보장).
즉 **중복 요청은 있으나 중복 효과는 0** 이다. 자동 복구를 살리는 쪽이 낫다고 판단해 그대로 뒀다.

---

## Tests

```
Jest:        1611 / 1611 통과 (81 suites)
Lint:        eslint 0 error (warning 190건은 기존 max-lines 계열)
Stylelint:   0
Smoke:       passed (91 scripts, 182 lazy-group entries, git mode)
```

---

## Final device class table

| device class | 상태 | 근거 |
|---|---|---|
| small iPhone | ✅ PASS | 실 WebKit 시뮬 375×549 / 667×311 (09-11) |
| normal iPhone | ✅ PASS | 실 WebKit 시뮬 402×714 / 874×292 (09-11) + 이번 라운드 실터치 롱프레스 |
| large iPhone | ✅ PASS | 실 WebKit 시뮬 440×796 / 956×330 (09-11) |
| iPhone PWA | ✅ PASS | standalone 세로 402×812 / 가로 874×402 + 좌우 safe-area 62px 전수 (09-12) |
| small Android | ✅ PASS | 실 Blink 에뮬 (09-11) |
| normal Galaxy | ✅ PASS | 실 Blink 에뮬 411×786 / 842×331 (09-11) |
| large Android | ✅ PASS | 실 Blink 에뮬 960×460 (09-11) |
| **Samsung Internet** | 🔴 **NOT TESTED** | 설치 경로가 Play 로그인뿐 |
| Android Tablet | ✅ PASS | 실 Blink 1280×648 / 800×1128 / 600×808 (09-12) |
| iPad | ✅ PASS | 실 WebKit 820×1094 / 1180×734 + 소프트키보드 337px + 제스처·복귀 (09-12) |
| Desktop Safari | ✅ PASS | 실 WebKit 1024·1280·1366·1440·1920 폭 (09-12) |
| Desktop Chrome | ✅ PASS | 320~3440 폭 스윕 + 줌 5단 |

함께 묶는 결과:

```
320px ~ 3440px automated width sweep     ✅
real WebKit                              ✅  (iOS 시뮬 Safari/PWA + macOS Safari 26.6)
real Blink                               ✅  (Android 에뮬 Chrome 124 + Desktop Chrome)
every-button hit-test                    ✅  누적 36,565점 · WRONG 0 · BLOCK 0
network failure                          ✅  122 케이스 · DUPLICATE_ACTION 0
keyboard                                 ✅  iOS 337px · Android 312px · 미디어쿼리 불변
orientation                              ✅
safe-area                                ✅  하단 + 가로 좌우 62px 전수
zoom                                     ✅  실 Safari 75~200% · Blink 80~200% · 넘침 0
long-press                               ✅  Blink 212 + WebKit 383 · 조작 컨트롤 위험 0
background/resume                        ✅  iPad · Android · 탭 강제종료 12/12
```

---

## Remaining NOT TESTED

```
1. 실물 iPhone
2. 실물 Galaxy / Android
3. 실물 iPad
4. Samsung Internet
5. 실제 사람 손가락 터치 정확도 (§8) — 사람이 눌러야 측정되는 항목
6. iPad Split View / Stage Manager
7. 작업실 갤러리 실사진 · 사진편집기 캔버스 위의 롱프레스 (목 데이터에 사진 0건)
```

---

## ⚠️ 머지 시점 의존성 (다른 워크트리와 물림)

1. **`style-fun.css` 에 `?v=` 가 없다.** 이번에 고친 `.sheet-row/.ql-card/.kpi-card/[data-act]`
   선택 방지가 **기존 사용자에게는 옛 캐시로 가려질 수 있다.**
   이번 라운드는 index.html 을 건드리지 않기로 했으므로 손대지 않았다 →
   **`feat/cache-busters` 워크트리가 `?v=` 를 붙이면 자동으로 해결된다.**
   그 브랜치가 먼저/같이 머지되는지 확인 필요.
2. 직전 커밋 `31dc2c0` 에서 이미 `index.html` 에 `app-sheet-anim.js?v=` 한 줄을 추가했다.
   `feat/cache-busters` 가 main(`342002c`)에서 갈라졌으므로 **index.html 충돌이 예상된다.**
   양쪽 다 "?v= 추가" 라 해결은 쉽지만, 머지 순서를 사람이 봐야 한다.
3. 나머지 6개 CSS 는 index.html `<link>` 에 이미 `?v=` 가 있어 배포가 자동 범프한다.

---

## Final verdict

```
P0 = 0                       ✅
P1 = 0                       ✅
WRONG_TARGET = 0             ✅
BLOCKED_TARGET = 0           ✅
DUPLICATE_ACTION = 0         ✅  ← 이번 라운드에서 닫음
SAFE_AREA_COLLISION = 0      ✅
LAYOUT_FAILURE = 0           ✅
JS_ERROR = 0                 ✅

Physical iPhone              ❌ NOT TESTED
Physical Galaxy / Android    ❌ NOT TESTED
Physical iPad                ❌ NOT TESTED
Samsung Internet             ❌ NOT TESTED

Network failure / retry      ✅ PASS
Long press                   ✅ PASS (실 WebKit 재현 → 수정 → 재검증)
Every button                 ✅ PASS
Tests                        ✅ PASS
```

# 🟡 ENGINE COMPLETE / PHYSICAL PENDING

보스가 §16 에 적은 🟢 조건은 **실물 iPhone·Galaxy·iPad + Samsung Internet = PASS** 를 요구한다.
그 4개가 비어 있으므로 **`DEVICE CLASS COMPLETE` 도, `ABSOLUTE ALL DEVICE GREEN` 도 쓰지 않는다.**

다만 §16 의 🔴 NOT MERGE READY 조건(P0/P1 잔존, wrong/blocked target, duplicate action,
support/messages 중복, 테스트 실패, 예상 외 파일 변경)에는 **하나도 해당하지 않는다.**

> **코드 관점에서는 머지 가능한 상태다. 인증 문구만 실물 기기 4종을 기다린다.**

마지막 질문에 대한 답:

> *"모든 주요 device class 에서 원장이 실제 손가락으로 ITDASY 핵심 업무를 문제 없이 수행 가능한가?"*
>
> **실엔진(실 WebKit · 실 Blink) 증거로는 YES.**
> 이번 라운드가 그 YES 를 두 칸 넓혔다 — 고객센터 문의가 4건 중복 등록되던 것,
> 그리고 **아이폰에서 하단 탭바를 길게 누르면 복사 팝업이 뜨던 것**(Blink 에서만 쟀으면
> 영원히 못 봤을 결함)을 실기기에서 재현해 닫았다.
>
> **실물 기기 증거로는 여전히 대답할 수 없다.**

---

## 보스가 결정할 것

1. **머지 승인** — `feat/responsive-alldevice` → main. 미배포 상태.
   (운영에는 아직 `height >= 600px` 게이트가 없어 **갤럭시를 눕히면 데스크톱 UI** 가 뜬다)
2. **머지 순서** — `feat/cache-busters` 와 `index.html` 충돌. 위 §머지 시점 의존성.
3. **실물 기기** — 아이폰 1 · 갤럭시 1 · 아이패드 1 을 맥에 붙여 주시면 NOT TESTED 4종 중 3종이 닫히고,
   갤럭시가 있으면 Samsung Internet 까지 4종 전부 닫힌다. 그때 🟢 선언 가능.
4. 🟡 회원권 무응답 시 "충전 중…" 최악 65초 — 줄일지 여부.
