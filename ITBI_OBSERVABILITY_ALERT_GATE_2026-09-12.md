# ITBI 운영 관측 · 자동 알림 게이트 (§8 · §9)

> 2026-09-12~13 · 근거: **실제 Cloud Logging** (`gcloud logging read`) — 합성 로그 아님

## 1. 실제 로그로 돌린 `itbi_report.py` (30시간 · 309 레코드)

```
ITBI_TOTAL_TURNS            299
ANSWER_SUCCESS_RATE         97.7%   (292)
FALLBACK_RATE               2.3%    (7)     ← HTTP 200 인데 답을 못 준 것
ERROR_RATE                  0.0%    (0)
USER_REPORT_RATE            0.3%    (1)
P50/P95/P99_LATENCY         95 / 4721 / 5942 ms
RECOMMENDATION_EMPTY_RATE   9.6%            (추천칩 0개로 끝난 턴)
RECOMMENDATION_FAILURE_RATE 0.0%    (0/110 칩 클릭 턴)
RECOMMENDATION_DEADEND_RATE 35.5%           (칩을 눌렀는데 다음 칩이 0개)
TURN_ORIGIN                 chip 110 / typed 80 / 미표기 109

경로별 비성공률    readonly 192건 3.6% · llm 58건 0.0% · client 49건 0.0%
fallback 사유      ambiguous_entity (동명이인 되묻기 — 정상 동작)
q_fp 실패 묶음     "[NAME]님 마지막 방문 언제야?" ×4 · "[NAME]님 알러지 메모 있어?" ×2 · "그 고객 메모 [NAME]?" ×1
```

- "미표기 109" 는 `via` 필드 배포(5eb9b244) **이전** 턴이다 — 결함 아님.
- readonly 비성공 3.6% 전부 동명이인 되묻기(`ambiguous_entity`) · 선행어 없음(`context_missing`).
  **잘못 답한 게 아니라 되물은 것**이다. 스펙이 요구하는 동작이다.
- P95 4.7초 = LLM 경로. readonly P50 은 100ms 대.

## 2. 이벤트 실적재 여부 (§8 요구 목록)

| 이벤트 | 실제 로그 | 비고 |
|---|---|---|
| readonly ok | ✅ 180+ | |
| client ok (FE 지름길) | ✅ 49 | `handled_by` 포함 |
| llm ok | ✅ 58 | 수정 후 `intent="llm_freeform"` |
| fallback | ✅ 7 | |
| ambiguous_entity | ✅ `entity_ambiguous` 이벤트 | |
| context_missing | ✅ | |
| user_report | ✅ 1 | 이전 게이트에서 trace 포함 확인 |
| recommendation_click | ✅ **via=chip 110** | 🆕 이번에 원천 데이터 신설 |
| entity_not_found | 🟡 코드 존재 · 이번 창에 0 | "김호영님"(cbt4 에 없음) 응답은 확인했으나 해당 턴은 readonly `ok` 로 기록 |
| unsupported_capability | 🟡 코드 존재 · 이번 창에 0 | |
| model_timeout / tool_error / network_error / client_render_error | 🟡 **로그 0 · 주입 테스트로만 확인** | 운영에 실제로 안 났다. 운영 Vertex 를 일부러 타임아웃시키지 않았다(공용 쿼터) |

## 3. 찾아서 고친 것

### CASE-024 (P2) — 사진 경로 관측 0곳
`/ask/image`·`/ask/images` 에 emit 이 한 곳도 없었다. → 상세 `ITBI_IMAGE_GATE_2026-09-12.md`

### §8 원천 데이터 — 추천칩 클릭이 직접 입력과 구분이 안 됐다
칩은 입력창을 채우고 `send()` 를 부르므로 서버에서 보면 똑같은 한 줄이었다.
그래서 RECOMMENDATION_FAILURE_RATE 를 **계산할 방법 자체가 없었다.**
`via`(chip|typed) 를 FE→`/ask`·`/client-event` 로 싣고 보고서에 3지표 추가.
표식은 1회용 — 안 지우면 칩 한 번 뒤의 직접 입력까지 chip 으로 세어 **지표가 스스로를 속인다.**

### 오경보 — 배포 첫날 경보 3건이 전부 가짜였다
```
[ITBI_ALERT] 🟠 unknown_intent — 25건/60분 · 예시(마스킹): "인스타 연동은 어떻게 해?"
[ITBI_ALERT] 🟠 unknown_intent — 10건/60분 · 예시(마스킹): "이번 달 매출 얼마야?"
```
두 예시 모두 **정상 처리된 턴**이다(LLM 정상 답 · FE 지름길 정상 처리). 규칙이 "intent 라벨 없음" 을
"못 알아들음" 으로 셌다. 내 모듈 머리말에 "경보가 시끄러우면 아무도 안 본다" 라고 적어 놓고
그대로 만들었다. → `fallback_reason=unknown_intent` 만 센다. 수정 배포(75a1c150).

**설계가 제대로 작동한 증거이기도 하다**: 경보 본문의 q_fp·마스킹 예시·로깅 쿼리만 보고
로그를 따로 안 뒤지고 오경보를 판정했다.

## 4. §9 자동 알림 — 구현 · 연결 · 실발화

| 요구 | 구현 | 상태 |
|---|---|---|
| 채널 | Discord `DISCORD_ALERT_WEBHOOK`(기존 시크릿 재사용) + 항상 `[ITBI_ALERT]` warning 로그 | ✅ |
| 1시간 ERROR_RATE > 3% | `error_rate` (표본 20 미만이면 안 울림) | ✅ |
| 1시간 FALLBACK_RATE > 20% | `fallback_rate` | ✅ |
| 10분 model_timeout ≥ 3 | `model_timeout` | ✅ |
| PII 감지 ≥ 1 | `pii_leak` — `sanitize()` **뒤** 문자열 재검사 · 🔴 P0 | ✅ |
| user_report ≥ 3/시간 | `user_report` | ✅ |
| recommendation_failure ≥ 5/시간 | `recommendation_fail` | ✅ |
| unknown_intent spike | `unknown_intent` ≥ 10/시간 (수정 후 진짜 실패만) | ✅ |
| 돈·쓰기 경로 예외 ≥ 1 | `money_write_error` — `/execute`·돈 kind 만 · 🔴 P0 | ✅ |
| 원문 메시지 미포함 | 마스킹 예시만 · **pii_leak 경보엔 예시 자체를 안 싣는다** | ✅ 테스트 |
| env · sha · metric · 건수/비율 · q_fp · 로깅 쿼리 · 런북 | 전부 포함 | ✅ 테스트 |
| 쿨다운 | 지표당 1시간 1회 | ✅ |
| **운영 실발화** | **3건 발화** (오경보였고 교정함) | ✅ 실제로 울린다는 증명 |

### 크론을 쓰지 않은 이유 — 오늘 증명됨
2026-08-20 에 5분 주기 Actions 크론 하나가 월 ~1,410분을 먹어 계정 Actions 가 통째로 정지됐다.
그리고 **이번 게이트 도중 실제로 Actions 가 결제 한도로 멈췄다**(05:28~05:53 KST 사이 시작,
"recent account payments have failed"). 크론 기반 경보였다면 그 시간 동안 경보도 같이 죽었다.
emit 경로에 얹은 이 방식은 Actions 와 무관하게 계속 돌았다.

### 정직한 한계
Cloud Run 인스턴스가 여러 개(max 5)라 카운터는 **인스턴스 하나의 표본**이다.
건수 경보는 보수적(실제는 그 이상) · 비율 경보는 부분 표본 기준. 전체 기준 정확한 비율이
필요하면 로그기반 지표로 올리는 명령을 RUNBOOK §10-4 에 적어 뒀다(권한자 1회 실행, **미실행**).

## 5. 판정

| 항목 | 결과 |
|---|---|
| 로그 실적재 | ✅ |
| report 스크립트 실데이터 실행 | ✅ |
| fallback 분리 | ✅ |
| user_report · trace_json | ✅ (이전 게이트 검증 유지) |
| 자동 알림 연결 · 실발화 | ✅ (오경보 1종 교정) |
| 장애형 이벤트 4종 운영 실적재 | 🟡 **주입 테스트만** — 운영에 실제로 안 났다 |
