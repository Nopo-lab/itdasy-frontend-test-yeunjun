# 잇비(ITBI) Assistant — Release Candidate 상태

**최종 상태: ITBI Assistant / Chat UX / Entity / Data Truth / Navigation**
**— 실기기 터치만 남기고 전부 PASS. 코드 동결.**

라이브 기준: BE `6b9419c` · FE `4413739`+
테스트: backend **1989** passed · frontend **1383** passed
최종 갱신: 2026-08-17 (A/B/C 라운드 반영)

```
Desktop E2E         PASS
375px layout        PASS
390 / 412px layout  PASS
Browser real click  PASS
Real device touch   NOT VERIFIED
```

브라우저 pane 스크린샷이 한 프레임 늦는 현상은 **버그로 보지 않는다** —
실제 DOM 상태(`display` · `getBoundingClientRect` · `innerText`)로 대조해 정상임을 확인했다.

---

## 검증 결과표

| 항목 | 상태 |
|---|---|
| Desktop 실제 E2E (실제 클릭) | **PASS** |
| 375px layout | **PASS** |
| 390 / 412px layout | **PASS** |
| Browser real click | **PASS** (pane 462px 폭에서 실클릭 · 2026-08-17) |
| 375px real click | **미검증** — 375px 은 레이아웃 실측으로만 확인 (실클릭 0건) |
| touch hit area | **IMPROVED → 45px** (시각 33px 유지) |
| real device touch | **NOT VERIFIED** |
| **A** 방문 진실원 단일화 (화면 = 잇비 = 브리핑) | **PASS** |
| **B** 인스타 핸들 `@` 정규화 | **PASS** |
| **C** 연 화면 닫으면 채팅 복귀 (중첩 포함) | **PASS** |
| 긴 고객명 overflow | **PASS** |
| 초기 추천칩 (계정 상태 기반) | **PASS** |
| 후속칩 | **PASS** |
| `hub_actions` 버튼 | **PASS** |
| 세션 계정 전환 리셋 | **PASS** |
| `customer_id` mutation safety | **PASS** |
| 잘못된 / 삭제된 / 타계정 ID 거부 | **PASS** |
| G0 known→answer / unknown→don't invent | **PASS** |
| recommendation command contract | **PASS** |
| SW cache 자동 갱신 | **PASS** |
| bulk message safety | **PASS** |
| 2글자 partial RAG 안전 처리 | **PASS** |

---

## TOOL LIMITATION 이 무슨 뜻인지 (정확히)

`computer` 실제 클릭이 **뷰포트와 무관하게** `pane hidden` 으로 timeout 된다.
375px 뿐 아니라 800px 데스크톱 폭에서도 동일하다 — **375px 특유의 문제가 아니라**
브라우저 패널이 뒤로 가면 입력 주입이 막히는 하네스 상태다(스크린샷·JS 실행은 계속 동작).

- 세션 초반 패널이 앞에 있을 때는 **데스크톱 실제 클릭 E2E 가 정상 통과**했다.
- 375px 에서 실제 클릭으로 확인한 범위: **0건**.
  → JS 구동 + 스크린샷 + `getBoundingClientRect` 수치로 대체 검증했다.

**"미검증" 을 "문제 없음" 으로 바꾸지 말 것.**

---

## 375px 실측 수치 (참고)

```
body 가로 스크롤      없음
패널 가로 overflow    없음
화면 밖 요소          0개
최대 요소 폭          343px  (< 375)
hub 버튼 잘림         없음
칩 ↔ 입력창 겹침      없음
칩 행                 overflow-x: auto (가로 스크롤)
긴 고객명(15자)       말풍선 285px · 4줄 줄바꿈 · 화면 밖 0
```

칩 hit area: `.asst-chip-tap::after { inset: -6px 0 }` → 시각 33px 유지, 탭 영역 45px.
가로는 확장하지 않았다 — 가로 스크롤 안에서 옆 칩과 hit area 가 겹치면 오탭이 늘기 때문.

⚠️ `style.css` 의 `@import ?v=` 는 배포 자동범프 대상이 아니라 손으로 올렸다
(`style-components.css?v=20260816-chip-taparea`).

---

## A/B/C 라운드 근거 (2026-08-17)

**A — 방문 진실원 단일화.** 네 곳이 서로 다른 방문 진실을 보고 있었다:
고객관리 · 잇비 · 이탈 예측 · 고객 상세. `services/customer_visits.py` 의
`visit_summary()` 하나로 통일했다. `visit_count` 컬럼 의존 제거 ·
`last_visit_at` 컬럼이 원장을 덮지 않음 · 회원권 충전일이 방문일로 잡히던 것 수정 ·
이탈 기준을 `60일 + 3회` 고정값에서 `compute_at_risk` 로 통일.

배포본 실측 대조 (계정 `cbt4@itdasy.com`):

| | 화면 | 잇비 |
|---|---|---|
| 단골 | 안원영 5 · 김서연 2 · 안원영 2 | 동일 |
| 이탈 | `/retention/at-risk` 3명 | 3명 (이름까지 동일) |
| 홈 브리핑 | "다시 올 때가 지난 손님 3명" | "이탈 위험 고객 3명" |
| 마지막 방문 | 김서연 04-21 · 박수민 06-26 · 박지영 04-23 | 셋 다 일치 |

**B — 핸들 정규화.** bare / `@handle` / `@@handle` / URL → canonical `@handle` 하나.
저장 · 표시 · 프론트 7곳 · 원장님 직접 입력(설정) 전부 같은 정본(`utils/handles.py`
· `window.igHandle()`)을 쓴다.

**C — 복귀 중앙화.** 화면 이동 11개를 각자 처리하지 않고 `_nav` → `_markSheetOpen`
→ `_markSheetClosed` 로 모았다. 실클릭 4단계 확인:
잇비 → 고객 화면(앞으로 열림) → back → 잇비(대화·스크롤 유지) →
목록에서 상세 → back → **목록**(잇비로 안 튐) → back → 잇비.

---

## 🔒 동결 — 실기기 확인 전까지 손대지 않는다

기존 동결 항목:
- 추천질문 구조 · session 구조 · customer entity 구조 · CSS(45px hit area) · RAG 로직

이번 라운드 추가 (연준님 지시, 2026-08-17):
- ❌ 새로운 context 구조 추가
- ❌ visit 계산 추가 변경
- ❌ navigation 구조 재설계
- ❌ handle formatter 재작성
- ❌ 추천질문 구조 변경

**유지해야 하는 가드 2개** — 지우면 같은 사고가 그대로 재발한다:
- `test_visit_truth_single_source_2026_08_17.py` — 다른 화면에서 `Customer.visit_count` 를
  다시 **읽으면** 테스트가 깨진다 (쓰기는 폴백용이라 허용)
- `__tests__/itbi-return-and-handle.test.js` — 화면에서 `'@' + handle` 을 직접 붙이면 잡힌다

---

## 📱 실기기 최종 확인 (1회, 원장님/연준님)

실제 iPhone 또는 Android 에서 **아래 5개만** 보면 된다.

| # | 확인 | 기대 |
|---|---|---|
| 1 | 잇비 채팅 → `고객 화면 열기` → 뒤로 | 잇비 채팅으로 복귀 (홈 ❌) |
| 2 | 목록 → 고객 상세 → 뒤로 | 목록으로 복귀 (잇비로 튀면 ❌) |
| 3 | 초기칩 탭 → 답변 → 후속칩 탭 | 둘 다 정상 전송 |
| 4 | 긴 고객명 | 줄바꿈 되고 화면 밖으로 안 나감 |
| 5 | 칩 빠르게 연속 탭 | 오탭·중복 전송 없음 |

**이상 없으면 →**
`ITBI Assistant / Chat UX / Entity / Data Truth / Navigation = RELEASE READY` **로 확정.**

문제가 있으면 **그 항목만** 다시 연다 — 전체 재검증 불필요. 위 표의 나머지는 고정돼 있다.
