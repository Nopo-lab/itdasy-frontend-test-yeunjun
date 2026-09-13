# ITBI 쓰기/실행 안전 게이트 (§4 · §5 · §14)

> 2026-09-12 · 대상 BE `bbefe378` 이후 · 판정 기준: **DB 행 수·금액**(HTTP 200 아님)

## 0. 왜 격리 Postgres 인가

운영 지시: "실사용자 DB 에 쓰기 테스트를 하지 마라." 그런데 §4·§5 가 요구하는
10연타·동시 발사·재시도·잔액 음수 시도는 **실제로 써 봐야** 증명된다. 그래서 둘로 나눴다.

| 무엇 | 어디서 | 왜 |
|---|---|---|
| 확인 전 write 0 | 격리 Postgres(실제 `/assistant/ask` 라우터) | LLM 을 부르지 않고 `_sync_ask` 를 그 kind 로 고정 — 운영 쿼터 0 소모 |
| 확인 후 멱등·불변식 | 격리 Postgres(실제 `/assistant/execute` 라우터) | 운영 DB 무오염 |
| 발송 경로 | 격리 Postgres + 라이브 조회 | 실발송 0 |

- 하네스: `backend/tests/pg/` (실배포와 같은 마이그레이션 경로 · GiST EXCLUDE 포함)
- SQLite 는 쓰지 않았다 — 단일 라이터라 경합 자체가 안 생기고 부분 UNIQUE 문법이 다르다.
- **CI 의 `security-integrity-postgres` 잡에서 매 커밋 돈다**(skip 금지 게이트).

## 1. kind 전수 (코드 정본에서 추출)

`ExecuteRequest.kind` pattern 이 받는 **30 kind** = 업무 25 + 사진 5.
`test_kind_enumeration_matches_code` 가 이 목록과 코드가 어긋나면 실패한다
(새 쓰기 kind 가 게이트 없이 늘어나는 걸 막는다).

스펙의 26 kind 와의 대응: `reply_dm` 은 독립 kind 가 아니다 — DM 답장은 `send_message`
(channel=dm) 또는 DM 확인 큐로 간다. 나머지는 1:1 대응.

## 2. §4-A 확인 전 — `/ask` 는 업무 테이블을 안 건드린다

| 검사 | 결과 |
|---|---|
| 19 kind 각각 LLM 이 실행 카드를 내놔도 `/ask` 전후 **업무 테이블 행 수 변화** | **19/19 = 0** |
| 같은 19건에서 **회원권 잔액 · 원 매출 금액** 값 변화 | **0** |
| `/ask` 경로에서 `_execute_action_impl` 호출 여부(호출되면 예외) | **0회** |

허용된 증가: 대화 기록·쿼터 로그(`api_usage_logs` 등). 업무 데이터는 0.
두 방식(결과 불변 + 경로 미도달)을 둘 다 본 이유: 실행기가 불렸는데 우연히 실패해서
행이 안 늘었을 수도 있기 때문이다.

## 3. §4-C 확인 후 — 25 kind 전부 실제 실행 + 같은 키 2회

첫 회차에 **7 kind 가 4xx** 였다. 전부 "선행 데이터 없음"(서비스 미등록 · DM 로그 없음 ·
사진 없음 · 겹치는 예약)이었지 결함이 아니었다. 하지만 **4xx 로 끝나면 그 kind 의 멱등은
검증되지 않은 것이다** — 거절은 "한 번만 된다" 의 증거가 아니다. 그래서 kind 마다 선행 데이터를
실제로 만들어 넣고 다시 돌렸다.

| kind | 1회차 | 2회차(같은 키) | 1회차 업무 행 증가 | **2회차 업무 행 증가** |
|---|---|---|---|---|
| create_booking | 200 | 200 | bookings +1 | **0** |
| create_revenue | 200 | 200 | revenue_records +1 | **0** |
| create_customer | 200 | 200 | — | **0** |
| update_booking | 200 | 200 | — | **0** |
| cancel_booking | 200 | 200 | — | **0** |
| reschedule_booking | 200 | 200 | — | **0** |
| update_customer | 200 | 200 | — | **0** |
| generate_bulk_message | 200 | 200 | — (초안) | **0** |
| upsert_inventory | 200 | 200 | inventory_items +1 | **0** |
| create_expense | 200 | 200 | expense_records +1 | **0** |
| charge_membership | 200 | 200 | revenue_records +1 | **0** |
| use_membership | 200 | 200 | revenue_records +1 | **0** |
| mark_booking_no_show | 200 | 200 | — | **0** |
| mark_booking_completed | 200 | 200 | treatments +1 | **0** |
| refund_revenue | 200 | 200 | revenue_records +1 (상계행) | **0** |
| update_service_price | 200 | 200 | — | **0** |
| create_treatment_record | 200 | 200 | treatments +1 | **0** |
| add_customer_memo | 200 | 200 | customer_memos +1 | **0** |
| request_review | 200 | 200 | customer_reviews +1 | **0** |
| toggle_dm_autoreply | 200 | 200 | dm_auto_reply_settings +1 | **0** |
| toggle_automation_rule | 200 | 200 | — | **0** |
| create_booking_from_dm | 200 | 200 | bookings +1 · dm_booking_links +1 | **0** |
| draft_message | 200 | 200 | — (초안) | **0** |
| send_message | 200 | 200 | — (**mock**, 아래) | **0** |
| publish_instagram | 200 | 200 | — | **0** |

**25/25 실행 · 25/25 재전송 부작용 0.**

## 4. §5 돈 — P0 게이트

| 검사 | 기대 | 결과 |
|---|---|---|
| 돈 kind 4종 멱등키 없이 실행 | 거부 + 행 0 | **4/4 거부 · 행 0** |
| charge_membership 같은 카드 **10연타** | 잔액 +1회분 · 원장행 1 | **50,000원 · 1행** |
| charge_membership **동시 10발**(배리어) | 잔액 +1회분 | **30,000원** |
| create_revenue 10연타 | 1행 | **1행** |
| create_revenue **동시 20발** | 1행 | **1행** |
| 다른 키 2건(진짜 두 번 받음) | 2행 — 과잉 차단 없음 | **2행** |
| "커밋됐는데 응답 못 받음" 후 같은 키 3회 재시도 | 1행 | **1행** |
| 검증 실패(없는 고객) 후 같은 키로 고쳐서 재시도 | 통과 | **통과** — 실패 시 키 해제 |
| use_membership 잔액 부족 | 잔액 ≥ 0 | **10,000 유지** |
| use_membership **동시 10발 × 1만원, 잔액 3만원** | 성공 ≤ 3 · 잔액 = 3만 − 성공×1만 | **성공 ≤ 3 · 불일치 0** |
| refund_revenue 후 원 매출 | 행 존재 · 금액 불변 | **존재 · 80,000 불변** |
| refund_revenue 같은 키 5회 | 상계행 ≤ 1 | **≤ 1** |

→ **돈 P0: 0건.**

## 5. §14 테넌트 격리 (쓰기 경로)

user 1 세션이 user 2 의 고객·매출 id 를 payload 에 박아 6 kind 실행:
charge / use_membership · refund_revenue · update_customer · add_customer_memo · create_treatment_record.

| 대상 | 기대 | 결과 |
|---|---|---|
| 남의 샵 회원권 잔액 100,000 | 불변 | **불변** |
| 남의 샵 매출 70,000 | 불변 · 환불행 없음 | **불변** |
| 남의 샵 고객 메모 | 불변 | **불변** |

→ **다른 테넌트 데이터 변경 0.** (조회 경로 격리는 CI `tenant-isolation` 게이트가 매 커밋 검증 —
2026-08-20 실공격 118건 전부 차단 이후 상주)

## 6. 이번에 찾아서 고친 것 — **P1 · CASE-017~019**

위 25 kind 표를 채우다가 픽스처 하나를 틀리게 넣었는데(종료 < 시작) **500** 이 나왔다.
따라가 보니 결함이었다.

| 경로 | 입력 | 수정 전 | 수정 후 |
|---|---|---|---|
| update_booking | ends_at = 한 달 뒤 | **44,880분(748시간) 저장, 200** | 400 "최대 12시간" |
| update_booking | ends_at < starts_at | **500** | 400 "끝 시각이 앞이에요" |
| create_booking | duration_min = 100,000 | **100,000분 저장, 200** | 400 |
| create_booking_from_dm | ends_at = 한 달 뒤 | **44,640분 저장, 200** | 400 |
| create_booking_from_dm | 역전 | **500** | 400 |
| update_booking | duration_min 경로 | 400 (원래 막혀 있었음) | 400 |

**왜 P1**: `bookings` 에 GiST EXCLUDE(겹침 금지)가 있다. 한 달짜리 예약 1건이면 **그 달의 모든
예약이 거부**되고, 확인 메시지는 `(10:00~14:00)` 처럼 날짜를 빼서 4시간짜리로 보였다.
**왜 생겼나**: 프롬프트의 "ends_at 직접 계산하지 마"(부탁)가 유일한 방어였고,
REST 경로(`routers/bookings.py:137`)는 역전 검사를 **이미** 갖고 있었다 — 잇비 경로에만 빠져 있었다.
**남긴 관측(안 고침, P3)**: REST 경로에는 12시간 상한이 없다. 원장님이 시간을 직접 보면서
넣는 경로라 위험도가 다르고, 일부러 긴 예약을 쓸 수 있어 정책 결정이 필요하다.

## 7. §7 발송 — 실발송 0

- 격리 환경 `send_message` 200 은 **mock** 이다(`SMS_API_KEY` 미설정). 테스트가 `"mock"` 문자열을
  단언한다 — 이 구분이 없으면 보고서에 "발송 경로 PASS" 라고 쓰는 순간 거짓말이 된다.
- 발송 레이트리밋(사용자당 10/분 · 손님당 2/분) 존재 확인.
- 라이브 대화 결과는 `ITBI_DM_COMMENT_GATE_2026-09-12.md`.

## 8. CI 에서만 드러난 내 테스트 버그 1건

로컬 PASS · CI FAIL — naive `datetime` 이 **DB 세션 TimeZone** 으로 해석된다(노트북 KST · 러너 UTC).
payload 의 naive ISO 는 `_parse_iso` 가 항상 KST 로 읽으므로 두 해석이 9시간 어긋났고,
방금 넣은 span 가드가 **멀쩡한 픽스처를 거절**했다. tz 를 명시하고 `TZ=UTC` · `TZ=Asia/Seoul`
두 환경에서 각각 47 passed 확인.

## 판정

| 항목 | 결과 |
|---|---|
| 확인 전 DB write | **0** (19 kind · 값 불변 · 실행기 미도달) |
| 25 kind 실행 · 재전송 부작용 | **25/25 · 0** |
| 돈 P0 | **0** |
| 쓰기 테넌트 격리 | **침해 0** |
| 발견·수정 | P1 1묶음(CASE-017~019) |
| 남은 것 | P3 1(REST 12시간 상한 정책 미정) |
