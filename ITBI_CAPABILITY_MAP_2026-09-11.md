# 잇비 Capability Map — 2026-09-11

> **코드에서 역추적한 실제 능력 목록.** 추측 없음. 전부 배포본 기준
> (BE `itdasy_backend-test@83e9e7c` · FE `itdasy-frontend-test-yeunjun@6926ff0`).

---

## 0. 한 번의 질문이 지나가는 길 (실제 코드 경로)

```
원장님 입력 (#asstInput)
  └ app-assistant.js _send()                         ← 재진입 락 _sendActive/_sendInFlight
      ├ ① FE 지름길 15단계  _trySendShortcuts()      ← ★ 여기서 끝나면 백엔드는 요청조차 못 본다
      │    obvious_intent · affirm_action · customer_phone_intent · customer_add_guard
      │    caption_conversation · cancel/context/lookup/create_booking · draft_message
      │    closing_report · daily_briefing · customer_status_card · async_intent_rule
      │    keyword_shortcut(사진편집·화면열기·탭이동·유틸)
      ├ ② photo-mode / workspace-NL / 템플릿 매처 / create-intent (사진·제작 발화)
      └ ③ POST /assistant/ask
             ├ services/revenue_analysis.classify_revenue_analysis()   → 매출 자연어 분석
             ├ _classify_readonly_intent()  →  24종 DB 직답 (LLM 0회·0원)
             │     _direct_readonly_answer() → _attach_hub_action() → _build_followups()
             └ LLM (Gemini flash) _sync_ask() → 후처리 12단 → _validate_followups()
```

| 역할 | 파일 |
|---|---|
| 진입점 | `app-assistant.js window.openAssistant` (5,700줄) |
| FE intent 사전파서 | `assistant-intent-router.js` (1,230줄) — 매출·예약 조회를 자체 API 로 |
| FE 지름길 15종 | `app-assistant.js _trySendShortcuts` / `js/assistant/core/*.js` |
| chat API | `backend/routers/assistant.py` `POST /ask` (9,800줄) |
| 조회 즉답 분류기 | `_classify_readonly_intent()` |
| 조회 즉답 실행기 | `_direct_readonly_answer()` |
| 고객 확정 | `_customer_ids_by_name()` · `_named_customer_or_reply()` · `_session_customer_id()` |
| 방문·단골 진실원 | `services/customer_visits.visit_summary` · `services/customer_tier.REGULAR_VISIT_THRESHOLD(=3)` |
| 이탈 판정 진실원 | `services/retention_predictor.compute_at_risk` |
| LLM 게이트웨이 | `services/generation.py` (Gemini 단일 진입) · SYSTEM_PROMPT `assistant.py:1123~` |
| tool schema | `RESPONSE_SCHEMA` `assistant.py:1603~` · 실행기 `_execute_action_impl` (26 kind) |
| 대화 상태 | `AssistantSession.messages` (최근 40개) + `summary` 압축 |
| 추천질문 | 즉답 = 정적표 `_READONLY_FOLLOWUPS` / LLM = 모델 생성 → `_validate_followups` 필터 |
| fallback·재시도 | `_fallback_parse_actions` · 429 `_ai_busy` 회로 · 벌크헤드 `_assistant_ask_bulkhead` |
| FE 추천칩 렌더/클릭 | `js/assistant/suggestion-controls.js` (`[data-suggest]`) |
| 신고 | `app-content-report.js` → `POST /moderation/report` |
| 관측 **[신설]** | `backend/utils/itbi_telemetry.py` · `POST /assistant/client-event` |

---

## 1. 조회 능력 24종 (LLM 0원 · DB 직답)

전부 `_classify_readonly_intent` → `_direct_readonly_answer`. 답 + '그 화면 열기' 버튼 + 후속칩 3개까지.

| # | intent | 대표 발화 | 데이터 원천 | 화면 버튼 | 후속칩 |
|---|---|---|---|---|---|
| 1 | `today_bookings` | 오늘 예약 알려줘 | Booking (취소·노쇼 제외) | 예약 화면 | 3 |
| 2 | `tomorrow_bookings` | 내일 예약 있어? | Booking | 예약 화면 | 3 |
| 3 | `empty_time` | 오늘 빈 시간 알려줘 | Booking 간격 ≥60분 | 예약 화면 | 2 |
| 4 | `empty_time_range` | 이번 주 빈 시간 언제야? | — (달력으로 안내) | 달력 | 2 |
| 5 | `revenue_summary` | 이번 달 매출 얼마야? | RevenueRecord | 매출 화면 | 3 |
| 6 | `expense_summary` | 이번 달 지출 얼마야? | ExpenseRecord | 매출 화면 | 2 |
| 7 | `customer_count` | 전체 고객 몇 명이야? | Customer | 고객 화면 | 3 |
| 8 | `new_customers` | 이번 달 신규 고객 몇 명? | Customer.created_at | 고객 화면 | 3 |
| 9 | `regulars` | 단골 누구야? | visit_summary + **REGULAR_VISIT_THRESHOLD(3회)** | 고객 화면 | 3 |
| 10 | `at_risk_customers` | 오래 안 온 손님 누구야? | `compute_at_risk` | 고객 화면 | 3 |
| 11 | `customer_last_visit` | ○○님 마지막 방문 언제야? | Customer + visit_summary | 고객 화면 | 2 |
| 12 | `customer_memo` | ○○님 메모/알러지 있어? | CustomerMemo (⚠️경고 우선) | 고객 화면 | 2 |
| 13 | `customer_bookings` | ○○님 예약 있어? | Booking(고객별) | 예약 화면 | 2 |
| 14 | `customer_revenue` | ○○님 누적 매출 얼마야? | RevenueRecord(고객별) | 매출 화면 | 2 |
| 15 | `membership_balance` | 회원권 잔액 남은 손님 / ○○님 잔액 | Customer.membership_balance | 고객 화면 | 3 |
| 16 | `expiring_membership` | 회원권 만료 임박한 사람 있어? | membership_expires_at ≤ +30d | 고객 화면 | 2 |
| 17 | `birthday` | 이번 달 생일인 손님 있어? | Customer.birthday | 고객 화면 | 3 |
| 18 | `review_status` | 리뷰 현황 어때? | CustomerReview.status | 고객 화면 | 2 |
| 19 | `service_list` | 시술 목록 뭐 있어? | ServiceTemplate | 매출·시술 화면 | 2 |
| 20 | `low_stock` | 재고 부족한 거 있어? | InventoryItem < threshold | **없음(의도적)** ※ | 2 ※ |
| 21 | `dm_queue` | 답장 안 한 DM 몇 개야? | DMMessageLog(pending) | DM 확인 큐 | 2 |
| 22 | `comment_queue` | 댓글 문의 뭐 달렸어? | — (안내 + 이동) | 댓글 응대 | 2 |
| 23 | `instagram_status` | 지금 인스타 연동됐어? | ShopSettings 토큰 | 인스타 연동 | 2 |
| 24 | `workspace_status` | 작업실에 작업 중인 거 있어? | WorkspaceSlot | 작업실 | 2 |

※ `low_stock` 은 이번 감사 전까지 **버튼도 후속칩도 없는 유일한 intent** 였다(대화가 끊겼다).
후속칩은 추가했고, **버튼은 일부러 안 넣었다** — 재고 화면은 이번 릴리스에서 감춰져 있어
(`INVENTORY_HIDDEN`, FE 진입점 주석 처리) `open_inventory` 를 만들면 눌러도 아무 일 없는 죽은 버튼이 된다.

### 답할 수 **없어야** 하는 것 (설계상 거부)
- 다른 샵·업계 평균·시장 트렌드 → `_OUTSIDE_SCOPE` 로 추천칩에서도 제거
- 잇비가 **직접 발송**(DM·댓글·문자) → 항상 원장 확인 화면으로만 (`dm_queue`/`comment_queue`)
- 동명이인 임의 선택 → `_named_customer_or_reply` 가 되묻는다
- 없는 고객 추측 → "찾지 못했어요" (호칭이 있을 때만 단정)

---

## 2. 실행(쓰기) 능력 — 26 kind

`_execute_action_impl`. **전부 카드 → 원장 확인 후 실행**(자동 실행 0). RISKY 는 한 번 더 확인.

create_revenue · refund_revenue · create_booking · update_booking · cancel_booking ·
mark_booking_completed · mark_booking_no_show · create_customer · update_customer ·
add_customer_memo · create_treatment_record · charge_membership · use_membership ·
create_expense · upsert_inventory · update_service_price · request_review ·
draft_message · reply_dm · create_booking_from_dm · toggle_* (자동화) 등.

---

## 3. FE 가 백엔드보다 먼저 답하는 15경로 (★ 이번 감사의 핵심 위험지대)

| 지름길 | 하는 일 | 위험 |
|---|---|---|
| `obvious_intent` | 인사·감사·도움말 즉답 | 낮음 |
| `customer_add_guard` | "○○ 고객 추가/찾아" | **집계 질문을 이름으로 오인**(수정함) |
| `async_intent_rule` | 매출·예약 조회를 자체 API 로 | **건수 오산·지출→매출 오분류**(수정함) |
| `customer_status_card` | 고객 상태 카드·이탈 목록 | **이탈 목록이 죽은 분기**(수정함) |
| `keyword_shortcut` | 화면 열기(회원권·이탈·인사이트·리뷰·백업·DM설정) | **질문까지 화면이동으로**(수정함) |
| `photo-mode-support` | 사진편집 시작 판정 | **'리뷰/후기/전후' 단어만으로 시작**(수정함) |
| `saved-cards-intent` | 작업실/저장카드 열기 | **작업실 상태 질문도 이동**(수정함) |
| 나머지 8종 | 예약 생성/취소/초안/브리핑/캡션 등 | 이번 라운드 범위 밖(조회 질문과 안 겹침) |

> **왜 위험한가**: 여기서 끝난 턴은 서버 로그에 **요청 자체가 없다.** 원장님이 신고하지 않으면
> 우리는 영원히 모른다. 그래서 이번에 `POST /assistant/client-event` 로 `handled_by` 를 남기게 했다.
