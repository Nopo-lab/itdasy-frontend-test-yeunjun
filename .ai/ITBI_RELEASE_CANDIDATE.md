# 잇비(ITBI) Assistant — Release Candidate 상태

**최종 상태: ITBI Assistant / 채팅 UX / entity 정합성 — FINAL PASS**
**단, 실기기 터치 E2E는 미검증.**

라이브 기준: BE `5b59640`(+ 이후 배포에 포함) · FE `ea40b51`
테스트: backend **1913** passed · frontend **1314** passed
최종 갱신: 2026-08-17

---

## 검증 결과표

| 항목 | 상태 |
|---|---|
| Desktop 실제 E2E (실제 클릭) | **PASS** |
| 375px layout | **PASS** |
| 390 / 412px layout | **PASS** |
| 375px real click | **TOOL LIMITATION** |
| touch hit area | **IMPROVED → 45px** (시각 33px 유지) |
| real device touch | **NOT VERIFIED** |
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

## 🔒 동결 — 실기기 확인 전까지 손대지 않는다

- 추천질문 구조
- session 구조
- customer entity 구조
- CSS (특히 45px hit area)
- RAG 로직

---

## 📱 실기기 최종 확인 (1회, 원장님/연준님)

실제 iPhone 또는 Android 에서 아래만 보면 된다.

1. 잇비 채팅방 진입
2. 초기칩 탭
3. 답변 확인
4. 후속칩 탭
5. `고객 화면 열기` 탭
6. 다시 후속칩 탭
7. 긴 고객명 화면 확인
8. 칩을 연속으로 2~3번 눌러보기
9. 가로 스크롤하면서 옆 칩이 오탭되는지 확인

**이상 없으면 → ITBI Assistant Release Candidate = READY 로 종료.**
문제가 있으면 그 항목만 다시 연다(전체 재검증 불필요 — 위 표의 나머지는 이미 고정돼 있다).
