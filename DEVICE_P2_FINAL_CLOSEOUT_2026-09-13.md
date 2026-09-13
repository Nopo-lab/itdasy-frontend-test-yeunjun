# ITDASY — FINAL DEVICE SUPPORT / PHYSICAL CLOSEOUT (2026-09-13)

```
Branch:          fix/error-copy-and-membership-ux  → main (fast-forward)
Previous commit: 036d079
New commit:      4f3b72a (수정) · f20fa26 (origin/main 병합 = 배포 커밋)
Live build:      20260913-0335-f20fa26   (Actions "Deploy to GitHub Pages" success)

Changed files:
  app-core.js            토스트 길목 정규화 + _humanError 5xx 분리
  app-membership.js      무응답 12초 안내 전환
  app-revenue.js         status 전달 · 모름/실패 모순 토스트 제거
  app-phase9-ux.js       빠른 매출 입력 에러 처리(회귀 방지)
  __tests__/toast-error-copy-2026-09-13.test.js   (신규 · 17 케이스)
  index.html · sw.js · load-groups.js · CSS : 변경 없음
```

---

## 1. Physical iPhone
```
Device: 없음 (USB 연결 iOS 기기 0대 — system_profiler / xctrace 확인)
Result: 🔴 NOT TESTED
```

## 2. Physical Galaxy / Android
```
Device: 없음 (adb 목록은 에뮬레이터 emulator-5554 뿐)
Chrome / Samsung Internet: NOT TESTED
Result: 🔴 NOT TESTED
```

## 3. Physical iPad
```
Device: 없음
Split View / Stage Manager: NOT TESTED
Result: 🔴 NOT TESTED
```

## 4. Samsung Internet
```
Result: 🔴 NOT TESTED — 설치 경로가 Play 스토어 로그인뿐. 계정 로그인·APK 사이드로딩은 수행하지 않음.
```

---

## A. 운영 URL 로그인 실검증 (이번 라운드 신규)

보스 크롬에 **이미 로그인된 운영 세션**을 사용했다(비밀번호 입력 없음). 보스 창 크기를 건드리지 않으려고
**같은 출처 iframe 을 목표 뷰포트 크기로** 띄워 잰다. 운영 DB 보호를 위해 iframe 의 `fetch` 에서
**GET/HEAD 외 모든 메서드를 차단**했다(실제 차단된 쓰기 0건).

### A-1. 셸 · 레이아웃 (CSS 기반 — 유효)

| 뷰포트 | 로그인 | PC셸 | 사이드바 | 탭바 | 가로넘침 | 탭바 user-select |
|---|---|---|---|---|---|---|
| **갤럭시 가로 842×331** | ✅ | **false** | **없음** | **있음** | 0 | none |
| 갤럭시 세로 412×915 | ✅ | false | 없음 | 있음 | 0 | none |
| 아이폰 세로 393×852 | ✅ | false | 없음 | 있음 | 0 | none |
| 아이폰 가로 874×402 | ✅ | false | 없음 | 있음 | 0 | none |
| 아이패드 세로 820×1094 | ✅ | true | 있음 | 없음 | 0 | none |

👉 **운영 · 로그인 상태에서 "갤럭시를 눕히면 데스크톱 UI" 결함이 닫힌 것을 확인했다.**

### A-2. 핵심 화면 진입 (393×852)

| 화면 | 요소 | 내용 렌더 | hash | JS 에러 | 차단된 쓰기 |
|---|---|---|---|---|---|
| 예약 | ✅ | 109자 | #booking | 0 | 0 |
| 고객 | ✅ | 106자 | #customers | 0 | 0 |
| 매출 | ✅ | 169자 | #revenue | 0 | 0 |
| 잇비 | ✅ | 69자 | #assistant | 0 | 0 |
| 작업실 | ✅ | 218자 | — | 0 | 0 |
| 샵 관리 | ✅ | 265자 | #settingsHub | 0 | 0 |
| 플랜 | ✅ | 697자 | #plan | 0 | 0 |
| 인스타 DM | ✅ | 602자 | #dmMenu | 0 | 0 |
| 인스타 댓글 | ✅ | 51자 | #crq | 0 | 0 |

**9 / 9 진입 · JS 에러 0.** 고객센터는 열면 `POST /support/messages/read`(읽음처리)가 나가 운영에선 제외.

### A-3. ⚠️ 이 검증의 한계 (정직하게)

1. **화면 페인트는 이 방법으로 판정 불가.** 보스 크롬 탭이 백그라운드라 `document.hidden=true`,
   `requestAnimationFrame` **1초 0틱** — 시트 등장 애니메이션이 안 끝나 `display:none` 으로 남는다.
   처음 18건 중 17건이 ❌ 로 나왔는데 **항상 떠 있는 `#tab-home` 까지 ❌** 여서 측정 무효로 판정하고,
   rAF 와 무관한 신호(요소·내용·hash·JS 에러)로 다시 쟀다. 스크린샷으로도 탭이 앞으로 오지 않았고
   브라우저는 클릭 권한이 없는 등급이다.
2. **실데이터 로드는 확인하지 못했다.** 여러 화면이 "오프라인"·"불러오지 못했어요" 상태였다.
   `/health` 200 인데 데이터 GET 이 401 — **내 읽기 전용 가드가 `POST /auth/refresh`(토큰 갱신)까지
   막았기 때문**이다. 토큰 갱신은 운영 세션 상태를 바꾸므로 거기서 멈췄다. 즉 이 결과는
   "로그인 상태에서 화면이 열리고 에러 없이 폴백 렌더된다" 까지이고, "실데이터가 정상" 은 아니다.

---

## 5. Error message cleanup

```
Before:
  저장 실패: Failed to fetch
  저장 실패: The user aborted a request.
  해제 실패: Failed to fetch
  해제 실패: 해제 실패 (HTTP 500) {"detail":"server error"}
  저장 실패: server error          ← 1차 수정 후에도 남았던 것
  저장 실패: rate limited          ← 〃
  에러: 네트워크 연결을 확인해주세요 (잇비 500 — 서버 고장인데 네트워크를 탓함)

After:
  저장 실패 — 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요
  저장 실패 — 처리 결과를 확인하지 못했어요. 잠시 후 목록을 새로고침해 확인해 주세요
  해제 실패 — 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요
  해제 실패 — 일시적인 서버 오류가 발생했어요. 잠시 후 다시 시도해 주세요
  저장 실패 — 일시적인 서버 오류가 발생했어요. 잠시 후 다시 시도해 주세요
  저장 실패 — 요청이 너무 많아요. 잠시 후 다시 시도해 주세요
```

**방식:** 22군데 호출부를 각각 고치지 않고 `showToast` **길목**에서 흡수(기존 BUG-4 와 같은 설계).
한국어 라벨("저장 실패")은 살리고 사유만 표준화. 서버가 한국어 detail 을 주면 그대로 사용.

**🔑 1차 수정이 틀렸던 점** — 영문 패턴을 **열거**했더니 DM 저장의 `server error`·`rate limited` 가
**통과했다**(검사기도 같은 목록이라 못 잡음). 규칙을 "라벨 뒤 사유에 한글이 한 글자도 없으면 누출" 로
일반화하고, 검사기도 같은 기준으로 엄격하게 바꿔 다시 쟀다.

**🔑 지킨 기존 결정** — `Failed to fetch` 를 "인터넷 문제" 라고 단정하지 않는다(서버다운·DNS·CORS 도
같은 문구 · 2026-09-01 서버 503 인 날 공유기를 탓하던 사고). `_humanError` 의 `Failed to fetch → 네트워크`
분류는 기존 테스트가 고정했으므로 그대로 두고 **HTTP 5xx 만** 분리했다.

```
Fault cases:       토스트 35 + DM/인스타 전용 10 + 매출 5 + 잇비 말풍선 5 = 55
English raw error: 0
Raw JSON:          0
Duplicate prefix:  0
Result:            ✅ PASS
```

### 5-1. 검증 중 드러난 같은 계열 — 매출 저장 모순 토스트 (함께 수정)

```
Before: 끊김 1회 → "저장 결과를 확인하지 못했어요…" + "저장 실패: 네트워크 연결을…"  (모름 + 실패 동시)
        429 (서버가 분명히 거절) → "저장 결과를 확인하지 못했어요…"                  (거짓 '모름')
After:  끊김/무응답/500/503 → "저장 결과를 확인하지 못했어요…" 1개
        429                  → "저장 실패: 요청이 너무 많아요…" 1개
```
원인: 데이터 계층이 "모름" 을 띄우고 다시 던지면 화면 계층이 "실패" 를 또 띄웠다.
`_api` 가 status 를 싣게 하고(회원권 `_fetch` 와 같은 계약), "모름" 을 말했으면 `_unknownShown` 을 달아
화면 쪽이 겹쳐 말하지 않게 했다.
⚠️ 빠른 매출 입력(`app-phase9-ux.js`)은 에러를 **잡지 않고 있었다** — 이 변경만 하면 429·400 이
그 경로에서 **조용히 사라지므로**(내가 만들 뻔한 회귀) 같이 잡았다.

---

## 6. Membership unknown-result UX

```
Before: 무응답 → 5·15·25·35·45·55초 전부 "충전 중…" + 스피너, 아무 말 없음 → 65초에야 풀림
After:  0~12초  "충전 중…"
        12초    버튼 → "결과 확인 중…" + 토스트 1회
                 "처리 결과를 확인하고 있어요. 같은 버튼을 다시 눌러도 두 번 처리되지 않아요."
        65초    버튼 복구 + 토스트 1회 (같은 말 반복 대신 다음 행동)
                 "아직 결과를 확인하지 못했어요. 잠시 후 잔액을 새로고침해 확인해 주세요. …"
```

| 항목 | 충전 | 차감 |
|---|---|---|
| 12초 전후 안내 전환 | ✅ 15초 시점 "결과 확인 중…" | ✅ |
| client_txn_id | 고유 **1개** | 고유 **1개** |
| 중복 효과 | 0 (멱등키) | 0 |
| 중복 토스트 | 0 | 0 |
| 거짓 성공 | 0 | 0 |
| 영구 잠김 | 0 (65초 복구) | 0 |
| 영문/JSON | 0 | 0 |

**의도적으로 유지한 것:** apiFetch 재시도(멱등키가 있어 안전하고 자동 복구에 유용) · 진행 중 버튼 잠금
(풀면 같은 키로 요청이 하나 더 떠서 서버는 흡수하지만 **성공 토스트·축하 효과가 두 번** 뜬다).

```
Result: ✅ PASS — 단, **잠김 시간 자체는 65초 그대로**다. 줄인 건 "무소식으로 멈춘 느낌" 이다.
```

---

## 7. Regression

```
실브라우저 · 장애주입 · 7 mutation × 10 조건 = 70 케이스
  고객 저장 · 매출 저장 · 예약 저장 · 잇비 전송 · 고객센터 전송 · 회원권 충전 · 회원권 차감
  (DM 설정 저장 · 인스타 해제는 §5 전용 검사 10 케이스)

P0:                   0
P1:                   0
WRONG_TARGET:         0   (이번 변경은 문구·상태만 — 레이아웃/히트영역 무변경)
BLOCKED_TARGET:       0
DUPLICATE_ACTION:     0   (회원권 다중 요청은 같은 client_txn_id 재시도)
SAFE_AREA_COLLISION:  0
LAYOUT_FAILURE:       0   (CSS 무변경 · 운영 로그인 5뷰포트 넘침 0)
JS_ERROR:             0   (로컬 70 + 운영 로그인 9)
```

## 8. Tests
```
Jest:      2705 / 2705 (155 suites · origin/main 병합 후)
Lint:      eslint 0 error (201 warning — 기존 max-lines 계열)
Stylelint: 0
Smoke:     passed (96 scripts, 182 lazy-group entries, git mode)
```

---

## Remaining NOT TESTED
```
1. 실물 iPhone
2. 실물 Galaxy / Android
3. 실물 iPad
4. Samsung Internet
5. 실제 사람 손가락 터치 정확도
6. iPad Split View / Stage Manager
7. 작업실 실사진 · 사진편집기 캔버스 위 롱프레스 (목 데이터에 사진 0건)
8. 운영 로그인 상태의 화면 페인트 · 실데이터 로드 (§A-3)
```

## Final verdict

```
P0 / P1 / WRONG / BLOCKED / DUPLICATE / SAFE_AREA / LAYOUT / JS_ERROR   = 0   ✅
Error message cleanup                                                  ✅ PASS
Membership unknown-result UX                                           ✅ PASS
Network failure / retry                                                ✅ PASS
Long press · Every button (앞 라운드)                                   ✅ PASS
Tests                                                                  ✅ PASS
Live operation smoke (로그인 · 셸/레이아웃 · 9화면 진입)                  ✅ PASS (§A-3 한계 있음)

Physical iPhone / Galaxy / iPad                                        ❌ NOT TESTED
Samsung Internet                                                       ❌ NOT TESTED
```

# 🟡 ENGINE COMPLETE / PHYSICAL PENDING

코드로 닫을 수 있는 것은 **전부 닫았다** — 영문 예외, 원시 JSON, 라벨 중복, 매출 모순 토스트,
5xx 오분류, 회원권 무소식 65초. `🟡 RELEASE OK WITH KNOWN P2` 조건(영문 문구·회원권 65초)에는
더 이상 해당하지 않는다.

남은 것은 **기기로만 닫히는 4종**이고, 이 맥에 실물 기기가 없어 이번에도 수행하지 못했다.
그래서 `DEVICE CLASS COMPLETE` 는 쓰지 않는다.

> *원장이 일반적인 iPhone / Galaxy / iPad / Android Tablet / PC / Safari / Chrome / Samsung Internet 에서
> 핵심 업무를 잘림·겹침·오작동·중복 없이 수행할 수 있는가?*
>
> **실엔진 + 운영 로그인 셸 검증으로는 YES. 실물 기기와 Samsung Internet 증거로는 아직 답할 수 없다.**
